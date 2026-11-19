import * as THREE from 'three';
import { mulberry32 } from './utils.js';

/** 以 Canvas 2D 繪製的程序化貼圖（匾額、符咒、牆上血字、墓碑刻字…） */

const KAI = '"DFKai-SB","BiauKai","KaiTi","標楷體","PMingLiU",serif';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function toTex(c, { srgb = true, repeat = false } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function speckle(g, w, h, rng, n, color, aMin, aMax, rMin, rMax) {
  for (let i = 0; i < n; i++) {
    const x = rng() * w, y = rng() * h, r = rMin + rng() * (rMax - rMin);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    const a = aMin + rng() * (aMax - aMin);
    grad.addColorStop(0, color.replace('A', a.toFixed(3)));
    grad.addColorStop(1, color.replace('A', '0'));
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

/** Transparent markings sit on the PBR stone, including five small handprints. */
export function witnessWallTexture() {
  const [c,g]=canvas(2048,1024),rng=mulberry32(19980818);
  g.textAlign='center';g.font=`48px ${KAI}`;g.fillStyle='#a58e70';
  g.fillText('借亡者之聲　以慰生人',1024,108);
  const names=['林進財','陳金水','郭永順','吳德發','許文清','張榮生','周秀蘭','陳美珠','林春生','吳月娥','許福來','張瑞雲','郭明德','陳木生','周文雄','林美蘭'];
  g.font=`36px ${KAI}`;
  names.forEach((name,i)=>{const x=230+(i%8)*226,y=225+Math.floor(i/8)*145;g.save();g.translate(x,y);g.rotate((rng()-.5)*.04);g.fillStyle='#988872';g.fillText(name,0,0);g.fillStyle='#681e17';g.beginPath();g.ellipse(0,38,16,24,-.35,0,Math.PI*2);g.fill();g.restore();});
  // 補刻的小字（刻得比較新、比較淺）：規矩，以及林美蘭名字旁的那一行
  g.font=`24px ${KAI}`;g.fillStyle='#b8a688';g.fillText('內有應者　不得開門　此後誰說出她的名字　誰就是替它應聲',1024,156);
  g.font=`20px ${KAI}`;g.fillText('隔年七月初一',1812,446);g.fillText('往後殿　未歸',1812,472);
  g.font=`48px ${KAI}`;g.fillStyle='#ae9776';g.fillText('今封後殿　永不開言',1024,555);
  for(let i=0;i<5;i++){
    g.save();g.translate(635+i*195,725+(rng()-.5)*25);g.rotate((rng()-.5)*.18);g.fillStyle='#752820';
    g.beginPath();g.ellipse(0,6,30,38,0,0,Math.PI*2);g.fill();
    for(let f=0;f<4;f++){g.save();g.translate(-24+f*16,-26);g.rotate((f-1.4)*.09);g.beginPath();g.ellipse(0,-18-(f===1?10:0),7,31+(f===1?8:0),0,0,Math.PI*2);g.fill();g.restore();}
    g.beginPath();g.ellipse(-36,-2,10,27,-.65,0,Math.PI*2);g.fill();g.restore();
  }
  g.font=`70px ${KAI}`;g.fillStyle='#a08063';g.fillText('說　好　不　說',1024,925);
  g.globalCompositeOperation='destination-out';
  for(let i=0;i<8500;i++){g.fillStyle=`rgba(0,0,0,${rng()*.7})`;g.fillRect(rng()*2048,rng()*1024,1+rng()*4,1+rng()*6);}
  return toTex(c);
}

export function sootTexture(seed=91) {
  const [c,g]=canvas(512,512),rng=mulberry32(seed);
  for(let i=0;i<100;i++){
    const x=130+rng()*250,y=70+rng()*380,r=12+rng()*75;
    const grad=g.createRadialGradient(x,y,0,x,y,r);
    grad.addColorStop(0,`rgba(11,8,6,${.12+rng()*.3})`);grad.addColorStop(1,'rgba(11,8,6,0)');g.fillStyle=grad;g.fillRect(x-r,y-r,2*r,2*r);
  }
  return toTex(c);
}

/** 手電筒光斑（中心亮、邊緣有環狀光暈） */
export function flashlightCookie() {
  const S = 512, [c, g] = canvas(S, S);
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, '#fff');
  grad.addColorStop(0.18, '#f4f4f4');
  grad.addColorStop(0.42, '#a8a8a8');
  grad.addColorStop(0.62, '#6c6c6c');
  grad.addColorStop(0.72, '#8a8a8a');
  grad.addColorStop(0.8, '#4a4a4a');
  grad.addColorStop(0.93, '#1c1c1c');
  grad.addColorStop(1, '#000');
  g.fillStyle = grad; g.fillRect(0, 0, S, S);
  const rng = mulberry32(7);
  g.globalCompositeOperation = 'multiply';
  speckle(g, S, S, rng, 26, 'rgba(0,0,0,A)', 0.08, 0.3, 6, 40);
  g.globalCompositeOperation = 'source-over';
  const t = toTex(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

/** 匾額：深色木板 + 金字 */
export function plaqueTexture(text, { w = 1024, h = 400, vertical = false, seed = 1 } = {}) {
  const [c, g] = canvas(w, h);
  const rng = mulberry32(seed);
  const bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#1d1009'); bg.addColorStop(1, '#0d0704');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#7d5f22'; g.lineWidth = Math.min(w, h) * 0.035;
  g.strokeRect(g.lineWidth, g.lineWidth, w - g.lineWidth * 2, h - g.lineWidth * 2);
  g.strokeStyle = '#5a4317'; g.lineWidth = 3;
  const m = Math.min(w, h) * 0.085;
  g.strokeRect(m, m, w - m * 2, h - m * 2);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const chars = [...text];
  const size = vertical ? Math.min(w * 0.62, (h * 0.8) / chars.length) : Math.min(h * 0.62, (w * 0.8) / chars.length);
  g.font = `bold ${size}px ${KAI}`;
  chars.forEach((ch, i) => {
    const x = vertical ? w / 2 : w / 2 + (i - (chars.length - 1) / 2) * size * 1.12;
    const y = vertical ? h / 2 + (i - (chars.length - 1) / 2) * size * 1.08 : h / 2;
    g.fillStyle = 'rgba(0,0,0,0.7)'; g.fillText(ch, x + 4, y + 5);
    g.fillStyle = '#b08a34'; g.fillText(ch, x, y);
  });
  // 風化剝落
  speckle(g, w, h, rng, 220, 'rgba(8,5,3,A)', 0.2, 0.7, 4, 38);
  g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1.5;
  for (let i = 0; i < 26; i++) { const y = rng() * h; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + (rng() - 0.5) * 30); g.stroke(); }
  return toTex(c);
}

/** 符咒：黃紙紅字 */
export function talismanTexture(seed = 1) {
  const W = 128, H = 400, [c, g] = canvas(W, H);
  const rng = mulberry32(seed * 977 + 3);
  g.fillStyle = '#b3963f'; g.fillRect(0, 0, W, H);
  speckle(g, W, H, rng, 60, 'rgba(70,45,10,A)', 0.1, 0.35, 8, 46);
  speckle(g, W, H, rng, 20, 'rgba(230,210,150,A)', 0.05, 0.2, 8, 30);
  const red = rng() < 0.2 ? '#3a0808' : '#8f1410';
  g.fillStyle = red; g.strokeStyle = red;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `bold 44px ${KAI}`;
  g.fillText('勅', W / 2, 34); g.fillText('令', W / 2, 80);
  const bodies = ['鎮邪封靈', '閉目勿視', '太上敕封', '萬鬼伏藏', '神目永閉', '陰靈退散'];
  const body = [...bodies[Math.floor(rng() * bodies.length)]];
  g.font = `bold 40px ${KAI}`;
  body.forEach((ch, i) => g.fillText(ch, W / 2 + (rng() - 0.5) * 6, 132 + i * 46));
  // 符腳
  g.lineWidth = 4; g.lineCap = 'round';
  g.beginPath();
  let x = W / 2, y = 312; g.moveTo(x, y);
  for (let i = 0; i < 9; i++) { x = W / 2 + (rng() - 0.5) * 80; y += 8 + rng() * 6; g.lineTo(x, y); }
  g.stroke();
  g.lineWidth = 3; g.strokeRect(10, 6, W - 20, H - 14);
  // 破損的下緣
  g.globalCompositeOperation = 'destination-out';
  g.beginPath(); g.moveTo(0, H);
  for (let i = 0; i <= 8; i++) g.lineTo((W * i) / 8, H - rng() * 22);
  g.lineTo(W, H); g.closePath(); g.fill();
  g.globalCompositeOperation = 'source-over';
  return toTex(c);
}

/** 牆上的血字（透明底） */
export function wallWritingTexture(lines, { w = 1024, h = 512, seed = 5, color = '90,8,6', size = 150 } = {}) {
  const [c, g] = canvas(w, h);
  const rng = mulberry32(seed);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach((line, li) => {
    const chars = [...line];
    const y0 = h * ((li + 0.5) / lines.length) - 20;
    chars.forEach((ch, i) => {
      const x = w / 2 + (i - (chars.length - 1) / 2) * size * 1.05 + (rng() - 0.5) * 14;
      const y = y0 + (rng() - 0.5) * 26;
      g.save();
      g.translate(x, y); g.rotate((rng() - 0.5) * 0.22);
      g.font = `bold ${size * (0.9 + rng() * 0.2)}px ${KAI}`;
      g.fillStyle = `rgba(${color},0.35)`; g.fillText(ch, 3, 3);
      g.fillStyle = `rgba(${color},0.9)`; g.fillText(ch, 0, 0);
      g.restore();
      // 滴流
      const drips = 1 + Math.floor(rng() * 3);
      for (let d = 0; d < drips; d++) {
        const dx = x + (rng() - 0.5) * size * 0.6, len = 20 + rng() * 110;
        const grad = g.createLinearGradient(0, y + size * 0.3, 0, y + size * 0.3 + len);
        grad.addColorStop(0, `rgba(${color},0.8)`); grad.addColorStop(1, `rgba(${color},0)`);
        g.fillStyle = grad; g.fillRect(dx, y + size * 0.3, 3 + rng() * 3, len);
      }
    });
  });
  return toTex(c);
}

/** 墓碑刻字（透明底，直書） */
export function tombTextTexture(seed = 1) {
  const W = 128, H = 256, [c, g] = canvas(W, H);
  const rng = mulberry32(seed * 131 + 17);
  const sur = '陳林黃張李王吳劉蔡楊許鄭謝洪郭';
  const pick = (s) => s[Math.floor(rng() * s.length)];
  let text;
  const r = rng();
  if (r < 0.2) text = '無名氏之墓';
  else if (r < 0.3) text = '萬善同歸';
  else if (r < 0.65) text = `顯考${pick(sur)}公之墓`;
  else text = `顯妣${pick(sur)}媽之墓`;
  const chars = [...text];
  const size = Math.min(46, (H * 0.86) / chars.length);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `bold ${size}px ${KAI}`;
  const col = rng() < 0.5 ? '110,22,16' : '12,10,8';
  chars.forEach((ch, i) => {
    const y = H / 2 + (i - (chars.length - 1) / 2) * size * 1.06;
    g.fillStyle = `rgba(${col},${0.45 + rng() * 0.4})`;
    g.fillText(ch, W / 2, y);
  });
  // 風化
  g.globalCompositeOperation = 'destination-out';
  speckle(g, W, H, rng, 50, 'rgba(0,0,0,A)', 0.2, 0.8, 3, 16);
  g.globalCompositeOperation = 'source-over';
  return toTex(c);
}

/** 冥紙 */
export function paperMoneyTexture() {
  const W = 96, H = 72, [c, g] = canvas(W, H);
  const rng = mulberry32(42);
  g.fillStyle = '#a98d52'; g.fillRect(0, 0, W, H);
  speckle(g, W, H, rng, 30, 'rgba(60,40,10,A)', 0.1, 0.3, 4, 20);
  g.fillStyle = '#b89632'; g.fillRect(26, 16, 44, 40);
  g.fillStyle = 'rgba(255,235,160,0.35)'; g.fillRect(30, 20, 14, 30);
  g.strokeStyle = '#7a1612'; g.lineWidth = 2; g.strokeRect(4, 4, W - 8, H - 8);
  return toTex(c);
}

/** 斑駁污漬貼圖（鎏金佛像、銅器等） */
export function grimeTexture(base, { seed = 1, size = 512, dark = '20,14,6', patina = null, amount = 1 } = {}) {
  const [c, g] = canvas(size, size);
  const rng = mulberry32(seed);
  g.fillStyle = base; g.fillRect(0, 0, size, size);
  speckle(g, size, size, rng, Math.floor(260 * amount), `rgba(${dark},A)`, 0.06, 0.3, 10, 70);
  speckle(g, size, size, rng, Math.floor(160 * amount), `rgba(${dark},A)`, 0.05, 0.22, 4, 16);
  if (patina) speckle(g, size, size, rng, Math.floor(120 * amount), `rgba(${patina},A)`, 0.08, 0.3, 6, 40);
  // 垂流污痕
  for (let i = 0; i < 70 * amount; i++) {
    const x = rng() * size, y = rng() * size, len = 30 + rng() * 160;
    const grad = g.createLinearGradient(0, y, 0, y + len);
    grad.addColorStop(0, `rgba(${dark},${0.12 + rng() * 0.25})`); grad.addColorStop(1, `rgba(${dark},0)`);
    g.fillStyle = grad; g.fillRect(x, y, 2 + rng() * 6, len);
  }
  speckle(g, size, size, rng, 40, 'rgba(255,240,200,A)', 0.03, 0.1, 8, 40);
  return toTex(c, { repeat: true });
}

/** 柔霧（地面霧氣用） */
export function smokeTexture(seed = 3) {
  const S = 256, [c, g] = canvas(S, S);
  const rng = mulberry32(seed);
  for (let i = 0; i < 22; i++) {
    const a = rng() * Math.PI * 2, d = rng() * S * 0.22;
    const x = S / 2 + Math.cos(a) * d, y = S / 2 + Math.sin(a) * d * 0.6, r = S * (0.14 + rng() * 0.2);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.16)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, S, S);
  }
  return toTex(c);
}

/** 燭火 */
export function flameTexture() {
  const W = 64, H = 128, [c, g] = canvas(W, H);
  g.translate(W / 2, H * 0.62); g.scale(1, 2.1);
  let grad = g.createRadialGradient(0, 0, 0, 0, 0, 28);
  grad.addColorStop(0, 'rgba(255,170,60,0.9)'); grad.addColorStop(0.6, 'rgba(255,90,10,0.35)'); grad.addColorStop(1, 'rgba(255,60,0,0)');
  g.fillStyle = grad; g.fillRect(-32, -32, 64, 64);
  g.translate(0, 6);
  grad = g.createRadialGradient(0, 0, 0, 0, 0, 13);
  grad.addColorStop(0, 'rgba(255,255,235,1)'); grad.addColorStop(0.7, 'rgba(255,220,120,0.7)'); grad.addColorStop(1, 'rgba(255,180,60,0)');
  g.fillStyle = grad; g.fillRect(-32, -32, 64, 64);
  return toTex(c);
}

/** 光暈（鬼火、燈） */
export function glowTexture() {
  const S = 128, [c, g] = canvas(S, S);
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.2, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.14)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, S, S);
  return toTex(c);
}

