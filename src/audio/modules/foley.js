/**
 * foley 組（環境與擬音）：真實錄音疊在 AudioSys 的程序化聲音上。素材沒載入時（?auto 的離線測試、下載失敗）一律退回原本的程序化版本。
 *
 * 1. 環境床：每個聲學空間一組錄音循環（同一個單聲道檔案在兩個偏移位置、左右各一條，速度略不同，聽不出重複），
 *    疊在程序化的陣風／門縫風嘯上（layerMul 依實際有沒有在播調整）。蟲鳴會隨緊張度被低通、變小（「蟲突然不叫了」）。
 *    寺廟：山林夜（室外、古戲台）／殿內風嘯＋外面被悶住的山林／地下封印室的滴水／亂葬崗的樹林風。
 *    舊山路：村外的夜（紙紮行內是被牆悶住的夜＋餘燼）；石橋上蟲聲退開（「下方沒有水聲」）。住處：雨打窗＋遠方城市＋冰箱。
 * 2. 偶發事件（envHook 取代 _pump 的 wood / house / drip / rustle / dog / bell / fish / thunder）：錄音版，排在音訊時鐘上，
 *    走環境匯流排（duck 會抽掉）；不佔 Voice 數量上限（長的環境聲不會被驚嚇音效擠掉）。
 * 3. 新的偶發事件（onUpdate 自己排程）：空殿裡隱約的誦經（依章節、恐怖導演的節奏調整頻率；換樓層的瞬間戛然而止，
 *    偶爾接一記引磬或一段木魚）、屋簷風鈴（陣風）、符紙翻動（陣風）、古戲台的破幕布（陣風）、夜裡的貓頭鷹；
 *    舊山路的石橋：「我已經停步了。橋下卻又響了一步」——劇情提示出現時，一步從橋下的涵洞傳上來。
 * 4. 覆寫：footstep（各材質錄音、寺廟木地板偶爾吱嘎、樓梯上更常吱嘎、衝刺時蹭步、落地雙腳、蹲走較悶）、creak、click、bell、woodenFish、phoneRing、doorKnock，
 *    horror 種類 stepBehind / knock / knock1 / scrape / slam / creak / drip / bellFar / marble / static / howl。
 *    寺廟原本不錯的程序化聲音（廟鐘、木魚、木構造吱嘎、門縫風嘯、陣風）保留，錄音疊上去讓它更立體。
 * 5. finaleAudio.js、horror/setpieces/synth.js 的非人聲函式在原檔內改成「有錄音用錄音」；共用的小工具放在 audio.foley。
 *
 * 除錯：audio.modules.foley.state（目前的環境床、事件計時）；audio.foley.ambShot(id, opts) 可手動播一個環境一次性聲音。
 */

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/** 各材質腳步的音量（錄音已正規化到同一個瞬時響度；這裡依材質聽感配平，對齊原本程序化腳步的峰值） */
const STEP = { wood: 0.95, stone: 1.0, dirt: 0.9, gravel: 0.85, grass: 0.88, floor: 1.0, wet: 0.9 };

/**
 * 環境床的配置：每個空間一組 [key, 素材, 增益, { pan, rate, lp }]。同一個 key 在兩個空間之間會延續（只改增益與低通）。
 * 增益以「兩條同時播」為準；實際響度在 onUpdate 裡再乘上陣風、緊張度、劇情（釋放後）等係數。
 */
const BEDS = {
  temple: {
    open: [['night.L', 'foley.bed.temple.night', 0.62, { pan: -0.62, rate: 1 }], ['night.R', 'foley.bed.temple.night', 0.62, { pan: 0.62, rate: 0.987 }]],
    hall: [['hall.L', 'foley.bed.temple.hall', 0.38, { pan: -0.5, rate: 1 }], ['hall.R', 'foley.bed.temple.hall', 0.38, { pan: 0.5, rate: 0.982 }], ['night.L', 'foley.bed.temple.night', 0.3, { pan: -0.2, lp: 650 }]],
    crypt: [['crypt.L', 'foley.bed.temple.crypt', 0.6, { pan: -0.55, rate: 1 }], ['crypt.R', 'foley.bed.temple.crypt', 0.6, { pan: 0.55, rate: 0.973 }]],
    grave: [['grave.L', 'foley.bed.temple.grave', 0.58, { pan: -0.6, rate: 1 }], ['grave.R', 'foley.bed.temple.grave', 0.58, { pan: 0.6, rate: 0.979 }]],
  },
  road: {
    open: [['rn.L', 'foley.bed.road.night', 0.52, { pan: -0.6, rate: 1 }], ['rn.R', 'foley.bed.road.night', 0.52, { pan: 0.6, rate: 0.984 }]],
    workshop: [['rn.L', 'foley.bed.road.night', 0.42, { pan: -0.25, lp: 900 }], ['ember', 'foley.fire', 0.3, { pan: 0.35, lp: 2600 }]],
  },
  home: {
    room: [['rain.L', 'foley.bed.home.rain', 0.75, { pan: -0.55, rate: 1 }], ['rain.R', 'foley.bed.home.rain', 0.75, { pan: 0.55, rate: 0.976 }], ['city', 'foley.bed.home.city', 0.42, { pan: 0.1, lp: 1500 }], ['fridge', 'foley.bed.home.fridge', 0.22, { pan: -0.35, lp: 2000 }]],
  },
};
/** 有錄音環境床時，程序化環境層要退多少（1 = 不動） */
const LAYERS = {
  'temple.open': { wind: 0.72, howl: 0.9, leaf: 0.45, bug: 0.12 },
  'temple.hall': { wind: 0.8, howl: 1, room: 0.55 },
  'temple.crypt': { room: 0.6 },
  'temple.grave': { wind: 0.62, howl: 0.85, leaf: 0.35 },
  'road.open': { wind: 0.72, leaf: 0.5, bug: 0.12 },
  'road.workshop': { room: 0.6, ember: 0.45, wind: 0.8 },
  'home.room': { rain: 0.32, pane: 0.55, hum: 0.25 },
};
const MY_LAYERS = ['wind', 'howl', 'leaf', 'room', 'bug', 'rain', 'pane', 'hum', 'ember'];
/** 寺廟裡的位置（地圖座標，見 src/maps/temple/layout.js）：古戲台在東側、主殿在北側 */
const STAGE = { x: 23, z: -1 };

