# Credits: volvelle-button

The code written for this piece is MIT licensed (see LICENSE). The images,
sounds and third-party code it uses keep their own licences, listed here.

## Images and media

- **The first dragon volvelle (lunar latitude: Caput and Cauda Draconis), from Astronomicum Caesareum**, Petrus Apianus (Peter Apian), with Georg Apian; printed, hand-coloured and assembled in the Apians' workshop, 1540. Source: National Library of Poland (Polona, object 149346690), via Wikimedia Commons; public domain. <https://commons.wikimedia.org/wiki/File:Astronomicum_Caesareum._1540_(149346690).jpg>  
  Licence: Public domain (author died 1552).  
  Changes: The button's roundel: the paper disc and the ring of the mater it turns on, cut round on the outer rule of the printed zodiac (781.5 px on the 1600 px plate, about the mater's printed centre) and scaled to 384 px across by one premultiplied Lanczos resample (tools/face.py). face.webp is the plate itself inside that circle, the disc at home; ring.webp is dragon-volvelle's restored mater (the annulus the turning disc can uncover, restored there from the same printed signs a third or a sixth of the way round); disc.webp is dragon-volvelle's paper disc with its two tabs, CAPVT and CAVDA, and the shadows they cast. Nothing drawn or recoloured. volvelle.json is the geometry in face pixels.  
  File: `assets/face.webp, assets/ring.webp, assets/disc.webp`
- **Fonts (demo only)**.  
  Changes: demo.html sets its words in Inter and Cormorant Garamond from Google Fonts (SIL Open Font License 1.1). The button itself uses the page's --sans.
- **References (not used as images)**.  
  Changes: Lars Gislén, 'A commentary on the volvelles in Petrus Apianus' Astronomicum Caesareum' (2018), the Latitude of the Moon: one disc on the mater with tabs CAPVT and CAVDA, year marks and the arched latitude scales., Library of Congress, Bibliomania, 'Dragons in the Astronomicum Caesareum' (2025): Apian coloured, cut and assembled the instruments himself; the layers are tied together at the centre.

## From the README

*Astronomicum Caesareum*, Petrus Apianus, Ingolstadt 1540, the first dragon volvelle. The copy in the National
Library of Poland (Polona), public domain, via Wikimedia Commons. The roundel is cut from `dragon-volvelle`'s own
cut of that scan (see its `assets/PICK.md` and `tools/`). The demo sets its words in Inter and Cormorant
Garamond from Google Fonts (SIL Open Font License). See `assets/credits.json`.
