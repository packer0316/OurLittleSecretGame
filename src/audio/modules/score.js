/**
 * 配樂與節奏組（score）：動態恐怖配樂引擎，掛在 audio.score。
 *
 * 原則：大多數時間沒有配樂（只有劇中聲音與空間底噪）；緊張時低音群鳴悄悄爬進來；逼近時脈動收緊、高把位顫弓靠近；
 * 爆點前抽成死寂；爆點有份量；之後耳鳴、餘韻、至少 30 秒的喘息。
 *
 * 分層（素材見 src/audio/lib/score.js，製作見 scripts/audio-score-build.py）
 *   持續層（自己組的循環節點，最多 4 條）：bed ×2（左右兩個不同偏移，製造寬度）、unease、chase
 *   脈動：pulse（軟槌定音鼓）+ tick（col legno），速度跟著逼近段的時間與緊張度；心跳 lub/dub（取代程序化心跳）
 *   一次性：hit big / small、riser（結尾精準落在爆點）、riser.rev（倒吸）、braam（「它」）、swell（取代 _k_sub）、tail（餘韻）
 *   主題動機：qing（磬：章節與重大發現）、count / count6（點名，第六聲是錯的）、八音盒童謠（小雨；五聲音階裡有一個錯音）、
 *             meilan（二胡的哭腔）、suona（山路遠處的出殯嗩吶）
 *
 * 訊號：恐怖導演的節奏（director.js 呼叫 phase()）、audio.tension、story.scene（'dread:*' 寺內段落、'story:camp'、'finale'）、
 *       story.chase、結局 story.finale.phase、寺內段落每幀的 watch()（一行呼叫，值有變才處理）。
 *
 * API（audio.score）
 *   phase(name)               導演節奏：grace / build / approach / peak / calm
 *   cue(name, opts)           劇情點：'camp'、'stage'、'release' …（見 CUES）
 *   watch(key, a, b, c)       寺內段落每幀回報狀態（只有值改變才觸發）：hideseek / patrol / arhats / echo / ash
 *   hit(level, opts)          'big' | 'small'；opts.t 指定音訊時間；回傳爆點的音訊時間
 *   riser(seconds, onHit, o)  預捲漸強，結尾精準落在 now + seconds（o.at 指定起點的音訊時間）；o.hit = 'big'|'small' 同時排好爆點；o.gap 秒：漸強結束後先死寂再爆
 *   silence(seconds, o)       配樂與心跳抽空（o.amb !== false 時環境聲也一起 duck）；o.at 指定開始的音訊時間
 *   motif(name, o)            'qing' 'count' 'count6' 'rollcall' 'lullaby' 'lullaby-true' 'lullaby-warped' 'lullaby-frag' 'meilan' 'it' 'suona' 'windup' 'tail'
 *   state                     除錯：模式、各層目標音量、最近的爆點、死寂視窗
 * 閱讀／對話（story.modal，遊戲不呼叫 update）：_pump 偵測超過 0.35 秒沒有 update，就把脈動、心跳、追逐、不安層收成很輕的持續底；
 *   回到遊戲約 1 秒平滑回來、不補爆點。結局時間表、錄音機與戲台的點名、cue／motif 觸發的一次性聲音照常。
 * 覆寫：_k_stinger、_k_sub、_k_ring、_k_heartbeat、storyCue、presence；layerMul.drone / strings / heartbeat 在素材載入時歸零（沒有素材時一律退回程序化版本）。
 * 另外包住 horror()（不改它的行為與回傳值）：劇中的恐怖聲音（耳語、背後的腳步、敲門…）出現時，配樂的持續層讓開 6 dB 約 1.5 秒，讓提示被聽見。
 */

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const rnd = (a, b) => a + Math.random() * (b - a);

// 小雨的八音盒童謠（原創，C 大調五聲音階；第 21 拍的 F#6 是「不對」的那個音，真結局換回 D6）。[拍, MIDI, 力度]
const LULLABY = [
  [0, 88, 1], [1, 91, 0.8], [2, 93, 0.85], [3, 91, 0.9], [5, 88, 0.7], [6, 86, 0.8], [7, 88, 0.75], [8, 91, 0.8], [9, 88, 0.9],
  [12, 88, 0.8], [13, 91, 0.8], [14, 93, 0.85], [15, 96, 0.95], [17, 93, 0.7], [18, 91, 0.8], [19, 88, 0.75], [20, 90, 0.85, 'wrong'], [21, 84, 0.9],
];
const LULLABY_BASS = [[0, 72, 0.5], [3, 67, 0.4], [6, 72, 0.45], [9, 67, 0.4], [12, 72, 0.5], [15, 69, 0.4], [18, 72, 0.45], [21, 72, 0.5], [21, 67, 0.35]];
const MBOX = [72, 79, 84, 91];

// 結局各段的配樂：lv = 持續層目標 { bed, unease, chase, pulse, heart, lp }；at = [秒, 動作]（相對進入該段的時間）
// 動作字串：'qing' 'qing:soft' 'count' 'count6' 'hit:big' 'hit:small' 'braam' 'braam:now' 'riser:秒' 'silence:秒' 'tail' 'meilan' 'lullaby…' 'heart'
function rollAt(start, gap, n, from = 0) { const o = []; for (let i = from; i < n; i++) o.push([start + (i - from) * gap, 'count']); return o; }
const FINALE = {
  'c-ready': { lv: { bed: 0.22, lp: 900 } },
  'c-name': { lv: { bed: 0.18, lp: 800 }, at: [[0.2, 'qing:soft'], [3.3, 'bed0'], [8.3, 'heart']] },
  // 不要回頭：恐怖的主體是叫你名字的聲音，配樂退到後面——群鳴很暗很輕，不安層只留 2.2 kHz 以上、跟著回頭的角度長出來，心跳輕一半
  'c-walk': { lv: { bed: 0.08, unease: 'warn', heart: 'warn', lp: 420, uHp: 2200, heartGain: 0.5 } },
  'c-fail1': { lv: { heart: 0 }, at: [[0, 'hit:big']] },
  'c-relic': { lv: { bed: 0.3, lp: 1100 }, at: [[2.6, 'bedUp'], ...rollAt(7.8, 2.1, 5), [16.4, 'riser:4'], [20.4, 'stems0']] },
  'c-six': { lv: { bed: 0.32, unease: 'k', heart: 1, lp: 1300 }, at: [[1.8, 'count6'], [5.4, 'count6'], [8.4, 'count6'], [10.8, 'count6'], [11.4, 'count6'], [11.4, 'riser:3.2'], [13.2, 'count6']] },
  'c-held': { lv: { bed: 0.12, lp: 700 }, at: [[3.2, 'count'], [5.6, 'qing:soft']] },
  'c-answered': { lv: { bed: 0.25, unease: 0.4 }, at: [[1.2, 'braam:now']] },
  'c-witness-ready': { lv: { bed: 0.15, lp: 800 } },
  'c-tape': { lv: { bed: 0.2, lp: 900 }, at: [[6.4, 'unease:0.3'], [8.6, 'silence:1.8'], [10.4, 'qing']] },
  'c-fire': { lv: { bed: 0.5, unease: 'fire', chase: 'fire', lp: 2400 } },
  'c-fail3': { lv: {}, at: [[0, 'tail']] },
  'c-unlock': { lv: {}, at: [[2.4, 'lullaby-warped:0.45']] },
  'c-girl': { lv: {} },
  'c-lunge': { lv: { unease: 0.5 }, at: [[0, 'hit:big'], [2.4, 'stems0'], [2.6, 'meilan']] },
  'c-mother': { lv: {}, at: [[15.0, 'lullaby-true:0.55']] },
  'c-quiet': { lv: {} },
  'c-exit': { lv: {} },
  'c-up': { lv: {}, at: [[4.0, 'qing:soft']] },
  'c-terrace': { lv: {} },
  'c-gate': { lv: {} },
  'c-answer': { lv: {}, at: [[4.6, 'count:soft']] },
  'a-tie': { lv: { bed: 'tieBed', unease: 'k', pulse: 'k', lp: 1600 } },
  'a-silence': { lv: {}, at: [[0, 'silence:2.2']] },
  'a-walk': { lv: { bed: 0.15, unease: 'T', lp: 900 } },
  'a-gate': { lv: { bed: 0.12, lp: 700 } },
  'a-answer': { lv: {}, at: [[3.2, 'braam']] },
  'a-phone': { lv: {} },
  'a-voice': { lv: {}, at: [[0.6, 'unease:0.35'], [7.8, 'stems0'], [8.0, 'tail']] },
  'b-untie': { lv: { bed: 0.3, lp: 1100 }, at: [[7.6, 'hit:small']] },
  'b-double': { lv: { bed: 0.35, unease: 0.45, heart: 1, lp: 1300 } },
  'b-drag': { lv: { bed: 0.4, unease: 0.6, heart: 1 } },
  'b-roll': { lv: { bed: 0.35, unease: 0.3, heart: 1, lp: 1200 }, at: [[1.8, 'count'], ...rollAt(3.8, 1.6, 5, 1), [9.6, 'riser:2.6'], [13.4, 'count6'], [13.4, 'braam:now']] },
  'b-call': { lv: {}, at: [[6.6, 'unease:0.3'], [14.6, 'stems0']] },
};

