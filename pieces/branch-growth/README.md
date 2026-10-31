# branch-growth

A flowering plum branch, painted in ink, that grows down a long page as you
read it. Three or four old limbs, each a single bold gesture, enter at one
margin and cross the full width of the page in the gap between sections, in
nearly black dry-brush strokes broken at the knots, with moss dots clustered
there; whole screens of paper lie between them. Straight young whips rise
from each limb into both margins; buds swell on the young wood, sepals part, and the
blossoms open in fine grey outline with a touch of rose, stamens fanning out
last. The tree is grown by space colonisation in the page's free space and
thickened by the pipe model, so it forks, competes and reaches like a real one;
the scroll position decides how far into the season you are. Scroll back and it
ungrows.

```html
<link rel="stylesheet" href="branch-growth.css">

<main data-branch-growth data-seed="7">
  … a long essay: headings, paragraphs, quotes …
</main>

<script type="module" src="branch-growth.js"></script>
```

Or call it yourself:

```js
import { branchGrowth } from './branch-growth.js';
const plum = branchGrowth(el, { seed: 3, blossoms: 1.2 });
plum.growTo(0.5);    // hold the season half way (0..1); growTo(null) hands it back to the scroll
plum.state;          // { nodes, strokes, flowers, dots, tau, tauEnd, buildMs, running, … }
plum.rebuild();      // re-measure the words and regrow (done for you on resize)
plum.destroy();      // canvas, listeners, observers, GL context
```

The host should be wide (the full page width, so the branch has margins to
grow in) and as tall as the reading. Without JS or WebGL the page is simply the
essay.

## Options

On the element (`data-*`) or in the options object, which wins.

| attribute | option | default | |
|---|---|---|---|
| `data-seed` | `seed` | `7` | the tree. Same seed and same layout give the same tree |
| `data-avoid` | `avoid` | `p, h1…h6, blockquote, li, figcaption, dt, dd, pre, img, figure, video, [data-bgr-avoid]` | what counts as words. Text elements are read line by line (`Range.getClientRects`), so ragged line ends and short last lines are free space; images and `[data-bgr-avoid]` as whole boxes |
| `data-lead` | `lead` | `.72` | where the growing front sits, as a fraction down the viewport. Flowers open about half a screen behind it, where you are reading |
| `data-limbs` | `limbs` | `4` | how many old limbs. Each takes a band of open paper (a row with no words in it, such as a section break) spread evenly down the page, at least 1.2 screens apart (1.6 on a phone) |
| `data-density` | `density` | `1` | scales the attractor count: how much wood |
| `data-blossoms` | `blossoms` | `1` | scales the flowers |
| `data-ink` | `ink` | the host's `--ink` | colour of the wood, dots and stamens |
| `data-paper` | `paper` | the host's `--paper` | colour inside the petals (they hide the wood behind them, as a painter leaves a gap) |
| `data-assets` | `assets` | `./assets/` beside the module | where `ink-texture.png` and `moss-dots.png` live |

Events: `branch-growth:bloom` (bubbles; `detail: { x, y }` in host px) when a
flower opens past seven tenths while scrolling forward, at most one per 140 ms.
A soft sound could hang off it later.

## The real thing

*Prunus mume* flowers in late winter, often in snow, on bare wood: the leaves
come weeks after the petals fall. Old wood is dark, fissured and lichened, and
changes course in kinks where a leader died and a side shoot took over; each
summer it sends up long straight whips, and the next winter it flowers along
them, singly or in pairs, almost stalkless. The flower is 2-3 cm, five round
petals, five red-brown sepals behind, a burst of long stamens. A branch carries
every stage at once. The ink-plum painters (Yang Wujiu, Wang Mian, Jin Nong)
painted it in that order: the old wood in a broad, dryish grey wash that breaks
at the edges, the young shoots as single wet strokes that taper, the blossoms
as a ring of fine C-shaped strokes with the paper left white, and the dots
last (moss, sepals, the black tips of the stamens). The look here is matched
to Jin Nong's *Plum blossoms* album of 1757 and his hanging scroll of 1759.

Modelled: space colonisation, pipe-model thickening, three kinds of growth
unit (old limbs and their leaders, whips, twigs) with the plum's stiffness, kinks and upward
shoots, flowers on young wood only, buds through opening to full flower, a few
that stay buds. Simplified: one season of growth (a real limb is decades old,
so the entering limbs are drawn old from the start); no leaves, no fruit, no
falling petals; petals are discs, not cupped and notched.

