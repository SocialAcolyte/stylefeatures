# /// script
# dependencies = ["numpy", "pillow"]
# ///
"""Composite the parts as the component lays them (state k, lift G) onto paper: a check on the export."""
import json, sys
from pathlib import Path
from PIL import Image
A = Path(__file__).resolve().parent.parent / 'assets'
geo = json.load(open(A / 'geometry.json'))
W, H = geo['frame']; G = round(geo['opening'] * float(sys.argv[2]) if len(sys.argv) > 2 else geo['opening'])
out = Path(sys.argv[1])
row = []
for k in range(1, 6):
    im = Image.new('RGBA', (W, H + G), (243, 240, 232, 255))
    sx, sy, sw, sh = geo['shadow']
    im.alpha_composite(Image.open(A / 'shadow.webp').convert('RGBA'), (max(sx, 0), sy + G))
    for n in range(5, 0, -1):
        x, y, w, h = geo['parts'][n - 1]
        lift = G if n < k else 0
        im.alpha_composite(Image.open(A / f'tier-{n}.webp').convert('RGBA'), (x, y + G - lift))
    row.append(im)
S = Image.new('RGB', (W * 5, H + G), 'white')
for i, r in enumerate(row): S.paste(r.convert('RGB'), (i * W, 0))
S.resize((W * 5 // 2, (H + G) // 2)).save(out)
