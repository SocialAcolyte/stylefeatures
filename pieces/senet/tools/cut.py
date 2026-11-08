# /// script
# dependencies = ["pillow", "numpy", "scipy"]
# ///
"""Cut the senet board and two of its own pieces out of the Met's photographs, and measure the board.

  uv run components/senet/tools/cut.py <orig-dir> <matte-dir>

<orig-dir>  holds the Met originals (images.metmuseum.org/CRDImages/eg/original/...):
            01.4.1a_EGDP013652.jpg                               the board, straight down
            01.4.1n-01.4.1p-01.4.1i_EGDP013665.jpg               conical pieces, straight down
            01.4.3d-01.4.1h-01.4.1c-01.4.1l_EGDP013659.jpg        spool pieces, straight down
<matte-dir> holds the BiRefNet mattes of the two piece crops (tools/engine/stages/matte_worker.py):
            p65-10-raw.png (crop 900,1400 .. 1900,2400 of EGDP013665), p59-00-raw.png (crop 900,300 .. 1900,1300 of
            EGDP013659).

Writes assets/board.webp (2400 wide), assets/board-1200.webp, assets/cone.webp, assets/spool.webp and
assets/board.json (the 30 squares in play order, as fractions of the board image, and the piece size).

Nothing is redrawn. The board is a crop of the photograph with its alpha cut along the four straight edges of the
box top (fitted to the wood, 1 px inside it). The pieces are mattes of their own photograph. Both are only scaled.
"""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage as nd

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'tools' / 'engine'))
from stages.matte import refine  # noqa: E402  (edge decontamination + soft pull, the engine's own)

ORIG, MATTE = Path(sys.argv[1]), Path(sys.argv[2])
OUT = Path(__file__).resolve().parents[1] / 'assets'
BOARD_W = 2400
PIECE_OF_TILE = 0.50   # piece diameter / faience tile side, measured on the Met's three-quarter view DP310299,
                       # where the board's own spools and cones stand on its tiles

# ---- the board -----------------------------------------------------------------------------------------------
im = Image.open(ORIG / '01.4.1a_EGDP013652.jpg').convert('RGB')
a = np.asarray(im).astype(float)
R, G, B = a[..., 0], a[..., 1], a[..., 2]
wood = (R - B > 40) & (R < 200)
tile = (G - R > 25) | (B - R > 25)
m = nd.binary_fill_holes(nd.binary_closing(nd.binary_opening(wood | tile, iterations=3), iterations=5))
lab, n = nd.label(m)
m = lab == (1 + int(np.argmax(nd.sum(m, lab, range(1, n + 1)))))
ys, xs = np.where(m)


def edge_fit(sample, axis_pts, take):
    vals = [take(np.where(sample(p))[0]) for p in axis_pts]
    return np.polyfit(axis_pts, vals, 1)


rows = np.arange(ys.min() + 15, ys.max() - 15, 10)
cols = np.arange(xs.min() + 15, xs.max() - 15, 20)
left = edge_fit(lambda y: m[y], rows, np.min)
right = edge_fit(lambda y: m[y], rows, np.max)
top = edge_fit(lambda x: m[:, x], cols, np.min)
bottom = edge_fit(lambda x: m[:, x], cols, np.max)
print('edges: left', left, 'right', right, 'top', top, 'bottom', bottom)

x0, x1 = int(np.floor(xs.min())) - 2, int(np.ceil(xs.max())) + 3
y0, y1 = int(np.floor(ys.min())) - 2, int(np.ceil(ys.max())) + 3
crop = a[y0:y1, x0:x1]
# alpha: inside all four fitted edges, 1 px in, anti-aliased by 4x supersampling
SS = 4
hh, ww = crop.shape[:2]
yy, xx = np.mgrid[0:hh * SS, 0:ww * SS].astype(float) / SS + 0.5 / SS
X, Y = xx + x0, yy + y0
inside = ((X >= np.polyval(left, Y) + 1) & (X <= np.polyval(right, Y) - 1) &
          (Y >= np.polyval(top, X) + 1) & (Y <= np.polyval(bottom, X) - 1)).astype(float)
alpha = inside.reshape(hh, SS, ww, SS).mean(axis=(1, 3))
rgba = np.dstack([crop, alpha * 255]).astype(np.uint8)
board = Image.fromarray(rgba, 'RGBA')
scale = BOARD_W / board.width
for w, name in [(BOARD_W, 'board.webp'), (1200, 'board-1200.webp')]:
    h = round(board.height * w / board.width)
    board.resize((w, h), Image.LANCZOS).save(OUT / name, quality=88, method=6)
    print(name, w, h)

