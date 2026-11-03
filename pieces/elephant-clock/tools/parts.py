"""The moving parts, as loops of waypoints in source px (DP234075.jpg, 2522 x 3596).

(x, y, 'i') snaps the stretch to the next waypoint onto the painter's ink line; (x, y, 's') runs
straight (out in bare paper; the paper is then subtracted). Pivots are where the treatise puts the axle.
"""

PARTS = {
    # the serpent with its lip on the vase (Hill sec. 15: the servant has lowered it to set the clock).
    # Head, neck, red wing, gold lining and the blue claw up to the junction; the junction stays on the axle.
    'serpent': {
        'pivot': (1415, 2080),
        'pad': 12,
        'loop': [
            (1046, 2018, 'i'), (1062, 1975, 'i'), (1080, 1956, 'i'), (1100, 1946, 'i'), (1120, 1937, 'i'),
            (1140, 1930, 'i'), (1170, 1922, 'i'), (1200, 1924, 'i'), (1240, 1933, 'i'), (1280, 1945, 'i'),
            (1298, 1966, 'i'), (1302, 1990, 'i'), (1345, 2010, 's'), (1362, 2054, 'i'), (1290, 2050, 'i'),
            (1250, 2056, 'i'), (1220, 2054, 'i'), (1224, 2140, 'i'), (1226, 2300, 'i'), (1219, 2390, 'i'),
            (1222, 2430, 'i'), (1222, 2478, 'i'), (1190, 2490, 'i'), (1152, 2500, 'i'), (1146, 2530, 'i'),
            (1142, 2556, 'i'), (1100, 2562, 'i'), (1075, 2575, 'i'), (1065, 2610, 'i'), (1062, 2645, 's'),
            (1035, 2654, 's'), (1003, 2642, 's'), (990, 2600, 's'), (965, 2540, 's'), (965, 2470, 's'),
            (995, 2410, 's'), (1050, 2402, 's'), (1065, 2445, 'i'), (1100, 2468, 'i'), (1132, 2458, 'i'),
            (1146, 2420, 'i'), (1146, 2300, 'i'), (1146, 2150, 'i'), (1146, 2062, 'i'), (1095, 2008, 'i'),
        ],
        'include': [
            [(1148, 2452), (1222, 2458), (1225, 2484), (1192, 2503), (1148, 2508)],     # right horn
            [(1145, 2500), (1228, 2486), (1217, 2506), (1186, 2524), (1157, 2541), (1142, 2546)],  # lower jaw
            [(1141, 2062), (1150, 2062), (1150, 2432), (1141, 2432)],                   # neck's own left outline
        ],
    },
    # the bird on the cupola: papier-mache, on an iron rod that a bladed wheel in the castle turns
    'bird': {
        'axis_x': 1437,
        'loop': [
            (1275, 318, 's'), (1330, 280, 's'), (1400, 280, 's'), (1462, 320, 's'), (1472, 395, 's'),
            (1565, 425, 's'), (1645, 528, 's'), (1665, 598, 's'), (1640, 645, 's'), (1560, 668, 's'),
            (1500, 662, 's'), (1500, 652, 's'), (1392, 652, 's'), (1385, 600, 's'), (1352, 578, 's'),
            (1336, 520, 's'), (1326, 430, 's'), (1333, 372, 's'), (1300, 336, 's'),
        ],
    },
    # the man on the balcony, on the axle q at the centre of the castle's face (sec. 12)
    'balcony': {
        'pivot': (1125, 1120),
        'pad': 14,
        'loop': [
            (982, 925, 's'), (990, 860, 's'), (1000, 806, 's'), (1060, 790, 's'), (1100, 800, 'i'),
            (1128, 860, 'i'), (1129, 950, 'i'), (1129, 1100, 'i'), (1129, 1240, 'i'), (1120, 1268, 'i'),
            (1050, 1272, 'i'), (990, 1262, 'i'), (950, 1285, 'i'), (880, 1290, 'i'), (830, 1285, 's'),
            (806, 1235, 's'), (830, 1212, 's'), (900, 1203, 's'), (960, 1168, 's'), (995, 1140, 's'),
            (992, 1060, 's'), (985, 1000, 's'), (975, 960, 's'),
        ],
    },
    # the mahout's right hand with the axe, on its axle at the shoulder of the copper shift (sec. 6)
    'axe': {
        'pivot': (640, 2445),
        'pad': 14,
        'loop': [
            (585, 1962, 's'), (700, 1972, 's'), (790, 2008, 's'), (852, 2060, 's'), (848, 2152, 's'),
            (790, 2172, 's'), (700, 2180, 's'), (640, 2240, 's'), (615, 2262, 'i'), (640, 2320, 'i'),
            (655, 2380, 'i'), (668, 2410, 'i'), (600, 2472, 's'), (575, 2400, 's'), (545, 2332, 's'),
            (490, 2348, 's'), (478, 2325, 's'), (530, 2288, 's'), (535, 2240, 's'), (575, 2215, 's'),
            (690, 2105, 's'), (640, 2085, 's'), (592, 1990, 's'),
        ],
    },
    # the left hand with the mallet resting on the elephant's head
    'mallet': {
        'pivot': (705, 2625),
        'pad': 12,
        'loop': [
            (615, 2538, 's'), (657, 2538, 's'), (665, 2590, 'i'), (710, 2598, 's'), (714, 2660, 'i'),
            (660, 2652, 's'), (645, 2700, 's'), (627, 2745, 'i'), (558, 2752, 's'), (562, 2700, 's'),
            (583, 2652, 's'), (578, 2610, 's'), (610, 2590, 's'),
        ],
    },
    # the cymbal of white bronze (painted as a bell) on its cord under the elephant's breast
    'bell': {
        'pivot': (818, 3196),
        'loop': [
            (806, 3196, 's'), (832, 3196, 's'), (838, 3240, 's'), (850, 3270, 's'), (852, 3355, 's'),
            (760, 3358, 's'), (762, 3268, 's'), (790, 3238, 's'), (800, 3210, 's'),
        ],
    },
    # the scribe on his turning platform (sec. 5)
    'scribe': {
        'axis_x': 1470,
        'subtract_paper': False,     # his lead-white robe has flaked to the paper: keep his whole silhouette
        'loop': [
            (1378, 2232, 's'), (1420, 2218, 's'), (1470, 2221, 's'), (1505, 2232, 's'), (1548, 2300, 's'),
            (1566, 2400, 's'), (1566, 2500, 's'), (1530, 2513, 's'), (1450, 2513, 's'), (1380, 2516, 's'),
            (1310, 2540, 's'), (1290, 2546, 's'), (1264, 2560, 's'), (1236, 2557, 's'), (1227, 2482, 's'),
            (1223, 2452, 's'), (1240, 2434, 's'), (1292, 2418, 's'), (1296, 2306, 's'), (1326, 2302, 's'),
            (1322, 2392, 's'), (1332, 2394, 's'), (1366, 2344, 's'), (1386, 2330, 's'), (1386, 2280, 's'),
        ],
    },
    # the float's chain in the arch (sec. 14): from the float's cover up through the dome, over the pulley on the
    # serpents' axle, to the ring of the tilting channel in the castle. It slides as the float sinks.
    'chain': {
        'period': 24,                  # one S-link, source px
        'clip': (1382, 1432, 1434, 1794),
        'loop': [(1382, 1432, 's'), (1434, 1432, 's'), (1434, 1794, 's'), (1382, 1794, 's')],
        'fill': False,
        'keep_all': True,              # every link is its own piece of ink
    },
}
