import * as THREE from 'three';
import { clamp, wrap } from '../sense.js';

/**
 * 三樓的巡獵與躲藏（第四章，拿到阿哲的手機之後）。
 *
 * 女影（美蘭的樣子）在三樓巡邏：赤腳的濕腳步、叫著「小雨」，偶爾叫你的名字。
 * 她用路徑點巡邏，靠視線（視錐 + 遮蔽 + 手電筒）與聲音（跑步的腳步）找人；被看見會先停下、轉頭（預警），再追。
 * 玩家可以躲（E）：經櫃、供桌下、布幔後。躲好就安全；她靠近時按住 Space 屏住呼吸，憋太久會喘出聲。
 * 阿哲的手機是探測器：她越近，螢幕越亮、雜訊越大。被碰到＝被抓：證據保留、回檢查點、deaths++、存檔。
 * 拿到門框上的身高刻痕並離開三樓（或撐過時限）就結束。
 */
const Y = 11.9;
const CEIL = 16.55;
// 路徑點（三樓：北側走道、四條縱向走道、南側走道）
const NODES = [
  [-11.0, -28.4], [-8.6, -27.0], [-2.2, -26.65], [2.2, -26.65], [9.6, -28.4], [3.0, -28.75], [9.6, -26.3], // 0 NW, 1 AN, 2 BN, 3 CN, 4 NE, 5 N2, 6 DN
  [-2.2, -17.7], [2.2, -17.7], [9.6, -17.7], [-9.6, -17.7], [-8.7, -25.3], // 7 BS, 8 CS, 9 DS, 10 AS, 11 AM
];
const EDGES = [[0, 1], [1, 2], [2, 3], [3, 5], [5, 4], [4, 6], [2, 7], [3, 8], [6, 9], [7, 8], [8, 9], [10, 7], [1, 11], [11, 10]];
const CALLS = [
  ['xiao3 yu3', '小雨……', 0.7], ['xiao3 yu3 ni3 zai4 na3 li3', '小雨，妳在哪裡？', 0], ['ma1 ma5 zai4 zhe4 li3', '媽媽在這裡。', 0],
  ['chu1 lai2 hao3 bu4 hao3', '出來好不好？', 0], ['yi3 an1', '以安……', 0.6], ['xiao3 yu3', '小雨——', 1.1],
];
const INSPECT = [['xiao3 yu3 chu1 lai2 ma1 ma5 bu2 hui4 ma4 ni3', '小雨，出來。媽媽不會罵妳。'], ['wo3 zhi1 dao4 ni3 zai4 li3 mian4', '我知道妳在裡面。']];
const CATCH = [
  ['她找的不是你', '她的臉貼得很近，濕頭髮掃過你的嘴。她叫的是「小雨」。\n紅布蓋下來的時候，你聽見她很失望地吸了一口氣。\n已取得的證據仍然保留。'],
  ['她記得你了', '這一次她沒有叫小雨。她用很輕的聲音，把你的名字唸了一遍，像在試發音。\n已取得的證據仍然保留。'],
  ['出來好不好', '她握住你的手腕，那條紅線勒進你的皮膚。「出來好不好？媽媽不會罵你。」\n她說的，是你小時候在門外沒有說出口的那一句。\n已取得的證據仍然保留。'],
];

