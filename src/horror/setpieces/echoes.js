import * as THREE from 'three';

/**
 * 三個朋友的回聲：柏翰、志豪、阿哲在 02:47 都走進了這座廟（劇情組在場景裡放了他們留下的痕跡，storyTraces.js）。
 * 玩家經過那些痕跡時，沒在看的那一側多了一個蒙著紅布、坐在凳子上的人。
 * 看過去，他答一聲「有」——像一場還沒點完的名；移開視線，他就不見了。三次各不相同：
 *   echo1 柏翰（第二～三章，一樓西側樓梯口那根寫著「都出來了 ←」的柱子）：背對你、面向柱子，手裡捏著半截粉筆。
 *         你正要上樓、背對他的時候，身後的凳腳拖了一下。答了「有」，又很小聲地補一句「還有一個」——
 *         他在三樓最後一根柱子上把「都出來了」劃掉、改寫的那一句（劇情組的粉筆字痕跡）。
 *   echo2 志豪（第四章，二樓北側佛龕前他那支還亮著的手電筒旁）：坐在光裡，對著撬開的踢腳板與灰上的字，雙手擱在膝上。
 *         答了「有」，又說「鞋我放回去了」（灰上寫的那一句；捉迷藏時小時候的他說的是「鞋我藏在鼓裡啦」）。不見之後手電筒閃了一下。
 *   echo3 阿哲（第四章，拿回布兔、再經過三樓時：東北收存桌旁，他的手機原本在那裡充電）：側身坐著，一隻手伸出來、掌心朝上，
 *         像在等你把手機還他。提示是你口袋裡那支手機在震。不見之後手機又震了一下：未接來電，張明哲，02:47。
 *         （四樓地鋪旁阿哲應聲的那一段是劇情組的錄音機演出，這裡不重複。）
 * 結局前玩家就會確定：他們都在門的另一邊。
 */
const DEFS = [
  { id: 'echo1', who: '紅布底下，柏翰的聲音', pose: 'chalk', pos: [-12.05, 0.9, -27.45], yaw: Math.atan2(-11.5 + 12.05, -28.2 + 27.45), seat: 0.46, stool: true, pitch: 1.0, lines: [['you3', '有。'], ['hai2 you3 yi2 ge5', '……還有一個。']], cue: 'scrape', range: [3, 13], dy: 4.5 },
  { id: 'echo2', who: '手電筒的光裡，志豪的聲音', pose: 'knees', pos: [5.72, 6.9, -28.42], yaw: Math.atan2(6.85 - 5.72, -29.99 + 28.42), seat: 0.46, stool: true, pitch: 0.95, lines: [['you3', '有。'], ['xie2 wo3 fang4 hui2 qu4 le5', '……鞋我放回去了。']], cue: 'scrape', lit: true, after: 'flicker', range: [4, 17], dy: 2.5 },
  { id: 'echo3', who: '紅布底下，阿哲的聲音', pose: 'palm', pos: [5.0, 11.9, -25.95], yaw: -Math.PI / 2, seat: 0.46, stool: true, pitch: 0.9, lines: [['you3', '有。']], cue: 'pocket', after: 'missed', range: [3.5, 14], dy: 2.5 },
];

