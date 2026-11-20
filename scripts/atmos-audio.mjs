// 氣氛組（atmos）：聲音的程式化驗證。聽不到聲音，所以把每個音效離線渲染出來量。
// 用法：node scripts/atmos-audio.mjs            （需要 5178 的測試伺服器；可用 GAME_ORIGIN 覆寫）
//   1. OfflineAudioContext 渲染 horror(kind) 的每一種：不是無聲、峰值不破音、有結束、左右方位正確
//   2. 各聲學空間的環境聲：音量、低頻佔比（避免整場轟轟的低鳴）
//   3. duck() 真的把環境聲抽空、之後回得來；setTension() 疊得上去
//   4. 真實 AudioContext：連續觸發不累積節點，播完後全部釋放
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const ORIGIN = process.env.GAME_ORIGIN || 'http://127.0.0.1:5178';
const OUT = 'artifacts/atmos';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  channel: process.env.BROWSER || 'chrome', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
await page.goto(ORIGIN + '/');
await page.waitForFunction(() => !!window.__game, null, { timeout: 120000 });

const failures = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); return ok; };
const dB = (x) => (x > 0 ? (20 * Math.log10(x)).toFixed(1) : '-inf');

// ───── 1–3：離線渲染 ─────
const offline = await page.evaluate(async () => {
  const { AudioSys } = await import('/src/core/AudioSys.js');
  const SR = 48000;
  const make = (seconds, space = 'hall') => {
    const ctx = new OfflineAudioContext(2, Math.ceil(SR * seconds), SR);
    const sys = new AudioSys();
    sys.init(ctx);
    sys.start();
    sys.master.gain.cancelScheduledValues(0);
    sys.master.gain.value = 0.8;
    sys._setSpace(space);
    return { ctx, sys };
  };
  const stats = (buf, from = 0, to = buf.duration) => {
    const L = buf.getChannelData(0), R = buf.getChannelData(1), a = Math.floor(from * SR), b = Math.min(L.length, Math.floor(to * SR));
    const k = 1 - Math.exp((-2 * Math.PI * 120) / SR);
    const kh = 1 - Math.exp((-2 * Math.PI * 1000) / SR);
    let peak = 0, sl = 0, sr = 0, last = -1, first = -1, lo = 0, loE = 0, mE = 0, hot = 0, nan = 0, h1 = 0, hiE = 0;
    for (let i = a; i < b; i++) {
      const l = L[i], r = R[i], m = (l + r) * 0.5, p = Math.max(Math.abs(l), Math.abs(r));
      if (!Number.isFinite(l) || !Number.isFinite(r)) { nan++; continue; }
      if (p > peak) peak = p;
      if (p >= 0.97) hot++;
      if (p > 0.002) { last = i; if (first < 0) first = i; }
      sl += l * l; sr += r * r;
      lo += k * (m - lo); loE += lo * lo; mE += m * m;
      h1 += kh * (m - h1); hiE += (m - h1) * (m - h1);
    }
    const n = Math.max(1, b - a);
    return { peak, rms: Math.sqrt((sl + sr) / (2 * n)), l: Math.sqrt(sl / n), r: Math.sqrt(sr / n), first: first < 0 ? -1 : first / SR, last: last < 0 ? -1 : last / SR, low: mE ? loE / mE : 0, hi: Math.sqrt(hiE / n), hot, nan };
  };
  // 在渲染進行到 AT 秒時才觸發：context 剛啟動的前幾毫秒會把 t=0 的瞬態量低
  const AT = 0.25;
  const renderWith = async (ctx, fn) => { let ret; ctx.suspend(AT).then(() => { ret = fn(); ctx.resume(); }); const buf = await ctx.startRendering(); return { buf, ret }; };
  const out = { kinds: {}, pan: {}, ambience: {}, cues: {} };

  const KINDS = { whisper: 4, breath: 4.5, stinger: 5, sub: 6, stepBehind: 2.5, knock: 3.5, scrape: 4.5, slam: 4.5, hum: 12, static: 3, ring: 7.5, bellFar: 11, gasp: 2.5, marble: 5, howl: 6.5, sob: 7, creak: 3, drip: 2.5, heartbeat: 2, knock1: 2 };
  // intensity 1 與 2 用同一組亂數（程序化聲音帶隨機變化；不同亂數時兩次的峰值本身就會差 30%，比較會偶發失敗）
  const realRandom = Math.random;
  const seeded = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (const [kind, seconds] of Object.entries(KINDS)) {
    const row = {};
    for (const intensity of [1, 2]) {
      Math.random = seeded(kind.length * 7919 + kind.charCodeAt(0));
      const { ctx, sys } = make(seconds + AT);
      const { buf, ret } = await renderWith(ctx, () => ({ played: sys.horror(kind, { pan: 0.4, dist: 2, intensity }), ...sys.debug() }));
      const s = stats(buf);
      row[intensity === 1 ? 'i1' : 'i2'] = { played: ret.played, voices: ret.voices, nodes: ret.nodes, ...s, first: s.first - AT, last: s.last - AT, tail: s.last < 0 ? 0 : seconds - s.last };
    }
    out.kinds[kind] = row;
  }
  Math.random = realRandom;
  // 未知的 kind 不可丟例外
  { const { sys } = make(1); out.unknown = sys.horror('no-such-kind'); out.noArgs = sys.horror('knock'); }

  // 方位：同一個音效放在最左與最右
  for (const kind of ['whisper', 'breath', 'stepBehind', 'knock', 'scrape', 'gasp', 'static']) {
    const row = {};
    for (const pan of [-1, 1]) {
      const { ctx, sys } = make(4, 'open');
      const s = stats((await renderWith(ctx, () => sys.horror(kind, { pan, dist: 1.5, intensity: 1 }))).buf);
      row[pan < 0 ? 'left' : 'right'] = 20 * Math.log10((s.l + 1e-9) / (s.r + 1e-9));
    }
    out.pan[kind] = row;
  }
  // 距離：近與遠
  {
    const row = {};
    for (const dist of [1, 25]) { const { ctx, sys } = make(3, 'open'); row['d' + dist] = stats((await renderWith(ctx, () => sys.horror('knock', { dist }))).buf).peak; }
    out.distance = row;
  }
  // 既有的提示音
  for (const [name, fn, seconds] of [
    ['footstep.dirt', (s) => s.footstep(0.65, 'dirt'), 1.5], ['footstep.stone', (s) => s.footstep(0.65, 'stone'), 1.5], ['footstep.wood', (s) => s.footstep(0.65, 'wood'), 1.5],
    ['footstep.gravel', (s) => s.footstep(0.65, 'gravel'), 1.5], ['footstep.grass', (s) => s.footstep(0.65, 'grass'), 1.5], ['footstep.sprint', (s) => s.footstep(1.4, 'wood'), 1.5],
    ['creak', (s) => s.creak(), 2], ['click', (s) => s.click(), 1], ['bell', (s) => s.bell(1), 9], ['woodenFish', (s) => s.woodenFish(4), 5], ['breathCue', (s) => s.breathCue(), 2.5],
    ['storyCue.clue', (s) => s.storyCue('clue'), 2], ['storyCue.gate', (s) => s.storyCue('gate'), 3.5], ['storyCue.threat', (s) => s.storyCue('threat'), 3.5], ['storyCue.release', (s) => s.storyCue('release'), 9],
    ['phoneRing', (s) => s.phoneRing(), 2], ['presence', (s) => s.presence(-0.65), 2], ['doorKnock', (s) => s.doorKnock(1), 2],
    ['footstep.home', (s) => { s.profile = 'home'; s.footstep(0.65, 'wood'); }, 1.5],
    // 環境裡偶發的事件（排在音訊時鐘上，走可被 duck 抽掉的環境匯流排）
    ['amb.woodTick', (s) => s._woodTick(0.3), 2], ['amb.drip', (s) => { s._setSpace('crypt'); s._drip(0.3); }, 4], ['amb.rustle', (s) => s._rustle(0.3), 2],
    ['amb.bark', (s) => { s._setSpace('open'); s._bark(0.3); }, 4], ['amb.howl', (s) => { s._setSpace('open'); s._howl(0.3, { pan: 0.3, dist: 48, gain: 0.8 }); }, 6],
    ['amb.thunder', (s) => { s._setSpace('room'); s._thunder(0.3); }, 7], ['amb.heartbeat', (s) => s._beat(0.3, 1, 0.5), 1.5],
  ]) {
    const { ctx, sys } = make(seconds);
    out.cues[name] = stats((await renderWith(ctx, () => fn(sys))).buf);
  }

  // 各空間的環境聲（穩定後的 8 秒）
  const ambient = async (profile, zone, indoor, { tension = 0, released = false, gust = 0.6, seconds = 16, duckAt = 0, duckFor = 0 } = {}) => {
    const { ctx, sys } = make(seconds, 'open');
    sys.profile = profile; sys.released = released;
    sys.setTension(tension);
    sys._nextGust = 1e9; sys._gust = gust; sys._nextChirp = 1e9; sys._bugOn = 1;
    for (let i = 0; i < 4; i++) { sys.zone = zone; sys.update(5, indoor); }
    sys._pump(seconds);
    if (duckAt) ctx.suspend(duckAt).then(() => { sys.duck(duckFor); ctx.resume(); });
    const buf = await ctx.startRendering();
    return { buf, sys };
  };
  for (const [name, profile, zone, indoor, opt] of [
    ['temple.open', null, null, 0], ['temple.open.calm', null, null, 0, { gust: 0.05 }], ['temple.grave', null, 'grave', 0], ['temple.hall', null, null, 1], ['temple.crypt', null, 'crypt', 1],
    ['road.open', 'road', null, 0], ['road.workshop', 'road', null, 1], ['home.room', 'home', null, 1],
    ['temple.hall.tension1', null, null, 1, { tension: 1 }], ['temple.open.tension0.6', null, null, 0, { tension: 0.6 }], ['temple.open.released', null, null, 0, { released: true }],
  ]) {
    const { buf, sys } = await ambient(profile, zone, indoor, opt);
    out.ambience[name] = { ...stats(buf, 8, 16), space: sys.space };
  }
  // duck：第 8 秒抽空 3 秒
  {
    const { buf } = await ambient(null, null, 0, { seconds: 22, duckAt: 8, duckFor: 3, gust: 0.8 });
    out.duck = { before: stats(buf, 5, 8).rms, during: stats(buf, 8.4, 11).rms, after: stats(buf, 18, 22).rms };
    const h = await ambient('home', null, 1, { seconds: 22, duckAt: 8, duckFor: 3 });
    out.duckHome = { before: stats(h.buf, 5, 8).rms, during: stats(h.buf, 8.4, 11).rms, after: stats(h.buf, 18, 22).rms };
  }
  return out;
});

