"""Stage 1: the three parts on one canvas, so that at rest they lie exactly as photographed.

  plate  the mask, and what the ring hid restored: where the ring's band crosses the mask's lower edge, the mask
         continues behind it. Its outline there is found by a harmonic fill of the mask's own alpha across the band
         (so its hidden lower edge joins the edges seen on either side), and its surface by OpenCV's
         frequency-selective reconstruction from the mask pixels around it. Only a strip a few dozen px deep is ever
         uncovered, while the ring is lifted.
  ring   the ring, cut along its own edges: against the sweep by the matte, against the mask by the traced edge of
         its band (with a 9 px margin taken on the mask's side, about 1 px on screen), against the mask's jaw inside the hole by the band's
         inner rim. Where the nose loop hides it, the band is continued from its own pixels either side (never seen
         unless the loop moved, which it doesn't). Its colour at the edge it shares with the mask is solved so that
         ring over plate equals the photograph exactly.
  loop   the nose loop, which lies in front of the ring's band: the photograph's own pixels inside its outline.

Outputs (WORK): plate.png, ring.png, loop.png (RGBA, the object's bounding box), parts.json, parts_check.jpg
"""
import json
import numpy as np, cv2
from scipy import ndimage as ndi
from common import *

P0 = load_rgb(SRC)
F0 = load_rgba(FINE)
A0 = F0[..., 3]
ys, xs = np.where(A0 > 0.004)
pad = 12
Y0, Y1, X0, X1 = ys.min() - pad, ys.max() + pad + 1, xs.min() - pad, xs.max() + pad + 1
P, A, U = P0[Y0:Y1, X0:X1], A0[Y0:Y1, X0:X1], F0[Y0:Y1, X0:X1, :3]
H, W = A.shape
cx, cy = CX - X0, CY - Y0
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
r = np.hypot(xx - cx, yy - cy)
th = np.degrees(np.arctan2(xx - cx, -(yy - cy)))          # 0 = straight up, clockwise positive

# ── the ring's outer boundary O(theta) and inner boundary I(theta) ──────────────────────────────────
T = np.arange(-180, 180.001, 0.1)
right = np.array([(np.degrees(np.arctan2(x - CX, -(y - CY))), np.hypot(x - CX, y - CY)) for x, y in RIGHT_EDGE])
loop_l = np.degrees(np.arctan2(LOOP[0][0] - CX, -(1235 - CY)))
loop_r = right[0, 0]
r_loop_l, r_loop_r = RO + 1.0, right[0, 1]


def ray(t, r0, r1, step=0.5):
    rr = np.arange(r0, r1, step)
    px = cx + np.sin(np.radians(t)) * rr
    py = cy - np.cos(np.radians(t)) * rr
    ok = (px >= 0) & (px < W - 1) & (py >= 0) & (py < H - 1)
    a = np.zeros_like(rr)
    a[ok] = ndi.map_coordinates(A, [py[ok], px[ok]], order=1)
    return rr, a


E = np.full_like(T, RO + 100.0)
M = np.full_like(T, 0.0)
zone = np.zeros(T.shape, np.int8)                           # 0 free, 1 against the sweep, 2 against the mask
for k, t in enumerate(T):
    if abs(t) > 100:
        continue
    rr, a = ray(t, RO - 60, RO + 120)
    out = np.nonzero(a < 0.5)[0]
    if len(out) and rr[out[0]] < RO + 90:
        E[k] = rr[out[0]]
        back = np.nonzero(a[out[0]:] > 0.5)[0]
        gap = (rr[out[0] + back[0]] - rr[out[0]]) if len(back) else 99.0
        M[k] = np.clip(gap * 0.45, 1.5, 10.0)
        zone[k] = 1
    else:
        if t < loop_l:
            E[k] = RO + 1.0
        elif t <= loop_r:
            u = (t - loop_l) / (loop_r - loop_l)
            E[k] = r_loop_l * (1 - u) + r_loop_r * u
        else:
            E[k] = np.interp(t, right[:, 0], right[:, 1], left=RO + 1.0, right=right[-1, 1])
        M[k] = 9.0                                          # the band's bright rim sits up to ~6 px above the trace
        zone[k] = 2
