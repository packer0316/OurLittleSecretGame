import * as THREE from 'three';
import { mulberry32 } from '../core/utils.js';
import { createSense } from './sense.js';
import { createFx } from './fx.js';
import { createFigures } from './figures.js';
import { createProps } from './props.js';
import { createDirector } from './director.js';
import { createReactive } from './reactive.js';
import { ghostEvents } from './events/ghosts.js';
import { worldEvents } from './events/world.js';
import { placeEvents } from './events/places.js';
import { createSetpieces } from './setpieces/index.js';

/**
 * 恐怖導演：跨地圖的環境驚嚇、壓迫感與節奏排程。
 * Game 會在地圖載入後呼叫 attach、卸載前呼叫 detach、每幀呼叫 update。
 *
 *  sense.js     玩家感知（轉頭、靜止、視野、手電筒光錐、遮蔽、找位置）
 *  fx.js        輸出：後製 dread/glitch/pulse、聲音、燈光、手電筒、衝臉覆蓋層
 *  figures.js   幽影池（鬼模型合約 E；合約未就緒時回退程序化黑影）
 *  props.js     濕腳印、手印、童鞋、彈珠、赤腳、窗後的臉、電視倒影、門縫腳影
 *  director.js  緊張度模型與「鋪陳 → 逼近 → 爆發 → 喘息」排程
 *  reactive.js  跟著劇情的固定演出加強、追逐壓迫、被抓到的衝臉
 *  events/      所有可被排程的事件
 *
 * 網址參數：?auto 時環境事件預設關閉，加 &horror 才啟用；&nohorror 一律關閉；&hseed=數字 固定亂數種子；
 *           &hfallback 強制使用程序化黑影（不走鬼模型合約的 shadow / child，回歸測試用）。
 *           寺內恐怖段落（setpieces/，dread）：?auto 下預設不自動觸發，加 &setpieces 才會；&nosetpieces 一律關閉。
 * 除錯／驗收：game.horror.debug = { list(), trigger(id), stop(id), state, hold, aim(), run(秒),
 *             setpiece(id, opts), setpieceStop(), setpieceKey(code, down), setpieceState }
 */
