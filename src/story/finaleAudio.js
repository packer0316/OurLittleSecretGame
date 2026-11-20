/**
 * 結局（finale）專用的程序合成聲音。全部建立在 game.audio（AudioSys）的一次性音效生命週期上
 * （_voice / _n / _o / _g / _f 與它的噪音緩衝、殘響、匯流排），不修改 AudioSys.js。
 *
 *  speak(拼音, 聲音, 選項)   以共振峰合成的「人聲」：氣音為主、夾一點聲帶，像隔著門板或貼在耳後說話。
 *                           字幕負責意思，聲音負責是誰、從哪裡、有多近。拼音例如 'yi3 an1'。
 *  scream / shriek          美蘭被攔在門外的嘶喊、穿著她的那個東西撲過來時的尖嘯
 *  fire                     火場（門後的悶燒、爆裂、木頭裂開），持續型，level(k) 控制
 *  sizzle                   鑰匙燙手的滋滋聲，持續型
 *  knockSmall / bang        小孩的拳頭敲門、大人拍門
 *  snuff / whump / clunk / creakLong / cough / hum / birds / vibrate / ringback / hangup / drag / cloth / heartbeat
 * 沒有音訊（測試、未初始化）時每個函式都安靜地什麼也不做。
 */
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// 拼音 → 聲母、韻母的共振峰序列、聲調
const VOW = {
  a: [800, 1250, 2600], o: [560, 920, 2500], e: [520, 1260, 2500], E: [470, 1900, 2550], i: [290, 2250, 3000], u: [330, 760, 2300],
  v: [300, 1850, 2300], r: [520, 1350, 1650], z: [380, 1500, 2600], n: [280, 1650, 2600], g: [300, 1100, 2400], I: [400, 2050, 2700],
};
const FINALS = {
  a: 'a', o: 'o', e: 'e', i: 'i', u: 'u', v: 'v', er: 'r', ai: 'ai', ei: 'Ii', ao: 'au', ou: 'ou', an: 'an', en: 'en', ang: 'ag', eng: 'eg', ong: 'ug',
  ia: 'ia', ie: 'iE', iao: 'iau', iu: 'iou', iou: 'iou', ian: 'iEn', in: 'in', iang: 'iag', ing: 'ig', iong: 'vg',
  ua: 'ua', uo: 'uo', uai: 'uai', ui: 'uIi', uei: 'uIi', uan: 'uan', un: 'uen', uen: 'uen', uang: 'uag', ve: 'vE', ue: 'vE', van: 'vEn', vn: 'vn',
};
const TONES = { 1: [1.22, 1.22], 2: [0.95, 1.28], 3: [0.94, 0.76, 0.92], 4: [1.32, 0.8], 0: [1.0, 0.94], 5: [1.0, 0.94] };
const INITIALS = ['zh', 'ch', 'sh', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x', 'r', 'z', 'c', 's', 'y', 'w'];
function parse(syl) {
  const m = /^([a-zü]+)([0-5]?)$/.exec(syl.replace('ü', 'v')); if (!m) return null;
  let s = m[1], tone = +(m[2] || 0), ini = '';
  for (const i of INITIALS) if (s.startsWith(i) && s.length > i.length) { ini = i; s = s.slice(i.length); break; }
  if (ini === 'y') { ini = ''; s = s === 'i' || s.startsWith('i') ? s : s.startsWith('u') ? 'v' + s.slice(1) : 'i' + s; if (s === 'ie') s = 'ie'; }
  else if (ini === 'w') { ini = ''; s = s.startsWith('u') ? s : 'u' + s; }
  if (['j', 'q', 'x'].includes(ini) && s.startsWith('u')) s = 'v' + s.slice(1);
  let f = FINALS[s] || (s.length ? s[0] : 'a');
  if (['zh', 'ch', 'sh', 'r', 'z', 'c', 's'].includes(ini) && s === 'i') f = 'z';
  return { ini, seq: f.split('').map((k) => VOW[k] || VOW.a), nasal: /n|g$/.test(f) ? 1 : 0, tone };
}

// 各個「聲音」：基頻、共振峰比例、聲帶與氣音的比例、說話速度、是不是借來的（借來的聲音有一點拍頻和頓挫）
export const VOICES = {
  self: { f0: 118, fs: 1.0, voiced: 0.45, breath: 0.7, rate: 1 },
  selfChild: { f0: 300, fs: 1.25, voiced: 0.45, breath: 0.6, rate: 0.95 },
  mother: { f0: 205, fs: 1.15, voiced: 0.4, breath: 0.75, rate: 1.1, wrong: 0.6 },
  ahzhe: { f0: 112, fs: 0.98, voiced: 0.55, breath: 0.55, rate: 1, wrong: 0.4 },
  zhihao: { f0: 100, fs: 0.95, voiced: 0.55, breath: 0.5, rate: 0.95, wrong: 0.4 },
  bohan: { f0: 128, fs: 1.02, voiced: 0.5, breath: 0.6, rate: 1.05, wrong: 0.4 },
  peishan: { f0: 228, fs: 1.17, voiced: 0.45, breath: 0.65, rate: 1.05, wrong: 0.5 },
  peishanChild: { f0: 310, fs: 1.27, voiced: 0.45, breath: 0.55, rate: 0.95, wrong: 0.3 },
  child: { f0: 315, fs: 1.28, voiced: 0.5, breath: 0.6, rate: 0.9 },
  childFar: { f0: 320, fs: 1.28, voiced: 0.35, breath: 0.75, rate: 0.85, wrong: 0.2 },
  meilan: { f0: 215, fs: 1.15, voiced: 0.55, breath: 0.55, rate: 1 },
  meilanTrue: { f0: 205, fs: 1.13, voiced: 0.5, breath: 0.7, rate: 0.85 },
  it: { f0: 96, fs: 0.92, voiced: 0.3, breath: 0.9, rate: 1.1, wrong: 1 },
  guo: { f0: 98, fs: 0.95, voiced: 0.5, breath: 0.5, rate: 0.9, tape: 1 },
  rescuer: { f0: 124, fs: 1.0, voiced: 0.75, breath: 0.35, rate: 1.1 },
  phone: { f0: 118, fs: 1.0, voiced: 0.55, breath: 0.45, rate: 1, tape: 1 },
};

export function createFinaleAudio(game) {
  const A = () => game.audio;
  const ok = () => { const a = A(); return !!(a?.ctx && a.running && a._voice); };
  const loops = new Set();

  /** 共振峰合成的一句話。opts：pan、dist、behind、gain、wet、near、scream（拉長嘶喊）、speed */
  function speak(pinyin, voice = 'self', o = {}) {
    if (!ok()) return 0;
    const rec = A().vox?.speakF?.(pinyin, voice, o); if (rec) return rec; // 這句有預先做好的錄音（vox 組，依拼音與聲音對應）就播錄音，否則共振峰合成
    const a = A(), V = typeof voice === 'string' ? VOICES[voice] || VOICES.self : voice;
    const syl = pinyin.trim().split(/\s+/).map(parse).filter(Boolean);
    if (!syl.length) return 0;
    const speed = (o.speed || 1) / (V.rate || 1), scream = o.scream || 0;
    const durs = syl.map((s, i) => (0.2 + 0.05 * s.seq.length + (s.tone === 3 ? 0.05 : 0) + (i === syl.length - 1 ? 0.08 : 0)) * speed * (1 + scream * (i === syl.length - 1 ? 2.2 : 0.4)));
    const total = durs.reduce((s, d) => s + d + 0.035 * speed, 0) + 0.35;
    const v = a._voice({ dur: total + 0.2, pan: o.pan ?? 0, dist: o.dist ?? 1.2, gain: (o.gain ?? 1) * (scream ? 1.25 : 0.9), wet: o.wet ?? 1, hrtf: o.hrtf ?? true, behind: !!o.behind, near: o.near ?? 0.3, lp: V.tape ? 3200 : 0 });
    const t0 = v.t, f0 = V.f0 * (o.pitch || 1) * (1 + scream * 0.9), fs = V.fs;
    const glott = a._o(v, 'sawtooth', f0, t0, total), g2 = V.wrong ? a._o(v, 'sawtooth', f0 * 1.012, t0, total) : null;
    const vib = a._o(v, 'sine', scream ? 6.2 : 4.8, t0, total), vd = a._g(v, scream ? 45 : 6 + (V.wrong || 0) * 10); vib.connect(vd).connect(glott.detune); if (g2) vd.connect(g2.detune);
    const src = a._g(v, 1), vg = a._g(v, V.voiced * (scream ? 1.2 : 1)), bg = a._g(v, V.breath * (scream ? 0.6 : 1));
    const soft = a._f(v, 'lowpass', scream ? 5200 : 3400, 0.6); glott.connect(soft); if (g2) { const gg = a._g(v, 0.55); g2.connect(gg).connect(soft); }
    if (scream) { const sh = a.ctx.createWaveShaper(); const c = new Float32Array(1025); for (let i = 0; i < c.length; i++) { const x = (i / 1024) * 2 - 1; c[i] = Math.tanh(x * 3.2); } sh.curve = c; v.nodes.push(sh); soft.connect(sh).connect(vg); } else soft.connect(vg);
    const noise = a._n(v, a.pink, t0, total); noise.connect(bg);
    vg.connect(src); bg.connect(src);
    const F = [a._f(v, 'bandpass', 500, 6), a._f(v, 'bandpass', 1500, 8), a._f(v, 'bandpass', 2500, 9)], FA = [1, 0.62, 0.32];
    const env = a._g(v, 0);
    F.forEach((f, i) => { const fg = a._g(v, FA[i]); src.connect(f).connect(fg).connect(env); });
    if (V.tape) { const hp = a._f(v, 'highpass', 320, 0.7); env.connect(hp).connect(v.bus); } else env.connect(v.bus);
    const sib = a._n(v, a.white, t0, total), sf = a._f(v, 'bandpass', 5500, 2), sg = a._g(v, 0); sib.connect(sf).connect(sg).connect(v.bus);
    // 借來的聲音：每隔一陣子音量頓一下（像錄音被剪接過）
    let at = t0 + 0.04;
    syl.forEach((s, i) => {
      const d = durs[i], tone = TONES[s.tone] || TONES[0];
      // 聲母
      const ini = s.ini;
      let lead = 0;
      if (ini) {
        const fric = { s: [6500, 0.35], c: [6000, 0.3], z: [5800, 0.18], x: [5200, 0.35], q: [4600, 0.28], j: [4300, 0.18], sh: [3300, 0.35], ch: [3100, 0.28], zh: [3000, 0.18], r: [2600, 0.1], f: [5000, 0.2], h: [1600, 0.3], p: [1200, 0.25], t: [3500, 0.25], k: [2200, 0.25], b: [900, 0.1], d: [3000, 0.1], g: [1800, 0.1] }[ini];
        if (fric) {
          lead = ['b', 'd', 'g'].includes(ini) ? 0.025 : ['p', 't', 'k'].includes(ini) ? 0.06 : 0.09;
          sf.frequency.setValueAtTime(fric[0], Math.max(t0, at - 0.01)); sg.gain.setTargetAtTime(fric[1] * (o.gain ?? 1), at, 0.008); sg.gain.setTargetAtTime(0.0001, at + lead * 0.8, 0.012);
        } else lead = 0.045; // m n l：鼻音、邊音
      }
      const vStart = at + lead, vEnd = at + d;
      // 共振峰：沿著韻母的母音序列滑動
      const n = s.seq.length;
      s.seq.forEach((vow, k) => {
        const tk = vStart + ((vEnd - vStart) * k) / Math.max(1, n);
        const nas = s.nasal && k === n - 1 ? 0.75 : 1;
        F.forEach((f, j) => f.frequency.setTargetAtTime(vow[j] * fs * (scream ? 1.08 : 1) * rnd(0.97, 1.03), tk, k ? 0.03 : 0.012));
        if (nas < 1) env.gain.setTargetAtTime(0.55, tk, 0.03);
      });
      // 聲調
      const pts = tone.length;
      tone.forEach((m, k) => glott.frequency.setTargetAtTime(f0 * m * (1 + rnd(-0.02, 0.02)), vStart + ((vEnd - vStart) * k) / Math.max(1, pts - 1) * 0.85, 0.04));
      if (g2) tone.forEach((m, k) => g2.frequency.setTargetAtTime(f0 * m * 1.012, vStart + ((vEnd - vStart) * k) / Math.max(1, pts - 1) * 0.85, 0.04));
      const amp = (ini === 'h' ? 0.85 : 1) * (V.wrong && Math.random() < 0.18 * V.wrong ? 0.25 : 1);
      env.gain.setTargetAtTime(ini && ['m', 'n', 'l'].includes(ini) ? 0.5 : 0.0001, at, 0.01);
      env.gain.setTargetAtTime(amp, vStart, 0.018);
      env.gain.setTargetAtTime(0.0001, vEnd - (scream ? 0.25 : 0.05), scream ? 0.18 : 0.035);
      at = vEnd + 0.035 * speed;
    });
    return total;
  }

  /** 美蘭在門外被攔住時的嘶喊（遠、身後）：拉長、破音、夾著抽氣 */
  function scream(pinyin = 'xiao3 yu3', o = {}) { return speak(pinyin, 'meilan', { scream: 1, dist: 7, behind: true, wet: 2, gain: 1.4, ...o }); }
  /** 穿著美蘭的那個東西撲過來：兩個音高互相摩擦、往下掉的尖嘯，加一記低頻 */
  function shriek(o = {}) {
    if (!ok()) return; const a = A();
    if (a.vox?.play?.('shriek', { pan: o.pan ?? 0, dist: Math.min(o.dist ?? 1.5, 6), gain: 1.15 * (o.gain ?? 1), wet: 1.5 })) o = { ...o, gain: 0.35 * (o.gain ?? 1) }; // 錄音（處理過的真人尖叫）為主，下面的合成壓低疊著（低頻重擊）
    const dur = 1.7, v = a._voice({ dur: dur + 0.2, pan: o.pan ?? 0, dist: o.dist ?? 1.5, gain: 1.3 * (o.gain ?? 1), wet: 1.6 });
    const t = v.t, g = a._g(v), sh = a.ctx.createWaveShaper(), c = new Float32Array(1025);
    for (let i = 0; i < c.length; i++) { const x = (i / 1024) * 2 - 1; c[i] = Math.tanh(x * 4); } sh.curve = c; v.nodes.push(sh);
    const F = [a._f(v, 'bandpass', 1100, 5), a._f(v, 'bandpass', 2300, 7)];
    for (const [f0, f1, gain] of [[1250, 640, 1], [1330, 590, 0.8], [880, 300, 0.55]]) {
      const os = a._o(v, 'sawtooth', f0, t, dur), og = a._g(v, gain * 0.35);
      os.frequency.setValueAtTime(f0, t); os.frequency.exponentialRampToValueAtTime(f0 * 1.06, t + 0.25); os.frequency.exponentialRampToValueAtTime(f1, t + dur);
      const vb = a._o(v, 'sine', rnd(7, 11), t, dur), vd = a._g(v, 60); vb.connect(vd).connect(os.detune);
      os.connect(og).connect(sh);
    }
    for (const f of F) sh.connect(f).connect(g);
    const n = a._n(v, a.white, t, dur), nb = a._f(v, 'bandpass', 3000, 1.5), ng = a._g(v, 0.3); n.connect(nb).connect(ng).connect(g);
    g.connect(v.bus); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(1, t + 0.05); g.gain.setTargetAtTime(0.5, t + 0.6, 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const lo = a._o(v, 'sine', 70, t, 0.8), lg = a._g(v); lo.frequency.exponentialRampToValueAtTime(32, t + 0.7); lo.connect(lg).connect(v.bus); lg.gain.setValueAtTime(0.0001, t); lg.gain.linearRampToValueAtTime(1, t + 0.01); lg.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
  }

  // ── 持續型聲音：建立後由 level 控制，stop 收掉 ──
  function persistent(build) {
    let nodes = null, out = null, last = -1;
    const api = {
      level(k, tau = 0.25) { if (!ok()) return; if (nodes && Math.abs(k - last) < 0.015) return; last = k; if (!nodes) { const a = A(); out = a.ctx.createGain(); out.gain.value = 0; nodes = build(a, out) || []; nodes.push(out); loops.add(api); } out.gain.setTargetAtTime(Math.max(0, k), A().ctx.currentTime, tau); },
      stop() { last = -1; if (!nodes) return; const a = A(); const now = a.ctx?.currentTime || 0; try { out.gain.setTargetAtTime(0, now, 0.08); } catch { /* ignore */ } const list = nodes; nodes = null; loops.delete(api); setTimeout(() => { for (const n of list) { try { n.stop?.(); } catch { /* ignore */ } try { n.disconnect(); } catch { /* ignore */ } } }, 600); },
      get on() { return !!nodes; },
    };
    return api;
  }
  const loopSrc = (a, buf, rate = 1) => { const s = a.ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate; s.start(); return s; };
  const F = (a, type, f, q = 0.7) => { const x = a.ctx.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q; return x; };
  const G = (a, v) => { const g = a.ctx.createGain(); g.gain.value = v; return g; };
  /** 門後的火：悶住的轟響 + 嘶嘶 + 高頻細碎 */
  const fire = persistent((a, out) => {
    { const rec = a.foley?.fin?.('fireBuild', a, out); if (rec) return rec; } // 有錄音（foley 組）就用錄音的火，否則下面的合成
    const roar = loopSrc(a, a.brown, 0.8), rl = F(a, 'lowpass', 240, 0.8), rg = G(a, 1.2);
    const lfo = a.ctx.createOscillator(); lfo.frequency.value = 0.37; const ld = G(a, 0.35); lfo.connect(ld).connect(rg.gain); lfo.start();
    const hiss = loopSrc(a, a.pink, 1.1), hb = F(a, 'bandpass', 1100, 0.6), hg = G(a, 0.22);
    const crack = loopSrc(a, a.white, 1), cb = F(a, 'highpass', 2600, 0.7), cg = G(a, 0.0);
    const door = F(a, 'lowpass', 2400, 0.6);
    roar.connect(rl).connect(rg).connect(door); hiss.connect(hb).connect(hg).connect(door); crack.connect(cb).connect(cg).connect(door);
    door.connect(out); out.connect(a.fxBus); const w = G(a, 0.35); out.connect(w).connect(a.revSend);
    fire.crackGain = cg;
    return [roar, rl, rg, lfo, ld, hiss, hb, hg, crack, cb, cg, door, w];
  });
  let crackleT = 0;
  /** 每幀呼叫：依火勢安排爆裂聲與木頭裂開 */
  function update(dt) {
    if (!ok()) return;
    const a = A(), k = fireLevel;
    if (fire.on && k > 0.05) {
      crackleT -= dt;
      if (crackleT <= 0) {
        crackleT = rnd(0.03, 0.22) / (0.4 + k);
        const cg = fire.crackGain, now = a.ctx.currentTime; if (cg) { cg.gain.setValueAtTime(rnd(0.2, 0.9) * k, now); cg.gain.setTargetAtTime(0, now + 0.004, 0.006); }
        if (Math.random() < 0.06 * k) pop(rnd(-0.3, 0.3), rnd(0.5, 1.2) * k);
      }
    }
    if (birdsOn) { birdT -= dt; if (birdT <= 0) { birdT = rnd(0.3, 1.6); chirp(); } }
  }
  let fireLevel = 0;
  function fireSet(k) { fireLevel = k; fire.level(k * 0.5, 0.4); } // 火聲壓在人聲底下，門裡的孩子要聽得見
  /** 木頭爆裂 */
  function pop(pan = 0, s = 1) {
    if (!ok() || A().foley?.fin?.('pop', pan, s)) return; const a = A(), v = a._voice({ dur: 0.5, pan, dist: 3, gain: 1.1 * s, wet: 1.5, lp: 4000 });
    const n = a._n(v, a.white, v.t, 0.08), b = a._f(v, 'bandpass', rnd(900, 1600), 1.2), g = a._g(v); n.connect(b).connect(g).connect(v.bus); env(g.gain, v.t, 0.001, 0.9, 0.06);
    const o = a._o(v, 'sine', rnd(90, 140), v.t, 0.3), og = a._g(v); o.frequency.exponentialRampToValueAtTime(45, v.t + 0.25); o.connect(og).connect(v.bus); env(og.gain, v.t, 0.002, 0.6, 0.25);
  }
  /** 手掌被燙的滋滋聲 */
  const sizzle = persistent((a, out) => {
    { const rec = a.foley?.fin?.('sizzleBuild', a, out); if (rec) return rec; } // 錄音（foley 組）
    const s = loopSrc(a, a.white, 1), b = F(a, 'bandpass', 4200, 0.9), am = G(a, 0.6);
    const l = a.ctx.createOscillator(); l.type = 'sawtooth'; l.frequency.value = 31; const ld = G(a, 0.4); l.connect(ld).connect(am.gain); l.start();
    s.connect(b).connect(am).connect(out); out.connect(a.fxBus);
    return [s, b, am, l, ld];
  });

  function env(p, t, at, peak, dec) { p.setValueAtTime(0.0001, t); p.linearRampToValueAtTime(Math.max(0.0002, peak), t + at); p.exponentialRampToValueAtTime(0.0001, t + at + dec); }
  /** 小孩的拳頭敲門（門後） */
  function knockSmall(s = 1, pan = 0, dist = 1.4) { if (!ok() || A().foley?.fin?.('knockSmall', s, pan, dist)) return; const a = A(), v = a._voice({ dur: 0.4, pan, dist, gain: 1.2 * s, wet: 1.3 }); a._knockAt(v, v.t, 0.75 * s); }
  /** 大人拍門：重、帶門閂的金屬聲 */
  function bang(s = 1, pan = 0, dist = 3) {
    if (!ok() || A().foley?.fin?.('bang', s, pan, dist)) return; const a = A(), v = a._voice({ dur: 0.7, pan, dist, gain: 2.2 * s, wet: 1.6 });
    const o = a._o(v, 'sine', 72, v.t, 0.4), og = a._g(v); o.frequency.exponentialRampToValueAtTime(38, v.t + 0.3); o.connect(og).connect(v.bus); env(og.gain, v.t, 0.003, 1, 0.35);
    const n = a._n(v, a.brown, v.t, 0.25), b = a._f(v, 'bandpass', 220, 0.9), g = a._g(v); n.connect(b).connect(g).connect(v.bus); env(g.gain, v.t, 0.002, 0.9, 0.2);
    for (const [dt, f] of [[0.03, 2600], [0.07, 3400], [0.12, 2900]]) { const m = a._o(v, 'sine', f, v.t + dt, 0.12), mg = a._g(v); m.connect(mg).connect(v.bus); env(mg.gain, v.t + dt, 0.001, 0.05 * s, 0.1); }
  }
  /** 燈熄：一口氣吹熄的聲音、燈絲斷掉的一聲 */
  function snuff(pan = 0, dist = 4) {
    if (!ok() || A().foley?.fin?.('snuff', pan, dist)) return; const a = A(), v = a._voice({ dur: 0.6, pan, dist, gain: 1.1, wet: 1.4, hrtf: true });
    const n = a._n(v, a.pink, v.t, 0.25), b = a._f(v, 'bandpass', 1800, 0.8), g = a._g(v); n.connect(b).connect(g).connect(v.bus); env(g.gain, v.t, 0.02, 0.5, 0.2);
    const o = a._o(v, 'sine', 80, v.t + 0.05, 0.3), og = a._g(v); o.frequency.exponentialRampToValueAtTime(38, v.t + 0.3); o.connect(og).connect(v.bus); env(og.gain, v.t + 0.05, 0.004, 0.7, 0.22);
    const c = a._o(v, 'square', 2900, v.t + 0.04, 0.02), cg = a._g(v); c.connect(cg).connect(v.bus); env(cg.gain, v.t + 0.04, 0.001, 0.05, 0.015);
  }
  /** 燈一起亮起來：低頻往上推的一口氣 */
  function whump() {
    if (!ok()) return; const a = A(), v = a._voice({ dur: 1.4, dist: 0, gain: 0.9, wet: 1.2 });
    const o = a._o(v, 'sine', 38, v.t, 1.2), og = a._g(v); o.frequency.exponentialRampToValueAtTime(62, v.t + 0.4); o.connect(og).connect(v.bus); env(og.gain, v.t, 0.06, 1, 1);
    const n = a._n(v, a.brown, v.t, 0.8), lp = a._f(v, 'lowpass', 400, 0.7), ng = a._g(v); n.connect(lp).connect(ng).connect(v.bus); env(ng.gain, v.t, 0.05, 0.6, 0.6);
  }
  /** 沉重的舊鎖彈開 */
  function clunk() {
    if (!ok() || A().foley?.fin?.('clunk')) return; const a = A(), v = a._voice({ dur: 1.6, dist: 0.8, gain: 1.6, wet: 1.6 });
    const n = a._n(v, a.white, v.t, 0.06), b = a._f(v, 'bandpass', 1300, 1.5), g = a._g(v); n.connect(b).connect(g).connect(v.bus); env(g.gain, v.t, 0.001, 1, 0.05);
    for (const [f, d, p] of [[182, 0.6, 0.8], [523, 1.1, 0.25], [1311, 0.9, 0.12], [2190, 0.6, 0.07], [3170, 0.4, 0.04]]) { const o = a._o(v, 'sine', f, v.t, d), og = a._g(v); o.connect(og).connect(v.bus); env(og.gain, v.t, 0.002, p, d); }
  }
  /** 長長的開門聲：門軸卡著一頓一頓地轉 */
  function creakLong(dur = 4, pan = 0, dist = 2) {
    if (!ok() || A().foley?.fin?.('creakLong', dur, pan, dist)) return; const a = A();
    for (let t = 0; t < dur; t += rnd(0.35, 0.8)) a.creak(a.ctx.currentTime + t, { pan: pan + rnd(-0.15, 0.15), dist, gain: rnd(0.9, 1.4) });
    const v = a._voice({ dur: dur + 0.3, pan, dist, gain: 1.4, wet: 1.4 }), t = v.t;
    const o = a._o(v, 'sawtooth', 46, t, dur), b = a._f(v, 'bandpass', 420, 3), am = a._g(v, 0.5), g = a._g(v);
    const l = a._o(v, 'sawtooth', 9, t, dur), ld = a._g(v, 0.5); l.frequency.linearRampToValueAtTime(5, t + dur); l.connect(ld).connect(am.gain);
    o.frequency.linearRampToValueAtTime(38, t + dur); o.connect(b).connect(am).connect(g).connect(v.bus);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.6, t + 0.3); g.gain.setValueAtTime(0.6, t + dur - 0.4); g.gain.linearRampToValueAtTime(0.0001, t + dur);
  }
  /** 咳嗽（門後的人醒過來） */
  function cough(f0 = 120, pan = 0, dist = 5, n = 2) {
    if (!ok()) return;
    { // 真人咳嗽錄音（一陣兩三聲）；n ≥ 3 時再接一陣。沒有錄音就用下面的合成
      const vx = A().vox, o = { pan, dist, gain: 0.46, wet: 1.6, hrtf: true, behind: true, rate: clamp(f0 / 115, 0.88, 1.12) };
      const d = vx?.play?.('cough', o);
      if (d) { if (n >= 3) vx.play('cough', { ...o, gain: 0.36, t: A().ctx.currentTime + d + rnd(0.2, 0.5) }); return; }
    }
    const a = A(), v = a._voice({ dur: n * 0.5 + 0.6, pan, dist, gain: 1.3, wet: 1.6, hrtf: true, behind: true });
    for (let i = 0; i < n; i++) {
      const t = v.t + i * rnd(0.38, 0.52), s = a._n(v, a.pink, t, 0.3), b = a._f(v, 'bandpass', rnd(700, 1100), 1.2), g = a._g(v); s.connect(b).connect(g).connect(v.bus); env(g.gain, t, 0.008, 0.9, 0.22);
      const o = a._o(v, 'sawtooth', f0 * rnd(0.95, 1.2), t, 0.22), ob = a._f(v, 'bandpass', 600, 4), og = a._g(v); o.connect(ob).connect(og).connect(v.bus); env(og.gain, t, 0.01, 0.25, 0.18);
    }
  }
  /** 媽媽哼的那首童謠——這一次每個音都是準的 */
  function hum(o = {}) {
    if (!ok()) return 0; const a = A();
    { const d = a.vox?.play?.('motherHum', { pan: o.pan ?? 0, dist: o.dist ?? 2.5, gain: 1.75 * (o.gain ?? 1), wet: 1.5 }); if (d) return d; } // 真人哼唱的嗓音，換成同一首童謠（vox 組）
    const N = { E: 247, G: 294, A: 330, C: 392, D: 440 };
    const phrase = [['A', 0.7], ['C', 0.36], ['A', 0.7], ['G', 0.4], ['E', 0.7], ['G', 0.36], ['A', 1.1], [null, 0.4], ['A', 0.36], ['C', 0.36], ['D', 0.74], ['C', 0.4], ['A', 1.9]];
    const total = phrase.reduce((s, p) => s + p[1], 0) + 0.6;
    const v = a._voice({ dur: total, pan: o.pan ?? 0, dist: o.dist ?? 2.5, gain: 0.5 * (o.gain ?? 1), wet: 1.5 }), t = v.t, g = a._g(v);
    const o1 = a._o(v, 'triangle', 330, t, total), o2 = a._o(v, 'sine', 660, t, total), g2 = a._g(v, 0.12);
    const vib = a._o(v, 'sine', 4.9, t, total), vd = a._g(v, 9); vib.connect(vd); vd.connect(o1.detune); vd.connect(o2.detune);
    const lp = a._f(v, 'lowpass', 950, 0.7); o1.connect(lp); o2.connect(g2).connect(lp); lp.connect(g).connect(v.bus);
    const br = a._n(v, a.pink, t, total), bb = a._f(v, 'bandpass', 1600, 1), bg = a._g(v, 0.03); br.connect(bb).connect(bg).connect(g);
    let at = t + 0.1; g.gain.setValueAtTime(0.0001, t);
    for (const [n, d] of phrase) {
      if (n) { o1.frequency.setTargetAtTime(N[n], at, 0.05); o2.frequency.setTargetAtTime(N[n] * 2, at, 0.05); g.gain.setTargetAtTime(0.75, at, 0.08); g.gain.setTargetAtTime(0.4, at + d * 0.8, 0.06); }
      else g.gain.setTargetAtTime(0.0001, at, 0.06);
      at += d;
    }
    g.gain.setTargetAtTime(0.0001, at - 0.5, 0.25);
    return total;
  }
  let birdsOn = false, birdT = 0;
  function chirp() {
    if (!ok() || A().foley?.fin?.('chirp')) return; const a = A(), v = a._voice({ dur: 0.7, pan: rnd(-0.9, 0.9), dist: rnd(18, 40), gain: 0.9, wet: 1.2, amb: true });
    let at = v.t; const n = 2 + Math.floor(Math.random() * 4), f = rnd(2600, 4200);
    for (let i = 0; i < n; i++) { const o = a._o(v, 'sine', f, at, 0.09), og = a._g(v); o.frequency.setValueAtTime(f * rnd(0.9, 1.1), at); o.frequency.exponentialRampToValueAtTime(f * rnd(1.2, 1.5), at + 0.06); o.connect(og).connect(v.bus); env(og.gain, at, 0.005, 0.25, 0.07); at += rnd(0.08, 0.14); }
  }
  function birds(on) { birdsOn = on; birdT = 0.2; A()?.foley?.fin?.('birds', on); }
  /** 手機在桌上震動 */
  function vibrate() {
    if (!ok() || A().foley?.fin?.('vibrate')) return; const a = A(), v = a._voice({ dur: 0.9, dist: 0.6, gain: 1.2, wet: 0.5, pan: 0.2 });
    const s = a._n(v, a.brown, v.t, 0.8), b = a._f(v, 'bandpass', 160, 3), am = a._g(v, 0.5), g = a._g(v);
    const l = a._o(v, 'square', 34, v.t, 0.8), ld = a._g(v, 0.5); l.connect(ld).connect(am.gain); s.connect(b).connect(am).connect(g).connect(v.bus);
    g.gain.setValueAtTime(0.0001, v.t); g.gain.linearRampToValueAtTime(0.9, v.t + 0.03); g.gain.setValueAtTime(0.9, v.t + 0.55); g.gain.linearRampToValueAtTime(0.0001, v.t + 0.62);
  }
  /** 撥號中的回鈴音 */
  function ringback() {
    if (!ok()) return; const a = A(), v = a._voice({ dur: 1.2, dist: 0.2, gain: 0.5, wet: 0.1, lp: 3000 });
    for (const f of [440, 480]) { const o = a._o(v, 'sine', f, v.t, 1.0), og = a._g(v); o.connect(og).connect(v.bus); og.gain.setValueAtTime(0.0001, v.t); og.gain.linearRampToValueAtTime(0.18, v.t + 0.02); og.gain.setValueAtTime(0.18, v.t + 0.95); og.gain.linearRampToValueAtTime(0.0001, v.t + 1.0); }
  }
  function hangup() {
    if (!ok()) return; const a = A(), v = a._voice({ dur: 1, dist: 0.2, gain: 0.5, wet: 0.1 });
    for (let i = 0; i < 3; i++) { const t = v.t + i * 0.22, o = a._o(v, 'sine', 620, t, 0.12), og = a._g(v); o.connect(og).connect(v.bus); og.gain.setValueAtTime(0.0001, t); og.gain.linearRampToValueAtTime(0.2, t + 0.01); og.gain.setValueAtTime(0.2, t + 0.1); og.gain.linearRampToValueAtTime(0.0001, t + 0.12); }
  }
  /** 腳跟在石地上被拖著走 */
  function drag(dur = 1.2) {
    if (!ok() || A().foley?.fin?.('drag', dur)) return; const a = A(), v = a._voice({ dur: dur + 0.2, dist: 0.5, gain: 1.4, wet: 1 }), t = v.t;
    const s = a._n(v, a.brown, t, dur), b = a._f(v, 'bandpass', 340, 1.1), am = a._g(v, 0.6), g = a._g(v);
    const l = a._o(v, 'sawtooth', 14, t, dur), ld = a._g(v, 0.45); l.connect(ld).connect(am.gain);
    s.connect(b).connect(am).connect(g).connect(v.bus); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(1, t + 0.08); g.gain.setTargetAtTime(0.0001, t + dur - 0.15, 0.06);
    const n2 = a._n(v, a.white, t, dur), b2 = a._f(v, 'bandpass', 2400, 2), g2 = a._g(v, 0.08); n2.connect(b2).connect(g2).connect(g);
  }
  /** 布料蓋上臉 */
  function cloth() {
    if (!ok() || A().foley?.fin?.('cloth')) return; const a = A(), v = a._voice({ dur: 0.7, dist: 0.2, gain: 1.2, wet: 0.4 });
    const s = a._n(v, a.pink, v.t, 0.6), b = a._f(v, 'bandpass', 600, 0.8), g = a._g(v); b.frequency.exponentialRampToValueAtTime(2200, v.t + 0.35); s.connect(b).connect(g).connect(v.bus); env(g.gain, v.t, 0.06, 0.8, 0.45);
  }
  function stopAll() { for (const l of [...loops]) l.stop(); fireLevel = 0; birdsOn = false; A()?.foley?.fin?.('birds', false); }
  return { speak, scream, shriek, fire: { set: fireSet, stop: () => { fire.stop(); fireLevel = 0; } }, sizzle, pop, knockSmall, bang, snuff, whump, clunk, creakLong, cough, hum, birds, vibrate, ringback, hangup, drag, cloth, update, stopAll };
}
