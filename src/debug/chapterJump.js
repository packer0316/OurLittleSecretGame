// 除錯：章節跳轉。合成一份「玩到這裡」的合法存檔，重新載入對應地圖，把玩家放到該段落的位置，
// 必要時直接開始寺內恐怖段落或結局的某一段。
//
// 開啟方式：開發伺服器（npm run dev）一律可用；正式打包需在網址加 ?dev 或 ?debug。
//   大廳「章節跳轉」、暫停畫面「章節跳轉」、遊戲中任何時候按 F9。
//   網址 ?jump=<id> 載入後直接跳到該檢查點（例如 ?jump=t3-hide），主控台 __jump('<id>')。
// 跳轉會覆寫自動存檔；第一次跳轉前的存檔另外備份，面板上可以一鍵還原。
import { SAVE_KEY, CHAPTERS, EVIDENCE, newState, validateSave } from '../story/campaign.js';

export const BACKUP_KEY = SAVE_KEY + '-debug-backup';
export const DECISION_KEY = SAVE_KEY + '-decision';

// ── 進度的累積片段（照正常遊玩的順序） ──
// 證據：送行盤（ritual）就在二樓錄音機旁，一般玩家拿錄音機時會一起拿，所以從第三章起算進去。
const EV2 = ['diary', 'newspaper'];
const EV3 = [...EV2, 'tape', 'ritual'];
const EV3S = [...EV3, 'stage'];
const EV4D = [...EV3S, 'death'];
const EV4B = [...EV4D, 'births'];
const EV4R = [...EV4B, 'relic'];
const EVALL = [...EV4R, 'names', 'confession'];
const F2 = ['incense'];
const F3S = [...F2, 'stage'];
const F3L = [...F3S, 'loopSolved'];
const F4 = [...F3L, 'key'];
const F5 = [...F4, 'underground'];
// 已經演過的一次性段落：跳到後面的章節時，前面照常會遇到的段落視為演過，不會在不對的地方重演。
const S3 = ['dread:ash', 'dread:echo1'];
const S3H = [...S3, 'dread:hideseek'];
const S4 = [...S3H, 'dread:echo2'];
const S4P = [...S4, 'dread:patrol'];
const S4R = [...S4P, 'dread:arhats', 'dread:echo3'];
const S5 = [...S4R, 'story:camp'];

const setpiece = (id) => (game) => game.horror?.debug?.setpiece?.(id);
const finale = (kind, phase) => (game) => game.story?.startFinale?.(kind, phase);
const CH = (n) => `第${['', '一', '二', '三', '四'][n]}章　${CHAPTERS[n]}`;

/**
 * 檢查點。
 *  scene   home | road | temple
 *  home / road   序章的步驟（HomeStory / RoadStory 的 step）
 *  ev / flags / seen   寺內的證據、旗標、已演過的段落
 *  at      [x, y, z, yaw?, pitch?]：y 只是大概的樓層高度，實際會貼到腳下的地板
 *  near    放在某個調查目標前方（off = [dx, dz]，預設往南 2.1 公尺），並面向它
 *  face    用 at 定位時要面向的目標
 *  after   玩家進入遊戲後要做的事（開始恐怖段落、結局某一段）
 *  decision  同時寫入「回到最後抉擇」用的存檔
 *  focus   測試用：跳過去以後準星應該對到這個目標
 */
