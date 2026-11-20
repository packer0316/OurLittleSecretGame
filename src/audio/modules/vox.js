/**
 * vox 組：人聲與驚嚇（真人錄音 + 本機 TTS 處理過的台詞；素材沒載入時一律退回 AudioSys 的程序化版本）。
 *
 * 覆寫的 horror 種類：whisper（貼耳耳語，強度高時偶爾左右各一個）、breath（頸後的呼吸）、gasp（倒抽氣，男聲＝玩家自己）、
 *   sob（遠處女人的啜泣）、hum（遠處小孩哼走音的童謠：真人嗓音換成遊戲的旋律）、breathCue（電話裡被一模一樣重複兩次的吸氣）。
 * 新增的 horror 種類（audio.horror(名稱, { pan, dist, intensity })，其他組可以直接呼叫）：
 *   childLaugh    空殿深處的小孩笑聲（dist > 12 改用帶回音的遠處版本）
 *   giggle        壓低的小孩竊笑（近、悶，像躲在布幔後面）
 *   childCry      小孩的啜泣
 *   scream        女人恐懼的尖叫（美蘭被攔在門外）
 *   shriek        「它」的尖嘯（真人尖叫降調、倒放、環形調變）
 *   moan          低吟／呻吟
 *   counting      點名動機：小孩耳語數一到五，第六聲是「它」低沉的聲音（約 6.5 秒）
 *   whisperCloud  四面八方湧上來的耳語雲（約 6 秒）
 *   itBreath      倒放的吸氣（「它」的動機）
 *   shush         貼耳的「噓——」
 * 台詞（finaleAudio.speak / synth.speak 先問這裡，有錄音就播錄音，沒有就退回共振峰合成）：
 *   audio.vox.speakF(拼音, 聲音, 選項) → 秒數 | 0      結局：鍵 'f|聲音|拼音'
 *   audio.vox.speakS(拼音, 選項) → 秒數 | 0            寺內段落：鍵 's|who|w/v|拼音'，同一鍵有好幾個角色時用最接近的 pitch
 * 其他：audio.vox.play(名稱, { t, pan, dist, gain, rate, wet, hrtf, behind, near, lp, above }) 播 core 素材（同 bank.play 的選項）；
 *       audio.vox.has(名稱)、ready(decodeAll) → Promise（離線渲染前 await，確保素材已解碼）、prefetch(鍵)、stats()。
 *
 * 記憶體：whisper / breath / gasp 登記在素材庫（src/audio/lib/vox.js，地圖載入時預先解碼，約 4 MB）；
 *   其他人聲（vox/core.bin）與台詞（vox/lines.bin，只在寺廟）只把壓縮檔留在記憶體，用到才解碼，已解碼的總量以 LRU 限制在 CAP 以內。
 *   台詞依劇情順序預先解碼後面幾句（解碼約 10–30 ms，第一句可能晚這麼一點點）。
 */
const BASE = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL ? import.meta.env.BASE_URL : '/') + 'assets/audio/vox/';
const CAP = 8 * 1048576;
const PACKS = { core: ['temple', 'road', 'home'], lines: ['temple'] };
const PREFETCH = 5;
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

/** 校正：錄音（約 −19～−22 LUFS 正規化）在混音裡對上原本程序化聲音的響度（scripts/audio-vox.mjs 量測後調整） */
const GAIN = {
  // 原有種類：錄音約比程序化版本大 1–2 dB（更清楚、更近），啜泣與哼唱是遠處的聲音，略小
  whisper: 0.72, breath: 0.85, gasp: 0.68, sob: 1.45, hum: 1.3, breathCue: 0.63,
  childLaugh: 0.8, giggle: 0.75, childCry: 1.1, scream: 0.9, shriek: 1.0, moan: 0.9, counting: 0.65, whisperCloud: 1.1, itBreath: 0.64, shush: 0.9,
  // 台詞：比共振峰合成大約 2 dB；嘶喊（scream）另外補回合成版本的加成
  lineF: 0.67, lineS: 0.67, lineSWhisper: 2.4, lineScream: 2.6,
};
/** core 素材的預設播放速度範圍 */
const RATE = { sob: [0.97, 1.02], childLaugh: [0.95, 1.06], giggle: [0.96, 1.08], childCry: [0.97, 1.03], scream: [0.97, 1.03], shriek: [0.94, 1.02], moan: [0.92, 1.04], whisperCloud: [0.97, 1.03], shush: [0.95, 1.05], cough: [0.95, 1.05] };

