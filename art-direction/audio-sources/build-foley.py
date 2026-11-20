# 環境與擬音組（foley）的素材處理流程：把 _raw/foley/ 的原始下載（Freesound HQ 預覽、VSCO-2-CE）做成遊戲用的 Ogg。
# 用法：python -I art-direction/audio-sources/build-foley.py [配方名稱 ...]     （不帶參數 = 全部重做）
# 需要 ffmpeg、numpy、scipy。輸出到 public/assets/audio/amb/ 與 public/assets/audio/foley/，中間檔在 _work/foley/。
# 每個成品的來源與授權寫在 ledger-foley.json（由 manifest*.json 的授權檢查結果產生）。
import sys, os, json, glob, subprocess
import numpy as np
from scipy import signal

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
SR = 48000
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
RAW = os.path.join(HERE, '_raw', 'foley')
WORK = os.path.join(HERE, '_work', 'foley')
OUT = os.path.join(ROOT, 'public', 'assets', 'audio')
os.makedirs(WORK, exist_ok=True)
rng = np.random.default_rng(20261120)

# ───────────────────────── 讀寫 ─────────────────────────
def load(name, mono=True, start=0, dur=None):
    """name：Freesound 編號（'476645'）或 _raw/foley/ 底下的相對路徑。回傳 float32 [n] 或 [n, 2]"""
    p = name if os.path.isabs(name) else os.path.join(RAW, name if '.' in name else name + '.mp3')
    cmd = ['ffmpeg', '-v', 'error']
    if start: cmd += ['-ss', str(start)]
    if dur: cmd += ['-t', str(dur)]
    cmd += ['-i', p, '-f', 'f32le', '-ar', str(SR), '-ac', '1' if mono else '2', '-']
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    x = np.frombuffer(raw, np.float32).astype(np.float64)
    return x if mono else x.reshape(-1, 2)

def write_ogg(x, rel, q=4):
    """rel：相對 public/assets/audio/（例如 'foley/step_wood_01.ogg'）"""
    x = np.asarray(x, np.float64)
    pk = np.abs(x).max()
    assert pk < 0.98, f'{rel}: 峰值 {pk:.3f} 太高'
    tmp = os.path.join(WORK, os.path.basename(rel).replace('.ogg', '.wav'))
    from scipy.io import wavfile
    wavfile.write(tmp, SR, x.astype(np.float32))
    dst = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp, '-c:a', 'libvorbis', '-q:a', str(q), '-ar', str(SR), dst], check=True)
    return dst

# ───────────────────────── 濾波 ─────────────────────────
def _sos(kind, f, order=2):
    return signal.butter(order, f, btype=kind, fs=SR, output='sos')
def hp(x, f, order=2): return signal.sosfiltfilt(_sos('highpass', f, order), x, axis=0)
def lp(x, f, order=2): return signal.sosfiltfilt(_sos('lowpass', f, order), x, axis=0)
def bp(x, f1, f2, order=2): return signal.sosfiltfilt(_sos('bandpass', [f1, f2], order), x, axis=0)
def shelf(x, f, db, kind='low'):
    """一階搁架（以分頻相加近似）：低頻或高頻增減 db"""
    g = 10 ** (db / 20) - 1
    part = lp(x, f, 1) if kind == 'low' else hp(x, f, 1)
    return x + g * part
def peq(x, f, db, q=1.0):
    A = 10 ** (db / 40); w = 2 * np.pi * f / SR; al = np.sin(w) / (2 * q)
    b = [1 + al * A, -2 * np.cos(w), 1 - al * A]; a = [1 + al / A, -2 * np.cos(w), 1 - al / A]
    return signal.filtfilt(b, a, x, axis=0)

def dc(x): return hp(x, 25, 2)

# ───────────────────────── 量測 ─────────────────────────
def kweight(x):
    b1, a1 = [1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585]
    b2, a2 = [1.0, -2.0, 1.0], [1, -1.99004745483398, 0.99007225036621]
    return signal.lfilter(b2, a2, signal.lfilter(b1, a1, x, axis=0), axis=0)

def _e2(y):
    return y ** 2 if y.ndim == 1 else np.sum(y ** 2, axis=1)

def loud_blocks(x, win=0.4, hop=0.1):
    y = _e2(kweight(x)); w = int(win * SR); h = int(hop * SR)
    if len(y) <= w: return np.array([np.mean(y)])
    c = np.concatenate([[0], np.cumsum(y)])
    idx = np.arange(0, len(y) - w, h)
    return (c[idx + w] - c[idx]) / w

def lufs(x):
    e = loud_blocks(x)
    l = -0.691 + 10 * np.log10(e + 1e-15)
    g = e[l > -70]
    if not len(g): return -99.0
    rel = -0.691 + 10 * np.log10(np.mean(g)) - 10
    g2 = e[(l > -70) & (l > rel)]
    return float(-0.691 + 10 * np.log10(np.mean(g2) + 1e-15))

def momentary_max(x):
    e = loud_blocks(x)
    return float(-0.691 + 10 * np.log10(np.max(e) + 1e-15))

def peak_db(x): return float(20 * np.log10(np.abs(x).max() + 1e-12))

def band_share(x, f=120):
    m = x if x.ndim == 1 else x.mean(axis=1)
    fr, P = signal.welch(m, SR, nperseg=min(8192, len(m)))
    return float(P[fr < f].sum() / (P.sum() + 1e-20))

def env(x, ms=5):
    n = max(1, int(SR * ms / 1000))
    y = _e2(x)
    return np.sqrt(np.convolve(y, np.ones(n) / n, 'same'))

