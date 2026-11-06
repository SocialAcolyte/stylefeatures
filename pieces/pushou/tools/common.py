"""Paths and the measured geometry shared by the stages. Coordinates are px in the Freer photograph FS-7729_16
(4200 x 3150): F1917.18, mask and ring handle, Warring States, bronze with gold and silver inlay, 7.7 x 5.4 x 2.2 cm."""
import os
from pathlib import Path
import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
ASSETS = HERE.parent / 'assets'
# Outside this folder: the photograph, the work files and the engine (for its BiRefNet worker). By default they are
# the repo's engine job folders; PO_SRC, PO_WORK and PO_ENGINE put them anywhere else. Nothing is created on import:
# the stages that write make their own folders.
REPO = HERE.parents[2]
JOB = REPO / 'tools' / 'engine' / 'jobs'
SRC_DIR = Path(os.environ.get('PO_SRC', JOB / 'pushou-src'))
WORK_DIR = Path(os.environ.get('PO_WORK', JOB / 'pushou-work'))
ENGINE = Path(os.environ.get('PO_ENGINE', REPO / 'tools' / 'engine'))
SRC = SRC_DIR / 'fsg-F1917.18.jpg'                       # the museum's photograph, untouched
FINE = WORK_DIR / 'cut' / 'fine.png'                     # full-resolution matte (matte_fine.py)
WORK = WORK_DIR / 'parts'

# the ring, fitted to its free edges (ring_fit.py, band_edge.py): centre and radii in source px
CX, CY = 2135.6, 1966.0
RO, RI = 742.6, 560.1
# the band's outer edge where it crosses the mask, traced at 3x: on the left it runs on the fitted circle; on the
# right it rides higher, along the top of the gold ribbon (source px, left to right)
RIGHT_EDGE = [(2194, 1230), (2220, 1226), (2260, 1225), (2300, 1229), (2340, 1238), (2380, 1248), (2420, 1260),
              (2460, 1273), (2500, 1287), (2540, 1302), (2580, 1318), (2610, 1330), (2640, 1344), (2670, 1360)]
# the band's inner edge beside the nose loop, where the mask's jaw shows through the ring's hole
R_INNER_TOP = 568.0
# the nose loop (front occluder): its outline at 3x, source px, clockwise from top left
# (cut straight across at y 1445, below the band's inner rim: the loop's foot belongs to the plate alone)
LOOP = [(2003, 1150), (2193, 1150), (2193, 1300), (2192, 1380), (2185, 1420), (2180, 1445), (2010, 1445),
        (2005, 1400), (2003, 1300)]
# the hinge: the ring hangs on the bar of the loop, just under the band's inner top edge
HINGE_Y = 1410.0
CM = 7.7 / 2390        # cm per source px (the handle is 7.7 cm tall, about 2390 px)


def load_rgb(p):
    return np.asarray(Image.open(p).convert('RGB'), np.float32) / 255


def load_rgba(p):
    return np.asarray(Image.open(p).convert('RGBA'), np.float32) / 255


def save(p, a):
    a = np.clip(a, 0, 1)
    mode = {2: 'L', 3: 'RGB'}.get(a.ndim, 'RGB') if a.ndim == 2 or a.shape[-1] == 3 else 'RGBA'
    if a.ndim == 2:
        mode = 'L'
    Image.fromarray((a * 255 + .5).astype(np.uint8), mode).save(p)
