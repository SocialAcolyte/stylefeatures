# /// script
# dependencies = ["pillow", "numpy"]
# ///
"""The parts the rolls are made of, from Cleveland's own photographs of 1964.94, all at the scale of the sections.

- backing.webp: the scroll's own blank end paper (alt11), with its silk edges, the outside of each roll. Cleveland did
  not photograph the back of the mounting; this is the nearest real paper of this mounting.
- ribbon.webp: the scroll's ribbon, cut from the photograph of the closed scroll (alt18) where it leaves the stave,
  turned half a turn so it trails from the right-hand roll. A rigid cut-out: nothing bent or redrawn.
- the light across a roll: measured from the same photograph of the closed scroll (rows below the title slip), as a
  profile across the roll's width, normalised on the line that faces the camera (that line lies like the flat paper).
- the roll's build: the closed scroll is 901 px across in alt18 against 5312 px of height, so 768 px against the
  scan's 4523; with 72,000 px of scroll that gives the thickness of one turn.

usage: uv run rolls.py <src dir with alt11/alt18 TIFFs and roll_profile.json> <ribbon cut-out png> <assets dir>
"""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image

SRC, RIBBON, OUT = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
sec = json.load(open(OUT / "sections.json"))
size = sec["sizes"]["1600"]; s = size["scale"]; band = sec["source"]["band"]
edge_top, edge_bot = size["edge"]                         # scroll edges in the 1600 band
H_scan = (edge_bot - edge_top) / s                        # scroll height edge to edge, scan px (~4523)

# ── backing: alt11's blank end paper, same camera scale as the scan (4524 vs 4523 px edge to edge) ──
a11 = Image.open(SRC / "1964.94_alt11_full.tif")
lum = np.asarray(a11.convert("L")).astype(np.float32) / 255
rows = np.where(lum[:, 1200:3600].mean(1) > 0.3)[0]
t11, b11 = int(rows.min()), int(rows.max())
y_from = t11 - (edge_top / s + band[0] - band[0])         # align the paper's top edge with the sections' top edge
y0 = int(round(t11 - edge_top / s)); y1 = y0 + (band[1] - band[0])
strip = a11.crop((620, y0, 3880, y1)).resize((round(3260 * s), 1600), Image.LANCZOS)
a = np.asarray(strip).astype(np.float32) / 255
l = a @ np.array([0.2126, 0.7152, 0.0722], np.float32)
h, w = l.shape
top = np.argmax(l > 0.32, axis=0).astype(np.float32); bot = (h - 1 - np.argmax((l > 0.32)[::-1], axis=0)).astype(np.float32)
top = np.full(w, np.median(top)); bot = np.full(w, np.median(bot))
r = np.arange(h, dtype=np.float32)[:, None]
alpha = np.clip(r - top[None] + 0.5, 0, 1) * np.clip(bot[None] - r + 0.5, 0, 1)
for k in range(3):                                         # no black fringe in the edge rows
    a[int(top[0]) + k] = a[int(top[0]) + 4]; a[int(bot[0]) - k] = a[int(bot[0]) - 4]
Image.fromarray((np.dstack([a, alpha]) * 255 + 0.5).astype(np.uint8), "RGBA").save(OUT / "backing.webp", quality=86, method=6)
print("backing", w, h, "edges", top[0], bot[0], "(sections:", edge_top, edge_bot, ")")

# ── ribbon: alt18 cut-out, alt18 px -> scan px (x 4523/5312) -> band px, then half a turn ──
prof = json.load(open(SRC / "roll_profile.json"))
roll_h18 = prof["roll_rows"][1] - prof["roll_rows"][0]
k18 = H_scan / roll_h18                                     # alt18 px -> scan px
rib = Image.open(RIBBON)                                    # crop of alt18 at x 600..1842, y 1900..5400
k = k18 * s
rib_l = rib.resize((round(rib.width * k), round(rib.height * k)), Image.LANCZOS)
rib_l.save(OUT / "ribbon-left.webp", quality=88, method=6)   # as it lies beside the closed scroll in alt18
rib_s = rib_l.rotate(180)
rib_s.save(OUT / "ribbon.webp", quality=88, method=6)
# the root: where the ribbon leaves the stave, at the crop's right edge (the roll's silhouette), y 2955 in alt18
root_y18 = 2955
root_in_crop = (rib.width, root_y18 - 1900)
root = (rib_s.width - root_in_crop[0] * k, rib_s.height - root_in_crop[1] * k)   # after the half turn: left edge
root_v = (root_y18 - prof["roll_rows"][0]) / roll_h18      # 0..1 down the roll in alt18
print("ribbon", rib_s.size, "root px", root, "root v", round(root_v, 3))

