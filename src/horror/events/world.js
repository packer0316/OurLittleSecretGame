/**
 * 環境異變與假警報：燭火一盞盞熄滅、佛像轉頭、跟著腳步的敲擊、濕腳印、小手印、
 * 童鞋、彈珠，以及「只有聲音、什麼都沒出現」的假警報與死寂。
 * 事件介面同 ghosts.js。
 */

// 住處：窗玻璃上可以出現手印的位置（避開窗框）
const HOME_GLASS = [[-0.35, 1.42], [0.15, 1.55], [1.2, 1.38], [1.62, 1.5], [1.95, 2.18], [0.3, 2.2]];

export function worldEvents(h) {
  const { sense: s, fx, figs, props, rng, map } = h;
  const spot = { x: 0, y: 0, z: 0, bearing: 0, dist: 0 };
  const hit = { x: 0, z: 0, nx: 0, nz: 0, dist: 0, u0: 0, u1: 0 };
  const evs = [];

  // ── 身後的燭火一盞一盞熄滅 ──
  if (map.lights?.length) {
    const ls = map.lights, order = new Int16Array(ls.length), score = new Float32Array(ls.length);
    let n = 0, idx = 0, t = 0, phase = 0, a = null, wantFig = false;
    const eligible = (L) => L.gate > 0.5 && L.base > 0 && s.dist(L.light.position.x, L.light.position.z) < 24 && Math.abs(L.light.position.y - s.feet) < 7;
    const count = () => { let c = 0; for (let i = 0; i < ls.length; i++) if (eligible(ls[i])) c++; return c; };
    const ev = {
      id: 'candles_out', label: '身後的燈火一盞一盞熄滅', maps: ['temple'], tier: 2, family: 'lights', minI: 0.4, cooldown: 140, weight: 1.2,
      can: () => !h.story?.chase && count() >= 3,
      start() {
        n = 0;
        for (let i = 0; i < ls.length; i++) {
          if (!eligible(ls[i])) continue;
          const p = ls[i].light.position, d = s.dist(p.x, p.z) || 1;
          const behind = -((p.x - s.px) * s.fwd.x + (p.z - s.pz) * s.fwd.z) / d;
          const sc = behind * 9 + d; let k = n++;
          while (k > 0 && score[k - 1] < sc) { score[k] = score[k - 1]; order[k] = order[k - 1]; k--; }
          score[k] = sc; order[k] = i;
        }
        if (n < 3) return false;
        n = Math.min(n, 7); idx = 0; t = 0.5; phase = 0; a = null; wantFig = h.intensity >= 0.5 && rng() < 0.5;
        const p0 = ls[order[0]].light.position; h.setFocus(p0.x, p0.y, p0.z);
        return true;
      },
      update(dt) {
        if (phase === 0) {
          t -= dt;
          if (t <= 0) {
            const i = order[idx++], p = ls[i].light.position;
            fx.setLight(i, 0, 7); fx.setFlames(i, false); h.director.spike(0.05);
            // 每一盞都是被「吹」熄的；最後一盞之後是一句貼耳的低語
            fx.sfx(idx === n ? 'whisper' : 'breath', fx.panOf(s.bearing(p.x, p.z)), idx === n ? 1.5 : Math.max(1.5, s.dist(p.x, p.z) * 0.5), idx === n ? 0.8 : 0.5);
            t = (0.7 + rng() * 0.55) * (1 - 0.4 * idx / n);
            if (idx >= n) { phase = 1; t = 0; fx.dim(0.22, 0.006, 0.55, 3); fx.snuffFlames(s.px, s.feet + 1, s.pz, 30); fx.duck(3.5); h.director.spike(0.3); }
          }
          return false;
        }
        t += dt;
        if (phase === 1) { // 全暗
          if (t > 1.4 && wantFig) { // 第一盞熄掉的燈旁邊，亮回來時站著人
            wantFig = false;
            const p = ls[order[0]].light.position, d = s.dist(p.x, p.z) || 1;
            const x = p.x + ((s.px - p.x) / d) * 1.2, z = p.z + ((s.pz - p.z) / d) * 1.2, g = s.standable(x, z);
            if (!Number.isNaN(g) && s.los(s.eye.x, s.eye.y, s.eye.z, x, g + 1.3, z) && (a = figs.take('shadow', ev))) { a.show(x, g, z, 0, 'bowed'); a.facePlayer(); h.setFocus(x, g + 1.4, z); }
          }
          if (t > 2.9) { phase = 2; t = 0; fx.restoreLights(1.6); fx.dim(1, 0, 1, 1.4); fx.sfx('sub', 0, 6, 0.7); }
          return false;
        }
        if (a?.active) { if (a.seen > 0.5 || t > 2.2) a.fadeTo(0, 3); if (a.alpha <= 0.02) a.hide(); }
        return t > 3.6;
      },
      stop() { fx.restoreLights(3); fx.dim(1, 0, 1, 2); figs.release(ev); },
    };
    evs.push(ev);
  }

  // ── 佛像在你看著的時候，慢慢把頭轉過來 ──
  if (map.storyWorld?.statueFx && map.statues?.length) {
    const sw = map.storyWorld, st = map.statues;
    let t = 0, second = false, nearest = null;
    const near = () => { let c = 0, best = 1e9; nearest = null; for (const o of st) { if (!o.userData.head || !o.visible) continue; const d = s.dist(o.position.x, o.position.z); if (Math.abs(o.position.y - s.feet) > 4 || d > 17) continue; c++; if (d < best) { best = d; nearest = o; } } return c; };
    evs.push({
      id: 'statues_stare', label: '佛像在你看著的時候，慢慢把頭轉過來', maps: ['temple'], tier: 2, family: 'statues', minI: 0.5, cooldown: 120, weight: 1.1, background: true,
      can: () => (h.story?.state?.chapter || 1) >= 2 && near() >= 2,
      start(force) {
        if (near() < (force ? 1 : 2)) return false;
        sw.statueFx.stare = 1; t = 0; second = false;
        const p = nearest.position; fx.sfx('scrape', fx.panOf(s.bearing(p.x, p.z)), s.dist(p.x, p.z), 0.6); h.director.spike(0.15);
        h.setFocus(p.x, p.y + 1.6 * nearest.scale.y, p.z); return true;
      },
      update(dt) {
        t += dt;
        if (t > 4.5 && !second) { second = true; fx.sfx('scrape', 0, 8, 0.4); }
        return t > 15;
      },
      stop() { sw.statueFx.stare = 0; },
    });
  }

  // ── 跟著腳步的敲擊聲：你停，它多敲一下 ──
  {
    let t = 0, pend = -1, n = 0, stopT = 0, extra = 0, pan = 0.6;
    evs.push({
      id: 'knock_follow', label: '跟著腳步的敲擊聲，你停下來它多敲一下', maps: ['temple', 'road', 'home'], tier: 1, family: 'knock', minI: 0.1, cooldown: 70, weight: 1.2,
      can: () => s.moveTime > 1.2,
      start() { t = 0; pend = -1; n = 0; stopT = 0; extra = 0; pan = rng() < 0.5 ? -0.7 : 0.7; return true; },
      update(dt) {
        t += dt;
        if (s.stepped && s.speed > 0.7) { n++; pend = 0.27; }
        if (pend >= 0) { pend -= dt; if (pend < 0) fx.tap(0.12 + 0.05 * rng(), pan, 4); }
        if (n >= 3 && s.speed < 0.25) {
          stopT += dt;
          if (extra === 0 && stopT > 0.6) { extra = 1; fx.tap(0.26, pan, 2.5); h.director.spike(0.1); }
          if (extra === 1 && stopT > 2.0) { extra = 2; fx.tap(0.15, pan, 2); }
          if (stopT > 3.2) return true;
        } else { if (extra > 0) return true; stopT = 0; }
        return t > 20;
      },
      stop() {},
    });
  }

  // ── 潮濕的腳印從身後一路出現到腳邊 ──
  {
    let t = 0, x = 0, y = 0, z = 0, left = true, n = 0, phase = 0, interval = 0.55;
    evs.push({
      id: 'wet_prints', label: '濕腳印從身後一路走到你腳邊', maps: ['temple', 'road', 'home'], tier: 2, family: 'prints', minI: 0.25, cooldown: 110, weight: 1,
      can: () => true,
      start(force) {
        let ok = false;
        if (h.id === 'home') { ok = s.dist(1.65, 3.3) > 2.4 && (force || !s.inView(1.65, 0.1, 3.3, 0.1)); if (ok) { spot.x = 1.65; spot.y = 0; spot.z = 3.3; } }
        else ok = s.pickSpot(spot, rng, { b0: 2.3, b1: 3.98, d0: 4.5, d1: 7, tries: 12 }) || s.pickSpot(spot, rng, { d0: 4, d1: 7, tries: 12 }) || (force && s.pickSpot(spot, rng, { d0: 3.5, d1: 6, tries: 16, hidden: false }));
        if (!ok) return false;
        x = spot.x; y = spot.y; z = spot.z; n = 0; t = 0; interval = 0.55; phase = 0; left = rng() < 0.5;
        h.setFocus(x, y, z); return true;
      },
      update(dt) {
        t += dt;
        if (phase === 1) return t > 2.6;
        if (t < interval) return false;
        t = 0;
        const dx = s.px - x, dz = s.pz - z, d = Math.hypot(dx, dz);
        if (d < 0.8 || n >= 24) { phase = 1; fx.sfxAt(1.0, 'breath', 0, 0.3, 1); h.director.spike(0.22); return false; }
        const ux = dx / d, uz = dz / d, nx = x + ux * 0.5, nz = z + uz * 0.5, g = s.world.probe(nx, nz, y).g;
        if (Math.abs(g - y) > 0.3 || !s.los(x, y + 0.35, z, nx, g + 0.35, nz)) { phase = 1; return false; }
        x = nx; z = nz; y = g;
        const sd = left ? 1 : -1;
        props.prints.add(x + uz * sd * 0.085, y, z - ux * sd * 0.085, Math.atan2(ux, uz) + sd * 0.1, left);
        left = !left; n++; interval = Math.max(0.3, interval * 0.94);
        fx.sfx('stepBehind', fx.panOf(s.bearing(x, z)), d, 0.35 + 0.025 * n); h.setFocus(x, y, z);
        return false;
      },
      stop() {},
    });
  }

  // ── 牆上多出來的小手印 ──
  {
    let t = 0;
    // 只挑看起來和碰撞完全一致的牆面：寺廟的薄牆、山村的整棟屋子與作坊牆
    const wall = h.id === 'road'
      ? (b) => { const w = Math.min(b.x2 - b.x1, b.z2 - b.z1), l = Math.max(b.x2 - b.x1, b.z2 - b.z1); return (w <= 0.3 && l >= 1.8) || (w >= 4.5 && b.y2 >= 3.4); }
      : (b) => Math.min(b.x2 - b.x1, b.z2 - b.z1) <= 0.62 && Math.max(b.x2 - b.x1, b.z2 - b.z1) >= 2.5;
    evs.push({
      id: 'handprints', label: '牆上多出幾枚小孩的手印', maps: ['temple', 'road', 'home'], tier: 1, family: 'marks', minI: 0.15, cooldown: h.id === 'home' ? 240 : 100, weight: 1,
      can: () => true,
      start(force) {
        t = 0;
        if (h.id === 'home') { // 七樓的窗玻璃
          if (!force && (s.inView(0.75, 1.8, -4, 0.1) || s.dist(0.75, -4) < 1.6)) return false;
          const st = Math.floor(rng() * HOME_GLASS.length), k = 2 + Math.floor(rng() * 2);
          for (let i = 0; i < k; i++) { const g = HOME_GLASS[(st + i) % HOME_GLASS.length]; props.hands.add(g[0] + (rng() - 0.5) * 0.08, g[1], -3.987, 0, 1, (rng() - 0.5) * 1.1, true, 0.95 + rng() * 0.2); }
          const g0 = HOME_GLASS[st]; h.setFocus(g0[0], g0[1], -3.98); fx.sfxAt(0.5, 'knock', fx.panOf(s.bearing(0.75, -4)), s.dist(0.75, -4), 0.5);
          return true;
        }
        const yb = s.feet;
        for (let i = 0; i < 12; i++) {
          const b = force && i < 6 ? (rng() - 0.5) * 1.2 : (1.1 + rng() * 2.1) * (rng() < 0.5 ? 1 : -1), an = s.yaw + b;
          if (!s.rayWall(hit, s.px, s.pz, -Math.sin(an), -Math.cos(an), yb + 0.9, 6.5, wall)) continue;
          if (!force && s.inView(hit.x, yb + 0.9, hit.z, 0.1)) continue;
          const along = hit.nx ? hit.z : hit.x;
          if (along < hit.u0 + 0.5 || along > hit.u1 - 0.5) continue; // 太靠近牆角
          if (h.id === 'road' && Math.abs(along - (hit.u0 + hit.u1) / 2) < 0.75) continue; // 屋子正中央是門板
          if (!s.los(s.eye.x, s.eye.y, s.eye.z, hit.x + hit.nx * 0.06, yb + 0.8, hit.z + hit.nz * 0.06)) continue; // 被神桌、佛座擋住的牆面
          const k = 2 + Math.floor(rng() * 3);
          for (let j = 0; j < k; j++) {
            const off = (j - (k - 1) / 2) * (0.16 + rng() * 0.1), hy = yb + 0.52 + rng() * 0.5;
            props.hands.add(hit.x + (hit.nx ? 0 : off), hy, hit.z + (hit.nx ? off : 0), hit.nx, hit.nz, (rng() - 0.5) * 1.3, h.id === 'road' ? 'ash' : false, 0.85 + rng() * 0.25);
          }
          h.setFocus(hit.x, yb + 0.8, hit.z);
          fx.sfxAt(0.6, 'knock', fx.panOf(s.bearing(hit.x, hit.z)), hit.dist, 0.7);
          return true;
        }
        return false;
      },
      update(dt) { t += dt; return t > 1.6; },
      stop() {},
    });
  }

  // ── 童鞋：小雨找不到的那一隻，一直出現在你的路上 ──
  {
    const shoe = props.shoe;
    let t = 0, look = 0, away = 0, noticed = false, moves = 0;
    const ev = {
      id: 'lost_shoe', label: '一隻童鞋出現在路上，移開視線後換了位置', maps: ['temple', 'road', 'home'], tier: 1, family: 'shoe', minI: 0.1, cooldown: 160, weight: 0.9, background: true,
      can: () => !shoe.visible,
      start(force) {
        let ok;
        if (h.id === 'home') { ok = force || !s.inView(1.38, 0.05, 3.33, 0.1); if (ok) { spot.x = 1.38; spot.y = 0.014; spot.z = 3.3; } } // 玄關的鞋旁邊（踏墊上）
        else ok = s.pickSpot(spot, rng, { d0: 2.5, d1: 5.5, tries: 12, chest: 0.1 }) || (force && s.pickSpot(spot, rng, { b0: -0.4, b1: 0.4, d0: 2, d1: 3.5, hidden: false, tries: 12, chest: 0.1 }));
        if (!ok) return false;
        shoe.position.set(spot.x, spot.y, spot.z); shoe.rotation.y = h.id === 'home' ? 3.3 : rng() * 6.28; shoe.visible = true;
        h.setFocus(spot.x, spot.y + 0.03, spot.z); t = 0; look = 0; away = 0; noticed = false; moves = 0; return true;
      },
      update(dt) {
        t += dt;
        const p = shoe.position, vis = s.sees(p.x, p.y + 0.05, p.z);
        away = vis ? 0 : away + dt;
        if (vis && s.dist(p.x, p.z) < 6 && s.gaze(p.x, p.y, p.z) < 0.3) look += dt;
        if (look > 0.4 && !noticed) { noticed = true; h.director.spike(0.08); }
        if (noticed && away > 2.2) {
          if (moves < 2 && h.id !== 'home' && s.pickSpot(spot, rng, { b0: 2.3, b1: 3.98, d0: 1.1, d1: 2.4, tries: 8, chest: 0.1 })) { // 它跟來了
            p.set(spot.x, spot.y, spot.z); shoe.rotation.y = Math.atan2(s.px - p.x, s.pz - p.z); moves++; noticed = false; look = 0; away = 0; h.setFocus(p.x, p.y + 0.03, p.z);
          } else { shoe.visible = false; return true; }
        }
        if (t > 90 && away > 1) { shoe.visible = false; return true; }
        return false;
      },
      stop() { shoe.visible = false; },
    };
    evs.push(ev);
  }

  // ── 一顆彈珠從暗處滾到腳邊 ──
  {
    const m = props.marble;
    let t = 0, sx = 0, sz = 0, tx = 0, tz = 0, y = 0, dur = 1, rest = 0;
    evs.push({
      id: 'marble', label: '一顆彈珠從暗處滾到腳邊', maps: ['temple'], tier: 1, family: 'marble', minI: 0.3, cooldown: 150, weight: 0.9, background: true,
      can: () => !m.visible && s.indoor,
      start(force) {
        const ok = s.pickSpot(spot, rng, { d0: 4.5, d1: 7.5, tries: 12, chest: 0.2 }) || (force && s.pickSpot(spot, rng, { b0: -0.5, b1: 0.5, d0: 4, d1: 7, hidden: false, tries: 14, chest: 0.2 }));
        if (!ok) return false;
        sx = spot.x; sz = spot.z; y = spot.y + 0.028;
        const d = spot.dist, ux = (s.px - sx) / d, uz = (s.pz - sz) / d, sd = rng() < 0.5 ? 1 : -1;
        tx = s.px + ux * 0.5 + uz * sd * 0.4; tz = s.pz + uz * 0.5 - ux * sd * 0.4;
        dur = (d + 0.5) / 1.7; t = 0; rest = 0;
        fx.sfx('marble', fx.panOf(spot.bearing), d, 1); // 玻璃珠落地、彈兩下、滾過來
        m.position.set(sx, y, sz); m.visible = true; h.setFocus(sx, y, sz); return true;
      },
      update(dt) {
        t += dt;
        if (rest > 0) { rest += dt; if (rest > 14 && !s.sees(m.position.x, m.position.y, m.position.z)) { m.visible = false; return true; } return rest > 40; }
        const u = Math.min(1, t / dur), e = 1 - (1 - u) * (1 - u);
        const bounce = t < 0.75 ? Math.abs(Math.sin(t * 9)) * 0.06 * (1 - t / 0.75) : 0;
        m.position.set(sx + (tx - sx) * e, y + bounce, sz + (tz - sz) * e); m.rotation.x += dt * 14 * (1 - u); h.setFocus(m.position.x, m.position.y, m.position.z);
        if (u >= 1) { rest = 1e-3; h.director.spike(0.08); }
        return false;
      },
      stop() { m.visible = false; },
    });
  }

  // ── 假警報：只有聲音，什麼都沒出現 ──
  {
    const cue = (id, label, maps, minI, cooldown, weight, begin, run, tier = 2) => {
      const st = { t: 0, k: 0 };
      evs.push({ id, label, maps, tier, family: 'fa', minI, cooldown, weight, falseAlarm: true, can: () => true, start() { st.t = 0; st.k = 0; begin?.(st); return true; }, update(dt) { st.t += dt; return run(st); }, stop() { fx.dim(1, 0, 1, 2); } });
    };
    const side = () => (rng() < 0.5 ? -1 : 1);
    cue('fa_swell', '低頻湧上、燈光壓暗，然後什麼都沒有', ['temple', 'road', 'home'], 0.25, 130, 0.6,
      () => { fx.sfx('sub', 0, 3, 1); fx.dim(0.55, 0.004, 0.7, 0.8); h.director.spike(0.3); },
      (st) => { if (st.t > 2.6 && !st.k) { st.k = 1; fx.duck(3.5); fx.dim(1, 0, 1, 0.6); } return st.t > 4.6; });
    cue('fa_slam', '遠處一聲門板，接著一片死寂', ['temple', 'road'], 0.2, 150, 0.55,
      () => { fx.sfx('slam', side() * 0.7, 6, 1); h.director.spike(0.22); },
      (st) => { if (st.t > 0.7 && !st.k) { st.k = 1; fx.duck(4); } return st.t > 2.6; });
    cue('fa_whisper', '貼著耳朵的一句含糊低語', ['temple', 'road', 'home'], 0.15, 110, 0.6,
      () => { fx.sfx('whisper', side() * 0.85, 0.4, 1); h.director.spike(0.12); },
      (st) => st.t > 2.2, 1);
    cue('fa_hum', '遠處有人哼著走音的童謠', ['temple', 'road', 'home'], 0.3, 180, 0.5,
      () => { fx.sfx('hum', side() * 0.6, 9, 0.8); h.director.spike(0.1); },
      (st) => st.t > 6, 1);
    cue('fa_steps', '身後的腳步聲快步靠近，回頭沒有人', ['temple', 'road', 'home'], 0.3, 140, 0.6,
      null,
      (st) => {
        const at = [0, 0.45, 0.85, 1.18][st.k];
        if (st.k < 4 && st.t >= at) { fx.sfx('stepBehind', 0, 6 - st.k * 1.4, 0.6 + st.k * 0.13); st.k++; if (st.k === 4) h.director.spike(0.25); }
        return st.t > 3.2;
      });
    cue('dead_silence', '所有環境聲突然抽空', ['temple', 'road', 'home'], 0.2, 160, 0.5,
      () => { fx.duck(7); },
      (st) => { if (st.t > 6.4 && !st.k) { st.k = 1; fx.sfx('bellFar', 0, 15, 0.7); } return st.t > 8; }, 1);
    cue('fa_howl', '遠處的狗吹螺（民間說牠們看得見）', ['temple', 'road'], 0.25, 200, 0.5,
      () => { fx.sfx('howl', side() * 0.7, 10, 0.9); h.director.spike(0.12); },
      (st) => st.t > 5, 1);
    cue('fa_sob', '不知道從哪裡傳來的啜泣', ['temple', 'road', 'home'], 0.35, 220, 0.5,
      () => { fx.sfx('sob', side() * 0.6, h.id === 'home' ? 9 : 14, 0.8); h.director.spike(0.14); },
      (st) => st.t > 6, 1);
  }

  return evs;
}
