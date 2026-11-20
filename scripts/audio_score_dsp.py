"""配樂組（score）離線製作用的 DSP 工具：讀檔、存檔、音高、重取樣、延長持續音、殘響、循環接縫、量測。
只依賴 numpy / scipy 與系統的 ffmpeg。由 scripts/audio-score-build.py 使用。
"""
import json
import os
import subprocess

import numpy as np
import scipy.signal as sg

SR = 48000
RNG = np.random.default_rng(20261120)


# ───────────────────────── 讀寫 ─────────────────────────
def load(path, mono=True):
    cmd = ['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '1' if mono else '2', '-ar', str(SR), '-']
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    x = np.frombuffer(raw, np.float32).astype(np.float64)
    if not mono:
        x = x.reshape(-1, 2).T.copy()
    return x


def _pcm(x):
    if x.ndim == 1:
        return 1, x.astype(np.float32).tobytes()
    return 2, x.T.astype(np.float32).tobytes()


def save_ogg(x, path, q=4):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    ch, data = _pcm(x)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', str(ch), '-i', '-',
                    '-c:a', 'libvorbis', '-q:a', str(q), path], input=data, check=True)


def save_wav(x, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    ch, data = _pcm(x)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', str(ch), '-i', '-',
                    '-c:a', 'pcm_s16le', path], input=data, check=True)


# ───────────────────────── 基本 ─────────────────────────
def sec(n):
    return int(round(n * SR))


def silence(seconds):
    return np.zeros(sec(seconds))


def place(dst, src, at, gain=1.0):
    """把 src 疊到 dst 的第 at 秒（超出部分自動延長 dst）"""
    i = sec(at)
    end = i + len(src)
    if end > len(dst):
        dst = np.concatenate([dst, np.zeros(end - len(dst))])
    dst[i:end] += src * gain
    return dst


def pad_to(x, n):
    return x[:n] if len(x) >= n else np.concatenate([x, np.zeros(n - len(x))])


def mix(*parts):
    n = max(len(p) for p in parts)
    out = np.zeros(n)
    for p in parts:
        out[:len(p)] += p
    return out


def fade(x, fin=0.0, fout=0.0, shape='sin'):
    x = x.copy()
    a, b = sec(fin), sec(fout)
    if a > 0:
        t = np.linspace(0, 1, a)
        x[:a] *= np.sin(t * np.pi / 2) if shape == 'sin' else t
    if b > 0:
        t = np.linspace(1, 0, b)
        x[-b:] *= np.sin(t * np.pi / 2) if shape == 'sin' else t
    return x


def env_points(n, pts):
    """pts: [(秒, 值), ...] 線性內插的包絡"""
    t = np.arange(n) / SR
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return np.interp(t, xs, ys)


def db(x):
    return 20 * np.log10(max(x, 1e-12))


def undb(d):
    return 10 ** (d / 20)


def rms(x):
    return float(np.sqrt(np.mean(np.square(x)) + 1e-20))


def peak(x):
    return float(np.max(np.abs(x)) + 1e-20)


def dc_remove(x):
    b, a = sg.butter(2, 12 / (SR / 2), 'highpass')
    return sg.filtfilt(b, a, x)


def trim(x, thresh_db=-60, pad=0.005):
    a = np.abs(x)
    th = peak(x) * undb(thresh_db)
    idx = np.nonzero(a > th)[0]
    if not len(idx):
        return x
    s = max(0, idx[0] - sec(pad))
    e = min(len(x), idx[-1] + sec(pad))
    return x[s:e]


def norm_peak(x, target_db=-1.0):
    return x * (undb(target_db) / peak(x))


def lp(x, hz, order=2):
    b, a = sg.butter(order, min(hz, SR / 2 * 0.98) / (SR / 2), 'lowpass')
    return sg.lfilter(b, a, x)


def hp(x, hz, order=2):
    b, a = sg.butter(order, hz / (SR / 2), 'highpass')
    return sg.lfilter(b, a, x)


def bp(x, lo, hi, order=2):
    b, a = sg.butter(order, [lo / (SR / 2), min(hi, SR / 2 * 0.98) / (SR / 2)], 'bandpass')
    return sg.lfilter(b, a, x)


