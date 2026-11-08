"""Stage 1: the fan's outline against the Met's ground, and the two guards' outer edges about the pin.

The ground in the Met's photograph is neutral to the bit (R = G = B); lacquer and gilt never are. So the fan is
everything saturated, holes filled, the largest piece kept.
writes WORK/mask.png and WORK/outline.npz (per radius, the first and last angle on the fan: the guards' outer edges)
"""
from scipy.ndimage import binary_fill_holes, binary_opening, label, sum as nsum
from common import *

img = load(SRC)
sp = (img.max(-1) - img.min(-1)) * 255
m = binary_fill_holes(sp > 22)
m = binary_opening(m, iterations=2)
lab, n = label(m)
m = lab == (np.argmax(nsum(m, lab, range(1, n + 1))) + 1)
m = binary_fill_holes(m)
Image.fromarray((m * 255).astype(np.uint8)).save(os.path.join(WORK, 'mask.png'))

cx, cy, _ = json.load(open(os.path.join(WORK, 'rivet.json')))['pin']
A_DEG = np.arange(170, 372, 0.05); R = np.arange(40, 1900, 1.0)
M = polar(m.astype(np.float32), cx, cy, R, np.radians(A_DEG)) > .5
first = np.array([A_DEG[np.argmax(row)] if row.any() else np.nan for row in M])
last = np.array([A_DEG[len(row) - 1 - np.argmax(row[::-1])] if row.any() else np.nan for row in M])
np.savez(os.path.join(WORK, 'outline.npz'), first=first, last=last, R=R)
print('fan px', int(m.sum()), ' bottom guard outer edge at r=1300:', round(first[1260], 2), ' top guard:', round(last[1260], 2))
