/**
 * 全程序化音效（Web Audio，無外部錄音素材）。
 *
 * 訊號路徑：
 *   環境聲各層 ─► ambIn ─► ambLP（耳鳴時悶住）─► duckGain ─► master
 *   一次性音效（Voice）─► 距離低通 ─► 方位（StereoPanner / HRTF）─┬► fxBus ─► master
 *                                                              └► revSend ─► 三組合成脈衝響應殘響 ─► master
 *   緊張層（低鳴、高頻弦音）─► tensionDuck ─► master；心跳直接進 fxBus（死寂時仍然聽得到）
 *   master ─► 壓縮器 ─► 柔性限幅 ─► 輸出
 *
 * 對外合約（共同簡報 D）：
 *   horror(kind, { pan, dist, intensity })、setTension(x)、duck(seconds)
 *   既有：footstep、creak、click、bell、woodenFish、breathCue、storyCue、phoneRing、presence、doorKnock
 * 地圖可每幀寫入 audio.zone（'crypt' | 'grave' | 'workshop' …）指定聲學空間，沒寫就依 profile 與室內外推斷。
 *
 * 錄音素材與聲音模組（src/audio/）：init() 之後 audio.bank 是錄音素材庫，src/audio/modules/ 的模組（配樂 score、
 * 環境與擬音 foley、人聲與驚嚇 vox）以 override / onUpdate / envHook / layerMul 疊加或取代這裡的程序化聲音。
 * 素材沒載入（測試、離線、下載失敗）時一律退回程序化版本。另外兩條匯流排：scoreBus（配樂，跟著緊張層一起被 duck 抽空）、uiBus（介面音，乾聲）。
 */

import { createBank } from '../audio/bank.js';
import { installModules } from '../audio/index.js';

const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const cents = (c) => Math.pow(2, c / 1200);
const MAX_VOICES = 26;
/** 各材質腳步的整體增益（量測後配平：走路峰值約 0.1–0.16） */
const STEP_GAIN = { dirt: 2.0, stone: 1.6, wood: 1.2, gravel: 1.9, grass: 2.2, floor: 2.6 };

/** 各聲學空間的環境層比例。rev 是殘響種類，wet 是一次性音效送進殘響的量。 */
const SPACES = {
  open:     { wind: 0.30, lp: 440, howl: 0.30, leaf: 1.0, bug: 1.0, room: 0.0, rev: 'hall', wet: 0.14 },
  grave:    { wind: 0.24, lp: 300, howl: 0.75, leaf: 0.45, bug: 0.0, room: 0.0, rev: 'hall', wet: 0.16 },
  hall:     { wind: 0.12, lp: 240, howl: 1.0, leaf: 0.0, bug: 0.05, room: 0.5, rev: 'hall', wet: 0.6 },
  crypt:    { wind: 0.0, lp: 200, howl: 0.0, leaf: 0.0, bug: 0.0, room: 1.0, rev: 'crypt', wet: 0.9 },
  workshop: { wind: 0.11, lp: 260, howl: 0.5, leaf: 0.0, bug: 0.1, room: 0.35, rev: 'room', wet: 0.45, ember: 1 },
  room:     { wind: 0.045, lp: 300, howl: 0.0, leaf: 0.0, bug: 0.0, room: 0.22, rev: 'room', wet: 0.28, rain: 1, hum: 1 },
};

/** horror(kind) 的最短重複間隔（秒）：就算呼叫端每幀誤觸也不會疊出一堆節點 */
const COOLDOWN = { stinger: 0.6, sub: 1.2, ring: 2, hum: 2, bellFar: 1.5, slam: 0.4, scrape: 0.5, whisper: 0.35, breath: 0.6, howl: 2, sob: 2, marble: 1.5 };
const ALIAS = { drag: 'scrape', step: 'stepBehind', footstep: 'stepBehind', bell: 'bellFar', dog: 'howl', cry: 'sob', tinnitus: 'ring', noise: 'static', inhale: 'gasp' };

