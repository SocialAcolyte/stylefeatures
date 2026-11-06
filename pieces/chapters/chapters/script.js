/* The chapter scripts: one short film per feature, in the same order as the chapters in the page.
   Each one is 8–15 s, shows one idea, and ends unzoomed on its result. Reference for the steps: ../tour/README.md.

     start   the state this chapter opens in, applied at 0 s (set() is instant). Chapters don't follow on from
             each other, because people scroll in at any point; each one sets up its own screen.
     steps   the film. section.js puts a short beat in front of it, and in ?record a title band and a closing frame.
     still   the moment shown with reduced motion (and the poster frame in thumbnails).

   '@name' means [data-tour="name"]. Check a chapter alone with ?record&chapter=2&t=4. */
import { move, click, dblclick, hover, type, drag, scroll, key, zoom, unzoom, show, hide, set, tween, caption, pause } from '../tour/tour.js';

// the workspace with the new project already in it: where chapters 2–4 begin
const made = [set('.app-card', { '--in': 1 }), set('@empty', { '--in': 0 }), set('@count', { text: '6' }), set('@recent-new', { '--in': 1 })];

export default {
  size: [1200, 750],        // the window's design size (data-size on each window)
  enter: [.84, .97],        // where the cursor comes in from, as fractions of the window
  fit: [.92, .88, .5],      // how much of the pinned slot the window takes (README: fit)
  chapters: [
    { // 01 · Start from nothing
      still: 4.7,
      steps: [
        caption('Press New to start a project.'),
        click('@new', { dur: 1.1 }),
        show('@scrim'), show('@modal', { dur: .4 }),
        zoom('@modal', 'fit', { fill: .6, dur: 1.15 }),
        pause(.35),
        click('@name', { dur: .75, aim: [.3, .6] }),
        caption('Give it a name and pick where it starts.'),
        type('@name-text', 'Launch plan', { rhythm: 'human' }),
        pause(.2),
        click('@tpl-2', { dur: .8 }),
        set('@tpl-2', { class: '+is-on' }), set('@tpl-1', { class: '-is-on' }),
        pause(.25),
        click('@create', { dur: .85 }),
        hide('@modal'), hide('@scrim', { dur: .35 }), unzoom({ dur: 1.2 }),
        hide('@empty', { dur: .25 }),
        show('.app-card', { dur: .55, stagger: .07, wait: .15 }),
        tween('@count', 'text', 0, 6, { dur: .7, wait: .15, fmt: Math.round }),
        show('@recent-new', { wait: .4, dur: .4 }),
        show('@toast', { wait: .45 }), hide('@toast', { wait: 2.3 }),
        pause(1.7),
      ],
    },
    { // 02 · Make it yours
      start: made,
      still: 4.4,
      steps: [
        caption('Select a project to see its settings.'),
        click('@card-1', { dur: 1.05, aim: [.45, .4] }),
        set('@card-1', { class: '+is-sel' }),
        tween('@app', '--insp', 0, 1, { dur: .6 }),
        zoom('@inspector', 1.45, { aim: [.5, .42], wait: .2 }),
        pause(.6),
        click('@toggle-1', { dur: .8 }),
        tween('@toggle-1', '--on', 0, 1, { dur: .22 }),
        caption('Drag to adjust; the project follows.', { wait: .2 }),
        drag('@knob', { el: '@slider', prop: '--v', from: .3, to: .78, dur: 1.2, text: ['@slider-val', (v) => Math.round(v * 100) + '%'] }),
        click('@tone-3', { dur: .8 }),
        set('@tone-3', { class: '+is-on' }), set('@tone-1', { class: '-is-on' }),
        set('@card-1', { 'data-tone': '3' }), set('@insp-cover', { 'data-tone': '3' }), set('@recent-new i', { 'data-tone': '3' }),
        pause(.7),
        unzoom({ dur: 1.2 }),
        pause(1.1),
      ],
    },
    { // 03 · See the whole picture
      start: made,
      still: 6.6,
      steps: [
        caption('Double-click to open it full size.'),
        dblclick('@card-1', { dur: 1, aim: [.5, .45] }),
        tween('@room', '--open', 0, 1, { dur: .8 }),
        pause(.9),
        move('@room-scroll', { dur: .7, aim: [.62, .55] }),
        scroll('@room-scroll', '@stats', { dur: 1.5, offset: 120 }),
        zoom('@stats', 'fit', { fill: .62, dur: 1.2 }),
        caption('Every number, one glance.', { wait: .4 }),
        hover('@stat-2', { dur: .8, hold: .3, aim: [.5, .62] }),
        show('@tip', { dur: .3 }),
        pause(1.2),
        hide('@tip'),
        unzoom({ dur: 1.2 }),
        pause(.8),
      ],
    },
    { // 04 · Share it in one step
      start: made,
      still: 4.1,
      steps: [
        caption('Share makes a link your whole team can open.'),
        click('@share', { dur: 1.05 }),
        show('@sharebox', { dur: .3 }),
        zoom('@sharebox', 'fit', { fill: .52, dur: 1.2, wait: .1 }),
        pause(.7),
        click('@copy', { dur: .8 }),
        set('@copy', { text: 'Copied' }),
        key(['⌘', 'C'], { parallel: true }),
        set('@toast-text', { text: 'Link copied' }), show('@toast'), hide('@toast', { wait: 2.2 }),
        pause(1.5),
        unzoom({ dur: 1.2 }),
        hide('@sharebox', { wait: .5 }),
        move('@card-1', { dur: 1.1, aim: [.6, .5] }),
        pause(1),
      ],
    },
  ],
};
