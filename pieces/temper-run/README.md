# temper-run

Ground steel that tempers, cut into a small kit for real pages. One engine, the
same steel and the same polish as the original chisel, in four shapes:

| kind | what it is | what heats it |
|---|---|---|
| `bar` | a progress / loading bar (a flat ground bar, or the original chisel) | the value: the straw stands where the value says |
| `button` | a button with a ground steel face | pressing it: the face blooms from where it is pressed |
| `rule` | a hairline steel rod: a section rule, or a link's underline | the pointer running along it (or keyboard focus) |
| `frame` | a mitred steel frame round an image or card | run once from a corner at load (`data-temper`), then the pointer near the edge |

The colour is the physics of heated steel, not a palette: a film of oxide a few
tens of nanometres thick grows on the bright face when it is warmed, and shows,
by thin-film interference, as pale straw, straw, gold, brown, bronze, purple
and blue. It only ever thickens. Nothing runs at rest.

## Markup

```html
<link rel="stylesheet" href="temper-run.css">
<script type="module" src="temper-run.js"></script>

<!-- a loader -->
<div data-temper-run data-done="Saved"><progress value="0" max="100" aria-label="Saving">0%</progress></div>
<div data-temper-run data-shape="chisel"><progress value="0" max="100" aria-label="Uploading">0%</progress></div>

<!-- a button; with data-hold it is hold-to-confirm -->
<button data-temper-run type="submit">Save</button>
<button data-temper-run data-hold="1400" type="button">Hold to discard</button>

<!-- a rule, and a tempering underline -->
<div data-temper-run data-kind="rule" role="separator"></div>
<a href="/notes" data-temper-run data-kind="rule">read the notes</a>

<!-- a frame, already run a third of the way round from the bottom-left corner -->
<figure data-temper-run data-kind="frame" data-temper=".3"><img src="plate.webp" alt=""></figure>
```

The kind is guessed when `data-kind` is left out: a `<button>` is a button, a
wrapper holding a `<progress>` is a bar, one holding an `<img>` is a frame,
anything else is a rule.

```js
import { temperRun } from './temper-run.js';
const t = temperRun(el, { kind: 'button', hold: 1200, to: 'purple' });
t.heat(0.3);            // put heat in at 30% along (and fy for a button); t.heat(.5, .5, false) takes it away
t.reset();              // rub the face bright again (a bar also goes back to 0)
t.thicknessAt(0.5);     // oxide (nm) there
t.state;                // cold | heating | coasting | resting | quenched | wandering | confirmed
t();                    // destroy: removes canvas, listeners, observers, live regions, attributes
// bars also have: t.value, t.max, t.indeterminate, t.front
```

Events (bubbling): `temper-run:state` on every change, `temper-run:quench`
(bar reaches its value at 100), `temper-run:confirm` and `temper-run:cancel`
(hold buttons).

## Options

Data attributes, or the options object (which wins).

| Option | Attribute | Default | |
|---|---|---|---|
| `kind` | `data-kind` | guessed | `bar`, `button`, `rule`, `frame`. |
| `from` | `data-from` | `0` | Film already on the steel: nm or a colour name. `pale-straw` gives a warm blank. |
| `to` | `data-to` | `blue` (button `purple` without hold; rule and frame `purple`) | How far live heat may take it. For a hold button, the colour that confirms. |
| `speed` | `data-speed` | `1` | Multiplies how fast the steel heats and colours. |
| `hold` | `data-hold` | off | Button: ms of held press to confirm (bare `data-hold` = 1200). Plain clicks then do nothing. |
| `reset` | `data-reset` | button `1800`, others `0` | ms after the colours stop before the face is rubbed bright again; 0 keeps the record. |
| `temper` | `data-temper` | `0` | Frame or rule: share of the steel run to straw at load. |
| `at` | `data-at` | `bottom-left` | Where that run starts: a corner name, `start`/`center`/`end`, or 0..1 along. |
| `shape` | `data-shape` | `flat` | Bar: `chisel` is the original chisel blank (forged shank, bevel). |
| `done` | `data-done` | `Done` / `Confirmed` | Announced when a bar completes or a hold button confirms. |
| `hint` | `data-hint` | `Press and hold to confirm` | Hold button's description for assistive tech. |
| `sheen` | `data-sheen` | per kind | Where the brushed highlight rests, 0..1. It follows the mouse, or the phone's tilt. |
| `seed` | `data-seed` | random | Fixes the grind marks. |

Colour names: `bright`, `pale-straw`, `straw`, `gold`, `brown`, `bronze`, `purple`,
`dark-blue`, `blue`, `pale-blue`, `grey`.