console.log('\n── horror(kind)：離線渲染（大殿殘響、dist 2、pan 0.4）──');
console.log('kind         峰值(i=1)  dBFS   RMS dB  開始   結束    峰值(i=2)  節點');
for (const [kind, { i1, i2 }] of Object.entries(offline.kinds)) {
  console.log(`${kind.padEnd(12)} ${i1.peak.toFixed(3).padStart(8)} ${dB(i1.peak).padStart(6)} ${dB(i1.rms).padStart(7)} ${i1.first.toFixed(2).padStart(6)} ${i1.last.toFixed(2).padStart(6)}  ${i2.peak.toFixed(3).padStart(8)} ${String(i1.nodes).padStart(5)}`);
  check(i1.played === true, `${kind}: horror() 沒有回傳 true`);
  check(i1.nan === 0 && i2.nan === 0, `${kind}: 輸出含 NaN`);
  check(i1.peak > 0.01, `${kind}: 幾乎無聲（峰值 ${i1.peak.toFixed(4)}）`);
  check(i1.peak < 0.9 && i2.peak < 0.99, `${kind}: 峰值過高 i1=${i1.peak.toFixed(3)} i2=${i2.peak.toFixed(3)}`);
  check(i1.hot === 0 && i2.hot === 0, `${kind}: 有 ${i1.hot}/${i2.hot} 個取樣頂到限幅`);
  check(i1.tail > 0.25, `${kind}: 渲染結束時還有聲音（尾巴沒收乾淨或長度估太短）`);
  check(i2.peak >= i1.peak * 0.98, `${kind}: intensity 2 沒有比 1 大聲`);
}
check(offline.unknown === false, '未知 kind 應回傳 false');
check(offline.noArgs === true, 'horror(kind) 不帶參數應可播放');

