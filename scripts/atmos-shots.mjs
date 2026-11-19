// 氣氛組（atmos）：三張地圖的固定鏡位截圖，用來前後對照燈光、霧與後製。
// 用法：node scripts/atmos-shots.mjs <標籤> [temple|home|road|all] [鏡位名稱片段…]
//   輸出到 artifacts/atmos/<標籤>/<地圖>_<鏡位>.jpg，並印出每張圖的平均亮度與暗部比例。
//   環境變數：FX="dread=1,glitch=0.8,pulse=1" 強制後製強度；QUALITY=low|medium|high；RELEASED=1 模擬真結局後。
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const label = process.argv[2] || 'shots';
const which = process.argv[3] || 'all';
const only = process.argv.slice(4);
const ORIGIN = process.env.GAME_ORIGIN || 'http://127.0.0.1:5178';
const outDir = path.join('artifacts/atmos', label);
fs.mkdirSync(outDir, { recursive: true });
const FX = Object.fromEntries((process.env.FX || '').split(',').filter(Boolean).map((s) => s.split('=')).map(([k, v]) => [k, +v]));

// [名稱, x, y(null=貼地), z, yaw(度), pitch(度), 手電筒]
const VIEWS = {
  temple: [
    ['01_spawn', 0, null, 49, 0, 6, true],
    ['02_gate', 0, null, 30, 0, 14, true],
    ['03_courtyard', 0, null, 18, 0, 18, true],
    ['04_courtyard_dark', 0, null, 18, 0, 18, false],
    ['05_porch', 0, null, -9.5, 0, 5, true],
    ['06_hall1', 0, 0.9, -16, 0, 6, true],
    ['07_hall1_dark', 0, 0.9, -16, 0, 6, false],
    ['08_altar', 0, 0.9, -24.5, 0, 16, true],
    ['09_arhats', 14, 0.9, -22, -70, 4, true],
    ['10_stair1', -16.1, 0.9, -28.5, 180, 20, true],
    ['11_hall2', -13, 6.9, -16, -70, 2, true],
    ['12_hall2_dark', -13, 6.9, -16, -70, 2, false],
    ['13_hall3', 12, 11.9, -28.3, 75, 2, true],
    ['14_terrace', 6, 16.9, -28.6, -90, 0, true],
    ['15_hall4', 0.6, 16.9, -20.6, 0, 6, true],
    ['16_graveyard', -36, null, 0, 90, 2, true],
    ['17_graveyard_dark', -36, null, 0, 90, 2, false],
    ['18_pit', -44, null, 7, 110, -22, true],
    ['19_temple_from_grave', -52, null, 20, -110, 16, false],
    ['20_stage', 17, null, 3, -45, 4, true],
    ['21_crypt', 55, -7, -13.5, 0, 2, true],
    ['22_crypt_dark', 55, -7, -13.5, 0, 2, false],
  ],
  home: [
    ['01_desk', 0, 0, -0.5, 0, -20, false],
    ['02_window', 2, 0, -1.6, 27, 6, false],
    ['03_room_wide', 2.8, 0, 2.6, 40, -8, false],
    ['04_door', 1.2, 0, 1.2, -170, -5, false],
    ['05_sofa', 0.4, 0, 0.2, 90, -10, false],
  ],
  road: [
    ['01_spawn', -1.2, 0, 33.2, 0, -2, true],
    ['02_bus', -2, 0, 25.5, 41, 2, true],
    ['03_bridge', 0, 0, 15, 0, 0, true],
    ['04_street', 0, 0, 5, 0, 2, true],
    ['05_street_dark', 0, 0, 5, 0, 2, false],
    ['06_workshop_out', 8.5, 0, -10.5, 0, 4, true],
    ['07_workshop_in', 8.5, 0.12, -15.6, 0, -8, true],
    ['08_workshop_in_dark', 8.5, 0.12, -15.6, 0, -8, false],
    ['09_furnace', 8.9, 0.12, -19.7, 50, -4, true],
    ['10_gate', 0, 0, -29, 0, 6, true],
    ['11_back', 0, 0, -8, 180, 0, false],
  ],
};

