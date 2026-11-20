// 庭院組（court）：廟埕與香火安全區的回歸檢查。
// 用法：node scripts/court-check.mjs（需要 http://127.0.0.1:5178 的開發伺服器）
//   1. 山門與廟埕沒有燭火、沒有立牌告示（只剩建築匾額）。
//   2. 從山門走向天公爐，能對準爐緣刻字（rules）並讀到新文字。
//   3. 應聲之後，用實際走路（不是瞬移）退回天公爐／二樓小香爐，追逐會結束；HUD 寫的是「退回香火旁」。
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const out = 'artifacts/court'; fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [], results = [];
page.on('pageerror', (e) => errors.push(e.stack || e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const test = async (name, fn) => { try { const r = await fn(); results.push({ name, pass: true, r }); console.log('PASS', name, r ?? ''); } catch (e) { results.push({ name, pass: false, error: String(e) }); console.log('FAIL', name, String(e)); } };
const dismiss = async () => { for (let i = 0; i < 30; i++) { if (await page.evaluate(() => window.__game.story.modal?.options.length) !== 1) break; await page.evaluate(() => window.__game.story.choose(0)); } };
try {
  await page.goto('http://127.0.0.1:5178/?auto&map=temple');
  await page.waitForFunction(() => window.__game?.story && window.__game.running, null, { timeout: 240000 });
  await dismiss();

  await test('no candles or notice boards in the gate and courtyard', () => page.evaluate(() => {
    const g = window.__game, inYard = (p) => p.x > -30 && p.x < 30 && p.z > -7.4 && p.z < 30 && p.y < 5 && !(p.x > 16.5 && p.z < 3.8 && p.z > -5.5); // 戲台另算
    const flames = g.map.flames.filter((f) => inYard(f.sp.position)).length;
    const signs = []; g.map.scene.traverse((o) => { if (o.name === 'MountedSign') { const p = o.getWorldPosition(o.position.clone()); if (inYard(p)) signs.push(p.toArray().map((v) => v.toFixed(1)).join(',')); } });
    if (flames || signs.length) throw Error(`flames ${flames}, signs ${signs.join(' | ')}`);
    const sz = g.map.storyWorld.safeZones;
    return `safe zones ${sz.map((p) => p.toArray().join(',')).join(' / ')}`;
  }));

  await test('walk in from the gate and read the burner rim', async () => {
    const r = await page.evaluate(() => {
      const g = window.__game, pl = g.player, w = g.map.world; g.stop(); pl.teleport(0.2, 0.02, 20.5, 0, -0.12); pl.onGround = true;
      pl.keys = { KeyW: true }; let t = 0; while (t < 12 && pl.pos.z > 11.2) { pl.update(1 / 60, w); t += 1 / 60; } pl.keys = {};
      pl._syncCamera?.(0); g.camera.updateMatrixWorld(); const f = g.story.focused(); g.start();
      return { z: +pl.pos.z.toFixed(2), focused: f?.id, label: f?.label };
    });
    if (r.focused !== 'rules' || r.label !== '天公爐上的刻字') throw Error(JSON.stringify(r));
    await page.evaluate(() => window.__game.story.interact('rules'));
    const text = await page.evaluate(() => document.querySelector('#story-layer').innerText);
    if (!text.includes('爐緣') || !text.includes('門內喚你名，勿應') || !text.includes('香火旁')) throw Error(text);
    await page.screenshot({ path: out + '/check-rules.png' });
    await dismiss(); await page.evaluate(() => window.__game.story.modal && window.__game.story.choose(0));
    return r;
  });

  const runChase = (source, from, legs) => page.evaluate(([source, from, legs]) => {
    const g = window.__game, pl = g.player, w = g.map.world, s = g.story;
    s.modal = null; document.getElementById('story-layer').classList.add('hidden');
    g.stop(); pl.teleport(...from, 0, 0); pl.onGround = true; s.beginChase(source);
    const hud0 = document.getElementById('chase-hud').textContent, toast = document.getElementById('story-toast').textContent;
    let t = 0, hud = '';
    for (const [yaw, secs] of legs) {
      pl.yaw = (yaw * Math.PI) / 180; pl.keys = { KeyW: true, ShiftLeft: true };
      for (let i = 0; i < secs * 60 && s.chase; i++) { pl.update(1 / 60, w); s.chase && (s.chase.time = Math.min(s.chase.time, 1)); s.update(1 / 60); g.map.world && (s.chase && (s.world.ghost.root.position.set(pl.pos.x + 30, pl.pos.y, pl.pos.z))); t += 1 / 60; if (s.chase) hud = document.getElementById('chase-hud').textContent; }
    }
    pl.keys = {}; const ended = !s.chase, p = pl.pos.toArray().map((v) => +v.toFixed(2)); if (s.chase) s.endChase(false); g.start();
    return { ended, t: +t.toFixed(1), p, hud: hud || hud0, toast, deaths: s.state.deaths };
  }, [source, from, legs]);

  await test('courtyard chase ends beside the burner', async () => {
    // 從戲台台口往西走到天公爐（鬼被推到遠處，只測安全區本身）
    const r = await runChase('stage', [23, 0.58, 3.4], [[101.3, 30]]);
    if (!r.ended || !r.hud.includes('退回香火旁') || !r.toast.includes('天公爐')) throw Error(JSON.stringify(r));
    return r;
  });
  await test('upstairs chase ends at the small incense burner', async () => {
    const r = await runChase('divination', [-3, 6.9, -16.2], [[90, 10]]);
    if (!r.ended || !r.toast.includes('那爐香')) throw Error(JSON.stringify(r));
    return r;
  });
  await page.evaluate(() => { const g = window.__game; g.player.teleport(0, 0.02, 12.6, 0, 0.02); g.story.beginChase('stage'); });
  await page.waitForTimeout(900); await page.screenshot({ path: out + '/check-chase-hud.png' });
  await page.evaluate(() => window.__game.story.endChase(false)); await dismiss();
} catch (e) { errors.push(e.stack || String(e)); }
finally { fs.writeFileSync(out + '/check-results.json', JSON.stringify({ results, errors }, null, 2)); console.log('ERRORS', JSON.stringify(errors)); await browser.close(); }
if (errors.length || results.some((r) => !r.pass)) process.exitCode = 1;
