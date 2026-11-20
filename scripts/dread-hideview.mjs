// dread：三個躲藏點的「從裡面往外看」——她走到躲藏點前、彎腰往縫裡看的那一刻（截圖給人眼檢查）
import { launch, enter, shot, frames, ev } from './dread-lib.mjs';

const { browser, page, errors } = await launch();
const run = (s) => ev(page, (s) => window.__game.horror.debug.run(s, 1 / 30), s);
try {
  await enter(page, 'temple');
  const spots = [['curtain', [11.4, -27.9, 0], [9.6, -27.6]], ['cabinet', [1.6, -28.0, 0], [3.4, -27.4]], ['table', [-9.7, -22.0, Math.PI / 2], [-9.6, -24.5]]];
  for (const [id, at, her] of spots) {
    await ev(page, ([at]) => {
      const g = window.__game, s = g.story, S = s.state, d = g.horror.debug;
      d.setpieceStop(); d.hold = false;
      S.chapter = 4; S.evidence = ['photo', 'diary', 'newspaper', 'tape', 'stage', 'death']; Object.assign(S.flags, { incense: true, stage: true, loopSolved: true, key: true }); S.seen = []; s.scene = null; s.sync();
      g.player.teleport(at[0], 11.9, at[1], at[2], 0); g.player.flashOn = true; d.run(0.3, 1 / 30);
      d.setpiece('patrol', { skipIntro: true, at: [-9.6, -17.7] }); d.run(0.2, 1 / 30);
    }, [at]);
    await ev(page, () => window.__game.horror.debug.setpieceKey('KeyE', true)); await run(0.1); await ev(page, () => window.__game.horror.debug.setpieceKey('KeyE', false)); await run(0.9);
    const st = await ev(page, () => window.__game.horror.debug.setpieceState.detail);
    console.log(id, 'hidden =', st.hidden);
    await ev(page, (her) => window.__game.horror.debug.setpiecePoke({ at: her, state: 'inspect' }), her);
    await ev(page, () => window.__game.horror.debug.setpieceKey('Space', true));
    await run(3.4);
    await ev(page, () => { window.__game.horror.debug.hold = true; }); await frames(page, 8);
    await shot(page, 'hv_' + id);
    await ev(page, () => { const d = window.__game.horror.debug; d.hold = false; d.setpieceKey('Space', false); d.setpieceStop(); });
  }
  console.log('errors', errors);
} finally { await browser.close(); }
