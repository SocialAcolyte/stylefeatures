# tamra-nuat

An accordion that is a Thai folding book. The sections are real `<details>`; the picture is a *samut khoi*, a
concertina of one long strip of khoi paper between two lacquered boards: the Wellcome Collection's *Tamra nuat*
(MS Thai 801), a nineteenth-century manual of massage, photographed by the Wellcome panel by panel.

Each section is one **opening** of the book on one of its drawn figures: the great sen-line figure's legs with its
diagram of numbered circles, a seated front figure, the red-lined figure with a demon's face, the painted yellow
figure, a red back figure, and a back figure followed by a blank panel. They come in the book's own order (side A, then
side B). Closed, an opening's panels stand in pleats; opening a section lays them flat one fold at a time, from the top,
and the figure comes up as the paper lies down. The answer is written by pretext into the free paper round the figure,
measured from the photographs: in the columns its legs and labels leave, or down the blank panel after it, at the
largest comfortable size that fits. Closing folds them again from the bottom.

Each question has a plus that becomes a minus. The question and its pleats answer the pointer together (the question
darkens, the pleats catch a little more light), and a click on the pleats opens their section too. While a section is
open, its question stays beside its panels as they scroll past; opened by hand, the page is carried so the figure
stands in the window.

```html
<link rel="stylesheet" href="tamra-nuat.css">
<div class="tn" data-tamra-nuat>
  <details>
    <summary>What is Thai massage?</summary>
    <div><p>Nuat thai is given through clothes, on a mat on the floor, with no oil. …</p></div>
  </details>
  <details open>
    <summary>Will it hurt?</summary>
    <div><p>It should feel firm, at times strong, never sharp. …</p><p>A second paragraph starts its own line.</p></div>
  </details>
  …
</div>
<script type="module" src="tamra-nuat.js"></script>
```

Or `import { tamraNuat } from './tamra-nuat.js'` and call `tamraNuat(el, options)`, which returns `destroy()`.

- The source is the real control: `<details>`/`<summary>` children of the container. Without JS it is a plain,
  quiet accordion (numbered rows, a plus/minus, the answer under its question). With JS each answer stays in the
  page, visually hidden where the book carries it, for screen readers, find-in-page and print; the book is
  `aria-hidden`.
- Add `name="…"` to the `<details>` for an exclusive accordion (the browser closes the others, and they fold).
- Answers are text: paragraphs, list items and headings are read from it, each starting a new line; after the first,
  a paragraph opens with the book's own mark, ๏ (*fongman*). Inline links and buttons are not drawn in the book, so
  keep them out of an answer (put them after the accordion).
- **Fit the answer to the figure.** Each opening holds what its paper holds. At 1440 px, roughly: the legs and diagram
  with their blank panels (A5-A8) 1,100 characters; the seated figure (A47-A48) 200; the red figure (A65-A66) 120;
  the yellow figure (A67-A70) 300; the red back figure (A75-A76) 200; the back figure and blank panel (B5-B8) 750.
  The demo's answers are written to those. An answer that does not fit its opening even at 13.5 px is shown in the
  page's type under its question instead, never squeezed.
- More than six sections: the seventh on take side B's blank panels (B9-B44), two at a time, as many as the answer
  needs.

### Options

| attribute | option | default | |
|---|---|---|---|
| `data-src` | `src` | `assets/tamra-nuat.json` beside the script | the measured book (tools/cut.py) |
| `data-assets` | `assets` | `assets/` beside the script | where the boards, panels and edge are |
| `data-fold` | `fold` | `26` | the crease's spring, rad/s (critically damped): higher is quicker |

```js
const tn = tamraNuat(el);
tn.open(2); tn.close(2); tn.toggle(2);   // as the summaries do (sets details.open; the toggle event folds)
tn.pose(3, 0.45);                        // stills: hold section 3 part-way, 0 folded .. 1 flat, pleats going flat in turn
tn.sections;                             // [{ panels: ['a65', 'a66'], lines, fs, drawn }] for the current width
tn.layout();                             // measure again (the script does this itself on resize)
tn();                                    // destroy: removes the book, the live region and every listener
```

