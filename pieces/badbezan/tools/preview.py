"""Render the fan from the exported assets at a few openings, the way the runtime does (sticks in stack order, each
turned about the pin, the rivet on top), over paper. At full opening it must be fan.webp.
writes WORK/preview-<v>.png and WORK/preview.jpg (a strip)"""
import sys, cv2
from common import *

meta = json.load(open(os.path.join(ASSETS, 'fan.json')))
atlas = np.asarray(Image.open(os.path.join(ASSETS, 'sticks.webp')).convert('RGBA')).astype(np.float32) / 255
fan = np.asarray(Image.open(os.path.join(ASSETS, 'fan.webp')).convert('RGBA')).astype(np.float32) / 255
px, py = meta['pivot']
sx0, sy0, sx1, sy1 = meta.get('box') or meta.get('sweep') or [-200, -200, meta['size'][0] + 200, meta['size'][1] + 200]
pad_x, pad_y = int(-min(0, sx0)) + 4, int(-min(0, sy0)) + 4
CW, CH = int(max(sx1, meta['size'][0])) + pad_x + 4, int(max(sy1, meta['size'][1])) + pad_y + 4
paper = np.array([.953, .941, .91])
a0 = meta['sticks'][0]['a']


def render(v, sticks=None):
    acc = np.zeros((CH, CW, 4), np.float32)
    for k, s in enumerate(meta['sticks']):
        d = (v - 1) * (s['a'] - a0) if sticks is None else sticks[k]
        spr = atlas[s['ay']:s['ay'] + s['h'], s['ax']:s['ax'] + s['w']].copy()
        spr[..., :3] *= spr[..., 3:4]
        # sprite px -> canvas: translate to (x,y)+pad, rotate by d degrees about the pivot (image coords, y down)
        th = np.radians(d); c, sn = np.cos(th), np.sin(th)
        P = np.array([px + pad_x, py + pad_y])
        M = np.array([[c, -sn, 0], [sn, c, 0]])
        t = np.array([s['x'] + pad_x, s['y'] + pad_y]) - P
        M[:, 2] = M[:, :2] @ t + P
        layer = cv2.warpAffine(spr, M, (CW, CH), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
        acc = layer + acc * (1 - layer[..., 3:4])
    r = meta['rivet']
    spr = atlas[r['ay']:r['ay'] + r['h'], r['ax']:r['ax'] + r['w']].copy(); spr[..., :3] *= spr[..., 3:4]
    X, Y = int(r['x'] + pad_x), int(r['y'] + pad_y)
    sub = acc[Y:Y + r['h'], X:X + r['w']]
    acc[Y:Y + r['h'], X:X + r['w']] = spr + sub * (1 - spr[..., 3:4])
    return acc


if __name__ == '__main__':
    vs = [float(x) for x in sys.argv[1:]] or [1, .75, .5, .25, .08, 0]
    outs = []
    for v in vs:
        acc = render(v)
        out = acc[..., :3] + paper * (1 - acc[..., 3:4])
        save(os.path.join(WORK, f'preview-{v:g}.png'), out)
        outs.append(out)
        if v == 1:
            ref = np.zeros_like(acc); ref[pad_y:pad_y + fan.shape[0], pad_x:pad_x + fan.shape[1]] = fan
            refc = ref[..., :3] * ref[..., 3:4] + paper * (1 - ref[..., 3:4])
            diff = np.abs(refc - out).max(-1)
            print('v=1 vs fan.webp: mean |d|', diff.mean() * 255, ' p99.9', np.percentile(diff, 99.9) * 255, ' max', diff.max() * 255)
            save(os.path.join(WORK, 'preview-diff.png'), np.repeat(np.minimum(diff * 8, 1)[..., None], 3, -1))
    strip = np.concatenate([o[::3, ::3] for o in outs], 0)
    save(os.path.join(WORK, 'preview.jpg'), strip, quality=85)
