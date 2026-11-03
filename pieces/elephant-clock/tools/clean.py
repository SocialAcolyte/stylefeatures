"""Stage 4: the clean plate, what lies under the moving parts.

Every part's footprint (its alpha, grown 4 px) is a hole; all holes are filled at once, so no part is
copied into another's place. Three kinds of filling, decided pixel by pixel by what the nearest real
(unhidden) pixel is:

1. The left pillar, which the serpent's wing and head cross, is rebuilt row by row from its own plain
   shaft (between its ball and the head), cycled with cross-faded seams, so its edges and paint losses
   stay sharp.
2. Paper: the slow tone is interpolated from the surroundings (a membrane fill at 1/8 scale); the fibre,
   tooth and mottle up to ~24 px are copied from the folio's own bare margin in tent-blended patches.
3. Anything else (cloak, castle edge, the vase's rim, the elephant's head): OpenCV's frequency-selective
   reconstruction (FSR, best quality) from the surrounding painted pixels.

Outputs (WORK): clean.png, holes.png, clean_check.jpg
"""
import numpy as np, cv2
from scipy import ndimage as ndi
from common import *
from parts import PARTS

img = load(MAIN)
H, W, _ = img.shape
penv = np.load(f'{WORK}/paper_rgb.npy').astype(np.float32)
dpap = np.sqrt(((img - penv) ** 2).sum(2))
paperish = dpap < .085

hole = np.zeros((H, W), bool)
for name in PARTS:
    a = np.load(f'{WORK}/part_{name}.npy').astype(np.float32)
    hole |= ndi.binary_dilation(a > .02, iterations=4)
save(f'{WORK}/holes.png', hole.astype(np.float32))
out = img.copy()
filled = ~hole.copy()                       # pixels known so far

# ── 1. the left pillar ─────────────────────────────────────────────────────────────────────────────
PX0, PX1 = 1072, 1156                        # the shaft with its ink edges
SRC0, SRC1 = 2268, 2412                      # a plain stretch of the same shaft, nothing over it
period = SRC1 - SRC0
col = slice(PX0, PX1)
for y in range(1900, 2620):
    m = hole[y, col]
    if not m.any():
        continue
    # pick the source row by cycling through the plain stretch; cross-fade over 14 rows at the seam
    t = (y - SRC0) % period
    r1 = SRC0 + t
    fade = 14
    if t < fade:
        r2 = SRC0 + t + period - fade if t + period - fade < period else SRC1 - 1
        r2 = SRC1 - fade + t
        w = t / fade
        row = img[r1, col] * w + img[r2, col] * (1 - w)
    else:
        row = img[r1, col]
    out[y, col][m] = row[m]
    filled[y, col] |= m

# ── 1b. the coil: the two serpents' tails ring the axle in two near-circular bands (inner r 90-140, outer
#    r 150-215 about (1450, 2030)). Where the moving serpent's claw and wing hid them, and where the
#    scribe's turban touched them, the bands are carried round from the same radii a little further
#    along the ring, where they are visible.
CX, CY = 1450.0, 2030.0
for th0, th1, r0, r1, dth in [(158, 212, 70, 218, -50), (70, 114, 150, 219, -42)]:
    yy, xx = np.mgrid[int(CY - r1 - 2):int(CY + r1 + 3), int(CX - r1 - 2):int(CX + r1 + 3)]
    dx, dy = xx - CX, yy - CY
    rr = np.hypot(dx, dy); th = np.degrees(np.arctan2(dy, dx)) % 360
    sel = (rr >= r0) & (rr <= r1) & (th >= th0) & (th <= th1) & ~filled[yy, xx]
    a = np.radians(th[sel] + dth)
    sx = (CX + rr[sel] * np.cos(a)).astype(np.float32); sy = (CY + rr[sel] * np.sin(a)).astype(np.float32)
    vals = cv2.remap(img, sx[None], sy[None], cv2.INTER_LINEAR)[0]
    out[yy[sel], xx[sel]] = vals
    filled[yy[sel], xx[sel]] = True

# ── 2. paper ───────────────────────────────────────────────────────────────────────────────────────
# which hole pixels are surrounded by paper: the class of the nearest known pixel, smoothed
known_paper = filled & paperish
idx = ndi.distance_transform_edt(~filled, return_distances=False, return_indices=True)
near_paper = known_paper[idx[0], idx[1]].astype(np.float32)
near_paper = cv2.GaussianBlur(near_paper, (0, 0), 5)