def peaking(x, f0, gain_db, q=1.0):
    A = 10 ** (gain_db / 40)
    w = 2 * np.pi * f0 / SR
    al = np.sin(w) / (2 * q)
    b = [1 + al * A, -2 * np.cos(w), 1 - al * A]
    a = [1 + al / A, -2 * np.cos(w), 1 - al / A]
    return sg.lfilter(np.array(b) / a[0], np.array(a) / a[0], x)


def shelf_hi(x, f0, gain_db):
    A = 10 ** (gain_db / 40)
    w = 2 * np.pi * f0 / SR
    al = np.sin(w) / 2 * np.sqrt(2)
    cw = np.cos(w)
    b = [A * ((A + 1) + (A - 1) * cw + 2 * np.sqrt(A) * al), -2 * A * ((A - 1) + (A + 1) * cw), A * ((A + 1) + (A - 1) * cw - 2 * np.sqrt(A) * al)]
    a = [(A + 1) - (A - 1) * cw + 2 * np.sqrt(A) * al, 2 * ((A - 1) - (A + 1) * cw), (A + 1) - (A - 1) * cw - 2 * np.sqrt(A) * al]
    return sg.lfilter(np.array(b) / a[0], np.array(a) / a[0], x)


def saturate(x, drive=1.5):
    return np.tanh(x * drive) / np.tanh(drive)


# ───────────────────────── 音高與重取樣 ─────────────────────────
def f0(x, lo=25, hi=2000, at=None, win=1.0):
    """諧波乘積頻譜估計基頻（取中段 win 秒）"""
    n = sec(win)
    s = sec(at) if at is not None else max(0, len(x) // 2 - n // 2)
    seg = x[s:s + n]
    if len(seg) < n:
        seg = pad_to(seg, n)
    seg = seg * np.hanning(len(seg))
    N = 1 << 19
    S = np.abs(np.fft.rfft(seg, N))
    freqs = np.fft.rfftfreq(N, 1 / SR)
    hps = np.log(S + 1e-9)
    for h in (2, 3, 4):
        d = S[::h]
        hps[:len(d)] += np.log(d + 1e-9)
    band = (freqs >= lo) & (freqs <= hi)
    i = np.argmax(np.where(band, hps, -np.inf))
    if 0 < i < len(hps) - 1:
        a, b, c = hps[i - 1], hps[i], hps[i + 1]
        off = 0.5 * (a - c) / (a - 2 * b + c + 1e-12)
    else:
        off = 0
    return float((i + off) * SR / N)


def hermite_read(x, idx):
    """4 點 Hermite 內插讀取 x 的分數位置 idx"""
    i = np.floor(idx).astype(np.int64)
    f = idx - i
    xp = np.concatenate([[x[0]], x, [x[-1], x[-1]]])
    i = np.clip(i + 1, 1, len(xp) - 3)
    y0, y1, y2, y3 = xp[i - 1], xp[i], xp[i + 1], xp[i + 2]
    c0 = y1
    c1 = 0.5 * (y2 - y0)
    c2 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3
    c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2)
    return ((c3 * f + c2) * f + c1) * f + c0


def resample(x, ratio):
    """ratio > 1：音高變高、長度變短（播放速度）"""
    if abs(ratio - 1) < 1e-6:
        return x.copy()
    if ratio > 1:  # 先低通避免混疊
        x = lp(x, SR / 2 / ratio * 0.92, order=6)
    n = int(len(x) / ratio)
    return hermite_read(x, np.arange(n) * ratio)


def varispeed(x, rate_curve):
    """rate_curve：每個輸出樣本的播放速度（陣列），回傳長度 = len(rate_curve)（來源不夠時停在尾端）"""
    mx = float(np.max(rate_curve))
    if mx > 1.0:  # 升高音高前先低通，避免混疊
        x = lp(x, SR / 2 / mx * 0.9, order=6)
    idx = np.cumsum(rate_curve) - rate_curve[0]
    idx = np.minimum(idx, len(x) - 1.001)
    return hermite_read(x, idx)


def semis(s):
    return 2 ** (s / 12)


def to_pitch(x, target_hz, src_hz=None, **kw):
    src_hz = src_hz or f0(x, **kw)
    return resample(x, target_hz / src_hz)


