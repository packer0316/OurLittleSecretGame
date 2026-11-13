// 開發用：產生大廳地圖縮圖與大廳截圖（需先啟動 npm run dev）
import { chromium } from 'playwright-core';
const out = process.argv[2];
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:5173/?auto&map=temple');
await page.waitForFunction(() => window.__game?.map && window.__game.running, null, { timeout: 180000 });
await page.evaluate(() => {
  const g = window.__game;
  document.getElementById('hud').style.visibility = 'hidden';
  g.player.teleport(-5.5, 0.02, 19.5, -0.2, 0.3);
  g.player.flashOn = true;
});
await page.waitForTimeout(1500);
await page.screenshot({ path: 'public/assets/ui/temple.jpg', type: 'jpeg', quality: 86 });
if (out) {
  const p2 = await browser.newPage({ viewport: { width: 1440, height: 810 } });
  await p2.goto('http://localhost:5173/');
  await p2.waitForTimeout(1200);
  await p2.screenshot({ path: out + '/lobby.jpg', type: 'jpeg', quality: 85 });
}
await browser.close();
