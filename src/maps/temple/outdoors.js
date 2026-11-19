import * as THREE from 'three';
import { COMPOUND as C, GATE, BREACH, GRAVEYARD as G, PIT, PLINTH as P, BOUNDS as B, SPAWN } from './layout.js';
import { boxGeo, xf, matrixOf, modelVariants, addInstancedBuckets } from '../../core/utils.js';
import { terrainHeight } from './terrain.js';
import { gableRoof } from './roofs.js';
import { doorLeaf } from './building.js';
import { incenseBurnerGeo, urnGeo } from './interiors.js';
import { makeTreeGeometry } from './trees.js';
import { plaqueTexture, tombTextTexture, paperMoneyTexture, smokeTexture, glowTexture } from '../../core/canvasTex.js';
import { buildDressing } from './dressing.js';
import { decimate, lite } from './lod.js';

/** 石燈籠 */
function stoneLantern(ctx, x, z, ry = 0) {
  const { batch, mats, world } = ctx;
  const y = ctx.groundAt(x, z);
  const parts = [
    boxGeo(0.7, 0.18, 0.7, 0, 0.09, 0, 1.2),
    new THREE.CylinderGeometry(0.13, 0.17, 0.95, 8).translate(0, 0.65, 0),
    boxGeo(0.62, 0.1, 0.62, 0, 1.17, 0, 1.2),
    boxGeo(0.44, 0.42, 0.44, 0, 1.43, 0, 1.2),
    new THREE.ConeGeometry(0.58, 0.36, 4).rotateY(Math.PI / 4).translate(0, 1.82, 0),
    new THREE.SphereGeometry(0.09, 8, 6).translate(0, 2.05, 0),
  ];
  for (const g of parts) batch.add(mats.rock, xf(g, { p: [x, y, z], r: [0, ry, 0] }));
  // 火袋的黑洞
  for (const a of [0, Math.PI / 2]) batch.add(mats.black, xf(boxGeo(0.2, 0.24, 0.46, 0, 1.43, 0), { p: [x, y, z], r: [0, ry + a, 0] }));
  world.circle(x, z, 0.38, y - 1, y + 2.2);
}

