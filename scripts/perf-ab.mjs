// perf：畫面一致性檢查。同一份程式分別以 ?noopt（關閉所有效能輔助）與預設值載入，
// 在固定視角、固定時間拍下畫布，逐像素比較，確認最佳化沒有改變畫面。
// 用法：node scripts/perf-ab.mjs [home road temple] [--only=lights,prepass,shadow,…]
// 輸出：artifacts/perf/ab/<map>_<view>_{a,b}.png、artifacts/perf/ab-results.json
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import zlib from 'node:zlib';

const args = process.argv.slice(2);
const maps = args.filter((a) => ['home', 'road', 'temple'].includes(a));
if (!maps.length) maps.push('home', 'road', 'temple');
// --only=x：A 組只關閉 x（其餘照常），用來單獨檢查某一項
const only = (args.find((a) => a.startsWith('--only=')) || '').slice(7);
const BASE = process.env.GAME_BASE || 'http://127.0.0.1:5178/';
const out = 'artifacts/perf/ab';
fs.mkdirSync(out, { recursive: true });

const VIEWS = {
  home: [['desk', 0, 0, -0.5, 0, -20], ['door', 1.4, 0, 1.5, 180, 0], ['room', -2.5, 0, 2.5, -135, -8]],
  road: [['spawn', -1.2, 0, 33.2, 0, -2], ['bridge', 0, 0, 14, 0, 0], ['village', 0, 0, 2, 0, 0], ['workshop', 8.5, 0.12, -15.5, 0, -5], ['inside', 8.5, 0.12, -17.5, 180, 0]],
  temple: [
    ['spawn', 0, null, 49, 0, 6], ['gate', 0, null, 30, 0, 14], ['courtyard', 0, null, 18, 0, 18], ['courtyard_w', 6, null, 6, 80, 4],
    ['porch', 0, null, -9.5, 0, 5], ['hall1', 0, 0.9, -16, 0, 6], ['hall1_back', 0, 0.9, -30, 180, 4], ['hall1_side', -14, 0.9, -20, -80, 0],
    ['hall2', -13, 6.9, -16, -70, 2], ['hall3', 12, 11.9, -28.3, 75, 2], ['terrace', 6, 16.9, -28.6, -90, 0],
    ['hall4', 0.6, 16.9, -20.6, 0, 6], ['stage', 23, 0.02, 8, 0, 4], ['graveyard', -36, null, 0, 90, 2], ['underground', 55, -7, -14.5, 0, 4],
  ],
};

const browser = await chromium.launch({
  channel: 'chrome', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});

async function capture(id, query, suffix) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}?auto&map=${id}&nohorror${query ? '&' + query : ''}`);
  await page.waitForFunction((id) => window.__game?.map?.id === id && window.__game.running, id, { timeout: 240000 });
  await page.waitForTimeout(600);
  await page.evaluate(() => { const g = window.__game; g.stop(); for (let i = 0; i < 40 && g.story?.modal; i++) g.story.choose(0); for (const id of ['story-hud', 'hud']) { const el = document.getElementById(id); if (el) el.style.display = 'none'; } });
  const files = [];
  for (const [name, x, y, z, yaw, pitch] of VIEWS[id]) {
    await page.evaluate(([x, y, z, yaw, pitch]) => {
      const g = window.__game;
      const gy = y === null ? g.map.world.probe(x, z, 1.5).g : y;
      g.player.fly = false; g.player.onGround = true;
      g.player.teleport(x, gy, z, (yaw * Math.PI) / 180, (pitch * Math.PI) / 180);
      g.player.time = 50; g.player.bobPhase = 0; g.player.bobAmt = 0; g.player.vel.set(0, 0, 0);
      g.time = 100;
      for (let i = 0; i < 45; i++) g.frame(1 / 30);
    }, [x, y, z, yaw, pitch]);
    const file = `${out}/${id}_${name}_${suffix}.png`;
    await page.locator('#game').screenshot({ path: file });
    files.push([name, file]);
  }
  await page.close();
  return { files, errors };
}

// 極簡 PNG 解碼（8-bit RGB/RGBA、無交錯），避免額外相依
function decodePng(buf) {
  let p = 8, w = 0, h = 0, ct = 0; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('latin1', p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; }
    if (type === 'IDAT') idat.push(data);
    p += 12 + len;
  }
  const bpp = ct === 6 ? 4 : 3, raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp, px = Buffer.alloc(w * h * bpp);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), o = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[o + x - bpp] : 0, b = y ? px[o - stride + x] : 0, c = x >= bpp && y ? px[o - stride + x - bpp] : 0;
      let v = row[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[o + x] = v & 255;
    }
  }
  return { w, h, bpp, px };
}
function compare(fa, fb) {
  const A = decodePng(fs.readFileSync(fa)), B = decodePng(fs.readFileSync(fb));
  if (A.w !== B.w || A.h !== B.h) return { error: 'size' };
  let sum = 0, max = 0, over4 = 0, over12 = 0, mean = 0; const n = A.w * A.h;
  for (let i = 0; i < n; i++) {
    const a = i * A.bpp, b = i * B.bpp;
    const d = Math.max(Math.abs(A.px[a] - B.px[b]), Math.abs(A.px[a + 1] - B.px[b + 1]), Math.abs(A.px[a + 2] - B.px[b + 2]));
    sum += d; if (d > max) max = d; if (d > 4) over4++; if (d > 12) over12++;
    mean += (A.px[a] + A.px[a + 1] + A.px[a + 2]) / 3;
  }
  return { meanDiff: +(sum / n).toFixed(3), maxDiff: max, pctOver4: +((over4 / n) * 100).toFixed(2), pctOver12: +((over12 / n) * 100).toFixed(3), meanLuma: +(mean / n).toFixed(1) };
}

const results = { when: new Date().toISOString(), only, maps: {} };
for (const id of maps) {
  // --same：兩組都用 ?noopt，量出「完全相同的設定」本身的雜訊（粒子、亂數）當作比較基準
  const same = args.includes('--same');
  const a = await capture(id, only ? `noopt=${only}` : 'noopt', same ? 'n1' : 'a');
  const b = await capture(id, same ? 'noopt' : '', same ? 'n2' : 'b');
  const rows = [];
  for (let i = 0; i < a.files.length; i++) {
    const [name, fa] = a.files[i], fb = b.files[i][1];
    const c = compare(fa, fb);
    rows.push({ view: name, ...c });
    console.log(`${id.padEnd(7)}${name.padEnd(13)} 平均差 ${String(c.meanDiff).padStart(6)}  最大差 ${String(c.maxDiff).padStart(3)}  >4:${String(c.pctOver4).padStart(6)}%  >12:${String(c.pctOver12).padStart(7)}%  亮度 ${c.meanLuma}`);
  }
  results.maps[id] = { rows, errorsA: a.errors, errorsB: b.errors };
  if (a.errors.length || b.errors.length) console.log('   errors', a.errors.slice(0, 3), b.errors.slice(0, 3));
}
fs.writeFileSync(`artifacts/perf/ab-results${args.includes('--same') ? '-noise' : only ? '-' + only.replace(/,/g, '_') : ''}.json`, JSON.stringify(results, null, 2));
await browser.close();
