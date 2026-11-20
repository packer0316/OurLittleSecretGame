/**
 * 錄音素材庫（SoundBank）。
 *
 * 素材登記在 src/audio/lib/*.js（score / foley / vox 各一份），合併成 LIBRARY。每一筆：
 *   'foley.step.stone': {
 *     files: ['foley/step_stone_01.ogg', ...],   // 相對 public/assets/audio/；多個檔案＝隨機變體（不連續重複同一個）
 *     maps: ['temple'] | ['all'],                // 哪些地圖要預載（'all' 三張都載）
 *     gain: 1,                                   // 素材本身的音量校正（線性）
 *     bus: 'fx' | 'amb' | 'score' | 'ui',        // 預設 fx。amb 會被 duck() 抽空；score 走緊張層（同樣會被 duck 抽空）；ui 直接進主輸出、不加殘響
 *     loop: false, rate: [0.97, 1.03],           // 可選：預設播放速度範圍（隨機）
 *     wet: 1,                                    // 可選：送殘響的倍率
 *   }
 *
 * 用法（AudioSys 初始化後 audio.bank 就存在；沒有音訊、或素材還沒載入時 has() 回傳 false，呼叫端應該退回程序化聲音）：
 *   bank.has(id)
 *   bank.play(id, { t, pan, dist, gain, rate, detune, wet, hrtf, behind, above, lp, near, offset, dur, variant, fadeIn, bus })
 *        → { src, gain, voice, duration, stop(fade) } | null      一次性；走 AudioSys 的 Voice（距離低通、方位、乾濕聲、數量上限）
 *   bank.loop(id, { gain, rate, pan, lp, hp, bus, wet, fadeIn, offset })
 *        → { setGain(v, tau), setRate(r, tau), setPan(p, tau), setLP(hz, tau), stop(fade), playing } | null   持續型（不受 Voice 數量上限影響）
 *   bank.buffer(id, variant)   直接拿 AudioBuffer（自己組節點時用）
 *   bank.preload(mapId, onProgress) → Promise   Game.loadMap 會自動呼叫；也可在 OfflineAudioContext 上用（測試離線渲染）
 *   bank.stats()  已解碼的秒數與記憶體
 */
import { LIBRARY } from './library.js';

