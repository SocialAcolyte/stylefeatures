/* The film the visitor watches before it's their turn. Write it with act('name') for every click that changes
   the product (the actions live in machine.js), and plain steps for everything else: the camera, the chapter
   cards, captions, beats. 25–35 s, two or three chapters, one idea each. It must be a path the machine allows;
   the console says so if it isn't. Reference for the steps: ../tour/README.md. */
import { zoom, unzoom, chapter, caption, pause, key } from '../tour/tour.js';
import { act } from './playground.js';

export default {
  size: [1200, 750],        // the window's design size (data-size on the window)
  enter: [.84, .97],        // where the cursor comes in from, as fractions of the window
  intro: 1.3,               // the opening band clears in this long once it plays
  still: 6.2,               // the moment shown in thumbnails and in ?record with reduced motion
  steps: [
    pause(1.5),

    chapter('01 / 03', 'Start from <em>nothing</em>', 'An empty workspace and one button to begin.'),
    caption('Press New to start a project.'),
    act('open', { dur: 1.1 }),
    zoom('@modal', 'fit', { fill: .58, dur: 1.2 }),
    pause(.4),
    act('name', { dur: .75, aim: [.3, .6] }),
    pause(.2),
    act('template', { dur: .8 }),
    pause(.3),
    act('create', { dur: .85 }),
    unzoom({ dur: 1.3 }),
    pause(2),

    chapter('02 / 03', 'Make it <em>yours</em>', 'Settings sit beside the work, not behind a menu.'),
    caption('Select a project to see its settings.'),
    act('select', { dur: 1.05, aim: [.45, .4] }),
    zoom('@inspector', 1.45, { aim: [.5, .42], wait: .2 }),
    pause(.6),
    act('visible', { dur: .8 }),
    pause(.3),
    act('tone-3', { dur: .8 }),
    pause(.9),
    act('close', { dur: .85 }),
    unzoom({ dur: 1.2 }),
    pause(.7),

    chapter('03 / 03', 'Share it in <em>one</em> step', 'Send a link and people see exactly what you see.'),
    caption('Share makes a link your whole team can open.'),
    act('share', { dur: 1.05 }),
    zoom('@sharebox', 'fit', { fill: .5, dur: 1.2, wait: .1 }),
    pause(.6),
    act('copy', { dur: .8 }),
    key(['⌘', 'C'], { parallel: true }),
    pause(1.4),
    act('done', { dur: .8 }),
    unzoom({ dur: 1.2 }),
    pause(1),
  ],
};
