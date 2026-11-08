# fit each kept region with its ideal shape (IoU) and clip the region to that shape + a margin
import sys, json, numpy as np
from PIL import Image
from scipy import ndimage as ndi, optimize
from skimage import morphology
from skimage.draw import polygon as rpoly
outd = sys.argv[1]; src = sys.argv[2]
lab = np.load(outd+'/labels.npy'); fg = np.asarray(Image.open(outd+'/fg.png')) > 127
H, W = lab.shape; Q = 4
labq = lab[::Q, ::Q]
U = []
for k in range(8):
    a = np.deg2rad(-90+45*k); U.append((np.cos(a), np.sin(a)))
    b = a+np.deg2rad(22.5); U.append((0.7654*np.cos(b), 0.7654*np.sin(b)))
U = np.array(U)
def star(p):
    cx, cy, r, sx, sh, th = p
    A = np.array([[np.cos(th), -np.sin(th)], [np.sin(th), np.cos(th)]]) @ np.array([[r*sx, r*sh], [0, r/sx]])
    return U @ A.T + [cx, cy]
def cross(p):
    cx, cy, w, b, sx, th = p; P = []
    for k in range(4):
        R = np.array([[np.cos(k*np.pi/2), -np.sin(k*np.pi/2)], [np.sin(k*np.pi/2), np.cos(k*np.pi/2)]])
        for q in [(w, -w), (b, -w), (b+w, 0), (b, w)]: P.append(R @ np.array(q))
    A = np.array([[np.cos(th), -np.sin(th)], [np.sin(th), np.cos(th)]]) @ np.diag([sx, 1/sx])
    return np.array(P) @ A.T + [cx, cy]
def raster(P, shape, scale=1):
    m = np.zeros(shape, bool); rr, cc = rpoly(P[:, 1]/scale, P[:, 0]/scale, shape); m[rr, cc] = True; return m
out = {}; final = np.zeros_like(lab)
for k in range(1, 10):
    reg = labq == k; ys, xs = np.nonzero(reg); cx, cy = xs.mean()*Q, ys.mean()*Q
    if k <= 5: f, p0, st = star, np.array([cx, cy, 355, 1, 0, 0.]), [12, 12, 10, .02, .02, .02]
    else:      f, p0, st = cross, np.array([cx, cy, 110, 280, 1, 0.]), [12, 12, 8, 12, .02, .02]
    def cost(p):
        m = raster(f(p), reg.shape, Q); i = (m & reg).sum(); u = (m | reg).sum()
        return -i/u
    simp = [p0]+[p0+d for d in np.diag(st)]
    o = optimize.minimize(cost, p0, method='Nelder-Mead', options=dict(maxiter=2500, xatol=.05, fatol=1e-6, initial_simplex=np.array(simp)))
    P = f(o.x); out[k] = dict(p=list(map(float, o.x)), poly=P.tolist(), iou=-o.fun)
    print(k, np.round(o.x, 2), 'IoU %.3f' % -o.fun, flush=True)
    m = raster(P, (H, W))
    region = lab == k
    keep = (region | (m & fg)) & morphology.dilation(m, morphology.disk(4))
    keep = ndi.binary_fill_holes(morphology.opening(keep, morphology.disk(8 if k <= 5 else 3)))
    final[keep & (final == 0)] = k
np.save(outd+'/labels-clipped.npy', final)
json.dump(out, open(outd+'/shapes.json', 'w'))
