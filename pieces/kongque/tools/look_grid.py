"""polar unwrap with an angle grid (every 2 deg, labelled every 10) to read angles off: WORK/grid-*.jpg"""
from PIL import ImageDraw
from common import *
im = Image.open(os.path.join(WORK, 'polar.png')).convert('RGB')   # 170..372 deg at .1, r 20..2900 step 2, flipped
d = ImageDraw.Draw(im)
for a in range(170, 372, 2):
    x = int((a - 170) / .1)
    d.line([(x, 0), (x, im.height)], fill=(255, 0, 0) if a % 10 == 0 else (255, 170, 170), width=1)
    if a % 10 == 0: d.text((x + 3, 5), str(a), fill=(255, 255, 0))
for r in range(200, 2900, 200):
    y = im.height - 1 - (r - 20) // 2; d.line([(0, y), (im.width, y)], fill=(0, 0, 255)); d.text((5, y + 2), str(r), fill=(0, 0, 255))
w = im.width
im.crop((0, 0, w // 2, im.height)).save(os.path.join(WORK, 'grid-a.jpg'), quality=88)
im.crop((w // 2, 0, w, im.height)).save(os.path.join(WORK, 'grid-b.jpg'), quality=88)
print(im.size)