export function buildCompound(ctx) {
  const { batch, world, mats, rng, root, buddha } = ctx;
  const H = C.wallH, t = C.wallT;
  const wall = (x1, z1, x2, z2, h = H, cap = true) => {
    batch.span(mats.plasterOld, x1, -0.4, z1, x2, h, z2, 2.6);
    if (cap) {
      const along = Math.abs(x2 - x1) > Math.abs(z2 - z1);
      batch.span(mats.roof, x1 - (along ? 0 : 0.16), h, z1 - (along ? 0.16 : 0), x2 + (along ? 0 : 0.16), h + 0.16, z2 + (along ? 0.16 : 0), 1.6);
    }
    world.box(x1, z1, x2, z2, -1, h + 1.5);
  };
  wall(C.x1, C.z2 - t, -GATE.halfW - 0.45, C.z2);
  wall(GATE.halfW + 0.45, C.z2 - t, C.x2, C.z2);
  wall(C.x1, C.z1, C.x2, C.z1 + t);
  wall(C.x2 - t, C.z1, C.x2, C.z2);
  wall(C.x1, C.z1, C.x1 + t, BREACH.z1 - 1.5);
  wall(C.x1, BREACH.z2 + 1.5, C.x1 + t, C.z2);
  // 崩塌的斷面
  [2.0, 1.25, 0.6].forEach((h, i) => {
    wall(C.x1, BREACH.z1 - 1.5 + i * 0.5, C.x1 + t, BREACH.z1 - 1.0 + i * 0.5, h + (rng() - 0.5) * 0.2, false);
    wall(C.x1, BREACH.z2 + 1.0 - i * 0.5, C.x1 + t, BREACH.z2 + 1.5 - i * 0.5, h + (rng() - 0.5) * 0.2, false);
  });
  // 崩落的磚石
  for (let k = 0; k < 22; k++) {
    const s = 0.18 + rng() * 0.3;
    const x = C.x1 - 1.6 + rng() * 3.6, z = (rng() < 0.5 ? BREACH.z1 : BREACH.z2) + (rng() - 0.5) * 1.8 + (rng() - 0.5) * 2.5;
    if (Math.abs(z) < 1.2) continue;
    batch.add(mats.plasterOld, xf(boxGeo(s * 1.6, s, s * 1.2, 0, 0, 0, 1.5), { p: [x, ctx.groundAt(x, z) + s * 0.35, z], r: [rng(), rng() * 6, rng()] }));
  }

  // ── 山門 ──
  const gz = C.z2 - t / 2;
  for (const sx of [-1, 1]) {
    const px = sx * (GATE.halfW + 0.45);
    batch.span(mats.stoneWall, px - 0.5, -0.4, gz - 0.5, px + 0.5, 3.7, gz + 0.5, 2.2);
    world.box(px - 0.5, gz - 0.5, px + 0.5, gz + 0.5, -1, 5);
  }
  batch.span(mats.woodDark, -3.4, 3.7, gz - 0.3, 3.4, 4.15, gz + 0.3, 1.5);
  const gr = gableRoof({ x1: -4.6, x2: 4.6, zc: gz, halfD: 1.9, eaveY: 4.2, rise: 1.5, lift: 0.6 });
  for (const g of gr.slopes) batch.add(mats.roof, g);
  batch.add(mats.ridge, new THREE.TubeGeometry(gr.ridge, 30, 0.16, 6));
  batch.span(mats.planks, -3.6, 4.15, gz - 1.5, 3.6, 4.25, gz + 1.5, 2);
  doorLeaf(ctx, { x: -GATE.halfW, z: gz, y: 0.02, w: 1.95, h: 3.3, angle: 1.38, side: 'L' });
  doorLeaf(ctx, { x: GATE.halfW, z: gz, y: 0.02, w: 1.95, h: 3.3, angle: 1.05, side: 'R', tilt: 0.05 });
  {
    const m = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.95, 0.1), [mats.woodDark, mats.woodDark, mats.woodDark, mats.woodDark,
      new THREE.MeshStandardMaterial({ map: plaqueTexture('慈雲寺', { w: 1024, h: 360, seed: 21 }), roughness: 0.75, metalness: 0.1 }), mats.woodDark]);
    m.position.set(0, 3.22, gz + 0.55); m.rotation.set(0.16, 0, -0.035); m.castShadow = true;
    root.add(m);
  }
  for (const sx of [-1, 1]) { ctx.talisman(sx * (GATE.halfW + 0.45), 1.7, gz + 0.512, 0, sx * 0.1); stoneLantern(ctx, sx * 3.7, C.z2 + 2.6, 0.2 * sx); }

  // ── 參道與廟埕 ──
  {
    const g = new THREE.PlaneGeometry(4.4, C.z2 - (P.z2 + 2.25));
    g.rotateX(-Math.PI / 2); g.translate(0, 0.035, (C.z2 + P.z2 + 2.25) / 2);
    const uv = g.attributes.uv, p = g.attributes.position;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 2.2, p.getZ(i) / 2.2);
    const m = new THREE.Mesh(g, mats.stoneFloor); m.receiveShadow = true; root.add(m);
  }
  for (let z = C.z2 + 0.9; z < SPAWN.z + 3; z += 0.95) {
    for (const sx of [-1, 1]) {
      if (rng() < 0.12) continue;
      const w = 0.95 + rng() * 0.35, d = 0.7 + rng() * 0.2, x = sx * 0.62 + (rng() - 0.5) * 0.16;
      batch.add(mats.stoneFloor, xf(boxGeo(w, 0.1, d, 0, 0, 0, 1.6), { p: [x, terrainHeight(x, z) + 0.0, z], r: [(rng() - 0.5) * 0.05, (rng() - 0.5) * 0.14, (rng() - 0.5) * 0.05] }));
    }
  }
  for (const z of [13, 3]) for (const sx of [-1, 1]) stoneLantern(ctx, sx * 3.9, z, 0);

  // 天公爐
  batch.add(mats.bronze, xf(incenseBurnerGeo(1.7), { p: [0, 0.02, 8] }));
  world.circle(0, 8, 1.1, 0, 3);
  ctx.incense(0, 2.0, 8, false, 14);

  // 古井
  {
    const x = -19, z = 11;
    const ring = new THREE.LatheGeometry([[0.72, 0], [0.98, 0], [1.0, 0.8], [0.94, 0.88], [0.74, 0.88], [0.72, 0]].map(([r, y]) => new THREE.Vector2(r, y)), 20);
    batch.add(mats.rock, xf(ring, { p: [x, 0, z] }));
    batch.add(mats.black, xf(new THREE.CircleGeometry(0.74, 20), { r: [-Math.PI / 2, 0, 0], p: [x, 0.25, z] }));
    for (let k = 0; k < 4; k++) batch.add(mats.planks, xf(boxGeo(0.34, 0.05, 2.0, 0, 0, 0, 1), { p: [x - 0.9 + k * 0.36, 0.55 + k * 0.012, z + 1.25], r: [0.62, 0.15, 0] }));
    world.circle(x, z, 1.05, 0, 2);
    ctx.model('wooden_bucket_01', { p: [x + 1.5, 0.02, z - 0.5], s: 1.4, r: [0, 1, 0] });
  }

  // 掛滿紅布條的老枯樹
  {
    const x = 14, z = 9;
    const tree = new THREE.Mesh(makeTreeGeometry(77, { height: 12, trunkR: 0.5 }), mats.bark);
    tree.position.set(x, 0, z); tree.castShadow = true; tree.receiveShadow = true;
    root.add(tree);
    world.circle(x, z, 0.6, 0, 6);
    for (let k = 0; k < 16; k++) {
      const a = rng() * 6.28, r = 1.2 + rng() * 3.2;
      ctx.banner(x + Math.cos(a) * r, 3.2 + rng() * 2.6, z + Math.sin(a) * r, 0.09, 0.7 + rng() * 0.9, rng() * 3, ctx.mats.cloth);
    }
  }

  // 廟後成排的金斗甕
  const urnM = [];
  for (let k = 0; k < 18; k++) {
    const x = -24 + k * 1.3 + (rng() - 0.5) * 0.4, z = C.z1 + t + 0.5 + rng() * 0.4;
    if (rng() < 0.2) urnM.push(matrixOf(x, 0.3, z + 0.7, 0, rng() * 6, Math.PI / 2, 1.6));
    else { urnM.push(matrixOf(x, 0.02, z, 0, rng() * 6, 0, 1.6)); world.circle(x, z, 0.28, 0, 1); }
  }
  const urns = new THREE.InstancedMesh(urnGeo(16), mats.urn, urnM.length);
  urnM.forEach((m, i) => urns.setMatrixAt(i, m));
  urns.castShadow = true; urns.receiveShadow = true; urns.computeBoundingSphere(); root.add(urns);

  // 雜物
  lite(ctx.model('tree_stump_01', { p: [22, 0.12, -1], s: 1.3 }), 26);
  world.circle(22, -1, 0.8, 0, 1.2);
  lite(ctx.model('dead_tree_trunk_02', { p: [-22, 0.3, 17], r: [0, 0.5, 0], s: 1.5 }), 44);
  world.line(-24.6, 18.5, -19.4, 15.6, 0.55, 0, 1.5);

  // ── 缺口外的小土地公祠（裡面的神像同樣被矇眼）──
  {
    const x = -36.5, z = 6.5, y = terrainHeight(x, z) - 0.05;
    batch.span(mats.stoneWall, x - 1.0, y - 0.6, z - 0.9, x + 1.0, y + 0.45, z + 0.9, 1.8);
    batch.span(mats.plaster, x - 0.9, y + 0.45, z - 0.8, x - 0.78, y + 1.75, z + 0.8, 1.8);
    batch.span(mats.plaster, x - 0.9, y + 0.45, z - 0.8, x + 0.8, y + 1.75, z - 0.68, 1.8);
    batch.span(mats.plaster, x - 0.9, y + 0.45, z + 0.68, x + 0.8, y + 1.75, z + 0.8, 1.8);
    const r = gableRoof({ x1: x - 1.4, x2: x + 1.5, zc: z, halfD: 1.25, eaveY: y + 1.72, rise: 0.75, lift: 0.3 });
    for (const g of r.slopes) batch.add(mats.roof, g);
    batch.add(mats.ridge, new THREE.TubeGeometry(r.ridge, 20, 0.09, 6));
    const st = buddha.make({ scale: 0.5, style: 'stone', headPitch: 0.1 });
    st.position.set(x - 0.25, y + 0.45, z); st.rotation.y = Math.PI / 2; root.add(st);
    ctx.candle(x + 0.55, y + 0.45, z - 0.35, { lit: false, holder: false, h: 0.09 });
    ctx.candle(x + 0.55, y + 0.45, z + 0.35, { lit: false, holder: false, h: 0.13 });
    ctx.talisman(x + 0.81, y + 1.25, z - 0.74, Math.PI / 2, 0.1);
    world.box(x - 1.0, z - 0.9, x + 1.0, z + 0.9, y - 2, y + 3);
  }
}

