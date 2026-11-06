"""Check the parts in motion: the ring turned about the hinge (orthographic, cos law) over the plate, the loop in front.

Writes WORK/motion_strip.jpg (frames at 0, 12, 24, 32 deg of lift) and WORK/motion_zoom_<deg>.png (the strip the ring
uncovers, at full resolution, on paper)."""
import json
import numpy as np, cv2
from common import *

pl = load_rgba(WORK / 'plate.png'); rg = load_rgba(WORK / 'ring.png'); lp = load_rgba(WORK / 'loop.png')
geo = json.load(open(WORK / 'parts.json'))
h = geo['hinge_y']
H, W = pl.shape[:2]
REST = np.radians(12.0)
paper = np.array([243, 240, 232], np.float32) / 255


def over(d, s):
    return s[..., :3] * s[..., 3:] + d * (1 - s[..., 3:])


def frame(lift_deg, bg=paper):
    k = np.cos(REST + np.radians(lift_deg)) / np.cos(REST)
    # y' = h + (y - h) k  ->  source y = h + (y' - h) / k
    M = np.float32([[1, 0, 0], [0, k, h * (1 - k)]])
    ring = cv2.warpAffine(rg, M, (W, H), flags=cv2.INTER_AREA if k < 1 else cv2.INTER_LINEAR, borderValue=(0, 0, 0, 0))
    base = np.broadcast_to(bg, pl[..., :3].shape).copy()
    return over(over(over(base, pl), ring), lp)


frames = [frame(d) for d in (0, 12, 24, 32)]
strip = np.concatenate(frames, 1)
cv2.imwrite(str(WORK / 'motion_strip.jpg'), cv2.cvtColor((cv2.resize(strip, (strip.shape[1] // 4, strip.shape[0] // 4), interpolation=cv2.INTER_AREA) * 255).astype(np.uint8), cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 90])
X0, Y0 = geo['box'][:2]
for d in (24, 32):
    f = frame(d)
    z = f[1150 - Y0:1520 - Y0, 1600 - X0:2750 - X0]
    cv2.imwrite(str(WORK / f'motion_zoom_{d}.png'), cv2.cvtColor((z * 255).astype(np.uint8), cv2.COLOR_RGB2BGR))
print('ok', W, H)
