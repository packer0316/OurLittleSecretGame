import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createGhost } from '../maps/temple/ghost.js';
import { wrap, clamp } from './sense.js';

/**
 * 幽影：恐怖導演使用的人形。優先使用鬼模型合約 E（createGhost(assets,{variant})），
 * 合約尚未就緒時回退到這裡的程序化純黑人形，兩者對外的介面相同。
 * 所有幽影在 attach 時一次建好並放進池裡；事件只是借用、擺位、歸還。
 */

const hash = (n) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };

/** 程序化純黑人形（長髮垂肩、長袍、過長的手臂）。腳底 y=0、面向 +Z。 */
export function makeShadowFigure({ child = false } = {}) {
  const root = new THREE.Group(); root.name = child ? 'HorrorShadowChild' : 'HorrorShadow'; root.visible = false;
  const mat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 1, fog: false });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xaab4b0, transparent: true, opacity: 0, fog: false, depthWrite: false });
  const pivot = new THREE.Group(); root.add(pivot);
  const mk = (geo, parent, m = mat) => { const o = new THREE.Mesh(geo, m); o.frustumCulled = false; parent.add(o); return o; };
  // 長袍：下襬離地，露出腳踝的位置
  const robe = new THREE.LatheGeometry([[0.03, 0.1], [0.2, 0.1], [0.19, 0.18], [0.15, 0.55], [0.125, 0.95], [0.15, 1.14], [0.185, 1.33], [0.15, 1.42], [0.06, 1.47], [0, 1.48]].map(([r, y]) => new THREE.Vector2(r, y)), 12);
  robe.scale(1, 1, 0.62);
  const legs = [-1, 1].map((sx) => new THREE.CylinderGeometry(0.03, 0.034, 0.16, 6).translate(sx * 0.065, 0.08, 0));
  mk(mergeGeometries([robe.toNonIndexed(), ...legs.map((g) => g.toNonIndexed())]), pivot);
  // 頭與垂到胸口的頭髮（從正面看不到臉）
  const head = new THREE.Group(); head.position.set(0, 1.5, 0.015); pivot.add(head);
  const skull = new THREE.SphereGeometry(0.1, 12, 9).scale(0.92, 1.14, 1).translate(0, 0.1, 0);
  const hair = new THREE.CylinderGeometry(0.108, 0.15, 0.6, 10, 1, true).translate(0, -0.12, 0.005);
  mk(mergeGeometries([skull.toNonIndexed(), hair.toNonIndexed()]), head);
  mk(mergeGeometries([-1, 1].map((sx) => new THREE.SphereGeometry(0.011, 6, 5).translate(sx * 0.034, 0.105, 0.094))), head, eyeMat);
  // 過長的手臂與手指
  const arms = [-1, 1].map((sx) => {
    const arm = new THREE.Group(); arm.position.set(sx * 0.2, 1.36, 0); pivot.add(arm);
    const parts = [new THREE.CapsuleGeometry(0.03, 0.66, 3, 6).translate(sx * 0.02, -0.38, 0)];
    for (let f = 0; f < 4; f++) parts.push(new THREE.ConeGeometry(0.009, 0.17, 4).rotateX(Math.PI).translate(sx * 0.02 + (f - 1.5) * 0.017, -0.83, 0.008));
    mk(mergeGeometries(parts.map((g) => g.toNonIndexed())), arm);
    return arm;
  });
  if (child) { pivot.scale.setScalar(0.64); head.scale.setScalar(1.28); }

  const POSES = {
    idle: { lean: 0.04, roll: 0, drop: 0, headX: 0.3, headZ: 0, armX: [0, 0], armZ: [0.05, 0.05] },
    bowed: { lean: 0.3, roll: 0, drop: 0, headX: 0.8, headZ: 0.1, armX: [-0.25, -0.25], armZ: [0.02, 0.02] },
    reach: { lean: 0.12, roll: 0, drop: 0, headX: -0.1, headZ: 0.2, armX: [-1.4, -1.25], armZ: [0.1, 0.1] },
    crawl: { lean: 1.2, roll: 0, drop: -0.9, headX: -0.95, headZ: 0.25, armX: [-2.5, -2.2], armZ: [0.3, 0.3] },
    // 與合約 E 相同：peek 往自己的左側（root 的 +X）探頭並抬起那一側的手，peekR 是鏡像
    peek: { lean: 0.05, roll: -0.2, drop: 0, headX: 0.1, headZ: -0.5, armX: [0, -0.3], armZ: [0.04, 2.3] },
    peekR: { lean: 0.05, roll: 0.2, drop: 0, headX: 0.1, headZ: 0.5, armX: [-0.3, 0], armZ: [2.3, 0.04] },
    sit: { lean: 0.15, roll: 0, drop: -0.42, headX: 0.5, headZ: 0, armX: [-0.5, -0.5], armZ: [0.02, 0.02] },
  };
  let pose = POSES.idle, glitch = 0, look = null, lookYaw = 0, lookPitch = 0, last = null, eyes = 0;
  const cur = { lean: 0.04, roll: 0, drop: 0, headX: 0.3, headZ: 0, ax0: 0, ax1: 0, az0: 0.05, az1: 0.05 };
  const api = {
    root, procedural: true,
    setPose(name) { pose = POSES[name] || POSES.idle; },
    snapPose() { cur.lean = pose.lean; cur.roll = pose.roll; cur.drop = pose.drop; cur.headX = pose.headX; cur.headZ = pose.headZ; cur.ax0 = pose.armX[0]; cur.ax1 = pose.armX[1]; cur.az0 = pose.armZ[0]; cur.az1 = pose.armZ[1]; },
    setFade(a) { mat.opacity = clamp(a, 0, 1); eyeMat.opacity = eyes * mat.opacity; },
    setEyes(k) { eyes = k; eyeMat.opacity = eyes * mat.opacity; },
    setGlitch(k) { glitch = clamp(k, 0, 1); },
    lookAt(v) { look = v || null; },
    update(t) {
      if (!root.visible) { last = t; return; }
      const dt = last === null ? 0 : clamp(t - last, 0, 0.1); last = t;
      const k = Math.min(1, dt * 9);
      cur.lean += (pose.lean - cur.lean) * k; cur.roll += (pose.roll - cur.roll) * k; cur.drop += (pose.drop - cur.drop) * k;
      cur.headX += (pose.headX - cur.headX) * k; cur.headZ += (pose.headZ - cur.headZ) * k;
      cur.ax0 += (pose.armX[0] - cur.ax0) * k; cur.ax1 += (pose.armX[1] - cur.ax1) * k;
      cur.az0 += (pose.armZ[0] - cur.az0) * k; cur.az1 += (pose.armZ[1] - cur.az1) * k;
      let ty = 0, tp = 0;
      if (look) {
        const dx = look.x - root.position.x, dz = look.z - root.position.z;
        ty = clamp(wrap(Math.atan2(dx, dz) - root.rotation.y), -1.25, 1.25);
        tp = clamp(-Math.atan2(look.y - (root.position.y + 1.6), Math.hypot(dx, dz)), -0.6, 0.6) * 0.5;
      }
      lookYaw += (ty - lookYaw) * Math.min(1, dt * 5); lookPitch += (tp - lookPitch) * Math.min(1, dt * 5);
      // 抽搐：以 13 Hz 取樣的掉格動作
      const q = Math.floor(t * 13), g = glitch;
      const j1 = g ? (hash(q) - 0.5) * g : 0, j2 = g ? (hash(q + 31) - 0.5) * g : 0, j3 = g ? (hash(q + 77) - 0.5) * g : 0;
      pivot.rotation.set(cur.lean + j3 * 0.25, 0, cur.roll + Math.sin(t * 0.6) * 0.012 + j1 * 0.2);
      pivot.position.set(j2 * 0.07, cur.drop, 0);
      head.rotation.set(cur.headX + lookPitch * (look ? 1 : 0) - (look ? cur.headX * 0.55 : 0) + j2 * 0.9, lookYaw + j1 * 1.3, cur.headZ + Math.sin(t * 0.43) * 0.03 + j3 * 1.1);
      arms[0].rotation.set(cur.ax0 + j1 * 1.5, 0, -cur.az0 + j2 * 0.4);
      arms[1].rotation.set(cur.ax1 + j3 * 1.5, 0, cur.az1 + j1 * 0.4);
    },
    dispose() { root.traverse((o) => { o.geometry?.dispose(); }); mat.dispose(); eyeMat.dispose(); },
  };
  return api;
}

