// vox 組（人聲與驚嚇）的驗證。聽不到聲音，所以每一種人聲都離線渲染出來量，並輸出試聽 WAV 到 artifacts/audio/vox/。
// 用法：node scripts/audio-vox.mjs            （需要 5178 的開發伺服器；GAME_ORIGIN 可覆寫）
//   1. 素材：素材庫的 vox.whisper / breath / gasp 已解碼、vox/core 與 vox/lines 素材包載入、沒有失敗的檔案
//   2. 每個 horror 人聲種類（錄音版）：不是無聲、峰值 < −0.5 dBFS、響度在範圍內；和程序化版本的響度差（校正 GAIN 用）
//   3. 每個角色的幾句台詞（finaleAudio.speak / synth.speak 走錄音），以及和共振峰合成版本的響度差
//   4. HRTF：背後的貼耳耳語，左右與前後確實不同
//   5. 台詞錄音覆蓋率：原始碼裡每一句 speak 的拼音（與聲音）都有對應的錄音
//   6. 預算：建置輸出大小、已解碼記憶體（素材庫 + LRU 上限）
//   7. 真實遊戲頁面（?auto&map=temple）：素材包載入、播幾種人聲與台詞，沒有頁面錯誤
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const ORIGIN = process.env.GAME_ORIGIN || 'http://127.0.0.1:5178';
const OUT = 'artifacts/audio/vox';
fs.mkdirSync(OUT, { recursive: true });
const failures = [], notes = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); return ok; };
const dB = (x) => (x > 0 ? +(20 * Math.log10(x)).toFixed(1) : -99);

// ───────────────────────── 5. 覆蓋率（Node 端，讀原始碼） ─────────────────────────
const LINES = JSON.parse(fs.readFileSync('scripts/vox/lines.json', 'utf8')).lines;
const keys = new Set(LINES.map((l) => l.k));
const pinyinCovered = new Set(LINES.map((l) => l.k.split('|').pop()));
const NONVERBAL = new Set(['he5', 'xu1', 'hi1 hi1 hi4 hi1 hi5']); // 屏息的吸氣、噓、竊笑：改用真人錄音（inhale / shush / giggle）
const PY = /'([a-z]+[0-5](?: [a-z]+[0-5])*)'/g;
const srcFiles = ['src/story/finale.js', ...fs.readdirSync('src/horror/setpieces').filter((f) => f.endsWith('.js') && f !== 'synth.js').map((f) => 'src/horror/setpieces/' + f)];
const found = new Map();
for (const f of srcFiles) { const s = fs.readFileSync(f, 'utf8'); for (const m of s.matchAll(PY)) { if (/\bid:\s*$/.test(s.slice(Math.max(0, m.index - 8), m.index))) continue; found.set(m[1], f); } } // 跳過 id: 'echo1' 這類識別碼
const missingPy = [...found.keys()].filter((p) => !pinyinCovered.has(p) && !NONVERBAL.has(p));
// 結局：同一個呼叫裡「拼音, 聲音」的配對要完全對上
const fin = fs.readFileSync('src/story/finale.js', 'utf8');
const pairs = new Set();
for (const m of fin.matchAll(/'([a-z]+[0-5](?: [a-z]+[0-5])*)',\s*'(\w+)'/g)) pairs.add(`f|${m[2]}|${m[1]}`);
// 動態組出來的配對（點名的數字與「有」、三個人一起喊、兩個臨時聲音物件、預設的 scream）
for (const v of ['selfChild', 'ahzhe', 'zhihao', 'bohan', 'peishanChild']) pairs.add(`f|${v}|you3`);
for (const n of ['yi1', 'er4', 'san1', 'si4', 'wu3']) pairs.add(`f|guo|${n}`);
for (const v of ['ahzhe', 'zhihao', 'bohan']) pairs.add(`f|${v}|yi3 an1`);
pairs.add('f|ahzheHoarse|yi3 an1'); pairs.add('f|ahzheWeak|xiao3 yu3'); pairs.add('f|meilan|xiao3 yu3');
const missingPairs = [...pairs].filter((k) => !keys.has(k));
const coverage = { pinyin: { total: found.size, covered: found.size - missingPy.length, missing: missingPy }, finalePairs: { total: pairs.size, covered: pairs.size - missingPairs.length, missing: missingPairs } };
check(!missingPy.length, `台詞拼音沒有錄音：${missingPy.join(' / ')}`);
check(!missingPairs.length, `結局（拼音, 聲音）沒有錄音：${missingPairs.join(' / ')}`);

