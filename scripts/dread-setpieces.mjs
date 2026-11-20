// dread（寺內恐怖段落）驗收：逐段觸發、模擬玩家操作、截圖到 artifacts/dread/。
//   node scripts/dread-setpieces.mjs [段落…]   段落：gate hideseek patrol arhats echoes ash（不給就全部）
import fs from 'node:fs';
import { launch, enter, dismiss, shot, frames, ev, tester, OUT, BASE } from './dread-lib.mjs';

const only = new Set(process.argv.slice(2));
const want = (k) => !only.size || only.has(k);
const { browser, page, errors } = await launch();
const { results, test, must } = tester();
const run = (s) => ev(page, (s) => window.__game.horror.debug.run(s, 1 / 30), s);
const st = () => ev(page, () => window.__game.horror.debug.setpieceState);
const hold = (on) => ev(page, (on) => { window.__game.horror.debug.hold = on; }, on);
const key = (code, down) => ev(page, ([c, d]) => window.__game.horror.debug.setpieceKey(c, d), [code, down]);
/** 擺好劇情狀態與玩家位置（不經過劇情事件） */
const setup = (spec) => ev(page, (spec) => {
  const g = window.__game, s = g.story, S = s.state;
  if (s.modal) { s.modal = null; document.getElementById('story-layer')?.classList.add('hidden'); }
  window.__game.horror.debug.setpieceStop(); window.__game.horror.debug.hold = false;
  S.chapter = spec.chapter; S.evidence = ['photo', ...spec.evidence]; Object.assign(S.flags, { incense: true, stage: false, loopSolved: false, key: false, underground: false }, spec.flags || {});
  S.seen = []; s.scene = null; s.chase = null; s.sync();
  g.player.keys = Object.create(null); g.player.flashOn = true; g.player.flashPower = 1; g.player.enabled = true;
  const [x, y, z, yaw, pitch] = spec.at; g.player.teleport(x, y, z, yaw, pitch || 0);
  g.horror.debug.run(0.4, 1 / 30);
  return { deaths: S.deaths };
}, spec);
const aimAt = (x, y, z) => ev(page, ([x, y, z]) => { const p = window.__game.player, dx = x - p.pos.x, dz = z - p.pos.z; p.yaw = Math.atan2(-dx, -dz); p.pitch = Math.atan2(y - (p.pos.y + p.eye), Math.hypot(dx, dz)); p._syncCamera(0); p.flashQuat.copy(window.__game.camera.quaternion); }, [x, y, z]);
const closeModal = () => ev(page, () => { const s = window.__game.story; let n = 0; while (s.modal && n++ < 6) s.choose(0); return !s.modal; });

