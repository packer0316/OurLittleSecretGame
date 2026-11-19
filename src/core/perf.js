import * as THREE from 'three';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';

/**
 * 效能輔助（擁有者：perf）。四件事，全部不改變畫面內容：
 *  - LightPool：固定數量的點光源池。場景裡的 PointLight 改成「虛擬」，每幀挑最相關的幾盞寫進池子，
 *    每個像素要算的燈從全場景的數量降到池子大小，而且之後再加燈也不會觸發 shader 重編。
 *  - OccluderPrepass：先把大片的牆、地板、屋頂只畫深度，主畫面被擋住的像素就不必再跑昂貴的光照。
 *  - DynamicResolution：影格時間超出預算時降低內部解析度，回穩後再升回來。
 *  - 暖機：載入時就把所有貼圖、幾何與 shader 送進 GPU（含當下隱藏的物件），避免第一次出現時卡頓。
 *
 * 網址加 ?noopt（或 ?noopt=lights,prepass,drs,warm,shadow,cap）可關閉，供量測前後對照。
 */

const params = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
const off = new Set(params.has('noopt') ? (params.get('noopt') || 'all').split(',') : []);
export const OPT = (name) => !(off.has('all') || off.has(name));

/** 虛擬光源所在的圖層：攝影機看不到這一層，所以渲染器不會把它算進 shader。 */
export const VIRTUAL_LIGHT_LAYER = 30;
const VIRTUAL_MASK = 1 << VIRTUAL_LIGHT_LAYER;

// 場景圖有新增物件時遞增，讓每幀的掃描只在真的有變化時才做。
let graphVersion = 1;
if (!THREE.Object3D.prototype.__perfAddPatched) {
  const add = THREE.Object3D.prototype.add;
  THREE.Object3D.prototype.add = function (...args) { graphVersion++; return add.apply(this, args); };
  Object.defineProperty(THREE.Object3D.prototype, '__perfAddPatched', { value: true, enumerable: false });
}
export const sceneGraphVersion = () => graphVersion;

const effVisible = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
const nextFrame = () => new Promise((resolve) => {
  let done = false;
  const go = () => { if (!done) { done = true; resolve(); } };
  requestAnimationFrame(go);
  setTimeout(go, 60); // 分頁在背景時 rAF 不會觸發，不能讓載入卡死
});

// ───────────────────────────── 點光源池 ─────────────────────────────

export class LightPool {
  constructor(max = 8) {
    this.max = max;
    this.enabled = OPT('lights');
    this.scene = null;
    this.group = null;
    this.entries = [];
    this.slots = [];
    this._order = [];
    this._seen = 0;
    this._lastCam = new THREE.Vector3(1e9, 0, 0);
  }

  attach(scene, camera) {
    this.detach();
    if (!this.enabled) return;
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'PerfLightPool';
    scene.add(this.group);
    this._seen = 0;
    this._adopt();
    const n = Math.min(this.max, this.entries.length);
    for (let i = 0; i < n; i++) this._addSlot();
    if (camera) this.update(camera, 0, true);
  }

  detach() {
    for (const e of this.entries) e.light.layers.set(0);
    this.entries.length = 0;
    for (const s of this.slots) s.light.dispose();
    this.slots.length = 0;
    this.group?.removeFromParent();
    this.group = null;
    this.scene = null;
  }

  _addSlot() {
    const light = new THREE.PointLight(0xffffff, 0, 10, 2);
    light.userData.poolSlot = true;
    this.group.add(light);
    this.slots.push({ light, owner: null });
  }

  /** 把場景裡還沒收編的 PointLight 變成虛擬光源 */
  _adopt() {
    if (this._seen === graphVersion) return;
    this._seen = graphVersion;
    this.scene.traverse((o) => {
      if (!o.isPointLight || o.layers.mask === VIRTUAL_MASK) return;
      if (o.castShadow || o.userData.poolSlot || o.userData.noPool) return;
      o.layers.set(VIRTUAL_LIGHT_LAYER);
      this.entries.push({ light: o, pos: new THREE.Vector3(), I: 0, score: 0, gain: 0, slot: -1, want: false });
    });
  }

