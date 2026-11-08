"""Stage 1b: trace every stick's leading edge (sticks 1..19; stick 0, the bottom guard, has none on the fan)
on the rim score (rimscore.py).

The 18 inner sticks were cut to one pattern, so their leading edges are one curve f(r) turned to each stick's own
angle a_k. f is fitted jointly on the clearest sticks (one DP over r on their summed rim score), every a_k is then
fitted to f, and each stick is finally refined on its own within 0.6 degree of the pattern (hand-cut wood is not
exact). The top guard has its own outline and is traced alone.
writes WORK/edges.npz: E (19, len(R)) degrees, nan past the stick's tip"""
from common import *
from scipy.ndimage import gaussian_filter1d
d = np.load(os.path.join(WORK, 'rim.npz')); S = d['S']; R = d['R']; A_DEG = d['A_DEG']
DA = A_DEG[1] - A_DEG[0]
NR = len(R)
m = np.asarray(Image.open(os.path.join(WORK, 'mask.png'))) > 0
rv = json.load(open(os.path.join(WORK, 'rivet.json'))); cx, cy, _ = rv['pin']
M = polar(m.astype(np.float32), cx, cy, R, np.radians(A_DEG)) > .5


def col(a):
    return np.clip(np.round((np.asarray(a) - A_DEG[0]) / DA).astype(int), 0, len(A_DEG) - 1)


def steps(r):
    # the tip's rounded cap sweeps fast in angle; so does the neck near the pin
    return 8 if r > 1500 else (1 if r > 560 else (3 if r > 300 else (6 if r > 160 else 12)))


def dp(score, anchor_i, anchor_j, win, pen_far=.03, pen_near=.006):
    """score (NR, n): best path over all rows through (anchor_i, ~anchor_j +- win)"""
    n = score.shape[1]
    path = np.zeros(NR, int)
    for direction in (1, -1):
        rows = list(range(anchor_i, NR)) if direction == 1 else list(range(anchor_i, -1, -1))
        cur = np.full(n, -1e9)
        lo, hi = max(0, anchor_j - win), min(n, anchor_j + win + 1)
        cur[lo:hi] = score[anchor_i, lo:hi]
        bps = []
        for r_i in rows[1:]:
            s = steps(R[r_i]); pen = pen_far if 560 < R[r_i] <= 1500 else pen_near
            best = np.full(n, -1e9); arg = np.zeros(n, np.int32)
            for dd in range(-s, s + 1):
                sh = np.full(n, -1e9)
                if dd > 0: sh[dd:] = cur[:n - dd]
                elif dd < 0: sh[:dd] = cur[-dd:]
                else: sh = cur.copy()
                sh -= pen * abs(dd)
                u = sh > best; best[u] = sh[u]; arg[u] = (np.arange(n) - dd)[u]
            cur = best + score[r_i]; bps.append(arg)
        j = int(np.argmax(cur))
        for k in range(len(rows) - 1, 0, -1):
            path[rows[k]] = j; j = bps[k - 1][j]
        path[anchor_i] = j
    return path


ri = int(1300 - R[0])
prof = S[ri - 100:ri + 100].mean(0)
# the leading edges at r = 1300, read off the rim score straightened by the pattern (probe3.py): the right-hand
# sticks' rims cast almost no shadow under the Met's light from the left, so they are weak and are held to the pattern
alpha = np.array([193.65, 201.95, 210.05, 217.7, 225.05, 233.3, 241.9, 250.95, 258.95, 266.75, 276.5, 286.65, 295.4,
                  304.7, 314.15, 322.7, 330.2, 339.7, 348.1])

OFF = np.arange(-12, 4, DA)
o0 = int(round(-OFF[0] / DA))


def pattern(ks):
    sc = np.zeros((NR, len(OFF)))
    for k in ks:
        sc += S[:, col(alpha[k] + OFF)]
    p = dp(sc / len(ks), ri, o0, 6)
    return OFF[p]


