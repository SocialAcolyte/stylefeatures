// demo/portfolio: the shelf. One spine per project; one project open at a time, its film playing in its frame. While the
// shelf is on screen it plays through by itself: a project opens, its film plays once, holds, and folds away as the
// next one opens. A click (or Enter, or the arrow keys) on a spine opens that project and plays it from the start.
// Each film is its own Tour on the engine's manual driver; this file decides which plays and how far each is open.
//
//   ?project=3&t=4                project 3 open, its film frozen 4 s in
//   ?record&ratio=16:9|1:1|9:16   the person's name, every project in turn, then the address: once, for Monet Shot
//   ?record&t=20                  that moment of the recording, frozen
//
// Every frame is a function of (open project, the one before it, seconds since it began opening), so the page, the
// recording and a frozen ?t= all draw through the same draw().
import { Tour, include, recordStage, pause } from '../tour/tour.js';
import script from './script.js';

const TR = .95;       // a project opening (and the one before it folding), in seconds
const LEAD = .7;      // its film starts this long after it begins to open
const HOLD = 1.5;     // on the page: the film's last frame, held before the next project opens
const cl = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sm = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const NN = (n) => String(n).padStart(2, '0');

// harvested screens (<div data-tour-include="…">) load first, then the shelf starts
export default function init(root) {
  let stop = null, dead = false;
  include(root).then(() => { if (!dead) stop = boot(root); });
  return () => { dead = true; stop?.(); };
}

