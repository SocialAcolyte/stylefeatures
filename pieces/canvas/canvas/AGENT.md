# AGENT.md: make this person's board, the site that is one big canvas

You are a coding agent working for one person whose work is visual: a product designer, an illustrator, an art
director, an architect, a type designer, a ceramicist. They picked this format: their whole site is **one board**, a
large sheet of warm paper with their work pinned to it as frames, each with its name above it, a few sticky notes in a
calm hand, hairline arrows from process to outcome, their name set as a cover frame and a contact frame in the corner.

When the page opens, a short film plays on the board itself: the camera flies frame to frame, their cursor (with their
name on its tag) points at the work and leaves four comment pins, then the camera pulls back to the whole board and
**hands it over**. From then on the visitor drives: drag to pan (it glides and settles), wheel or pinch to zoom about
the pointer, arrow keys frame to frame, click a frame to fly to it, a minimap, and Work / About / Contact in the top
bar. Any touch during the film takes over at once, from exactly where the camera is. On a phone there is no film and
no camera: the same frames, in order, as a clean vertical sequence. The same page opened with `?record` is the stage
they record for X.

The board only works if everything on it is **theirs**: their projects, their process, their words, their face. You
are gathering what already exists, not inventing a portfolio. Never invent a project, a client, an employer, a
number, a quote, an award or a link. If something is missing, leave the placeholder and ask.

Read `tour/README.md` once for the engine's vocabulary (the parts that matter: *A frame the format draws*,
*A second design size for tall stages*, *A third for squarish stages*, *A height that follows the frame: auto*,
`zoom` with `max` and `arc`, the `manual` driver). Then work through this in order.

## 0. Where things are

```
index.html            the page: the board (<section class="demo-canvas">), its controls and closing frame
kit/                  placeholder kit: tokens, .ph frames, buttons, notes (press N to hide notes)
canvas/section.css    the board, its items, the three layouts, the visitor's controls, the phone sequence (.cv-seq)
canvas/script.js      the film: film('wide' | 'square' | 'tall', copy)
canvas/section.js     picks the layout, plays the film, hands the camera over, the minimap, the phone sequence
canvas/section.html   the markup as it came (index.html has a filled-in copy; edit index.html)
tour/                 the engine (tour.js, tour.css), snapshot.py, README.md; don't edit
```

(In the StyleFeatures repo, `python3 templates/scaffolds/sections/demo/tour/export.py <dest> --format canvas` makes
this layout.) Serve the folder with any static server, e.g. `python3 -m http.server 8000`.

## 1. Gather their things (before writing anything)

Ask the person for what you can't find, and confirm anything you found before it goes public. Look in this order:

- **Their current portfolio.** Their own site, Behance, Dribbble, Cargo, Readymag, ArtStation, Are.na, an
  Instagram they use as a portfolio, a PDF portfolio they send to studios. Take the projects they already chose to
  show, in their order. Three is right for the board (one with process, one as screens or a pair, one as a series);
  ask which three if they have more.
- **The files, not the thumbnails.** Ask for the images at full size, or export them: a Figma / Sketch / Penpot file
  (export each frame at 2x as PNG or WebP), case-study images, a Behance project's original images, photographs of
  physical work, drawings scanned flat, plans and renders. Put them in `assets/work/<project>/`. For each frame keep
  its real proportions; the board's frames take any ratio (see §2).
- **The process.** Sketches, whiteboards, wireframes, models, test prints, mood boards. These go on the left of the
  arrows. Ask before showing anything made for a client: some process is under NDA. If they can't show process, use
  two finished details instead and keep the arrows (detail → whole).
- **Each project's facts.** Name, their role on it, the year, the medium or the team, and (only if it's public and
  they agree) the client. One true sentence of what changed because of it, in their words.
- **Their words.** The line under their name (what they make, and for whom), a short bio in their voice (from their
  About page, LinkedIn, a talk intro; shorten, never rewrite into marketing), previous roles and studies with years
  (CV, LinkedIn export).
- **Contact.** The email they want strangers to use, what they're open to (a role, commissions, collaborations)
  and when, and two or three links (a PDF portfolio, Instagram, LinkedIn, a shop). Only real ones.
- **The portrait.** The photo people already know them by, at 4:5. Never pull a photo of them from elsewhere without
  asking, and never use anyone else's.
