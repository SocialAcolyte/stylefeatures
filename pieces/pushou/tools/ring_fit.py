# /// script
# dependencies = ["pillow", "numpy", "scipy", "opencv-python-headless"]
# ///
"""Fit ellipses to the ring's outer and inner edges where they are free (against the sweep), from the matte.

usage: uv run ring_fit.py FINE.png OUT.json PREVIEW.jpg SRC.jpg
(the ring centre used in common.py is the mean of the two ellipse centres; the radii are their mean semi-axes)
"""
import json, sys
import numpy as np
import cv2
from PIL import Image
from scipy import ndimage as ndi

fine, out, prev = sys.argv[1:4]
im = np.asarray(Image.open(fine))
A = im[..., 3].astype(np.float32) / 255
obj = (A > 0.5).astype(np.uint8)
H, W = obj.shape
# the ring's hole: the largest background component not touching the image border
bg = (obj == 0)
lab, n = ndi.label(bg)
border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])))
sizes = ndi.sum(bg, lab, range(1, n + 1))
cands = [(s, i + 1) for i, s in enumerate(sizes) if (i + 1) not in border]
hole = lab == max(cands)[1]
cs, _ = cv2.findContours(hole.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
inner = max(cs, key=len)[:, 0, :].astype(np.float64)
cs, _ = cv2.findContours(obj, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
outer = max(cs, key=len)[:, 0, :].astype(np.float64)

# first pass: a circle through the inner contour's lower 3/4 (it is free there)
cy0 = inner[:, 1].mean()
inner_free = inner[inner[:, 1] > inner[:, 1].min() + 0.22 * (inner[:, 1].max() - inner[:, 1].min())]
ei = cv2.fitEllipse(inner_free.astype(np.float32))
(icx, icy), (iw, ih), iang = ei
# outer free: object boundary points below the mask, i.e. farther than the inner radius from the inner centre and below
r = np.hypot(outer[:, 0] - icx, outer[:, 1] - icy)
outer_free = outer[(outer[:, 1] > icy - 0.15 * ih) & (r > 0.5 * max(iw, ih))]
eo = cv2.fitEllipse(outer_free.astype(np.float32))
(ocx, ocy), (ow, oh), oang = eo


def resid(pts, e):
    (cx, cy), (w, h), ang = e
    t = np.deg2rad(ang)
    x, y = pts[:, 0] - cx, pts[:, 1] - cy
    xr = x * np.cos(t) + y * np.sin(t)
    yr = -x * np.sin(t) + y * np.cos(t)
    rr = np.hypot(xr / (w / 2), yr / (h / 2))
    return (rr - 1) * (w + h) / 4


ri, ro = resid(inner_free, ei), resid(outer_free, eo)
res = dict(inner=dict(cx=icx, cy=icy, w=iw, h=ih, ang=iang, rms=float(np.sqrt((ri ** 2).mean())), max=float(np.abs(ri).max())),
           outer=dict(cx=ocx, cy=ocy, w=ow, h=oh, ang=oang, rms=float(np.sqrt((ro ** 2).mean())), max=float(np.abs(ro).max())),
           inner_top=float(inner[:, 1].min()), n_inner=len(inner_free), n_outer=len(outer_free))
json.dump(res, open(out, 'w'), indent=1)
print(json.dumps(res, indent=1))
# preview of the overlap region with both ellipses
rgb = np.ascontiguousarray(np.asarray(Image.open(sys.argv[4] if len(sys.argv) > 4 else 'pushou-src/fsg-F1917.18.jpg').convert('RGB')))
vis = rgb.copy()
cv2.ellipse(vis, ((icx, icy), (iw, ih), iang), (0, 255, 255), 2)
cv2.ellipse(vis, ((ocx, ocy), (ow, oh), oang), (255, 0, 255), 2)
crop = vis[1050:1650, 1300:2900]
Image.fromarray(crop).save(prev, quality=92)
full = Image.fromarray(vis[283:2779, 1205:2979]).resize((887, 1248), Image.LANCZOS)
full.save(prev.replace('.jpg', '-full.jpg'), quality=90)
