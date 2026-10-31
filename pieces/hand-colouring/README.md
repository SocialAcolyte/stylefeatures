# hand-colouring

A plate from Maria Sibylla Merian's *Metamorphosis insectorum Surinamensium*
(Amsterdam, 1705) coloured by hand as you read. It arrives as the bare
engraving, black-brown line on its own cream paper, the way uncoloured copies
were sold. As you scroll, washes of watercolour go down one area at a time:
the leaves and stems first, then the fruit and flowers, the caterpillar and
chrysalis, the brown morpho underside, and the blue of the open morpho last.
Each wash spreads as a wet front from where the brush went down, held back by
the engraved lines; it is darker and faintly glossy while wet, dries from the
edges inward with its pigment drawn to the rim and settling into the paper's
tooth, and ends as exactly the real coloured plate. Scroll back and it
un-colours.

```html
<link rel="stylesheet" href="hand-colouring.css">
<section data-hand-colouring data-src="assets/pomegranate.json">
  <div class="hc-stage">
    <img class="hc-img" src="assets/pomegranate.webp" alt="" aria-hidden="true" width="2000" height="2673">
  </div>
</section>
<script type="module" src="hand-colouring.js"></script>
```

Or `import { handColouring } from './hand-colouring.js'` and call
`handColouring(section, { src, mode, runway, webgl })`; it returns `destroy()`.

## Options

| attribute     | option   | default  | what it does |
|---------------|----------|----------|--------------|
| `data-src`    | `src`    | required | The plate's JSON (size, paper, the washes in painting order). Next to it: `<name>.webp` (the coloured plate), `-bare.webp` (the uncoloured impression), `-flat.webp` (each wash blurred inside its area: the pigment in suspension) and `-map.webp` (lossless: wash index, arrival time, distance to edge, distance to a damp neighbour). |
| `data-mode`   | `mode`   | `scroll` | `scroll`: a pinned stage on a runway. `static`: the finished plate in the flow. |
| `data-runway` | `runway` | `390`    | Section height in svh. The schedule is laid out in svh of travel (big areas 12-20svh, the morpho's blue about 24svh per wing) and scaled to fit. |
| `data-webgl`  | `webgl`  | `on`     | `off` forces the 2D fallback (a plain cross-fade from bare to coloured). |

Events (bubbling, for sound later): `hand-colouring:wash` with
`detail: { index, kind }` each time a wash goes down while scrolling forward
(kinds: `leaf`, `stem`, `fruit`, `flower`, `caterpillar`, `chrysalis`,
`butterfly`, `morpho`, `morpho-blue`), and `hand-colouring:done` when the
last wash is dry.

## The real thing

What a colourist's wash does on a printed sheet (Curtis, Anderson, Seims,
Fleischer and Salesin, *Computer-Generated Watercolor*, SIGGRAPH 1997; studies
of 18th-century hand-coloured prints; Dill et al. 2021 on Merian's plates):

- The brush carries a bead of thin, gum-bound watercolour. Water runs out
  ahead of the hairs; the wet front advances unevenly (the sizing is uneven),
  creeps along and is slowed by the raised ink of the engraved lines, and
  stops at the outline, now and then a little over it.
- Wet paint is darker and more saturated than it will dry, and the film
  catches the light.
- While wet the pigment is in suspension and the wash looks smooth. As the
  film thins, pigment settles into the paper's tooth (granulation), and
  capillary flow toward the pinned, fastest-drying edge carries pigment to
  the rim: a darker ring, a paler middle. Edges dry first. A dry wash is
  lighter and matte.
- Where a wash is laid against one that is still damp, water runs back into
  the damp one: a bloom, a pale lobe with a dark frilled edge.
- Merian's workshop coloured from painted models, one colour at a time.

Modelled: all of the above, as transients that settle into the plate's own
washes (which already carry their real rims, granulation and blooms).
Simplified: one wash per area (no glazing in layers, no body colour or gum
highlights laid separately); neighbouring leaves or petals are laid as one
passage; two washes are usually wet at once (one spreading, one drying), so
the eye can follow a brush; the order is by kind and climbs the plant from the
cut branch upward, not a documented colourist's order.

## How it works

**Offline (Python, scripts kept out of the component).** From the scan of the
coloured plate:

1. *Line from colour.* In linear light, the least-absorbed channel of each
   pixel is compared with its local mean (a 3.5px Gaussian) and with its
   local ground (a 6px grey closing). A wash darkens all three alike and its
   hue darkens one channel only, so the ratio isolates the engraved strokes
   whatever colour lies under them. A smoothstep threshold gives a clean,
   anti-aliased line mask at full scan resolution, which is area-averaged to
   the output size.
2. *The uncoloured impression.* The paper under the washes is filled in from
   the surrounding paper (normalised convolution at two scales), and the line
   mask is inked in fresh copperplate ink, a warm black-brown `#2a221c` at
   full stroke, keeping the mask's anti-aliasing. Away from the washes the bare image is the scan itself,
   so the start and the end agree everywhere colour never was.
3. *Areas.* The line-free colour layer (a grey closing of the scan) is cut
   into SLIC superpixels inside the painted mask, merged on a region
   adjacency graph by Lab colour, thin pale fringes folded into neighbours,
   split into connected components, then merged again where two areas of the
   same kind meet across a border that is not an engraved line (a light and a
   dark half of one leaf), and into passages of neighbouring leaves or petals.
   Kinds come from colour and from boxes drawn round the insects. 45 washes.
4. *Arrival.* For each area a brush path runs along its principal axis from
   the upper end; the wet front's arrival time is the minimum over points on
   the path of (when the brush got there + geodesic travel time), with a
   speed field of low-frequency noise slowed by 75% on engraved lines
   (scikit-image `MCP_Geometric`).
5. The map holds per pixel the wash index (in painting order), the arrival
   time, the distance to the wash's edge and the distance to the border with
   a wash laid just before it. The outline zone just beyond each wash belongs
   to it and is reached last.

**In the browser.** One quad, one fragment shader. A 256×1 state texture
carries each wash's fill and drying progress, computed from scroll on the
CPU. Per pixel: the wash transmittance is `coloured / bare`; while wet it is
taken from the flat (blurred) wash, darkened (optical density × 1.5) and given
a faint sheen; as it dries (edge first: drying threshold from distance to edge
and arrival time) it moves to the real wash, with a transient rim
`exp(-d/2.6px)`, a paler middle, granulation from a paper-tooth noise, and a
bloom along a damp neighbour. When every wash is dry the shader computes
`bare × (coloured / bare)`: the original plate, pixel for pixel.

- Images are resampled to the canvas's pixel size on the CPU (high-quality
  smoothing), so the hatching never aliases and no mipmaps are needed. The map
  is uploaded once, exact, as an unpremultiplied ImageBitmap and sampled
  nearest.
