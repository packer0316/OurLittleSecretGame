import * as THREE from 'three';
import { boxGeo, merge, mulberry32, cylinderBetween } from '../../core/utils.js';
import { smokeTexture, glowTexture, grimeTexture, flameTexture } from '../../core/canvasTex.js';
import { createGhost } from './ghost.js';

/**
 * 結局的演出陳設（finale）。載入地圖時全部建好、visible = false，演出時由 src/story/finale.js 打開。
 * 這裡只負責「東西長什麼樣、會怎麼動」；時間軸、聲音、燈光倍率與後製都在 finale.js。
 *
 *  door      後殿殿門的兩扇門板（dressing.js 匯出的門軸）。open(k) 0..1 往殿內打開
 *  seats     六張和戲台同款的板凳，排成一排面向殿門
 *  friends   阿哲、志豪、柏翰：坐著、紅布蒙眼。turn(k) 讓頭一起扭向身後
 *  child     林小雨：抱膝坐在門檻上 → 抬頭 → 站起來 → 走出門
 *  double    結局 B 的「另一個自己」
 *  fire      1998 年的火：門縫透出的火光、送口裡的火苗、煙、餘燼、天花板積煙、一盞火光
 *  lock      門上那把燙紅的舊鎖與鑰匙
 *  rope      結局 A 重新繫緊的紅繩
 *  gate      山門外的搜救隊、擔架上的阿哲、手電筒的眩光
 *  dawn      黎明的天空（疊在夜空上）、佛像掉在地上的紅布
 *
 * 人物全部程序化建模（膠囊與車床曲面組成的關節人偶，臉用畫布貼圖），在手電筒下近看也有衣料、手指與五官。
 */
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clampN = (v, a, b) => Math.min(b, Math.max(a, v));
const sstep = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
const KAI = '"DFKai-SB","BiauKai","KaiTi","標楷體","PMingLiU",serif';

/** 地下封印室與殿門的座標（與 storyWorld / dressing 相同） */
export const CRYPT = { y: -7, door: { x: 55, z: -28.53 }, stairs: { x: 55, z: -11.6 }, plate: { x: 55, z: -23 }, tablet: { x: 51, z: -22 }, recorder: { x: 59, z: -22 }, pedestal: { x: 55, z: -16 } };
/** 六張板凳：一以安、二阿哲、三志豪、四柏翰、五佩珊、六小雨。面向殿門（−Z） */
export const SEATS = [51.9, 52.9, 53.9, 54.9, 55.9, 56.9].map((x) => ({ x, z: -24.05 }));

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function toTex(c, srgb = true) { const t = new THREE.CanvasTexture(c); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 4; return t; }

// ───────────────────────── 臉 ─────────────────────────
// 球面 UV：正前方在 u = 0.25、赤道在畫布正中。眼睛約在 0.48H、鼻 0.56H、嘴 0.64H、下巴 0.75H。
function faceTexture(seed, { skin = [128, 110, 98], child = false, stubble = 0.35, tears = true, mouthOpen = 0 } = {}) {
  const W = 512, H = 256, [c, g] = canvas(W, H), rng = mulberry32(seed);
  const [r, gg, b] = skin;
  g.fillStyle = `rgb(${r},${gg},${b})`; g.fillRect(0, 0, W, H);
  const blot = (x, y, rad, col, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, col.replace('A', a)); gr.addColorStop(1, col.replace('A', 0)); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); };
  for (let i = 0; i < 160; i++) blot(rng() * W, rng() * H, 4 + rng() * 22, rng() < 0.5 ? 'rgba(90,60,55,A)' : 'rgba(225,205,190,A)', 0.05 + rng() * 0.08);
  const fx = W * 0.25, eye = H * 0.475;
  for (const s of [-1, 1]) {
    const ex = fx + s * W * 0.052;
    blot(ex, eye + 4, 28, 'rgba(56,34,32,A)', child ? 0.16 : 0.5); // 眼窩
    if (child) {
      g.fillStyle = 'rgba(38,24,20,0.92)'; g.beginPath(); g.ellipse(ex, eye + 2, 9, 5.5, 0, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,240,225,0.6)'; g.beginPath(); g.arc(ex - 2, eye, 1.6, 0, TAU); g.fill();
      blot(ex + s * 4, eye + 22, 18, 'rgba(210,110,100,A)', 0.22); // 臉頰
      g.strokeStyle = 'rgba(40,26,22,0.55)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(ex - 12, eye - 13); g.quadraticCurveTo(ex, eye - 17, ex + 12, eye - 12); g.stroke();
    } else {
      g.fillStyle = 'rgba(30,20,18,0.85)'; g.beginPath(); g.ellipse(ex, eye + 2, 10, 4, 0, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(22,16,14,0.9)'; g.lineWidth = 5; g.beginPath(); g.moveTo(ex - 15, eye - 12); g.quadraticCurveTo(ex, eye - 17, ex + 14, eye - 13); g.stroke();
      blot(ex + s * 40, eye + 30, 34, 'rgba(60,40,34,A)', 0.35); // 臉頰側面的陰影
    }
    if (tears) { // 紅布底下滲出來的水痕
      for (let k = 0; k < 3; k++) {
        const x0 = ex + (rng() - 0.5) * 12, len = 26 + rng() * 34;
        const gr = g.createLinearGradient(0, eye + 8, 0, eye + 8 + len); gr.addColorStop(0, 'rgba(70,18,16,0.55)'); gr.addColorStop(1, 'rgba(70,18,16,0)');
        g.strokeStyle = gr; g.lineWidth = 1.5 + rng() * 2.5; g.beginPath(); g.moveTo(x0, eye + 8); g.quadraticCurveTo(x0 + (rng() - 0.5) * 6, eye + 8 + len * 0.6, x0 + (rng() - 0.5) * 4, eye + 8 + len); g.stroke();
      }
    }
  }
  blot(fx, H * 0.565, 16, 'rgba(70,40,36,A)', 0.5); // 鼻下的陰影
  if (!child) for (const s of [-1, 1]) blot(fx + s * 9, H * 0.53, 9, 'rgba(70,44,38,A)', 0.35); // 鼻翼
  const my = H * 0.64;
  if (mouthOpen > 0) { g.fillStyle = 'rgba(20,8,8,0.95)'; g.beginPath(); g.ellipse(fx, my + 2, child ? 9 : 13, 3 + mouthOpen * 7, 0, 0, TAU); g.fill(); }
  g.strokeStyle = child ? 'rgba(150,70,70,0.8)' : 'rgba(95,52,50,0.85)'; g.lineWidth = child ? 3 : 3.5;
  g.beginPath(); g.moveTo(fx - (child ? 11 : 16), my); g.quadraticCurveTo(fx, my + (child ? 3 : 2), fx + (child ? 11 : 16), my); g.stroke();
  if (stubble > 0) for (let i = 0; i < 900 * stubble; i++) { const a = rng() * TAU, d = rng(); const x = fx + Math.cos(a) * W * 0.11 * d, y = H * 0.66 + Math.sin(a) * H * 0.1 * d; if (y < H * 0.6) continue; g.fillStyle = `rgba(40,40,45,${0.08 + rng() * 0.12})`; g.fillRect(x, y, 1.5, 1.5); }
  return toTex(c);
}

// ───────────────────────── 頭部幾何 ─────────────────────────
function headGeometry({ child = false } = {}) {
  const g = new THREE.SphereGeometry(1, 40, 28), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const jaw = y < 0 ? sstep(-y / 0.95) : 0;
    x *= 0.9 * (1 - (child ? 0.16 : 0.26) * jaw);
    if (z < 0) z *= 1.05;
    if (z > 0 && y < -0.35) z *= 1 - 0.08 * sstep((-y - 0.35) / 0.5);
    const front = Math.max(0, z - 0.55) / 0.45;
    z += (child ? 0.08 : 0.14) * Math.exp(-((x / 0.12) ** 2) - (((y + 0.13) / 0.2) ** 2)) * front;           // 鼻
    z += (child ? 0.01 : 0.045) * Math.exp(-(((y - 0.22) / 0.07) ** 2)) * front * Math.exp(-((x / 0.5) ** 2)); // 眉骨
    z += 0.03 * Math.exp(-(((y + 0.43) / 0.07) ** 2) - ((x / 0.2) ** 2)) * front;                             // 嘴唇
    x += Math.sign(x) * 0.035 * Math.exp(-(((y + 0.05) / 0.22) ** 2)) * Math.max(0, z) * (child ? 0.6 : 1);   // 顴骨
    p.setXYZ(i, x, y, z);
  }
  const ears = [-1, 1].map((s) => new THREE.SphereGeometry(1, 10, 8).scale(0.07, 0.24, 0.17).rotateY(s * 0.3).translate(s * 0.86, -0.02, -0.05));
  const out = merge([g, ...ears]);
  out.computeVertexNormals();
  return out;
}
function hairGeometry(style) {
  if (style === 'bob') {
    const cap = new THREE.SphereGeometry(1.07, 36, 20, 0, TAU, 0, Math.PI * 0.74).rotateX(-0.12);
    const p = cap.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); p.setXYZ(i, x * 0.97 * (y < 0 ? 1.06 : 1), y, z * (z < 0 ? 1.08 : 1)); }
    const bangs = new THREE.SphereGeometry(1.08, 24, 10, Math.PI * 0.15, Math.PI * 0.7, Math.PI * 0.12, Math.PI * 0.27);
    return merge([cap, bangs]);
  }
  const cap = new THREE.SphereGeometry(1.05, 32, 16, 0, TAU, 0, Math.PI * 0.56).rotateX(-0.42);
  const p = cap.attributes.position;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * 0.93, p.getY(i), p.getZ(i) * (p.getZ(i) < 0 ? 1.07 : 1));
  return cap;
}

// ───────────────────────── 關節人偶 ─────────────────────────
const JOINTS = ['pelvis', 'neck', 'head', 'shL', 'elL', 'wrL', 'shR', 'elR', 'wrR', 'hipL', 'knL', 'anL', 'hipR', 'knR', 'anR'];
const seg = (r0, r1, len, rs = 14) => merge([new THREE.CylinderGeometry(r0, r1, len, rs, 1, true).translate(0, -len / 2, 0), new THREE.SphereGeometry(r1, rs, 8).translate(0, -len, 0)]);
function handGeometry(s) {
  const parts = [new THREE.SphereGeometry(1, 12, 8).scale(0.019, 0.05, 0.041).translate(0, -0.045, 0)];
  for (let i = 0; i < 4; i++) parts.push(new THREE.CapsuleGeometry(0.0085, 0.048 - Math.abs(i - 1.4) * 0.006, 3, 6).rotateX(0.25).translate(0, -0.112 + Math.abs(i - 1.5) * 0.007, (i - 1.5) * 0.019 - 0.004));
  parts.push(new THREE.CapsuleGeometry(0.0105, 0.038, 3, 6).rotateX(-0.75).translate(0.004, -0.06, 0.044));
  return merge(parts).scale(s, s, s);
}