export const CHECKPOINTS = [
  // ── 序章 ──
  { id: 'home', group: '序章　住處', title: '深夜的信封', sub: '從頭開始：書桌上的照片', scene: 'home', home: 0 },
  { id: 'home-call', group: '序章　住處', title: '阿哲的來電', sub: '照片看完，手機正在響', scene: 'home', home: 2 },
  { id: 'home-out', group: '序章　住處', title: '出發之前', sub: '門縫的紙讀過了，拿鑰匙與手電筒', scene: 'home', home: 4 },
  { id: 'road', group: '序章之二　舊山路', title: '停車處', sub: '落石擋路，走進慈雲里', scene: 'road', road: 0 },
  { id: 'road-shop', group: '序章之二　舊山路', title: '榮昌紙紮行', sub: '公告讀過了，去作坊找人', scene: 'road', road: 2, at: [8.5, 0, -11.6], face: 'remains' },
  { id: 'road-gate', group: '序章之二　舊山路', title: '村尾參道', sub: '影片看完；佩珊即將回電（R 接聽）', scene: 'road', road: 4, at: [1.5, 0, -12.5, 0, 0] },

  // ── 第一章：還沒調查三炷香 ──
  { id: 't1', group: CH(1), title: '踏進山門', sub: '剛走完參道，02:47', scene: 'temple', minutes: 0 },
  { id: 't1-hall', group: CH(1), title: '正殿・三炷未熄的香', sub: '站在供桌前', scene: 'temple', near: 'incense', off: [0, 4.8], minutes: 2 },

  // ── 第二章：香查過了，山門關上 ──
  { id: 't2', group: CH(2), title: '正殿・兩張工作桌', sub: '山門剛關上；計數器、燒過的門閂', scene: 'temple', flags: F2, near: 'diary', focus: 'diary', minutes: 5 },
  { id: 't2-echo1', group: CH(2), tag: '恐怖', title: '西側樓梯・柏翰的回聲', sub: '蒙紅布的人坐在柱子前', scene: 'temple', flags: F2, ev: ['diary'], at: [-16.1, 3.0, -23.5, Math.PI, 0], after: setpiece('echo1'), minutes: 8 },
  { id: 't2-tape', group: CH(2), title: '二樓・舊錄音機', sub: '一樓兩樣都收了，上樓找錄音機', scene: 'temple', flags: F2, ev: EV2, near: 'tape', focus: 'tape', seen: ['dread:echo1'], minutes: 10 },

  // ── 第三章：三樣線索齊了 ──
  { id: 't3-ash', group: CH(3), tag: '恐怖', title: '西側樓梯・香灰上的字', sub: '下樓時，香灰浮出小孩的字', scene: 'temple', flags: F2, ev: EV3, seen: ['dread:echo1'], at: [-16.1, 3.4, -22.5, 0, -0.42], after: setpiece('ash'), minutes: 14 },
  { id: 't3', group: CH(3), title: '廟埕・舊戲台點名', sub: '三聲木魚，去戲台', scene: 'temple', flags: F2, ev: EV3, seen: S3, near: 'stage', off: [0, 2], focus: 'stage', minutes: 16 },
  { id: 't3-hide', group: CH(3), tag: '恐怖', title: '二樓・1998 年捉迷藏', sub: '燈全熄，按住 Space 數到十', scene: 'temple', flags: F3S, ev: EV3S, seen: S3, at: [-13.5, 6.9, -16.4, -Math.PI / 2, 0], after: setpiece('hideseek'), minutes: 20 },
  { id: 't3-loop', group: CH(3), title: '二樓回廊・紅線旁的記號', sub: '重複的回廊（要查三次）', scene: 'temple', flags: F3S, ev: EV3S, seen: S3H, at: [-13, 6.9, -16], face: 'loopmark', focus: 'loopmark', minutes: 24 },
  { id: 't3-div', group: CH(3), title: '二樓・擲筊問路', sub: '只問路，不報姓名', scene: 'temple', flags: F3L, ev: EV3S, seen: S3H, near: 'divination', focus: 'divination', minutes: 27 },

  // ── 第四章：拿到銅鑰匙 ──
  { id: 't4-echo2', group: CH(4), tag: '恐怖', title: '二樓・志豪的回聲', sub: '佛龕前那支還亮著的手電筒', scene: 'temple', flags: F4, ev: EV3S, seen: S3H, at: [2.0, 6.9, -20.0, Math.PI, 0], after: setpiece('echo2'), minutes: 29 },
  { id: 't4', group: CH(4), title: '三樓・阿哲的手機', sub: '鑰匙到手，訊息來自三樓的充電座', scene: 'temple', flags: F4, ev: EV3S, seen: S4, near: 'death', focus: 'death', minutes: 31 },
  { id: 't4-patrol', group: CH(4), tag: '恐怖', title: '三樓・女影巡獵', sub: '躲進布幔／經櫃／供桌下，按住 Space 屏息', scene: 'temple', flags: F4, ev: EV4D, seen: S4, at: [4.6, 11.9, -26.0, Math.PI / 2, 0.08], after: setpiece('patrol'), minutes: 33 },
  { id: 't4-births', group: CH(4), title: '三樓・門框上的身高刻痕', sub: '第六道刻痕被補土蓋住', scene: 'temple', flags: F4, ev: EV4D, seen: S4P, near: 'births', focus: 'births', minutes: 36 },
  { id: 't4-relic', group: CH(4), title: '西牆外・老樹下的布兔', sub: '亂葬崗的石座', scene: 'temple', flags: F4, ev: EV4B, seen: S4P, near: 'relic', focus: 'relic', minutes: 39 },
  { id: 't4-arhats', group: CH(4), tag: '恐怖', title: '一樓・木頭人羅漢', sub: '照著它們，按 S 倒退', scene: 'temple', flags: F4, ev: EV4R, seen: S4P, at: [-12.5, 0.9, -24.0, 0, 0], after: setpiece('arhats'), minutes: 42 },
  { id: 't4-echo3', group: CH(4), tag: '恐怖', title: '三樓・阿哲的回聲', sub: '伸出手，等你把手機還他', scene: 'temple', flags: F4, ev: EV4R, seen: [...S4P, 'dread:arhats'], at: [-3.5, 11.9, -26.7, Math.PI / 2, 0], after: setpiece('echo3'), minutes: 44 },
  { id: 't4-hatch', group: CH(4), title: '四樓・封住的暗道', sub: '碰暗道時錄音機會點名（第三次考驗）', scene: 'temple', flags: F4, ev: EV4R, seen: S4R, near: 'descent', focus: 'descent', minutes: 47 },
  { id: 't5', group: CH(4), title: '地下・封印室', sub: '西牆的手印、門前的舊鎖', scene: 'temple', flags: F5, ev: EV4R, seen: S5, at: [55, -7, -13.5, 0, 0], minutes: 52 },
  { id: 't5-altar', group: CH(4), title: '地下・最後的抉擇', sub: '十一份證據齊全，站在神壇前', scene: 'temple', flags: F5, ev: EVALL, seen: S5, at: [55, -7, -21.6, 0, 0], face: 'altar', focus: 'altar', decision: true, minutes: 58 },

  // ── 結局：直接開始演出的某一段 ──
  { id: 'end-c', group: '結局 C　把話說完（真結局）', tag: '結局', title: '點香・送行開始', sub: '左側空牌位：說出她的名字', ...ending(), after: finale('C') },
  { id: 'end-c-walk', group: '結局 C　把話說完（真結局）', tag: '結局', title: '不要回頭', sub: '黑暗中所有人的聲音輪流叫你', ...ending(), after: finale('C', 'c-walk') },
  { id: 'end-c-six', group: '結局 C　把話說完（真結局）', tag: '結局', title: '點名到六', sub: '三個朋友蒙眼坐成一排，撐住不應', ...ending(), after: finale('C', 'c-six') },
  { id: 'end-c-fire', group: '結局 C　把話說完（真結局）', tag: '結局', title: '燙手的鑰匙', sub: '1998 年的後殿；按住 E 轉動鑰匙', ...ending(), after: finale('C', 'c-fire') },
  { id: 'end-c-girl', group: '結局 C　把話說完（真結局）', tag: '結局', title: '門後的小雨', sub: '只穿一隻紅鞋的女孩', ...ending(), after: finale('C', 'c-girl') },
  { id: 'end-c-mother', group: '結局 C　把話說完（真結局）', tag: '結局', title: '母女', sub: '美蘭第一次叫出女兒的名字', ...ending(), after: finale('C', 'c-mother') },
  { id: 'end-c-gate', group: '結局 C　把話說完（真結局）', tag: '結局', title: '黎明的山門', sub: '回答搜救隊「裡面還有沒有人」', ...ending(), after: finale('C', 'c-gate') },
  { id: 'end-a', group: '結局 A　說好不說', tag: '結局', title: '繫緊紅繩', sub: '門後的人拍門求你', ...ending(), after: finale('A') },
  { id: 'end-a-walk', group: '結局 A　說好不說', tag: '結局', title: '被燈追著走出去', sub: '身後的燈一盞盞熄滅', ...ending(), after: finale('A', 'a-walk') },
  { id: 'end-a-gate', group: '結局 A　說好不說', tag: '結局', title: '山門前的回答', sub: '「都出來了」', ...ending(), after: finale('A', 'a-gate') },
  { id: 'end-b', group: '結局 B　替身', tag: '結局', title: '解開覆眼的紅布', sub: '相信門裡的聲音', ...ending(), after: finale('B') },
  { id: 'end-b-roll', group: '結局 B　替身', tag: '結局', title: '第六張椅子', sub: '點名點到六，你的嘴答了「有」', ...ending(), after: finale('B', 'b-roll') },
];
function ending() { return { scene: 'temple', flags: F5, ev: EVALL, seen: S5, at: [55, -7, -21.6, 0, 0], decision: true, minutes: 60 }; }