export function createHorror(game) {
  const params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
  const ambient = !params.has('nohorror') && (!params.has('auto') || params.has('horror'));
  const seed = Number(params.get('hseed')) || 0;
  const sense = createSense(game), fx = createFx(game);
  const focus = new THREE.Vector3();
  let attached = false, warm = null, faults = 0, lastError = '';

  const h = {
    game, sense, fx, ambient,
    map: null, def: null, id: '', figs: null, props: null, director: null, reactive: null, mapGhostRoot: null, setpieces: null,
    rng: Math.random, time: 0, intensity: 0, hold: false, focus, hasFocus: false,
    get story() { return game.story; },
    /** 事件把自己的視覺放在哪裡（測試截圖與除錯用） */
    setFocus(x, y, z) { focus.set(x, y, z); h.hasFocus = true; },
    fault(err) { faults++; lastError = String(err?.stack || err); },
  };

  /** 把所有幽影與道具先擺在鏡頭前、設為可見，讓 Game 載入時的編譯與暖機那一幀把著色器、貼圖、骨架都準備好。 */
  function beginWarm() {
    const p = game.player, x = p.pos.x - Math.sin(p.yaw) * 2.6, z = p.pos.z - Math.cos(p.yaw) * 2.6, y = p.pos.y;
    const saved = [];
    const put = (o) => { if (!o) return; saved.push({ o, visible: o.visible, x: o.position.x, y: o.position.y, z: o.position.z }); o.visible = true; o.position.set(x, y, z); };
    for (const a of h.figs.list) { put(a.root); a.fig.setFade?.(1); }
    for (const o of h.props.roots) put(o);
    put(h.mapGhostRoot);
    warm = saved;
  }
  function endWarm() {
    for (const sv of warm) { sv.o.visible = sv.visible; sv.o.position.set(sv.x, sv.y, sv.z); }
    warm = null;
  }

  function tick(dt) {
    dt = dt > 0 ? Math.min(dt, 0.1) : 0; // 第一幀的 dt 可能是負的（rAF 時間戳早於 start()）
    if (warm) endWarm();
    const st = game.story;
    // st.scene：劇情或寺內段落正在跑腳本演出（字串 id），隨機環境事件一律暫停，避免搶戲。
    const paused = !!(st && (st.modal || st.busy || st.transitioning || st.scene || st.state?.ending));
    const edt = paused || h.hold ? 0 : dt;
    h.time += dt;
    sense.flashScale = fx.flashMul;
    sense.update(dt);
    h.director.update(edt, dt);
    h.reactive.update(edt, dt, paused);
    h.figs.update(dt, paused || h.hold);
    h.props.update(edt);
    fx.update(edt, dt);
    // 寺內恐怖段落：自己決定何時開始，演出時用 story.scene 暫停上面的隨機事件
    const sp = h.setpieces;
    if (sp) { try { sp.update(dt); } catch (err) { h.fault(err); console.warn('[horror] setpieces failed', err); } }
    const dread = Math.max(h.director.dread, sp?.dread || 0);
    fx.writeFilm(dread, h.director.pulse);
    fx.tension(dread, dt);
  }

  const api = {
    get enabled() { return attached; },
    get ambient() { return ambient; },

    /** 地圖建好、玩家已放入場景之後呼叫。def 是 registry 的地圖定義（def.id = home / road / temple）。 */
    attach(map, def) {
      if (attached) api.detach();
      try {
        h.map = map; h.def = def; h.id = map.id || def?.id || ''; h.time = 0; h.hold = false; h.hasFocus = false; faults = 0; lastError = '';
        h.rng = mulberry32((seed || (Date.now() & 0x7fffffff)) >>> 0);
        // 地圖自己的鬼（固定演出／追逐用）要在建立我們自己的幽影之前先找到
        h.mapGhostRoot = map.storyWorld?.ghost?.root || map.scene.getObjectByName('BorrowedVoice') || null;
        sense.attach(map); fx.attach(map);
        h.figs = createFigures(h); h.props = createProps(h);
        h.director = createDirector(h); h.reactive = createReactive(h);
        const events = [...ghostEvents(h).map((e) => { e.ghost = true; return e; }), ...worldEvents(h), ...placeEvents(h)];
        h.director.setup(events);
        if (h.id === 'temple') {
          fx.prepareRush();
          try { h.setpieces = createSetpieces(h); } catch (err) { console.warn('[horror] setpieces unavailable', err); h.fault(err); h.setpieces = null; }
        }
        beginWarm();
        attached = true;
      } catch (err) {
        console.warn('[horror] attach failed', err); h.fault(err);
        try { api.detach(true); } catch { /* 已盡力清理 */ }
      }
    },

    /** 地圖卸載之前呼叫，移除自己加進場景的所有物件並把燈光／後製還原。 */
    detach(force = false) {
      if (!attached && !force) return;
      attached = false; warm = null;
      try { h.director?.stopAll(); } catch { /* ignore */ }
      try { h.setpieces?.dispose(); } catch { /* ignore */ }
      h.setpieces = null;
      try { h.figs?.dispose(); } catch { /* ignore */ }
      try { h.props?.dispose(); } catch { /* ignore */ }
      try { fx.detach(); } catch { /* ignore */ }
      h.figs = h.props = h.director = h.reactive = h.map = h.mapGhostRoot = null;
    },

    /** 每幀呼叫（在 player、map、story 更新之後、渲染之前）。 */
    update(dt) {
      if (!attached) return;
      try { tick(dt); } catch (err) {
        h.fault(err); console.warn('[horror] update failed', err);
        if (faults > 5) api.detach(); // 不讓導演的錯誤拖垮整個遊戲
      }
    },

    debug: {
      /** 這張地圖上所有事件 */
      list() { return (h.director?.events || []).map((e) => ({ id: e.id, label: e.label, tier: e.tier, family: e.family, maps: e.maps, passive: !!e.passive, falseAlarm: !!e.falseAlarm, running: !!e.running, count: e.count || 0 })); },
      /**
       * 不看節奏直接觸發一個事件；回傳是否成功啟動。
       * natural = true 時不強制擺位：事件照正式遊玩的條件進行（例如轉身鬼要等玩家真的轉頭；被動事件要等自己的觸發條件）。
       */
      trigger(id, natural = false) { return attached ? h.director.force(id, natural) : false; },
      stop(id) { h.director?.stop(id); },
      get hold() { return h.hold; },
      /** hold = true 時事件凍結（幽影不會因為被看到而消失），方便截圖 */
      set hold(v) { h.hold = !!v; },
      /** 把視角轉向目前事件的焦點 */
      aim() {
        if (!h.hasFocus) return false;
        const p = game.player, dx = focus.x - p.pos.x, dz = focus.z - p.pos.z;
        p.yaw = Math.atan2(-dx, -dz); p.pitch = Math.max(-1.2, Math.min(1.2, Math.atan2(focus.y - (p.pos.y + p.eye), Math.hypot(dx, dz))));
        p._syncCamera?.(0); p.flashQuat.copy(game.camera.quaternion);
        return true;
      },
      /** 不渲染地快轉遊戲（測試用） */
      run(seconds, step = 1 / 30) {
        const n = Math.ceil(seconds / step);
        for (let i = 0; i < n && game.map; i++) { game.time += step; game.player.update(step, game.map.world); game.map.update(step, game.time, game.player); game.story?.update(step); api.update(step); }
      },
      /** 寺內恐怖段落：不看觸發條件直接開始（劇情仍需允許）。opts 例如 { phase: 'search' }、{ skipIntro: true } */
      setpiece(id, opts) { return attached && h.setpieces ? h.setpieces.start(id, opts) : false; },
      setpieceStop() { h.setpieces?.stop(); },
      setpiecePoke(opts) { return h.setpieces ? h.setpieces.poke(opts) : false; },
      /** 模擬按鍵（Space 數數／屏息、E 躲藏），不經過 DOM */
      setpieceKey(code, down) { h.setpieces?.kit.setKey(code, down); },
      get setpieceState() { return h.setpieces ? h.setpieces.state() : null; },
      get state() {
        const d = h.director;
        return {
          attached, ambient, map: h.id, time: h.time, dread: d?.dread ?? 0, pulse: d?.pulse ?? 0, phase: d?.phase ?? '', phaseT: d?.phaseT ?? 0, mapTime: d?.mapTime ?? 0,
          intensity: h.intensity, active: (d?.active || []).map((e) => e.id), history: [...(d?.history || [])],
          focus: h.hasFocus ? [focus.x, focus.y, focus.z] : null, hold: h.hold, faults, lastError,
          glitch: fx.glitchValue, flashMul: fx.flashMul, rushing: fx.rushing, sfx: fx.log.slice(-16),
          ghostApi: h.figs?.newApi ? 'contract-E' : 'fallback',
          figures: (h.figs?.list || []).map((a) => ({ kind: a.kind, active: a.active, visible: a.root.visible, pos: a.root.position.toArray().map((v) => +v.toFixed(2)), seen: +a.seen.toFixed(2), visibleNow: a.visibleNow })),
        };
      },
    },
  };
  return api;
}
