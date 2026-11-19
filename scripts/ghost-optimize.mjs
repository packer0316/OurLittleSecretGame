// 把授權來源模型整理成遊戲用的 ghost_woman.glb（ghost 小組）。
// 來源：art-direction/research-models/ghost-woman-original.glb
//   「Ghost Girl Animated」Shaban Hafizsalim，CC BY 4.0（詳見 public/assets/CREDITS.html）。
// 用法：node scripts/ghost-optimize.mjs
//   需要 @gltf-transform/cli（預設以 npx 取得；也可用環境變數 GLTF_TRANSFORM 指到已安裝的執行檔）。
// 做的事：
//   1. spec/gloss 材質改成 metal/rough（沿用原 prepare-ghost.py 的近似）。
//   2. 只保留蒙皮的身體與頭部；原作的飄髮、短洋裝、內衣、睫毛片、燈光與攝影機節點全部移除
//      （頭髮、長衣、紅繩改由 src/maps/temple/ghost.js 以程序化方式建立）。
//   3. 移除沒用到的 UV 組與切線，貼圖轉 WebP，網格簡化、量化並以 meshopt 壓縮。
// 骨架、蒙皮權重、骨骼名稱（例如 mixamorig_LeftHand_011）與行走動畫都原樣保留。
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'art-direction/research-models/ghost-woman-original.glb');
const target = process.env.GHOST_GLB_OUT || path.join(root, 'public/assets/models/ghost_woman/ghost_woman.glb');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ghost-opt-'));
const SIMPLIFY = Number(process.env.GHOST_SIMPLIFY ?? 0.8); // 保留的三角形比例
const TEX = Number(process.env.GHOST_TEX ?? 1024);

// ── 1. 直接改 glTF JSON ──
const raw = fs.readFileSync(source);
const jsonLength = raw.readUInt32LE(12);
const doc = JSON.parse(raw.subarray(20, 20 + jsonLength).toString('utf8'));
const SPEC = 'KHR_materials_pbrSpecularGlossiness';
for (const material of doc.materials) {
  const spec = material.extensions?.[SPEC];
  if (spec) {
    delete material.extensions[SPEC];
    material.pbrMetallicRoughness = {
      baseColorFactor: spec.diffuseFactor || [1, 1, 1, 1],
      baseColorTexture: spec.diffuseTexture,
      metallicFactor: 0,
      roughnessFactor: Math.max(0.65, 1 - (spec.glossinessFactor || 0)),
    };
  }
  if (material.extensions && !Object.keys(material.extensions).length) delete material.extensions;
  material.alphaMode = 'OPAQUE'; delete material.alphaCutoff;
  material.doubleSided = false;
}
for (const key of ['extensionsUsed', 'extensionsRequired']) {
  if (!doc[key]) continue;
  doc[key] = doc[key].filter((e) => e !== SPEC);
  if (!doc[key].length) delete doc[key];
}
// 保留的網格：身體（vucut）與頭（kafa）。其餘節點從父節點摘除，之後由 prune 清掉。
const KEEP_MESH = new Set(['vucut_vucut_0', 'vucut_kafa_0']);
const DROP_NODE = /^(saclar|saclar_2|elbise|CINEMA_4D_Editor|Sky|Light_1|Light|Turbulence|Gravity|vucut|Object_18)$/;
const dropped = [];
const drop = (index) => {
  const node = doc.nodes[index];
  if (DROP_NODE.test(node.name || '')) return true;
  if (node.mesh !== undefined && !KEEP_MESH.has(doc.meshes[node.mesh].name)) return true;
  return false;
};
for (const node of doc.nodes) {
  if (!node.children) continue;
  node.children = node.children.filter((c) => { if (drop(c)) { dropped.push(doc.nodes[c].name); return false; } return true; });
  if (!node.children.length) delete node.children;
}
for (const mesh of doc.meshes) for (const prim of mesh.primitives) {
  for (const attr of Object.keys(prim.attributes)) if (/^(TANGENT|TEXCOORD_[1-9]|COLOR_\d)$/.test(attr)) delete prim.attributes[attr];
}
doc.asset.copyright = 'Ghost Girl Animated by Shaban Hafizsalim / CC BY 4.0. Body and head only; hair, dress and extras removed, textures recompressed, mesh simplified for OurLittleSecretGame.';
let encoded = Buffer.from(JSON.stringify(doc), 'utf8');
if (encoded.length % 4) encoded = Buffer.concat([encoded, Buffer.alloc(4 - (encoded.length % 4), 0x20)]);
const rest = raw.subarray(20 + jsonLength);
const header = Buffer.alloc(20);
header.write('glTF', 0, 'latin1'); header.writeUInt32LE(2, 4); header.writeUInt32LE(20 + encoded.length + rest.length, 8);
header.writeUInt32LE(encoded.length, 12); header.write('JSON', 16, 'latin1');
const stage = (n) => path.join(tmp, `stage${n}.glb`);
fs.writeFileSync(stage(0), Buffer.concat([header, encoded, rest]));
console.log('移除節點：', dropped.join(', '));

// ── 2. gltf-transform 管線 ──
const cli = process.env.GLTF_TRANSFORM;
const run = (...args) => {
  if (cli) execFileSync(process.execPath, [cli, ...args], { stdio: 'inherit' });
  else execFileSync('npx', ['--yes', '@gltf-transform/cli@4', ...args], { stdio: 'inherit', shell: true });
};
let n = 0;
const step = (cmd, ...opts) => { run(cmd, stage(n), stage(n + 1), ...opts); n++; };
step('prune');
step('resize', '--width', String(TEX), '--height', String(TEX));
step('webp', '--quality', '84');
step('weld');
step('simplify', '--ratio', String(SIMPLIFY), '--error', '0.0004');
step('resample');
step('meshopt', '--level', 'medium');
fs.copyFileSync(stage(n), target);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`完成 ${path.relative(root, target)}：${(fs.statSync(target).size / 1048576).toFixed(2)} MB`);
