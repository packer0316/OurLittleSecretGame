import * as THREE from 'three';
import { clamp, wrap } from '../sense.js';

/**
 * 寺內恐怖段落（dread）的共用工具：畫面上的字幕／提示／目標、黑幕、躲藏時的視野遮罩、
 * 阿哲手機的雜訊畫面、屏息量表、按鍵（捕獲階段，必要時攔下 Story 的 E/J）、
 * 鎖住移動但保留有限視角、強制看向某處、以及「被抓到」的共用流程（保留證據、回檢查點、deaths++、存檔）。
 * 所有 DOM 在 createKit 時建立一次，dispose 時移除；update 內不配置記憶體。
 */
const CSS = `
#dread-layer{position:fixed;inset:0;z-index:40;pointer-events:none;font-family:inherit;}
#dread-layer .dl-veil{position:absolute;inset:0;background:#000;opacity:0;}
#dread-layer .dl-mask{position:absolute;inset:0;opacity:0;transition:opacity .35s ease;}
#dread-layer .dl-mask.on{opacity:1;}
#dread-layer .dl-mask.cabinet{background:linear-gradient(90deg,#000c 0,#000a 30%,#0000 42%,#0000 58%,#000a 70%,#000c 100%),radial-gradient(60% 80% at 50% 50%,#0000 40%,#000 100%);}
#dread-layer .dl-mask.table{background:linear-gradient(180deg,#0a0201 0,#140403 58%,#0000 66%,#0000 92%,#000 100%),radial-gradient(90% 70% at 50% 75%,#0000 45%,#000 100%);}
#dread-layer .dl-mask.curtain{background:linear-gradient(90deg,#120202cc 0,#1c0403aa 30%,#0000 42%,#0000 58%,#1c0403aa 70%,#120202cc 100%),radial-gradient(55% 85% at 50% 50%,#0000 35%,#000 100%);}
#dread-layer .dl-count{position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);font-size:min(13vw,128px);color:#d9cfc0;opacity:0;letter-spacing:.1em;text-shadow:0 0 18px #000;font-weight:300;}
#dread-layer .dl-cap{position:absolute;left:50%;bottom:23%;transform:translateX(-50%);max-width:min(860px,88vw);text-align:center;opacity:0;transition:opacity .45s ease;}
#dread-layer .dl-cap.show{opacity:1;}
#dread-layer .dl-cap.cut{transition:none;}
body.dread-cap #story-toast{opacity:0 !important;transition:none !important;}
#dread-layer .dl-cap small{display:block;font-size:.78rem;letter-spacing:.24em;color:#9b8f80;margin-bottom:.35em;}
#dread-layer .dl-cap p{margin:0;font-size:1.32rem;line-height:1.6;color:#efe6d8;text-shadow:0 0 6px #000,0 0 18px #000;}
#dread-layer .dl-cap.child p{color:#d8dfe6;letter-spacing:.06em;}
#dread-layer .dl-cap.woman p{color:#e9d6cf;}
#dread-layer .dl-prompt{position:absolute;left:50%;top:62%;transform:translateX(-50%);font-size:1rem;color:#e6dccd;opacity:0;transition:opacity .3s ease;text-shadow:0 0 8px #000;letter-spacing:.08em;white-space:nowrap;}
#dread-layer .dl-prompt.show{opacity:1;}
#dread-layer .dl-prompt kbd{display:inline-block;border:1px solid #cdbfae88;border-radius:3px;padding:0 .45em;margin:0 .3em;font-family:inherit;font-size:.86rem;background:#0008;}
#dread-layer .dl-goal{position:absolute;left:50%;top:11%;transform:translateX(-50%);font-size:.95rem;color:#cbbfae;letter-spacing:.3em;opacity:0;transition:opacity .5s ease;text-shadow:0 0 8px #000;}
#dread-layer .dl-goal.show{opacity:1;}
#dread-layer .dl-phone{position:absolute;right:4.5%;bottom:7%;width:112px;height:196px;opacity:0;transform:translateY(24px) rotate(-4deg);transition:opacity .5s ease,transform .5s ease;filter:drop-shadow(0 6px 18px #000);}
#dread-layer .dl-phone.show{opacity:1;transform:translateY(0) rotate(-4deg);}
#dread-layer .dl-breath{position:absolute;left:50%;bottom:9%;transform:translateX(-50%);width:min(260px,40vw);height:4px;background:#ffffff1a;opacity:0;transition:opacity .3s ease;}
#dread-layer .dl-breath.show{opacity:1;}
#dread-layer .dl-breath i{position:absolute;left:0;top:0;bottom:0;background:#d9d2c6;}
#dread-layer .dl-breath.low i{background:#b3392c;}
#dread-layer .dl-breath span{position:absolute;left:0;right:0;top:-1.7em;text-align:center;font-size:.75rem;letter-spacing:.3em;color:#a99d8d;}
`;
const NUM = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
const NOISE = Array.from({ length: 10 }, (_, i) => `rgba(230,240,240,${(0.15 + 0.6 * (i / 9)).toFixed(2)})`);

