import * as THREE from 'three';
import { clamp, wrap } from '../sense.js';

/**
 * 1998 年的捉迷藏（第三章，戲台之後第一次踏上二樓）。
 *
 * 燈全部熄掉，一個小孩在耳邊說「輪到你數了」。玩家被帶到柱子前，按住 Space 閉眼數到十：
 * 腳步四散、壓低的笑聲、經櫃的門、鼓、布幔，數到一半有東西貼在背後呼吸（放開 Space 會偷看到東西）。
 * 睜開眼，二樓多了幾樣 1998 年的擺設；五個方向各回一聲「好了」。在黑暗裡找出五個孩子的回聲
 * （經櫃裡、供桌下、布幔後、大鼓後、樓梯下），每個人說一句那一晚說過的話。
 * 第六個永遠找不到；最後是她在你背後說「找到你了」。不阻擋主線，一次性。
 */
const Y = 6.9;
const COLS = { xs: [-11.5, -4, 4, 11.5], zs: [-18.5, -23, -27.5] };
const NUMS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

export function hideSeek(h, kit) {
  const { game, sense: s, fx } = h;
  const map = h.map, world = map.world, P = kit.props, synth = kit.synth, player = game.player;
  const st = () => game.story?.state;
  const kids = kit.children, xiaoyu = kids[5];
  const g2 = () => map.floorGroups?.[1] || map.scene;
  let cab = null, drum = null, curtain = null, skirt = null;
  const boxes = [];
  const spots = [];
  // ── 狀態 ──
  let phase = 'idle', t = 0, count = 0, lastNum = 0, peeked = 0, peekT = 0, found = 0, foundT = 0, revealing = null, nudgeT = 0, idleNag = 0, hintT = 0;
  let turnArmed = 0, turnA = false, turnT = 0, turnSeen = 0, echoT = 0, echoes = 0, wasMoving = 0, sixthT = 0, behindShown = false, behindSeen = 0, flashWas = true, peekShown = false;
  const spot = { x: 0, y: 0, z: 0, bearing: 0, dist: 0 };
  const countPos = new THREE.Vector3(), faceP = new THREE.Vector3();
  const W = kit.woman;

  function setVisible1998(on) {
    for (const o of [cab.root, drum.root, curtain.root, skirt.root]) o.visible = on;
    for (const b of boxes) b.disabled = !on;
  }
  function placeKid(g, x, z, yaw, pose = 'huddle') {
    g.root.position.set(x, Y, z); g.root.rotation.set(0, yaw, 0);
    g.setPose?.(pose, true); g.setFade?.(1); g.setGlitch?.(0); g.lookAt?.(null); g.setEyes?.(0);
  }
  const panTo = (x, z) => fx.panOf(s.bearing(x, z));
  const distTo = (x, z) => kit.dist(x, z);

  function addBox(x1, z1, x2, z2, y1, y2) { world.box(x1, z1, x2, z2, y1, y2); const b = world.boxes.at(-1); b.disabled = true; boxes.push(b); }

  const mod = {
    id: 'hideseek',
    setup() {
      const G = g2();
      cab = P.cabinet({ w: 1.2, d: 0.6, h: 2.05 }); cab.root.position.set(-15.6, Y, -31.28); kit.addRoot(cab.root, G);
      addBox(-16.22, -31.6, -14.98, -30.96, Y, Y + 2.15);
      drum = P.drum({ r: 0.5, len: 0.78, cy: 1.15 }); drum.root.position.set(-7.75, Y, -28.8); kit.addRoot(drum.root, G);
      addBox(-8.3, -29.22, -7.2, -28.38, Y, Y + 1.75);
      curtain = P.drape({ w: 3.3, h: 4.55, seed: 1998, folds: 9 }); curtain.root.position.set(15.25, Y + 4.6, -30.25); kit.addRoot(curtain.root, G);
      addBox(13.5, -30.32, 17.05, -30.18, Y, Y + 4.6);
      skirt = P.skirt({ w: 2.3, h: 0.66, seed: 98 }); skirt.root.position.set(0, Y + 0.93, -22.91); kit.addRoot(skirt.root, G);
      setVisible1998(false);
      // 五個躲藏點：孩子的位置、要看的那一點、找到時的演出、說的話
      spots.push(
        { id: 'cabinet', kid: 0, x: -15.6, z: -31.25, yaw: 0, look: [-15.6, Y + 1.0, -30.9], R: 2.4, los: true, who: '經櫃裡，小時候的阿哲', text: '先扣上，大人等一下就來。', py: 'xian1 kou4 shang4 da4 ren2 deng3 yi2 xia4 jiu4 lai2',
          reveal(u) { cab.open(Math.min(1, u * 2.2) * 0.75); }, cue() { game.audio.creak?.(undefined, { pan: panTo(-15.6, -31.2), dist: distTo(-15.6, -31.2), gain: 0.8 }); } },
        { id: 'table', kid: 1, x: 0.25, z: -23.3, yaw: 0, look: [0, Y + 0.35, -22.9], R: 2.5, los: true, who: '供桌下，小時候的佩珊', text: '我幫她喊「有」了。', py: 'wo3 bang1 ta1 han3 you3 le5',
          reveal(u) { const k = Math.min(1, u * 2.5); skirt.root.position.x = k * 0.95; skirt.root.scale.x = 1 - k * 0.62; }, /* 桌裙被往旁邊撥開 */ cue() { synth.rustle({ pan: panTo(0, -22.9), dist: distTo(0, -22.9), gain: 0.6, dur: 0.5 }); } },
        { id: 'curtain', kid: 2, x: 15.3, z: -31.0, yaw: 0, look: [15.25, Y + 1.2, -30.08], R: 2.6, los: true, who: '布幔後面，小時候的柏翰', text: '後殿今天晚上，聽得到妳爸爸喔。', py: 'hou4 dian4 jin1 tian1 wan3 shang5 ting1 de5 dao4 ni3 ba4 ba5 o5',
          reveal(u) { const k = Math.min(1, u * 2); curtain.root.position.x = 15.25 + k * 1.25; curtain.root.scale.x = 1 - k * 0.6; }, cue() { synth.rustle({ pan: panTo(15.25, -30.25), dist: distTo(15.25, -30.25), gain: 0.9, dur: 0.8 }); } },
        { id: 'drum', kid: 3, x: -7.75, z: -29.7, yaw: 0, look: [-7.75, Y + 0.45, -29.7], R: 2.3, los: true, who: '鼓後面，小時候的志豪', text: '鞋我藏在鼓裡啦。讓她找久一點。', py: 'xie2 wo3 cang2 zai4 gu3 li3 la5 rang4 ta1 zhao3 jiu3 yi4 dian3',
          reveal() {}, cue() { synth.drum({ pan: panTo(-7.75, -28.8), dist: distTo(-7.75, -28.8), gain: 0.9 }); } },
        { id: 'stairs', kid: 4, x: 13.5, z: -23.6, yaw: Math.PI, look: [13.5, Y + 0.45, -23.6], R: 3.4, los: false, who: '樓梯底下，小時候的你', text: '我等一下回來。', py: 'wo3 deng3 yi2 xia4 hui2 lai2',
          reveal() {}, cue() { synth.thud({ pan: panTo(13.5, -23.6), dist: distTo(13.5, -23.6), gain: 0.6, light: true }); } },
      );
      for (const sp of spots) { sp.found = false; sp.lookT = 0; }
    },
    canStart() {
      const S = st(); if (!S || S.chapter !== 3 || !S.flags.stage || S.flags.key) return false;
      const p = player.pos;
      return kit.onFloor(1) && p.y > 6.5 && p.y < 8 && !(p.x < -15 && p.z < -16.9); // 已經離開樓梯口
    },
    force(opts = {}) { mod._force = opts; },
    start() {
      const o = mod._force || {}; mod._force = null;
      phase = 'dark'; t = 0; count = 0; lastNum = 0; peeked = 0; peeking = false; found = 0; revealing = null; turnArmed = 0; turnA = false; echoes = 0; echoT = 0; sixthT = 0; behindShown = false; peekShown = false; idleNag = 0; hintT = 0;
      for (const sp of spots) { sp.found = false; sp.lookT = 0; }
      for (const k of kids) k.root.visible = false;
      flashWas = player.flashOn;
      kit.blockStory = true; kit.dreadTo = 0.6;
      // 燈全部熄掉
      fx.dim(0.05, 0.005, 0.32, 3.5); fx.snuffFlames(player.pos.x, player.pos.y, player.pos.z, 40); kit.flash(0, 5);
      fx.sfx('sub', 0, 4, 0.9); fx.duck(1.6);
      chooseColumn();
      if (o.phase === 'search') { // 測試用：直接從找人開始
        kit.freeze(false); setVisible1998(true); phase = 'search'; t = 0; kit.flash(0.55, 4); player.teleport(countPos.x, Y, countPos.z, player.yaw, 0);
      }
      return true;
    },
    update(dt) {
      game.audio.score?.watch('hideseek', phase, lastNum, behindShown); // 配樂：數數、好了沒的死寂、背後的抽空
      if (dt <= 0) return false;
      t += dt;
      switch (phase) {
        case 'dark': return dark(dt);
        case 'count': return counting(dt);
        case 'call': return calling(dt);
        case 'search': return search(dt);
        case 'sixth': return sixth(dt);
        case 'end': return ending(dt);
        default: return true;
      }
    },
    stop() {
      kit.freeze(false); kit.endLook(); kit.count(0); kit.goal(''); kit.prompt(''); kit.wantSpace = false; kit.blockStory = false;
      for (const k of kids) { k.root.visible = false; k.setFade?.(1); }
      W.root.visible = false;
      setVisible1998(false); cab.open(0); skirt.root.rotation.x = 0; skirt.root.position.x = 0; skirt.root.scale.x = 1; curtain.root.position.x = 15.25; curtain.root.scale.x = 1;
      fx.restoreLights(2.2); fx.dim(1, 0, 1, 1.6); kit.flash(1, 4);
      phase = 'idle';
    },
    dispose() {},
    debug() { return { phase, t: +t.toFixed(2), count: +count.toFixed(2), found, spots: spots.map((sp) => (sp.found ? sp.id : '-')), peeked, revealing: revealing?.id || null, behindShown, countPos: [+countPos.x.toFixed(2), +countPos.z.toFixed(2)] }; },
    spots,
  };

  function chooseColumn() {
    let best = null, bd = 1e9;
    for (const x of COLS.xs) for (const z of COLS.zs) {
      const dx = player.pos.x - x, dz = player.pos.z - z, d = Math.hypot(dx, dz) || 1;
      if (d > bd) continue;
      const px = x + (dx / d) * 0.8, pz = z + (dz / d) * 0.8;
      if (Number.isNaN(s.standable(px, pz, Y, 0.4, 0.3))) continue;
      bd = d; best = [x, z, px, pz];
    }
    if (!best) best = [-11.5, -18.5, -11.5, -17.7];
    countPos.set(best[2], Y, best[3]); faceP.set(best[0], Y + player.eye - 0.32, best[1]); /* 額頭抵著柱子、微微低頭 */
  }

  // ── 1. 燈熄、耳語、被帶到柱子前 ──
  function dark(dt) {
    if (t > 0.9 && t - dt <= 0.9) { synth.speak('lun2 dao4 ni3 shu3 le5', { who: 'child', whisper: true, hrtf: true, pan: 0.6, dist: 0.4, gain: 1.1, behind: true }); kit.say('輪到你數了。', '很近的地方，小孩的聲音', 2.8, 'child'); }
    if (t > 1.0) {
      if (!kit.frozen) kit.freeze(true);
      kit.nudge(countPos.x, countPos.z, Math.min(1, dt * 2.2));
      kit.forceLook(faceP.x, faceP.y, faceP.z, 3.5);
    }
    if (t > 2.8) {
      phase = 'count'; t = 0; kit.releaseLook();
      kit.lookAround(player.yaw, player.pitch, 0.18, 0.12);
      kit.prompt('<kbd>Space</kbd>按住，閉上眼睛數到十'); kit.wantSpace = true;
    }
    return false;
  }

  // ── 2. 數到十 ──
  function counting(dt) {
    const hold = kit.held('Space');
    if (hold) {
      kit.veil(1, 3.2); kit.prompt('');
      if (peeking) { peeking = false; kit.flash(0, 8); }
      if (peekShown) { xiaoyu.root.visible = false; peekShown = false; }
      if (kit.veilValue > 0.85) {
        count += dt / 1.05;
        const n = Math.min(10, Math.floor(count));
        if (n > lastNum) { lastNum = n; kit.count(n, 0.82); countCue(n); }
      }
      if (count >= 10.6) {
        kit.count(0); kit.veil(0, 1.1); kit.prompt(''); kit.wantSpace = false; kit.endLook();
        setVisible1998(true);
        kit.flashPattern([[0.5, 0], [0.18, 0.35], [0.2, 0.08], [0.3, 0.55]]);
        phase = 'call'; t = 0; kit.freeze(false);
      }
    } else {
      // 偷看
      if (count > 0.3) {
        kit.veil(0.3, 3);
        if (!peeking) { peeking = true; kit.flash(0.42, 5); } // 睜開一條縫：手電筒照著眼前的柱子
        if (kit.veilValue < 0.6 && peeked === 0 && count >= 3 && !peekShown) { peeked = 1; peekShow(); }
        peekT -= dt;
        if (peekT <= 0 && kit.veilValue < 0.7) { peekT = 6; synth.speak('bu4 ke3 yi3 tou1 kan4', { who: 'child', whisper: true, hrtf: true, pan: -0.5, dist: 0.4, gain: 1 }); kit.say('不可以偷看。', '很近的地方，小孩的聲音', 2.2, 'child'); }
        kit.prompt('<kbd>Space</kbd>按住，繼續數');
      } else { idleNag += dt; if (idleNag > 18) { idleNag = 0; synth.speak('kuai4 dian3 shu3', { who: 'child', whisper: true, pan: 0.7, dist: 1.5 }); kit.say('快點數啦。', '小孩的聲音', 2, 'child'); } }
      if (peekShown && t > peekT0 + 1.4) { xiaoyu.setGlitch?.(1); if (t > peekT0 + 1.6) { xiaoyu.root.visible = false; peekShown = false; } }
    }
    return false;
  }
  let peekT0 = 0, peeking = false;
  function peekShow() {
    // 偷看：她就站在柱子旁邊，探頭看你數
    const yaw = player.yaw, rx = Math.cos(yaw), rz = -Math.sin(yaw); // 玩家的右手方向
    // 站在柱子右前方、光圈的邊上：被照亮的柱子襯出一個小小的黑影，探頭看你數
    const x = countPos.x + rx * 0.52 - Math.sin(yaw) * 0.95, z = countPos.z + rz * 0.52 - Math.cos(yaw) * 0.95;
    placeKid(xiaoyu, x, z, Math.atan2(player.pos.x - x, player.pos.z - z), 'idle'); xiaoyu.setEyes?.(0.7);
    xiaoyu.lookAt?.(kit.eye); xiaoyu.root.visible = true; peekShown = true; peekT0 = t;
    fx.sfx('stinger', 0.6, 1, 0.55);
  }
  function countCue(n) {
    const sp = spots;
    switch (n) {
      case 1: synth.childSteps({ pan0: -0.6, pan1: -0.95, dist0: 1.5, dist1: 8, n: 7 }); synth.childSteps({ pan0: 0.5, pan1: 0.9, dist0: 1.2, dist1: 9, n: 7, delay: 0.12 }); synth.giggle({ pan: 0.4, dist: 4, delay: 0.5 }); break;
      case 2: synth.childSteps({ pan0: 0.1, pan1: 0.2, dist0: 2, dist1: 11, n: 6 }); synth.childSteps({ pan0: -0.2, pan1: -0.5, dist0: 2, dist1: 7, n: 5, delay: 0.3 }); break;
      case 3: sp[0].cue(); break;
      case 4: sp[3].cue(); synth.speak('xu1', { who: 'child', whisper: true, pan: -0.3, dist: 5, gain: 0.8 }); break;
      case 5: fx.sfx('breath', 0, 0.3, 1); kit.shake(0.004, 0.6); kit.say('（背後，很近，有人在呼吸。）', '', 2.4); break;
      case 6: sp[2].cue(); synth.giggle({ pan: panTo(15, -30), dist: 9, muffle: true }); break;
      case 7: sp[4].cue(); sp[1].cue(); break;
      case 8: fx.duck(3.2); break;
      case 9: synth.thud({ pan: 0, dist: 0.5, gain: 0.9, light: true }); break;
      case 10: break;
      default: break;
    }
  }

  // ── 3. 「好了沒？」五個方向回「好了」，第六聲在身後 ──
  function calling(dt) {
    if (t > 0.4 && t - dt <= 0.4) { synth.speak('hao3 le5 mei2', { who: 'man', dist: 0.3, gain: 0.7, wet: 1.6 }); kit.say('好了沒？', '我', 2); }
    for (let i = 0; i < 5; i++) {
      const at = 1.4 + i * 0.42;
      if (t > at && t - dt <= at) { const sp = spots[i]; synth.speak('hao3 le5', { who: 'child', pan: panTo(sp.x, sp.z), dist: distTo(sp.x, sp.z), gain: 1, pitch: 0.92 + i * 0.05 }); }
    }
    if (t > 1.4 && t - dt <= 1.4) kit.say('好了。', '五個方向，五個小孩的聲音', 2.4, 'child');
    if (t > 4.4 && t - dt <= 4.4) { synth.speak('hao3 le5', { who: 'child', whisper: true, hrtf: true, behind: true, dist: 0.4, pan: 0.1, gain: 1.1, rate: 0.7 }); kit.say('……好了。', '你背後', 2.4, 'child'); }
    if (t > 5.6) { phase = 'search'; t = 0; kit.goal('找出躲起來的孩子　0 / 5'); }
    return false;
  }

  // ── 4. 在黑暗裡找 ──
  function search(dt) {
    // 離開二樓：她直接在樓梯上找到你
    if (!kit.onFloor(1) || player.pos.y < 6.4) { phase = 'sixth'; t = 0; sixthT = 99; return false; }
    if (revealing) { revealStep(dt); return false; }
    for (const sp of spots) {
      if (sp.found) continue;
      const [lx, ly, lz] = sp.look, d = Math.hypot(lx - player.pos.x, lz - player.pos.z);
      let ok = d < sp.R && s.gaze(lx, ly, lz) < 0.42 && (s.flashLit || d < 1.4);
      if (ok && sp.los) ok = s.los(s.eye.x, s.eye.y, s.eye.z, lx, ly, lz);
      if (ok && !s.inView(lx, ly, lz, -0.05)) ok = false;
      sp.lookT = ok ? sp.lookT + dt : 0;
      if (sp.lookT > 0.3) { beginReveal(sp); break; }
    }
    // 太久沒找到：從還沒找到的地方傳出一點聲音
    hintT += dt;
    if (hintT > 16) { hintT = 0; const sp = spots.find((x) => !x.found); if (sp) { if (Math.random() < 0.5) sp.cue(); else synth.giggle({ pan: panTo(sp.x, sp.z), dist: distTo(sp.x, sp.z), muffle: true }); } }
    turnGhost(dt);
    ownSteps(dt);
    if (t > 170) { phase = 'sixth'; t = 0; }
    return false;
  }
  function beginReveal(sp) {
    revealing = sp; foundT = 0; sp.found = true; found++; hintT = 0;
    sp.cue();
    const k = kids[sp.kid]; placeKid(k, sp.x, sp.z, sp.yaw); k.root.visible = true; k.setFade?.(0);
    if (sp.id === 'drum') k.lookAt?.(kit.eye);
  }
  function revealStep(dt) {
    const sp = revealing, k = kids[sp.kid];
    foundT += dt;
    sp.reveal(foundT);
    k.setFade?.(clamp((foundT - 0.25) / 0.35, 0, 1) * (foundT > 2.9 ? clamp(1 - (foundT - 2.9) / 0.7, 0, 1) : 1));
    if (foundT > 0.7 && foundT - dt <= 0.7) {
      synth.speak(sp.py, { who: 'child', whisper: sp.id === 'stairs', pan: panTo(sp.x, sp.z), dist: Math.max(0.8, distTo(sp.x, sp.z)), gain: 1.1, pitch: [1.0, 1.08, 0.95, 0.98, 1.02][sp.kid] });
      kit.say(sp.text, sp.who, 3.4, 'child');
    }
    if (foundT > 1.6 && foundT - dt <= 1.6 && sp.id !== 'stairs') k.setGlitch?.(0.25);
    if (foundT > 3.7) {
      k.root.visible = false; k.setGlitch?.(0); revealing = null;
      kit.goal(`找出躲起來的孩子　${found} / 5`);
      if (found === 2 || found === 4) { turnArmed = 1; turnA = false; turnT = 0; }
      if (found >= 5) { phase = 'sixth'; t = 0; sixthT = 0; }
    }
  }
  /** 找的過程中，鬼出現在你轉身的地方 */
  function turnGhost(dt) {
    if (turnArmed !== 1) { if (turnA) { turnT += dt; const hp = W.root.position; const seen = kit.sees(hp.x, hp.y + 1.35, hp.z); turnSeen = seen ? turnSeen + dt : 0; if (turnSeen > 0.25 || turnT > 4 || kit.dist(hp.x, hp.z) < 1.1) { if (turnSeen > 0.25) { fx.sfx('stinger', panTo(hp.x, hp.z), kit.dist(hp.x, hp.z), 0.9); fx.glitch(0.6, 0.2); fx.sfxAt(0.3, 'ring', 0, 1, 0.5); } W.root.visible = false; W.setGlitch?.(0); W.lookAt?.(null); turnA = false; } } return; }
    turnT += dt;
    if (turnT > 25) { turnArmed = 0; return; }
    if (Math.abs(s.yawRate) > 1.5 && Math.abs(s.turnAccum) > 0.22) {
      const dir = s.turnAccum >= 0 ? 1 : -1;
      if (s.pickSpot(spot, Math.random, { b0: dir * (s.hfov + 0.3), b1: dir * (s.hfov + 1.3), d0: 2.2, d1: 4.2, tries: 8 })) {
        W.root.position.set(spot.x, spot.y, spot.z); W.root.rotation.set(0, Math.atan2(player.pos.x - spot.x, player.pos.z - spot.z), 0); W.root.userData.hairGravity = null;
        W.setPose?.('idle', true); W.setFade?.(1); W.setGlitch?.(0.15); W.lookAt?.(kit.eye); W.setEyes?.(0.4); W.root.visible = true;
        kit.womanWalk = false; turnArmed = 0; turnA = true; turnT = 0; turnSeen = 0;
      }
    }
  }
  /** 你停下來的時候，背後多走了兩步（你自己的腳步聲） */
  function ownSteps(dt) {
    echoT += dt;
    if (s.moveTime > 2.5) wasMoving = 1;
    if (wasMoving && s.speed < 0.2 && echoes < 3 && echoT > 14) {
      wasMoving = 0; echoes++; echoT = 0;
      synth.thud({ pan: 0.15, dist: 3.4, delay: 0.35, gain: 0.9 }); synth.thud({ pan: 0.05, dist: 3.0, delay: 0.95, gain: 0.85 });
    } else if (s.speed < 0.2) wasMoving = 0;
  }

  // ── 5. 第六個 ──
  function sixth(dt) {
    sixthT += dt;
    if (W.root.visible && !turnA) W.root.visible = false;
    if (turnA) turnGhost(dt);
    if (sixthT > 1.6 && sixthT - dt <= 1.6) { kit.goal('還有一個'); kit.say('……還有一個。', '我', 2.6); synth.giggle({ pan: -0.8, dist: 12, muffle: true }); }
    if (!behindShown && (sixthT > 9 || (sixthT > 4 && s.stillTime > 1.6) || sixthT > 90)) {
      // 她在你背後
      const yaw = player.yaw;
      let bx = player.pos.x + Math.sin(yaw) * 0.85, bz = player.pos.z + Math.cos(yaw) * 0.85;
      if (Number.isNaN(s.standable(bx, bz, player.pos.y, 0.6, 0.15))) { bx = player.pos.x + Math.sin(yaw) * 0.55; bz = player.pos.z + Math.cos(yaw) * 0.55; }
      placeKid(xiaoyu, bx, bz, Math.atan2(player.pos.x - bx, player.pos.z - bz), 'idle');
      xiaoyu.root.position.y = player.pos.y; xiaoyu.lookAt?.(kit.eye); xiaoyu.setEyes?.(0.3); xiaoyu.root.visible = true;
      behindShown = true; behindSeen = 0; t = 0;
      fx.sfx('breath', 0, 0.3, 1);
      synth.speak('zhao3 dao4 ni3 le5', { who: 'child', whisper: true, hrtf: true, behind: true, dist: 0.35, pan: 0.05, gain: 1.25, delay: 0.5 });
      kit.say('找到你了。', '你背後，很小的聲音', 3.2, 'child'); kit.goal('');
    }
    if (behindShown) {
      const p = xiaoyu.root.position, seen = kit.sees(p.x, p.y + 0.85, p.z);
      behindSeen = seen ? behindSeen + dt : 0;
      if (behindSeen > 0.15 || t > 6) {
        if (behindSeen > 0.15) { fx.sfx('stinger', 0, 0.8, 1); fx.glitch(0.8, 0.24); kit.shake(0.012, 0.35); }
        else { kit.shake(0.008, 0.4); fx.sfx('gasp', 0, 0.3, 0.8); kit.say('有一隻很小的手，拉了一下你的袖子。', '', 2.6); }
        xiaoyu.setGlitch?.(1); phase = 'end'; t = 0;
      }
    }
    return false;
  }
  function ending(dt) {
    if (t > 0.18 && xiaoyu.root.visible) { xiaoyu.root.visible = false; xiaoyu.setGlitch?.(0); setVisible1998(false); fx.restoreLights(2); fx.dim(1, 0, 1, 1.4); kit.flash(1, 3); fx.duck(2.5); fx.sfxAt(0.6, 'ring', 0, 1, 0.5); }
    if (t > 2.2) { game.story?.toast('那一年，沒有人去找第六個。她一直等到天亮，等有人說「找到妳了」。'); return true; }
    return false;
  }

  return mod;
}
