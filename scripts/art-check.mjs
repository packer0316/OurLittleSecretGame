// 場景美術的合約檢查：山村地圖回傳 watchers（合約 F），每一項都有 root 與可轉動的 head；
// 寺廟的場景美術陳設層存在；住處的陳設存在。需要 http://127.0.0.1:5178/ 的測試伺服器。
import { chromium } from 'playwright-core';
const BASE = process.env.GAME_BASE || 'http://127.0.0.1:5178/';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(ok ? 'PASS' : 'FAIL', name, detail); };
const open = async (map) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}?auto&map=${map}`);
  await page.waitForFunction(() => window.__game?.map && window.__game.running, null, { timeout: 240000 });
  return { page, errors };
};
{
  const { page, errors } = await open('road');
  const r = await page.evaluate(() => {
    const g = window.__game, w = g.map.watchers || [];
    const ok = w.every((o) => o.root?.isObject3D && o.head?.isObject3D && o.head.parent);
    const before = w.map((o) => o.head.rotation.y);
    w.forEach((o) => { o.head.rotation.y += 0.4; });
    g.renderOnce();
    const moved = w.every((o, i) => Math.abs(o.head.rotation.y - before[i] - 0.4) < 1e-6);
    w.forEach((o, i) => { o.head.rotation.y = before[i]; });
    const names = {}; w.forEach((o) => { names[o.root.name] = (names[o.root.name] || 0) + 1; });
    return { n: w.length, ok, moved, names, inWorkshop: w.filter((o) => { const p = o.root.getWorldPosition(o.root.position.clone()); return p.x > 5 && p.x < 12 && p.z < -14 && p.z > -22.6; }).length };
  });
  check('山村回傳 watchers，且每項都有 root 與 head', r.n >= 10 && r.ok, JSON.stringify(r.names));
  check('watchers 的頭可以獨立轉動', r.moved, `共 ${r.n} 個，作坊內 ${r.inWorkshop} 個`);
  check('山村載入沒有錯誤', errors.length === 0, errors.join(' | '));
  await page.close();
}
{
  const { page, errors } = await open('temple');
  const r = await page.evaluate(() => {
    const s = window.__game.map.scene, names = ['BackHallScorch', 'Cobwebs', 'DeadLeaves', 'IndoorJossPaper', 'DoorCouplets', 'ElegiacScrolls'];
    return names.filter((n) => !s.getObjectByName(n));
  });
  check('寺廟的陳設層都在場景裡', r.length === 0, r.join(','));
  check('寺廟載入沒有錯誤', errors.length === 0, errors.join(' | '));
  await page.close();
}
{
  const { page, errors } = await open('home');
  const r = await page.evaluate(() => ['DecorWood', 'DecorBedding', 'DecorCurtains', 'DecorPrints', 'DecorPainted', 'WallStains'].filter((n) => !window.__game.map.scene.getObjectByName(n)));
  check('住處的陳設都在場景裡', r.length === 0, r.join(','));
  check('住處載入沒有錯誤', errors.length === 0, errors.join(' | '));
  await page.close();
}
await browser.close();
if (results.some((r) => !r)) process.exitCode = 1;
