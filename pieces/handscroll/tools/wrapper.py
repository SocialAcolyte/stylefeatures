# /// script
# dependencies = ["pillow", "numpy"]
# ///
"""The parts of the scroll the scene needs beyond the sections, all at the sections' scale (the 1600 band):

- brocade.webp: the wrapper laid flat, brocade up, from its stave edge, with Zhao Heqin's title slip (alt13,
  x 2030-4580). It is the outside of the closed scroll and of the first turn of the right roll. Only the black cloth
  around it is matted out.
- silk.webp: a strip of the white silk separator between two colophons (full scan x 5600-6020), to mount the page's
  own leaves between.

usage: uv run wrapper.py <src dir with the TIFFs> <assets dir>
"""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
SRC, OUT = Path(sys.argv[1]), Path(sys.argv[2])
geo = json.load(open(OUT / "scroll.json"))
size = geo["sizes"]["1600"]; s = size["scale"]; band = geo["source"]["band"]
et, eb = size["edge"]

def matte_rows(rgb, thr=0.16, warm=False):
    """alpha from the black cloth above and below (per column, first/last row above the threshold), 1 px ramp,
    the two edge rows given the colour from just inside."""
    a = np.asarray(rgb).astype(np.float32) / 255
    l = a @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    h, w = l.shape
    if warm:                                               # the brocade is warm, the cloth blue-grey
        wv = a[..., 0] - a[..., 2]
        wv = np.apply_along_axis(lambda c: np.convolve(c, np.ones(21) / 21, mode="same"), 0, wv)
        m = wv > 0.03
    else:
        m = l > thr
    top = np.argmax(m, axis=0).astype(np.float32); bot = (h - 1 - np.argmax(m[::-1], axis=0)).astype(np.float32)
    def med(v, k=31):
        p = np.pad(v, k // 2, mode="edge"); return np.median(np.lib.stride_tricks.sliding_window_view(p, k), axis=1)
    top, bot = med(top), med(bot)
    r = np.arange(h, dtype=np.float32)[:, None]
    al = np.clip(r - top[None] + 0.5, 0, 1) * np.clip(bot[None] - r + 0.5, 0, 1)
    cols = np.arange(w)
    for k in range(3):
        a[np.clip(top.astype(int) + k, 0, h - 1), cols] = a[np.clip(top.astype(int) + 4, 0, h - 1), cols]
        a[np.clip(bot.astype(int) - k, 0, h - 1), cols] = a[np.clip(bot.astype(int) - 4, 0, h - 1), cols]
    return Image.fromarray((np.dstack([a, al]) * 255 + 0.5).astype(np.uint8), "RGBA"), float(np.median(top)), float(np.median(bot))

# ── the wrapper: its top and bottom edges in alt13 are mapped onto the sections' edges in the band ──
a13 = Image.open(SRC / "1964.94_alt13_full.tif")
# Cleveland's rosewood weight (and its shadow) lies on the wrapper's bottom corner by the stave: x 2005-2365,
# y 3400-4310. The brocade is a regular weave, slightly tilted in the photograph; the nearest clean repeat measured
# beside the corner is 450 px across and 10 px up (rms 0.16 against the weave next to it), so the corner is restored
# from there, and the stave's folded edge (uniform along its length) from 880 px above. 12 px blends at the seams.
# The title slip (x 2140-2400, y 130-3330) and the ribbon's end (y 2280-2450) are clear of all of it.
arr = np.asarray(a13).astype(np.float32)
fix = arr.copy()
fix[3400:4310, 2040:2365] = arr[3390:4300, 2490:2815]
fix[3400:4310, 2005:2040] = arr[2490:3400, 2005:2040]
wy = np.clip((np.arange(3400, 4310) - 3400) / 14, 0, 1)[:, None, None]
wx = np.clip((2365 - np.arange(2005, 2365)) / 16, 0, 1)[None, :, None]
w = np.minimum(wy, wx)
fix[3400:4310, 2005:2365] = arr[3400:4310, 2005:2365] * (1 - w) + fix[3400:4310, 2005:2365] * w
a13 = Image.fromarray(np.clip(fix, 0, 255).astype(np.uint8))
crop = a13.crop((2030, 0, 4580, a13.height))
probe, t13, b13 = matte_rows(crop, warm=True)
k = (eb - et) / (b13 - t13)                                # alt13 px -> band px
y0 = t13 - et / k                                          # alt13 row at band row 0
y1 = y0 + 1600 / k
crop = a13.crop((2030, int(round(y0)), 4580, int(round(y1)))).resize((round(2550 * k), 1600), Image.LANCZOS)
img, t, b = matte_rows(crop, warm=True)
img.save(OUT / "brocade.webp", quality=80, method=6)
# the title slip's place along the wrapper (from its stave edge), measured in alt13: x 2140-2400
slip = [round((2140 - 2030) * k / s, 1), round((2400 - 2030) * k / s, 1)]
wrapper_len = round(2550 * k / s, 1)                       # scan px
print("brocade", img.size, "edges", round(t, 1), round(b, 1), "wrapper", wrapper_len, "scan px; slip", slip)

# ── the silk: one separator, between Zhang Fengyi's and Wen Jia's colophons ──
full = Image.open(SRC / "1964.94_full.tif")
silk = full.crop((5600, band[0], 6020, band[1])).resize((round(420 * s), 1600), Image.LANCZOS)
simg, st, sb = matte_rows(silk, thr=0.32)
simg.save(OUT / "silk.webp", quality=88, method=6)
print("silk", simg.size, "edges", round(st, 1), round(sb, 1))

geo["roll"]["wrapper"] = {"file": "brocade.webp", "width": img.width, "height": img.height, "length": wrapper_len,
                          "slip": slip, "edges": [round(t, 2), round(b, 2)]}
geo["silk"] = {"file": "silk.webp", "width": simg.width, "height": simg.height, "edges": [round(st, 2), round(sb, 2)]}
json.dump(geo, open(OUT / "scroll.json", "w"), indent=1)
print("wrote scroll.json")
