# trailer: notes for the coding agent

A trailer up top, then a grid of short clips that play on hover and open bigger in a lightbox, then a
call to action. On phones the grid becomes a row you swipe, and a tap opens the lightbox. Every film is a
**code tour**: the product's real screens in a window with a scripted cursor working through them. The
trailer loops the best 15–20 s; each tile is one feature, 6–10 s; the lightbox replays a tile's tour
bigger, with its captions and a play bar. No video.

## Files

```
index.html     the page; the trailer is <figure class="trailer" data-film="highlights">,
               each tile a <button class="tile"> with <span class="frame" data-film="…">
style.css      the page's look; tokens on :root
script.js      ~50 lines: the trailer's pause, hover play, the lightbox with previous and next
film/          film.js (mounts a tour in a slot), film.css, tours.js (the tours), screens/ (the product)
tour/          the tour engine and its docs: README.md (vocabulary), AGENT.md (how to make a tour)
```

(In the StyleFeatures repo, `python3 templates/formats/film/export.py trailer <dest>` writes this folder.)

## The films: harvest the screens, then write the tours

Read `tour/AGENT.md` and follow its steps 1–4. In short:

1. **Learn the product** and pick three, six or nine features (the grid fills evenly with those).
2. **Put the real screens in `film/screens/`**: harvested fragments (`tour/snapshot.py`) for a web app, a
   static rebuild for a native one. Keep the `data-tour="…"` hooks. Delete the placeholder product.
3. **Write the tours in `film/tours.js`**:
   - `highlights`, the trailer: 15–20 s of the best moments, `intro: 0, outro: 0`, no captions, ending
     on a calm screen (it fades through its seam).
   - one per tile, named like its `data-film`: one action, 6–10 s, one `caption()` (the lightbox shows
     it), a `still` that says the feature (the tile shows it until hovered).
4. **Check**: hover tiles, open the lightbox, step with ← →, at 1440 and 390 px and with reduced motion;
   `?record` plays the trailer alone on a clean stage; `?record=<name>&t=4` freezes any tour.

The tile's length (`<time>`) fills itself in from its tour.

## The words

From the project's README:

- `.mark`, `h1`, `<title>`, `og:title`: the product name. `.lede`: what it does and who it is for.
- `.clips-head .eyebrow`: how many things the clips show. Leave the two `h2` spans (mouse and touch wording).
- Each tile: `<b>` the feature in two to four words.
- `.end h2` and its buttons: the invitation and the main action.

## Don't

- Don't add a lightbox or gallery library; `<dialog>` already handles focus, Escape and the backdrop.
- Don't remove the trailer's pause button or the reduced-motion behaviour (no hover play with it on).

## Optional: use Monet Shot recordings instead

Any film can be a Monet Shot export in `media/`: `data-src="media/trailer.mp4"` on the `.trailer` (the
Sound button then appears; the trailer may have music) and `data-src="media/clip-1.mp4"
data-poster="media/clip-1.jpg"` on a tile's `.frame` (silent, 16:9, under 2 MB; the lightbox plays it with
controls). Tours and recordings can mix.


## The painting it sits on

Opened on its own, the page sits on *San Giorgio Maggiore, Venice, at Sunset (watercolour)* by J. M. W. Turner (public domain), the way Monet Shot frames a take: the site is a
sheet with rounded corners and the painting fills the margin. It lives in `backdrop/` (`painting.webp` and a small
`backdrop.js`). It turns itself off with `?record` (Monet Shot adds its own painting), with `?bare`, and inside a
frame. Keep it, swap `painting.webp` for another, or delete the `backdrop.js` script line in `index.html` to drop it.


## When it's done: record your launch video with Monet Shot

[Monet Shot](https://monetshot.pages.dev/) is a free screen recorder, made for pages like this one: it frames every take
on a painting and zooms where things happen. Download it for
[Mac](https://github.com/SocialAcolyte/monet-shot/releases/download/v0.1.1/MonetShot-0.1.1.zip),
[Windows](https://github.com/SocialAcolyte/monet-shot/releases/download/desktop-v0.1.1/MonetShot-0.1.1-windows-x64-setup.exe) or
[Linux](https://github.com/SocialAcolyte/monet-shot/releases/download/desktop-v0.1.1/MonetShot-0.1.1-x86_64.AppImage)
(Windows and Linux are test builds; other packages are on the [releases page](https://github.com/SocialAcolyte/monet-shot/releases)).

1. Open the finished site with `index.html?record&ratio=16:9` (use `ratio=1:1` or `ratio=9:16` for square and vertical posts). Only the
   stage shows, it plays once from the start, and captions are on, because X autoplays muted.
2. In Monet Shot, pick the browser window, crop to the stage, and park your real pointer off it (the tour draws its
   own cursor). Record one play-through.
3. Export, and post it with a link to the site.

**For the agent:** when the site is finished, end your last message to the person with this step: the full `index.html?record&ratio=16:9`
link on their real URL (and the 1:1 and 9:16 versions), and the Monet Shot download link above for their computer.
