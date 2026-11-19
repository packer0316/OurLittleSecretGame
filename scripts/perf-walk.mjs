// perf：沿固定路線實際跑遊戲迴圈，量影格時間分布、卡頓次數，以及各事件當下新編譯的 shader / 新上傳的貼圖數
// 用法：node scripts/perf-walk.mjs <標籤> [--query=noopt] [--quality=medium]
// 輸出：artifacts/perf/<標籤>-walk.json
// 注意：影格時間受同機其他瀏覽器影響，請以「事件當下的 programs / textures / geometries 增量」與卡頓次數的相對變化為主。
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const args = process.argv.slice(2);
const tag = args.find((a) => !a.startsWith('--')) || 'run';
const extra = (args.find((a) => a.startsWith('--query=')) || '').slice(8);
const quality = (args.find((a) => a.startsWith('--quality=')) || '').slice(10);
const BASE = process.env.GAME_BASE || 'http://127.0.0.1:5178/';
const out = 'artifacts/perf';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  channel: 'chrome', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
if (quality) await page.addInitScript((q) => { try { localStorage.setItem('ols-settings', JSON.stringify({ sensitivity: 1, volume: 0.8, quality: q })); } catch {} }, quality);

const q = extra ? '&' + extra : '';
await page.goto(`${BASE}?auto&map=temple${q}`);
await page.waitForFunction(() => window.__game?.map && window.__game.running, null, { timeout: 240000 });

// 安裝影格記錄器
await page.evaluate(() => {
  const g = window.__game;
  const P = (window.__perf = { frames: [], gpu: [], scale: [], marks: [], last: performance.now(), drive: null });
  const prev = g.onFrame;
  g.onFrame = (dt) => {
    prev?.(dt);
    const now = performance.now();
    P.frames.push(now - P.last); P.last = now;
    P.gpu.push(g.perf?.gpuMs || 0); P.scale.push(g.perf?.drs?.scale ?? 1);
    P.drive?.(dt);
  };
  P.counts = () => ({ programs: g.renderer.info.programs.length, textures: g.renderer.info.memory.textures, geometries: g.renderer.info.memory.geometries });
  P.mark = (name) => { P.marks.push({ name, at: P.frames.length, ...P.counts() }); };
  // 關掉開場文件
  for (let i = 0; i < 40 && g.story?.modal; i++) g.story.choose(0);
});
await page.waitForTimeout(1200);

const stats = (arr) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b), n = s.length, pick = (p) => +s[Math.min(n - 1, Math.floor(n * p))].toFixed(1);
  return { frames: n, mean: +(s.reduce((a, b) => a + b, 0) / n).toFixed(2), p50: pick(0.5), p95: pick(0.95), p99: pick(0.99), max: +s[n - 1].toFixed(1), over33: s.filter((x) => x > 33.4).length, over50: s.filter((x) => x > 50).length, over100: s.filter((x) => x > 100).length };
};
const segments = [];
/** 執行一段：fn 在頁面內觸發動作，之後觀察 ms 毫秒 */
async function segment(name, ms, fn, arg) {
  const before = await page.evaluate((name) => { const P = window.__perf; P.mark(name); P.last = performance.now(); return { at: P.frames.length, ...P.counts() }; }, name);
  if (fn) await page.evaluate(fn, arg);
  await page.waitForTimeout(ms);
  const after = await page.evaluate((at) => { const P = window.__perf; P.drive = null; const g = window.__game; g.player.keys = Object.create(null); return { frames: P.frames.slice(at), gpu: P.gpu.slice(at), scale: P.scale.slice(at), ...P.counts(), pos: g.player.pos.toArray().map((v) => +v.toFixed(2)) }; }, before.at);
  const st = stats(after.frames.slice(1)) || {};
  const gp = after.gpu.filter((x) => x > 0), sc = after.scale;
  const seg = { name, ms, ...st, gpuMean: gp.length ? +(gp.reduce((a, b) => a + b, 0) / gp.length).toFixed(1) : null, minScale: sc.length ? Math.min(...sc) : null, first5max: +Math.max(0, ...after.frames.slice(1, 7)).toFixed(1), newPrograms: after.programs - before.programs, newTextures: after.textures - before.textures, newGeometries: after.geometries - before.geometries, pos: after.pos };
  segments.push(seg);
  console.log(`${name.padEnd(26)} frames ${String(seg.frames ?? 0).padStart(4)} mean ${String(seg.mean).padStart(6)} p95 ${String(seg.p95).padStart(6)} max ${String(seg.max).padStart(7)} gpu ${String(seg.gpuMean ?? '-').padStart(5)} res ${String(seg.minScale ?? '-').padStart(4)} >33:${String(seg.over33).padStart(3)} >50:${String(seg.over50).padStart(3)} | +prog ${seg.newPrograms} +tex ${seg.newTextures} +geo ${seg.newGeometries}`);
  return seg;
}
/** 沿一串路徑點行走（頁面內每幀轉向並按住 W） */
const walk = ([points, sprint]) => {
  const g = window.__game, p = g.player; let i = 0;
  window.__perf.drive = () => {
    if (i >= points.length) { p.keys = Object.create(null); return; }
    const [x, z] = points[i], dx = x - p.pos.x, dz = z - p.pos.z;
    if (Math.hypot(dx, dz) < 0.6) { i++; return; }
    const want = Math.atan2(-dx, -dz); const d = Math.atan2(Math.sin(want - p.yaw), Math.cos(want - p.yaw));
    p.yaw += Math.max(-0.12, Math.min(0.12, d));
    p.keys = { KeyW: true, ShiftLeft: !!sprint };
  };
};
const tp = ([x, y, z, yaw, pitch]) => { const g = window.__game; const gy = y === null ? g.map.world.probe(x, z, 1.5).g : y; g.player.teleport(x, gy, z, (yaw * Math.PI) / 180, ((pitch || 0) * Math.PI) / 180); };

