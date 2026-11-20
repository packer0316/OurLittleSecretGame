// 環境與擬音組（foley）的驗證：沒有人聽得到，所以每個素材與混音都用量測把關。
// 用法：node scripts/audio-foley.mjs        （需要 http://127.0.0.1:5178 的開發伺服器；GAME_ORIGIN 可覆寫）
//   A. 素材：每張地圖的 foley 素材全部載入、已解碼記憶體 ≤ 30 MB、建置輸出 ≤ 10 MB
//   B. 循環接點：環境床與持續聲的頭尾連續（沒有爆音）、頭尾不是靜音
//   C. 各聲學空間 20 秒的環境（完整混音）：錄音環境床真的在播、無削波、響度在範圍內、低頻不過量
//   D. 各材質連續腳步（走路＋衝刺）：每一步都聽得到、峰值合理、變體有變化
//   E. 寺廟劇中樂器（廟鐘、木魚、誦經、引磬、風鈴、符紙）  F. 門與敲門  G. 結局火場  H. 恐怖導演的聲音（方位、強度）
//   I. 寺內恐怖段落的錄音版（腳步、裂聲、震動、雜訊與石磨的持續聲）  J. 真實遊戲頁面：三張地圖載入後無錯誤、環境床在播
// 試聽 WAV 輸出到 artifacts/audio/foley/。
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const ORIGIN = process.env.GAME_ORIGIN || 'http://127.0.0.1:5178';
const OUT = 'artifacts/audio/foley';
fs.mkdirSync(OUT, { recursive: true });
const failures = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); return ok; };
const dB = (x) => (x > 0 ? 20 * Math.log10(x) : -120);
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : String(x));

// ───── 建置輸出大小（Node 端） ─────
const dirBytes = (d) => fs.existsSync(d) ? fs.readdirSync(d).reduce((s, f) => s + fs.statSync(path.join(d, f)).size, 0) : 0;
const buildMB = (dirBytes('public/assets/audio/amb') + dirBytes('public/assets/audio/foley')) / 1048576;
console.log(`建置輸出（amb + foley）：${buildMB.toFixed(2)} MB`);
check(buildMB <= 10, `建置輸出 ${buildMB.toFixed(2)} MB 超過 10 MB`);

const browser = await chromium.launch({ channel: process.env.BROWSER || 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && /audio|foley/i.test(m.text()))) errors.push(`[${m.type()}] ${m.text()}`); });
await page.goto(ORIGIN + '/');
await page.waitForFunction(() => !!window.__game, null, { timeout: 120000 });

