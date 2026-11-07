/* The office-hours film: a visitor books a call in the person's diary. Three chapters on one clock:
     what you need   the cursor reads the offers in the margin and picks one; the times too short for it fade and the
                     ones that fit are inked round
     a time          it tries Friday, then takes Thursday at ten: the time lights, and a slip tucked into the diary is
                     written in (a name, one line about the problem) and confirmed
     in the diary    the invite card falls into the week and settles into the slot as an entry; the margin notes it
   About 33 s. One script serves the three layouts (wide 1200 × 740, square 800 × 700, tall 480 × 800): targets are
   measured in whichever is on screen. '@name' means [data-tour="name"]. Engine reference: ../tour/README.md.
   Check any moment with ?t=12.5. */
import { click, hover, move, type, stream, show, hide, set, tween, zoom, unzoom, chapter, caption, pause, mark } from '../tour/tour.js';

/* the offer the visitor picks: section.js fades the times shorter than its data-len before the film is measured */
export const FILM_OFFER = 'offer-2';
/* what the visitor writes on the slip. Keep it to the kind of thing your clients really bring you (AGENT.md §3). */
const WHO = 'Alex';
const ABOUT = 'Our launch plan needs a second pair of eyes';

export default {
  size: [1200, 740],         // wide; square (800 × 700) and tall (480 × 800) are data-size-square / -tall on the window
  enter: [.62, 1.04],        // the visitor's cursor comes in from below
  intro: 1.3,                // seconds the rail's first frame (in ?record: the title) takes to clear
  outro: 4.4,                // seconds held on the closing frame (the name, the booking address)
  pointers: { main: { label: 'Visitor' } },
  steps: [
    pause(1.5),
    chapter('01 / 03', 'What you <em>need</em>', 'Three ways to work together, in the margin of my week.'),
    caption('Start with what you need.'),
    hover('@offer-1', { dur: 1.15, hold: .55, aim: [.3, .5] }),
    click(`@${FILM_OFFER}`, { dur: .65, aim: [.3, .5] }),
    set('@offer-1', { class: '-is-on' }), set(`@${FILM_OFFER}`, { class: '+is-on' }),
    caption('A working session: only the times it fits stay open.', { wait: .3 }),
    tween('@week', '--fit', 0, 1, { dur: .7, wait: .15 }),
    stream('@week .oh-slot:not(.is-short) .oh-tick', { every: .09, jitter: .3, dur: .3, wait: .25 }),
    pause(1.5),

    chapter('02 / 03', 'A time that <em>suits</em>', 'Open hours, straight from my diary.'),
    caption('Friday morning, or Thursday at ten?'),
    hover('@slot-fri', { dur: 1.2, hold: .7, aim: [.55, .5] }),
    click('@slot-thu', { dur: .95, aim: [.5, .32] }),
    tween('@lit', '--lit', 0, 1, { dur: .45, ease: 'out' }),
    zoom('@zone', 'fit', { fill: [.7, .92], dur: 1.2, wait: .1 }),
    show('@slip', { dur: .55, ease: 'ios', wait: .2 }),
    caption('Your name, and one line about it.', { wait: .4 }),
    pause(.9),
    click('@f-name', { dur: .85, aim: [.35, .7] }),
    type('@v-name', WHO, { rhythm: 'human', caret: .2 }),
    click('@f-about', { dur: .55, aim: [.35, .7] }),
    type('@v-about', ABOUT, { rhythm: 'human', caret: .3 }),
    pause(.35),
    click('@confirm', { dur: .8 }),
    set('@confirm-text', { text: 'Confirmed' }),
    hide('@slip', { wait: .55, dur: .45 }),
    unzoom({ dur: 1.15, wait: .6 }),
    move('@slot-thu', { dur: 1.4, aim: [.62, 6.7], wait: .5 }),      // the hand rests low in the day, out of the card's way

    chapter('03 / 03', 'In the <em>diary</em>', 'The invite lands in both our weeks.', { wait: .1 }),
    caption('The invite is on its way.', { wait: .2 }),
    set('@entry-who', { text: WHO }), set('@inv-who', { text: WHO }),
    zoom('@slot-thu', 1.32, { dur: 1.6, aim: [.5, .62], wait: .3 }),
    tween('@invite', '--drop', 0, 1, { dur: 1.2, ease: 'spring', wait: .55, block: true }),
    pause(1.7),
    tween('@invite', '--land', 0, 1, { dur: .8 }),
    tween('@lit', '--txt', 1, 0, { dur: .3 }),
    show('@entry', { dur: .25, wait: .62 }),
    caption('Thursday at ten. It\'s in the diary.', { wait: .5 }),
    pause(1.4),
    unzoom({ dur: 1.3 }),
    show('@cal-dot', { dur: .4, wait: .3 }),
    show('@booked-note', { dur: .5, wait: .5 }),
    mark('still', { wait: 1.4 }),         // reduced motion shows this frame: the week with the entry written in (section.js)
    pause(2.6),
  ],
};
