# pretext-rain

A handwritten letter left out on a garden table, and a shower coming over it
as you scroll. The first drops sit on the sheet as glossy beads and sink into
dark round spots; the fountain-pen ink in their way redissolves and bleeds out
with the water, the line left a shade more violet and the edge of the stain
turquoise. The shower thickens, the spots join, the sheet goes dark and
half-transparent so the postscript on the back shows through, mirrored; where
the drips off the hedge fall hardest the water stands and runs down the sheet
and takes the ink with it. Then it stops, and the wet dries from the edges in,
leaving tide lines and the writing soft and feathered where it ran. Scroll
back and the letter is dry and fresh again.

```html
<link rel="stylesheet" href="pretext-rain.css">
<section data-pretext-rain>
  <div class="pr-stage" aria-label="A letter left out in the rain. Tap the letter, or press Enter, to let a drop fall on it.">
    <article class="pr-letter">
      <p class="pr-date">Roundstone, 14th August</p>
      <p class="pr-greet">Dear Una,</p>
      <p>I am writing this at the table under the fuchsia …</p>
      <p>The garden doesn't mind …</p>
      <p class="pr-close">Your loving mother,</p>
      <p class="pr-sign">Maura</p>
      <p class="pr-ps">P.S. There's another one coming in over the island now …</p>
      <p class="pr-verso">P.P.S. Mrs Joyce asks …</p>
    </article>
  </div>
</section>
<script type="module" src="pretext-rain.js"></script>
```

Or `import { pretextRain } from './pretext-rain.js'` and call
`pretextRain(section, options)`; it returns `destroy()`.

The paragraphs are read in order. Classes set their place on the sheet:
`pr-date` (right-aligned), `pr-greet`, plain `<p>` (body, first line
indented), `pr-close` (from 40% in), `pr-sign` (from 58%), `pr-ps`. A
`pr-verso` paragraph is written on the back of the sheet: it is only seen
through the paper, mirrored, faintly when dry and clearly where wet. 150-220
words on the front fit well. The face is the `.pr-letter`'s own
`font-family` (the demo loads Homemade Apple, which reads as a real pen and
stays legible at 11px on a phone).

## Options

Data attributes on the section, or the options object (which wins).

| attribute | option | default | what it does |
|---|---|---|---|
| `data-seed` | `seed` | `7` | The sheet's fibres and flocs, the cockle, the drop schedule and where the downpour falls hardest. `random` gives a new shower each visit (the default is tuned so the run crosses the writing). |
| `data-heavy` | `heavy` | `1` | How hard the shower comes down: scales the downpour (drops and the standing water that makes rivulets). `0.5` is a passing shower; `2` washes most of the letter out. |
| `data-aspect` | `aspect` | `1.38` | Sheet height / width (a phone may make it taller, up to 1.7). |
| `data-leading` | `leading` | `1.85` | Line pitch, x the font size. |
| `data-font`, `data-weight` | `font`, `weight` | the letter's | Canvas-only face, if it should differ from the fallback's. |

## The real thing

What a real observer sees, and what is modelled:

- **A drop on writing paper.** A raindrop is 2-4 mm across. On sized paper
  it stands as a bead for a moment, then sinks; 80 gsm paper holds about
  6 µL/cm², so one drop wets a spot 1.5-2.5 cm across. *Modelled:* each drop
  lands as a dome of standing water (a bead, which refracts the writing under
  it and catches the sky); the paper takes it up only as fast as it has room
  and the water wicks outward, so the bead drains as the spot grows.
- **Wicking.** The wet disc grows roughly as the square root of time
  (Lucas-Washburn) and stops when the water is spread thin; it reaches a
  little further along the grain, and its front is ragged at the scale of
  fibre flocs. *Modelled:* nonlinear diffusion (mobility ∝ water²), so fronts
  are sharp and slow as they thin; faster along the grain (+30%) and along
  individual fibres (short segments, mostly with the grain, that wick up to
  twice as fast along their length: this is what feathers the ink); slower
  in the dense flocs of the real sheet (its formation, from the scan).