// 瀏覽器端的共用工具：建立離線 AudioSys、排程、量測、WAV
await page.evaluate(async () => {
  const { AudioSys } = await import('/src/core/AudioSys.js');
  const { createBank } = await import('/src/audio/bank.js');
  const FOLEY = (await import('/src/audio/lib/foley.js')).default;
  const { createFinaleAudio } = await import('/src/story/finaleAudio.js');
  const { createSynth } = await import('/src/horror/setpieces/synth.js');
  const SR = 48000;
  const T = {
    SR, FOLEY, createFinaleAudio, createSynth,
    /** full = 完整素材庫（配樂、人聲一起）；否則只載 foley 的素材（其他組退回合成） */
    async make(seconds, mapId, { full = false } = {}) {
      const ctx = new OfflineAudioContext(2, Math.ceil(SR * seconds), SR);
      const a = new AudioSys(); a.init(ctx); a.start();
      a.master.gain.cancelScheduledValues(0); a.master.gain.value = 0.8;
      a.profile = mapId === 'home' ? 'home' : mapId === 'road' ? 'road' : null;
      if (!full) a.bank = createBank(a, FOLEY);
      const stats = await a.bank.preload(mapId);
      a.mapReady(mapId);
      return { ctx, a, stats };
    },
    /** 每 1/30 秒推進 a.update（space 固定）、執行排到這個時間點的 fn；回傳 AudioBuffer */
    async render(ctx, a, space, events = [], { indoor } = {}) {
      const step = 1 / 30, q = [...events].sort((x, y) => x[0] - y[0]);
      const spaceOf = typeof space === 'function' ? space : () => space;
      for (let k = 1; k * step < ctx.length / SR - 0.01; k++) {
        const tt = k * step;
        ctx.suspend(tt).then(() => {
          while (q.length && q[0][0] <= tt + 1e-6) { const [, fn] = q.shift(); try { fn(); } catch (e) { console.error('[foley-test]', e); } }
          const sp = spaceOf(); a.zone = sp; a.update(step, indoor ?? (sp === 'open' || sp === 'grave' ? 0 : 1)); a._pump(tt + 0.5); ctx.resume();
        });
      }
      return ctx.startRendering();
    },
    stats(buf, from = 0, to = buf.duration) {
      const L = buf.getChannelData(0), R = buf.getChannelData(1), s0 = Math.floor(from * SR), s1 = Math.min(L.length, Math.floor(to * SR));
      const k = 1 - Math.exp((-2 * Math.PI * 120) / SR);
      let peak = 0, sl = 0, sr = 0, hot = 0, nan = 0, lo = 0, loE = 0, mE = 0;
      for (let i = s0; i < s1; i++) {
        const l = L[i], r = R[i]; if (!Number.isFinite(l) || !Number.isFinite(r)) { nan++; continue; }
        const p = Math.max(Math.abs(l), Math.abs(r)); if (p > peak) peak = p; if (p >= 0.97) hot++;
        sl += l * l; sr += r * r; const m = (l + r) / 2; lo += k * (m - lo); loE += lo * lo; mE += m * m;
      }
      const n = Math.max(1, s1 - s0);
      return { peak, rms: Math.sqrt((sl + sr) / (2 * n)), l: Math.sqrt(sl / n), r: Math.sqrt(sr / n), low: mE ? loE / mE : 0, hot, nan };
    },
    /** 每段時間的峰值（例如每一步） */
    peaksAt(buf, times, win = 0.35) { const L = buf.getChannelData(0), R = buf.getChannelData(1); return times.map((t) => { let p = 0; for (let i = Math.floor(t * SR); i < Math.min(L.length, Math.floor((t + win) * SR)); i++) p = Math.max(p, Math.abs(L[i]), Math.abs(R[i])); return p; }); },
    wav(buf) {
      const L = buf.getChannelData(0), R = buf.getChannelData(1), n = L.length, d = new DataView(new ArrayBuffer(44 + n * 4));
      const w = (o, s) => { for (let i = 0; i < s.length; i++) d.setUint8(o + i, s.charCodeAt(i)); };
      w(0, 'RIFF'); d.setUint32(4, 36 + n * 4, true); w(8, 'WAVE'); w(12, 'fmt '); d.setUint32(16, 16, true); d.setUint16(20, 1, true); d.setUint16(22, 2, true);
      d.setUint32(24, SR, true); d.setUint32(28, SR * 4, true); d.setUint16(32, 4, true); d.setUint16(34, 16, true); w(36, 'data'); d.setUint32(40, n * 4, true);
      for (let i = 0; i < n; i++) { d.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true); d.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true); }
      const b = new Uint8Array(d.buffer); let s = ''; for (let i = 0; i < b.length; i += 32768) s += String.fromCharCode.apply(null, b.subarray(i, i + 32768));
      return btoa(s);
    },
  };
  window.__foleyTest = T;
});
const saveWav = (name, b64) => fs.writeFileSync(`${OUT}/${name}.wav`, Buffer.from(b64, 'base64'));

