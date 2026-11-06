# /// script
# dependencies = ["pillow", "numpy", "scipy"]
# ///
"""Full-resolution matte of a dark object on a white studio sweep.

BiRefNet's alpha (made at 1024 px and upsampled) decides what is object; the edge is then solved again at full
resolution, in a band around BiRefNet's edge only:
  B  the sweep just outside the edge: a Gaussian-weighted mean of clear sweep pixels nearby (normalised
     convolution), so it carries the object's own soft shadow where there is one;
  F  the object's colour just inside the edge, the same way from solid interior pixels;
  alpha = the projection of C - B on F - B;
  colour = unmixed from the sweep, F' = (C - (1 - alpha) B) / alpha, falling back to F where alpha is small.
Nothing inside the object is touched.

usage: uv run matte_fine.py SRC RAW_ALPHA.png OUT.png [--band 8]
"""
import argparse
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ap = argparse.ArgumentParser()
ap.add_argument('src'); ap.add_argument('raw'); ap.add_argument('out')
ap.add_argument('--band', type=int, default=8)
a = ap.parse_args()

C0 = np.asarray(Image.open(a.src).convert('RGB'), np.float32) / 255
A0 = np.asarray(Image.open(a.raw).getchannel('A'), np.float32) / 255
H, W = A0.shape
ys, xs = np.where(A0 > 0.02)
pad = 60
y0, y1, x0, x1 = max(0, ys.min() - pad), min(H, ys.max() + pad), max(0, xs.min() - pad), min(W, xs.max() + pad)
C = C0[y0:y1, x0:x1]
A = A0[y0:y1, x0:x1]
obj = A > 0.5
edge = obj ^ ndi.binary_erosion(obj)
dist = ndi.distance_transform_edt(~edge)
band = dist <= a.band

clear = (A < 0.01) & (dist >= 3)
solid = (A > 0.99) & (dist >= 3)


def nconv(img, mask, sigma):
    m = mask.astype(np.float32)
    den = ndi.gaussian_filter(m, sigma)
    out = np.stack([ndi.gaussian_filter(img[..., c] * m, sigma) for c in range(3)], -1)
    return out / np.maximum(den, 1e-6)[..., None], den


B, dB = nconv(C, clear, 5)
B2, _ = nconv(C, clear, 20)
wB = np.clip(dB / 0.05, 0, 1)[..., None]
B = B * wB + B2 * (1 - wB)
F, dF = nconv(C, solid, 4)
F2, _ = nconv(C, solid, 16)
wF = np.clip(dF / 0.05, 0, 1)[..., None]
F = F * wF + F2 * (1 - wF)

d = F - B
proj = ((C - B) * d).sum(2) / np.maximum((d * d).sum(2), 1e-4)
alpha = np.where(band, np.clip(proj, 0, 1), obj.astype(np.float32))
lab, n = ndi.label(alpha > 0.05)
if n > 1:
    keep = np.isin(lab, np.unique(lab[solid]))
    alpha = alpha * keep
alpha = np.clip(ndi.gaussian_filter(alpha, 0.45), 0, 1)

al = alpha[..., None]
unmixed = np.clip((C - (1 - al) * B) / np.maximum(al, 1e-3), 0, 1)
w = np.clip((alpha - 0.2) / 0.5, 0, 1)[..., None]
col = np.where(band[..., None], unmixed * w + F * (1 - w), C)

out = np.zeros((H, W, 4), np.float32)
out[y0:y1, x0:x1, :3] = col
out[y0:y1, x0:x1, 3] = alpha
Image.fromarray((out * 255 + .5).astype(np.uint8), 'RGBA').save(a.out)
print(a.out, 'crop', (x0, y0, x1, y1), 'band px', int(band.sum()), 'alpha>0.5', int((alpha > 0.5).sum()))