function headstoneGeo(kind) {
  const s = new THREE.Shape();
  if (kind === 0) { s.moveTo(-0.26, 0); s.lineTo(-0.26, 0.66); s.absarc(0, 0.66, 0.26, Math.PI, 0, true); s.lineTo(0.26, 0); }
  else if (kind === 1) { s.moveTo(-0.3, 0); s.lineTo(-0.3, 0.7); s.lineTo(-0.2, 0.82); s.lineTo(0.2, 0.82); s.lineTo(0.3, 0.7); s.lineTo(0.3, 0); }
  else { s.moveTo(-0.22, 0); s.lineTo(-0.24, 0.8); s.lineTo(0, 1.02); s.lineTo(0.24, 0.8); s.lineTo(0.22, 0); }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.13, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 1, curveSegments: 8 });
  g.translate(0, -0.12, -0.065);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.9, uv.getY(i) * 0.9);
  return g;
}

export function buildGraveyard(ctx) {
  const { batch, world, mats, rng, root } = ctx;
  const col = new THREE.Color();

  // ── 墓碑、土墳、刻字 ──
  const stones = [], mounds = [], texts = [[], [], [], []], used = [];
  const free = (x, z, d) => used.every((u) => (u[0] - x) ** 2 + (u[1] - z) ** 2 > d * d);
  const reserved = [[PIT.x, PIT.z, 4.5], [-36.5, 6.5, 3], [-46, -16, 5.5], [-60, 22, 5.5], [-68, -6, 5.5]];
  let tries = 0;
  while (stones.length < 150 && tries++ < 5000) {
    const x = G.x1 + 1 + rng() * (G.x2 - G.x1 - 2), z = G.z1 + 1 + rng() * (G.z2 - G.z1 - 2);
    if (!free(x, z, 1.9)) continue;
    if (reserved.some((r) => (r[0] - x) ** 2 + (r[1] - z) ** 2 < r[2] * r[2])) continue;
    if (x > -41 && Math.abs(z) < 3.5) continue;
    used.push([x, z]);
    const y = terrainHeight(x, z);
    const yaw = Math.PI / 2 + (rng() - 0.5) * 1.1;
    const fallen = rng() < 0.1;
    const rx = fallen ? -(1.2 + rng() * 0.3) : (rng() - 0.5) * 0.4, rz = (rng() - 0.5) * 0.35;
    const s = 0.8 + rng() * 0.6;
    const m = matrixOf(x, y + (fallen ? 0.12 : -rng() * 0.2), z, rx, yaw, rz, s);
    const v = Math.floor(rng() * 3);
    stones.push({ x, z, v, m, color: new THREE.Color().setScalar(0.5 + rng() * 0.5) });
    if (!fallen) world.circle(x, z, 0.3 * s, y - 2, y + 1.5);
    if (rng() < 0.55) texts[Math.floor(rng() * 4)].push({ x, z, v: 0, m: m.clone().multiply(matrixOf(0, 0.36, 0.085, 0, 0, 0, 1)) });
    if (rng() < 0.7) {
      const bx = x - Math.sin(yaw) * 1.5 * s, bz = z - Math.cos(yaw) * 1.5 * s;
      mounds.push({ x: bx, z: bz, v: 0, m: matrixOf(bx, terrainHeight(bx, bz) - 0.12, bz, 0, yaw, 0, (0.75 + rng() * 0.4) * s, (0.38 + rng() * 0.3) * s, (1.2 + rng() * 0.5) * s) });
    }
  }
  addInstancedBuckets(root, [0, 1, 2].map((k) => ({ geometry: headstoneGeo(k), material: mats.grave })), stones, { cell: 30 });
  const moundGeo = new THREE.SphereGeometry(1, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2);
  { const uv = moundGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i)); }
  addInstancedBuckets(root, [{ geometry: moundGeo, material: mats.mound }], mounds, { cell: 30, cast: false });
  texts.forEach((list, k) => {
    if (!list.length) return;
    const mat = new THREE.MeshStandardMaterial({ map: tombTextTexture(k + 1), transparent: true, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    addInstancedBuckets(root, [{ geometry: new THREE.PlaneGeometry(0.3, 0.6), material: mat }], list, { cell: 200, cast: false, receive: false });
  });

  // ── 無名木牌 ──
  const markers = [];
  for (let k = 0; k < 46; k++) {
    const x = G.x1 + 2 + rng() * (G.x2 - G.x1 - 4), z = G.z1 + 2 + rng() * (G.z2 - G.z1 - 4);
    if (!free(x, z, 1.1)) continue;
    markers.push({ x, z, v: 0, m: matrixOf(x, terrainHeight(x, z) + 0.3, z, (rng() - 0.5) * 0.5, Math.PI / 2 + (rng() - 0.5), (rng() - 0.5) * 0.5, 1, 0.7 + rng() * 0.6, 1) });
  }
  addInstancedBuckets(root, [{ geometry: boxGeo(0.14, 1.15, 0.03, 0, 0, 0, 0.8), material: mats.planks }], markers, { cell: 200 });

  // ── 龜甲墓 ──
  for (const [cx, cz] of [[-46, -16], [-60, 22], [-68, -6]]) {
    const y = terrainHeight(cx, cz), R = 2.5;
    for (let i = 0; i <= 14; i++) {
      const a = (50 + (260 * i) / 14) * (Math.PI / 180);
      const h = 0.45 + 0.55 * (0.5 - 0.5 * Math.cos(a));
      const x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R;
      batch.add(mats.grave, xf(boxGeo(0.85, h + 0.8, 0.3, 0, 0, 0, 1.4), { p: [x, terrainHeight(x, z) + h / 2 - 0.4, z], r: [0, Math.PI / 2 - a, 0] }));
      world.circle(x, z, 0.36, y - 3, y + 2);
    }
    batch.add(mats.mound, xf(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), { p: [cx - 0.3, y - 0.2, cz], s: [1.8, 1.05, 1.8] }));
    world.circle(cx - 0.3, cz, 1.4, y - 3, y + 2);
    batch.add(mats.grave, xf(headstoneGeo(1), { p: [cx + 1.75, y - 0.05, cz], r: [0, Math.PI / 2, 0], s: 1.6 }));
    batch.add(mats.grave, xf(boxGeo(0.7, 0.3, 1.5, 0, 0, 0, 1.4), { p: [cx + 2.35, terrainHeight(cx + 2.35, cz) + 0.08, cz] }));
    world.circle(cx + 1.75, cz, 0.5, y - 3, y + 2);
    ctx.incense(cx + 2.35, terrainHeight(cx + 2.35, cz) + 0.23, cz, false, 5);
  }

  // ── 塌陷的墳與外露的棺木 ──
  {
    const y = terrainHeight(PIT.x, PIT.z);
    const tr = { p: [PIT.x, y + 0.22, PIT.z], r: [0.1, 0.25, -0.07] };
    const coffin = [
      boxGeo(0.7, 0.05, 2.0, 0, -0.2, 0, 1), boxGeo(0.05, 0.42, 2.0, -0.33, 0, 0, 1), boxGeo(0.05, 0.42, 2.0, 0.33, 0, 0, 1),
      boxGeo(0.7, 0.42, 0.05, 0, 0, -0.98, 1), boxGeo(0.7, 0.42, 0.05, 0, 0, 0.98, 1),
    ];
    for (const g of coffin) batch.add(mats.cabinet, xf(g, tr));
    batch.add(mats.black, xf(boxGeo(0.6, 0.02, 1.9, 0, -0.16, 0), tr));
    batch.add(mats.cabinet, xf(boxGeo(0.74, 0.05, 2.04, 0, 0, 0, 1), { p: [PIT.x + 0.75, y + 0.42, PIT.z + 0.3], r: [0.1, 0.5, -0.75] }));
    batch.add(mats.mound, xf(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), { p: [PIT.x - 2.6, terrainHeight(PIT.x - 2.6, PIT.z + 1) - 0.1, PIT.z + 1], s: [1.4, 0.8, 2.0] }));
    for (let k = 0; k < 3; k++) ctx.talisman(PIT.x - 0.2 + k * 0.2, y + 0.45, PIT.z - 0.6 + k * 0.5, 0.25, 1.4 + k * 0.3, -Math.PI / 2 + 0.1);
  }

  // ── 散落的金斗甕 ──
  const urnM = [];
  for (let k = 0; k < 14; k++) {
    const x = G.x1 + 4 + rng() * (G.x2 - G.x1 - 8), z = G.z1 + 4 + rng() * (G.z2 - G.z1 - 8);
    if (!free(x, z, 1.0)) continue;
    const y = terrainHeight(x, z);
    if (rng() < 0.4) urnM.push(matrixOf(x, y + 0.24, z, 0, rng() * 6, Math.PI / 2 + 0.2, 1.6));
    else { urnM.push(matrixOf(x, y - 0.06, z, (rng() - 0.5) * 0.3, rng() * 6, 0, 1.6)); world.circle(x, z, 0.28, y - 2, y + 1); }
  }
  const urns = new THREE.InstancedMesh(urnGeo(14), mats.urn, urnM.length);
  urnM.forEach((m, i) => urns.setMatrixAt(i, m));
  urns.castShadow = true; urns.receiveShadow = true; urns.computeBoundingSphere(); root.add(urns);

  // ── 滿地冥紙 ──
  const paper = [];
  const paperGeo = new THREE.PlaneGeometry(0.11, 0.08).rotateX(-Math.PI / 2);
  for (let k = 0; k < 620; k++) {
    let x, z;
    const r = rng();
    if (r < 0.62) { x = G.x1 + rng() * (G.x2 - G.x1 + 6); z = G.z1 + rng() * (G.z2 - G.z1); }
    else if (r < 0.85) { x = C.x1 + 1 + rng() * (C.x2 - C.x1 - 2); z = P.z2 + 0.5 + rng() * (C.z2 - P.z2 - 1.5); }
    else { x = (rng() - 0.5) * 9; z = C.z2 + 1 + rng() * 28; }
    paper.push({ x, z, v: 0, m: matrixOf(x, ctx.groundAt(x, z) + 0.012 + rng() * 0.012, z, (rng() - 0.5) * 0.3, rng() * 6.28, (rng() - 0.5) * 0.3) });
  }
  addInstancedBuckets(root, [{ geometry: paperGeo, material: new THREE.MeshStandardMaterial({ map: paperMoneyTexture(), roughness: 0.85, side: THREE.DoubleSide }) }], paper, { cell: 40, cast: false });

  // ── 鬼火 ──
  const glow = glowTexture();
  for (const [x, z, r] of [[-52, -4, 5], [-64, 12, 7], [-44, 24, 5]]) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: new THREE.Color(0.5, 1.6, 1.1), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    sp.scale.setScalar(0.55);
    root.add(sp);
    const light = ctx.addLight({ p: [x, 1, z], color: 0x5dffb0, intensity: 2.2, distance: 11, floor: -1, flicker: 0 });
    ctx.wisps.push({ sprite: sp, light, cx: x, cz: z, r, speed: 0.12 + rng() * 0.1, phase: rng() * 6 });
  }
}