const BASE = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL ? import.meta.env.BASE_URL : '/') + 'assets/audio/';
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export function createBank(audio, library = LIBRARY) {
  const ctx = audio.ctx;
  const buffers = new Map(); // file → AudioBuffer
  const pending = new Map(); // file → Promise
  const failed = new Set();
  const lastVariant = new Map();
  const loops = new Set();
  let loadedFor = null;

  const entry = (id) => library[id] || null;
  const filesOf = (e) => (e ? e.files || (e.src ? [e.src] : []) : []);
  const want = (e, mapId) => { const m = e.maps || ['all']; return m.includes('all') || m.includes(mapId); };

  function loadFile(file) {
    if (buffers.has(file)) return Promise.resolve(buffers.get(file));
    if (failed.has(file)) return Promise.resolve(null);
    if (pending.has(file)) return pending.get(file);
    const p = fetch(BASE + file)
      .then((r) => { if (!r.ok) throw new Error(`${r.status} ${file}`); return r.arrayBuffer(); })
      .then((ab) => new Promise((res, rej) => { const q = ctx.decodeAudioData(ab, res, rej); if (q?.then) q.then(res, rej); }))
      .then((buf) => { buffers.set(file, buf); pending.delete(file); return buf; })
      .catch((err) => { failed.add(file); pending.delete(file); console.warn('[audio] 無法載入', file, err?.message || err); return null; });
    pending.set(file, p);
    return p;
  }

  function pick(id, variant) {
    const e = entry(id); if (!e) return null;
    const files = filesOf(e).filter((f) => buffers.has(f));
    if (!files.length) return null;
    let i;
    if (Number.isInteger(variant)) i = clamp(variant, 0, files.length - 1);
    else {
      i = Math.floor(Math.random() * files.length);
      if (files.length > 1 && i === lastVariant.get(id)) i = (i + 1 + Math.floor(Math.random() * (files.length - 1))) % files.length;
    }
    lastVariant.set(id, i);
    return { e, buf: buffers.get(files[i]), file: files[i] };
  }

  const busNode = (name) => (name === 'amb' ? audio.ambIn : name === 'score' ? audio.scoreBus : name === 'ui' ? audio.uiBus : audio.fxBus);
  const wetNode = (name) => (name === 'amb' ? audio.ambWet : name === 'ui' ? null : audio.revSend);

  const bank = {
    library,
    get loadedFor() { return loadedFor; },
    has(id) { const e = entry(id); return !!e && filesOf(e).some((f) => buffers.has(f)); },
    buffer(id, variant) { return pick(id, variant)?.buf || null; },
    /** 這張地圖要用的素材全部載入；不再需要的已解碼素材會被釋放 */
    async preload(mapId, onProgress) {
      const keep = new Set(), jobs = [];
      for (const e of Object.values(library)) if (want(e, mapId)) for (const f of filesOf(e)) keep.add(f);
      let done = 0; const total = keep.size || 1;
      for (const f of keep) jobs.push(loadFile(f).then(() => onProgress?.(++done / total)));
      await Promise.all(jobs);
      for (const f of [...buffers.keys()]) if (!keep.has(f)) buffers.delete(f);
      loadedFor = mapId;
      return bank.stats();
    },
    play(id, o = {}) {
      if (!ctx) return null;
      const p = pick(id, o.variant); if (!p) return null;
      const { e, buf } = p;
      const rate = o.rate ?? (Array.isArray(e.rate) ? rnd(e.rate[0], e.rate[1]) : e.rate || 1);
      const offset = clamp(o.offset || 0, 0, Math.max(0, buf.duration - 0.01));
      const dur = o.dur ?? (buf.duration - offset) / rate;
      const bus = o.bus || e.bus || 'fx';
      const v = audio._voice({ t: o.t, dur: dur + (o.tail || 0), pan: o.pan || 0, dist: o.dist ?? 1, gain: (o.gain ?? 1) * (e.gain ?? 1), wet: (o.wet ?? 1) * (e.wet ?? 1) * (bus === 'ui' ? 0 : 1), amb: bus === 'amb', hrtf: !!o.hrtf, behind: !!o.behind, above: o.above || 0, lp: o.lp || 0, near: o.near || 0 });
      if (bus === 'score' || bus === 'ui') rewire(v, bus); // Voice 預設接 fxBus：配樂與介面音改接自己的匯流排
      const src = ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = rate;
      if (o.detune && src.detune) src.detune.value = o.detune;
      const g = ctx.createGain(); v.nodes.push(g);
      const t0 = v.t;
      if (o.fadeIn) { g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(1, t0 + o.fadeIn); } else g.gain.value = 1;
      if (o.dur != null && o.dur < (buf.duration - offset) / rate) { const end = t0 + o.dur; g.gain.setValueAtTime(1, Math.max(t0, end - 0.06)); g.gain.linearRampToValueAtTime(0.0001, end); }
      src.connect(g).connect(v.bus);
      src.start(t0, offset); src.stop(t0 + dur + 0.05);
      v.srcs.push(src);
      return {
        src, gain: g, voice: v, duration: dur,
        stop(fade = 0.05) { try { const now = ctx.currentTime; g.gain.cancelScheduledValues(now); g.gain.setTargetAtTime(0, now, Math.max(0.005, fade / 3)); src.stop(now + fade + 0.05); } catch { /* 已停止 */ } },
      };
    },
    loop(id, o = {}) {
      if (!ctx) return null;
      const p = pick(id, o.variant); if (!p) return null;
      const { e, buf } = p;
      const bus = o.bus || e.bus || 'amb';
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      src.playbackRate.value = o.rate ?? e.rate ?? 1;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = o.lp || 20000; lp.Q.value = 0.5;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = o.hp || 10; hp.Q.value = 0.5;
      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain(); if (pan.pan) pan.pan.value = o.pan || 0;
      const g = ctx.createGain(); const base = e.gain ?? 1; const target = (o.gain ?? 1) * base;
      const now = ctx.currentTime;
      g.gain.setValueAtTime(o.fadeIn ? 0.0001 : target, now);
      if (o.fadeIn) g.gain.setTargetAtTime(target, now, o.fadeIn / 3);
      src.connect(hp).connect(lp).connect(pan).connect(g).connect(busNode(bus));
      const wetAmt = (o.wet ?? e.wet ?? 0) * (bus === 'ui' ? 0 : 1);
      let w = null; const wn = wetNode(bus);
      if (wetAmt > 0 && wn) { w = ctx.createGain(); w.gain.value = wetAmt; g.connect(w).connect(wn); }
      src.start(now, o.offset ?? Math.random() * buf.duration * 0.95);
      const nodes = [src, hp, lp, pan, g, w].filter(Boolean);
      const h = {
        playing: true, id,
        setGain(v, tau = 0.5) { g.gain.setTargetAtTime(Math.max(0, v) * base, ctx.currentTime, tau); },
        setRate(r, tau = 0.5) { src.playbackRate.setTargetAtTime(r, ctx.currentTime, tau); },
        setPan(v, tau = 0.3) { if (pan.pan) pan.pan.setTargetAtTime(clamp(v, -1, 1), ctx.currentTime, tau); },
        setLP(hz, tau = 0.4) { lp.frequency.setTargetAtTime(clamp(hz, 40, 20000), ctx.currentTime, tau); },
        setHP(hz, tau = 0.4) { hp.frequency.setTargetAtTime(clamp(hz, 10, 12000), ctx.currentTime, tau); },
        stop(fade = 0.4) {
          if (!h.playing) return; h.playing = false; loops.delete(h);
          const t = ctx.currentTime; g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(0, t, Math.max(0.01, fade / 3));
          try { src.stop(t + fade + 0.1); } catch { /* 已停止 */ }
          const kill = () => { for (const n of nodes) { try { n.disconnect(); } catch { /* 忽略 */ } } };
          if (audio.offline) kill(); else setTimeout(kill, (fade + 0.2) * 1000);
        },
      };
      loops.add(h);
      return h;
    },
    /** 換地圖時：所有持續型聲音收掉 */
    stopLoops(fade = 0.3) { for (const h of [...loops]) h.stop(fade); },
    stats() {
      let seconds = 0, bytes = 0, mono = 0;
      for (const b of buffers.values()) { seconds += b.duration; bytes += b.length * b.numberOfChannels * 4; mono += b.duration * b.numberOfChannels; }
      return { files: buffers.size, seconds: +seconds.toFixed(1), monoSeconds: +mono.toFixed(1), mb: +(bytes / 1048576).toFixed(1), failed: [...failed], loops: loops.size, map: loadedFor };
    },
  };

  /** Voice 的乾聲固定接到 fxBus、濕聲接遊戲世界的殘響：配樂（非劇中音）與介面音都不該帶場景殘響 */
  function rewire(v, bus) {
    const target = busNode(bus);
    for (const n of v.nodes) {
      if (n === v.bus) continue;
      try { n.disconnect(audio.fxBus); n.connect(target); } catch { /* 這個節點沒有接 fxBus */ }
      try { n.disconnect(audio.revSend); } catch { /* 沒有濕聲 */ }
    }
  }

  return bank;
}
