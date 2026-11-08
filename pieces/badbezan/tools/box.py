"""Stage 4: the box the fan needs while it closes: the union of its rendered alpha at 41 openings. Written into
assets/fan.json as `box` [x0, y0, x1, y1] in the photograph's output px (it can run a little past the photograph)."""
from preview import *
U = np.zeros((CH, CW), bool)
for v in np.linspace(0, 1, 41):
    U |= render(v)[..., 3] > 0.02
ys, xs = np.nonzero(U)
box = [int(xs.min() - pad_x), int(ys.min() - pad_y), int(xs.max() - pad_x + 1), int(ys.max() - pad_y + 1)]
meta['box'] = box
meta.pop('sweep', None)
json.dump(meta, open(os.path.join(ASSETS, 'fan.json'), 'w'), separators=(',', ':'))
print('box', box)