  /** 每幀在渲染前呼叫。snap=true 時不做淡入淡出（瞬間傳送、單張渲染）。 */
  update(camera, dt, snap = false) {
    const scene = this.scene;
    if (!scene) return;
    this._adopt();
    const cam = camera.position;
    if (cam.distanceToSquared(this._lastCam) > 9) snap = true;
    this._lastCam.copy(cam);
    const fog = scene.fog;
    const visD = fog?.isFogExp2 ? 2.4 / Math.max(1e-4, fog.density) : fog?.isFog ? fog.far : 1e4;
    const order = this._order;
    order.length = 0;
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const e = this.entries[i], L = e.light;
      let I = L.intensity, root = L;
      for (let p = L; p; p = p.parent) { if (!p.visible) I = 0; root = p; }
      if (root !== scene) { // 已被移出場景
        L.layers.set(0);
        if (e.slot >= 0) this.slots[e.slot].owner = null;
        this.entries.splice(i, 1);
        continue;
      }
      e.I = I;
      e.score = 0;
      if (!(I > 1e-5)) continue;
      L.getWorldPosition(e.pos);
      const d = e.pos.distanceTo(cam), R = L.distance > 0 ? L.distance : 40, beyond = Math.max(0, d - R);
      if (beyond > visD) continue;
      const f = fog?.isFogExp2 ? Math.exp(-((fog.density * beyond) ** 2)) : 1 - beyond / visD;
      const k = R / Math.max(R, d);
      e.score = Math.max(1e-9, I * f * k * k * (e.slot >= 0 ? 1.35 : 1));
      order.push(e);
    }
    order.sort((a, b) => b.score - a.score);
    // 池子還沒滿時依需求擴充（和沒有池子時「加一盞燈」一樣會重編一次 shader，但只會發生在超過載入時的數量）
    while (this.slots.length < Math.min(this.max, order.length)) this._addSlot();
    const N = this.slots.length;
    for (const e of this.entries) e.want = false;
    for (let i = 0; i < order.length && i < N; i++) order[i].want = true;
    const step = snap ? 1 : Math.min(1, dt * 6);
    for (const e of this.entries) {
      if (e.slot < 0) continue;
      if (e.want) e.gain = Math.min(1, e.gain + step);
      else {
        e.gain = e.I > 1e-5 ? Math.max(0, e.gain - step) : 0; // 已經熄滅的燈直接讓位
        if (e.gain <= 0) { this.slots[e.slot].owner = null; e.slot = -1; }
      }
    }
    for (let i = 0; i < order.length && i < N; i++) {
      const e = order[i];
      if (e.slot >= 0) continue;
      const s = this.slots.findIndex((x) => x.owner === null);
      if (s < 0) break; // 等被擠掉的燈淡出
      this.slots[s].owner = e;
      e.slot = s;
      // 有空位就立刻全亮（閃爍、突然亮起的燈不能被平滑掉）；只有排名邊緣的替換才淡入
      e.gain = snap || order.length <= N ? 1 : step;
    }
    for (const s of this.slots) {
      const e = s.owner, P = s.light;
      if (!e) { P.intensity = 0; continue; }
      const L = e.light;
      P.color.copy(L.color);
      P.intensity = e.I * e.gain;
      P.distance = L.distance;
      P.decay = L.decay;
      P.position.copy(e.pos);
    }
  }
}

// ───────────────────────────── 遮蔽物深度預畫 ─────────────────────────────

