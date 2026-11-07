# AGENT.md: make this person's changelog site and its film

You are a coding agent working for one person who ships things (a developer, an indie hacker, an engineer, a
designer who codes). They picked this format: their site is **their release notes**. It opens on **Now** (what they're
doing this month, dated), then their life as a changelog read top to bottom, newest first: a release per year (`v5 ·
2026`), each entry tagged **Shipped / Joined / Moved / Learned / Wrote**. Shipped entries carry a small film of the
thing working (the CLI's first run, the library's page, the app) that plays as it reaches the middle of the screen. A
rail of contribution strips (one row per release, one cell per week, the entries marked on it) follows the scroll. It
ends on **Unreleased**: a cursor drafts the next entry ("Working with you on …"), releases it, and their address
appears. The same page opened with `?record` reads itself top to bottom: the film they post.

The page only works if everything on it is **theirs and true**: their real projects, their real dates, their real
words. You are assembling a record, not writing a persona. Never invent a project, an employer, a client, a date, a
number (stars, downloads, users), a quote or a credential. If something is missing, leave the placeholder and ask.

Read `tour/README.md` once for the engine's vocabulary (the parts that matter here: `type`, `stream`, `click`, `zoom`,
`data-tour-frame`, *A third for squarish stages*, the `manual` driver, `recordStage`). Then work through this in order.

## 0. Where things are

```
index.html               the page. Its markup is yours to edit: the top line, the log (<section class="cl-log">: the
                         rail, Now, the releases, Unreleased), the footer
kit/                     placeholder kit: tokens, .ph frames, buttons, notes (press N to hide notes)
changelog/section.css    the page in its three layouts (.is-wide / .is-mid / .is-narrow), the films' products
                         (.clt terminal, .clr project page, .cla app, .cln the Unreleased entry)
changelog/script.js      the films, one per data-film="…", and NEXT_LINE (the line the cursor drafts)
changelog/section.js     builds the rail, plays each film as it reaches the middle, and the ?record reading
changelog/section.html   the markup as it came (index.html has a filled-in copy; edit index.html)
tour/                    the engine (tour.js, tour.css), snapshot.py, README.md; don't edit
```

(In the StyleFeatures repo, `python3 templates/scaffolds/sections/demo/tour/export.py <dest> --format changelog`
makes this layout.) Serve the folder with any static server, e.g. `python3 -m http.server 8000`.

## 1. Gather their things (before writing anything)

Ask the person for what you can't find, and confirm anything you found before it goes public. Look in this order:

- **GitHub** (`gh api users/<them>`, `gh repo list <them> --source --limit 100`, `gh release list -R <repo>`): their
  pinned repos, the ones with real releases, each repo's README first line, its install command, its first release
  date and its `v1.0.0` (or first stable) release notes. Pinned + released + described is a good filter for Shipped.
- **Package registries**: npm (`npm view <pkg> time --json` gives the first publish date), PyPI, crates.io, Homebrew,
  the App Store / Play Store page, a Chrome Web Store page. These give honest Shipped dates.
- **Their CV or LinkedIn export** (`Positions.csv`, `Education.csv`): Joined, Moved and Learned entries with month and
  year. Use the role and team as they write them.
- **Their writing**: blog RSS/Atom feed, Substack, dev.to, a `posts/` folder; talk recordings (YouTube/Vimeo) and the
  event page. These are Wrote entries: title as published, where, the month.
- **A /now page** if they have one; otherwise ask them the four Now lines directly (Building, Learning, Reading, Based
  in). Now is present tense and true **this month**.
