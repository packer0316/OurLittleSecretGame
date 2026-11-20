import * as THREE from 'three';
import { boxGeo, xf, cylinderBetween, mulberry32 } from '../../core/utils.js';
import { grimeTexture, glowTexture } from '../../core/canvasTex.js';
import { loadHandwriting, HANDWRITING_FAMILY } from '../../core/handwriting.js';

/**
 * story（第二輪）：寺內「有人來過」的痕跡。文字在 src/story/campaign.js 的 NOTES，因果見 故事/01 第 7、9 節。
 *
 *   一樓東桌旁 林美蘭 1998 年的問者素衣，疊在木箱上（袖口紅線燒斷，沒剪）
 *   二樓北側   志豪 11/2 留下、到現在還亮著的手電筒；撬開的踢腳板與灰上的字
 *   一～三樓   柏翰 11/7 沿樓梯口柱子寫的「都出來了」，最後一根改寫成「還有一個」
 *   三樓西牆   美蘭翻過去的木牌（她打算隔年再來問一次）
 *   四樓西牆   阿哲 10/27–29 的地鋪、卡帶箱、還在錄的錄音機；郭師父的問者名冊；麥克風線一路拉到暗道
 *   四樓暗道   三雙脫在暗道邊、鞋尖朝內的鞋；郭建成 10/31 燒了二十八尊紙人的鐵桶
 *
 * 全部是靜態陳設：實心幾何併入 ctx.batch（新增 4 種材質），文字與粉筆字合成兩張圖集（2 個網格），
 * 手電筒的光束與光斑各 1 個加法混合網格，鏡片與錄音燈 2 個極小的網格。不加光源、不加會擋路的碰撞
 * （只有卡帶箱與鐵桶兩個圓形碰撞，視線檢查只看方塊，所以不會擋住調查）。不使用 ctx.rng，免得打亂後面的隨機配置。
 */

// 調查目標：storyWorld.js 會把它們併進 POSITIONS / LABELS。
export const TRACE_TARGETS = {
  robe: { p: [10.5, 1.41, -19.96], label: '木箱上摺好的素衣' },
  flashlight: { p: [6.44, 7.0, -29.04], label: '還亮著的手電筒' },
  chalk: { p: [-4.03, 13.15, -25.42], label: '柱子上的粉筆字' },
  tablet: { p: [-13.5, 12.88, -18.35], label: '翻過去的木牌' },
  camp: { p: [-8.38, 17.02, -24.35], label: '阿哲的地鋪' },
  register: { p: [-8.78, 17.25, -25.72], label: '硬殼名冊' },
  bucket: { p: [7.05, 17.42, -22.35], label: '燒黑的鐵桶' },
};

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const KAI = '"DFKai-SB","BiauKai","KaiTi","標楷體","PMingLiU",serif';
const HAND = `"${HANDWRITING_FAMILY}",${KAI}`;
const UP = new THREE.Vector3(0, 1, 0);

// ── 圖集配置（像素）：[x, y, w, h] ──
const DW = 2048, DH = 1024, PW = 1024, PH = 1024;
const D = {
  c1: [0, 0, 200, 800], c2: [200, 0, 380, 900], c3: [580, 0, 480, 1008], c4: [1060, 0, 300, 1024],
  dust: [1360, 0, 688, 440], soot: [1360, 450, 300, 300],
};
const P = {
  tablet: [0, 0, 240, 640], face0: [240, 0, 200, 260], face1: [440, 0, 200, 260], face2: [640, 0, 200, 260],
  slip: [240, 270, 300, 200], cover: [560, 270, 200, 280],
};

/** 把 0..1 的 UV 換成圖集裡的一塊 */
function remap(geo, [x, y, w, h], W, H) {
  const u0 = x / W, u1 = (x + w) / W, v1 = 1 - y / H, v0 = 1 - (y + h) / H;
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  return geo;
}
/** a→b 的實心圓柱（兩端封口） */
function rod(a, b, r1, r2 = r1, seg = 10) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const g = new THREE.CylinderGeometry(r2, r1, len, seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()));
  return g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
}
/** 先套局部擺放，再套整組的旋轉與位置 */
const local = (geo, lp = [0, 0, 0], lr = [0, 0, 0], ls = [1, 1, 1]) => xf(geo, { p: lp, r: lr, s: ls });
const group = (geo, gp, ry) => xf(geo, { p: gp, r: [0, ry, 0] });

// ───────────────────────── 圖集繪製 ─────────────────────────
function chalkColumn(g, rng, x, y, text, size, { alpha = 0.86, slant = 0, step = 1.02 } = {}) {
  let yy = y;
  for (const ch of text) {
    g.save();
    g.translate(x + (rng() - 0.5) * size * 0.1, yy + (rng() - 0.5) * size * 0.06);
    g.rotate((rng() - 0.5) * 0.09 + slant);
    g.font = `${Math.round(size * (0.92 + rng() * 0.14))}px ${HAND}`;
    // 粉筆是乾的灰白粉末，不是白漆：顏色壓到中灰，手電筒近照時也不會比柱子的高光亮
    g.fillStyle = `rgba(124,120,112,${alpha * (0.72 + rng() * 0.22)})`;
    g.fillText(ch, 0, 0);
    g.restore();
    yy += size * (step + rng() * 0.06);
  }
  return yy;
}
function chalkStroke(g, rng, pts, w, alpha = 0.8) {
  g.strokeStyle = `rgba(122,118,110,${alpha * 0.9})`; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0] + (rng() - 0.5) * w * 0.4, pts[i][1] + (rng() - 0.5) * w * 0.4);
  g.stroke();
}
/** 粉筆的質感：顆粒缺口、筆畫被木紋撐開的斷續空隙、被衣服擦過的磨損，再補一層很淡的粉塵 */
function chalkGrain(g, rng, [x, y, w, h], n) {
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < n * 1.6; i++) { g.fillStyle = `rgba(0,0,0,${0.4 + rng() * 0.6})`; g.fillRect(x + rng() * w, y + rng() * h, 1 + rng() * 3, 1 + rng() * 2); }
  // 柱子是直紋木頭：粉筆劃過去，凹下去的木紋沾不到粉，留下一道道直向的斷口
  g.lineCap = 'round';
  for (let i = 0; i < n / 9; i++) {
    const sx = x + rng() * w, sy = y + rng() * h, len = 18 + rng() * 90;
    g.strokeStyle = `rgba(0,0,0,${0.55 + rng() * 0.45})`; g.lineWidth = 1 + rng() * 2.5;
    g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + (rng() - 0.5) * 6, sy + len); g.stroke();
  }
  // 幾處被衣服或手擦掉一半
  for (let i = 0; i < 6; i++) {
    const cx = x + rng() * w, cy = y + rng() * h, r = 14 + rng() * 34;
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r); gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  g.globalCompositeOperation = 'source-over';
  for (let i = 0; i < n / 20; i++) {
    const cx = x + rng() * w, cy = y + rng() * h, r = 6 + rng() * 26;
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r); gr.addColorStop(0, 'rgba(120,116,108,0.06)'); gr.addColorStop(1, 'rgba(120,116,108,0)');
    g.fillStyle = gr; g.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  g.restore();
}

