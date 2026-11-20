// 聲音組共用：離線渲染一段聲音情境，輸出 WAV（給人聽）與量測（峰值、RMS、近似響度、頻段佔比）。
// 用法：node scripts/audio-render.mjs <情境檔.js> [秒數=12] [地圖=temple] [輸出名稱]
//   情境檔是一段在瀏覽器裡執行的程式碼（async 函式本體），可用變數：
//     a      已 init + start 的 AudioSys（OfflineAudioContext，素材庫已預載該地圖的錄音）
//     at(t, fn)   在第 t 秒執行 fn（離線渲染時用 suspend/resume 排程；fn 裡可以呼叫 a.horror(...)、a.bank.play(...)、a.setTension(...)）
//     tick(dt)    手動推進 a.update（預設每 1/30 秒自動呼叫，space 由 a.zone 或 setSpace 決定）
//     setSpace(name)   'open' | 'hall' | 'crypt' | 'grave' | 'room' | 'workshop'
//   例：at(0.5, () => a.horror('stinger', { intensity: 1 })); at(3, () => a.setTension(0.8));
// 需要 http://127.0.0.1:5178 的開發伺服器。輸出到 artifacts/audio/<名稱>.wav 與 .json。
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const [file, secArg, mapArg, nameArg] = process.argv.slice(2);
if (!file) { console.log('用法：node scripts/audio-render.mjs <情境檔.js> [秒數] [地圖] [輸出名稱]'); process.exit(1); }
const seconds = +(secArg || 12), mapId = mapArg || 'temple';
const name = nameArg || path.basename(file).replace(/\.\w+$/, '');
const body = fs.readFileSync(file, 'utf8');
const ORIGIN = process.env.GAME_ORIGIN || 'http://127.0.0.1:5178';
const OUT = 'artifacts/audio'; fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.stack || e.message)); page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
await page.goto(ORIGIN + '/');
await page.waitForFunction(() => !!window.__game, null, { timeout: 120000 });
const res = await page.evaluate(async ({ body, seconds, mapId }) => {
  const { AudioSys } = await import('/src/core/AudioSys.js');
  const SR = 48000, ctx = new OfflineAudioContext(2, Math.ceil(SR * seconds), SR);
  const a = new AudioSys(); a.init(ctx); a.start();
  a.master.gain.cancelScheduledValues(0); a.master.gain.value = 0.8;
  if (mapId === 'home') a.profile = 'home'; else if (mapId === 'road') a.profile = 'road'; else a.profile = null;
  const stats = await a.bank.preload(mapId);
  a.mapReady(mapId);
  let space = mapId === 'home' ? 'room' : 'open';
  const setSpace = (s) => { space = s; };
  const tick = (dt) => { a.zone = space; a.update(dt, space === 'open' || space === 'grave' ? 0 : 1); };
  // 每 1/30 秒暫停一次：推進 update，並執行排到這個時間點的 at() 回呼（同一個時間點不能 suspend 兩次，所以全部走這個佇列）
  const queue = [];
  const at = (t, fn) => { queue.push({ t, fn }); queue.sort((x, y) => x.t - y.t); };
  const step = 1 / 30;
  for (let k = 1; k * step < seconds - 0.01; k++) {
    const tt = k * step;
    ctx.suspend(tt).then(() => {
      while (queue.length && queue[0].t <= tt + 1e-6) { const q = queue.shift(); try { q.fn(); } catch (e) { console.error(e); } }
      tick(step); a._pump(tt + 0.5); ctx.resume();
    });
  }
  // 情境
  await (new Function('a', 'at', 'tick', 'setSpace', 'ctx', `return (async () => { ${body} })();`))(a, at, tick, setSpace, ctx);
  const buf = await ctx.startRendering();
  const L = buf.getChannelData(0), R = buf.getChannelData(1), n = L.length;
  // 量測
  let peak = 0, sum = 0; for (let i = 0; i < n; i++) { const m = Math.max(Math.abs(L[i]), Math.abs(R[i])); if (m > peak) peak = m; sum += (L[i] * L[i] + R[i] * R[i]) / 2; }
  const win = Math.floor(SR * 0.4), hop = Math.floor(SR * 0.1), blocks = [];
  for (let s = 0; s + win <= n; s += hop) { let e = 0; for (let i = s; i < s + win; i++) e += (L[i] * L[i] + R[i] * R[i]) / 2; blocks.push(e / win); }
  const gated = blocks.filter((e) => e > 1e-7); const lufs = gated.length ? -0.691 + 10 * Math.log10(gated.reduce((x, y) => x + y, 0) / gated.length) : -99; // 未加 K 權重的近似值
  const loud = blocks.map((e) => +(10 * Math.log10(e + 1e-12)).toFixed(1));
  // 16-bit WAV
  const data = new DataView(new ArrayBuffer(44 + n * 4));
  const w = (o, s) => { for (let i = 0; i < s.length; i++) data.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); data.setUint32(4, 36 + n * 4, true); w(8, 'WAVE'); w(12, 'fmt '); data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 2, true);
  data.setUint32(24, SR, true); data.setUint32(28, SR * 4, true); data.setUint16(32, 4, true); data.setUint16(34, 16, true); w(36, 'data'); data.setUint32(40, n * 4, true);
  for (let i = 0; i < n; i++) { data.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true); data.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true); }
  const bytes = new Uint8Array(data.buffer); let bin = ''; for (let i = 0; i < bytes.length; i += 32768) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768));
  return { wav: btoa(bin), peak, rms: Math.sqrt(sum / n), lufs, loud10hz: loud, bank: stats, modules: Object.keys(a.modules || {}) };
}, { body, seconds, mapId });
fs.writeFileSync(`${OUT}/${name}.wav`, Buffer.from(res.wav, 'base64'));
delete res.wav;
const dB = (x) => (x > 0 ? +(20 * Math.log10(x)).toFixed(1) : -99);
const report = { name, seconds, map: mapId, peakDb: dB(res.peak), rmsDb: dB(res.rms), approxLufs: +res.lufs.toFixed(1), bank: res.bank, modules: res.modules, errors, loudness_100ms_blocks_dB: res.loud10hz };
fs.writeFileSync(`${OUT}/${name}.json`, JSON.stringify(report, null, 1));
console.log(JSON.stringify({ ...report, loudness_100ms_blocks_dB: undefined }, null, 1));
await browser.close();
