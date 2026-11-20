// 配樂與節奏組（score）的驗證：離線渲染代表情境，量 K 加權響度、峰值、死寂、riser 對準爆點，輸出試聽 WAV。
// 用法：node scripts/audio-score.mjs            （需要 5178 的開發伺服器；GAME_ORIGIN 可覆寫；SKIP_LIVE=1 跳過真實遊戲頁）
//   1. 素材：每張地圖的 score 素材都載得到、已解碼記憶體 ≤ 25 MB、建置輸出 ≤ 10 MB
//   2. 導演的一個完整循環 build → approach → peak → 爆點 → calm：逼近比鋪陳大聲、爆點前死寂、爆點最大、之後至少 30 秒安靜
//   3. riser：結尾精準落在爆點（±15 ms），含「漸強 → 死寂 → 爆」與倒吸兩種
//   4. 追逐、捉迷藏（數數、好了沒的死寂、背後的抽空）、結局 C 的幾段（點名對齊、riser 落在 duck、小雨自己應的那一聲）
//   5. 主題動機與住處、沒有素材時的程序化退回；最後在真實遊戲頁（?auto）確認沒有錯誤
// 試聽：artifacts/audio/score/*.wav（「-mix」是含環境聲的完整混音）
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const ORIGIN = process.env.GAME_ORIGIN || 'http://127.0.0.1:5178';
const OUT = 'artifacts/audio/score';
fs.mkdirSync(OUT, { recursive: true });
const failures = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); return ok; };

