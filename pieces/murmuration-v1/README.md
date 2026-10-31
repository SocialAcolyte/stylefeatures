# murmuration

A dusk sky over a wetland with a few thousand starlings in it. At rest the
flock breathes: a thin sheet that circles over the trees, banks, folds back
over itself, thickens to a dark core where you see it edge-on and thins to a
haze where you see it face-on. The pointer is a peregrine. Bring it near and
the birds open a hole round it, split and spill; dark bands race through the
flock faster than any bird flies, and then it closes up again. Leave it
alone long enough and the birds pour down into the trees in a funnel, and
the sky is empty. For a hero, a 404 or an empty state.

```html
<link rel="stylesheet" href="murmuration.css">
<div data-murmuration data-birds="3000">
  <h1>Anything inside sits on top of the sky</h1>
</div>
<script type="module" src="murmuration.js"></script>
```

```js
import { murmuration } from './murmuration.js';
const destroy = murmuration(el, { birds: 2400, roost: 0 });
el.addEventListener('murmuration:state', (e) => { /* e.detail.state, .from, .event */ });
destroy.scatter();          // a falcon stoops through the flock
destroy.scatter(0.3, 0.4);  // ...through that point (fractions of the element)
destroy.roost();            // send them down into the trees
destroy.wake();             // up out of the trees again
destroy.state;              // 'flying' | 'hunted' | 'roosting' | 'roosted'
destroy.centre;             // where the flock is: { x, y } as fractions of the element
destroy.birds;              // how many are in play (fewer than asked if a slow device retired some)
destroy();                  // remove everything; the element is its plain photograph again
```

Without JS the element is the dusk photograph as a CSS background, with
whatever you put inside it.

## How it works

**The birds.** Every starling is simulated in three dimensions, in metres and
seconds, standing about 95m from a camera at eye height on the ground. Each
bird steers by its **seven nearest neighbours by rank**, not by those within
some distance: Ballerini et al. (2008, PNAS, the STARFLAG study) found that
starlings interact with six or seven neighbours whatever the density, which
is what keeps a flock together when it stretches and squeezes. Neighbours are
found every frame with a uniform-grid spatial hash (cells about 1.4m at 3000
birds, 27 cells searched, wider only for stragglers); half the flock refreshes its list each
frame. From those seven a bird takes:

- **separation**, inside 2m (the StarDisplay default; scaled with the flock's
  spacing, so 1.7m at 3000 birds or more and up to 3.4m for a small flock),
  stronger fore and aft than to the sides, because real starlings keep their nearest neighbours
  beside them rather than in front or behind (the anisotropy in Ballerini et
  al. 2008), and weak vertically;
- **alignment** with their mean heading;
- **cohesion** toward them, weighted by how much the bird is on the edge
  (its neighbours all on one side), as in Hildenbrandt, Carere & Hemelrijk's
  StarDisplay (2010). Vertical cohesion is strong, so the flock is a thin
  sheet, a few birds thick, as measured flocks are.

On top of that: a pull toward the roost once outside a small radius (aimed a
second ahead, so they turn before they overshoot), a preferred height, each
bird's own cruise speed (about 10.6m/s), a slowly wandering wish to turn,
and, now and then, a handful of birds that start a turn or a climb on their
own, which the rest pick up through their neighbours. Turns in real flocks
start locally like this and sweep across (Attanasi et al. 2014).

**Flight.** Birds turn by banking. What a bird wants sideways becomes a roll
angle, atan(a/g), and the tipped lift does the turning, so a turn lags the
wish and the flock swings rather than slides. Small, quick corrections are
filtered out first; only a sustained turn becomes a bank. Birds roll into a
turn faster than out of it. Wings flap in bouts at roughly a dozen beats a
second, with glides in between.

**Why the flock looks the way it does.** Nothing draws a shape. A thin sheet
seen from the ground at a low angle is long and dense where you look along
it and pale where you look through it; as the flock turns and the sheet tilts
and curls, the dark cores, thin edges and folds come and go on their own.

**The falcon and the waves.** The peregrine is a bird of its own, about a
metre across, flying to the pointer with real speed and acceleration (and
diving through when sent by `scatter()` or a tap). Within 11m starlings get
out of its line of flight, so the flock opens in front of it and closes
behind: a vacuole, a split, a flash expansion. Within 14m a starling makes a
**zig escape**: it rolls nearly onto its side for 0.25s and back over 0.30s,
then will not repeat one for a second. Its neighbours repeat the zig after a
reaction time drawn around 76ms (SD 10ms), and theirs after them. These are
the numbers Hemelrijk, van Zuidam & Hildenbrandt (2015) used to reproduce
the **agitation waves** that Procaccini et al. (2011) filmed in Rome: the
roll passes bird to bird at nearest-neighbour distance over reaction time,
roughly 15m/s, faster than the birds fly.

