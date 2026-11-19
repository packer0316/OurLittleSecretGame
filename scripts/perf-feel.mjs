// perf：操作手感的確定性檢查（不看 FPS，直接以固定 1/60 秒推進玩家）
// 用法：node scripts/perf-feel.mjs      輸出：artifacts/perf/feel-results.json
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.GAME_BASE || 'http://127.0.0.1:5178/';
fs.mkdirSync('artifacts/perf', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [], results = [];
page.on('pageerror', (e) => errors.push(e.message));
const test = async (name, fn) => { try { const detail = await fn(); results.push({ name, pass: true, detail }); console.log('PASS', name, detail ? JSON.stringify(detail) : ''); } catch (e) { results.push({ name, pass: false, error: String(e) }); console.log('FAIL', name, String(e)); } };

await page.goto(`${BASE}?auto&map=temple&nohorror`);
await page.waitForFunction(() => window.__game?.map?.id === 'temple' && window.__game.running, null, { timeout: 240000 });
await page.evaluate(() => { const g = window.__game; g.stop(); for (let i = 0; i < 40 && g.story?.modal; i++) g.story.choose(0); });
/** 從 (x,z) 朝 yaw 按住 W 走 secs 秒，回傳每秒位置與腳步聲次數 */
const walk = (x, y, z, yawDeg, secs, keys = { KeyW: true }) => page.evaluate(([x, y, z, yawDeg, secs, keys]) => {
  const g = window.__game, p = g.player, w = g.map.world;
  p.fly = false;
  p.teleport(x, y === null ? w.probe(x, z, 1.5).g : y, z, (yawDeg * Math.PI) / 180, 0);
  p.onGround = true; p.groundSpeed = 0;
  let steps = 0; const prev = p.onFootstep; p.onFootstep = () => { steps++; };
  p.keys = { ...keys };
  const start = [p.pos.x, p.pos.z]; let maxCamStep = 0, lastCamY = g.camera.position.y, stepsLate = 0, bobLate = 0;
  for (let i = 0; i < secs * 60; i++) {
    const before = steps;
    p.update(1 / 60, w);
    maxCamStep = Math.max(maxCamStep, Math.abs(g.camera.position.y - lastCamY)); lastCamY = g.camera.position.y;
    if (i >= secs * 30) { stepsLate += steps - before; bobLate = Math.max(bobLate, p.bobAmt); }
  }
  p.keys = Object.create(null); p.onFootstep = prev;
  return { dist: Math.hypot(p.pos.x - start[0], p.pos.z - start[1]), end: [+p.pos.x.toFixed(2), +p.pos.y.toFixed(2), +p.pos.z.toFixed(2)], steps, stepsLate, bobLate: +bobLate.toFixed(3), groundSpeed: +p.groundSpeed.toFixed(2), maxCamStep: +maxCamStep.toFixed(4) };
}, [x, y, z, yawDeg, secs, keys]);

await test('空地直走：2 秒走到全速（2.35 m/s），有腳步聲', async () => {
  const r = await walk(0, null, 40, 0, 3);
  assert(r.dist > 6.4 && r.dist < 7.1, JSON.stringify(r)); assert(r.steps >= 6, JSON.stringify(r)); return r;
});
await test('斜向撞上圍牆：沿牆滑行，速度不低於切線分量的九成', async () => {
  // 圍牆東側內緣 x≈29.7，朝東北 45° 走：切線速度應為 2.35·cos45° ≈ 1.66 m/s（起點避開戲台）
  const r = await walk(27, null, 16, -45, 4);
  assert(r.end[0] < 30, '穿牆 ' + JSON.stringify(r)); assert(r.dist > 0.9 * 1.66 * 3.2, '滑行太慢 ' + JSON.stringify(r)); return r;
});
await test('山門門柱：偏一點也能滑進門內，不卡在柱角（3 秒內通過）', async () => {
  const r = await walk(1.9, null, 25, 0, 3);
  assert(r.end[2] < 19.6, JSON.stringify(r)); return r;
});
await test('正面頂著牆：不再原地踏步（晃動與腳步聲停止）', async () => {
  const r = await walk(28, null, 10, -90, 4);
  assert(r.end[0] < 30, JSON.stringify(r)); assert.equal(r.stepsLate, 0, '還有腳步聲 ' + JSON.stringify(r)); assert(r.bobLate < 0.05, '還在晃 ' + JSON.stringify(r)); return r;
});
await test('上樓梯：視線高度連續（單幀垂直位移不超過 4 公分）', async () => {
  const r = await walk(-16.1, 0.9, -28.6, 180, 9);
  assert(Math.abs(r.end[1] - 6.9) < 0.05, JSON.stringify(r)); assert(r.maxCamStep < 0.04, JSON.stringify(r)); return r;
});
await test('正面石階：一階一階也不會頓（單幀垂直位移不超過 4 公分）', async () => {
  const r = await walk(0, null, -3, 0, 3.5);
  assert(r.end[1] > 0.85, JSON.stringify(r)); assert(r.maxCamStep < 0.04, JSON.stringify(r)); return r;
});
await test('蹲下：速度降到 1.25 m/s，視線平順降到 1.0 m', async () => {
  const r = await walk(0, null, 40, 0, 3, { KeyW: true, ControlLeft: true });
  assert(r.dist > 3.3 && r.dist < 3.9, JSON.stringify(r)); assert(r.maxCamStep < 0.055, JSON.stringify(r));
  const eye = await page.evaluate(() => window.__game.player.eye); assert(Math.abs(eye - 1.0) < 0.02, 'eye ' + eye); return r;
});
await test('第一幀的 dt 不會是負值（rAF 時間戳早於 start()）', async () => {
  const dts = await page.evaluate(() => new Promise((resolve) => { const g = window.__game, seen = []; const f = g.frame.bind(g); g.frame = (dt) => { seen.push(dt); f(dt); if (seen.length >= 5) { g.frame = f; g.stop(); resolve(seen); } }; g.start(); }));
  assert(dts.every((d) => d >= 0 && d <= 0.05), JSON.stringify(dts)); return { first: dts[0] };
});
await test('手電筒陰影：關燈不畫、靜止時降到約 20 Hz、移動時每幀更新', async () => {
  const r = await page.evaluate(() => {
    const g = window.__game, p = g.player, w = g.map.world, sh = p.flash.shadow;
    if (sh.autoUpdate !== false) return { skipped: true };
    const count = (frames, fn) => { let n = 0; for (let i = 0; i < frames; i++) { fn?.(i); p.update(1 / 60, w); if (sh.needsUpdate) { n++; sh.needsUpdate = false; } } return n; };
    p.teleport(0, w.probe(0, 30, 1.5).g, 30, 0, 0); p.keys = Object.create(null); p.vel.set(0, 0, 0);
    p.flashOn = true; count(30);
    const idle = count(120);
    const moving = count(120, () => { p.keys = { KeyW: true }; });
    p.keys = Object.create(null); p.flashOn = false; count(30);
    const off = count(120);
    p.flashOn = true;
    return { idle, moving, off };
  });
  if (r.skipped) return r;
  assert(r.off === 0, JSON.stringify(r)); assert(r.moving >= 118, JSON.stringify(r)); assert(r.idle >= 30 && r.idle <= 60, JSON.stringify(r)); return r;
});
await test('瞬間傳送會通知 Game 做眨眼轉場（距離門檻 4 公尺）', async () => {
  const r = await page.evaluate(() => { const p = window.__game.player, seen = []; const prev = p.onTeleport; p.onTeleport = (d) => seen.push(+d.toFixed(1)); p.teleport(0, 0, 40, 0, 0); p.teleport(0, 0, 41, 0, 0); p.teleport(55, -7, -14, 0, 0); p.onTeleport = prev; return seen; });
  assert.equal(r.length, 3); assert(r[1] === 1 && r[2] > 50, JSON.stringify(r)); return r;
});
await test('點光源池：shader 只算 8 盞＋近身光，場景原有的燈都還在', async () => {
  const r = await page.evaluate(() => { const g = window.__game; let real = 0, virtual = 0; g.map.scene.traverse((o) => { if (!o.isPointLight) return; if (o.layers.test(g.camera.layers)) real++; else virtual++; }); return { real, virtual, slots: g.perf.lights.slots.length, enabled: g.perf.lights.enabled }; });
  if (!r.enabled) return r;
  assert(r.real <= 9 && r.virtual >= 10 && r.slots <= 8, JSON.stringify(r)); return r;
});

fs.writeFileSync('artifacts/perf/feel-results.json', JSON.stringify({ when: new Date().toISOString(), results, errors }, null, 2));
console.log('ERRORS', errors);
await browser.close();
if (errors.length || results.some((r) => !r.pass)) process.exitCode = 1;
