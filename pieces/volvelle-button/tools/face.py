"""Cut the button's roundel from dragon-volvelle's own assets (offline; nothing here runs in the page).

The roundel is the paper disc and the ring of the mater it turns on: the plate's own pixels inside the outer rule of
the printed zodiac (r = 781.5 px on the 1600 px plate, about the mater's printed centre), scaled for a button.

  face.webp      the plate, cut round on that rule. This is the <img>: at rest it IS the plate.
  ring.webp      dragon-volvelle's restored mater (the annulus the turning disc can uncover), same scale
  disc.webp      dragon-volvelle's paper disc with its two tabs and their shadows, same scale
  volvelle.json  the geometry in face pixels, in the shape dragon-volvelle.js reads

Nothing is drawn or recoloured: each file is a premultiplied Lanczos resample of the original's pixels, and the only
new edge is the round cut, antialiased over one pixel, on the printed rule.

  ./tools/run.sh face.py [--n 384] [--src ../dragon-volvelle/assets] [--out ../assets]
"""
import argparse, json, os
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser()
ap.add_argument('--n', type=int, default=384, help='the face, in px across')
ap.add_argument('--src', default=os.path.join(HERE, '..', '..', 'dragon-volvelle', 'assets'))
ap.add_argument('--out', default=os.path.join(HERE, '..', 'assets'))
ap.add_argument('--r', type=float, default=781.5, help='the cut, plate px about the mater centre')
ap.add_argument('--q', type=int, default=90)
a = ap.parse_args()
missing = [f for f in ('plate.webp', 'ring.webp', 'disc.webp', 'volvelle.json') if not os.path.exists(os.path.join(a.src, f))]
if missing:
    raise SystemExit(f"face.py: no {', '.join(missing)} in {os.path.abspath(a.src)}. The roundel is cut from "
                     "dragon-volvelle's own assets: point --src at components/dragon-volvelle/assets (or a copy of them).")
os.makedirs(a.out, exist_ok=True)

J = json.load(open(os.path.join(a.src, 'volvelle.json')))
S = J['plate']['scale']                                   # master (3840 scan) px -> plate px
cx0, cy0 = J['plate']['crop'][:2]
# the mater's printed centre, from dragon-volvelle's cut stage (tools/engine/jobs/dragon-volvelle-work/cut.json),
# in master px; it sits 1.9 px from the pin on the 1600 px plate
MATER = (1700.1780882092862, 2725.5508255048276)
mc = ((MATER[0] - cx0) * S, (MATER[1] - cy0) * S)
R = a.r
N = a.n
k = N / (2 * R)                                            # plate px -> face px
ox, oy = mc[0] - R, mc[1] - R                              # the face's top-left, plate px


def load(name):
    im = np.asarray(Image.open(os.path.join(a.src, name)).convert('RGBA')).astype(np.float32) / 255
    return im


def resample(rgba, box, size):
    """premultiplied Lanczos resample of the plate-px box (x0, y0, x1, y1, fractional) to size (w, h)"""
    pm = np.dstack([rgba[..., :3] * rgba[..., 3:], rgba[..., 3:]])
    ch = [np.asarray(Image.fromarray(pm[..., c], 'F').resize(size, Image.LANCZOS, box=box)) for c in range(4)]
    out = np.clip(np.dstack(ch), 0, 1)
    al = out[..., 3]
    col = out[..., :3] / np.maximum(al[..., None], 1e-4)
    return np.dstack([np.clip(col, 0, 1), al])


def save(name, rgba):
    a8 = np.clip(rgba * 255 + .5, 0, 255).astype(np.uint8)
    Image.fromarray(a8, 'RGBA').save(os.path.join(a.out, name), quality=a.q, method=6, alpha_quality=100)


plate = load('plate.webp')
face = resample(plate, (ox, oy, ox + 2 * R, oy + 2 * R), (N, N))
yy, xx = np.mgrid[0:N, 0:N].astype(np.float32) + .5
rr = np.hypot(xx - N / 2, yy - N / 2)
cut = np.clip(N / 2 - rr + .5, 0, 1)                       # one pixel of antialiasing, on the printed rule
face[..., 3] *= cut
save('face.webp', face)

# the square about the pin that dragon-volvelle's ring and disc live in, in face px
sq = J['square']
side = sq['size'] * k
s_px = int(np.ceil(side))
for name in ('ring.webp', 'disc.webp'):
    im = load(name)
    save(name, resample(im, (0, 0, im.shape[1], im.shape[0]), (s_px, s_px)))

g = {
    'source': J['source'] + '; the button roundel, cut on the outer rule of the zodiac',
    'plate': {'w': N, 'h': N, 'from': 'dragon-volvelle/assets/plate.webp', 'scale': k, 'origin': [ox, oy]},
    'pin': [(J['pin'][0] - ox) * k, (J['pin'][1] - oy) * k],
    'square': {'x': (sq['x'] - ox) * k, 'y': (sq['y'] - oy) * k, 'size': side, 'master': s_px},
    'r_disc': J['r_disc'] * k,
    'r_ring_inner': J['r_ring_inner'] * k,
    'r_max': J['r_max'] * k,
    'r_face': R * k,
    'tabs': {t: {'angle': v['angle'], 'r_tip': v['r_tip'] * k} for t, v in J['tabs'].items()},
}
json.dump(g, open(os.path.join(a.out, 'volvelle.json'), 'w'), indent=1)
print(json.dumps(g, indent=1))
for name in ('face.webp', 'ring.webp', 'disc.webp'):
    print(name, os.path.getsize(os.path.join(a.out, name)), 'bytes')
