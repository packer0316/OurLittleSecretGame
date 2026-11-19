// 把 artifacts/ghost 裡的截圖排成總覽表（ghost 小組）。不需要遊戲伺服器。
// 用法：node scripts/ghost-sheet.mjs [來源資料夾=artifacts/ghost] [名稱關鍵字...]
// 輸出：<來源資料夾>/sheets/sheet-XX.png，每張 3×4 格，圖下標示檔名。
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = path.resolve(process.argv[2] || 'artifacts/ghost');
const only = process.argv.slice(3);
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png') && (!only.length || only.some((o) => f.includes(o)))).sort();
const out = path.join(dir, 'sheets');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1284, height: 1000 } });
const PER = 12;
for (let i = 0; i < files.length; i += PER) {
  const cells = files.slice(i, i + PER).map((f) => `<figure><img src="../${f}"><figcaption>${f.replace('.png', '')}</figcaption></figure>`).join('');
  const html = path.join(out, '_sheet.html');
  fs.writeFileSync(html, `<style>body{margin:0;background:#111;display:grid;grid-template-columns:repeat(3,428px);gap:0}figure{margin:0;position:relative}img{width:428px;height:241px;display:block}figcaption{position:absolute;left:4px;bottom:3px;font:12px monospace;color:#ff0;text-shadow:0 0 3px #000,0 0 3px #000}</style>${cells}`);
  await page.goto(pathToFileURL(html).href);
  await page.waitForLoadState('load');
  const name = path.join(out, `sheet-${String(i / PER + 1).padStart(2, '0')}.png`);
  await page.screenshot({ path: name, fullPage: true });
  console.log(name);
}
fs.rmSync(path.join(out, '_sheet.html'), { force: true });
await browser.close();
