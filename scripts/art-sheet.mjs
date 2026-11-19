// 把 artifacts/art/<tag> 的截圖拼成對照表，方便一次檢視多個鏡位。
// 用法：
//   node scripts/art-sheet.mjs grid <tag> [名稱片段...]         → artifacts/art/<tag>/sheets/sheet-XX.jpg（每張 2×2）
//   node scripts/art-sheet.mjs compare <tagA> <tagB> [名稱片段...] → artifacts/art/compare/<name>.jpg（左 A 右 B）
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const [mode, a, ...rest] = process.argv.slice(2);
const root = path.resolve('artifacts', 'art');
const dataUrl = (file) => `data:image/jpeg;base64,${fs.readFileSync(file).toString('base64')}`;
const list = (tag, filters) => fs.readdirSync(path.join(root, tag)).filter((f) => f.endsWith('.jpg') && (!filters.length || filters.some((s) => f.includes(s)))).sort();

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const render = async (cells, cols, out, w = 1600) => {
  const rows = Math.ceil(cells.length / cols), cw = w / cols, ch = (cw * 900) / 1440;
  await page.setViewportSize({ width: w, height: Math.round(rows * ch) });
  await page.setContent(`<body style="margin:0;background:#000;display:grid;grid-template-columns:repeat(${cols},1fr);font:600 15px sans-serif;color:#ff0">${cells.map((c) => `<div style="position:relative;line-height:0"><img src="${dataUrl(c.file)}" style="width:100%"><span style="position:absolute;left:6px;top:4px;line-height:1.2;background:#000a;padding:1px 5px">${c.label}</span></div>`).join('')}</body>`);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await page.screenshot({ path: out, type: 'jpeg', quality: 86 });
  console.log(out);
};
if (mode === 'grid') {
  const files = list(a, rest);
  for (let i = 0; i < files.length; i += 4) {
    const cells = files.slice(i, i + 4).map((f) => ({ file: path.join(root, a, f), label: f.replace('.jpg', '') }));
    await render(cells, 2, path.join(root, a, 'sheets', `sheet-${String(i / 4 + 1).padStart(2, '0')}_${files[i].slice(0, 3)}.jpg`));
  }
} else if (mode === 'compare') {
  const b = rest.shift();
  for (const f of list(b, rest)) {
    const fa = path.join(root, a, f);
    if (!fs.existsSync(fa)) continue;
    await render([{ file: fa, label: `${a} · ${f.replace('.jpg', '')}` }, { file: path.join(root, b, f), label: b }], 2, path.join(root, 'compare', f), 2000);
  }
} else console.log('mode: grid | compare');
await browser.close();
