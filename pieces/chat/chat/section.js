// demo/chat: the page is the conversation. The thread in section.html is turned into tour steps (../_chat/chat.js),
// played on the engine's manual driver by the beat driver below:
//   - it plays on its own, message by message, from the moment the page opens (the first message arrives);
//   - a scroll, a swipe, ↓ or space brings the next message now; a click or tap does too;
//   - scrolling up reads back through the thread (and holds the conversation until you're back at the bottom);
//   - the control pauses it, after which each scroll plays exactly one message.
// ?t=12.5 freezes a moment; ?record&ratio=16:9|1:1|9:16 is the clean stage to record (9:16 reads as a phone).
import { Tour, include, pause } from '../tour/tour.js';
import { prepare, conversation, foldable } from '../_chat/chat.js';
import script from './script.js';

export default function init(root) {
  // harvested card fragments (<div data-tour-include="chat/fragments/booking.html">) are fetched before anything is measured
  let stop = null, dead = false;
  if (root.querySelector('[data-tour-include]')) include(root).then(() => { if (!dead) stop = boot(root); }); else stop = boot(root);
  return () => { dead = true; stop?.(); };
}

function boot(root) {
  const q = new URLSearchParams(location.search), rec = q.has('record');
  const win = root.querySelector('[data-tour-window]'), thread = root.querySelector('[data-ck-thread]');
  const ratio = (q.get('ratio') || '').split(':').map(Number);
  const tallRec = rec && ratio.length === 2 && ratio[0] / ratio[1] < .8;
  const touch = tallRec || (!rec && matchMedia('(hover: none) and (pointer: coarse)').matches);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches && !rec && !q.has('t');
  if (reduced) thread.removeAttribute('data-tour-follow');      // the whole transcript, read from the top

  prepare(win);
  const S = { ...script, pointer: touch ? 'touch' : script.pointer, still: 1e4, steps: [pause(script.lead ?? .7), ...conversation(win, thread, script), ...(script.steps || [])] };
  const tour = new Tour(root, S);
  root.tour = tour;
  win.removeAttribute('aria-hidden');                            // the thread is real text: a transcript
  root.classList.toggle('is-rec-tall', tallRec);
  const off = [() => tour.destroy(), foldable(win)];

  // the chapter index in the margin (and in a 16:9 recording): the current one in ink
  const list = root.querySelector('.demo-chat-index ol'), ctl = root.querySelector('.demo-chat-ctl');
  const chs = tour.api.chapters;
  if (list) list.innerHTML = chs.map((c, i) => `<li><button type="button" data-i="${i}"><span>${c.n.split('/')[0].trim()}</span><b>${c.title}</b></button></li>`).join('');
  const items = list ? [...list.querySelectorAll('li')] : [];
  let cur = -2;
  const marks = tour.marks.map((m) => m.t).filter((t) => t > .05);
  const after = (t) => marks.find((m) => m > t + .05);
  let auto = !reduced, held = false, stopAt = null, ended = false;
  const ui = () => {
    if (!ctl) return;
    ctl.setAttribute('aria-pressed', String(auto && !ended));
    ctl.dataset.state = ended ? 'again' : auto ? 'auto' : 'step';
    ctl.lastElementChild.textContent = ended ? 'Play again' : auto ? 'Pause' : 'Play';
  };
  tour.onFrame = (t) => {
    const i = chs.findLastIndex((c) => c.t <= t + .01);
    if (i !== cur) { cur = i; items.forEach((li, j) => li.classList.toggle('is-on', j === i)); }
    if (stopAt != null && t >= stopAt - .001 && tour.playing) { const s = stopAt; stopAt = null; tour.pause(); tour.render(s, true); }
    const end = t >= tour.duration - .02;
    if (end !== ended) { ended = end; root.classList.toggle('is-ended', end); ui(); }
  };
  tour.render(tour.t, true);
  if (rec || tour.still) {
    if (reduced) {      // the whole transcript, from the top; the index scrolls to each chapter's first message
      requestAnimationFrame(() => { thread.scrollTop = 0; });
      items.forEach((li) => li.classList.remove('is-on')); cur = 1e9;
      const keys = Object.keys(script.chapters || {});
      list?.addEventListener('click', (e) => { const b = e.target.closest('button[data-i]'), row = b && win.querySelector(`[data-tour="${keys[+b.dataset.i]}"]`); if (row) thread.scrollTo({ top: row.offsetTop - 16 }); });
    }
    return () => off.forEach((f) => f());
  }

  // ── the beat driver ──
  const go = () => { if (held) return; stopAt = auto ? null : after(tour.t) ?? null; tour.play(); };
  const next = () => {
    if (ended) return;
    hint();
    if (!tour.playing) { go(); return; }
    const nx = after(tour.t); if (nx == null) return;
    tour.pause(); tour.render(nx, true); stopAt = auto ? null : after(nx) ?? null; tour.play();
  };
  const seek = (t) => { held = false; tour.pause(); tour.render(t, true); stopAt = null; auto = true; ui(); go(); };
  const atBottom = () => thread.scrollHeight - thread.clientHeight - thread.scrollTop < 4;
  const hint = () => root.classList.add('is-hinted');

  let lastWheel = 0, lastStep = 0;
  const wheel = (e) => {
    if (Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
    const now = performance.now(), fresh = now - lastWheel > 260; lastWheel = now;
    if (e.deltaY < 0) {                                      // read back: hold the conversation while you do
      if (tour.playing) { tour.pause(); held = true; }
      else if (!ended) held = true;
      if (!e.composedPath().includes(thread)) thread.scrollTop += e.deltaY;
      return;
    }
    if (!atBottom()) { if (!e.composedPath().includes(thread)) thread.scrollTop += e.deltaY; return; }
    e.preventDefault();
    if (held) { held = false; go(); return; }
    if (fresh || now - lastStep > 1200) { lastStep = now; next(); }
  };
  const scrolled = () => { if (held && atBottom()) { held = false; if (!ended) go(); } };
  const key = (e) => {
    if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    if ([' ', 'ArrowDown', 'PageDown', 'j'].includes(e.key) && !e.target.closest?.('button, a')) { e.preventDefault(); if (held) { held = false; thread.scrollTop = thread.scrollHeight; go(); } else next(); }
    if (['ArrowUp', 'PageUp', 'k'].includes(e.key)) { e.preventDefault(); if (tour.playing) tour.pause(); held = !ended || held; thread.scrollTop -= 140; }
  };
  const tap = (e) => {
    if (e.target.closest('a[href], .demo-chat-ctl, .demo-chat-index, .ck-tool-head, .sf-note')) return;
    if (held) { held = false; thread.scrollTop = thread.scrollHeight; go(); return; }
    next();
  };
  let ty = null;
  const tstart = (e) => { ty = e.touches[0].clientY; };
  const tmove = (e) => {
    if (ty == null) return; const dy = ty - e.touches[0].clientY;
    if (dy < -12) { if (tour.playing) tour.pause(); held = !ended; ty = null; }          // pulling down: reading back
    else if (dy > 40 && atBottom() && !held) { ty = null; next(); }
  };
  const vis = () => { if (document.hidden && tour.playing) { tour.pause(); stopAt = null; } else if (!document.hidden && auto && !held && !ended) go(); };

  root.addEventListener('wheel', wheel, { passive: false });
  thread.addEventListener('scroll', scrolled, { passive: true });
  addEventListener('keydown', key);
  root.addEventListener('click', tap);
  root.addEventListener('touchstart', tstart, { passive: true }); root.addEventListener('touchmove', tmove, { passive: true });
  document.addEventListener('visibilitychange', vis);
  off.push(() => { root.removeEventListener('wheel', wheel); thread.removeEventListener('scroll', scrolled); removeEventListener('keydown', key); root.removeEventListener('click', tap);
    root.removeEventListener('touchstart', tstart); root.removeEventListener('touchmove', tmove); document.removeEventListener('visibilitychange', vis); clearTimeout(t0); });

  ctl?.addEventListener('click', (e) => {
    e.stopPropagation(); hint();
    if (ended) { seek(0); return; }
    auto = !auto; ui();
    if (!auto) { stopAt = after(tour.t) ?? null; if (!tour.playing) stopAt = null; }   // finish this message, then wait
    else { stopAt = null; if (!tour.playing) go(); }
  });
  list?.addEventListener('click', (e) => { const b = e.target.closest('button[data-i]'); if (b) { e.stopPropagation(); hint(); seek(chs[+b.dataset.i].t); } });
  ui();
  const t0 = setTimeout(go, 500);                         // the first message arrives on its own
  return () => off.forEach((f) => f());
}
