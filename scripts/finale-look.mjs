// finale：地下封印室的取景勘查（開發用）。node scripts/finale-look.mjs [名稱前綴] [x,y,z,yaw,pitch;...]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const out = 'artifacts/finale'; fs.mkdirSync(out, { recursive: true });
const prefix = process.argv[2] || 'look';
const views = (process.argv[3] || '55,-7,-14.5,0,0.05;55,-7,-21.6,0,0.1;51.5,-7,-27,-0.9,0.1;55,-7,-20.5,3.14,0;58,-7,-24,0.6,0').split(';').map((s) => s.split(',').map(Number));
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = []; page.on('pageerror', (e) => errors.push(e.stack || e.message));
try {
  await page.goto('http://127.0.0.1:5178/?auto&map=temple');
  await page.waitForFunction(() => window.__game?.running && window.__game.story, null, { timeout: 240000 });
  for (let i = 0; i < 30; i++) { if (await page.evaluate(() => window.__game.story.modal?.options.length) !== 1) break; await page.evaluate(() => window.__game.story.choose(0)); }
  await page.evaluate(() => { const s = window.__game.story; Object.assign(s.state.flags, { incense: true, stage: true, loopSolved: true, key: true, underground: true }); s.state.chapter = 4; s.sync(); });
  for (let i = 0; i < views.length; i++) {
    await page.evaluate((v) => { const g = window.__game; g.player.teleport(v[0], v[1], v[2], v[3], v[4]); }, views[i]);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${out}/${prefix}-${i}.jpg`, type: 'jpeg', quality: 85 });
  }
} catch (e) { errors.push(e.stack || String(e)); }
finally { console.log('ERRORS', JSON.stringify(errors)); await browser.close(); }