/** 檢查點對應的完整存檔（經過 validateSave，保證和正常存檔一樣合法）。 */
export function checkpointState(cp) {
  const s = newState();
  s.scene = cp.scene;
  if (cp.scene !== 'home') { s.home = { step: 6, notes: [], answered: false }; s.flags.prologueComplete = true; }
  if (cp.scene === 'home') s.home.step = cp.home ?? 0;
  if (cp.scene === 'road') s.road = { step: cp.road ?? 0, notes: [], peishan: null };
  // 進寺的玩家大多在山村接過佩珊的電話（影響之後幾句台詞與結局的尾聲）
  if (cp.scene === 'temple') s.road = { step: 5, notes: [], peishan: 'trust' };
  for (const id of cp.ev || []) if (Object.hasOwn(EVIDENCE, id) && !s.evidence.includes(id)) s.evidence.push(id);
  for (const f of cp.flags || []) s.flags[f] = true;
  s.seen = [...(cp.seen || [])];
  s.elapsed = (cp.minutes || 0) * 60;
  const v = validateSave(JSON.parse(JSON.stringify(s)));
  if (!v) throw new Error('checkpoint state invalid: ' + cp.id);
  return v;
}

/** 跳轉前的存檔只備份一次（之後連續跳轉不會蓋掉真正的進度）。 */
export function backupBeforeJump() {
  try {
    if (localStorage.getItem(BACKUP_KEY)) return;
    localStorage.setItem(BACKUP_KEY, JSON.stringify({ save: localStorage.getItem(SAVE_KEY), decision: localStorage.getItem(DECISION_KEY), at: Date.now() }));
  } catch { /* 無法備份時照樣跳轉 */ }
}
export function backupInfo() { try { const b = JSON.parse(localStorage.getItem(BACKUP_KEY)); return b && typeof b === 'object' ? b : null; } catch { return null; } }
export function restoreBackup() {
  const b = backupInfo(); if (!b) return false;
  try {
    for (const [key, val] of [[SAVE_KEY, b.save], [DECISION_KEY, b.decision]]) { if (typeof val === 'string') localStorage.setItem(key, val); else localStorage.removeItem(key); }
    localStorage.removeItem(BACKUP_KEY);
    return true;
  } catch { return false; }
}
export function writeCheckpoint(cp, state) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  if (cp.decision) localStorage.setItem(DECISION_KEY, JSON.stringify(state));
}

