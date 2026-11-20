// vox 組的錄音素材登記（格式見 src/audio/bank.js）。由 scripts/vox/build.py 產生；來源與授權記在 art-direction/audio-sources/ledger-vox.json。
// 只登記最常用、需要零延遲的三種（地圖載入時預先解碼）；其他人聲在 vox/core.bin、台詞在 vox/lines.bin，由 src/audio/modules/vox.js 用到才解碼。
export default {
  'vox.whisper': { files: ["vox/whisper_01.ogg", "vox/whisper_02.ogg", "vox/whisper_03.ogg", "vox/whisper_04.ogg", "vox/whisper_05.ogg"], maps: ['all'], gain: 1.0, bus: 'fx', rate: [0.94, 1.06], wet: 1 },
  'vox.breath': { files: ["vox/breath_01.ogg", "vox/breath_02.ogg", "vox/breath_03.ogg", "vox/breath_04.ogg"], maps: ['all'], gain: 1.0, bus: 'fx', rate: [0.95, 1.04], wet: 1 },
  'vox.gasp': { files: ["vox/gasp_01.ogg", "vox/gasp_02.ogg", "vox/gasp_03.ogg", "vox/gasp_04.ogg"], maps: ['all'], gain: 1.0, bus: 'fx', rate: [0.96, 1.05], wet: 1 },
};
