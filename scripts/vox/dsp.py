"""vox 組離線音訊處理的共用工具（numpy / scipy / pyworld / ffmpeg）。
沒有人聽得到聲音，所以每個成品都用 measure() 的量測把關（峰值、響度、DC、頭尾靜音、低頻比例、喀聲、F0）。
"""
import hashlib
import math
import os
import subprocess
import tempfile

import numpy as np
import pyworld as pw
import soundfile as sf
from scipy import signal
from scipy.ndimage import maximum_filter1d

SR = 48000
FP = 5.0  # WORLD frame period (ms)


# ───────────────────────── I/O ─────────────────────────

def load(path, sr=SR):
    """任何格式 → 單聲道 float64（ffmpeg 解碼、重取樣）"""
    cmd = ['ffmpeg', '-v', 'error', '-i', str(path), '-ac', '1', '-ar', str(sr), '-f', 'f32le', '-']
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).astype(np.float64)


def save_wav(path, x, sr=SR):
    os.makedirs(os.path.dirname(str(path)), exist_ok=True)
    sf.write(str(path), np.clip(x, -1, 1).astype(np.float32), sr, subtype='PCM_16')


def encode_ogg(x, path, sr=SR, q=4, src_sr=SR):
    """寫成單聲道 Ogg Vorbis；回傳檔案大小"""
    os.makedirs(os.path.dirname(str(path)), exist_ok=True)
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tf:
        tmp = tf.name
    try:
        sf.write(tmp, np.clip(x, -1, 1).astype(np.float32), src_sr, subtype='FLOAT')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp, '-ac', '1', '-ar', str(sr), '-c:a', 'libvorbis', '-q:a', str(q), str(path)], check=True)
    finally:
        os.unlink(tmp)
    return os.path.getsize(str(path))


