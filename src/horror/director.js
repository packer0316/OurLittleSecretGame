import { clamp } from './sense.js';

/**
 * 緊張度模型與節奏排程。
 * dread（0..1）= 劇情進度給的底噪 + 節奏波形 + 事件造成的尖峰。
 * 節奏循環：grace（剛進地圖，不出硬驚嚇）→ build（鋪陳）→ approach（逼近）→ peak（爆發，或假警報）→ calm（喘息）→ build …
 * 同一招不連續出現：最近用過的事件與同家族事件會被降權，每個事件另有自己的冷卻。
 */
const CHAPTER_I = [0.3, 0.38, 0.55, 0.74, 0.9];

export function createDirector(h) {
  const { fx, rng } = h;
  const events = [], active = [], history = [];
  let phase = 'grace', phaseT = 0, phaseDur = 75, wave = 0, spikeV = 0, dread = 0, pulse = 0, beat = 0;
  let nextEvent = 22, attemptT = 0, mapTime = 0, time = 0, lastFamily = '', peakTried = 0, peakWantsFalse = false, peakEv = null, maxTier = 3, kicked = false, lastHard = null;

  const story = () => h.story;
  const state = () => h.story?.state;
  const released = () => h.id === 'temple' && !!state()?.flags?.sent;

  function intensityOf() {
    const st = state();
    if (h.id === 'home') return clamp(0.08 + (st?.home?.step || 0) * 0.075, 0, 0.55);
    if (h.id === 'road') return clamp(0.3 + (st?.road?.step || 0) * 0.065, 0, 0.65);
    if (!st) return CHAPTER_I[1];
    if (st.flags?.sent) return 0;
    return clamp(CHAPTER_I[st.chapter] ?? 0.5, 0, 1) + (h.game.player.pos.y < -2 ? 0.08 : 0) + Math.min(0.06, (st.deaths || 0) * 0.02);
  }

  // 各地圖的步調：住處是慢熱的小房間，事件之間要留更長的空白
  const tempo = () => (h.id === 'home' ? 1.7 : h.id === 'road' ? 1.2 : 1);
  function setPhase(p) {
    const I = h.intensity, T = tempo();
    phase = p; phaseT = 0; peakTried = 0; peakEv = null;
    if (p === 'build') { phaseDur = (40 + rng() * 26) * (1 - 0.4 * I) * T; nextEvent = (10 + rng() * 10) * T; }
    else if (p === 'approach') { phaseDur = (12 + rng() * 9) * T; nextEvent = (2 + rng() * 3) * T; }
    else if (p === 'peak') { phaseDur = 7; peakWantsFalse = rng() < (h.id === 'home' ? 0.16 : 0.34); attemptT = 0; } // 約三次裡有一次是假警報
    else if (p === 'calm') { phaseDur = (24 + rng() * 16) * (1 - 0.3 * I) * T; nextEvent = (13 + rng() * 8) * T; }
  }

  const ghostBusy = () => { for (let i = 0; i < active.length; i++) if (active[i].ghost) return true; return false; };
  // background：會在場景裡留很久、但不佔注意力的事件（童鞋、彈珠、窗後的臉…），不算進「同時進行」的名額
  const foreground = () => { let c = 0; for (let i = 0; i < active.length; i++) if (!active[i].background) c++; return c; };
  function eligible(ev, tMin, tMax, wantFalse) {
    if (ev.passive || ev.running || h.intensity < ev.minI || ev.tier < tMin || ev.tier > tMax || time < ev.readyAt) return 0;
    if (wantFalse !== null && !!ev.falseAlarm !== wantFalse) return 0;
    if (ev.ghost && ghostBusy()) return 0;
    for (let i = 0; i < active.length; i++) if (active[i].family === ev.family) return 0;
    if (!ev.can()) return 0;
    let w = ev.weight * (ev.boost || 1);
    const n = history.length;
    if (n && history[n - 1] === ev.id) return 0;
    if ((n > 1 && history[n - 2] === ev.id) || (n > 2 && history[n - 3] === ev.id)) w *= 0.25;
    if (ev.family === lastFamily) w *= 0.3;
    if (ev.id === lastHard) w *= 0.12; // 上一次爆發用過的那一招，這次盡量換別的
    return w;
  }
  /** 依權重抽一個可用的事件並嘗試啟動。 */
  function launch(tMin, tMax, wantFalse = null) {
    if (foreground() >= 2) return null;
    let sum = 0;
    for (let i = 0; i < events.length; i++) { const e = events[i]; e._w = eligible(e, tMin, tMax, wantFalse); sum += e._w; }
    if (sum <= 0) return null;
    let r = rng() * sum;
    for (let i = 0; i < events.length; i++) {
      const e = events[i]; if (e._w <= 0) continue;
      r -= e._w; if (r > 0) continue;
      return begin(e, false) ? e : (e.readyAt = time + 5, null);
    }
    return null;
  }
  function begin(ev, force) {
    ev.missed = false;
    let ok = false;
    try { ok = !!ev.start(force); } catch (err) { console.warn('[horror] start failed', ev.id, err); h.fault(err); ok = false; }
    if (!ok) { try { ev.stop(); } catch { /* 清理失敗不影響其他事件 */ } return false; }
    ev.running = true; ev.boost = 1; active.push(ev);
    return true;
  }
  function finish(ev, i) {
    try { ev.stop(); } catch (err) { h.fault(err); }
    ev.running = false; active.splice(i, 1);
    ev.readyAt = time + (ev.missed ? 12 : ev.cooldown * (1 - 0.35 * h.intensity) * (1 + 0.5 * (ev.count || 0))); // 用過越多次，休息越久
    if (ev.missed) return;
    history.push(ev.id); if (history.length > 6) history.shift();
    lastFamily = ev.family; ev.count = (ev.count || 0) + 1;
    if (ev.tier >= maxTier && !ev.falseAlarm) lastHard = ev.id;
    if ((ev.tier >= maxTier || ev === peakEv) && phase !== 'calm' && phase !== 'grace') setPhase('calm');
  }

  const d = {
    events,
    get dread() { return dread; }, get pulse() { return pulse; }, get phase() { return phase; }, get phaseT() { return phaseT; },
    get mapTime() { return mapTime; }, get active() { return active; }, get history() { return history; },
    chase: false,

    setup(list) {
      events.length = 0; active.length = 0; history.length = 0;
      for (const e of list) { if (!e.maps.includes(h.id)) continue; e.running = false; e.readyAt = 0; e.count = 0; e.boost = 1; e._w = 0; e.armed = false; events.push(e); }
      maxTier = events.reduce((m, e) => (e.passive ? m : Math.max(m, e.tier)), 1);
      phase = 'grace'; phaseT = 0; phaseDur = 68 + rng() * 22; wave = 0; spikeV = 0; dread = 0; pulse = 0; beat = 0;
      nextEvent = 20 + rng() * 10; mapTime = 0; time = 0; lastFamily = ''; lastHard = null; peakEv = null; d.chase = false; kicked = false;
    },
    spike(v) { spikeV = Math.min(0.6, spikeV + v); },
    /** 劇情推進時（換章）直接進入逼近段 */
    kick() { if (phase === 'build' || phase === 'calm') kicked = true; },
    /** 讓某個事件優先被抽到 */
    prime(id, boost = 4) { const e = events.find((x) => x.id === id); if (e) { e.readyAt = 0; e.boost = boost; } },
    allowHard: () => h.ambient && phase !== 'grace' && !released() && !d.chase,
    allowSoft: () => h.ambient && mapTime > 20 && !released() && !d.chase,
    /** 除錯／測試：不看節奏直接啟動 */
    force(id, natural = false) {
      const ev = events.find((e) => e.id === id); if (!ev) return false;
      if (ev.running) d.stop(id);
      if (ev.ghost) for (let i = active.length - 1; i >= 0; i--) if (active[i].ghost) finish(active[i], i);
      if (natural && ev.poll) { ev.armed = true; return true; } // 被動事件：解除機率與節奏限制，等它自己的條件成立
      return begin(ev, !natural);
    },
    stop(id) { for (let i = active.length - 1; i >= 0; i--) if (!id || active[i].id === id) { const e = active[i]; try { e.stop(); } catch (err) { h.fault(err); } e.running = false; active.splice(i, 1); } },
    stopAll() { d.stop(); },

    /** dt：受閱讀暫停影響的時間；rawDt：實際經過的時間 */
    update(dt, rawDt) {
      h.intensity = intensityOf();
      const I = h.intensity, rel = released(), st = story();
      time += dt; mapTime += dt;

      // 被動事件每幀輪詢（閱讀中也要追蹤視窗的開關）
      for (let i = 0; i < events.length; i++) {
        const e = events[i]; if (!e.poll) continue;
        let want = false;
        try { want = e.poll(rawDt); } catch (err) { h.fault(err); }
        if (want && e.armed) { e.armed = false; if (!e.running && e.can()) begin(e, false); continue; }
        if (want && h.ambient && !e.running && time >= e.readyAt && I >= e.minI && !rel && !d.chase && !(e.ghost && ghostBusy()) && e.can()) begin(e, false);
      }
      // 進行中的事件
      for (let i = active.length - 1; i >= 0 && !h.hold; i--) {
        const e = active[i]; let done = false;
        try { done = !!e.update(dt); } catch (err) { console.warn('[horror] event failed', e.id, err); h.fault(err); done = true; }
        if (done) finish(e, i);
      }

      // 節奏
      const quiet = rel || d.chase || !!st?.ritual || !h.ambient;
      if (!quiet && dt > 0) {
        phaseT += dt; nextEvent -= dt;
        const u = clamp(phaseT / phaseDur, 0, 1);
        let target = 0;
        if (phase === 'grace') {
          target = 0.2 * u;
          if (phaseT > 22 && nextEvent <= 0) { launch(1, 1); nextEvent = (16 + rng() * 12) * tempo(); }
          if (u >= 1) setPhase('build');
        } else if (phase === 'build') {
          target = 0.2 + 0.35 * u;
          if (nextEvent <= 0) { launch(1, Math.min(2, maxTier - 1) || 1); nextEvent = (15 + rng() * 12) * (1 - 0.3 * I) * tempo(); }
          if (u >= 1 || kicked) { kicked = false; setPhase('approach'); }
        } else if (phase === 'approach') {
          target = 0.55 + 0.35 * u;
          if (nextEvent <= 0) { launch(1, Math.max(1, maxTier - 1)); nextEvent = (5.5 + rng() * 4) * tempo(); }
          if (u >= 1) setPhase('peak');
        } else if (phase === 'peak') {
          target = 1;
          attemptT -= dt;
          // 一次爆發只有一個事件：真的驚嚇，或一次假警報。它結束（finish）時進入喘息。
          if (!peakEv && attemptT <= 0) {
            attemptT = 0.4; peakTried++;
            peakEv = peakWantsFalse ? launch(1, 3, true) : launch(maxTier, maxTier, false) || (peakTried > 8 ? launch(2, 3, null) : null);
          }
          if (peakEv ? !peakEv.running : u >= 1) setPhase('calm');
        } else { // calm
          target = 0;
          if (phaseT > 10 && nextEvent <= 0) { launch(1, 1); nextEvent = 30; }
          if (u >= 1 || kicked) { kicked = false; setPhase('build'); }
        }
        wave += (target - wave) * Math.min(1, dt * (target < wave ? 0.55 : 0.9));
      } else if (quiet) wave += (0 - wave) * Math.min(1, rawDt * 0.5);

      // dread 與心跳
      spikeV *= Math.exp(-rawDt / 5);
      const baseD = rel ? 0.03 : 0.04 + 0.36 * I;
      const want = d.chase ? 1 : clamp(baseD + wave * (0.25 + 0.25 * I) + spikeV, 0, 1);
      dread += (want - dread) * Math.min(1, rawDt * (want > dread ? 2.2 : 0.8));
      beat += rawDt * (58 + 82 * dread) / 60;
      const p = beat % 1, lub = Math.exp(-p * 9), dub = p > 0.28 ? Math.exp(-(p - 0.28) * 11) * 0.6 : 0;
      pulse = clamp((lub + dub) * clamp((dread - 0.42) / 0.4, 0, 1), 0, 1);
      fx.base(1 - 0.12 * dread, 0.0035 * dread, 1 - 0.18 * dread);
    },
  };
  return d;
}