**Why the waves are dark.** Each bird is drawn as its own silhouette: two
tapered wings (starling wings are triangles) and a body, projected through
the camera from its true 3D orientation, with the wings' thickness given by
how much of each wing's surface faces the camera. From the ground at a low
angle a bird in level flight is nearly edge-on, a thin line; a bird rolled on
its side shows you its whole wing. So the rolling birds cover more sky, and a
band of them reads dark. That is the explanation Hemelrijk et al. tested (with
birds drawn as spheres, the bands vanish). The waves here are not painted;
they are many birds, in a row, turning their wings to you. A flock banking
through a turn darkens all over for the same reason.

**Depth.** Perspective gives the flock its size and parallax: the near side
is larger and moves faster across the sky than the far side as the flock
circles. Contrast falls with distance (aerial perspective, 1/e over 420m),
which, since the bird is drawn over the actual photograph, makes far birds
take on its sky.

**The roost.** After `data-roost` idle seconds (or `roost()`), the roost
point moves to the trees in the photograph and the preferred height becomes a
cone over it: birds close to the trees go down, the rest circle in, and a
stream pours into the treeline (the trees are cut out of the same photograph
and drawn in front of the birds). Low over the roost a bird fades out over
its last metre and a half, as it is lost among the twigs (that covers the
gaps between crowns); the last 0.4%, still circling low over the trees, drop
out of sight over most of a second rather than all at once. When they are
all in, the loop stops. Pointer, tap or `scatter()` lifts them out again.

**Sound** (off until the visitor turns on the house toggle): a wing rush
synthesised live from pink noise, louder where birds are dense near the
pointer (or the middle of the sky) and brighter when they are agitated; and a
synthesised roar of wings on `scatter`.

What it is not: the model is StarDisplay-like, not StarDisplay; the
coefficients were tuned by eye against footage, and I have not measured
whether these flocks show the scale-free velocity correlations Cavagna et al.
(2010) found in real ones, only that heading changes and escapes propagate
across the whole flock through local interactions alone.

## The statechart

```
   flying ──HUNT (falcon arrives)──▶ hunted ──CLEAR (falcon gone, waves done)──▶ flying
     │                                 │
     └──ROOST (idle, or roost())──┬────┘
                                  ▼
                              roosting ──SETTLED (all in the trees)──▶ roosted   (loop stops)
                                  │                                       │
                                  └──────── WAKE / HUNT ◀─────────────────┘  (they take off)
```

The state is mirrored to `data-state`, and a `murmuration:state` event
bubbles on every transition. `murmuration:scatter` fires when a falcon is
sent through (the sound hooks onto it).

## Options

Data attributes, or the options object (which wins).

| Option | Attribute | Default | |
|---|---|---|---|
| `birds` | `data-birds` | `3000` | How many starlings. Their spacing grows a little for small flocks so the flock still reads. |
| `birdsPhone` | `data-birds-phone` | `1600` | The cap on phones (coarse pointer, small screen). |
| `roost` | `data-roost` | `90` | Idle seconds before they go down to roost; `0` never. |
| `falcon` | `data-falcon` | `pointer` | `none`: the pointer does nothing (`scatter()` still works). |
| `wind` | `data-wind` | `tilt` | On a phone with a sensor, tilting it is the wind (up to 5m/s); otherwise a slow breeze. `none` for still air. |
| `sound` | `data-sound` | `on` | `off`: no wing rush even when the house sound toggle is on. |
| `seed` | `data-seed` | random | The same flock every load (stills, tests). |
| `ink` | `data-ink` | `1.1` | Contrast of the birds against the sky (1 is their computed coverage). |
| `renderer` | `data-renderer` | `auto` | `2d` forces the Canvas 2D fallback (used anyway without WebGL). |
| `adapt` | `data-adapt` | `on` | `off`: never retire birds on a slow device (see Performance). |
| `src`, `srcNarrow` | `data-src`, `data-src-narrow` | `assets/dusk.webp`, `assets/dusk-narrow.webp` | The photograph, and a square crop for tall screens. `none`: the drawn sky. |
| `land`, `landNarrow` | `data-land`, `data-land-narrow` | `assets/dusk-land.webp`, … | The treeline and field cut out of it (alpha), drawn in front of the birds. |
| `horizon` | `data-horizon` | `0.847` | Where the ground meets the sky in your photograph (fraction down). |
| `treetop` | `data-treetop` | `0.775` | The top of the roost trees (fraction down). |
| `roostSpan` | `data-roost-span` | `0.64 0.99` | Where the roost trees are (fractions across the wide photograph). |
| `reedbed` | `data-reedbed` | `0.03 0.56` | With `data-src="none"`: where the drawn reedbed (and roost) is. |
| `label` | `data-label` | `A murmuration of starlings over a wetland at dusk.` | Accessible name of the picture. |

