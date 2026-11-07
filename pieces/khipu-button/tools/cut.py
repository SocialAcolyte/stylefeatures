"""cut.py [ids...]: cut whole cord ends out of the Cleveland photograph, on the photograph's own pixel grid.

Each part is one stretch of one real cord, from its own tip back along it, in one piece: never straightened, never
resampled, never joined to another piece. The cord's path is traced along its ridge (as components/khipu/tools/cut.py
traces it), only to know where the cord is. The matte is computed on the photograph's own pixels in a window round
that path, and the colour is lifted off the cloth the same way: F = bg + (o - bg) / a.

Writes $KB_ENDS/<id>.png (RGBA: the window, trimmed to the matte) and $KB_ENDS/meta.json: the window's origin in the
TIFF, and the centreline from the tip, 1 px apart, in window coordinates. export.py packs them into the atlas.

parts.json: {"parts": [{"id", "material": primary|brown|white, "seed": [x, y] (on the cord, a little inside its end),
"dir": [dx, dy] (toward the tip), "tip": px to follow toward the tip (it stops where the cord stops), "body": px to
follow back along the cord, "keep": px of cord kept from the tip, "w": core half-width, "fray": px at the tip that are
frayed (no solid core there), "halo", "tipr": px round the tip, "knots": [[u0, u1, r]] (arc ranges from the tip with a
wider core), "light": follow a light cord, "snap": px to look across for the ridge at the seed}]}

  ./run.sh cut.py [ids]

Inputs from outside this folder, each an environment variable with this factory's place as its default:
  KB_TIFF   the Cleveland Museum's full TIFF of 1940.469 (5968 x 4958, 88 MB; the link is in ../assets/credits.json)
  KB_CACHE  cache.npz: the cloth model and cordness map that components/khipu/tools/common.py makes from that TIFF
  KB_ENDS   where the cut pieces go (export.py reads them from the same place)
"""
import sys, os, json
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

Image.MAX_IMAGE_PIXELS = None
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
SRC = os.environ.get('KB_TIFF', os.path.join(ROOT, 'tools/engine/jobs/khipu-hunt/cma/1940.469_full.tif'))
CACHE = os.environ.get('KB_CACHE', os.path.join(ROOT, 'tools/engine/jobs/khipu-work/cache.npz'))
OUT = os.environ.get('KB_ENDS', os.path.join(ROOT, 'tools/engine/jobs/khipu-button-fix1/ends'))


def lab2rgb(lab):
    from skimage.color import lab2rgb as f
    return f(lab)


def bil(img, xs, ys):
    h, w = img.shape[:2]
    xs = np.clip(xs, 0, w - 1.001); ys = np.clip(ys, 0, h - 1.001)
    x0 = np.floor(xs).astype(int); y0 = np.floor(ys).astype(int); fx = xs - x0; fy = ys - y0
    if img.ndim == 3: fx = fx[..., None]; fy = fy[..., None]
    return (img[y0, x0] * (1 - fx) * (1 - fy) + img[y0, x0 + 1] * fx * (1 - fy) +
            img[y0 + 1, x0] * (1 - fx) * fy + img[y0 + 1, x0 + 1] * fx * fy)


def trace(sm, seed, direction, length, search=5, step=3.0):
    """step along the cord, re-centring on the ridge across it each step (cut.py's trace)"""
    p = np.array(seed, float); t = np.array(direction, float); t /= np.linalg.norm(t)
    pts = [p.copy()]
    for _ in range(int(length / step)):
        q = p + t * step
        n = np.array([-t[1], t[0]])
        vs = np.arange(-search, search + 0.01, 0.5)
        cand = q[None] + vs[:, None] * n[None]
        q = cand[np.argmax(bil(sm, cand[:, 0], cand[:, 1]) - 0.15 * np.abs(vs))]
        nt = q - p; nt /= np.linalg.norm(nt)
        t = t * 0.75 + nt * 0.25; t /= np.linalg.norm(t)
        p = q; pts.append(p.copy())
    return np.array(pts)


