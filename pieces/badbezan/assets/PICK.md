# Pick note: sf-fan, 2026-11-07

## The hunt

About 230 photographs of some 150 fans, hunted for a **brisé** fan (rigid sticks, no leaf) that is photographed fully
open, straight on, sharp, on a plain ground. Sheets, all in `tools/engine/jobs/`:

- `round9-lead-hunt/sheet-fan-cn2.jpg`: the lead's first pass. Mostly pleated folding fans (paper or silk leaves),
  which fold in valleys and can't turn as rigid pieces.
- `fan-hunt/sheet-met-a.jpg`, `fan-hunt/sheet-met-b.jpg`: the Met's Open Access, searched for "brisé fan", "brise
  fan", "hiogi", "cockade fan", "fan tortoiseshell" and lacquer fans (186 objects read, 130 public-domain fans; the
  55 with rigid sticks fetched with every additional view, 94 images). Script: `fan-hunt/met_hunt.py`, `dl_met.py`.
- `fan-hunt/sheet-ch-a.jpg`, `fan-hunt/sheet-ch-b.jpg`: Cooper Hewitt through Smithsonian Open Access (CC0), all 72
  "brisé fan" records with images, 107 views.
- `fan-hunt-commons/hunt/sheet.png`: Wikimedia Commons, for hiōgi (the Japanese cypress court fan, the first brisé),
  "brisé fan", Qajar lacquer and Vernis Martin: Tokyo National Museum, LACMA, Cleveland, Ashmolean, Rijksmuseum.
- The Art Institute of Chicago and Cleveland open-access APIs (searched; their brisé fans are also on the sheets
  above or are pierced ivory).
- `fan-hunt/sheet-shortlist.jpg`: the shortlist below. `engine.py inspect` on all fifteen shortlisted originals
  (`tools/engine/jobs/inspect/inspect/<id>.png`): every 4000 px master passes; the Met's two older views of the
  pick (1200 and 1050 px) are for reference only.

## Shortlist

1. **Fan with Poetic Verses, Tehran, dated 1301 AH / 1883–84, wood, painted, gilded and lacquered. The Met
   90.2.65 (object 443577), photograph DP155256, 3907 × 2749, CC0. Picked.**
2. Brisé fan, probably French, first quarter of the 18th century, ivory and oil paint (Met 156211, 4000 px). A
   Vernis Martin scene painted across some two dozen thin sticks. The boundaries between sticks are hairlines in the
   paint, and there is no second state.
3. Briséwaaier, Vernis Martin, Rijksmuseum on Commons (9940 px, CC0). The finest resolution in the pile, with the same
   problem: one continuous painting over thin sticks, and pierced ivory at the gorge.
4. Brisé fan, European, bone, paint, tortoiseshell (Met 156572). Its second view shows a broken stick.
5. Brisé fans of pierced, painted and gilded ivory (Met 209925 with jasperware medallions, 209530, 209923). The
   ground shows through every stick, so each cut-out would be lace.
6. Chinese export black lacquer brisé fan with gilt chinoiserie (Cooper Hewitt 1916-29-112). Handsome, but the
   sticks are narrow and the gilt scene runs across them; the collection's images are 800 px.
7. American carved wood brisé fan with a purple ribbon (Met 120525, 2534 px). Openwork again.
8. Ivory brisé fans with an open and a closed view (Cooper Hewitt 1942-34-7, 1924-31-1). The closed views are what
   the brief hoped for, but the fans are plain.
9. Cypress hiōgi, Tokyo National Museum, on Commons (3156 px, CC0). The original brisé, but shot in a glass case with
   glare, its long silk cords across the sticks.

## Why the Qajar fan

- Every stick is a whole picture. Twenty broad paddles, each painted with its own cartouches of verse in a border
  of flowers, so each cut-out reads as an object on its own and closing the fan shows a stack of real painted edges.
  The thin-stick Vernis Martin fans would have turned into strips of one painting.
- The cut is findable. Each stick has a plain gilt rim, and the rim of the stick above lies on the paint of the one
  below with a thin dark line under it. A matched filter for that line and rim, followed in polar coordinates about
  the pin, finds every stick's edge. The sticks are opaque (no piercing), so nothing behind them is ever seen.
- Closing only hides. It is a true brisé: the bottom guard lowest, each stick lying on the one before it, the top
  guard over all. Closed, each stick goes back over the one below it, so no pixel that wasn't photographed is ever
  needed. The Met's older photograph of the same fan half-closed (sf90-2-65b) confirms that stacking order (the back,
  sf90-2-65a, is black lacquer with gilt sprays).
- The ribbon shows: a red silk ribbon threaded through two slots in every stick. It moves with the sticks it lies on.
- The rivet is sharp: a brass pin in a mother-of-pearl washer, fitted to 0.17 px.
- The ground is the Met's neutral grey, exactly R = G = B, so the outline comes out of the saturation alone.
- One culture, one craft: Qajar lacquer painting, Tehran, with Persian verse. The gallery label calls them Hafiz's
  verses, so the demo sets a ghazal of Hafiz (Gertrude Bell's 1897 translation) and a nightingale.

No Midjourney: nothing here needed a part no one photographed.