const _areaCache = new WeakMap();
function triangleStats(geo) {
  let s = _areaCache.get(geo);
  if (s) return s;
  const p = geo.attributes.position, idx = geo.index;
  const n = idx ? idx.count : p ? p.count : 0;
  let area = 0;
  if (p && !p.isInterleavedBufferAttribute && p.itemSize === 3 && !p.normalized) {
    const a = p.array, ia = idx ? idx.array : null;
    for (let i = 0; i + 2 < n; i += 3) {
      const i0 = (ia ? ia[i] : i) * 3, i1 = (ia ? ia[i + 1] : i + 1) * 3, i2 = (ia ? ia[i + 2] : i + 2) * 3;
      const ux = a[i1] - a[i0], uy = a[i1 + 1] - a[i0 + 1], uz = a[i1 + 2] - a[i0 + 2];
      const vx = a[i2] - a[i0], vy = a[i2 + 1] - a[i0 + 1], vz = a[i2 + 2] - a[i0 + 2];
      const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
      area += Math.sqrt(cx * cx + cy * cy + cz * cz) * 0.5;
    }
  }
  s = { area, tris: n / 3 };
  _areaCache.set(geo, s);
  return s;
}

const occluderMaterial = (m) =>
  m && !Array.isArray(m) && m.visible !== false && !m.transparent && !(m.alphaTest > 0) && !m.alphaHash && m.depthWrite && m.depthTest &&
  m.colorWrite !== false && m.side !== THREE.BackSide && !m.displacementMap && !m.wireframe && !m.polygonOffset &&
  m.depthFunc === THREE.LessEqualDepth && !m.userData.noPrepass && (m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial || m.isMeshBasicMaterial);

/**
 * 大片不透明的靜態表面（牆、地板、屋頂、地形）在另一個只寫深度的場景裡各有一個分身。
 * 分身共用原本的幾何（同一份 GPU 緩衝），每幀同步矩陣與可見性，所以門板之類會動的東西也不會出錯。
 */
export class OccluderPrepass {
  constructor() {
    this.enabled = OPT('prepass');
    this.scene = new THREE.Scene();
    this.scene.matrixWorldAutoUpdate = false;
    this.mats = {
      [THREE.FrontSide]: new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.FrontSide, fog: false, toneMapped: false }),
      [THREE.DoubleSide]: new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false }),
    };
    this.items = [];
    this.tris = 0;
  }

  attach(scene) {
    this.detach();
    if (!this.enabled) return;
    this.src = scene;
    scene.updateMatrixWorld(true);
    scene.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.isBatchedMesh || o.userData.noPrepass || o.renderOrder !== 0) return;
      const m = o.material, geo = o.geometry;
      if (!occluderMaterial(m) || !geo?.attributes?.position || geo.morphAttributes?.position) return;
      if (!geo.boundingSphere) geo.computeBoundingSphere();
      const sc = o.matrixWorld.getMaxScaleOnAxis();
      if (geo.boundingSphere.radius * sc < 1.5) return;
      const st = triangleStats(geo), area = st.area * sc * sc;
      // 面積夠大、三角形又不細碎的才值得當遮蔽物（細碎的小道具合併網格只會白白多畫一次）
      if (area < 30 || area / Math.max(1, st.tris) < 0.05) return;
      const proxy = new THREE.Mesh(geo, this.mats[m.side]);
      proxy.matrixAutoUpdate = false;
      proxy.frustumCulled = o.frustumCulled;
      this.scene.add(proxy);
      this.items.push({ src: o, proxy, mat: m });
      this.tris += st.tris;
    });
  }

  detach() {
    for (const it of this.items) this.scene.remove(it.proxy);
    this.items.length = 0;
    this.tris = 0;
    this.src = null;
  }

  /** 這個渲染目標可不可以用預畫（MSAA 目標在兩次 render 之間會被解析，深度不保證保留） */
  ready(target) { return this.enabled && this.items.length > 0 && !(target && target.samples > 0); }

  sync(camera) {
    const src = this.src;
    for (const it of this.items) {
      const o = it.src, p = it.proxy;
      let ok = o.material === it.mat && occluderMaterial(it.mat) && o.layers.test(camera.layers);
      if (ok) {
        let root = o;
        for (let q = o; q; q = q.parent) { if (!q.visible) { ok = false; break; } root = q; }
        if (ok && root !== src) ok = false; // 已被移出場景
      }
      p.visible = ok;
      if (!ok) continue;
      if (p.geometry !== o.geometry) p.geometry = o.geometry;
      p.material = this.mats[it.mat.side];
      p.matrixWorld.copy(o.matrixWorld);
    }
  }
}

