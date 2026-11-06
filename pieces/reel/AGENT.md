# reel: notes for the coding agent

A vertical run of features. Each row has a number, one line, and a short **code tour** of that one
feature: the product's real screens in a window, a scripted cursor doing the thing, 6–10 s, looping only
while it is on screen, with its own pause button. No video. The page ends with a call to action.

## Files

```
index.html     the page; one <article class="feat"> per feature, its clip is <figure class="clip" data-film="…">
style.css      the page's look; tokens on :root
script.js      ~5 lines: mounts each clip and wires its pause button (film.js plays it while in view)
film/          film.js (mounts a tour in a slot), film.css, tours.js (the tours), screens/ (the product)
tour/          the tour engine and its docs: README.md (vocabulary), AGENT.md (how to make a tour)
```

(In the StyleFeatures repo, `python3 templates/formats/film/export.py reel <dest>` writes this folder.)
No build step, no packages.

## The clips: harvest the screens, then write one tour per feature

Read `tour/AGENT.md` and follow its steps 1–4. In short:

1. **Learn the product** and pick its five to seven features, the README's feature list in order.
2. **Put the real screens in `film/screens/`**: harvested fragments (`tour/snapshot.py`) for a web app, a
   static rebuild for a native one. Keep the `data-tour="…"` hooks. Delete the placeholder product.
3. **Write one tour per feature in `film/tours.js`**, named like the rows' `data-film`. Each:
   - one action, 6–10 s, `intro: 0, outro: 0`; at most one `zoom()`, on the thing that changes;
   - starts from the state the feature needs (the `filled` steps set it instantly at 0 s), and ends on a
     calm screen, because the loop fades through its seam back to the start;
   - a `still`: the frame shown before it plays and with reduced motion. Make it say the feature.
   - A `caption()` is optional here (clips play muted and the row's line says it).
4. **Check**: `?record=<name>&t=4` freezes one tour alone; scroll the page at 1440 and 390 px: only the
   clip on screen plays; with reduced motion nothing starts until its button is pressed.

To add a row, copy an `<article class="feat">` and point its `data-film` at a new tour.

## The words

From the project's README:

- `.mark`, `<title>`, `og:title`: the product name.
- `.intro .eyebrow`: what it is in a few words. `h1`: what it does in one line. `.lede`: who it is for.
- Each `.feat h2`: one feature in one line; the `<em>` holds the second half. `.feat p` is optional;
  delete it rather than pad it.
- `.end h2` and its buttons: the invitation and the main action. `footer`: name, year, company.

## Don't

- Don't add JavaScript beyond `script.js` and `film/`: no carousels, lazy-load or scroll libraries.
- Don't remove the per-clip pause buttons or the reduced-motion behaviour.
- Don't let a clip's tour run past 10 s; a long one belongs in `chapters` or `cinema`.

## Optional: use Monet Shot recordings instead

For any row, export the feature from Monet Shot (6–10 s, silent, 16:9, under 2 MB), put it in `media/`
and add `data-src="media/feature-1.mp4" data-poster="media/feature-1.jpg"` to its `.clip`. It plays,
loops and pauses exactly like a tour. Rows can mix tours and recordings.
