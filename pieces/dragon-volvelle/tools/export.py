"""Stage 3: write the runtime assets.

  assets/plate.webp   the instrument (mater, disc, crest and hanger) cut off its page by distance from the paper's
                      own colour, 1600 px wide, alpha = its printed outline. This is the <img>: at rest it IS the plate.
  assets/ring.webp    the restored mater in the annulus the turning disc can uncover (its irregular cut edge, the two
                      tabs and their cast shadows), same scale, transparent elsewhere
  assets/disc.webp    the paper disc with its two tabs and their shadows, colour solved so that
                      ring*(1-a) + disc*a = scan at rest; a square about the pin
  assets/volvelle.json  pin, sizes, the tabs' angles, the zodiac (where 0 deg Aries sits)
"""
import cv2
from scipy import ndimage as ndi
from common import *

OUT_W = 1600
img = load(SRC)
H, W, _ = img.shape
base = load(os.path.join(WORK, 'base.png'))
disc = np.load(os.path.join(WORK, 'disc_rgba.npy')).astype(np.float32)
cut = json.load(open(os.path.join(WORK, 'cut.json')))
g = geo()
cx, cy = cut['pin']
rmax = cut['rmax']

# ---- the instrument's outline: everything that is not the page's bare paper, holes filled ------------------------
lab = cv2.cvtColor((img * 255).astype(np.uint8), cv2.COLOR_RGB2LAB).astype(np.float32)
pap = np.median(lab[1500:4000, 3380:3560].reshape(-1, 3), 0)          # right margin, beside the octagon
d = np.sqrt(((lab - pap) * [1, 1.6, 1.6]) ** 2).sum(-1) ** .5 if False else np.sqrt((((lab - pap) * [1, 1.6, 1.6]) ** 2).sum(-1))
ink = d > 34
roi = np.zeros_like(ink); roi[300:4330, 150:3330] = True          # the instrument, inside the page's margins
ink &= roi
ink = ndi.binary_closing(ink, iterations=3)
ink = ndi.binary_fill_holes(ink)
lab_, n = ndi.label(ink)
k = lab_[int(cy), int(cx)]
mask = lab_ == k
mask = ndi.binary_fill_holes(ndi.binary_closing(mask, iterations=2))
mask = ndi.binary_opening(mask, iterations=2)
mask = ndi.binary_fill_holes(mask)
ys, xs = np.nonzero(mask)
pad = 6
x0, x1, y0, y1 = xs.min() - pad, xs.max() + pad + 1, ys.min() - pad, ys.max() + pad + 1
Image.fromarray((mask[::8, ::8] * 255).astype(np.uint8)).save(os.path.join(WORK, 'mask-small.png'))
print('instrument bbox', x0, y0, x1, y1, 'size', x1 - x0, y1 - y0)
alpha = ndi.gaussian_filter(mask.astype(np.float32), 1.1)
alpha = np.clip((alpha - .5) * 1.8 + .5, 0, 1)

S = OUT_W / (x1 - x0)
OH = int(round((y1 - y0) * S))
rs = lambda a: cv2.resize(a, (OUT_W, OH), interpolation=cv2.INTER_AREA)


def premult_resize(rgb, a, box, size):
    bx0, by0, bx1, by1 = box
    pm = np.dstack([rgb[by0:by1, bx0:bx1] * a[by0:by1, bx0:bx1, None], a[by0:by1, bx0:bx1]])
    pm = cv2.resize(pm, size, interpolation=cv2.INTER_AREA)
    al = pm[..., 3]
    col = pm[..., :3] / np.maximum(al[..., None], 1e-4)
    return np.dstack([np.clip(col, 0, 1), al])


def save_rgba(p, a, q):
    a8 = np.clip(a * 255 + .5, 0, 255).astype(np.uint8)
    Image.fromarray(a8, 'RGBA').save(p, quality=q, method=6, alpha_quality=100)


plate = premult_resize(img, alpha, (x0, y0, x1, y1), (OUT_W, OH))
save_rgba(os.path.join(ASSETS, 'plate.webp'), plate, 86)

# ---- the square about the pin (master px), and what goes in it ---------------------------------------------------
R = int(np.ceil(rmax)) + 2
sx0, sy0 = int(np.floor(cx)) - R, int(np.floor(cy)) - R
side = 2 * R
SQ = int(round(side * S))
box = (sx0, sy0, sx0 + side, sy0 + side)
yy, xx = np.mgrid[sy0:sy0 + side, sx0:sx0 + side].astype(np.float32)
rr = np.hypot(xx - cx, yy - cy)
ring_a = np.zeros((H, W), np.float32)
ring_a[sy0:sy0 + side, sx0:sx0 + side] = np.clip(rr - 1288, 0, 1) * np.clip(rmax + 1 - rr, 0, 1)
ring = premult_resize(base, ring_a, box, (SQ, SQ))
save_rgba(os.path.join(ASSETS, 'ring.webp'), ring, 92)

dsc = premult_resize(disc[..., :3], disc[..., 3], box, (SQ, SQ))
save_rgba(os.path.join(ASSETS, 'disc.webp'), dsc, 92)

# ---- where 0 degrees Aries sits on the mater (screen angle, y down): from the mater's sign boundaries ---------------
# The signs run counter-clockwise on the page (Aries at the right, Taurus above it). The boundary Pisces|Aries is
# measured by hand on the scan as the cell rule at the start of ARIES.
info = dict(
    source='Petrus Apianus, Astronomicum Caesareum (Ingolstadt 1540), the first dragon volvelle; National Library of Poland',
    plate=dict(w=OUT_W, h=OH, scale=S, crop=[int(x0), int(y0), int(x1), int(y1)]),
    pin=[round((cx - x0) * S, 2), round((cy - y0) * S, 2)],
    square=dict(x=round((sx0 - x0) * S, 2), y=round((sy0 - y0) * S, 2), size=SQ, master=side),
    r_disc=round(float(np.median(g['edge']['r'])) * S, 2),
    r_ring_inner=round(1288 * S, 2), r_max=round(rmax * S, 2),
    tabs={k: dict(angle=round(v['angle'], 2), r_tip=round(v['r_tip'] * S, 2)) for k, v in cut['tabs'].items()},
)
json.dump(info, open(os.path.join(ASSETS, 'volvelle.json'), 'w'), indent=1)
print(json.dumps(info, indent=1))
for f in ('plate.webp', 'ring.webp', 'disc.webp'):
    print(f, os.path.getsize(os.path.join(ASSETS, f)) // 1024, 'KB')
