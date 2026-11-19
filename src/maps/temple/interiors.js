import * as THREE from 'three';
import { FLOORS, WALL_T as T } from './layout.js';
import { COLS } from './building.js';
import { boxGeo, xf, matrixOf, cylinderBetween, merge, mulberry32 } from '../../core/utils.js';
import { plaqueTexture, wallWritingTexture, sutraTexture, tabletAtlas } from '../../core/canvasTex.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const lathe = (pts, seg = 20) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

/** 三足銅香爐 */
function incenseBurnerGeo(scale = 1) {
  const parts = [
    lathe([[0, 0.42], [0.3, 0.42], [0.52, 0.55], [0.62, 0.8], [0.6, 1.0], [0.5, 1.08], [0.56, 1.14], [0.6, 1.2], [0.5, 1.2], [0.46, 1.12], [0, 1.1]], 24),
  ];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    parts.push(cylinderBetween(V(Math.cos(a) * 0.42, 0.55, Math.sin(a) * 0.42), V(Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5), 0.09, 0.06, 8));
  }
  for (const sx of [-1, 1]) parts.push(xf(new THREE.TorusGeometry(0.16, 0.035, 6, 14, Math.PI), { p: [sx * 0.6, 1.14, 0], r: [0, Math.PI / 2, 0] }));
  const g = merge(parts);
  g.scale(scale, scale, scale);
  return g;
}

/** 銅鐘 */
function bellGeo() {
  return merge([
    lathe([[0, 1.25], [0.2, 1.24], [0.4, 1.1], [0.5, 0.8], [0.54, 0.3], [0.6, 0.05], [0.63, 0], [0.56, 0], [0.5, 0.3], [0.44, 0.9], [0, 1.1]], 24),
    xf(new THREE.TorusGeometry(0.12, 0.035, 6, 12), { p: [0, 1.36, 0] }),
  ]);
}

/** 骨灰甕 */
export function urnGeo(seg = 12) {
  return merge([
    lathe([[0, 0], [0.11, 0], [0.16, 0.08], [0.17, 0.22], [0.13, 0.33], [0.1, 0.35], [0, 0.35]], seg),
    lathe([[0, 0.35], [0.12, 0.35], [0.11, 0.39], [0.04, 0.42], [0.035, 0.46], [0, 0.47]], seg),
  ]);
}

function woodTable(ctx, x, y, z, w, d, h, ry = 0) {
  const { batch, mats, world } = ctx;
  const parts = [boxGeo(w, 0.08, d, 0, h - 0.04, 0, 1.2), boxGeo(w - 0.2, 0.12, d - 0.2, 0, h - 0.14, 0, 1.2)];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(boxGeo(0.09, h - 0.08, 0.09, sx * (w / 2 - 0.1), (h - 0.08) / 2, sz * (d / 2 - 0.1), 1.2));
  for (const g of parts) batch.add(mats.woodDark, xf(g, { p: [x, y, z], r: [0, ry, 0] }));
  const hw = (Math.abs(Math.cos(ry)) * w + Math.abs(Math.sin(ry)) * d) / 2, hd = (Math.abs(Math.sin(ry)) * w + Math.abs(Math.cos(ry)) * d) / 2;
  world.box(x - hw, z - hd, x + hw, z + hd, y, y + h + 0.3);
  return y + h;
}

function decal(ctx, tex, w, h, x, y, z, ry, { opacity = 1, repeat = null, rx = 0 } = {}) {
  if (repeat) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(repeat[0], repeat[1]); }
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({ map: tex, transparent: true, opacity, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  );
  m.position.set(x, y, z); m.rotation.set(rx, ry, 0, 'YXZ');
  m.receiveShadow = true;
  ctx.root.add(m);
  return m;
}

function drape(ctx, x1, x2, yTop, h, z, { scallops = 0, fold = 0.07, gather = 0 } = {}) {
  const w = x2 - x1;
  const m = ctx.cloth.make({width:w,height:h,material:ctx.mats.clothDark,seed:Math.round(x1*923+z*277)>>>0,scallops,fold,gather,exposure:.6});
  m.position.set((x1 + x2) / 2, yTop, z);
  ctx.root.add(m);
  return m;
}

