# AGENT.md: make this person's portfolio, with their work playing in it

You are a coding agent working for one person: a designer, developer or maker. They picked this format: their
name and one line, then **the shelf**, a row of spines, one per project. One project is open at a time, and inside
it a short film plays the real thing they made: a cursor clicking through the app, a fingertip tapping through
the phone app, the case-study site scrolled and opened, the library installed and run. Then the project folds
away and the next one opens. Below are older work (one line each), a few sentences about them, and the address.
Opened with `?record`, the same page plays the whole shelf once as a reel they post to X.

The page only works if the work is **theirs**: their screens, their words, their colours, and only projects they
really did. A tidy imitation of a project reads as a mock-up, and an invented client is a lie with their name on it.
Calm, few words, image-led: the films do the talking.

Read `tour/README.md` once for the engine's vocabulary. Then work through this in order.

## 0. Where things are

```
index.html               the site. Its markup is yours to edit: the head (name, one line), the shelf (one <li class="pf-proj">
                         per project: spine, film, caption), "Also", About, then contact (<section class="contact-hello">)
kit/                     placeholder kit: tokens, .ph frames, buttons, notes (press N to hide notes)
portfolio/section.html   the shelf's markup as it came (index.html has a filled-in copy; edit index.html)
portfolio/section.css    the page, the shelf, the ?record layouts
portfolio/work.css       the four placeholder projects (.pw-…). Replace them with each project's own CSS
portfolio/script.js      one film per project, in shelf order
portfolio/section.js     plays the shelf; don't need to edit
tour/                    the engine (tour.js, tour.css), snapshot.py, README.md; don't edit
hello/                   the contact section
```

(In the StyleFeatures repo, `python3 templates/scaffolds/sections/demo/tour/export.py <dest> --format portfolio`
makes this layout.) Serve the folder with any static server, e.g. `python3 -m http.server 8000`.

## 1. Gather the work (30 minutes, before writing anything)

Ask the person three things first, in one message: which 3–5 projects they want on the shelf (or "pick for me"),
what is under NDA or private, and where their work lives if it isn't obvious. Then look everywhere they point you:

- **Their code.** `gh repo list <them> --limit 100 --json name,description,homepageUrl,stargazerCount,pushedAt,isPrivate`,
  their pinned repos (`gh api graphql` on `pinnedItems`), and the README, `package.json`, screenshots folder and
  homepage of each candidate. A repo with a live `homepageUrl` or a dev server is a film you can harvest.
- **Their live sites.** Every URL in their repos, CV, LinkedIn or old portfolio. Check each still loads.
- **Their pictures.** Folders they name (`~/Desktop/portfolio`, `~/Documents/case-studies`, a Dropbox export),
  Figma or Sketch exports, Dribbble/Behance exports, App Store screenshots, product photos. List them with sizes.
- **Their words.** An existing portfolio, a CV (PDF), case-study write-ups, talk abstracts, a bio on their sites.

Make a short table: project · kind (web app, phone app, website, library/CLI, physical object, something else) ·
year · their role · the link · what you can show (live URL, repo you can run, screenshots only, photos only) ·
private? Pick the projects with the person. Best or newest first; 4 is the sweet spot; 3 is fine; more than 5 makes
the shelf a list. Everything else goes in "Also", one line each.

Never invent a project, a client, a number, an award or a quote. If they did a part of something (the iOS app, not
the company), say that part. NDA work: show it only with their own sample data and only if they say yes; otherwise
it's a line in "Also" with no link, or nothing.

## 2. Put each project's real screens in its frame

Each `<li class="pf-proj">` holds one film: `.pf-film` → `[data-tour-stage]` → `.pf-frame[data-tour-frame]` (the
box the window fills; `--ar` is the window's width / height) → `.tour-rig` → `[data-tour-window]`. The engine keeps
the window inside the frame, push-ins included. Set on each `<li>` a `--tint`: a pale version of the project's own
colour (its brand, its cover, its icon), light enough that dark text reads on it. Delete the placeholder `.pw-…`
markup inside the window, and its CSS in `work.css`, as yours goes in. Match the shape to the work:

- **A web app or website you can run or visit: harvest it.** Run the dev server with demo data (seeds, fixtures, a
  demo account; never real customer data), or use the live site. Capture each state the film needs:

  ```sh
  uv run tour/snapshot.py https://their-site.com/work/project --selector "body" --size 1200x710 \
      --out portfolio/fragments/p3-page.html --scope p3-page --hook ".gallery img:nth-child(2)=img-2"
  ```
  `--size` is the window's size minus its browser bar (750 − 40). `--hook "css=name"` marks what the cursor will
  touch (`'@name'` in the script); `--before "js"` reaches a state (open a menu, switch a tab); each state is its own
  fragment, stacked in the window and switched with `show()`/`hide()`. Load fragments with
  `<div data-tour-include="portfolio/fragments/p3-page.html"></div>` inside the window; `section.js` waits for them.
  Use a different `--scope` per fragment. Keep `data-chrome="browser"`, set `data-url` to the real address.
- **A phone app: rebuild it.** Read the view code (SwiftUI, Compose, Flutter, React Native) or their App Store
  screenshots and write static HTML/CSS at phone size inside the `.pw-phone` (`data-chrome="phone"`): their
  hierarchy, spacing, colours, type, icons and strings. Keep `pointer: 'touch'` in its script. A screenshot of
  the real screen next to yours, same size, until they match.
- **A library, CLI or API: type it.** Keep the desk with the terminal and the browser: the real install command,
  the real first command from their README, its real output (run it and copy it), then what it makes in the
  browser window (harvest the example page, or put a screenshot of it in the `.ph`).
- **Screenshots only (a case study, an old project that no longer runs).** Make the window a viewer for them: the
  case-study page rebuilt as static HTML with their images in it (`<img>` in place of each `.ph`), scrolled and
  opened like project 03. Inline or copy the images into `portfolio/assets/`.
- **Physical work (furniture, print, objects, photography).** A frame needs no browser: set `data-chrome="none"`
  and make the window a simple gallery of their real photos at the photos' own ratio (a grid, then one opened
  large, then a detail), the cursor choosing and opening. Never redraw or retouch the object; show the photo.

