# AGENT.md: make this person's booking page and its film

You are a coding agent working for one person who sells their time: a freelancer, a consultant, a coach, a tutor, a
therapist, an adviser. They picked this format: a page whose first screen is **a week of their diary**, set like a
good week-to-view, with their name and "I help … with …" in the margin and the ways to work with them under it. That
week plays as a short film of a visitor booking: an offer is picked (the times too short for it fade, the ones that
fit are inked round), Thursday at ten lights, a slip tucked into the diary is written in (a name, one line about the
problem), Confirm, and **the invite card falls into the week** and settles into the slot as an entry. Under the film:
the offers drawn as lengths of time, how working together goes, proof slots, a short FAQ, and the **real booking**
(their scheduler's embed, both time zones side by side, an email fallback). The same page opened with
`?record&ratio=16:9` is the stage they record for X.

The page only works if everything on it is **theirs**: their offers at the lengths they sell them, their real hours,
their words, their clients' real words. You are gathering what already exists, not writing a persona. Never invent an
offer, a rate, a client, a logo, a testimonial, a number or a credential. If something is missing, leave the
placeholder and ask.

Read `tour/README.md` once for the engine's vocabulary (the parts that matter here: `data-tour-frame`, *A second
design size for tall stages*, *A third for squarish stages*, `type` with `rhythm: 'human'`, `stream`, `mark`). Then
work through this in order.

## 0. Where things are

```
index.html                  the page. Its markup is yours to edit: the film (the diary inside the frame, the rail under
                            it), then the offers, how it goes, proof, questions, the booking, the footer
kit/                        placeholder kit: tokens, .ph frames, buttons, notes (press N to hide notes)
office-hours/section.css    the stage, the rail, the diary in its three layouts, and the page (.oh-…)
office-hours/script.js      the film: three chapters, the offer it picks, what the visitor writes
office-hours/section.js     fills the coming week's dates, plays the film once it's on screen, the booking's logic
office-hours/section.html   the markup as it came (index.html has a filled-in copy; edit index.html)
tour/                       the engine (tour.js, tour.css), snapshot.py, README.md; don't edit
```

(In the StyleFeatures repo, `python3 templates/scaffolds/sections/demo/tour/export.py <dest> --format office-hours`
makes this layout.) Serve the folder with any static server, e.g. `python3 -m http.server 8000`.

## 1. Gather their things (before writing anything)

Ask the person for what you can't find, and confirm anything you found before it goes public. Look in this order:

- **Their booking link.** Cal.com, SavvyCal, TidyCal, Calendly, Acuity, Google Calendar appointment pages, Zcal, a
  `book`/`call` page on their site, the link in their email signature. Note **one URL per offer** if their tool has
  separate event types (`cal.com/name/intro`, `cal.com/name/session`), and whether it can be embedded (most give an
  inline-embed URL or snippet). That link is the ending of the page; the diary on top is a picture of it.
- **Their offers.** The event types in that tool are the honest list: name, length, the description they wrote. Also
  their site's Services / Work with me / Coaching page, a rate card PDF, a proposal template. Take **two or three**,
  with the **lengths they really sell** ("20 min", "45 min", "3 h", "a day"). Rates **only if they already publish
  them**; otherwise the rate line is deleted, never estimated.
- **Their hours.** When they actually take calls: which days, which hours, which time zone (an IANA name such as
  `Europe/Lisbon`, `America/New_York`). Their scheduler's availability settings say this exactly. Ask what they never
  do ("no calls on Friday afternoons", "mornings are for writing"): that becomes the handwritten note in the diary.
- **Who they help, with what.** Their bio on LinkedIn, X, their site's About, their newsletter. You need one sentence
  in the shape "I help *who* with *what*", in their words, shortened if it must be, never rewritten into marketing.
- **How working together goes.** What happens before a call (a questionnaire? nothing?), on it, after it (notes, a
  plan, a recording, an invoice) and when. Their onboarding email or welcome doc usually has it.