# slow tone: membrane fill at 1/8 scale, from a blur that sees only known pixels (so no part's colour
# leaks into the tone of the paper it covered)
s = 8
kf = (filled & paperish).astype(np.float32)
num = cv2.GaussianBlur(img * kf[..., None], (0, 0), 10)
den = cv2.GaussianBlur(kf, (0, 0), 10)[..., None]
nb = num / np.maximum(den, 1e-3)
small = cv2.resize(nb, (W // s, H // s), interpolation=cv2.INTER_AREA)
dens = cv2.resize(den[..., 0], (W // s, H // s), interpolation=cv2.INTER_AREA)
hs = dens < .92
mem = small.copy()
mem[hs] = small[~hs].mean(0)
for it in range(600):                          # Jacobi relaxation of Laplace's equation inside the holes
    avg = (np.roll(mem, 1, 0) + np.roll(mem, -1, 0) + np.roll(mem, 1, 1) + np.roll(mem, -1, 1)) / 4
    mem[hs] = avg[hs]
low = cv2.resize(mem, (W, H), interpolation=cv2.INTER_CUBIC)
low = cv2.GaussianBlur(low, (0, 0), 6)

# texture: bare paper of the same manuscript. The folio's own right margin, and the margins of two sister folios
# (the mahout, 55.121.13, and the Peacocks, 55.121.15: same paper stock, photographed at 126-134 px/cm, as this
# one is at 128). Each source's slow tone is removed and its grain contrast matched to this folio's.
def tex_source(path, box):
    a = load(path)[box[1]:box[3], box[0]:box[2]]
    return a - cv2.GaussianBlur(a, (0, 0), 24)
sources = [tex_source(MAIN, (1880, 1450, 2380, 2900)),
           tex_source(f'{SRC}/451300/DP351397.jpg', (150, 1350, 470, 2650)),
           tex_source(f'{SRC}/451300/DP351397.jpg', (2350, 1350, 2700, 2650)),
           tex_source(f'{SRC}/451302/DP369551.jpg', (2300, 2600, 2640, 3500))]
ref = sources[0].std()
sources = [t * (ref / max(t.std(), 1e-4)) for t in sources]
rng = np.random.default_rng(7)
P = 128
grain = np.zeros_like(out); wsum = np.zeros((H, W, 1), np.float32); wsq = np.zeros((H, W, 1), np.float32)
win = np.outer(np.bartlett(P + 2)[1:-1], np.bartlett(P + 2)[1:-1]).astype(np.float32)[..., None]
ys, xs = np.nonzero(hole)
for yy in range(ys.min() - P, ys.max() + P, P // 2):
    for xx in range(xs.min() - P, xs.max() + P, P // 2):
        ya, xa, yb, xb = max(0, yy), max(0, xx), min(H, yy + P), min(W, xx + P)
        if yb <= ya or xb <= xa or not hole[ya:yb, xa:xb].any():
            continue
        src_tex = sources[rng.integers(0, len(sources))]
        sy = rng.integers(0, src_tex.shape[0] - P); sx = rng.integers(0, src_tex.shape[1] - P)
        patch = src_tex[sy:sy + P, sx:sx + P][ya - yy:yb - yy, xa - xx:xb - xx]
        w = win[ya - yy:yb - yy, xa - xx:xb - xx]
        grain[ya:yb, xa:xb] += patch * w; wsum[ya:yb, xa:xb] += w; wsq[ya:yb, xa:xb] += w * w
grain /= np.sqrt(np.maximum(wsq, 1e-6))          # keeps the grain's contrast where patches overlap
paper_fill = np.clip(low + grain, 0, 1)

# ── 3. painted surroundings: FSR from the real pixels around ───────────────────────────────────────
fsr = out.copy()
known_painted = filled & ~paperish
d_painted = ndi.distance_transform_edt(~known_painted)
painted_hole = ~filled & (d_painted < 22)
lab, n = ndi.label(ndi.binary_dilation(painted_hole, iterations=12))
for k in range(1, n + 1):
    comp = lab == k
    if not (comp & painted_hole).any():
        continue
    x0, y0, x1, y1 = bbox(comp, 40)
    sub = (out[y0:y1, x0:x1] * 255 + .5).astype(np.uint8)
    valid = (filled[y0:y1, x0:x1]).astype(np.uint8) * 255
    dst = np.zeros_like(sub)
    mode = cv2.xphoto.INPAINT_FSR_BEST if (x1 - x0) * (y1 - y0) < 260_000 else cv2.xphoto.INPAINT_FSR_FAST
    cv2.xphoto.inpaint(cv2.cvtColor(sub, cv2.COLOR_RGB2BGR), valid, dst, mode)
    dst = cv2.cvtColor(dst, cv2.COLOR_BGR2RGB).astype(np.float32) / 255
    fsr[y0:y1, x0:x1] = np.where(filled[y0:y1, x0:x1, None], fsr[y0:y1, x0:x1], dst)
    print('fsr', k, (x1 - x0, y1 - y0), 'best' if mode == cv2.xphoto.INPAINT_FSR_BEST else 'fast')

# FSR only carries a painted edge a few px into the hole; everything further in is paper
t = np.clip((d_painted - 4) / 12, 0, 1); w = np.maximum(t * t * (3 - 2 * t), near_paper * 0)[..., None]
# FSR occasionally invents a saturated block where it has too little to go on: paper there instead
wild = (chroma(fsr) > .45) | (np.abs(fsr - low).max(2) > .45)
wild = ndi.binary_dilation(wild, iterations=3)
w = np.where(wild[..., None], 1.0, w)
fill = paper_fill * w + fsr * (1 - w)
out = np.where(filled[..., None], out, fill)
out = np.clip(out, 0, 1)
# a last 3x3 median inside the holes takes out any lone over-saturated pixel the reconstruction made
med = cv2.medianBlur((out * 255 + .5).astype(np.uint8), 3).astype(np.float32) / 255
odd = hole & (np.abs(out - med).max(2) > .12)
out[odd] = med[odd]
save(f'{WORK}/clean.png', out)
save(f'{WORK}/clean_check.jpg', cv2.resize(out, (W // 2, H // 2), interpolation=cv2.INTER_AREA))
