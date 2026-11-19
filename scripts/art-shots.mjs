// 場景美術巡禮：固定鏡位截圖 + renderer.info 統計。
// 用法：node scripts/art-shots.mjs <before|after|自訂資料夾名> [temple|home|road|all] [鏡位名稱片段...]
// 輸出到 artifacts/art/<資料夾>/，並寫出 stats-<map>.json。需要 http://127.0.0.1:5178/ 的測試伺服器。
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const tag = process.argv[2] || 'before';
const which = process.argv[3] || 'all';
const only = process.argv.slice(4);
const BASE = process.env.GAME_BASE || 'http://127.0.0.1:5178/';
const outDir = path.join('artifacts', 'art', tag);
fs.mkdirSync(outDir, { recursive: true });

// 每個鏡位：[名稱, 站位 [x, y|null(貼地), z], 注視點 [x, y, z], { bright, flash, fly }]
const VIEWS = {
  temple: [
    ['T01_approach', [0, null, 42], [0, 6, 20], {}],
    ['T02_gate', [1.2, null, 27.5], [0, 2.4, 22], {}],
    ['T03_courtyard', [0, null, 16], [0, 6, -8], {}],
    ['T04_compound_wall', [-25.5, null, 12], [-30, 1.1, 9], {}],
    ['T05_yard_ground', [6, null, 4], [9, 0, 0], {}],
    ['T06_porch', [3, 0.9, -8.6], [-1, 3.2, -12], {}],
    ['T07_hall1', [0, 0.9, -15.5], [0, 2.6, -30], {}],
    ['T08_altar', [0.6, 0.9, -25.2], [0, 2.1, -28], {}],
    ['T09_buddha', [0, 0.9, -27.0], [0, 4.6, -31.7], {}],
    ['T10_wall_east', [15.5, 0.9, -19], [19.6, 2.2, -16.5], {}],
    ['T11_floor', [-4, 0.9, -19], [-6.5, 0.9, -21.5], {}],
    ['T12_doors_inside', [1.5, 0.9, -18], [0, 2.6, -12], {}],
    ['T13_hall2', [-12, 6.9, -16.5], [0, 8.2, -26], {}],
    ['T14_hall3', [11, 11.9, -27.5], [-2, 13, -22], {}],
    ['T15_hall4', [0.8, 16.9, -20.4], [0, 18.3, -23.1], {}],
    ['T16_terrace', [6, 16.9, -28.6], [-6, 17.6, -28.6], {}],
    ['T17_stage', [23, null, 7.4], [23, 1.8, -1.8], {}],
    ['T18_graveyard', [-36, null, 0], [-50, 0.6, 2], {}],
    ['T19_underground', [55, -7, -13.6], [55, -5.2, -26], {}],
    ['T20_underground_wall', [51.5, -7, -19.5], [47.4, -5.2, -22], {}],
    ['T21_underground_door', [55, -7, -16.5], [55, -5.4, -11.2], {}],
    ['T24_backhall_door', [58.6, -7, -25.2], [55.6, -6.2, -28.6], {}],
    ['T25_backhall_slot', [56.6, -7, -27.95], [55.3, -6.9, -28.5], {}],
    ['T26_boulder', [6.5, null, 33.5], [9, 0.8, 31], {}],
    ['T27_arhat_close', [16.6, 0.9, -24], [18.92, 2.2, -24.3], {}],
    ['T28_spawn_back', [0, null, 26], [0, 1.5, 40], {}],
    ['T22_hall1_bright', [6, 0.9, -15], [-2, 2.5, -30], { bright: true, flash: false }],
    ['T23_overview_bright', [46, 30, 44], [0, 6, -14], { bright: true, flash: false, fly: true }],
  ],
  home: [
    ['H01_desk', [0, 0, -1.25], [0, 0.85, -2.6], { flash: false }],
    ['H02_desk_close', [0.1, 0, -1.9], [0.1, 0.85, -2.5], { flash: false }],
    ['H03_room_south', [0, 0, -1.9], [1.2, 1.2, 3.8], { flash: false }],
    ['H04_door', [1.5, 0, 2.2], [1.65, 1.2, 3.86], { flash: false }],
    ['H05_sofa', [-1.0, 0, 0.7], [-3.5, 0.6, 0.65], { flash: false }],
    ['H06_tv', [1.4, 0, -0.5], [3.7, 0.9, -0.7], { flash: false }],
    ['H07_shelf', [-2.2, 0, -1.3], [-3.55, 1.1, -2.65], { flash: false }],
    ['H08_window', [2.1, 0, -2.4], [0.9, 1.9, -4], { flash: false }],
    ['H09_wall_floor', [2.4, 0, 1.2], [3.9, 0.7, 1.8], { flash: false }],
    ['H10_ceiling', [0, 0, 0.4], [0, 3.1, -2.4], { flash: false }],
    ['H11_overview_bright', [3.2, 0, 3.2], [-2, 0.8, -3], { bright: true, flash: false }],
    ['H12_entry_bright', [-0.5, 0, 0.8], [2.6, 0.7, 3.4], { bright: true, flash: false }],
  ],
  road: [
    ['R01_spawn', [-1.2, 0, 33.2], [-0.5, 1.4, 20], {}],
    ['R02_car', [-1.6, 0, 29.2], [-4.6, 0.9, 32], {}],
    ['R03_shelter', [-1.6, 0, 24.6], [-4.6, 1.3, 22], {}],
    ['R04_bridge', [0, 0, 16.5], [0, 0.9, 6], {}],
    ['R05_village', [0.6, 0, 6.5], [-2, 1.9, -8], {}],
    ['R06_house', [-6.2, 0, 5.2], [-8, 1.6, 2], {}],
    ['R07_notice', [3.6, 0, 7.6], [4, 1.7, 5], {}],
    ['R08_workshop_front', [7.6, 0, -9.8], [8.6, 1.9, -14.5], {}],
    ['R09_workshop_in', [8.5, 0.12, -15.2], [8.6, 1.3, -22], {}],
    ['R10_bench', [8.4, 0.12, -17.3], [8.3, 0.95, -19], {}],
    ['R11_workshop_east', [6.6, 0.12, -17.2], [11.6, 1.3, -20.5], {}],
    ['R12_furnace', [8.6, 0.12, -20.4], [6.65, 0.9, -21.8], {}],
    ['R13_street_north', [0, 0, -9], [-4, 1.8, -22], {}],
    ['R14_gate', [0.4, 0, -30.5], [0, 2, -36], {}],
    ['R17_effigy_close', [6.75, 0.12, -17.45], [5.5, 1.5, -17.75], {}],
    ['R18_effigy_door', [7.7, 0, -12.5], [6.55, 1.45, -14.1], {}],
    ['R19_effigy_row', [7.0, 0.12, -15.2], [5.6, 1.2, -18.6], {}],
    ['R20_shelf_heads', [10.2, 0.12, -20.4], [11.4, 1.5, -21.9], {}],
    ['R15_village_bright', [2, 0, 12], [-2, 1.5, -12], { bright: true, flash: false }],
    ['R16_workshop_bright', [8.5, 0.12, -15.0], [8.6, 1.4, -22], { bright: true, flash: false }],
  ],
};

