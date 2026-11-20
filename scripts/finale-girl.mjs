// finale：門後的小雨在手電筒與餘燼光下的近看檢查（0.8 m、1.5 m、3 m），以及抬頭、站起來、擁抱。輸出 artifacts/finale/girl-*.jpg
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const out = 'artifacts/finale'; fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = []; page.on('pageerror', (e) => errors.push(e.stack || e.message));
// [名稱, 段落, 快轉秒數, 鏡頭距離（公尺，沿著孩子→玩家的方向）, 眼睛高度修正, 額外程式]
const SHOTS = [
  ['girl-3m-hug', 'c-girl', 0.4, 3.0, 0, ''],
  ['girl-1.5m-hug', 'c-girl', 0.4, 1.5, 0, ''],
  ['girl-0.8m-hug', 'c-girl', 0.4, 0.8, -0.45, ''],
  ['girl-1.5m-lookup', 'c-girl', 4.0, 1.5, 0, ''],
  ['girl-0.8m-lookup', 'c-girl', 4.0, 0.8, -0.5, ''],
  ['girl-3m-lookup', 'c-girl', 4.0, 3.0, 0, ''],
  ['girl-1.5m-stand', 'c-mother', 3.0, 1.6, 0, 'p.yaw+=0'],
  ['girl-embrace-side', 'c-mother', 14.5, 0, 0, ''],
];
try {
  await page.goto('http://127.0.0.1:5178/?auto&map=temple');
  await page.waitForFunction(() => window.__game?.running && window.__game.story, null, { timeout: 240000 });
  for (let i = 0; i < 30; i++) { if (await page.evaluate(() => window.__game.story.modal?.options.length) !== 1) break; await page.evaluate(() => window.__game.story.choose(0)); }
  for (const [name, phase, run, dist, dy, js] of SHOTS) {
    const st = await page.evaluate(([phase, run, dist, dy, js]) => {
      const g = window.__game, s = g.story, p = g.player;
      for (const id of ['diary', 'newspaper', 'tape', 'ritual', 'stage', 'death', 'births', 'relic', 'names', 'confession']) s.collect(id);
      Object.assign(s.state.flags, { incense: true, stage: true, loopSolved: true, key: true, underground: true }); s.state.chapter = 4; s.sync();
      if (!s.finale) { s.prepareRitual(); s.choose(0); }
      s.finale.restore(); s.finale.debug.to(phase);
      const S = g.map.storyWorld.finale, c = S.child.root.position;
      if (dist > 0) { // 在孩子正前方偏右一點，距離 dist，看著她的頭
        const ax = 0.35, az = 1; const L = Math.hypot(ax, az); const x = c.x + ax / L * dist, z = c.z + az / L * dist;
        p.teleport(x, -7, z, 0, 0); const hy = -7 + (S.child.rise > 0.5 ? 1.0 : 0.55); const yaw = Math.atan2(-(c.x - x), -(c.z - z));
        p.yaw = yaw; p.pitch = Math.atan2(hy - (-7 + 1.66 + dy), dist); s.finale.debug.flags.cam = null; p.eye = 1.66 + dy; s.finale.debug.flags.eye = 1.66 + dy;
      }
      s.finale.debug.run(run);
      if (js) (new Function('g', 's', 'p', js))(g, s, p);
      return { phase: s.finale.debug.phase, child: [c.x.toFixed(2), c.z.toFixed(2)], look: S.child.look.toFixed(2), rise: S.child.rise };
    }, [phase, run, dist, dy, js]);
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${out}/${name}.jpg`, type: 'jpeg', quality: 88 });
    console.log(name, JSON.stringify(st));
  }
} catch (e) { errors.push(e.stack || String(e)); }
finally { console.log('ERRORS', JSON.stringify(errors)); await browser.close(); }
