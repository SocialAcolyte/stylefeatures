/* tours.js: every tour the film layouts play, on the placeholder product in screens/. A slot names one with
   data-film="…". Write yours the same way, on your real screens: the engine's vocabulary is in
   tour/README.md, and its AGENT.md says how to pace one. Check any tour alone with ?record=<name>&t=4. */
import { move, click, dblclick, hover, type, drag, scroll, key, zoom, unzoom, show, hide, set, tween, chapter, caption, pause, tap, swipe } from '../tour/tour.js';

// a short tour: no title band, no closing frame; it holds its last frame a beat and ends (or loops)
const short = { intro: 0, outro: 0, settle: 1, enter: [.86, .96] };
// most short tours start in a workspace that already has projects in it, rather than the empty first run
const filled = [set('@empty', { '--in': 0 }), set('.app-card', { '--in': 1 }), set('@count', { text: '6' }), set('@recent-new', { '--in': 1 })];
const inspectorOpen = [set('@card-1', { class: '+is-sel' }), set('@app', { '--insp': 1 })];

/* the steps the longer films share, one idea each */
const createSteps = (cap) => [
  cap('Press New to start a project.'),
  click('@new', { dur: 1.05 }),
  show('@scrim'), show('@modal', { dur: .4 }),
  zoom('@modal', 'fit', { fill: .58, dur: 1.2 }),
  pause(.4),
  click('@name', { dur: .75, aim: [.3, .6] }),
  cap('Give it a name and pick where it starts.'),
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
];
const settingsSteps = (cap) => [
  cap('Select a project to see its settings.'),
  click('@card-1', { dur: 1.05, aim: [.45, .4] }),
  set('@card-1', { class: '+is-sel' }),
  tween('@app', '--insp', 0, 1, { dur: .6 }),
  zoom('@inspector', 1.5, { aim: [.5, .4], wait: .2 }),
  pause(.7),
  click('@toggle-1', { dur: .8 }),
  tween('@toggle-1', '--on', 0, 1, { dur: .22 }),
  cap('Drag to adjust; the project follows.', { wait: .2 }),
  drag('@knob', { el: '@slider', prop: '--v', from: .3, to: .78, dur: 1.25, text: ['@slider-val', (v) => Math.round(v * 100) + '%'] }),
];
const openSteps = (cap) => [
  cap('Double-click to open it full size.'),
  dblclick('@card-1', { dur: .95, aim: [.5, .45] }),
  tween('@room', '--open', 0, 1, { dur: .8 }),
  pause(.9),
  move('@room-scroll', { dur: .7, aim: [.62, .55] }),
  scroll('@room-scroll', '@stats', { dur: 1.5, offset: 120 }),
  zoom('@stats', 'fit', { fill: .62, dur: 1.2 }),
  cap('Everything about it, on one page.'),
  hover('@stat-2', { dur: .8, hold: .3, aim: [.5, .62] }),
  show('@tip', { dur: .3 }),
  pause(1.1),
  hide('@tip'),
  unzoom({ dur: 1.2 }),
];
const shareSteps = (cap) => [
  cap('Share makes a link your whole team can open.'),
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
];
const searchSteps = (cap) => [
  cap('Search finds it as you type.'),
  click('@search', { dur: 1, aim: [.35, .5] }),
  type('@search-text', 'launch', { cps: 9, parallel: true }),
  hide('.app-card:not([data-tour=card-1])', { wait: .35, dur: .3, stagger: .04 }),
  tween('@count', 'text', 6, 1, { wait: .45, dur: .4, fmt: Math.round }),
  pause(1.3),
  zoom('@card-1', 'fit', { fill: .5, dur: 1.1 }),
  hover('@card-1', { dur: .8, hold: .6, aim: [.5, .42] }),
  pause(.7),
  unzoom({ dur: 1.1 }),
];
const say = caption;              // captions on: the film says each step
const quiet = () => pause(0);     // captions off: the step is silent

