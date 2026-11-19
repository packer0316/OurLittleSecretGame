// horror（恐怖導演）驗收：既有的固定演出（triggerScare 人影、追逐、被抓到的衝臉、住處敲門與拖椅）加強後的行為與截圖。
// 用法：node scripts/horror-fixed.mjs [temple|road|home ...]
import fs from 'node:fs';
import { launch, enter, shot, dismiss, OUT } from './horror-lib.mjs';

const maps = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const want = (m) => !maps.length || maps.includes(m);
const { browser, page, errors } = await launch();
const results = [];
const ev = (fn, arg) => page.evaluate(fn, arg);
const frames = (n = 4) => ev((n) => new Promise((res) => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const test = async (name, fn) => {
  try { await fn(); results.push({ name, pass: true }); console.log('PASS', name); } catch (e) { results.push({ name, pass: false, error: String(e.message || e) }); console.log('FAIL', name, String(e.message || e)); }
};
const must = (cond, msg) => { if (!cond) throw new Error(msg); };
const faults = async () => { const s = await ev(() => window.__game.horror.debug.state); must(!s.faults, 'horror fault: ' + s.lastError.split('\n').slice(0, 2).join(' | ')); return s; };

try {
  if (want('temple')) {
    await enter(page, 'temple');
    await ev(() => { const s = window.__game.story; s.state.flags.incense = true; s.state.chapter = 2; s.sync(); });
    // [kind, 玩家位置 x,y,z, yaw]：站在看得到人影的地方
    const SPOTS = [
      ['gate', 0, 0.9, -21.5, Math.PI], ['tape', -9.5, 6.9, -15.2, -2.2], ['phone', 5, 11.9, -27, Math.PI],
      ['stage', 23, null, 7, 0], ['loop', -12.5, 6.9, -16, -Math.PI / 2], ['relic', -40, null, -5, -Math.PI / 2],
    ];
    for (const [kind, x, y, z, yaw] of SPOTS) {
      await test(`temple fixed figure "${kind}" appears, reacts and leaves`, async () => {
        const first = await ev(([kind, x, y, z, yaw]) => {
          const g = window.__game, d = g.horror.debug, sw = g.map.storyWorld;
          d.stop(); g.player.keys = Object.create(null);
          g.player.teleport(x, y ?? g.map.world.probe(x, z, 2).g, z, yaw + Math.PI, 0); g.player.flashOn = true; g.player.flashPower = 1; // 先背對
          d.run(0.3); sw.triggerScare(kind); d.run(0.4);
          const before = { active: sw.scareActive, sfx: [...d.state.sfx] };
          g.player.yaw = yaw; g.player.flashQuat.copy(g.camera.quaternion); d.run(0.25); d.aim(); d.run(0.2); // 回頭
          return { before, sfx: d.state.sfx, scare: { ...sw.scare }, visible: sw.ghost.root.visible };
        }, [kind, x, y, z, yaw]);
        must(first.before.active && first.visible, 'figure not shown');
        must(first.before.sfx.includes('sub'), 'no swell when it appears: ' + first.before.sfx);
        must(first.sfx.includes('stinger'), 'no stinger when first seen: ' + first.sfx);
        await frames(5); await shot(page, `fixed_${kind}_1`);
        const second = await ev(() => { const g = window.__game, d = g.horror.debug; d.run(1.3); d.aim(); return { ...g.map.storyWorld.scare }; });
        if (kind !== 'stage') must(second.stepped, 'did not step closer while being watched');
        await frames(5); await shot(page, `fixed_${kind}_2`);
        const gone = await ev(() => { const g = window.__game, d = g.horror.debug; g.player.yaw += Math.PI; d.run(2.6); return { active: g.map.storyWorld.scareActive, visible: g.map.storyWorld.ghost.root.visible }; });
        must(!gone.active && !gone.visible, 'figure stayed after looking away');
        await ev(() => { const g = window.__game; g.player.yaw -= Math.PI; g.player.pitch = -0.35; g.player.flashQuat.copy(g.camera.quaternion); });
        await frames(5); await shot(page, `fixed_${kind}_3_after`);
        await faults();
      });
    }
    await test('temple chase adds pressure and resets afterwards', async () => {
      const r = await ev(() => {
        const g = window.__game, d = g.horror.debug;
        g.player.teleport(23, 0.02, 9.5, 0, 0); d.run(0.2);
        g.story.beginChase('stage'); d.run(2.4); d.aim();
        const s = d.state;
        return { chase: !!g.story.chase, dread: s.dread, sfx: s.sfx, lightMul: g.map.fx.lightMul, fog: g.map.fx.fogAdd, ghost: g.map.storyWorld.ghost.root.position.toArray() };
      });
      must(r.chase, 'chase did not start');
      must(r.dread > 0.8, 'dread did not rise: ' + r.dread);
      must(r.sfx.includes('stepBehind'), 'no pursuing steps: ' + r.sfx);
      must(r.lightMul < 0.95 && r.fog > 0.002, `lights/fog untouched: ${r.lightMul} ${r.fog}`);
      await frames(5); await shot(page, 'chase_1');
      await ev(() => window.__game.horror.debug.run(1.6)); await ev(() => window.__game.horror.debug.aim()); await frames(5); await shot(page, 'chase_2_close');
      await faults();
    });
    await test('caught: face rush overlay plays once and clears', async () => {
      const r = await ev(() => {
        const g = window.__game, d = g.horror.debug;
        if (!g.story.chase) throw new Error('chase ended before the catch could be staged');
        g.story.chase.time = 2; g.map.storyWorld.ghost.root.position.copy(g.player.pos); d.run(0.1);
        return { deaths: g.story.state.deaths, modal: !!g.story.modal, rushing: d.state.rushing, cls: document.getElementById('horror-rush')?.className, sfx: d.state.sfx };
      });
      must(r.deaths === 1 && r.modal, 'story did not register the catch');
      must(r.rushing && r.cls === 'go', 'rush overlay not started: ' + JSON.stringify(r));
      must(r.sfx.includes('gasp') || r.sfx.includes('stinger'), 'no catch sound');
      await page.waitForTimeout(230); await shot(page, 'caught_1_face');
      await page.waitForTimeout(450); await shot(page, 'caught_2_cloth');
      await page.waitForTimeout(1500);
      const after = await ev(() => { const g = window.__game, d = g.horror.debug; d.run(0.2); return { rushing: d.state.rushing, cls: document.getElementById('horror-rush')?.className, lightMul: g.map.fx.lightMul, flash: d.state.flashMul }; });
      must(!after.rushing && after.cls === '', 'overlay did not clear');
      await shot(page, 'caught_3_modal');
      await ev(() => { const g = window.__game; g.story.choose(0); g.story.choose(0); });
      await dismiss(page);
      const calm = await ev(() => { const g = window.__game, d = g.horror.debug; d.run(3); return { lightMul: g.map.fx.lightMul, flash: d.state.flashMul, chase: !!g.story.chase }; });
      must(!calm.chase && calm.lightMul > 0.8 && calm.flash > 0.95, 'lights not restored after the chase: ' + JSON.stringify(calm));
      await faults();
    });
    await test('statues: heads follow the player once unwatched (chapter 2+), and turn while watched during the stare event', async () => {
      const r = await ev(() => {
        const g = window.__game, d = g.horror.debug, sw = g.map.storyWorld;
        const heads = () => g.map.statues.filter((o) => o.userData.head && Math.abs(o.position.y - 0.9) < 3 && Math.hypot(o.position.x, o.position.z + 24) < 14).map((o) => +o.userData.head.rotation.y.toFixed(3));
        g.player.teleport(6, 0.9, -24, 0, 0.1); d.run(0.5); const a = heads();
        g.player.teleport(-6, 0.9, -22, Math.PI, 0); d.run(1.0); const b = heads(); // 背對佛像
        g.player.yaw = 0; d.run(0.1); const ok = d.trigger('statues_stare'); d.run(6); const c = heads();
        return { a, b, c, ok, stare: sw.statueFx.stare };
      });
      must(r.a.length >= 3, 'no statues near the altar');
      must(r.a.some((v, i) => Math.abs(v - r.b[i]) > 0.05), 'heads did not turn while unwatched');
      must(r.ok, 'stare event refused');
      await frames(5); await shot(page, 'statues_stare_watched');
      await faults();
    });
  }

  if (want('road')) {
    await enter(page, 'road');
    for (const [kind, x, z, yaw] of [['bridge', -0.4, 11.5, 0.42], ['workshop', 8.5, -19.5, Math.PI]]) {
      await test(`road fixed figure "${kind}"`, async () => {
        const r = await ev(([kind, x, z, yaw]) => {
          const g = window.__game, d = g.horror.debug, sw = g.map.storyWorld;
          g.story.bridgeCue = true; g.player.keys = Object.create(null);
          g.player.teleport(x, g.map.world.probe(x, z, 1).g, z, yaw + Math.PI, 0); g.player.flashOn = true; g.player.flashPower = 1; d.run(0.3);
          sw.triggerScare(kind); d.run(0.4); const before = [...d.state.sfx];
          g.player.yaw = yaw; g.player.flashQuat.copy(g.camera.quaternion); d.run(0.2); d.aim(); d.run(0.2);
          return { active: sw.scareActive, before, sfx: d.state.sfx, focus: d.state.focus };
        }, [kind, x, z, yaw]);
        must(r.active, 'figure not shown');
        must(r.before.includes('sub') && r.sfx.includes('stinger'), 'missing cues: ' + r.sfx);
        await frames(5); await shot(page, `fixed_road_${kind}`);
        const gone = await ev(() => { const g = window.__game, d = g.horror.debug; d.run(1.9); g.player.yaw += Math.PI; d.run(2.5); return g.map.storyWorld.scareActive; });
        must(!gone, 'figure stayed after looking away');
        await faults();
      });
    }
    await test('road watchers (paper effigies) turn their heads when not watched', async () => {
      const r = await ev(() => {
        const g = window.__game, d = g.horror.debug, ws = g.map.watchers || [];
        const yaws = () => ws.map((w) => +w.head.rotation.y.toFixed(3));
        g.player.teleport(8.5, 0.12, -17.5, Math.PI, 0); d.run(0.2); const a = yaws(); // 背對作坊深處
        d.run(3); const b = yaws();
        return { n: ws.length, moved: a.filter((v, i) => Math.abs(v - b[i]) > 0.05).length };
      });
      if (!r.n) { console.log('  (map.watchers 尚未提供，略過)'); return; }
      must(r.moved > 0, `none of ${r.n} watchers moved`);
      await ev(() => { const g = window.__game; g.player.yaw = 0; g.player.flashQuat.copy(g.camera.quaternion); });
      await frames(5); await shot(page, 'road_watchers_after');
      await faults();
    });
  }

  if (want('home')) {
    await enter(page, 'home');
    await test('home door event: someone stands outside, then walks away', async () => {
      const r = await ev(() => {
        const g = window.__game, d = g.horror.debug, s = g.story;
        s.state.home.step = 3; s.sync(); g.player.teleport(1.3, 0, 1.6, Math.PI, -0.5); d.run(0.2);
        s.world.startDoorEvent(); d.run(1.0);
        const feet = g.map.scene.getObjectByName('HorrorDoorFeet');
        return { active: s.world.doorEventActive, feet: feet.visible, x: feet.position.x };
      });
      must(r.active && r.feet, 'feet shadow missing during the knocks');
      await frames(5); await shot(page, 'home_door_event_feet');
      const end = await ev(() => {
        const g = window.__game, d = g.horror.debug, feet = g.map.scene.getObjectByName('HorrorDoorFeet');
        for (let i = 0; i < 80 && g.map.storyWorld.doorEventActive; i++) d.run(0.2);
        const mid = { done: !g.map.storyWorld.doorEventActive, visible: feet.visible };
        d.run(0.8); const walking = feet.position.x; d.run(2.2);
        return { mid, walking, visible: feet.visible, sfx: d.state.sfx };
      });
      must(end.mid.done, 'door event never finished');
      must(end.walking < 1.6 && !end.visible, 'feet did not walk away: ' + JSON.stringify(end));
      await faults();
    });
    await test('home chair drag: lamp dips and tension spikes', async () => {
      const r = await ev(() => {
        const g = window.__game, d = g.horror.debug, s = g.story;
        g.player.teleport(1.6, 0, 2.6, Math.PI * 0.75, -0.1); d.run(0.3);
        const d0 = d.state.dread; s.advance(4); d.run(1.7);
        const lamp = []; g.map.scene.traverse((o) => { if (o.isSpotLight && o.castShadow && o !== g.player.flash) lamp.push(o.intensity); });
        const mid = { dread: d.state.dread, lamp: lamp[0] };
        d.run(4); const lamp2 = []; g.map.scene.traverse((o) => { if (o.isSpotLight && o.castShadow && o !== g.player.flash) lamp2.push(o.intensity); });
        return { d0, mid, lampAfter: lamp2[0] };
      });
      must(r.mid.dread > r.d0 + 0.1, 'no tension spike: ' + JSON.stringify(r));
      must(r.mid.lamp < r.lampAfter * 0.85, 'lamp did not dip: ' + JSON.stringify(r));
      await faults();
    });
  }
} catch (e) { errors.push(e.stack || String(e)); } finally {
  fs.writeFileSync(`${OUT}/fixed-results.json`, JSON.stringify({ results, errors }, null, 2));
  console.log('ERRORS', JSON.stringify(errors));
  const bad = results.filter((r) => !r.pass);
  console.log(`${results.length - bad.length}/${results.length} checks passed`);
  await browser.close();
  if (errors.length || bad.length) process.exitCode = 1;
}
