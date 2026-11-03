"""Shared helpers for the elephant-clock cutting pipeline (offline; not needed at runtime).

Run a stage with ./run.sh <stage>.py (uv provides Pillow, NumPy, SciPy, scikit-image, OpenCV-contrib).
Stages, in order: sheet.py, cutparts.py, clean.py, export.py.
Sources are the Met Open Access photographs (CC0), downloaded to SRC (see credits.json for the URLs).
"""
import os
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

SRC = os.environ.get('EC_SRC', os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'tools', 'engine', 'jobs', 'elephant-clock-src'))
WORK = os.environ.get('EC_WORK', os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'tools', 'engine', 'jobs', 'elephant-clock-work'))
HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, '..', 'assets')
os.makedirs(WORK, exist_ok=True)

MAIN = os.path.join(SRC, '451402', 'DP234075.jpg')          # The Elephant Clock, 2522 x 3596


def load(path):
    return np.asarray(Image.open(path).convert('RGB')).astype(np.float32) / 255.0


def save(path, arr, quality=None):
    a = np.clip(arr, 0, 1)
    mode = 'RGBA' if a.ndim == 3 and a.shape[2] == 4 else ('RGB' if a.ndim == 3 else 'L')
    im = Image.fromarray((a * 255 + .5).astype(np.uint8), mode)
    if path.endswith('.webp'):
        im.save(path, quality=quality or 90, method=6, exact=True)
    elif path.endswith('.jpg'):
        im.convert('RGB').save(path, quality=quality or 90)
    else:
        im.save(path)


def lum(rgb):
    return rgb @ np.array([.2126, .7152, .0722], np.float32)


def chroma(rgb):
    return rgb.max(2) - rgb.min(2)


def poly_mask(shape, pts):
    """Filled polygon (list of (x, y) in image px) as a bool mask."""
    import cv2
    m = np.zeros(shape[:2], np.uint8)
    cv2.fillPoly(m, [np.round(np.array(pts, np.float32)).astype(np.int32)], 1)
    return m.astype(bool)


def line_mask(shape, pts, width):
    import cv2
    m = np.zeros(shape[:2], np.uint8)
    cv2.polylines(m, [np.round(np.array(pts, np.float32)).astype(np.int32)], False, 1, int(width))
    return m.astype(bool)


def disc(shape, c, r):
    yy, xx = np.ogrid[:shape[0], :shape[1]]
    return (xx - c[0]) ** 2 + (yy - c[1]) ** 2 <= r * r


def bbox(mask, pad=0):
    ys, xs = np.nonzero(mask)
    return (max(0, xs.min() - pad), max(0, ys.min() - pad), min(mask.shape[1], xs.max() + 1 + pad),
            min(mask.shape[0], ys.max() + 1 + pad))
