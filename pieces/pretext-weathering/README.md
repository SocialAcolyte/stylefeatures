# pretext-weathering

A paragraph cut into a block of sandstone, and three hundred years of
weather, scrubbed by the scroll. At the top of the runway the stone is
fresh from the mason: crisp V-cut letters with pale dust in the grooves,
sharp arrises, a tooled margin. Scrolling down, decades pass: the arrises
round off and the serifs and hairlines go first, the face darkens and warms,
grime settles in the cuts. Then the rain: water drains out of the foot of
every letter and stains the face below it, drips run down from the top, and
the top of the face is washed pale. Then the lichens arrive as specks and
grow as rosettes, orange along the top where birds sit, grey-green and grey
crusts on the face, black dots in the damp, with moss in the bottom of the
grooves low down. At the end a crack runs in from the top and the face
scales off at a corner, and the text is at the edge of legibility. Scrolling
back cuts it fresh again, through exactly the same frames.

```html
<link rel="stylesheet" href="pretext-weathering.css">
<section data-pretext-weathering data-years="1726 2026">
  <div class="pw-stage">
    <p class="pw-text">Traveller, this is the ford at Ellerbeck. …</p>
  </div>
</section>
<script type="module" src="pretext-weathering.js"></script>
```

Or `import { pretextWeathering } from './pretext-weathering.js'` and call
`pretextWeathering(section, options)`; it returns `destroy()`.

Write the paragraph plainly, 120 to 200 words; put soft hyphens (`&shy;`)
in long words so narrow stones justify well (pretext breaks at them and the
hyphen is cut).

## Options

Data attributes on the section, or the options object (which wins).

| attribute | option | default | what it does |
|---|---|---|---|
| `data-years` | `years` | `1726 2026` | The span the runway covers, shown small beneath the stone as it passes. `data-years=""` hides it. |
| `data-rest` | `rest` | `0.78` | Where time rests with reduced motion (0 fresh, 1 ancient): weathered, lichened, still legible. |
| `data-seed` | `seed` | `3` | Places the lichens, the streaks, the crack and the spalls. `random` gives a new stone each visit. |
| `data-leading` | `leading` | `1.62` | Line pitch, x the font size. |
| `data-max-size` / `data-min-size` | `maxSize` / `minSize` | `30` / `11` | Bounds for the type size (css px); the largest size that fits the stone is used. |
| `data-last` | `last` | `centre` | The last line `centre`d, as carved, or `left`. |
| `data-font`, `data-weight` | `font`, `weight` | the `<p>`'s | Canvas type, if it should differ from the fallback's. |
| `data-stone` | `stone` | `assets/stone.webp` | The stone photograph (same origin). Its colour varies around `--pw-stone` and its fine grain becomes the relief. |
| `data-atlas` | `atlas` | `assets/lichens.webp` | A 3 x 2 atlas of seamless tiles: Xanthoria, Caloplaca, Lecanora muralis, grey crust, Verrucaria, moss. |

## How it works

1. **Setting.** pretext prepares the paragraph once at 100px. Widths are
   linear in size, so a binary search re-sets it at eighteen trial sizes
   without touching the DOM and keeps the largest that fills the stone (at
   most 5% of its width, at least 11px). Each line is justified word by word
   on the canvas (gaps up to 2.6 spaces), the last line centred.
2. **The cut.** The letters are drawn into a mask at device resolution and
   an exact Euclidean distance transform (Felzenszwalb) turns it into the
   depth of a V-groove: deepest along the middle of each stroke, two flat
   walls meeting in a crease. Wear is that same field blurred three times
   wider (radii 2.4%, 6% and 12% of the type size), stored as four channels
   of one half-float texture; the shader blends between them by the local
   wear, so arrises round first, then thin strokes and serifs fade, then the
   letters become soft troughs.
