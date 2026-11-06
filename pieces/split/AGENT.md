# AGENT.md: make this product's launch page and split-screen film

You are a coding agent working inside the repository of an AI tool, or of anything that turns an input into an
output (a prompt into a page, a query into a chart, notes into a document, code into a preview). The team picked
this format: a launch page that opens on a two-pane film. On the left, the input is typed by a person; on the
right, their product reacts live: UI building up, a document filling, a canvas updating. A scripted cursor
crosses between the panes. On phones and in 9:16 the panes stack, input on top. It ends on their name and one
way to get it; opened with `?record`, the same page is the stage they record as their launch video for X.

The film only works if both panes are **theirs**: their real input UI, a prompt their users actually write, and
the output their product actually produced for that prompt, at each stage. An invented answer is a claim about
what the product can do. Don't make one.

Read `tour/README.md` once for the engine's vocabulary. Then work through this in order.

## 0. Where things are

```
index.html           the launch page: the film (<section class="demo-split">: band, the window with the two
                     panes, closing frame), then the install frame (.cta-install)
split/script.js      the film's script: what's typed, what streams, what builds on the right, the camera
split/section.css    the band, the closing frame and the placeholder product; .is-tall rules for the stacked panes
tour/                the shared engine (tour.js, tour.css), snapshot.py and README.md; don't edit
kit/, install/       the placeholder kit and the end frame
```

(In the StyleFeatures repo itself, `python3 templates/scaffolds/sections/demo/split/export.py <dest>` makes this
layout.) Serve the folder with any static server, e.g. `python3 -m http.server 8000`.

## 1. Learn the product (15 minutes, before writing anything)

- **README, docs, marketing copy, package metadata**: the exact name (and which word deserves the italic), the
  one-line pitch, the install or sign-up path, pricing words, requirements. Never invent a claim or a number.