// ───── A. 素材與記憶體 ─────
console.log('\n── A. 素材載入與已解碼記憶體（只算 foley 組）──');
const assets = await page.evaluate(async () => {
  const T = window.__foleyTest, out = {};
  for (const map of ['temple', 'road', 'home']) {
    const { a, stats } = await T.make(0.2, map);
    let bytes = 0, seconds = 0, files = 0; const missing = [];
    for (const [id, e] of Object.entries(T.FOLEY)) {
      if (!e.maps.includes(map) && !e.maps.includes('all')) continue;
      if (!a.bank.has(id)) { missing.push(id); continue; }
      for (let v = 0; v < e.files.length; v++) { const b = a.bank.buffer(id, v); if (b) { bytes += b.length * b.numberOfChannels * 4; seconds += b.duration * b.numberOfChannels; files++; } }
      if (e.files.length > 1) { const set = new Set(); for (let v = 0; v < e.files.length; v++) set.add(a.bank.buffer(id, v)); if (set.size !== e.files.length) missing.push(id + '（變體重複）'); }
    }
    out[map] = { mb: bytes / 1048576, seconds, files, missing, failed: stats.failed, bankMb: stats.mb };
  }
  return out;
});
for (const [map, r] of Object.entries(assets)) {
  console.log(`${map.padEnd(7)} ${r.files} 個檔案  ${r.seconds.toFixed(1)} 秒（單聲道）  已解碼 ${r.mb.toFixed(1)} MB${r.missing.length ? '  缺：' + r.missing.join(', ') : ''}`);
  check(r.missing.length === 0, `${map}: 素材沒有載入 ${r.missing.join(', ')}`);
  check(r.failed.length === 0, `${map}: 下載失敗 ${r.failed.join(', ')}`);
  check(r.mb <= 30, `${map}: foley 已解碼 ${r.mb.toFixed(1)} MB 超過 30 MB`);
}

// ───── B. 循環接點 ─────
console.log('\n── B. 循環接點 ──');
const seams = await page.evaluate(async () => {
  const T = window.__foleyTest, out = {}, SR = T.SR;
  const loops = Object.entries(T.FOLEY).filter(([id]) => id.startsWith('foley.bed.') || ['foley.fire', 'foley.sizzle', 'foley.tape', 'foley.grind'].includes(id));
  for (const map of ['temple', 'road', 'home']) {
    const { a } = await T.make(0.2, map);
    for (const [id] of loops) {
      if (out[id] || !a.bank.has(id)) continue;
      const b = a.bank.buffer(id, 0), x = b.getChannelData(0), n = x.length;
      // 接點的取樣跳動 vs. 接點附近一般的相鄰取樣差
      let md = 0; const w = Math.floor(0.01 * SR);
      for (let i = n - w; i < n - 1; i++) md += Math.abs(x[i + 1] - x[i]);
      for (let i = 0; i < w - 1; i++) md += Math.abs(x[i + 1] - x[i]);
      md /= 2 * w - 2;
      const jump = Math.abs(x[0] - x[n - 1]);
      const rms = (s, e) => { let q = 0; for (let i = s; i < e; i++) q += x[i] * x[i]; return Math.sqrt(q / Math.max(1, e - s)); };
      const W = Math.floor(0.25 * SR), head = rms(0, W), tail = rms(n - W, n), all = rms(0, n);
      out[id] = { dur: b.duration, jumpRel: jump / (md + 1e-9), headTailDb: 20 * Math.log10((tail + 1e-9) / (head + 1e-9)), headDb: 20 * Math.log10(head + 1e-9), allDb: 20 * Math.log10(all + 1e-9) };
    }
  }
  return out;
});
for (const [id, s] of Object.entries(seams)) {
  console.log(`${id.padEnd(26)} ${s.dur.toFixed(2)}s  接點跳動 ${s.jumpRel.toFixed(2)}×（相鄰取樣差）  頭尾 RMS 差 ${f1(s.headTailDb)} dB  整體 ${f1(s.allDb)} dBFS`);
  check(s.jumpRel < 6, `${id}: 循環接點有跳動（${s.jumpRel.toFixed(1)}×）`);
  check(Math.abs(s.headTailDb) < 8, `${id}: 循環頭尾響度差 ${f1(s.headTailDb)} dB`);
  check(s.headDb > -75, `${id}: 循環開頭是靜音`);
}

