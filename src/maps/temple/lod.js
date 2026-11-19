import * as THREE from 'three';

/**
 * 頂點叢集簡化：把模型的包圍盒切成 n 格（最長邊），同一格內的頂點併成一點。
 * Poly Haven 的掃描模型單顆石頭就有一萬到八萬個三角形，在夜裡、霧裡、內顯上完全用不到；
 * 外形輪廓留著，細節交給法線貼圖。
 *  - 位置以「空間格」為單位取平均（同一格只有一個位置，貼圖接縫兩側不會裂開）
 *  - UV 以「空間格 × UV 區塊」為單位取平均（接縫兩側各自保留，貼圖不會糊成一片）
 *  - 法線以空間格累加面法線，跨接縫仍然平滑
 */
const cache = new WeakMap();

export function decimate(geo, n = 24) {
  if (cache.has(geo)) return cache.get(geo);
  const pos = geo.attributes.position, uv = geo.attributes.uv, idx = geo.index;
  geo.computeBoundingBox();
  const bb = geo.boundingBox, size = bb.getSize(new THREE.Vector3());
  const cell = Math.max(size.x, size.y, size.z) / n || 1;
  const cellOf = new Int32Array(pos.count), cluOf = new Int32Array(pos.count);
  const cells = new Map(), clusters = new Map();
  const cp = [];                 // 每格：位置總和 x, y, z 與頂點數
  const cluCell = [], cluUv = []; // 每個叢集：所屬的格、UV 總和 u, v 與頂點數
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const key = Math.floor((x - bb.min.x) / cell) + ',' + Math.floor((y - bb.min.y) / cell) + ',' + Math.floor((z - bb.min.z) / cell);
    let c = cells.get(key);
    if (c === undefined) { c = cp.length / 4; cells.set(key, c); cp.push(0, 0, 0, 0); }
    cp[c * 4] += x; cp[c * 4 + 1] += y; cp[c * 4 + 2] += z; cp[c * 4 + 3]++;
    cellOf[i] = c;
    const u = uv ? uv.getX(i) : 0, v = uv ? uv.getY(i) : 0;
    const ck = c + '|' + Math.floor(u * 6) + '|' + Math.floor(v * 6);
    let k = clusters.get(ck);
    if (k === undefined) { k = cluCell.length; clusters.set(ck, k); cluCell.push(c); cluUv.push(0, 0, 0); }
    cluUv[k * 3] += u; cluUv[k * 3 + 1] += v; cluUv[k * 3 + 2]++;
    cluOf[i] = k;
  }
  const nCells = cp.length / 4, nClu = cluCell.length;
  const cellPos = new Float32Array(nCells * 3), cellNrm = new Float32Array(nCells * 3);
  for (let c = 0; c < nCells; c++) { const k = cp[c * 4 + 3]; cellPos[c * 3] = cp[c * 4] / k; cellPos[c * 3 + 1] = cp[c * 4 + 1] / k; cellPos[c * 3 + 2] = cp[c * 4 + 2] / k; }
  // 三角形：三個頂點落在三個不同的格才保留；同一組格只留一片
  const tris = [], seen = new Set();
  const count = idx ? idx.count : pos.count;
  const at = (i) => (idx ? idx.getX(i) : i);
  const a3 = new THREE.Vector3(), b3 = new THREE.Vector3(), c3 = new THREE.Vector3(), nrm = new THREE.Vector3();
  for (let i = 0; i < count; i += 3) {
    const a = at(i), b = at(i + 1), c = at(i + 2), ca = cellOf[a], cb = cellOf[b], cc = cellOf[c];
    if (ca === cb || cb === cc || ca === cc) continue;
    const lo = Math.min(ca, cb, cc), hi = Math.max(ca, cb, cc), mid = ca + cb + cc - lo - hi;
    const tk = lo + ',' + mid + ',' + hi;
    if (seen.has(tk)) continue;
    seen.add(tk);
    tris.push(cluOf[a], cluOf[b], cluOf[c]);
    a3.fromArray(cellPos, ca * 3); b3.fromArray(cellPos, cb * 3); c3.fromArray(cellPos, cc * 3);
    nrm.subVectors(c3, b3).cross(a3.sub(b3)); // 面積加權的面法線
    for (const q of [ca, cb, cc]) { cellNrm[q * 3] += nrm.x; cellNrm[q * 3 + 1] += nrm.y; cellNrm[q * 3 + 2] += nrm.z; }
  }
  const P = new Float32Array(nClu * 3), N = new Float32Array(nClu * 3), U = new Float32Array(nClu * 2);
  for (let k = 0; k < nClu; k++) {
    const c = cluCell[k];
    P[k * 3] = cellPos[c * 3]; P[k * 3 + 1] = cellPos[c * 3 + 1]; P[k * 3 + 2] = cellPos[c * 3 + 2];
    const l = Math.hypot(cellNrm[c * 3], cellNrm[c * 3 + 1], cellNrm[c * 3 + 2]) || 1;
    N[k * 3] = cellNrm[c * 3] / l; N[k * 3 + 1] = cellNrm[c * 3 + 1] / l; N[k * 3 + 2] = cellNrm[c * 3 + 2] / l;
    U[k * 2] = cluUv[k * 3] / cluUv[k * 3 + 2]; U[k * 2 + 1] = cluUv[k * 3 + 1] / cluUv[k * 3 + 2];
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(U, 2));
  out.setIndex(nClu > 65535 ? new THREE.BufferAttribute(new Uint32Array(tris), 1) : new THREE.BufferAttribute(new Uint16Array(tris), 1));
  out.computeBoundingBox(); out.computeBoundingSphere();
  cache.set(geo, out);
  return out;
}

/** 把整個模型（ctx.model 回傳的複本）裡的網格換成簡化版 */
export function lite(model, n = 24) {
  model.traverse((o) => { if (o.isMesh) o.geometry = decimate(o.geometry, n); });
  return model;
}
