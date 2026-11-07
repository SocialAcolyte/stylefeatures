/* The project films: one short film per project, in the same order as the spines on the shelf (section.html).
   Each is 8–14 s and shows the one thing that project does best: open it, use it once, see the result. A film starts
   from how its window is drawn in the HTML, so it never depends on another project. Reference: ../tour/README.md.

     enter    where the cursor (or fingertip) comes in from, as fractions of the window
     pointer  'touch' for a phone app: a fingertip instead of the arrow
     still    the moment shown with reduced motion (and while the project is folded away)
     steps    the film. section.js puts a short beat in front of it and holds the last frame before the next project.

   '@name' means [data-tour="name"], looked up inside that project's own window. Check one alone with
   index.html?project=3&t=4 (frozen 4 s into project 3's film), and the whole recording with ?record&t=… */
import { move, click, hover, type, scroll, swipe, tap, stream, zoom, unzoom, show, hide, set, tween, pause } from '../tour/tour.js';

export default {
  films: [
    { // 01 · a web app: pick something from the list, see it open, publish it
      enter: [.88, .98],
      still: 5.6,
      steps: [
        pause(.2),
        click('@row-3', { dur: 1.05, aim: [.4, .5] }),
        set('@row-3', { class: '+is-on' }), set('@row-1', { class: '-is-on' }),
        hide('@view-a', { dur: .3 }), show('@view-b', { dur: .5, wait: .12 }),
        zoom('@view-b', 1.32, { dur: 1.25, wait: .3, aim: [.45, .5] }),
        pause(1.9),
        unzoom({ dur: 1.15 }),
        pause(.25),
        click('@publish', { dur: .95 }),
        set('@publish', { text: 'Published', class: '+is-done' }),
        show('@toast', { dur: .35 }), hide('@toast', { wait: 2.4 }),
        pause(1.8),
      ],
    },
    { // 02 · a phone app: flick the feed, open a card, like it
      pointer: 'touch',
      enter: [.7, .86],
      still: 6.2,
      steps: [
        pause(.35),
        swipe('@feed', { dur: .32, scroll: '@card-2', offset: 70, coast: .9, aim: [.55, .72] }),
        pause(.45),
        tap('@card-2', { dur: .75, aim: [.5, .4] }),
        tween('@screen', '--push', 0, 1, { dur: .55, ease: 'ios' }),
        pause(1.1),
        tap('@like', { dur: .8 }),
        set('@like', { class: '+is-on' }),
        pause(1.8),
      ],
    },
    { // 03 · a website or case study: scroll to the pictures, open one, carry on down
      enter: [.82, .96],
      still: 6.9,
      steps: [
        pause(.2),
        move('@page', { dur: .9, aim: [.62, .55] }),
        scroll('@page', '@grid', { dur: 1.7, offset: 64 }),
        hover('@img-2', { dur: .8, hold: .35 }),
        click('@img-2', { dur: .3 }),
        show('@lightbox', { dur: .45 }),
        pause(1.7),
        click('@lb-close', { dur: .95 }),
        hide('@lightbox', { dur: .35 }),
        pause(.2),
        move('@page', { dur: .7, aim: [.7, .62] }),
        scroll('@page', 'end', { dur: 1.7 }),
        pause(.9),
      ],
    },
    { // 04 · a library or tool: install it, run it, see what it makes
      enter: [.5, .96],
      still: 9.6,
      steps: [
        pause(.2),
        click('@term', { dur: .9, aim: [.42, .3], cursor: 'text' }),
        type('@cmd-1', 'npm install your-library', { rhythm: 'human' }),
        pause(.3),
        stream('.pw-out-1', { every: .26 }),
        type('@cmd-2', 'npx your-library demo', { rhythm: 'human', caret: .4 }),
        pause(.25),
        stream('.pw-out-2', { every: .32 }),
        show('@preview', { dur: .55 }),
        zoom('@preview', 'fit', { fill: [.8, .94], dur: 1.25, wait: .25 }),
        pause(2),
        unzoom({ dur: 1.1 }),
        pause(.6),
      ],
    },
  ],
};