for it in range(2):
    f = pattern(range(0, 11))
    for k in range(18):
        best, bs = -1, 0
        for dd in np.arange(-0.8, 0.8001, DA):
            sc = S[np.arange(NR), col(alpha[k] + dd + f)].mean()
            if sc > best: best, bs = sc, dd
        alpha[k] += bs
    alpha[:18] -= f[ri]
    f -= f[ri]
    print(f'iter {it}: a', np.round(alpha[:18], 2), 'gaps', np.round(np.diff(alpha[:18]), 2))
f = gaussian_filter1d(f, 5, mode='nearest')      # the DP moves in whole columns; the cut edge is a smooth curve
print('pattern f at r=100..1700:', np.round(f[col(0) * 0 + (np.arange(100, 1800, 100) - int(R[0]))], 2))

E = np.full((19, NR), np.nan)
LOC = np.arange(-0.6, 0.6001, DA); l0 = int(round(0.6 / DA))
from scipy.ndimage import gaussian_filter1d
for k in range(18):
    base = alpha[k] + f
    sc = np.stack([S[np.arange(NR), col(base + o)] for o in LOC], 1)
    p = dp(sc, ri, l0, l0, pen_far=.05, pen_near=.02)
    # a stick's own departure from the pattern is slow (hand-cut wood); keep that, drop the jitter
    E[k] = base + gaussian_filter1d(LOC[p], 18, mode='nearest')
# the top guard alone, in a wide corridor right of stick 18
g = alpha[18]
OFFG = np.arange(-14, 6, DA)
sc = S[:, col(g + OFFG)].copy()
for i in range(NR):
    sc[i, (g + OFFG) < E[17, i] + 1.0] = -1
p = dp(sc, ri, int(round(14 / DA)), 20)
E[18] = g + gaussian_filter1d(OFFG[p], 6, mode='nearest')
# the guard's cap: its rim runs straight on to the tip (the trace jumps onto paint there); hold it
i0 = int(1550 - R[0]); E[18, i0:] = np.minimum(E[18, i0:], E[18, i0])

# a leading edge ends at its stick's tip: where the fan just clockwise of it is no longer fan
tips = []
for k in range(19):
    inside = np.array([M[i, col(E[k, i] + 0.5)] for i in range(NR)])
    last = np.where(inside)[0].max()           # from the top down: the first row still on the fan (slits don't count)
    E[k, last + 1:] = E[k, last]; tips.append(R[last])   # past the tip: hold the angle (the cap above is this stick)
# near the pin the polar trace can't follow an edge that sweeps through many degrees per pixel. There the necks
# are straight: continue each leading edge inward along the straight line it runs on just outside (Cartesian fit)
for k in range(19):
    r0 = 175 if k == 18 else 130
    sel = (R >= r0) & (R < r0 + 70)
    a = np.radians(E[k, sel]); px, py = R[sel] * np.cos(a), R[sel] * np.sin(a)
    c = np.polyfit(px, py, 1) if np.ptp(px) > np.ptp(py) else None
    P = np.c_[px, py].mean(0)
    U = np.linalg.svd(np.c_[px, py] - P)[2][0]
    if U @ P > 0: U = -U                       # pointing inward, toward the pin
    for i in np.where(R < r0)[0]:
        r = R[i]
        # |P + tU| = r  ->  t^2 + 2 t (P.U) + |P|^2 - r^2 = 0, the first crossing going inward
        b = P @ U; cc_ = P @ P - r * r; disc = b * b - cc_
        if disc < 0:
            t = -b                              # the line passes outside this radius: take its nearest point
        else:
            t = -b - np.sqrt(disc)
        q = P + t * U
        E[k, i] = np.degrees(np.arctan2(q[1], q[0])) % 360
        if E[k, i] < 120: E[k, i] += 360
np.savez(os.path.join(WORK, 'edges.npz'), E=E, R=R, alpha=alpha, f=f)
print('tips', tips)
for r in (60, 100, 200, 300, 450, 600, 1000, 1500):
    print(r, np.round(E[:, int(r - R[0])], 1))
