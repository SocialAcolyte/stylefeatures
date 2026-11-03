"""Stage 5: write the runtime assets.

  assets/folio.webp   the folio cut off its mount, 1600 px wide, with its own torn outline as alpha (the <img>)
  assets/parts.webp   one atlas: every moving part (colour solved so clean*(1-a) + F*a = folio exactly),
                      the patches of clean plate under them, the occluders and the ball
  assets/clock.json   where everything sits on the folio (master px), pivots, poses and the ball's route

The ball: al-Jazari's balls are cast bronze; the painter of this copy paints bronze as gold. It is the gold
disc painted on the pipe of the Water Clock of the Peacocks (Met 451302, same manuscript, same hand),
scaled to the size of the falcon's beak.
"""
import json, numpy as np, cv2
from scipy import ndimage as ndi
from common import *
from parts import PARTS

MW = 1600
img = load(MAIN)
H, W, _ = img.shape
S = MW / W
MH = int(round(H * S))
clean = load(f'{WORK}/clean.png')
sheet = np.asarray(Image.open(f'{WORK}/sheet_alpha.png')).astype(np.float32) / 255
hole = np.asarray(Image.open(f'{WORK}/holes.png')) > 127
rs = lambda a: cv2.resize(a, (MW, MH), interpolation=cv2.INTER_AREA)
M = lambda p: [round(p[0] * S, 2), round(p[1] * S, 2)]

folio = np.dstack([rs(img), rs(sheet)])
save(f'{ASSETS}/folio.webp', folio, quality=88)
clean_m = rs(clean)


def premult_layer(rgb, a):
    """resize a full-res layer to master scale the right way: premultiplied, then un-premultiplied"""
    pm = rs(np.dstack([rgb * a[..., None], a]))
    al = pm[..., 3]
    col = pm[..., :3] / np.maximum(al[..., None], 1e-4)
    return np.dstack([np.clip(col, 0, 1), al])


sprites = {}       # name -> (rgba array, at=[x, y] master px)


def add_sprite(name, layer, pad=2):
    al = layer[..., 3]
    ys, xs = np.nonzero(al > 1 / 255)
    x0, y0 = max(0, xs.min() - pad), max(0, ys.min() - pad)
    x1, y1 = min(MW, xs.max() + 1 + pad), min(MH, ys.max() + 1 + pad)
    sprites[name] = (layer[y0:y1, x0:x1].copy(), [int(x0), int(y0)])


# ── moving parts ─────────────────────────────────────────────────────────────────────────────────
for name in PARTS:
    a = np.load(f'{WORK}/part_{name}.npy').astype(np.float32)
    a = np.clip(a, 0, 1)
    F = np.where(a[..., None] > .02, (img - clean * (1 - a[..., None])) / np.maximum(a[..., None], .02), img)
    add_sprite(name, premult_layer(np.clip(F, 0, 1), a))

# ── clean patches: the clean plate where any part was, feathered so only the holes are drawn ───────
hm = rs(cv2.GaussianBlur(ndi.binary_dilation(hole, iterations=3).astype(np.float32), (0, 0), 1.2))
lab, n = ndi.label(hm > .01)
for k in range(1, n + 1):
    m = (lab == k)
    layer = np.dstack([clean_m, np.where(m, hm, 0)])
    add_sprite(f'clean{k}', layer, pad=1)

# ── occluders: still pieces of the folio the ball passes behind (taken from the clean plate) ───────
OCC = {
    'occ_falcon': [(918, 1298), (1012, 1288), (1032, 1330), (1020, 1400), (930, 1402), (912, 1350)],
    'occ_vase': [(944, 2657), (1083, 2657), (1076, 2672), (1092, 2700), (1090, 2745), (940, 2745), (938, 2700), (952, 2672)],
    'occ_leg': [(852, 3150), (1000, 3150), (1000, 3440), (862, 3440), (848, 3320), (850, 3210)],
    'occ_foot': [(722, 3440), (905, 3440), (905, 3560), (722, 3560)],
    # the mahout sits on the neck in front of the castle: the serpent's head passes behind him as it bows
    'occ_mahout': [(655, 2200), (868, 2196), (880, 2420), (912, 2560), (918, 2790), (600, 2800), (600, 2640),
                   (640, 2470), (660, 2420)],
}
penv = np.load(f'{WORK}/paper_rgb.npy').astype(np.float32)
paperish = np.sqrt(((clean - penv) ** 2).sum(2)) < .085
SOLID = {'occ_vase', 'occ_falcon'}                   # gold and pale beak read as paper: take the polygon whole
for name, poly in OCC.items():
    m = poly_mask((H, W), poly) & (~paperish | (name in SOLID))   # the painted object, not the paper round it
    m = ndi.binary_opening(m, iterations=1)
    m = ndi.binary_fill_holes(m)
    a = cv2.GaussianBlur(m.astype(np.float32), (0, 0), .7) * poly_mask((H, W), poly)
    add_sprite(name, premult_layer(clean, a))

