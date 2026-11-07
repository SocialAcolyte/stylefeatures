# AGENT.md: make this researcher's site, typeset like a paper, and its film

You are a coding agent working for one person: a researcher, a PhD student, a professor, a scientist or a clinician.
They picked this format: their site **set like the first page of a paper**. Their name is the title (with an asterisk
that points to the correspondence footnote), their bio is the **Abstract**, their fields are the **Keywords**, and the
first numbered section is **1 Selected papers**. Every reference on that page opens where it is: *Fig. 1* enlarges
in place with its caption, *[1]* lights the paper it cites, **Cite** opens the BibTeX and copies it, **PDF** opens a
preview of the paper at its abstract with one sentence highlighted. At the top of the page the title page reads itself
once as a short film (a cursor follows each kind of reference in turn), then every reference is the visitor's. Below,
the paper goes on: **2 Publications** by year, **3 Talks**, **4 Teaching**, **5 Students and collaborators**, **6
Curriculum vitae**, with sidenotes in the margin and a running head that names the section being read. It ends on the
paper's final footnote, **\* Correspondence**: their email, office and office hours. The same page opened with
`?record&ratio=16:9` is the stage they record for X, Bluesky or LinkedIn.

The page only works if everything on it is **theirs** and **exact**. A publication list is checked by every colleague
who reads it. **Never invent a paper, an author, a venue, a year, a DOI, a citation count, an award, a grant, a student,
a quote or a credential.** Author lists are copied in the order printed, never shortened into "et al." unless the
paper's own citation does it. If something is missing, leave the placeholder and ask.

Read `tour/README.md` once for the engine's vocabulary (the parts that matter here: *A frame the format draws*,
`data-tour-grow`, *A second design size*, `zoom`, `drag` with `onto`, `mark`). Then work through this in order.

## 0. Where things are

```
index.html            the page. Its markup is yours to edit: the title page (<section class="demo-scholar">: the
                      .sc-page inside the stage, the PDF preview .sc-pdf beside it), then the rest of the paper (.sc-doc)
kit/                  placeholder kit: tokens, .ph frames, buttons, notes (press N to hide notes)
scholar/section.css   the title page in four layouts, the figure, the BibTeX folds, the PDF preview, the paper below,
                      the ending. Typography: Newsreader, small caps (.sc-sc), old-style figures (fonts/, see below)
scholar/script.js     the film: which reference is followed, where the camera looks. film('wide' | 'square' | 'tall' |
                      'narrow')
scholar/section.js    picks the layout, reads the title page once, then hands every reference to the visitor (figure,
                      citation, Cite + Copy, PDF preview, sidenotes, the asterisk); the running head
scholar/fonts/        "Scholar Figures": old-style digits for Newsreader (which has none). Keep it; see fonts/README.txt
scholar/section.html  the markup as it came (index.html has a filled-in copy; edit index.html)
tour/                 the engine (tour.js, tour.css), snapshot.py, README.md; don't edit
```

(In the StyleFeatures repo, `python3 templates/scaffolds/sections/demo/tour/export.py <dest> --format scholar` makes
this layout.) Serve the folder with any static server, e.g. `python3 -m http.server 8000`.

## 1. Gather their things (before writing anything)

Ask the person for what you can't find, and confirm anything you found before it goes public. Look in this order:

- **Their CV** (PDF or LaTeX source). It is the source of truth for positions, degrees, grants, teaching and students.
  (`pdftotext -layout cv.pdf -`; a LaTeX CV often keeps its publications in a `.bib` file: ask for it.)
- **Their publication record, as BibTeX.** In order of preference: the `.bib` they already maintain; their **ORCID**
  record (`https://pub.orcid.org/v3.0/<ORCID-iD>/works`, `Accept: application/json`, then each DOI's BibTeX from
  `https://doi.org/<doi>` with `Accept: application/x-bibtex`); **DBLP** for computer science
  (`https://dblp.org/pid/<pid>.bib`); **arXiv** for preprints (`https://arxiv.org/bibtex/<id>`); a Google Scholar
  "Export all → BibTeX" the person runs themselves (don't scrape Scholar); their university repository. Merge, dedupe
  by DOI, and keep each entry's fields as published.
- **Their papers' PDFs.** The ones linked from the page (open-access copies, the arXiv version, the accepted
  manuscript their publisher allows them to post: ask which they may host). From the paper chosen for [1]: its first
  page (title, authors, affiliations, abstract, exactly), and **the one sentence they would most want read**; ask them
  to choose it.
- **Their best figure.** The figure they'd put on a slide to explain their work, as published (vector PDF → SVG with
  `pdftocairo -svg`, or a 2× PNG; `pdfimages -png paper.pdf fig` pulls embedded rasters). Its caption, shortened to one
  sentence if they agree. Check the licence or ask: their own figure from an open-access paper is usually fine.
