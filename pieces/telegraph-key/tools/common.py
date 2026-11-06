"""Shared paths and helpers for the offline cut of the Morse–Vail key (run with ./run.sh <stage>.py)."""
import json, os
import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
HERE = os.path.dirname(os.path.abspath(__file__))
# where the source photographs are, and where the stages write. Both default to the factory's jobs folder; set TK_SRC
# and TK_WORK to run the cut from a copy of this folder anywhere else. Nothing is created until a stage writes.
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
SRC = os.environ.get('TK_SRC', os.path.join(ROOT, 'tools', 'engine', 'jobs', 'telegraph-src'))
WORK = os.environ.get('TK_WORK', os.path.join(ROOT, 'tools', 'engine', 'jobs', 'telegraph-cut'))
ASSETS = os.environ.get('TK_ASSETS', os.path.join(HERE, '..', 'assets'))
MAIN = os.path.join(SRC, 'NMAH-JN2014-3911-hires.jpg')   # 7428 x 4872, the master


def work_dir():
    """the stages that write call this first"""
    os.makedirs(WORK, exist_ok=True)
    return WORK

# the key's box on the master (x0, y0, x1, y1), with a margin of white; work images are this box at WS
BOX = (500, 880, 6812, 4020)
WS = 0.5
PX_PER_MM = 36.9   # master px per mm in the key's mid-plane (anvil to back post, against the scan)


def load(path, mode='RGB'):
    return np.asarray(Image.open(path).convert(mode)).astype(np.float32) / 255


def save(path, a, **kw):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    a = np.clip(a, 0, 1)
    mode = {2: 'L', 3: 'RGB', 4: 'RGBA'}[a.shape[2] if a.ndim == 3 else 2]
    Image.fromarray((a * 255 + 0.5).astype(np.uint8), mode).save(path, **kw)


def m2w(p):
    """master px -> work px"""
    return ((p[0] - BOX[0]) * WS, (p[1] - BOX[1]) * WS)


def w2m(p):
    return (p[0] / WS + BOX[0], p[1] / WS + BOX[1])


def jload(name):
    return json.load(open(os.path.join(WORK, name)))


def jsave(name, d):
    json.dump(d, open(os.path.join(work_dir(), name), 'w'), indent=1)