3. **Wear varies.** Wear is a master clock times a weakness map: soft beds in
   the stone (noise), the foot of the block (splash and rising damp), the
   top. Soft grains (the photograph's darker specks) wash out as pits.
4. **Rain.** In a worker, walking down each column: water collects in a
   groove and leaves at the foot of the stroke (only some feet shed a
   visible tail), sheds from the top edge in a few places, seeps out of the
   crack and runs off the lower lip of a spall. Each streak gets its own
   strength and length, whole stretches of the face stay clean, and each
   pixel stores the moment it is first stained. A faint blurred halo gives a
   soft patina round the streaks rather than stripes. The top of the face is
   washed pale.
5. **Lichen.** Colonies are seeded where lichen does well (a noise map of
   rougher, damper stone, the top edge where birds perch and feed it
   nitrogen, the sides, the tops of the letters, along the crack) and grown by a multi-source Dijkstra on a 2px grid:
   every cell stores the moment its colony reaches it. The substrate's speed
   is noisy and slow in the deep of the grooves (lichens avoid them, then
   creep in), and each colony has its own lobing, so fronts come out as
   lobed rosettes. Radial growth at a steady rate is what lichenometry dates
   stones by. The grid is coarse, so the shader settles ownership per device
   pixel: each of the four nearest cells offers its colony's arrival time
   plus the walk from the cell's centre at that colony's speed, and the
   earliest wins; where the runner-up arrives almost as soon, two colonies
   have met and a dark seam is drawn between them, as real ones make. It
   thresholds that time by `t` (with a little noise for a crumbly margin).
   Crusts lie flush (lit by the stone's own normals, so a groove under a
   colony still shows), feather out over a few px, wander along the grain
   of the stone photograph, and are zoned: a paler, finely lobed margin, an
   older, darker areolate middle that can die back to a ring, and on some a
   black prothallus line. Sizes are heavy-tailed: many specks for each big
   colony. Each colony is coloured from a seamless tile cut from a photograph of its
   species, turned and shifted per colony. The margin grows out in lobes
   (noise laid out in arc length and radius round each colony's centre, so
   it stretches into fingers), the young rim is brighter (yellow lobes on
   the orange species, pale ones on the grey-green), old crusts die back in
   the middle, and the foliose orange ones stand a little proud so the
   light catches their edge. Black dots are drawn exactly, round, as their own field.
6. **Centuries.** A fractal crack grows in from the top edge at t 0.68-0.9,
   with a long branch and short side branches. It is a V in the face (lit
   and shaded walls, a narrow dark core), a hairline at the tip and about
   2 css px where it opened long ago, with water stain soaked in either
   side, moss and a few lichens taking hold in it, and streaks below. A
   spall takes the right edge at 0.83 (and the ends of a few letters with
   it) and a smaller one the left edge at 0.93: a rough wall about 2 px
   wide, lit on one side and shaded on the other, its rim casting a shadow
   onto a rougher, paler floor that weathers a little afterwards.
7. **Clean edges.** Outside a cut the slope is the gentler one-sided
   difference, so the face right at a letter's edge stays flat: the two
   facets are inside the stroke and nothing spills onto the stone.
8. **The light.** One WebGL2 fragment shader rebuilds the height (groove,
   photo relief, tooled margin, rounded and chipped arris, crack, spall,
   lichen) at four neighbours for the normal, and lights it from the upper
   left, low enough that the far wall of every cut flares and the near one
   falls into shadow. A mouse (or a tilted phone) nudges the light slightly.

Nothing grows per frame: `t` from the scroll picks the frame. Everything is
deterministic, so scrolling back runs the same frames in reverse.

## Theming

| variable | default | used for |
|---|---|---|
| `--pw-stone` | `#dcc6a0` | the stone, fresh (the photograph varies around it). A pale grey limestone: `#cfc9bb`; a red sandstone: `#c79a7c`. |
| `--pw-runway` | `520svh` | length of the scroll runway |
| `--pw-serif` | EB Garamond | the fallback face (the canvas copies the `<p>`'s family and weight) |
| `--sans`, `--ink-3` | | the year beneath the stone |

## Tuning

- **The clocks** are in `draw()`: erosion `uE`, patina, grime, dust, rain,
  bleaching and soot, each a smoothstep of `t`. Lichen birth times are in
  the worker's colony seeding; crack and spall times beside them and in
  `uSpallT`.
- **The groove.** `uK` (1.05) is the wall slope; the wear radii are
  `wear` in the worker.
- **The light.** `lz` (0.5) in `draw()`: lower is more raking and
  dramatic.
- **Lichen amount.** The colony counts (`nX`, `nG`, `nC`, `nB`) scale with
  the stone's area; their radii are fractions of its width.

## Accessibility and motion

- The `<p>` stays in the DOM: read aloud, found by ctrl+F, printed. Once the
  stone is live it is visually hidden; the canvas and the year are
  `aria-hidden`.
- Without JS or WebGL2 the paragraph is set in a serif on a block the colour
  of the stone, justified, with a soft shadow.
- Reduced motion: no runway; the stone is shown weathered but legible
  (`data-rest`), with no easing anywhere.
- Phone: the stone fills the width; type stays at least 11px (17px on a
  390px phone). `touch-action: pan-y`; nothing captures a swipe.

## Cost

- Precompute runs once per layout in a Worker (built from a Blob; on the
  main thread if a worker cannot be made): about 0.5-1 s for a 1000px stone
  at 2x (two distance transforms, three blurs, the Dijkstra over ~200k
  cells), 0.55 s for a phone-sized stone. Until it is ready the plain
  paragraph shows; on a resize the old frame stays up.
- A frame is one full-canvas fragment pass (five height evaluations a pixel,
  about forty texture reads), drawn only when the scroll or the light
  changes, and only while the stone is on screen; 6-11 ms at 1440x900 x2 in
  headless Chrome on an M-series Mac. Whole terms are skipped while their
  time has not come (lichen, crack, spall, moss). Canvas DPR capped at 2,
  or 3 for a stone under 0.38 Mpx css (a phone), where 2 would show soft.
- Textures: the glyph field (RGBA16F at device size), two RGBA16F fields and
  one RGBA8 at css size, the stone photo and the lichen atlas (mipmapped).

## Credits

- [pretext](https://github.com/chenglou/pretext) by Cheng Lou, MIT
  (`vendor/pretext`, unmodified, see its `LICENSE` and `VERSION`).
- `tilt.js` copied from the house components.
- The stone: *Sawn limestone texture* by Titus Tscharntke, public domain.
- The lichen and moss tiles: *Caloplaca saxicola* by Stephen James
  McWilliam and by mister_bumble (CC BY 4.0), *Lecanora muralis* by
  Rudolphous (CC BY-SA 4.0), *Myriolecis albescens* by Igor Yevdokimov
  (CC BY-SA 3.0), *Verrucaria nigrescens* by Nova Patch (CC BY-SA 4.0),
  *Grimmia pulvinata* by Stephen James McWilliam (CC BY 4.0), all via
  Wikimedia Commons. Sources in `assets/credits.json`.
- The text was written for this component.
