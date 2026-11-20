"""vox 組建置：台詞（本機 TTS → 角色處理）＋ 真人錄音素材 → public/assets/audio/vox/
  vox/whisper_0N.ogg、breath_0N.ogg、gasp_0N.ogg   常用的三種，登記在素材庫（src/audio/lib/vox.js，地圖載入時預先解碼）
  vox/core.bin + core.json     其他人聲素材（啜泣、笑聲、哼唱、尖叫、尖嘯、呻吟、數數……），三張地圖共用，用到才解碼
  vox/lines.bin + lines.json   台詞（只在寺廟用），用到才解碼、依劇情順序預先解碼後面幾句
並寫 art-direction/audio-sources/ledger-vox.json（來源與授權）與 _work/vox/qc.json（量測）。
用法：python -I scripts/vox/build.py [--lines-only | --assets-only] [--wav]   （--wav 另外輸出試聽 WAV 到 _work/vox/out/）
"""
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import numpy as np  # noqa: E402

import assets  # noqa: E402
import voices  # noqa: E402
from dsp import SR, measure, normalize, dc_block, fade, trim, encode_ogg, save_wav, mix, lp  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
SRC = os.path.join(ROOT, 'art-direction', 'audio-sources')
RAW = os.path.join(SRC, '_raw', 'vox')
WORK = os.path.join(SRC, '_work', 'vox')
TTS = os.path.join(WORK, 'tts')
CACHE = os.path.join(WORK, 'cache')
OUT = os.path.join(ROOT, 'public', 'assets', 'audio', 'vox')
LIB = os.path.join(ROOT, 'src', 'audio', 'lib', 'vox.js')
LINE_SR = 32000

TTS_SRC = {
    'yating': {'title': 'Microsoft Yating（Windows OneCore zh-TW 語音，本機離線合成）', 'author': 'Microsoft（Windows 內建語音）', 'license': 'Windows 內建 TTS 輸出，僅作原料、經大幅處理', 'url': ''},
    'zhiwei': {'title': 'Microsoft Zhiwei（Windows OneCore zh-TW 語音，本機離線合成）', 'author': 'Microsoft（Windows 內建語音）', 'license': 'Windows 內建 TTS 輸出，僅作原料、經大幅處理', 'url': ''},
    'hanhan': {'title': 'Microsoft Hanhan（Windows OneCore zh-TW 語音，本機離線合成）', 'author': 'Microsoft（Windows 內建語音）', 'license': 'Windows 內建 TTS 輸出，僅作原料、經大幅處理', 'url': ''},
}


def finalize(y, target, fout=0.05):
    y = dc_block(np.asarray(y, dtype=np.float64))
    y = trim(y, SR, -58, 0.015)
    y = normalize(y, SR, target, -1.2)
    return fade(y, SR, 0.004, fout)


def pack(items, path, sr, q):
    """items：[(名稱, [take 陣列])] → 串接的 Ogg 檔與索引 {名稱: [[位移, 長度, 秒數], ...]}"""
    blob, index, tmp = bytearray(), {}, os.path.join(WORK, '_pack_tmp.ogg')
    for name, takes in items:
        index[name] = []
        for y in takes:
            encode_ogg(y, tmp, sr=sr, q=q)
            data = open(tmp, 'rb').read()
            index[name].append([len(blob), len(data), round(len(y) / SR, 3)])
            blob += data
    os.unlink(tmp)
    with open(path, 'wb') as f:
        f.write(blob)
    return index, len(blob)