/** 釋放一棵物件樹。geometry=false 時只釋放材質（幾何與貼圖是素材快取共用的）。 */
function disposeTree(root, geometry = true) {
  root.traverse((o) => {
    if (geometry) o.geometry?.dispose();
    const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of ms) { if (geometry && m.map?.isCanvasTexture) m.map.dispose(); m.dispose?.(); }
  });
}

/** 一個可被事件借用的幽影：負責擺位、被看見的計時、以及各種消失方式。 */
class Apparition {
  constructor(h, fig, kind) {
    this.h = h; this.fig = fig; this.kind = kind; this.root = fig.root;
    this.chest = kind === 'child' ? 0.8 : 1.35;
    this.active = false; this.owner = null;
    this.reset();
  }
  reset() {
    this.age = 0; this.seen = 0; this.lit = 0; this.unseen = 0; this.everSeen = false; this.visibleNow = false;
    this.gaze = 9; this.dist = 99; this.alpha = 1; this.alphaTo = 1; this.fadeRate = 6;
    this.out = 0; this.outStyle = ''; this.outDur = 0; this.losT = 0; this.clear = false;
    this.mx = 0; this.mz = 0; this.mT = 0; this.mDur = 0; this.sx = 0; this.sz = 0;
  }
  show(x, y, z, yaw, pose = 'idle', alpha = 1) {
    const f = this.fig, r = this.root;
    this.reset(); this.active = true;
    r.position.set(x, y, z); r.rotation.set(0, yaw, 0); if (f.procedural) r.scale.setScalar(1);
    f.setPose?.(pose, true); f.snapPose?.(); f.setGlitch?.(0); f.lookAt?.(null); f.setEyes?.(0);
    this.alpha = this.alphaTo = alpha; this._fade(alpha);
    r.visible = alpha > 0.02 || !!f.setFade;
    return this;
  }
  _fade(a) { if (this.fig.setFade) this.fig.setFade(a); else this.root.visible = a > 0.35; }
  fadeTo(a, rate = 6) { this.alphaTo = a; this.fadeRate = rate; }
  face(px, pz) { this.root.rotation.y = Math.atan2(px - this.root.position.x, pz - this.root.position.z); }
  facePlayer() { this.face(this.h.sense.px, this.h.sense.pz); }
  /** 在 dur 秒內滑到 (x,z)（探頭、縮回、橫越門口用） */
  slideTo(x, z, dur) { this.sx = this.root.position.x; this.sz = this.root.position.z; this.mx = x; this.mz = z; this.mT = 0; this.mDur = Math.max(0.01, dur); }
  get sliding() { return this.mDur > 0; }
  /** style: cut（立刻不見）、glitch（抽搐兩三幀後不見）、fade（淡掉） */
  vanish(style = 'glitch', dur = 0.14) {
    if (!this.active || this.out > 0) return;
    if (style === 'cut') { this.hide(); return; }
    this.out = 1e-4; this.outStyle = style; this.outDur = dur;
    if (style === 'glitch') { this.fig.setGlitch?.(1); this.h.fx.glitch(0.75, dur + 0.12); }
  }
  hide() { this.root.visible = false; this.active = false; this.owner = null; this.out = 0; this.fig.setGlitch?.(0); this.fig.lookAt?.(null); }
  get leaving() { return this.out > 0; }

