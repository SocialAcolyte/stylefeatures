# lustre-stars: the pick

Contact sheets (scratch, `tools/engine/jobs/lustre-hunt/`):
- `sheet-met-41165.jpg`: every Met record in the 41.165 group (Havemeyer gift, 1941), primary views: 30 star,
  cross and half-star tiles, 20.3 cm each.
- `sheet-met-41165-all.jpg`: all 55 views of the ten colour-photographed tiles from that group, including their
  low-angle shots and the panel they are mounted in.
- `sheet-met-other0.jpg`: 34 other Met star and cross tiles (12th–15th century; Kashan, Sultanabad, Takht-i Sulaiman).
- `sheet-444459.jpg`: the ten views published with Met 444459 (accession 91.1.106): the assembled panel in two
  campaigns, the 1974 key, close-ups.
- `sheet-aic.jpg`: Art Institute of Chicago, seven Ilkhanid lustre tiles on one grey ground (incl. the
  Imamzada Yahya star and cross pair, 71231 and 71227).
- `sheet-panels.jpg`: nine assembled panels on Commons (Berlin's Imamzada Yahya field, the V&A, Doha, Walters),
  for the real setting: joints, gaps, how far tiles stand proud.

Also searched: Cleveland (`cc0=1`: four Ilkhanid tiles, only one star), Commons categories for Imamzadeh Yahya and
lustre tiles (mostly CC BY-SA gallery shots at an angle). `engine.py inspect` ran on `met-orig/`, `aic/` and
`commons/` (`inspect.txt`). The pick passes clean: 4000 px, "detail present at every scale; not an enlargement".

## The photograph: The Met DP231256, a panel of Kashan lustre stars and crosses

One modern photograph (4000 × 2211, CC0) of a panel The Met assembled in 1974 from fourteen tiles. It's square-on,
on a grey wall, in soft even light from the upper left, with each tile's own shadow falling down and to the right.
The Met's key (`tile panel key.JPG`, published with the same record) names every position. **The bottom row is
exactly the frieze the brief asks for: five eight-pointed stars, and between them, locked into their notches, four
crosses.**

| position | accession | Met id | the drawing |
|---|---|---|---|
| star 1 | 41.165.20 | 450436 | an eight-lobed arabesque, cobalt and turquoise under red-brown lustre |
| star 2 | 41.165.23 | 450439 | a dappled ass among flowering plants, cobalt on an olive lustre ground |
| star 3 | 41.165.18 | 450434 | an interlace of palmettes round a small eight-pointed centre, red lustre |
| star 4 | 41.165.11 | 450427 | a flowering tree in a vase, amber lustre, turquoise dabs |
| star 5 | 41.165.13 | 450429 | a great palmette in a vase, copper-red lustre |
| cross | 41.165.37 | 450453 | palmettes round a cobalt roundel, olive lustre |
| cross | 41.165.32 | 450448 | birds and a rosette, dark lustre ground |
| cross | 41.165.33 | 450449 | spotted hounds (or foxes) in a thicket |
| cross | 41.165.39 | 450455 | ogival trellis round a cobalt heart |

All are stonepaste, inglaze cobalt and turquoise, lustre over an opaque white glaze, 20.3 cm, 13th–14th century,
probably Kashan, H. O. Havemeyer Collection, CC0. Each star carries an inscription band round its edge.

**Why this one.**
- **One wall.** The five stars are five different hands' worth of drawing (an animal, a tree, a palmette, two
  geometric) yet came from one group and sit in one panel under one light, so they read as one wall. No other
  source gives that. The AIC set is just as consistent but has only four Ilkhanid lustre stars and one cross, each
  photographed alone. Assembling them would mean placing tiles in a setting no one photographed.
- **The setting is real.** The joints, the gaps, the way the crosses' arms seat between the stars' points, and the
  shadow are the photograph's own. No tile is moved; they are only cut out of the row above.
- **Reads small.** At 390 px each star is ~72 px. The ass, the vase and the palmette still read; the two geometric
  stars read as pattern, which is what they are.
- **Lustre reference from the same tiles.** The older campaign (`wb-41.165.*`) photographed these exact tiles at a
  grazing angle (`450429-5`, `450427-4`, `450448-4`). There the red-brown film deepens toward copper, olive film goes
  gold, and the glaze takes a silvery-blue sheen. The shader's colours were set against those.

### Why not the others

| source | what it has | why not |
|---|---|---|
| **Met DP231256 (444459 / 91.1.106 panel)** | the whole panel, modern, 4000 px, square-on, one light | **picked** |
| Met `wb-41.165.*` single views | the same tiles, ~1400 px each, colour | older snapshots, each a slightly different angle and exposure, tiles still in the mount with neighbours showing; kept as the lustre reference |
| Met `wb-91.1.106bb` | the same panel, 1956 px | lower resolution, older light |
| Met 41.165.21–31 b/w views | many more stars from the group | black-and-white archive prints |
| AIC 92287, 71231, 106111 + cross 71227 | sharp, 2300 px, one grey ground | only one cross; four stars from different buildings; no setting |
| Met 450438 (41.165.22) | a panel of small stars and crosses, 1260–70 | 2000 px, tiles too small to read at 72 px |
| Met 445276, 448196 | the deer and the octagon stars (this panel's top row) | the top row; a 2-row frieze reads as nine stars, not five |
| Commons panels (Berlin, V&A, Doha) | Imamzada Yahya in situ settings | CC BY-SA gallery photographs at an angle, glare; used only to learn the setting |
| Cleveland 1915.524, 1915.638 | one star, one square | not a set |

## The cut

The tiles were cut along their own joints, offline (`tools/`):
1. the wall vs. the tiles (chroma and texture against the grey wall's own colour);
2. each star fitted as an affine eight-pointed star (two squares), its sixteen straight edges snapped one by one
   to the joint (where the glaze's bright rim drops into a neutral gap);
3. a compact watershed over the whole panel on "neutral darkness" (joints are grey shadow; the painting is
   coloured), seeded from shrunken tile shapes;
4. each region clipped to its own fitted shape plus a few pixels; the crosses' edges that met the removed top
   row snapped inward to their own rim.

Checked by overlays at 1:1 on every cross top (`lustre-work/out/cross-tops.jpg`). The brass hanging tabs and the
biscuit fringes left with the cut. Where they had interrupted the wall's shadow, the shadow is filled from around
them.
