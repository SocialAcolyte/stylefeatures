# Credits: coral-reef

The code written for this piece is MIT licensed (see LICENSE). The images,
sounds and third-party code it uses keep their own licences, listed here.

## Images and media

- **Great Barrier Reef Corals (Chromo V)**, William Saville-Kent (drawn and painted from life); chromolithograph printed by Riddle & Couchman, London, 1893. Source: W. Saville-Kent, The Great Barrier Reef of Australia: its products and potentialities (London: W. H. Allen & Co., 1893). Smithsonian Libraries copy, digitised by the Internet Archive / Biodiversity Heritage Library.. <https://archive.org/details/GreatBarrierRee00Kent>  
  Licence: Public domain (published 1893; the artist died in 1908).  
  Changes: Leaf 0090 JP2, 5751x7581. Cropped to the sheet inside the binding (the gutter, ribbon and page curl removed; a sliver of the toned fore-edge trimmed), about 4734x6991, resampled to 1800x2658 (Lanczos), WebP q90. This file is the finished state, and the last frame of the piece equals it.  
  File: `assets/reef.webp`
- **The thirteen stones (coverage maps)**. Source: Derived from reef.webp's source scan.  
  Licence: Public domain (derivative of a public-domain work).  
  Changes: The scan unmixed in optical density against its own paper into twelve inks (sparse dictionary learning, at most two inks per pixel), plus a key stone split from the dark inks' line work and the margin lettering. One 8-bit greyscale WebP per stone (q62); each stone's ink colour and scale are in reef.json.  
  File: `assets/reef-g0.webp ... reef-g12.webp`
- **The scraper's line and the ink's drying (time map)**. Source: Made for this component.  
  Licence: Public domain dedication.  
  Changes: Lossless WebP, half size. R: when the scraper's line reaches each point (down the sheet, slightly bowed, with the damp sheet's cockle). G: how long the fresh ink stays wet there (heavier deposits longer).  
  File: `assets/reef-time.webp`
- **Stone list, ink colours, paper field, timings**. Source: Made for this component.  
  Licence: Public domain dedication.  
  File: `assets/reef.json`

## From the README

William Saville-Kent, *Great Barrier Reef Corals* (Chromo V), chromolithograph printed by
Riddle & Couchman, London, in *The Great Barrier Reef of Australia*, 1893. Smithsonian
Libraries copy via the Internet Archive and the Biodiversity Heritage Library. Public domain.
The separation into stones, the key and the time map are ours. No third-party code.
