"""Stage 3: masks, fills and the four layers at work resolution.

  base    everything that never moves (block, plates, anvil, back post, both cheeks, the far plate of the trunnion,
          the spring's screwed plate), with what the moving parts can uncover filled from the photograph's own pixels:
          the wood under the spring's sweep from the block's own top face, and the top of the back post's dome, which
          the back screw's tip hides, from the dome just below it
  spring  the flat spring's free part; it turns about the end of its plate so its tip follows the lever
  lever   the lever and everything on it, with the front thumbscrew raised PLAY_MM along its own thread
  cheek   the near cheek's top and the pin's nut, drawn over the lever's lug

At rest the four composite to the photograph, except the raised screw. Wherever two layers meet at a cut (not at the
key's own outline against the museum's sweep), the layer behind runs on under the one in front for MARGIN px, with
pixels it could plausibly have there, so that no daylight opens at the joint once the layers are resized for the web
and scaled again by the browser, and none opens as the parts turn. Writes WORK/L-*.png and WORK/layers.json.
"""
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from common import *
import parts as P

PLAY_MM = float(os.environ.get('TK_PLAY_MM', 1.4))   # the gap set at the platina points: an operator's setting
MARGIN = 28            # work px a layer runs on under the one in front of it (one display pixel of the smallest key
                       # is about 32 work px; the lever's lug rises at most 12 px out of the cheek)
work_dir()
C = load(f'{WORK}/work.png')
K = load(f'{WORK}/key.png', 'RGBA')
F, A = K[..., :3], K[..., 3]
H, W = A.shape
L = C.mean(2)
rows = np.arange(H)[:, None]
cols = np.arange(W)[None, :]
solid = A > 0.999


def poly(loop):
    im = Image.new('L', (W, H), 0)
    ImageDraw.Draw(im).polygon([tuple(map(float, p)) for p in loop], fill=255)
    return np.asarray(im) > 127


def interp(line, xs):
    return np.interp(xs, [p[0] for p in line], [p[1] for p in line])


def livewire(xs, guide, strength, reach=14, lam=0.35, step=2):
    """the cheapest smooth path y(x) through -strength within guide +/- reach (one row per column)"""
    n, R = len(xs), 2 * reach + 1
    cost = np.full((n, R), np.inf)
    back = np.zeros((n, R), int)
    ys = np.round(guide).astype(int)[:, None] + np.arange(-reach, reach + 1)[None]
    s = np.array([[-strength[min(max(y, 0), H - 1), x] for y in row] for x, row in zip(xs, ys)])
    cost[0] = s[0]
    for i in range(1, n):
        for j in range(R):
            lo, hi = max(0, j - step), min(R, j + step + 1)
            # guide rows shift between columns: compare absolute rows
            prev = cost[i - 1, lo:hi] + lam * np.abs(ys[i - 1, lo:hi] - ys[i, j])
            k = int(np.argmin(prev))
            cost[i, j] = prev[k] + s[i, j]
            back[i, j] = lo + k
    j = int(np.argmin(cost[-1]))
    out = np.zeros(n, int)
    for i in range(n - 1, -1, -1):
        out[i] = ys[i, j]
        j = back[i, j]
    return out


# --- the motion first: everything below is sized for it -------------------------------------------------------------
pivot = (2556.0, 655.0)
contact = (2177.0, float(P.FRONT_CONTACT_Y))
r_c = float(np.hypot(contact[0] - pivot[0], contact[1] - pivot[1]))
dpx = PLAY_MM * PX_PER_MM * WS                    # the play in work px
D = int(round(dpx))
theta = D / r_c                                   # radians, front down: the point travels exactly the raise
tip, root = P.SPRING_TIP, P.SPRING_ROOT
dl = theta * abs(tip[0] - pivot[0])               # the lever's drop where the spring bears on it
spring_rot = dl / abs(tip[0] - root[0])

# --- the spring --------------------------------------------------------------------------------------------------
Lb = ndi.gaussian_filter(L, 1.0)
down = np.zeros_like(Lb); down[2:-2] = Lb[4:] - Lb[:-4]            # brighter below: the top edge of the brass
up = -down                                                          # darker below: its bottom edge
X0, XT, XB = P.SPRING_ROOT[0], 1330, 1440      # its top edge leaves the block's face at XT, its lower edge at XB
xs = np.arange(X0, XB + 1)
top_g = interp(P.SPRING_LINE, xs)
thick = np.interp(xs, [650, 900, 1100, 1250, 1330, 1440], [30, 42, 42, 50, 54, 56])
top = livewire(xs, top_g, down)
bot = livewire(xs, top + thick, up)
# where its top edge is against the sweep (above the block's far edge) the key's own alpha says where it is
for i, x in enumerate(xs):
    col = np.nonzero(A[int(top_g[i]) - 25:int(top_g[i]) + 25, x] > 0.02)[0]
    if len(col):
        t0 = int(top_g[i]) - 25 + col[0]
        if t0 < 893:
            top[i] = t0