### Theming

The usual house properties, with fallbacks: `--paper`, `--ink`, `--ink-2`, `--ink-3`, `--rule`, `--accent` (the
open section's numeral, the focus ring), `--serif`. `--tn-font` is the writing's face (EB Garamond, then Noto Serif
Thai for the ๏). `--tn-sum` sets the questions' size. The writing's colour is not themed: it is the book's own ink,
the median of its drawings' black line work, measured (`ink` in the JSON).

### Layout

**Wide (620 px and up):** the questions stand in a column to the left of the book, each at its section's first crease,
a hairline from the question to the crease; the book is `min(660 px, 60%)` of the container. A closed section's pleats
are folded to exactly the height of its question. The answer is written in the opening at 17 px down to 15 px (fewer,
larger blocks of paper win over a larger size), then 14.5 down to 13.5 px if it must.

**Narrow (under 620 px):** each question stands above its own pleats, the full width (one line, not three), and the
book is the full width too. Opened, the figure lies flat under its question and the answer follows in the page's type:
at that width a figure leaves only a finger's breadth of paper beside it.

### Accessibility

The summaries are the control: focusable, Enter and Space toggle them, the browser reports them expanded or collapsed,
and each carries a plus/minus drawn in CSS. A polite live region also says "Unfolded: …" or "Folded: …". A click on the
book's panels toggles their section too (on narrow screens the pleats are inside the summary, so they are the
summary). Reduced motion: the book lands on the state at once and the page is not scrolled smoothly. The answer's text
is the real DOM text, so a reader hears it in order, whatever columns the book set it in.

## In life, and here

