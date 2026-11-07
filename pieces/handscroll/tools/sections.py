# /// script
# dependencies = ["pillow", "numpy"]
# ///
"""Cut the scroll into its own sections, from Cleveland's full scan of 1964.94 (64714 x 4862, CC0).

The sections are the album's leaves and the mounter's sheets, found in the scan (see assets/PICK.md): the seams
between leaves, and the silk separators between the frontispiece, the inscription and the colophons. Nothing is cut
where the code likes. The whole scroll is resampled once to each output height and then cut at whole pixels, so the
sections laid edge to edge are the scroll again, with no seam of ours between them.

The background (Cleveland's black table) is matted out along the scroll's own silk edge; nothing else is touched.

usage: uv run sections.py <full.tif> <out assets dir>
"""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
SRC, OUT = Path(sys.argv[1]), Path(sys.argv[2])

# left edges of each section in full-scan px, reading order (right to left). A section runs from its left edge to the
# left edge of the one before it; the first runs to the scan's right edge. Silk separators belong to the section on
# their right (they are rolled up with it).
SECTIONS = [
    ("00", "title",       54350),   # frontispiece by Zhao Heqin, 1962, and the silk after it
    ("01", "leaf",        51748),
    ("02", "leaf",        49128),
    ("03", "leaf",        46594),
    ("04", "leaf",        43972),
    ("05", "leaf",        41438),
    ("06", "leaf",        38870),
    ("07", "leaf",        36232),
    ("08", "leaf",        33588),
    ("09", "leaf",        30998),
    ("10", "leaf",        28390),
    ("11", "leaf",        25788),
    ("12", "leaf",        23124),
    ("13", "inscription", 16508),   # Zhou Chen's own inscription, 1516, across the last opening, and its silk
    ("14", "colophon",    11004),   # Huang Jishui, 1564
    ("15", "colophon",     5560),   # Zhang Fengyi
    ("16", "colophon",        0),   # Wen Jia, 1577, to the end of the scan
]
Y0, Y1 = 128, 4716          # a band of rows that holds the whole scroll, silk edge to silk edge, with a little table
HEIGHTS = [1600, 900]

im = Image.open(SRC); im.load()
W, H = im.size
band = im.crop((0, Y0, W, Y1))
print("band", band.size, flush=True)

def matte(rgb):
    """alpha from the scroll's own edge: the silk is bright, the table near black. Per column, find the first and last
    rows above the threshold with subpixel interpolation and ramp alpha over one pixel; then pull the colour of the
    last edge pixels from just inside, so no black fringe is left in the half-transparent pixels."""
    a = np.asarray(rgb).astype(np.float32) / 255
    lum = a @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    h, w = lum.shape
    thr = 0.32
    above = lum > thr
    top = np.argmax(above, axis=0).astype(np.float32)
    bot = (h - 1 - np.argmax(above[::-1], axis=0)).astype(np.float32)
    # subpixel: interpolate the crossing between the row before and the row at the edge
    cols = np.arange(w)
    ti = np.clip(top.astype(int), 1, h - 1); bi = np.clip(bot.astype(int), 0, h - 2)
    l0, l1 = lum[ti - 1, cols], lum[ti, cols]
    top = ti - 1 + np.clip((thr - l0) / np.maximum(l1 - l0, 1e-4), 0, 1)
    l0, l1 = lum[bi + 1, cols], lum[bi, cols]
    bot = bi + 1 - np.clip((thr - l0) / np.maximum(l1 - l0, 1e-4), 0, 1)
    # the edge of a straight silk border: smooth along the length a little (a 9-px median keeps real nicks)
    def med(v, k=9):
        p = np.pad(v, k // 2, mode="edge"); return np.median(np.lib.stride_tricks.sliding_window_view(p, k), axis=1)
    top, bot = med(top), med(bot)
    rows = np.arange(h, dtype=np.float32)[:, None]
    alpha = np.clip(rows - top[None, :] + 0.5, 0, 1) * np.clip(bot[None, :] - rows + 0.5, 0, 1)
    # decontaminate the two edge rows: take colour from 3 px inside
    out = a.copy()
    for k in range(0, 3):
        rt = np.clip(np.floor(top).astype(int) + k, 0, h - 1); src = np.clip(np.floor(top).astype(int) + 3, 0, h - 1)
        out[rt, cols] = a[src, cols]
        rb = np.clip(np.ceil(bot).astype(int) - k, 0, h - 1); src = np.clip(np.ceil(bot).astype(int) - 3, 0, h - 1)
        out[rb, cols] = a[src, cols]
    rgba = np.dstack([out, alpha])
    return Image.fromarray((rgba * 255 + 0.5).astype(np.uint8), "RGBA"), float(np.median(top)), float(np.median(bot))

meta = {"source": {"file": SRC.name, "width": W, "height": H, "band": [Y0, Y1]}, "sizes": {}, "sections": []}
for oh in HEIGHTS:
    s = oh / (Y1 - Y0)
    ow = round(W * s)
    strip = band.resize((ow, oh), Image.LANCZOS)
    rgba, top, bot = matte(strip)
    meta["sizes"][str(oh)] = {"width": ow, "height": oh, "scale": s, "edge": [round(top, 2), round(bot, 2)]}
    right = ow
    for sid, kind, x0 in SECTIONS:
        left = round(x0 * s)
        piece = rgba.crop((left, 0, right, oh))
        piece.save(OUT / "s" / f"{sid}-{oh}.webp", quality=84, method=6)
        if oh == HEIGHTS[0]:
            meta["sections"].append({"id": sid, "kind": kind, "x": [x0, None]})
        right = left
    print(oh, ow, "edges", round(top, 1), round(bot, 1), flush=True)

# full-scan extents (right edge of each = left edge of the one before)
r = W
for sec in meta["sections"]:
    sec["x"][1] = r; r = sec["x"][0]
for oh in HEIGHTS:
    s = meta["sizes"][str(oh)]["scale"]; ow = meta["sizes"][str(oh)]["width"]; right = ow
    for sec in meta["sections"]:
        left = round(sec["x"][0] * s); sec.setdefault("px", {})[str(oh)] = [left, right]; right = left
json.dump(meta, open(OUT / "sections.json", "w"), indent=1)
print("done")
