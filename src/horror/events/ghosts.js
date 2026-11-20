import { wrap } from '../sense.js';

/**
 * 轉身鬼家族：所有「人形幽影」事件。
 * 共同規則：只在玩家此刻看不到的位置出現；被正眼看到、被手電筒掃到或畫面 glitch 之後消失；
 * 沒有碰撞、不會傷害玩家。事件介面：{ id, label, maps, tier, family, minI, cooldown, weight,
 * can(), start(force) -> bool, update(dt) -> done, stop(), poll?(dt) -> 要求啟動 }
 */

// 遠處會有東西橫越的開口：a → b 是橫越路徑，y 為 null 時取地形高度，side 判斷玩家是否站在看得到的那一側
const CROSSINGS = {
  temple: [
    { a: [-4.6, -15.2], b: [4.6, -15.2], y: 0.9, side: (p) => p.z > -9.5 && p.y < 3 }, // 從前廊／廟埕看正殿門內
    { a: [-4.2, -10.6], b: [4.2, -10.6], y: 0.9, side: (p) => p.z < -15.5 && p.y > 0.5 && p.y < 3 }, // 從殿內看門外前廊
    { a: [6.8, -14.0], b: [11.6, -14.0], y: 0.9, side: (p) => p.z > -9.5 && p.y < 3 }, // 東側門內
    { a: [-2.8, -21.2], b: [2.8, -21.2], y: 16.9, side: (p) => p.z > -18.6 && p.y > 16 }, // 四樓封印之間門內
    { a: [-3.6, 23.8], b: [3.6, 23.8], y: null, side: (p) => p.z < 19 && p.z > 2 && p.y < 0.6 }, // 山門外
    { a: [-31.8, -4.8], b: [-31.8, 4.8], y: null, side: (p) => p.x > -26 && p.y < 0.6 && p.z > -10 && p.z < 12 }, // 西牆缺口外
  ],
  road: [
    { a: [6.1, -15.8], b: [10.9, -15.8], y: 0.12, side: (p) => p.z > -12.5 }, // 紙紮行門內
    { a: [-6.4, -5.4], b: [6.4, -5.4], y: 0, side: (p) => p.z > 2 }, // 兩棟屋子之間橫越街道
    { a: [-6.6, -21.4], b: [4.6, -21.4], y: 0, side: (p) => p.z > -13 },
  ],
};

// 山村沒有柱子：屋角與門框當作探頭的掩體。hide = 完全躲在牆後的位置，out = 探出來的位置，pose 依探出的方向
const COVERS = {
  road: [
    { hide: [-5.6, -4.45], out: [-4.86, -4.45], pose: 'peek', side: (p) => p.z > -1 && p.x > -4.4 },
    { hide: [5.6, -2.95], out: [4.86, -2.95], pose: 'peekR', side: (p) => p.z > 0.5 && p.x < 4.4 },
    { hide: [-6.1, -19.95], out: [-5.36, -19.95], pose: 'peek', side: (p) => p.z > -17 && p.x > -5 },
    { hide: [6.3, -15.1], out: [7.08, -15.1], pose: 'peek', side: (p) => p.z > -13 && p.x > 6.2 },
  ],
};

const DIP = [[0.09, 0.3], [0.16, 1]]; // 看到它的那一瞬間，手電筒暗一下
const FAIL = [[0.25, 1], [0.2, 0.3], [0.3, 0.85], [0.22, 0.15], [0.35, 0.6], [60, 0]]; // 閃爍後熄滅（暗著直到事件把它點回來）

