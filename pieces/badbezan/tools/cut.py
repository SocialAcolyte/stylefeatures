"""Stage 2: every stick's visible face, cut from the photograph.

A brisé fan stacks its sticks in one order: here the bottom guard (red, on the left) lies lowest and each stick lies
on the one before it, clockwise, up to the top guard. So in the photograph, stick k shows from its own leading edge
to the leading edge of stick k+1, and the top guard shows whole. Closing the fan turns every stick about the pin
back over the one below, which only hides more of each: nothing that was not photographed is ever uncovered.

  - label: for each pixel of the fan, the stick it belongs to (0 .. 19), from the leading edges (edges.py)
  - alpha: the fan's outline against the neutral ground, solved per pixel from its saturation (the ground has none),
    and a 1 px antialiased leading edge for each stick (the part that moves over the one below)
  - the rivet: the brass pin and its mother-of-pearl washer, cut as their own piece that does not turn

writes WORK/label.png (uint8), WORK/alpha.png, WORK/cut.png (an overlay to look at)
"""
from scipy.ndimage import gaussian_filter, distance_transform_edt, binary_erosion
from common import *

img = load(SRC)
H, W, _ = img.shape
e = np.load(os.path.join(WORK, 'edges.npz')); E = e['E'].copy(); R = e['R']
rv = json.load(open(os.path.join(WORK, 'rivet.json'))); cx, cy, _ = rv['pin']
wx, wy, rw = rv['washer']
m = np.asarray(Image.open(os.path.join(WORK, 'mask.png'))) > 0

# leading edges as functions of r, NaN (past the tip) -> +inf; never crossing
E = np.where(np.isfinite(E), E, np.inf)
E = np.maximum.accumulate(E, axis=0)
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
rr = np.hypot(xx - cx, yy - cy)
th = np.degrees(np.arctan2(yy - cy, xx - cx)) % 360
th = np.where(th < 120, th + 360, th)                       # the fan spans 170 .. 372 in this convention
ri = np.clip(np.round(rr - R[0]).astype(int), 0, len(R) - 1)

lab = np.zeros((H, W), np.uint8)
dist = np.full((H, W), np.inf, np.float32)                 # signed angular distance (px) past the last edge
for k in range(19):
    ek = E[k][ri]
    on = th >= ek
    lab[on] = k + 1
    d = np.where(on, (th - ek) * np.pi / 180 * rr, np.inf)
    dist = np.where(on, d, dist)
lab[~m] = 255
# a stick is one piece: any island of a label cut off from its stick (a cap corner on the wrong side of the next
# stick's held tip line) joins the stick it shares the longest border with
from scipy.ndimage import label as cc, binary_dilation, find_objects
for it in range(2):
    for k in range(0, 20):
        comp, n = cc(lab == k)
        if n < 2: continue
        sizes = np.bincount(comp.ravel())[1:]
        keep = np.argmax(sizes) + 1
        for i, sl in enumerate(find_objects(comp)):
            if i + 1 == keep: continue
            sl = tuple(slice(max(0, s_.start - 2), s_.stop + 2) for s_ in sl)
            isl = comp[sl] == i + 1
            ring = binary_dilation(isl, iterations=1) & ~isl
            nb = lab[sl][ring]; nb = nb[(nb != 255) & (nb != k)]
            if len(nb): lab[sl][isl] = np.bincount(nb).argmax()
# the washer and pin sit on top of everything and do not turn
washer = np.hypot(xx - wx, yy - wy) <= rw + 1.5
lab[washer] = 20

# per-stick alpha: the fan's outline, solved from saturation against the neutral ground
sp = img.max(-1) - img.min(-1)
inner = binary_erosion(m, iterations=4)
ref = gaussian_filter(np.where(inner, sp, 0), 6) / np.maximum(gaussian_filter(inner.astype(np.float32), 6), 1e-3)
a_out = np.clip(sp / np.maximum(ref, .05), 0, 1)
band = m & ~inner
alpha = np.where(m, 1.0, 0.0)
near = (distance_transform_edt(~m) <= 2) | band
alpha = np.where(near, np.where(inner, 1, a_out), alpha).astype(np.float32)
alpha[inner] = 1

Image.fromarray(lab).save(os.path.join(WORK, 'label.png'))
save(os.path.join(WORK, 'alpha.png'), alpha)
np.save(os.path.join(WORK, 'edge_dist.npy'), np.where(np.isfinite(dist), np.minimum(dist, 50), 50).astype(np.float16))

# an overlay: each stick tinted, boundaries in black
rng = np.random.default_rng(3)
pal = rng.uniform(.2, 1, (256, 3)); pal[255] = 1
ov = img * .55 + pal[lab] * .45
bd = (np.abs(np.diff(lab.astype(int), axis=1, prepend=0)) > 0) | (np.abs(np.diff(lab.astype(int), axis=0, prepend=0)) > 0)
ov[bd] = 0
save(os.path.join(WORK, 'cut.png'), ov)
Image.open(os.path.join(WORK, 'cut.png')).resize((1400, 985)).save(os.path.join(WORK, 'cut-s.jpg'), quality=85)
print('labels', np.bincount(lab.ravel(), minlength=256)[:21])
