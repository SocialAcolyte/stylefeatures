# Credits: elephant-clock

The code written for this piece is MIT licensed (see LICENSE). The images,
sounds and third-party code it uses keep their own licences, listed here.

## Images and media

- **"The Elephant Clock", folio from a Book of the Knowledge of Ingenious Mechanical Devices by al-Jazari**, Farrukh ibn `Abd al-Latif (painter), for a copy of the treatise of Badi' al-Zaman ibn al-Razzaz al-Jazari (1206), dated 715 AH / 1315 CE. Source: The Metropolitan Museum of Art, Open Access (CC0), 57.51.23, Bequest of Cora Timken Burnett, 1956. <https://www.metmuseum.org/art/collection/search/451402>  
  Licence: CC0 1.0 (public domain).  
  Changes: Cut off its mount; moving parts (scribe, serpent, bird, balcony man, the mahout's two arms, the cymbal) cut along the painter's ink lines; what they covered restored from the folio's own pixels (the pillar's own shaft, the coil carried round in polar coordinates, the folio's bare paper for fibre and tone). Scaled to 1600 px. Other views of the folio (DT459, ISL151, 57.51.23, is57.51.23.R: earlier photographs before conservation) were compared; DP234075 is the sharpest and the only one used.  
  File: `assets/folio.webp, assets/parts.webp (all parts, clean patches, occluders)`
- **"Design for the Water Clock of the Peacocks", from the same manuscript**, Farrukh ibn `Abd al-Latif (attrib.), al-Jazari, dated 715 AH / 1315 CE. Source: The Metropolitan Museum of Art, Open Access (CC0), 55.121.15, Rogers Fund, 1955. <https://www.metmuseum.org/art/collection/search/451302>  
  Licence: CC0 1.0 (public domain).  
  Changes: The gold disc painted on the pipe at the right (centre about 2056, 2023 px, radius 101), cut out as a circle and scaled to the size of the falcon's beak: the clock's bronze balls, in this painter's gold.  
  File: `assets/parts.webp (the ball)`
- **Sister folios of the same manuscript: paper grain for the restoration, and references**. Source: The Metropolitan Museum of Art, Open Access (CC0).  
  Changes: 55.121.13 (the mahout, with the pivots of his arms and the spoon: where the axe arm's axle goes; its bare left and right margins, DP351397 x150-470/2350-2700, y1350-2650, give paper grain) and 55.121.15 (the Peacocks, DP369551 x2300-2640, y2600-3500, paper grain); 55.121.14, 55.121.12, 55.121.11 compared for the ink, the gold and the paper. Grain is high-passed and contrast-matched; only its texture is used.  
  File: `assets/parts.webp (the clean patches: paper fibre and mottle)`
- **The mechanism**. Source: Ibn al-Razzaz al-Jazari, The Book of Knowledge of Ingenious Mechanical Devices, translated and annotated by Donald R. Hill (Dordrecht: D. Reidel, 1974), Category I, chapter 4 (the elephant water-clock, 15 sections).  
  Changes: Every pivot, the order of events and the setting of the clock (sec. 15) follow this text.
- **Small Bell #2**, steffcaffrey. Source: Freesound, via the earshot bank (fit/bell/small_bell, a model fitted to the recording). <https://freesound.org/people/steffcaffrey/sounds/452379/>  
  Licence: CC0 1.0.  
  Changes: rendered at 2150 Hz, 1.6 s: the white-bronze cymbal  
  File: `assets/sounds/cymbal.wav`
- **Bamboo hit**, michorvath. Source: Freesound, via the earshot bank (fit/hit/bamboo_tok, a model fitted to the recording). <https://freesound.org/people/michorvath/sounds/386888/>  
  Licence: CC0 1.0.  
  Changes: the axe and the mallet on the hollow copper head  
  File: `assets/sounds/knock.wav`

## Sound

- `assets/sounds/cymbal.wav`: earshot bank fit/bell/small_bell, fitted from "Small Bell #2" by steffcaffrey (CC0 1.0, freesound.org/people/steffcaffrey/sounds/452379/), lowered to 2150 Hz: the white-bronze cymbal struck on its edge by the ball
- `assets/sounds/knock.wav`: earshot bank fit/hit/bamboo_tok, fitted from "Bamboo hit" by michorvath (CC0 1.0, freesound.org/people/michorvath/sounds/386888/): the axe and the mallet on the hollow copper head

## From the README

The folio: *The Elephant Clock*, folio from a *Book of the Knowledge of Ingenious Mechanical Devices* by al-Jazari,
Farrukh ibn ʿAbd al-Latif, probably Syria or Iraq, dated 715 AH / 1315 CE. The Metropolitan Museum of Art, 57.51.23, Bequest of Cora
Timken Burnett, 1956, CC0. The ball: the gold disc of *Design for the Water Clock of the Peacocks* from the same
manuscript, Met 55.121.15, CC0. Sister folios 55.121.13 (the mahout with his pivoted arms and the spoon) and
55.121.11–14 were references for the mechanism and the hand. See `assets/credits.json`.

Sounds (off until turned on, `sound.js`): the cymbal is earshot's `fit/bell/small_bell`, fitted from "Small Bell #2" by
steffcaffrey (CC0); the blows are `fit/hit/bamboo_tok`, fitted from "Bamboo hit" by michorvath (CC0). See `sounds.json`.

Reference: Ibn al-Razzaz al-Jazari, *The Book of Knowledge of Ingenious Mechanical Devices*, translated and
annotated by Donald R. Hill (Dordrecht: Reidel, 1974), Category I, chapter 4.
