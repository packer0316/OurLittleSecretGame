"""把一批音檔畫成頻譜圖（對數頻率、dB 色階）與波形包絡，輸出一張 PNG（不需要 matplotlib）。
用法：python -I scripts/audio_score_spectro.py out.png file1 [file2 ...]
"""
import os
import struct
import sys
import zlib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np  # noqa: E402
from audio_score_dsp import SR, load  # noqa: E402

W, H, EH = 900, 150, 40  # 每列：頻譜 150 px + 包絡 40 px
FONT = {}


def png(path, rgb):
    h, w, _ = rgb.shape
    raw = b''.join(b'\x00' + rgb[y].astype(np.uint8).tobytes() for y in range(h))

    def chunk(t, d):
        c = struct.pack('>I', len(d)) + t + d
        return c + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))


def cmap(v):
    """0..1 → 黑、紫、紅、黃、白"""
    stops = np.array([[0, 0, 0], [40, 10, 80], [160, 20, 80], [240, 120, 20], [255, 240, 160], [255, 255, 255]], float)
    p = np.clip(v, 0, 1) * (len(stops) - 1)
    i = np.minimum(np.floor(p).astype(int), len(stops) - 2)
    f = (p - i)[..., None]
    return stops[i] * (1 - f) + stops[i + 1] * f


def spectro(x, seconds):
    n = 2048
    hop = max(1, int(len(x) / W))
    cols = []
    win = np.hanning(n)
    xp = np.concatenate([x, np.zeros(n)])
    for c in range(W):
        s = c * hop
        seg = xp[s:s + n] * win
        cols.append(np.abs(np.fft.rfft(seg)))
    S = np.array(cols).T  # freq x time
    fr = np.fft.rfftfreq(n, 1 / SR)
    # 對數頻率軸 30 Hz – 16 kHz
    ys = np.geomspace(30, 16000, H)[::-1]
    idx = np.clip(np.searchsorted(fr, ys), 1, len(fr) - 1)
    img = 20 * np.log10(S[idx] + 1e-9)
    img = (img - (img.max() - 80)) / 80
    return cmap(img)


def envelope(x):
    hop = max(1, int(len(x) / W))
    e = np.array([np.max(np.abs(x[c * hop:(c + 1) * hop])) if c * hop < len(x) else 0 for c in range(W)])
    d = 20 * np.log10(e + 1e-9)
    img = np.zeros((EH, W, 3))
    for c in range(W):
        h = int(np.clip((d[c] + 60) / 60, 0, 1) * (EH - 2))
        img[EH - 1 - h:, c] = [90, 200, 120]
        if d[c] > -1:
            img[EH - 1 - h:, c] = [255, 60, 60]
    # -6/-20/-40 dB 參考線
    for ref in (-6, -20, -40):
        y = EH - 1 - int((ref + 60) / 60 * (EH - 2))
        img[y, ::4] = [80, 80, 80]
    return img


def main():
    out, files = sys.argv[1], sys.argv[2:]
    rows = []
    for f in files:
        x = load(f)
        sp = spectro(x, len(x) / SR)
        en = envelope(x)
        sep = np.full((3, W, 3), 255.0)
        # 每秒一條刻度
        secs = len(x) / SR
        for s in np.arange(1, secs, 1.0):
            xx = int(s / secs * W)
            sp[:, xx] = sp[:, xx] * 0.5 + 60
        rows += [sp, en, sep]
    png(out, np.vstack(rows))
    print(out, len(files), 'rows')


if __name__ == '__main__':
    main()