# ───────────────────────── 延長持續音（隨機位置疊接） ─────────────────────────
def sustain(x, dur, a, b, grain=1.6, seed=None, jitter=0.0):
    """從 x 的 [a, b] 秒（穩定段）隨機取 grain 秒的片段，以等功率窗疊接成 dur 秒。
    jitter：每片段音高的隨機偏移（音分），增加合奏感。"""
    rng = np.random.default_rng(seed)
    g = sec(grain)
    hop = g // 2
    w = np.sin(np.linspace(0, np.pi, g, endpoint=False)) ** 1  # sin 窗，50% 重疊等功率
    n = sec(dur) + g
    out = np.zeros(n)
    A, B = sec(a), max(sec(a) + 1, sec(b) - g)
    pos = 0
    while pos < n:
        s = int(rng.integers(A, B))
        seg = x[s:s + g]
        if jitter:
            r = semis(rng.normal(0, jitter) / 100)
            seg = hermite_read(x, s + np.arange(g) * r)
        if len(seg) < g:
            seg = pad_to(seg, g)
        out[pos:pos + g] += seg[:min(g, n - pos)] * w[:min(g, n - pos)]
        pos += hop
    # 頭半個窗只有一片：用淡入補平
    return out[hop:hop + sec(dur)]


def extend(x, n, a, b, keep=0.6, xf=0.25, grain=0.7, seed=None):
    """保留 x 的前 keep 秒（真實起音），之後交叉淡化到從穩定段 [a, b] 延長出來的持續音，總長 n 個樣本"""
    if len(x) >= n:
        return x[:n]
    s = sustain(x, n / SR + 0.1, a, b, grain=grain, seed=seed)
    s = s * (rms(x[sec(a):sec(b)]) / (rms(s) + 1e-12))
    k, X = sec(keep), sec(xf)
    out = pad_to(x, n).copy()
    t = np.linspace(0, 1, X)
    out[k:k + X] = out[k:k + X] * np.cos(t * np.pi / 2) + s[k:k + X] * np.sin(t * np.pi / 2)
    out[k + X:] = s[k + X:n]
    return out


# ───────────────────────── 殘響 ─────────────────────────
def make_ir(rt60=2.5, seconds=None, bright=0.5, pre=0.02, seed=1, stereo=False):
    seconds = seconds or rt60 * 1.3
    rng = np.random.default_rng(seed)
    n = sec(seconds)
    t = np.arange(n) / SR
    chans = []
    for c in range(2 if stereo else 1):
        noise = rng.standard_normal(n)
        # 三個頻段，高頻衰減比較快
        lo = lp(noise, 600)
        mid = bp(noise, 600, 4000)
        hi_ = hp(noise, 4000)
        k = np.log(1000) / rt60
        ir = lo * np.exp(-k * t) + mid * np.exp(-k * 1.3 * t) * 0.8 + hi_ * np.exp(-k * (2.6 - 1.6 * bright) * t) * (0.25 + 0.5 * bright)
        ir *= np.minimum(1, t / 0.012)  # 柔和的起音
        ir = np.concatenate([np.zeros(sec(pre)), ir])
        ir /= np.sqrt(np.sum(ir ** 2))
        chans.append(ir)
    return np.array(chans) if stereo else chans[0]


def reverb(x, rt60=2.5, wet=0.35, bright=0.5, pre=0.02, seed=1, tail=True):
    ir = make_ir(rt60, bright=bright, pre=pre, seed=seed)
    w = sg.fftconvolve(x, ir)
    d = np.concatenate([x, np.zeros(len(w) - len(x))]) if tail else x
    if not tail:
        w = w[:len(x)]
    return d * (1 - wet) + w * wet * 1.0


def reverse_swell(x, rt60=3.0, seconds=1.5, seed=3):
    """倒放殘響：把 x 的殘響尾巴倒過來，接在 x 前面（吸氣般的預捲）"""
    ir = make_ir(rt60, bright=0.6, pre=0.0, seed=seed)
    w = sg.fftconvolve(x[:sec(0.6)], ir)
    w = w[:sec(seconds)][::-1]
    w = fade(w, fin=seconds * 0.4, shape='lin')
    return w