// ───────────────────────── 6. 建置輸出大小 ─────────────────────────
const voxDir = 'public/assets/audio/vox';
let outBytes = 0; const outFiles = {};
for (const f of fs.readdirSync(voxDir)) { const n = fs.statSync(path.join(voxDir, f)).size; outBytes += n; outFiles[f] = n; }
const sfxDir = 'public/assets/audio/sfx'; if (fs.existsSync(sfxDir)) for (const f of fs.readdirSync(sfxDir)) outBytes += fs.statSync(path.join(sfxDir, f)).size;
check(outBytes <= 8 * 1048576, `vox 建置輸出 ${(outBytes / 1048576).toFixed(2)} MB > 8 MB`);
const ledger = JSON.parse(fs.readFileSync('art-direction/audio-sources/ledger-vox.json', 'utf8'));
const okLic = (l) => /^(CC0 1\.0|CC BY [34]\.0)$/.test(l) || /Windows 內建 TTS/.test(l);
const badLic = ledger.flatMap((e) => e.sources.filter((s) => !okLic(s.license)).map((s) => `${e.file}: ${s.license}`));
check(!badLic.length, `授權不符：${badLic.join(' / ')}`);

// ───────────────────────── 瀏覽器 ─────────────────────────
const browser = await chromium.launch({ channel: process.env.BROWSER || 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && /vox|audio/i.test(m.text()))) errors.push(`[console.${m.type()}] ${m.text()}`); });
await page.goto(ORIGIN + '/');
await page.waitForFunction(() => !!window.__game, null, { timeout: 120000 });

