// 整體混音驗收：在真實遊戲頁面（真實 AudioContext、已預載錄音、所有聲音模組）錄下主輸出。
// 用章節跳轉到幾個代表時刻，照劇本操作（走路、觸發事件、開始段落），每段錄下來轉成 WAV，
// 再用 ffmpeg 的 ebur128 量整合響度、響度範圍與真實峰值。輸出在 artifacts/audio/mix/（給人試聽）。
// 用法：node scripts/audio-mix-capture.mjs [情境 id ...]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';

const ORIGIN = process.env.GAME_ORIGIN || 'http://127.0.0.1:5178';
const OUT = process.env.MIX_OUT || 'artifacts/audio/mix'; fs.mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2);

// 每個情境：跳到哪個檢查點、錄幾秒、錄音期間做什麼（steps: [秒, 在頁面執行的程式碼]）
const SCENES = [
  { id: 'temple-gate', jump: 't1', seconds: 28, steps: [[1, 'walk(true)'], [12, 'walk(false)'], [16, 'turn(Math.PI)'], [18, 'walk(true)'], [24, 'walk(false)']] },
  { id: 'hall-dread', jump: 't2', seconds: 40, steps: [[2, "H.trigger(H.list().find(e=>/turn|behind|back/i.test(e.id))?.id||H.list()[0].id)"], [14, 'A.setTension(0.7)'], [22, "A.horror('whisper',{pan:-0.9,dist:0.5})"], [26, "A.duck(1.1)"], [27.2, "A.horror('stinger',{intensity:1.2})"], [30, 'A.setTension(0.2)']] },
  { id: 'hideseek', jump: 't3-hide', seconds: 45, steps: [[3, "key('Space',true)"], [14, "key('Space',false)"]] },
  { id: 'patrol', jump: 't4-patrol', seconds: 40, steps: [] },
  { id: 'arhats', jump: 't4-arhats', seconds: 30, steps: [] },
  { id: 'chase', jump: 't3', seconds: 26, steps: [[1, "S.beginChase('stage')"], [2, 'walk(true,true)'], [9, 'turn(Math.PI)'], [16, 'walk(false)']] },
  { id: 'camp-tape', jump: 't4-hatch', seconds: 34, steps: [[1, "S.campTape('camp')"], ...Array.from({ length: 14 }, (_, i) => [3 + i * 2.1, 'S.modal&&S.modal.options.length===1&&S.choose(0)'])] },
  { id: 'finale-walk', jump: 'end-c-walk', seconds: 40, steps: [] },
  { id: 'finale-six', jump: 'end-c-six', seconds: 40, steps: [] },
  { id: 'finale-fire', jump: 'end-c-fire', seconds: 30, steps: [[4, "key('KeyE',true)"], [12, "key('KeyE',false)"]] },
  { id: 'finale-girl', jump: 'end-c-girl', seconds: 40, steps: [] },
  { id: 'finale-gate', jump: 'end-c-gate', seconds: 30, steps: [[14, "key('KeyE',true)"], [14.3, "key('KeyE',false)"]] },
  { id: 'ending-a', jump: 'end-a-walk', seconds: 30, steps: [[1, 'walk(true)']] },
  { id: 'ending-b', jump: 'end-b-roll', seconds: 30, steps: [] },
  { id: 'home-call', jump: 'home-call', seconds: 30, steps: [[2, "S.interact('phone')"], ...Array.from({ length: 10 }, (_, i) => [5 + i * 2.2, 'S.modal&&S.modal.options.length===1&&S.choose(0)'])] },
  { id: 'road-night', jump: 'road', seconds: 26, steps: [[1, 'walk(true)'], [18, 'walk(false)']] },
];

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.stack || e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(ORIGIN + '/?auto&horror');
await page.waitForFunction(() => typeof window.__jump === 'function');
const results = [];
for (const sc of SCENES.filter((s) => !only.length || only.includes(s.id))) {
  const ok = await page.evaluate((id) => window.__jump(id), sc.jump);
  if (!ok) { results.push({ id: sc.id, error: 'jump refused' }); continue; }
  await page.waitForFunction(() => window.__game?.running && window.__game.story, null, { timeout: 240000 });
  await page.waitForTimeout(600);
  const b64 = await page.evaluate(async ({ seconds, steps }) => {
    const g = window.__game, A = g.audio, S = g.story, H = g.horror.debug, P = g.player;
    const walk = (on, run = false) => { P.keys.KeyW = on; P.keys.ShiftLeft = on && run; };
    const turn = (d) => { P.yaw += d; P._syncCamera?.(0); };
    const key = (code, down) => { window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code === 'Space' ? ' ' : code.replace('Key', '').toLowerCase(), bubbles: true })); g.horror?.debug?.setpieceKey?.(code, down); };
    const dest = A.ctx.createMediaStreamDestination(); A.out.connect(dest);
    const rec = new MediaRecorder(dest.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 256000 });
    const chunks = []; rec.ondataavailable = (e) => chunks.push(e.data);
    rec.start(250);
    const t0 = performance.now();
    // 劇情插圖卡、單一選項的閱讀卡：開著超過 1.5 秒就按「繼續」（多選項的呼名不按，交給情境自己決定）
    let modalSince = 0;
    const dismisser = setInterval(() => { const m = S.modal; if (!m || m.options.length !== 1) { modalSince = 0; return; } modalSince ||= performance.now(); if (performance.now() - modalSince > 1500) { modalSince = 0; S.choose(0); } }, 250);
    for (const [t, code] of steps) {
      const wait = t * 1000 - (performance.now() - t0); if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      try { new Function('g', 'A', 'S', 'H', 'P', 'walk', 'turn', 'key', code)(g, A, S, H, P, walk, turn, key); } catch (e) { console.error('step failed', code, e.message); }
    }
    const rest = seconds * 1000 - (performance.now() - t0); if (rest > 0) await new Promise((r) => setTimeout(r, rest));
    walk(false); clearInterval(dismisser);
    await new Promise((r) => { rec.onstop = r; rec.stop(); });
    A.out.disconnect(dest);
    const buf = new Uint8Array(await new Blob(chunks, { type: 'audio/webm' }).arrayBuffer());
    let bin = ''; for (let i = 0; i < buf.length; i += 32768) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 32768));
    return btoa(bin);
  }, { seconds: sc.seconds, steps: sc.steps });
  const webm = `${OUT}/${sc.id}.webm`, wav = `${OUT}/${sc.id}.wav`;
  fs.writeFileSync(webm, Buffer.from(b64, 'base64'));
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', webm, '-ar', '48000', wav]);
  fs.unlinkSync(webm);
  const r128 = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', wav, '-filter_complex', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' }).stderr || '';
  const sum = r128.slice(r128.lastIndexOf('Summary:'));
  const num = (re) => { const m = re.exec(sum); return m ? +m[1] : null; };
  const stats = await page.evaluate(() => ({ bank: window.__game.audio.bank?.stats(), modules: Object.keys(window.__game.audio.modules || {}), score: window.__game.audio.score?.state ?? null }));
  const row = { id: sc.id, seconds: sc.seconds, lufs: num(/I:\s+(-?[\d.]+) LUFS/), lra: num(/LRA:\s+(-?[\d.]+) LU/), truePeak: num(/Peak:\s+(-?[\d.]+) dBFS/), bankMB: stats.bank?.mb, bankFiles: stats.bank?.files, failed: stats.bank?.failed?.length || 0 };
  results.push(row);
  console.log(JSON.stringify(row));
}
fs.writeFileSync(`${OUT}/results.json`, JSON.stringify({ results, errors }, null, 1));
console.log('ERRORS', JSON.stringify(errors.slice(0, 12)));
await browser.close();
const bad = results.filter((r) => r.error || (r.truePeak != null && r.truePeak > -0.3) || r.failed);
if (errors.length || bad.length) process.exitCode = 1;