/**
 * 建立一個可擺姿勢的人。單位公尺，腳底 y = 0、面向 +Z。
 * o: { b 身體比例, hs 頭比例, top, bottom, skin, face, hair, shoeL, shoeR, sleeve: 'long'|'short', skirt, hairStyle, blind, hood, helmet }
 */
function buildPerson(ctx, o) {
  const b = o.b ?? 1, hs = o.hs ?? 1, cast = o.cast ?? true;
  const root = new THREE.Group(); root.name = o.name || 'FinalePerson';
  const J = {};
  const pivot = (name, parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); J[name] = g; return g; };
  const M = (geo, mat, parent) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; parent.add(m); return m; };
  const legT = 0.44 * b, legS = 0.42 * b;
  const pelvis = pivot('pelvis', root, 0, legT + legS + 0.14 * b, 0);
  // 軀幹（上衣或洋裝的上半身）
  const torsoPts = o.skirt
    ? [[0.0, -0.06], [0.135, -0.06], [0.13, 0.04], [0.12, 0.14], [0.125, 0.24], [0.13, 0.31], [0.115, 0.35], [0.08, 0.375], [0.05, 0.39], [0.045, 0.395]]
    : [[0.0, -0.15], [0.172, -0.15], [0.176, -0.1], [0.168, 0.0], [0.162, 0.1], [0.168, 0.2], [0.182, 0.31], [0.19, 0.4], [0.183, 0.455], [0.15, 0.5], [0.095, 0.53], [0.068, 0.55], [0.06, 0.56]];
  const sc = o.skirt ? 1 : b;
  M(new THREE.LatheGeometry(torsoPts.map(([r, y]) => new THREE.Vector2(r * (o.skirt ? 1 : 1), y * sc)), 30).scale(1, 1, o.skirt ? 0.68 : 0.64), o.top, pelvis);
  if (o.skirt) { // 裙子另一個網格：坐下時可以壓扁散開
    const skirtPts = [[0.0, 0.0], [0.135, 0.0], [0.15, -0.06], [0.17, -0.14], [0.195, -0.24], [0.205, -0.3], [0.2, -0.31]].map(([r, y]) => new THREE.Vector2(r, y));
    J.skirt = M(new THREE.LatheGeometry(skirtPts, 30, 0, TAU).scale(1, 1, 0.72), o.top, pelvis);
    J.skirt.position.y = -0.04;
  } else {
    M(new THREE.SphereGeometry(1, 16, 10).scale(0.165 * b, 0.12 * b, 0.12 * b).translate(0, -0.08 * b, 0), o.bottom, pelvis); // 臀部
    M(new THREE.TorusGeometry(0.068 * b, 0.02 * b, 8, 20).rotateX(Math.PI / 2).scale(1, 1, 0.85).translate(0, 0.545 * b, 0.004), o.top, pelvis); // 領口
    M(boxGeo(0.012, 0.42 * b, 0.006, 0, 0.27 * b, 0.118 * b, 1), o.trim || o.bottom, pelvis); // 拉鍊
  }
  if (o.hood) M(new THREE.SphereGeometry(1, 16, 10).scale(0.15 * b, 0.085 * b, 0.09 * b).translate(0, 0.5 * b, -0.1 * b), o.top, pelvis);
  // 手臂
  const shY = o.skirt ? 0.33 : 0.44 * b, shX = o.skirt ? 0.125 : 0.19 * b, armMat = o.sleeve === 'short' ? o.skin : o.top;
  for (const [s, k] of [[1, 'L'], [-1, 'R']]) {
    M(new THREE.SphereGeometry(o.skirt ? 0.042 : 0.058 * b, 14, 10).translate(s * (shX - 0.012), shY + 0.002, 0), o.top, pelvis); // 肩
    const sh = pivot('sh' + k, pelvis, s * shX, shY, 0);
    const ua = o.skirt ? 0.19 : 0.29 * b, fa = o.skirt ? 0.17 : 0.25 * b;
    M(seg(o.skirt ? 0.03 : 0.056 * b, o.skirt ? 0.026 : 0.049 * b, ua), armMat, sh);
    const el = pivot('el' + k, sh, 0, -ua, 0);
    M(seg(o.skirt ? 0.025 : 0.048 * b, o.skirt ? 0.021 : 0.041 * b, fa), armMat, el);
    const wr = pivot('wr' + k, el, 0, -fa, 0);
    if (!o.skirt && o.sleeve !== 'short') M(new THREE.CylinderGeometry(0.044 * b, 0.045 * b, 0.03, 12).translate(0, 0.012, 0), o.top, wr);
    J['hand' + k] = M(handGeometry(o.skirt ? 0.62 : b), o.hands || o.skin, wr);
  }
  // 腿
  const hipX = o.skirt ? 0.065 : 0.095 * b;
  for (const [s, k] of [[1, 'L'], [-1, 'R']]) {
    const legMat = o.skirt ? o.skin : o.bottom;
    const hip = pivot('hip' + k, pelvis, s * hipX, -0.06 * b, 0);
    const t = o.skirt ? 0.29 : legT, sh = o.skirt ? 0.28 : legS;
    M(seg(o.skirt ? 0.05 : 0.082 * b, o.skirt ? 0.039 : 0.06 * b, t), legMat, hip);
    const kn = pivot('kn' + k, hip, 0, -t, 0);
    M(seg(o.skirt ? 0.037 : 0.057 * b, o.skirt ? 0.03 : 0.045 * b, sh), legMat, kn);
    if (!o.skirt) M(new THREE.CylinderGeometry(0.058 * b, 0.062 * b, 0.05, 12, 1, true).translate(0, -sh + 0.03, 0), o.bottom, kn);
    const an = pivot('an' + k, kn, 0, -sh, 0);
    const fs = o.skirt ? 0.6 : b, shoe = s > 0 ? o.shoeL : o.shoeR;
    M(merge([new THREE.SphereGeometry(1, 14, 10).scale(0.05 * fs, 0.042 * fs, 0.13 * fs).translate(0, -0.035 * fs, 0.05 * fs), boxGeo(0.095 * fs, 0.02 * fs, 0.265 * fs, 0, -0.07 * fs, 0.05 * fs, 1)]), shoe, an);
  }
  if (o.skirt) pelvis.position.y = 0.29 + 0.28 + 0.07 + 0.04;
  // 頸、頭
  const neckY = o.skirt ? 0.355 : 0.53 * b;
  const neck = pivot('neck', pelvis, 0, neckY, 0);
  M(new THREE.CylinderGeometry(0.05 * hs * (o.skirt ? 0.8 : 1), 0.056 * hs * (o.skirt ? 0.8 : 1), 0.12 * hs, 14).translate(0, 0.04 * hs, 0), o.skin, neck);
  const head = pivot('head', neck, 0, (o.skirt ? 0.07 : 0.09) * hs, 0.005);
  const HS = [0.088 * hs, 0.115 * hs, 0.1 * hs], hc = [0, 0.085 * hs, 0.012 * hs];
  M(headGeometry({ child: !!o.skirt }).scale(...HS).translate(...hc), o.face, head);
  if (o.hair) M(hairGeometry(o.hairStyle).scale(...HS).translate(hc[0], hc[1], hc[2] - 0.003), o.hair, head);
  if (o.blind) {
    const band = new THREE.CylinderGeometry(1, 1, 0.052 * hs, 36, 2, true), bp = band.attributes.position;
    for (let i = 0; i < bp.count; i++) { const a = Math.atan2(bp.getZ(i), bp.getX(i)); bp.setXYZ(i, bp.getX(i) * HS[0] * 0.98 * (1 + Math.sin(a * 11) * 0.015), bp.getY(i), bp.getZ(i) * HS[2] * 1.07); }
    band.computeVertexNormals();
    M(band.translate(hc[0], hc[1] + 0.012 * hs, hc[2] + 0.002), o.blind, head);
    M(new THREE.SphereGeometry(1, 10, 8).scale(0.022 * hs, 0.02 * hs, 0.016 * hs).translate(0.012, hc[1] + 0.01, hc[2] - HS[2] * 1.08), o.blind, head);
    if (ctx.cloth) for (const [i, dx, len, rz] of [[0, -0.008, 0.27, 0.06], [1, 0.016, 0.21, -0.1]]) {
      const strip = ctx.cloth.make({ width: 0.045, height: len, material: o.blind, seed: (o.seed || 1) * 31 + i * 7, fold: 0.006, exposure: 0.4, amplitude: 0.012 });
      strip.position.set(0.012 + dx, hc[1] + 0.008, hc[2] - HS[2] * 1.1); strip.rotation.set(0.12, 0, rz); head.add(strip);
    }
  }
  if (o.helmet) { // 救難頭盔：貼著頭、前面有短帽沿與頭燈，下巴一條扣帶，臉露在外面
    const hy = hc[1] + 0.03;
    M(new THREE.SphereGeometry(1, 28, 14, 0, TAU, 0, Math.PI * 0.5).scale(HS[0] * 1.2, HS[1] * 0.98, HS[2] * 1.18).translate(hc[0], hy, hc[2] - 0.004), o.helmet, head);
    M(new THREE.CylinderGeometry(1, 1.04, 0.012, 28, 1, false, -Math.PI * 0.42, Math.PI * 0.84).scale(HS[0] * 1.24, 1, HS[2] * 1.34).translate(hc[0], hy, hc[2] + 0.004), o.helmet, head); // 帽沿
    M(boxGeo(0.07, 0.016, 0.008, hc[0], hy + 0.035, hc[2] + HS[2] * 1.16, 1), ctx.mats.black, head);
    J.lamp = M(new THREE.CylinderGeometry(0.016, 0.019, 0.026, 12).rotateX(Math.PI / 2).translate(0, hy + 0.035, hc[2] + HS[2] * 1.2), ctx.mats.black, head);
  }
  if (o.vest) { // 反光背心：兩條灰白反光條
    for (const y of [0.18, 0.3]) M(new THREE.CylinderGeometry(0.18 * b, 0.178 * b, 0.035, 28, 1, true).scale(1.02, 1, 0.66).translate(0, y * b, 0), o.vest, pelvis);
  }
  const zero = {};
  for (const n of JOINTS) zero[n] = [0, 0, 0];
  return { root, J, pelvisY: pelvis.position.y, b, cur: zero };
}