# ───────────────────────── 循環 ─────────────────────────
def loopify(x, length, xfade):
    """把 x（長度 >= length + xfade）做成 length 秒的無縫循環：尾端 xfade 秒以等功率交叉淡化到開頭"""
    L, X = sec(length), sec(xfade)
    assert len(x) >= L + X, (len(x) / SR, length, xfade)
    y = x[:L].copy()
    t = np.linspace(0, 1, X, endpoint=False)
    y[:X] = x[:X] * np.sin(t * np.pi / 2) + x[L:L + X] * np.cos(t * np.pi / 2)
    return y


# ───────────────────────── 量測 ─────────────────────────
_KB1 = (np.array([1.53512485958697, -2.69169618940638, 1.19839281085285]), np.array([1.0, -1.69065929318241, 0.73248077421585]))
_KB2 = (np.array([1.0, -2.0, 1.0]), np.array([1.0, -1.99004745483398, 0.99007225036621]))


def lufs(x):
    """BS.1770 積分響度（單聲道視為一個聲道；loop 也適用）"""
    chans = [x] if x.ndim == 1 else list(x)
    ms = None
    blk, hop = sec(0.4), sec(0.1)
    for c in chans:
        y = sg.lfilter(*_KB2, sg.lfilter(*_KB1, c))
        if len(y) < blk:
            y = pad_to(y, blk)
        m = np.array([np.mean(y[i:i + blk] ** 2) for i in range(0, len(y) - blk + 1, hop)])
        ms = m if ms is None else ms + m
    L = -0.691 + 10 * np.log10(ms + 1e-20)
    g = ms[L > -70]
    if not len(g):
        return -99.0
    rel = -0.691 + 10 * np.log10(np.mean(g)) - 10
    g2 = ms[(L > -70) & (L > rel)]
    return float(-0.691 + 10 * np.log10(np.mean(g2) + 1e-20))


def short_term_max(x):
    """3 秒視窗的最大短期響度"""
    y = sg.lfilter(*_KB2, sg.lfilter(*_KB1, x if x.ndim == 1 else x.mean(0)))
    w = sec(3.0)
    if len(y) <= w:
        return -0.691 + 10 * np.log10(np.mean(y ** 2) + 1e-20)
    c = np.cumsum(np.concatenate([[0], y ** 2]))
    m = (c[w:] - c[:-w]) / w
    return float(-0.691 + 10 * np.log10(np.max(m) + 1e-20))


def measure(x, loop=False):
    m = x if x.ndim == 1 else x.mean(0)
    a = np.abs(m)
    pk = peak(x)
    th = pk * undb(-50)
    nz = np.nonzero(a > th)[0]
    head = nz[0] / SR if len(nz) else 0
    tail = (len(m) - 1 - nz[-1]) / SR if len(nz) else 0
    S = np.abs(np.fft.rfft(m * np.hanning(len(m)))) ** 2
    fr = np.fft.rfftfreq(len(m), 1 / SR)
    low = float(np.sum(S[fr < 60]) / (np.sum(S) + 1e-20))
    rep = {
        'seconds': round(len(m) / SR, 3), 'peak_db': round(db(pk), 2), 'lufs': round(lufs(x), 1),
        'st_max': round(short_term_max(x), 1), 'dc': round(float(np.mean(m)), 6), 'head_s': round(head, 3), 'tail_s': round(tail, 3),
        'low_lt60': round(low, 3), 'clip': int(np.sum(np.abs(x) >= 0.999)),
    }
    if loop:
        # 接縫：尾端 20 ms 與開頭 20 ms 的 RMS 比、以及接點的樣本跳動相對局部 RMS
        w = sec(0.02)
        r1, r2 = rms(m[-w:]), rms(m[:w])
        jump = abs(m[0] - m[-1]) / (rms(m[-sec(0.2):]) + 1e-9)
        d = np.abs(np.diff(m))
        typical = np.percentile(d, 99.9)
        rep['seam_rms_ratio_db'] = round(db(r2 / (r1 + 1e-12)), 2)
        rep['seam_jump_vs_rms'] = round(float(jump), 3)
        rep['seam_jump_vs_p999_diff'] = round(float(abs(m[0] - m[-1]) / (typical + 1e-12)), 3)
    return rep


def save_report(path, rep):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(rep, f, ensure_ascii=False, indent=1)
