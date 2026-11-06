/* The two films. Both start at 0 s on the same clock (section.js); neither has a title band, a chapter card or a
   closing frame, because the lane around each window does that job.

     old       the old way, as it was really done: written from your recording of the old run (AGENT.md, step 1).
               It plays at real speed until your product is done, then the rest is fast-forwarded to the
               measured time. So the first stretch must be honest, real-speed footage of the real steps.
     product   your product doing the same task. Its last click is the finish line unless race.js gives a time.

   The clocks and click counters never come from these films; they come from race.js. Reference: ../tour/README.md.
   '@name' means [data-tour="name"]. Check a moment with ?t=9 (the race at 9 s on the wall clock). */
import { move, click, dblclick, type, key, zoom, unzoom, show, hide, set, tween, pause } from '../tour/tour.js';

const spin = (dur) => tween('@spin', '--a', 0, dur * 330, { dur, ease: 'linear' });     // a spinner as a function of t
const n = (v) => Math.round(v).toLocaleString('en-US');

// one copy-paste trip: dashboard value → spreadsheet cell
const trip = (i, value, first) => [
  ...(first ? [] : [click('@tab-dash', { dur: .85 }), set('@old', { 'data-view': 'dash' }), set(`@c${i - 1}`, { class: '-is-sel' }), pause(.35)]),
  dblclick(`@m${i}`, { dur: .9, aim: [.4, .55] }), set(`@m${i}`, { class: '+is-sel' }),
  key(['⌘', 'C'], { parallel: true, hold: 1 }), pause(.75),
  click('@tab-sheet', { dur: .85 }), set('@old', { 'data-view': 'sheet' }), set(`@m${i}`, { class: '-is-sel' }), pause(.3),
  click(`@c${i}`, { dur: .8 }), set(`@c${i}`, { class: '+is-sel' }),
  key(['⌘', 'V'], { parallel: true, hold: 1 }), pause(.45),
  set(`@c${i}`, { text: value }), set('@fx', { text: value }), pause(.4),
];

export default {
  old: {
    size: [880, 580],
    enter: [.78, .96],
    intro: 0, settle: .3, outro: .2,
    still: 7.6,
    steps: [
      pause(.4),
      ...trip(1, '1,204', true),
      ...trip(2, '318'),
      ...trip(3, '2,046'),
      ...trip(4, '1.9%'),
      // export it
      click('@file', { dur: .9 }), show('@menu', { dur: .2 }), pause(.3),
      click('@download', { dur: .7 }), hide('@menu', { dur: .15 }),
      show('@scrim'), show('@wait', { dur: .3 }), spin(3.4), pause(3.4),
      hide('@wait'), hide('@scrim'), pause(.3),
      // mail it
      click('@tab-mail', { dur: 1 }), set('@old', { 'data-view': 'mail' }), pause(.3),
      click('@compose', { dur: .9 }), show('@draft', { dur: .3 }), pause(.3),
      click('@to', { dur: .8, aim: [.2, .5] }), type('@to', 'The team', { rhythm: 'human' }), pause(.2),
      click('@subject', { dur: .6, aim: [.2, .5] }), type('@subject', 'Weekly numbers', { rhythm: 'human' }), pause(.3),
      click('@attach', { dur: .8 }), show('@scrim'), show('@pick', { dur: .3 }), pause(.5),
      click('@file-csv', { dur: .8 }), set('@file-csv', { class: '+is-on' }), pause(.2),
      click('@pick-ok', { dur: .7 }), hide('@pick'), hide('@scrim'),
      show('@att', { dur: .3 }), pause(2.6),
      set('@att-state', { text: 'Attached' }), pause(.4),
      click('@send-old', { dur: .9 }), hide('@draft', { dur: .3 }), show('@sent-old', { dur: .35 }),
      pause(1.2),
    ],
  },

  product: {
    size: [880, 580],
    enter: [.84, .96],
    intro: 0, settle: .4, outro: .2,
    still: 7.4,
    steps: [
      pause(.6),
      click('@report', { dur: 1, aim: [.3, .5] }),
      tween('@panel', '--open', 0, 1, { dur: .55, ease: 'ios' }),
      pause(.7),
      click('@run', { dur: .85 }),
      set('@status', { text: 'Fetching…' }),
      zoom('.vs-kpis', 'fit', { fill: [.8, .9], dur: 1.1, wait: .2 }),
      tween('@k1', 'text', 0, 1204, { dur: .8, wait: .5, fmt: n }),
      tween('@k2', 'text', 0, 318, { dur: .8, wait: .62, fmt: n }),
      tween('@k3', 'text', 0, 2046, { dur: .8, wait: .74, fmt: n }),
      set('@k4', { text: '1.9%' }, { wait: 1.1 }),
      tween('@bars', '--g', 0, 1, { dur: .9, wait: .6 }),
      set('@panel', { class: '+is-fresh' }, { wait: 1.4 }),
      set('@status', { text: 'Up to date · just now' }, { wait: 1.4 }),
      pause(2.1),
      unzoom({ dur: 1 }),
      click('@send', { dur: .9 }), show('@sendbox', { dur: .3, ease: 'out' }),
      pause(.5),
      click('@send-now', { dur: .8 }), hide('@sendbox', { dur: .25 }), show('@toast', { wait: .1 }),
      pause(1.6),
    ],
  },
};