function drawDecals(c) {
  const g = c.getContext('2d'), rng = mulberry32(19981107);
  g.clearRect(0, 0, DW, DH);
  g.textAlign = 'center'; g.textBaseline = 'top';
  // c1 一樓樓梯口：工整的一行，底下一個指向樓梯的箭頭
  {
    const [x, y, , ] = D.c1;
    const end = chalkColumn(g, rng, x + 100, y + 20, '都出來了', 150);
    chalkStroke(g, rng, [[x + 150, end + 40], [x + 50, end + 40], [x + 85, end + 10]], 9);
    chalkStroke(g, rng, [[x + 50, end + 40], [x + 85, end + 70]], 9);
    chalkGrain(g, rng, D.c1, 5200);
  }
  // c2 二樓樓梯口：兩行，第二行比較急
  {
    const [x, y] = D.c2;
    chalkColumn(g, rng, x + 270, y + 30, '都出來了', 175);
    chalkColumn(g, rng, x + 105, y + 120, '都出來了', 160, { slant: -0.06, step: 1.08 });
    chalkGrain(g, rng, D.c2, 6500);
  }
  // c3 三樓：三四行擠在一起，最左邊一行問號
  {
    const [x, y] = D.c3;
    chalkColumn(g, rng, x + 410, y + 20, '都出來了', 180);
    chalkColumn(g, rng, x + 285, y + 70, '都出來了', 170, { slant: 0.05 });
    chalkColumn(g, rng, x + 165, y + 160, '都出來了', 165, { slant: -0.04, step: 1.08 });
    chalkColumn(g, rng, x + 60, y + 330, '都出來了？', 130, { slant: 0.1, alpha: 0.78 });
    chalkGrain(g, rng, D.c3, 8500);
  }
  // c4 三樓最後一根：從腰寫到柱腳；一行電話裡的問句；最後一遍劃掉，改寫「還有一個」
  {
    const [x, y] = D.c4;
    chalkColumn(g, rng, x + 228, y + 10, '都出來了都出來了', 108, { step: 1.0 });
    chalkColumn(g, rng, x + 262, y + 16, '電話裡問我裡面還有沒有人', 34, { alpha: 0.7, step: 1.05 });
    const top = y + 560;
    chalkColumn(g, rng, x + 128, top, '都出來了', 104, { slant: 0.04 });
    for (let k = 0; k < 3; k++) chalkStroke(g, rng, [[x + 80 + k * 6, top + 20 + k * 120], [x + 182, top + 160 + k * 120], [x + 76, top + 260 + k * 110]], 10, 0.72);
    chalkColumn(g, rng, x + 45, top + 120, '還有一個', 64, { alpha: 0.95, slant: -0.05, step: 1.12 });
    chalkStroke(g, rng, [[x + 52, top + 420], [x + 58, top + 440], [x + 50, top + 452]], 6, 0.9); // 粉筆斷掉的那一筆
    chalkGrain(g, rng, D.c4, 9000);
  }
  // dust 二樓佛龕前的灰：一片沒被踩過的積灰，膝蓋印與手指寫的字是把灰擦掉的地方
  {
    const [x, y, w, h] = D.dust;
    const cx = x + w / 2, cy = y + h / 2;
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.save(); g.translate(cx, cy); g.scale(1, h / w); // 橢圓形的積灰，四邊淡出，不留方框
    const gr = g.createRadialGradient(0, 0, 20, 0, 0, w * 0.49);
    gr.addColorStop(0, 'rgba(150,141,124,0.4)'); gr.addColorStop(0.62, 'rgba(140,132,116,0.24)'); gr.addColorStop(1, 'rgba(130,122,108,0)');
    g.fillStyle = gr; g.fillRect(-w / 2, -w / 2, w, w); g.restore();
    for (let i = 0; i < 2600; i++) { const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 0.45; g.fillStyle = `rgba(170,160,140,${rng() * 0.1})`; g.fillRect(cx + Math.cos(a) * r * w, cy + Math.sin(a) * r * h, 1 + rng() * 3, 1 + rng() * 3); }
    g.globalCompositeOperation = 'destination-out';
    // 兩個膝蓋印（靠佛龕那一側 = 圖的上方）
    for (const dx of [-120, 85]) { g.fillStyle = 'rgba(0,0,0,0.78)'; g.beginPath(); g.ellipse(x + w * 0.62 + dx, y + 96, 54, 74, dx * 0.0015, 0, Math.PI * 2); g.fill(); }
    // 手指寫的三行，越寫越歪
    const lines = ['鞋在老樹下', '我放回去了', '妳不要再找了'];
    g.textAlign = 'left';
    lines.forEach((t, i) => {
      let px = x + 46 + i * 22, py = y + 200 + i * 78;
      for (const ch of t) {
        g.save(); g.translate(px, py + i * (rng() - 0.3) * 10); g.rotate((rng() - 0.5) * 0.14 + i * 0.05);
        g.font = `${58 + Math.round(rng() * 8)}px ${HAND}`; g.fillStyle = 'rgba(0,0,0,0.92)'; g.fillText(ch, 0, 0); g.restore();
        px += 64 + rng() * 10; py += i * 4;
      }
    });
    g.restore();
    g.textAlign = 'center';
  }
  // soot 四樓鐵桶底下的焦痕
  {
    const [x, y, w, h] = D.soot;
    const cx = x + w / 2, cy = y + h / 2;
    for (let i = 0; i < 70; i++) {
      const px = cx + (rng() - 0.5) * w * 0.55, py = cy + (rng() - 0.5) * h * 0.55, r = 18 + rng() * 70;
      const gr = g.createRadialGradient(px, py, 0, px, py, r); gr.addColorStop(0, `rgba(10,8,6,${0.12 + rng() * 0.25})`); gr.addColorStop(1, 'rgba(10,8,6,0)');
      g.fillStyle = gr; g.fillRect(px - r, py - r, r * 2, r * 2);
    }
    const gr = g.createRadialGradient(cx, cy, 30, cx, cy, w / 2); gr.addColorStop(0, 'rgba(6,5,4,0.75)'); gr.addColorStop(0.55, 'rgba(14,11,8,0.4)'); gr.addColorStop(1, 'rgba(14,11,8,0)');
    g.fillStyle = gr; g.fillRect(x, y, w, h);
  }
}

