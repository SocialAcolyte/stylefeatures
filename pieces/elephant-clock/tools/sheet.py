"""Stage 1: cut the folio off the Met's mount and model its paper.

Outputs (WORK): sheet_alpha.png (the sheet's own torn outline, 1.5 px soft), paper_env.npy (the paper's
local bright envelope, used to tell paint from paper), sheet_check.jpg.
"""
import numpy as np, cv2
from scipy import ndimage as ndi
from common import *

img = load(MAIN)
H, W, _ = img.shape
# The mount: a flat light cream, measured in the corners.
corners = np.concatenate([img[:30, :30].reshape(-1, 3), img[:30, -30:].reshape(-1, 3),
                          img[-30:, :30].reshape(-1, 3), img[-30:, -30:].reshape(-1, 3)])
bg = np.median(corners, 0)
d = np.sqrt(((img - bg) ** 2).sum(2))
print('mount', (bg * 255).round(), 'spread', (corners.std(0) * 255).round(1))
# Anything clearly unlike the mount is sheet; grow from the centre so specks on the mount are ignored.
lab = cv2.GaussianBlur(d, (0, 0), 1.2)
core = lab > .055
core = ndi.binary_opening(core, iterations=2)
labs, n = ndi.label(core)
big = labs == np.argmax(np.bincount(labs.ravel())[1:]) + 1
big = ndi.binary_fill_holes(big)
big = ndi.binary_closing(big, iterations=3)
big = ndi.binary_fill_holes(big)
# soft edge: signed distance, 1.5 px ramp
inside = ndi.distance_transform_edt(big)
outside = ndi.distance_transform_edt(~big)
sd = inside - outside
alpha = np.clip(sd / 1.5 + .5, 0, 1)
save(f'{WORK}/sheet_alpha.png', alpha)
ys, xs = np.nonzero(big)
print('sheet bbox', xs.min(), ys.min(), xs.max(), ys.max())

# Paper envelope: the paper's own local bright level (ignoring paint and ink), 61 px windows.
L = lum(img)
paperish = (chroma(img) < .32) & big
Lp = np.where(paperish, L, 0)
env = ndi.maximum_filter(ndi.percentile_filter(Lp[::4, ::4], 80, size=9), size=5)
env = cv2.resize(env, (W, H), interpolation=cv2.INTER_CUBIC)
env = cv2.GaussianBlur(env, (0, 0), 20)
np.save(f'{WORK}/paper_env.npy', env.astype(np.float32))
chk = img.copy()
chk[~big] = chk[~big] * .3 + np.array([.2, .4, .9]) * .7
save(f'{WORK}/sheet_check.jpg', cv2.resize(chk, (W // 4, H // 4)))
