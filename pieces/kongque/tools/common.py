"""Shared paths and helpers for the kongque pipeline (lifted from badbezan/tools/common.py, after dragon-volvelle).

Source: Kunstnerviften (the Artists' Fan), Kristiania (Oslo), 1898. A brisé fan of eighteen painted wooden sticks,
each painted by a different Norwegian artist, with a peacock painted across the gorge. Nasjonalmuseet for kunst,
arkitektur og design, NG.M.04483, the museum's photograph via Wikimedia Commons, public domain (10661 x 5931).
The cut works on it at half size: tools/engine/jobs/fan-peacock2-src/kv-5330.png.
"""
import json, os, numpy as np
from PIL import Image
from scipy.ndimage import map_coordinates

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
SRC = os.path.join(REPO, 'tools/engine/jobs/fan-peacock2-src/kv-5330.png')
WORK = os.path.join(REPO, 'tools/engine/jobs/fan-peacock2-work')
ASSETS = os.path.abspath(os.path.join(HERE, '..', 'assets'))
os.makedirs(WORK, exist_ok=True)


def load(p):
    return np.asarray(Image.open(p).convert('RGB')).astype(np.float32) / 255


def save(p, a, **kw):
    a = np.clip(a * 255 + .5, 0, 255).astype(np.uint8)
    Image.fromarray(a).save(p, **kw)


def geo():
    return json.load(open(os.path.join(WORK, 'geometry.json')))


def polar(img, cx, cy, radii, angles, order=1):
    """sample img (H,W[,C]) on a (len(radii), len(angles)) polar grid; angles in radians, image coords (y down)"""
    rr, aa = np.meshgrid(radii, angles, indexing='ij')
    X, Y = cx + rr * np.cos(aa), cy + rr * np.sin(aa)
    if img.ndim == 2:
        return map_coordinates(img, [Y, X], order=order, mode='nearest')
    return np.stack([map_coordinates(img[..., c], [Y, X], order=order, mode='nearest') for c in range(img.shape[2])], -1)


def fit_circle(x, y, iters=6):
    ok = np.ones(len(x), bool)
    for _ in range(iters):
        M = np.c_[2 * x[ok], 2 * y[ok], np.ones(ok.sum())]
        s = np.linalg.lstsq(M, x[ok] ** 2 + y[ok] ** 2, rcond=None)[0]
        cx, cy = s[0], s[1]
        r = np.sqrt(s[2] + cx * cx + cy * cy)
        res = np.hypot(x - cx, y - cy) - r
        ok = np.abs(res) < max(1.5, 2.5 * np.median(np.abs(res[ok])))
    return cx, cy, r, res, ok
