# AGENT.md: make this person's link-in-bio page and its 9:16 film

You are a coding agent working for one person (an artist, a writer, a maker, a freelancer). They picked this format:
the page they put behind the link in their bio. It shows a portrait, their name, one line, their links, their latest
work and a way to save their contact. At the top of the page that same page plays as a short film: a fingertip taps a
link and it **unfolds in place** into a preview of where it goes, taps the newest piece in the work strip and it
**widens and plays** where it is, then **turns the contact card over** and saves it. Under the film are the real,
clickable links and address. The same page opened with `?record&ratio=9:16` is the stage they record for stories
and X.

The page only works if everything on it is **theirs**: their face, their words, their real links, their real work.
You are gathering what already exists, not writing a persona. Never invent a link, a title, a client, a number, a
quote or a credential. If something is missing, leave the placeholder and ask.

Read `tour/README.md` once for the engine's vocabulary (the parts that matter here: *A finger instead of a cursor*,
`swipe`, `data-tour-frame`, `data-tour-grow`, *A second design size for tall stages*). Then work through this in order.

## 0. Where things are

```
index.html               the page. Its markup is yours to edit: the film (<section class="demo-link-in-bio">: the page
                         inside the frame, the rail under it), then the live links and address (<section class="contact-hello">)
kit/                     placeholder kit: tokens, .ph frames, buttons, notes (press N to hide notes)
link-in-bio/section.css  the stage, the rail, and the page in its three layouts (.lib-…)
link-in-bio/script.js    the touch script, built for one layout: film('wide' | 'square' | 'tall')
link-in-bio/section.js   picks the layout for the stage, plays the film once it's on screen, syncs real clips
link-in-bio/section.html the film's markup as it came (index.html has a filled-in copy; edit index.html)
tour/                    the engine (tour.js, tour.css), snapshot.py, README.md; don't edit
hello/                   the live section under the film: the address set large, quieter links beside it
```

(In the StyleFeatures repo, `python3 templates/scaffolds/sections/demo/tour/export.py <dest> --format link-in-bio`
makes this layout.) Serve the folder with any static server, e.g. `python3 -m http.server 8000`.

## 1. Gather their things (before writing anything)

Ask the person for what you can't find, and confirm anything you found before it goes public. Look in this order:

- **Their current link page.** Linktree, Beacons, Bento, Carrd, lnk.bio, a `links` page on their site: fetch it and
  take every link, in their order, with its label. That is the list they already chose; start from it.
- **Their bios.** Instagram, X, Threads, Bluesky, TikTok, YouTube, LinkedIn, GitHub (the profile README), Substack
  or their newsletter's About page, their own site's About. Take the **name exactly as they write it** (which word,
  if any, deserves the italic), the **role and place** as they put it ("Ceramicist · Lisbon"), and the **one line**:
  their own sentence, shortened if it must be, never rewritten into marketing.
- **Each link's preview.** For every link, fetch the URL and read its `og:image`, `og:title` and `og:description`
  (or `twitter:image`, or the page `<title>` and first paragraph). Download the image into `assets/links/`; that is
  what the unfolded preview shows, so the visitor sees where the link goes before they go. If a page has no image,
  use a calm crop of the work it leads to, or keep the placeholder; never a stock photo. `l1_url` is the address
  as people would read it (`yourname.substack.com`), not a tracking link.
- **The latest work.** The newest three pieces they'd want seen first: a short film, a reel, a series, a print, a
  release. Ask for the files (MP4 or stills). For a clip: 5–12 s, muted, H.264, cropped 4:5 (the strip crops the
  middle). Put them in `assets/work/`. Title and a short meta line for each ("Film · 2026", "Series of 12").
- **Contact.** The email they want strangers to use (often not their personal one). A phone number **only if they
  say so**. Their site. Write a real vCard at `contact.vcf` (VERSION:3.0, `FN`, `N`, `TITLE`, `EMAIL`, `URL`, and
  `PHOTO` only with their portrait and their OK); the end frame's Save contact button downloads it.
- **The portrait.** Ask them for the photo people already know them by (a profile picture is fine if it's sharp
  at 4:5). Never pull a photo of them from somewhere else without asking, and never use anyone else's.
- **Their look.** If they have a site, take its fonts and its one or two colours (CSS variables, a theme file).
  Otherwise keep the kit's warm paper and near-black ink; it suits almost anyone.

## 2. Fill the page (inside the frame)

The page is `.lib` inside `[data-tour-window]` in `index.html`. It's built in design pixels and has three layouts
from one set of markup (`link-in-bio/section.css`): a three-column **spread** on a wide stage (`data-size="1200x720"`),
**two columns** on a square one (`data-size-square="800xauto"`, the left one stays put while the right scrolls) and
**one column** on a phone and in 9:16 (`data-size-tall="420xauto"`). Check all three after every change.

- **Portrait** `.lib-portrait`: replace the `<figure class="ph">` with `<img src="assets/portrait.jpg" alt="">`
  in a 4:5 box (`object-fit: cover`).