const browser = await chromium.launch({ channel: process.env.BROWSER || 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.stack || e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
await page.goto(ORIGIN + '/');
await page.waitForFunction(() => !!window.__game, null, { timeout: 120000 });

// ───────── 頁面裡的渲染器 ─────────
await page.evaluate(() => {
  const SR = 48000;
  function kBlocks(L, R) {
    const kw = (x) => {
      const y = new Float32Array(x.length);
      const b1 = [1.53512485958697, -2.69169618940638, 1.19839281085285], a1 = [-1.69065929318241, 0.73248077421585];
      const b2 = [1, -2, 1], a2 = [-1.99004745483398, 0.99007225036621];
      let x1 = 0, x2 = 0, y1 = 0, y2 = 0, u1 = 0, u2 = 0, z1 = 0, z2 = 0;
      for (let i = 0; i < x.length; i++) {
        const v = b1[0] * x[i] + b1[1] * x1 + b1[2] * x2 - a1[0] * y1 - a1[1] * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v;
        const w = b2[0] * v + b2[1] * u1 + b2[2] * u2 - a2[0] * z1 - a2[1] * z2; u2 = u1; u1 = v; z2 = z1; z1 = w; y[i] = w;
      }
      return y;
    };
    const kl = kw(L), kr = kw(R), win = Math.floor(SR * 0.4), hop = Math.floor(SR * 0.1), out = [];
    const cl = new Float64Array(kl.length + 1), cr = new Float64Array(kr.length + 1);
    for (let i = 0; i < kl.length; i++) { cl[i + 1] = cl[i] + kl[i] * kl[i]; cr[i + 1] = cr[i] + kr[i] * kr[i]; }
    for (let s = 0; s + win <= kl.length; s += hop) { const e = (cl[s + win] - cl[s] + cr[s + win] - cr[s]) / win; out.push(+(-0.691 + 10 * Math.log10(e + 1e-12)).toFixed(2)); }
    return out;
  }
  /** 在 [t - w, t + w] 找能量比前 60 ms 跳最多的 2 ms 窗（起音時間） */
  function onsetNear(L, R, t, w = 0.08, hp = false) {
    const f = Math.floor(SR * 0.002), a = Math.max(31, Math.floor((t - w) * SR / f)), b = Math.floor((t + w) * SR / f);
    const M = (i) => ((L[i] || 0) + (R[i] || 0)) * 0.5;
    // hp：二階差分（+12 dB/八度），只看高頻的起音，不會被心跳之類的低頻悶響騙到
    const e = (k) => { let s = 0; for (let i = k * f; i < (k + 1) * f; i++) { const d = hp ? M(i) - 2 * M(i - 1) + M(i - 2) : M(i) - M(i - 1) * 0.9; s += d * d; } return s / f + 1e-14; };
    let best = -1, bt = t;
    for (let k = a; k <= b; k++) { let prev = 0; for (let j = 1; j <= 30; j++) prev += e(k - j); prev /= 30; const r = e(k) / prev; if (r > best) { best = r; bt = (k * f) / SR; } }
    return { t: +bt.toFixed(4), ratio: +(10 * Math.log10(best)).toFixed(1) };
  }
  /** 在 [t - w, t + w] 找聲音「結束」的時間：最後一個能量還在前 0.5 秒最大值 -30 dB 以內的 2 ms 窗的結尾 */
  function offsetNear(L, R, t, w = 0.08) {
    const f = Math.floor(SR * 0.002), e = (k) => { let s = 0; for (let i = k * f; i < (k + 1) * f; i++) { const m = (L[i] + R[i]) * 0.5; s += m * m; } return s / f + 1e-14; };
    const a = Math.floor((t - w) * SR / f), b = Math.floor((t + w) * SR / f);
    let mx = 0; for (let k = Math.floor((t - 0.5) * SR / f); k < a; k++) mx = Math.max(mx, e(k));
    let last = a; for (let k = a; k <= b; k++) if (e(k) > mx * 0.001) last = k;
    return { t: +(((last + 1) * f) / SR).toFixed(4) };
  }
  function wav16(L, R) {
    const n = L.length, data = new DataView(new ArrayBuffer(44 + n * 4));
    const w = (o, s) => { for (let i = 0; i < s.length; i++) data.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); data.setUint32(4, 36 + n * 4, true); w(8, 'WAVE'); w(12, 'fmt '); data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 2, true);
    data.setUint32(24, SR, true); data.setUint32(28, SR * 4, true); data.setUint16(32, 4, true); data.setUint16(34, 16, true); w(36, 'data'); data.setUint32(40, n * 4, true);
    for (let i = 0; i < n; i++) { data.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true); data.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true); }
    const bytes = new Uint8Array(data.buffer); let bin = ''; for (let i = 0; i < bytes.length; i += 32768) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768));
    return btoa(bin);
  }
  window.__scoreRender = async ({ seconds, mapId = 'temple', body, muteAmb = false, wav = false, onsets = [], offsets = [], preload = true }) => {
    const { AudioSys } = await import('/src/core/AudioSys.js');
    const ctx = new OfflineAudioContext(2, Math.ceil(SR * seconds), SR);
    const a = new AudioSys(); a.init(ctx); a.start();
    a.master.gain.cancelScheduledValues(0); a.master.gain.value = 0.8;
    a.profile = mapId === 'home' ? 'home' : mapId === 'road' ? 'road' : null;
    const stats = preload ? await a.bank.preload(mapId) : a.bank.stats();
    a.mapReady(mapId);
    if (muteAmb) { try { a.ambIn.disconnect(); a.ambWet.disconnect(); a.droneMix.disconnect(); } catch { /* 已斷 */ } }
    // 只算 score 的已解碼記憶體
    let scoreBytes = 0, scoreFiles = 0; const missing = [];
    for (const [id, e] of Object.entries(a.bank.library)) {
      if (!id.startsWith('score.') || !(e.maps || []).some((m) => m === mapId || m === 'all')) continue;
      const n = (e.files || []).length;
      for (let v = 0; v < n; v++) { const b = a.bank.buffer(id, v); if (b) { scoreBytes += b.length * b.numberOfChannels * 4; scoreFiles++; } else missing.push(id + '#' + v); }
    }
    const g = { audio: a, story: { scene: null, chase: null, finale: null, world: { ghost: { root: { position: { x: 12, y: 0, z: 0 }, visible: true } } }, state: { evidence: [], flags: {} } }, player: { pos: { x: 0, y: 0, z: 0 } } };
    a.score?.bindGame(g);
    const trace = a.score?.traceOn() || [];
    let space = mapId === 'home' ? 'room' : 'open';
    const setSpace = (s) => { space = s; };
    const tick = (dt) => { a.zone = space; a.update(dt, space === 'open' || space === 'grave' ? 0 : 1); };
    const queue = [], snaps = {};
    let modal = false; const setModal = (on) => { modal = !!on; }; // 模擬閱讀：遊戲不呼叫 update，只剩 _pump 的計時器
    const at = (t, fn) => { queue.push({ t, fn }); queue.sort((x, y) => x.t - y.t); };
    const snap = (label) => { snaps[label] = a.score ? JSON.parse(JSON.stringify(a.score.state)) : null; };
    const step = 1 / 30;
    for (let k = 1; k * step < seconds - 0.01; k++) {
      const tt = k * step;
      ctx.suspend(tt).then(() => {
        while (queue.length && queue[0].t <= tt + 1e-6) { const q = queue.shift(); try { q.fn(); } catch (e) { console.error(e); } }
        if (!modal) { tick(step); a._pump(tt + 0.5); } else if (k % 8 === 0) a._pump(); ctx.resume();
      });
    }
    await (new Function('a', 'at', 'tick', 'setSpace', 'ctx', 'g', 'snap', 'setModal', `return (async () => { ${body} })();`))(a, at, tick, setSpace, ctx, g, snap, setModal);
    const buf = await ctx.startRendering();
    const L = buf.getChannelData(0), R = buf.getChannelData(1);
    let peak = 0, nan = 0, hot = 0;
    for (let i = 0; i < L.length; i++) { const p = Math.max(Math.abs(L[i]), Math.abs(R[i])); if (!Number.isFinite(p)) { nan++; continue; } if (p > peak) peak = p; if (p >= 0.97) hot++; }
    return {
      peak, nan, hot, blocks: kBlocks(L, R), onsets: onsets.map((o) => ({ want: o.t, ...onsetNear(L, R, o.t, o.w, o.hp) })), offsets: offsets.map((o) => ({ want: o.t, ...offsetNear(L, R, o.t, o.w) })), snaps,
      trace, bank: stats, scoreMB: +(scoreBytes / 1048576).toFixed(2), scoreFiles, missing, loaded: !!a.score?.loaded, layerMul: { ...a.layerMul },
      wav: wav ? wav16(L, R) : null,
    };
  };
});

