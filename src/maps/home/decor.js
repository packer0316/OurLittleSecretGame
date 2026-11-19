import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { boxGeo, xf, merge, mulberry32, fbm, cylinderBetween } from '../../core/utils.js';
import { weather } from '../../core/weathering.js';

/**
 * 住處的生活感：這是一間有人住的套房，不是空房間。
 * 床（被子只鋪了一半）、衣櫃、小冰箱、窗簾、冷氣、地毯、掛鐘、牆上的畫、門邊的外套與雨傘、還沒拆的紙箱。
 * 靜態幾何依材質合併：木作、布料兩種、上漆小物（頂點色）、一張貼圖圖集，共五個網格。
 * 新增的碰撞只在原本就空著的牆角，不影響既有動線。
 */

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function tint(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return g;
}

/** 圖集：上方是地毯，左下是牆上的畫，右下是掛鐘 */
function decorAtlas() {
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), rng = mulberry32(1142);
  // 地毯 512×320：褪色的幾何織紋，邊緣有流蘇
  g.fillStyle = '#3f2e2a'; g.fillRect(0, 0, 512, 320);
  g.fillStyle = '#2c3438'; g.fillRect(28, 28, 456, 264);
  g.strokeStyle = '#6f6248'; g.lineWidth = 5; g.strokeRect(40, 40, 432, 240);
  for (let k = 0; k < 5; k++) {
    const cx = 96 + k * 80, cy = 160;
    g.fillStyle = k % 2 ? '#553530' : '#63583f';
    g.beginPath(); g.moveTo(cx, cy - 70); g.lineTo(cx + 34, cy); g.lineTo(cx, cy + 70); g.lineTo(cx - 34, cy); g.closePath(); g.fill();
    g.fillStyle = '#26323a'; g.beginPath(); g.moveTo(cx, cy - 34); g.lineTo(cx + 16, cy); g.lineTo(cx, cy + 34); g.lineTo(cx - 16, cy); g.closePath(); g.fill();
  }
  for (let y = 0; y < 320; y += 2) { g.fillStyle = `rgba(0,0,0,${0.05 + rng() * 0.12})`; g.fillRect(0, y, 512, 1); }
  for (let i = 0; i < 46; i++) { const x = rng() * 512, y = rng() * 320, r = 12 + rng() * 60; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${rng() < 0.6 ? '20,16,12' : '150,140,120'},${0.06 + rng() * 0.16})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
  for (let x = 4; x < 512; x += 7) { g.fillStyle = '#9a8a68'; g.fillRect(x, 0, 2, 9 + rng() * 5); g.fillRect(x, 320 - 9 - rng() * 5, 2, 14); }
  // 牆上的畫 256×192：一張曬到褪色的山景攝影（玻璃後面）
  const px = 0, py = 320;
  const sky = g.createLinearGradient(0, py, 0, py + 192); sky.addColorStop(0, '#8d9790'); sky.addColorStop(0.6, '#a9a48f'); sky.addColorStop(1, '#6f6a58');
  g.fillStyle = sky; g.fillRect(px, py, 256, 192);
  for (let k = 0; k < 4; k++) {
    g.fillStyle = ['#6a7268', '#525a50', '#3b4239', '#272c26'][k];
    g.beginPath(); g.moveTo(px, py + 192);
    for (let x = 0; x <= 256; x += 8) g.lineTo(px + x, py + 80 + k * 24 - fbm(x * 0.012 + k * 5, k * 3.1, 3) * 70);
    g.lineTo(px + 256, py + 192); g.closePath(); g.fill();
  }
  g.fillStyle = 'rgba(210,205,185,0.18)'; g.fillRect(px, py, 256, 192);
  g.strokeStyle = '#1d1a16'; g.lineWidth = 12; g.strokeRect(px + 6, py + 6, 244, 180);
  g.strokeStyle = '#b5ae9a'; g.lineWidth = 10; g.strokeRect(px + 17, py + 17, 222, 158);
  // 掛鐘 192×192：指針停在 11:42
  const cx = 256 + 96, cy = 320 + 96;
  g.fillStyle = '#2a2622'; g.fillRect(256, 320, 192, 192);
  g.fillStyle = '#bdb6a2'; g.beginPath(); g.arc(cx, cy, 84, 0, 6.3); g.fill();
  g.strokeStyle = '#3a342c'; g.lineWidth = 7; g.beginPath(); g.arc(cx, cy, 86, 0, 6.3); g.stroke();
  g.fillStyle = '#2a2622';
  for (let h = 0; h < 12; h++) { const a = (h / 12) * 6.283; g.save(); g.translate(cx + Math.sin(a) * 70, cy - Math.cos(a) * 70); g.rotate(a); g.fillRect(-2, -7, 4, h % 3 ? 8 : 14); g.restore(); }
  const hand = (a, len, w) => { g.save(); g.translate(cx, cy); g.rotate(a); g.fillRect(-w / 2, -len, w, len + 8); g.restore(); };
  hand(((11 + 42 / 60) / 12) * 6.283, 44, 6); hand((42 / 60) * 6.283, 66, 4);
  g.beginPath(); g.arc(cx, cy, 5, 0, 6.3); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const R = (x, y, w, h) => [x / 512, 1 - (y + h) / 512, (x + w) / 512, 1 - y / 512];