/** 朝向某點時頭部要轉的角度 */
function headYawTo(x, z, bodyYaw, tx, tz, limit = 1.15) {
  let d = Math.atan2(tx - x, tz - z) - bodyYaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.max(-limit, Math.min(limit, d));
}

function place(ctx, statue, x, y, z, ry, collideR) {
  statue.position.set(x, y, z);
  statue.rotation.y = ry;
  ctx.root.add(statue);
  if (collideR) ctx.world.circle(x, z, collideR, y - 1, y + 4);
  return statue;
}

// ───────────────────────── 一樓：大雄寶殿 ─────────────────────────
function floor1(ctx) {
  const { batch, mats, world, rng, buddha } = ctx;
  const F = FLOORS[0], y = F.y;

  // 佛壇
  batch.span(mats.stoneWall, -9, y, -33.6, 9, y + 0.6, -29.6, 2.2);
  batch.span(mats.stoneWall, -4, y, -29.6, 4, y + 0.3, -29.15, 2.2);
  world.box(-9, -33.6, 9, -29.15, y, y + 4);
  batch.span(mats.rock, -1.9, y + 0.6, -33.2, 1.9, y + 1.3, -30.1, 1.5);
  place(ctx, buddha.make({ scale: 1.75, style: 'gold', halo: true }), 0, y + 1.3, -31.7, 0);
  for (const sx of [-1, 1]) {
    batch.span(mats.rock, sx * 5.6 - 1.2, y + 0.6, -33.0, sx * 5.6 + 1.2, y + 1.0, -30.6, 1.5);
    place(ctx, buddha.make({ scale: 1.3, style: 'gold', halo: true, headYaw: -sx * 0.12 }), sx * 5.6, y + 1.0, -31.8, 0);
  }
  // 佛壇上的符咒
  for (let k = 0; k < 10; k++) ctx.talisman((k % 2 ? 1 : -1) * (4.4 + rng() * 4.3), y + 0.3, -29.588, 0, (rng() - 0.5) * 0.4);
  for (let k = 0; k < 4; k++) ctx.talisman(-1.5 + rng() * 3, y + 0.95, -30.088, 0, (rng() - 0.5) * 0.4);

  // 布幔
  drape(ctx, -9.3, 9.3, F.y + F.h - 0.75, 1.2, -29.35, { scallops: 6 });
  for (const sx of [-1, 1]) drape(ctx, sx * 8.6 - 1.1, sx * 8.6 + 1.1, F.y + F.h - 0.8, 4.3, -29.3, { fold: 0.12, gather: 0.55 });

  // 供桌與供品
  ctx.model('chinese_console_table', { p: [0, y, -27.9], s: [2.1, 1.65, 2.0] });
  world.box(-1.85, -28.3, 1.85, -27.5, y, y + 1.4);
  const ty = y + 0.66 * 1.65;
  ctx.model('brass_pot_01', { p: [0, ty, -27.9], s: 1.6 });
  ctx.incense(0, ty + 0.4, -27.9, true);
  ctx.candle(-0.95, ty, -27.85, { lit: true });
  ctx.candle(0.95, ty, -27.85, { lit: true });
  for (const sx of [-1, 1]) {
    const vase = ctx.model('ceramic_vase_03', { p: [sx * 1.5, ty, -27.95], s: 1.4, r: [0, sx * 1.3, 0] });
    vase.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.setHex(0x6a665e); } });
  }
  ctx.redLamp(-0.45, ty, -27.75);
  ctx.redLamp(0.45, ty, -27.75);
  ctx.addLight({ p: [0, ty + 0.75, -27.4], color: 0xff9648, intensity: 6, distance: 18, floor: 0, flicker: 1 });
  ctx.addLight({ p: [0, y + 1.9, -29.6], color: 0xff1c0c, intensity: 5, distance: 11, floor: 0, flicker: 0.3 });

  // 大香爐與蒲團
  batch.add(mats.bronze, xf(incenseBurnerGeo(1.15), { p: [0, y, -25.6] }));
  world.circle(0, -25.6, 0.75, y, y + 2);
  ctx.incense(0, y + 1.3, -25.6, false, 9);
  for (const x of [-3.2, -1.6, 0, 1.6, 3.2]) {
    const g = new THREE.CylinderGeometry(0.36, 0.38, 0.14, 18);
    batch.add(mats.cushion, xf(g, { p: [x + (rng() - 0.5) * 0.2, y + 0.07, -23.6 + (rng() - 0.5) * 0.3], s: [1, 1, 0.9] }));
  }

  // 羅漢像：東牆與北牆，頭全部轉向大門
  const door = [0, -12.5];
  const styles = ['wood', 'bronze', 'stone'];
  let si = 0;
  const arhat = (x, z, ry, by) => {
    const st = buddha.make({ scale: 0.7, style: styles[si++ % 3], headYaw: headYawTo(x, z, ry, door[0], door[1]), headPitch: 0.06 });
    place(ctx, st, x, by, z, ry);
  };
  batch.span(mats.stoneWall, 18.25, y, -32.3, 19.6, y + 0.75, -14.0, 2.2);
  world.box(18.25, -32.3, 19.6, -14.0, y, y + 3);
  for (let k = 0; k < 8; k++) arhat(18.92, -31.2 + k * 2.3, -Math.PI / 2, y + 0.75);
  for (const sx of [-1, 1]) {
    const xa = sx * 10.2, xb = sx * 17.9;
    batch.span(mats.stoneWall, Math.min(xa, xb), y, -33.6, Math.max(xa, xb), y + 0.75, -32.25, 2.2);
    world.box(Math.min(xa, xb), -33.6, Math.max(xa, xb), -32.25, y, y + 3);
    for (let k = 0; k < 4; k++) arhat(sx * (11.1 + k * 2.1), -32.92, 0, y + 0.75);
  }

  // 西牆血字（上樓梯時會看到）
  decal(ctx, wallWritingTexture(['不要看', '祂的眼睛'], { seed: 4 }), 6.4, 3.2, F.x1 + T + 0.012, y + 2.9, -22, Math.PI / 2, { opacity: 0.92 });

  // 功德箱
  batch.span(mats.woodDark, 3.1, y, -15.4, 4.1, y + 0.85, -14.7, 1.2);
  world.box(3.1, -15.4, 4.1, -14.7, y, y + 1.2);
  {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.36), new THREE.MeshStandardMaterial({ map: plaqueTexture('功德箱', { w: 512, h: 230, seed: 12 }), roughness: 0.8 }));
    m.position.set(3.6, y + 0.5, -14.69); ctx.root.add(m);
  }

  // Entrance offering-lamp cabinet: grounded stone base, incense and votive lamps.
  {
    const cx=13.6,cz=-15.4;
    batch.box(mats.rock,2.4,.18,1.3,cx,y+.09,cz);world.box(cx-1.2,cz-.65,cx+1.2,cz+.65,y,y+.18);
    const top=woodTable(ctx,cx,y+.18,cz,1.95,.9,.9);
    batch.box(mats.woodDark,1.9,1.55,.09,cx,top+.72,cz-.4);
    for(const s of [-1,1]){batch.box(mats.woodRed,.095,1.55,.72,cx+s*.93,top+.72,cz-.07);batch.box(mats.bronze,.02,1.5,.025,cx+s*.82,top+.72,cz+.3);}
    batch.box(mats.woodDark,2.12,.12,.92,cx,top+1.49,cz-.03);
    const label=new THREE.Mesh(new THREE.PlaneGeometry(.78,.24),new THREE.MeshStandardMaterial({map:plaqueTexture('長 明 燈',{w:768,h:240,seed:43}),roughness:1}));
    label.position.set(cx,top+1.17,cz-.348);ctx.root.add(label);
    batch.add(mats.bronze,xf(incenseBurnerGeo(.32),{p:[cx,top,cz-.08]}));
    ctx.incense(cx,top+1.1*.32,cz-.08,false,5);
    for(const s of [-1,1]){ctx.candle(cx+s*.64,top,cz,{lit:s<0,h:s<0?.22:.11});ctx.redLamp(cx+s*.28,top,cz+.28);}
    for(let k=0;k<5;k++)ctx.talisman(cx-.61+k*.3,top+.73-(k%2)*.06,cz-.34,0,(k-2)*.025);
    ctx.addLight({p:[cx-.5,top+.55,cz+.18],color:0xe6a55a,intensity:3,distance:7,floor:0,flicker:.5});
  }
  // 銅鐘與鐘架
  {
    const cx = -12.6, cz = -15.4;
    for (const sx of [-1, 1]) batch.box(mats.woodDark, 0.16, 2.9, 0.16, cx + sx * 0.95, y + 1.45, cz, 1.2);
    batch.box(mats.woodDark, 2.3, 0.18, 0.2, cx, y + 2.9, cz, 1.2);
    batch.add(mats.bronze, xf(bellGeo(), { p: [cx, y + 1.15, cz] }));
    batch.add(mats.woodDark, cylinderBetween(V(cx, y + 2.9, cz), V(cx, y + 2.5, cz), 0.02));
    world.circle(cx, cz, 0.95, y, y + 3);
  }

  // 垂幡
  for (const x of [-3.3, 3.3]) for (const z of [-16.5, -20.5, -24.5]) ctx.banner(x, F.y + F.h - 0.7, z, 0.62, 2.6 + rng() * 1.2, (rng() - 0.5) * 0.4);

  // 柱上符咒
  for (const x of COLS[0].xs) for (const z of COLS[0].zs) {
    const n = 1 + Math.floor(rng() * 3);
    for (let k = 0; k < n; k++) {
      const a = rng() * Math.PI * 2;
      ctx.talisman(x + Math.sin(a) * 0.345, y + 1.1 + rng() * 1.5, z + Math.cos(a) * 0.345, a, (rng() - 0.5) * 0.3);
    }
  }

  // 雜物
  ctx.model('chinese_stool', { p: [-5.5, y + 0.26, -19.5], r: [Math.PI / 2, 0, 0.6] });
  ctx.model('chinese_stool', { p: [7.2, y, -24], r: [0, 0.8, 0] });
  world.circle(7.2, -24, 0.3, y, y + 0.9);
  ctx.model('wooden_bucket_01', { p: [-18.6, y, -13.3], s: 1.3 });
  ctx.model('wooden_lantern_01', { p: [1.2, y + 0.16, -10.6], r: [0, 0.5, 0], s: 1.2 });
  ctx.model('dry_branches_medium_01', { p: [-1.5, y + 0.14, -14.5], r: [0, 1.1, 0], s: 1.5 });
  ctx.model('dry_branches_medium_01', { p: [5.5, y + 0.14, -10.1], r: [0, 2.5, 0], s: 1.8 });
}

