# /// script
# dependencies = ["numpy", "pillow", "scipy", "opencv-python-headless", "pyyaml"]
# ///
"""jubako/tools/cut.py: the Met's five photographs of one food box, taken apart a tier at a time, into the
component's parts.

  uv run components/jubako/tools/cut.py ORIG_DIR WORK_DIR [--steps register,matte,seams,export]

ORIG_DIR holds the Met originals 40343-3.jpg .. 40343-7.jpg: The Met 2015.500.2.31a–f (object 40343), additional
images L1996_47_86_O2_sf .. O6_sf, one campaign, one fixed camera (see assets/PICK.md). WORK_DIR takes everything in between (scratch,
tools/engine/jobs/tabs-work). Output goes to components/jubako/assets/.

1. register: photo n (n = 1..5: the stack with n-1 tiers taken off) onto photo 1 by the bottom tier, which every
   photo shows. ECC on that band: photos 2-3 are a sub-pixel translation, 4-5 a small affine (the box was nudged;
   about 0.6 degrees and 18 px at 4000 px for the last one). A registration resample is the only change made to a pixel.
2. matte: BiRefNet via the asset engine (tools/engine/stages/matte.py), one cut-out per state.
3. seams: where tier i meets tier i+1. On the left face, the lowest row where photo i and photo i+1 differ (taking a
   tier off changes everything above its bottom edge and nothing below it); a robust line per seam, residual
   ~0.4 px. The front corner is the box's front edge, read off the photograph at x=1205 (crop px). On the right face
   the difference is smeared by the lower tier's bright rim, so each seam runs from its corner to the right vanishing
   point: on the horizon given by the five left lines (y = -2131), where the bottom edge meets it.
4. export, at half the crop's scale:
   tier-n.webp   tier n as photo n shows it (its inside open, nothing above it), cut off along its own bottom seam
                 with a one-pixel antialiased edge; the bottom tier whole.
   shadow.webp   the box's own shadow on the Met's backdrop: the photograph divided by a fitted background, under
                 the bottom edges only, as an alpha layer to lay under the box.
   geometry.json the frame, each part's place in it, the boundary lines (rim, four seams, bottom) for hit tests and
                 tab labels.
"""
import argparse, json, subprocess, sys
from pathlib import Path
import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
ASSETS = HERE.parent / 'assets'
ENGINE = HERE.parents[2] / 'tools' / 'engine'

CROP = (1000, 250, 2800, 2550)          # the box with margin, in the 4000x2662 originals
BAND = (2050, 2420, 1180, 2700)        # y0 y1 x0 x1: the bottom tier, common to all five photos
FRONT_X = 1205                         # the front vertical edge (crop px), read at the rim, every seam and the foot
RIM = (1205, 690)                      # tier 1's top rim, front corner (crop px)
SCALE = 0.5