# From the root to x 995 that edge is the top of the spring's front face (the bright line along it): above it lies the
# spring's top surface, seen from a little above, worn brass and dark patina up to its far edge on the red-brown wood.
# That far edge is the spring's top here, so the whole strip turns with it, not just its front.
C255 = C * 255
spr = ndi.gaussian_filter((C255[..., 1] - 0.85 * C255[..., 0]) + 0.1 * (C255.mean(2) - 60), 1.2)
into = np.zeros_like(spr); into[2:-2] = spr[4:] - spr[:-4]          # spring below, wood above
xs2 = np.arange(X0, P.SPRING_FAR_EDGE[-1][0] + 1)
far = livewire(xs2, interp(P.SPRING_FAR_EDGE, xs2), into, reach=6)
top[:len(xs2)] = np.minimum(top[:len(xs2)], far)
lever_loop = poly(P.PARTS['lever'])
corr = np.zeros((H, W), bool)                    # beyond XT it is against the sweep: a corridor, and the key's alpha
for x in range(XT + 1, 2061):
    t = int(np.interp(x, [p[0] for p in P.SPRING_LINE], [p[1] for p in P.SPRING_LINE]))
    end = t + 70                                  # up to XB its lower edge is on the block's face (cut below, at b)
    if x > XB:
        # beyond, down to its own lower edge (the first row of sweep below it), so its soft fringe goes with it and
        # is never left behind, and never into the wood: the block's far edge is row 893 here
        body = np.nonzero((A[t - 40:t + 60, x] > 0.5) & ~lever_loop[t - 40:t + 60, x])[0]   # the spring, not the lever
        if len(body):
            r0 = t - 40 + int(body[0])
            below = np.nonzero(A[r0:r0 + 140, x] < 0.02)[0]
            # no sweep below it: its lower edge lies on the far edge itself, so it runs down to the wood
            end = r0 + int(below[0]) if len(below) else 893
        end = min(end, 893)
    corr[t - 120:end, x] = True                   # up to the lever: its loop cuts the top where the spring bears on it
spring = np.zeros((H, W), bool)
for x, t, b in zip(xs, top, bot):
    if x <= XT:
        spring[t:b + 2, x] = True                 # +1: keep the bright lower lip with the spring
    else:
        corr[b + 2:, x] = False                   # its lower edge is still on the block's face up to XB
spring |= corr & ~lever_loop
spring &= A > 0

# --- masks -------------------------------------------------------------------------------------------------------
fsu = poly(P.PARTS['fscrew_u']) & (A > 0)
fsl = poly(P.PARTS['fscrew_l']) & (A > 0)
# the screw's own soft edges beside its polygon: between the collar and the nut's far corners only the screw and the
# sweep are there, and under the lever only the screw's thread and point, so the screw takes them all (else its old
# outline would stay behind when it is raised)
band = np.zeros((H, W), bool); band[196:256, 2125:2261] = True
fsu |= band & (A > 0)
band = np.zeros((H, W), bool); band[560:624, 2128:2232] = True
fsl |= band & (A > 0) & (A < 0.999) & ~fsu
cheek = poly(P.PARTS['cheek'])
cheek_top_line = interp(P.CHEEK_TOP, np.arange(W))
ch = cheek & (rows <= cheek_top_line[None, :] + 60)                  # the occluder: the cheek's top and the nut
lever = lever_loop & ~fsu & ~fsl & ~spring & (A > 0)
moving = (lever_loop | fsu | fsl | spring) & ~cheek
# the base is every pixel that never moves, the cheek's too: where the cheek layer's cut edges lie over it, the base
# under them is the same photograph, so the cut never shows
base = (A > 0) & ~moving & ~(ch & ~solid)        # (not at the cheek's soft edge, where both would count)