function remap(geo, r) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, r[0] + uv.getX(i) * (r[2] - r[0]), r[1] + uv.getY(i) * (r[3] - r[1]));
  return geo;
}

export function buildHomeDecor({ scene, world, mats }) {
  const rng = mulberry32(2342);
  const { wood, textile, plaster, floor } = mats;
  // 牆與天花：室內粉刷牆的使用痕跡——窗下與天花板邊緣的水痕、踢腳板上方的髒污
  // 有人住的房間：只留很淡的色差、天花板邊緣的陳年水痕、踢腳板上方的灰
  weather(plaster, { levels: [0], blotch: 0.3, streak: 0.14, damp: 0.3, dampH: 0.35, dampTint: 0x9a9284, soot: 0.22, ceil: 3.06, sootTint: 0x7d766a, scale: 3.4, fine: 1.1, streakW: 0.6, streakL: 9 });
  weather(floor, { levels: [0], blotch: 0.32, streak: 0, damp: 0, scale: 2.8, fine: 0.9 });

  const own = [];
  const mk = (m) => { own.push(m); return m; };
  const bedding = mk(new THREE.MeshStandardMaterial({ color: 0x4f5b64, normalMap: textile.normalMap, roughness: 1 }));
  const curtain = mk(new THREE.MeshStandardMaterial({ color: 0x7c7566, normalMap: textile.normalMap, roughness: 1, side: THREE.DoubleSide }));
  const paint = mk(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.04 }));
  const atlasTex = decorAtlas();
  const atlas = mk(new THREE.MeshStandardMaterial({ map: atlasTex, color: 0x9a948a, roughness: 0.95 }));
  const lists = { wood: [], bedding: [], curtain: [], paint: [], atlas: [], noShadow: [] };
  const W = (g) => lists.wood.push(g);
  const P = (g, hex) => lists.paint.push(tint(g, hex));
  const rbox = (w, h, d, x, y, z, r = 0.03) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, h / 2.2, d / 2.2, w / 2.2)).translate(x, y, z);

  // ── 床：靠南牆的單人床，被子掀開一半 ──
  {
    const x0 = -3.92, x1 = -1.9, zc = 3.36;
    W(boxGeo(x1 - x0, 0.26, 1.04, (x0 + x1) / 2, 0.15, zc, 1.4));
    W(boxGeo(0.06, 0.92, 1.06, x0 + 0.03, 0.46, zc, 1.4));
    W(boxGeo(0.05, 0.4, 1.06, x1 - 0.025, 0.2, zc, 1.4));
    P(rbox(x1 - x0 - 0.1, 0.2, 0.98, (x0 + x1) / 2 + 0.03, 0.38, zc, 0.06), 0x9c978a);
    P(xf(rbox(0.54, 0.13, 0.38, 0, 0, 0, 0.06), { p: [x0 + 0.42, 0.545, zc + 0.04], r: [0, 0.12, 0.05] }), 0xaaa594);
    // 被子：一張有皺褶的布，床頭那一側被掀開、堆成一團
    const duvet = new THREE.PlaneGeometry(1.5, 1.14, 22, 14).rotateX(-Math.PI / 2);
    const p = duvet.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) / 1.5 + 0.5, v = p.getZ(i) / 1.14 + 0.5;       // u: 0 床頭側 … 1 床尾
      const fold = Math.max(0, 1 - u * 3.2);                              // 床頭側掀起的部分
      let y = 0.045 + fbm(u * 5 + 3, v * 5, 3) * 0.07 + fold * (0.16 + 0.1 * Math.sin(v * 9));
      const edge = Math.max(0, Math.abs(v - 0.5) * 2 - 0.82) / 0.18;      // 兩側垂下床沿
      y -= edge * edge * 0.24;
      p.setXYZ(i, p.getX(i) + fold * 0.22, y, p.getZ(i));
    }
    duvet.computeVertexNormals();
    lists.bedding.push(duvet.translate(x1 - 0.78, 0.47, zc));
    world.box(x0 - 0.04, zc - 0.56, x1 + 0.04, zc + 0.6, 0, 0.7);
    // 床邊凳：鬧鐘、水杯、一板吃到一半的藥
    W(boxGeo(0.4, 0.04, 0.36, -1.58, 0.44, 3.56, 0.8));
    for (const a of [-1, 1]) for (const b of [-1, 1]) W(boxGeo(0.035, 0.42, 0.035, -1.58 + a * 0.16, 0.21, 3.56 + b * 0.14, 0.8));
    P(rbox(0.11, 0.08, 0.05, -1.66, 0.5, 3.6, 0.012), 0x2c2e2c);
    P(new THREE.CylinderGeometry(0.03, 0.026, 0.1, 12, 1, true).translate(-1.48, 0.51, 3.5), 0x8f9a98);
    P(boxGeo(0.09, 0.006, 0.05, -1.56, 0.463, 3.46), 0xb9b5a6);
    world.box(-1.8, 3.36, -1.36, 3.76, 0, 0.5);
  }

  // ── 衣櫃：東牆，電視櫃與玄關櫃之間；櫃頂壓著行李箱與紙箱 ──
  {
    const x = 3.64, z = 1.26;
    W(boxGeo(0.56, 2.0, 1.3, x, 1.0, z, 1.6));
    W(boxGeo(0.6, 0.05, 1.34, x, 2.02, z, 1.6));
    for (const dz of [-0.325, 0.325]) { W(boxGeo(0.02, 1.84, 0.61, x - 0.288, 1.02, z + dz, 1.6)); P(boxGeo(0.02, 0.16, 0.022, x - 0.305, 1.05, z + dz * 0.12), 0x7a6a48); }
    P(boxGeo(0.012, 1.9, 0.012, x - 0.283, 1.02, z), 0x0c0b0a);
    P(xf(rbox(0.42, 0.22, 0.66, 0, 0, 0, 0.03), { p: [x + 0.02, 2.16, z - 0.2], r: [0, 0.08, 0] }), 0x27323c);
    P(boxGeo(0.4, 0.26, 0.4, x + 0.02, 2.18, z + 0.42), 0x80653f);
    P(boxGeo(0.404, 0.006, 0.07, x + 0.02, 2.312, z + 0.42), 0x9a8a62);
    world.box(x - 0.3, z - 0.67, x + 0.32, z + 0.67, 0, 2.1);
  }

  // ── 小冰箱：東北角，上面是電熱水壺和吃完沒收的泡麵碗 ──
  {
    const x = 3.64, z = -2.68;
    P(rbox(0.52, 0.86, 0.52, x, 0.43, z, 0.025), 0x9f9d92);
    P(boxGeo(0.008, 0.012, 0.5, x - 0.262, 0.6, z), 0x1a1a18);
    P(boxGeo(0.02, 0.2, 0.025, x - 0.272, 0.42, z + 0.19), 0x55554e);
    P(new THREE.LatheGeometry([[0, 0], [0.075, 0], [0.085, 0.03], [0.08, 0.16], [0.062, 0.2], [0, 0.2]].map(([r, y]) => new THREE.Vector2(r, y)), 14).translate(x + 0.05, 0.86, z + 0.1), 0x6c7072);
    P(xf(new THREE.TorusGeometry(0.05, 0.008, 5, 12, Math.PI), { p: [x + 0.05, 0.96, z + 0.19], r: [0, Math.PI / 2, -Math.PI / 2] }), 0x1c1c1a);
    P(new THREE.CylinderGeometry(0.075, 0.05, 0.085, 14, 1, true).translate(x - 0.08, 0.905, z - 0.12), 0xa59a82);
    P(cylinderBetween(V(x - 0.12, 0.9, z - 0.16), V(x - 0.02, 0.975, z - 0.06), 0.003, 0.003, 4), 0x8a7a55);
    world.box(x - 0.27, z - 0.27, x + 0.3, z + 0.27, 0, 1.0);
  }

  // ── 窗簾與冷氣 ──
  {
    const zc = -3.8;
    P(new THREE.CylinderGeometry(0.012, 0.012, 3.7, 8).rotateZ(Math.PI / 2).translate(0.75, 2.66, zc), 0x2a2826);
    for (const [xc, w] of [[-1.0, 0.62], [2.5, 0.56]]) {
      const g = new THREE.PlaneGeometry(w, 1.82, 24, 8), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const u = p.getX(i) / w + 0.5, v = 0.5 - p.getY(i) / 1.82;
        p.setZ(i, Math.sin(u * Math.PI * 9) * 0.04 * (0.55 + 0.45 * v) + Math.sin(u * 23 + v * 3) * 0.008);
        p.setX(i, p.getX(i) * (1 - 0.1 * Math.sin(v * Math.PI)));
      }
      g.computeVertexNormals();
      const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.9, uv.getY(i) * 1.6);
      lists.curtain.push(g.translate(xc, 2.66 - 0.91, zc));
    }
    P(rbox(0.84, 0.27, 0.2, 0.75, 2.86, -3.81, 0.03), 0xa3a197);
    P(boxGeo(0.72, 0.03, 0.012, 0.75, 2.76, -3.705), 0x24231f);
    P(cylinderBetween(V(1.19, 2.8, -3.86), V(2.36, 2.74, -3.9), 0.014, 0.014, 6), 0x9a988c);
  }

  // ── 天花板的吸頂燈（沒開）、牆上的開關與插座 ──
  P(new THREE.CylinderGeometry(0.21, 0.24, 0.07, 22).translate(0, 3.005, -0.2), 0x9d9a8c);
  P(new THREE.CylinderGeometry(0.245, 0.245, 0.016, 22).translate(0, 3.035, -0.2), 0x55524a);
  P(boxGeo(0.085, 0.12, 0.012, 2.52, 1.24, 3.904), 0xa9a69a); P(boxGeo(0.03, 0.045, 0.006, 2.52, 1.24, 3.896), 0x8f8c80);
  P(boxGeo(0.012, 0.11, 0.075, 3.904, 0.3, -3.4), 0xa9a69a);

  // ── 地毯、門墊、牆上的畫、掛鐘（同一張圖集）──
  lists.atlas.push(remap(new THREE.PlaneGeometry(2.3, 1.44).rotateX(-Math.PI / 2).rotateY(0.06), R(0, 0, 512, 320)).translate(-0.95, 0.006, 0.75));
  lists.atlas.push(remap(new THREE.PlaneGeometry(0.8, 0.46).rotateX(-Math.PI / 2), R(60, 40, 392, 240)).translate(1.65, 0.006, 3.32));
  lists.atlas.push(remap(new THREE.PlaneGeometry(0.72, 0.54).rotateY(Math.PI / 2), R(0, 320, 256, 192)).translate(-3.9, 1.78, 0.62));
  lists.atlas.push(remap(new THREE.CircleGeometry(0.17, 28).rotateY(-Math.PI / 2), R(256 + 10, 320 + 10, 172, 172)).translate(3.882, 2.12, -0.7));
  P(new THREE.CylinderGeometry(0.178, 0.178, 0.03, 28).rotateZ(Math.PI / 2).translate(3.9, 2.12, -0.7), 0x26221e);

  // ── 玄關：櫃子的門片與把手、掛在牆上的外套、靠牆的雨傘、門邊的鞋 ──
  for (const dx of [-0.175, 0.175]) { W(boxGeo(0.33, 0.37, 0.016, 2.95 + dx, 0.235, 2.432, 0.9)); P(boxGeo(0.014, 0.08, 0.016, 2.95 + dx * 0.16, 0.3, 2.42), 0x7a6a48); }
  P(boxGeo(0.7, 0.03, 0.5, 2.95, 0.012, 2.7), 0x151412);
  {
    // 外套：掛在門左側牆上的掛鉤，肩線垂下來的布
    const g = new THREE.PlaneGeometry(0.46, 0.82, 10, 8), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) / 0.46, v = 0.5 - p.getY(i) / 0.82;
      p.setZ(i, -0.05 - 0.05 * Math.cos(u * Math.PI) * (1 - v * 0.5) + Math.sin(u * 14) * 0.012 * v);
      p.setX(i, p.getX(i) * (1 - 0.35 * Math.max(0, 0.18 - v) / 0.18));
    }
    g.computeVertexNormals();
    P(xf(g, { p: [0.52, 1.36, 3.9], r: [0, Math.PI, 0] }), 0x2f3a36);
    P(boxGeo(0.05, 0.03, 0.06, 0.52, 1.79, 3.88), 0x4a4640);
    P(cylinderBetween(V(0.9, 0.0, 3.84), V(0.86, 0.86, 3.9), 0.022, 0.014, 7), 0x1d2530);
    P(xf(new THREE.TorusGeometry(0.035, 0.008, 5, 10, Math.PI), { p: [0.86, 0.89, 3.9], r: [0, Math.PI / 2, 0] }), 0x3a2c1e);
    for (let i = 0; i < 2; i++) P(xf(new THREE.SphereGeometry(0.06, 8, 6), { p: [2.36 + i * 0.13, 0.035, 3.62 - i * 0.03], r: [0, 0.2 - i * 0.3, 0], s: [0.72, 0.55, 1.9] }), 0x6f6a5c);
  }

  // ── 書桌上與書桌旁：書堆、筆筒、牆上的便利貼、桌下的垃圾桶與延長線 ──
  {
    let y = 0.836;
    for (const [w, h, d, hex, r] of [[0.2, 0.035, 0.27, 0x394644, 0.1], [0.19, 0.028, 0.26, 0x6a5a3c, -0.16], [0.17, 0.04, 0.24, 0x4a3430, 0.3]]) { P(xf(boxGeo(w, h, d, 0, 0, 0), { p: [1.04, y + h / 2, -2.94], r: [0, r, 0] }), hex); y += h; }
    P(new THREE.CylinderGeometry(0.036, 0.032, 0.095, 12, 1, true).translate(1.2, 0.883, -2.74), 0x2a2c2e);
    for (let i = 0; i < 4; i++) P(cylinderBetween(V(1.2 + (rng() - 0.5) * 0.03, 0.85, -2.74 + (rng() - 0.5) * 0.03), V(1.2 + (rng() - 0.5) * 0.07, 1.0 + rng() * 0.03, -2.74 + (rng() - 0.5) * 0.07), 0.004, 0.004, 4), [0x1a1a1a, 0x7a2a22, 0x22406a, 0x8a7a40][i]);
    for (const [x, yy, hex, rz] of [[-1.18, 1.52, 0xb5a85a, 0.06], [-1.04, 1.66, 0xa9b08a, -0.08], [-1.3, 1.72, 0xb5a85a, -0.03], [-1.12, 1.36, 0xb89a8a, 0.1]]) P(xf(new THREE.PlaneGeometry(0.075, 0.075), { p: [x, yy, -3.905], r: [0.06, 0, rz] }), hex);
    P(new THREE.CylinderGeometry(0.13, 0.105, 0.28, 14, 1, true).translate(-0.98, 0.14, -2.76), 0x35393a);
    for (let i = 0; i < 4; i++) P(xf(new THREE.IcosahedronGeometry(0.045 + rng() * 0.02, 0), { p: [-0.98 + (rng() - 0.5) * 0.12, 0.2 + rng() * 0.1, -2.76 + (rng() - 0.5) * 0.12], r: [rng() * 3, rng() * 3, 0] }), 0xa9a48f);
    P(rbox(0.26, 0.03, 0.055, 1.62, 0.016, -3.2, 0.01), 0x96948a);
  }

  // ── 書架旁還沒拆的紙箱（搬進來兩年了）──
  {
    const x = -3.52, z = -1.72;
    P(xf(boxGeo(0.5, 0.36, 0.42, 0, 0, 0), { p: [x, 0.18, z], r: [0, 0.12, 0] }), 0x7c6240);
    P(xf(boxGeo(0.44, 0.3, 0.38, 0, 0, 0), { p: [x + 0.03, 0.51, z - 0.02], r: [0, -0.2, 0] }), 0x85693f);
    P(xf(boxGeo(0.445, 0.004, 0.06, 0, 0, 0), { p: [x + 0.03, 0.662, z - 0.02], r: [0, -0.2, 0] }), 0x9c8c64);
    P(xf(boxGeo(0.505, 0.004, 0.06, 0, 0, 0), { p: [x, 0.362, z], r: [0, 0.12, 0] }), 0x9c8c64);
    world.circle(x, z, 0.33, 0, 0.7);
  }

  // ── 沙發前的矮茶几：遙控器、馬克杯、吃到一半的便當盒、攤開的雜誌 ──
  {
    const x = -1.95, z = 0.72, top = 0.4;
    W(boxGeo(0.5, 0.035, 0.92, x, top - 0.018, z, 1.1));
    W(boxGeo(0.42, 0.025, 0.84, x, 0.14, z, 1.1));
    for (const a of [-1, 1]) for (const b of [-1, 1]) W(boxGeo(0.04, top - 0.03, 0.04, x + a * 0.21, (top - 0.03) / 2, z + b * 0.42, 0.8));
    P(rbox(0.045, 0.02, 0.16, x + 0.08, top + 0.01, z - 0.26, 0.008), 0x1e1f20);
    P(new THREE.CylinderGeometry(0.04, 0.035, 0.09, 12, 1, true).translate(x - 0.1, top + 0.045, z - 0.3), 0x8b8676);
    P(rbox(0.2, 0.045, 0.15, x - 0.05, top + 0.023, z + 0.05, 0.012), 0xa59a82);
    P(xf(boxGeo(0.21, 0.004, 0.29, 0, 0, 0), { p: [x + 0.04, top + 0.003, z + 0.3], r: [0, 0.25, 0] }), 0x6f7d86);
    P(xf(boxGeo(0.21, 0.004, 0.29, 0, 0, 0), { p: [x + 0.03, 0.155, z - 0.1], r: [0, -0.2, 0] }), 0x8a6f58);
    world.box(x - 0.25, z - 0.46, x + 0.25, z + 0.46, 0, 0.45);
  }

  // ── 窗邊的摺疊曬衣架：兩條沒收的毛巾、一件 T 恤 ──
  {
    const x = 3.02, z = -3.42;
    for (const s of [-1, 1]) { P(cylinderBetween(V(x - 0.3, 0, z + s * 0.24), V(x + 0.3, 0.98, z + s * 0.2), 0.009, 0.009, 5), 0x9a9a94); P(cylinderBetween(V(x + 0.3, 0, z + s * 0.24), V(x - 0.3, 0.98, z + s * 0.2), 0.009, 0.009, 5), 0x9a9a94); }
    for (const dx of [-0.3, -0.1, 0.1, 0.3]) P(cylinderBetween(V(x + dx, 0.98, z - 0.22), V(x + dx, 0.98, z + 0.22), 0.006, 0.006, 5), 0x9a9a94);
    const drape = (dx, w, len, hex) => {
      const g = new THREE.PlaneGeometry(w, len * 2, 4, 10), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const yy = p.getY(i); p.setXYZ(i, Math.sin(yy * 16 + dx * 9) * 0.008 + (yy > 0 ? 0.012 : -0.012), 0.985 - Math.abs(yy) * (yy > 0 ? 1 : 0.8), p.getX(i)); }
      g.computeVertexNormals();
      P(g.translate(x + dx, 0, z), hex);
    };
    drape(-0.3, 0.3, 0.42, 0x8f9a9c); drape(-0.1, 0.32, 0.5, 0x9a927e); drape(0.3, 0.36, 0.36, 0x5c6470);
    world.circle(x, z, 0.3, 0, 1.05);
  }

  // ── 局部的水漬與壁癌：窗框左下、冷氣排水管下方、東北牆角 ──
  {
    const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d'), r2 = mulberry32(77);
    for (let k = 0; k < 5; k++) { // 一圈一圈乾掉的水痕
      const cx = S * (0.35 + r2() * 0.3), cy = S * (0.25 + r2() * 0.3), rr = 30 + k * 16 + r2() * 10;
      g.strokeStyle = `rgba(96,78,48,${0.16 + r2() * 0.14})`; g.lineWidth = 2 + r2() * 4;
      g.beginPath();
      for (let i = 0; i <= 40; i++) { const a = (i / 40) * 6.283, q = rr * (0.8 + 0.25 * Math.sin(a * 3 + k) + 0.1 * Math.sin(a * 7)); if (i) g.lineTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q * 1.25); else g.moveTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q * 1.25); }
      g.stroke();
    }
    for (let i = 0; i < 26; i++) { const x = S * (0.2 + r2() * 0.6), y = S * (0.15 + r2() * 0.5), len = 30 + r2() * 110; const gr = g.createLinearGradient(0, y, 0, y + len); gr.addColorStop(0, `rgba(90,74,48,${0.08 + r2() * 0.14})`); gr.addColorStop(1, 'rgba(90,74,48,0)'); g.fillStyle = gr; g.fillRect(x, y, 2 + r2() * 8, len); }
    for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(${r2() < 0.5 ? '226,222,208' : '70,66,52'},${0.12 + r2() * 0.3})`; const x = S * (0.25 + r2() * 0.5), y = S * (0.2 + r2() * 0.45); g.fillRect(x, y, 1 + r2() * 5, 1 + r2() * 4); } // 壁癌：粉化剝落的白點與底下的灰
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const stain = mk(new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    own.push({ dispose: () => tex.dispose() });
    const q = (w, h, p, r) => xf(new THREE.PlaneGeometry(w, h), { p, r });
    const m = new THREE.Mesh(merge([
      q(1.3, 1.3, [-1.15, 0.72, -3.906], [0, 0, 0]),
      q(1.2, 1.5, [2.62, 2.3, -3.906], [0, 0, 0.2]),
      q(1.5, 1.4, [3.906, 2.45, -3.3], [0, -Math.PI / 2, 0]),
      q(1.1, 1.2, [-3.906, 2.5, 2.9], [0, Math.PI / 2, 0.4]),
    ]), stain);
    m.name = 'WallStains'; m.receiveShadow = true; scene.add(m);
  }

  // ── 合併 ──
  const add = (list, mat, name, cast = true) => {
    if (!list.length) return;
    const m = new THREE.Mesh(merge(list), mat);
    m.name = name; m.castShadow = cast; m.receiveShadow = true; scene.add(m);
  };
  add(lists.wood, wood, 'DecorWood');
  add(lists.bedding, bedding, 'DecorBedding');
  add(lists.curtain, curtain, 'DecorCurtains');
  add(lists.atlas, atlas, 'DecorPrints', false);
  if (lists.paint.length) { const m = new THREE.Mesh(mergeGeometries(lists.paint, false), paint); m.name = 'DecorPainted'; m.castShadow = true; m.receiveShadow = true; scene.add(m); }

  return { dispose() { own.forEach((m) => m.dispose()); atlasTex.dispose(); } };
}
