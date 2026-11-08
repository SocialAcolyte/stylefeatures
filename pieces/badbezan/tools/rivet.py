"""Stage 0: the rivet. The brass pin and its mother-of-pearl washer, each a circle fitted to its own edge
(radial profiles about a first guess, least squares with outliers dropped). The sticks turn about the pin.
writes WORK/rivet.json, and WORK/polar.png (the fan unwrapped about the pin, to look at)"""
from scipy.ndimage import gaussian_filter1d
from common import *
img = load(SRC); L = img.mean(-1)
cx, cy = 1942.5, 2170.0                    # by eye, on the photograph
A = np.radians(np.arange(0, 360, 1.0))
for it in range(4):
    R = np.arange(14, 34, .25)
    P = gaussian_filter1d(polar(L, cx, cy, R, A), 1, axis=0)
    r = R[np.argmax(-np.diff(P, axis=0), 0)] + .125          # white washer -> darker gilt outside it
    cx, cy, rw, res, ok = fit_circle(cx + r * np.cos(A), cy + r * np.sin(A))
print(f'washer: c=({cx:.2f},{cy:.2f}) r={rw:.2f} med|res|={np.median(np.abs(res[ok])):.2f} inliers={ok.mean():.2f}')
px, py = cx, cy
for it in range(4):
    R = np.arange(5, 18, .25)
    P = gaussian_filter1d(polar(L, px, py, R, A), 1, axis=0)
    r = R[np.argmax(np.diff(P, axis=0), 0)] + .125           # brass head -> white washer
    px, py, rp, res, ok = fit_circle(px + r * np.cos(A), py + r * np.sin(A))
print(f'pin: c=({px:.2f},{py:.2f}) r={rp:.2f} med|res|={np.median(np.abs(res[ok])):.2f} inliers={ok.mean():.2f}')
json.dump(dict(washer=[cx, cy, rw], pin=[px, py, rp]), open(os.path.join(WORK, 'rivet.json'), 'w'))
Ad = np.arange(160, 372, .1); R = np.arange(30, 1900, 1.0)
save(os.path.join(WORK, 'polar.png'), polar(img, px, py, R, np.radians(Ad))[::-1])
