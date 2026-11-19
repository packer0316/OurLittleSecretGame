// 診斷用：重現 walktest 第一條路線（參道→前廊），每秒印出位置，找出在哪裡被拖慢。
// 用法：node scripts/art-walktrace.mjs [額外網址參數，例如 artoff]
import { chromium } from 'playwright-core';
const extra = process.argv[2] ? '&' + process.argv[2] : '';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://127.0.0.1:5178/?auto&map=temple' + extra);
await page.waitForFunction(() => window.__game?.map && window.__game.running, null, { timeout: 240000 });
const out = await page.evaluate(() => {
  const g = window.__game; g.stop();
  const pl = g.player, w = g.map.world, rows = [];
  pl.fly = false;
  pl.teleport(1.9, w.probe(1.9, 46, 1.5).g, 46, 0, 0); pl.onGround = true; pl.yaw = 0; pl.keys = { KeyW: true };
  for (let s = 0; s < 34; s++) { for (let i = 0; i < 60; i++) pl.update(1 / 60, w); rows.push([s + 1, +pl.pos.x.toFixed(2), +pl.pos.y.toFixed(2), +pl.pos.z.toFixed(2)]); }
  pl.keys = {};
  const near = (x, z, r) => ({ boxes: w.boxes.filter((b) => !b.disabled && x > b.x1 - r && x < b.x2 + r && z > b.z1 - r && z < b.z2 + r && b.y1 < 1.7 && b.y2 > 0.4).map((b) => [b.x1, b.z1, b.x2, b.z2].map((v) => +v.toFixed(2))), circles: w.circles.filter((c) => Math.hypot(c.x - x, c.z - z) < c.r + r && c.y1 < 1.7 && c.y2 > 0.4).map((c) => [+c.x.toFixed(2), +c.z.toFixed(2), +c.r.toFixed(2)]) });
  return { rows, gate: near(1.6, 21.5, 0.8), lamp: near(1.9, 13, 0.6) };
});
let prev = 46;
for (const [s, x, y, z] of out.rows) { console.log(String(s).padStart(2), 'x', x, 'y', y, 'z', z, 'Δz', (prev - z).toFixed(2)); prev = z; }
console.log('山門附近的碰撞', JSON.stringify(out.gate));
console.log('廟埕燈座附近的碰撞', JSON.stringify(out.lamp));
await browser.close();
