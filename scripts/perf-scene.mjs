// perf：載入量測 + 場景普查（確定性的數字為主）
// 用法：node scripts/perf-scene.mjs <標籤> [home road temple] [--query=noopt]
// 輸出：artifacts/perf/<標籤>-scene.json
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const args = process.argv.slice(2);
const tag = args.find((a) => !a.startsWith('--') && !['home', 'road', 'temple'].includes(a)) || 'run';
const maps = args.filter((a) => ['home', 'road', 'temple'].includes(a));
if (!maps.length) maps.push('home', 'road', 'temple');
const extra = (args.find((a) => a.startsWith('--query=')) || '').slice(8);
const BASE = process.env.GAME_BASE || 'http://127.0.0.1:5178/';
const out = 'artifacts/perf';
fs.mkdirSync(out, { recursive: true });

// [名稱, x, y(null=貼地), z, yaw 度, pitch 度]
const VIEWS = {
  home: [['desk', 0, 0, -0.5, 0, -20], ['door', 1.4, 0, 1.5, 180, 0]],
  road: [['spawn', -1.2, 0, 33.2, 0, -2], ['bridge', 0, 0, 14, 0, 0], ['village', 0, 0, 2, 0, 0], ['workshop', 8.5, 0.12, -15.5, 0, -5], ['gate', 0, 0, -30, 0, 0]],
  temple: [
    ['spawn', 0, null, 49, 0, 6], ['gate', 0, null, 30, 0, 14], ['courtyard', 0, null, 18, 0, 18],
    ['porch', 0, null, -9.5, 0, 5], ['hall1', 0, 0.9, -16, 0, 6], ['hall1_back', 0, 0.9, -30, 180, 4],
    ['hall2', -13, 6.9, -16, -70, 2], ['hall3', 12, 11.9, -28.3, 75, 2], ['terrace', 6, 16.9, -28.6, -90, 0],
    ['terrace_out', -13, 16.9, -22, 90, -12], ['stage', 23, 0.02, 8, 0, 4], ['graveyard', -36, null, 0, 90, 2],
    ['underground', 55, -7, -14.5, 0, 4],
  ],
};

const browser = await chromium.launch({
  channel: 'chrome', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info'],
});
const result = { tag, when: new Date().toISOString(), extra, maps: {} };

