/**
 * 寺內恐怖段落的程序化聲音（Web Audio，無錄音素材）。
 * 一次性的聲音走 AudioSys 的 Voice（距離低通、方位、乾聲進 fxBus、濕聲進殘響），
 * 兩個持續的聲音（阿哲手機的雜訊、羅漢移動的石頭摩擦）在第一次用到時建立一次，之後只改增益。
 *
 * speak(pinyin, opts)：以共振峰合成「聽起來像在說話」的聲音（小孩耳語、遠處女人叫名字、紅布底下的一聲「有」）。
 * 字幕才是台詞本身；這裡負責音高起伏、節奏與位置，讓玩家聽得出是誰、從哪裡。
 */
const VOW = { a: [850, 1220, 2810], o: [560, 880, 2580], e: [540, 1300, 2500], i: [300, 2280, 3000], u: [330, 760, 2380], v: [300, 1880, 2420], n: [300, 1650, 2650], g: [320, 1050, 2450], r: [480, 1350, 1700], z: [420, 1500, 2600] };
const INITIALS = ['zh', 'ch', 'sh', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x', 'r', 'z', 'c', 's', 'y', 'w'];
// 子音：[帶通中心, Q, 長度, 音量, 是否送氣]
const CONS = {
  s: [6400, 1.6, 0.1, 0.55], x: [4700, 1.7, 0.1, 0.5], sh: [3100, 1.5, 0.1, 0.5], f: [5200, 0.6, 0.07, 0.3], h: [1500, 0.6, 0.08, 0.35],
  z: [6000, 1.4, 0.05, 0.4], zh: [3200, 1.4, 0.05, 0.4], j: [4500, 1.5, 0.05, 0.4], c: [6000, 1.3, 0.09, 0.5], ch: [3100, 1.3, 0.09, 0.5], q: [4500, 1.4, 0.09, 0.5],
  b: [900, 1, 0.02, 0.35], d: [3000, 1, 0.02, 0.35], g: [1800, 1, 0.025, 0.35], p: [900, 0.8, 0.05, 0.45], t: [3200, 0.8, 0.05, 0.45], k: [1900, 0.8, 0.06, 0.45],
};
const TONE = { 1: [1.12, 1.12, 1.1], 2: [0.9, 1.0, 1.22], 3: [0.88, 0.74, 0.86], 4: [1.25, 1.05, 0.78], 5: [0.92, 0.88, 0.86] };
const WHO = { child: { f0: 300, fs: 1.2, breath: 0.32 }, woman: { f0: 205, fs: 1.0, breath: 0.26 }, man: { f0: 112, fs: 0.86, breath: 0.22 } };

function parseSyllable(tok) {
  const m = /^([a-zü]+)([1-5]?)$/.exec(tok.toLowerCase()); if (!m) return null;
  let body = m[1].replace('ü', 'v'); const tone = +(m[2] || 5);
  let c = ''; for (const ini of INITIALS) if (body.startsWith(ini)) { c = ini; break; }
  let fin = body.slice(c.length);
  if (['zh', 'ch', 'sh', 'r', 'z', 'c', 's'].includes(c) && fin === 'i') fin = 'z';
  if (['j', 'q', 'x', 'y'].includes(c) && fin.startsWith('u')) fin = 'v' + fin.slice(1);
  fin = fin.replace(/^iu$/, 'iou').replace(/^ui$/, 'uei').replace(/^un$/, 'uen').replace(/^vn$/, 'ven').replace(/^ie$/, 'ie').replace(/^ian$/, 'ien');
  if (c === 'y' && !/^[iv]/.test(fin)) fin = 'i' + fin;
  if (c === 'w' && !fin.startsWith('u')) fin = 'u' + fin;
  const v = [];
  for (let i = 0; i < fin.length; i++) {
    const ch = fin[i];
    if (ch === 'n' && fin[i + 1] === 'g') { v.push('g'); i++; continue; }
    if (VOW[ch]) v.push(ch);
  }
  if (!v.length) v.push('e');
  const len = (tone === 5 ? 0.15 : 0.22 + 0.045 * (v.length - 1)) + (tone === 3 ? 0.04 : 0);
  return { c: c === 'y' || c === 'w' ? '' : c, nasal: c === 'm' || c === 'n' || c === 'l' || c === 'r', v, tone, len };
}

export function createSynth(game) {
  const a = game.audio;
  const cache = new Map();
  let grind = null, stat = null;
  const ready = () => !!(a && a.ctx && a.running && a.white && typeof a._voice === 'function');
  const now = () => a.ctx.currentTime;

  function sylls(py) {
    let s = cache.get(py);
    if (!s) { s = py.trim().split(/\s+/).map(parseSyllable).filter(Boolean); cache.set(py, s); }
    return s;
  }

  const S = {
    get ready() { return ready(); },

    /**
     * 說一句話。py：空白分隔的拼音加聲調（'zhao3 dao4 ni3 le5'）。
     * who：child / woman / man；whisper：耳語（只有氣聲）；hrtf + behind：貼在身後；muffle：隔著布或門。
     * hold：最後一個音拉長的秒數（遠處喊人時用）。回傳這句話的長度（秒）。
     */
    speak(py, { who = 'child', whisper = false, pan = 0, dist = 2, gain = 1, delay = 0, hrtf = false, behind = false, rate = 1, muffle = false, hold = 0, pitch = 1, wet = 1 } = {}) {
      const list = sylls(py);
      let total = 0; for (const x of list) total += x.len / rate; total += hold;
      if (!ready() || !list.length) return total;
      const rec = a.vox?.speakS?.(py, { who, whisper, pan, dist, gain, delay, hrtf, behind, rate, muffle, hold, pitch, wet }); if (rec) return rec; // 有錄音（vox 組）就播錄音
      const W = WHO[who] || WHO.child, f0 = W.f0 * pitch, fs = W.fs;
      const v = a._voice({ t: now() + delay, dur: total + 0.35, pan, dist, gain: gain * (whisper ? 2.2 : 1.1), wet, hrtf, behind, near: hrtf ? 0.65 : 0, lp: muffle ? 1500 : 0 });
      const t0 = v.t;
      const osc = a._o(v, 'sawtooth', f0, t0, total + 0.3);
      const noise = a._n(v, a.white, t0, total + 0.3);
      const vg = a._g(v, whisper ? 0 : 0.5), ng = a._g(v, whisper ? 1 : W.breath);
      const env = a._g(v, 0);
      const F = [0, 1, 2].map((k) => { const f = a._f(v, 'bandpass', VOW.e[k] * fs, [7, 11, 13][k]); const g = a._g(v, [1, 0.55, 0.28][k] * (whisper ? 1.6 : 1)); f.connect(g).connect(env); return f; });
      osc.connect(vg); noise.connect(ng);
      for (const f of F) { vg.connect(f); ng.connect(f); }
      env.connect(v.bus);
      // 子音
      const cn = a._n(v, a.white, t0, total + 0.3), cf = a._f(v, 'bandpass', 3000, 1), cg = a._g(v, 0);
      cn.connect(cf).connect(cg).connect(v.bus);
      let t = t0, fq = osc.frequency, eg = env.gain;
      eg.setValueAtTime(0.0001, t0);
      fq.setValueAtTime(f0, t0);
      for (const sy of list) {
        const L = sy.len / rate, tc = TONE[sy.tone] || TONE[5], jit = 1 + (Math.random() - 0.5) * 0.04;
        const C = CONS[sy.c];
        if (C) {
          cf.frequency.setValueAtTime(C[0] * (who === 'child' ? 1.1 : 1), t); cf.Q.setValueAtTime(C[1], t);
          cg.gain.setValueAtTime(0.0001, t); cg.gain.linearRampToValueAtTime(C[3] * (whisper ? 1.3 : 1), t + Math.min(0.02, C[2] * 0.3)); cg.gain.linearRampToValueAtTime(0.0001, t + C[2]);
        }
        const vs = t + (C ? C[2] * 0.7 : 0), ve = t + L;
        // 音高
        fq.linearRampToValueAtTime(f0 * tc[0] * jit, vs + 0.01); fq.linearRampToValueAtTime(f0 * tc[1] * jit, (vs + ve) / 2); fq.linearRampToValueAtTime(f0 * tc[2] * jit, ve);
        // 共振峰
        const n = sy.v.length;
        if (sy.nasal) for (let k = 0; k < 3; k++) F[k].frequency.setValueAtTime(VOW.n[k] * fs, t);
        for (let i = 0; i < n; i++) { const tv = vs + ((ve - vs) * (i + 0.5)) / n, V = VOW[sy.v[i]]; for (let k = 0; k < 3; k++) F[k].frequency.linearRampToValueAtTime(V[k] * fs, tv); }
        // 音量：每個字之間有一點縫
        eg.linearRampToValueAtTime(sy.nasal ? 0.35 : 0.08, vs); eg.linearRampToValueAtTime(1, vs + 0.035); eg.linearRampToValueAtTime(0.8, ve - 0.03); eg.linearRampToValueAtTime(0.15, ve);
        t = ve;
      }
      if (hold > 0) { eg.linearRampToValueAtTime(0.9, t + 0.05); eg.linearRampToValueAtTime(0.5, t + hold * 0.7); fq.linearRampToValueAtTime(f0 * 0.8, t + hold); }
      eg.linearRampToValueAtTime(0.0001, t + hold + 0.12);
      return total;
    },

    /** 壓低的小孩笑聲 */
    giggle({ pan = 0, dist = 4, delay = 0, gain = 0.7, muffle = true } = {}) {
      if (ready() && a.vox?.has?.('giggle')) { const d = a.vox.play('giggle', { t: now() + delay, pan, dist, gain: gain * 1.1, wet: 1.3, lp: muffle ? 1800 : 0 }); if (d) return d; } // 真人小孩竊笑
      return S.speak('hi1 hi1 hi4 hi1 hi5', { who: 'child', pan, dist, delay, gain, rate: 2.4, muffle, pitch: 1.3, whisper: Math.random() < 0.5 });
    },

    /** 小孩光腳跑在木地板上：n 步，從 dist0 跑到 dist1 */
    childSteps({ pan0 = 0, pan1 = 0, dist0 = 2, dist1 = 9, n = 6, delay = 0, gap = 0.17, gain = 0.8 } = {}) {
      if (!ready()) return;
      for (let i = 0; i < n; i++) {
        const u = i / Math.max(1, n - 1);
        S.thud({ pan: pan0 + (pan1 - pan0) * u, dist: dist0 + (dist1 - dist0) * u, delay: delay + i * gap * (0.85 + Math.random() * 0.3), gain: gain * (1 - 0.3 * u), light: true });
      }
    },

    /** 木地板上的一步（light：小孩） */
    thud({ pan = 0, dist = 4, delay = 0, gain = 1, light = false } = {}) {
      if (!ready() || a.foley?.fin?.('thud', { pan, dist, delay, gain, light })) return; // 有錄音（foley 組）就用錄音
      const v = a._voice({ t: now() + delay, dur: 0.3, pan, dist, gain: gain * 1.6, wet: 1.2 }), t = v.t;
      const n = a._n(v, a.white, t, 0.25), lp = a._f(v, 'lowpass', light ? 520 : 340, 0.8), g = a._g(v);
      n.connect(lp).connect(g).connect(v.bus);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(light ? 0.5 : 0.8, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + (light ? 0.09 : 0.14));
      const o = a._o(v, 'sine', light ? 120 : 82, t, 0.18), og = a._g(v);
      o.frequency.exponentialRampToValueAtTime(light ? 70 : 50, t + 0.12);
      o.connect(og).connect(v.bus); og.gain.setValueAtTime(0.0001, t); og.gain.linearRampToValueAtTime(light ? 0.25 : 0.45, t + 0.006); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      const c = a._n(v, a.white, t, 0.05), bp = a._f(v, 'bandpass', light ? 2600 : 1700, 1.4), cg = a._g(v);
      c.connect(bp).connect(cg).connect(v.bus); cg.gain.setValueAtTime(0.0001, t); cg.gain.linearRampToValueAtTime(0.12, t + 0.002); cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    },

    /** 濕的赤腳：腳跟的悶響、腳掌拍在地上、離地時黏答答的一聲 */
    wetStep({ pan = 0, dist = 4, delay = 0, gain = 1 } = {}) {
      if (!ready() || a.foley?.fin?.('wetStep', { pan, dist, delay, gain })) return;
      const v = a._voice({ t: now() + delay, dur: 0.42, pan, dist, gain: gain * 1.9, wet: 1.1 }), t = v.t;
      const n = a._n(v, a.brown, t, 0.3), lp = a._f(v, 'lowpass', 280, 0.7), g = a._g(v);
      n.connect(lp).connect(g).connect(v.bus); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.9, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      const s = a._n(v, a.white, t, 0.3), bp = a._f(v, 'bandpass', 1900, 1.1), sg = a._g(v);
      s.connect(bp).connect(sg).connect(v.bus); sg.gain.setValueAtTime(0.0001, t + 0.03); sg.gain.linearRampToValueAtTime(0.42, t + 0.034); sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.085);
      const q = a._n(v, a.white, t, 0.3), qf = a._f(v, 'bandpass', 600, 4), qg = a._g(v);
      q.connect(qf).connect(qg).connect(v.bus); qf.frequency.setValueAtTime(600, t + 0.12); qf.frequency.exponentialRampToValueAtTime(1500, t + 0.2);
      qg.gain.setValueAtTime(0.0001, t + 0.12); qg.gain.linearRampToValueAtTime(0.32, t + 0.135); qg.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      if (Math.random() < 0.35) { const o = a._o(v, 'sine', 1900, t + 0.26, 0.06), og = a._g(v); o.frequency.exponentialRampToValueAtTime(820, t + 0.3); o.connect(og).connect(v.bus); og.gain.setValueAtTime(0.0001, t + 0.26); og.gain.linearRampToValueAtTime(0.06, t + 0.262); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.31); }
    },

    /** 大鼓從裡面被碰了一下 */
    drum({ pan = 0, dist = 4, delay = 0, gain = 1 } = {}) {
      if (!ready()) return;
      const v = a._voice({ t: now() + delay, dur: 1.1, pan, dist, gain: gain * 2, wet: 1.6 }), t = v.t;
      const o = a._o(v, 'sine', 78, t, 1), og = a._g(v); o.frequency.exponentialRampToValueAtTime(48, t + 0.5);
      o.connect(og).connect(v.bus); og.gain.setValueAtTime(0.0001, t); og.gain.linearRampToValueAtTime(0.9, t + 0.006); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      const n = a._n(v, a.brown, t, 0.4), f = a._f(v, 'bandpass', 220, 1.2), g = a._g(v);
      n.connect(f).connect(g).connect(v.bus); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    },

    /** 石頭裂開／佛像轉頭的一聲 */
    crack({ pan = 0, dist = 5, delay = 0, gain = 1 } = {}) {
      if (!ready() || a.foley?.fin?.('crack', { pan, dist, delay, gain })) return; // 錄音的岩石裂聲（合成的低頻照樣疊上）
      const v = a._voice({ t: now() + delay, dur: 0.8, pan, dist, gain: gain * 1.8, wet: 1.4 }), t = v.t;
      const n = a._n(v, a.white, t, 0.3), f = a._f(v, 'bandpass', 2300, 0.9), g = a._g(v);
      n.connect(f).connect(g).connect(v.bus); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.7, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
      const r = a._n(v, a.brown, t, 0.6), rf = a._f(v, 'bandpass', 380, 2.5), rg = a._g(v);
      r.connect(rf).connect(rg).connect(v.bus); rf.frequency.setValueAtTime(380, t); rf.frequency.linearRampToValueAtTime(240, t + 0.45);
      rg.gain.setValueAtTime(0.0001, t + 0.02); rg.gain.linearRampToValueAtTime(0.5, t + 0.06); rg.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      const o = a._o(v, 'sine', 58, t, 0.5), og = a._g(v); o.connect(og).connect(v.bus); og.gain.setValueAtTime(0.0001, t); og.gain.linearRampToValueAtTime(0.6, t + 0.005); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    },

    /** 布被拉動 */
    rustle({ pan = 0, dist = 3, delay = 0, gain = 1, dur = 0.9 } = {}) {
      if (!ready() || a.foley?.fin?.('rustle', { pan, dist, delay, gain, dur })) return;
      const v = a._voice({ t: now() + delay, dur: dur + 0.1, pan, dist, gain: gain * 1.4, wet: 0.9 }), t = v.t;
      const n = a._n(v, a.pink, t, dur), f = a._f(v, 'bandpass', 2400, 0.7), g = a._g(v);
      n.connect(f).connect(g).connect(v.bus);
      g.gain.setValueAtTime(0.0001, t);
      for (let k = 0; k < 5; k++) { const tk = t + (dur * k) / 5; g.gain.linearRampToValueAtTime(0.15 + Math.random() * 0.35, tk + dur / 10); g.gain.linearRampToValueAtTime(0.05, tk + dur / 5); }
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
    },

    /** 手機震動（放在木頭上） */
    buzz({ pan = 0, dist = 6, delay = 0, gain = 1, n = 3 } = {}) {
      if (!ready() || a.foley?.fin?.('buzz', { pan, dist, delay, gain, n })) return;
      const v = a._voice({ t: now() + delay, dur: n * 0.7 + 0.2, pan, dist, gain: gain * 1.2, wet: 0.8 }), t = v.t;
      const o = a._o(v, 'square', 152, t, n * 0.7), f = a._f(v, 'lowpass', 600, 1), g = a._g(v);
      o.connect(f).connect(g).connect(v.bus); g.gain.setValueAtTime(0.0001, t);
      for (let k = 0; k < n; k++) { const tk = t + k * 0.7; g.gain.setValueAtTime(0.0001, tk); g.gain.linearRampToValueAtTime(0.22, tk + 0.02); g.gain.setValueAtTime(0.22, tk + 0.38); g.gain.linearRampToValueAtTime(0.0001, tk + 0.41); }
    },

    /** 手機的雜訊（持續）：level 0..1 */
    setStatic(level) {
      if (!ready() || a.foley?.fin?.('static', level)) return; // 錄音帶底噪的循環（foley 組）
      if (!stat) {
        const ctx = a.ctx, G = (v) => { const g = ctx.createGain(); g.gain.value = v; return g; };
        const hiss = ctx.createBufferSource(); hiss.buffer = a.white; hiss.loop = true;
        const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2200;
        const crk = ctx.createBufferSource(); crk.buffer = a.pink; crk.loop = true; crk.playbackRate.value = 0.6;
        const sh = ctx.createWaveShaper(); const cv = new Float32Array(257); for (let i = 0; i < 257; i++) { const x = (i / 256) * 2 - 1; cv[i] = Math.abs(x) > 0.42 ? Math.sign(x) * (Math.abs(x) - 0.42) * 2.4 : 0; } sh.curve = cv;
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3400; bp.Q.value = 0.8;
        const level = G(0), out = G(1), pan = ctx.createStereoPanner ? ctx.createStereoPanner() : G(1); if (pan.pan) pan.pan.value = 0.35;
        hiss.connect(hp).connect(G(0.35)).connect(level); crk.connect(sh).connect(bp).connect(G(1.4)).connect(level);
        level.connect(pan).connect(out).connect(a.fxBus);
        hiss.start(); crk.start();
        stat = { level, nodes: [hiss, hp, crk, sh, bp, level, out, pan], srcs: [hiss, crk], last: -1 };
      }
      const v = Math.max(0, Math.min(1, level));
      if (Math.abs(v - stat.last) < 0.02) return;
      stat.last = v; stat.level.gain.setTargetAtTime(v * v * 0.16, now(), 0.08);
    },

    /** 石頭摩擦（持續）：level 0..1，pan -1..1 */
    setGrind(level, pan = 0, dist = 4) {
      if (!ready() || a.foley?.fin?.('grind', level, pan, dist)) return; // 石塊摩擦的錄音循環（foley 組）
      if (!grind) {
        const ctx = a.ctx, G = (v) => { const g = ctx.createGain(); g.gain.value = v; return g; };
        const low = ctx.createBufferSource(); low.buffer = a.brown; low.loop = true;
        const lf = ctx.createBiquadFilter(); lf.type = 'bandpass'; lf.frequency.value = 150; lf.Q.value = 1.6;
        const grit = ctx.createBufferSource(); grit.buffer = a.white; grit.loop = true; grit.playbackRate.value = 0.7;
        const gf = ctx.createBiquadFilter(); gf.type = 'bandpass'; gf.frequency.value = 950; gf.Q.value = 5;
        const am = G(0.6), lfo = ctx.createOscillator(); lfo.frequency.value = 9; const lfoG = G(0.4); lfo.connect(lfoG).connect(am.gain);
        const level = G(0), p = ctx.createStereoPanner ? ctx.createStereoPanner() : G(1), wet = G(0.5);
        low.connect(lf).connect(G(2.2)).connect(am); grit.connect(gf).connect(G(0.5)).connect(am);
        am.connect(level).connect(p); p.connect(a.fxBus); p.connect(wet).connect(a.revSend);
        low.start(); grit.start(); lfo.start();
        grind = { level, pan: p, lfo, nodes: [low, lf, grit, gf, am, lfoG, level, p, wet], srcs: [low, grit, lfo], last: -1, lastPan: 9 };
      }
      const v = Math.max(0, Math.min(1, level)) / (1 + dist * 0.12);
      if (Math.abs(v - grind.last) > 0.015) { grind.last = v; grind.level.gain.setTargetAtTime(v * 0.5, now(), 0.06); }
      if (grind.pan.pan && Math.abs(pan - grind.lastPan) > 0.05) { grind.lastPan = pan; grind.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), now(), 0.08); }
      if (grind.lfo) grind.lfo.frequency.setTargetAtTime(6 + v * 10, now(), 0.2);
    },

    /** 停掉兩個持續聲音（保留節點） */
    silence() { a.foley?.fin?.('synthSilence'); if (stat && a.ctx) { stat.level.gain.setTargetAtTime(0, now(), 0.05); stat.last = 0; } if (grind && a.ctx) { grind.level.gain.setTargetAtTime(0, now(), 0.05); grind.last = 0; } },

    dispose() {
      a.foley?.fin?.('synthDispose');
      for (const L of [stat, grind]) {
        if (!L) continue;
        for (const s of L.srcs) { try { s.stop(); } catch { /* 已停 */ } }
        for (const n of L.nodes) { try { n.disconnect(); } catch { /* 忽略 */ } }
      }
      stat = grind = null;
    },
  };
  return S;
}