export default {
  /* ── one feature each, 6–10 s: reel rows, trailer tiles ── */
  create: { ...short, still: 3.4, steps: [pause(.5), ...createSteps(say), pause(.8)] },
  settings: { ...short, still: 5, steps: [...filled, pause(.4), ...settingsSteps(say), pause(.6), unzoom({ dur: 1.1 }), pause(.3)] },
  open: { ...short, still: 5.6, steps: [...filled, pause(.4), ...openSteps(say)] },
  share: { ...short, still: 4.2, steps: [...filled, pause(.4), ...shareSteps(say)] },
  search: { ...short, still: 3.2, steps: [...filled, pause(.4), ...searchSteps(say)] },
  tone: { ...short, still: 2.8, steps: [...filled, ...inspectorOpen, pause(.4),
    caption('Pick a tone; the project changes with it.'),
    zoom('@inspector', 1.45, { aim: [.5, .62] }),
    click('@tone-3', { dur: .9 }),
    set('@tone-3', { class: '+is-on' }), set('@tone-1', { class: '-is-on' }), set('@card-1', { 'data-tone': '3' }), set('@insp-cover', { 'data-tone': '3' }),
    pause(.9),
    click('@tone-5', { dur: .7 }),
    set('@tone-5', { class: '+is-on' }), set('@tone-3', { class: '-is-on' }), set('@card-1', { 'data-tone': '5' }), set('@insp-cover', { 'data-tone': '5' }),
    pause(.9), unzoom({ dur: 1.1 })] },

  /* ── the best 15–20 s, looped: cinema's backdrop, trailer's hero ── */
  highlights: { ...short, still: 9.6, steps: [pause(.6), ...createSteps(quiet), pause(1.2), ...openSteps(quiet), pause(.4)] },

  /* ── the whole film, 4 chapters with captions: cinema's "Watch the full film", scrub ── */
  film: { intro: 0, outro: 1.6, still: 17.4, steps: [
    pause(1),
    chapter('01 / 04', 'Start from <em>nothing</em>', 'An empty workspace and one button to begin.'), ...createSteps(say), pause(1.7),
    chapter('02 / 04', 'Make it <em>yours</em>', 'Settings sit beside the work, not behind a menu.'), ...settingsSteps(say),
    click('@tone-3', { dur: .8 }), set('@tone-3', { class: '+is-on' }), set('@tone-1', { class: '-is-on' }), set('@card-1', { 'data-tone': '3' }), set('@insp-cover', { 'data-tone': '3' }),
    pause(.7), unzoom({ dur: 1.2 }), pause(.9),
    chapter('03 / 04', 'See the <em>whole</em> picture', 'Open a project and everything in it is right there.'),
    click('@insp-close', { dur: .85 }), tween('@app', '--insp', 1, 0, { dur: .5 }), set('@card-1', { class: '-is-sel' }), pause(.2),
    ...openSteps(say), pause(.5),
    chapter('04 / 04', 'Share it in <em>one</em> step', 'Send a link and people see exactly what you see.'), ...shareSteps(say), pause(.9),
  ] },

  /* ── the long film, 5 chapters, a caption for every beat: the chapters layout builds its transcript from these ── */
  long: { intro: 0, outro: 1.6, still: 20, steps: [
    pause(1),
    chapter('01 / 05', 'Start from <em>nothing</em>', 'An empty workspace and one button to begin.'),
    caption('This is the workspace on the first day: nothing in it yet.'), pause(2.6),
    ...createSteps(say), caption('The new project lands in the grid, and in Recent.', { wait: .6 }), pause(3),
    chapter('02 / 05', 'Make it <em>yours</em>', 'Settings sit beside the work, not behind a menu.'),
    ...settingsSteps(say), pause(.4),
    caption('Tones mark projects at a glance.'),
    click('@tone-3', { dur: .8 }), set('@tone-3', { class: '+is-on' }), set('@tone-1', { class: '-is-on' }), set('@card-1', { 'data-tone': '3' }), set('@insp-cover', { 'data-tone': '3' }),
    pause(1.4), unzoom({ dur: 1.2 }), pause(.9),
    chapter('03 / 05', 'See the <em>whole</em> picture', 'Open a project and everything in it is right there.'),
    caption('Close the panel when you’re done with it.'),
    click('@insp-close', { dur: .85 }), tween('@app', '--insp', 1, 0, { dur: .5 }), set('@card-1', { class: '-is-sel' }), pause(1),
    ...openSteps(say), pause(.6),
    caption('Back to the grid in one click.'),
    click('.app-room-bar svg', { dur: .9 }), tween('@room', '--open', 1, 0, { dur: .6 }), pause(1.2),
    chapter('04 / 05', 'Find it <em>fast</em>', 'Every project is a few letters away.'),
    ...searchSteps(say), pause(.4),
    set('@search-text', { text: '' }), show('.app-card', { dur: .3, stagger: .03 }), tween('@count', 'text', 1, 6, { dur: .3, fmt: Math.round }), pause(1),
    chapter('05 / 05', 'Share it in <em>one</em> step', 'Send a link and people see exactly what you see.'),
    ...shareSteps(say),
    caption('That’s the whole loop: make it, shape it, find it, share it.'), pause(3),
  ] },

  /* ── stories: the product on a phone, a fingertip tapping through it, 5–8 s each ── */
  'phone-open': { ...phone(), still: 2.4, steps: [
    pause(.5),
    tap('@m-card-1', { dur: .8, aim: [.5, .5] }),
    tween('@m-detail', '--open', 0, 1, { dur: .5, ease: 'ios' }), tween('@list', '--open', 0, 1, { dur: .5, ease: 'ios' }),
    pause(1),
    swipe('@m-detail-scroll', { by: [0, -230], scroll: 420, aim: [.5, .7] }),
    pause(1.4),
  ] },
  'phone-create': { ...phone(), still: 4.2, steps: [
    pause(.5),
    tap('@m-new', { dur: .8 }),
    show('@m-scrim', { dur: .3 }), show('@m-sheet', { dur: .45, ease: 'ios' }),
    pause(.5),
    tap('@m-name', { dur: .6, aim: [.3, .6] }),
    type('@m-name-text', 'Launch plan', { rhythm: 'human' }),
    pause(.3),
    tap('@m-create', { dur: .7 }),
    hide('@m-sheet', { dur: .4, ease: 'ios' }), hide('@m-scrim', { dur: .3 }),
    show('@m-card-new', { dur: .5, wait: .3, ease: 'ios' }),
    pause(1.6),
  ] },
  'phone-detail': { ...phone(), still: 3, steps: [
    set('@m-detail', { '--open': 1 }), set('@list', { '--open': 1 }), set('@m-detail-scroll', { scrollTop: 300 }),
    pause(.6),
    tap('@m-seg-2', { dur: .8 }),
    set('@m-seg-2', { class: '+is-on' }), set('@m-seg-1', { class: '-is-on' }),
    tween('@m-chart', '--grow', .2, 1, { dur: .7, ease: 'spring' }),
    pause(1),
    tap('@m-toggle', { dur: .8 }),
    tween('@m-toggle', '--on', 0, 1, { dur: .25, ease: 'ios' }),
    pause(1.4),
  ] },
  'phone-share': { ...phone(), still: 3.4, steps: [
    set('@m-detail', { '--open': 1 }), set('@list', { '--open': 1 }),
    pause(.5),
    tap('@m-share', { dur: .8 }),
    show('@m-scrim', { dur: .3 }), show('@m-sharesheet', { dur: .45, ease: 'ios' }),
    pause(.8),
    tap('@m-copy', { dur: .8 }),
    set('@m-copy', { text: 'Copied' }),
    hide('@m-sharesheet', { dur: .4, wait: .3, ease: 'ios' }), hide('@m-scrim', { dur: .3, wait: .3 }),
    show('@m-toast', { wait: .5, ease: 'ios' }),
    pause(2),
  ] },
};

function phone() { return { ...short, chrome: 'phone', screen: 'phone.html', size: [390, 844], pointer: 'touch', settle: .6 }; }
