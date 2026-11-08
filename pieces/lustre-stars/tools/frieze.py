import sys, json, numpy as np
from PIL import Image
from scipy import ndimage as ndi
from skimage import morphology, measure
src, outd = sys.argv[1], sys.argv[2]
im = np.asarray(Image.open(src).convert('RGB'))
lab = np.load(outd+'/labels-clipped.npy')
clean = np.zeros_like(lab)
for k in range(1, 10):
    m = lab == k
    m = morphology.opening(m, morphology.disk(6))
    lb = measure.label(m); 
    if lb.max() == 0: continue
    m = lb == (np.argmax(np.bincount(lb.ravel())[1:]) + 1)
    m = ndi.binary_fill_holes(morphology.closing(m, morphology.disk(4)))
    clean[m & (clean == 0)] = k
keep = clean > 0
ys, xs = np.nonzero(keep); pad = 24
y0, y1, x0, x1 = ys.min()-pad, ys.max()+pad, xs.min()-pad, xs.max()+pad
print('crop', x0, y0, x1, y1, x1-x0, y1-y0)
np.save(outd+'/frieze-labels.npy', clean[y0:y1, x0:x1])
json.dump(dict(crop=[int(x0), int(y0), int(x1), int(y1)]), open(outd+'/frieze.json', 'w'))
rgb = im[y0:y1, x0:x1]
a = ndi.gaussian_filter(keep[y0:y1, x0:x1].astype(np.float32), 0.8)
Image.fromarray(np.dstack([rgb, (a*255).astype(np.uint8)])).save(outd+'/frieze-rgba.png')
paper = np.array([243, 240, 232], np.float32)
comp = (rgb*a[..., None] + paper*(1-a[..., None])).astype(np.uint8)
Image.fromarray(comp).save(outd+'/frieze-paper.jpg', quality=92)
Image.fromarray(comp).resize((1800, int(1800*(y1-y0)/(x1-x0)))).save(outd+'/frieze-paper-small.jpg', quality=88)
