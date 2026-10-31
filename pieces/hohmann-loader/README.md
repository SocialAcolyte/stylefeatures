# hohmann-loader

A page loader drawn as an engraved plate of a Hohmann transfer from Earth to
Mars. While the page loads, the transfer ellipse is inked from the departure
point on Earth's orbit, over the top of the plate, to the point where it
touches Mars's orbit. Earth and Mars move on their own orbits in the same
time; Mars arrives at the meeting point exactly as the craft does, at 100%.
Then the plate lifts off the page.

No labels, no numbers, no controls. The Sun, two hairline orbits, a dotted
projected course, the line being drawn, the craft at its tip, and the two
planets, all in one warm ink on the house paper. A small inline variant does
the same thing in a button or a sentence.

## Markup

The page plate, first thing in `<body>`, plus one line in `<head>` so it is
there from the first paint (and lifts itself after 12 s if the script never
arrives):

```html
<head>
  <script>document.documentElement.classList.add('hl-loading');window.hlFailsafe=setTimeout(function(){document.documentElement.classList.remove('hl-loading')},12000)</script>
  <link rel="stylesheet" href="hohmann-loader.css">
</head>
<body>
  <div data-hohmann-loader="page" aria-label="Loading the page"></div>
  ...
  <script type="module" src="hohmann-loader.js"></script>
</body>
```

By default it follows the document: the parser finishing, every `<img>`
completing, and the `load` event. Between those it creeps forward slowly so a
stalled network never looks frozen, but it never passes 92% until `load` says
so.

For an app that knows its own progress (fetching data, hydrating, unpacking a
bundle), take it over:

```html
<div data-hohmann-loader="page" data-source="manual"></div>
```
```js
const plate = document.querySelector('[data-hohmann-loader="page"]').hohmannLoader;
plate.setProgress(0.4);   // 0..1; it only ever draws forwards
plate.done();             // finish the transfer; the plate then leaves by itself
```

The inline loader. Its `<progress>` is the source of truth: set `value` and it
draws; leave `value` off and it waits in the parking orbit.

```html
<button><span data-hohmann-loader><progress max="100"></progress></span> Publish</button>
```
```js
progressEl.value = 42;                    // or el.hohmannLoader.setProgress(0.42)
el.hohmannLoader.wait();                  // back to waiting (a new job)
el.addEventListener('hohmann:arrive', …); // the craft has reached Mars
```

`import { hohmannLoader } from './hohmann-loader.js'` starts one by hand;
it returns the same controller (`setProgress`, `done`, `wait`, `leave`,
`destroy`, `progress`, `orbit`). `destroy()` stops everything and removes
what it added. The page plate fires `hohmann:arrive` when the craft arrives
and `hohmann:done` when it has gone; both bubble to `document`.

### Options (data attributes or the options object)

| | default | |
|---|---|---|
| `data-hohmann-loader` | inline | `page` for the full-page plate |
| `data-source` | `document` | page only: `manual` to drive it yourself |
| `data-pace` | `1.25` | the shortest time, in seconds, to draw the whole transfer. A page that is ready at once still shows the arc drawn, briefly, not a flash |
| `data-coast` | `2.6` | inline: seconds per parking orbit while waiting |
| `data-fine` | false | inline: draw the engraved detail (Sun rays, hatched planets, ticks); for an inline loader shown large |

Theme with `--paper` and `--ink`. Inline size is `--hl-size` (default 1.45em).

## The real thing

Walter Hohmann, a civil engineer in Essen, published the transfer in 1925 in
*Die Erreichbarkeit der Himmelskörper*. Everything on the plate follows it:

- **Two circular, coplanar orbits**, Earth's at 1 AU and Mars's at 1.5237 AU,
  drawn to scale against each other. (The Sun and planets are not to scale;
  at true size they would be specks.)
- **The transfer ellipse is tangent to both**: perihelion on Earth's orbit,
  aphelion on Mars's, so a = (r₁ + r₂)/2 and e = (r₂ − r₁)/(r₂ + r₁) = 0.2075.
  Both burns are along the direction of travel; the departure and the
  arrival are marked with a small open ring.
- **The transfer takes half the ellipse's period**, t = π√(a³/μ): 258.9 days.
- **Progress is time, not distance.** Progress p is mean anomaly M = πp.
  Kepler's equation M = E − e sin E is solved by Newton's method every frame,
  then ν = 2 atan2(√(1+e) sin E/2, √(1−e) cos E/2) and r = a(1 − e cos E). So
  the craft runs away from the Sun and slows as it climbs: at 50% of the time
  it is already 113° of the 180° round. The small ticks along the drawn line
  are cut at each tenth of the transfer time, and you can see Kepler in
  them: wide apart near the start, crowding together towards Mars.
- **The planets keep their own time.** Earth moves at its mean motion and is
  255° on by arrival. Mars must lead Earth by π − n₂t = 44.3° at departure to
  meet the craft; it does, and it moves at its own, slower rate to arrive at
  the meeting ring exactly at 100%.
- **The inline loader waits for its window.** With no value it coasts:
  Earth (with the craft) and Mars go round at their true relative rates. When
  a value arrives the clock runs on, quickly and with both planets together,
  to the instant Mars leads by 44.3°, and the craft departs from wherever
  Earth then is. Nothing cheats; it is only fast-forwarded.

Simplified: real orbits are slightly elliptical and inclined; burns are
impulsive (all the Δv at one instant).

## The look

An astronomical plate in one ink: the Sun engraved as a disc ruled with fine
horizontal lines and a crown of tapering rays, long and short in turn; the
planets shaded on the side away from the Sun with parallel lines that thicken
towards the dark limb and begin very fine on the day side, so the terminator
is soft; the drawn course a burin line that enters the plate thin and swells
to full width. Each engraved mark is a filled sliver, not a stroked line, so
it swells and tapers like a cut line. The orbits are true hairlines: their
widths are set in CSS pixels from the plate's rendered size, so they stay
0.7 px at any size and any DPR (SVG, so sharp at any zoom).

The page plate sits in a plate mark: the shallow step a copper plate presses
into the sheet, lit on one side and shadowed on the other, with inside it the
faint tone that wiping leaves on the plate (`assets/plate-tone.webp`, made by
`scratch/hohmann-loader-p/tone.py`: long diagonal wiping streaks and paper
tooth, kept to 1-3% ink).

## Behaviour and cost

- **Nothing runs at rest.** The frame loop exists only while the line still
  has somewhere to go, while the document source is waiting on `load` (the
  creep), or while an inline loader is waiting on screen in a visible tab.
  A manual plate that is stalled draws nothing. Once the plate has left,
  there is no loop, no observer and no node left behind.
- **Reduced motion:** no loop at all. Each change of progress redraws the
  plate once, with the transfer inked to exactly the current fraction and
  the planets in their true places; on completion the plate is removed
  without a fade.
- **Accessible.** The page plate is a `role="progressbar"` with
  `aria-valuenow`; the inline loader keeps its native `<progress>` for screen
  readers. The drawing is `aria-hidden`.
- **No JS:** the `<head>` failsafe lifts the plate after 12 s; the inline
  loader is the plain `<progress>`.
- SVG only, about 450 lines of JS, one 110 KB texture for the page plate.

## Credits

`assets/credits.json`. No outside artwork; the plate tone is generated.