export function patrol(h, kit) {
  const { game, sense: s, fx } = h;
  const map = h.map, world = map.world, P = kit.props, synth = kit.synth;
  const player = game.player;
  const W = kit.woman;
  const st = () => game.story?.state;
  const id = 'patrol';
  // ── 路徑圖：最短路徑的下一步表 ──
  const N = NODES.length, nextHop = new Int8Array(N * N).fill(-1);
  {
    const dist = new Float32Array(N * N).fill(1e9);
    for (let i = 0; i < N; i++) { dist[i * N + i] = 0; nextHop[i * N + i] = i; }
    for (const [a, b] of EDGES) { const d = Math.hypot(NODES[a][0] - NODES[b][0], NODES[a][1] - NODES[b][1]); dist[a * N + b] = dist[b * N + a] = d; nextHop[a * N + b] = b; nextHop[b * N + a] = a; }
    for (let k = 0; k < N; k++) for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const d = dist[i * N + k] + dist[k * N + j]; if (d < dist[i * N + j]) { dist[i * N + j] = d; nextHop[i * N + j] = nextHop[i * N + k]; } }
  }
  const nbrs = NODES.map((_, i) => EDGES.filter((e) => e[0] === i || e[1] === i).map((e) => (e[0] === i ? e[1] : e[0])));

  // ── 躲藏點 ──
  const spots = [];
  let curtainL = null, curtainR = null, cabinet = null, skirt = null;
  const camTmp = new THREE.Vector3();

  // ── 狀態 ──
  const pos = new THREE.Vector3(), tmp = { x: 0, z: 0 }, lastSeen = new THREE.Vector3(), goalP = new THREE.Vector3(), headP = new THREE.Vector3(), checkpoint = [0, 0, 0, 0, 0];
  let state = 'idle', stT = 0, heading = 0, speed = 0, aw = 0, visT = 0, canSee = false, beamOn = false, lostT = 0, node = 0, prevNode = -1, goalNode = -1, goalDirect = false;
  let stepAcc = 0, callT = 8, introT = 0, crawl = null, active = 0, hidden = null, hideT = 0, hideMode = '', holding = false, breath = 1, noise = 0, gaspLock = 0, flashWas = true;
  let lookBase = 0, seenEnter = false, inspectT = 0, inspectSaid = 0, catches = 0, nearSpot = null, introDone = false, gotBirths = false, phoneL = 0, holdT = 0, warnT = 0;
  const crawlA = new THREE.Vector3(), crawlB = new THREE.Vector3();
  let hideLight = null, hideLightTo = 0;

  function nearestNode(x, z, needLos = true) {
    let best = -1, bd = 1e9;
    for (let i = 0; i < N; i++) {
      const d = Math.hypot(NODES[i][0] - x, NODES[i][1] - z);
      if (d >= bd) continue;
      if (needLos && !s.los(x, Y + 1.0, z, NODES[i][0], Y + 1.0, NODES[i][1])) continue;
      bd = d; best = i;
    }
    return best >= 0 ? best : (needLos ? nearestNode(x, z, false) : 0);
  }
  /** 走向某一點：能直接看到就直走，否則沿路徑點 */
  function setGoal(x, z) { goalP.set(x, Y, z); goalNode = nearestNode(x, z); goalDirect = false; node = nearestNode(pos.x, pos.z); }
  function steer(dt, spd) {
    // 回傳 true = 到達 goalP
    const dxg = goalP.x - pos.x, dzg = goalP.z - pos.z, dg = Math.hypot(dxg, dzg);
    if (!goalDirect && dg < 7 && s.los(pos.x, Y + 1.0, pos.z, goalP.x, Y + 1.0, goalP.z)) goalDirect = true;
    let tx, tz;
    if (goalDirect || node < 0) { tx = goalP.x; tz = goalP.z; }
    else {
      tx = NODES[node][0]; tz = NODES[node][1];
      if (Math.hypot(tx - pos.x, tz - pos.z) < 0.45) {
        if (node === goalNode) { goalDirect = true; tx = goalP.x; tz = goalP.z; }
        else { node = nextHop[node * N + goalNode]; tx = NODES[node][0]; tz = NODES[node][1]; }
      }
    }
    moveToward(tx, tz, spd, dt);
    return goalDirect && dg < 0.4;
  }
  function moveToward(tx, tz, spd, dt) {
    const dx = tx - pos.x, dz = tz - pos.z, d = Math.hypot(dx, dz);
    if (d < 1e-3 || dt <= 0) { speed = 0; return; }
    const stp = Math.min(d, spd * dt);
    tmp.x = pos.x + (dx / d) * stp; tmp.z = pos.z + (dz / d) * stp;
    world.resolve(tmp, 0.28, Y);
    const moved = Math.hypot(tmp.x - pos.x, tmp.z - pos.z);
    pos.x = tmp.x; pos.z = tmp.z; speed = moved / dt;
    turnTo(Math.atan2(dx, dz), dt, 5);
    stepAcc += moved;
  }
  function turnTo(a, dt, rate) { heading = wrap(heading + clamp(wrap(a - heading), -rate * dt, rate * dt)); }
  function setState(sn) { state = sn; stT = 0; if (sn === 'look') lookBase = heading; }
  const pan = (x, z) => fx.panOf(s.bearing(x, z));
  const dPlayer = () => Math.hypot(player.pos.x - pos.x, player.pos.z - pos.z);
  function call(line, close = false) {
    const d = dPlayer();
    synth.speak(line[0], { who: 'woman', pan: pan(pos.x, pos.z), dist: Math.max(1.5, d), gain: 1.2, hold: line[2] || 0.25, wet: 1.5 });
    if (d < 16) kit.say(line[1], d < 5 ? '很近，女人的聲音' : '女人的聲音', 3, 'woman');
  }
  function showWoman() {
    W.root.visible = true; W.setFade?.(1); W.setPose?.('idle', true); W.setGlitch?.(0.12); W.lookAt?.(null); W.setEyes?.(0.35); // 黑暗裡看得到兩點反光
    W.root.rotation.set(0, heading, 0); W.root.position.copy(pos); W.root.userData.hairGravity = null;
  }
  function hideWoman() { W.root.visible = false; W.root.rotation.set(0, 0, 0); W.root.userData.hairGravity = null; kit.womanWalk = false; }

  // ── 躲藏 ──
  function enterHide(spot) {
    hidden = spot; hideMode = 'in'; hideT = 0; holding = false; noise = 0; holdT = 0;
    seenEnter = (state === 'chase' || state === 'alert') && dPlayer() < 14 && s.los(pos.x, Y + 1.5, pos.z, spot.ex, Y + 1.2, spot.ez);
    flashWas = player.flashOn; kit.freeze(true); kit.veil(0.92, 6);
    synth.rustle({ pan: 0, dist: 0.6, gain: 0.8, dur: 0.5 });
  }
  function exitHide(instant = false) {
    const spot = hidden; if (!spot) return;
    hidden = null; hideMode = ''; holding = false; kit.wantSpace = false;
    kit.endLook(); kit.mask(''); kit.breathMeter(null); fx.dim(1, 0, 1, 3); hideLightTo = 0;
    spot.set(0);
    player.teleport(spot.ex, Y, spot.ez, spot.yaw, 0); player.flashOn = flashWas;
    if (!instant) { kit.snapVeil(0.8); kit.veil(0, 3); synth.rustle({ pan: 0, dist: 0.6, gain: 0.7, dur: 0.45 }); }
    kit.freeze(false);
  }

  // ── 被抓到 ──
  function caught() {
    const wasHidden = !!hidden;
    if (hidden) exitHide(true);
    const n = Math.min(catches, CATCH.length - 1); catches++;
    // 她貼在你面前
    const cx = player.pos.x - Math.sin(player.yaw) * 0.55, cz = player.pos.z - Math.cos(player.yaw) * 0.55;
    pos.set(cx, Y, cz); heading = Math.atan2(player.pos.x - cx, player.pos.z - cz);
    showWoman(); W.setPose?.('reach', true); W.setGlitch?.(0.55); W.lookAt?.(kit.eye); W.setEyes?.(0.8);
    kit.womanWalk = false;
    headP.set(cx, Y + 1.55, cz);
    synth.speak(wasHidden ? 'zhao3 dao4 ni3 le5' : 'xiao3 yu3', { who: 'woman', dist: 0.4, gain: 1.3, hrtf: true, whisper: true });
    kit.catchPlayer({ face: headP, title: CATCH[n][0], body: CATCH[n][1], button: gotBirths ? '回到木尺架旁' : '回到阿哲的手機旁', reset });
    setState('caught');
  }
  function reset() { player.teleport(...checkpoint); player.flashOn = true; placeFar(checkpoint[0], checkpoint[2]); }
  /** 她回到離 (x,z) 最遠的路徑點，重新開始巡邏 */
  function placeFar(x, z) {
    let far = 0, fd = -1;
    for (let i = 0; i < N; i++) { const d = Math.hypot(NODES[i][0] - x, NODES[i][1] - z); if (d > fd) { fd = d; far = i; } }
    pos.set(NODES[far][0], Y, NODES[far][1]); node = far; prevNode = -1; aw = 0; lostT = 0; noise = 0; breath = 1;
    heading = Math.atan2(x - pos.x, z - pos.z);
    showWoman(); kit.womanWalk = true; setState('patrol'); pickNext();
    kit.phone(true, 0);
  }
  function pickNext() {
    const list = nbrs[node]; let best = list[0], bw = -1;
    for (const n of list) {
      if (n === prevNode && list.length > 1) continue;
      const dp = Math.hypot(NODES[n][0] - player.pos.x, NODES[n][1] - player.pos.z);
      const w = (0.6 + Math.random()) * (dp < 10 ? 1.6 : 1);
      if (w > bw) { bw = w; best = n; }
    }
    prevNode = node; goalP.set(NODES[best][0], Y, NODES[best][1]); goalNode = best; node = best; goalDirect = true;
  }

  // ── 天花板上倒爬過去 ──
  function startCrawl() {
    const fx0 = -Math.sin(player.yaw), fz0 = -Math.cos(player.yaw);
    const clampX = (x) => clamp(x, -13.6, 13.6), clampZ = (z) => clamp(z, -29.1, -17.0);
    crawlA.set(clampX(player.pos.x + fx0 * 11), CEIL, clampZ(player.pos.z + fz0 * 11));
    crawlB.set(clampX(player.pos.x - fx0 * 5), CEIL, clampZ(player.pos.z - fz0 * 5));
    const len = crawlA.distanceTo(crawlB);
    if (len < 7) return false;
    crawl = { t: 0, dur: len / 4.4, len };
    pos.copy(crawlA);
    W.root.visible = true; W.setFade?.(1); W.setPose?.('crawl', true); W.setGlitch?.(0.45); W.lookAt?.(null); W.setEyes?.(0.5);
    W.root.userData.hairGravity = DOWN;
    W.root.position.copy(crawlA);
    W.root.rotation.set(0, Math.atan2(crawlB.x - crawlA.x, crawlB.z - crawlA.z), Math.PI);
    kit.womanWalk = false;
    return true;
  }
  const DOWN = new THREE.Vector3(0, -1, 0);

  function onThirdFloor() { return kit.onFloor(2) && player.pos.y > 10.5 && player.pos.y < 14.5; }

  const mod = {
    id,
    setup() {
      const g3 = map.floorGroups?.[2] || map.scene;
      // 布幔：東北角兩片垂到地的紅布，中間留一道縫
      curtainL = P.drape({ w: 0.98, h: 4.48, seed: 311, folds: 4 }); curtainR = P.drape({ w: 0.98, h: 4.48, seed: 523, folds: 4 });
      curtainL.root.position.set(10.86, CEIL - 0.05, -28.95); curtainR.root.position.set(11.94, CEIL - 0.05, -28.95);
      kit.addRoot(curtainL.root, g3); kit.addRoot(curtainR.root, g3);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.3, 8).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.8 }));
      rod.position.set(11.4, CEIL - 0.03, -28.95); kit.addRoot(rod, g3);
      world.box(10.35, -29.02, 12.45, -28.88, Y, Y + 4.6);
      // 躲著的時候，躲藏點外面一盞很暗的冷光（眼睛適應黑暗後看得到的輪廓）；平常是關的，不投影
      hideLight = new THREE.PointLight(0x8ea4c4, 0, 3.2, 1.6); hideLight.name = 'DreadHideFill'; kit.addRoot(hideLight);
      // 經櫃：北牆邊
      cabinet = P.cabinet({ w: 1.2, d: 0.6, h: 2.05 });
      cabinet.root.position.set(1.6, Y, -29.28); kit.addRoot(cabinet.root, g3);
      world.box(0.98, -29.6, 2.22, -28.97, Y, Y + 2.15);
      // 地藏像前供桌（-11.3,-22）的桌裙：朝東
      skirt = P.skirt({ w: 1.72, h: 0.56, seed: 13 });
      skirt.root.position.set(-10.93, Y + 0.88, -22); skirt.root.rotation.y = Math.PI / 2; kit.addRoot(skirt.root, g3);
      spots.length = 0;
      spots.push(
        { id: 'curtain', label: '躲到布幔後面', kind: 'curtain', ex: 11.4, ez: -28.25, yaw: Math.PI, cam: [11.4, Y + 1.52, -29.3], pitch: -0.04, cx: 11.4, cy: Y + 1.4, cz: -28.95, set(k) { curtainL.root.position.x = 10.86 - k * 0.08; curtainR.root.position.x = 11.94 + k * 0.08; } },
        { id: 'cabinet', label: '躲進經櫃', kind: 'cabinet', ex: 1.6, ez: -28.32, yaw: Math.PI, cam: [1.6, Y + 1.46, -29.16], pitch: -0.06, cx: 1.6, cy: Y + 1.2, cz: -28.98, set(k) { cabinet.open(k ? 0.075 : 0); } },
        { id: 'table', label: '躲到供桌底下', kind: 'table', ex: -10.22, ez: -22, yaw: -Math.PI / 2, cam: [-11.36, Y + 0.4, -22], pitch: -0.1, cx: -10.95, cy: Y + 0.5, cz: -22, set(k) { skirt.root.rotation.z = 0; skirt.root.children[0].rotation.x = k ? -0.08 : 0; } },
      );
      for (const sp of spots) sp.prompt = '<kbd>E</kbd>' + sp.label;
    },
    canStart() {
      const S = st(); if (!S || S.chapter < 4 || !S.evidence.includes('death') || S.evidence.includes('births') || S.flags.underground) return false;
      return onThirdFloor() && !map.storyWorld?.scareActive;
    },
    force(opts = {}) { mod._force = opts; },
    /** 除錯／測試：不重開段落，直接把她放到某處、切換狀態（inspect 會走到玩家躲的地方） */
    poke(o = {}) {
      if (o.at) { pos.set(o.at[0], Y, o.at[1]); node = nearestNode(pos.x, pos.z); goalP.copy(pos); goalDirect = true; }
      if (o.heading !== undefined) heading = o.heading;
      if (o.state) { setState(o.state); inspectT = 0; inspectSaid = 0; if (o.state === 'patrol') pickNext(); }
      showWoman(); kit.womanWalk = true;
    },
    start() {
      const o = mod._force || {}; mod._force = null;
      state = 'intro'; stT = 0; introT = 0; aw = 0; active = 0; hidden = null; catches = catches || 0; noise = 0; breath = 1; gaspLock = 0; crawl = null;
      gotBirths = !!st()?.evidence.includes('births');
      const p = player.pos; checkpoint[0] = p.x; checkpoint[1] = p.y; checkpoint[2] = p.z; checkpoint[3] = player.yaw; checkpoint[4] = 0;
      kit.phone(true, 0.05); kit.dreadTo = 0.55; phoneL = 0;
      if (o.skipIntro || introDone) { introDone = true; placeFar(player.pos.x, player.pos.z); if (o.at) { pos.set(o.at[0], Y, o.at[1]); W.root.position.copy(pos); node = nearestNode(pos.x, pos.z); pickNext(); heading = o.heading ?? Math.atan2(player.pos.x - pos.x, player.pos.z - pos.z); } }
      else kit.say('手機自己亮了。螢幕上全是雜訊，越來越大聲。', '我', 3.2);
      if (o.state) setState(o.state);
      return true;
    },
    update(dt) {
      game.audio.score?.watch('patrol', state, W.root); // 配樂：依她的距離與狀態（巡、警覺、追、檢查躲藏處）
      if (kit.catching) { W.root.position.copy(pos); W.root.rotation.set(0, heading, 0); return false; }
      if (state === 'caught') { setState('patrol'); }
      if (dt <= 0) return false;
      const S = st();
      if (!gotBirths && S.evidence.includes('births')) { gotBirths = true; const p = player.pos; checkpoint[0] = p.x; checkpoint[1] = p.y; checkpoint[2] = p.z; checkpoint[3] = player.yaw; kit.say('拿到了。現在離開三樓。', '我', 2.6); }
      // 離開三樓
      if (!hidden && !onThirdFloor() && state !== 'intro') {
        if (gotBirths) return true;
        return 'suspend';
      }
      active += dt; stT += dt;
      const d = dPlayer();

      // ── 開場：雜訊變大，她從天花板倒爬過你頭上 ──
      if (state === 'intro') {
        introT += dt;
        phoneL = Math.min(0.55, introT * 0.18);
        const facingCorr = player.pos.z < -24 && player.pos.x > -6;
        if (!crawl && introT > 2.4 && (facingCorr && Math.abs(wrap(player.yaw - Math.PI / 2)) < 0.7 || introT > 9)) { if (!startCrawl()) { introDone = true; pos.set(NODES[0][0], Y, NODES[0][1]); node = 0; showWoman(); kit.womanWalk = true; setState('patrol'); pickNext(); call(CALLS[0]); } }
        if (crawl) {
          crawl.t += dt; const u = Math.min(1, crawl.t / crawl.dur);
          pos.lerpVectors(crawlA, crawlB, u); W.root.position.copy(pos);
          phoneL = 0.55 + 0.45 * Math.max(0, 1 - Math.hypot(pos.x - player.pos.x, pos.z - player.pos.z) / 6);
          stepAcc += dt * 4.4; if (stepAcc > 0.45) { stepAcc = 0; synth.thud({ pan: pan(pos.x, pos.z), dist: Math.hypot(pos.x - player.pos.x, pos.z - player.pos.z) + 2, gain: 0.7, light: true }); }
          if (u >= 1) { // 落地
            crawl = null; introDone = true; W.root.visible = false;
            pos.set(crawlB.x, Y, crawlB.z); tmp.x = pos.x; tmp.z = pos.z; world.resolve(tmp, 0.3, Y); pos.x = tmp.x; pos.z = tmp.z;
            heading = Math.atan2(pos.x - player.pos.x, pos.z - player.pos.z);
            synth.thud({ pan: pan(pos.x, pos.z), dist: Math.max(1.5, d), gain: 1.4 }); fx.sfxAt(0.25, 'stepBehind', pan(pos.x, pos.z), Math.max(1.5, d), 0.8);
            showWoman(); kit.womanWalk = true; node = nearestNode(pos.x, pos.z); setState('patrol'); stT = -1.2; pickNext();
            kit.say('東西落地的聲音，在你背後。', '', 2.2);
          }
        }
        kit.phone(true, phoneL); synth.setStatic(phoneL);
        return false;
      }

      // ── 玩家：躲藏 ──
      if (updateHiding(dt, d)) return false;

      // ── 她：視線與聲音 ──
      visT -= dt;
      if (visT <= 0) {
        visT = 0.1;
        canSee = false; beamOn = false;
        if (!hidden && state !== 'leave') {
          const crouch = player.eye < 1.3, ty = player.pos.y + (crouch ? 0.75 : 1.25);
          let range = 7.5 * (crouch ? 0.65 : 1);
          if (s.flashLit) range = Math.max(range, 14);
          beamOn = s.flashLit && s.flashAngle(pos.x, Y + 1.3, pos.z) < 0.42 && d < 22;
          if (beamOn) range = 22;
          const ang = Math.abs(wrap(Math.atan2(player.pos.x - pos.x, player.pos.z - pos.z) - heading));
          const fov = state === 'chase' ? Math.PI : 1.15;
          canSee = d < range && (ang < fov || d < 1.7) && Math.abs(player.pos.y - Y) < 2.5 && s.los(pos.x, Y + 1.55, pos.z, player.pos.x, ty, player.pos.z);
        }
        // 從第一次被看見到開始追，正常距離約一秒多：有時間反應（關手電筒、退到牆後、躲起來）
        if (canSee) { aw = Math.min(1.3, aw + 0.1 * (0.2 + 0.9 * (1 - d / 22)) * (beamOn ? 2.5 : 1)); lastSeen.copy(player.pos); lostT = 0; }
        else aw = Math.max(0, aw - 0.1 * (state === 'chase' ? 0.05 : 0.18));
      }
      // 腳步聲
      if (!hidden && s.stepped && state !== 'chase' && state !== 'leave') {
        const run = (player.keys.ShiftLeft || player.keys.ShiftRight) && s.speed > 3.2, crouch = player.eye < 1.3;
        const r = run ? 13 : crouch ? 2.2 : 6;
        if (d < r) { lastSeen.copy(player.pos); if (state === 'patrol' || state === 'search' || state === 'look' || state === 'investigate') { setState('investigate'); setGoal(lastSeen.x, lastSeen.z); } }
      }

      // ── 她的狀態機 ──
      let spd = 0, walk = true;
      switch (state) {
        case 'patrol': {
          spd = 1.05;
          if (stT < 0) { spd = 0; walk = false; break; }
          if (steer(dt, spd)) { // 到了路徑點：有時停下來聽
            if (Math.random() < 0.35) { setState('look'); } else pickNext();
          }
          if (aw > 0.3) alert();
          break;
        }
        case 'look': {
          walk = false; turnTo(lookBase + Math.sin(stT * 1.3) * 0.9, dt, 1.2); // 原地左右張望
          if (stT > 2.4) { setState('patrol'); pickNext(); }
          if (aw > 0.3) alert();
          break;
        }
        case 'investigate': {
          spd = 1.75;
          if (steer(dt, spd)) setState('look');
          if (aw > 0.3) alert();
          break;
        }
        case 'alert': {
          walk = false; turnTo(Math.atan2(player.pos.x - pos.x, player.pos.z - pos.z), dt, 3);
          if (aw >= 1) startChase();
          else if (stT > 1.2 && !canSee && aw < 0.2) { setState('investigate'); setGoal(lastSeen.x, lastSeen.z); }
          break;
        }
        case 'chase': {
          spd = 3.05;
          if (!canSee) lostT += dt;
          if (lostT > 3.5) { setState('search'); setGoal(lastSeen.x, lastSeen.z); W.lookAt?.(null); W.setEyes?.(0.2); break; }
          if (canSee || stT < 0.5) { goalP.set(player.pos.x, Y, player.pos.z); goalDirect = true; } else if (stT % 1 < dt) setGoal(lastSeen.x, lastSeen.z);
          steer(dt, spd);
          break;
        }
        case 'search': {
          spd = 1.5;
          if (steer(dt, spd) || stT > 7) { setState('patrol'); node = nearestNode(pos.x, pos.z); pickNext(); }
          if (aw > 0.5) startChase();
          break;
        }
        case 'inspect': {
          const sp = hidden || nearSpot;
          if (!sp) { setState('patrol'); pickNext(); break; }
          if (inspectT === 0) { goalP.set(sp.ex, Y, sp.ez); goalDirect = true; }
          if (Math.hypot(sp.ex - pos.x, sp.ez - pos.z) > 0.12 && inspectT === 0) { spd = 1.9; steer(dt, spd); }
          else {
            walk = false; inspectT += dt; turnTo(Math.atan2(sp.cx - pos.x, sp.cz - pos.z), dt, 3);
            // 站定之後彎下腰，把臉湊到縫前面往裡看
            if (inspectT > 1.8 && inspectT - dt <= 1.8 && hidden) { W.setPose?.('reach'); W.lookAt?.(camTmp, { speed: 1.4 }); W.setEyes?.(1); hideLightTo *= 1.4; /* 繫紅線的那隻手伸向縫 */ W.setGlitch?.(0.2); }
            if (inspectSaid === 0 && inspectT > 0.6) { inspectSaid = 1; const L = INSPECT[catches % 2]; synth.speak(L[0], { who: 'woman', pan: pan(pos.x, pos.z), dist: Math.max(0.8, d), gain: 1.1, whisper: true }); kit.say(L[1], '很近，女人的聲音', 3.2, 'woman'); }
            if (inspectT > 6.2) { inspectT = 0; inspectSaid = 0; W.setPose?.('idle'); W.lookAt?.(null); W.setEyes?.(0.35); setState('patrol'); let far = 0, fd = -1; for (let i = 0; i < N; i++) { const dd = Math.hypot(NODES[i][0] - pos.x, NODES[i][1] - pos.z); if (dd > fd && dd < 16) { fd = dd; far = i; } } goalNode = far; node = nearestNode(pos.x, pos.z); goalP.set(NODES[far][0], Y, NODES[far][1]); goalDirect = false; synth.speak('bu2 shi4', { who: 'woman', pan: pan(pos.x, pos.z), dist: Math.max(1, d), gain: 0.7, whisper: true }); }
          }
          break;
        }
        case 'leave': {
          spd = 1.3;
          if (steer(dt, spd)) { W.setFade?.(Math.max(0, 1 - stT * 0.6)); }
          if (stT > 9) { hideWoman(); if (!hidden) return true; }
          break;
        }
        default: break;
      }
      // 抓到
      if (!hidden && state !== 'leave' && d < 0.8 && Math.abs(player.pos.y - Y) < 1.3) { caught(); return false; }
      // 時限：撐過去，她往樓下走
      if (active > 170 && state !== 'leave' && state !== 'chase') { setState('leave'); setGoal(13.5, -26.4); kit.say('遠處的鐘響了一下。濕腳步往樓下去了。', '', 3); fx.sfx('bellFar', 0, 20, 0.7); }

      // ── 外觀與聲音 ──
      W.root.position.copy(pos); W.root.rotation.set(0, heading, 0);
      kit.womanWalk = walk && speed > 0.2;
      gaitClock(dt, speed);
      const stepLen = state === 'chase' ? 0.85 : 0.62;
      if (stepAcc > stepLen) { stepAcc = 0; synth.wetStep({ pan: pan(pos.x, pos.z), dist: Math.max(0.8, d), gain: state === 'chase' ? 1.3 : 1 }); }
      callT -= dt;
      if (callT <= 0 && (state === 'patrol' || state === 'look' || state === 'search')) { callT = 9 + Math.random() * 8; call(CALLS[(Math.random() * CALLS.length) | 0]); }
      // 手機：她越近雜訊越大
      const want = Math.pow(clamp(1 - d / 16, 0, 1), 1.3) * (hidden ? 0.55 : 1) + (state === 'chase' ? 0.25 : 0);
      phoneL += (clamp(want, 0, 1) - phoneL) * Math.min(1, dt * 4);
      kit.phone(true, phoneL); synth.setStatic(phoneL * (hidden ? 0.6 : 1));
      if (phoneL > 0.62) { warnT -= dt; if (warnT <= 0) { warnT = 1.6 + Math.random(); fx.sfx('static', 0.3, 0.5, 0.35 + phoneL * 0.4); } }
      kit.dreadTo = hidden ? (holding ? 0.8 : 0.6) : 0.45 + 0.5 * phoneL;
      if (hideLight) { hideLight.intensity += (hideLightTo - hideLight.intensity) * Math.min(1, dt * 3); curtainL.sway(kit.time); curtainR.sway(kit.time + 1.3); }
      return false;
    },
    stop(result) {
      if (hidden) exitHide(true);
      hideWoman(); kit.phone(false); synth.silence(); kit.prompt(''); kit.breathMeter(null); kit.mask(''); fx.dim(1, 0, 1, 2); hideLightTo = 0; if (hideLight) hideLight.intensity = 0;
      for (const sp of spots) sp.set(0);
      W.setFade?.(1); W.setEyes?.(0); W.setGlitch?.(0);
      if (result === true) kit.say(gotBirths ? '樓上的濕腳步停了。手機的雜訊也停了。' : '她往樓下去了。', '', 3);
      state = 'idle';
    },
    dispose() {},
    debug() { return { state, stT: +stT.toFixed(2), aw: +aw.toFixed(2), canSee, beamOn, hidden: hidden?.id || null, holding, breath: +breath.toFixed(2), noise: +noise.toFixed(2), d: +dPlayer().toFixed(2), pos: [+pos.x.toFixed(2), +pos.z.toFixed(2)], node, active: +active.toFixed(1), phone: +phoneL.toFixed(2), catches, crawl: !!crawl, seenEnter, nearSpot: nearSpot?.id || null }; },
    spots,
  };

  function alert() { setState('alert'); W.lookAt?.(kit.eye, { speed: 2.6 }); W.setGlitch?.(0.35); W.setEyes?.(0.5); synth.speak('a5', { who: 'woman', pan: pan(pos.x, pos.z), dist: Math.max(1, dPlayer()), gain: 0.8, whisper: true }); fx.sfx('sub', pan(pos.x, pos.z), dPlayer(), 0.6); }
  function startChase() {
    setState('chase'); lostT = 0; W.lookAt?.(kit.eye, { speed: 2.6 }); W.setGlitch?.(0.3); W.setEyes?.(0.9);
    fx.sfx('stinger', pan(pos.x, pos.z), dPlayer(), 1); fx.glitch(0.5, 0.2);
    synth.speak('xiao3 yu3', { who: 'woman', pan: pan(pos.x, pos.z), dist: Math.max(1, dPlayer()), gain: 1.5, hold: 0.5, pitch: 1.15 });
    kit.say('小雨！', '女人的聲音', 1.8, 'woman');
  }
  let gait = 0;
  function gaitClock(dt, spd) { gait += dt * clamp(spd / 1.25, 0.25, 2.2); kit.womanClock = gait; }

  function updateHiding(dt, d) {
    // 靠近躲藏點：提示 E
    nearSpot = null;
    if (!hidden && !kit.catching) {
      let best = null, bd = 1.6;
      for (const sp of spots) {
        const dd = Math.hypot(sp.ex - player.pos.x, sp.ez - player.pos.z);
        if (dd > bd || s.gaze(sp.cx, sp.cy, sp.cz) > 0.85) continue;
        best = sp; bd = dd;
      }
      nearSpot = best;
      kit.claimE = !!best && !game.story?.focused?.();
      kit.prompt(kit.claimE ? best.prompt : '');
      if (kit.claimE && kit.pressed('KeyE')) { enterHide(best); return false; }
      kit.clearPresses();
      return false;
    }
    if (!hidden) return false;
    kit.claimE = true; kit.wantSpace = true;
    hideT += dt;
    if (hideMode === 'in' && hideT > 0.22) { // 黑幕最濃的時候換位置
      hideMode = 'hidden'; hidden.set(1);
      camTmp.set(hidden.cam[0], hidden.cam[1], hidden.cam[2]);
      player.flashOn = false; player.yaw = hidden.yaw; player.pitch = hidden.pitch;
      player.pos.set(hidden.ex, Y, hidden.ez);
      kit.lookAround(hidden.yaw, hidden.pitch, 0.55, 0.32, camTmp); kit.look.breathe = 0.006;
      kit.mask(hidden.kind); kit.veil(0, 2.5);
      fx.dim(1, -0.005, 3, 3); // 眼睛適應了黑暗：從縫裡看得到外面的輪廓
      hideLight.position.set(hidden.cx + (hidden.ex - hidden.cx) * 0.4, Y + (hidden.kind === 'table' ? 0.5 : 1.15), hidden.cz + (hidden.ez - hidden.cz) * 0.4); hideLightTo = hidden.kind === 'table' ? 1.6 : 2.4;
      if (seenEnter && (state === 'chase' || state === 'alert')) { setState('inspect'); inspectT = 0; inspectSaid = 0; }
      return false;
    }
    if (hideMode !== 'hidden') return false;
    // 出來
    if (kit.pressed('KeyE')) { exitHide(); return false; }
    // 屏住呼吸
    gaspLock -= dt;
    const want = kit.held('Space') && gaspLock <= 0;
    if (want && !holding) { holding = true; holdT = 0; synth.speak('he5', { who: 'man', whisper: true, dist: 0.3, gain: 0.25 }); }
    if (!want && holding) { holding = false; if (holdT > 2) fx.sfx('breath', 0, 0.3, 0.45); }
    if (holding) {
      holdT += dt; breath = Math.max(0, breath - dt / 9);
      if (breath <= 0) { // 憋不住：喘出聲
        holding = false; gaspLock = 2.2; fx.sfx('gasp', 0, 0.3, 1); kit.say('（喘出聲來）', '', 1.6);
        if (state !== 'leave' && d < 6) { caught(); return true; }
        if (d < 12) { lastSeen.copy(player.pos); setState('investigate'); setGoal(hidden.ex, hidden.ez); }
      }
    } else breath = Math.min(1, breath + dt / 4.5);
    // 呼吸聲：她很近又沒屏息就會聽到
    if (!holding && d < 2.8 && state !== 'leave') { noise += dt * ((2.8 - d) / 2.8) * 1.1; if (noise >= 1) { caught(); return true; } }
    else noise = Math.max(0, noise - dt * 0.5);
    kit.breathMeter(holding || breath < 1 ? breath : null);
    kit.prompt(d < 6.5 && !holding ? '<kbd>Space</kbd>按住屏住呼吸　<kbd>E</kbd>出來' : holding ? '' : '<kbd>E</kbd>出來');
    kit.veil(holding ? 0.06 + (1 - breath) * 0.3 : 0, 2);
    return false;
  }
  return mod;
}