# --- the back screw's tip and the post's dome ----------------------------------------------------------------------
# The screw is cut at its own rounded tip. The top of the dome it rests on is hidden behind that tip in the
# photograph; when the back of the lever rises, the dome's top shows. Its outline is the circle its visible shoulders
# fit. It lies in the screw's shadow, as the rows just under the tip do, so each column carries on up with those rows'
# own colour (the mean of the first three under the tip), and the dome reads as one piece.
cx, cy, cr = P.DOME
nb_x = np.arange(int(P.NECK_BOTTOM[0][0]), int(np.ceil(P.NECK_BOTTOM[-1][0])) + 1)
cap = np.zeros((H, W), np.float32)               # coverage of the dome's restored top
Fb = F.copy()
# the shade under the tip, column by column, smoothed along the row so the restored top has no streaks
y_ends = {}
for x in nb_x:
    tipcol = np.nonzero(moving[575:630, x])[0]
    if len(tipcol):
        y_ends[x] = 575 + int(tipcol.max())
shade_x = np.array([C[y_ends[x] + 1:y_ends[x] + 4, x].mean(0) if x in y_ends else np.full(3, np.nan) for x in nb_x])
for k in range(3):
    v = shade_x[:, k]; ok = ~np.isnan(v)
    v = np.interp(np.arange(len(v)), np.nonzero(ok)[0], v[ok])
    shade_x[:, k] = ndi.gaussian_filter1d(v, 3.0, mode='nearest')
for x in nb_x:
    u = x - cx
    if abs(u) >= cr:
        continue
    yc = cy - np.sqrt(cr * cr - u * u)            # the dome's outline in this column
    tipcol = np.nonzero(moving[575:630, x])[0]
    if not len(tipcol):
        continue
    y_end = 575 + int(tipcol.max())               # the tip's last row, as the lever's loop is drawn
    y_top = int(np.floor(yc))
    if y_top > y_end or not base[y_end + 1, x]:
        continue
    shade = shade_x[x - nb_x[0]]                  # the dome just under the tip, in its shadow
    for y in range(y_top, y_end + 1):
        cov = float(np.clip(y + 1 - yc, 0, 1))
        if cov <= 0 or not solid[y, x]:           # only behind the tip itself, never in the white notches
            continue
        cap[y, x] = cov
        Fb[y, x] = shade
cap_m = cap > 0
base |= cap_m

# --- the base runs on under the lever's cut edges ------------------------------------------------------------------
# Where the lever's cut meets a fixed part (the far plate under the lever's block), the base continues under the
# lever for MARGIN px with that part's own nearest pixels, so the joint stays closed when the two are resized
# separately. The lever only ever moves across these from the outside (its block goes down over the far plate), so
# the margin never shows. Not at the front point (a gap there at rest) or the back screw's tip (the dome is restored
# there), and not under the cheek, where the base is already the photograph.
static_out = base & solid & ~cap_m & ~cheek
movers = (lever | fsu | fsl) & solid
no_margin = np.zeros((H, W), bool)
no_margin[540:640, 2120:2240] = True              # the front point and the anvil
no_margin[575:625, 2825:2910] = True              # the back screw's tip and the dome (restored above)
joint = movers & ndi.binary_dilation(static_out, iterations=1) & ~no_margin
dist, (iy, ix) = ndi.distance_transform_edt(~static_out, return_indices=True)
base_margin = movers & ~no_margin & ~cheek & ~fsu & ~fsl & (dist <= MARGIN) & \
    ndi.binary_dilation(joint, iterations=MARGIN)
Fb[base_margin] = C[iy[base_margin], ix[base_margin]]
jy, jx = np.nonzero(joint)
if len(jx):
    print(f'base runs on under the lever at {len(jx)} joint px: x {jx.min()}..{jx.max()}, y {jy.min()}..{jy.max()}')

# --- the wood under the spring's sweep -------------------------------------------------------------------------------
Ab = np.where(base, A, 0.0)
Ab[cap_m] = cap[cap_m]
Ab[base_margin] = 1.0
# the block's top face begins at its far edge (measured either side of the spring: row 894 at x 700, 893 from 1020)
far_edge = np.interp(np.arange(W), [700, 1020], [894, 893])[None, :]
foot = spring & (rows >= far_edge)                # where the spring lies over the block's top face
near = []                                         # columns too near the far edge to clone from above
for x in np.nonzero(foot.any(0))[0]:
    ys = np.nonzero(foot[:, x])[0]
    t, b = ys.min(), ys.max()
    h = b + 1 - t
    k = min(h, int(t - far_edge[0, x]) - 4)       # the wood just above it, as much as there is
    if k >= 12:                                   # clone that down, same column, so the grain runs on (repeated if
        Fb[t:b + 1, x] = C[t - k - 2 + np.arange(h) % k, x]   # the spring is taller than the wood above it)
    else:
        near.append(x)
    Ab[t:b + 1, x] = 1.0
