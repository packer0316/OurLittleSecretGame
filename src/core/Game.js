import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Assets } from './Assets.js';
import { Player } from './Player.js';
import { AudioSys } from './AudioSys.js';
import { flashlightCookie } from './canvasTex.js';
import { createFilmPass } from './postfx.js';
import { createHorror } from '../horror/index.js';
import {
  OPT, LightPool, OccluderPrepass, PrepassRenderPass, GpuTimer, DynamicResolution, LateObjects,
  collectTextures, uploadTextures, compileFor, forcedVisible, uploadGeometries, makeDepthWarmers, nextFrame,
} from './perf.js';

// maxPixels：內部渲染解析度的像素上限。高 DPI 螢幕（4K、筆電 2.8K）不會再照原生解析度硬算。
export const QUALITY = {
  low: { label: '低', pixelRatio: 0.8, maxPixels: 1.0e6, shadow: 1024, flashShadow: 512, bloom: false, msaa: 0 },
  medium: { label: '中', pixelRatio: 1, maxPixels: 2.1e6, shadow: 2048, flashShadow: 1024, bloom: true, msaa: 0 },
  high: { label: '高', pixelRatio: 1.5, maxPixels: 4.2e6, shadow: 4096, flashShadow: 1024, bloom: true, msaa: 4 },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.settings = { quality: 'medium', sensitivity: 1, volume: 0.8 };
    const renderer = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' }));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.info.autoReset = false;

    this.camera = new THREE.PerspectiveCamera(68, 1, 0.06, 400);
    this.assets = new Assets(renderer);
    this.audio = new AudioSys();
    this.player = new Player(this.camera, canvas, { cookie: flashlightCookie(), audio: this.audio });
    this.player.onFootstep = (s) => this.audio.footstep(s, this.map?.surfaceAt?.(this.player.pos) || 'dirt');
    this.player.onTeleport = (dist) => { if (dist > 4 && this.running) this.blink(); };
    this.map = null;
    this.running = false;
    this.time = 0;
    this.fps = 0;
    this.fullBright = false;
    this.onFrame = null;
    /** 內部解析度已降到最低仍然太慢時呼叫（main.js 用來在第一次遊玩時自動調低畫質） */
    this.onQualityHint = null;
    /** 換場與瞬間傳送的淡入淡出。自動化測試（?auto）由 main.js 關閉，截圖才不會拍到轉場。 */
    this.transitions = true;
    this._last = 0;
    this._raf = 0;
    this._skip = 0;
    this._basePr = 1;
    /** 效能輔助，見 perf.js。gpuMs / frameMs / drs.scale 可供除錯與量測讀取。 */
    this.perf = {
      lights: new LightPool(8),
      prepass: new OccluderPrepass(),
      drs: new DynamicResolution(),
      late: new LateObjects(),
      gpu: new GpuTimer(renderer),
      warm: OPT('warm'),
      cap: OPT('cap'),
      frameMs: 16.7,
      prewarmed: [], // 載入後才暖機的物件名稱（除錯用）
      get gpuMs() { return this.gpu.ms; },
    };
    this.perf.drs.enabled = OPT('drs');

    // 轉場用的黑幕：在畫布上方、HUD 與文件視窗下方
    const fader = (this.fader = document.createElement('div'));
    fader.id = 'perf-fade';
    fader.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;z-index:4;';
    canvas.insertAdjacentElement('afterend', fader);

    this._buildComposer();
    this.horror = createHorror(this);
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  _buildComposer() {
    const q = QUALITY[this.settings.quality];
    const size = new THREE.Vector2(1, 1);
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: q.msaa });
    if (this.composer) {
      for (const pass of this.composer.passes) pass.dispose?.(); // 泛光的十幾個渲染目標不會跟著 composer 釋放
      this.composer.dispose();
    }
    this.composer = new EffectComposer(this.renderer, rt);
    this.renderPass = new PrepassRenderPass(new THREE.Scene(), this.camera, this.perf.prepass);
    this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(size, 0.42, 0.75, 0.92);
    this.bloom.enabled = q.bloom;
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.film = createFilmPass();
    this.composer.addPass(this.film);
    if (this.map) this.renderPass.scene = this.map.scene;
  }

  applySettings(s = {}) {
    const qualityChanged = !!s.quality && s.quality !== this.settings.quality;
    Object.assign(this.settings, s);
    this.player.sensitivity = this.settings.sensitivity;
    this.audio.setVolume(this.settings.volume);
    const q = QUALITY[this.settings.quality];
    if (qualityChanged) { this._buildComposer(); this.perf.drs.reset(); }
    const shadow = this.player.flash.shadow;
    if (shadow.mapSize.x !== q.flashShadow) {
      shadow.mapSize.set(q.flashShadow, q.flashShadow);
      shadow.map?.dispose();
      shadow.map = null;
    }
    if (qualityChanged) this.map?.setQuality?.(q);
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const q = QUALITY[this.settings.quality];
    let pr = Math.min(window.devicePixelRatio || 1, 2) * q.pixelRatio;
    if (this.perf.cap) {
      const px = w * h * pr * pr;
      if (px > q.maxPixels) pr *= Math.sqrt(q.maxPixels / px);
    }
    this._basePr = pr;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this._applyScale();
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** 只調整後製鏈內部的渲染目標；畫布本身不動，最後一個 pass 會把畫面放大回畫布大小 */
  _applyScale() {
    const s = this._basePr * this.perf.drs.scale;
    this.composer.setPixelRatio(1);
    this.composer.setSize(Math.max(1, Math.round(window.innerWidth * s)), Math.max(1, Math.round(window.innerHeight * s)));
  }

  async loadMap(def, onProgress) {
    this.unloadMap();
    const P = this.perf;
    const mod = await def.load();
    // 錄音素材和貼圖、模型同時下載與解碼（解碼在背景執行緒，不會拖長載入）；沒有音訊時跳過
    this.audio.bank?.stopLoops(0.2);
    const sounds = this.audio.bank ? this.audio.bank.preload(def.id).catch((err) => console.warn('[audio] preload failed', err)) : null;
    await this.assets.preload(mod.ASSETS, (p) => onProgress?.(p * 0.55, '載入素材'));
    onProgress?.(0.56, '建構場景');
    await sleep(30);
    const map = await mod.create(this, (p, label) => onProgress?.(0.56 + p * 0.2, label));
    this.map = map;
    map.id = map.id || def.id;
    map.scene.add(this.player.rig);
    map.setQuality?.(QUALITY[this.settings.quality]);
    this.renderPass.scene = map.scene;
    this.respawn();
    this.horror.attach(map, def);
    P.lights.attach(map.scene, this.camera);
    P.prepass.attach(map.scene);
    P.drs.reset();
    this._applyScale();
    await this._warmup(map, onProgress);
    P.late.attach(map.scene);
    if (sounds) { onProgress?.(0.99, '載入聲音'); await sounds; }
    this.audio.mapReady?.(map.id);
    onProgress?.(1, '完成');
  }

  /**
   * 載入的最後階段：把貼圖、shader 與幾何全部送進 GPU，之後第一次看到任何東西（鬼、其他樓層、演出道具）都不必再等。
   * 進度條回報的是實際完成的數量。
   */
  async _warmup(map, onProgress) {
    const R = this.renderer, P = this.perf, scene = map.scene;
    if (!P.warm) { // 舊流程，僅供量測對照
      onProgress?.(0.96, '編譯著色器');
      await sleep(30);
      try { await R.compileAsync(scene, this.camera); } catch { /* 部分瀏覽器不支援 */ }
      map.update(0.016, 0, this.player);
      this.composer.render(0.016);
      return;
    }
    onProgress?.(0.77, '準備貼圖');
    await nextFrame();
    try {
      await uploadTextures(R, collectTextures(scene), { sliceMs: 12, onProgress: (p, i, n) => onProgress?.(0.77 + p * 0.08, `準備貼圖 ${i}/${n}`) });
    } catch (err) { console.warn('[perf] 貼圖暖機失敗', err); }
    if (this.map !== map) return;
    onProgress?.(0.85, '編譯著色器');
    const warmers = makeDepthWarmers();
    warmers.position.copy(this.camera.position);
    scene.add(warmers);
    try {
      await compileFor(R, this.composer.readBuffer, scene, this.camera, scene, (p, i, n) => onProgress?.(0.85 + p * 0.11, `編譯著色器 ${i}/${n}`));
    } catch (err) { console.warn('[perf] 著色器預編譯失敗', err); }
    if (this.map !== map) { warmers.userData.dispose(); return; }
    onProgress?.(0.97, '點亮場景');
    await nextFrame();
    map.update(0.016, 0, this.player);
    P.lights.update(this.camera, 0, true);
    this.player.flash.shadow.needsUpdate = true; // 手電筒關著的地圖也先把陰影用的 shader 備好
    try { forcedVisible(scene, () => this.composer.render(0.016)); }
    finally { scene.remove(warmers); warmers.userData.dispose(); }
    // 恐怖導演在 attach 時把自己的角色擺到鏡頭前等暖機；先讓它收回去，「點擊開始」的底圖才不會露出來
    this.horror.update(0);
    map.update(0.016, 0, this.player);
    P.lights.update(this.camera, 0, true);
    this.composer.render(0.016);
  }

  /**
   * 替載入之後才建立的物件暖機（貼圖、shader、頂點緩衝），避免它第一次顯示的那一幀卡頓。
   * 物件請先加進場景（可以是隱藏的）。Game 也會自動偵測載入後新增的隱藏物件並呼叫這裡。
   */
  async prewarm(object) {
    const map = this.map;
    if (!map || !object || !this.perf.warm) return;
    const R = this.renderer, scene = map.scene;
    this.perf.prewarmed.push(object.name || object.type);
    try {
      await uploadTextures(R, collectTextures(object), { sliceMs: 4 });
      if (this.map !== map) return;
      let hasLight = false;
      object.traverse((o) => { if (o.isLight && o.layers.test(this.camera.layers)) hasLight = true; });
      if (!hasLight) await compileFor(R, this.composer.readBuffer, object, this.camera, scene);
      if (this.map !== map) return;
      uploadGeometries(R, object, this.camera);
    } catch (err) { console.warn('[perf] prewarm 失敗', err); }
  }

  respawn() {
    const s = this.map.spawn;
    this.player.teleport(s.x, this.map.world.probe(s.x, s.z, 1000).g, s.z, s.yaw, s.pitch||0);
    this.player.flashAvailable = this.map.flashAvailable !== false;
    this.player.flashOn = this.map.flashOn !== false;
    this.player.flashPower = this.player.flashOn ? 1 : 0;
  }

  unloadMap() {
    this.stop();
    this.story?.dispose();
    this.story = null;
    if (!this.map) return;
    this.horror.detach();
    this.audio.bank?.stopLoops(0.2);
    this.audio.mapReady?.(null); // 聲音模組：地圖卸載（停掉自己的持續聲）
    const P = this.perf, scene = this.map.scene;
    P.late.detach();
    P.prepass.detach();
    P.lights.detach();
    scene.remove(this.player.rig);
    const textures = collectTextures(scene);
    this.map.dispose?.();
    this._sweep(scene, textures);
    this.map = null;
  }

  /**
   * 地圖自己的 dispose 之後再掃一次：程序化貼圖（招牌、符咒、污漬）、骨架貼圖與實例緩衝原本不會被釋放，
   * 每進出一次地圖就多幾十張留在 GPU。素材快取裡的貼圖保留，下一張地圖可以直接用。
   */
  _sweep(scene, textures) {
    const keep = this.assets.cachedTextures();
    for (const t of textures) if (!keep.has(t)) t.dispose();
    scene.traverse((o) => {
      o.geometry?.dispose();
      const m = o.material;
      if (m) for (const x of Array.isArray(m) ? m : [m]) x.dispose?.();
      o.skeleton?.dispose?.();
      if (o.isInstancedMesh) o.dispose();
      if (o.isLight) o.shadow?.map?.dispose();
    });
  }

  start() {
    if (this.running || !this.map) return;
    this.running = true;
    this.player.enabled = true;
    this._last = performance.now();
    const tick = (now) => {
      if (!this.running) return;
      this._raf = requestAnimationFrame(tick);
      const ms = now - this._last; // rAF 的時間戳可能比 start() 當下還早，第一幀要擋掉負值
      const dt = Math.max(0, Math.min(0.05, ms / 1000));
      this._last = now;
      this._pace(ms);
      this.frame(dt);
    };
    this._raf = requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
    this.player.enabled = false;
    this.player.keys = Object.create(null);
    cancelAnimationFrame(this._raf);
  }

  /** 依實際影格間隔調整內部解析度，並替載入後才出現的隱藏物件暖機 */
  _pace(ms) {
    const P = this.perf;
    if (ms > 0 && ms < 1000) P.frameMs += (ms - P.frameMs) * 0.1;
    if (P.drs.update(ms, P.gpu.ms)) this._applyScale();
    if (P.drs.pinned > 6) { P.drs.pinned = 0; this.onQualityHint?.('low'); }
    if (P.warm) for (const o of P.late.collect()) this.prewarm(o);
  }

  frame(dt) {
    this.time += dt;
    if (dt > 0) this.fps += (1 / dt - this.fps) * 0.05;
    this.player.update(dt, this.map.world);
    this.map.update(dt, this.time, this.player);
    this.story?.update(dt);
    this.horror.update(dt);
    if (!this.story?.modal) this.audio.update(dt, this.map.indoorAt?.(this.player.pos) ? 1 : 0);
    this.film.uniforms.time.value = this.time;
    this.perf.lights.update(this.camera, dt);
    if (!this._reading()) this._draw(dt);
    this.onFrame?.(dt);
  }

  /** 閱讀文件時（全螢幕、模糊的底圖）場景每三幀才重畫一次，把 GPU 留給文字介面；對話框不受影響。 */
  _reading() {
    if (!this.running || !this.story?.modal) { this._skip = 0; return false; }
    const layer = document.getElementById('story-layer');
    if (!layer || layer.classList.contains('dialogue') || layer.classList.contains('hidden')) { this._skip = 0; return false; }
    this._skip = (this._skip + 1) % 3;
    return this._skip !== 1;
  }

  _draw(dt) {
    const gpu = this.perf.gpu;
    gpu.poll();
    gpu.begin();
    this.renderer.info.reset();
    this.composer.render(dt);
    gpu.end();
  }

  /** 單張渲染（暫停時或截圖用） */
  renderOnce() {
    if (!this.map) return;
    this.player._syncCamera(0);
    this.player._updateFlash(1);
    this.map.update(0, this.time, this.player);
    this.perf.lights.update(this.camera, 0, true);
    this.composer.render(0);
  }

  // ───── 轉場 ─────
  /** 黑幕淡到指定不透明度（0 = 看得到畫面） */
  fade(to, ms = 300) {
    const f = this.fader;
    if (!this.transitions) { f.style.opacity = '0'; return Promise.resolve(); }
    if (ms <= 0) { f.style.transition = 'none'; f.style.opacity = String(to); return Promise.resolve(); }
    f.style.transition = `opacity ${ms}ms ease`;
    void f.offsetWidth;
    f.style.opacity = String(to);
    return sleep(ms);
  }

  /** 瞬間傳送用：先全黑，再淡入新位置，硬切變成一次眨眼 */
  blink(ms = 340) {
    if (!this.transitions) return;
    const f = this.fader;
    f.style.transition = 'none';
    f.style.opacity = '1';
    void f.offsetWidth;
    requestAnimationFrame(() => { f.style.transition = `opacity ${ms}ms ease-out`; f.style.opacity = '0'; });
  }
}
