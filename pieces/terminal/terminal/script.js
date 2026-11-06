/* The terminal film's script: commands typed with a human rhythm, output streaming in line by line, then a pan to
   what the command made. Same engine and vocabulary as the product tour (README.md in ../tour/); the pieces this
   format leans on:
     type('@cmd-1', 'npm i -g x', { rhythm: 'human', lead: .5, caret: .3 })   a person at a keyboard
     stream('@out-1 > *')        reveal the output lines one by one (data-tour-wait="1.2" on a line = a slow step)
     tween('@bar-2', '--p', 0, 1, { dur: 2.2, block: true })   a progress bar; the percentage is a text tween
     set('@browser', { class: '+is-front' }), zoom('@browser', 'fit')   bring the result forward and pan to it
   Check any moment with ?t=12.5 in the address. */
import { click, type, key, zoom, unzoom, show, hide, set, tween, stream, scroll, hover, move, chapter, caption, pause } from '../tour/tour.js';

const SPIN = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';
const spinner = (el, dur, o = {}) => tween(el, 'text', 0, dur * 12, { dur, ease: (t) => t, fmt: (v) => (v >= dur * 12 - .01 ? '✓' : SPIN[Math.floor(v) % 10]), ...o });
const pct = (v) => Math.round(v) + '%';
const typed = (el, text, o = {}) => type(el, text, { rhythm: 'human', cps: 12, lead: .55, caret: .3, ...o });
const enter = (o = {}) => key(['return'], { parallel: true, hold: .9, ...o });

export default {
  size: [1280, 800],        // the desk (data-size); sizeTall comes from data-size-tall on the window
  enter: [.62, .96],        // where the cursor comes in from, as fractions of the desk
  intro: 1.3,
  outro: 4.6,
  still: 26,                // reduced motion: the page open in front, the terminal behind it
  steps: [
    zoom('@term', 'fit', { fill: [.76, .96], dur: 1.5, at: .25 }),
    pause(1.6),

    chapter('01 / 04', 'Install in <em>one</em> line', 'Nothing to set up first. One command and it’s there.'),
    caption('Install it with one command.'),
    typed('@cmd-1', 'npm install -g yourtool'),
    enter(),
    spinner('@spin-1', 1.6, { wait: .35 }), set('@spin-1', { class: '+t-green' }, { wait: 1.95 }),
    stream('@out-1 > *'),
    set('@cmd-2', { class: '+is-caret' }),
    pause(1.2),

    chapter('02 / 04', 'Start something <em>new</em>', 'A project, its files and its dependencies, in a few seconds.'),
    caption('One command makes a new project.'),
    typed('@cmd-2', 'yourtool new my-site'),
    enter(),
    stream('@out-2a > *'),
    tween('@pct-2', 'text', 0, 100, { dur: 2.3, fmt: pct }),
    tween('@bar-2', '--p', 0, 1, { dur: 2.3, block: true }),
    stream('@out-2b > *'),
    set('@cmd-3', { class: '+is-caret' }),
    pause(1.1),

    chapter('03 / 04', 'See it <em>running</em>', 'A local server, and the page it serves, a moment later.'),
    caption('Start the dev server.'),
    typed('@cmd-3', 'cd my-site && yourtool dev'),
    enter(),
    stream('@out-3 > *'),
    pause(.5),
    caption('⌘-click the address to open it.'),
    key(['⌘'], { parallel: true, wait: .75, hold: .8 }),
    click('@link', { dur: 1.05, aim: [.42, .55] }),
    set('@browser', { class: '+is-front' }),
    zoom('@browser', 'fit', { fill: [.8, .96], dur: 1.45, wait: .1 }),
    tween('@load', '--p', 0, 1, { dur: 1.1, wait: .2 }),
    hide('@idle', { dur: .2, wait: .4 }), show('@page', { dur: .3, wait: .55 }),
    show('@page .res-blk', { dur: .5, stagger: .09, wait: .6 }),
    pause(2.1),
    caption('Your page, live on your machine.'),
    move('@page', { dur: .8, aim: [.6, .62] }),
    scroll('@page', '@res-2', { dur: 1.5, offset: 40 }),
    pause(.5),
    scroll('@page', 0, { dur: 1.1 }),
    hover('@res-cta', { dur: .85, hold: .9 }),
    pause(.3),

    chapter('04 / 04', 'Ship it <em>anywhere</em>', 'One more command and it’s live, with an address to share.'),
    caption('Back in the terminal: stop it, then deploy.'),
    unzoom({ dur: 1.2 }),
    click('@term > .tour-chrome', { dur: 1.1, aim: [.3, .5], wait: .2 }),
    set('@browser', { class: '-is-front' }),
    zoom('@term', 'fit', { fill: [.76, .96], dur: 1.3 }),
    move('@screen', { dur: 1, aim: [.9, .9] }),
    key(['⌃', 'C'], { hold: 1 }),
    stream('@out-3b > *'),
    typed('@cmd-4', 'yourtool deploy', { lead: .4 }),
    enter(),
    spinner('@spin-4', 1.5, { wait: .3 }), set('@spin-4', { class: '+t-green' }, { wait: 1.8 }),
    stream('@out-4a > *'),
    tween('@pct-4', 'text', 0, 100, { dur: 1.8, fmt: pct }),
    tween('@bar-4', '--p', 0, 1, { dur: 1.8, block: true }),
    stream('@out-4b > *'),
    caption('Live, with an address to share.'),
    zoom('@live', 'fit', { fill: .6, dur: 1.2 }),
    pause(2),
  ],
};
