/* The speaker film's script. Two halves on one clock:
     the talk     (pinned with `at:`) slides change, the lower third comes in, the subtitle line follows the
                  transcript. Nobody touches anything; the clock in the lower third runs (section.js).
     the organiser (the cursor) opens the press kit from the lower third, and the talk shrinks into the kit's slot
                  and keeps playing there; then a bio length is chosen and copied, a headshot downloaded, and a short
                  request typed and sent.
   About 44 s. One script serves both layouts (wide 1120 × 700, tall 540 × 960): targets are measured in whichever is
   on screen. '@name' means [data-tour="name"]. Engine reference: ../tour/README.md. Check any moment with ?t=12.5. */
import { click, type, show, hide, set, tween, zoom, unzoom, chapter, caption, pause, mark, key } from '../tour/tour.js';

/* the talk: when each slide and each subtitle arrives (seconds). Match these to your recording's turning points. */
const SLIDES = [[7.4, 2], [10.6, 3], [13.8, 4], [24.5, 5]];
const SUBS = [[0, 1], [4.6, 2], [7.5, 3], [10.7, 4], [13.9, 5]];
const KIT = 17.7;                    // roughly when the organiser opens the press kit; the subtitles stop there

const talk = [
  ...SLIDES.flatMap(([t, n]) => [show(`@slide-${n}`, { at: t, dur: .55, ease: 'out' }), hide(`@slide-${n - 1}`, { at: t + .6, dur: .01 })]),
  ...SUBS.flatMap(([t, n], i) => [show(`@sub-${n}`, { at: t, dur: .35 }), hide(`@sub-${n}`, { at: (SUBS[i + 1]?.[0] ?? KIT) - .25, dur: .25 })]),
  show('@kit-btn', { at: 15.4, dur: .5, ease: 'out' }),
];

export default {
  size: [1120, 700],         // wide; the tall size (540 × 960) is data-size-tall on the window
  enter: [.94, 1.02],        // the organiser's cursor comes in from the bottom right
  intro: 1.3,                // seconds the rail's first frame (in ?record: the talk title and the name) takes to clear
  outro: 4.6,                // seconds held on the closing frame (Book me to speak, the address)
  pointers: { main: { label: 'Organiser' } },
  steps: [
    ...talk,
    chapter('01 / 03', 'The talk is <em>on</em>', 'The one people book me for, as the room saw it.', { at: 1.4 }),
    mark('talk', { at: 2.0 }),
    mark('still', { at: 5.6 }),     // reduced motion shows this frame: the talk on, the lower third, a subtitle (section.js)
    mark('talk-end', { at: 15.2 }),

    pause(15.9),
    click('@kit-btn', { dur: 1.5, aim: [.45, .5] }),
    hide('@sub-5', { dur: .2 }),
    show('@kit', { dur: .45 }),
    tween('@air', '--pip', 0, 1, { dur: 1.3, ease: 'ios' }),
    chapter('02 / 03', 'The press <em>kit</em>', 'Everything an organiser needs, ready to take.', { wait: .2 }),
    pause(1.6),

    caption('Pick the bio length the programme needs.'),
    zoom('@bio', 'fit', { fill: [.82, .96], dur: 1.2 }),
    click('@tab-50', { dur: 1.05 }),
    set('@tab-50', { class: '+is-on' }), set('@tab-25', { class: '-is-on' }), set('@bio', { 'data-len': '50' }),
    pause(1),
    click('@copy', { dur: .85 }),
    set('@copy', { class: '+is-done' }), set('@copy-text', { text: 'Copied · 50 words' }),
    key(['⌘', 'C'], { parallel: true }),
    pause(1.5),

    caption('Take the headshot that suits the layout.'),
    zoom('@shots', 'fit', { fill: [.72, .96], dur: 1.2 }),
    click('@shot-l', { dur: 1, aim: [.5, .5] }),
    set('@shot-l', { class: '+is-on' }), set('@dl-text', { text: 'Download landscape' }),
    pause(.45),
    click('@dl', { dur: .75 }),
    tween('@dl', '--dl', 0, 1, { dur: .9, ease: 'out' }),
    set('@dl', { class: '+is-done' }, { wait: .95 }), set('@dl-text', { text: 'Saved · landscape.jpg' }, { wait: .95 }),
    tween('@dl', '--dl', 1, 0, { dur: .2, wait: .95 }),
    pause(1.6),
    unzoom({ dur: 1.1 }),

    chapter('03 / 03', 'Ask for a <em>date</em>', 'Three lines, and the request is with me.'),
    caption('Then ask for a date.'),
    zoom('@req', 'fit', { fill: [.86, .96], dur: 1.2, wait: .2 }),
    click('@f-date', { dur: 1.05, aim: [.3, .6] }),
    type('@v-date', 'Thursday 14 May', { rhythm: 'human', caret: .2 }),
    click('@f-event', { dur: .6, aim: [.3, .6] }),
    type('@v-event', 'Event name, City', { rhythm: 'human', caret: .2 }),
    click('@f-aud', { dur: .6, aim: [.3, .6] }),
    type('@v-aud', 'Around 300, mostly designers', { rhythm: 'human', caret: .3 }),
    pause(.3),
    click('@send', { dur: .8 }),
    set('@send-text', { text: 'Sending…' }),
    set('@send-text', { text: 'Sent' }, { wait: .55 }),
    show('@sent', { wait: .5, dur: .7, ease: 'spring' }),
    caption('Request sent. The talk is still playing.', { wait: .6 }),
    pause(2.6),
    unzoom({ dur: 1.2 }),
    pause(1),
  ],
};
