# pretext-vine

A passionflower climbs a paragraph, and the paragraph makes room for it. The
text is set by Cheng Lou's pretext. As you scroll, a shoot comes up out of
the lower margin and climbs through the type, its tip sweeping slow
ellipses; wherever the stem crosses a line, pretext re-sets that line as two
runs, one each side of the stem, each justified on its own, and the words
ease aside as the tip comes up to them. At the nodes, palmate leaves cut from
Curtis's 1787 plate of *Passiflora caerulea* unfold from folded halves, and
tendrils revolve while the stem climbs, then one after another catch real
ascenders (an l, h, k, d, b or f) and coil round them, the letter painted in
front of the turns that pass behind it, and wind their free length into a
spring that reverses its hand halfway along. At the top the painted bud from
the same plate swells, the paragraph's corner flows aside, and the bud opens
into Redouté's flower: its tepals spread, its corona fans out, its stamens
and styles rise, and the open flower is the plate's own pixels, the only
colour on the page. Scroll back and it ungrows and the words flow back.

```html
<link rel="stylesheet" href="pretext-vine.css">
<section data-pretext-vine data-seed="7">
  <div class="pv-stage">
    <p class="pv-text">In the summer of 1863, ill and kept to the house, Darwin…</p>
  </div>
</section>
<script type="module" src="pretext-vine.js"></script>
```

Or `import { pretextVine } from './pretext-vine.js'` and call
`pretextVine(section, { seed, side })`. It returns `destroy()`, which also
carries `growTo(progress)`: `destroy.growTo(0.4)` drives the growth yourself
(0 to 1), `destroy.growTo(null)` hands it back to the scroll. The same handle
is on the element as `section.pretextVine`.

## Options

| attribute     | option   | default | what it does |
|---------------|----------|---------|--------------|
| `data-seed`   | `seed`   | `7`     | Every choice (the sway of the climb, leaf angles and sizes, which letters the tendrils take, the hand of each coil) comes from this seed. Same seed, same plant, at any scroll position. |
| `data-side`   | `side`   | `left`  | `left` or `right`: the top corner of the paragraph where the flower opens. The vine starts low on the other side and leans across to it. |

The paragraph's own CSS (`.pv-text` font family, weight and colour) sets the
type; the size is chosen by the script: about 26px on a wide desktop down to
16-17px on a phone, shrunk if the text, the flower and the stem's way in would
not fit the stage.

## How it works

1. **The plant first.** The stem's path is planned before any text is set: it
   enters in the far margin and leans across the paragraph toward the flower's
   corner with a seeded sway, at most ~4.5em sideways per line, crossing each
   line either in a margin or at least 5em inside the column (so the runs
   either side can hold words). Between lines it is a cubic S, upright where it
   crosses a line and leaning across the leading.
2. **Text flows round it** (the Cheng Lou part). Each crossing is an obstacle
   on its line: the stem alone, plus about 0.35em of air each side (leaves and
   tendrils never displace text; they lie under it with the paper halo). The
   paragraph, hyphenated with TeX's patterns (Liang's algorithm, Knuth's US
   English patterns in `vendor/hyphen`, the same as page-turn), is flowed
   with pretext (`prepareWithSegments`, `layoutNextLineRange`,
   `materializeLineRange`) into the runs each line has left, each run
   justified on its own. A run narrower than about three words is not set: the
   stem simply passes between the words there, behind the type. If a run
   beside the stem would still be left ragged by more than about an em, the
   line is set whole instead and the stem passes behind it. The flower is an
   obstacle too: a star through its ten petal tips, over the paragraph's top
   corner. One layout is computed per obstacle, in the order the vine reaches
   it (stem crossings bottom to top, then the flower in four steps), and
   scroll position picks a point between two of them. The units placed are
   syllables, so a word can break at a hyphen in one layout and not the next:
   syllables that stay on their line slide; ones that change line fade out
   first and in last, so nothing passes through anything else.
3. **Growth** is a function of progress only. Progress maps to `tau`, a
   length of growth; the stem is drawn to `min(tau, length)` and every node's
   age is `tau` minus its place. The stem is up by ~55% of the runway; the
   bud swells and the corner clears from 55% to 75%; the tendrils take hold
   one after another from 68% to 76% and coil by ~84%; the flower opens from
   75% to 95%; then it holds.