// VIEW="名稱,x,y,z,yaw,pitch,手電筒(0/1)"：臨時加一個鏡位（y 留空 = 貼地）
if (process.env.VIEW) { const [n, x, y, z, yaw, pitch, fl] = process.env.VIEW.split(','); for (const k of Object.keys(VIEWS)) VIEWS[k].push([n, +x, y === '' ? null : +y, +z, +yaw, +pitch, fl !== '0']); }
const browser = await chromium.launch({
  channel: process.env.BROWSER || 'chrome', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=no-user-gesture-required'],
});
const errors = [];
for (const map of which === 'all' ? ['home', 'road', 'temple'] : [which]) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${map}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${map}] [pageerror] ${e.message}`));
  await page.goto(`${ORIGIN}/?auto&map=${map}`);
  try {
    await page.waitForFunction(() => window.__game?.map && window.__game.running, null, { timeout: 240000 });
  } catch {
    console.log(map, '載入逾時', await page.evaluate(() => document.getElementById('loading-label')?.textContent));
    console.log(errors.join('\n'));
    await page.close();
    continue;
  }
  await page.addStyleTag({ content: 'body > *:not(#game) { display: none !important; }' });
  await page.evaluate(([fx, quality, released, code]) => {
    const g = window.__game;
    if (quality) g.applySettings({ quality });
    if (released && g.story) { g.story.state.flags.sent = true; g.story.sync?.(); }
    if (code) new Function('g', code)(g); // EVAL：截圖前執行的除錯程式碼（g = window.__game）
    // 恐怖導演可能每幀改寫這些值，截圖時直接鎖住
    for (const [k, v] of Object.entries(fx)) if (g.film.uniforms[k]) Object.defineProperty(g.film.uniforms[k], 'value', { get: () => v, set() {}, configurable: true });
  }, [FX, process.env.QUALITY || '', !!process.env.RELEASED, process.env.EVAL || '']);
  await page.waitForTimeout(1200);
  for (const [name, x, y, z, yaw, pitch, flash] of VIEWS[map]) {
    if (only.length && !only.some((o) => name.includes(o))) continue;
    await page.evaluate(([x, y, z, yaw, pitch, flash]) => {
      const g = window.__game;
      const gy = y === null ? g.map.world.probe(x, z, 1.5).g : y;
      g.player.teleport(x, gy, z, (yaw * Math.PI) / 180, (pitch * Math.PI) / 180);
      g.player.flashOn = flash && g.player.flashAvailable !== false;
      g.__flashWant = flash;
    }, [x, y, z, yaw, pitch, flash]);
    await page.waitForTimeout(1100);
    const stat = await page.evaluate(() => {
      const g = window.__game;
      if (g.__flashWant) { g.player.flashOn = true; g.player.flashPower = 1; }
      g.renderOnce();
      // 讀回畫面：平均亮度、幾乎全黑（< 6/255）的比例、看得出東西（> 20/255）的比例
      const src = g.renderer.domElement, c = document.createElement('canvas');
      c.width = 160; c.height = 90;
      const cx = c.getContext('2d'); cx.drawImage(src, 0, 0, 160, 90);
      const d = cx.getImageData(0, 0, 160, 90).data;
      let sum = 0, black = 0, lit = 0;
      for (let i = 0; i < d.length; i += 4) { const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; sum += l; if (l < 6) black++; if (l > 20) lit++; }
      const n = d.length / 4;
      return { mean: sum / n, black: black / n, lit: lit / n, fps: g.fps, calls: g.renderer.info.render.calls };
    });
    await page.locator('#game').screenshot({ path: path.join(outDir, `${map}_${name}.jpg`), type: 'jpeg', quality: 86 });
    console.log(`${map}_${name}`.padEnd(30), `平均亮度 ${stat.mean.toFixed(1).padStart(5)}/255  全黑 ${(stat.black * 100).toFixed(0).padStart(3)}%  可辨識 ${(stat.lit * 100).toFixed(0).padStart(3)}%  ${stat.fps.toFixed(0)}fps ${stat.calls}calls`);
  }
  await page.close();
}
if (errors.length) console.log('--- console ---\n' + [...new Set(errors)].slice(0, 20).join('\n'));
await browser.close();