const HORROR = ['whisper', 'breath', 'gasp', 'sob', 'hum', 'childLaugh', 'giggle', 'childCry', 'scream', 'shriek', 'moan', 'counting', 'whisperCloud', 'itBreath', 'shush'];
const LINE_CASES = [
  // [名稱, 呼叫]（f = createFinaleAudio，s = createSynth）
  ['self', "f.speak('lin2 xiao3 yu3 wo3 ji4 de5 ni3', 'self')", ['f|self|lin2 xiao3 yu3 wo3 ji4 de5 ni3']],
  ['self-quiet', "f.speak('hai2 you3 yi2 ge4 ta1 jiao4 lin2 xiao3 yu3', 'self', { dist: 0.5, hrtf: false })", ['f|self|hai2 you3 yi2 ge4 ta1 jiao4 lin2 xiao3 yu3']],
  ['mother-behind', "f.speak('yi3 an1', 'mother', { pan: 0.55, dist: 0.35, behind: true, near: 0.7, gain: 1.1 })", ['f|mother|yi3 an1']],
  ['ahzhe-behind', "f.speak('yi3 an1 ni3 hui2 tou2 kan4 yi2 xia4', 'ahzhe', { pan: -0.55, dist: 0.35, behind: true, near: 0.7, gain: 1.1 })", ['f|ahzhe|yi3 an1 ni3 hui2 tou2 kan4 yi2 xia4']],
  ['peishan-behind', "f.speak('yi3 an1 shi4 wo3 ni3 zhuan3 guo4 lai2', 'peishan', { pan: 0.55, dist: 0.35, behind: true, near: 0.7, gain: 1.1 })", ['f|peishan|yi3 an1 shi4 wo3 ni3 zhuan3 guo4 lai2']],
  ['it-choir', "f.speak('yi3 an1 yi3 an1 a1 an1', 'it', { pan: -0.55, dist: 0.35, behind: true, near: 0.7, gain: 1.1 })", ['f|it|yi3 an1 yi3 an1 a1 an1']],
  ['it-huitoule', "f.speak('ni3 hui2 tou2 le0', 'it', { dist: 0.3, behind: true })", ['f|it|ni3 hui2 tou2 le0']],
  ['it-door', "f.speak('dou1 chu1 lai2 le0', 'it', { pan: 0.2, dist: 3, wet: 1.6, gain: 0.55 })", ['f|it|dou1 chu1 lai2 le0']],
  ['it-scream', "f.speak('ying4 wo3', 'it', { pan: 0.3, dist: 2.2, scream: 1 })", ['f|it|ying4 wo3']],
  ['tape-liu', "f.speak('liu4', 'guo', { pan: 0.1, dist: 3, wet: 1.6, speed: 0.6 })", ['f|guo|liu4']],
  ['tape-qiao', "f.speak('dao4 le0 jiu4 qiao1 san1 xia4', 'guo', { pan: 0.4, dist: 4, wet: 1.6 })", ['f|guo|dao4 le0 jiu4 qiao1 san1 xia4']],
  ['seat-bohan', "f.speak('han3 yi4 sheng1 jiu4 hao3 le0 gen1 na4 shi2 hou4 yi2 yang4', 'bohan', { pan: -0.6, dist: 1.6, wet: 1.3 })", ['f|bohan|han3 yi4 sheng1 jiu4 hao3 le0 gen1 na4 shi2 hou4 yi2 yang4']],
  ['door-zhihao', "f.speak('yi3 an1 kai1 men2 men2 da3 bu4 kai1', 'zhihao', { pan: 0, dist: 2.4, wet: 1.6 })", ['f|zhihao|yi3 an1 kai1 men2 men2 da3 bu4 kai1']],
  ['child-door', "f.speak('ma1 ma1 wo3 hai2 zai4', 'child', { pan: 0.1, dist: 1.2, lp: 1800 })", ['f|child|ma1 ma1 wo3 hai2 zai4']],
  ['child-far', "f.speak('you3', 'childFar', { dist: 6, gain: 0.9, wet: 1.6 })", ['f|childFar|you3']],
  ['meilan-scream', "f.scream('xiao3 yu3', { pan: 0.3, dist: 6 })", ['f|meilan|xiao3 yu3']],
  ['meilan-true', "f.speak('ma1 ma1 ting1 dao4 le0', 'meilanTrue', { pan: 0.2, dist: 1.6, speed: 1.3 })", ['f|meilanTrue|ma1 ma1 ting1 dao4 le0']],
  ['rescuer-far', "f.speak('you3 ren2 ma5', 'rescuer', { pan: 0, dist: 30, wet: 2.5 })", ['f|rescuer|you3 ren2 ma5']],
  ['radio', "f.speak('ta1 shuo1 dou1 chu1 lai2 le0 shou1 dui4', 'phone', { pan: -0.4, dist: 2.5, gain: 0.7 })", ['f|phone|ta1 shuo1 dou1 chu1 lai2 le0 shou1 dui4']],
  ['phone-it', "f.speak('ni3 que4 ding4 chu1 lai2 de5 shi4 ni3 ma5', 'phone', { dist: 0.2, hrtf: false })", ['f|phone|ni3 que4 ding4 chu1 lai2 de5 shi4 ni3 ma5']],
  ['hoarse', "f.speak('yi3 an1', { f0: 104, fs: 0.98, voiced: 0.4, breath: 0.8, rate: 0.8 }, { pan: 0, dist: 3.2, gain: 0.8 })", ['f|ahzheHoarse|yi3 an1']],
  ['s-child-behind', "s.speak('zhao3 dao4 ni3 le5', { who: 'child', whisper: true, hrtf: true, behind: true, dist: 0.35, pan: 0.05, gain: 1.25 })", ['s|child|w|zhao3 dao4 ni3 le5']],
  ['s-kids-haole', "s.speak('hao3 le5', { who: 'child', pan: -0.5, dist: 6, gain: 1, pitch: 0.92 }), s.speak('hao3 le5', { who: 'child', pan: 0.6, dist: 8, gain: 1, pitch: 1.07, delay: 0.7 })", ['s|child|v|hao3 le5']],
  ['s-kid-drum', "s.speak('xie2 wo3 cang2 zai4 gu3 li3 la5 rang4 ta1 zhao3 jiu3 yi4 dian3', { who: 'child', pan: -0.3, dist: 2.5, gain: 1.1, pitch: 0.98 })", ['s|child|v|xie2 wo3 cang2 zai4 gu3 li3 la5 rang4 ta1 zhao3 jiu3 yi4 dian3']],
  ['s-woman-call', "s.speak('xiao3 yu3 ni3 zai4 na3 li3', { who: 'woman', pan: 0.4, dist: 9, gain: 1.2, hold: 0.25, wet: 1.5 })", ['s|woman|v|xiao3 yu3 ni3 zai4 na3 li3']],
  ['s-woman-whisper', "s.speak('wo3 zhi1 dao4 ni3 zai4 li3 mian4', { who: 'woman', pan: -0.3, dist: 1.0, gain: 1.1, whisper: true })", ['s|woman|w|wo3 zhi1 dao4 ni3 zai4 li3 mian4']],
  ['s-echo-cloth', "s.speak('you3', { who: 'man', muffle: true, pan: 0.2, dist: 3, gain: 1.3, pitch: 0.95 })", ['s|man|v|you3']],
  ['s-giggle', 's.giggle({ pan: 0.4, dist: 4, muffle: true })', ['giggle']],
];

