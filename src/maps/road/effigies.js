import * as THREE from 'three';
import { mulberry32, merge, xf, boxGeo, cylinderBetween } from '../../core/utils.js';

/**
 * 榮昌紙紮行的紙紮：童男童女、僕人、披麻的白衣紙人、靈厝、未糊紙的竹骨架、架上的紙頭。
 * 全部以 Three.js 幾何 + 一張 1024² 的手繪風 Canvas 圖集完成（臉、衣服、靈厝立面、頭髮、竹）。
 * 站立的紙人與架上的頭以 { root, head } 回傳，讓恐怖導演在玩家沒看時轉動它們的頭。
 * 面向：root 與 head 的本地 +Z 是臉朝的方向（與寺廟佛像一致）。
 */

const KAI = '"DFKai-SB","BiauKai","KaiTi","標楷體","PMingLiU",serif';
const A = 1024; // 圖集邊長
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ───────────────────────── 圖集 ─────────────────────────
function speck(g, rng, x0, y0, w, h, n, rgb, aMin, aMax, rMin, rMax) {
  for (let i = 0; i < n; i++) {
    const x = x0 + rng() * w, y = y0 + rng() * h, r = rMin + rng() * (rMax - rMin);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(${rgb},${(aMin + rng() * (aMax - aMin)).toFixed(3)})`); grad.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grad; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}
/** 由上往下的水漬 */
function drips(g, rng, x0, y0, w, h, n, rgb, a = 0.3) {
  for (let i = 0; i < n; i++) {
    const x = x0 + rng() * w, y = y0 + rng() * h * 0.5, len = h * (0.15 + rng() * 0.55), ww = 2 + rng() * 9;
    const grad = g.createLinearGradient(0, y, 0, y + len);
    grad.addColorStop(0, `rgba(${rgb},${(a * (0.4 + rng() * 0.6)).toFixed(3)})`); grad.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grad; g.fillRect(x, y, ww, Math.min(len, y0 + h - y));
  }
}
/** 紙破掉露出底下的竹篾 */
function tear(g, rng, cx, cy, r) {
  g.save();
  g.beginPath();
  const n = 9, ph = rng() * 6;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2, rr = r * (0.6 + 0.5 * Math.sin(a * 3 + ph) * 0.6 + rng() * 0.3);
    if (i === 0) g.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 1.4); else g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 1.4);
  }
  g.closePath(); g.fillStyle = '#0c0907'; g.fill(); g.clip();
  g.strokeStyle = '#8a7444'; g.lineWidth = 3;
  for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(cx + k * r * 0.5, cy - r * 2); g.lineTo(cx + k * r * 0.5 + r * 0.2, cy + r * 2); g.stroke(); }
  g.lineWidth = 2; g.beginPath(); g.moveTo(cx - r * 2, cy + r * 0.2); g.lineTo(cx + r * 2, cy - r * 0.1); g.stroke();
  g.restore();
}

function drawFace(g, rng, x0, y0, kind) {
  const S = 256, cx = x0 + 128;
  g.save(); g.beginPath(); g.rect(x0, y0, S, S); g.clip();
  g.fillStyle = kind === 3 ? '#d4cbb9' : '#d8c9b3'; g.fillRect(x0, y0, S, S);
  speck(g, rng, x0, y0, S, S, 30, '150,120,86', 0.04, 0.16, 10, 46);
  // 腮紅：邊緣很硬的兩個圓
  g.fillStyle = kind === 2 ? 'rgba(150,62,56,0.6)' : 'rgba(184,62,54,0.82)';
  for (const sx of [-1, 1]) { g.beginPath(); g.arc(cx + sx * 54, y0 + 152, 21, 0, 6.3); g.fill(); }
  // 眉：細而彎
  g.strokeStyle = '#17120e'; g.lineCap = 'round'; g.lineWidth = 3;
  for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(cx + sx * 18, y0 + 92); g.quadraticCurveTo(cx + sx * 40, y0 + 78 - (kind === 1 ? 4 : 0), cx + sx * 62, y0 + 92); g.stroke(); }
  // 眼：杏形的墨線。紙紮照規矩不點睛——只有一尊例外
  for (const sx of [-1, 1]) {
    const ex = cx + sx * 39, ey = y0 + 113;
    g.lineWidth = 2.6; g.beginPath(); g.moveTo(ex - 19, ey + 1); g.quadraticCurveTo(ex, ey - 11, ex + 19, ey + 1); g.quadraticCurveTo(ex, ey + 8, ex - 19, ey + 1); g.stroke();
    g.fillStyle = '#e4dccc'; g.fill();
    if (kind === 3) { g.fillStyle = '#060504'; g.beginPath(); g.arc(ex + 1.5, ey - 0.5, 6.2, 0, 6.3); g.fill(); g.fillStyle = 'rgba(230,225,210,0.7)'; g.beginPath(); g.arc(ex - 0.5, ey - 2.5, 1.3, 0, 6.3); g.fill(); }
    if (kind === 2 && sx > 0) { // 被水暈開的那隻眼
      const grad = g.createRadialGradient(ex, ey + 6, 2, ex, ey + 10, 34);
      grad.addColorStop(0, 'rgba(20,16,14,0.75)'); grad.addColorStop(1, 'rgba(20,16,14,0)');
      g.fillStyle = grad; g.fillRect(ex - 36, ey - 26, 72, 80);
    }
  }
  // 鼻：兩點
  g.fillStyle = '#3a2a20'; for (const sx of [-1, 1]) { g.beginPath(); g.arc(cx + sx * 5, y0 + 146, 1.6, 0, 6.3); g.fill(); }
  // 唇：小而紅，嘴角上揚得稍微太多
  g.fillStyle = '#a3201a';
  g.beginPath(); g.moveTo(cx - 17, y0 + 176); g.quadraticCurveTo(cx - 7, y0 + 167, cx, y0 + 172); g.quadraticCurveTo(cx + 7, y0 + 167, cx + 17, y0 + 176);
  g.quadraticCurveTo(cx, y0 + 191, cx - 17, y0 + 176); g.fill();
  g.strokeStyle = '#2a0c0a'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(cx - 22, y0 + 173); g.quadraticCurveTo(cx, y0 + 181, cx + 22, y0 + 173); g.stroke();
  if (kind === 0) { g.fillStyle = '#a3201a'; g.beginPath(); g.arc(cx, y0 + 74, 4.5, 0, 6.3); g.fill(); } // 眉心花鈿
  // 從眼角往下流的墨痕與水漬
  for (const sx of [-1, 1]) for (let k = 0; k < (kind === 2 ? 4 : 2); k++) {
    const x = cx + sx * (30 + rng() * 22), len = 40 + rng() * 90;
    const grad = g.createLinearGradient(0, y0 + 116, 0, y0 + 116 + len);
    grad.addColorStop(0, 'rgba(24,18,16,0.5)'); grad.addColorStop(1, 'rgba(24,18,16,0)');
    g.fillStyle = grad; g.fillRect(x, y0 + 116, 1.5 + rng() * 2.5, len);
  }
  drips(g, rng, x0, y0, S, S, 6, '96,70,40', 0.22);
  speck(g, rng, x0 + (kind % 2 ? 10 : 150), y0 + 150, 90, 90, 40, '26,34,22', 0.1, 0.45, 2, 9); // 黴斑
  if (kind === 1) tear(g, rng, x0 + 196, y0 + 208, 16);
  if (kind === 2) tear(g, rng, x0 + 62, y0 + 60, 13);
  g.restore();
}

function drawOutfit(g, rng, x0, y0, kind) {
  const W = 256, H = 512, cx = x0 + 128;
  const pal = [
    { top: '#9a1f1b', skirt: '#1f6a46', trim: '#c9a13a', sash: '#c9a13a' }, // 童女：紅襖綠裙
    { top: '#1f4b8a', skirt: '#1f4b8a', trim: '#16130f', sash: '#a3231c' }, // 童男：藍長袍
    { top: '#3a2452', skirt: '#2a1b3e', trim: '#b9b3a0', sash: '#7a6a2a' }, // 僕人：絳紫
    { top: '#c9c2ae', skirt: '#beb6a0', trim: '#8a7a50', sash: '#8a7a50' }, // 披麻的白衣
  ][kind];
  g.save(); g.beginPath(); g.rect(x0, y0, W, H); g.clip();
  g.fillStyle = pal.top; g.fillRect(x0, y0, W, 236);
  g.fillStyle = pal.skirt; g.fillRect(x0, y0 + 236, W, H - 236);
  // 色紙本身的刷痕與摺痕
  for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(255,255,255,${rng() * 0.05})`; g.fillRect(x0, y0 + rng() * H, W, 1 + rng() * 2); }
  for (let i = 0; i < 9; i++) { g.strokeStyle = `rgba(0,0,0,${0.12 + rng() * 0.16})`; g.lineWidth = 1; const x = x0 + rng() * W; g.beginPath(); g.moveTo(x, y0); g.lineTo(x + (rng() - 0.5) * 20, y0 + H); g.stroke(); }
  // 交領與門襟
  g.strokeStyle = pal.trim; g.lineWidth = 9;
  g.beginPath(); g.moveTo(cx - 44, y0 + 2); g.lineTo(cx + 6, y0 + 92); g.lineTo(cx + 6, y0 + 230); g.stroke();
  g.beginPath(); g.moveTo(cx + 44, y0 + 2); g.lineTo(cx - 2, y0 + 70); g.stroke();
  // 盤扣
  g.fillStyle = kind === 3 ? '#6a5c3a' : '#d6b24a';
  for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(cx + 6, y0 + 112 + k * 30, 5, 0, 6.3); g.fill(); }
  // 腰帶
  g.fillStyle = pal.sash; g.fillRect(x0, y0 + 224, W, 22);
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x0, y0 + 244, W, 3);
  // 裙褶
  g.strokeStyle = 'rgba(0,0,0,0.28)'; g.lineWidth = 2;
  for (let k = 0; k <= 12; k++) { const x = x0 + (k / 12) * W; g.beginPath(); g.moveTo(x, y0 + 250); g.lineTo(x + (k - 6) * 1.5, y0 + H); g.stroke(); }
  // 下襬的金箔邊與剪紙花
  g.fillStyle = pal.trim; g.fillRect(x0, y0 + H - 34, W, 10);
  if (kind !== 3) {
    for (let k = 0; k < 6; k++) {
      const fx = x0 + 22 + k * 43, fy = y0 + H - 62;
      g.fillStyle = kind === 0 ? '#d7a53a' : '#c3bca6';
      for (let p = 0; p < 5; p++) { const a = (p / 5) * 6.283; g.beginPath(); g.arc(fx + Math.cos(a) * 7, fy + Math.sin(a) * 7, 5, 0, 6.3); g.fill(); }
      g.fillStyle = '#7a1b16'; g.beginPath(); g.arc(fx, fy, 3.5, 0, 6.3); g.fill();
    }
  } else {
    // 白衣：粗麻的經緯
    g.strokeStyle = 'rgba(90,76,48,0.22)'; g.lineWidth = 1;
    for (let y = 0; y < H; y += 5) { g.beginPath(); g.moveTo(x0, y0 + y); g.lineTo(x0 + W, y0 + y + (rng() - 0.5) * 2); g.stroke(); }
    for (let x = 0; x < W; x += 5) { g.beginPath(); g.moveTo(x0 + x, y0); g.lineTo(x0 + x, y0 + H); g.stroke(); }
  }
  // 受潮：褪色、往下流的褐色水漬、下襬吸水發黑、黴斑、破洞
  speck(g, rng, x0, y0, W, H, 26, '210,200,180', 0.04, 0.18, 14, 60);
  drips(g, rng, x0, y0, W, H, 16, '54,38,22', 0.42);
  const wick = g.createLinearGradient(0, y0 + H - 110, 0, y0 + H);
  wick.addColorStop(0, 'rgba(20,16,12,0)'); wick.addColorStop(1, 'rgba(20,16,12,0.62)');
  g.fillStyle = wick; g.fillRect(x0, y0 + H - 110, W, 110);
  speck(g, rng, x0, y0 + H - 150, W, 150, 70, '22,30,20', 0.1, 0.4, 2, 10);
  tear(g, rng, x0 + 40 + rng() * 170, y0 + 300 + rng() * 150, 12 + rng() * 10);
  if (kind % 2) tear(g, rng, x0 + 40 + rng() * 170, y0 + 60 + rng() * 120, 9 + rng() * 7);
  g.restore();
}