- **Wet paper.** Darker and more transparent: water fills the air gaps that
  scatter light. *Modelled:* wet paper is darkened and greyed, the sheet's
  cloudy formation comes up, and the writing on the back shows through,
  mirrored (also, very faintly, when dry).
- **Washable blue ink is a dye, and more than one.** Water redissolves it
  and the moving water carries it; each dye shares itself between the water
  and the cellulose in its own ratio, so the run separates as in paper
  chromatography. *Modelled:* two dyes, violet (held hard) and turquoise
  (runs), which together make royal blue by Beer-Lambert absorption. The
  line keeps its violet, the stain's edge goes turquoise. Iron-gall ink would
  hardly move; this letter is written in washable blue.
- **A downpour.** Once the paper is saturated, water stands on it, gathers
  in the valleys of the cockle and runs down the sloping sheet in narrow
  rivulets that carry dissolved dye. *Modelled:* a downpour adds an even film
  where it falls hardest (drips from the hedge above the table). A single
  bead on sized paper stays put (a high pinning depth), so a word that got
  wet stays where it is; under the downpour, and along the rivulets traced
  from the bottom of that patch down the valleys of the cockle, the pinning
  is low and standing water flows to the three cells below, split by the
  slope of the sheet, carrying its dye. The ink runs only there.
- **Drying and tide lines.** Evaporation is fastest at the thin edge of a wet
  patch, so water flows outward from the middle and leaves its dissolved
  matter at the last line to dry (Deegan et al. 1997, the coffee ring). The
  wet area shrinks from the edges in. *Modelled:* evaporation three times
  faster at the edge; the paper's own solubles (size, lignin, dirt) dissolve
  and ride the water, so the ground the water covered is left cleaner.
  The tide line is drawn once, where that cleaned ground ends: sharp and
  darkest on its outer edge, fading inward over a few px, brown-yellow.
- **Cockle.** Wet fibres swell and the sheet buckles into soft waves along
  the grain, and keeps some of it when dry. *Modelled* as shading only.

Simplified: one layer of paper (no through-thickness flow, so the back's
writing does not run), no splash crowns (a splash is a few satellite
droplets), no wind, and the sheet does not move. The verso's ink is drawn,
not simulated.

## How it works

1. **Writing.** pretext (Cheng Lou) prepares each paragraph once at 100px;
   a binary search re-sets the letter at eighteen trial sizes and keeps the
   largest that fills the sheet, with ragged `layoutNextLine` lines. Each
   line is written onto a canvas at device resolution with a hand's
   irregularities (a drifting baseline, a slight slope, ink running drier
   between dips of the pen). The back is written the same way, mirrored.
