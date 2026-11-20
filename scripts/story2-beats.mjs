// story（第二輪）：寺內故事線的回歸測試。朋友們的痕跡、林美蘭與郭家的讀物、章節鉤子、四樓錄音機的點名。
// 用法：node scripts/story2-beats.mjs（共用測試伺服器 127.0.0.1:5178）
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const out = 'artifacts/story2'; fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [], results = [];
page.on('pageerror', (e) => errors.push(e.stack || e.message));
const test = async (name, fn) => { try { const d = await fn(); results.push({ name, pass: true }); console.log('PASS', name, d ?? ''); } catch (e) { results.push({ name, pass: false, error: String(e) }); console.log('FAIL', name, String(e)); } };
const must = (ok, msg) => { if (!ok) throw Error(msg); };
const copy = () => page.evaluate(() => document.querySelector('#story-layer .story-card')?.innerText || '');
const options = () => page.evaluate(() => window.__game.story.modal?.options.length || 0);
const dismiss = async () => { const seen = []; for (let i = 0; i < 40; i++) { if (await options() !== 1) break; seen.push(await copy()); await page.evaluate(() => window.__game.story.choose(0)); } return seen.join('\n'); };
const toast = () => page.evaluate(() => document.getElementById('story-toast').textContent);
const aim = (id, off = [0, 0, 1.6]) => page.evaluate(([id, off]) => {
  const g = window.__game, p = g.player, t = g.map.storyWorld.targets.find((t) => t.id === id).position;
  const floor = t.y < 0 ? -7 : t.y > 16 ? 16.9 : t.y > 11 ? 11.9 : t.y > 6 ? 6.9 : 0.9;
  p.teleport(t.x + off[0], floor, t.z + off[2], 0, 0);
  const dx = t.x - p.pos.x, dz = t.z - p.pos.z, dy = t.y - (p.pos.y + p.eye);
  p.teleport(p.pos.x, p.pos.y, p.pos.z, Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz))); g.renderOnce();
  return g.story.focused()?.id;
}, [id, off]);
const set = (fn, arg) => page.evaluate(fn, arg);
const open = async (url) => { await page.goto(url); await page.waitForFunction(() => window.__game?.running && window.__game.story, null, { timeout: 180000 }); await dismiss(); };
try {
  await open('http://127.0.0.1:5178/?auto&map=temple');
  const NEW = ['robe', 'flashlight', 'chalk', 'tablet', 'camp', 'register', 'bucket'];
  await test('new traces exist as targets and stay locked before the incense', async () => {
    const ids = await page.evaluate(() => window.__game.map.storyWorld.targets.map((t) => t.id));
    for (const id of NEW) must(ids.includes(id), 'missing target ' + id);
    must(await page.evaluate((ids) => ids.every((id) => !window.__game.story.active(id)), NEW), 'a trace is active before the incense');
  });
  await test('chapter 2: the robe and Zhihao\'s flashlight are found with E, the main clues keep their focus', async () => {
    await set(() => { const s = window.__game.story; s.state.flags.incense = true; s.state.chapter = 2; s.sync(); });
    for (const [id, key, off] of [['robe', '問完剪線', [0.15, 0, 1.4]], ['flashlight', '鞋在老樹下', [-0.2, 0, 1.5]]]) {
      const f = await aim(id, off); must(f === id, `${id} focus hit ${f}`);
      await page.keyboard.press('e'); await page.waitForTimeout(120); must((await copy()).includes(key), id + ' text');
      await page.screenshot({ path: `${out}/beat-note-${id}.png` }); await dismiss();
      must((await toast()).length > 6, id + ' first-read hint missing');
    }
    for (const id of ['newspaper', 'diary', 'tape', 'ritual']) { const f = await aim(id, [0, 0, 1.8]); must(f === id, `${id} lost focus to ${f}`); }
    // 素衣和門閂至少隔 1.2 m；從東側斜看門閂也不會被素衣搶走
    const gap = await page.evaluate(() => { const T = window.__game.map.storyWorld.targets, a = T.find((t) => t.id === 'robe').position, b = T.find((t) => t.id === 'newspaper').position; return a.distanceTo(b); });
    must(gap >= 1.2, 'robe too close to the latch: ' + gap.toFixed(2));
    for (const off of [[0.6, 0, 1.6], [1.0, 0, 1.2], [-0.4, 0, 1.5]]) { const f = await aim('newspaper', off); must(f === 'newspaper', `latch lost focus to ${f} from ${off}`); }
    must((await page.locator('#clue-count').innerText()).includes('1 / 11'), 'readables changed the evidence count');
  });
  await test('chapter 2 → 3 hook: the third clue summons the stage with a buzzing phone', async () => {
    await set(() => { const s = window.__game.story; for (const id of ['diary', 'newspaper']) s.collect(id); s.state.evidence.push('tape'); s.state.chapter = 3; s.nextClue(); });
    must(/手機貼著木板震動/.test(await toast()), 'stage hook toast');
  });
  await test('chapter 3: Bohan\'s chalk opens after the stage replay and reads on the third floor', async () => {
    must(!(await page.evaluate(() => window.__game.story.active('chalk'))), 'chalk open before the stage');
    await set(() => { const s = window.__game.story; s.collect('stage'); s.state.flags.stage = true; s.sync(); });
    const f = await aim('chalk', [0.1, 0, -2.4]); must(f === 'chalk', 'chalk focus ' + f);
    await page.keyboard.press('e'); await page.waitForTimeout(120); const t = await copy(); must(t.includes('還有一個') && t.includes('吳老師'), 'chalk text');
    await page.screenshot({ path: `${out}/beat-note-chalk.png` }); await dismiss();
  });
  await test('chapter 3 → 4 hook: the key drawer is followed by a message sent from Azhe\'s charging phone', async () => {
    await set(() => { const s = window.__game.story; s.state.flags.loopSolved = true; s.sync(); s.divination(); });
    await page.evaluate(() => window.__game.story.choose(0)); const lines = await dismiss();
    must(lines.includes('鑰匙拿到就上來。我在。') && lines.includes('02:47'), 'SMS hook missing');
    must(await page.evaluate(() => window.__game.story.state.flags.key && window.__game.story.state.chapter === 4), 'key not granted');
    await aim('death', [0, 0, 2.1]); await page.keyboard.press('e'); const d = await dismiss(); must(d.includes('草稿'), 'phone does not explain the draft');
  });
  await test('chapter 4: Meilan\'s tablet waits for the height marks; the camp, register and bucket open with the key', async () => {
    must(!(await page.evaluate(() => window.__game.story.active('tablet'))), 'tablet open before births');
    for (const [id, key, off] of [['register', '還：本人', [0.9, 0, 0.5]], ['bucket', '它不收', [-0.6, 0, 1.4]]]) {
      const f = await aim(id, off); must(f === id, `${id} focus hit ${f}`);
      await page.keyboard.press('e'); await page.waitForTimeout(120); must((await copy()).includes(key), id + ' text');
      await page.screenshot({ path: `${out}/beat-note-${id}.png` }); await dismiss();
    }
    await set(() => window.__game.story.collect('births')); await dismiss();
    const f = await aim('tablet', [1.3, 0, 0.05]); must(f === 'tablet', 'tablet focus ' + f);
    await page.keyboard.press('e'); await page.waitForTimeout(120); must((await copy()).includes('媽媽就應'), 'tablet text'); await dismiss();
    const j = await page.evaluate(() => window.__game.story.deduction()); must(j.includes('都來過'), 'journal does not connect the friends: ' + j);
  });
  await test('camp: reading the bedroll plays the roll call; silence passes, the red light goes out, and it is remembered', async () => {
    const f = await aim('camp', [1.4, 0, 0.6]); must(f === 'camp', 'camp focus ' + f);
    await page.keyboard.press('e'); await page.waitForTimeout(120); must((await copy()).includes('麥克風的線'), 'camp text');
    const tape = await dismiss(); must(tape.includes('張明哲') && tape.includes('有。') && tape.includes('許志豪。吳柏翰。周佩珊。'), 'tape lines missing');
    must(await options() === 3 && (await copy()).includes('陳以安'), 'roll-call trap missing');
    must(await page.evaluate(() => window.__game.story.scene === 'story:camp'), 'story.scene not set during the beat');
    await page.screenshot({ path: `${out}/beat-camp-trap.png` });
    await page.evaluate(() => window.__game.story.choose(0)); const after = await dismiss();
    must(after.includes('我再等一下'), 'silent branch text');
    must(await page.evaluate(() => { const s = window.__game.story; return s.hasSeen('story:camp') && s.scene === null && !s.chase && s.state.answers === 0; }), 'seen/scene bookkeeping');
    must(await page.evaluate(() => window.__game.map.scene.getObjectByName('AzheRecorderLed').visible === false), 'LED still on');
    await aim('camp', [1.4, 0, 0.6]); await page.keyboard.press('e'); await page.waitForTimeout(100); await dismiss();
    must(await options() === 0, 'the beat replayed after it was seen');
  });
  await test('camp: answering "有" counts, starts a chase from the far side, and surviving it marks the beat as seen', async () => {
    await set(() => { const s = window.__game.story; s.state.seen = s.state.seen.filter((x) => x !== 'story:camp'); s.campTape('camp'); });
    await dismiss(); must(await options() === 3, 'trap not shown'); await page.evaluate(() => window.__game.story.choose(1)); await dismiss();
    const c = await page.evaluate(() => { const s = window.__game.story, g = s.world.ghost.root; return { chase: s.chase?.source, answers: s.state.answers, d: Math.hypot(g.position.x - s.game.player.pos.x, g.position.z - s.game.player.pos.z) }; });
    must(c.chase === 'camp' && c.answers === 1 && c.d > 6, 'chase setup ' + JSON.stringify(c));
    await page.evaluate(() => window.__game.story.endChase(false));
    must(await page.evaluate(() => window.__game.story.hasSeen('story:camp')) && /暗道/.test(await toast()), 'chase end');
    await set(() => { window.__game.story.state.answers = 0; });
  });
  await test('descent: three pairs of shoes at the hatch, then Azhe from behind the door (?auto skips the auto beat)', async () => {
    await set(() => { const s = window.__game.story; s.state.seen = []; s.syncTraces(); });
    const ok = await page.evaluate(() => window.__game.story.interact('descent')); must(ok, 'descent refused');
    const lines = await dismiss(); must(lines.includes('三雙鞋') && lines.includes('門的另一邊'), 'descent lines');
    must(await page.evaluate(() => window.__game.player.pos.y < -5 && window.__game.story.state.flags.underground), 'not underground');
  });
  await test('chapter 4 close: names and confession say who is behind the door and what is owed', async () => {
    await set(() => window.__game.story.collect('relic')); await dismiss();
    await page.evaluate(() => window.__game.story.interact('names')); const n = await dismiss(); must(n.includes('還」那一格寫的是自己'), 'names does not recall the register');
    await page.evaluate(() => window.__game.story.interact('confession')); const c = await dismiss();
    must(c.includes('阿哲、志豪、柏翰') && c.includes('美蘭阿姨') && c.includes('欠了二十八年'), 'confession close: ' + c.slice(-160));
    const j = await page.evaluate(() => window.__game.story.deduction()); must(j.includes('林美蘭'), 'Meilan not named in the journal');
    await page.evaluate(() => window.__game.story.journal()); must(await page.locator('.note-link').count() >= 6, 'journal lists the read traces');
    await page.screenshot({ path: `${out}/beat-journal.png` }); await dismiss();
  });
  // ── &setpieces：第一次碰暗道時，錄音機自己播放（正式遊玩的行為）──
  await open('http://127.0.0.1:5178/?auto&map=temple&setpieces');
  await test('with &setpieces the first touch of the hatch plays the recorder, then silence leads straight down', async () => {
    await set(() => { const s = window.__game.story; Object.assign(s.state.flags, { incense: true, stage: true, loopSolved: true, key: true }); s.state.chapter = 4; s.collect('death'); s.sync(); });
    await dismiss(); await aim('descent', [0, 0, 1.5]); await page.keyboard.press('e'); await page.waitForTimeout(120);
    const t = await dismiss(); must(t.includes('身後西牆下喀的一聲'), 'hatch did not start the recorder');
    must(await options() === 3, 'trap missing'); await page.evaluate(() => window.__game.story.choose(0)); const d = await dismiss();
    must(d.includes('三雙鞋') && await page.evaluate(() => window.__game.story.state.flags.underground && window.__game.story.hasSeen('story:camp')), 'did not descend after the beat');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ols-story-v1')).seen); must(saved.includes('story:camp'), 'beat not saved');
  });
} catch (e) { errors.push(e.stack || String(e)); }
finally { fs.writeFileSync(out + '/beats-results.json', JSON.stringify({ results, errors }, null, 2)); console.log('ERRORS', JSON.stringify(errors)); await browser.close(); }
if (errors.length || results.some((r) => !r.pass)) process.exitCode = 1;