# the sweep-side edge is pixel-noisy: take the local maximum, so the boundary never cuts inside the band
E1 = np.where(zone == 1, ndi.maximum_filter1d(E, 9), E)
O = ndi.gaussian_filter1d(E1 + M, 2)
O = np.maximum(O, E1 + np.minimum(M, 1.5))

I = np.full_like(T, RI - 40.0)
chin = np.zeros(T.shape, bool)
for k, t in enumerate(T):
    if abs(t) > 40:
        continue
    rr, a = ray(t, 500, 600)
    # going inward from the band, does the hole open at once (sweep) or does the mask's jaw continue?
    rin = rr[::-1]; ain = a[::-1]
    j = np.nonzero(ain < 0.5)[0]
    if len(j) == 0 or rin[j[0]] < 555:
        chin[k] = True
chin = ndi.binary_closing(chin, iterations=10)
I = np.where(chin, R_INNER_TOP, I)
I = ndi.gaussian_filter1d(I, 1.0)

Ot = np.interp(th, T, O)
It = np.interp(th, T, I)
d = np.minimum(Ot - r, r - It)
rho = np.clip(d / 1.5 + 0.5, 0, 1).astype(np.float32)        # ring region, ~1.5 px soft edge

# ── the loop ──────────────────────────────────────────────────────────────────────────────────────
poly = np.array([(x - X0, y - Y0) for x, y in LOOP], np.float32)
S = 4
mk = np.zeros((H * S, W * S), np.uint8)
cv2.fillPoly(mk, [np.round(poly * S).astype(np.int32)], 255, lineType=cv2.LINE_AA)
kappa = cv2.resize(mk, (W, H), interpolation=cv2.INTER_AREA).astype(np.float32) / 255
kappa = cv2.GaussianBlur(kappa, (0, 0), 0.6)
K = A * kappa
loop_core = ndi.binary_erosion(kappa > 0.5, iterations=4)

