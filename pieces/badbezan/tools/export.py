"""Stage 3: the assets the runtime uses, at half the master's size.

  fan.webp      the fan as photographed, cut off its ground (this is the page's <img>: the fan fully open)
  sticks.webp   an atlas of the twenty sticks' visible faces, each as it lies in the photograph (not rotated), plus
                the rivet (pin and washer), which does not turn
  fan.json      the pin, each stick's place in the atlas and in the photograph, its angle, and the canvas the fan
                needs while it closes

Each stick's face runs a few pixels on under the stick above it (pixels that stick always hides, since closing only
turns a stick further over the one below), so at rest the sticks drawn in order are the photograph exactly.
"""
from scipy.ndimage import distance_transform_edt, label as cc
from common import *

S = 2                                           # master px per output px
img = load(SRC)
H, W, _ = img.shape
lab = np.asarray(Image.open(os.path.join(WORK, 'label.png'))).copy()
alpha = load(os.path.join(WORK, 'alpha.png'))[..., 0]
dist = np.load(os.path.join(WORK, 'edge_dist.npy')).astype(np.float32)
e = np.load(os.path.join(WORK, 'edges.npz')); E = e['E']; R = e['R']; f = e['f']
rv = json.load(open(os.path.join(WORK, 'rivet.json'))); cx, cy, _ = rv['pin']; wx, wy, rw = rv['washer']
o = np.load(os.path.join(WORK, 'outline.npz'))

# every stick's angle on the common pattern: median of (leading edge - pattern) over the straight part of the stick.
# The bottom guard has no leading edge on the fan; its outer edge (the fan's outline) stands in.
band = (R >= 700) & (R <= 1450)
ang = [float(np.nanmedian(o['first'][band] - f[band]))] + [float(np.median(E[k, band] - f[band])) for k in range(19)]
print('stick angles:', np.round(ang, 2), 'gaps', np.round(np.diff(ang), 2))

# colour at the outline: the ground is neutral, so a fringe pixel's own colour is its nearest inner pixel's
fan = lab < 255
solid = alpha > .98
_, (iy, ix) = distance_transform_edt(~solid, return_indices=True)
rgb = img[iy, ix]

# under the washer: each stick continues as its nearest neighbour pixel (always covered by the washer)
washer = lab == 20
_, (wy_i, wx_i) = distance_transform_edt(washer, return_indices=True)
lab_s = lab.copy(); lab_s[washer] = lab[wy_i, wx_i][washer]
rgb_s = rgb.copy(); rgb_s[washer] = rgb[wy_i, wx_i][washer]

# the fan as photographed (the <img>)
x0, y0 = 271 - 8, 431 - 8
x1, y1 = 3632 + 9, 2239 + 9
x0 -= x0 % S; y0 -= y0 % S; x1 += (S - (x1 - x0) % S) % S; y1 += (S - (y1 - y0) % S) % S


def down(rgba):
    """premultiplied box reduction by S"""
    a = rgba[..., 3:4]
    pm = np.concatenate([rgba[..., :3] * a, a], -1)
    h, w = pm.shape[0] // S, pm.shape[1] // S
    pm = pm[:h * S, :w * S].reshape(h, S, w, S, 4).mean((1, 3))
    out = pm.copy(); a = pm[..., 3:4]
    out[..., :3] = np.where(a > 1e-4, pm[..., :3] / np.maximum(a, 1e-4), 0)
    return out


full = np.concatenate([rgb, alpha[..., None] * fan[..., None]], -1)[y0:y1, x0:x1]
FAN = down(full)
Image.fromarray(np.clip(FAN * 255 + .5, 0, 255).astype(np.uint8), 'RGBA').save(
    os.path.join(ASSETS, 'fan.webp'), quality=92, method=6, alpha_quality=100)
OW, OH = FAN.shape[1], FAN.shape[0]
pivot = [(cx - x0) / S, (cy - y0) / S]