def resample(x, sr_from, sr_to):
    if sr_from == sr_to:
        return x
    g = math.gcd(int(sr_from), int(sr_to))
    return signal.resample_poly(x, int(sr_to) // g, int(sr_from) // g)


# ───────────────────────── 濾波器 ─────────────────────────

def _sos(kind, f, sr, order=2):
    return signal.butter(order, f, btype=kind, fs=sr, output='sos')


def hp(x, f, sr=SR, order=2):
    return signal.sosfilt(_sos('highpass', f, sr, order), x)


def lp(x, f, sr=SR, order=2):
    return signal.sosfilt(_sos('lowpass', min(f, sr * 0.49), sr, order), x)


def bp(x, lo, hi, sr=SR, order=2):
    return signal.sosfilt(_sos('bandpass', [lo, min(hi, sr * 0.49)], sr, order), x)


def biquad(x, kind, f, sr=SR, q=0.707, gain_db=0.0):
    """RBJ 均衡器：peak / lowshelf / highshelf"""
    A = 10 ** (gain_db / 40)
    w0 = 2 * math.pi * f / sr
    cw, sw = math.cos(w0), math.sin(w0)
    alpha = sw / (2 * q)
    if kind == 'peak':
        b = [1 + alpha * A, -2 * cw, 1 - alpha * A]
        a = [1 + alpha / A, -2 * cw, 1 - alpha / A]
    elif kind == 'lowshelf':
        s = 2 * math.sqrt(A) * alpha
        b = [A * ((A + 1) - (A - 1) * cw + s), 2 * A * ((A - 1) - (A + 1) * cw), A * ((A + 1) - (A - 1) * cw - s)]
        a = [(A + 1) + (A - 1) * cw + s, -2 * ((A - 1) + (A + 1) * cw), (A + 1) + (A - 1) * cw - s]
    else:  # highshelf
        s = 2 * math.sqrt(A) * alpha
        b = [A * ((A + 1) + (A - 1) * cw + s), -2 * A * ((A - 1) + (A + 1) * cw), A * ((A + 1) + (A - 1) * cw - s)]
        a = [(A + 1) - (A - 1) * cw + s, 2 * ((A - 1) - (A + 1) * cw), (A + 1) - (A - 1) * cw - s]
    return signal.lfilter(np.array(b) / a[0], np.array(a) / a[0], x)


def dc_block(x, sr=SR):
    return hp(x, 22, sr, 2)


# ───────────────────────── 包絡、切片 ─────────────────────────

def env_db(x, sr=SR, win=0.02, hop=0.005):
    w, h = int(sr * win), int(sr * hop)
    if len(x) < w:
        return np.array([20 * math.log10(np.sqrt(np.mean(x ** 2)) + 1e-9)]), h
    n = 1 + (len(x) - w) // h
    idx = np.arange(w)[None, :] + h * np.arange(n)[:, None]
    e = np.sqrt(np.mean(x[idx] ** 2, axis=1))
    return 20 * np.log10(e + 1e-9), h


def trim(x, sr=SR, thr_db=-48, pad=0.025, rel=True):
    """去頭尾靜音（相對峰值的門檻）"""
    e, h = env_db(x, sr)
    t = (e.max() + thr_db) if rel else thr_db
    on = np.where(e > t)[0]
    if not len(on):
        return x
    a = max(0, on[0] * h - int(pad * sr))
    b = min(len(x), on[-1] * h + int(0.02 * sr) + int(pad * sr))
    return x[a:b]


def fade(x, sr=SR, fin=0.006, fout=0.04):
    x = x.copy()
    a, b = int(fin * sr), int(fout * sr)
    if a > 0:
        x[:a] *= np.sin(np.linspace(0, math.pi / 2, a)) ** 2
    if b > 0:
        x[-b:] *= np.cos(np.linspace(0, math.pi / 2, b)) ** 2
    return x


def events(x, sr=SR, rel_db=-30, floor_db=None, min_gap=0.15, min_len=0.12):
    """能量事件（開始、結束秒）：相對峰值 rel_db 以上，間隔小於 min_gap 的合併"""
    e, h = env_db(x, sr)
    thr = e.max() + rel_db
    if floor_db is not None:
        thr = max(thr, floor_db)
    on = e > thr
    out, i, n = [], 0, len(on)
    while i < n:
        if on[i]:
            j = i
            while j < n and on[j]:
                j += 1
            out.append([i * h / sr, j * h / sr + 0.02])
            i = j
        else:
            i += 1
    merged = []
    for s, t in out:
        if merged and s - merged[-1][1] < min_gap:
            merged[-1][1] = t
        else:
            merged.append([s, t])
    return [(s, t) for s, t in merged if t - s >= min_len]


def cut(x, s, t, sr=SR, pre=0.03, post=0.08):
    a, b = max(0, int((s - pre) * sr)), min(len(x), int((t + post) * sr))
    return x[a:b]


def valley_near(x, t, sr=SR, span=0.35):
    """t 附近能量最低的位置（秒），切點選在安靜的地方"""
    e, h = env_db(x, sr)
    i0, i1 = max(0, int((t - span) * sr / h)), min(len(e) - 1, int((t + span) * sr / h))
    if i1 <= i0:
        return t
    return (i0 + int(np.argmin(e[i0:i1]))) * h / sr


# ───────────────────────── 響度、限幅 ─────────────────────────

def k_weight(x, sr=SR):
    y = biquad(x, 'highshelf', 1500, sr, 0.707, 4.0)
    return hp(y, 38, sr, 2)


def lufs(x, sr=SR):
    """BS.1770 的積分響度近似（400 ms 區塊、−70 絕對與 −10 相對門檻）；太短的片段整段算"""
    y = k_weight(x, sr)
    w, h = int(0.4 * sr), int(0.1 * sr)
    if len(y) < w:
        return -0.691 + 10 * math.log10(np.mean(y ** 2) + 1e-12)
    n = 1 + (len(y) - w) // h
    ms = np.array([np.mean(y[i * h:i * h + w] ** 2) for i in range(n)])
    L = -0.691 + 10 * np.log10(ms + 1e-12)
    g = ms[L > -70]
    if not len(g):
        return -70.0
    rel = -0.691 + 10 * math.log10(np.mean(g)) - 10
    g2 = ms[(L > -70) & (L > rel)]
    return -0.691 + 10 * math.log10(np.mean(g2 if len(g2) else g))


def short_term_max(x, sr=SR):
    y = k_weight(x, sr)
    w, h = int(0.4 * sr), int(0.05 * sr)
    if len(y) < w:
        return -0.691 + 10 * math.log10(np.mean(y ** 2) + 1e-12)
    n = 1 + (len(y) - w) // h
    return max(-0.691 + 10 * math.log10(np.mean(y[i * h:i * h + w] ** 2) + 1e-12) for i in range(n))


def limit(x, sr=SR, ceiling_db=-1.2, look=0.004, release=0.06):
    """簡單的前瞻限幅：峰值包絡 → 平滑的增益衰減"""
    c = 10 ** (ceiling_db / 20)
    la = max(1, int(look * sr))
    pk = maximum_filter1d(np.abs(x), size=2 * la + 1)
    g = np.minimum(1.0, c / (pk + 1e-12))
    # 釋放：一階平滑（只往上慢慢回來）
    a = math.exp(-1 / (release * sr))
    out = np.empty_like(g)
    cur = 1.0
    for i in range(len(g)):
        v = g[i]
        cur = v if v < cur else a * cur + (1 - a) * v
        out[i] = cur
    y = x * out
    return np.clip(y, -c, c)


def normalize(x, sr=SR, target=-19.0, ceiling_db=-1.2):
    L = lufs(x, sr)
    y = x * 10 ** ((target - L) / 20)
    if np.max(np.abs(y)) > 10 ** (ceiling_db / 20):
        y = limit(y, sr, ceiling_db)
    return y


def level(x, sr=SR, ratio=3.0, win=0.08):
    """慢速壓縮：把忽大忽小的音（例如哼唱的每一個音）拉平一點"""
    e, h = env_db(x, sr, win, 0.01)
    ref = np.percentile(e[e > e.max() - 30], 70) if np.any(e > e.max() - 30) else e.max()
    over = np.maximum(0, e - ref)
    gdb = -over * (1 - 1 / ratio)
    gdb = np.convolve(gdb, np.ones(9) / 9, mode='same')
    g = 10 ** (np.interp(np.arange(len(x)), np.arange(len(gdb)) * h + int(win * sr / 2), gdb) / 20)
    return x * g


def soft_clip(x, drive=2.0):
    return np.tanh(x * drive) / math.tanh(drive)


# ───────────────────────── 空間與效果 ─────────────────────────

def reverb_ir(sr=SR, rt60=1.6, dur=None, seed=0, bright=0.5):
    dur = dur or rt60 * 1.1
    rng = np.random.default_rng(seed)
    n = int(dur * sr)
    t = np.arange(n) / sr
    ir = rng.standard_normal(n) * np.exp(-6.9 * t / rt60)
    ir = lp(ir, 2500 + 6000 * bright, sr, 1)
    ir[: int(0.008 * sr)] *= np.linspace(0, 1, int(0.008 * sr))
    return ir / np.sqrt(np.sum(ir ** 2))


def reverse_swell(x, sr=SR, rt60=1.8, pre=0.65, wet=0.35, seed=1):
    """倒放殘響：聲音之前先出現一股吸進來的尾巴（恐怖片常用）。回傳加長後的訊號（前面多 pre 秒）"""
    ir = reverb_ir(sr, rt60, seed=seed, bright=0.35)
    rev = signal.fftconvolve(x[::-1], ir)[::-1]  # 長度 N+M-1，前 M-1 是吸進來的尾巴
    M = len(ir) - 1
    p = int(pre * sr)
    swell = rev[max(0, M - p):]
    lead = len(swell) - len(x)
    dry = np.concatenate([np.zeros(lead), x])
    shape = np.ones(len(swell))
    shape[:lead] = np.linspace(0, 1, lead) ** 2.2
    shape[lead:] = np.exp(-np.arange(len(x)) / (0.12 * sr))  # 進入人聲後很快讓出來
    return dry + wet * swell * shape * (np.max(np.abs(x)) / (np.max(np.abs(swell)) + 1e-9))


def door_muffle(x, sr=SR, f=1600, body=200):
    y = lp(x, f, sr, 2)
    y = biquad(y, 'peak', body, sr, 1.1, 4.0)
    return y


def proximity(x, sr=SR, db=3.0):
    return biquad(x, 'lowshelf', 220, sr, 0.7, db)


def sbr_air(x, sr=SR, gain_db=-14.0, lo=4000, hi=8000):
    """頻寬延伸：把 4–8 kHz 的內容平移 4 kHz 疊到 8–12 kHz（TTS 只有 8 kHz 頻寬，耳語需要空氣聲）"""
    band = bp(x, lo, hi, sr, 4)
    t = np.arange(len(x)) / sr
    sh = band * np.cos(2 * math.pi * lo * t) * 2
    sh = bp(sh, hi, min(hi + 5000, sr * 0.45), sr, 4)
    return x + sh * 10 ** (gain_db / 20)


def ring(x, sr=SR, f=38.0, mix=0.5):
    t = np.arange(len(x)) / sr
    return x * (1 - mix) + x * np.sin(2 * math.pi * f * t) * mix


def tape(x, sr=SR, seed=0, hiss_db=-44, wow=0.0018, flutter=0.00035):
    """舊錄音帶：頻寬、抖動（wow / flutter）、飽和、嘶聲、掉音、印透（前面淡淡的一層預回音）"""
    rng = np.random.default_rng(seed)
    y = hp(x, 170, sr, 2)
    y = lp(y, 4300, sr, 4)
    y = biquad(y, 'peak', 1250, sr, 0.9, 3.0)
    n = len(y)
    t = np.arange(n) / sr
    ph = rng.uniform(0, 6.28, 3)
    d = 0.006 + wow * np.sin(2 * math.pi * 0.55 * t + ph[0]) + flutter * np.sin(2 * math.pi * 7.3 * t + ph[1]) + 0.0002 * np.sin(2 * math.pi * 13.1 * t + ph[2])
    idx = np.arange(n) - d * sr
    y = np.interp(idx, np.arange(n), y, left=0, right=0)
    y = soft_clip(y / (np.max(np.abs(y)) + 1e-9) * 0.9, 1.8) * 0.7
    # 印透（print-through）：0.42 秒後一層很淡的回音（放在後面，台詞不會被延後）
    k = int(0.42 * sr)
    y = np.concatenate([y, np.zeros(k)])
    y[k:] += 0.04 * y[:n]
    # 掉音
    for _ in range(rng.integers(1, 3)):
        c = int(rng.uniform(0.25, 0.85) * len(y))
        w = int(rng.uniform(0.035, 0.08) * sr)
        win = 1 - 0.55 * np.hanning(w)
        y[c:c + w] *= win[: len(y[c:c + w])]
    hiss = lp(hp(rng.standard_normal(len(y)), 1500, sr, 1), 7500, sr, 2)
    hiss *= 10 ** (hiss_db / 20) / (np.sqrt(np.mean(hiss ** 2)) + 1e-9) * np.sqrt(np.mean(y[:n] ** 2))
    return y + hiss


def phone(x, sr=SR, seed=0):
    """手機通話：窄頻、8 kHz μ-law 量化、壓縮、一點點線路雜訊"""
    rng = np.random.default_rng(seed)
    y = bp(x, 320, 3300, sr, 4)
    y8 = resample(y, sr, 8000)
    m = np.max(np.abs(y8)) + 1e-9
    v = y8 / m
    mu = 255.0
    enc = np.sign(v) * np.log1p(mu * np.abs(v)) / math.log1p(mu)
    enc = np.round(enc * 127) / 127
    dec = np.sign(enc) * ((1 + mu) ** np.abs(enc) - 1) / mu
    y = resample(dec * m, 8000, sr)[: len(x)]
    y = y / (1 + 2.5 * np.abs(y) / (np.max(np.abs(y)) + 1e-9)) * 3.5
    y = bp(y, 300, 3400, sr, 2)
    noise = bp(rng.standard_normal(len(y)), 300, 3400, sr, 2)
    noise *= 0.004 * np.max(np.abs(y)) / (np.max(np.abs(noise)) + 1e-9)
    return y + noise


def radio(x, sr=SR, seed=0):
    """無線電：更窄、硬削波、開頭與結尾的靜噪"""
    rng = np.random.default_rng(seed)
    y = bp(x, 420, 2700, sr, 4)
    y = y / (np.max(np.abs(y)) + 1e-9)
    y = np.clip(y * 2.8, -0.75, 0.75)
    y = bp(y, 380, 3000, sr, 2)
    a, b = int(0.09 * sr), int(0.18 * sr)
    sq1 = bp(rng.standard_normal(a), 900, 4500, sr, 2) * 0.35 * np.hanning(a * 2)[:a][::-1] ** 0.3
    sq2 = bp(rng.standard_normal(b), 900, 4500, sr, 2) * 0.45 * np.linspace(1, 0, b) ** 1.5
    bed = bp(rng.standard_normal(len(y)), 1200, 4000, sr, 2) * 0.025
    return np.concatenate([sq1, y + bed, sq2])


def stutter(y, sr=SR, n=1, seed=0, drop=False):
    """借來的聲音像被剪接過：在有聲音的地方重複一小段（或拿掉一小段）"""
    rng = np.random.default_rng(seed)
    e, h = env_db(y, sr)
    loud = np.where(e > e.max() - 14)[0]
    if len(loud) < 10:
        return y
    out = y
    for _ in range(n):
        c = int(loud[rng.integers(len(loud) // 5, max(len(loud) // 5 + 1, len(loud) * 4 // 5))] * h)
        L = int(rng.uniform(0.045, 0.075) * sr)
        f = int(0.004 * sr)
        if c + L >= len(out):
            continue
        seg = out[c:c + L].copy()
        seg[:f] *= np.linspace(0, 1, f)
        seg[-f:] *= np.linspace(1, 0, f)
        if drop:
            hole = np.ones(L)
            hole[:f] = np.linspace(1, 0, f)
            hole[f:-f] = 0
            hole[-f:] = np.linspace(0, 1, f)
            out = out.copy()
            out[c:c + L] *= hole
        else:
            out = np.concatenate([out[:c + L], seg, out[c + L:]])
    return out


def mix(layers):
    """[(訊號, 增益, 延遲秒)] → 對齊後相加"""
    n = max(int(d * SR) + len(x) for x, g, d in layers)
    out = np.zeros(n)
    for x, g, d in layers:
        k = int(d * SR)
        out[k:k + len(x)] += x * g
    return out


# ───────────────────────── WORLD 聲碼器 ─────────────────────────

_CACHE = {}


def world(x, sr, cache_dir=None, key=None):
    """分析：回傳 dict(f0, sp, ap, sr)。可快取到硬碟（harvest 比較慢）"""
    k = key or hashlib.md5(x.tobytes()).hexdigest()
    if k in _CACHE:
        return _CACHE[k]
    path = os.path.join(cache_dir, k + '.npz') if cache_dir else None
    if path and os.path.exists(path):
        d = np.load(path)
        r = {'f0': d['f0'], 'sp': d['sp'], 'ap': d['ap'], 'sr': int(d['sr'])}
    else:
        x = np.ascontiguousarray(x, dtype=np.float64)
        f0, t = pw.harvest(x, sr, f0_floor=55, f0_ceil=650, frame_period=FP)
        f0 = pw.stonemask(x, f0, t, sr)
        sp = pw.cheaptrick(x, f0, t, sr)
        ap = pw.d4c(x, f0, t, sr)
        r = {'f0': f0, 'sp': sp, 'ap': ap, 'sr': sr}
        if path:
            os.makedirs(cache_dir, exist_ok=True)
            np.savez_compressed(path, **r)
    _CACHE[k] = r
    return r


def synth(f0, sp, ap, sr):
    y = pw.synthesize(np.ascontiguousarray(f0), np.ascontiguousarray(np.maximum(sp, 1e-16)), np.ascontiguousarray(np.clip(ap, 0, 1)), sr, FP)
    return np.nan_to_num(y)


def warp_sp(sp, alpha):
    """共振峰平移：alpha > 1 往上（小孩），< 1 往下"""
    if abs(alpha - 1) < 1e-3:
        return sp
    B = sp.shape[1]
    src = np.arange(B) / alpha
    i0 = np.clip(np.floor(src).astype(int), 0, B - 1)
    i1 = np.clip(i0 + 1, 0, B - 1)
    fr = np.clip(src - i0, 0, 1)
    out = sp[:, i0] * (1 - fr) + sp[:, i1] * fr
    if alpha < 1:
        over = src > B - 1
        out[:, over] *= 0.05
    return out


def f0_to(f0, target, expand=1.0):
    """把有聲段的中位數移到 target Hz，並把起伏放大／壓平（expand）"""
    v = f0 > 0
    if not v.any():
        return f0
    lg = np.log(f0[v])
    med = np.median(lg)
    out = f0.copy()
    out[v] = np.exp(math.log(target) + (lg - med) * expand)
    return out


def f0_mod(f0, rate=5.5, depth_st=0.0, jitter=0.0, seed=0, drift_st=0.0):
    rng = np.random.default_rng(seed)
    n = len(f0)
    t = np.arange(n) * FP / 1000
    st = depth_st * np.sin(2 * math.pi * rate * t + rng.uniform(0, 6.28))
    if jitter:
        j = rng.standard_normal(n) * jitter
        j = signal.lfilter([0.3], [1, -0.7], j)
        st = st + 12 * np.log2(1 + j)
    if drift_st:
        st = st + drift_st * np.linspace(0, 1, n)
    out = f0.copy()
    v = f0 > 0
    out[v] = f0[v] * 2 ** (st[v] / 12)
    return out


def breathy(ap, k):
    return ap + (1 - ap) * k


def stretch(an, factor):
    """整句時間伸縮（不改音高）"""
    f0, sp, ap = an['f0'], an['sp'], an['ap']
    n = len(f0)
    m = max(2, int(round(n * factor)))
    src = np.linspace(0, n - 1, m)
    i0 = np.floor(src).astype(int)
    i1 = np.minimum(i0 + 1, n - 1)
    fr = (src - i0)[:, None]
    sp2 = np.exp(np.log(sp[i0] + 1e-16) * (1 - fr) + np.log(sp[i1] + 1e-16) * fr)
    ap2 = ap[i0] * (1 - fr) + ap[i1] * fr
    f02 = f0[np.round(src).astype(int)]
    return {'f0': f02, 'sp': sp2, 'ap': ap2, 'sr': an['sr']}


def hold_last(an, hold, glide_st=-1.5, vib_st=0.25):
    """拉長最後一個有聲段的後半（遠處喊人的拖長尾音），尾音慢慢往下滑、加一點顫音"""
    if hold <= 0:
        return an
    f0, sp, ap = an['f0'], an['sp'], an['ap']
    v = np.where(f0 > 0)[0]
    if not len(v):
        return an
    b = v[-1] + 1
    a = b - 1
    while a > 0 and f0[a - 1] > 0:
        a -= 1
    mid = a + (b - a) // 2
    seg = b - mid
    if seg < 3:
        return an
    add = int(hold * 1000 / FP)
    m = seg + add
    src = np.linspace(mid, b - 1, m)
    i0 = np.floor(src).astype(int)
    i1 = np.minimum(i0 + 1, b - 1)
    fr = (src - i0)[:, None]
    spm = np.exp(np.log(sp[i0] + 1e-16) * (1 - fr) + np.log(sp[i1] + 1e-16) * fr)
    apm = ap[i0] * (1 - fr) + ap[i1] * fr
    base = f0[mid:b][np.clip(np.round(np.linspace(0, seg - 1, m)).astype(int), 0, seg - 1)]
    t = np.arange(m) * FP / 1000
    st = glide_st * np.linspace(0, 1, m) ** 1.5 + vib_st * np.linspace(0, 1, m) * np.sin(2 * math.pi * 5.2 * t)
    f0m = base * 2 ** (st / 12)
    # 尾音音量慢慢退：把頻譜包絡壓低
    decay = np.linspace(1, 0.35, m) ** 2
    spm = spm * decay[:, None]
    return {
        'f0': np.concatenate([f0[:mid], f0m, f0[b:]]),
        'sp': np.concatenate([sp[:mid], spm, sp[b:]]),
        'ap': np.concatenate([ap[:mid], apm, ap[b:]]),
        'sr': an['sr'],
    }


def fit_len(an, n):
    """把另一個聲音的分析結果伸縮成 n 個音框（多人同聲時大致對齊）"""
    return stretch(an, n / len(an['f0']))


def median_f0(x, sr=SR):
    xx = resample(x, sr, 16000) if sr != 16000 else x
    f0, _ = pw.dio(np.ascontiguousarray(xx, dtype=np.float64), 16000, f0_floor=55, f0_ceil=700, frame_period=10)
    v = f0[f0 > 0]
    return float(np.median(v)) if len(v) > 5 else 0.0


# ───────────────────────── 量測 ─────────────────────────

def measure(x, sr=SR, f0=False):
    a = np.abs(x)
    pk = float(a.max()) if len(x) else 0.0
    e, h = env_db(x, sr)
    on = np.where(e > e.max() - 45)[0]
    head = on[0] * h / sr if len(on) else 0
    tail = (len(x) - on[-1] * h) / sr if len(on) else 0
    spec = np.abs(np.fft.rfft(x * np.hanning(len(x)))) ** 2 if len(x) > 64 else np.ones(2)
    fr = np.fft.rfftfreq(len(x), 1 / sr) if len(x) > 64 else np.ones(2)
    tot = spec.sum() + 1e-12
    d = np.abs(np.diff(x))
    rms = np.sqrt(np.mean(x ** 2)) + 1e-12
    r = {
        'dur': round(len(x) / sr, 3),
        'peak_db': round(20 * math.log10(pk + 1e-12), 2),
        'lufs': round(lufs(x, sr), 1),
        'st_max': round(short_term_max(x, sr), 1),
        'dc': round(float(np.mean(x)), 5),
        'head_s': round(head, 3), 'tail_s': round(tail, 3),
        'lf_ratio': round(float(spec[fr < 100].sum() / tot), 4),
        'hf_ratio': round(float(spec[fr > 6000].sum() / tot), 4),
        'centroid': int((spec * fr).sum() / tot),
        'click': round(float(d.max() / rms), 1),
        'edge_db': round(20 * math.log10(max(abs(x[0]), abs(x[-1])) + 1e-9), 1),
        'clipped': int(np.sum(a > 0.999)),
    }
    if f0:
        r['f0'] = int(median_f0(x, sr))
    return r
