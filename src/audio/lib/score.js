// score 組的錄音素材登記（格式見 src/audio/bank.js）。檔案放在 public/assets/audio/ 底下，來源與授權記在 art-direction/audio-sources/ledger-score.json。
// 全部由 scripts/audio-score-build.py 從 VSCO-2-CE（CC0）與 Freesound CC0 錄音離線製作。48 kHz 單聲道 Vorbis。
// loopStart / loopEnd（秒）：循環素材的前後各多 0.1 秒接續內容，引擎只循環中間那段（Vorbis 的頭尾失真落在循環區外）。
// onset（秒）：爆點在檔案裡的位置；riser 的 onsetEnd 是檔案結尾（精準落在爆點上）。
const T = ['temple'], TR = ['temple', 'road'], ALL = ['temple', 'road', 'home'];
const f = (name) => `score/${name}.ogg`;

export default {
  // ── 持續層（引擎自己組節點循環，不走 bank.loop） ──
  'score.bed': { files: [f('score_bed')], maps: TR, gain: 1, bus: 'score', loopStart: 0.1, loopEnd: 16.1 }, // 低音弦樂群鳴（E1/F1/B♭1 + 大提琴 E2 + 低音管 F2）
  'score.unease': { files: [f('score_unease')], maps: ALL, gain: 1, bus: 'score', loopStart: 0.1, loopEnd: 13.1 }, // 高把位顫弓半音簇、弓擦鈸、銅鑼刮奏
  'score.chase': { files: [f('score_chase')], maps: T, gain: 1, bus: 'score', loopStart: 0.1, loopEnd: 7.719042, bpm: 126 }, // 126 BPM 低音頓弓固定音型
  // ── 脈動與心跳 ──
  'score.pulse': { files: [f('score_pulse_1'), f('score_pulse_2')], maps: ALL, gain: 1, bus: 'score' }, // 軟槌定音鼓 + 大鼓
  'score.tick': { files: [f('score_tick_1'), f('score_tick_2')], maps: TR, gain: 1, bus: 'score' }, // col legno 般的頓弓 + 木頭聲
  'score.heart.lub': { files: [f('score_heart_lub')], maps: ALL, gain: 1, bus: 'fx' },
  'score.heart.dub': { files: [f('score_heart_dub')], maps: ALL, gain: 1, bus: 'fx' },
  // ── 爆點、預捲、它 ──
  'score.hit.big': { files: [f('score_hit_big_1'), f('score_hit_big_2'), f('score_hit_big_3')], maps: TR, gain: 1, bus: 'fx', onset: 0 }, // 弦樂群＋銅管／預置鋼琴群／往下抹的尖叫弦樂
  'score.hit.small': { files: [f('score_hit_small_1'), f('score_hit_small_2'), f('score_hit_small_3')], maps: ALL, gain: 1, bus: 'fx', onset: 0 },
  'score.riser': { files: [f('score_riser')], maps: TR, gain: 1, bus: 'fx', onsetEnd: 8.0 },
  'score.riser.rev': { files: [f('score_riser_rev')], maps: ALL, gain: 1, bus: 'fx', onsetEnd: 5.0 },
  'score.braam': { files: [f('score_braam')], maps: T, gain: 1, bus: 'fx', onset: 1.2 },
  'score.swell': { files: [f('score_swell')], maps: ALL, gain: 1, bus: 'fx' }, // 取代 _k_sub
  'score.tail': { files: [f('score_tail')], maps: ALL, gain: 1, bus: 'score' }, // 爆點後的餘韻
  // ── 主題動機 ──
  'score.qing': { files: [f('score_qing')], maps: T, gain: 1, bus: 'score' }, // 寺廟的磬：章節與重大發現
  'score.count': { files: [f('score_count')], maps: T, gain: 1, bus: 'score' }, // 點名的一聲
  'score.count6': { files: [f('score_count6')], maps: T, gain: 1, bus: 'score' }, // 不對的第六聲
  'score.mbox.72': { files: [f('score_mbox_72')], maps: T, gain: 1, bus: 'score', midi: 72 }, // 小雨的八音盒（引擎依旋律換音高）
  'score.mbox.79': { files: [f('score_mbox_79')], maps: T, gain: 1, bus: 'score', midi: 79 },
  'score.mbox.84': { files: [f('score_mbox_84')], maps: T, gain: 1, bus: 'score', midi: 84 },
  'score.mbox.91': { files: [f('score_mbox_91')], maps: T, gain: 1, bus: 'score', midi: 91 },
  'score.windup': { files: [f('score_windup')], maps: T, gain: 1, bus: 'score' },
  'score.meilan': { files: [f('score_meilan')], maps: T, gain: 1, bus: 'score' }, // 美蘭：二胡的哭腔
  'score.suona': { files: [f('score_suona')], maps: ['road'], gain: 1, bus: 'score' }, // 山路：遠處出殯的嗩吶
};