const floorOf = (y) => (y < 0 ? -7 : y > 16 ? 16.9 : y > 11 ? 11.9 : y > 6 ? 6.9 : 0.9);

/** 把玩家放到檢查點的位置（地圖已載入、劇情已建立之後呼叫）。沒有 at / near 時留在地圖預設的出生點。 */
export function placePlayer(game, cp) {
  const map = game.map, w = map?.world, p = game.player;
  if (!w || (!cp.at && !cp.near)) return false;
  const targetPos = (id) => map.storyWorld?.targets?.find((t) => t.id === id)?.position || null;
  let x, y, z, yaw = 0, pitch = 0;
  const look = cp.face || cp.near;
  const t = look ? targetPos(look) : null;
  if (cp.at) {
    [x, y, z] = cp.at; yaw = cp.at[3] ?? 0; pitch = cp.at[4] ?? 0;
  } else {
    if (!t) return false;
    const off = cp.off || [0, 2.1];
    x = t.x + off[0]; z = t.z + off[1];
    y = map.id !== 'temple' || cp.near === 'relic' ? w.terrain(x, z) : floorOf(t.y);
  }
  // 貼到腳下的地板（樓梯、地形起伏都算），不會卡在半空或埋進地裡
  y = w.probe(x, z, y + 0.4).g;
  if (t && (cp.face || !cp.at)) {
    const dx = t.x - x, dz = t.z - z, dy = t.y - (y + (p.eye || 1.66));
    yaw = Math.atan2(-dx, -dz);
    pitch = Math.max(-1.1, Math.min(0.9, Math.atan2(dy, Math.hypot(dx, dz))));
  }
  p.teleport(x, y, z, yaw, pitch);
  return true;
}

