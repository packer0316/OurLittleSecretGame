"""vox 組：把本機 TTS 念出來的台詞（原料）處理成各個角色。
每個 preset 拿 WORLD 聲碼器的分析結果（F0、頻譜包絡、非週期成分）改音高、共振峰、氣聲、節奏，
再疊上角色的質感（錄音帶、電話、隔著門、借來的聲音、「它」的多層聲音），讓它不像電腦語音。
"""
import os
import zlib

import numpy as np

from dsp import (SR, FP, load, resample, world, synth, warp_sp, f0_to, f0_mod, breathy, stretch, hold_last, fit_len,
                 hp, lp, bp, biquad, soft_clip, reverse_swell, door_muffle, proximity, sbr_air, ring, tape, phone, radio,
                 stutter, mix, trim, fade)

TTS_SR = 16000
MALE, FEMALE = 125.0, 190.0


class Ctx:
    def __init__(self, tts_dir, cache_dir, raw):
        self.tts_dir, self.cache_dir, self.raw = tts_dir, cache_dir, raw

    def an(self, line_id, voice):
        path = os.path.join(self.tts_dir, f'{line_id}__{voice}.wav')
        x = load(path, TTS_SR)
        x = trim(x, TTS_SR, -46, 0.02)
        return world(x, TTS_SR, self.cache_dir, key=f'{line_id}__{voice}')


def up(y):
    """WORLD 在 16 kHz 合成 → 48 kHz"""
    return resample(y, TTS_SR, SR)


def render(an, f0=None, sp=None, ap=None):
    return up(synth(an['f0'] if f0 is None else f0, an['sp'] if sp is None else sp, an['ap'] if ap is None else ap, TTS_SR))


def voice(an, hz, fmt=1.0, expand=1.0, breath=0.0, jitter=0.004, trem=0.0, trem_rate=5.5, seed=0, whisper=False):
    f0 = f0_to(an['f0'], hz, expand)
    f0 = f0_mod(f0, trem_rate, trem, jitter, seed)
    sp = warp_sp(an['sp'], fmt)
    if whisper:
        # 耳語沒有聲帶振動：頻譜包絡裡的聲門低頻傾斜要拿掉（約 +5 dB/oct，低頻壓下去），F1 也略往上
        B = sp.shape[1]
        fr = np.arange(B) * (TTS_SR / 2) / (B - 1)
        tilt = np.clip(fr / 650.0, 0.25, 7.0) ** 1.33
        sp = warp_sp(sp, 1.06) * tilt[None, :]
    ap = np.ones_like(an['ap']) if whisper else breathy(an['ap'], breath)
    y = render(an, f0, sp, ap)
    if whisper:
        y = hp(y, 220)
        y = biquad(y, 'highshelf', 3000, SR, 0.7, 3.0)
        y = sbr_air(y, SR, -8)
    return y


def borrowed(y_main, an, hz, fmt, wrong, seed, expand=0.6, whisper=False, pre=0.55):
    """借來的聲音：同一句話疊上一個差一點點的自己（拍頻）、更低的影子、被剪接過的頓挫、倒吸進來的殘響"""
    ghost = voice(an, hz * 1.012, fmt * 1.02, expand, breath=0.3, seed=seed + 7, whisper=whisper)
    sub = voice(an, hz * 0.5, fmt * 0.82, expand * 0.8, breath=0.55, seed=seed + 11)
    y = mix([(y_main, 1.0, 0.0), (ghost, 0.42 * wrong, 0.021), (lp(sub, 1800), 0.16 * wrong, 0.0)])
    y = stutter(y, SR, 1 + (1 if wrong > 0.55 else 0), seed=seed, drop=wrong > 0.7)
    return reverse_swell(y, SR, rt60=1.6, pre=pre, wet=0.22 + 0.25 * wrong, seed=seed) if pre > 0 else y


