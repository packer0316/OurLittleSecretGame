// Full browser regression for the illustrated story. Start Vite on 5178 first.
// STORY_URL also supports a production preview under a non-root base path.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { PICTURES } from '../src/story/illustrations.js';
import { newState, validateSave } from '../src/story/campaign.js';

const base = process.env.STORY_URL || 'http://127.0.0.1:5178/';
const out = 'artifacts/visual-integration'; fs.mkdirSync(out, { recursive: true });
const old = newState(); delete old.pictures;
assert.deepEqual(validateSave(old).pictures, []);
assert.deepEqual(validateSave({ ...old, pictures: ['home-letter', 'spoiler', 'home-letter', null, '__proto__'] }).pictures, ['home-letter']);
assert.equal(Object.keys(PICTURES).length, 46);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errors = [], results = [], seen = new Set(), requests = [];
page.on('pageerror', e => errors.push(e.stack || e.message));
page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
page.on('request', r => { if (r.url().includes('/visual-v2/') && r.url().endsWith('.webp')) requests.push(r.url()); });
const test = async (name, fn) => { await fn(); results.push(name); console.log('PASS', name); };
const choose = (i = 0) => page.evaluate(i => window.__game.story.choose(i), i);
const inspect = async expected => {
  const id = await page.evaluate(() => window.__game.story.modal?.visual);
  if (expected) assert.equal(id, expected);
  if (id) {
    await page.waitForFunction(() => { const i = document.querySelector('.story-art img'); return i?.complete && i.naturalWidth > 0; }, null, { timeout: 15000 });
    await page.locator('.story-art img').evaluate(async el => { await el.decode(); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
    const url = await page.locator('.story-art img').getAttribute('src');
    assert.equal(new URL(url, base).href, new URL(PICTURES[id].image, base).href);
    seen.add(id);
  }
  return id;
};
const drain = async () => { for (let i = 0; i < 45; i++) { if (await page.evaluate(() => window.__game.story.modal?.options.length) !== 1) return; await inspect(); await choose(); } throw Error('dialogue did not finish'); };
const interact = async id => assert.equal(await page.evaluate(id => window.__game.story.interact(id), id), true, `interaction ${id}`);
const open = async scene => {
  await page.goto(`${base}?auto&map=${scene}`);
  await page.waitForFunction(scene => window.__game?.running && window.__game.story?.state.scene === scene, scene, { timeout: 180000 });
  await drain();
};
const shot = async name => { await page.screenshot({ path: `${out}/${name}.png` }); };
try {
  await open('home');
  await test('pictures are not downloaded or revealed before their events', async () => {
    assert.equal(requests.length, 0);
    await page.evaluate(() => window.__game.story.pictureJournal());
    assert.equal(await page.locator('[data-picture]').count(), 0); await choose(); await drain();
  });
  await test('home letter, enlarge/Escape, keyboard controls, lamp animation and phone choice', async () => {
    await interact('letter'); await inspect('home-letter'); await shot('01-letter');
    await page.locator('.story-image-open').focus(); await page.keyboard.press('Enter');
    assert.equal(await page.locator('#story-image-viewer').evaluate(el => el.open), true);
    await page.keyboard.press('e'); assert.equal(await page.evaluate(() => window.__game.story.state.home.step), 0);
    await page.keyboard.press('Escape'); assert.equal(await page.locator('#story-image-viewer').evaluate(el => el.open), false);
    assert.equal(await page.evaluate(() => window.__game.story.state.home.step), 0);
    await page.click('[data-choice="0"]');
    await page.waitForFunction(() => !window.__game.story.busy && window.__game.story.modal, null, { timeout: 15000 });
    assert.equal(await page.locator('.photo-scribble').count(), 1); await drain();
    assert.equal(await page.evaluate(() => window.__game.story.state.home.step), 2);
    await interact('phone'); await drain(); await inspect('beat-home-door'); await shot('02-door-call');
    const before = await page.evaluate(() => window.__game.story.state.elapsed);
    await page.evaluate(() => window.__game.story.update(20));
    assert.equal(await page.evaluate(() => window.__game.story.state.elapsed), before);
    await choose(0); await drain(); assert.equal(await page.evaluate(() => window.__game.story.state.home.answered), false);
    await page.evaluate(() => window.__game.player.teleport(0,0,2.8,Math.PI,0));
    await page.waitForFunction(() => !window.__game.story.world.doorEventActive, null, { timeout: 20000 });
    await interact('slip'); await inspect('home-slip'); await drain();
    for (const id of ['calendar', 'window', 'message']) { await interact(id); await inspect('home-' + id); await drain(); }
    await interact('kit'); await drain();
  });
  await test('home archive can replay with keyboard without advancing the story', async () => {
    const step = await page.evaluate(() => window.__game.story.state.home.step);
    await page.evaluate(() => window.__game.story.journal()); await page.click('.picture-journal-link');
    assert.equal(await page.locator('[data-picture]').count(), 6);
    await page.locator('[data-picture="home-letter"]').focus(); await page.keyboard.press('Enter'); await inspect('home-letter');
    await choose(); assert.equal(await page.locator('[data-picture]').count(), 6);
    await choose(); await drain(); assert.equal(await page.evaluate(() => window.__game.story.state.home.step), step);
  });
  await test('travel retains unlocked pictures and each road clue has its own picture', async () => {
    await interact('door'); await choose(0);
    await page.waitForFunction(() => window.__game?.running && window.__game.story?.state.scene === 'road', null, { timeout: 180000 });
    assert.equal(await page.evaluate(() => window.__game.story.state.pictures.includes('home-letter')), true);
    for (const id of ['bus', 'notice', 'remains', 'ledger', 'car', 'kiln']) { await interact(id); await inspect(id === 'ledger' ? 'road-camera' : 'road-' + id); if (id === 'remains') await shot('03-workshop'); await drain(); }
    await interact('gate'); await choose(0);
    await page.waitForFunction(() => window.__game?.running && window.__game.story?.state.scene === 'temple', null, { timeout: 180000 }); await drain();
  });
  await test('temple investigation and stage image reveal follow the original sequence', async () => {
    await interact('rules'); await inspect('temple-rules'); await drain();
    await interact('incense'); await inspect('beat-temple-arrival'); await drain();
    for (const id of ['diary', 'newspaper', 'tape', 'ritual']) { await interact(id); await inspect('evidence-' + id); await drain(); }
    for (const id of ['log', 'robe', 'rulebook', 'flashlight']) { await interact(id); await inspect('note-' + id); await drain(); }
    await interact('stage'); assert.equal(await inspect(), null); await choose(); assert.equal(await inspect(), null); await choose(); await inspect('beat-rollcall'); await shot('04-rollcall'); await drain();
    await choose(0); await drain();
    await interact('chalk'); await inspect('note-chalk'); await drain();
    for (let i = 0; i < 3; i++) { await interact('loopmark'); await drain(); }
    await interact('divination'); await choose(0); await drain(); assert(seen.has('beat-phone-draft'));
  });
  await test('mother reveal needs both clues; recorder image waits for Azhe to answer', async () => {
    await interact('death'); await inspect('evidence-death'); await drain();
    await interact('register'); await inspect('note-register'); await drain(); assert(!seen.has('beat-meilan-return'));
    await interact('births'); await inspect('evidence-births'); await drain();
    await interact('tablet'); await inspect('note-tablet'); await choose(); await inspect('beat-meilan-return'); await drain();
    await interact('bucket'); await inspect('note-bucket'); await drain();
    await interact('camp'); await inspect('note-camp'); await choose();
    while (await page.evaluate(() => window.__game.story.modal?.options.length) === 1) {
      const text = await page.locator('.dialogue-line').textContent();
      const id = await inspect();
      if (!seen.has('beat-camp-call')) assert.equal(id, null);
      if (text === '有。') assert.equal(id, 'beat-camp-call');
      await choose();
    }
    assert(seen.has('beat-camp-call')); await choose(0); await drain();
    await interact('relic'); await inspect('evidence-relic'); await drain();
    await interact('descent'); await inspect('three-friends-shoes'); await drain();
    for (const id of ['shoes', 'names', 'confession']) { await interact(id); await inspect((id === 'shoes' ? 'note-' : 'evidence-') + id); await drain(); }
    assert.equal([...seen].filter(id => PICTURES[id].category === 'clue').length, 33);
  });
  await test('C ending images pause input/timing and do not repeat on retry', async () => {
    await page.evaluate(() => window.__game.story.startFinale('C'));
    for (const [phase, id] of [['c-six', 'beat-six-seats'], ['c-fire', 'beat-key-fire'], ['c-girl', 'beat-child-threshold'], ['c-mother', 'beat-mother-daughter']]) {
      await page.evaluate(phase => window.__game.story.finale.debug.to(phase), phase); await inspect(id);
      if (phase === 'c-six') await shot('05-six-seats');
      const before = await page.evaluate(() => window.__game.story.finale.debug.state.t);
      await page.evaluate(() => { const s = window.__game.story; s.update(20); s.finale.update(20); });
      assert.equal(await page.evaluate(() => window.__game.story.finale.debug.state.t), before);
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => !!window.__game.story.modal), false);
      assert.equal(await page.evaluate(() => window.__game.story.finale.debug.state.hold), false);
      assert.equal(await page.evaluate(() => window.__game.story.finale.debug.flags.keyPressed), false);
    }
    await page.evaluate(() => window.__game.story.finale.debug.to('c-fire'));
    assert.equal(await page.evaluate(() => !!window.__game.story.modal), false);
  });
  await test('all ending cards retain their images across checkpoint retry and reload', async () => {
    for (const ending of ['C', 'A', 'B']) {
      await page.evaluate(ending => window.__game.story.finish(ending), ending); await inspect('beat-ending-' + ending.toLowerCase());
      if (ending === 'C') await shot('06-ending-c');
      await choose(0);
      assert.equal(await page.evaluate(() => !!window.__game.story.state.ending), false);
    }
    assert.equal(seen.size, 46);
    await page.goto(`${base}?auto&map=temple&resume`); await page.waitForFunction(() => window.__game?.running && window.__game.story, null, { timeout: 180000 }); await drain();
    await page.evaluate(() => window.__game.story.pictureJournal());
    assert.equal(await page.locator('[data-picture]').count(), 46); await shot('07-archive'); await choose(); await drain();
  });
  await test('small screens preserve the full picture and scrollable choices', async () => {
    for (const size of [{width:800,height:700}, {width:390,height:844}]) {
      await page.setViewportSize(size); await page.evaluate(() => window.__game.story.picture('beat-six-seats')); await inspect();
      assert(await page.locator('.story-card').evaluate(el => el.getBoundingClientRect().right <= innerWidth && el.scrollWidth <= el.clientWidth + 2));
      await page.locator('[data-choice="0"]').scrollIntoViewIfNeeded(); await shot('08-small-' + size.width); await choose();
    }
  });
  await test('missing images leave text and continue usable', async () => {
    await page.route('**/visual-v2/home-letter.webp', r => r.abort());
    await page.evaluate(() => window.__game.story.picture('home-letter'));
    await page.locator('.story-image-fallback').waitFor({ state:'visible' });
    assert.equal(await page.locator('.story-image-open').isVisible(), false);
    await page.keyboard.press('e'); assert.equal(await page.evaluate(() => !!window.__game.story.modal), false);
    await page.unroute('**/visual-v2/home-letter.webp');
  });
  assert.deepEqual(errors, []);
} catch (e) { errors.push(e.stack || String(e)); console.error(e); await shot('failure').catch(() => {}); }
finally {
  fs.writeFileSync(`${out}/results.json`, JSON.stringify({ base, results, images: [...seen], errors }, null, 2));
  await browser.close();
}
if (errors.length) process.exitCode = 1;
