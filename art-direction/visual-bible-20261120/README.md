# 《說好不說》美術圖冊

2026-11-20 定稿批次：18 張人物三視圖、33 張夜間線索圖、13 張劇情靜幀，共 64 張。

直接開啟 [index.html](index.html)，可依類別、章節或關鍵字瀏覽；點圖放大，左右鍵換圖，Escape 關閉。圖冊包含結局劇透。

## 使用與來源

- 原稿在 `characters/`、`clues/`、`beats/`。選用清單以 `selection.json` 為準，不依檔名猜最新版本。
- 每張 PNG 的同名 JSON 保存提示詞、參考圖片、來源、台詞或用途。全批使用 OpenAI 內建 image_gen 生成／編修，沒有呼叫付費 CLI 或其他圖像 API。
- `manifest.json` 是完整製作資料。18 張人物圖含成年、童年及借聲者版本，對應 11 個角色身份；不是 18 個不同角色，也不是已完成的 3D 模型。
- 遊戲用的 46 張線索／劇情 WebP 在 `../../public/assets/story/visual-v2/`，合計約 10.3 MB；角色預覽另在 `previews/`，不加入遊戲載入。
- `public/assets/story/visual-v2/manifest.json` 提供穩定 ID、路徑、章節、觸發建議與文字。33 張線索圖與 13 張劇情圖已接入遊戲事件，依 `BASE_URL` 按需載入並隨事件解鎖。J 筆記可回看與放大已見圖片；18 張三視圖仍是製作參考。實際觸發見 [09 圖片事件整合](../../故事/09_圖片事件整合.md)。
- 已有的六人童年合照不在本批 33 張新線索圖內，避免直接更換造成現有塗臉位置失準；若重製，需連同場景貼圖與遮罩一起更新。

## 已採用的修正版

| 問題 | 選用原稿 |
|---|---|
| 三人紅布未完全遮眼 | `beats/beat-six-seats-opaque.png` |
| 擔架、鞋子穿入地面 | `beats/beat-ending-c-grounded.png` |
| 手機相對桌子太大 | `clues/home-message-scale.png` |
| 住處誤畫成廟內 | `clues/home-*-apartment.png`（語音圖使用上述 scale 版） |
| 車外誤畫成廟內 | `clues/road-car-road.png` |
| 第一批線索背景太亮 | 六張 `clues/evidence-*-night.png` |

舊候選稿只保留在本機，不加入選用清單與版本提交。最終視覺標準：38～40歲五位朋友、7歲小雨完整牙齒、陰森夜景、正常物件比例、紅布完全遮眼、可核對的接地關係。

## 故事文字

- [07 人物與連續性](../../故事/07_真人角色與圖片敘事規範.md)
- [08 線索與圖片劇情腳本](../../故事/08_線索圖與圖片劇情腳本.md)

圖中文字是物件表面質感，完整謎題與台詞應另用 HTML 正文呈現。三個朋友在真結局可救出；郭建成下落保留不確定；真結局救援的黎明是有意的光線轉變。

## 重建與驗證

在專案根目錄執行（需 FFmpeg、Node 及已安裝的專案套件）：

```powershell
node scripts/build-visual-bible.mjs
node scripts/visual-bible-check.mjs
npm run build
```

第一個命令只做 PNG→WebP 格式轉換與圖冊組裝，不重新生成圖片。修改 `template.html` 後重建，不直接改產出的 `index.html`。

2026-11-20 已檢查64張預覽解碼、類別數量、翻頁、搜尋、放大、左右鍵／Escape與390px手機寬度，瀏覽器無腳本錯誤。畫面按圖冊逐頁檢查，已更換以上有問題的候選稿；`npm run build` 通過。檢查截圖輸出到 `tmp/visual-bible-qa/`，不作遊戲素材。
