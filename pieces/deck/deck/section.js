// demo/deck: the site is a keynote. Full-screen slides, one idea each; the tour slides play the product in a window.
//
//   advance   → ↓ space PageDown Enter, a click (the left third goes back), a swipe, a scroll tick
//   back      ← ↑ PageUp Backspace          Home / End: first / last
//   G         all slides (also a pinch, or ⌃ + scroll on a trackpad); click one to go there, Esc to leave
//   P         play as a talk: each slide stays up for its data-dur, then moves on, with the progress line
//   #4        opens on slide 4
//   ?record&ratio=16:9|1:1|9:16   the deck played as a talk, once, for Monet Shot
//   ?t=20     that moment of the talk, frozen       ?slide=4&t=3   slide 4, 3 s after it arrived, frozen
//
// Every frame is a function of (slide, seconds since it arrived, overview amount), so the talk, the record stage
// and a frozen ?t= all draw through the same draw().
import { Tour, recordStage, pause, include } from '../tour/tour.js';
import script from './script.js';

const TR = .8;          // a transition, in seconds
const LEAD = .65;       // a tour slide's film starts this long after the slide arrives (plus the film's own .25 s beat)
const BUILD = .7;       // how long a data-build element takes to fade up
const cl = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sm = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + (b - a) * t;
const NN = (n) => String(n).padStart(2, '0');

// harvested screens (<div data-tour-include="…">) load first, then the format starts
export default function init(root) {
  let stop = null, dead = false;
  include(root).then(() => { if (!dead) stop = boot(root); });
  return () => { dead = true; stop?.(); };
}

