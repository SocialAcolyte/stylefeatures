"""Stage 6 (proof): the exported layers, as the page shows them.

Each export size's four layers are composited at rest over white, both at the size they are exported and scaled again
to the sizes the page draws them at (a 32 px row key at 2x and 3x, the 24 px small key at 2x, the large key at 2x and
3x), and compared with the photograph resized straight to the same size. A joint that lets daylight through shows as
pixels lighter than the photograph. It is measured twice: from the work-size layers resized exactly as export.py does
(the joints alone), and from the WebP files themselves (the joints and the compression). The raised front screw is the
one documented change and is left out. Writes WORK/web-<w>.png: where the WebPs are lighter, x8.

    ./run.sh checkweb.py            # TK_BOX_Y0=10 to measure exports made before the play was raised
"""
import cv2
import numpy as np
from common import *

K = load(f'{WORK}/key.png', 'RGBA')
meta = json.load(open(f'{ASSETS}/key.json'))
bw, bh = meta['box']
BY0 = int(os.environ.get('TK_BOX_Y0', 2))         # the export box's top row (10 before the play was raised)
x0, y0 = 20, BY0
photo = (K[..., :3] * K[..., 3:] + (1 - K[..., 3:]))[y0:y0 + bh, x0:x0 + bw]
# the raised front screw (wheel, collar and thread above the nut; thread and point below the lever), in box px
SCREW = [(1975 - x0, 0, 2420 - x0, 300 - y0), (2125 - x0, 535 - y0, 2235 - x0, 630 - y0)]
WORKL = [f'{WORK}/L-{k}.png' for k in ('base', 'spring', 'lever', 'cheek')]
have_work = all(os.path.exists(p) for p in WORKL) and not os.environ.get('TK_BOX_Y0')


def pm(rgba):
    return np.dstack([rgba[..., :3] * rgba[..., 3:], rgba[..., 3:]])


def unpm(p):
    a = p[..., 3:]
    return np.dstack([np.clip(p[..., :3] / np.maximum(a, 1e-4), 0, 1), a])


def area(im, w, h):
    return cv2.resize(im, (w, h), interpolation=cv2.INTER_AREA)


def comp(layers, w, h):
    out = np.ones((h, w, 3), np.float32)
    for L in layers:
        p = pm(L)
        p = area(p, w, h) if p.shape[1] != w else p
        out = p[..., :3] + out * (1 - p[..., 3:])
    return out


def screw_mask(w, h):
    m = np.zeros((h, w), bool)
    for a, b, c, d in SCREW:
        m[int(b * h / bh):int(np.ceil(d * h / bh)) + 1, int(a * w / bw):int(np.ceil(c * w / bw)) + 1] = True
    return m


exact = None
if have_work:
    exact = [load(p, 'RGBA')[y0:y0 + bh, x0:x0 + bw] for p in WORKL]
SHOWN = {400: [130, 195, 97], 800: [477, 620], 1600: [954, 1431]}
print('export  drawn at   exact: lighter max  px >12      webp: lighter max  px >24   (outside the raised screw)')
worst = dict(exact=0.0, webp=0.0)
for ew in meta['widths']:
    eh = int(round(bh * ew / bw))
    webp = [load(f'{ASSETS}/key-{k}-{ew}.webp', 'RGBA') for k in ('base', 'spring', 'lever', 'cheek')]
    ex = [unpm(area(pm(L), ew, eh)) for L in exact] if exact is not None else None
    photo_e = area(photo, ew, eh)                   # the photograph through the same two resizes as the layers
    for dw in [ew] + SHOWN[ew]:
        dh = int(round(dw * bh / bw))
        ref = photo_e if dw == ew else area(photo_e, dw, dh)
        m = ~screw_mask(dw, dh)
        out = []
        for name, layers, thr in (('exact', ex, 12), ('webp', webp, 24)):
            if layers is None:
                out.append('        -        -')
                continue
            lighter = (comp(layers, dw, dh) - ref).mean(2) * 255
            lt = lighter[m]
            worst[name] = max(worst[name], float(lt.max()))
            out.append(f'{lt.max():13.1f} {int((lt > thr).sum()):8d}')
            if name == 'webp' and dw == ew:
                save(f'{WORK}/web-{ew}.png', np.repeat(np.clip(np.where(m, lighter, 0) * 8 / 255, 0, 1)[..., None], 3, 2))
        print(f'{ew:5d} w  {dw:5d} px   ' + '     '.join(out))
print('worst: ' + ', '.join(f'{k} {v:.1f} levels lighter' for k, v in worst.items()))
