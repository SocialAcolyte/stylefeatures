# AGENT.md: make this person's one-page CV that opens, and its film

You are a coding agent working for one person: a graduate, a young professional, someone looking for work or changing
careers. They picked this format: their CV as **one A4 sheet** set on the page, typeset like a good CV (name, one line,
then roles, projects, education and skills, each a single line with its dates). **Every line is a hinge.** Click one and
a fold opens under it, the lines below sliding down: inside, a small window of the work they did there plays, with one
sentence of what changed. At the top of the page the sheet plays itself once as a short film (a cursor opens the current
role, the role before, a project, then downloads the PDF), and then every line is the visitor's to open. The page ends
on the exact one-pager as a PDF, and their address. The same page opened with `?record&ratio=16:9` is the stage they
record for X and LinkedIn.

The page only works if everything on it is **theirs**: their roles and dates exactly as on their CV, their own work in
the folds, their own words. You are typesetting what already exists, not writing a persona. **Never invent a link, an
employer, a client, a title, a date, a number, a quote, a grade or a credential.** If something is missing, leave the
placeholder and ask. A CV is checked by the people it's sent to; one invented line costs them the job.

Read `tour/README.md` once for the engine's vocabulary (the parts that matter here: *A frame the format draws*,
`data-tour-grow`, *A second design size*, `zoom`, `mark`). Then work through this in order.

## 0. Where things are

```
index.html          the page. Its markup is yours to edit: the desk and the sheet (<section class="demo-cv">: the sheet,
                    the margin beside it, the film's control), then the ending (.cv-end: the one-pager, the address)
kit/                placeholder kit: tokens, .ph frames, buttons, notes (press N to hide notes)
cv/section.css      the desk in its four layouts, the sheet, the folds, the evidence windows, the ending, and the
                    print stylesheet that makes the one-pager (@media print at the bottom)
cv/script.js        the film: which lines open, what plays in them, where the camera looks. film('wide' | 'square' |
                    'tall' | 'narrow')
cv/section.js       picks the layout, plays the film once, then hands the sheet to the visitor (one line open at a
                    time); makes the ending's proof (a copy of the sheet as it prints); Download the PDF
cv/section.html     the markup as it came (index.html has a filled-in copy; edit index.html)
tour/               the engine (tour.js, tour.css), snapshot.py, README.md; don't edit
```

(In the StyleFeatures repo, `python3 templates/scaffolds/sections/demo/tour/export.py <dest> --format cv` makes this
layout.) Serve the folder with any static server, e.g. `python3 -m http.server 8000`.

## 1. Gather their things (before writing anything)

Ask the person for what you can't find, and confirm anything you found before it goes public. Look in this order:

- **Their CV.** The PDF or DOCX they send out now is the source of truth: titles, organisations, dates, degrees, in
  their order and their spelling. (DOCX: `unzip -p cv.docx word/document.xml`, or `pandoc cv.docx -t plain`. PDF:
  `pdftotext -layout cv.pdf -`.) If there are several versions, ask which one is current.
- **Their LinkedIn data export** (Settings → Data privacy → Get a copy of your data): `Positions.csv`, `Education.csv`,
  `Projects.csv`, `Skills.csv`, `Languages.csv`, `Profile.csv` (headline, summary). Use it to cross-check dates and
  to find what the CV left out; never scrape their profile page.
- **GitHub, if they code.** Pinned repositories, their profile README, each project's README, its live demo URL and
  screenshots in the repo. A project line's fold wants the project's own page or app.
- **Their work.** For each role and project: a public URL of the thing they made (a product, a site, a report, a
  case study, a talk recording, a paper), or screenshots they are allowed to show. **Ask before showing anything from
  an employer**: many contracts forbid it, and a public page or a published case study is the safe choice. If there
  is nothing showable for a line, keep a calm placeholder there and say so.
- **Contact.** The email they want recruiters to use, their city (and "open to remote" if they say so), their site,
  and two or three links (where their code lives, their professional profile, a portfolio). A phone number only if they
  ask for one.
