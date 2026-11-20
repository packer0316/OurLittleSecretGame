// 錄音素材的總登記表：三組各自維護一份（避免同時修改同一個檔案），這裡合併。格式見 src/audio/bank.js。
import score from './lib/score.js';
import foley from './lib/foley.js';
import vox from './lib/vox.js';

export const LIBRARY = { ...foley, ...vox, ...score };
