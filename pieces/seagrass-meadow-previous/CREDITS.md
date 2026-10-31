# Credits: seagrass-meadow

The code written for this piece is MIT licensed (see LICENSE). The images,
sounds and third-party code it uses keep their own licences, listed here.

## Images and media

- **Open water over a Posidonia meadow (background plate)**, 2026. Source: Generated with Midjourney for Taste (job 4ea2a806-cdb0-4151-af78-87d1365bb644, variant 3 of 4).  
  Licence: Generated with Midjourney for Taste.  
  Changes: Only the water column and the surface are used. Every leaf and the dark rock were masked (green dominance plus local darkness), inpainted at quarter resolution (OpenCV Telea) and feathered back in; everything below the horizon row (y = 452 of 816) is replaced by that row, blurred sideways, because the sand is drawn by the shader. Light grain added, resized to 1600x896, WebP q82. meadow-plate-small.webp is the same at 800x448.  
  File: `assets/meadow-plate.webp`
- **Underwater surge, hand swish**, 2026. Source: Synthesised for Taste in Python (numpy), no recordings.  
  Licence: Made for Taste.  
  Changes: Surge: white noise through two one-pole low-passes whose cutoff rises with a 2 s attack and 1.5 s ebb envelope, a sub-100 Hz rumble, and sparse high-passed clicks for the snapping-shrimp crackle of a warm shallow sea. Swish: a 0.8 s low-passed noise burst. Encoded at 80 kbit/s with ffmpeg.  
  File: `assets/sounds/surge-soft.mp3, assets/sounds/surge-big.mp3, assets/sounds/hand-swish.mp3`
- **Salema (Sarpa salpa), Catania, Sicilia, Italia, 2025-04-04, DD 90**, Diego Delso, 2025-04-04. <https://commons.wikimedia.org/wiki/File:Salema_(Sarpa_salpa),_Catania,_Sicilia,_Italia,_2025-04-04,_DD_90.jpg>  
  Licence: CC BY-SA 4.0.  
  Changes: Cut out of its open-water background (scratch fish.py: polynomial background field, alpha from colour distance, edge decontaminated), scaled to 1400 px long, WebP q90.  
  File: `assets/salema.webp`

## Sound

- `assets/sounds/surge-soft.mp3`: Synthesised for Taste (numpy): low-passed noise whose cutoff swells with the surge, a sub-bass rumble, and faint snapping-shrimp crackle. No recording.
- `assets/sounds/surge-big.mp3`: Synthesised for Taste (numpy), as surge-soft but a stronger swell. No recording.
- `assets/sounds/hand-swish.mp3`: Synthesised for Taste (numpy): a short, muffled band of noise. No recording.

## From the README

No libraries. Background plate generated with Midjourney for Taste and
retouched; the salema is Diego Delso's photograph (Catania, 2025, CC BY-SA 4.0,
Wikimedia Commons), cut out (see `assets/credits.json`). Sounds synthesised in Python for this
component. Physics after Luhar and Nepf (2011, Limnol. Oceanogr. 56; 2016, J.
Fluids Struct. 61), Ghisalberti and Nepf (2002, J. Geophys. Res. 107), Stuart
(1967, J. Fluid Mech. 29); caustics after Evan Wallace's WebGL Water (2011).