- **Name, role, one line** `.lib-name` (keep one `<em>`), `.lib-role`, `.lib-line`.
- **Links** `.lib-link`, 4 to 6 of them: the row (icon, label, the address as people read it) and, folded under it,
  the preview `.lib-fold`: the `og:image` in place of `.lib-og`, the page's real title in `.lib-pb b`, its
  description (one or two lines) in place of `.ph-text`. Icons: the platform's own mark as a small SVG (Instagram,
  YouTube, Substack…) or a 32 px crop of the preview image; never a look-alike. Delete rows you don't need and keep
  the `data-tour="row-…"`/`"link-…"` hooks the script uses (rows 2 and 4 unfold in the film: put the two most
  interesting links there).
- **Latest work** `.lib-clip` ×3: for a clip, put `<video muted playsinline preload="auto" src="assets/work/new.mp4"
  data-span="5"></video>` inside the figure (absolutely positioned, `object-fit: cover`) and drop its `ph` label;
  `section.js` drives it from the film's clock, so it plays during the film and lands on the same frame at any
  `?t=`. For a still, an `<img>`. Titles and meta in `.lib-wcap` (one `.lib-wc` per clip).
- **Contact card** `.lib-cc`: the front (avatar, name, role), the back (email, phone only if agreed, site, a real QR
  code of the site or the vCard as an SVG in place of `.lib-cc-qr`).
- **The address** `.lib-foot` and every `{{domain}}` spot: their real domain.

**Static HTML/CSS only.** The page in the frame is a picture the film moves; the live links live under the film.

## 3. Fill the live part (what visitors actually click)

A visitor from a bio link wants the links now, so the page never makes them watch: the film plays on its own once it's
on screen (`data-driver="play"`) and they can scroll straight past it.

- **The rail** under the frame: the band (`data-tour-band`: the domain, the play button, a button to `#links`) and
  the closing frame (`data-tour-end`: the domain, See the links, Save contact → `contact.vcf`).
- **`.contact-hello`** (id `links`): the email set large (their public address), the small portrait and their line,
  then the groups: what to write about (work, press, talks) and **Elsewhere**: every link from the page, as real
  `<a href>`s, in the same order. This is the accessible copy of the links; keep it in step with the film's.
- Delete every `<span class="sf-note">`, set the page `<title>` ("Name: links") and the meta description (their
  line), and an `og:image` for the page itself (the portrait on paper works well).

## 4. The script (`link-in-bio/script.js`)

It already tells the story in three chapters (*find me*, *the latest work*, *keep in touch*), about 27 s on a wide
stage and 33 s on a phone. Adjust it to them rather than rewriting it:

- The chapter titles and captions are theirs to word: a few words, one `<em>` per title, one short sentence per
  touch, in their voice ("Tap the newsletter", not "Discover our content").
- Change which rows unfold (`'@row-2'`, `'@link-2'`), which clip plays (`'@clip-2'` and the `data-on` on `@work`),
  and the `still` frame shown with reduced motion (a link unfolded is the most telling one).
- `scrollTo()` swipes the page up on phones and square stages and is a beat on the wide spread, where everything is
  already on the sheet. Don't give a `swipe` a `by` (the engine reads it as a second pointer's name).
- Every touch must visibly change something. One push-in per chapter (`zoom('@link-2', 'fit', …)`), then `unzoom()`.

## 5. Check it

- `index.html?t=4.5` freezes any moment. Check the middle of each chapter and just after each touch: the fingertip
  sits on the thing it touched, the unfolding preview looks like paper opening, the clip widens without jumping.
- `?record&ratio=9:16&t=…` (the hero), `?record&ratio=1:1&t=…`, `?record&ratio=16:9&t=…`. Also the page at 1440 × 900
  and on a 390-wide phone: no sideways scroll, nothing important cut, the rail readable.
- Nothing left that is lorem, a placeholder you meant to replace, someone else's photo, or contact details they
  didn't agree to publish. With reduced motion, one calm frame with a link unfolded.

## 6. Hand it over: record and post

End by giving the person this, with the link filled in:

1. Open **`index.html?record&ratio=9:16`** (served, e.g. `http://localhost:8000/?record&ratio=9:16`) in a tall
   browser window: 1080 × 1920 if your screen allows, otherwise the tallest window you can make on a Retina display.
2. Record it with **Monet Shot**: choose the browser window, crop to the stage, park the real pointer off the window
   (the film draws its own fingertip). It holds on the first frame for 1.2 s, plays once and stops on the closing
   frame. Monet Shot adds no zooms of its own, because the touches aren't real clicks; if you'd rather place zooms
   on its timeline, open `?record&ratio=9:16&camera=off` so you don't get both.
3. Export H.264 MP4 and post it to stories or X with one line and the link. **9:16** is for stories and phones;
   `ratio=1:1` for the feed; `ratio=16:9` (the page as a spread) for desktop and quote posts. Record each ratio
   separately; the page lays itself out again for each, so never crop one into another.
4. X takes MP4 (H.264, AAC) up to 2 min 20 s and 512 MB. The captions are burned in, because X autoplays muted.


## The painting it sits on

Opened on its own, the page sits on *Starry Night over the Rhône* by Vincent van Gogh (public domain), the way Monet Shot frames a take: the site is a
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
