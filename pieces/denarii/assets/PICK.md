# Pick note (sf-chart, 2026-11-03)

**Picked: Roman silver, denarii with quinarii as halves, from the Art Institute of Chicago (CC0), counted out on a
wool tunic fragment from Egypt, 400s-600s (Cleveland Museum of Art 1946.413, CC0).**
187 denarii and quinarii were cut (both pages of AIC's search). After culling the worn ones, two "quinarii" bigger
than many denarii, and every coin whose obverse measures darker than 0.38 lightness or more cast than 0.08 (the
purple-black toners, `tone.py`, sheet `sf-chart-work/sheet-dark.png`), the pool is 144 denarii and 3 quinarii.

## Contact sheets (in `tools/engine/jobs/`)

- `sf-chart-commons1/hunt/sheet.png`: tally sticks, quipu/khipu, strings of cash coins, Salamis tablet, Roman hand abacus (33).
- `sf-chart-commons2/hunt/sheet.png`: Henry III long-cross pennies, cut halfpennies and farthings, Edward I pennies, Athenian owls (62).
- `sf-chart-hunt/sheet-denarii.png`: Art Institute of Chicago Roman coins, all denominations (131).
- `sf-chart-hunt/sheet-cma.png`: Cleveland Museum of Art Greek, Roman, Byzantine and English coins (150 of 556).
- `sf-chart-hunt/pool-obverse.png`, `pool-reverse.png`: the cut pool, both faces, to scale.
- Met Open Access search logs: `sf-chart-hunt/log-*.txt` (few usable coins; no quipu, tallies or wampum with images).

## Shortlist

1. **Roman denarii + quinarii, AIC.** One studio, one light, one flat grey ground (exactly 113 grey, sd 0.2), 3000 px
   masters with each face 500-1150 px across. Every face passed `engine.py inspect`. The diameter is recorded per coin, so
   each one keeps its true size. The quinarius is the real half-denarius (V against X), so halves are real coins too.
2. **English long-cross pennies with real cut halves and quarters** (Portable Antiquities Scheme, Commons, CC BY / BY-SA).
   The craft is lovely: Henry III's long cross was made to guide the shears, so fractions are real cut pieces. But they
   are worn field finds, shot on mixed grounds with scale bars in the frame, and too few are sharp and clean. Second.
3. **Athenian owl tetradrachms** (Cleveland 9, AIC 4, Commons). Mostly case photos, under glass or on black velvet.
   Too few for a pool that never repeats a coin.
4. **Strings of cash coins** (Commons CC0, 5184 px). Real, but grimy clumps. You can't count units in them.
5. Quipu, tally sticks, abacus: museum-case photographs through glass, and none of them reads as a chart at a glance.

## Why this one

A bar chart's job is "how many of a unit", and the denarius was Rome's unit of account: X, ten asses, struck on it.
Every coin is a separate photograph of a separate hand-struck coin, so any value is built from real, interchangeable
units, never a stretched picture. And the half is a real half.

## Second pass: the ground (2026-11-03, after the lead's review)

The coins floated on page colour. Hunted a real surface to lay them on:

- `sf-chart-surface1/hunt/sheet.png`: Rechentisch and counting tables (Strasbourg, Basel), Rechenbrett, Rechentuch,
  Roman marble tables, Matsys's *Moneylender and his Wife*, Reymerswaele's money-changers (32).
- `sf-chart-surface2/hunt/sheet.png`: the Salamis tablet (no photograph on Commons), cartibulum and Pompeii tables,
  Diocletian's mensa (6).
- `sf-chart-hunt/sheet-tex.png`: Cleveland's large CC0 textiles from Roman and Byzantine Egypt (12 of ~180).

Shortlist:
1. **Wool tunic fragment, Egypt, 400s-600s, Cleveland 1946.413 (picked).** Saffron tabby, 64 × 39 cm, a plain field
   156 mm tall between two tapestry bands with a corner band at the left. The full TIFF is 6345 px (9.9 px/mm),
   sharp to the thread. It is Roman-world cloth, Coptic textiles are on Connor's loved list, and the field between
   the bands is a counting area.
2. Strasbourg *Table à calculer des receveurs de l'Œuvre Notre-Dame* (CC BY-SA 4.0): a real counting table with
   bone-inlaid lines and *lib*. But it is 16th-century, its lines are ~15 cm apart, and the wood is plain.
3. Matsys and Reymerswaele: a painted green cloth with painted coins. Photographed coins on painted cloth mix two
   kinds of picture.
4. Undyed tunic sections (Cleveland 1993.177, 1914.800): beautiful, but more loss than cloth.