function env(param, t, attack, peak, decay) {
  param.setValueAtTime(0.0001, t);
  param.linearRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  param.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.volume = 0.8;
    this.running = false;
    this.indoor = 0;
    this.profile = null; // 'home' | 'road' | null（寺廟），由地圖寫入
    this.released = false; // 真結局之後：恐怖環境聲全部停止
    this.zone = null; // 地圖每幀可指定的聲學空間
    this.windowNear = 0.5; // 住處：離窗戶多近（0..1），影響雨聲
    this.space = '';
    this.tension = 0;
    this.wetAmt = 0.14;
    this.offline = false;
    this._ten = 0;
    this._t = 0;
    this._nextGust = 0;
    this._gust = 0.4;
    this._howlHz = 780;
    this._nextChirp = 0;
    this._bugOn = 1;
    this._ev = Object.create(null);
    this._last = Object.create(null);
    this._voices = new Set();
    this._pv = new Map();
    this._beatAt = 0;
    this._stepSide = 1;
    this._surface = 'dirt';
    this._duckUntil = 0;
    // 聲音模組（src/audio/index.js）
    this.bank = null;
    this.modules = {};
    this.layerMul = { wind: 1, howl: 1, leaf: 1, room: 1, bug: 1, rain: 1, pane: 1, hum: 1, ember: 1, drone: 1, strings: 1, heartbeat: 1 };
    this._updaters = [];
    this._envHooks = Object.create(null);
    this._mapHooks = [];
    this._gustNow = 0.4;
  }

  /** 覆寫一個方法：fn(orig, ...args)，orig 是覆寫前的版本（可疊加或退回程序化聲音） */
  override(name, fn) {
    const prev = typeof this[name] === 'function' ? this[name].bind(this) : () => {};
    this[name] = (...args) => fn(prev, ...args);
  }
  onUpdate(fn) { this._updaters.push(fn); }
  envHook(name, fn) { this._envHooks[name] = fn; }
  onMap(fn) { this._mapHooks.push(fn); }
  /** Game.loadMap 在地圖建好、素材載完之後呼叫 */
  mapReady(mapId) {
    for (const fn of this._mapHooks) { try { fn(mapId); } catch (err) { console.warn('[audio] onMap failed', err); } }
  }

  /** 必須在使用者手勢（點擊）後呼叫。測試可傳入 OfflineAudioContext。 */
  init(ctxOverride) {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = ctxOverride || (AC ? new AC() : null);
    if (!ctx) return;
    this.ctx = ctx;
    this.offline = typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext;
    const G = (v = 1) => { const g = ctx.createGain(); g.gain.value = v; return g; };
    const F = (type, freq, q = 0.7) => { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; return f; };

    // ── 主輸出：壓縮 + 柔性限幅（保證不破音）──
    this.master = G(0);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -15; comp.knee.value = 9; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.24;
    const pre = G(0.5), clip = ctx.createWaveShaper();
    const curve = new Float32Array(2049);
    for (let i = 0; i < curve.length; i++) {
      const x = ((i / (curve.length - 1)) * 2 - 1) * 2, a = Math.abs(x);
      curve[i] = Math.sign(x) * (a < 0.6 ? a : 0.6 + 0.38 * Math.tanh((a - 0.6) / 0.38));
    }
    clip.curve = curve;
    this.master.connect(comp).connect(pre).connect(clip).connect(ctx.destination);
    this.out = clip;

    this._makeNoise();

    // ── 匯流排 ──
    this.fxBus = G(1); this.fxBus.connect(this.master);
    this.revSend = G(1);
    this.revReturn = G(0.85); this.revReturn.connect(this.master);
    this.revIn = {};
    const irs = {
      room: this._makeIR(0.7, { rt60: 0.42, pre: 0.004, a0: 0.55, a1: 0.16, taps: 7, span: 0.03 }),
      hall: this._makeIR(3.4, { rt60: 2.7, pre: 0.022, a0: 0.5, a1: 0.07, taps: 9, span: 0.09 }),
      crypt: this._makeIR(4.6, { rt60: 3.9, pre: 0.012, a0: 0.3, a1: 0.035, taps: 12, span: 0.06 }),
    };
    for (const k of Object.keys(irs)) {
      const cv = ctx.createConvolver(); cv.normalize = false; cv.buffer = irs[k];
      this.revIn[k] = G(k === 'hall' ? 1 : 0);
      this.revSend.connect(this.revIn[k]).connect(cv).connect(this.revReturn);
    }
    this.ambIn = G(1);
    this.ambLP = F('lowpass', 20000, 0.5);
    this.duckGain = G(1);
    this.ambIn.connect(this.ambLP).connect(this.duckGain).connect(this.master);
    this.ambWet = G(1); this.ambWet.connect(this.revSend); // 環境事件（木頭聲、滴水）送殘響的量，duck 一併抽掉
    this.tensionDuck = G(1); this.tensionDuck.connect(this.master);
    this.hrtfOK = typeof ctx.createPanner === 'function';
    if (this.hrtfOK) { try { const p = ctx.createPanner(); p.panningModel = 'HRTF'; } catch { this.hrtfOK = false; } }

    // ── 風：左右兩股不相關的低沉氣流 + 穿過門縫的風嘯 + 枝葉 ──
    this.windGain = G(0);
    this.windLP = F('lowpass', 420, 0.5);
    for (const [pan, rate] of [[-0.55, 1], [0.6, 0.83]]) {
      const s = this._loop(this.pink, rate), g = G(0.75);
      const p = ctx.createStereoPanner ? ctx.createStereoPanner() : G(1); if (p.pan) p.pan.value = pan;
      s.connect(g).connect(p).connect(this.windLP);
    }
    this.windLP.connect(F('highpass', 95, 0.6)).connect(this.windGain).connect(this.ambIn); // 切掉最底下的轟轟聲
    this.howlBP = F('bandpass', 780, 5);
    this.howlGain = G(0);
    this._loop(this.white).connect(this.howlBP).connect(this.howlGain).connect(this.ambIn);
    this.leafGain = G(0);
    const leafBP = F('bandpass', 5200, 0.6), leafHP = F('highpass', 2200, 0.5);
    this._loop(this.pink, 1.07).connect(leafBP).connect(leafHP).connect(this.leafGain).connect(this.ambIn);

    // ── 室內底噪（很輕的空氣聲；用來讓「死寂」有對比）──
    this.roomGain = G(0);
    const roomBP = F('bandpass', 150, 0.6);
    this._loop(this.brown, 0.7).connect(roomBP).connect(this.roomGain).connect(this.ambIn);

    // ── 夜蟲：兩隻蟋蟀（脈衝串）+ 一層紡織娘似的沙沙聲 ──
    this.cricketGate = G(0); this.cricketGate.connect(this.ambIn);
    const gate = new Float32Array(257);
    for (let i = 0; i < gate.length; i++) { const x = (i / (gate.length - 1)) * 2 - 1; gate[i] = x > 0.5 ? Math.sqrt((x - 0.5) * 2) : 0; }
    for (const [freq, pulse, chirp, pan, level] of [[4320, 31, 2.1, -0.55, 0.011], [4770, 27, 1.63, 0.62, 0.007]]) {
      const o = ctx.createOscillator(); o.frequency.value = freq; o.start();
      const pg = G(0.5), pl = ctx.createOscillator(), pd = G(0.5); pl.frequency.value = pulse; pl.start(); pl.connect(pd).connect(pg.gain);
      const cg = G(0), cl = ctx.createOscillator(), sh = ctx.createWaveShaper(); sh.curve = gate; cl.frequency.value = chirp; cl.start(); cl.connect(sh).connect(cg.gain);
      const lv = G(level), p = ctx.createStereoPanner ? ctx.createStereoPanner() : G(1); if (p.pan) p.pan.value = pan;
      o.connect(pg).connect(cg).connect(lv).connect(p).connect(this.cricketGate);
    }
    {
      const bp = F('bandpass', 7200, 9), am = G(0.5), l = ctx.createOscillator(), d = G(0.5), lv = G(0.012);
      l.frequency.value = 11.5; l.start(); l.connect(d).connect(am.gain);
      this._loop(this.white).connect(bp).connect(am).connect(lv).connect(this.cricketGate);
    }

    // ── 低鳴：droneGain 由劇情寫入（0.07 / 釋放後 0.012），droneMix 由緊張度控制 ──
    this.droneGain = G(0.07);
    this.droneMix = G(0);
    for (const [f, type, a] of [[41, 'sine', 1], [61.7, 'sine', 1], [43.2, 'sine', 1], [82.6, 'triangle', 0.22]]) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.start();
      o.connect(G(a)).connect(this.droneGain);
    }
    this.droneGain.connect(this.droneMix).connect(this.tensionDuck);

    // ── 配樂與介面音匯流排、錄音素材庫、聲音模組 ──
    this.scoreBus = G(1); this.scoreBus.connect(this.tensionDuck);
    this.uiBus = G(1); this.uiBus.connect(this.master);
    this.bank = createBank(this);
    installModules(this);
  }

  // ───────────────────────── 素材 ─────────────────────────

  /** 白／粉紅／棕色噪音各 6 秒，粉紅與棕色的頭尾交叉淡化成無縫循環 */
  _makeNoise() {
    const ctx = this.ctx, sr = ctx.sampleRate, n = Math.floor(sr * 6), fade = Math.floor(sr * 0.25);
    const mk = () => ctx.createBuffer(1, n, sr);
    this.white = mk(); this.pink = mk(); this.brown = mk();
    const w = this.white.getChannelData(0), p = this.pink.getChannelData(0), b = this.brown.getChannelData(0);
    const pe = new Float32Array(fade), be = new Float32Array(fade);
    let last = 0, b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < n + fade; i++) {
      const x = Math.random() * 2 - 1;
      last = (last + 0.02 * x) / 1.02;
      b0 = 0.99765 * b0 + x * 0.099046; b1 = 0.963 * b1 + x * 0.2965164; b2 = 0.57 * b2 + x * 1.0526913;
      const pk = (b0 + b1 + b2 + x * 0.1848) * 0.2;
      if (i < n) { w[i] = x; b[i] = last * 3.5; p[i] = pk; } else { be[i - n] = last * 3.5; pe[i - n] = pk; }
    }
    for (let i = 0; i < fade; i++) {
      const a = Math.sin((i / fade) * 1.5708), c = Math.cos((i / fade) * 1.5708);
      b[i] = b[i] * a + be[i] * c; p[i] = p[i] * a + pe[i] * c;
    }
  }

  /** 合成脈衝響應：指數衰減的噪音，高頻隨時間先衰減，前段疊幾個稀疏的早期反射。能量正規化為 1。 */
  _makeIR(seconds, { rt60, pre, a0, a1, taps, span }) {
    const ctx = this.ctx, sr = ctx.sampleRate, n = Math.floor(sr * seconds), buf = ctx.createBuffer(2, n, sr);
    const p0 = Math.floor(pre * sr), k = Math.pow(10, -3 / (rt60 * sr)), ka = Math.exp(-1 / (rt60 * 0.3 * sr));
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let e = 1, a = a0 - a1, y = 0, rise = 0, sum = 0;
      for (let i = p0; i < n; i++) {
        rise += (1 - rise) * 0.004;
        y += (a1 + a) * (Math.random() * 2 - 1 - y);
        d[i] = y * e * rise;
        e *= k; a *= ka;
      }
      for (let j = 0; j < taps; j++) {
        const i = p0 + Math.floor(rnd(0.003, span) * sr);
        if (i < n) d[i] += (j % 2 ? -1 : 1) * rnd(0.45, 1.1) * Math.pow(10, (-3 * (i - p0)) / (rt60 * sr));
      }
      const tail = Math.floor(sr * 0.05);
      for (let i = 0; i < tail; i++) d[n - 1 - i] *= i / tail;
      for (let i = 0; i < n; i++) sum += d[i] * d[i];
      const s = 1 / Math.sqrt(sum || 1);
      for (let i = 0; i < n; i++) d[i] *= s;
    }
    return buf;
  }

  /** 預先算好的顆粒循環（雨打玻璃、餘燼爆裂）：之後只是一條循環音源，不必每滴雨開一組節點 */
  _grainBuffer(seconds, layers) {
    const sr = this.ctx.sampleRate, n = Math.floor(sr * seconds), buf = this.ctx.createBuffer(2, n, sr);
    const L = buf.getChannelData(0), R = buf.getChannelData(1);
    for (const { count, f, tau, amp, noise = 0, bend = 0 } of layers) {
      for (let c = 0; c < count; c++) {
        const start = Math.floor(Math.random() * n), tc = rnd(tau[0], tau[1]) * sr, a = amp * (0.15 + 0.85 * Math.pow(Math.random(), 2));
        const pan = Math.random() * 1.5708, gl = Math.cos(pan) * a, gr = Math.sin(pan) * a;
        const len = Math.floor(tc * 6), w = (TAU * rnd(f[0], f[1])) / sr, k = Math.exp(-1 / tc);
        let e = 1;
        for (let i = 0; i < len; i++) {
          const s = (Math.sin(w * i * (1 + (bend * i) / len)) * (1 - noise) + (Math.random() * 2 - 1) * noise) * e * Math.min(1, i / 6);
          const j = (start + i) % n;
          L[j] += s * gl; R[j] += s * gr; e *= k;
        }
      }
    }
    return buf;
  }

  _loop(buffer, rate = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = buffer; s.loop = true; s.loopStart = 0; s.loopEnd = buffer.duration;
    s.playbackRate.value = rate;
    s.start(0, Math.random() * buffer.duration * 0.98);
    return s;
  }

  /** 住處才需要的層：雨、打在玻璃上的雨點、電器的 60 Hz 哼聲。第一次進住處時才建立。 */
  _ensureHome() {
    if (this.rainGain) return;
    const ctx = this.ctx;
    const F = (type, freq, q = 0.7) => { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; return f; };
    this.rainGain = ctx.createGain(); this.rainGain.gain.value = 0;
    this.rainLP = F('lowpass', 5200, 0.5);
    this._loop(this.pink, 1.13).connect(F('highpass', 700, 0.5)).connect(this.rainLP).connect(this.rainGain).connect(this.ambIn);
    this.paneGain = ctx.createGain(); this.paneGain.gain.value = 0;
    const pane = this._grainBuffer(9, [
      { count: 420, f: [1900, 5600], tau: [0.0018, 0.006], amp: 0.5, noise: 0.35 }, // 玻璃上的雨點
      { count: 110, f: [380, 900], tau: [0.006, 0.016], amp: 0.6, noise: 0.2, bend: -0.2 }, // 窗台與遮雨棚
      { count: 14, f: [1200, 2100], tau: [0.012, 0.03], amp: 0.5, bend: 0.5 }, // 屋簷滴水
    ]);
    this._loop(pane).connect(this.paneGain).connect(this.ambIn);
    this.humGain = ctx.createGain(); this.humGain.gain.value = 0;
    for (const [f, a] of [[60, 1], [120, 0.5], [180, 0.22], [300, 0.05]]) {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = f; g.gain.value = a; o.start(); o.connect(g).connect(this.humGain);
    }
    this.humGain.connect(this.ambIn);
  }

  _ensureEmber() {
    if (this.emberGain) return;
    this.emberGain = this.ctx.createGain(); this.emberGain.gain.value = 0;
    const buf = this._grainBuffer(7, [
      { count: 26, f: [900, 3800], tau: [0.0012, 0.004], amp: 0.7, noise: 0.8 },
      { count: 6, f: [300, 700], tau: [0.01, 0.03], amp: 0.5, noise: 0.5 },
    ]);
    this._loop(buf).connect(this.emberGain).connect(this.ambIn);
  }

  /** 高頻弦音層：緊張度超過一半才第一次建立 */
  _ensureStrings() {
    if (this.stringGain) return;
    const ctx = this.ctx;
    this.stringGain = ctx.createGain(); this.stringGain.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3600; lp.Q.value = 0.6;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900; hp.Q.value = 0.6;
    const trem = ctx.createGain(); trem.gain.value = 0.8;
    const tl = ctx.createOscillator(), td = ctx.createGain(); tl.frequency.value = 7.3; td.gain.value = 0.2; tl.start(); tl.connect(td).connect(trem.gain);
    for (const [f, a] of [[1108.7, 1], [1174.7, 0.9], [1244.5, 0.8], [1568, 0.55], [1661.2, 0.5]]) {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.value = f; g.gain.value = a * 0.2; o.start();
      const dl = ctx.createOscillator(), dd = ctx.createGain(); dl.frequency.value = rnd(0.07, 0.31); dd.gain.value = rnd(7, 16); dl.start(); dl.connect(dd).connect(o.detune);
      o.connect(g).connect(lp);
    }
    const bow = ctx.createBiquadFilter(); bow.type = 'bandpass'; bow.frequency.value = 2900; bow.Q.value = 11;
    const bg = ctx.createGain(); bg.gain.value = 0.5;
    this._loop(this.pink).connect(bow).connect(bg).connect(lp);
    lp.connect(hp).connect(trem).connect(this.stringGain).connect(this.tensionDuck);
  }

  // ───────────────────────── 基本控制 ─────────────────────────

  setVolume(v) {
    this.volume = v;
    if (this.ctx && this.running) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
  }
  start() {
    if (!this.ctx) return;
    this.running = true;
    if (!this.offline) this.ctx.resume?.();
    this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.8);
    if (!this.offline && !this._timer) this._timer = setInterval(() => { if (this.running) this._pump(); }, 250);
  }
  stop() {
    if (!this.ctx) return;
    this.running = false;
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
  }

  /** 連續緊張度 0..1：低鳴（> 0.1）、心跳（> 0.3）、高頻弦音（> 0.5）依序疊上來，蟲鳴同時退掉。 */
  setTension(x) { this.tension = clamp(+x || 0); }

  /** 環境聲在 0.1 秒內抽空成死寂，維持 seconds 秒之後慢慢回來。心跳與 horror() 的聲音不受影響。 */
  duck(seconds = 2) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime, s = clamp(+seconds || 2, 0.1, 30), back = Math.max(0.9, s * 0.35);
    for (const p of [this.duckGain.gain, this.ambWet.gain, this.tensionDuck.gain]) {
      p.cancelScheduledValues(now);
      p.setTargetAtTime(0, now, 0.025);
      p.setTargetAtTime(1, now + s, back);
    }
    this._duckUntil = now + s;
  }

  /** 指定聲學空間（等同每幀寫 audio.zone） */
  setSpace(name) { this.zone = name; }

  /** 驚嚇後的耳朵悶住：環境聲暫時只剩低頻 */
  _muffle(seconds) {
    const now = this.ctx.currentTime, f = this.ambLP.frequency;
    f.cancelScheduledValues(now);
    f.setTargetAtTime(380, now, 0.03);
    f.setTargetAtTime(20000, now + seconds * 0.35, seconds * 0.3);
  }

  /** 只有數值真的變了才排程，避免每幀往 AudioParam 塞事件 */
  _set(param, v, tau) {
    const last = this._pv.get(param);
    if (last !== undefined && Math.abs(last - v) <= Math.max(1e-4, Math.abs(last) * 0.03)) return;
    this._pv.set(param, v);
    param.setTargetAtTime(v, this.ctx.currentTime, tau);
  }

  _setSpace(space) {
    const S = SPACES[space] || SPACES.open, now = this.ctx.currentTime;
    this.space = SPACES[space] ? space : 'open';
    this.wetAmt = S.wet;
    for (const k of Object.keys(this.revIn)) this.revIn[k].gain.setTargetAtTime(k === S.rev ? 1 : 0, now, 0.35);
    if (S.rain) this._ensureHome();
    if (S.ember) this._ensureEmber();
  }

  /** indoor: 0 室外 ~ 1 室內 */
  update(dt, indoor) {
    if (!this.ctx || !this.running) return;
    this._t += dt;
    this.indoor += (indoor - this.indoor) * Math.min(1, dt * 2);
    const zone = this.zone; this.zone = null;
    const space = zone && SPACES[zone] ? zone : this.profile === 'home' ? 'room' : indoor > 0.5 ? (this.profile === 'road' ? 'workshop' : 'hall') : 'open';
    if (space !== this.space) this._setSpace(space);
    const S = SPACES[this.space], rel = this.released;
    this._ten += ((rel ? 0 : this.tension) - this._ten) * Math.min(1, dt * 1.6);
    const T = this._ten;

    // 陣風：一陣一陣來，中間會有幾乎沒有風的空檔
    if (this._t > this._nextGust) {
      this._nextGust = this._t + rnd(3, 9);
      this._gust = Math.random() < 0.22 ? rnd(0.02, 0.12) : rnd(0.2, 1);
      this._howlHz = rnd(520, 1220);
    }
    const gust = this._gust * (rel ? 0.45 : 1), M = this.layerMul;
    this._gustNow = gust;
    this._set(this.windGain.gain, M.wind * S.wind * (0.2 + 1.05 * gust * gust), 1.9);
    this._set(this.windLP.frequency, S.lp * (0.8 + 0.5 * gust), 2.2);
    this._set(this.howlGain.gain, rel ? 0 : M.howl * S.howl * (gust > 0.55 ? 0.004 + 0.012 * (gust - 0.55) / 0.45 : 0.0009), 2.2);
    this._set(this.howlBP.frequency, this._howlHz, 2.5);
    this._set(this.leafGain.gain, M.leaf * S.leaf * (0.004 + 0.03 * gust * gust), 1.4);
    this._set(this.roomGain.gain, M.room * S.room * 0.05, 0.8);

    // 夜蟲：偶爾自己停下來；緊張度升高時整片安靜
    if (this._t > this._nextChirp) {
      this._nextChirp = this._t + rnd(2.5, 9);
      this._bugOn = Math.random() < 0.72 ? 1 : 0;
    }
    this._set(this.cricketGate.gain, M.bug * S.bug * (rel ? 0.6 : this._bugOn * (1 - sstep(0.25, 0.6, T))) * (this.profile === 'road' ? 0.7 : 1), 0.35);

    if (this.rainGain) {
      const on = S.rain ? 1 : 0, near = clamp(this.windowNear);
      this._set(this.rainGain.gain, M.rain * on * (0.028 + 0.034 * near) * (0.75 + 0.5 * gust), 1.2);
      this._set(this.rainLP.frequency, 2600 + 4200 * near, 0.6);
      this._set(this.paneGain.gain, M.pane * on * (0.09 + 0.42 * near * near) * (0.6 + 0.6 * gust), 1.0);
      this._set(this.humGain.gain, M.hum * on * 0.0035, 0.5);
    }
    if (this.emberGain) this._set(this.emberGain.gain, S.ember && !rel ? M.ember * 0.09 : 0, 0.8);

    // 緊張層：低鳴平時只是緩慢起伏的一點點，不會整場轟轟作響
    const swell = 0.5 + 0.5 * Math.sin(this._t * 0.043);
    const droneBase = this.profile === 'home' ? 0 : rel ? 0.12 : 0.03 + 0.2 * swell * swell * swell;
    this._set(this.droneMix.gain, M.drone * (droneBase + 0.62 * sstep(0.1, 0.9, T)), 1.2);
    if (T > 0.45 && M.strings > 0) this._ensureStrings();
    if (this.stringGain) this._set(this.stringGain.gain, M.strings * 0.045 * sstep(0.5, 1, T), 0.9);

    if (this._updaters.length) {
      const s = { space: this.space, tension: T, rawTension: this.tension, indoor: this.indoor, gust, released: rel, profile: this.profile, time: this._t, ducked: this.ctx.currentTime < this._duckUntil };
      for (const fn of this._updaters) { try { fn(dt, s); } catch (err) { console.warn('[audio] module update failed', err); } }
    }
    this._pump();
  }

  /** 把 horizon 之前該發生的偶發環境事件排進音訊時鐘。update 與 250 ms 計時器都會呼叫，重複呼叫沒有副作用。 */
  _pump(horizon) {
    const ctx = this.ctx;
    if (!ctx || !this.space) return;
    const now = ctx.currentTime, H = horizon ?? now + 0.6, ev = this._ev, sp = this.space, rel = this.released, temple = !this.profile;
    const T = this._ten;
    const defs = [
      // 木構造熱脹冷縮的「喀」與偶爾的長吱嘎
      ['wood', (sp === 'hall' || sp === 'workshop') && !rel, 7, 22, (t) => (Math.random() < 0.3 ? this.creak(t, { pan: rnd(-0.9, 0.9), dist: rnd(4, 12), amb: true }) : this._woodTick(t))],
      ['house', sp === 'room', 14, 40, (t) => this._woodTick(t, 0.5)],
      ['drip', sp === 'crypt', 2.2, 7.5, (t) => this._drip(t)],
      ['rustle', sp === 'grave' && !rel, 16, 44, (t) => this._rustle(t)],
      ['dog', (sp === 'open' || sp === 'grave') && !rel, 55, 140, (t) => (Math.random() < 0.3 + 0.5 * T ? this._howl(t, { pan: rnd(-0.8, 0.8), dist: rnd(38, 60), gain: 1.5 }) : this._bark(t))],
      ['bell', temple && !rel && sp !== 'crypt', 80, 160, (t) => this.bell(rnd(0.5, 1), t)],
      ['fish', temple && !rel && sp === 'hall', 45, 105, (t) => this.woodenFish(3 + Math.floor(Math.random() * 4), t)],
      ['thunder', sp === 'room', 50, 130, (t) => this._thunder(t)],
    ];
    for (const [name, on, a, b, fire] of defs) {
      if (ev[name] === undefined) ev[name] = now + rnd(a, b) * (name === 'bell' || name === 'dog' ? 0.6 : 0.45);
      for (let guard = 0; ev[name] < H && guard < 6; guard++) {
        const t = Math.max(now + 0.02, ev[name]);
        const hook = this._envHooks[name];
        if (on) { if (hook) { try { hook(t, fire); } catch (err) { console.warn('[audio] envHook failed', name, err); } } else fire(t); }
        ev[name] = t + rnd(a, b);
      }
    }
    // 心跳
    if (T > 0.3 && !rel && this.layerMul.heartbeat > 0) {
      if (this._beatAt < now) this._beatAt = now + 0.05;
      for (let guard = 0; this._beatAt < H && guard < 40; guard++) {
        const k = (T - 0.3) / 0.7, gap = 60 / (56 + 78 * k);
        this._beat(this._beatAt, this.layerMul.heartbeat * (0.25 + 0.75 * Math.pow(k, 0.8)), gap);
        this._beatAt += gap * rnd(0.97, 1.03);
      }
    }
  }

  // ───────────────────────── Voice：一次性音效的生命週期 ─────────────────────────

  /**
   * 建立一個一次性音效。來源接到 v.bus；之後依序經過距離低通、方位、乾聲與殘響送出。
   * 結束後所有節點會被中斷連線；同時存在的數量有上限，超過就先收掉最舊的。
   */
  _voice({ t, dur = 1, pan = 0, dist = 2, gain = 1, wet = 1, amb = false, hrtf = false, behind = false, above = 0, lp = 0, near = 0 } = {}) {
    const ctx = this.ctx, now = ctx.currentTime;
    while (this._voices.size >= MAX_VOICES) this._free(this._voices.values().next().value);
    const start = Math.max(now, t ?? now);
    const v = { t: start, end: start + dur, nodes: [], srcs: [], timer: 0 };
    const bus = ctx.createGain();
    const amp = gain / Math.pow(1 + dist * 0.22, 1.3);
    const lpHz = Math.min(lp || 20000, 19000 / (1 + dist * 0.35));
    let head = bus;
    v.nodes.push(bus);
    if (lpHz < 15000) {
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lpHz; f.Q.value = 0.5;
      head.connect(f); head = f; v.nodes.push(f);
    }
    let pn = null;
    if (hrtf && this.hrtfOK) {
      pn = ctx.createPanner(); pn.panningModel = 'HRTF'; pn.distanceModel = 'linear'; pn.rolloffFactor = 0;
      const az = clamp(pan, -1, 1) * 1.35, r = clamp(dist, 0.3, 3);
      const x = Math.sin(az) * r, z = Math.cos(az) * r * (behind ? 1 : -1);
      if (pn.positionX) { pn.positionX.value = x; pn.positionY.value = above; pn.positionZ.value = z; } else pn.setPosition(x, above, z);
    } else if (ctx.createStereoPanner) {
      pn = ctx.createStereoPanner(); pn.pan.value = clamp(pan, -1, 1);
    }
    if (pn) { head.connect(pn); head = pn; v.nodes.push(pn); }
    if (near && pn?.panningModel && ctx.createStereoPanner) { // 貼在耳邊：HRTF 之外再加大左右音量差
      const sp = ctx.createStereoPanner(); sp.pan.value = clamp(pan, -1, 1) * near;
      head.connect(sp); head = sp; v.nodes.push(sp);
    }
    const dry = ctx.createGain(); dry.gain.value = amp;
    head.connect(dry); dry.connect(amb ? this.ambIn : this.fxBus); v.nodes.push(dry);
    const wetAmt = wet * this.wetAmt * (0.3 + (0.7 * dist) / (dist + 6));
    if (wetAmt > 0.004) {
      const w = ctx.createGain(); w.gain.value = amp * wetAmt;
      head.connect(w); w.connect(amb ? this.ambWet : this.revSend); v.nodes.push(w);
    }
    v.bus = bus;
    this._voices.add(v);
    if (!this.offline) v.timer = setTimeout(() => this._free(v), (v.end - now + 0.35) * 1000);
    return v;
  }

  _free(v) {
    if (!v || !this._voices.delete(v)) return;
    clearTimeout(v.timer);
    for (const s of v.srcs) { try { s.stop(); } catch { /* 已經停了 */ } try { s.disconnect(); } catch { /* 忽略 */ } }
    for (const n of v.nodes) { try { n.disconnect(); } catch { /* 忽略 */ } }
    v.srcs.length = v.nodes.length = 0;
  }

  _n(v, buffer, t, dur, rate = 1) {
    const s = this.ctx.createBufferSource(); s.buffer = buffer; s.loop = true; s.playbackRate.value = rate;
    s.start(t, Math.random() * (buffer.duration - 0.2)); s.stop(t + dur + 0.02);
    v.srcs.push(s); return s;
  }
  _o(v, type, freq, t, dur) {
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    o.start(t); o.stop(t + dur + 0.02);
    v.srcs.push(o); return o;
  }
  _g(v, value = 0) { const g = this.ctx.createGain(); g.gain.value = value; v.nodes.push(g); return g; }
  _f(v, type, freq, q = 1) { const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; v.nodes.push(f); return f; }

  /** 除錯／測試用：目前存活的一次性音效與節點數 */
  debug() {
    let nodes = 0;
    for (const v of this._voices) nodes += v.nodes.length + v.srcs.length;
    return { voices: this._voices.size, nodes, space: this.space, tension: this._ten, state: this.ctx?.state };
  }

  // ───────────────────────── 腳步（依材質）─────────────────────────

  footstep(strength = 0.6, surface = 'dirt') {
    if (!this.ctx || !this.running) return;
    this._surface = surface;
    this._stepSide = -this._stepSide;
    const v = this._voice({ dur: 0.45, pan: this._stepSide * 0.07, dist: 0.6, gain: STEP_GAIN[surface === 'wood' && this.profile === 'home' ? 'floor' : surface] ?? STEP_GAIN.dirt, wet: 0.9 });
    this._step(v, v.t, surface, strength);
    if (surface === 'wood' && this.profile !== 'home' && Math.random() < 0.14) this.creak(v.t + 0.03, { pan: this._stepSide * 0.2, dist: 1.2, gain: 0.3 });
  }

  /** 一步的聲音：腳跟的悶響 + 腳掌落下時材質特有的高頻 */
  _step(v, t, surface, s) {
    const burst = (buf, type, freq, q, at, attack, peak, decay) => {
      const src = this._n(v, buf, at, attack + decay + 0.02), f = this._f(v, type, freq, q), g = this._g(v);
      src.connect(f).connect(g).connect(v.bus); env(g.gain, at, attack, peak * s, decay);
      return g;
    };
    const thump = (f0, f1, peak, decay) => {
      const o = this._o(v, 'sine', f0, t, decay + 0.03), g = this._g(v);
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + decay);
      o.connect(g).connect(v.bus); env(g.gain, t, 0.004, peak * s, decay);
    };
    // 一小串音量不等的顆粒（砂粒、碎石、落葉）
    const grains = (buf, type, freq, q, at, n, span, peak) => {
      const src = this._n(v, buf, at, span + 0.08), f = this._f(v, type, freq, q), g = this._g(v);
      src.connect(f).connect(g).connect(v.bus);
      for (let i = 0; i < n; i++) g.gain.setTargetAtTime(peak * s * rnd(0.15, 1), at + (i / n) * span, 0.003);
      g.gain.setTargetAtTime(0.0001, at + span, 0.015);
    };
    if (surface === 'wood' && this.profile === 'home') { // 住處的木地板：穿拖鞋的輕拍
      burst(this.brown, 'bandpass', rnd(260, 340), 1, t, 0.005, 0.5, 0.07);
      burst(this.white, 'bandpass', 2600, 0.8, t + 0.03, 0.006, 0.035, 0.05);
    } else if (surface === 'wood') { // 架高的老木地板：空心的咚
      burst(this.white, 'bandpass', rnd(240, 340), 2.4, t, 0.006, 0.5, 0.15);
      thump(rnd(98, 124), 72, 0.3, 0.2);
      burst(this.white, 'highpass', 3000, 0.7, t + 0.035, 0.004, 0.03, 0.03);
    } else if (surface === 'stone') { // 石板：硬而短，帶一點砂粒
      burst(this.white, 'bandpass', rnd(950, 1500), 1.3, t, 0.004, 0.24, 0.07);
      thump(128, 74, 0.16, 0.06);
      grains(this.white, 'highpass', 4200, 0.6, t + 0.04, 4, 0.045, 0.045);
    } else if (surface === 'gravel') { // 碎石路：一串碎裂聲
      thump(110, 64, 0.14, 0.07);
      grains(this.white, 'bandpass', rnd(2400, 3400), 0.6, t, 9, 0.15, 0.2);
    } else if (surface === 'grass') { // 草與落葉
      burst(this.brown, 'bandpass', 170, 0.8, t, 0.008, 0.36, 0.1);
      grains(this.pink, 'highpass', 3200, 0.5, t, 7, 0.17, 0.2);
    } else { // 泥土：鬆軟的悶響與幾粒土石
      burst(this.brown, 'bandpass', rnd(150, 210), 0.8, t, 0.007, 0.6, 0.12);
      grains(this.white, 'bandpass', rnd(1900, 2700), 0.7, t + 0.02, 5, 0.09, 0.09);
    }
  }

  creak(t, { pan = 0, dist = 1.5, gain = 1, amb = false } = {}) {
    if (!this.ctx) return;
    const dur = rnd(0.35, 0.9);
    const v = this._voice({ t, dur: dur + 0.1, pan, dist, gain: 2.2 * gain, wet: 1, amb });
    const f0 = rnd(150, 290), o = this._o(v, 'sawtooth', f0, v.t, dur);
    o.frequency.setValueAtTime(f0, v.t);
    o.frequency.linearRampToValueAtTime(f0 * rnd(1.15, 1.7), v.t + dur * 0.7);
    o.frequency.linearRampToValueAtTime(f0 * rnd(0.9, 1.3), v.t + dur);
    const bp = this._f(v, 'bandpass', rnd(700, 1300), 7), g = this._g(v);
    const st = this._o(v, 'sawtooth', rnd(19, 33), v.t, dur), sd = this._g(v, 0.35), am = this._g(v, 0.65); // 黏滑顫動
    st.connect(sd).connect(am.gain);
    o.connect(bp).connect(am).connect(g).connect(v.bus);
    g.gain.setValueAtTime(0.0001, v.t); g.gain.linearRampToValueAtTime(0.5, v.t + 0.05); g.gain.setTargetAtTime(0.0001, v.t + dur * 0.6, dur * 0.14);
  }

  /** 木頭乾裂的一聲「喀」 */
  _woodTick(t, level = 1) {
    const v = this._voice({ t, dur: 0.25, pan: rnd(-0.95, 0.95), dist: rnd(3, 11), gain: 0.5 * level, wet: 1.3, amb: true });
    const s = this._n(v, this.white, v.t, 0.05), bp = this._f(v, 'bandpass', rnd(1100, 2600), 3), g = this._g(v);
    s.connect(bp).connect(g).connect(v.bus); env(g.gain, v.t, 0.001, 0.9, 0.03);
    const o = this._o(v, 'sine', rnd(260, 520), v.t, 0.08), og = this._g(v);
    o.connect(og).connect(v.bus); env(og.gain, v.t, 0.001, 0.5, 0.06);
  }

  /** 地下室的滴水 */
  _drip(t, { pan = rnd(-0.9, 0.9), dist = rnd(3, 9), gain = 0.42, amb = true } = {}) {
    const v = this._voice({ t, dur: 0.3, pan, dist, gain, wet: 1.5, amb });
    const f = rnd(1100, 2300), o = this._o(v, 'sine', f, v.t, 0.14), g = this._g(v);
    o.frequency.setValueAtTime(f, v.t); o.frequency.exponentialRampToValueAtTime(f * 1.9, v.t + 0.05);
    o.connect(g).connect(v.bus); env(g.gain, v.t, 0.002, 0.6, 0.09);
    const o2 = this._o(v, 'sine', f * 0.5, v.t, 0.06), g2 = this._g(v);
    o2.connect(g2).connect(v.bus); env(g2.gain, v.t, 0.001, 0.3, 0.04);
  }

  /** 亂葬崗的草叢裡有東西動了一下 */
  _rustle(t) {
    const dur = rnd(0.35, 0.8);
    const v = this._voice({ t, dur, pan: rnd(-1, 1), dist: rnd(5, 12), gain: 1.3, wet: 0.4, amb: true });
    const s = this._n(v, this.pink, v.t, dur), hp = this._f(v, 'highpass', 2600, 0.6), g = this._g(v);
    s.connect(hp).connect(g).connect(v.bus);
    const n = 6 + Math.floor(Math.random() * 8);
    for (let i = 0; i < n; i++) g.gain.setTargetAtTime(rnd(0.05, 0.5) * Math.sin(((i + 0.5) / n) * Math.PI), v.t + (i / n) * dur, 0.012);
    g.gain.setTargetAtTime(0.0001, v.t + dur * 0.92, 0.03);
  }

  /** 山谷另一頭的狗叫 */
  _bark(t) {
    const n = 2 + Math.floor(Math.random() * 3);
    const v = this._voice({ t, dur: n * 0.34 + 0.3, pan: rnd(-0.8, 0.8), dist: rnd(34, 55), gain: 4.6, wet: 2.2, amb: true });
    const f1 = this._f(v, 'bandpass', 620, 2.5), f2 = this._f(v, 'bandpass', 1350, 3), g = this._g(v);
    f1.connect(g); f2.connect(g); g.connect(v.bus);
    for (let i = 0; i < n; i++) {
      const at = v.t + i * rnd(0.27, 0.36), f0 = rnd(330, 420), o = this._o(v, 'sawtooth', f0, at, 0.16), og = this._g(v);
      o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(f0 * 0.62, at + 0.13);
      o.connect(og); og.connect(f1); og.connect(f2); env(og.gain, at, 0.012, rnd(0.5, 1), 0.11);
    }
    g.gain.value = 1;
  }

  /** 遠方的悶雷（住處的雨夜） */
  _thunder(t) {
    const dur = rnd(3.5, 6);
    const v = this._voice({ t, dur, pan: rnd(-0.5, 0.5), dist: 0, gain: 0.22, wet: 0, amb: true });
    const s = this._n(v, this.brown, v.t, dur, 0.6), lp = this._f(v, 'lowpass', 150, 0.6), g = this._g(v);
    s.connect(lp).connect(g).connect(v.bus);
    g.gain.setValueAtTime(0.0001, v.t);
    g.gain.linearRampToValueAtTime(1, v.t + rnd(0.3, 0.8));
    for (let i = 1; i < 5; i++) g.gain.setTargetAtTime(rnd(0.15, 0.7) / i, v.t + (i / 5) * dur * 0.7, 0.25);
    g.gain.setTargetAtTime(0.0001, v.t + dur * 0.7, dur * 0.08);
  }

  /** 心跳的一下（咚—咚），不經過殘響，duck 時仍聽得到 */
  _beat(t, level, gap) {
    const v = this._voice({ t, dur: 0.55, dist: 0, gain: 0.42 * level, wet: 0 });
    for (const [dt, a] of [[0, 1], [Math.min(0.26, gap * 0.3), 0.62]]) {
      const at = v.t + dt, o = this._o(v, 'sine', 60, at, 0.16), g = this._g(v);
      o.frequency.setValueAtTime(64, at); o.frequency.exponentialRampToValueAtTime(37, at + 0.1);
      o.connect(g).connect(v.bus); env(g.gain, at, 0.006, a, 0.13);
      const o2 = this._o(v, 'triangle', 118, at, 0.1), g2 = this._g(v);
      o2.frequency.setValueAtTime(118, at); o2.frequency.exponentialRampToValueAtTime(70, at + 0.07);
      o2.connect(g2).connect(v.bus); env(g2.gain, at, 0.004, a * 0.2, 0.07);
    }
  }

  click() {
    if (!this.ctx) return;
    const v = this._voice({ dur: 0.1, dist: 0.3, pan: 0.15, gain: 1, wet: 0.5 });
    const s = this._n(v, this.white, v.t, 0.05), hp = this._f(v, 'highpass', 2500, 0.7), g = this._g(v);
    s.connect(hp).connect(g).connect(v.bus); env(g.gain, v.t, 0.001, 0.12, 0.028);
    const o = this._o(v, 'square', 1400, v.t, 0.03), og = this._g(v);
    o.connect(og).connect(v.bus); env(og.gain, v.t, 0.001, 0.02, 0.015);
  }

  /** 遠方的鐘聲 */
  bell(vol = 1, t, { pan = rnd(-0.6, 0.6), dist = 22, base = 147, wrong = 0 } = {}) {
    if (!this.ctx) return;
    const v = this._voice({ t, dur: 8.2, pan, dist, gain: 0.8 * vol, wet: 1.6, lp: 1400, amb: t !== undefined });
    const parts = [[1, 1, 7.5], [2.01, 0.55, 5.5], [2.42 + wrong * 0.33, 0.4, 3.8], [3.03, 0.25, 2.6], [4.2 + wrong * 0.4, 0.14, 1.7], [5.43, 0.08, 1]];
    for (const [m, a, d] of parts) {
      const o = this._o(v, 'sine', base * m, v.t, d + 0.1), g = this._g(v);
      if (wrong) { o.frequency.setValueAtTime(base * m, v.t); o.frequency.exponentialRampToValueAtTime(base * m * (1 - 0.012 * wrong), v.t + d); }
      o.connect(g).connect(v.bus); env(g.gain, v.t, 0.012, a * 0.5, d);
    }
    const s = this._n(v, this.brown, v.t, 0.1), bp = this._f(v, 'bandpass', 500, 1), g = this._g(v); // 撞木
    s.connect(bp).connect(g).connect(v.bus); env(g.gain, v.t, 0.003, 0.5, 0.07);
  }

  /** 不知從哪一層樓傳來的木魚聲 */
  woodenFish(count = 4, t) {
    if (!this.ctx) return;
    const gap = rnd(0.62, 0.87);
    const v = this._voice({ t, dur: 0.4 + count * gap, pan: rnd(-0.8, 0.8), dist: 9, gain: 0.55, wet: 1.4, amb: t !== undefined });
    for (let i = 0; i < count; i++) {
      const at = v.t + 0.2 + i * gap * rnd(0.98, 1.02), o = this._o(v, 'sine', 640, at, 0.2), g = this._g(v);
      o.frequency.setValueAtTime(640, at); o.frequency.exponentialRampToValueAtTime(430, at + 0.07);
      o.connect(g).connect(v.bus); env(g.gain, at, 0.004, 0.8, 0.15);
      const o2 = this._o(v, 'sine', 1310, at, 0.06), g2 = this._g(v);
      o2.connect(g2).connect(v.bus); env(g2.gain, at, 0.002, 0.2, 0.035);
    }
  }

  // ───────────────────────── 劇情提示音（既有介面）─────────────────────────

  /** 電話裡那口被重複的吸氣 */
  breathCue() {
    if (!this.ctx) return;
    const v = this._voice({ dur: 1.3, dist: 0.3, pan: 0.25, gain: 0.5, wet: 0.2 });
    const s = this._n(v, this.pink, v.t, 1.25), bp = this._f(v, 'bandpass', 840, 1.1), g = this._g(v);
    bp.frequency.setValueAtTime(700, v.t); bp.frequency.linearRampToValueAtTime(1050, v.t + 0.45); bp.frequency.linearRampToValueAtTime(760, v.t + 1.1);
    s.connect(bp).connect(g).connect(v.bus);
    g.gain.setValueAtTime(0.0001, v.t);
    g.gain.linearRampToValueAtTime(1, v.t + 0.32); g.gain.linearRampToValueAtTime(0.05, v.t + 0.62);
    g.gain.linearRampToValueAtTime(0.5, v.t + 0.91); g.gain.linearRampToValueAtTime(0.0001, v.t + 1.22);
  }

  storyCue(kind) {
    if (!this.ctx) return;
    if (kind === 'release') { this.bell(0.6, undefined, { dist: 10 }); return; }
    const clue = kind === 'clue', dur = clue ? 0.7 : 1.8;
    const v = this._voice({ dur: dur + 0.1, dist: 0, gain: 1, wet: clue ? 0.6 : 1.2 });
    const o = this._o(v, clue ? 'sine' : 'triangle', 100, v.t, dur), g = this._g(v);
    const start = clue ? 520 : kind === 'gate' ? 88 : 125;
    o.frequency.setValueAtTime(start, v.t); o.frequency.exponentialRampToValueAtTime(clue ? 760 : 31, v.t + dur);
    o.connect(g).connect(v.bus); env(g.gain, v.t, 0.04, clue ? 0.2 : 0.26, dur - 0.04);
    if (kind === 'gate') this.footstep(1.2, 'wood');
  }

  /** 手機來電：兩聲顫音，加上機身在桌面上的震動 */
  phoneRing() {
    if (!this.ctx || !this.running) return;
    const v = this._voice({ dur: 0.75, pan: 0.3, dist: 1.2, gain: 1, wet: 0.5 });
    for (const start of [0, 0.22]) for (const f of [640, 800]) {
      const o = this._o(v, 'sine', f, v.t + start, 0.18), g = this._g(v);
      o.connect(g).connect(v.bus); env(g.gain, v.t + start, 0.008, 0.09, 0.16);
    }
    const s = this._n(v, this.brown, v.t, 0.62), bp = this._f(v, 'bandpass', 170, 3), am = this._g(v, 0.5), g = this._g(v);
    const l = this._o(v, 'square', 37, v.t, 0.62), ld = this._g(v, 0.5); l.connect(ld).connect(am.gain);
    s.connect(bp).connect(am).connect(g).connect(v.bus);
    g.gain.setValueAtTime(0.0001, v.t); g.gain.linearRampToValueAtTime(0.5, v.t + 0.03); g.gain.setValueAtTime(0.5, v.t + 0.42); g.gain.linearRampToValueAtTime(0.0001, v.t + 0.6);
  }

  /** 身邊有東西擦過去：短促、低沉、沒有持續音 */
  presence(side = 0) {
    if (!this.ctx || !this.running) return;
    const v = this._voice({ dur: 0.95, pan: side, dist: 0.8, gain: 0.5, wet: 0.6, hrtf: true });
    const s = this._n(v, this.brown, v.t, 0.9), lp = this._f(v, 'lowpass', 650, 0.7), g = this._g(v);
    lp.frequency.setValueAtTime(900, v.t); lp.frequency.exponentialRampToValueAtTime(320, v.t + 0.8);
    s.connect(lp).connect(g).connect(v.bus); env(g.gain, v.t, 0.09, 0.9, 0.76);
  }

  doorKnock(strength = 1) {
    if (!this.ctx || !this.running) return;
    const v = this._voice({ dur: 0.35, pan: 0.1, dist: 1.5, gain: 2.0, wet: 1.4 });
    const s = this._n(v, this.brown, v.t, 0.21), bp = this._f(v, 'bandpass', 280, 1.6), g = this._g(v);
    s.connect(bp).connect(g).connect(v.bus); env(g.gain, v.t, 0.002, 0.5 * strength, 0.18);
    const o = this._o(v, 'sine', 92, v.t, 0.25), og = this._g(v);
    o.frequency.setValueAtTime(92, v.t); o.frequency.exponentialRampToValueAtTime(51, v.t + 0.13);
    o.connect(og).connect(v.bus); env(og.gain, v.t, 0.002, 0.3 * strength, 0.22);
    const c = this._n(v, this.white, v.t, 0.02), hp = this._f(v, 'bandpass', 1900, 1.2), cg = this._g(v); // 指節碰到門板
    c.connect(hp).connect(cg).connect(v.bus); env(cg.gain, v.t, 0.001, 0.07 * strength, 0.014);
  }

  // ───────────────────────── 恐怖導演用的音效（合約 D）─────────────────────────

  /**
   * @param {string} kind whisper | breath | stinger | sub | stepBehind | knock | scrape | slam | hum | static | ring | bellFar | gasp
   *                      另外提供：marble（樓上彈珠）、howl（狗吹螺）、sob（遠處啜泣）、creak、drip、heartbeat
   * @param {{pan?: number, dist?: number, intensity?: number}} [o] pan −1 左…1 右；dist 公尺；intensity 0..2
   * @returns {boolean} 是否真的播了（未初始化、暫停中、冷卻中會回傳 false）
   */
  horror(kind, { pan = 0, dist = 2, intensity = 1 } = {}) {
    if (!this.ctx || !this.running) return false;
    kind = ALIAS[kind] || kind;
    const fn = this['_k_' + kind];
    if (typeof fn !== 'function') return false;
    const now = this.ctx.currentTime, gap = COOLDOWN[kind] ?? 0.15;
    if (this._last[kind] !== undefined && now - this._last[kind] < gap) return false;
    this._last[kind] = now;
    fn.call(this, { pan: clamp(+pan || 0, -1, 1), dist: clamp(Number.isFinite(+dist) ? +dist : 2, 0, 80), I: clamp(Number.isFinite(+intensity) ? +intensity : 1, 0.05, 2) });
    return true;
  }

  /** 貼耳的含糊低語：無聲子音的噪音通過會移動的共振峰，一個音節一個音節地吐氣，聽不出字 */
  _k_whisper({ pan, dist, I }) {
    const syl = [];
    let at = 0.04;
    const n = 5 + Math.floor(Math.random() * 5);
    const VOW = [[730, 1090, 2440], [300, 2200, 2900], [320, 870, 2250], [530, 1840, 2480], [570, 840, 2410], [440, 1020, 2240]];
    for (let i = 0; i < n; i++) {
      const d = rnd(0.1, 0.22);
      syl.push({ at, d, vow: VOW[Math.floor(Math.random() * VOW.length)], amp: rnd(0.45, 1), sib: Math.random() < 0.45 });
      at += d + (Math.random() < 0.2 ? rnd(0.16, 0.3) : rnd(0.015, 0.07));
    }
    const dur = at + 0.25;
    const v = this._voice({ dur, pan: pan || (Math.random() < 0.5 ? -0.8 : 0.8), dist: Math.min(dist, 1.2) * 0.35, gain: 0.95 * I, wet: 0.35, hrtf: true, near: 0.75 });
    const t = v.t, src = this._n(v, this.pink, t, dur), g = this._g(v);
    const fs = [this._f(v, 'bandpass', 600, 5), this._f(v, 'bandpass', 1500, 7), this._f(v, 'bandpass', 2500, 7)];
    const fa = [1, 0.8, 0.45];
    fs.forEach((f, i) => { const fg = this._g(v, fa[i]); src.connect(f).connect(fg).connect(g); });
    const air = this._f(v, 'highpass', 3800, 0.5), ag = this._g(v, 0.12); src.connect(air).connect(ag).connect(g); // 氣音
    const ss = this._n(v, this.white, t, dur), sf = this._f(v, 'bandpass', 6200, 2.5), sg = this._g(v); // 齒擦音
    ss.connect(sf).connect(sg).connect(v.bus);
    g.connect(v.bus);
    for (const s of syl) {
      const a = t + s.at;
      fs.forEach((f, i) => f.frequency.setTargetAtTime(s.vow[i] * rnd(0.94, 1.06), a - 0.02, 0.025));
      g.gain.setTargetAtTime(s.amp, a, 0.016);
      g.gain.setTargetAtTime(0.0001, a + s.d * 0.55, s.d * 0.22);
      if (s.sib) { sg.gain.setTargetAtTime(rnd(0.05, 0.14), Math.max(t, a - 0.045), 0.01); sg.gain.setTargetAtTime(0.0001, a + 0.01, 0.018); }
    }
  }

  /** 頸後的呼吸：一吸一吐，放在聽者正後方 */
  _k_breath({ pan, dist, I }) {
    const v = this._voice({ dur: 2.9, pan: pan * 0.5, dist: Math.min(dist, 1.5) * 0.4, gain: 0.85 * I, wet: 0.3, hrtf: true, behind: true, near: 0.5 });
    const t = v.t, src = this._n(v, this.pink, t, 2.85), bp = this._f(v, 'bandpass', 800, 1.3), hp = this._f(v, 'highpass', 300, 0.5), g = this._g(v);
    const rasp = this._g(v, 0.85), rl = this._o(v, 'sawtooth', 23, t, 2.85), rd = this._g(v, 0.15); rl.connect(rd).connect(rasp.gain);
    src.connect(bp).connect(hp).connect(rasp).connect(g).connect(v.bus);
    // 吸氣：往上、較細；停一下；吐氣：往下、較粗較長
    bp.frequency.setValueAtTime(650, t); bp.frequency.linearRampToValueAtTime(1350, t + 0.85);
    bp.frequency.setValueAtTime(1150, t + 1.15); bp.frequency.exponentialRampToValueAtTime(430, t + 2.7);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.55, t + 0.4); g.gain.linearRampToValueAtTime(0.0001, t + 0.95);
    g.gain.setValueAtTime(0.0001, t + 1.15);
    g.gain.linearRampToValueAtTime(1, t + 1.45); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
    const chest = this._n(v, this.brown, t + 1.1, 1.7), cl = this._f(v, 'bandpass', 240, 1), cg = this._g(v); // 吐氣時胸腔的低頻
    chest.connect(cl).connect(cg).connect(v.bus); env(cg.gain, t + 1.15, 0.3, 0.45, 1.3);
  }

  /** 倒抽一口氣：又急又短，結尾像被掐住 */
  _k_gasp({ pan, dist, I }) {
    const v = this._voice({ dur: 0.75, pan, dist: Math.min(dist, 2) * 0.4, gain: 1.15 * I, wet: 0.5, hrtf: true, near: 0.6 });
    const t = v.t, src = this._n(v, this.pink, t, 0.6), bp = this._f(v, 'bandpass', 900, 1.6), g = this._g(v);
    bp.frequency.setValueAtTime(800, t); bp.frequency.exponentialRampToValueAtTime(2700, t + 0.4);
    src.connect(bp).connect(g).connect(v.bus);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(1, t + 0.09); g.gain.linearRampToValueAtTime(0.8, t + 0.4); g.gain.linearRampToValueAtTime(0.0001, t + 0.47);
    const o = this._o(v, 'sawtooth', 240, t, 0.5), f1 = this._f(v, 'bandpass', 720, 4), f2 = this._f(v, 'bandpass', 1450, 5), og = this._g(v); // 一點點聲帶
    o.frequency.setValueAtTime(230, t); o.frequency.exponentialRampToValueAtTime(390, t + 0.42);
    o.connect(f1).connect(og); o.connect(f2).connect(og); og.connect(v.bus);
    og.gain.setValueAtTime(0.0001, t); og.gain.linearRampToValueAtTime(0.16, t + 0.12); og.gain.linearRampToValueAtTime(0.0001, t + 0.46);
  }

  /** 突然現身：小二度與三全音疊起來的弦樂尖刺 + 尖嘯 + 一記低頻重擊 */
  _k_stinger({ pan, dist, I }) {
    const dur = 1.5 + 0.6 * Math.min(1.5, I);
    const v = this._voice({ dur, pan: pan * 0.6, dist: Math.min(dist, 6) * 0.3, gain: 0.95 * I, wet: 1.4 });
    const t = v.t, f0 = rnd(900, 1080);
    const body = this._f(v, 'bandpass', 2100, 0.6), hp = this._f(v, 'highpass', 500, 0.7), trem = this._g(v, 0.8), g = this._g(v);
    const tl = this._o(v, 'sine', rnd(9, 13), t, dur), td = this._g(v, 0.2); tl.connect(td).connect(trem.gain);
    body.connect(hp).connect(trem).connect(g).connect(v.bus);
    for (const [m, a] of [[1, 1], [1.0595, 0.9], [1.4142, 0.7], [2.1189, 0.5], [0.5297, 0.6]]) {
      const o = this._o(v, 'sawtooth', f0 * m, t, dur), og = this._g(v, a * 0.3);
      o.detune.value = rnd(-14, 14);
      o.frequency.setValueAtTime(f0 * m * 0.965, t); o.frequency.exponentialRampToValueAtTime(f0 * m * 1.04, t + 0.5);
      o.connect(og).connect(body);
    }
    env(g.gain, t, 0.006, 1, dur - 0.1);
    const ns = this._n(v, this.white, t, 0.5), nb = this._f(v, 'bandpass', 3200, 4), ng = this._g(v);
    nb.frequency.setValueAtTime(3200, t); nb.frequency.exponentialRampToValueAtTime(5400, t + 0.3);
    ns.connect(nb).connect(ng).connect(v.bus); env(ng.gain, t, 0.004, 0.55, 0.4);
    const lo = this._o(v, 'sine', 90, t, 0.7), lg = this._g(v);
    lo.frequency.setValueAtTime(92, t); lo.frequency.exponentialRampToValueAtTime(36, t + 0.45);
    lo.connect(lg).connect(v.bus); env(lg.gain, t, 0.005, 0.9, 0.6);
  }

  /** 低頻湧上：慢慢漲起來再退掉，附一點上方泛音讓小喇叭也感覺得到 */
  _k_sub({ I }) {
    const up = 1.5, hold = 0.7, dur = up + hold + 2.4;
    const v = this._voice({ dur, dist: 0, gain: 0.5 * I, wet: 0 });
    const t = v.t, g = this._g(v);
    for (const [f0, f1, type, a] of [[30, 45, 'sine', 1], [45.6, 68.5, 'sine', 0.55], [61, 91, 'triangle', 0.16]]) {
      const o = this._o(v, type, f0, t, dur), og = this._g(v, a);
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + up + hold);
      o.connect(og).connect(g);
    }
    const s = this._n(v, this.brown, t, dur, 0.5), lp = this._f(v, 'lowpass', 85, 0.7), sg = this._g(v, 0.9);
    s.connect(lp).connect(sg).connect(g); g.connect(v.bus);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1, t + up);
    g.gain.setTargetAtTime(0.0001, t + up + hold, 0.5);
  }

  /** 身後多出來的一步：用玩家腳下當下的材質，比自己的腳步重一點、慢半拍 */
  _k_stepBehind({ pan, dist, I }) {
    const key = this._surface === 'wood' && this.profile === 'home' ? 'floor' : this._surface;
    const v = this._voice({ dur: 0.6, pan, dist: clamp(dist, 0.6, 6) * 0.6, gain: 1.15 * (STEP_GAIN[key] ?? STEP_GAIN.dirt) * I, wet: 1.1, hrtf: true, behind: true, near: 0.45 });
    this._step(v, v.t, this._surface, 1.05);
    const s = this._n(v, this.pink, v.t + 0.12, 0.22), bp = this._f(v, 'bandpass', 1700, 0.8), g = this._g(v); // 鞋底拖了一下
    s.connect(bp).connect(g).connect(v.bus); env(g.gain, v.t + 0.12, 0.05, 0.05, 0.15);
  }

  _knockAt(v, t, s) {
    const n = this._n(v, this.brown, t, 0.12), bp = this._f(v, 'bandpass', rnd(350, 420), 2.2), g = this._g(v);
    n.connect(bp).connect(g).connect(v.bus); env(g.gain, t, 0.002, 0.9 * s, 0.09);
    const o = this._o(v, 'sine', 230, t, 0.09), og = this._g(v);
    o.frequency.setValueAtTime(235, t); o.frequency.exponentialRampToValueAtTime(150, t + 0.06);
    o.connect(og).connect(v.bus); env(og.gain, t, 0.002, 0.5 * s, 0.08);
    const c = this._n(v, this.white, t, 0.02), hp = this._f(v, 'highpass', 2500, 0.7), cg = this._g(v);
    c.connect(hp).connect(cg).connect(v.bus); env(cg.gain, t, 0.001, 0.1 * s, 0.012);
  }

  /** 三下輕敲：指節敲在木板上，第三下慢一點、輕一點 */
  _k_knock({ pan, dist, I }) {
    const v = this._voice({ dur: 1.1, pan, dist, gain: 0.75 * I, wet: 1.2 });
    this._knockAt(v, v.t, 1);
    this._knockAt(v, v.t + rnd(0.3, 0.36), 0.9);
    this._knockAt(v, v.t + rnd(0.7, 0.8), 0.7);
  }

  /** 單獨一下輕敲（恐怖導演的回退路徑會用到這個名稱） */
  _k_knock1({ pan, dist, I }) {
    const v = this._voice({ dur: 0.4, pan, dist, gain: 0.75 * I, wet: 1.2 });
    this._knockAt(v, v.t, 1);
  }

  /** 拖動家具：木腳在地板上黏滑前進，偶爾尖叫一聲，最後頓一下 */
  _k_scrape({ pan, dist, I }) {
    const dur = rnd(1.4, 2.2);
    const v = this._voice({ dur: dur + 0.3, pan, dist, gain: 1.45 * I, wet: 1 });
    const t = v.t, g = this._g(v);
    const st = this._o(v, 'sawtooth', 17, t, dur), sd = this._g(v, 0.42), am = this._g(v, 0.55);
    st.frequency.setValueAtTime(rnd(13, 17), t);
    for (let i = 1; i <= 5; i++) st.frequency.linearRampToValueAtTime(rnd(12, 24), t + (i / 5) * dur);
    st.connect(sd).connect(am.gain);
    const s = this._n(v, this.brown, t, dur), bp = this._f(v, 'bandpass', rnd(200, 290), 1.2), bg = this._g(v, 1);
    s.connect(bp).connect(bg).connect(am);
    const s2 = this._n(v, this.white, t, dur), sq = this._f(v, 'bandpass', rnd(950, 1400), 10), qg = this._g(v, 0);
    sq.frequency.linearRampToValueAtTime(rnd(900, 1500), t + dur);
    for (let i = 0; i < 3; i++) { const a = t + rnd(0.1, dur - 0.3); qg.gain.setTargetAtTime(rnd(0.25, 0.6), a, 0.03); qg.gain.setTargetAtTime(0, a + rnd(0.12, 0.3), 0.05); }
    s2.connect(sq).connect(qg).connect(am);
    am.connect(g).connect(v.bus);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(1, t + 0.07);
    for (let i = 1; i < 4; i++) g.gain.setTargetAtTime(rnd(0.35, 1), t + (i / 4) * dur, 0.07);
    g.gain.setTargetAtTime(0.0001, t + dur - 0.1, 0.03);
    const o = this._o(v, 'sine', 110, t + dur - 0.06, 0.2), og = this._g(v);
    o.frequency.setValueAtTime(115, t + dur - 0.06); o.frequency.exponentialRampToValueAtTime(58, t + dur + 0.06);
    o.connect(og).connect(v.bus); env(og.gain, t + dur - 0.06, 0.004, 0.5, 0.16);
  }

  /** 遠處的門板被甩上：悶重的一聲加上門框的餘震，殘響很多 */
  _k_slam({ pan, dist, I }) {
    const v = this._voice({ dur: 0.8, pan, dist: dist + 9, gain: 3.2 * I, wet: 1.7 });
    const t = v.t;
    const o = this._o(v, 'sine', 78, t, 0.45), og = this._g(v);
    o.frequency.setValueAtTime(82, t); o.frequency.exponentialRampToValueAtTime(34, t + 0.3);
    o.connect(og).connect(v.bus); env(og.gain, t, 0.004, 1, 0.4);
    const s = this._n(v, this.brown, t, 0.3), bp = this._f(v, 'bandpass', 190, 0.8), g = this._g(v);
    s.connect(bp).connect(g).connect(v.bus); env(g.gain, t, 0.003, 0.9, 0.24);
    const c = this._n(v, this.white, t, 0.07), cb = this._f(v, 'bandpass', 1400, 1), cg = this._g(v);
    c.connect(cb).connect(cg).connect(v.bus); env(cg.gain, t, 0.002, 0.5, 0.05);
    for (const dt of [0.11, 0.19]) {
      const r = this._n(v, this.white, t + dt, 0.04), rb = this._f(v, 'bandpass', 900, 2), rg = this._g(v);
      r.connect(rb).connect(rg).connect(v.bus); env(rg.gain, t + dt, 0.002, 0.14, 0.03);
    }
  }

  /** 走音的童謠哼唱：五聲音階的原創短句，幾個音明顯偏低，句尾往下掉 */
  _k_hum({ pan, dist, I }) {
    const N = { E: 329.63, G: 392, A: 440, C: 523.25, D: 587.33 };
    const phrase = [['A', 0.62], ['C', 0.3], ['A', 0.62], ['G', 0.34], ['E', 0.62], ['G', 0.3], ['A', 0.95], [null, 0.35], ['A', 0.3], ['C', 0.3], ['D', 0.66], ['C', 0.34], ['A', 1.5]];
    const slow = rnd(1, 1.18), total = phrase.reduce((s, p) => s + p[1], 0) * slow + 0.4;
    const v = this._voice({ dur: total, pan, dist: dist + 3, gain: 0.26 * I, wet: 1.8 });
    const t = v.t, g = this._g(v);
    const o1 = this._o(v, 'triangle', 440, t, total), o2 = this._o(v, 'sawtooth', 440, t, total), g2 = this._g(v, 0.12);
    const vib = this._o(v, 'sine', 5.3, t, total), vd = this._g(v, 0); vib.connect(vd); vd.connect(o1.detune); vd.connect(o2.detune);
    vd.gain.setValueAtTime(0, t); vd.gain.linearRampToValueAtTime(16, t + total * 0.5); vd.gain.linearRampToValueAtTime(30, t + total);
    const lp = this._f(v, 'lowpass', 1050, 0.7), pk = this._f(v, 'peaking', 310, 1.2); pk.gain.value = 7;
    o1.connect(lp); o2.connect(g2).connect(lp); lp.connect(pk).connect(g).connect(v.bus);
    const br = this._n(v, this.pink, t, total), bb = this._f(v, 'bandpass', 2100, 1), bg = this._g(v, 0.035); // 鼻息
    br.connect(bb).connect(bg).connect(g);
    let at = t + 0.05;
    const flat = new Set([3 + Math.floor(Math.random() * 3), 10]);
    g.gain.setValueAtTime(0.0001, t);
    phrase.forEach(([n, d], i) => {
      const len = d * slow * (i > 8 ? 1.12 : 1);
      if (n) {
        const f = N[n] * cents(flat.has(i) ? -rnd(55, 95) : rnd(-22, 14));
        for (const o of [o1, o2]) {
          o.frequency.setTargetAtTime(f, at, 0.045);
          if (i === phrase.length - 1) o.frequency.setTargetAtTime(f * cents(-140), at + len * 0.45, len * 0.5); // 句尾洩氣
        }
        g.gain.setTargetAtTime(rnd(0.55, 0.8), at, 0.06);
        g.gain.setTargetAtTime(0.28, at + len * 0.75, 0.05);
      } else g.gain.setTargetAtTime(0.0001, at, 0.04);
      at += len;
    });
    g.gain.setTargetAtTime(0.0001, at - 0.35, 0.12);
  }

  /** 電話／錄音機雜訊：電話頻寬的噪音斷斷續續，夾著爆裂聲與交流哼聲 */
  _k_static({ pan, dist, I }) {
    const dur = rnd(1.1, 1.7);
    const v = this._voice({ dur, pan, dist: Math.min(dist, 4) * 0.5, gain: 0.3 * I, wet: 0.3 });
    const t = v.t, s = this._n(v, this.white, t, dur), hp = this._f(v, 'highpass', 380, 0.7), lp = this._f(v, 'lowpass', 3300, 0.8), g = this._g(v), out = this._g(v);
    s.connect(hp).connect(lp).connect(g).connect(out).connect(v.bus);
    g.gain.setValueAtTime(0.5, t);
    for (let a = 0.02; a < dur; a += rnd(0.03, 0.13)) g.gain.setValueAtTime(Math.random() < 0.25 ? 0.03 : rnd(0.25, 0.8), t + a);
    const c = this._n(v, this.white, t, dur), cg = this._g(v); // 爆裂
    c.connect(cg).connect(out);
    for (let i = 0; i < 14; i++) { const a = t + rnd(0, dur - 0.05); cg.gain.setValueAtTime(rnd(0.5, 1.2), a); cg.gain.setTargetAtTime(0, a + 0.001, 0.003); }
    const h = this._o(v, 'sawtooth', 60, t, dur), hl = this._f(v, 'lowpass', 420, 0.7), hg = this._g(v, 0.2);
    h.connect(hl).connect(hg).connect(out);
    const w = this._o(v, 'sine', rnd(2600, 3100), t, dur), wg = this._g(v, 0.035);
    w.frequency.linearRampToValueAtTime(rnd(2500, 3200), t + dur);
    w.connect(wg).connect(out);
    out.gain.setValueAtTime(0.0001, t); out.gain.linearRampToValueAtTime(1, t + 0.01); out.gain.setValueAtTime(1, t + dur - 0.03); out.gain.linearRampToValueAtTime(0.0001, t + dur);
  }

  /** 驚嚇後的耳鳴：兩支互相拍動的高頻正弦波慢慢退去，同時把環境聲悶住 */
  _k_ring({ pan, I }) {
    const dur = 4.5 + 1.2 * Math.min(1.5, I);
    const v = this._voice({ dur, pan: pan * 0.5, dist: 0, gain: 0.15 * I, wet: 0 });
    const t = v.t, f = rnd(5300, 6700), g = this._g(v);
    for (const [m, a] of [[1, 1], [1.006, 0.8], [1.52, 0.25]]) {
      const o = this._o(v, 'sine', f * m, t, dur), og = this._g(v, a * 0.5);
      o.connect(og).connect(g);
    }
    g.connect(v.bus);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(1, t + 0.05); g.gain.setValueAtTime(1, t + 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur - 0.05);
    this._muffle(dur * 0.8);
  }

  /** 遠處單聲鐘：比平常那口鐘低，泛音不太對，音高微微往下滑 */
  _k_bellFar({ pan, dist, I }) {
    this.bell(1.5 * I, undefined, { pan: pan || rnd(-0.5, 0.5), dist: dist + 20, base: rnd(108, 124), wrong: 1 });
  }

  /** 樓上的彈珠聲：掉在地板上越彈越密，最後滾走（台灣公寓的經典怪聲） */
  _k_marble({ pan, dist, I }) {
    let at = 0, gap = rnd(0.36, 0.46), a = 1;
    const hits = [];
    while (gap > 0.022 && hits.length < 16) { hits.push([at, a]); at += gap; gap *= 0.71; a *= 0.84; }
    const roll = rnd(0.5, 0.9);
    const v = this._voice({ dur: at + roll + 0.2, pan, dist: dist + 2, gain: 1.3 * I, wet: 0.8, hrtf: true, above: 2.2, lp: 2600 });
    for (const [dt, amp] of hits) {
      const t = v.t + dt, o = this._o(v, 'sine', rnd(1900, 2300), t, 0.05), g = this._g(v);
      o.connect(g).connect(v.bus); env(g.gain, t, 0.001, 0.4 * amp, 0.03);
      const n = this._n(v, this.brown, t, 0.06), bp = this._f(v, 'bandpass', 330, 1.5), ng = this._g(v);
      n.connect(bp).connect(ng).connect(v.bus); env(ng.gain, t, 0.001, 0.8 * amp, 0.04);
    }
    const s = this._n(v, this.brown, v.t + at, roll), bp = this._f(v, 'bandpass', 480, 2), am = this._g(v, 0.5), g = this._g(v);
    const l = this._o(v, 'sine', 22, v.t + at, roll), ld = this._g(v, 0.5); l.frequency.linearRampToValueAtTime(34, v.t + at + roll); l.connect(ld).connect(am.gain);
    s.connect(bp).connect(am).connect(g).connect(v.bus); env(g.gain, v.t + at, 0.05, 0.25, roll - 0.06);
  }

  /** 狗吹螺：遠處的狗拉長了聲音嚎叫（民間說法是牠們看見了） */
  _k_howl({ pan, dist, I }) { this._howl(undefined, { pan: pan || rnd(-0.8, 0.8), dist: dist + 30, gain: I }); }
  _howl(t, { pan, dist, gain }) {
    const dur = rnd(2.4, 3.4);
    const v = this._voice({ t, dur: dur + 0.2, pan, dist, gain: 1.5 * gain, wet: 2.4, amb: t !== undefined });
    const a = v.t, f0 = rnd(280, 320), top = f0 * rnd(1.5, 1.68);
    const o = this._o(v, 'sawtooth', f0, a, dur), f1 = this._f(v, 'bandpass', 560, 3), f2 = this._f(v, 'bandpass', 1250, 4), g = this._g(v);
    const vib = this._o(v, 'sine', 4.6, a, dur), vd = this._g(v, 14); vib.connect(vd).connect(o.detune);
    o.frequency.setValueAtTime(f0, a); o.frequency.exponentialRampToValueAtTime(top, a + dur * 0.22);
    o.frequency.setValueAtTime(top, a + dur * 0.6); o.frequency.exponentialRampToValueAtTime(f0 * 1.08, a + dur);
    o.connect(f1).connect(g); o.connect(f2).connect(g); g.connect(v.bus);
    g.gain.setValueAtTime(0.0001, a); g.gain.linearRampToValueAtTime(0.9, a + dur * 0.25); g.gain.setValueAtTime(0.9, a + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, a + dur);
  }

  /** 遠處的啜泣：幾聲短促下墜的抽噎，最後拉成一長聲 */
  _k_sob({ pan, dist, I }) {
    const n = 3 + Math.floor(Math.random() * 2);
    const dur = n * 0.42 + 1.9;
    const v = this._voice({ dur, pan, dist: dist + 6, gain: 1.1 * I, wet: 2 });
    const t = v.t, o = this._o(v, 'sawtooth', 400, t, dur), f1 = this._f(v, 'bandpass', 640, 4), f2 = this._f(v, 'bandpass', 1180, 5), lp = this._f(v, 'lowpass', 2600, 0.7), g = this._g(v);
    const tr = this._o(v, 'sine', 6.8, t, dur), td = this._g(v, 28); tr.connect(td).connect(o.detune);
    o.connect(f1).connect(lp); o.connect(f2).connect(lp); lp.connect(g).connect(v.bus);
    const br = this._n(v, this.pink, t, dur), bb = this._f(v, 'bandpass', 1700, 1.2), bg = this._g(v); br.connect(bb).connect(bg).connect(v.bus);
    g.gain.setValueAtTime(0.0001, t);
    let at = t + 0.05;
    for (let i = 0; i < n; i++) {
      const f = rnd(430, 480) * (1 - i * 0.05);
      o.frequency.setValueAtTime(f, at); o.frequency.exponentialRampToValueAtTime(f * 0.78, at + 0.2);
      g.gain.setTargetAtTime(rnd(0.5, 0.8), at, 0.02); g.gain.setTargetAtTime(0.0001, at + 0.16, 0.035);
      bg.gain.setTargetAtTime(0.1, at + 0.26, 0.02); bg.gain.setTargetAtTime(0.0001, at + 0.36, 0.02); // 抽氣
      at += rnd(0.38, 0.46);
    }
    o.frequency.setValueAtTime(470, at); o.frequency.exponentialRampToValueAtTime(350, at + 1.5);
    g.gain.setTargetAtTime(0.75, at, 0.1); g.gain.setTargetAtTime(0.0001, at + 0.9, 0.3);
  }

  _k_creak({ pan, dist, I }) { this.creak(undefined, { pan, dist, gain: 1.1 * I }); }
  _k_drip({ pan, dist, I }) { this._drip(undefined, { pan, dist, gain: 0.45 * I, amb: false }); }
  _k_heartbeat({ I }) { this._beat(undefined, clamp(I, 0.2, 1.5), 0.8); }
}
