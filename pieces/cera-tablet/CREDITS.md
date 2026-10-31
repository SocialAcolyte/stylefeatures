# Credits: cera-tablet

The code written for this piece is MIT licensed (see LICENSE). The images,
sounds and third-party code it uses keep their own licences, listed here.

## Images and media

- **Wooden Writing Tablets (leaf 14.2.4b, written face)**, 500–700. Source: The Metropolitan Museum of Art, object 473393, accession 14.2.4a–d, Rogers Fund, 1914. <https://www.metmuseum.org/art/collection/search/473393>  
  Licence: CC0 (The Metropolitan Museum of Art, Open Access).  
  Changes: 2655x4000 museum photograph. Cut off the studio grey by colour (tools/cut-leaves.py), a crisp antialiased edge 2px inside the keyed one, scaled to 1752px, a tight drawn shadow (lamp at the upper left) in a 26px margin; leaf-land is the same turned a quarter clockwise. The Greek writing is the tablet's own. WebP q86.  
  File: `assets/leaf-l.webp, assets/leaf-land.webp`
- **Wooden Writing Tablets (leaf 14.2.4d, smooth face)**, 500–700. Source: The Metropolitan Museum of Art, object 473393, accession 14.2.4a–d, Rogers Fund, 1914. <https://www.metmuseum.org/art/collection/search/473393>  
  Licence: CC0 (The Metropolitan Museum of Art, Open Access).  
  Changes: 2674x4000 museum photograph, processed as above. The wax panel is the albedo under the lit heightfield.  
  File: `assets/leaf-r.webp, assets/leaf-land-r.webp`
- **Wooden Writing Tablets (leaf 14.2.4d, other face)**, 500–700. Source: The Metropolitan Museum of Art, object 473393, accession 14.2.4a–d, Rogers Fund, 1914. <https://www.metmuseum.org/art/collection/search/473393>  
  Licence: CC0 (The Metropolitan Museum of Art, Open Access).  
  Changes: 2644x4000 museum photograph, processed as above and turned a quarter clockwise to lie landscape.  
  File: `assets/leaf-one.webp`
- **Bronze stylus**, 4th–1st century BCE. Source: The Metropolitan Museum of Art, object 244374, accession 74.51.5495, The Cesnola Collection. <https://www.metmuseum.org/art/collection/search/244374>  
  Licence: CC0 (The Metropolitan Museum of Art, Open Access).  
  Changes: Reference for the drawn stylus (point, banded shaft, flat spatula end).
- **The incised hand and its metrics font**. Source: Drawn for this component; font built by tools/build-font.py with fontTools.  
  Licence: Same as the component.  
  Changes: Single-stroke letterforms after the cursive scratched into wax tablets (the Met tablet's own Greek leaf, Vindolanda stylus tablets, the Pompeian tablets of Caecilius Iucundus): angular turns, long ascenders and descenders, each stroke entering blunt and lifting to a hairline. Kept legible as English. The font has no outlines, only advances.  
  File: `assets/cera-metrics.woff, assets/glyphs.json`
- **Spatula rub, warming hiss**. Source: Synthesised in code (tools/make-sounds.py), no recordings.  
  Licence: Same as the component.  
  File: `assets/sounds/spatula.wav, assets/sounds/warm.wav`

## Sound

- `assets/sounds/spatula.wav`: synthesised in code (tools/make-sounds.py): band-limited noise under a swell, no recording
- `assets/sounds/warm.wav`: synthesised in code (tools/make-sounds.py): low hiss with small crackles, no recording

## From the README

The leaves: *Wooden Writing Tablets*, Coptic, Byzantine Egypt, 500–700, wood
and wax, The Metropolitan Museum of Art, 14.2.4a–d, Rogers Fund, 1914, CC0
(Open Access). Leaf b's written face, leaf d's two faces. Cut out, shadowed
and turned by `tools/cut-leaves.py`; nothing else in the photographs is
changed. The stylus is drawn after the Met's Cypriot bronze stylus
(74.51.5495, CC0), a reference only. Letterforms drawn for this component;
metrics font built with fontTools. Sounds synthesised in code. `tilt.js` and
`sound.js` are the shared Taste copies. No libraries at runtime.

`tools/` holds the small build scripts (Python, not needed at runtime):
`build-font.py` (the metrics font, needs fontTools), `cut-leaves.py` (the
leaves from the Met's photographs, needs Pillow, NumPy and SciPy) and
`make-sounds.py` (the two event sounds).
