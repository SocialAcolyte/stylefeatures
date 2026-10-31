# cera-tablet

A text field that is a real wax tablet: two leaves of a Coptic set from Egypt,
made between 500 and 700 and photographed by the Metropolitan Museum. The
left leaf still carries its own Greek lesson, scratched in a quick cursive.
The right leaf is smooth, and it is your field. Type, and a bronze stylus
ploughs each letter into the wax as a single fine stroke: the point goes in
blunt, drags round its corners and lifts away to a hairline, and the cut
shows pale because it lifts the dark skin of the wax, with one side in shade
from the lamp. Backspace, and the stylus turns over and its flat end drags
the letters smooth. Write fast and hard and the point goes through the wax
into the wood, and those scores outlast the smoothing: the deleted words
linger faintly under the levelled wax. That is how most surviving Roman
stylus tablets are read: the wax is long gone, and what is left are the
scratches the point made in the wood.

```html
<link rel="stylesheet" href="cera-tablet.css">
<form>
  <div class="cera-tablet" data-cera-tablet>
    <div class="ct-leaf" data-leaf="l"></div>          <!-- the written leaf -->
    <div class="ct-leaf" data-leaf="r">
      <div class="ct-wax">
        <label class="ct-sr" for="note">Your note</label>
        <textarea id="note" name="note" placeholder="Your note…"></textarea>
        <input name="from" placeholder="Signed…" aria-label="Signed">
      </div>
    </div>
  </div>
</form>
<!-- or one leaf, lying landscape: -->
<textarea data-cera-tablet aria-label="School tablet" data-palimpsest="a b c d e">Dimidium facti…</textarea>
<script type="module" src="cera-tablet.js"></script>
<script type="module" src="sound.js"></script>  <!-- optional -->
```

```js
import { ceraTablet } from './cera-tablet.js';
const destroy = ceraTablet(el, { clearLabel: 'Warm and level' });
destroy.clear();        // warm and level every leaf (or destroy.clear(1))
destroy.sync();         // after setting a field's value from script
destroy.fields;         // the real <textarea>/<input> elements
destroy();              // remove everything, back to the plain fields
el.addEventListener('cera-tablet:smooth', (e) => e.detail.chars);
el.addEventListener('cera-tablet:clear', (e) => e.detail.leaf);
el.addEventListener('cera-tablet:full', () => {});
```

Without JS it is the photographed tablet (a diptych is laid out by CSS
`:has()`) with ordinary fields over the wax, pale serif text on the dark
panel. The form submits as usual.

On screens 640px wide or less a diptych turns a quarter: the two leaves lie
landscape, one above the other, their binding holes meeting in the middle
(the same photographs, turned, so the grain and the Greek turn with them).

## How it works

**The field stays real.** Each `<textarea>`/`<input>` sits over its wax panel
with transparent text; the caret, selection, IME, autofill, spellcheck menu,
undo, screen readers and phone keyboards are all native. The trick is the
font: the fields are set in *Cera Metrics* (`assets/cera-metrics.woff`, built
by `tools/build-font.py`), a font with no outlines at all, only the advance
widths of the incised hand. So the browser's own wrapping and caret land
exactly on the cut letters. A hidden mirror of each field (same box, same
styles) reports where every character is, through `Range.getClientRects()`.

**Edits become work.** Each `input` is diffed against what is already cut
(common prefix and suffix, then positions):

```
 inserted chars ──▶ carve (stylus point)      force from typing speed or pen pressure
 deleted chars  ──▶ smooth (spatula end)      right to left for Backspace, left to right for Delete
 moved chars    ──▶ smooth old place, re-carve new place   (a word that wraps, a mid-line insert)
 clear button    ──▶ warm and level the leaf, emptying its fields
 form reset      ──▶ warm and level the leaf, then re-cut the fields' default values
```

Jobs run in order, one at a time, in a rAF loop that only exists while there
is work. If you type faster than the hand, the queue speeds up; past 80 jobs
(a big paste) it settles at once. Wax does not reflow, so moving letters
honestly costs a rub-out and a rewrite, as it would a scribe.

**Carving.** A letter is a set of single strokes in glyph units
(`assets/glyphs.json`: x-height 5, an em of 12), drawn after Roman cursive and
rustic-capital hands (angular joins, an uncial *d*, long ascenders) but kept
readable as English. Strokes are Hermite splines with a low tangent tension,
because a point dragged through wax turns corners rather than curves; each
letter is seeded with a rotation, scale, lean and lift off the line, and each
stroke drifts a little sideways along its length as the wax drags on the
point, the same every time it is re-cut. The model is the cursive actually
found scratched in wax: the Greek on the Met's own leaf, the Vindolanda
stylus tablets and the receipts of Caecilius Iucundus at Pompeii, where every
letter is one or two quick strokes, never an outline. The stylus advances along the strokes at a speed set by the gap
between your keystrokes. For each step the cells near the segment get their
distance to the stroke; each cell is rebuilt from a snapshot taken when the
letter began, so a stroke never piles ridges on itself:

- a narrow V-groove (half width `GROOVE` = 0.036 em, about a millimetre on a
  real tablet) of depth D (`D = 0.4 … 1.26` wax thicknesses, by force),
  rounded at the floor; a third wider and a little deeper over the first
  stretch of a stroke, where the point goes in, and narrowing to a hairline
  and lifting out over its last third;
- a low burr either side (`BURR`, 0.14 D): most of the displaced wax is
  carried along and curls away, as it does on the real leaf;
- if the point passes the bottom of the wax, the excess scores the wood, in a
  narrower line (`SCORE_GAIN`), and the groove floor is bare wood.

Force: about 260 ms between keys is a gentle hand (D ≈ 0.5), about 90 ms is
hammering (D ≈ 1.26, through to the wood); key repeat scores too. With a pen
on the field (`pointerType: pen`), the last pressure reading is the force for
two seconds instead. Normal writing stays in the wax; a burst of fast typing
cuts into the board.

**Smoothing.** The spatula sweeps the deleted letters' boxes, line by line.
What it leaves is computed first: an anisotropic box blur (long along the
drag, short across), pulled toward the flat level of that cell, keeping 20% of
the blurred relief as a smear, with faint striations along the drag (grit
under the blade), a tiny lip where the blade stops, and a gloss (the polish
channel) where it passed. The front of the blade carries a small bow wave.
Wood scores are not touched by any of this.

**The palimpsest.** A cut that went through to the wood moved all of the
wax out of its path. A cold spatula drags the ridges back over it but cannot
pack a narrow channel full again, so over every score the smoothed surface
keeps a shallow trough (`SAG_SMOOTH`, per unit of score depth). Melting
fills it properly, but the wax over a score is thicker there and wax shrinks
as it solidifies, so a faint sink mark remains, the same one a casting gets
over a thick section (`SAG_CLEAR`). Under a low lamp those troughs show the
deleted text. Where a new groove crosses an old score, the wax at its bottom
is thin enough to glow with the wood, and the wax-filled score reads as a
dark line in it. In the demo the single leaf hides an alphabet and a maxim
under its line, given in `data-palimpsest`.
The depths are tuned to be seen on a screen; on a real tablet the effect is
far subtler while the wax is there, and becomes the whole text once it is gone.

**Warm and level** (the button under the tablet, or a form reset): every cell
of the leaf is set to its level, minus the cooling sag over scores, and the
shader cross-fades from the old surface to the new through a noise threshold,
so the wax goes in soft patches, as a leaf held over a brazier does, glossy
and a little brown while warm, then cooling.

**Lighting.** The heightfield (wax surface, score depth, polish) is three
`Float32Array`/`Uint8Array` grids at up to 2 cells per CSS px, capped at 2.6M
cells. Only the changed rectangle is uploaded (`texSubImage2D` with
`UNPACK_ROW_LENGTH`) to R16F/R8 textures. One WebGL2 fragment shader draws
the wax panels only: the photographed leaf is the albedo, normals come from
central differences, and an 11-step march toward the lamp gives cast shadows,
so the side of a groove away from the lamp falls into shade. The frame, the
walls of the recess and the rims are left to the photograph beneath, lit as
the museum lit them; the lit wax fades into that same photograph over the
panel's last few pixels, so there is no seam. Lambert is normalised so level
wax keeps exactly its photographed colour, and the specular term only adds
what a tilted surface catches beyond the level one.

The colour of a cut is the point of the piece. The surface of old wax is a
dark skin of soot and grime; a stroke lifts it, and the groove's walls are
the wax's own paler brown. On the Met's Greek leaf the grooves measure about
1.6 times lighter than the wax around them, with a thin dark edge on the
shaded side. The shader mixes the photographed wax toward that body colour
with the depth of the cut, then lights it, so a letter reads as a fine light
line with one shaded side, not as an outline.

Without WebGL2 a 2D canvas draws the same heightfield (normals, the cavity
term, no cast shadows) as a translucent layer of shade and highlight over the
photographed wax, and bare wood where a cut reaches it. The warming is instant
there. The lamp sits low (about 20 degrees) at the upper right,
where the photograph was lit. Tilting the phone swings it round (azimuth) and
up or down (elevation); with a mouse it leans a little toward the pointer.

**The stylus** is an SVG after the Met's bronze stylus (point, banded shaft,
flat end), drawn at the working point while it moves. It leans back toward
the writer's hand; its shadow is sheared so that it starts at the tip and
falls further away from the lamp along the shaft, as a shaft rising off the
surface does.

## Options

Data attributes, or the options object (which wins).

| Option | Attribute | Default | |
|---|---|---|---|
| `clearLabel` | `data-clear-label` | `Warm and level` | Text of the clear button(s). |
| `clearControl` | `data-clear-control` | `auto` | `none`: no buttons; call `destroy.clear()` or use any `[data-ct-clear]` button inside. |
| `fullText` | `data-full-text` | `This leaf is full.` | What the live region says when typing would overflow. |
| | `data-leaf` (on `.ct-leaf`) | `l`/`r` for a pair, `one` alone | Which photographed leaf. |
| | `data-palimpsest` (on `.ct-leaf` or a bare textarea) | none | Older text cut hard into the wood and levelled away before the page loads. |
| | `data-name` (on `.ct-leaf`) | `left leaf`/`right leaf` | Used in the clear button's accessible name. |
| | `.ct-inscription` | | A paragraph inside `.ct-wax` that is cut at load and is not editable. |