// ───────────────────────── 二樓：萬佛殿 ─────────────────────────
function floor2(ctx) {
  const { batch, mats, world, rng, buddha } = ctx;
  const F = FLOORS[1], y = F.y;

  // 北牆階梯式佛龕，數百尊小佛像
  const mats4 = [];
  const tiers = 5;
  for (let k = 0; k < tiers; k++) {
    const z2 = -30.0 - 0.3 * k, top = y + 0.5 + 0.42 * k;
    batch.span(mats.woodDark, -13, y, -31.6, 13, top, z2, 1.5);
    const zc = k === tiers - 1 ? -31.35 : z2 - 0.15;
    for (let x = -12.75; x <= 12.76; x += 0.44) {
      const r = rng();
      if (r < 0.05) continue;
      if (r < 0.09) mats4.push(matrixOf(x, top + 0.07, zc, 0, rng() * 6, Math.PI / 2, 0.36)); // 倒下
      else mats4.push(matrixOf(x + (rng() - 0.5) * 0.04, top, zc, 0, (rng() - 0.5) * 0.35, 0, 0.36));
    }
  }
  world.box(-13, -31.6, 13, -30.0, y, y + 4);
  // 掉落在地上的
  for (let k = 0; k < 16; k++) mats4.push(matrixOf(-12 + rng() * 24, y + 0.07, -29.6 + rng() * 2.4, 0, rng() * 6, Math.PI / 2, 0.36));
  ctx.root.add(buddha.makeTiny(mats4, 'gold'));

  // 中央主尊
  batch.span(mats.rock, -1.5, y, -27.0, 1.5, y + 0.6, -24.4, 1.5);
  world.box(-1.5, -27.0, 1.5, -24.4, y, y + 4);
  place(ctx, buddha.make({ scale: 1.5, style: 'bronze', halo: true, headPitch: 0.1 }), 0, y + 0.6, -25.75, 0);
  const ty = woodTable(ctx, 0, y, -23.3, 2.4, 0.75, 0.95);
  batch.add(mats.bronze, xf(incenseBurnerGeo(0.3), { p: [0, ty, -23.3] }));
  ctx.candle(-0.8, ty, -23.3, { lit: false });
  ctx.candle(0.8, ty, -23.3, { lit: false, h: 0.12 });
  ctx.redLamp(-0.35, ty, -23.15);
  ctx.redLamp(0.35, ty, -23.15);
  ctx.addLight({ p: [0, ty + 0.5, -22.8], color: 0xff200e, intensity: 5.5, distance: 13, floor: 1, flicker: 0.35 });

  // 滿天花板的燈籠（全熄）
  for (let x = -12; x <= 12.01; x += 4) for (const z of [-16.6, -20.4]) {
    ctx.lantern(x + (rng() - 0.5), F.y + F.h - 0.3, z + (rng() - 0.5), 0.5 + rng() * 1.3, false);
  }
  for (const x of [-7.5, 7.5]) for (const z of [-21, -26]) ctx.banner(x, F.y + F.h - 0.7, z, 0.6, 2.2 + rng(), (rng() - 0.5) * 0.5);

  for (const x of COLS[1].xs) for (const z of COLS[1].zs) {
    const a = rng() * Math.PI * 2;
    ctx.talisman(x + Math.sin(a) * 0.345, y + 1.2 + rng() * 1.2, z + Math.cos(a) * 0.345, a, (rng() - 0.5) * 0.3);
  }
  ctx.model('chinese_stool', { p: [-9, y, -17.2], r: [0, 0.3, 0] });
  ctx.model('chinese_stool', { p: [5, y + 0.26, -19], r: [Math.PI / 2, 0, 2.2] });
  ctx.model('wooden_bucket_01', { p: [16.3, y, -30.5], s: 1.3 });
}

