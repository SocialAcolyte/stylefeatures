# Credits: chladni-slider

The code written for this piece is MIT licensed (see LICENSE). The images,
sounds and third-party code it uses keep their own licences, listed here.

## Images and media

- **Tab. VIII (figures 87-106), from Entdeckungen über die Theorie des Klanges**, Ernst Florens Friedrich Chladni (figures); engraved by Capieux ("Capieux sculps. 1786"), 1787 (Leipzig: Weidmanns Erben und Reich); plate dated 1786. Source: Getty Research Institute copy, digitised by the Internet Archive. <https://archive.org/details/entdeckungenuber00chla>  
  Licence: Public domain (published 1787).  
  Changes: Leaf n106 of the 500 ppi scan, 3170 x 3961, unaltered apart from re-encoding as WebP q90. This is the finished sheet the piece ends on.  
  File: `assets/tab8.webp`
- **The same sheet before printing (derived)**. Source: Derived from tab8.webp.  
  Licence: Public domain (derivative of a public-domain scan).  
  Changes: Every ink pixel (and an 11 px halo) replaced by real paper texture copied from a clean offset nearby, colour-matched to the local paper by a normalised Gaussian estimate and feathered into the scan. Outside the ink it is the scan.  
  File: `assets/tab8-paper.webp`
- **Ink classes and arrival times (derived, lossless)**. Source: Derived from tab8.webp.  
  Licence: Public domain (derivative).  
  Changes: Half resolution. R: time inside its stage (0-254). G: class (1-20 nodal lines of figs 87-106, 21-40 the plate squares, 41-60 numbers and letters, 61 border, 62 title and engraver's line, 0 paper).  
  File: `assets/tab8-times.webp`
- **Sand fields for the twenty plates (derived, lossless)**. Source: Derived from tab8.webp.  
  Licence: Public domain (derivative).  
  Changes: 5 x 4 tiles of 128 x 128 over each plate's interior. R: vibration amplitude stand-in (0 on Chladni's lines, 1 on the ridges between them and at the free edge). G: arrival time of the nearest line ink. B: the line mask at tile resolution.  
  File: `assets/tab8-sand.webp`

## From the README

The sheet: Chladni, *Entdeckungen über die Theorie des Klanges*, Leipzig 1787, Tab. VIII,
engraved by Capieux; Getty Research Institute copy, scanned by the Internet Archive
(`entdeckungenuber00chla`), public domain. Details in `assets/credits.json`.
