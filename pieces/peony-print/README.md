# peony-print

Hokusai's Peonies and Canary is printed in front of you as you scroll, block by block, ending as the scan itself.

```html
<link rel="stylesheet" href="peony-print.css">
<section data-peony-print data-src="assets/peony.json">
  <div class="pp-stage">
    <img class="pp-img" src="assets/peony.webp" alt="" aria-hidden="true" width="2100" height="2882">
  </div>
</section>
<script type="module" src="peony-print.js"></script>
```

Or `import { peonyPrint } from './peony-print.js'` and call `peonyPrint(section, { src })`. It returns `{ destroy() }`.

## The real thing

Peonies and Canary (c. 1834, Nishimuraya Yohachi) is a nishiki-e print: the drawing was cut into a key block, proofs from it were pasted onto further cherry blocks, one per colour, and the printer aligned each damp sheet on the kento marks, brushed pigment onto the block, and rubbed the back with a baren. Gradations like the petal pink and the deepening blue ground are bokashi, pigment wiped partly away on the block before the sheet goes down. The print order here follows the shop's: key first, then colour light to dark — pink, the yellow underprint, the leaf green it makes with blue, the ground in two impressions (a second pass was how a printer deepened a ground), the bird's grey, and the seals last.

## How it works

Offline (Python in the builder's scratch folder, `s1`–`s9`), the MFA Boston scan (3840×5242, cropped to the sheet at 2100×2882) is converted to optical density against its own paper colour and unmixed onto seven ink directions discovered from the scan: sumi key, petal pink, yellow, leaf, Prussian blue, bird grey, vermillion. Each ink is restricted to where it can belong — pink to a warm petal mask, grey to the bird's silhouette lifted from the image, seals to their corner — the key block is the neutral-dark and thin structure with the ground's grain masked out of it, and the colours are then solved on what the key leaves. The leftover density is folded into the blue ground as its second impression (projected, then per-channel). After that fold the blocks reproduce the scan with a mean error of 3.1/255, almost all of it overshoot in the darkest leaf overlaps.

In the browser, one WebGL shader recombines the seven coverage maps (two lossless WebP atlases) plus the residual map: colour = paper × exp(−Σ coverage × ink). Each block arrives under a baren front — a ragged top-to-bottom sweep with tooth, so a block half-printed is goma-zuri speckle, never a wipe — with a small misregistration offset that settles as the impression completes, and recently printed ink a little deeper while wet. Scroll drives it on a critically damped spring; nothing runs when the sheet is off screen or the scroll is still.

**Simplified, honestly:** the baren sweep is one even pass per block, not the printer's overlapping circles; the bokashi is in the coverage maps (from the scan), not wiped live; and the final frame is the blocks' sum, which sits about 3/255 from the scan on average rather than being bit-identical — the untouched scan is what the fallback image and reduced-motion state show.

## Accessibility and motion

Without JS or WebGL the finished print stays as an `<img>`; the canvas is `aria-hidden`, the art is ornament (`alt=""`), credits are in `assets/credits.json`. Reduced motion: no runway, the finished print still. The canvas is `touch-action: pan-y`, so a phone swipe always scrolls. DPR is capped at 2.

## Cost

Assets 5.6 MB: the print 2.6 MB, coverage atlases 2.4 MB + 0.9 MB, residual 0.2 MB, JSON 4 KB. One full-screen quad, about twenty texture reads per pixel, drawn only while the scroll spring moves.
