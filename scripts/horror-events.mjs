// horror（恐怖導演）驗收：逐一觸發每張地圖上的每個環境事件，確認無例外、截圖到 artifacts/horror/。
// 用法：node scripts/horror-events.mjs [home|road|temple ...] [--only=id,id]
import fs from 'node:fs';
import { launch, enter, shot, OUT } from './horror-lib.mjs';

const args = process.argv.slice(2);
const only = (args.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const maps = args.filter((a) => !a.startsWith('--'));
const PI = Math.PI;

// 每個事件的測試站位：at = [x, y(null=貼地), z, yaw, pitch]；pre = 觸發後先快轉幾秒；until = 等到條件成立再截圖；
// aim = 截圖前把視角轉向事件焦點；turn = 觸發後把玩家轉過去（模擬回頭）；post = 放開凍結後再跑幾秒讓事件收尾
const HALL = [0, 0.9, -18, 0, -0.05];
const ROAD = [0, null, 20, 0, -0.03];
const DESK = [0, 0, -0.5, 0, -0.35];
const figure = 's.figures.some(f => f.active && f.visible)';
const PLAN = {
  temple: {
    setup: 'const s = g.story; s.state.flags.incense = true; s.state.chapter = 3; s.sync();',
    events: {
      turn_behind: { at: HALL, until: figure, aim: true, post: 4 },
      far_watcher: { at: [0, 0.9, -13.5, 0, 0], until: figure, aim: true, post: 8 },
      closer: { at: [0, 0.9, -13.5, 0, 0], until: figure, aim: true, post: 3, extra: 'closer' },
      peek: { at: [0, 0.9, -14, 0, 0], pre: 1.2, aim: true, post: 12 },
      edge_feet: { at: [0, 0.9, -18, 0, -0.22], pre: 0.3, aim: false, post: 14, also: 'aimed' },
      door_cross: { at: [0, null, 3, 0, 0.06], until: 's.figures.some(f => f.active && Math.abs(f.pos[0] + 0.6) < 0.55)', step: 0.03, max: 8, aim: true, post: 6 },
      reading_face: { at: HALL, pre: 0.1, aim: true, post: 3 },
      neck_breath: { at: HALL, pre: 0.5, turn: PI, until: 's.focus', aim: true, post: 5 },
      flash_fail: { at: HALL, until: figure + ' && s.flashMul > 0.9', max: 9, aim: true, post: 5 },
      candles_out: { at: [0, 0.9, -20, 0, 0.05], pre: 3.2, aim: false, post: 12, also: 'dark:5.5' },
      statues_stare: { at: [0, 0.9, -24, 0, 0.12], pre: 7, aim: false, post: 10 },
      knock_follow: { at: HALL, pre: 1, post: 22, noShot: true },
      wet_prints: { at: HALL, pre: 4.5, aim: true, post: 12 },
      handprints: { at: [-5.6, 0.9, -15.2, PI, -0.2], pre: 0.2, aim: true, post: 3 },
      crypt_door: { at: [55, -7, -17, 0, -0.05], pre: 14, aim: true, post: 14 },
      lost_shoe: { at: HALL, pre: 0.2, aim: true, post: 4 },
      marble: { at: HALL, pre: 1.6, aim: true, post: 6 },
      fa_swell: { at: HALL, pre: 1.8, post: 5 }, fa_slam: { at: HALL, pre: 0.3, post: 4, noShot: true }, fa_whisper: { at: HALL, pre: 0.3, post: 3, noShot: true },
      fa_hum: { at: HALL, pre: 0.3, post: 7, noShot: true }, fa_steps: { at: HALL, pre: 0.6, post: 4, noShot: true }, dead_silence: { at: HALL, pre: 0.3, post: 9, noShot: true },
      fa_howl: { at: HALL, pre: 0.3, post: 6, noShot: true }, fa_sob: { at: HALL, pre: 0.3, post: 7, noShot: true },
    },
  },
  road: {
    setup: 'g.story.state.road.step = 2; g.story.sync(); g.player.flashOn = true;',
    events: {
      turn_behind: { at: ROAD, until: figure, aim: true, post: 4 },
      far_watcher: { at: ROAD, until: figure, aim: true, post: 8 },
      closer: { at: ROAD, until: figure, aim: true, post: 3, extra: 'closer' },
      peek: { at: [-2, null, 2.6, 0.95, 0], pre: 1.2, aim: true, post: 12 },
      edge_feet: { at: [0, null, 20, 0, -0.22], pre: 0.3, post: 14, also: 'aimed' },
      door_cross: { at: [0, null, 12, 0, 0], pre: 0.9, aim: true, post: 8 },
      reading_face: { at: ROAD, pre: 0.1, aim: true, post: 3 },
      neck_breath: { at: ROAD, pre: 0.5, turn: PI, until: 's.focus', aim: true, post: 5 },
      flash_fail: { at: ROAD, until: figure + ' && s.flashMul > 0.9', max: 9, aim: true, post: 5 },
      knock_follow: { at: ROAD, pre: 1, post: 22, noShot: true },
      wet_prints: { at: ROAD, pre: 4.5, aim: true, post: 12 },
      handprints: { at: [-3.2, null, 4.6, 1.0, -0.15], pre: 0.2, aim: true, post: 3 },
      lost_shoe: { at: ROAD, pre: 0.2, aim: true, post: 4 },
      road_faces: { at: [-1.5, null, 9, 0.2, 0], pre: 3, aim: true, post: 6, also: 'wide' },
      road_shelter: { at: [-1, null, 13, 0, 0], pre: 0.3, aim: true, post: 6 },
      road_effigies: { at: [8.6, null, -16.2, 1.28 + PI, 0], pre: 3.2, aim: false, turnAfter: -PI, post: 10 },
      road_car: { at: [-2.5, null, 22, PI, -0.05], until: 's.figures.some(f => f.active && Math.abs(f.pos[0] + 4.1) < 0.12)', step: 0.03, max: 3, post: 3, also: 'second' },
      fa_swell: { at: ROAD, pre: 1.8, post: 5 }, fa_slam: { at: ROAD, pre: 0.3, post: 4, noShot: true }, fa_whisper: { at: ROAD, pre: 0.3, post: 3, noShot: true },
      fa_hum: { at: ROAD, pre: 0.3, post: 7, noShot: true }, fa_steps: { at: ROAD, pre: 0.6, post: 4, noShot: true }, dead_silence: { at: ROAD, pre: 0.3, post: 9, noShot: true },
      fa_howl: { at: ROAD, pre: 0.3, post: 6, noShot: true }, fa_sob: { at: ROAD, pre: 0.3, post: 7, noShot: true },
    },
  },
  home: {
    setup: 'g.story.state.home.step = 3; g.story.sync();',
    events: {
      home_door_feet: { at: [1.3, 0, 1.7, PI, -0.5], pre: 2.6, aim: true, post: 24 },
      home_tv: { at: [1.3, 0, -0.5, -PI / 2 + 0.45, -0.22], pre: 4, aim: false, post: 20 },
      home_window: { at: [0.4, 0, 0.9, 1.3, 0], pre: 3, aim: true, post: 4 },
      home_lamp: { at: DESK, pre: 0.45, post: 4 },
      home_sitter: { setup: 'g.story.state.home.step = 4; g.story.sync(); g.horror.debug.run(4.5);', at: [0.6, 0, -0.4, -1.3, -0.1], pre: 0.4, aim: true, post: 5 },
      handprints: { at: [0.75, 0, -1.6, 0, 0.05], pre: 0.3, aim: true, post: 3 },
      lost_shoe: { at: [1.3, 0, 2.1, PI, -0.6], pre: 0.2, aim: true, post: 4 },
      wet_prints: { at: [0, 0, -1.6, PI, -0.4], pre: 4.2, aim: true, post: 10 },
      neck_breath: { at: DESK, pre: 0.5, turn: PI, until: 's.focus', aim: true, post: 5 },
      knock_follow: { at: DESK, pre: 1, post: 22, noShot: true },
      fa_swell: { at: DESK, pre: 1.8, post: 5 }, fa_whisper: { at: DESK, pre: 0.3, post: 3, noShot: true },
      fa_hum: { at: DESK, pre: 0.3, post: 7, noShot: true }, fa_steps: { at: DESK, pre: 0.6, post: 4, noShot: true }, dead_silence: { at: DESK, pre: 0.3, post: 9, noShot: true }, fa_sob: { at: DESK, pre: 0.3, post: 7, noShot: true },
    },
  },
};

const { browser, page, errors } = await launch();
const results = [];
const ev = (fn, arg) => page.evaluate(fn, arg);
const frames = (n = 3) => ev((n) => new Promise((res) => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

try {
  for (const map of maps.length ? maps : Object.keys(PLAN)) {
    const plan = PLAN[map];
    await enter(page, map, '&hseed=11');
    await ev((code) => { const g = window.__game; new Function('g', code)(g); }, plan.setup);
    const listed = await ev(() => window.__game.horror.debug.list().map((e) => e.id));
    const missing = listed.filter((id) => !plan.events[id]);
    if (missing.length) console.log(`NOTE ${map}: no test plan for`, missing.join(', '));
    for (const [id, c] of Object.entries(plan.events)) {
      if (only.length && !only.includes(id)) continue;
      const r = { map, id, started: false, shots: [], pass: true, note: '' };
      results.push(r);
      if (!listed.includes(id)) { r.pass = false; r.note = 'not registered on this map'; console.log('FAIL', map, id, r.note); continue; }
      if (c.setup) await ev((code) => { const g = window.__game; new Function('g', code)(g); }, c.setup);
      await ev(([at]) => {
        const g = window.__game, d = g.horror.debug; d.hold = false; d.stop();
        const y = at[1] ?? g.map.world.probe(at[0], at[2], 2).g;
        g.player.keys = Object.create(null); g.player.teleport(at[0], y, at[2], at[3], at[4]);
        if (g.map.id !== 'home') { g.player.flashOn = true; g.player.flashPower = 1; }
        d.run(0.4);
      }, [c.at]);
      r.started = await ev((id) => window.__game.horror.debug.trigger(id), id);
      if (!r.started) { r.pass = false; r.note = 'start refused'; console.log('FAIL', map, id, r.note); continue; }
      if (c.pre) await ev((t) => window.__game.horror.debug.run(t), c.pre);
      if (c.turn) await ev((a) => { const g = window.__game; g.player.yaw += a; g.horror.debug.run(0.25); }, c.turn);
      if (c.turnAfter) await ev((a) => { const g = window.__game; g.player.yaw += a; g.player.flashQuat.copy(g.camera.quaternion); g.horror.debug.run(0.05); }, c.turnAfter);
      if (c.until) {
        const ok = await ev(([cond, max, step]) => { const d = window.__game.horror.debug, test = new Function('s', 'return ' + cond); for (let t = 0; t < max; t += step) { if (test(d.state)) return true; d.run(step, step); } return !!test(d.state); }, [c.until, c.max || 6, c.step || 0.1]);
        if (!ok) { r.pass = false; r.note = 'condition never met: ' + c.until; }
      }
      if (!c.noShot) {
        await ev((aim) => { const d = window.__game.horror.debug; d.hold = true; if (aim) d.aim(); }, !!c.aim);
        await frames(4);
        r.shots.push(await shot(page, `${map}_${id}`));
        if (c.also === 'wide') { await ev(() => { const g = window.__game; g.player.yaw += 0.35; g.player.pitch = 0.02; }); await frames(4); r.shots.push(await shot(page, `${map}_${id}_wide`)); }
        if (c.also === 'second') { await ev(() => { const d = window.__game.horror.debug; d.hold = false; d.run(0.5, 0.03); d.hold = true; }); await frames(4); r.shots.push(await shot(page, `${map}_${id}_2`)); }
        if (c.also === 'aimed') { await ev(() => window.__game.horror.debug.aim()); await frames(4); r.shots.push(await shot(page, `${map}_${id}_aimed`)); }
        if (c.also?.startsWith('dark:')) { await ev((t) => { const d = window.__game.horror.debug; d.hold = false; d.run(t); d.hold = true; }, +c.also.slice(5)); await frames(4); r.shots.push(await shot(page, `${map}_${id}_dark`)); }
        if (c.extra === 'closer') { // 移開視線 → 它靠近 → 再看回去
          for (let k = 1; k <= 3; k++) {
            await ev(() => { const g = window.__game, d = g.horror.debug; d.hold = false; d.run(0.5); g.player.yaw += Math.PI; d.run(1.2); d.hold = true; d.aim(); });
            await frames(4); r.shots.push(await shot(page, `${map}_${id}_hop${k}`));
          }
        }
      }
      const st = await ev((t) => { const d = window.__game.horror.debug; d.hold = false; d.run(t); const s = d.state; if (s.active.length) { s.stillActive = [...s.active]; d.stop(); } return s; }, c.post || 3);
      if (st.faults) { r.pass = false; r.note += ' faults: ' + st.lastError.split('\n').slice(0, 3).join(' | '); }
      if (st.stillActive?.includes(id)) r.note += ' (still running after post-roll; stopped)';
      r.sfx = st.sfx;
      console.log(r.pass ? 'PASS' : 'FAIL', map, id, r.note, r.sfx.length ? `sfx=${r.sfx.slice(-6).join(',')}` : '');
    }
  }
} catch (e) { errors.push(e.stack || String(e)); } finally {
  fs.writeFileSync(`${OUT}/events-results.json`, JSON.stringify({ results, errors }, null, 2));
  console.log('ERRORS', JSON.stringify(errors));
  const bad = results.filter((r) => !r.pass);
  console.log(`${results.length - bad.length}/${results.length} events passed`);
  await browser.close();
  if (errors.length || bad.length) process.exitCode = 1;
}
