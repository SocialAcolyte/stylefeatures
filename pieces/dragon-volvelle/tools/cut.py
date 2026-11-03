"""Stage 2: cut the turning disc (with its two tabs and their cast shadows) and the cap, and restore the mater under them.

What is restored, and from what:
  - under each tab: the zodiac ring of the mater, copied from the same printed ring 60 degrees round (the white signs
    recur every 60 degrees with the same numerals and checker), registered to the visible ring around the tab
  - under the disc's hand-cut edge: the bare mater paper of the gap between the disc and the zodiac ring, reflected
    radially (only ever seen where the irregular edge, turned, sits a pixel or two inside where it was)
Everything else under the disc and the cap is never seen.

The disc layer's colour is solved so that  base*(1-a) + F*a = scan  exactly at rest; a tab's shadow on the mater is
part of the disc layer (black, alpha = how much it darkens the restored mater), so it travels with its tab.

writes WORK/base.png, WORK/disc_rgba.npy, WORK/cap_rgba.npy, WORK/cut.json, WORK/cut-check.png
"""
import cv2
from scipy import ndimage as ndi
from common import *

g = geo()
img = load(SRC)
H, W, _ = img.shape
L = img.mean(-1)
cx, cy = (np.array(g['center']) + np.array(g['checks']['year_inner']['c'])) / 2   # pin: mean of the disc's printed centres
mx, my = g['zodiac_inner']['c']
edge = np.array(g['edge']['r'])
step = g['edge']['a_deg_step']
# at the tabs the edge detector sees the tab, not the disc: carry the disc's edge across from either side
EANG = np.arange(0, 360, step)
for t in g['tabs_rough'].values():
    lo, hi = t['a0'] - 3, t['a1'] + 3
    bad = ((EANG - lo) % 360) < ((hi - lo) % 360)
    good = ~bad
    edge[bad] = np.interp(EANG[bad], EANG[good], edge[good], period=360)

yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
r = np.hypot(xx - cx, yy - cy)
th = (np.degrees(np.arctan2(yy - cy, xx - cx)) + 360) % 360
edge_px = np.interp(th, np.arange(0, 360, step), edge, period=360)
disc_a = np.clip(edge_px + 1.0 - r + .5, 0, 1)            # the paper disc, 1 px antialiased, its own cut edge

# ---- tabs -------------------------------------------------------------------------------------------------------
yellow = (img[..., 0] > .55) & (img[..., 1] > .42) & (img[..., 2] < .5) & ((img[..., 0] - img[..., 2]) > .25)
tabs = {}
tab_a = np.zeros((H, W), np.float32)
for name, t in g['tabs_rough'].items():
    a0, a1 = t['a0'] - 3, t['a1'] + 3
    win = (((th - a0) % 360) < ((a1 - a0) % 360)) & (r > edge_px - 2) & (r < 1432)
    m = yellow & win
    m = ndi.binary_closing(m, iterations=4) & win
    lab, n = ndi.label(m)
    sizes = ndi.sum(m, lab, range(1, n + 1))
    m = lab == (1 + int(np.argmax(sizes)))
    ys, xs = np.nonzero(m)
    hull = cv2.convexHull(np.c_[xs, ys].astype(np.int32))
    # antialiased polygon: draw at 4x on a local window
    x0, y0 = xs.min() - 20, ys.min() - 20
    x1, y1 = xs.max() + 20, ys.max() + 20
    loc = np.zeros(((y1 - y0) * 4, (x1 - x0) * 4), np.uint8)
    cv2.fillPoly(loc, [((hull[:, 0, :] - [x0, y0]) * 4 + 2).astype(np.int32)], 255, lineType=cv2.LINE_AA)
    loc = cv2.resize(loc, (x1 - x0, y1 - y0), interpolation=cv2.INTER_AREA).astype(np.float32) / 255
    tab_a[y0:y1, x0:x1] = np.maximum(tab_a[y0:y1, x0:x1], loc)
    # the tab's pointing direction: its tip is the hull point furthest from the pin
    d = np.hypot(hull[:, 0, 0] - cx, hull[:, 0, 1] - cy)
    tip = hull[int(np.argmax(d)), 0]
    ang = float((np.degrees(np.arctan2(tip[1] - cy, tip[0] - cx)) + 360) % 360)
    tabs[name] = dict(tip=[int(tip[0]), int(tip[1])], angle=ang, hull=hull[:, 0, :].tolist(), r_tip=float(d.max()))
    print(name, 'tip angle %.2f r %.1f' % (ang, d.max()))
