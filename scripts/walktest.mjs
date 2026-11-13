// 開發用：自動行走測試，驗證樓梯、門口與碰撞是否可通行（需先啟動 npm run dev）
import { chromium } from 'playwright-core';

const URL = process.env.GAME_URL || 'http://localhost:5173/?auto&map=temple';
const browser = await chromium.launch({
  channel: process.env.BROWSER || 'chrome', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL);
await page.waitForFunction(() => window.__game?.map && window.__game.running, null, { timeout: 180000 });

// [名稱, 起點 x,y,z, 一連串 [yaw(度), 秒數], 期望條件]
const TESTS = [
  ['參道→山門→廟埕→石階→前廊', [1.9, null, 46], [[0, 26]], (p) => p.y > 0.85 && p.z < -8 && p.z > -12.5],
  ['正門進入大殿', [-0.6, 0.9, -9], [[0, 5]], (p) => p.z < -15 && p.y > 0.85],
  ['樓梯 1F→2F', [-16.1, 0.9, -28.6], [[180, 9]], (p) => Math.abs(p.y - 6.9) < 0.05 && p.z > -17],
  ['樓梯 2F→3F', [13.5, 6.9, -17.2], [[0, 9]], (p) => Math.abs(p.y - 11.9) < 0.05 && p.z < -26.5],
  ['樓梯 3F→4F露台', [-9.6, 11.9, -28.65], [[-90, 9]], (p) => Math.abs(p.y - 16.9) < 0.05 && p.x > 0],
  ['露台繞行→四樓門口', [1, 16.9, -28.6], [[-90, 6.5], [180, 6], [90, 6.2], [0, 3]], (p) => Math.abs(p.y - 16.9) < 0.05 && p.z < -19.6 && Math.abs(p.x) < 2.5],
  ['下樓梯 2F→1F', [-16.1, 6.9, -16.2], [[0, 9]], (p) => Math.abs(p.y - 0.9) < 0.05 && p.z < -27],
  ['圍牆缺口→亂葬崗', [-24, null, 0], [[90, 12]], (p) => p.x < -42],
  ['台基邊緣不可直接爬上', [-26, null, -20], [[-90, 4]], (p) => p.y < 0.2 && p.x < -22.5],
  ['圍牆不可穿越', [20, null, 10], [[-90, 8]], (p) => p.x < 30],
  ['二樓欄杆不會掉下樓梯口', [-13, 6.9, -22], [[90, 4]], (p) => Math.abs(p.y - 6.9) < 0.05 && p.x > -15.3],
  ['露台欄杆不會掉出去', [0, 16.9, -17.6], [[180, 4]], (p) => Math.abs(p.y - 16.9) < 0.05 && p.z < -16],
  ['廟埕→古戲台低階', [23, 0.02, 5], [[0, 2.1]], (p) => Math.abs(p.y - 0.58) < 0.05 && p.z < 1],
  ['古戲台→廟埕可返回', [23, 0.58, 1.6], [[180, 2.1]], (p) => p.y < 0.1 && p.z > 5],
  ['地下室回程通道暢通', [55, -7, -20], [[-90, 1.1], [180, 3], [90, 1.1]], (p) => Math.abs(p.y + 7) < 0.05 && p.z > -14.5 && Math.abs(p.x-55)<0.5],
];

let fail = 0;
for (const [name, start, legs, ok] of TESTS) {
  const p = await page.evaluate(([start, legs]) => {
    const g = window.__game;
    g.stop();
    const pl = g.player, w = g.map.world;
    pl.fly = false;
    const y = start[1] === null ? w.probe(start[0], start[2], 1.5).g : start[1];
    pl.teleport(start[0], y, start[2], 0, 0);
    pl.onGround = true;
    for (const [yaw, secs] of legs) {
      pl.yaw = (yaw * Math.PI) / 180;
      pl.keys = { KeyW: true };
      for (let i = 0; i < secs * 60; i++) pl.update(1 / 60, w);
    }
    pl.keys = {};
    return { x: pl.pos.x, y: pl.pos.y, z: pl.pos.z };
  }, [start, legs]);
  const pass = ok(p);
  if (!pass) fail++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  → (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})`);
}
if (errors.length) console.log('errors:', errors.join('\n'));
console.log(fail ? `${fail} 項失敗` : '全部通過');
await browser.close();
process.exit(fail ? 1 : 0);
