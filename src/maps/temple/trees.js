import * as THREE from 'three';
import { cylinderBetween, merge, mulberry32, matrixOf, addInstancedBuckets } from '../../core/utils.js';
import { BOUNDS as B, COMPOUND as C, GRAVEYARD as G } from './layout.js';
import { terrainHeight } from './terrain.js';

/** 程序化枯樹：遞迴分枝，末梢下垂 */
export function makeTreeGeometry(seed, { height = 9, trunkR = 0.28, maxDepth = 5 } = {}) {
  const rng = mulberry32(seed);
  const parts = [];
  const tmp = new THREE.Vector3();
  function branch(start, dir, len, r, depth) {
    const end = start.clone().addScaledVector(dir, len);
    const r2 = r * (depth === 0 ? 0.7 : 0.6);
    const g = cylinderBetween(start, end, r, r2, depth < 2 ? 8 : depth < 3 ? 6 : 4);
    const uv = g.attributes.uv;
    const ku = Math.max(1, Math.round((r * 6.28) / 1.2)), kv = len / 1.6;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * ku, uv.getY(i) * kv);
    parts.push(g);
    if (depth >= maxDepth || r2 < 0.012) return;
    const n = depth === 0 ? 3 + (rng() < 0.5 ? 1 : 0) : 2 + (rng() < 0.3 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      tmp.set(rng() - 0.5, rng() - 0.5, rng() - 0.5).cross(dir).normalize();
      const nd = dir.clone().applyAxisAngle(tmp, (depth === 0 ? 0.4 : 0.32) + rng() * 0.6);
      nd.y += depth >= 3 ? -0.22 : 0.14;
      nd.normalize();
      branch(end, nd, len * (0.62 + rng() * 0.2), r2, depth + 1);
    }
  }
  // 樹根
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * 6.28 + rng();
    parts.push(cylinderBetween(new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(Math.cos(a) * trunkR * 2.6, -0.3, Math.sin(a) * trunkR * 2.6), trunkR * 0.55, trunkR * 0.22, 5));
  }
  branch(new THREE.Vector3(0, -0.4, 0), new THREE.Vector3((rng() - 0.5) * 0.24, 1, (rng() - 0.5) * 0.24).normalize(), height * 0.4, trunkR, 0);
  return merge(parts);
}

/** 樹林：包圍整個場景的枯樹，以及亂葬崗內零星的幾棵 */
export function buildForest(ctx) {
  const { root, mats, world, rng } = ctx;
  const variants = [
    makeTreeGeometry(11, { height: 10, trunkR: 0.3 }),
    makeTreeGeometry(23, { height: 13, trunkR: 0.36 }),
    makeTreeGeometry(37, { height: 8, trunkR: 0.24 }),
    makeTreeGeometry(51, { height: 11, trunkR: 0.3, maxDepth: 4 }),
  ];
  const items = [];
  const put = (x, z, s, collide) => {
    // 外圍遠景只用低面數變體
    const v = collide ? Math.floor(rng() * 3) : rng() < 0.7 ? 3 : Math.floor(rng() * 3);
    items.push({ x, z, v, m: matrixOf(x, terrainHeight(x, z), z, (rng() - 0.5) * 0.14, rng() * 6.28, (rng() - 0.5) * 0.14, s, s * (0.85 + rng() * 0.4), s) });
    if (collide) world.circle(x, z, 0.32 * s, -50, 50);
  };
  const inRect = (x, z, r, m = 0) => x > r.x1 - m && x < r.x2 + m && z > r.z1 - m && z < r.z2 + m;
  // 外圍密林
  let tries = 0, count = 0;
  while (count < 330 && tries++ < 6000) {
    const x = B.x1 - 46 + rng() * (B.x2 - B.x1 + 92), z = B.z1 - 46 + rng() * (B.z2 - B.z1 + 92);
    if (inRect(x, z, B, 1.5)) continue;
    put(x, z, 0.8 + rng() * 0.9, false);
    count++;
  }
  // 場內：圍牆外、參道兩側、亂葬崗
  tries = 0; count = 0;
  while (count < 46 && tries++ < 4000) {
    const x = B.x1 + 2 + rng() * (B.x2 - B.x1 - 4), z = B.z1 + 2 + rng() * (B.z2 - B.z1 - 4);
    if (inRect(x, z, C, 2.5)) continue;
    if (Math.abs(x) < 4 && z > C.z2) continue; // 參道
    if (inRect(x, z, G, 0) && rng() < 0.72) continue; // 亂葬崗內較稀疏
    if (x > -40 && x < -30 && Math.abs(z) < 7) continue; // 缺口前
    put(x, z, 0.75 + rng() * 0.7, true);
    count++;
  }
  addInstancedBuckets(root, variants.map((geometry) => ({ geometry, material: mats.bark })), items, { cell: 45 });
  return { variants };
}
