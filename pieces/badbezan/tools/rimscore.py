"""a matched filter for a stick's leading edge, in polar coordinates about the pin:
going clockwise, a thin dark line (the gap and the shadow on the stick below), then the plain gilt rim (~9 px).
writes WORK/rim.npz (score, R, A_DEG) and WORK/rim.png"""
from scipy.ndimage import gaussian_filter, gaussian_filter1d, uniform_filter1d
from common import *
img = load(SRC)
L = gaussian_filter(img.mean(-1), .7)
rv = json.load(open(os.path.join(WORK, 'rivet.json'))); cx, cy, _ = rv['pin']
DA = 0.05
A_DEG = np.arange(170, 372, DA); R = np.arange(40, 1900, 1.0)
P = polar(L, cx, cy, R, np.radians(A_DEG))
S = np.zeros_like(P)
for i, r in enumerate(R):
    px = r * np.radians(DA)                  # px per column at this radius
    def o(p): return max(1, int(round(p / px)))
    row = P[i]
    w_band, w_dark = o(8), o(2.5)
    band = uniform_filter1d(row, w_band, mode='nearest')
    band = np.roll(band, -(o(2) + w_band // 2))              # band starts 2 px after the edge
    sq = uniform_filter1d(row * row, w_band, mode='nearest'); sq = np.roll(sq, -(o(2) + w_band // 2))
    std = np.sqrt(np.clip(sq - band * band, 0, None))
    dark = uniform_filter1d(row, w_dark, mode='nearest'); dark = np.roll(dark, w_dark // 2 + 0)
    S[i] = band - dark - 0.7 * std
S = gaussian_filter1d(S, 3, axis=0)
S = np.clip(S, 0, None); S /= np.percentile(S, 99.7); S = np.minimum(S, 1)
np.savez(os.path.join(WORK, 'rim.npz'), S=S, R=R, A_DEG=A_DEG)
save(os.path.join(WORK, 'rim.png'), np.repeat(S[::-1, ::2, None], 3, -1))