/** 取代 RenderPass：先畫遮蔽物深度，再畫完整場景（保留深度、只清顏色）。輸出與 RenderPass 逐像素相同。 */
export class PrepassRenderPass extends RenderPass {
  constructor(scene, camera, prepass) {
    super(scene, camera);
    this.prepass = prepass;
  }

  render(renderer, writeBuffer, readBuffer, deltaTime, maskActive) {
    const pre = this.prepass, target = this.renderToScreen ? null : readBuffer;
    if (!pre || !pre.ready(target) || this.overrideMaterial !== null || this.clearColor !== null || this.clearAlpha !== null || this.scene.overrideMaterial) {
      super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
      return;
    }
    const scene = this.scene, camera = this.camera;
    const oldAutoClear = renderer.autoClear, oldDepth = renderer.autoClearDepth, oldAuto = scene.matrixWorldAutoUpdate;
    renderer.autoClear = false;
    try {
      renderer.setRenderTarget(target);
      if (this.clear === true) renderer.clear(renderer.autoClearColor, renderer.autoClearDepth, renderer.autoClearStencil);
      if (oldAuto === true) scene.updateMatrixWorld();
      if (camera.parent === null && camera.matrixWorldAutoUpdate === true) camera.updateMatrixWorld();
      pre.sync(camera);
      renderer.render(pre.scene, camera);
      renderer.autoClearDepth = false; // 背景是純色時 three 會強制清除，這裡只讓它清顏色
      scene.matrixWorldAutoUpdate = false;
      renderer.render(scene, camera);
    } finally {
      scene.matrixWorldAutoUpdate = oldAuto;
      renderer.autoClearDepth = oldDepth;
      renderer.autoClear = oldAutoClear;
    }
  }
}

// ───────────────────────────── GPU 計時與動態解析度 ─────────────────────────────

/** 以 EXT_disjoint_timer_query_webgl2 量整幀的 GPU 時間（不支援時 ms 維持 0） */
export class GpuTimer {
  constructor(renderer) {
    this.gl = renderer.getContext();
    this.ext = this.gl.getExtension?.('EXT_disjoint_timer_query_webgl2') || null;
    this.ms = 0;
    this.samples = 0;
    this._active = null;
    this._pending = null;
  }
  begin() {
    if (!this.ext || this._active || this._pending) return;
    const gl = this.gl;
    this._active = gl.createQuery();
    gl.beginQuery(this.ext.TIME_ELAPSED_EXT, this._active);
  }
  end() {
    if (!this._active) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this._pending = this._active;
    this._active = null;
  }
  poll() {
    const q = this._pending;
    if (!q) return false;
    const gl = this.gl;
    if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) return false;
    const disjoint = gl.getParameter(this.ext.GPU_DISJOINT_EXT);
    if (!disjoint) { this.ms = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6; this.samples++; }
    gl.deleteQuery(q);
    this._pending = null;
    return !disjoint;
  }
}