function drawHouse(g, rng, x0, y0) {
  const W = 512, H = 256;
  g.save(); g.beginPath(); g.rect(x0, y0, W, H); g.clip();
  g.fillStyle = '#a3261d'; g.fillRect(x0, y0, W, H);
  // 上緣：綠琉璃瓦
  g.fillStyle = '#1f6a46'; g.fillRect(x0, y0, W, 46);
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2;
  for (let x = 0; x < W; x += 14) { g.beginPath(); g.moveTo(x0 + x, y0); g.lineTo(x0 + x, y0 + 46); g.stroke(); }
  g.fillStyle = '#c9a13a'; g.fillRect(x0, y0 + 46, W, 8);
  // 柱、門、格窗
  for (let k = 0; k <= 4; k++) { g.fillStyle = '#c9a13a'; g.fillRect(x0 + k * 122 + 6, y0 + 54, 14, H - 54); }
  for (let k = 0; k < 4; k++) {
    const bx = x0 + k * 122 + 32, door = k === 1 || k === 2;
    g.fillStyle = door ? '#3b0f0c' : '#d8cdb4'; g.fillRect(bx, y0 + (door ? 84 : 96), 84, door ? H - 84 : 96);
    g.strokeStyle = door ? '#c9a13a' : '#7a1b16'; g.lineWidth = 3; g.strokeRect(bx, y0 + (door ? 84 : 96), 84, door ? H - 84 : 96);
    if (!door) { g.lineWidth = 2; for (let i = 1; i < 5; i++) { g.beginPath(); g.moveTo(bx + i * 17, y0 + 96); g.lineTo(bx + i * 17, y0 + 192); g.moveTo(bx, y0 + 96 + i * 19); g.lineTo(bx + 84, y0 + 96 + i * 19); g.stroke(); } }
    else { g.fillStyle = '#c9a13a'; g.beginPath(); g.arc(bx + (k === 1 ? 70 : 14), y0 + 170, 5, 0, 6.3); g.fill(); }
  }
  g.fillStyle = '#16130f'; g.font = `bold 26px ${KAI}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#c9a13a'; g.fillRect(x0 + 196, y0 + 56, 120, 26); g.fillStyle = '#16130f'; g.fillText('福 壽 堂', x0 + 256, y0 + 70);
  speck(g, rng, x0, y0, W, H, 40, '210,200,180', 0.04, 0.16, 12, 50);
  drips(g, rng, x0, y0, W, H, 22, '40,28,16', 0.4);
  speck(g, rng, x0, y0 + 150, W, 106, 80, '20,28,18', 0.1, 0.4, 2, 10);
  tear(g, rng, x0 + 420, y0 + 130, 18);
  g.restore();
}

let atlasTex = null;
function effigyAtlas() {
  if (atlasTex) return atlasTex;
  const c = document.createElement('canvas'); c.width = c.height = A;
  const g = c.getContext('2d'), rng = mulberry32(2826);
  for (let k = 0; k < 4; k++) drawFace(g, rng, k * 256, 0, k);
  for (let k = 0; k < 4; k++) drawOutfit(g, rng, k * 256, 256, k);
  drawHouse(g, rng, 0, 768);
  // 頭髮：黑紙，有幾道反光的梳痕
  g.fillStyle = '#0d0b0a'; g.fillRect(512, 768, 128, 256);
  for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(90,84,76,${0.1 + rng() * 0.2})`; g.lineWidth = 1; const x = 512 + rng() * 128; g.beginPath(); g.moveTo(x, 768); g.lineTo(x + (rng() - 0.5) * 12, 1024); g.stroke(); }
  // 白紙燈籠：「奠」
  g.fillStyle = '#cfc7b3'; g.fillRect(640, 768, 128, 256);
  for (let i = 0; i < 9; i++) { g.strokeStyle = 'rgba(70,56,36,0.3)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(640, 790 + i * 26); g.lineTo(768, 790 + i * 26); g.stroke(); }
  // 這一格會被橫向拉成兩倍寬貼到半圈燈籠上，所以字先壓扁一半
  g.save(); g.translate(704, 896); g.scale(0.5, 1); g.fillStyle = '#16130f'; g.font = `bold 96px ${KAI}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('奠', 0, 0); g.restore();
  speck(g, rng, 640, 768, 128, 256, 24, '70,50,26', 0.06, 0.26, 8, 36); drips(g, rng, 640, 768, 128, 256, 7, '50,36,20', 0.4);
  // 金箔與紅紙
  g.fillStyle = '#b08d32'; g.fillRect(768, 768, 128, 128); speck(g, rng, 768, 768, 128, 128, 30, '60,40,10', 0.1, 0.3, 4, 20); speck(g, rng, 768, 768, 128, 128, 16, '250,236,170', 0.06, 0.25, 4, 16);
  g.fillStyle = '#8f1d18'; g.fillRect(768, 896, 128, 128); speck(g, rng, 768, 896, 128, 128, 24, '40,10,8', 0.1, 0.3, 4, 22);
  // 竹篾
  g.fillStyle = '#8f7a48'; g.fillRect(896, 768, 128, 256);
  for (let i = 0; i < 60; i++) { g.strokeStyle = `rgba(${40 + rng() * 40},${30 + rng() * 30},12,${0.15 + rng() * 0.3})`; g.lineWidth = 1; const x = 896 + rng() * 128; g.beginPath(); g.moveTo(x, 768); g.lineTo(x, 1024); g.stroke(); }
  for (let y = 800; y < 1024; y += 58) { g.fillStyle = 'rgba(40,30,14,0.6)'; g.fillRect(896, y, 128, 3); }
  atlasTex = new THREE.CanvasTexture(c);
  atlasTex.colorSpace = THREE.SRGBColorSpace; atlasTex.anisotropy = 4;
  return atlasTex;
}
/** 圖集上的矩形（像素）→ UV 範圍 [u0, v0, u1, v1]（v 向上） */
const R = (x, y, w, h) => [x / A, 1 - (y + h) / A, (x + w) / A, 1 - y / A];
const UV = {
  face: (k) => R(k * 256, 0, 256, 256),
  outfit: (k) => R(k * 256, 256, 256, 512),
  skin: (k) => R(k * 256 + 8, 8, 12, 12),
  cloth: (k) => R(k * 256 + 14, 256 + 120, 26, 60),
  house: R(0, 768, 512, 256), hair: R(516, 772, 120, 248), lantern: R(640, 768, 128, 256),
  gold: R(772, 772, 120, 120), red: R(772, 900, 120, 120), bamboo: R(900, 772, 120, 248), roof: R(4, 770, 500, 40),
};
function remap(geo, r) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, r[0] + uv.getX(i) * (r[2] - r[0]), r[1] + uv.getY(i) * (r[3] - r[1]));
  return geo;
}
/** 紙糊在竹架上：一片片平的紙面，不做平滑法線；頂點帶一點皺 */
function papery(geo, rng, k = 0.006) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = Math.sin(x * 61 + y * 37) * Math.cos(z * 53 - y * 29);
    p.setXYZ(i, x + n * k, y + Math.cos(x * 43 + z * 31) * k * 0.5, z + n * k);
  }
  const flat = geo.index ? geo.toNonIndexed() : geo;
  flat.computeVertexNormals();
  return flat;
}

// ───────────────────────── 單尊紙人 ─────────────────────────
function effigyBody(kind, rng, pose) {
  const parts = [];
  // 袍身：八角的紙筒，下襬張開
  const prof = [[0.215, 0.07], [0.195, 0.24], [0.15, 0.6], [0.108, 0.88], [0.14, 1.1], [0.158, 1.22], [0.11, 1.3], [0.042, 1.345]];
  // 九角的紙筒：奇數邊時正面是一整片平的紙，貼圖中線（u=0.5）剛好落在正面，接縫留在背後
  const robe = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 9).rotateY(Math.PI);
  // Lathe 的 v 是沿剖面的索引：改成依高度，衣服圖樣才不會被拉歪
  { const p = robe.attributes.position, uv = robe.attributes.uv; for (let i = 0; i < p.count; i++) uv.setY(i, (p.getY(i) - 0.07) / 1.275); }
  robe.scale(1, 1, 0.82);
  parts.push(remap(robe, UV.outfit(kind)));
  // 袖：直挺挺的紙筒；pose 決定是垂手還是平舉
  for (const sx of [-1, 1]) {
    const sh = V(sx * 0.145, 1.2, 0), lift = pose === 'hold' ? 0.5 : pose === 'reach' && sx > 0 ? 1.1 : 0.1;
    const el = V(sx * (0.2 + lift * 0.04), 1.2 - 0.46 * Math.cos(lift), 0.46 * Math.sin(lift));
    const sleeve = cylinderBetween(sh, el, 0.04, 0.058, 6);
    parts.push(remap(sleeve, UV.cloth(kind)));
    const hand = xf(new THREE.BoxGeometry(0.046, 0.1, 0.014), { p: [el.x, el.y - 0.045 * Math.cos(lift), el.z + 0.045 * Math.sin(lift)], r: [-lift, 0, 0] });
    parts.push(remap(hand, UV.skin(kind)));
  }
  // 底座：兩根竹腳插在木板上
  for (const sx of [-1, 1]) parts.push(remap(cylinderBetween(V(sx * 0.06, 0.0, 0), V(sx * 0.05, 0.1, 0), 0.012, 0.012, 5), UV.bamboo));
  parts.push(remap(new THREE.BoxGeometry(0.3, 0.02, 0.24).translate(0, 0.01, 0), UV.bamboo));
  return papery(merge(parts), rng);
}
function effigyHead(kind, rng, style) {
  const r = 0.088, parts = [];
  // 前半：臉（正投影到臉的方格）
  const front = new THREE.SphereGeometry(r, 12, 10, 0, Math.PI);
  { const p = front.attributes.position, uv = front.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5 + p.getX(i) / (2.02 * r), 0.5 + p.getY(i) / (2.02 * r)); }
  parts.push(remap(front, UV.face(kind)));
  parts.push(remap(new THREE.SphereGeometry(r, 12, 10, Math.PI, Math.PI), UV.hair));
  // 黑紙頭髮：罩住頭頂與後腦，前額留一道髮際
  const cap = new THREE.SphereGeometry(r * 1.05, 12, 6, 0, Math.PI * 2, 0, 1.02);
  parts.push(remap(cap, UV.hair));
  const back = new THREE.SphereGeometry(r * 1.05, 10, 8, Math.PI * 1.02, Math.PI * 0.96, 0.9, 1.15);
  parts.push(remap(back, UV.hair));
  if (style === 'girl') {
    for (const sx of [-1, 1]) parts.push(remap(new THREE.SphereGeometry(0.034, 8, 6).translate(sx * 0.07, 0.07, -0.016), UV.hair));
    for (const sx of [-1, 1]) parts.push(remap(new THREE.SphereGeometry(0.011, 6, 4).translate(sx * 0.07, 0.07, 0.02), UV.red));
  } else if (style === 'boy') {
    parts.push(remap(new THREE.SphereGeometry(r * 1.09, 10, 5, 0, Math.PI * 2, 0, 0.8), UV.hair));
    parts.push(remap(new THREE.SphereGeometry(0.014, 6, 4).translate(0, r * 1.12, 0), UV.red));
  } else if (style === 'mourn') {
    // 披麻：白布頭巾垂到肩
    const hood = new THREE.SphereGeometry(r * 1.12, 10, 6, Math.PI * 0.88, Math.PI * 1.24, 0, 1.75);
    parts.push(remap(hood, UV.cloth(3)));
  } else {
    parts.push(remap(new THREE.CylinderGeometry(0.04, 0.07, 0.06, 8).translate(0, r * 1.0, 0), UV.hair)); // 僕人的小帽
  }
  parts.push(remap(new THREE.CylinderGeometry(0.026, 0.032, 0.07, 6).translate(0, -r * 1.05, 0), UV.skin(kind))); // 紙筒脖子
  // 頭是紙漿糊的，表面平滑：保留球面的法線，不做紙片的平面著色
  const g = merge(parts);
  g.scale(0.94, 1.12, 0.92);
  return g;
}

/** 未糊紙的竹骨架（做到一半的紙人） */
function bambooFrame(rng, h = 1.3) {
  const parts = [];
  const ring = (y, rx) => parts.push(xf(new THREE.TorusGeometry(rx, 0.006, 4, 14), { r: [Math.PI / 2, 0, 0], p: [0, y, 0], s: [1, 1, 0.8] }));
  const prof = [[0.19, 0.05], [0.15, 0.45], [0.115, 0.7], [0.15, 0.9], [0.16, 1.0], [0.05, 1.1]];
  for (const [r, y] of prof) ring(y * (h / 1.3), r);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * 6.283;
    for (let i = 0; i < prof.length - 1; i++) parts.push(cylinderBetween(V(Math.cos(a) * prof[i][0], prof[i][1] * (h / 1.3), Math.sin(a) * prof[i][0] * 0.8), V(Math.cos(a) * prof[i + 1][0], prof[i + 1][1] * (h / 1.3), Math.sin(a) * prof[i + 1][0] * 0.8), 0.005, 0.005, 4));
  }
  // 頭：三道竹圈
  for (const ry of [0, Math.PI / 3, (Math.PI * 2) / 3]) parts.push(xf(new THREE.TorusGeometry(0.1, 0.005, 4, 14), { r: [0, ry, 0], p: [0, h * 0.94, 0] }));
  // 手臂只是兩根竹條
  for (const sx of [-1, 1]) parts.push(cylinderBetween(V(sx * 0.15, h * 0.76, 0), V(sx * 0.26, h * 0.48, 0.03), 0.006, 0.006, 4));
  return remap(merge(parts), UV.bamboo);
}

/**
 * @returns {{ group: THREE.Group, watchers: {root:THREE.Group, head:THREE.Mesh}[], dispose(): void }}
 */
export function buildEffigies(scene, world) {
  const rng = mulberry32(28);
  const tex = effigyAtlas();
  // 色紙有一點光澤：手電筒掃過會反光，才像紙而不是布
  // 底色壓暗：色紙很亮，近距離被手電筒直射會整片過曝，臉就看不見了
  const paper = new THREE.MeshStandardMaterial({ map: tex, color: 0x8a8478, roughness: 0.7, metalness: 0, side: THREE.DoubleSide });
  const group = new THREE.Group(); group.name = 'PaperEffigies'; scene.add(group);
  const watchers = [], statics = [];
  const bodies = {}, heads = {};
  const STYLE = ['girl', 'boy', 'servant', 'mourn'];

  function effigy(x, z, ry, kind, { scale = 1, pose = 'rest', y = 0.12, yawHead = 0, lean = 0, collide = true } = {}) {
    const root = new THREE.Group(); root.name = `PaperEffigy_${STYLE[kind]}`;
    root.position.set(x, y, z); root.rotation.set(0, ry, lean); root.scale.setScalar(scale);
    const bk = `${kind}:${pose}`;
    const body = new THREE.Mesh((bodies[bk] ||= effigyBody(kind, rng, pose)), paper);
    const head = new THREE.Mesh((heads[kind] ||= effigyHead(kind, rng, STYLE[kind])), paper);
    head.position.y = 1.47; head.rotation.y = yawHead; head.name = 'PaperEffigyHead';
    for (const m of [body, head]) { m.castShadow = true; m.receiveShadow = true; root.add(m); }
    root.userData.head = head; root.userData.kind = STYLE[kind];
    group.add(root);
    watchers.push({ root, head });
    if (collide && world) world.circle(x, z, 0.2 * scale, y - 0.2, y + 1.6 * scale);
    return root;
  }

  // ── 門外：一對迎賓的童男童女（左右各一），再上方是白紙燈籠 ──
  effigy(6.55, -14.1, 0.16, 1, { y: 0, scale: 0.98 });
  effigy(10.45, -14.1, -0.2, 0, { y: 0, scale: 0.94, yawHead: 0.12 });
  // ── 西牆：成排等著被領走的紙人，背貼著牆，全都面向工作桌 ──
  const west = [[-15.5, 2, 'rest'], [-16.25, 0, 'hold'], [-17.0, 1, 'rest'], [-17.75, 3, 'rest'], [-18.5, 0, 'rest'], [-19.25, 2, 'hold'], [-20.0, 1, 'rest']];
  west.forEach(([z, kind, pose], i) => effigy(5.5 + (rng() - 0.5) * 0.08, z, Math.PI / 2 + (rng() - 0.5) * 0.16, kind, { pose, scale: 0.9 + rng() * 0.14, lean: (rng() - 0.5) * 0.05, yawHead: (rng() - 0.5) * 0.2 }));
  // ── 東牆：三尊，其中靠裡面那一尊被點了睛（kind 3 的臉有瞳孔）──
  effigy(11.5, -16.2, -Math.PI / 2 + 0.1, 0, { scale: 0.9 });
  effigy(11.48, -17.0, -Math.PI / 2 - 0.06, 2, { scale: 0.97, pose: 'hold' });
  effigy(11.5, -17.8, -Math.PI / 2 + 0.04, 3, { scale: 1.04, yawHead: 0.3 });

  // ── 架上的紙頭（其中兩顆會看人）──
  const headShelf = (x, y, z, kind, ry, watch) => {
    const geo = (heads[kind] ||= effigyHead(kind, rng, STYLE[kind]));
    if (!watch) { statics.push(xf(geo.clone(), { p: [x, y + 0.13, z], r: [0, ry, 0] })); return; }
    const root = new THREE.Group(); root.name = 'PaperHeadOnShelf'; root.position.set(x, y + 0.13, z); root.rotation.y = ry;
    const head = new THREE.Mesh(geo, paper); head.castShadow = true; head.receiveShadow = true; head.name = 'PaperEffigyHead';
    root.add(head); root.userData.head = head; group.add(root); watchers.push({ root, head });
  };
  // 作坊後方兩座梯形層架：x=5.5 與 11.5、z=-21.9，層板高度 0.6 + i*0.55，板厚 0.06
  // （層架中央有一根立柱，頭擺在柱子兩側）
  headShelf(5.27, 1.18, -21.9, 0, 0.5, false); headShelf(5.74, 1.18, -21.88, 2, 0.1, false);
  headShelf(5.74, 1.73, -21.9, 1, 0.35, true); headShelf(5.27, 2.28, -21.9, 0, -0.2, false);
  headShelf(11.27, 1.18, -21.9, 3, -0.5, true); headShelf(11.74, 1.73, -21.88, 1, -0.2, false); headShelf(11.27, 1.73, -21.9, 2, -0.7, false);

  // ── 靈厝：兩層的紙糊樓房，放在後牆的矮台上 ──
  {
    const x = 9.55, z = -22.08, y = 0.12; // 貼著後牆，離垂下的紅布條有一段距離，布擺動時不會穿進來
    const face = (w, h, px, py, pz, r = UV.house) => statics.push(remap(new THREE.PlaneGeometry(w, h), r).translate(px, py, pz));
    statics.push(remap(new THREE.BoxGeometry(1.7, 0.3, 0.58).translate(x, y + 0.15, z), UV.bamboo)); // 矮台
    statics.push(remap(new THREE.BoxGeometry(1.5, 0.66, 0.46).translate(x, y + 0.63, z), UV.red));
    face(1.5, 0.66, x, y + 0.63, z + 0.232);
    statics.push(remap(new THREE.BoxGeometry(1.0, 0.42, 0.38).translate(x, y + 1.17, z), UV.red));
    face(1.0, 0.42, x, y + 1.17, z + 0.192, R(122, 768, 268, 256));
    // 兩層屋頂：四坡的紙屋頂（用四角錐台近似），簷口挑出
    for (const [w, d, yy, hh] of [[1.72, 0.6, 0.96, 0.17], [1.2, 0.5, 1.38, 0.2]]) {
      const roof = new THREE.CylinderGeometry(0.42, 0.72, hh, 4, 1).rotateY(Math.PI / 4);
      roof.scale(w / 1.02, 1, d / 1.02);
      statics.push(remap(roof, UV.roof).translate(x, y + yy + hh / 2, z));
    }
    statics.push(remap(new THREE.BoxGeometry(0.5, 0.05, 0.05).translate(x, y + 1.6, z), UV.gold));
    // 門前兩尊小小的紙僕（靜態、不看人）
    for (const sx of [-1, 1]) {
      statics.push(xf(effigyBody(2, rng, 'rest'), { p: [x + sx * 0.98, y, z + 0.12], r: [0, -sx * 0.3, 0], s: 0.36 }));
      statics.push(xf((heads[2] ||= effigyHead(2, rng, 'servant')).clone(), { p: [x + sx * 0.98, y + 1.47 * 0.36, z + 0.12], r: [0, -sx * 0.3, 0], s: 0.36 }));
    }
    if (world) world.circle(x - 0.45, z + 0.05, 0.42, 0, 2), world.circle(x + 0.45, z + 0.05, 0.42, 0, 2);
  }

  // ── 做到一半的竹骨架：一尊立在東北角，一尊倒在西牆邊，旁邊是成捆的竹篾 ──
  statics.push(xf(bambooFrame(rng), { p: [11.2, 0.12, -21.2], r: [0, -0.8, 0.04] }));
  statics.push(xf(bambooFrame(rng, 1.2), { p: [11.58, 0.12, -20.35], r: [0.05, -1.3, 0.2] }));
  for (let i = 0; i < 14; i++) statics.push(remap(cylinderBetween(V(11.72 + rng() * 0.12, 0.12, -19.9 + rng() * 0.3), V(11.86, 2.0 + rng() * 0.5, -19.7 + rng() * 0.2), 0.006, 0.006, 4), UV.bamboo));
  // 層板上的色紙捲與金紙
  for (const [sx, n] of [[5.5, 5], [11.5, 4]]) for (let i = 0; i < n; i++) {
    const roll = new THREE.CylinderGeometry(0.035, 0.035, 0.5 + rng() * 0.2, 7).rotateZ(Math.PI / 2 + (rng() - 0.5) * 0.2);
    statics.push(remap(roll, [UV.red, UV.gold, UV.cloth(1), UV.cloth(0), UV.cloth(3)][i % 5]).translate(sx + (rng() - 0.5) * 0.12, 0.665 + (i > 2 ? 0.062 : 0), -21.83 + (i % 3) * 0.035 - (i > 2 ? 0.02 : 0)));
  }
  // 門口兩盞白紙燈籠（不搖晃，併入靜態網格）
  for (const x of [6.55, 10.45]) {
    const prof = [[0.05, 0], [0.13, 0.05], [0.17, 0.2], [0.17, 0.32], [0.13, 0.47], [0.05, 0.52]];
    const pts = prof.map(([r, yy]) => new THREE.Vector2(r, yy));
    for (const start of [-Math.PI / 2, Math.PI / 2]) {
      const half = new THREE.LatheGeometry(pts, 6, start, Math.PI);
      { const pp = half.attributes.position, uv = half.attributes.uv; for (let i = 0; i < pp.count; i++) uv.setY(i, pp.getY(i) / 0.52); }
      statics.push(papery(remap(half, UV.lantern), rng, 0.004).translate(x, 2.42, -14.16));
    }
    statics.push(remap(cylinderBetween(V(x, 2.94, -14.16), V(x, 3.45, -14.3), 0.004, 0.004, 4), UV.hair));
    statics.push(remap(new THREE.CylinderGeometry(0.012, 0.002, 0.3, 5).translate(x, 2.28, -14.16), UV.red));
  }

  const still = new THREE.Mesh(merge(statics), paper);
  still.name = 'PaperGoods'; still.castShadow = true; still.receiveShadow = true;
  group.add(still);

  return {
    group, watchers,
    dispose() { paper.dispose(); tex.dispose(); atlasTex = null; },
  };
}