- **Real prompt examples.** Look for them where the product keeps them: example/suggestion chips in the empty
  state, onboarding, docs and tutorials, `examples/`, test fixtures, eval sets, demo seeds, the README's GIF.
  Pick one first prompt that shows the core loop, and one follow-up that shows editing or steering (the
  product's equivalent of "make the headline shorter"). Use them verbatim.
- **The input UI**: the composer, the editor, the form. Its placeholder text, buttons, chips, model picker,
  keyboard shortcut to send. **The output UI**: what fills in, in what order, and what a "done" state looks like.
  Read the real copy for statuses ("Generating", "Thinking", "Done") and use it.

## 2. Harvest the real states

Run their dev server with a demo account and seed data (never real users' data). Send the chosen prompt for
real and capture the output pane at each stage it passes through:

```sh
uv run tour/snapshot.py http://localhost:3000/chat/demo --selector "[data-panel=preview]" --size 780x658 \
    --out split/fragments/out-empty.html --scope out-empty
uv run tour/snapshot.py http://localhost:3000/chat/demo --selector "[data-panel=preview]" --size 780x658 \
    --out split/fragments/out-done.html --scope out-done --hook "h1=headline"
```

- `--size` is the pane's size in the window (the placeholder's output pane is 780 × 658 below its toolbar; the
  input pane is 420 wide). On phones the window is 440 × 820 and the panes stack (input 340 tall, output below):
  capture the output a second time at about 440 × 440 if their UI is responsive, and switch with `.is-tall`.
- States worth capturing: empty → partway (skeletons, the first blocks) → done → after the follow-up. Stack
  them in the pane and cross-fade with `show()`/`hide()`; or capture only "done" and reveal its blocks in order
  with `show('.your-block', { stagger: .6 })`, which reads as building and is honest if that is the order the
  product builds in.
- **The input pane** is usually simple enough to rebuild in static HTML with their CSS: their composer, their
  message bubbles, their chips. Keep the hooks the script uses: `@input` (the field), `@input-text` (the span
  typed into), `@send`, `@thread` (with `data-tour-follow`, so new messages stay in view), `@msg-1`, `@ai-1-text`.
- **Streaming text** (a model's reply, a document being written): copy the real reply. The script types it with
  `rhythm: 'stream'`, which lands in chunks the way tokens arrive.
- **Canvas, charts, images**: capture each stage as an image (`snapshot.py` inlines canvases) and cross-fade.
  Where the product shows their user's own content (photos, documents), use the kit's `.ph` placeholders or
  the product's own sample content.
- Not a chat? Swap the left pane: a code editor (typed with `rhythm: 'human'`), a form being filled, a SQL box.
  Swap the right: a document, a table, a chart, a design canvas, a terminal. The script's shape stays the same.

## 3. Write the script (`split/script.js`)

- **35–45 seconds, 4 chapters**: say it → watch it build → steer it → take it with you. The card is
  `'02 / 04'`, a few words with exactly one `<em>` word, one plain line. Captions carry it muted.
- **The prompt**: `click('@input')`, `type('@input-text', PROMPT, { rhythm: 'human', cps: 20 })`, `key(['⌘',
  'return'], { parallel: true })` or `click('@send')`. Then clear the field (`set(…, { text: '' })`) and show
  the message (`stream('@msg-1')`).
- **The build**: start the right pane and the reply together. `type('@ai-1-text', …, { rhythm: 'stream',
  parallel: true })`, `show('.pg-b', { stagger: .7 })` and `stream('@steps-1 > li', { every: .7, jitter: 0 })`
  keep the left and the right in step. A status (`set('@status-text', …)`), a spinner and a progress line
  (`tween`) say it's working.
- **The camera follows the action**: zoom on the pane being used, pan to the other when the cursor crosses
  (`zoom('@in', 'fit', { fill: [.8, .96] })`, `zoom('@canvas', …)`). Pull back to the whole window only when
  both panes matter at once; the wide window is small in the 1:1 frame. `fill: [wide, stacked]` frames tighter
  on 1:1 and phones.
- **Every click changes something**: a selection outline, a chip in the composer, a tab switching, a toast.
- Set `still` to a moment with the thread on the left and the finished output on the right.

## 4. Check it

- `index.html?t=12.5` freezes any moment. Check each chapter's middle, each pan, and the end of each build.
  Then `?record&ratio=1:1&t=…` and `?record&ratio=9:16&t=…` (the stacked panes), and a 390 px phone.
- Look for: the output is the real output for that exact prompt; text is readable in the 1:1 frame while
  zoomed; the stacked layout has no clipped controls; nothing private; no placeholder left you meant to replace.
- Play it: scroll from the top (it drifts after the first click), and `?driver=play`. With reduced motion on,
  one calm, complete frame.

## 5. Fill in the page

- The band: eyebrow, name, one line on what goes in and what comes out, the gate, a CTA.
- The closing frame: name, one line on what to try first, the CTA, the domain (shown in recordings).
- The install frame (`.cta-install`): the real way to get it (sign-up URL, `npm`, `brew`, download),
  pricing words, requirements, licence, links. Remove tabs that don't apply.
- Delete every `<span class="sf-note">`, set the page `<title>` and meta description.

## 6. Record and post

1. Open `index.html?record&ratio=16:9` in a browser window large enough for a crisp stage (1920 × 1080 or
   larger on a Retina screen).
2. Record it with **Monet Shot**: pick the browser window, crop to the stage, park the real pointer off the
   window (the film draws its own cursor). It holds the title for 1.2 s, plays once, stops on the closing
   frame. The film's camera does the push-ins; for Monet Shot's own zooms use `&camera=off`.
3. Export H.264 MP4 and post to X. 16:9 shows both panes side by side and suits desktop; record **1:1**
   separately for the phone feed and **9:16** for vertical places (the panes stack). Captions are burned in
   because X autoplays muted.


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
