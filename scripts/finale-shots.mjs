// finale：三個結局逐段截圖到 artifacts/finale/。node scripts/finale-shots.mjs [C|A|B|all] [篩選字串]
// 每一張：debug.to(段落) → 快轉 run 秒 → 選擇性的鏡頭調整 → 等畫面穩定 → 截圖。
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const out = 'artifacts/finale'; fs.mkdirSync(out, { recursive: true });
const which = process.argv[2] || 'all', filter = process.argv[3] || '';
const SHOTS = {
  C: [
    ['c01-ready', 'c-ready', 0.5, 'p.teleport(55,-7,-20.2,0,-0.08)'],
    ['c02-name', 'c-name', 2.6, 'p.teleport(51,-7,-21.05,0,-0.32)'],
    ['c03-dark', 'c-name', 7.2, ''],
    ['c04-walk', 'c-walk', 1.5, ''],
    ['c05-warning', 'c-walk', 2.2, 'p.yaw+=1.95'],
    ['c06-lookback', 'c-fail1', 0.25, ''],
    ['c07-lights-on', 'c-relic', 3.3, ''],
    ['c08-rollcall', 'c-relic', 12.5, ''],
    ['c09-six', 'c-six', 6.5, ''],
    ['c10-six-near', 'c-six', 12.5, ''],
    ['c11-tape', 'c-tape', 6.6, ''],
    ['c12-fire', 'c-fire', 2.5, ''],
    ['c13-fire-hold', 'c-fire', 0.2, 'F.hold=true;F.progress=0.55', 1.0],
    ['c14-fire-wide', 'c-fire', 2.0, 'p.teleport(55,-7,-24.5,0,0.12)'],
    ['c15-door-open', 'c-unlock', 6.6, ''],
    ['c16-girl', 'c-girl', 4.5, ''],
    ['c17-lunge', 'c-lunge', 0.75, ''],
    ['c18-mother', 'c-mother', 12.6, ''],
    ['c19-embrace', 'c-mother', 15.5, ''],
    ['c20-fading', 'c-mother', 19.5, ''],
    ['c21-thread', 'c-quiet', 1.0, 'p.pitch=-0.45'],
    ['c22-exit', 'c-exit', 0.5, 'p.teleport(55,-7,-20,Math.PI,0)'],
    ['c23-fourth', 'c-up', 5.5, ''],
    ['c24-fourth-turn', 'c-up', 8.0, 'p.yaw=1.2;p.pitch=-0.15'],
    ['c25-terrace', 'c-terrace', 2.6, ''],
    ['c26-gate', 'c-gate', 3.2, ''],
    ['c26b-gate-3m', 'c-gate', 3.6, 'p.pitch=0.02'],
    ['c27-answer', 'c-gate', 5.2, ''],
    ['c28-stretcher', 'c-answer', 16.2, ''],
  ],
  A: [
    ['a01-tie', 'a-tie', 0.3, 'F.hold=true', 3.0],
    ['a02-tie-late', 'a-tie', 0.3, 'F.hold=true', 6.2],
    ['a03-walk', 'a-walk', 0.5, ''],
    ['a04-walk-court', 'a-walk', 0.5, 'p.teleport(0,0.02,8,Math.PI,0)', 1.2],
    ['a05-gate', 'a-gate', 4.6, ''],
    ['a06-phone', 'a-phone', 4.6, ''],
  ],
  B: [
    ['b01-untie', 'b-untie', 6.4, ''],
    ['b02-cloth', 'b-untie', 9.4, ''],
    ['b03-double', 'b-double', 3.0, ''],
    ['b04-phone', 'b-double', 6.8, ''],
    ['b05-seat', 'b-roll', 6.0, ''],
    ['b06-six', 'b-roll', 12.9, ''],
    ['b07-call', 'b-call', 7.0, ''],
  ],
};
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = []; page.on('pageerror', (e) => errors.push(e.stack || e.message));
try {
  await page.goto('http://127.0.0.1:5178/?auto&map=temple');
  await page.waitForFunction(() => window.__game?.running && window.__game.story, null, { timeout: 240000 });
  for (let i = 0; i < 30; i++) { if (await page.evaluate(() => window.__game.story.modal?.options.length) !== 1) break; await page.evaluate(() => window.__game.story.choose(0)); }
  for (const kind of ['C', 'A', 'B']) {
    if (which !== 'all' && which !== kind) continue;
    for (const [name, phase, run, js, run2] of SHOTS[kind]) {
      if (filter && !new RegExp(filter).test(name)) continue;
      const res = await page.evaluate(([phase, run, js, run2]) => {
        const g = window.__game, s = g.story, p = g.player;
        s.modal = null; document.getElementById('story-layer').classList.add('hidden'); s.state.ending = null;
        for (const id of ['diary', 'newspaper', 'tape', 'ritual', 'stage', 'death', 'births', 'relic', 'names', 'confession']) s.collect(id);
        Object.assign(s.state.flags, { incense: true, stage: true, loopSolved: true, key: true, underground: true, sent: false, sealed: false }); s.state.chapter = 4; s.sync();
        s.finale?.restore();
        if (!s.finale) { s.prepareRitual(); s.choose(0); s.finale.restore(); }
        p.teleport(55, -7, -21.6, 0, 0);
        const f = s.finale; f.debug.to(phase); f.debug.run(run);
        const F = f.debug.flags;
        if (js) (new Function('g', 's', 'p', 'f', 'F', js))(g, s, p, f, F);
        if (run2) f.debug.run(run2);
        return f.debug.state;
      }, [phase, run, js, run2 || 0]);
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${out}/${name}.jpg`, type: 'jpeg', quality: 86 });
      console.log(name, JSON.stringify(res));
    }
  }
} catch (e) { errors.push(e.stack || String(e)); }
finally { console.log('ERRORS', JSON.stringify(errors)); await browser.close(); }
