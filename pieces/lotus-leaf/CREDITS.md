# Credits: lotus-leaf

The code written for this piece is MIT licensed (see LICENSE). The images,
sounds and third-party code it uses keep their own licences, listed here.

## Images and media

- **Nelumbo nucifera Himeji 03**, Syrio, photograph, Himeji, Japan. <https://commons.wikimedia.org/wiki/File:Nelumbo_nucifera_Himeji_03.jpg>  
  Licence: CC BY-SA 4.0.  
  Changes: Cut out along the leaf's own rim (polar dynamic-programming edge trace from the navel, a short straight run fixed by hand at the upper left where the trace wandered into the leaf behind, gaps showing background at the rim nibbled in), edge colours pulled from just inside the rim, cropped and scaled to 2000 px wide. Colour graded in the shader, not in the file. Library copy: library/ornaments/botanical/nelumbo-nucifera-himeji-03.webp  
  File: `assets/lotus-leaf.webp`
- **Nelumbo nucifera feuille**, Dinkum, photograph. <https://commons.wikimedia.org/wiki/File:Nelumbo_nucifera_feuille.JPG>  
  Licence: CC0.  
  Changes: Cut out along the leaf's rim the same way (polar edge trace from the navel, held to an ellipse band because the neighbouring leaves are the same green; a torn flap at the right left out). Hue-shifted toward blue-green in the shader. Library copy: library/ornaments/botanical/nelumbo-nucifera-feuille.webp  
  File: `assets/lotus-leaf-2.webp`
- **Nelumbo nucifera, bud (iNaturalist observation 408004236)**, Md. Tayhid Hasan, photograph. <https://www.inaturalist.org/photos/749898324>  
  Licence: CC BY 4.0.  
  Changes: The pink bud cut out from its green background (colour key, largest component, soft 1.6 px edge, edge colours pulled from inside); its pale base is left out and hidden under a leaf in the layout.  
  File: `assets/lotus-bud.webp`

## Sound

- `assets/sounds/tick.mp3`: "Water drops dripping" by ZooFari, CC BY-SA 3.0, https://commons.wikimedia.org/wiki/File:Water_drops_dripping.ogg
- `assets/sounds/runoff.mp3`: "Water drops dripping" by ZooFari, CC BY-SA 3.0, https://commons.wikimedia.org/wiki/File:Water_drops_dripping.ogg

## From the README

- Leaves: *Nelumbo nucifera Himeji 03*, photograph by Syrio, Wikimedia
  Commons, CC BY-SA 4.0; *Nelumbo nucifera feuille*, photograph by Dinkum,
  Wikimedia Commons, CC0. Details in `assets/credits.json`.
- Physics after W. Barthlott and C. Neinhuis, "Purity of the sacred lotus, or
  escape from contamination in biological surfaces", *Planta* 202 (1997), and
  D. Richard, C. Clanet and D. Quéré, "Contact time of a bouncing drop",
  *Nature* 417 (2002). No third-party code.
- Bud: photograph by Md. Tayhid Hasan, iNaturalist, CC BY 4.0.