## Theming

| Variable | Default | |
|---|---|---|
| `--mm-bird` | `#120d0f` | The birds and the falcon (taken from the darkest trees in the photograph). |
| `--mm-aspect` | `16 / 9` (phones `--mm-aspect-narrow`, `4 / 5`) | The element's shape if you do not give it a height. |
| `--mm-sky-0` … `--mm-sky-7` | Church's twilight | The drawn sky, top to horizon (`data-src="none"` only). |
| `--mm-glow` | `#f2c46d` | Its afterglow. |
| `--mm-land` | `#17110f` | The drawn treeline and reeds. |

Colours are read once at start.

## Accessibility and reduced motion

The picture is `role="img"` with a label; the canvases are hidden from
assistive technology. It is decoration, not a control: nothing in it needs to
be operated, and content you put inside the element stays ordinary, readable
and focusable on top of it. The demo's two real buttons (send the falcon, let
them roost) call `scatter()` and `roost()`. With a fine pointer the cursor is
hidden over the sky because the falcon is the cursor; links and buttons inside
get theirs back. On touch, `touch-action: pan-y` keeps vertical swipes for
scrolling, and a swipe that scrolls the page does nothing to the birds (the
hero fills most of a phone screen, so most scrolls start on it). A tap sends
the falcon down through where you touched; a sideways drag steers it.

**Reduced motion:** one frame. The flock is simulated for five seconds before
anything is shown and drawn once, still; the pointer does nothing, there is
no loop, no idle roost, no sound. `roost()` (the demo's button) empties the
sky at once, and `wake()` puts a still flock back.

## Performance

- The loop runs while the sky is on screen, because the flock is alive; it
  stops when the element is scrolled away (IntersectionObserver), when the
  tab is hidden, and when the birds have roosted. Under reduced motion it
  never starts.
- WebGL: one point sprite per bird, its silhouette computed in the fragment
  shader with analytic coverage, so a bird under a pixel is a faint speck and
  many in a line of sight add up. Canvas 2D fallback: the same silhouettes as
  hairlines, bucketed by darkness into ten strokes.
- The simulation is plain typed arrays. On the build machine (2 shared CPUs,
  heavily loaded) a step took about 14ms for 4000 birds and 4ms for 1600;
  with the CPU throttled 4x, 1600 birds took 16-19ms. Expect a third of the
  unthrottled figures on an ordinary laptop. Phones are capped at 1600 birds.
  Canvases are at most DPR 2.
- **Slow devices:** if a frame's work (simulation, projection, drawing) stays
  over 12ms for a second and a half, a fifth of the birds fade out over a
  second and are retired, then it measures again; never below 40% of the
  flock (or 300). They do not come back until the page is reloaded. On the
  throttled phone above it settled at 1024 birds. `data-adapt="off"` turns
  this off.
- Before the birds are shown the flock is flown for a few seconds (2.5s of
  its time, 5s under reduced motion) so it is already a flock. That is done
  in slices of about 30ms between frames, and only once the sky is first on
  screen, so a slow phone loading a page of skies never freezes; the
  photograph is there meanwhile and the birds fade in when it is done (well
  under a second on a laptop, one to two on a slow phone). The flock starts
  as a thin, curled sheet with a lobed outline and uneven density, not an
  even ellipsoid, so even its first frames do not read as a swarm.

## Tuning notes

- Constants at the top of `murmuration.js`: the bird (span 0.38m, chord,
  wingbeat), the flock (k = 7, separation 2m, reaction 76ms, zig 0.25 + 0.30s,
  refractory 1s, roll 83 degrees), the falcon's reach (14m seen, 11m fled),
  the camera (95m to the flock, eye 1.6m), haze.
- The frame is about 132m wide at the flock's distance on a wide screen and
  70m on a tall one (`layout()`), so birds are 3-5px across: specks, not
  icons. Make it narrower and they become distinct birds.
- The shape of the flock is mostly the vertical balance: strong vertical
  cohesion and weak vertical separation make the sheet; the occasional
  locally started turn or climb makes it fold. Stronger roost pull keeps it
  central but makes it a tight orbit.
- Your own photograph: give `data-src` (and a square `data-src-narrow`), a
  matching alpha cut-out of everything in front of the sky as `data-land`,
  and measure `data-horizon`, `data-treetop` and `data-roost-span`. Above the
  photograph on tall elements, the sky continues from its top row toward a
  darker zenith.
- The falcon is never drawn smaller than 13px, or it is lost at true scale.

## Credits

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
