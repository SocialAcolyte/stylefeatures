// demo/cv: the one-page CV that opens. Picks the layout for the stage (a wide, square or tall desk with the A4 sheet on
// it; on a phone the sheet alone, reflowed), hands that layout's script to the engine, plays the film once when the
// sheet is on screen, then gives the sheet to the visitor: every line opens and closes under their own click.
// The ending's proof is a copy of the sheet as it prints; "Download the PDF" prints it unless a cv.pdf is linked.
// ?t=12.5 freezes a moment; ?record&ratio=16:9|1:1|9:16 is a clean stage for screen recording (../tour/README.md).
import { Tour } from '../tour/tour.js';
import { film } from './script.js';

const q = new URLSearchParams(location.search);
const shape = (r) => (r < .8 ? 'tall' : r < 1.15 ? 'square' : 'wide');     // the engine's own thresholds
const PHONE = 640;                                                          // narrower than this: the sheet alone

export default function init(root) {
  const stage = root.querySelector('[data-tour-stage]');
  const win = root.querySelector('[data-tour-window]');
  const sheet = win.querySelector('.cv-sheet');
  const lines = [...sheet.querySelectorAll('.cv-line')];
  const rec = q.has('record'), fixed = q.has('t'), thumb = q.has('thumb');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const off = [];

  // the ending's proof: a copy of the sheet as it prints (A4, every line closed), made before the film touches it
  const proof = root.querySelector('.cv-proof');
  if (proof && !rec) {
    const c = sheet.cloneNode(true);
    for (const e of [c, ...c.querySelectorAll('*')]) for (const a of ['data-tour', 'data-tour-grow', 'tabindex', 'role', 'aria-expanded', 'id']) e.removeAttribute(a);
    c.querySelector('h1')?.replaceWith(Object.assign(document.createElement('p'), { className: 'cv-name', innerHTML: c.querySelector('h1').innerHTML }));
    proof.append(c);
  }

  const ratio = () => {
    if (rec) { const [a, b] = (q.get('ratio') || '16:9').split(':').map(Number); return a > 0 && b > 0 ? a / b : 16 / 9; }
    return innerWidth / Math.max(520, innerHeight);
  };
  const kindNow = () => (!rec && innerWidth < PHONE ? 'narrow' : shape(ratio()));

  // a phone: the window is the sheet alone, 400 design px wide and as tall as its lines (closed); the frame follows
  function measureNarrow() {
    root.classList.add('is-narrow', 'is-measuring');
    const w = win.style.width; win.style.width = '400px';
    root.style.setProperty('--nh', Math.ceil(sheet.offsetHeight));
    win.style.width = w; root.classList.remove('is-measuring');
  }

  let kind = kindNow();
  root.classList.toggle('is-narrow', kind === 'narrow');
  if (kind === 'narrow') measureNarrow();
  const tour = new Tour(root, film(kind), { camera: kind === 'narrow' ? 'off' : undefined });
  root.tour = tour;
  off.push(() => tour.destroy());
  if (rec) return () => off.forEach((f) => f());
  win.removeAttribute('aria-hidden');      // on the page the sheet is the real CV, not a picture of one

  // ── the visitor's sheet: one line open at a time, under their own click (--open, a CSS transition) ──
  const yours = (on) => { root.classList.toggle('is-yours', on); grow(); label(); };
  const isOpen = (li) => li.classList.contains('is-open');
  function openLine(li, on = !isOpen(li)) {
    for (const l of lines) {
      const want = l === li && on;
      l.classList.toggle('is-open', want); l.style.setProperty('--open', want ? 1 : 0);
      l.querySelector('.cv-row')?.setAttribute('aria-expanded', String(want));
    }
  }
  const closeAll = () => openLine(null, false);
  // what plays inside a line the visitor opens: before turns into after, the project's page scrolls down
  const timers = [];
  function replay(li) {
    timers.splice(0).forEach(clearTimeout);
    const ba = li.querySelector('.cv-ba'), page = li.querySelector('.cv-site');
    if (ba) { ba.classList.remove('is-replay'); ba.style.setProperty('--ba', 0); void ba.offsetWidth; timers.push(setTimeout(() => { ba.classList.add('is-replay'); ba.style.setProperty('--ba', 1); }, 750)); }
    if (page) {
      page.scrollTop = 0;
      timers.push(setTimeout(() => {
        const to = page.scrollHeight - page.clientHeight, t0 = performance.now();
        const step = (now) => { const p = Math.min(1, (now - t0) / 2600), e = p * p * (3 - 2 * p); page.scrollTop = to * e; if (p < 1 && isOpen(li)) requestAnimationFrame(step); };
        requestAnimationFrame(step);
      }, 900));
    }
  }
  function finish() {             // the visitor takes over mid-film: jump to the end, where every fold is shut
    tour.pause(); tour.render(tour.duration, true); yours(true);
  }
  function again() { closeAll(); root.querySelectorAll('.is-replay').forEach((e) => e.classList.remove('is-replay')); yours(false); tour.render(0, true); tour.play(); label(); }

  const onRow = (row) => {
    if (!root.classList.contains('is-yours')) finish();
    const li = row.closest('.cv-line'); openLine(li);
    if (isOpen(li) && !reduced) replay(li);
  };
  sheet.addEventListener('click', (e) => { const r = e.target.closest('.cv-row'); if (r) onRow(r); });
  sheet.addEventListener('keydown', (e) => {
    const r = e.target.closest?.('.cv-row'); if (!r || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault(); onRow(r);
  });
  win.addEventListener('pointerdown', () => { if (tour.playing) finish(); });

  // the control: watch it open, skip, watch it again
  const btn = root.querySelector('.cv-ctl-btn'), say = btn?.querySelector('.cv-ctl-say');
  function label() { if (say) say.textContent = tour.playing ? 'Skip the film' : root.classList.contains('is-yours') ? 'Watch it again' : 'Watch it open'; }
  btn?.addEventListener('click', () => { if (tour.playing) finish(); else again(); });
  root.addEventListener('tour:end', () => yours(true));

  // "Download the PDF": a linked cv.pdf downloads; until there is one, it prints the sheet (the print stylesheet
  // sets it as the exact one-pager)
  for (const a of root.querySelectorAll('.cv-pdf-btn, .cv-print')) {
    const href = a.getAttribute('href') || '';
    if (/\.pdf($|\?)/i.test(href)) a.setAttribute('download', '');
    else a.addEventListener('click', (e) => { e.preventDefault(); if (tour.playing) finish(); print(); });
  }

  // the page makes room when the sheet grows past the desk (a line open after the film, or any line on a phone)
  function grow() {
    const flow = root.classList.contains('is-yours') || kind === 'narrow';
    let g = 0;
    if (flow) {
      const s = stage.getBoundingClientRect(), b = sheet.getBoundingClientRect();
      g = Math.max(0, b.bottom + (kind === 'narrow' ? 10 : 26 * (tour.L?.s || 1)) - s.bottom);
    }
    root.style.setProperty('--grow', g.toFixed(1) + 'px');
  }
  const ro = new ResizeObserver(grow); ro.observe(sheet); off.push(() => ro.disconnect());

  // the stage changed shape (a window resized past a threshold, a phone turned): rebuild the script for that layout
  let rz = 0;
  const onResize = () => { clearTimeout(rz); rz = setTimeout(relayout, 140); };
  function relayout() {
    const k = kindNow();
    if (k === kind) { if (kind === 'narrow') measureNarrow(); return; }
    kind = k;
    root.classList.toggle('is-narrow', k === 'narrow');
    if (k === 'narrow') measureNarrow();
    Object.assign(tour, { camOn: k !== 'narrow' && !tour.still, touch: k === 'narrow' });
    root.classList.toggle('is-touch', tour.touch);
    tour.sizes.tall = k === 'narrow' ? [400, NaN] : [680, 1209];
    const t = tour.t, playing = tour.playing;
    tour.load(film(k));
    tour.render(root.classList.contains('is-yours') ? tour.duration : Math.min(t, tour.duration), true);
    if (playing) tour.play();
    grow();
  }
  addEventListener('resize', onResize); off.push(() => removeEventListener('resize', onResize));
  document.fonts?.ready.then(() => { if (kind === 'narrow') measureNarrow(); grow(); });

  // when to play: never under ?t= (a frozen check frame); reduced motion and ?thumb get one calm frame;
  // otherwise once, a beat after the sheet is on screen
  if (fixed) return () => off.forEach((f) => f());
  if (reduced) { tour.render(tour.duration, true); yours(true); openLine(lines[0], true); }
  else if (thumb) tour.render(tour.api.marks.poster ?? 0, true);
  else {
    let wait = 0, done = false;
    const io = new IntersectionObserver(([e]) => {
      clearTimeout(wait);
      if (e.isIntersecting && !done) wait = setTimeout(() => { done = true; if (!root.classList.contains('is-yours')) { tour.play(); label(); } }, 1100);
    }, { threshold: .4 });
    io.observe(stage); off.push(() => { io.disconnect(); clearTimeout(wait); });
  }
  label();
  return () => off.forEach((f) => f());
}
