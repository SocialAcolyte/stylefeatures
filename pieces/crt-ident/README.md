# crt-ident

Any logo, shown on a colour television of about 1985. It is not a filter laid over the logo: the
logo is turned into a television signal and written by the beams of an aperture-grille tube, line
by line, onto vertical stripes of red, green and blue phosphor behind a gently curved face. Bright
lines are fat and dark lines thin, so the black between them shows in the blue foot of the letters
and closes up in the yellow tops. Two hair-thin damper wires cross the grille a third of the way
down and a third of the way up. The set comes on the first time it scrolls into view: a bright line
across the middle opens into the picture, the brightness rises a little past where it settles,
and the colours drift for a moment while the degaussing field dies. Switch it off and the picture
folds into a line, then a point, which fades over a couple of seconds.

```html
<link rel="stylesheet" href="crt-ident.css">
<div data-crt-ident><svg viewBox="0 0 491 100" role="img" aria-label="Taste">...</svg></div>
<div data-crt-ident><img src="logo.png" alt="Acme"></div>
<a href="/" data-crt-ident data-interactive="off">Acme</a>
<div data-crt-ident data-mode="vector"><svg>...</svg></div>
<script type="module" src="crt-ident.js"></script>
```

```js
import { crtIdent } from './crt-ident.js';
const tv = crtIdent(el, { mode: 'raster', power: 'auto' });
tv.power(false);       // switch off (or on)
tv.on;                 // true / false
tv.manual = true;      // stop the real clock
tv.advance(1 / 60);    // step the clock and draw (fixed-step recording)
tv.rest();             // draw the settled frame
tv();                  // destroy: remove canvas, button, listeners; the logo is left as it was
```

A `crt-ident:power` event bubbles on every switch, with `{ on }`.

## How it works

1. **The picture.** The logo (inline SVG, `<img>` or plain text set in the element's own type) is
   drawn into a 4:3 picture, black behind it, inside title-safe.
2. **The signal.** The picture becomes 240 lines of 720 samples (BT.601), non-interlaced as a
   computer or character generator drove a set: 262 lines a field, the same lines every field.
   Each line is converted to luma and two colour-difference signals (YIQ) and band-limited as a
   decoder did: luma to roughly 4.2 MHz, chroma to well under 1 MHz, so colour bleeds a little
   sideways at hard edges. Back to R'G'B', then to light with the gun's gamma of 2.4 (BT.1886).
3. **The beams.** For every device pixel a fragment shader finds where it lies on the raster
   (with a small barrel term for the curved face), which lines pass near it, and integrates each
   line's Gaussian spot over the pixel's height with the error function, so lines stay sharp and
   free of moiré at DPR 1 to 3. The spot's sigma grows with the square root of the beam current.
   The raster is overscanned about 7% past the glass, and the overscan is chosen so the line pitch
   lands on a simple fraction of a device pixel. Red and blue land a little off green toward the
   corners (static misconvergence). When the raster is squeezed thinner than a line a pixel (the
   line at switch-on and switch-off), a vertical pyramid of the signal averages the lines instead,
   and the light is conserved: the same beam on a smaller area is brighter.
4. **Phosphor.** P22: ZnS:Ag blue, ZnS:Cu,Al green, Y2O2S:Eu red. Each frame keeps a decaying
   share of the last (effective persistence 9 ms red, about 2.5 ms green and blue), so moving light
   leaves a faint red edge behind it, most visible as the picture collapses.
5. **The glass.** The light comes through vertical phosphor stripes (box-integrated per pixel,
   pitch never under 3 device pixels) or, in vector mode, delta dot triads. Two damper-wire
   shadows on the grille. Halation: light scattered in the faceplate comes back out round bright
   things, as two faint Gaussian halos. The unlit face is the grey-green of phosphor seen through
   tinted glass, darker toward the corners, with a soft window and a top-edge sheen in it.
6. **Power.** On: the EHT and line stage come up first (a line across the middle), the vertical
   sweep opens it in about half a second, the beam current overshoots by about 15% and settles,
   the degaussing coil's dying field shifts colour purity for about a second. Off: vertical
   collapse in about 90 ms, horizontal in 140 ms, video gone, and the undeflected beam leaves a
   spot fed by the charge on the tube's aquadag coating, defocusing and fading over about 2.5 s.
7. **Vector mode.** The logo's outlines (or Hershey single-stroke letters for text) as a colour
   X-Y monitor drew them: each segment a Gaussian line at constant light per unit length, with a
   dwell at every vertex, on a shadow-mask tube with a rounder face.

## Options

| data attribute | JS option | default | |
|---|---|---|---|
| `data-mode` | `mode` | `raster` | `raster` or `vector` |
| `data-power` | `power` | `auto` | `auto` (on when first 35% visible), `on`, `off` |
| `data-interactive` | `interactive` | `on` | `off` when inside a link: no button |
| `data-bezel` | `bezel` | `on` | `off`: the glass alone |
| `data-fit` | `fit` | `0.62` | logo width as a fraction of the picture |
| `data-ink` | `ink` | `#ece6d6` | colour for text logos and `currentColor` |
| `data-backdrop` | `backdrop` | `#000` | colour behind the logo in the picture |

## Theming

| property | default | |
|---|---|---|
| `--ci-bezel` | `#121211` | the surround, before the canvas draws it |
| `--ci-radius` | `1.4% / 1.9%` | outer corner radius |
| `--ci-focus` | `var(--ink-3)` | focus ring |

## Accessibility

The logo stays in the DOM, visually hidden, as the accessible content; without JS it is simply the
logo. The canvas is `aria-hidden`. The glass is a real `<button>` labelled "Television power" with
`aria-pressed`, so Enter and Space switch it. In a link, use `data-interactive="off"`.

## Reduced motion

With `prefers-reduced-motion: reduce` nothing animates: switching on shows the settled picture at
once and switching off goes straight to dark. No animation loop runs at rest in any mode; the loop
runs only during the three seconds of a switch, while visible, and stops with the tab hidden.

## Tuning notes

- Without WebGL2 (or `EXT_color_buffer_float`) a still Canvas 2D picture is drawn with scanlines.
- Canvas size is capped at 4.2 million device pixels; DPR is capped at 3.
- Lines resolve when the pitch is at least about 2 device pixels; below that (a small nav logo)
  the picture is the averaged lines with the stripes still over it, as a small set seen from a
  distance looks.
- Persistence, halation and overshoot are kept deliberately faint: this is phosphor, not glow.

## Credits

Hershey simplex font (A. V. Hershey, c. 1967; .jhf by James Hurt) for vector-mode text, see
`vendor/hershey/LICENSE`. Sources for the physics: Sony Trinitron (1968) aperture grille and
damper wires; P22 phosphors (Y2O2S:Eu red from the late 1960s); ITU-R BT.601 sampling and BT.1886
EOTF; SMPTE 170M composite bandwidths; degaussing and spot-killer circuits as described in
standard television service literature (e.g. Grob, *Basic Television and Video Systems*). All
artwork is original; see `assets/credits.json`.
