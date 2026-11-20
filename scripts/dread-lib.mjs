// dread（寺內恐怖段落）測試共用工具：截圖放 artifacts/dread/
import fs from 'node:fs';
import path from 'node:path';
export { launch, enter, dismiss, BASE } from './horror-lib.mjs';

export const OUT = 'artifacts/dread';
fs.mkdirSync(OUT, { recursive: true });

export async function shot(page, name) {
  const file = path.join(OUT, name + '.jpg');
  await page.screenshot({ path: file, type: 'jpeg', quality: 86 });
  return file;
}
export const frames = (page, n = 4) => page.evaluate((n) => new Promise((res) => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
/** 在瀏覽器裡跑一段函式（序列化參數） */
export const ev = (page, fn, arg) => page.evaluate(fn, arg);
export function tester() {
  const results = [];
  const test = async (name, fn) => {
    try { const note = await fn(); results.push({ name, pass: true, note }); console.log('PASS', name, note || ''); }
    catch (e) { results.push({ name, pass: false, error: String(e.message || e) }); console.log('FAIL', name, String(e.message || e)); }
  };
  const must = (cond, msg) => { if (!cond) throw new Error(msg); };
  return { results, test, must };
}