def register(orig, work):
    import cv2
    src = lambda k: str(orig / f'40343-{k}.jpg')
    ref = cv2.imread(src(3)); H, W = ref.shape[:2]
    gr = cv2.cvtColor(ref, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255
    y0, y1, x0, x1 = BAND
    cv2.imwrite(str(work / 'reg-1.png'), ref)
    warps = {1: np.eye(2, 3).tolist()}
    for n, k in enumerate([4, 5, 6, 7], start=2):
        im = cv2.imread(src(k)); g = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255
        mode = cv2.MOTION_TRANSLATION if k in (4, 5) else cv2.MOTION_AFFINE
        w = np.eye(2, 3, dtype=np.float32)
        cc, w = cv2.findTransformECC(gr[y0:y1, x0:x1], g[y0:y1, x0:x1], w, mode,
                                     (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 300, 1e-7), None, 5)
        A = np.vstack([w, [0, 0, 1]]); T = np.array([[1, 0, x0], [0, 1, y0], [0, 0, 1]], float)
        F = (T @ A @ np.linalg.inv(T))[:2]
        out = cv2.warpAffine(im, F, (W, H), flags=cv2.INTER_LANCZOS4 + cv2.WARP_INVERSE_MAP,
                             borderMode=cv2.BORDER_REPLICATE)
        cv2.imwrite(str(work / f'reg-{n}.png'), out); warps[n] = F.tolist()
        print(f'register 40343-{k} -> state {n}: ecc {cc:.4f}')
    json.dump(warps, open(work / 'warps.json', 'w'), indent=1)
    for n in range(1, 6):
        Image.open(work / f'reg-{n}.png').crop(CROP).save(work / f'crop-{n}.png')


def matte(work):
    for n in range(1, 6):
        code = ("import sys; sys.path.insert(0, %r)\nfrom stages.matte import matte\nfrom pathlib import Path\n"
                "matte(Path(%r), Path(%r), proof_dir=Path(%r))" % (str(ENGINE), str(work / f'crop-{n}.png'),
                                                                   str(work / f'matte-{n}.png'), str(work / 'proofs')))
        subprocess.run(['uv', 'run', '--with', 'numpy', '--with', 'pillow', '--with', 'scipy', '--with', 'pyyaml',
                        'python', '-c', code], check=True)
        print('matte', n)


def linefit(X, Y):
    for _ in range(5):
        p = np.polyfit(X, Y, 1); r = Y - np.polyval(p, X); s = np.median(np.abs(r)) * 2.5 + 1
        k = np.abs(r) < s; X, Y = X[k], Y[k]
    return p, float(np.median(np.abs(r)))


def seams(work):
    from scipy import ndimage as ndi
    L = lambda p: np.asarray(Image.open(p).convert('RGB'), np.float32)
    A = lambda p: np.asarray(Image.open(p).getchannel('A'), np.float32) / 255
    imgs = [L(work / f'crop-{n}.png') for n in range(1, 6)]
    alph = [A(work / f'matte-{n}.png') for n in range(1, 6)]
    left = {}
    for k in range(1, 5):
        d = np.abs(imgs[k - 1] - imgs[k]).max(2)
        m = ndi.binary_opening(ndi.gaussian_filter(d, 3) > 40, iterations=3) & (alph[k - 1] > 0.5)
        ac = np.where((alph[k - 1] > 0.5).any(0))[0]
        xs, ys = [], []
        for x in range(ac.min() + 15, FRONT_X - 30, 3):
            c = np.where(m[:, x])[0]
            if len(c): xs.append(x); ys.append(c.max())
        left[k], res = linefit(np.array(xs), np.array(ys, float))
        print(f'seam {k}: left face y = {left[k][0]:.4f} x + {left[k][1]:.1f}, residual {res:.2f} px')
    # the bottom edges, from the bottom tier's silhouette
    a = alph[4] > 0.5; cols = np.where(a.any(0))[0]
    X = np.arange(cols.min() + 30, cols.max() - 30); Y = np.array([np.where(a[:, x])[0].max() for x in X], float)
    bl, _ = linefit(X[X < FRONT_X - 60], Y[X < FRONT_X - 60]); br, _ = linefit(X[X > FRONT_X + 60], Y[X > FRONT_X + 60])
    # left vanishing point: least squares through the four seams and the bottom-left edge
    ls = [left[k] for k in left] + [bl]
    M = np.array([[l[0], -1] for l in ls]); b = np.array([-l[1] for l in ls])
    VL = np.linalg.lstsq(M, b, rcond=None)[0]
    VR = np.array([(VL[1] - br[1]) / br[0], VL[1]])      # the bottom-right edge meets the horizon
    print('VL', VL.round(1), 'VR', VR.round(1))
    def line(cx, cy):
        return dict(c=[float(cx), float(cy)], l=float((VL[1] - cy) / (VL[0] - cx)), r=float((VR[1] - cy) / (VR[0] - cx)))
    lines = [line(*RIM)] + [line(FRONT_X, np.polyval(left[k], FRONT_X)) for k in range(1, 5)]
    # the bottom: the foot's own edges, meeting under the front corner
    fy = br[0] * FRONT_X + br[1]
    lines.append(dict(c=[float(FRONT_X), float(fy)], l=float(bl[0]), r=float(br[0])))
    json.dump(dict(VL=VL.tolist(), VR=VR.tolist(), lines=lines), open(work / 'seams-final.json', 'w'), indent=1)


def ly(L, x):
    x = np.asarray(x, float)
    return L['c'][1] + np.where(x < L['c'][0], L['l'], L['r']) * (x - L['c'][0])


def export(work):
    from scipy import ndimage as ndi
    S = json.load(open(work / 'seams-final.json')); lines = S['lines']
    rgba = [np.asarray(Image.open(work / f'matte-{n}.png').convert('RGBA'), np.float32) / 255 for n in range(1, 6)]
    H, W = rgba[0].shape[:2]
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    parts = []
    for n in range(1, 6):
        im = rgba[n - 1].copy()
        if n < 5:   # keep only what lies above this tier's own bottom seam, with a 1 px soft edge
            cov = np.clip(ly(lines[n], xx) - yy + 0.5, 0, 1)
            im[..., 3] *= cov
        parts.append(im)
    # the shadow on the backdrop, under the bottom edges only
    g = np.asarray(Image.open(work / 'crop-1.png').convert('RGB'), np.float32).mean(2)
    a1 = rgba[0][..., 3]
    far = ~ndi.binary_dilation(a1 > 0.05, iterations=120)
    sel = far & (yy % 7 == 0) & (xx % 7 == 0)
    X = np.stack([np.ones(sel.sum()), xx[sel], yy[sel], xx[sel] ** 2, yy[sel] ** 2, xx[sel] * yy[sel]], 1)
    cf = np.linalg.lstsq(X, g[sel], rcond=None)[0]
    Bg = cf[0] + cf[1] * xx + cf[2] * yy + cf[3] * xx ** 2 + cf[4] * yy ** 2 + cf[5] * xx * yy
    dark = np.clip(1 - g / Bg, 0, 1)
    # only the shadow the box itself casts: a band under the foot, fading over ~140 crop px (7 mm of floor), within
    # the foot's own width. The rest of the backdrop's shading (the Met's sweep, its vignette) stays behind.
    d = yy - ly(lines[5], xx)
    below = np.clip((d + 40) / 30, 0, 1) * np.clip(1 - np.maximum(d, 0) / 140, 0, 1) ** 1.5
    fa = np.where(a1 > 0.5)
    xl, xr = fa[1].min(), fa[1].max()
    side = np.clip((xx - (xl - 30)) / 50, 0, 1) * np.clip(((xr + 30) - xx) / 50, 0, 1)
    shadow = dark * below * side * (1 - (a1 > 0.02))
    shadow = np.where(a1 > 0.02, 0, shadow)
    # under the box itself the floor is hidden: fill it so the layer has no hole where the cut-out's edge is soft
    shadow = np.maximum(shadow, ndi.grey_erosion(ndi.grey_dilation(shadow, size=5), size=5) * (a1 > 0.02))
    shadow = ndi.gaussian_filter(shadow, 1.0)
    shadow[shadow < 0.012] = 0
    # the frame: every part, the shadow, a margin
    occ = np.zeros((H, W), bool)
    for p in parts: occ |= p[..., 3] > 0.01
    occ |= shadow > 0.02
    ys, xs = np.where(occ)
    fx0, fy0, fx1, fy1 = xs.min() - 6, ys.min() - 6, xs.max() + 7, ys.max() + 7
    fw, fh = round((fx1 - fx0) * SCALE), round((fy1 - fy0) * SCALE)
    ASSETS.mkdir(exist_ok=True)
    geo = dict(source='The Met 40343, additional images 3-7 (one campaign, one camera)', scale=SCALE,
               frame=[fw, fh], crop=list(CROP), parts=[], lines=[])
    def save(arr, name, q=90):
        a = arr[..., 3] if arr.ndim == 3 else arr
        ys, xs = np.where(a > 0.004)
        x0, y0, x1, y1 = xs.min() - 2, ys.min() - 2, xs.max() + 3, ys.max() + 3
        # snap the box to the export grid so the part lands on whole px of the frame
        X0 = int(np.floor((x0 - fx0) * SCALE)); Y0 = int(np.floor((y0 - fy0) * SCALE))
        X1 = int(np.ceil((x1 - fx0) * SCALE)); Y1 = int(np.ceil((y1 - fy0) * SCALE))
        sx0, sy0 = fx0 + X0 / SCALE, fy0 + Y0 / SCALE
        sub = arr[int(sy0):int(sy0 + (Y1 - Y0) / SCALE), int(sx0):int(sx0 + (X1 - X0) / SCALE)]
        if arr.ndim == 3:
            pre = sub.copy(); pre[..., :3] *= pre[..., 3:4]            # resize premultiplied: no dark fringe
            img = Image.fromarray((np.clip(pre, 0, 1) * 255 + .5).astype(np.uint8), 'RGBA')
            img = img.resize((X1 - X0, Y1 - Y0), Image.LANCZOS)
            o = np.asarray(img, np.float32) / 255
            o[..., :3] = np.where(o[..., 3:4] > 0, o[..., :3] / np.maximum(o[..., 3:4], 1e-4), 0)
            img = Image.fromarray((np.clip(o, 0, 1) * 255 + .5).astype(np.uint8), 'RGBA')
            img.save(ASSETS / name, 'WEBP', quality=q, method=6, alpha_quality=100)
        else:
            Lc = Image.fromarray((np.clip(sub, 0, 1) * 255 + .5).astype(np.uint8), 'L').resize((X1 - X0, Y1 - Y0), Image.LANCZOS)
            img = Image.merge('RGBA', [Image.new('L', Lc.size, 0)] * 3 + [Lc])
            img.save(ASSETS / name, 'WEBP', quality=q, method=6, alpha_quality=90)
        print(name, img.size, (ASSETS / name).stat().st_size // 1024, 'KB')
        return [X0, Y0, X1 - X0, Y1 - Y0]
    geo['shadow'] = save(shadow, 'shadow.webp')
    for n, p in enumerate(parts, 1):
        geo['parts'].append(save(p, f'tier-{n}.webp'))
    for L in lines:
        geo['lines'].append(dict(c=[round((L['c'][0] - fx0) * SCALE, 2), round((L['c'][1] - fy0) * SCALE, 2)],
                                 l=round(L['l'], 5), r=round(L['r'], 5)))
    # the inside of the top tier: rim front corner to the far corner, for the lift
    a = rgba[0][..., 3] > 0.5
    top = np.where(a.any(1))[0].min()
    geo['opening'] = round((RIM[1] - top) * SCALE, 1)
    # the box's right and left edges at each boundary line (frame px), for labels beside the tiers
    xs = np.where(a.any(0))[0]
    geo['right_x'] = round((xs.max() - fx0) * SCALE, 1); geo['left_x'] = round((xs.min() - fx0) * SCALE, 1)
    json.dump(geo, open(ASSETS / 'geometry.json', 'w'), indent=1)
    print(json.dumps({k: geo[k] for k in ('frame', 'shadow', 'parts', 'opening', 'right_x', 'left_x')}))


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('orig', type=Path); ap.add_argument('work', type=Path)
    ap.add_argument('--steps', default='register,matte,seams,export')
    a = ap.parse_args(); a.work.mkdir(parents=True, exist_ok=True)
    for s in a.steps.split(','):
        {'register': lambda: register(a.orig, a.work), 'matte': lambda: matte(a.work),
         'seams': lambda: seams(a.work), 'export': lambda: export(a.work)}[s]()
