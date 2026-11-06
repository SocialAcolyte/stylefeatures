/* The tour slides' films: one per tour slide (data-film="0", "1", …), each 7–12 s, one step of the product and
   nothing else. A slide's film starts when the slide has arrived and holds on its last frame, so end on the result.

     start   the state the film opens in, applied at 0 s. Films don't follow on from each other (people jump around
             the deck, and the overview shows every slide at once), so each one sets up its own screen.
     steps   the film. No chapter cards or captions: the slide's own words say what it is.
     still   the moment shown with reduced motion, in the overview before a slide has played, and in thumbnails.

   '@name' means [data-tour="name"]. Reference: ../tour/README.md. Check slide 4 at 3 s into its film with ?slide=4&t=3. */
import { move, click, type, key, zoom, unzoom, show, hide, set, tween, drag, pause } from '../tour/tour.js';

// the workspace with the project already made: where films 2 and 3 begin
const made = [set('.app-card', { '--in': 1 }), set('@empty', { '--in': 0 }), set('@count', { text: '6' }), set('@recent-new', { '--in': 1 })];

export default {
  size: [1200, 750],
  enter: [.84, .97],
  films: [
    { // Start from nothing
      still: 6.2,
      steps: [
        click('@new', { dur: 1.1 }),
        show('@scrim'), show('@modal', { dur: .4 }),
        zoom('@modal', 'fit', { fill: [.62, .9], dur: 1.15 }),
        pause(.35),
        click('@name', { dur: .75, aim: [.3, .6] }),
        type('@name-text', 'Launch plan', { rhythm: 'human' }),
        pause(.2),
        click('@create', { dur: .9 }),
        hide('@modal'), hide('@scrim', { dur: .35 }), unzoom({ dur: 1.2 }),
        hide('@empty', { dur: .25 }),
        show('.app-card', { dur: .55, stagger: .07, wait: .15 }),
        tween('@count', 'text', 0, 6, { dur: .7, wait: .15, fmt: Math.round }),
        show('@recent-new', { wait: .4, dur: .4 }),
        show('@toast', { wait: .45 }), hide('@toast', { wait: 2.3 }),
        pause(1.6),
      ],
    },
    { // Make it yours
      start: made,
      still: 5.4,
      steps: [
        click('@card-1', { dur: 1.05, aim: [.45, .4] }),
        set('@card-1', { class: '+is-sel' }),
        tween('@app', '--insp', 0, 1, { dur: .6 }),
        zoom('@inspector', 1.45, { aim: [.5, .42], wait: .2 }),
        pause(.6),
        click('@toggle-1', { dur: .8 }),
        tween('@toggle-1', '--on', 0, 1, { dur: .22 }),
        drag('@knob', { el: '@slider', prop: '--v', from: .3, to: .78, dur: 1.2, text: ['@slider-val', (v) => Math.round(v * 100) + '%'] }),
        click('@tone-3', { dur: .8 }),
        set('@tone-3', { class: '+is-on' }), set('@tone-1', { class: '-is-on' }),
        set('@card-1', { 'data-tone': '3' }), set('@insp-cover', { 'data-tone': '3' }), set('@recent-new i', { 'data-tone': '3' }),
        pause(.7),
        unzoom({ dur: 1.2 }),
        pause(1),
      ],
    },
    { // Share it in one step
      start: made,
      still: 4.6,
      steps: [
        click('@share', { dur: 1.05 }),
        show('@sharebox', { dur: .3 }),
        zoom('@sharebox', 'fit', { fill: [.52, .86], dur: 1.2, wait: .1 }),
        pause(.7),
        click('@copy', { dur: .8 }),
        set('@copy', { text: 'Copied' }),
        key(['⌘', 'C'], { parallel: true }),
        set('@toast-text', { text: 'Link copied' }), show('@toast'), hide('@toast', { wait: 2.2 }),
        pause(1.5),
        unzoom({ dur: 1.2 }),
        hide('@sharebox', { wait: .5 }),
        move('@card-1', { dur: 1.1, aim: [.6, .5] }),
        pause(.8),
      ],
    },
  ],
};
