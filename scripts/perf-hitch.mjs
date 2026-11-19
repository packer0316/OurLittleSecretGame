// perf：「第一次出現才準備」的確定性檢查。
// 載入完成後逐一造訪各樓層與區域（每個點轉四個方向）、觸發每一種鬼的現身，
// 統計過程中新編譯的 shader、新上傳的貼圖與新建立的幾何緩衝。理想值全部是 0：
// 代表之後不論走到哪、鬼從哪裡冒出來，都不會在那一幀才向 GPU 要資源。
// 用法：node scripts/perf-hitch.mjs <標籤> [home road temple] [--query=noopt]
// 輸出：artifacts/perf/<標籤>-hitch.json；有任何新增時 exit code 1（--report 只回報不判定）
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const args = process.argv.slice(2);
const tag = args.find((a) => !a.startsWith('--') && !['home', 'road', 'temple'].includes(a)) || 'run';
const maps = args.filter((a) => ['home', 'road', 'temple'].includes(a));
if (!maps.length) maps.push('home', 'road', 'temple');
const extra = (args.find((a) => a.startsWith('--query=')) || '').slice(8);
const reportOnly = args.includes('--report');
const BASE = process.env.GAME_BASE || 'http://127.0.0.1:5178/';
fs.mkdirSync('artifacts/perf', { recursive: true });

const TOUR = {
  temple: [[0, null, 30, 0], [0, null, 10, 0], [0, 0.9, -16, 0], [-16.1, 0.9, -28.6, 180], [-16.1, 3.9, -22, 180], [-16.1, 6.9, -16.5, 180], [-12, 6.9, -15.2, -90], [0, 6.9, -15.6, -90], [10, 6.9, -15.6, -90], [13.5, 6.9, -17.2, 0], [13.5, 9.4, -22, 0], [13.5, 11.9, -27.5, 0], [0, 11.9, -28.6, 90], [-9.6, 11.9, -28.65, -90], [-4, 14.4, -28.65, -90], [1, 16.9, -28.65, -90], [0.6, 16.9, -20.6, 0], [55, -7, -14.5, 0], [-36, null, 0, 90], [23, 0.02, 8, 0], [-50, null, 10, 0]],
  road: [[-1.2, 0, 33.2, 0], [0, 0, 14, 0], [0, 0, 2, 0], [8.5, 0.12, -15.5, 0], [8.5, 0.12, -19, 0], [0, 0, -30, 0]],
  home: [[0, 0, -0.5, 0], [1.4, 0, 1.5, 180], [-2, 0, 2, 90]],
};
const SCARES = { temple: ['gate', 'tape', 'phone', 'stage', 'loop', 'relic'], road: ['bridge', 'workshop'], home: [] };

const browser = await chromium.launch({
  channel: 'chrome', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const result = { tag, extra, when: new Date().toISOString(), maps: {} };
let bad = 0;
for (const id of maps) {
  await page.goto(`${BASE}?auto&map=${id}${extra ? '&' + extra : ''}`);
  await page.waitForFunction((id) => window.__game?.map?.id === id && window.__game.running, id, { timeout: 240000 });
  await page.waitForTimeout(800);
  const r = await page.evaluate(([tour, scares, id]) => {
    const g = window.__game, R = g.renderer, info = R.info;
    g.stop();
    for (let i = 0; i < 40 && g.story?.modal; i++) g.story.choose(0);
    const keys = () => new Set(info.programs.map((p) => p.cacheKey));
    const snap = () => ({ programs: info.programs.length, textures: info.memory.textures, geometries: info.memory.geometries });
    const step = () => { for (let i = 0; i < 6; i++) { if ('_shadowForce' in g.player) g.player._shadowForce = true; g.frame(1 / 30); } };
    if (id !== 'home') g.player.flashOn = true;
    step();
    const start = snap();
    let before = keys(); const late = [];
    const note = (where) => { const now = keys(); for (const p of info.programs) if (!before.has(p.cacheKey)) late.push({ where, type: p.type || p.name, bits: p.cacheKey.split(',').slice(54, 56).join('/') }); before = now; };
    for (const [x, y, z, yaw] of tour) {
      for (const a of [0, 90, 180, 270]) {
        const gy = y === null ? g.map.world.probe(x, z, 1.5).g : y;
        g.player.teleport(x, gy, z, ((yaw + a) * Math.PI) / 180, 0);
        step();
        note(`tour ${x},${y},${z} yaw ${yaw + a}`);
      }
    }
    const afterTour = snap();
    const events = [];
    for (const kind of scares) {
      const b = snap();
      try { g.map.storyWorld.triggerScare?.(kind); } catch { /* 該地圖沒有這個演出 */ }
      step();
      note(`scare ${kind}`);
      const a = snap();
      events.push({ kind, programs: a.programs - b.programs, textures: a.textures - b.textures, geometries: a.geometries - b.geometries });
    }
    // 文件視窗、畫質切換以外的常見狀態：手電筒開關
    g.player.flashOn = !g.player.flashOn; step(); g.player.flashOn = !g.player.flashOn; step(); note('flashlight toggle');
    const end = snap();
    return { start, afterTour, end, events, late, tour: { programs: afterTour.programs - start.programs, textures: afterTour.textures - start.textures, geometries: afterTour.geometries - start.geometries } };
  }, [TOUR[id], SCARES[id], id]);
  result.maps[id] = r;
  const evP = r.events.reduce((a, e) => a + Math.max(0, e.programs), 0), evT = r.events.reduce((a, e) => a + Math.max(0, e.textures), 0), evG = r.events.reduce((a, e) => a + Math.max(0, e.geometries), 0);
  console.log(`${id.padEnd(7)} 巡場新增：shader ${r.tour.programs}　貼圖 ${r.tour.textures}　幾何 ${r.tour.geometries}　｜　鬼現身新增：shader ${evP}　貼圖 ${evT}　幾何 ${evG}　｜　總 shader ${r.start.programs}→${r.end.programs}`);
  if (r.late.length) console.log('   遲到的 shader：', r.late.map((l) => `${l.type}[${l.bits}] @ ${l.where}`).join('；'));
  bad += Math.max(0, r.end.programs - r.start.programs) + Math.max(0, r.end.textures - r.start.textures) + Math.max(0, r.end.geometries - r.start.geometries);
}
result.errors = errors;
if (errors.length) console.log('errors', errors.slice(0, 5));
fs.writeFileSync(`artifacts/perf/${tag}-hitch.json`, JSON.stringify(result, null, 2));
await browser.close();
if ((bad || errors.length) && !reportOnly) process.exitCode = 1;