export function install(audio) {
  const ctx = () => audio.ctx;
  const packs = {}; // name → { state, bin, index, promise }
  const core = {}; // 名稱 → [take]
  const lines = {}; // 鍵 → [{ id, p, o, g, takes: [take] }]
  const order = []; // 劇情順序 → variant（預先解碼用）
  const last = {};
  let decoded = 0, mapId = null, offline = false;
  const queue = []; let busy = 0;

  // ───────────────────────── 素材包 ─────────────────────────
  function loadPack(name) {
    if (packs[name]?.promise) return packs[name].promise;
    const pk = (packs[name] = { state: 'loading', bin: null, index: null });
    const get = (f, kind) => fetch(BASE + f).then((r) => { if (!r.ok) throw new Error(`${r.status} ${f}`); return kind === 'json' ? r.json() : r.arrayBuffer(); });
    pk.promise = Promise.all([get(name + '.json', 'json'), get(name + '.bin', 'bin')])
      .then(([index, bin]) => {
        if (packs[name] !== pk) return;
        pk.index = index; pk.bin = bin; pk.state = 'ready';
        const mk = (t) => ({ pack: name, off: t[0], len: t[1], dur: t[2], buf: null, pending: null, used: 0, bytes: 0, failed: false });
        if (name === 'core') for (const [k, list] of Object.entries(index.items)) core[k] = list.map(mk);
        else for (const [k, vars] of Object.entries(index.items)) { lines[k] = vars.map((v) => ({ ...v, takes: v.t.map(mk) })); for (const v of lines[k]) order[v.o] = v; }
      })
      .catch((err) => { pk.state = 'failed'; console.warn('[audio] vox 素材包無法載入', name, err?.message || err); });
    return pk.promise;
  }
  function unloadPack(name) {
    const pk = packs[name]; if (!pk) return;
    const drop = (t) => { if (t.buf) { decoded -= t.bytes; t.buf = null; } };
    if (name === 'core') { for (const k of Object.keys(core)) { core[k].forEach(drop); delete core[k]; } }
    else { for (const k of Object.keys(lines)) { for (const v of lines[k]) v.takes.forEach(drop); delete lines[k]; } order.length = 0; }
    delete packs[name];
  }

  // ───────────────────────── 解碼（LRU）─────────────────────────
  function decode(t) {
    if (t.buf) { t.used = performance.now(); return Promise.resolve(t.buf); }
    if (t.pending) return t.pending;
    const pk = packs[t.pack]; if (!pk?.bin || t.failed || !ctx()) return Promise.resolve(null);
    const ab = pk.bin.slice(t.off, t.off + t.len);
    t.pending = new Promise((res, rej) => { const q = ctx().decodeAudioData(ab, res, rej); if (q?.then) q.then(res, rej); })
      .then((buf) => {
        t.pending = null;
        if (packs[t.pack] !== pk) return null;
        if (!t.buf) { t.buf = buf; t.bytes = buf.length * buf.numberOfChannels * 4; decoded += t.bytes; }
        t.used = performance.now(); evict(t);
        return t.buf;
      })
      .catch((err) => { t.pending = null; t.failed = true; console.warn('[audio] vox 解碼失敗', err?.message || err); return null; });
    return t.pending;
  }
  function evict(keep) {
    if (decoded <= CAP) return;
    const all = [];
    for (const list of Object.values(core)) for (const t of list) if (t.buf && t !== keep) all.push(t);
    for (const vars of Object.values(lines)) for (const v of vars) for (const t of v.takes) if (t.buf && t !== keep) all.push(t);
    all.sort((a, b) => a.used - b.used);
    for (const t of all) { if (decoded <= CAP) break; decoded -= t.bytes; t.buf = null; t.bytes = 0; }
  }
  /** 背景解碼佇列（一次最多兩個，避免一口氣塞滿解碼執行緒） */
  function warm(t) { if (!t || t.buf || t.pending || t.failed) return; queue.push(t); pump(); }
  function pump() {
    while (busy < 2 && queue.length) { const t = queue.shift(); if (t.buf || t.pending) continue; busy++; decode(t).finally(() => { busy--; pump(); }); }
  }

  // ───────────────────────── 播放 ─────────────────────────
  function start(buf, o) {
    const c = ctx(); if (!c || !audio.running) return null;
    const rate = o.rate || 1;
    const dur = buf.duration / rate;
    const v = audio._voice({ t: o.t, dur: dur + 0.05, pan: o.pan || 0, dist: o.dist ?? 1, gain: o.gain ?? 1, wet: o.wet ?? 1, hrtf: !!o.hrtf, behind: !!o.behind, above: o.above || 0, lp: o.lp || 0, near: o.near || 0 });
    const src = c.createBufferSource(); src.buffer = buf; src.playbackRate.value = rate;
    if (o.detune && src.detune) src.detune.value = o.detune;
    const g = c.createGain(); v.nodes.push(g);
    if (o.fadeIn) { g.gain.setValueAtTime(0.0001, v.t); g.gain.linearRampToValueAtTime(1, v.t + o.fadeIn); }
    src.connect(g).connect(v.bus);
    src.start(v.t); src.stop(v.t + dur + 0.05);
    v.srcs.push(src);
    return { src, gain: g, voice: v, duration: dur };
  }
  function pick(list, key) {
    if (!list?.length) return null;
    let i = Math.floor(Math.random() * list.length);
    if (list.length > 1 && i === last[key]) i = (i + 1 + Math.floor(Math.random() * (list.length - 1))) % list.length;
    last[key] = i;
    return list[i];
  }
  /** 播一個 take：已解碼就馬上播；還沒解碼就先解碼（約 10–30 ms）再播（排定的時間已過就立刻播） */
  function playTake(t, o) {
    if (!t || !ctx() || !audio.running) return 0;
    const rate = o.rate || 1, dur = t.dur / rate;
    if (t.buf) { t.used = performance.now(); return start(t.buf, o) ? dur : 0; }
    if (!packs[t.pack]?.bin || t.failed) return 0;
    decode(t).then((buf) => { if (buf) start(buf, { ...o, t: Math.max(o.t ?? 0, ctx().currentTime) }); });
    return dur;
  }
  function has(name) { return !!core[name]?.some((t) => !t.failed); }
  function play(name, o = {}) {
    const t = pick(core[name], name); if (!t) return 0;
    const r = RATE[name];
    return playTake(t, { ...o, rate: o.rate ?? (r ? rnd(r[0], r[1]) : 1) });
  }
  const bank = () => audio.bank;
  const bankHas = (id) => !!bank()?.has(id);

  // ───────────────────────── 台詞 ─────────────────────────
  const norm = (py) => String(py || '').trim().replace(/\s+/g, ' ');
  /** finaleAudio 有兩句用臨時的聲音物件（阿哲沙啞、擔架上虛弱的阿哲）：以基頻與語速辨認 */
  function voiceName(voice) {
    if (typeof voice === 'string') return voice;
    if (voice && typeof voice === 'object') {
      if (Math.round(voice.f0) === 104 && voice.rate === 0.8) return 'ahzheHoarse';
      if (Math.round(voice.f0) === 104 && voice.rate === 0.7) return 'ahzheWeak';
    }
    return null;
  }
  function prefetchFrom(v) {
    for (let i = 1; i <= PREFETCH; i++) { const n = order[v.o + i]; if (n && n.g === v.g) warm(n.takes[0]); }
  }
  function sayVariant(v, key, o) {
    const t = pick(v.takes, key); if (!t) return 0;
    const d = playTake(t, o);
    if (d) prefetchFrom(v);
    return d;
  }
  function speakF(pinyin, voice, o = {}) {
    const name = voiceName(voice); if (!name) return 0;
    const key = `f|${name}|${norm(pinyin)}`, vars = lines[key]; if (!vars) return 0;
    // speed < 1（念快，例如錄音帶越數越急）→ 播放稍快、音高略升；speed > 1 原本是讓合成語音慢一點，錄音本來就是自然語速，只放慢一點點
    const sp = o.speed || 1;
    const rate = clamp(Math.pow(1 / sp, 0.35), 0.96, 1.3);
    return sayVariant(vars[0], key, {
      pan: o.pan ?? 0, dist: o.dist ?? 1.2, behind: !!o.behind, hrtf: o.hrtf ?? true, near: o.near ?? 0.3, wet: o.wet ?? 1, lp: o.lp || 0,
      gain: (o.gain ?? 1) * GAIN.lineF * (o.scream ? GAIN.lineScream : 1), rate,
    });
  }
  function speakS(py, o = {}) {
    const p = norm(py), who = o.who || 'child', whisper = !!o.whisper;
    if (p === 'he5' && core.inhale) return play('inhale', { dist: o.dist ?? 0.3, gain: (o.gain ?? 1) * 2.4, wet: 0.4, pan: o.pan || 0, t: ctx().currentTime + (o.delay || 0) });
    if (p === 'xu1' && core.shush) return play('shush', { dist: o.dist ?? 2, pan: o.pan || 0, gain: (o.gain ?? 1) * GAIN.shush * 1.3, wet: o.wet ?? 1, hrtf: !!o.hrtf, behind: !!o.behind, near: o.hrtf ? 0.65 : 0, t: ctx().currentTime + (o.delay || 0) });
    const key = `s|${who}|${whisper ? 'w' : 'v'}|${p}`, vars = lines[key]; if (!vars) return 0;
    const pitch = o.pitch ?? 1;
    let v = vars[0];
    for (const x of vars) if (Math.abs((x.p ?? 1) - pitch) < Math.abs((v.p ?? 1) - pitch)) v = x;
    const rate = clamp(Math.pow(o.rate || 1, 0.3), 0.88, 1.2);
    return sayVariant(v, key, {
      t: ctx().currentTime + (o.delay || 0), pan: o.pan || 0, dist: o.dist ?? 2, hrtf: !!o.hrtf, behind: !!o.behind, near: o.hrtf ? 0.65 : 0,
      lp: o.muffle ? 1500 : 0, wet: o.wet ?? 1, gain: (o.gain ?? 1) * (whisper ? GAIN.lineSWhisper : GAIN.lineS), rate,
    });
  }
  function prefetch(keys) { for (const k of [].concat(keys)) { const vars = lines[k]; if (vars) for (const v of vars) warm(v.takes[0]); else if (core[k]) warm(core[k][0]); } }

  // ───────────────────────── 程序化退回（沒有素材時） ─────────────────────────
  /** 一串短促的「哈」：小孩笑聲的退回版本 */
  function laughSynth({ pan, dist, I }, n = 6, lpHz = 0) {
    const a = audio, v = a._voice({ dur: n * 0.15 + 0.3, pan, dist, gain: 0.5 * I, wet: 1.4, lp: lpHz });
    const t = v.t, o = a._o(v, 'sawtooth', 360, t, n * 0.15 + 0.2), f1 = a._f(v, 'bandpass', 1050, 4), f2 = a._f(v, 'bandpass', 2700, 6), g = a._g(v);
    o.connect(f1).connect(g); o.connect(f2).connect(g); g.connect(v.bus);
    g.gain.setValueAtTime(0.0001, t);
    for (let i = 0; i < n; i++) {
      const at = t + i * rnd(0.12, 0.16), f = rnd(330, 420) * (1 - i * 0.025);
      o.frequency.setValueAtTime(f * 1.1, at); o.frequency.exponentialRampToValueAtTime(f * 0.85, at + 0.08);
      g.gain.setTargetAtTime(rnd(0.4, 0.8), at, 0.008); g.gain.setTargetAtTime(0.0001, at + 0.06, 0.02);
    }
  }
  function screamSynth({ pan, dist, I }, low = false) {
    const a = audio, dur = low ? 1.6 : 1.4, v = a._voice({ dur: dur + 0.2, pan, dist, gain: 0.8 * I, wet: 1.6 });
    const t = v.t, g = a._g(v), sh = a.ctx.createWaveShaper(), c = new Float32Array(1025);
    for (let i = 0; i < c.length; i++) { const x = (i / 1024) * 2 - 1; c[i] = Math.tanh(x * 3.5); } sh.curve = c; v.nodes.push(sh);
    const base = low ? 700 : 980;
    for (const [m, gn] of [[1, 1], [1.06, 0.7], [0.5, 0.4]]) {
      const os = a._o(v, 'sawtooth', base * m, t, dur), og = a._g(v, gn * 0.3);
      os.frequency.setValueAtTime(base * m * 0.9, t); os.frequency.exponentialRampToValueAtTime(base * m * 1.05, t + 0.2); os.frequency.exponentialRampToValueAtTime(base * m * (low ? 0.45 : 0.7), t + dur);
      const vb = a._o(v, 'sine', rnd(6, 9), t, dur), vd = a._g(v, 40); vb.connect(vd).connect(os.detune);
      os.connect(og).connect(sh);
    }
    const f1 = a._f(v, 'bandpass', 1200, 4), f2 = a._f(v, 'bandpass', 2600, 5); sh.connect(f1).connect(g); sh.connect(f2).connect(g); g.connect(v.bus);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(1, t + 0.06); g.gain.setTargetAtTime(0.5, t + 0.5, 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  function noisePuff({ pan, dist, I }, { f = 3000, q = 1.5, dur = 0.9, rise = false, gain = 0.6, hrtf = false, behind = false } = {}) {
    const a = audio, v = a._voice({ dur: dur + 0.1, pan, dist, gain: gain * I, wet: 0.8, hrtf, behind, near: hrtf ? 0.6 : 0 });
    const s = a._n(v, a.pink, v.t, dur), bp = a._f(v, 'bandpass', f, q), g = a._g(v);
    s.connect(bp).connect(g).connect(v.bus);
    g.gain.setValueAtTime(0.0001, v.t);
    if (rise) { g.gain.exponentialRampToValueAtTime(1, v.t + dur * 0.92); g.gain.linearRampToValueAtTime(0.0001, v.t + dur); }
    else { g.gain.linearRampToValueAtTime(1, v.t + 0.08); g.gain.setTargetAtTime(0.0001, v.t + dur * 0.6, dur * 0.15); }
  }
  function moanSynth({ pan, dist, I }) {
    const a = audio, dur = 2.6, v = a._voice({ dur: dur + 0.2, pan, dist, gain: 0.9 * I, wet: 1.8 });
    const t = v.t, o = a._o(v, 'sawtooth', 112, t, dur), f1 = a._f(v, 'bandpass', 520, 5), f2 = a._f(v, 'bandpass', 900, 6), g = a._g(v);
    o.frequency.setValueAtTime(118, t); o.frequency.linearRampToValueAtTime(96, t + dur);
    f1.frequency.linearRampToValueAtTime(420, t + dur); o.connect(f1).connect(g); o.connect(f2).connect(g); g.connect(v.bus);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.7, t + 0.8); g.gain.setTargetAtTime(0.0001, t + 1.6, 0.35);
  }

  // ───────────────────────── 覆寫既有的人聲 ─────────────────────────
  audio.override('_k_whisper', (orig, o) => {
    if (!bankHas('vox.whisper')) return orig(o);
    const { pan, dist, I } = o, side = pan || (Math.random() < 0.5 ? -0.8 : 0.8);
    bank().play('vox.whisper', { pan: side, dist: Math.min(dist, 1.2) * 0.35, gain: GAIN.whisper * I, wet: 0.35, hrtf: true, near: 0.75 });
    // 強度高時：另一隻耳朵慢半拍再來一個（兩個人同時貼著你）
    if (I >= 0.9 && Math.random() < 0.35) bank().play('vox.whisper', { t: ctx().currentTime + rnd(0.25, 0.6), pan: -side * 0.9, dist: Math.min(dist, 1.2) * 0.4, gain: GAIN.whisper * I * 0.6, wet: 0.35, hrtf: true, near: 0.75 });
  });
  audio.override('_k_breath', (orig, o) => {
    if (!bankHas('vox.breath')) return orig(o);
    const { pan, dist, I } = o;
    bank().play('vox.breath', { pan: pan * 0.5, dist: Math.min(dist, 1.5) * 0.4, gain: GAIN.breath * I, wet: 0.3, hrtf: true, behind: true, near: 0.5 });
  });
  audio.override('_k_gasp', (orig, o) => {
    if (!bankHas('vox.gasp')) return orig(o);
    const { pan, dist, I } = o;
    bank().play('vox.gasp', { pan, dist: Math.min(dist, 2) * 0.4, gain: GAIN.gasp * I, wet: 0.5, hrtf: true, near: 0.6 });
  });
  audio.override('_k_sob', (orig, o) => { if (!has('sob') || !play('sob', { pan: o.pan, dist: o.dist + 6, gain: GAIN.sob * o.I, wet: 2 })) orig(o); });
  audio.override('_k_hum', (orig, o) => { if (!has('childHum') || !play('childHum', { pan: o.pan, dist: o.dist + 3, gain: GAIN.hum * o.I, wet: 1.8, rate: rnd(0.97, 1.02) })) orig(o); });
  audio.override('breathCue', (orig) => { if (!audio.ctx || !has('phoneBreath') || !play('phoneBreath', { dist: 0.3, pan: 0.25, gain: GAIN.breathCue, wet: 0.2 })) orig(); });

  // ───────────────────────── 新的 horror 種類 ─────────────────────────
  audio._k_childLaugh = function (o) {
    const far = o.dist > 12 && has('childLaughFar');
    if (play(far ? 'childLaughFar' : 'childLaugh', { pan: o.pan, dist: o.dist, gain: GAIN.childLaugh * o.I, wet: far ? 1.2 : 1.7 })) return;
    laughSynth(o, 6);
  };
  audio._k_giggle = function (o) { if (!play('giggle', { pan: o.pan, dist: o.dist, gain: GAIN.giggle * o.I, wet: 1.3, lp: 2200 })) laughSynth(o, 4, 1600); };
  audio._k_childCry = function (o) { if (!play('childCry', { pan: o.pan, dist: o.dist + 4, gain: GAIN.childCry * o.I, wet: 1.8 })) audio._k_sob.call(audio, o); };
  audio._k_scream = function (o) { if (!play('scream', { pan: o.pan, dist: o.dist, gain: GAIN.scream * o.I, wet: 1.8 })) screamSynth(o); };
  audio._k_shriek = function (o) { if (!play('shriek', { pan: o.pan, dist: Math.min(o.dist, 6), gain: GAIN.shriek * o.I, wet: 1.5 })) screamSynth(o, true); };
  audio._k_moan = function (o) { if (!play('moan', { pan: o.pan, dist: o.dist, gain: GAIN.moan * o.I, wet: 1.8 })) moanSynth(o); };
  audio._k_counting = function (o) {
    if (play('counting', { pan: o.pan, dist: Math.min(o.dist, 3) * 0.5, gain: GAIN.counting * o.I, wet: 0.6, hrtf: true, behind: true, near: 0.5 })) return;
    for (let i = 0; i < 5; i++) noisePuff({ pan: o.pan, dist: 0.6, I: o.I * 0.6 }, { f: 2600, q: 2, dur: 0.35 });
  };
  audio._k_whisperCloud = function (o) {
    if (play('whisperCloud', { pan: o.pan * 0.4, dist: Math.max(0.6, o.dist * 0.4), gain: GAIN.whisperCloud * o.I, wet: 0.9, hrtf: true, behind: true, near: 0.3 })) return;
    audio._k_whisper.call(audio, { pan: -0.8, dist: 0.6, I: o.I * 0.7 }); audio._k_whisper.call(audio, { pan: 0.8, dist: 0.6, I: o.I * 0.7 });
  };
  audio._k_itBreath = function (o) { if (!play('itBreath', { pan: o.pan * 0.4, dist: Math.min(o.dist, 2) * 0.4, gain: GAIN.itBreath * o.I, wet: 0.8, hrtf: true, behind: true, near: 0.4 })) noisePuff({ pan: o.pan, dist: 0.5, I: o.I }, { f: 1100, q: 1.2, dur: 1.5, rise: true, gain: 0.7, hrtf: true, behind: true }); };
  audio._k_shush = function (o) { if (!play('shush', { pan: o.pan || 0.7, dist: Math.min(o.dist, 1.5) * 0.4, gain: GAIN.shush * o.I, wet: 0.4, hrtf: true, near: 0.7 })) noisePuff({ pan: o.pan || 0.7, dist: 0.4, I: o.I }, { f: 3600, q: 1.3, dur: 1.0, gain: 0.5, hrtf: true }); };

  // ───────────────────────── 地圖 ─────────────────────────
  function want(id) {
    if (!id || id === mapId) return;
    mapId = id;
    offline = !!audio.offline;
    for (const [name, maps] of Object.entries(PACKS)) {
      if (maps.includes(id)) loadPack(name).then(() => { if (name === 'core' && !offline) for (const k of ['sob', 'childLaugh', 'giggle', 'shush', 'inhale', 'phoneBreath', 'cough']) warm(core[k]?.[0]); });
      else if (packs[name]) unloadPack(name);
    }
  }
  // 地圖一開始載入（Game.loadMap 呼叫 bank.preload）就同時下載素材包，和貼圖並行；onMap 是保險
  const bk = audio.bank;
  if (bk && typeof bk.preload === 'function') { const pre = bk.preload.bind(bk); bk.preload = (id, cb) => { try { want(id); } catch { /* 不影響素材庫 */ } return pre(id, cb); }; }
  audio.onMap((id) => want(id));

  const api = {
    has, play, speakF, speakS, prefetch,
    hasLine: (key) => !!lines[key],
    /** 等素材包載入；decodeAll = true 時把全部（或指定名稱）解碼完（離線渲染、測試用；會暫時超過 CAP） */
    async ready(decodeAll = false) {
      const ids = Object.entries(PACKS).filter(([, m]) => m.includes(mapId || 'temple')).map(([n]) => n);
      await Promise.all(ids.map(loadPack));
      if (decodeAll) {
        const all = [];
        const want = Array.isArray(decodeAll) ? new Set(decodeAll) : null;
        for (const [k, list] of Object.entries(core)) if (!want || want.has(k)) all.push(...list);
        for (const [k, vars] of Object.entries(lines)) if (!want || want.has(k)) for (const v of vars) all.push(...v.takes);
        for (const t of all) if (!t.buf) await decode(t); // 解碼後仍受 LRU 上限約束：要播的素材請放在最後指定
        for (const t of all.slice(-8)) if (!t.buf) await decode(t);
      }
      return api.stats();
    },
    keys: () => ({ core: Object.keys(core), lines: Object.keys(lines) }),
    stats() {
      let n = 0, takes = 0, failed = 0; for (const list of Object.values(core)) { takes += list.length; for (const t of list) { if (t.buf) n++; if (t.failed) failed++; } }
      let ln = 0, lt = 0; for (const vars of Object.values(lines)) for (const v of vars) { lt += v.takes.length; for (const t of v.takes) { if (t.buf) ln++; if (t.failed) failed++; } }
      const bin = Object.values(packs).reduce((s, p) => s + (p.bin?.byteLength || 0), 0);
      return { map: mapId, packs: Object.fromEntries(Object.entries(packs).map(([k, p]) => [k, p.state])), decodedMB: +(decoded / 1048576).toFixed(2), capMB: CAP / 1048576, compressedMB: +(bin / 1048576).toFixed(2), failed, core: { takes, decoded: n }, lines: { keys: Object.keys(lines).length, takes: lt, decoded: ln } };
    },
  };
  audio.vox = api;
  return api;
}
