# AGENT.md: make this product's chat page

You are a coding agent in the repository of a product that lives inside a conversation: a bot, an assistant, a
support agent, a chat-first app. The team picked this format. There is no hero, no band and no app window: **the page
is the conversation.** It opens on the top of a thread and the first message arrives on its own. Each next message
comes as the visitor scrolls (or by itself), the product appears inline as rich cards the person taps, and the last
message is the call to action. Opened with `?record&ratio=9:16`, the same page reads as a phone screen recording,
ready to post on X.

It only works if the conversation is **real**: words the product actually says, tools it actually calls, cards
it actually renders. An invented reply is a claim about what the product can do, so don't write one.

Read `tour/README.md` once for the engine and `_chat/README.md` for the chat kit. Then work through this in order.

## 0. Where things are

```
index.html        the page: one <section class="demo-chat">. The window holds the header, the thread and the composer.
chat/section.html the same markup as it came; edit index.html
chat/script.js    sizes, chapters, the taps inside cards ("after"), the camera
chat/section.css  the stage: the column, the margins (chapter index, the one control)
chat/section.js   the beat driver: plays message by message; a scroll brings the next one
_chat/            the chat kit: chat.css (the look, its tokens) and chat.js (the thread → the steps)
tour/             the engine (tour.js, tour.css), snapshot.py, README.md. Don't edit.
kit/              the placeholder kit
```

(In the StyleFeatures repo, `python3 templates/scaffolds/sections/demo/tour/export.py <dest> --format chat` makes this
layout.) Serve the folder with any static server, e.g. `python3 -m http.server 8000`.

## 1. Learn the product (15 minutes, before writing anything)

- **Name and voice.** The product's exact name (and which word deserves the italic), how it introduces itself
  (its real greeting or system prompt's self-description), its avatar or mark, its status line.
- **What it does in a conversation.** List its tools/actions (function definitions, an MCP server, intents, slash
  commands) and the **card components** it renders in messages: confirmations, pickers, charts, forms, files,
  galleries, buttons. Find them in the code (`components/messages/*`, `cards/*`, block kits, adaptive cards,
  Storybook stories).
- **The way in.** The real install or sign-up path for the closing card: an "add to workspace" link, an app
  store page, a web app URL, pricing words, what it works with. Never invent a claim, a number or a customer.

## 2. Harvest a real conversation

Pick **3–4 exchanges** that show the core loop, one idea each (they become the chapters). Find them, in this order:

1. **Fixtures and tests**: recorded conversations, `__fixtures__`, eval sets, e2e tests that replay a chat, seed
   data for a demo workspace, Storybook stories of a message list. These are reviewed and safe to publish.
2. **Onboarding and docs**: the suggested prompts in the empty state, quick replies, examples in the README or docs.
3. **A live run against a demo account**: start the dev server with seed data, have the conversation for real, and
   copy the transcript from the API response or the logs, including each tool call's name, arguments and result.

Use the words verbatim (trim, don't rewrite). Never use a real customer's conversation or data.

## 3. Put it in the thread

The thread in `index.html` is the script: each `.ck-row` is one message, in order (`_chat/README.md` has the
grammar). For each message:

- **the person**: `<div class="ck-row" data-from="person">` with the text in `.ck-bubble`. It is typed into the
  composer and sent. If the person taps a quick reply instead, give the row `data-via="@that-chip"`.
- **the agent's words**: `<div class="ck-row">` with the text in `.ck-text[data-stream]` (keep their markdown
  rendering: lists, bold, code). It streams in word by word after the typing dots.
- **a tool call**: `data-kind="tool"` with the real server/tool name, the real arguments in `.ck-args`, the real
  result (trimmed) in `.ck-out`, and `data-done` set to what the product shows when it finishes.
- **a card**: the product's real component, inside the row (`.ck-card[data-ck-in]` is the placeholder frame).

Delete the placeholder rows you don't use. Keep the `.ck-start` block (the first frame) and fill it in.

## 4. Use their real cards

The cards are what sell the product; they must be the product's own.

**Web-rendered cards: harvest them** with `tour/snapshot.py`, one fragment per state, from Storybook or the dev server:

```sh
uv run tour/snapshot.py "http://localhost:6006/iframe.html?id=cards-booking--default" --selector "#storybook-root > *" \
    --size 460x400 --out chat/fragments/booking.html --scope booking \
    --hook "button:nth-of-type(2)=slot-2" --hook "button.primary=book"
uv run tour/snapshot.py "http://localhost:6006/iframe.html?id=cards-booking--booked" --selector "#storybook-root > *" \
    --size 460x400 --out chat/fragments/booked.html --scope booked
```

- `--size` is the card's width in the thread (about 460 design px; 340 on phones), height generous.
- `--hook "css=name"` marks what the script taps, so `script.js` can say `click('@slot-2')`.
- Put two states in a `[data-ck-swap]` (first the picker, then the result) and load each with
  `<div data-tour-include="chat/fragments/booking.html"></div>`; `section.js` fetches them before measuring. In
  `script.js`, `after: { rowName: [click('@slot-2'), set('@slot-2', { class: '+is-on' }), click('@book'),
  tween('@booking-swap', '--swap', 0, 1)] }` taps through them.
- Don't hand-edit fragments; re-capture. Small changes (a picked state) are `set()` on a hook.

**Native or server-rendered cards** (Slack blocks, Teams adaptive cards, SwiftUI): rebuild them in HTML/CSS with
their exact tokens and copy, next to a screenshot of the real one until they match. Images inside cards are the
product's own sample content or kit placeholders (`.ph`), never a real person's photos.

## 5. Make it look like theirs

Set the chat kit's tokens on `.ck-app` in `chat/section.css` (`--ck-bg`, `--ck-card`, `--ck-me` for the person's
bubble, `--ck-line`, `--ck-accent`, `--ck-radius`) and the fonts to theirs. Put their mark in `[data-ck-avatar]`
and `.ck-av-l`. Keep the calm: one accent, hairlines, no gradients. Don't copy any other product's chat look.

