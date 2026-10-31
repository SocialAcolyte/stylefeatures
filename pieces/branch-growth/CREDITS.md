# Credits: branch-growth

The code written for this piece is MIT licensed (see LICENSE). The images,
sounds and third-party code it uses keep their own licences, listed here.

## Images and media

- **Plum blossoms (album of twelve leaves), leaf dated 1757**, Jin Nong (1687–1773). Source: The Metropolitan Museum of Art, Open Access, object 36432. <https://www.metmuseum.org/art/collection/search/36432>  
  Licence: CC0 (public domain).  
  Changes: data texture, not a picture: R = ink density of an 86 x 256 px patch of the painted trunk (paper level 222, ink 40), normalised to mean 1 and turned to run along x; G = high-pass grain of a blank patch of the same paper (two 128 x 64 crops); B = R blurred 2.2 px  
  File: `assets/ink-texture.png`
- **Plum blossoms (album of twelve leaves), leaf dated 1757**, Jin Nong (1687–1773). Source: The Metropolitan Museum of Art, Open Access, object 36432. <https://www.metmuseum.org/art/collection/search/36432>  
  Licence: CC0 (public domain).  
  Changes: fourteen of the painter's moss dots, each cut out as its own connected dark blob and stored as ink density (grey = alpha) in a 4 x 4 grid of 64 px cells  
  File: `assets/moss-dots.png`
- **Blossoming plum, dated 1759**, Jin Nong (1687–1773). Source: The Metropolitan Museum of Art, Open Access, object 49243. <https://www.metmuseum.org/art/collection/search/49243>  
  Licence: CC0 (public domain).  
  Changes: studied for the outline blossoms, stamens and young shoots; nothing copied  
  File: `assets/(reference, assets/not shipped)`
- **Fragrant Snow at Broken Bridge**, Wang Mian (1287–1359). Source: The Metropolitan Museum of Art, Open Access, object 40080. <https://www.metmuseum.org/art/collection/search/40080>  
  Licence: CC0 (public domain).  
  Changes: studied for the hanging old wood and rising whips; nothing copied  
  File: `assets/(reference, assets/not shipped)`

## From the README

- Ink texture, paper grain and moss dots sampled from Jin Nong, *Plum
  blossoms*, album leaf dated 1757, The Metropolitan Museum of Art (CC0).
  Jin Nong's *Blossoming plum* (1759) and Wang Mian's *Fragrant Snow at Broken
  Bridge* (Met, CC0) were the references for the blossoms and the hanging old
  wood. Details in `assets/credits.json`.
- Adam Runions, Brendan Lane and Przemyslaw Prusinkiewicz, "Modeling Trees with
  a Space Colonization Algorithm" (Eurographics Workshop on Natural Phenomena,
  2007). Christophe Eloy, "Leonardo's rule, self-similarity and wind-induced
  stresses in trees" (Physical Review Letters, 2011). No third-party code.
- The essay in `demo.html` is original.
