import { clamp, wrap } from '../sense.js';

/**
 * 木頭人（第四章，從老樹下拿回布兔、再走進一樓的時候）。
 *
 * 一進殿，所有佛像同時把頭轉過來（喀的一聲）。西北角佛壇上那四尊蒙眼的羅漢，
 * 只要沒被手電筒照著，就會從佛壇上下來，往你靠近；照到就定住。上二樓的西側樓梯就在它們面前：
 * 玩家要用手電筒盯住它們、倒退著上樓。爬到一半手電筒閃兩下熄掉，亮回來時它們已經在眼前。
 * 碰到就被抓：證據保留、回到殿門口、deaths++、存檔。走上二樓就結束，它們在沒人看的時候回到佛壇上。
 * 「隔天把全寺佛像的眼睛蒙上紅布。神明沒看見，就不必作證。」——它們想看了。
 */
const STAIR = { x1: -17, x2: -15.2, z1: -27, z2: -17 };
const CATCH = [
  ['神明沒看見', '石頭的手指按在你的眼皮上，一下，一下，像在數。\n蒙眼的紅布垂到你臉上。布底下那雙眼睛是睜開的。\n已取得的證據仍然保留。'],
  ['不必作證', '「神明沒看見，就不必作證。」那是大人在你耳邊說過的話。\n現在它們想看了。\n已取得的證據仍然保留。'],
  ['它們都看見了', '四張石頭的臉圍著你，紅布一條一條滑下來。\n它們看著你的右手，那道疤。\n已取得的證據仍然保留。'],
];

