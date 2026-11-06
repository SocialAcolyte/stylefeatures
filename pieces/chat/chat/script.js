/* The chat film's script. The conversation itself is the thread in section.html (each .ck-row is one message,
   played in order by ../_chat/chat.js); this file adds what the thread can't say on its own: the chapters, the
   taps inside cards, the camera. '@name' means [data-tour="name"]. Engine reference: ../tour/README.md.
   Pacing per message is on the rows: data-think, data-read, data-run, data-cps (../_chat/README.md).
   Check any moment with ?t=12.5 in the address; ?record&ratio=9:16 is the phone screen recording. */
import { click, set, tween, pause, zoom, unzoom } from '../tour/tour.js';

export default {
  size: [580, 'auto'],       // design px wide; the height follows the screen (data-size="580xauto" on the window)
  sizeTall: [400, 'auto'],   // phones and 9:16
  enter: [.84, 1.02],        // the cursor comes in from below the composer
  intro: 0,                  // no band: the first message is the opening
  settle: .5,
  outro: 3.4,                // seconds held on the last message (the way in)
  lead: .7,                  // seconds of the empty conversation before the first message

  // a chapter starts at a row (by its data-tour name): the margin index on wide screens, ticks for a player
  chapters: {
    ask:  ['01 / 04', 'Find a <em>time</em>', 'Ask in plain words; it checks everyone’s calendar.'],
    week: ['02 / 04', 'Sum up the <em>week</em>', 'One tap for the shape of your week.'],
    send: ['03 / 04', 'Send it <em>out</em>', 'A draft with the file and the photos, ready to go.'],
    end:  ['04 / 04', 'Try <em>it</em>', 'The last message is the way in.'],
  },

  // taps inside a card, after the row has arrived
  after: {
    slots: [
      zoom('@booking', 'fit', { fill: [.8, .9], dur: 1.1 }),
      click('@slot-2', { dur: .95, aim: [.5, .5] }), set('@slot-2', { class: '+is-on' }),
      pause(.45),
      click('@book', { dur: .7, aim: [.46, .55] }),
      tween('@booking-swap', '--swap', 0, 1, { dur: .5, ease: 'out', wait: .1 }),
      pause(1.3),
      unzoom({ dur: 1 }),
    ],
    draft: [
      pause(.5),
      click('@mail-send', { dur: .9, aim: [.5, .55] }),
      tween('@mail-swap', '--swap', 0, 1, { dur: .5, ease: 'out', wait: .1 }),
      pause(1.2),
    ],
  },
};
