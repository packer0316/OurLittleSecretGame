// story（第二輪）：寺內劇情陳設的截圖。用法：node scripts/story2-shots.mjs [名稱前綴...]
// 每個視角：[名稱, 站位 x, 地板 y, 站位 z, 看向 [x,y,z], 全亮?, 先設定的劇情狀態]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const out = 'artifacts/story2'; fs.mkdirSync(out, { recursive: true });
const only = process.argv.slice(2);
const ALL = { incense: true, stage: true, loopSolved: true, key: true };
const VIEWS = [
  ['robe', 10.75, 0.9, -18.55, [10.45, 1.25, -19.9], false, ALL],
  ['robe-wide', 11.0, 0.9, -17.2, [9.7, 1.4, -20.1], false, ALL],
  ['flashlight', 5.7, 6.9, -27.3, [6.6, 7.0, -29.6], false, ALL],
  ['flashlight-far', 1.8, 6.9, -24.2, [6.6, 7.0, -29.6], false, ALL],
  ['flashlight-close', 6.6, 6.9, -28.2, [6.7, 6.9, -29.5], false, ALL],
  ['chalk-f1', -8.4, 0.9, -26.4, [-11.5, 2.5, -28.2], false, ALL],
  ['chalk-f2', 9.0, 6.9, -16.6, [11.5, 8.5, -18.5], false, ALL],
  ['chalk-f3a', 6.2, 11.9, -28.4, [4, 13.3, -25], false, ALL],
  ['chalk-f3b', -3.6, 11.9, -28.2, [-4, 13.1, -25], false, ALL],
  ['chalk-f3b-low', -3.8, 11.9, -26.75, [-4, 12.4, -25.4], false, ALL],
  ['chalk-f3b-close', -3.95, 11.9, -26.25, [-4, 12.95, -25.4], false, ALL],
  ['tablet', -12.25, 11.9, -18.2, [-13.6, 12.85, -18.35], false, { ...ALL, births: true }],
  ['camp', -6.4, 16.9, -22.2, [-8.8, 17.0, -24.0], false, ALL],
  ['camp-bright', -6.4, 16.9, -22.2, [-8.8, 17.0, -24.0], true, ALL],
  ['register', -7.9, 16.9, -24.6, [-8.8, 17.2, -25.7], false, ALL],
  ['hatch', 5.3, 16.9, -19.95, [5.3, 16.95, -21.4], false, ALL],
  ['hatch-bright', 2.6, 16.9, -19.8, [5.6, 16.9, -21.6], true, ALL],
  ['bucket', 6.0, 16.9, -21.0, [7.0, 17.2, -22.3], false, ALL],
  ['f4-entry', 0.6, 16.9, -20.0, [4.6, 16.95, -21.6], false, ALL],
  ['f4-entry-west', -0.4, 16.9, -20.0, [-7.5, 17.0, -23.4], false, ALL],
];
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://127.0.0.1:5178/?auto&map=temple');
await page.waitForFunction(() => window.__game?.running && window.__game.story, null, { timeout: 180000 });
for (let i = 0; i < 20; i++) { if (await page.evaluate(() => window.__game.story.modal?.options.length) !== 1) break; await page.evaluate(() => window.__game.story.choose(0)); }
await page.waitForTimeout(1500); // 等手寫字型載入、圖集重畫
for (const [name, x, y, z, at, bright, flags] of VIEWS) {
  if (only.length && !only.some((o) => name.startsWith(o))) continue;
  await page.evaluate(([x, y, z, at, bright, flags]) => {
    const g = window.__game, s = g.story, p = g.player;
    const { births, ...f } = flags; Object.assign(s.state.flags, f);
    s.state.chapter = f.key ? 4 : 3;
    for (const id of ['diary', 'newspaper', 'tape', 'stage', 'death', ...(births ? ['births'] : [])]) if (!s.state.evidence.includes(id)) s.state.evidence.push(id);
    s.sync();
    g.map.setFullBright(bright);
    const dx = at[0] - x, dz = at[2] - z, dy = at[1] - (y + p.eye);
    p.teleport(x, y, z, Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)));
  }, [x, y, z, at, bright, flags]);
  await page.waitForTimeout(900);
  await page.evaluate(() => window.__game.renderOnce());
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('shot', name);
}
console.log('ERRORS', JSON.stringify(errors));
await browser.close();