/** 依影格時間調整內部解析度比例（1 → min，級距 0.1）。升回去失敗會拉長下次嘗試的間隔，避免來回抖動。 */
export class DynamicResolution {
  constructor({ min = 0.6, slowMs = 21, fastMs = 17.6 } = {}) {
    this.min = min;
    this.slowMs = slowMs;
    this.fastMs = fastMs;
    this.enabled = false;
    this.reset();
  }
  reset() {
    this.scale = 1;
    this.ema = 16.7;
    this._slow = 0;
    this._fast = 0;
    this._hold = 1.5;
    this._upWait = 4;
    this._sinceUp = 1e9;
    this.pinned = 0; // 已經在最低比例卻仍然太慢的累計秒數
  }
  /** 回傳 true 代表 scale 改變了，呼叫端要重設渲染目標大小 */
  update(frameMs, gpuMs = 0) {
    if (!this.enabled || !(frameMs > 0) || frameMs > 250) return false;
    const dt = frameMs / 1000;
    this.ema += (frameMs - this.ema) * 0.08;
    this._sinceUp += dt;
    if (this._hold > 0) { this._hold -= dt; return false; }
    if (this.ema > this.slowMs) { this._slow += dt; this._fast = 0; }
    else if (this.ema < this.fastMs) { this._fast += dt; this._slow = Math.max(0, this._slow - dt); }
    else { this._slow = Math.max(0, this._slow - dt); this._fast = 0; }
    if (this._slow > 0.6) {
      if (this.scale <= this.min + 1e-3) { this.pinned += dt; return false; }
      if (this._sinceUp < 4) this._upWait = Math.min(90, this._upWait * 2);
      const drop = this.ema > 30 ? 0.2 : 0.1;
      return this._set(Math.max(this.min, this.scale - drop));
    }
    this.pinned = Math.max(0, this.pinned - dt * 0.5);
    if (this._fast > this._upWait && this.scale < 1) {
      // 有 GPU 計時時先估算升一級後的成本，明顯會超出預算就不試
      const next = Math.min(1, this.scale + 0.1), grow = (next / this.scale) ** 2;
      if (gpuMs > 0 && gpuMs * (0.4 + 0.6 * grow) > 14.5) { this._fast = 0; return false; }
      if (this._sinceUp > 12) this._upWait = 4;
      this._sinceUp = 0;
      return this._set(next);
    }
    return false;
  }
  _set(s) {
    s = Math.round(s * 100) / 100;
    if (s === this.scale) return false;
    this.scale = s;
    this._slow = this._fast = 0;
    this._hold = 0.9;
    this.ema = (this.slowMs + this.fastMs) / 2;
    return true;
  }
}

// ───────────────────────────── 暖機 ─────────────────────────────

function eachMaterial(o, fn) {
  const m = o.material;
  if (!m) return;
  if (Array.isArray(m)) for (const x of m) fn(x); else fn(m);
}

/** 收集物件樹用到的所有貼圖（含隱藏物件、聚光燈的 cookie） */
export function collectTextures(root, out = new Set()) {
  const seen = new Set();
  root.traverse((o) => {
    if (o.isLight && o.map?.isTexture) out.add(o.map);
    eachMaterial(o, (m) => {
      if (seen.has(m)) return;
      seen.add(m);
      for (const k in m) { const v = m[k]; if (v && v.isTexture) out.add(v); }
      if (m.uniforms) for (const k in m.uniforms) { const v = m.uniforms[k]?.value; if (v && v.isTexture) out.add(v); }
    });
  });
  if (root.isScene) for (const t of [root.environment, root.background]) if (t?.isTexture) out.add(t);
  return out;
}

const uploadable = (renderer, t) => {
  if (!t || t.isRenderTargetTexture || t.isDepthTexture || t.isVideoTexture || t.isFramebufferTexture) return false;
  const img = t.image;
  if (!img || (img.complete === false) || (img.width === 0 && !t.isDataTexture && !t.isCompressedTexture && !Array.isArray(img))) return false;
  const p = renderer.properties.get(t);
  return !(p.__webglTexture && p.__version === t.version);
};

/** 分批把貼圖送進 GPU；sliceMs 是每一幀願意花的毫秒數 */
export async function uploadTextures(renderer, textures, { sliceMs = 10, onProgress } = {}) {
  const list = [...textures].filter((t) => uploadable(renderer, t));
  if (!list.length) return 0;
  // 先在背景執行緒解碼，上傳時就不必同步解碼
  await Promise.all(list.map((t) => (typeof t.image?.decode === 'function' ? t.image.decode().catch(() => {}) : null)));
  let t0 = performance.now();
  for (let i = 0; i < list.length; i++) {
    try { if (uploadable(renderer, list[i])) renderer.initTexture(list[i]); } catch { /* 個別貼圖失敗不影響載入 */ }
    if (performance.now() - t0 > sliceMs) {
      onProgress?.((i + 1) / list.length, i + 1, list.length);
      await nextFrame();
      t0 = performance.now();
    }
  }
  onProgress?.(1, list.length, list.length);
  return list.length;
}

