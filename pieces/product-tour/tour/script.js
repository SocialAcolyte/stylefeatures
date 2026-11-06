/* The tour script: what the cursor does, what each click changes, where the camera looks, and the chapter cards.
   One idea per chapter, every click visibly changes something, push in only on what matters, 35–45 s in all.
   Steps run in order; side steps (show, hide, set, tween, zoom, chapter, caption) start alongside the step after them.
   '@name' means [data-tour="name"]. Reference: README.md. Check any moment with ?t=12.5 in the address. */
import { move, click, dblclick, hover, type, drag, scroll, key, zoom, unzoom, show, hide, set, tween, chapter, caption, pause } from './tour.js';

export default {
  size: [1200, 750],        // the window's design size, px (matches data-size on the window)
  enter: [.84, .97],        // where the cursor comes in from, as fractions of the window
  intro: 1.3,               // seconds the opening band takes to clear once it plays
  outro: 4.6,               // seconds held on the closing frame
  still: 17.4,              // the moment shown with reduced motion
  steps: [
    pause(1.5),

    chapter('01 / 04', 'Start from <em>nothing</em>', 'An empty workspace and one button to begin.'),
    caption('Press New to start a project.'),
    click('@new', { dur: 1.15 }),
    show('@scrim'), show('@modal', { dur: .4 }),
    zoom('@modal', 'fit', { fill: .58, dur: 1.2 }),
    pause(.45),
    click('@name', { dur: .75, aim: [.3, .6] }),
    caption('Give it a name and pick where it starts.'),
    type('@name-text', 'Launch plan'),
    pause(.25),
    click('@tpl-2', { dur: .8 }),
    set('@tpl-2', { class: '+is-on' }), set('@tpl-1', { class: '-is-on' }),
    pause(.3),
    click('@create', { dur: .85 }),
    hide('@modal'), hide('@scrim', { dur: .35 }), unzoom({ dur: 1.3 }),
    hide('@empty', { dur: .25 }),
    show('.app-card', { dur: .55, stagger: .07, wait: .15 }),
    tween('@count', 'text', 0, 6, { dur: .7, wait: .15, fmt: Math.round }),
    show('@recent-new', { wait: .4, dur: .4 }),
    show('@toast', { wait: .45 }), hide('@toast', { wait: 2.5 }),
    pause(1.7),

    chapter('02 / 04', 'Make it <em>yours</em>', 'Settings sit beside the work, not behind a menu.'),
    caption('Select a project to see its settings.'),
    click('@card-1', { dur: 1.05, aim: [.45, .4] }),
    set('@card-1', { class: '+is-sel' }),
    tween('@app', '--insp', 0, 1, { dur: .6 }),
    zoom('@inspector', 1.5, { aim: [.5, .4], wait: .2 }),
    pause(.7),
    click('@toggle-1', { dur: .8 }),
    tween('@toggle-1', '--on', 0, 1, { dur: .22 }),
    caption('Drag to adjust; the project follows.', { wait: .2 }),
    drag('@knob', { el: '@slider', prop: '--v', from: .3, to: .78, dur: 1.25, text: ['@slider-val', (v) => Math.round(v * 100) + '%'] }),
    click('@tone-3', { dur: .8 }),
    set('@tone-3', { class: '+is-on' }), set('@tone-1', { class: '-is-on' }),
    set('@card-1', { 'data-tone': '3' }), set('@insp-cover', { 'data-tone': '3' }), set('@recent-new i', { 'data-tone': '3' }),
    pause(.7),
    unzoom({ dur: 1.2 }),
    pause(.9),

    chapter('03 / 04', 'See the <em>whole</em> picture', 'Open a project and everything in it is right there.'),
    caption('Double-click to open it full size.'),
    click('@insp-close', { dur: .85 }),
    tween('@app', '--insp', 1, 0, { dur: .5 }), set('@card-1', { class: '-is-sel' }),
    pause(.2),
    dblclick('@card-1', { dur: .95, aim: [.5, .45] }),
    tween('@room', '--open', 0, 1, { dur: .8 }),
    pause(.9),
    move('@room-scroll', { dur: .7, aim: [.62, .55] }),
    scroll('@room-scroll', '@stats', { dur: 1.5, offset: 120 }),
    zoom('@stats', 'fit', { fill: .62, dur: 1.2 }),
    hover('@stat-2', { dur: .8, hold: .3, aim: [.5, .62] }),
    show('@tip', { dur: .3 }),
    pause(1.1),
    hide('@tip'),
    unzoom({ dur: 1.2 }),
    pause(.5),

    chapter('04 / 04', 'Share it in <em>one</em> step', 'Send a link and people see exactly what you see.'),
    caption('Share makes a link your whole team can open.'),
    click('@share', { dur: 1.05 }),
    show('@sharebox', { dur: .3 }),
    zoom('@sharebox', 'fit', { fill: .5, dur: 1.2, wait: .1 }),
    pause(.55),
    click('@copy', { dur: .8 }),
    set('@copy', { text: 'Copied' }),
    key(['⌘', 'C'], { parallel: true }),
    set('@toast-text', { text: 'Link copied' }), show('@toast'), hide('@toast', { wait: 2 }),
    pause(1.3),
    unzoom({ dur: 1.2 }),
    hide('@sharebox', { wait: .5 }),
    pause(.9),
  ],
};
