// dread：把寺內各樓層的可走區域印成文字地圖（設計段落的路徑點與躲藏點用）。
// 用法：node scripts/dread-map.mjs [樓層 0..3]
import fs from 'node:fs';
import { launch, enter } from './horror-lib.mjs';

const floors = process.argv[2] ? [Number(process.argv[2])] : [0, 1, 2];
const { browser, page } = await launch();
try {
  await enter(page, 'temple');
  const out = await page.evaluate((floors) => {
    const g = window.__game, w = g.map.world;
    const F = [{ y: 0.9, x1: -20, x2: 20, z1: -34, z2: -8 }, { y: 6.9, x1: -17.5, x2: 17.5, z1: -32, z2: -14 }, { y: 11.9, x1: -15, x2: 15, z1: -30, z2: -16 }, { y: 16.9, x1: -10, x2: 10, z1: -30, z2: -16 }];
    const T = g.map.storyWorld.targets;
    const res = [];
    for (const f of floors) {
      const L = F[f], step = 0.5, lines = [];
      let head = '      ';
      for (let x = L.x1; x <= L.x2; x += step) head += (Math.round(x) === x && Math.round(x) % 5 === 0) ? '|' : ' ';
      lines.push(head);
      for (let z = L.z1; z <= L.z2; z += step) {
        let row = (z.toFixed(1)).padStart(6);
        for (let x = L.x1; x <= L.x2; x += step) {
          const pr = w.probe(x, z, L.y);
          let ch = '.';
          if (pr.blocked) ch = 'X';
          else if (Math.abs(pr.g - L.y) > 0.5) ch = pr.g > L.y ? '^' : 'v';
          else { const p = { x, z }; w.resolve(p, 0.3, pr.g); if (Math.abs(p.x - x) + Math.abs(p.z - z) > 0.05) ch = '#'; }
          for (const t of T) if (Math.abs(t.position.y - L.y - 1) < 1.5 && Math.abs(t.position.x - x) < 0.25 && Math.abs(t.position.z - z) < 0.25) ch = 'T';
          row += ch;
        }
        lines.push(row);
      }
      res.push(`FLOOR ${f + 1} y=${L.y}\n` + lines.join('\n'));
    }
    return res.join('\n\n');
  }, floors);
  fs.mkdirSync('artifacts/dread', { recursive: true });
  fs.writeFileSync('artifacts/dread/map.txt', out);
  console.log(out);
} finally { await browser.close(); }
