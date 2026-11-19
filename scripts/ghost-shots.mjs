// 鬼模型截圖工具（ghost 小組）。需要共用測試伺服器 http://127.0.0.1:5178/ 已在執行。
// 用法：node scripts/ghost-shots.mjs [名稱關鍵字...]
//   不帶參數＝全部；帶關鍵字時只拍名稱包含任一關鍵字的鏡頭。
//   GHOST_OUT=資料夾（預設 artifacts/ghost）、GHOST_SIZE=1280x720。
// 每個鏡頭會在場景裡建立一個獨立的測試用鬼（不動到 storyWorld 的那一隻），
// 擺在已知座標，依指定的距離、光源、姿勢拍照，並輸出 draw call／三角形數。
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const out = process.env.GHOST_OUT || 'artifacts/ghost';
const [W, H] = (process.env.GHOST_SIZE || '1280x720').split('x').map(Number);
const only = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });

// 測試位置：一樓正殿中央走道（室內、有燭光）；HALL_DARK 是把所有點光源關掉的同一位置。
const HALL = [0, 0.9, -19];      // 鬼的位置；預設面向 +Z（面向殿門）
const ALTAR = [2.8, 0.9, -24.8]; // 靠近供桌燭火（香爐東側）
const PILLAR = [5.08, 0.9, -18.15]; // 東側第一根柱子（5, -17.5，半徑 0.4）的正後方
const YARD = [0, null, 14];      // 廟埕（戶外、月光）