# ───────────────────────── 編輯 ─────────────────────────
def fade(x, a=0.002, b=0.02):
    x = x.copy(); na = min(int(a * SR), len(x) // 2); nb = min(int(b * SR), len(x) // 2)
    if na: x[:na] *= (np.sin(np.linspace(0, np.pi / 2, na)) ** 2)[:, None] if x.ndim == 2 else np.sin(np.linspace(0, np.pi / 2, na)) ** 2
    if nb: x[-nb:] *= (np.cos(np.linspace(0, np.pi / 2, nb)) ** 2)[:, None] if x.ndim == 2 else np.cos(np.linspace(0, np.pi / 2, nb)) ** 2
    return x

def trim(x, thr_db=-48, pre=0.004, post_db=None, min_len=0.05, tail=0.03):
    """去頭尾靜音：門檻相對峰值。post_db 可另外指定尾端門檻（較低＝保留較長的尾韻）"""
    e = env(x, 3); pk = e.max() + 1e-12
    on = np.where(e > pk * 10 ** (thr_db / 20))[0]
    if not len(on): return x
    off = np.where(e > pk * 10 ** ((post_db if post_db is not None else thr_db) / 20))[0]
    s = max(0, on[0] - int(pre * SR)); t = min(len(x), off[-1] + int(tail * SR))
    t = max(t, s + int(min_len * SR))
    return fade(x[s:t], 0.0015, min(0.03, (t - s) / SR * 0.3))

def norm_peak(x, db=-1.0): return x * (10 ** (db / 20) / (np.abs(x).max() + 1e-12))

def norm_lufs(x, target, ceiling=-1.0, mode='integrated'):
    cur = lufs(x) if mode == 'integrated' else momentary_max(x)
    y = x * 10 ** ((target - cur) / 20)
    pk = np.abs(y).max()
    if pk > 10 ** (ceiling / 20): y *= 10 ** (ceiling / 20) / pk
    return y

def onsets(x, thr_db=-30, min_gap=0.18, ms=4, rise_db=10):
    """能量包絡的起音點：比前 40 ms 的最低點高出 rise_db 且超過門檻（相對整體峰值）"""
    e = 20 * np.log10(env(x, ms) + 1e-9); top = e.max(); res = []; gap = int(min_gap * SR); look = int(0.04 * SR)
    i = look
    while i < len(e):
        if e[i] > top + thr_db and e[i] - e[i - look:i].min() > rise_db:
            j = i + int(0.03 * SR); k = i + int(np.argmax(e[i:j]))
            res.append(max(0, i - int(0.006 * SR))); i = k + gap
        else: i += 1
    return res

def slices(x, idx, max_len=0.6, thr_db=-42, double_after=0.14, double_db=-7, quiet=0.05):
    """每個起音點切一段：起點對齊到主瞬態前 5 ms；結尾是包絡第一次連續 quiet 秒低於峰值 thr_db 的地方。
    之後出現 ≥ double_db 的第二個瞬態（double_after 秒以後）＝兩步黏在一起，丟掉。"""
    out = []
    for n, s in enumerate(idx):
        t = min(len(x), s + int(max_len * SR), (idx[n + 1] - int(0.01 * SR)) if n + 1 < len(idx) else len(x))
        seg = x[s:t]
        if len(seg) < int(0.08 * SR): continue
        e = env(seg, 2); pk = e.max(); ip = int(np.argmax(e))
        first = int(np.argmax(e > pk * 0.1))            # 第一個超過峰值 −20 dB 的點
        a = max(0, first - int(0.005 * SR))
        if ip - first > int(0.07 * SR): continue        # 主瞬態之前拖著一段雜音
        # 結尾：峰值之後第一次連續 quiet 秒低於門檻
        below = e < pk * 10 ** (thr_db / 20); q = int(quiet * SR); end = len(seg)
        run = 0
        for i in range(ip, len(seg)):
            run = run + 1 if below[i] else 0
            if run >= q: end = i - q + int(0.015 * SR); break
        seg2 = seg[a:end]
        if len(seg2) < int(0.06 * SR): continue
        e2 = env(seg2, 2); da = int(double_after * SR)
        if len(e2) > da and e2[da:].max() > e2.max() * 10 ** (double_db / 20): continue
        out.append(fade(seg2, 0.0015, min(0.025, len(seg2) / SR * 0.25)))
    return out

def pick_best(segs, n, prefer=None):
    """選音量最接近中位數、長度合理、起音乾淨的 n 個"""
    if not segs: return []
    pk = np.array([peak_db(s) for s in segs]); med = np.median(pk)
    score = np.abs(pk - med) + np.array([0 if 0.12 < len(s) / SR < 0.9 else 6 for s in segs])
    order = np.argsort(score)
    return [segs[i] for i in order[:n]]

def stationary_start(x, dur, hop=0.5, avoid=()):
    """找最平穩（沒有突發聲）的一段：短時響度的 (最大值 − 中位數) + 標準差 最小"""
    e = 10 * np.log10(loud_blocks(x, 0.4, 0.1) + 1e-12)
    n = int(dur / 0.1); best, bs = 1e9, 0
    for i in range(0, len(e) - n, int(hop / 0.1)):
        t0 = i * 0.1
        if any(a <= t0 <= b or a <= t0 + dur <= b for a, b in avoid): continue
        w = e[i:i + n]; sc = (w.max() - np.median(w)) + np.std(w)
        if sc < best: best, bs = sc, i
    return bs * 0.1

def limit(x, ceiling_db=-12.0, release=0.06):
    """簡單的前瞻峰值限制器：把突出的瞬態（例如滴水）壓到 ceiling 以下，其餘不動"""
    c = 10 ** (ceiling_db / 20); w = int(0.004 * SR)
    a = np.abs(x) if x.ndim == 1 else np.abs(x).max(axis=1)
    from scipy.ndimage import maximum_filter1d
    pk = maximum_filter1d(a, size=2 * w + 1)
    g = np.minimum(1.0, c / (pk + 1e-12))
    k = np.exp(-1 / (release * SR)); out = np.empty_like(g); cur = 1.0
    for i in range(len(g)):
        cur = g[i] if g[i] < cur else g[i] + (cur - g[i]) * k
        out[i] = cur
    return x * (out if x.ndim == 1 else out[:, None])

def make_loop(x, dur, xf=1.5):
    """取 dur + xf 秒，把尾端 xf 秒以等功率交叉淡化進開頭 → 長度 dur 的無縫循環"""
    n = int(dur * SR); m = int(xf * SR)
    assert len(x) >= n + m, f'素材太短：{len(x) / SR:.1f}s < {dur + xf:.1f}s'
    y = x[:n].copy(); tail = x[n:n + m]
    a = np.sin(np.linspace(0, np.pi / 2, m)) ** 2
    if y.ndim == 2: a = a[:, None]
    # 等功率（不相關的噪音床）：sqrt 曲線
    ai, ao = np.sqrt(a), np.sqrt(1 - a)
    y[:m] = y[:m] * ai + tail * ao
    return y

def loop_seam(y):
    """循環接點：最後 / 最前 20 ms 的 RMS 比、接點的取樣跳動相對局部 RMS"""
    w = int(0.02 * SR)
    a, b = y[-w:], y[:w]
    ra, rb = np.sqrt(np.mean(a ** 2)) + 1e-12, np.sqrt(np.mean(b ** 2)) + 1e-12
    jump = np.abs(y[0] - y[-1]).max() if y.ndim == 2 else abs(y[0] - y[-1])
    local = np.sqrt(np.mean(np.concatenate([a, b]) ** 2)) + 1e-12
    d = np.abs(np.diff(np.concatenate([a, b]), axis=0))
    return dict(rms_ratio_db=float(20 * np.log10(ra / rb)), jump_rel=float(jump / local), diff_max_rel=float(d.max() / (np.abs(np.diff(y, axis=0)).mean() * 8 + 1e-12)))

def mix(*parts):
    n = max(len(p) for p, _ in parts if p is not None)
    out = np.zeros(n)
    for p, g in parts:
        if p is None: continue
        out[:len(p)] += p * g
    return out

def at(x, n, offset):
    y = np.zeros(n); s = int(offset * SR); y[s:s + len(x)] += x[:max(0, n - s)]; return y

def resample(x, ratio):
    """改變播放速度（音高一起變）：ratio > 1 變快變高"""
    n = int(len(x) / ratio)
    return signal.resample(x, n, axis=0)

def reverb(x, rt=1.2, wet=0.25, pre=0.01, seed=1, lpf=5000):
    """簡單的指數衰減噪音脈衝響應（只用在離線做『遠處』的質感，例如誦經在空殿裡）"""
    r = np.random.default_rng(seed); n = int(rt * 1.4 * SR)
    t = np.arange(n) / SR
    ir = r.standard_normal(n) * np.exp(-6.9 * t / rt)
    ir = lp(ir, lpf, 1); ir[: int(pre * SR)] = 0; ir /= np.sqrt(np.sum(ir ** 2))
    y = signal.fftconvolve(x, ir)
    dry = np.concatenate([x, np.zeros(len(y) - len(x))])
    return dry * (1 - wet) + y * wet

# ───────────────────────── 配方 ─────────────────────────
RECIPES = {}
def recipe(fn): RECIPES[fn.__name__] = fn; return fn
LEDGER = {}   # 成品檔 → [來源編號], notes
def credit(files, sources, notes):
    for f in files if isinstance(files, list) else [files]: LEDGER[f] = dict(sources=sources, notes=notes)

REPORT = []
def report(rel, x, kind='oneshot'):
    row = dict(file=rel, dur=round(len(x) / SR, 3), peak=round(peak_db(x), 1), lufs=round(lufs(x), 1), mmax=round(momentary_max(x), 1), low120=round(band_share(x), 3))
    if kind == 'loop': row.update(seam=loop_seam(x))
    REPORT.append(row)
    print(f"  {rel:42} {row['dur']:6.2f}s pk {row['peak']:5.1f} lufs {row['lufs']:6.1f} mmax {row['mmax']:6.1f} <120Hz {row['low120']:.2f}" + (f" seam {row['seam']['rms_ratio_db']:+.1f}dB jump {row['seam']['jump_rel']:.2f}" if kind == 'loop' else ''))

def emit(rel, x, sources, notes, kind='oneshot', q=4):
    write_ogg(x, rel, q)
    report(rel, x, kind)
    credit(rel, sources, notes)

def contact(name, clips, gap=0.25):
    """把一組片段串起來輸出成 WAV + 波形／頻譜圖（_work/foley/png/），讓人（或 Claude）用眼睛檢查切得對不對"""
    parts = []
    for c in clips:
        m = c if c.ndim == 1 else c.mean(axis=1)
        parts += [m, np.zeros(int(gap * SR))]
    y = np.concatenate(parts) if parts else np.zeros(SR)
    os.makedirs(os.path.join(WORK, 'png'), exist_ok=True)
    from scipy.io import wavfile
    wp = os.path.join(WORK, 'png', name + '.wav'); wavfile.write(wp, SR, (y / (np.abs(y).max() + 1e-9) * 0.9).astype(np.float32))
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wp, '-filter_complex', 'showwavespic=s=1600x200:scale=lin', os.path.join(WORK, 'png', name + '_w.png')], check=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wp, '-lavfi', 'showspectrumpic=s=1600x300:legend=0:scale=log:stop=12000', os.path.join(WORK, 'png', name + '_s.png')], check=True)