- **Their contribution history**, if they want the strips filled: `gh api graphql` with
  `contributionsCollection(from:, to:) { contributionCalendar { weeks { contributionDays { contributionCount } } } }`
  per year, or `git log --author=<them> --date=short --format=%ad` across their repos. Turn each year into 52 weekly
  levels 0–4 (quartiles of that person's own weeks, never compared with anyone else). If they'd rather not show it,
  leave the strips empty: the entries are still marked on them.
- **Their look.** If they have a site, take its fonts and its one accent colour (`--cl-accent` and `--cl-accent-soft`
  on `.demo-changelog`). Otherwise keep the kit's warm paper, near-black ink and the quiet green.

Then ask them: which years get a release (skip quiet ones: a gap in a log is honest), how they number versions (the
default is one major per release, `v0.1` for where it starts; years-as-versions `v2026` also works), which three
Shipped entries get a film, and the one line they want the Unreleased entry to say.

## 2. Fill Now and the log

- **Top line** `.cl-top`: their name exactly as they write it, links to GitHub, the feed, and `#next`.
- **Now** `.cl-now`: the date (`Updated November 2026`, and `datetime="2026-11"`), one sentence in `.cl-now-line` (one
  `<em>` word at most), the four rows. Every time a line changes, the date changes.
- **Releases** `.cl-release`, newest first. Each has `id` (`v5`), `data-year`, `data-version`, optionally
  `data-weeks="0,1,0,3,…"` (52 levels), a `<h2>` with `.cl-v` and `.cl-y`, and one line for the year.
- **Entries** `.cl-entry` with `data-tag` (`shipped|joined|moved|learned|wrote`) and `data-date="2025-10"` (or
  `2025-10-14`): the rail places the entry on its week from this, so it must be the real date. Inside: the month in
  `.cl-date`, the tag word, an `<h3>` (the name, then `<span>` the one-line what), one sentence of what changed, and
  `.cl-meta` links (repo, release notes, post, recording). Real links only; delete a link rather than point it at `#`.
- A Shipped entry without a film gets a still: replace `.cl-still`'s `.ph` with `<img src="assets/…" alt="…">` (16:9).
- The last release (`.cl-release-first`) is where it starts: "Initial commit" is a good title if it's true.
- The footer, the `<title>` ("Name: changelog") and the meta description (their Now line).
- **The feed.** Generate `feed.xml` (Atom) from the entries (one `<entry>` per log entry, newest first, `updated` from
  `data-date`) so "Follow the log" is real. Regenerate it whenever the log changes.

## 3. Rebuild the three films (the Shipped entries' screens)

Each film is a `.cl-film` inside its entry: a window (`data-tour-window`) with `data-size="720x450"` for wide and
medium screens and `data-size-square="440x440"` for phones and 9:16 recordings (the film's stage is square there, so
the window's product re-lays itself under `.is-square`). Its script is `films.<data-film>` in `changelog/script.js`.

- **A CLI** (`data-film="cli"`, `data-chrome="terminal"`): the exact command from their README in `type('@cmd-1', …)`,
  then their tool's **real output**, line for line (run it in a scratch directory; `templates/scaffolds/sections/demo/terminal/ansi.py`
  in the StyleFeatures repo turns a captured run into HTML with colours). Keep it to what fits: one command, its output, one result.
- **A library or project page** (`data-film="repo"`, `data-chrome="browser"`): their project as **their own docs or
  project site** shows it (not a copy of a code host's UI): name, README first line, the real install line in
  `.clr-install` (the Copy click), and the real notes of their first stable release in `.clr-notes` (Added / Changed /
  Fixed, as they wrote them). `data-url` is the address people would see.
- **An app** (`data-film="app"`, `data-chrome="app"` or `browser` for a web app): harvest the real screen
  (`uv run tour/snapshot.py <url> --selector … --size 720x412 --out changelog/fragments/app.html --hook …`) or rebuild
  it from their view code in their tokens, then make the film do the one thing it's for: a new item, then its page.
  `ITEM` in `script.js` is that item's name, in the app's own vocabulary.
- Other shipped things fit the same slots: a site (`browser`), a phone app (`data-chrome="phone"` with
  `data-size="390x844"` and a matching stage aspect), a design system's docs page, a dataset's explorer.
- **Static HTML/CSS only, no app logic.** Their sample content or kit placeholders where user data would appear;
  never real people's data.
- **Pace**: 7–11 s each, every click visibly changes something, one push-in at most (`zoom('@x', 1.3)`) then
  `unzoom()`, and the last frame is the result. Set `still` to that result (shown with reduced motion).

## 4. The rail and the reading

You don't write the rail: `section.js` builds a row per release from the markup. Check it after filling the log: every
entry is a mark on its week (Shipped in the accent), the head moves to the entry at the reading line, clicking a mark
goes to its entry. On phones and tablets it's a bar across the top that shows the release being read.

## 5. Unreleased: the ending

- `NEXT_LINE` in `changelog/script.js` is the line the cursor drafts: what they want to do next, with the visitor, in
  their own words, one line ("Working with you on …"). `next_version` in `.cln-t1` is the version it becomes.
- `.cl-addr`: the email they want strangers to use, set large; GitHub; the feed; their domain.
- `.cln-sub` is the second line of the draft. Keep it short and true.

## 6. Check it

- The page at 1440 × 900 and on a 390-wide phone: each film plays once as it reaches the middle and shows "Play
  again" after; the rail follows; no sideways scroll; the Unreleased entry drafts and the address appears.
- `index.html?t=6` freezes every film at 6 s. With reduced motion every film shows its `still` and the address is in.
- `?record&ratio=16:9`, `ratio=1:1` and `ratio=9:16`, each with several `&t=` (`window.changelog.duration` is the
  length; `changelog.seek(30)` jumps there): the reading holds on Now, stops at each release, plays each film with
  its entry above it, and ends on Unreleased with the address in. Text must be readable in 1:1.
- Nothing left that is lorem, a placeholder you meant to replace, a link to `#`, a number you can't source, or contact
  details they didn't agree to publish. Delete every `<span class="sf-note">`.

## 7. Hand it over: record and post

End by giving the person this, with the link filled in:

1. Open **`index.html?record&ratio=16:9`** (served, e.g. `http://localhost:8000/?record&ratio=16:9`) in a browser
   window 1920 × 1080 if your screen allows, otherwise the largest 16:9 window you can make on a Retina display.
2. Record it with **Monet Shot**: choose the browser window, crop to the stage, park the real pointer off the window
   (the films draw their own cursor). It holds on Now for 1.2 s, reads the whole log once by itself and stops on the
   Unreleased entry with the address in. Monet Shot adds no zooms of its own, because the clicks aren't real clicks;
   if you'd rather place zooms on its timeline, open `?record&ratio=16:9&camera=off` so you don't get both.
3. Export H.264 MP4 and post it to X with one line and the link. **16:9** is for X and LinkedIn; `ratio=1:1` for the
   feed; `ratio=9:16` for stories and reels. Record each ratio separately; the page lays itself out again for each,
   so never crop one into another.
4. X takes MP4 (H.264, AAC) up to 2 min 20 s and 512 MB. There's no caption line: the log's own entries are set large
   enough to read muted, so keep the entry text short.
5. When something ships, add the entry, change Now's date, regenerate `feed.xml`, and record again: the changelog is
   meant to be kept.
