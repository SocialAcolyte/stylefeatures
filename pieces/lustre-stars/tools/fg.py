# foreground (tiles) vs the grey wall in DP231256; writes fg.png and a preview
import sys, numpy as np
from PIL import Image
from scipy import ndimage as ndi
from skimage import color, morphology, filters
src, out = sys.argv[1], sys.argv[2]
im = np.asarray(Image.open(src).convert('RGB')).astype(np.float32) / 255
lab = color.rgb2lab(im)
L, a, b = lab[..., 0], lab[..., 1], lab[..., 2]
chroma = np.hypot(a, b)
# texture: local std of L at small scale
m = ndi.uniform_filter(L, 7); s = np.sqrt(np.maximum(ndi.uniform_filter(L * L, 7) - m * m, 0))
# the wall: low chroma, smooth. sample its colour from the borders
border = np.zeros(L.shape, bool); border[:60] = border[-60:] = True; border[:, :60] = border[:, -60:] = True
print('wall L %.1f a %.2f b %.2f chroma %.2f std %.2f' % (np.median(L[border]), np.median(a[border]), np.median(b[border]), np.median(chroma[border]), np.median(s[border])))
wa, wb = np.median(a[border]), np.median(b[border])
dch = np.hypot(a - wa, b - wb)
score = np.maximum(dch / 6.0, s / 2.2)
fg = score > 1
fg = morphology.binary_opening(fg, morphology.disk(2))
fg = morphology.remove_small_objects(fg, 20000)
fg = ndi.binary_fill_holes(fg)
fg = morphology.binary_closing(fg, morphology.disk(3))
fg = ndi.binary_fill_holes(fg)
Image.fromarray((fg * 255).astype(np.uint8)).save(out + '/fg.png')
prev = (im * 255).astype(np.uint8).copy(); prev[~fg] = (prev[~fg] * 0.3 + np.array([255, 0, 0]) * 0.7).astype(np.uint8)
Image.fromarray(prev).resize((2000, 1105)).save(out + '/fg-preview.jpg', quality=85)
np.save(out + '/score.npy', score.astype(np.float16))