// ───── C. 各空間的環境（完整混音） ─────
console.log('\n── C. 各聲學空間 20 秒環境（完整混音：錄音環境床＋程序化陣風／風嘯＋偶發事件）──');
const SPACES = [
  ['temple_open', 'temple', 'open', [-36, -22]], ['temple_hall', 'temple', 'hall', [-40, -24]], ['temple_crypt', 'temple', 'crypt', [-42, -26]], ['temple_grave', 'temple', 'grave', [-38, -22]],
  ['road_open', 'road', 'open', [-36, -22]], ['road_workshop', 'road', 'workshop', [-42, -24]], ['home_room', 'home', 'room', [-38, -24]],
];
const amb = {};
for (const [name, map, space, range] of SPACES) {
  const r = await page.evaluate(async ({ map, space }) => {
    const T = window.__foleyTest, { ctx, a } = await T.make(20, map, { full: true });
    a._nextGust = 0; // 讓陣風照常變化
    const buf = await T.render(ctx, a, space, [[19.5, () => { window.__lastFoley = a.modules.foley?.state; }]]);
    const st = window.__lastFoley;
    return { s: T.stats(buf, 4, 20), state: st, layers: { ...a.layerMul }, wav: T.wav(buf) };
  }, { map, space });
  saveWav('amb_' + name, r.wav);
  amb[name] = r.s;
  const beds = (r.state?.beds || []).filter((b) => b.playing);
  console.log(`${name.padEnd(14)} RMS ${f1(dB(r.s.rms))} dBFS  峰值 ${f1(dB(r.s.peak))}  <120Hz ${(r.s.low * 100).toFixed(0)}%  環境床 ${beds.map((b) => b.key).join(' ')}  layerMul wind ${r.layers.wind} bug ${r.layers.bug} rain ${r.layers.rain}`);
  check(beds.length >= 2, `${name}: 錄音環境床沒有在播（${beds.length} 條）`);
  check(r.s.nan === 0 && r.s.hot === 0 && r.s.peak < 0.944, `${name}: 削波或峰值過高（${f1(dB(r.s.peak))} dBFS）`);
  check(dB(r.s.rms) >= range[0] && dB(r.s.rms) <= range[1], `${name}: 響度 ${f1(dB(r.s.rms))} dBFS 不在 ${range[0]}~${range[1]}`);
  check(r.s.low < 0.6, `${name}: 120 Hz 以下佔 ${(r.s.low * 100).toFixed(0)}%（低頻過量）`);
}

// ───── C2. 緊張度升高：山林夜裡的蟲鳴退掉（錄音環境床被低通、變小） ─────
{
  const r = await page.evaluate(async () => {
    const T = window.__foleyTest, { ctx, a } = await T.make(22, 'temple');
    a.foley.mute.events = true;
    const buf = await T.render(ctx, a, 'open', [[11, () => a.setTension(0.85)]]);
    // 3 kHz 以上的能量（蟲鳴所在的頻帶）
    const hi = (t0, t1) => { const L = buf.getChannelData(0), k = 1 - Math.exp((-2 * Math.PI * 3000) / T.SR); let lo = 0, e = 0, n = 0; for (let i = Math.floor(t0 * T.SR); i < Math.floor(t1 * T.SR); i++) { lo += k * (L[i] - lo); const h = L[i] - lo; e += h * h; n++; } return Math.sqrt(e / n); };
    return { before: hi(5, 10.5), after: hi(17, 22) };
  });
  const drop = dB(r.after) - dB(r.before);
  console.log(`\n── C2. 緊張度 0 → 0.85：3 kHz 以上（蟲鳴）${f1(dB(r.before))} → ${f1(dB(r.after))} dBFS（${f1(drop)} dB）`);
  check(drop < -4, `緊張時蟲鳴沒有退掉（只變化 ${f1(drop)} dB）`);
}