/** 草叢、蕨類、石塊等自然物（公開模型實例化） */
export function buildNature(ctx) {
  const { root, rng, assets, world } = ctx;
  const inRect = (x, z, r, m = 0) => x > r.x1 - m && x < r.x2 + m && z > r.z1 - m && z < r.z2 + m;
  const outdoorSpot = () => {
    for (let i = 0; i < 40; i++) {
      const x = B.x1 + rng() * (B.x2 - B.x1), z = B.z1 + rng() * (B.z2 - B.z1);
      if (inRect(x, z, C, 0.8)) continue;
      if (Math.abs(x) < 1.6 && z > C.z2) continue;
      return [x, z];
    }
    return [B.x1 + 5, B.z1 + 5];
  };
  // 草叢
  const grassV = modelVariants(assets.model('grass_medium_01')).slice(0, 12);
  // 三種「large」草叢各有五、六千個三角形，佔了全部草的七成：改用放大的「mid」草叢頂替（變體數量不變，亂數序列不受影響）
  {
    const tris = (v) => (v.geometry.index ? v.geometry.index.count : v.geometry.attributes.position.count) / 3;
    const mids = grassV.filter((v) => tris(v) > 1000 && tris(v) < 3000);
    if (mids.length) grassV.forEach((v, i) => {
      if (tris(v) < 4000) return;
      const m = mids[i % mids.length];
      grassV[i] = { geometry: m.geometry, material: m.material, local: m.local.clone().premultiply(new THREE.Matrix4().makeScale(1.45, 1, 1.45)) };
    });
  }
  const grass = [];
  const addGrass = (x, z, s) => grass.push({ x, z, v: Math.floor(rng() * grassV.length), m: matrixOf(x, ctx.groundAt(x, z) - 0.03, z, 0, rng() * 6.28, 0, s, s * (0.8 + rng() * 0.6), s) });
  for (let k = 0; k < 200; k++) {
    const [x, z] = outdoorSpot();
    for (let j = 0; j < 3; j++) addGrass(x + (rng() - 0.5) * 1.4, z + (rng() - 0.5) * 1.4, 1.6 + rng() * 1.4);
  }
  // 廟埕石縫與牆腳
  for (let k = 0; k < 110; k++) {
    const side = Math.floor(rng() * 4);
    let x, z;
    if (side === 0) { x = C.x1 + 0.9 + rng() * 0.8; z = C.z1 + rng() * (C.z2 - C.z1); }
    else if (side === 1) { x = C.x2 - 0.9 - rng() * 0.8; z = C.z1 + rng() * (C.z2 - C.z1); }
    else if (side === 2) { x = C.x1 + rng() * (C.x2 - C.x1); z = C.z2 - 0.9 - rng() * 0.8; }
    else { x = C.x1 + 2 + rng() * (C.x2 - C.x1 - 4); z = P.z2 + 1 + rng() * (C.z2 - P.z2 - 3); if (Math.abs(x) < 3) continue; }
    if (inRect(x, z, P, 0.3)) continue;
    addGrass(x, z, 1.3 + rng() * 1.2);
  }
  addInstancedBuckets(root, grassV, grass, { cell: 30, cast: false });

  // 蕨類
  const fernV = modelVariants(assets.model('fern_02'));
  // 原始貼圖是盛夏的鮮綠，手電筒一照像塑膠盆栽；壓成入冬、缺光的暗綠褐色
  const fernMats = new Map();
  for (const v of fernV) {
    if (!fernMats.has(v.material)) { const m = v.material.clone(); m.color.setRGB(0.42, 0.4, 0.3); m.roughness = 0.95; fernMats.set(v.material, m); }
    v.material = fernMats.get(v.material);
  }
  const ferns = [];
  for (let k = 0; k < 90; k++) {
    const [x, z] = outdoorSpot();
    const s = 1.1 + rng() * 1.2;
    ferns.push({ x, z, v: Math.floor(rng() * fernV.length), m: matrixOf(x, terrainHeight(x, z) - 0.02, z, 0, rng() * 6.28, 0, s) });
  }
  addInstancedBuckets(root, fernV, ferns, { cell: 40, cast: false });

  // 長滿青苔的石塊
  const rockV = modelVariants(assets.model('rock_moss_set_01'));
  for (const v of rockV) v.geometry = decimate(v.geometry, 16); // 每顆一萬面降到一千面上下
  const rocks = [];
  for (let k = 0; k < 30; k++) {
    const [x, z] = outdoorSpot();
    const s = 0.5 + rng() * 0.9;
    rocks.push({ x, z, v: Math.floor(rng() * rockV.length), m: matrixOf(x, terrainHeight(x, z) - 0.18 * s, z, 0, rng() * 6.28, 0, s) });
    world.circle(x, z, 0.5 * s, -50, 50);
  }
  addInstancedBuckets(root, rockV, rocks, { cell: 40 });

  // 巨石、樹樁、倒木
  for (const [x, z, s, ry] of [[-41, -24, 1.6, 0.4], [9, 31, 1.3, 2]]) {
    lite(ctx.model('boulder_01', { p: [x, terrainHeight(x, z) - 0.15, z], s, r: [0, ry, 0] }), 34);
    world.circle(x, z, 0.8 * s, -50, 50);
  }
  for (const [x, z] of [[-55, -22], [-7, 33]]) {
    lite(ctx.model('tree_stump_01', { p: [x, terrainHeight(x, z) + 0.1, z], s: 1.4, r: [0, rng() * 6, 0] }), 26);
    world.circle(x, z, 0.85, -50, 50);
  }
  {
    const x = -57, z = 3;
    lite(ctx.model('dead_tree_trunk_02', { p: [x, terrainHeight(x, z) + 0.3, z], s: 1.5, r: [0, 1.9, 0] }), 44);
    world.line(x + Math.cos(1.9) * 2.8, z - Math.sin(1.9) * 2.8, x - Math.cos(1.9) * 2.8, z + Math.sin(1.9) * 2.8, 0.55, -50, 50);
  }
  for (let k = 0; k < 10; k++) {
    const [x, z] = outdoorSpot();
    ctx.model('dry_branches_medium_01', { p: [x, terrainHeight(x, z) + 0.12, z], s: 1.6 + rng(), r: [0, rng() * 6, 0], cast: false });
  }
}