# ───────────────────────── 腳步 ─────────────────────────
STEP_TARGET = -22.0  # 每一步的 400 ms 瞬時響度上限（LUFS）；之後在遊戲裡依材質再配平

def crest(s): return peak_db(s) - 20 * np.log10(np.sqrt(np.mean(s ** 2)) + 1e-12)

def steps_from(sources, n, thr=-32, gap=0.22, max_len=0.5, hpf=60, lpf=None, prep=None, min_crest=11):
    segs = []
    for sid in sources:
        x = dc(load(sid))
        if hpf: x = hp(x, hpf)
        if lpf: x = lp(x, lpf)
        if prep: x = prep(sid, x)
        idx = onsets(x, thr_db=thr, min_gap=gap)
        segs += [(sid, s) for s in slices(x, idx, max_len=max_len) if crest(s) >= min_crest]
    pk = np.array([peak_db(s) for _, s in segs]); med = np.median(pk)
    ln = np.array([len(s) / SR for _, s in segs])
    score = np.abs(pk - med) + (ln < 0.12) * 8 + (ln > max_len * 0.98) * 2
    order = np.argsort(score)
    chosen, used = [], {}
    for i in order:   # 每個來源輪流挑，避免全部來自同一段錄音
        sid = segs[i][0]
        if used.get(sid, 0) >= int(np.ceil(n / len(sources))) + 1: continue
        chosen.append(segs[i]); used[sid] = used.get(sid, 0) + 1
        if len(chosen) >= n: break
    return chosen

