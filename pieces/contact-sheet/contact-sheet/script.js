/* The contact sheet's film: the edit. A loupe lies on the sheet; the cursor picks it up and carries it over the
   frames, sets it down, takes the grease pencil and loops the selects and crosses out a reject. In ?record it goes on:
   the selects come off the sheet and are enlarged, one to a page, on paper, and it ends on prints and commissions.
   About 31 s on the page, 44 s recorded. '@name' means [data-tour="name"]. Engine reference: ../tour/README.md.

   Hooks section.js makes before the engine starts (so they follow the markup, AGENT.md §2):
     @f4                 frame 4 on the sheet (data-n="4")
     @m4, @m4-at         the loop around frame 4 (a select, data-pick="1…4") and the point where the pencil lands
     @x14a/b, …-at       the two strokes of the X through frame 14 (data-pick="x")
     @s1 … @s5           the strips          @rest  where the loupe lies at first
     @desk               carries --carry (0 the loupe lies on the paper, 1 the hand holds it) and --pen (the pencil)
     @prints, @pr1 …     ?record only: the paper the selects are enlarged onto (--paper, --page) and each print (--lift)
   A mark is drawn by tweening its --draw from 0 to 1; section.js turns that into the stroke, a pencil at its head.
   If you change which frames are picks, change the frame numbers below to match (PICKS, REJECT). */
import { move, click, tween, zoom, unzoom, chapter, caption, pause, mark } from '../tour/tour.js';

export const PICKS = [4, 9, 22, 26];     // in the order the pencil loops them
export const REJECT = 14;
export const DRAW = { loop: 1.3, x: .4 };     // seconds a loop takes, and one stroke of an X

const C = [.5, .5];
const F = (n) => `@f${n}`;
const carry = (v, o = {}) => tween('@desk', '--carry', 1 - v, v, { dur: .32, ease: 'out', ...o });
const pen = (v, o = {}) => tween('@desk', '--pen', 1 - v, v, { dur: .3, ease: 'out', ...o });
// a hand drawing: off quickly, steady round the loop, a touch slower as it closes
const hand = (u) => .55 * u + .45 * (u * u * (3 - 2 * u));
const draw = (id, dur) => tween(`@${id}`, '--draw', 0, 1, { dur, ease: hand, block: true });

/* the desks, in design px: wide 1600 × 900 (16:9), square 960 × 960 (1:1), tall 680 × 1209 (9:16 and phones) */
export const SIZES = { size: [1600, 900], sizeSquare: [960, 960], sizeTall: [680, 1209] };

export function film(kind = 'wide', o = {}) {
  const prints = !!o.prints, N = prints ? '03' : '02';
  const Z = { wide: 1.72, square: 1.62, tall: 1.66 }[kind] ?? 1.7;      // how close the camera leans in over the strips
  const [p1, p2, p3, p4] = PICKS, x = REJECT;
  const park1 = F(p1 + 1), park2 = F(x + 3);      // where the loupe is set down while the pencil works: the next frame along

  const steps = [
    pause(.7),
    chapter(`01 / ${N}`, 'The <em>roll</em>', 'Every frame, printed the size of the negative.'),
    caption('Every frame from the roll, on one sheet.'),
    move('@rest', { dur: 1.3, aim: C }),
    click('@rest', { dur: .2, aim: C }),
    carry(1),
    zoom('@s1', Z, { aim: [.42, 1.02], dur: 1.7 }),
    caption('Under the loupe, one frame at a time.'),
    move(F(p1 - 2), { dur: 1.5, aim: C }), pause(.35),
    move(F(p1 - 1), { dur: .85, aim: C }), pause(.25),
    move(F(p1), { dur: .8, aim: C }), pause(1.2),
    move(park1, { dur: .55, aim: [.86, .9] }),
    carry(0), pen(1, { wait: .1 }),

    chapter(`02 / ${N}`, 'The <em>selects</em>', 'Marked in grease pencil, on the sheet.'),
    caption('The one that holds up gets a red loop.'),
    move(`@m${p1}-at`, { dur: .65 }),
    draw(`m${p1}`, DRAW.loop), pause(.35),
    pen(0),
    move(park1, { dur: .6, aim: [.86, .9] }),
    carry(1),
    zoom('@s2', Z, { aim: [.45, 1.04], dur: 1.6 }),
    move(F(p2), { dur: 1.2, aim: C }), pause(.7),
    move(F(x), { dur: .95, aim: C }), pause(1.1),
    move(park2, { dur: .8, aim: [.66, .9] }),
    carry(0), pen(1, { wait: .1 }),
    caption('A soft one gets crossed out.'),
    move(`@x${x}a-at`, { dur: .75 }), draw(`x${x}a`, DRAW.x),
    move(`@x${x}b-at`, { dur: .32 }), draw(`x${x}b`, DRAW.x), pause(.3),
    caption('Then the rest of the picks.'),
    move(`@m${p2}-at`, { dur: .65 }), draw(`m${p2}`, DRAW.loop), pause(.2),
    mark('poster'),
    zoom('@s4', Z, { aim: [.4, 1.0], dur: 1.4 }),
    move(`@m${p3}-at`, { dur: .9 }), draw(`m${p3}`, DRAW.loop), pause(.15),
    move(`@m${p4}-at`, { dur: .75 }), draw(`m${p4}`, DRAW.loop), pause(.3),
    pen(0),
    unzoom({ dur: 1.5 }),
    pause(.6), mark('still'), pause(prints ? 1.2 : .8),
  ];

  if (prints) steps.push(
    chapter('03 / 03', 'The <em>prints</em>', 'Each select, enlarged, one to a page.'),
    caption('The selects, enlarged, one to a page.'),
    tween('@prints', '--paper', 0, 1, { dur: 1, ease: 'out' }),
    tween('@pr1', '--lift', 0, 1, { dur: 1.6, ease: 'ios', wait: .15, block: true }),
    pause(2.4),
    tween('@prints', '--page', 0, 1, { dur: 1.15, ease: 'ios', block: true }), pause(2.2),
    tween('@prints', '--page', 1, 2, { dur: 1.15, ease: 'ios', block: true }), pause(2.2),
    tween('@prints', '--page', 2, 3, { dur: 1.15, ease: 'ios', block: true }), pause(2.2),
  );

  return {
    ...SIZES,
    enter: kind === 'tall' ? [.86, .97] : [.97, .9],
    intro: 0,                    // no band: the first frame is the sheet itself
    outro: prints ? 4.8 : 1,     // recorded: prints and commissions; on the page the sheet simply stays
    settle: .4,
    steps,
  };
}

export default film('wide');
