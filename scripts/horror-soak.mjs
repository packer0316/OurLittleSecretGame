// horror（恐怖導演）節奏驗收：開著環境事件（?auto&horror），模擬一個邊走邊張望的玩家數分鐘，
// 檢查沒有例外、進地圖的前 60 秒沒有硬驚嚇、同一招不連續出現、硬驚嚇之間有喘息，並量測導演每幀的成本。
// 用法：node scripts/horror-soak.mjs [home|road|temple ...] [--minutes=6] [--seed=3]
import fs from 'node:fs';
import { launch, enter, shot, OUT } from './horror-lib.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? Number(a.split('=')[1]) : d; };
const minutes = opt('minutes', 6), seed = opt('seed', 3);
const maps = args.filter((a) => !a.startsWith('--'));
const SETUP = {
  temple: 'const s = g.story; s.state.flags.incense = true; s.state.chapter = 3; s.sync(); g.player.teleport(0, 0.9, -16, 0, 0);',
  road: 'g.story.state.road.step = 2; g.story.bridgeCue = true; g.story.sync(); g.player.flashOn = true;',
  home: 'g.story.state.home.step = 3; g.story.sync();',
};

const { browser, page, errors } = await launch();
const report = {};
let failed = false;
try {
  for (const map of maps.length ? maps : ['home', 'road', 'temple']) {
    await enter(page, map, `&horror&hseed=${seed}`);
    const r = await page.evaluate(([code, total, seed]) => {
      const g = window.__game, d = g.horror.debug;
      new Function('g', code)(g);
      let rs = seed * 7919 + 13; const rnd = () => { rs = (Math.imul(rs, 1664525) + 1013904223) >>> 0; return rs / 4294967296; };
      const tiers = Object.fromEntries(d.list().map((e) => [e.id, e]));
      const orig = g.horror.update; let ms = 0, n = 0, worst = 0;
      g.horror.update = (dt) => { const a = performance.now(); orig(dt); const c = performance.now() - a; ms += c; n++; if (c > worst) worst = c; };
      const log = [], phases = {}; let prev = [], dMin = 1, dMax = 0, dSum = 0, k = 0;
      let mode = 'stand', modeT = 2, yawVel = 0, spin = 0;
      for (let t = 0; t < total; t += 0.1) {
        modeT -= 0.1;
        if (modeT <= 0) {
          const q = rnd();
          if (q < 0.5) { mode = 'walk'; modeT = 2 + rnd() * 5; yawVel = (rnd() - 0.5) * 0.9; } else if (q < 0.8) { mode = 'look'; modeT = 1.5 + rnd() * 4; yawVel = (rnd() - 0.5) * 2.2; } else if (q < 0.9) { mode = 'stand'; modeT = 6 + rnd() * 12; yawVel = 0; } else { mode = 'spin'; modeT = 0.5; spin = (rnd() < 0.5 ? -1 : 1) * Math.PI; }
        }
        g.player.keys = Object.create(null);
        if (mode === 'walk') g.player.keys.KeyW = true;
        if (mode === 'spin') g.player.yaw += spin * 0.2; else g.player.yaw += yawVel * 0.1;
        if (g.story.modal && g.story.modal.options.length === 1) g.story.choose(0);
        d.run(0.1, 1 / 30);
        const s = d.state;
        for (const id of s.active) if (!prev.includes(id)) log.push([Math.round(s.mapTime), id, tiers[id]?.tier, s.phase, +s.dread.toFixed(2)]);
        prev = s.active;
        phases[s.phase] = (phases[s.phase] || 0) + 0.1;
        dMin = Math.min(dMin, s.dread); dMax = Math.max(dMax, s.dread); dSum += s.dread; k++;
      }
      g.horror.update = orig;
      const s = d.state;
      return { log, phases, dMin, dMax, dAvg: dSum / k, faults: s.faults, lastError: s.lastError, history: s.history, msAvg: ms / n, msWorst: worst, frames: n, counts: d.list().filter((e) => e.count).map((e) => `${e.id}×${e.count}`), pos: g.player.pos.toArray().map((v) => +v.toFixed(1)) };
    }, [SETUP[map], minutes * 60, seed]);
    report[map] = r;
    console.log(`\n── ${map}：${minutes} 分鐘 ──`);
    for (const [t, id, tier, phase, dread] of r.log) console.log(`  ${String(t).padStart(4)}s  T${tier}  ${id.padEnd(16)} phase=${phase.padEnd(8)} dread=${dread}`);
    console.log('  phases(s):', Object.entries(r.phases).map(([p, v]) => `${p}=${Math.round(v)}`).join(' '));
    console.log(`  dread min/avg/max = ${r.dMin.toFixed(2)}/${r.dAvg.toFixed(2)}/${r.dMax.toFixed(2)}   horror.update 平均 ${r.msAvg.toFixed(3)} ms、最差 ${r.msWorst.toFixed(2)} ms（${r.frames} 幀）`);
    console.log('  counts:', r.counts.join(' '));
    const problems = [];
    if (r.faults) problems.push('faults: ' + r.lastError.split('\n').slice(0, 3).join(' | '));
    const hard = r.log.filter((e) => e[2] === 3);
    if (hard.some((e) => e[0] < 60)) problems.push('hard scare inside the first 60 s');
    for (let i = 1; i < r.log.length; i++) if (r.log[i][1] === r.log[i - 1][1]) problems.push(`same event twice in a row: ${r.log[i][1]}`);
    for (let i = 1; i < hard.length; i++) if (hard[i][0] - hard[i - 1][0] < 30) problems.push(`hard scares too close: ${hard[i - 1][0]}s → ${hard[i][0]}s`);
    if (r.log.length < (map === 'home' ? 4 : 6)) problems.push('too few events: ' + r.log.length);
    if (!(r.dMax <= 1 && r.dMin >= 0)) problems.push('dread out of range');
    if (r.msAvg > 0.6) problems.push('director too slow: ' + r.msAvg.toFixed(3) + ' ms');
    console.log(problems.length ? '  FAIL ' + problems.join('; ') : '  PASS');
    if (problems.length) failed = true;
    await shot(page, `soak_${map}_end`);
  }
} catch (e) { errors.push(e.stack || String(e)); } finally {
  fs.writeFileSync(`${OUT}/soak-results.json`, JSON.stringify({ report, errors }, null, 2));
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
  if (errors.length || failed) process.exitCode = 1;
}
