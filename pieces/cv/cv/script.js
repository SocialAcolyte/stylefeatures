/* The CV film's script: where the cursor goes, which line opens, what plays inside it, where the camera looks.
   Four chapters, one idea each: the current role opens and its product works; the role before opens as the first
   folds shut, before and after; a project, its own page scrolled; then the one-page PDF. About 37 s on a desk.
   '@name' means [data-tour="name"]. Engine reference: ../tour/README.md.

   The page has four layouts (section.css), so the script is built for one: film('wide' | 'square' | 'tall' |
   'narrow'). The three desks (16:9, 1:1, 9:16) share every step and differ only in how far the camera pushes in.
   'narrow' is a phone reading the page: a fingertip, no camera, two lines, no PDF (it sits under the sheet there).
   section.js picks the layout and rebuilds the script if the stage changes shape. ?t=12.5 freezes any moment. */
import { click, tap, move, scroll, tween, zoom, unzoom, chapter, caption, pause, mark } from '../tour/tour.js';

/* a line opens: its fold (--fold on the line) grows from the line down, the lines below slide down with it */
const open = (n, o = {}) => tween(`@line-${n}`, '--fold', 0, 1, { dur: 1.05, ease: 'ios', ...o });
const shut = (n, o = {}) => tween(`@line-${n}`, '--fold', 1, 0, { dur: .8, ease: 'out', ...o });

/* the desks, in design px. The sheet on each is 600 × 848; a phone's column is 400 wide, as tall as it needs */
export const SIZES = { size: [1600, 900], sizeSquare: [960, 960], sizeTall: [680, 1209] };

export function film(kind = 'wide') {
  const narrow = kind === 'narrow';
  const press = narrow ? tap : click;
  // how much of the desk a push-in gives the open line: the wide desk leaves its margins for the card and caption
  const fill = { wide: .56, square: .74, tall: .92, narrow: .9 }[kind] ?? .6;
  const push = (sel, o = {}) => (narrow ? pause(0) : zoom(sel, 'fit', { fill, dur: 1.25, ...o }));
  const back = (o = {}) => (narrow ? pause(0) : unzoom({ dur: 1.1, ...o }));
  const row = { dur: narrow ? .9 : 1, aim: [.22, .5] };

  const steps = [
    pause(1.3),

    chapter('01 / 04', 'Where I <em>work</em> now', 'Every line on this page opens.'),
    caption('Every line on the CV opens.'),
    press('@row-1', row),
    open(1),
    pause(.9), mark('poster'),          // the line open, the whole sheet in view: the best still for a poster
    push('@line-1'),
    pause(narrow ? .4 : 1.5),
    caption('The thing I work on, working.'),
    press('@ev1-go', { dur: .9, wait: .1 }),
    tween('@ev1-row', '--done', 0, 1, { dur: .5, ease: 'out' }),
    tween('@ev1-toast', '--in', 0, 1, { dur: .45, ease: 'spring', wait: .1 }),
    pause(1.6), mark('still'),          // reduced motion and ?thumb show this moment
    pause(1),
    tween('@ev1-toast', '--in', 1, 0, { dur: .3, ease: 'out' }),
    back(),

    chapter('02 / 04', 'What I <em>changed</em>', 'It folds shut, and the next line opens.'),
    caption('The role before.'),
    press('@row-2', row),
    shut(1),
    open(2, { wait: .12 }),
    push('@line-2', { wait: .55 }),
    pause(narrow ? 1 : 2),
    caption('Before, and after.'),
    press('@ev2-after', { dur: .85 }),
    tween('@ev2', '--ba', 0, 1, { dur: 1.1, ease: 'ios' }),
    pause(2.8),
  ];

  if (narrow) {      // a phone: fold it shut and stop; the PDF and the address are right under the sheet
    steps.push(press('@row-2', row), shut(2), pause(1.2));
    return { ...SIZES, sizeTall: [400, 'auto'], pointer: 'touch', intro: 0, outro: 1.2, settle: .3, steps };
  }

  steps.push(
    back(),
    chapter('03 / 04', 'On my <em>own</em> time', 'Projects open the same way.'),
    caption('Something I built, start to finish.'),
    press('@row-5', row),
    shut(2),
    open(5, { wait: .12 }),
    push('@line-5', { wait: .55 }),
    pause(.7),
    move('@ev3-page', { dur: .8, aim: [.6, .55] }),
    scroll('@ev3-page', 'end', { dur: 3 }),
    pause(1.3),
    caption('Folded shut again.'),
    press('@row-5', { dur: .9, aim: [.22, .5] }),
    shut(5),
    back({ wait: .1 }),
    pause(.6),

    chapter('04 / 04', 'Take it <em>with</em> you', 'The same page, as a one-page PDF.'),
    caption('Download the one-pager.'),
    zoom('@pdf-block', { wide: 2, square: 1.6, tall: 1.4 }[kind] ?? 1.6, { dur: 1.4, aim: kind === 'tall' ? [.36, .5] : [.4, .3] }),
    press('@pdf', { dur: 1.15, aim: [.4, .55] }),
    tween('@pdf-block', '--print', 0, 1, { dur: .9, ease: 'ios' }),
    tween('@pdf-file', '--in', 0, 1, { dur: .55, ease: 'spring', wait: .3 }),
    pause(2.2),
    back({ dur: 1.3 }),
    pause(.5),
  );
  return {
    ...SIZES,
    enter: [.94, .9],
    intro: 0,                   // no title band: the first frame is the sheet itself
    outro: 4.6,                 // the closing frame: the address in the margin
    settle: .5,
    steps,
  };
}

export default film('wide');
