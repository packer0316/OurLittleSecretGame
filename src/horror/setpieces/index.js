import * as THREE from 'three';
import { createGhost } from '../../maps/temple/ghost.js';
import { createKit } from './kit.js';
import { createSynth } from './synth.js';
import { createSetProps } from './props.js';
import { hideSeek } from './hideseek.js';
import { patrol } from './patrol.js';
import { arhats } from './arhats.js';
import { echoes } from './echoes.js';
import { ashWriting } from './ash.js';

/**
 * 寺內恐怖段落（dread）：玩家必須做點什麼才能過去的恐怖玩法段落。
 *
 *   hideseek  第三章，戲台之後第一次上二樓：1998 年的捉迷藏（面牆數到十、在黑暗裡找出五個孩子的回聲，第六個找到你）
 *   patrol    第四章，拿到阿哲的手機後：女影在三樓巡獵（躲進經櫃／供桌下／布幔後、屏住呼吸、手機是探測器）
 *   arhats    第四章，從老樹下回到一樓：所有佛像同時轉頭；蒙眼的羅漢在沒被手電筒照著時靠近（木頭人）
 *   echo1..3  三個朋友的回聲：蒙紅布坐在凳子上的人，答一聲「有」，移開視線就不見（阿哲、志豪、柏翰）
 *   ash       第三章：西側樓梯下，翻倒的香爐撒出來的香灰上，慢慢浮現一行小孩的字
 *
 * 每段都是 { id, setup(), canStart(), start(), update(dt) -> true(完成) | 'suspend'(暫停、之後重來) | false, stop(), dispose() }。
 * 觸發只在 story.scene 為 null、沒有追逐／儀式／閱讀／結局時；開始時設 story.scene = 'dread:<id>'，結束清回 null；
 * 演完寫進 state.seen（'dread:<id>'）並存檔，讀檔後不重演。
 * 網址：?auto 下預設不自動觸發（加 &setpieces 才會）；&nosetpieces 一律關閉。
 */
