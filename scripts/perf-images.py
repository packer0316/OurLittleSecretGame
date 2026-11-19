"""perf：把 public/assets/story/ 下實際會被遊戲載入的 PNG 轉成 WebP（原始 PNG 保留當來源檔）。

用法：python scripts/perf-images.py            （需要 Pillow）
- 大廳背景 temple-blindfold-menu.png → .webp（style.css 引用）
- 幽影貼圖 apparition.png（含透明通道）→ .webp（Assets.js 以貼圖載入）
PNG 更新後重新執行即可；輸出比來源新就略過。`npm run build` 不會把這些來源 PNG 複製進 dist（見 vite.config.js）。
"""
import os
import sys
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'assets', 'story')
JOBS = {
    'temple-blindfold-menu': dict(quality=90),
    # exact=True：保留透明像素底下的顏色，貼圖做線性過濾與 mipmap 時邊緣才不會出現暗邊
    'apparition': dict(quality=90, alpha_quality=100, exact=True),
    # 六人合照：書桌上的 3D 照片與文件視窗的 <img> 共用同一個 .webp
    'children-1998': dict(quality=90),
}

total_in = total_out = 0
for name, opts in JOBS.items():
    src = os.path.join(ROOT, name + '.png')
    dst = os.path.join(ROOT, name + '.webp')
    if not os.path.exists(src):
        print('缺少來源', src)
        sys.exit(1)
    if os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(src) and '--force' not in sys.argv:
        print(f'{name}: 已是最新（{os.path.getsize(dst) // 1024} KB）')
    else:
        im = Image.open(src)
        im.load()
        im.save(dst, 'WEBP', method=6, **opts)
        print(f'{name}: {os.path.getsize(src) // 1024} KB → {os.path.getsize(dst) // 1024} KB  {im.size} {im.mode}')
    total_in += os.path.getsize(src)
    total_out += os.path.getsize(dst)
print(f'合計 {total_in // 1024} KB → {total_out // 1024} KB')
