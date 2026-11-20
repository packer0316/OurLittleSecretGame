// foley 組的錄音素材登記（格式見 src/audio/bank.js）。檔案放在 public/assets/audio/ 底下，來源與授權記在 art-direction/audio-sources/ledger-foley.json。
// 素材由 art-direction/audio-sources/build-foley.py 從原始下載處理而成（全部單聲道 48 kHz Ogg Vorbis；環境床是無縫循環）。
// 記憶體預算：每張地圖已解碼 ≤ 30 MB（48 kHz 單聲道 1 秒 ≈ 0.19 MB），所以 maps 精準指定、變體數量有節制。
const T = ['temple'], R = ['road'], H = ['home'], TR = ['temple', 'road'], RH = ['road', 'home'], ALL = ['temple', 'road', 'home'];
const v = (base, n) => Array.from({ length: n }, (_, i) => `foley/${base}_${String(i + 1).padStart(2, '0')}.ogg`);

export default {
  // ── 環境床（bus amb，會被 duck() 抽空）：遊戲裡同一個檔案在兩個偏移位置左右各播一條，聽不出循環 ──
  'foley.bed.temple.night': { files: ['amb/temple_night.ogg'], maps: T, bus: 'amb', gain: 1 },
  'foley.bed.temple.hall': { files: ['amb/temple_hall.ogg'], maps: T, bus: 'amb', gain: 1 },
  'foley.bed.temple.crypt': { files: ['amb/temple_crypt.ogg'], maps: T, bus: 'amb', gain: 1 },
  'foley.bed.temple.grave': { files: ['amb/temple_grave.ogg'], maps: T, bus: 'amb', gain: 1 },
  'foley.bed.dawn': { files: ['amb/dawn_birds.ogg'], maps: T, bus: 'amb', gain: 1 },
  'foley.bed.road.night': { files: ['amb/road_night.ogg'], maps: R, bus: 'amb', gain: 1 },
  'foley.bed.home.rain': { files: ['amb/home_rain.ogg'], maps: H, bus: 'amb', gain: 1 },
  'foley.bed.home.city': { files: ['amb/home_city.ogg'], maps: H, bus: 'amb', gain: 1 },
  'foley.bed.home.fridge': { files: ['amb/home_fridge.ogg'], maps: H, bus: 'amb', gain: 1 },

  // ── 腳步（每種材質 6–7 個變體；bank 不會連續重複同一個） ──
  'foley.step.wood': { files: v('step_wood', 7), maps: T, rate: [0.95, 1.05] },
  'foley.step.stone': { files: v('step_stone', 7), maps: TR, rate: [0.95, 1.06] },
  'foley.step.dirt': { files: v('step_dirt', 7), maps: TR, rate: [0.94, 1.06] },
  'foley.step.grass': { files: v('step_grass', 7), maps: T, rate: [0.94, 1.06] },
  'foley.step.gravel': { files: v('step_gravel', 7), maps: R, rate: [0.94, 1.06] },
  'foley.step.floor': { files: v('step_floor', 7), maps: H, rate: [0.95, 1.05] },
  'foley.step.wet': { files: v('step_wet', 6), maps: T, rate: [0.94, 1.04] },
  'foley.scuff': { files: v('scuff', 2), maps: ALL, rate: [0.92, 1.08] },

  // ── 木構造、門 ──
  'foley.creak.floor': { files: v('creak_floor', 5), maps: T, rate: [0.9, 1.1] },
  'foley.creak.long': { files: v('creak_long', 2), maps: ALL, rate: [0.85, 1.1] },
  'foley.door.creak': { files: v('door_creak', 1), maps: T, rate: [0.92, 1.04] },
  'foley.knock': { files: v('knock', 5), maps: ALL, rate: [0.95, 1.05] },
  'foley.knock.door': { files: v('knock_door', 3), maps: H, rate: [0.96, 1.04] },
  'foley.slam': { files: v('slam', 2), maps: ALL, rate: [0.92, 1.03] },
  'foley.scrape': { files: v('scrape', 2), maps: ALL, rate: [0.9, 1.06] },
  'foley.bang': { files: v('bang', 2), maps: T, rate: [0.94, 1.04] },
  'foley.lock': { files: ['foley/lock_clunk.ogg'], maps: T },

  // ── 水、彈珠、雜訊、手機 ──
  'foley.drip': { files: v('drip', 5), maps: ALL, rate: [0.85, 1.2] },
  'foley.marble': { files: v('marble', 1), maps: ALL, rate: [0.94, 1.06] },
  'foley.static': { files: v('static', 2), maps: ALL, rate: [0.95, 1.05] },
  'foley.tape': { files: ['foley/tape_loop.ogg'], maps: T },
  'foley.vibrate': { files: v('vibrate', 1), maps: ALL },
  'foley.click': { files: v('click', 2), maps: ALL, rate: [0.96, 1.04] },
  'foley.ringtone': { files: ['foley/ringtone.ogg'], maps: RH },
  'foley.thunder': { files: v('thunder', 2), maps: H, bus: 'amb', rate: [0.92, 1.04] },

  // ── 寺廟劇中樂器 ──
  'foley.bell': { files: ['foley/bell_temple.ogg'], maps: T },
  'foley.inkin': { files: v('inkin', 1), maps: T, rate: [0.99, 1.01] },
  'foley.woodfish': { files: v('woodfish', 3), maps: T, rate: [0.98, 1.02] },
  'foley.woodfish.small': { files: ['foley/woodfish_04.ogg'], maps: T, rate: [0.98, 1.02] },
  'foley.chant': { files: v('chant', 2), maps: T, rate: [0.97, 1.0] },
  'foley.chime': { files: v('chime', 2), maps: T, rate: [0.9, 1.08] },
  'foley.paper': { files: v('paper', 3), maps: T, rate: [0.92, 1.08] },

  // ── 夜裡的動物 ──
  'foley.owl': { files: v('owl', 1), maps: TR, rate: [0.95, 1.03] },
  'foley.bark': { files: v('bark', 3), maps: TR, rate: [0.92, 1.06] },
  'foley.howl': { files: v('howl', 1), maps: ALL, rate: [0.92, 1.04] },
  'foley.rustle': { files: v('rustle', 2), maps: TR, rate: [0.9, 1.1] },

  // ── 石、火、結局 ──
  'foley.grind': { files: ['foley/grind_loop.ogg'], maps: T },
  'foley.crack': { files: ['foley/stone_crack.ogg'], maps: T, rate: [0.9, 1.05] },
  'foley.fire': { files: ['foley/fire_loop.ogg'], maps: TR },
  'foley.firepop': { files: v('fire_pop', 4), maps: TR, rate: [0.85, 1.15] },
  'foley.sizzle': { files: ['foley/sizzle_loop.ogg'], maps: T },
  'foley.drag': { files: ['foley/drag_01.ogg'], maps: T },
  'foley.cloth': { files: v('cloth', 2), maps: T, rate: [0.95, 1.05] },
  'foley.snuff': { files: v('snuff', 2), maps: T, rate: [0.94, 1.06] },
};
