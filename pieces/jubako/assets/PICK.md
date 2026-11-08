# jubako: the pick

Contact sheets (scratch, `tools/engine/jobs/`):
- `tabs-hunt/sheet-tiered-a.jpg`, `sheet-tiered-b.jpg`: every view of 27 Met tiered boxes, picnic sets, incense boxes,
  food boxes and stacked cases (188 tiles), found with the v1.1 search ("tiered food box", "tiered", "picnic set",
  "seal paste box", "nest of weights", "stacking", "compendium", "tiffin").
- `tabs-hunt/sheet-40343.jpg`: all twelve views of the box chosen.
- `tabs-hunt/sheet-jp-series.jpg`: the three other Met boxes photographed tier by tier (57965, 57966, 56528).
- `tabs-hunt/sheet-40258-444538.jpg`: the Ming mother-of-pearl tiered box (40258), the Mamluk brass box of Muhammad
  al-Hamawi (444538), a Chinese pewter tiered box (61280).
- `tabs-hunt/sheet-aic262426.jpg`: the Art Institute's Ming carved cinnabar four-tiered box (262426), six views.
- `tabs-commons/hunt/sheet.png`: Commons, 12 tiered boxes (Honolulu, British Museum, Okinawa, Yuan).
- `round9-lead-hunt/sheet-inro.jpg`: the lead's four inrō (58371, 58463, 58798, 58876).

`engine.py inspect --use hero` ran on all 26 originals fetched for the shortlist (`tabs-hunt/met/orig`). All pass: no
enlargement, full detail at 4000 px. One WARN (57966-4, near-perfect symmetry: a box seen square-on).

## The box: The Met 2015.500.2.31a–f, food box, Japan, 17th century

A tall square jūbako of five tiers in black lacquer, banded all round in stripes of gold and silver *hiramaki-e*, lead
and mother-of-pearl, with scrolling arabesque bands between; a lid (not used here) inlaid with Chinese figures. 27 cm
high. Gift of Florence and Herbert Irving, 2015. CC0.

**Why this one.** The Met photographed it in one campaign (`L1996_47_86_O*`, from its loan in 1996) **taken apart a
tier at a time from a fixed camera**: O2 the five tiers with the top one open, O3 with one tier lifted off, O4 with
two, O5 with three, O6 the bottom tier alone. That is exactly what a tab has to show: each state of the control is a
photograph. Difference images confirm the camera never moved: O3 and O4 register onto O2 within a pixel by
translation alone; O5 needs 3 px and 0.13 degrees, O6 18 px and 0.6 degrees (the bottom tier was nudged when the last
tier came off). After registration the bottom tier's band differs by 0.6 % (O3–O4) to 2 % (O6) of full scale, i.e. not
visibly at the half scale shipped.

Which photograph covers which state:

| part | photograph | what it shows that the others can't |
|---|---|---|
| tier 1 | O2 (all five) | tier 1's open inside, and its sides |
| tier 2 | O3 | tier 2's inside: in O2 it was under tier 1 |
| tier 3 | O4 | tier 3's inside |
| tier 4 | O5 | tier 4's inside |
| tier 5 | O6 | the bottom tier's inside, and the foot |
| shadow | O2 | the box's own shadow on the Met's backdrop |

Lifting tiers 1…k−1 off tier k shows nothing nobody photographed: tier k's inside is O(k+1)'s; the lifted tiers are seen
from above, so their undersides never show; and stacked, every tier covers the inside of the one below it exactly
(the stack composited from the five photographs matches O2 to 1.8 % mean absolute difference over the box, the
largest differences a pixel either side of the seams).

### Why not the others