def main():
    args = set(sys.argv[1:])
    t0 = time.time()
    os.makedirs(OUT, exist_ok=True)
    manifest = json.load(open(os.path.join(RAW, 'manifest.json'), encoding='utf8'))
    raw = assets.Raw(RAW, manifest)
    extra = {}
    qc = {'assets': {}, 'lines': {}}
    ledger = []
    want_wav = '--wav' in args
    wav_dir = os.path.join(WORK, 'out')

    # ── 真人錄音素材 ──
    A = assets.build_assets(raw, extra)
    c = voices.Ctx(TTS, CACHE, extra)

    # 點名動機：小孩耳語數一到五，第六聲是「它」
    digs = []
    for i, lid in enumerate(['f_guo_yi', 'f_guo_er', 'f_guo_san', 'f_guo_si', 'f_guo_wu']):
        an = c.an(lid, 'yating')
        digs.append((voices.proximity(voices.voice(voices.stretch(an, 1.12), 290, 1.17, 1.1, whisper=True, seed=i), SR, 3.0), 1.0, 0.92 * i))
    six = voices.it_voice(c, {'id': 'f_guo_liu'}, seed=5, hz=70)
    count = mix(digs + [(six, 1.25, 0.92 * 5 + 0.75)])
    A['counting'] = {'takes': [assets.clean(count, 100, fout=0.6)], 'target': -20, 'dest': 'core',
                     'sources': [TTS_SRC['yating'], TTS_SRC['zhiwei'], TTS_SRC['hanhan']], 'notes': '點名動機：小孩耳語數「一、二、三、四、五」，第六聲換成「它」低沉的聲音（本機 TTS 原料，WORLD 耳語化與多層處理）'}

    bank_files, core_items = {}, []
    if '--lines-only' not in args:
        for name, a in A.items():
            takes = [finalize(y, a['target']) for y in a['takes']]
            qc['assets'][name] = [measure(y) for y in takes]
            if want_wav:
                for i, y in enumerate(takes):
                    save_wav(os.path.join(wav_dir, f'asset_{name}_{i + 1}.wav'), y)
            if a['dest'] == 'bank':
                files = []
                for i, y in enumerate(takes):
                    fn = f'{name.lower()}_{i + 1:02d}.ogg'
                    encode_ogg(y, os.path.join(OUT, fn), sr=SR, q=4)
                    files.append('vox/' + fn)
                bank_files[name] = files
                ledger += [{'file': f, 'sources': (a.get('take_src') or [a['sources']] * len(files))[i], 'notes': a['notes']} for i, f in enumerate(files)]
            else:
                core_items.append((name, takes))
                ledger.append({'file': f'vox/core.bin#{name}', 'sources': a['sources'], 'notes': a['notes'] + f'（{len(takes)} 個變體）'})
        core_index, core_bytes = pack(core_items, os.path.join(OUT, 'core.bin'), SR, 4)
        json.dump({'v': 1, 'sr': SR, 'items': core_index}, open(os.path.join(OUT, 'core.json'), 'w', encoding='utf8'), ensure_ascii=False, separators=(',', ':'))
        # 素材庫登記（自動產生）
        lib = ['// vox 組的錄音素材登記（格式見 src/audio/bank.js）。由 scripts/vox/build.py 產生；來源與授權記在 art-direction/audio-sources/ledger-vox.json。',
               '// 只登記最常用、需要零延遲的三種（地圖載入時預先解碼）；其他人聲在 vox/core.bin、台詞在 vox/lines.bin，由 src/audio/modules/vox.js 用到才解碼。',
               'export default {']
        meta = {'whisper': (1.0, [0.94, 1.06]), 'breath': (1.0, [0.95, 1.04]), 'gasp': (1.0, [0.96, 1.05])}
        for name, files in bank_files.items():
            g, r = meta.get(name, (1.0, [0.97, 1.03]))
            lib.append(f"  'vox.{name}': {{ files: {json.dumps(files)}, maps: ['all'], gain: {g}, bus: 'fx', rate: {json.dumps(r)}, wet: 1 }},")
        lib.append('};')
        open(LIB, 'w', encoding='utf8').write('\n'.join(lib) + '\n')
        print(f'assets: {len(A)} kinds, core.bin {core_bytes / 1024:.0f} KB, bank files {sum(len(v) for v in bank_files.values())}')

    # ── 台詞 ──
    if '--assets-only' not in args:
        lines = json.load(open(os.path.join(HERE, 'lines.json'), encoding='utf8'))['lines']
        items, meta, order = [], {}, 0
        for line in lines:
            takes = []
            for k in range(line.get('takes', 1)):
                y = voices.build_line(c, line, k)
                whisper = line['fx'] in ('childWhisper', 'womanWhisper', 'manClothWhisper', 'itWhisper')
                takes.append(finalize(y, -20.5 if whisper else -19, 0.06))
            name = line['id']
            items.append((name, takes))
            meta[name] = line
            qc['lines'][name] = [measure(y, f0=True) for y in takes]
            if want_wav:
                for i, y in enumerate(takes):
                    save_wav(os.path.join(wav_dir, f'line_{name}_{i + 1}.wav'), y)
        idx, nbytes = pack(items, os.path.join(OUT, 'lines.bin'), LINE_SR, 4)
        out = {}
        for name, takes in idx.items():
            line = meta[name]
            out.setdefault(line['k'], []).append({'id': name, 'p': line.get('p'), 'o': order, 'g': line['grp'], 't': takes})
            order += 1
        json.dump({'v': 1, 'sr': LINE_SR, 'items': out}, open(os.path.join(OUT, 'lines.json'), 'w', encoding='utf8'), ensure_ascii=False, separators=(',', ':'))
        used = sorted({ln['tts'] for ln in lines} | {'zhiwei', 'hanhan', 'yating'})
        ledger.append({
            'file': 'vox/lines.bin', 'sources': [TTS_SRC[v] for v in used] + [raw.src(346213), raw.src(320740)],
            'notes': '中文台詞：以本機 Windows OneCore zh-TW 語音離線念出（文字未送到任何線上服務），再以 WORLD 聲碼器改音高、共振峰、氣聲、節奏，'
                     '並加上角色質感（小孩、借來的聲音、「它」的多層聲音、錄音帶、電話、無線電、隔著門）。美蘭的嘶喊前疊一口真人倒抽氣（Freesound 346213），'
                     '「它」的「應我」底下疊一層降調的真人尖叫（Freesound 320740）。TTS 只是原料。',
            'lines': [{'id': ln['id'], 'key': ln['k'], 'tts': ln['tts'], 'fx': ln['fx']} for ln in lines],
        })
        print(f'lines: {len(lines)} lines, {sum(len(t) for _, t in items)} takes, lines.bin {nbytes / 1024:.0f} KB')

    # ── 帳本（合併：只更新這次重建的部分）──
    lp_path = os.path.join(SRC, 'ledger-vox.json')
    old = json.load(open(lp_path, encoding='utf8')) if os.path.exists(lp_path) else []
    keep = [e for e in old if ('--lines-only' in args and e['file'] != 'vox/lines.bin') or ('--assets-only' in args and e['file'] == 'vox/lines.bin')]
    json.dump(keep + ledger, open(lp_path, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    qp = os.path.join(WORK, 'qc.json')
    oldq = json.load(open(qp, encoding='utf8')) if os.path.exists(qp) else {}
    for k in ('assets', 'lines'):
        if qc[k]:
            oldq[k] = qc[k]
    json.dump(oldq, open(qp, 'w', encoding='utf8'), ensure_ascii=False, indent=0)
    print(f'done in {time.time() - t0:.0f}s')


if __name__ == '__main__':
    main()
