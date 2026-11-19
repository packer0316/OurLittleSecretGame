import { clamp } from './sense.js';

/**
 * 恐怖導演的輸出端：後製（合約 C）、聲音（合約 D）、燈光（合約 B）、手電筒、鏡頭晃動與衝臉覆蓋層。
 * 每一項在對應合約還沒實作時都有回退做法，所以單獨存在也能運作。
 * 光敏安全：畫面 glitch 最短間隔 0.4 秒（每秒至多 2.5 次），手電筒與燈光一律平滑過渡。
 */
export function createFx(game) {
  const opts = { pan: 0, dist: 2, intensity: 1 };
  const queue = Array.from({ length: 20 }, () => ({ t: -1, kind: '', pan: 0, dist: 2, intensity: 1 }));
  const bases = { vignette: { base: 0.9, written: NaN, uniform: null }, grain: { base: 0.03, written: NaN, uniform: null }, aberration: { base: 0.0012, written: NaN, uniform: null } };
  const log = []; // 最近播放的聲音（除錯／測試用）
  let map = null, time = 0;
  let glitchAmt = 0, glitchDur = 0.2, glitchT = 9, lastGlitch = -9;
  let flashMul = 1, flashTo = 1, flashRate = 20, pattern = null, patIdx = 0, patT = 0;
  let lightTo = null, lightCur = null, lightRate = null, lightFlames = null, flameOff = null;
  let gMul = 1, gFog = 0, gAmb = 1, gMulTo = 1, gFogTo = 0, gAmbTo = 1, gRate = 2; // 事件圖層（乘在導演的基礎值上）
  let bMul = 1, bFog = 0, bAmb = 1; // 導演依 dread 設定的基礎值
  // 地圖沒有提供 fx 接縫時（home / road）的回退：直接調整場景裡的燈與霧。
  // 每盞燈記住「上次我寫了多少」，數值被地圖改過就把新值當成新的基準，所以會閃爍的燈也能正確疊乘。
  let dimmers = null, fogBase = 0, fogWritten = NaN;
  let shakeAmt = 0, shakeT = 0, shakeDur = 0;
  let tensionSent = -1, tensionT = 0;
  let rushEl = null, rushT = -1;

  const trackBase = (u, name) => {
    const un = u[name], st = bases[name];
    if (!un) return null;
    if (st.uniform !== un || un.value !== st.written) { st.base = un.value; st.uniform = un; }
    return st;
  };
  const writeBase = (u, name, add) => { const st = trackBase(u, name); if (st) { st.uniform.value = st.base + add; st.written = st.uniform.value; } };

  const fx = {
    log,
    attach(m) {
      map = m; time = 0; glitchT = 9; lastGlitch = -9; flashMul = flashTo = 1; pattern = null;
      gMul = gMulTo = 1; gFog = gFogTo = 0; gAmb = gAmbTo = 1; bMul = 1; bFog = 0; bAmb = 1; shakeAmt = 0; shakeT = shakeDur = 0; tensionSent = -1; log.length = 0; rushT = -1;
      for (const q of queue) q.t = -1;
      dimmers = null; fogWritten = NaN;
      if (!map.fx) {
        dimmers = [];
        map.scene.traverse((o) => {
          if (!o.isLight || o.userData.poolSlot) return;
          for (let p = o; p; p = p.parent) if (p === game.player.rig) return;
          dimmers.push({ light: o, base: o.intensity, written: NaN, amb: !!(o.isHemisphereLight || o.isAmbientLight || o.isDirectionalLight) });
        });
      }
      const n = map.lights?.length || 0;
      lightTo = new Float32Array(n).fill(1); lightCur = new Float32Array(n).fill(1); lightRate = new Float32Array(n).fill(4);
      // 每盞燈附近的燭火（熄燈時一起熄）
      lightFlames = []; flameOff = new Uint8Array(map.flames?.length || 0);
      for (let i = 0; i < n; i++) {
        const lp = map.lights[i].light.position, near = [];
        (map.flames || []).forEach((f, k) => { if (f.sp.position.distanceTo(lp) < 3.4) near.push(k); });
        lightFlames.push(near);
      }
    },
    detach() {
      fx.restoreLights(); fx.applyLights(1, true);
      if (map?.fx) { map.fx.lightMul = 1; map.fx.fogAdd = 0; map.fx.ambientMul = 1; }
      if (dimmers) {
        for (const L of dimmers) if (L.light.intensity === L.written) L.light.intensity = L.base;
        const f = map?.scene.fog; if (f && f.density === fogWritten) f.density = fogBase;
        dimmers = null;
      }
      const u = game.film?.uniforms;
      if (u) {
        for (const name of ['dread', 'glitch', 'pulse']) if (u[name]) u[name].value = 0;
        for (const name of Object.keys(bases)) { const st = bases[name]; if (st.uniform && st.uniform.value === st.written) st.uniform.value = st.base; st.uniform = null; st.written = NaN; }
      }
      game.audio.setTension?.(0);
      if (rushEl) { rushEl.remove(); rushEl = null; }
      map = null;
    },

    // ── 後製 ──
    /** 觸發一次畫面撕裂。回傳 false 表示太接近上一次而被略過（光敏安全）。 */
    glitch(amount = 0.6, dur = 0.22) {
      if (time - lastGlitch < 0.4) return false;
      lastGlitch = time; glitchAmt = amount; glitchDur = dur; glitchT = 0; return true;
    },
    get glitchValue() { return glitchT < glitchDur ? glitchAmt * (1 - glitchT / glitchDur) : 0; },
    writeFilm(dread, pulse) {
      const u = game.film?.uniforms; if (!u) return;
      const g = fx.glitchValue;
      if (u.dread) u.dread.value = dread;
      if (u.pulse) u.pulse.value = pulse;
      if (u.glitch) u.glitch.value = g;
      // 合約 C 尚未就緒時，用既有的暗角／顆粒／色散近似
      if (!u.dread || !u.glitch) {
        writeBase(u, 'vignette', u.dread ? 0 : dread * 0.5 + pulse * 0.14);
        writeBase(u, 'grain', (u.dread ? 0 : dread * 0.03) + (u.glitch ? 0 : g * 0.22));
        writeBase(u, 'aberration', (u.dread ? 0 : dread * 0.0022) + (u.glitch ? 0 : g * 0.03));
      }
    },

    // ── 聲音 ──
    /** pan：-1 左 … 1 右；dist：公尺 */
    sfx(kind, pan = 0, dist = 2, intensity = 1) {
      const a = game.audio;
      log.push(kind); if (log.length > 40) log.shift();
      if (!a?.ctx || !a.running) return;
      if (typeof a.horror === 'function') { opts.pan = clamp(pan, -1, 1); opts.dist = dist; opts.intensity = intensity; a.horror(kind, opts); return; }
      const near = clamp(1.4 - dist / 12, 0.25, 1) * intensity;
      switch (kind) {
        case 'breath': case 'gasp': a.breathCue?.(); break;
        case 'whisper': case 'stepBehind': case 'scrape': case 'static': a.presence?.(clamp(pan, -1, 1)); break;
        case 'stinger': a.storyCue?.('threat'); break;
        case 'sub': a.presence?.(0); break;
        case 'knock': a.doorKnock?.(0.3 * near); fx.sfxAt(0.34, 'knock1', pan, dist, intensity); fx.sfxAt(0.7, 'knock1', pan, dist, intensity * 0.8); break;
        case 'knock1': a.doorKnock?.(0.3 * near); break;
        case 'slam': a.doorKnock?.(1.1 * near); break;
        case 'bellFar': a.bell?.(0.3); break;
        case 'hum': a.woodenFish?.(2); break;
        case 'marble': a.click?.(); fx.sfxAt(0.3, 'tick1'); fx.sfxAt(0.52, 'tick1'); break;
        case 'tick1': a.click?.(); break;
        default: break;
      }
    },
    sfxAt(delay, kind, pan = 0, dist = 2, intensity = 1) {
      for (const q of queue) if (q.t < 0) { q.t = time + delay; q.kind = kind; q.pan = pan; q.dist = dist; q.intensity = intensity; return; }
    },
    /** 單一下輕敲（合約 D 的 knock1；沒有時退回既有的 doorKnock） */
    tap(strength = 0.2, pan = 0, dist = 3) {
      const a = game.audio; log.push('tap'); if (log.length > 40) log.shift();
      if (!a?.ctx || !a.running) return;
      if (typeof a.horror === 'function') { opts.pan = clamp(pan, -1, 1); opts.dist = dist; opts.intensity = clamp(strength * 4, 0.2, 1.4); if (a.horror('knock1', opts)) return; }
      a.doorKnock?.(strength);
    },
    duck(sec) { game.audio.duck?.(sec); },
    tension(x, dt) {
      tensionT -= dt;
      if (tensionT > 0 || Math.abs(x - tensionSent) < 0.012) return;
      tensionT = 0.1; tensionSent = x; game.audio.setTension?.(x);
    },
    panOf(bearing) { return clamp(-Math.sin(bearing), -1, 1); },

    // ── 燈光 ──
    /** 導演的基礎燈光／霧／環境光（合約 B：寫入 map.fx，由地圖 update 套用） */
    base(mul, fog, amb) { bMul = mul; bFog = fog; bAmb = amb; },
    /** 事件暫時壓暗整個場景：燈光倍率、額外的霧、環境光倍率。dim(1,0,1) 還原。 */
    dim(mul, fog, amb, rate = 2) { gMulTo = mul; gFogTo = fog; gAmbTo = amb; gRate = rate; },
    setLight(i, target, rate = 5) { if (lightTo && i < lightTo.length) { lightTo[i] = target; lightRate[i] = rate; } },
    setFlames(i, on) { const fl = map?.flames; if (!fl || !lightFlames[i]) return; for (const k of lightFlames[i]) { flameOff[k] = on ? 0 : 1; fl[k].sp.visible = !!on; } },
    /** 把玩家周圍（同一層樓）所有燭火的火苗一起熄掉；restoreLights 會全部點回來 */
    snuffFlames(x, y, z, radius) {
      const fl = map?.flames; if (!fl) return;
      for (let k = 0; k < fl.length; k++) { const p = fl[k].sp.position; if (Math.abs(p.y - y) < 5 && Math.hypot(p.x - x, p.z - z) < radius) { flameOff[k] = 1; fl[k].sp.visible = false; } }
    },
    restoreLights(rate = 3) {
      if (!lightTo) return;
      for (let i = 0; i < lightTo.length; i++) { lightTo[i] = 1; lightRate[i] = rate; }
      const fl = map?.flames; if (fl) for (let k = 0; k < flameOff.length; k++) if (flameOff[k]) { flameOff[k] = 0; fl[k].sp.visible = true; }
    },
    applyLights(dt, snap = false) {
      const ls = map?.lights; if (!ls || !lightTo) return;
      for (let i = 0; i < lightTo.length; i++) {
        if (lightCur[i] === lightTo[i] && !snap) continue;
        const d = lightTo[i] - lightCur[i], st = lightRate[i] * dt;
        lightCur[i] = snap || Math.abs(d) <= st ? lightTo[i] : lightCur[i] + Math.sign(d) * st;
        ls[i].mul = lightCur[i];
      }
    },

    // ── 手電筒 ──
    flash(target, rate = 20) { flashTo = target; flashRate = rate; pattern = null; },
    /** 依序播放 [秒數, 亮度] 的閃爍樣式，播完停在最後一格的亮度 */
    flashPattern(p) { pattern = p; patIdx = 0; patT = 0; flashTo = p[0][1]; flashRate = 26; },
    get flashMul() { return flashMul; },

    shake(amount, dur = 0.3) { shakeAmt = amount; shakeDur = dur; shakeT = 0; },

    // ── 被抓到那一刻的衝臉 ──
    prepareRush() {
      if (rushEl) return;
      const tex = game.assets.images?.apparition;
      const el = document.createElement('div'); el.id = 'horror-rush'; el.setAttribute('aria-hidden', 'true');
      const cv = document.createElement('canvas'); cv.width = 512; cv.height = 512;
      const c = cv.getContext('2d');
      c.fillStyle = '#000'; c.fillRect(0, 0, 512, 512);
      try { const img = tex?.image; if (img) { const w = img.width, s = w * 0.62; c.drawImage(img, (w - s) / 2, 0, s, s, 0, 0, 512, 512); } } catch { /* 沒有圖就只用紅布 */ }
      const cloth = document.createElement('i');
      el.append(cv, cloth); document.body.appendChild(el); rushEl = el;
    },
    rush() {
      if (!rushEl) return;
      rushEl.classList.remove('go'); void rushEl.offsetWidth; rushEl.classList.add('go'); rushT = 0;
    },
    get rushing() { return rushT >= 0; },

    update(dt, rawDt) {
      time += rawDt;
      glitchT += rawDt;
      for (let i = 0; i < queue.length; i++) { const q = queue[i]; if (q.t >= 0 && time >= q.t) { q.t = -1; fx.sfx(q.kind, q.pan, q.dist, q.intensity); } }
      if (rushT >= 0) { rushT += rawDt; if (rushT > 1.7) { rushT = -1; rushEl?.classList.remove('go'); } }
      // 整體燈光
      const k = Math.min(1, rawDt * gRate);
      gMul += (gMulTo - gMul) * k; gFog += (gFogTo - gFog) * k; gAmb += (gAmbTo - gAmb) * k;
      const mf = map?.fx;
      if (mf) { mf.lightMul = bMul * gMul; mf.fogAdd = bFog + gFog; mf.ambientMul = bAmb * gAmb; }
      else if (dimmers) {
        const lm = bMul * gMul, am = bAmb * gAmb;
        for (let i = 0; i < dimmers.length; i++) {
          const L = dimmers[i], l = L.light; if (l.userData.horrorOwned) continue;
          if (l.intensity !== L.written) L.base = l.intensity;
          l.intensity = L.written = L.base * (L.amb ? am : lm);
        }
        const f = map.scene.fog;
        if (f && f.density !== undefined) { if (f.density !== fogWritten) fogBase = f.density; f.density = fogWritten = fogBase + bFog + gFog; }
      }
      fx.applyLights(rawDt);
      // 手電筒
      if (pattern) {
        patT += dt;
        while (pattern && patT >= pattern[patIdx][0]) { patT -= pattern[patIdx][0]; patIdx++; if (patIdx >= pattern.length) { pattern = null; break; } flashTo = pattern[patIdx][1]; }
      }
      if (flashMul !== flashTo) { const d = flashTo - flashMul, st = flashRate * rawDt; flashMul = Math.abs(d) <= st ? flashTo : flashMul + Math.sign(d) * st; }
      if (flashMul !== 1) game.player.flash.intensity *= flashMul;
      // 鏡頭晃動（只影響這一幀的攝影機，Player 下一幀會重新同步）
      if (shakeT < shakeDur) {
        shakeT += rawDt;
        const a = shakeAmt * (1 - shakeT / shakeDur), cam = game.camera;
        cam.rotation.z += Math.sin(time * 71) * a; cam.rotation.x += Math.sin(time * 53 + 1.3) * a * 0.6;
        cam.updateMatrixWorld();
      }
    },
  };
  return fx;
}