const res = await page.evaluate(async ({ HORROR, LINE_CASES }) => {
  const { AudioSys } = await import('/src/core/AudioSys.js');
  const { createFinaleAudio } = await import('/src/story/finaleAudio.js');
  const { createSynth } = await import('/src/horror/setpieces/synth.js');
  const SR = 48000;
  const wavB64 = (buf) => {
    const L = buf.getChannelData(0), R = buf.getChannelData(1), n = L.length, data = new DataView(new ArrayBuffer(44 + n * 4));
    const w = (o, s) => { for (let i = 0; i < s.length; i++) data.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); data.setUint32(4, 36 + n * 4, true); w(8, 'WAVE'); w(12, 'fmt '); data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 2, true);
    data.setUint32(24, SR, true); data.setUint32(28, SR * 4, true); data.setUint16(32, 4, true); data.setUint16(34, 16, true); w(36, 'data'); data.setUint32(40, n * 4, true);
    for (let i = 0; i < n; i++) { data.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true); data.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true); }
    const bytes = new Uint8Array(data.buffer); let bin = ''; for (let i = 0; i < bytes.length; i += 32768) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768));
    return btoa(bin);
  };
  const measure = (buf) => {
    const L = buf.getChannelData(0), R = buf.getChannelData(1), n = L.length;
    let peak = 0, el = 0, er = 0, dl = 0, dr = 0;
    for (let i = 1; i < n; i++) { const m = Math.max(Math.abs(L[i]), Math.abs(R[i])); if (m > peak) peak = m; el += L[i] * L[i]; er += R[i] * R[i]; dl += (L[i] - L[i - 1]) ** 2; dr += (R[i] - R[i - 1]) ** 2; }
    const win = Math.floor(SR * 0.4), hop = Math.floor(SR * 0.1), blocks = [];
    for (let s = 0; s + win <= n; s += hop) { let e = 0; for (let i = s; i < s + win; i++) e += (L[i] * L[i] + R[i] * R[i]) / 2; blocks.push(e / win); }
    const g = blocks.filter((e) => e > 1e-7);
    const loud = g.length ? 10 * Math.log10(g.reduce((x, y) => x + y, 0) / g.length) : -99;
    const stMax = blocks.length ? 10 * Math.log10(Math.max(...blocks) + 1e-12) : -99;
    return { peak, loud: +loud.toFixed(1), stMax: +stMax.toFixed(1), lr: +(10 * Math.log10((el + 1e-12) / (er + 1e-12))).toFixed(1), hf: +((dl + dr) / (el + er + 1e-12)).toFixed(4) };
  };
  /** 一次渲染：recorded = true 時預載素材（素材庫 + vox 素材包，並把需要的素材解碼完） */
  async function render(code, seconds, recorded, decodeKeys, wav) {
    const ctx = new OfflineAudioContext(2, Math.ceil(SR * seconds), SR);
    const a = new AudioSys(); a.init(ctx); a.start();
    a.master.gain.cancelScheduledValues(0); a.master.gain.value = 0.8; a._setSpace('hall');
    let st = null;
    if (recorded) { await a.bank.preload('temple'); a.mapReady('temple'); st = await a.vox.ready(decodeKeys || true); }
    const f = createFinaleAudio({ audio: a }), s = createSynth({ audio: a });
    let ret = null;
    ctx.suspend(0.1).then(() => { try { ret = new Function('a', 'f', 's', 'return (' + code + ')')(a, f, s); } catch (e) { ret = 'ERR ' + e.message; } ctx.resume(); });
    const buf = await ctx.startRendering();
    const m = measure(buf);
    return { ...m, ret: typeof ret === 'number' ? +ret.toFixed(2) : ret, wav: wav ? wavB64(buf) : null, st, voices: a._voices.size };
  }
  const out = { horror: {}, lines: {}, hrtf: {}, assets: {} };
  // 1. 素材
  {
    const ctx = new OfflineAudioContext(2, SR, SR);
    const a = new AudioSys(); a.init(ctx); a.start();
    const bs = await a.bank.preload('temple'); a.mapReady('temple');
    const vs = await a.vox.ready(false);
    let voxBytes = 0, voxFiles = 0;
    for (const id of ['vox.whisper', 'vox.breath', 'vox.gasp']) { const e = a.bank.library[id]; for (let i = 0; i < (e?.files.length || 0); i++) { const b = a.bank.buffer(id, i); if (b) { voxBytes += b.length * b.numberOfChannels * 4; voxFiles++; } } }
    out.assets = { bank: bs, voxBankMB: +(voxBytes / 1048576).toFixed(2), voxBankFiles: voxFiles, has: { whisper: a.bank.has('vox.whisper'), breath: a.bank.has('vox.breath'), gasp: a.bank.has('vox.gasp') }, vox: vs, keys: a.vox.keys() };
    // 全部解碼一次：確認每個 take 都解得開（之後由 LRU 收回）
    const all = await a.vox.ready(true);
    out.assets.decodeAll = all;
  }
  // 2. horror 人聲
  for (const k of HORROR) {
    const dist = { sob: 8, hum: 9, childLaugh: 6, childCry: 6, scream: 5, moan: 4 }[k] ?? 0.8;
    const code = `a.horror('${k}', { pan: 0.5, dist: ${dist}, intensity: 1 })`;
    const len = { hum: 12, counting: 9, whisperCloud: 8, sob: 7 }[k] || 5;
    const rec = await render(code, len, true, [k, k === 'hum' ? 'childHum' : k, 'phoneBreath'], true);
    const proc = await render(code, len, false, null, false);
    out.horror[k] = { rec, proc };
  }
  out.horror.childLaughFar = { rec: await render("a.horror('childLaugh', { pan: -0.6, dist: 16 })", 5, true, ['childLaughFar'], true) };
  out.horror.breathCue = { rec: await render('a.breathCue()', 4, true, ['phoneBreath'], true), proc: await render('a.breathCue()', 4, false, null, false) };
  out.horror.motherHum = { rec: await render('f.hum({ dist: 1.8 })', 12, true, ['motherHum'], true), proc: await render('f.hum({ dist: 1.8 })', 12, false, null, false) };
  out.horror.cough = { rec: await render('f.cough(110, 0, 4, 3)', 6, true, ['cough'], true), proc: await render('f.cough(110, 0, 4, 3)', 6, false, null, false) };
  out.horror.finaleShriek = { rec: await render('f.shriek({ dist: 0.5 })', 4, true, ['shriek'], true), proc: await render('f.shriek({ dist: 0.5 })', 4, false, null, false) };
  // 3. 台詞
  for (const [name, code, keys] of LINE_CASES) {
    const rec = await render(code, 7, true, keys, true);
    const proc = await render(code, 7, false, null, false);
    out.lines[name] = { rec, proc };
  }
  // 4. HRTF：背後右側的貼耳耳語、正前方的耳語、背後正中
  out.hrtf.ok = (() => { const c = new OfflineAudioContext(2, 128, SR); return typeof c.createPanner === 'function'; })();
  const wcode = (pan, behind) => `a.bank.play('vox.whisper', { variant: 0, pan: ${pan}, dist: 0.3, gain: 1, wet: 0.35, hrtf: true, behind: ${behind}, near: 0.75 })`;
  out.hrtf.behindRight = await render(wcode(0.7, true), 4, true, [], true);
  out.hrtf.front = await render(wcode(0, false), 4, true, [], true);
  out.hrtf.behind = await render(wcode(0, true), 4, true, [], true);
  return out;
}, { HORROR, LINE_CASES });

