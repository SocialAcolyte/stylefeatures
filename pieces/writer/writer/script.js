/* The film: the site itself, in four chapters of about ten seconds. On the page it plays while it's on screen and
   starts again at the end; in ?record it plays once between a title card and an end card.
   1 Read: an essay is opened from the index.   2 Quote: a line is underlined and sets itself as a card, with a link
   straight back to that line.   3 Watch: a talk plays as slides beside its transcript; a line jumps to its moment.
   4 Subscribe: an address typed, the letter confirmed, the contact address arrives.
   Chapter titles are the words under the film (and above it in a recording), so keep each to one word.
   '@name' means [data-tour="name"]. Engine reference: ../tour/README.md. Freeze any moment with ?t=12.5. */
import { move, click, hover, type, drag, scroll, zoom, unzoom, show, hide, set, tween, chapter, caption, pause } from '../tour/tour.js';

const rec = new URLSearchParams(location.search).has('record');
const mmss = (v) => `${Math.floor(v / 60)}:${String(Math.floor(v % 60)).padStart(2, '0')}`;
const nav = (to) => [
  set('@nav-writing', { class: to === 'writing' ? '+is-on' : '-is-on' }),
  set('@nav-talks', { class: to === 'talks' ? '+is-on' : '-is-on' }),
  set('@nav-letters', { class: to === 'letters' ? '+is-on' : '-is-on' }),
];
// a slide and its transcript line arrive together; the progress line runs on to the next one
const beat = (n, from, to, s0, s1, dur) => [
  show(`@slide-${n}`, { dur: .45 }),
  ...[1, 2, 3, 4, 5].filter((k) => k < n).map((k) => set(`@ln-${k}`, { class: '-is-on +is-past' })),
  set(`@ln-${n}`, { class: '+is-on' }),
  tween('@track', '--p', from, to, { dur, ease: 'linear' }),
  tween('@time', 'text', s0, s1, { dur, ease: 'linear', fmt: mmss }),
];

export default {
  size: [1200, 750],        // the window's design size (data-size); data-size-tall="480x780" on phones and 9:16
  enter: [.74, .92],
  loop: true,               // on the page it loops; ?record plays it once
  intro: rec ? 1.6 : 0,     // the title card, recordings only
  outro: rec ? 4.2 : 1.2,   // the end card in a recording; a breath before the loop on the page
  settle: .5,
  still: 14,                // reduced motion shows the quote card (page timeline)
  steps: [
    pause(rec ? 2.2 : 1),

    chapter('01 / 04', 'Read', 'The essays, newest first.'),
    caption('The essays, newest first.'),
    hover('@essay-3', { dur: 1.05, hold: .2, aim: [.3, .5] }),
    move('@essay-1', { dur: .7, aim: [.32, .5] }),
    tween('@essay-1', '--u', 0, 1, { dur: .5, ease: 'out' }),
    pause(.25),
    click('@essay-1', { dur: .2, aim: [.32, .5] }),
    hide('@home', { dur: .3 }), show('@post', { dur: .55, wait: .12, ease: 'out' }),
    pause(.8),
    move('@post-scroll', { dur: .7, aim: [.66, .58] }),
    scroll('@post-scroll', '@q', { dur: 1.7, offset: 300 }),
    pause(.2),

    chapter('02 / 04', 'Quote', 'Underline a line and it becomes a card.'),
    caption('Underline the line worth keeping.'),
    zoom('@line', 'fit', { fill: [.6, .8], dur: 1.3, aim: [.5, .2] }),
    drag('@line-end', { el: '@line', prop: '--sel', from: 0, to: 1, approach: .95, dur: 1.25 }),
    show('@tools', { dur: .25, ease: 'out', wait: .05 }),
    pause(.3),
    click('@quote-btn', { dur: .6 }),
    hide('@tools', { dur: .2 }),
    show('@scrim', { dur: .55 }), show('@card', { dur: .75, ease: 'ios', wait: .05 }), show('@acts', { dur: .4, wait: .5 }),
    zoom('@card', 'fit', { fill: [.66, .94], dur: 1.3, wait: .15 }),
    caption('It sets itself as a card, with a link to that exact line.', { wait: .3 }),
    move('@copy', { dur: 1.1, aim: [.4, 2.2], wait: .5 }),     // off the card while it's read
    pause(.6),
    click('@copy', { dur: .6 }),
    set('@copy', { text: 'Link copied' }),
    show('@toast', { wait: .05 }),
    pause(1.3),
    unzoom({ dur: 1.1 }),
    pause(.5),

    chapter('03 / 04', 'Watch', 'Talks play as slides, the words beside them.'),
    caption('Talks play as slides, with the words beside them.'),
    click('@nav-talks', { dur: 1 }),
    ...nav('talks'),
    hide('@post', { dur: .3 }), hide('@toast', { dur: .2 }), show('@talk', { dur: .55, wait: .12, ease: 'out' }),
    pause(.7),
    click('@play', { dur: .9 }),
    hide('@play', { dur: .25 }), set('@pp', { class: '+is-playing' }), set('@ln-1', { class: '+is-on' }),
    tween('@track', '--p', 0, .12, { dur: 2, ease: 'linear' }), tween('@time', 'text', 0, 174, { dur: 2, ease: 'linear', fmt: mmss }),
    zoom('@player', 'fit', { fill: [.96, .98], dur: 1.2, wait: .1 }),
    pause(2),
    ...beat(2, .12, .27, 174, 392, 1.9),
    pause(1.9),
    ...beat(3, .27, .36, 392, 520, 1.4),
    caption('Any line takes you to its moment.'),
    pause(.3),
    click('@ln-5', { dur: 1, aim: [.36, .5] }),
    ...beat(5, .86, .87, 1248, 1262, .9),
    pause(1.6),
    unzoom({ dur: 1.1 }),
    pause(.3),

    chapter('04 / 04', 'Subscribe', 'A letter, and a way to reach you.'),
    caption('A letter when there’s something worth sending.'),
    click('@nav-letters', { dur: 1 }),
    ...nav('letters'),
    hide('@talk', { dur: .3 }), show('@letters', { dur: .55, wait: .12, ease: 'out' }),
    pause(.6),
    zoom('@form', 'fit', { fill: [.8, .96], dur: 1.2 }),
    click('@email', { dur: .9, aim: [.2, .55] }),
    type('@email-text', 'you@example.com', { rhythm: 'human', cps: 15, lead: .2, caret: .4 }),
    pause(.2),
    click('@subscribe', { dur: .75 }),
    set('@subscribe', { text: 'Subscribed', class: '+is-done' }),
    show('@done', { dur: .45, wait: .1 }),
    pause(.9),
    unzoom({ dur: 1.2 }),
    show('@contact', { dur: .6, wait: .3 }),
    caption('And one address for everything else.', { wait: .3 }),
    pause(2.6),
  ],
};
