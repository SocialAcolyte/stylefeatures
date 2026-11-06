/* The split film's script: the input typed on the left, the product answering on the right, the cursor crossing
   between them. Same engine and vocabulary as the product tour (README.md in ../tour/); the pieces this format
   leans on:
     type('@input-text', '…', { rhythm: 'human' })     a person writing the prompt
     type('@ai-1-text', '…', { rhythm: 'stream' })     a reply arriving in chunks, as a model streams
     stream('@steps-1 > li', { every: .62, jitter: 0 })  items arriving on a beat, in step with
     show('.pg-b', { stagger: .62 })                      blocks building up on the right
   On phones and in 9:16 the window takes its tall size and the panes stack; the script doesn't change.
   Check any moment with ?t=12.5 in the address. */
import { click, type, key, zoom, unzoom, show, hide, set, tween, stream, move, hover, chapter, caption, pause } from '../tour/tour.js';

const PROMPT = 'A one-page site for a small studio: a big headline, three services and a contact form.';
const REFINE = 'Shorter, and say who it’s for.';
const spin = (dur, o = {}) => tween('@spin', '--a', 0, dur * 1.4, { dur, ease: (t) => t, ...o });

export default {
  size: [1200, 750],        // data-size; the tall size comes from data-size-tall on the window
  enter: [.3, .97],         // where the cursor comes in from, as fractions of the window
  intro: 1.3,
  outro: 4.6,
  still: 22.5,              // reduced motion: the page built, the thread beside it
  steps: [
    pause(1.5),

    chapter('01 / 04', 'Say what you <em>want</em>', 'Plain words in, on the left. Nothing to learn first.'),
    caption('Describe it in a sentence.'),
    click('@input', { dur: 1.1, aim: [.4, .5] }),
    zoom('@composer', 'fit', { fill: [.4, .86], dur: 1.2 }),
    type('@input-text', PROMPT, { rhythm: 'human', cps: 20, caret: .3 }),
    pause(.35),
    key(['⌘', 'return'], { parallel: true, hold: 1 }),
    click('@send', { dur: .6 }),
    set('@input-text', { text: '' }), hide('@hello', { dur: .2 }), set('@hello', { class: '+is-gone' }, { wait: .2 }),
    stream('@msg-1', { dur: .3, wait: .2, parallel: true }),
    unzoom({ dur: 1.2, wait: .2 }),
    pause(.6),

    chapter('02 / 04', 'Watch it <em>build</em>', 'The answer arrives on the right while it explains on the left.'),
    caption('It builds the page as it explains.'),
    stream('@ai-1', { dur: .25, parallel: true }),
    set('@status-text', { text: 'Generating' }), tween('@spin', '--on', 0, 1, { dur: .2 }), spin(6.4),
    tween('@progress', '--p', 0, 1, { dur: 6.2 }),
    hide('@blank', { dur: .3, wait: .4 }),
    zoom('@canvas', 'fit', { fill: [.86, .98], dur: 1.4, wait: .3 }),
    type('@ai-1-text', 'Here’s a first version: one page, four parts.', { rhythm: 'stream', cps: 34, caret: .1, parallel: true }),
    show('.pg-b', { dur: .55, stagger: .7, wait: .7 }),
    stream('@steps-1 > li', { every: .7, jitter: 0, dur: .2, wait: 1.5 }),
    pause(.6),
    set('@status-text', { text: 'Ready' }), tween('@spin', '--on', 1, 0, { dur: .2 }),
    pause(1.4),

    chapter('03 / 04', 'Point at <em>anything</em>', 'Click a part of the result and change just that part.'),
    caption('Click a part to change just that.'),
    zoom('@hero', 'fit', { fill: [.7, .9], dur: 1.3 }),
    click('@hero', { dur: 1.1, aim: [.32, .42] }),
    set('@hero', { class: '+is-picked' }),
    stream('@ref', { dur: .25, parallel: true }),
    zoom('@in', 'fit', { fill: [.8, .96], dur: 1.3, wait: .3 }),
    click('@input', { dur: 1.1, aim: [.5, .55] }),
    type('@input-text', REFINE, { rhythm: 'human', cps: 15, caret: .3 }),
    pause(.3),
    click('@send', { dur: .6 }),
    set('@input-text', { text: '' }), set('@ref', { class: '-is-in' }),
    stream('@msg-2', { dur: .3, wait: .15, parallel: true }),
    stream('@ai-2', { dur: .25, wait: .55, parallel: true }),
    set('@status-text', { text: 'Editing' }, { wait: .4 }), tween('@spin', '--on', 0, 1, { dur: .2, wait: .4 }), spin(3.4, { wait: .4 }),
    tween('@progress', '--p', 0, 1, { dur: 3, wait: .4 }),
    zoom('@hero', 'fit', { fill: [.72, .92], dur: 1.4, wait: .4 }),
    hide('@h-old', { dur: .35, wait: .9 }), set('@h-old', { class: '+is-gone' }, { wait: 1.25 }),
    type('@h-new', 'Careful design for small brands', { rhythm: 'stream', cps: 24, lead: 1.3, caret: .2, parallel: true }),
    type('@ai-2-text', 'Done. Seven words, and it says who it’s for.', { rhythm: 'stream', cps: 30, lead: .7, caret: .1 }),
    pause(.9),
    set('@status-text', { text: 'Ready' }), tween('@spin', '--on', 1, 0, { dur: .2 }), set('@hero', { class: '-is-picked' }),
    pause(1.1),

    chapter('04 / 04', 'Take it <em>with</em> you', 'The code is yours, and a link is one click away.'),
    caption('The code is right there, and it’s yours.'),
    zoom('@out', 'fit', { fill: [.8, .98], dur: 1.2 }),
    click('@tab-code', { dur: 1.1 }),
    set('@tab-code', { class: '+is-on' }), set('@tab-preview', { class: '-is-on' }),
    show('@code', { dur: .35 }),
    zoom('@canvas', 'fit', { fill: [.86, .98], dur: 1.3, wait: .2 }),
    stream('@code > .cl', { every: .07, dur: .15, wait: .2 }),
    pause(1.2),
    caption('Publish, and send the link.'),
    zoom('@out', 'fit', { fill: [.8, .98], dur: 1.1 }),
    click('@publish', { dur: 1.1 }),
    show('@pop', { dur: .3 }),
    zoom('@pop', 'fit', { fill: [.5, .9], dur: 1.2, wait: .1 }),
    pause(.4),
    click('@copy', { dur: .8 }),
    set('@copy', { text: 'Copied' }),
    show('@toast'), hide('@toast', { wait: 2 }),
    pause(1.4),
    unzoom({ dur: 1.2 }),
    pause(.6),
  ],
};