# the sticks
sprites = []
for k in range(20):
    own = lab_s == k
    if k < 19:
        under = (lab_s == k + 1) & (dist < 4)          # runs on under the next stick's leading edge
        reg = own | under
    else:
        reg = own
    reg &= fan | washer
    comp, n = cc(reg)                                   # one piece: drop run-on bits cut off from the stick
    if n > 1:
        reg = comp == (np.argmax(np.bincount(comp.ravel())[1:]) + 1)
        own &= reg
    a = alpha * reg
    if k >= 1:
        lead = np.clip(dist + .5, 0, 1)               # the leading edge, antialiased over the stick below
        a = np.where(own & ~washer, a * lead, a)
    ys, xs = np.nonzero(a > 0)
    bx0 = (xs.min() - 2) // S * S; by0 = (ys.min() - 2) // S * S
    bx1 = -(-(xs.max() + 3) // S) * S; by1 = -(-(ys.max() + 3) // S) * S
    rgba = np.concatenate([rgb_s, a[..., None]], -1)[by0:by1, bx0:bx1]
    sprites.append(dict(k=k, img=down(rgba), x=(bx0 - x0) / S, y=(by0 - y0) / S))
# the rivet: washer and pin, fixed
yy, xx = np.mgrid[int(wy - rw - 4):int(wy + rw + 5), int(wx - rw - 4):int(wx + rw + 5)]
rr = np.hypot(xx - wx, yy - wy)
aw = np.clip(rw + .5 - rr, 0, 1)
bx0 = (xx[0, 0] - 0) // S * S; by0 = (yy[0, 0]) // S * S
bx1 = -(-(xx[0, -1] + 1) // S) * S; by1 = -(-(yy[-1, 0] + 1) // S) * S
A = np.zeros((by1 - by0, bx1 - bx0), np.float32)
A[yy[0, 0] - by0:yy[-1, 0] + 1 - by0, xx[0, 0] - bx0:xx[0, -1] + 1 - bx0] = aw
rv_rgba = np.concatenate([img[by0:by1, bx0:bx1], A[..., None]], -1)
sprites.append(dict(k='rivet', img=down(rv_rgba), x=(bx0 - x0) / S, y=(by0 - y0) / S))

# shelf-pack the atlas
AW = 2048
order = sorted(range(len(sprites)), key=lambda i: -sprites[i]['img'].shape[0])
px = py = sh = 0
for i in order:
    h, w = sprites[i]['img'].shape[:2]
    if px + w > AW: px = 0; py += sh + 2; sh = 0
    sprites[i]['ax'], sprites[i]['ay'] = px, py
    px += w + 2; sh = max(sh, h)
AH = py + sh
atlas = np.zeros((AH, AW, 4), np.float32)
for s_ in sprites:
    h, w = s_['img'].shape[:2]
    atlas[s_['ay']:s_['ay'] + h, s_['ax']:s_['ax'] + w] = s_['img']
Image.fromarray(np.clip(atlas * 255 + .5, 0, 255).astype(np.uint8), 'RGBA').save(
    os.path.join(ASSETS, 'sticks.webp'), quality=92, method=6, alpha_quality=100)

# the canvas the fan sweeps while it closes: every stick, turned back to the bottom guard's angle and between
pts = []
for s_ in sprites[:20]:
    h, w = s_['img'].shape[:2]
    corners = np.array([[s_['x'], s_['y']], [s_['x'] + w, s_['y']], [s_['x'], s_['y'] + h], [s_['x'] + w, s_['y'] + h]])
    for t in np.linspace(0, 1, 9):
        th = np.radians(-(ang[s_['k']] - ang[0]) * t)
        c, sn = np.cos(th), np.sin(th)
        v = corners - pivot
        pts.append(np.c_[v[:, 0] * c - v[:, 1] * sn, v[:, 0] * sn + v[:, 1] * c] + pivot)
pts = np.concatenate(pts)
meta = dict(
    source='Fan with Poetic Verses, Iran, dated 1301 AH / 1883-84 CE. The Metropolitan Museum of Art 443577, CC0.',
    scale=1 / S, size=[OW, OH], pivot=[round(p, 2) for p in pivot],
    sweep=[round(float(pts[:, 0].min()), 1), round(float(pts[:, 1].min()), 1), round(float(pts[:, 0].max()), 1),
           round(float(pts[:, 1].max()), 1)],                        # a loose bound; box.py replaces it with `box`
    atlas=[AW, AH],
    sticks=[dict(a=round(ang[s_['k']], 3), x=s_['x'], y=s_['y'], ax=s_['ax'], ay=s_['ay'], w=s_['img'].shape[1],
                 h=s_['img'].shape[0]) for s_ in sprites[:20]],
    rivet=dict(x=sprites[20]['x'], y=sprites[20]['y'], ax=sprites[20]['ax'], ay=sprites[20]['ay'],
               w=sprites[20]['img'].shape[1], h=sprites[20]['img'].shape[0]),
)
json.dump(meta, open(os.path.join(ASSETS, 'fan.json'), 'w'), separators=(',', ':'))
print('fan', OW, OH, 'pivot', pivot, 'atlas', AW, AH)
for p in ('fan.webp', 'sticks.webp', 'fan.json'):
    print(p, os.path.getsize(os.path.join(ASSETS, p)) // 1024, 'KB')
