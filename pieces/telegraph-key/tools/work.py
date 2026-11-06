"""Stage 1: the key off its white sweep.

The Smithsonian has already clipped the key onto pure white (every background pixel is 255), so each edge pixel is a
mix C = a*F + (1-a)*white. F comes from the nearest solid pixel of the key itself, and a is the least-squares fit of
that mix over the three channels. The faint studio shadow under the block (a few levels below white) goes. White
pockets the key encloses (under the lever, between the posts) are the sweep seen through it and stay open.

writes WORK/work.png (the box at WS), WORK/key.png (RGBA: unmixed colour + alpha), WORK/key_paper.jpg (proof)
"""
import cv2
import numpy as np
from scipy import ndimage as ndi
from common import *

img = load(MAIN)
x0, y0, x1, y1 = BOX
crop = img[y0:y1, x0:x1]
H, W = int(round((y1 - y0) * WS)), int(round((x1 - x0) * WS))
C = cv2.resize(crop, (W, H), interpolation=cv2.INTER_AREA)
save(f'{WORK}/work.png', C)

dark = 1 - C                                   # 0 on the sweep
# the sweep: pure white connected to the edge of the box, or one of the big pockets the key encloses (under the
# lever, between the posts). Small white pockets inside the outline are highlights on the brass and the wood's
# chamfer, and stay key.
white = dark.max(2) < 0.02
wl, wn = ndi.label(white)
border = set(np.unique(np.concatenate([wl[0], wl[-1], wl[:, 0], wl[:, -1]]))) - {0}
ws = ndi.sum(white, wl, range(1, wn + 1))
keep = [k for k in range(1, wn + 1) if k in border or ws[k - 1] > 5000]
bg = np.isin(wl, keep)
for k in keep:
    if k not in border:
        ys, xs = np.nonzero(wl == k)
        print(f'  open pocket: {int(ws[k - 1])} px at ({xs.mean():.0f}, {ys.mean():.0f})')
band = ndi.binary_dilation(bg, iterations=3) & ~bg
interior = ~bg & ~band
_, (iy, ix) = ndi.distance_transform_edt(~interior, return_indices=True)
Fn = C[iy, ix]                                 # nearest solid colour of the key
dF = 1 - Fn
a = (dark * dF).sum(2) / np.maximum((dF * dF).sum(2), 1e-4)
a = np.clip(a, 0, 1)
a[interior] = 1
a[bg] = 0

# unmix: F = (C - (1 - a) * white) / a, falling back to the neighbour colour where a is small
F = (C - (1 - a[..., None])) / np.maximum(a[..., None], 1e-3)
t = np.clip((a - 0.05) / 0.45, 0, 1)[..., None]
F = np.clip(F * t + Fn * (1 - t), 0, 1)
F[interior] = C[interior]
save(f'{WORK}/key.png', np.dstack([F, a]))

paper = np.array([0xf3, 0xf0, 0xe8]) / 255
proof = F * a[..., None] + paper * (1 - a[..., None])
save(f'{WORK}/key_paper.jpg', proof, quality=92)
ys, xs = np.nonzero(a > 0.01)
print('work size', W, H, 'key bbox (work px)', xs.min(), xs.max(), ys.min(), ys.max())
jsave('work.json', dict(box=BOX, ws=WS, size=[W, H], key_bbox=[int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]))