def emit_steps(surface, chosen, notes, extra_gain=0.0, n=7, quiet_ok=4.0, ceiling=-3.5):
    files = []
    clips = []
    ys = [(sid, norm_lufs(s, STEP_TARGET + extra_gain, ceiling=ceiling, mode='momentary')) for sid, s in chosen]   # 峰值上限 −3.5：瞬態特別尖的那一步不會突兀
    good = [(sid, y) for sid, y in ys if momentary_max(y) > STEP_TARGET + extra_gain - quiet_ok]   # 被峰值卡住、聽起來太小聲的丟掉
    for old in glob.glob(os.path.join(OUT, 'foley', f'step_{surface}_*.ogg')): os.remove(old)
    for k, (sid, y) in enumerate(good[:n], 1):
        rel = f'foley/step_{surface}_{k:02d}.ogg'
        emit(rel, y, [sid], notes)
        files.append(rel); clips.append(y)
    assert len(files) >= 6, f'{surface}: 只剩 {len(files)} 個可用的腳步'
    contact('steps_' + surface, clips)
    return files

@recipe
def steps_wood():
    ch = steps_from(['459970'], 14, thr=-34, gap=0.25, max_len=0.5, hpf=45)
    emit_steps('wood', ch, '中空木地板上的腳步（寺廟架高的老木地板），由一段連續走路的錄音切出單步，去 DC、正規化')

@recipe
def steps_stone():
    ch = steps_from(['521590', '813622', '757207', '117631'], 24, thr=-30, gap=0.22, max_len=0.42, hpf=70)
    emit_steps('stone', ch, '石板／水泥地上的腳步，切成單步、去 DC、正規化', quiet_ok=5.0)

@recipe
def steps_dirt():
    ch = steps_from(['853198', '445786'], 14, thr=-30, gap=0.22, max_len=0.42, hpf=70)
    emit_steps('dirt', ch, '泥土路上的腳步，切成單步、去 DC、正規化')

@recipe
def steps_gravel():
    ch = steps_from(['556002', '505831'], 14, thr=-30, gap=0.25, max_len=0.5, hpf=70)
    emit_steps('gravel', ch, '碎石路上的腳步，切成單步、去 DC、正規化')

@recipe
def steps_grass():
    ch = steps_from(['521587', '362249', '218305'], 14, thr=-30, gap=0.22, max_len=0.5, hpf=80)
    emit_steps('grass', ch, '雜草與落葉上的腳步（亂葬崗），切成單步、去 DC、正規化')

@recipe
def steps_floor():
    ch = steps_from(['208878', '260116'], 14, thr=-30, gap=0.25, max_len=0.45, hpf=60, min_crest=9)
    emit_steps('floor', ch, '住處：穿拖鞋走在室內地板上，切成單步、去 DC、正規化', ceiling=-6.0, quiet_ok=5.0)

@recipe
def steps_wet():
    ch = steps_from(['338106'], 11, thr=-30, gap=0.25, max_len=0.5, hpf=60)
    emit_steps('wet', ch, '濕的赤腳踩在磁磚上（寺內濕腳步），切成單步、去 DC、正規化', n=6)

# ───────────────────────── 寺廟劇中樂器 ─────────────────────────
ONESHOT = -18.0   # 一次性音效：400 ms 瞬時響度上限

def strike(n, f=180, dur=0.12, seed=3):
    """撞木打在銅鐘上的悶響（錄音開頭沒有敲擊瞬態時補上）：低通噪音 + 一點下滑的正弦"""
    r = np.random.default_rng(seed); t = np.arange(int(dur * SR)) / SR
    nz = lp(r.standard_normal(len(t)), 900, 2) * np.exp(-t / 0.025)
    sn = np.sin(2 * np.pi * (f * t - 30 * t * t)) * np.exp(-t / 0.05)
    y = np.zeros(n); k = min(n, len(t)); y[:k] = (nz * 0.6 + sn * 0.5)[:k]
    return y

@recipe
def temple_bell():
    x = dc(load('668647', start=0, dur=10.5))
    x = hp(x, 70)
    n = int(6.0 * SR); x = x[:n]
    t = np.arange(n) / SR
    x = x * np.where(t < 3.5, 1.0, np.cos(np.clip((t - 3.5) / 2.5, 0, 1) * np.pi / 2) ** 2)   # 3.5 秒後自然收尾（遠處聽不到更長的尾巴）
    x = x + strike(n) * np.abs(x[:2000]).max() * 0.9
    x = fade(x, 0.006, 0.05)
    emit('foley/bell_temple.ogg', norm_lufs(x, ONESHOT - 2, mode='momentary'), ['668647'], '大型銅鐘（遠處的廟鐘）：取前 6 秒、3.5 秒後淡出，開頭補一記撞木的悶響；遊戲裡與原本的程序化鐘聲疊加')

@recipe
def inkin():
    x = dc(load('555439', dur=6.0)); x = hp(x, 300)
    n = int(5.5 * SR); x = x[:n]; t = np.arange(n) / SR
    x *= np.where(t < 3, 1, np.cos(np.clip((t - 3) / 2.5, 0, 1) * np.pi / 2) ** 2)
    a = trim(x, -50, pre=0.002, post_db=-80)
    emit('foley/inkin_01.ogg', norm_lufs(fade(a, 0.002, 0.08), ONESHOT, mode='momentary'), ['555439'], '引磬（日本「印金」，同類的手持小磬）一擊，5.5 秒自然衰減')