- **Proof.** Testimonials they already publish (their site, LinkedIn recommendations, Google reviews, a Senja/Testimonial
  wall), with the person's name and role. **Only real ones, and only with permission.** Client logos only where the
  client agreed to be named. If there are none, delete the proof section; don't leave fakes.
- **Questions people really ask.** Their FAQ page, or ask them for the three questions they answer most in email.
- **Their look.** If they have a site, take its fonts and its one accent colour (CSS variables, a theme file) and set
  `--oh-ink` (the fountain-pen blue) to it. Otherwise keep the kit's warm paper and the ink.

Therapists, coaches and anyone working with private clients: the diary shows **patterns, not people**. Busy time is
hatched and never labelled, and nothing on the page hints at who else is in the week.

## 2. Fill the diary (inside the frame)

The diary is `.oh-diary` inside `[data-tour-window]` in `index.html`, built in design pixels with three layouts from
one set of markup (`office-hours/section.css`): **wide** 1200 × 740 (margin on the left, Monday–Friday), **square**
800 × 700 (`.is-square`: the margin becomes a band over the week; 1:1 recordings) and **tall** 480 × 800 (`.is-tall`:
the margin on top, Wednesday–Friday only; phones and 9:16). Check all three after every change.

- **The margin** `.oh-margin`: `.oh-name` (their name exactly as they write it), `.oh-help` ("I help … with …"),
  and the offers `.oh-offer` ×2–3: `data-len` is the length in minutes (it decides which times fade in the film),
  `data-name` the name, then the name, the length as they say it, and one short line. Keep the `data-tour="offer-…"`
  hooks. The little month and "Times in …" are filled by `section.js`.
- **Time zone.** Put their IANA zone on the root: `<article class="demo-office-hours" … data-tz="Europe/Lisbon">`, and
  replace every "your city's time" with how they'd say it ("Lisbon time"). With `data-tz` empty the page uses the
  visitor's own zone.
- **The week** `.oh-cols`: one `.oh-col` per day. Each time is a box with `style="--s:10;--m:60"` (start in hours,
  13.5 = 13:30; length in minutes) and its label. Open times: `<span class="oh-slot" role="button" data-open
  data-m="60" …><b>10:00</b><small>1 h</small><i class="oh-tick"></i></span>`. Busy: `<i class="oh-busy" style="…"></i>`,
  no text. Draw **their real pattern** for a typical week, not their actual appointments. The grid runs 9:00–17:00
  (`--h0:9;--hours:8` on `.oh-diary`, and the hour labels in `.oh-hours`); change all three together for other hours.
- **The booked time** `[data-tour="slot-thu"]` is the one the film books. It holds the lit band, the entry it becomes,
  the slip, the invite card and the camera's zone. Move the whole element to another day or hour if Thursday at ten
  isn't a time they'd offer; `section.js` reads its column and label for every date on the slip and the card.
- **The handwritten note** `.oh-hand`: one thing they never do, in their words, or delete it.
- **The invite card** `.oh-invite`: the offer's name, `{{call_how}}` (how calls happen: "Video call · the link is in
  the invite", "Phone call · I'll ring you", "At the studio, 12 Example Street" only if they meet in person and say so).
