// demo/versus: the same task, two ways, racing. Two tours on the engine's manual driver, one wall clock.
//
//   wall clock  0 ─ lead ─ both films play at real speed ─ product done ─ beat ─ fast-forward ─ old way done
//   clocks      race.js decides them: real time until the product is done, then the old way's clock runs through
//               to its measured time while its film plays out its remaining steps (labelled Fast-forward ×n)
//   counters    race.js `log` if given; otherwise the clicks each film draws, landing on the measured totals
//
// The page: the race is the first screen (it starts when it's on screen, or with Start both), then the score,
// the how strip and the time it gives back. ?record&ratio=16:9|1:1|9:16 plays the race, the score, the how
// strip and the ending as one recording; ?t=9 freezes the race (with ?record: the recording) at 9 s.
import { Tour, recordStage, include } from '../tour/tour.js';
import scripts from './script.js';
import race from './race.js';

const cl = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sm = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const io = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const dio = (t) => (t < .5 ? 12 * t * t : 3 * Math.pow(-2 * t + 2, 2));      // io's slope, for the ×n badge
const clock = (s) => { const d = Math.floor(Math.max(0, s) * 10 + 1e-6), m = Math.floor(d / 600), r = d % 600; return `${m}:${String(Math.floor(r / 10)).padStart(2, '0')}.${r % 10}`; };
const span = (s) => { s = Math.round(s); const m = Math.floor(s / 60), r = s % 60; return m ? `${m} min${r ? ` ${r} s` : ''}` : `${r} s`; };
const LEAD = .9;          // a beat at 0:00.0 before the start
const SETTLE = 1.6;       // held after the old way finishes
const SC = { score: 6.2, how: 7, end: 5 };   // ?record: seconds per scene after the race

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
  const lanes = { old: root.querySelector('[data-lane="old"]'), new: root.querySelector('[data-lane="new"]') };
  const films = { old: lanes.old.querySelector('.vs-film'), new: lanes.new.querySelector('.vs-film') };
  const name = lanes.new.querySelector('.vs-label em')?.textContent.trim() || 'Product';
  const productWin = films.new.querySelector('[data-tour-window]').cloneNode(true);   // for the how strip, before the engine touches it
  let alive = true, raf = 0, t0 = 0, playing = false, started = false, startT = 0;
  const off = [];
  const on = (el, ev, fn, o) => { el.addEventListener(ev, fn, o); off.push(() => el.removeEventListener(ev, fn, o)); };

  const box = rec ? recordStage(root, q) : null;
  const shape = () => {     // stacked lanes on phones, portrait screens, 1:1 and 9:16
    const w = box ? box.w : innerWidth, h = box ? box.h : innerHeight;
    root.classList.toggle('is-stacked', w / h < 1.2 || (!box && w < 900));
    root.classList.toggle('is-tall', w / h < .8);
    root.style.setProperty('--su', (box ? Math.min(w, h) : Math.min(w, h * 1.25)) / 100 + 'px');
  };
  shape(); on(window, 'resize', shape);

  const opt = { driver: 'manual', record: 'page', captions: 'off' };
  const T = { old: new Tour(films.old, scripts.old, opt), new: new Tour(films.new, scripts.product, opt) };

  // the clicks a film draws up to t (a double-click is two)
  const presses = (tour) => tour.track.filter((g) => g.press && g.kind !== 'swipe').flatMap((g) => (g.kind === 'drag' || g.kind === 'longpress' ? [g.press[0][0]] : g.press.map((p) => p[0])));
  const P = { old: presses(T.old), new: presses(T.new) };
  const upTo = (list, t) => { let n = 0; for (const x of list) if (x <= t) n++; return n; };

  // the race, worked out once
  const lastAct = T.new.track.reduce((m, g) => Math.max(m, g.act ?? g.end ?? 0), 0);
  const R = {
    newT: race.new.time ?? +(lastAct + .25).toFixed(1),
    oldT: race.old.time,
    oldEnd: T.old.outroAt,
  };
  R.newClicks = race.new.clicks ?? upTo(P.new, R.newT);
  R.oldClicks = race.old.clicks ?? P.old.length;
  R.F0 = R.newT + (race.beat ?? 1.4);
  R.FF = R.oldT > R.F0 + 1 ? (race.fastForward ?? 6) : 0;
  R.end = LEAD + R.F0 + R.FF + SETTLE;
  R.oldDrawn = upTo(P.old, R.oldEnd);
  R.tools = { old: race.old.tools || [], new: race.new.tools || [name] };

  // the whole race as a function of the wall clock w
  const at = (w) => {
    const u = Math.max(0, w - LEAD);
    let r, of, p = 0, rate = 1;
    if (u <= R.F0 || !R.FF) { r = Math.min(u, R.FF ? u : R.oldT); of = Math.min(u, R.oldEnd); }
    else { const x = cl((u - R.F0) / R.FF); p = io(x); r = R.F0 + (R.oldT - R.F0) * p; of = R.F0 + (R.oldEnd - R.F0) * p; rate = Math.max(1, (R.oldT - R.F0) / R.FF * dio(x)); }
    const ff = R.FF && u > R.F0 && u < R.F0 + R.FF;
    const oldClock = Math.min(r, R.oldT), newClock = Math.min(u, R.newT);
    const oldClicks = race.old.log ? upTo(race.old.log, oldClock) : u >= R.F0 + R.FF && u > R.F0 ? R.oldClicks
      : Math.min(R.oldClicks, upTo(P.old, of) + Math.round(Math.max(0, R.oldClicks - R.oldDrawn) * p));
    const newClicks = race.new.log ? upTo(race.new.log, newClock) : u >= R.newT ? R.newClicks : Math.min(R.newClicks, upTo(P.new, u));
    return { u, of, nf: u, oldClock, newClock, oldClicks, newClicks, ff, rate, p, oldDone: oldClock >= R.oldT - 1e-6, newDone: u >= R.newT };
  };

  const els = (lane) => ({ time: lane.querySelector('.vs-time'), n: lane.querySelector('.vs-n'), unit: lane.querySelector('.vs-unit'), rate: lane.querySelector('.vs-rate') });
  const E = { old: els(lanes.old), new: els(lanes.new) };
  const put = (el, v) => { if (el && el.textContent !== v) el.textContent = v; };
  let lastW = -1;
  function drawRace(w) {
    if (w === lastW) return; lastW = w;
    const s = at(w);
    T.old.render(s.of); T.new.render(s.nf);
    put(E.old.time, clock(s.oldClock)); put(E.new.time, clock(s.newClock));
    put(E.old.n, String(s.oldClicks)); put(E.new.n, String(s.newClicks));
    put(E.old.unit, s.oldClicks === 1 ? 'click' : 'clicks'); put(E.new.unit, s.newClicks === 1 ? 'click' : 'clicks');
    put(E.old.rate, '×' + Math.round(s.rate));
    lanes.old.classList.toggle('is-ff', s.ff); lanes.old.classList.toggle('is-done', s.oldDone && w > LEAD);
    lanes.new.classList.toggle('is-done', s.newDone);
    lanes.new.style.setProperty('--done', cl((s.u - R.newT) / .5).toFixed(3));
    root.classList.toggle('is-running', playing && w > 0 && w < R.end); root.classList.toggle('is-over', w >= R.end - SETTLE + .2);
  }

  // ── the score, the how strip and the ending, filled from race.js ──
  const rows = {
    time: { old: R.oldT, new: R.newT, f: clock, x: () => `${(R.oldT / R.newT).toFixed(R.oldT / R.newT >= 10 ? 0 : 1)}× faster` },
    clicks: { old: R.oldClicks, new: R.newClicks, f: String, x: () => `${R.oldClicks - R.newClicks} fewer` },
    tools: { old: R.tools.old.length, new: R.tools.new.length, f: String, x: () => (R.tools.new.length === 1 ? `One instead of ${R.tools.old.length}` : `${R.tools.old.length - R.tools.new.length} fewer`) },
  };
  root.querySelectorAll('.vs-srow').forEach((row) => {
    const d = rows[row.dataset.k]; if (!d) return;
    const max = Math.max(d.old, d.new) || 1;
    row.querySelectorAll('.vs-sv').forEach((sv) => {
      const k = sv.classList.contains('is-new') ? 'new' : 'old';
      sv.querySelector('.vs-snum').textContent = d.f(d[k]);
      sv.querySelector('.vs-sbar b').style.setProperty('--w', Math.max(.012, d[k] / max).toFixed(4));
      if (row.dataset.k === 'tools') sv.insertAdjacentHTML('beforeend', `<small class="vs-stools">${R.tools[k].join(' · ')}</small>`);
    });
    row.querySelector('[data-x]').textContent = d.x();
  });
  const src = root.querySelector('[data-source]'); if (src) src.textContent = race.source || '';
  const back = root.querySelector('[data-back]');
  if (back) {
    const clicksLead = race.lead === 'clicks';
    back.textContent = clicksLead ? `${R.oldClicks - R.newClicks} fewer clicks` : span(R.oldT - R.newT);
    back.parentElement.classList.toggle('is-clicks', clicksLead);
  }

  // the how strip: the product window, frozen at each key move
  const moves = root.querySelector('.vs-moves'), mtpl = root.querySelector('template.vs-move-tpl');
  const how = [];
  (race.how || []).forEach((m, i) => {
    if (!moves || !mtpl) return;
    const li = mtpl.content.firstElementChild.cloneNode(true);
    li.querySelector('.vs-mn').textContent = String(i + 1).padStart(2, '0');
    li.querySelector('h3').innerHTML = m.title; li.querySelector('.vs-ml').innerHTML = m.line;
    li.querySelector('.tour-rig').append(productWin.cloneNode(true));
    li.style.setProperty('--i', i);
    moves.append(li);
    const tour = new Tour(li.querySelector('.vs-mfilm'), scripts.product, opt);
    let t = +m.at;
    if (typeof m.at === 'string') {
      const el = tour.win.querySelector(m.at.replace(/@([\w-]+)/g, '[data-tour="$1"]'));
      const g = tour.track.find((x) => x.el === el);
      t = (g ? g.act ?? g.end : 0) + (m.after ?? 1);
    }
    tour.render(t, true); how.push({ tour, t });
  });

  // ── record: the race, then the score, the how strip and the ending, as one take ──
  if (rec) {
    const S0 = R.end, S1 = S0 + SC.score, S2 = S1 + SC.how, DUR = S2 + SC.end;
    const scene = (el, a, b) => { const v = Math.min(sm(cl((T_ - a) / .7)), b == null ? 1 : 1 - sm(cl((T_ - b + .35) / .7))); el.style.opacity = v.toFixed(3); el.style.visibility = v < .001 ? 'hidden' : 'visible'; return v; };
    const parts = { race: root.querySelector('.vs-race'), score: root.querySelector('.vs-score'), how: root.querySelector('.vs-how'), end: root.querySelector('.vs-end') };
    const srows = [...root.querySelectorAll('.vs-srow')], mv = [...root.querySelectorAll('.vs-move')];
    let T_ = 0;
    const frame = (t) => {
      T_ = Math.max(0, Math.min(DUR, t));
      drawRace(Math.min(T_, R.end));
      scene(parts.race, -1, S0); scene(parts.score, S0, S1); scene(parts.how, S1, S2); scene(parts.end, S2);
      srows.forEach((r, i) => r.style.setProperty('--g', sm(cl((T_ - S0 - .6 - i * .45) / 1.1)).toFixed(4)));
      mv.forEach((m, i) => m.style.setProperty('--in', sm(cl((T_ - S1 - .4 - i * .5) / .8)).toFixed(4)));
      root.style.setProperty('--end', sm(cl((T_ - S2 - .2) / 1)).toFixed(4));
    };
    window.versus = { seek: (t) => { playing = false; frame(+t); }, duration: DUR, race: R };
    Promise.all([T.old.api.ready, T.new.api.ready]).then(() => {
      if (!alive) return;
      if (fixT != null) return frame(fixT);
      frame(0);
      setTimeout(() => { if (!alive) return; playing = true; const s = performance.now(); const loop = (now) => { if (!alive || !playing) return; const t = (now - s) / 1000; frame(t); if (t < DUR) raf = requestAnimationFrame(loop); }; raf = requestAnimationFrame(loop); }, (+q.get('hold') || 1.2) * 1000);
    });
    return () => { alive = false; cancelAnimationFrame(raf); off.forEach((f) => f()); Object.values(T).forEach((t) => t.destroy()); how.forEach((h) => h.tour.destroy()); };
  }

  // ── the page ──
  const go = root.querySelector('.vs-go'), goLabel = root.querySelector('.vs-go-label'), again = root.querySelector('.vs-again');
  const stop = () => { playing = false; cancelAnimationFrame(raf); };
  const start = () => {
    stop(); clearTimeout(startT); started = true; root.classList.add('is-started');
    t0 = performance.now(); playing = true; lastW = -1;
    const loop = (now) => {
      if (!alive || !playing) return;
      const w = (now - t0) / 1000; drawRace(Math.min(w, R.end));
      if (w < R.end) raf = requestAnimationFrame(loop);
      else { playing = false; if (goLabel) goLabel.textContent = 'Race again'; }
    };
    raf = requestAnimationFrame(loop);
    if (goLabel) goLabel.textContent = 'Racing…';
  };
  if (go) on(go, 'click', start);
  if (again) on(again, 'click', () => { root.querySelector('.vs-race')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' }); start(); });
  const still = fixT != null || reduce;
  Promise.all([T.old.api.ready, T.new.api.ready]).then(() => {
    if (!alive) return;
    drawRace(still ? (fixT ?? R.end) : 0);
    if (still) { root.classList.add('is-still'); if (goLabel && fixT == null) goLabel.textContent = 'Race again'; return; }
    // start by itself once it's on screen, after a breath at 0:00.0
    const io2 = new IntersectionObserver(([e]) => { if (e.isIntersecting && !started) { clearTimeout(startT); startT = setTimeout(() => { if (!started) start(); }, 900); } else if (!e.isIntersecting) clearTimeout(startT); }, { threshold: .55 });
    io2.observe(root.querySelector('.vs-lanes')); off.push(() => io2.disconnect());
  });
  // the score's bars grow when they come into view
  const io3 = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io3.unobserve(e.target); } }), { threshold: .35 });
  root.querySelectorAll('.vs-srow, .vs-move').forEach((el) => io3.observe(el)); off.push(() => io3.disconnect());
  window.versus = { start, seek: (w) => { stop(); drawRace(+w); }, race: R };

  return () => { alive = false; stop(); clearTimeout(startT); off.forEach((f) => f()); Object.values(T).forEach((t) => t.destroy()); how.forEach((h) => h.tour.destroy()); };
}
