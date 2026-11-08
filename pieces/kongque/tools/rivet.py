"""Stage 0: the pin. The brass rivet at the gorge, a circle fitted to its own edge (radial profiles about a first
guess, least squares, outliers dropped). The sticks turn about it.
writes WORK/rivet.json and WORK/polar.png (the fan unwrapped about the pin, to look at)"""
import sys
from scipy.ndimage import gaussian_filter1d
from common import *
img = load(SRC); L = img.mean(-1)
cx, cy = (float(sys.argv[1]), float(sys.argv[2])) if len(sys.argv) > 2 else (2660.0, 2710.0)
save(os.path.join(WORK, 'pin-look.png'), img[int(cy) - 90:int(cy) + 90, int(cx) - 90:int(cx) + 90])
A = np.radians(np.arange(0, 360, 2.0))
for it in range(5):
    R = np.arange(5, 24, .25)
    P = gaussian_filter1d(polar(L, cx, cy, R, A), 1.5, axis=0)
    r = R[np.argmax(np.abs(np.diff(P, axis=0)), 0)] + .125
    cx, cy, rp, res, ok = fit_circle(cx + r * np.cos(A), cy + r * np.sin(A))
print(f'pin: c=({cx:.2f},{cy:.2f}) r={rp:.2f} med|res|={np.median(np.abs(res[ok])):.2f} inliers={ok.mean():.2f}')
json.dump(dict(pin=[cx, cy, rp]), open(os.path.join(WORK, 'rivet.json'), 'w'))
Ad = np.arange(170, 372, .1); R = np.arange(20, 2900, 2.0)
save(os.path.join(WORK, 'polar.png'), polar(img, cx, cy, R, np.radians(Ad))[::-1])
