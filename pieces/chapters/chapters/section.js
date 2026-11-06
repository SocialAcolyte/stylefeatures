// demo/chapters: one short film per chapter, stacked in one pinned slot so it reads as a single window that re-stages
// itself. Scroll a chapter's text to the middle of the screen and its film plays from the start, once, at real speed.
// Each film is its own Tour on the engine's manual driver; this file decides which one plays.
//   ?record&chapter=2&ratio=1:1   that chapter alone on the record stage, with a title band and a closing frame
//   ?t=4                          every chapter frozen at 4 s (with ?record: the recorded chapter)
import { Tour, include, pause, chapter } from '../tour/tour.js';
import script from './script.js';

const NN = (n) => String(n).padStart(2, '0');
const BEAT = .5;     // a breath before each film starts on the page

export default function init(root) {
  const q = new URLSearchParams(location.search);
  const items = [...root.querySelectorAll('.demo-chapters-item')];
  const films = [...root.querySelectorAll('.demo-chapters-film')];
  const tpl = (name) => root.querySelector(`template.demo-chapters-${name}`)?.content;
  const N = films.length, reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const narrow = matchMedia('(max-width: 860px)');
  let alive = true, tours = [], cur = -1, startT = 0, raf = 0;
  const off = [];
  const on = (el, ev, fn, o) => { el.addEventListener(ev, fn, o); off.push(() => el.removeEventListener(ev, fn, o)); };

  // the titles live once, in the chapter text: the contents list, the "/ 04" and the record band read them from there
  const text = (i) => ({ title: items[i]?.querySelector('h2')?.innerHTML.trim() || '', line: items[i]?.querySelector('.demo-chapters-line')?.textContent.trim() || '' });
  const index = root.querySelector('.demo-chapters-index');
  if (index && !index.children.length) index.innerHTML = items.map((it, i) => `<li><a href="#${it.id}"><span>${NN(i + 1)}</span><b>${text(i).title}</b></a></li>`).join('');
  items.forEach((it) => it.querySelector('.demo-chapters-n')?.setAttribute('data-of', NN(N)));

  // every window without screens of its own gets a copy of the product
  films.forEach((f) => { const w = f.querySelector('[data-tour-window]'); if (w && !w.firstElementChild && tpl('product')) w.append(tpl('product').cloneNode(true)); });

  // a chapter's script as the engine wants it: its start state at 0 s, a beat, the film
  const compose = (i, rec) => {
    const c = script.chapters[i] || { steps: [] }, start = (c.start || []).map((s) => ({ ...s, at: 0 }));
    const base = { size: script.size, enter: c.enter || script.enter, pointer: script.pointer };
    if (!rec) return { ...base, intro: 0, settle: .5, outro: .2, fit: script.fit || [.92, .88, .5], still: BEAT + (c.still ?? 4), steps: [...start, pause(BEAT), ...c.steps] };
    const { title, line } = text(i);
    return { ...base, intro: 1.3, settle: .6, outro: 3.6, still: 1.5 + (c.still ?? 4), steps: [...start, pause(1.5), chapter(`${NN(i + 1)} / ${NN(N)}`, title, line), ...c.steps] };
  };

  (async () => {
    if (q.has('record')) {
      // the chosen chapter stands alone on the record stage: the rest of the page is hidden by tour.css
      const i = Math.min(N, Math.max(1, Math.round(+q.get('chapter') || 1))) - 1, film = films[i];
      const stage = film.querySelector('[data-tour-stage]');
      if (tpl('band')) stage.append(tpl('band').cloneNode(true));
      if (tpl('close')) stage.append(tpl('close').cloneNode(true));
      const { title, line } = text(i), fill = { n: `Chapter ${NN(i + 1)} / ${NN(N)}`, title, line };
      stage.querySelectorAll('[data-fill]').forEach((e) => { e.innerHTML = fill[e.dataset.fill] || ''; });
      document.body.append(film);
      await include(film);
      if (alive) tours = [new Tour(film, compose(i, true), { driver: 'manual' })];
      return;
    }
    await Promise.all(films.map((f) => include(f)));
    if (!alive) return;
    films[0]?.classList.add('is-on');
    tours = films.map((f, i) => new Tour(f, compose(i, false), { driver: 'manual' }));
    tours.forEach((t, i) => {
      t.onFrame = (tt) => items[i]?.style.setProperty('--p', (tt / t.duration).toFixed(4));
      on(t.root, 'tour:end', () => items[i]?.classList.add('is-done'));
      t.onFrame(t.t);
    });
    window.chapters = { tours: tours.map((t) => t.api), go: (i) => items[i]?.scrollIntoView({ block: 'center' }) };
    pick();
  })();

  // play chapter i from the start, after the slot has cross-faded to it
  const run = (i) => {
    const t = tours[i], it = items[i]; if (!t) return;
    it.classList.remove('is-done');
    if (t.still) return;                       // reduced motion or ?t=: its still frame, no playback
    t.pause(); t.render(0, true);
    clearTimeout(startT); startT = setTimeout(() => { if (alive && cur === i) t.play(); }, 420);
  };
  const activate = (i) => {
    if (i === cur || !tours.length) return;
    if (cur >= 0) { tours[cur].pause(); clearTimeout(startT); }
    cur = i;
    items.forEach((it, k) => it.classList.toggle('is-active', k === i));
    if (i < 0) return;                         // above the first chapter or past the last: hold what's showing
    films.forEach((f, k) => f.classList.toggle('is-on', k === i));
    run(i);
  };
  // the chapter whose text crosses the reading line (the middle; lower on phones, under the pinned window)
  function pick() {
    raf = 0; if (!alive) return;
    const line = innerHeight * (narrow.matches ? .68 : .5);
    let k = -1;
    items.forEach((it, j) => { const r = it.getBoundingClientRect(); if (r.top <= line && r.bottom > line) k = j; });
    activate(k);
  }
  const later = () => { if (!raf) raf = requestAnimationFrame(pick); };
  on(window, 'scroll', later, { passive: true });
  on(window, 'resize', later);
  items.forEach((it, i) => {
    const b = it.querySelector('.demo-chapters-again');
    if (b) on(b, 'click', () => { if (cur === i) run(i); else it.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: narrow.matches ? 'start' : 'center' }); });
  });

  return () => { alive = false; cancelAnimationFrame(raf); clearTimeout(startT); off.forEach((f) => f()); tours.forEach((t) => t.destroy()); };
}
