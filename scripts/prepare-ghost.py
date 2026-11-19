"""Adapt the licensed source GLB to Three's metal/roughness workflow.

Keeps geometry, skeleton, original embedded images and animation intact.
The approximation uses original diffuse/normal maps and uniform roughness;
the old specular/glossiness texture is intentionally not a roughness map.
Source attribution and change description: public/assets/CREDITS.html.
"""
import json
import pathlib
import struct
import sys

# 2026-11-19：遊戲用的 ghost_woman.glb 改由 scripts/ghost-optimize.mjs 產生
# （同一個來源檔，另外移除原作的頭髮與洋裝、轉 WebP、簡化並以 meshopt 壓縮）。
# 這支舊腳本會把未壓縮的 16 MB 版本寫回同一個位置，所以預設不執行；確定要舊版請加 --legacy。
if '--legacy' not in sys.argv:
    sys.exit('請改用 node scripts/ghost-optimize.mjs（要產生舊版未壓縮模型請加 --legacy）')

root = pathlib.Path(__file__).resolve().parents[1]
target = root / 'public/assets/models/ghost_woman/ghost_woman.glb'
source = root / 'art-direction/research-models/ghost-woman-original.glb'
source.parent.mkdir(parents=True, exist_ok=True)
if not source.exists():
    source.write_bytes(target.read_bytes())
raw = source.read_bytes()
length = struct.unpack_from('<I', raw, 12)[0]
doc = json.loads(raw[20:20 + length])
ext = 'KHR_materials_pbrSpecularGlossiness'
for material in doc['materials']:
    spec = material.get('extensions', {}).pop(ext, None)
    if spec:
        material['pbrMetallicRoughness'] = {
            'baseColorFactor': spec.get('diffuseFactor', [1, 1, 1, 1]),
            'baseColorTexture': spec['diffuseTexture'],
            'metallicFactor': 0,
            'roughnessFactor': max(.65, 1 - spec.get('glossinessFactor', 0)),
        }
    if not material.get('extensions'):
        material.pop('extensions', None)
    if material.get('alphaMode') == 'BLEND':
        material.update(alphaMode='MASK', alphaCutoff=.38)
for key in ['extensionsUsed', 'extensionsRequired']:
    doc[key] = [e for e in doc.get(key, []) if e != ext]
    if not doc[key]:
        del doc[key]
doc['asset']['copyright'] = 'Ghost Girl Animated by Shaban Hafizsalim / CC BY 4.0. Material adaptation for OurLittleSecretGame.'
encoded = json.dumps(doc, separators=(',', ':')).encode()
encoded += b' ' * ((-len(encoded)) % 4)
chunks = struct.pack('<I4s', len(encoded), b'JSON') + encoded + raw[20 + length:]
target.write_bytes(struct.pack('<4sII', b'glTF', 2, 12 + len(chunks)) + chunks)
print(f'Adapted {target.name}: {target.stat().st_size:,} bytes')
