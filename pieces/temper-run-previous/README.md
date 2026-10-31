# temper-run

A progress bar that is a ground steel chisel being tempered. The heat goes into
the shank from somewhere off the page; you never see it, only what it does. The
bright face takes a skin of oxide, and the skin shows as colour, creeping along
the steel ahead of the heat: pale straw, straw, brown, purple, blue, and the
shank going grey and dark behind them. The value says where the straw must
stand. At the maximum the straw reaches the cutting edge and the chisel is
quenched: the face comes up dark with water, dries off from the shank towards
the edge, and the colours stay where they stood.

## Usage

```html
<link rel="stylesheet" href="temper-run.css">
<div data-temper-run data-done="Uploaded">
  <progress value="0" max="100" aria-label="Uploading report.pdf">0%</progress>
</div>
<script type="module" src="temper-run.js"></script>
```

```js
import { temperRun } from './temper-run.js';
const bar = temperRun(el, { variant: 'thin', done: 'Synced' });
bar.value = 40;            // or set the <progress> value attribute; both work
bar.indeterminate = true;  // no value: a low heat wanders the bar
bar.front;                 // where the straw stands, as a fraction comparable with value / max
bar.thicknessAt(0.5);      // oxide (nm) halfway along the bar
bar.temperatureAt(0.08);   // kelvin at the shank
bar.reset();               // a fresh blank, value 0
bar();                     // remove everything, leave the plain <progress>
el.addEventListener('temper-run:quench', (e) => { /* done */ });
```

Without JS it is the native `<progress>` inside the wrapper, styled quietly.
Put the accessible name on the `<progress>` (as above) so it has one without JS
too; the component moves it up to the wrapper. An `aria-label` or
`aria-labelledby` on the wrapper also works, and wins.

## States

```
   cold ──value──▶ heating ──heat eased off──▶ coasting ──colours stop──▶ resting
                      ▲                                                      │
                      └──────────────── a higher value ◀─────────────────────┘
   value = max, straw at the edge ──▶ quenched (red goes out, wet, dries, "Done" announced)
   no value attribute ──▶ wandering (a low heat moves slowly up and down; capped at 255 °C)
```

A lower value than the colours already show, or `reset()`, brings a fresh blank
with a short cross-fade (oxide does not shrink). `temper-run:state` fires on
every change, `temper-run:quench` at the end.

## How it works

**The colours are thin-film interference.** Heated in air, steel grows a
transparent iron oxide film tens of nanometres thick. Light reflected from the
top of the film and from the metal beneath interferes, and which wavelengths
cancel depends on the thickness. The bar is modelled as air | magnetite (Fe3O4),
thickness d | iron, and the reflectance is the one-layer Airy sum

```
r = (r01 + r12 e^{2iβ}) / (1 + r01 r12 e^{2iβ}),   β = 2π n1 cos θ1 d / λ
```

with complex indices and complex Snell angles, for s and p polarisation,
averaged over a 0-30° cone of incidence (a ground bar in a room is lit from
many directions; the cutting bevel uses 30-56°, so it reads a little
differently, as it does on a real chisel). Optical constants, 380-780 nm every
10 nm, via refractiveindex.info:

- iron: Johnson and Christy, *Phys. Rev. B* 9, 5056 (1974): n + ik ≈ 2.95 + 2.93i at 550 nm;
- magnetite: Querry, CRDC-CR-85034 (1985): n + ik ≈ 2.34 + 0.11i at 550 nm.

(Hematite absorbs too strongly in the blue and gives no blue at all; magnetite
gives the textbook sequence, so the film is magnetite.) The spectral
reflectance is weighted by CIE D65 and the CIE 1931 2° colour-matching
functions (CVRL, `ciexyz31.csv`, inlined at 10 nm), and XYZ goes to sRGB with
the IEC 61966-2-1 matrix. All of this runs at load (a few milliseconds) into a
thickness-to-colour table. Nothing in the colour sequence is a hand palette:
0 nm bright steel, 15 pale straw, 20 straw, 25-30 dark straw to brown, 35
bronze-purple, 40 purple, 45 dark blue, 50-55 blue, 60-80 pale blue, then grey.

**Beyond about 80 nm** a perfect film would go on to second-order yellows and
magentas. Real temper colours don't: the film roughens and its outer part turns
to hematite. That is modelled, honestly as phenomenology, by letting coherence
fade past 80 nm toward the incoherent two-interface sum and by a Debye-Waller
loss of specular light for an rms roughness of 0.3 × (d − 80 nm). Past about
110 nm the film is treated as scale, porous Fe3O4/FeO that scatters light: its
reflectance falls by a further two thirds or so by 900 nm, holding a little
more blue, so the shank grades from gunmetal to a bluish black, as a chisel run
from the shank does.

**The film grows by a parabolic Arrhenius law**, d² = k0 t exp(−Q/RT),
integrated in time in every cell, so it only ever thickens. Q = 70 kJ/mol and
k0 = 2.17 × 10⁷ nm²/s are *fitted*: they make a five-minute hold give the
classic temper chart from the computed thicknesses (18 nm straw at 228 °C,
30 nm brown at 260 °C, 40 nm purple at 280 °C, 52 nm blue at 300 °C). Above
about 570 °C a second term (Q2 200 kJ/mol, an estimate) stands for the much
faster wüstite-bearing scale. Treat the constants as plausible, not
authoritative.

