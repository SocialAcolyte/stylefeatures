"""Stage 2: the three parts as WebP, at three sizes, all on the same canvas so they stack exactly.

  assets/plate-<h>.webp, ring-<h>.webp, loop-<h>.webp   h = 1207, 480, 168 px tall (the object 7.7 cm)
  assets/pushou.json                                    the hinge and the ring, as fractions of the canvas

Each is a uniform downscale (Lanczos, premultiplied) of the full-resolution part: nothing is redrawn or warped.
"""
import json
import numpy as np
from PIL import Image
from common import *

geo = json.load(open(WORK / 'parts.json'))
parts = {n: Image.open(WORK / f'{n}.png').convert('RGBA') for n in ('plate', 'ring', 'loop')}
W, H = parts['plate'].size
ASSETS.mkdir(exist_ok=True)
sizes = []
for h in (1207, 480, 168):
    k = h / H
    w = round(W * k)
    for n, im in parts.items():
        small = im.convert('RGBa').resize((w, h), Image.LANCZOS).convert('RGBA')
        q = 86 if h > 600 else 90
        small.save(ASSETS / f'{n}-{h}.webp', 'WEBP', quality=q, alpha_quality=95, method=6)
    sizes.append([w, h])
    print(h, (w, h), {n: (ASSETS / f'{n}-{h}.webp').stat().st_size // 1024 for n in parts}, 'KB')

cx, cy = geo['ring_centre']
ri, ro = geo['ring_r']
out = dict(
    source='Freer Gallery of Art F1917.18, photograph FS-7729_16; the canvas is the object box ' + str(geo['box']),
    canvas=[W, H], sizes=sizes,
    hinge=round(geo['hinge_y'] / H, 5),              # the bar the ring hangs on, from the top
    ring_top=round((cy - ro) / H, 5), ring_bottom=round((cy + ro) / H, 5),
    ring_cx=round(cx / W, 5), ring_rw=round(2 * ro / W, 5),
    rest_deg=12, lift_max_deg=32,                    # its lean against the door at rest; the most it is lifted
    height_cm=7.7, depth_cm=2.2,
)
json.dump(out, open(ASSETS / 'pushou.json', 'w'), indent=1)
print(json.dumps(out, indent=1))
