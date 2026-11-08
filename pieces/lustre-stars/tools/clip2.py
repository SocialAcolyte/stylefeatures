import sys, json, numpy as np
from PIL import Image
from scipy import ndimage as ndi
from skimage import color, morphology
from skimage.draw import polygon as rpoly
outd, src = sys.argv[1], sys.argv[2]
sys.argv = [sys.argv[0], src, outd]
exec(open(__file__.replace('clip2.py', 'snap.py')).read().split('stars = json.load')[0])   # L, ch, at
src_snap = open(__file__.replace('clip2.py', 'snap.py')).read()
fn = src_snap[src_snap.index('def snap'):src_snap.index('out = []')]
exec(fn)
shapes = json.load(open(outd+'/shapes.json'))
lab = np.load(outd+'/labels.npy'); fg = np.asarray(Image.open(outd+'/fg.png')) > 127
H, W = lab.shape
final = np.load(outd+'/labels-clipped.npy')
for k in range(6, 10):
    cxk = shapes[str(k)]['p'][0]; wk = shapes[str(k)]['p'][2]
    UPOK = (lambda m: m[0] < cxk + wk) if k == 9 else (lambda m: True)
    P = snap(shapes[str(k)]["poly"], R=14, passes=1, upin=34)
    shapes[str(k)]['snapped'] = P.tolist()
    m = np.zeros((H, W), bool); rr, cc = rpoly(P[:, 1], P[:, 0], (H, W)); m[rr, cc] = True
    final[final == k] = 0
    keep = ((lab == k) | (m & fg)) & morphology.dilation(m, morphology.disk(2))
    keep = ndi.binary_fill_holes(morphology.opening(keep, morphology.disk(3)))
    final[keep & ((final == 0))] = k
    print(k, 'snapped')
np.save(outd+'/labels-clipped.npy', final)
json.dump(shapes, open(outd+'/shapes.json', 'w'))