export function createSetpieces(h) {
  const { game, map } = h;
  const params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
  const auto = !params.has('nosetpieces') && (!params.has('auto') || params.has('setpieces'));
  const kit = createKit(h);
  kit.synth = createSynth(game);
  kit.props = createSetProps(game);
  const roots = [];
  kit.addRoot = (o, parent = map.scene) => { parent.add(o); roots.push(o); return o; };
  // 段落共用的鬼：女影（最多一個）、孩子（六個，便宜）
  kit.woman = createGhost(game.assets, { variant: 'woman' });
  kit.addRoot(kit.woman.root);
  kit.children = Array.from({ length: 6 }, () => { const g = createGhost(game.assets, { variant: 'child' }); kit.addRoot(g.root); return g; });
  kit.eye = new THREE.Vector3();
  kit.time = 0;
  kit.dread = 0; kit.pulse = 0;

  const mods = [...echoes(h, kit), ashWriting(h, kit), hideSeek(h, kit), patrol(h, kit), arhats(h, kit)];
  for (const m of mods) { try { m.setup(); } catch (err) { h.fault(err); console.warn('[dread] setup failed', m.id, err); m.broken = true; } }

  let active = null, pollT = 0, ghostT = 0, lastResult = '';
  kit.dreadTo = 0;
  const seenKey = (m) => 'dread:' + m.id;
  const st = () => game.story;
  const isSeen = (m) => !!st()?.state?.seen?.includes(seenKey(m));
  /** 劇情此刻允許開始一段演出 */
  const free = () => { const s = st(); return !!(s && s.state && !s.scene && !s.chase && !s.ritual && !s.modal && !s.busy && !s.transitioning && !s.state.ending && game.running !== false && !game.map?.storyWorld?.scareActive); };

  function begin(m) {
    const s = st();
    kit.hush(); // 上一段留下的字幕不要壓在新段落的字幕上
    try { if (m.start() === false) return false; } catch (err) { h.fault(err); console.warn('[dread] start failed', m.id, err); try { m.stop(); } catch { /* 已盡力 */ } return false; }
    active = m; s.scene = seenKey(m); lastResult = '';
    return true;
  }
  function finish(result) {
    const m = active; if (!m) return;
    active = null;
    try { m.stop(result); } catch (err) { h.fault(err); }
    kit.freeze(false); kit.endLook(); kit.veil(0, 4); kit.mask(''); kit.prompt(''); kit.goal(''); kit.phone(false); kit.breathMeter(null); kit.count(0);
    kit.wantSpace = false; kit.claimE = false; kit.blockStory = false; kit.synth.silence(); kit.dreadTo = 0; kit.womanClock = null; kit.womanWalk = false;
    const s = st();
    if (s && s.scene === seenKey(m)) s.scene = null;
    lastResult = result === true ? 'done' : String(result);
    // 段落之間至少隔一段喘息（暫停的段落很快可以再來）
    pollT = result === true ? 30 : 4;
    if (result === true && s?.state) {
      const seen = s.state.seen || (s.state.seen = []);
      if (!seen.includes(seenKey(m)) && seen.length < 64) seen.push(seenKey(m));
      s.save();
    }
  }

  const api = {
    kit, mods, roots, auto,
    get active() { return active; },
    get dread() { return kit.dread; },
    get pulse() { return kit.pulse; },

    update(dt) {
      const s = st();
      if (!s?.state) return;
      const modal = !!s.modal, hold = !!h.hold; // hold：除錯凍結（截圖用），與恐怖導演的 debug.hold 同一個開關
      const step = modal || hold ? 0 : dt;
      kit.time += step;
      kit.eye.set(game.player.pos.x, game.player.pos.y + game.player.eye, game.player.pos.z);
      if (!modal && !hold) kit.update(dt);
      // 自己的鬼要每幀推進動畫（不經過恐怖導演的幽影池，所以導演暫停時仍會動）
      ghostT += step;
      if (kit.woman.root.visible) kit.woman.update(kit.womanClock ?? ghostT, !!kit.womanWalk);
      for (const c of kit.children) if (c.root.visible) c.update(ghostT, false);
      if (active) {
        // 別人中途接手（例如結局）或劇情進入追逐／結局：乾淨中止，不算演過
        if (s.state.ending || s.ritual || s.chase || (s.scene && s.scene !== seenKey(active))) { finish('aborted'); return; }
        let r = false;
        try { r = active.update(step); } catch (err) { h.fault(err); console.warn('[dread] update failed', active.id, err); r = 'error'; }
        if (r) finish(r);
      } else if (auto && !modal && !hold) {
        pollT -= dt;
        if (pollT <= 0) {
          pollT = 0.2;
          if (free()) for (const m of mods) { if (m.broken || isSeen(m)) continue; let ok = false; try { ok = m.canStart(); } catch (err) { h.fault(err); } if (ok && begin(m)) break; }
        }
      }
      // 後製的壓迫感：段落自己的 dread 與導演取大者（index.js 寫入）
      kit.dread += ((active ? kit.dreadTo : 0) - kit.dread) * Math.min(1, dt * 2);
      if (!modal) kit.applyView(dt);
    },

    /** 除錯／測試：不看觸發條件直接開始（仍需劇情允許）。opts 交給模組的 force(opts) */
    start(id, opts = {}) {
      const m = mods.find((x) => x.id === id); if (!m || m.broken) return false;
      if (active) finish('replaced');
      const s = st(); if (!s?.state || (s.scene && !s.scene.startsWith('dread:'))) return false;
      if (s.scene) s.scene = null;
      m.force?.(opts);
      return begin(m);
    },
    stop() { if (active) finish('stopped'); },
    /** 除錯／測試：對進行中的段落下指令（例如把巡獵的她放到某處） */
    poke(opts) { return active?.poke ? (active.poke(opts), true) : false; },
    state() {
      return {
        auto, active: active?.id || null, last: lastResult,
        list: mods.map((m) => ({ id: m.id, seen: isSeen(m), broken: !!m.broken, can: (() => { try { return !!m.canStart(); } catch { return false; } })() })),
        detail: active?.debug?.() || null,
        frozen: kit.frozen, look: kit.look.on, catching: kit.catching, veil: +kit.veilValue.toFixed(2), dread: +kit.dread.toFixed(2),
        woman: kit.woman.root.visible ? kit.woman.root.position.toArray().map((v) => +v.toFixed(2)) : null,
        children: kit.children.filter((c) => c.root.visible).length,
      };
    },
    dispose() {
      if (active) finish('detached');
      for (const m of mods) { try { m.dispose?.(); } catch { /* 已盡力 */ } }
      for (const o of roots) o.removeFromParent();
      try { kit.woman.dispose(); } catch { /* 已盡力 */ }
      for (const c of kit.children) { try { c.dispose(); } catch { /* 已盡力 */ } }
      kit.synth.dispose(); kit.props.dispose(); kit.dispose();
    },
  };
  return api;
}
