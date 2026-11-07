/* The changelog's small films: one per Shipped entry that has a film (data-film="…" in the page), plus "next", the
   Unreleased entry at the end. Each is 7–11 s, shows the thing working once, and ends on its result.
   Reference for the steps: ../tour/README.md.

     start   the state the film opens in, applied at 0 s
     steps   the film. section.js puts a short beat in front of it
     still   the moment shown with reduced motion (and while ?t= freezes the page)
     enter   where the cursor comes in from, as fractions of the window

   On the page a film plays from the start when its entry reaches the middle of the screen. In ?record the whole log
   is read top to bottom and each film plays as the reading reaches it. '@name' means [data-tour="name"]. */
import { click, move, type, stream, show, set, tween, zoom, unzoom, pause, mark } from '../tour/tour.js';

// the line the cursor drafts in the Unreleased entry: the work they want next, in their own words, one line
export const NEXT_LINE = 'Working with you on what you’re building next.';
// what the new item in the app film is called (also the title of its page)
const ITEM = 'The thing people make with it';

export default {
  films: {
    // a command-line tool: the command from the README, its real output (AGENT.md §3)
    cli: {
      still: 9.2,
      steps: [
        type('@cmd-1', 'npx your-tool init', { rhythm: 'human', lead: .5, caret: .35 }),
        pause(.35),
        stream('.clt-o1', { every: .34, jitter: .3, dur: .12 }),
        pause(.2),
        type('@cmd-2', 'your-tool', { rhythm: 'human', lead: .35, caret: .3 }),
        pause(.3),
        stream('.clt-o2', { every: .42, jitter: .2, dur: .55 }),
        zoom('@result', 1.32, { dur: 1.2, wait: .2 }),
        pause(1.5),
        unzoom({ dur: 1 }),
        stream('.clt-o3', { wait: .1 }),
        pause(1.2),
      ],
    },
    // a library's page: copy the install line, open the release notes
    repo: {
      enter: [.78, 1.02],
      still: 7.4,
      steps: [
        click('@copy', { dur: 1.1 }),
        set('@copy-l', { text: 'Copied' }), set('@copy', { class: '+is-done' }),
        pause(.8),
        click('@rel', { dur: .95 }),
        show('@notes', { ease: 'ios', dur: .6 }),
        stream('.clr-li', { every: .26, jitter: .2, dur: .3, wait: .45 }),
        pause(2.2),
      ],
    },
    // an app: make a new item, open it
    app: {
      enter: [.62, 1.02],
      still: 7.8,
      steps: [
        click('@new', { dur: 1.05 }),
        show('@row-new', { dur: .45, ease: 'out' }),
        type('@new-name', ITEM, { rhythm: 'human', lead: .25, caret: .5 }),
        pause(.35),
        click('@row-new', { dur: .8, aim: [.3, .5] }),
        set('@row-new', { class: '+is-sel' }), set('@detail-h', { text: ITEM }),
        show('@detail', { ease: 'ios', dur: .6 }),
        zoom('@detail', 1.3, { aim: [.45, .4], dur: 1.2, wait: .15 }),
        pause(1.8),
        unzoom({ dur: 1.1 }),
        pause(.5),
      ],
    },
    // Unreleased: the cursor drafts the next entry and releases it; the address appears under it (section.js)
    next: {
      enter: [.9, 1.1],
      still: 9.9,
      steps: [
        click('@field', { dur: 1.1, aim: [.18, .5] }),
        set('@field', { class: '+is-focus' }),
        type('@line', NEXT_LINE, { rhythm: 'human', lead: .4, caret: .7 }),
        show('.cln-sub', { dur: .5 }),
        pause(.35),
        click('@release', { dur: .95 }),
        set('.cln', { class: '+is-out' }), set('.cln-hint', { text: '' }), set('@release', { text: 'Released' }),
        tween('@tag', '--out', 0, 1, { dur: .5 }),
        mark('addr', { wait: .25 }),
        pause(2.4),
      ],
    },
  },
};
