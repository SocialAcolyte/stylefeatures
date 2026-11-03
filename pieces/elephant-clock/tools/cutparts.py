"""Stage 3: cut the moving parts out of the folio.

Each part is a closed loop of waypoints (source px). Between two waypoints the boundary either snaps to
the painter's ink line (livewire: the cheapest path through an ink cost map, 'i') or runs straight ('s',
used out in bare paper, where the paper is then subtracted so the part keeps its own painted edge).

Outputs (WORK): part_<name>.npy (float alpha, full folio size), overlay_<name>.jpg.
"""
import sys, json, numpy as np, cv2
from scipy import ndimage as ndi
from skimage.graph import route_through_array
from common import *
from parts import PARTS

img = load(MAIN)
H, W, _ = img.shape
penv = np.load(f'{WORK}/paper_rgb.npy').astype(np.float32)
dpap = np.sqrt(((img - penv) ** 2).sum(2))
L = lum(img)
Lu = (L * 255).astype(np.uint8)
bh = cv2.morphologyEx(Lu, cv2.MORPH_BLACKHAT, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (13, 13))).astype(np.float32) / 255
inkness = np.clip(bh / .22, 0, 1) ** .8
paperish = dpap < .085


def livewire(p, q, pad=40):
    x0 = int(max(0, min(p[0], q[0]) - pad)); y0 = int(max(0, min(p[1], q[1]) - pad))
    x1 = int(min(W, max(p[0], q[0]) + pad)); y1 = int(min(H, max(p[1], q[1]) + pad))
    cost = 1 + 40 * (1 - inkness[y0:y1, x0:x1])
    path, _ = route_through_array(cost, (int(p[1]) - y0, int(p[0]) - x0), (int(q[1]) - y0, int(q[0]) - x0),
                                  fully_connected=True, geometric=True)
    return [(c + x0, r + y0) for r, c in path]


def build(spec):
    loop = spec['loop']
    pts, free = [], []
    for k, v in enumerate(loop):
        x, y, mode = v if len(v) == 3 else (v[0], v[1], 's')
        nx, ny = loop[(k + 1) % len(loop)][:2]
        if mode == 'i':
            seg = livewire((x, y), (nx, ny), spec.get('pad', 40))
        else:
            n = max(2, int(np.hypot(nx - x, ny - y) / 2))
            seg = [(x + (nx - x) * t, y + (ny - y) * t) for t in np.linspace(0, 1, n)]
            free += seg
        pts += seg[:-1]
    region = poly_mask((H, W), pts)
    if spec.get('subtract_paper', True) and free:
        # paper reached from the free (straight) stretches of the boundary is not part of the part
        seed = line_mask((H, W), free, 7) & region & paperish
        pap = region & paperish
        lab, n = ndi.label(pap)
        hit = np.unique(lab[seed]); hit = hit[hit > 0]
        out = np.isin(lab, hit)
        region = region & ~out
    if spec.get('subtract_paper', True):
        # paper reaching the boundary anywhere (enclosed by snapped stretches too) is not the part either
        pap = region & paperish
        lab, n = ndi.label(pap)
        ring = region & ~ndi.binary_erosion(region, iterations=2)
        sizes = np.bincount(lab.ravel())
        hit = np.unique(lab[ring & pap]); hit = hit[(hit > 0) & (sizes[hit] >= spec.get('paper_min', 120))]
        region = region & ~np.isin(lab, hit)
    for ex in spec.get('exclude', []):
        region &= ~poly_mask((H, W), ex)
    for inc in spec.get('include', []):
        region |= poly_mask((H, W), inc)
    # keep the main body (and anything within 3 px of it: whiskers, detached ink)
    lab, n = ndi.label(region)
    if n > 1 and not spec.get('keep_all'):
        sizes = np.bincount(lab.ravel()); sizes[0] = 0
        main = lab == sizes.argmax()
        near = ndi.binary_dilation(main, iterations=3)
        keep = np.unique(lab[near & region]); keep = keep[keep > 0]
        region = np.isin(lab, keep) & (sizes[lab] > spec.get('min_crumb', 30))
    region = ndi.binary_fill_holes(region) if spec.get('fill', True) else region
    # alpha: hard inside; against paper the coverage follows how far a pixel is from the paper colour,
    # against a cut a 0.7 px ramp
    a = region.astype(np.float32)
    edge = region & ~ndi.binary_erosion(region, iterations=2)
    cov = np.clip((dpap - .04) / .09, 0, 1)
    touching_paper = ndi.binary_dilation(~region & paperish, iterations=2)
    a[edge & touching_paper] = np.maximum(cov[edge & touching_paper], .35)
    outside = ~region & ndi.binary_dilation(region, iterations=1) & ~paperish
    a = np.maximum(a, cv2.GaussianBlur(region.astype(np.float32), (0, 0), .7) * outside)
    return a, pts


def overlay(name, a, pts, spec):
    x0, y0, x1, y1 = bbox(a > .05, 40)
    sub = img[y0:y1, x0:x1].copy()
    m = a[y0:y1, x0:x1][..., None]
    tint = np.array([.1, .9, .2]) if True else 0
    v = sub * (1 - .45 * m) + tint * .45 * m
    v = v * 0 + sub * .35 + .65 * (sub * m + (1 - m) * np.array([1, 1, 1]) * .92)
    v = (v * 255).astype(np.uint8).copy()
    P = np.array([(p[0] - x0, p[1] - y0) for p in pts], np.int32)
    cv2.polylines(v, [P], True, (220, 30, 30), 1)
    for w in spec['loop']:
        cv2.circle(v, (int(w[0] - x0), int(w[1] - y0)), 3, (0, 0, 255), -1)
    if 'pivot' in spec:
        cv2.drawMarker(v, (int(spec['pivot'][0] - x0), int(spec['pivot'][1] - y0)), (255, 0, 255), cv2.MARKER_CROSS, 16, 2)
    sc = min(1.6, 1400 / max(v.shape[:2]))
    v = cv2.resize(v, None, fx=sc, fy=sc, interpolation=cv2.INTER_AREA if sc < 1 else cv2.INTER_LINEAR)
    Image.fromarray(v).save(f'{WORK}/overlay_{name}.jpg', quality=90)


if __name__ == '__main__':
    names = sys.argv[1:] or list(PARTS)
    for name in names:
        spec = PARTS[name]
        a, pts = build(spec)
        np.save(f'{WORK}/part_{name}.npy', a.astype(np.float16))
        overlay(name, a, pts, spec)
        print(name, 'px', int((a > .5).sum()), 'bbox', bbox(a > .05))
