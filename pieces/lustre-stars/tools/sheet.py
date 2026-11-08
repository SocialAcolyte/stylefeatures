# usage: sheet.py out.jpg cell files...
import sys, os
from PIL import Image, ImageDraw
out, cell = sys.argv[1], int(sys.argv[2]); files = sys.argv[3:]
cols = min(6, len(files)); rows = (len(files)+cols-1)//cols
S = Image.new('RGB', (cols*cell, rows*(cell+22)), (40,40,40)); d = ImageDraw.Draw(S)
for k,f in enumerate(files):
    try: im = Image.open(f).convert('RGB')
    except Exception: continue
    w,h = im.size; im.thumbnail((cell,cell))
    x, y = (k%cols)*cell, (k//cols)*(cell+22)
    S.paste(im, (x+(cell-im.width)//2, y+(cell-im.height)//2))
    d.text((x+4, y+cell+4), f"{os.path.basename(f)[:34]} {w}x{h}", fill=(230,230,230))
S.save(out, quality=88)