/** 把姿勢（關節名 → [x, y, z] 弧度；pelvis 另可給 y 高度 py）套到人偶上 */
function applyPose(p, pose) {
  for (const n of JOINTS) {
    const j = p.J[n]; if (!j) continue;
    const r = pose[n] || [0, 0, 0];
    j.rotation.set(r[0], r[1], r[2], 'YXZ');
  }
  p.J.pelvis.position.y = pose.py ?? p.pelvisY;
}
/** 把整個人偶烘成每個材質一個靜態網格；keep 列出的關節（例如頭）保留成可動的群組 */
function bake(p, keep = []) {
  const root = p.root; root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const kept = new Set(keep.map((n) => p.J[n]));
  const buckets = new Map(), remove = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (let q = o.parent; q && q !== root; q = q.parent) if (kept.has(q)) return;
    const g = o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    if (!buckets.has(o.material)) buckets.set(o.material, []);
    buckets.get(o.material).push(g); remove.push(o);
  });
  const keepT = [];
  for (const n of keep) { const j = p.J[n]; j.updateMatrixWorld(true); keepT.push([j, new THREE.Matrix4().multiplyMatrices(inv, j.matrixWorld)]); }
  for (const o of remove) o.parent.remove(o);
  const body = new THREE.Group(); body.name = 'Baked';
  for (const [mat, geos] of buckets) { const m = new THREE.Mesh(merge(geos), mat); m.castShadow = true; m.receiveShadow = true; body.add(m); }
  // 保留的關節改掛到 root 底下，位置不變
  for (const [j, m] of keepT) { j.parent.remove(j); m.decompose(j.position, j.quaternion, j.scale); root.add(j); }
  root.add(body);
  return p;
}

// 姿勢（弧度）。人偶面向 +Z；rotation.x 正值 = 往前彎 / 腿往後；手臂往前抬是負的 x。
const P = {
  stand: { py: null, pelvis: [0, 0, 0], neck: [0.06, 0, 0], head: [0.05, 0, 0], shL: [0.04, 0, 0.07], shR: [0.04, 0, -0.07], elL: [-0.15, 0, 0], elR: [-0.15, 0, 0], hipL: [0, 0, 0], hipR: [0, 0, 0], knL: [0.04, 0, 0], knR: [0.04, 0, 0], anL: [0, 0, 0], anR: [0, 0, 0] },
  sit: { pelvis: [0.12, 0, 0], neck: [0.22, 0, 0], head: [0.28, 0, 0], shL: [-0.42, 0, 0.12], shR: [-0.42, 0, -0.12], elL: [-1.0, 0, 0], elR: [-1.0, 0, 0], wrL: [0.1, -1.45, 0], wrR: [0.1, 1.45, 0], hipL: [-1.68, 0, 0.06], hipR: [-1.68, 0, -0.06], knL: [1.62, 0, 0], knR: [1.62, 0, 0], anL: [0.06, 0, 0], anR: [0.06, 0, 0] },
  lie: { pelvis: [0, 0, 0], neck: [-0.05, 0, 0], head: [-0.1, 0.15, 0], shL: [0.02, 0, 0.12], shR: [0.02, 0, -0.12], elL: [-0.1, 0, 0], elR: [-0.1, 0, 0] },
  torch: { pelvis: [0, 0, 0], neck: [0.04, 0, 0], head: [0.02, 0, 0], shL: [0.05, 0, 0.09], shR: [-1.25, 0.15, -0.2], elL: [-0.2, 0, 0], elR: [-0.25, 0, 0], knL: [0.04, 0, 0], knR: [0.04, 0, 0], hipL: [0, 0, 0.04], hipR: [0, 0, -0.04] },
  carry: { pelvis: [0.05, 0, 0], neck: [0.1, 0, 0], head: [0.05, 0, 0], shL: [-0.25, 0, 0.18], shR: [-0.25, 0, -0.18], elL: [-0.15, 0, 0], elR: [-0.15, 0, 0] },
  carryFront: { pelvis: [0.08, 0, 0], neck: [0.12, 0, 0], head: [0.04, 0, 0], shL: [0.32, 0, 0.16], shR: [0.32, 0, -0.16], elL: [-0.05, 0, 0], elR: [-0.05, 0, 0] }, // 走在前面的人雙手往後握著擔架
};
function walkPose(base, phase, amt, out) {
  const s = Math.sin(phase), c = Math.cos(phase);
  for (const n of JOINTS) out[n] = (base[n] || [0, 0, 0]).slice();
  out.py = base.py;
  out.hipL[0] += -s * 0.42 * amt; out.hipR[0] += s * 0.42 * amt;
  out.knL[0] += Math.max(0, c) * 0.7 * amt; out.knR[0] += Math.max(0, -c) * 0.7 * amt;
  out.shL[0] += s * 0.3 * amt; out.shR[0] += -s * 0.3 * amt;
  out.pelvis[1] += s * 0.05 * amt; out.pelvis[2] += c * 0.025 * amt;
  return out;
}

