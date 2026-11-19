// horror（恐怖導演）測試共用工具：啟動瀏覽器、載入地圖、截圖。
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

export const BASE = process.env.GAME_BASE || 'http://127.0.0.1:5178/';
export const OUT = 'artifacts/horror';
fs.mkdirSync(OUT, { recursive: true });

export async function launch({ width = 1280, height = 800 } = {}) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.stack || e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return { browser, page, errors };
}

/** 載入地圖並關掉開場的閱讀視窗。extra 例如 '&horror' */
export async function enter(page, map, extra = '') {
  await page.goto(`${BASE}?auto&map=${map}${extra}`);
  await page.waitForFunction(() => window.__game?.running && window.__game.story && window.__game.map, null, { timeout: 240000 });
  await dismiss(page);
}

export async function dismiss(page) {
  for (let i = 0; i < 40; i++) {
    const n = await page.evaluate(() => window.__game.story?.modal?.options.length || 0);
    if (n !== 1) break;
    await page.evaluate(() => window.__game.story.choose(0));
  }
}

export async function shot(page, name, { jpg = true } = {}) {
  const file = path.join(OUT, name + (jpg ? '.jpg' : '.png'));
  await page.screenshot(jpg ? { path: file, type: 'jpeg', quality: 86 } : { path: file });
  return file;
}