4. **Circumnutation.** The last ~1.7 lines of stem are pushed off the path by
   an ellipse (0.9em across, 0.35em along) whose phase is `tau`: one sweep per
   ~5 lines of growth. Older stem has settled where the path lies.
5. **The stem** is drawn as the plate engraves it: a tapered body from a woody
   olive foot to a green tip, a dark line down its shadow side with fine
   hatching across it, and a light line down the lit side.
6. **Leaves.** A leaf at every other node, and at the nodes between where one
   sits in the clear, plus two young folded leaves on the shoot above the
   flower. Each is placed by trying petiole angles and sizes against the final
   layout: text under it (never more than about a word), off the stage, over
   the flower or another leaf. Each lobe is a real painted lobe from Curtis's
   plate drawn down its own axis; young leaves hold their lobes together and
   folded. Leaves lie under the type, and a hairline paper halo round every
   glyph keeps a word over a leaf readable.
7. **Tendrils.** One with each leaf, from the axil. It revolves straight and
   stiff with a hooked tip while the stem climbs, then (once the words have
   stopped moving, so the letter it takes will stay where it is) its sweep
   closes onto an ascender a few ems away, it wraps the letter's stem 2.5
   turns (1.8 on a phone), and its free length coils into a helix whose phase
   runs forward to the middle and back again (a perversion: one hand, a short
   straight, the other hand), the projected loops leaning one way then the
   other, and the node is drawn a few px toward the letter. A tendril with
   nothing in reach coils on itself into a loose one-handed spiral. Tendril
   runs behind a letter go on the back canvas, runs in front on the front one.
8. **The flower.** The bud is Curtis's painted bud on its stalk, muted like
   the leaves; it swells, then foreshortens as it turns to face you and gives
   way to Redouté's frontal flower, cut from the plate into three layers that
   share one frame: the ten tepals (with the corona and stamens painted out
   beneath them), the corona (rings and filament bars), and the stamens and
   styles. The tepals open as wedges of the plate, each scaled along its own
   axis by the sine of its opening angle (sepals first, petals after); the
   corona fans out from tight and turned; the stamens and styles rise last;
   and over the last few percent the layers give way to the uncut plate, so
   the open flower is the plate's own pixels.

## The real thing

What a real observer sees (Darwin, *The Movements and Habits of Climbing
Plants*, 1875; Goriely & Tabor, *Phys. Rev. Lett.* 80, 1998), and what was
kept:

- **Circumnutation:** the young internodes of *Passiflora gracilis* revolve
  faster than any plant Darwin timed, about an hour a turn, sweeping wide
  ellipses. Kept: the elliptical sweep at the growing end, decaying down the
  stem. Compressed: one sweep per ~5 lines of growth.
- **Tendrils:** straight and revolving while they search; a touched tip
  bends within 25-30 seconds and soon winds round the support; then the free
  part coils into a spring and shortens, drawing the stem in. Because both
  ends are held, it cannot gain twist: it coils one way along part of its
  length and the other way along the rest, with a short straight between.
  Kept, including the reversal and the pull on the node. Simplified: always
  exactly one perversion, at the middle.
- **Leaves:** *P. caerulea* is palmately five-lobed, alternate, one leaf per
  node with a tendril (and a flower bud) in the axil, glands on the petiole.
  Young leaves come folded and spread. Kept, except that only the top node
  carries a flower.
- **Flower:** a long ovoid bud between leafy bracts, sepals horned; ten
  perianth parts open flat; the corona of filaments banded purple, white and
  blue; five stamens hanging their anthers; three styles with capitate
  stigmas. Kept, in the plate's own painting. The real opening takes about an
  hour on a summer morning; here it takes a fifth of the scroll. Simplified:
  the opening is the frontal view only (tepals lengthen from pointing at you
  to lying flat), and the bud is a different plate's than the flower.
- **Timing:** in life a tendril catches whatever it meets while the shoot
  grows; here they all wait, revolving, until the words have settled, then
  catch hold bottom to top, so a letter never moves out of a coil.

## Tuning

- **Pacing:** `tauOf` (stem), `openOf` (flower), the flower ramps in `layout`
  (`p0`, `p1`: when the corner clears) and the contact schedule (`pc`, 0.68 to
  0.76). `--pv-runway` (default `280svh`) sets how long all of it takes.
