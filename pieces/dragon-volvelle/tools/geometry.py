"""Stage 1: where everything sits on the page (master px, 3840-wide scan).

  - the printed centre of the dragon disc (circles fitted to its own printed rules)
  - the cap: the rosette over the pin
  - the disc's hand-cut paper edge, angle by angle (it is not a perfect circle; it turns with its own edge)
  - the zodiac ring of the mater (its inner rule), and the sign boundaries
  - the two tabs, CAPVT and CAVDA, as polygons in disc coordinates

writes WORK/geometry.json and WORK/geometry.png (an overlay to look at)
"""
import cv2
from scipy.ndimage import gaussian_filter1d, median_filter
from common import *

img = load(SRC)
H, W, _ = img.shape
L = img.mean(-1)
A_DEG = np.arange(0, 360, 0.25)
A = np.radians(A_DEG)
TABS = {'caput': 142.0, 'cauda': 324.0}  # rough angles (image coords, y down), refined below


def away_from_tabs(a_deg, w=12):
    k = np.ones(len(a_deg), bool)
    for t in TABS.values():
        k &= np.abs(((a_deg - t + 180) % 360) - 180) > w
    return k


def line_radius(cx, cy, r0, r1, step=.25):
    """per angle, the radius of the darkest printed rule between r0 and r1"""
    R = np.arange(r0, r1, step)
    P = polar(L, cx, cy, R, A)
    P = gaussian_filter1d(P, 1.0, axis=0)
    return R[np.argmin(P, 0)]


def fit_rule(cx, cy, r0, r1):
    r = line_radius(cx, cy, r0, r1)
    k = away_from_tabs(A_DEG)
    x, y = cx + r * np.cos(A), cy + r * np.sin(A)
    fx, fy, fr, res, ok = fit_circle(x[k], y[k])
    return fx, fy, fr, float(np.median(np.abs(res[ok]))), float(ok.mean())


# 1. printed centre: iterate on the outer rule of the disc's yellow year ring (r ~1305), then confirm on inner rules
cx, cy = 1696.3, 2722.7
for _ in range(3):
    cx, cy, r_rim_rule, med, frac = fit_rule(cx, cy, 1296, 1312)
print(f'disc rim rule: c=({cx:.2f},{cy:.2f}) r={r_rim_rule:.2f} med|res|={med:.2f} inliers={frac:.2f}')
checks = {}
for name, (r0, r1) in {'year_inner': (1230, 1262), 'zodiac_inner': (1322, 1340)}.items():
    fx, fy, fr, med, frac = fit_rule(cx, cy, r0, r1)
    checks[name] = dict(c=[fx, fy], r=fr, med=med, inliers=frac)
    print(f'{name}: c=({fx:.2f},{fy:.2f}) r={fr:.2f} med={med:.2f} inl={frac:.2f}')

# 2. the cap (rosette): its outer black rule, r ~170-185 around the pin
rx, ry = cx, cy
for _ in range(3):
    rx, ry, r_cap, med, frac = fit_rule(rx, ry, 160, 195)
print(f'cap: c=({rx:.2f},{ry:.2f}) r={r_cap:.2f} med={med:.2f} inl={frac:.2f}')

# 3. the paper edge of the disc, per angle, between the rim rule and the mater's zodiac rule.
#    The cut edge reads as a thin darker line (the paper's edge and its shadow on the mater).
zx, zy, zr = checks['zodiac_inner']['c'] + [checks['zodiac_inner']['r']]
R = np.arange(r_rim_rule + 3, zr - 4, .25)
P = polar(L, cx, cy, R, A)
P = gaussian_filter1d(P, 1.2, axis=0)
P = gaussian_filter1d(P, 3, axis=1, mode='wrap')   # the edge is continuous along the angle
grad = np.diff(P, axis=0)                            # outward: paper (bright) -> edge line (dark): strongest negative step
edge = R[np.argmin(grad, 0) + 1]
edge = median_filter(edge, size=9, mode='wrap')
print('paper edge r: min %.1f med %.1f max %.1f' % (edge.min(), np.median(edge), edge.max()))

# 4. tabs: angular extent where the yellow tab paper covers the zodiac ring's white cells (r ~1340-1400)
S = img.max(-1) - img.min(-1)
Rt = np.arange(zr + 4, zr + 70, .5)
Pt = polar(S, cx, cy, Rt, A)
yellow = polar(((img[..., 0] > .55) & (img[..., 1] > .45) & (img[..., 2] < .45)).astype(np.float32), cx, cy, Rt, A)
tabs = {}
for name, t in TABS.items():
    win = np.abs(((A_DEG - t + 180) % 360) - 180) < 10
    cov = yellow[:, win].mean(0)
    idx = np.where(win)[0][cov > .08]
    tabs[name] = dict(a0=float(A_DEG[idx.min()]), a1=float(A_DEG[idx.max()]))
    print(name, tabs[name])

json.dump(dict(W=W, H=H, center=[cx, cy], r_rim_rule=r_rim_rule, cap=dict(c=[rx, ry], r=r_cap), checks=checks,
               zodiac_inner=dict(c=[zx, zy], r=zr), edge=dict(a_deg_step=.25, r=[round(float(e), 2) for e in edge]),
               tabs_rough=tabs), open(os.path.join(WORK, 'geometry.json'), 'w'), indent=1)

# overlay
ov = (img * 255).astype(np.uint8).copy()
pts = np.c_[cx + edge * np.cos(A), cy + edge * np.sin(A)].astype(np.int32)
cv2.polylines(ov, [pts], True, (255, 0, 255), 2)
cv2.circle(ov, (int(cx), int(cy)), int(r_rim_rule), (0, 200, 255), 1)
cv2.circle(ov, (int(rx), int(ry)), int(r_cap), (0, 255, 0), 2)
cv2.circle(ov, (int(zx), int(zy)), int(zr), (255, 120, 0), 1)
cv2.drawMarker(ov, (int(cx), int(cy)), (255, 0, 0), cv2.MARKER_CROSS, 40, 2)
Image.fromarray(ov).save(os.path.join(WORK, 'geometry.png'))
