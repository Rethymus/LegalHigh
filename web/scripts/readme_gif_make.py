# README GIF 组装器：把 readme_media.mjs 录制的 JPEG 帧序列合成为 GIF
# 用法：server/.venv/Scripts/python.exe readme_gif_make.py <frames_dir> <out.gif> [width] [frame_ms]
# 体积控制：①连续近重复帧合并且延长前帧时长（静置等帧是 GIF 体积的大头）；
#           ②自适应 96 色调色板（UI 截图足够）。
# 附带产物：<out>.contact.png（抽 6 帧拼图，供人工目检；不进 README）。
import sys
from pathlib import Path

from PIL import Image, ImageChops

frames_dir = Path(sys.argv[1])
out = Path(sys.argv[2])
width = int(sys.argv[3]) if len(sys.argv) > 3 else 880
frame_ms = int(sys.argv[4]) if len(sys.argv) > 4 else 250

files = sorted(frames_dir.glob("*.jpg"))
if not files:
    raise SystemExit(f"no frames in {frames_dir}")

frames = []
for f in files:
    im = Image.open(f).convert("RGB")
    if im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    frames.append(im)

# 近重复帧合并：变化像素占比（灰度差>10 的像素比例）低于阈值则不新增帧，把时长累计到前帧。
# 用占比而非均值——打字/点击只改变屏幕一小块，均值法曾把整段输入吞成 2 帧。
kept = [frames[0]]
durations = [frame_ms]
npix = frames[0].width * frames[0].height
for im in frames[1:]:
    hist = ImageChops.difference(kept[-1], im).convert("L").histogram()
    changed_ratio = sum(hist[10:]) / npix
    if changed_ratio < 0.00005:
        durations[-1] += frame_ms
    else:
        kept.append(im)
        durations.append(frame_ms)

kept[0].save(
    out,
    save_all=True,
    append_images=kept[1:],
    duration=durations,
    loop=0,
    optimize=True,
)

# 抽帧拼图（目检用）
picks = [kept[i] for i in range(0, len(kept), max(1, len(kept) // 6))][:6]
w, h = picks[0].size
sheet = Image.new("RGB", (w, h * len(picks) + 8 * (len(picks) - 1)), (240, 240, 240))
for i, im in enumerate(picks):
    sheet.paste(im, (0, i * (h + 8)))
sheet.save(out.with_suffix(".contact.png"))

print(f"{out.name}: {len(files)}→{len(kept)} 帧, {out.stat().st_size / 1024:.0f} KB, {kept[0].size}")