await segment('idle@spawn', 3000);
await segment('walk:approach→gate', 6500, walk, [[[0, 30], [0, 24]], true]);
await segment('walk:courtyard→porch', 8000, walk, [[[0, 10], [0, -6], [0, -10]], true]);
await segment('walk:into hall1', 5000, walk, [[[0, -14], [0, -20]], false]);
await segment('event:ghost first shown', 2500, () => { const g = window.__game; g.player.teleport(0, 0.9, -20, Math.PI, 0); g.map.storyWorld.triggerScare('gate'); });
await segment('event:journal open', 1500, () => window.__game.story.journal());
await segment('event:journal close', 1500, () => { const s = window.__game.story; if (s.modal) s.choose(s.modal.options.length - 1); });
await segment('event:pause→resume', 1500, () => { const g = window.__game; g.stop(); setTimeout(() => { g.start(); g.player.enabled = true; }, 300); });
await segment('teleport:stair1 foot', 1200, tp, [-16.1, 0.9, -28.6, 180, 0]);
await segment('walk:stairs 1F→2F', 6500, walk, [[[-16.1, -16.5]], false]);
await segment('walk:2F cross', 9000, walk, [[[-12, -15.2], [10, -15.6], [13.5, -17.2]], true]);
await segment('walk:stairs 2F→3F', 6500, walk, [[[13.5, -27.5]], false]);
await segment('walk:3F cross', 7000, walk, [[[10, -28.6], [-9.6, -28.65]], true]);
await segment('walk:stairs 3F→4F', 6500, walk, [[[1, -28.65]], false]);
await segment('teleport:4F hall', 1500, tp, [0.6, 16.9, -20.6, 0, 6]);
await segment('teleport:underground', 2500, tp, [55, -7, -14.5, 0, 4]);
await segment('teleport:graveyard', 2500, tp, [-36, null, 0, 90, 2]);
await segment('teleport:stage', 2500, tp, [23, 0.02, 8, 0, 4]);
await segment('event:stage scare', 2500, () => window.__game.map.storyWorld.triggerScare('stage'));
await segment('event:quality low', 2000, () => window.__game.applySettings({ quality: 'low' }));
await segment('event:quality back', 2000, (q) => window.__game.applySettings({ quality: q || 'medium' }), quality);
await segment('teleport:spawn(look back)', 2500, tp, [0, null, 49, 0, 6]);

const all = await page.evaluate(() => ({ prewarmed: window.__game.perf?.prewarmed || [], poolSlots: window.__game.perf?.lights?.slots?.length ?? null, occluders: window.__game.perf?.prepass?.items?.length ?? null, frames: window.__perf.frames, heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null, counts: window.__perf.counts(), fps: window.__game.fps, quality: window.__game.settings.quality, pr: window.__game.renderer.getPixelRatio() }));
const moving = segments.filter((s) => s.name.startsWith('walk') || s.name.startsWith('idle'));
const summary = {
  tag, extra, when: new Date().toISOString(), quality: all.quality, pixelRatio: all.pr,
  overall: stats(all.frames.slice(5)),
  gpuMsMean: (() => { const a = segments.map((x) => x.gpuMean).filter((x) => x != null); return a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : null; })(),
  minScale: Math.min(...segments.map((x) => x.minScale ?? 1)),
  walking: { frames: moving.reduce((a, s) => a + (s.frames || 0), 0), over33: moving.reduce((a, s) => a + (s.over33 || 0), 0), over50: moving.reduce((a, s) => a + (s.over50 || 0), 0) },
  events: { over50: segments.filter((s) => !moving.includes(s)).reduce((a, s) => a + (s.over50 || 0), 0), newPrograms: segments.reduce((a, s) => a + Math.max(0, s.newPrograms), 0), newTextures: segments.reduce((a, s) => a + Math.max(0, s.newTextures), 0), newGeometries: segments.reduce((a, s) => a + Math.max(0, s.newGeometries), 0) },
  heapMB: all.heapMB, counts: all.counts, prewarmed: all.prewarmed, poolSlots: all.poolSlots, occluders: all.occluders, segments, errors,
};
console.log('OVERALL', JSON.stringify(summary.overall), 'GPU ms（各段平均）', summary.gpuMsMean, '最低內部解析度', summary.minScale);
console.log('WALKING', JSON.stringify(summary.walking), 'EVENTS', JSON.stringify(summary.events));
console.log('prewarmed', JSON.stringify(all.prewarmed), 'pool slots', all.poolSlots, 'occluders', all.occluders);
if (errors.length) console.log('errors', errors.slice(0, 5));
fs.writeFileSync(`${out}/${tag}-walk.json`, JSON.stringify(summary, null, 2));
await browser.close();