- Scroll is followed on a critically damped spring (quicker going back).
- The canvas covers the pinned stage and draws the sheet itself (a sharp,
  anti-aliased trimmed edge and a tight shadow). On a narrow screen the sheet
  fills the width, and while it is being coloured the view zooms in (up to
  1.75x, until the sheet nearly fills the height) and drifts after the washes
  that are wet: a camera path computed from the schedule and smoothed along
  the scroll, so it is a pure function of scroll position. It zooms back out to
  the whole sheet at the end. The pictures are packed at the zoomed size and
  mipmapped (WebGL2), so the zoomed-out sheet stays clean; with WebGL1 there is
  no zoom.
- The map is lossless WebP saved with `exact` (no alpha-0 pixels), decoded as
  an unpremultiplied ImageBitmap, so the wash indices arrive intact.

## Theming

| variable      | default                  | used for |
|---------------|--------------------------|----------|
| `--paper`     | `#f3f0e8`                | the page around the sheet |
| `--hc-gutter` | `var(--gutter)`          | side padding of the stage (the demo uses 5px on phones so the sheet fills the width) |
| `--hc-runway` | set by the script        | section height in scroll mode |

The sheet keeps the plate's own paper: it is a page of a book, a trimmed sheet
with a tight shadow, edge sharp.

## Accessibility and motion

- Without JS the finished coloured plate stays as an `<img>`; the canvas is
  `aria-hidden`. The art is ornament (`alt=""`); credits are in
  `assets/credits.json`.
- Reduced motion: no runway, the finished coloured plate, still.
- Phone: the plate fills the width; nothing is interactive, so a swipe always
  scrolls.

## Cost

- Assets 3.1 MB: coloured 0.8 MB, bare 1.1 MB, flat 0.1 MB, map 1.1 MB
  (lossless), JSON 4 KB.
- One full-screen quad, about a dozen texture reads per pixel inside washes,
  one inside untouched paper. A frame draws only while the scroll spring is
  moving and the section is on screen (IntersectionObserver); nothing runs
  when idle or in a hidden tab. DPR capped at 2.

## Making a new plate

Scripts (in the builder's scratch folder): `s1_layers.py` (crop inside the
sheet, white balance, wash layer, paper, painted mask), `s2_bare.py` (line
mask, uncoloured impression, tinted-hatching areas), `s3_segment.py`
(superpixels and colour merging), `s4_schedule.py` (folding, kinds, order,
arrival fields, export). Each plate needs a small JSON of boxes round its
insects and fruit. Look at the bare image and the area map at full size
before exporting.

## Credits

Maria Sibylla Merian, *Metamorphosis insectorum Surinamensium*, plate 9
(pomegranate with blue morpho), engraved by Joseph Mulder, Amsterdam 1705,
hand-coloured. Smithsonian Libraries copy, digitised for the Biodiversity
Heritage Library (Internet Archive `Metamorphosisin00Meri`). Public domain.
The separation is ours. No third-party code.
