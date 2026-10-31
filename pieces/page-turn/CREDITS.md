# Credits: page-turn

The code written for this piece is MIT licensed (see LICENSE). The images,
sounds and third-party code it uses keep their own licences, listed here.

## Images and media

- **Oriental hyacinths (Hyacinthus orientalis, three forms) and spring crocus**, Basilius Besler (1561–1629), publisher; engraved after drawings made in the Eichstätt garden; coloured by hand, 1613. Source: Wikimedia Commons. <https://commons.wikimedia.org/wiki/File:Hyacinthus_orientalis_floreduplici-Hyacinthus_orientalis_violaceo_albislienis-Crocus_vernus_albus_fundo_violaceo-Hyacinthus_orientalis_reflexis_folys_colore_violaceo.jpg>  
  Licence: Public domain.  
  Changes: Processed: the scan's own paper divided out to white and its edges feathered, to be printed with multiply onto the book's paper.  
  File: `assets/hyacinth.webp`
- **Tulips (Tulipa, five forms)**, Basilius Besler (1561–1629), publisher; engraved after drawings made in the Eichstätt garden; coloured by hand, 1613. Source: Wikimedia Commons. <https://commons.wikimedia.org/wiki/File:Besler_H.E._tulipa_1.jpg>  
  Licence: Public domain.  
  Changes: Processed: the scan's own paper divided out to white and its edges feathered, to be printed with multiply onto the book's paper.  
  File: `assets/tulip.webp`
- **Double marsh marigold (Caltha palustris flore multiplici), with spring gentian and dog violet**, Basilius Besler (1561–1629), publisher; engraved after drawings made in the Eichstätt garden; coloured by hand, 1613. Source: Wikimedia Commons. <https://commons.wikimedia.org/wiki/File:Basilius_Besler-Caltha_palustris_flore.jpg>  
  Licence: Public domain.  
  Changes: Processed: the scan's own paper divided out to white and its edges feathered, to be printed with multiply onto the book's paper.  
  File: `assets/marsh-marigold.webp`
- **Stinking iris (Spatula foetida), with cross gentian and Orlaya (Caucalis)**, Basilius Besler (1561–1629), publisher; engraved after drawings made in the Eichstätt garden; coloured by hand, 1613. Source: Wikimedia Commons. <https://commons.wikimedia.org/wiki/File:Hortus_Eystettensis_vol1_page_260.jpg>  
  Licence: Public domain.  
  Changes: Processed: the scan's own paper divided out to white and its edges feathered, to be printed with multiply onto the book's paper.  
  File: `assets/stinking-iris.webp`
- **Snapdragons (Antirrhinum, three forms)**, Basilius Besler (1561–1629), publisher; engraved after drawings made in the Eichstätt garden; coloured by hand, 1613. Source: Wikimedia Commons. <https://commons.wikimedia.org/wiki/File:Antirrhinum_sylvestre-Antirrhinum_flore_albo-Antirrhinum_floumbro.jpg>  
  Licence: Public domain.  
  Changes: Processed: the scan's own paper divided out to white and its edges feathered, to be printed with multiply onto the book's paper.  
  File: `assets/snapdragon.webp`
- **Birthworts (Aristolochia longa, A. rotunda) and Perfoliata**, Basilius Besler (1561–1629), publisher; engraved after drawings made in the Eichstätt garden; coloured by hand, 1613. Source: Wikimedia Commons. <https://commons.wikimedia.org/wiki/File:Aristolochia_longa_vulgaris-Aristolochia_rotunda-Perfoliata.jpg>  
  Licence: Public domain.  
  Changes: Processed: the scan's own paper divided out to white and its edges feathered, to be printed with multiply onto the book's paper.  
  File: `assets/birthwort.webp`
- **Large sunflower (Flos Solis maior), plate 1 from part 5**, Basilius Besler (1561–1629), publisher; engraved after drawings made in the Eichstätt garden; coloured by hand, 1713 edition. Source: Wikimedia Commons. <https://commons.wikimedia.org/wiki/File:Unidentified_artist_-_Large_Sunflower_(Flos_Solis_Maior),_plate_1_from_part_5,_B._Besler,_%22Hortus_Eystettensis%22,_1713_edit..._-_Google_Art_Project.jpg>  
  Licence: Public domain.  
  Changes: Processed: the scan's own paper divided out to white and its edges feathered, to be printed with multiply onto the book's paper.  
  File: `assets/sunflower.webp`
- **Potato (Papas Peruanorum), with lemon thyme and wild thyme**, Basilius Besler (1561–1629), publisher; engraved after drawings made in the Eichstätt garden; coloured by hand, 1613. Source: Wikimedia Commons. <https://commons.wikimedia.org/wiki/File:Papas_Peruanorum.png>  
  Licence: Public domain.  
  Changes: Processed: the scan's own paper divided out to white and its edges feathered, to be printed with multiply onto the book's paper.  
  File: `assets/potato.webp`
- **pretext**, Cheng Lou. <https://github.com/chenglou/pretext>  
  Licence: MIT.  
  File: `vendor/pretext`
- **US English hyphenation patterns (hyph_en_US.dic, 2011-10-07)**, Donald E. Knuth (hyphen.tex), TeX Users Group (TUGboat exceptions), László Németh (conversion). <https://hunspell.github.io/>  
  Licence: hyphen.tex: unlimited copying and redistribution permitted; exceptions: free to use, modify and distribute.  
  File: `vendor/hyphen/en-us.js`

## Third-party code

- **hyphen** (`vendor/hyphen/`): BSD. hyph_en_US.dic 2011-10-07 (LibreOffice dict-en), from Knuth's hyphen.tex + TUGboat exceptions. Plain a-z patterns only; LEFTHYPHENMIN 2, RIGHTHYPHENMIN 3.
- **pretext** (`vendor/pretext/`): MIT · Copyright (c) 2026 Pretext contributors. @chenglou/pretext v0.0.8 — https://github.com/chenglou/pretext

## From the README

- [pretext](https://github.com/chenglou/pretext) by Cheng Lou, MIT
  (`vendor/pretext`, unmodified, with its `LICENSE` and `VERSION`).
- Hyphenation patterns: Knuth's `hyphen.tex` with the TUGboat exceptions, as
  `hyph_en_US.dic` from LibreOffice's dictionaries (unlimited copying and
  redistribution permitted); `vendor/hyphen/en-us.js` keeps the plain a-z
  patterns, with `LICENSE` and `VERSION`.
- Plates: Basilius Besler, *Hortus Eystettensis* (Nuremberg, 1613; the
  sunflower from the 1713 edition), hand-coloured copies, public domain, via
  Wikimedia Commons. Each was flattened to an ink layer (its paper divided
  out, uneven light evened, edges feathered) by a script outside the
  component. See `assets/credits.json`.
- The text was written for this component.
- The page model follows the cylinder construction of the page-curl
  literature and Hong et al., *Turning Pages of 3D Electronic Books* (2006),
  for the cone; no code is taken from either.