// ───── D. 腳步 ─────
console.log('\n── D. 各材質連續腳步（10 步走路 + 6 步衝刺）──');
for (const [surface, map, space] of [['wood', 'temple', 'hall'], ['stone', 'temple', 'open'], ['dirt', 'temple', 'open'], ['grass', 'temple', 'grave'], ['gravel', 'road', 'open'], ['wood', 'home', 'room'], ['stone', 'road', 'workshop']]) {
  const r = await page.evaluate(async ({ surface, map, space }) => {
    const T = window.__foleyTest, { ctx, a } = await T.make(8.5, map);
    const ev = [], times = [];
    for (let i = 0; i < 10; i++) { const t = 0.4 + i * 0.5; times.push(t); ev.push([t, () => a.footstep(0.65, surface)]); }
    for (let i = 0; i < 6; i++) { const t = 5.6 + i * 0.32; times.push(t); ev.push([t, () => a.footstep(1.0, surface)]); }
    const buf = await T.render(ctx, a, space, ev);
    a.layerMul.wind = 0;
    return { peaks: T.peaksAt(buf, times, 0.3), s: T.stats(buf), wav: T.wav(buf), has: a.bank.has('foley.step.' + (surface === 'wood' && map === 'home' ? 'floor' : surface)) };
  }, { surface, map, space });
  const tag = map === 'home' ? 'floor(home)' : `${surface}(${map})`;
  saveWav(`steps_${map}_${surface}`, r.wav);
  const walk = r.peaks.slice(0, 10).map(dB), run = r.peaks.slice(10).map(dB);
  const mean = (v) => v.reduce((x, y) => x + y, 0) / v.length, sd = (v) => Math.sqrt(mean(v.map((x) => (x - mean(v)) ** 2))), med = (v) => [...v].sort((x, y) => x - y)[Math.floor(v.length / 2)];
  console.log(`${tag.padEnd(16)} 走路峰值 ${f1(mean(walk))} dBFS（${f1(Math.min(...walk))}~${f1(Math.max(...walk))}，變化 ±${f1(sd(walk))}）  衝刺 ${f1(mean(run))} dBFS  整段峰值 ${f1(dB(r.s.peak))}`);
  check(r.has, `${tag}: 沒有腳步錄音`);
  check(Math.min(...walk) > -34, `${tag}: 有一步幾乎聽不到（${f1(Math.min(...walk))} dBFS）`);
  check(mean(walk) > -24 && mean(walk) < -10, `${tag}: 走路腳步的峰值 ${f1(mean(walk))} dBFS 不在合理範圍`);
  check(med(run) > med(walk), `${tag}: 衝刺沒有比走路重（中位數 ${f1(med(run))} / ${f1(med(walk))} dBFS）`);
  check(sd(walk) > 0.25, `${tag}: 十步聽起來一模一樣（變化只有 ±${f1(sd(walk))} dB）`);
  check(r.s.hot === 0 && r.s.peak < 0.944, `${tag}: 削波`);
}