/** 牌位：數種樣式排成一張圖集（橫向 n 格） */
export function tabletAtlas(n = 8) {
  const CW = 64, H = 176, [c, g] = canvas(CW * n, H);
  const rng = mulberry32(99);
  const sur = '陳林黃張李王吳劉蔡楊許鄭謝洪郭';
  for (let k = 0; k < n; k++) {
    const x0 = k * CW;
    g.fillStyle = k % 3 === 0 ? '#2a0f0b' : '#1a0c08'; g.fillRect(x0, 0, CW, H);
    g.strokeStyle = '#6e5320'; g.lineWidth = 3; g.strokeRect(x0 + 5, 5, CW - 10, H - 10);
    const text = k % 4 === 0 ? '歷代祖先神位' : `${sur[Math.floor(rng() * sur.length)]}氏之神位`;
    const chars = [...text];
    const size = Math.min(26, (H - 30) / chars.length);
    g.font = `bold ${size}px ${KAI}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#a07f30';
    chars.forEach((ch, i) => g.fillText(ch, x0 + CW / 2, H / 2 + (i - (chars.length - 1) / 2) * size * 1.05));
    g.save(); g.beginPath(); g.rect(x0, 0, CW, H); g.clip();
    for (let i = 0; i < 30; i++) {
      const x = x0 + rng() * CW, y = rng() * H, r = 3 + rng() * 14;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `rgba(90,85,75,${0.1 + rng() * 0.25})`); grad.addColorStop(1, 'rgba(90,85,75,0)');
      g.fillStyle = grad; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    g.restore();
  }
  return toTex(c);
}

/** 滿牆的紅色經文（透明底） */
export function sutraTexture(seed = 11) {
  const S = 1024, [c, g] = canvas(S, S);
  const rng = mulberry32(seed);
  const src = '南無阿彌陀佛觀自在菩薩行深般若波羅蜜多時照見五蘊皆空度一切苦厄舍利子色不異空空不異色閉目勿視';
  const size = 30;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let col = 0; col < S / (size * 1.15); col++) {
    const x = S - (col + 0.5) * size * 1.15;
    let alpha = 0.35 + rng() * 0.55;
    let k = Math.floor(rng() * src.length);
    for (let row = 0; row < S / size - 1; row++) {
      if (rng() < 0.02) alpha = 0.2 + rng() * 0.7;
      if (rng() < 0.03) continue;
      g.save();
      g.translate(x + (rng() - 0.5) * 4, (row + 0.7) * size);
      g.rotate((rng() - 0.5) * 0.12);
      g.font = `bold ${size * (0.85 + rng() * 0.25)}px ${KAI}`;
      g.fillStyle = `rgba(105,12,8,${alpha * (0.7 + rng() * 0.3)})`;
      g.fillText(src[k % src.length], 0, 0);
      g.restore();
      k++;
    }
  }
  g.globalCompositeOperation = 'destination-out';
  speckle(g, S, S, rng, 60, 'rgba(0,0,0,A)', 0.3, 0.9, 20, 120);
  g.globalCompositeOperation = 'source-over';
  return toTex(c);
}

// ───────────────────────── 場景美術追加（2026-11）─────────────────────────

/** 矇眼紅布：平織紋理、褪色、邊緣磨損；雙眼位置有往下滲開的深色水痕。u 繞頭一圈，eyes 是雙眼所在的 u 座標。 */
export function blindfoldTexture(seed = 7, eyes = [0.205, 0.295]) {
  const W = 512, H = 128, [c, g] = canvas(W, H);
  const rng = mulberry32(seed);
  g.fillStyle = '#7d1f1a'; g.fillRect(0, 0, W, H);
  // 褪色與髒污的大塊色差
  speckle(g, W, H, rng, 46, 'rgba(160,62,48,A)', 0.08, 0.28, 18, 80);
  speckle(g, W, H, rng, 60, 'rgba(38,8,7,A)', 0.1, 0.34, 10, 60);
  // 平織：經緯線
  for (let y = 0; y < H; y += 2) { g.fillStyle = `rgba(20,4,3,${0.1 + rng() * 0.16})`; g.fillRect(0, y, W, 1); }
  for (let x = 0; x < W; x += 2) { g.fillStyle = `rgba(210,120,100,${0.03 + rng() * 0.07})`; g.fillRect(x, 0, 1, H); }
  // 摺痕（橫向）
  for (let i = 0; i < 7; i++) {
    const y = 8 + rng() * (H - 16);
    const grad = g.createLinearGradient(0, y - 5, 0, y + 5);
    grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(0.45, 'rgba(18,3,3,0.34)'); grad.addColorStop(0.6, 'rgba(220,130,110,0.14)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad; g.fillRect(0, y - 5, W, 10);
  }
  // 雙眼的滲痕：深色，往下暈開
  for (const u of eyes) {
    const x = u * W;
    let grad = g.createRadialGradient(x, H * 0.46, 2, x, H * 0.5, 30);
    grad.addColorStop(0, 'rgba(14,2,2,0.9)'); grad.addColorStop(0.5, 'rgba(26,4,4,0.55)'); grad.addColorStop(1, 'rgba(26,4,4,0)');
    g.fillStyle = grad; g.fillRect(x - 34, 0, 68, H);
    for (let d = 0; d < 5; d++) {
      const dx = x + (rng() - 0.5) * 22, len = 26 + rng() * 44, w = 2 + rng() * 4;
      grad = g.createLinearGradient(0, H * 0.5, 0, H * 0.5 + len);
      grad.addColorStop(0, 'rgba(12,2,2,0.8)'); grad.addColorStop(1, 'rgba(12,2,2,0)');
      g.fillStyle = grad; g.fillRect(dx, H * 0.5, w, len);
    }
  }
  // 上下緣磨白
  for (const y0 of [0, H - 5]) for (let x = 0; x < W; x += 3) { g.fillStyle = `rgba(196,150,130,${rng() * 0.35})`; g.fillRect(x, y0 + rng() * 3, 2, 2 + rng() * 3); }
  return toTex(c, { repeat: true });
}

/** 炭化木：鱷魚皮狀龜裂、灰白餘燼。可同時當 map 與 bumpMap。 */
export function charTexture(seed = 61) {
  const S = 512, [c, g] = canvas(S, S);
  const rng = mulberry32(seed);
  g.fillStyle = '#0d0b0a'; g.fillRect(0, 0, S, S);
  // 龜裂塊：以錯位的格子畫出一塊塊略凸的炭塊
  const rows = 22, cols = 9;
  for (let j = 0; j < rows; j++) {
    const h = S / rows;
    let x = -rng() * 40;
    while (x < S) {
      const w = (S / cols) * (0.5 + rng() * 0.9), y = j * h + (rng() - 0.5) * 4;
      const v = 16 + rng() * 26;
      const grad = g.createLinearGradient(x, y, x + w * 0.2, y + h);
      grad.addColorStop(0, `rgb(${v + 20},${v + 16},${v + 13})`); grad.addColorStop(0.5, `rgb(${v},${v - 2},${v - 4})`); grad.addColorStop(1, 'rgb(4,3,3)');
      g.fillStyle = grad;
      g.fillRect(x + 1.5, y + 1.5, w - 3, h - 3);
      x += w;
    }
  }
  // 灰燼與殘留的焦褐色
  speckle(g, S, S, rng, 90, 'rgba(120,112,104,A)', 0.04, 0.2, 6, 40);
  speckle(g, S, S, rng, 40, 'rgba(70,30,14,A)', 0.05, 0.22, 10, 60);
  speckle(g, S, S, rng, 140, 'rgba(0,0,0,A)', 0.2, 0.6, 4, 30);
  return toTex(c, { repeat: true });
}

/** 門周圍往上竄的燻黑痕（透明底）：下窄上寬的火舌形，邊緣不規則。 */
export function scorchTexture(seed = 33) {
  const W = 512, H = 512, [c, g] = canvas(W, H);
  const rng = mulberry32(seed);
  for (let i = 0; i < 380; i++) {
    const v = Math.pow(rng(), 0.7); // 0 底部 … 1 頂端
    const spread = 0.12 + v * 0.42;
    const x = W * (0.5 + (rng() - 0.5) * 2 * spread), y = H * (1 - v);
    const r = 14 + rng() * 60 * (0.5 + v);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    const a = (0.16 + rng() * 0.34) * (1 - v * 0.4);
    grad.addColorStop(0, `rgba(6,5,4,${a})`); grad.addColorStop(1, 'rgba(6,5,4,0)');
    g.fillStyle = grad; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // 往上拉的煙痕
  for (let i = 0; i < 46; i++) {
    const x = W * (0.5 + (rng() - 0.5) * 0.7), y0 = H * (0.25 + rng() * 0.7), len = 60 + rng() * 220, w = 3 + rng() * 14;
    const grad = g.createLinearGradient(0, y0, 0, y0 - len);
    grad.addColorStop(0, `rgba(4,3,3,${0.1 + rng() * 0.22})`); grad.addColorStop(1, 'rgba(4,3,3,0)');
    g.fillStyle = grad; g.fillRect(x, y0 - len, w, len);
  }
  // 邊緣淡出，避免貼片邊界露出
  g.globalCompositeOperation = 'destination-in';
  const fade = g.createRadialGradient(W / 2, H * 0.55, H * 0.2, W / 2, H * 0.55, H * 0.62);
  fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = fade; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'source-over';
  return toTex(c);
}

/** 低處的抓痕（透明底）：密集、短促、越往上越稀，停在大約一公尺高。 */
export function scratchTexture(seed = 5) {
  const W = 256, H = 512, [c, g] = canvas(W, H);
  const rng = mulberry32(seed);
  g.lineCap = 'round';
  for (let i = 0; i < 46; i++) {
    const v = Math.pow(rng(), 1.8); // 集中在下方
    const x = W * (0.12 + rng() * 0.76), y = H * (1 - v * 0.92) - 6;
    const len = 18 + rng() * 60, lean = (rng() - 0.5) * 14;
    g.strokeStyle = `rgba(${150 + rng() * 60},${128 + rng() * 50},${96 + rng() * 40},${0.25 + rng() * 0.5})`;
    g.lineWidth = 0.6 + rng() * 1.6;
    const n = rng() < 0.45 ? 4 : 1; // 四指並排的抓痕
    for (let k = 0; k < n; k++) {
      g.beginPath(); g.moveTo(x + k * 7, y - len * (0.9 + rng() * 0.2)); g.quadraticCurveTo(x + k * 7 + lean * 0.5, y - len * 0.5, x + k * 7 + lean, y); g.stroke();
    }
  }
  return toTex(c);
}

/** 蛛網（透明底，以一個角為中心的四分之一扇形，掛在牆角與樑柱交接處）。 */
export function cobwebTexture(seed = 3) {
  const S = 256, [c, g] = canvas(S, S);
  const rng = mulberry32(seed);
  g.lineWidth = 1;
  const spokes = 9, rings = 11, R = S * 0.98;
  const ang = (i) => (i / (spokes - 1)) * (Math.PI / 2);
  const len = Array.from({ length: spokes }, () => R * (0.72 + rng() * 0.28));
  g.strokeStyle = 'rgba(205,205,198,0.5)';
  for (let i = 0; i < spokes; i++) { g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(ang(i)) * len[i], Math.sin(ang(i)) * len[i]); g.stroke(); }
  for (let r = 1; r <= rings; r++) {
    if (rng() < 0.12) continue;
    g.strokeStyle = `rgba(205,205,198,${0.2 + rng() * 0.3})`;
    g.beginPath();
    for (let i = 0; i < spokes; i++) {
      const k = (r / rings) * (0.9 + rng() * 0.12), x = Math.cos(ang(i)) * len[i] * k, y = Math.sin(ang(i)) * len[i] * k;
      if (i === 0) { g.moveTo(x, y); continue; }
      // 兩輻之間略微下垂
      const pk = (r / rings) * 0.86, px = Math.cos(ang(i - 0.5)) * len[i] * pk, py = Math.sin(ang(i - 0.5)) * len[i] * pk;
      if (rng() < 0.1) g.moveTo(x, y); else g.quadraticCurveTo(px, py, x, y);
    }
    g.stroke();
  }
  // 積灰的薄霧感與破洞
  speckle(g, S, S, rng, 26, 'rgba(190,190,182,A)', 0.03, 0.1, 10, 50);
  g.globalCompositeOperation = 'destination-out';
  speckle(g, S, S, rng, 7, 'rgba(0,0,0,A)', 0.7, 1, 12, 34);
  g.globalCompositeOperation = 'source-over';
  return toTex(c);
}

/** 枯葉圖集（2×2，四種形狀，透明底）。 */
export function leafAtlasTexture(seed = 14) {
  const S = 256, [c, g] = canvas(S, S);
  const rng = mulberry32(seed);
  const cols = ['#5a4326', '#6b4a22', '#4a3a24', '#70552c'];
  for (let k = 0; k < 4; k++) {
    const cx = (k % 2) * 128 + 64, cy = Math.floor(k / 2) * 128 + 64;
    g.save(); g.translate(cx, cy); g.rotate((rng() - 0.5) * 0.6);
    g.beginPath(); g.rect(-62, -62, 124, 124); g.clip();
    g.fillStyle = cols[k];
    g.beginPath();
    const L = 50, Wd = 17 + k * 4;
    g.moveTo(0, -L); g.bezierCurveTo(Wd * 1.5, -L * 0.4, Wd * 1.2, L * 0.5, 0, L);
    g.bezierCurveTo(-Wd * (0.9 + rng() * 0.6), L * 0.4, -Wd * 1.4, -L * 0.5, 0, -L);
    g.fill();
    g.globalCompositeOperation = 'source-atop';
    g.strokeStyle = 'rgba(30,20,10,0.6)'; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(0, -L); g.lineTo(0, L); g.stroke();
    g.lineWidth = 0.7;
    for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(0, i * 12); g.lineTo(Wd * 0.9, i * 12 - 9); g.moveTo(0, i * 12); g.lineTo(-Wd * 0.9, i * 12 - 9); g.stroke(); }
    // 蟲蛀與乾枯的斑
    for (let i = 0; i < 9; i++) { g.fillStyle = `rgba(${20 + rng() * 30},${12 + rng() * 20},6,${0.2 + rng() * 0.4})`; g.beginPath(); g.arc((rng() - 0.5) * Wd * 2, (rng() - 0.5) * L * 2, 2 + rng() * 9, 0, 6.3); g.fill(); }
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 2; i++) { g.beginPath(); g.arc((rng() - 0.5) * Wd * 1.6, (rng() - 0.5) * L * 1.4, 2 + rng() * 4, 0, 6.3); g.fill(); }
    g.globalCompositeOperation = 'source-over';
    g.restore();
  }
  return toTex(c);
}

/** 直式楹聯／輓聯：paper = 'wood'（黑底金字木聯）、'red'（褪色紅紙）、'white'（白布輓聯）。 */
export function coupletTexture(text, { paper = 'wood', seed = 1, w = 160, h = 1024 } = {}) {
  const [c, g] = canvas(w, h);
  const rng = mulberry32(seed * 31 + 7);
  const style = {
    wood: { bg: ['#1c0f08', '#0c0604'], ink: '#b08a34', shadow: 'rgba(0,0,0,0.7)', border: '#6e5320' },
    red: { bg: ['#7e1d16', '#5c120e'], ink: '#15100c', shadow: 'rgba(0,0,0,0)', border: null },
    white: { bg: ['#b9b3a2', '#9d9685'], ink: '#14110e', shadow: 'rgba(0,0,0,0)', border: null },
  }[paper];
  const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, style.bg[0]); bg.addColorStop(1, style.bg[1]);
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  if (style.border) { g.strokeStyle = style.border; g.lineWidth = 6; g.strokeRect(7, 7, w - 14, h - 14); }
  const chars = [...text];
  const size = Math.min(w * 0.74, (h * 0.9) / chars.length);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  chars.forEach((ch, i) => {
    const y = h / 2 + (i - (chars.length - 1) / 2) * size * 1.08;
    g.font = `bold ${size * (0.94 + rng() * 0.1)}px ${KAI}`;
    g.fillStyle = style.shadow; g.fillText(ch, w / 2 + 3, y + 4);
    g.fillStyle = style.ink; g.fillText(ch, w / 2 + (rng() - 0.5) * 3, y);
  });
  // 水漬、霉斑、褪色
  if (paper === 'wood') speckle(g, w, h, rng, 150, 'rgba(8,5,3,A)', 0.2, 0.7, 4, 34);
  else {
    speckle(g, w, h, rng, 60, 'rgba(60,44,26,A)', 0.06, 0.26, 10, 70);
    speckle(g, w, h, rng, 40, 'rgba(225,215,190,A)', 0.04, 0.16, 8, 40);
    for (let i = 0; i < 26; i++) {
      const x = rng() * w, y = rng() * h * 0.8, len = 60 + rng() * 260;
      const grad = g.createLinearGradient(0, y, 0, y + len);
      grad.addColorStop(0, `rgba(50,36,20,${0.1 + rng() * 0.2})`); grad.addColorStop(1, 'rgba(50,36,20,0)');
      g.fillStyle = grad; g.fillRect(x, y, 2 + rng() * 9, len);
    }
    // 撕破的下緣與邊角
    g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.moveTo(0, h);
    for (let i = 0; i <= 10; i++) g.lineTo((w * i) / 10, h - rng() * 60);
    g.lineTo(w, h); g.closePath(); g.fill();
    speckle(g, w, h, rng, 5, 'rgba(0,0,0,A)', 0.8, 1, 8, 26);
    g.globalCompositeOperation = 'source-over';
  }
  return toTex(c);
}

/** 成疊金紙（一張貼圖：上半是正面金箔，下半是側面紙疊與紅紙帶）。 */
export function jossStackTexture() {
  const S = 128, [c, g] = canvas(S, S);
  const rng = mulberry32(88);
  g.fillStyle = '#a58a4c'; g.fillRect(0, 0, S, 64);
  speckle(g, S, 64, rng, 30, 'rgba(70,48,14,A)', 0.1, 0.3, 4, 22);
  g.fillStyle = '#b6902c'; g.fillRect(34, 12, 60, 40);
  g.fillStyle = 'rgba(255,236,170,0.3)'; g.fillRect(40, 16, 22, 30);
  g.strokeStyle = '#7a1612'; g.lineWidth = 3; g.strokeRect(5, 5, S - 10, 54);
  g.fillStyle = '#8f7a48'; g.fillRect(0, 64, S, 64);
  for (let y = 64; y < S; y += 2) { g.fillStyle = `rgba(${40 + rng() * 40},${30 + rng() * 30},12,${0.25 + rng() * 0.35})`; g.fillRect(0, y, S, 1); }
  g.fillStyle = '#7a1612'; g.fillRect(52, 64, 22, 64);
  return toTex(c);
}