/** 近距離手電筒的過曝壓縮（和 ghost.js 的作法同一個想法）：暗部不變，亮部柔和地收住，不會變成一團白光 */
function soften(m) {
  m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', 'outgoingLight = outgoingLight / (1.0 + 0.85 * max(max(outgoingLight.r, outgoingLight.g), outgoingLight.b));' + String.fromCharCode(10) + '#include <opaque_fragment>'); };
  m.customProgramCacheKey = () => 'finale-soft';
  return m;
}
// ───────────────────────── 小雨 ─────────────────────────
// 七歲的臉：眼睛溫順、下垂一點，臉頰上有煙灰，淚水從煙灰裡沖出兩道乾淨的痕。正前方在 u = 0.25。
function childFaceTexture() {
  const W = 512, H = 256, [c, g] = canvas(W, H), rng = mulberry32(1991);
  g.fillStyle = 'rgb(160,126,108)'; g.fillRect(0, 0, W, H);
  const blot = (x, y, r, col, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, col.replace('A', a)); gr.addColorStop(1, col.replace('A', 0)); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); };
  for (let i = 0; i < 120; i++) blot(rng() * W, rng() * H, 6 + rng() * 20, rng() < 0.5 ? 'rgba(120,86,72,A)' : 'rgba(205,170,150,A)', 0.05 + rng() * 0.07);
  const fx = W * 0.25, eye = H * 0.49;
  // 立體感：臉的兩側、瀏海底下、眼窩比較暗，正面的鼻樑與下巴留亮
  for (const s of [-1, 1]) { const gr = g.createLinearGradient(fx + s * 30, 0, fx + s * 95, 0); gr.addColorStop(0, 'rgba(50,34,28,0)'); gr.addColorStop(1, 'rgba(50,34,28,0.55)'); g.fillStyle = gr; g.fillRect(Math.min(fx + s * 30, fx + s * 95), 0, 65, H); }
  { const gr = g.createLinearGradient(0, H * 0.36, 0, H * 0.46); gr.addColorStop(0, 'rgba(30,20,16,0.6)'); gr.addColorStop(1, 'rgba(30,20,16,0)'); g.fillStyle = gr; g.fillRect(fx - 80, H * 0.36, 160, H * 0.1); }
  blot(fx, H * 0.6, 9, 'rgba(225,190,170,A)', 0.25); blot(fx, H * 0.74, 12, 'rgba(215,180,160,A)', 0.2);
  blot(fx, H * 0.62, 70, 'rgba(60,50,46,A)', 0.18); // 下半臉的煙灰
  for (const s of [-1, 1]) {
    const ex = fx + s * W * 0.05;
    blot(ex + s * 6, eye + 26, 22, 'rgba(196,112,100,A)', 0.2); // 臉頰
    blot(ex + s * 10, eye + 30, 26, 'rgba(48,40,38,A)', 0.32); // 煙灰
    blot(ex, eye + 2, 16, 'rgba(70,44,38,A)', 0.35); // 哭過的眼眶
    g.fillStyle = 'rgba(40,24,18,0.92)'; g.beginPath(); g.ellipse(ex, eye + 3, 8, 3.6, 0, 0, TAU); g.fill();  // 垂著的眼睛
    g.fillStyle = 'rgba(210,180,160,0.35)'; g.beginPath(); g.arc(ex - 2, eye + 2, 1.1, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(30,18,14,0.8)'; g.lineWidth = 2; g.beginPath(); g.moveTo(ex - 11, eye + 2); g.quadraticCurveTo(ex, eye - 2.5, ex + 11, eye + 3); g.stroke(); // 上眼瞼（垂著）
    g.strokeStyle = 'rgba(90,60,50,0.5)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(ex - 9, eye + 7); g.quadraticCurveTo(ex, eye + 10, ex + 9, eye + 7); g.stroke();
    // 淚痕：在煙灰上沖出一道比較乾淨的線
    g.strokeStyle = 'rgba(200,168,150,0.55)'; g.lineWidth = 2.4; g.beginPath(); g.moveTo(ex + s * 3, eye + 9); g.quadraticCurveTo(ex + s * 6, eye + 34, ex + s * 4, eye + 58); g.stroke();
  }
  blot(fx, H * 0.575, 10, 'rgba(110,70,60,A)', 0.4); // 鼻下
  const my = H * 0.655;
  g.fillStyle = 'rgba(150,82,78,0.85)'; g.beginPath(); g.ellipse(fx, my + 2, 10, 3.6, 0, 0, TAU); g.fill(); // 嘴唇
  g.strokeStyle = 'rgba(70,30,28,0.9)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(fx - 10, my + 1); g.quadraticCurveTo(fx, my + 3.5, fx + 10, my + 1); g.stroke();
  blot(fx, H * 0.73, 16, 'rgba(120,80,66,A)', 0.2);
  return toTex(c);
}
// 1998 年夏天的碎花短袖：米白底、小紅花與綠葉，洗舊、下襬被煙燻黑
function floralTexture() {
  const W = 512, H = 512, [c, g] = canvas(W, H), rng = mulberry32(798);
  g.fillStyle = '#cfc6b0'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 260; i++) {
    const x = rng() * W, y = rng() * H, r = 3 + rng() * 3;
    g.fillStyle = rng() < 0.7 ? `rgba(${150 + rng() * 40},${50 + rng() * 30},${55 + rng() * 25},0.85)` : 'rgba(96,120,72,0.8)';
    for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU; g.beginPath(); g.arc(x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8, r * 0.55, 0, TAU); g.fill(); }
    g.fillStyle = 'rgba(220,190,90,0.9)'; g.beginPath(); g.arc(x, y, r * 0.35, 0, TAU); g.fill();
  }
  for (let i = 0; i < 40; i++) { const x = rng() * W, y = H * (0.45 + rng() * 0.55), r = 30 + rng() * 90; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(40,32,28,${0.25 + rng() * 0.3})`); gr.addColorStop(1, 'rgba(40,32,28,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
  const t = toTex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function strandTexture() {
  const W = 256, H = 256, [c, g] = canvas(W, H), rng = mulberry32(57);
  g.fillStyle = '#100b09'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 900; i++) { const x = rng() * W; g.strokeStyle = `rgba(${34 + rng() * 26},${26 + rng() * 18},${22 + rng() * 14},${0.15 + rng() * 0.3})`; g.lineWidth = 0.6 + rng() * 1.2; g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + (rng() - 0.5) * 8, H * 0.3, x + (rng() - 0.5) * 10, H * 0.7, x + (rng() - 0.5) * 12, H); g.stroke(); }
  const t = toTex(c); t.wrapS = THREE.RepeatWrapping; return t;
}
function dirtySkinTexture() {
  const W = 256, H = 256, [c, g] = canvas(W, H), rng = mulberry32(233);
  g.fillStyle = 'rgb(172,138,118)'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 70; i++) { const x = rng() * W, y = rng() * H, r = 6 + rng() * 30; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(52,42,38,${0.15 + rng() * 0.3})`); gr.addColorStop(1, 'rgba(52,42,38,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
  const t = toTex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
/** 齊肩的妹妹頭：頭頂到後腦全部蓋住，前面瀏海剪到眉毛、兩側垂到下巴，臉露出來。單位＝頭的半徑（之後跟頭一起縮放） */
function bobGeometry() {
  const N = 56, M = 18, pos = [], uv = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N, az = u * TAU, f = Math.cos(az);
    let tmax = lerp(0.8 * Math.PI, 0.45 * Math.PI, sstep((f - 0.42) / 0.5));
    tmax += 0.006 * Math.PI * (Math.sin(az * 19) + 0.5 * Math.sin(az * 41 + 1.3)) * sstep((f - 0.4) / 0.4); // 瀏海有一點參差
    for (let j = 0; j <= M; j++) {
      const v = j / M, th = v * tmax;
      let r = 1.06 + 0.05 * sstep((th - 0.3) / 1.2);
      const hr = r * Math.max(Math.sin(th), th > Math.PI / 2 ? 0.95 - 0.06 * v : 0) * (j === M ? 0.96 : 1);
      pos.push(hr * Math.sin(az), Math.cos(Math.min(th, Math.PI)) * r - (th > Math.PI / 2 ? (th - Math.PI / 2) * 0.35 : 0), hr * Math.cos(az));
      uv.push(u * 6, 1 - v);
    }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) { const a = i * (M + 1) + j, b = a + M + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
/**
 * 把小雨穿在 'child' 的骨架上：每個部位都是掛在對應骨頭底下的剛體（綁定姿勢的骨頭方向和 K 空間一致，單位公分，所以放大 100 倍）。
 * 原本的黑影外皮只在這一個實例上隱藏，不影響其他地方用到的 'child'。
 */
function dressXiaoyu(g) {
  const B = g.bones || {}, parts = [], mats = [];
  g.root.traverse((o) => { if (o.isSkinnedMesh) o.visible = false; });
  const kp = {}; // 綁定姿勢下每根骨頭在 K 空間的位置（公尺）
  for (const [n, bone] of Object.entries(B)) { const v = new THREE.Vector3(); for (let b = bone; b && b.isBone; b = b.parent) v.add(b.position); kp[n] = v.multiplyScalar(0.01); }
  const rel = (from, to) => kp[to].clone().sub(kp[from]);
  const M = (o) => { const m = soften(new THREE.MeshStandardMaterial(o)); mats.push(m); return m; };
  const skin = M({ map: dirtySkinTexture(), roughness: 0.76, color: 0x968478 });
  const face = M({ map: childFaceTexture(), roughness: 0.72, color: 0xa8968a });
  const blouse = M({ map: floralTexture(), roughness: 0.92, side: THREE.DoubleSide, color: 0x948c80 });
  const shorts = M({ map: grimeTexture('#5a1d1b', { seed: 919, dark: '20,8,6', amount: 1 }), roughness: 0.9 });
  const hair = M({ map: strandTexture(), roughness: 0.48, side: THREE.DoubleSide, color: 0x5e5753 });
  const shoe = M({ map: grimeTexture('#8a2a20', { seed: 77, dark: '30,10,8', amount: 0.8 }), roughness: 0.7 });
  const sole = M({ color: 0x8e877a, roughness: 0.85 });
  const att = (bone, geo, mat) => { if (!B[bone]) return null; const m = new THREE.Mesh(geo, mat); m.scale.setScalar(100); m.castShadow = true; m.receiveShadow = true; B[bone].add(m); parts.push(m); return m; };
  const tube = (a, b, r0, r1, seg = 14) => merge([cylinderBetween(a, b, r0, r1, seg), new THREE.SphereGeometry(r1, seg, 8).translate(b.x, b.y, b.z)]);
  const O = new THREE.Vector3();
  // 頭與臉
  const headC = new THREE.Vector3(0, 0.077, 0.009);
  att('Head', headGeometry({ child: true }).scale(0.079, 0.094, 0.081).translate(headC.x, headC.y, headC.z), face);
  att('Head', bobGeometry().scale(0.075, 0.095, 0.087).translate(headC.x, headC.y + 0.004, headC.z - 0.001), hair);
  att('Neck', tube(O, rel('Neck', 'Head').add(new THREE.Vector3(0, 0.02, 0)), 0.029, 0.028), skin);
  // 上衣（分三段掛在脊椎上，彼此重疊，彎腰時看不出接縫）與短褲
  const lathe = (pts, zs = 0.72) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 28, Math.PI).scale(1, 1, zs); // 接縫轉到背後
  att('Hips', lathe([[0, -0.075], [0.1, -0.075], [0.112, -0.03], [0.108, 0.04], [0.1, 0.075]]), shorts);
  att('Hips', lathe([[0.104, 0.035], [0.112, 0.06], [0.104, 0.1]]), blouse);
  att('Spine', lathe([[0.104, -0.03], [0.1, 0.04], [0.099, 0.095]]), blouse);
  att('Spine1', lathe([[0.1, -0.02], [0.104, 0.05], [0.108, 0.1]]), blouse);
  att('Spine2', lathe([[0.108, -0.025], [0.114, 0.035], [0.105, 0.075], [0.08, 0.098], [0.054, 0.108], [0.048, 0.112], [0.0, 0.113]]), blouse);
  // 手臂：泡泡短袖、細細的手
  for (const s of ['Left', 'Right']) {
    const arm = rel(s + 'Arm', s + 'ForeArm'), fore = rel(s + 'ForeArm', s + 'Hand'), dir = arm.clone().normalize();
    att(s + 'Arm', merge([new THREE.SphereGeometry(0.043, 14, 10).scale(1, 0.9, 1).translate(dir.x * 0.025, dir.y * 0.025 + 0.004, 0), cylinderBetween(O, dir.clone().multiplyScalar(0.075), 0.042, 0.038, 14)]), blouse);
    att(s + 'Arm', tube(dir.clone().multiplyScalar(0.05), arm, 0.024, 0.02), skin);
    att(s + 'ForeArm', tube(O, fore, 0.02, 0.016), skin);
    const hand = handGeometry(0.58); hand.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), fore.clone().normalize()));
    att(s + 'Hand', hand, skin);
    // 腿：短褲褲管、膝蓋、小腿
    const thigh = rel(s + 'UpLeg', s + 'Leg'), shin = rel(s + 'Leg', s + 'Foot'), td = thigh.clone().normalize();
    att(s + 'UpLeg', cylinderBetween(O.clone().add(new THREE.Vector3(0, 0.02, 0)), td.clone().multiplyScalar(0.115), 0.058, 0.053, 14), shorts);
    att(s + 'UpLeg', tube(td.clone().multiplyScalar(0.08), thigh, 0.043, 0.034), skin);
    att(s + 'Leg', merge([new THREE.SphereGeometry(0.034, 12, 8), cylinderBetween(O, shin, 0.032, 0.024, 12), new THREE.SphereGeometry(0.024, 10, 8).translate(shin.x, shin.y, shin.z)]), skin);
    const toe = rel(s + 'Foot', s + 'ToeBase'), fwd = new THREE.Vector3(toe.x, 0, toe.z).normalize(), yaw = Math.atan2(fwd.x, fwd.z);
    if (s === 'Left') { // 還穿著的那一隻紅布鞋
      att(s + 'Foot', merge([new THREE.SphereGeometry(1, 16, 10).scale(0.034, 0.03, 0.088).translate(0, -0.026, 0.04), new THREE.TorusGeometry(0.03, 0.006, 6, 16, Math.PI).rotateX(-0.5).translate(0, -0.012, 0.0)]).rotateY(yaw), shoe);
      att(s + 'Foot', boxGeo(0.07, 0.012, 0.18, 0, -0.051, 0.04, 1).rotateY(yaw), sole);
    } else { // 被藏起來的那一隻：光著腳，腳底沾著灰
      att(s + 'Foot', merge([new THREE.SphereGeometry(1, 14, 10).scale(0.029, 0.022, 0.078).translate(0, -0.034, 0.038), new THREE.SphereGeometry(1, 10, 8).scale(0.027, 0.016, 0.022).translate(0, -0.042, 0.1)]).rotateY(yaw), skin);
    }
  }
  return {
    parts, mats,
    setFade(a) {
      const t = a < 0.999;
      for (const m of mats) { if (m.transparent !== t) { m.transparent = t; m.needsUpdate = true; } m.opacity = a; m.depthWrite = !t || a > 0.5; }
    },
  };
}

