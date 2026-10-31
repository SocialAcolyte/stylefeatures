# Credits: marble-relight

The code written for this piece is MIT licensed (see LICENSE). The images,
sounds and third-party code it uses keep their own licences, listed here.

## Images and media

- **Marble head of an athlete**, Roman, copy of a Greek work, Mid-Imperial, Antonine, ca. 138–192 CE. <https://www.metmuseum.org/art/collection/search/248579>  
  Licence: CC0 (The Metropolitan Museum of Art, Open Access).  
  Changes: Cut out from its backdrop and post; the albedo, normal/height and aux (wide normal, thickness, polish) maps were derived offline from this single photograph, with Depth Anything V2 Small (Apache-2.0) for the large form.  
  File: `assets/athlete.webp, assets/athlete-albedo.webp, assets/athlete-normal.png, assets/athlete-aux.png`

## From the README

- Photograph: *Marble head of an athlete*, Roman, Antonine, ca. 138–192 CE,
  The Metropolitan Museum of Art (248579), Open Access, CC0. Details in
  `assets/credits.json`.
- Depth: Depth Anything V2 Small (Yang et al., 2024; Apache-2.0), run
  offline; nothing of it ships.
- Shading after pre-integrated skin shading (Penner, 2011) and the
  wrap-lighting and thickness-map translucency of real-time SSS (Green, GPU
  Gems 1; Barré-Brisebois and Bouchard, 2011). No third-party code in the
  component.