## Sizing and theming

| Variable | Default | |
|---|---|---|
| `--tr-h` | bar `14px`, rule `3px`, link `2px` | Bar height, rod thickness. |
| `--tr-gap` | `2px` | Link underline: distance below the text box. |
| `--tr-frame` | `10px` | Frame width (it is the element's padding). |
| `--tr-ink` | `#1d1b18` | Button label colour. |
| `--tr-fallback` | `#8c877e` | The no-JS fallbacks' colour. |

A button sizes itself from its padding and font, like any button. The steel's
colours are not themeable: they are the physics.

## How it works

**Colour.** The face is modelled as air | magnetite (Fe3O4), thickness d | iron,
with the one-layer Airy reflectance for s and p polarisation, complex indices
and complex Snell angles, averaged over cones of incidence. Iron: Johnson and
Christy (1974); magnetite: Querry (1985), via refractiveindex.info. The spectrum
goes through CIE 1931 2° colour matching under D65 to sRGB, at load, into
thickness-to-colour tables for three viewing angles, each smeared by the film's
own unevenness across the grind. Past ~80 nm coherence fades and the film
roughens; past ~110 nm it becomes scale (phenomenology, see the source).

**Heat.** One field model for every shape: a line of cells for a bar, rule or
frame (a frame's line closes on itself) and a grid for a button's face.
dT/dt = α∇²T − β(T)(T − Ta) + u·S, with fin losses by free convection and grey
radiation, solved implicitly one direction at a time (Thomas algorithm;
Sherman-Morrison for the closed loop), so time-lapse steps are safe. The film
grows by d² += k0·exp(−Q/RT)·dt (Q 70 kJ/mol, k0 fitted to the temper chart),
so colours keep running on stored heat after the heat is taken away, and
bunch up and spread as they would. One css pixel is about 0.27 mm of steel, so
a short link and a long rule are the same steel.

**Bar.** The original controller: each frame it asks where the straw would stop
if the heat went now, and eases off as that reaches the value's mark. At 100
the chisel is quenched: the shank's red goes out, the face comes up wet and
dries from the shank. No `value` attribute = indeterminate: a low heat wanders.

**Button.** The press point is the flame. The steel-seconds needed for the
middle of the face to reach `to` are worked out once per size, so a hold button
confirms at almost exactly `data-hold` ms, with the colour at the press point
passing straw, brown, purple to blue on the way. Released early, the colours it
reached stay, then the face is rubbed bright again.

**Frame.** `data-temper` runs heat from one corner until the straw has covered
that share of the frame: the corner goes gunmetal, then blue, purple, gold and
straw run out along both sides, as on a chisel run from the shank.

**Surface.** Belt-ground scratches of random length and depth, burnished
ridges that reflect near-neutral steel, rounded arrises catching a hairline,
a narrow side face, mitred corners whose grain turns, and a short contact
shadow on the paper. Rendered on the CPU into a canvas per element, DPR ≤ 2.

## Accessibility

- Bar: the wrapper is `role="progressbar"` with min, max, now and valuetext;
  the inner `<progress>` is hidden from the tree. Completion is announced once.
- Button: a real `<button>`; Space and Enter press and hold it like a finger,
  centred. Hold buttons get an `aria-describedby` hint and announce `done`.
  A plain click (or a synthetic one, e.g. implicit form submission) does not
  trigger a hold button. Visible focus ring.
- Rule: decoration (`role="separator"` on a standalone rule); a link keeps its
  text, focus ring, and tempers under keyboard focus too.
- Frame and all canvases are `aria-hidden`.
- Without JS each kind is its plain native element, quietly styled.

## Reduced motion

Nothing animates by itself: a bar is drawn straight at its value's colours,
quenches without the drying, and does not wander; a frame's run is computed at
load. Direct input still works (pressing a button, running the pointer along a
rule), but when the input stops the steel settles at once rather than coasting.

## Cost

The clock runs only while heat is on, the steel is still hot enough to colour,
a face is being rubbed bright or the highlight is moving (checked: zero
animation frames at rest). Offscreen or in a hidden tab it stops. A frame's
initial run takes ~100 ms of one-off work at load.

## Credits

No libraries. Optical data: Johnson and Christy (1974), Querry (1985) via
refractiveindex.info; CIE 1931 2° CMFs from CVRL; D65 from CIE 15. The demo's
engraving: Asher Brown Durand, *Banknote vignette with a blacksmith and forge*,
ca. 1824-37, The Met, CC0 (see `assets/credits.json`).