/** 貼地流動的霧氣（會被手電筒照亮） */
export function buildFog(ctx) {
  const { root, rng } = ctx;
  const mat = new THREE.MeshLambertMaterial({ map: smokeTexture(), transparent: true, opacity: 0.3, depthWrite: false, color: 0x39424f, emissive: 0x06080c, side: THREE.DoubleSide });
  const geo = new THREE.PlaneGeometry(1, 1);
  const puffs = [];
  for (let k = 0; k < 64; k++) {
    let x, z;
    if (k < 40) { x = G.x1 + rng() * (G.x2 - G.x1 + 8); z = G.z1 + rng() * (G.z2 - G.z1); }
    else if (k < 54) { x = C.x1 + 3 + rng() * (C.x2 - C.x1 - 6); z = P.z2 + 3 + rng() * (C.z2 - P.z2 - 5); }
    else { x = (rng() - 0.5) * 24; z = C.z2 + 3 + rng() * 26; }
    const m = new THREE.Mesh(geo, mat.clone());
    const s = 9 + rng() * 9;
    m.scale.set(s, s * 0.3, 1);
    m.position.set(x, ctx.groundAt(x, z) + s * 0.1, z);
    m.renderOrder = 5;
    root.add(m);
    puffs.push({ m, x, z, drift: 0.12 + rng() * 0.25, phase: rng() * 6, span: 6 + rng() * 6 });
  }
  // 場景美術的收尾（風化疊層、火場痕跡、陳設、蛛網、落葉）。放在這裡是因為它排在所有
  // 會消耗共用亂數的建構步驟之後、batch.build 之前；dressing 自己用獨立的亂數序列。
  buildDressing(ctx);
  return puffs;
}
