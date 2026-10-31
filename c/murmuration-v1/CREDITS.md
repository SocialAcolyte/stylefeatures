# Credits: murmuration

The code written for this piece is MIT licensed (see LICENSE). The images,
sounds and third-party code it uses keep their own licences, listed here.

## Images and media

- **Dusk over a wetland (backdrop)**, 2026. Source: Generated with Midjourney for Taste (job 7158e52b-883e-458c-bc65-1e080907e1d0, variant 3).  
  Licence: Generated with Midjourney for Taste.  
  Changes: 1680x720 PNG converted to webp (q84). The horizon (84.7% down), the run of trees used as the roost (64-99% across) and the tree tops (77.5% down) were measured from the image.  
  File: `assets/dusk.webp`
- **Dusk over a wetland (phone crop)**. Source: Generated with Midjourney for Taste (as above).  
  Licence: Generated with Midjourney for Taste.  
  Changes: A 720x720 square crop of the same image starting 56.5% across, centred over the trees, for tall screens.  
  File: `assets/dusk-narrow.webp`
- **Treeline and field cut-out**. Source: Derived from assets/dusk.webp.  
  Licence: Generated with Midjourney for Taste.  
  Changes: Alpha matte of everything darker than the sky in its own row (soft threshold at 80% of the row's sky luminance, colours un-mixed from the sky at the edges); everything below the horizon is opaque. Drawn in front of the birds so they go down into the trees. dusk-narrow-land.webp is the same crop as dusk-narrow.webp.  
  File: `assets/dusk-land.webp`
- **Wing roar (a flock taking off)**. Source: Synthesised for this component in Python/numpy.  
  Licence: Original, no recording.  
  Changes: 260 overlapping bursts of 10-15 Hz wingbeats over pink noise, band-passed 300-4200 Hz, 1.9 s. Played on murmuration:scatter. The continuous wing rush is synthesised live in murmuration.js (pink noise, Paul Kellet's filter).  
  File: `assets/sounds/wing-roar.wav`
- **Twilight in the Wilderness, Frederic Edwin Church, 1860**. Source: The Cleveland Museum of Art, 1965.233. <https://clevelandart.org/art/1965.233>  
  Licence: CC0 (Cleveland Museum of Art Open Access).  
  Changes: Not shipped. Eight colours sampled from the clear parts of its sky (median of patches), lightened in linear light by 1.3-1.7x to undo the darkened varnish; used for the drawn sky when no photograph is used or it fails to load.  
  File: `assets/(fallback sky, assets/data-src="none")`

## Sound

- `assets/sounds/wing-roar.wav`: Synthesised for this component (numpy): 260 overlapping bursts of ~12 Hz wingbeats over pink noise, band-passed 300-4200 Hz. No recording.

## From the README

No libraries (`tilt.js` and `sound.js` are the house helpers, copied in).
The backdrop was generated with Midjourney for Taste; the treeline cut-out is
derived from it. The drawn fallback sky's colours are sampled from Frederic
Edwin Church, *Twilight in the Wilderness* (1860, Cleveland Museum of Art,
CC0). Sounds are synthesised. See `assets/credits.json`.

Ballerini et al. 2008, *Interaction ruling animal collective behavior depends
on topological rather than metric distance*, PNAS 105. Ballerini et al. 2008,
*Empirical investigation of starling flocks*, Animal Behaviour 76. Cavagna et
al. 2010, *Scale-free correlations in starling flocks*, PNAS 107. Hildenbrandt,
Carere & Hemelrijk 2010, *Self-organized aerial displays of thousands of
starlings: a model*, Behavioral Ecology 21. Procaccini et al. 2011,
*Propagating waves in starling, Sturnus vulgaris, flocks under predation*,
Animal Behaviour 82. Attanasi et al. 2014, *Information transfer and
behavioural inertia in starling flocks*, Nature Physics 10. Hemelrijk, van
Zuidam & Hildenbrandt 2015, *What underlies waves of agitation in starling
flocks*, Behavioral Ecology and Sociobiology 69.
