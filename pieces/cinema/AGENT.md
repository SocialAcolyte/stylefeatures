# cinema: notes for the coding agent

One full-bleed film playing as a loop, the product name, one line, one call to action, and a "Watch the
full film" button that opens the whole film, with chapters, captions and a play bar. The film is not a
video: it is a **code tour**, the product's real screens in a window with a scripted cursor clicking
through them (like monetshot.pages.dev). The page is a frame for it.

## Files

```
index.html     the page. The loop is <figure class="film" data-film="highlights">; the full film is
               <div class="screen" data-film="film"> in the <dialog>
style.css      the page's look; colours and fonts are tokens on :root
script.js      ~20 lines: mounts both films, the pause button, the dialog
film/          film.js (mounts a tour in a slot), film.css, tours.js (the tours), screens/ (the product)
tour/          the tour engine and its docs: README.md (vocabulary), AGENT.md (how to make a tour)
```

(In the StyleFeatures repo, `python3 templates/formats/film/export.py cinema <dest>` writes this folder.)
No build step, no packages: serve it with `python3 -m http.server`.

## The films: harvest the screens, then write the tours

Read `tour/AGENT.md` and follow its steps 1–4; they are the real work. In short:

1. **Learn the product**: its name, one-line pitch, design tokens, and the 3–5 screens of its core loop.
2. **Put the real screens in `film/screens/`.** A web app: capture each state with `tour/snapshot.py`
   into fragments and load them where `app.html` is now. A native app: rebuild the screens as static
   HTML/CSS from the view code. Keep the hooks (`data-tour="…"`) the tours point at. Delete the
   placeholder product (`app.html`, `phone.html`, `screens.css`) once yours is in.
3. **Write the two tours in `film/tours.js`** (delete the ones this page doesn't use):
   - `highlights`: the loop. 15–20 s, no chapters, no captions, `intro: 0, outro: 0`. Pick the stretch
     that shows the product at its best, and end on a calm screen: the loop fades through its seam.
   - `film`: the whole thing, 30–60 s, 3–5 `chapter()`s, a `caption()` for each step (the dialog shows
     them). `still` is the frame shown with reduced motion.
4. **Check them**: `?record=highlights&t=6` freezes any moment of a tour alone; `?record` plays the full
   film on a clean stage; the page itself at 1440 and 390 px wide, and with reduced motion on.

## The words

Take them from the project's README:

- `<title>`, `og:title`, `.band h1`: the product name. The `<em>` italicises the second word; move or drop it.
- `.eyebrow`: what it is, in three to six words. `.lede` and the `description` metas: the README's first
  sentence, cut to one line. `.btn.solid`: the main action and its link.
- The full film's length in "Watch the full film" fills itself in from the tour.
- For `og:image`, screenshot `index.html?record=highlights&t=<still>` and add the meta tag.

## Record it for X

`index.html?record&ratio=16:9` (or `1:1`) is the full film alone on a clean stage, with captions burned
in. Record it with Monet Shot as `tour/README.md` describes.

## Don't

- Don't add JavaScript beyond `script.js` and `film/`. No frameworks, players or libraries.
- Don't remove the pause button or the reduced-motion behaviour (`film.js` handles it: nothing starts by itself).
- Don't add sections. If the product needs more than a name, a line and a film, use another layout.

## Optional: use Monet Shot recordings instead

Put the exports in `media/` and add `data-src` to a slot: `data-src="media/loop.mp4" data-poster="media/loop.jpg"`
on the `.film` figure; `data-src="media/film.mp4" data-vtt="media/film.vtt" data-sound` on the dialog's
`.screen`. The page's buttons work the same. Keep the loop under 3 MB and the film under 15 MB.