export function ghostEvents(h) {
  const { sense: s, fx, figs, props, rng } = h;
  const spot = { x: 0, y: 0, z: 0, bearing: 0, dist: 0 };
  const P = Math.PI;
  const evs = [];
  const stingerAt = (a, k = 1) => { fx.sfx('stinger', fx.panOf(s.bearing(a.root.position.x, a.root.position.z)), a.dist, k); fx.glitch(0.45, 0.18); if (s.flashLit) fx.flashPattern(DIP); };

  // ── 回頭的瞬間，它就站在那裡 ──
  {
    let a = null, phase = 0, t = 0, need = 0.3, cued = false, flagged = false;
    const place = (force) => {
      const dir = s.turnAccum >= 0 ? 1 : -1;
      const ok = force
        ? s.pickSpot(spot, rng, { b0: 2.7, b1: 3.6, d0: 2.2, d1: 3.6, tries: 14 }) || s.pickSpot(spot, rng, { b0: 1.5, b1: 4.8, d0: 1.8, d1: 5, tries: 24 })
        : s.pickSpot(spot, rng, { b0: dir * (s.hfov + 0.3), b1: dir * (s.hfov + 1.5), d0: 2.2, d1: 5, tries: 8 });
      if (!ok) return false;
      a = figs.take('near', ev); if (!a) return false;
      a.show(spot.x, spot.y, spot.z, 0, 'idle'); a.facePlayer(); a.fig.lookAt?.(s.eye);
      h.setFocus(spot.x, spot.y + 1.4, spot.z); phase = 1; t = 0; flagged = false; return true;
    };
    const ev = {
      id: 'turn_behind', label: '回頭的瞬間，它就站在身後', maps: ['temple', 'road'], tier: 3, family: 'turn', minI: 0.3, cooldown: 70, weight: 1.5,
      can: () => figs.free('near'),
      start(force) { phase = 0; t = 0; a = null; cued = false; ev.missed = false; need = 0.24 + rng() * 0.2; return force ? place(true) : true; },
      update(dt) {
        t += dt;
        if (phase === 0) { // 等玩家開始轉身，把它放在視線即將掃到的地方
          if (Math.abs(s.yawRate) > 1.5 && Math.abs(s.turnAccum) > 0.22 && place(false)) return false;
          if (t > 12 && !cued) { cued = true; fx.sfx('stepBehind', 0, 2.5, 0.8); } // 身後多一步，引人回頭
          if (t > 28) { ev.missed = true; return true; } // 玩家一直沒轉身：當作沒發生過
          return false;
        }
        if (phase === 1) {
          if (!a.active) return true;
          if (a.visibleNow && !flagged) { flagged = true; stingerAt(a); h.director.spike(0.4); }
          if (a.seen >= need || a.dist < 1.1) { a.vanish('glitch'); fx.sfxAt(0.3, 'ring', 0, 1, 0.6); fx.duck(2.5); phase = 2; t = 0; } else if (t > 7 && !a.visibleNow) { a.hide(); ev.missed = true; return true; }
          return false;
        }
        return t > 1.2;
      },
      stop() { figs.release(ev); },
    };
    evs.push(ev);
  }

  // ── 長廊／道路盡頭站著的人 ──
  {
    let a = null, t = 0, phase = 0, flagged = false;
    const ev = {
      id: 'far_watcher', label: '遠處盡頭站著一個人', maps: ['temple', 'road'], tier: 2, family: 'far', minI: 0.2, cooldown: 55, weight: 1.2,
      can: () => figs.free('shadow'),
      start(force) {
        const ok = s.pickSpot(spot, rng, { d0: 11, d1: 24, tries: 18 }) || (force && s.pickSpot(spot, rng, { d0: 8, d1: 22, tries: 24, hidden: false }));
        if (!ok) return false;
        // 背後有光就用純黑剪影；否則用手電筒照得到的蒼白身影
        a = figs.take(s.backlit(spot.x, spot.y + 1.3, spot.z) ? 'shadow' : 'near', ev) || figs.take('shadow', ev); if (!a) return false;
        a.show(spot.x, spot.y, spot.z, 0, rng() < 0.3 ? 'bowed' : 'idle'); a.facePlayer(); a.fig.lookAt?.(s.eye); a.fig.setEyes?.(0.55);
        h.setFocus(spot.x, spot.y + 1.4, spot.z); t = 0; phase = 0; flagged = false; return true;
      },
      update(dt) {
        t += dt;
        if (!a.active) return true;
        if (phase === 1) { if (a.alpha <= 0.02) { a.hide(); return true; } return false; }
        if (a.seen > 0.35 && !flagged) { flagged = true; fx.sfx('sub', fx.panOf(s.bearing(a.root.position.x, a.root.position.z)), a.dist, 0.5); h.director.spike(0.16); }
        if (a.seen > 0.8 || a.lit > 0.35) { a.fadeTo(0, 4); a.fig.setGlitch?.(0.4); phase = 1; } // 被看到不久留 else if (a.dist < 7.5) { if (a.visibleNow) a.vanish('glitch'); else a.hide(); } else if (t > 36 && !a.visibleNow) a.hide();
        return false;
      },
      stop() { figs.release(ev); },
    };
    evs.push(ev);
  }

  // ── 每次移開視線，它就更近一點 ──
  {
    let a = null, t = 0, away = 0, stage = 0, final = false, done = 0, stare = 0, dark = 0;
    const hop = (ignoreView) => {
      const ap = a.root.position, d = Math.max(2.1, a.dist * 0.55);
      const ux = (ap.x - s.px) / a.dist, uz = (ap.z - s.pz) / a.dist;
      for (let i = 0; i < 4; i++) {
        const j = (rng() - 0.5) * 1.2, x = s.px + ux * d - uz * j, z = s.pz + uz * d + ux * j;
        const g = s.standable(x, z);
        if (Number.isNaN(g) || !s.los(s.eye.x, s.eye.y, s.eye.z, x, g + 1.3, z)) continue;
        if (!ignoreView && s.inView(x, g + 1.3, z, 0.16)) continue;
        ap.set(x, g, z); a.facePlayer(); a.seen = 0; a.lit = 0; stage++; final = d <= 2.7; stare = 0;
        fx.sfx('stepBehind', fx.panOf(s.bearing(x, z)), d, 0.6 + 0.12 * stage); h.setFocus(x, g + 1.4, z);
        return true;
      }
      return false;
    };
    const ev = {
      id: 'closer', label: '每次移開視線，它就更近一點', maps: ['temple', 'road'], tier: 3, family: 'far', minI: 0.45, cooldown: 110, weight: 1.1,
      can: () => figs.free('near'),
      start(force) {
        const ok = s.pickSpot(spot, rng, { d0: 12, d1: 20, tries: 18 }) || (force && s.pickSpot(spot, rng, { d0: 8, d1: 18, tries: 24, hidden: false }));
        if (!ok) return false;
        a = figs.take('near', ev); if (!a) return false;
        a.show(spot.x, spot.y, spot.z, 0, 'idle'); a.facePlayer(); a.fig.lookAt?.(s.eye);
        h.setFocus(spot.x, spot.y + 1.4, spot.z); t = 0; away = 0; stage = 0; final = false; done = 0; stare = 0; dark = 0; return true;
      },
      update(dt) {
        t += dt;
        if (done > 0) { done += dt; return done > 1.6; }
        if (!a.active) return true;
        away = a.visibleNow ? 0 : away + dt;
        stare = a.visibleNow && a.gaze < 0.6 ? stare + dt : 0;
        if (dark > 0) { // 盯著它看太久：手電筒暗掉的那一下它已經換了位置
          dark += dt;
          if (dark > 0.55 && dark < 9) { hop(true); dark = 9; fx.flash(1, 30); }
          if (dark > 9.6) dark = 0;
          return false;
        }
        if (final) {
          a.fig.setPose?.('reach');
          if (a.seen > 0.22 || a.dist < 1.1) { stingerAt(a); a.vanish('glitch'); fx.sfxAt(1.4, 'breath', 0, 0.3, 1); fx.duck(3); h.director.spike(0.5); done = 1e-3; }
        } else if (a.seen > 0.2 && away > 0.5 && stage < 4) hop(false);
        else if (stare > 1.6 && s.flashLit && stage < 4) { dark = 1e-3; fx.flash(0, 30); a.fig.setGlitch?.(0.5); } // 盯著它不放：手電筒一暗，它就換了位置
        else if (stare > 1.6 || (stage >= 4 && a.seen > 0.8)) { a.vanish('glitch'); h.director.spike(0.2); done = 1e-3; } // 沒有手電筒可以借、或已經走不動：在眼前消失，不久留
        if (a.dist < 1.1 && !final) { a.vanish('glitch'); done = 1e-3; }
        if (t > 55 && !a.visibleNow) { a.hide(); return true; }
        return false;
      },
      stop() { figs.release(ev); if (dark > 0 && dark < 9) fx.flash(1); },
    };
    evs.push(ev);
  }

  // ── 柱子後探出半個身子，被看到就縮回去 ──
  {
    let a = null, t = 0, phase = 0, hx = 0, hz = 0, look = 0;
    const findCover = (force) => {
      const pos = h.game.player.pos;
      for (const c of COVERS[h.id] || []) { // 事先標好的屋角、門框
        const d = s.dist(c.out[0], c.out[1]);
        if (!c.side(pos) || d < 4 || d > 11 || !s.los(s.eye.x, s.eye.y, s.eye.z, c.out[0], s.feet + 1.5, c.out[1])) continue;
        const b = Math.abs(s.bearing(c.out[0], c.out[1])); if (b > s.hfov + 0.45 || (!force && b < 0.2)) continue;
        a = figs.take('near', ev); if (!a) return false;
        const g = s.world.probe(c.out[0], c.out[1], s.feet).g;
        a.show(c.hide[0], g, c.hide[1], 0, c.pose); a.face(c.out[0] + (s.px - c.out[0]) * 0.5, s.pz); a.fig.lookAt?.(s.eye);
        hx = c.hide[0]; hz = c.hide[1]; a.slideTo(c.out[0], c.out[1], 0.9);
        h.setFocus(c.out[0], g + 1.45, c.out[1]); return true;
      }
      const cs = s.world.circles, n = cs.length; if (!n) return false;
      const start = Math.floor(rng() * n);
      for (let k = 0; k < n; k++) {
        const c = cs[(start + k) % n];
        if (c.r < 0.25 || c.r > 0.66 || c.y2 - c.y1 < 2.2 || c.y1 > s.feet + 0.6 || c.y2 < s.feet + 1.7) continue;
        const d = s.dist(c.x, c.z); if (d < 3.6 || d > 11) continue;
        const b = s.bearing(c.x, c.z); if (Math.abs(b) > s.hfov + 0.45 || (!force && Math.abs(b) < 0.22)) continue;
        const ux = (c.x - s.px) / d, uz = (c.z - s.pz) / d, lx = uz, lz = -ux;
        if (!s.los(s.eye.x, s.eye.y, s.eye.z, c.x - ux * (c.r + 0.3), s.feet + 1.4, c.z - uz * (c.r + 0.3))) continue;
        const side = rng() < 0.5 ? 1 : -1, back = c.r + 0.3;
        for (let q = 0; q < 2; q++) {
          // sd = 1：從玩家看過去的左側探出。身體大半留在柱子後面，只有頭、肩和扣著柱緣的手露出來。
          const sd = q ? -side : side, out = c.r - 0.08;
          const px = c.x + ux * back + lx * sd * out, pz = c.z + uz * back + lz * sd * out;
          const bx = c.x + ux * back - lx * sd * 0.15, bz = c.z + uz * back - lz * sd * 0.15;
          const g = s.standable(px, pz, s.feet, 0.5, 0.16);
          if (Number.isNaN(g) || Number.isNaN(s.standable(bx, bz, s.feet, 0.5, 0.16))) continue;
          a = figs.take(s.backlit(px, g + 1.3, pz) ? (rng() < 0.5 ? 'child' : 'shadow') : 'near', ev) || figs.take('shadow', ev); if (!a) return false;
          a.show(bx, g, bz, 0, sd > 0 ? 'peekR' : 'peek'); a.facePlayer(); a.fig.lookAt?.(s.eye); // 面向玩家時，它的 +X 是玩家的右手邊
          hx = bx; hz = bz; a.slideTo(px, pz, 0.9);
          h.setFocus(px + lx * sd * 0.3, g + (a.kind === 'child' ? 0.9 : 1.45), pz + lz * sd * 0.3);
          return true;
        }
      }
      return false;
    };
    const ev = {
      id: 'peek', label: '柱子後探出半個身子，一看過去就縮回', maps: ['temple', 'road'], tier: 2, family: 'peek', minI: 0.25, cooldown: 50, weight: 1.3,
      can: () => figs.free('near'),
      start(force) { t = 0; phase = 0; look = 0; return findCover(force); },
      update(dt) {
        t += dt;
        if (!a.active) return true;
        if (phase === 0) {
          look = a.gaze < 0.17 && a.visibleNow ? look + dt : 0;
          if (look > 0.2 || a.lit > 0.14 || t > 9 || a.dist < 2.2) { a.slideTo(hx, hz, 0.2); phase = 1; t = 0; if (look > 0.2) { fx.sfx('whisper', fx.panOf(s.bearing(hx, hz)), a.dist, 0.4); h.director.spike(0.14); } }
          return false;
        }
        if (!a.sliding) { a.hide(); return true; }
        return false;
      },
      stop() { figs.release(ev); },
    };
    evs.push(ev);
  }

  // ── 手電筒光圈邊緣，剛好照不到的地方有一雙腳 ──
  {
    let t = 0, phase = 0, look = 0, fy = 0, a = null;
    const feet = props.feet;
    const ev = {
      id: 'edge_feet', label: '手電筒光圈邊緣站著一雙赤腳，往上是不反光的黑影', maps: ['temple', 'road'], tier: 2, family: 'feet', minI: 0.3, cooldown: 80, weight: 1.1,
      can: () => s.flashLit && !feet.visible,
      start(force) {
        if (!s.flashLit && !force) return false;
        for (let i = 0; i < 22; i++) {
          const b = (0.2 + rng() * 0.6) * (rng() < 0.5 ? 1 : -1), d = 2.6 + rng() * 3.2, an = s.yaw + b;
          const x = s.px - Math.sin(an) * d, z = s.pz - Math.cos(an) * d, g = s.standable(x, z);
          if (Number.isNaN(g)) continue;
          const ang = s.flashAngle(x, g + 0.08, z);
          if (!force && (ang < 0.42 || ang > 0.56)) continue;
          if (force && i < 16 && (ang < 0.42 || ang > 0.56)) continue;
          if (!s.inView(x, g + 0.1, z, -0.06) || !s.los(s.eye.x, s.eye.y, s.eye.z, x, g + 0.3, z)) continue;
          feet.position.set(x, g, z); feet.rotation.y = Math.atan2(s.px - x, s.pz - z); feet.visible = true; fy = g;
          // 腳踝以上：一個不反光的黑色人形（借得到就用，借不到退回黑袍）
          a = figs.take('shadow', ev);
          if (a) { a.show(x - Math.sin(feet.rotation.y) * 0.07, g, z - Math.cos(feet.rotation.y) * 0.07, feet.rotation.y, 'idle'); a.fig.lookAt?.(s.eye); }
          feet.userData.robe.visible = !a;
          h.setFocus(x, g + 0.2, z); t = 0; phase = 0; look = 0; return true;
        }
        return false;
      },
      update(dt) {
        t += dt;
        if (phase === 1) return t > 1;
        const p = feet.position, ang = s.flashAngle(p.x, p.y + 0.1, p.z), d = s.dist(p.x, p.z);
        look = s.gaze(p.x, p.y + 0.15, p.z) < 0.16 ? look + dt : 0;
        feet.rotation.z = Math.sin(t * 0.9) * 0.012; // 重心在兩腳之間輕輕換
        const gone = ang < 0.3 || look > 0.16 || d < 1.6;
        if (gone || (t > 12 && (ang > 0.66 || !s.inView(p.x, p.y, p.z, 0)))) {
          feet.visible = false; a?.hide(); a = null;
          if (gone) { props.prints.pair(p.x, fy, p.z, feet.rotation.y); fx.sfx('stepBehind', fx.panOf(s.bearing(p.x, p.z)), d + 1, 0.5); h.director.spike(0.2); }
          phase = 1; t = 0;
        }
        return false;
      },
      stop() { feet.visible = false; figs.release(ev); a = null; },
    };
    evs.push(ev);
  }

  // ── 有東西橫越遠處的門口 ──
  {
    let a = null, t = 0, dur = 1;
    const list = CROSSINGS[h.id] || [];
    const ev = {
      id: 'door_cross', label: '有東西橫越遠處的門口', maps: ['temple', 'road'], tier: 2, family: 'cross', minI: 0.2, cooldown: 60, weight: 1.2,
      can: () => list.length > 0 && figs.free('shadow'),
      start(force) {
        const pos = h.game.player.pos, n = list.length, st = Math.floor(rng() * n);
        for (let k = 0; k < n; k++) {
          const c = list[(st + k) % n]; if (!c.side(pos)) continue;
          const mx = (c.a[0] + c.b[0]) / 2, mz = (c.a[1] + c.b[1]) / 2, d = s.dist(mx, mz);
          const y = c.y ?? s.world.probe(mx, mz, s.feet).g;
          if (d < 6 || d > 32 || !s.los(s.eye.x, s.eye.y, s.eye.z, mx, y + 1.3, mz)) continue;
          if (!force && !s.inView(mx, y + 1.3, mz, -0.08)) continue;
          // 黑影要有亮的背景才看得到；背景是暗的，就讓蒼白的身影從手電筒照得到的地方走過
          const kind = s.backlit(mx, y + 1.3, mz) ? 'shadow' : (force || (s.flashAngle(mx, y + 1.3, mz) < 0.5 && d < 22)) ? 'near' : null;
          if (!kind) continue;
          a = figs.take(kind, ev); if (!a) return false;
          const flip = rng() < 0.5, A = flip ? c.b : c.a, B = flip ? c.a : c.b, len = Math.hypot(B[0] - A[0], B[1] - A[1]);
          const slow = rng() < 0.35;
          dur = len / (slow ? 1.5 : 5.2);
          a.show(A[0], y, A[1], Math.atan2(B[0] - A[0], B[1] - A[1]), slow ? 'bowed' : 'idle');
          if (slow) a.fig.lookAt?.(s.eye); else a.fig.setGlitch?.(0.3);
          a.slideTo(B[0], B[1], dur); h.setFocus(mx, y + 1.3, mz); t = 0;
          fx.sfxAt(dur * 0.35, 'stepBehind', fx.panOf(s.bearing(mx, mz)), d, 0.45);
          return true;
        }
        return false;
      },
      update(dt) {
        t += dt;
        if (!a.active) return true;
        if (!a.sliding) { if (a.everSeen) h.director.spike(0.15); a.hide(); return true; }
        return false;
      },
      stop() { figs.release(ev); },
    };
    evs.push(ev);
  }

  // ── 讀完文件關掉視窗的那一刻，它正站在面前 ──
  {
    let a = null, t = 0, phase = 0, wasModal = false, modalT = 0, hot = false;
    const ev = {
      id: 'reading_face', label: '闔上文件的那一刻，它就站在面前', maps: ['temple', 'road'], tier: 3, family: 'face', minI: 0.45, cooldown: 150, weight: 1, passive: true,
      can: () => figs.free('near'),
      /** 每幀輪詢（閱讀中也會被呼叫）：視窗開得夠久、關掉的那一幀要求啟動 */
      poll(dt) {
        const st = h.story, modal = !!st?.modal;
        let fire = false;
        if (modal) { if (!wasModal) { modalT = 0; hot = ev.armed || (h.director.allowHard() && rng() < 0.22 + 0.3 * h.intensity); } modalT += dt; } else if (wasModal && hot && modalT > 2.5 && h.game.player.enabled && !st?.chase && !st?.ritual && !h.map.storyWorld?.scareActive) fire = true;
        wasModal = modal;
        return fire;
      },
      start() {
        const ok = s.pickSpot(spot, rng, { b0: -0.1, b1: 0.1, d0: 1.25, d1: 1.7, hidden: false, tries: 6 })
          || s.pickSpot(spot, rng, { b0: -0.22, b1: 0.22, d0: 2.3, d1: 3.6, hidden: false, tries: 10 })
          || s.pickSpot(spot, rng, { b0: 0.3, b1: 0.7, both: true, d0: 1.3, d1: 2.2, hidden: false, tries: 12 });
        if (!ok) return false;
        a = figs.take('near', ev); if (!a) return false;
        a.show(spot.x, spot.y, spot.z, 0, 'reach'); a.facePlayer(); a.fig.lookAt?.(s.eye); a.fig.setGlitch?.(0.45);
        fx.glitch(0.6, 0.2); fx.sfx('stinger', 0, 1, 1); h.director.spike(0.55);
        h.setFocus(spot.x, spot.y + 1.45, spot.z); t = 0; phase = 0; return true;
      },
      update(dt) {
        t += dt;
        if (phase === 0 && t > 0.34) { a.vanish('glitch', 0.1); fx.sfxAt(0.3, 'ring', 0, 1, 0.7); fx.duck(3); phase = 1; }
        return t > 1.6;
      },
      stop() { figs.release(ev); },
    };
    evs.push(ev);
  }

  // ── 站著不動太久：頸後的呼吸。回頭什麼都沒有（或者有）──
  {
    let a = null, t = 0, phase = 0, yaw0 = 0, bx = 0, bz = 0, by = 0, second = false, roll = 0, need = 12, side = 1;
    const ev = {
      id: 'neck_breath', label: '站著不動太久，頸後有呼吸', maps: ['temple', 'road', 'home'], tier: 2, family: 'breath', minI: 0.12, cooldown: 75, weight: 1, passive: true,
      can: () => true,
      poll() { if (s.stillTime > need && !h.story?.modal && (ev.armed || (h.director.allowSoft() && h.director.mapTime > 45))) { need = 10 + rng() * 9; return true; } return false; },
      start() {
        yaw0 = s.yaw; side = rng() < 0.5 ? 1 : -1; roll = rng(); second = false; t = 0; phase = 0; a = null;
        bx = s.px + Math.sin(yaw0) * 0.6; bz = s.pz + Math.cos(yaw0) * 0.6; by = s.feet;
        fx.sfx('breath', side * 0.3, 0.4, 1); h.director.spike(0.14);
        return true;
      },
      update(dt) {
        t += dt;
        if (phase === 0) {
          if (Math.abs(wrap(s.yaw - yaw0)) > 1.7) {
            const figure = roll < 0.4 && h.id !== 'home' && h.intensity >= 0.45 && h.director.allowHard() && figs.free('near') && s.pickSpot(spot, rng, { b0: -0.25, b1: 0.25, d0: 1.3, d1: 2.2, hidden: false, tries: 8 });
            if (figure && (a = figs.take('near', ev))) {
              a.show(spot.x, spot.y, spot.z, 0, 'idle'); a.facePlayer(); a.fig.lookAt?.(s.eye); stingerAt(a, 0.9); h.director.spike(0.4);
              h.setFocus(spot.x, spot.y + 1.4, spot.z); phase = 1; t = 0;
            } else { // 什麼都沒有，只有地上一雙濕腳印
              if (!Number.isNaN(s.standable(bx, bz, by, 0.5, 0.15))) props.prints.pair(bx, by, bz, yaw0 + P, 0.9);
              h.setFocus(bx, by, bz); fx.duck(2); phase = 2; t = 0;
            }
          } else if (t > 6 && !second) { second = true; fx.sfx('breath', -side * 0.25, 0.3, 1); fx.sfxAt(1.1, 'whisper', side * 0.6, 0.5, 0.7); } else if (t > 14 || s.moveTime > 1.2) return true;
          return false;
        }
        if (phase === 1) { if (!a.active) return true; if (a.seen > 0.22 || t > 2) { a.vanish('glitch'); phase = 2; t = 0; } return false; }
        return t > 1.5;
      },
      stop() { figs.release(ev); },
    };
    evs.push(ev);
  }

  // ── 手電筒閃爍、熄掉兩秒；亮回來時，東西更近了 ──
  {
    let a = null, t = 0, phase = 0, two = false, backAt = 0;
    const front = (d0, d1) => s.pickSpot(spot, rng, { b0: -0.2, b1: 0.2, d0, d1, hidden: false, tries: 10 }) || s.pickSpot(spot, rng, { b0: -0.5, b1: 0.5, d0, d1: d1 + 1, hidden: false, tries: 12 });
    const ev = {
      id: 'flash_fail', label: '手電筒熄掉兩秒，亮回來時它更近了', maps: ['temple', 'road'], tier: 3, family: 'flash', minI: 0.4, cooldown: 120, weight: 1.2,
      can: () => s.flashLit && figs.free('near'),
      start(force) {
        if (!s.flashLit && !force) return false;
        t = 0; phase = 0; a = null; two = h.intensity >= 0.65 && rng() < 0.55;
        fx.flashPattern(FAIL); fx.sfx('static', 0, 1, 0.5); return true;
      },
      update(dt) {
        t += dt;
        if (phase === 0) { // 閃爍 → 全暗
          if (t > 1.32) { phase = 1; t = 0; backAt = two ? 1.5 : 2.2; fx.sfxAt(0.5, 'stepBehind', 0, 3.5, 0.8); if (!two) fx.sfxAt(1.25, 'breath', 0.2, 0.6, 0.8); }
          return false;
        }
        if (phase === 1) { // 黑暗中把它放到面前
          if (t > backAt - 0.12 && !a) {
            if ((two ? front(5.5, 8) : front(1.9, 2.6)) && (a = figs.take('near', ev))) { a.show(spot.x, spot.y, spot.z, 0, two ? 'idle' : 'reach'); a.facePlayer(); a.fig.lookAt?.(s.eye); h.setFocus(spot.x, spot.y + 1.4, spot.z); } else { fx.flash(1, 30); phase = 9; t = 0; return false; } // 沒有位置：只是一次假警報
          }
          if (t > backAt) { fx.flash(1, 40); phase = 2; t = 0; if (!two) { stingerAt(a); h.director.spike(0.55); } else { fx.sfx('sub', 0, a.dist, 0.7); h.director.spike(0.3); } }
          return false;
        }
        if (phase === 2) { // 亮回來：它站在那裡
          if (two) {
            if (t > 0.5) { fx.flash(0, 40); phase = 3; t = 0; fx.sfxAt(0.35, 'stepBehind', 0, 2, 1); }
          } else if (t > 0.34) { a.vanish('glitch'); fx.sfxAt(0.3, 'ring', 0, 1, 0.7); fx.duck(3); phase = 9; t = 0; }
          return false;
        }
        if (phase === 3) { // 第二次暗掉：它走近了
          if (t > 0.75 && a.dist > 3) { if (front(1.8, 2.4)) { a.root.position.set(spot.x, spot.y, spot.z); a.facePlayer(); a.fig.setPose?.('reach'); h.setFocus(spot.x, spot.y + 1.4, spot.z); } }
          if (t > 0.9) { fx.flash(1, 40); two = false; phase = 2; t = 0; stingerAt(a); h.director.spike(0.6); }
          return false;
        }
        return t > 1.4;
      },
      stop() { figs.release(ev); fx.flash(1, 30); },
    };
    evs.push(ev);
  }

  return evs;
}