tab_a = tab_a * (r > edge_px - 3)

# ---- restore the mater under the tabs ------------------------------------------------------------------------------
base = img.copy()
moving = np.maximum(disc_a, tab_a)
from scipy.ndimage import gaussian_filter1d, median_filter

# the mater's zodiac inner rule, angle by angle about the pin, carried across the tabs like the edge
Rz = np.arange(edge.min() + 5, edge.max() + 34, .25)
Pz = gaussian_filter1d(polar(L, cx, cy, Rz, np.radians(EANG)), 1.0, axis=0)
Pz = np.where((Rz[:, None] > edge[None] + 6) & (Rz[:, None] < edge[None] + 30), Pz, 9)
zr_ang = median_filter(Rz[np.argmin(Pz, 0)], size=9, mode='wrap')
for t in g['tabs_rough'].values():
    lo, hi = t['a0'] - 3, t['a1'] + 3
    bad = ((EANG - lo) % 360) < ((hi - lo) % 360)
    zr_ang[bad] = np.interp(EANG[bad], EANG[~bad], zr_ang[~bad], period=360)
zr_px = np.interp(th, EANG, zr_ang, period=360)


def at_polar(src, rr, tt_deg, ox=None, oy=None):
    """sample src at radius rr, angle tt (degrees) about (ox, oy), by default the mater's centre"""
    ox = mx if ox is None else ox
    oy = my if oy is None else oy
    t = np.radians(tt_deg)
    X, Y = ox + rr * np.cos(t), oy + rr * np.sin(t)
    if src.ndim == 2:
        return ndi.map_coordinates(src, [Y, X], order=1, mode='nearest')
    return np.stack([ndi.map_coordinates(src[..., c], [Y, X], order=1, mode='nearest') for c in range(3)], -1)