// ───────────────────────── 斷言、輸出 ─────────────────────────
const A = res.assets;
check(A.has.whisper && A.has.breath && A.has.gasp, `素材庫的 vox.* 沒有載入：${JSON.stringify(A.has)}`);
check(!A.bank.failed?.length, `素材庫有失敗的檔案：${A.bank.failed}`);
check(A.vox.packs.core === 'ready' && A.vox.packs.lines === 'ready', `vox 素材包沒有載入：${JSON.stringify(A.vox.packs)}`);
check(A.decodeAll.failed === 0 && A.decodeAll.lines.takes > 0 && A.decodeAll.core.takes > 0, `有素材解不開：${JSON.stringify(A.decodeAll)}`);
const worstMB = A.voxBankMB + A.vox.capMB;
check(worstMB <= 15, `已解碼記憶體上限 ${worstMB.toFixed(1)} MB > 15 MB`);

const rows = [];
const W = (name, r) => { if (r?.wav) fs.writeFileSync(`${OUT}/${name}.wav`, Buffer.from(r.wav, 'base64')); };
for (const [k, { rec, proc }] of Object.entries(res.horror)) {
  W('horror-' + k, rec);
  const pk = dB(rec.peak);
  check(rec.loud > -52, `horror ${k}：錄音版幾乎無聲（${rec.loud} dB）`);
  check(pk < -0.5, `horror ${k}：峰值 ${pk} dBFS`);
  check(rec.stMax < -6, `horror ${k}：短期響度太大（${rec.stMax} dB）`);
  rows.push({ kind: 'horror', name: k, peak: pk, loud: rec.loud, stMax: rec.stMax, proc: proc ? proc.loud : null, diff: proc ? +(rec.loud - proc.loud).toFixed(1) : null });
}
for (const [k, { rec, proc }] of Object.entries(res.lines)) {
  W('line-' + k, rec);
  const pk = dB(rec.peak);
  check(typeof rec.ret === 'number' && rec.ret > 0, `台詞 ${k}：speak 沒有回傳長度（${rec.ret}）`);
  check(rec.loud > -52, `台詞 ${k}：幾乎無聲（${rec.loud} dB）`);
  check(pk < -0.5, `台詞 ${k}：峰值 ${pk} dBFS`);
  rows.push({ kind: 'line', name: k, peak: pk, loud: rec.loud, stMax: rec.stMax, proc: proc.loud, diff: +(rec.loud - proc.loud).toFixed(1), dur: rec.ret, procDur: proc.ret });
}
const H = res.hrtf;
W('hrtf-whisper-behind-right', H.behindRight); W('hrtf-whisper-front', H.front); W('hrtf-whisper-behind', H.behind);
check(H.ok, 'OfflineAudioContext 沒有 PannerNode（HRTF）');
check(H.behindRight.lr < -3, `背後右側的耳語左右差不夠（L−R ${H.behindRight.lr} dB）`);
check(Math.abs(H.behind.hf - H.front.hf) / H.front.hf > 0.02 || Math.abs(H.behind.loud - H.front.loud) > 0.3, `HRTF 前後沒有差別（hf ${H.front.hf} / ${H.behind.hf}）`);
check(!errors.length, `頁面錯誤：${errors.slice(0, 5).join(' | ')}`);