  tick(dt, hold) {
    const s = this.h.sense, r = this.root, p = r.position;
    this.fig.update(this.h.time, false);
    if (this.mDur > 0) {
      this.mT += dt; const u = Math.min(1, this.mT / this.mDur), e = u * u * (3 - 2 * u);
      p.x = this.sx + (this.mx - this.sx) * e; p.z = this.sz + (this.mz - this.sz) * e;
      if (u >= 1) this.mDur = 0;
    }
    if (this.alpha !== this.alphaTo) {
      const d = this.alphaTo - this.alpha, st = this.fadeRate * dt;
      this.alpha = Math.abs(d) <= st ? this.alphaTo : this.alpha + Math.sign(d) * st;
      this._fade(this.alpha);
    }
    const cy = p.y + this.chest;
    this.dist = s.dist(p.x, p.z); this.gaze = s.gaze(p.x, cy, p.z);
    this.losT -= dt;
    if (this.losT <= 0) { this.losT = 0.07; this.clear = s.los(s.eye.x, s.eye.y, s.eye.z, p.x, cy, p.z); }
    this.visibleNow = this.clear && this.alpha > 0.3 && r.visible && s.inView(p.x, cy, p.z, -0.05);
    if (!hold) {
      this.age += dt;
      if (this.visibleNow) { this.seen += dt * (this.gaze < 0.32 ? 1 : 0.6); this.everSeen = true; this.unseen = 0; } else this.unseen += dt;
      if (this.clear && s.flashAngle(p.x, cy, p.z) < 0.4 && this.dist < 26) this.lit += dt;
      if (this.out > 0) {
        this.out += dt;
        const u = this.out / this.outDur;
        if (this.outStyle === 'glitch') {
          const q = Math.floor(this.h.time * 30);
          if (this.fig.procedural) r.scale.set(1 + (hash(q) - 0.5) * 0.5, 1 + (hash(q + 9) - 0.5) * 0.3, 1); // 合約模型不可改 scale
          r.visible = hash(q + 3) > 0.25;
        } else this._fade(this.alpha * Math.max(0, 1 - u));
        if (u >= 1) this.hide();
      }
    }
  }
}