// ───── E–I. 一次性聲音 ─────
const SHOTS = {
  // E. 寺廟劇中樂器
  temple_instruments: { map: 'temple', space: 'hall', sec: 34, ev: (a) => [
    [0.3, () => a.bell(1)], [8.5, () => a.woodenFish(4)], [12, () => a.foley.ambShot('foley.chant', { dist: 14, gain: 1, lp: 1800, pan: -0.4, wet: 1.7, fadeIn: 0.6 })],
    [21, () => a.foley.ambShot('foley.inkin', { dist: 10, gain: 0.8, pan: 0.4, wet: 1.6 })], [27, () => a.foley.ambShot('foley.chime', { dist: 10, gain: 0.7, pan: -0.6 })],
    [29, () => a.foley.ambShot('foley.paper', { dist: 3, gain: 0.8, pan: 0.6 })], [31, () => a.bell(0.8, a.ctx.currentTime + 0.05)]] },
  // F. 門與敲門
  doors_knocks: { map: 'home', space: 'room', sec: 16, ev: (a) => [
    [0.15, () => a.doorKnock(1)], [0.85, () => a.doorKnock(1)], [1.8, () => a.doorKnock(0.65)], [3.5, () => a.horror('knock', { pan: 0.4, dist: 3 })], [5.2, () => a.horror('knock1', { pan: -0.3, dist: 2 })],
    [6.5, () => a.horror('slam', { pan: 0.5, dist: 6 })], [9, () => a.horror('scrape', { pan: -0.5, dist: 2.5 })], [12, () => a.creak(undefined, { pan: 0.3, dist: 1.5 })], [13.5, () => a.horror('marble', { pan: 0.2, dist: 3 })]] },
  temple_doors: { map: 'temple', space: 'hall', sec: 12, ev: (a, fa) => [[0.3, () => fa.creakLong(4.6, 0, 1.5)], [6, () => fa.clunk()], [8, () => fa.bang(1, 0.3, 3)], [9.5, () => fa.knockSmall(1, 0, 1.2)], [10.2, () => fa.knockSmall(0.7, 0, 1.4)]] },
  // G. 結局火場
  finale_fire: { map: 'temple', space: 'crypt', sec: 16, fire: true, ev: (a, fa) => [[0.2, () => fa.fire.set(0.9)], [6, () => fa.sizzle.level(0.42, 0.08)], [9, () => fa.sizzle.level(0, 0.2)], [10, () => fa.knockSmall(1, 0, 1.2)], [11, () => fa.pop(0.2, 1)], [12.5, () => fa.snuff(-0.4, 5)], [14, () => fa.fire.set(0)]] },
  finale_misc: { map: 'temple', space: 'crypt', sec: 14, ev: (a, fa) => [[0.2, () => fa.vibrate()], [1.8, () => fa.vibrate()], [3.5, () => fa.drag(2.8)], [7, () => fa.cloth()], [8.2, () => fa.birds(true)], [13.5, () => fa.birds(false)]] },
  // I. 寺內恐怖段落
  setpiece_synth: { map: 'temple', space: 'hall', sec: 16, ev: (a, fa, sy) => [[0.3, () => sy.childSteps({ pan0: -0.6, pan1: 0.6, dist0: 2, dist1: 8, n: 6 })], [2.5, () => sy.thud({ pan: 0.3, dist: 3 })], [3.2, () => sy.wetStep({ pan: -0.3, dist: 3 })], [3.8, () => sy.wetStep({ pan: -0.2, dist: 3 })],
    [5, () => sy.crack({ pan: 0.2, dist: 4 })], [6.5, () => sy.rustle({ pan: -0.4, dist: 2 })], [8, () => sy.buzz({ pan: 0.4, dist: 5, n: 3 })], [10.5, () => sy.setStatic(0.8)], [12, () => sy.setStatic(0)], [12.3, () => sy.setGrind(0.9, -0.3, 3)], [15, () => sy.silence()]] },
};
for (const [name, def] of Object.entries(SHOTS)) {
  const r = await page.evaluate(async ({ name, map, space, sec, src }) => {
    const T = window.__foleyTest, { ctx, a } = await T.make(sec, map);
    const game = { audio: a }, fa = T.createFinaleAudio(game), sy = T.createSynth(game);
    const ev = (0, eval)('(' + src + ')')(a, fa, sy); // 情境函式由 Node 端以原始碼傳進來
    if (name === 'finale_fire') { const step = 1 / 30; for (let t = 0.3; t < sec - 0.5; t += step) ev.push([t, () => fa.update(step)]); }
    const buf = await T.render(ctx, a, space, ev);
    return { s: T.stats(buf), wav: T.wav(buf) };
  }, { name, map: def.map, space: def.space, sec: def.sec, src: def.ev.toString() }).catch((e) => ({ error: String(e) }));
  if (r.error) { check(false, `${name}: ${r.error}`); continue; }
  saveWav(name, r.wav);
  console.log(`${name.padEnd(20)} 峰值 ${f1(dB(r.s.peak))} dBFS  RMS ${f1(dB(r.s.rms))}  <120Hz ${(r.s.low * 100).toFixed(0)}%`);
  check(r.s.nan === 0 && r.s.hot === 0 && r.s.peak < 0.944, `${name}: 削波或峰值過高（${f1(dB(r.s.peak))} dBFS）`);
  check(r.s.peak > 0.02, `${name}: 幾乎無聲`);
  check(r.s.low < 0.6, `${name}: 低頻過量（${(r.s.low * 100).toFixed(0)}%）`);
}

