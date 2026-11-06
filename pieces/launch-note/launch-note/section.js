// demo/launch-note: the loop (tour.js, play driver, looping), autoplay while it's on screen, and the before/after.
// ?t=7.4 freezes the loop; ?record&ratio=16:9|1:1|9:16 films it with a headline card and an update card.
import { Tour, include } from '../tour/tour.js';
import script from './script.js';

// The placeholder's two states. A real note puts two harvested fragments in the panes instead (AGENT.md),
// and this clone step does nothing because the panes are no longer empty.
const STATES = { after: (app) => { const c = app.querySelector('.ln-count'); if (c) c.textContent = '3'; app.querySelector('.ln-opt[data-tour="opt-prog"]')?.classList.add('is-on'); } };

export default function init(root) {
  const off = []; let dead = false;
  start();
  return () => { dead = true; off.forEach((f) => f && f()); };

  async function start() {
    await include(root);                  // harvested fragments: <div data-tour-include="…/fragments/after.html">
    if (dead) return;
    const app = root.querySelector('.ln-app');
    for (const pane of root.querySelectorAll('[data-ln-state]')) {
      if (pane.children.length || !app) continue;
      const c = app.cloneNode(true); c.classList.add('is-' + pane.dataset.lnState);
      c.querySelectorAll('[data-tour]').forEach((e) => e.removeAttribute('data-tour')); c.removeAttribute('data-tour');
      STATES[pane.dataset.lnState]?.(c); pane.append(c);
    }

    const film = root.querySelector('[data-tour-root]');
    const tour = new Tour(film, script);
    film.tour = tour;                     // the instance, for the console
    off.push(() => tour.destroy());

    // autoplay while at least half of it is on screen, unless someone paused it themselves
    if (!tour.still && !tour.rec) {
      let mine = false;
      film.addEventListener('click', (e) => { if (e.target.closest('.tour-pp')) mine = !tour.playing; });
      film.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'k') setTimeout(() => { mine = !tour.playing; }); });
      const io = new IntersectionObserver(([e]) => {
        if (e.isIntersecting && !mine) { if (!tour.begun) tour.begin(); else if (!tour.playing) tour.play(); }
        if (!e.isIntersecting && tour.playing) tour.pause();
      }, { threshold: .5 });
      io.observe(film); off.push(() => io.disconnect());
    }
    off.push(beforeAfter(root.querySelector('.ln-ba-frame')));
  }
}

// The divider: a damped spring toward a target, so clicks and keys glide while a drag follows the pointer exactly.
function beforeAfter(frame) {
  if (!frame) return null;
  const grip = frame.querySelector('.ln-ba-grip'), panes = [...frame.querySelectorAll('.ln-ba-pane')];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let x = 50, v = 0, target = 50, raf = 0, drag = false, pressed = false; const timers = [];
  const clamp = (n) => Math.max(0, Math.min(100, n));
  const draw = () => { frame.style.setProperty('--x', x.toFixed(2)); grip.setAttribute('aria-valuenow', Math.round(x)); grip.setAttribute('aria-valuetext', `${Math.round(100 - x)}% after`); };
  const step = () => {
    if (drag || reduce) { x = target; v = 0; draw(); raf = 0; return; }
    v = (v + (target - x) * .09) * .72; x += v; draw();
    raf = Math.abs(target - x) > .02 || Math.abs(v) > .02 ? requestAnimationFrame(step) : (x = target, draw(), 0);
  };
  const to = (t) => { target = clamp(t); if (!raf) raf = requestAnimationFrame(step); };
  const at = (e) => { const r = frame.getBoundingClientRect(); return ((e.clientX - r.left) / r.width) * 100; };
  const fit = () => { const k = frame.clientWidth / 1200; panes.forEach((p) => p.style.setProperty('--k', k)); };
  const ro = new ResizeObserver(fit); ro.observe(frame); fit();
  const pd = (e) => { if (e.button > 0) return; frame.setPointerCapture(e.pointerId); pressed = true; frame.classList.add('is-drag'); if (e.target.closest('.ln-ba-grip')) drag = true; else to(at(e)); grip.focus({ preventScroll: true }); };
  const pm = (e) => { if (!pressed) return; drag = true; target = clamp(at(e)); step(); };
  const pu = () => { pressed = false; drag = false; frame.classList.remove('is-drag'); };
  const key = (e) => {
    const s = e.shiftKey ? 10 : 2, m = { ArrowLeft: -s, ArrowDown: -s, ArrowRight: s, ArrowUp: s }[e.key];
    if (m) { e.preventDefault(); to(target + m); }
    if (e.key === 'Home') { e.preventDefault(); to(0); } if (e.key === 'End') { e.preventDefault(); to(100); }
  };
  const io = new IntersectionObserver(([e]) => {      // one sweep when it first comes into view, as a hint
    if (!e.isIntersecting || reduce) return; io.disconnect();
    timers.push(setTimeout(() => to(30), 450), setTimeout(() => to(68), 1100), setTimeout(() => to(50), 1750));
  }, { threshold: .6 });
  io.observe(frame);
  frame.addEventListener('pointerdown', pd); frame.addEventListener('pointermove', pm); frame.addEventListener('pointerup', pu); frame.addEventListener('pointercancel', pu);
  grip.addEventListener('keydown', key);
  draw();
  return () => { ro.disconnect(); io.disconnect(); timers.forEach(clearTimeout); cancelAnimationFrame(raf); };
}