rm = np.hypot(xx - mx, yy - my)
tm_deg = (np.degrees(np.arctan2(yy - my, xx - mx)) + 360) % 360
sat = img.max(-1) - img.min(-1)
q_all = np.ones((H, W), np.float32)
for name, t in tabs.items():
    tm = (tab_a > 0) & (disc_a < 1)
    near = np.zeros_like(tm)
    hx, hy = np.array(t['hull'])[:, 0], np.array(t['hull'])[:, 1]
    near[hy.min() - 260:hy.max() + 260, hx.min() - 260:hx.max() + 260] = True
    tm &= near
    # the checker's outer rule: beyond it the sign names, which do not repeat, so the copy stops there
    Rq = np.arange(1380, 1425, .5)
    Aq = np.radians(np.r_[np.linspace(t['angle'] - 25, t['angle'] - 8, 120), np.linspace(t['angle'] + 8, t['angle'] + 25, 120)])
    pq = gaussian_filter1d(np.median(polar(L, mx, my, Rq, Aq), 1), 1)
    r_names = float(Rq[np.argmin(pq)]) + 9
    zone = ndi.binary_dilation(tm, iterations=40) & near & (disc_a < .01) & (r > edge_px + 1)
    # an angular sector about the mater, its two sides snapped outward onto printed cell rules (every 5 degrees),
    # so the copy's seams lie along rules, never through a numeral
    zt = tm_deg[zone & (rm < r_names)]
    lo, hi = float(zt.min()), float(zt.max())
    Ac = np.arange(lo - 8, hi + 8, .02)
    col = np.median(polar(L, mx, my, np.arange(zr_px.mean() + 14, zr_px.mean() + 50, .5), np.radians(Ac)), 0)
    col = gaussian_filter1d(col, 2)
    mins = [Ac[i] for i in range(3, len(Ac) - 3) if col[i] == col[i - 3:i + 4].min() and col[i] < np.percentile(col, 12)]
    left = max([m for m in mins if m < lo - .3], default=lo - 2)
    right = min([m for m in mins if m > hi + .3], default=hi + 2)
    sector = (((tm_deg - left) % 360) < ((right - left) % 360))
    cover = sector & (disc_a < .5) & (rm < r_names) & (r >= zr_px + 2) & near
    gapz = sector & (disc_a < .5) & (r > edge_px - 3) & (r < zr_px + 2) & near
    print(name, 'sector %.2f..%.2f (footprint %.2f..%.2f), names r %.0f' % (left, right, lo, hi, r_names))

    # 1. the whole footprint inside the checker: the same sign 60/120 degrees round, registered on clean ring beside it
    yd, xd = np.nonzero(cover)
    rd, thd = rm[yd, xd], tm_deg[yd, xd]
    a0, a1, r0, r1 = thd.min(), thd.max(), rd.min(), rd.max()
    far = ndi.binary_dilation(tm, iterations=60)
    sides = {}
    for side, (b0, b1) in {'L': (a0 - 6, a0), 'R': (a1, a1 + 6)}.items():
        ctx = near & ~far & (moving < .01) & (tm_deg > b0) & (tm_deg < b1) & (rm > zr_px - 12) & (rm < r_names)
        if ctx.sum() < 500:
            ctx = ~ndi.binary_dilation(tm, iterations=42) & (moving < .01) & (tm_deg > b0 - 4) & (tm_deg < b1 + 4) & (rm > zr_px - 12) & (rm < r_names)
        yc, xc = np.nonzero(ctx)
        rc_, tc_ = rm[yc, xc], tm_deg[yc, xc]
        target = L[yc, xc]
        best = None
        for phi in (-120, -60, 60, 120):
            for dth in np.arange(-.8, .81, .2):
                for dr in np.arange(-10, 10.1, 1):
                    e = np.mean((at_polar(L, rc_ + dr, tc_ + phi + dth) - target) ** 2)
                    if best is None or e < best[0]:
                        best = (e, phi, dth, dr)
        e, phi, dth0, dr0 = best
        for dth in np.arange(dth0 - .2, dth0 + .21, .025):
            for dr in np.arange(dr0 - 1, dr0 + 1.01, .25):
                e = np.mean((at_polar(L, rc_ + dr, tc_ + phi + dth) - target) ** 2)
                if e < best[0]:
                    best = (e, phi, dth, dr)
        src_l = at_polar(L, rc_ + best[3], tc_ + best[1] + best[2])
        hi = target > np.percentile(target, 70)
        sides[side] = best + (float(np.median(target[hi]) / max(np.median(src_l[hi]), 1e-3)),)
    (eL, phiL, dthL, drL, gL), (eR, phiR, dthR, drR, gR) = sides['L'], sides['R']
    if phiL != phiR:
        phiL = phiR = phiL if eL < eR else phiR
    f = np.clip((thd - a0) / max(a1 - a0, 1e-3), 0, 1)
    sr = rd + drL * (1 - f) + drR * f
    st = thd + phiL + dthL * (1 - f) + dthR * f
    sx2, sy2 = mx + sr * np.cos(np.radians(st)), my + sr * np.sin(np.radians(st))
    patch = np.stack([ndi.map_coordinates(img[..., c], [sy2, sx2], order=1, mode='nearest') for c in range(3)], -1)
    # tone: colour gain measured on bare paper only (paper in both scan and source), each side, blended across
    def side_gain(a_lo, a_hi, dth_, dr_):
        bandm = near & (moving < .01) & (((tm_deg - a_lo) % 360) < ((a_hi - a_lo) % 360)) & (rm >= zr_px + 2) & (rm < r_names)
        yb_, xb_ = np.nonzero(bandm)
        src_ = at_polar(img, rm[yb_, xb_] + dr_, tm_deg[yb_, xb_] + phiL + dth_)
        dst_ = img[yb_, xb_]
        isp = lambda v: (v.mean(-1) > .62) & ((v.max(-1) - v.min(-1)) < .16)
        m_ = isp(src_) & isp(dst_)
        return np.median(dst_[m_], 0) / np.maximum(np.median(src_[m_], 0), 1e-3), int(m_.sum())
    gL3, nL = side_gain(left - 4, left - .15, dthL, drL)
    gR3, nR = side_gain(right + .15, right + 4, dthR, drR)
    print(name, 'paper gain L', gL3.round(3), nL, 'R', gR3.round(3), nR)
    if nL < 100: gL3 = gR3
    if nR < 100: gR3 = gL3
    gainL, gainR = gL3[None], gR3[None]
    patch = patch * (gainL * (1 - f[:, None]) + gainR * f[:, None])
    soft = ndi.gaussian_filter(cover.astype(np.float32), 1.0)[yd, xd]
    soft = np.where(ndi.binary_erosion(cover, iterations=2)[yd, xd], 1, soft)
    base[yd, xd] = base[yd, xd] * (1 - soft[:, None]) + patch * soft[:, None]
    np.save(os.path.join(WORK, f'cover-{name}.npy'), np.c_[yd, xd])
    t.update(src_phi=float(phiL), r_names=r_names, left=[float(dthL), float(drL), float(np.sqrt(eL))], right=[float(dthR), float(drR), float(np.sqrt(eR))])
    print(name, 'copy from %+d deg; L dth %.3f dr %.2f rms %.3f; R dth %.3f dr %.2f rms %.3f'
          % (phiL, dthL, drL, np.sqrt(eL), dthR, drR, np.sqrt(eR)))

    # 1b. the gap between the disc's edge and the zodiac rule, and the tab's tip in the blank strip before the names:
    #     the same gap / strip just outside the sector on either side (about the pin), scaled so its two rules line up
    tip = ndi.binary_dilation(tm, iterations=4) & (rm >= r_names) & near
    fillm = gapz | tip
    yg, xg = np.nonzero(fillm)
    span = (right - left) % 360
    rmg, tmg = rm[yg, xg], tm_deg[yg, xg]
    fg = np.clip(((tmg - left) % 360) / max(span, 1e-3), 0, 1)
    out = 0
    for wgt, ts in ((1 - fg, tmg - span - 2.5), (fg, tmg + span + 2.5)):
        out = out + at_polar(img, rmg, ts % 360) * wgt[:, None]
    soft = ndi.gaussian_filter(fillm.astype(np.float32), .8)[yg, xg]
    soft = np.where(ndi.binary_erosion(fillm, iterations=1)[yg, xg], 1, soft)
    base[yg, xg] = base[yg, xg] * (1 - soft[:, None]) + out * soft[:, None]

    # 2. beyond the checker (the sign names): the tab's soft cast shadow, divided out against the paper's level
    paper = (L > .5) & (sat < .2)
    outside = near & paper & ~zone & (moving < .01) & (rm > r_names)
    num = ndi.gaussian_filter(np.where(outside, L, 0).astype(np.float32), 20)
    den = ndi.gaussian_filter(outside.astype(np.float32), 20)
    level = num / np.maximum(den, 1e-4)
    ok = zone & paper & (rm >= r_names)
    qn = ndi.gaussian_filter(np.where(ok, L / np.maximum(level, 1e-3), 0).astype(np.float32), 5)
    qd = ndi.gaussian_filter(ok.astype(np.float32), 5)
    q = np.clip(qn / np.maximum(qd, 1e-4), .4, 1)
    q = np.where(qd > .05, q, 1)
    q = np.where(zone & (rm >= r_names), q, 1)
    q = 1 - (1 - q) * np.clip(ndi.gaussian_filter((zone & (rm >= r_names)).astype(np.float32), 5) * 2, 0, 1)
    sel = q < .999
    base[sel] = np.clip(img[sel] / q[sel][:, None], 0, 1)
    q_all = np.minimum(q_all, q)
    print(name, 'name-band shadow: darkest %.2f' % q.min())

