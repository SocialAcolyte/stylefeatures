// demo/scholar: the paper. Picks the layout for the stage (the title page wide, square or tall; on a phone the title page
// alone in one narrow column), hands that layout's script to the engine, reads the title page once when it is on screen,
// then gives every reference on it to the visitor: Fig. 1 enlarges, [1] lights its paper, Cite opens the BibTeX and Copy
// copies it, PDF opens the preview at its highlighted sentence, the asterisk goes to the final footnote. Below, the paper
// goes on: sidenotes light (or open, on narrow screens) from their marks, and a running head follows the reader.
// ?t=12.5 freezes a moment; ?record&ratio=16:9|1:1|9:16 is a clean stage for screen recording (../tour/README.md).
import { Tour } from '../tour/tour.js';
import { film } from './script.js';

const q = new URLSearchParams(location.search);
const shape = (r) => (r < .8 ? 'tall' : r < 1.15 ? 'square' : 'wide');     // the engine's own thresholds
const PHONE = 700;                                                          // narrower than this: the title page alone

export default function init(root) {
  const stage = root.querySelector('[data-tour-stage]');
  const win = root.querySelector('[data-tour-window]');
  const page = win.querySelector('.sc-page');
  const rec = q.has('record'), fixed = q.has('t'), thumb = q.has('thumb');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const off = [];

  const ratio = () => {
    if (rec) { const [a, b] = (q.get('ratio') || '16:9').split(':').map(Number); return a > 0 && b > 0 ? a / b : 16 / 9; }
    return innerWidth / Math.max(520, innerHeight);
  };
  const kindNow = () => (!rec && innerWidth < PHONE ? 'narrow' : shape(ratio()));

  // a phone: the window is the title page alone, 400 design px wide and as tall as it is (everything closed)
  function measureNarrow() {
    root.classList.add('is-narrow', 'is-measuring');
    const w = win.style.width; win.style.width = '400px';
    root.style.setProperty('--nh', Math.ceil(page.offsetHeight));
    win.style.width = w; root.classList.remove('is-measuring');
  }

  let kind = kindNow();
  root.classList.toggle('is-narrow', kind === 'narrow');
  if (kind === 'narrow') measureNarrow();
  const tour = new Tour(root, film(kind), { camera: kind === 'narrow' ? 'off' : undefined });
  root.tour = tour;
  off.push(() => tour.destroy());
  if (rec) return () => off.forEach((f) => f());
  win.removeAttribute('aria-hidden');       // on the page the title page is the real thing, not a picture of it

  const on = (el, ev, fn, o) => { el?.addEventListener(ev, fn, o); off.push(() => el?.removeEventListener(ev, fn, o)); };
  const isYours = () => root.classList.contains('is-yours');
  const fig = win.querySelector('.sc-fig'), veil = win.querySelector('.sc-veil'), pdf = win.querySelector('.sc-pdf');

  // ── after the film: the title page is the visitor's ──
  function yours(v) {
    root.classList.toggle('is-yours', v); page.scrollTop = 0;
    if (v) win.querySelectorAll('.is-hover, .is-press').forEach((e) => e.classList.remove('is-hover', 'is-press'));   // the film's cursor has left
    grow(); label();
  }
  function finish() { tour.pause(); tour.render(tour.duration, true); yours(true); }
  function closeAll() {
    setFig(false); setPdf(false);
    win.querySelectorAll('.sc-pub[data-open]').forEach((p) => cite(p, false));
  }
  function again() { closeAll(); yours(false); tour.render(0, true); tour.play(); label(); }

  function setFig(v) {
    fig?.classList.toggle('is-big', v); root.classList.toggle('is-fig-big', v); veil?.classList.toggle('is-on', v);
    if (v) setPdf(false);
    setTimeout(grow, 720);
  }
  function setPdf(v) {
    root.classList.toggle('is-pdf-open', v); pdf?.setAttribute('aria-hidden', String(!v)); veil?.classList.toggle('is-on', v || root.classList.contains('is-fig-big'));
    if (v) { root.classList.remove('is-fig-big'); fig?.classList.remove('is-big'); pdf?.querySelector('.sc-pdf-x')?.focus({ preventScroll: true }); }
  }
  // Cite: open the entry's BibTeX (one at a time on the title page); keep it in view inside the page
  function cite(pub, v = !pub.hasAttribute('data-open')) {
    pub.toggleAttribute('data-open', v);
    pub.querySelector('[data-cite]')?.setAttribute('aria-expanded', String(v));
    if (!v) pub.querySelector('.sc-bib-in')?.classList.remove('is-copied');
    if (page.contains(pub)) {
      if (v) win.querySelectorAll('.sc-pub[data-open]').forEach((p) => p !== pub && cite(p, false));
      setTimeout(() => {
        if (kind === 'narrow') { grow(); return; }
        const k = win.getBoundingClientRect().width / win.offsetWidth || 1;
        const pr = page.getBoundingClientRect(), br = pub.getBoundingClientRect();
        const over = (br.bottom - pr.bottom) / k + 24;
        page.scrollTo({ top: v && over > 0 ? page.scrollTop + over : 0, behavior: reduced ? 'auto' : 'smooth' });
      }, v ? 380 : 0);
    }
  }
  async function copy(btn) {
    const box = btn.closest('.sc-bib-in'), tex = box?.querySelector('.sc-tex');
    if (!tex) return;
    try { await navigator.clipboard.writeText(tex.textContent.trim()); } catch {
      const r = document.createRange(); r.selectNodeContents(tex); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    }
    box.classList.add('is-copied'); clearTimeout(box._t); box._t = setTimeout(() => box.classList.remove('is-copied'), 2400);
  }
  function light(el, ms = 1400) { if (!el) return; el.classList.add('is-lit'); clearTimeout(el._lit); el._lit = setTimeout(() => el.classList.remove('is-lit'), ms); }
  const noteFor = (mark) => root.querySelector(`.sc-sn[data-sn="${mark.dataset.sn}"]`);

  on(root, 'click', (e) => {
    const t = e.target;
    const inStage = stage.contains(t);
    if (inStage && !isYours() && win.contains(t)) finish();
    const a = t.closest('a, button, .sc-fig, .sc-veil'); if (!a) return;
    if (a.matches('[data-tour="ref-fig"], .sc-fig')) { e.preventDefault(); setFig(!fig.classList.contains('is-big')); return; }
    if (a.matches('.sc-veil')) { closeAll(); return; }
    if (a.matches('.sc-cite')) { e.preventDefault(); light(root.querySelector(a.getAttribute('href'))); return; }
    if (a.matches('[data-cite]')) { cite(a.closest('.sc-pub')); return; }
    if (a.matches('.sc-copy')) { copy(a); return; }
    if (a.matches('[data-pdf]') && a.closest('#pub-1') && pdf) { e.preventDefault(); setPdf(true); return; }
    if (a.matches('.sc-pdf-x')) { setPdf(false); return; }
    if (a.matches('.sc-fn')) {
      e.preventDefault(); const n = noteFor(a); if (!n) return;
      if (getComputedStyle(n).float === 'none' && n.closest('.sc-doc')) n.classList.toggle('is-open');
      light(n, 2200); return;
    }
    if (a.matches('.sc-star, .sc-corr-mark, .sc-rh-r a')) {
      const to = root.querySelector(a.getAttribute('href')) || (a.getAttribute('href') === '#top' ? root : null);
      if (!to) return;
      e.preventDefault(); to.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      if (to.matches('.sc-corr')) setTimeout(() => light(to, 2600), 700);
    }
  });
  on(document, 'keydown', (e) => { if (e.key === 'Escape' && (root.classList.contains('is-pdf-open') || root.classList.contains('is-fig-big'))) closeAll(); });
  on(win, 'pointerdown', () => { if (tour.playing) finish(); });
  // footnote marks light their sidenote while the pointer rests on them
  root.querySelectorAll('.sc-fn').forEach((m) => {
    on(m, 'pointerenter', () => noteFor(m)?.classList.add('is-lit'));
    on(m, 'pointerleave', () => noteFor(m)?.classList.remove('is-lit'));
  });

  // the control: read it to me, skip, read it again
  const btn = root.querySelector('.sc-ctl-btn'), say = btn?.querySelector('.sc-ctl-say');
  function label() {
    if (say) say.textContent = tour.playing ? 'Skip the reading' : isYours() ? 'Read it again' : 'Read it to me';
  }
  on(btn, 'click', () => { if (tour.playing) finish(); else again(); });
  on(root, 'tour:end', () => yours(true));

  // the page makes room when the title page grows past the stage (on a phone, as the figure or the BibTeX opens)
  function grow() {
    let g = 0;
    if (kind === 'narrow') { const s = stage.getBoundingClientRect(), b = page.getBoundingClientRect(); g = Math.max(0, b.bottom + 8 - s.bottom); }
    root.style.setProperty('--grow', g.toFixed(1) + 'px');
  }
  const ro = new ResizeObserver(grow); ro.observe(page); off.push(() => ro.disconnect());

  // the running head: shown once the title page has scrolled away; it names the section in view and its folio
  const run = root.querySelector('.sc-run'), runSec = run?.querySelector('.sc-run-sec'), runFolio = run?.querySelector('.sc-run-folio');
  if (run) {
    const secs = [...root.querySelectorAll('.sc-s[data-folio]')];
    const io1 = new IntersectionObserver(([e]) => run.style.setProperty('--run', e.isIntersecting ? 0 : 1), { threshold: 0, rootMargin: '0px 0px -100% 0px' });
    io1.observe(stage);
    const pick = () => {
      let cur = secs[0];
      for (const s of secs) if (s.getBoundingClientRect().top < innerHeight * .35) cur = s;
      if (!cur || run._cur === cur) return; run._cur = cur;
      const h = cur.querySelector('.sc-h');
      runSec.innerHTML = `<b class="sc-num">${cur.dataset.folio}</b> <span>${h ? [...h.childNodes].filter((n) => !n.classList?.contains('sc-n')).map((n) => n.textContent).join('').trim() : ''}</span>`;
      runFolio.textContent = cur.dataset.folio;
    };
    let raf = 0; const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(pick); };
    addEventListener('scroll', onScroll, { passive: true }); off.push(() => { removeEventListener('scroll', onScroll); io1.disconnect(); });
    pick();
  }

  // the paper's columns follow the title page's scale on wide screens, so the two read as one document
  const doc = root.querySelector('.sc-doc');
  const scale = () => { if (doc) doc.style.setProperty('--k', kind === 'wide' && innerWidth >= 1100 ? Math.min(1.15, Math.max(.84, tour.L?.s || 1)).toFixed(3) : 1); };

  // the stage changed shape (a window resized past a threshold, a phone turned): rebuild the script for that layout
  let rz = 0;
  const onResize = () => { clearTimeout(rz); rz = setTimeout(relayout, 140); };
  function relayout() {
    const k = kindNow();
    if (k === kind) { if (kind === 'narrow') measureNarrow(); scale(); grow(); return; }
    kind = k;
    root.classList.toggle('is-narrow', k === 'narrow');
    if (k === 'narrow') measureNarrow();
    Object.assign(tour, { camOn: k !== 'narrow' && !tour.still, touch: k === 'narrow' });
    root.classList.toggle('is-touch', tour.touch);
    tour.sizes.tall = k === 'narrow' ? [400, NaN] : [680, 1209];
    const t = tour.t, playing = tour.playing;
    tour.load(film(k));
    tour.render(isYours() ? tour.duration : Math.min(t, tour.duration), true);
    if (isYours()) page.scrollTop = 0;
    if (playing) tour.play();
    scale(); grow();
  }
  on(window, 'resize', onResize);
  document.fonts?.ready.then(() => { if (kind === 'narrow') measureNarrow(); scale(); grow(); });
  tour.ready?.then?.(() => scale());

  // when to read: never under ?t= (a frozen check frame); reduced motion and ?thumb get one calm frame;
  // otherwise once, a beat after the title page is on screen
  if (fixed) return () => off.forEach((f) => f());
  if (reduced) { tour.render(tour.duration, true); yours(true); }
  else if (thumb) tour.render(tour.api.marks.poster ?? 0, true);
  else {
    let wait = 0, done = false;
    const io = new IntersectionObserver(([e]) => {
      clearTimeout(wait);
      if (e.isIntersecting && !done) wait = setTimeout(() => { done = true; if (!isYours()) { tour.play(); label(); } }, 1100);
    }, { threshold: .4 });
    io.observe(stage); off.push(() => { io.disconnect(); clearTimeout(wait); });
  }
  label();
  return () => off.forEach((f) => f());
}
