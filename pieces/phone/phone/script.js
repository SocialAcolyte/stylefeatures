/* The app film's script: where the finger goes, what each touch changes, where the camera looks, the chapters.
   One idea per chapter, every touch visibly changes something, 30–45 s in all. A finger is unseen between
   touches, so give each one a beat (dur .7–1 s is the hand travelling). '@name' means [data-tour="name"].
   Engine reference: ../tour/README.md. Transitions: moves.js. Check any moment with ?t=12.5 in the address. */
import { tap, longpress, swipe, type, zoom, unzoom, set, tween, chapter, caption, pause } from '../tour/tour.js';
import { push, pop, sheet, unsheet, tab, keyboard, toast } from './moves.js';

export default {
  size: [390, 844],        // the screen in points (iPhone 15). Match data-size on the window.
  pointer: 'touch',        // a fingertip, not an arrow
  intro: 1.3,              // seconds the opening band takes to fade
  outro: 4.8,              // seconds held on the closing frame
  still: 18.1,             // the moment shown with reduced motion: the sheet open, the name typed
  steps: [
    pause(1.6),

    chapter('01 / 04', 'Everything at a <em>glance</em>', 'The home screen, from the top to the last thing you saw.'),
    caption('Swipe through what’s featured.'),
    swipe('@car', { by: [-170, 4], dur: .3, el: '@car-track', prop: '--car', from: 0, to: 1, coast: .75, aim: [.62, .5] }),
    pause(.45),
    caption('Scroll for everything recent.'),
    swipe('@feed', { by: [6, -210], dur: .3, scroll: '@row-3', offset: 230, coast: 1.05, aim: [.55, .78] }),
    pause(1),

    chapter('02 / 04', 'Open <em>anything</em>', 'A tap goes deeper; Back brings you home.'),
    caption('Tap a row to open it.'),
    tap('@row-3', { dur: .8, aim: [.42, .5] }),
    ...push('@home', '@detail'),
    pause(.85),
    zoom('@acts', 1.55, { dur: 1.1 }),
    pause(.35),
    caption('Save it for later.'),
    tap('@save', { dur: .75 }),
    set('@save', { class: '+is-saved' }), set('@save-label', { text: 'Saved' }),
    ...toast('Saved', { wait: .1 }),
    pause(1.3),
    unzoom({ dur: 1 }),
    tap('@back', { dur: .9, aim: [.35, .5] }),
    ...pop('@detail', '@home'),
    pause(.7),

    chapter('03 / 04', 'Add in <em>seconds</em>', 'A sheet slides up, and the keyboard is already there.'),
    caption('Tap + to add something new.'),
    tap('@add', { dur: .85 }),
    ...sheet(),
    pause(.6),
    tap('@field', { dur: .7, aim: [.3, .62] }),
    ...keyboard(true),
    caption('Name it.', { wait: .2 }),
    type('@field-text', 'Weekend plan', { cps: 9, rhythm: 'human', lead: .35 }),
    pause(.35),
    tap('@kind-2', { dur: .75 }),
    set('@kind-2', { class: '+is-on' }), set('@kind-1', { class: '-is-on' }),
    pause(.45),
    caption('Add, and it’s in your library.'),
    tap('@sheet-add', { dur: .8 }),
    ...keyboard(false), ...unsheet(),
    ...toast('Added to Library', { wait: .35 }),
    pause(1.5),

    chapter('04 / 04', 'Keep it <em>close</em>', 'Press and hold anything for what else it can do.'),
    caption('Open your library.'),
    tap('@tab-lib', { dur: .9 }),
    ...tab('@home', '@library', '@tab-home', '@tab-lib'),
    pause(.7),
    caption('Press and hold to pin it.'),
    longpress('@lib-new', { dur: .85, hold: .6, aim: [.4, .5] }),
    tween('@library', '--menu', 0, 1, { dur: .5, ease: 'spring' }),
    zoom('@lib-new', 1.45, { dur: 1, wait: .1, aim: [.36, 1.9] }),
    pause(.9),
    tap('@pin', { dur: .75, aim: [.3, .5] }),
    tween('@library', '--menu', 1, 0, { dur: .32, ease: 'out', wait: .05 }),
    set('@lib-new', { class: '+is-pinned' }),
    ...toast('Pinned', { wait: .3 }),
    pause(1.4),
    unzoom({ dur: 1 }),
    pause(.6),
  ],
};