- Dates fill in from the coming week. To pin a week (for a recording you'll redo later), set `data-week="2026-11-09"`
  on the root.

**Static HTML/CSS only** inside the frame. The diary is a picture the film moves; the real booking is at the end.

## 3. The script (`office-hours/script.js`)

It tells the booking in three chapters (*what you need*, *a time that suits*, *in the diary*), about 33 s. Adjust it
to them rather than rewriting it:

- `FILM_OFFER` is the offer the visitor picks: their most common one, usually the middle one.
- `WHO` and `ABOUT` are what the visitor writes on the slip. Keep `WHO` a plain first name and make `ABOUT` the kind of
  thing their clients really bring them, in a client's words ("Our launch plan needs a second pair of eyes", "My
  daughter's maths exam is in May", "We need a pricing model before the board meeting"). Never a real client's name
  or problem.
- Chapter titles (a few words, one `<em>`) and captions (one short sentence per action) in their voice.
- Every action visibly changes something; one push-in per chapter, then `unzoom()`. `mark('still')` is the frame
  reduced motion shows: the week with the entry written in.

## 4. Fill the page under the film

- **The rail** under the frame: `.oh-band` (`{{band_title}}`, `{{band_line}}`) and the closing frame `.oh-end`
  (name, their booking address and email, shown at the end of the recording).
- **Offers** `#offers`: each `.oh-off` with `style="--m:45"` (minutes, drawn on a three-hour rule), the length set
  large, the name, two plain sentences on what happens and what they leave with, who it's for, the rate **only if
  published**, and "Book this" (`data-offer` = its index, which picks it in the booking).
- **How it goes** `#how`: three steps, dated the way they'd say it ("Before", "On the call", "Within two days").
- **Proof** `#proof`: real logos (SVG or a clean PNG on transparent, grey them with `filter: grayscale(1)` if they're
  loud) and one real quote with name and role, or delete the section.
- **Questions** `#faq`: three to five, answered in two sentences each.
- **The booking** `#book`: put their scheduler's embed URL on `.oh-embed`: `data-embed="https://cal.com/name"` for one
  link, or `data-embed-0`, `-1`, `-2` for one per offer (the picker switches between them). `section.js` puts it in an
  iframe; use the tool's **inline embed** URL (Cal.com: the event URL with `?embed=true` or their embed snippet's
  link; SavvyCal and TidyCal: the inline embed link). If their tool only offers a script snippet, paste it inside
  `.oh-embed` in place of the `.ph` and leave `data-embed` empty. If they have no scheduler, delete `.oh-embed`: the
  email fallback (with the offer and any time picked in the diary) becomes the booking.
- Clicking an open time or an offer in the diary (after or during the film) brings the visitor here with it chosen,
  and the email fallback carries it. Keep the open times honest for that reason.
- Delete every `<span class="sf-note">`, set the page `<title>` ("Name: book a call") and the meta description (their
  "I help … with …" line).

## 5. Check it

- `index.html?t=14` freezes any moment. Check the middle of each chapter and just after each action: the cursor sits
  on what it clicked, the times that fade are the ones too short, the slip is whole inside the frame, the card lands
  squarely on the time and becomes the entry.
- `?record&ratio=16:9&t=…`, `?record&ratio=1:1&t=…`, `?record&ratio=9:16&t=…`, and the page at 1440 × 900 and on a
  390-wide phone: no sideways scroll, nothing important cut, the diary legible.
- With reduced motion: one calm frame, the week with the entry written in.
- Nothing left that is lorem, a placeholder you meant to replace, a rate they don't publish, a testimonial without
  permission, or a hint of who their other clients are.

## 6. Hand it over: record and post

End by giving the person this, with the link filled in:

1. Open **`index.html?record&ratio=16:9`** (served, e.g. `http://localhost:8000/?record&ratio=16:9`) in a browser
   window large enough for a crisp stage: 1920 × 1080 or larger on a Retina display.
2. Record it with **Monet Shot**: choose the browser window, crop to the stage, park the real pointer off the window
   (the film draws its own cursor). It holds on the first frame for 1.2 s, plays once and stops on the closing
   frame. Monet Shot adds no zooms of its own, because the clicks aren't real; if you'd rather place zooms on its
   timeline, open `?record&ratio=16:9&camera=off` so you don't get both.
3. Export H.264 MP4 and post it to X with one line and the link to the booking. **16:9** reads best on desktop and in
   quote posts; `ratio=1:1` takes more of the phone feed; `ratio=9:16` is for stories. Record each ratio separately;
   the diary lays itself out again for each, so never crop one into another.
4. X takes MP4 (H.264, AAC) up to 2 min 20 s and 512 MB. The captions are burned in, because X autoplays muted.
