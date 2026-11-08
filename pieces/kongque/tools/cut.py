"""Stage 3: every stick's visible face, and the piece that does not turn.

label: for each fan pixel, the stick it shows (0..17): stick k+1 from its leading edge on (edges.py). The sticks are
straight strips through the rivet, so a stick's heel (the scalloped end below the pin) is its blade turned half
round: a pixel below the pin is labelled as the pixel opposite it through the pin. What does not turn is label 20:
the rivet's head and the brass bail hanging from it (found by its colour in a corridor under the pin).
Islands of a label cut off from their stick join the stick they border most.
writes WORK/label.png, WORK/edge_dist.npy (px past the leading edge, for antialiasing it), WORK/cut-look.jpg"""
import cv2
from scipy.ndimage import label as cc, binary_dilation, find_objects, binary_opening
from skimage import color
from common import *
img = load(SRC)
H, W, _ = img.shape
a = load(os.path.join(WORK, 'alpha.png'))[..., 0]
e = np.load(os.path.join(WORK, 'edges.npz')); E = e['E']; R = e['R']
cx, cy, rp = json.load(open(os.path.join(WORK, 'rivet.json')))['pin']
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
dx, dy = xx - cx, yy - cy
th = np.degrees(np.arctan2(dy, dx)) % 360
heel = (th > 2) & (th < 178)                        # below the pin: read the blade opposite
th = np.where(heel, th + 180, th)
th = np.where(th < 120, th + 360, th)
rr = np.hypot(dx, dy)
ri = np.clip(np.round((rr - R[0]) / 2).astype(int), 0, len(R) - 1)
fan = a > .02
lab = np.zeros((H, W), np.uint8)
dist = np.full((H, W), 50, np.float32)
for k in range(E.shape[0]):
    ek = E[k][ri]
    on = th >= ek
    lab[on] = k + 1
    dist = np.where(on, np.minimum((th - ek) * np.pi / 180 * rr, 50), dist)
# the bail: brass, in a corridor under the pin
lab_ = color.rgb2lab(img[int(cy) - 30:int(cy) + 320, int(cx) - 60:int(cx) + 60])
h = np.degrees(np.arctan2(lab_[..., 2], lab_[..., 1])) % 360; C = np.hypot(lab_[..., 1], lab_[..., 2])
brass = (h > 60) & (h < 105) & (C > 16) & (lab_[..., 0] > 35)
brass = binary_opening(brass, iterations=1)
bl, n = cc(brass); sizes = np.bincount(bl.ravel()); sizes[0] = 0
brass = bl == np.argmax(sizes)
brass = binary_dilation(brass, iterations=2)
fixed = np.zeros((H, W), bool)
fixed[int(cy) - 30:int(cy) + 320, int(cx) - 60:int(cx) + 60] = brass
fixed |= rr < rp + 3
lab[fixed] = 20
lab[~fan] = 255
for it in range(2):
    for k in list(range(E.shape[0] + 1)):
        comp, n = cc(lab == k)
        if n < 2: continue
        sizes = np.bincount(comp.ravel()); keep = np.argmax(sizes[1:]) + 1
        for i, sl in enumerate(find_objects(comp)):
            if i + 1 == keep: continue
            sl = tuple(slice(max(0, s.start - 2), s.stop + 2) for s in sl)
            isl = comp[sl] == i + 1
            ring = binary_dilation(isl) & ~isl
            nb = lab[sl][ring]; nb = nb[(nb != 255) & (nb != k)]
            if len(nb): lab[sl][isl] = np.bincount(nb).argmax()
Image.fromarray(lab).save(os.path.join(WORK, 'label.png'))
np.save(os.path.join(WORK, 'edge_dist.npy'), dist.astype(np.float16))
rng = np.random.default_rng(5); pal = rng.uniform(.15, 1, (256, 3)); pal[255] = 1; pal[20] = (1, 0, 1)
ov = img * .55 + pal[lab] * .45
bd = (np.abs(np.diff(lab.astype(int), axis=1, prepend=0)) > 0) | (np.abs(np.diff(lab.astype(int), axis=0, prepend=0)) > 0)
ov[bd] = 0
save(os.path.join(WORK, 'cut-look.jpg'), cv2.resize(ov, (W // 2, H // 2), interpolation=cv2.INTER_AREA), quality=86)
save(os.path.join(WORK, 'cut-pin.jpg'), ov[int(cy) - 350:int(cy) + 350, int(cx) - 500:int(cx) + 500], quality=88)
print(np.bincount(lab.ravel(), minlength=256)[[*range(18), 20]])