// ───────────────────────── 主建構 ─────────────────────────
export function buildFinaleStage(ctx, { sealedBuddha, rabbit, door = ctx.backHallDoor } = {}) {
  const { mats, root: mapRoot, world } = ctx;
  const rng = mulberry32(19980701);
  const root = new THREE.Group(); root.name = 'FinaleStage'; mapRoot.add(root);
  const group = (name, parent = root) => { const g = new THREE.Group(); g.name = name; g.visible = false; parent.add(g); return g; };
  const mesh = (geo, mat, parent, p) => { const m = new THREE.Mesh(geo, mat); if (p) m.position.set(...p); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };

  // ── 封印：佛像底下的石座、地上刻的圓、從圓周拉到佛像胸口的六條紅線（原本在 storyWorld，搬來這裡才能在 1998 年的那一幕移走）──
  const altar = new THREE.Group(); altar.name = 'SealedAltar'; mapRoot.add(altar);
  mesh(boxGeo(4, 0.7, 2.7, 55, -6.65, -26.15, 2), mats.rock, altar);
  world.box(53, -27.5, 57, -24.8, -7, -3); const altarBox = world.boxes.at(-1);
  const circle = mesh(new THREE.RingGeometry(3.45, 3.51, 96), mats.thread, altar, [55, -6.98, -23]); circle.rotation.x = -Math.PI / 2; circle.castShadow = false;
  const threadGeos = [];
  for (let i = 0; i < 6; i++) { const th = i / 6 * TAU; threadGeos.push(cylinderBetween(V(55 + Math.sin(th) * 3.5, -6.95, -23 + Math.cos(th) * 3.5), V(55, -5.1, -26), 0.008, 0.008, 5)); }
  mesh(merge(threadGeos), mats.thread, altar);
  const S = (o) => new THREE.MeshStandardMaterial(o);
  const fabric = (hex, seed, rough = 0.9, extra = {}) => S({ map: grimeTexture(hex, { seed, dark: '14,12,10', amount: 0.9 }), roughness: rough, ...extra });
  const skin = S({ color: 0x7a7069, roughness: 0.62 });
    const hair = S({ color: 0x060505, roughness: 0.78 });
  const shoe = S({ color: 0x17140f, roughness: 0.5 });
  const blind = mats.blindfold || S({ color: 0x8c2a22, roughness: 0.97, side: THREE.DoubleSide });
  // 先收集場景裡所有佛像的蒙眼布（在建立朋友的紅布之前，兩者共用同一個材質）
  const blindfolds = [];
  if (mats.blindfold) mapRoot.traverse((o) => { if ((o.isMesh || o.isInstancedMesh) && o.material === mats.blindfold) blindfolds.push(o); });
  for (const s of ctx.statues || []) if (s.userData.tails) blindfolds.push(s.userData.tails);

  // ── 殿門 ──
  const leaves = door?.leaves || [];
  const doorApi = {
    leaves, scorch: door?.scorch || null, k: 0,
    /** k：0 關、1 全開（往殿內約 100°）。jolt：撞門的瞬間抖動 */
    set(k, jolt = 0) {
      doorApi.k = k; const a = sstep(k) * 1.75;
      if (leaves[0]) leaves[0].rotation.y = a + jolt * 0.006;
      if (leaves[1]) leaves[1].rotation.y = -a - jolt * 0.005;
      if (doorApi.scorch) doorApi.scorch.visible = k < 0.02;
    },
  };

  // ── 六張板凳與三個朋友 ──
  const seats = group('FinaleSeats');
  let seatTop = 0.42;
  for (let i = 0; i < SEATS.length; i++) {
    const s = SEATS[i];
    // 和戲台同一款、但更矮的小板凳：大人坐上去膝蓋會抬得比椅面高（當年是給孩子坐的）
    const m = ctx.model('chinese_stool', { p: [s.x, -7, s.z], r: [0, Math.PI + (rng() - 0.5) * 0.12, 0], s: 0.68 });
    m.parent.remove(m); seats.add(m);
    if (!i) { m.updateMatrixWorld(true); const box = new THREE.Box3().setFromObject(m); seatTop = box.max.y + 7; }
  }
  const outfits = [
    { name: '阿哲', top: fabric('#1f2836', 801, 0.72), bottom: fabric('#4a4436', 802), trim: mats.black, face: { seed: 11, stubble: 0.45 }, turn: -2.75, roll: 0.22 },
    { name: '志豪', top: fabric('#3d3a26', 803, 0.85), bottom: fabric('#1d2433', 804), trim: shoe, face: { seed: 12, stubble: 0.7, skin: [140, 124, 110] }, turn: 2.8, roll: -0.3, b: 1.04 },
    { name: '柏翰', top: fabric('#4a4a4c', 805, 0.95), bottom: fabric('#141518', 806), trim: shoe, face: { seed: 13, stubble: 0.2, skin: [152, 140, 131] }, turn: -2.85, roll: 0.12, hood: true, b: 0.97 },
  ];
  const friends = outfits.map((f, i) => {
    const face = S({ map: faceTexture(f.face.seed, { ...f.face, mouthOpen: 0.6 }), roughness: 0.5 });
    const p = buildPerson(ctx, { name: 'Friend_' + f.name, b: f.b || 1, top: f.top, bottom: f.bottom, trim: f.trim, skin, face, hair, shoeL: shoe, shoeR: shoe, blind, hood: f.hood, seed: 40 + i });
    applyPose(p, { ...P.sit, py: seatTop + 0.135 });
    p.J.head.rotation.x = 0.32 + (rng() - 0.5) * 0.1; p.J.head.rotation.z = (rng() - 0.5) * 0.12;
    bake(p, ['head']);
    const seat = SEATS[i + 1];
    p.root.position.set(seat.x, -7, seat.z + 0.02); p.root.rotation.y = Math.PI; seats.add(p.root);
    const head = p.J.head, bowX = head.rotation.x, bowZ = head.rotation.z;
    return {
      name: f.name, root: p.root, head,
      /** k 0..1：頭往身後扭（超過活人能轉的角度） */
      turn(k, lift = 0, yaw = f.turn) { const e = sstep(k); head.rotation.set(lerp(bowX, -0.18 - lift * 0.1, e), yaw * e, lerp(bowZ, f.roll, e), 'YXZ'); },
      nod(k) { head.rotation.x = bowX - 0.25 * k; },
    };
  });

  // ── 小雨：借用鬼模型合約 E 'child' 的骨架與姿勢（抱膝、站起、走路、抬頭），但不用它的黑影外皮；
  //    頭、臉、齊肩的黑髮、1998 年夏天的碎花短袖與短褲、一隻紅布鞋與一隻光腳，全部掛在骨頭上（dressXiaoyu）。──
  const tmpPose2 = {};
  const childG = createGhost(ctx.assets, { variant: 'child' });
  childG.root.name = 'Xiaoyu'; root.add(childG.root);
  const girl = dressXiaoyu(childG);
  const childEye = new THREE.Vector3();
  const child = {
    root: childG.root, ghost: childG, rise: 0, walk: 0, look: 0, lookAt: null, fade: 1,
    /** rise 0 抱膝坐 → 1 站著；walk 速度（公尺/秒）沿 root 前方前進；look 0..1 抬頭看 lookAt（世界座標） */
    update(dt, t) {
      const c = child;
      childG.setPose(c.rise < 0.5 ? (c.look > 0.35 ? 'hugKneesUp' : 'hugKnees') : c.walk > 0 ? 'walkSoft' : 'idle');
      if (c.look > 0.05 && c.lookAt) { childEye.copy(c.lookAt); childEye.y = lerp(c.root.position.y + 0.3, childEye.y, c.look); childG.lookAt(childEye, { maxYaw: 80, maxPitch: 50, speed: 1.1 }); } else childG.lookAt(null);
      if (c.walk > 0) { const d = dt * c.walk; c.root.position.x += Math.sin(c.root.rotation.y) * d; c.root.position.z += Math.cos(c.root.rotation.y) * d; }
      childG.update(t, c.walk > 0);
    },
    setFade(a) { child.fade = a; girl.setFade(a); child.root.visible = a > 0.01; },
  };

  // ── 結局 B：另一個自己 ──
  const coat = fabric('#2b2a2a', 821, 0.8), jeans = fabric('#232a36', 822);
  const dblP = buildPerson(ctx, { name: 'Double', top: coat, bottom: jeans, skin, face: S({ map: faceTexture(31, { stubble: 0.3, tears: false }), roughness: 0.5 }), hair, shoeL: shoe, shoeR: shoe, trim: shoe });
  dblP.root.visible = false; root.add(dblP.root);
  const phone = new THREE.Group(); phone.name = 'PlayerPhone'; root.add(phone); phone.visible = false;
  mesh(boxGeo(0.075, 0.009, 0.155, 0, 0, 0, 1), mats.black, phone);
  const screenMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.75, 0.95), toneMapped: false });
  const screen = mesh(new THREE.PlaneGeometry(0.066, 0.138), screenMat, phone, [0, 0.0048, 0]); screen.rotation.x = -Math.PI / 2; screen.castShadow = false;
  const phoneLight = new THREE.PointLight(0x9ec4ff, 0, 1.6, 2); phoneLight.position.set(0, 0.12, 0); phone.add(phoneLight);
  const dbl = {
    root: dblP.root, J: dblP.J, phone, phoneLight, screenMat, walk: 0, phase: 0, reach: 0,
    update(dt) {
      const d = dbl;
      if (d.walk > 0) d.phase += dt * d.walk * 5.2;
      walkPose(P.stand, d.phase, d.walk > 0 ? 1 : 0, tmpPose2); tmpPose2.py = dblP.pelvisY;
      tmpPose2.shR = [lerp(tmpPose2.shR[0], -1.05, d.reach), 0, lerp(-0.07, -0.25, d.reach)]; tmpPose2.elR = [lerp(-0.15, -1.25, d.reach), 0, 0];
      tmpPose2.head = [lerp(0.05, 0.55, d.reach), 0, 0];
      applyPose(dblP, tmpPose2);
      if (d.walk > 0) { const s = dt * d.walk; d.root.position.x += Math.sin(d.root.rotation.y) * s; d.root.position.z += Math.cos(d.root.rotation.y) * s; }
    },
  };
  phone.position.set(54.72, -6.196, -15.82); phone.rotation.y = 0.4; // 放在舊鎖的石座上；finale.js 讓替身拿起時改掛到它手上

  // ── 1998 年的火 ──
  const fire = group('Fire1998');
  const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.4, 1.15, 0.22), toneMapped: false, fog: false });
  const glow = mesh(new THREE.PlaneGeometry(3.0, 3.26), glowMat, fire, [55, -5.37, -28.585]); glow.castShadow = false; glow.receiveShadow = false;
  const flameTex = flameTexture(), glowTex = glowTexture(), smokeTex = smokeTexture(77);
  const flames = [];
  for (let i = 0; i < 4; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, color: new THREE.Color(3, 1.4, 0.4), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    sp.position.set(55.2 + i * 0.09, -6.86, -28.575); sp.scale.set(0.16, 0.32, 1); fire.add(sp); flames.push({ sp, ph: rng() * 10 });
  }
  // 從送口舔出來、沿著門板往上爬的火舌（在門板前面）
  const licks = [];
  for (let i = 0; i < 5; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, color: new THREE.Color(2.6, 1.0, 0.25), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
    sp.position.set(55.22 + i * 0.05, -6.7, -28.43); fire.add(sp); licks.push({ sp, ph: rng() * 10, x: 55.2 + i * 0.055 });
  }
  // 門縫透出來的光暈（中縫、門底、送口）
  const seamMat = new THREE.MeshBasicMaterial({ map: glowTex, color: 0xff7a2a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0, fog: false });
  for (const [w, h, x, y] of [[0.34, 3.4, 55, -5.4], [3.3, 0.22, 55, -6.98], [0.9, 0.7, 55.32, -6.82], [3.3, 0.18, 55, -3.72]]) { const m = mesh(new THREE.PlaneGeometry(w, h), seamMat, fire, [x, y, -28.47]); m.castShadow = false; m.receiveShadow = false; }
  // 餘燼：一個 Points、每顆粒子自己的壽命
  const EMBERS = 150, ePos = new Float32Array(EMBERS * 3), eCol = new Float32Array(EMBERS * 3), eVel = new Float32Array(EMBERS * 3), eLife = new Float32Array(EMBERS);
  const eGeo = new THREE.BufferGeometry(); eGeo.setAttribute('position', new THREE.BufferAttribute(ePos, 3).setUsage(THREE.DynamicDrawUsage)); eGeo.setAttribute('color', new THREE.BufferAttribute(eCol, 3).setUsage(THREE.DynamicDrawUsage));
  eGeo.boundingSphere = new THREE.Sphere(V(55, -5, -26), 8);
  const embers = new THREE.Points(eGeo, new THREE.PointsMaterial({ map: glowTex, size: 0.045, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false }));
  embers.frustumCulled = false; fire.add(embers);
  let embersLow = false; // 火熄了以後：零星的餘燼散在整個房間裡慢慢往上飄，不從門口（孩子坐的地方）一團噴出來
  const spawnEmber = (i) => {
    if (embersLow) {
      ePos[i * 3] = 52.5 + rng() * 5.5; ePos[i * 3 + 1] = -7 + rng() * 2.2; ePos[i * 3 + 2] = -27.9 + rng() * 4.5;
      if (Math.hypot(ePos[i * 3] - 55.05, ePos[i * 3 + 2] + 28.0) < 0.7) ePos[i * 3 + 2] += 1.2;
      eVel[i * 3] = (rng() - 0.5) * 0.15; eVel[i * 3 + 1] = 0.08 + rng() * 0.2; eVel[i * 3 + 2] = (rng() - 0.5) * 0.12;
      eLife[i] = 2 + rng() * 4; return;
    }
    const fromHole = rng() < 0.5;
    ePos[i * 3] = fromHole ? 55.32 + (rng() - 0.5) * 0.3 : 55 + (rng() - 0.5) * 0.06; ePos[i * 3 + 1] = fromHole ? -6.85 : -7 + rng() * 3.2; ePos[i * 3 + 2] = -28.45;
    eVel[i * 3] = (rng() - 0.5) * 0.5; eVel[i * 3 + 1] = 0.25 + rng() * 0.7; eVel[i * 3 + 2] = 0.2 + rng() * 0.8;
    eLife[i] = 1.2 + rng() * 2.8;
  };
  for (let i = 0; i < EMBERS; i++) { spawnEmber(i); eLife[i] *= rng(); }
  // 煙：門縫上緣與送口冒出來，往天花板爬、沿著天花往外鋪
  const smokes = [];
  for (let i = 0; i < 14; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: 0x6e4632, transparent: true, opacity: 0, depthWrite: false }));
    fire.add(sp); smokes.push({ sp, t: 99 + i, life: 5 + rng() * 3, x: 0, y: 0, z: 0, vx: 0, vz: 0, s: 1 });
  }
  const ceilTex = smokeTex.clone(); ceilTex.wrapS = ceilTex.wrapT = THREE.RepeatWrapping; ceilTex.repeat.set(3, 2); ceilTex.needsUpdate = true;
  const ceilMat = new THREE.MeshBasicMaterial({ map: ceilTex, color: 0x1c1612, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const ceil = mesh(new THREE.PlaneGeometry(15, 12), ceilMat, fire, [55, -2.75, -23]); ceil.rotation.x = Math.PI / 2; ceil.castShadow = false;
  ctx.addLight({ p: [55, -5.8, -27.6], color: 0xff6a1e, intensity: 32, distance: 13, floor: 4, flicker: 0 });
  const fireLight = ctx.lights.at(-1); fireLight.mul = 0;
  const fireApi = {
    group: fire, light: fireLight, level: 0, heat: 0, embersOnly: false,
    update(dt, t) {
      if (!fire.visible) return;
      const k = fireApi.level, full = fireApi.embersOnly ? 0 : 1;
      if (embersLow !== !full) { embersLow = !full; for (let i = 0; i < EMBERS; i++) spawnEmber(i); }
      const f = 0.82 + 0.1 * Math.sin(t * 7.3) * Math.sin(t * 2.1 + 1) + 0.08 * Math.sin(t * 13.7 + 2); // 柔和起伏，不閃爍
      glowMat.color.setRGB(3.4 * k * f * full, 1.15 * k * f * full, 0.22 * k * f * full);
      // 火熄了以後，那一點暖光從門裡低低地照出來（在孩子背後，只勾出輪廓），不再從頭頂直射
      if (full) { fireLight.light.position.set(55, -5.8, -27.6); fireLight.mul = k * (0.85 + 0.25 * f); }
      else { fireLight.light.position.set(55.05, -6.7, -29.05); fireLight.mul = k * (0.3 + 0.08 * f); }
      for (const fl of flames) { const w = Math.sin(t * 9 + fl.ph) * 0.5 + 0.5; fl.sp.scale.set(0.15 + 0.05 * w, (0.28 + 0.12 * w) * k, 1); fl.sp.material.opacity = k * full; }
      for (const l of licks) { const w = 0.5 + 0.5 * Math.sin(t * 6.3 + l.ph), h = (0.35 + 0.45 * w) * k; l.sp.scale.set(0.16 + 0.1 * w, h, 1); l.sp.position.set(l.x + Math.sin(t * 2.1 + l.ph) * 0.03, -6.74 + h * 0.42, -28.43); l.sp.material.opacity = Math.min(1, k * 1.2) * (0.55 + 0.45 * w) * full; }
      seamMat.opacity = Math.min(1, k * 1.1) * f * full;
      for (let i = 0; i < EMBERS; i++) {
        eLife[i] -= dt;
        if (eLife[i] <= 0) spawnEmber(i);
        const j = i * 3;
        eVel[j] += (Math.sin(t * 1.7 + i) * 0.4 - eVel[j] * 0.3) * dt; eVel[j + 1] -= 0.08 * dt;
        ePos[j] += eVel[j] * dt; ePos[j + 1] += eVel[j + 1] * dt; ePos[j + 2] += eVel[j + 2] * dt;
        const a = Math.min(1, eLife[i] * 0.8) * k * (0.6 + 0.4 * Math.sin(t * 11 + i * 3));
        const e = full ? a : a * 0.55 * (i % 3 === 0 ? 1 : 0);
        eCol[j] = 2.2 * e; eCol[j + 1] = 0.7 * e; eCol[j + 2] = 0.12 * e;
      }
      eGeo.attributes.position.needsUpdate = true; eGeo.attributes.color.needsUpdate = true;
      for (const s of smokes) {
        s.t += dt;
        if (s.t > s.life) {
          s.t = 0; s.life = 4.5 + rng() * 3; const top = rng() < 0.6;
          s.x = top ? 54 + rng() * 2 : 55.32; s.y = top ? -3.75 : -6.75; s.z = -28.35; s.vx = (rng() - 0.5) * 0.3; s.vz = 0.15 + rng() * 0.3; s.s = 0.6 + rng() * 0.5;
        }
        const u = s.t / s.life, rise = Math.min(1, s.t * 0.9);
        const y = Math.min(-2.85, s.y + s.t * 0.55 * rise), under = y >= -2.86 ? 1 : 0;
        s.sp.position.set(s.x + s.vx * s.t, y, s.z + s.vz * s.t + under * s.t * 0.35);
        const sz = s.s * (1 + s.t * 0.55); s.sp.scale.set(sz * 1.3, sz, 1);
        s.sp.material.opacity = 0.62 * k * Math.sin(Math.PI * u) * full;
      }
      ceilTex.offset.x = (t * 0.012) % 1; ceilTex.offset.y = (t * 0.02) % 1;
      ceilMat.opacity = Math.min(0.85, k * 0.85) * (0.9 + 0.1 * Math.sin(t * 0.7)) * (full || 0.4);
    },
  };

  // ── 門上的舊鎖與鑰匙（燙紅） ──
  const lockMat = S({ color: 0x6d5629, metalness: 0.85, roughness: 0.42, emissive: 0xff2a06, emissiveIntensity: 0 });
  const ironMat = S({ color: 0x2a2724, metalness: 0.7, roughness: 0.6, emissive: 0xff2a06, emissiveIntensity: 0 });
  const lockG = group('HotLock');
  lockG.position.set(55, -5.5, -28.47);
  // 整組（鐵閂、扣環、鎖、鑰匙）在開鎖之後一起掉到地上
  const lockBody = new THREE.Group(); lockG.add(lockBody);
  mesh(boxGeo(0.62, 0.05, 0.022, 0, 0.0, -0.01, 1), ironMat, lockBody);                      // 跨過兩扇門的鐵閂
  for (const x of [-0.24, 0.24]) mesh(boxGeo(0.05, 0.1, 0.03, x, 0, -0.012, 1), ironMat, lockBody);
  const padlock = new THREE.Group(); padlock.position.set(0, -0.085, 0.03); lockBody.add(padlock);
  mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.2, 16).rotateZ(Math.PI / 2), lockMat, padlock);   // 橫鎖的鎖身
  for (const x of [-0.1, 0.1]) mesh(new THREE.CylinderGeometry(0.041, 0.041, 0.018, 16).rotateZ(Math.PI / 2).translate(x, 0, 0), lockMat, padlock);
  mesh(new THREE.TorusGeometry(0.05, 0.007, 6, 18, Math.PI).translate(0, 0.03, 0), ironMat, padlock); // 鎖環
  const key = new THREE.Group(); key.position.set(0.11, 0, 0); padlock.add(key);
  mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.07, 8).rotateZ(Math.PI / 2).translate(0.035, 0, 0), lockMat, key);
  mesh(new THREE.TorusGeometry(0.018, 0.005, 6, 14).rotateY(Math.PI / 2).translate(0.085, 0, 0), lockMat, key);
  mesh(boxGeo(0.012, 0.016, 0.004, 0.012, -0.01, 0, 1), lockMat, key);
  const lockApi = {
    group: lockG, body: lockBody, key, fall: 0, vy: 0,
    set(heat, turn) { lockMat.emissiveIntensity = heat * 2.6; ironMat.emissiveIntensity = heat * 1.1; key.rotation.x = -turn * Math.PI * 0.55; },
    /** 鎖打開之後掉到地上 */
    update(dt) { if (lockApi.fall <= 0) return; lockApi.vy -= 9 * dt; lockBody.position.y = Math.max(-1.45, lockBody.position.y + lockApi.vy * dt); lockBody.position.z = Math.min(0.32, lockBody.position.z + dt * 0.5); if (lockBody.position.y <= -1.45) { lockBody.rotation.set(0.35, 0.4, 0.08); lockApi.fall = 0; } },
    reset() { lockBody.position.set(0, 0, 0); lockBody.rotation.set(0, 0, 0); lockApi.vy = 0; lockApi.fall = 0; lockApi.set(0, 0); },
  };

  // ── 牌位上浮出的名字、供盤上的布兔、錄音機的轉盤 ──
  const [nc, ng] = canvas(128, 320);
  ng.fillStyle = 'rgba(140,16,10,0.92)'; ng.font = `bold 86px ${KAI}`; ng.textAlign = 'center'; ng.textBaseline = 'middle';
  ['林', '小', '雨'].forEach((ch, i) => ng.fillText(ch, 64, 62 + i * 98));
  const nameMat = new THREE.MeshBasicMaterial({ map: toTex(nc), transparent: true, opacity: 0, depthWrite: false });
  const tabletName = mesh(new THREE.PlaneGeometry(0.17, 0.42), nameMat, root, [51, -5.82, -21.962]); tabletName.castShadow = false; tabletName.visible = false;
  const plateRabbit = rabbit ? rabbit.clone(true) : new THREE.Group();
  plateRabbit.name = 'ReturnedRabbit'; plateRabbit.visible = false; plateRabbit.scale.setScalar(0.46); plateRabbit.position.set(55.04, -5.965, -23.04); plateRabbit.rotation.set(0, 0, 0);
  root.add(plateRabbit);
  const reels = [];
  for (const x of [-0.08, 0.08]) { const r = new THREE.Group(); r.position.set(59 + x, -5.905, -22); root.add(r); reels.push(r); for (let i = 0; i < 3; i++) mesh(boxGeo(0.06, 0.004, 0.008, 0, 0, 0, 1).rotateY(i * Math.PI / 3), mats.bronze, r); }

  // ── 地上的紅線（問者的線，問完了） ──
  const threadCurve = new THREE.CatmullRomCurve3([V(54.78, -5.72, -28.44), V(54.74, -6.4, -28.4), V(54.7, -6.985, -28.15), V(54.9, -6.985, -27.6), V(54.72, -6.985, -27.1), V(55.05, -6.985, -27.2), V(55.3, -6.985, -27.02)]);
  const threadMat = S({ color: 0x9a0c0a, roughness: 0.75, emissive: 0x330000 });
  const thread = mesh(new THREE.TubeGeometry(threadCurve, 80, 0.0045, 5, false), threadMat, root); thread.visible = false; thread.castShadow = false;

  // ── 結局 A：重新繫緊的紅繩（鬆 → 緊兩組頂點在著色器裡內插） ──
  // 繩頭繫在東扇的門環上，沿著佛座的東北角拉下來，繞在地上，另一頭在你手裡（玩家站在佛座東側）
  const ropeSlack = new THREE.CatmullRomCurve3([V(55.22, -5.7, -28.42), V(55.8, -5.86, -28.3), V(56.55, -6.2, -27.95), V(57.12, -6.62, -27.35), V(57.28, -6.95, -26.85), V(57.62, -6.97, -26.45), V(57.98, -6.96, -26.66), V(57.72, -6.95, -26.92), V(57.42, -6.4, -26.2), V(57.5, -6.06, -25.85)]);
  const ropeTaut = new THREE.CatmullRomCurve3([V(55.22, -5.7, -28.42), V(55.47, -5.74, -28.13), V(55.73, -5.78, -27.83), V(56.0, -5.82, -27.53), V(56.26, -5.86, -27.24), V(56.52, -5.9, -26.94), V(56.78, -5.94, -26.65), V(57.04, -5.98, -26.36), V(57.3, -6.02, -26.08), V(57.5, -6.06, -25.85)]);
  const ropeGeo = new THREE.TubeGeometry(ropeSlack, 120, 0.014, 6, false), tautGeo = new THREE.TubeGeometry(ropeTaut, 120, 0.014, 6, false);
  ropeGeo.setAttribute('taut', tautGeo.attributes.position.clone()); tautGeo.dispose();
  const ropeU = { uTight: { value: 0 } };
  const ropeMat = S({ color: 0x8c1410, roughness: 0.82, emissive: 0x2a0000 });
  ropeMat.onBeforeCompile = (sh) => { sh.uniforms.uTight = ropeU.uTight; sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 taut;\nuniform float uTight;').replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = mix(transformed, taut, uTight);'); };
  ropeMat.customProgramCacheKey = () => 'finale-rope';
  const rope = mesh(ropeGeo, ropeMat, root); rope.visible = false; rope.frustumCulled = false;
  const ropeApi = { mesh: rope, set(k) { ropeU.uTight.value = k; } };

  // ── 佛像的紅布：收集所有蒙眼布（含小佛像的實例），黎明時掉在地上 ──
  const fallen = [];
  const clothGeo = (() => { const g = new THREE.PlaneGeometry(0.42, 0.26, 14, 9).rotateX(-Math.PI / 2), p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, Math.max(0, Math.sin(x * 21) * 0.018 + Math.cos(z * 27 + x * 9) * 0.014 + 0.01)); } g.computeVertexNormals(); return g; })();
  const tmpV = new THREE.Vector3();
  for (const s of ctx.statues || []) {
    s.updateMatrixWorld(true); s.getWorldPosition(tmpV);
    const fw = s.getWorldDirection(new THREE.Vector3());
    const x = tmpV.x + fw.x * 0.65 * s.scale.x, z = tmpV.z + fw.z * 0.65 * s.scale.x;
    const g = world.probe(x, z, tmpV.y + 0.6).g;
    if (!Number.isFinite(g) || Math.abs(g - tmpV.y) > 2.2) continue;
    fallen.push(new THREE.Matrix4().compose(V(x, g + 0.004, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng() * TAU, 0)), V(0.9 + rng() * 0.5, 1, 0.9 + rng() * 0.4)));
  }
  const fallenMesh = new THREE.InstancedMesh(clothGeo, blind, Math.max(1, fallen.length));
  fallen.forEach((m, i) => fallenMesh.setMatrixAt(i, m)); fallenMesh.count = fallen.length; fallenMesh.visible = false; fallenMesh.receiveShadow = true; fallenMesh.computeBoundingSphere();
  root.add(fallenMesh);
  const blindApi = {
    count: blindfolds.length,
    /** on = false：所有佛像的紅布不見了，地上多出掉下來的布 */
    set(on) { for (const o of blindfolds) o.visible = on; fallenMesh.visible = !on; },
  };

  // ── 黎明：疊在夜空上的天幕 ──
  const dawnMat = new THREE.ShaderMaterial({
    // 不透明清單裡、緊接在夜空之後畫（renderOrder −999），自己做 alpha 混合；深度測試讓它只蓋在天空上，不會蓋住場景
    side: THREE.BackSide, depthWrite: false, depthTest: true, transparent: false, fog: false,
    blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    uniforms: { uDawn: { value: 0 } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
    fragmentShader: `varying vec3 vDir; uniform float uDawn;
      void main(){ vec3 d = normalize(vDir); float h = clamp(d.y, -0.1, 1.0);
        vec3 zen = vec3(0.045, 0.06, 0.085), hor = vec3(0.13, 0.13, 0.14), east = vec3(0.26, 0.16, 0.1);
        float e = pow(max(0.0, dot(normalize(vec3(d.x, 0.0, d.z) + 1e-4), normalize(vec3(0.8, 0.0, 0.35)))), 3.0);
        vec3 c = mix(mix(hor, east, e * 0.8), zen, smoothstep(0.0, 0.55, h));
        c *= 0.85 + 0.15 * smoothstep(-0.1, 0.2, d.y);
        gl_FragColor = vec4(c, uDawn); }`,
  });
  const dawn = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), dawnMat);
  dawn.name = 'DawnSky'; dawn.frustumCulled = false; dawn.renderOrder = -999; dawn.visible = false;
  dawn.onBeforeRender = (r, s, cam) => { dawn.position.copy(cam.position); dawn.updateMatrixWorld(); };
  mapRoot.add(dawn);

  // ── 山門外：搜救隊。一個人舉著手電筒朝你走近半步、一個人對著無線電講話、一個人回頭招手叫擔架 ──
  const gate = group('RescueAtGate');
  const orange = fabric('#b4561e', 831, 0.85), navy = fabric('#1e2430', 832);
  const helmetY = S({ color: 0xc08a1c, roughness: 0.48 }), helmetR = S({ color: 0xa8321e, roughness: 0.48 });
  const glove = S({ color: 0x2a2622, roughness: 0.82 }), boot = S({ color: 0x141210, roughness: 0.6 });
  const reflect = S({ color: 0xd8d8d0, roughness: 0.25, metalness: 0.1, emissive: 0x303030 });
  const ground = (x, z) => ctx.groundAt ? ctx.groundAt(x, z) : 0;
  const glare = (parent, p, s, color = 0xfff0d8) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false })); sp.position.set(...p); sp.scale.setScalar(s); parent.add(sp); return sp; };
  const RP = {
    aim: { pelvis: [0, 0.12, 0], neck: [0.04, -0.08, 0], head: [0.02, -0.06, 0.03], shR: [-1.42, 0.22, -0.12], elR: [-0.18, 0, 0], shL: [-0.62, -0.25, 0.3], elL: [-1.0, 0.2, 0], wrL: [-0.4, 0, 0], hipL: [-0.12, 0, 0.04], hipR: [0.1, 0, -0.03], knL: [0.2, 0, 0], knR: [0.06, 0, 0] },
    radio: { pelvis: [0.02, -0.2, 0.03], neck: [0.12, 0.22, 0.12], head: [0.08, 0.18, 0.14], shL: [-0.55, 0.1, 0.62], elL: [-2.3, 0.1, 0], wrL: [0.3, 0, 0], shR: [0.12, 0, -0.42], elR: [-1.45, 0.7, 0], hipL: [0.02, 0, 0.05], hipR: [-0.14, 0, -0.06], knR: [0.22, 0, 0], knL: [0.04, 0, 0] },
    wave: { pelvis: [0.02, 0.15, 0], neck: [0.0, 0.62, 0.02], head: [-0.12, 0.66, 0.05], shR: [-2.75, 0, -0.32], elR: [-0.45, 0, 0], shL: [0.08, 0, 0.14], elL: [-0.3, 0, 0], hipL: [-0.06, 0, 0.05], hipR: [0.08, 0, -0.04], knL: [0.12, 0, 0] },
  };
  const mkRescuer = (i, helmet) => buildPerson(ctx, { name: 'Rescuer' + i, top: orange, bottom: navy, skin, hands: glove, face: S({ map: faceTexture(50 + i, { stubble: 0.35, tears: false }), roughness: 0.55 }), hair, shoeL: boot, shoeR: boot, helmet, vest: reflect, trim: reflect, seed: 60 + i });
  const rescuers = [];
  for (const [i, helmet, pose, from, to, ry] of [[0, helmetY, 'aim', [0.42, 24.4], [0.3, 22.2], Math.PI], [1, helmetR, 'radio', [-1.2, 24.5], [-1.2, 24.5], Math.PI + 0.55], [2, helmetR, 'wave', [1.45, 25.7], [1.45, 25.7], 0.35]]) {
    const p = mkRescuer(i, helmet);
    p.root.position.set(from[0], ground(from[0], from[1]), from[1]); p.root.rotation.y = ry; gate.add(p.root);
    const lamp = glare(p.J.lamp, [0, 0.004, 0.03], 0.085, 0xfff3e0);
    rescuers.push({ p, pose, from, to, ry, lamp, t: 0, phase: i * 2.1 });
  }
  // 近距離手電筒下不要過曝成一團白（和小雨同一套壓縮）
  for (const r of rescuers) r.p.root.traverse((o) => { if (o.isMesh && o.material?.isMeshStandardMaterial && !o.material.customProgramCacheKey?.toString().includes('finale-soft')) soften(o.material); });
  // 帶頭那個人的手電筒：握在右手，一道光錐真的打到你身上，地上也被照亮
  const torch = new THREE.Group(); rescuers[0].p.J.wrR.add(torch);
  mesh(new THREE.CylinderGeometry(0.019, 0.025, 0.21, 12).translate(0, -0.09, 0.0), mats.black, torch);
  const torchTip = new THREE.Object3D(); torchTip.position.set(0, -0.205, 0); torch.add(torchTip);
  const torchGlare = glare(gate, [0, 0, 0], 0.75);
  const beamTex = (() => { const [c, g] = canvas(4, 128); const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, '#fff'); gr.addColorStop(0.3, '#666'); gr.addColorStop(1, '#000'); g.fillStyle = gr; g.fillRect(0, 0, 4, 128); return toTex(c, false); })(); // alphaMap 讀的是灰階（綠色通道）
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff1d8, alphaMap: beamTex, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const beam = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 28, 1, true).translate(0, -0.5, 0), beamMat); beam.frustumCulled = false; beam.castShadow = false; beam.receiveShadow = false; gate.add(beam);
  const beamLight = new THREE.PointLight(0xfff0dc, 0, 3.6, 1.5); gate.add(beamLight);
  const tipW = new THREE.Vector3(), aimV = new THREE.Vector3(), defaultTarget = new THREE.Vector3(0, 1.62, 18.6), Y_DOWN = new THREE.Vector3(0, -1, 0);
  // 擔架與阿哲
  const stretcher = new THREE.Group(); stretcher.name = 'Stretcher'; gate.add(stretcher);
  const frame = S({ color: 0xa8461c, roughness: 0.6, metalness: 0.3 });
  for (const x of [-0.29, 0.29]) mesh(new THREE.CylinderGeometry(0.018, 0.018, 2.15, 10).rotateX(Math.PI / 2), frame, stretcher, [x, 0, 0]);
  for (const z of [-0.85, 0, 0.85]) mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.58, 8).rotateZ(Math.PI / 2), frame, stretcher, [0, -0.02, z]);
  mesh(boxGeo(0.56, 0.02, 1.95, 0, -0.04, 0, 1), frame, stretcher);
  const blanket = soften(S({ color: 0xa8a8a4, metalness: 0.85, roughness: 0.36 }));
  const blanketGeo = new THREE.BoxGeometry(0.56, 0.17, 1.3, 10, 3, 24), bpos = blanketGeo.attributes.position;
  for (let i = 0; i < bpos.count; i++) { const y = bpos.getY(i), z = bpos.getZ(i), x = bpos.getX(i); if (y > 0) bpos.setY(i, y + Math.sin(z * 9 + x * 13) * 0.012 - Math.abs(x) * 0.2); }
  blanketGeo.computeVertexNormals();
  mesh(blanketGeo, blanket, stretcher, [0, 0.2, -0.33]); // 從腳蓋到胸口，頭和肩膀露在外面
  mesh(new THREE.SphereGeometry(1, 14, 8).scale(0.17, 0.07, 0.12), soften(S({ color: 0x4a4f56, roughness: 0.95 })), stretcher, [0, 0.05, 0.68]); // 枕頭（頭朝擔架前進的方向）
  const azFace = S({ map: faceTexture(11, { stubble: 0.55, tears: false }), roughness: 0.5 });
  const azP = buildPerson(ctx, { name: 'AzheOnStretcher', top: outfits[0].top, bottom: outfits[0].bottom, skin, face: azFace, hair, shoeL: shoe, shoeR: shoe });
  applyPose(azP, { ...P.lie, shL: [0.02, 0, 0.03], shR: [0.02, 0, -0.03], py: azP.pelvisY });
  const azHead = azP.J.head; bake(azP, ['head']);
  azP.root.rotation.x = -Math.PI / 2; azP.root.position.set(0, 0.15, 0.95); azP.root.scale.setScalar(0.98);
  const azTurn = new THREE.Group(); azTurn.rotation.y = Math.PI; azTurn.add(azP.root); stretcher.add(azTurn); // 頭在前面，抬過你身邊時先看到他的臉
  const carriers = [];
  for (const [i, z] of [[0, -1.25], [1, 1.25]]) {
    const face = S({ map: faceTexture(70 + i, { stubble: 0.3, tears: false }), roughness: 0.55 });
    const p = buildPerson(ctx, { name: 'Carrier' + i, top: orange, bottom: navy, skin, hands: glove, face, hair, shoeL: boot, shoeR: boot, helmet: i ? helmetY : helmetR, vest: reflect, trim: reflect, seed: 80 + i });
    p.root.position.set(0, -0.82, z); stretcher.add(p.root);
    carriers.push({ p, phase: i * Math.PI, front: z > 0 });
  }
  for (const o of [...carriers.map((c) => c.p.root), azP.root]) o.traverse((m) => { if (m.isMesh && m.material?.isMeshStandardMaterial && !m.material.customProgramCacheKey?.toString().includes('finale-soft')) soften(m.material); });
  const gateApi = {
    group: gate, rescuers, stretcher, carriers, azHead, walk: 0, target: null, beam: 1, t: 0, torchTip,
    /** 重新開始這一幕：帶頭的人回到遠一點的位置，再往你走近半步 */
    begin() { gateApi.t = 0; for (const r of rescuers) r.p.root.position.set(r.from[0], ground(r.from[0], r.from[1]), r.from[1]); },
    update(dt, t) {
      if (!gate.visible) { beamLight.intensity = 0; return; }
      gateApi.t += dt;
      for (const r of rescuers) {
        const pose = RP[r.pose], step = r.pose === 'aim' ? clampN(gateApi.t / 1.6, 0, 1) : 1;
        if (r.pose === 'aim' && step < 1) { // 往前走半步
          r.phase += dt * 6; const x = lerp(r.from[0], r.to[0], sstep(step)), z = lerp(r.from[1], r.to[1], sstep(step));
          r.p.root.position.set(x, ground(x, z), z); walkPose(pose, r.phase, 0.55 * Math.sin(Math.PI * step), tmpPose2);
        } else walkPose(pose, 0, 0, tmpPose2);
        tmpPose2.py = r.p.pelvisY - 0.01 * Math.sin(t * 1.4 + r.phase);
        tmpPose2.neck[0] += 0.03 * Math.sin(t * 0.7 + r.phase);
        if (r.pose === 'wave') { const w = Math.sin(t * 5.2); tmpPose2.shR = [-2.75, 0, -0.32 + 0.32 * w]; tmpPose2.elR = [-0.45 - 0.35 * w, 0, 0]; }
        if (r.pose === 'radio') tmpPose2.head = [0.08 + 0.05 * Math.sin(t * 2.3), 0.18, 0.14];
        applyPose(r.p, tmpPose2);
      }
      // 手電筒：光錐從燈頭打到你胸口，地上被照亮一圈
      const target = gateApi.target || defaultTarget;
      torchTip.getWorldPosition(tipW); aimV.copy(target).sub(tipW); aimV.y -= 0.25;
      const L = Math.max(0.1, aimV.length()); aimV.multiplyScalar(1 / L);
      torchGlare.position.copy(tipW);
      // 光錐停在你面前一公尺多（鏡頭不會在光錐裡面），刺眼的部分交給畫面上的眩光
      const BL = Math.max(0.4, L - 1.3); beam.position.copy(tipW); beam.quaternion.setFromUnitVectors(Y_DOWN, aimV); beam.scale.set(BL * 0.2, BL, BL * 0.2);
      beamMat.opacity = 0.1 * gateApi.beam;
      beamLight.position.copy(target).addScaledVector(aimV, -0.65); beamLight.position.y = target.y - 0.9; beamLight.intensity = 7 * gateApi.beam;
      for (const c of carriers) {
        if (gateApi.walk > 0) c.phase += dt * 6.2;
        walkPose(c.front ? P.carryFront : P.carry, c.phase, gateApi.walk > 0 ? 0.8 : 0, tmpPose2); tmpPose2.py = c.p.pelvisY; applyPose(c.p, tmpPose2);
      }
      if (gateApi.walk > 0) { stretcher.position.y = ground(stretcher.position.x, stretcher.position.z) + 0.82 + Math.abs(Math.sin(carriers[0].phase)) * 0.015; stretcher.position.z += dt * gateApi.walk; }
    },
  };

  // ── 重設：所有陳設回到「沒有發生任何事」 ──
  function reset() {
    doorApi.set(0);
    seats.visible = false; for (const f of friends) f.turn(0);
    child.root.visible = false; child.rise = 0; child.walk = 0; child.look = 0; child.setFade(1); child.root.visible = false;
    dbl.root.visible = false; dbl.walk = 0; dbl.reach = 0; phone.visible = false; phoneLight.intensity = 0;
    if (phone.parent !== root) { phone.parent.remove(phone); root.add(phone); } phone.position.set(54.72, -6.196, -15.82); phone.rotation.set(0, 0.4, 0);
    fire.visible = false; fireApi.level = 0; fireApi.embersOnly = false; fireLight.mul = 0;
    lockG.visible = false; lockApi.reset();
    tabletName.visible = false; nameMat.opacity = 0; plateRabbit.visible = false;
    thread.visible = false; rope.visible = false; ropeApi.set(0);
    blindApi.set(true); dawn.visible = false; dawnMat.uniforms.uDawn.value = 0;
    gate.visible = false; gateApi.walk = 0;
    if (altar) altar.visible = true; if (altarBox) altarBox.disabled = false; if (sealedBuddha) sealedBuddha.visible = true;
  }
  reset();

  return {
    root, door: doorApi, seats, friends, child, double: dbl, phone, fire: fireApi, lock: lockApi, tabletName, nameMat, plateRabbit, reels,
    thread, rope: ropeApi, blindfolds: blindApi, dawn, dawnMat, gate: gateApi, altar, altarBox, sealedBuddha, seatTop, reset, blindMat: blind,
    update(dt, t) {
      fireApi.update(dt, t); lockApi.update(dt);
      if (child.root.visible) child.update(dt, t);
      if (dbl.root.visible) dbl.update(dt);
      gateApi.update(dt, t);
    },
  };
}