console.log('\n── 方位（左聲道 − 右聲道，dB；左應為正、右應為負）──');
for (const [kind, { left, right }] of Object.entries(offline.pan)) {
  console.log(`${kind.padEnd(12)} pan=-1 ${left.toFixed(1).padStart(6)} dB   pan=+1 ${right.toFixed(1).padStart(6)} dB`);
  check(left > 3 && right < -3, `${kind}: 方位感不足（${left.toFixed(1)} / ${right.toFixed(1)} dB）`);
}
console.log(`距離：knock 1 m 峰值 ${offline.distance.d1.toFixed(3)} → 25 m 峰值 ${offline.distance.d25.toFixed(3)}`);
check(offline.distance.d25 < offline.distance.d1 * 0.5, '距離衰減不足');

console.log('\n── 既有提示音 ──');
for (const [name, s] of Object.entries(offline.cues)) {
  console.log(`${name.padEnd(18)} 峰值 ${s.peak.toFixed(3)} (${dB(s.peak)} dBFS)  RMS ${dB(s.rms)} dB`);
  check(s.peak > 0.004 && s.peak < 0.9 && s.nan === 0, `${name}: 峰值異常 ${s.peak.toFixed(4)}`);
}

console.log('\n── 環境聲（穩定後 8 秒）──');
console.log('場景                     空間      RMS dBFS  峰值    120Hz 以下能量佔比  1kHz 以上 RMS dBFS');
for (const [name, s] of Object.entries(offline.ambience)) {
  console.log(`${name.padEnd(24)} ${s.space.padEnd(9)} ${dB(s.rms).padStart(7)}  ${s.peak.toFixed(3)}  ${(s.low * 100).toFixed(0).padStart(3)}%   ${dB(s.hi).padStart(7)}`);
  check(s.rms > 0.0004, `${name}: 環境聲幾乎無聲`);
  check(s.peak < 0.8 && s.nan === 0, `${name}: 環境聲峰值過高 ${s.peak.toFixed(3)}`);
  if (!name.includes('tension')) check(s.rms < 0.09, `${name}: 環境底噪太大（RMS ${dB(s.rms)} dBFS），容易聽覺疲勞`);
}
check(offline.ambience['temple.hall.tension1'].rms > offline.ambience['temple.hall'].rms * 1.3, 'setTension(1) 沒有明顯疊上緊張層');
check(offline.ambience['temple.open.released'].rms < offline.ambience['temple.open'].rms, '釋放後的環境聲應該比較安靜');