## How it works

- **Reading the page.** After `document.fonts.ready`, every line box of every
  text element is measured (host-relative) and indexed by height. That is the
  only DOM read; the growth runs on numbers.
- **Old limbs.** The page is scanned for bands of open paper: rows the full
  width of the page with no line of text in them (section breaks, the space
  round the title). Three or four are chosen, spread evenly and at least 1.2
  screens apart. Each limb enters beyond one edge a little above its band,
  crosses the page inside it and, on a wide page, hangs down into the far
  margin beside the next section (on a phone it leaves by the far edge). The
  path enters low at one edge and climbs across the gap, turns at an elbow
  (60-90 degrees) and runs on into the far margin, in straight pieces broken
  at knots, so the wood bends like iron rather than waving. A last, smaller
  limb is added by the end of the essay, so it closes beside a flowering
  branch. Its girth starts
  at 24 px (10 on a phone), tapers to about half, and drops suddenly at some knots; at others a short
  broken stub is left where a branch was lost. The limb is painted in as its
  band comes up the screen (from 0.2 screens before the band reaches the
  growing front to 0.25 after), and only then do its whips grow. Attractors
  exist only in each limb's stretch, so the screens between stay empty.
- **Space colonisation** (Runions, Lane & Prusinkiewicz 2007). Attractors are
  scattered on a jittered grid in the free space, thinned by a two-octave noise
  so the tree has clusters and voids ("prize the sparse"). They switch on as a
  sweep moves down the page, 4 px per iteration, which is the growth's clock.
  Each live attractor pulls the nearest node within the radius of influence
  (110 px desktop, 80 phone); attractors closer than the kill distance (28 / 20)
  are consumed. A node steps 8 px (6) along the mean pull, plus:
  - leaders (order 0, the old wood) carry the tree down: stiff, they turn only
    in angular kinks of up to 0.9 rad every 6-12 steps, never climb, see twice
    as far when nothing is near, and are pushed away from words (a soft field
    that falls off over 75 px);
  - whips (order 1) leave at 0.5-1 rad, rise (upward tropism), turn at most
    0.09 rad a step and never more than 0.75 rad from where they set out, kink
    a little now and then, and stop at a season's length (55-285 px);
  - twigs (order 2) are short and flower-bearing. At most three children per
    node and no side shoot within three nodes of the last one, so no combs.
  - Tips meeting a line of text steer round it (a few tries) or stop. On a phone
    the wood may pass behind the words near the edges and is drawn pale there.
- **Pipe model** (Leonardo, after Eloy 2011, exponent 2.3). Each frame, one
  reverse pass over the living nodes sums `r^2.3` of the children, so the trunk
  thickens as its crown grows and thins again if you scroll back. Old-limb
  minimums apply on top.
- **Scroll to season.** `tau = scrollY + lead × vh`, plus an extra that ramps
  in over the last screen and a half so the end of the page is in full flower.
  Nodes are born at the sweep value of their iteration; a node is alive when
  `tau` passes it and its segment grows in over one sweep step. Flowers open
  from `birth + 10..120` over `150..280` of `tau`. `tau` eases toward its
  target (time constant 0.16 s) and the loop stops when it arrives.
- **Strokes.** The tree is split into brush strokes the way a painter would:
  from each start, follow the child with the most tips; every other child
  starts its own stroke at the edge of the wood it leaves, with a small rounded
  press where the brush lands. Each stroke tapers to a point over `8 + 5r` px.
- **Brush (WebGL).** Each brush stroke is a triangle ribbon (`u` = arc
  length, `v` = across, 1.5× the radius so the edge can wander, `prog` = how
  far along the stroke the brush is).
  - Old wood is painted wet-into-wet. Between each pair of knots it gets its
    own strokes (a main stroke, a second beside it, sometimes a thin accent
    along one edge), each landing with a round press and lifting away dry and
    split. They are not layered: all of them go first into an offscreen wash
    buffer, unioned (max blending), which records coverage, how much ink the
    bristles left (the dry-brush streaks), where an accent runs, and how many
    strokes overlap. A second pass tones that one shape as a grey wash, about
    50% ink: varied by low-frequency noise, darker where it pooled at the edges
    and along the lower side and where strokes overlapped, lighter in grey
    flying-white streaks where the brush ran dry, with a faint bleed into the
    paper round its soft, blotchy outline. The darkest ink is kept for accents:
    the moss dots, a dark edge along one side in places, the knots.
  - Young wood is one confident stroke: darker ink, pressed at the base,
    tapering to a fine lifted tip. A whip is dead straight or has one decisive
    angle toward the light. Small dark dots (cut from the painting's own
    dots) mark the buds along it.
  - Paper grain from the same leaf breaks the edges, fixed to the page.
