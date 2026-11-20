import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// Mechanical format conversion only. Artwork is generated with image_gen.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const book = path.join(root, 'art-direction/visual-bible-20261120');
const readJSON = p => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
const selection = readJSON(path.join(book, 'selection.json'));
const records = Array.isArray(selection) ? selection : selection.assets;
const assets = [];
for (const selected of records) {
  const source = path.join(root, selected.file);
  const sidecar = source.replace(/\.png$/, '.json');
  if (!fs.existsSync(source) || !fs.existsSync(sidecar)) {
    throw new Error(`Missing selected artwork: ${selected.id}`);
  }
  const asset = { ...selected, ...readJSON(sidecar) };
  const target = asset.runtime
    ? path.join(root, asset.runtime)
    : path.join(book, 'previews', `${asset.id}.webp`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (!fs.existsSync(target) || fs.statSync(source).mtimeMs > fs.statSync(target).mtimeMs) {
    const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', source,
      '-c:v', 'libwebp', '-quality', '88', '-compression_level', '6', target], { encoding: 'utf8' });
    if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr);
  }
  asset.preview = path.relative(book, target).replaceAll('\\', '/');
  asset.bytes = fs.statSync(target).size;
  assets.push(asset);
}
const manifest = {
  title: '說好不說｜人物、線索與圖片劇情', version: '2026-11-20',
  generator: 'OpenAI built-in image_gen',
  direction: '線索採夜晚、陰森、真實、老舊；五位朋友38～40歲；小雨7歲、完整牙齒。',
  integration: '33張線索圖與13張劇情圖已接入遊戲事件；按調查進度解鎖，可於筆記回看與放大。18張人物三視圖保留為製作參考。',
  assets,
};
fs.writeFileSync(path.join(book, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
const data = JSON.stringify(manifest).replaceAll('<', '\\u003c');
const template = fs.readFileSync(path.join(book, 'template.html'), 'utf8');
fs.writeFileSync(path.join(book, 'index.html'), template.replace('/*__ASSET_DATA__*/', data));
const runtime = assets.filter(a => a.runtime).map(({ id, name, category, runtime, chapter, trigger, caption, dialogue }) =>
  ({ id, name, category, image: runtime.replace('public/', ''), chapter, trigger, caption, dialogue }));
fs.writeFileSync(path.join(root, 'public/assets/story/visual-v2/manifest.json'), JSON.stringify(runtime, null, 2) + '\n');
console.log(JSON.stringify({ assets: assets.length, counts: Object.fromEntries(['character', 'clue', 'beat'].map(c => [c, assets.filter(a => a.category === c).length])), runtimeBytes: assets.filter(a => a.runtime).reduce((n, a) => n + a.bytes, 0) }));