// light：'flash' 只有手電筒（點光源全關）｜'candle' 只有場景燭光（手電筒關）｜'both'｜'bright' 全亮檢查用
// cam：{ d 距離, a 繞鬼的角度（度，0＝正面）, aim 瞄準高度, eye 玩家腳底高度偏移 }
const S = (name, o = {}) => ({ name, variant: 'woman', pose: 'idle', at: HALL, yaw: 0, light: 'flash', d: 2, a: 0, aim: 1.35, ...o });
const SHOTS = [
  // ── 距離 ──
  S('woman-dist-0.6m', { d: 0.6, aim: 1.5 }),
  S('woman-dist-0.6m-look', { d: 0.6, aim: 1.56, look: 'camera' }),
  S('woman-dist-1m-look-eyes', { d: 1.0, aim: 1.5, look: 'camera', eyes: 1, light: 'candle' }),
  S('woman-dist-2m', { d: 2, aim: 1.2 }),
  S('woman-dist-6m', { d: 6, aim: 1.0 }),
  S('woman-dist-12m', { d: 12, aim: 1.0 }),
  // ── 光源 ──
  S('woman-light-flash-1.2m', { d: 1.2, aim: 1.45, light: 'flash' }),
  S('woman-light-candle-2m', { d: 2.0, aim: 1.3, light: 'candle', at: ALTAR, yaw: 180, a: 0 }),
  S('woman-light-candle-2m-look', { d: 2.0, aim: 1.3, light: 'candle', at: ALTAR, yaw: 180, a: 0, look: 'camera' }),
  S('woman-light-backlit-4m', { d: 4, aim: 1.2, light: 'candle', at: ALTAR, yaw: 0 }),
  S('woman-light-moon-5m', { d: 5, aim: 1.1, light: 'candle', at: YARD }),
  S('woman-bright-front', { d: 2.3, aim: 0.95, light: 'bright' }),
  S('woman-bright-side', { d: 2.3, aim: 0.95, a: 80, light: 'bright' }),
  S('woman-bright-back', { d: 2.3, aim: 0.95, a: 180, light: 'bright' }),
  S('woman-bright-face', { d: 0.55, aim: 1.56, a: 12, light: 'bright' }),
  S('woman-bright-hand', { d: 0.6, aim: 0.8, a: 55, light: 'bright' }),
  S('woman-face-flash-side', { d: 0.8, aim: 1.52, a: 30, look: 'camera' }),
  S('woman-cord-flash', { d: 0.75, aim: 0.86, a: 50 }),
  S('woman-cord-reach-flash', { pose: 'reach', d: 1.15, aim: 1.3, a: 8, look: 'camera' }),
  S('woman-diag-face', { d: 0.5, aim: 1.6, a: 8, light: 'bright', look: 'camera', hide: ['GhostHair'] }),
  S('woman-diag-chest', { d: 0.9, aim: 1.25, a: 15, light: 'bright', look: 'camera', hide: ['GhostHair'] }),
  // ── 姿勢 ──
  S('woman-pose-idle', { d: 2.6, aim: 1.0, a: 20 }),
  S('woman-pose-reach', { pose: 'reach', d: 2.4, aim: 1.15, a: 25 }),
  S('woman-pose-reach-close', { pose: 'reach', d: 1.0, aim: 1.4 }),
  S('woman-pose-crawl', { pose: 'crawl', d: 2.6, aim: 0.35, a: 30 }),
  S('woman-pose-crawl-front', { pose: 'crawl', d: 1.9, aim: 0.3 }),
  S('woman-pose-bowed', { pose: 'bowed', d: 2.6, aim: 0.9, a: 40 }),
  S('woman-pose-peek', { pose: 'peek', d: 3, aim: 1.2 }),
  S('woman-pose-peek-pillar', { pose: 'peek', at: PILLAR, d: 4.2, aim: 1.3, a: 6, look: 'camera' }),
  S('woman-pose-peekR-pillar', { pose: 'peekR', at: [4.92, 0.9, -18.15], d: 4.2, aim: 1.3, a: -6, look: 'camera' }),
  S('woman-pose-sit', { pose: 'sit', d: 2.4, aim: 0.8, a: 30 }),
  S('woman-pose-sit-bright', { pose: 'sit', d: 2.4, aim: 0.8, a: 60, light: 'bright' }),
  S('woman-pose-idle-bright', { d: 2.6, aim: 1.0, a: 20, light: 'bright' }),
  S('woman-pose-reach-bright', { pose: 'reach', d: 2.4, aim: 1.15, a: 25, light: 'bright' }),
  S('woman-pose-crawl-bright', { pose: 'crawl', d: 2.6, aim: 0.35, a: 60, light: 'bright' }),
  S('woman-pose-bowed-bright', { pose: 'bowed', d: 2.6, aim: 0.9, a: 60, light: 'bright' }),
  S('woman-pose-peek-bright', { pose: 'peek', d: 3, aim: 1.2, light: 'bright' }),
  S('woman-walk-chase', { chase: true, d: 3, aim: 1.1, a: 15 }),
  // ── 介面 ──
  S('woman-lookat-twist', { d: 2, aim: 1.4, a: 165, look: 'camera' }),
  S('woman-lookat-side', { d: 1.6, aim: 1.45, a: 70, look: 'camera' }),
  S('woman-glitch', { d: 2, aim: 1.25, glitch: 1, wait: 700 }),
  S('woman-fade-50', { d: 2, aim: 1.25, fade: 0.5 }),
  S('woman-fade-20', { d: 2, aim: 1.25, fade: 0.2 }),
  // ── shadow ──
  S('shadow-dist-2m', { variant: 'shadow', d: 2, aim: 1.2 }),
  S('shadow-dist-6m', { variant: 'shadow', d: 6, aim: 1.0 }),
  S('shadow-dist-12m', { variant: 'shadow', d: 12, aim: 1.0 }),
  S('shadow-dist-25m-moon', { variant: 'shadow', d: 25, aim: 1.0, at: YARD, light: 'candle' }),
  S('shadow-candle-8m', { variant: 'shadow', d: 8, aim: 1.1, light: 'candle', at: ALTAR }),
  S('shadow-bright', { variant: 'shadow', d: 2.6, aim: 0.95, a: 25, light: 'bright' }),
  S('shadow-eyes-6m', { variant: 'shadow', d: 6, aim: 1.1, light: 'candle', eyes: 1 }),
  S('shadow-pose-peek', { variant: 'shadow', pose: 'peek', d: 5, aim: 1.1, light: 'candle', at: ALTAR }),
  S('shadow-pose-crawl', { variant: 'shadow', pose: 'crawl', d: 4, aim: 0.4, a: 40, light: 'candle', at: ALTAR }),
  S('shadow-pose-reach', { variant: 'shadow', pose: 'reach', d: 4, aim: 1.1, a: 40, light: 'candle', at: ALTAR }),
  S('shadow-pose-bowed', { variant: 'shadow', pose: 'bowed', d: 4, aim: 0.9, a: 60, light: 'candle', at: ALTAR }),
  // ── child ──
  S('child-dist-0.8m', { variant: 'child', d: 0.8, aim: 1.1 }),
  S('child-dist-2m', { variant: 'child', d: 2, aim: 0.8 }),
  S('child-dist-6m', { variant: 'child', d: 6, aim: 0.8 }),
  S('child-dist-12m', { variant: 'child', d: 12, aim: 0.8 }),
  S('child-candle-3m', { variant: 'child', d: 3, aim: 0.8, light: 'candle', at: ALTAR, yaw: 180 }),
  S('child-backlit-4m', { variant: 'child', d: 4, aim: 0.8, light: 'candle', at: ALTAR }),
  S('child-bright', { variant: 'child', d: 2, aim: 0.7, a: 25, light: 'bright' }),
  S('child-bright-back', { variant: 'child', d: 2, aim: 0.7, a: 180, light: 'bright' }),
  S('child-pose-reach', { variant: 'child', pose: 'reach', d: 2, aim: 0.8, a: 30 }),
  S('child-pose-crawl', { variant: 'child', pose: 'crawl', d: 2, aim: 0.3, a: 30 }),
  S('child-pose-bowed', { variant: 'child', pose: 'bowed', d: 2, aim: 0.6, a: 50 }),
  S('child-pose-peek', { variant: 'child', pose: 'peek', d: 2.5, aim: 0.8 }),
  S('child-pose-sit', { variant: 'child', pose: 'sit', d: 2.2, aim: 0.6, a: 30 }),
  S('child-eyes-4m', { variant: 'child', d: 4, aim: 0.8, light: 'candle', eyes: 1 }),
  // ── 多實例同場 ──
  S('multi-instances', { d: 5, aim: 1.0, extra: [['shadow', [-2.2, 0.9, -21], 'idle'], ['child', [1.4, 0.9, -19.6], 'idle'], ['woman', [3, 0.9, -21.5], 'bowed']] }),
];

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.stack || e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const report = [];
try {
  await page.goto((process.env.GAME_URL || 'http://127.0.0.1:5178/') + '?auto&map=temple&dev');
  await page.waitForFunction(() => window.__game?.story && window.__game.running, null, { timeout: 240000 });
  await page.addStyleTag({ content: 'body>*:not(canvas){display:none!important}' });
  await page.evaluate(async () => {
    const g = window.__game;
    for (let i = 0; i < 30 && g.story.modal; i++) { if (g.story.modal.options?.length === 1) g.story.choose(0); else break; }
    g.story.modal = null;
    const mod = await import('/src/maps/temple/ghost.js');
    const T = (window.__ghostTest = { mod, list: [], time: 0 });
    const prev = g.onFrame;
    g.onFrame = (dt) => { prev?.(dt); for (const e of T.list) { if (e.look === 'camera') e.ghost.lookAt?.(g.camera.position); e.ghost.update(g.time, !!e.chase); } };
  });
  const base = await page.evaluate(() => { const i = window.__game.renderer.info.render; return { calls: i.calls, tris: i.triangles }; });
  for (const shot of SHOTS) {
    if (only.length && !only.some((o) => shot.name.includes(o))) continue;
    const info = await page.evaluate((s) => {
      const g = window.__game, T = window.__ghostTest;
      for (const e of T.list) { if (e.ghost.dispose) e.ghost.dispose(); else g.map.scene.remove(e.ghost.root); }
      T.list.length = 0;
      const y = s.at[1] ?? g.map.world.probe(s.at[0], s.at[2], 1.5).g;
      const yaw = (s.yaw * Math.PI) / 180;
      const add = (variant, p, pose, o = {}) => {
        const ghost = T.mod.createGhost(g.assets, { variant });
        ghost.root.position.set(p[0], p[1], p[2]); ghost.root.rotation.y = o.yaw ?? yaw; ghost.root.visible = true;
        g.map.scene.add(ghost.root);
        ghost.setPose?.(pose); if (o.fade != null) ghost.setFade?.(o.fade); if (o.glitch) ghost.setGlitch?.(o.glitch); if (o.eyes != null) ghost.setEyes?.(o.eyes); for (const n of o.hide || []) { const m = ghost.root.getObjectByName(n); if (m) m.visible = false; }
        T.list.push({ ghost, look: o.look, chase: o.chase });
        return ghost;
      };
      const main = add(s.variant, [s.at[0], y, s.at[2]], s.pose, s);
      for (const [v, p, pose] of s.extra || []) add(v, p, pose);
      const ang = yaw + (s.a * Math.PI) / 180;
      const px = s.at[0] + Math.sin(ang) * s.d, pz = s.at[2] + Math.cos(ang) * s.d;
      const py = s.at[1] ?? g.map.world.probe(px, pz, 1.5).g;
      const pitch = Math.atan2(y + s.aim - (py + 1.66), s.d);
      g.player.fly = false;
      g.player.teleport(px, py, pz, Math.atan2(px - s.at[0], pz - s.at[2]), pitch);
      g.player.flashOn = s.light === 'flash' || s.light === 'both';
      g.player.flashPower = g.player.flashOn ? 1 : 0;
      g.map.setFullBright(s.light === 'bright');
      g.map.fx.lightMul = s.light === 'flash' ? 0 : 1;
      return { source: main.source || null, clips: main.clips?.length ?? 0, methods: ['update', 'setPose', 'setFade', 'lookAt', 'setGlitch'].filter((k) => typeof main[k] === 'function') };
    }, shot);
    await page.waitForTimeout(shot.wait ?? 1400);
    const stat = await page.evaluate(() => { const g = window.__game, i = g.renderer.info.render; return { fps: Math.round(g.fps), calls: i.calls, tris: i.triangles }; });
    await page.screenshot({ path: path.join(out, shot.name + '.png') });
    report.push({ name: shot.name, ...info, ...stat });
    console.log(shot.name, JSON.stringify({ ...stat, methods: info.methods.length }));
  }
  // 單一變體的成本：把鬼放在鏡頭正前方與移出場景時的差值
  if (!only.length || only.includes('cost')) {
    for (const variant of ['woman', 'shadow', 'child']) {
      const cost = await page.evaluate(async (variant) => {
        const g = window.__game, T = window.__ghostTest;
        for (const e of T.list) g.map.scene.remove(e.ghost.root);
        T.list.length = 0;
        g.map.setFullBright(false); g.map.fx.lightMul = 1; g.player.flashOn = true;
        g.player.teleport(0, 0.9, -16, 0, -0.2);
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        await wait(400);
        const a = { calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles };
        const ghost = T.mod.createGhost(g.assets, { variant });
        ghost.root.position.set(0, 0.9, -19); ghost.root.visible = true; g.map.scene.add(ghost.root); T.list.push({ ghost });
        await wait(600);
        const b = { calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles };
        let meshTris = 0, meshes = 0; const mats = new Set();
        ghost.root.traverse((o) => { if (o.isMesh && o.visible) { meshes++; mats.add(o.material); const geo = o.geometry; meshTris += (geo.index ? geo.index.count : geo.attributes.position.count) / 3; } });
        return { variant, meshes, materials: mats.size, modelTris: Math.round(meshTris), addedCalls: b.calls - a.calls, addedTris: b.tris - a.tris };
      }, variant);
      report.push(cost); console.log('cost', JSON.stringify(cost));
    }
  }
} catch (e) { errors.push(e.stack || String(e)); }
finally {
  fs.writeFileSync(path.join(out, 'ghost-shots.json'), JSON.stringify({ report, errors }, null, 2));
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
}
if (errors.length) process.exitCode = 1;