## 6. The script and the pacing (`chat/script.js`)

- **35–50 seconds.** 3–4 chapters, one exchange each; `chapters` names the row each starts at (`'02 / 04'`, a title
  with one `<em>` word). They become the clickable index in the margin and the story in a 16:9 recording.
- Pacing lives on the rows: `data-think` (typing dots, .6–1.2 s), `data-read` (held after it), `data-run` (a tool
  call), `data-cps` (typing speed). Every tap must change something visible; one push-in per chapter at most
  (`zoom('@card', 'fit', { fill: [.8, .9] })`, then `unzoom()`).
- **The ending is the last message**: the `.ck-cta` card with the product's name, one honest line, the real
  primary link (`href`) and a second one, and the domain. It holds for `outro` seconds.

## 7. Check it

- `index.html?t=12.5` freezes any moment. Check right after each tap, mid-stream, and the last frame.
- `?record&ratio=9:16&t=…` (a phone: status bar, a fingertip), `?record&ratio=1:1&t=…`, `?record&ratio=16:9&t=…`.
  Text must be readable in 1:1; nothing cut except by the column's edges.
- Play it from the top: the first message arrives by itself; scroll brings the next; scroll up reads back; the
  control pauses (then each scroll plays one message). On a phone, tap and swipe. With reduced motion, the whole
  transcript shows still, from the top.
- Delete every `.sf-note`, set the page `<title>` and meta description.

## 8. Record and post

Open `index.html?record&ratio=9:16` in a tall browser window and record it with **Monet Shot** (crop to the stage,
park the real pointer off it; the page draws its own finger). It holds the first frame 1.2 s, plays once and holds
on the closing card. Post the export to X with one line and the link. Use `ratio=16:9` for a desktop-first audience
(the chapter index shows beside the column) and `1:1` for the feed.
