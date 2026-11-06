"""Stage -1: the source, the Freer's own photograph of F1917.18 at full size (Smithsonian Open Access, CC0)."""
import urllib.request
from common import *

URL = 'https://ids.si.edu/ids/download?id=FS-7729_16.jpg'        # 4200 x 3150, redirects to the open-access bucket
if not SRC.exists():
    SRC.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(URL, headers={'User-Agent': 'StyleFeaturesHunt/1.0 (research)'})
    SRC.write_bytes(urllib.request.urlopen(req, timeout=120).read())
print(SRC, SRC.stat().st_size // 1024, 'KB')
