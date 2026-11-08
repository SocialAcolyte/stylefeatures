"""overlay the fitted edges on the polar unwrap: WORK/polar-edges.jpg"""
import sys
from common import *
d = np.load(os.path.join(WORK, sys.argv[1] if len(sys.argv) > 1 else 'edges.npz'))
img = load(os.path.join(WORK, 'polar.png'))[::-1]     # polar.png: 160..372 deg at .1, r 30..1900 flipped
R = d['R']; A0, DA0 = 160, .1
out = img.copy()
E = d['E'] if 'E' in d.files else np.array([d['alpha'][k] + d['f'] for k in range(len(d['alpha']))])
cols = [(1, 0, 1), (0, 1, 1), (0, 0, 1)]
for k, e in enumerate(E):
    for r_i, a in enumerate(e):
        if not np.isfinite(a): continue
        x = int(round((a - A0) / DA0)); y = int(R[r_i] - 30)
        if 0 <= x < out.shape[1] and 0 <= y < out.shape[0]:
            out[y, max(0, x - 1):x + 2] = cols[k % 3]
save(os.path.join(WORK, 'polar-edges.png'), out[::-1])
from PIL import Image
Image.open(os.path.join(WORK, 'polar-edges.png')).resize((1590, 1402)).save(os.path.join(WORK, 'polar-edges-s.jpg'), quality=85)