/**
 * 以實際渲染時相同的渲染目標設定預先編譯 shader（非同步，不凍結主執行緒）。
 * three 的程式快取鍵包含色調映射與輸出色彩空間，兩者在「畫到畫布」和「畫到後製用的渲染目標」時不同，
 * 所以一定要在綁著渲染目標的情況下呼叫，否則編出來的全是用不到的變體。
 */
export async function compileFor(renderer, target, object, camera, scene, onProgress) {
  const prev = renderer.getRenderTarget();
  let promise;
  try {
    renderer.setRenderTarget(target);
    promise = renderer.compileAsync(object, camera, scene === object ? null : scene);
  } finally {
    renderer.setRenderTarget(prev);
  }
  let done = false;
  promise.then(() => { done = true; }, () => { done = true; });
  const programs = renderer.info.programs || [];
  const started = performance.now();
  while (!done && performance.now() - started < 60000) {
    let ready = 0;
    for (const p of programs) if (p.isReady()) ready++;
    onProgress?.(programs.length ? ready / programs.length : 1, ready, programs.length);
    await new Promise((r) => setTimeout(r, 40));
  }
  onProgress?.(1, programs.length, programs.length);
}

/**
 * 把所有物件（含隱藏的）強制顯示、關掉視錐剔除後執行 draw()，讓幾何、陰影用的深度 shader 與所有變體都進 GPU。
 * 原本看不到的光源維持看不到，光源數量不變，才不會編出錯誤的變體。
 */
export function forcedVisible(scene, draw) {
  const hidden = [], unculled = [], lightsOff = [];
  scene.traverse((o) => {
    if (o.isLight) { if (o.visible && !effVisible(o)) lightsOff.push(o); return; }
    if (!o.visible) hidden.push(o);
    if (o.frustumCulled && (o.isMesh || o.isLine || o.isPoints || o.isSprite)) unculled.push(o);
  });
  for (const o of lightsOff) o.visible = false;
  for (const o of hidden) o.visible = true;
  for (const o of unculled) o.frustumCulled = false;
  try { draw(); } finally {
    for (const o of unculled) o.frustumCulled = true;
    for (const o of hidden) o.visible = false;
    for (const o of lightsOff) o.visible = true;
  }
}

/**
 * 陰影用的深度 shader 暖機道具。three 的陰影 pass 共用同一個深度材質，實際用到哪個變體
 * （一般／實例化／帶實例顏色／骨架 × 單面／雙面）取決於物件被畫到的先後順序，所以載入時那一幀不一定全部碰到，
 * 之後某個物件第一次進到手電筒的陰影範圍才會臨時編譯。這裡依序排好一組看不見的小三角形，
 * 讓每一種組合都在載入時編譯完。用完由呼叫端移除並呼叫 userData.dispose()。
 */
