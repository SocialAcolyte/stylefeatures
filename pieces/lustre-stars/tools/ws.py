# watershed every tile out to its joints: markers are shrunken tile shapes, the relief is neutral darkness
import sys, json, numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from skimage import color, segmentation, morphology
from skimage.draw import polygon as rpoly
src, outd = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGB'); a = np.asarray(im).astype(np.float32)/255
lab = color.rgb2lab(a); L = lab[..., 0]; ch = np.hypot(lab[..., 1], lab[..., 2]-3)
neutral = np.exp(-np.maximum(ch - 7, 0)/4)
local = ndi.uniform_filter(L, 41)
dark = np.clip(local - L, 0, None) * neutral
relief = ndi.gaussian_filter(dark, 1.5)
fg = np.asarray(Image.open(outd+'/fg.png')) > 127
stars = json.load(open(outd+'/stars-snapped.json'))
H, W = L.shape
markers = np.zeros((H, W), np.int32)
def put(P, k, s):
    P = np.array(P); c = P.mean(0); Q = c + (P - c)*s
    rr, cc = rpoly(Q[:, 1], Q[:, 0], (H, W)); markers[rr, cc] = k
# ids: 1..5 bottom stars (rating order), 6..9 crosses, 10..13 top stars
for i, s in enumerate(stars[4:]): put(s["poly"], 1+i, 0.86)
for i, s in enumerate(stars[:4]): put(s["poly"], 10+i, 0.72)
crosses = json.loads(sys.argv[3])
for i, (cx, cy, w, b) in enumerate(crosses):
    for q in [((cx-w, cy-b), (cx+w, cy+b)), ((cx-b, cy-w), (cx+b, cy+w))]:
        (x0, y0), (x1, y1) = q; markers[int(y0):int(y1), int(x0):int(x1)] = 6+i
pass
lab_ = segmentation.watershed(relief, markers, mask=fg, compactness=float(sys.argv[4]))
lab_[lab_ == 20] = 0
lab_[~fg] = 0
np.save(outd+'/labels.npy', lab_.astype(np.uint8))
b = segmentation.find_boundaries(lab_, mode='inner')
ov = np.asarray(im).copy(); ov[b] = [255, 0, 60]
mk = markers.copy(); mk[mk == 20] = 0
ov[(mk > 0) & (ndi.binary_erosion(mk > 0, iterations=3) == 0)] = [0, 220, 255]
Image.fromarray(ov).save(outd+'/ws-overlay.jpg', quality=92)
Image.fromarray(ov).resize((2000, 1105)).save(outd+'/ws-overlay-small.jpg', quality=85)
Image.fromarray((relief/relief.max()*255*3).clip(0,255).astype(np.uint8)).save(outd+'/relief.png')