def it_voice(c, line, seed=0, hz=74.0, fmt=0.86):
    """「它」自己的聲音：低八度上下的男聲（壓平、粗糙）＋ 同一句的女聲耳語 ＋ 更低的次八度（環形調變）"""
    a = c.an(line['id'], 'zhiwei')
    a = stretch(a, 1.1)
    A = voice(a, hz, fmt, expand=0.55, breath=0.4, jitter=0.02, seed=seed)
    b = fit_len(c.an(line['id'], 'hanhan'), len(a['f0']))
    B = voice(b, 180, 1.0, whisper=True, seed=seed + 1)
    C = voice(a, hz * 0.5, fmt * 0.8, expand=0.4, breath=0.6, jitter=0.03, seed=seed + 2)
    C = ring(lp(C, 1400), SR, 31 + 6 * (seed % 3), 0.55)
    y = mix([(A, 1.0, 0.0), (B, 0.6, 0.035), (C, 0.42, 0.0)])
    y = soft_clip(y / (np.max(np.abs(y)) + 1e-9), 1.6)
    y = stutter(y, SR, 1, seed=seed)
    return reverse_swell(y, SR, rt60=2.2, pre=0.8, wet=0.45, seed=seed)


def p(line, k, d=None):
    return (line.get('fxp') or {}).get(k, d)