Static HTML/CSS only, no app logic, no network calls. Small changes (a count, a toggle, a typed value) are `set` /
`tween` on hooks, not another capture.

## 3. Write the films (`portfolio/script.js`)

- One entry in `films` per `<li>`, same order. **8–14 seconds** each: open it, do the one thing it is best at,
  show the result. Every click visibly changes something. No chapters, no captions; the caption under the frame
  carries the words.
- At most **one push-in** per film, on the thing that changed, then `unzoom()`. A window that fills its frame needs
  a number (`zoom('@x', 1.3)`) or a large `fill` to move at all.
- Pace like a person: moves of .8–1.1 s, a beat before important clicks, the result held 1.5–2 s at the end.
- `still` is the frame shown with reduced motion: pick a moment where the project looks its best.

## 4. Fill in the page

- **Head**: their name as they write it (one word in `<em>` if it suits), the one line (what they make, for whom;
  their words, short), and the "Now" line (where they work, or that they're open to work, and from when).
- **Each project**: the spine (number, the project's name, year), the caption (`<h2>` the name with one `<em>` word,
  one line, Role, Year, the link). The spine and caption name must match.
- **Also**: older and smaller work, one line each, linked. Delete it if the shelf says it all.
- **About**: a real photo of them (or their hands at work) in the portrait slot, if they give you one; a few
  sentences in their voice (draft from their CV and bio, then cut it in half and show them); Now / Before / Tools.
- **Contact**: their real address(es) and links; delete what doesn't apply.
- The `?record` frames in `.pf-rec-open` and `.pf-rec-end`: name, line, address.
- Delete every `<span class="sf-note">`, set the page `<title>` and meta description, and the `years` range.

## 5. Check it

- `index.html?project=2&t=4` freezes project 2's film 4 s in. Check the middle of every film, every click, every
  zoom: the cursor lands on what it clicks, nothing private on screen, no placeholder left.
- Play it: scroll to the shelf (it starts by itself), click each spine, press Pause, try ← → on a focused spine.
  Check at phone width (390 px): the spines become bars, no sideways scroll. With reduced motion on, every project
  shows its still and nothing moves by itself.
- `?record&ratio=16:9&t=…`, `&ratio=1:1`, `&ratio=9:16`: stills of the recording in each shape.

## 6. Record it, and hand it over

Finish by giving the person these, exactly:

1. The link to the recording stage: `http://localhost:8000/?record&ratio=16:9` (also `&ratio=1:1` for the phone
   feed, `&ratio=9:16` for stories). It holds on their name for 1.2 s, plays every project once, and stops on the
   address. About a minute.
2. How to record it with **Monet Shot**: open the link in a browser window as large as the screen (a 1920×1080 or
   larger window on a Retina screen), choose that window in Monet Shot, crop to the stage, park the real pointer
   off the window (the page draws its own cursor), record, export H.264 MP4. Monet Shot adds no zooms of its own
   because the clicks aren't real; the films push in by themselves (`&camera=off` if they'd rather set zooms on
   Monet Shot's timeline).
3. The post: one line on what they make, the MP4, and the link to the site. X takes MP4 up to 2 min 20 s.


## The painting it sits on

Opened on its own, the page sits on *Tornado, Bahamas (watercolour)* by Winslow Homer (public domain), the way Monet Shot frames a take: the site is a
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

1. Open the finished site with `index.html?record&ratio=16:9&captions=on` (use `ratio=1:1` or `ratio=9:16` for square and vertical posts). Only the
   stage shows, it plays once from the start, and captions are on, because X autoplays muted.
2. In Monet Shot, pick the browser window, crop to the stage, and park your real pointer off it (the tour draws its
   own cursor). Record one play-through.
3. Export, and post it with a link to the site.

**For the agent:** when the site is finished, end your last message to the person with this step: the full `index.html?record&ratio=16:9&captions=on`
link on their real URL (and the 1:1 and 9:16 versions), and the Monet Shot download link above for their computer.