- **The climb:** the step limit (4.5em per line), the sway (0.13 of the
  column), the inside margin (5em) and the stem's clearance (`clear`: half the stem
  plus 0.35em each side).
- **The flow:** `minRun` (5.5em, about three words: the narrowest run worth
  setting), the justification limit (2.6 spaces) and the hole limit (0.9em of
  rag beside the stem, beyond which the line is set whole).
- **Leaves:** `leafS` (2.5em desktop, 2.25em phone, the middle lobe's length,
  varied 0.72-1.12 by seed) and `wordArea` (how much text a leaf may cover).
- **Flower:** `Rf` (5.2em on desktop, 90-140px; up to 100px on a phone) and
  `E` (its centre; desktop just outside the column's top corner, phone above
  the first line). The opening's stages are the `smooth()` windows in
  `drawFlower`.
- **The flower assets** are cut by a script (Python, scipy) in the build
  notes: the plate is masked against its paper, the filament bars found by
  colour and radial shape, the stamens and styles by colour inside a drawn
  outline, and what each layer hides is filled by normalised convolution.
  `FL` holds the frame (centre, and the ten tip angles and lengths); `BUD`
  the bud's stalk end and tip.

## Theming

| variable      | default        | used for |
|---------------|----------------|----------|
| `--paper`     | `#f3f0e8`      | the stage, and the hairline halo round the letters (read from the section's background) |
| `--ink`       | `#141312`      | the words (the spans copy `.pv-text`'s colour) |
| `--pv-serif`  | `var(--serif)` | the face; the demo uses EB Garamond for its tall ascenders |
| `--pv-runway` | `280svh`       | length of the scroll runway |

Vine colours (stem, tendril) are in `C` at the top of the drawing section;
the flower's palette is inline in `drawFlower`, matched to the plate.

## Accessibility and motion

- The real `<p>` stays in the DOM, visually hidden once the vine is live: it
  is what screen readers read. The positioned word spans are `aria-hidden`
  but are real text, so they can be selected and found. Without JS, or if
  pretext or the atlas fails to load, the paragraph is a plain paragraph.
- Reduced motion: no runway; the finished vine with the flower open.
- Phone: the paragraph reflows at 390px (about 18 lines at 16-17px) round the
  stem and the flower, which opens over the first line's corner; every other
  node carries a leaf. The stage has
  `touch-action: pan-y`; nothing traps scrolling.
- Cost: two canvases the size of the stage (DPR up to 2, or 3 on a phone
  narrower than 620px, where the stage is small and the 1px tendrils and
  filaments need it). A frame redraws stem, leaves, tendrils and flower
  (well under a few ms) and only runs while the shown growth is catching up
  with the scroll; at rest, off screen or in a hidden tab, nothing runs.
  `destroy()` removes canvases, spans, listeners and observers.

## Events

For sound later (bubbling `CustomEvent`s on the section; none fire for the
state the page opens on):

- `pretext-vine:touch` — a tendril meets its letter (`detail.letter`).
- `pretext-vine:bloom` — the flower opens past halfway.

## Credits

- [pretext](https://github.com/chenglou/pretext) by Cheng Lou, MIT
  (`vendor/pretext`, unmodified, see its `LICENSE` and `VERSION`).
- Hyphenation patterns: Knuth's `hyphen.tex` US English patterns as converted
  for LibreOffice (`vendor/hyphen`, see its `LICENSE` and `VERSION`).
- Leaf lobes and the bud cut from *Passiflora caerulea*, The Botanical
  Magazine plate 28 (1787), drawn by Sydenham Edwards for William Curtis,
  public domain, via Wikimedia Commons.
- The flower cut from *Passiflora coerulea / Grenadille bleue*, Traité des
  arbres et arbustes (Nouveau Duhamel), t. 2 no. 12, painted by Pierre-Joseph
  Redouté and engraved by Mixelle, public domain (New York Public Library),
  via Wikimedia Commons. See `assets/credits.json`.
- Behaviour after Charles Darwin, *The Movements and Habits of Climbing
  Plants* (1875), and A. Goriely and M. Tabor, "Spontaneous helix hand
  reversal and tendril perversion in climbing plants", *Phys. Rev. Lett.* 80
  (1998).