| candidate | what it has | why not |
|---|---|---|
| **Met 40343, striped food box** | 5 tiers, photographed apart tier by tier, one camera | **picked** |
| Met 57965, incense box (jūkōgō), crest, pine, bamboo, plum | lid + 3 tiers, gold *nashiji* insides, apart tier by tier | 4 states only; the open views are cropped to different sizes (3238–3838 px wide), so each needs a scale fit as well. The runner-up, and a good second box (gold insides) |
| Met 57966, incense box, maple and raft | lid + 3 tiers apart, uncropped 4000 px, one camera | 4 states; small in frame (box ~1000 px wide) |
| Met 56528, jūbako with azaleas | 3 tiers + lid apart | 20th century; the open states vary in angle |
| Met 40258, Ming mother-of-pearl tiered box | four sides, top, an inside | no view apart: lifting a tier would show a rim nobody photographed |
| AIC 262426, Ming carved cinnabar four-tiered box | four sides straight on, top, superb | the same: never photographed apart |
| Met 61280/61281, Chinese tiered boxes | lid off beside | one state only |
| Met 444538, Mamluk brass box of Muhammad al-Hamawi | 10 views | not tiered (lidded) |
| Met 910102, three-tiered box in book form (1870s) | drawers out | drawers, 3 parts, Victorian |
| Met 57588 / 42624, sagejū picnic sets | every part laid out | parts laid flat on the table, not as a stack from one camera |
| Met inrō 58371, 58463, 58798, 58876 | sides, tops, cords | no tier ever photographed apart along its cords |
| Commons (Honolulu, BM, Okinawa, Yuan) | single gallery views | one state each |

**Japan, knowingly.** The brief asks for Japan only if nothing else is as good. Nothing else is: of 27 museum boxes and
12 Commons ones, only Japanese lacquer was photographed tier by tier, and this box best of all (five states, one
camera, 4000 px). Chinese tiered boxes (Ming cinnabar, Ming mother-of-pearl) are finer still as objects, but no
museum photographed them apart, and lifting a tier would need a rim drawn. The library has Japanese paper, prints
and katazome, but no lacquer (*maki-e*) and no stacked object.

## The cut (`tools/cut.py`)

1. **Register** O3–O6 onto O2 by the bottom tier's band (ECC; translation for O3–O4, affine for O5–O6).
2. **Matte** each state (BiRefNet via the asset engine, decontaminated edge).
3. **Seams.** On the left face, where O(n) and O(n+1) stop differing (taking a tier off changes everything above its
   bottom edge and nothing below): four lines with 0.4 px residual. The front edge read off the photograph at x = 1205
   (crop px; checked at the rim, every seam and the foot). The right face's difference is smeared by the lower tier's
   bright red rim, so each right seam runs from its corner to the right vanishing point, on the horizon the five left
   lines agree on (y = −2134) where the foot's right edge meets it. Checked: seam 1's slope from its own difference
   (−0.890) and from the vanishing point (−0.891) agree.
4. **Export** at half scale: each tier above its own bottom seam (1 px soft edge), the bottom tier whole, the
   shadow, `geometry.json`.

Not drawn, not stretched, not recoloured. The one resample is registration (sub-pixel to 0.6 degrees) and the halving.

## Round 9 rework (Connor: "could do with being more interesting")

**The prints in the panels.** The demo became a New Year osechi page, one tier per course, so each panel carries a
real print of what its tier holds. Hunted on Commons (`tools/engine/jobs/tabs-fish/hunt/sheet.png`, 19 candidates;
`tabs-veg/hunt/sheet.png`, 3), all `engine.py inspect` PASS:
- Hiroshige, *Uozukushi* (Every Variety of Fish), the Met's impressions (CC0): the sea bream with bamboo (*medetai*,
  the first tier), the spiny lobster and shrimp (prawns, the grilled tier), black and red sea bream with bamboo shoots
  (the simmered tier: *takenoko*). Chosen over his katsuo, aji and flatfish sheets because these are the fish (and the
  shoot) osechi actually holds.
- A 19th-century surimono of a basket of lotus root (LACMA M.79.152.573, public domain) for the vinegared tier
  (*su-renkon*). Hokusai/Hiroshige daikon and turnip sheets were looked for and not found in open collections.
- The fifth tier has no print: it is the tier kept empty.

**The second box, tried and set aside.** Met 57965, the 18th-century incense box (lid + 3 tiers, gold *nashiji* and a
bright gold-leaf bottom tier), photographed tier by tier: `tabs-hunt/sheet-57965-states.jpg`, scratch
`tools/engine/jobs/tabs-kogo/`. Its four states register by SIFT similarity (scale 1.005–1.013, rotation under 1
degree, 0.6 px residual on the bottom tier), but the bottom tier's band then differs by **4.4–6.9 %** between shots
(the striped box: 0.6–2 %) and the exposure moves by up to 8 % (the last shot is darker). Composited a tier from each
photograph, the seams would step in brightness; matching them would mean recolouring the photographs. Left out, on
the "untouched" rule. Diff maps: `tabs-kogo/diffs.jpg`.
