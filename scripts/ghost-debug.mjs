// 鬼模型除錯用（ghost 小組）：載入寺廟後，在頁面裡執行一段指定的 JS，印出回傳值，必要時截圖。
// 用法：node scripts/ghost-debug.mjs <要執行的 js 檔> [截圖輸出.png] [map=temple]
// js 檔的內容會被包成 async (game, createGhost, THREE) => { ... }，可以 return 任何可序列化的值。
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const [file, shot, map = 'temple'] = process.argv.slice(2);
const body = fs.readFileSync(file, 'utf8');
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.stack || e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
try {
  await page.goto(`http://127.0.0.1:5178/?auto&map=${map}&dev`);
  await page.waitForFunction(() => window.__game?.story && window.__game.running, null, { timeout: 240000 });
  await page.addStyleTag({ content: 'body>*:not(canvas){display:none!important}' });
  const result = await page.evaluate(async (src) => {
    const g = window.__game;
    for (let i = 0; i < 30 && g.story.modal; i++) { if (g.story.modal.options?.length === 1) g.story.choose(0); else break; }
    g.story.modal = null;
    const { createGhost } = await import('/src/maps/temple/ghost.js');
    const src0 = await (await fetch('/src/maps/temple/ghost.js')).text(); const THREE = await import(/from "([^"]*three[^"]*)"/.exec(src0)[1]);
    const fn = new Function('game', 'createGhost', 'THREE', `return (async () => { ${src} })();`);
    return await fn(g, createGhost, THREE);
  }, body);
  console.log(JSON.stringify(result, null, 1));
  if (shot) { await page.waitForTimeout(1200); await page.screenshot({ path: shot }); }
} catch (e) { errors.push(e.stack || String(e)); }
console.log('ERRORS', JSON.stringify(errors.slice(0, 20), null, 1));
await browser.close();
