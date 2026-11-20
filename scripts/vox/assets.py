"""vox 組：Freesound 真人錄音（CC0 / CC BY）→ 遊戲用的單聲道點音源（多個變體）。
每個配方指定來源檔案與秒數區間（切點對齊到附近最安靜的位置），再做去 DC、高通、去頭尾靜音、淡入淡出、響度正規化。
「它」的聲音（尖嘯、倒放吸氣、數數的第六聲）用處理過的人聲：降調疊加、倒放、環形調變、WORLD 改音高。
"""
import math
import os

import numpy as np

from dsp import (SR, FP, load, resample, world, synth, warp_sp, f0_to, f0_mod, breathy, stretch, hp, lp, bp, biquad, soft_clip,
                 reverse_swell, door_muffle, proximity, ring, phone, mix, trim, fade, valley_near, normalize, events, env_db, level)


class Raw:
    def __init__(self, raw_dir, manifest):
        self.dir = raw_dir
        self.by_id = {e['id']: e for e in manifest}
        self.cache = {}

    def x(self, sid):
        if sid not in self.cache:
            self.cache[sid] = load(os.path.join(self.dir, self.by_id[sid]['file']))
        return self.cache[sid]

    def seg(self, sid, s, t, snap=0.06):
        x = self.x(sid)
        if snap:
            s = valley_near(x, s, SR, snap)
            t = valley_near(x, t, SR, snap)
        return x[max(0, int(s * SR)):min(len(x), int(t * SR))].copy()

    def src(self, sid):
        e = self.by_id[sid]
        return {'title': e['title'], 'author': e['author'], 'license': e['license'], 'url': e['url']}


def clean(x, hpf=90, lpf=None, thr=-50, fin=0.008, fout=0.06):
    y = hp(x, 22, SR, 2)
    y = hp(y, hpf, SR, 2) if hpf else y
    if lpf:
        y = lp(y, lpf, SR, 2)
    y = trim(y, SR, thr, 0.02)
    return fade(y, SR, fin, fout)


def gate(x, floor_db=-58, rel=-38):
    """很輕的下行擴展：把呼吸間的底噪壓下去（不是降噪，只是讓尾巴乾淨）"""
    e, h = env_db(x, SR, 0.03, 0.005)
    thr = max(floor_db, e.max() + rel)
    g = np.clip((e - thr) / 10 + 1, 0.12, 1.0)
    g = np.convolve(g, np.ones(8) / 8, mode='same')
    gi = np.interp(np.arange(len(x)), np.arange(len(g)) * h, g)
    return x * gi


# ───────────────────────── 哼唱：真人的嗓音，換成遊戲自己的旋律 ─────────────────────────

