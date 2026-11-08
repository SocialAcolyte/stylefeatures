"""Stage 4: the assets the runtime uses (at half the 5330 px working size: 2665 px wide).

  fan.webp      the fan as photographed, cut off its cloth (this is the page's <img>: the fan fully open)
  sticks.webp   an atlas of the eighteen sticks' visible faces, each as it lies in the photograph, plus the piece that
                does not turn (the rivet's head and its brass bail)
  fan.json      the pin, each stick's place in the atlas and in the photograph, and its angle

Each stick's face runs a few pixels on under the stick above it (pixels that stick always hides), so at rest the
sticks drawn in order are the photograph exactly. The fringe (herl against the cloth) is un-mixed from the cloth's
own colour, so the feathers keep their colour on any page.
"""
from scipy.ndimage import distance_transform_edt, label as cc
from common import *

S = 2                                           # working px (5330 wide) per output px
img = load(SRC)
H, W, _ = img.shape
lab = np.asarray(Image.open(os.path.join(WORK, 'label.png'))).copy()
alpha = load(os.path.join(WORK, 'alpha.png'))[..., 0]
dist = np.load(os.path.join(WORK, 'edge_dist.npy')).astype(np.float32)
e = np.load(os.path.join(WORK, 'edges.npz')); E = e['E']; R = e['R']
cx, cy, _ = json.load(open(os.path.join(WORK, 'rivet.json')))['pin']
GROUND = np.asarray(Image.open(os.path.join(WORK, 'ground.png'))).astype(np.float32) / 255

L_ = e['LINE']
ang = [float(L_[0, 0] - np.mean(np.diff(L_[:, 0])))] + [float(t) for t in L_[:, 0]]   # stick 0: one gap before stick 1
NS = len(ang)
print('stick angles:', np.round(ang, 2), 'gaps', np.round(np.diff(ang), 2))

# colour at the fringe: un-mix the cloth (scan = F a + cloth (1 - a)); solid pixels are the scan itself
fan = lab < 255
aa = np.clip(alpha, 1e-3, 1)[..., None]
rgb = np.where(alpha[..., None] > .97, img, np.clip((img - GROUND * (1 - aa)) / aa, 0, 1))
solid = alpha > .6
_, (iy, ix) = distance_transform_edt(~solid, return_indices=True)
rgb = np.where(alpha[..., None] < .15, img[iy, ix], rgb)          # too faint to un-mix: the nearest solid colour

lab_s = lab; rgb_s = rgb; washer = np.zeros_like(fan)

# the fan as photographed (the <img>)
ys_, xs_ = np.nonzero(fan)
x0, y0 = xs_.min() - 8, ys_.min() - 8
x1, y1 = xs_.max() + 9, ys_.max() + 9
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
for k in range(NS):
    own = lab_s == k
    if k < NS - 1:
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
# the piece that does not turn: the rivet's head and the brass bail
reg = (lab == 20) & fan
ys, xs = np.nonzero(reg)
bx0 = xs.min() - 2; by0 = ys.min() - 2; bx1 = xs.max() + 3; by1 = ys.max() + 3
rgba = np.concatenate([rgb, (alpha * reg)[..., None]], -1)[by0:by1, bx0:bx1]
sprites.append(dict(k='rivet', img=down(rgba), x=(bx0 - x0) / S, y=(by0 - y0) / S))

# shelf-pack the atlas
AW = 4096
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
for s_ in sprites[:NS]:
    h, w = s_['img'].shape[:2]
    corners = np.array([[s_['x'], s_['y']], [s_['x'] + w, s_['y']], [s_['x'], s_['y'] + h], [s_['x'] + w, s_['y'] + h]])
    for t in np.linspace(0, 1, 9):
        th = np.radians(-(ang[s_['k']] - ang[0]) * t)
        c, sn = np.cos(th), np.sin(th)
        v = corners - pivot
        pts.append(np.c_[v[:, 0] * c - v[:, 1] * sn, v[:, 0] * sn + v[:, 1] * c] + pivot)
pts = np.concatenate(pts)
meta = dict(
    source='Kunstnerviften, Kristiania 1898. Nasjonalmuseet NG.M.04483, public domain.',
    scale=1 / S, size=[OW, OH], pivot=[round(p, 2) for p in pivot],
    sweep=[round(float(pts[:, 0].min()), 1), round(float(pts[:, 1].min()), 1), round(float(pts[:, 0].max()), 1),
           round(float(pts[:, 1].max()), 1)],                        # a loose bound; box.py replaces it with `box`
    atlas=[AW, AH],
    sticks=[dict(a=round(ang[s_['k']], 3), x=s_['x'], y=s_['y'], ax=s_['ax'], ay=s_['ay'], w=s_['img'].shape[1],
                 h=s_['img'].shape[0]) for s_ in sprites[:NS]],
    rivet=dict(x=sprites[NS]['x'], y=sprites[NS]['y'], ax=sprites[NS]['ax'], ay=sprites[NS]['ay'],
               w=sprites[NS]['img'].shape[1], h=sprites[NS]['img'].shape[0]),
)
json.dump(meta, open(os.path.join(ASSETS, 'fan.json'), 'w'), separators=(',', ':'))
print('fan', OW, OH, 'pivot', pivot, 'atlas', AW, AH)
for p in ('fan.webp', 'sticks.webp', 'fan.json'):
    print(p, os.path.getsize(os.path.join(ASSETS, p)) // 1024, 'KB')
