import * as THREE from 'three';
import { FLOORS, WALL_T as T, PLINTH as P, COMPOUND as C, SLAB } from './layout.js';
import { COLS } from './building.js';
import { boxGeo, xf, merge, mulberry32 } from '../../core/utils.js';
import { weather } from '../../core/weathering.js';
import { charTexture, scorchTexture, cobwebTexture, leafAtlasTexture, coupletTexture, jossStackTexture, paperMoneyTexture } from '../../core/canvasTex.js';

/**
 * 寺廟的「陳舊感」：材質風化疊層、1998 年後殿殿門的火痕與送口、民間廟宇陳設、蛛網、落葉、塌落的瓦。
 * 全部使用自己的亂數序列，不會打亂既有場景（碰撞、樹木、墓碑）的隨機配置。
 * 新增的幾何盡量併入 ctx.batch 既有材質；另外只多出少數幾個不投影的合併網格。
 */

/** 各層地面高度：地下封印室、廟埕、台基／一樓、二樓、三樓、四樓 */
const [F0, F1, F2] = FLOORS;
const grow = (r, d) => [r.x1 - d, r.z1 - d, r.x2 + d, r.z2 + d];
export const LEVELS = [
  { y: -7, rect: [46, -30, 64, -10] },
  0.02,
  { y: F0.y, rect: grow(P, -0.06) },   // 台基頂面（台基側面不算，仍以廟埕為地面）
  { y: F1.y, rect: grow(F1, 0.06) },
  { y: F2.y, rect: grow(F2, 0.06) },
  { y: FLOORS[3].y, rect: grow(F2, 0.06) }, // 四樓與露台
];