// ───── E2. 空殿裡的誦經：會開始、換空間的瞬間戛然而止 ─────
{
  const r = await page.evaluate(async () => {
    const T = window.__foleyTest, { ctx, a } = await T.make(16, 'temple');
    const st = {}; let space = 'hall';
    const ev = [[1, () => a.modules.foley.forceChant()], [6, () => { st.during = a.modules.foley.state.chant; }], [9, () => { space = 'open'; }], [9.6, () => { st.after = a.modules.foley.state.chant; }]];
    const buf = await T.render(ctx, a, () => space, ev);
    const lvl = (t0, t1) => T.stats(buf, t0, t1).rms;
    return { ...st, before: lvl(0.2, 1), mid: lvl(4, 8.8), cut: lvl(9.4, 11), wav: T.wav(buf) };
  });
  saveWav('chant_cut', r.wav);
  console.log(`
── E2. 誦經：播放中 ${r.during}（${f1(dB(r.mid))} dBFS，前 ${f1(dB(r.before))}）→ 換到室外後 ${r.after}（${f1(dB(r.cut))} dBFS）`);
  check(r.during === true, '誦經沒有開始');
  check(r.after === false, '換空間後誦經沒有停');
  check(r.mid > r.before * 1.05, '誦經播放時聽不出來（響度沒有增加）');
}

// ───── H. 恐怖導演的聲音：錄音版的方位與強度 ─────
console.log('\n── H. horror(kind)（錄音版）──');
const kinds = await page.evaluate(async () => {
  const T = window.__foleyTest, out = {};
  const KINDS = { stepBehind: 2.5, knock: 3, knock1: 2, scrape: 4, slam: 4.5, creak: 3, drip: 2.5, bellFar: 9.5, marble: 5, static: 3, howl: 5 };
  for (const [kind, sec] of Object.entries(KINDS)) {
    const row = {};
    for (const [tag, pan, I] of [['L', -1, 1], ['R', 1, 1], ['I2', 0.4, 2], ['I1', 0.4, 1]]) {
      const { ctx, a } = await T.make(sec, 'temple');
      a.foley.mute.beds = a.foley.mute.events = true; // 只量這一個聲音
      const zero = () => { a.layerMul.wind = a.layerMul.howl = a.layerMul.leaf = a.layerMul.room = a.layerMul.bug = 0; };
      a.onUpdate(zero);
      let played = null;
      const buf = await T.render(ctx, a, 'open', [[0.25, () => { a._surface = 'stone'; played = a.horror(kind, { pan, dist: 1.5, intensity: I }); }]]);
      const s = T.stats(buf);
      row[tag] = { played, peak: s.peak, l: s.l, r: s.r, hot: s.hot };
    }
    out[kind] = row;
  }
  return out;
});
for (const [kind, r] of Object.entries(kinds)) {
  const bal = (x) => 20 * Math.log10((x.l + 1e-9) / (x.r + 1e-9));
  console.log(`${kind.padEnd(11)} 峰值 i1 ${f1(dB(r.I1.peak))} / i2 ${f1(dB(r.I2.peak))} dBFS   方位 L ${f1(bal(r.L))} dB / R ${f1(bal(r.R))} dB`);
  check(r.I1.played === true, `${kind}: horror() 沒有播`);
  check(r.I1.peak > 0.01 && r.I2.peak < 0.944 && r.I2.hot === 0, `${kind}: 峰值異常（${f1(dB(r.I1.peak))} / ${f1(dB(r.I2.peak))}）`);
  check(r.I2.peak >= r.I1.peak * 0.98, `${kind}: intensity 2 沒有比 1 大聲`);
  if (['stepBehind', 'knock', 'knock1', 'scrape', 'static', 'creak', 'drip'].includes(kind)) check(bal(r.L) > 3 && bal(r.R) < -3, `${kind}: 方位感不足（${f1(bal(r.L))} / ${f1(bal(r.R))} dB）`);
}