@recipe
def woodfish():
    """woodfish_01..03：同一個木魚（muyu）的三種敲擊；woodfish_04：日本木魚（布槌）。遊戲裡一段敲擊只用同一個樂器"""
    z = dc(load('205999')); z = hp(z, 180)
    zs = slices(z, onsets(z, -20, 0.4), max_len=0.45, thr_db=-44, double_after=0.25, quiet=0.03)
    zs = sorted(zs, key=lambda s: -peak_db(s))[1:6]
    zs = sorted(zs, key=lambda s: -len(s))[:3]
    x = dc(load('607215')); x = hp(x, 150)
    hits = [('205999', s) for s in zs] + [('607215', trim(x[: int(0.55 * SR)], -45, post_db=-40))]
    clips = []
    for old in glob.glob(os.path.join(OUT, 'foley', 'woodfish_*.ogg')): os.remove(old)
    for k, (sid, s) in enumerate(hits, 1):
        y = norm_lufs(fade(s, 0.001, 0.03), ONESHOT, mode='momentary')
        emit(f'foley/woodfish_{k:02d}.ogg', y, [sid], '木魚單擊（切自連續敲擊的錄音），去低頻與 DC、正規化；遊戲裡依原本的節奏排程')
        clips.append(y)
    contact('woodfish', clips)

@recipe
def chant():
    """空殿裡隱約的誦經：取連續的男聲誦經，低通（隔著牆、樓板）、帶一點殘響，前後淡入淡出"""
    x = dc(load('383167'))
    x = hp(x, 140); x = lp(x, 2400, 2); x = peq(x, 260, 3, 0.9)
    clips = []
    for old in glob.glob(os.path.join(OUT, 'foley', 'chant_*.ogg')): os.remove(old)
    for k, (s0, d) in enumerate([(51.5, 5.4), (92.0, 5.4)], 1):
        seg = x[int(s0 * SR): int((s0 + d) * SR)]
        seg = reverb(seg, rt=1.6, wet=0.22, seed=k, lpf=2200)[: len(seg) + int(0.6 * SR)]
        seg = fade(seg, 0.9, 1.6)
        y = norm_lufs(seg, -24, mode='integrated')
        emit(f'foley/chant_{k:02d}.ogg', y, ['383167'], '男聲誦經（福州南少林寺）片段：高通 140 Hz、低通 2.4 kHz（隔著牆）、輕微殘響、前後淡入淡出', q=3)
        clips.append(y)
    contact('chant', clips)

# ───────────────────────── 環境床（無縫循環，單聲道；遊戲裡兩個偏移位置左右各一條） ─────────────────────────
BED = -30.0
def bed(rel, src, start, dur, sources, notes, hpf=90, lpf=None, xf=2.0, extra=None, eq=None, search=None, limit_db=None):
    """search=(a, b)：在 a~b 秒之間自動找最平穩的一段（沒有突發的碰撞聲）"""
    if search:
        probe = dc(load(src, start=search[0], dur=search[1] - search[0]))
        start = search[0] + stationary_start(hp(probe, hpf), dur + xf + 0.5)
    x = dc(load(src, start=start, dur=dur + xf + 0.5))
    x = hp(x, hpf, 2)
    if lpf: x = lp(x, lpf, 2)
    if eq: x = eq(x)
    if extra is not None: x = x[: len(extra)] + extra[: len(x)]
    if limit_db is not None: x = limit(x * 10 ** ((-30 - lufs(x)) / 20), limit_db)
    y = make_loop(x, dur, xf)
    y = norm_lufs(y, BED, ceiling=-6)
    emit(rel, y, sources, notes + f'（取 {start:.1f}s 起 {dur:.0f} 秒，{xf:.0f} 秒交叉淡化成無縫循環，正規化到約 −30 LUFS）', kind='loop', q=3)
    return start

@recipe
def bed_temple_night():
    bed('amb/temple_night.ogg', '476645', 0, 13, ['476645'], '寺廟外的山林夜：台灣嘉義梅山山區夏夜（細雨、蟲鳴、遠處的蛙）', hpf=110, search=(175, 240))

@recipe
def bed_temple_hall():
    rt = dc(load('788451', start=20, dur=20)); rt = lp(hp(rt, 80), 900, 2); rt = rt * 10 ** ((-30 - lufs(rt)) / 20) * 0.3   # 空間底噪只取低中頻（原錄音很小聲，拉高會把麥克風的嘶聲帶上來）
    bed('amb/temple_hall.ogg', '557380', 0, 11, ['557380', '788451'], '殿內：空教堂窗邊的風嘯（風從縫隙灌進來）疊上空教堂的空間底噪', hpf=70, extra=rt, search=(5, 100))

@recipe
def bed_temple_crypt():
    bed('amb/temple_crypt.ogg', '392668', 0, 9, ['392668'], '地下封印室：洞穴裡的滴水與潮濕的空氣（突出的水滴瞬態以限制器壓低）', hpf=90, xf=2.0, search=(0, 19.5), limit_db=-16)

@recipe
def bed_temple_grave():
    bed('amb/temple_grave.ogg', '853993', 0, 11, ['853993'], '亂葬崗：夜風吹過樹林、乾葉沙沙作響，遠處零星的蟲鳴', hpf=100, search=(150, 300))

@recipe
def bed_road_night():
    bed('amb/road_night.ogg', '668654', 0, 14, ['668654'], '山村舊路：村莊外圍、靠近樹林的夜（蟋蟀、遠處的蟲、微風）', hpf=100, search=(5, 100))

@recipe
def bed_home_rain():
    bed('amb/home_rain.ogg', '669486', 0, 14, ['669486'], '住處：屋內聽到的雨打在窗上', hpf=120, search=(2, 56))