def hum_melody(src, phrase, notes, flats=(), slow=1.0, vib=(5.3, 16, 30), seed=0, end_glide=-140, sr=24000, tune_jitter=(-22, 14), voice_fmt=1.0):
    """src：一段哼唱（只取有聲音框）。phrase：[(音名或 None, 秒)]。notes：音名 → Hz。flats：要唱偏低的音（索引）。"""
    rng = np.random.default_rng(seed)
    x = resample(src, SR, sr)
    an = world(x, sr)
    v = an['f0'] > 0
    SPv, APv = an['sp'][v], an['ap'][v]
    if len(SPv) < 50:
        raise RuntimeError('hum source has too few voiced frames')
    frames = [max(1, int(d * slow * (1.12 if i > 8 else 1.0) * 1000 / FP)) for i, (n, d) in enumerate(phrase)]
    total_voiced = sum(f for (n, _), f in zip(phrase, frames) if n)
    pos = np.linspace(0, len(SPv) - 1, total_voiced)
    f0, sp, ap = [], [], []
    k = 0
    B = an['sp'].shape[1]
    for i, ((n, d), nf) in enumerate(zip(phrase, frames)):
        if not n:
            f0 += [0.0] * nf
            sp += [np.full(B, 1e-12)] * nf
            ap += [np.ones(B)] * nf
            continue
        cents = -rng.uniform(55, 95) if i in flats else rng.uniform(*tune_jitter)
        hz = notes[n] * 2 ** (cents / 1200)
        idx = pos[k:k + nf].astype(int)
        k += nf
        t = np.arange(nf) / nf
        envl = np.minimum(1, t * nf * FP / 1000 / 0.06) * (1 - 0.55 * np.clip((t - 0.72) / 0.28, 0, 1))
        for j in range(nf):
            f0.append(hz)
            sp.append(SPv[idx[j]] * envl[j] ** 2)
            ap.append(APv[idx[j]])
        if i == len(phrase) - 1 and end_glide:
            m = nf // 2
            for j in range(m):
                f0[-m + j] = hz * 2 ** (end_glide * (j / m) ** 1.5 / 1200)
    f0 = np.array(f0)
    # 滑音（一階平滑，只在有聲段）＋ 慢慢變深的顫音
    sm = f0.copy()
    a = math.exp(-FP / 1000 / 0.045)
    for i in range(1, len(sm)):
        if f0[i] > 0 and sm[i - 1] > 0:
            sm[i] = a * sm[i - 1] + (1 - a) * f0[i]
    t = np.arange(len(sm)) * FP / 1000
    depth = np.interp(t, [0, t[-1] * 0.5, t[-1]], [0, vib[1], vib[2]])
    sm = np.where(sm > 0, sm * 2 ** (depth * np.sin(2 * math.pi * vib[0] * t) / 1200), 0)
    sp = np.maximum(warp_sp(np.array(sp), voice_fmt), 1e-14)  # 全零的頻譜包絡會讓 WORLD 算出 NaN
    y = synth(sm, sp, np.array(ap), sr)
    return resample(y, sr, SR)


def scramble(x, seed=0, min_len=0.11, max_len=0.34, rev=0.4):
    """把正向播放的耳語切成音節長度的小段（切點落在能量低谷），打亂順序、部分倒放，交叉淡化接回去：
    保留氣聲與節奏，但任何語言的字句都拼不回來（台灣廟裡不能聽到一句英文）"""
    rng = np.random.default_rng(seed)
    e, h = env_db(x, SR, 0.02, 0.005)
    cuts, last = [0], 0
    i = int(min_len * SR / h)
    while i < len(e) - 1:
        hi = min(len(e) - 1, last + int(max_len * SR / h))
        lo = last + int(min_len * SR / h)
        if lo >= hi:
            break
        j = lo + int(np.argmin(e[lo:hi]))
        cuts.append(j * h)
        last = j
        i = j + int(min_len * SR / h)
    cuts.append(len(x))
    segs = [x[a:b].copy() for a, b in zip(cuts[:-1], cuts[1:]) if b - a > int(0.03 * SR)]
    order = list(range(len(segs)))
    for _ in range(8):  # 打亂到幾乎沒有原本相鄰的兩段
        rng.shuffle(order)
        if sum(1 for a, b in zip(order, order[1:]) if b == a + 1) <= len(order) // 8:
            break
    f = int(0.008 * SR)
    out = np.zeros(0)
    for k in order:
        sg = segs[k][::-1].copy() if rng.random() < rev else segs[k]
        if len(sg) > 2 * f:
            sg[:f] *= np.linspace(0, 1, f)
            sg[-f:] *= np.linspace(1, 0, f)
        if len(out) >= f and len(sg) >= f:
            out[-f:] += sg[:f]
            out = np.concatenate([out, sg[f:]])
        else:
            out = np.concatenate([out, sg])
    return out