export function echoes(h, kit) {
  const { game, sense: s, fx } = h;
  const map = h.map, P = kit.props, synth = kit.synth, player = game.player;
  const st = () => game.story?.state;
  return DEFS.map((def) => {
    let fig = null, phase = 'idle', t = 0, seenT = 0, awayT = 0, stareT = 0, said = 0, hx = 0, hy = 0, hz = 0;
    const at = new THREE.Vector3();
    const conds = {
      // 一樓或西側樓梯上（正要上二樓找錄音機、或從戲台回來）
      echo1: (S) => S.chapter >= 2 && S.chapter <= 3 && S.flags.incense && !S.flags.key && (kit.onFloor(0) || kit.onFloor(1)) && player.pos.x < -8 && player.pos.z < -18,
      echo2: (S) => S.chapter >= 4 && S.flags.key && !S.flags.underground && kit.onFloor(1),
      echo3: (S) => S.chapter >= 4 && S.evidence.includes('relic') && S.evidence.includes('death') && !S.flags.underground && kit.onFloor(2),
    };
    const range = def.range;
    const vanish = () => { if (fig) fig.root.visible = false; };
    const mod = {
      id: def.id,
      setup() {
        const seat = def.seat ?? 0.45;
        at.set(...def.pos);
        const parent = map.floorGroups?.[{ echo1: 0, echo2: 1, echo3: 2 }[def.id]] || map.scene;
        fig = P.sitter({ seat, pose: def.pose, stool: def.stool });
        fig.root.position.copy(at); fig.root.rotation.y = def.yaw; fig.root.visible = false;
        kit.addRoot(fig.root, parent);
        hx = at.x; hy = at.y + fig.headY; hz = at.z;
      },
      canStart() {
        const S = st(); if (!S || !conds[def.id](S)) return false;
        const d = kit.dist(hx, hz);
        if (d < range[0] || d > range[1] || Math.abs(player.pos.y - at.y) > def.dy) return false;
        return !kit.seesSolid(hx, hy, hz, 0.25) && !s.inView(hx, hy - 0.5, hz, 0.2); // 出現的那一刻不能被看到（連擋在扶手後面也不行）
      },
      force() {},
      start() {
        phase = 'shown'; t = 0; seenT = 0; awayT = 0; stareT = 0; said = 0;
        fig.root.visible = true;
        if (fig.screen) fig.screen.visible = true;
        cue(1.1);
        kit.dreadTo = 0.4;
        return true;
      },
      update(dt) {
        game.audio.score?.watch('echo', phase); // 配樂：回聲答「有」的那一聲是點名
        if (dt <= 0) return false;
        t += dt;
        const d = kit.dist(hx, hz);
        const seen = kit.seesSolid(hx, hy - 0.25, hz) && (d < 7.5 || s.flashAngle(hx, hy - 0.3, hz) < 0.6 || def.lit);
        if (phase === 'shown') {
          seenT = seen ? seenT + dt : Math.max(0, seenT - dt * 0.5);
          if (seenT > 0.55) { phase = 'said'; t = 0; speak(0); h.director?.spike?.(0.25); }
          else if (t > 26) { vanish(); return 'suspend'; } // 一直沒回頭：當作沒發生，之後再來
          else if (t > 9 && t - dt <= 9) cue(0.8);
          return false;
        }
        if (phase === 'said') {
          if (def.lines[1] && t > 1.6 && said === 1) speak(1);
          awayT = seen ? 0 : awayT + dt;
          stareT = seen ? stareT + dt : 0;
          if (awayT > 0.25 || stareT > 6) {
            if (stareT > 6) { kit.flashPattern([[0.2, 0.15], [0.4, 1]]); }
            vanish(); phase = 'gone'; t = 0;
            if (def.after === 'knock') fx.sfxAt(1.1, 'knock', fx.panOf(s.bearing(5.3, -22)), kit.dist(5.3, -22) + 1.5, 0.9); // 暗道的蓋板底下
            if (def.after === 'flicker') kit.flashPattern([[0.14, 0.35], [0.3, 1]]);
            if (def.after === 'missed') synth.buzz({ pan: 0.35, dist: 0.3, gain: 0.8, n: 1, delay: 0.9 });
          }
          return false;
        }
        if (phase === 'gone') {
          if (def.after === 'missed' && t > 1.2 && t - dt <= 1.2) kit.say('口袋裡的手機亮了一下。未接來電：張明哲，02:47。', '', 3.4);
          return t > (def.after === 'missed' ? 2.4 : 1.6);
        }
        return true;
      },
      stop() { vanish(); phase = 'idle'; },
      dispose() {},
      debug() { return { phase, t: +t.toFixed(2), d: +kit.dist(hx, hz).toFixed(2), head: [hx, +hy.toFixed(2), hz] }; },
      get head() { return [hx, hy, hz]; },
    };
    /** 讓玩家回頭的那一聲：凳腳拖地，或是口袋裡的手機在震 */
    function cue(gain) {
      const pan = fx.panOf(s.bearing(hx, hz)), d = kit.dist(hx, hz);
      if (def.cue === 'scrape') game.audio.creak?.(undefined, { pan, dist: d, gain });
      else if (def.cue === 'pocket') synth.buzz({ pan: 0.35, dist: 0.3, gain: gain * 0.8, n: 2 });
      else synth.buzz({ pan, dist: d, gain, n: 2 });
    }
    function speak(i) {
      const L = def.lines[i]; said = i + 1;
      synth.speak(L[0], { who: 'man', muffle: true, pan: fx.panOf(s.bearing(hx, hz)), dist: Math.max(1, kit.dist(hx, hz)), gain: 1.3, pitch: def.pitch, whisper: i > 0 });
      kit.say(L[1], def.who, 2.6);
    }
    return mod;
  });
}