# the spring's soft top edge where it crosses the far edge is against the sweep, not the wood
Ab[foot & (A < 0.999) & (rows < far_edge + 2)] = 0.0
# near the far edge: each covered run of a row takes the same length of that row just to its left (a translation along
# the grain, never a stretch)
nearm = np.zeros((H, W), bool)
nearm[:, near] = True
nearm &= foot
for y in np.nonzero(nearm.any(1))[0]:
    xr = np.nonzero(nearm[y])[0]
    for run in np.split(xr, np.nonzero(np.diff(xr) > 1)[0] + 1):
        xa, xb = run[0], run[-1]
        n = xb - xa + 1
        s0 = xa - n - 2
        while s0 > X0 and (spring[y, s0:s0 + n].any() or (A[y, s0:s0 + n] < 0.999).any()):
            s0 -= 1
        Fb[y, xa:xb + 1] = C[y, s0:s0 + n]
# where the spring's lower edge lies right on the block's far edge (x 1441..1467) the wood runs on two rows up under
# it, so that joint stays closed when resized (when the spring turns down, two rows of wood show there: 0.3 px at the
# largest size)
for x in range(XB + 1, 1468):
    if spring[891:893, x].all() and solid[891:894, x].all():
        Fb[891:893, x] = C[893, x]
        Ab[891:893, x] = 1.0
# at its root the spring is the same brass as the plate it is screwed by: there the base keeps the spring itself (it
# turns there by less than a pixel), so the cut across the root never shows wood
root_keep = spring & (cols >= X0) & (cols < X0 + 40)
Fb[root_keep] = C[root_keep]
Ab[root_keep] = A[root_keep]

# --- the raised front thumbscrew ---------------------------------------------------------------------------------
nut_top = interp(P.NUT_TOP, np.arange(W))
# the thread's pitch, from the visible shank between the collar and the lock nut (sub-pixel)
strip = L[200:276, 2160:2232].mean(1)
strip = strip - strip.mean()
ks = np.arange(8, 24)
ac = np.array([np.dot(strip[:-k], strip[k:]) / (len(strip) - k) for k in ks])
i = int(np.argmax(ac))
off = 0.5 * (ac[i - 1] - ac[i + 1]) / (ac[i - 1] - 2 * ac[i] + ac[i + 1]) if 0 < i < len(ks) - 1 else 0.0
pitch = float(ks[i] + off)
n_pitch = int(np.ceil((D + 2) / pitch))           # whole pitches the new rows are taken from (they repeat every pitch)
print(f'raise {D} px ({dpx:.2f}); thread pitch {pitch:.2f} px ({pitch / WS / PX_PER_MM:.2f} mm, '
      f'{25.4 * WS * PX_PER_MM / pitch:.0f} tpi); new thread from {n_pitch} pitch(es) higher')


def lift(mask):
    """the screw as photographed, premultiplied, moved up D rows"""
    pm = np.dstack([F * (A * mask)[..., None], A * mask])
    out = np.zeros_like(pm)
    out[:-D] = pm[D:]
    return out


S = lift(fsl) + lift(fsu)
# rows the raise opens in the shank (just above the nut, where the screw comes up out of it): the same screw n_pitch
# pitches higher, since a thread repeats every pitch
PMs = np.dstack([F * (A * fsu)[..., None], A * fsu])
CLEAN = 256                                       # above this row the shank stands clear of the nut's far corners
filled = 0
for x in range(2125, 2261):
    for y in range(CLEAN - D, int(nut_top[x]) + 3):    # (the nut, drawn over it, covers the last rows)
        # every row whose lifted source would reach down among the nut's corners, at the thread's full width: the
        # same thread n_pitch pitches higher (its outline follows the thread, since the whole pitch is taken)
        k = max(n_pitch, int(np.ceil((y + D + 2 - CLEAN) / pitch)))   # whole pitches, enough to clear the corners
        ys = y + D - k * pitch
        y0 = int(np.floor(ys)); f = ys - y0
        S[y, x] = PMs[y0, x] * (1 - f) + PMs[y0 + 1, x] * f
        filled += 1
print(f'shank rows filled: {filled} px')