export function createKit(h) {
  const { game, sense: s } = h;
  const player = game.player;
  const params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
  const AUTO = params.has('auto');

  // ── DOM ──
  let style = document.getElementById('dread-style');
  if (!style) { style = document.createElement('style'); style.id = 'dread-style'; style.textContent = CSS; document.head.appendChild(style); }
  document.getElementById('dread-layer')?.remove();
  const layer = document.createElement('div'); layer.id = 'dread-layer'; layer.setAttribute('aria-live', 'polite');
  const el = (cls, tag = 'div') => { const e = document.createElement(tag); e.className = cls; layer.appendChild(e); return e; };
  const veil = el('dl-veil'), mask = el('dl-mask'), count = el('dl-count'), cap = el('dl-cap'), prompt = el('dl-prompt'), goal = el('dl-goal');
  const phoneCv = el('dl-phone', 'canvas'), breath = el('dl-breath');
  const capWho = document.createElement('small'), capText = document.createElement('p'); cap.append(capWho, capText);
  const breathBar = document.createElement('i'), breathLabel = document.createElement('span'); breathLabel.textContent = '屏住呼吸'; breath.append(breathLabel, breathBar);
  phoneCv.width = 224; phoneCv.height = 392;
  const pc = phoneCv.getContext('2d');
  document.body.appendChild(layer);

  // ── 狀態 ──
  let veilCur = 0, veilTo = 0, veilRate = 3, capT = 0, promptHtml = '', goalText = '', maskKind = '', countShown = -1, countAlpha = 0, countAlphaTo = 0;
  let phoneOn = false, phoneLevel = 0, phoneT = 0, phoneDrawn = -1, breathShown = -1, breathOn = false;
  const queue = []; // 字幕佇列：[who, text, dur, cls]

  // ── 輸入（捕獲階段）──
  const keys = Object.create(null), presses = Object.create(null);
  let lookX = 0, lookY = 0;
  const onDown = (e) => {
    if (!game.running || game.story?.modal) return;
    const c = e.code;
    if (c === 'Space' && kit.wantSpace) e.preventDefault();
    if (!e.repeat) { if (!keys[c]) presses[c] = true; keys[c] = true; }
    if ((c === 'KeyE' && (kit.claimE || kit.blockStory)) || (c === 'KeyJ' && kit.blockStory)) { e.stopImmediatePropagation(); e.preventDefault(); }
  };
  const onUp = (e) => { keys[e.code] = false; };
  const onBlur = () => { for (const k in keys) keys[k] = false; };
  const onMouse = (e) => {
    if (!kit.look.on || document.pointerLockElement !== game.renderer.domElement) return;
    const dx = e.movementX, dy = e.movementY;
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.abs(dx) > 900 || Math.abs(dy) > 900) return;
    lookX += dx; lookY += dy;
  };
  window.addEventListener('keydown', onDown, true);
  window.addEventListener('keyup', onUp, true);
  window.addEventListener('blur', onBlur);
  document.addEventListener('mousemove', onMouse);

  const camPos = new THREE.Vector3(), tmp = new THREE.Vector3(), faceAt = new THREE.Vector3();
  let frozen = false, forceRate = 0, catchT = -1, catchSpec = null, shakeAmt = 0, shakeT = 0, time = 0;
  let flashPat = null, flashIdx = 0, flashT = 0, capShown = false;

  const kit = {
    AUTO, keys, layer,
    /** 這一幀被按下（邊緣觸發）；讀過就清掉 */
    pressed(code) { if (presses[code]) { presses[code] = false; return true; } return false; },
    held(code) { return !!keys[code]; },
    clearPresses() { for (const k in presses) presses[k] = false; },
    /** 測試用：直接設定按鍵狀態 */
    setKey(code, down) { if (down && !keys[code]) presses[code] = true; keys[code] = !!down; },
    wantSpace: false, claimE: false, blockStory: false,

    // ── 畫面 ──
    veil(to, rate = 3) { veilTo = clamp(to, 0, 1); veilRate = rate; },
    get veilValue() { return veilCur; },
    snapVeil(v) { veilCur = veilTo = v; veil.style.opacity = String(v); },
    mask(kind) { if (kind === maskKind) return; maskKind = kind || ''; mask.className = 'dl-mask' + (kind ? ' on ' + kind : ''); },
    /** 字幕。who：說話者（小字），cls：child / woman / ''。dur 秒 */
    say(text, who = '', dur = 3.2, cls = '') {
      if (capT > 0.2 && queue.length < 6) { queue.push([who, text, dur, cls]); return; }
      capWho.textContent = who; capText.textContent = text; cap.className = 'dl-cap show' + (cls ? ' ' + cls : ''); capT = dur; capOn(true);
    },
    hush() { queue.length = 0; capT = 0; cap.className = 'dl-cap cut'; capOn(false); }, // 立即消失，不淡出
    prompt(html) { if (html === promptHtml) return; promptHtml = html || ''; if (html) prompt.innerHTML = html; prompt.classList.toggle('show', !!html); },
    goal(text) { if (text === goalText) return; goalText = text || ''; if (text) goal.textContent = text; goal.classList.toggle('show', !!text); },
    /** 大字數數（n = 0 隱藏） */
    count(n, alpha = 0.9) { if (n !== countShown) { countShown = n; count.textContent = NUM[n] || ''; } countAlphaTo = n ? alpha : 0; },
    phone(on, level = 0) { if (on !== phoneOn) { phoneOn = on; phoneCv.classList.toggle('show', on); } phoneLevel = clamp(level, 0, 1); },
    breathMeter(v) {
      const on = v !== null && v !== undefined;
      if (on !== breathOn) { breathOn = on; breath.classList.toggle('show', on); }
      if (!on) return;
      const q = Math.round(v * 100);
      if (q !== breathShown) { breathShown = q; breathBar.style.width = q + '%'; breath.classList.toggle('low', v < 0.28); }
    },
    shake(amount, dur = 0.3) { shakeAmt = amount; shakeT = dur; h.fx.shake(amount, dur); },
    /**
     * 手電筒明暗樣式 [[秒, 亮度], …]，播完停在最後一格。導演的 fx.flashPattern 用的是「暫停中」的時鐘，
     * 段落演出時（story.scene 有值）會卡住，所以這裡用真實時間自己推進，再交給 fx.flash。
     */
    flashPattern(p) { flashPat = p; flashIdx = 0; flashT = 0; h.fx.flash(p[0][1], 26); },
    flash(level, rate = 20) { flashPat = null; h.fx.flash(level, rate); },

    // ── 玩家 ──
    /** 鎖住移動（保留由 look 控制的有限視角）。Story 的對話框關掉時會把 enabled 打開，這裡每幀補回來。 */
    freeze(on) {
      frozen = !!on;
      player.keys = Object.create(null); player.vel.set(0, 0, 0);
      if (on) player.enabled = false;
      else player.enabled = !game.story?.modal && !game.story?.busy && !!game.running;
    },
    get frozen() { return frozen; },
    /** 有限視角：以 yaw0/pitch0 為中心、±yawLim/±pitchLim。pos 不為 null 時攝影機放在那裡（躲藏）。 */
    look: { on: false, yaw0: 0, pitch0: 0, yawLim: 0.6, pitchLim: 0.35, pos: null, breathe: 0.004 },
    lookAround(yaw0, pitch0, yawLim, pitchLim, pos = null) {
      const L = kit.look; L.on = true; L.yaw0 = yaw0; L.pitch0 = pitch0; L.yawLim = yawLim; L.pitchLim = pitchLim;
      if (pos) { camPos.copy(pos); L.pos = camPos; } else L.pos = null;
      lookX = lookY = 0;
    },
    endLook() { kit.look.on = false; kit.look.pos = null; lookX = lookY = 0; forceRate = 0; },
    /** 視角每秒以 rate 的比例轉向某一點（rate 0 = 放開） */
    forceLook(x, y, z, rate = 6) { faceAt.set(x, y, z); forceRate = rate; },
    releaseLook() { forceRate = 0; },
    /** 平滑把玩家移到 (x,z)（不經碰撞；只在鎖住移動時用） */
    nudge(x, z, k) { player.pos.x += (x - player.pos.x) * k; player.pos.z += (z - player.pos.z) * k; },

    // ── 被抓到 ──
    /**
     * face：抓住你的那張臉（世界座標）。reset()：把段落與玩家放回檢查點（此時紅布正蓋著畫面）。
     * 證據不動；state.deaths++ 會讓 reactive.js 播衝臉與紅布。
     */
    catchPlayer({ face, title, body, button, reset }) {
      if (catchT >= 0) return;
      const st = game.story;
      catchT = 0; catchSpec = { title, body, button, reset, done: false, shown: false };
      kit.freeze(true); kit.endLook(); kit.forceLook(face.x, face.y, face.z, 18); kit.hush(); kit.prompt(''); kit.breathMeter(null); kit.mask('');
      if (st?.state) st.state.deaths++;
      kit.shake(0.02, 0.5);
    },
    get catching() { return catchT >= 0; },

    update(dt) {
      time += dt;
      if (flashPat) {
        flashT += dt;
        while (flashPat && flashT >= flashPat[flashIdx][0]) { flashT -= flashPat[flashIdx][0]; flashIdx++; if (flashIdx >= flashPat.length) { flashPat = null; break; } h.fx.flash(flashPat[flashIdx][1], 26); }
      }
      // 黑幕
      if (veilCur !== veilTo) { const d = veilTo - veilCur, st = veilRate * dt; veilCur = Math.abs(d) <= st ? veilTo : veilCur + Math.sign(d) * st; veil.style.opacity = veilCur.toFixed(3); }
      // 字幕
      if (capT > 0) {
        capT -= dt;
        if (capT <= 0) {
          if (queue.length) { const [w, t, d, c] = queue.shift(); capWho.textContent = w; capText.textContent = t; cap.className = 'dl-cap show' + (c ? ' ' + c : ''); capT = d; } else { cap.className = 'dl-cap'; capOn(false); }
        }
      }
      if (countAlpha !== countAlphaTo) { const d = countAlphaTo - countAlpha, st = 3 * dt; countAlpha = Math.abs(d) <= st ? countAlphaTo : countAlpha + Math.sign(d) * st; count.style.opacity = countAlpha.toFixed(3); }
      // 手機雜訊畫面（約 15 fps）
      phoneT -= dt;
      if (phoneOn && phoneT <= 0) { phoneT = 1 / 15; drawPhone(); }
      // 鎖住移動
      if (frozen && player.enabled) { player.enabled = false; player.keys = Object.create(null); player.vel.set(0, 0, 0); }
      // 被抓到的流程
      if (catchT >= 0 && dt > 0) {
        catchT += dt;
        const c = catchSpec;
        if (!c.done && catchT > 0.95) { c.done = true; kit.releaseLook(); c.reset?.(); game.story?.save(); }
        if (!c.shown && catchT > 1.35) {
          c.shown = true; catchT = -1; kit.freeze(false);
          const st = game.story;
          if (st) st.show({ eyebrow: '它又靠近了一點', title: c.title, body: c.body.split('\n').filter(Boolean).map((p) => `<p>${p}</p>`).join(''), options: [{ text: c.button, action: () => {} }] });
        }
      }
    },

    /** 每幀最後呼叫：把有限視角／強制視角套到攝影機上 */
    applyView(dt) {
      const L = kit.look;
      if (forceRate > 0 && dt > 0) {
        const ex = player.pos.x, ez = player.pos.z, ey = player.pos.y + player.eye;
        const dx = faceAt.x - ex, dz = faceAt.z - ez;
        const yaw = Math.atan2(-dx, -dz), pitch = clamp(Math.atan2(faceAt.y - ey, Math.hypot(dx, dz)), -1.2, 1.2), k = Math.min(1, dt * forceRate);
        player.yaw = wrap(player.yaw + wrap(yaw - player.yaw) * k); player.pitch += (pitch - player.pitch) * k;
        if (!L.on) { player._syncCamera?.(0); player.flashQuat.copy(game.camera.quaternion); }
      }
      if (!L.on) return;
      const sens = 0.0021 * (player.sensitivity || 1);
      if (lookX || lookY) {
        player.yaw = L.yaw0 + clamp(wrap(player.yaw - lookX * sens - L.yaw0), -L.yawLim, L.yawLim);
        player.pitch = clamp(player.pitch - lookY * sens, L.pitch0 - L.pitchLim, L.pitch0 + L.pitchLim);
        lookX = lookY = 0;
      }
      const cam = game.camera;
      if (L.pos) cam.position.set(L.pos.x, L.pos.y + Math.sin(time * 1.3) * L.breathe, L.pos.z);
      else cam.position.set(player.pos.x, player.pos.y + player.eye, player.pos.z);
      cam.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
      cam.updateMatrixWorld();
      player.flashQuat.copy(cam.quaternion);
    },

    // ── 幾何小工具（不配置記憶體） ──
    /** 這一點此刻是否在畫面內、沒被擋住 */
    sees(x, y, z, margin = -0.04) { return s.sees(x, y, z, margin); },
    /** 同上，但不把樓梯扶手這種薄的碰撞牆算成遮蔽（它們在畫面上是鏤空的） */
    seesSolid(x, y, z, margin = -0.04) { return s.inView(x, y, z, margin) && kit.losSolid(s.eye.x, s.eye.y, s.eye.z, x, y, z); },
    losSolid(ax, ay, az, bx, by, bz) {
      const w = game.map?.world; if (!w) return true;
      const dx = bx - ax, dy = by - ay, dz = bz - az, bs = w.boxes;
      for (let i = 0; i < bs.length; i++) {
        const b = bs[i]; if (b.disabled || b.x2 - b.x1 < 0.2 || b.z2 - b.z1 < 0.2) continue;
        let near = 0.03, far = 0.97, t1, t2;
        if (Math.abs(dx) < 1e-8) { if (ax < b.x1 || ax > b.x2) continue; } else { t1 = (b.x1 - ax) / dx; t2 = (b.x2 - ax) / dx; if (t1 > t2) { const q = t1; t1 = t2; t2 = q; } if (t1 > near) near = t1; if (t2 < far) far = t2; if (near > far) continue; }
        if (Math.abs(dz) < 1e-8) { if (az < b.z1 || az > b.z2) continue; } else { t1 = (b.z1 - az) / dz; t2 = (b.z2 - az) / dz; if (t1 > t2) { const q = t1; t1 = t2; t2 = q; } if (t1 > near) near = t1; if (t2 < far) far = t2; if (near > far) continue; }
        if (Math.abs(dy) < 1e-8) { if (ay < b.y1 || ay > b.y2) continue; } else { t1 = (b.y1 - ay) / dy; t2 = (b.y2 - ay) / dy; if (t1 > t2) { const q = t1; t1 = t2; t2 = q; } if (t1 > near) near = t1; if (t2 < far) far = t2; if (near > far) continue; }
        return false;
      }
      const len2 = dx * dx + dz * dz; if (len2 < 1e-6) return true;
      const cs = w.circles;
      for (let i = 0; i < cs.length; i++) {
        const c = cs[i]; if (c.r < 0.2) continue;
        const t = ((c.x - ax) * dx + (c.z - az) * dz) / len2; if (t < 0.03 || t > 0.97) continue;
        const qx = ax + dx * t - c.x, qz = az + dz * t - c.z; if (qx * qx + qz * qz >= c.r * c.r) continue;
        const y = ay + dy * t; if (y < c.y1 || y > c.y2) continue;
        return false;
      }
      return true;
    },
    /** 手電筒有沒有照到這一點 */
    lit(x, y, z, cone = 0.5) { return s.flashAngle(x, y, z) < cone; },
    floor() { return game.map?.floorIndex ? game.map.floorIndex(player.pos.y) : 0; },
    /** 玩家在某一層的室內（i：0..3） */
    onFloor(i) { const m = game.map; if (!m?.indoorAt) return false; return m.floorIndex(player.pos.y) === i && m.indoorAt(player.pos) && player.pos.y > 0.5; },
    dist(x, z) { return Math.hypot(x - player.pos.x, z - player.pos.z); },
    tmp,

    dispose() {
      window.removeEventListener('keydown', onDown, true);
      window.removeEventListener('keyup', onUp, true);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('mousemove', onMouse);
      if (frozen) kit.freeze(false);
      capOn(false);
      layer.remove();
    },
  };

  /** 段落字幕出現時，劇情的 toast 先藏起來（同一個位置附近，不讓兩行字疊在一起） */
  function capOn(on) { if (capShown !== on) { capShown = on; document.body.classList.toggle('dread-cap', on); } }
  /** 阿哲的手機：鎖定畫面停在 02:47，越靠近她雜訊越多、螢幕越亮 */
  function drawPhone() {
    const L = phoneLevel, W = 224, H = 392;
    const q = Math.round(L * 40);
    pc.clearRect(0, 0, W, H);
    pc.fillStyle = '#0b0b0c'; roundRect(4, 4, W - 8, H - 8, 26); pc.fill();
    pc.strokeStyle = '#3a3634'; pc.lineWidth = 3; pc.stroke();
    const sx = 16, sy = 30, sw = W - 32, sh = H - 64;
    const b = 14 + L * 70;
    pc.fillStyle = `rgb(${b * 0.55 | 0},${b * 0.72 | 0},${b * 0.78 | 0})`; pc.fillRect(sx, sy, sw, sh);
    // 裂痕
    pc.strokeStyle = '#d8e2e455'; pc.lineWidth = 1.2; pc.beginPath(); pc.moveTo(sx + sw * 0.15, sy); pc.lineTo(sx + sw * 0.4, sy + sh * 0.3); pc.lineTo(sx + sw * 0.32, sy + sh * 0.55); pc.moveTo(sx + sw * 0.4, sy + sh * 0.3); pc.lineTo(sx + sw, sy + sh * 0.38); pc.stroke();
    // 時間
    pc.fillStyle = `rgba(230,236,238,${0.35 + 0.5 * (1 - L * 0.6)})`; pc.font = '600 46px sans-serif'; pc.textAlign = 'center'; pc.fillText('02:47', W / 2, sy + 92);
    pc.font = '14px sans-serif'; pc.fillStyle = '#cfd8da99'; pc.fillText('11月13日 星期五', W / 2, sy + 118);
    // 雜訊
    const n = 60 + L * 1400;
    // 兩種顏色各畫一半（不在迴圈裡產生字串）
    pc.fillStyle = '#000000aa';
    for (let i = 0; i < n / 2; i++) pc.fillRect(sx + Math.random() * sw, sy + Math.random() * sh, 1 + Math.random() * 3, 1 + Math.random() * 2);
    pc.fillStyle = NOISE[Math.min(9, Math.round(L * 9))];
    for (let i = 0; i < n / 2; i++) pc.fillRect(sx + Math.random() * sw, sy + Math.random() * sh, 1 + Math.random() * 3, 1 + Math.random() * 2);
    if (L > 0.35) { // 掃描線斷層
      const k = Math.floor(L * 6);
      for (let i = 0; i < k; i++) { pc.fillStyle = `rgba(210,225,228,${0.12 + 0.3 * L})`; pc.fillRect(sx, sy + Math.random() * sh, sw, 2 + Math.random() * 6); }
    }
    // 訊號格
    for (let i = 0; i < 4; i++) { pc.fillStyle = i < 4 - Math.round(L * 4) ? '#e8eef0cc' : '#e8eef033'; pc.fillRect(W - 54 + i * 8, sy + 16 - i * 3, 5, 5 + i * 3); }
    pc.fillStyle = '#e8eef0aa'; pc.font = '12px sans-serif'; pc.textAlign = 'left'; pc.fillText(L > 0.55 ? '無服務' : '通話中斷', sx + 8, sy + 20);
    phoneDrawn = q;
  }
  function roundRect(x, y, w, hh, r) { pc.beginPath(); pc.moveTo(x + r, y); pc.arcTo(x + w, y, x + w, y + hh, r); pc.arcTo(x + w, y + hh, x, y + hh, r); pc.arcTo(x, y + hh, x, y, r); pc.arcTo(x, y, x + w, y, r); pc.closePath(); }

  return kit;
}