# ── light across a roll: measured on the photograph of this scroll rolled up (alt18), every third row, at fine
#     steps near the edges, leaving out the title slip and the stave fold (real lines, not light) and the last edge
#     pixel (half table). Cleveland's light comes from the left: the left flank is brighter than the crown, the right a
#     little darker. Smoothed along the roll's width and scaled so the brightest part is the flat paper's brightness. ──
lum18 = np.asarray(Image.open(SRC / "1964.94_alt18_full.tif").convert("L")).astype(np.float32) / 255
pl, pr = np.array(prof["left_fit"]), np.array(prof["right_fit"]); ry0, ry1 = prof["roll_rows"]
T = np.linspace(-0.985, 0.985, 133); acc = np.zeros_like(T); cnt = np.zeros_like(T)
xs = np.arange(lum18.shape[1])
for y in range(ry0 + 40, ry1 - 40, 3):
    xl, xr = np.polyval(pl, y), np.polyval(pr, y); c, hw = (xl + xr) / 2, (xr - xl) / 2
    ok = ~((T > -0.58) & (T < -0.42)) & ~((y < 4100) & (T > -0.42) & (T < 0.27))
    v = np.interp(c + T * hw, xs, lum18[y]); acc[ok] += v[ok]; cnt[ok] += 1
prof_t = np.where(cnt > 0, acc / np.maximum(cnt, 1), np.nan)
good = ~np.isnan(prof_t); prof_t = np.interp(T, T[good], prof_t[good])
kern = np.exp(-0.5 * (np.linspace(-3, 3, 31)) ** 2); kern /= kern.sum()
sm = np.convolve(np.pad(prof_t, 15, mode="edge"), kern, mode="valid")
tt = np.linspace(-1, 1, 33); fit = np.interp(tt, T, sm); fit = fit / fit.max()
print("light t -1..1:", [round(float(v), 3) for v in fit])

# ── the build of the scroll: closed diameter -> thickness of a turn ──
D_closed = 901 * k18                                         # scan px (~768)
# Cleveland's alt12 is the whole mounting in one stitch (79145 x 4440), at the scan's own horizontal scale: its silk
# separators fall 4121 px further along than the scan's, 48836 against 48820 px apart. So it measures the parts the
# full scan leaves out: 9034 px before its right edge (the rest of the white silk, the gold-flecked strip and the
# damask, up to the stave), and at least 4121 px of blank end paper after its left end (alt12 ends on it).
L_unscanned = 9034
L_end = 4121
L_total = sec["source"]["width"] + L_unscanned + L_end
d_roller = 200                                               # the roller inside, ~1.3 cm (flush ends; not photographed)
d_stave = 150                                                # the stave, ~1 cm across
t_turn = np.pi * (D_closed ** 2 - d_roller ** 2) / (4 * L_total)
print("closed D", round(D_closed), "scan px; total length", L_total, "; one turn", round(float(t_turn), 2), "scan px")

# ── the paper's own edges along the scroll (the scan drifts ~40 px over its length): each roll is set on the paper's
#     edge where it touches, so neither shows past the other. Read from the sections' alpha, every 32 px of the band ──
cols_top, cols_bot = [], []
for secj in reversed(sec["sections"]):                      # scan order, left (end) to right (start)
    al = np.asarray(Image.open(OUT / "s" / f"{secj['id']}-1600.webp").convert("RGBA"))[..., 3] > 127
    tp = np.argmax(al, axis=0); bt = al.shape[0] - 1 - np.argmax(al[::-1], axis=0)
    cols_top.append(tp); cols_bot.append(bt)
ct, cb = np.concatenate(cols_top).astype(float), np.concatenate(cols_bot).astype(float)
def runmed(v, k=65):
    pd = np.pad(v, k // 2, mode="edge"); return np.median(np.lib.stride_tricks.sliding_window_view(pd, k), axis=1)
ct, cb = runmed(ct), runmed(cb)
edges = {"step": 32, "top": [round(float(v), 1) for v in ct[::32]], "bot": [round(float(v), 1) for v in cb[::32]],
         "backing": [float(top[0]), float(bot[0])]}
print("edges", len(edges["top"]), "top range", min(edges["top"]), max(edges["top"]), "bot range", min(edges["bot"]), max(edges["bot"]))

geo = {"band": band, "scan_height": round(H_scan, 1), "unscanned_start": L_unscanned, "end_paper": L_end,
       "turn": round(float(t_turn), 3), "roller": d_roller, "stave": d_stave, "closed": round(float(D_closed), 1),
       "light": [round(float(v), 4) for v in fit],
       "backing": {"file": "backing.webp", "width": w, "height": h}, "edges": edges,
       "ribbon": {"file": "ribbon.webp", "left_file": "ribbon-left.webp", "left_root_y": round(root_in_crop[1] * k, 1),
                  "width": rib_s.width, "height": rib_s.height,
                  "root": [round(root[0], 1), round(root[1], 1)], "root_v": round(root_v, 4)}}
# keep what the other tools add (start.py: the start; wrapper.py: the wrapper and the silk)
if (OUT / "scroll.json").exists():
    prev = json.load(open(OUT / "scroll.json"))
    for key in ("start", "silk"):
        if key in prev: sec[key] = prev[key]
    if "wrapper" in prev.get("roll", {}): geo["wrapper"] = prev["roll"]["wrapper"]
    if "start" in prev: geo["unscanned_start"] = prev["start"]["length"]
sec["roll"] = geo
json.dump(sec, open(OUT / "scroll.json", "w"), indent=1)
print("wrote scroll.json")
