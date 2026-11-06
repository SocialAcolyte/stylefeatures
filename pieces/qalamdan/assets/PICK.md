# qalamdan: the pick

Contact sheets (scratch, `tools/engine/jobs/`):
- `qalamdan-box-cands/box-sheet.jpg`: the box shortlist, 19 views of 11 boxes, labelled.
- `qalamdan-met-scan/sheet-p0..p5.jpg`: every view of 22 Met pen boxes, 186 tiles.
- `qalamdan-met-boxes/sheet.jpg`: the four boxes the brief named, 53 views.
- `qalamdan-cma/sheet.jpg`: Cleveland's two pen-and-ink boxes, 42 views.
- `qalamdan-commons1/hunt/sheet.png`: Commons, 29 candidates (Louvre, Aga Khan, LACMA, Walters, Khalili, sale rooms).

`engine.py inspect` ran on every shortlisted box view (`qalamdan-box-cands`). All are sharp: no enlargement, detail at
every scale. The WARNs are only "near-perfect symmetry", which a pen box seen square-on is.

## The box: Met 2018.664a–d, Fathallah Shirazi, Shiraz, mid-19th century

A papier-mâché qalamdan painted in grisaille on a gold-yellow ground: bulbuls on flowering branches, a pair billing
on one twig, roses, butterflies, gold sprigs, a wave border. It is signed in the painting, *ʿamal-e Fatḥallāh
Shīrāzī* ("work of Fathallah Shirazi"), with a dedication along the top edge. This is *gul o bulbul*, the rose and the
nightingale, by a named Shirazi master (active 1850s–80s). 22 cm long. The Met, Gift of Dara Zargar, 2018, CC0.

The Met photographed it apart, from straight above, in one documentation campaign (LC-2018_664a):
- the sleeve's top, `d6`: 3196 × 576, about 145 px/cm;
- the tray from above, `d2`: 3189 × 569, its black-lacquered well and its end cap with the gold-on-black rim;
- plus the sides, bottoms and ends of each (`d1`–`d16`).

A third view (DP-19012-002, a later campaign, three-quarter) shows it closed. That is the reference for how the
sleeve's rounded tongue sits inside the tray's U-shaped end rim.

**How it stays untouched.** Both moving pieces come from one campaign and one angle: straight down, flat diffuse
light, the same scale (checked by fitting the tongue into the rim). The sleeve is one rigid cut-out and the tray
another. Closed, the tray lies under the sleeve with the tongue in its rim, as on the three-quarter photograph. Drawn,
the tray slides out along its own axis, and nothing of it shows that the Met didn't photograph: the sleeve covers the
rest. No pixel is redrawn, stretched or recoloured.

### Why this one, not the others

