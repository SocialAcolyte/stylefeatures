/* The scholar film's script: a reader working through the title page. Four chapters, one kind of reference each:
   a figure reference (Fig. 1 enlarges where it sits), a citation ([1] points at its paper; Cite opens the BibTeX and
   Copy copies it), the paper itself (PDF opens a preview at the abstract; one sentence is highlighted by hand), and the
   asterisk on the name (the correspondence footnote). About 40 s on the wide page.
   '@name' means [data-tour="name"]. Engine reference: ../tour/README.md.

   The page has four layouts (section.css), so the script is built for one: film('wide' | 'square' | 'tall' |
   'narrow'). The three recording shapes share every step and differ only in how far the camera pushes in. 'narrow' is
   a phone reading the page: a fingertip, no camera, the figure and the citation, no PDF (it opens full screen there).
   section.js picks the layout and rebuilds the script if the stage changes shape. ?t=12.5 freezes any moment. */
import { click, tap, move, drag, scroll, tween, show, hide, zoom, unzoom, chapter, caption, pause, mark } from '../tour/tour.js';

export const SIZES = { size: [1600, 900], sizeSquare: [960, 960], sizeTall: [680, 1209] };

export function film(kind = 'wide') {
  const narrow = kind === 'narrow', wide = kind === 'wide', tall = kind === 'tall';
  const press = narrow ? tap : click;
  const cam = (fn) => (narrow ? pause(0) : fn());
  // how much of the frame a push-in gives its subject: the wide page keeps its left margin for the card and caption
  const fill = { wide: .5, square: .7, tall: .9 }[kind] ?? .6;
  const push = (sel, o = {}) => cam(() => zoom(sel, 'fit', { fill, dur: 1.3, ...o }));
  const back = (o = {}) => cam(() => unzoom({ dur: 1.15, ...o }));

  const steps = [
    pause(1.2),

    // 1. a figure reference: Fig. 1 enlarges where it sits, the text around it quiets
    chapter('§ 1', 'Read the <em>abstract</em>', 'Every reference on this page opens where it is.'),
    caption('A reference to a figure.'),
    press('@ref-fig', { dur: 1.1 }),
    tween('@fig', '--big', 0, 1, { dur: 1.15, ease: 'ios' }),
    tween('@veil', '--v', 0, 1, { dur: .9, ease: 'out' }),
    narrow ? pause(0) : zoom('@fig', wide ? 1.22 : tall ? 1.3 : 1.18, { dur: 1.6, wait: .3, aim: [.5, .45] }),
    pause(narrow ? 1.6 : 1.8), mark('figure'),
    caption('The figure, and what to see in it.'),
    pause(1.4),
    press('@fig-box', { dur: .8, aim: [.62, .4] }),
    tween('@fig', '--big', 1, 0, { dur: .8, ease: 'out' }),
    tween('@veil', '--v', 1, 0, { dur: .7, ease: 'out' }),
    back({ dur: 1 }),

    // 2. a citation: [1] lights its paper; Cite opens the BibTeX; Copy selects it and copies
    chapter('§ 2', 'Follow a <em>citation</em>', 'From the claim to the paper behind it.'),
    caption('The citation points at its paper.'),
    press('@ref-1', { dur: .9 }),
    tween('@pub-1', '--cited', 0, 1, { dur: .35, ease: 'out' }),
    narrow ? pause(0) : scroll('@page', '@pub-1', { dur: 1.2, offset: wide ? 300 : tall ? 150 : 200 }),
    push('@pub-1', { wait: .1, fill: fill * .95 }),
    pause(.4),
    caption('Cite it.'),
    press('@cite-1', { dur: 1 }),
    tween('@pub-1', '--bib', 0, 1, { dur: 1, ease: 'ios' }),
    tween('@pub-1', '--cited', 1, 0, { dur: .8, ease: 'out', wait: .3 }),
    push('@pub-1', { wait: .35, fill: fill * 1.05 }),
    pause(.5),
    press('@copy-1', { dur: 1 }),
    tween('@bib-1', '--sel', 0, 1, { dur: .55, ease: 'out' }),
    caption('Copied, ready for the next paper.'),
    pause(2.1), mark('poster'),          // the BibTeX open and copied: the best still for a poster
  ];

  if (narrow) {      // a phone: fold the BibTeX away and stop; the rest of the paper is right under the title page
    steps.push(press('@cite-1', { dur: .9 }), tween('@pub-1', '--bib', 1, 0, { dur: .7, ease: 'out' }), tween('@bib-1', '--sel', 1, 0, { dur: .2 }), pause(1));
    return { ...SIZES, sizeTall: [400, 'auto'], pointer: 'touch', intro: 0, outro: 1.2, settle: .3, still: 6, steps };
  }

  steps.push(
    press('@cite-1', { dur: .9, aim: [.5, .5] }),
    tween('@pub-1', '--bib', 1, 0, { dur: .8, ease: 'out' }),
    tween('@bib-1', '--sel', 1, 0, { dur: .3 }),
    back({ dur: 1.1 }),

    // 3. the paper: PDF opens a preview at its first page; one sentence of the abstract is highlighted by hand
    chapter('§ 3', 'Open the <em>paper</em>', 'A preview, at the sentence that matters.'),
    caption('Open the PDF.'),
    press('@pdf-1', { dur: 1 }),
    show('@pdf', { dur: .6, ease: 'ios' }),
    tween('@veil', '--v', 0, 1, { dur: .6, ease: 'out' }),
    zoom('@pp-abs', 'fit', { fill: wide ? .62 : tall ? .96 : .86, dur: 1.4, wait: .5 }),
    pause(.3),
    caption('The sentence that says it.'),
    drag('@hl-a', { onto: '@hl-b', prop: '--hl', el: '@hl', from: 0, to: 1, dur: 1.5, approach: .9, cursor: 'text', aim: [0, .55] }),
    pause(2), mark('still'),
    unzoom({ dur: 1 }),
    press('@pdf-close', { dur: 1 }),
    hide('@pdf', { dur: .4 }),
    tween('@veil', '--v', 1, 0, { dur: .5, ease: 'out' }),

    // 4. the asterisk on the name: to the correspondence footnote
    chapter('§ 4', '<em>Correspondence</em>', 'The last footnote says where to find me.'),
    caption('The asterisk on the name.'),
    scroll('@page', 0, { dur: 1.1 }),
    press('@ref-star', { dur: .9, aim: [.5, .6] }),
    tween('@foot', '--lit', 0, 1, { dur: .45, ease: 'out', wait: .6 }),
    zoom('@foot-in', 'fit', { fill: wide ? .5 : .8, max: 2.4, dur: 1.3, wait: .4 }),
    pause(1.8),
    back({ dur: 1.2 }),
    scroll('@page', 0, { dur: 1.2, parallel: true }),
    tween('@foot', '--lit', 1, 0, { dur: .6 }),
    move('@page', { dur: 1.1, aim: [.95, .9] }),     // the cursor leaves the asterisk, so nothing stays lit for the visitor
  );
  return {
    ...SIZES,
    enter: [.94, .9],
    intro: 0,               // no title band: the first frame is the title page itself
    outro: 4.4,             // the closing frame: the footnote, set large
    settle: .4,
    steps,
  };
}

export default film('wide');