| In life | Here |
|---|---|
| A *samut khoi* is one long strip of khoi paper (from the bark of the khoi tree, *Streblus asper*), folded back and forth into panels of one size and closed between two boards, here lacquered red-brown with a sunk frame. This one is 37.3 cm long and about 12.5 cm tall (the Wellcome's own rule, photographed on a board). | The panels are the Wellcome's photographs, each cut about the middle of its creases to one common height and one common width of paper; nothing is drawn. The boards are cut from the black of their own frames. |
| It is read panel by panel down the strip, turning the folds toward you, then turned over to read the other side. Side A of this book is figure after figure, each across two panels, front and back, labelled with the sen and points; side B has two more figures, then forty blank panels. | The demo shows **six selected openings**, in the book's order: A5-A8, A47-A48, A65-A66, A67-A70, A75-A76 (side A) and B5-B8 (side B). A65-A70 are consecutive in the book; between the others the panels not shown stay folded and are not drawn. The front board is photographed lying above side B's first panel; the back board is the one at the far end of side B. |
| A strip that is not lying flat stands in pleats: each pair of panels rises to a ridge between two creases on the table, the paper rigid between the folds. | Each pleat is two rigid panels turning on their creases: footprint F, each panel at acos(F / 2h) to the table, the ridge h·sin of that above it, seen from one eye 14 panel-heights away (the ridge comes up about 7% wider). A closed section is folded until it stands as tall as its question (26 px on a narrow screen); open, F = 2h and the panels lie flat, the photograph itself. |
| A reader opens a book one fold at a time. | One fold at a time: a critically damped spring on each pleat (26 rad/s, 240 Hz steps). Opening, a pleat starts once the one above is 70% flat; closing, once the one below is 70% folded. |
| At a fold the paper darkens: in these photographs the valley crease is a line about 1.6 mm wide, some 20% darker than the paper round it. | The crease line is measured from the frames (`crease` in the JSON). As a fold closes, a shadow of that darkness spreads from the crease, up to seven times the line's width. Each face is lit by the room plus a lamp above the top of the page (35°), normalised so a flat panel is its photograph exactly; the slopes facing away darken. |
| The scribe wrote in the space the drawing leaves: labels beside the figures, the long text in empty panels, each paragraph opened with ๏. | The free paper is measured: ink (even faint), red lines, the yellow figure's paint, stains and tears are found against the paper's own tone (pricks and ticks under ~30 mm² are left out), grown by about 5 mm, and stored as free runs on a 120-column grid. A run of free paper joins the one above it when they overlap by most of their width, so the paper falls into blocks: a column beside a figure's legs, a blank panel. The answer goes into as few blocks as hold it, the widest first and blank paper from the top down, read top to bottom and side by side left to right; each block keeps one straight left edge and a right edge that follows the drawing. Where it uses only columns, they are balanced. |
| The writing would be on the paper whether the book is open or shut. | The writing is ours, not the book's, so it is on the paper only while its pleat lies open: it comes as the pleat flattens (from 60% open) and lifts as it folds. Closed, the pleats show the book's own paper and drawings, foreshortened. |
| Closed, the book is a stack between its boards, its edge a block of folds. | Under the back board, the stack's own long edge (frame 82), cropped to the panels after the last opening (70 of 78 for the demo) and foreshortened, as seen from the reader's side of the table. |

## Simplified, and why

- **Selected openings.** Six figures from across the book, in its order, rather than one run of consecutive panels:
  in this book a run long enough for six answers would be all labels on side A or all blank paper on side B. The
  folded panels between openings are not drawn.
- **The panels are flat.** The real paper is slightly cockled and the folds have a radius; here a fold is a line and
  a panel a plane, as page-turn and triptych treat a leaf.
- **A closed section stands in pleats, not shut flat.** A concertina pushed fully shut lies stacked and from above
  shows one panel. Folded only as far as its question is tall, it stays a readable half-compressed strip.
- **One eye per pleat.** Each pleat is drawn in perspective about its own top crease, not from one camera for the
  whole page: a page scrolls, and one camera would skew panels far from it.
- **The writing lifts as a pleat folds.** Written ink would stay on folded paper; foreshortened to a sliver it read
  as a rendering glitch, so a closed section shows only the book.
- **The backs of the panels are never seen** (a pleat never turns past upright).
- **Panel heights.** The photographs' crease-to-crease heights vary by about ±3%, which is where each crease line was
  found rather than the paper; every panel is cut to the median height about the middle of its creases.
- **Narrow screens** set the answer in the page's type, under the opened figure (see Layout).

## How it was cut (offline, `tools/`)

- `tools/fetch.py`: the frames from the Wellcome's IIIF image server at 2400 px (side A frames 3-5, 24-25, 33-36,
  38-39; side B frames 41-64; the boards and stack 1, 80-84, 86).
- `tools/cut.py`: the six openings and side B's blank panels (`OPENINGS`, `BLANKS`). Finds the paper and the three
  creases in each frame (the valley by its dark line, the mountains by their pale seam and the step in the paper's
  edge), cuts each panel from the frame where it lies in a middle row, scales every panel to one paper width (frames
  differ by ~2%), mattes the black, and writes the 1240 and 680 px WebPs; measures each panel's free space, the
  crease profile and the ink; cuts both boards (the ground is the near-black reached from the frame's edge) and the
  stack's edge; writes `assets/tamra-nuat.json` (panels in book order, `openings`, `blanks`).

```sh
uv run tools/fetch.py ../../tools/engine/jobs/screenfold-raw 2400
uv run tools/cut.py ../../tools/engine/jobs/screenfold-raw assets
```

## Credits

- The book: Wellcome Collection, MS Thai 801, *[Tamra nuat]*, Thailand, 19th century. Photographs by the Wellcome
  Collection, Public Domain Mark. `assets/credits.json`, `assets/PICK.md`.
- pretext: Cheng Lou, `@chenglou/pretext` v0.0.8, MIT, `vendor/pretext/` (unmodified, as in canon-tables).
- Lifted ideas: canon-tables (pretext lines in the free run between painted shapes), triptych and page-turn (rigid
  painted leaves turning on a hinge, light normalised to the photograph), qalamdan (the real control underneath).
