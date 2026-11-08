# tamra-nuat: the pick

Contact sheets and scratch (`tools/engine/jobs/`):
- `screenfold-hunt/sheet-commons.jpg`: Commons, 92 candidates over every tradition the brief names (Burmese parabaik:
  British Library Rama Zat, Bodleian MS. Burm. a. 6 and a. 12, Chester Beatty Bu 1201/1290, LACMA AC1994.113.1, Guimet,
  Wellcome's *Life of the Buddha*; Thai samut khoi: LACMA M.76.93.2 Phra Malai, Wellcome MS Thai 1-4, Chester Beatty
  Thi 1312/1319, Walters; codices: Borgia, Vindobonensis, Borbonicus, Cospi, Laud, Bodley, Selden, Zouche-Nuttall,
  Becker I, Colombino). Licences and full sizes in `screenfold-hunt/commons.log` and `commons/meta.json`.
- `screenfold-hunt/sheet-tn801.jpg`: all 86 Wellcome frames of MS Thai 801.
- `screenfold-hunt/sheet-strip-A.jpg`, `sheet-strip-B.jpg`: the same book cut into its panels, side A (A1-A78) and side
  B (B1-B78), in reading order: 304 panel crops.
- `screenfold-hunt/sheet-bp76.jpg`: Wellcome MS Burmese-Pali 76 (a kammavaca on lacquered leaves, not a concertina).
- `screenfold-hunt/viz-run.jpg`: the cut run B1-B16 between its boards, with the measured free paper in blue.
- Museum APIs searched: the Met (v1.1 search: "parabaik", "folding book", "samut khoi", "Phra Malai", "manuscript
  Burma", "accordion book", "codex Mixtec"; its object API refused the parabaik records 744940 and 856163 behind
  Incapsula while serving others), Cleveland (cc0: nothing concertina from Southeast Asia; a Burmese kammavaca),
  Art Institute of Chicago (nothing), Smithsonian Open Access (library records only), Wellcome Collection (catalogue
  and IIIF: MS Thai 801 is its only digitised Thai folding book).

`engine.py inspect` (`screenfold-inspect/`): the Wellcome frames pass (boards and stack edge PASS; the panel frames
WARN only for "near-perfect symmetry", which a blank folded page is). The Commons candidates were inspected as
thumbnails and fail only on size; their originals are 2100-5076 px (`commons.log`).

## The book: Wellcome Collection MS Thai 801, *Tamra nuat*, Thailand, 19th century

A samut khoi, a folding book of khoi (mulberry-bark) paper between two lacquered boards, 37.3 cm long (the Wellcome's
own rule, frame 86) and about 12.5 cm tall. It is a manual of *nuat*, Thai massage: standing figures, front and back,
drawn in black ink with the *sen* (the lines the therapist works along) in red and the pressure points as small
circles, each labelled in Thai script. The second side holds two figures, then forty blank panels, then text and
figures written from the far end, upside down. Public Domain Mark.

The Wellcome photographed it whole, which nobody else in the pile did:
- every panel, four to a frame, two new panels a frame, so each panel is photographed twice, flat, at one scale;
- frame 41, the front board lying above the first panel of side B, as the board and the strip meet;
- both boards alone, both long edges of the closed stack (every fold a line), both ends, and a frame with a ruler and
  a colour checker.

**Why this one.** It is the only candidate with a whole book at one scale, panel by panel, together with its own boards
and the real edge of its folded stack. It has paper to write on that is the book's own: forty blank panels (B8-B47)
and the free paper either side of the drawn legs (B7). Its panels are one size, so the pleats fold true. Its drawings
are what the demo's text is about (a massage practice's FAQ, its answer on the *sen* beside the *sen*). And it is
public domain.

### Why not the others

| candidate | what it has | why not |
|---|---|---|
| **Wellcome MS Thai 801, Tamra nuat** | the whole book, panel by panel, boards, stack edges, scale; 40 blank panels; PDM | **picked** |
| LACMA M.76.93.2, Phra Malai (Commons) | glorious Bangkok-style paintings at both ends of each opening, text between | one view per opening, no folded view or edge; every panel is painted or written: nowhere to write |
| Wellcome *Life of the Buddha* parabaik (Commons, CC BY) | large white-parabaik court scenes, 4000-5000 px | painted edge to edge; openings, not panels; no folded view |
| Wellcome MS Thai 1-4 (Commons, CC BY) | Phra Malai details, devas on red | details of single panels |
| British Library Or. 14718, Rama Zat (Commons) | three scenes | crops only |
| Bodleian MS. Burm. a. 6 / a. 12 (Commons) | royal pastimes, life of the Buddha | a few openings; Bodleian licence is non-commercial |
| Chester Beatty Bu 1201 / 1290, Thi 1312 / 1319 | court scenes, a fragment | single views; Chester Beatty's licence is non-commercial |
| Met parabaik 744940, 856163 | an accordion-folded parabaik, photographed folded (DP-14374-040) | the API refused the records; one view on Commons |
| Codex Borgia, Vindobonensis, Borbonicus, Cospi (Commons) | full screenfold codices, page by page | painted edge to edge on every page; no free gesso; most scans are facsimiles; no edge view |
| Codex Laud, Bodley, Selden (Commons) | photographs of the codices standing open in their cases | museum-case photographs at an angle, not flat panels |
| Zouche-Nuttall | | British Museum, CC BY-NC-SA, and no free alternative of the same campaign |

## The openings used (third pass)

The first two passes used one run of side B (B1-B44): two figures, then blank paper, so most sections opened onto empty
panels. This pass gives each of the demo's six sections its own figure, chosen from `screenfold-hunt/sheet-pairs.jpg`
(15 candidate openings) by the free paper round each figure (`screenfold-hunt/survey.json`, every panel of both sides
scored) and by how different the figures are from each other:

| section | opening | what it shows | free paper (1440 px) |
|---|---|---|---|
| 1 | A5-A8 | the great sen-line figure's legs, its diagram of numbered circles, its feet, a blank panel | ~1,100 characters |
| 2 | A47-A48 | a seated front figure, line only | ~200 |
| 3 | A65-A66 | the red-lined figure with a demon's face | ~120 |
| 4 | A67-A70 | the painted yellow figure, the book's most worked drawing, across four panels | ~300 |
| 5 | A75-A76 | a red-lined back figure | ~200 |
| 6 | B5-B8 | the back figure of side B and the blank panel after it | ~750 |

They are in the book's order but not consecutive (A65-A70 are): the demo shows selected openings, and the README says
so. Set aside: A1-A2 (the Wellcome's own "Eames Collection" label is stuck on the head), A11-A12 and A49-A50 (more back
figures), A63-A64 (labels fill the paper), B69-B76 (written upside down from the far end).

## Nothing generated

No Midjourney (not needed: every part of the book was photographed), nothing drawn, nothing modelled.
