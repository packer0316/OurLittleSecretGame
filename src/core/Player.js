import * as THREE from 'three';
import { clamp } from './utils.js';

const RADIUS = 0.34;
const EYE = 1.66;
const EYE_CROUCH = 1.0;
// Ignore cursor warps at lock/focus boundaries; never replay excess motion later.
const LOOK_SETTLE_MS = 120;
const MAX_MOUSE_EVENT = 900;
const MAX_LOOK_PER_FRAME = Math.PI / 2;

/** 第一人稱控制：行走、奔跑、蹲下、手電筒、多樓層碰撞 */
export class Player {
  constructor(camera, dom, { cookie, audio } = {}) {
    this.camera = camera;
    this.dom = dom;
    this.audio = audio;
    this.pos = new THREE.Vector3(); // 腳底位置
    this.vel = new THREE.Vector3();
    this.vy = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.eye = EYE;
    this.keys = Object.create(null);
    this.enabled = false;
    this.fly = false;
    this.sensitivity = 1;
    this.bobPhase = 0;
    this.bobAmt = 0;
    this.stepIndex = 0;
    this.time = 0;
    this.onGround = true;
    this.onFootstep = null;

    // 手電筒
    this.flashOn = true;
    this.flashAvailable = true;
    this.flash = new THREE.SpotLight(0xfff1dc, 0, 50, 0.62, 0.6, 1.1);
    this.flash.castShadow = true;
    this.flash.shadow.mapSize.set(1024, 1024);
    this.flash.shadow.camera.near = 0.25;
    this.flash.shadow.camera.far = 46;
    this.flash.shadow.bias = -0.0015;
    this.flash.shadow.normalBias = 0.02;
    if (cookie) this.flash.map = cookie;
    this.flashQuat = new THREE.Quaternion();
    this.flashPower = 0;
    this.flashBase = 38;
    // 極微弱的近身光（模擬眼睛適應黑暗）
    this.aura = new THREE.PointLight(0x7f95c0, 0.22, 5.5, 1.6);

    this.rig = new THREE.Group();
    this.rig.add(this.flash, this.flash.target, this.aura);

    this._onKeyDown = (e) => {
      if (!this.enabled) return;
      this.keys[e.code] = true;
      if (e.code === 'KeyF' && !e.repeat) this.toggleFlash();
      if (['Space', 'ControlLeft', 'KeyC'].includes(e.code)) e.preventDefault();
    };
    this._onKeyUp = (e) => { this.keys[e.code] = false; };
    this._onMouse = (e) => {
      const now = performance.now();
      if (!this._canLook() || now < this._lookResumeAt) return;
      const { movementX: dx, movementY: dy } = e;
      if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.max(Math.abs(dx), Math.abs(dy)) > MAX_MOUSE_EVENT) {
        this._resetLook();
        return;
      }
      this._lookX += dx;
      this._lookY += dy;
      this._lookLastEvent = now;
    };
    this._onFocusChange = () => {
      this._resetLook(LOOK_SETTLE_MS);
      this.keys = Object.create(null);
      this.vel.set(0, 0, 0);
    };
    this._onLockChange = () => this._resetLook(LOOK_SETTLE_MS);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onFocusChange);
    window.addEventListener('focus', this._onFocusChange);
    document.addEventListener('visibilitychange', this._onFocusChange);
    document.addEventListener('pointerlockchange', this._onLockChange);
    document.addEventListener('mousemove', this._onMouse);
  }

  get enabled() { return this._enabled; }
  set enabled(value) {
    if (this._enabled === value) return;
    this._enabled = value;
    this._resetLook(LOOK_SETTLE_MS);
  }

  _canLook() {
    return this.enabled && document.pointerLockElement === this.dom && document.hasFocus() && document.visibilityState === 'visible';
  }

  _resetLook(settle = 0) {
    this._lookX = this._lookY = 0;
    this._lookLastEvent = 0;
    this._lookResumeAt = performance.now() + settle;
  }

  _applyLook() {
    const now = performance.now(), dx = this._lookX, dy = this._lookY;
    this._lookX = this._lookY = 0;
    if (!this._canLook() || now < this._lookResumeAt || now - this._lookLastEvent > 250 || (!dx && !dy)) return;
    const k = 0.0021 * this.sensitivity;
    const length = Math.hypot(dx, dy) * k;
    const scale = k * Math.min(1, MAX_LOOK_PER_FRAME / length);
    const yaw = this.yaw - dx * scale;
    this.yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
    this.pitch = clamp(this.pitch - dy * scale, -1.48, 1.48);
  }

  toggleFlash() {
    if(!this.flashAvailable)return;
    this.flashOn = !this.flashOn;
    this.audio?.click();
  }

  teleport(x, y, z, yaw = this.yaw, pitch = 0) {
    this._resetLook();
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.vy = 0;
    this.yaw = yaw;
    this.pitch = pitch;
    this._syncCamera(0);
    this.flashQuat.copy(this.camera.quaternion);
  }

  update(dt, world) {
    this._applyLook();
    this.time += dt;
    const k = this.keys;
    const f = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
    const s = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    const crouch = !!(k.ControlLeft || k.KeyC) && !this.fly;
    const sprint = !!(k.ShiftLeft || k.ShiftRight) && f > 0 && !crouch;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);

    let speed = crouch ? 1.25 : sprint ? 4.6 : 2.35;
    if (this.fly) speed = sprint ? 22 : 9;
    let wx = -sin * f + cos * s;
    let wz = -cos * f - sin * s;
    const wl = Math.hypot(wx, wz);
    if (wl > 0) { wx = (wx / wl) * speed; wz = (wz / wl) * speed; }
    const a = 1 - Math.exp(-dt * (wl > 0 ? 9 : 12));
    this.vel.x += (wx - this.vel.x) * a;
    this.vel.z += (wz - this.vel.z) * a;

    if (this.fly) {
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
      this.pos.y += ((k.Space ? 1 : 0) - (k.ControlLeft || k.KeyC ? 1 : 0)) * speed * dt;
      this.vy = 0;
    } else {
      this._move(this.vel.x * dt, 0, world);
      this._move(0, this.vel.z * dt, world);
      // 垂直：貼地 / 墜落
      const { g } = world.probe(this.pos.x, this.pos.z, this.pos.y);
      if (this.pos.y > g + 0.03) {
        const drop = this.pos.y - g;
        if (drop < 0.3 && this.onGround) {
          this.pos.y += (g - this.pos.y) * Math.min(1, dt * 16); // 下樓梯：平滑貼地
        } else {
          this.onGround = false;
          this.vy -= 19 * dt;
          this.pos.y += this.vy * dt;
          if (this.pos.y <= g) { this.pos.y = g; this._land(); }
        }
      } else {
        if (!this.onGround) this._land();
        this.pos.y += (g - this.pos.y) * Math.min(1, dt * 16);
        this.vy = 0;
      }
    }

    // 視線高度與步伐晃動
    const targetEye = crouch ? EYE_CROUCH : EYE;
    this.eye += (targetEye - this.eye) * Math.min(1, dt * 9);
    const hs = Math.hypot(this.vel.x, this.vel.z);
    const moving = hs > 0.35 && this.onGround && !this.fly;
    const stride = sprint ? 1.05 : crouch ? 0.55 : 0.76;
    if (moving) this.bobPhase += (hs * dt * Math.PI) / stride;
    this.bobAmt += ((moving ? 1 : 0) - this.bobAmt) * Math.min(1, dt * 7);
    const idx = Math.floor(this.bobPhase / Math.PI);
    if (idx !== this.stepIndex) {
      this.stepIndex = idx;
      if (moving) this.onFootstep?.(sprint ? 1 : crouch ? 0.35 : 0.65);
    }
    this._syncCamera(dt, sprint, s);
    this._updateFlash(dt);
  }

  _land() {
    this.onGround = true;
    if (this.vy < -4) this.onFootstep?.(1.4);
    this.vy = 0;
  }

  _move(dx, dz, world) {
    if (dx === 0 && dz === 0) return;
    const dist = Math.hypot(dx, dz);
    const n = Math.max(1, Math.ceil(dist / 0.2));
    const p = { x: 0, z: 0 };
    for (let i = 0; i < n; i++) {
      p.x = this.pos.x + dx / n;
      p.z = this.pos.z + dz / n;
      world.resolve(p, RADIUS, this.pos.y);
      const r = world.probe(p.x, p.z, this.pos.y);
      if (r.blocked) return;
      this.pos.x = p.x;
      this.pos.z = p.z;
    }
  }

  _syncCamera(dt, sprint = false, strafe = 0) {
    const cam = this.camera;
    const amp = (sprint ? 0.058 : 0.034) * this.bobAmt;
    const bobY = -Math.abs(Math.sin(this.bobPhase)) * amp + amp * 0.5;
    const bobX = Math.cos(this.bobPhase) * amp * 0.5;
    const breath = Math.sin(this.time * 1.5) * 0.006;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    cam.position.set(this.pos.x + cos * bobX, this.pos.y + this.eye + bobY + breath, this.pos.z - sin * bobX);
    const roll = -strafe * 0.012 * this.bobAmt + Math.cos(this.bobPhase) * 0.0035 * this.bobAmt;
    cam.rotation.set(this.pitch + breath * 0.4, this.yaw, roll, 'YXZ');
    cam.updateMatrixWorld();
  }

  _updateFlash(dt) {
    const cam = this.camera;
    // 手電筒方向略為延遲跟隨視角，產生手持晃動感
    this.flashQuat.slerp(cam.quaternion, 1 - Math.exp(-dt * 13));
    const off = _v1.set(0.2, -0.2, 0.05).applyQuaternion(cam.quaternion);
    this.flash.position.copy(cam.position).add(off);
    const dir = _v2.set(0, 0, -1).applyQuaternion(this.flashQuat);
    this.flash.target.position.copy(cam.position).addScaledVector(dir, 12).addScaledVector(off, 0.35);
    this.flash.target.updateMatrixWorld();
    this.aura.position.copy(cam.position);
    // 開關淡入與偶發閃爍
    const target = this.flashOn ? 1 : 0;
    this.flashPower += (target - this.flashPower) * Math.min(1, dt * 22);
    const t = this.time;
    const flick = 1 - 0.035 * Math.sin(t * 37.0) * Math.sin(t * 11.3) - (Math.sin(t * 0.73) * Math.sin(t * 1.9) > 0.93 ? 0.25 * Math.abs(Math.sin(t * 61)) : 0);
    this.flash.intensity = this.flashBase * this.flashPower * flick;
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onFocusChange);
    window.removeEventListener('focus', this._onFocusChange);
    document.removeEventListener('visibilitychange', this._onFocusChange);
    document.removeEventListener('pointerlockchange', this._onLockChange);
    document.removeEventListener('mousemove', this._onMouse);
  }
}
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();