# ---- the 30 squares ------------------------------------------------------------------------------------------
t = nd.binary_fill_holes(nd.binary_closing(nd.binary_opening(tile & m, iterations=4), iterations=6))
lab, n = nd.label(t)
sz = nd.sum(t, lab, range(1, n + 1))
ids = [i + 1 for i in range(n) if sz[i] > 20000]
assert len(ids) == 30, len(ids)
boxes = nd.find_objects(lab)
tiles = []
for i in ids:
    s = boxes[i - 1]
    tiles.append(((s[1].start + s[1].stop) / 2 - x0, (s[0].start + s[0].stop) / 2 - y0,
                  s[1].stop - s[1].start, s[0].stop - s[0].start))
tiles.sort(key=lambda q: (round(q[1] / 100), q[0]))
rows3 = [sorted(tiles[r * 10:(r + 1) * 10], key=lambda q: q[0]) for r in range(3)]
# play order: the boustrophedon S. Top row left to right (1-10), middle right to left (11-20), bottom left to right
# (21-30). Check: square 26 (bottom row, 6th from the left) is the one with three nefer signs.
order = rows3[0] + rows3[1][::-1] + rows3[2]
W, H = ww, hh
side = float(np.median([q[2] for q in tiles] + [q[3] for q in tiles]))
squares = [{'n': k + 1, 'x': round(q[0] / W, 5), 'y': round(q[1] / H, 5),
            'w': round(q[2] / W, 5), 'h': round(q[3] / H, 5)} for k, q in enumerate(order)]

# ---- the pieces ----------------------------------------------------------------------------------------------
piece_px_board = PIECE_OF_TILE * side          # piece diameter in board-photo pixels
pieces = {}
for key, src, crop_box, name in [
        ('cone', '01.4.1n-01.4.1p-01.4.1i_EGDP013665.jpg', (900, 1400, 1900, 2400), 'p65-10'),
        ('spool', '01.4.3d-01.4.1h-01.4.1c-01.4.1l_EGDP013659.jpg', (900, 300, 1900, 1300), 'p59-00')]:
    rgb = np.asarray(Image.open(ORIG / src).convert('RGB').crop(crop_box)).astype(np.float32) / 255
    raw = np.asarray(Image.open(MATTE / f'{name}-raw.png'))[..., 3].astype(np.float32) / 255
    rgb2, a2 = refine(rgb, raw, pull=1.5)
    solid = a2 > 0.5
    pys, pxs = np.where(solid)
    diam = 2 * np.sqrt(solid.sum() / np.pi)
    cx, cy = pxs.mean(), pys.mean()
    half = int(np.ceil(max(pxs.max() - cx, cx - pxs.min(), pys.max() - cy, cy - pys.min()))) + 6
    box = (int(round(cx)) - half, int(round(cy)) - half, int(round(cx)) + half, int(round(cy)) + half)
    cut = Image.fromarray((np.dstack([rgb2, a2]) * 255 + 0.5).astype(np.uint8), 'RGBA').crop(box)
    # shipped at twice the board's export scale, so it stays sharp when it is lifted (scaled up a little)
    target = 2 * piece_px_board * scale * cut.width / diam
    px = int(round(target))
    cut.resize((px, px), Image.LANCZOS).save(OUT / f'{key}.webp', quality=90, method=6)
    pieces[key] = {'file': f'{key}.webp', 'size': px,
                   # the piece image's width as a fraction of the board image's width
                   'w': round((piece_px_board * cut.width / diam) / W, 5),
                   'source_diameter_px': round(float(diam), 1)}
    print(key, 'diam', round(diam), '->', px, 'px file')

meta = {
    'board': {'file': 'board.webp', 'width': BOARD_W, 'height': round(H * scale), 'source_crop': [x0, y0, x1, y1],
              'tile_side_source_px': side},
    'path': 'boustrophedon: 1-10 top row left to right, 11-20 middle row right to left, 21-30 bottom row left to right',
    'squares': squares,
    'pieces': pieces,
}
(OUT / 'board.json').write_text(json.dumps(meta, indent=1))
print('board.json: tile side', side, 'px; board', W, 'x', H)
