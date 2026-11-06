/* The loop: just the one feature, 10–20 s, a scripted cursor. It plays on its own when it scrolls into view and
   starts again at the end; in ?record it plays once between a headline card and an update card.
   Two zooms at most, every click changes something, captions say it for muted viewers.
   '@name' means [data-tour="name"]; plain CSS selectors work too. Engine reference: ../tour/README.md. */
import { click, hover, zoom, unzoom, show, hide, set, tween, caption, pause } from '../tour/tour.js';

const rec = new URLSearchParams(location.search).has('record');

export default {
  size: [1200, 750],       // the window's design size (matches data-size)
  enter: [.62, .92],       // where the cursor comes in from
  loop: true,              // on the page it loops; ?record plays it once
  intro: rec ? 1.5 : 0,    // the headline card, recordings only
  outro: rec ? 3.8 : .8,   // the update card in a recording; a breath before the loop starts again
  settle: .4,
  still: 7.4,              // the moment shown with reduced motion: filtered, the chip in place
  steps: [
    pause(rec ? 2 : .9),
    caption('Filter any list in two clicks.'),
    click('@filter', { dur: 1.05 }),
    show('@pop', { dur: .22, ease: 'out' }),
    zoom('@pop', 1.6, { dur: 1.1, aim: [.3, .45] }),
    pause(.45),
    hover('@opt-todo', { dur: .6, hold: .2, aim: [.35, .5] }),
    click('@opt-prog', { dur: .45, aim: [.35, .5] }),
    set('@opt-prog', { class: '+is-on' }),
    hide('.ln-row:not([data-st=prog])', { dur: .38, stagger: .045 }),
    show('@chips', { dur: .35, wait: .1 }),
    tween('@count', 'text', 8, 3, { dur: .45, fmt: Math.round }),
    caption('The list follows as you choose.', { wait: .2 }),
    pause(1.5),
    hide('@pop', { dur: .2 }),
    zoom('@chips', 1.5, { dur: 1.1, aim: [.26, .5] }),
    pause(.3),
    caption('Save it as a view to come back to.'),
    click('@save-view', { dur: 1.1 }),
    show('@toast', { dur: .3 }), hide('@toast', { wait: 1.9 }),
    pause(1.1),
    unzoom({ dur: 1.2 }),
    show('@view-new', { dur: .45, wait: .5 }),
    caption('It waits in the sidebar.', { wait: .5 }),
    hover('@view-new', { dur: 1.3, hold: 1.2, aim: [.4, .5] }),
    pause(.8),
  ],
};
