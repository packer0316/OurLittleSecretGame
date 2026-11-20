// 除錯：章節跳轉（src/debug/chapterJump.js）的回歸檢查。
// 用法：node scripts/debug-jump.mjs [id ...]（需要 http://127.0.0.1:5178 的開發伺服器；不給 id 就檢查全部）
//   每個檢查點：地圖與章節正確、存檔與檢查點定義一致、玩家站在地板上沒有卡住或掉下去、
//   目標物在準星內可以調查、恐怖段落／結局段落真的開始、沒有頁面錯誤。另外檢查面板、備份與還原。
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const out = 'artifacts/debug-jump'; fs.mkdirSync(out, { recursive: true });
const only = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [], results = [];
page.on('pageerror', (e) => errors.push(e.stack || e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const test = async (name, fn) => { try { const r = await fn(); results.push({ name, pass: true, r }); console.log('PASS', name, r ?? ''); } catch (e) { results.push({ name, pass: false, error: String(e) }); console.log('FAIL', name, String(e)); } };
const ev = (fn, arg) => page.evaluate(fn, arg);
const PHASE = { 'end-c': 'c-ready', 'end-c-walk': 'c-walk', 'end-c-six': 'c-six', 'end-c-fire': 'c-fire', 'end-c-girl': 'c-girl', 'end-c-mother': 'c-mother', 'end-c-gate': 'c-gate', 'end-a': 'a-tie', 'end-a-walk': 'a-walk', 'end-a-gate': 'a-gate', 'end-b': 'b-untie', 'end-b-roll': 'b-roll' };
const SETPIECE = { 't2-echo1': 'echo1', 't3-ash': 'ash', 't3-hide': 'hideseek', 't4-echo2': 'echo2', 't4-patrol': 'patrol', 't4-arhats': 'arhats', 't4-echo3': 'echo3' };
try {
  // 有一份「真正的」存檔，跳轉前要被備份，最後要還原得回來
  await page.goto('http://127.0.0.1:5178/');
  await page.waitForFunction(() => !!document.getElementById('start-story'));
  const real = { version: 1, scene: 'road', home: { step: 6, notes: [], answered: false }, road: { step: 3, notes: ['car'] }, chapter: 1, evidence: ['photo'], notes: [], seen: [], flags: { prologueComplete: true }, answers: 1, deaths: 0, elapsed: 123, ending: null, position: null };
  await ev((s) => { localStorage.removeItem('ols-story-v1-debug-backup'); localStorage.removeItem('ols-story-v1-decision'); localStorage.setItem('ols-story-v1', JSON.stringify(s)); }, real);
  await page.reload(); await page.waitForFunction(() => !!document.getElementById('debug-jump'));

  await test('lobby shows the debug entry; panel lists every checkpoint and opens/closes with F9', async () => {
    const n = await ev(() => window.__checkpoints().length);
    await page.click('#debug-jump');
    const open = await ev(() => !document.getElementById('chapter-jump').classList.contains('hidden'));
    const buttons = await ev(() => document.querySelectorAll('#chapter-jump [data-cp]').length);
    const now = await ev(() => document.querySelector('#chapter-jump .cj-now').textContent);
    await page.screenshot({ path: out + '/00-panel.png' });
    await page.keyboard.press('F9');
    const closed = await ev(() => document.getElementById('chapter-jump').classList.contains('hidden'));
    if (!open || !closed || buttons !== n || n < 30) throw Error(JSON.stringify({ open, closed, buttons, n }));
    if (!now.includes('舊山路')) throw Error('current save not described: ' + now);
    return `${n} checkpoints · ${now}`;
  });

  // 第一次從面板點選（真的點按鈕）：之後改用 __jump 加速
  await page.click('#debug-jump');
  await page.click('#chapter-jump [data-cp="t3"]');
  await page.waitForFunction(() => window.__game?.story && window.__game.map?.id === 'temple' && document.getElementById('overlay') && !document.getElementById('overlay').classList.contains('hidden'), null, { timeout: 240000 });
  await test('clicking a checkpoint loads it and waits on the "click to enter" overlay; the real save was backed up', async () => {
    const r = await ev(() => ({ chapter: window.__game.story.state.chapter, stage: window.__game.story.state.flags.stage, backup: JSON.parse(localStorage.getItem('ols-story-v1-debug-backup') || 'null'), title: document.getElementById('overlay-title').textContent }));
    if (r.chapter !== 3 || !r.backup || !String(r.backup.save).includes('"scene":"road"')) throw Error(JSON.stringify(r));
    return `chapter ${r.chapter} · overlay「${r.title}」`;
  });

  // 其餘改用 ?auto（不必鎖滑鼠、立刻開始）
  await page.goto('http://127.0.0.1:5178/?auto');
  await page.waitForFunction(() => typeof window.__jump === 'function');
  const all = await ev(() => window.__checkpoints());
  const list = only.length ? all.filter((c) => only.includes(c.id)) : all;
  for (const cp of list) {
    await test(`jump ${cp.id}（${cp.group}・${cp.title}）`, async () => {
      const ok = await ev((id) => window.__jump(id), cp.id);
      if (!ok) throw Error('jump refused');
      await page.waitForFunction(() => window.__game?.running && window.__game.story, null, { timeout: 240000 });
      await page.waitForTimeout(350);
      const r = await ev(async (id) => {
        const { checkpointState, CHECKPOINTS } = await import('/src/debug/chapterJump.js');
        const g = window.__game, s = g.story, cp = CHECKPOINTS.find((c) => c.id === id), want = checkpointState(cp);
        const p = g.player.pos, w = g.map.world;
        const probe = w.probe(p.x, p.z, p.y + 0.05);
        const sp = g.horror?.debug?.setpieceState;
        return {
          map: g.map.id, chapter: s.state.chapter, label: document.getElementById('chapter-label')?.textContent,
          sameEvidence: JSON.stringify([...s.state.evidence].sort()) === JSON.stringify([...want.evidence].sort()),
          sameFlags: Object.keys(want.flags).every((k) => !!s.state.flags[k] === !!want.flags[k]) || s.state.flags.sent || s.state.flags.sealed,
          step: cp.scene === 'home' ? s.state.home.step : cp.scene === 'road' ? s.state.road.step : null, wantStep: cp.home ?? cp.road ?? null,
          pos: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)], floor: +probe.g.toFixed(2), blocked: probe.blocked,
          focused: s.focused()?.id || null, wantFocus: cp.focus || null,
          objective: document.getElementById('objective-title')?.textContent,
          setpiece: sp?.active || null, finale: s.finale?.debug?.phase || null, finaleActive: !!s.finale?.debug?.state?.active,
          scene: s.scene, modal: !!s.modal, saved: JSON.parse(localStorage.getItem('ols-story-v1') || 'null')?.scene,
          decision: !!localStorage.getItem('ols-story-v1-decision'),
        };
      }, cp.id);
      const y0 = r.pos[1];
      // 站穩了沒有：跑兩秒，不應該掉下去或被推走（恐怖段落、結局會自己移動玩家，略過）
      const moving = SETPIECE[cp.id] || PHASE[cp.id];
      let drift = 0;
      if (!moving) {
        drift = await ev(() => { const g = window.__game, p = g.player, a = p.pos.clone(); for (let i = 0; i < 60; i++) p.update(1 / 30, g.map.world); return +a.distanceTo(p.pos).toFixed(3); });
      }
      await page.screenshot({ path: `${out}/${cp.id}.png` });
      const bad = [];
      if (r.map !== cp.scene) bad.push('map ' + r.map);
      if (!r.sameEvidence) bad.push('evidence differs');
      if (!r.sameFlags) bad.push('flags differ');
      if (r.wantStep != null && r.step !== r.wantStep) bad.push(`step ${r.step}≠${r.wantStep}`);
      if (r.saved !== cp.scene) bad.push('autosave scene ' + r.saved);
      if (!moving && (Math.abs(y0 - r.floor) > 0.06 || r.blocked)) bad.push(`not on floor y ${y0} floor ${r.floor} blocked ${r.blocked}`);
      if (!moving && drift > 0.05) bad.push('drifted ' + drift);
      if (r.wantFocus && r.focused !== r.wantFocus) bad.push(`focus ${r.focused}≠${r.wantFocus}`);
      if (SETPIECE[cp.id] && r.setpiece !== SETPIECE[cp.id]) bad.push('setpiece ' + r.setpiece);
      if (PHASE[cp.id] && (!r.finaleActive || r.finale !== PHASE[cp.id])) bad.push(`finale ${r.finale}`);
      if (cp.id.startsWith('end-') || cp.id === 't5-altar') { if (!r.decision) bad.push('no decision save'); }
      if (bad.length) throw Error(bad.join('; ') + ' ' + JSON.stringify(r));
      return `${r.label} · ${r.objective} · pos ${r.pos.join(',')}${r.focused ? ' · E ' + r.focused : ''}${r.setpiece ? ' · ' + r.setpiece : ''}${r.finale ? ' · ' + r.finale : ''}`;
    });
  }

  await test('restore puts the pre-jump save back and returns to the lobby', async () => {
    await page.goto('http://127.0.0.1:5178/');
    await page.waitForFunction(() => !!document.getElementById('debug-jump'));
    await page.click('#debug-jump');
    const shown = await ev(() => !document.querySelector('#chapter-jump .cj-restore').classList.contains('hidden'));
    await page.click('#chapter-jump .cj-restore');
    const r = await ev(() => ({ save: JSON.parse(localStorage.getItem('ols-story-v1') || 'null'), backup: localStorage.getItem('ols-story-v1-debug-backup'), label: document.querySelector('#continue-story small')?.textContent }));
    if (!shown || r.backup || r.save?.scene !== 'road' || r.save?.road?.step !== 3 || r.save?.answers !== 1) throw Error(JSON.stringify(r));
    return r.label;
  });
} catch (e) { errors.push(e.stack || String(e)); }
finally {
  fs.writeFileSync(out + '/results.json', JSON.stringify({ results, errors }, null, 2));
  const pass = results.filter((r) => r.pass).length;
  console.log(`\n${pass}/${results.length} passed`); console.log('ERRORS', JSON.stringify(errors.slice(0, 10)));
  await browser.close();
}
if (errors.length || results.some((r) => !r.pass)) process.exitCode = 1;
