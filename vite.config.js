import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

// OLS_NO_HMR=1：關閉熱更新，讓長時間的自動化測試不會因為別的檔案被修改而中途重新載入頁面。

// 建置時不複製進 dist 的「來源檔」：遊戲執行時不會載入，放在 public/ 只是方便取用與重新匯出。
// 檔案本身都留在專案裡（README 的說明不變），只是不跟著正式輸出一起發布。
const SOURCE_ONLY = [
  'assets/models/borrowed_voice', // README「可重用 GLB」匯出成品
  'assets/models/blindfolded_buddha',
  'assets/models/red_rabbit',
  'assets/story/temple-keyart.png', // 主視覺參考圖，遊戲內未使用
  'assets/story/apparition.png', // 執行時讀同名的 .webp（scripts/perf-images.py 產生）
  'assets/story/temple-blindfold-menu.png',
  'assets/story/children-1998.png', // 執行時讀同名的 .webp
];

function sizeOf(p) {
  const st = fs.statSync(p);
  if (!st.isDirectory()) return st.size;
  return fs.readdirSync(p).reduce((sum, name) => sum + sizeOf(path.join(p, name)), 0);
}

function pruneSourceOnly() {
  let outDir = 'dist';
  return {
    name: 'ols-prune-source-only',
    apply: 'build',
    configResolved(config) { outDir = path.resolve(config.root, config.build.outDir); },
    closeBundle() {
      let bytes = 0;
      for (const rel of SOURCE_ONLY) {
        const p = path.join(outDir, rel);
        if (!fs.existsSync(p)) continue;
        bytes += sizeOf(p);
        fs.rmSync(p, { recursive: true, force: true });
      }
      if (bytes) console.log(`\n[ols] 未隨輸出發布的來源檔：${(bytes / 1048576).toFixed(1)} MB（仍保留在 public/）`);
    },
  };
}

export default defineConfig(({ command }) => ({
  server: {
    hmr: process.env.OLS_NO_HMR ? false : undefined,
  },
  // 只在建置時掛上，開發伺服器的設定雜湊不變（不會觸發相依套件重新最佳化）
  plugins: command === 'build' ? [pruneSourceOnly()] : [],
  build: {
    // three.js 獨立成一個 chunk：遊戲程式更新時瀏覽器仍可沿用快取的引擎檔
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three/')) return 'three';
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
}));