@recipe
def bed_home_city():
    bed('amb/home_city.ogg', '219877', 0, 10, ['219877'], '住處：凌晨三點遠方城市的低鳴（窗外）', hpf=60, lpf=1800, search=(10, 560))

@recipe
def bed_home_fridge():
    bed('amb/home_fridge.ogg', '740110', 0, 6, ['740110'], '住處：冰箱壓縮機的低哼', hpf=60, xf=1.0, search=(0.5, 11))

# ───────────────────────── 一次性擬音 ─────────────────────────
def clear(prefix):
    for old in glob.glob(os.path.join(OUT, prefix + '*.ogg')): os.remove(old)

def series(name, items, notes, target=ONESHOT, sheet=True, q=4):
    """items：[(來源編號, 片段)]；輸出 foley/<name>_01.ogg …"""
    clear('foley/' + name + '_')
    clips = []
    for k, (sid, x) in enumerate(items, 1):
        y = norm_lufs(x, target, ceiling=-1.0, mode='momentary')
        emit(f'foley/{name}_{k:02d}.ogg', y, [sid] if isinstance(sid, str) else sid, notes, q=q)
        clips.append(y)
    if sheet: contact(name, clips)

def cut(sid, a, b, hpf=80, lpf=None, thr=-50, post=-60):
    x = dc(load(sid, start=a, dur=b - a)); x = hp(x, hpf)
    if lpf: x = lp(x, lpf)
    return trim(x, thr, pre=0.003, post_db=post)

def hits(sid, n, thr=-26, gap=0.25, max_len=0.6, hpf=80, lpf=None, tail_db=-40, start=0, dur=None, double_after=0.2, pick='loud'):
    x = dc(load(sid, start=start, dur=dur)); x = hp(x, hpf)
    if lpf: x = lp(x, lpf)
    ss = slices(x, onsets(x, thr, gap), max_len=max_len, thr_db=tail_db, double_after=double_after)
    if pick == 'loud': ss = sorted(ss, key=lambda s: -peak_db(s))
    elif pick == 'median':
        med = np.median([peak_db(s) for s in ss]); ss = sorted(ss, key=lambda s: abs(peak_db(s) - med))
    return [(sid, s) for s in ss[:n]]

def vsco(rel): return os.path.join(RAW, 'vsco', rel)

@recipe
def creaks():
    series('creak_floor', [(sid, cut(sid, 0, 3, hpf=120, thr=-45, post=-48)) for sid in ['802574', '802577', '802579', '802580', '802597']],
           '老木地板被踩到時的吱嘎（短），去低頻、去頭尾、正規化')
    series('creak_long', [('802595', fade(cut('802595', 0, 2.4, hpf=110, thr=-45, post=-50), 0.005, 0.25)), ('802593', cut('802593', 0, 2.2, hpf=110, thr=-45, post=-50))],
           '木構造慢慢被壓出來的長吱嘎（樑柱、樓板），去低頻、去頭尾、正規化')

@recipe
def doors():
    a = cut('710510', 0, 3.0, hpf=150, thr=-50, post=-55)
    b = cut('764798', 0, 3.6, hpf=150, thr=-50, post=-55)
    series('door_creak', [('710510', fade(a, 0.01, 0.2))], '舊木門被推開時門軸的長吱嘎', target=ONESHOT - 1)
    ks = hits('494569', 3, thr=-24, gap=0.15, max_len=0.35, hpf=120, tail_db=-36, double_after=0.12) + hits('541492', 3, thr=-24, gap=0.15, max_len=0.35, hpf=120, tail_db=-36, double_after=0.12)
    series('knock', ks[:5], '指節敲在木門板上的單一下（切自連續敲門的錄音）；遊戲裡排成「叩、叩、叩」')
    kd = hits('256513', 3, thr=-22, gap=0.18, max_len=0.45, hpf=60, tail_db=-38, double_after=0.14)
    series('knock_door', kd, '住處的門：拳頭敲在實心門板上（較重、較低）的單一下')
    sl = [('232931', fade(cut('232931', 0, 2.2, hpf=60, thr=-50, post=-58)[: int(1.6 * SR)], 0.002, 0.4)), ('389811', fade(cut('389811', 0, 2.0, hpf=60, thr=-50, post=-58)[: int(1.6 * SR)], 0.002, 0.4))]
    series('slam', sl, '木門被甩上：門板撞擊、門框的餘震', target=ONESHOT + 1)
    sc = [('735345', fade(cut('735345', 0.3, 2.6, hpf=90, thr=-46, post=-50), 0.03, 0.12)), ('832998', fade(cut('832998', 0.2, 2.4, hpf=90, thr=-46, post=-50), 0.03, 0.12))]
    series('scrape', sc, '木椅腳在地板上被拖動（黏滑、頓挫）', target=ONESHOT - 1)

@recipe
def drips():
    items = [('842164', cut('842164', 0, 0.7, hpf=300, thr=-55, post=-55)),
             ('166325', cut('166325', 0, 0.7, hpf=300, thr=-55, post=-55)), ('533146', cut('533146', 0, 0.6, hpf=300, thr=-55, post=-55))]
    items += hits('234554', 2, thr=-20, gap=0.4, max_len=0.5, hpf=300, tail_db=-45)
    series('drip', items, '水滴落下（地下室、天花板滲水），去低頻、去頭尾、正規化', target=ONESHOT - 2)

@recipe
def marbles():
    a = cut('628994', 0, 3.6, hpf=200, thr=-50, post=-60)          # 一把彈珠落地彈跳
    r = cut('707545', 0, 3.0, hpf=200, thr=-55, post=-60)          # 一顆彈珠滾過木地板
    b = cut('646755', 0, 1.6, hpf=200, thr=-50, post=-60)
    one = mix((b, 1.0), (at(r, len(b) + int(1.6 * SR), len(b) / SR - 0.15), 0.5))
    series('marble', [(['646755', '707545'], fade(one[: int(3.4 * SR)], 0.002, 0.4))], '樓上的彈珠：落在木地板上越彈越密，最後滾走', target=ONESHOT - 1)

