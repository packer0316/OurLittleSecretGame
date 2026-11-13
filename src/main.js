import { Game } from './core/Game.js';
import { MAPS } from './maps/registry.js';
import { Story, readSave } from './story/Story.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const game = new Game(canvas);
const params = new URLSearchParams(location.search);
const AUTO = params.has('auto'); // 自動化測試 / 截圖用：不鎖定滑鼠直接開始
const DEV = params.has('dev');

const ui = {
  lobby: $('lobby'), loading: $('loading'), overlay: $('overlay'), hud: $('hud'),
  list: $('map-list'), bar: $('loading-bar'), label: $('loading-label'), loadTitle: $('loading-title'),
  ovTitle: $('overlay-title'), ovSub: $('overlay-sub'), resume: $('btn-resume'), toLobby: $('btn-lobby'),
  zone: $('zone'), intro: $('intro'), hint: $('hint'), debug: $('debug'),
};
let state = 'lobby'; // lobby | loading | ready | playing | paused
let currentMap = null;
let zoneName = '';
let zoneTimer = 0;

function show(el, on) { el.classList.toggle('hidden', !on); }
function setState(s) {
  state = s;
  show(ui.lobby, s === 'lobby');
  show(ui.loading, s === 'loading');
  show(ui.overlay, s === 'ready' || s === 'paused');
  show(ui.hud, s === 'playing');
  if (s === 'ready') { ui.ovTitle.textContent = '點擊開始探索'; ui.ovSub.textContent = '滑鼠將被鎖定以控制視角'; ui.resume.textContent = '進入'; }
  if (s === 'paused') { ui.ovTitle.textContent = '暫停'; ui.ovSub.textContent = currentMap ? `${currentMap.name} ・ ${zoneName}` : ''; ui.resume.textContent = '繼續'; }
}

// ───── 大廳 ─────
function buildLobby() {
  ui.list.innerHTML = '';
  const saved=readSave();
  ui.list.innerHTML=`<button class="menu-entry primary-entry" id="start-story"><span class="menu-number">01</span><span>重返慈雲寺<small>開始新的故事</small></span><span class="menu-arrow">↗</span></button><button class="menu-entry" id="continue-story" ${saved?'':'disabled'}><span class="menu-number">02</span><span>續寫未完的約定<small>${saved?`第 ${saved.chapter} 章 · 已收集 ${saved.evidence.length} 份證據`:'尚無調查紀錄'}</small></span><span class="menu-arrow">↗</span></button><div class="menu-meta"><span>四個章節</span><i></i><span>三種結局</span><i></i><span>繁體中文</span></div>`;
  $('start-story').onclick=()=>{
    if(saved&&!confirm('開始新故事會取代目前的自動存檔。確定重新開始？'))return;
    enterMap(MAPS[0],false);
  };
  $('continue-story').onclick=()=>enterMap(MAPS[0],true);
}

let settings = {};
try { settings = JSON.parse(localStorage.getItem('ols-settings') || '{}') || {}; } catch {}
function applySettings() {
  const s = { sensitivity: +$('set-sens').value, volume: +$('set-vol').value, quality: $('set-quality').value };
  try { localStorage.setItem('ols-settings', JSON.stringify(s)); } catch {}
  game.applySettings(s);
}
if (settings.sensitivity) $('set-sens').value = settings.sensitivity;
if (settings.volume != null) $('set-vol').value = settings.volume;
if (['low','medium','high'].includes(settings.quality)) $('set-quality').value = settings.quality;
for (const id of ['set-sens', 'set-vol', 'set-quality']) $(id).addEventListener('change', applySettings);
applySettings();

// ───── 載入地圖 ─────
async function enterMap(def, resume = false) {
  if (state === 'loading') return;
  currentMap = def;
  game.audio.init(); // 在使用者點擊時建立音訊
  ui.loadTitle.textContent = def.name;
  ui.bar.style.width = '0%';
  setState('loading');
  try {
    await game.loadMap(def, (p, label) => {
      ui.bar.style.width = `${Math.round(p * 100)}%`;
      if (label) ui.label.textContent = `${label}…`;
    });
  } catch (err) {
    console.error(err);
    ui.label.textContent = `載入失敗：${err.message}`;
    setTimeout(() => setState('lobby'), 2500);
    return;
  }
  zoneName = '';
  game.story = new Story(game, { resume, onLobby: returnToLobby, onResume: () => {
    if (AUTO) return;
    canvas.requestPointerLock().catch(() => { game.stop(); game.audio.stop(); setState('paused'); });
  }});
  if (AUTO) { beginPlay(true); return; }
  setState('ready');
}