- **Moss dots** are fourteen real dots cut from the painting, clustered three
  to six at each knot of the old wood with a few between, more on the upper
  side.
- **Blossoms** are drawn once, at load, into an atlas of 9 views × 16 stages:
  a real 3D flower (five petal discs on a cup that opens from 0.55 to 1.55 rad,
  sepals folding back behind them, 22 stamens spreading last) projected at
  tilts from 8° (face on) to 156° (from behind), outlines as C-shaped strokes
  open at the base with brush pressure, a rose wash pooled at each petal's base.
  Buds are a bead in a red-brown cup, and before that a pepper-seed of sepals.
  Each flower is a rotated quad turned so its stalk faces its twig. Sizes run
  from tiny to large; the calyx red varies from brown-red to wine and rust
  between views; outlines are brush lines that thicken, thin and skip; a
  third of the views have Jin Nong's black-dash stamens; a third of the flowers come in twos and threes round one node
  on a short spur. A few old flowers drop a petal or two onto the paper below
  (eight single-petal sprites, appearing well after the flower opened).
- **The canvas** is absolutely positioned in the host, 1.5 screens tall, and
  re-anchored with a transform each time it is drawn, so it scrolls natively
  with the text (no lag behind the words on a phone) and is only ever as big as
  what you can see.

## Tuning

- The limbs: `count`, `minGap` and the waypoints in the limb planner; knot
  spacing and jitter; `R0` (girth); the scar chance (`0.3`).
- `P` in `grow()` holds the sizes for phone and desktop: step `D`, radius of
  influence `di`, kill distance `dk`, attractor `cell`, text padding `pad`, twig
  radius `r0`, maximum radius `rMax`, old-limb radius `limbR`, flower radius.
- The attractor noise (`keep` in the attractor loop) sets how clustered the
  tree is.
- Leader stiffness and kinks: the `ord === 0` branch of the turn rule. Whip
  length: `maxl`. Upward tropism: the `-0.42` / `-0.3` terms.
- Flowers per twig: the `gap` counter and the `0.72` in the blossom loop; the
  share that stay buds is `maxS`; the mix of views is `view`.
- Brush: `FS_WASH` tones the old wood (`dens`: base grey, rim, pool, overlap,
  flying white, accents); `FS_WOOD` writes the wash buffer and draws the young
  wood. In it `dryness`/`thr` is how
  dry the brush runs and how soon; `edge` is the raggedness. The strokes per
  knot are planned in `s.subs` (offset, width, dryness, tone of each).

## Theming

`--ink` and `--paper` on the host (or `data-ink` / `data-paper`). The sepals'
red-brown and the petals' rose are fixed in `buildAtlas` (`sepal`, `rose`):
they are the plum's colours. The layer sits under the content at `--bgr-z`
(default `0`); the host's other children get `position: relative; z-index: 1`.

## Accessibility and reduced motion

- The layer is `aria-hidden`, `pointer-events: none`, never takes focus, never
  blocks selection or scrolling. Print hides it.
- Words always win on desktop: nothing grows on a line of text (padded 15 px).
  On a phone the wood may pass behind lines near the edges at 32% strength, and
  the few flowers there at 30%.
- `prefers-reduced-motion: reduce`: the tree is drawn fully grown and in
  flower, and only redrawn to follow the scroll.

## Cost

- Growth: 40-120 ms once at load (desktop, ~2-4k nodes) and again after a
  width change (debounced 250 ms).
- Per frame while scrolling: one O(n) pipe-model pass and the visible strokes
  as one draw call, flowers and dots as another; well under a millisecond of
  script on a laptop. The loop stops when the season catches up with the
  scroll, and draws nothing while the host is off screen.
- Canvas: host width × 1.5 screens at DPR ≤ 2.
- Assets: two small PNG data textures (38 KB). PNG, not webp, because the
  channels are data (density, grain), not a picture.

## Credits

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
