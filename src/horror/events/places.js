/**
 * 各地圖專屬的事件。
 * home：慢熱的不安──門縫的腳影、電視倒影、七樓窗外的臉、檯燈暗一下。
 * road：空村的被注視感──窗後的臉、候車亭裡的人、車燈前有東西走過。
 */

// 山村四棟屋子的窗：[x, y, z, 法線x, 法線z]。位置取在玻璃前面、鐵窗花後面（與 road/village.js 的 house() 對應）。
const ROAD_WINDOWS = [
  [-9.92, 1.62, 2.06, 0, 1], [-6.08, 1.62, 2.06, 0, 1], [-4.94, 1.62, 1.16, 1, 0],
  [6.08, 1.62, 2.56, 0, 1], [9.92, 1.62, 2.56, 0, 1], [6.32, 3.55, 2.56, 0, 1], [9.68, 3.55, 2.56, 0, 1],
  [4.94, 1.62, -1.2, -1, 0], [4.94, 1.62, 1.2, -1, 0], [4.94, 3.55, -1.2, -1, 0], [4.94, 3.55, 1.2, -1, 0],
  [-6.76, 1.62, -12.44, 0, 1], [-5.44, 1.62, -14.32, 1, 0],
  [-9.92, 1.62, -27.94, 0, 1], [-6.08, 1.62, -27.94, 0, 1], [-4.94, 1.62, -32.44, 1, 0], [-4.94, 1.62, -29.56, 1, 0],
];
const ease = (u) => u * u * (3 - 2 * u);
const wrap = (v) => Math.atan2(Math.sin(v), Math.cos(v));
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export function placeEvents(h) {
  const { sense: s, fx, figs, props, rng, map } = h;
  const evs = [];

  if (h.id === 'home') {
    // ── 門縫透進來的光，被兩隻腳擋住 ──
    {
      const df = props.doorFeet;
      let t = 0, phase = 0, hold = 10, shifted = false;
      const place = (x) => { df.root.position.x = x; df.a.visible = x - 0.12 > 1.17 && x - 0.12 < 2.13; df.b.visible = x + 0.1 > 1.17 && x + 0.1 < 2.13; };
      evs.push({
        id: 'home_door_feet', label: '門縫下的光被一雙腳擋住', maps: ['home'], tier: 2, family: 'door', minI: 0.12, cooldown: 110, weight: 1.4,
        can: () => !df.root.visible && !map.storyWorld?.doorEventActive,
        start() { t = 0; phase = 0; hold = 9 + rng() * 8; shifted = false; df.b.position.x = 0.1; df.root.visible = true; place(2.4); h.setFocus(1.65, 0.03, 3.79); return true; },
        update(dt) {
          t += dt;
          if (phase === 0) { place(2.4 + (1.63 - 2.4) * ease(Math.min(1, t / 1.7))); if (t >= 1.7) { phase = 1; t = 0; } return false; }
          if (phase === 1) {
            const d = s.dist(1.65, 3.8);
            if (d < 2.2 && !shifted) { shifted = true; df.b.position.x = 0.15; fx.tap(0.08); h.director.spike(0.12); } // 你靠近時，其中一隻腳挪了一下
            if (d < 1.2 || t > hold) { phase = 2; t = 0; fx.sfx('stepBehind', fx.panOf(s.bearing(1.65, 3.8)), 3, 0.35); }
            return false;
          }
          place(1.63 + (0.85 - 1.63) * ease(Math.min(1, t / 1.4)));
          if (t >= 1.4) { df.root.visible = false; return true; }
          return false;
        },
        stop() { df.root.visible = false; },
      });
    }

    // ── 關著的電視，映出身後站著人 ──
    {
      const tv = props.tv, W = tv.z1 - tv.z0, UW = (0.9 * 0.42) / W, VH = (1.8 * 0.42) / (tv.y1 - tv.y0), VB = 0.7 - 0.797 * VH;
      let t = 0, phase = 0, alpha = 0, look = 0;
      evs.push({
        id: 'home_tv', label: '關著的電視映出身後站著的人', maps: ['home'], tier: 2, family: 'tv', minI: 0.2, cooldown: 150, weight: 1.2, background: true,
        can: () => { const d = s.dist(3.68, -0.7); return s.px < 3.0 && d > 1.2 && d < 4.4; },
        start() { t = 0; phase = 0; alpha = 0; look = 0; tv.mesh.material.opacity = 0; tv.mesh.visible = true; h.setFocus(3.67, 1.0, -0.7); return true; },
        update(dt) {
          t += dt;
          // 假想有人站在玩家身後 1.1 m；倒影出現在視線與鏡像點連線穿過螢幕的位置
          const dx = s.px - tv.x, dz = s.pz + 0.7, d = Math.hypot(dx, dz) || 1;
          const bx = s.px + (dx / d) * 1.1, bz = s.pz + (dz / d) * 1.1, mx = 2 * tv.x - bx;
          const tau = (tv.x - s.eye.x) / (mx - s.eye.x), zc = s.eye.z + tau * (bz - s.eye.z);
          const uc = (zc - tv.z0) / W;
          tv.tex.matrix.set(1 / UW, 0, -(uc - UW / 2) / UW, 0, 1 / VH, -VB / VH, 0, 0, 1);
          look = s.gaze(3.67, 1.0, -0.7) < 0.17 ? look + dt : Math.max(0, look - dt * 0.5);
          if (phase === 0 && (look > 0.75 || t > 16 || s.px > 3.0)) { phase = 1; if (look > 0.75) h.director.spike(0.12); }
          alpha += ((phase ? 0 : 0.2) - alpha) * Math.min(1, dt * (phase ? 6 : 1.1));
          tv.mesh.material.opacity = alpha;
          if (phase === 1 && alpha < 0.01) { tv.mesh.visible = false; return true; }
          return false;
        },
        stop() { tv.mesh.visible = false; },
      });
    }

    // ── 七樓的窗外，隔著雨有一張臉 ──
    {
      const wf = props.windowFigure;
      let t = 0, look = 0, alpha = 0, phase = 0;
      evs.push({
        id: 'home_window', label: '七樓的窗外，隔著雨有一張臉', maps: ['home'], tier: 2, family: 'window', minI: 0.3, cooldown: 170, weight: 1, background: true,
        can: () => !wf.visible && s.dist(0.75, -4) > 2.4,
        start(force) {
          const x = 0.05 + rng() * 0.5 + (rng() < 0.5 ? 1.0 : 0);
          if (!force && s.inView(x, 1.75, -4.1, 0.12)) return false;
          wf.position.set(x, 1.66 + rng() * 0.2, -4.06); wf.rotation.z = (rng() - 0.5) * 0.3; wf.material.opacity = 0; wf.visible = true;
          t = 0; look = 0; alpha = 0; phase = 0; h.setFocus(x, wf.position.y, -4.06); return true;
        },
        update(dt) {
          t += dt;
          const p = wf.position, vis = s.inView(p.x, p.y, p.z, -0.04);
          if (vis && s.gaze(p.x, p.y, p.z) < 0.2) look += dt;
          if (phase === 0 && (look > 0.45 || s.dist(p.x, p.z) < 2.1 || (t > 40 && !vis))) { phase = 1; if (look > 0.45) { h.director.spike(0.18); fx.sfx('gasp', 0, 1, 0.5); } }
          alpha += ((phase ? 0 : 0.5) - alpha) * Math.min(1, dt * (phase ? 9 : 0.8));
          if (phase) p.y -= dt * 0.9; // 往下沉出窗框
          wf.material.opacity = alpha;
          if (phase === 1 && alpha < 0.01) { wf.visible = false; return true; }
          return false;
        },
        stop() { wf.visible = false; },
      });
    }

    // ── 檯燈暗了一下 ──
    {
      let t = 0, k = 0;
      evs.push({
        id: 'home_lamp', label: '檯燈暗了一下，又亮回來', maps: ['home'], tier: 1, family: 'lamp', minI: 0.1, cooldown: 230, weight: 0.8,
        can: () => true,
        start() { t = 0; k = 0; fx.dim(0.3, 0, 0.75, 7); h.director.spike(0.1); return true; },
        update(dt) {
          t += dt;
          if (t > 0.6 && k === 0) { k = 1; fx.dim(1, 0, 1, 5); }
          if (t > 1.7 && k === 1) { k = 2; fx.dim(0.5, 0, 0.85, 6); }
          if (t > 2.2 && k === 2) { k = 3; fx.dim(1, 0, 1, 3); }
          return t > 3.2;
        },
        stop() { fx.dim(1, 0, 1, 3); },
      });
    }

    // ── 被拖動過的那張椅子上坐著人（住處唯一一次真正現身，保持克制：只出現一次、一看過去就散）──
    {
      let a = null, t = 0, phase = 0, look = 0, used = false, cx = -1.8, cz = -0.75;
      const chair = () => { // 椅子的碰撞圓會跟著它被拖動的位置
        const cs = s.world.circles;
        for (let i = 0; i < cs.length; i++) { const c = cs[i]; if (Math.abs(c.x + 1.8) < 0.3 && c.z > -1.7 && c.z < -0.3 && c.r > 0.3) { cx = c.x; cz = c.z; return true; } }
        return false;
      };
      const ev = {
        id: 'home_sitter', label: '自己動過的那張椅子上坐著人，一看過去就散了', maps: ['home'], tier: 2, family: 'sitter', minI: 0.36, cooldown: 900, weight: 2,
        can: () => !used && figs.free('woman') && (h.story?.state?.home?.step || 0) >= 4 && chair() && cz > -0.9 && s.dist(cx, cz) > 1.7,
        start(force) {
          if (!chair() || !figs.free('woman')) return false;
          if (!force && s.inView(cx, 1.0, cz, 0.15)) return false;
          a = figs.take('woman', ev); if (!a) return false;
          a.show(cx, 0.1, cz, Math.PI - 0.4, 'sit'); a.fig.lookAt?.(s.eye, { maxYaw: 80, speed: 1.1 });
          used = true; t = 0; phase = 0; look = 0; h.setFocus(cx, 1.05, cz); return true;
        },
        update(dt) {
          t += dt;
          if (!a.active) return true;
          if (phase === 0) {
            if (a.visibleNow && a.gaze < 0.3) look += dt;
            const caught = look > 0.35 || a.seen > 0.6; // 正眼看到，或用眼角餘光看了一陣子
            if (caught || a.dist < 1.3 || (t > 50 && !a.visibleNow)) {
              phase = 1; a.fadeTo(0, 3.5);
              if (caught) { h.director.spike(0.3); fx.sfx('gasp', 0, 1, 0.6); fx.duck(2.5); }
            }
            return false;
          }
          if (a.alpha <= 0.02) { a.hide(); return true; }
          return false;
        },
        stop() { figs.release(ev); },
      };
      evs.push(ev);
    }
  }

  if (h.id === 'road') {
    // ── 屋子的窗後有臉，手電筒照過去就沉下去 ──
    {
      const faces = props.faces, st = faces.map(() => ({ on: false, alpha: 0, look: 0, lit: 0, drop: false }));
      let t = 0;
      const ev = {
        id: 'road_faces', label: '屋子的窗後有臉在看，照過去就沉下去', maps: ['road'], tier: 1, family: 'faces', minI: 0.2, cooldown: 60, weight: 1.5, background: true,
        can: () => !st.some((q) => q.on),
        start(force) {
          let n = 0; const s0 = Math.floor(rng() * ROAD_WINDOWS.length);
          for (let k = 0; k < ROAD_WINDOWS.length && n < 2; k++) {
            const w = ROAD_WINDOWS[(s0 + k) % ROAD_WINDOWS.length], d = s.dist(w[0], w[2]);
            const front = (s.px - w[0]) * w[3] + (s.pz - w[2]) * w[4]; // 玩家在窗的正面多遠
            if (front < 2.5 || d < 4.5 || d > 17 || front < d * 0.45) continue;
            if (!s.los(s.eye.x, s.eye.y, s.eye.z, w[0] + w[3] * 0.25, w[1], w[2] + w[4] * 0.25)) continue;
            if (!force && s.gaze(w[0], w[1], w[2]) < 0.3) continue;
            const f = faces[n], q = st[n]; n++;
            const j = (rng() - 0.5) * 0.3;
            f.position.set(w[0] + (w[3] ? 0 : j), w[1] - 0.04 + rng() * 0.12, w[2] + (w[3] ? j : 0)); f.rotation.set(0, Math.atan2(w[3], w[4]), (rng() - 0.5) * 0.25, 'YXZ'); f.material.opacity = 0; f.visible = true;
            q.on = true; q.alpha = 0; q.look = 0; q.lit = 0; q.drop = false;
            if (n === 1) h.setFocus(f.position.x, f.position.y, f.position.z);
          }
          t = 0; return n > 0;
        },
        update(dt) {
          t += dt; let any = false;
          for (let i = 0; i < faces.length; i++) {
            const q = st[i], f = faces[i]; if (!q.on) continue; any = true;
            const p = f.position, d = s.dist(p.x, p.z);
            if (s.gaze(p.x, p.y, p.z) < 0.11) q.look += dt;
            if (s.flashAngle(p.x, p.y, p.z) < 0.2 && d < 17) q.lit += dt;
            if (!q.drop && (q.look > 0.3 || q.lit > 0.18 || d < 3.5 || t > 45)) { q.drop = true; if (t <= 45) h.director.spike(0.1); }
            q.alpha += ((q.drop ? 0 : 0.85) - q.alpha) * Math.min(1, dt * (q.drop ? 8 : 0.9));
            if (q.drop) p.y -= dt * 1.5;
            f.material.opacity = q.alpha;
            if (q.drop && q.alpha < 0.01) { q.on = false; f.visible = false; }
          }
          return !any;
        },
        stop() { for (let i = 0; i < faces.length; i++) { st[i].on = false; faces[i].visible = false; } },
      };
      evs.push(ev);
    }

    // ── 走過候車亭之後回頭：亭子裡站著人，背後是自己車子的大燈 ──
    {
      let a = null, t = 0, used = false;
      const ev = {
        id: 'road_shelter', label: '走過之後回頭，候車亭邊站著一個人', maps: ['road'], tier: 2, family: 'far', minI: 0.2, cooldown: 400, weight: 1.6,
        can: () => !used && s.pz < 15.5 && s.pz > -10 && figs.free('near'),
        start(force) {
          if (!force && s.inView(-2.85, 1.3, 22.1, 0.12)) return false;
          a = figs.take('near', ev); if (!a) return false;
          // 站在亭子靠馬路的那一端（背板是玻璃，站在裡面從村子這一側看不清楚）
          a.show(-2.85, 0, 22.1, 0, 'idle'); a.facePlayer(); a.fig.lookAt?.(s.eye); used = true;
          h.setFocus(-2.85, 1.4, 22.1); t = 0; return true;
        },
        update(dt) {
          t += dt;
          if (!a.active) return true;
          if (a.leaving) return false;
          // 被看到之後不久留：看一眼就移開，回頭已經不在；一直盯著，約 0.8 秒就在眼前抽搐消失
          if (a.seen > 0.15 && !a.visibleNow) { a.hide(); h.director.spike(0.2); return true; }
          if (a.seen > 0.8) { a.vanish('glitch'); h.director.spike(0.2); return false; }
          if (a.dist < 8) { if (a.visibleNow) a.vanish('glitch'); else a.hide(); }
          if (t > 70 && !a.visibleNow) a.hide();
          return false;
        },
        stop() { figs.release(ev); },
      };
      evs.push(ev);
    }

    // ── 紙紮行：趁你沒看，整排紙人連身體都轉過來對著你（合約 F 的 watchers；頭平常就會跟著轉，見 reactive.js）──
    {
      const ws = map.watchers || [];
      const inShop = () => s.px > 5.2 && s.px < 11.8 && s.pz < -14.8 && s.pz > -22.3;
      let t = 0, second = false, pan = 0;
      if (ws.length >= 4) evs.push({
        id: 'road_effigies', label: '紙紮行裡的紙人趁你沒看，整個身體轉過來對著你', maps: ['road'], tier: 2, family: 'effigy', minI: 0.3, cooldown: 80, weight: 2.6,
        can: inShop,
        start() {
          t = 0; second = false; pan = rng() < 0.5 ? -0.7 : 0.7;
          fx.sfx('creak', pan, 3, 0.9); h.director.spike(0.12);
          let best = ws[0]; for (const w of ws) if (w.root.userData.kind === 'mourn') best = w; // 被點了睛的那一尊
          const e = best.root.matrixWorld.elements; h.setFocus(e[12], e[13] + 1.4, e[14]);
          return true;
        },
        update(dt) {
          t += dt;
          for (let i = 0; i < ws.length; i++) {
            const w = ws[i], r = w.root, e = r.matrixWorld.elements, x = e[12], z = e[14];
            if (s.dist(x, z) > 9 || s.inView(x, s.eye.y - 0.3, z, 0.12)) continue; // 被看著的不動
            const base = r.userData.horrorYaw ?? (r.userData.horrorYaw = r.rotation.y);
            const want = base + clamp(wrap(Math.atan2(s.px - x, s.pz - z) - base), -1.15, 1.15);
            const diff = wrap(want - r.rotation.y), st = dt * 1.5;
            r.rotation.y += Math.abs(diff) <= st ? diff : Math.sign(diff) * st;
            if (r.userData.kind === 'mourn') w.head.rotation.z += (0.32 - w.head.rotation.z) * Math.min(1, dt * 2); // 那一尊還歪著頭
          }
          if (t > 2.6 && !second) { second = true; fx.sfx('creak', -pan, 2.5, 0.7); h.director.spike(0.15); }
          return t > 12 || !inShop();
        },
        stop() {},
      });
    }

    // ── 車燈一左一右暗了一下：有東西從車前走過 ──
    {
      const lamps = [];
      map.scene.traverse((o) => { if (o.isSpotLight && o !== h.game.player.flash && Math.abs(o.position.z - 30.05) < 0.2) { o.userData.horrorOwned = true; lamps.push({ light: o, base: o.intensity }); } });
      lamps.sort((p, q) => q.light.position.x - p.light.position.x);
      let t = 0, a = null;
      const Z = 29.72, X0 = -3.1, X1 = -6.2, DUR = 1.5;
      const ev = {
        id: 'road_car', label: '有人從自己車子的大燈前走過', maps: ['road'], tier: 2, family: 'car', minI: 0.2, cooldown: 200, weight: 1.1,
        can: () => lamps.length === 2 && s.pz < 26 && s.pz > -6 && figs.free('shadow'),
        start() {
          a = figs.take('shadow', ev); if (!a) return false;
          a.show(X0, 0, Z, -Math.PI / 2, 'idle'); a.slideTo(X1, Z, DUR); a.fig.lookAt?.(s.eye);
          t = 0; fx.sfxAt(0.3, 'stepBehind', fx.panOf(s.bearing(-4.6, 30)), s.dist(-4.6, 30), 0.5); h.setFocus(-4.6, 0.9, Z); return true;
        },
        update(dt) {
          t += dt;
          // 身體擋住哪一盞燈，那一盞照在路上的光就暗下去（每盞各暗一次，不是閃爍）
          for (let i = 0; i < lamps.length; i++) { const l = lamps[i], block = a.active && Math.abs(a.root.position.x - l.light.position.x) < 0.3; l.light.intensity += (l.base * (block ? 0.05 : 1) - l.light.intensity) * Math.min(1, dt * 20); }
          if (a.active && !a.sliding) { if (a.everSeen) h.director.spike(0.2); a.hide(); }
          return t > DUR + 0.5;
        },
        stop() { for (const l of lamps) l.light.intensity = l.base; figs.release(ev); },
      };
      evs.push(ev);
    }
  }

  if (h.id === 'temple') {
    // ── 地下：當年被扣上的後殿殿門。門後敲三下，小小的濕腳印從門底的送口走出來，繞過佛像走到你面前 ──
    {
      const DOOR = [55.32, -28.2], WAY = [[57.75, -28.05], [57.95, -24.3]], FLOOR = -7;
      let t = 0, phase = 0, x = 0, z = 0, n = 0, wp = 0, left = true, k = 0;
      const knock = (v) => fx.sfx('knock', fx.panOf(s.bearing(55, -28.6)), Math.max(2, s.dist(55, -28.6) * 0.6), v);
      evs.push({
        id: 'crypt_door', label: '後殿殿門後有人敲三下，小小的濕腳印從門底走出來', maps: ['temple'], tier: 2, family: 'prints', minI: 0.5, cooldown: 260, weight: 2.4,
        can: () => s.px > 47.5 && s.feet < -3 && s.dist(55, -28.6) > 4.5 && !h.story?.ritual,
        start() { t = 0; phase = 0; k = 0; n = 0; wp = 0; x = DOOR[0]; z = DOOR[1]; left = true; knock(1); h.director.spike(0.15); h.setFocus(55.3, FLOOR + 0.5, -28.4); return true; },
        update(dt) {
          t += dt;
          if (phase === 0) { // 「到了就敲三下」
            if (t > 2.4 && k === 0) { k = 1; knock(0.7); }
            if (t > 4.3) { phase = 1; t = 0; }
            return false;
          }
          if (phase === 2) return t > 2.5;
          if (t < 0.42) return false;
          t = 0;
          const tx = wp < WAY.length ? WAY[wp][0] : s.px, tz = wp < WAY.length ? WAY[wp][1] : s.pz;
          const dx = tx - x, dz = tz - z, d = Math.hypot(dx, dz) || 1;
          if (wp < WAY.length && d < 0.4) { wp++; return false; }
          if ((wp >= WAY.length && d < 0.85) || n >= 28 || s.feet > -3) { phase = 2; fx.sfx('whisper', fx.panOf(s.bearing(x, z)), 0.5, 0.9); h.director.spike(0.25); return false; }
          const ux = dx / d, uz = dz / d, sd = left ? 1 : -1;
          x += ux * 0.36; z += uz * 0.36;
          props.prints.add(x + uz * sd * 0.06, FLOOR, z - ux * sd * 0.06, Math.atan2(ux, uz) + sd * 0.1, left, 0.72); // 小孩的腳
          left = !left; n++;
          fx.sfx('stepBehind', fx.panOf(s.bearing(x, z)), s.dist(x, z), 0.3); h.setFocus(x, FLOOR, z);
          return false;
        },
        stop() {},
      });
    }
  }

  return evs;
}
