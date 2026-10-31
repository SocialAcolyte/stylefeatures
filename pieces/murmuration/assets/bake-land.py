"""Bake the land mask for Inness, A Winter Sky (1866): everything in front of the
sky (the copse, the far treeline, the marsh), so the starlings can go down behind
the trees. Output: assets/winter-sky.webp (the painting) and assets/winter-land.png
(a one-channel mask: land = white, drawn through by the birds, never over the painting), plus the measured horizon/roost for the JS."""
import sys, json
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi

src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGB')
W, H = im.size
a = np.asarray(im).astype(np.float32)
r, g, b = a[..., 0], a[..., 1], a[..., 2]
lum = 0.3 * r + 0.59 * g + 0.11 * b
lums = ndi.gaussian_filter(lum, 1.2)
# The line where the land meets the sky, traced by hand over the full-size scan
# (the copse's crowns, then the far treeline), in source pixels.
LINE = [(0, 1330), (300, 1335), (500, 1370), (520, 1240), (580, 1170), (630, 1190), (680, 1185), (730, 1200),
        (780, 1230), (820, 1260), (860, 1250), (900, 1150), (950, 1140), (1020, 1105), (1080, 1140), (1130, 1190),
        (1160, 1175), (1200, 1260), (1250, 1310), (1290, 1380), (1320, 1395), (1400, 1400), (1700, 1430),
        (1960, 1395), (2000, 1405), (2400, 1420), (3000, 1430), (3400, 1440)]
lx, ly = zip(*LINE)
top = np.interp(np.arange(W), lx, ly)
yy = np.arange(H)[:, None].astype(np.float32)
d = yy - top[None, :]                       # + below the line
# near the line, the painting decides: the crowns are darker than the cloud bank behind them
dark = np.clip((74 - lums) / 14, 0, 1)
alpha = np.where(d > 30, 1.0, np.where(d < -40, 0.0, dark))
alpha = np.maximum(alpha, np.clip((d - 10) / 20, 0, 1))
alpha = ndi.gaussian_filter(alpha, 1.0)
im.save(out + '/winter-sky.webp', quality=92, method=6)
im.resize((1800, round(1800 * H / W)), Image.LANCZOS).save(out + '/winter-sky-1800.webp', quality=90, method=6)
# the mask the birds are drawn through: half size, one channel (land = white)
Image.fromarray((alpha * 255).astype(np.uint8), 'L').resize((W // 2, H // 2), Image.LANCZOS).save(out + '/winter-land.png', optimize=True)
# preview
pv = a.copy(); pv[alpha > 0.5] = pv[alpha > 0.5] * 0.4 + np.array([255, 0, 255]) * 0.6
Image.fromarray(pv.astype(np.uint8)).resize((1700, round(1700 * H / W))).save(out + '/../../scratch-mask-preview.jpg')
top = top.astype(int)
xs = np.arange(500, 1300)
print(json.dumps({'w': W, 'h': H, 'horizon': round(float(np.median(top[int(0.5 * W):])) / H, 4),
                  'roost': [round(xs.min() / W, 4), round(xs.max() / W, 4)],
                  'treetop': round(float(np.percentile(top[xs], 30)) / H, 4)}))