try {
  // ── 0. 網址開關：?auto 下不會自動觸發；&setpieces 才會 ──
  if (want('gate')) {
    await enter(page, 'temple');
    await test('?auto without &setpieces: setpieces never auto-start even when every condition holds', async () => {
      await setup({ chapter: 3, evidence: ['diary', 'newspaper', 'tape', 'stage'], flags: { stage: true }, at: [-13, 6.9, -16.2, -Math.PI / 2] });
      await run(6);
      const s = await st();
      must(s && s.auto === false, 'auto should be off: ' + JSON.stringify(s));
      must(!s.active, 'a setpiece started on its own: ' + s.active);
      must(s.list.find((x) => x.id === 'hideseek').can, 'hideseek trigger condition should be true here');
      return `模組 ${s.list.map((x) => x.id).join('、')}`;
    });
    await page.goto(`${BASE}?auto&map=temple&setpieces`);
    await page.waitForFunction(() => window.__game?.running && window.__game.story && window.__game.map, null, { timeout: 240000 });
    await dismiss(page);
    await test('&setpieces: stepping onto 2F in chapter 3 (after the stage) starts the hide-and-seek once', async () => {
      await setup({ chapter: 3, evidence: ['diary', 'newspaper', 'tape', 'stage'], flags: { stage: true }, at: [-13, 6.9, -16.2, -Math.PI / 2] });
      await run(1);
      const s = await st();
      must(s.active === 'hideseek', 'did not auto-start: ' + JSON.stringify(s.list));
      const scene = await ev(page, () => window.__game.story.scene);
      must(scene === 'dread:hideseek', 'story.scene not set: ' + scene);
      await ev(page, () => window.__game.horror.debug.setpieceStop());
      return 'scene = ' + scene;
    });
  }

  // ── 1. 1998 年的捉迷藏 ──
  if (want('hideseek')) {
    if (!want('gate')) await enter(page, 'temple');
    await test('hideseek: lights die, counting to ten with Space, peeking, five echoes, the sixth finds you', async () => {
      await setup({ chapter: 3, evidence: ['diary', 'newspaper', 'tape', 'stage'], flags: { stage: true }, at: [-13.5, 6.9, -16.4, -Math.PI / 2] });
      must(await ev(page, () => window.__game.horror.debug.setpiece('hideseek')), 'refused to start');
      await run(1.0);
      await hold(true); await frames(page, 6); await shot(page, 'hs_01_whisper'); await hold(false);
      await run(2.2);
      let s = await st();
      must(s.detail.phase === 'count', 'not counting yet: ' + s.detail.phase);
      await hold(true); await frames(page, 6); await shot(page, 'hs_02_face_column'); await hold(false);
      await key('Space', true); await run(5.6);
      s = await st(); must(s.detail.count > 4 && s.veil > 0.9, 'count/veil: ' + JSON.stringify(s.detail) + ' veil ' + s.veil);
      await hold(true); await frames(page, 6); await shot(page, 'hs_03_counting_eyes_closed'); await hold(false);
      await key('Space', false); await run(0.9);
      s = await st(); must(s.detail.peeked === 1, 'peek did not show anything');
      await hold(true); await frames(page, 6); await shot(page, 'hs_04_peek'); await hold(false);
      await key('Space', true); await run(7.5); await key('Space', false);
      s = await st(); must(s.detail.phase === 'call', 'should be calling: ' + s.detail.phase);
      await run(6);
      s = await st(); must(s.detail.phase === 'search', 'should be searching: ' + s.detail.phase);
      await hold(true); await frames(page, 6); await shot(page, 'hs_05_search_dark'); await hold(false);
      // 逐一找到五個孩子
      const views = { cabinet: [-15.6, 6.9, -29.4], table: [0.4, 6.9, -21.2], curtain: [15.2, 6.9, -28.4], drum: [-9.6, 6.9, -29.5], stairs: [13.5, 6.9, -26.6] };
      for (const [id, at] of Object.entries(views)) {
        await ev(page, ([at]) => { window.__game.player.teleport(at[0], at[1], at[2], 0, 0); }, [at]);
        const L = { cabinet: [-15.6, 7.9, -30.9], table: [0, 7.25, -22.9], curtain: [15.25, 8.1, -30.08], drum: [-7.75, 7.35, -29.7], stairs: [13.5, 7.35, -23.6] }[id];
        await aimAt(...L); await run(0.5);
        s = await st();
        must(s.detail.revealing === id || s.detail.spots.includes(id), `${id} was not found from ${at}: ${JSON.stringify(s.detail)}`);
        await run(1.3); await hold(true); await frames(page, 6); await shot(page, 'hs_06_found_' + id); await hold(false);
        await run(2.6);
      }
      s = await st(); must(s.detail.found === 5, 'found ' + s.detail.found);
      for (let i = 0; i < 24; i++) { await run(0.5); s = await st(); if (s.detail?.behindShown) break; }
      must(s.detail.behindShown, 'the sixth never came: ' + JSON.stringify(s.detail));
      await run(0.6);
      await ev(page, () => { const p = window.__game.player; p.yaw += Math.PI; p._syncCamera(0); p.flashQuat.copy(window.__game.camera.quaternion); });
      await hold(true); await frames(page, 6); await shot(page, 'hs_07_found_you'); await hold(false);
      await run(3.5);
      s = await st();
      const after = await ev(page, () => ({ seen: window.__game.story.state.seen, scene: window.__game.story.scene, enabled: window.__game.player.enabled }));
      must(!s.active && after.seen.includes('dread:hideseek') && after.scene === null, 'did not finish cleanly: ' + JSON.stringify({ s, after }));
      return `找到 5 個，第六個在背後；seen=${after.seen}`;
    });
  }

  // ── 2. 三樓的巡獵與躲藏 ──
  if (want('patrol')) {
    if (!want('gate') && !want('hideseek')) await enter(page, 'temple');
    const ch4 = { chapter: 4, evidence: ['diary', 'newspaper', 'tape', 'stage', 'death'], flags: { stage: true, loopSolved: true, key: true } };
    await test('patrol intro: the phone hisses, she crawls across the ceiling over your head and drops behind you', async () => {
      await setup({ ...ch4, at: [4.6, 11.9, -26.0, Math.PI / 2, 0.08] });
      must(await ev(page, () => window.__game.horror.debug.setpiece('patrol')), 'refused');
      await run(3.0);
      let s = await st(); must(s.detail.crawl, 'crawl did not start: ' + JSON.stringify(s.detail));
      await run(0.5); await ev(page, () => { const p = window.__game.player; p.pitch = 0.22; p._syncCamera(0); p.flashQuat.copy(window.__game.camera.quaternion); });
      await hold(true); await frames(page, 6); await shot(page, 'pt_01_ceiling_crawl'); await hold(false);
      await run(4);
      s = await st(); must(s.detail.state === 'patrol' && s.woman, 'should be patrolling after the drop: ' + JSON.stringify(s.detail));
      return `她落在 ${s.woman}`;
    });
    await test('patrol: standing in the open in her path gets you caught — evidence kept, deaths+1, back at the checkpoint, saved', async () => {
      await setup({ ...ch4, at: [2.2, 11.9, -20.0, 0, 0] });
      const before = await ev(page, () => ({ deaths: window.__game.story.state.deaths, ev: window.__game.story.state.evidence.length }));
      await ev(page, () => window.__game.horror.debug.setpiece('patrol', { skipIntro: true, at: [2.2, -26.6], state: 'look' }));
      let caught = false, seenChase = false;
      for (let i = 0; i < 60 && !caught; i++) { await run(0.25); const s = await st(); if (s.detail?.state === 'chase') seenChase = true; if (s.catching) caught = true; if (i === 14) { await hold(true); await frames(page, 6); await shot(page, 'pt_02_she_sees_you'); await hold(false); } }
      must(seenChase && caught, `chase ${seenChase} caught ${caught}`);
      await run(0.3); await hold(true); await frames(page, 3); await shot(page, 'pt_03_caught_rush'); await hold(false);
      await run(1.4);
      const after = await ev(page, () => { const s = window.__game.story; return { modal: !!s.modal, title: document.querySelector('#story-title')?.textContent, deaths: s.state.deaths, ev: s.state.evidence.length, pos: window.__game.player.pos.toArray(), saved: JSON.parse(localStorage.getItem('ourlittlesecret-save') || localStorage.getItem(Object.keys(localStorage).find((k) => k.includes('save')) || 'x') || 'null')?.deaths }; });
      must(after.modal && after.deaths === before.deaths + 1 && after.ev === before.ev, 'catch result: ' + JSON.stringify(after));
      await frames(page, 4); await shot(page, 'pt_04_caught_text');
      await closeModal();
      return `「${after.title}」，deaths ${before.deaths}→${after.deaths}，回到 ${after.pos.map((v) => v.toFixed(1))}`;
    });
    await test('patrol: hide (E) behind the curtain — she inspects the spot; holding breath (Space) keeps you safe until you gasp; not holding gets you found', async () => {
      await setup({ ...ch4, at: [11.4, 11.9, -27.9, 0, 0] });
      await ev(page, () => window.__game.horror.debug.setpiece('patrol', { skipIntro: true, at: [-9.6, -17.7] }));
      await run(0.2);
      let s = await st(); must(s.detail.nearSpot === 'curtain', 'no hide prompt at the curtain: ' + JSON.stringify(s.detail));
      await hold(true); await frames(page, 6); await shot(page, 'pt_05a_hide_prompt'); await hold(false);
      await key('KeyE', true); await run(0.1); await key('KeyE', false); await run(0.8);
      s = await st(); must(s.detail.hidden === 'curtain' && s.look, 'not hidden: ' + JSON.stringify(s.detail));
      await hold(true); await frames(page, 6); await shot(page, 'pt_05b_hidden_curtain'); await hold(false);
      const deaths0 = await ev(page, () => window.__game.story.state.deaths);
      await ev(page, () => window.__game.horror.debug.setpiecePoke({ at: [9.6, -27.6], state: 'inspect' }));
      await key('Space', true); await run(4.0);
      s = await st(); must(s.detail.hidden === 'curtain' && !s.catching && s.detail.holding && s.detail.d < 2, 'holding breath with her at the curtain should keep you safe: ' + JSON.stringify(s.detail));
      await hold(true); await frames(page, 6); await shot(page, 'pt_06_holding_breath_she_is_there'); await hold(false);
      let caught = false; for (let i = 0; i < 14 && !caught; i++) { await run(0.5); caught = (await st()).catching; }
      await key('Space', false);
      must(caught, 'holding ~10 s with her nearby should end in a gasp and a catch');
      await run(1.6); await closeModal();
      // 不屏息：經櫃
      await ev(page, () => window.__game.player.teleport(1.6, 11.9, -28.0, 0, 0)); await run(0.3);
      await key('KeyE', true); await run(0.1); await key('KeyE', false); await run(0.8);
      s = await st(); must(s.detail.hidden === 'cabinet', 'not hidden in the cabinet: ' + JSON.stringify(s.detail));
      await hold(true); await frames(page, 6); await shot(page, 'pt_07_hidden_cabinet'); await hold(false);
      await ev(page, () => window.__game.horror.debug.setpiecePoke({ at: [3.4, -27.4], state: 'inspect' }));
      caught = false; for (let i = 0; i < 16 && !caught; i++) { await run(0.4); caught = (await st()).catching; }
      must(caught, 'breathing next to her should get you found');
      await run(1.6);
      const after = await ev(page, () => ({ deaths: window.__game.story.state.deaths, ev: window.__game.story.state.evidence.length }));
      must(after.deaths === deaths0 + 2, 'deaths ' + JSON.stringify(after));
      await closeModal();
      return `屏息時安全、憋太久喘出聲被抓、沒屏息被聽到；deaths ${deaths0}→${after.deaths}`;
    });
    await test('patrol: the phone is a detector (static rises as she nears); taking the height marks and leaving 3F ends it', async () => {
      await setup({ ...ch4, at: [-10.0, 11.9, -27.6, Math.PI, 0] });
      await ev(page, () => window.__game.horror.debug.setpiece('patrol', { skipIntro: true, at: [9.6, -17.7] }));
      await run(0.6); const far = (await st()).detail.phone;
      await ev(page, () => { const d = window.__game.horror.debug; d.setpiecePoke({ at: [-8.6, -25.4], state: 'look', heading: 0 }); });
      await run(0.8); const near = (await st()).detail.phone;
      must(near > far + 0.25, `phone near ${near} far ${far}`);
      await hold(true); await frames(page, 6); await shot(page, 'pt_07_phone_detector'); await hold(false);
      await ev(page, () => { const s = window.__game.story; s.collect('births'); while (s.modal) s.choose(0); window.__game.player.teleport(13.5, 6.9, -16.0, 0, 0); });
      await run(1.5);
      const s = await st(); const seen = await ev(page, () => window.__game.story.state.seen);
      must(!s.active && seen.includes('dread:patrol'), 'did not complete: ' + JSON.stringify({ s, seen }));
      return `手機雜訊 遠 ${far.toFixed(2)} → 近 ${near.toFixed(2)}`;
    });
  }

  // ── 3. 木頭人 ──
  if (want('arhats')) {
    if (!['gate', 'hideseek', 'patrol'].some(want)) await enter(page, 'temple');
    const ch4r = { chapter: 4, evidence: ['diary', 'newspaper', 'tape', 'stage', 'death', 'births', 'relic'], flags: { stage: true, loopSolved: true, key: true } };
    await test('arhats: every statue turns its head at once; the blindfolded arhats move only while unlit; a catch resets them', async () => {
      await setup({ ...ch4r, at: [-12.5, 0.9, -24.0, 0, 0] });
      must(await ev(page, () => window.__game.horror.debug.setpiece('arhats', { noFlash: true })), 'refused');
      await run(0.4); await aimAt(-14.3, 2.3, -32.9);
      await hold(true); await frames(page, 6); await shot(page, 'ar_01_heads_turned'); await hold(false);
      await run(2.4);
      const lit0 = (await st()).detail.statues;
      await run(1.5); const lit1 = (await st()).detail.statues;
      const litBoth = lit0.map((m, i) => m[4] && lit1[i][4] && Math.hypot(m[0] - lit1[i][0], m[2] - lit1[i][2]) > 0.01);
      must(lit0.filter((m) => m[4]).length >= 2, 'fewer than two statues were in the beam: ' + JSON.stringify(lit0));
      must(!litBoth.some(Boolean), 'a statue moved while it was in the flashlight: ' + JSON.stringify({ lit0, lit1 }));
      await ev(page, () => { const p = window.__game.player; p.yaw += Math.PI; p._syncCamera(0); p.flashQuat.copy(window.__game.camera.quaternion); });
      await run(1.2);
      const moved = (await st()).detail.statues;
      must(moved.some((m, i) => Math.hypot(m[0] - lit1[i][0], m[2] - lit1[i][2]) > 0.8), 'statues did not move while unlit');
      await ev(page, () => { const p = window.__game.player; p.yaw -= Math.PI; p._syncCamera(0); p.flashQuat.copy(window.__game.camera.quaternion); });
      await run(0.1); await hold(true); await frames(page, 6); await shot(page, 'ar_02_they_moved'); await hold(false);
      const d0 = await ev(page, () => window.__game.story.state.deaths);
      await ev(page, () => { const p = window.__game.player; p.yaw += Math.PI; p._syncCamera(0); p.flashQuat.copy(window.__game.camera.quaternion); });
      let caught = false; for (let i = 0; i < 30 && !caught; i++) { await run(0.2); caught = (await st()).catching; }
      must(caught, 'never caught with your back turned');
      await run(1.6);
      const r = await ev(page, () => ({ deaths: window.__game.story.state.deaths, modal: !!window.__game.story.modal, ev: window.__game.story.state.evidence.length }));
      must(r.deaths === d0 + 1 && r.modal && r.ev === 8, 'catch result ' + JSON.stringify(r));
      await frames(page, 4); await shot(page, 'ar_03_caught_text'); await closeModal();
      const back = (await st()).detail.statues;
      must(back.every((m) => Math.abs(m[2] + 32.92) < 0.05), 'statues not back on the altar after the catch');
      return `被抓前 ${moved.filter((m) => m[3]).length} 尊在動；被抓後回到佛壇`;
    });
    await test('arhats: on the stairs the flashlight flickers twice and dies — when it comes back they are right there; reaching 2F ends it', async () => {
      await setup({ ...ch4r, at: [-16.1, 0.9, -25.0, 0, 0] });
      await ev(page, () => window.__game.horror.debug.setpiece('arhats', { phase: 'stalk' }));
      await run(0.2);
      // 倒退上樓：面朝北（看著佛像），往南移
      await ev(page, () => { const p = window.__game.player; p.teleport(-16.1, 3.0, -23.5, 0, -0.25); });
      await run(0.4);
      let s = await st(); must(s.detail.flashDone, 'the flashlight failure did not trigger on the stairs');
      await run(2.25);
      await hold(true); await frames(page, 6); await shot(page, 'ar_04_light_back_they_are_here'); await hold(false);
      s = await st(); const nearest = s.detail.nearest;
      await ev(page, () => window.__game.player.teleport(-14.2, 6.9, -16.2, Math.PI, 0));
      await run(2.5);
      s = await st(); const seen = await ev(page, () => window.__game.story.state.seen);
      must(!s.active && seen.includes('dread:arhats'), 'did not finish ' + JSON.stringify(s));
      return `燈亮回來時最近的羅漢 ${nearest} m`;
    });
  }

  // ── 4. 三個朋友的回聲 ──
  if (want('echoes')) {
    if (!['gate', 'hideseek', 'patrol', 'arhats'].some(want)) await enter(page, 'temple');
    const cases = [
      ['echo1', { chapter: 2, evidence: ['diary'], at: [-16.1, 3.0, -23.5, Math.PI, 0] }, [-12.05, 1.95, -27.45]],
      ['echo2', { chapter: 4, evidence: ['diary', 'newspaper', 'tape', 'stage'], flags: { stage: true, loopSolved: true, key: true }, at: [2.0, 6.9, -20.0, Math.PI, 0] }, [5.72, 7.95, -28.42]],
      ['echo3', { chapter: 4, evidence: ['diary', 'newspaper', 'tape', 'stage', 'death', 'births', 'relic'], flags: { stage: true, loopSolved: true, key: true }, at: [-3.5, 11.9, -26.7, Math.PI / 2, 0] }, [5.0, 12.95, -25.95]],
    ];
    for (const [id, spec, head] of cases) {
      await test(`${id}: a red-cloth figure appears where you are not looking, answers "有" when seen, gone when you look away`, async () => {
        await setup(spec);
        let s = await st(); const can = s.list.find((x) => x.id === id).can;
        must(can, `${id} trigger condition false at ${spec.at}`);
        must(await ev(page, (id) => window.__game.horror.debug.setpiece(id), id), 'refused');
        await aimAt(...head); await run(0.9);
        s = await st(); must(s.detail.phase === 'said', 'did not answer: ' + JSON.stringify(s.detail));
        await run(0.2); await hold(true); await frames(page, 6); await shot(page, 'ec_' + id); await hold(false);
        await ev(page, () => { const p = window.__game.player; p.yaw += Math.PI; p._syncCamera(0); p.flashQuat.copy(window.__game.camera.quaternion); });
        await run(3.0);
        s = await st(); const seen = await ev(page, () => window.__game.story.state.seen);
        must(!s.active && seen.includes('dread:' + id), 'not finished: ' + JSON.stringify(s));
        return 'ok';
      });
    }
  }

  // ── 5. 香灰上的字 ──
  if (want('ash')) {
    if (!['gate', 'hideseek', 'patrol', 'arhats', 'echoes'].some(want)) await enter(page, 'temple');
    await test('ash: coming down the west stairs, a line of child handwriting surfaces in spilled incense ash', async () => {
      await setup({ chapter: 3, evidence: ['diary', 'newspaper', 'tape'], at: [-16.1, 3.4, -22.5, 0, -0.42] });
      const can = (await st()).list.find((x) => x.id === 'ash').can;
      must(can, 'ash trigger false');
      await ev(page, () => window.__game.horror.debug.setpiece('ash'));
      await run(2.4); await hold(true); await frames(page, 6); await shot(page, 'ash_01_forming'); await hold(false);
      await run(2.6); await hold(true); await frames(page, 6); await shot(page, 'ash_02_full'); await hold(false);
      await ev(page, () => window.__game.player.teleport(-16.1, 0.9, -27.6, 0, -0.75));
      await run(2.6); await hold(true); await frames(page, 6); await shot(page, 'ash_03_smeared'); await hold(false);
      const s = await st(); const seen = await ev(page, () => window.__game.story.state.seen);
      must(s.active !== 'ash' && seen.includes('dread:ash'), 'not finished ' + JSON.stringify(s));
      return 'ok';
    });
  }

  await test('no faults or page errors', async () => {
    const f = await ev(page, () => window.__game.horror.debug.state);
    must(!f.faults, 'faults: ' + f.lastError);
    must(!errors.length, 'page errors: ' + errors.slice(0, 3).join(' | '));
    return '';
  });
} catch (e) {
  results.push({ name: 'script', pass: false, error: String(e.stack || e) }); console.log('ERROR', e.stack || e);
} finally {
  fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 1));
  const pass = results.filter((r) => r.pass).length;
  console.log(`\n${pass}/${results.length} passed`);
  await browser.close();
  process.exit(pass === results.length ? 0 : 1);
}
