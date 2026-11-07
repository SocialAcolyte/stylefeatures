"""export.py: the cut ends -> assets/ends.webp (one atlas) + assets/ends.json (where each piece is, and its cord's
centreline from its tip, 2 px apart). Pieces are packed as cut: on the photograph's own pixel grid, never turned,
scaled or joined. The button turns and scales each one once, as a whole, at run time.

  ./run.sh export.py          (reads the cut pieces from $KB_ENDS: see cut.py; writes ../assets/ends.webp and ends.json)
"""
import os, json
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
ENDS = os.environ.get('KB_ENDS', os.path.join(ROOT, 'tools/engine/jobs/khipu-button-fix1/ends'))
ASSETS = os.path.join(HERE, '..', 'assets')
PRIMARY = 'P2'
PENDANTS = {
    # one family of the khipu's cords: mid-brown cords with knotted or curled ends, side by side at the
    # bottom of the fan. In the order the options take them.
    'brown': ['C1', 'A1', 'M2', 'E1', 'E6', 'B2', 'B1'],
}


def main():
    if not os.path.exists(os.path.join(ENDS, 'meta.json')):
        raise SystemExit(f'export.py: no cut pieces in {ENDS}; run cut.py first, or set KB_ENDS (see cut.py)')
    meta = json.load(open(os.path.join(ENDS, 'meta.json')))
    ids = [PRIMARY] + [i for v in PENDANTS.values() for i in v]
    imgs = {i: Image.open(os.path.join(ENDS, i + '.png')).convert('RGBA') for i in ids}
    order = sorted(ids, key=lambda i: -imgs[i].height)
    W = 1700; x = y = rowh = 0; rects = {}
    for i in order:
        w, h = imgs[i].size
        if x + w > W: x = 0; y += rowh + 2; rowh = 0
        rects[i] = [x, y, w, h]; x += w + 2; rowh = max(rowh, h)
    H = y + rowh
    atlas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    for i in ids: atlas.paste(imgs[i], tuple(rects[i][:2]))
    # fully transparent pixels carry no colour (smaller file, nothing to bleed)
    a = np.array(atlas); a[a[..., 3] == 0, :3] = 0; atlas = Image.fromarray(a, 'RGBA')
    atlas.save(os.path.join(ASSETS, 'ends.webp'), 'WEBP', quality=92, method=6, exact=False)
    atlas.save(os.path.join(ENDS, '..', 'ends-atlas.png'))
    pieces = {}
    for i in ids:
        m = meta[i]
        line = np.array(m['line'])[::2]
        pieces[i] = dict(rect=rects[i], origin=m['origin'], w=m['w'], tipr=m['tipr'], fray=m['fray'],
                         line=[round(float(v), 1) for v in line.reshape(-1)])
    out = dict(
        about='Whole cord ends cut from one photograph: Inka khipu 1940.469, the Cleveland Museum of Art (CC0). Each piece '
              'is one stretch of one cord, from its own tip back along it, keyed off the cloth on the photograph\'s own '
              'pixel grid: never straightened, resampled or joined. origin: its window in the 5968 x 4958 TIFF.',
        scale='source px of the full TIFF, about 44 px a centimetre', file='ends.webp', atlas=[W, H], step=2,
        primary=PRIMARY, pendants=PENDANTS, pieces=pieces)
    json.dump(out, open(os.path.join(ASSETS, 'ends.json'), 'w'), separators=(',', ':'))
    print('atlas', W, H, os.path.getsize(os.path.join(ASSETS, 'ends.webp')) // 1024, 'KB;',
          'json', os.path.getsize(os.path.join(ASSETS, 'ends.json')) // 1024, 'KB')


main()