export function makeDepthWarmers() {
  const group = new THREE.Group();
  group.name = 'PerfDepthWarmers';
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1e-3, 0, 0, 0, 1e-3, 0], 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
  const skinGeo = geo.clone();
  skinGeo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 4));
  skinGeo.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
  // 深度材質還會跟著來源材質「有沒有底色貼圖」分成兩套，所以每種組合都要有貼圖、無貼圖各一次
  const tex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  tex.needsUpdate = true;
  const mats = [];
  const mat = (side, map) => { const m = new THREE.MeshBasicMaterial({ side, map, colorWrite: false, depthWrite: false, depthTest: false, fog: false, toneMapped: false }); mats.push(m); return m; };
  const plain = (m) => new THREE.Mesh(geo, m);
  const inst = (m, color) => { const o = new THREE.InstancedMesh(geo, m, 1); o.setMatrixAt(0, new THREE.Matrix4()); if (color) o.setColorAt(0, new THREE.Color(1, 1, 1)); return o; };
  const skinned = (m) => { const o = new THREE.SkinnedMesh(skinGeo, m), bone = new THREE.Bone(); o.add(bone); o.bind(new THREE.Skeleton([bone])); return o; };
  const order = [];
  for (const map of [null, tex]) {
    const F = mat(THREE.FrontSide, map), D = mat(THREE.DoubleSide, map);
    // 相鄰兩個一定在「實例化／骨架」上不同，才會逼 three 以當下的面向與貼圖狀態重新選一次 program
    order.push(plain(D), inst(F), plain(F), inst(D), plain(D), skinned(F), plain(F), skinned(D), plain(D), inst(F, true), plain(F), inst(D, true), plain(D));
  }
  for (const o of order) { o.castShadow = true; o.frustumCulled = false; o.userData.noPrepass = true; group.add(o); }
  group.userData.dispose = () => {
    for (const o of order) { o.skeleton?.dispose(); if (o.isInstancedMesh) o.dispose(); }
    geo.dispose(); skinGeo.dispose(); tex.dispose();
    for (const m of mats) m.dispose();
  };
  return group;
}

const _warmScene = new THREE.Scene();
_warmScene.matrixWorldAutoUpdate = false;
const _warmMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthTest: false, depthWrite: false, fog: false, toneMapped: false });
let _warmTarget = null;

/** 只把一棵子樹的頂點緩衝送進 GPU（用分身畫進 4×4 的離屏目標，不動到主場景的燈光狀態） */
export function uploadGeometries(renderer, root, camera) {
  const proxies = [];
  root.updateWorldMatrix(true, true);
  root.traverse((o) => {
    if (!(o.isMesh || o.isLine || o.isPoints) || !o.geometry?.attributes?.position) return;
    const p = o.isPoints ? new THREE.Points(o.geometry, _warmMat) : o.isLine ? null : new THREE.Mesh(o.geometry, _warmMat);
    if (!p) return;
    p.matrixAutoUpdate = false;
    p.frustumCulled = false;
    p.matrixWorld.copy(o.matrixWorld);
    proxies.push(p);
    _warmScene.add(p);
  });
  if (!proxies.length) return 0;
  _warmTarget ||= new THREE.WebGLRenderTarget(4, 4, { depthBuffer: false });
  const prev = renderer.getRenderTarget();
  try {
    renderer.setRenderTarget(_warmTarget);
    renderer.render(_warmScene, camera);
  } finally {
    renderer.setRenderTarget(prev);
    for (const p of proxies) _warmScene.remove(p);
  }
  return proxies.length;
}

/** 追蹤載入之後才加進場景、而且當下看不到的物件，供 Game 在背景替它們暖機 */
export class LateObjects {
  constructor() { this.known = new WeakSet(); this._seen = 0; this.scene = null; }
  attach(scene) { this.scene = scene; this.known = new WeakSet(); scene.traverse((o) => this.known.add(o)); this._seen = graphVersion; }
  detach() { this.scene = null; }
  /** 回傳新出現且含有隱藏內容的子樹根節點 */
  collect() {
    const out = [];
    if (!this.scene || this._seen === graphVersion) return out;
    this._seen = graphVersion;
    const visit = (o, parentVisible) => {
      const vis = parentVisible && o.visible;
      if (!this.known.has(o)) {
        let anyHidden = !vis, renderable = false;
        o.traverse((x) => { this.known.add(x); if (!x.visible) anyHidden = true; if (x.isMesh || x.isPoints || x.isSprite) renderable = true; });
        if (anyHidden && renderable && !o.userData.poolSlot) out.push(o);
        return;
      }
      for (const c of o.children) visit(c, vis);
    };
    visit(this.scene, true);
    return out;
  }
}

export { effVisible, nextFrame };