# ── the plate: the mask's hidden lower edge, by a harmonic fill of its alpha across the band ────────────
region = rho > 0.01
vis_plate = A * (1 - rho)
h = np.where(region, 0.5, vis_plate).astype(np.float32)
for level in (8, 4, 2, 1):                                   # coarse to fine Jacobi on the region only
    hs = cv2.resize(h, (W // level, H // level), interpolation=cv2.INTER_AREA)
    rs = cv2.resize(region.astype(np.float32), (W // level, H // level), interpolation=cv2.INTER_AREA) > 0.5
    fixed = cv2.resize(vis_plate, (W // level, H // level), interpolation=cv2.INTER_AREA)
    if level != 8:
        hs = np.where(rs, cv2.resize(h_prev, (W // level, H // level), interpolation=cv2.INTER_LINEAR), fixed)
    for _ in range(400 if level == 8 else 150):
        nb = cv2.blur(hs, (3, 3))
        hs = np.where(rs, nb, fixed)
    h_prev = hs
h = np.where(region, cv2.resize(h_prev, (W, H), interpolation=cv2.INTER_LINEAR), vis_plate)
gy, gx = np.gradient(h)
gm = np.hypot(gx, gy)
hidden = np.clip(0.5 + (h - 0.5) / (2 * gm + 1e-4), 0, 1)
hidden = np.where(region, hidden, 0).astype(np.float32)
hidden *= (yy < (CY - Y0)).astype(np.float32)                  # only the top half has mask behind it
plate_a = vis_plate + hidden * rho

# its surface: FSR from the visible mask around (a strip near the visible mask is all that is ever uncovered)
known = (vis_plate > 0.98) & ~region
target = (hidden * rho > 0.02)
plate_rgb = U.copy()
# Only a strip under the band's top edge is ever uncovered (the band above the hinge drops toward it as the ring
# lifts: at most (hinge - y)(1 - cos) px). That strip gets the best reconstruction, in narrow tiles with real mask
# close above them; deeper down, where nothing is ever seen, a cheap fill is enough.
top_edge = np.interp(th, T, O)                                       # radius of the band's outer boundary
below_top = (top_edge - r)                                           # px under the band's top edge, along the radius
strip = target & (below_top < 62) & (yy < HINGE_Y - Y0)      # the lift is capped at 32 deg: <= ~57 px uncovered
deep = target & ~strip
# The strip is filled by exemplar: each run of columns gets a block of the mask's own surface from above the band
# (never the gold inlay, the loop or the sweep), the block whose pixels at the seam best continue the real ones
# just above the strip; blocks are cross-faded into each other and into the mask above.
lab8 = cv2.cvtColor((P * 255 + .5).astype(np.uint8), cv2.COLOR_RGB2LAB)
gold = ndi.binary_dilation((lab8[..., 2] > 150) & (lab8[..., 0] > 120), iterations=5)
source_ok = known & ~gold & (kappa < 0.01) & (A > 0.99) & ndi.binary_erosion(known, iterations=6)
# only the mask's lower cheeks either side of the nose: the nose and loop are smooth, vertically streaked metal
source_ok &= (yy > 1120 - Y0) & ((xx < 1975 - X0) | (xx > 2220 - X0))
yk, xk = np.where(strip)
filled_w = np.zeros((H, W), np.float32)
acc = np.zeros((H, W, 3), np.float32)
if len(xk):
    B, OV, SEAM = 64, 16, 12                       # block width, block overlap, seam band above the strip
    rng = np.random.default_rng(7)
    top = np.full(W, -1)
    bot = np.full(W, -1)
    cols = np.where(strip.any(0))[0]
    for x in cols:
        yc = np.where(strip[:, x])[0]
        top[x], bot[x] = yc.min(), yc.max()
    x = cols.min()
    while x <= cols.max():
        xa, xb = x, min(W, x + B)
        cs = [c for c in range(xa, xb) if top[c] >= 0]
        if not cs:
            x += B - OV
            continue
        depth = max(bot[c] - top[c] for c in cs) + 1
        best, best_e = None, 1e9
        for _ in range(1500):
            ox = int(rng.integers(-420, 421))
            oy = int(rng.integers(SEAM + 8, depth + SEAM + 260))
            ok = True
            for c in cs[::4]:
                sx = c + ox
                if not (0 <= sx < W):
                    ok = False; break
                y0s, y1s = top[c] - oy - SEAM, top[c] - oy + depth
                if y0s < 0 or not source_ok[y0s:y1s, sx].all():
                    ok = False; break
            if not ok:
                continue
            e = 0.0
            for c in cs[::2]:
                tgt = P[top[c] - SEAM:top[c], c]
                src = P[top[c] - oy - SEAM:top[c] - oy, c + ox]
                e += float(((tgt - src) ** 2).sum())
            if e < best_e:
                best, best_e = (ox, oy), e
        if best is None:
            x += B - OV
            continue
        ox, oy = best
        for c in range(max(0, xa - OV), min(W, xb + OV)):
            if top[c] < 0 or not (0 <= c + ox < W):
                continue
            wx = min(1.0, (c - (xa - OV) + 1) / OV, ((xb + OV) - c) / OV)
            for t in range(-SEAM, bot[c] - top[c] + 1):
                y = top[c] + t
                ys_ = y - oy
                if not (0 <= ys_ < H) or not (0 <= y < H):
                    continue
                wy = 1.0 if t >= 0 else (t + SEAM) / SEAM
                acc[y, c] += P[ys_, c + ox] * wx * wy
                filled_w[y, c] += wx * wy
        x += B - OV
    fill = acc / np.maximum(filled_w, 1e-6)[..., None]
    inside = strip & (filled_w > 0)
    # the visible mask above the strip is the photograph and stays so; the first px of the strip fade from a
    # mirror of those real px into the copied block, so there is no seam
    FADE = 7
    for c in range(W):
        if top[c] < 0:
            continue
        for t in range(0, min(FADE, bot[c] - top[c] + 1)):
            y = top[c] + t
            ym = top[c] - 1 - t
            if ym < 0 or not inside[y, c]:
                continue
            w = (t + 0.5) / FADE
            fill[y, c] = P[ym, c] * (1 - w) + fill[y, c] * w
    plate_rgb[inside] = fill[inside]
    print('plate strip exemplar fill', int(inside.sum()), 'of', int(strip.sum()), 'px')
    left = strip & ~inside
    if left.any():
        _, (iy, ix) = ndi.distance_transform_edt(~(known | inside), return_indices=True)
        plate_rgb[left] = plate_rgb[iy[left], ix[left]]
if deep.any():
    filled = known | strip
    _, (iy, ix) = ndi.distance_transform_edt(~filled, return_indices=True)
    plate_rgb[deep] = plate_rgb[iy[deep], ix[deep]]
    print('plate deep (never seen) nearest fill', int(deep.sum()), 'px')

# ── the ring ─────────────────────────────────────────────────────────────────────────────────────
R = A * rho
ring_rgb = U.copy()                                          # the matte's colour: the photo inside, unmixed at its edge
# the band behind the loop: continued from its own pixels either side
hide = loop_core & (rho > 0.5)
if hide.any():
    yk, xk = np.where(ndi.binary_dilation(hide, iterations=30))
    a0, a1, b0, b1 = yk.min(), yk.max() + 1, xk.min(), xk.max() + 1
    sub = (ring_rgb[a0:a1, b0:b1] * 255 + .5).astype(np.uint8)
    valid = ((rho[a0:a1, b0:b1] > 0.99) & (A[a0:a1, b0:b1] > 0.99) & ~hide[a0:a1, b0:b1]).astype(np.uint8) * 255
    dst = np.zeros_like(sub)
    cv2.xphoto.inpaint(cv2.cvtColor(sub, cv2.COLOR_RGB2BGR), valid, dst, cv2.xphoto.INPAINT_FSR_BEST)
    dst = cv2.cvtColor(dst, cv2.COLOR_BGR2RGB).astype(np.float32) / 255
    ring_rgb[a0:a1, b0:b1][hide[a0:a1, b0:b1]] = dst[hide[a0:a1, b0:b1]]
# exact at rest: under the ring's soft edge the plate supplies exactly the coverage the matte has left,
# R + (1 - R) Pa = A, and the ring's colour is solved so that R Cr + (1 - R) Pa Cp = A U (premultiplied)
edge = R < 0.995
plate_a = np.where(edge, np.clip((A - R) / np.maximum(1 - R, 1e-4), 0, 1), hidden * rho)
plate_rgb = np.where((R < 0.03)[..., None], U, plate_rgb)    # its outermost px stay the photograph's own
Rs, Pas = R[..., None], plate_a[..., None]
solved = np.clip((A[..., None] * U - (1 - Rs) * Pas * plate_rgb) / np.maximum(Rs, 1e-4), 0, 1)
ring_rgb = np.where(((R > 0.03) & edge)[..., None], solved, ring_rgb)

loop_rgb = U.copy()

# ── save, and a check: the parts recombined at rest against the photograph ──────────────────────────
WORK.mkdir(parents=True, exist_ok=True)
save(WORK / 'plate.png', np.dstack([plate_rgb, plate_a]))
save(WORK / 'ring.png', np.dstack([ring_rgb, R]))
save(WORK / 'loop.png', np.dstack([loop_rgb, K]))
paper = np.array([243, 240, 232], np.float32) / 255


def over(dst_rgb, src_rgb, a):
    return src_rgb * a[..., None] + dst_rgb * (1 - a[..., None])


rest = over(over(over(np.broadcast_to(paper, P.shape), plate_rgb, plate_a), ring_rgb, R), loop_rgb, K)
truth = over(np.broadcast_to(paper, P.shape), U, A)
err = np.abs(rest - truth).max(2)
print('rest vs photograph: max', round(float(err.max()), 4), 'p99.9', round(float(np.percentile(err, 99.9)), 4))
geo = dict(source='Freer F1917.18, photograph FS-7729_16 (4200 x 3150), object box in source px',
           box=[int(X0), int(Y0), int(X1), int(Y1)], ring_centre=[float(CX - X0), float(CY - Y0)], ring_r=[RI, RO],
           hinge_y=float(HINGE_Y - Y0), loop=[[int(x - X0), int(y - Y0)] for x, y in LOOP], cm_per_px=CM)
json.dump(geo, open(WORK / 'parts.json', 'w'), indent=1)
check = np.concatenate([rest, truth, np.dstack([np.clip(err * 20, 0, 1)] * 3)], 1)
cv2.imwrite(str(WORK / 'parts_check.jpg'), cv2.cvtColor((cv2.resize(check, (check.shape[1] // 3, check.shape[0] // 3), interpolation=cv2.INTER_AREA) * 255).astype(np.uint8), cv2.COLOR_RGB2BGR))
print('zones: against the sweep', int((zone == 1).sum()), 'against the mask', int((zone == 2).sum()), '| chin rays', int(chin.sum()))