// ───────────────────────── 三樓：地藏殿（納骨、牌位） ─────────────────────────
function floor3(ctx) {
  const { batch, mats, world, rng, buddha, root } = ctx;
  const F = FLOORS[2], y = F.y;

  // 納骨櫃
  const doorGeo = boxGeo(0.03, 0.4, 0.38, 0, 0, 0, 0.8);
  const doorM = [], openM = [], urnM = [];
  const z1 = -25.8, z2 = -18.2, H = 3.0;
  for (const cx of [-7.8, 0, 7.8]) {
    batch.span(mats.cabinet, cx - 0.36, y, z1, cx + 0.36, y + H, z2, 1.5);
    batch.span(mats.woodDark, cx - 0.42, y + H, z1 - 0.06, cx + 0.42, y + H + 0.1, z2 + 0.06, 1.5);
    world.box(cx - 0.4, z1, cx + 0.4, z2, y, y + H + 0.5);
    for (const s of [-1, 1]) {
      const fx = cx + s * 0.375;
      for (let iz = 0; iz < 18; iz++) for (let iy = 0; iy < 6; iy++) {
        const z = z1 + 0.22 + iz * 0.42, yy = y + 0.36 + iy * 0.45;
        const r = rng();
        if (r < 0.1) {
          openM.push(matrixOf(fx - s * 0.012, yy, z));
          if (r < 0.075) urnM.push(matrixOf(fx - s * 0.03, yy - 0.19, z, 0, rng() * 6, 0, 0.8));
          if (r < 0.04) doorM.push(matrixOf(fx + s * 0.19, yy, z - 0.19, 0, s * 1.35, 0)); // 門板半開
        } else doorM.push(matrixOf(fx, yy, z, 0, 0, (rng() - 0.5) * 0.02));
      }
    }
    ctx.talisman(cx, y + 1.6, z2 + 0.012, 0, 0.1);
    ctx.talisman(cx + 0.12, y + 1.9, z1 - 0.012, Math.PI, -0.2);
  }
  const doors = new THREE.InstancedMesh(doorGeo, mats.niche, doorM.length);
  const col = new THREE.Color();
  doorM.forEach((m, i) => { doors.setMatrixAt(i, m); doors.setColorAt(i, col.setScalar(0.55 + rng() * 0.45)); });
  doors.castShadow = true; doors.receiveShadow = true; doors.computeBoundingSphere(); root.add(doors);
  const holes = new THREE.InstancedMesh(boxGeo(0.01, 0.4, 0.38), new THREE.MeshBasicMaterial({ color: 0x000000 }), openM.length);
  openM.forEach((m, i) => holes.setMatrixAt(i, m)); holes.computeBoundingSphere(); root.add(holes);
  const urns = new THREE.InstancedMesh(urnGeo(10), mats.urn, urnM.length);
  urnM.forEach((m, i) => urns.setMatrixAt(i, m)); urns.computeBoundingSphere(); root.add(urns);

  // 地藏像
  batch.span(mats.rock, -14.5, y, -23.3, -12.2, y + 0.5, -20.7, 1.5);
  world.box(-14.6, -23.3, -12.2, -20.7, y, y + 4);
  place(ctx, buddha.make({ scale: 1.4, style: 'bronze', halo: true, headPitch: 0.12 }), -13.45, y + 0.5, -22, Math.PI / 2);
  batch.add(mats.brass, cylinderBetween(V(-12.6, y + 0.5, -21.0), V(-12.6, y + 3.6, -21.0), 0.03));
  for (let k = 0; k < 3; k++) batch.add(mats.brass, xf(new THREE.TorusGeometry(0.1, 0.012, 5, 14), { p: [-12.6, y + 3.35 - k * 0.04, -21.0 + (k - 1) * 0.07], r: [0, k, 0.3] }));
  const ty = woodTable(ctx, -11.3, y, -22, 0.7, 1.8, 0.9);
  ctx.redLamp(-11.3, ty, -22.4);
  ctx.redLamp(-11.3, ty, -21.6);
  ctx.candle(-11.3, ty, -22, { lit: false, h: 0.1 });
  ctx.addLight({ p: [-10.9, ty + 0.5, -22], color: 0xff200e, intensity: 5, distance: 12, floor: 2, flicker: 0.35 });

  // 西牆的牌位
  const atlas = tabletAtlas(8);
  const tabMat = new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.7 });
  const tabM = Array.from({ length: 8 }, () => []);
  for (const [za, zb] of [[-27.2, -23.8], [-20.2, -16.9]]) {
    for (let k = 0; k < 4; k++) {
      const x2 = -13.55 - 0.26 * k, top = y + 0.8 + 0.36 * k;
      batch.span(mats.woodDark, F.x1 + T, y, za, x2, top, zb, 1.5);
      for (let z = za + 0.12; z < zb - 0.1; z += 0.17) {
        const r = rng();
        if (r < 0.08) continue;
        const v = Math.floor(rng() * 8);
        if (r < 0.14) tabM[v].push(matrixOf(x2 - 0.12, top + 0.02, z, 0, Math.PI / 2 + rng(), Math.PI / 2 - 0.05));
        else tabM[v].push(matrixOf(x2 - 0.13, top + 0.15, z, 0, Math.PI / 2 + (rng() - 0.5) * 0.2, 0));
      }
    }
    world.box(F.x1 + T, za, -13.5, zb, y, y + 3);
  }
  tabM.forEach((list, v) => {
    if (!list.length) return;
    const g = new THREE.BoxGeometry(0.11, 0.3, 0.025);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, (v + uv.getX(i)) / 8);
    const im = new THREE.InstancedMesh(g, tabMat, list.length);
    list.forEach((m, i) => im.setMatrixAt(i, m));
    im.castShadow = true; im.computeBoundingSphere(); root.add(im);
  });

  // 南牆邊成排的金斗甕
  const bigUrns = [];
  for (let k = 0; k < 16; k++) {
    const x = -11 + k * 1.45 + (rng() - 0.5) * 0.5, z = -16.9 + rng() * 0.25;
    if (rng() < 0.2) bigUrns.push(matrixOf(x, y + 0.22, z + 0.5, 0, rng() * 6, Math.PI / 2, 1.45));
    else { bigUrns.push(matrixOf(x, y, z, 0, rng() * 6, 0, 1.45)); world.circle(x, z, 0.25, y, y + 0.8); }
  }
  const bu = new THREE.InstancedMesh(urnGeo(16), mats.urn, bigUrns.length);
  bigUrns.forEach((m, i) => bu.setMatrixAt(i, m));
  bu.castShadow = true; bu.receiveShadow = true; bu.computeBoundingSphere(); root.add(bu);

  for (const x of COLS[2].xs) for (const z of COLS[2].zs) {
    for (let k = 0; k < 2; k++) {
      const a = rng() * Math.PI * 2;
      ctx.talisman(x + Math.sin(a) * 0.345, y + 1.0 + rng() * 1.6, z + Math.cos(a) * 0.345, a, (rng() - 0.5) * 0.3);
    }
  }
  for (const x of [-3.9, 3.9]) ctx.banner(x, F.y + F.h - 0.7, -27, 0.6, 2.4, 0.2);
  ctx.model('chinese_stool', { p: [10.2, y, -28.6], r: [0, 1, 0] });
}