- **Their university page and lab page**: position title exactly as the institution writes it, department, the
  address, the photo they use (this format doesn't need one), the group's members.
- **Talks**: title, event, city, month and year, and links to slides or recordings that are public.
- **Teaching**: course codes and titles, level, terms, syllabus links.
- **Students and collaborators**: current students with topic and start year, former students and where they are
  now (only what is public or what the person confirms), the colleagues they write with most.
- **Correspondence**: the email they want strangers to use, the office (room, building, street), office hours **only if
  they hold public ones**, ORCID iD, and two or three profile links (ORCID, DBLP / PubMed / SSRN / Semantic Scholar /
  arXiv author page, their code).
- **Their look.** If their lab site has a colour, use it as `--sc-accent` (section numbers, reference marks, the
  asterisk). Otherwise keep the rubric red; it is what old books used for exactly this.

## 2. Typeset the title page

The title page is `.sc-page` in `index.html`, built at 1600 × 900 design px (the engine scales it). It must **fit one
screen**: open `index.html?t=0` and check the footnote and the folio at the bottom are in view. If not, shorten the
abstract before shrinking anything.

- **Running head** `.sc-rh`: their name in small caps, the section links (numbered like the sections below).
- **Kind line** `.sc-kind`: what this is ("Research", "Lab of …", "Clinical research") and the date it was updated.
- **Title** `.sc-title`: their name exactly as they publish under it, then the asterisk `.sc-star`.
- **Subtitle** `.sc-sub`: the question their work keeps asking, in one line, in their words.
- **Affiliation** `.sc-aff`: position, department, institution, as the institution writes them. Footnote 1 (`.sc-sn-1`,
  in the margin) is the right place for "Before this: PhD, Institution, year; postdoc, Institution, year".
- **Ids** `.sc-ids`: ORCID iD (it is set in old-style figures), the CV link, the link to all publications.
- **Abstract** `.sc-abs`: their bio, 70–110 words, first person, plain words, as they'd say it to a colleague from
  another field. It must keep its three references: `(Fig. 1)` (`@ref-fig`), `[1]` (`@ref-1`) and the footnote mark
  `²` (`@ref-sn2`, whose note `.sc-sn-2` names their lab or group). Write the sentences around them, not the other
  way round.
- **Keywords** `.sc-kw`: four of their fields or methods, the words their community searches for.
- **Fig. 1** `.sc-fig`: replace the `<div class="ph">` in `.sc-fig-box` with `<img src="assets/fig1.svg" alt="…">`
  (3:2 box; for another ratio change `--r` and check the film's push-in). The caption: `Fig. 1.` and one sentence,
  then `From [1].`
- **1 Selected papers** `.sc-sel`: three papers (two show on 1:1 and 9:16), [1] being the one the film cites. Each:
  title, authors in printed order with **their name in `<b>`**, venue in italic, year in `.sc-num`, then Cite / PDF /
  Code (only links that exist; delete the rest). Each **Cite** fold holds that paper's real BibTeX in `<pre
  class="sc-tex">`, with the entry type in `<b>`, the key in `<i>` and field names in `<u>` (that's only colouring).
- **Footnote** `.sc-foot`: `* Correspondence:` email and office. The folio `1`.

**Typography rules.** Numbers in running text and lists go in `<span class="sc-num">` only where the surrounding font
is the sans; anything set in the serif gets old-style figures automatically. Acronyms in running text go in
`<span class="sc-sc">` (small caps) if they would otherwise shout. En dashes for ranges (`2021–2024`), real
apostrophes and quotes (’ “ ”), a thin space before units if their field does that.

## 3. The PDF preview

`.sc-pdf` is the reader that **PDF** opens (for [1]; other papers' PDF links simply open the file). Rebuild its page
as text, so it stays crisp at any zoom: the venue and year in the head, the title, the authors (their name in `<b>`),
the affiliations, **the abstract word for word**, and the chosen sentence inside `<span class="sc-hl">` with its two
markers `@hl-a` at the start and `@hl-b` at the end (the film's cursor drags from one to the other and the highlight
follows). Keep the sentence on **one line** of the preview if you can (it may start a new paragraph): the sweep then
reads like a real highlighter. Put the paper's PDF file name in `.sc-pdf-name`, its page count in `.sc-pdf-pg`, and
link **Open the PDF** to the real file. The body skeleton below the abstract can stay, or take a crop of the real
first page (`pdftoppm -png -r 144 -f 1 -l 1 paper.pdf page`) as an image under the abstract.

## 4. The rest of the paper

`.sc-doc` is real, accessible HTML. Fill it from what you gathered; renumber `[n]` so every paper keeps one number on
the whole page (the selected ones keep theirs).

- **2 Publications**: grouped by year (`.sc-year` with `.sc-y`), newest first, "Earlier" for the tail if it is long.
  Same entry format as the title page. A **Cite** button and its `.sc-bib` fold on any entry you like. Mark student
  first authors with `.sc-tag` only if they want that.
- **3 Talks**, **4 Teaching**: one row each (`.sc-list`); links only to public slides, recordings and syllabi.
- **5 Students and collaborators**: three columns; names exactly as the people write them.
- **6 Curriculum vitae**: link the CV PDF (`.sc-cv-sheet` and the button), with "updated Month Year".
- **Acknowledgements**: grants and funders named exactly as the CV names them (with grant numbers if they list them),
  or delete the paragraph.
- **Sidenotes**: a mark `<a class="sc-fn" href="#sn-N" data-sn="N">N</a>` followed straight away by
  `<span class="sc-sn" id="sn-N" data-sn="N"><i>N</i>…</span>` inside the same paragraph. On wide screens the note
  floats into the margin beside the line that calls it; under 1100 px it opens under the paragraph when the mark is
  tapped. Use them for asides a reader would want: where else the list lives, an award, a correction, what prospective
  students should send. Keep them short (under 35 words).
- **The ending** `.sc-corr`: the final footnote. Email set large (their public one), office with address, office hours
  (or delete that column), elsewhere (ORCID, their field's index, code). The colophon line: domain, the typefaces,
  updated date.

## 5. The script (`scholar/script.js`)

Four chapters, one kind of reference each: *Read the abstract* (the figure), *Follow a citation* (the BibTeX, copied),
*Open the paper* (the highlighted sentence), *Correspondence* (the asterisk). About 35 s on the wide page and 17 s on a
phone. Adjust it to them rather than rewriting it:

- Chapter titles and captions are theirs to word: a few words, one `<em>` per title, one short sentence per action.
- If [1]'s first author isn't them, that's fine; if the paper they want cited is [2], move the `data-tour="pub-1"`,
  `cite-1`, `copy-1`, `bib-1` and `pdf-1` hooks to it (and `href="#pub-2"` on the citation in the abstract).
- `mark('poster')` (the BibTeX open and copied) is the frame for a thumbnail; `mark('figure')` the figure open;
  `mark('still')` the highlighted sentence.
- One push-in per chapter, then `back()` / `unzoom()`. Every click must visibly change something.

## 6. Check it

- `index.html?t=4.5` freezes any moment. Check the middle of each chapter and just after each click: the cursor sits on
  what it clicks, the figure grows from its place in the margin (never from the middle of the screen), the BibTeX opens
  under its entry, the highlight starts at the sentence's first letter and ends at its last.
- `?record&ratio=16:9&t=…`, `?record&ratio=1:1&t=…`, `?record&ratio=9:16&t=…`. Also the page at 1440 × 900 and on a
  390-wide phone: no sideways scroll, nothing cut, the title page fits its stage, every reference works with a click and
  with the keyboard, Escape closes the figure and the preview, Copy puts the BibTeX on the clipboard (paste it into a
  `.bib` and run `biber --tool` or `bibtool` over it once: it must parse).
- Every DOI resolves, every PDF link opens, every author list matches the published paper. Nothing left that is a
  placeholder you meant to replace, a number they didn't confirm, or a student listed without their agreement.

## 7. Hand it over: record and post

End by giving the person this, with the link filled in:

1. Open **`index.html?record&ratio=16:9`** (served, e.g. `http://localhost:8000/?record&ratio=16:9`) in a large browser
   window: 1920 × 1080 or bigger on a Retina display.
2. Record it with **Monet Shot**: choose the browser window, crop to the stage, park the real pointer off the window
   (the film draws its own cursor). It holds on the first frame (the whole title page) for 1.2 s, plays once and stops
   on the closing frame (the correspondence footnote). Monet Shot adds no zooms of its own, because the clicks aren't
   real; if you'd rather place zooms on its timeline, open `?record&ratio=16:9&camera=off` so you don't get both.
3. Export H.264 MP4 and post it to X, Bluesky or LinkedIn with one line and the link (a new paper is a good moment).
   **16:9** reads best on desktop and in quote posts; `ratio=1:1` takes more of a phone feed; `ratio=9:16` is for
   stories. Record each ratio separately; the title page lays itself out again for each, so never crop one into another.
4. X takes MP4 (H.264, AAC) up to 2 min 20 s and 512 MB. The captions are burned in, because X autoplays muted.


## The painting it sits on

Opened on its own, the page sits on *Beech Grove I* by Gustav Klimt (public domain), the way Monet Shot frames a take: the site is a
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
