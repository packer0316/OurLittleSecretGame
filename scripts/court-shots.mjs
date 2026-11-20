// 庭院組（court）：慈雲寺山門與廟埕的固定鏡位截圖，前後對照構圖、雜物與效能。
// 用法：node scripts/court-shots.mjs <標籤> [鏡位名稱片段…]
//   輸出到 artifacts/court/<標籤>/<鏡位>.jpg，並印出每個鏡位的三角形數與 draw call。
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const label = process.argv[2] || 'shots';
const only = process.argv.slice(3);
const ORIGIN = process.env.GAME_ORIGIN || 'http://127.0.0.1:5178';
const outDir = path.join('artifacts/court', label);
fs.mkdirSync(outDir, { recursive: true });

// [名稱, x, y(null=貼地), z, yaw(度), pitch(度), 手電筒, 全亮]
const VIEWS = [
  ['01_gate_out', 0, null, 30, 0, 10, true],
  ['02_gate_in', 0.4, null, 21.2, 0, 2, true],
  ['03_center', 2.6, null, 13.5, 8, 0, true],
  ['04_center_dark', 2.6, null, 13.5, 8, 0, false],
  ['05_burner', 1.5, null, 10.3, 25, -24, true],
  ['06_porch_back', 0, 0.9, -9.6, 180, -3, false],
  ['07_porch_back_flash', 0, 0.9, -9.6, 180, -3, true],
  ['08_west', 8, null, 12, -62, 2, true],
  ['09_overview_bright', 0, 22, 30, 0, -38, false, true],
  ['10_gate_bright', 0.4, null, 20.5, 0, -6, false, true],
  ['11_upstairs_safe', -5.6, 6.9, -18.6, 125, -16, true],
  ['12_upstairs_safe_bright', -5.6, 6.9, -18.6, 125, -16, false, true],
  ['13_gate_inner_left', 1.5, null, 16.5, 138, 0, true],
  ['14_gate_inner_left_bright', 1.5, null, 16.5, 138, 0, false, true],
  ['15_stage_bright', 23, 0.58, 2.6, 0, -18, false, true],
  ['16_corner_sw_bright', -12, null, 10, -135, -4, false, true],
];

const browser = await chromium.launch({
  channel: process.env.BROWSER || 'chrome', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=no-user-gesture-required'],
});
const errors = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
await page.goto(`${ORIGIN}/?auto&map=temple`);
await page.waitForFunction(() => window.__game?.map && window.__game.running, null, { timeout: 240000 });
await page.addStyleTag({ content: 'body > *:not(#game) { display: none !important; }' });
// 整張地圖的靜態統計（所有網格，不分可見與否）
const total = await page.evaluate(() => {
  const g = window.__game; let tris = 0, meshes = 0;
  g.map.scene.traverse((o) => {
    if (!o.isMesh && !o.isSprite) return; meshes++;
    if (!o.isMesh) return;
    const geo = o.geometry, n = geo.index ? geo.index.count : geo.attributes.position?.count || 0;
    tris += (n / 3) * (o.isInstancedMesh ? o.count : 1);
  });
  return { tris: Math.round(tris), meshes, lights: g.map.lights.length, flames: g.map.flames.length, boxes: g.map.world.boxes.length, circles: g.map.world.circles?.length ?? -1 };
});
console.log('整張地圖', JSON.stringify(total));
await page.evaluate(() => { const g = window.__game; g.stop(); });
await page.waitForTimeout(800);
const rows = [];
for (const [name, x, y, z, yaw, pitch, flash, bright] of VIEWS) {
  if (only.length && !only.some((o) => name.includes(o))) continue;
  const stat = await page.evaluate(([x, y, z, yaw, pitch, flash, bright]) => {
    const g = window.__game;
    const gy = y === null ? g.map.world.probe(x, z, 1.5).g : y;
    g.player.teleport(x, gy, z, (yaw * Math.PI) / 180, (pitch * Math.PI) / 180);
    g.player.flashOn = flash && g.player.flashAvailable !== false; g.player.flashPower = 1;
    g.map.setFullBright(!!bright);
    for (let i = 0; i < 4; i++) { g.map.update(0.1, g.time += 0.1, g.player); }
    g.renderer.info.reset(); g.renderer.info.autoReset = false;
    g.renderOnce();
    const info = { tris: g.renderer.info.render.triangles, calls: g.renderer.info.render.calls };
    g.renderer.info.autoReset = true;
    g.renderOnce();
    return info;
  }, [x, y, z, yaw, pitch, flash, !!bright]);
  await page.locator('#game').screenshot({ path: path.join(outDir, `${name}.jpg`), type: 'jpeg', quality: 86 });
  rows.push({ name, ...stat });
  console.log(name.padEnd(26), `三角形 ${String(stat.tris).padStart(8)}  draw calls ${String(stat.calls).padStart(4)}`);
}
await page.evaluate(() => { const g = window.__game; g.map.setFullBright(false); });
fs.writeFileSync(path.join(outDir, 'stats.json'), JSON.stringify({ total, rows }, null, 2));
if (errors.length) console.log('--- console ---\n' + [...new Set(errors)].slice(0, 20).join('\n'));
await browser.close();