# ---- restore the mater under the disc's edge: the gap paper, reflected radially --------------------------------
band = (r > edge_px - 16) & (r < edge_px + 2.5)
yb, xb = np.nonzero(band)
rb = r[yb, xb]
eb = edge_px[yb, xb]
rs = 2 * (eb + 3.5) - rb                                   # reflect about a line just outside the cut edge
k = (xb - cx) / np.maximum(rb, 1), (yb - cy) / np.maximum(rb, 1)
Xs, Ys = cx + rs * k[0], cy + rs * k[1]
src = base.copy()
for c in range(3):
    base[yb, xb, c] = ndi.map_coordinates(src[..., c], [Ys, Xs], order=1, mode='nearest')

# ---- the cap ------------------------------------------------------------------------------------------------------
kx, ky = g['cap']['c']
rc = g['cap']['r'] + 2.0
cap_a = np.clip(rc - np.hypot(xx - kx, yy - ky) + .5, 0, 1)

# shadow layer (travels with the disc): inside the copied footprint, how much darker the scan is than the restored mater
Lb = base.mean(-1)
sh = np.clip(1 - L / np.maximum(Lb, 1e-3), 0, .75)
sh = ndi.gaussian_filter(sh, .7)
shadow = np.where((np.maximum(disc_a, tab_a) > 0) | (r <= edge_px + 1), 0, np.maximum(sh, 1 - q_all)).astype(np.float32)
near_tabs = ndi.binary_dilation(tab_a > .01, iterations=42)
shadow = np.where(near_tabs, shadow, 0)
shadow = np.where(shadow > .01, shadow, 0)

