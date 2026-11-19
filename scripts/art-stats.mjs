// 場景成本分析：列出指定地圖中三角形最多的網格，以及出生點穩定狀態的 draw calls / 三角形數。
// 用法：node scripts/art-stats.mjs [temple|home|road] [top=30]
import { chromium } from 'playwright-core';

const map = process.argv[2] || 'temple';
const top = +(process.argv[3] || 30);
const BASE = process.env.GAME_BASE || 'http://127.0.0.1:5178/';
const browser = await chromium.launch({
  channel: 'chrome', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.stack || e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`${BASE}?auto&map=${map}`);
await page.waitForFunction(() => window.__game?.map && window.__game.running, null, { timeout: 240000 });
await page.waitForTimeout(2500);
const out = await page.evaluate((top) => {
  const g = window.__game;
  const live = { fps: +g.fps.toFixed(1), calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles };
  g.stop();
  g.renderer.info.reset(); g.renderOnce(); g.renderer.info.reset(); g.renderOnce();
  const steady = { calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles, geoms: g.renderer.info.memory.geometries, tex: g.renderer.info.memory.textures };
  const rows = []; let meshes = 0, total = 0, lights = 0, casters = 0;
  g.map.scene.traverse((o) => {
    if (o.isLight) lights++;
    if (!o.isMesh && !o.isPoints && !o.isLine) return;
    meshes++;
    const geo = o.geometry; if (!geo?.attributes?.position) return;
    const per = (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
    const n = per * (o.isInstancedMesh ? o.count : 1);
    total += n; if (o.castShadow) casters++;
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    let path = o.name || ''; for (let p = o.parent, k = 0; p && k < 3; p = p.parent, k++) if (p.name) path = p.name + '/' + path;
    rows.push({ n: Math.round(n), per: Math.round(per), inst: o.isInstancedMesh ? o.count : 1, cast: o.castShadow, name: path, map: mat?.map?.source?.data?.src?.split('/').slice(-2).join('/') || (mat?.map ? 'canvas' : ''), color: mat?.color?.getHexString?.() });
  });
  rows.sort((a, b) => b.n - a.n);
  return { live, steady, meshes, lights, casters, total: Math.round(total), rows: rows.slice(0, top) };
}, top);
console.log(JSON.stringify({ live: out.live, steady: out.steady, meshes: out.meshes, lights: out.lights, casters: out.casters, sceneTris: out.total }));
for (const r of out.rows) console.log(String(r.n).padStart(8), `per ${r.per} x${r.inst}`.padEnd(18), r.cast ? 'S' : '-', (r.map || '#' + r.color).padEnd(44), r.name);
if (errors.length) console.log('errors:', [...new Set(errors)].slice(0, 8).join('\n'));
await browser.close();
