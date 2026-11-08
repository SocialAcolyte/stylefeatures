# snap every straight edge of each star polygon to the real joint, then re-intersect
import sys, json, numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from skimage import color
src, outd = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGB')
a = np.asarray(im).astype(np.float32)/255
lab = color.rgb2lab(a); L = ndi.gaussian_filter(lab[..., 0], 1.0)
ch = ndi.gaussian_filter(np.hypot(lab[..., 1], lab[..., 2]-3), 1.0)
at = lambda img, P: ndi.map_coordinates(img, [P[..., 1], P[..., 0]], order=1, mode='nearest')
stars = json.load(open(outd+'/stars.json'))
UPOK = lambda m: True
def snap(P, R=40, passes=2, upin=0):
    P = np.array(P)
    for _ in range(passes):
        n = len(P); lines = []
        c = P.mean(0)
        for i in range(n):
            p0, p1 = P[i], P[(i+1) % n]; d = p1-p0; Lg = np.linalg.norm(d); d = d/Lg
            nn = np.array([d[1], -d[0]])
            if np.dot((p0+p1)/2 - c, nn) < 0: nn = -nn
            t = np.linspace(0.15, 0.85, max(8, int(Lg*0.7/3)))
            base = p0[None] + (t[:, None]*Lg)*d[None]
            offs = np.arange(-R, R+1)
            useup = upin and nn[1] < -0.3 and UPOK((p0+p1)/2)
            if useup: offs = np.arange(-upin, 5)
            scores = {}
            best, bo = -1e9, 0
            RR = max(R, upin)
            prof = np.array([at(L, base + o*nn) for o in range(-RR-8, RR+9)])      # (2R+17, m)
            chp = np.array([at(ch, base + o*nn) for o in range(-RR-8, RR+9)])
            for o in offs:
                k = o + RR + 8
                inside = prof[k-7:k-1].mean(0); outside = prof[k+2:k+8].mean(0)
                neutral = np.exp(-np.maximum(chp[k+1:k+6].mean(0) - 8, 0)/5)
                drop = np.median((inside - outside) * neutral)
                sc = drop - 0.02*abs(o)
                scores[o] = sc
                if sc > best: best, bo = sc, o
            if useup:
                bo = max(o for o, v in scores.items() if v >= 0.6*best)
            lines.append((p0 + bo*nn, d))
        Q = []
        for i in range(n):
            (a0, d0), (a1, d1) = lines[i-1], lines[i]
            A = np.array([d0, -d1]).T
            s = np.linalg.solve(A, a1 - a0)
            Q.append(a0 + s[0]*d0)
        P = np.array(Q)
    return P
out = []
for k, s in enumerate(stars):
    P = snap(s['poly'])
    print(k, 'moved', np.round(np.abs(P - np.array(s['poly'])).max(), 1))
    out.append(dict(poly=P.tolist()))
json.dump(out, open(outd+'/stars-snapped.json', 'w'))
ov = im.copy(); d = ImageDraw.Draw(ov)
for s in out: d.line([tuple(x) for x in s['poly']]+[tuple(s['poly'][0])], fill=(255, 0, 60), width=2)
ov.save(outd+'/snap-overlay.jpg', quality=92)
