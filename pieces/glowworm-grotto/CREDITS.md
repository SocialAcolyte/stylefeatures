# Credits: glowworm-grotto

The code written for this piece is MIT licensed (see LICENSE). The images,
sounds and third-party code it uses keep their own licences, listed here.

## Images and media

- **Glowworm cave ceiling over an underground stream**. Source: Generated with Midjourney for Taste (job 3c0ae3bd, variant 1 of 4).  
  Licence: Generated with Midjourney for Taste.  
  Changes: The photo's own glowworms and threads were found with a median top-hat filter (blue-green, small, bright) and inpainted (OpenCV Telea); under the dense glow, where no rock survived, the plate is smoothed and the shader adds limestone relief. Its lighting was flattened into a neutral limestone albedo and the warm light in the far tunnel removed (grotto-albedo.webp, 1456x816). grotto-maps.png (728x408) holds, in R, the density of the photo's glow points (local maxima, Gaussian sigma 7 px), which is where the procedural larvae are placed; in G, a hand-drawn water mask; in B, the photo's diffuse blue-green haze; in A, a soft ceiling mask. grotto-poster.webp is a render of the component at rest, used as the no-JS background.  
  File: `assets/grotto-albedo.webp, assets/grotto-maps.png, assets/grotto-poster.webp`
- **Cave drip; faint stream**. Source: Synthesised for Taste (numpy, ffmpeg libmp3lame).  
  Licence: Original, no recording.  
  Changes: See sounds.json for how each was made.  
  File: `assets/sounds/cave-drip.mp3, assets/sounds/stream.mp3`

## Sound

- `assets/sounds/cave-drip.mp3`: Synthesised for Taste in numpy: an upward-gliding sine (the Minnaert resonance of the bubble a drop entrains) with a soft impact click, through a 2.8 s dark noise reverb. No recording.
- `assets/sounds/stream.mp3`: Synthesised for Taste in numpy: band-limited noise with a slow uneven murmur and small bubbling plinks, short reverb. No recording.

## From the README

The cave picture was generated with Midjourney for Taste and processed as
above (see `assets/credits.json`). Sounds are synthesised (see `sounds.json`).