# ---- solve the layers -------------------------------------------------------------------------------------------
a = np.maximum(np.maximum(disc_a, tab_a), 0)
a = np.where(a > 0, a, shadow)
F = np.where(a[..., None] > 1e-3, (img - base * (1 - a[..., None])) / np.maximum(a[..., None], 1e-3), 0)
F = np.where((shadow > 0)[..., None] & (np.maximum(disc_a, tab_a) == 0)[..., None], 0, F)  # shadows are black (base*(1-s) = scan)
F = np.clip(F, 0, 1)
disc = np.dstack([F, a])
cap = np.dstack([img, cap_a])

# check: composite at rest == scan
comp = base * (1 - a[..., None]) + F * a[..., None]
comp = comp * (1 - cap_a[..., None]) + img * cap_a[..., None]
err = np.abs(comp - img).max(-1)
print('rest composite vs scan: max err %.4f, p99.9 %.4f' % (err.max(), np.percentile(err, 99.9)))

# bounding box of the moving layer, square about the pin
ys_, xs_ = np.nonzero(a > .004)
rmax = float(np.hypot(xs_ - cx, ys_ - cy).max()) + 4
np.save(os.path.join(WORK, 'disc_rgba.npy'), disc.astype(np.float16))
np.save(os.path.join(WORK, 'cap_rgba.npy'), cap.astype(np.float16))
save(os.path.join(WORK, 'base.png'), base)
json.dump(dict(pin=[float(cx), float(cy)], mater_c=[mx, my], rmax=rmax, cap=dict(c=[kx, ky], r=rc), tabs=tabs),
          open(os.path.join(WORK, 'cut.json'), 'w'), indent=1)

# look: the base with the disc turned 37 degrees, the tabs' patches
M = cv2.getRotationMatrix2D((cx, cy), -37, 1)
rot = cv2.warpAffine(disc.astype(np.float32), M, (W, H), flags=cv2.INTER_LINEAR)
look = base * (1 - rot[..., 3:]) + rot[..., :3] * rot[..., 3:]
look = look * (1 - cap_a[..., None]) + img * cap_a[..., None]
save(os.path.join(WORK, 'cut-check.png'), look)
print('rmax', rmax)