// ───────────────────────── 面板 ─────────────────────────
const CSS = `
#chapter-jump{position:fixed;inset:0;z-index:80;display:grid;place-items:center;padding:24px;background:rgba(3,3,4,.86);backdrop-filter:blur(4px);font-family:var(--sans);color:var(--ink)}
#chapter-jump .cj-card{position:relative;width:min(1180px,100%);max-height:calc(100vh - 48px);min-height:0;display:flex;flex-direction:column;border:1px solid var(--line);background:linear-gradient(180deg,rgba(18,14,12,.97),rgba(7,6,6,.97));box-shadow:0 30px 80px rgba(0,0,0,.6)}
#chapter-jump header{padding:22px 28px 14px;border-bottom:1px solid var(--line)}
#chapter-jump .cj-eyebrow{margin:0 0 6px;font-size:.7rem;letter-spacing:.38em;color:var(--blood-hi)}
#chapter-jump h2{margin:0;font:600 1.45rem var(--serif);letter-spacing:.12em}
#chapter-jump .cj-now{margin:8px 0 0;font-size:.8rem;color:var(--dim)}
#chapter-jump .cj-close{position:absolute;top:16px;right:18px;width:36px;height:36px;border:1px solid var(--line);background:none;color:var(--dim);font-size:1.1rem;cursor:pointer}
#chapter-jump .cj-close:hover{color:var(--ink);border-color:var(--ink)}
#chapter-jump .cj-body{flex:1 1 auto;min-height:0;overflow:auto;padding:6px 28px 18px}
#chapter-jump h3{margin:18px 0 8px;font:600 .82rem var(--sans);letter-spacing:.24em;color:var(--gold)}
#chapter-jump .cj-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:8px}
#chapter-jump .cj-grid button{position:relative;display:flex;flex-direction:column;gap:4px;padding:10px 14px 11px;text-align:left;border:1px solid var(--line);background:rgba(255,255,255,.025);color:var(--ink);cursor:pointer;transition:border-color .2s,background .2s}
#chapter-jump .cj-grid button:hover,#chapter-jump .cj-grid button:focus-visible{border-color:var(--blood-hi);background:rgba(143,23,18,.22);outline:none}
#chapter-jump .cj-grid strong{font:600 .92rem var(--sans);letter-spacing:.05em;padding-right:44px}
#chapter-jump .cj-grid small{font-size:.74rem;color:var(--dim);line-height:1.45}
#chapter-jump .cj-grid i{position:absolute;top:9px;right:10px;font:normal .62rem var(--sans);letter-spacing:.12em;padding:1px 6px;border:1px solid rgba(195,38,29,.6);color:#e08a7f}
#chapter-jump .cj-grid i.end{border-color:rgba(168,138,74,.7);color:var(--gold)}
#chapter-jump .cj-grid code{font-size:.66rem;color:var(--faint)}
#chapter-jump footer{display:flex;flex-wrap:wrap;gap:10px 18px;align-items:center;justify-content:space-between;padding:12px 28px 16px;border-top:1px solid var(--line);font-size:.75rem;color:var(--dim)}
#chapter-jump footer button{padding:7px 16px;border:1px solid var(--line);background:rgba(255,255,255,.03);color:var(--ink);font:.78rem var(--sans);letter-spacing:.12em;cursor:pointer}
#chapter-jump footer button:hover{border-color:var(--ink)}
#chapter-jump.busy .cj-grid button{pointer-events:none;opacity:.45}
.menu-entry.debug-entry{border-style:dashed}
.menu-entry.debug-entry .menu-number{color:var(--blood-hi)}
`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * 章節跳轉面板。onJump(id) 回傳 Promise；onRestore() 還原備份；describe() 回傳目前存檔的一行說明。
 */
