"""bake.py: the frieze (albedo + real cast shadow, RGBA webp) and its per-pixel material data (lossless
grayscale PNG, two images stacked):

  top half     height, 1/32 output px per step: each tile's rounded rim (from its own outline) and the glaze's
               relief (band-passed photograph). The runtime takes its gradient for the normal.
  bottom half  tile id in the high nibble (0 = not a tile, 1-5 the stars left to right, 6-9 the crosses),
               lustre density in the low nibble (0 = bare glaze or in-glaze blue/turquoise, 15 = thick film)

Each tile's hand-set tilt is written to geometry.json and lives in the runtime (TILT).
"""
import sys, json, numpy as np
from PIL import Image
from scipy import ndimage as ndi
from skimage import color, morphology
src, outd, assets, OW = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
im = np.asarray(Image.open(src).convert('RGB'))
fr = json.load(open(outd+'/frieze.json')); x0, y0, x1, y1 = fr['crop']
lab_full = np.load(outd+'/labels-clipped.npy'); fg_full = np.asarray(Image.open(outd+'/fg.png')) > 127
allt = np.load(outd+'/labels.npy')      # every tile, including the top row we leave out
rgb = im[y0:y1, x0:x1].astype(np.float32)/255
tid = lab_full[y0:y1, x0:x1]
other = (allt[y0:y1, x0:x1] >= 10) | ((allt[y0:y1, x0:x1] > 0) & (tid == 0))
fg = fg_full[y0:y1, x0:x1]
H, W = tid.shape
# ── cast shadow: the photograph's own, on the wall only ─────────────────────
L = color.rgb2lab(rgb)[..., 0]
wall = ~fg_full[y0:y1, x0:x1] & ~other
# the lit wall's own level, from wall pixels far from any tile
Lf = color.rgb2lab(im[::8, ::8].astype(np.float32)/255)[..., 0]
farf = ndi.distance_transform_edt(~fg_full[::8, ::8]) > 25
yy, xx = np.nonzero(farf); Hf, Wf = Lf.shape
def basis(x, y):
    x = x/Wf; y = y/Hf
    return np.stack([np.ones_like(x), x, y, x*x, x*y, y*y, x**3, y**3, x*x*y, x*y*y], -1)
coef, *_ = np.linalg.lstsq(basis(xx.astype(float), yy.astype(float)), Lf[yy, xx], rcond=None)
YY, XX = np.mgrid[y0:y1, x0:x1].astype(float)
Lref = basis(XX/8, YY/8) @ coef
Lref = np.maximum(Lref, 40)
sh = np.clip((Lref - L) / Lref * 2.0, 0, 0.5) * ~fg_full[y0:y1, x0:x1]
# fade the shadow out where the cut-away top row would have cast its own
toprow = allt[y0:y1, x0:x1] >= 10
sh[ndi.distance_transform_edt(~toprow) < 36] = 0
# the cut-away fringes and the brass hanging tabs: fill from the shadow round them
hole = other & ~toprow
known = (~hole).astype(np.float32)
fill = ndi.gaussian_filter(sh * known, 14) / np.maximum(ndi.gaussian_filter(known, 14), 1e-3)
sh = np.where(hole, fill, sh)
sh[ndi.distance_transform_edt(~toprow) < 36] = 0
# only where a kept tile can have cast it: the photograph's light is high and to the left
# (swept along the light: the tile's footprint slid down and right, never up or left)
t0 = tid > 0; cast = np.zeros_like(t0)
for s_ in np.linspace(0, 1, 13):
    cast |= ndi.shift(t0.astype(np.float32), (52*s_, 34*s_), order=0) > 0
cast = ndi.binary_dilation(cast, iterations=5) & ~ndi.binary_dilation(t0, iterations=2) | ndi.binary_dilation(t0, iterations=2) & cast
sh *= ndi.gaussian_filter(cast.astype(np.float32), 8)
sh = ndi.gaussian_filter(sh, 1.0)
tile = tid > 0
a_tile = ndi.gaussian_filter(tile.astype(np.float32), 0.7)
alpha = np.maximum(a_tile, sh * (1 - a_tile))
shade_rgb = np.array([0.16, 0.13, 0.11])
out_rgb = np.where(tile[..., None], rgb, shade_rgb)
# ── materials ──────────────────────────────────────────────────────────────
labc = color.rgb2lab(rgb); Lc, A, B = labc[..., 0], labc[..., 1], labc[..., 2]
C = np.hypot(A, B); h = np.degrees(np.arctan2(B, A))
def ss(x, a, b): t = np.clip((x - a)/(b - a), 0, 1); return t*t*(3-2*t)
hue_ok = ss(h, 15, 35) * (1 - ss(h, 105, 125))           # orange-brown through olive-gold
colour = ss(C, 9, 18) * (1 - hue_ok)                      # cobalt and turquoise: in-glaze colour, not film
dens = np.zeros_like(Lc)
for k in range(1, 10):
    m = tid == k
    if not m.any(): continue
    Lg = np.percentile(Lc[m], 93)                          # this tile's bare glaze, as photographed
    dens[m] = (ss(Lg - Lc, 9, 34) * (1 - colour))[m]
