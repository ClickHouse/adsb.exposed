# Converts a truecolor APNG into an APNG with a single global 256-color palette.
import sys
from PIL import Image
src = Image.open(sys.argv[1])
frames = []
for i in range(src.n_frames):
    src.seek(i); frames.append(src.convert('RGB'))
w, h = frames[0].size
ref = Image.new('RGB', (w, h * 6))
for i, k in enumerate(range(0, len(frames), len(frames) // 6)): ref.paste(frames[k], (0, h * i))
pal = ref.quantize(256, method=2, dither=0)
out = [f.quantize(palette=pal, dither=0) for f in frames]
out[0].save(sys.argv[2], save_all=True, append_images=out[1:], duration=src.info.get('duration', 80), loop=0, optimize=True, compress_level=9)