Fields recognised inside `.ct-wax`: `textarea`, and `input` of type text,
search, email, url. A tablet has only so much wax: an edit that would make a
field scroll is refused, with a small knock and an announcement. This is
decided in `beforeinput`, on an unseen copy of the field, so the browser's own
undo and redo history is kept: a paste or drop is trimmed to what fits and
inserted with `execCommand('insertText')`, which is itself undoable. IME
composition cannot be cancelled, so an over-long composition is trimmed back
after the fact (the one case that costs the undo history).

## Theming

| Variable | Default | |
|---|---|---|
| `--ct-size` | `8.4cqmin` (each leaf is a size container), `30px` without container units | Letter size; grooves, ridges and depth scale with it. Sized to the leaf, the hand gives about 8 lines on an upright leaf and 5 or 6 on one lying landscape, as on real tablets. Set a length to override. |
| `--ct-lh` | `1.4` | Line height. |
| `--ct-ink` | `#e9dcbc` | Text colour before the script runs; placeholders. |
| `--ct-caret` | `#f2e2b4` | The native caret. |
| `--ct-select` | `rgba(240,222,170,.2)` | Selection wash. |
| `--ct-max` | `940px` | Widest the tablet gets. |

Also uses `--paper`, `--paper-2`, `--ink`, `--ink-2`, `--rule`, `--accent`,
`--serif`, `--sans`.

## Accessibility

The fields are the native ones with their own labels (`.ct-sr` keeps a label
visually hidden), so everything a textarea does still works, including
selection, find, undo and the mobile keyboard. Inscriptions are real text in
the DOM, transparent but read and selectable. The canvas and stylus
are `aria-hidden`. A polite live region says when a leaf is full or has been
levelled. The clear buttons are real buttons, 36px tall, named per leaf.
Placeholders are drawn in the page serif at 30% opacity, since the incised
hand only exists in the wax. In forced-colours mode the canvas is hidden and
the fields show plain text with borders.

## Reduced motion

Letters appear cut at once (direct feedback), the stylus is not drawn,
smoothing is instant, the clear levels at once with no melt or cooling, and
the lamp jumps rather than eases. Nothing moves on its own in any mode.

## Tuning notes

- Material constants at the top of `cera-tablet.js`: `D_MIN`/`D_MAX` (groove
  depth by force, in wax thicknesses; above 1 is wood), `SCORE_GAIN`,
  `SAG_SMOOTH`, `SAG_CLEAR`, `RESIDUE` (how much relief the spatula leaves).
  Groove half-width is `0.05 × font size`; the lighting height unit is
  `0.075 × font size` per wax thickness.
- The hand: `XS`, `TRACK`, `SLANT`, `TENSION` in the JS. If you change a
  glyph's advance in `assets/glyphs.json`, or `XS`/`TRACK`, rebuild the font
  (`python3 tools/build-font.py`).
- The leaves: `tools/cut-leaves.py` cuts the Met photographs off the studio
  grey and turns them; the wax panel rectangles were measured on the results
  and live in the `.ct-wax` insets (CSS). `LEAVES` (JS) holds the image sizes.
- Cost: typing touches only a letter's bounding box; the shader is a
  full-canvas pass (about 25 texture reads a pixel) drawn only when something
  changed. rAF runs only while a job, the melt, the lamp easing or the stylus
  fade is in progress, and drawing is skipped while the tablet is off screen.
- Sound (off by default; the speaker button from `sound.js`): the scratch is
  synthesised live, a loop of sparse clicks over thin noise whose playback
  rate, band and level follow the stroke speed and force, so a fast stroke is
  a denser, higher grain. The spatula rub and the warming hiss are
  `sounds.json` events.

## Credits

The leaves: *Wooden Writing Tablets*, Coptic, Byzantine Egypt, 500–700, wood
and wax, The Metropolitan Museum of Art, 14.2.4a–d, Rogers Fund, 1914, CC0
(Open Access). Leaf b's written face, leaf d's two faces. Cut out, shadowed
and turned by `tools/cut-leaves.py`; nothing else in the photographs is
changed. The stylus is drawn after the Met's Cypriot bronze stylus
(74.51.5495, CC0), a reference only. Letterforms drawn for this component;
metrics font built with fontTools. Sounds synthesised in code. `tilt.js` and
`sound.js` are the shared Taste copies. No libraries at runtime.

`tools/` holds the small build scripts (Python, not needed at runtime):
`build-font.py` (the metrics font, needs fontTools), `cut-leaves.py` (the
leaves from the Met's photographs, needs Pillow, NumPy and SciPy) and
`make-sounds.py` (the two event sounds).
