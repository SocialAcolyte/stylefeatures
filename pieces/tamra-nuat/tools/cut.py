# /// script
# dependencies = ["numpy", "pillow", "scipy"]
# ///
"""Cut MS Thai 801 (Wellcome Collection, Tamra nuat) into its own panels, measure them, and write the runtime's assets.

The Wellcome photographed the book open, four panels to a frame, two new panels a frame (each panel is in two frames).
Side B (frames 41-79) starts at the cover: frame 41 is the cover with B1-B2 under it, frame 42 is B1-B4, frame c is
B(2c-83)..B(2c-80). Side A (frames 2-39) is the same: frame c is A(2c-3)..A(2c).

usage: uv run cut.py <raw-dir (fetch.py, 2400 px)> <assets-dir>

What it measures, and where it goes (assets/tamra-nuat.json):
  - the paper's edges and the three creases in every frame (the row where the fold's own line is darkest);
  - each panel used (the six openings below, then side B's blank panels) cut about the middle of its creases to one
    common height, scaled so the paper is one common width (frames differ by about 2%), with the black ground made
    transparent: p/aNN.webp, p/bNN.webp (1240 px) and -s.webp (680 px);
  - the panel's free space: ink (black and red lines, labels, the scribe's dots), paint, stains and tears found against the
    paper's own local tone, grown by a margin, then stored as free runs per grid row (120 columns);
  - the crease profile: how dark, and how wide, the fold's line is in the photographs, averaged over the run;
  - the ink colour of the drawings (the median of the black line work), for the writing;
  - the scale (px/cm) from the Wellcome's own rule photographed on the cover (frame 86);
  - the covers: the front board as photographed above B1 (frame 41), the back board (frame 80), both cut from the black;
  - the stack's long edge (frame 82): every fold of the book, one line each, for the closed book under the back board.
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi

RAW, OUT = sys.argv[1], sys.argv[2]
os.makedirs(os.path.join(OUT, 'p'), exist_ok=True)
# The six openings the demo's sections land on, in the book's order, each a drawn figure with the free paper round it
# (side A: the great sen figure's legs and diagram with its feet and a blank panel; a seated front figure; the red-lined
# figure; the painted yellow figure; the red back figure. Side B: the back figure and the blank panel after it).
# Then side B's blank panels, for any further sections.
OPENINGS = [[('A', 5), ('A', 8)], [('A', 47), ('A', 48)], [('A', 65), ('A', 66)], [('A', 67), ('A', 70)],
            [('A', 75), ('A', 76)], [('B', 5), ('B', 8)]]
BLANKS = [('B', k) for k in range(9, 45)]
PANELS = [(sd, k) for (sd, a), (_, b) in OPENINGS for k in range(a, b + 1)] + BLANKS
WN = 2300                               # common paper width, px, at the 2400 px frames' scale
GRIDW = 120
HC = 744                                # the common panel height, px at WN: the median crease-to-crease height


def load(n):
    return Image.open(os.path.join(RAW, f'{n:04d}.jpg')).convert('RGB')


def lum(a):
    return a[..., 0] * .299 + a[..., 1] * .587 + a[..., 2] * .114


def paper_box(L):
    m = L > 55
    cols = np.where(m.mean(0) > .5)[0]; rows = np.where(m.mean(1) > .5)[0]
    return int(cols[0]), int(rows[0]), int(cols[-1]), int(rows[-1])


def creases(L, box, n=4):
    x0, y0, x1, y1 = box
    band = L[y0:y1, x0 + (x1 - x0) // 10: x1 - (x1 - x0) // 10]
    prof = np.median(band, axis=1)
    sm = ndi.uniform_filter1d(prof, 41)
    dip = sm - prof
    ph = (y1 - y0) / n
    # The middle crease is a valley in these frames: the fold's dark line, strong. The outer two are mountains: a thin
    # pale seam, and the paper's edge steps where two panels meet. Those are found by the seam's ridge plus the step.
    rm = band.mean(1)
    hp = rm - ndi.uniform_filter1d(rm, 25)
    mm = L[y0:y1] > 55
    le = np.array([np.argmax(r) for r in mm], float); re = np.array([len(r) - np.argmax(r[::-1]) for r in mm], float)
    ej = np.r_[np.abs(np.diff(ndi.median_filter(le, 5))) + np.abs(np.diff(ndi.median_filter(re, 5))), 0]
    out = []
    for i in range(1, n):
        c = int(i * ph); a, b = int(c - .12 * ph), int(c + .12 * ph)
        if i == 2:
            out.append(int(a + np.argmax(dip[a:b]) + y0))
        else:
            s = np.abs(hp[a:b]) / (np.abs(hp).std() + 1e-6) + ndi.maximum_filter1d(ej[a:b], 5) / 3
            out.append(int(a + np.argmax(s) + y0))
    return out, prof, y0


def frame_for(side, k):
    """the frame where a panel lies in one of the two middle rows (least bent by the frame's edge).
    Side A: frame c holds A(2c-3)..A(2c). Side B: frame c holds B(2c-83)..B(2c-80)."""
    r = 2 if k % 2 else 1
    if side == 'A': return (k + 3 - r) // 2, r
    if k == 1: return 42, 0
    return (k + 83 - r) // 2, r


def alpha_from(L):
    a = np.clip((L - 32) / 30, 0, 1)
    return (np.clip(a, 0, 1) * 255).astype(np.uint8)


def free_runs(rgb):
    """free space: no ink, no stain, no tear, a margin round each."""
    a = rgb.astype(float); L = lum(a)
    h, w = L.shape
    bg = ndi.median_filter(L[::4, ::4], size=31)
    bg = np.asarray(Image.fromarray(bg.astype(np.float32)).resize((w, h), Image.BILINEAR))
    Ls = ndi.uniform_filter(L, 3)
    ink = Ls < bg - 31                              # a pen line, even a faint one: darker than the paper round it
    red = (a[..., 0] - a[..., 1] > 42) & (a[..., 0] - a[..., 2] > 52)
    stain = ndi.uniform_filter(L, 41) < bg - 16     # a stain or foxing: broad, and clearly darker
    dark = L < 70                                   # tears, the ground through a hole
    chroma = a.max(-1) - a.min(-1)                  # paint (the yellow figure's wash) against the paper's own colour
    cbg = ndi.median_filter(chroma[::4, ::4], size=31)
    cbg = np.asarray(Image.fromarray(cbg.astype(np.float32)).resize((w, h), Image.BILINEAR))
    paint = ndi.uniform_filter(chroma, 9) > cbg + 28
    m = ink | red | stain | dark | paint
    lab, n = ndi.label(m)                           # paper specks are not ink: a scribe writes past specks: drop marks under ~30 mm² (pricks, ticks)
    if n:
        size = ndi.sum(m, lab, range(1, n + 1))
        keep = np.r_[False, size >= 1200]
        m = keep[lab]
    grow = int(.015 * w)
    m = ndi.binary_dilation(m, structure=np.ones((3, 3)), iterations=grow)
    gh = max(1, round(GRIDW * h / w))
    cell = Image.fromarray((m * 255).astype(np.uint8)).resize((GRIDW, gh), Image.BOX)
    g = np.asarray(cell) > 8
    # margins: the paper's worn edges and the creases are never written on
    mx = round(.045 * GRIDW); my = round(.13 * gh)
    g[:, :mx] = True; g[:, -mx:] = True; g[:my, :] = True; g[-my:, :] = True
    rows = []
    for r in g:
        runs, x = [], 0
        while x < GRIDW:
            if not r[x]:
                s = x
                while x < GRIDW and not r[x]: x += 1
                if x - s >= 3: runs.append([s, x])
            x += 1
        rows.append(runs)
    ink_frac = float((ink | red).mean())
    return rows, gh, ink_frac


panels, crease_prof, inks = [], [], []
cache = {}
for side, k in PANELS:
    c, r = frame_for(side, k)
    pid = f'{side.lower()}{k:02d}'
    if c not in cache:
        im = load(c); a = np.asarray(im).astype(float); L = lum(a)
        box = paper_box(L); cr, prof, y0 = creases(L, box)
        cache[c] = (im, L, box, cr, prof, y0)
        # crease profile: the median row profile, ±30 px round each crease, relative to the paper around it
        for y in cr:
            seg = prof[y - y0 - 30: y - y0 + 31]
            if len(seg) == 61: crease_prof.append(seg - np.median(np.r_[seg[:12], seg[-12:]]))
    im, L, box, cr, prof, y0 = cache[c]
    x0, _, x1, y1 = box
    ys = [box[1]] + cr + [y1]
    pad = 14
    # every panel is cut to one common height about the middle of its two creases: the book's panels are one size,
    # and the photographs' crease-to-crease heights differ only by where each fold's line was found (+-3%)
    s = WN / (x1 - x0)
    mid = (ys[r] + ys[r + 1]) / 2
    top, bot = round(mid - HC / s / 2), round(mid + HC / s / 2)
    crop = im.crop((x0 - pad, top, x1 + pad, bot))
    crop = crop.resize((round(crop.width * s), round(crop.height * s)), Image.LANCZOS)
    arr = np.asarray(crop); Lc = lum(arr.astype(float))
    al = alpha_from(Lc)
    # top/bottom rows are the crease itself: keep them opaque (the paper continues into the next panel)
    al[:3, :] = np.maximum(al[:3, :], (Lc[:3, :] > 32) * 255)
    rgba = np.dstack([arr, al])
    pim = Image.fromarray(rgba, 'RGBA')
    pim.resize((1240, round(1240 * pim.height / pim.width)), Image.LANCZOS).save(os.path.join(OUT, 'p', f'{pid}.webp'), quality=86, method=6)
    pim.resize((680, round(680 * pim.height / pim.width)), Image.LANCZOS).save(os.path.join(OUT, 'p', f'{pid}-s.webp'), quality=86, method=6)
    pp = round(pad * s)
    runs, gh, inkf = free_runs(arr[:, pp:arr.shape[1] - pp])
    # the drawing's black line work, for the writing's colour
    if inkf > .01:
        aa = arr[:, pp:-pp].astype(float); LL = lum(aa)
        sel = LL < np.percentile(LL, 1.2)
        inks.append(np.median(aa[sel], axis=0))
    panels.append(dict(id=pid, side=side, n=k, frame=c, row=r, w=pim.width, h=pim.height, pad=pp,
                       ink=round(inkf, 4), grid=[GRIDW, gh], free=runs))
    print(pid, c, r, pim.size, 'ink', round(inkf, 4), flush=True)

# covers
def cut_board(im, box=None):
    """the board cut from the black: the ground is the near-black reached from the frame's edge (the lacquer can be
    almost as dark as the ground, but it is never reached from outside without crossing the board's worn rim)."""
    a = np.asarray(im).astype(float); L = lum(a)
    dark = ndi.uniform_filter(L, 5) < 17
    lab, n = ndi.label(dark)
    edge_labels = set(np.unique(np.r_[lab[0], lab[-1], lab[:, 0], lab[:, -1]])) - {0}
    ground = np.isin(lab, list(edge_labels))
    m = ~ground
    m = ndi.binary_opening(m, iterations=2); m = ndi.binary_fill_holes(m)
    lab, n = ndi.label(m); sizes = ndi.sum(m, lab, range(1, n + 1)); m = lab == (1 + int(np.argmax(sizes)))
    al = ndi.gaussian_filter(m.astype(float), 1.0)
    ys, xs = np.where(m)
    bb = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    rgba = np.dstack([np.asarray(im), (al * 255).astype(np.uint8)])
    return Image.fromarray(rgba, 'RGBA').crop(bb)

im41 = load(41); L41 = lum(np.asarray(im41).astype(float))
bx = paper_box(L41)
# the cover's lower edge: the first row under it where the paper is pale all the way across
rowmed = np.median(L41[:, bx[0] + 100: bx[2] - 100], axis=1)
cover_bot = int(np.argmax(rowmed[bx[1] + 200:] > 120)) + bx[1] + 200
front = cut_board(im41.crop((0, 0, im41.width, cover_bot + 6)))
s = WN / (bx[2] - bx[0])
front = front.resize((round(front.width * s), round(front.height * s)), Image.LANCZOS)
back = cut_board(load(80))
sb = front.width / back.width
back = back.resize((front.width, round(back.height * sb)), Image.LANCZOS)
for name, b in (('cover', front), ('back', back)):
    b.resize((1240, round(1240 * b.height / b.width)), Image.LANCZOS).save(os.path.join(OUT, f'{name}.webp'), quality=86, method=6)
    b.resize((680, round(680 * b.height / b.width)), Image.LANCZOS).save(os.path.join(OUT, f'{name}-s.webp'), quality=86, method=6)

# the stack's long edge (frame 82): every fold, one line each
e = load(82); Le = lum(np.asarray(e).astype(float))
ebx = paper_box(Le) if (Le > 55).any() else (0, 0, e.width, e.height)
m = Le > 30
cols = np.where(m.mean(0) > .4)[0]; rows = np.where(m.mean(1) > .4)[0]
edge = e.crop((int(cols[0]), int(rows[0]), int(cols[-1]), int(rows[-1])))
edge = edge.resize((1240, round(1240 * edge.height / edge.width)), Image.LANCZOS)
edge.save(os.path.join(OUT, 'edge.webp'), quality=86, method=6)

# scale: the Wellcome's rule on the cover in frame 86 (0-25 cm), read on the 1400 px view: 0 cm at x=22, 25 cm at
# x=925 (of 1400; the frame is 5202 px), so 134 px/cm at full size; the board there spans x=25-1375, 37.3 cm.
cp = np.mean(crease_prof, axis=0)
ink = np.median(inks, axis=0) if inks else np.array([40, 34, 30])
meta = dict(
    source='Wellcome Collection, MS Thai 801, [Tamra nuat], Thailand, 19th century. Public Domain Mark.',
    manifest='https://iiif.wellcomecollection.org/presentation/v2/b20589463',
    paperWidthCm=37.3,
    panels=panels,
    openings=[[f'{a[0].lower()}{a[1]:02d}', f'{b[0].lower()}{b[1]:02d}'] for a, b in OPENINGS],
    blanks=[f'b{k:02d}' for _, k in BLANKS],
    cover=dict(w=front.width, h=front.height), back=dict(w=back.width, h=back.height),
    edge=dict(w=1240, h=edge.height, folds=78),
    crease=dict(profile=[round(float(v), 1) for v in cp[::2]], step=2, scale=WN),
    ink=[int(v) for v in ink],
)
json.dump(meta, open(os.path.join(OUT, 'tamra-nuat.json'), 'w'), separators=(',', ':'))
print('crease depth', round(float(cp.min()), 1), 'ink', meta['ink'], 'cover', front.size, 'back', back.size, 'edge', edge.size)