- **Their look.** If they have a site, take its fonts and its one colour (`--cv-accent` in `cv/section.css`, used for the
  hinge marks, the open line and links). Otherwise keep the kit's warm paper; it suits almost anyone.

## 2. Typeset the sheet

The sheet is `.cv-sheet` in `index.html`: one A4 page, 600 × 848 design px. Keep it **one page**; that is the format's
promise. If their CV has more, choose with them: the last 10 years, the roles that matter for what they want next.

- **Head:** the name exactly as they write it (one word in `<em>` if it suits), the one line (`.cv-one`: what they do and
  for whom, in their words, under 80 characters), and the contact line.
- **Lines:** one `<li class="cv-line">` per role, project, degree or skill. A line is a title (`<b>`), where (`.cv-org`,
  set in italic), and the dates (`.cv-when`). Dates in one style throughout: `2021 – 2024`, `2024 – now`, or a single
  year; en dashes with spaces; months only if the whole sheet has them. Titles short enough to stay on one line (the
  title ellipsizes before it wraps).
- **Sections:** rename, drop or add (`.cv-sec` with an `h2.cv-label`): a graduate may lead with Education, a career
  changer with Projects. Keep each line's hooks (`data-tour="line-N"`, `"row-N"`) unique and numbered.
- **Footer:** domain, "Updated <month year>", `1 / 1`.

Check the fit: open `index.html?t=0` and look at the sheet's bottom, then print it (step 6). If it runs long, tighten
rows (`.cv-row` height, `.cv-sec` margin) before you cut content, and cut before you shrink the type.

## 3. Fill the folds: one window of real work per line

Each line's fold is `.cv-fold > .cv-fold-in`: a window of the work on the left, one sentence and a small meta line on
the right. Build each window as a small static screen at its design size (280 × 175 px, 16:10), the way the engine's
harvest works (`tour/README.md`, *Harvested screens*):

- **A web product or site they built:** capture its real screen with `uv run tour/snapshot.py <url> --selector main
  --size 1120x700 --out cv/fragments/role-1.html --scope role-1` and scale the fragment into the window
  (`transform: scale(.25)` on a 1120 × 700 box), or put a crisp screenshot in as `<img>` (`object-fit: cover`). Keep
  the `.cv-bar` above it with the real address in `.cv-url`.
