"""Stage 2: the parts, as loops of waypoints in work px (the box at WS; see common.py).

Where a part borders the white sweep its loop is loose: the key's own alpha makes the edge. Where it borders another
part of the key, the loop is the boundary:
  lever    the lever, finger plate, block, top bar, the lug's face above the near cheek, the back ring, both thumbscrews
           and the front lock nut. It stops at the line where the front screw's point meets the anvil, at the neck where
           the back screw sits on its post, and along the top of the near cheek.
  fscrew_u the front thumbscrew above the lock nut (wheel, collar, thread): it is raised along its own thread.
  fscrew_l the same screw below the lever (thread and point).
  spring   the flat spring from where it leaves its screwed plate to its tip under the lever.
  cheek    the near cheek of the trunnion and the pin's nut: they stand in front of the lever's lug.
Run this to write WORK/parts.json and WORK/parts-check.jpg (every loop drawn on the work image).
"""
import json
import numpy as np
from PIL import Image, ImageDraw
from common import *

# --- the boundaries that matter (measured on gridcrop.py views) ---------------------------------------------------
FRONT_CONTACT_Y = 624          # the front screw's point meets the anvil (x 2150..2205)
# the back screw's tip where it sits on its post, left notch to right notch: the rounded end of the screw, down to
# the dark contact line (measured column by column: the last dark row before the post's lit dome begins)
NECK_BOTTOM = [(2837, 597.5), (2840, 604), (2845, 609), (2852, 611), (2870, 612), (2885, 611.5), (2891, 610),
               (2895, 608.5), (2898, 606.5)]
BACK_NECK = [NECK_BOTTOM[0], NECK_BOTTOM[-1]]
# the post's top is a dome: its outline either side of the screw fits a circle to 0.6 px (centre x, y, radius)
DOME = (2857.7, 645.3, 52.4)
# top of the near cheek, left to right: the far edge of its rounded top face, then down its right side
CHEEK_TOP = [(2380, 557), (2400, 557), (2450, 556), (2500, 554), (2550, 553), (2600, 555), (2620, 558),
             (2650, 567), (2680, 588), (2700, 604), (2718, 626), (2731, 648), (2734, 680)]
# where the front screw goes into the lock nut: the near half of its circle on the nut's top face (the nut's far
# corners, higher up, are behind the screw)
NUT_TOP = [(2134, 276), (2150, 281), (2170, 285), (2190, 286), (2210, 285), (2230, 282), (2250, 278)]
SCREW_X = (2137, 2247)         # the threaded shank's width above the nut
# the lever's near bottom edge where the front screw comes out under it
LEVER_BOTTOM_AT_SCREW = [(2134, 544), (2224, 552)]

PARTS = {
    # loose round the top; exact along the contacts and the cheek
    'lever': [(300, 0), (3150, 0), (3150, 600), (2910, 600), (2904, 610)] + list(reversed(NECK_BOTTOM)) +
             [(2830, 588), (2742, 588), (2738, 640)] + [p for p in reversed(CHEEK_TOP[1:-1])] +
             # left of the cheek the far plate's top meets the block's underside at row 547
             [(2391, 557), (2391, 547), (2368, 547), (2362, 556)] +
             [(2228, 558), (2228, FRONT_CONTACT_Y - 1), (2134, FRONT_CONTACT_Y - 1), (2134, 580), (2054, 580),
              (2054, 578), (1940, 578), (1900, 576), (1300, 545), (700, 490), (300, 480)],
    # the wheel (393 px across) and collar, then the shank down to where it goes into the nut
    'fscrew_u': [(1990, 0), (2405, 0), (2405, 188), (2260, 188), (SCREW_X[1], 196), (SCREW_X[1], 246),
                 (SCREW_X[1] - 5, 246)] + [p for p in reversed(NUT_TOP) if SCREW_X[0] + 5 <= p[0] <= SCREW_X[1] - 5] +
                [(SCREW_X[0] + 5, 246), (SCREW_X[0], 246), (SCREW_X[0], 196), (2125, 188), (1990, 188)],
    'fscrew_l': [(SCREW_X[0] - 3, LEVER_BOTTOM_AT_SCREW[0][1]), (2224, LEVER_BOTTOM_AT_SCREW[1][1]),
                 (2224, FRONT_CONTACT_Y - 1), (SCREW_X[0] - 3, FRONT_CONTACT_Y - 1)],
    # the near cheek. Left of it, down to its rounded shoulder, is the far plate of the trunnion (light grey), which
    # stands behind the lever: that stays with the base, so the lever's block passes in front of it
    'cheek': [(2391, CHEEK_TOP[0][1])] + CHEEK_TOP[1:] + [(2734, 780), (2380, 780), (2380, 610), (2391, 598)],
}
# the spring is cut by colour inside a corridor round its centre line (it crosses the wooden block's top face)
SPRING_LINE = [(650, 1012), (800, 996), (1000, 968), (1200, 930), (1300, 900), (1400, 852), (1500, 800),
               (1600, 746), (1700, 694), (1800, 645), (1900, 604), (1960, 585), (2010, 590), (2052, 606)]
# the far edge of the spring's top surface on the wood, from its root to where its top edge leaves the front face's
# line (measured: brass or patina below, red-brown wood above)
SPRING_FAR_EDGE = [(650, 961), (680, 960), (760, 963), (840, 963), (920, 960), (980, 955), (995, 954)]
SPRING_ROOT = (650, 1012)
SPRING_TIP = (2000, 588)       # where it bears on the lever

if __name__ == '__main__':
    work = Image.open(f'{WORK}/work.png').convert('RGB')
    dr = ImageDraw.Draw(work)
    colours = dict(lever=(255, 0, 0), fscrew_u=(0, 160, 255), fscrew_l=(0, 220, 120),
                   cheek=(255, 0, 255))
    for k, loop in PARTS.items():
        dr.line(loop + [loop[0]], fill=colours[k], width=2)
    dr.line(SPRING_LINE, fill=(0, 255, 255), width=2)
    jsave('parts.json', dict(parts=PARTS, spring_line=SPRING_LINE, spring_root=SPRING_ROOT, spring_tip=SPRING_TIP,
                             front_contact_y=FRONT_CONTACT_Y, neck_bottom=NECK_BOTTOM, dome=DOME, cheek_top=CHEEK_TOP,
                             nut_top=NUT_TOP))
    cx, cy, r = DOME
    dr.arc([cx - r, cy - r, cx + r, cy + r], 180, 360, fill=(255, 160, 0), width=1)
    work.save(f'{WORK}/parts-check.jpg', quality=90)
    for nm, box in dict(c1=(2050, 0, 2350, 700), c2=(2350, 420, 2950, 820), c3=(600, 550, 2100, 1100)).items():
        work.crop(box).save(f'{WORK}/parts-check-{nm}.jpg', quality=92)
    print('ok')
