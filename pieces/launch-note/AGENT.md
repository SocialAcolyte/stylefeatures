# AGENT.md: write this product's launch note for the feature it just shipped

You are a coding agent inside a team's product repository. They picked this format: the "we just shipped it"
changelog post for **one** feature. A short headline and the date; a 10–20 second loop of just that feature, a
scripted cursor clicking through the real screen; the screen before and after under a draggable line; three
short notes on what changed; the update command. Calm, editorial, quick to make: an afternoon, not a week.
Opened with `?record&ratio=16:9` the loop becomes a short film (headline card, the loop once, an update card)
to record for the X post.

Read `tour/README.md` once for the engine's vocabulary. Then work through this in order.

## 0. Where things are

```
index.html               the page. Its markup is yours to edit: the note (<article class="demo-launch-note">:
                         header, the loop, before/after, notes), then the install card (<section class="cta-install">)
kit/                     placeholder kit: tokens, .ph frames, buttons, notes (press N to hide notes)
launch-note/script.js    the loop's script
launch-note/section.css  the note's layout, the recording layouts, and the placeholder product's CSS (.ln-app …)
launch-note/section.js   starts the loop when it's on screen; the before/after divider
tour/                    the engine (tour.js, tour.css), snapshot.py, README.md; don't edit
install/                 the end card: name, the update commands, footer
```

(In the StyleFeatures repo, `python3 templates/scaffolds/sections/demo/tour/export.py <dest> --format launch-note`
makes this layout.) Serve the folder with any static server, e.g. `python3 -m http.server 8000`.

## 1. Find the feature (10 minutes)

Take it from what actually shipped, newest first:

```sh
gh pr list --state merged --limit 15 --json number,title,mergedAt,url       # the latest merged PRs
gh pr view <n> --json title,body,files,mergedAt,url,labels                  # the one you pick
git log --oneline --since="3 weeks ago" --no-merges                         # if they don't use PRs
git describe --tags --abbrev=0; gh release view --json tagName,publishedAt,body   # the release it's in
sed -n 1,60p CHANGELOG.md                                                   # if they keep one
```

Pick **one user-facing feature** (not a refactor, not a dependency bump, not three small fixes). From the PR,
the commits and the code it touches, write down:

- **Headline**: the feature's name, then what it does, in under ten words; one phrase in italics
  (`<em>`). "Filters, <em>on every list</em>", not "Introducing our powerful new filtering experience".
- **Date**: when it reached people (the release or merge date), in `<time datetime="2026-11-01">`.
- **Version**: the tag it ships in. Delete the field if they don't version.
- **Dek**: one or two sentences: who it's for and the moment it helps.
- **Three notes**: what's new; what it replaces or fixes; what people need to do (often: nothing).
- **The source**: the PR or release link, only if the repository is public. Otherwise delete the line.

Never invent numbers, quotes, customers or benchmarks. If the PR says "2× faster" and shows how, you may say
it; if it doesn't, don't.

## 2. Harvest the screen, twice

The feature lives on one screen. You need that screen in two states, at the same size:

- **before**: the base branch or the last release, without the feature;
- **after**: this branch, with it.

Run both side by side with a worktree, seeded with the same demo data (fixtures, a seed script, a demo
account; never real customer data):

```sh
git worktree add ../before origin/main          # or the previous tag
(cd ../before && <install> && <dev server on another port>)
uv run tour/snapshot.py http://localhost:3001/tasks --selector "#root" --size 1200x710 --out launch-note/fragments/before.html --scope before
uv run tour/snapshot.py http://localhost:3000/tasks --selector "#root" --size 1200x710 --out launch-note/fragments/after.html  --scope after
```

`--size` is the window's size minus the browser bar (750 − 40). Use `--before "js"` to reach a state (open a
menu, apply the filter) and `--hook "css=name"` to mark what the loop's cursor will click. Capture each state
the loop needs as its own fragment too (`--scope` unique per fragment).