| box | what it has | why not |
|---|---|---|
| **Met 2018.664, Fathallah Shirazi** | sleeve and tray each photographed from above, one campaign, 145 px/cm; *gul o bulbul*, signed, Shiraz | **picked** |
| Cleveland 1942.854, Qajar 1800s | closed from above, plus sleeve and tray from above with its own silver filigree inkwell in place, very sharp | dark, worn figure painting; the runner-up (and its inkwell is a candidate tool) |
| Met 2006.523, Shah Ismaʿil's battle | closed from above (DP146066, 4000 px) | the only "drawn" view (wb-tr…b) is from an older campaign, 2012 px, and the tray is out only 2 cm |
| Met 2002.416 (the brief's 454353) | 20 views, tray and sleeve apart | Deccan or Northern India, not Persian |
| Met 900456 (1881–82), 900458, 456900 (1743–44), 648056 | closed and drawn from what looked like one setup | difference images show the box was moved and turned between the two shots, every time |
| Met 444615 / 444616 | closed three-quarter, and open with the tray lying beside | different angles |
| Met 648051, Muhammad Sadiq, 1793–94 | glorious Zand *gul o bulbul* | a lidded box, not a sliding tray |
| Cleveland 1940.689 | the same set of views as 1942.854 | Safavid, 1667–98, outside Zand–Qajar |
| Louvre, Aga Khan, LACMA, Walters, sale rooms on Commons | single closed views, some CC BY-SA | no drawn view from the same campaign |

### The tray's well

Black lacquer, glossy, with soft reflections. A small paper dealer's label is stuck to the floor about two thirds of
the way along (tray px 1036–1233 × 75–228). The tools lie over it, the way a calligrapher's things would, and the
writing never runs across it (`LABEL` in the JS).

Measured on `d2`:
- the well is 2.76 cm across at the rims and about 2 cm on the flat floor;
- it runs 20.7 cm from the inner end to the end rim;
- an inkwell at the end leaves **15.3 cm** beside it. Every tool had to fit that, at its catalogued length.

## The tools

Contact sheets:
- `qalamdan-tools-met/contact-sheet-met.jpg` (25 objects, 97 views);
- `qalamdan-tools-cma/contact-sheet-cma.jpg`;
- `qalamdan-tools-cz/contact-sheet-cz.jpg` (Náprstek Museum, Prague, via Europeana);
- `qalamdan-tools-commons/contact-sheet-commons.jpg`.

Plus the Khalili set (`qalamdan-hunt/khalili/`), the Walters writing set (`qalamdan-hunt/walters/`), the Cleveland
boxes' own tools (`qalamdan-cma/`), and the line-up of the picks on the tray's own lacquer at 74 px/cm
(`qalamdan-work/lineup.jpg`). `engine.py inspect` ran on every candidate folder; all the picks pass.

### The five that lie in the tray

All five are photographed straight down, lying flat: the same camera angle as the box. Light: the box's documentation
photographs are lit soft and nearly shadowless from above, with the gloss on the far edge (12 o'clock). Background
colour gives each photographer's white balance (McCamy CCT from the sweep around the object, `measure_light.py`).

| tool | object | collection | size (catalogue) | in the tray | source px/cm | ground, white balance | light (in the tray's frame) |
|---|---|---|---|---|---|---|---|
| inkwell (*davat*) | silver filigree inkwell, Iran, Qajar, 1800s | **Cleveland** 1942.854.c, CC0 | 5.4 × 2.7 cm (measured against its own box, 22.3 cm) | 401 × 199 px, in the end compartment, its rounded end in the rim | 115 | grey sweep (94, 94, 94), 6490 K | key from 9, cast shadow to 3 (cut away) |
| penknife (*qalamtarash*) | steel blade inlaid with gold, nephrite handle with emeralds and rubies, Turkey | **Walters** 57.620, CC0 | 15.24 × 0.95 cm | 1134 px, along the near wall, blade to the inkwell | 76 | black velvet | top-lit facets, soft |
| reed pen in its holder (*qalam*) | gilded penholder with emeralds and rubies, cut reed nib, Turkey, 18th c. | **Walters** 51.87, CC0 | 14.29 × 0.95 cm | 1063 px, along the far wall, nib to the inkwell | 76 | black velvet | top-lit, soft |
| plate (*maqta'* shape; the Met calls it a pen rest) | carved and pierced bone, probably Turkey, 17th–18th c. | **Met** 21.6.110, CC0 | 12.7 × 2.2 × 0.3 cm | 943 px, under the pen and the knife, its pierced tip at the mouth | 136 | warm grey (182, 168, 163), 5620 K | diffuse, faint shadow to 3 |
| ink spoon | parcel-gilt silver spoon, Turkey, dated 1223 AH / 1808–9 | **Met** 97.2.205, CC0 | 9.2 × 2.5 cm | 683 px, on top, its bowl by the inkwell | 251 | tan paper (171, 131, 100): warm, not a neutral | key from about 3, shadow to 9 |

The tray itself is (213, 204, 191), 5640 K, and the sleeve (216, 210, 201), 5930 K. The bone plate matches them. The
silver inkwell's neutral grey (6490 K) reads as silver, not as a cast. The spoon is the warmest piece: tan paper bounced
into the gilt. It lies on the dark well where warm gold is expected, so it was kept and not recoloured. The Walters
pair were shot on black, so no edge of their old ground shows against the black lacquer. Contact shadows are the only
addition: two short CSS drop-shadows per tool, fading within a millimetre or two.

Scale is the catalogue's: each tool's `--w` is its length × 74 px/cm. The inkwell has no size of its own in
Cleveland's record (it is catalogued with its box), so it was measured on the same photograph against that box
(22.3 cm). It comes out 2.7 cm wide, exactly the width of the end of a qalamdan tray, which is what it was made for.

### What the hunt could not get, and why

- **A fourth collection.** The brief asks for tools from at least four. These are from three: the Met, Cleveland,
  the Walters. Every small Persian or Ottoman calligrapher's tool in open access that fits a 22 cm box is above.
  Ruled out:
  - **Khalili** (on Commons, CC BY-SA). A superb Ottoman set, c. 1850 (scissors, knife, pen rest: `sci 0264`), but
    the pieces measure 27.7, 22.6 and 16.5 cm. None fits beside an inkwell in a 22 cm box.
  - **Náprstek Museum, Prague** (CC BY 4.0). Twelve Persian pairs of scissors, four of them 14.8–15.2 cm long, but
    the museum's largest images are 500 px (33 px/cm): soft at 2×. Sharp or nothing.
  - **LACMA**: its Ottoman penknife is 23 cm.
  - **Smithsonian (Freer|Sackler)**: the API key was rate-limited for the whole session; re-run
    `qalamdan-tools-scripts/si_search.py`.
  - **AIC, Cooper Hewitt, Yale, Rijksmuseum, Minneapolis, Brooklyn**: nothing Persian or Ottoman of the kind.
  - **Commons photographs of qalams** (a Persian calligrapher's own pens, modern Catalan reeds): no measurements, and
    at any reasonable reed diameter they are 18–20 cm: too long to lie beside the inkwell.
- **One culture.** The box and the inkwell are Qajar. The knife, the pen, the plate and the spoon are Ottoman, the
  nearest neighbours: Istanbul and Isfahan cut the same reeds the same way. Persian penknives and *maqta'* survive,
  but not in any open collection at full size.
- **Reed pens.** The Met's reed pens are from Roman and Byzantine Egypt (the lead's Midjourney report and I agree:
  wrong culture, centuries early), so the reed in the tray is the cut nib in the Walters holder.
- **Scissors** were 25–28 cm everywhere. That is true to life: a calligrapher's paper scissors lived on the desk, not
  in the pen box.
- **Midjourney: nothing generated.** The lead's sweep (`qalamdan-mj/REPORT.md`) found no usable tool. A generated
  one would be an invented object under a promise that every tool is a museum photograph.

### How they lie (and the words)

A calligrapher's full kit fills the well. The pen and the knife lie along the two walls, the plate under them, the
spoon on top, and the inkwell in its compartment. No lane of lacquer is left wide enough for a line of type. So the
full-kit switch ("Show the tools") shows only its tools (pretext finds no run; that is the rule). The second switch,
"Write the couplet", carries a lighter kit: the pen, the spoon and the ink. It leaves the far lane free, and Rumi's
couplet is written there, one half-line to a line.
