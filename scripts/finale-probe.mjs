// finale：開發用的快速檢查。載入寺廟、執行一段傳入的程式碼（第 2 個參數是檔案路徑或字串），印出結果與錯誤，必要時截圖。
// node scripts/finale-probe.mjs "<js 運算式，回傳可序列化的值>" [截圖名]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const out = 'artifacts/finale'; fs.mkdirSync(out, { recursive: true });
const code = fs.existsSync(process.argv[2] || '') ? fs.readFileSync(process.argv[2], 'utf8') : (process.argv[2] || '1');
const shot = process.argv[3];
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = []; page.on('pageerror', (e) => errors.push(e.stack || e.message)); page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
try {
  await page.goto('http://127.0.0.1:5178/?auto&map=temple');
  await page.waitForFunction(() => window.__game?.running && window.__game.story, null, { timeout: 240000 });
  for (let i = 0; i < 30; i++) { if (await page.evaluate(() => window.__game.story.modal?.options.length) !== 1) break; await page.evaluate(() => window.__game.story.choose(0)); }
  const res = await page.evaluate(`(async()=>{${code}})()`);
  console.log('RESULT', JSON.stringify(res, null, 1));
  if (shot) { await page.waitForTimeout(500); await page.screenshot({ path: `${out}/${shot}.jpg`, type: 'jpeg', quality: 85 }); }
} catch (e) { errors.push(e.stack || String(e)); }
finally { console.log('ERRORS', JSON.stringify(errors.filter((e) => !/GPU stall|Automatic fallback/.test(e)), null, 1)); await browser.close(); }
