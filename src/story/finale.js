import * as THREE from 'three';
import { createFinaleAudio } from './finaleAudio.js';
import { SEATS, CRYPT } from '../maps/temple/finaleStage.js';
import { FINALE_PICTURES } from './illustrations.js';

/**
 * 結局（finale）的時間軸與狀態機。由 Story.prepareRitual / finalChoice 呼叫 start('C'|'A'|'B')。
 *
 *  C「把話說完」  喚名・不要回頭 → 歸物・第六張椅子 → 見證・燙手的鑰匙 → 門後 → 出口（上樓、黎明的山門）
 *  A「說好不說」  繫緊紅繩（門後的人求你）→ 被燈追著走出去 → 對搜救隊說「都出來了」→ 幾個月後 23:47 的電話
 *  B「替身」      紅布蓋住臉 → 從縫裡看著另一個自己拿起手機上樓 → 被拖到第六張椅子 → 點名到六 → 替身打給佩珊
 *
 * 規則
 *  - 演出中 story.scene = 'finale'、story.ritual = 這個物件（自動存檔因此停止；讀檔一律回到最後抉擇前）。
 *  - 每個需要玩家的階段都可以失敗後就地重試，不清掉任何證據。
 *  - 光敏安全：沒有全螢幕閃爍；火光是柔和的明暗起伏；畫面撕裂之間至少隔 0.4 秒。
 *  - 後製（dread / glitch / pulse）與緊張度在恐怖導演之後寫入（演出期間包住 game.horror.update）。
 *
 * 除錯／測試：story.finale.debug = { state, phase, skip(), to(phase), run(秒), press(), hold(bool) }
 */
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sstep = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const MOVE = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'KeyC', 'Space']);
const ACT = new Set(['KeyE', 'Enter', 'Space', 'NumpadEnter']);
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const CSS = `
#finale-hud{position:absolute;inset:0;pointer-events:none;font-family:var(--serif)}
#story-hud.finale-on .objective,#story-hud.finale-on .journal-hint,#story-hud.finale-on #waypoint{opacity:0!important;transition:opacity .6s}
.fin-veil{position:fixed;inset:0;background:#000;opacity:0;pointer-events:none}
.fin-edge{position:fixed;inset:0;pointer-events:none;opacity:0;background:radial-gradient(ellipse at center,transparent 42%,rgba(70,6,4,.55) 78%,rgba(14,0,0,.97) 100%)}
.fin-edge.burn{background:radial-gradient(ellipse at 50% 55%,transparent 30%,rgba(255,96,24,.28) 62%,rgba(150,26,4,.75) 86%,rgba(40,4,0,.97) 100%)}
.fin-sub{position:absolute;left:50%;bottom:12vh;transform:translateX(-50%);width:min(980px,86vw);text-align:center;opacity:0;transition:opacity .35s}
.fin-sub small{display:block;font:11px var(--sans);letter-spacing:.32em;color:#9a8a73;margin-bottom:9px}
.fin-sub p{margin:0;font-size:25px;line-height:1.65;color:#ece4d4;text-shadow:0 0 22px #000,0 0 7px #000,0 0 2px #000;letter-spacing:.04em}
.fin-sub.voice small{color:#a8604f}.fin-sub.voice p{color:#dcbfae}
.fin-sub.it small{color:#b33b2c}.fin-sub.it p{color:#cf6250;letter-spacing:.12em}
.fin-sub.child small{color:#b6a27f}.fin-sub.child p{color:#f6ecd6;font-size:23px}
.fin-sub.mother small{color:#c7a77a}.fin-sub.mother p{color:#f0dcc0}
.fin-sub.me p{color:#e9e1d2}.fin-sub.tape p{color:#c9c2a8;font-family:var(--kai)}
.fin-hint{position:absolute;left:50%;bottom:5.5vh;transform:translateX(-50%);font:13px var(--sans);letter-spacing:.24em;color:#cdbfa8;opacity:0;transition:opacity .4s;white-space:nowrap;text-shadow:0 0 8px #000}
.fin-meter{position:absolute;left:50%;top:61%;width:240px;height:3px;margin-left:-120px;background:#2b1a12aa;opacity:0;transition:opacity .3s}
.fin-meter i{display:block;height:100%;width:0;background:linear-gradient(90deg,#9b2a14,#ff9a50);box-shadow:0 0 14px #ff6a2a}
.fin-answer{position:absolute;left:50%;top:50%;text-align:center;opacity:0;color:#efe5d2;transform:translate(-50%,-50%) scale(.5);text-shadow:0 0 30px #000}
.fin-answer b{display:block;font:600 96px/1 var(--serif);letter-spacing:.1em}
.fin-answer span{display:inline-flex;gap:10px;align-items:center;font:13px var(--sans);letter-spacing:.3em;color:#cbb79a;margin-top:12px}
.fin-answer.taken b{color:#d24a34}
.fin-card{position:fixed;inset:0;display:grid;place-items:center;pointer-events:none;opacity:0;transition:opacity 1.1s;font:300 25px var(--serif);letter-spacing:.55em;color:#cfc4b2;text-shadow:0 0 12px #000}
.fin-cloth{position:fixed;inset:0;pointer-events:none;overflow:hidden}
.fin-cloth i{position:absolute;left:-6%;right:-6%;height:60%;transition:transform .45s cubic-bezier(.5,0,.3,1);
  background:radial-gradient(120% 70% at 50% 50%,#0000 0,#0008 100%),repeating-linear-gradient(91deg,#3a0806 0 3px,#4c0c08 3px 5px,#330705 5px 9px),linear-gradient(#5a0d09,#2a0504);box-shadow:0 0 60px 30px #1a0201}
.fin-cloth i:first-child{top:0;transform:translateY(-104%)}.fin-cloth i:last-child{bottom:0;transform:translateY(104%)}
.fin-phone{position:fixed;left:50%;top:50%;width:250px;height:470px;margin:-235px 0 0 -125px;border-radius:32px;background:#07090c;border:2px solid #1d2126;box-shadow:0 0 80px #000,inset 0 0 0 6px #0c0f13;opacity:0;transition:opacity .7s;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:#d6dce3;font-family:var(--sans)}
.fin-phone b{font:200 64px var(--sans);letter-spacing:.04em;color:#e8edf2}.fin-phone small{letter-spacing:.3em;color:#8b96a3;font-size:12px}.fin-phone strong{font:400 22px var(--sans);letter-spacing:.2em}
.fin-phone.ring strong{animation:fin-ring .9s ease-in-out infinite alternate}
@keyframes fin-ring{from{opacity:.55}to{opacity:1}}
.fin-glare{position:fixed;width:44vmin;height:44vmin;margin:-22vmin 0 0 -22vmin;border-radius:50%;pointer-events:none;opacity:0;background:radial-gradient(circle,rgba(255,250,236,.9) 0,rgba(255,240,210,.35) 10%,rgba(255,230,190,.08) 34%,rgba(255,230,190,0) 62%);mix-blend-mode:screen}
.fin-mark{position:absolute;width:14px;height:14px;margin:-7px 0 0 -7px;border:1px solid #d6c6a6aa;transform:rotate(45deg);opacity:0;transition:opacity .4s}
`;

