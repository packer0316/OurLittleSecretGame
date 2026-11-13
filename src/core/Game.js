import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Assets } from './Assets.js';
import { Player } from './Player.js';
import { AudioSys } from './AudioSys.js';
import { flashlightCookie } from './canvasTex.js';

/** 最終後製：暗角、底片顆粒、輕微色散與冷色調 */
const FilmShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, grain: { value: 0.055 }, vignette: { value: 1.0 }, aberration: { value: 0.0035 } },
  vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float time, grain, vignette, aberration; varying vec2 vUv;
    float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    void main() {
      vec2 c = vUv - 0.5;
      float d2 = dot(c, c);
      vec2 off = c * d2 * aberration * 4.0;
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, 0.86);                       // 略為去飽和
      col *= mix(vec3(0.93, 0.98, 1.08), vec3(1.0), smoothstep(0.0, 0.5, l)); // 暗部偏冷
      float n = hash(gl_FragCoord.xy + fract(time) * 913.0) - 0.5;
      col += n * grain * (0.35 + 0.65 * (1.0 - l));
      col *= 1.0 - smoothstep(0.14, 0.7, d2) * 0.6 * vignette;
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

export const QUALITY = {
  low: { label: '低', pixelRatio: 0.8, shadow: 1024, flashShadow: 512, bloom: false, msaa: 0 },
  medium: { label: '中', pixelRatio: 1, shadow: 2048, flashShadow: 1024, bloom: true, msaa: 0 },
  high: { label: '高', pixelRatio: 1.5, shadow: 4096, flashShadow: 1024, bloom: true, msaa: 4 },
};

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
    this.map = null;
    this.running = false;
    this.time = 0;
    this.fps = 0;
    this.fullBright = false;
    this.onFrame = null;
    this._last = 0;
    this._raf = 0;
    this._buildComposer();
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  _buildComposer() {
    const q = QUALITY[this.settings.quality];
    const size = new THREE.Vector2(1, 1);
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: q.msaa });
    this.composer?.dispose();
    this.composer = new EffectComposer(this.renderer, rt);
    this.renderPass = new RenderPass(new THREE.Scene(), this.camera);
    this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(size, 0.42, 0.75, 0.92);
    this.bloom.enabled = q.bloom;
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.film = new ShaderPass(FilmShader);
    this.composer.addPass(this.film);
    if (this.map) this.renderPass.scene = this.map.scene;
  }

  applySettings(s = {}) {
    const qualityChanged = s.quality && s.quality !== this.settings.quality;
    Object.assign(this.settings, s);
    this.player.sensitivity = this.settings.sensitivity;
    this.audio.setVolume(this.settings.volume);
    if (qualityChanged) this._buildComposer();
    const q = QUALITY[this.settings.quality];
    this.player.flash.shadow.mapSize.set(q.flashShadow, q.flashShadow);
    this.player.flash.shadow.map?.dispose();
    this.player.flash.shadow.map = null;
    this.map?.setQuality?.(q);
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const q = QUALITY[this.settings.quality];
    const pr = Math.min(window.devicePixelRatio || 1, 2) * q.pixelRatio;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  async loadMap(def, onProgress) {
    this.unloadMap();
    const mod = await def.load();
    await this.assets.preload(mod.ASSETS, (p) => onProgress?.(p * 0.7, '載入素材'));
    onProgress?.(0.72, '建構場景');
    await new Promise((r) => setTimeout(r, 30));
    const map = await mod.create(this, (p, label) => onProgress?.(0.72 + p * 0.22, label));
    this.map = map;
    map.scene.add(this.player.rig);
    map.setQuality?.(QUALITY[this.settings.quality]);
    this.renderPass.scene = map.scene;
    this.respawn();
    onProgress?.(0.96, '編譯著色器');
    await new Promise((r) => setTimeout(r, 30));
    // 預先編譯並暖機一幀，避免開始時卡頓
    try { await this.renderer.compileAsync(map.scene, this.camera); } catch { /* 部分瀏覽器不支援 */ }
    map.update(0.016, 0, this.player);
    this.composer.render(0.016);
    onProgress?.(1, '完成');
  }

  respawn() {
    const s = this.map.spawn;
    this.player.teleport(s.x, this.map.world.probe(s.x, s.z, 1000).g, s.z, s.yaw, 0);
    this.player.flashOn = true;
  }

  unloadMap() {
    this.stop();
    this.story?.dispose();
    this.story = null;
    if (!this.map) return;
    this.map.scene.remove(this.player.rig);
    this.map.dispose?.();
    this.map = null;
  }

  start() {
    if (this.running || !this.map) return;
    this.running = true;
    this.player.enabled = true;
    this._last = performance.now();
    const tick = (now) => {
      if (!this.running) return;
      this._raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - this._last) / 1000);
      this._last = now;
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

  frame(dt) {
    this.time += dt;
    if (dt > 0) this.fps += (1 / dt - this.fps) * 0.05;
    this.player.update(dt, this.map.world);
    this.map.update(dt, this.time, this.player);
    this.story?.update(dt);
    if (!this.story?.modal) this.audio.update(dt, this.map.indoorAt?.(this.player.pos) ? 1 : 0);
    this.film.uniforms.time.value = this.time;
    this.renderer.info.reset();
    this.composer.render(dt);
    this.onFrame?.(dt);
  }

  /** 單張渲染（暫停時或截圖用） */
  renderOnce() {
    if (!this.map) return;
    this.player._syncCamera(0);
    this.player._updateFlash(1);
    this.map.update(0, this.time, this.player);
    this.composer.render(0);
  }
}