def build_assets(raw, extra):
    """回傳 dict：名稱 → { takes: [np.ndarray], target: LUFS, sources: [...], notes, dest: 'bank'|'core' }"""
    A = {}

    def add(name, takes, target, sources, notes, dest='core', take_src=None):
        A[name] = {'takes': takes, 'target': target, 'sources': sources, 'notes': notes, 'dest': dest,
                   'take_src': [[raw.src(i) for i in ids] for ids in take_src] if take_src else None}

    # ── 耳語（貼耳，聽不出字）：男聲、女聲多層、瑞典語倒放 ──
    w = [
        clean(proximity(scramble(raw.seg(517868, 2.19, 4.55), 11), SR, 3), 110),
        clean(proximity(scramble(raw.seg(517868, 4.55, 7.10), 12), SR, 3), 110),
        clean(scramble(raw.seg(193812, 1.90, 4.15), 13, rev=0.5), 140),
        clean(proximity(raw.seg(405210, 9.39, 11.27)[::-1].copy(), SR, 2.5), 120),
        clean(proximity(raw.seg(405210, 14.77, 16.82)[::-1].copy(), SR, 2.5), 120),
    ]
    add('whisper', w, -20, [raw.src(517868), raw.src(193812), raw.src(405210)], '貼耳耳語：男聲與四層男聲疊錄切成音節長度的小段、打亂順序並部分倒放；女聲瑞典語段落整段倒放。任何語言的字句都拼不回來', dest='bank',
        take_src=[[517868], [517868], [193812], [405210], [405210]])

    # ── 耳語雲：四面八方湧上來（約 5.5 秒，淡入淡出）──
    cloud = mix([(scramble(raw.seg(185059, 3.0, 9.0, snap=0), 21), 1.0, 0.0), (hp(raw.seg(193812, 1.85, 7.6, snap=0)[::-1].copy(), 150), 0.8, 0.3)])
    cloud = fade(hp(cloud, 130), SR, 1.8, 2.2)
    add('whisperCloud', [cloud], -22, [raw.src(185059), raw.src(193812)], '多層耳語疊成的耳語雲（一層切成音節打亂、一層整段倒放，聽不出任何字；淡入淡出的一次性湧現）')

    # ── 頸後的呼吸：一吸一吐 ──
    b = [
        clean(gate(raw.seg(271045, 2.85, 4.75)), 80, thr=-56),
        clean(gate(raw.seg(271045, 5.72, 7.50)), 80, thr=-56),
        clean(gate(raw.seg(369294, 3.0, 6.45)), 80, thr=-56, fout=0.4),
        clean(gate(raw.seg(554906, 3.40, 5.60)), 80, thr=-56),
    ]
    add('breath', b, -22, [raw.src(271045), raw.src(369294), raw.src(554906)], '頸後的呼吸（吸一口、吐一口），近距離、乾聲', dest='bank',
        take_src=[[271045], [271045], [369294], [554906]])

    # ── 倒抽一口氣 ──
    # 遊戲裡的 gasp 幾乎都是玩家（陳以安，男）自己喘出聲：用男聲
    g = [
        clean(raw.seg(171942, 1.40, 1.95, snap=0.03), 110),
        clean(raw.seg(171942, 3.80, 4.42, snap=0.03), 110),
        clean(raw.seg(171942, 12.62, 13.15, snap=0.03), 110),
        clean(raw.seg(180005, 0.28, 0.98, snap=0.03), 110),
    ]
    add('gasp', g, -18, [raw.src(171942), raw.src(180005)], '受驚倒抽氣（男聲，玩家自己喘出聲）', dest='bank',
        take_src=[[171942], [171942], [171942], [180005]])
    extra['gaspF'] = normalize(clean(raw.seg(346213, 6.21, 7.02), 120), SR, -20)

    # ── 女人的啜泣 ──
    s = [
        clean(gate(raw.seg(172738, 9.80, 13.2)), 120, fout=0.3),
        clean(gate(raw.seg(790620, 1.90, 5.6)), 120, fout=0.3),
        clean(gate(raw.seg(449439, 4.75, 8.95)), 120, fout=0.4),
    ]
    add('sob', s, -20, [raw.src(172738), raw.src(790620), raw.src(449439)], '女人壓抑的啜泣與抽氣')

    # ── 小孩笑聲 ──
    L = [
        clean(raw.seg(365632, 1.20, 3.40), 150),
        clean(raw.seg(461790, 0.02, 1.95), 150),
        clean(raw.seg(135387, 0.0, 1.42, snap=0.03), 150),
        clean(raw.seg(616088, 0.55, 1.95), 150),
    ]
    add('childLaugh', L, -19, [raw.src(365632), raw.src(461790), raw.src(135387), raw.src(616088)], '單一個小孩的笑聲（男孩、女孩）')
    add('childLaughFar', [clean(raw.seg(652992, 5.10, 7.55), 200, fout=0.5)], -21, [raw.src(652992)], '遠處、帶回音的女孩笑聲')
    gg = [
        clean(lp(raw.seg(86991, 0.20, 0.90), 3800), 160),
        clean(lp(raw.seg(86991, 3.60, 4.40), 3800), 160),
        clean(lp(raw.seg(365632, 3.62, 4.62), 3800), 160),
    ]
    add('giggle', gg, -19, [raw.src(86991), raw.src(365632)], '壓低的小孩竊笑（短、悶，像躲在布幔後面）')

    # ── 哼唱：真人嗓音換成遊戲的童謠旋律（五聲音階，幾個音偏低） ──
    kid = np.concatenate([raw.seg(442600, s0, s1) for s0, s1 in [(1.31, 2.62), (2.92, 4.12), (5.78, 7.50), (9.28, 10.34), (10.77, 11.88)]])
    N = {'E': 329.63, 'G': 392.0, 'A': 440.0, 'C': 523.25, 'D': 587.33}
    PH = [('A', 0.62), ('C', 0.3), ('A', 0.62), ('G', 0.34), ('E', 0.62), ('G', 0.3), ('A', 0.95), (None, 0.35), ('A', 0.3), ('C', 0.3), ('D', 0.66), ('C', 0.34), ('A', 1.5)]
    ch = [clean(level(hum_melody(kid, PH, N, flats=(4, 10), slow=1.08, seed=3), SR, 3.0), 150, fout=0.5),
          clean(level(hum_melody(kid, PH, N, flats=(3, 10), slow=1.15, seed=8, voice_fmt=1.04), SR, 3.0), 150, fout=0.5)]
    add('childHum', ch, -20, [raw.src(442600)], '小孩哼唱的嗓音（真人），以 WORLD 換成遊戲的走音童謠旋律（第 4／5 與第 11 個音偏低）')
    mom = np.concatenate([raw.seg(179928, s0, s1) for s0, s1 in [(0.39, 4.68), (5.22, 9.24), (10.07, 14.39)]])
    NM = {'E': 247.0, 'G': 294.0, 'A': 330.0, 'C': 392.0, 'D': 440.0}
    PM = [('A', 0.7), ('C', 0.36), ('A', 0.7), ('G', 0.4), ('E', 0.7), ('G', 0.36), ('A', 1.1), (None, 0.4), ('A', 0.36), ('C', 0.36), ('D', 0.74), ('C', 0.4), ('A', 1.9)]
    mh = clean(level(hum_melody(mom, PM, NM, slow=1.0, vib=(4.9, 9, 12), seed=5, end_glide=0, tune_jitter=(-4, 4)), SR, 2.5), 110, fout=0.6)
    add('motherHum', [mh], -20, [raw.src(179928)], '女人哼搖籃曲的嗓音（真人），換成同一首童謠——這一次每個音都是準的')

    # ── 尖叫（美蘭）──
    sc = [clean(raw.seg(35716, 1.68, 3.70), 140, fout=0.25), clean(raw.seg(320740, 0.27, 2.45), 140, fout=0.25)]
    add('scream', sc, -16, [raw.src(35716), raw.src(320740)], '女人恐懼的尖叫（無字）')
    low = raw.seg(320740, 4.30, 6.20)
    extra['screamLow'] = normalize(resample(low, SR, int(SR / 0.8))[: int(len(low) / 0.8)], SR, -18)

    # ── 「它」的尖嘯：真人尖叫降調、倒放吸進來、環形調變、飽和 ──
    def shriek(seg, seed):
        x = seg / (np.max(np.abs(seg)) + 1e-9)
        dn = resample(x, SR, int(SR / 0.74))  # 降約 5 個半音、變長
        dn = dn[: int(len(x) * 1.15)]
        rm = ring(x, SR, 71, 0.6)
        y = mix([(dn, 1.0, 0.0), (rm, 0.55, 0.0), (x, 0.45, 0.0)])
        y = soft_clip(y / (np.max(np.abs(y)) + 1e-9), 2.6)
        y = reverse_swell(y, SR, rt60=1.4, pre=0.35, wet=0.45, seed=seed)
        return clean(y, 120, fout=0.3)
    sh = [shriek(raw.seg(208893, 1.15, 2.15), 1), shriek(raw.seg(320740, 4.30, 6.10), 2)]
    add('shriek', sh, -16, [raw.src(208893), raw.src(320740)], '「它」的尖嘯：真人尖叫降調疊加、倒放、環形調變與飽和')

    # ── 呻吟 ──
    mo = [clean(raw.seg(377737, 0.40, 3.45), 100, fout=0.4), clean(raw.seg(235796, 0.80, 3.90), 80, fout=0.4),
          clean(resample(raw.seg(58626, 3.0, 5.7), SR, int(SR / 0.9)), 70, fout=0.4)]
    add('moan', mo, -20, [raw.src(377737), raw.src(235796), raw.src(58626)], '低吟／呻吟（女聲的鬼魅低吟、男聲的低沉呻吟、放慢的長呻吟）')

    # ── 小孩的哭 ──
    add('childCry', [clean(gate(raw.seg(504681, 0.15, 2.25)), 160, fout=0.3), clean(gate(raw.seg(504681, 3.55, 6.25)), 160, fout=0.3)], -20, [raw.src(504681)], '小女孩的啜泣')

    # ── 噓 ──
    add('shush', [clean(raw.seg(321588, 0.0, 1.5, snap=0.02), 200, fout=0.2), clean(raw.seg(321588, 2.6, 4.2, snap=0.04), 200, fout=0.2)], -21, [raw.src(321588)], '貼耳的「噓——」')

    # ── 咳嗽（門後的人醒過來）──
    co = [clean(raw.seg(51136, 0.80, 1.95), 90), clean(raw.seg(369295, 0.42, 1.95), 90), clean(raw.seg(184871, 3.35, 4.65), 90)]
    add('cough', co, -19, [raw.src(51136), raw.src(369295), raw.src(184871)], '成年男人的咳嗽（一陣兩三聲）')

    # ── 吸一口氣（屏住呼吸前）──
    add('inhale', [clean(raw.seg(171942, 9.10, 9.75, snap=0.03), 110)], -21, [raw.src(171942)], '屏住呼吸前很快地吸一口氣')

    # ── 「它」的動機：倒放的吸氣 ──
    inh = raw.seg(369294, 3.0, 5.0)
    rv = reverse_swell(inh[::-1].copy(), SR, rt60=2.0, pre=0.6, wet=0.6, seed=4)
    rv = mix([(rv, 1.0, 0.0), (lp(resample(rv, SR, int(SR / 0.7))[: len(rv)], 1200), 0.5, 0.0)])
    add('itBreath', [clean(rv, 70, fin=0.2, fout=0.08)], -20, [raw.src(369294)], '倒放的吸氣（加倒放殘響與降調的影子），「它」的動機')

    # ── 電話裡那口被重複的吸氣（一模一樣的兩次）──
    one = clean(raw.seg(554906, 3.40, 4.35), 80, fout=0.05)
    rep = mix([(one, 1.0, 0.0), (one, 1.0, len(one) / SR + 0.32)])
    add('phoneBreath', [phone(rep, SR, seed=2)], -22, [raw.src(554906)], '電話線路裡的吸氣：同一口氣、完全一樣地重複兩次')

    return A