for (const id of maps) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  const reqs = new Map();
  cdp.on('Network.requestWillBeSent', (e) => reqs.set(e.requestId, { url: e.request.url, bytes: 0 }));
  cdp.on('Network.loadingFinished', (e) => { const r = reqs.get(e.requestId); if (r) r.bytes = e.encodedDataLength; });
  const t0 = Date.now();
  await page.goto(`${BASE}?auto&map=${id}${extra ? '&' + extra : ''}`);
  // 進度條取樣：檢查是否如實（單調、不卡在同一格太久）
  const progress = [];
  let running = false;
  while (!running && Date.now() - t0 < 240000) {
    const s = await page.evaluate(() => ({ w: document.getElementById('loading-bar')?.style.width || '', label: document.getElementById('loading-label')?.textContent || '', run: !!(window.__game?.map && window.__game.running) })).catch(() => null);
    if (s) { running = s.run; const last = progress.at(-1); if (!last || last.w !== s.w || last.label !== s.label) progress.push({ t: Date.now() - t0, w: s.w, label: s.label }); }
    if (!running) await page.waitForTimeout(40);
  }
  const loadMs = Date.now() - t0;
  await page.waitForTimeout(2500);
  const net = { total: 0, count: 0, groups: {} };
  for (const r of reqs.values()) {
    const u = r.url.replace(BASE, '');
    const g = u.startsWith('assets/textures') ? 'textures' : u.startsWith('assets/models') ? 'models' : u.startsWith('assets/story') ? 'story-images' : u.startsWith('assets/fonts') ? 'fonts' : u.startsWith('assets/hdri') ? 'hdri' : u.startsWith('assets/') ? 'assets-other' : /node_modules|\.vite/.test(u) ? 'js-deps' : 'js-src';
    net.total += r.bytes; net.count++;
    const G = (net.groups[g] ||= { bytes: 0, count: 0 }); G.bytes += r.bytes; G.count++;
  }
  net.top = [...reqs.values()].sort((a, b) => b.bytes - a.bytes).slice(0, 8).map((r) => ({ url: r.url.replace(BASE, ''), bytes: r.bytes }));

  const census = await page.evaluate(() => {
    const g = window.__game, r = g.renderer, scene = g.map.scene;
    g.stop();
    const tri = (o) => { const geo = o.geometry; if (!geo) return 0; const n = geo.index ? geo.index.count : geo.attributes.position?.count || 0; return (n / 3) * (o.isInstancedMesh ? o.count : 1); };
    const effVisible = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
    const groups = {}; const lights = { point: 0, spot: 0, dir: 0, hemi: 0, rect: 0, ambient: 0, shadowCasters: 0, pointVisible: 0 };
    let meshes = 0, visMeshes = 0, tris = 0, visTris = 0, castTris = 0, skinned = 0, sprites = 0, transparent = 0;
    const mats = new Set(), big = [];
    scene.traverse((o) => {
      if (o.isLight) {
        if (o.isPointLight) { lights.point++; if (effVisible(o) && o.intensity > 0) lights.pointVisible++; }
        else if (o.isSpotLight) lights.spot++; else if (o.isDirectionalLight) lights.dir++; else if (o.isHemisphereLight) lights.hemi++; else if (o.isRectAreaLight) lights.rect++; else lights.ambient++;
        if (o.castShadow) lights.shadowCasters++;
      }
      if (o.isSprite) sprites++;
      if (!(o.isMesh || o.isLine || o.isPoints)) return;
      const t = tri(o), v = effVisible(o);
      meshes++; tris += t; if (v) { visMeshes++; visTris += t; if (o.castShadow) castTris += t; }
      if (o.isSkinnedMesh) skinned++;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) { if (m) { mats.add(m); if (m.transparent) transparent++; } }
      // 以「根節點下第二層」歸類
      let top = o; while (top.parent && top.parent.parent && top.parent.parent !== scene) top = top.parent;
      const key = (top.name || top.type) + (o.isInstancedMesh ? ' [inst]' : '');
      const G = (groups[key] ||= { tris: 0, meshes: 0 }); G.tris += t; G.meshes++;
      big.push({ name: o.name || o.parent?.name || o.type, mat: (Array.isArray(o.material) ? o.material[0] : o.material)?.name || '', tris: Math.round(t), inst: o.isInstancedMesh ? o.count : 0, cast: !!o.castShadow, visible: v, frustumCulled: o.frustumCulled });
    });
    big.sort((a, b) => b.tris - a.tris);
    return {
      gpu: (() => { const gl = r.getContext(), d = gl.getExtension('WEBGL_debug_renderer_info'); return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : '?'; })(),
      meshes, visMeshes, tris: Math.round(tris), visTris: Math.round(visTris), castTris: Math.round(castTris), skinned, sprites, materials: mats.size, transparentMeshes: transparent, lights,
      memory: { ...r.info.memory }, programs: r.info.programs.length,
      heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
      pixelRatio: r.getPixelRatio(), quality: g.settings.quality,
      drawingBuffer: [r.domElement.width, r.domElement.height],
      top: big.slice(0, 25),
      groups: Object.fromEntries(Object.entries(groups).sort((a, b) => b[1].tris - a[1].tris).slice(0, 20)),
    };
  });

  const views = [];
  for (const [name, x, y, z, yaw, pitch] of VIEWS[id]) {
    views.push(await page.evaluate(([name, x, y, z, yaw, pitch]) => {
      const g = window.__game, r = g.renderer, info = r.info;
      const gy = y === null ? g.map.world.probe(x, z, 1.5).g : y;
      g.player.teleport(x, gy, z, (yaw * Math.PI) / 180, (pitch * Math.PI) / 180);
      // 跑幾幀讓樓層顯示、燈光門檻與陰影追上
      for (let i = 0; i < 40; i++) g.frame(1 / 30);
      // 模擬「正在移動」：每幀都要求重畫手電筒陰影（新版在靜止時會跳過）
      const step = (dt) => { if ('_shadowForce' in g.player) g.player._shadowForce = true; g.frame(dt); };
      const sample = () => { step(0); return { calls: info.render.calls, tris: info.render.triangles }; };
      const full = sample();
      const auto = r.shadowMap.autoUpdate;
      r.shadowMap.autoUpdate = false; r.shadowMap.needsUpdate = false;
      const main = sample();
      r.shadowMap.autoUpdate = auto;
      // 整幀成本：畫完後以 readPixels 強制等 GPU 做完，連續 21 幀取中位數與最小值
      const gl = r.getContext(), px = new Uint8Array(4), sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const ts = []; step(1 / 60); sync();
      for (let i = 0; i < 21; i++) { const a = performance.now(); step(1 / 60); sync(); ts.push(performance.now() - a); }
      ts.sort((a, b) => a - b);
      // shader 實際要算的點光源數（攝影機圖層看得到的）
      let pl = 0; g.map.scene.traverse((o) => { if (o.isPointLight && o.layers.test(g.camera.layers)) { let v = true; for (let p = o; p; p = p.parent) if (!p.visible) v = false; if (v) pl++; } });
      return { name, calls: full.calls, tris: full.tris, mainCalls: main.calls, mainTris: main.tris, shadowCalls: full.calls - main.calls, shadowTris: full.tris - main.tris, frameMs: +ts[10].toFixed(1), frameMsMin: +ts[0].toFixed(1), shaderPointLights: pl, programs: info.programs.length };
    }, [name, x, y, z, yaw, pitch]));
  }
  const after = await page.evaluate(() => ({ programs: window.__game.renderer.info.programs.length, memory: { ...window.__game.renderer.info.memory } }));
  result.maps[id] = { loadMs, net, progress, census, views, after, errors };
  const v0 = views[0];
  console.log(`${id}: load ${loadMs} ms, ${(net.total / 1048576).toFixed(1)} MB / ${net.count} req, scene ${census.visTris}/${census.tris} tris, ${census.visMeshes}/${census.meshes} meshes, programs ${census.programs}→${after.programs}, tex ${census.memory.textures}, heap ${census.heapMB} MB`);
  for (const v of views) console.log(`   ${v.name.padEnd(12)} calls ${String(v.calls).padStart(4)} tris ${String(v.tris).padStart(8)} | main ${String(v.mainCalls).padStart(4)}/${String(v.mainTris).padStart(8)} | shadow ${String(v.shadowCalls).padStart(4)}/${String(v.shadowTris).padStart(8)} | frame ${String(v.frameMs).padStart(5)} ms (min ${String(v.frameMsMin).padStart(5)}) | PL ${v.shaderPointLights}`);
  if (errors.length) console.log('   errors:', errors.slice(0, 5));
  void v0;
  await context.close();
}
fs.writeFileSync(`${out}/${tag}-scene.json`, JSON.stringify(result, null, 2));
await browser.close();
