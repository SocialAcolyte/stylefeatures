# Credits: mimosa-switch

The code written for this piece is MIT licensed (see LICENSE). The images,
sounds and third-party code it uses keep their own licences, listed here.

## Images and media

- **The Sensitive Plant**, Maria Edgar, 1808. Source: The Metropolitan Museum of Art, object 10838, accession 11.60.179 (Bequest of Maria P. James, 1910). <https://www.metmuseum.org/art/collection/search/10838>  
  Licence: CC0 (The Metropolitan Museum of Art, Open Access).  
  Changes: Resized from 1576 x 2037 to 900px wide, webp q82. Shown in the demo only; the component uses no images.  
  File: `assets/sensitive-plant-edgar-1808.webp`
- **Leaflet rustle (full and weak fold)**, 2026. Source: Synthesised for Taste in numpy: band-passed noise grains (2.2 to 9 kHz) over a soft air bed, crowded toward the start like the arriving wave.  
  Licence: Original, made for this component (no recording).  
  Changes: Script kept in the builder's scratch folder; 44.1 kHz mono 16-bit.  
  File: `assets/sounds/rustle.wav, assets/sounds/rustle-soft.wav`
- **Mimosa pudica frond, specimen photograph**, 2026. Source: Generated with Midjourney for Taste.  
  Licence: Generated for the owner.  
  Changes: Used only as a colour reference: leaflet greens were sampled from its pixels (10th/50th/90th percentile of leaf pixels, roughly #2e4c1d, #4b6a1d, #748f3a) and the reddish pulvini and paler rachis were matched by eye. Its leaf architecture is wrong (eight pinnae; the real plant has one or two pairs held digitately at the petiole tip), so none of its geometry or pixels is used.  
  File: `(not shipped) mj/mimosa-toggle/b0201920_0..3.png`

## Sound

- `assets/sounds/rustle.wav`: Synthesised for Taste in numpy (70 band-passed noise grains, 2.2 to 9 kHz, over a soft air bed), no recording
- `assets/sounds/rustle-soft.wav`: Synthesised for Taste in numpy (16 grains), no recording

## From the README

No libraries. The demo's watercolour, Maria Edgar's *The Sensitive Plant*
(1808), is from The Metropolitan Museum of Art's Open Access collection (CC0).
The leaflet colours were sampled from Midjourney images generated for Taste;
their leaf architecture was wrong (eight pinnae), so the structure is modelled
from botanical descriptions instead. The rustle is synthesised. See
`assets/credits.json`.

References: M. Gagliano, M. Renton, M. Depczynski, S. Mancuso, "Experience
teaches plants to learn faster and forget slower in environments where it
matters", *Oecologia* 175 (2014) 63-72. T. Sibaoka, "Rapid plant movements
triggered by action potentials", *Botanical Magazine Tokyo* 104 (1991) 73-95.