**The heat is a 1D heat equation along the bar**, 110 mm in 110 cells:
dT/dt = α ∂²T/∂x² − β(T)(T − Ta) + u·S(x). α = 13 mm²/s (carbon steel), losses
are free convection (12 W/m²K) plus grey radiation (ε 0.55) over a 14 × 6 mm
section. The source is a Gaussian 9 mm from the shank end, just out of frame.
Backward Euler with a tridiagonal solve, so large time-lapse steps are safe.
Because the heat diffuses, the bands spread as they travel and bunch up near
the shank without being asked to. Each pixel row samples the bar a little ahead
or behind (a smooth, low wobble, lagging at the two arrises, which lose heat
from three faces), so the fronts are gently bowed rather than ruled.

**The heat is a model-predictive controller.** Every frame the bar is copied and
coasted six minutes of bar time with the heat off; the heat is set from how far
that coasted straw front falls short of the value's mark. This is what a smith
does: the colours keep running on stored heat, so it is taken away early. The
shank is held below 567 °C.

**The only sign of the heat itself** is the shank's own dull red, from Planck's
law through the same observer, added to the reflected light; only its exposure
is chosen (a lit room, so it is faint). At the quench it goes out in about a
fifth of a second.

**The quench.** The chisel comes out of the water wet, and a wet face is darker
(the film fills the grind, so less light is scattered back) with a faint gloss
of its own. The heat still in each stretch of steel decides how soon it dries,
so the dark recedes from the shank toward the edge over about two seconds. No
steam, no particles.

**The steel.** A chisel blank seen from above and a little in front, so its
thickness shows as a narrow side face. The shank end is forge black (scale,
blotchy, matte) behind a ragged line where the grinder stopped; the rest is
belt-ground, with long scratches of random length and depth. The bevel is
ground on top and drops toward the cutting edge, honed across the blade. The
arrises are rounded by the grinder and catch a hairline of light. The shadow
on the paper is a contact line plus a short penumbra.

**Why the colours look metallic, not painted.** Three true effects, all
modelled: the film is uneven across the grind (each colour table is averaged
over a 10% spread of thickness, and each scratch samples the film a little
thinner or thicker); a glinting, burnished ridge reflects nearly neutral steel
(the brushed highlight carries 12-65% of the bare metal's own reflectance,
more on the brightest scratches); and the colour shifts slightly with the
angle of incidence, which grows away from the highlight (three tables, 0-22,
18-40, 34-56 degrees, blended per column), so the colours move as the light
does. Past a few hundred nanometres the film is drawn as scale, a matte dark
grey crust. The highlight follows the mouse, or the phone's tilt.

## Options

Data attributes, or the options object (which wins).

| Option | Attribute | Default | |
|---|---|---|---|
| `variant` | `data-variant` | `bar` | `thin`: a 7px rod for inline and list use. |
| `done` | `data-done` | `Done` | Announced, and the `aria-valuetext`, at the quench. |
| `rate` | `data-rate` | `15` | Bar seconds per second at rest pace (it speeds up to catch up). |
| `sheen` | `data-sheen` | `0.62` | Where the brushed highlight sits at rest, 0-1 along the bar. |
| `seed` | `data-seed` | random | Fixes the grind marks. |
| `label` | `data-label` | `Progress` | Accessible name, if none is given otherwise. |

Exports besides `temperRun`: `oxideColour(d, fromDeg, toDeg)` (linear sRGB),
`bandName(d)`, `temperatureFor(d, seconds)`, `BANDS`, `STEEL`, `FILM` and `sim`.

## Theming

| Variable | Default | |
|---|---|---|
| `--tr-h` | `40px` (`7px` thin) | Bar height. |
| `--tr-fallback` | `#7d7a74` | The native bar's `accent-color` without JS. |

The shadow on the page overflows the element a little. The steel's colour is
not themeable: it is the physics.

## Accessibility

The wrapper is `role="progressbar"` with `aria-valuemin`, `aria-valuemax`,
`aria-valuenow` and `aria-valuetext` ("42%", then the `done` text); the inner
`<progress>` is hidden from the tree so it is not read twice. No value means
indeterminate (no `aria-valuenow`). The quench is announced once through a
polite live region placed just after the bar (a progressbar's children are
presentational). The canvas is `aria-hidden`.

## Reduced motion

The bar is drawn straight at the colours for the value (the same simulation run
to completion in one go); the quench simply freezes it, with no drying. The
indeterminate bar does not wander. The demo drops its scroll runway and shows
the finished chisel.

## Tuning notes

- rAF runs only while heat is on, colours are still running, the shank is above
  the Draper point, the face is drying or a blank is cross-fading. At rest there
  is no loop (checked: zero frames over 2 s). Offscreen or in a hidden tab the
  clock stops, and it catches up by time-lapse when seen again.
- The forecast (24 implicit steps over 110 cells) runs once a frame: well under
  a millisecond. Rendering is per pixel into ImageData (DPR capped at 2), with
  the lighting field computed once per size.
- Straw at 18 nm is the front because that is what a smith calls straw on a
  chisel edge; `STEEL.dFront` moves it.

## Credits

No libraries, no images, no sound. Optical data: Johnson and Christy (1974) and
Querry (1985) via refractiveindex.info (CC0); CIE 1931 2° colour-matching
functions from CVRL; CIE D65 via colour-science. Essay facts: the temper colour
chart as given in standard smithing references (e.g. Weygers, *The Complete
Modern Blacksmith*; Sims, *The Backyard Blacksmith*).