/** 在既有 PBR 材質上疊加大尺度髒污（不改 key、不改貼圖） */
export function weatherTempleMats(mats) {
  const L = LEVELS;
  // 牆：大塊色差 + 滲水痕 + 牆腳發霉 + 天花板下緣被香火燻黑
  weather(mats.plaster, { levels: L, blotch: 0.62, streak: 0.8, damp: 0.9, dampH: 1.0, dampTint: 0x4f5540, soot: 0.72, ceil: 5.9, sootTint: 0x3b312b, scale: 8.5 });
  weather(mats.plasterOld, { levels: L, blotch: 0.6, streak: 0.95, damp: 1, dampH: 1.15, dampTint: 0x4c5a3a, scale: 7, streakW: 1.3 });
  weather(mats.stoneWall, { levels: L, blotch: 0.5, streak: 0.7, damp: 0.85, dampH: 0.7, dampTint: 0x4a5540, soot: 0.8, ceil: 4.6, sootTint: 0x2c2724, scale: 6 });
  // 地：色差 + 低窪積水（粗糙度降低，手電筒照到會反光）
  weather(mats.stoneFloor, { levels: L, blotch: 0.55, streak: 0, damp: 0, wet: 0.7, wetLevel: 0.42, wetRough: 0.24, scale: 6.5, fine: 1.9 });
  weather(mats.cobble, { levels: L, blotch: 0.6, streak: 0, damp: 0, wet: 0.5, wetLevel: 0.39, wetRough: 0.38, flatten: 0.35, scale: 8, fine: 2.4 });
  weather(mats.planks, { levels: L, blotch: 0.55, streak: 0.3, damp: 0, wet: 0.35, wetLevel: 0.36, wetRough: 0.32, scale: 5.5, fine: 1.7 });
  weather(mats.ground, { levels: L, blotch: 0.35, streak: 0, damp: 0, wet: 0.45, wetLevel: 0.37, wetRough: 0.4, flatten: 0.3, scale: 11, fine: 3 });
  // 木：柱腳受潮變黑、樑與桌面積塵
  weather(mats.woodRed, { levels: L, blotch: 0.5, streak: 0.55, damp: 0.85, dampH: 0.6, dampTint: 0x3a2f2a, soot: 0.5, ceil: 5.9, scale: 4.5, fine: 1.3 });
  weather(mats.woodDark, { levels: L, blotch: 0.45, streak: 0.3, damp: 0.5, dampH: 0.3, dampTint: 0x3c3630, dust: 0.42, dustTint: 0x5c564b, scale: 3.6, fine: 1.1 });
  // 屋瓦：青苔與水痕
  weather(mats.roof, { levels: L, blotch: 0.6, streak: 0, damp: 0, dust: 0.38, dustTint: 0x3a452e, scale: 5, fine: 1.4 });
  weather(mats.rock, { levels: L, blotch: 0.4, streak: 0.4, damp: 0.5, dampH: 0.3, dampTint: 0x4a5540, dust: 0.16, dustTint: 0x5a5a50, scale: 4, fine: 1.2 });
  weather(mats.ridge, { levels: L, blotch: 0.5, streak: 0.5, damp: 0, dust: 0.3, dustTint: 0x3a452e, scale: 4 });
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const Y_AXIS = new THREE.Vector3(0, 1, 0);

/** 兩點之間的方木（斷樑、椽條） */
function beamBetween(a, b, w, h, tile = 1.2) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const g = boxGeo(w, len, h, 0, 0, 0, tile);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y_AXIS, d.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

/** 給貼片用的矩形（可指定朝向），UV 0..1 */
function quad(w, h, { p = [0, 0, 0], r = [0, 0, 0], uv = null } = {}) {
  const g = new THREE.PlaneGeometry(w, h);
  if (uv) {
    const a = g.attributes.uv;
    for (let i = 0; i < a.count; i++) a.setXY(i, uv[0] + a.getX(i) * (uv[2] - uv[0]), uv[1] + a.getY(i) * (uv[3] - uv[1]));
  }
  return xf(g, { p, r });
}

// ───────────────────────── 1998 年後殿的門 ─────────────────────────
// 地下封印室是後殿「門外」的那一間：x 47..63、z -29..-11、地面 -7、天花板 -2.5。
// 北牆「今夜之事　止於此門」底下就是當年從外側扣上的殿門，被封印的佛像擋在門前。
// 火是從門裡燒的（郭師父把點著的紙人從門底的「送口」推進去，殿裡全是布幔），
// 所以我們站的這一側只看得到：起泡發黑的紅漆、從門縫與送口竄出來的煙痕、被燻黑的樑。
// 一樓的證物「燒損的門閂」就是阿哲從這個門框鋸下來的，東側門柱留著新的切面。
function backHall(ctx, rng) {
  const { batch, mats, root } = ctx;
  const charMap = charTexture();
  const char = (mats.char = new THREE.MeshStandardMaterial({ map: charMap, bumpMap: charMap, bumpScale: 3.2, roughness: 0.93, color: 0x8a847c }));
  const zW = -28.6, yF = -7, cx = 55;

  // 門框：東側門柱在門閂的高度被整段鋸走
  const jamb = (x, y0, y1) => batch.add(mats.woodDark, boxGeo(0.22, y1 - y0, 0.2, x, yF + (y0 + y1) / 2, zW + 0.09, 1.2));
  jamb(cx - 1.62, 0, 3.3); jamb(cx + 1.62, 0, 1.0); jamb(cx + 1.62, 1.46, 3.3);
  batch.add(mats.woodDark, boxGeo(3.62, 0.26, 0.22, cx, yF + 3.43, zW + 0.1, 1.2));
  for (const y of [1.002, 1.458]) batch.add(mats.skin, boxGeo(0.218, 0.004, 0.198, cx + 1.62, yF + y, zW + 0.09, 0.6));
  batch.add(mats.black, boxGeo(0.2, 0.45, 0.02, cx + 1.62, yF + 1.23, zW + 0.006));
  // 兩扇門（從外側看）：紅漆木門；東扇底部開了一個送口
  batch.add(mats.black, quad(3.04, 3.3, { p: [cx, yF + 1.65, zW + 0.004] }));
  const zL = zW + 0.07, hole = [cx + 0.14, cx + 0.5, 0.26];
  batch.add(mats.woodRed, boxGeo(1.49, 3.28, 0.07, cx - 0.755, yF + 1.64, zL, 1.5));
  batch.add(mats.woodRed, boxGeo(hole[0] - cx - 0.01, 3.28, 0.07, (cx + 0.01 + hole[0]) / 2, yF + 1.64, zL, 1.5));
  batch.add(mats.woodRed, boxGeo(cx + 1.5 - hole[1], 3.28, 0.07, (hole[1] + cx + 1.5) / 2, yF + 1.64, zL + 0.004, 1.5));
  batch.add(mats.woodRed, boxGeo(hole[1] - hole[0], 3.28 - hole[2], 0.07, (hole[0] + hole[1]) / 2, yF + (hole[2] + 3.28) / 2, zL + 0.004, 1.5));
  for (const y of [0.52, 1.72, 2.92]) for (const sx of [-1, 1]) batch.add(mats.woodDark, boxGeo(1.4, 0.12, 0.035, cx + sx * 0.76, yF + y, zL + 0.05, 1));
  // 門環、空掉的閂座、問者留在門環上的那截紅線
  for (const sx of [-1, 1]) {
    batch.add(mats.brass, xf(new THREE.TorusGeometry(0.085, 0.013, 5, 12), { p: [cx + sx * 0.22, yF + 1.3, zL + 0.06], r: [0.25, 0, 0] }));
    batch.add(mats.bronze, boxGeo(0.07, 0.07, 0.03, cx + sx * 0.22, yF + 1.4, zL + 0.045));
    batch.add(mats.bronze, boxGeo(0.06, 0.16, 0.08, cx + sx * 0.72, yF + 1.22, zL + 0.07));
  }
  batch.add(mats.thread, beamBetween(V(cx - 0.22, yF + 1.22, zL + 0.08), V(cx - 0.25, yF + 0.74, zL + 0.085), 0.006, 0.006));
  batch.add(mats.thread, beamBetween(V(cx - 0.25, yF + 0.74, zL + 0.085), V(cx - 0.21, yF + 0.58, zL + 0.09), 0.005, 0.005));

  // 送口：門底的小口，鐵片掀著；周圍燒成炭，口外是推進去的紙人燒剩的竹骨與灰
  const sx0 = (hole[0] + hole[1]) / 2;
  batch.add(char, boxGeo(0.44, 0.04, 0.1, sx0, yF + hole[2] + 0.02, zL + 0.02, 0.8));
  for (const dx of [-0.2, 0.2]) batch.add(char, boxGeo(0.04, hole[2], 0.1, sx0 + dx, yF + hole[2] / 2, zL + 0.02, 0.8));
  batch.add(mats.bronze, xf(boxGeo(0.34, 0.22, 0.012, 0, -0.11, 0), { p: [sx0, yF + hole[2] + 0.005, zL + 0.05], r: [-0.95, 0, 0.04] }));
  batch.add(char, xf(new THREE.SphereGeometry(0.34, 10, 5), { p: [sx0 + 0.03, yF + 0.005, zW + 0.42], s: [1, 0.07, 0.8] }));
  for (let i = 0; i < 7; i++) {
    const a = -0.9 + i * 0.3 + (rng() - 0.5) * 0.2, len = 0.25 + rng() * 0.4;
    const from = V(sx0 + (rng() - 0.5) * 0.2, yF + 0.03, zW + 0.12), to = V(from.x + Math.sin(a) * len, yF + 0.025 + rng() * 0.04, from.z + Math.cos(a) * len);
    batch.add(char, beamBetween(from, to, 0.012, 0.008, 0.5));
    if (i % 3 === 0) batch.add(mats.skin, beamBetween(to, V(to.x + Math.sin(a) * 0.12, to.y, to.z + Math.cos(a) * 0.12), 0.012, 0.008, 0.5)); // 沒燒到的一小截
  }
  for (const [r, zz, rx] of [[0.11, 0.46, 1.25], [0.14, 0.62, 1.4]]) batch.add(char, xf(new THREE.TorusGeometry(r, 0.006, 4, 10, Math.PI * 1.3), { p: [sx0 + 0.06, yF + 0.03, zW + zz], r: [rx, 0.4, 0] })); // 竹圈
  for (let i = 0; i < 12; i++) {
    const s = 0.03 + rng() * 0.07;
    batch.add(char, xf(boxGeo(s * (1 + rng() * 2), s * 0.6, s, 0, 0, 0, 0.4), { p: [sx0 + (rng() - 0.5) * 1.3, yF + s * 0.25, zW + 0.2 + rng() * 0.8], r: [rng() * 0.4, rng() * 6.28, rng() * 0.4] }));
  }

  // 門前那道樑與靠門的椽條被燻成炭色
  batch.add(char, boxGeo(14.06, 0.46, 0.46, cx, -2.65, -27.8, 1.5));
  for (const x of [50.2, 52.6, 55, 57.4, 59.8]) batch.add(char, boxGeo(0.15, 0.2, 4.2, x, -2.62, zW + 2.1, 0.9));

  // 煙痕：送口上方、門縫與門楣、門上方的牆、天花、門前的地（合成一個不投影的網格）
  const scorch = new THREE.MeshStandardMaterial({ map: scorchTexture(), transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const sheets = [
    quad(1.7, 2.6, { p: [sx0, yF + 1.3, zL + 0.075] }),
    quad(3.3, 1.9, { p: [cx, yF + 2.45, zL + 0.078] }),
    quad(7.2, 1.3, { p: [cx, yF + 3.95, zW + 0.012] }),
    quad(9, 5.4, { p: [cx, -2.512, zW + 2.7], r: [Math.PI / 2, 0, 0] }),      // 天花：濃的一端貼著門牆
    quad(2.6, 2.2, { p: [sx0, yF + 0.012, zW + 1.1], r: [-Math.PI / 2, 0, Math.PI] }),
  ];
  const scorchMesh = new THREE.Mesh(merge(sheets), scorch);
  scorchMesh.name = 'BackHallScorch'; scorchMesh.receiveShadow = true;
  root.add(scorchMesh);

  // 南牆：返回四樓的石階口（原本只有一塊木牌掛在牆上）
  {
    const zS = -11.4;
    batch.add(mats.black, quad(1.5, 1.74, { p: [cx, yF + 0.87, zS - 0.006], r: [0, Math.PI, 0] }));
    for (const sx of [-1, 1]) batch.add(mats.rock, boxGeo(0.28, 1.76, 0.24, cx + sx * 0.89, yF + 0.88, zS - 0.1, 1.4));
    batch.add(mats.rock, boxGeo(2.1, 0.2, 0.26, cx, yF + 1.84, zS - 0.11, 1.4)); // 門楣壓低，不擋住上方「返回石階」的木牌
    batch.add(mats.rock, boxGeo(1.5, 0.17, 0.36, cx, yF + 0.085, zS - 0.19, 1.4));
    batch.add(mats.rock, boxGeo(1.5, 0.34, 0.14, cx, yF + 0.17, zS - 0.075, 1.4));
  }

  // 名牆牆腳的鐵盒：五支乾掉的紅筆、四張塗掉同一張臉的合照
  {
    const x = 47.86, z = -20.75, y = yF;
    batch.add(mats.bronze, boxGeo(0.3, 0.012, 0.2, x, y + 0.006, z));
    for (const dz of [-0.1, 0.1]) batch.add(mats.bronze, boxGeo(0.3, 0.07, 0.01, x, y + 0.035, z + dz));
    for (const dx of [-0.15, 0.15]) batch.add(mats.bronze, boxGeo(0.01, 0.07, 0.2, x + dx, y + 0.035, z));
    batch.add(mats.bronze, xf(boxGeo(0.3, 0.01, 0.2, 0, 0, 0.1), { p: [x - 0.155, y + 0.07, z - 0.1], r: [0, 0, 1.9] })); // 掀開的盒蓋
    for (let i = 0; i < 5; i++) batch.add(mats.wax, xf(new THREE.CylinderGeometry(0.006, 0.006, 0.14, 5), { p: [x - 0.06 + i * 0.03, y + 0.022, z + 0.03 + (i % 2) * 0.012], r: [Math.PI / 2, 0, 0.1 * (i - 2)] }));
    for (let i = 0; i < 4; i++) batch.add(mats.skin, xf(boxGeo(0.1, 0.002, 0.075, 0, 0, 0), { p: [x + 0.04 + i * 0.012, y + 0.016 + i * 0.003, z - 0.045], r: [0, i * 0.25 - 0.3, 0] }));
  }
  // 二樓錄音機旁的卡帶盒與紙卡
  batch.add(mats.cabinet, xf(boxGeo(0.11, 0.016, 0.07, 0, 0, 0), { p: [-9.34, 7.858, -18.56], r: [0, 0.4, 0] }));
  batch.add(mats.skin, xf(boxGeo(0.1, 0.002, 0.062, 0, 0, 0), { p: [-9.34, 7.867, -18.56], r: [0, 0.4, 0] }));
}

// ───────────────────────── 民間廟宇陳設 ─────────────────────────
function jossStack(mat, w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  // BoxGeometry 的面順序：+x -x +y -y +z -z；上下兩面用貼圖上半（金箔），側面用下半（紙疊）
  for (let i = 0; i < uv.count; i++) {
    const top = i >= 8 && i < 16;
    uv.setY(i, top ? 0.5 + uv.getY(i) * 0.5 : uv.getY(i) * 0.5);
  }
  return g;
}

function furnishings(ctx, rng, groups) {
  const { batch, mats, root, world } = ctx;
  const F0 = FLOORS[0], F1 = FLOORS[1], F2 = FLOORS[2], y1 = F0.y;

  // 山門／大殿正門兩側的木刻楹聯（兩聯合成一張貼圖、一個網格）
  {
    const a = coupletTexture('慈雲廣被三千界', { paper: 'wood', seed: 3 }), b = coupletTexture('法雨均霑億萬家', { paper: 'wood', seed: 4 });
    const c = document.createElement('canvas'); c.width = 320; c.height = 1024;
    const g = c.getContext('2d'); g.drawImage(a.image, 0, 0); g.drawImage(b.image, 160, 0);
    a.dispose(); b.dispose();
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const z = F0.z2 + 0.035, y = y1 + 2.5;
    const faces = [quad(0.42, 3.3, { p: [3.3, y, z + 0.032], uv: [0, 0, 0.5, 1] }), quad(0.42, 3.3, { p: [-3.3, y, z + 0.032], uv: [0.5, 0, 1, 1] })];
    const m = new THREE.Mesh(merge(faces), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.72, metalness: 0.12 }));
    m.name = 'DoorCouplets'; m.receiveShadow = true; root.add(m);
    for (const sx of [-1, 1]) batch.add(mats.woodDark, boxGeo(0.5, 3.4, 0.06, sx * 3.3, y, z, 1.2));
  }

  // 三樓地藏殿：收存桌後方牆上的一對白布輓聯
  if (groups[2]) {
    const a = coupletTexture('音容宛在', { paper: 'white', seed: 9, w: 200, h: 1024 }), b = coupletTexture('魂兮歸來', { paper: 'white', seed: 12, w: 200, h: 1024 });
    const c = document.createElement('canvas'); c.width = 400; c.height = 1024;
    const g = c.getContext('2d'); g.drawImage(a.image, 0, 0); g.drawImage(b.image, 200, 0);
    a.dispose(); b.dispose();
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const z = F2.z1 + T + 0.03, yTop = F2.y + 4.25;
    const faces = [
      xf(quad(0.5, 2.7, { uv: [0, 0, 0.5, 1] }), { p: [6.55, yTop - 1.35, z], r: [0.02, 0, 0.012] }),
      xf(quad(0.5, 2.7, { uv: [0.5, 0, 1, 1] }), { p: [3.45, yTop - 1.35, z + 0.01], r: [0.03, 0, -0.02] }),
    ];
    const m = new THREE.Mesh(merge(faces), new THREE.MeshStandardMaterial({ map: tex, roughness: 1, alphaTest: 0.5, side: THREE.DoubleSide }));
    m.name = 'ElegiacScrolls'; m.receiveShadow = true; groups[2].add(m);
    for (const x of [6.55, 3.45]) batch.add(mats.woodDark, new THREE.CylinderGeometry(0.018, 0.018, 0.6, 6).rotateZ(Math.PI / 2).translate(x, yTop + 0.01, z + 0.01));
  }

  // 一樓供桌兩側：木魚與引磬（各有矮几與布墊）
  for (const sx of [-1, 1]) {
    const x = sx * 2.92, z = -27.62, top = y1 + 0.52;
    batch.add(mats.woodDark, boxGeo(0.52, 0.06, 0.52, x, top - 0.03, z, 0.8));
    for (const a of [-1, 1]) for (const b of [-1, 1]) batch.add(mats.woodDark, boxGeo(0.05, 0.46, 0.05, x + a * 0.21, y1 + 0.23, z + b * 0.21, 0.8));
    batch.add(mats.woodDark, boxGeo(0.46, 0.04, 0.46, x, y1 + 0.16, z, 0.8));
    batch.add(mats.cushion, xf(new THREE.SphereGeometry(0.19, 14, 8), { p: [x, top + 0.035, z], s: [1, 0.24, 1] }));
    world.circle(x, z, 0.3, y1, y1 + 0.9); // 用圓形碰撞：不會擋住調查視線（視線只檢查方塊）
    if (sx < 0) {
      // 木魚：扁圓的魚身、橫向的開口、握柄
      batch.add(mats.woodRed, xf(new THREE.SphereGeometry(0.15, 18, 12), { p: [x, top + 0.17, z], s: [1.12, 0.86, 0.95] }));
      batch.add(mats.black, boxGeo(0.25, 0.022, 0.06, x, top + 0.15, z + 0.12));
      batch.add(mats.woodRed, xf(new THREE.TorusGeometry(0.06, 0.022, 6, 12, Math.PI), { p: [x, top + 0.27, z - 0.02], r: [0, Math.PI / 2, 0] }));
      batch.add(mats.woodDark, xf(new THREE.CylinderGeometry(0.011, 0.014, 0.3, 6), { p: [x + 0.17, top + 0.025, z + 0.16], r: [Math.PI / 2, 0, 0.5] }));
      batch.add(mats.woodDark, xf(new THREE.SphereGeometry(0.03, 8, 6), { p: [x + 0.1, top + 0.03, z + 0.29] }));
    } else {
      // 引磬（銅缽）
      const pts = [[0, 0.02], [0.07, 0.0], [0.15, 0.05], [0.185, 0.14], [0.19, 0.24], [0.176, 0.24], [0.17, 0.14], [0.14, 0.06], [0.07, 0.025], [0, 0.03]].map(([r, yy]) => new THREE.Vector2(r, yy));
      batch.add(mats.bronze, new THREE.LatheGeometry(pts, 20).translate(x, top + 0.07, z));
      batch.add(mats.woodDark, xf(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 6), { p: [x - 0.1, top + 0.3, z + 0.05], r: [0, 0, 0.5] }));
    }
  }

  // 二樓擲筊桌上的籤筒
  {
    const x = 1.04, z = -23.44, top = F1.y + 0.95;
    const pts = [[0, 0], [0.06, 0], [0.066, 0.02], [0.058, 0.05], [0.062, 0.2], [0.07, 0.225], [0.058, 0.225], [0.05, 0.03], [0, 0.03]].map(([r, yy]) => new THREE.Vector2(r, yy));
    batch.add(mats.woodRed, new THREE.LatheGeometry(pts, 14).translate(x, top, z));
    for (let i = 0; i < 22; i++) {
      const a = rng() * 6.28, r = rng() * 0.038, len = 0.3 + rng() * 0.04;
      batch.add(mats.skin, xf(boxGeo(0.009, len, 0.003, 0, len / 2, 0, 0.3), { p: [x + Math.cos(a) * r, top + 0.03, z + Math.sin(a) * r], r: [Math.sin(a) * 0.1, a, -Math.cos(a) * 0.1] }));
    }
    // 掉出來的三支籤
    for (let i = 0; i < 3; i++) batch.add(mats.skin, xf(boxGeo(0.009, 0.003, 0.32, 0, 0, 0, 0.3), { p: [x - 0.17 - i * 0.05, top + 0.004, z + 0.06 + i * 0.03], r: [0, 0.5 + i * 0.5, 0] }));
  }

  // 成疊的金紙：功德箱上、大香爐旁、天公爐前的木箱上
  {
    const joss = (mats.joss = new THREE.MeshStandardMaterial({ map: jossStackTexture(), roughness: 0.92 }));
    const stack = (x, y, z, n, ry = 0, lean = 0) => {
      for (let i = 0; i < n; i++) {
        const h = 0.035 + rng() * 0.03;
        batch.add(joss, xf(jossStack(joss, 0.2, h, 0.15), { p: [x + i * lean + (rng() - 0.5) * 0.012, y + h / 2, z + (rng() - 0.5) * 0.012], r: [0, ry + (rng() - 0.5) * 0.22, 0] }));
        y += h;
      }
    };
    stack(3.32, y1 + 0.85, -15.08, 3, 0.2); stack(3.86, y1 + 0.85, -15.0, 2, -0.3);
    stack(1.05, y1, -25.1, 4, 0.5); stack(1.32, y1, -25.32, 2, 1.2, 0.02); stack(-1.1, y1, -25.0, 3, -0.4);
    batch.add(mats.planks, boxGeo(0.62, 0.32, 0.44, 1.9, 0.18, 8.3, 0.8));
    stack(1.78, 0.34, 8.3, 3, 0.1); stack(2.02, 0.34, 8.26, 4, -0.15); stack(1.7, 0.02, 8.75, 2, 0.9, 0.03);
    // 地下三張送行桌旁各一疊
    for (const x of [50.3, 59.7]) stack(x, -7, -21.5, 3, x);
  }
}

