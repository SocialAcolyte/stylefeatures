// demo/mcp: a toured text chat between a person and their agent using one MCP server, then the way to add it.
// The conversations (.mcp-conv) play one after another on the engine's manual driver, on their own from the moment
// the page opens; the tabs (one per tool) jump to a conversation, "Add the MCP" jumps to the ending. The ending is
// live: the big button and Copy buttons copy, the config tabs switch, tool calls fold open when clicked.
// ?t=12.5 freezes a moment; ?record&ratio=16:9|1:1|9:16 plays it once and holds on the ending.
import { Tour, include, show, hide, set, pause, mark, chapter } from '../tour/tour.js';
import { prepare, conversation, copyButtons, tabs, foldable } from '../_chat/chat.js';
import script from './script.js';

export default function init(root) {
  // harvested card fragments (<div data-tour-include="chat/fragments/booking.html">) are fetched before anything is measured
  let stop = null, dead = false;
  if (root.querySelector('[data-tour-include]')) include(root).then(() => { if (!dead) stop = boot(root); }); else stop = boot(root);
  return () => { dead = true; stop?.(); };
}

function boot(root) {
  const q = new URLSearchParams(location.search), rec = q.has('record');
  const win = root.querySelector('[data-tour-window]');
  const convs = [...win.querySelectorAll('.mcp-conv')];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches && !rec && !q.has('t');

  prepare(win);
  const steps = [pause(script.lead ?? .9)];
  convs.forEach((c, i) => {
    const k = i + 1, me = `@${c.dataset.tour}`;
    steps.push(chapter(String(k).padStart(2, '0'), c.dataset.title || `Example ${k}`), mark(`conv-${k}`));
    if (i) steps.push(hide(`@${convs[i - 1].dataset.tour}`, { dur: .45 }), set(`@tab-${k - 1}`, { class: '-is-on' }));
    steps.push(set(`@tab-${k}`, { class: '+is-on' }), show(me, { dur: .5, ease: 'out', wait: i ? .25 : 0, block: true }));
    steps.push(...conversation(win, c.querySelector('[data-ck-thread]'), { ...script, prefix: `c${k}-` }));
    steps.push(mark(`conv-${k}-end`), pause(script.between ?? 1.8));
  });
  steps.push(hide(`@${convs.at(-1).dataset.tour}`, { dur: .45 }), set(`@tab-${convs.length}`, { class: '-is-on' }), mark('end'));
  const tour = new Tour(root, { ...script, steps: [...steps, ...(script.steps || [])] });
  root.tour = tour;
  win.removeAttribute('aria-hidden');                    // real text, and a live ending
  const off = [() => tour.destroy(), copyButtons(win), tabs(win), foldable(win)];
  const M = tour.marks;

  const jump = (t, play) => { tour.pause(); tour.render(t, true); if (play && !tour.still) tour.play(); };
  const click = (e) => {
    const tab = e.target.closest('[data-mcp-conv]'), add = e.target.closest('[data-mcp-jump]');
    if (tab) { e.preventDefault(); const k = tab.dataset.mcpConv; jump(reduced ? M[`conv-${k}-end`] : M[`conv-${k}`], true); }
    if (add) { e.preventDefault(); jump(tour.duration, false); }
  };
  win.addEventListener('click', click);
  off.push(() => win.removeEventListener('click', click));

  if (reduced) tour.render(M['conv-1-end'], true);       // a complete first conversation; the tabs show the others
  else if (!rec && !tour.still) {
    const t0 = setTimeout(() => tour.play(), 500);
    const vis = () => { if (document.hidden) tour.pause(); else if (tour.t < tour.duration - .05 && tour.t > 0) tour.play(); };
    document.addEventListener('visibilitychange', vis);
    off.push(() => { clearTimeout(t0); document.removeEventListener('visibilitychange', vis); });
  }
  return () => off.forEach((f) => f());
}
