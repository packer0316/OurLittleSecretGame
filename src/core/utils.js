import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** 可重現的亂數 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(ix, iz) {
  let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function noise2(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uz);
}
export function fbm(x, z, oct = 4) {
  let amp = 0.5, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { s += amp * noise2(x * f, z * f); n += amp; amp *= 0.5; f *= 2.03; }
  return s / n;
}
export function sdBox(px, pz, hx, hz) {
  const dx = Math.abs(px) - hx, dz = Math.abs(pz) - hz;
  return Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dz), 0);
}

/**
 * 方塊幾何，UV 依世界座標展開（每 tile 公尺重複一次），
 * 相鄰方塊的貼圖會自然銜接、密度一致。
 */
export function boxGeo(w, h, d, x = 0, y = 0, z = 0, tile = 2) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      const px = p.getX(k), py = p.getY(k), pz = p.getZ(k);
      if (f < 2) uv.setXY(k, pz / tile, py / tile);
      else if (f < 4) uv.setXY(k, px / tile, pz / tile);
      else uv.setXY(k, px / tile, py / tile);
    }
  }
  return g;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _p = new THREE.Vector3(), _s = new THREE.Vector3();
/** 對幾何套用位移/旋轉/縮放 */
export function xf(geo, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] } = {}) {
  _e.set(r[0], r[1], r[2]);
  _q.setFromEuler(_e);
  _p.set(p[0], p[1], p[2]);
  if (typeof s === 'number') _s.set(s, s, s); else _s.set(s[0], s[1], s[2]);
  _m.compose(_p, _q, _s);
  geo.applyMatrix4(_m);
  return geo;
}
export function matrixOf(px, py, pz, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(px, py, pz),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')),
    new THREE.Vector3(sx, sy, sz),
  );
}

/** 兩點之間的膠囊 */
export function capsuleBetween(a, b, r, seg = 10) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const g = new THREE.CapsuleGeometry(r, len, 5, seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}
/** 兩點之間的圓柱（可漸細） */
export function cylinderBetween(a, b, r1, r2 = r1, seg = 8) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r2, r1, len, seg, 1, true);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

function normalize(geo) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) {
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  }
  return g;
}
export function merge(geos) {
  return mergeGeometries(geos.map(normalize), false);
}

/** 依材質收集幾何，最後合併成少量 draw call */
export class Batch {
  constructor() { this.map = new Map(); }
  add(mat, geo) {
    let a = this.map.get(mat);
    if (!a) { a = []; this.map.set(mat, a); }
    a.push(geo);
    return geo;
  }
  box(mat, w, h, d, x, y, z, tile = 2) { return this.add(mat, boxGeo(w, h, d, x, y, z, tile)); }
  /** 以兩角座標建立方塊 */
  span(mat, x1, y1, z1, x2, y2, z2, tile = 2) {
    return this.box(mat, Math.abs(x2 - x1), Math.abs(y2 - y1), Math.abs(z2 - z1), (x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2, tile);
  }
  build(parent, { cast = true, receive = true } = {}) {
    const out = [];
    for (const [mat, geos] of this.map) {
      if (!geos.length) continue;
      const mesh = new THREE.Mesh(merge(geos), mat);
      mesh.castShadow = cast;
      mesh.receiveShadow = receive;
      parent.add(mesh);
      out.push(mesh);
    }
    this.map.clear();
    return out;
  }
}

/** 將矩形 r 扣掉 hole，回傳剩餘的矩形（最多 4 塊） */
export function subtractRect(r, hole) {
  const out = [];
  const hx1 = Math.max(r.x1, hole.x1), hx2 = Math.min(r.x2, hole.x2);
  const hz1 = Math.max(r.z1, hole.z1), hz2 = Math.min(r.z2, hole.z2);
  if (hx1 >= hx2 || hz1 >= hz2) return [r];
  if (hz1 > r.z1) out.push({ x1: r.x1, x2: r.x2, z1: r.z1, z2: hz1 });
  if (hz2 < r.z2) out.push({ x1: r.x1, x2: r.x2, z1: hz2, z2: r.z2 });
  if (hx1 > r.x1) out.push({ x1: r.x1, x2: hx1, z1: hz1, z2: hz2 });
  if (hx2 < r.x2) out.push({ x1: hx2, x2: r.x2, z1: hz1, z2: hz2 });
  return out;
}

/** 把 glTF 場景的每個 mesh 以 InstancedMesh 散佈到多個位置 */
export function scatterModel(root, matrices, { cast = true, receive = true, pick = null, center = false } = {}) {
  const group = new THREE.Group();
  root.updateMatrixWorld(true);
  const meshes = [];
  root.traverse((o) => { if (o.isMesh) meshes.push(o); });
  const use = pick ? meshes.filter((_, i) => pick.includes(i)) : meshes;
  const tmp = new THREE.Matrix4(), local = new THREE.Matrix4(), bb = new THREE.Box3(), c = new THREE.Vector3();
  for (const m of use) {
    local.copy(m.matrixWorld);
    if (center) {
      // 把每個子模型移到原點、底部貼地，方便個別擺放
      bb.setFromObject(m); bb.getCenter(c);
      local.premultiply(tmp.makeTranslation(-c.x, -bb.min.y, -c.z));
    }
    const inst = new THREE.InstancedMesh(m.geometry, m.material, matrices.length);
    for (let i = 0; i < matrices.length; i++) {
      tmp.multiplyMatrices(matrices[i], local);
      inst.setMatrixAt(i, tmp);
    }
    inst.castShadow = cast;
    inst.receiveShadow = receive;
    inst.computeBoundingSphere();
    group.add(inst);
  }
  return group;
}

/** 把 glTF 拆成可個別實例化的子模型（各自置中、底部貼地） */
export function modelVariants(root, { center = true } = {}) {
  root.updateMatrixWorld(true);
  const out = [];
  const bb = new THREE.Box3(), c = new THREE.Vector3(), t = new THREE.Matrix4();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const local = o.matrixWorld.clone();
    if (center) { bb.setFromObject(o); bb.getCenter(c); local.premultiply(t.makeTranslation(-c.x, -bb.min.y, -c.z)); }
    out.push({ geometry: o.geometry, material: o.material, local });
  });
  return out;
}

/**
 * 依空間格子分桶建立 InstancedMesh，讓視錐剔除能生效。
 * items: [{ m: Matrix4, x, z, v: 變體索引, color? }]
 */
export function addInstancedBuckets(parent, variants, items, { cell = 40, cast = true, receive = true } = {}) {
  const buckets = new Map();
  for (const it of items) {
    const key = `${Math.floor(it.x / cell)},${Math.floor(it.z / cell)},${it.v}`;
    let list = buckets.get(key);
    if (!list) buckets.set(key, (list = []));
    list.push(it);
  }
  const tmp = new THREE.Matrix4();
  for (const list of buckets.values()) {
    const v = variants[list[0].v];
    const im = new THREE.InstancedMesh(v.geometry, v.material, list.length);
    list.forEach((it, i) => {
      if (v.local) im.setMatrixAt(i, tmp.multiplyMatrices(it.m, v.local)); else im.setMatrixAt(i, it.m);
      if (it.color) im.setColorAt(i, it.color);
    });
    im.castShadow = cast; im.receiveShadow = receive;
    im.computeBoundingSphere();
    parent.add(im);
  }
}

/** 取得 glTF 的包圍盒資訊 */
export function modelBounds(root) {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  return { box, size };
}
