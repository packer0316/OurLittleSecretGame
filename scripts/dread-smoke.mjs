// dread：載入寺廟，確認寺內恐怖段落掛上、沒有錯誤（快速冒煙測試）
import { launch, enter, ev } from './dread-lib.mjs';
const { browser, page, errors } = await launch();
try {
  await enter(page, 'temple');
  const r = await ev(page, () => { const g = window.__game, d = g.horror.debug; d.run(1); return { sp: d.setpieceState, faults: d.state.faults, err: d.state.lastError }; });
  console.log(JSON.stringify(r, null, 1));
  console.log('errors', errors);
  process.exitCode = !r.sp || r.faults || errors.length ? 1 : 0;
} finally { await browser.close(); }
