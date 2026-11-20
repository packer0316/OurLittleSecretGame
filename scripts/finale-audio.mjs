// finale：程序合成聲音的離線檢查。每一種聲音用 OfflineAudioContext 算出來，回報峰值與 RMS（不能是靜音、也不能爆音），
// 並把一段「門後」的聲音輸出成 artifacts/finale/finale-audio-*.wav 讓人實際聽。
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const out = 'artifacts/finale'; fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.stack || e.message));
let failed = false;
try {
  await page.goto('http://127.0.0.1:5178/');
  const res = await page.evaluate(async () => {
    const { AudioSys } = await import('/src/core/AudioSys.js');
    const { createFinaleAudio } = await import('/src/story/finaleAudio.js');
    const cases = {
      call: (f) => f.speak('yi3 an1 ni3 hui2 tou2 kan4 yi2 xia4', 'ahzhe', { dist: 0.4, behind: true }),
      child: (f) => f.speak('ma1 ma1 wo3 hai2 zai4', 'child', { dist: 1.2 }),
      scream: (f) => f.scream('xiao3 yu3'),
      shriek: (f) => f.shriek({ dist: 0.5 }),
      fire: (f) => { f.fire.set(1); for (let i = 0; i < 60; i++) f.update(1 / 20); },
      sizzle: (f) => f.sizzle.level(0.8),
      hum: (f) => f.hum({ dist: 1.8 }),
      clunk: (f) => f.clunk(),
      bang: (f) => f.bang(1),
      cough: (f) => f.cough(110, 0, 4, 3),
      phone: (f) => f.speak('ni3 que4 ding4 chu1 lai2 de5 shi4 ni3 ma5', 'phone', { dist: 0.2, hrtf: false }),
    };
    const out = {}, wavs = {};
    for (const [name, fn] of Object.entries(cases)) {
      const ctx = new OfflineAudioContext(2, 44100 * 6, 44100);
      const a = new AudioSys(); a.init(ctx); a.running = true; a.master.gain.value = 0.8;
      const f = createFinaleAudio({ audio: a });
      fn(f);
      const buf = await ctx.startRendering();
      const d = buf.getChannelData(0); let peak = 0, sum = 0;
      for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; sum += v * v; }
      out[name] = { peak: +peak.toFixed(3), rms: +Math.sqrt(sum / d.length).toFixed(4) };
      if (['call', 'child', 'scream', 'hum', 'fire'].includes(name)) {
        // 16-bit WAV（單聲道）
        const n = d.length, b = new ArrayBuffer(44 + n * 2), v = new DataView(b);
        const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
        w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 44100, true); v.setUint32(28, 88200, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
        for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, d[i])) * 32767, true);
        let s = ''; const u8 = new Uint8Array(b); for (let i = 0; i < u8.length; i += 32768) s += String.fromCharCode(...u8.subarray(i, i + 32768));
        wavs[name] = btoa(s);
      }
    }
    return { out, wavs };
  });
  for (const [name, r] of Object.entries(res.out)) {
    const ok = r.peak > 0.005 && r.peak < 0.99;
    if (!ok) failed = true;
    console.log(ok ? 'PASS' : 'FAIL', name, JSON.stringify(r));
  }
  for (const [name, b64] of Object.entries(res.wavs)) fs.writeFileSync(`${out}/finale-audio-${name}.wav`, Buffer.from(b64, 'base64'));
} catch (e) { errors.push(e.stack || String(e)); }
finally { console.log('ERRORS', JSON.stringify(errors)); await browser.close(); }
if (failed || errors.length) process.exitCode = 1;