2. **The paper.** A grid of 200 cells across the sheet (the same on every
   screen, so the shower is the same everywhere). Fixed fields: permeability
   and fibres; the cockle and the downhill split for standing water; the
   written ink per cell (each dye's starting place).
3. **One step** is three passes of one fragment shader with two outputs
   (RGBA32F water: in paper, standing, solubles dissolved and fixed; RGBA16F
   dye: violet and turquoise, fixed and dissolved). Fluxes are computed the
   same way from both sides of every link, so water and dye are conserved.
4. **The shower** is a seeded schedule over 2400 steps: a few first drops,
   thickening, a downpour, easing off, then drying. Scroll progress picks the
   step; the simulation steps forward to it (up to ~40 steps a frame,
   adapting to the frame time). Every 200 steps the state is copied to a
   checkpoint, so scrolling back restores the nearest checkpoint and steps
   forward from there: exact and quick. While it replays, the last good
   frame stays up.
5. **Drawing.** The state is smoothed with a cubic B-spline when sampled. The
   written line comes from the crisp ink texture, scaled by how much of each
   dye is left in its cell. Where it has been wet, it spreads out from the
   stroke in every direction: a soft violet halo hugging it and a wider
   turquoise one, both broken into fine tendrils by a fibre texture
   stretched along the grain (no offset copies). The dye that has really
   moved (the drip patch, the rivulet, the edges of big drops) is drawn from
   the grid. Paper is the real sheet. Beads and
   films of water refract, darken at the rim, and carry a soft sky and a
   small highlight.

A **tap** lets one drop fall where you tap: it is inserted into the timeline
at the current step and given 160 steps to soak in (about three seconds).
Scrolling back past that step removes it; scrolling forward again brings it
back. **Enter** on the focused stage drops one somewhere on the letter.

## Events

| event | detail | when |
|---|---|---|
| `pretext-rain:drop` | `{ x, y, size, tap, intensity }` (stage px, size as a fraction of the sheet width, intensity in drops per step) | a drop lands, scrolling forward (at most three per frame), or a tap |

## Tuning

All in `build()` (`SIM` uniforms) and the schedule functions:

- `uDw` wicking speed (stable up to ~0.085 with three passes a step);
  `uKa` how fast standing water soaks in; `uScrit` the pinning depth for a
  bead (3.5 under the downpour and along the rivulets), `uSr` how fast
  standing water runs.
- `uKb` how hard each dye (violet, turquoise) and the solubles hold to the
  fibres: raise the first two to keep the letter more legible. `uDis`/`uAds`
  how fast they dissolve and set again. `uDm` diffusion within the water.
- `rate(f)` drops per step over the shower, `film(f)` the downpour, `evap(f)`
  drying, the drip mask in `staticFields()`.
- Look: the wet tint (about 10% darker, the cream deepening to oatmeal, the sheet's texture stronger), show-through,
  dye absorbances `kA`/`kB`, the halos (`haloA`, `haloB`), tide-line
  strength and cockle `amp` in `SHEET_FS`.

## Theming

| variable | default | used for |
|---|---|---|
| `--pr-sheet` | `#f6f0e2` | the sheet's tint (multiplied with the real paper) |
| `--pr-ink` | `#1f3277` | the plain letter's ink (fallback) |
| `--pr-hand` | Homemade Apple | the face (the canvas copies the `.pr-letter`'s font) |
| `--pr-runway` | `280svh` | length of the scroll runway |
| `--gutter` | | side padding of the plain letter |

The stage greys a few per cent while the shower is overhead.

## Accessibility and motion

- The letter is real text in the DOM: read aloud, found by ctrl+F, printed.
  Once the canvas is live it is visually hidden; the canvas is `aria-hidden`.
- Without JS, WebGL2 or float render targets it is the plain letter on the
  real paper.
- Reduced motion: no runway, the letter after the shower, dried, with tide
  lines and feathered ink, still readable in most places. A tap still lets a
  drop fall (shown soaked in at once).
- The stage is focusable (Enter drops a drop) and `touch-action: pan-y`: a
  vertical swipe always scrolls.

## Cost

- Simulation: ~55k cells, three passes a step, ~30 texture reads a cell a
  pass. It runs only while the scroll position (or a tapped drop) is ahead
  of the state, at most ~40 steps a frame, fewer if frames run long; a full
  fling through the whole shower catches up in about a second. Checkpoints
  are made lazily: at most 13, ~1.3 MB each.
- Drawing: one fragment pass over the sheet, ~90 texture reads a pixel
  (cubic samples), only when the state changed. Canvas DPR capped at 2.
- Idle, off screen or in a hidden tab: nothing runs.

## Credits

- [pretext](https://github.com/chenglou/pretext) by Cheng Lou, MIT
  (`vendor/pretext`, unmodified, see its `LICENSE` and `VERSION`).
- The paper: a blank leaf from a sketchbook of Alexander Cozens, Yale Center
  for British Art, CC0 (`assets/credits.json`).
- Homemade Apple by Font Diner, via Google Fonts (Apache 2.0), loaded by the
  demo.
- The letter and the paragraphs around it were written for this component.
