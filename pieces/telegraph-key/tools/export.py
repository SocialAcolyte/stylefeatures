"""Stage 5: write the runtime assets.

  assets/key-<layer>-<w>.webp   base, spring, lever, cheek at 400, 800 and 1600 px wide, every one the same box, so they
                                stack exactly (resized premultiplied, so the edges composite as they did at work size)
  assets/key.json               the box, the pivot and the spring's root as fractions of it, and the angles
"""
import cv2
import numpy as np
from PIL import Image
from common import *

J = jload('layers.json')
# work px: the key, with room above it for the raised front wheel (its top at row 34 - raise) and the lifted back
# wheel; 3113 x 1540, the same shape as before the play was raised
BOXW = (20, 2, 3133, 1542)
x0, y0, x1, y1 = BOXW
bw, bh = x1 - x0, y1 - y0
WIDTHS = (400, 800, 1600)


def premult_resize(rgba, w, h):
    pm = np.dstack([rgba[..., :3] * rgba[..., 3:], rgba[..., 3:]])
    pm = cv2.resize(pm, (w, h), interpolation=cv2.INTER_AREA)
    a = pm[..., 3:]
    return np.dstack([np.clip(pm[..., :3] / np.maximum(a, 1e-4), 0, 1), a])


sizes = {}
os.makedirs(ASSETS, exist_ok=True)
for k in ('base', 'spring', 'lever', 'cheek'):
    rgba = load(f'{WORK}/L-{k}.png', 'RGBA')[y0:y1, x0:x1]
    for w in WIDTHS:
        h = int(round(bh * w / bw))
        im = premult_resize(rgba, w, h)
        fn = f'{ASSETS}/key-{k}-{w}.webp'
        Image.fromarray((np.clip(im, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA').save(fn, quality=90 if w < 1600 else 86,
                                                                                       method=6)
        sizes[f'{k}-{w}'] = os.path.getsize(fn)
        hh = h
pv = J['pivot']
root = J['spring_root']
out = dict(
    box=[bw, bh], aspect=round(bw / bh, 5), widths=list(WIDTHS), height_at={w: int(round(bh * w / bw)) for w in WIDTHS},
    pivot=[round((pv[0] - x0) / bw, 5), round((pv[1] - y0) / bh, 5)],
    spring_root=[round((root[0] - x0) / bw, 5), round((root[1] - y0) / bh, 5)],
    lever_deg=round(-J['lever_deg'], 4), spring_deg=round(J['spring_deg'], 4), play_mm=J['play_mm'],
    plate_travel=round(J['lever_deg'] / 57.29578 * 2048 / bh, 5),
    note='CSS rotate() angles at full press: the lever turns about the pin until the front screw meets the anvil; '
         'the spring turns about the end of its screwed plate so its tip follows the lever. plate_travel is how far '
         'the finger plate drops, as a fraction of the key\'s height.')
os.makedirs(ASSETS, exist_ok=True)
json.dump(out, open(f'{ASSETS}/key.json', 'w'), indent=1)
print(json.dumps(out, indent=1))
print({k: f'{v / 1024:.0f} KB' for k, v in sizes.items()}, f'total {sum(sizes.values()) / 1024:.0f} KB')