// ───────────────────────── 蛛網 ─────────────────────────
function cobwebs(ctx, rng) {
  const mat = new THREE.MeshStandardMaterial({ map: cobwebTexture(), transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, roughness: 1 });
  // 以左上角為網心：+x 沿著樑往外，-y 沿著柱往下
  const geo = new THREE.PlaneGeometry(1, 1).translate(0.5, -0.5, 0);
  const list = [];
  const put = (x, y, z, ry, s, tilt = 0) => list.push(new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, ry, 0, 'YXZ')), V(s, s * (0.75 + rng() * 0.5), s)));
  // 各層柱頭與樑的交角
  COLS.forEach((cols, f) => {
    const yb = FLOORS[f + 1].y - SLAB - 0.4;
    for (const x of cols.xs) for (const z of cols.zs) {
      const dirs = [0, Math.PI / 2, Math.PI, -Math.PI / 2].filter(() => rng() < 0.48);
      for (const a of dirs) put(x + Math.cos(a) * 0.3, yb + (Math.abs(Math.sin(a)) > 0.5 ? 0.1 : 0), z - Math.sin(a) * 0.3, a, 0.7 + rng() * 0.9);
    }
  });
  // 各層室內四個牆角（貼著天花）
  FLOORS.forEach((F, f) => {
    const yc = F.y + F.h - (f < 3 ? SLAB : 0) - 0.02;
    for (const [x, z, a] of [[F.x1 + T, F.z1 + T, -Math.PI / 4], [F.x2 - T, F.z1 + T, -Math.PI * 0.75], [F.x2 - T, F.z2 - T, Math.PI * 0.75], [F.x1 + T, F.z2 - T, Math.PI / 4]]) {
      put(x, yc, z, a, 1.1 + rng() * 0.9);
      if (rng() < 0.6) put(x, yc - 0.05, z, a + (rng() - 0.5) * 0.5, 0.6 + rng() * 0.5, 0.5);
    }
  });
  // 前廊簷下、戲台柱、地下石柱
  for (const x of [-19, -7.8, 2.9, 13.4]) put(x + 0.3, FLOORS[1].y - SLAB - 0.42, -8.8, 0, 0.8 + rng() * 0.6);
  for (const x of [17.35, 28.55]) put(x, 4.05, -1, x < 23 ? 0 : Math.PI, 1.0 + rng() * 0.5);
  for (const x of [48.2, 61.8]) for (const z of [-27.8, -20, -12.2]) put(x + (x < 55 ? 0.33 : -0.33), -2.86, z, x < 55 ? 0 : Math.PI, 0.8 + rng() * 0.7);
  const im = new THREE.InstancedMesh(geo, mat, list.length);
  list.forEach((m, i) => im.setMatrixAt(i, m));
  im.name = 'Cobwebs'; im.castShadow = false; im.receiveShadow = false; im.renderOrder = 3;
  im.computeBoundingSphere();
  ctx.root.add(im);
}

