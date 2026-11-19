import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { boxGeo, xf, merge, mulberry32, fbm, cylinderBetween } from '../../core/utils.js';
import { coupletTexture } from '../../core/canvasTex.js';
import { weather } from '../../core/weathering.js';

/**
 * 慈雲里：被撤離的山村。磚造平房（瓦頂／鐵皮頂／塌頂）、鐵窗、鐵捲門、春聯、門口來不及帶走的東西、
 * 路緣與雜草、平滑的落石與山坡、停在路口的車。
 * 靜態幾何依「材質 × 路段」合併，全村只多出數十個 draw call；小物件用頂點色共用一個材質。
 * 不新增碰撞方塊（房屋本體的碰撞仍由 index.js 的 house() 建立），不新增光源。
 */

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ZONES = [14, -12]; // 以 z 分三段合併，視錐剔除才有作用：停車處與橋｜村落｜作坊與村尾
const zoneOf = (z) => (z > ZONES[0] ? 0 : z > ZONES[1] ? 1 : 2);

/** 依材質與路段收集幾何 */
class ZoneBatch {
  constructor() { this.map = new Map(); }
  add(mat, geo, z, cast = true) {
    const key = `${mat.uuid}|${zoneOf(z)}|${cast ? 1 : 0}`;
    let e = this.map.get(key);
    if (!e) this.map.set(key, (e = { mat, cast, list: [] }));
    e.list.push(geo);
    return geo;
  }
  build(parent) {
    for (const e of this.map.values()) {
      const m = new THREE.Mesh(merge(e.list), e.mat);
      m.castShadow = e.cast; m.receiveShadow = true;
      parent.add(m);
    }
    this.map.clear();
  }
}

/**
 * 把 index.js 以 mesh()/box()/cyl() 建立、之後不會再動的網格，依「材質 × 路段」烘成少量合併網格。
 * 原本每個方塊一個 draw call（而且陰影還要再畫一兩次），整張地圖超過一千個。
 */
export function bakeStatics(scene, list) {
  const groups = new Map(), seen = new Set();
  for (const o of list) {
    o.updateMatrix();
    let g = o.geometry;
    if (seen.has(g)) g = g.clone();
    seen.add(g);
    g.applyMatrix4(o.matrix);
    const key = o.material.uuid + '|' + zoneOf(o.position.z) + '|' + (o.castShadow ? 1 : 0);
    let e = groups.get(key);
    if (!e) groups.set(key, (e = { mat: o.material, cast: o.castShadow, list: [] }));
    e.list.push(g);
  }
  for (const e of groups.values()) {
    const m = new THREE.Mesh(merge(e.list), e.mat);
    m.castShadow = e.cast; m.receiveShadow = true;
    scene.add(m);
  }
}

/** 風化的圓石：正二十面體細分後以雜訊擠壓、壓扁，法線保持平滑 */
function rockGeo(seed, r, detail = 1, squash = 0.62) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 0.72 + 0.5 * fbm(x * 1.3 + seed * 7.1, z * 1.3 + y * 1.7 + seed * 3.3, 3);
    p.setXYZ(i, x * k * r, y * k * r * squash, z * k * r);
    n.setXYZ(i, x, y / squash, z);
    uv.setXY(i, (x * k * r) / 1.6 + seed, (z * k * r + y * r) / 1.6);
  }
  g.normalizeNormals();
  return g;
}

/** 幾何加上單一頂點色（給共用的「上漆」材質） */
function tint(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}

function noticeTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 320;
  const g = c.getContext('2d'), rng = mulberry32(113);
  g.fillStyle = '#b9b29c'; g.fillRect(0, 0, 256, 320);
  for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(60,44,24,${rng() * 0.1})`; g.fillRect(rng() * 256, rng() * 320, 1 + rng() * 3, 1); }
  g.fillStyle = '#7a1612'; g.fillRect(0, 0, 256, 54);
  g.fillStyle = '#d8cfb6'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 34px "Noto Serif TC","PMingLiU",serif'; g.fillText('公　告', 128, 28);
  g.fillStyle = '#26221c'; g.font = 'bold 44px "Noto Serif TC","PMingLiU",serif'; g.fillText('已 遷 離', 128, 108);
  g.font = '20px "Noto Serif TC","PMingLiU",serif';
  ['本戶已配合撤離', '地層滑動警戒區', '請勿進入', '113 年 6 月'].forEach((s, i) => g.fillText(s, 128, 164 + i * 32));
  g.strokeStyle = '#7a1612'; g.lineWidth = 4; g.beginPath(); g.arc(196, 268, 30, 0, 6.3); g.stroke();
  for (let i = 0; i < 9; i++) { const y = rng() * 320, len = 40 + rng() * 150; const grad = g.createLinearGradient(0, y, 0, y + len); grad.addColorStop(0, `rgba(60,44,24,${0.1 + rng() * 0.2})`); grad.addColorStop(1, 'rgba(60,44,24,0)'); g.fillStyle = grad; g.fillRect(rng() * 256, y, 3 + rng() * 10, len); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function weedTexture() {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), rng = mulberry32(77);
  g.lineCap = 'round';
  for (let i = 0; i < 46; i++) {
    const x = S * (0.12 + rng() * 0.76), h = S * (0.3 + rng() * 0.68), lean = (rng() - 0.5) * 46;
    const dry = rng() < 0.55;
    g.strokeStyle = dry ? `rgb(${96 + rng() * 40},${84 + rng() * 30},${44 + rng() * 20})` : `rgb(${44 + rng() * 26},${64 + rng() * 30},${32 + rng() * 14})`;
    g.lineWidth = 1.2 + rng() * 2.2;
    g.beginPath(); g.moveTo(x, S); g.quadraticCurveTo(x + lean * 0.2, S - h * 0.6, x + lean, S - h); g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function fuTexture() {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), rng = mulberry32(8);
  g.translate(S / 2, S / 2); g.rotate(Math.PI / 4);
  g.fillStyle = '#7e1d16'; g.fillRect(-84, -84, 168, 168);
  g.rotate(-Math.PI / 4);
  g.fillStyle = '#17110c'; g.font = 'bold 120px "DFKai-SB","BiauKai","KaiTi","標楷體",serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.rotate(Math.PI); g.fillText('福', 0, 6); g.rotate(-Math.PI); // 倒貼的福
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 40; i++) { const x = rng() * S, y = rng() * S, r = 8 + rng() * 40; const grad = g.createRadialGradient(x, y, 0, x, y, r); grad.addColorStop(0, `rgba(${rng() < 0.5 ? '220,205,180' : '50,34,20'},${0.08 + rng() * 0.22})`); grad.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = grad; g.fillRect(x - r, y - r, r * 2, r * 2); }
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(rng() * S, rng() * S, 8 + rng() * 22, 0, 6.3); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function buildVillage({ scene, world, mats }) {
  const rng = mulberry32(2024_06);
  const B = new ZoneBatch();
  const owned = { materials: [], textures: [] };
  const own = (m) => { owned.materials.push(m); if (m.map && m.map.isCanvasTexture) owned.textures.push(m.map); return m; };

  // ── 材質風化：牆腳受潮發霉、雨水往下流的痕、柏油積水 ──
  const L = [0];
  weather(mats.wall, { levels: L, blotch: 0.62, streak: 0.95, damp: 1, dampH: 1.1, dampTint: 0x4a5638, scale: 6 });
  weather(mats.brick, { levels: L, blotch: 0.55, streak: 0.8, damp: 0.95, dampH: 0.9, dampTint: 0x40452f, scale: 5 });
  weather(mats.asphalt, { levels: L, blotch: 0.5, streak: 0, damp: 0, wet: 0.85, wetLevel: 0.46, wetRough: 0.16, flatten: 0.75, scale: 7, fine: 2.1 });
  weather(mats.concrete, { levels: [0, 0.12], blotch: 0.6, streak: 0.5, damp: 0.6, dampH: 0.4, wet: 0.45, wetLevel: 0.38, wetRough: 0.3, flatten: 0.5, scale: 4.5, fine: 1.4 });
  weather(mats.dirt, { levels: L, blotch: 0.4, streak: 0, damp: 0, wet: 0.5, wetLevel: 0.38, wetRough: 0.36, flatten: 0.3, scale: 12, fine: 3 });
  weather(mats.tile, { levels: L, blotch: 0.6, streak: 0, damp: 0, dust: 0.45, dustTint: 0x39442c, scale: 4, fine: 1.2 });
  weather(mats.tin, { levels: L, blotch: 0.55, streak: 0.5, damp: 0, dust: 0.2, dustTint: 0x3c3a2c, scale: 3.5, fine: 1.0 });
  weather(mats.rock, { levels: L, blotch: 0.45, streak: 0.3, damp: 0, dust: 0.3, dustTint: 0x3c4630, scale: 5, fine: 1.4 });
  weather(mats.wood, { levels: L, blotch: 0.5, streak: 0.4, damp: 0.7, dampH: 0.35, dampTint: 0x33302a, scale: 3, fine: 0.9 });

  const glass = own(new THREE.MeshStandardMaterial({ color: 0x0a0f13, roughness: 0.07, metalness: 0.55, side: THREE.DoubleSide }));
  const paint = own(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.05 }));
  const carPaint = own(new THREE.MeshStandardMaterial({ color: 0x3a4346, roughness: 0.32, metalness: 0.7 }));
  weather(carPaint, { levels: L, blotch: 0.22, streak: 0.14, damp: 0.5, dampH: 0.42, dampTint: 0x6a6258, dust: 0.1, dustTint: 0x55524a, scale: 1.6, fine: 0.5, streakW: 0.4, streakL: 3 });
  const coupletA = own(new THREE.MeshStandardMaterial({ map: coupletTexture('一門天賜平安福', { paper: 'red', seed: 5 }), roughness: 0.95, alphaTest: 0.5 }));
  const coupletB = own(new THREE.MeshStandardMaterial({ map: coupletTexture('四海人同富貴春', { paper: 'red', seed: 6 }), roughness: 0.95, alphaTest: 0.5 }));
  const fu = own(new THREE.MeshStandardMaterial({ map: fuTexture(), roughness: 0.95, alphaTest: 0.5 }));
  const notice = own(new THREE.MeshStandardMaterial({ map: noticeTexture(), color: 0x8f897a, roughness: 0.95 }));
  const weed = own(new THREE.MeshStandardMaterial({ map: weedTexture(), color: 0x6a6652, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1 }));
  const painted = [[], [], []];
  const P = (geo, hex, z) => painted[zoneOf(z)].push(tint(geo, hex));
  const weeds = [];
  const tuft = (x, z, s = 1) => {
    const h = (0.22 + rng() * 0.3) * s, w = (0.24 + rng() * 0.26) * s, a = rng() * Math.PI;
    for (const d of [0, Math.PI / 2]) weeds.push(xf(new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0), { p: [x, 0, z], r: [0, a + d, (rng() - 0.5) * 0.2] }));
  };
  const weedLine = (x1, z1, x2, z2, n, jitter = 0.18) => { for (let i = 0; i < n; i++) { const t = rng(); tuft(x1 + (x2 - x1) * t + (rng() - 0.5) * jitter, z1 + (z2 - z1) * t + (rng() - 0.5) * jitter, 0.7 + rng() * 0.8); } };

  // ───────────────────────── 房屋 ─────────────────────────
  /**
   * 門面朝 +Z。street：臨街的那一面在 +X(1) 或 -X(-1)。
   * roof：'tile' 紅瓦、'tin' 鏽鐵皮、'collapsed' 前坡塌掉露出屋架
   */
  function house(x, z, w, d, h, { wallMat = mats.wall, roof = 'tile', street = 1, ajar = 0, shutter = false, upper = false, boarded = false } = {}) {
    const zf = z + d / 2, sx = x + (street * w) / 2;
    B.add(wallMat, boxGeo(w, h, d, x, h / 2, z, 2.2), z);
    B.add(mats.concrete, boxGeo(w + 0.07, 0.34, d + 0.07, x, 0.17, z, 1.6), z);
    // 屋頂：兩坡，屋脊沿 X；山牆朝向街道
    const pitch = roof === 'tin' ? 0.3 : 0.42, tan = Math.tan(pitch), oz = 0.5, ox = 0.32;
    const rise = (d / 2) * tan, s = d / 2 + oz, Ls = s / Math.cos(pitch);
    const rmat = roof === 'tin' ? mats.tin : mats.tile;
    for (const sg of [1, -1]) {
      if (roof === 'collapsed' && sg > 0) {
        // 塌掉的前坡：只剩屋架（桁條與椽）和靠近屋脊的一小排瓦
        for (let k = 0; k <= 4; k++) { const xx = x - w / 2 + 0.3 + (k * (w - 0.6)) / 4; B.add(mats.wood, cylinderBetween(V(xx, h + rise, z), V(xx + (rng() - 0.5) * 0.2, h - oz * tan + (k === 2 ? -0.5 : 0), z + s - (k === 2 ? 0.6 : 0)), 0.05, 0.05, 5), z); }
        for (const f of [0.3, 0.62]) B.add(mats.wood, boxGeo(w + ox, 0.07, 0.09, x, h + rise - f * s * tan - 0.04, z + f * s, 1), z);
        B.add(rmat, xf(boxGeo(w + ox * 2, 0.06, Ls * 0.26, 0, 0, 0, 1.3), { p: [x, h + rise - 0.13 * s * tan + 0.02, z + 0.13 * s], r: [pitch, 0, 0] }), z);
        continue;
      }
      B.add(rmat, xf(boxGeo(w + ox * 2, 0.07, Ls, 0, 0, 0, 1.3), { p: [x, h + tan * (d / 2 - s / 2) + 0.03, z + sg * (s / 2)], r: [sg * pitch, 0, 0] }), z);
      B.add(mats.wood, boxGeo(w + ox * 2, 0.13, 0.05, x, h - oz * tan + 0.02, z + sg * (s - 0.02), 1), z); // 封簷板
    }
    B.add(mats.concrete, boxGeo(w + ox * 2 + 0.06, 0.1, 0.2, x, h + rise + 0.08, z, 1), z); // 屋脊
    for (const gs of [-1, 1]) { // 山牆三角
      const gx = x + gs * (w / 2), g = new THREE.BufferGeometry();
      const pts = gs > 0 ? [gx, h, z + d / 2, gx, h, z - d / 2, gx, h + rise, z] : [gx, h, z - d / 2, gx, h, z + d / 2, gx, h + rise, z];
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute([pts[2] / 2.2, pts[1] / 2.2, pts[5] / 2.2, pts[4] / 2.2, pts[8] / 2.2, pts[7] / 2.2], 2));
      g.computeVertexNormals();
      B.add(wallMat, g, z);
    }
    // 正門：內凹的黑洞、木框、斑駁的紅門、水泥門階、春聯、撤離公告
    B.add(mats.dark, boxGeo(1.0, 2.04, 0.06, x, 1.02, zf + 0.005), z);
    for (const dx of [-0.54, 0.54]) B.add(mats.wood, boxGeo(0.09, 2.14, 0.16, x + dx, 1.07, zf + 0.05, 1), z);
    B.add(mats.wood, boxGeo(1.17, 0.1, 0.16, x, 2.12, zf + 0.05, 1), z);
    B.add(mats.red, xf(boxGeo(0.96, 1.98, 0.045, 0.48, 0.99, 0, 1.4), { p: [x - 0.48, 0.03, zf + 0.04], r: [0, -ajar, 0] }), z); // 往外推開一道縫
    B.add(mats.concrete, boxGeo(1.5, 0.13, 0.55, x, 0.065, zf + 0.3, 1.2), z);
    B.add(coupletA, new THREE.PlaneGeometry(0.2, 1.5).translate(x + 0.74, 1.3, zf + 0.008), z, false);
    B.add(coupletB, new THREE.PlaneGeometry(0.2, 1.5).translate(x - 0.74, 1.3, zf + 0.008), z, false);
    if (ajar === 0) {
      B.add(fu, new THREE.PlaneGeometry(0.46, 0.46).translate(x + 0.02, 1.45, zf + 0.067), z, false);
      B.add(notice, xf(new THREE.PlaneGeometry(0.24, 0.3), { p: [x - 0.2, 1.0, zf + 0.068], r: [0, 0, 0.04] }), z, false);
    } else B.add(notice, xf(new THREE.PlaneGeometry(0.24, 0.3), { p: [x + 0.86, 1.1, zf + 0.012], r: [0, 0, -0.05] }), z, false);
    // 窗：木框、反光的黑玻璃、生鏽的鐵窗花、窗台
    const win = (axis, c, u, y, ww = 0.9, hh = 0.85, opt = {}) => {
      // axis 'z'：窗在正面（法線 +Z，u 是 x）；axis 'x'：窗在臨街面（法線 street·X，u 是 z）
      const put = (mat, w1, h1, t, du, dy, dn) => {
        const g = axis === 'z' ? boxGeo(w1, h1, t, u + du, y + dy, c + dn, 1) : boxGeo(t, h1, w1, c + street * dn, y + dy, u + du, 1);
        B.add(mat, g, z); return g;
      };
      put(mats.wood, ww + 0.12, 0.07, 0.1, 0, hh / 2 + 0.035, 0.03); put(mats.wood, ww + 0.12, 0.07, 0.1, 0, -hh / 2 - 0.035, 0.03);
      for (const s2 of [-1, 1]) put(mats.wood, 0.07, hh, 0.1, s2 * (ww / 2 + 0.025), 0, 0.03);
      put(mats.wood, 0.04, hh, 0.05, 0, 0, 0.02);
      put(glass, ww, hh, 0.02, 0, 0, 0.012);
      put(mats.concrete, ww + 0.2, 0.05, 0.16, 0, -hh / 2 - 0.09, 0.06);
      if (opt.boards) {
        for (let k = 0; k < 3; k++) {
          const g = axis === 'z' ? xf(boxGeo(ww + 0.3, 0.14, 0.025, 0, 0, 0, 1), { p: [u, y - 0.26 + k * 0.27, c + 0.1], r: [0, 0, (rng() - 0.5) * 0.3] }) : xf(boxGeo(0.025, 0.14, ww + 0.3, 0, 0, 0, 1), { p: [c + street * 0.1, y - 0.26 + k * 0.27, u], r: [(rng() - 0.5) * 0.3, 0, 0] });
          B.add(mats.wood, g, z);
        }
      } else {
        const n = 6;
        for (let k = 0; k < n; k++) { if (opt.bent && k === 2) continue; put(mats.iron, 0.02, hh + 0.1, 0.02, -ww / 2 + 0.06 + (k * (ww - 0.12)) / (n - 1), 0, 0.09); }
        put(mats.iron, ww + 0.06, 0.025, 0.02, 0, hh * 0.22, 0.09); put(mats.iron, ww + 0.06, 0.025, 0.02, 0, -hh * 0.22, 0.09);
      }
    };
    win('z', zf, x - w * 0.32, 1.62, 0.9, 0.85, { boards: boarded });
    win('z', zf, x + w * 0.32, 1.62, 0.9, 0.85, { bent: true });
    if (upper) for (const dx of [-w * 0.28, 0, w * 0.28]) win('z', zf, x + dx, h - 0.85, 0.8, 0.7);
    if (shutter) {
      // 臨街的鐵捲門與捲門箱
      const zc = z - 0.2;
      B.add(mats.shutter, boxGeo(0.05, 2.5, 2.6, sx + street * 0.03, 1.25, zc, 1.3), z);
      B.add(mats.iron, boxGeo(0.26, 0.3, 2.8, sx + street * 0.12, 2.64, zc, 1), z);
      for (const dz of [-1.34, 1.34]) B.add(mats.iron, boxGeo(0.09, 2.5, 0.07, sx + street * 0.05, 1.25, zc + dz, 1), z);
      win('x', sx, z + d * 0.36, 1.62, 0.7, 0.8);
    } else {
      win('x', sx, z - d * 0.24, 1.62, 0.9, 0.85, { boards: boarded });
      win('x', sx, z + d * 0.24, 1.62, 0.9, 0.85);
      if (upper) for (const dz of [-d * 0.24, d * 0.24]) win('x', sx, z + dz, h - 0.85, 0.8, 0.7);
    }
    // 落水管、電表箱、信箱
    B.add(mats.iron, new THREE.CylinderGeometry(0.035, 0.035, h, 8).translate(x + w / 2 - 0.12, h / 2, zf + 0.05), z);
    P(boxGeo(0.3, 0.42, 0.14, x - w / 2 + 0.5, 1.5, zf + 0.07), 0x62685f, z);
    P(boxGeo(0.02, 1.3, 0.02, x - w / 2 + 0.5, 0.65, zf + 0.03), 0x33352f, z);
    P(boxGeo(0.26, 0.17, 0.09, x + 0.92, 1.42 + (ajar ? 0.42 : 0), zf + 0.05), 0x2c4a36, z);
    // 牆腳的雜草
    weedLine(x - w / 2, zf + 0.12, x + w / 2, zf + 0.12, Math.round(w * 2.2));
    weedLine(sx + street * 0.14, z - d / 2, sx + street * 0.14, zf, Math.round(d * 2));
  }

  // 村裡四戶：位置與外形尺寸沿用原本的碰撞
  house(-8, -1, 6, 6, 3.7, { wallMat: mats.brick, roof: 'tile', street: 1, shutter: true });
  house(8, 0, 6, 5, 4.4, { wallMat: mats.wall, roof: 'tile', street: -1, upper: true, ajar: 0.55 });
  house(-9, -16, 7, 7, 3.5, { wallMat: mats.wall, roof: 'collapsed', street: 1, boarded: true });
  house(-8, -31, 6, 6, 4.2, { wallMat: mats.brick, roof: 'tin', street: 1, ajar: 0.2 });

  // ───────────────────────── 來不及帶走的東西 ─────────────────────────
  const pot = (x, z, s = 1) => {
    const pts = [[0.07, 0], [0.1, 0.02], [0.13, 0.2], [0.145, 0.22], [0.12, 0.22], [0.1, 0.03], [0, 0.03]].map(([r, y]) => new THREE.Vector2(r * s, y * s));
    P(new THREE.LatheGeometry(pts, 10).translate(x, 0, z), 0x7a4a34, z);
    P(new THREE.CircleGeometry(0.12 * s, 10).rotateX(-Math.PI / 2).translate(x, 0.19 * s, z), 0x1c1712, z);
    for (let i = 0; i < 4; i++) { const a = rng() * 6.28, l = (0.25 + rng() * 0.3) * s; P(cylinderBetween(V(x, 0.18 * s, z), V(x + Math.cos(a) * l * 0.5, 0.18 * s + l, z + Math.sin(a) * l * 0.5), 0.006, 0.003, 4), 0x3a2f22, z); }
  };
  const stool = (x, z, hex, fallen = false) => {
    const parts = [boxGeo(0.3, 0.03, 0.3, 0, 0.42, 0)];
    for (const a of [-1, 1]) for (const b of [-1, 1]) parts.push(cylinderBetween(V(a * 0.11, 0.42, b * 0.11), V(a * 0.15, 0, b * 0.15), 0.016, 0.02, 5));
    const g = merge(parts);
    P(xf(g, fallen ? { p: [x, 0.15, z], r: [Math.PI / 2 - 0.1, rng() * 6, 0] } : { p: [x, 0, z], r: [0, rng() * 6, 0] }), hex, z);
  };
  const barrel = (x, z, hex) => {
    const pts = [[0, 0], [0.24, 0], [0.27, 0.06], [0.28, 0.4], [0.27, 0.74], [0.24, 0.8], [0.2, 0.8], [0.2, 0.76], [0, 0.76]].map(([r, y]) => new THREE.Vector2(r, y));
    P(new THREE.LatheGeometry(pts, 14).translate(x, 0, z), hex, z);
  };
  const shoes = (x, z, hex, s = 1, single = false) => {
    for (let i = 0; i < (single ? 1 : 2); i++) P(xf(new THREE.SphereGeometry(0.06 * s, 8, 6), { p: [x + i * 0.14 * s, 0.035 * s + 0.13, z + (rng() - 0.5) * 0.05], r: [0, (rng() - 0.5) * 0.7, 0], s: [0.75, 0.55, 1.75] }), hex, z);
  };
  // 12 號（鐵捲門那戶）：門口的盆栽、紅色塑膠椅、瓦斯桶、曬衣竿上還掛著一件衣服
  pot(-9.3, 2.35); pot(-9.72, 2.3, 0.8); pot(-6.5, 2.4, 1.15);
  stool(-7.0, 2.9, 0x8c2a22); stool(-6.2, 3.4, 0x8c2a22, true);
  shoes(-8.2, 2.42, 0x22201d);
  P(new THREE.CylinderGeometry(0.16, 0.16, 0.6, 12).translate(-5.2, 0.3, 1.5), 0x7c7a6a, 1.5);
  P(new THREE.SphereGeometry(0.16, 12, 6, 0, 6.3, 0, 1.57).translate(-5.2, 0.6, 1.5), 0x7c7a6a, 1.5);
  P(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 8).translate(-5.2, 0.8, 1.5), 0x55524a, 1.5);
  for (const dx of [-10.2, -6.6]) for (const a of [-1, 1]) B.add(mats.wood, cylinderBetween(V(dx + a * 0.28, 0, 4.0), V(dx, 1.75, 4.0), 0.018, 0.018, 5), 4);
  B.add(mats.wood, cylinderBetween(V(-10.4, 1.72, 4.0), V(-6.4, 1.74, 4.0), 0.016, 0.016, 5), 4);
  {
    // 忘了收的衣服：兩片下垂的布
    const g = new THREE.PlaneGeometry(0.52, 0.62, 6, 5), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const yy = p.getY(i), xx = p.getX(i); p.setZ(i, Math.sin(xx * 9) * 0.02 * (0.5 - yy) + 0.012); }
    g.computeVertexNormals();
    P(g.clone().translate(-8.3, 1.4, 4.0), 0x8b8676, 4); P(xf(g.clone(), { r: [0, Math.PI, 0], p: [-8.3, 1.4, 4.0] }), 0x7d7868, 4);
    for (const s2 of [-1, 1]) P(xf(new THREE.PlaneGeometry(0.2, 0.4), { p: [-8.3 + s2 * 0.34, 1.52, 4.0], r: [0, 0, s2 * 0.5] }), 0x8b8676, 4);
  }
  // 15 號（門半開那戶）：靠牆的腳踏車、藍色水桶、門階上的鞋
  {
    const bx = 9.9, bz = 2.86, lean = 0.2;
    const parts = [];
    for (const dx of [-0.52, 0.52]) parts.push(new THREE.TorusGeometry(0.31, 0.017, 5, 18).rotateY(0).translate(dx, 0.33, 0));
    const hub = (dx) => V(dx, 0.33, 0);
    const seat = V(-0.16, 0.86, 0), head = V(0.38, 0.84, 0), bb = V(-0.04, 0.33, 0);
    for (const [a, b] of [[hub(-0.52), seat], [seat, head], [head, hub(0.52)], [bb, seat], [bb, head], [hub(-0.52), bb], [head, V(0.42, 1.0, 0)]]) parts.push(cylinderBetween(a, b, 0.014, 0.014, 5));
    parts.push(cylinderBetween(V(0.42, 1.0, -0.22), V(0.42, 1.0, 0.22), 0.011, 0.011, 5));
    parts.push(boxGeo(0.22, 0.04, 0.1, -0.2, 0.9, 0));
    for (const dx of [-0.52, 0.52]) for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI; parts.push(cylinderBetween(V(dx + Math.cos(a) * 0.3, 0.33 + Math.sin(a) * 0.3, 0), V(dx - Math.cos(a) * 0.3, 0.33 - Math.sin(a) * 0.3, 0), 0.003, 0.003, 3)); }
    P(xf(merge(parts), { p: [bx, 0, bz], r: [-lean, 0.06, 0] }), 0x39403a, bz);
  }
  barrel(10.65, 2.95, 0x24467a); shoes(7.55, 2.9, 0x2a2622); shoes(8.3, 2.95, 0x6a2a2a, 0.9);
  pot(5.45, 2.75, 1.1); stool(6.2, 3.3, 0x2a4c6a);
  // 21 號（塌頂那戶）：掉下來的瓦、屋裡搬出來又丟下的椅子、門階上只剩一隻的童鞋
  for (let i = 0; i < 26; i++) {
    const tx = -12 + rng() * 6.4, tz = -12.4 + rng() * 1.5, broken = rng() < 0.6;
    const g = new THREE.CylinderGeometry(0.1, 0.115, broken ? 0.1 + rng() * 0.12 : 0.3, 5, 1, true, 0, Math.PI * (broken ? 0.5 + rng() * 0.4 : 1)).rotateX(Math.PI / 2);
    B.add(mats.tile, xf(g, { p: [tx, 0.02 + rng() * 0.05, tz], r: [(rng() - 0.5) * 0.4, rng() * 6.28, rng() < 0.3 ? Math.PI : (rng() - 0.5) * 0.4] }), tz);
  }
  for (let i = 0; i < 5; i++) B.add(mats.wood, xf(boxGeo(0.09, 0.07, 1.4 + rng() * 1.4, 0, 0, 0, 1), { p: [-11.5 + rng() * 5, 0.06 + i * 0.03, -11.9 + rng() * 0.9], r: [(rng() - 0.5) * 0.2, rng() * 3, (rng() - 0.5) * 0.2] }), -12);
  stool(-7.4, -11.9, 0x8c2a22, true); shoes(-9.1, -12.2, 0x9a3f4a, 0.62, true); pot(-10.9, -12.25, 0.9);
  // 27 號：門口一排空盆、倒掉的藍桶
  for (let i = 0; i < 4; i++) pot(-10.2 + i * 0.42, -27.72, 0.8 + rng() * 0.3);
  P(xf(new THREE.CylinderGeometry(0.26, 0.24, 0.72, 12, 1, true), { p: [-5.9, 0.26, -27.4], r: [Math.PI / 2 - 0.05, 0.7, 0] }), 0x24467a, -27.4);
  stool(-6.6, -27.55, 0x8c2a22);

  // ───────────────────────── 路緣、雜草、落石、山坡 ─────────────────────────
  for (const side of [-1, 1]) {
    for (let z0 = -35; z0 < 37; z0 += 2) {
      if (z0 > 6.4 && z0 < 13.6) continue;                       // 石橋
      if (side > 0 && z0 > -15 && z0 < -10.5) continue;           // 作坊前的出入口
      if (rng() < 0.12) continue;                                // 缺塊
      const len = 1.86 + rng() * 0.1;
      B.add(mats.concrete, xf(boxGeo(0.2, 0.17, len, 0, 0, 0, 1.2), { p: [side * (2.72 + (rng() - 0.5) * 0.05), 0.05 + (rng() - 0.5) * 0.03, z0 + 1], r: [(rng() - 0.5) * 0.04, (rng() - 0.5) * 0.05, (rng() - 0.5) * 0.08] }), z0 + 1);
    }
    weedLine(side * 2.9, -35, side * 2.9, 36, 90, 0.3);
    weedLine(side * 4.2, -35, side * 4.6, 36, 46, 1.4);
  }
  for (let i = 0; i < 26; i++) tuft((rng() - 0.5) * 4.6, -36 + rng() * 72, 0.5 + rng() * 0.5); // 柏油裂縫裡長出來的
  // 路旁的落石（平滑、半埋）
  for (let i = 0; i < 56; i++) {
    const s = 0.1 + rng() * rng() * 0.5, x = (rng() > 0.5 ? 1 : -1) * (3.0 + rng() * 2.2), z = rng() * 82 - 42;
    if (x > 4.6 && z < -14 && z > -23) continue;
    B.add(mats.rock, xf(rockGeo(i, s), { p: [x, s * 0.12, z], r: [0, rng() * 6.28, (rng() - 0.5) * 0.3] }), z);
  }
  // 堵住山路的落石堆（出生點後方，說明為什麼把車停在這裡）
  for (let i = 0; i < 16; i++) {
    const s = 0.35 + rng() * 0.75, x = (rng() - 0.5) * 7.5, z = 36.2 + rng() * 2.6;
    B.add(mats.rock, xf(rockGeo(100 + i, s, 1, 0.7), { p: [x, s * 0.3, z], r: [(rng() - 0.5) * 0.4, rng() * 6.28, (rng() - 0.5) * 0.4] }), z);
  }
  world?.box(-8, 36.1, 8, 39.5, 0, 3); // 落石把來時的路堵死了
  // 兩側的山坡：平滑起伏的土丘，取代原本稜角分明的多面體
  for (let i = 0; i < 22; i++) {
    const side = i % 2 ? 1 : -1, r = 6 + rng() * 6;
    const x = side * (23 + rng() * 13), z = rng() * 100 - 50;
    B.add(mats.rock, xf(rockGeo(200 + i, r, 2, 0.5 + rng() * 0.45), { p: [x, 0.2, z], r: [0, rng() * 6.28, 0] }), z);
  }

  // ───────────────────────── 候車亭的細節 ─────────────────────────
  B.add(mats.tin, xf(boxGeo(3.7, 0.03, 2.4, 0, 0, 0, 1.2), { p: [-4.6, 2.82, 22], r: [0.07, 0, 0] }), 22);
  B.add(glass, boxGeo(2.5, 1.5, 0.02, -4.85, 1.65, 21.27), 22); // 背板在時刻表後方，不擋住調查視線
  B.add(mats.iron, boxGeo(2.5, 0.05, 0.05, -4.85, 0.92, 21.27, 1), 22);
  B.add(mats.iron, new THREE.CylinderGeometry(0.03, 0.03, 2.5, 8).translate(-6.55, 1.25, 20.8), 20.8);
  P(new THREE.CylinderGeometry(0.24, 0.24, 0.025, 20).rotateX(Math.PI / 2).translate(-6.55, 2.35, 20.8), 0x24467a, 20.8);
  P(new THREE.CylinderGeometry(0.17, 0.17, 0.03, 20).rotateX(Math.PI / 2).translate(-6.55, 2.35, 20.8), 0xb9b4a2, 20.8);
  weedLine(-6.2, 21.2, -3.4, 21.2, 6); weedLine(-6.2, 22.85, -3.4, 22.85, 6);

  // ───────────────────────── 橋頭的小土地公祠 ─────────────────────────
  {
    const x = 4.35, z = 14.6;
    B.add(mats.concrete, boxGeo(1.2, 0.3, 1.0, x, 0.15, z, 1.2), z);
    B.add(mats.brick, boxGeo(0.95, 0.75, 0.12, x, 0.675, z - 0.36, 1.4), z);
    for (const s2 of [-1, 1]) B.add(mats.brick, boxGeo(0.12, 0.75, 0.78, x + s2 * 0.42, 0.675, z, 1.4), z);
    B.add(mats.dark, boxGeo(0.7, 0.72, 0.04, x, 0.66, z - 0.28), z);
    for (const sg of [1, -1]) B.add(mats.tile, xf(boxGeo(1.3, 0.05, 0.72, 0, 0, 0, 1.3), { p: [x, 1.2, z + sg * 0.3], r: [sg * 0.5, 0, 0] }), z);
    B.add(mats.concrete, boxGeo(1.36, 0.07, 0.12, x, 1.39, z, 1), z);
    // 祠裡的小石像與香爐
    P(new THREE.LatheGeometry([[0, 0], [0.11, 0], [0.12, 0.1], [0.09, 0.2], [0.1, 0.28], [0.06, 0.33], [0.075, 0.4], [0.05, 0.47], [0, 0.48]].map(([r, y]) => new THREE.Vector2(r, y)), 10).translate(x, 0.3, z - 0.12), 0x6a6a60, z);
    P(new THREE.CylinderGeometry(0.082, 0.082, 0.04, 10, 1, true).translate(x, 0.71, z - 0.12), 0x7d1f1a, z); // 連這裡的神像也被矇上紅布
    P(new THREE.CylinderGeometry(0.07, 0.05, 0.08, 10).translate(x, 0.34, z + 0.22), 0x5a4a2a, z);
    B.add(coupletA, new THREE.PlaneGeometry(0.1, 0.66).translate(x + 0.42, 0.68, z + 0.395), z, false);
    B.add(coupletB, new THREE.PlaneGeometry(0.1, 0.66).translate(x - 0.42, 0.68, z + 0.395), z, false);
    weedLine(x - 0.7, z + 0.6, x + 0.7, z + 0.6, 8);
    world?.circle(x, z, 0.62, 0, 1.6);
  }

  // ───────────────────────── 榮昌紙紮行的外觀 ─────────────────────────
  {
    // 單斜的鏽鐵皮屋頂（壓著幾塊磚）、門口的遮雨棚、焚化爐的磚煙囪
    B.add(mats.tin, xf(boxGeo(8.3, 0.04, 9.4, 0, 0, 0, 1.3), { p: [8.5, 4.2, -18.5], r: [0, 0, 0.07] }), -18.5);
    for (const [x, z] of [[6.2, -15.6], [9.4, -20.2], [11.2, -17.1], [7.3, -21.6]]) B.add(mats.brick, xf(boxGeo(0.22, 0.07, 0.11, 0, 0, 0, 0.5), { p: [x, 4.26 + (x - 8.5) * 0.07, z], r: [0, rng() * 3, 0.07] }), z);
    B.add(mats.tin, xf(boxGeo(7.4, 0.03, 1.5, 0, 0, 0, 1.3), { p: [8.5, 2.98, -13.82], r: [0.24, 0, 0] }), -13.8);
    for (const x of [5.3, 8.5, 11.7]) B.add(mats.iron, cylinderBetween(V(x, 2.62, -14.38), V(x, 2.86, -13.2), 0.02, 0.02, 5), -13.8);
    B.add(mats.brick, boxGeo(0.52, 2.5, 0.42, 6.65, 3.2, -22.12, 1.2), -22);
    B.add(mats.concrete, boxGeo(0.64, 0.08, 0.54, 6.65, 4.47, -22.12, 1), -22);
    weedLine(5.0, -14.3, 7.0, -14.3, 6); weedLine(10.0, -14.3, 12.0, -14.3, 6); weedLine(12.25, -22.5, 12.25, -14.5, 14); weedLine(4.75, -22.5, 4.75, -14.5, 14);
  }

  // ───────────────────────── 電線桿上的東西 ─────────────────────────
  for (const [x, z] of [[-3, 27], [3, 3], [-3, -26]]) {
    P(new THREE.CylinderGeometry(0.19, 0.19, 0.5, 10).translate(x + 0.26, 4.7, z), 0x4c504b, z);
    B.add(mats.iron, cylinderBetween(V(x, 5.2, z), V(x + (x < 0 ? 1.3 : -1.3), 5.45, z), 0.022, 0.022, 5), z);
    P(boxGeo(0.34, 0.07, 0.16, x + (x < 0 ? 1.4 : -1.4), 5.42, z), 0x2a2c29, z);
    weedLine(x - 0.3, z - 0.3, x + 0.3, z + 0.3, 4, 0.3);
  }

  // ───────────────────────── 停在落石前的車 ─────────────────────────
  {
    const cx = -4.6, cz = 32.0, W = 1.74;
    // 側面輪廓（z 向前為負：車頭朝村子），沿車寬擠出並倒角
    const s = new THREE.Shape();
    s.moveTo(-1.86, 0.33);
    s.lineTo(-1.86, 0.62); s.quadraticCurveTo(-1.84, 0.78, -1.62, 0.82);
    s.lineTo(-0.86, 0.93); s.lineTo(-0.34, 1.4); s.quadraticCurveTo(-0.2, 1.46, 0.1, 1.46);
    s.lineTo(0.84, 1.44); s.quadraticCurveTo(1.0, 1.42, 1.1, 1.32);
    s.lineTo(1.6, 0.98); s.lineTo(1.82, 0.95); s.quadraticCurveTo(1.88, 0.9, 1.88, 0.78);
    s.lineTo(1.88, 0.33);
    s.lineTo(1.5, 0.33); s.absarc(1.13, 0.33, 0.37, 0, Math.PI, false);
    s.lineTo(-0.82, 0.33); s.absarc(-1.19, 0.33, 0.37, 0, Math.PI, false);
    s.lineTo(-1.86, 0.33);
    const body = new THREE.ExtrudeGeometry(s, { depth: W - 0.14, bevelEnabled: true, bevelSize: 0.07, bevelOffset: -0.07, bevelThickness: 0.07, bevelSegments: 2, curveSegments: 8 });
    // Extrude 在 XY 平面、沿 +Z 擠出：把 shape 的 x 轉成世界 z、擠出方向轉成世界 x
    body.translate(0, 0, -(W - 0.14) / 2); body.rotateY(-Math.PI / 2);
    B.add(carPaint, body.translate(cx, 0, cz), cz);
    // 車窗：側窗、前後擋
    const sideWin = new THREE.Shape();
    sideWin.moveTo(-0.8, 0.96); sideWin.lineTo(-0.36, 1.36); sideWin.lineTo(0.84, 1.36); sideWin.lineTo(1.22, 1.06); sideWin.lineTo(1.3, 0.98); sideWin.lineTo(-0.8, 0.96);
    for (const sd of [-1, 1]) {
      const g = new THREE.ShapeGeometry(sideWin).rotateY(-Math.PI / 2);
      B.add(glass, g.translate(cx + sd * (W / 2 + 0.004), 0, cz), cz);
      B.add(carPaint, boxGeo(0.02, 0.42, 0.07, cx + sd * (W / 2 + 0.008), 1.16, cz + 0.22), cz); // B 柱
      P(boxGeo(0.1, 0.07, 0.16, cx + sd * (W / 2 + 0.07), 1.0, cz - 0.72), 0x2a2e2e, cz);         // 後照鏡
      P(boxGeo(0.02, 0.025, 0.12, cx + sd * (W / 2 + 0.012), 0.92, cz - 0.3), 0x1c1e1e, cz);      // 門把
      P(boxGeo(0.02, 0.025, 0.12, cx + sd * (W / 2 + 0.012), 0.92, cz + 0.62), 0x1c1e1e, cz);
    }
    const slab = (w, len, y, zz, rx) => xf(new THREE.PlaneGeometry(w, len), { p: [cx, y, cz + zz], r: [rx, 0, 0] });
    B.add(glass, slab(1.44, 0.68, 1.174, -0.608, Math.PI / 2 - 0.735), cz); // 前擋
    B.add(glass, slab(1.4, 0.56, 1.16, 1.357, -0.977), cz);                 // 後擋
    // 保險桿、水箱護罩、牌照、尾燈
    P(boxGeo(W + 0.04, 0.2, 0.16, cx, 0.45, cz - 1.86), 0x1b1d1d, cz); P(boxGeo(W + 0.04, 0.2, 0.16, cx, 0.45, cz + 1.88), 0x1b1d1d, cz);
    P(boxGeo(0.9, 0.13, 0.03, cx, 0.69, cz - 1.93), 0x0d0e0e, cz);
    P(boxGeo(0.36, 0.11, 0.012, cx, 0.5, cz + 1.965), 0xa9a594, cz);
    for (const sd of [-1, 1]) P(boxGeo(0.3, 0.12, 0.03, cx + sd * 0.66, 0.84, cz + 1.955), 0x5a1310, cz);
    // 輪胎與鋼圈
    for (const sd of [-1, 1]) for (const wz of [-1.19, 1.13]) {
      B.add(mats.dark, new THREE.CylinderGeometry(0.33, 0.33, 0.2, 18).rotateZ(Math.PI / 2).translate(cx + sd * (W / 2 - 0.08), 0.33, cz + wz), cz);
      B.add(mats.iron, new THREE.CylinderGeometry(0.19, 0.19, 0.205, 12).rotateZ(Math.PI / 2).translate(cx + sd * (W / 2 - 0.078), 0.33, cz + wz), cz);
    }
    B.add(mats.dark, boxGeo(W - 0.3, 0.1, 3.3, cx, 0.3, cz), cz, false); // 底盤的陰影
  }

  // ───────────────────────── 收尾 ─────────────────────────
  B.build(scene);
  painted.forEach((list) => {
    if (!list.length) return;
    const m = new THREE.Mesh(mergeGeometries(list, false), paint);
    m.name = 'VillagePainted'; m.castShadow = true; m.receiveShadow = true; scene.add(m);
  });
  if (weeds.length) {
    const m = new THREE.Mesh(merge(weeds), weed);
    m.name = 'VillageWeeds'; m.receiveShadow = true; scene.add(m);
  }
  return { dispose() { owned.materials.forEach((m) => m.dispose()); owned.textures.forEach((t) => t.dispose()); } };
}
