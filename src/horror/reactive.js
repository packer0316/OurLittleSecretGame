import { clamp, wrap } from './sense.js';

/**
 * 跟著劇情走的固定演出加強層（不改 Story，只輪詢它的狀態）：
 * 既有的 triggerScare 人影、追逐的壓迫感、被抓到的衝臉、換章的餘震、
 * 住處的敲門與拖椅、以及會「看人」的陳設（合約 F）。
 * 這一層在 ?auto 下也會運作，因為它完全由劇情狀態決定，沒有隨機性。
 */
const DIP = [[0.09, 0.3], [0.16, 1]];
// 各個固定人影出現時的聲音提示：[種類, 音量, 延遲]
const CUES = {
  gate: ['whisper', 0.8, 0.5], tape: ['whisper', 1, 0.1], phone: ['static', 0.8, 0], stage: ['knock', 0.9, 0.2],
  loop: ['hum', 0.6, 0.2], relic: ['whisper', 0.8, 0.3], bridge: ['stepBehind', 0.9, 0.3], workshop: ['scrape', 0.7, 0.1],
};

export function createReactive(h) {
  const { game, map, sense: s, fx, props } = h;
  const sw = map.storyWorld;
  const ghostRoot = h.mapGhostRoot; // 地圖自己的鬼（固定演出與追逐用）
  const ghost = sw?.ghost || null;
  let scareWas = false, scareSeen = false, scareInView = false, sx = 0, sy = 0, sz = 0, scareKind = '', dimT = -1;
  let chaseWas = false, chaseT = 0, stepT = 0, breathT = 2, burstT = 0, shakeT = 0;
  let deaths = -1, chapter = -1, homeStep = -1, chairT = -1, chairK = 0;
  let doorWas = false, doorFx = 0, doorT = 0, knockK = 0;
  const KNOCKS = [0.15, 0.85, 1.8];

  const r = {
    update(dt, rawDt, paused) {
      const st = game.story, state = st?.state;

      // ── 1. 固定人影（triggerScare）──
      if (ghostRoot && sw) {
        const on = !!sw.scareActive && ghostRoot.visible && !st?.chase;
        if (on) {
          const p = ghostRoot.position; sx = p.x; sy = p.y; sz = p.z;
          scareInView = s.sees(sx, sy + 1.35, sz);
          if (!scareWas) { // 出現
            scareSeen = false; scareKind = sw.scare?.kind || (h.id === 'road' ? (sz > 0 ? 'bridge' : 'workshop') : '');
            const d = s.dist(sx, sz), pan = fx.panOf(s.bearing(sx, sz)), c = CUES[scareKind];
            fx.sfx('sub', pan, d, 0.8); h.director.spike(0.25);
            if (c) fx.sfxAt(c[2], c[0], pan, Math.max(1, d * 0.5), c[1]);
            if (scareKind === 'gate') { fx.dim(0.5, 0.004, 0.7, 4); dimT = 1.8; }
            h.setFocus(sx, sy + 1.4, sz);
          }
          if (scareInView && !scareSeen && !paused) { // 第一次被看到
            scareSeen = true;
            fx.sfx('stinger', fx.panOf(s.bearing(sx, sz)), s.dist(sx, sz), clamp(1.2 - s.dist(sx, sz) / 20, 0.55, 1));
            fx.glitch(0.4, 0.18); if (s.flashLit) fx.flashPattern(DIP); h.director.spike(0.35);
          }
        } else if (scareWas && !st?.chase) { // 消失：原地留下一雙濕腳印
          if (scareInView) { fx.glitch(0.7, 0.2); fx.sfxAt(0.25, 'ring', 0, 1, 0.5); }
          fx.duck(2.5); h.director.spike(0.1);
          const g = s.world.probe(sx, sz, sy + 0.2).g;
          if (Math.abs(g - sy) < 0.4) props.prints.pair(sx, g, sz, Math.atan2(s.px - sx, s.pz - sz));
        }
        scareWas = on;
      }
      if (dimT >= 0) { dimT -= rawDt; if (dimT < 0) fx.dim(1, 0, 1, 1.2); }

      // ── 2. 追逐 ──
      const chasing = !!st?.chase;
      if (chasing && ghostRoot) {
        if (!chaseWas) { h.director.stopAll(); fx.glitch(0.6, 0.25); fx.sfx('stinger', 0, 3, 1); chaseT = 0; stepT = 0.4; breathT = 2; burstT = 0; shakeT = 0; }
        chaseT += dt;
        const gp = ghostRoot.position, d = Math.hypot(gp.x - s.px, gp.z - s.pz), prox = clamp(1 - d / 14, 0, 1), b = s.bearing(gp.x, gp.z), pan = fx.panOf(b);
        const behind = Math.abs(b) > 1.4;
        // 燈火不穩、霧變濃；距離越近越暗
        fx.dim(0.78 - 0.34 * prox + 0.1 * Math.sin(chaseT * 5.1) * Math.sin(chaseT * 2.3), 0.004 + 0.008 * prox, 0.8, 6);
        ghost?.setPose?.(d < 4.5 ? 'reach' : 'idle'); ghost?.setGlitch?.(0.2 + 0.6 * prox); ghost?.lookAt?.(s.eye);
        if (dt > 0) {
          stepT -= dt; breathT -= dt; burstT -= dt; shakeT -= dt;
          if (stepT <= 0) { stepT = 0.52 - 0.22 * prox; fx.sfx('stepBehind', pan, d, 0.6 + 0.4 * prox); }
          if (breathT <= 0 && prox > 0.45) { breathT = 2.6 + (1 - prox) * 2; fx.sfx(behind ? 'breath' : 'whisper', pan * 0.6, Math.max(0.4, d * 0.3), 1); }
          if (d < 3.4 && burstT <= 0) { burstT = 0.75; fx.glitch(0.3 + 0.45 * prox, 0.2); }
          if (d < 2.6 && shakeT <= 0) { shakeT = 0.22; fx.shake(0.004 + 0.012 * (1 - d / 2.6), 0.25); }
          // 手電筒在它靠近時不穩（緩慢起伏，不是閃爍）
          fx.flash(d < 5.5 ? 0.62 + 0.38 * Math.sin(chaseT * 4.2) * Math.sin(chaseT * 1.7) : 1, 5);
        }
        h.setFocus(gp.x, gp.y + 1.4, gp.z);
      } else if (chaseWas) {
        fx.dim(1, 0, 1, 1.5); fx.flash(1, 8);
        ghost?.setPose?.('idle'); ghost?.setGlitch?.(0); ghost?.lookAt?.(null);
        if (!(state && deaths >= 0 && state.deaths > deaths)) { fx.duck(3); fx.sfxAt(1.2, 'bellFar', 0, 15, 0.6); } // 逃進燈下
      }
      chaseWas = chasing; h.director.chase = chasing;

      // ── 3. 被抓到的那一刻 ──
      if (state) {
        if (deaths >= 0 && state.deaths > deaths) {
          fx.rush(); fx.glitch(1, 0.3); fx.shake(0.03, 0.5);
          fx.sfx('stinger', 0, 0.5, 1); fx.sfxAt(0.12, 'gasp', 0, 0.3, 1); fx.sfxAt(1.0, 'ring', 0, 1, 0.8); fx.duck(4);
          h.director.spike(0.6);
        }
        deaths = state.deaths;
        // ── 4. 換章：世界跟著變得更不對勁 ──
        if (chapter >= 0 && state.chapter > chapter) { h.director.spike(0.3); h.director.kick(); fx.sfx('sub', 0, 8, 0.8); }
        chapter = state.chapter;
      }

      // ── 5. 住處：敲門、門縫的腳、拖椅 ──
      if (h.id === 'home' && sw && state) {
        const df = props.doorFeet, door = !!sw.doorEventActive;
        if (door && !doorWas) { h.director.stop('home_door_feet'); doorFx = 1; knockK = 0; df.root.visible = true; df.root.position.x = 1.63; df.a.visible = df.b.visible = true; df.b.position.x = 0.1; h.setFocus(1.65, 0.03, 3.79); }
        if (door) {
          const t = sw.doorEventTime || 0;
          while (knockK < 3 && t >= KNOCKS[knockK]) { knockK++; h.director.spike(0.12); fx.shake(0.003, 0.18); }
          df.b.position.x = 0.1 + (t > 1.8 && t < 3.1 ? Math.sin(((t - 1.8) / 1.3) * Math.PI) * 0.035 : 0); // 轉門把時重心換了腳
        } else if (doorWas && doorFx === 1) { doorFx = 2; doorT = 0; fx.sfx('stepBehind', fx.panOf(s.bearing(1.65, 3.8)), 3, 0.5); fx.sfxAt(0.6, 'stepBehind', fx.panOf(s.bearing(0.6, 3.8)), 4, 0.35); }
        if (doorFx === 2) { // 紙條滑進來之後，門外的腳往左走開
          doorT += dt; const u = Math.min(1, doorT / 1.6), x = 1.63 + (0.8 - 1.63) * u * u * (3 - 2 * u);
          df.root.position.x = x; df.a.visible = x - 0.12 > 1.17; df.b.visible = x + 0.1 > 1.17;
          if (u >= 1) { doorFx = 0; df.root.visible = false; }
        }
        doorWas = door;
        const step = state.home?.step || 0;
        if (homeStep >= 0 && homeStep < 4 && step >= 4) { chairT = 0; chairK = 0; }
        homeStep = step;
        if (chairT >= 0) { // 與地圖的拖椅動作同步（1.2 秒後開始、拖 1.3 秒）
          chairT += dt;
          if (chairK === 0 && chairT > 1.2) { chairK = 1; if (game.audio.horror) fx.sfx('scrape', -0.65, 2.5, 0.8); fx.dim(0.55, 0, 0.85, 6); h.director.spike(0.28); }
          if (chairK === 1 && chairT > 2.6) { chairK = 2; fx.dim(1, 0, 1, 2); fx.duck(2.5); h.director.prime('home_tv'); }
          if (chairT > 4) chairT = -1;
        }
      }

      // ── 6. 會看人的陳設（合約 F）：沒被看著的時候，頭慢慢轉向玩家 ──
      const ws = map.watchers;
      if (ws && dt > 0) {
        for (let i = 0; i < ws.length; i++) {
          const w = ws[i]; if (!w?.root || !w.head) continue;
          const e = w.root.matrixWorld.elements, x = e[12], z = e[14];
          if (s.dist(x, z) > 22 || s.inView(x, s.eye.y, z, 0.1)) continue;
          const want = clamp(wrap(Math.atan2(s.px - x, s.pz - z) - Math.atan2(e[8], e[10])), -1.15, 1.15);
          const cur = w.head.rotation.y, diff = want - cur, stepMax = dt * 0.7;
          w.head.rotation.y = Math.abs(diff) <= stepMax ? want : cur + Math.sign(diff) * stepMax;
        }
      }
    },
  };
  return r;
}