// ───────────────────────── 吹進來的落葉與散落的金紙 ─────────────────────────
function litter(ctx, rng) {
  const inRect = (x, z, r) => x > r.x1 && x < r.x2 && z > r.z1 && z < r.z2;
  const leaves = [], papers = [];
  // xf 的旋轉順序是先 Z、再 Y、最後 X：面內的朝向放在 Z，最後才用 X 把它放平
  const flat = (list, w, h, x, y, z, uv) => list.push(quad(w, h, { p: [x, y, z], r: [-Math.PI / 2 + (rng() - 0.5) * 0.3, (rng() - 0.5) * 0.3, rng() * 6.28], uv }));
  const leaf = (x, y, z) => {
    const k = Math.floor(rng() * 4), s = 0.09 + rng() * 0.09, u = (k % 2) * 0.5, v = Math.floor(k / 2) * 0.5;
    flat(leaves, s * 0.62, s, x, y + 0.006 + rng() * 0.012, z, [u, v, u + 0.5, v + 0.5]);
  };
  const y1 = FLOORS[0].y;
  // 前廊與一樓門內：風從正門、右側門灌進來，越往裡越少
  for (let i = 0; i < 230; i++) {
    const door = rng() < 0.7 ? 0 : 9.2;
    const depth = Math.pow(rng(), 1.7) * 9.5;            // 進門的深度
    const x = door + (rng() - 0.5) * (3 + depth * 1.1), z = -12.2 - depth;
    if (Math.abs(x) > 19 || z < -24) continue;
    leaf(x, y1, z);
  }
  for (let i = 0; i < 170; i++) leaf((rng() - 0.5) * 42, y1, -11.9 + rng() * 4.2);
  // 牆腳與台基邊緣的落葉堆
  for (let i = 0; i < 260; i++) {
    const side = Math.floor(rng() * 4);
    let x, z;
    if (side === 0) { x = (rng() - 0.5) * 46; z = P.z2 + 0.1 + rng() * rng() * 2.4; if (Math.abs(x) < 7.6) continue; }
    else if (side === 1) { x = C.x1 + C.wallT + 0.1 + rng() * rng() * 2.2; z = C.z1 + rng() * (C.z2 - C.z1); }
    else if (side === 2) { x = C.x2 - C.wallT - 0.1 - rng() * rng() * 2.2; z = C.z1 + rng() * (C.z2 - C.z1); }
    else { x = (rng() - 0.5) * 58; z = C.z2 - C.wallT - 0.1 - rng() * rng() * 2.2; }
    if (inRect(x, z, P)) continue;
    leaf(x, 0.02, z);
  }
  // 戲台、四樓露台
  for (let i = 0; i < 70; i++) leaf(17.3 + rng() * 11.4, 0.58, -4.6 + rng() * 7.4);
  for (let i = 0; i < 90; i++) {
    const F = FLOORS[2], F3 = FLOORS[3];
    const x = F.x1 + 0.6 + rng() * (F.x2 - F.x1 - 1.2), z = F.z1 + 0.6 + rng() * (F.z2 - F.z1 - 1.2);
    if (inRect(x, z, { x1: F3.x1 - 0.2, x2: F3.x2 + 0.2, z1: F3.z1 - 0.2, z2: F3.z2 + 0.2 })) continue;
    leaf(x, F3.y, z);
  }
  const leafMesh = new THREE.Mesh(merge(leaves), new THREE.MeshStandardMaterial({ map: leafAtlasTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.95 }));
  leafMesh.name = 'DeadLeaves'; leafMesh.receiveShadow = true;
  ctx.root.add(leafMesh);

  // 室內散落的金紙：供桌前、香爐邊、樓梯口、地下
  const paper = (x, y, z) => flat(papers, 0.11, 0.08, x, y + 0.005 + rng() * 0.01, z, null);
  for (let i = 0; i < 90; i++) { const a = rng() * 6.28, r = 0.7 + rng() * rng() * 4.2; paper(Math.cos(a) * r, y1, -25.6 + Math.sin(a) * r * 0.8); }
  for (let i = 0; i < 40; i++) paper((rng() - 0.5) * 14, y1, -13 - rng() * 5);
  for (let i = 0; i < 46; i++) paper(-11 + rng() * 22, FLOORS[1].y, -29.3 + rng() * rng() * 9);
  for (let i = 0; i < 34; i++) paper(-12 + rng() * 24, FLOORS[2].y, -28 + rng() * 10);
  for (let i = 0; i < 60; i++) { const a = rng() * 6.28, r = 1.2 + rng() * 5; paper(55 + Math.cos(a) * r, -7, -21.5 + Math.sin(a) * r); }
  const paperMesh = new THREE.Mesh(merge(papers), new THREE.MeshStandardMaterial({ map: paperMoneyTexture(), roughness: 0.9, side: THREE.DoubleSide }));
  paperMesh.name = 'IndoorJossPaper'; paperMesh.receiveShadow = true;
  ctx.root.add(paperMesh);
}

