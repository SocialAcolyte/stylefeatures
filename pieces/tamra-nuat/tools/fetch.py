"""Fetch the Wellcome Collection's photographs of MS Thai 801 (Tamra nuat) from its IIIF image server.

Public Domain Mark. Manifest: https://iiif.wellcomecollection.org/presentation/v2/b20589463
usage: python3 fetch.py <out-dir> [width]     (the frames cut.py uses, at <width> px wide, default 2400)
"""
import os, sys, time, urllib.request
UA = {"User-Agent": "StyleFeaturesHunt/1.0 (research)"}
out = sys.argv[1]; width = int(sys.argv[2]) if len(sys.argv) > 2 else 2400
os.makedirs(out, exist_ok=True)
for n in [1, 3, 4, 5, 24, 25, 33, 34, 35, 36, 38, 39, *range(41, 65), 80, 81, 82, 83, 84, 86]:
    p = os.path.join(out, f"{n:04d}.jpg")
    if os.path.exists(p): continue
    u = f"https://iiif.wellcomecollection.org/image/b20589463_EP_000636_{n:04d}.JP2/full/{width},/0/default.jpg"
    for a in range(5):
        try:
            open(p, "wb").write(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=120).read()); break
        except Exception as e:
            print("retry", n, e); time.sleep(10 * (a + 1))
    print(n, flush=True); time.sleep(0.5)