// ───────────────────────── 7. 真實遊戲頁面 ─────────────────────────
const page2 = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors2 = [];
page2.on('pageerror', (e) => errors2.push(`[pageerror] ${e.message}`));
page2.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && /vox|\[audio\]/i.test(m.text()))) errors2.push(`[console.${m.type()}] ${m.text()}`); });
const t0 = Date.now();
await page2.goto(ORIGIN + '/?auto&map=temple');
let live = null;
try {
  await page2.waitForFunction(() => window.__game?.audio?.vox?.stats?.().packs?.lines === 'ready', null, { timeout: 120000 });
  live = await page2.evaluate(async () => {
    const g = window.__game, a = g.audio;
    const wasRunning = a.running; if (!a.running) a.start(); // 無頭瀏覽器裡遊戲可能停在暫停畫面：這裡只驗證素材與播放路徑
    const { createFinaleAudio } = await import('/src/story/finaleAudio.js');
    const f = createFinaleAudio(g);
    const played = {};
    for (const k of ['whisper', 'breath', 'gasp', 'childLaugh', 'giggle', 'sob', 'hum', 'scream', 'shriek', 'counting']) played[k] = a.horror(k, { pan: 0.3, dist: 3, intensity: 0.4 });
    played.line = f.speak('yi3 an1 ni3 hui2 tou2 kan4 yi2 xia4', 'ahzhe', { dist: 0.4, behind: true, gain: 0.3 });
    played.lineS = a.vox.speakS('hao3 le5', { who: 'child', dist: 6, gain: 0.3, pitch: 1.07 });
    await new Promise((r) => setTimeout(r, 1500));
    return { state: a.ctx?.state, wasRunning, vox: a.vox.stats(), bank: a.bank.stats(), played, debug: a.debug() };
  });
} catch (e) { errors2.push('等待 vox 素材包逾時：' + e.message); }
const liveMs = Date.now() - t0;
check(!!live, '真實遊戲頁面：vox 素材包沒有載入');
if (live) {
  check(live.vox.packs.core === 'ready', '真實遊戲頁面：core 素材包沒有載入');
  check(live.played.line > 0, '真實遊戲頁面：結局台詞沒有走錄音');
  check(live.played.lineS > 0, '真實遊戲頁面：寺內台詞沒有走錄音');
  check(live.vox.decodedMB <= live.vox.capMB, `真實遊戲頁面：vox 已解碼 ${live.vox.decodedMB} MB 超過上限`);
}
check(!errors2.length, `真實遊戲頁面錯誤：${errors2.slice(0, 5).join(' | ')}`);
await browser.close();