// ───────────────────────── 塌落的瓦 ─────────────────────────
function fallenTiles(ctx, rng) {
  const { batch, mats } = ctx;
  const tile = (x, y, z, broken) => {
    const len = broken ? 0.1 + rng() * 0.12 : 0.3;
    const g = new THREE.CylinderGeometry(0.1, 0.115, len, 5, 1, true, 0, Math.PI * (broken ? 0.55 + rng() * 0.4 : 1));
    g.rotateX(Math.PI / 2);
    batch.add(mats.roof, xf(g, { p: [x, y + 0.012 + (rng() < 0.3 ? 0.06 : 0), z], r: [(rng() - 0.5) * 0.25, rng() * 6.28, rng() < 0.3 ? Math.PI + (rng() - 0.5) * 0.4 : (rng() - 0.5) * 0.4] }));
  };
  const cluster = (cx, cz, n, y = 0.02, spread = 1.1) => {
    for (let i = 0; i < n; i++) tile(cx + (rng() - 0.5) * spread * 2, y, cz + (rng() - 0.5) * spread, rng() < 0.62);
  };
  // 腰簷滴水線正下方（台基前緣與兩側）、圍牆牆帽掉落處、山門內側
  for (const x of [-19.5, -15, -10.5, 11, 16.5, 20.5]) cluster(x, P.z2 + 0.9, 5 + Math.floor(rng() * 4));
  for (const z of [-30, -22, -13]) { cluster(P.x1 - 0.9, z, 4, 0.02, 0.9); cluster(P.x2 + 0.9, z, 4, 0.02, 0.9); }
  for (const [x, z] of [[-28.3, 14], [-28.3, -12], [28.3, 6], [28.3, -20], [-12, 20.3], [16, 20.3]]) cluster(x, z, 5, 0.02, 0.8);
  cluster(-3.6, 19.6, 4); cluster(3.9, 19.4, 3);
  // 前廊上也有幾片
  cluster(-15, -10.4, 4, FLOORS[0].y, 0.8); cluster(17, -9.6, 3, FLOORS[0].y, 0.8);
}

export function buildDressing(ctx) {
  const rng = mulberry32(19980818);
  const groups = ctx.floorGroups || [];
  // 網址加 ?artoff 可關掉這一層（量測前後差異用）
  if (new URLSearchParams(location.search).has('artoff')) return;
  weatherTempleMats(ctx.mats);
  backHall(ctx, rng);
  furnishings(ctx, rng, groups);
  cobwebs(ctx, rng);
  litter(ctx, rng);
  fallenTiles(ctx, rng);
}