// ───────── node 端的小工具 ─────────
const blkAvg = (bl, t0, t1) => { let e = 0, n = 0; bl.forEach((v, i) => { const c = i * 0.1 + 0.2; if (c >= t0 && c <= t1) { e += Math.pow(10, v / 10); n++; } }); return n ? 10 * Math.log10(e / n) : -99; };
const blkMax = (bl, t0, t1) => { let m = -99; bl.forEach((v, i) => { const c = i * 0.1 + 0.2; if (c >= t0 && c <= t1) m = Math.max(m, v); }); return m; };
const f1 = (x) => (x > -98 ? x.toFixed(1) : '-inf');
const dB = (x) => (x > 0 ? 20 * Math.log10(x) : -99);
async function render(name, spec) {
  const t0 = Date.now();
  const r = await page.evaluate((s) => window.__scoreRender(s), spec);
  if (r.wav) { fs.writeFileSync(`${OUT}/${name}.wav`, Buffer.from(r.wav, 'base64')); delete r.wav; }
  fs.writeFileSync(`${OUT}/${name}.json`, JSON.stringify({ ...r, blocks: undefined, loudness_100ms: r.blocks }, null, 1));
  console.log(`\n── ${name}（${spec.seconds}s ${spec.mapId || 'temple'}${spec.muteAmb ? '，只量配樂' : ''}）峰值 ${dB(r.peak).toFixed(1)} dBFS　渲染 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  check(r.nan === 0, `${name}: 沒有 NaN`);
  check(r.peak < 0.944, `${name}: 樣本峰值 < -0.5 dBFS（${dB(r.peak).toFixed(2)}）`);
  check(r.hot === 0, `${name}: 沒有頂到柔性限幅（${r.hot} 個樣本 ≥ 0.97）`);
  return r;
}

// ───────── 1. 素材與預算 ─────────
console.log('── 素材與預算');
const disk = fs.readdirSync('public/assets/audio/score').filter((f) => f.endsWith('.ogg')).reduce((s, f) => s + fs.statSync(path.join('public/assets/audio/score', f)).size, 0);
check(disk <= 10 * 1048576, `建置輸出（public/assets/audio/score）${(disk / 1048576).toFixed(2)} MB ≤ 10 MB`);
const budget = {};
{
  // 寺廟的 score 素材：全部同時下載＋解碼要多久（實際載入時和貼圖並行，這是額外時間的上限）
  const ms = await page.evaluate(async () => {
    const { LIBRARY } = await import('/src/audio/library.js');
    const files = [...new Set(Object.entries(LIBRARY).filter(([id, e]) => id.startsWith('score.') && (e.maps || []).includes('temple')).flatMap(([, e]) => e.files))];
    const ctx = new OfflineAudioContext(2, 48000, 48000), t0 = performance.now();
    await Promise.all(files.map((f) => fetch('/assets/audio/' + f, { cache: 'no-store' }).then((r) => r.arrayBuffer()).then((ab) => ctx.decodeAudioData(ab))));
    return Math.round(performance.now() - t0);
  });
  budget.templeLoadMs = ms;
  check(ms < 1000, `temple: score 素材全部下載＋解碼 ${ms} ms（< 1000 ms，且與貼圖並行）`);
}
for (const mapId of ['temple', 'road', 'home']) {
  const r = await page.evaluate((s) => window.__scoreRender(s), { seconds: 0.2, mapId, body: '' });
  budget[mapId] = { mb: r.scoreMB, files: r.scoreFiles, missing: r.missing, loaded: r.loaded, layerMul: r.layerMul };
  check(r.missing.length === 0 && r.scoreFiles > 0, `${mapId}: score 素材全部載入（${r.scoreFiles} 個檔案${r.missing.length ? '，缺 ' + r.missing.join(',') : ''}）`);
  check(r.scoreMB <= 25, `${mapId}: score 已解碼 ${r.scoreMB} MB ≤ 25 MB`);
  check(r.loaded && r.layerMul.strings === 0 && r.layerMul.heartbeat === 0, `${mapId}: 引擎啟用，程序化高頻弦音與心跳讓位（strings=${r.layerMul.strings} heartbeat=${r.layerMul.heartbeat} drone=${r.layerMul.drone}）`);
}

// ───────── 2. 導演循環 ─────────
const CYCLE = `
setSpace('hall');
at(0.2, () => { a.score.phase('build'); a.setTension(0.42); });
at(20, () => { a.score.phase('approach'); a.setTension(0.62); });
at(28, () => a.setTension(0.8));
at(34, () => { a.score.phase('peak'); a.setTension(0.95); });
at(36.5, () => a.horror('stinger', { intensity: 1, pan: 0.3 }));
at(36.8, () => a.horror('ring', { intensity: 0.8 }));
at(38.5, () => { a.score.phase('calm'); a.setTension(0.35); });
at(12, () => snap('build')); at(31, () => snap('approach')); at(35.5, () => snap('peak')); at(45, () => snap('calm')); at(61.5, () => snap('end'));
`;
{
  const r = await render('cycle', { seconds: 62, body: CYCLE, muteAmb: true, onsets: [{ t: 36.5, w: 0.05 }] });
  const b = r.blocks, build = blkAvg(b, 6, 19.5), appr = blkAvg(b, 28, 33.8), pre = blkAvg(b, 34.7, 36.28), hitMax = blkMax(b, 36.4, 37.6), all = blkMax(b, 0, 62), calm = blkAvg(b, 45, 61.5), late = blkAvg(b, 55, 61.5);
  console.log(`   鋪陳 ${f1(build)}　逼近 ${f1(appr)}　爆點前 ${f1(pre)}　爆點 ${f1(hitMax)}（全段最大 ${f1(all)}）　喘息 ${f1(calm)}（最後 ${f1(late)}） LUFS(M)`);
  console.log(`   狀態：approach ${JSON.stringify(r.snaps.approach?.targets)}　end quietFor=${r.snaps.end?.quietFor}`);
  check(appr - build >= 6, `cycle: 逼近比鋪陳大至少 6 LU（${(appr - build).toFixed(1)}）`);
  check(build < -34, `cycle: 鋪陳只是悄悄爬進來（${f1(build)} < -34 LUFS）`);
  check(pre <= appr - 15, `cycle: 爆點前真的死寂（比逼近低 ${(appr - pre).toFixed(1)} LU ≥ 15）`);
  check(hitMax >= appr + 6 && hitMax >= all - 0.01, `cycle: 爆點是全段最大、比逼近大 ${(hitMax - appr).toFixed(1)} LU ≥ 6`);
  check(Math.abs(r.onsets[0].t - 36.5) <= 0.02, `cycle: 爆點準時（起音 ${r.onsets[0].t}s，目標 36.5s）`);
  check(calm <= appr - 12 && (r.snaps.end?.quietFor || 0) > 0, `cycle: 爆點後至少 30 秒喘息（喘息段 ${f1(calm)}，比逼近低 ${(appr - calm).toFixed(1)} LU；61.5s 時仍在安靜期 ${r.snaps.end?.quietFor}s）`);
  check(r.snaps.approach?.targets.pulse > 0.5 && r.snaps.peak?.silentFor > 0, 'cycle: 逼近有脈動、peak 進入死寂');
  await render('cycle-mix', { seconds: 62, body: CYCLE, wav: true });
}

// ───────── 3. riser 對準爆點 ─────────
{
  // A：只放 riser（不排爆點），量它「結束」的時間 = 爆點應該落下的時間；同時記下 onHit 回呼被叫到的音訊時間
  const bodyA = `
setSpace('open');
window.__hitAt = [];
g.story.scene = 'dread:test'; // 段落模式且沒有對應的段落：持續層全部靜音，只量 riser
at(1.0, () => a.score.riser(4, () => window.__hitAt.push(ctx.currentTime), { kind: 'up' }));
at(9.0, () => a.score.riser(5, () => window.__hitAt.push(ctx.currentTime), { gap: 0.6, kind: 'up', amb: false }));
at(18.0, () => a.score.riser(2.5, () => window.__hitAt.push(ctx.currentTime), { kind: 'rev' }));
at(23.5, () => snap('end'));`;
  const rA = await render('riser-only', { seconds: 24, body: bodyA, muteAmb: true, offsets: [{ t: 5.0, w: 0.1 }, { t: 13.4, w: 0.1 }, { t: 20.5, w: 0.1 }] });
  const hitAt = await page.evaluate(() => window.__hitAt);
  const [e1, e2, e3] = rA.offsets;
  console.log(`   riser 結束：${e1.t}（目標 5.0）、${e2.t}（目標 13.4，之後死寂 0.6 秒）、${e3.t}（目標 20.5）；onHit 回呼在 ${hitAt.map((x) => x.toFixed(3)).join(', ')}`);
  const b = rA.blocks;
  check(blkAvg(b, 4.3, 4.75) >= blkAvg(b, 1.4, 1.9) + 12, `riser: 一路漸強（結尾比開頭大 ${(blkAvg(b, 4.3, 4.75) - blkAvg(b, 1.4, 1.9)).toFixed(1)} LU ≥ 12）`);
  check(Math.abs(e1.t - 5.0) <= 0.012, `riser: 漸強結尾精準落在爆點（${((e1.t - 5.0) * 1000).toFixed(1)} ms）`);
  check(Math.abs(e2.t - 13.4) <= 0.012, `riser+gap: 漸強在爆點前 0.6 秒收掉（${((e2.t - 13.4) * 1000).toFixed(1)} ms）`);
  check(Math.abs(e3.t - 20.5) <= 0.012, `riser.rev: 倒吸結尾精準落在爆點（${((e3.t - 20.5) * 1000).toFixed(1)} ms）`);
  check(hitAt.length === 3 && [5.0, 14.0, 20.5].every((t, i) => hitAt[i] >= t - 0.001 && hitAt[i] <= t + 0.05), 'riser: onHit 回呼在爆點那一刻（一幀以內）被叫到');
  // B：排上爆點（試聽），量死寂與爆點起音
  const bodyB = `
setSpace('open');
at(1.0, () => a.score.riser(4, null, { hit: 'big', kind: 'up' }));
at(9.0, () => a.score.riser(5, null, { hit: 'small', gap: 0.6, kind: 'up' }));
at(18.0, () => a.score.riser(2.5, null, { hit: 'big', kind: 'rev' }));`;
  const r = await render('riser', { seconds: 24, body: bodyB, muteAmb: true, wav: true, onsets: [{ t: 14.0, w: 0.05 }, { t: 20.5, w: 0.05 }] });
  const bb = r.blocks, [o2, o3] = r.onsets;
  check(blkAvg(bb, 13.62, 13.78) <= blkAvg(bb, 12.6, 13.1) - 20, `riser+gap: 漸強之後真的先死寂（${(blkAvg(bb, 12.6, 13.1) - blkAvg(bb, 13.62, 13.78)).toFixed(1)} LU ≥ 20）`);
  check(Math.abs(o2.t - 14.0) <= 0.015, `riser+gap: 死寂之後準時爆（${((o2.t - 14.0) * 1000).toFixed(1)} ms）`);
  check(Math.abs(o3.t - 20.5) <= 0.02, `riser.rev: 倒吸之後的爆點準時（${((o3.t - 20.5) * 1000).toFixed(1)} ms）`);
}

// ───────── 4a. 追逐 ─────────
{
  // 應了它：先在遠處追（兩個循環），再一口氣逼近、貼著追一個循環，最後逃進燈下（反應層會 duck 3 秒）
  const body = `
setSpace('hall');
const gp = g.story.world.ghost.root.position;
at(0.3, () => { a.score.phase('build'); a.setTension(0.4); });
at(1.0, () => { g.story.chase = { source: 'test' }; a.storyCue('threat'); a.horror('stinger', { intensity: 1 }); a.setTension(1); });
for (let t = 16.3; t <= 17.6; t += 0.1) at(t, () => { gp.x = Math.max(1.2, 12 - (t - 16.3) * 9); });
at(12, () => snap('far')); at(21, () => snap('close'));
at(25.5, () => { g.story.chase = null; a.duck(3); a.setTension(0.3); });`;
  const loop = 7.619;
  const r = await render('chase', { seconds: 30, body, muteAmb: true, wav: true });
  const b = r.blocks, far = blkAvg(b, 8.7, 8.7 + loop - 0.4), close = blkAvg(b, 17.7, 17.7 + loop - 0.4), after = blkAvg(b, 26.9, 28.3);
  console.log(`   追逐（遠）${f1(far)}　追逐（貼近）${f1(close)}　逃開後 ${f1(after)}　far=${JSON.stringify(r.snaps.far?.stems)} close=${JSON.stringify(r.snaps.close?.stems)}`);
  check(r.snaps.far?.mode === 'chase' && r.snaps.far?.stems.chase > 0.25, 'chase: 進入追逐模式，追逐層上來');
  check(close >= far + 3, `chase: 它越近越大聲、越亮（+${(close - far).toFixed(1)} LU ≥ 3）`);
  check(close <= -14, `chase: 追逐層不壓過爆點與人聲（${f1(close)} ≤ -14 LUFS）`);
  check(after <= close - 15, `chase: 逃進燈下之後抽空（比追逐低 ${(close - after).toFixed(1)} LU）`);
}

// ───────── 4b. 捉迷藏 ─────────
{
  const body = `
setSpace('hall');
const W = (ph, n = 0, b = false) => a.score.watch('hideseek', ph, n, b);
g.story.scene = 'dread:hideseek';
at(0.1, () => { W('dark'); a.horror('sub', { intensity: 0.9 }); a.duck(1.6); a.setTension(0.6); });
for (let n = 1; n <= 10; n++) at(2.8 + n * 1.05, () => W('count', n));
at(14.2, () => W('call', 10));
at(19.6, () => W('search', 10));
at(25, () => a.horror('stinger', { intensity: 0.9 }));
at(31, () => W('sixth', 10, false));
at(34, () => W('sixth', 10, true));
at(36.5, () => a.horror('stinger', { intensity: 1 }));
at(36.7, () => W('end', 10, true));
at(38.9, () => { g.story.scene = null; });
at(13, () => snap('count9')); at(17, () => snap('call'));`;
  const r = await render('hideseek', { seconds: 46, body, muteAmb: true, wav: true, onsets: [{ t: 36.5, w: 0.05 }] });
  const b = r.blocks, c1 = blkAvg(b, 3.9, 6.0), c9 = blkAvg(b, 11.5, 14.0), call = blkAvg(b, 15, 19.3), six = blkAvg(b, 32, 33.9), behind = blkAvg(b, 34.4, 36.4), hitM = blkMax(b, 36.4, 37.5), lull = blkAvg(b, 39.2, 45);
  console.log(`   數一 ${f1(c1)}　數九 ${f1(c9)}　好了沒 ${f1(call)}　第六個 ${f1(six)}　背後 ${f1(behind)}　爆點 ${f1(hitM)}　童謠 ${f1(lull)}`);
  check(c9 >= c1 + 3, `hideseek: 數數時配樂一個數一個數往上爬（+${(c9 - c1).toFixed(1)} LU）`);
  check(call <= c9 - 12, `hideseek: 「好了沒」五個方向回答時完全死寂（比數數低 ${(c9 - call).toFixed(1)} LU）`);
  check(behind <= six - 15, `hideseek: 她在背後時抽空（比第六個低 ${(six - behind).toFixed(1)} LU）`);
  check(Math.abs(r.onsets[0].t - 36.5) <= 0.02 && hitM >= six + 6, `hideseek: 轉身那一下的爆點準時、有份量（起音 ${r.onsets[0].t}s，+${(hitM - six).toFixed(1)} LU）`);
  check(lull > -48, `hideseek: 結尾走音的八音盒（${f1(lull)} LUFS）`);
}

// ───────── 4c. 結局 C ─────────
{
  const body = `
setSpace('crypt');
const F = (ph) => { g.story.scene = 'finale'; g.story.finale = { active: true, phase: ph }; };
at(0.05, () => { F('c-name'); a.setTension(0.35); });
at(3.4, () => a.duck(6));
at(8.3, () => { a.setTension(0.6); a.horror('breath', {}); });
at(10.6, () => { F('c-walk'); a.setTension(0.7); });
at(14, () => a.setTension(0.85));
at(18.6, () => { F('c-relic'); a.setTension(0.55); });
at(21.2, () => a.horror('sub', { intensity: 0.9 }));
at(39.0, () => { a.duck(3); a.setTension(0.85); });
at(41.2, () => a.horror('stinger', { intensity: 0.55 }));
at(42.8, () => { F('c-six'); a.setTension(0.8); });
at(57.4, () => { F('c-held'); a.duck(4); a.setTension(0.45); });
at(66.8, () => { F('c-witness-ready'); });`;
  const counts = [26.4, 28.5, 30.6, 32.7, 34.8].map((t) => ({ t: t + 0.0, w: 0.06 }));
  const r = await render('finale-c', { seconds: 68, body, muteAmb: true, wav: true, onsets: [...counts, { t: 41.2, w: 0.05 }, { t: 44.6, w: 0.06, hp: true }, { t: 60.6, w: 0.08 }] });
  const b = r.blocks, os = r.onsets;
  const late = os.slice(0, 5).map((o) => Math.round((o.t - o.want) * 1000));
  console.log(`   點名五聲的起音誤差（ms）：${late.join(', ')}　第六聲 ${((os[6].t - 44.6) * 1000).toFixed(0)}　小雨自己應 ${((os[7].t - 60.6) * 1000).toFixed(0)}`);
  check(late.every((ms) => Math.abs(ms) <= 30), 'finale c-relic: 配樂的點名與「一、二、三、四、五」對齊（±30 ms）');
  const rise = blkAvg(b, 38.3, 38.95), before = blkAvg(b, 35.8, 36.6), dead = blkAvg(b, 39.4, 41.1);
  check(rise >= before + 5 && dead <= rise - 18, `finale c-relic: riser 漸強（+${(rise - before).toFixed(1)}）落在 duck，之後死寂（-${(rise - dead).toFixed(1)} LU）`);
  check(Math.abs(os[5].t - 41.2) <= 0.02, `finale c-relic: 轉頭的爆點準時（${os[5].t}s）`);
  const six = r.trace.filter(([id]) => id === 'score.count6').map(([, t]) => t);
  console.log(`   c-six 走音點名的排程：${six.join(', ')}（目標 44.6, 48.2, 51.2, 53.6, 54.2, 56.0）`);
  check([44.6, 48.2, 51.2, 53.6, 54.2, 56.0].every((t) => six.some((x) => Math.abs(x - t) <= 0.035)), 'finale c-six: 每一聲「六」都有走音的點名，時間對齊（±35 ms，以一幀 33 ms 推進）');
  check(Math.abs(os[7].t - 60.6) <= 0.04, 'finale c-held: 她自己應的那一聲，點名是對的');
}

// ───────── 5. 主題動機、住處、退回 ─────────
{
  const body = `
setSpace('open');
at(0.5, () => a.score.motif('qing'));
at(6.0, () => a.score.motif('rollcall', { gap: 0.55 }));
at(9.3, () => a.score.motif('count6'));
at(13.0, () => a.score.motif('lullaby', { windup: true }));
at(26.5, () => a.score.motif('lullaby-true'));
at(39.0, () => a.score.motif('meilan'));
at(48.5, () => a.score.motif('it'));`;
  const r = await render('motifs', { seconds: 55, body, wav: true });
  const b = r.blocks;
  for (const [n, t0, t1] of [['磬', 0.6, 4], ['點名', 6.1, 9.2], ['第六聲', 9.4, 11.5], ['八音盒（錯音）', 13.2, 23], ['八音盒（真結局）', 26.6, 36], ['美蘭', 39.2, 47], ['它', 49.5, 52.5]]) {
    const v = blkAvg(b, t0, t1);
    check(v > -40, `motifs: ${n} 聽得到（${f1(v)} LUFS）`);
  }
}
{
  const body = `
setSpace('room');
at(0.2, () => { a.score.phase('build'); a.setTension(0.3); });
at(10, () => { a.score.phase('approach'); a.setTension(0.5); });
at(22, () => { a.score.phase('peak'); });
at(24, () => a.horror('stinger', { intensity: 1 }));
at(25, () => { a.score.phase('calm'); a.setTension(0.1); });
at(26, () => snap('hit'));`;
  const r = await render('home', { seconds: 36, mapId: 'home', body, wav: true, onsets: [{ t: 24, w: 0.05, hp: true }] });
  check(r.snaps.hit?.lastHit.level === 'small', `home: 住處只用小爆點（${r.snaps.hit?.lastHit.level}）`);
  check(Math.abs(r.onsets[0].t - 24) <= 0.03, `home: 爆點準時（${r.onsets[0].t}s）`);
}
{
  const r = await page.evaluate(async () => {
    const { AudioSys } = await import('/src/core/AudioSys.js');
    const ctx = new OfflineAudioContext(2, 48000 * 3, 48000);
    const a = new AudioSys(); a.init(ctx); a.start(); a.master.gain.value = 0.8;
    a.mapReady('temple'); // 沒有預載：素材不在
    const played = a.horror('stinger', { intensity: 1 }) && a.horror('sub', {}) ;
    a.storyCue('clue'); a.presence(0.5);
    const buf = await ctx.startRendering();
    let peak = 0; for (const x of buf.getChannelData(0)) peak = Math.max(peak, Math.abs(x));
    return { loaded: a.score?.loaded, played, peak, layerMul: { ...a.layerMul } };
  });
  check(r.loaded === false && r.played && r.peak > 0.01 && r.layerMul.heartbeat === 1 && r.layerMul.drone === 1 && r.layerMul.strings === 1, `fallback: 沒有素材時退回程序化（loaded=${r.loaded} 峰值 ${r.peak.toFixed(3)} layerMul 未改）`);
}

// ───────── 5b. 閱讀／對話暫停 ─────────
{
  // 逼近段正熱的時候打開文件（story.modal）：1.5 秒內收成屏息般的輕底，不是全停；對話中明確觸發的點名照常；回來約 1 秒平滑回復、不補爆點
  const body = `
setSpace('hall');
at(0.2, () => { a.score.phase('build'); a.setTension(0.45); });
at(6, () => { a.score.phase('approach'); a.setTension(0.7); });
at(17, () => snap('before'));
at(18.0, () => setModal(true));
at(20.5, () => snap('reading'));
at(22.0, () => a.score.motif('rollcall'));
at(25.0, () => setModal(false));
at(27.5, () => snap('after'));`;
  const r = await render('reading', { seconds: 30, body, muteAmb: true, wav: true, onsets: [{ t: 22.0, w: 0.05 }, { t: 22.55, w: 0.05 }] });
  const b = r.blocks, before = blkAvg(b, 12, 17.8), beforeMax = blkMax(b, 12, 17.8), early = blkAvg(b, 19.6, 19.8), held = blkAvg(b, 19.8, 21.6), roll = blkAvg(b, 22.0, 24.4), after = blkAvg(b, 26.4, 28.5), jolt = blkMax(b, 25.0, 26.6);
  const pulses = r.trace.filter(([id, t]) => /score\.(pulse|tick|heart)/.test(id) && t > 18.6 && t < 25.0).length;
  const hits = r.trace.filter(([id, t]) => /score\.hit/.test(id) && t > 17).length;
  console.log(`   逼近 ${f1(before)}　打開文件 1.6 秒後 ${f1(early)}　閱讀中 ${f1(held)}　對話裡的點名 ${f1(roll)}　回來後 ${f1(after)}（回來那一刻最大 ${f1(jolt)}）　閱讀中排出的脈動／心跳 ${pulses} 個`);
  check(r.snaps.reading?.reading === true && early <= before - 6, `reading: 打開文件 1.6 秒內收掉（比逼近低 ${(before - early).toFixed(1)} LU ≥ 6）`);
  check(held <= before - 8 && held > -60, `reading: 閱讀中是很輕的持續底、不是全停（${f1(held)} LUFS，比逼近低 ${(before - held).toFixed(1)} LU）`);
  check(pulses === 0, `reading: 閱讀中沒有脈動與心跳（${pulses}）`);
  check(roll >= held + 6 && r.onsets.every((o) => Math.abs(o.t - o.want) <= 0.03), `reading: 對話中由 cue 觸發的點名照常播（+${(roll - held).toFixed(1)} LU，起音 ${r.onsets.map((o) => o.t).join(', ')}）`);
  check(r.snaps.after?.reading === false && after >= before - 4, `reading: 回到遊戲後回復（${f1(after)}，與逼近差 ${(before - after).toFixed(1)} LU）`);
  check(hits === 0 && jolt <= beforeMax + 1, `reading: 回來時沒有補爆點、沒有突然跳上來（爆點 ${hits} 個；回來時最大 ${f1(jolt)}，逼近段本來的最大 ${f1(beforeMax)}）`);
}
{
  // 例外：結局演出與戲台點名期間不收
  const body = `
setSpace('crypt');
at(0.05, () => { g.story.scene = 'finale'; g.story.finale = { active: true, phase: 'c-six' }; a.setTension(0.8); });
at(4.0, () => { snap('fin0'); setModal(true); });
at(6.0, () => snap('fin1'));
at(7.0, () => { setModal(false); g.story.scene = null; g.story.finale = null; });
at(9.0, () => { setModal(true); a.score.cue('stage'); });
at(11.5, () => snap('stage'));
at(12.0, () => setModal(false));`;
  const r = await render('reading-exceptions', { seconds: 13, body, muteAmb: true });
  check(r.snaps.fin1?.reading === false && Math.abs((r.snaps.fin1?.stems.bedL || 0) - (r.snaps.fin0?.stems.bedL || 0)) < 0.01, `reading: 結局演出期間以時間表為準，不收（bedL ${r.snaps.fin0?.stems.bedL} → ${r.snaps.fin1?.stems.bedL}）`);
  check(r.snaps.stage?.reading === false && (r.snaps.stage?.stems.bedL || 0) > 0.2, `reading: 戲台點名的 cue 擺好的狀態不被收掉（bedL ${r.snaps.stage?.stems.bedL}）`);
}

// ───────── 5c. 小喇叭聽得到低音群鳴 ─────────
{
  // 改前基準（2026-11-20 第一版 score_bed.ogg，同一套量法）：60 Hz 以下 -40.07 dB、200 Hz 以上（四階高通，模擬筆電喇叭）-31.30 dB、積分響度 -24.0 LUFS
  const BASE = { sub60: -40.07, laptop200: -31.30, lufs: -24.0 };
  const m = await page.evaluate(async () => {
    const SR = 48000;
    const ab = await (await fetch('/assets/audio/score/score_bed.ogg', { cache: 'no-store' })).arrayBuffer();
    const buf = await new OfflineAudioContext(1, SR, SR).decodeAudioData(ab);
    const x = buf.getChannelData(0).slice(Math.round(0.1 * SR), Math.round(16.1 * SR));
    const bq = (type, f0, q) => { const w = 2 * Math.PI * f0 / SR, al = Math.sin(w) / (2 * q), c = Math.cos(w); const bb = type === 'lp' ? [(1 - c) / 2, 1 - c, (1 - c) / 2] : [(1 + c) / 2, -(1 + c), (1 + c) / 2]; const aa = [1 + al, -2 * c, 1 - al]; return { b: bb.map((v) => v / aa[0]), a: [aa[1] / aa[0], aa[2] / aa[0]] }; };
    const run = (sig, f) => { const y = new Float32Array(sig.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0; for (let i = 0; i < sig.length; i++) { const v = f.b[0] * sig[i] + f.b[1] * x1 + f.b[2] * x2 - f.a[0] * y1 - f.a[1] * y2; x2 = x1; x1 = sig[i]; y2 = y1; y1 = v; y[i] = v; } return y; };
    const casc = (sig, type, f0, order) => { let y = sig; for (const q of order === 8 ? [0.5098, 0.6013, 0.9000, 2.5629] : [0.5412, 1.3066]) y = run(y, bq(type, f0, q)); return y; };
    const e = (sg) => { let t = 0; for (const v of sg) t += v * v; return 10 * Math.log10(t / sg.length + 1e-20); };
    // BS.1770 積分響度（K 加權、400 ms 區塊、-70 / -10 閘門）
    const k1 = { b: [1.53512485958697, -2.69169618940638, 1.19839281085285], a: [-1.69065929318241, 0.73248077421585] }, k2 = { b: [1, -2, 1], a: [-1.99004745483398, 0.99007225036621] };
    const kw = run(run(x, k1), k2), blk = Math.round(0.4 * SR), hop = Math.round(0.1 * SR), ms = [];
    for (let s0 = 0; s0 + blk <= kw.length; s0 += hop) { let t = 0; for (let i = s0; i < s0 + blk; i++) t += kw[i] * kw[i]; ms.push(t / blk); }
    const L = (v) => -0.691 + 10 * Math.log10(v + 1e-20), g1 = ms.filter((v) => L(v) > -70), rel = L(g1.reduce((p, v) => p + v, 0) / g1.length) - 10, g2 = g1.filter((v) => L(v) > rel);
    return { sub60: e(casc(x, 'lp', 60, 8)), laptop200: e(casc(x, 'hp', 200, 4)), lufs: L(g2.reduce((p, v) => p + v, 0) / g2.length) };
  });
  console.log(`   低音群鳴：60 Hz 以下 ${m.sub60.toFixed(2)} dB（基準 ${BASE.sub60}）　200 Hz 以上 ${m.laptop200.toFixed(2)} dB（基準 ${BASE.laptop200}）　${m.lufs.toFixed(2)} LUFS（基準 ${BASE.lufs}）`);
  check(m.laptop200 - BASE.laptop200 >= 5, `bed: 筆電喇叭頻段（200 Hz 以上）多了 ${(m.laptop200 - BASE.laptop200).toFixed(1)} dB（≥ 5）——2～8 次諧波層讓聽不到的基頻被「補」出來`);
  check(m.sub60 - BASE.sub60 <= 0.2, `bed: 次低頻（60 Hz 以下）沒有增加（${(m.sub60 - BASE.sub60).toFixed(2)} dB）`);
  check(m.lufs - BASE.lufs <= 1.0, `bed: 整體響度增加 ${(m.lufs - BASE.lufs).toFixed(2)} LU（≤ 1）`);
}

// ───────── 6. 真實遊戲頁（?auto 會預載素材） ─────────
if (!process.env.SKIP_LIVE) {
  console.log('\n── 真實遊戲頁 /?auto&map=temple');
  await page.goto(ORIGIN + '/?auto&map=temple');
  await page.waitForFunction(() => window.__game?.map && window.__game.running && window.__game.audio.ctx, null, { timeout: 240000 });
  await page.waitForTimeout(800);
  const live = await page.evaluate(async () => {
    const a = window.__game.audio, s = a.score, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), st = window.__game.story;
    for (let i = 0; i < 20 && st?.modal; i++) st.choose(0); // 開場的照片與對話：閱讀中遊戲（與配樂的每幀更新）是暫停的
    await sleep(300);
    const out = { loaded: s?.loaded, state0: s?.state, stats: a.bank.stats(), modal: !!st?.modal };
    s.phase('build'); a.setTension(0.4); await sleep(600);
    s.phase('approach'); a.setTension(0.7); await sleep(1500);
    out.appr = s.state;
    s.phase('peak'); await sleep(500);
    a.horror('stinger', { intensity: 1 }); await sleep(300);
    s.phase('calm'); a.setTension(0.2);
    s.motif('qing'); s.motif('lullaby-frag'); s.riser(1.2, null, { hit: 'small' });
    await sleep(2500);
    out.end = s.state; out.voices = a.debug();
    s.phase('grace');
    return out;
  });
  console.log(`   ${JSON.stringify({ loaded: live.loaded, mode: live.appr?.mode, appr: live.appr?.targets, lastHit: live.end?.lastHit, live: live.end?.live, bankMB: live.stats.mb, failed: live.stats.failed })}`);
  check(live.loaded === true, '真實遊戲頁：配樂引擎載入素材並啟用');
  check(live.appr?.mode === 'director' && live.appr?.targets.pulse > 0, '真實遊戲頁：導演節奏驅動配樂');
  check(live.end?.lastHit?.level === 'big' || live.end?.lastHit?.level === 'small', '真實遊戲頁：爆點有播');
  check(!live.stats.failed.some((f) => f.startsWith('score/')), `真實遊戲頁：沒有載入失敗的 score 素材（${live.stats.failed.filter((f) => f.startsWith('score/')).join(',') || '無'}）`);
}

await browser.close();
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify({ budget, disk, failures, errors }, null, 1));
const errs = [...new Set(errors)].filter((e) => !/favicon/i.test(e));
if (errs.length) { console.log('\n--- console ---\n' + errs.slice(0, 20).join('\n')); failures.push(`頁面有 ${errs.length} 個錯誤`); }
console.log(failures.length ? `\n失敗 ${failures.length} 項：\n- ${failures.join('\n- ')}` : '\n全部通過');
process.exit(failures.length ? 1 : 0);