function boot(root) {
  const q = new URLSearchParams(location.search), rec = q.has('record');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fixT = q.get('t') != null ? +q.get('t') : null;
  const shelf = root.querySelector('.pf-shelf');
  const projs = [...root.querySelectorAll('.pf-proj')], N = projs.length;
  if (!shelf || !N) return () => {};
  const spines = projs.map((p) => p.querySelector('.pf-spine'));
  const bodies = projs.map((p) => p.querySelector('.pf-body'));
  const count = root.querySelector('.pf-count b'), of = root.querySelector('.pf-of');
  if (of) of.textContent = NN(N);
  shelf.style.setProperty('--n', N);
  let alive = true, raf = 0;
  const off = [];
  const on = (el, ev, fn, o) => { if (!el) return; el.addEventListener(ev, fn, o); off.push(() => el.removeEventListener(ev, fn, o)); };

  // the shape: a row of spines, or (phones, 9:16 recordings) a stack of bars with the open film under its bar
  const box = rec ? recordStage(root, q) : null;
  const narrow = matchMedia('(max-width: 760px)');
  const shape = () => {
    const v = box ? box.w / box.h < .8 : narrow.matches;
    root.classList.toggle('is-v', v);
    bodies.forEach((b) => { b.style.height = ''; });
    if (!v) return;
    let h;
    if (box) {      // the recording: the open project takes whatever the bars leave
      const cs = getComputedStyle(shelf), bar = spines[0].offsetHeight, gap = parseFloat(cs.rowGap) || 0;
      h = Math.max(120, shelf.clientHeight - N * bar - (N - 1) * gap);
    } else h = Math.max(...bodies.map((b) => b.offsetHeight));   // the page: every body as tall as the tallest, so nothing below jumps
    bodies.forEach((b) => { b.style.height = h + 'px'; });
    shelf.style.setProperty('--bh', h + 'px');
  };
  shape();

  // the films
  const films = projs.map((p, i) => {
    const el = p.querySelector('.pf-film'); if (!el) return null;
    const f = script.films?.[i] || { steps: [] };
    const S = { enter: f.enter || [.84, .97], pointer: f.pointer, intro: 0, settle: .3, outro: .3, still: f.still,
      steps: [...(f.start || []).map((s) => ({ ...s, at: 0 })), pause(.25), ...f.steps] };
    return new Tour(el, S, { driver: 'manual', record: 'page', captions: 'off' });
  });
  const dur = films.map((t) => (t ? t.duration : 4));
  const ready = Promise.all(films.filter(Boolean).map((t) => t.api.ready));

  // ── one frame ──
  const cache = new WeakMap();
  const put = (el, k, v) => { if (!el) return; let c = cache.get(el); if (!c) cache.set(el, (c = {})); if (c[k] === v) return; c[k] = v;
    if (k[0] === '-') el.style.setProperty(k, v); else if (k === 'text') el.textContent = v; else if (k === 'inert') el.inert = v; else if (k[0] === '@') el.setAttribute(k.slice(1), v); else el.style[k] = v; };
  const drawn = new Array(N).fill(null);
  const film = (i, t) => { const f = films[i]; if (!f || drawn[i] === t) return; drawn[i] = t; f.render(t); };
  function draw(cur, prev, local) {
    const e = reduce || prev < 0 || prev === cur ? 1 : sm(cl(local / TR));
    projs.forEach((p, i) => {
      const o = i === cur ? e : i === prev ? 1 - e : 0;
      put(p, '--o', o.toFixed(4));
      put(p, '--p', i === cur ? cl((local - LEAD) / dur[i]).toFixed(4) : '0');
      p.classList.toggle('is-open', i === cur);
      put(spines[i], '@aria-expanded', String(i === cur));
      put(bodies[i], 'inert', i !== cur);
      if (i === cur) film(i, reduce ? films[i]?.stillAt ?? 0 : Math.max(0, local - LEAD));
      else if (i === prev && e < 1) { if (drawn[i] == null) film(i, dur[i]); }     // folding away: keeps the frame it was on
      else film(i, films[i]?.stillAt ?? 0);
    });
    put(count, 'text', NN(cur + 1));
  }

  // ── ?record: the name, every project in turn, the address. Once. ──
  if (rec) {
    const INTRO = 2.4, FADE = .8, HOLD_R = .7, END = 3.8;
    const open = root.querySelector('.pf-rec-open'), end = root.querySelector('.pf-rec-end');
    const work = [root.querySelector('.pf-shelf-head'), shelf, root.querySelector('.pf-note')].filter(Boolean);
    const at = []; let T0 = INTRO + .35 - LEAD;          // the first film starts just after the title has gone
    for (let i = 0; i < N; i++) { at.push(T0); T0 += LEAD + dur[i] + HOLD_R; }
    const OUT = T0, TOTAL = OUT + FADE + END;
    const frame = (T) => {
      T = Math.max(0, Math.min(TOTAL, T));
      let i = 0; while (i < N - 1 && at[i + 1] <= T) i++;
      draw(i, i ? i - 1 : -1, T - at[i]);
      const title = 1 - sm(cl((T - (INTRO - FADE)) / FADE));
      const shown = sm(cl((T - (INTRO - FADE * .55)) / FADE)) * (1 - sm(cl((T - OUT) / FADE)));
      const fin = sm(cl((T - OUT - FADE * .45) / FADE));
      put(open, 'opacity', title.toFixed(3)); put(open, 'visibility', title < .002 ? 'hidden' : 'visible');
      put(open, 'transform', `translateY(${(-(1 - title) * 2).toFixed(2)}%)`);
      work.forEach((w) => { put(w, 'opacity', shown.toFixed(3)); put(w, 'transform', `translateY(${((1 - shown) * 1.6).toFixed(2)}%)`); });
      put(end, 'opacity', fin.toFixed(3)); put(end, 'visibility', fin < .002 ? 'hidden' : 'visible');
      put(end, 'transform', `translateY(${((1 - fin) * 2).toFixed(2)}%)`);
    };
    let stopped = false;
    window.portfolio = { seek: (t) => { stopped = true; frame(+t); }, duration: TOTAL };
    frame(fixT ?? 0);
    on(window, 'resize', () => { shape(); frame(fixT ?? 0); });
    ready.then(() => {
      if (!alive) return;
      shape();
      if (fixT != null) return frame(fixT);
      frame(0);
      setTimeout(() => {
        const s0 = performance.now();
        const loop = (now) => { if (!alive || stopped) return; const T = (now - s0) / 1000; frame(T); if (T < TOTAL) raf = requestAnimationFrame(loop); };
        raf = requestAnimationFrame(loop);
      }, (+q.get('hold') || 1.2) * 1000);
    });
    return () => { alive = false; cancelAnimationFrame(raf); off.forEach((f) => f()); films.forEach((t) => t?.destroy()); };
  }

  // ── the page ──
  const st = { cur: 0, prev: -1, at: 0, run: false, user: false, seen: false };
  let held = TR;      // seconds into the open project while the shelf is stopped (at first: open, its film not yet begun)
  const pp = root.querySelector('.pf-pp'), ppLabel = pp?.querySelector('span');
  const frozen = fixT != null;
  if (frozen) { st.cur = Math.max(1, Math.min(N, Math.round(+q.get('project') || 1))) - 1; held = LEAD + fixT; }

  const localAt = (now) => (st.run ? (now - st.at) / 1000 : held);
  function loop(now) {
    raf = 0; if (!alive) return;
    let local = localAt(now);
    if (st.run && local >= LEAD + dur[st.cur] + HOLD) { st.prev = st.cur; st.cur = (st.cur + 1) % N; st.at = now; local = 0; }
    draw(st.cur, st.prev, local);
    if (st.run || (!reduce && local < TR)) raf = requestAnimationFrame(loop);
  }
  const wake = () => { if (!raf && alive) raf = requestAnimationFrame(loop); };
  const setRun = (v) => {
    const now = performance.now();
    if (v === st.run) return wake();
    if (v) st.at = now - held * 1000; else held = (now - st.at) / 1000;
    st.run = v; wake();
  };
  let visible = false;
  const sync = () => {
    setRun(!reduce && !frozen && visible && !st.user);
    pp?.setAttribute('aria-pressed', String(st.user));
    if (ppLabel) ppLabel.textContent = st.user ? 'Play' : 'Pause';
    if (pp) pp.hidden = reduce || frozen;
  };
  // open project i and play it from the start (the open one again: just from the start)
  const go = (i) => {
    i = (i + N) % N;
    if (i === st.cur) held = TR; else { st.prev = st.cur; st.cur = i; held = 0; }
    st.at = performance.now() - held * 1000;
    st.user = false; sync(); wake();
  };

  ready.then(() => {
    if (!alive) return;
    shape(); drawn.fill(null); draw(st.cur, st.prev, held);
    if (frozen) return;
    const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting && en.intersectionRatio >= .3; sync(); }, { threshold: [0, .3, .6] });
    io.observe(shelf); off.push(() => io.disconnect());
    sync();
  });
  on(window, 'resize', () => { shape(); drawn.fill(null); wake(); });
  on(narrow, 'change', () => { shape(); drawn.fill(null); wake(); });
  spines.forEach((s, i) => on(s, 'click', () => go(i)));
  on(pp, 'click', () => { st.user = !st.user; sync(); });
  on(shelf, 'keydown', (e) => {
    const i = spines.indexOf(document.activeElement); if (i < 0) return;
    const k = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    const j = k ? (i + k + N) % N : e.key === 'Home' ? 0 : e.key === 'End' ? N - 1 : null;
    if (j == null) return;
    e.preventDefault(); spines[j].focus(); go(j);
  });
  sync();

  return () => { alive = false; cancelAnimationFrame(raf); off.forEach((f) => f()); films.forEach((t) => t?.destroy()); };
}