function beginPlay(first) {
  setState('playing');
  game.audio.init();
  game.audio.start();
  game.start();
  game.story?.start();
  game.player.enabled = !game.story?.modal;
  if (first) {
    ui.intro.textContent = (currentMap.intro || []).join('\n');
    ui.intro.classList.add('show');
    setTimeout(() => ui.intro.classList.remove('show'), 6000);
    ui.hint.innerHTML = '<kbd>E</kbd> 調查　<kbd>J</kbd> 筆記　<kbd>F</kbd> 手電筒　<kbd>Shift</kbd> 奔跑　<kbd>Esc</kbd> 暫停';
    ui.hint.classList.add('show');
    setTimeout(() => ui.hint.classList.remove('show'), 9000);
  }
}

let firstEntry = true;
async function lockAndPlay() {
  try {
    await canvas.requestPointerLock();
  } catch (err) {
    // 瀏覽器在剛按下 Esc 後短時間內會拒絕再次鎖定，請使用者再點一次
    ui.ovSub.textContent = '請再點擊一次';
    return;
  }
}
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  if (locked && (state === 'ready' || state === 'paused')) { beginPlay(firstEntry); firstEntry = false; }
  else if (!locked && state === 'playing' && !AUTO && !game.story?.modal) {
    if (!game.story?.chase && !game.story?.ritual) game.story?.save();
    game.stop();
    game.audio.stop();
    setState('paused');
  }
});
ui.resume.addEventListener('click', lockAndPlay);
function returnToLobby() {
  if (game.story && !game.story.state.ending && !game.story.chase && !game.story.ritual) game.story.save();
  game.audio.stop();
  game.unloadMap();
  firstEntry = true;
  setState('lobby');
  buildLobby();
}
ui.toLobby.addEventListener('click', returnToLobby);

// ───── 遊戲中 HUD 與驗證用快捷鍵 ─────
const TELEPORTS = {
  Digit1: [0, 49, 0], // 參道起點
  Digit2: [0, 16, 0], // 廟埕
  Digit3: [0, -14.5, 0], // 一樓
  Digit4: [-13, -15.8, -Math.PI / 2], // 二樓
  Digit5: [10, -27.8, Math.PI / 2], // 三樓
  Digit6: [0, -17.4, 0], // 四樓露台
  Digit7: [-40, 0, Math.PI / 2], // 亂葬崗
};
const TELEPORT_Y = { Digit4: 6.9, Digit5: 11.9, Digit6: 16.9 };
window.addEventListener('keydown', (e) => {
  if (state !== 'playing' || e.repeat || !DEV || game.story?.modal) return;
  if (e.code === 'KeyL') game.map.setFullBright(!game.map.fullBright);
  if (e.code === 'KeyV') { game.player.fly = !game.player.fly; flash(game.player.fly ? '飛行模式：開（Space 上升 / Ctrl 下降）' : '飛行模式：關'); }
  if (e.code === 'KeyP') ui.debug.classList.toggle('hidden');
  const tp = TELEPORTS[e.code];
  if (tp) {
    const y = TELEPORT_Y[e.code] ?? game.map.world.probe(tp[0], tp[1], 1.5).g;
    game.player.teleport(tp[0], y, tp[1], tp[2], 0);
  }
});
let hintTimer = 0;
function flash(text) {
  ui.hint.textContent = text;
  ui.hint.classList.add('show');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => ui.hint.classList.remove('show'), 2500);
}

let dbgAcc = 0;
game.onFrame = (dt) => {
  const p = game.player.pos;
  const z = game.map.zoneName(p);
  if (z !== zoneName) {
    zoneName = z;
    ui.zone.textContent = z;
    ui.zone.classList.add('show');
    clearTimeout(zoneTimer);
    zoneTimer = setTimeout(() => ui.zone.classList.remove('show'), 3800);
  }
  dbgAcc += dt;
  if (dbgAcc > 0.2 && !ui.debug.classList.contains('hidden')) {
    dbgAcc = 0;
    const info = game.renderer.info;
    ui.debug.textContent =
      `FPS  ${game.fps.toFixed(0)}\n` +
      `位置 x ${p.x.toFixed(1)}  y ${p.y.toFixed(1)}  z ${p.z.toFixed(1)}\n` +
      `方向 ${((game.player.yaw * 180) / Math.PI).toFixed(0)}°\n` +
      `區域 ${z}\n` +
      `繪製 ${info.render.calls} calls / ${(info.render.triangles / 1000).toFixed(0)}k tris`;
  }
};

buildLobby();
setState('lobby');
window.__game = game; // 除錯 / 自動化測試用
window.__enter = (id) => enterMap(MAPS.find((m) => m.id === id));
if (DEV) document.querySelector('.overlay-keys').classList.add('dev-visible');
if (AUTO && params.get('map')) enterMap(MAPS.find(m=>m.id===params.get('map'))||MAPS[0],params.has('resume'));