const maps = which === 'all' ? ['home', 'road', 'temple'] : [which];
const browser = await chromium.launch({
  channel: 'chrome', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
let failed = false;
for (const map of maps) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.stack || e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${BASE}?auto&map=${map}${process.env.GAME_EXTRA || ''}`); // GAME_EXTRA 例：&artoff（關掉寺廟的場景美術陳設層，量測差異用）
  try {
    await page.waitForFunction(() => window.__game?.map && window.__game.running, null, { timeout: 240000 });
  } catch {
    console.log(`[${map}] 載入逾時`, errors.slice(0, 5).join('\n'));
    failed = true; await page.close(); continue;
  }
  await page.waitForTimeout(1200);
  await page.addStyleTag({ content: 'body > *:not(canvas) { visibility: hidden !important; }' });
  const stats = { map, when: new Date().toISOString(), views: {} };
  // 讓遊戲迴圈停住，之後每張圖都以固定時間 renderOnce，前後對照才不會被動畫干擾
  await page.evaluate(() => {
    const g = window.__game; g.stop();
    if (g.story) { g.story.modal = null; }
    g.__artAmbient = null;
  });
  for (const [name, pos, target, o] of VIEWS[map]) {
    if (only.length && !only.some((s) => name.includes(s))) continue;
    const info = await page.evaluate(([pos, target, o]) => {
      const g = window.__game, THREE_Light = g.map.scene.children.find((c) => c.isLight)?.constructor;
      g.player.fly = !!o.fly;
      const y = pos[1] === null ? g.map.world.probe(pos[0], pos[2], 1.5).g : pos[1];
      const dx = target[0] - pos[0], dz = target[2] - pos[2], dy = target[1] - (y + 1.66);
      g.player.teleport(pos[0], y, pos[2], Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)));
      const flash = o.flash !== false;
      g.player.flashAvailable = true; g.player.flashOn = flash;
      if (g.map.setFullBright) g.map.setFullBright(!!o.bright);
      else {
        // home / road 沒有全亮開關：臨時加一盞環境光檢查模型
        if (!g.__artAmbient) {
          const hemi = g.map.scene.children.find((c) => c.isHemisphereLight);
          g.__artAmbient = hemi.clone(); g.__artAmbient.intensity = 0; g.map.scene.add(g.__artAmbient);
          g.__fogWas = g.map.scene.fog.density;
        }
        g.__artAmbient.color.set(0xffffff); g.__artAmbient.groundColor.set(0xbbbbbb);
        g.__artAmbient.intensity = o.bright ? 3.2 : 0;
        g.map.scene.fog.density = o.bright ? 0.002 : g.__fogWas;
      }
      g.time = 12;
      for (let n = 0; n < 30; n++) { g.map.update(0.1, 12, g.player); if (map_isHome(g)) g.player.flashOn = flash; }
      g.map.cloth?.update(12, g.camera, { force: true });
      g.player.flashOn = flash;
      g.renderer.info.reset();
      g.renderOnce();
      const i = g.renderer.info;
      return { calls: i.render.calls, tris: i.render.triangles, geoms: i.memory.geometries, tex: i.memory.textures };
      function map_isHome(g) { return g.map.id === 'home'; }
    }, [pos, target, o]);
    await page.waitForTimeout(250);
    // 第二次渲染才是穩定狀態的單幀成本（第一次含傳送後的月光陰影重繪）
    const steady = await page.evaluate(() => {
      const g = window.__game; g.renderer.info.reset(); g.renderOnce();
      const i = g.renderer.info; return { calls: i.render.calls, tris: i.render.triangles };
    });
    info.firstCalls = info.calls; info.firstTris = info.tris; info.calls = steady.calls; info.tris = steady.tris;
    await page.screenshot({ path: path.join(outDir, `${name}.jpg`), type: 'jpeg', quality: 88 });
    stats.views[name] = info;
    console.log(name, `${info.calls} calls`, `${(info.tris / 1000).toFixed(0)}k tris`, `${info.geoms} geoms`, `${info.tex} tex`);
  }
  const list = Object.values(stats.views);
  if (list.length) {
    stats.maxCalls = Math.max(...list.map((v) => v.calls));
    stats.maxTris = Math.max(...list.map((v) => v.tris));
    stats.avgCalls = Math.round(list.reduce((s, v) => s + v.calls, 0) / list.length);
    stats.avgTris = Math.round(list.reduce((s, v) => s + v.tris, 0) / list.length);
    console.log(`[${map}] avg ${stats.avgCalls} calls / ${(stats.avgTris / 1000).toFixed(0)}k tris, max ${stats.maxCalls} calls / ${(stats.maxTris / 1000).toFixed(0)}k tris`);
  }
  stats.errors = [...new Set(errors)];
  if (stats.errors.length) { console.log(`[${map}] console errors:\n` + stats.errors.slice(0, 12).join('\n')); }
  if (!only.length) fs.writeFileSync(path.join(outDir, `stats-${map}.json`), JSON.stringify(stats, null, 2));
  await page.close();
}
await browser.close();
if (failed) process.exitCode = 1;