const dk = offline.duck, dh = offline.duckHome;
console.log(`\n── duck(3)：寺廟戶外 前 ${dB(dk.before)} → 中 ${dB(dk.during)} → 後 ${dB(dk.after)} dBFS；住處 前 ${dB(dh.before)} → 中 ${dB(dh.during)} → 後 ${dB(dh.after)} dBFS`);
check(dk.during < dk.before * 0.05, 'duck 期間寺廟環境聲沒有抽空');
check(dk.after > dk.before * 0.5, 'duck 之後寺廟環境聲沒有回來');
check(dh.during < dh.before * 0.05 && dh.after > dh.before * 0.5, 'duck 在住處無效');

// ───── 4：真實 AudioContext 的節點釋放 ─────
await page.goto(ORIGIN + '/?auto&map=home');
await page.waitForFunction(() => window.__game?.map && window.__game.running && window.__game.audio.ctx, null, { timeout: 180000 });
await page.waitForTimeout(600);
const live = await page.evaluate(async () => {
  const a = window.__game.audio, ctx = a.ctx;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const an = ctx.createAnalyser(); an.fftSize = 2048; a.out.connect(an);
  const buf = new Float32Array(an.fftSize);
  const peakNow = () => { an.getFloatTimeDomainData(buf); let p = 0; for (const x of buf) p = Math.max(p, Math.abs(x)); return p; };
  const res = { state: ctx.state, api: ['horror', 'setTension', 'duck', 'footstep', 'creak', 'click', 'bell', 'woodenFish', 'breathCue', 'storyCue', 'phoneRing', 'presence', 'doorKnock'].filter((k) => typeof a[k] !== 'function') };
  res.idle = a.debug();
  // HRTF 在即時 context 也要出得了聲（資料庫是非同步載入的）
  a.horror('whisper', { pan: -1, dist: 0.4 });
  let hp = 0; for (let i = 0; i < 12; i++) { await sleep(120); hp = Math.max(hp, peakNow()); }
  res.hrtfPeak = hp;
  await sleep(2500);
  // (a) 同一個 kind 每幀狂按：冷卻時間要擋下來
  let played = 0;
  for (let i = 0; i < 200; i++) if (a.horror('stinger')) played++;
  res.spamPlayed = played; res.spamVoices = a.debug().voices;
  // (b) 繞過冷卻連發 120 個：存活數不可超過上限
  const kinds = ['whisper', 'breath', 'stinger', 'sub', 'stepBehind', 'knock', 'scrape', 'slam', 'hum', 'static', 'ring', 'bellFar', 'gasp', 'marble', 'howl', 'sob'];
  let maxVoices = 0, maxNodes = 0, livePeak = 0;
  for (let i = 0; i < 120; i++) {
    a._last = Object.create(null);
    a.horror(kinds[i % kinds.length], { pan: Math.sin(i), dist: 1 + (i % 9), intensity: 1 });
    const d = a.debug(); maxVoices = Math.max(maxVoices, d.voices); maxNodes = Math.max(maxNodes, d.nodes);
    if (i % 10 === 9) { await sleep(60); livePeak = Math.max(livePeak, peakNow()); }
  }
  res.maxVoices = maxVoices; res.maxNodes = maxNodes; res.livePeak = livePeak;
  // (c) 腳步 + 心跳跑 3 秒
  a.setTension(1);
  for (let i = 0; i < 30; i++) { a.footstep(0.65, ['wood', 'stone', 'dirt'][i % 3]); await sleep(100); livePeak = Math.max(livePeak, peakNow()); }
  res.tensionVoices = a.debug().voices;
  a.setTension(0);
  // (d) 等最長的音效（哼唱、遠鐘約 9 秒）播完，應該全部釋放
  await sleep(11500);
  res.after = a.debug();
  res.livePeak = livePeak;
  a.duck(0.3);
  return res;
});
console.log(`\n── 真實 AudioContext（${live.state}）──`);
console.log(`閒置 voices=${live.idle.voices}；同 kind 連按 200 次只播 ${live.spamPlayed} 次；繞過冷卻連發 120 個：同時最多 ${live.maxVoices} 個 voice／${live.maxNodes} 個節點；心跳＋腳步時 ${live.tensionVoices} 個；全部播完後 voices=${live.after.voices} nodes=${live.after.nodes}；輸出峰值 ${live.livePeak.toFixed(3)}；HRTF 低語峰值 ${live.hrtfPeak.toFixed(3)}`);
check(live.api.length === 0, `缺少介面：${live.api.join(', ')}`);
check(live.state === 'running', `AudioContext 狀態是 ${live.state}`);
check(live.spamPlayed === 1, `冷卻沒有擋下連按（播了 ${live.spamPlayed} 次）`);
check(live.maxVoices <= 26, `同時存在的 voice 超過上限：${live.maxVoices}`);
check(live.after.voices === 0 && live.after.nodes === 0, `播完後仍有 ${live.after.voices} 個 voice／${live.after.nodes} 個節點未釋放`);
check(live.hrtfPeak > 0.01, `HRTF 低語在即時 context 幾乎無聲（峰值 ${live.hrtfPeak.toFixed(4)}）`);
check(live.livePeak > 0.01 && live.livePeak < 0.99, `真實輸出峰值異常 ${live.livePeak.toFixed(3)}`);

fs.writeFileSync(`${OUT}/audio-report.json`, JSON.stringify({ offline, live }, null, 1));
await browser.close();
if (errors.length) { console.log('\n--- console ---\n' + [...new Set(errors)].slice(0, 20).join('\n')); failures.push(`頁面有 ${errors.length} 個錯誤`); }
if (failures.length) { console.log(`\n失敗 ${failures.length} 項：\n- ` + failures.join('\n- ')); process.exit(1); }
console.log('\natmos-audio：全部通過');
