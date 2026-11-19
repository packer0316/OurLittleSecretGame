// perf：換場（home → road → temple，重複兩輪）的載入時間與資源是否釋放
// 用法：node scripts/perf-travel.mjs <標籤> [--query=noopt]
// 輸出：artifacts/perf/<標籤>-travel.json
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const args = process.argv.slice(2);
const tag = args.find((a) => !a.startsWith('--')) || 'run';
const extra = (args.find((a) => a.startsWith('--query=')) || '').slice(8);
const BASE = process.env.GAME_BASE || 'http://127.0.0.1:5178/';
fs.mkdirSync('artifacts/perf', { recursive: true });

const browser = await chromium.launch({
  channel: 'chrome', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const snap = async () => {
  await cdp.send('HeapProfiler.collectGarbage');
  return page.evaluate(() => { const g = window.__game, i = g.renderer.info; return { geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs.length, heapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) }; });
};
const steps = [];
const t0 = Date.now();
await page.goto(`${BASE}?auto&map=home${extra ? '&' + extra : ''}`);
await page.waitForFunction(() => window.__game?.map?.id === 'home' && window.__game.running, null, { timeout: 240000 });
steps.push({ step: 'home (cold)', ms: Date.now() - t0, ...(await snap()) });
for (const id of ['road', 'temple', 'home', 'road', 'temple']) {
  // 量測換場期間最長的主執行緒凍結（rAF 間隔）
  await page.evaluate(() => { const P = (window.__gap = { max: 0, last: performance.now(), on: true, bars: [] }); const loop = () => { if (!P.on) return; const n = performance.now(); P.max = Math.max(P.max, n - P.last); P.last = n; const w = document.getElementById('loading-bar')?.style.width; if (w && P.bars.at(-1) !== w) P.bars.push(w); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
  const t = Date.now();
  await page.evaluate((id) => { window.__enter(id); }, id);
  await page.waitForFunction((id) => window.__game?.map?.id === id && window.__game.running, id, { timeout: 240000 });
  const ms = Date.now() - t;
  const gap = await page.evaluate(() => { window.__gap.on = false; return { longestFreezeMs: Math.round(window.__gap.max), barSteps: window.__gap.bars.length }; });
  await page.waitForTimeout(800);
  steps.push({ step: `→ ${id}`, ms, ...gap, ...(await snap()) });
}
await page.evaluate(() => window.__game.unloadMap());
await page.waitForTimeout(500);
steps.push({ step: 'unloadMap（回大廳）', ...(await snap()) });
for (const s of steps) console.log(`${s.step.padEnd(22)} ${String(s.ms ?? '').padStart(6)} ms  freeze ${String(s.longestFreezeMs ?? '').padStart(5)}  bar steps ${String(s.barSteps ?? '').padStart(3)}  geo ${String(s.geometries).padStart(4)}  tex ${String(s.textures).padStart(4)}  prog ${String(s.programs).padStart(3)}  heap ${s.heapMB} MB`);
if (errors.length) console.log('errors', errors.slice(0, 5));
fs.writeFileSync(`artifacts/perf/${tag}-travel.json`, JSON.stringify({ tag, extra, when: new Date().toISOString(), steps, errors }, null, 2));
await browser.close();
