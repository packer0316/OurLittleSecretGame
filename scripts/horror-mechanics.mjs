// horror（恐怖導演）驗收：核心機制照「正式遊玩的條件」運作（不是強制擺位），以及幾項保證：
//  1. ?auto 下環境事件預設關閉   2. 轉身鬼由玩家的轉頭觸發   3. 闔上文件的那一刻   4. 站著不動的呼吸
//  5. 幽影第一次出現不卡頓（已暖機）   6. 換地圖時清乾淨   7. 鬼模型合約不可用時的程序化黑影回退
// 用法：node scripts/horror-mechanics.mjs
import fs from 'node:fs';
import { launch, enter, shot, dismiss, OUT, BASE } from './horror-lib.mjs';

const { browser, page, errors } = await launch();
const results = [];
const ev = (fn, arg) => page.evaluate(fn, arg);
const frames = (n = 4) => ev((n) => new Promise((res) => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const test = async (name, fn) => {
  try { const note = await fn(); results.push({ name, pass: true, note }); console.log('PASS', name, note || ''); } catch (e) { results.push({ name, pass: false, error: String(e.message || e) }); console.log('FAIL', name, String(e.message || e)); }
};
const must = (cond, msg) => { if (!cond) throw new Error(msg); };
const setupTemple = () => ev(() => { const g = window.__game, s = g.story; s.state.flags.incense = true; s.state.chapter = 3; s.sync(); g.player.keys = Object.create(null); g.player.teleport(0, 0.9, -18, 0, -0.05); g.player.flashOn = true; g.player.flashPower = 1; g.horror.debug.run(0.3); });

try {
  await enter(page, 'temple');
  await test('?auto without &horror: ambient scheduler is off and nothing fires in 150 s', async () => {
    await setupTemple();
    const r = await ev(() => {
      const g = window.__game, d = g.horror.debug; const seen = new Set();
      for (let t = 0; t < 150; t += 0.5) { g.player.keys.KeyW = (t % 9) < 4; g.player.yaw += 0.2; d.run(0.5); for (const id of d.state.active) seen.add(id); }
      g.player.keys = Object.create(null);
      const s = d.state; return { ambient: s.ambient, seen: [...seen], shown: s.figures.filter((f) => f.visible).length, faults: s.faults, dread: s.dread };
    });
    must(r.ambient === false, 'ambient should be off under ?auto');
    must(!r.seen.length && !r.shown, 'events fired: ' + r.seen);
    must(!r.faults, 'faults');
    return `dread 仍由劇情決定 = ${r.dread.toFixed(2)}`;
  });

  await test('turn ghost: placed where the turning view is about to sweep, vanishes after being seen', async () => {
    await setupTemple();
    const r = await ev(() => {
      const g = window.__game, d = g.horror.debug;
      if (!d.trigger('turn_behind', true)) return { err: 'refused' };
      d.run(0.6);
      const before = d.state.figures.some((f) => f.active);
      let placedAt = -1, bearing = null, firstSeen = -1;
      for (let i = 0; i < 40; i++) { // 向左轉身，約 3.6 rad/s
        g.player.yaw += 0.12; d.run(1 / 30, 1 / 30);
        const f = d.state.figures.find((x) => x.active);
        if (f && placedAt < 0) { placedAt = i; const dx = f.pos[0] - g.player.pos.x, dz = f.pos[2] - g.player.pos.z; let b = Math.atan2(-dx, -dz) - g.player.yaw; bearing = Math.atan2(Math.sin(b), Math.cos(b)); }
        if (f && f.visibleNow) { firstSeen = i; break; }
      }
      d.hold = true;
      return { before, placedAt, bearing, firstSeen, sfx: d.state.sfx };
    });
    must(!r.err, 'event refused to start');
    must(!r.before, 'figure was placed before the player turned');
    must(r.placedAt >= 0, 'no figure placed during the turn');
    must(r.bearing > 0.6, 'figure was not ahead of the turn direction: bearing ' + r.bearing);
    must(r.firstSeen > r.placedAt, 'the turn never swept onto the figure');
    await frames(4); await shot(page, 'mech_turn_seen');
    const end = await ev(() => { const d = window.__game.horror.debug; d.hold = false; d.run(1.5); const s = d.state; return { visible: s.figures.some((f) => f.visible), sfx: s.sfx, active: s.active }; });
    must(end.sfx.includes('stinger'), 'no stinger: ' + end.sfx);
    must(!end.visible, 'figure did not vanish after being seen');
    return `轉身第 ${r.placedAt} 幀放置（方位 ${r.bearing.toFixed(2)} rad），第 ${r.firstSeen} 幀進入視野`;
  });

  await test('reading face: appears on the frame the document closes, gone within half a second', async () => {
    await setupTemple();
    const r = await ev(() => {
      const g = window.__game, d = g.horror.debug;
      d.trigger('reading_face', true); g.story.journal(); d.run(3.2);
      const during = d.state.figures.some((f) => f.visible);
      g.story.choose(0); d.run(2 / 30, 1 / 30);
      const f = d.state.figures.find((x) => x.active && x.visible);
      const dist = f ? Math.hypot(f.pos[0] - g.player.pos.x, f.pos[2] - g.player.pos.z) : -1;
      d.hold = true;
      return { during, dist, sfx: d.state.sfx, glitch: d.state.glitch };
    });
    must(!r.during, 'figure visible while still reading');
    must(r.dist > 0 && r.dist < 4, 'no figure in front after closing: ' + r.dist);
    must(r.sfx.includes('stinger') && r.glitch > 0, 'no stinger / glitch');
    await frames(4); await shot(page, 'mech_reading_face');
    const end = await ev(() => { const d = window.__game.horror.debug; d.hold = false; d.run(0.6, 1 / 30); return d.state.figures.some((f) => f.visible); });
    must(!end, 'figure lingered');
    return `距離 ${r.dist.toFixed(2)} m`;
  });

  await test('neck breath: standing still brings the breath; turning around finds wet prints or the figure', async () => {
    await setupTemple();
    const r = await ev(() => {
      const g = window.__game, d = g.horror.debug;
      d.trigger('neck_breath', true); const n0 = d.state.sfx.filter((k) => k === 'breath').length;
      let started = -1; for (let t = 0; t < 30; t += 0.5) { d.run(0.5); if (d.state.active.includes('neck_breath')) { started = t; break; } }
      const n1 = d.state.sfx.filter((k) => k === 'breath').length;
      g.player.yaw += Math.PI; d.run(0.3);
      return { started, breaths: n1 - n0, focus: d.state.focus, figure: d.state.figures.some((f) => f.active) };
    });
    must(r.started >= 0, 'never started while standing still');
    must(r.breaths >= 1, 'no breath sound');
    must(r.focus, 'nothing staged behind the player');
    await ev(() => { const g = window.__game, d = g.horror.debug; d.hold = true; d.aim(); }); await frames(4); await shot(page, 'mech_neck_breath_after');
    await ev(() => { const d = window.__game.horror.debug; d.hold = false; d.run(4); d.stop(); });
    return `靜止 ${r.started}s 後出現；回頭看到的是${r.figure ? '人影' : '一雙濕腳印'}`;
  });

  await test('no hitch when an apparition is first shown (pre-warmed at attach)', async () => {
    await page.goto(`${BASE}?auto&map=temple`);
    await page.waitForFunction(() => window.__game?.running && window.__game.story && window.__game.map, null, { timeout: 240000 });
    await dismiss(page); await setupTemple(); await page.waitForTimeout(2500);
    const measure = (n) => ev((n) => new Promise((res) => { const ts = []; let last = performance.now(); const f = (now) => { ts.push(now - last); last = now; if (ts.length >= n) { ts.sort((a, b) => a - b); res({ max: ts[ts.length - 1], med: ts[ts.length >> 1] }); } else requestAnimationFrame(f); }; requestAnimationFrame((now) => { last = now; requestAnimationFrame(f); }); }), n);
    const base = await measure(90);
    const out = [];
    for (const id of ['turn_behind', 'far_watcher', 'edge_feet', 'peek', 'wet_prints', 'handprints', 'lost_shoe', 'marble']) {
      await ev((id) => { const g = window.__game, d = g.horror.debug; d.hold = false; d.stop(); g.player.teleport(0, 0.9, -18 + Math.random(), 0, -0.05); d.trigger(id); d.hold = true; d.aim(); }, id);
      const m = await measure(20); out.push(`${id} ${m.max.toFixed(0)}ms`);
      must(m.max < Math.max(90, base.max * 2.5), `hitch on first ${id}: ${m.max.toFixed(1)} ms (baseline max ${base.max.toFixed(1)}, median ${base.med.toFixed(1)})`);
    }
    await ev(() => { const d = window.__game.horror.debug; d.hold = false; d.stop(); });
    return `基準中位 ${base.med.toFixed(1)}ms／最差 ${base.max.toFixed(1)}ms；首次顯示後 20 幀內最差：${out.join('、')}`;
  });

  await test('changing maps detaches cleanly and attaches the next map', async () => {
    await ev(() => window.__enter('home'));
    await page.waitForFunction(() => window.__game?.running && window.__game.map?.id === 'home' && window.__game.story?.state?.scene === 'home', null, { timeout: 240000 });
    await dismiss(page);
    const r = await ev(() => { const g = window.__game, d = g.horror.debug; d.run(1); const s = d.state; return { map: s.map, faults: s.faults, err: s.lastError, ids: d.list().map((e) => e.id), rush: !!document.getElementById('horror-rush'), u: [g.film.uniforms.dread.value, g.film.uniforms.glitch.value], leftovers: g.map.scene.getObjectByName('HorrorWetPrints') ? 1 : 0, shown: s.figures.filter((f) => f.visible).length }; });
    must(r.map === 'home' && !r.faults, 'bad state after switching: ' + r.err);
    must(r.ids.includes('home_tv') && !r.ids.includes('candles_out'), 'wrong event set: ' + r.ids);
    must(!r.rush, 'temple overlay left behind');
    must(r.leftovers === 1 && r.shown === 0, 'props not rebuilt for the new map or a figure is showing');
    return `home 事件 ${r.ids.length} 個`;
  });

  await test('fallback: procedural shadow figures work when the ghost contract is unavailable (&hfallback)', async () => {
    await page.goto(`${BASE}?auto&map=temple&hfallback`);
    await page.waitForFunction(() => window.__game?.running && window.__game.story && window.__game.map, null, { timeout: 240000 });
    await dismiss(page); await setupTemple();
    const api = await ev(() => window.__game.horror.debug.state.ghostApi);
    must(api === 'fallback', 'fallback not active: ' + api);
    for (const [id, at] of [['far_watcher', [0, 0.9, -13.5, 0, 0]], ['edge_feet', [0, 0.9, -18, 0, -0.22]], ['door_cross', [0, 0.9, -24, Math.PI, 0]], ['candles_out', [0, 0.9, -20, 0, 0]]]) {
      const r = await ev(([id, at]) => { const g = window.__game, d = g.horror.debug; d.hold = false; d.stop(); g.player.teleport(...at); d.run(0.3); const ok = d.trigger(id); d.run(id === 'candles_out' ? 7.6 : 0.5); d.hold = true; if (id !== 'edge_feet') d.aim(); return { ok, faults: d.state.faults, err: d.state.lastError }; }, [id, at]);
      must(r.ok && !r.faults, `${id}: ${r.ok ? r.err : 'refused'}`);
      await frames(4); await shot(page, `fallback_${id}`);
      const e2 = await ev(() => { const d = window.__game.horror.debug; d.hold = false; d.run(6); d.stop(); return d.state.faults; });
      must(!e2, `${id} faulted while finishing`);
    }
  });
} catch (e) { errors.push(e.stack || String(e)); } finally {
  fs.writeFileSync(`${OUT}/mechanics-results.json`, JSON.stringify({ results, errors }, null, 2));
  console.log('ERRORS', JSON.stringify(errors));
  const bad = results.filter((r) => !r.pass);
  console.log(`${results.length - bad.length}/${results.length} checks passed`);
  await browser.close();
  if (errors.length || bad.length) process.exitCode = 1;
}
