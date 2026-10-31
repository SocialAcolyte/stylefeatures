# details-wheel

Any set of images starts as a pile at the centre of a pinned stage, spirals out
through a full turn, and settles into a ring facing outward like petals; grey to
colour as each lands. Afterwards the ring turns slowly and the card under the
pointer lifts. Words in the middle are fitted to the hole by pretext (largest
size that fits, balanced lines). On a phone the ring becomes a tall ellipse and
tilting spins it like a wheel.

```html
<link rel="stylesheet" href="details-wheel.css">
<section data-details-wheel>
  <div class="dw-stage">
    <div class="dw-word"><h2>God is in the details of your labour</h2></div>
    <figure class="dw-card"><img src="1.jpg" alt=""></figure>
    <!-- 8 to 16 cards -->
  </div>
</section>
<script type="module" src="details-wheel.js"></script>
```

Images are cropped to 3:4 (`object-fit: cover`); detail shots with strong
texture look best. The scroll runway is `340svh` (edit in the CSS). Without JS the
cards fall back to a plain grid; with reduced motion the finished ring shows.
`demo-images/` holds the 12 sample images (public domain / CC, from Wikimedia
Commons; credits in the SocialAcolyte repo's `ornaments/credits.json`).
