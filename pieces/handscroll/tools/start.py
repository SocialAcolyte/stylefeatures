# /// script
# dependencies = ["pillow", "numpy"]
# ///
"""The start of the scroll, which the full scan leaves out: the rest of the white silk, the gold-flecked strip and the
damask, up to the stave. Cleveland photographed it in two section shots (alt15, alt14), taken with the full scan's
own camera; they are matched to the scan and to each other by correlation, scaled so their silk edges lie on the
sections' edges, joined at one measured point in the damask, and the black table beyond the stave is matted out.
Nothing else is changed.

usage: uv run start.py <src dir with alt14/alt15 TIFFs> <assets dir>
"""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
SRC, OUT = Path(sys.argv[1]), Path(sys.argv[2])
geo = json.load(open(OUT / "scroll.json"))
size = geo["sizes"]["1600"]; s = size["scale"]
e = geo["roll"]["edges"]
et, eb = e["top"][-1], e["bot"][-1]                         # the sections' edges at the scan's right end (band px)

def lum(img): return np.asarray(img.convert("L")).astype(np.float32) / 255

def edges(l, x0, x1):
    """median top/bottom silk edge rows over columns x0..x1 (bright silk against the dark table)"""
    c = l[:, x0:x1]; m = c > 0.3
    t = np.argmax(m, axis=0); b = c.shape[0] - 1 - np.argmax(m[::-1], axis=0)
    return float(np.median(t)), float(np.median(b))

a15, a14 = Image.open(SRC / "1964.94_alt15_full.tif"), Image.open(SRC / "1964.94_alt14_full.tif")
l15, l14 = lum(a15), lum(a14)

# alt15 -> alt14 overlap, refined at full resolution in the damask (alt14 starts near alt15 x 4784)
ref = l15[600:4200, 5200:5500]; ref = (ref - ref.mean()) / ref.std()
best = None
for dy in range(-40, 1, 1):
    for dx in range(4740, 4830):
        w = l14[600 + dy:4200 + dy, 5200 - dx:5500 - dx]
        w = (w - w.mean()) / (w.std() + 1e-6); c = float((w * ref).mean())
        if best is None or c > best[0]: best = (c, dx, dy)
c, DX, DY = best
print("alt15 -> alt14: x shift", DX, "y shift", DY, "corr", round(c, 3))

# scale each photo so its silk edges match the sections' edges at the join
t15, b15 = edges(l15, 1100, 1900)                            # white silk region of alt15
t14, b14 = edges(l14, 600, 1400)                             # damask region of alt14
k15 = (eb - et) / (b15 - t15); k14 = (eb - et) / (b14 - t14)  # photo px -> band px
print("alt15 edges", t15, b15, "k", round(k15, 5), "| alt14 edges", t14, b14, "k", round(k14, 5))

X0 = 1032                                                     # the scan's right edge in alt15 (matched, corr 0.92)
SEAM = 5600                                                   # alt15 x where the photos are joined (in the damask)
# the stave end in alt14: where the damask meets the dark table, along the middle rows
mid = l14[1000:3800].mean(0); STAVE = int(np.argmax(mid[3000:] < 0.3)) + 3000
print("stave edge in alt14 at x", STAVE)

def piece(img, x0, x1, top, k):
    y0 = top - et / k; y1 = y0 + 1600 / k
    return img.crop((x0, int(round(y0)), x1, int(round(y1)))).resize((max(1, round((x1 - x0) * k)), 1600), Image.LANCZOS)

# the full scan and the section shots were exported with different colour. Both show the white silk after the
# frontispiece (scan x W-300..W-20, alt15 x 732..1012, rows aligned by +32): one gain per channel, the ratio of that
# silk's mean colour in the two, takes alt15 and alt14 (same camera, same session) to the scan's colour.
full = Image.open(SRC / "1964.94_full.tif")
FW = full.width
sc = np.asarray(full.crop((FW - 300, 700, FW - 20, 4100))).astype(np.float32).reshape(-1, 3).mean(0)
ph = np.asarray(a15.crop((X0 - 300, 732, X0 - 20, 4132))).astype(np.float32).reshape(-1, 3).mean(0)
gain = [float(sc[c] / ph[c]) for c in range(3)]; off = [0.0, 0.0, 0.0]
print("colour match alt15 -> scan: gain", [round(g, 4) for g in gain], "(silk means", [round(float(v), 1) for v in sc], "vs", [round(float(v), 1) for v in ph], ")")
def match(img):
    x = np.asarray(img).astype(np.float32)
    for ch in range(3): x[..., ch] = x[..., ch] * gain[ch] + off[ch]
    return Image.fromarray(np.clip(x, 0, 255).astype(np.uint8))
# Cleveland's weight (and its shadow) lies on the damask right at the stave (alt14 x > ~4900, top): the start ends before it
END = 4850
p15 = piece(match(a15), X0, SEAM, t15, k15)
p14 = piece(match(a14), SEAM - DX, END, t14, k14)
W = p15.width + p14.width
# reading order: the start (stave) is at the RIGHT end of the scroll, so the stave piece goes on the right
out = Image.new("RGB", (W, 1600)); out.paste(p15, (0, 0)); out.paste(p14, (p15.width, 0))
a = np.asarray(out).astype(np.float32) / 255
l = a @ np.array([0.2126, 0.7152, 0.0722], np.float32)
h, w = l.shape
m = l > 0.3
top = np.argmax(m, axis=0).astype(np.float32); bot = (h - 1 - np.argmax(m[::-1], axis=0)).astype(np.float32)
def med(v, k=31):
    pd = np.pad(v, k // 2, mode="edge"); return np.median(np.lib.stride_tricks.sliding_window_view(pd, k), axis=1)
top, bot = med(top), med(bot)
r = np.arange(h, dtype=np.float32)[:, None]
alpha = np.clip(r - top[None] + 0.5, 0, 1) * np.clip(bot[None] - r + 0.5, 0, 1)
cols = np.arange(w)
for k in range(3):                                           # the edge rows take their colour from just inside
    a[np.clip(top.astype(int) + k, 0, h - 1), cols] = a[np.clip(top.astype(int) + 4, 0, h - 1), cols]
    a[np.clip(bot.astype(int) - k, 0, h - 1), cols] = a[np.clip(bot.astype(int) - 4, 0, h - 1), cols]
endx = w - 2                                                # the start ends at the cut before the weight
rgba = Image.fromarray((np.dstack([a, alpha]) * 255 + 0.5).astype(np.uint8), "RGBA").crop((0, 0, endx + 2, 1600))
rgba.save(OUT / "s" / "start-1600.webp", quality=78, method=6)
rgba.resize((round(rgba.width * 900 / 1600), 900), Image.LANCZOS).save(OUT / "s" / "start-900.webp", quality=80, method=6)
L = rgba.width / s
print("start piece", rgba.size, "=", round(L), "scan px (alt12: 9034 to the stave; this ends just short of it)")
geo["start"] = {"file": "s/start", "width": rgba.width, "length": round(L, 1), "from": "alt15 + alt14", "seam_alt15_x": SEAM}
geo["roll"]["unscanned_start"] = round(L, 1)
json.dump(geo, open(OUT / "scroll.json", "w"), indent=1)
