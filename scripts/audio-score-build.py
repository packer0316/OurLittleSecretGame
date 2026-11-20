"""配樂組（score）素材的離線製作。全部來源是 VSCO-2-CE（CC0）與 Freesound 的 CC0 錄音，加上程式合成。

用法（在專案根目錄）：
  python -I scripts/audio-score-build.py              全部重做
  python -I scripts/audio-score-build.py bed hit_big  只做指定的幾個

原始檔：art-direction/audio-sources/_raw/score/（不進 git，可依 ledger-score.json 重新下載）
中間檔與試聽：art-direction/audio-sources/_work/score/
成品：public/assets/audio/score/*.ogg（48 kHz、單聲道、Vorbis q4）
量測報告：art-direction/audio-sources/_work/score/report.json（峰值、響度、DC、頭尾靜音、低頻佔比、循環接縫）
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np  # noqa: E402
import scipy.signal as sg  # noqa: E402
from audio_score_dsp import (SR, load, save_ogg, save_wav, sec, silence, place, pad_to, mix, fade, env_points, db, undb,  # noqa: E402
                             rms, peak, dc_remove, trim, norm_peak, lp, hp, bp, peaking, shelf_hi, saturate, f0, resample,
                             varispeed, semis, sustain, extend, make_ir, reverb, reverse_swell, loopify, lufs, measure, save_report)

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
RAW = os.path.join(ROOT, 'art-direction', 'audio-sources', '_raw', 'score')
WORK = os.path.join(ROOT, 'art-direction', 'audio-sources', '_work', 'score')
OUT = os.path.join(ROOT, 'public', 'assets', 'audio', 'score')
V = os.path.join(RAW, 'vsco')
FS = os.path.join(RAW, 'freesound')

HZ = {}
for i, n in enumerate(['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']):
    for o in range(0, 9):
        HZ[f'{n}{o}'] = 440 * 2 ** ((i - 9) / 12 + (o - 4))
HZ.update({k.replace('A#', 'Bb'): v for k, v in list(HZ.items()) if 'A#' in k})
HZ.update({k.replace('C#', 'Db'): v for k, v in list(HZ.items()) if 'C#' in k})
HZ.update({k.replace('D#', 'Eb'): v for k, v in list(HZ.items()) if 'D#' in k})
HZ.update({k.replace('F#', 'Gb'): v for k, v in list(HZ.items()) if 'F#' in k})
HZ.update({k.replace('G#', 'Ab'): v for k, v in list(HZ.items()) if 'G#' in k})

_cache = {}


def S(rel):
    """讀一個原始檔（相對 _raw/score/vsco 或 freesound），去 DC"""
    p = os.path.join(V, rel) if not rel.startswith('fs:') else os.path.join(FS, rel[3:])
    if p not in _cache:
        _cache[p] = dc_remove(load(p))
    return _cache[p].copy()


def onset(x, th_db=-36):
    """切掉起音之前的空白（第一個超過峰值 th_db 的位置往前 3 ms）"""
    a = np.abs(x)
    i = int(np.argmax(a > peak(x) * undb(th_db)))
    return x[max(0, i - sec(0.003)):]


def tuned(rel, expect, target, at=None, win=0.8):
    """讀檔並調到 target 音高。expect 是原始音高的預期值（只在 ±12% 內找基頻，避免八度誤判）"""
    x = S(rel)
    hz = f0(x, lo=expect * 0.88, hi=expect * 1.12, at=at, win=win)
    return resample(x, target / hz), hz


def nlufs(x, target):
    return x * undb(target - lufs(x))


def exp_env(n, tau, hold=0.0):
    t = np.arange(n) / SR
    e = np.exp(-np.maximum(0, t - hold) / tau)
    return e


def circ_place(buf, src, at):
    """循環緩衝區：src 放在第 at 秒，超過尾端的部分繞回開頭"""
    L = len(buf)
    i = sec(at) % L
    n = len(src)
    while n > 0:
        k = min(n, L - i)
        buf[i:i + k] += src[len(src) - n:len(src) - n + k]
        n -= k
        i = 0
    return buf


def circ_reverb(x, rt60, wet, bright=0.5, seed=7):
    ir = make_ir(rt60, bright=bright, seed=seed)
    L = len(x)
    if len(ir) > L:
        ir = ir[:L] * np.linspace(1, 0, L) ** 2
    w = np.real(np.fft.ifft(np.fft.fft(x) * np.fft.fft(ir, L)))
    return x * (1 - wet) + w * wet


def lfo(n, cycles, L, phase=0.0, lo=0.0, hi=1.0):
    """在 L 秒內剛好 cycles 個週期的正弦（循環素材不會有接縫）"""
    t = np.arange(n) / SR
    return lo + (hi - lo) * (0.5 + 0.5 * np.sin(2 * np.pi * cycles * t / L + phase))


def synth_boom(f_hi=72, f_lo=27, sweep=1.3, tau=0.9, dur=3.0):
    n = sec(dur)
    t = np.arange(n) / SR
    f = f_lo + (f_hi - f_lo) * np.exp(-t / (sweep / 3))
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph) * np.exp(-t / tau)
    x += 0.3 * np.sin(2 * ph) * np.exp(-t / (tau * 0.4))  # 讓小喇叭也感覺得到
    return fade(x * np.minimum(1, t / 0.004), fout=0.2)


# ───────────────────────── 1. 低音弦樂群鳴床（循環） ─────────────────────────
def build_bed():
    L, X, P = 16.0, 3.0, 3.0
    total = P + L + X
    n = sec(total)
    voices = [
        # (檔案, 預期音高, 目標音高, 增益, 穩定段, LFO 週期數)
        ('Strings/Solo Contrabass/SusNV/BKCtbss_SusNV_E0_v1_rr1.wav', HZ['E1'], HZ['E1'], 1.0, (1.2, 14.5), 1),
        ('Strings/Solo Contrabass/SusNV/BKCtbss_SusNV_G0_v1_rr1.wav', HZ['G1'], HZ['F1'], 0.72, (1.0, 9.6), 2),
        ('Strings/Solo Contrabass/SusNV/BKCtbss_SusNV_A#0_v1_rr1.wav', HZ['Bb1'], HZ['Bb1'], 0.5, (1.0, 9.6), 3),
        ('Strings/Cello Section/susvib/susvib_E1_v3_1.wav', HZ['E2'], HZ['E2'], 0.22, (1.0, 10.5), 2),
        ('Woodwinds/Bassoon/sus/PSBassoon_F1_v1_1.wav', HZ['F2'], HZ['F2'], 0.12, (0.8, 8.8), 1),
    ]
    out = np.zeros(n)
    low = np.zeros(n)  # 三支低音提琴（E1／F1／B♭1）：小喇叭的諧波層從這裡長出來
    for k, (rel, ex, tg, g, (a, b), cyc) in enumerate(voices):
        x, hz = tuned(rel, ex, tg, at=(a + b) / 2)
        r = tg / hz
        a2, b2 = a / r, min(b / r, len(x) / SR - 0.1)
        s = sustain(x, total, a2, b2, grain=2.2, seed=11 + k, jitter=3)
        s = s / (rms(s) + 1e-9)
        # 慢慢起伏（循環週期內整數個週期）
        e = lfo(n, cyc, L, phase=k * 1.7, lo=0.35, hi=1.0)
        out += s * e * g
        if k < 3:
            low += s * e * g
    # 地板下的摩擦聲（大鼓皮的摩擦）
    rub = S('Percussion/bassdrum_rub2_v1.wav')
    rs = sustain(rub, total, 0.3, 1.9, grain=1.0, seed=5)
    rs = lp(rs, 160, 4)
    out += rs / (rms(rs) + 1e-9) * 0.18 * lfo(n, 1, L, phase=2.5, lo=0.2, hi=1.0)
    def chain(sig):  # 全部是線性處理：群鳴本體與諧波層分開走同一條鏈，再按比例混
        sig = hp(sig, 30, 4)
        sig = lp(sig, 2400, 2)
        sig = reverb(sig, rt60=3.6, wet=0.32, bright=0.3, seed=21, tail=False)
        return loopify(sig[sec(P):], L, X)
    y0 = chain(out)
    G = undb(-24 - lufs(y0))  # 本體維持原本的 -24 LUFS：次低頻能量完全不變
    y0 = y0 * G
    # 小喇叭聽得見的諧波層：低音提琴 E1／F1／B♭1 的 4～8 次諧波（Chebyshev 多項式 T4、T5、T6、T8 產生，約 165–465 Hz），
    # 只留 190–520 Hz（八階高通：60 Hz 以下幾乎沒有東西）。筆電喇叭靠這些泛音「補出」聽不到的基頻（missing fundamental）
    xn = low / (np.max(np.abs(low)) + 1e-9)
    T4 = 8 * xn ** 4 - 8 * xn ** 2 + 1
    T5 = 16 * xn ** 5 - 20 * xn ** 3 + 5 * xn
    T6 = 32 * xn ** 6 - 48 * xn ** 4 + 18 * xn ** 2 - 1
    T8 = 128 * xn ** 8 - 256 * xn ** 6 + 160 * xn ** 4 - 32 * xn ** 2 + 1
    hm = 0.5 * T4 + 0.5 * T5 + 0.4 * T6 + 0.25 * T8
    hm = sg.sosfilt(sg.butter(8, 190 / (SR / 2), 'highpass', output='sos'), hm)
    hm = sg.sosfilt(sg.butter(4, 520 / (SR / 2), 'lowpass', output='sos'), hm)
    h = chain(hm)
    h = h * (rms(y0) / (rms(h) + 1e-12))
    # 混入量：小喇叭頻段（200 Hz 以上）至少 +6 dB，整體響度增加不超過 0.9 LU
    laptop = lambda z: 10 * np.log10(np.mean(sg.sosfilt(sg.butter(4, 200 / (SR / 2), 'highpass', output='sos'), z) ** 2) + 1e-20)
    sub = lambda z: 10 * np.log10(np.mean(sg.sosfilt(sg.butter(8, 60 / (SR / 2), 'lowpass', output='sos'), z) ** 2) + 1e-20)
    base_l, base_lufs, base_sub = laptop(y0), lufs(y0), sub(y0)
    # 把小喇叭放不出來、響度卻照算的 80–180 Hz 讓一點出來（不重新正規化：60 Hz 以下只會變少，不會變多），換給 200 Hz 以上的諧波層
    y0c = peaking(y0, 150, -6.5, 1.2)
    gh = 0.0
    for cand in np.linspace(0.02, 1.6, 80):
        yy = y0c + h * cand
        if lufs(yy) - base_lufs > 0.9:
            break
        gh = cand
        if laptop(yy) - base_l >= 8:
            break
    y = y0c + h * gh
    meta = {'loop': True, 'harmonic_gain': round(float(gh), 3), 'laptop200_gain_db': round(laptop(y) - base_l, 2),
            'lufs_gain': round(lufs(y) - base_lufs, 2), 'sub60_change_db': round(sub(y) - base_sub, 2)}
    print('bed harmonic layer', meta, flush=True)
    return y, meta


# ───────────────────────── 2. 不安層：高把位顫弓群、弓擦鈸、銅鑼刮奏（循環） ─────────────────────────
def build_unease():
    L = 13.0
    n = sec(L)
    buf = np.zeros(n)
    # 半音簇的高把位顫弓（模擬 sul ponticello：切掉基頻附近、拉高 4–6 kHz、一點點飽和）
    cl = [('Strings/Violin Section/Trem/VlnEns_Trem_B4_v1.wav', HZ['B5'], HZ['B5'], 1, 0.0),
          ('Strings/Viola Section/trem/Violas_trem_B4_v2_rr1.wav', HZ['B5'], HZ['C6'], 2, 2.1),
          ('Strings/Violin Section/Trem/VlnEns_Trem_D5_v1.wav', HZ['D6'], HZ['C#6'], 3, 4.0)]
    for k, (rel, ex, tg, cyc, ph) in enumerate(cl):
        x, hz = tuned(rel, ex, tg)
        s = sustain(x, L + 2, 0.6, len(x) / SR - 0.6, grain=1.1, seed=31 + k, jitter=6)
        s = loopify(s, L, 2.0)
        s = s / (rms(s) + 1e-9)
        s = hp(s, 1100, 2)
        s = peaking(s, 5200, 7, 0.8)
        s = saturate(s * 0.6, 1.6)
        e = lfo(n, cyc, L, phase=ph, lo=0.0, hi=1.0) ** 2.2
        buf += s * e * 0.32
    # 弓擦鈸：長而飄的金屬泛音
    for rel, at, g, sh in [('Percussion/susCymb1-bow-1.wav', 0.5, 0.55, 0), ('Percussion/susCymb1-bow-4.wav', 6.8, 0.5, -2),
                           ('Percussion/susCymb1-bow-3.wav', 10.2, 0.4, -3)]:
        x = onset(S(rel))
        if sh:
            x = resample(x, semis(sh))
        x = x[:sec(9)]
        x = fade(x / (rms(x) + 1e-9), fin=1.5, fout=2.5)
        circ_place(buf, x * g, at)
    # 銅鑼刮奏，壓低四個半音
    gs = resample(onset(S('Percussion/gongscrape_pp.wav')), semis(-4))
    gs = fade(gs[:sec(6)] / (rms(gs[:sec(6)]) + 1e-9), fin=0.8, fout=2.0)
    circ_place(buf, gs * 0.35, 3.3)
    buf = circ_reverb(buf, 3.0, 0.4, bright=0.5)
    buf = hp(np.tile(buf, 3), 300, 2)[n:2 * n]  # 濾波器也循環穩定
    return nlufs(buf, -27), {'loop': True}


# ───────────────────────── 3. 追逐層：126 BPM 的低音頓弓固定音型（循環） ─────────────────────────
def build_chase():
    bpm = 126
    beat = 60 / bpm
    st = beat / 4
    bars = 4
    L = bars * 4 * beat
    n = sec(L)
    buf = np.zeros(n)
    cb_e, _ = tuned('Strings/Solo Contrabass/Spic/BKCtbss_Spic_E0_v3_rr1.wav', HZ['E1'], HZ['E1'])
    ce_e, _ = tuned('Strings/Cello Section/spic/spic_E1_v2_RR1.wav', HZ['E2'], HZ['E2'])
    cb_e, ce_e = onset(cb_e), onset(ce_e)

    def note(x, length, g):
        y = x[:sec(length)] * g
        return fade(y, fout=min(0.05, length * 0.4))
    roots = [0, 0, 1, 6]  # E、E、F、Bb（半音與三全音）
    acc = [0, 3, 6, 8, 11, 14]
    for b in range(bars):
        r = semis(roots[b])
        lo, mid = resample(cb_e, r), resample(ce_e, r)
        for s16 in range(16):
            t = (b * 16 + s16) * st
            if s16 in acc:
                g = 1.0 if s16 in (0, 8) else 0.75
                circ_place(buf, note(lo, st * 1.6, g), t)
                circ_place(buf, note(mid, st * 1.3, g * 0.5), t)
            elif s16 in (15,):
                circ_place(buf, note(lo, st * 0.9, 0.35), t)
    # 定音鼓與大鼓
    timp = onset(S('Percussion/Timpani/Timpani2_Hit_v4_rr1_Sum.wav'))
    timp = fade(timp[:sec(1.0)] / peak(timp), fout=0.3)
    bd = onset(S('Percussion/BDrumNewhit_v5_rr1_Sum.wav'))
    bd = fade(lp(bd[:sec(0.9)], 180, 2) / peak(bd), fout=0.3)
    for b in range(bars):
        circ_place(buf, timp * 0.55, b * 4 * beat)
        if b % 2 == 1:
            circ_place(buf, bd * 0.6, (b * 4 + 2) * beat)
            circ_place(buf, bd * 0.45, (b * 4 + 3.5) * beat)
    # 高把位顫弓群：一直懸在上面
    hi_ = np.zeros(n)
    for k, (rel, ex, tg) in enumerate([('Strings/Violin Section/Trem/VlnEns_Trem_B4_v1.wav', HZ['B5'], HZ['B5']),
                                       ('Strings/Viola Section/trem/Violas_trem_B4_v2_rr1.wav', HZ['B5'], HZ['C6'])]):
        x, _ = tuned(rel, ex, tg)
        s = loopify(sustain(x, L + 1.5, 0.5, len(x) / SR - 0.5, grain=1.0, seed=41 + k, jitter=5), L, 1.5)
        hi_ += s / (rms(s) + 1e-9)
    hi_ = peaking(hp(hi_, 900), 4800, 5, 0.9) * lfo(n, 2, L, lo=0.55, hi=1.0)
    buf += hi_ * 0.05
    # 第四小節最後一拍的銅管短促重音
    bz, _ = tuned('Brass/OldTrombone/Buzz/Trombone_Buzz_C2_v1_1.wav', HZ['C3'], HZ['Bb2'])
    bz2, _ = tuned('Brass/OldTrombone/Buzz/Trombone_Buzz_A1_v1_1.wav', HZ['A2'], HZ['B2'])
    stab = fade((onset(bz)[:sec(0.42)] + onset(bz2)[:sec(0.42)] * 0.8), fout=0.12)
    circ_place(buf, stab / peak(stab) * 0.35, (3 * 4 + 3.5) * beat)
    buf = circ_reverb(buf, 1.3, 0.16, bright=0.5)
    buf = hp(np.tile(buf, 3), 32, 2)[n:2 * n]
    return nlufs(buf, -20), {'loop': True, 'bpm': bpm}


# ───────────────────────── 4. 脈動：低鼓、col legno、心跳（一次性） ─────────────────────────
def build_pulse(variant):
    sh = [-2, -1][variant]
    t1 = onset(S(['Percussion/Timpani/Timpani1_Hit_v1_rr1_Sum.wav', 'Percussion/Timpani/Timpani5_Hit_v1_rr1_Sum.wav'][variant]))
    t1 = resample(t1 / peak(t1), semis(sh - (5 if variant else 0)))
    bd = onset(S('Percussion/BDrumNewhit_v3_rr2_Sum.wav'))
    bd = lp(resample(bd / peak(bd), semis(sh)), 220, 2)
    x = mix(t1[:sec(1.2)] * 0.8, bd[:sec(1.2)] * 0.7)
    x = fade(pad_to(x, sec(1.2)), fout=0.4)
    x = reverb(x, 1.6, 0.18, bright=0.2, tail=False)
    return norm_peak(x, -1.5), {}


def build_tick(variant):
    sh = [0, 1][variant]
    cb, _ = tuned('Strings/Solo Contrabass/Spic/BKCtbss_Spic_E0_v3_rr1.wav', HZ['E1'], HZ['E1'] * semis(sh))
    cl = onset(S('Percussion/Claves1_Hit_v1_rr1_Sum.wav'))
    cl = hp(lp(cl / peak(cl), 3500), 900)
    ce, _ = tuned('Strings/Cello Section/spic/spic_E1_v2_RR1.wav', HZ['E2'], HZ['E2'] * semis(sh))
    x = mix(fade(onset(cb)[:sec(0.14)], fout=0.06), fade(onset(ce)[:sec(0.1)], fout=0.05) * 0.4, cl[:sec(0.05)] * 0.12)
    x = pad_to(x, sec(0.3))
    x = reverb(x, 0.9, 0.15, tail=False)
    return norm_peak(fade(x, fout=0.08), -3), {}


def build_heart(kind):
    n = sec(0.42)
    t = np.arange(n) / SR
    hi_f, lo_f, a = (58, 36, 1.0) if kind == 'lub' else (68, 44, 0.75)
    f = lo_f + (hi_f - lo_f) * np.exp(-t / 0.035)
    th = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / (0.075 if kind == 'lub' else 0.06)) * np.minimum(1, t / 0.006)
    bd = onset(S('Percussion/BDrumNewhit_v2_rr1_Sum.wav'))
    bd = lp(bd[:n] / peak(bd), 130, 4)
    x = th * 0.9 + pad_to(bd, n) * 0.55
    x = peaking(x, 110, 5, 0.9)  # 筆電喇叭也聽得到的上方泛音
    x = fade(dc_remove(x) * a, fout=0.12)
    return norm_peak(x, -1.5 if kind == 'lub' else -4), {}


# ───────────────────────── 5. 爆點 ─────────────────────────
def string_stab(spec, hold=0.35, tau=0.9, dur=5.0):
    n = sec(dur)
    out = np.zeros(n)
    for rel, ex, tg, g in spec:
        x, _ = tuned(rel, ex, tg)
        x = onset(x, -30)
        x = pad_to(x, n) / (rms(x[:sec(1.5)]) + 1e-9)
        out += x * g
    return out * exp_env(n, tau, hold)


def screech(dur=1.6, rise=7, t_rise=0.5):
    x, _ = tuned('Strings/Solo Violin/Trem/LLVln_trem_G5_v1_rr1.wav', HZ['G6'], HZ['G6'])
    x = onset(x)
    n = sec(dur)
    t = np.arange(n) / SR
    rate = semis(rise * np.minimum(1, t / t_rise) ** 0.6)
    y = varispeed(np.concatenate([x, x]), rate)
    y = hp(y, 1600, 2)
    y = peaking(y, 3800, 5, 1.2)
    return y / (rms(y[:sec(0.5)]) + 1e-9) * exp_env(n, 0.45, 0.15) * np.minimum(1, t / 0.008)


def impact(n, amt=1.0):
    """爆點最前面 50 ms 的「打擊」：大鼓皮的槌頭聲、定音鼓、一小段濾過的噪音裂響"""
    bd = onset(S('Percussion/BDrumNewhit_v7_rr1_Sum.wav'))
    tm = onset(S('Percussion/Timpani/Timpani2_Hit_v4_rr1_Sum.wav'))
    rng = np.random.default_rng(5)
    cr = bp(rng.standard_normal(sec(0.12)), 900, 7000) * np.exp(-np.arange(sec(0.12)) / sec(0.022))
    x = pad_to(bd / peak(bd), n) * 0.5 + pad_to(tm / peak(tm), n) * 0.45 + pad_to(cr / peak(cr), n) * 0.35
    return x * amt


def punch(n, depth=0.5, tau=0.09):
    """身體層的包絡：起音那一下滿，0.1 秒後退到 (1 - depth)，讓爆點有衝擊"""
    t = np.arange(n) / SR
    return (1 - depth) + depth * np.exp(-t / tau)


def finish_hit(x, dur, rt=3.0, wet=0.28, target=-1.0):
    x = reverb(x, rt, wet, bright=0.45, pre=0.01, tail=False)
    x = pad_to(x, sec(dur))
    x = fade(x, fout=min(1.0, dur * 0.25))
    x = hp(x, 24, 4)
    return norm_peak(x, target)


def build_hit_big(variant):
    dur = 5.0
    n = sec(dur)
    boom = pad_to(synth_boom(74, 27, 1.2, 0.9, 3.0), n)
    bd = onset(S('Percussion/BDrumNewhit_v7_rr1_Sum.wav'))
    bd = pad_to(lp(bd / peak(bd), 170, 2), n)
    gong = onset(S('Percussion/gongHit_fff.wav' if variant == 0 else 'VSCO 1 Percussion/varMetal/Gong/gong_smack_low_1.wav'))
    gong = pad_to(gong / rms(gong[:sec(2)]), n)
    if variant == 0:
        strings = string_stab([
            ('Strings/Cello Section/trem/trem_C1_v2_1.wav', HZ['C2'], HZ['C2'], 1.0),
            ('Strings/Cello Section/trem/trem_F2_v2_1.wav', HZ['F3'], HZ['F#3'], 0.8),
            ('Strings/Viola Section/trem/Violas_trem_B4_v2_rr1.wav', HZ['B5'], HZ['B5'], 0.7),
            ('Strings/Viola Section/trem/Violas_trem_D5_v2_rr1.wav', HZ['D6'], HZ['C6'], 0.6),
            ('Strings/Violin Section/Trem/VlnEns_Trem_D5_v1.wav', HZ['D6'], HZ['C#6'], 0.5),
        ], hold=0.4, tau=0.85, dur=dur)
        brass = np.zeros(n)
        for rel, ex, tg, g in [('Brass/OldTrombone/Sustain/Trombone_Sustain_C2_v3_1.wav', HZ['C3'], HZ['C3'], 1.0),
                               ('Brass/OldTrombone/Buzz/Trombone_Buzz_C2_v1_1.wav', HZ['C3'], HZ['C#3'], 0.8),
                               ('Brass/Tuba/sus/Tuba3_sus_F1_v2_rr1_Mid.wav', HZ['F2'], HZ['F#2'], 0.9)]:
            x, _ = tuned(rel, ex, tg)
            x = onset(x, -30)
            brass += pad_to(x, n) / (rms(x[:sec(1)]) + 1e-9) * g
        brass = saturate(brass * 0.35, 1.8) * exp_env(n, 0.8, 0.5)
        cym = onset(S('Percussion/susCymb1-hit_fff_rr1.wav'))
        cym = pad_to(cym / rms(cym[:sec(1)]), n)
        body = strings * 0.2 + brass * 0.6 + gong * 0.12 + cym * 0.06 + pad_to(screech(1.6, 7), n) * 0.1
        x = boom * 0.6 + bd * 0.4 + body * punch(n, 0.5) + impact(n, 0.55)
    elif variant == 2:
        # 尖叫般的弦樂：高把位顫弓群從上往下抹（Insidious 式），金屬撞擊、硬打銅鑼、次低頻
        sc = np.zeros(n)
        t = np.arange(n) / SR
        for k, (rel, ex, tg) in enumerate([('Strings/Violin Section/Trem/VlnEns_Trem_D5_v1.wav', HZ['D6'], HZ['D#6']),
                                           ('Strings/Violin Section/Trem/VlnEns_Trem_B4_v1.wav', HZ['B5'], HZ['E6']),
                                           ('Strings/Viola Section/trem/Violas_trem_D5_v2_rr1.wav', HZ['D6'], HZ['F6'])]):
            x, _ = tuned(rel, ex, tg)
            s = sustain(x, dur + 2, 0.4, len(x) / SR - 0.4, grain=0.9, seed=111 + k, jitter=10)
            s = varispeed(s, semis(-9 * np.minimum(1, t / 1.6) ** 1.5 - 0.6 * k))
            sc += s / (rms(s) + 1e-9)
        sc = peaking(hp(sc, 900), 5200, 5, 1.0) * exp_env(n, 0.8, 0.25)
        anv = onset(S('Percussion/Anvil_Hit1_v1_Sum.wav'))
        anv = pad_to(hp(anv / peak(anv), 600), n)
        gh = onset(S('VSCO 1 Percussion/varMetal/Gong/gong_hit_ff_hard.wav'))
        gh = pad_to(gh / rms(gh[:sec(2)]), n)
        low = string_stab([('Strings/Cello Section/trem/trem_C1_v2_1.wav', HZ['C2'], HZ['B1'], 1.0),
                           ('Strings/Cello Section/trem/trem_F2_v2_1.wav', HZ['F3'], HZ['F3'], 0.7)], hold=0.3, tau=0.9, dur=dur)
        body = sc * 0.14 + low * 0.16 + gh * 0.12 + anv * 0.25
        x = boom * 0.6 + bd * 0.4 + body * punch(n, 0.5) + impact(n, 0.5)
    else:
        # 預置鋼琴般的低音群砸下去 + 另一組弦樂群
        piano = np.zeros(n)
        for k in ['002', '004', '006', '008', '010']:
            p = onset(S(f'Keys/Upright Piano/Player_dyn2_rr1_{k}.wav'))
            piano += pad_to(p / peak(p), n)
        piano = saturate(piano * 0.5, 1.4) * exp_env(n, 1.4, 0.1)
        strings = string_stab([
            ('Strings/Cello Section/trem/trem_C1_v2_1.wav', HZ['C2'], HZ['C#2'], 1.0),
            ('Strings/Cello Section/trem/trem_F2_v2_1.wav', HZ['F3'], HZ['G3'], 0.7),
            ('Strings/Viola Section/trem/Violas_trem_D5_v2_rr1.wav', HZ['D6'], HZ['A#5'], 0.6),
            ('Strings/Viola Section/trem/Violas_trem_B4_v2_rr1.wav', HZ['B5'], HZ['A5'], 0.7),
        ], hold=0.3, tau=0.75, dur=dur)
        scr = onset(S('Percussion/susCymb1-scrape2_v1.wav'))
        scr = pad_to(scr / rms(scr[:sec(1)]), n)
        body = piano * 0.6 + strings * 0.18 + gong * 0.1 + scr * 0.07 + pad_to(screech(1.4, -5, 0.9), n) * 0.08
        x = boom * 0.55 + bd * 0.4 + body * punch(n, 0.45) + impact(n, 0.5)
    return finish_hit(x, dur, rt=3.2, wet=0.26), {'onset': 0.0}


def build_hit_small(variant):
    dur = 2.4
    n = sec(dur)
    if variant == 0:
        st = string_stab([('Strings/Violin Section/Trem/VlnEns_Trem_B4_v1.wav', HZ['B5'], HZ['B5'], 1.0),
                          ('Strings/Viola Section/trem/Violas_trem_B4_v2_rr1.wav', HZ['B5'], HZ['C6'], 0.8),
                          ('Strings/Violin Section/Trem/VlnEns_Trem_D5_v1.wav', HZ['D6'], HZ['C#6'], 0.8)], hold=0.12, tau=0.35, dur=dur)
        gs = onset(S('VSCO 1 Percussion/varMetal/Gong/gong_scrape_1.wav'))
        gs = pad_to(gs / rms(gs[:sec(0.6)]), n)
        x = st * 0.25 + gs * 0.1 + pad_to(synth_boom(90, 45, 0.3, 0.25, 1.0), n) * 0.5
        x = peaking(x, 4500, 4, 1)
    elif variant == 1:
        piano = np.zeros(n)
        for k in ['004', '008']:
            p = onset(S(f'Keys/Upright Piano/Player_dyn1_rr1_{k}.wav'))
            piano += pad_to(p / peak(p), n)
        piano = piano * exp_env(n, 0.8, 0.05)
        x = piano * 0.6 + pad_to(screech(0.7, 4, 0.25), n) * 0.12 + pad_to(synth_boom(70, 35, 0.5, 0.35, 1.5), n) * 0.4
    else:
        fall = np.zeros(n)
        for rel, ex, tg in [('Brass/OldTrombone/Fall/Trombone_Fall_A1_1.wav', HZ['A2'], HZ['Bb2']), ('Brass/OldTrombone/Fall/Trombone_Fall_G1_1.wav', HZ['G2'], HZ['A2'])]:
            x, _ = tuned(rel, ex, tg, at=0.15, win=0.25)
            fall += pad_to(onset(x) / peak(x), n)
        scr = onset(S('Percussion/susCymb1-scrape1_v1.wav'))
        scr = pad_to(scr / rms(scr[:sec(0.5)]), n) * exp_env(n, 0.5)
        ce = onset(S('Strings/Cello Section/spic/spic_C1_v2_RR1.wav'))
        x = saturate(fall * 0.7, 1.5) * 0.6 + scr * 0.12 + pad_to(ce / peak(ce), n) * 0.5
    # 小刺也要有清楚的起音（比大爆輕）
    x = x * punch(n, 0.35, 0.07) + impact(n, 0.22)
    return finish_hit(x, dur, rt=2.4, wet=0.25, target=-2.0), {'onset': 0.0}


# ───────────────────────── 6. 預捲漸強：結尾精準落在爆點 ─────────────────────────
def build_riser():
    D = 8.0
    n = sec(D)
    t = np.arange(n) / SR
    u = t / D
    # 鈸的漸強滾奏：峰值對齊到結尾
    cy = S('Percussion/susCymb1-cresc-Long_v1.wav')
    ip = int(np.argmax(np.abs(lp(cy, 3000)) > 0.85 * peak(lp(cy, 3000))))
    seg = cy[max(0, ip - n):ip]
    cyr = np.zeros(n)
    cyr[n - len(seg):] = seg
    cyr /= peak(cyr)
    # 顫弓群一路滑上去（九個半音），音量指數漸強
    gl = np.zeros(n)
    for k, (rel, ex, tg) in enumerate([('Strings/Violin Section/Trem/VlnEns_Trem_G4_v1.wav', HZ['G5'], HZ['G5']),
                                       ('Strings/Violin Section/Trem/VlnEns_Trem_B4_v1.wav', HZ['B5'], HZ['A#5']),
                                       ('Strings/Viola Section/trem/Violas_trem_D5_v2_rr1.wav', HZ['D6'], HZ['B5'])]):
        x, _ = tuned(rel, ex, tg)
        s = sustain(x, 15, 0.5, len(x) / SR - 0.5, grain=1.0, seed=51 + k, jitter=8)
        s = varispeed(s, semis(9 * u ** 1.6))
        gl += s / (rms(s) + 1e-9)
    lo_ = np.zeros(n)
    x, _ = tuned('Strings/Cello Section/trem/trem_C1_v2_1.wav', HZ['C2'], HZ['C2'])
    s = sustain(x, 12, 0.5, len(x) / SR - 0.5, grain=1.2, seed=61)
    lo_ += varispeed(s, semis(7 * u ** 1.4)) / (rms(s) + 1e-9)
    roll = S('Percussion/Timpani/Rolls/Timpani1_Roll_v5_rr1_Sum.wav')[sec(2):sec(2) + n]
    roll = pad_to(roll / rms(roll), n)
    gong = onset(S('Percussion/gongHit_mf.wav'))[:sec(4.5)][::-1]
    gr = np.zeros(n)
    gr[n - len(gong):] = gong / peak(gong)
    cres = undb(-42 + 42 * u ** 1.25)  # -42 dB → 0 dB
    x = (gl * 0.09 + lo_ * 0.1) * cres + roll * 0.08 * undb(-36 + 36 * u ** 1.1) + cyr * 0.45 + gr * 0.35 * u ** 2
    x = hp(x, 35, 2)
    x = norm_peak(x, -1.5)
    x[-sec(0.006):] *= np.linspace(1, 0, sec(0.006))
    return x, {'onset_end': D}


def build_riser_rev():
    D = 5.0
    n = sec(D)
    piano = np.zeros(sec(6))
    for k in ['004', '006', '008']:
        p = onset(S(f'Keys/Upright Piano/Player_dyn2_rr1_{k}.wav'))[:sec(6)]
        piano += pad_to(p / peak(p), sec(6))
    wet = reverb(piano, 4.2, 0.85, bright=0.5, tail=True)[:sec(6)]
    g = onset(S('VSCO 1 Percussion/varMetal/Gong/gong_hit_ff_hard.wav'))[:sec(6)]
    c = onset(S('Percussion/susCymb1-hit_fff_rr1.wav'))[:sec(6)]
    body = wet / peak(wet) + pad_to(g / peak(g), sec(6)) * 0.6 + pad_to(c / peak(c), sec(6)) * 0.35
    rev = body[::-1][-n:]
    rev = fade(rev, fin=1.2, shape='lin')
    rev = hp(rev, 35, 2)
    rev = norm_peak(rev, -2.0)
    rev[-sec(0.006):] *= np.linspace(1, 0, sec(0.006))
    return rev, {'onset_end': D}


# ───────────────────────── 7. 「它」：倒吸的預捲 + 低音銅管 braam ─────────────────────────
def build_braam():
    pre, dur = 1.2, 5.6
    n = sec(dur - pre)
    br = np.zeros(n)
    for rel, ex, tg, g in [('Brass/OldTrombone/Buzz/Trombone_Buzz_G1_v1_1.wav', HZ['G2'], HZ['E2'], 1.0),
                           ('Brass/OldTrombone/Buzz/Trombone_Buzz_A1_v1_1.wav', HZ['A2'], HZ['F2'], 0.8),
                           ('Brass/OldTrombone/Buzz/Trombone_Buzz_C2_v1_1.wav', HZ['C3'], HZ['Bb2'], 0.6),
                           ('Brass/Tuba/sus/Tuba3_sus_F1_v2_rr1_Mid.wav', HZ['F2'], HZ['E2'], 0.9),
                           ('Woodwinds/Bassoon/sus/PSBassoon_A#0_v1_1.wav', HZ['Bb1'], HZ['Bb1'], 0.5)]:
        x, _ = tuned(rel, ex, tg)
        x = onset(x, -30)
        # buzz 樣本較短：保留真實起音，之後用穩定段延長
        x = extend(x, n, 0.5, len(x) / SR - 0.4, keep=0.8, seed=71)
        br += pad_to(x, n) / (rms(x[:sec(1.2)]) + 1e-9) * g
    cbt, _ = tuned('Strings/Solo Contrabass/Trem/BKCtbss_Trem_E0_v2_rr1.wav', HZ['E1'], HZ['E1'])
    cbt = pad_to(onset(cbt), n)
    t = np.arange(n) / SR
    growl = 1 - 0.28 * (0.5 + 0.5 * np.sin(2 * np.pi * 26 * t))
    br = saturate(br * 0.32 * growl, 2.2)
    env = np.minimum(1, t / 0.07) * exp_env(n, 1.3, 1.5)
    body = (br + cbt / (rms(cbt) + 1e-9) * 0.25) * env
    body = lp(body, 3600, 2)
    swell = reverse_swell(body, rt60=2.6, seconds=pre, seed=9)
    swell = swell / (peak(swell) + 1e-9) * peak(body) * 0.55 * np.linspace(0, 1, len(swell)) ** 2.2  # 越吸越急
    x = np.concatenate([swell, body])
    x = reverb(x, 3.0, 0.25, bright=0.35, tail=False)
    x = fade(hp(x, 28, 4), fout=0.8)
    return norm_peak(x, -1.0), {'onset': pre}


# ───────────────────────── 8. 低頻湧上（取代 _k_sub）、餘韻 ─────────────────────────
def build_swell():
    dur, up, hold = 4.6, 1.5, 0.7
    n = sec(dur)
    t = np.arange(n) / SR
    rub = S('Percussion/bassdrum_rub2_v1.wav')
    rs = lp(sustain(rub, dur, 0.3, 1.9, grain=0.9, seed=81), 200, 4)
    g = onset(S('VSCO 1 Percussion/varMetal/Gong/gong_hit_pppp.wav'))
    g = pad_to(resample(g, 0.5), n)
    cbt, _ = tuned('Strings/Solo Contrabass/Trem/BKCtbss_Trem_E0_v2_rr1.wav', HZ['E1'], HZ['E1'])
    cbt = lp(pad_to(sustain(cbt, dur, 0.6, 7.0, grain=1.2, seed=82), n), 380, 2)
    f = 30 + 15 * np.minimum(1, t / (up + hold))
    sine = np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.3 * np.sin(2 * np.pi * np.cumsum(f * 1.5) / SR)
    env = np.where(t < up, (t / up) ** 2, np.where(t < up + hold, 1.0, np.exp(-(t - up - hold) / 0.55)))
    x = (rs / rms(rs) * 0.5 + g / (rms(g) + 1e-9) * 0.25 + cbt / rms(cbt) * 0.35 + sine * 0.55) * env
    x = fade(hp(x, 22, 4), fout=0.3)
    return norm_peak(x, -3.0), {}


def build_tail():
    dur = 4.6
    n = sec(dur)
    out = np.zeros(n)
    for k, (rel, ex, tg) in enumerate([('Strings/Violin Section/susVib/VlnEns_susVib_B4_v1.wav', HZ['B5'], HZ['B5']),
                                       ('Strings/Violin Section/susVib/VlnEns_susVib_D5_v1.wav', HZ['D6'], HZ['C6']),
                                       ('Strings/Viola Section/susvib/ViolaEns_susvib_F3_v1_1.wav', HZ['F4'], HZ['E4'])]):
        x, _ = tuned(rel, ex, tg)
        s = sustain(x, dur, 2.6, len(x) / SR - 1.0, grain=1.4, seed=91 + k, jitter=4)
        out += s / (rms(s) + 1e-9) * [0.5, 0.4, 0.6][k]
    g = onset(S('Percussion/gongHit_p.wav'))
    g = pad_to(resample(g, semis(-5)), n)
    t = np.arange(n) / SR
    env = np.minimum(1, t / 0.35) * np.exp(-t / 1.6)
    x = (hp(out, 400) * 0.6 + g / (rms(g[:sec(2)]) + 1e-9) * 0.35) * env
    x = reverb(x, 3.5, 0.4, bright=0.4, tail=False)
    x = fade(x, fin=0.05, fout=1.0)
    return nlufs(x, -28), {}


# ───────────────────────── 9. 主題動機 ─────────────────────────
def build_qing():
    """寺廟的磬：管鐘的打擊音 + 微微走調的第二層（銅磬特有的「哇—哇」拍頻）"""
    dur = 6.0
    n = sec(dur)
    a = onset(S('Percussion/TB_hit_G4_v4_rr1.wav'))
    b = onset(S('Percussion/TB_hit_C4_v4_rr1.wav'))
    a = resample(a, semis(2))
    x = pad_to(a / peak(a), n) + pad_to(resample(a, 1.0042) / peak(a), n) * 0.45 + pad_to(b / peak(b), n) * 0.35
    x = peaking(x, 2600, 3, 1.2)
    x = hp(x, 140, 2)
    x = reverb(x, 4.5, 0.36, bright=0.55, tail=False)
    x = fade(x, fout=2.0)
    return norm_peak(x, -1.5), {}


def build_count(wrong=False):
    """點名的一聲：悶住的低音鋼琴 + 軟槌定音鼓 + 一點木頭聲；第六聲走音、多一個不對的高泛音"""
    dur = 3.0 if wrong else 1.6
    n = sec(dur)
    p, _ = tuned('Keys/Upright Piano/Player_dyn1_rr1_004.wav', HZ['F1'], HZ['E1'] * (semis(-0.45) if wrong else 1))
    p = lp(onset(p), 1100, 2)
    p = pad_to(p / peak(p), n) * exp_env(n, 0.32 if not wrong else 0.9, 0.03)
    tm = onset(S('Percussion/Timpani/Timpani1_Hit_v1_rr1_Sum.wav'))
    tm = lp(pad_to(resample(tm / peak(tm), semis(-3)), n), 300, 2) * exp_env(n, 0.3 if not wrong else 0.7, 0.02)
    cl = onset(S('Percussion/Claves1_Hit_v1_rr1_Sum.wav'))
    cl = pad_to(lp(cl / peak(cl), 2500), n)
    x = p * 0.8 + tm * 0.55 + cl * 0.035
    if wrong:
        h, _ = tuned('Strings/Solo Violin/Arco Vib/LLVln_ArcoVib_A5_p.wav', HZ['A5'], HZ['A#5'])
        h = sustain(h, dur, 1.5, 12.0, grain=1.0, seed=101)
        h = peaking(hp(h, 1200), 5000, 6, 1)
        t = np.arange(n) / SR
        x += h / (rms(h) + 1e-9) * 0.05 * np.minimum(1, t / 0.25) * np.exp(-t / 1.2)
    x = reverb(x, 2.0, 0.24, bright=0.3, tail=False)
    return norm_peak(fade(x, fout=0.4), -2.0 if not wrong else -1.5), {}


def tine(freq, dur=1.8, seed=0):
    """八音盒的簧片：懸臂梁的非諧波泛音（1 : 6.27 : 17.55），高泛音衰減很快；起音有一點撥片的噪音"""
    rng = np.random.default_rng(seed)
    n = sec(dur)
    t = np.arange(n) / SR
    tau = 1.25 * (1046.5 / freq) ** 0.35
    x = np.zeros(n)
    for r, a, k in [(1.0, 1.0, 1.0), (2.0, 0.05, 0.4), (6.27, 0.22, 0.16), (17.55, 0.07, 0.05)]:
        f = freq * r
        if f > SR * 0.45:
            continue
        x += a * np.sin(2 * np.pi * f * t + rng.uniform(0, 6.28)) * np.exp(-t / (tau * k))
    click = bp(rng.standard_normal(sec(0.004)), 5000, 11000) * np.linspace(1, 0, sec(0.004))
    x[:len(click)] += click * 0.25
    x *= np.minimum(1, t / 0.0015)
    return x


def build_mbox(midi):
    f = 440 * 2 ** ((midi - 69) / 12)
    x = tine(f, 1.9, seed=midi)
    # 小木盒的共鳴與房間
    x = peaking(x, 520, 4, 1.2)
    x = reverb(x, 1.1, 0.28, bright=0.6, pre=0.004, tail=False)
    x = fade(x, fout=0.5)
    return norm_peak(x, -3.0), {'midi': midi}


def build_windup():
    x = S('fs:336610_5923045-hq.mp3')
    x = trim(x, -45)[:sec(1.3)]
    x = hp(fade(x, fin=0.01, fout=0.25), 300)
    return norm_peak(x, -6.0), {}


def build_meilan():
    """美蘭的哭腔：真實二胡長音（Freesound CC0）做出滑音、哭腔頓挫與最後往下垂的尾音"""
    src = S('fs:467482_5876986-hq.mp3')
    hz = f0(src, lo=620, hi=780, at=3.0, win=1.0)
    body = src[sec(0.35):]
    # 目標音高輪廓（D 羽調式：D5 F5 G5 A5 C6）
    pts = [(0.0, 'C5'), (0.22, 'D5'), (1.25, 'D5'), (1.5, 'F5'), (2.25, 'F5'), (2.45, 'G5'), (2.65, 'A5'), (3.9, 'A5'), (4.05, 'G#5'),
           (4.2, 'A5'), (4.35, 'G5'), (5.0, 'G5'), (5.25, 'F5'), (5.9, 'F5'), (6.15, 'D5'), (6.9, 'D5'), (7.9, 'A4'), (8.4, 'G4')]
    dur = 8.4
    n = sec(dur)
    t = np.arange(n) / SR
    semi = np.interp(t, [p[0] for p in pts], [12 * np.log2(HZ[p[1]] / hz) for p in pts])
    # 越到後面顫音越寬（哭腔）
    vib = (8 + 22 * np.clip((t - 2.6) / 1.3, 0, 1) * (t < 6.2)) * np.sin(2 * np.pi * 5.6 * t) / 100
    rate = semis(semi + vib)
    y = varispeed(np.concatenate([body, body[::-1], body]), rate)
    amp = env_points(n, [(0, 0), (0.12, 0.55), (1.2, 0.8), (1.45, 0.55), (2.3, 0.9), (2.6, 0.7), (3.7, 1.0), (4.1, 0.6), (4.3, 0.85),
                         (5.1, 0.7), (5.3, 0.5), (6.0, 0.7), (6.3, 0.45), (7.0, 0.5), (8.0, 0.08), (8.4, 0)])
    y = y * amp
    y = lp(hp(y, 180), 7000)
    y = reverb(y, 2.4, 0.38, bright=0.45, tail=True)
    y = fade(y[:sec(9.2)], fout=1.0)
    return nlufs(y, -22), {}


def build_suona():
    x = S('fs:514114_9230590-hq.mp3')
    x = resample(trim(x, -50), semis(-2))
    x = bp(x, 280, 5200)
    x = lp(x, 2800, 2)
    x = reverb(x, 3.6, 0.58, bright=0.3, tail=True)
    x = fade(x[:sec(5.5)], fin=0.08, fout=1.4)
    return nlufs(x, -26), {}


# ───────────────────────── 輸出 ─────────────────────────
JOBS = {
    'bed': ('score_bed', build_bed),
    'unease': ('score_unease', build_unease),
    'chase': ('score_chase', build_chase),
    'pulse': [('score_pulse_1', lambda: build_pulse(0)), ('score_pulse_2', lambda: build_pulse(1))],
    'tick': [('score_tick_1', lambda: build_tick(0)), ('score_tick_2', lambda: build_tick(1))],
    'heart': [('score_heart_lub', lambda: build_heart('lub')), ('score_heart_dub', lambda: build_heart('dub'))],
    'hit_big': [('score_hit_big_1', lambda: build_hit_big(0)), ('score_hit_big_2', lambda: build_hit_big(1)), ('score_hit_big_3', lambda: build_hit_big(2))],
    'hit_small': [(f'score_hit_small_{i + 1}', (lambda i=i: build_hit_small(i))) for i in range(3)],
    'riser': [('score_riser', build_riser), ('score_riser_rev', build_riser_rev)],
    'braam': ('score_braam', build_braam),
    'swell': ('score_swell', build_swell),
    'tail': ('score_tail', build_tail),
    'qing': ('score_qing', build_qing),
    'count': [('score_count', lambda: build_count(False)), ('score_count6', lambda: build_count(True))],
    'mbox': [(f'score_mbox_{m}', (lambda m=m: build_mbox(m))) for m in (72, 79, 84, 91)],
    'windup': ('score_windup', build_windup),
    'meilan': ('score_meilan', build_meilan),
    'suona': ('score_suona', build_suona),
}


LOOP_PAD = 0.1


def main():
    want = sys.argv[1:] or list(JOBS)
    rep_path = os.path.join(WORK, 'report.json')
    rep = {}
    if os.path.exists(rep_path):
        import json
        with open(rep_path, encoding='utf-8') as f:
            rep = json.load(f)
    for key in want:
        jobs = JOBS[key] if isinstance(JOBS[key], list) else [JOBS[key]]
        for name, fn in jobs:
            x, meta = fn()
            x = np.clip(x, -0.999, 0.999)
            save_wav(x, os.path.join(WORK, 'preview', name + '.wav'))
            loop = bool(meta.get('loop'))
            P = sec(LOOP_PAD)
            # 循環素材：前後各多放 0.1 秒（接續的內容），引擎只循環 [loopStart, loopEnd]，Vorbis 在檔案頭尾的失真落在循環區外
            enc = np.concatenate([x[-P:], x, x[:P]]) if loop else x
            save_ogg(enc, os.path.join(OUT, name + '.ogg'), q=4)
            back = load(os.path.join(OUT, name + '.ogg'))  # 量測解碼後的成品（Vorbis 可能讓峰值略升）
            for _ in range(3):  # 解碼後峰值超過 -1 dBFS：整體壓低再編一次
                pk = db(peak(back))
                if pk <= -1.05:
                    break
                enc = enc * undb(-1.15 - pk)
                save_ogg(enc, os.path.join(OUT, name + '.ogg'), q=4)
                back = load(os.path.join(OUT, name + '.ogg'))
            if loop:
                meta['loopStart'] = LOOP_PAD
                meta['loopEnd'] = round(LOOP_PAD + len(x) / SR, 6)
                back = back[P:P + len(x)]
            m = measure(back, loop=loop)
            m['bytes'] = os.path.getsize(os.path.join(OUT, name + '.ogg'))
            m.update({k: v for k, v in meta.items() if k != 'loop'})
            rep[name] = m
            print(name, m, flush=True)
    save_report(rep_path, rep)
    tot = sum(v['bytes'] for v in rep.values())
    secs = sum(v['seconds'] for v in rep.values())
    print(f'TOTAL {len(rep)} files, {tot / 1048576:.2f} MB on disk, {secs:.1f} s, decoded@48k mono {secs * SR * 4 / 1048576:.1f} MB')


if __name__ == '__main__':
    main()
