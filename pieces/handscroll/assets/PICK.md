# handscroll: the pick

## The hunt (2026-11-03)

About 400 handscrolls looked at, and the mounting photographs that came with them:

- **Cleveland Museum of Art**, open access API, CC0: all 121 handscrolls, plus "scroll end / roller / knob / jade / ivory"
  searches (54 more). For each Chinese scroll, the stitched full-length strip and every alternate photograph that was not
  an ordinary section shot: that is where Cleveland keeps its photographs of the rolled scroll, the wrapper, the title
  slip, the ribbon and the ends. Sheets: `tools/engine/jobs/handscroll-hunt/cma/strips-1.jpg`, `strips-2.jpg`,
  `sheet-alts-1.jpg`, `sheet-alts-2.jpg`, `sheet-mounting.jpg`, `z-roll-ends.jpg`, `sheet-qianlong.jpg`,
  `sheet-1964.94-alts.jpg`.
- **The Met**, v1.1 search: 504 handscrolls listed, 179 Chinese ones read before its bot wall (Incapsula) shut this
  machine out twice; not pushed past. `tools/engine/jobs/handscroll-hunt/met/met.json`. Met wrappers seen on Commons
  (Li Jie, *Fisherman's Lodge*, DP214241: a kesi dragon wrapper with its stave and ribbon).
- **Art Institute of Chicago**: about 60 handscrolls, all served at 3000 px at most. `aic/aic.json`.
- **Wikimedia Commons** (under the shared lock): 103 + 19 files: the Palace Museum and National Palace Museum scrolls
  (Qingming Qing court version 56531x1700, *Bunian tu* 143397x9399, *Five Oxen* 63885x2560, *Spring Morning in the
  Han Palace* 52680x2683, Wang Ximeng 39974x1600, Night Revels, Admonitions, Kangxi and Qianlong tours), Met DP
  mirrors, the Walters Qiu Ying, rolled and mounted scrolls. Sheets: `commons/sheet.jpg`, `commons2/sheet.jpg`,
  `commons/sheet-got1.jpg`.
- **National Museum of Asian Art** (Freer|Sackler): the open access API was over its shared rate limit; the site's own
  search (358 Chinese handscrolls) was browsed but serves small images; no roller ends found.
- **Midjourney Explore** (read only, before the lead took Midjourney over): nothing of the real object, only CG props.
  Nothing generated; nothing needed.
- `engine.py inspect` on every downloaded candidate: jobs `handscroll-inspect-parts`, `-sec`, `-got`, `-prev`. The
  web-size previews fail on size, as they should; every print-size section and mounting photograph passes (the blank
  end papers warn "symmetric", being blank).

## Shortlist

1. **Zhou Chen 周臣, *Beggars and Street Characters* 流氓圖, 1516, Ming, Suzhou. Cleveland 1964.94, CC0.** Full scan
   64714 x 4862 (152 px per cm). Painted as an **album of 24 leaves**, one figure to a leaf, later mounted as two
   handscrolls; Cleveland has 12 leaves, Honolulu the other 12. So the sections are the painting's own: twelve leaves,
   joined in pairs (the seams between album openings are strong, the folds within them faint, both visible in the
   scan). Then Zhou Chen's own inscription (1516) across the last opening, and colophons by Huang Jishui (1564), Zhang
   Fengyi and Wen Jia (1577), each on its own paper between silk separators, and a frontispiece by Zhao Heqin (1962).
   Every part of its mounting is photographed by the museum, separately, sharp: the damask start with its stave and
   ribbon (alt14), damask, gold-flecked strip and silk (alt15), the brocade wrapper laid flat with its title slip
   "周臣流氓圖, 壬寅夏六月, 古堇趙寉亭題署" and the ribbon (alt13), the closed scroll (alt18), the blank end paper
   with a ruler (alt11). Ink and light colour on plain paper: each figure stands alone on its leaf, so it reads on a
   phone. Leaves are portrait (about 0.6), the right shape for a phone carousel.
2. Zhang Wo, *Nine Songs*, 1361, Cleveland 1959.138 (118100 x 4731). Song and picture alternate: perfect sections, and
   its rolled photographs have a title slip. But the line is so fine and the text so dense that a section at phone
   width is a pale thread.
3. *Eighteen Songs of a Nomad Flute*, early 15th c., Met 1973.120.3. Eighteen sections, colour and gold. Each section
   is a wide landscape (about 2.3 : 1): at phone width the figures are a few pixels. Met mounting photos unverified.
4. *Portraits of the Qianlong Emperor and His Twelve Consorts*, Cleveland 1969.31. Thirteen portraits, thirteen
   sections, astonishing colour; but the only stitched image is 1342 px tall, and twelve near-identical faces in a row
   make a monotonous carousel.
5. Liang Kai (attr.), *Sericulture*, Southern Song, Cleveland 1977.5. Song, a process in pictures, but three sections,
   each 3.5 : 1.
6. Ren Renfa (attr.), *Three Horses and Four Grooms*, Cleveland 1960.181. Superb, but three groups.
7. *The Lantern Night Excursion of Zhong Kui*, Cleveland 1961.206: the finest ribbon and ivory clasp photograph
   (alt0), but one continuous procession on dark silk: no sections of its own.
8. *Streams and Mountains without End*, Cleveland 1953.126; Qiu Ying's *Garden for Solitary Enjoyment*, 1978.67;
   *In the Palace*, 1976.1; and the Commons Palace Museum scrolls: continuous, so any stop would be cut where the code
   likes.

## Why this one

It is the one scroll whose sections were made as sections (album leaves), whose every mounted part was photographed
by the museum that owns it, and which holds up on a phone. Everything on the page comes from this one object:
the twelve leaves, the inscription and colophons with their seals, the frontispiece, the wrapper, the title slip and
the ribbon. One culture, one craft: Suzhou figure painting of 1516, mounted the Suzhou way.

What it lacks, said plainly: its roller has no protruding knobs (the closed scroll's ends are flush) and its ribbon has
no clasp (a museum tag is tied where a toggle would be). So there are no knobs and no clasp on the page: nothing is
borrowed from another scroll to dress it up. The back of the mounting (the outside of each roll while the scroll is
open) was not photographed; the rolls are wound in this scroll's own blank end paper (alt11), and their light is
measured from the photograph of this scroll rolled (alt18). alt12, which the lead session hoped might be the back, is the
front of the whole mounting in one stitch (stave to end paper); it gave the lengths the full scan leaves out.