// ───────────────────────── 四樓：封印之間 ─────────────────────────
function floor4(ctx) {
  const { batch, mats, world, rng, buddha, root } = ctx;
  const F = FLOORS[3], y = F.y;
  const cx = 0, cz = (F.z1 + F.z2) / 2;

  batch.add(mats.rock, xf(new THREE.CylinderGeometry(1.25, 1.35, 0.5, 8), { p: [cx, y + 0.25, cz], r: [0, Math.PI / 8, 0] }));
  world.circle(cx, cz, 1.3, y, y + 4);
  const main = place(ctx, buddha.make({ scale: 1.45, style: 'gold', halo: true, headPitch: 0.16 }), cx, y + 0.5, cz, 0);
  // 纏繞的紅繩與貼滿的符咒
  {
    // 一圈一圈各自綁上去的舊繩：每圈高度、傾斜、鬆緊都不同，貼著佛身的外形，有幾圈已經鬆垮下滑
    const lr = mulberry32(417);
    const loop = (y0, tiltX, tiltZ, slack, r) => {
      const pts = [];
      const n = 36, ph = lr() * 6.28;
      for (let i = 0; i < n; i++) {
        const th = (i / n) * Math.PI * 2, sx = Math.sin(th), cz2 = Math.cos(th);
        const yy = y0 + sx * tiltZ + cz2 * tiltX - slack * Math.max(0, cz2) * Math.abs(cz2);
        const pr = buddha.profile(Math.max(0.05, Math.min(1.5, yy)));
        // 介於橢圓與方角之間的截面，避免繩子切進手臂與膝蓋
        const k = 1.1 + 0.05 * Math.sin(th * 5 + ph) + 0.12 * Math.pow(Math.abs(sx * cz2), 0.7);
        pts.push(V(sx * (pr.rx + 0.012) * k, yy + 0.008 * Math.sin(th * 7 + ph), pr.cz + cz2 * (pr.rz + 0.012) * k));
      }
      const rope = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 54, r, 5, true);
      batch.add(mats.cloth, xf(rope, { s: 1.45, p: [cx, y + 0.5, cz] }));
    };
    for (let i = 0; i < 9; i++) loop(0.62 + i * 0.085 + (lr() - 0.5) * 0.05, (lr() - 0.5) * 0.09, (lr() - 0.5) * 0.12, i % 4 === 1 ? 0.09 + lr() * 0.06 : lr() * 0.02, 0.0085 + lr() * 0.003);
    // 斷掉後垂下的兩截繩頭
    for (const sx of [-1, 1]) {
      const pr = buddha.profile(0.9), x0 = sx * pr.rx * 0.8, z0 = pr.cz + pr.rz * 0.75;
      const pts = [V(x0, 0.94, z0), V(x0 + sx * 0.05, 0.8, z0 + 0.06), V(x0 + sx * 0.07, 0.55, z0 + 0.09), V(x0 + sx * 0.06, 0.34, z0 + 0.1)];
      batch.add(mats.cloth, xf(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 14, 0.009, 5), { s: 1.45, p: [cx, y + 0.5, cz] }));
    }
  }
  for (let k = 0; k < 7; k++) {
    const a = -1.2 + rng() * 2.4;
    ctx.talisman(cx + Math.sin(a) * 0.62, y + 0.5 + (0.75 + rng() * 0.5) * 1.45, cz + Math.cos(a) * 0.46, a, (rng() - 0.5) * 0.5);
  }

  // 環繞的八尊佛像，以紅線繫向中央
  const styles = ['stone', 'wood', 'bronze'];
  const R = 2.75, sc = 0.72;
  const handC = V(cx, y + 0.5 + 0.62 * 1.45, cz + 0.42 * 1.45 * 0.4);
  for (let k = 0; k < 8; k++) {
    const a = (k + 0.5) * (Math.PI / 4);
    const x = cx + Math.sin(a) * R, z = cz + Math.cos(a) * R;
    place(ctx, buddha.make({ scale: sc, style: styles[k % 3], headPitch: 0.08 }), x, y, z, a + Math.PI, 0.58);
    const hand = V(x - Math.sin(a) * 0.3, y + 0.62 * sc, z - Math.cos(a) * 0.3);
    const mid = hand.clone().lerp(handC, 0.5); mid.y -= 0.12;
    batch.add(mats.thread, cylinderBetween(hand, mid, 0.006, 0.006, 4));
    batch.add(mats.thread, cylinderBetween(mid, handC, 0.006, 0.006, 4));
    batch.add(mats.brass, xf(new THREE.SphereGeometry(0.03, 8, 6), { p: [mid.x, mid.y - 0.03, mid.z] }));
    ctx.candle(x - Math.sin(a) * 0.8, y, z - Math.cos(a) * 0.8, { lit: k === 1 || k === 4 || k === 6, holder: false, h: 0.1 + rng() * 0.12 });
  }
  ctx.addLight({ p: [cx + 1.3, y + 0.55, cz + 1.5], color: 0xff9648, intensity: 6, distance: 13, floor: 3, flicker: 1 });
  ctx.addLight({ p: [cx - 1.4, y + 0.55, cz - 1.4], color: 0xff8a40, intensity: 4, distance: 11, floor: 3, flicker: 1 });

  // 地上的法陣
  const paint = new THREE.MeshStandardMaterial({ color: 0x4a0806, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const marks = [new THREE.RingGeometry(2.05, 2.12, 64), new THREE.RingGeometry(3.36, 3.45, 64), new THREE.RingGeometry(1.5, 1.54, 48)];
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    marks.push(xf(new THREE.PlaneGeometry(0.05, 1.9), { p: [Math.sin(a) * 2.45, Math.cos(a) * 2.45, 0], r: [0, 0, -a] }));
  }
  const circle = new THREE.Mesh(merge(marks), paint);
  circle.rotation.x = -Math.PI / 2; circle.position.set(cx, y + 0.004, cz); circle.receiveShadow = true;
  root.add(circle);

  // 天花板垂下的符咒
  for (let k = 0; k < 90; k++) {
    const a = rng() * Math.PI * 2, r = 1.2 + Math.sqrt(rng()) * 4.2;
    const x = cx + Math.sin(a) * r * 1.6, z = cz + Math.cos(a) * r * 0.72;
    if (Math.abs(x) > F.x2 - 0.8 || z < F.z1 + 0.7 || z > F.z2 - 0.7) continue;
    ctx.talisman(x, y + 2.35 + rng() * 1.9, z, rng() * Math.PI * 2, (rng() - 0.5) * 0.25);
  }

  // 滿牆經文
  const sutraBase = sutraTexture(11);
  const sutra = () => { const t = sutraBase.clone(); t.needsUpdate = true; return t; };
  const hh = F.h - 0.5, yy = y + hh / 2 + 0.1;
  decal(ctx, sutra(), 19, hh, 0, yy, F.z1 + T + 0.012, 0, { repeat: [4.6, 1], opacity: 0.9 });
  decal(ctx, sutra(), 6.8, hh, F.x1 + T + 0.012, yy, cz, Math.PI / 2, { repeat: [1.7, 1], opacity: 0.9 });
  decal(ctx, sutra(), 6.8, hh, F.x2 - T - 0.012, yy, cz, -Math.PI / 2, { repeat: [1.7, 1], opacity: 0.9 });
  for (const sx of [-1, 1]) decal(ctx, sutra(), 7.6, hh, sx * 5.6, yy, F.z2 - T - 0.012, Math.PI, { repeat: [1.9, 1], opacity: 0.9 });
  return { main };
}

export function buildInteriors(ctx, groups) {
  const base = ctx.root;
  ctx.floorGroups = groups; // 給 dressing.js 把各樓層專屬的陳設放進對應群組
  [floor1, floor2, floor3, floor4].forEach((build, i) => {
    ctx.root = groups ? groups[i] : base; // 各樓層的物件放進自己的群組，方便依樓層顯示
    build(ctx);
  });
  ctx.root = base;
}

export { incenseBurnerGeo };