export function createFigures(h) {
  const { game, map } = h;
  const list = [], procedural = [], borrowed = [];
  const add = (fig, kind) => { map.scene.add(fig.root); fig.root.visible = false; const a = new Apparition(h, fig, kind); list.push(a); return a; };
  const hasModel = !!game.assets.models?.ghost_woman;
  const forceFallback = typeof location !== 'undefined' && new URLSearchParams(location.search).has('hfallback');
  let newApi = forceFallback ? false : null, woman = null; // newApi: null = 還不知道鬼模型合約是新版還是舊版
  // 借來的母親外貌：只有預載了模型的地圖才建立。住處雖然也有，但只給 home_sitter 用一次（事件各自判斷）
  if (hasModel) {
    try { const g = createGhost(game.assets, { variant: 'woman' }); if (newApi === null) newApi = typeof g.setPose === 'function'; borrowed.push(g); woman = add(g, 'woman'); } catch (e) { newApi = false; console.warn('[horror] woman ghost unavailable', e); }
  }
  const make = (variant) => {
    if (newApi !== false) {
      try {
        const g = createGhost(game.assets, { variant });
        if (typeof g.setPose === 'function') { newApi = true; borrowed.push(g); return g; }
        newApi = false; disposeTree(g.root); // 舊版合約：回傳的不是我們要的身形
      } catch { newApi = false; }
    }
    const f = makeShadowFigure({ child: variant === 'child' }); procedural.push(f); return f;
  };
  const shadows = [add(make('shadow'), 'shadow'), add(make('shadow'), 'shadow')];
  const child = add(make('child'), 'child');
  const pick = (kind) => {
    if (kind === 'near') return woman && !woman.active && h.id !== 'home' ? woman : shadows.find((x) => !x.active) || null;
    if (kind === 'woman') return woman && !woman.active ? woman : null;
    if (kind === 'child') return !child.active ? child : null;
    return shadows.find((x) => !x.active) || null;
  };
  const figs = {
    list, woman, shadows, child,
    get newApi() { return newApi === true; },
    free: (kind) => !!pick(kind),
    /** 借一個目前沒在用的幽影。kind: woman | shadow | child | near（優先女人，沒有就黑影） */
    take(kind, owner) { const a = pick(kind); if (a) a.owner = owner; return a; },
    update(dt, hold) { for (let i = 0; i < list.length; i++) if (list[i].active) list[i].tick(dt, hold); },
    hideAll() { for (const a of list) a.hide(); },
    release(owner) { for (const a of list) if (a.owner === owner) a.hide(); },
    dispose() {
      for (const a of list) { a.hide(); map.scene.remove(a.root); }
      for (const f of procedural) f.dispose();
      for (const g of borrowed) { if (g.dispose) g.dispose(); else disposeTree(g.root, false); }
      list.length = 0;
    },
  };
  return figs;
}