def build_line(c, line, take=0):
    fx, sd = line['fx'], take * 101 + (zlib.crc32(line['id'].encode()) % 997)
    tts = line['tts']
    a = c.an(line['id'], tts)
    slow = p(line, 'slow', 1.0)
    if slow != 1.0:
        a = stretch(a, slow)
    hold = p(line, 'hold', 0)
    if hold:
        a = hold_last(a, hold, glide_st=-1.2 if fx != 'rescuer' else -0.6)

    if fx == 'self':
        y = proximity(voice(a, MALE * 0.98, 1.0, 0.95, breath=0.12, seed=sd), SR, 2.0)
    elif fx == 'selfQuiet':
        y = voice(stretch(a, 1.05), MALE * 0.95, 1.0, 0.8, breath=0.38, seed=sd)
        y = lp(proximity(y, SR, 2.5), 9000)
    elif fx == 'selfDoor':
        y0 = voice(a, MALE * 0.96, 1.0, 0.6, breath=0.2, seed=sd)
        y = door_muffle(borrowed(y0, a, MALE * 0.96, 1.0, 0.55, sd), SR, 1500)
    elif fx == 'borrowed':
        base = FEMALE if tts != 'zhiwei' else MALE
        hz, fm, wr = base * p(line, 'f0', 1.0), p(line, 'fmt', 1.0), p(line, 'wrong', 0.5)
        y0 = voice(a, hz, fm, 1 - 0.45 * wr, breath=0.18, seed=sd)
        y = borrowed(y0, a, hz, fm, wr, sd)
    elif fx == 'seat':
        hz, fm = MALE * p(line, 'f0', 1.0), p(line, 'fmt', 1.0)
        y0 = voice(a, hz, fm, 0.5, breath=0.2, seed=sd)
        y = borrowed(y0, a, hz, fm, 0.35, sd, pre=0.18)
    elif fx == 'friendDoor':
        pan = p(line, 'panic', 0)
        hz, fm = MALE * p(line, 'f0', 1.0) * (1.12 if pan else 1.0), p(line, 'fmt', 1.0)
        y = voice(a, hz, fm, 1.3 if pan else 1.05, breath=0.25, trem=0.45 if pan else 0.2, trem_rate=6.2, jitter=0.012, seed=sd)
        if pan:
            y = soft_clip(y / (np.max(np.abs(y)) + 1e-9), 1.5)
        y = door_muffle(y, SR, 1700)
    elif fx == 'hoarse':
        y = voice(stretch(a, 1.18), MALE * p(line, 'f0', 0.9), 0.98, 0.7, breath=0.68, jitter=0.03, trem=0.15, seed=sd)
        y = lp(y, 6000)
    elif fx == 'tape':
        y = voice(stretch(a, 1.06), MALE * 0.86, 0.93, 0.85, breath=0.15, jitter=0.006, seed=sd)
        y = tape(y, SR, seed=sd)
    elif fx == 'tapeWoman':
        y = voice(a, FEMALE * 0.95, 1.0, 0.9, breath=0.2, seed=sd)
        y = tape(y, SR, seed=sd)
    elif fx == 'adults':
        b = c.an(line['id'], 'zhiwei')
        n = len(b['f0'])
        men = [(MALE * 1.24, 0.96, 0.0, 1.0), (MALE * 1.08, 1.04, 0.17, 0.62), (MALE * 1.38, 0.92, 0.36, 0.5)]
        if p(line, 'solo'):
            men = [(MALE * 1.1, 0.97, 0.0, 1.0), (MALE * 0.95, 1.03, 0.25, 0.3)]
        layers = []
        for i, (hz, fm, d, g) in enumerate(men):
            bb = stretch(b, [1.0, 1.06, 0.95][i])
            yy = voice(bb, hz, fm, 1.25, breath=0.1, jitter=0.01, seed=sd + i)
            layers.append((soft_clip(yy / (np.max(np.abs(yy)) + 1e-9), 2.2), g, d))
        y = biquad(mix(layers), 'peak', 2200, SR, 0.8, 4.0)
    elif fx == 'rescuer':
        shout = p(line, 'shout', 0)
        hz = MALE * p(line, 'f0', 1.0) * (1.28 if shout else 1.08)
        y = voice(a, hz, 1.0, 1.25 if shout else 1.05, breath=0.05, seed=sd)
        y = biquad(y, 'peak', 2000, SR, 0.8, 4.0 if shout else 2.0)
        if shout:
            y = soft_clip(y / (np.max(np.abs(y)) + 1e-9), 2.0)
    elif fx == 'radio':
        y = voice(a, MALE * p(line, 'f0', 0.92), 0.98, 0.9, breath=0.08, seed=sd)
        y = radio(y, SR, seed=sd)
    elif fx == 'phoneIt':
        calm = p(line, 'calm', 0)
        y0 = voice(a, MALE * 0.97, 1.0, 0.4 if calm else 0.6, breath=0.15, seed=sd)
        y = borrowed(y0, a, MALE * 0.97, 1.0, 0.5, sd, expand=0.4)
        y = phone(y, SR, seed=sd)
    elif fx in ('child', 'childDoor', 'childFar'):
        far = fx == 'childFar'
        aa = stretch(a, 1.08 if not far else 1.15)
        y = voice(aa, 300, 1.18, 1.25, breath=(0.35 if p(line, 'near') else 0.52) if far else 0.15, jitter=0.006, seed=sd)
        if fx == 'childDoor':
            y = door_muffle(y, SR, 2100, 260)
        if far:
            y = lp(y, 5200)
    elif fx in ('kidBoy', 'kidGirl'):
        hz, fm = 205 * p(line, 'f0', 1.45), p(line, 'fmt', 1.16)
        y = voice(stretch(a, 1.05), hz, fm, 1.45 if p(line, 'sly') else 1.2, breath=0.13, jitter=0.006, seed=sd)
        if p(line, 'seat'):
            y = borrowed(y, a, hz, fm, 0.4, sd, pre=0.18)
    elif fx == 'childWhisper':
        hz, fm = 205 * p(line, 'f0', 1.42), p(line, 'fmt', 1.17)
        y = voice(stretch(a, 1.06), hz, fm, 1.2, whisper=True, seed=sd)
        y = proximity(y, SR, 3.0)
    elif fx == 'womanCall':
        hz = FEMALE * 0.96 * p(line, 'f0', 1.0)
        rough = p(line, 'rough', 0)
        y0 = voice(a, hz, 1.0, 1.1, breath=0.22, jitter=0.03 if rough else 0.008, trem=0.12, seed=sd)
        y = borrowed(y0, a, hz, 1.0, 0.3, sd, pre=0.3)
        if rough:
            y = soft_clip(y / (np.max(np.abs(y)) + 1e-9), 1.8)
    elif fx == 'womanWhisper':
        y = proximity(voice(a, FEMALE, 1.0, 1.0, whisper=True, seed=sd), SR, 3.0)
    elif fx == 'manCloth':
        y = voice(a, MALE * p(line, 'f0', 1.0), p(line, 'fmt', 1.0), 0.7, breath=0.2, seed=sd)
    elif fx == 'manClothWhisper':
        y = proximity(voice(a, MALE * p(line, 'f0', 1.0), p(line, 'fmt', 1.0), 1.0, whisper=True, seed=sd), SR, 2.0)
    elif fx == 'meilanTrue':
        y = voice(stretch(a, 1.1), FEMALE * 0.93, 1.0, 0.9, breath=0.32, trem=0.18, trem_rate=4.8, seed=sd)
        y = biquad(y, 'lowshelf', 250, SR, 0.7, 2.0)
    elif fx == 'meilanScream':
        aa = hold_last(stretch(a, 1.08), 0.45, glide_st=-2.5, vib_st=0.6)
        y0 = voice(aa, 345, 1.07, 1.45, breath=0.28, jitter=0.035, trem=0.5, trem_rate=6.5, seed=sd)
        y0 = soft_clip(y0 / (np.max(np.abs(y0)) + 1e-9), 2.4)
        gasp = c.raw.get('gaspF')
        y = mix([(gasp, 0.55, 0.0), (y0, 1.0, 0.32)]) if gasp is not None else y0
    elif fx == 'itScream':
        aa = hold_last(stretch(a, 1.05), 0.75, glide_st=-4.0, vib_st=0.9)
        A = voice(aa, 330, 1.1, 1.3, breath=0.3, jitter=0.045, seed=sd)
        Bv = voice(aa, 165, 0.85, 1.0, breath=0.5, jitter=0.05, seed=sd + 1)
        y = mix([(A, 1.0, 0.0), (Bv, 0.55, 0.0)])
        y = soft_clip(y / (np.max(np.abs(y)) + 1e-9), 3.0)
        sc = c.raw.get('screamLow')
        if sc is not None:
            y = mix([(y, 1.0, 0.0), (sc[: len(y)], 0.4, 0.12)])
        y = reverse_swell(y, SR, rt60=1.8, pre=0.5, wet=0.3, seed=sd)
    elif fx == 'it':
        y = it_voice(c, line, sd)
    elif fx == 'itDoor':
        y = door_muffle(it_voice(c, line, sd, hz=[74, 68, 80][take % 3]), SR, 1700)
    elif fx == 'itWhisper':
        z = c.an(line['id'], 'zhiwei')
        Z = voice(z, MALE, 0.92, 1.0, whisper=True, seed=sd)
        h = fit_len(c.an(line['id'], 'hanhan'), len(z['f0']))
        H = voice(h, FEMALE, 1.0, 1.0, whisper=True, seed=sd + 1)
        y = proximity(mix([(Z, 1.0, 0.0), (H, 0.75, 0.028 + 0.01 * take)]), SR, 4.0)
        y = reverse_swell(y, SR, rt60=1.2, pre=0.4, wet=0.25, seed=sd)
    elif fx == 'itChoir':
        z = c.an(line['id'], 'zhiwei')
        n = len(z['f0'])
        ya = fit_len(c.an(line['id'], 'yating'), int(n * 1.04))
        hn = fit_len(c.an(line['id'], 'hanhan'), int(n * 0.97))
        layers = [
            (voice(z, 104, 0.97, 0.5, breath=0.3, seed=sd), 1.0, 0.0),
            (voice(ya, 175, 1.0, 0.5, breath=0.3, seed=sd + 1), 0.8, 0.06),
            (voice(hn, 158, 0.98, 0.5, breath=0.35, seed=sd + 2), 0.75, 0.12),
            (voice(z, 62, 0.82, 0.4, whisper=True, seed=sd + 3), 0.7, 0.03),
        ]
        y = stutter(mix(layers), SR, 1, seed=sd)
        y = reverse_swell(y, SR, rt60=2.0, pre=0.7, wet=0.4, seed=sd)
    elif fx == 'itMouth':
        S = voice(a, MALE * 0.98, 1.0, 0.9, breath=0.12, seed=sd)
        A = voice(a, 70, 0.86, 0.5, breath=0.45, jitter=0.02, seed=sd + 1)
        Cs = ring(lp(voice(a, 36, 0.8, 0.4, breath=0.6, seed=sd + 2), 900), SR, 33, 0.5)
        y = mix([(S, 1.0, 0.0), (A, 0.85, 0.0), (Cs, 0.5, 0.0)])
    else:
        raise ValueError('unknown fx ' + fx)

    if fx in ('childWhisper', 'womanWhisper', 'manClothWhisper', 'itWhisper'):
        # 耳語太亮（齒擦音、合成的空氣聲過多）就收一點，頻譜重心留在 1.2–3 kHz
        spec = np.abs(np.fft.rfft(y)) ** 2
        fr = np.fft.rfftfreq(len(y), 1 / SR)
        cen = float((spec * fr).sum() / (spec.sum() + 1e-12))
        if cen > 3000:
            y = lp(y, 5200, SR, 2)

    y = hp(y, 75 if fx not in ('child', 'childDoor', 'childFar', 'kidBoy', 'kidGirl', 'childWhisper') else 110)
    return y