// ───────────────────────── 報告 ─────────────────────────
const report = {
  ok: !failures.length, failures, notes,
  coverage, budget: { buildMB: +(outBytes / 1048576).toFixed(2), files: outFiles, voxBankDecodedMB: A.voxBankMB, voxLruCapMB: A.vox.capMB, worstDecodedMB: +worstMB.toFixed(2), compressedInMemoryMB: A.vox.compressedMB, bankTempleMB: A.bank.mb },
  live: live && { state: live.state, vox: live.vox, bankMb: live.bank.mb, played: live.played, loadMs: liveMs },
  rows, hrtf: { lrBehindRight: H.behindRight.lr, hfFront: H.front.hf, hfBehind: H.behind.hf, loudFront: H.front.loud, loudBehind: H.behind.loud },
};
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));
for (const r of rows) console.log(`${r.kind.padEnd(6)} ${r.name.padEnd(16)} peak ${String(r.peak).padStart(6)}  loud ${String(r.loud).padStart(6)}  stMax ${String(r.stMax).padStart(6)}  proc ${String(r.proc).padStart(6)}  Δ ${String(r.diff).padStart(5)}${r.dur ? `  dur ${r.dur}s (formant ${r.procDur}s)` : ''}`);
console.log('coverage', JSON.stringify({ pinyin: `${coverage.pinyin.covered}/${coverage.pinyin.total}`, finalePairs: `${coverage.finalePairs.covered}/${coverage.finalePairs.total}` }));
console.log('budget', JSON.stringify({ ...report.budget, files: undefined }));
console.log('hrtf', JSON.stringify(report.hrtf));
if (live) console.log('live', JSON.stringify({ state: live.state, wasRunning: live.wasRunning, vox: live.vox, bankMb: live.bank.mb, played: live.played }));
console.log(failures.length ? 'FAIL\n  ' + failures.join('\n  ') : 'PASS');
if (failures.length) process.exitCode = 1;
