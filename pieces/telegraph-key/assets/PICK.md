# Pick: the Morse–Vail key, 1844 (Smithsonian NMAH EM.181411)

**The object.** The key Alfred Vail made as an improvement on Morse's first transmitter, believed to be from the first
Baltimore–Washington line (1844): a long steel-and-brass lever with a flat finger plate, hung on a pin between two brass
cheeks, a front thumbscrew whose point meets a brass anvil, a back thumbscrew that rests on a post, and a flat spring
under the lever, on an oak block, 3 × 2 × 6¾ in.

**The picture.** NMAH photograph JN2014-3911, 7428 × 4872, CC0 (Smithsonian Open Access). A strict side elevation on a
white sweep: every working part is in profile, so the lever turns in the image plane. Sharp to the tool marks and the
dust on the brass. `engine.py inspect`: pass on every check (size 7428 px; softness 0.315, "detail present at every
scale; not an enlargement"; template look, grain).

**Measured, never shown.** The Smithsonian's CC0 photogrammetry of the same key (Voyager package
`3d_package:ed99f44d-…`, 150k faces, mm): the pin hole runs through both cheeks at the same place, 20.2 mm behind the
front contact, 17.5 mm ahead of the back stop and 113.8 mm from the finger plate (a 5.6 : 1 lever). The scan is used
only to place the pivot in the photograph.

**The catch, and what is done about it.** As the museum keeps it, both thumbscrews are on their seats: the front point
touches the anvil and the back screw sits on its post (measured column by column in the photograph), so the key has no
play at all. (The scan shows both open by the same 0.47 mm: that is photogrammetry's gap at touching surfaces, not a
setting.) In life the play was the operator's own, set with these screws (Pope, *Modern Practice of the Electric
Telegraph*, §52: the anvil stops the lever going down, the set screw stops it going up, a spring beneath brings it back).
Here the front thumbscrew stands 1.4 mm off the anvil, raised along its own thread, an open setting chosen so the
stroke reads at the size the button is used. The lever then turns 3.918° about the pin until the point meets the
anvil: the finger plate travels 7.6 mm (2.9 px on a 40 px row button) and the back screw lifts 1.1 mm off its post.
The thread that the raise shows above the lock nut is the same screw two pitches (1.64 mm) higher. Everything else
is the photograph.

## The hunt (147 images, about 40 keys)

Contact sheets (`tools/engine/jobs/telegraph-hunt/`):

| sheet | what | count |
|---|---|---|
| `sheet-si.jpg` | Smithsonian Open Access, NMAH, CC0: Morse–Vail key (5 views incl. a b&w), Vail's 1845 key (8), the 1844 apparatus replica (7), patent models, repeaters | 24 |
| `sheet-mv.jpg` | Museums Victoria, CC BY: a camelback key (9 views), the 1857 Morse set with camelback key (19), Chester of New York set (16) | 44 |
| `sheet-commons.jpg` | Wikimedia Commons, categories *Telegraph keys*, *Straight keys*, *Bunnell & Co.*, *Morse key CnAM*, NEM and more (259 files crawled, 58 fetched) | 58 |
| `sheet-smg.jpg` | Science Museum Group, British keys 1850–1950 (single- and double-current, GPO pattern, magnetic) | 21 |

Every image was run through `engine.py inspect` (`inspect-*.json` beside the sheets). The previews fail on size, as they
should; the shortlist was fetched at full resolution and inspected again (`tools/engine/jobs/telegraph-src/`).

## Shortlist

| | object | photograph | verdict |
|---|---|---|---|
| **1** | **Morse–Vail key, 1844, NMAH** | **JN2014-3911, side, 7428 px, CC0** | **pass; the pick** |
| 2 | same key | MAH-27979, side, b&w, 5771 px | pass, but black and white and older hardware; reference only |
| 3 | same key | 88-8830-12 and SIA-74-2491, ¾ views, 3000 px | pass; used to read the trunnion (the lever's lug drops between the cheeks) |
| 4 | Vail's key, 1845, NMAH EM.181412 | NMAH2002-27893/-27895, side, 1794 px | fail: "looks enlarged about 2x" |
| 5 | camelback key, MV 409496 | 1277509/-510, side, 3000 px, CC BY | pass by the numbers, but soft, heavy JPEG, shallow focus; contact closed too |
| 6 | 1857 Morse set, Chester set, MV | camelback keys inside whole-set photographs, ¾ | the key is a small part of the frame |
| 7 | Commons (Redding, Boston; Western Electric; Bunnell; NEM) | mostly ¾ views, mostly 20th-century keys | no 19th-c. American or British key in strict side view at this quality |
| 8 | Science Museum Group British keys | ¾ views, 1536 px | Non-Commercial licence; no side views |

The Met's API has no telegraph keys with images (`telegraph` returns a cable specimen, prints and a painting).
Europeana's open-licence keys are Swedish (Tekniska museet, Army Museum), mostly 20th-century.

## Why this one

It is the American telegraph's own key, the photograph is the best in the pile by a wide margin, and it is a true side
view, so the lever's rotation about its pin is the photograph's own geometry. The near cheek and its pin nut stand in
front of the lever and stay put as it turns, so the pivot reads. What the lever uncovers is the white sweep (cut out) and
a sliver of the far cheek behind its lug, filled from that cheek's own brass.

Midjourney: not needed. No part of the key is missing from the photograph.
