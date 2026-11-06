"""Stage 4 (proof): composite the layers at rest and pressed, on paper, as the browser will (bilinear, premultiplied).

Writes WORK/rest.jpg, WORK/pressed.jpg, WORK/diff.png (rest against the photograph, x8), crops of every joint at rest and
pressed side by side (WORK/joint-*.jpg), and a flip-book strip (WORK/flip.jpg).
"""
import cv2
import numpy as np
from common import *

J = jload('layers.json')
lay = {k: load(f'{WORK}/L-{k}.png', 'RGBA') for k in ('base', 'spring', 'lever', 'cheek')}
paper = np.array([0xf3, 0xf0, 0xe8], np.float32) / 255
H, W = lay['base'].shape[:2]


def rot(rgba, centre, deg):
    """rotate about centre by deg (positive = clockwise on screen, as CSS rotate()), premultiplied"""
    if deg == 0:
        return rgba
    pm = np.dstack([rgba[..., :3] * rgba[..., 3:], rgba[..., 3:]])
    M = cv2.getRotationMatrix2D(tuple(map(float, centre)), -deg, 1.0)   # cv2: positive = counter-clockwise
    return cv2.warpAffine(pm, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)


def pm(rgba):
    return np.dstack([rgba[..., :3] * rgba[..., 3:], rgba[..., 3:]])


def comp(t):
    """t = 0 at rest, 1 fully pressed"""
    out = np.dstack([np.broadcast_to(paper, (H, W, 3)), np.ones((H, W, 1), np.float32)]).copy()
    for k, centre, deg in (('base', None, 0), ('spring', J['spring_root'], J['spring_deg'] * t),
                           ('lever', J['pivot'], -J['lever_deg'] * t), ('cheek', None, 0)):
        L = rot(lay[k], centre, deg) if deg else pm(lay[k])
        out[..., :3] = L[..., :3] + out[..., :3] * (1 - L[..., 3:])
    return out[..., :3]


rest, pressed = comp(0), comp(1)
K = load(f'{WORK}/key.png', 'RGBA')
photo = K[..., :3] * K[..., 3:] + paper * (1 - K[..., 3:])
d = np.abs(rest - photo).max(2)
print(f'rest vs photograph: max {d.max() * 255:.1f} levels, mean {d.mean() * 255:.3f}; pixels off by >2 levels: {(d > 2 / 255).sum()}')
ys, xs = np.nonzero(d > 2 / 255)
if len(xs):
    print(f'  where: x {xs.min()}..{xs.max()}, y {ys.min()}..{ys.max()} (expected: the raised front screw only)')
save(f'{WORK}/rest.jpg', rest, quality=92)
save(f'{WORK}/pressed.jpg', pressed, quality=92)
save(f'{WORK}/diff.png', np.clip(np.repeat(d[..., None] * 8, 3, 2), 0, 1))
joints = dict(front=(2060, 140, 2320, 680), back=(2760, 380, 3060, 700), cheek=(2340, 440, 2800, 760),
              tip=(1860, 480, 2160, 700), root=(600, 860, 1400, 1080), knob=(250, 250, 800, 560))
for nm, (x0, y0, x1, y1) in joints.items():
    a, b = rest[y0:y1, x0:x1], pressed[y0:y1, x0:x1]
    gap = np.ones((y1 - y0, 6, 3), np.float32)
    s = 2 if (x1 - x0) < 400 else 1
    im = np.concatenate([a, gap, b], 1)
    im = cv2.resize(im, (im.shape[1] * s, im.shape[0] * s), interpolation=cv2.INTER_NEAREST)
    save(f'{WORK}/joint-{nm}.jpg', im, quality=92)
frames = [cv2.resize(comp(t), (W // 3, H // 3), interpolation=cv2.INTER_AREA) for t in (0, 0.5, 1)]
save(f'{WORK}/flip.jpg', np.concatenate(frames, 0), quality=90)
print('ok')