export function createFinale(story) {
  const game = story.game, map = game.map, sw = map.storyWorld, S = sw.finale, p = game.player;
  const au = createFinaleAudio(game);
  const ghost = sw.ghost;
  const tmp = new THREE.Vector3(), eye = new THREE.Vector3(), WARM = new THREE.Color(1, 0.72, 0.45);
  const F = {
    kind: null, phase: '', t: 0, cue: 0, step: 0, active: false,
    hold: false, holdT: 0, idle: 0, progress: 0, fails: { back: 0, key: 0 }, answered: false,
    lockMove: false, slow: 0, owns: false, wantsKey: false, keyPressed: false,
    dread: 0.3, dreadT: 0.3, glitch: 0, lastGlitch: -9, pulseB: 0, tension: 0.3, tensionT: 0.3, edge: 0, edgeT: 0, edgeKind: '',
    flash: 1, flashT: 1, hemi: 1, hemiT: 1, fogAdd: 0, fogT: 0, dawn: 0, dawnT: 0,
    cam: null, eye: null, look: null, nudge: 0, nudgeT: 0, shake: 0, time: 0, prev: new THREE.Vector3(), lights: null, flags: {},
  };
  const api = {
    get step() { return F.step; },
    set step(v) { F.step = v; },
    get active() { return F.active; },
    get kind() { return F.kind; },
    get phase() { return F.phase; },
  };

  // ───────────────────────── HUD ─────────────────────────
  let hud = null;
  const H = {};
  function mountHud() {
    if (!$('finale-style')) { const st = document.createElement('style'); st.id = 'finale-style'; st.textContent = CSS; document.head.appendChild(st); }
    hud?.remove();
    hud = document.createElement('div'); hud.id = 'finale-hud';
    hud.innerHTML = '<div class="fin-edge"></div><div class="fin-veil"></div><div class="fin-cloth"><i></i><i></i></div><div class="fin-mark"></div><div class="fin-glare"></div><div class="fin-answer"><b>有</b><span><kbd>E</kbd>應聲</span></div><div class="fin-meter"><i></i></div><div class="fin-card"></div><div class="fin-phone"><small></small><b>23:47</b><strong></strong><small></small></div><div class="fin-sub"><small></small><p></p></div><div class="fin-hint"></div>';
    ($('story-hud') || $('hud') || document.body).appendChild(hud);
    for (const k of ['edge', 'veil', 'cloth', 'mark', 'glare', 'answer', 'meter', 'card', 'phone', 'sub', 'hint']) H[k] = hud.querySelector('.fin-' + k);
    $('story-hud')?.classList.add('finale-on');
  }
  let subT = 0, veilT = null;
  function say(speaker, text, kind = 'me', dur = 0) {
    if (!hud) return;
    H.sub.className = 'fin-sub ' + kind;
    H.sub.querySelector('small').textContent = speaker || '';
    H.sub.querySelector('p').textContent = text;
    H.sub.style.opacity = 1;
    subT = dur || clamp(1.6 + text.length * 0.13, 2.2, 5.5);
  }
  let hintNow = null;
  function hint(html) { if (!hud || html === hintNow) return; hintNow = html; if (html) { H.hint.innerHTML = html; H.hint.style.opacity = 1; } else H.hint.style.opacity = 0; }
  function veil(o, sec = 1) { if (!hud) return; H.veil.style.transition = `opacity ${sec}s ease`; H.veil.style.opacity = o; veilT = o; }
  function card(text, on = true) { if (!hud) return; H.card.textContent = text || ''; H.card.style.opacity = on ? 1 : 0; }
  function phone(on, { top = '', name = '', bottom = '', clock = '23:47', ring = false } = {}) {
    if (!hud) return; const sm = H.phone.querySelectorAll('small');
    sm[0].textContent = top; sm[1].textContent = bottom; H.phone.querySelector('b').textContent = clock; H.phone.querySelector('strong').textContent = name;
    H.phone.classList.toggle('ring', ring); H.phone.style.opacity = on ? 1 : 0;
  }
  /** 紅布蓋臉：k = 0 沒有、1 全蓋。上下兩片各佔畫面 60%，中間留下 (1−k)×100% 的縫 */
  function cloth(k) {
    if (!hud) return; const [a, b] = H.cloth.querySelectorAll('i'); const gap = 100 * (1 - k);
    a.style.transform = `translateY(${(((50 - gap / 2) - 60) / 60) * 100}%)`; b.style.transform = `translateY(${(((50 + gap / 2) - 40) / 60) * 100}%)`;
  }
  /** 說一句話：字幕 + 合成的人聲（可省略拼音） */
  function line(speaker, text, kind, pinyin, voice, where = null, extra = {}) {
    say(speaker, text, kind, extra.dur);
    if (pinyin && voice) au.speak(pinyin, voice, { ...(where || { dist: 0.5, hrtf: false }), ...extra });
  }
  /** 世界座標 → 相對玩家的左右聲道與距離 */
  function at(x, z, extra = {}) {
    const dx = x - p.pos.x, dz = z - p.pos.z, d = Math.hypot(dx, dz) || 0.01;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
    return { pan: clamp((dx * rx + dz * rz) / d, -1, 1), dist: d, behind: (dx * fx + dz * fz) / d < 0, ...extra };
  }
  const door = () => at(CRYPT.door.x, CRYPT.door.z - 0.6, { wet: 1.6 });

  // ───────────────────────── 輸入 ─────────────────────────
  const onDown = (e) => {
    if (!F.active || game.story !== story) return;
    if (story.modal || !game.running) return;
    if (e.code === 'KeyJ') { e.stopImmediatePropagation(); e.preventDefault(); if (!e.repeat) story.toast('現在不能翻筆記。'); return; }
    if (F.lockMove && MOVE.has(e.code) && !(F.wantsKey && ACT.has(e.code))) { e.stopImmediatePropagation(); e.preventDefault(); return; }
    if (ACT.has(e.code) && (F.wantsKey || F.owns)) {
      e.stopImmediatePropagation(); e.preventDefault();
      if (F.wantsKey) { F.hold = true; if (!e.repeat) F.keyPressed = true; }
    }
  };
  const onUp = (e) => { if (ACT.has(e.code)) F.hold = false; };
  function listen(on) {
    window.removeEventListener('keydown', onDown, true); window.removeEventListener('keyup', onUp, true);
    if (on) { window.addEventListener('keydown', onDown, true); window.addEventListener('keyup', onUp, true); }
  }
  function lockMove(on) {
    F.lockMove = on;
    if (on) { for (const k of MOVE) p.keys[k] = false; p.vel.set(0, 0, 0); }
  }

  // ───────────────────────── 後製（在恐怖導演之後寫入） ─────────────────────────
  const horror = game.horror; let origHorrorUpdate = null;
  function wrapHorror(on) {
    if (on && !origHorrorUpdate && horror) {
      origHorrorUpdate = horror.update;
      horror.update = function (dt) { const r = origHorrorUpdate.call(horror, dt); if (F.active && game.story === story) post(); else if (!F.active || game.story !== story) wrapHorror(false); return r; };
    } else if (!on && origHorrorUpdate) { if (horror.update !== origHorrorUpdate) horror.update = origHorrorUpdate; origHorrorUpdate = null; }
  }
  function post() {
    const u = game.film?.uniforms;
    if (u) {
      if (u.dread) u.dread.value = F.dread;
      if (u.glitch) u.glitch.value = Math.max(u.glitch.value * 0.5, F.glitch);
      if (u.pulse) { const bp = F.pulseB % 1, lub = Math.exp(-bp * 9), dub = bp > 0.28 ? Math.exp(-(bp - 0.28) * 11) * 0.6 : 0; u.pulse.value = clamp((lub + dub) * clamp((F.tension - 0.35) / 0.45, 0, 1), 0, 1) * 0.8; }
    }
    game.audio.setTension?.(F.tension);
    if (F.flash !== 1) p.flash.intensity *= F.flash;
  }
  function glitch(a) { if (F.time - F.lastGlitch < 0.42) return; F.lastGlitch = F.time; F.glitch = Math.max(F.glitch, a); }

  // ───────────────────────── 燈光 ─────────────────────────
  function grabLights() {
    if (F.lights) return F.lights;
    const Ls = map.lights || [], fl = map.flames || [];
    const crypt = Ls.filter((L) => L.light.position.x > 45 && L.light.position.y < 0 && L !== S.fire.light);
    const red = crypt.find((L) => Math.abs(L.light.position.z + 23) < 0.6), blue = crypt.find((L) => Math.abs(L.light.position.z + 13) < 0.6);
    const flames = fl.filter((f) => f.sp.position.x > 45 && f.sp.position.y < 0);
    const tabletFlame = flames.reduce((b, f) => (!b || f.sp.position.distanceTo(tmp.set(50.7, -5.7, -22)) < b.sp.position.distanceTo(tmp) ? f : b), null);
    const hall = Ls.filter((L) => L.floor <= 0 && Math.abs(L.light.position.x) < 16 && L.light.position.z > -36 && L.light.position.z < 23 && L.light.position.y > -1).sort((a, b) => a.light.position.z - b.light.position.z);
    const hallFlames = fl.filter((f) => f.sp.position.y > -1 && f.sp.position.y < 6 && Math.abs(f.sp.position.x) < 21 && f.sp.position.z < 23);
    F.lights = {
      red, blue, flames, tabletFlame, hall, hallFlames,
      redColor: red?.light.color.clone(), blueColor: blue?.light.color.clone(),
      mul: { red: 1, blue: 1 }, to: { red: 1, blue: 1 }, rate: { red: 3, blue: 3 }, warm: 0, fire: false,
      fogColor: map.scene.fog?.color.clone(), bg: map.scene.background?.clone?.(), hemiColor: map.hemi?.color.clone(), hemiGround: map.hemi?.groundColor.clone(),
    };
    return F.lights;
  }
  function setLight(name, v, rate = 3) { const L = grabLights(); L.to[name] = v; L.rate[name] = rate; }
  function flamesOn(on, except = null) { for (const f of grabLights().flames) if (f !== except) f.sp.visible = on; }
  function applyLights(dt, t) {
    const L = grabLights();
    for (const k of ['red', 'blue']) {
      const d = L.to[k] - L.mul[k], st = L.rate[k] * dt; L.mul[k] = Math.abs(d) <= st ? L.to[k] : L.mul[k] + Math.sign(d) * st;
      const e = L[k]; if (!e) continue;
      let m = L.mul[k];
      if (k === 'red' && L.fire) m *= 0.92 + 0.12 * Math.sin(t * 6.1) * Math.sin(t * 2.3 + 1) + 0.06 * Math.sin(t * 11.3);
      e.mul = m;
    }
    if (L.red) { if (L.fire) L.red.light.color.setRGB(1, 0.42, 0.13); else if (L.warm > 0) L.red.light.color.copy(L.redColor).lerp(WARM, L.warm); else L.red.light.color.copy(L.redColor); }
  }
  function restoreLights() {
    const L = F.lights; if (!L) return;
    for (const k of ['red', 'blue']) if (L[k]) { L[k].mul = 1; L[k].light.color.copy(L[k + 'Color']); }
    for (const f of L.flames) f.sp.visible = true;
    for (const e of L.hall) e.mul = 1;
    for (const f of L.hallFlames) f.sp.visible = true;
    if (L.fogColor && map.scene.fog) map.scene.fog.color.copy(L.fogColor);
    if (L.hemiColor && map.hemi) { map.hemi.color.copy(L.hemiColor); map.hemi.groundColor.copy(L.hemiGround); }
    L.mul.red = L.mul.blue = L.to.red = L.to.blue = 1; L.warm = 0; L.fire = false;
  }

  // ───────────────────────── 鏡頭 ─────────────────────────
  function faceTo(x, z, dur = 1, pitch = null) { const yaw = Math.atan2(-(x - p.pos.x), -(z - p.pos.z)); F.cam = { y0: p.yaw, y1: p.yaw + wrap(yaw - p.yaw), p0: p.pitch, p1: pitch ?? p.pitch, t: 0, dur, pos: null }; }
  function walkTo(x, z, dur, faceX = null, faceZ = null, pitch = null) { F.cam = { y0: p.yaw, y1: faceX === null ? p.yaw : p.yaw + wrap(Math.atan2(-(faceX - x), -(faceZ - z)) - p.yaw), p0: p.pitch, p1: pitch ?? p.pitch, t: 0, dur, pos: [p.pos.x, p.pos.z, x, z] }; }
  function place(x, y, z, yaw, pitch = 0) { p.teleport(x, y, z, yaw, pitch); F.prev.copy(p.pos); F.cam = null; }
  const eyePos = () => eye.set(p.pos.x, p.pos.y + p.eye, p.pos.z);

  // ───────────────────────── 場景狀態 ─────────────────────────
  function roomNormal() {
    S.reset(); restoreLights(); grabLights();
    sw.sealedBuddha.visible = true;
    ghost.root.visible = false; ghost.setGlitch?.(0); ghost.setFade?.(1); ghost.lookAt?.(null);
    F.hemiT = 1; F.fogT = 0; F.dawnT = 0; F.dawn = 0;
  }
  function roomDark(keepTablet = true) {
    setLight('red', 0, 4); setLight('blue', 0, 4); flamesOn(false, keepTablet ? grabLights().tabletFlame : null);
    F.hemiT = 0.22; F.fogT = 0.004;
  }
  /** 火熄了以後只剩飄著的餘燼和一點暖光 */
  function embers(k) { S.fire.group.visible = k > 0; S.fire.embersOnly = true; S.fire.level = k; }
  function room1998(on) {
    const L = grabLights();
    if (on) {
      S.altar.visible = false; S.altarBox.disabled = true; sw.sealedBuddha.visible = false; S.seats.visible = false;
      S.fire.group.visible = true; S.fire.embersOnly = false; S.lock.group.visible = true; L.fire = true; setLight('red', 1.25, 2); setLight('blue', 0, 2); flamesOn(false);
      F.hemiT = 0.35; F.fogT = 0.006;
    } else { S.fire.level = 0; S.fire.group.visible = false; S.fire.embersOnly = false; L.fire = false; }
  }

  // ───────────────────────── 鬼（穿著美蘭的那個東西） ─────────────────────────
  function ghostShow(pose, x, z, faceX, faceZ, glitchK = 0) {
    ghost.setPose?.(pose, true); ghost.setFade?.(1); ghost.setGlitch?.(glitchK);
    ghost.root.position.set(x, -7, z); ghost.root.rotation.y = Math.atan2(faceX - x, faceZ - z); ghost.root.visible = true;
  }

  // ───────────────────────── 階段 ─────────────────────────
  const fadeGhost = { on: false, t: 0, dur: 1 };
  let walkCalls = 0, callT = 0, sideFlip = 1, bangT = 0, voiceT = 0, knockT = 0, stillT = 0, helped = 0;
  const lineOnce = new Set();
  const once = (id, fn) => { if (lineOnce.has(id)) return; lineOnce.add(id); fn(); };
  const plate = () => [CRYPT.plate.x, CRYPT.plate.z];
  const remember = (id) => { const s = story.state; s.seen ??= []; if (!s.seen.includes(id) && s.seen.length < 64) s.seen.push(id); };

  const CALLS = [
    ['身後，媽媽的聲音', '以安。', 'yi3 an1', 'mother'],
    ['身後，阿哲的聲音', '以安，你回頭看一下。', 'yi3 an1 ni3 hui2 tou2 kan4 yi2 xia4', 'ahzhe'],
    ['身後，佩珊的聲音', '以安……是我。你轉過來。', 'yi3 an1 shi4 wo3 ni3 zhuan3 guo4 lai2', 'peishan'],
    ['身後，我自己的聲音', '以安。', 'yi3 an1', 'self'],
    ['身後，好幾個聲音', '以安。以安。阿安。', 'yi3 an1 yi3 an1 a1 an1', 'it'],
  ];

  const PH = {
    // ════════════════ C：把話說完 ════════════════
    'c-ready': {
      enter() { roomNormal(); F.owns = false; F.wantsKey = false; lockMove(false); F.step = 0; F.dreadT = 0.42; F.tensionT = 0.35; hint('<kbd>E</kbd>　左側空牌位：說出她的名字'); voiceT = 1.2; },
      tick(dt) { voiceT -= dt; if (voiceT <= 0) { voiceT = 6 + Math.random() * 3; au.speak('dou1 chu1 lai2 le0', 'it', { ...door(), gain: 0.55 }); once('c-ready-sub', () => say('門裡', '都出來了。都出來了。', 'it')); } },
      skip() { api.action('riteName'); },
    },
    'c-name': {
      enter() { F.owns = true; lockMove(true); F.step = 1; hint(''); S.tabletName.visible = true; S.nameMat.opacity = 0; },
      tick() { S.nameMat.opacity = clamp((F.t - 0.3) / 2.6, 0, 1); },
      cues: [
        [0, () => line('我', '林小雨。', 'me', 'lin2 xiao3 yu3', 'self')],
        [1.7, () => line('我', '林小雨。我記得妳。', 'me', 'lin2 xiao3 yu3 wo3 ji4 de5 ni3', 'self')],
        [3.4, () => { game.audio.duck?.(6); F.dreadT = 0.5; F.tensionT = 0.45; }],
        [3.9, () => { setLight('blue', 0, 5); au.snuff(at(55, -13).pan, 9); }],
        [4.5, () => { for (const f of grabLights().flames) if (f.sp.position.x > 59.5) f.sp.visible = false; au.snuff(at(60, -26.4).pan, 6); }],
        [5.0, () => { for (const f of grabLights().flames) if (f.sp.position.x < 50.4) f.sp.visible = false; au.snuff(at(50, -26.4).pan, 5); }],
        [5.5, () => { for (const f of grabLights().flames) if (f.sp.position.x > 58) f.sp.visible = false; au.snuff(at(59, -22).pan, 7); }],
        [6.0, () => { for (const f of grabLights().flames) if (Math.abs(f.sp.position.x - 54.7) < 0.5) f.sp.visible = false; au.snuff(at(55, -23).pan, 4); }],
        [6.6, () => { setLight('red', 0, 2.5); roomDark(); au.snuff(0, 3); F.flashT = 0.85; }],
        [7.4, () => faceTo(...plate(), 1.3, 0)],
        [8.3, () => { game.audio.horror?.('breath', { pan: 0, dist: 0.3 }); placeGhostBehind(true); F.tensionT = 0.6; F.dreadT = 0.6; }],
        [9.0, () => say('我', '有人站在我後面。很近。', 'me')],
        [10.6, () => go('c-walk')],
      ],
      skip() { roomDark(); placeGhostBehind(true); go('c-walk'); },
    },
    'c-walk': {
      enter() {
        F.owns = false; lockMove(false); F.slow = 0.85; walkCalls = 0; callT = 0.7; F.step = 1;
        hint('<kbd>E</kbd>　走到中央供盤。不要回頭。'); roomDark(); placeGhostBehind(true); F.dreadT = 0.6; F.tensionT = 0.62;
      },
      tick(dt) {
        const [px, pz] = plate();
        // 它一直貼在你背後：在你和供盤連線的反方向
        const dx = px - p.pos.x, dz = pz - p.pos.z, d = Math.hypot(dx, dz);
        if (d > 0.5) { F.away = F.away || new THREE.Vector2(); F.away.set(dx / d, dz / d); }
        const aw = F.away || new THREE.Vector2(0, -1);
        const gx = p.pos.x - aw.x * 0.62, gz = p.pos.z - aw.y * 0.62;
        ghost.root.position.x += (gx - ghost.root.position.x) * Math.min(1, dt * 6); ghost.root.position.z += (gz - ghost.root.position.z) * Math.min(1, dt * 6);
        ghost.root.rotation.y = Math.atan2(aw.x, aw.y); ghost.lookAt?.(eyePos());
        // 呼名：一個接一個，每一聲都把頭往後扯一點
        callT -= dt;
        if (callT <= 0) {
          const c = CALLS[Math.min(walkCalls, CALLS.length - 1)]; walkCalls++;
          callT = walkCalls < 4 ? 1.9 : 1.5; sideFlip = -sideFlip;
          const side = sideFlip * 0.55;
          say(c[0], c[1], walkCalls >= 4 && c[3] === 'it' ? 'it' : 'voice');
          au.speak(c[2], c[3], { pan: side, dist: 0.35, behind: true, near: 0.7, gain: 1.1 });
          if (walkCalls % 2) game.audio.horror?.('breath', { pan: -side, dist: 0.3 });
          F.nudge = sideFlip * 0.85; F.nudgeT = 0.32;
        }
        // 不能轉向背後
        const lx = -Math.sin(p.yaw), lz = -Math.cos(p.yaw);
        const ang = Math.acos(clamp(lx * aw.x + lz * aw.y, -1, 1)) * 180 / Math.PI;
        const warn = clamp((ang - 95) / 40, 0, 1);
        F.edgeKind = ''; F.edgeT = 0.15 + warn * 0.85; F.dreadT = 0.58 + 0.35 * warn; F.tensionT = 0.62 + 0.38 * warn;
        if (warn > 0.45) glitch(0.18 + 0.3 * warn);
        if (warn > 0.3 && Math.random() < dt * 1.5) au.speak('hui2 tou2', 'it', { pan: -Math.sign(wrap(p.yaw - Math.atan2(-aw.x, -aw.y))) * 0.6, dist: 0.3, behind: true, gain: 0.7 });
        if (ang > 135) { F.fails.back++; remember('finale:looked-back'); go('c-fail1'); return; }
        hint(d < 1.5 ? (walkCalls >= 2 ? '<kbd>E</kbd>　把布兔放回供盤' : '……它還在叫你。') : '<kbd>E</kbd>　走到中央供盤。不要回頭。');
      },
      skip() { place(55, -7, -21.85, 0, -0.2); walkCalls = 4; api.action('riteRelic'); },
    },
    'c-fail1': {
      enter() {
        F.owns = true; lockMove(true); hint('');
        p.camera.getWorldDirection(tmp); tmp.y = 0; tmp.normalize();
        ghostShow('reach', p.pos.x + tmp.x * 0.62, p.pos.z + tmp.z * 0.62, p.pos.x, p.pos.z, 1); ghost.lookAt?.(eyePos(), { speed: 20 });
        au.shriek({ dist: 0.4 }); glitch(1); F.shake = 0.03; F.dreadT = 1; F.tensionT = 1;
        story.state.deaths++;
      },
      cues: [
        [0.55, () => veil(1, 0.25)],
        [1.4, () => line('身後，我自己的聲音', '你回頭了。', 'it', 'ni3 hui2 tou2 le0', 'it', { dist: 0.3, behind: true })],
        [3.0, () => { ghost.root.visible = false; ghost.setGlitch?.(0); place(51, -7, -21.0, Math.atan2(-(55 - 51), -(-23 + 21.0)), 0); veil(0, 1.2); hint('<kbd>E</kbd>　走到中央供盤。不要回頭。'); }],
        [3.4, () => go('c-walk')],
      ],
      skip() { veil(0, 0.1); ghost.root.visible = false; place(51, -7, -21.0, Math.atan2(-4, -(-2)), 0); go('c-walk'); },
    },
    'c-relic': {
      enter() { F.owns = true; lockMove(true); F.step = 2; hint(''); F.edgeT = 0; S.plateRabbit.visible = true; fadeGhost.on = true; fadeGhost.t = 0; fadeGhost.dur = 0.7; F.flashT = 0.8; },
      cues: [
        [0, () => line('我', '這是妳的。耳朵是妳媽媽補的。', 'me', 'zhe4 shi4 ni3 de5 er3 duo5 shi4 ni3 ma1 ma1 bu3 de5', 'self')],
        [1.2, () => { au.creakLong(1.2, -0.3, 4); walkTo(52.7, -20.6, 1.3, 54.0, -24.05); }],
        [2.6, () => { au.whump(); setLight('red', 1.0, 9); setLight('blue', 0.35, 9); flamesOn(true); F.hemiT = 0.75; F.fogT = 0; S.seats.visible = true; for (const f of S.friends) f.turn(0); game.audio.horror?.('sub', { intensity: 0.9 }); F.dreadT = 0.55; F.tensionT = 0.55; }],
        [4.0, () => say('我', (story.state.seen || []).includes('story:camp') ? '阿哲。志豪。柏翰。……又要點名了。今晚第二次。' : '阿哲。志豪。柏翰。', 'me')],
        [6.4, () => line('錄音裡的男人', '點名。', 'tape', 'dian3 ming2', 'guo', door())],
        ...rollCall(7.8, true),
        [20.4, () => { game.audio.duck?.(3); F.tensionT = 0.85; }],
        [22.6, () => { neckTurn = 0.001; game.audio.horror?.('stinger', { intensity: 0.55 }); au.pop(0, 0.5); glitch(0.35); F.dreadT = 0.75; }],
        [24.2, () => go('c-six')],
      ],
      tick() { },
      skip() { S.plateRabbit.visible = true; setLight('red', 1, 9); setLight('blue', 0.35, 9); flamesOn(true); S.seats.visible = true; for (const f of S.friends) f.turn(1, 0, aim(f)); neckTurn = 1; ghost.root.visible = false; go('c-six'); },
    },
    'c-six': {
      enter() { F.owns = true; F.wantsKey = true; F.keyPressed = false; lockMove(true); hint(''); say('我', '不要應。', 'me'); H.answer.classList.remove('taken'); F.dreadT = 0.7; F.tensionT = 0.8; },
      cues: [
        [1.8, () => line('錄音裡的男人', '六。', 'tape', 'liu4', 'guo', door())],
        [3.6, () => line('阿哲', '以安，你幫她喊一下。', 'voice', 'yi3 an1 ni3 bang1 ta1 han3 yi2 xia4', 'ahzhe', seatAt(1))],
        [5.4, () => line('錄音裡的男人', '六。', 'tape', 'liu4', 'guo', door(), { speed: 0.8 })],
        [6.6, () => line('柏翰', '喊一聲就好了。跟那時候一樣。', 'voice', 'han3 yi4 sheng1 jiu4 hao3 le0 gen1 na4 shi2 hou4 yi2 yang4', 'bohan', seatAt(3))],
        [8.4, () => line('錄音裡的男人', '六。', 'tape', 'liu4', 'guo', door(), { speed: 0.7 })],
        [9.2, () => line('志豪', '你不喊，她就一直在裡面。', 'voice', 'ni3 bu4 han3 ta1 jiu4 yi4 zhi2 zai4 li3 mian4', 'zhihao', seatAt(2))],
        [10.8, () => line('錄音裡的男人', '六。六。', 'tape', 'liu4 liu4', 'guo', door(), { speed: 0.6 })],
        [11.8, () => { say('三個人一起', '以安——', 'it'); for (const [i, v] of [[1, 'ahzhe'], [2, 'zhihao'], [3, 'bohan']]) au.speak('yi3 an1', v, { ...seatAt(i), speed: 1.4 }); glitch(0.3); }],
        [13.2, () => line('錄音裡的男人', '六。', 'tape', 'liu4', 'guo', door(), { speed: 0.5 })],
        [14.6, () => go('c-held')],
      ],
      tick(dt) {
        const k = clamp(F.t / 14.6, 0, 1);
        H.answer.style.opacity = String(0.25 + 0.75 * sstep(k * 1.4));
        const jx = Math.sin(F.time * 23) * 2 * k, jy = Math.cos(F.time * 19) * 2 * k;
        H.answer.style.transform = `translate(calc(-50% + ${jx + (1 - k) * 160}px), calc(-50% + ${jy + (1 - k) * 90}px)) scale(${0.45 + 1.05 * sstep(k)})`;
        F.edgeT = 0.2 + 0.5 * k; F.edgeKind = '';
        for (const f of S.friends) f.turn(1, Math.sin(F.time * 3 + f.root.position.x) * k * 0.4, aim(f));
        if (F.keyPressed) { F.keyPressed = false; go('c-answered'); }
      },
      skip() { go('c-held'); },
    },
    'c-held': {
      enter() { F.wantsKey = false; H.answer.style.transition = 'opacity 1.4s, transform 1.4s'; H.answer.style.opacity = 0; game.audio.duck?.(4); F.edgeT = 0; F.dreadT = 0.5; F.tensionT = 0.45; remember('finale:six-held'); },
      cues: [
        [1.4, () => line('錄音裡的男人', '……六。', 'tape', 'liu4', 'guo', door(), { gain: 0.6 })],
        [3.2, () => line('門後很遠的地方', '……有。', 'child', 'you3', 'childFar', { ...door(), dist: 6, gain: 0.9 })],
        [5.2, () => say('我', '這一次，沒有人替她喊。她自己應了。', 'me')],
        [7.4, () => { neckBack = 0.001; }],
        [9.4, () => go('c-witness-ready')],
      ],
      skip() { H.answer.style.opacity = 0; neckBack = 0; for (const f of S.friends) f.turn(0); go('c-witness-ready'); },
    },
    'c-answered': {
      enter() {
        F.wantsKey = false; F.answered = true; story.state.answers++; remember('finale:six-answered');
        H.answer.classList.add('taken'); H.answer.style.transition = 'transform .25s'; H.answer.style.transform = 'translate(-50%,-50%) scale(2.6)';
        line('我', '有。', 'me', 'you3', 'self');
        glitch(0.8); game.audio.horror?.('stinger', { intensity: 1 }); F.shake = 0.02; F.dreadT = 0.95; F.tensionT = 1;
      },
      cues: [
        [0.7, () => { setLight('red', 0.08, 12); setLight('blue', 0, 12); flamesOn(false); H.answer.style.transition = 'opacity .6s'; H.answer.style.opacity = 0; }],
        [1.2, () => line('身後，我自己的聲音', '有。……有。有。', 'it', 'you3 you3 you3', 'it', { dist: 0.3, behind: true })],
        [3.4, () => say('我', '我替她應了。它學走了我那一聲。', 'me')],
        [5.6, () => { setLight('red', 0.85, 3); setLight('blue', 0.3, 3); flamesOn(true); for (const f of S.friends) f.turn(0); neckTurn = 0; F.dreadT = 0.55; F.tensionT = 0.5; }],
        [6.8, () => go('c-witness-ready')],
      ],
      skip() { H.answer.style.opacity = 0; for (const f of S.friends) f.turn(0); setLight('red', 0.85, 9); flamesOn(true); go('c-witness-ready'); },
    },
    'c-witness-ready': {
      enter() { F.owns = false; F.wantsKey = false; lockMove(false); F.slow = 0; F.step = 2; S.seats.visible = true; for (const f of S.friends) f.turn(0); hint('<kbd>E</kbd>　右側錄音機：把那一分鐘說完'); F.dreadT = 0.5; F.tensionT = 0.45; F.edgeT = 0; },
      skip() { place(59, -7, -20.9, 0, -0.3); api.action('riteWitness'); },
    },
    'c-tape': {
      enter() { F.owns = true; lockMove(true); F.step = 3; hint(''); F.reels = 1; },
      cues: [
        [0, () => line('我', '我是陳以安。門是我扣的。', 'me', 'wo3 shi4 chen2 yi3 an1 men2 shi4 wo3 kou4 de5', 'self')],
        [2.8, () => { game.audio.horror?.('static', { dist: 0.8 }); }],
        [3.2, () => line('錄音裡的男人', '到了就敲三下。', 'tape', 'dao4 le0 jiu4 qiao1 san1 xia4', 'guo', at(59, -22))],
        [5.0, () => game.audio.horror?.('knock', door())],
        [6.4, () => line('錄音裡的女人', '裡面還有沒有人？', 'tape', 'li3 mian4 hai2 you3 mei2 you3 ren2', 'meilan', { ...at(59, -22), lp: 3000 })],
        [8.6, () => { card('02:47'); veil(1, 1.6); game.audio.duck?.(3); F.reels = 0; }],
        [10.4, () => { card('', false); room1998(true); place(55, -7, -27.12, 0, -0.1); S.lock.set(0.35, 0); card('1998　七月初一　02:47'); }],
        [11.2, () => { veil(0, 1.6); au.fire.set(0.9); S.fire.level = 0.2; }],
        [13.0, () => { card('', false); go('c-fire'); }],
      ],
      skip() { card('', false); room1998(true); place(55, -7, -27.12, 0, -0.1); veil(0, 0.1); au.fire.set(0.9); go('c-fire'); },
    },
    'c-fire': {
      enter() {
        F.owns = true; F.wantsKey = true; lockMove(true); F.progress = 0; F.idle = 0; F.released = 0; F.hold = false; F.keyPressed = false; F.armed = false;
        hint('<kbd>E</kbd>　按住：轉動鑰匙'); H.meter.style.opacity = 1; F.dreadT = 0.72; F.tensionT = 0.75; F.edgeKind = 'burn';
        knockT = 0.4; voiceT = 1.2; bangT = 2.4; helped = 0; lineOnce.delete('fire30'); lineOnce.delete('fire55'); lineOnce.delete('fire75'); lineOnce.delete('fire90');
        room1998(true); S.fire.level = Math.max(S.fire.level, 0.2); au.fire.set(0.9);
      },
      tick(dt) {
        S.fire.level = Math.min(1, S.fire.level + dt * 0.35);
        const holding = F.hold;
        if (holding) { F.progress = Math.min(1, F.progress + dt / 6.5); F.released = 0; if (F.progress > 0.12) F.armed = true; }
        else { F.progress = Math.max(0, F.progress - dt * 0.4); if (F.armed) F.released += dt; }
        if (!F.armed) F.idle += dt;
        const k = F.progress;
        S.lock.set(0.4 + 0.6 * k, k);
        au.sizzle.level(holding ? 0.12 + 0.3 * k : 0, holding ? 0.08 : 0.2);
        F.edgeKind = 'burn'; F.edgeT = 0.28 + (holding ? 0.62 * k + 0.1 : 0);
        F.tensionT = 0.75 + 0.25 * k; F.dreadT = 0.7 + 0.25 * k; F.shake = Math.max(F.shake, holding ? 0.0015 + 0.004 * k : 0);
        if (holding && Math.random() < dt * (0.6 + 2 * k)) glitch(0.12 + 0.25 * k);
        H.meter.firstElementChild.style.width = (k * 100).toFixed(1) + '%';
        // 門裡的小手一直在敲；美蘭在你身後喊；大人在拉她
        knockT -= dt; if (knockT <= 0) { knockT = 0.45 + Math.random() * 0.9; au.knockSmall(1, at(55, -28.5).pan, 1.2); }
        voiceT -= dt;
        if (voiceT <= 0) {
          voiceT = 3.2 + Math.random();
          const r = helped++ % 4;
          if (r === 0) line('門裡的孩子', '媽媽，我還在。', 'child', 'ma1 ma1 wo3 hai2 zai4', 'child', { ...at(55, -28.6), dist: 1.2, lp: 1800 });
          else if (r === 1) line('美蘭（被拉住）', '小雨——！讓我開門！', 'voice', 'xiao3 yu3', 'meilan', { pan: 0.3, dist: 6, behind: true, scream: 1, wet: 2 });
          else if (r === 2) line('門裡的孩子', '我還在。我還在。', 'child', 'wo3 hai2 zai4 wo3 hai2 zai4', 'child', { ...at(55, -28.6), dist: 1.2 });
          else line('大人們', '不能開！有人應了聲，不能開！先還再開！', 'voice', 'bu4 neng2 kai1 xian1 huan2 zai4 kai1', 'guo', { pan: -0.4, dist: 5, behind: true });
        }
        bangT -= dt; if (bangT <= 0) { bangT = 3 + Math.random() * 3; au.pop(Math.random() - 0.5, 0.8); }
        if (k > 0.3) once('fire30', () => { line('門裡，我自己的聲音', '放手吧。你沒有做錯。', 'it', 'fang4 shou3 ba5 ni3 mei2 you3 zuo4 cuo4', 'self', { ...at(55, -28.6), dist: 0.6 }); voiceT = 3.4; });
        if (k > 0.55) once('fire55', () => { line('美蘭（身後）', '以安！不要放！', 'voice', 'yi3 an1 bu2 yao4 fang4', 'meilan', { pan: 0.2, dist: 5, behind: true, scream: 1 }); voiceT = 3; });
        if (k > 0.75) once('fire75', () => { line('門裡，我自己的聲音', '很燙吧。放手，就不燙了。', 'it', 'hen3 tang4 ba5 fang4 shou3 jiu4 bu4 tang4 le0', 'self', { ...at(55, -28.6), dist: 0.5 }); voiceT = 3.4; });
        if (k > 0.9) once('fire90', () => { line('門裡的孩子', '以安？是你嗎？你說你會回來。', 'child', 'yi3 an1 shi4 ni3 ma5', 'child', { ...at(55, -28.6), dist: 1 }); voiceT = 4; });
        if (k >= 1) { go('c-unlock'); return; }
        if (F.released > 1.6 || F.idle > 24) { F.fails.key++; remember('finale:let-go'); go('c-fail3'); }
      },
      skip() { F.progress = 1; go('c-unlock'); },
    },
    'c-fail3': {
      enter() { F.wantsKey = false; F.hold = false; au.sizzle.level(0, 0.1); H.meter.style.opacity = 0; hint(''); F.edgeKind = ''; F.edgeT = 0.6; au.fire.set(1.2); S.fire.level = 1; F.armed = false; },
      cues: [
        [0, () => say('我', '……我放手了。', 'me')],
        [1.0, () => au.knockSmall(0.45, 0, 1.6)],
        [2.2, () => au.knockSmall(0.25, 0, 1.8)],
        [2.6, () => line('門裡的孩子', '……我還在……', 'child', 'wo3 hai2 zai4', 'childFar', { ...door(), dist: 2.2, gain: 0.5 })],
        [4.4, () => line('大人們', '都出來了？', 'voice', 'dou1 chu1 lai2 le0', 'guo', { pan: 0, dist: 7, behind: true })],
        [5.6, () => veil(1, 1.2)],
        [7.4, () => { say('我', '跟那時候一樣。……再一次。', 'me'); S.lock.set(0.4, 0); F.progress = 0; veil(0, 1.4); }],
        [8.6, () => go('c-fire')],
      ],
      skip() { veil(0, 0.1); go('c-fire'); },
    },
    'c-unlock': {
      enter() { F.owns = true; lockMove(true); F.wantsKey = false; F.hold = false; H.meter.style.opacity = 0; hint(''); au.clunk(); au.sizzle.level(0, 0.05); au.fire.set(0); game.audio.duck?.(8); S.lock.set(0.25, 1); S.lock.fall = 1; F.edgeT = 0; F.tensionT = 0.4; F.dreadT = 0.4; setLight('red', 0, 1.5); F.doorT = 0; },
      cues: [
        [0.3, () => { room1998(false); embers(0.22); }],
        [1.6, () => { au.creakLong(4.6, 0, 1.5); F.doorT = 0.001; }],
        [2.0, () => { showChild(); walkTo(56.3, -26.2, 2.6, 55.05, -28.1, -0.34); }],
        [7.0, () => go('c-girl')],
      ],
      tick(dt) { if (F.doorT > 0) { F.doorT += dt; S.door.set(clamp(F.doorT / 4.6, 0, 1) * 0.92); } },
      skip() { room1998(false); S.door.set(0.92); showChild(); place(56.3, -7, -26.2, Math.atan2(-(55.05 - 56.3), -(-28.1 + 26.2)), -0.34); go('c-girl'); },
    },
    'c-girl': {
      enter() { F.owns = true; lockMove(true); S.door.set(0.92); F.tensionT = 0.2; F.dreadT = 0.25; F.flashT = 0.7; F.childLook = 0; F.childLookDown = 0; },
      cues: [
        [0.2, () => { F.childLook = 0.001; }],
        [2.8, () => line('小雨', '你回來了。', 'child', 'ni3 hui2 lai2 le0', 'child', { ...at(55.05, -28.3), dist: 1.6, speed: 1.2 })],
        [6.4, () => line('我', '……對不起。我說我等一下就回來。', 'me', 'dui4 bu5 qi3', 'self', { dist: 0.3, gain: 0.7 })],
        [10.4, () => { line('小雨', '我的鞋找不到了。', 'child', 'wo3 de5 xie2 zhao3 bu2 dao4 le0', 'child', { ...at(55.05, -28.3), dist: 1.6, speed: 1.15 }); F.childLookDown = 0.001; }],
        [13.6, () => go('c-lunge')],
      ],
      tick(dt) {
        S.child.lookAt = eyePos();
        if (F.childLook > 0) { F.childLook = Math.min(1, F.childLook + dt / 2.4); S.child.look = sstep(F.childLook); }
        if (F.childLookDown > 0) { F.childLookDown = Math.min(1, F.childLookDown + dt / 1.2); S.child.look = 1 - 0.7 * sstep(F.childLookDown); }
      },
      skip() { S.child.look = 0.5; go('c-lunge'); },
    },
    'c-lunge': {
      enter() {
        F.owns = true; lockMove(true);
        ghostShow('reach', 53.2, -27.9, p.pos.x, p.pos.z, 1); ghost.lookAt?.(eyePos(), { speed: 12 });
        au.shriek({ ...at(53.2, -27.9) }); glitch(0.7); F.dreadT = 0.85; F.tensionT = 0.95; F.shake = 0.012; F.lunge = 0;
        say('穿著美蘭的那個東西', '應我——！', 'it'); au.speak('ying4 wo3', 'it', { ...at(53.2, -27.9), scream: 1 });
      },
      cues: [
        [2.4, () => {
          game.audio.duck?.(9); ghost.setGlitch?.(0.25); F.dreadT = 0.3; F.tensionT = 0.25;
          line('美蘭', '……小雨？', 'mother', 'xiao3 yu3', 'meilanTrue', { ...at(ghost.root.position.x, ghost.root.position.z), dist: 1.4, speed: 1.4 });
        }],
        [3.6, () => { ghost.setGlitch?.(0); ghost.setPose?.('kneel'); ghost.lookAt?.(childHead()); F.kneelTurn = 0.001; const L = grabLights(); L.warm = 1; setLight('red', 0.32, 0.4); F.hemiT = 0.35; }],
        [5.6, () => go('c-mother')],
      ],
      tick(dt) {
        if (F.t < 1.0) { // 撲過來，停在你面前一步之外
          const g = ghost.root.position, tx = 55.3, tz = -27.0, k = Math.min(1, dt * 4.5);
          g.x += (tx - g.x) * k; g.z += (tz - g.z) * k; ghost.root.rotation.y = Math.atan2(p.pos.x - g.x, p.pos.z - g.z);
        }
        if (F.kneelTurn > 0) { F.kneelTurn = Math.min(1, F.kneelTurn + dt / 1.6); const g = ghost.root.position; const want = Math.atan2(S.child.root.position.x - g.x, S.child.root.position.z - g.z); ghost.root.rotation.y += wrap(want - ghost.root.rotation.y) * Math.min(1, dt * 2.5); }
      },
      skip() { ghostShow('kneel', 55.3, -27.0, 55.05, -28.3, 0); grabLights().warm = 1; setLight('red', 0.32, 9); go('c-mother'); },
    },
    'c-mother': {
      enter() { F.owns = true; lockMove(true); F.dreadT = 0.12; F.tensionT = 0.05; F.edgeT = 0; ghost.lookAt?.(childHead()); },
      cues: [
        [0.2, () => { F.rise = 0.001; faceTo(55.2, -27.5, 2.2, -0.28); }],
        [2.4, () => line('小雨', '媽媽。', 'child', 'ma1 ma1', 'child', { ...at(55.05, -28.3), dist: 1.8 })],
        [4.0, () => line('美蘭', '媽媽聽到了。妳一直說妳還在……媽媽聽到了。', 'mother', 'ma1 ma1 ting1 dao4 le0', 'meilanTrue', { ...at(55.3, -27.0), dist: 1.6, speed: 1.3 })],
        // 讀過那塊翻過去的木牌，美蘭會把牌子背面那句話說出口
        [7.6, () => { if ((story.state.notes || []).includes('tablet')) line('美蘭', '這次妳叫，媽媽就應。', 'mother', 'zhe4 ci4 ni3 jiao4 ma1 ma1 jiu4 ying4', 'meilanTrue', { ...at(55.3, -27.0), dist: 1.6, speed: 1.3 }); }],
        [8.6, () => walkTo(53.95, -26.75, 3.4, 55.2, -27.3, -0.24)], // 你慢慢繞到側邊，看得見她們兩個人的臉
        [9.4, () => { const c = S.child.root, g = ghost.root.position; c.rotation.y = Math.atan2(g.x - c.position.x, g.z - c.position.z); S.child.walk = 0.42; }],
        [13.0, () => { S.child.walk = 0; ghost.setPose?.('kneelHold'); }],
        [13.6, () => { const g = ghost.root.position; au.hum({ ...at(g.x, g.z), dist: 1.8, gain: 1 }); }],
        [15.0, () => { F.fadeAll = 0.001; }],
        [22.4, () => { S.thread.visible = true; }],
        [23.2, () => go('c-quiet')],
      ],
      tick(dt) {
        if (F.rise > 0) { F.rise = Math.min(1, F.rise + dt / 1.9); S.child.rise = sstep(F.rise); }
        S.child.lookAt = childLookMother; S.child.look = 1; const gh = ghost.root.position; childLookMother.set(gh.x, -7 + 1.05, gh.z);
        const c = S.child.root.position, g = ghost.root.position;
        if (S.child.walk > 0 && Math.hypot(c.x - g.x, c.z - g.z) < 0.42) S.child.walk = 0;
        if (F.fadeAll > 0) { F.fadeAll = Math.min(1, F.fadeAll + dt / 6.5); const a = 1 - sstep(F.fadeAll); S.fire.level = 0.22 * a; ghost.setFade?.(a); S.child.setFade(a); if (a <= 0.01) { ghost.root.visible = false; } }
      },
      skip() { ghost.root.visible = false; S.child.setFade(0); S.thread.visible = true; go('c-quiet'); },
    },
    'c-quiet': {
      enter() { F.owns = true; lockMove(true); ghost.root.visible = false; S.child.setFade(0); embers(0); S.thread.visible = true; game.audio.duck?.(9); F.dreadT = 0.05; F.tensionT = 0; hint(''); },
      cues: [
        [5.4, () => say('我', (story.state.notes || []).includes('robe') ? '素衣袖口那條燒斷、沒有人剪的紅線……這一次，她問完了。' : '她問完了。', 'me', 4)],
        [9.0, () => au.cough(105, at(55, -29.5).pan, 4, 3)],
        [10.6, () => au.cough(98, at(54.4, -29.6).pan, 4.4, 2)],
        [11.8, () => au.cough(126, at(55.6, -29.6).pan, 4.4, 2)],
        [13.4, () => line('門裡，阿哲沙啞的聲音', '……以安？', 'voice', 'yi3 an1', { f0: 104, fs: 0.98, voiced: 0.4, breath: 0.8, rate: 0.8 }, { ...door(), dist: 3.2, gain: 0.8 })],
        [16.2, () => say('我', '他們還在呼吸。……我去叫人。', 'me')],
        [18.8, () => { story.state.flags.sent = true; story.sync(); go('c-exit'); }],
      ],
      skip() { story.state.flags.sent = true; story.sync(); go('c-exit'); },
    },
    'c-exit': {
      enter() { F.owns = true; F.wantsKey = false; lockMove(false); F.slow = 0; hint('往南側石階走'); setLight('red', 0.4, 1); setLight('blue', 0.6, 1); grabLights().warm = 0.6; F.hemiT = 0.55; voiceT = 2.5; },
      tick(dt) {
        voiceT -= dt; if (voiceT <= 0) { voiceT = 3 + Math.random() * 2.5; au.cough(95 + Math.random() * 35, at(55, -29.3).pan, Math.hypot(p.pos.x - 55, p.pos.z + 29.3), 2); }
        mark(55, -6.2, -11.8);
        if (p.pos.z > -13.0 && Math.abs(p.pos.x - 55) < 1.4) go('c-up');
      },
      skip() { go('c-up'); },
    },
    'c-up': {
      enter() { F.owns = true; lockMove(true); hint(''); mark(); veil(1, 1); },
      cues: [
        [0.4, () => { for (let i = 0; i < 6; i++) setTimeout(() => game.audio.footstep?.(0.55, 'stone'), i * 420); }],
        [2.8, () => { dawnSetup(0.45); place(5.3, 16.9, -20.4, 0.25, -0.05); veil(0, 1.8); }],
        [4.0, () => say('我', '紅布……全都掉在地上了。', 'me')],
        [6.4, () => say('我', '祂們終於看得見了。', 'me')],
        [7.4, () => { lockMove(false); hint('到露台去'); }],
      ],
      tick(dt) { if (F.t > 7.4) { mark(0, 17.6, -16.4); if (p.pos.z > -17.7 || F.t > 45) go('c-terrace'); } },
      skip() { dawnSetup(0.45); veil(0, 0.1); place(0, 16.9, -16.8, Math.PI, -0.05); go('c-terrace'); },
    },
    'c-terrace': {
      enter() { F.owns = true; lockMove(true); hint(''); mark(); S.gate.group.visible = true; S.gate.stretcher.visible = false; F.dawnT = 0.6; },
      cues: [
        [0.4, () => faceTo(0, 22, 1.6, -0.3)],
        [1.0, () => line('山下傳來的聲音', '有人嗎——', 'voice', 'you3 ren2 ma5', 'rescuer', { pan: 0, dist: 30, wet: 2.5 })],
        [3.6, () => veil(1, 1.2)],
        [5.0, () => { place(0, 0.02, 18.6, Math.PI, -0.04); F.dawnT = 0.85; au.birds(true); veil(0, 1.6); }],
        [6.4, () => go('c-gate')],
      ],
      skip() { place(0, 0.02, 18.6, Math.PI, -0.04); veil(0, 0.1); S.gate.group.visible = true; S.gate.stretcher.visible = false; F.dawnT = 0.85; go('c-gate'); },
    },
    'c-gate': {
      enter() { F.owns = true; lockMove(true); F.wantsKey = false; F.dreadT = 0.05; F.tensionT = 0; voiceT = 0; S.gate.begin(); S.gate.beam = 0.6; },
      cues: [
        [0.5, () => line('搜救隊員', '先生？你還好嗎？', 'voice', 'xian1 sheng5 ni3 hai2 hao3 ma5', 'rescuer', at(0.3, 22.3))],
        [1.9, () => { game.audio.horror?.('static', { ...at(-1.2, 24.5), intensity: 0.5 }); au.speak('shan1 men2 zhao3 dao4 yi2 wei4', 'phone', { ...at(-1.2, 24.5), gain: 0.7 }); }],
        [3.0, () => line('搜救隊員', '裡面還有沒有人？', 'voice', 'li3 mian4 hai2 you3 mei2 you3 ren2', 'rescuer', at(0.3, 22.3))],
        [4.6, () => { F.wantsKey = true; F.keyPressed = false; answerPrompt('有。'); }],
      ],
      tick(dt) {
        if (!F.wantsKey) return;
        voiceT += dt; if (voiceT > 9) { voiceT = 0; line('搜救隊員', '先生？裡面還有沒有人？', 'voice', 'li3 mian4 hai2 you3 mei2 you3 ren2', 'rescuer', at(0.3, 22.3)); }
        if (F.keyPressed) { F.keyPressed = false; F.wantsKey = false; answerPrompt(null); go('c-answer'); }
      },
      skip() { answerPrompt(null); go('c-answer'); },
    },
    'c-answer': {
      enter() { F.owns = true; lockMove(true); F.wantsKey = false; line('我', '有。', 'me', 'you3', 'self'); },
      cues: [
        [1.6, () => line('我', '地下，神壇後面那扇門。三個人。', 'me', 'di4 xia4 san1 ge5 ren2', 'self')],
        [4.6, () => line('我', '……還有一個。她叫林小雨。', 'me', 'hai2 you3 yi2 ge4 ta1 jiao4 lin2 xiao3 yu3', 'self')],
        [7.2, () => line('搜救隊員', '擔架！地下還有人！', 'voice', 'dan1 jia4 di4 xia4 hai2 you3 ren2', 'rescuer', { ...at(1.45, 25.7), gain: 1.2 })],
        [8.2, () => veil(1, 1)],
        [9.6, () => { S.gate.stretcher.visible = true; S.gate.stretcher.position.set(1.35, 0.85, 12.5); S.gate.walk = 0.75; veil(0, 1.2); faceTo(1.35, 14.5, 1.2, -0.12); }],
        [10.6, () => line('搜救隊員（廟裡）', '找到了！三個，都還有呼吸！', 'voice', 'zhao3 dao4 le0 dou1 hai2 you3 hu1 xi1', 'rescuer', { pan: 0, dist: 14, behind: true, wet: 2 })],
        [14.6, () => { F.azheTurn = 0.001; S.gate.walk = 0.22; }], // 擔架在你身邊慢下來，他轉過頭
        [16.0, () => line('阿哲（擔架上）', '……小雨。', 'mother', 'xiao3 yu3', { f0: 104, fs: 0.98, voiced: 0.35, breath: 0.85, rate: 0.7 }, { ...at(S.gate.stretcher.position.x, S.gate.stretcher.position.z), dist: 1.2, gain: 0.8 })],
        [19.0, () => { S.gate.walk = 0.75; }],
        [20.5, () => veil(1, 2.4)],
        [23.4, () => api.complete('C')],
      ],
      tick(dt) {
        const st = S.gate.stretcher.position;
        if (S.gate.walk > 0 && F.t > 9.6) { const hx = st.x, hz = st.z + 0.7, yaw = Math.atan2(-(hx - p.pos.x), -(hz - p.pos.z)), d = Math.hypot(hx - p.pos.x, hz - p.pos.z); p.yaw += wrap(yaw - p.yaw) * Math.min(1, dt * 1.6); p.pitch += (Math.atan2(st.y + 0.2 - (p.pos.y + 1.66), Math.max(0.6, d)) - p.pitch) * Math.min(1, dt * 1.6); }
        if (st.z > 23.5) S.gate.walk = 0;
        if (F.azheTurn > 0) { F.azheTurn = Math.min(1, F.azheTurn + dt / 1.2); S.gate.azHead.rotation.y = 0.9 * sstep(F.azheTurn); }
      },
      skip() { api.complete('C'); },
    },

    // ════════════════ A：說好不說 ════════════════
    'a-tie': {
      enter() {
        roomNormal(); F.owns = true; F.wantsKey = true; F.keyPressed = false; lockMove(true); F.progress = 0; F.hold = false;
        place(57.62, -7, -25.4, Math.atan2(2.2, 2.95), -0.12); S.rope.mesh.visible = true; S.rope.set(0); S.door.set(0.085);
        hint('<kbd>E</kbd>　按住：把紅繩繫緊'); H.meter.style.opacity = 1; F.dreadT = 0.5; F.tensionT = 0.5; bangT = 1.0; voiceT = 0.6; F.lastLine = '';
      },
      tick(dt) {
        if (F.hold) F.progress = Math.min(1, F.progress + dt / 7.5);
        const k = F.progress; S.rope.set(sstep(k)); H.meter.firstElementChild.style.width = (k * 100).toFixed(1) + '%';
        F.tensionT = 0.5 + 0.45 * k; F.dreadT = 0.5 + 0.35 * k; F.edgeKind = ''; F.edgeT = 0.1 + 0.4 * k;
        const lines = [
          [0.0, '門裡，阿哲', '以安？……是你嗎？', 'yi3 an1 shi4 ni3 ma5', 'ahzhe'],
          [0.14, '門裡，志豪', '以安，開門！門打不開！', 'yi3 an1 kai1 men2 men2 da3 bu4 kai1', 'zhihao'],
          [0.3, '門裡，柏翰', '拜託……我還在。我還在啦！', 'bai4 tuo1 wo3 hai2 zai4', 'bohan'],
          [0.46, '門裡，阿哲', '你又要說都出來了嗎？', 'ni3 you4 yao4 shuo1 dou1 chu1 lai2 le0 ma5', 'ahzhe'],
          [0.62, '門裡，三個人', '以安，開門——我還在——', 'yi3 an1 kai1 men2 wo3 hai2 zai4', 'zhihao'],
          [0.8, '門裡，很小的聲音', '以安，你說你等一下就回來。', 'yi3 an1 ni3 shuo1 ni3 deng3 yi2 xia4 jiu4 hui2 lai2', 'child'],
          [0.92, '門裡，很小的聲音', '……我還在。', 'wo3 hai2 zai4', 'childFar'],
        ];
        for (const [th, who, text, py, v] of lines) if (k >= th) once('a' + th, () => { line(who, text, v.startsWith('child') ? 'child' : 'voice', py, v, { ...door(), dist: 2.4 }); voiceT = 4; F.lastLine = [who, text, py, v]; if (th === 0.62) { au.speak('wo3 hai2 zai4', 'bohan', { ...door(), dist: 2.6 }); au.speak('kai1 men2', 'ahzhe', { ...door(), dist: 2.6 }); } });
        voiceT -= dt; if (voiceT <= 0 && F.lastLine && k < 0.78) { voiceT = 4.5; const [who, text, py, v] = F.lastLine; line(who, text, 'voice', py, v, { ...door(), dist: 2.4 }); }
        bangT -= dt;
        if (bangT <= 0 && k < 0.78) { bangT = Math.max(0.25, 1.6 - 1.4 * k) * (0.6 + Math.random() * 0.8); au.bang(0.7 + 0.5 * k, door().pan, 3); F.jolt = 1; if (k > 0.5) glitch(0.15); }
        F.jolt = Math.max(0, (F.jolt || 0) - dt * 8);
        S.door.set(0.085 * (1 - sstep(k)), F.jolt * (Math.random() - 0.5) * 2);
        if (k >= 1) go('a-silence');
      },
      skip() { F.progress = 1; S.rope.set(1); go('a-silence'); },
    },
    'a-silence': {
      enter() { F.wantsKey = false; H.meter.style.opacity = 0; hint(''); S.door.set(0); game.audio.horror?.('slam', { dist: 2 }); game.audio.duck?.(8); F.tensionT = 0.2; F.dreadT = 0.35; F.edgeT = 0; },
      cues: [
        [2.4, () => say('我', '……到這裡就好。', 'me')],
        [4.8, () => veil(1, 1.4)],
        [6.4, () => { for (let i = 0; i < 6; i++) setTimeout(() => game.audio.footstep?.(0.55, 'stone'), i * 380); }],
        [8.8, () => { story.state.flags.sealed = true; story.sync(); place(0, 0.9, -23.6, Math.PI, 0); veil(0, 1.4); }],
        [9.6, () => go('a-walk')],
      ],
      skip() { story.state.flags.sealed = true; story.sync(); place(0, 0.9, -23.6, Math.PI, 0); veil(0, 0.1); go('a-walk'); },
    },
    'a-walk': {
      enter() { F.owns = true; lockMove(false); F.slow = 0; hint('往山門走。不要停下來。'); F.dreadT = 0.45; F.tensionT = 0.45; stillT = 0; F.killed = new Set(); voiceT = 0; },
      tick(dt) {
        const L = grabLights();
        // 你身後的燈一盞一盞熄掉
        for (const e of L.hall) if (!F.killed.has(e) && e.light.position.z < p.pos.z - 2.5) { F.killed.add(e); F.kill = F.kill || []; F.kill.push([e, 1]); au.snuff(at(e.light.position.x, e.light.position.z).pan, Math.max(3, Math.hypot(e.light.position.x - p.pos.x, e.light.position.z - p.pos.z))); }
        for (const f of L.hallFlames) if (f.sp.visible && f.sp.position.z < p.pos.z - 2) f.sp.visible = false;
        if (F.kill) for (const k of F.kill) { k[1] = Math.max(0, k[1] - dt * 3); k[0].mul = k[1]; }
        F.hemiT = clamp(1 - (p.pos.z + 24) / 70, 0.45, 1);
        const sp = Math.hypot(p.vel.x, p.vel.z);
        stillT = sp < 0.3 ? stillT + dt : Math.max(0, stillT - dt * 2);
        F.edgeKind = ''; F.edgeT = clamp((stillT - 0.8) / 3, 0, 0.85);
        F.tensionT = 0.45 + 0.5 * clamp(stillT / 4, 0, 1);
        if (stillT > 1.5) once('a-still1', () => { game.audio.horror?.('breath', { pan: 0, dist: 0.4 }); au.speak('yi3 an1', 'it', { dist: 0.4, behind: true }); });
        if (stillT > 4) once('a-still2', () => line('身後，我自己的聲音', '你忘了一個。', 'it', 'ni3 wang4 le0 yi2 ge4', 'it', { dist: 0.35, behind: true }));
        if (stillT < 0.2) { lineOnce.delete('a-still1'); }
        mark(0, 1.8, 21.5);
        if (p.pos.z > 18.0 && Math.abs(p.pos.x) < 3.2) go('a-gate');
      },
      skip() { place(0, 0.02, 18.6, Math.PI, 0); go('a-gate'); },
    },
    'a-gate': {
      enter() { F.owns = true; lockMove(true); mark(); hint(''); S.gate.group.visible = true; S.gate.begin(); S.gate.beam = 1; S.gate.stretcher.visible = false; F.edgeT = 0; F.tensionT = 0.4; F.dreadT = 0.35; voiceT = 0; knockT = 3; faceTo(0, 24.5, 0.8, 0); },
      cues: [
        [0.6, () => line('搜救隊員', '先生！先生你還好嗎？', 'voice', 'xian1 sheng5 ni3 hai2 hao3 ma5', 'rescuer', at(0.3, 22.3))],
        [1.8, () => { game.audio.horror?.('static', { ...at(-1.2, 24.5), intensity: 0.5 }); au.speak('shan1 men2 zhao3 dao4 yi2 wei4', 'phone', { ...at(-1.2, 24.5), gain: 0.7 }); }],
        [2.9, () => line('搜救隊員', '裡面還有沒有人？', 'voice', 'li3 mian4 hai2 you3 mei2 you3 ren2', 'rescuer', at(0.3, 22.3))],
        [4.0, () => { F.wantsKey = true; F.keyPressed = false; answerPrompt('都出來了。'); }],
      ],
      tick(dt) {
        if (!F.wantsKey) return;
        voiceT += dt; if (voiceT > 8) { voiceT = 0; line('搜救隊員', '先生？裡面還有沒有人？', 'voice', 'li3 mian4 hai2 you3 mei2 you3 ren2', 'rescuer', at(0.3, 22.3)); }
        knockT -= dt; if (knockT <= 0) { knockT = 5 + Math.random() * 2; game.audio.horror?.('knock', { pan: 0, dist: 14, intensity: 0.5 }); }
        if (F.keyPressed) { F.keyPressed = false; F.wantsKey = false; answerPrompt(null); go('a-answer'); }
      },
      skip() { answerPrompt(null); go('a-answer'); },
    },
    'a-answer': {
      enter() { F.owns = true; lockMove(true); F.wantsKey = false; line('我', '都出來了。', 'me', 'dou1 chu1 lai2 le0', 'self'); },
      cues: [
        [2.0, () => line('搜救隊員', '好。我們先帶你下山。', 'voice', 'hao3 wo3 men5 xian1 dai4 ni3 xia4 shan1', 'rescuer', at(0.3, 22.3))],
        [3.2, () => { game.audio.horror?.('static', { ...at(-1.2, 24.5), intensity: 0.5 }); line('無線電', '……他說，都出來了。收隊。', 'tape', 'ta1 shuo1 dou1 chu1 lai2 le0 shou1 dui4', 'phone', { ...at(-1.2, 24.5), gain: 0.7 }); }],
        [5.6, () => { game.audio.horror?.('knock', { pan: 0, dist: 16, intensity: 0.4 }); }],
        [6.4, () => veil(1, 1.6)],
        [8.6, () => go('a-phone')],
      ],
      skip() { veil(1, 0.1); go('a-phone'); },
    },
    'a-phone': {
      enter() { F.owns = true; lockMove(true); veil(1, 0.6); S.gate.group.visible = false; F.dreadT = 0.3; F.tensionT = 0.2; game.audio.duck?.(6); },
      cues: [
        [0.4, () => card('幾個月後')],
        [3.0, () => card('', false)],
        [4.0, () => { phone(true, { top: '來電', name: '陳以安', bottom: '行動電話', clock: '23:47', ring: true }); F.wantsKey = true; F.keyPressed = false; hint('<kbd>E</kbd>　接聽'); knockT = 0; }],
      ],
      tick(dt) {
        if (!F.wantsKey) return;
        knockT -= dt; if (knockT <= 0) { knockT = 1.6; au.vibrate(); }
        if (F.keyPressed) { F.keyPressed = false; F.wantsKey = false; hint(''); go('a-voice'); }
      },
      skip() { go('a-voice'); },
    },
    'a-voice': {
      enter() { phone(true, { top: '通話中', name: '陳以安', bottom: '00:00', clock: '23:47' }); },
      cues: [
        [0.8, () => line('電話裡，我自己的聲音', '……裡面還有沒有人？', 'it', 'li3 mian4 hai2 you3 mei2 you3 ren2', 'phone', { dist: 0.2, hrtf: false })],
        [4.2, () => line('電話裡，我自己的聲音', '你確定，出來的是你嗎？', 'it', 'ni3 que4 ding4 chu1 lai2 de5 shi4 ni3 ma5', 'phone', { dist: 0.2, hrtf: false })],
        [7.8, () => { au.hangup(); phone(true, { top: '通話結束', name: '陳以安', bottom: '00:47', clock: '23:47' }); }],
        [9.4, () => { phone(false); api.complete('A'); }],
      ],
      skip() { phone(false); api.complete('A'); },
    },

    // ════════════════ B：替身 ════════════════
    'b-untie': {
      enter() { roomNormal(); F.owns = true; lockMove(true); place(55, -7, -22.1, 0, 0.12); F.dreadT = 0.5; F.tensionT = 0.45; F.untie = 0; },
      cues: [
        [0.2, () => line('我', '我不會再把妳關起來。', 'me', 'wo3 bu2 hui4 zai4 ba3 ni3 guan1 qi3 lai2', 'self')],
        [2.2, () => { F.untie = 0.001; game.audio.horror?.('whisper', { pan: 0, dist: 1 }); }],
        [3.0, () => line('門裡，女孩的聲音', '我知道。你答應了。', 'child', 'wo3 zhi1 dao4 ni3 da1 ying4 le0', 'childFar', { ...door(), dist: 3 })],
        [5.2, () => { for (const s of sw.statues || []) if (s.userData.head && s !== sw.sealedBuddha) s.userData.head.rotation.y = 0.65; F.buddhaLook = 0.001; game.audio.horror?.('sub', { intensity: 1 }); glitch(0.3); }],
        [6.2, () => line('女人的聲音', '應了就好。', 'it', 'ying4 le0 jiu4 hao3', 'meilan', { ...door(), dist: 2 })],
        [7.6, () => { au.cloth(); F.cloth = 0.001; game.audio.horror?.('gasp', { dist: 0.2 }); F.shake = 0.02; }],
        [8.6, () => line('我自己的聲音', '原來，有自己的聲音是這樣。', 'it', 'yuan2 lai2 you3 zi4 ji3 de5 sheng1 yin1 shi4 zhe4 yang4', 'self', { dist: 0.8, pan: 0.3 })],
        [10.6, () => go('b-double')],
      ],
      tick(dt) {
        if (F.untie > 0) { F.untie = Math.min(1, F.untie + dt / 1.2); for (const o of buddhaBlind()) { o.position.y = -0.18 * sstep(F.untie); o.visible = F.untie < 1; } }
        if (F.buddhaLook > 0) { F.buddhaLook = Math.min(1, F.buddhaLook + dt / 1.5); const h = sw.sealedBuddha.userData.head; if (h) h.rotation.x = 0.28 * sstep(F.buddhaLook); }
        if (F.cloth > 0) { F.cloth = Math.min(1, F.cloth + dt / 0.45); cloth(0.82 * sstep(F.cloth)); }
      },
      skip() { for (const o of buddhaBlind()) o.visible = false; cloth(0.82); F.cloth = 1; go('b-double'); },
    },
    'b-double': {
      enter() {
        F.owns = true; lockMove(true); cloth(0.82); F.eye = 1.05; faceTo(55, -16, 0.55, 0.05); F.look = null;
        const d = S.double; d.root.visible = true; d.root.position.set(55, -7, -21.25); d.root.rotation.y = 0; d.walk = 0; d.reach = 0; S.phone.visible = true; S.phone.position.set(54.72, -6.196, -15.82);
        glitch(0.5); F.dreadT = 0.7; F.tensionT = 0.75;
      },
      cues: [
        [0.6, () => { F.look = { yaw: Math.PI, range: 0.55, pmin: -0.25, pmax: 0.3 }; }],
        [0.9, () => { S.double.walk = 1.05; stepT = 0.2; }],
        [5.0, () => { S.double.walk = 0; F.reach = 0.001; }],
        [6.0, () => { const d = S.double; d.J.wrR.attach(S.phone); S.phone.position.set(0, -0.11, 0.035); S.phone.rotation.set(Math.PI / 2, 0, 0); S.double.screenMat.color.setRGB(0.75, 0.95, 1.25); S.double.phoneLight.intensity = 1.6; }],
        [6.6, () => say('', '（他拿起我的手機。螢幕上是佩珊的名字。）', 'me')],
        [8.4, () => { const d = S.double; d.reach = 0.45; d.walk = 1.05; d.root.rotation.y = 0; stepT = 0.2; }],
        [13.4, () => go('b-drag')],
      ],
      tick(dt) {
        const d = S.double;
        if (F.reach > 0 && F.t < 8.4) { F.reach = Math.min(1, F.reach + dt / 0.8); d.reach = sstep(F.reach); }
        if (d.walk > 0) { stepT -= dt; if (stepT <= 0) { stepT = 0.5; game.audio.horror?.('stepBehind', { ...at(d.root.position.x, d.root.position.z), intensity: 0.6 }); } }
        if (d.root.position.z > -16.7 && F.t < 5) d.walk = 0;
        if (d.root.position.z > -11.9) { d.root.visible = false; d.walk = 0; S.phone.visible = false; }
      },
      skip() { S.double.root.visible = false; S.double.walk = 0; S.phone.visible = false; go('b-drag'); },
    },
    'b-drag': {
      enter() { F.owns = true; lockMove(true); F.look = null; au.drag(2.8); glitch(0.6); F.shake = 0.01; F.path = [[55, -22.1], [56.6, -22.3], [56.9, -23.3], [56.9, -24.05]]; F.pathT = 0; game.audio.horror?.('breath', { pan: 0.2, dist: 0.3 }); },
      cues: [
        [3.0, () => { faceTo(52.9, -24.35, 0.5, 0.02); F.eye = 1.12; au.pop(0.3, 0.4); S.seats.visible = true; for (const f of S.friends) f.turn(0); }],
        [3.8, () => { F.look = { yaw: Math.atan2(4.0, 0.3), range: 0.8, pmin: -0.3, pmax: 0.25 }; go('b-roll'); }],
      ],
      tick(dt) {
        if (F.t < 2.8) {
          F.pathT = Math.min(1, F.t / 2.8); const P = F.path, seg = Math.min(P.length - 2, Math.floor(F.pathT * (P.length - 1))), u = F.pathT * (P.length - 1) - seg;
          const x = lerp(P[seg][0], P[seg + 1][0], u), z = lerp(P[seg][1], P[seg + 1][1], u);
          p.pos.x = x; p.pos.z = z; p.yaw = Math.PI + Math.sin(F.t * 9) * 0.05; p.pitch = -0.1 + Math.sin(F.t * 7) * 0.04;
        }
      },
      skip() { p.pos.set(56.9, -7, -24.05); faceTo(52.9, -24.35, 0.01, 0.02); F.eye = 1.12; S.seats.visible = true; F.look = { yaw: Math.atan2(4.0, 0.3), range: 0.8, pmin: -0.3, pmax: 0.25 }; go('b-roll'); },
    },
    'b-roll': {
      enter() { F.owns = true; lockMove(true); F.eye = 1.12; S.seats.visible = true; F.dreadT = 0.75; F.tensionT = 0.8; },
      cues: [
        [0.5, () => line('錄音裡的男人', '點名。', 'tape', 'dian3 ming2', 'guo', door())],
        [1.8, () => line('錄音裡的男人', '一。', 'tape', 'yi1', 'guo', door())],
        [2.9, () => say('第一張椅子', '……', 'voice', 1)],
        ...rollCall(3.8, false, true),
        [12.2, () => { neckSide = 0.001; game.audio.horror?.('stinger', { intensity: 0.6 }); glitch(0.4); }],
        [13.4, () => { line('我（自己的嘴）', '有。', 'it', 'you3', 'it', { dist: 0.1, hrtf: false }); F.tensionT = 0; glitch(0.9); }],
        [13.9, () => { F.closeT = 0.001; }],
        [15.6, () => go('b-call')],
      ],
      tick(dt) { if (F.closeT > 0) { F.closeT = Math.min(1, F.closeT + dt / 0.9); cloth(0.82 + 0.18 * sstep(F.closeT)); } },
      skip() { cloth(1); go('b-call'); },
    },
    'b-call': {
      enter() { F.owns = true; lockMove(true); cloth(1); veil(1, 0.8); F.dreadT = 0.4; F.tensionT = 0; game.audio.duck?.(6); S.seats.visible = false; },
      cues: [
        [1.2, () => { phone(true, { top: '撥號中', name: '周佩珊', bottom: '行動電話', clock: '05:12' }); au.ringback(); }],
        [3.6, () => au.ringback()],
        [6.2, () => phone(true, { top: '通話中', name: '周佩珊', bottom: '00:00', clock: '05:12' })],
        [6.8, () => line('電話這頭，我的聲音', '佩珊，是我。', 'it', 'pei4 shan1 shi4 wo3', 'phone', { dist: 0.2, hrtf: false })],
        [9.2, () => line('電話這頭，我的聲音', '我出來了。', 'it', 'wo3 chu1 lai2 le0', 'phone', { dist: 0.2, hrtf: false })],
        [12.0, () => line('電話這頭，我的聲音', '換妳了。', 'it', 'huan4 ni3 le0', 'phone', { dist: 0.2, hrtf: false, speed: 1.3 })],
        [14.6, () => { au.hangup(); phone(false); }],
        [16.0, () => api.complete('B')],
      ],
      skip() { phone(false); api.complete('B'); },
    },
  };

  let neckTurn = 0, neckBack = 0, neckSide = 0, stepT = 0;
  /** 點名：start 秒開始，一到六；C 版本只念到六、最後一聲留給玩家；B 版本從二開始（一已經在外面念過） */
  function rollCall(start, withOne, fromTwo = false) {
    const out = [], gap = fromTwo ? 1.6 : 2.1;
    let t = start;
    const ans = [
      [0, '第一張椅子（空的）', '有。', 'selfChild'], [1, '阿哲', '有。', 'ahzhe'], [2, '志豪', '有。', 'zhihao'], [3, '柏翰', '有。', 'bohan'], [4, '第五張椅子（空的）', '有。', 'peishanChild'],
    ];
    const nums = [['一', 'yi1'], ['二', 'er4'], ['三', 'san1'], ['四', 'si4'], ['五', 'wu3']];
    for (let i = fromTwo ? 1 : 0; i < 5; i++) {
      const tt = t, [n, py] = nums[i], [seat, who, text, v] = ans[i];
      out.push([tt, () => line('錄音裡的男人', n + '。', 'tape', py, 'guo', door())]);
      out.push([tt + 0.9, () => { line(who, text, i === 0 || i === 4 ? 'child' : 'voice', 'you3', v, seatAt(seat)); const f = S.friends[seat - 1]; if (f) f.nod(1); setTimeout(() => f?.nod(0), 500); }]);
      t += gap;
    }
    out.push([t + 0.2, () => line('錄音裡的男人', '六。', 'tape', 'liu4', 'guo', { ...door(), gain: 1.3 })]);
    return out;
  }
  /** 朋友的頭要轉多少（相對自己身體），才會正對著你 */
  const aim = (f) => wrap(Math.atan2(p.pos.x - f.root.position.x, p.pos.z - f.root.position.z) - f.root.rotation.y);
  const seatAt = (i) => at(SEATS[i].x, SEATS[i].z, { dist: Math.max(0.8, Math.hypot(SEATS[i].x - p.pos.x, SEATS[i].z - p.pos.z)), wet: 1.3 });
  const childLookMother = new THREE.Vector3(), childHeadV = new THREE.Vector3();
  function childHead() { const c = S.child.root.position; return childHeadV.set(c.x, -7 + 0.95, c.z); }
  function showChild() { const c = S.child; c.rise = 0; c.walk = 0; c.look = 0; c.lookAt = null; c.setFade(1); c.root.visible = true; c.root.position.set(55.05, -7, -28.28); c.root.rotation.y = 0; c.update(0, F.time); }
  let buddhaBlindList = null;
  /** 封印佛像自己的蒙眼布（頭上的布圈與兩條布尾） */
  function buddhaBlind() {
    if (buddhaBlindList) return buddhaBlindList;
    buddhaBlindList = []; const head = sw.sealedBuddha?.userData.head;
    head?.traverse((o) => { if (o.isMesh && o.material === S.blindMat) buddhaBlindList.push(o); });
    if (sw.sealedBuddha?.userData.tails) buddhaBlindList.push(sw.sealedBuddha.userData.tails);
    return buddhaBlindList;
  }
  function placeGhostBehind(snap) {
    const [px, pz] = plate(); let dx = px - p.pos.x, dz = pz - p.pos.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
    F.away = F.away || new THREE.Vector2(); F.away.set(dx, dz);
    ghostShow('reach', p.pos.x - dx * 0.62, p.pos.z - dz * 0.62, p.pos.x, p.pos.z, 0); ghost.root.rotation.y = Math.atan2(dx, dz); ghost.lookAt?.(eyePos());
    if (snap) ghost.setEyes?.(0.4);
  }
  function dawnSetup(k) {
    S.blindfolds.set(false); S.dawn.visible = true; F.dawnT = k; F.dawn = Math.max(F.dawn, k * 0.7);
    const L = grabLights(); if (map.scene.fog) map.scene.fog.color.setHex(0x161c24); if (map.hemi) { map.hemi.color.setHex(0x7d8ca3); map.hemi.groundColor.setHex(0x2a2520); }
    F.hemiT = 1.25; L.dawn = true; F.dreadT = 0.12; F.tensionT = 0;
  }
  function answerPrompt(text) {
    if (!hud) return;
    if (!text) { H.answer.style.opacity = 0; hint(''); return; }
    H.answer.classList.remove('taken'); H.answer.querySelector('b').textContent = text; H.answer.querySelector('b').style.fontSize = text.length > 2 ? '54px' : '';
    H.answer.querySelector('span').innerHTML = '<kbd>E</kbd>回答';
    H.answer.style.transition = 'opacity .8s, transform .8s'; H.answer.style.opacity = 1; H.answer.style.transform = 'translate(-50%,-50%) scale(1)';
    hint('沒有別的話可以說。');
  }
  const glareV = new THREE.Vector3(), camFwd = new THREE.Vector3();
  /** 手電筒正對著眼睛的時候，畫面上那一團刺眼的光 */
  function torchGlare() {
    if (!hud) return;
    S.gate.torchTip.getWorldPosition(glareV); game.camera.getWorldDirection(camFwd);
    const dx = glareV.x - game.camera.position.x, dy = glareV.y - game.camera.position.y, dz = glareV.z - game.camera.position.z, d = Math.hypot(dx, dy, dz) || 1;
    const facing = (dx * camFwd.x + dy * camFwd.y + dz * camFwd.z) / d;
    glareV.project(game.camera);
    const k = clamp((facing - 0.8) / 0.2, 0, 1) * S.gate.beam;
    H.glare.style.opacity = (0.32 * k).toFixed(3); H.glare.style.left = `${(glareV.x * 0.5 + 0.5) * 100}%`; H.glare.style.top = `${(-glareV.y * 0.5 + 0.5) * 100}%`;
  }
  const markV = new THREE.Vector3();
  function mark(x, y, z) {
    if (!hud) return;
    if (x === undefined) { H.mark.style.opacity = 0; return; }
    markV.set(x, y, z).project(game.camera);
    const front = markV.z < 1 && Math.abs(markV.x) < 0.95 && Math.abs(markV.y) < 0.9;
    H.mark.style.opacity = front ? 0.8 : 0; H.mark.style.left = `${(markV.x * 0.5 + 0.5) * 100}%`; H.mark.style.top = `${(-markV.y * 0.5 + 0.5) * 100}%`;
  }

  const shownPictures=new Set();
  function go(name) {
    if (!PH[name]) return;
    F.phase = name; F.t = 0; F.cue = 0; F.keyPressed = false; hint('');
    PH[name].enter?.();
    const picture=FINALE_PICTURES[name];
    if(picture&&!shownPictures.has(picture)){
      shownPictures.add(picture);F.hold=false;F.keyPressed=false;
      story.picture(picture,()=>{F.hold=false;F.keyPressed=false;});
    }
  }

  // ───────────────────────── 每幀 ─────────────────────────
  function update(dt) {
    if (!F.active) return false;
    if (game.story !== story) { api.end(); return false; }
    if (story.modal) return true;
    F.time += dt; F.t += dt;
    const P = PH[F.phase];
    if (P?.cues) while (F.cue < P.cues.length && F.t >= P.cues[F.cue][0]) { const ph = F.phase; P.cues[F.cue++][1](); if (F.phase !== ph) break; }
    if (story.modal) return true;
    if (PH[F.phase] === P) P?.tick?.(dt);
    if (!F.active) return true;
    // 呼名時的扯頭
    if (F.nudgeT > 0) { F.nudgeT -= dt; p.yaw += F.nudge * dt; }
    // 緩慢的腳步（它的手壓在你肩上）
    if (F.slow > 0 && !F.lockMove) {
      const dx = p.pos.x - F.prev.x, dz = p.pos.z - F.prev.z, d = Math.hypot(dx, dz), max = F.slow * dt;
      if (d > max && d < 2) { p.pos.x = F.prev.x + dx / d * max; p.pos.z = F.prev.z + dz / d * max; }
    }
    if (F.lockMove && F.phase !== 'b-drag') { for (const k of MOVE) p.keys[k] = false; }
    // 鏡頭動作
    if (F.cam) {
      const c = F.cam; c.t = Math.min(1, c.t + dt / c.dur); const e = sstep(c.t);
      p.yaw = lerp(c.y0, c.y1, e); p.pitch = lerp(c.p0, c.p1, e);
      if (c.pos) { p.pos.x = lerp(c.pos[0], c.pos[2], e); p.pos.z = lerp(c.pos[1], c.pos[3], e); }
      if (c.t >= 1) F.cam = null;
    }
    if (F.look) { const L = F.look; const d = wrap(p.yaw - L.yaw); if (Math.abs(d) > L.range) p.yaw = L.yaw + Math.sign(d) * L.range; p.pitch = clamp(p.pitch, L.pmin, L.pmax); }
    if (F.eye !== null) p.eye = F.eye;
    if (F.shake > 0) { F.shake *= Math.exp(-dt * 3); if (F.shake < 1e-4) F.shake = 0; }
    p._syncCamera(0);
    if (F.shake > 0) { const cam = game.camera; cam.rotation.z += Math.sin(F.time * 71) * F.shake; cam.rotation.x += Math.sin(F.time * 53 + 1.3) * F.shake * 0.6; cam.updateMatrixWorld(); }
    F.prev.copy(p.pos);
    // 鬼淡出
    if (fadeGhost.on) { fadeGhost.t += dt; const a = 1 - clamp(fadeGhost.t / fadeGhost.dur, 0, 1); ghost.setFade?.(a); if (a <= 0) { ghost.root.visible = false; fadeGhost.on = false; ghost.setFade?.(1); } }
    // 朋友的頭
    if (neckTurn > 0 && neckTurn < 1) { neckTurn = Math.min(1, neckTurn + dt / 0.75); for (const f of S.friends) f.turn(neckTurn, 0, aim(f)); }
    if (neckBack > 0) { neckBack = Math.min(1, neckBack + dt / 2.2); for (const f of S.friends) f.turn(1 - neckBack, 0, aim(f)); if (neckBack >= 1) { neckBack = 0; neckTurn = 0; } }
    if (neckSide > 0 && neckSide < 1) { neckSide = Math.min(1, neckSide + dt / 0.7); for (const f of S.friends) { const want = Math.atan2(p.pos.x - f.root.position.x, p.pos.z - f.root.position.z) - f.root.rotation.y; f.head.rotation.y = wrap(want) * sstep(neckSide); f.head.rotation.x = 0.32 * (1 - sstep(neckSide)) - 0.1 * sstep(neckSide); } }
    if (F.reels) for (const r of S.reels) r.rotation.y += dt * 4;
    // 平滑的氣氛值
    const k = Math.min(1, dt * 2.2);
    F.dread += (F.dreadT - F.dread) * k; F.tension += (F.tensionT - F.tension) * Math.min(1, dt * 1.6);
    F.edge += (F.edgeT - F.edge) * Math.min(1, dt * 4); F.flash += (F.flashT - F.flash) * Math.min(1, dt * 3);
    F.hemi += (F.hemiT - F.hemi) * Math.min(1, dt * 2); F.fogAdd += (F.fogT - F.fogAdd) * Math.min(1, dt * 1.5); F.dawn += (F.dawnT - F.dawn) * Math.min(1, dt * 0.6);
    F.glitch *= Math.exp(-dt * 7); F.pulseB += dt * (58 + 90 * F.tension) / 60;
    if (map.hemi) map.hemi.intensity *= F.hemi;
    if (map.scene.fog && !map.fullBright) map.scene.fog.density += F.fogAdd;
    S.dawnMat.uniforms.uDawn.value = F.dawn;
    if (hud) {
      H.edge.className = 'fin-edge' + (F.edgeKind ? ' ' + F.edgeKind : ''); H.edge.style.opacity = F.edge.toFixed(3);
      if (subT > 0) { subT -= dt; if (subT <= 0) H.sub.style.opacity = 0; }
    }
    applyLights(dt, F.time);
    S.update(dt, F.time);
    au.update(dt);
    ritualHud();
    if (S.gate.group.visible) { S.gate.target = eyePos(); torchGlare(); } else if (hud && H.glare.style.opacity !== '0') H.glare.style.opacity = '0';
    if (F.owns) { const ip = $('interact-prompt'); if (ip && ip.innerHTML) ip.innerHTML = ''; }
    return F.owns;
  }
  function ritualHud() {
    const el = $('ritual-hud'); if (!el) return;
    const show = F.kind === 'C' && ['c-ready', 'c-walk', 'c-witness-ready'].includes(F.phase);
    el.classList.toggle('hidden', !show);
    if (show) {
      const done = ['', '喚名已完成 → ', '喚名、歸物已完成 → '][F.step === 1 ? 1 : F.step >= 2 ? 2 : 0];
      const next = ['一・喚名 → 二・歸物 → 三・見證', '二・歸物 → 三・見證', '三・見證'][Math.min(2, F.step)];
      const html = `<span>送行</span><strong>${['名', '物', '證'][Math.min(2, F.step)]}</strong><div class="incense-meter"><i style="width:${(F.step / 3) * 100}%"></i></div><small>${done}${next}</small>`;
      if (el.dataset.fin !== html) { el.innerHTML = html; el.dataset.fin = html; }
    }
  }

  // ───────────────────────── 對外 ─────────────────────────
  Object.assign(api, {
    /** kind = 'C' | 'A' | 'B' */
    start(kind) {
      if (F.active) api.end();
      if (F.lights) restoreLights();
      F.kind = kind; F.active = true; F.time = 0; F.fails = { back: 0, key: 0 }; F.answered = false; F.lights = null; F.cam = null; F.eye = null; F.look = null; F.slow = 0;
      F.dread = F.dreadT = 0.4; F.tension = F.tensionT = 0.35; F.edge = F.edgeT = 0; F.flash = F.flashT = 1; F.hemi = F.hemiT = 1; F.fogAdd = F.fogT = 0; F.dawn = F.dawnT = 0; F.glitch = 0;
      lineOnce.clear(); shownPictures.clear(); neckTurn = neckBack = neckSide = 0;
      story.scene = 'finale'; story.ritual = api; story.chase = null;
      game.horror?.debug?.stop?.();
      mountHud(); listen(true); wrapHorror(true); grabLights(); F.prev.copy(p.pos); $('story-toast')?.classList.remove('show');
      go(kind === 'C' ? 'c-ready' : kind === 'A' ? 'a-tie' : 'b-untie');
    },
    update,
    /** 送行三個位置的 E（Story.ritualAction 轉過來） */
    action(id) {
      if (!F.active || F.kind !== 'C') return false;
      const order = ['riteName', 'riteRelic', 'riteWitness'];
      if (F.phase === 'c-ready') {
        if (id === 'riteName') { go('c-name'); return true; }
        story.toast('順序不對。先喚名，再歸物，最後見證。'); F.step = 0; return true;
      }
      if (F.phase === 'c-walk') {
        if (id === 'riteRelic') { if (walkCalls < 2) { story.toast('……它還在叫你。再等一下。'); return true; } go('c-relic'); return true; }
        if (id === 'riteName') { story.toast('名字已經說過了。不要回頭，走到中央供盤。'); return true; }
        story.toast('順序不對。先喚名，再歸物，最後見證。'); go('c-ready'); return true;
      }
      if (F.phase === 'c-witness-ready') {
        if (id === 'riteWitness') { go('c-tape'); return true; }
        if (id === 'riteRelic' || id === 'riteName') { story.toast('名字和她的東西都還給她了。剩下錄音機。'); return true; }
      }
      return order.includes(id);
    },
    /** 演出結束：交給 Story.finish 顯示結局 */
    complete(ending) { story.finish(ending); },
    /** 收掉輸入攔截、HUD 與後製；畫面上的東西留著（結局卡片蓋在上面），restore() 才把地下還原 */
    end() {
      if (!F.active && !hud) return;
      F.active = false; listen(false); wrapHorror(false); au.stopAll(); lockMove(false);
      F.cam = null; F.look = null; F.eye = null; F.slow = 0; p.eye = 1.66;
      if (story.scene === 'finale') story.scene = null;
      if (story.ritual === api) story.ritual = null;
      hud?.remove(); hud = null; $('story-hud')?.classList.remove('finale-on'); $('ritual-hud')?.classList.add('hidden');
      const u = game.film?.uniforms; if (u) { if (u.glitch) u.glitch.value = 0; if (u.pulse) u.pulse.value = 0; }
      game.audio.setTension?.(0);
    },
    /** 回到最後抉擇：把演出動過的東西全部還原 */
    restore() {
      api.end();
      S.reset(); restoreLights(); sw.sealedBuddha.visible = true;
      for (const o of buddhaBlind()) { o.visible = true; o.position.y = 0; }
      const h = sw.sealedBuddha.userData.head; if (h) h.rotation.x = 0;
      ghost.root.visible = false; ghost.setFade?.(1); ghost.setGlitch?.(0); ghost.lookAt?.(null); ghost.setPose?.('idle', true);
      au.birds(false);
    },
    dispose() { api.end(); },
    debug: {
      get state() { return { active: F.active, kind: F.kind, phase: F.phase, t: +F.t.toFixed(3), step: F.step, progress: +F.progress.toFixed(3), hold: F.hold, fails: { ...F.fails }, answered: F.answered, owns: F.owns, wantsKey: F.wantsKey, lockMove: F.lockMove, calls: walkCalls, dread: +F.dread.toFixed(3) }; },
      get phase() { return F.phase; },
      /** 跳過目前這一段（互動段落視同玩家完成了該做的事） */
      skip() { const P = PH[F.phase]; if (P?.skip) P.skip(); else if (P?.cues) { while (F.cue < P.cues.length) { const ph = F.phase; P.cues[F.cue++][1](); if (F.phase !== ph) break; } } return F.phase; },
      /** 直接進入某一段（截圖與測試用；會補上該段需要的場景狀態） */
      to(name) {
        if (!F.active) api.start(name[0] === 'c' ? 'C' : name[0] === 'a' ? 'A' : 'B');
        const pre = { 'c-walk': () => { place(51, -7, -21.0, Math.atan2(-4, 2), 0); }, 'c-six': () => { S.seats.visible = true; neckTurn = 1; place(52.7, -7, -20.6, Math.atan2(-(54.0 - 52.7), -(-24.05 + 20.6)), -0.1); for (const f of S.friends) f.turn(1, 0, aim(f)); }, 'c-fire': () => { room1998(true); place(55, -7, -27.12, 0, 0.04); }, 'c-girl': () => { room1998(false); embers(0.22); S.door.set(0.92); showChild(); place(56.3, -7, -26.2, Math.atan2(-(55.05 - 56.3), -(-28.1 + 26.2)), -0.34); S.altar.visible = false; S.altarBox.disabled = true; sw.sealedBuddha.visible = false; }, 'c-lunge': () => { pre['c-girl'](); }, 'c-mother': () => { pre['c-girl'](); ghostShow('kneel', 55.3, -27.0, 55.05, -28.3, 0); }, 'c-quiet': () => { pre['c-girl'](); }, 'c-up': () => { story.state.flags.sent = true; story.sync(); }, 'c-gate': () => { story.state.flags.sent = true; story.sync(); dawnSetup(0.85); S.gate.group.visible = true; S.gate.stretcher.visible = false; place(0, 0.02, 18.6, Math.PI, -0.04); }, 'a-walk': () => { story.state.flags.sealed = true; story.sync(); place(0, 0.9, -23.6, Math.PI, 0); }, 'a-gate': () => { story.state.flags.sealed = true; story.sync(); place(0, 0.02, 18.6, Math.PI, 0); },
          'b-double': () => { cloth(0.82); F.cloth = 1; for (const o of buddhaBlind()) o.visible = false; }, 'b-roll': () => { cloth(0.82); F.cloth = 1; place(56.9, -7, -24.05, Math.atan2(4.0, 0.3), 0); F.eye = 1.12; F.look = { yaw: Math.atan2(4.0, 0.3), range: 0.8, pmin: -0.3, pmax: 0.25 }; }, 'b-call': () => { cloth(1); } };
        if (name === 'c-relic' || name === 'c-six') { S.plateRabbit.visible = true; place(55, -7, -21.85, 0, -0.12); }
        Object.assign(pre, { 'c-terrace': () => { story.state.flags.sent = true; story.sync(); dawnSetup(0.6); place(0, 16.9, -16.9, Math.PI, -0.05); }, 'c-answer': () => pre['c-gate'](), 'c-unlock': () => pre['c-fire'](), 'c-exit': () => { pre['c-girl'](); S.child.setFade(0); story.state.flags.sent = true; story.sync(); } });
        pre[name]?.(); go(name); return F.phase;
      },
      /** 不渲染地快轉（與 horror.debug.run 相同的做法） */
      run(seconds, step = 1 / 30) { const n = Math.ceil(seconds / step); for (let i = 0; i < n && game.map && F.active; i++) { game.time += step; p.update(step, game.map.world); game.map.update(step, game.time, p); story.update(step); game.horror?.update(step); } return F.phase; },
      press() { F.keyPressed = true; },
      hold(v) { F.hold = !!v; if (v) F.keyPressed = true; },
      flags: F,
    },
  });
  return api;
}