dens = ndi.median_filter(dens, 3) * tile
# ── relief ────────────────────────────────────────────────────────────────
height = np.zeros((H, W), np.float32)
rng = np.random.default_rng(11)
tilt = {}
for k in range(1, 10):
    m = tid == k
    if not m.any(): continue
    d = ndi.distance_transform_edt(m)
    # the rim: glaze pooled and rounded over the tile's edge, about 22 px (1.1 mm at 20 cm) of curve
    rim = 1 - np.exp(-d/9.0)
    height += m * rim * 7.0
    tilt[k] = rng.normal(0, 0.03, 2)    # set by hand: ~1.7 degrees each way
# the glaze's own undulation and the painted relief, band-passed from the photograph
bp = ndi.gaussian_filter(Lc, 2.2) - ndi.gaussian_filter(Lc, 10)
height += np.clip(bp, -10, 10) * 0.045 * tile
gy, gx = np.gradient(ndi.gaussian_filter(height, 0.8))
nx, ny = -gx, -gy
nx = np.clip(nx, -0.5, 0.5); ny = np.clip(ny, -0.5, 0.5)
# ── resample to the output size and pack ─────────────────────────────────
OH = round(H * OW / W)
def rs(arr, nearest=False):
    return np.asarray(Image.fromarray(arr.astype(np.float32), 'F').resize((OW, OH), Image.NEAREST if nearest else Image.LANCZOS))
rgba = np.dstack([out_rgb, alpha])
alb = Image.fromarray((np.clip(rgba, 0, 1)*255+0.5).astype(np.uint8), 'RGBA').resize((OW, OH), Image.LANCZOS)
alb.save(assets+'/frieze.webp', quality=90, method=6, exact=True)
alb.save(outd+'/frieze-out.png')
tid_s = rs(tid, True).astype(np.uint8)
# height in output pixels (the bake's px scaled by OW/W), 1/32 px steps; the runtime takes its gradient
hs = rs(ndi.gaussian_filter(height, 0.8)) * (OW / W)
Hq = np.clip(np.round(hs * 32), 0, 255) * (tid_s > 0)
Bc = tid_s.astype(np.int32)*16 + np.clip(np.round(rs(dens)*15), 0, 15).astype(np.int32)*(tid_s > 0)
data = np.vstack([Hq, Bc]).astype(np.uint8)          # top half: height; bottom half: tile id | lustre density
Image.fromarray(data, 'L').save(assets+'/frieze-tiles.png', optimize=True, compress_level=9)
chk = np.asarray(Image.open(assets+'/frieze-tiles.png'))
assert (chk == data).all()
R = np.clip(np.round(128 + rs(nx)/0.5*127), 1, 255); G = np.clip(np.round(128 + rs(ny)/0.5*127), 1, 255)
print('height range', hs.max())
# previews
Image.fromarray((rs(dens)*255).astype(np.uint8)).save(outd+'/dens.png')
Image.fromarray(np.dstack([R, G, np.full_like(R, 255)]).astype(np.uint8)).save(outd+'/normals.png')
# geometry for the runtime and the CSS fallback, in frieze uv
shapes = json.load(open(outd+'/shapes.json'))
geo = []
for k in range(1, 10):
    s = shapes[str(k)]; P = np.array(s.get('snapped', s['poly']))
    P = (P - [x0, y0]) / [W, H]
    ys, xs = np.nonzero(tid == k)
    geo.append(dict(id=k, kind='star' if k <= 5 else 'cross', box=[xs.min()/W, ys.min()/H, xs.max()/W, ys.max()/H],
                    c=[xs.mean()/W, ys.mean()/H], poly=np.round(P, 4).tolist()))
json.dump(dict(size=[OW, OH], tiles=geo, tilt={k: np.round(v, 4).tolist() for k, v in tilt.items()}), open(outd+'/geometry.json', 'w'))
print('out', OW, OH, 'tilt', {k: np.round(np.degrees(v*2), 1).tolist() for k, v in tilt.items()})
