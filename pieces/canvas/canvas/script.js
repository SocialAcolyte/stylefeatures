/* The canvas film: the camera flies across the board frame to frame, the person's cursor points and leaves a comment pin
   on four of them, then the camera pulls back to the whole board and hands it to the visitor (section.js).
   About 45 s. '@name' means [data-tour="name"]; '@zone-a' / '-b' / '-c' are the groups section.js makes from data-zone.
   Engine reference: ../tour/README.md (zoom's `max` and `arc` were added for this format).

   The board has three layouts (section.css), so the script is built for one: film('wide' | 'square' | 'tall', copy).
   `copy` is read from the page by section.js: the person's name (the cursor's tag) and the four comments, so the film
   types exactly what the board says. Check any moment with ?t=12.5 (and &record&ratio=9:16). */
import { move, click, type, show, tween, zoom, unzoom, caption, pause } from '../tour/tour.js';

export function film(kind = 'wide', copy = {}) {
  const f = (wide, square, tall) => (kind === 'wide' ? wide : kind === 'square' ? square : tall);
  // fly: a push-in that holds up the next step until it lands. `fill` is how much of the screen the frame gets;
  // `arc` pulls the camera back mid-flight so a long move reads as crossing the board rather than a smear.
  const fly = (sel, fill, o = {}) => zoom(sel, 'fit', { fill, max: 9, dur: 1.7, block: true, ...o });
  const comment = (n, o = {}) => [
    click(`@pin-${n}`, { dur: o.dur ?? .95, aim: [0, 0] }),
    show(`@pin-${n}`, { dur: .55, ease: 'spring' }),
    type(`@pin-${n}-t`, copy[`pin${n}`] || '', { rhythm: 'human', cps: 17, lead: .35, caret: 1.1 }),
  ];
  return {
    intro: 0,               // no opening band: the first frame is the whole board
    outro: 4.2,             // seconds on the whole board before the visitor gets it (the hint fades in)
    settle: .3,
    still: 1e4,             // reduced motion: the finished board, whole (section.js hands it over at once)
    enter: [.66, 1.04],     // the cursor comes in from below the cover
    pointers: { main: { label: copy.name || 'Your Name' } },
    steps: [
      pause(1.5),

      // the cover: who this is
      caption(copy.cap1 || 'Everything I make, on one board.'),
      fly('@title', f(.8, .86, .94), { dur: 2.1 }),
      move('@title', { aim: [.6, .72], dur: 1.1 }),
      pause(.7),

      // project one: process → outcome. The arrows draw as the camera crosses to them
      caption(copy.cap2 || 'Where a project starts…'),
      fly('@zone-a', f(.9, .94, .97), { dur: 1.9, arc: .28 }),
      move('@sketch', { aim: [.62, .5], dur: .9 }),
      tween('@arrow-1', '--draw', 0, 1, { dur: 1.1 }),
      tween('@arrow-2', '--draw', 0, 1, { dur: 1.1, wait: .35 }),
      move('@final', { aim: [.28, .42], dur: 1.2 }),
      caption(copy.cap3 || '…and where it ends up.'),
      fly('@final', f(.72, .8, .92), { dur: 1.3 }),
      ...comment(1),
      pause(1.1),

      // project two: the screens
      caption(copy.cap4 || 'The screens, the way they were used.'),
      fly('@zone-b', f(.82, .9, .9), { arc: .3 }),
      ...comment(2),
      pause(1),

      // project three: a series
      caption(copy.cap5 || 'A series, start to finish.'),
      fly('@zone-c', f(.86, .92, .94), { arc: .3 }),
      ...comment(3),
      pause(1),

      // about
      caption(copy.cap6 || 'Who made it.'),
      fly('@about', f(.74, .82, .92), { arc: .22 }),
      move('@about', { aim: [.72, .4], dur: 1 }),
      pause(1.1),

      // contact: in the corner, where the film ends
      caption(copy.cap7 || 'And where to find me.'),
      fly('@contact', f(.7, .78, .92), { arc: .18 }),
      move('@mail', { aim: [.4, .6], dur: .9 }),
      ...comment(4, { dur: .8 }),
      pause(1),

      // pull back: the whole board, then it's theirs
      caption(copy.cap8 || 'The whole board. Have a look around.'),
      unzoom({ dur: 2.6, block: true }),
    ],
  };
}