export function install(audio) {
  const has = (id) => !!audio.bank?.has(id);
  const ok = () => !!(audio.ctx && audio.running);
  /** 只在這個 AudioSys 屬於正在跑的遊戲時才讀遊戲狀態（測試頁面裡的離線 AudioSys 不能去讀真正遊戲的玩家位置） */
  const game = () => { const g = typeof window !== 'undefined' ? window.__game : null; return g && g.audio === audio ? g : null; };
  const mapKey = () => (audio.profile === 'home' ? 'home' : audio.profile === 'road' ? 'road' : 'temple');

  const st = {
    map: null, beds: new Map(), space: '', zone: '', layerKey: '', acc: 0, slow: 0,
    floor: -1, chapter: 0, scene: '', phase: '', bridge: 0, bridgeCue: false,
    nextChant: 0, nextChime: 0, nextPaper: 0, nextOwl: 0, nextCloth: 0, chant: null, chantSpace: '', chantFloor: -1,
    lastStepCreak: 0, lastScuff: 0,
  };
  const live = new Set(); // ambShot 的存活數（除錯用）

  // ───────────────────────── 小工具 ─────────────────────────

  /**
   * 環境一次性聲音：直接接到環境匯流排（ambIn / ambWet，duck 會抽掉），不經過 Voice（不佔數量上限、不會被驚嚇音效擠掉）。
   * dist 模擬 Voice 的距離衰減與低通。結束後節點全部中斷連線。
   */
  function ambShot(id, o = {}) {
    const ctx = audio.ctx, bank = audio.bank;
    if (!ctx || !bank) return null;
    const buf = bank.buffer(id, o.variant); if (!buf) return null;
    const e = bank.library[id] || {};
    const t0 = Math.max(ctx.currentTime, o.t ?? ctx.currentTime);
    const rate = o.rate ?? (Array.isArray(e.rate) ? rnd(e.rate[0], e.rate[1]) : e.rate || 1);
    const dist = o.dist ?? 4;
    const amp = (o.gain ?? 1) * (e.gain ?? 1) / Math.pow(1 + dist * 0.22, 1.3);
    const lpHz = Math.min(o.lp || 20000, 19000 / (1 + dist * 0.35));
    const src = ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = rate;
    const nodes = [src];
    let head = src;
    if (lpHz < 15000) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lpHz; f.Q.value = 0.5; head.connect(f); head = f; nodes.push(f); }
    if (o.hp) { const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = o.hp; f.Q.value = 0.5; head.connect(f); head = f; nodes.push(f); }
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = clamp(o.pan || 0, -1, 1); head.connect(p); head = p; nodes.push(p); }
    const g = ctx.createGain(); nodes.push(g);
    const offset = clamp(o.offset || 0, 0, Math.max(0, buf.duration - 0.05));
    const len = o.dur ?? (buf.duration - offset) / rate;
    if (o.fadeIn) { g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(amp, t0 + o.fadeIn); } else g.gain.value = amp;
    if (o.dur != null && o.dur < (buf.duration - offset) / rate) { g.gain.setValueAtTime(amp, Math.max(t0, t0 + o.dur - 0.25)); g.gain.linearRampToValueAtTime(0.0001, t0 + o.dur); }
    head.connect(g).connect(o.bus === 'fx' ? audio.fxBus : audio.ambIn);
    const wetAmt = (o.wet ?? 1) * audio.wetAmt * (0.3 + (0.7 * dist) / (dist + 6));
    if (wetAmt > 0.004) { const w = ctx.createGain(); w.gain.value = wetAmt; g.connect(w).connect(o.bus === 'fx' ? audio.revSend : audio.ambWet); nodes.push(w); }
    src.start(t0, offset); src.stop(t0 + len + 0.05);
    const h = {
      src, gain: g, t0, end: t0 + len,
      stop(fade = 0.12) {
        try { const n = ctx.currentTime; g.gain.cancelScheduledValues(n); g.gain.setTargetAtTime(0, Math.max(n, t0), Math.max(0.01, fade / 3)); src.stop(Math.max(n, t0) + fade + 0.05); } catch { /* 已停止 */ }
      },
    };
    src.onended = () => { live.delete(h); for (const n of nodes) { try { n.disconnect(); } catch { /* 忽略 */ } } };
    live.add(h);
    return h;
  }

  /** 從聽者看過去的左右（−1..1）；沒有遊戲時隨機 */
  function panTo(x, z) {
    const g = game(); if (!g) return rnd(-0.6, 0.6);
    const p = g.player, dx = x - p.pos.x, dz = z - p.pos.z, d = Math.hypot(dx, dz) || 1;
    return clamp((dx * Math.cos(p.yaw) - dz * Math.sin(p.yaw)) / d, -1, 1);
  }
  function distTo(x, z) { const g = game(); if (!g) return 20; const p = g.player.pos; return Math.hypot(x - p.x, z - p.z); }

  /** 測試用：mute.beds 關掉環境床、mute.events 關掉自己排程的偶發事件（量單一音效時不被背景干擾） */
  const mute = { beds: false, events: false };
  audio.foley = { ambShot, panTo, has, mute };

  // ───────────────────────── 環境床 ─────────────────────────

  function wantBeds(space) {
    const set = BEDS[mapKey()];
    return (set && set[space]) || null;
  }

  function syncBeds(space) {
    const want = mute.beds ? null : wantBeds(space);
    const keys = new Set();
    if (want) for (const [key, id, gain, o] of want) {
      if (!has(id)) continue;
      keys.add(key);
      let b = st.beds.get(key);
      if (b && (!b.h.playing || b.id !== id)) { b.h.stop(0.6); st.beds.delete(key); b = null; }
      if (!b) {
        const h = audio.bank.loop(id, { gain: 0.0001, rate: o.rate || 1, pan: o.pan || 0, lp: o.lp || 20000, fadeIn: 0 });
        if (!h) { keys.delete(key); continue; }
        b = { key, id, h, base: gain, lp: o.lp || 20000, pan: o.pan || 0, cur: -1, curLp: -1 };
        st.beds.set(key, b);
      }
      b.base = gain; b.lp = o.lp || 20000;
      if ((o.pan || 0) !== b.pan) { b.pan = o.pan || 0; b.h.setPan(b.pan, 1.2); }
    }
    for (const [key, b] of st.beds) if (!keys.has(key)) { b.h.stop(1.4); st.beds.delete(key); }
  }

  function stopBeds(fade = 0.4) { for (const b of st.beds.values()) b.h.stop(fade); st.beds.clear(); }

  /** 每 0.1 秒：依陣風、緊張度、劇情調整環境床 */
  function shapeBeds(s) {
    const T = s.tension, rel = s.released, gust = s.gust;
    const hush = sstep(0.25, 0.7, T); // 緊張時蟲鳴退掉
    for (const b of st.beds.values()) {
      if (!b.h.playing) continue;
      let g = b.base, lp = b.lp;
      const k = b.key;
      if (k.startsWith('night') || k.startsWith('rn')) {
        g *= 1 - 0.7 * hush; lp = Math.min(lp, 16000 - 14500 * hush); // 蟲突然不叫了
        if (st.zone === 'terrace') { g *= 0.7; lp = Math.min(lp, 5000); } // 四樓露台：離樹林遠、風大
        if (k.startsWith('rn') && st.bridge > 0) { g *= 1 - 0.6 * st.bridge; lp = Math.min(lp, 16000 - 13000 * st.bridge); } // 石橋上：橋下沒有水聲，連蟲都安靜
        if (rel) g *= 1.15;
      } else if (k.startsWith('hall')) {
        g *= (0.75 + 0.45 * gust) * (1 + 0.12 * Math.max(0, st.floor)) * (rel ? 0.5 : 1);
      } else if (k.startsWith('grave')) {
        g *= (0.7 + 0.55 * gust) * (rel ? 0.7 : 1);
      } else if (k.startsWith('crypt')) {
        g *= rel ? 0.7 : 1;
      } else if (k.startsWith('rain')) {
        const near = clamp(audio.windowNear ?? 0.5);
        g *= (0.55 + 0.6 * near) * (0.85 + 0.3 * gust); lp = Math.min(lp, 3200 + 12000 * near);
      }
      if (Math.abs(g - b.cur) > Math.max(0.004, b.cur * 0.04)) { b.cur = g; b.h.setGain(g, 0.6); }
      if (Math.abs(lp - b.curLp) > b.curLp * 0.05) { b.curLp = lp; b.h.setLP(lp, 0.5); }
    }
  }

  function syncLayers(space) {
    const key = `${mapKey()}.${space}`;
    const set = wantBeds(space), main = set ? set[0][1] : '';
    let playing = false;
    for (const b of st.beds.values()) if (b.id === main && b.h.playing) { playing = true; break; }
    const want = playing ? LAYERS[key] : null;
    const tag = want ? key : '';
    if (tag === st.layerKey) return;
    st.layerKey = tag;
    for (const k of MY_LAYERS) audio.layerMul[k] = want && want[k] !== undefined ? want[k] : 1;
  }

  // ───────────────────────── 遊戲狀態（慢速輪詢） ─────────────────────────

  function pollGame() {
    const g = game();
    if (!g) { st.zone = ''; st.floor = -1; st.bridge = 0; return; }
    const p = g.player.pos, m = g.map, mk = mapKey();
    st.chapter = g.story?.state?.chapter ?? 0;
    st.scene = g.story?.state?.scene || g.story?.scene || '';
    try { st.phase = g.horror?.debug?.state?.phase || ''; } catch { st.phase = ''; }
    if (mk === 'temple') {
      const name = m?.zoneName ? m.zoneName(p) : '';
      st.zone = name.includes('露台') ? 'terrace' : name.includes('戲台') ? 'stage' : name.includes('樓') ? 'hall' : name;
      st.floor = name.startsWith('一樓') ? 0 : name.startsWith('二樓') ? 1 : name.startsWith('三樓') ? 2 : name.startsWith('四樓') ? 3 : -1;
    } else { st.zone = ''; st.floor = -1; }
    if (mk === 'road') {
      const on = p.z > 7 && p.z < 14 && Math.abs(p.x) < 3.2 ? 1 : 0;
      st.bridge += (on - st.bridge) * 0.35;
      const cue = !!g.story?.bridgeCue;
      if (cue && !st.bridgeCue) underBridgeStep();
      st.bridgeCue = cue;
    } else st.bridge = 0;
  }

  /** 石橋：「我已經停步了。橋下卻又響了一步。」——一步從橋下的涵洞傳上來，悶、帶回音 */
  function underBridgeStep() {
    if (!has('foley.step.stone')) return;
    const t = audio.ctx.currentTime + 0.55;
    ambShot('foley.step.stone', { t, dist: 3.5, gain: 1.6, lp: 700, rate: 0.82, wet: 2.4, pan: rnd(-0.2, 0.2) });
    if (Math.random() < 0.6) ambShot('foley.step.stone', { t: t + rnd(0.55, 0.7), dist: 4.5, gain: 1.1, lp: 600, rate: 0.8, wet: 2.4, pan: rnd(-0.3, 0.3) });
  }

  // ───────────────────────── 偶發事件 ─────────────────────────

  const quiet = (s) => s.released || s.ducked || st.scene === 'finale' || st.scene.startsWith('dread:');

  /** 空殿裡隱約的誦經 */
  function maybeChant(s) {
    if (mapKey() !== 'temple' || !has('foley.chant')) return;
    if (s.space !== 'hall' || quiet(s) || st.chant) return;
    if (s.time < st.nextChant) return;
    const ph = st.phase;
    if (ph === 'calm' || ph === 'peak' || ph === 'approach' || s.tension > 0.55) { st.nextChant = s.time + rnd(8, 16); return; }
    // 章節越後面、恐怖導演在鋪陳時越常聽到
    const k = [1.7, 1.25, 1, 0.8, 0.7][clamp(st.chapter, 0, 4)] * (ph === 'build' ? 0.75 : 1);
    st.nextChant = s.time + rnd(70, 140) * k;
    const t = audio.ctx.currentTime + 0.05;
    const far = Math.random() < 0.6;
    const h = ambShot('foley.chant', { t, dist: far ? rnd(16, 26) : rnd(9, 14), gain: far ? 2.0 : 1.5, lp: far ? rnd(900, 1300) : rnd(1500, 2100), pan: rnd(-0.85, 0.85), wet: 1.7, fadeIn: 0.6 });
    if (!h) return;
    st.chant = h; st.chantSpace = s.space; st.chantFloor = st.floor;
    const len = h.end - h.t0;
    if (Math.random() < 0.35 && has('foley.woodfish')) woodfishRun(3 + Math.floor(Math.random() * 3), t + rnd(0.8, 2), { dist: 18, gain: 0.5, amb: true, pan: rnd(-0.7, 0.7) });
    if (Math.random() < 0.3 && has('foley.inkin')) ambShot('foley.inkin', { t: t + len + rnd(0.3, 1.2), dist: 16, gain: 0.7, pan: rnd(-0.7, 0.7), wet: 1.6 });
  }
  function watchChant(s) {
    const c = st.chant; if (!c) return;
    if (audio.ctx.currentTime > c.end) { st.chant = null; return; }
    // 走進另一層樓、離開殿內、或被抽空的那一刻：誦經戛然而止
    if (s.space !== st.chantSpace || st.floor !== st.chantFloor || s.ducked || s.tension > 0.7) { c.stop(0.09); st.chant = null; st.nextChant = s.time + rnd(45, 90); }
  }

  /** 屋簷風鈴、符紙、貓頭鷹 */
  function maybeAir(s) {
    const mk = mapKey(), sp = s.space, gust = s.gust;
    if (mk === 'temple' && has('foley.chime') && s.time > st.nextChime) {
      if ((sp === 'open' || sp === 'hall') && gust > 0.5 && !s.ducked) {
        st.nextChime = s.time + rnd(14, 34);
        const inside = sp === 'hall';
        const n = gust > 0.8 ? 2 : 1, t = audio.ctx.currentTime + 0.05;
        for (let i = 0; i < n; i++) ambShot('foley.chime', { t: t + i * rnd(0.35, 0.9), dist: inside ? rnd(10, 16) : rnd(7, 18), gain: (inside ? 0.45 : 0.75) * (0.6 + 0.5 * gust), lp: inside ? 2400 : 0, pan: rnd(-0.9, 0.9), wet: 1.1 });
      } else st.nextChime = s.time + rnd(3, 6);
    }
    if (mk === 'temple' && has('foley.paper') && s.time > st.nextPaper) {
      if ((sp === 'hall' || st.zone === 'stage') && gust > 0.45 && !s.ducked) {
        st.nextPaper = s.time + rnd(18, 42);
        ambShot('foley.paper', { dist: rnd(2.5, 6), gain: 0.8 * (0.6 + 0.6 * gust), pan: rnd(-0.9, 0.9), wet: 0.9 });
      } else st.nextPaper = s.time + rnd(4, 8);
    }
    // 古戲台：破舊的幕布被風掀起來
    if (mk === 'temple' && st.zone === 'stage' && has('foley.cloth') && gust > 0.55 && !s.ducked && s.time > st.nextCloth) {
      st.nextCloth = s.time + rnd(9, 22);
      ambShot('foley.cloth', { dist: rnd(4, 8), gain: 0.9 * gust, rate: rnd(0.7, 0.85), lp: 2600, pan: panTo(STAGE.x, STAGE.z), wet: 1 });
    }
    if ((mk === 'temple' || mk === 'road') && has('foley.owl') && s.time > st.nextOwl) {
      st.nextOwl = s.time + rnd(45, 110);
      if ((sp === 'open' || sp === 'grave') && !quiet(s) && s.tension < 0.5) {
        const t = audio.ctx.currentTime + 0.05, pan = rnd(-0.9, 0.9), d = rnd(26, 45);
        ambShot('foley.owl', { t, dist: d, gain: 1.6, pan, wet: 1.8 });
        if (Math.random() < 0.4) ambShot('foley.owl', { t: t + rnd(3, 5), dist: d, gain: 1.3, pan, wet: 1.8 });
      }
    }
  }

  // ───────────────────────── 每幀 ─────────────────────────

  audio.onMap((mapId) => {
    stopBeds(0.3);
    st.map = mapId; st.layerKey = '#'; st.space = ''; st.chant = null; st.bridgeCue = false; st.bridge = 0;
    for (const k of MY_LAYERS) audio.layerMul[k] = 1;
    const t = audio._t || 0;
    st.nextChant = t + rnd(35, 70); st.nextChime = t + rnd(6, 14); st.nextPaper = t + rnd(10, 25); st.nextOwl = t + rnd(20, 50);
  });

  audio.onUpdate((dt, s) => {
    if (!audio.bank) return;
    st.acc += dt; st.slow += dt;
    if (st.slow > 0.5 || st.space === '') { st.slow = 0; pollGame(); }
    if (s.space !== st.space) { st.space = s.space; syncBeds(s.space); }
    if (st.acc < 0.1) return;
    st.acc = 0;
    // 環境床被別人停掉（換地圖時 bank.stopLoops）就重建
    for (const b of st.beds.values()) if (!b.h.playing) { syncBeds(s.space); break; }
    shapeBeds(s);
    syncLayers(s.space);
    watchChant(s);
    if (mute.events) return;
    maybeChant(s);
    maybeAir(s);
  });

  // ───────────────────────── 偶發環境事件（取代 _pump） ─────────────────────────

  audio.envHook('wood', (t, fire) => {
    if (Math.random() < 0.32 && has('foley.creak.long')) {
      ambShot('foley.creak.long', { t, dist: rnd(5, 13), gain: rnd(0.6, 1.0), pan: rnd(-0.95, 0.95), wet: 1.4, rate: rnd(0.8, 1.05) });
      if (Math.random() < 0.5) audio.creak(t + rnd(0.05, 0.3), { pan: rnd(-0.9, 0.9), dist: rnd(6, 12), amb: true, gain: 0.3, _orig: true });
    } else if (Math.random() < 0.35 && has('foley.creak.floor')) {
      ambShot('foley.creak.floor', { t, dist: rnd(6, 12), gain: rnd(0.4, 0.7), pan: rnd(-0.95, 0.95), wet: 1.5, rate: rnd(0.85, 1.1) });
    } else fire(t);
  });
  audio.envHook('house', (t, fire) => {
    if (Math.random() < 0.3 && has('foley.creak.long')) ambShot('foley.creak.long', { t, dist: rnd(6, 10), gain: 0.35, lp: 3500, pan: rnd(-0.9, 0.9), wet: 1, rate: rnd(1.0, 1.15) });
    else fire(t);
  });
  audio.envHook('drip', (t, fire) => {
    if (!has('foley.drip')) return fire(t);
    ambShot('foley.drip', { t, dist: rnd(3, 9), gain: rnd(0.5, 0.9), pan: rnd(-0.9, 0.9), wet: 1.6 });
    if (Math.random() < 0.18) ambShot('foley.drip', { t: t + rnd(0.25, 0.6), dist: rnd(3, 9), gain: rnd(0.3, 0.6), pan: rnd(-0.9, 0.9), wet: 1.6 });
  });
  audio.envHook('rustle', (t, fire) => {
    if (!has('foley.rustle')) return fire(t);
    ambShot('foley.rustle', { t, dist: rnd(5, 12), gain: 1.0, pan: rnd(-1, 1), wet: 0.5 });
  });
  audio.envHook('dog', (t, fire) => {
    const T = audio._ten || 0;
    if (Math.random() < 0.3 + 0.5 * T && has('foley.howl')) { ambShot('foley.howl', { t, dist: rnd(38, 60), gain: 2.2, pan: rnd(-0.8, 0.8), wet: 2.4 }); return; }
    if (!has('foley.bark')) return fire(t);
    const n = 2 + Math.floor(Math.random() * 3), pan = rnd(-0.8, 0.8), d = rnd(34, 55);
    let at = t;
    for (let i = 0; i < n; i++) { ambShot('foley.bark', { t: at, dist: d, gain: rnd(1.6, 2.2), pan, wet: 2.2 }); at += rnd(0.32, 0.55); }
  });
  audio.envHook('bell', (t, fire) => { audio.bell(rnd(0.5, 1), t); });
  audio.envHook('fish', (t, fire) => { audio.woodenFish(3 + Math.floor(Math.random() * 4), t); });
  audio.envHook('thunder', (t, fire) => {
    if (!has('foley.thunder')) return fire(t);
    ambShot('foley.thunder', { t, dist: 0, gain: rnd(0.45, 0.7), pan: rnd(-0.5, 0.5), wet: 0, lp: rnd(2500, 5000) });
    // 程序化的低頻悶雷疊在下面（錄音的小喇叭聽得到、低頻由合成補）
    fire(t);
  });

  // ───────────────────────── 覆寫：擬音 ─────────────────────────

  /** 寺廟殿內的樓梯：腳的高度不在任何一層樓板附近（樓板高度見 src/maps/temple/layout.js） */
  const FLOOR_Y = [0.9, 6.9, 11.9, 16.9];
  function onStairs() {
    if (mapKey() !== 'temple') return false;
    const g = game(); if (!g) return false;
    const y = g.player.pos.y; let d = 9;
    for (const f of FLOOR_Y) d = Math.min(d, Math.abs(y - f));
    return d > 0.35 && y > 1.2 && y < 16.6;
  }

  audio.override('footstep', (orig, strength = 0.6, surface = 'dirt') => {
    if (!ok()) return;
    const key = surface === 'wood' && audio.profile === 'home' ? 'floor' : surface;
    const id = 'foley.step.' + key;
    if (!has(id)) return orig(strength, surface);
    audio._surface = surface;
    audio._stepSide = -audio._stepSide;
    const s = clamp(+strength || 0.6, 0.1, 1.8);
    // Player：走路 0.65、衝刺 1、蹲著走 0.35、落地 1.4
    const sprint = s >= 0.95, land = s >= 1.3, soft = s < 0.5;
    const g = (STEP[key] ?? 0.9) * Math.pow(s / 0.65, 0.75) * 0.36;
    audio.bank.play(id, { pan: audio._stepSide * 0.07, dist: 0.6, gain: g, rate: rnd(0.95, 1.05) * (sprint && !land ? 1.04 : 1), wet: 0.9, lp: soft ? 3200 : 0 });
    if (land) audio.bank.play(id, { t: audio.ctx.currentTime + rnd(0.04, 0.07), pan: -audio._stepSide * 0.07, dist: 0.6, gain: g * 0.7, rate: rnd(0.88, 0.94), wet: 0.9 });
    const now = audio.ctx.currentTime;
    // 寺廟的老木地板：偶爾被踩出一聲吱嘎（錄音），不會連續出現；樓梯上更常吱嘎
    const stairs = key === 'wood' && onStairs();
    if (key === 'wood' && audio.profile !== 'home' && has('foley.creak.floor') && now - st.lastStepCreak > (stairs ? 1.1 : 2.5) && Math.random() < (stairs ? 0.38 : 0.13)) {
      st.lastStepCreak = now;
      audio.bank.play('foley.creak.floor', { t: now + 0.04, pan: audio._stepSide * 0.25, dist: 1.1, gain: rnd(0.3, 0.55), wet: 1 });
    }
    // 衝刺：鞋底蹭地
    if (sprint && has('foley.scuff') && now - st.lastScuff > 1.2 && Math.random() < 0.18) {
      st.lastScuff = now;
      audio.bank.play('foley.scuff', { t: now + 0.05, pan: audio._stepSide * 0.1, dist: 0.7, gain: 0.5, wet: 0.7 });
    }
  });

  audio.override('creak', (orig, t, o = {}) => {
    if (!audio.ctx) return;
    if (o._orig) return orig(t, o);
    const { pan = 0, dist = 1.5, gain = 1, amb = false } = o;
    const id = dist < 3 && has('foley.creak.floor') ? 'foley.creak.floor' : 'foley.creak.long';
    if (!has(id)) return orig(t, o);
    if (amb && t !== undefined) ambShot(id, { t, pan, dist, gain: 0.75 * gain, wet: 1.3 });
    else audio.bank.play(id, { t, pan, dist, gain: 0.75 * gain, wet: 1.2 });
    orig(t, { pan, dist, gain: 0.35 * gain, amb }); // 原本的程序化吱嘎（黏滑顫動）疊在下面
  });

  audio.override('click', (orig) => {
    if (!audio.ctx) return;
    if (!has('foley.click')) return orig();
    audio.bank.play('foley.click', { dist: 0.3, pan: 0.15, gain: 0.9, wet: 0.4 });
  });

  /** 廟鐘：錄音的大銅鐘 + 原本的程序化鐘聲（基頻 147 Hz 正好落在錄音的第一泛音上）壓在底下 */
  audio.override('bell', (orig, vol = 1, t, o = {}) => {
    if (!audio.ctx) return;
    if (!has('foley.bell') || o.wrong) return orig(vol, t, o);
    const pan = o.pan ?? rnd(-0.6, 0.6), dist = o.dist ?? 22;
    if (t !== undefined) ambShot('foley.bell', { t, pan, dist, gain: 2.1 * vol, wet: 1.6, rate: rnd(0.985, 1.01) });
    else audio.bank.play('foley.bell', { pan, dist, gain: 2.1 * vol, wet: 1.6, rate: rnd(0.985, 1.01) });
    orig(0.35 * vol, t, { ...o, pan, dist });
  });

  /** 木魚：同一段敲擊只用一個木魚；t 有給＝環境事件（走環境匯流排），沒給＝劇情提示（寺廟裡從古戲台的方向傳來） */
  function woodfishRun(count, t, { dist = 9, gain = 0.6, amb = false, pan = 0 } = {}) {
    const small = Math.random() < 0.25 && has('foley.woodfish.small');
    const id = small ? 'foley.woodfish.small' : 'foley.woodfish';
    const gap = rnd(0.62, 0.87), t0 = Math.max(audio.ctx.currentTime, t ?? audio.ctx.currentTime) + 0.2;
    // 原本程序化木魚的正弦「叩」（640→430 Hz）跟著錄音的節奏、很輕地疊在下面，補空殿裡的共鳴
    const v = audio._voice({ t: t0, dur: count * gap + 0.5, pan, dist, gain: 0.55 * 0.3 * gain / 0.62, wet: 1.4, amb });
    for (let i = 0; i < count; i++) {
      const at = t0 + i * gap * rnd(0.98, 1.02), g = gain * (i === count - 1 ? 0.8 : rnd(0.9, 1.05));
      if (amb) ambShot(id, { t: at, pan, dist, gain: g * 1.4, wet: 1.4 });
      else audio.bank.play(id, { t: at, pan, dist, gain: g * 1.4, wet: 1.4 });
      const o = audio._o(v, 'sine', 640, at, 0.2), og = audio._g(v);
      o.frequency.setValueAtTime(640, at); o.frequency.exponentialRampToValueAtTime(430, at + 0.07);
      o.connect(og).connect(v.bus); og.gain.setValueAtTime(0.0001, at); og.gain.linearRampToValueAtTime(0.8 * g / gain, at + 0.004); og.gain.exponentialRampToValueAtTime(0.0001, at + 0.154);
    }
    return t0 + count * gap;
  }
  audio.override('woodenFish', (orig, count = 4, t) => {
    if (!audio.ctx) return;
    if (!has('foley.woodfish')) return orig(count, t);
    const amb = t !== undefined;
    const pan = amb ? rnd(-0.8, 0.8) : (mapKey() === 'temple' && game() ? panTo(STAGE.x, STAGE.z) : rnd(-0.8, 0.8));
    const dist = amb ? 9 : clamp(distTo(STAGE.x, STAGE.z) * 0.4, 6, 14);
    woodfishRun(count, t, { dist, gain: 0.62, amb, pan });
  });

  /** 手機來電：原創鈴聲（兩輪）＋機身在桌面上震動 */
  audio.override('phoneRing', (orig) => {
    if (!ok()) return;
    if (!has('foley.ringtone')) return orig();
    const t = audio.ctx.currentTime + 0.02;
    audio.bank.play('foley.ringtone', { t, pan: 0.3, dist: 1.2, gain: 0.95, wet: 0.5 });
    audio.bank.play('foley.ringtone', { t: t + 1.9, pan: 0.3, dist: 1.2, gain: 0.95, wet: 0.5 });
    if (has('foley.vibrate')) { audio.bank.play('foley.vibrate', { t, pan: 0.3, dist: 1.2, gain: 0.8, wet: 0.4 }); audio.bank.play('foley.vibrate', { t: t + 1.9, pan: 0.3, dist: 1.2, gain: 0.8, wet: 0.4 }); }
  });

  /** 住處的門：管理員（？）的拳頭敲在實心門板上 */
  audio.override('doorKnock', (orig, strength = 1) => {
    if (!ok()) return;
    const id = has('foley.knock.door') ? 'foley.knock.door' : has('foley.knock') ? 'foley.knock' : null;
    if (!id) return orig(strength);
    audio.bank.play(id, { pan: 0.1, dist: 1.5, gain: 1.05 * strength, wet: 1.4, rate: rnd(0.97, 1.03) });
  });

  // ───────────────────────── 覆寫：恐怖導演的聲音 ─────────────────────────

  /** 身後多出來的一步：當下材質的錄音，重一點、慢半拍，放在聽者正後方，最後鞋底拖一下 */
  audio.override('_k_stepBehind', (orig, a) => {
    const key = audio._surface === 'wood' && audio.profile === 'home' ? 'floor' : audio._surface;
    const id = 'foley.step.' + key;
    if (!has(id)) return orig(a);
    const { pan, dist, I } = a;
    const d = clamp(dist, 0.6, 6) * 0.6;
    audio.bank.play(id, { pan, dist: d, gain: 1.15 * (STEP[key] ?? 0.9) * 0.5 * I, rate: rnd(0.88, 0.94), wet: 0.8, hrtf: true, behind: true, near: 0.75 });
    if (has('foley.scuff')) audio.bank.play('foley.scuff', { t: audio.ctx.currentTime + 0.12, pan, dist: d, gain: 0.3 * I, rate: rnd(0.85, 0.95), wet: 0.8, hrtf: true, behind: true, near: 0.75 });
  });

  function knockAt(t, s, a) {
    audio.bank.play('foley.knock', { t, pan: a.pan, dist: a.dist, gain: 0.78 * a.I * s, rate: rnd(0.96, 1.04), wet: 1.2 });
  }
  /** 三下輕敲：叩、叩、叩——第三下慢一點、輕一點 */
  audio.override('_k_knock', (orig, a) => {
    if (!has('foley.knock')) return orig(a);
    const t = audio.ctx.currentTime;
    knockAt(t, 1, a); knockAt(t + rnd(0.3, 0.36), 0.9, a); knockAt(t + rnd(0.7, 0.8), 0.68, a);
  });
  audio.override('_k_knock1', (orig, a) => { if (!has('foley.knock')) return orig(a); knockAt(audio.ctx.currentTime, 1, a); });

  audio.override('_k_scrape', (orig, a) => {
    if (!has('foley.scrape')) return orig(a);
    audio.bank.play('foley.scrape', { pan: a.pan, dist: a.dist, gain: 1.25 * a.I, wet: 1 });
  });

  /** 遠處的門被甩上：錄音 + 原本合成的低頻悶響（給重量） */
  audio.override('_k_slam', (orig, a) => {
    if (!has('foley.slam')) return orig(a);
    audio.bank.play('foley.slam', { pan: a.pan, dist: a.dist + 9, gain: 3.4 * a.I, wet: 1.7 });
    orig({ pan: a.pan, dist: a.dist, I: a.I * 0.35 });
  });

  audio.override('_k_drip', (orig, a) => {
    if (!has('foley.drip')) return orig(a);
    audio.bank.play('foley.drip', { pan: a.pan, dist: a.dist, gain: 0.85 * a.I, wet: 1.5 });
  });

  /** 遠處單聲鐘：同一口鐘放慢（更低），音高再慢慢往下滑；原本合成的「不對的泛音」疊在上面 */
  audio.override('_k_bellFar', (orig, a) => {
    if (!has('foley.bell')) return orig(a);
    const r = audio.bank.play('foley.bell', { pan: a.pan || rnd(-0.5, 0.5), dist: a.dist + 20, gain: 3.2 * a.I, wet: 1.8, rate: rnd(0.76, 0.82) });
    if (r?.src?.detune) { const t = audio.ctx.currentTime; r.src.detune.setValueAtTime(0, t + 0.5); r.src.detune.linearRampToValueAtTime(-45, t + 6); }
    audio.bell(0.6 * a.I, undefined, { pan: a.pan || rnd(-0.5, 0.5), dist: a.dist + 20, base: rnd(108, 124), wrong: 1 });
  });

  /** 樓上的彈珠：落在木地板上越彈越密，最後滾走——從頭頂傳下來 */
  audio.override('_k_marble', (orig, a) => {
    if (!has('foley.marble')) return orig(a);
    audio.bank.play('foley.marble', { pan: a.pan, dist: a.dist + 2, gain: 1.6 * a.I, wet: 0.8, hrtf: true, above: 2.2, lp: 3200 });
  });

  audio.override('_k_static', (orig, a) => {
    if (!has('foley.static')) return orig(a);
    audio.bank.play('foley.static', { pan: a.pan, dist: Math.min(a.dist, 4) * 0.5, gain: 0.75 * a.I, wet: 0.3 });
  });

  /** 狗吹螺 */
  audio.override('_k_howl', (orig, a) => {
    if (!has('foley.howl')) return orig(a);
    audio.bank.play('foley.howl', { pan: a.pan || rnd(-0.8, 0.8), dist: a.dist + 30, gain: 3.4 * a.I, wet: 2.4 });
  });

  // ───────────────────────── finaleAudio.js / setpieces/synth.js 的錄音版 ─────────────────────────
  // 原檔在函式開頭呼叫 audio.foley.fin('名稱', ...參數)：回傳 true＝錄音已經播了（不再跑合成）；false＝沒有素材或要和合成疊在一起。
  const play = (id, o) => audio.bank.play(id, o);
  let dawn = null, synthStatic = null, synthGrind = null;
  const FIN = {
    /** 結局：門後的火——兩條錯開的錄音循環（門板悶住），原本合成的低頻轟響留在底下給重量 */
    fireBuild(a, out) {
      const buf = a.bank?.buffer('foley.fire'); if (!buf) return null;
      const ctx = a.ctx, nodes = [];
      const door = ctx.createBiquadFilter(); door.type = 'lowpass'; door.frequency.value = 3400; door.Q.value = 0.5; nodes.push(door);
      for (const [rate, off, pan, gain] of [[1, 0, -0.35, 1.6], [0.93, buf.duration * 0.5, 0.35, 1.4]]) {
        const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate;
        const g = ctx.createGain(); g.gain.value = gain;
        const p = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain(); if (p.pan) p.pan.value = pan;
        s.connect(g).connect(p).connect(door); s.start(0, off); nodes.push(s, g, p);
      }
      const roar = ctx.createBufferSource(); roar.buffer = a.brown; roar.loop = true; roar.playbackRate.value = 0.8; roar.start();
      const rl = ctx.createBiquadFilter(); rl.type = 'lowpass'; rl.frequency.value = 220; rl.Q.value = 0.8;
      const rg = ctx.createGain(); rg.gain.value = 0.32;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.37; const ld = ctx.createGain(); ld.gain.value = 0.25; lfo.connect(ld).connect(rg.gain); lfo.start();
      roar.connect(rl).connect(rg).connect(door); nodes.push(roar, rl, rg, lfo, ld);
      door.connect(out); out.connect(a.fxBus); const w = ctx.createGain(); w.gain.value = 0.35; out.connect(w).connect(a.revSend); nodes.push(w);
      return nodes;
    },
    /** 鑰匙燙手的滋滋聲（錄音循環） */
    sizzleBuild(a, out) {
      const buf = a.bank?.buffer('foley.sizzle'); if (!buf) return null;
      const s = a.ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(0, Math.random() * buf.duration);
      const g = a.ctx.createGain(); g.gain.value = 1.4;
      s.connect(g).connect(out); out.connect(a.fxBus);
      return [s, g];
    },
    pop(pan = 0, s = 1) { if (!has('foley.firepop')) return false; play('foley.firepop', { pan, dist: 3, gain: 1.1 * s, wet: 1.5, lp: 5000 }); return true; },
    /** 小孩的拳頭敲門（門後）：同一組指節敲門的錄音，小一點、悶一點 */
    knockSmall(s = 1, pan = 0, dist = 1.4) { if (!has('foley.knock')) return false; play('foley.knock', { pan, dist, gain: 0.9 * s, rate: rnd(1.06, 1.16), lp: 2400, wet: 1.3 }); return true; },
    /** 大人拍門：錄音的重擊；原本合成的低頻與門閂金屬聲照樣疊上（回傳 false） */
    bang(s = 1, pan = 0, dist = 3) { if (has('foley.bang')) play('foley.bang', { pan, dist, gain: 1.7 * s, wet: 1.6, rate: rnd(0.94, 1.04) }); return false; },
    /** 燈熄：吹熄燭火的錄音；合成的燈絲斷掉一聲照樣疊上 */
    snuff(pan = 0, dist = 4) { if (has('foley.snuff')) play('foley.snuff', { pan, dist, gain: 1.25, wet: 1.4, hrtf: true }); return false; },
    clunk() { if (!has('foley.lock')) return false; play('foley.lock', { dist: 0.8, gain: 1.5, wet: 1.6 }); return true; },
    /** 長長的開門聲：舊木門的門軸（錄音依長度調速），長的再接一段木頭被壓出來的吱嘎 */
    creakLong(dur = 4, pan = 0, dist = 2) {
      if (!has('foley.door.creak')) return false;
      const len = audio.bank.buffer('foley.door.creak')?.duration || 3;
      play('foley.door.creak', { pan, dist, gain: 1.3, wet: 1.4, rate: clamp(len / dur, 0.65, 1.25) });
      if (dur > 2.4 && has('foley.creak.long')) play('foley.creak.long', { t: audio.ctx.currentTime + dur * rnd(0.4, 0.55), pan: pan + rnd(-0.15, 0.15), dist, gain: 0.7, wet: 1.4 });
      return true;
    },
    /** 黎明的鳥叫：錄音的晨間合唱（環境匯流排）；合成的啁啾大多省掉 */
    birds(on) {
      if (!has('foley.bed.dawn')) return false;
      if (on) { if (!dawn?.playing) dawn = audio.bank.loop('foley.bed.dawn', { gain: 0.0001 }); dawn?.setGain(1.1, 1.2); }
      else if (dawn) { dawn.stop(2.5); dawn = null; }
      return false;
    },
    chirp() { return !!dawn?.playing && Math.random() < 0.85; },
    vibrate() { if (!has('foley.vibrate')) return false; play('foley.vibrate', { dist: 0.6, gain: 1.0, wet: 0.5, pan: 0.2, dur: 0.75 }); return true; },
    drag(dur = 1.2) { if (!has('foley.drag')) return false; play('foley.drag', { dist: 0.5, gain: 1.35, wet: 1, dur: Math.min(dur, 3.0) }); return true; },
    cloth() { if (!has('foley.cloth')) return false; play('foley.cloth', { dist: 0.2, gain: 1.15, wet: 0.4 }); return true; },

    // ── 寺內恐怖段落（setpieces/synth.js） ──
    /** 木地板上的一步（light：小孩光腳）：木地板腳步錄音，小孩的調高、悶一點 */
    thud({ pan = 0, dist = 4, delay = 0, gain = 1, light = false } = {}) {
      if (!has('foley.step.wood')) return false;
      play('foley.step.wood', { t: audio.ctx.currentTime + delay, pan, dist, gain: gain * (light ? 0.95 : 1.4), rate: light ? rnd(1.15, 1.28) : rnd(0.9, 0.97), lp: light ? 3800 : 2600, wet: 1.2 });
      return true;
    },
    wetStep({ pan = 0, dist = 4, delay = 0, gain = 1 } = {}) {
      if (!has('foley.step.wet')) return false;
      play('foley.step.wet', { t: audio.ctx.currentTime + delay, pan, dist, gain: gain * 1.5, rate: rnd(0.9, 1.0), wet: 1.1 });
      return true;
    },
    /** 石頭裂開：錄音的岩石裂聲，合成的低頻悶響照樣疊上 */
    crack({ pan = 0, dist = 5, delay = 0, gain = 1 } = {}) {
      if (has('foley.crack')) play('foley.crack', { t: audio.ctx.currentTime + delay, pan, dist, gain: gain * 1.6, wet: 1.4 });
      return false;
    },
    /** 布被拉動 */
    rustle({ pan = 0, dist = 3, delay = 0, gain = 1, dur = 0.9 } = {}) {
      if (!has('foley.cloth')) return false;
      play('foley.cloth', { t: audio.ctx.currentTime + delay, pan, dist, gain: gain * 1.3, wet: 0.9, dur: Math.max(0.3, Math.min(dur, 1.1)) });
      return true;
    },
    /** 手機在木頭上震動 n 下 */
    buzz({ pan = 0, dist = 6, delay = 0, gain = 1, n = 3 } = {}) {
      if (!has('foley.vibrate')) return false;
      const t = audio.ctx.currentTime + delay;
      for (let k = 0; k < n; k++) play('foley.vibrate', { t: t + k * 0.7, pan, dist, gain: gain * 1.0, wet: 0.8, dur: 0.42, lp: 2500 });
      return true;
    },
    /** 阿哲手機的雜訊（持續）：錄音帶底噪的循環 */
    static(level) {
      if (!has('foley.tape')) return false;
      const v = clamp(level);
      if (!synthStatic?.playing) { if (v <= 0.001) return true; synthStatic = audio.bank.loop('foley.tape', { gain: 0.0001, pan: 0.35, bus: 'fx', hp: 300 }); synthStatic.last = -1; }
      if (synthStatic && Math.abs(v - synthStatic.last) >= 0.02) { synthStatic.last = v; synthStatic.setGain(v * v * 1.1, 0.08); }
      return true;
    },
    /** 羅漢移動：石塊摩擦的錄音循環，越用力越大聲、越低沉 */
    grind(level, pan = 0, dist = 4) {
      if (!has('foley.grind')) return false;
      const v = clamp(level) / (1 + dist * 0.12);
      if (!synthGrind?.playing) { if (v <= 0.001) return true; synthGrind = audio.bank.loop('foley.grind', { gain: 0.0001, bus: 'fx', wet: 0.5 }); synthGrind.last = -1; synthGrind.lastPan = 9; }
      if (!synthGrind) return true;
      if (Math.abs(v - synthGrind.last) > 0.015) { synthGrind.last = v; synthGrind.setGain(v * 1.5, 0.06); synthGrind.setRate(0.9 + 0.2 * v, 0.2); }
      if (Math.abs(pan - synthGrind.lastPan) > 0.05) { synthGrind.lastPan = pan; synthGrind.setPan(pan, 0.08); }
      return true;
    },
    synthSilence() { for (const h of [synthStatic, synthGrind]) if (h?.playing) { h.setGain(0, 0.05); h.last = 0; } return false; },
    synthDispose() { for (const h of [synthStatic, synthGrind]) h?.stop(0.2); synthStatic = synthGrind = null; return false; },
  };
  audio.foley.fin = (name, ...args) => {
    const f = FIN[name]; if (!f || !audio.ctx || !audio.bank) return false;
    try { return f(...args); } catch (err) { console.warn('[foley] fin failed', name, err); return false; }
  };

  return {
    get state() {
      return {
        map: st.map, space: st.space, zone: st.zone, floor: st.floor, chapter: st.chapter, phase: st.phase, layers: st.layerKey,
        beds: [...st.beds.values()].map((b) => ({ key: b.key, id: b.id, gain: +b.cur.toFixed(3), lp: Math.round(b.curLp), playing: b.h.playing })),
        chant: !!st.chant, nextChant: +(st.nextChant - (audio._t || 0)).toFixed(1), live: live.size,
      };
    },
    ambShot, BEDS, LAYERS,
    /** 測試用：下一次 update 就開始誦經（仍須在殿內、沒有被抽空） */
    forceChant() { st.nextChant = 0; st.phase = ''; },
  };
}