- **The three windows that play in the film** are kept small and generic so you can rebuild them as theirs:
  1. `ev1` (current role): a product screen where the cursor clicks one control and something changes (`@ev1-go`,
     `--done` on `@ev1-row`, a toast). Rebuild it from their product: the real button label and the real state
     change.
  2. `ev2` (the role before): **before and after**, the same screen the way it was and the way they left it, crossfaded
     by `--ba` when the cursor clicks After. Use two real captures (an old version from the Wayback Machine, a
     redesign's before shot, a report before and after their work).
  3. `ev3` (a project): its own page, scrolled by the film (`@ev3-page`). Put the project's real landing page inside.
  Keep their `data-tour` hooks so the script still points at them.
- **Not a screen?** A designer's case study image, a researcher's figure, a writer's published page, a teacher's
  lesson plan, a talk's title slide: a `<figure class="ph">` replaced by an `<img>` works in any fold.
- **The sentence** (`.cv-said`): one line of what changed because they were there, in their voice, past tense, plain
  words ("Rebuilt checkout; it's the one people use today."). A number only if it is real, theirs to share and they
  confirm it. No adjectives about themselves ("passionate", "results-driven").
- **Meta** (`.cv-meta`): their part in it, the team, how long; a link (`.cv-link`) only to something public.

Skills lines open too: show proof (three small images of things made with that skill) and point back to the line
where they used it. Delete folds you can't fill honestly rather than leaving placeholders in a sent CV; a line without
a fold is still a fine line (remove its `role`, `tabindex` and the `.cv-hinge`).

## 4. The script (`cv/script.js`)

It already tells the story in four chapters (*the current role*, *what I changed*, *on my own time*, *take it with
you*), about 35 s on a desk and 18 s on a phone. Adjust it to them rather than rewriting it:

- Chapter titles and captions are theirs to word: a few words, one `<em>` per title, one short sentence per action.
- Change which lines open (`'@row-5'`, `open(5)`, `push('@line-5')`) if another line has better evidence; the strongest
  work goes first. Close each fold before the next opens (`shut(n)` with `open(m)`), so the sheet stays one page.
- `mark('poster')` is the frame for a thumbnail (a line open, the whole sheet in view); `mark('still')` is what reduced
  motion would show.
- One push-in per chapter (`push('@line-N')`), then `back()`. Every click must visibly change something.

## 5. The margin and the ending

- The margin (`.cv-margin`): the eyebrow, the hint ("Every line opens."), the PDF button. Word the hint for them.
- The ending (`.cv-end`): the one-pager's line and button, then their email set large and two or three links. The proof
  on the left is made from the sheet itself, so it is always the same as what prints.
- The record closing frame (`.cv-end-frame`): their email and domain.
- Delete every `<span class="sf-note">`, set the page `<title>` ("Name: CV") and the meta description (their one line),
  and an `og:image` (a screenshot of `?t=0&clean` works).

## 6. The PDF: the exact one-pager

The print stylesheet prints only the sheet (a closed copy, A4, full bleed). Make the file once the sheet is final, from
the served page:

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --no-pdf-header-footer \
  --virtual-time-budget=6000 --print-to-pdf=cv.pdf http://localhost:8000/
```

(On Linux the binary is `google-chrome` or `chromium`.) Open `cv.pdf` and check it is **one page**, the type is crisp and
nothing is cut. Then point both PDF buttons at it: `href="cv.pdf"` on `.cv-pdf-btn` and `.cv-print` (section.js adds
`download`). Name the file after them when you link it (`Firstname-Lastname-CV.pdf`) and use the same name in
`.cv-file b`. For US Letter, change `@page{size:A4}` to `size:letter` and the sheet's `zoom` under it to `1.245`, then print
again (the sheet keeps its shape and sits centred with a little paper either side). Regenerate the PDF whenever the sheet
changes; until there is one, the buttons print the page instead.

## 7. Check it

- `index.html?t=5.5` freezes any moment. Check the middle of each chapter and just after each click: the cursor sits on
  what it clicks, the fold opens from its line like paper, the lines below slide down, the push-in shows the whole fold.
- `?record&ratio=16:9&t=…`, `?record&ratio=1:1&t=…`, `?record&ratio=9:16&t=…`. Also the page at 1440 × 900 and on a
  390-wide phone (the sheet reflows into one column there): no sideways scroll, nothing cut, every line opens and
  closes with a click and with Enter.
- The PDF is one page. Nothing left that is lorem, a placeholder you meant to replace, an employer's confidential
  screen, or a number they didn't confirm. With reduced motion the page shows the sheet with the first line open.

## 8. Hand it over: record and post

End by giving the person this, with the link filled in:

1. Open **`index.html?record&ratio=16:9`** (served, e.g. `http://localhost:8000/?record&ratio=16:9`) in a large browser
   window: 1920 × 1080 or bigger on a Retina display.
2. Record it with **Monet Shot**: choose the browser window, crop to the stage, park the real pointer off the window
   (the film draws its own cursor). It holds on the first frame (the whole sheet) for 1.2 s, plays once and stops on the
   closing frame. Monet Shot adds no zooms of its own, because the clicks aren't real; if you'd rather place zooms on its
   timeline, open `?record&ratio=16:9&camera=off` so you don't get both.
3. Export H.264 MP4 and post it to X or LinkedIn with one line and the link. **16:9** reads best on desktop and in quote
   posts; `ratio=1:1` takes more of a phone feed; `ratio=9:16` is for stories. Record each ratio separately; the desk
   lays itself out again for each, so never crop one into another.
4. X takes MP4 (H.264, AAC) up to 2 min 20 s and 512 MB. The captions are burned in, because X autoplays muted.


## The painting it sits on

Opened on its own, the page sits on *Almond Blossom* by Vincent van Gogh (public domain), the way Monet Shot frames a take: the site is a
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
