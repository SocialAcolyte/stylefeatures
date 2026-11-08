"""Stage 2: each stick's leading edge (where it lies over the stick before it, going clockwise).

Eighteen sticks cut to one pattern, ten degrees apart: in polar coordinates about the pin each leading edge is a
near-vertical line. Each is found from the colour-edge strength in a corridor about its read-off angle (the grid,
WORK/grid-*.jpg): a dynamic-programming path over radius. Along the straight shaft (r 400..2350 at 5330 px) the path
is replaced by the straight line fitted to it in the image (a stick is straight); past it, over the rounded cap,
the path follows the cap's own curve. Below the pin the sticks' heels are the same straight lines carried through.
writes WORK/edges.npz: E (17, NR) leading-edge angles for sticks 1..17 (stick 0, the bottom guard, has none),
LINE (17, 2) each edge's line (angle, distance from the pin), R"""
from scipy.ndimage import gaussian_filter, gaussian_filter1d
from common import *
img = load(SRC)
cx, cy, _ = json.load(open(os.path.join(WORK, 'rivet.json')))['pin']
DA = .05
A_DEG = np.arange(178, 362, DA); R = np.arange(60, 2900, 2.0); NR = len(R)
sm = gaussian_filter(img, (1.5, 1.5, 0))
P = polar(sm, cx, cy, R, np.radians(A_DEG))
S = np.abs(np.diff(P, axis=1, append=P[:, -1:])).sum(-1)
S = gaussian_filter1d(S, 2, axis=0)
S /= np.percentile(S, 99.5); S = np.minimum(S, 1)
col = lambda x: np.clip(np.round((np.asarray(x) - A_DEG[0]) / DA).astype(int), 0, len(A_DEG) - 1)
guess = [190.0, 200.0, 209.8, 219.8, 229.8, 239.8, 249.8, 259.8, 269.7, 279.6, 289.6, 299.5, 309.8, 319.6, 329.5, 339.2, 349.0]
rows = (R > 1100) & (R < 2300)
prof = S[rows].mean(0)
alpha = np.array([A_DEG[col(g - 1.5) + np.argmax(prof[col(g - 1.5):col(g + 1.5)])] for g in guess])
print('edges at mid-shaft:', np.round(alpha, 2), 'gaps', np.round(np.diff(alpha), 2))


def dp(score, j0, win):
    n = score.shape[1]
    i0 = int(np.argmin(np.abs(R - 1700)))
    path = np.zeros(NR, int)
    for direction in (1, -1):
        rr = list(range(i0, NR)) if direction == 1 else list(range(i0, -1, -1))
        cur = np.full(n, -1e9); cur[max(0, j0 - win):j0 + win + 1] = score[i0, max(0, j0 - win):j0 + win + 1]
        bps = []
        for i in rr[1:]:
            s = 10 if R[i] > 2350 else 2
            best = np.full(n, -1e9); arg = np.zeros(n, np.int32)
            for d in range(-s, s + 1):
                sh = np.full(n, -1e9)
                if d > 0: sh[d:] = cur[:n - d]
                elif d < 0: sh[:d] = cur[-d:]
                else: sh = cur.copy()
                sh -= (.004 if R[i] > 2350 else .02) * abs(d)
                u = sh > best; best[u] = sh[u]; arg[u] = (np.arange(n) - d)[u]
            cur = best + score[i]; bps.append(arg)
        j = int(np.argmax(cur))
        for k in range(len(rr) - 1, 0, -1):
            path[rr[k]] = j; j = bps[k - 1][j]
        path[i0] = j
    return path


# Each leading edge is a straight line a set distance d from the pin (the sticks taper to the rivet), at its own
# angle: fit both to the edge strength along the shaft, then follow the cap's curve with the DP beyond it.
from scipy.ndimage import map_coordinates
Simg_r = lambda r: np.clip((r - R[0]) / 2.0, 0, NR - 1)
shaft = np.arange(420, 2340, 4.0)
E = np.zeros((len(alpha), NR)); LINE = np.zeros((len(alpha), 2))
for k, a0 in enumerate(alpha):
    best = (-1, 0, 0)
    for d in np.arange(-40, 41, 2.0):
        for th in np.arange(a0 - 2.5, a0 + 2.5, .02):
            t = np.radians(th)
            X = shaft * np.cos(t) - d * np.sin(t); Y = shaft * np.sin(t) + d * np.cos(t)
            rr = np.hypot(X, Y); aa = np.degrees(np.arctan2(Y, X)) % 360; aa = np.where(aa < 120, aa + 360, aa)
            sc = map_coordinates(S, [Simg_r(rr), (aa - A_DEG[0]) / DA], order=1).mean()
            if sc > best[0]: best = (sc, th, d)
    sc, th, d = best
    LINE[k] = [th, d]
    t = np.radians(th)
    lineang = np.degrees(t + np.arcsin(np.clip(d / np.maximum(R, abs(d) + 1), -1, 1)))
    lo, hi = col(a0 - 4), col(a0 + 2.2)
    p = dp(S[:, lo:hi], col(lineang[np.argmin(np.abs(R - 2300))]) - lo, int(.4 / DA)) + lo
    ang = A_DEG[p]
    j = int(np.argmin(np.abs(R - 2340)))
    cap = gaussian_filter1d(ang[j:], 3, mode='nearest')
    E[k] = lineang
    E[k, j:] = cap - cap[0] + lineang[j]
    print(k + 1, 'theta %.2f d %.0f score %.3f' % (th, d, sc))
np.savez(os.path.join(WORK, 'edges.npz'), E=E, R=R, LINE=LINE, alpha=alpha)
print('line d:', np.round(LINE[:, 1]))