function drawPrint(c) {
  const g = c.getContext('2d'), rng = mulberry32(19990801);
  g.clearRect(0, 0, PW, PH);
  // 木牌背面：沒上漆的木頭，原子筆直書；後兩行墨色比較新
  {
    const [x, y, w, h] = P.tablet;
    g.fillStyle = '#20180f'; g.fillRect(x, y, w, h); // 很暗：手電筒貼近照時，中等亮度的顏色會整片泛白
    for (let i = 0; i < 60; i++) { g.strokeStyle = `rgba(12,8,3,${0.08 + rng() * 0.18})`; g.lineWidth = 1 + rng() * 2; const gx = x + rng() * w; g.beginPath(); g.moveTo(gx, y); g.bezierCurveTo(gx + (rng() - 0.5) * 12, y + h * 0.3, gx + (rng() - 0.5) * 12, y + h * 0.7, gx + (rng() - 0.5) * 8, y + h); g.stroke(); }
    g.fillStyle = '#2b1d10'; g.beginPath(); g.arc(x + w / 2, y + 34, 9, 0, Math.PI * 2); g.fill(); // 穿紅線的小孔
    g.textAlign = 'center'; g.textBaseline = 'top';
    const cols = [['小雨', 'rgba(4,5,14,0.75)'], ['媽媽明年七月初一', 'rgba(4,5,14,0.75)'], ['再來問一次', 'rgba(4,5,14,0.75)'], ['這次妳叫', 'rgba(0,0,8,0.97)'], ['媽媽就應', 'rgba(0,0,8,0.97)']];
    cols.forEach(([t, col], i) => {
      let yy = y + 70 + (i > 2 ? 40 : 0);
      for (const ch of t) { g.save(); g.translate(x + w - 34 - i * 43 + (rng() - 0.5) * 4, yy); g.rotate((rng() - 0.5) * 0.08); g.font = `${36 + Math.round(rng() * 4)}px ${HAND}`; g.fillStyle = col; g.fillText(ch, 0, 0); g.restore(); yy += 41 + rng() * 6; }
    });
    const gr = g.createLinearGradient(x, y, x, y + h); gr.addColorStop(0, 'rgba(30,20,10,0.25)'); gr.addColorStop(0.15, 'rgba(30,20,10,0)'); gr.addColorStop(0.9, 'rgba(30,20,10,0)'); gr.addColorStop(1, 'rgba(30,20,10,0.35)');
    g.fillStyle = gr; g.fillRect(x, y, w, h);
  }
  // 三張紙紮人的臉：紙沒有燒掉，邊緣焦黑
  ['face0', 'face1', 'face2'].forEach((k, i) => {
    const [x, y, w, h] = P[k], cx = x + w / 2, cy = y + h / 2;
    g.save(); g.beginPath(); g.ellipse(cx, cy, w * 0.43, h * 0.45, 0, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#4c4536'; g.fillRect(x, y, w, h);
    const burn = g.createRadialGradient(cx, cy, w * 0.22, cx, cy, w * 0.5); burn.addColorStop(0, 'rgba(60,30,10,0)'); burn.addColorStop(0.7, 'rgba(90,50,20,0.35)'); burn.addColorStop(1, 'rgba(20,10,4,0.95)');
    g.fillStyle = burn; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(200,60,60,0.35)'; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(cx + s * 46, cy + 30, 22, 13, 0, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = '#1a1410'; g.lineCap = 'round';
    for (const s of [-1, 1]) {
      g.lineWidth = 6; g.beginPath(); g.moveTo(cx + s * 22, cy - 38); g.quadraticCurveTo(cx + s * 42, cy - 50 - i * 3, cx + s * 64, cy - 36); g.stroke();
      g.lineWidth = 4; g.beginPath(); g.moveTo(cx + s * 26, cy - 10); g.quadraticCurveTo(cx + s * 42, cy - 18 + i * 4, cx + s * 58, cy - 10); g.stroke();
      g.fillStyle = '#111'; g.beginPath(); g.arc(cx + s * 42, cy - 12 + i * 2, 5, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#a0201a'; g.beginPath(); g.ellipse(cx, cy + 58, 14, 7 + i * 2, 0, 0, Math.PI * 2); g.fill();
    g.restore();
    // 焦掉的缺口
    g.save(); g.globalCompositeOperation = 'destination-out';
    for (let n = 0; n < 6; n++) { const a = rng() * Math.PI * 2; g.beginPath(); g.arc(cx + Math.cos(a) * w * 0.44, cy + Math.sin(a) * h * 0.46, 8 + rng() * 16, 0, Math.PI * 2); g.fill(); }
    g.restore();
  });
  // 榮昌紙紮行的送貨單
  {
    const [x, y, w, h] = P.slip;
    g.fillStyle = '#4b473d'; g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(150,40,30,0.7)'; g.lineWidth = 2; g.strokeRect(x + 8, y + 8, w - 16, h - 16);
    g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillStyle = 'rgba(150,40,30,0.85)'; g.font = `26px ${KAI}`; g.fillText('榮昌紙紮行　送貨單', x + 22, y + 18);
    for (let i = 0; i < 4; i++) { g.fillStyle = 'rgba(150,40,30,0.35)'; g.fillRect(x + 20, y + 74 + i * 30, w - 40, 1.5); }
    g.fillStyle = 'rgba(30,30,60,0.88)'; g.font = `30px ${HAND}`;
    g.fillText('10/31　還願紙人　二十八尊', x + 24, y + 54); g.fillText('送：慈雲寺四樓', x + 24, y + 86); g.fillText('郭建成　親送', x + 120, y + 140);
    g.strokeStyle = 'rgba(170,30,20,0.6)'; g.lineWidth = 3; g.beginPath(); g.arc(x + 70, y + 150, 26, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(170,30,20,0.6)'; g.font = `22px ${KAI}`; g.textAlign = 'center'; g.fillText('榮昌', x + 70, y + 138);
  }
  // 問者名冊的封面
  {
    const [x, y, w, h] = P.cover;
    g.fillStyle = '#4e1612'; g.fillRect(x, y, w, h);
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(0,0,0,${rng() * 0.18})`; g.fillRect(x + rng() * w, y + rng() * h, 1 + rng() * 2, 1 + rng() * 2); }
    g.fillStyle = '#d6c9a8'; g.fillRect(x + w - 70, y + 24, 46, 200);
    g.fillStyle = '#1b130d'; g.textAlign = 'center'; g.textBaseline = 'top'; g.font = `34px ${KAI}`;
    [...'問者名冊'].forEach((ch, i) => g.fillText(ch, x + w - 47, y + 34 + i * 46));
  }
}

// ───────────────────────── 場景 ─────────────────────────
export function buildStoryTraces(ctx) {
  const { root, mats, batch, world } = ctx;
  const rng = mulberry32(20261113 ^ 0x5a17);
  // 顏色刻意壓暗：手電筒近距離很強，淺色的布和紙一照就會整片泛白
  const linen = new THREE.MeshStandardMaterial({ map: grimeTexture('#5f594d', { seed: 71, dark: '30,24,16', amount: 0.85 }), roughness: 1 });
  const iron = new THREE.MeshStandardMaterial({ map: grimeTexture('#2a2521', { seed: 74, dark: '6,5,4', patina: '70,40,20', amount: 1.5 }), roughness: 0.88, metalness: 0.35 });
  const plastic = new THREE.MeshStandardMaterial({ map: grimeTexture('#2f4a5e', { seed: 72, dark: '14,18,20', amount: 0.7 }), roughness: 0.62 });
  const nylon = new THREE.MeshStandardMaterial({ map: grimeTexture('#3b4130', { seed: 73, dark: '16,18,12', amount: 0.9 }), roughness: 0.8 });
  const device = new THREE.MeshStandardMaterial({ color: 0x2a2a2c, roughness: 0.48, metalness: 0.35 });
  const dark = mats.cabinet, char = mats.char || mats.cabinet, wood = mats.woodDark;
  const add = (m, g) => batch.add(m, g);

  // 兩張圖集
  const dc = document.createElement('canvas'); dc.width = DW; dc.height = DH;
  const pc = document.createElement('canvas'); pc.width = PW; pc.height = PH;
  drawDecals(dc); drawPrint(pc);
  const decalTex = new THREE.CanvasTexture(dc); decalTex.colorSpace = THREE.SRGBColorSpace; decalTex.anisotropy = 4;
  const printTex = new THREE.CanvasTexture(pc); printTex.colorSpace = THREE.SRGBColorSpace; printTex.anisotropy = 4;
  // 手寫字型是非同步載入的：先用楷體畫，字型到了再重畫一次
  loadHandwriting().then(() => { drawDecals(dc); drawPrint(pc); decalTex.needsUpdate = true; printTex.needsUpdate = true; }).catch(() => {});
  const decalGeos = [], printGeos = [];

  // ── 一樓東桌旁：林美蘭的問者素衣，疊在阿哲裝後殿東西的木箱上（離門閂 1.5 m，兩個調查點不互搶） ──
  {
    const gp = [10.5, 1.32, -19.95], ry = 0.1, at = (dx, dy, dz) => V(gp[0] + dx, gp[1] + dy, gp[2] + dz);
    add(mats.planks, boxGeo(0.5, 0.42, 0.4, gp[0], 1.11, gp[2], 0.6));
    for (const y of [0.97, 1.29]) add(wood, boxGeo(0.505, 0.035, 0.405, gp[0], y, gp[2], 0.6)); // 箱子的箍條
    add(plastic, boxGeo(0.075, 0.075, 0.002, gp[0] + 0.13, 1.17, gp[2] + 0.2015)); // 阿哲的藍色便條
    world.circle(gp[0], gp[2], 0.3, 0.9, 1.4);
    const soft = (w, h, d) => { const g = new THREE.BoxGeometry(w, h, d, 6, 1, 6); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), y = p.getY(i); if (y > 0) p.setY(i, y + 0.006 * Math.cos((x / w) * Math.PI) * Math.cos((z / d) * Math.PI)); p.setX(i, x * (y > 0 ? 0.97 : 1)); p.setZ(i, z * (y > 0 ? 0.97 : 1)); } g.computeVertexNormals(); return g; };
    add(linen, group(local(soft(0.34, 0.03, 0.28), [0, 0.015, 0]), gp, ry));
    add(linen, group(local(soft(0.31, 0.024, 0.19), [0.005, 0.042, -0.035], [0, 0.03, 0]), gp, ry));
    add(linen, group(local(new THREE.TorusGeometry(0.055, 0.011, 5, 14, Math.PI), [0, 0.056, -0.11], [-Math.PI / 2, 0, 0], [1, 1, 0.5]), gp, ry)); // 領口
    add(mats.skin, group(local(boxGeo(0.065, 0.003, 0.02), [0, 0.057, -0.125]), gp, ry)); // 領口的布條
    // 左袖垂過箱緣，袖口三圈紅線，線頭燒斷
    const sleeve = new THREE.CatmullRomCurve3([at(-0.13, 0.028, 0.06), at(-0.135, 0.026, 0.15), at(-0.138, -0.01, 0.215), at(-0.142, -0.14, 0.232), at(-0.145, -0.27, 0.228)]);
    const flat = new THREE.Shape(); flat.absellipse(0, 0, 0.012, 0.042, 0, Math.PI * 2, false, 0); // 空袖子是扁的：薄的那一面貼著箱緣
    add(linen, new THREE.ExtrudeGeometry(flat, { steps: 22, bevelEnabled: false, extrudePath: sleeve }));
    for (let k = 0; k < 3; k++) add(mats.thread, new THREE.TorusGeometry(0.043, 0.0034, 5, 18).rotateX(Math.PI / 2).scale(1, 1, 0.34).translate(...at(-0.144, -0.24 + k * 0.012, 0.229).toArray()));
    add(mats.thread, cylinderBetween(at(-0.11, -0.234, 0.244), at(-0.1, -0.31, 0.257), 0.0022, 0.0022, 4));
    add(mats.black, new THREE.SphereGeometry(0.0055, 6, 5).translate(...at(-0.1, -0.313, 0.257).toArray()));
    // 別在衣襟上的小剪刀與紙條「問完剪線」
    for (const s of [-1, 1]) add(mats.brass, group(local(boxGeo(0.085, 0.004, 0.009), [0.02, 0.058, 0.02], [0, s * 0.14, 0]), gp, ry + 0.6));
    for (const s of [-1, 1]) add(mats.brass, group(local(new THREE.TorusGeometry(0.016, 0.003, 4, 12).rotateX(Math.PI / 2), [-0.04, 0.058, 0.02 + s * 0.018]), gp, ry + 0.6));
    add(mats.skin, group(local(boxGeo(0.032, 0.002, 0.05), [0.1, 0.06, 0.07], [0, 0.3, 0]), gp, ry));
  }

  // ── 二樓北側：志豪的手電筒，照著被撬開的踢腳板 ──
  {
    const hole = V(6.85, 6.99, -29.992);
    add(mats.black, boxGeo(0.42, 0.16, 0.006, hole.x, hole.y, hole.z));
    for (const [dx, dy, w, rz] of [[-0.12, 0.085, 0.16, 0.08], [0.1, 0.083, 0.2, -0.05], [0.215, 0.0, 0.012, 0]]) add(wood, xf(boxGeo(w, 0.012, 0.01), { p: [hole.x + dx, hole.y + dy, hole.z + 0.004], r: [0, 0, rz] }));
    add(wood, xf(boxGeo(0.46, 0.018, 0.16), { p: [6.0, 6.912, -29.58], r: [0.05, 0.62, 0.03] })); // 撬下來的踢腳板
    for (const dx of [-0.17, 0.16]) add(device, xf(new THREE.CylinderGeometry(0.0025, 0.0025, 0.04, 4), { p: [6.0 + dx * Math.cos(0.62), 6.935, -29.58 - dx * Math.sin(0.62)], r: [0.2, 0, 0.15] }));
    // 手電筒：躺在地上，頭微微翹起，對著那個洞
    const head = V(6.47, 6.93, -29.13), d = new THREE.Vector3().subVectors(V(6.85, 6.989, -29.99), head).normalize();
    const at = (k) => head.clone().addScaledVector(d, k);
    add(device, rod(at(-0.2), at(-0.035), 0.019, 0.019, 12));
    add(device, rod(at(-0.035), at(0), 0.022, 0.029, 14));
    add(linen, rod(at(-0.15), at(-0.1), 0.0198, 0.0198, 12)); // 纏著寫了名字的膠帶
    add(dark, rod(at(-0.205), at(-0.198), 0.017, 0.019, 12));
    add(mats.wax, xf(boxGeo(0.012, 0.008, 0.02), { p: [at(-0.07).x, at(-0.07).y + 0.019, at(-0.07).z], r: [0, Math.atan2(d.x, d.z), 0] })); // 開關（卡在亮的位置）
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.025, 18), new THREE.MeshBasicMaterial({ color: 0xfff1d6 }));
    lens.position.copy(at(0.001)); lens.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d); root.add(lens);
    // 光束：只是加法混合的半透明錐體與落點光斑，不是真的光源
    const beamCanvas = document.createElement('canvas'); beamCanvas.width = 4; beamCanvas.height = 128;
    { const g = beamCanvas.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0.08)'); g.fillStyle = gr; g.fillRect(0, 0, 4, 128); }
    const beamTex = new THREE.CanvasTexture(beamCanvas);
    const len = 0.94, beamGeo = new THREE.CylinderGeometry(0.024, 0.19, len, 24, 1, true);
    beamGeo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.clone().negate())).translate(...at(len / 2).toArray());
    const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ map: beamTex, color: 0xffe2b8, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.name = 'ZhihaoFlashlightBeam'; beam.renderOrder = 4; root.add(beam);
    const spotGeos = [new THREE.PlaneGeometry(0.62, 0.42).translate(hole.x, hole.y, hole.z + 0.012), new THREE.PlaneGeometry(0.34, 0.8).rotateX(-Math.PI / 2).rotateY(Math.atan2(d.x, d.z)).translate(...at(0.5).setY(6.904).toArray())];
    const spot = new THREE.Mesh(mergeSimple(spotGeos), new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0xffd9a8, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    spot.name = 'ZhihaoFlashlightSpot'; spot.renderOrder = 4; root.add(spot);
    // 灰上的膝蓋印與字（字頭朝佛龕，玩家從南邊看是正的）
    decalGeos.push(remap(new THREE.PlaneGeometry(0.92, 0.59).rotateX(-Math.PI / 2).rotateY(0.06).translate(6.78, 6.903, -29.46), D.dust, DW, DH));
  }

  // ── 柏翰的粉筆字：一樓、二樓樓梯口，三樓兩根柱子 ──
  {
    const colR = (y, y0, H) => 0.34 - 0.0238 * (y - y0) / H + 0.006;
    const chalk = (x, z, y0, H, yA, yB, phi, arc, region) => {
      const rA = colR(yA, y0, H), rB = colR(yB, y0, H), L = arc / ((rA + rB) / 2);
      decalGeos.push(remap(new THREE.CylinderGeometry(rB, rA, yB - yA, 14, 1, true, phi - L / 2, L).translate(x, (yA + yB) / 2, z), region, DW, DH));
    };
    chalk(-11.5, -28.2, 0.9, 5.4, 2.08, 2.9, Math.PI / 2 - 0.35, 0.2, D.c1);
    chalk(11.5, -18.5, 6.9, 4.4, 8.05, 8.95, -0.93, 0.36, D.c2);
    chalk(4, -25, 11.9, 4.4, 12.85, 13.9, Math.PI - 0.45, 0.5, D.c3);
    chalk(-4, -25, 11.9, 4.4, 12.26, 13.86, Math.PI + 0.1, 0.46, D.c4);
    // 柱腳的粉筆盒（三年二班　吳老師）與滾開的半截粉筆
    const gp = [-4.08, 11.9, -25.66], ry = 0.35;
    add(mats.skin, group(local(boxGeo(0.11, 0.045, 0.075), [0, 0.0225, 0]), gp, ry));
    add(mats.skin, group(local(boxGeo(0.112, 0.004, 0.077), [0.012, 0.05, 0.035], [0.5, 0, 0]), gp, ry));
    for (let i = 0; i < 6; i++) add(linen, group(local(new THREE.CylinderGeometry(0.0055, 0.0055, 0.08, 6).rotateZ(Math.PI / 2), [0, 0.04, -0.028 + i * 0.011]), gp, ry));
    add(linen, new THREE.CylinderGeometry(0.0055, 0.0055, 0.035, 6).rotateZ(Math.PI / 2).rotateY(1.1).translate(-3.72, 11.9055, -25.98));
  }

  // ── 三樓西牆：翻過去的木牌，頂端穿著一截紅線 ──
  {
    const gp = [-13.6, 12.7, -18.35], lean = 0.2;
    const put = (geo) => xf(xf(geo, { r: [0, 0, lean] }), { p: gp });
    add(dark, put(boxGeo(0.022, 0.32, 0.12, 0, 0.18, 0, 0.6)));
    add(dark, put(boxGeo(0.06, 0.035, 0.15, 0, 0.0175, 0, 0.6)));
    printGeos.push(remap(put(new THREE.PlaneGeometry(0.116, 0.31).rotateY(Math.PI / 2).translate(0.0135, 0.18, 0)), P.tablet, PW, PH));
    add(mats.thread, put(new THREE.TorusGeometry(0.013, 0.0024, 4, 12).rotateY(Math.PI / 2).translate(0.002, 0.322, 0)));
    const tip = put(new THREE.BufferGeometry().setFromPoints([V(0.014, 0.31, 0.004)])).attributes.position;
    add(mats.thread, cylinderBetween(V(tip.getX(0), tip.getY(0), tip.getZ(0)), V(-13.52, 12.704, -18.31), 0.002, 0.002, 4));
  }

  // ── 四樓西牆：阿哲的地鋪 ──
  {
    add(plastic, boxGeo(0.6, 0.012, 1.9, -8.95, 16.906, -23.2, 1));
    // 睡袋：鋪棉的分格（每 18 公分一道壓線）、被人睡過的凹陷，上半段拉鍊拉開、掀到一邊
    const bag = new THREE.CapsuleGeometry(0.26, 1.15, 6, 18, 24).rotateX(Math.PI / 2).scale(1, 0.25, 1);
    {
      const p = bag.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const quilt = 1 - 0.18 * Math.pow(Math.abs(Math.cos(z / 0.18 * Math.PI)), 6);
        const dent = y > 0 ? 1 - 0.35 * Math.exp(-((z + 0.15) ** 2) / 0.12) * Math.exp(-(x * x) / 0.02) : 1;
        const lump = 1 + 0.06 * Math.sin(x * 23 + z * 7) * Math.sin(z * 11);
        p.setY(i, y * quilt * dent * lump);
        if (y > 0 && z < -0.25) p.setY(i, p.getY(i) * 0.55); // 上半段被掀開，只剩下層
      }
      bag.computeVertexNormals();
    }
    add(nylon, bag.translate(-8.98, 16.978, -23.02));
    const flap = new THREE.BoxGeometry(0.27, 0.016, 0.72, 8, 1, 10);
    {
      const p = flap.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, p.getY(i) + 0.05 * Math.pow((x + 0.135) / 0.27, 2) + 0.012 * Math.sin(z * 14)); }
      flap.computeVertexNormals();
    }
    add(nylon, xf(flap, { p: [-8.58, 16.93, -23.55], r: [0, 0.05, -0.08] })); // 掀開的半邊，邊緣捲起
    add(device, xf(boxGeo(0.006, 0.006, 0.7), { p: [-8.72, 16.996, -23.55], r: [0, 0.03, 0] })); // 拉鍊
    const pillow = new THREE.CapsuleGeometry(0.075, 0.3, 4, 12, 6).rotateZ(Math.PI / 2).scale(1, 0.62, 1.15);
    { const p = pillow.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, p.getZ(i) + 0.02 * Math.sin(x * 18)); p.setY(i, p.getY(i) * (1 + 0.12 * Math.sin(x * 31))); } pillow.computeVertexNormals(); }
    add(linen, pillow.translate(-8.98, 16.96, -24.12)); // 捲起來的外套當枕頭
    // 錄音機：錄音鍵壓著，紅燈亮著
    {
      const gp = [-8.38, 16.9, -24.35], ry = -0.35;
      add(device, group(local(boxGeo(0.27, 0.085, 0.13), [0, 0.0425, 0]), gp, ry));
      add(mats.black, group(local(new THREE.CircleGeometry(0.038, 16), [-0.065, 0.042, 0.0655]), gp, ry));
      add(mats.black, group(local(boxGeo(0.09, 0.038, 0.003), [0.06, 0.047, 0.065]), gp, ry));
      for (let i = 0; i < 6; i++) add(i === 0 ? mats.wax : linen, group(local(boxGeo(0.018, i === 0 ? 0.006 : 0.012, 0.026), [0.02 + i * 0.021, 0.088, -0.035]), gp, ry));
      add(device, group(local(new THREE.TorusGeometry(0.1, 0.0075, 6, 16, Math.PI), [0, 0.085, -0.02], [0, 0, 0], [1, 0.35, 1]), gp, ry));
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.006, 0.004), new THREE.MeshBasicMaterial({ color: 0xff2a14 }));
      led.position.set(...gp); led.rotation.y = ry; led.translateX(0.112); led.translateY(0.072); led.translateZ(0.066);
      led.name = 'AzheRecorderLed'; root.add(led); // Story.syncTraces()：點名放完以後熄掉
    }
    // 麥克風線：從錄音機繞過神壇，一路拉到暗道，從蓋板的縫塞下去
    const cable = new THREE.CatmullRomCurve3([V(-8.52, 16.93, -24.3), V(-8.3, 16.905, -23.75), V(-7.7, 16.905, -22.5), V(-6.3, 16.905, -20.65), V(-3.4, 16.905, -20.02), V(0.2, 16.905, -19.92), V(2.7, 16.905, -20.18), V(3.95, 16.905, -20.85), V(4.42, 16.91, -21.55), V(4.5, 16.93, -21.72)]);
    add(device, new THREE.TubeGeometry(cable, 120, 0.0045, 4, false));
    // 三箱卡帶（每卷貼著紙膠帶），疊起來的那箱上壓著郭師父的問者名冊
    const crate = (gp, ry, fill) => {
      const W = 0.42, H = 0.27, Dp = 0.3, t = 0.012;
      add(plastic, group(local(boxGeo(W, t, Dp), [0, t / 2, 0]), gp, ry));
      for (const s of [-1, 1]) { add(plastic, group(local(boxGeo(W, H, t), [0, H / 2, s * (Dp - t) / 2]), gp, ry)); add(plastic, group(local(boxGeo(t, H, Dp), [s * (W - t) / 2, H / 2, 0]), gp, ry)); }
      for (const s of [-1, 1]) add(plastic, group(local(boxGeo(W + 0.01, 0.02, 0.025), [0, H - 0.01, s * (Dp / 2 - 0.006)]), gp, ry));
      for (let row = 0; row < 2; row++) for (let i = 0; i < fill; i++) {
        const lx = -W / 2 + 0.03 + i * 0.019, lz = row ? 0.065 : -0.065, tilt = (rng() - 0.5) * 0.12;
        add(device, group(local(boxGeo(0.017, 0.07, 0.11), [lx, t + 0.035, lz], [0, 0, tilt]), gp, ry));
        add(linen, group(local(boxGeo(0.0175, 0.012, 0.08), [lx, t + 0.064, lz], [0, 0, tilt]), gp, ry));
      }
    };
    crate([-9.28, 16.9, -25.75], 0.04, 19); crate([-8.78, 16.9, -25.72], -0.07, 15); crate([-9.26, 17.182, -25.7], 0.18, 11);
    world.circle(-9.03, -25.73, 0.42, 16.9, 17.6);
    {
      const gp = [-8.78, 17.17, -25.72], ry = 0.25;
      add(mats.clothDark, group(local(boxGeo(0.21, 0.006, 0.285), [0, 0.003, 0]), gp, ry));
      add(linen, group(local(boxGeo(0.2, 0.026, 0.275), [0.003, 0.019, 0]), gp, ry));
      printGeos.push(remap(group(local(new THREE.PlaneGeometry(0.21, 0.285).rotateX(-Math.PI / 2), [0, 0.0355, 0]), gp, ry), P.cover, PW, PH));
      for (let i = 0; i < 4; i++) add(plastic, group(local(boxGeo(0.045, 0.002, 0.03), [0.115, 0.012 + i * 0.006, -0.1 + i * 0.06], [0, (rng() - 0.5) * 0.3, 0]), gp, ry)); // 夾在裡面的藍色便條
    }
    // 營燈（熄的）、泡麵碗、保溫瓶
    {
      const x = -9.3, z = -21.95, y = 16.9;
      add(device, new THREE.CylinderGeometry(0.065, 0.068, 0.035, 14).translate(x, y + 0.0175, z));
      add(linen, new THREE.CylinderGeometry(0.05, 0.05, 0.13, 14).translate(x, y + 0.1, z));
      add(device, new THREE.CylinderGeometry(0.058, 0.062, 0.03, 14).translate(x, y + 0.18, z));
      add(device, new THREE.TorusGeometry(0.045, 0.004, 4, 12, Math.PI).translate(x, y + 0.195, z));
      add(linen, new THREE.LatheGeometry([[0, 0], [0.038, 0], [0.048, 0.1], [0.05, 0.102], [0.046, 0.102], [0.036, 0.004], [0, 0.004]].map(([r, h]) => new THREE.Vector2(r, h)), 14).translate(-8.42, y, -22.3));
      add(linen, xf(new THREE.CircleGeometry(0.05, 14), { p: [-8.38, y + 0.118, -22.32], r: [-Math.PI / 2 + 0.9, 0.3, 0] }));
      for (const dz of [-0.01, 0.01]) add(wood, xf(boxGeo(0.2, 0.006, 0.006), { p: [-8.43, y + 0.104, -22.3 + dz], r: [0, 0.4 + dz * 5, 0.05] }));
      add(device, new THREE.CylinderGeometry(0.037, 0.037, 0.27, 14).translate(-8.28, y + 0.135, -21.98));
      add(dark, new THREE.CylinderGeometry(0.039, 0.039, 0.05, 14).translate(-8.28, y + 0.295, -21.98));
    }
  }

  // ── 四樓暗道邊：三雙鞋，鞋尖朝著暗道（像進屋前脫在門口） ──
  {
    const shoe = (x, z, ry, kind) => {
      const gp = [x, 16.9, z];
      if (kind === 'boot') { // 阿哲：沾泥的工作靴
        add(device, group(local(new THREE.CapsuleGeometry(0.05, 0.19, 4, 12).rotateX(Math.PI / 2), [0, 0.016, -0.005], [0, 0, 0], [1.04, 0.32, 1]), gp, ry)); // 鞋底
        add(dark, group(local(new THREE.CylinderGeometry(0.046, 0.052, 0.16, 14), [0, 0.11, 0.055], [-0.06, 0, 0], [1, 1, 1.22]), gp, ry)); // 靴筒
        add(dark, group(local(new THREE.TorusGeometry(0.047, 0.008, 5, 14).rotateX(Math.PI / 2), [0, 0.19, 0.06], [-0.06, 0, 0], [1, 1, 1.22]), gp, ry)); // 靴口
        add(dark, group(local(new THREE.SphereGeometry(1, 14, 10), [0, 0.05, -0.055], [0, 0, 0], [0.052, 0.05, 0.1]), gp, ry)); // 鞋頭
        for (let i = 0; i < 4; i++) add(linen, group(local(boxGeo(0.06, 0.004, 0.006), [0, 0.085 + i * 0.026, 0.0 - i * 0.002], [0.5, 0, 0]), gp, ry));
        add(mats.rock, group(local(new THREE.SphereGeometry(1, 10, 6), [0.01, 0.03, -0.09], [0, 0, 0], [0.05, 0.02, 0.05]), gp, ry)); // 乾掉的泥
      } else if (kind === 'slipper') { // 志豪：藍白拖
        add(linen, group(local(new THREE.CapsuleGeometry(0.045, 0.16, 4, 10).rotateX(Math.PI / 2), [0, 0.01, 0], [0, 0, 0], [1, 0.22, 1]), gp, ry));
        add(plastic, group(local(new THREE.TorusGeometry(0.044, 0.012, 6, 12, Math.PI), [0, 0.016, -0.04], [0, 0, 0], [1, 0.75, 1.5]), gp, ry));
      } else { // 柏翰：後跟被踩扁的球鞋（穿上鞋就出門）
        add(linen, group(local(new THREE.CapsuleGeometry(0.048, 0.17, 4, 10).rotateX(Math.PI / 2), [0, 0.014, 0], [0, 0, 0], [1, 0.3, 1]), gp, ry));
        add(linen, group(local(new THREE.SphereGeometry(1, 14, 10), [0, 0.045, -0.035], [0, 0, 0], [0.046, 0.045, 0.1]), gp, ry));
        add(linen, group(local(boxGeo(0.09, 0.016, 0.08), [0, 0.035, 0.08], [-0.15, 0, 0]), gp, ry));
        for (let i = 0; i < 3; i++) add(nylon, group(local(boxGeo(0.06, 0.004, 0.006), [0, 0.085 - i * 0.008, -0.035 - i * 0.02], [0.3, 0, 0]), gp, ry));
      }
    };
    shoe(4.66, -20.76, 0.05, 'boot'); shoe(4.87, -20.79, -0.04, 'boot');
    shoe(5.22, -20.8, 0.12, 'slipper'); shoe(5.42, -20.72, -0.38, 'slipper');
    shoe(5.79, -20.78, 0.02, 'sneaker'); shoe(5.99, -20.76, -0.07, 'sneaker');
  }

  // ── 四樓暗道東側：郭建成燒了二十八尊紙人的鐵桶 ──
  {
    const x = 7.05, z = -22.35, y = 16.9;
    const prof = [[0, 0], [0.2, 0], [0.214, 0.02], [0.238, 0.4], [0.248, 0.42], [0.234, 0.42], [0.224, 0.4], [0.2, 0.03], [0, 0.03]].map(([r, h]) => new THREE.Vector2(r, h));
    add(iron, new THREE.LatheGeometry(prof, 22).translate(x, y, z));
    for (const h of [0.12, 0.3]) add(iron, new THREE.TorusGeometry(0.224 + h * 0.06, 0.006, 4, 22).rotateX(Math.PI / 2).translate(x, y + h, z)); // 桶箍
    add(char, new THREE.CircleGeometry(0.212, 20).rotateX(-Math.PI / 2).translate(x, y + 0.29, z)); // 灰
    for (let i = 0; i < 18; i++) {
      const a = rng() * Math.PI * 2, r0 = rng() * 0.14, a2 = a + (rng() - 0.5) * 0.8;
      const from = V(x + Math.cos(a) * r0, y + 0.27, z + Math.sin(a) * r0), mid = V(x + Math.cos(a2) * (0.12 + rng() * 0.1), y + 0.42 + rng() * 0.12, z + Math.sin(a2) * (0.12 + rng() * 0.1));
      add(char, cylinderBetween(from, mid, 0.0055, 0.0045, 4));
      if (rng() < 0.5) add(char, cylinderBetween(mid, mid.clone().add(V((rng() - 0.5) * 0.12, 0.04 + rng() * 0.08, (rng() - 0.5) * 0.12)), 0.0045, 0.004, 4));
    }
    // 三張沒燒掉的紙臉，全都朝著暗道（西邊）
    [[0.03, 0.49, -0.08, 0.15, 'face0'], [-0.05, 0.45, 0.07, -0.25, 'face1'], [0.09, 0.4, 0.02, 0.4, 'face2']].forEach(([dx, h, dz, tilt, k]) => {
      printGeos.push(remap(xf(new THREE.PlaneGeometry(0.1, 0.13), { p: [x + dx - 0.06, y + h, z + dz], r: [tilt * 0.4, -Math.PI / 2 + tilt, tilt * 0.5] }), P[k], PW, PH));
    });
    printGeos.push(remap(xf(new THREE.PlaneGeometry(0.15, 0.1).rotateX(-Math.PI / 2), { p: [x + 0.2, y + 0.0035, z + 0.24], r: [0, 0.45, 0] }), P.slip, PW, PH));
    decalGeos.push(remap(new THREE.PlaneGeometry(0.95, 0.95).rotateX(-Math.PI / 2).translate(x, y + 0.002, z), D.soot, DW, DH));
    world.circle(x, z, 0.27, y, y + 0.5);
    // 棉紗手套：拇指被撐得很長
    const gp = [6.66, y, -21.98], ry = 0.5;
    add(linen, group(local(new THREE.SphereGeometry(1, 12, 8), [0, 0.012, 0], [0, 0, 0], [0.045, 0.013, 0.058]), gp, ry));
    for (let i = 0; i < 4; i++) add(linen, group(local(new THREE.CapsuleGeometry(0.0095, 0.045, 3, 6).rotateX(Math.PI / 2), [-0.027 + i * 0.018, 0.01, -0.082 - (i === 1 || i === 2 ? 0.008 : 0)]), gp, ry));
    add(linen, group(local(new THREE.CapsuleGeometry(0.009, 0.17, 3, 6).rotateZ(Math.PI / 2), [-0.13, 0.009, 0.012], [0, 0.35, 0]), gp, ry));
  }

  // 兩張圖集各合成一個網格
  const decal = new THREE.Mesh(mergeSimple(decalGeos), new THREE.MeshStandardMaterial({ map: decalTex, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  decal.name = 'StoryTraceWriting'; decal.receiveShadow = true; decal.renderOrder = 2; root.add(decal);
  const print = new THREE.Mesh(mergeSimple(printGeos), new THREE.MeshStandardMaterial({ map: printTex, alphaTest: 0.5, roughness: 0.92, side: THREE.DoubleSide }));
  print.name = 'StoryTracePrint'; print.castShadow = true; print.receiveShadow = true; root.add(print);
  return { decal, print };
}

/** 只保留 position / normal / uv 再合併（CylinderGeometry 有 index，Plane 也有） */
function mergeSimple(geos) {
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0; for (const g of parts) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  for (const g of parts) {
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
}