// ───── J. 真實遊戲頁面 ─────
console.log('\n── J. 真實遊戲頁面（?auto）──');
for (const map of ['temple', 'road', 'home']) {
  const before = errors.length;
  await page.goto(`${ORIGIN}/?auto&map=${map}`);
  await page.waitForFunction(() => window.__game?.map && window.__game.running && window.__game.audio.ctx, null, { timeout: 240000 });
  for (let i = 0; i < 30 && await page.evaluate(() => !!window.__game.story?.modal); i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(120); } // 開場對話（對話框開著時遊戲不更新聲音）
  await page.waitForTimeout(2500);
  const r = await page.evaluate(async () => {
    const g = window.__game, a = g.audio, ctx = a.ctx;
    const an = ctx.createAnalyser(); an.fftSize = 2048; a.out.connect(an);
    const buf = new Float32Array(an.fftSize); let peak = 0;
    a.footstep(0.65, g.map.surfaceAt?.(g.player.pos) || 'dirt');
    for (let i = 0; i < 20; i++) { await new Promise((res) => setTimeout(res, 100)); an.getFloatTimeDomainData(buf); for (const x of buf) peak = Math.max(peak, Math.abs(x)); }
    const st = a.modules.foley?.state, bs = a.bank.stats();
    return { state: st, failed: bs.failed, peak, voices: a.debug().voices };
  });
  const beds = (r.state?.beds || []).filter((b) => b.playing);
  console.log(`${map.padEnd(7)} 空間 ${r.state?.space}  環境床 ${beds.map((b) => `${b.key}(${b.gain})`).join(' ')}  輸出峰值 ${f1(dB(r.peak))} dBFS  下載失敗 ${r.failed.length}`);
  check(beds.length >= 2, `${map}: 遊戲裡錄音環境床沒有在播`);
  check(r.failed.filter((f) => f.startsWith('amb/') || f.startsWith('foley/')).length === 0, `${map}: 遊戲裡 foley 素材下載失敗 ${r.failed.join(', ')}`);
  check(r.peak > 0.002 && r.peak < 0.99, `${map}: 遊戲輸出峰值異常 ${f1(dB(r.peak))} dBFS`);
  check(errors.length === before, `${map}: 頁面有錯誤`);
}

fs.writeFileSync(`${OUT}/report.json`, JSON.stringify({ buildMB, assets, seams, amb, kinds }, null, 1));
await browser.close();
if (errors.length) { console.log('\n--- console ---\n' + [...new Set(errors)].slice(0, 20).join('\n')); failures.push(`頁面有 ${errors.length} 個錯誤／警告`); }
if (failures.length) { console.log(`\n失敗 ${failures.length} 項：\n- ` + failures.join('\n- ')); process.exit(1); }
console.log(`\naudio-foley：全部通過（試聽 WAV 在 ${OUT}/）`);