export function createChapterPanel({ onJump, onRestore, describe }) {
  if (!document.getElementById('chapter-jump-css')) { const st = document.createElement('style'); st.id = 'chapter-jump-css'; st.textContent = CSS; document.head.appendChild(st); }
  const el = document.createElement('section');
  el.id = 'chapter-jump'; el.className = 'hidden'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'cj-title');
  const groups = [];
  for (const cp of CHECKPOINTS) { let g = groups.find((x) => x.name === cp.group); if (!g) groups.push(g = { name: cp.group, list: [] }); g.list.push(cp); }
  el.innerHTML = `<div class="cj-card"><header><p class="cj-eyebrow">DEBUG　章節跳轉</p><h2 id="cj-title">跳到指定段落</h2><p class="cj-now"></p><button class="cj-close" title="關閉（Esc / F9）" aria-label="關閉">✕</button></header>
    <div class="cj-body">${groups.map((g) => `<h3>${esc(g.name)}</h3><div class="cj-grid">${g.list.map((cp) => `<button data-cp="${cp.id}">${cp.tag ? `<i class="${cp.tag === '結局' ? 'end' : ''}">${esc(cp.tag)}</i>` : ''}<strong>${esc(cp.title)}</strong><small>${esc(cp.sub || '')}</small><code>${cp.id}</code></button>`).join('')}</div>`).join('')}</div>
    <footer><span>跳轉會覆寫自動存檔；第一次跳轉前的存檔已另外備份。F9 開關此面板，網址加 <code>?jump=&lt;id&gt;</code> 可直接跳。</span><button class="cj-restore hidden">還原跳轉前的存檔</button></footer></div>`;
  document.body.appendChild(el);
  const restoreBtn = el.querySelector('.cj-restore');
  const refresh = () => {
    el.querySelector('.cj-now').textContent = describe?.() || '';
    const b = backupInfo();
    restoreBtn.classList.toggle('hidden', !b);
    if (b) restoreBtn.textContent = `還原跳轉前的存檔（${new Date(b.at || Date.now()).toLocaleString('zh-TW', { hour12: false })}）`;
  };
  const panel = {
    el,
    get isOpen() { return !el.classList.contains('hidden'); },
    open() { refresh(); el.classList.remove('hidden'); el.classList.remove('busy'); if (document.pointerLockElement) document.exitPointerLock(); el.querySelector('[data-cp]')?.focus({ preventScroll: true }); },
    close() { el.classList.add('hidden'); },
    toggle() { if (panel.isOpen) panel.close(); else panel.open(); },
    refresh,
  };
  el.querySelector('.cj-close').addEventListener('click', () => panel.close());
  el.addEventListener('click', (e) => { if (e.target === el) panel.close(); });
  el.addEventListener('keydown', (e) => { if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); panel.close(); } });
  for (const b of el.querySelectorAll('[data-cp]')) {
    b.addEventListener('click', async () => {
      el.classList.add('busy');
      try { await onJump(b.dataset.cp); } finally { el.classList.remove('busy'); panel.close(); }
    });
  }
  restoreBtn.addEventListener('click', () => { onRestore?.(); refresh(); panel.close(); });
  return panel;
}