@recipe
def statics():
    s1 = cut('552160', 2.0, 3.6, hpf=250, lpf=6000, thr=-60, post=-60)
    s2 = cut('724710', 4.0, 5.4, hpf=250, lpf=6000, thr=-60, post=-60)
    s3 = cut('552160', 9.0, 10.4, hpf=250, lpf=6000, thr=-60, post=-60)
    series('static', [('552160', fade(s1, 0.01, 0.08)), ('724710', fade(s2, 0.01, 0.08))], '收音機／錄音帶的雜訊與爆裂（電話、錄音機裡）', target=ONESHOT - 2)
    x = dc(load('815869', start=0.5, dur=6.0)); x = lp(hp(x, 300), 7000)
    y = norm_lufs(make_loop(x, 2.5, 1.0), -24, ceiling=-3)
    emit('foley/tape_loop.ogg', y, ['815869'], '類比錄音帶的底噪與細碎爆裂，無縫循環（阿哲手機的雜訊）', kind='loop', q=3)

@recipe
def phone_bits():
    v = dc(load('384487')); v = hp(v, 90)
    one = trim(v, -40, post_db=-45)[: int(1.4 * SR)]
    emit('foley/vibrate_01.ogg', norm_lufs(fade(one, 0.005, 0.05), ONESHOT - 2, mode='momentary'), ['384487'], '手機在硬桌面上震動一下')
    c1 = cut('502506', 0, 0.2, hpf=400, thr=-50, post=-55); c2 = cut('690300', 0, 0.25, hpf=400, thr=-50, post=-55)
    series('click', [('502506', c1), ('690300', c2)], '手電筒／開關按下去的喀一聲', target=ONESHOT - 3, sheet=False)

@recipe
def ringtone():
    """手機鈴聲：原創的短旋律（不用任何品牌鈴聲），木琴似的音色 + 手機小喇叭的頻寬與一點破音"""
    notes = [(0.0, 76), (0.14, 79), (0.28, 83), (0.42, 79), (0.70, 76), (0.84, 79), (0.98, 84), (1.12, 79)]
    n = int(1.7 * SR); y = np.zeros(n); t = np.arange(int(0.5 * SR)) / SR
    for t0, m in notes:
        f = 440 * 2 ** ((m - 69) / 12)
        tone = (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / 0.05) + 0.18 * np.sin(2 * np.pi * 3.98 * f * t) * np.exp(-t / 0.02)) * np.exp(-t / 0.16)
        tone[:48] *= np.linspace(0, 1, 48)
        s = int(t0 * SR); y[s:s + len(tone)] += tone[: n - s]
    y = np.tanh(1.6 * y) / 1.6
    y = bp(y, 650, 5200, 2); y = peq(y, 1800, 4, 1.2)
    y = fade(y, 0.002, 0.08)
    emit('foley/ringtone.ogg', norm_lufs(y, ONESHOT, mode='momentary'), ['synth'], '原創手機鈴聲（本專案程序合成：八個音的短句，模擬手機小喇叭的頻寬與失真），非任何品牌鈴聲')

@recipe
def finale_bits():
    lk = cut('734641', 0, 1.7, hpf=120, thr=-55, post=-60)
    emit('foley/lock_clunk.ogg', norm_lufs(fade(lk, 0.002, 0.15), ONESHOT, mode='momentary'), ['734641'], '沉重的門鎖：金屬栓彈開')
    bg = hits('637480', 2, thr=-22, gap=0.3, max_len=0.8, hpf=60, tail_db=-40, double_after=0.3)
    series('bang', bg, '從門的另一邊用力拍門（厚重的門板）', target=ONESHOT + 1)
    dr = cut('507473', 1.0, 3.6, hpf=100, thr=-55, post=-55)
    emit('foley/drag_01.ogg', norm_lufs(fade(dr, 0.05, 0.3), ONESHOT - 1, mode='momentary'), ['507473'], '身體／腳跟在地上被拖著走')
    cl = [('641383', cut('641383', 4.6, 5.8, hpf=180, thr=-45, post=-50)), ('641383', cut('641383', 6.2, 7.4, hpf=180, thr=-45, post=-50))]
    series('cloth', [(sid, fade(x[: int(1.1 * SR)], 0.01, 0.2)) for sid, x in cl], '布料摩擦、蓋下來的沙沙聲', target=ONESHOT - 2)
    sn = [('826338', cut('826338', 0.0, 2.5, hpf=150, thr=-45, post=-50))]
    sn += [('826338', cut('826338', 1.1, 2.5, hpf=150, thr=-45, post=-50))]
    series('snuff', [(sid, fade(x[: int(1.2 * SR)], 0.005, 0.2)) for sid, x in sn], '吹熄燭火（氣流與火焰的噗一聲）', target=ONESHOT - 2)

@recipe
def fire():
    x = dc(load('779877', start=20, dur=7)); x = hp(x, 70)
    y = norm_lufs(make_loop(x, 5.0, 1.5), -24, ceiling=-2)
    emit('foley/fire_loop.ogg', y, ['779877'], '近距離的木柴燃燒（爆裂、嘶嘶），無縫循環；結局火場與紙紮行的餘燼', kind='loop', q=4)
    p = hits('779877', 4, thr=-14, gap=0.3, max_len=0.35, hpf=300, tail_db=-30, start=40, dur=60, double_after=0.15)
    series('fire_pop', p, '木頭在火裡爆裂的一聲（切自燃燒錄音）', target=ONESHOT)
    z = dc(load('436470')); z = hp(z, 300)
    sz = norm_lufs(make_loop(trim(z, -40, post_db=-45)[: int(2.8 * SR)], 2.0, 0.7), -24, ceiling=-3)
    emit('foley/sizzle_loop.ogg', sz, ['436470'], '灼熱的金屬遇到水氣的滋滋聲（鑰匙燙手），無縫循環', kind='loop', q=4)