export function arhats(h, kit) {
  const { game, sense: s, fx } = h;
  const map = h.map, world = map.world, synth = kit.synth, player = game.player;
  const st = () => game.story?.state;
  const list = [];   // 會動的四尊
  const heads = [];  // 一樓所有佛像（轉頭用）
  const tmp = { x: 0, z: 0 }, checkpoint = [0, 0.9, -13.5, 0, 0];
  let phase = 'idle', t = 0, flashDone = false, flashT = -1, grace = 0, catches = 0, ramp = 0;

  const mod = {
    id: 'arhats',
    setup() {
      for (const o of map.statues || []) {
        if (!o.userData.head) continue;
        const p = o.position;
        if (p.y < 0.5 || p.y > 4) continue;
        heads.push({ o, ry: o.userData.head.rotation.y });
        if (Math.abs(p.z + 32.92) < 0.15 && p.x < -10 && Math.abs(p.y - 1.65) < 0.15) list.push({ o, x: p.x, y: p.y, z: p.z, ry: o.rotation.y, moving: false, wasMoving: false, off: false, lit: 0, v: 0 });
      }
      if (list.length < 2) mod.broken = true;
    },
    canStart() {
      const S = st(); if (!S || S.chapter < 4 || !S.evidence.includes('relic') || S.flags.underground) return false;
      const p = player.pos;
      return kit.onFloor(0) && p.y < 2.5 && p.z < -14.2 && p.z > -26;
    },
    force(opts = {}) { mod._force = opts; },
    start() {
      const o = mod._force || {}; mod._force = null;
      phase = 'wake'; t = 0; flashDone = !!o.noFlash; flashT = -1; grace = 0; ramp = 0;
      const p = player.pos; checkpoint[0] = clamp(p.x, -6, 6); checkpoint[1] = 0.9; checkpoint[2] = Math.max(p.z, -15.5); checkpoint[3] = 0; checkpoint[4] = 0;
      if (Number.isNaN(s.standable(checkpoint[0], checkpoint[2], 0.9, 0.5, 0.3))) { checkpoint[0] = 0; checkpoint[2] = -14.2; }
      for (const a of list) { a.moving = a.wasMoving = false; a.off = false; a.v = 0; }
      kit.dreadTo = 0.6;
      // 所有佛像同時轉頭
      for (const hd of heads) { const o = hd.o, hh = o.userData.head; hh.rotation.y = clamp(wrap(Math.atan2(p.x - o.position.x, p.z - o.position.z) - o.rotation.y), -1.3, 1.3); }
      const pans = [-0.8, 0.1, 0.75];
      for (let i = 0; i < 3; i++) synth.crack({ pan: pans[i], dist: 6 + i * 3, gain: 1, delay: i * 0.012 });
      fx.sfx('sub', 0, 6, 0.9); fx.dim(0.55, 0.004, 0.72, 3); h.director?.spike?.(0.4);
      kit.say('所有的佛像，同時把頭轉了過來。', '我', 3);
      if (o.phase === 'stalk') { phase = 'stalk'; t = 0; }
      return true;
    },
    update(dt) {
      game.audio.score?.watch('arhats', phase); // 配樂：轉頭的爆點、木頭人的頓弓脈動
      if (kit.catching || dt <= 0) { synth.setGrind(0); return false; }
      t += dt;
      const p = player.pos;
      if (phase === 'wake') {
        if (t > 1.6 && t - dt <= 1.6) { kit.say('佛壇上那幾尊蒙眼的羅漢……不要讓它們離開手電筒。', '我', 3.4); }
        if (t > 2.2) { phase = 'stalk'; t = 0; }
        return false;
      }
      if (phase === 'stalk') {
        const onStair = p.x > STAIR.x1 - 0.2 && p.x < STAIR.x2 + 0.2 && p.z > STAIR.z1 - 0.4 && p.z < STAIR.z2 + 0.4 && p.y > 1.0;
        const up = p.y > 6.4 && p.z > -17.3;
        if (up) { phase = 'top'; t = 0; synth.setGrind(0); for (const a of list) if (a.wasMoving) settle(a); kit.say('它們停在樓梯底下，一起抬頭看著你。', '我', 3); return false; }
        const inHall = kit.onFloor(0) && p.z < -12.4 && p.y < 3;
        if (!inHall && !onStair) { phase = 'home'; t = 0; synth.setGrind(0); return false; }
        grace -= dt; ramp = Math.min(1, ramp + dt / 25);
        // 爬到一半：手電筒閃兩下、熄掉，亮回來時它們已經在眼前（光敏安全：兩次明暗約 0.8 秒、只有手電筒）
        if (!flashDone && onStair && p.y > 2.6 && nearest() < 9) { flashDone = true; flashT = 0; kit.flashPattern([[0.22, 0.25], [0.3, 1], [0.22, 0.2], [0.34, 1], [1.35, 0], [0.05, 1]]); fx.sfx('static', 0, 0.5, 0.4); }
        let dark = false;
        if (flashT >= 0) { flashT += dt; dark = flashT > 1.08 && flashT < 2.43; if (flashT > 2.43 && flashT - dt <= 2.43) { fx.sfx('stinger', 0, 1.2, 0.9); fx.glitch(0.5, 0.2); } if (flashT > 3.2) flashT = -1; }
        let moving = 0, nearD = 99, nearPan = 0;
        for (const a of list) {
          const o = a.o, cx = o.position.x, cz = o.position.z, cy = o.position.y + 0.8;
          const d = Math.hypot(p.x - cx, p.z - cz);
          // 判斷照到的點放在羅漢身前（還坐在佛壇上時，佛壇的碰撞方塊包住了它）
          const fx0 = cx + ((p.x - cx) / (d || 1)) * 0.75, fz0 = cz + ((p.z - cz) / (d || 1)) * 0.75;
          const lit = s.flashLit && s.flashAngle(cx, cy, cz) < 0.5 && s.inView(cx, cy, cz, 0.05) && kit.losSolid(s.eye.x, s.eye.y, s.eye.z, fx0, cy, fz0);
          a.moving = false; a.litNow = lit;
          if (!lit && grace <= 0 && !(dark && d < 1.5)) {
            const spd = (1.7 + 1.5 * ramp) * (dark ? 1.6 : 1), stp = Math.min(spd * dt, Math.max(0, d - (dark ? 1.45 : 0.6)));
            if (stp > 0) {
              tmp.x = cx + ((p.x - cx) / d) * stp; tmp.z = cz + ((p.z - cz) / d) * stp;
              for (const b of list) { if (b === a) continue; const bx = tmp.x - b.o.position.x, bz = tmp.z - b.o.position.z, bd = Math.hypot(bx, bz); if (bd < 0.8 && bd > 1e-4) { tmp.x += (bx / bd) * (0.8 - bd) * 0.5; tmp.z += (bz / bd) * (0.8 - bd) * 0.5; } }
              world.resolve(tmp, 0.36, o.position.y);
              const g = world.probe(tmp.x, tmp.z, o.position.y).g;
              if (!a.off) { a.off = true; synth.thud({ pan: fx.panOf(s.bearing(tmp.x, tmp.z)), dist: d, gain: 1.3 }); }
              if (Math.abs(g - o.position.y) < 0.8 || a.off) { o.position.x = tmp.x; o.position.z = tmp.z; o.position.y = g; }
              o.rotation.y = Math.atan2(p.x - o.position.x, p.z - o.position.z);
              a.moving = true; moving++;
            }
          }
          if (a.wasMoving && !a.moving) settle(a);
          a.wasMoving = a.moving;
          if (a.moving && d < nearD) { nearD = d; nearPan = fx.panOf(s.bearing(o.position.x, o.position.z)); }
          if (d < 0.95 && Math.abs(p.y - o.position.y) < 1.3 && grace <= 0) { caught(a); return false; }
        }
        synth.setGrind(moving ? Math.min(1, 0.45 + moving * 0.2) : 0, nearPan, nearD);
        kit.dreadTo = clamp(0.55 + (1 - nearest() / 10) * 0.45, 0.5, 1);
        return false;
      }
      if (phase === 'top' || phase === 'home') {
        // 沒人看的時候回到佛壇上
        let left = 0;
        for (const a of list) {
          const o = a.o;
          if (o.position.x === a.x && o.position.z === a.z) continue;
          if (kit.sees(o.position.x, o.position.y + 0.8, o.position.z, 0.1) && t < 30) { left++; continue; }
          restore(a);
        }
        if (phase === 'top' && t > 1.2 && t - dt <= 1.2) fx.dim(1, 0, 1, 2);
        if (!left && t > 1.5) return phase === 'top' ? true : 'suspend';
        return false;
      }
      return true;
    },
    stop() {
      synth.setGrind(0);
      for (const a of list) restore(a);
      fx.dim(1, 0, 1, 2); kit.flash(1, 6);
      phase = 'idle';
    },
    dispose() { for (const a of list) restore(a); },
    debug() { return { phase, t: +t.toFixed(2), flashDone, nearest: +nearest().toFixed(2), statues: list.map((a) => [+a.o.position.x.toFixed(2), +a.o.position.y.toFixed(2), +a.o.position.z.toFixed(2), a.moving ? 1 : 0, a.litNow ? 1 : 0]) }; },
    list,
  };
  function nearest() { let d = 99; for (const a of list) d = Math.min(d, Math.hypot(player.pos.x - a.o.position.x, player.pos.z - a.o.position.z)); return d; }
  function settle(a) { const o = a.o; synth.crack({ pan: fx.panOf(s.bearing(o.position.x, o.position.z)), dist: Math.max(1, kit.dist(o.position.x, o.position.z)), gain: 0.45 }); }
  function restore(a) { a.o.position.set(a.x, a.y, a.z); a.o.rotation.y = a.ry; a.moving = a.wasMoving = false; a.off = false; }
  function caught(a) {
    synth.setGrind(0);
    const n = Math.min(catches, CATCH.length - 1); catches++;
    const o = a.o;
    kit.catchPlayer({ face: kit.tmp.set(o.position.x, o.position.y + 1.05, o.position.z), title: CATCH[n][0], body: CATCH[n][1], button: '回到殿門內', reset() {
      for (const b of list) restore(b);
      player.teleport(...checkpoint); player.flashOn = true; grace = 2.5; flashDone = false; flashT = -1; ramp = 0.3;
      kit.flash(1, 8);
    } });
  }
  return mod;
}