# ── the ball, from the Peacocks folio ──────────────────────────────────────────────────────────────
pea = load(f'{SRC}/451302/DP369551.jpg')
bc, br = (2056.0, 2023.0), 101.0
BALL_SRC_D = 34.0                       # diameter on the elephant folio, source px
BD = 48                                 # sprite size: drawn at about 2x master so it stays crisp
sc = BD / (2 * br + 4)
crop = pea[int(bc[1] - br - 2):int(bc[1] + br + 2), int(bc[0] - br - 2):int(bc[0] + br + 2)]
yy, xx = np.mgrid[:crop.shape[0], :crop.shape[1]]
rr = np.hypot(xx - (br + 2), yy - (br + 2))
ba = np.clip(br + .5 - rr, 0, 1)
ball = cv2.resize(np.dstack([crop * ba[..., None], ba]), (BD, BD), interpolation=cv2.INTER_AREA)
ball[..., :3] /= np.maximum(ball[..., 3:], 1e-4)
sprites['ball'] = (np.clip(ball, 0, 1), [0, 0])

# ── pack ───────────────────────────────────────────────────────────────────────────────────────────
AW = 1024
order = sorted(sprites, key=lambda k: -sprites[k][0].shape[0])
x = y = row_h = 0
place = {}
for k in order:
    h, w = sprites[k][0].shape[:2]
    if x + w > AW:
        x, y, row_h = 0, y + row_h + 2, 0
    place[k] = [x, y, w, h]
    x += w + 2; row_h = max(row_h, h)
AH = y + row_h
atlas = np.zeros((AH, AW, 4), np.float32)
for k, (x, y, w, h) in place.items():
    atlas[y:y + h, x:x + w] = sprites[k][0]
save(f'{ASSETS}/parts.webp', atlas, quality=90)

# ── geometry ───────────────────────────────────────────────────────────────────────────────────────
def entry(k, **kw):
    e = {'atlas': place[k], 'at': sprites[k][1]}
    e.update(kw)
    return e

meta = {
    'master': [MW, MH], 'scale': round(S, 6),
    'parts': {
        'serpent': entry('serpent', pivot=M(PARTS['serpent']['pivot'])),
        'scribe': entry('scribe', axis=M((PARTS['scribe']['axis_x'], 0))[0]),
        'balcony': entry('balcony', pivot=M(PARTS['balcony']['pivot'])),
        'bird': entry('bird', axis=M((PARTS['bird']['axis_x'], 0))[0]),
        'axe': entry('axe', pivot=M(PARTS['axe']['pivot'])),
        'mallet': entry('mallet', pivot=M(PARTS['mallet']['pivot'])),
        'bell': entry('bell', pivot=M(PARTS['bell']['pivot'])),
        'chain': entry('chain', period=round(PARTS['chain']['period'] * S, 3),
                       clip=[round(v * S, 2) for v in PARTS['chain']['clip']]),
    },
    'clean': [entry(k) for k in sorted(place) if k.startswith('clean')],
    'occluders': {k: entry(k) for k in OCC},
    'ball': {'atlas': place['ball'], 'd': round(BALL_SRC_D * S, 2)},
    # the ball's route, master px (painted pose)
    'points': {
        'beakIn': M((985, 1338)), 'beakOut': M((932, 1346)),
        'mouth': M((1043, 2640)),            # between the serpent's lips, on the vase's rim
        'vaseIn': M((1030, 2700)),
        'breast': M((878, 3236)), 'breastOut': M((846, 3240)),
        'bellHit': M((826, 3262)), 'footIn': M((790, 3470)),
    },
}
json.dump(meta, open(f'{ASSETS}/clock.json', 'w'), indent=1)
print('folio', (MW, MH), 'atlas', (AW, AH), 'sprites', len(sprites))
