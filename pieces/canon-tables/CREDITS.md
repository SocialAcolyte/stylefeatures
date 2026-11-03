# Credits: canon-tables

The code written for this piece is MIT licensed (see LICENSE). The images,
sounds and third-party code it uses keep their own licences, listed here.

## Images and media

- **Gospel Book**, Carolingian, made probably in Metz, ca. 825–50. Source: The Metropolitan Museum of Art, The Cloisters Collection and Director's Fund, 2015 (2015.560). <https://www.metmuseum.org/art/collection/search/693765>  
  Licence: CC0 1.0 (Met Open Access, public domain).  
  Changes: Seven canon-table pages of the same book, each cut by hand-read geometry and colour distance from the vellum into separate parts: one arch row (split at runtime into bays and ends), capitals, shafts and bases per column. Text and rubrics touching the parts removed; edge colour un-mixed from the vellum. Columns against the binding (the last shaft or base on folios 16, 18, 21, 24, and the last capital on 18, 21 and 24) are left out and replaced at runtime by a sister of the same colour; the right ends of 18, 21 and 24 are drawn as their own left end, mirrored. Sharpness checked with tools/engine inspect (all pass) and every part with alpha_check. Scripts: tools/engine/jobs/canon-tables-work/cut.py, pack.py.  
  File: `assets/parts/*, assets/arcades.json`
- **Zeyt'un Gospels**, T'oros Roslin (Armenian, active 1256-1268), 1256. Source: J. Paul Getty Museum, Los Angeles, Ms. 59 (95.MG.4). <https://www.getty.edu/art/collection/object/107TXJ>  
  Licence: Getty Open Content (CC0).  
  Changes: All eight canon pages, each with two bays (fols. 1v-8: four facing openings), worked at 2100 px wide from the IIIF images (3168 x 4418; fol. 6 4600 x 6400). The bays (the old canon table, its gold ruling and headings) and the place of each column are refilled with parchment: tone from the bays' own bare parchment, grain tiled from the page's bottom margin with its strength matched. Each column (with its corbel and its red and gold flecks) is lifted off as a separate part with edge colour un-mixed from the parchment. Everything outside the bays is the photograph. All files pass the engine's inspect.  
  File: `assets/roslin/*, assets/roslin.json`
- **Texts in the demo**.  
  Changes: Canon I: Matthew 14:13-21, Mark 6:32-44, Luke 9:10-17, John 6:1-13 (excerpts), King James Version, public domain (text checked against bible-api.com, KJV). John 1:1-5 in the Clementine Vulgate and the King James Version, public domain. The plans table was written for the demo. John 1:1-14 in the Clementine Vulgate and the King James Version, and the fuller passages of the feeding of the five thousand (Matthew 14, Mark 6, Luke 9, John 6), fetched from bible-api.com. The Lord's Prayer, Matthew 6:7-15 and Luke 11:1-4 (KJV).  
  File: `assets/demo.html`
- **pretext**, Cheng Lou. <https://github.com/chenglou/pretext>  
  Licence: MIT.  
  Changes: v0.0.8, vendored unmodified (as in pretext-gloss).  
  File: `vendor/pretext/*`

## Third-party code

- **pretext** (`vendor/pretext/`): MIT · Copyright (c) 2026 Pretext contributors. @chenglou/pretext v0.0.8 — https://github.com/chenglou/pretext

## From the README

- Metz hand: Gospel Book, Carolingian, made probably in Metz, ca. 825–50. The Metropolitan Museum of
  Art, The Cloisters Collection and Director's Fund, 2015 (2015.560), Open Access, CC0. Seven folios.
- Roslin hand: T'oros Roslin, Zeyt'un Gospels, Hromkla, 1256. J. Paul Getty Museum, Ms. 59 (95.MG.4),
  Open Content (CC0). Fols. 1v, 2, 3v, 4, 5v, 6, 7v, 8. Every part is listed with its source image in
  `assets/credits.json`.
- [pretext](https://github.com/chenglou/pretext) by Cheng Lou, MIT (`vendor/pretext`, unmodified,
  with its `LICENSE` and `VERSION`).
- Demo texts: the King James Version and the Clementine Vulgate (public domain): the Lord's Prayer
  (Matthew 6, Luke 11; Canon V), John 1:1–14, the feeding of the five thousand (Canon I). The plans
  table was written for the demo.
