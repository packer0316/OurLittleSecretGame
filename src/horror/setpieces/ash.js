/**
 * 香灰上的字（第三章：聽完錄音、下樓去戲台的路上）。
 * 西側樓梯走到底，正前方的地上翻倒了一只香爐，撒出一片香灰。往下走的時候，
 * 香灰上一筆一筆浮出一行小孩的字：「你說等一下」。走近，最後兩個字被一隻小手抹掉。
 * 它接的是後面那一句：以安隔著門說的「我等一下回來」（二樓捉迷藏時，樓梯底下的孩子會親口再說一次）。
 */
export function ashWriting(h, kit) {
  const { game, sense: s, fx } = h;
  const map = h.map, P = kit.props, synth = kit.synth, player = game.player;
  const st = () => game.story?.state;
  const C = { x: -16.1, y: 0.9, z: -29.35 };
  let spill = null, words = null, hand = null, pot = null, phase = 'idle', t = 0, prog = 0, nearT = 0;
  const onStair = () => { const p = player.pos; return p.x > -17.1 && p.x < -15.1 && p.z > -27.2 && p.z < -17 && p.y > 1.1 && p.y < 6.6; };
  const mod = {
    id: 'ash',
    setup() {
      const G = map.floorGroups?.[0] || map.scene;
      spill = P.ashSpill({ w: 2.1, h: 1.6 }); spill.root.position.set(C.x, C.y + 0.004, C.z + 0.1); kit.addRoot(spill.root, G);
      words = P.ashWords('你說等一下', { w: 1.75, h: 0.52 }); words.root.position.set(C.x, C.y + 0.007, C.z + 0.25); kit.addRoot(words.root, G);
      hand = P.handSmear(); hand.root.position.set(C.x + 0.48, C.y + 0.01, C.z + 0.27); hand.root.scale.setScalar(1.25); hand.root.rotation.y = 0.5; kit.addRoot(hand.root, G);
      try {
        pot = game.assets.model('brass_pot_01'); pot.scale.setScalar(0.95); pot.rotation.set(0.15, 0.6, Math.PI / 2 - 0.1); pot.position.set(C.x - 0.25, C.y + 0.16, C.z - 0.72);
        pot.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        kit.addRoot(pot, G);
      } catch { pot = null; }
      for (const o of [spill.root, words.root, hand.root, pot]) if (o) o.visible = false;
      words.reveal(0);
    },
    canStart() {
      const S = st(); if (!S || S.chapter !== 3 || S.flags.key || !S.evidence.includes('tape')) return false;
      // 往下走（面朝北、看得到樓梯底下）的時候才開始；上樓時它在背後，不浪費
      return onStair() && player.pos.y < 5.6 && Math.abs(Math.atan2(Math.sin(player.yaw), Math.cos(player.yaw))) < 1.3;
    },
    force() {},
    start() {
      phase = 'reveal'; t = 0; prog = 0; nearT = 0;
      for (const o of [spill.root, words.root, pot]) if (o) o.visible = true;
      hand.root.visible = false; words.reveal(0);
      synth.rustle({ pan: fx.panOf(s.bearing(C.x, C.z)), dist: kit.dist(C.x, C.z), gain: 0.5, dur: 1.4 });
      kit.dreadTo = 0.35;
      return true;
    },
    update(dt) {
      game.audio.score?.watch('ash', phase); // 配樂：香灰浮字時一小段八音盒
      if (dt <= 0) return false;
      t += dt;
      const inView = kit.sees(C.x, C.y + 0.05, C.z + 0.25, 0);
      if (phase === 'reveal') {
        // 只在看著的時候浮出來
        if (inView) prog = Math.min(1, prog + dt / 4.6);
        words.reveal(prog);
        if (inView && Math.random() < dt * 2.2) synth.rustle({ pan: fx.panOf(s.bearing(C.x, C.z)), dist: Math.max(1, kit.dist(C.x, C.z)), gain: 0.18, dur: 0.35 });
        if (prog >= 1) { phase = 'read'; t = 0; }
        else if (t > 40) return true; // 一直沒看：字留在那裡，不再等
        return false;
      }
      if (phase === 'read') {
        nearT = kit.dist(C.x, C.z) < 2.2 ? nearT + dt : nearT;
        if (nearT > 0.4 || t > 7) {
          phase = 'smear'; t = 0;
          hand.root.visible = true; words.reveal(0.55);
          synth.giggle({ pan: fx.panOf(s.bearing(-16.1, -24)), dist: Math.max(1.5, kit.dist(-16.1, -24)), muffle: true, gain: 0.8 });
          fx.sfx('breath', 0.2, 0.6, 0.5);
        }
        return false;
      }
      if (phase === 'smear') return t > 1.8;
      return true;
    },
    stop() { phase = 'idle'; },
    dispose() {},
    debug() { return { phase, t: +t.toFixed(2), prog: +prog.toFixed(2) }; },
  };
  return mod;
}
