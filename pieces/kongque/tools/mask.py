"""Stage 1: the fan off its ground, as an alpha matte.

BiRefNet (the asset engine's matte worker, run on the photograph at half size) gives the outline. The ground is a
grey linen mount; its colour is modelled smoothly over the frame from the pixels well outside the fan. Within a
band either side of BiRefNet's edge, alpha is solved from how far each pixel stands from the linen's colour, so the
edge is the photograph's own at full resolution. The pin's brass bail and the painted heel are part of the fan.
writes WORK/alpha.png, WORK/ground.png, WORK/alpha-look.jpg"""
import cv2
from scipy.ndimage import gaussian_filter, binary_fill_holes, binary_erosion, binary_dilation, label
from common import *
img = load(SRC) * 255
H, W, _ = img.shape
b = np.asarray(Image.open(os.path.join(WORK, 'birefnet-half.png')))[..., 3].astype(np.float32) / 255
b = cv2.resize(b, (W, H), interpolation=cv2.INTER_LINEAR)
core = b > .5
lab, n = label(core); sizes = np.bincount(lab.ravel()); sizes[0] = 0
core = binary_fill_holes(lab == np.argmax(sizes))
far = ~binary_dilation(core, iterations=25)
ring = far & binary_dilation(core, iterations=160)          # the linen near the fan (the frame's edge is not linen)
sm = lambda x: cv2.resize(x.astype(np.float32), (W // 8, H // 8), interpolation=cv2.INTER_AREA)
den = gaussian_filter(sm(ring), 30)
G = np.stack([cv2.resize(gaussian_filter(sm(np.where(ring, img[..., c], 0)), 30) / np.maximum(den, 1e-6), (W, H),
                         interpolation=cv2.INTER_CUBIC) for c in range(3)], -1)
imgs = gaussian_filter(img, (2.5, 2.5, 0))          # the linen's weave is coarse: compare the smoothed photograph
d = np.sqrt(((imgs - G) ** 2).sum(-1))
noise = np.percentile(d[ring], 98)                   # the linen's own weave
a_col = np.clip((d - noise) / 22, 0, 1)
band = binary_dilation(core, iterations=8) & ~binary_erosion(core, iterations=8)
a = np.where(band, a_col, core.astype(np.float32))
a = np.where(binary_erosion(core, iterations=8), 1, a)
lab, n = label(a > .05); sizes = np.bincount(lab.ravel()); sizes[0] = 0
a[lab != np.argmax(sizes)] = 0
save(os.path.join(WORK, 'alpha.png'), a)
Image.fromarray(np.clip(G + .5, 0, 255).astype(np.uint8)).save(os.path.join(WORK, 'ground.png'))
ov = img / 255 * a[..., None] + np.array([1, 0, 1]) * (1 - a[..., None])
save(os.path.join(WORK, 'alpha-look.jpg'), cv2.resize(ov, (W // 2, H // 2), interpolation=cv2.INTER_AREA), quality=85)
print('noise', noise, 'fan px', int((a > .5).sum()))
