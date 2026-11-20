/**
 * 聲音模組的安裝點。AudioSys.init() 建好匯流排與素材庫（audio.bank）之後呼叫 installModules(audio)。
 *
 * 每個模組 export install(audio)，可以：
 *   audio.override('footstep', (orig, strength, surface) => { ...; return orig(strength, surface); })
 *       覆寫任何公開方法或 horror 的 _k_* 種類（例如 '_k_whisper'）；orig 是原本的程序化版本，可疊加或退回。
 *   audio.onUpdate((dt, s) => { ... })   每幀（地圖 update 之後）呼叫；s = { space, tension, indoor, gust, released, profile, time }
 *   audio.envHook('bell', (t, fire) => { ... })   取代 _pump 裡的偶發環境事件（wood / house / drip / rustle / dog / bell / fish / thunder），fire(t) 是原本的程序化版本
 *   audio.layerMul.wind = 0.3   調低（或關掉）某一層程序化環境聲／緊張層，讓錄音取代它：
 *       wind howl leaf room bug rain pane hum ember drone strings heartbeat
 *   audio.onMap((mapId) => { ... })      換地圖（素材已載入、地圖已建好）之後呼叫
 * 回傳的物件會掛在 audio.modules[名稱]（除錯、測試用）。
 */
import * as score from './modules/score.js';
import * as foley from './modules/foley.js';
import * as vox from './modules/vox.js';

export function installModules(audio) {
  audio.modules = {};
  for (const [name, mod] of [['foley', foley], ['vox', vox], ['score', score]]) {
    try { audio.modules[name] = mod.install(audio) || {}; } catch (err) { console.warn('[audio] 模組安裝失敗', name, err); }
  }
}
