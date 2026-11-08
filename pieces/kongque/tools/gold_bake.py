"""Bake the light data for a Peacock Room photograph (after gold-ground's bake and lustre-stars').

  usage: gold_bake.py <photograph> <out.png> <width>

One lossless RGB PNG at <width> (the photograph's ratio), read by kongque-light.js:

  R, G  the surface normal's x and y (128 = straight out, +-127 = +-0.5)
  B     how much of the pixel is gold (0 = the blue-green ground, lacquer, porcelain; 255 = gold paint or leaf)

Gold is found from colour: in Lab, a yellow-to-olive hue (40-110 degrees), some chroma and some lightness. The
Prussian blue ground, the green lacquer, the porcelain and the lamps' glass fall outside it; the brown floor is too
dark. The relief: gold paint stands a little proud of the ground (a rounded rim from the blurred mask), and its
brushwork and the leaf's surface come from the photograph's own fine detail, band-passed, inside the gold. Gold
leaf is laid in overlapping squares that never lie quite flat, so a slow wander of a degree or two is added to
the gold's normal (seeded, low-frequency), and the light breaks into patches rather than one even sheen.
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from skimage import color
src, out, OW = sys.argv[1], sys.argv[2], int(sys.argv[3])
im0 = Image.open(src).convert('RGB')
OH = round(im0.height * OW / im0.width)
im = np.asarray(im0.resize((OW, OH), Image.LANCZOS)).astype(np.float32) / 255
lab = color.rgb2lab(im); L, A, B = lab[..., 0], lab[..., 1], lab[..., 2]
C = np.hypot(A, B); h = np.degrees(np.arctan2(B, A)) % 360


def ss(x, a, b):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)


gold = ss(h, 38, 56) * (1 - ss(h, 98, 115)) * ss(C, 11, 22) * ss(L, 32, 48)
gold = ndi.gaussian_filter(gold, 0.6)
k = OW / 1920                                   # scale lengths with the output size
# relief, in output px
height = ndi.gaussian_filter(gold, 1.6 * k) * 1.2 * k
bp = ndi.gaussian_filter(L, 0.8 * k) - ndi.gaussian_filter(L, 4 * k)
height += np.clip(bp, -12, 12) * 0.035 * k * gold
gy, gx = np.gradient(height)
nx, ny = -gx, -gy
rng = np.random.default_rng(7)
for s, amp in ((22 * k, .05), (7 * k, .025)):      # the leaf's lie: broad and fine wander
    for arr in (nx, ny):
        n = ndi.gaussian_filter(rng.standard_normal((OH, OW)), s)
        arr += n / (n.std() + 1e-6) * amp * gold
flat = gold < .04                                  # the ground's own relief is too faint to light: keep it flat
nx[flat] = 0; ny[flat] = 0                         # (and the PNG small)
R = np.clip(np.round(128 + np.clip(nx, -.5, .5) / .5 * 127), 1, 255)
G = np.clip(np.round(128 + np.clip(ny, -.5, .5) / .5 * 127), 1, 255)
Bc = np.clip(np.round(gold * 255), 0, 255) * ~flat
data = np.dstack([R, G, Bc]).astype(np.uint8)
Image.fromarray(data, 'RGB').save(out, optimize=True, compress_level=9)
assert (np.asarray(Image.open(out)) == data).all()
print(out, OW, OH, 'gold %.1f%%' % (gold.mean() * 100))
