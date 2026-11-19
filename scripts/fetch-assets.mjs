// 下載 Poly Haven (CC0) 公開素材到 public/assets
// 用法: node scripts/fetch-assets.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'assets');
const API = 'https://api.polyhaven.com';
const HEADERS = { 'User-Agent': 'threejs-asset-fetch/1.0' };

const TEXTURES = [
  'forest_ground_04', 'mossy_cobblestone', 'monastery_stone_floor',
  'worn_mossy_plasterwall', 'red_plaster_weathered', 'clay_roof_tiles_02',
  'dark_wood', 'wood_peeling_paint_weathered', 'weathered_brown_planks',
  'mossy_rock', 'mossy_stone_wall', 'velour_velvet', 'bark_brown_02',
  // 山村與住處（2026-11 場景美術）：舊柏油路、紅磚抹灰牆、鏽鐵皮、鏽鐵捲門、磨損水泥地、室內粉刷牆
  'asphalt_02', 'red_brick_plaster_patch_02', 'rusty_corrugated_iron', 'rusted_shutter',
  'concrete_floor_worn_001', 'painted_plaster_wall',
];
// 注意：pine_tree_01 (913MB)、wooden_candlestick / root_cluster_01 (20萬面以上) 太重，不使用
const MODELS = [
  'dead_tree_trunk_02', 'tree_stump_01', 'boulder_01', 'rock_moss_set_01',
  'dry_branches_medium_01', 'grass_medium_01', 'fern_02',
  'brass_candleholders', 'chinese_console_table',
  'brass_pot_01', 'wooden_lantern_01', 'ceramic_vase_03',
  'wooden_bucket_01', 'chinese_stool',
];
const HDRIS = ['satara_night_no_lamps'];

async function getJSON(url) {
  const r = await fetch(url, { headers: HEADERS });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}
async function download(url, dest) {
  try { const s = await fs.stat(dest); if (s.size > 0) return s.size; } catch {}
  await fs.mkdir(path.dirname(dest), { recursive: true });
  const r = await fetch(url, { headers: HEADERS });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  const buf = Buffer.from(await r.arrayBuffer());
  await fs.writeFile(dest, buf);
  return buf.length;
}
const mb = (n) => (n / 1048576).toFixed(2) + 'MB';

async function texture(id) {
  const f = await getJSON(`${API}/files/${id}`);
  const want = { diff: f.Diffuse, nor: f.nor_gl, arm: f.arm };
  let total = 0;
  for (const [k, entry] of Object.entries(want)) {
    const url = entry?.['1k']?.jpg?.url;
    if (!url) { console.warn(`  ! ${id} 缺少 ${k}`); continue; }
    total += await download(url, path.join(OUT, 'textures', id, `${k}.jpg`));
  }
  console.log(`tex   ${id}  ${mb(total)}`);
}
async function model(id) {
  const f = await getJSON(`${API}/files/${id}`);
  const g = f.gltf?.['1k']?.gltf;
  if (!g) { console.warn(`  ! ${id} 無 gltf`); return; }
  const dir = path.join(OUT, 'models', id);
  let total = await download(g.url, path.join(dir, `${id}.gltf`));
  for (const [rel, inc] of Object.entries(g.include || {})) {
    total += await download(inc.url, path.join(dir, rel));
  }
  console.log(`model ${id}  ${mb(total)}`);
}
async function hdri(id) {
  const f = await getJSON(`${API}/files/${id}`);
  const n = await download(f.hdri['1k'].hdr.url, path.join(OUT, 'hdri', `${id}.hdr`));
  console.log(`hdri  ${id}  ${mb(n)}`);
}

const jobs = [
  ...TEXTURES.map((id) => () => texture(id)),
  ...MODELS.map((id) => () => model(id)),
  ...HDRIS.map((id) => () => hdri(id)),
];
let failed = 0;
for (const job of jobs) {
  try { await job(); } catch (e) { failed++; console.error('  FAIL', e.message); }
}
console.log(failed ? `完成，但有 ${failed} 個失敗` : '全部完成');