- **Before/after**: replace the two empty panes in `index.html` with the fragments:
  `<div class="ln-ba-pane is-before" data-ln-state="before"><div data-tour-include="launch-note/fragments/before.html"></div></div>`
  (paths are relative to `index.html`). Filled panes are left alone; the placeholder's clone step and its
  `STATES` in `section.js` can go.
- **The loop's window**: replace `.ln-app` with the fragments for each state, stacked, switched with
  `show()`/`hide()` at the click that causes them; small changes (a checkbox, a count, a chip) are better done
  with `set`/`tween` on hooks. Keep `data-chrome="browser"` for a web app (`data-url` its real path), `app` for
  a desktop app; for a mobile feature use the `demo/phone` format's window and `pointer: 'touch'`.
- A native app can't be snapshotted: rebuild the screen from its views in static HTML/CSS with their exact
  tokens, icons and strings (see `demo/phone`'s AGENT.md for the method), once per state.

## 3. Write the loop (`launch-note/script.js`)

- **10–20 seconds, three to five actions, one feature.** Start on the state people already know, end on the
  result. Every click visibly changes something.
- **Two zooms at most**: one on the control, one on the result. `unzoom()` before the end so the loop's seam
  is the whole window.
- **A caption per action**, a short sentence in the product's voice. The loop plays muted.
- `still` is the frame reduced motion shows: the result, with its caption.
- `intro` and `outro` already differ for recordings (a headline card and an update card) and the page (a
  breath before it starts again); leave them unless the loop feels rushed.

## 4. Check it

- `index.html?t=6` freezes a moment: check one just after each click and at each zoom (the cursor on its
  target, the thing that changed in view).
- Let it play: it starts when it scrolls into view, pauses off screen, and the pause button wins. Watch the
  seam where it starts again.
- Drag the before/after line, and use the arrow keys on it: the two states must line up pixel for pixel
  except where the feature is.
- `?record&ratio=16:9&t=0`, `&t=…`, `&t=` at the end: the headline card, the slug above the window, the
  update card. Also `ratio=1:1` and `ratio=9:16`.
- 1440 and 390 wide, reduced motion on: no sideways scroll, a calm still, nothing cut off.

## 5. Fill in the page

- The header: `Changelog` (link it to their changelog page), the date, the version, the headline, the dek.
- The notes: three, short. The source line.
- The install card (`.cta-install`): the real update commands (`brew upgrade …`, `npm i -g …@latest`, "restart
  the app", the download link), version and requirements.
- The recording's end card (`.ln-end`): the one update command and the changelog address.
- Delete every `<span class="sf-note">` and set the page `<title>` and meta description.

## 6. Record and post

1. Open `index.html?record&ratio=16:9` in a large browser window (1920 × 1080 or more on a Retina screen).
2. Record with **Monet Shot**: choose the browser window, crop to the stage, park the real pointer off the
   window. It holds on the headline card for 1.2 s, plays the loop once and stops on the update card.
   The film's own camera does the push-ins; use `&camera=off` if you'd rather add zooms on Monet Shot's
   timeline.
3. Export H.264 MP4 (X: up to 2 min 20 s, 512 MB; this is 15–25 s). 16:9 for desktop and quote posts; record
   `ratio=1:1` separately for a phone-first feed.
4. Post one line ("Filters, on every list.") and the link to this note.


## When it's done: record your launch video with Monet Shot

[Monet Shot](https://monetshot.pages.dev/) is a free screen recorder for macOS, made for pages like this one: it frames
every take on a painting and zooms where things happen.

1. Open the finished site with `index.html?record&ratio=16:9&captions=on` (use `ratio=1:1` or `ratio=9:16` for square and vertical posts). Only the
   stage shows, it plays once from the start, and captions are on, because X autoplays muted.
2. In Monet Shot, pick the browser window, crop to the stage, and park your real pointer off it (the tour draws its
   own cursor). Record one play-through.
3. Export, and post it with a link to the site.

**For the agent:** when the site is finished, end your last message to the person with this step: the full `index.html?record&ratio=16:9&captions=on`
link on their real URL (and the 1:1 and 9:16 versions), and the Monet Shot link above.
