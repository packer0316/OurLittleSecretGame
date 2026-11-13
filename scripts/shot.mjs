// 開發用：以無頭瀏覽器載入地圖並在指定視角截圖
// 用法: node scripts/shot.mjs <輸出資料夾> [視角名稱...]   （需先啟動 npm run dev）
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const outDir = process.argv[2] || 'shots';
const only = process.argv.slice(3);
const URL = process.env.GAME_URL || 'http://localhost:5173/?auto&map=temple';
fs.mkdirSync(outDir, { recursive: true });

// [名稱, x, y(null=貼地), z, yaw(度), pitch(度), 全亮, 手電筒]
const VIEWS = [
  ['01_spawn', 0, null, 49, 0, 6, false, true],
  ['02_gate', 0, null, 30, 0, 14, false, true],
  ['03_courtyard', 0, null, 18, 0, 18, false, true],
  ['04_facade_bright', 0, null, 20, 0, 22, true, false],
  ['05_overview_bright', 46, 30, 44, 42, -24, true, false],
  ['06_porch', 0, null, -9.5, 0, 5, false, true],
  ['07_hall1', 0, 0.9, -16, 0, 6, false, true],
  ['08_hall1_altar', 0, 0.9, -24.5, 0, 16, false, true],
  ['09_hall1_bright', 6, 0.9, -15, 20, 6, true, false],
  ['10_arhats', 14, 0.9, -22, -70, 4, false, true],
  ['11_stair1', -16.1, 0.9, -28.5, 180, 20, false, true],
  ['12_hall2', -13, 6.9, -16, -70, 2, false, true],
  ['13_hall2_tiers', 0, 6.9, -27.5, 20, 0, false, true],
  ['14_hall2_bright', -12, 6.9, -16, -60, 4, true, false],
  ['15_hall3', 12, 11.9, -28.3, 75, 2, false, true],
  ['16_hall3_bright', 12, 11.9, -17.5, 60, 4, true, false],
  ['17_terrace', 6, 16.9, -28.6, -90, 0, false, true],
  ['18_terrace_west', -13, 16.9, -22, 90, -12, false, false],
  ['19_hall4_door', 0, 16.9, -17.3, 0, 4, false, true],
  ['20_hall4', 0.6, 16.9, -20.6, 0, 6, false, true],
  ['21_hall4_bright', 7, 16.9, -20.3, 60, 6, true, false],
  ['22_graveyard', -36, null, 0, 90, 2, false, true],
  ['23_graveyard2', -50, null, 4, 60, 4, false, true],
  ['24_graveyard_bright', -38, null, 14, 100, 6, true, false],
  ['25_pit', -44, null, 7, 110, -22, false, true],
  ['26_temple_from_graveyard', -52, null, 20, -110, 16, false, false],
  ['27_shrine', -33.5, null, 6.5, 90, 0, false, true],
  ['28_buddha_close', 0, 0.9, -27.0, 0, 32, true, false],
];

const browser = await chromium.launch({
  channel: process.env.BROWSER || 'chrome',
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${e.stack || ''}`));
await page.goto(URL);
try {
  await page.waitForFunction(() => window.__game?.map && window.__game.running, null, { timeout: 180000 });
} catch (e) {
  console.log('載入逾時');
  console.log(await page.evaluate(() => document.getElementById('loading-label')?.textContent));
  console.log(errors.join('\n'));
  await page.screenshot({ path: path.join(outDir, '00_fail.png') });
  await browser.close();
  process.exit(1);
}
await page.waitForTimeout(1500);
const info = await page.evaluate(() => {
  const g = window.__game, i = g.renderer.info;
  const gl = g.renderer.getContext();
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  return { fps: g.fps, calls: i.render.calls, tris: i.render.triangles, geoms: i.memory.geometries, tex: i.memory.textures, gpu: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '?' };
});
console.log('renderer', JSON.stringify(info));

for (const [name, x, y, z, yaw, pitch, bright, flash] of VIEWS) {
  if (only.length && !only.some((o) => name.includes(o))) continue;
  await page.evaluate(([x, y, z, yaw, pitch, bright, flash]) => {
    const g = window.__game;
    const fly = y !== null && y > 25;
    g.player.fly = fly;
    const gy = y === null ? g.map.world.probe(x, z, 1.5).g : y;
    g.player.teleport(x, gy, z, (yaw * Math.PI) / 180, (pitch * Math.PI) / 180);
    g.player.flashOn = flash;
    g.map.setFullBright(bright);
  }, [x, y, z, yaw, pitch, bright, flash]);
  await page.waitForTimeout(900);
  const stat = await page.evaluate(() => {
    const g = window.__game;
    return `${g.fps.toFixed(0)}fps ${g.renderer.info.render.calls}calls ${(g.renderer.info.render.triangles / 1000).toFixed(0)}k`;
  });
  await page.screenshot({ path: path.join(outDir, `${name}.jpg`), type: 'jpeg', quality: 82 });
  console.log(name, stat);
}
if (errors.length) console.log('--- console ---\n' + [...new Set(errors)].slice(0, 30).join('\n'));
await browser.close();