def resample(pts, sigma=2.0):
    xs = ndi.gaussian_filter1d(pts[:, 0], sigma, mode='nearest')
    ys = ndi.gaussian_filter1d(pts[:, 1], sigma, mode='nearest')
    seg = np.hypot(np.diff(xs), np.diff(ys)); s = np.concatenate([[0], np.cumsum(seg)])
    u = np.arange(0, s[-1], 1.0)
    return np.stack([np.interp(u, s, xs), np.interp(u, s, ys)], 1)


def cut(part, rgb_img, lab, bg, d):
    H, W = d.shape
    seed = np.array(part['seed'], float); dv = np.array(part['dir'], float); dv /= np.linalg.norm(dv)
    reach = part['tip'] + part['body'] + 120
    x0, y0 = int(max(0, seed[0] - reach)), int(max(0, seed[1] - reach))
    x1, y1 = int(min(W, seed[0] + reach)), int(min(H, seed[1] + reach))
    w = np.minimum(d[y0:y1, x0:x1], 60)
    if part.get('light'):
        w = np.where(lab[y0:y1, x0:x1, 0] > 68, np.minimum(w, 25), 0)
    sm = ndi.gaussian_filter(w, 2.0)
    s0 = seed - [x0, y0]
    nv = np.array([-dv[1], dv[0]]); r = part.get('snap', 8); vs = np.arange(-r, r + 0.01, 0.5)
    cand = s0[None] + vs[:, None] * nv[None]
    s0 = cand[np.argmax(bil(sm, cand[:, 0], cand[:, 1]) - 0.05 * np.abs(vs))]
    body = trace(sm, s0, -dv, part['body'], part.get('search', 5))
    tip = trace(sm, s0, dv, part['tip'], part.get('tsearch', 3))
    # the real tip: the last point toward the end where the cord is still there (a fray thins, then stops)
    bv = np.median(bil(sm, body[:, 0], body[:, 1]))
    alive = ndi.binary_closing(bil(sm, tip[:, 0], tip[:, 1]) > part.get('tipcut', 0.18) * bv, iterations=3)
    tip = tip[:int(np.where(alive)[0].max()) + 1] if alive.any() else tip
    cl = resample(np.concatenate([tip[::-1], body[1:]]))            # from the tip back along the cord
    cl = cl[:int(part.get('keep', len(cl)))]
    pad = int(max(part.get('tipr', 30), part.get('halo', 9) + part['w']) + 12)
    wx0, wy0 = int(max(0, cl[:, 0].min() - pad)), int(max(0, cl[:, 1].min() - pad))
    wx1, wy1 = int(min(x1 - x0, cl[:, 0].max() + pad)), int(min(y1 - y0, cl[:, 1].max() + pad))
    cl = cl - [wx0, wy0]
    X0, Y0, X1, Y1 = x0 + wx0, y0 + wy0, x0 + wx1, y0 + wy1
    D = d[Y0:Y1, X0:X1].astype(np.float32)
    o = np.asarray(rgb_img.crop((X0, Y0, X1, Y1))).astype(np.float32) / 255
    bgr = lab2rgb(bg[Y0:Y1, X0:X1]).astype(np.float32)
    h, wdt = D.shape
    # distance to the centreline, and the arc position (from the tip) of the nearest centreline point
    ci = np.clip(np.round(cl).astype(int), 0, [wdt - 1, h - 1])
    line = np.zeros((h, wdt), bool); line[ci[:, 1], ci[:, 0]] = True
    upos = np.full((h, wdt), -1.0); upos[ci[:, 1], ci[:, 0]] = np.arange(len(ci))
    dist, ind = ndi.distance_transform_edt(~line, return_indices=True)
    U = upos[ind[0], ind[1]]
    ds = ndi.gaussian_filter(D, 1.0)
    fr = part.get('fray', 0)
    bi = np.arange(len(ci))[fr + 10:]
    centre = float(np.median(bil(ds, cl[bi, 0], cl[bi, 1])))
    tcore = max(6.0, 0.45 * centre)
    tfull = max(tcore + 4, part.get('full', 0.8) * centre)
    wc = float(part['w'])
    cr = np.where(U > fr, wc, 0.0)
    for u0, u1, rk in part.get('knots', []):
        cr = np.where((U >= u0) & (U <= u1), np.maximum(cr, rk), cr)
    lb, _ = ndi.label((ds > tcore) & (dist <= cr))
    ids = np.unique(lb[ci[:, 1], ci[:, 0]]); ids = ids[ids > 0]
    core = ndi.binary_fill_holes(np.isin(lb, ids))
    # solid where the cord is whole (a two-colour cord's white plies are as solid as its black), never on the cloth
    solid = np.clip(wc + 0.5 - dist, 0, 1) * (U > fr + 2) * (ds > max(5.0, 0.3 * tcore))
    coref = np.maximum(ndi.gaussian_filter(core.astype(np.float32), 0.6), solid)
    ah = np.clip((D - 3.5) / (tfull - 3.5), 0, 1)
    lab_, _ = ndi.label((ah > part.get('conn', 0.22)) | (coref > 0.5))
    keep = np.isin(lab_, np.unique(lab_[coref > 0.5]))
    halo = part.get('halo', 9); tipr = part.get('tipr', 30)
    R = np.where(U > fr, wc + halo, wc + halo + (tipr - wc - halo) * np.clip(1 - U / max(fr, 1), 0, 1))
    band = np.clip((R - dist) / 3, 0, 1)
    a = np.clip(np.maximum(coref, ah * keep * band), 0, 1)
    a[U >= len(cl) - 1] = 0                                            # nothing past the kept length
    for ex0, ey0, ex1, ey1 in part.get('erase', []):                   # a neighbour's stray fibre, in TIFF coords
        a[max(0, ey0 - Y0):max(0, ey1 - Y0), max(0, ex0 - X0):max(0, ex1 - X0)] = 0
    F = np.where(a[..., None] > 0.04, bgr + (o - bgr) / np.maximum(a[..., None], 0.04), o)
    out = (np.dstack([np.clip(F, 0, 1), a]) * 255 + 0.5).astype(np.uint8)
    ys_, xs_ = np.where(out[..., 3] > 0)
    tx0, ty0, tx1, ty1 = xs_.min(), ys_.min(), xs_.max() + 1, ys_.max() + 1
    out = out[ty0:ty1, tx0:tx1]
    cl = cl - [tx0, ty0]
    return out, dict(origin=[int(X0 + tx0), int(Y0 + ty0)], size=[int(out.shape[1]), int(out.shape[0])],
                     cordness=round(centre, 1), w=wc, fray=fr, tipr=tipr, material=part.get('material'),
                     line=[[round(float(x), 2), round(float(y), 2)] for x, y in cl])


def main():
    for what, path in (('KB_TIFF', SRC), ('KB_CACHE', CACHE)):
        if not os.path.exists(path):
            sys.exit(f'cut.py: {path} is not there; set {what} (see the top of this file)')
    os.makedirs(OUT, exist_ok=True)
    spec = json.load(open(os.path.join(HERE, 'parts.json')))
    only = set(sys.argv[1:])
    rgb_img = Image.open(SRC).convert('RGB')
    z = np.load(CACHE)
    lab, bg, d = z['lab'], z['bg'], z['d']
    mp = os.path.join(OUT, 'meta.json')
    meta = json.load(open(mp)) if os.path.exists(mp) else {}
    for part in spec['parts']:
        if only and part['id'] not in only: continue
        img, info = cut(part, rgb_img, lab, bg, d)
        Image.fromarray(img, 'RGBA').save(os.path.join(OUT, part['id'] + '.png'))
        meta[part['id']] = info
        print(part['id'], 'at', info['origin'], 'size', info['size'], 'cord', len(info['line']), 'px, cordness', info['cordness'])
    json.dump(meta, open(mp, 'w'))


if __name__ == '__main__':
    main()
