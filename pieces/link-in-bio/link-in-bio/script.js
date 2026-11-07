/* The link-in-bio film's script: where the finger goes, what each touch changes, where the camera looks, the chapters.
   Three chapters, one idea each: a link unfolds into its preview, the newest piece plays where it is, the contact
   card turns over and is saved. About 28 s on the wide spread, 33 s on a phone (the swipes). '@name' means [data-tour="name"]. Engine reference: ../tour/README.md.

   The page has three layouts (section.css), so the script is built for one: film('wide' | 'square' | 'tall').
   On a wide stage everything is on the sheet at once; on a square one the right column scrolls; on a phone and in
   9:16 the whole page scrolls, so the finger swipes it up before each chapter. section.js picks the layout and
   rebuilds the script if the stage changes shape. Check any moment with ?t=12.5 (and &record&ratio=9:16). */
import { tap, swipe, tween, set, zoom, unzoom, chapter, caption, pause, mark } from '../tour/tour.js';

/* a flick up the page that stops with `to` near the top. Wide stages show everything, so there it's only a beat.
   (No `by` here: the engine reads a swipe's `by` as the name of a second pointer, so leave it at the default.) */
const scrollTo = (kind, to, o = {}) => (kind === 'wide' || (kind === 'square' && o.tallOnly)) ? [pause(.2)]
  : [swipe('@page', { scroll: to, offset: o.offset ?? 18, dur: .32, coast: o.coast ?? 1, aim: [.56, .7] }), pause(.35)];

/* a banner from the top of the page: in, held, out */
const toast = (text, o = {}) => [
  set('@toast-text', { text }),
  tween('@toast', '--in', 0, 1, { dur: .45, ease: 'spring', ...o }),
  tween('@toast', '--in', 1, 0, { dur: .3, ease: 'out', wait: (o.wait || 0) + (o.hold ?? 1.9) }),
];

export function film(kind = 'tall') {
  const wide = kind === 'wide';
  const fill = (w, sq) => (wide ? w : kind === 'square' ? sq : .94);   // how much of the sheet a push-in gives the thing (tall: the column already fills it)
  return {
    size: [1200, 720],       // the wide sheet; square and tall sizes come from data-size-square / data-size-tall on the window
    pointer: 'touch',        // a fingertip, on every layout: this is a page people open on their phone
    intro: 1.3,              // seconds the rail's first frame (the address, the play button) takes to fade
    outro: 4.6,              // seconds held on the closing frame
    // still: the frame reduced motion shows is mark('still') below (section.js seeks to it)
    steps: [
      pause(1.6),

      chapter('01 / 03', 'Where to <em>find</em> me', 'Each link opens in place, so you see where it goes before you go.'),
      ...scrollTo(kind, '@links', { tallOnly: true, offset: 16 }),
      caption('Tap a link to see where it goes.'),
      tap('@row-2', { dur: .85, aim: [.42, .5] }),
      tween('@link-2', '--in', 0, 1, { dur: .95, ease: 'ios' }),
      zoom('@link-2', 'fit', { fill: fill(.6, .62), dur: 1.15, wait: .25 }),
      pause(1.4), mark('still'),   // reduced motion shows this frame: a link unfolded (section.js)
      pause(.9),
      unzoom({ dur: 1 }),
      caption('Another, and the first folds away.'),
      tap('@row-4', { dur: .9, aim: [.42, .5] }),
      tween('@link-2', '--in', 1, 0, { dur: .6, ease: 'out' }),
      tween('@link-4', '--in', 0, 1, { dur: .95, ease: 'ios', wait: .12 }),
      pause(2.2),

      chapter('02 / 03', 'The latest <em>work</em>', 'Tap a piece and it plays where it is.'),
      ...scrollTo(kind, '@work', { offset: 14 }),
      zoom('@work', 'fit', { fill: fill(.72, .7), dur: 1.1 }),
      caption('Play the newest piece.'),
      tap('@clip-2', { dur: .85, aim: [.5, .5], wait: .2 }),
      ...(wide ? [tween('@link-4', '--in', 1, 0, { dur: .7, ease: 'out' })] : []),   // on the spread, fold the link away as the clip opens
      set('@work', { 'data-on': '2' }),                    // the caption under the strip follows the clip that's open
      tween('@clip-1', '--open', 1, 0, { dur: .8, ease: 'ios' }),
      tween('@clip-2', '--open', 0, 1, { dur: .8, ease: 'ios' }),
      tween('@clip-2', '--pl', 0, 1, { dur: .45, ease: 'out', wait: .55 }),
      tween('@clip-2', '--p', 0, 1, { dur: 5, ease: 'linear', wait: .6 }),
      pause(4.4),
      unzoom({ dur: 1 }),
      pause(.3),

      chapter('03 / 03', 'Keep in <em>touch</em>', 'One tap and you have my card.'),
      ...scrollTo(kind, 'end', { coast: 1.1 }),
      zoom('@contact', 'fit', { fill: fill(.44, .5), dur: 1.1 }),
      caption('Turn the card over.'),
      tap('@cc-open', { dur: .85, wait: .2 }),
      tween('@cc', '--flip', 0, 1, { dur: 1.1, ease: 'ios', wait: .05 }),
      pause(1.7),
      caption('Save it to your contacts.'),
      tap('@cc-add', { dur: .8 }),
      set('@cc-add', { class: '+is-saved' }), set('@cc-add-label', { text: 'Saved' }),
      ...toast('Added to Contacts', { wait: .15 }),
      pause(2.3),
      unzoom({ dur: 1.1 }),
      pause(.4),
    ],
  };
}

export default film('tall');    // 9:16 first: the layout most people record
