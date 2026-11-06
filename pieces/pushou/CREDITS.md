# Credits: pushou

The code written for this piece is MIT licensed (see LICENSE). The images,
sounds and third-party code it uses keep their own licences, listed here.

## Images and media

- **Mask and ring handle**, unknown bronze caster, 5th-4th century BCE, Eastern Zhou dynasty, Warring States period. Source: National Museum of Asian Art, Smithsonian Institution, Freer Gallery of Art Collection, F1917.18, Gift of Charles Lang Freer (purchased from Li Wenqing, New York, 1917). Smithsonian Open Access. <https://asia.si.edu/object/F1917.18/>  
  Licence: CC0 1.0 (public domain).  
  Changes: Matted off the museum's white sweep at full resolution (tools/matte_fine.py: BiRefNet for what is object, then each edge solved against the sweep and unmixed from it). Cut into three parts on one canvas (tools/parts.py): the ring along its own edges (traced at 3x where its band crosses the mask), the nose loop that lies in front of it, and the plate. Where the ring's band covers the mask's lower edge, the mask is continued behind it (its outline by a harmonic fill of its own alpha; its surface, in the strip the lifted ring can uncover, by exemplar from the mask's own lower cheeks, never from the inlay). At rest the three parts recombine to the photograph within 1/255. Uniform Lanczos downscales to 1207, 480 and 168 px tall. Nothing is redrawn, recoloured or warped; the ring only turns as a rigid plane about its hinge in the browser.  
  File: `assets/plate-1207.webp, assets/plate-480.webp, assets/plate-168.webp, assets/ring-1207.webp, assets/ring-480.webp, assets/ring-168.webp, assets/loop-1207.webp, assets/loop-480.webp, assets/loop-168.webp`
- **Other candidates (the hunt)**. Source: 47 candidates from the Freer|Sackler, the Met, the Art Institute of Chicago, the Cleveland Museum of Art and Wikimedia Commons.  
  Changes: Shortlist, contact sheet and reasons in assets/PICK.md; every candidate with source and licence in tools/engine/jobs/pushou-work/candidates.json. First fallbacks: the Met's Ring Handle with Mask 1985.214.47 and the Freer's pair F1915.81/.82.
- **Door knocker audio**, Mx. Granger (Wikimedia Commons user), own work. Source: Wikimedia Commons. <https://commons.wikimedia.org/wiki/File:Door_knocker_audio.ogg>  
  Licence: CC0 1.0 (public domain).  
  Changes: A metal door knocker knocked three times; the third knock (1.105-1.474 s, the only one not clipped) trimmed, faded in 2 ms and out 80 ms, and normalised to -3 dBFS. earshot: real recording, p_real 0.87.  
  File: `assets/sounds/knock.wav`

## Sound

- `assets/sounds/knock.wav`: "Door knocker audio" by Mx. Granger (CC0 1.0, commons.wikimedia.org/wiki/File:Door_knocker_audio.ogg): the third of three knocks of a metal door knocker, trimmed, faded and normalised to -3 dBFS; the ring falling against the door
- `assets/sounds/knock.wav`: the same recording, quieter: the ring's small rebound against the door

## From the README

The handle: *Mask and ring handle*, China, Eastern Zhou dynasty, Warring States period, 5th–4th century BCE. Bronze
with gold and silver inlay, 7.7 × 5.4 × 2.2 cm. National Museum of Asian Art, Smithsonian Institution, Freer Gallery
of Art, F1917.18, gift of Charles Lang Freer. Smithsonian Open Access, CC0. Photograph FS-7729_16.

The sound: *Door knocker audio* by Mx. Granger, Wikimedia Commons, CC0: a metal door knocker; the third knock,
trimmed.

The hunt (47 candidates, the shortlist and why this one): `assets/PICK.md`. See `assets/credits.json`.
