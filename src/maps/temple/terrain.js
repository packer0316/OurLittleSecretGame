import * as THREE from 'three';
import { COMPOUND as C, PIT } from './layout.js';
import { fbm, sdBox, smoothstep } from '../../core/utils.js';

const CCX = (C.x1 + C.x2) / 2, CCZ = (C.z1 + C.z2) / 2;
const CHX = (C.x2 - C.x1) / 2 + 0.6, CHZ = (C.z2 - C.z1) / 2 + 0.6;

/** 室外地形高度：廟埕與參道為平地，亂葬崗一帶起伏較大並往西隆起 */
export function terrainHeight(x, z) {
  const mC = smoothstep(0.4, 10, sdBox(x - CCX, z - CCZ, CHX, CHZ));
  const mP = smoothstep(0.2, 5, sdBox(x, z - 40, 1.9, 19));
  const m = Math.min(mC, mP);
  const gy = smoothstep(-31, -44, x);
  let h = (fbm(x * 0.035 + 11.3, z * 0.035 + 4.7, 4) - 0.5) * (2.4 + gy * 2.8);
  h += (fbm(x * 0.16 + 50, z * 0.16 + 9, 3) - 0.5) * (0.35 + gy * 0.55);
  h += gy * smoothstep(-42, -90, x) * 3.2;
  h *= m;
  const dx = (x - PIT.x) / 2.0, dz = (z - PIT.z) / 2.8;
  h -= 1.2 * Math.exp(-(dx * dx + dz * dz) * 1.7);
  return h;
}

export function buildTerrain(ctx) {
  const { mats, root, world } = ctx;
  const size = 360, seg = 280, cx = -24, cz = 4;
  const g = new THREE.PlaneGeometry(size, size, seg, seg);
  g.rotateX(-Math.PI / 2);
  g.translate(cx, 0, cz);
  const p = g.attributes.position, uv = g.attributes.uv;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    p.setY(i, terrainHeight(x, z));
    uv.setXY(i, x / 3.4, z / 3.4);
    const n = fbm(x * 0.07 + 3, z * 0.07 + 8, 3), n2 = fbm(x * 0.4, z * 0.4, 2);
    const s = 0.5 + 0.5 * n + (n2 - 0.5) * 0.25;
    col[i * 3] = s * 0.95; col[i * 3 + 1] = s * (0.9 + n2 * 0.12); col[i * 3 + 2] = s * 0.82;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const ground = new THREE.Mesh(g, mats.ground);
  ground.receiveShadow = true;
  root.add(ground);

  // 廟埕鋪石
  const yard = new THREE.PlaneGeometry(C.x2 - C.x1, C.z2 - C.z1);
  yard.rotateX(-Math.PI / 2);
  yard.translate(CCX, 0.02, CCZ);
  const yuv = yard.attributes.uv, yp = yard.attributes.position;
  for (let i = 0; i < yp.count; i++) yuv.setXY(i, yp.getX(i) / 2.6, yp.getZ(i) / 2.6);
  const yardMesh = new THREE.Mesh(yard, mats.cobble);
  yardMesh.receiveShadow = true;
  root.add(yardMesh);
  world.floor(C.x1, C.z1, C.x2, C.z2, 0.02);
  world.terrain = terrainHeight;
}
