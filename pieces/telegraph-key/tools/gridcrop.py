"""Zoomed crops of the work image with a labelled pixel grid, for placing cut lines by eye.

usage: ./run.sh gridcrop.py name x0 y0 x1 y1 [zoom] [step]     (work px; writes WORK/grid-<name>.png)
"""
import sys
import numpy as np
from PIL import Image, ImageDraw
from common import *

name, x0, y0, x1, y1 = sys.argv[1], *map(int, sys.argv[2:6])
zoom = float(sys.argv[6]) if len(sys.argv) > 6 else 4
step = int(sys.argv[7]) if len(sys.argv) > 7 else 10
src = sys.argv[8] if len(sys.argv) > 8 else f'{WORK}/work.png'
im = Image.open(src).convert('RGB').crop((x0, y0, x1, y1))
im = im.resize((int((x1 - x0) * zoom), int((y1 - y0) * zoom)), Image.NEAREST)
dr = ImageDraw.Draw(im)
for x in range((x0 // step + 1) * step, x1, step):
    X = (x - x0) * zoom
    major = x % (step * 5) == 0
    dr.line([(X, 0), (X, im.height)], fill=(255, 40, 40) if major else (255, 170, 170), width=1)
    if major:
        dr.text((X + 2, 2), str(x), fill=(220, 0, 0))
for y in range((y0 // step + 1) * step, y1, step):
    Y = (y - y0) * zoom
    major = y % (step * 5) == 0
    dr.line([(0, Y), (im.width, Y)], fill=(40, 40, 255) if major else (170, 170, 255), width=1)
    if major:
        dr.text((2, Y + 2), str(y), fill=(0, 0, 220))
im.save(f'{work_dir()}/grid-{name}.png')
print(f'{WORK}/grid-{name}.png', im.size)