@recipe
def birds():
    x = dc(load('611453', start=0, dur=96)); x = hp(x, 400)
    st = stationary_start(x, 7)
    y = norm_lufs(make_loop(x[int(st * SR): int((st + 7) * SR)], 5.0, 1.8), -30, ceiling=-6)
    emit('amb/dawn_birds.ogg', y, ['611453'], '黎明的鳥叫（森林的晨間合唱），無縫循環', kind='loop', q=3)

@recipe
def night_animals():
    ow = hits('745208', 1, thr=-18, gap=1.2, max_len=2.2, hpf=200, lpf=4000, tail_db=-40, double_after=1.8)
    series('owl', ow, '夜裡的貓頭鷹（遠處的啼叫）', target=ONESHOT - 2)
    bk = hits('277058', 1, thr=-20, gap=0.3, max_len=0.5, hpf=200, tail_db=-45) + hits('630648', 1, thr=-20, gap=0.3, max_len=0.8, hpf=200, tail_db=-45) + hits('612856', 1, thr=-20, gap=0.3, max_len=0.6, hpf=200, tail_db=-45, double_after=0.35)
    series('bark', bk, '山谷另一頭的狗叫（單聲，遊戲裡排成兩三聲、加距離感）', target=ONESHOT - 1)
    hw = [('115357', fade(cut('115357', 9.25, 11.5, hpf=200, thr=-45, post=-50), 0.03, 0.3))]
    series('howl', hw, '狗吹螺：遠處的狗拉長聲音嚎叫', target=ONESHOT - 1)
    rs = [('538152', cut('538152', 0, 0.9, hpf=300, thr=-50, post=-55))] + [('59315', fade(cut('59315', 1.0, 2.3, hpf=300, thr=-50, post=-55), 0.02, 0.2))]
    series('rustle', rs, '草叢裡有東西動了一下（樹葉沙沙）', target=ONESHOT - 2)

@recipe
def stones():
    g = dc(load('844329', start=2, dur=5)); g = hp(g, 70)
    y = norm_lufs(make_loop(g, 3.2, 1.0), -22, ceiling=-3)
    emit('foley/grind_loop.ogg', y, ['844329'], '沉重的石塊在石地上摩擦（羅漢移動），無縫循環', kind='loop', q=4)
    c = cut('489905', 0, 1.6, hpf=90, thr=-45, post=-55)
    emit('foley/stone_crack.ogg', norm_lufs(fade(c, 0.001, 0.2), ONESHOT, mode='momentary'), ['489905'], '石頭裂開的一聲（佛像轉頭）')

@recipe
def temple_air():
    ch = hits('501168', 2, thr=-24, gap=0.5, max_len=1.6, hpf=800, tail_db=-48, double_after=1.5)
    series('chime', ch, '屋簷下的風鈴被風吹響（單一陣）', target=ONESHOT - 3)
    pp = [('382654', fade(cut('382654', 2.0, 3.0, hpf=400, thr=-50, post=-55), 0.03, 0.15)), ('119847', fade(cut('119847', 1.0, 2.0, hpf=400, thr=-50, post=-55), 0.03, 0.15)), ('181774', fade(cut('181774', 0.2, 1.1, hpf=400, thr=-50, post=-55), 0.03, 0.15))]
    series('paper', pp, '符紙被風掀動、翻動的沙沙聲', target=ONESHOT - 3)

@recipe
def thunder():
    a = dc(load('581125', start=0, dur=8)); a = hp(a, 35); a = trim(a, -50, post_db=-60)[: int(7.5 * SR)]
    b = dc(load('347562', start=0, dur=8)); b = hp(b, 35); b = trim(b, -50, post_db=-60)[: int(7.5 * SR)]
    series('thunder', [('581125', fade(a, 0.05, 1.5)), ('347562', fade(b, 0.05, 1.5))], '遠方的雷聲（雨夜）', target=ONESHOT - 2, q=3)

@recipe
def scuffs():
    sc = hits('149302', 3, thr=-30, gap=0.25, max_len=0.6, hpf=150, tail_db=-40, double_after=0.45, pick='median')
    series('scuff', sc, '鞋底在地上蹭了一下（急停、轉身）', target=ONESHOT - 4)

# ═════════════════════════ 主程式（保持在檔案最後）═════════════════════════
if __name__ == '__main__':
    names = sys.argv[1:] or list(RECIPES)
    for nm in names:
        print('==', nm)
        RECIPES[nm]()
    # 帳本：合併來源授權
    man = {}
    for mp in glob.glob(os.path.join(RAW, 'manifest*.json')):
        man.update(json.load(open(mp, encoding='utf-8')))
    lp_ = os.path.join(HERE, 'ledger-foley.json')
    old = json.load(open(lp_, encoding='utf-8')) if os.path.exists(lp_) else []
    rows = {r['file']: r for r in old}
    for f, v in LEDGER.items():
        srcs = []
        for sid in v['sources']:
            if sid in man:
                m = man[sid]; srcs.append(dict(title=m['title'], author=m['author'], license=m['license'], url=m['url']))
            elif sid.startswith('vsco:'):
                srcs.append(dict(title=sid[5:], author='Versilian Studios (VSCO-2-CE)', license='CC0 1.0', url='https://github.com/sgossner/VSCO-2-CE'))
            elif sid == 'synth':
                srcs.append(dict(title='程序合成（本專案自製）', author='本專案', license='CC0 1.0（自製）', url=''))
            else:
                srcs.append(dict(title=sid, author='?', license='?', url=''))
        rows[f] = dict(file=f, sources=srcs, notes=v['notes'])
    rows = {f: r for f, r in rows.items() if os.path.exists(os.path.join(OUT, f))}   # 已經不用的成品從帳本移除
    json.dump(sorted(rows.values(), key=lambda r: r['file']), open(lp_, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    json.dump(REPORT, open(os.path.join(WORK, 'report-last.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