function boot(root) {
  const q = new URLSearchParams(location.search), rec = q.has('record');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fixT = q.get('t') != null ? +q.get('t') : null;
  const slides = [...root.querySelectorAll('.deck-slide')], N = slides.length;
  const bar = root.querySelector('.deck-bar'), prog = root.querySelector('.deck-progress b');
  const countI = root.querySelector('.deck-i'), countOf = root.querySelector('.deck-of');
  let alive = true, raf = 0;
  const off = [];
  const on = (el, ev, fn, o) => { if (!el) return; el.addEventListener(ev, fn, o); off.push(() => el.removeEventListener(ev, fn, o)); };
  if (countOf) countOf.textContent = NN(N);

  // the box: the screen on the page, the ratio's box in ?record
  const box = rec ? recordStage(root, q) : null;
  const D = { W: 0, H: 0, su: 9 };
  const shape = () => {
    D.W = box ? box.w : root.clientWidth || innerWidth; D.H = box ? box.h : root.clientHeight || innerHeight;
    const a = D.W / D.H; D.su = Math.min(D.W, D.H) / 100;
    root.classList.toggle('is-wide', a >= 1.2); root.classList.toggle('is-square', a < 1.2 && a >= .8); root.classList.toggle('is-tall', a < .8);
    root.style.setProperty('--su', D.su + 'px');
  };
  shape(); on(window, 'resize', () => { shape(); dirty = true; });

  // the tour slides: each window gets a copy of the product and its own film
  const tpl = root.querySelector('template.deck-product')?.content;
  const films = slides.map((s) => {
    const film = s.querySelector('.deck-film'); if (!film) return null;
    const w = film.querySelector('[data-tour-window]');
    if (w && !w.firstElementChild && tpl) w.append(tpl.cloneNode(true));
    const f = script.films[+s.dataset.film || 0] || { steps: [] };
    const S = { size: script.size, enter: f.enter || script.enter, pointer: script.pointer, intro: 0, settle: .3, outro: .2, still: f.still,
      steps: [...(f.start || []).map((st) => ({ ...st, at: 0 })), pause(.25), ...f.steps] };
    return new Tour(film, S, { driver: 'manual', record: 'page', captions: 'off' });
  });
  const builds = slides.map((s) => [...s.querySelectorAll('[data-build]')].map((el) => ({ el, d: +el.dataset.build || 0 })));
  const dur = slides.map((s, i) => (s.dataset.dur ? +s.dataset.dur : films[i] ? LEAD + films[i].duration + 1.1 : 5));
  const starts = dur.reduce((a, d, i) => (a.push(i ? a[i - 1] + dur[i - 1] : 0), a), []);
  const TOTAL = starts[N - 1] + dur[N - 1];

  // ── one frame ──
  const cache = new WeakMap();
  const put = (el, k, v) => { let c = cache.get(el); if (!c) cache.set(el, (c = {})); if (c[k] !== v) { c[k] = v; if (k[0] === '-') el.style.setProperty(k, v); else el.style[k] = v; } };
  function grid() {      // where each slide sits in the overview
    const { W, H, su } = D, cols = W / H >= 1.2 ? 4 : 3, rows = Math.ceil(N / cols), gap = su * 1.8;
    const top = su * 7, AW = W - su * 10, AH = H - top - su * 9;
    const s = Math.min((AW - (cols - 1) * gap) / cols / W, (AH - (rows - 1) * gap) / rows / H);
    const cw = W * s, ch = H * s, x0 = (W - (cols * cw + (cols - 1) * gap)) / 2, y0 = top + (AH - (rows * ch + (rows - 1) * gap)) / 2;
    return slides.map((_, i) => ({ x: x0 + (i % cols) * (cw + gap), y: y0 + Math.floor(i / cols) * (ch + gap), s }));
  }
  function draw(cur, prev, local, dir, ov, talkT) {
    const raw = reduce || cur === prev ? 1 : cl(local / TR), p = sm(raw), G = ov > 0 ? grid() : null, { W, H } = D;
    const pin = sm(cl((raw - .3) / .7)), pout = sm(cl(raw / .6));     // the old slide clears before the new one settles in
    root.style.setProperty('--ov', ov.toFixed(3));
    root.classList.toggle('is-ov', ov > .5);
    slides.forEach((s, i) => {
      const kind = s.dataset.enter || 'fade';
      let o = 0, x = 0, k = 1;
      if (i === cur) { o = pin; if (kind === 'scale') k = 1.035 - .035 * p; if (kind === 'push') x = dir * (1 - p) * .06; }
      else if (i === prev && p < 1) { o = 1 - pout; if (kind === 'scale' || slides[cur].dataset.enter === 'scale') k = 1 - .02 * p; if (slides[cur].dataset.enter === 'push') x = -dir * p * .06; }
      let X = x * W + (1 - k) * W / 2, Y = (1 - k) * H / 2;
      if (G) { const g = G[i], e = sm(ov); X = lerp(X, g.x, e); Y = lerp(Y, g.y, e); k = lerp(k, g.s, e); o = lerp(o, 1, e); }
      put(s, 'transform', X || Y || k !== 1 ? `translate(${X.toFixed(2)}px,${Y.toFixed(2)}px) scale(${k.toFixed(5)})` : '');
      put(s, 'opacity', o.toFixed(3));
      put(s, 'visibility', o < .002 ? 'hidden' : 'visible');
      s.classList.toggle('is-cur', i === cur);
      s.setAttribute('aria-hidden', i === cur ? 'false' : 'true');
      // builds: the current slide's from its own clock; every other slide shows them done
      const lt = i === cur && !reduce ? local : 1e3;
      for (const b of builds[i]) put(b.el, '--in', sm(cl((lt - b.d) / BUILD)).toFixed(3));
      // films: the current one plays from its own clock, the rest rest on their still frame
      const t = films[i]; if (!t) return;
      if (i === cur && !reduce) t.render(Math.max(0, local - LEAD));
      else if (i !== prev || p >= 1) t.render(i === cur || ov > 0 || reduce ? t.stillAt : 0);
    });
    if (countI) countI.textContent = NN(cur + 1);
    const pr = talkT != null ? talkT / TOTAL : N > 1 ? cur / (N - 1) : 1;
    if (prog) put(prog, 'transform', `scaleX(${cl(pr).toFixed(4)})`);
  }
  // the talk as a function of one number
  const talkAt = (T) => { T = Math.max(0, Math.min(TOTAL, T)); let i = 0; while (i < N - 1 && starts[i + 1] <= T) i++; return { cur: i, prev: Math.max(0, i - 1), local: T - starts[i], T }; };
  const ready = Promise.all(films.filter(Boolean).map((t) => t.api.ready));

  // ── ?record: the talk, once ──
  if (rec) {
    const frame = (T) => { const s = talkAt(T); draw(s.cur, s.cur ? s.prev : 0, s.cur ? s.local : 1e3, 1, 0, s.T); };
    window.deck = { seek: (t) => { stopRec = true; frame(+t); }, duration: TOTAL, slides: N };
    let stopRec = false;
    ready.then(() => {
      if (!alive) return;
      if (fixT != null) return frame(fixT);
      frame(0);
      setTimeout(() => { const s0 = performance.now(); const loop = (now) => { if (!alive || stopRec) return; const T = (now - s0) / 1000; frame(T); if (T < TOTAL) raf = requestAnimationFrame(loop); }; raf = requestAnimationFrame(loop); }, (+q.get('hold') || 1.2) * 1000);
    });
    return () => { alive = false; cancelAnimationFrame(raf); off.forEach((f) => f()); films.forEach((t) => t?.destroy()); };
  }

  // ── the page ──
  const st = { cur: 0, prev: 0, at: performance.now() - 1e6, dir: 1, ov: 0, ovFrom: 0, ovTo: 0, ovAt: 0, talk: false, frozen: null };
  let dirty = true;
  const fromHash = () => { const n = parseInt(location.hash.slice(1), 10); return n >= 1 && n <= N ? n - 1 : null; };
  const h0 = fromHash(); if (h0 != null) st.cur = st.prev = h0;
  const setOv = (v) => { if (st.ovTo === v) return; st.ovFrom = st.ov; st.ovTo = v; st.ovAt = performance.now(); if (v) setTalk(false); dirty = true; };
  const go = (i, dir) => {
    i = Math.max(0, Math.min(N - 1, i)); if (i === st.cur) return;
    st.prev = st.cur; st.cur = i; st.dir = dir ?? (i > st.prev ? 1 : -1); st.at = performance.now(); dirty = true;
    try { history.replaceState(null, '', '#' + (i + 1)); } catch (e) {}
  };
  const next = () => (st.ovTo ? null : go(st.cur + 1)), back = () => (st.ovTo ? null : go(st.cur - 1));
  const playBtn = root.querySelector('.deck-play');
  function setTalk(v) {
    st.talk = v; root.classList.toggle('is-talk', v);
    playBtn?.setAttribute('aria-label', v ? 'Pause the talk' : 'Play as a talk');
    const l = playBtn?.querySelector('span'); if (l) l.textContent = v ? 'Pause' : 'Play talk';
    if (v && st.cur === N - 1) { st.prev = st.cur; st.cur = 0; st.dir = 1; st.at = performance.now(); }
    else if (v) st.at = performance.now() - Math.min((performance.now() - st.at), 1e3 * dur[st.cur] * .5);   // carry on from about here
    dirty = true;
  }

  const loop = (now) => {
    if (!alive) return;
    const local = (now - st.at) / 1000;
    if (st.talk && local >= dur[st.cur]) { if (st.cur < N - 1) go(st.cur + 1, 1); else setTalk(false); }
    const ovP = cl((now - st.ovAt) / 450); st.ov = lerp(st.ovFrom, st.ovTo, sm(ovP));
    const busy = dirty || ovP < 1 || local < 12 + LEAD + (films[st.cur]?.duration || 0) || st.talk;
    if (busy) {
      dirty = false;
      draw(st.cur, st.prev, (now - st.at) / 1000, st.dir, st.ov, st.talk ? starts[st.cur] + Math.min((now - st.at) / 1000, dur[st.cur]) : null);
    }
    raf = requestAnimationFrame(loop);
  };

  ready.then(() => {
    if (!alive) return;
    if (fixT != null) {       // frozen: a moment of the talk, or of one slide
      const sl = q.get('slide');
      if (sl != null) { const i = Math.max(1, Math.min(N, +sl)) - 1; draw(i, i, fixT, 1, 0, null); }
      else { const s = talkAt(fixT); draw(s.cur, s.cur ? s.prev : 0, s.cur ? s.local : 1e3, 1, 0, s.T); }
      return;
    }
    st.at = performance.now() - (h0 != null ? 0 : 0);
    raf = requestAnimationFrame(loop);
  });

  // ── input ──
  const NEXT = new Set(['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter']), BACK = new Set(['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace']);
  on(window, 'keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    if (e.key === 'Enter' && e.target.closest?.('a, button')) return;
    if (e.key === ' ' && e.target.closest?.('button')) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (NEXT.has(e.key)) { e.preventDefault(); next(); }
    else if (BACK.has(e.key)) { e.preventDefault(); back(); }
    else if (k === 'Home') { e.preventDefault(); go(0); }
    else if (k === 'End') { e.preventDefault(); go(N - 1); }
    else if (k === 'g' || k === 'o') { e.preventDefault(); setOv(st.ovTo ? 0 : 1); }
    else if (k === 'Escape') setOv(0);
    else if (k === 'p' || k === 'k') setTalk(!st.talk);
    else return;
    wake();
  });
  on(root.querySelector('.deck-stage'), 'click', (e) => {
    if (e.target.closest('a, button, input, label, select')) return;
    if (st.ovTo) { const s = e.target.closest('.deck-slide'); if (s) { const i = slides.indexOf(s); setOv(0); if (i !== st.cur) { st.prev = st.cur = i; st.at = performance.now() - TR * 1000; dirty = true; try { history.replaceState(null, '', '#' + (i + 1)); } catch (er) {} } } return; }
    if (getSelection()?.toString()) return;
    const r = root.getBoundingClientRect();
    (e.clientX - r.left < r.width * .3 ? back : next)();
  });
  on(playBtn, 'click', () => setTalk(!st.talk));
  on(root.querySelector('.deck-ov'), 'click', () => setOv(st.ovTo ? 0 : 1));
  on(root.querySelector('.deck-prev'), 'click', back);
  on(root.querySelector('.deck-next'), 'click', next);
  // scroll ticks: one slide per gesture, however long the trackpad keeps coasting; ⌃ + scroll (a pinch) opens the overview
  let acc = 0, lockUntil = 0, pinch = 0;
  on(root, 'wheel', (e) => {
    e.preventDefault(); const now = performance.now();
    if (e.ctrlKey) { pinch += e.deltaY; if (pinch > 30) { setOv(1); pinch = 0; } else if (pinch < -30) { setOv(0); pinch = 0; } return; }
    if (st.ovTo) return;
    if (now < lockUntil) { lockUntil = Math.max(lockUntil, now + 260); return; }
    acc += Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (Math.abs(acc) > 36) { (acc > 0 ? next : back)(); acc = 0; lockUntil = now + 650; }
  }, { passive: false });
  // swipes, and a two-finger pinch for the overview
  let t0 = null, d0 = 0;
  const dist = (ts) => Math.hypot(ts[0].clientX - ts[1].clientX, ts[0].clientY - ts[1].clientY);
  on(root, 'touchstart', (e) => { if (e.touches.length === 2) { d0 = dist(e.touches); t0 = null; } else if (e.touches.length === 1) t0 = { x: e.touches[0].clientX, y: e.touches[0].clientY, at: performance.now() }; }, { passive: true });
  on(root, 'touchmove', (e) => {
    if (e.touches.length === 2 && d0) { e.preventDefault(); const r = dist(e.touches) / d0; if (r < .75) { setOv(1); d0 = 0; } else if (r > 1.3) { setOv(0); d0 = 0; } }
    else if (t0 && e.cancelable) e.preventDefault();
  }, { passive: false });
  on(root, 'touchend', (e) => {
    if (!t0 || e.touches.length) return;
    const c = e.changedTouches[0], dx = c.clientX - t0.x, dy = c.clientY - t0.y; t0 = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 40) return;
    e.preventDefault();      // a swipe isn't also a tap
    if (Math.abs(dx) > Math.abs(dy)) (dx < 0 ? next : back)(); else (dy < 0 ? next : back)();
  });
  on(window, 'hashchange', () => { const i = fromHash(); if (i != null) go(i); });
  // the bar fades while you watch, and comes back when the pointer moves
  let idleT = 0;
  function wake() { root.classList.remove('is-idle'); clearTimeout(idleT); idleT = setTimeout(() => root.classList.add('is-idle'), 2600); }
  on(root, 'pointermove', (e) => { if (e.pointerType === 'mouse') wake(); });
  wake();

  window.deck = { go: (i) => go(i - 1), next, back, overview: (v = true) => setOv(v ? 1 : 0), talk: (v = true) => setTalk(v), duration: TOTAL, slides: N };
  return () => { alive = false; cancelAnimationFrame(raf); clearTimeout(idleT); off.forEach((f) => f()); films.forEach((t) => t?.destroy()); };
}