export function install(audio) {
  const C = audio.ctx, bank = audio.bank;
  if (!C || !bank) return null;
  const lib = bank.library;
  const has = (id) => bank.has(id);

  // ── 匯流排 ──
  const G = (v = 1) => { const g = C.createGain(); g.gain.value = v; return g; };
  const out = G(1); out.connect(audio.scoreBus); // 跟著 tensionDuck：audio.duck() 時一起抽空
  const suck = G(1); suck.connect(out); // 自己的死寂開關（爆點前）
  const dip = G(1); dip.connect(suck); // 劇中的恐怖聲音出現時讓開（像混音師把配樂推下來，讓耳語、腳步被聽見）
  const stemBus = G(1); stemBus.connect(dip); // 持續層與脈動
  const motifBus = G(1); motifBus.connect(out); // 主題動機（被 duck，不被自己的死寂抽掉）
  const heartSuck = G(1); heartSuck.connect(audio.fxBus); // 心跳：duck 時仍在，死寂時停
  const heartBus = G(1); heartBus.connect(heartSuck);
  const hitBus = G(1); hitBus.connect(audio.fxBus); // 爆點與預捲：永遠不被抽空

  // ── 一次性播放（自己的節點，播完自動拆掉） ──
  function buf(id, variant) { return bank.buffer(id, variant); }
  function one(id, { t, gain = 1, rate = 1, pan = 0, dest = motifBus, offset = 0, dur, lp = 0, variant } = {}) {
    const b = buf(id, variant); if (!b) return null;
    const now = C.currentTime, t0 = Math.max(now, t ?? now);
    const src = C.createBufferSource(); src.buffer = b; src.playbackRate.value = rate;
    const g = C.createGain(); g.gain.value = gain * (lib[id]?.gain ?? 1);
    let head = src, f = null, p = null;
    if (lp) { f = C.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; f.Q.value = 0.5; head.connect(f); head = f; }
    head.connect(g); head = g;
    if (pan && C.createStereoPanner) { p = C.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); head.connect(p); head = p; }
    head.connect(dest);
    const off = clamp(offset, 0, Math.max(0, b.duration - 0.01));
    const len = dur ?? (b.duration - off) / rate;
    if (dur != null && dur < (b.duration - off) / rate) { g.gain.setValueAtTime(g.gain.value, Math.max(t0, t0 + dur - 0.05)); g.gain.linearRampToValueAtTime(0.0001, t0 + dur); }
    src.start(t0, off); src.stop(t0 + len + 0.02);
    if (trace && trace.length < 400) trace.push([id, +t0.toFixed(4)]);
    src.onended = () => { try { src.disconnect(); g.disconnect(); f?.disconnect(); p?.disconnect(); } catch { /* 已拆 */ } };
    live++;
    src.addEventListener?.('ended', () => { live--; });
    return { src, g, t: t0, end: t0 + len, stop(fade = 0.05) { try { const n = C.currentTime; g.gain.cancelScheduledValues(n); g.gain.setTargetAtTime(0, n, Math.max(0.005, fade / 3)); src.stop(n + fade + 0.05); } catch { /* 已停 */ } } };
  }
  let live = 0, trace = null; // trace：測試時記下每個一次性聲音的 [id, 開始的音訊時間]

  // ── 持續層 ──
  const stems = { bedL: null, bedR: null, unease: null, chase: null };
  function makeStem(id, pan) {
    const b = buf(id); if (!b) return null;
    const e = lib[id] || {};
    const src = C.createBufferSource(); src.buffer = b; src.loop = true;
    const ls = e.loopStart || 0, le = Math.min(e.loopEnd || b.duration, b.duration);
    src.loopStart = ls; src.loopEnd = le;
    const f = C.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 20000; f.Q.value = 0.5;
    const h = C.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = 10; h.Q.value = 0.5; // 需要讓出人聲頻段時才用
    const g = C.createGain(); g.gain.value = 0;
    let p = null;
    if (pan && C.createStereoPanner) { p = C.createStereoPanner(); p.pan.value = pan; }
    src.connect(h).connect(f).connect(g); if (p) g.connect(p).connect(stemBus); else g.connect(stemBus);
    src.start(C.currentTime, ls + Math.random() * (le - ls) * 0.98);
    return { id, src, f, h, g, p, base: e.gain ?? 1, v: 0, lp: 20000, hp: 10 };
  }
  function killStem(st) { if (!st) return; try { const n = C.currentTime; st.g.gain.cancelScheduledValues(n); st.g.gain.setTargetAtTime(0, n, 0.08); st.src.stop(n + 0.4); } catch { /* 已停 */ } const k = () => { try { st.src.disconnect(); st.h.disconnect(); st.f.disconnect(); st.g.disconnect(); st.p?.disconnect(); } catch { /* 已拆 */ } }; if (audio.offline) k(); else setTimeout(k, 600); }
  function lvl(st, v, tau) {
    if (!st) return;
    v = clamp(v, 0, 1.5);
    if (Math.abs(v - st.v) < 0.004 && !(v === 0 && st.v !== 0)) return;
    st.v = v; st.g.gain.setTargetAtTime(v * st.base, C.currentTime, tau);
  }
  function hpf(st, hz, tau = 0.6) { if (!st || Math.abs(hz - st.hp) < st.hp * 0.04) return; st.hp = hz; st.h.frequency.setTargetAtTime(clamp(hz, 10, 8000), C.currentTime, tau); }
  function lpf(st, hz, tau = 0.6) { if (!st || Math.abs(hz - st.lp) < st.lp * 0.04) return; st.lp = hz; st.f.frequency.setTargetAtTime(clamp(hz, 80, 20000), C.currentTime, tau); }

  // ── 引擎狀態 ──
  const S = {
    map: null, loaded: false, mode: 'off', dir: 'grace', dirT0: 0, dirAt: 0, peakHit: false,
    quietUntil: 0, postHitUntil: 0, silenceUntil: 0, lastHit: { t: -99, level: '' }, lastBig: -99, tailAt: -99,
    scene: null, sceneT0: 0, fin: '', finT: 0, finCue: 0, chase: false, chaseT0: 0, under: false, holdCue: '', holdT: 0,
    beatAt: 0, beatN: 0, pulseAt: 0, pulseN: 0, nextBreath: 30, breathUntil: 0, suonaAt: -999,
    t: { bed: 0, unease: 0, chase: 0, pulse: 0, bpm: 60, heart: 0, heartK: 1, lp: 20000, uLp: 20000, uHp: 10, cLp: 20000 },
    sp: { key: '', a: undefined, b: undefined, c: undefined, t0: 0, prox: 0, root: null },
    tLast: 0, lastUpd: 0, reading: false, resumeAt: 0,
  };
  const seq = []; // 預先排好的聲音 { t, fn }：_pump 每次把 horizon（約 0.6 秒）之前的送出，fn 用絕對時間 t 排程
  const calls = []; // 到點才執行的 JS 動作 { t, fn }（例如 riser 的 onHit、duck）：音訊時間過了 t 才叫（誤差一幀以內）
  function later(t, fn) {
    // 已經在 0.6 秒的預排範圍內就立刻用絕對時間排下去（閱讀中 _pump 每 250 ms 才跑一次，等它會晚、會抖）
    if (t <= C.currentTime + 0.6) { try { fn(); } catch (err) { console.warn('[score] seq failed', err); } return; }
    seq.push({ t, fn }); if (seq.length > 1 && seq[seq.length - 2].t > t) seq.sort((a, b) => a.t - b.t);
  }
  function callAt(t, fn) { calls.push({ t, fn }); if (calls.length > 1 && calls[calls.length - 2].t > t) calls.sort((a, b) => a.t - b.t); }
  const watches = Object.create(null);

  let bound = null; // 測試用：離線渲染時塞一個假的 game（story / player）
  const game = () => { if (bound) return bound; const g = typeof window !== 'undefined' ? window.__game : null; return g && g.audio === audio ? g : null; };

  // ───────────────────────── 爆點、預捲、死寂 ─────────────────────────
  function cutStems(t, tau = 0.03) {
    for (const k in stems) { const st = stems[k]; if (!st) continue; st.g.gain.cancelScheduledValues(t); st.g.gain.setTargetAtTime(0, t, tau); st.v = 0; }
  }
  function hit(level = 'big', o = {}) {
    if (!S.loaded) return -1;
    const now = C.currentTime, t = Math.max(now, o.t ?? now);
    let big = level === 'big' || (typeof level === 'number' && level >= 0.85);
    if (big && t - S.lastBig < 8) big = false; // 大爆不連發
    if (big && !has('score.hit.big')) big = false; // 住處只載小爆點
    const id = big ? 'score.hit.big' : 'score.hit.small';
    if (!has(id)) return -1;
    one(id, { t, gain: (o.gain ?? 1) * (big ? 1.25 : 0.95), pan: (o.pan || 0) * 0.35, dest: hitBus });
    cutStems(t, 0.02);
    // 爆點那一刻心跳停半拍，之後由引擎依緊張度接回
    heartSuck.gain.cancelScheduledValues(t); heartSuck.gain.setValueAtTime(0, t); heartSuck.gain.setTargetAtTime(1, t + 1.6, 0.5);
    S.lastHit.t = t; S.lastHit.level = big ? 'big' : 'small';
    if (big) { S.lastBig = t; S.quietUntil = Math.max(S.quietUntil, t + 30); if (has('score.tail')) { S.tailAt = t + 1.7; one('score.tail', { t: t + 1.7, gain: 0.8, dest: motifBus }); } }
    else S.quietUntil = Math.max(S.quietUntil, t + 12);
    S.postHitUntil = t + (big ? 5 : 3);
    if (S.dir === 'peak') S.peakHit = true;
    return t;
  }
  function silence(seconds = 1, o = {}) {
    const now = C.currentTime, t = Math.max(now, o.at ?? now), back = o.release ?? 1.2;
    for (const p of o.heart === false ? [suck.gain] : [suck.gain, heartSuck.gain]) { p.cancelScheduledValues(t); p.setTargetAtTime(0, t, 0.02); p.setTargetAtTime(1, t + seconds, back / 3); }
    if (o.heart !== false) S.silenceUntil = Math.max(S.silenceUntil, t + seconds);
    if (o.amb !== false) { if (t <= now + 0.02) audio.duck(seconds); else callAt(t, () => audio.duck(seconds - (C.currentTime - t))); }
    return t + seconds;
  }
  function riser(seconds = 4, onHit, o = {}) {
    if (!S.loaded) { if (onHit) setTimeout(onHit, seconds * 1000); return null; }
    const now = C.currentTime, T = Math.max(now, o.at ?? now) + Math.max(0.1, seconds), gap = clamp(o.gap || 0, 0, seconds - 0.1);
    const len = seconds - gap;
    const id = o.kind === 'rev' || (o.kind !== 'up' && len <= 3.2 && has('score.riser.rev')) ? 'score.riser.rev' : 'score.riser';
    const b = buf(id);
    const srcs = [];
    if (b) {
      const D = lib[id]?.onsetEnd ?? b.duration;
      const off = Math.max(0, D - len), start = Math.max(now, T - gap - D + off);
      srcs.push(one(id, { t: start, offset: off, gain: (o.gain ?? 0.85), dest: hitBus, dur: Math.min(len, D) }));
    }
    if (gap > 0) silence(gap, { at: T - gap, amb: o.amb !== false });
    if (o.hit) hit(o.hit, { t: T });
    const ev = { t: T, fn: () => { try { onHit?.(); } catch (err) { console.warn('[score] riser onHit failed', err); } } };
    if (onHit) { calls.push(ev); calls.sort((a, b2) => a.t - b2.t); }
    return { at: T, cancel() { for (const s of srcs) s?.stop(0.1); const i = calls.indexOf(ev); if (i >= 0) calls.splice(i, 1); } };
  }

  // ───────────────────────── 主題動機 ─────────────────────────
  function mboxNote(t, midi, gain, cents = 0, dest = motifBus) {
    let base = MBOX[0];
    for (const m of MBOX) if (Math.abs(midi - m) < Math.abs(midi - base) || (Math.abs(midi - m) === Math.abs(midi - base) && m <= midi)) base = m;
    const rate = Math.pow(2, (midi - base + cents / 100) / 12);
    later(t, () => one('score.mbox.' + base, { t, rate, gain: gain * 0.45, pan: rnd(-0.18, 0.18), dest })); // 簧片樣本很亮：整體壓低，八音盒是遠遠的、小小的
  }
  function lullaby(kind = 'lullaby', o = {}) {
    if (!has('score.mbox.84')) return 0;
    const warped = kind === 'lullaby-warped', truth = kind === 'lullaby-true', frag = kind === 'lullaby-frag';
    const q = (o.q ?? 0.42) / (warped ? 0.72 : 1), G = o.gain ?? 0.6, t0 = Math.max(C.currentTime + 0.05, o.t ?? C.currentTime + 0.05);
    const last = frag ? 9 : 21;
    const time = (beat) => { // 最後兩小節發條鬆了：越來越慢
      let x = beat; if (!frag && beat > 15) x += 0.28 * Math.pow((beat - 15) / 6, 2) * 6 / 3;
      return t0 + x * q;
    };
    const sag = (beat) => (frag ? 0 : -40 * Math.pow(clamp((beat - 14) / 7), 2)) + (warped ? -60 - beat * 2 : 0);
    if (o.windup && has('score.windup')) later(t0 - 1.0, () => one('score.windup', { t: t0 - 1.0, gain: 0.5, dest: o.fx ? hitBus : motifBus }));
    for (const [beat, midi, v, tag] of LULLABY) {
      if (beat > last) break;
      const m = tag === 'wrong' && truth ? 86 : midi;
      const c = sag(beat) + (tag === 'wrong' && !truth ? 14 : 0) + (warped ? rnd(-14, 14) : rnd(-4, 4));
      mboxNote(time(beat), m, G * v, c, o.fx ? hitBus : motifBus);
    }
    for (const [beat, midi, v] of LULLABY_BASS) { if (beat > last) break; mboxNote(time(beat), midi, G * v * 0.8, sag(beat), o.fx ? hitBus : motifBus); }
    return time(last) + 1.8 - C.currentTime;
  }
  function motif(name, o = {}) {
    if (!S.loaded) return false;
    const t = o.t, D = o.fx ? hitBus : motifBus; // 結局自己會大量 duck：結局裡的動機走不被抽空的匯流排
    switch (name) {
      case 'qing': return !!one('score.qing', { t, gain: o.gain ?? 0.75, rate: o.rate ?? 1, dest: D, pan: o.pan || 0 });
      case 'count': return !!one('score.count', { t, gain: o.gain ?? 0.7, rate: o.rate ?? 1, dest: D });
      case 'count6': return !!one('score.count6', { t, gain: o.gain ?? 0.55, rate: o.rate ?? 1, dest: D });
      case 'rollcall': { // 一到五，平均地數；第六聲不在這裡（由呼叫端決定要不要、何時）
        const gap = o.gap ?? 0.55, t0 = Math.max(C.currentTime, t ?? C.currentTime);
        for (let i = 0; i < (o.n ?? 5); i++) { const ti = t0 + i * gap; later(ti, () => one('score.count', { t: ti, gain: (o.gain ?? 0.4) * (0.85 + 0.15 * (i % 2)), dest: D })); }
        return true;
      }
      case 'lullaby': case 'lullaby-true': case 'lullaby-warped': case 'lullaby-frag': return lullaby(name, o) > 0;
      case 'meilan': return !!one('score.meilan', { t, gain: o.gain ?? 0.7, dest: D, pan: o.pan || 0 });
      case 'suona': return !!one('score.suona', { t, gain: o.gain ?? 0.6, dest: D, pan: o.pan ?? rnd(-0.7, 0.7) });
      case 'windup': return !!one('score.windup', { t, gain: o.gain ?? 0.5, dest: D });
      case 'tail': return !!one('score.tail', { t, gain: o.gain ?? 0.7, dest: D });
      case 'it': case 'braam': {
        const id = 'score.braam', e = lib[id];
        if (!has(id)) return false;
        const now = !!o.now, off = now ? Math.max(0, (e?.onset ?? 1.2) - 0.05) : 0;
        return !!one(id, { t, offset: off, gain: o.gain ?? 0.8, dest: hitBus });
      }
      default: return false;
    }
  }

  // ───────────────────────── 導演節奏 ─────────────────────────
  function phase(name) {
    if (!name || name === S.dir) return;
    const now = C.currentTime;
    const prev = S.dir;
    S.dir = name; S.dirT0 = now;
    if (!S.loaded) return;
    if (name === 'peak') {
      S.peakHit = false; S.peakSuck = true;
      // 抽成死寂：配樂與心跳在 0.3 秒內退掉，等爆點（或什麼都沒有）
      for (const p of [suck.gain, heartSuck.gain]) { p.cancelScheduledValues(now); p.setTargetAtTime(0, now, 0.09); }
      S.silenceUntil = now + 60; // 直到爆點或喘息
    } else if (prev === 'peak') {
      S.peakSuck = false;
      for (const p of [suck.gain, heartSuck.gain]) { p.cancelScheduledValues(now); p.setTargetAtTime(1, now + 0.5, 0.6); }
      S.silenceUntil = now;
      cutStems(now, 0.05);
      S.quietUntil = Math.max(S.quietUntil, now + 30); // 喘息：至少 30 秒沒有配樂
    }
    if (name === 'approach' && S.map === 'road' && now - S.suonaAt > 150 && Math.random() < 0.55 && has('score.suona')) { S.suonaAt = now; motif('suona', { t: now + rnd(2, 5), gain: 0.5 }); }
    if (name === 'build') S.nextBreath = rnd(14, 26);
  }

  // ───────────────────────── 劇情點 ─────────────────────────
  function cue(name, o = {}) {
    if (!S.loaded) return false;
    const now = C.currentTime;
    switch (name) {
      case 'camp': // 四樓錄音機自己放出點名：對話是逐句的（遊戲暫停），先把持續層擺好，之後由 onUpdate 接手
        S.holdCue = 'camp'; S.holdT = now; S.t.pulse = 0; S.t.heart = 0;
        lvl(stems.bedL, 0.22, 1.5); lvl(stems.bedR, 0.22, 1.5); lpf(stems.bedL, 600, 1); lpf(stems.bedR, 600, 1); lvl(stems.unease, 0.18, 2); lvl(stems.chase, 0, 0.3);
        return true;
      case 'camp:roll': return motif('count', { gain: 0.6 });
      case 'stage':
        S.holdCue = 'stage'; S.holdT = now; S.t.pulse = 0; S.t.heart = 0;
        lvl(stems.bedL, 0.3, 1.2); lvl(stems.bedR, 0.3, 1.2); lpf(stems.bedL, 800, 1); lpf(stems.bedR, 800, 1); lvl(stems.unease, 0.15, 2);
        return true;
      case 'release': return motif('qing', { gain: 0.6 }) | motif('lullaby-true', { t: now + 3.5, gain: 0.45 });
      case 'descend': return motif('qing', { gain: 0.55, rate: 0.71 });
      default: return false;
    }
  }

  // ───────────────────────── 寺內段落 ─────────────────────────
  function watch(key, a, b, c) {
    let w = watches[key];
    if (!w) w = watches[key] = { a: undefined, b: undefined, c: undefined };
    if (w.a === a && w.b === b && w.c === c) return;
    const pa = w.a, pb = w.b, pc = w.c; w.a = a; w.b = b; w.c = c;
    if (!S.loaded) return;
    try { onSetpiece(key, a, b, c, pa, pb, pc); } catch (err) { console.warn('[score] watch failed', key, err); }
  }
  function onSetpiece(key, a, b, c, pa, pb, pc) {
    const now = C.currentTime, sp = S.sp;
    if (sp.key !== key || a !== pa) { sp.key = key; sp.t0 = now; }
    if (key === 'hideseek') {
      // 數數（b = 數到幾）：心跳與不安層一個數一個數往上爬（levels 依 b 計算）；數到十，一聲走音的點名
      if (a === 'count' && b === 10 && pb !== 10) motif('count6', { gain: 0.35, rate: 0.94 });
      if (a === 'call' && pa !== 'call') silence(5.4, { amb: false }); // 「好了沒？」五個方向回答：完全的死寂
      if (a === 'sixth' && c && !pc) silence(7, { amb: false }); // 她在你背後（c = behindShown）：抽空，等你轉身
      if (a === 'end' && pa !== 'end') { S.postHitUntil = now + 2; motif('lullaby-warped', { t: now + 2.2, gain: 0.32, q: 0.4 }); }
    } else if (key === 'patrol') {
      sp.root = b || sp.root; // b = 她的 root（Object3D）
      if (a === 'alert' && pa !== 'alert') motif('count6', { gain: 0.3, rate: 1.06 });
      if (a === 'inspect' && pa !== 'inspect') silence(6.5, { amb: false, heart: false }); // 她在檢查你躲的地方：只剩心跳
      if (a === 'leave' && pa !== 'leave') S.quietUntil = Math.max(S.quietUntil, now + 20);
    } else if (key === 'arhats') {
      if (a === 'wake' && pa !== 'wake') hit('small', { gain: 0.9 });
      if (a === 'top' && pa !== 'top') { silence(1.2, { amb: false }); motif('tail', { t: now + 1.3, gain: 0.6 }); }
    } else if (key === 'echo') {
      if (a === 'said' && pa !== 'said') motif('count', { gain: 0.55 }); // 朋友的回聲答了一聲「有」：點名的那一聲
      if (a === 'gone' && pa === 'said') motif('tail', { gain: 0.4 });
    } else if (key === 'ash') {
      if (a === 'reveal' && pa !== 'reveal') motif('lullaby-frag', { gain: 0.3, q: 0.55 });
    }
  }

  // ───────────────────────── 每幀：決定各層音量 ─────────────────────────
  const swellT = () => 0.5 + 0.5 * Math.sin(S.tLast * 0.043);
  function levels(s, g) {
    const now = C.currentTime, T = s.tension, tt = S.t;
    tt.bed = 0; tt.unease = 0; tt.chase = 0; tt.pulse = 0; tt.bpm = 60; tt.heart = 0; tt.heartK = 1; tt.lp = 20000; tt.uLp = 20000; tt.uHp = 10; tt.cLp = 20000;
    const st = g?.story;
    const mapK = S.map === 'road' ? 0.8 : S.map === 'home' ? 0.6 : 1;
    if (s.released) { S.mode = 'off'; return; }
    // 1. 結局
    if (st?.scene === 'finale' && st.finale?.active) {
      S.mode = 'finale';
      const P = FINALE[S.fin]?.lv || {};
      const k = clamp((T - 0.5) / 0.5), fire = clamp((T - 0.75) / 0.25);
      const warn = clamp((T - 0.62) / 0.38); // c-walk：結局把回頭的角度寫進緊張度（0.62 + 0.38 × warn）
      const val = (v) => (v === 'warn' ? 0.03 + 0.45 * warn * warn : v === 'T' ? clamp((T - 0.55) / 0.45) * 0.9 : v === 'k' ? 0.15 + 0.7 * k : v === 'fire' ? 0.3 + 0.6 * fire : v === 'tieBed' ? 0.35 + 0.45 * k : v || 0);
      tt.bed = S.finBed0 ? 0 : val(P.bed) * (S.finBedUp ? 1.25 : 1); tt.unease = Math.max(val(P.unease), S.finUnease || 0); tt.chase = P.chase ? val(P.chase) * 0.8 : 0;
      tt.pulse = P.pulse ? val(P.pulse) : 0; tt.bpm = 58 + 40 * k;
      tt.heart = (P.heart || S.finHeart) && !S.finStems0 ? (P.heart === 'warn' ? 0.15 + 0.85 * warn : clamp((T - 0.3) / 0.7)) : 0;
      tt.heartK = P.heartGain ?? 1; tt.uHp = P.uHp || 10;
      tt.lp = P.lp || 2400;
      if (S.finStems0 || now < S.postHitUntil) { tt.bed = tt.unease = tt.chase = tt.pulse = 0; }
      return;
    }
    // 2. 追逐（應了它）
    if (st?.chase) {
      S.mode = 'chase';
      let prox = 0.5;
      const gr = st.world?.ghost?.root, pp = g.player?.pos;
      if (gr && pp) prox = clamp(1 - Math.hypot(gr.position.x - pp.x, gr.position.z - pp.z) / 14);
      tt.chase = (0.3 + 0.45 * prox) * sstep(0, 1.2, now - S.chaseT0); tt.cLp = 1800 + 10000 * prox * prox;
      tt.unease = 0.08 + 0.7 * prox * prox; tt.bed = 0.2; tt.lp = 1400;
      return;
    }
    // 3. 寺內段落
    const scene = st?.scene || null;
    if (scene && scene.startsWith('dread:')) {
      S.mode = 'setpiece';
      const sp = S.sp, w = watches[sp.key], a = w?.a, el = now - sp.t0;
      if (sp.key === 'hideseek') {
        if (a === 'dark') { tt.unease = el > 1.6 ? 0.2 : 0; tt.heart = 0.35; }
        else if (a === 'count') { const n = w.b || 0; tt.unease = 0.18 + 0.055 * n; tt.bed = 0.15 + 0.04 * n; tt.lp = 700 + 90 * n; tt.heart = 0.3 + 0.06 * n; }
        else if (a === 'call') { tt.heart = 0; }
        else if (a === 'search') { tt.bed = 0.3; tt.lp = 650; tt.unease = 0.14 + 0.1 * Math.max(0, Math.sin(now * 0.11)); tt.heart = clamp((T - 0.45) / 0.55); }
        else if (a === 'sixth') { const behind = !!w.c; tt.unease = behind ? 0 : clamp(0.35 + el * 0.05, 0, 0.75); tt.bed = behind ? 0 : 0.35; tt.lp = 900; tt.heart = behind ? 0 : 0.8; }
      } else if (sp.key === 'patrol') {
        let prox = 0;
        const r = sp.root, pp = g?.player?.pos;
        if (r && r.visible && pp) prox = clamp(1 - Math.hypot(r.position.x - pp.x, r.position.z - pp.z) / 16);
        sp.prox += (prox - sp.prox) * 0.1;
        const P = sp.prox;
        if (a === 'chase') { tt.chase = 0.8; tt.unease = 0.7; tt.bed = 0.3; tt.cLp = 9000; }
        else if (a === 'inspect' || a === 'caught') { tt.heart = 0.9; }
        else if (a === 'leave') { tt.bed = 0.12; }
        else { tt.bed = 0.25 + 0.35 * P; tt.lp = 600 + 1400 * P; tt.unease = 0.1 + 0.6 * P * P; tt.heart = clamp((P - 0.35) / 0.65); if (a === 'alert') tt.unease = 0.75; }
      } else if (sp.key === 'arhats') {
        if (a === 'wake' || a === 'stalk') { tt.bed = 0.4; tt.lp = 1200; tt.unease = 0.45; tt.pulse = a === 'stalk' ? 0.6 : 0; tt.bpm = 66 + 30 * clamp((T - 0.5) / 0.5); tt.heart = 0; }
      } else if (sp.key === 'echo') {
        tt.unease = a === 'shown' ? 0.22 : 0; tt.bed = a === 'shown' ? 0.12 : 0; tt.lp = 600;
      } else if (sp.key === 'ash') {
        tt.unease = a === 'reveal' || a === 'read' ? 0.16 : 0;
      }
      if (now < S.postHitUntil) { tt.bed = tt.unease = tt.chase = tt.pulse = 0; }
      return;
    }
    if (scene === 'story:camp' || S.holdCue) { // 錄音機的點名／戲台：維持 cue 擺好的狀態，之後慢慢放掉
      S.mode = 'scene';
      if (scene !== 'story:camp' && now - S.holdT > 0.5) { S.holdCue = ''; S.quietUntil = Math.max(S.quietUntil, now + 15); }
      tt.bed = 0.22; tt.lp = 600; tt.unease = 0.15;
      return;
    }
    // 4. 自由探索：跟著導演的節奏
    S.mode = 'director';
    const d = S.dir, pt = now - S.dirT0, temple = S.map === 'temple';
    const floor = temple ? (0.05 + 0.12 * Math.pow(swellT(), 3)) * (S.under ? 1.4 : 1) : 0;
    if (d === 'build') {
      tt.bed = floor + (0.42 - floor) * sstep(4, 34, pt) * (0.55 + 0.45 * T);
      if (pt > S.nextBreath && pt < S.nextBreath + 7) tt.unease = 0.3 * Math.sin(((pt - S.nextBreath) / 7) * Math.PI); // 偶爾一口氣般的不安
      else if (pt >= S.nextBreath + 7) S.nextBreath = pt + rnd(22, 40);
    } else if (d === 'approach') {
      tt.bed = 0.36 + 0.26 * sstep(0, 12, pt);
      tt.unease = 0.1 + 0.45 * sstep(0, 15, pt);
      tt.pulse = sstep(0.5, 4, pt); tt.bpm = 52 + 36 * sstep(0, 16, pt) + 10 * clamp((T - 0.6) / 0.4);
      tt.lp = 900 + 2500 * sstep(0, 12, pt);
    } else if (d === 'peak') { /* 死寂 */ }
    else tt.bed = floor; // grace / calm：只剩幾乎聽不到的底
    tt.heart = d === 'approach' || d === 'peak' ? clamp((T - 0.5) / 0.5) : 0;
    if (S.map === 'home' && d === 'approach') { tt.pulse = 0; tt.heart = clamp((T - 0.3) / 0.45) * sstep(0, 6, pt); } // 住處：小房間裡只有自己的心跳，沒有定音鼓
    if (S.under) { tt.lp = Math.min(tt.lp, 1100); tt.bed *= 1.15; }
    if (s.space === 'open') tt.bed *= 0.8;
    tt.bed *= mapK; tt.unease *= mapK;
    if (now < S.quietUntil) { tt.bed = Math.min(tt.bed, floor * 0.5); tt.unease = 0; tt.pulse = 0; tt.heart = Math.min(tt.heart, 0.3); }
  }

  function update(dt, s) {
    if (!S.loaded) return;
    const nowU = C.currentTime;
    if (S.reading) { S.reading = false; S.resumeAt = nowU; } // 從閱讀回來：約 1 秒平滑地回到原本的狀態（不補爆點）
    S.lastUpd = nowU;
    S.tLast = s.time;
    const g = game();
    const st = g?.story;
    // 結局：每一段的時間軸
    const fin = st?.scene === 'finale' && st.finale?.active ? st.finale.phase : '';
    if (fin !== S.fin) { S.fin = fin; S.finT = 0; S.finCue = 0; S.finBed0 = false; S.finBedUp = false; S.finStems0 = false; S.finUnease = 0; S.finHeart = false; }
    else if (fin) S.finT += dt;
    if (fin) finaleCues();
    // 追逐開始／結束
    const chase = !!st?.chase, now = C.currentTime;
    if (chase !== S.chase) {
      S.chase = chase;
      if (chase) S.chaseT0 = now;
      else { // 逃進燈下（反應層會 duck 3 秒）：等安靜過去才放一點餘韻；被抓到的那一下由爆點負責
        lvl(stems.chase, 0, 0.12);
        if (now - S.lastHit.t > 0.5) motif('tail', { t: now + 2.6, gain: 0.5 });
        S.quietUntil = Math.max(S.quietUntil, now + 20);
      }
    }
    // 導演停在 peak 的死寂時，劇情接手（追逐、段落、結局）：把死寂解除
    if (S.peakSuck && (S.mode !== 'director' || S.dir !== 'peak')) {
      S.peakSuck = false; S.silenceUntil = now;
      for (const p of [suck.gain, heartSuck.gain]) { p.cancelScheduledValues(now); p.setTargetAtTime(1, now, 0.3); }
    }
    // 下到地下
    const under = !!(g && g.player?.pos?.y < -2 && S.map === 'temple');
    if (under !== S.under) { S.under = under; if (under && st?.state?.flags?.underground) motif('qing', { gain: 0.5, rate: 0.71 }); }
    levels(s, g);
    const back = nowU - S.resumeAt < 1.2;
    const tt = S.t, up = back ? 0.33 : S.mode === 'director' ? 2.6 : 0.9, down = back ? 0.33 : S.mode === 'director' ? 1.6 : 0.6;
    const bt = (st0, v) => (v > st0.v ? up : down);
    if (stems.bedL) { lvl(stems.bedL, tt.bed * 0.75, bt(stems.bedL, tt.bed * 0.75)); lvl(stems.bedR, tt.bed * 0.75, bt(stems.bedR, tt.bed * 0.75)); lpf(stems.bedL, tt.lp); lpf(stems.bedR, tt.lp); }
    if (stems.unease) { lvl(stems.unease, tt.unease, bt(stems.unease, tt.unease)); lpf(stems.unease, tt.uLp); hpf(stems.unease, tt.uHp); }
    if (stems.chase) { lvl(stems.chase, tt.chase, tt.chase > stems.chase.v ? 0.25 : 0.4); lpf(stems.chase, tt.cLp, 0.3); }
  }

  function finaleCues() {
    const P = FINALE[S.fin]; if (!P?.at) return;
    const look = 0.15;
    while (S.finCue < P.at.length && P.at[S.finCue][0] <= S.finT + look) {
      const [t, act] = P.at[S.finCue++];
      const at = C.currentTime + Math.max(0, t - S.finT);
      finaleAct(act, at);
    }
  }
  function finaleAct(act, t) {
    const [name, arg] = act.split(':');
    const num = arg !== undefined ? +arg : NaN;
    switch (name) {
      case 'qing': motif('qing', { t, gain: arg === 'soft' ? 0.45 : 0.75, fx: true }); break;
      case 'count': motif('count', { t, gain: arg === 'soft' ? 0.4 : 0.65, fx: true }); break;
      case 'count6': motif('count6', { t, gain: 0.7, fx: true }); break;
      case 'hit': hit(arg || 'big', { t }); break;
      case 'braam': motif('it', { t, now: arg === 'now', gain: 0.85 }); break;
      case 'riser': riser(num, null, { kind: num <= 3.2 ? 'rev' : 'up', at: t }); break;
      case 'silence': silence(num, { at: t, amb: false }); break;
      case 'tail': motif('tail', { t, gain: 0.6, fx: true }); break;
      case 'meilan': motif('meilan', { t, gain: 0.75, fx: true }); break;
      case 'lullaby-warped': case 'lullaby-true': case 'lullaby': motif(name, { t, gain: Number.isFinite(num) ? num : 0.5, fx: true }); break;
      case 'heart': S.finHeart = true; break;
      case 'bed0': S.finBed0 = true; break;
      case 'bedUp': S.finBedUp = true; break;
      case 'stems0': later(t, () => cutStems(t, 0.05)); callAt(t, () => { S.finStems0 = true; }); break;
      case 'unease': S.finUnease = num; break;
      default: break;
    }
  }

  /** 閱讀中：脈動、心跳停下，追逐層退掉，群鳴與不安層收成很輕、很暗的持續底（像屏住呼吸），約 1.5 秒內完成 */
  function hush() {
    const tt = S.t, bed = Math.min(tt.bed, 0.16) * 0.75;
    lvl(stems.bedL, bed, 0.4); lvl(stems.bedR, bed, 0.4); lpf(stems.bedL, Math.min(tt.lp, 800), 0.5); lpf(stems.bedR, Math.min(tt.lp, 800), 0.5);
    lvl(stems.unease, Math.min(tt.unease, 0.05), 0.4);
    lvl(stems.chase, 0, 0.4);
  }

  // ───────────────────────── 排程（_pump：每幀與每 250 ms，閱讀中也會跑） ─────────────────────────
  function pump(horizon) {
    if (!S.loaded) return;
    const now = C.currentTime, H = horizon ?? now + 0.6;
    while (seq.length && seq[0].t <= H) { const e = seq.shift(); try { e.fn(); } catch (err) { console.warn('[score] seq failed', err); } }
    while (calls.length && calls[0].t <= now + 0.004) { const e = calls.shift(); try { e.fn(); } catch (err) { console.warn('[score] call failed', err); } }
    // 閱讀／對話：遊戲在 story.modal 期間不呼叫 update，但這裡（250 ms 計時器）還在跑。超過 0.35 秒沒有 update 就收成屏息般的底；
    // 例外：結局的時間表、錄音機與戲台的點名（cue 擺好的狀態），以及所有 cue／motif 明確觸發的一次性聲音（走 motif／hit 匯流排，不受影響）
    if (!S.reading && S.lastUpd > 0 && now - S.lastUpd > 0.35) {
      const sc = game()?.story?.scene;
      if (sc !== 'finale' && sc !== 'story:camp' && !S.holdCue) { S.reading = true; hush(); }
    }
    if (S.reading) { S.pulseAt = 0; S.beatAt = 0; return; }
    const tt = S.t, rk = (t) => (S.resumeAt ? clamp((t - S.resumeAt) / 1.0, 0.15, 1) : 1); // 回來的第一秒，脈動與心跳從輕到原本的力度
    const Hp = now - S.lastUpd > 0.12 ? Math.min(H, now + 0.12) : H; // 遊戲可能剛停（閱讀）：脈動與心跳不要排太遠
    // 脈動：軟槌低鼓在拍點、頓弓在第二與第四拍的後半拍
    if (tt.pulse > 0.02 && has('score.pulse') && now >= S.silenceUntil) {
      const gap = 60 / clamp(tt.bpm, 40, 140);
      if (S.pulseAt < now) S.pulseAt = now + 0.05;
      for (let k = 0; S.pulseAt < Hp && k < 16; k++) {
        const n = S.pulseN++;
        const k = rk(S.pulseAt);
        one('score.pulse', { t: S.pulseAt, gain: 0.3 * tt.pulse * k * (n % 4 === 0 ? 1 : 0.75), dest: stemBus, rate: rnd(0.98, 1.02) });
        if (tt.pulse > 0.4 && (n % 4 === 1 || n % 4 === 3) && has('score.tick')) one('score.tick', { t: S.pulseAt + gap * 0.5, gain: 0.17 * tt.pulse * k, dest: stemBus, pan: n % 4 === 1 ? -0.35 : 0.35 });
        S.pulseAt += gap;
      }
    } else S.pulseAt = 0;
    // 心跳：脈動在跑的時候讓位給它
    const heart = tt.pulse > 0.2 ? 0 : tt.heart;
    if (heart > 0.02 && has('score.heart.lub') && now >= S.silenceUntil) {
      const T = Math.max(audio._ten || 0, heart * 0.7 + 0.3);
      const k = clamp((T - 0.3) / 0.7), gap = 60 / (56 + 78 * k);
      if (S.beatAt < now) S.beatAt = now + 0.05;
      for (let i = 0; S.beatAt < Hp && i < 12; i++) {
        const lv = (0.3 + 0.7 * Math.pow(heart, 0.8)) * 0.55 * tt.heartK * rk(S.beatAt);
        one('score.heart.lub', { t: S.beatAt, gain: lv, dest: heartBus, rate: rnd(0.97, 1.03) });
        one('score.heart.dub', { t: S.beatAt + Math.min(0.26, gap * 0.3), gain: lv * 0.8, dest: heartBus, rate: rnd(0.97, 1.03) });
        S.beatAt += gap * rnd(0.98, 1.02);
      }
    } else S.beatAt = 0;
  }

  // ───────────────────────── 地圖 ─────────────────────────
  function onMap(mapId) {
    for (const k in stems) { killStem(stems[k]); stems[k] = null; }
    seq.length = 0; calls.length = 0;
    S.map = mapId; S.dir = 'grace'; S.dirT0 = C.currentTime; S.quietUntil = 0; S.silenceUntil = 0; S.postHitUntil = 0; S.holdCue = ''; S.fin = ''; S.chase = false; S.under = false; S.peakSuck = false; S.done = null; S.lastUpd = 0; S.reading = false; S.resumeAt = 0;
    for (const k in watches) delete watches[k];
    S.sp.key = ''; S.sp.root = null; S.sp.prox = 0;
    for (const p of [suck.gain, heartSuck.gain, dip.gain]) { p.cancelScheduledValues(C.currentTime); p.value = 1; }
    S.loaded = !!mapId && (has('score.unease') || has('score.bed'));
    const M = audio.layerMul;
    M.drone = mapId && has('score.bed') ? 0.15 : 1; // 留一點程序化低鳴當空氣，主體交給錄音
    M.strings = mapId && has('score.unease') ? 0 : 1;
    M.heartbeat = mapId && has('score.heart.lub') ? 0 : 1;
    if (!S.loaded) return;
    if (has('score.bed')) { stems.bedL = makeStem('score.bed', -0.55); stems.bedR = makeStem('score.bed', 0.55); }
    if (has('score.unease')) stems.unease = makeStem('score.unease', 0);
    if (has('score.chase')) stems.chase = makeStem('score.chase', 0);
  }

  // 劇中聲音（耳語、背後的腳步、敲門…）出現時，配樂讓開一下；低頻湧上（有東西出現）時讓得更多，留一點爆點前的空
  const DIEGETIC = new Set(['whisper', 'breath', 'stepBehind', 'step', 'footstep', 'knock', 'knock1', 'scrape', 'drag', 'creak', 'drip', 'gasp', 'inhale', 'sob', 'cry', 'hum', 'marble', 'static', 'noise', 'bellFar', 'bell', 'slam', 'howl', 'dog',
    'childLaugh', 'giggle', 'scream', 'shriek', 'moan', 'counting']); // 後六個是人聲組可能新增的種類（沒有也無妨）
  function duckFor(depth, hold, back) {
    if (!S.loaded) return;
    const now = C.currentTime, p = dip.gain;
    p.cancelScheduledValues(now); p.setTargetAtTime(depth, now, 0.04); p.setTargetAtTime(1, now + hold, back / 3);
  }

  // ───────────────────────── 覆寫 ─────────────────────────
  audio.override('horror', (orig, kind, o) => {
    const r = orig(kind, o);
    if (r && S.loaded && DIEGETIC.has(kind)) duckFor(0.5, 0.7, 1.4);
    return r;
  });
  audio.override('_k_stinger', (orig, o) => {
    if (S.loaded && hit(o.I >= 0.85 ? 'big' : 'small', { pan: o.pan, gain: clamp(0.65 + 0.35 * o.I, 0.4, 1.3) }) >= 0) return;
    orig(o);
  });
  audio.override('_k_sub', (orig, o) => {
    if (S.loaded && has('score.swell')) { one('score.swell', { gain: 0.62 * o.I, dest: hitBus, rate: rnd(0.96, 1.04) }); duckFor(0.3, 2.2, 2.0); return; }
    orig(o);
  });
  audio.override('_k_ring', (orig, o) => {
    orig(o); // 耳鳴本身維持程序化的正弦（最像真的耳鳴），配樂這邊跟著悶住
    if (!S.loaded) return;
    const now = C.currentTime, dur = 4.5 + 1.2 * Math.min(1.5, o.I);
    for (const k in stems) { const st = stems[k]; if (!st) continue; st.f.frequency.cancelScheduledValues(now); st.f.frequency.setTargetAtTime(420, now, 0.05); st.f.frequency.setTargetAtTime(st.lp, now + dur * 0.4, dur * 0.25); }
    if (now - S.lastHit.t < 1.5 && S.lastHit.level === 'big' && now - S.tailAt > 3) { S.tailAt = now; motif('tail', { t: now + 0.4, gain: 0.6 }); }
  });
  audio.override('_k_heartbeat', (orig, o) => {
    if (S.loaded && has('score.heart.lub')) { const lv = clamp(o.I, 0.2, 1.5) * 0.7; one('score.heart.lub', { gain: lv, dest: heartBus }); one('score.heart.dub', { t: C.currentTime + 0.24, gain: lv * 0.8, dest: heartBus }); return; }
    orig(o);
  });
  audio.override('storyCue', (orig, kind) => {
    if (!S.loaded || !audio.ctx) return orig(kind);
    const g = game(), st = g?.story;
    if (kind === 'clue') {
      const ev = st?.state?.evidence, last = ev?.[ev.length - 1];
      if (!has('score.qing')) return orig(kind);
      // 重大發現：各自的主題動機；其他讀物：一記輕的磬
      if (last === 'relic' && !S.done?.relic) { (S.done ??= {}).relic = true; motif('qing', { gain: 0.5 }); motif('lullaby', { t: C.currentTime + 2.2, gain: 0.42, windup: true }); return; }
      if (last === 'births' && !S.done?.births) { (S.done ??= {}).births = true; motif('qing', { gain: 0.5 }); motif('lullaby-frag', { t: C.currentTime + 2.0, gain: 0.38 }); return; }
      if (last === 'confession' && !S.done?.confession) { (S.done ??= {}).confession = true; motif('qing', { gain: 0.6 }); motif('meilan', { t: C.currentTime + 2.5, gain: 0.5 }); return; }
      if (last === 'names' && !S.done?.names) { (S.done ??= {}).names = true; motif('qing', { gain: 0.6 }); motif('rollcall', { t: C.currentTime + 1.6, gap: 0.7, gain: 0.45 }); return; }
      motif('qing', { gain: 0.42, rate: rnd(0.97, 1.03) });
      return;
    }
    if (kind === 'gate') { if (!has('score.qing')) return orig(kind); motif('qing', { gain: 0.8 }); if (has('score.swell')) one('score.swell', { t: C.currentTime + 0.2, gain: 0.45, dest: hitBus }); audio.footstep?.(1.2, 'wood'); return; }
    if (kind === 'threat') { if (!motif('it', { now: !!st?.chase, gain: st?.chase ? 0.7 : 0.85 })) return orig(kind); return; }
    if (kind === 'release') { orig(kind); cue('release'); return; }
    return orig(kind);
  });
  audio.override('presence', (orig, side = 0) => {
    orig(side);
    if (S.loaded && has('score.riser.rev')) one('score.riser.rev', { offset: 3.9, gain: 0.32, pan: clamp(side, -1, 1) * 0.8, dest: hitBus, lp: 3500 });
  });
  audio.override('_pump', (orig, horizon) => { orig(horizon); try { pump(horizon); } catch (err) { console.warn('[score] pump failed', err); } });
  audio.onUpdate(update);
  audio.onMap(onMap);

  const api = audio.score = {
    phase, cue, watch, hit, riser, silence, motif,
    /** 測試：離線渲染時指定一個假的 game（{ story: { scene, chase, finale, world, state }, player: { pos } }）；null 還原 */
    bindGame(g) { bound = g || null; },
    /** 測試：開始記錄每個一次性聲音的排程時間（回傳陣列） */
    traceOn() { trace = []; return trace; },
    get loaded() { return S.loaded; },
    get state() {
      const t = S.t;
      return {
        loaded: S.loaded, map: S.map, mode: S.mode, phase: S.dir, finale: S.fin, setpiece: S.sp.key ? { key: S.sp.key, ...(watches[S.sp.key] || {}) } : null,
        targets: { bed: +t.bed.toFixed(3), unease: +t.unease.toFixed(3), chase: +t.chase.toFixed(3), pulse: +t.pulse.toFixed(3), bpm: Math.round(t.bpm), heart: +t.heart.toFixed(3), lp: Math.round(t.lp) },
        stems: Object.fromEntries(Object.entries(stems).map(([k, v]) => [k, v ? +v.v.toFixed(3) : null])),
        lastHit: { ...S.lastHit }, quietFor: Math.max(0, +(S.quietUntil - C.currentTime).toFixed(2)), silentFor: Math.max(0, +(S.silenceUntil - C.currentTime).toFixed(2)),
        queued: seq.length + calls.length, live, reading: S.reading,
      };
    },
  };
  return api;
}