# --- the lever's lug runs on under the cheek -------------------------------------------------------------------------
# The cheek stands in front of the lug. Right of the pin the lug rises as the front goes down (up to (x - pin)·θ px),
# so what comes out from behind the cheek's top is more of the lug: each column of it carries on down, the lug's own
# row just above the cut repeated (its brass is brushed up and down). Left of the pin it only goes deeper behind the
# cheek. The margin stays clear of the cheek's soft right edge, where it would show through.
def turned(y, x, t=1.0):
    """where a lever pixel goes at full press (t = 1): turned about the pin, front down"""
    a = theta * t
    dx, dy = x - pivot[0], y - pivot[1]
    return pivot[1] - dx * np.sin(a) + dy * np.cos(a), pivot[0] + dx * np.cos(a) + dy * np.sin(a)


LUG_RIGHT = 2722                                  # the lug's right edge, straight down behind the cheek
soft_cheek = cheek & ~solid
far_from_soft = ndi.distance_transform_edt(~soft_cheek) > 2
hidden = ch & solid & far_from_soft
lug_margin = hidden & (rows > cheek_top_line[None, :]) & (rows <= cheek_top_line[None, :] + MARGIN) & \
    (cols <= LUG_RIGHT) & ~lever & ~fsu & ~fsl & ~spring
# keep only what stays behind the cheek, or comes out where the lug itself was, all the way down
yy, xx = np.nonzero(lug_margin)
for t in (0.5, 1.0):
    ty, tx = turned(yy, xx, t)
    ty = np.clip(np.round(ty).astype(int), 0, H - 1); tx = np.clip(np.round(tx).astype(int), 0, W - 1)
    ok = hidden[ty, tx] | lever_loop[ty, tx]
    lug_margin[yy[~ok], xx[~ok]] = False
src_y = np.clip(np.floor(cheek_top_line).astype(int) - 3, 0, H - 1)
Fl = F.copy()
yy, xx = np.nonzero(lug_margin)
Fl[yy, xx] = C[src_y[xx], xx]
lever_a = A * lever
lever_a[lug_margin] = 1.0
need = theta * (np.array(P.CHEEK_TOP)[:, 0].max() - pivot[0])
print(f'lug margin {MARGIN} px under the cheek; the lug rises at most {need:.1f} px out of it')

# lever layer = the screw under everything else on the lever (the nut and the block cover it)
Lv = np.dstack([Fl * lever_a[..., None], lever_a])
out_a = Lv[..., 3:] + S[..., 3:] * (1 - Lv[..., 3:])
out_c = Lv[..., :3] + S[..., :3] * (1 - Lv[..., 3:])
lever_rgba = np.dstack([out_c / np.maximum(out_a, 1e-4), out_a])

# --- the spring runs on under the lever where it bears on it ----------------------------------------------------------
# The two turn about different centres, so near the tip the spring drops a few px more than the lever. Under the
# lever's edge the spring carries on upward: its own top rows moved up the column.
EXT = 16
Fs = F.copy()
spring_ext = np.zeros((H, W), bool)
for x in range(XT + 1, 2061):
    st = np.nonzero(spring[400:1100, x])[0]
    if not len(st):
        continue
    st = 400 + int(st[0])                         # the spring's top row in this column
    if not (lever[st - 1, x] and solid[st - 1, x] and solid[st, x]):
        continue                                  # not touching the lever here: its own soft edge, against the sweep
    band = lever[st - EXT:st, x] & solid[st - EXT:st, x]
    spring_ext[st - EXT:st, x] = band
    Fs[st - EXT:st, x] = C[min(st + 2, H - 1), x]  # its own top row, carried on up under the lever
spring_a = A * spring
spring_a[spring_ext] = 1.0
spring_rgba = np.dstack([Fs, spring_a])
cheek_rgba = np.dstack([F, A * ch])
base_rgba = np.dstack([Fb, Ab])

for nm, im in dict(base=base_rgba, spring=spring_rgba, lever=lever_rgba, cheek=cheek_rgba).items():
    save(f'{WORK}/L-{nm}.png', im)

jsave('layers.json', dict(play_mm=PLAY_MM, raise_px=D, pitch_px=pitch, pivot=pivot, contact=contact, r_c=r_c,
                          lever_deg=float(np.degrees(theta)), spring_root=root, spring_deg=float(np.degrees(spring_rot)),
                          margin_px=MARGIN, spring_edges=dict(x=xs.tolist(), top=top.tolist(), bot=bot.tolist())))
print(f'lever turns {np.degrees(theta):.3f} deg about {pivot}; spring {np.degrees(spring_rot):.3f} deg about {root}')
print(f'finger plate travel {theta * 2048:.0f} work px ({theta * 2048 / (PX_PER_MM * WS):.1f} mm); back screw lifts '
      f'{theta * (cx - pivot[0]):.1f} px off its post')
