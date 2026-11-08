# fit each star's outer edge: polygon edges should run along neutral dark joint lines or the tile/wall transition
import sys, json, numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi, optimize
from skimage import color, filters
src, outd = sys.argv[1], sys.argv[2]
S = 0.5
im = Image.open(src).convert('RGB'); W0, H0 = im.size
ims = np.asarray(im.resize((int(W0*S), int(H0*S)), Image.LANCZOS)).astype(np.float32)/255
fg = np.asarray(Image.open(outd+'/fg.png').resize(ims.shape[1::-1], Image.NEAREST)) > 127
lab = color.rgb2lab(ims); L = lab[..., 0]; ch = np.hypot(lab[..., 1], lab[..., 2] - 4)
J = filters.sato(L, sigmas=[0.8, 1.3, 2.0], black_ridges=True) * np.exp(-np.maximum(ch - 6, 0) / 6)
J = J / np.percentile(J[fg], 99.5); J = np.clip(J, 0, 1)
J = ndi.maximum_filter(J, 3)
np.save(outd + '/J.npy', J.astype(np.float16))
Image.fromarray((J*255).astype(np.uint8)).save(outd+'/J.png')
H, W = fg.shape
fgf = fg.astype(np.float32)
U = []
for k in range(8):
    a = np.deg2rad(-90 + 45*k); U.append((np.cos(a), np.sin(a)))
    b = a + np.deg2rad(22.5); U.append((0.7654*np.cos(b), 0.7654*np.sin(b)))
U = np.array(U)
def poly(p):
    cx, cy, r, sx, sh, th = p
    A = np.array([[np.cos(th), -np.sin(th)], [np.sin(th), np.cos(th)]]) @ np.array([[r*sx, r*sh], [0, r/sx]])
    return U @ A.T + [cx, cy]
def samples(P, n=30):
    pts, nrm = [], []
    for i in range(len(P)):
        a, b = P[i], P[(i+1) % len(P)]
        t = (np.arange(n) + 0.5)[:, None] / n
        t = t[(t[:, 0] > 0.12) & (t[:, 0] < 0.88)]   # skip the corners
        d = b - a; nn = np.array([d[1], -d[0]]) / np.linalg.norm(d)
        pts.append(a + d*t); nrm.append(np.repeat(nn[None], len(t), 0))
    return np.concatenate(pts), np.concatenate(nrm)
def at(img, P):
    return ndi.map_coordinates(img, [P[:, 1], P[:, 0]], order=1, mode='nearest')
def cost(p, r0):
    P = poly(p)
    B, N = samples(P)
    # orientation: make normals point outward
    c = P.mean(0)
    s = np.sign(((B - c) * N).sum(1))[:, None]; N = N * s
    j = at(J, B)
    wall = at(fgf, B - 3*N) * (1 - at(fgf, B + 3*N))
    e = np.maximum(j, wall)
    reg = 40*(p[3]-1)**2 + 40*p[4]**2 + 2*((p[2]-r0)/r0)**2
    return -e.mean() + reg
cents = json.loads(sys.argv[3]); res = []
for (cx, cy, r) in cents:
    r0 = r*S; best = None
    for dx in (-8, 0, 8):
        for dy in (-8, 0, 8):
            p0 = np.array([cx*S+dx, cy*S+dy, r0, 1.0, 0.0, 0.0])
            simp = [p0] + [p0 + d for d in np.diag([4, 4, 4, 0.015, 0.015, 0.015])]
            o = optimize.minimize(cost, p0, args=(r0,), method='Nelder-Mead', options=dict(maxiter=3000, xatol=0.02, fatol=1e-6, initial_simplex=np.array(simp)))
            if best is None or o.fun < best.fun: best = o
    p = best.x; P = poly(p)/S
    res.append(dict(p=list(map(float, p)), poly=P.tolist(), cost=float(best.fun)))
    print('star', cx, cy, '->', np.round(p[:3]/S, 1), np.round(p[3:], 4), round(best.fun, 4), flush=True)
json.dump(res, open(outd+'/stars.json', 'w'))
ov = im.copy(); d = ImageDraw.Draw(ov)
for s in res: d.line([tuple(x) for x in s['poly']] + [tuple(s['poly'][0])], fill=(255, 0, 60), width=2)
ov.save(outd+'/stars-overlay.jpg', quality=92)
ov.resize((2000, int(2000*H0/W0))).save(outd+'/stars-overlay-small.jpg', quality=85)
