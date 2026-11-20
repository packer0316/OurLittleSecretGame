// 把三組聲音的來源紀錄（art-direction/audio-sources/ledger-*.json）寫進 public/assets/CREDITS.html 的「聲音與配樂」一節。
// 用法：node scripts/audio-credits.mjs [--check]
//   ledger 格式：[{ file, sources: [{ title, author, license, url }], notes }]（或 { entries: [...] }）
//   --check：只檢查（每個 public/assets/audio 的成品都有紀錄、授權都在允許清單內、紀錄裡的檔案都存在），不寫檔
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const LEDGER_DIR = path.join(ROOT, 'art-direction/audio-sources');
const AUDIO_DIR = path.join(ROOT, 'public/assets/audio');
const CREDITS = path.join(ROOT, 'public/assets/CREDITS.html');
const check = process.argv.includes('--check');

const LICENSES = [
  [/^cc0|public domain|creative commons 0/i, 'CC0', 'https://creativecommons.org/publicdomain/zero/1.0/'],
  [/by[ -]?4|attribution 4/i, 'CC BY 4.0', 'https://creativecommons.org/licenses/by/4.0/'],
  [/by[ -]?3|attribution 3/i, 'CC BY 3.0', 'https://creativecommons.org/licenses/by/3.0/'],
  [/original|self|本專案|synth|tts|generated/i, '本專案製作', null],
];
const BANNED = /\bnc\b|non-?commercial|\bsa\b|share-?alike|sampling/i;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const entries = [];
for (const f of fs.existsSync(LEDGER_DIR) ? fs.readdirSync(LEDGER_DIR) : []) {
  if (!/^ledger-.*\.json$/.test(f)) continue;
  const group = f.replace(/^ledger-|\.json$/g, '');
  let raw = JSON.parse(fs.readFileSync(path.join(LEDGER_DIR, f), 'utf8'));
  if (!Array.isArray(raw)) raw = raw.entries || raw.files || Object.values(raw);
  for (const e of raw) entries.push({ ...e, group });
}

const problems = [];
const files = [];
(function walk(d) { if (!fs.existsSync(d)) return; for (const n of fs.readdirSync(d)) { const p = path.join(d, n); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.(ogg|mp3|wav|m4a|opus|webm|bin)$/i.test(n)) files.push(path.relative(AUDIO_DIR, p).replace(/\\/g, '/')); } })(AUDIO_DIR);
// 人聲組把多個素材打包成 .bin（ledger 以「檔名#素材名」記錄包內的每一段）
const norm = (s) => String(s || '').replace(/^.*assets\/audio\//, '').replace(/#.*$/, '');
const recorded = new Set(entries.map((e) => norm(e.file)));
for (const f of files) if (!recorded.has(f)) problems.push(`沒有來源紀錄：${f}`);
for (const e of entries) {
  const f = norm(e.file);
  if (!files.includes(f)) problems.push(`紀錄裡的檔案不存在：${f}（${e.group}）`);
  for (const s of e.sources || []) {
    if (BANNED.test(s.license || '')) problems.push(`不允許的授權 ${s.license}：${f}`);
    if (!LICENSES.some(([re]) => re.test(s.license || ''))) problems.push(`無法辨識的授權「${s.license}」：${f}`);
  }
}

// 依來源彙整（同一個外部聲音可能用在好幾個成品裡）
const bySource = new Map();
for (const e of entries) for (const s of e.sources || []) {
  const lic = LICENSES.find(([re]) => re.test(s.license || ''));
  if (!lic || lic[1] === '本專案製作') continue;
  if (/VSCO-2-CE/i.test(`${s.url} ${s.title}`)) continue; // VSCO 的單音取樣在下方統一說明
  const key = s.url || `${s.title}|${s.author}`;
  if (!bySource.has(key)) bySource.set(key, { ...s, lic, groups: new Set(), files: [] });
  const r = bySource.get(key); r.groups.add(e.group); r.files.push(String(e.file).split('/').pop());
}
const GROUP_NAME = { score: '配樂', foley: '環境與擬音', vox: '人聲' };
const list = [...bySource.values()].sort((a, b) => (a.lic[1] === b.lic[1] ? String(a.author).localeCompare(String(b.author)) : a.lic[1] === 'CC0' ? 1 : -1));
const html = `<!-- audio-credits:start -->
<h2>聲音與配樂</h2>
<p>本版的聲音由錄音素材與 Web Audio 程序合成混合而成：環境、擬音、人聲與驚嚇音效、以及跟著恐怖節奏變化的動態配樂。所有錄音都經過剪輯、混音、變調、殘響等處理，原作者未為本作背書。下列為使用到的外部錄音（共 ${list.length} 項，CC BY 優先列出；CC0 素材不要求署名，仍列出以示感謝）。</p>
<ul>
${list.map((s) => `<li><strong>${esc(s.title)}</strong> — ${esc(s.author || '佚名')}。${s.url ? `<a href="${esc(s.url)}">原始聲音</a> · ` : ''}${s.lic[2] ? `<a href="${s.lic[2]}">${s.lic[1]}</a>` : s.lic[1]}。用於${[...s.groups].map((g) => GROUP_NAME[g] || g).join('、')}。</li>`).join('\n')}
</ul>
<p>管弦樂取樣來自 <a href="https://github.com/sgossner/VSCO-2-CE">Versilian Studios VSCO 2 Community Edition</a>（<a href="https://creativecommons.org/publicdomain/zero/1.0/">CC0</a>），本專案以其單音取樣離線製作群鳴、滑音、漸強與爆點。${entries.some((e) => /tts|語音合成|Hanhan|Yating|Zhiwei/i.test(JSON.stringify(e))) ? '部分台詞的原料以 Windows 內建的中文語音合成產生，再經大幅處理成角色聲音。' : ''}每個成品的完整來源紀錄保存在專案的 art-direction/audio-sources/。</p>
<!-- audio-credits:end -->`;

console.log(`${entries.length} 筆紀錄、${files.length} 個成品、${list.length} 個外部來源`);
if (problems.length) { console.log('問題：\n  ' + problems.join('\n  ')); }
if (check) { process.exitCode = problems.length ? 1 : 0; }
else {
  let c = fs.readFileSync(CREDITS, 'utf8');
  const re = /<!-- audio-credits:start -->[\s\S]*?<!-- audio-credits:end -->/;
  if (re.test(c)) c = c.replace(re, html);
  else c = c.replace('<h2>引擎</h2>', html + '\n<h2>引擎</h2>');
  c = c.replace('<p>環境聲、腳步、鐘聲、木魚、呼吸與事件音效使用 Web Audio 合成。本版以字幕演出對話，尚未錄製人物配音。</p>', '<p>本版以字幕演出對話，尚未錄製真人人物配音。</p>');
  fs.writeFileSync(CREDITS, c);
  console.log('已寫入', path.relative(ROOT, CREDITS));
}