- **Their look.** If they have a site, take its fonts and its one accent colour (`--cv-accent` in `canvas/section.css`
  is the pins, the numbers and the cursor's tag). Otherwise keep the warm paper; it suits almost any work.

## 2. Fill the board

The board is `.cv-board` inside `[data-tour-window]` in `index.html`. Each item is an element with class `cv-item`
and its place on the board **in three layouts** as CSS variables on its `style`:

```
--x --y --w --h        wide (desktop, 16:9 recordings): the region is 3200 × 1700 board px
--sx --sy --sw --sh    square (1:1 recordings, squarish windows): 1800 × 1800
--tx --ty --tw --th    tall (9:16 recordings, tall windows): 1200 × 2120
```

The region is centred on the board; the board's height follows the screen, so keep ~100 px of paper around the
edges. When you change a frame's ratio, change its `--w`/`--h` in all three layouts, then look at all three
(`?record&ratio=16:9|1:1|9:16&t=0`). On phones the items flow in **markup order** and each frame keeps its wide
ratio (`--w`/`--h`), so keep the markup in reading order: cover, project one, two, three, about, contact.

- **Cover** `.cv-cover`: role and place, the name (`.cv-name`, keep one `<em>` if a word deserves it), the one line,
  and the years line.
- **Frames** `.cv-frame`: `data-label` is the name printed above it ("Project · Sketches", "Final", "1 / 3"). Replace
  the `<figure class="ph">` with `<img src="assets/work/…" alt="what it shows">` (it fills the frame:
  `position:absolute; inset:0; width:100%; height:100%; object-fit:cover`, or `contain` on white for drawings). A clip
  works too: `<video muted playsinline loop autoplay src="…">`.
- **Group heads** `.cv-head`: the number, the project's name, role · year. Items with the same `data-zone` make one
  group the film and the top bar's Work button fly to.
- **Sticky notes** `.cv-note`: three or four short lines in their voice (`--rot` tilts them a few degrees). Notes, not
  slogans: "Started from a question about…", "The version nobody saw". Keep them under eight words.
- **Arrows**: `<path data-from="sketch" data-to="final">` in `.cv-arrows`; `section.js` draws a calm curve between the
  two items in every layout (the names are each item's `data-cv`). Process → outcome only; two or three in all.
- **Comment pins** `.cv-pin` inside a frame: `--px`/`--py` place the pin (fractions of the frame), `.is-left` opens the
  bubble to the left. The text in `data-tour="pin-N-t"` is what the cursor types in the film and what stays on the
  board: one line about that piece, in their voice. `{{initials}}` in the pin: their initials.
- **About** `.cv-about` and **Contact** `.cv-contact`: portrait, bio, previously (real roles and years), the email,
  what they're open to, the links, the domain. These links are real `<a href>`s: the board is the site.
- The top bar's name, `{{domain}}` in the closing frame (shown at the end of a recording), the page `<title>`
  ("Name: work") and meta description (their line), and an `og:image` (a still of the whole board: see §4).

Delete every `<span class="sf-note">` when you're done.

## 3. The film (`canvas/script.js`)

It already flies the story (about 45 s): the whole board, the cover, project one as process → outcome with the
arrows drawing in and a comment, project two with a comment, the series with a comment, about, contact with a
comment, then the whole board. Adjust it to them rather than rewriting it:

- `fly('@zone-a', fill, { arc })` frames a group or a frame; `fill` is how much of the screen it gets, per layout
  (`f(wide, square, tall)`). `arc` pulls the camera back mid-flight on long moves; keep it under .35.
- Every comment is `...comment(n)`: the cursor clicks the pin's spot, the pin drops, its text types. Four is plenty.
- If a frame is a clip, play it as the camera arrives (a `set('@clip', { class: '+is-on' })` your CSS uses).
- `captions` are off by default (the pins carry the words); `&captions=on` burns them in for X. Word them in their
  voice, one short sentence each (`copy.cap1`… in `film()` or the defaults beside them).
- Every flight must land on something worth reading. If a frame is too small to read at the end of a flight, give it
  a bigger `fill` or make it bigger on the board.

## 4. Check it

- `index.html?t=12.5` freezes any moment of the film. Check the middle of every flight and just after every comment:
  the pin sits on the work it talks about, the bubble covers nothing important, the cursor's tag is their name.
- `?record&ratio=16:9&t=…`, `&ratio=1:1`, `&ratio=9:16`: each layout, start (`t=0`) and end (the whole board, the
  contact frame in its corner, the domain under it). `?record&ratio=16:9&t=0` at 2x is a good `og:image`.
- The live page at 1440 × 900: let the film end and the controls arrive; drag (it should glide and settle, and give a
  little at the edges), zoom with the wheel, use the arrows, click a frame and click it again, use the minimap and
  the top bar. With reduced motion: the finished board, whole, already in the visitor's hands.
- A 390-wide phone: a clean column, every frame at its ratio, no sideways scroll, the comments under their frames.
- Nothing left that is lorem, a placeholder you meant to replace, someone else's work, a client they can't name, or
  contact details they didn't agree to publish.

## 5. Hand it over: record and post

End by giving the person this, with the link filled in:

1. Open **`index.html?record&ratio=16:9`** (served, e.g. `http://localhost:8000/?record&ratio=16:9`) in a browser
   window large enough for a crisp stage: 1920 × 1080 or larger on a Retina screen is ideal.
2. Record it with **Monet Shot**: choose the browser window, crop to the stage, park the real pointer off the window
   (the film draws its own cursor). It holds on the whole board for 1.2 s, plays once and stops on the whole board
   with the address. Monet Shot adds no zooms of its own, because the clicks aren't real; if you'd rather place
   zooms on its timeline, open `?record&ratio=16:9&camera=off` so you don't get both (the board then stays whole).
3. Export H.264 MP4 and post it to X with one line and the link. **16:9** keeps the board widest and reads best on
   desktop and in quote posts; `ratio=1:1` takes more of the phone feed; `ratio=9:16` is for stories. Record each
   ratio separately; the board lays itself out again for each, so never crop one into another. Add `&captions=on`
   for burned-in captions (X autoplays muted).
4. X takes MP4 (H.264, AAC) up to 2 min 20 s and 512 MB.
