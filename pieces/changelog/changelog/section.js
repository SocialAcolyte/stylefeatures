// demo/changelog: a person's release notes, read top to bottom.
//   the layout   section.js picks .is-wide (rail column) / .is-mid / .is-narrow (rail bar) from the page width, or
//                from the recording ratio, and sets --px (1px on the page; the record box's share of a design width)
//   the rail     one row per .cl-release, built here: 52 week cells, the entries marked on them (data-date), real
//                activity levels from data-weeks="0,1,4,…" if given. It follows the reading line and points at the
//                week of the entry you're reading. Click a marked week to go to its entry.
//   the films    each .cl-film is its own Tour on the manual driver, played from the start, once, when it reaches
//                the middle of the screen; paused when another one does; reset once it has left the screen. The last
//                one (data-film="next") drafts the Unreleased entry and brings the address in (--addr).
//   ?record      the page reads itself: it scrolls the log top to bottom, holds on each release, plays each film as
//                the reading reaches it and ends on the Unreleased entry. &ratio=16:9|1:1|9:16, &t= freezes a moment.
//   ?t=4         (without ?record) every film frozen at 4 s
import { Tour, recordStage, pause } from '../tour/tour.js';
import script from './script.js';

const BEAT = .35;                                   // a breath before each film starts
const DESIGN = { wide: 1240, mid: 760, narrow: 430 };   // ?record: the page width each ratio is set at
const cl = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sm = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const io = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);   // a long read: eases in and out, steady between

export default function init(root) {
  const q = new URLSearchParams(location.search), rec = q.has('record');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fixT = q.get('t') != null ? +q.get('t') : null;
  let alive = true, raf = 0;
  const off = [];
  const on = (el, ev, fn, o) => { if (!el) return; el.addEventListener(ev, fn, o); off.push(() => el.removeEventListener(ev, fn, o)); };

  // ── the layout ──
  const box = rec ? recordStage(root, q) : null;
  let mode = '';
  const shape = () => {
    let m, px = 1;
    if (box) { const a = box.w / box.h; m = a >= 1.2 ? 'wide' : a >= .8 ? 'mid' : 'narrow'; px = box.w / DESIGN[m]; }
    else { const w = root.clientWidth || innerWidth; m = w >= 1100 ? 'wide' : w >= 720 ? 'mid' : 'narrow'; }
    root.style.setProperty('--px', px.toFixed(4) + 'px');
    if (m === mode) return false;
    ['wide', 'mid', 'narrow'].forEach((k) => root.classList.toggle('is-' + k, k === m));
    mode = m; return true;
  };
  shape();

  // ── the rail: a row of weeks per release ──
  const releases = [...root.querySelectorAll('.cl-release')];
  const next = root.querySelector('.cl-next');
  const years = root.querySelector('.cl-years'), nextRow = years?.querySelector('.cl-yr-next');
  const week = (d) => {         // "2026-03" or "2026-03-14" → 0…51
    const [y, m, dd] = String(d || '').split('-').map(Number); if (!y || !m) return null;
    const day = (Date.UTC(y, m - 1, dd || 15) - Date.UTC(y, 0, 1)) / 864e5;
    return Math.max(0, Math.min(51, Math.floor(day / 7)));
  };
  const rows = releases.map((rel) => {
    const li = document.createElement('li'); li.className = 'cl-yr'; li.dataset.year = rel.dataset.year || '';
    li.innerHTML = `<a href="#${rel.id}"><b>${rel.dataset.year || ''}</b><span>${rel.dataset.version || ''}</span></a><i class="cl-wk" aria-hidden="true"></i>`;
    const wk = li.querySelector('.cl-wk'), lv = (rel.dataset.weeks || '').split(',').map(Number);
    const cells = Array.from({ length: 52 }, (_, i) => { const c = document.createElement('i'); if (lv[i] > 0) c.style.setProperty('--lv', Math.min(4, lv[i])); wk.append(c); return c; });
    const entries = [...rel.querySelectorAll('.cl-entry')].map((e) => {
      const w = week(e.dataset.date);
      if (w != null) {
        const c = cells[w]; c.classList.add('is-e'); if (e.dataset.tag === 'shipped') c.classList.add('is-ship');
        c.title = (e.querySelector('h3')?.firstChild?.textContent || '').trim();
        c.addEventListener('click', () => e.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' }));
      }
      return { e, w };
    });
    years?.append(li);
    return { rel, li, wk, entries };
  });

  // the reading line: which release, and which entry in it, sits at it
  let onRow = null, onHead = -1;
  const view = () => (box ? { top: root.getBoundingClientRect().top, h: box.h } : { top: 0, h: innerHeight });
  function read() {
    const v = view(), line = v.top + v.h * .42;
    let row = rows[0], head = null;
    if (next && next.getBoundingClientRect().top <= line) row = 'next';
    else for (const r of rows) {
      if (r.rel.getBoundingClientRect().top > line) break;
      row = r;
    }
    if (row && row !== 'next') {
      let e = row.entries.find((x) => x.w != null);
      for (const x of row.entries) { if (x.e.getBoundingClientRect().top > line) break; if (x.w != null) e = x; }
      head = e ? (e.w + .5) / 52 : 0;
    }
    root.classList.toggle('is-reading', !!releases[0] && releases[0].getBoundingClientRect().top <= v.top + v.h * .2);
    if (row !== onRow) {
      onRow = row;
      rows.forEach((r) => r.li.classList.toggle('is-on', r === row));
      nextRow?.classList.toggle('is-on', row === 'next');
      root.classList.toggle('is-next', row === 'next');
    }
    if (head != null && head !== onHead) { onHead = head; row.wk.style.setProperty('--head', head.toFixed(4)); }
  }

  // ── the films ──
  const films = [...root.querySelectorAll('.cl-film')].map((el) => {
    const f = script.films?.[el.dataset.film] || { steps: [] };
    const S = { enter: f.enter || [.86, 1.02], intro: 0, settle: .35, outro: .25, still: f.still != null ? BEAT + f.still : undefined,
      steps: [...(f.start || []).map((s) => ({ ...s, at: 0 })), pause(BEAT), ...f.steps] };
    const tour = new Tour(el, S, { driver: 'manual', record: 'page', captions: 'off' });
    const holder = el.closest('.cl-body') || el.closest('.cl-next');
    const F = { el, tour, again: holder?.querySelector('.cl-again'), keep: el.dataset.film === 'next', done: false, shown: -1 };
    const addAt = tour.api.marks?.addr;
    tour.onFrame = (t) => {
      el.style.setProperty('--p', (t / tour.duration).toFixed(4));
      if (addAt != null) root.style.setProperty('--addr', sm(cl((t - addAt) / .8)).toFixed(3));
    };
    tour.onFrame(Math.max(0, tour.t));
    on(el, 'tour:end', () => { F.done = true; el.classList.remove('is-running'); if (F.again && !rec) F.again.hidden = false; });
    return F;
  });
  const ready = Promise.all([document.fonts?.ready, ...films.map((f) => f.tour.api.ready)]);

  // ── ?record: the page reads itself, once ──
  if (rec) {
    let plan = null, stopRec = false;
    const at = (el) => el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop;
    // the reading: a hold on Now, then a stop at each release and each film, in page order; the Unreleased entry last
    const build = () => {
      const H = box.h, max = Math.max(0, root.scrollHeight - H);
      const bar = mode === 'wide' ? 0 : root.querySelector('.cl-rail')?.offsetHeight || 0;
      const clampY = (y) => Math.max(0, Math.min(max, y));
      const stops = [];
      releases.forEach((rel) => stops.push({ y: clampY(at(rel) - bar - H * .1), hold: 1.1, el: rel }));
      films.forEach((f) => {
        const entry = f.el.closest('.cl-entry') || f.el.closest('.cl-next');
        const top = at(entry) - bar, bot = f.keep ? at(root.querySelector('.cl-addr')) + root.querySelector('.cl-addr').offsetHeight : at(f.el) + f.el.offsetHeight;
        const span = bot - top, room = H - bar;
        const y = span < room * .9 ? top - (room - span) / 2 : top - room * .05;
        stops.push({ y: clampY(y), film: f, el: entry });
      });
      stops.sort((a, b) => a.y - b.y || (a.film ? 1 : -1));
      // a release whose first film stop follows close behind is read on the way to it
      const keep = stops.filter((s, i) => s.film || !(stops[i + 1]?.film && stops[i + 1].y - s.y < H * .55));
      const segs = []; let T = 2.4, y = 0;
      for (const s of keep) {
        const d = Math.abs(s.y - y), dur = d < 2 ? 0 : Math.min(4.6, Math.max(1.2, .7 + d / (H * .6)));
        if (dur) segs.push({ kind: 'read', t0: T, t1: T + dur, y0: y, y1: s.y });
        T += dur; y = s.y;
        if (s.film) { T += .25; s.film.t0 = T; T += s.film.tour.duration + .35; }
        else T += s.hold;
      }
      return { segs, total: T + 1.4 };
    };
    const yAt = (T) => {
      let y = 0;
      for (const s of plan.segs) { if (T < s.t0) break; y = T >= s.t1 ? s.y1 : s.y0 + (s.y1 - s.y0) * (s.t1 - s.t0 > 2.4 ? io : sm)((T - s.t0) / (s.t1 - s.t0)); }
      return y;
    };
    const frame = (T) => {
      root.scrollTop = yAt(T);
      for (const f of films) {
        const lt = f.t0 == null ? 0 : Math.max(0, Math.min(f.tour.duration, T - f.t0));
        f.el.classList.toggle('is-running', lt > 0 && lt < f.tour.duration);
        if (Math.abs(lt - f.shown) > 1e-4) { f.shown = lt; f.tour.render(lt); }
      }
      read();
    };
    window.changelog = { seek: (t) => { stopRec = true; frame(+t); }, get duration() { return plan?.total; }, get plan() { return plan; } };
    ready.then(() => {
      if (!alive) return;
      plan = build();
      on(window, 'resize', () => { shape(); requestAnimationFrame(() => { plan = build(); films.forEach((f) => { f.shown = -1; }); }); });
      if (fixT != null) return frame(fixT);
      frame(0);
      setTimeout(() => {
        const s0 = performance.now();
        const loop = (now) => { if (!alive || stopRec) return; const T = (now - s0) / 1000; frame(Math.min(T, plan.total)); if (T < plan.total) raf = requestAnimationFrame(loop); };
        raf = requestAnimationFrame(loop);
      }, (+q.get('hold') || 1.2) * 1000);
    });
    return () => { alive = false; cancelAnimationFrame(raf); off.forEach((f) => f()); films.forEach((f) => f.tour.destroy()); };
  }

  // ── the page: a film plays as it reaches the middle of the screen ──
  const still = reduce || fixT != null;
  let cur = null;
  const run = (f) => {
    if (f.tour.t >= f.tour.duration - .02) { f.tour.render(0, true); f.done = false; }
    f.el.classList.add('is-running'); f.tour.play();
  };
  function pick() {
    raf = 0; if (!alive) return;
    read();
    if (still) return;
    const H = innerHeight;
    let best = null, bd = Infinity;
    for (const f of films) {
      const r = f.el.getBoundingClientRect(), c = r.top + r.height / 2;
      if (r.bottom < 0 || r.top > H) {        // off the screen: next time it arrives it plays from the start
        if (!f.keep && f.tour.t > 0 && f !== cur) { f.tour.pause(); f.tour.render(0, true); f.done = false; f.el.classList.remove('is-running'); }
        continue;
      }
      const d = Math.abs(c - H * .5);
      if (c > H * .2 && c < H * .8 && d < bd) { best = f; bd = d; }
    }
    if (best === cur) return;
    if (cur) { cur.tour.pause(); cur.el.classList.remove('is-running'); }
    cur = best;
    if (cur && !cur.done) run(cur);
  }
  const later = () => { if (!raf) raf = requestAnimationFrame(pick); };
  on(window, 'scroll', later, { passive: true });
  on(window, 'resize', () => { shape(); later(); });
  films.forEach((f) => on(f.again, 'click', () => {
    if (cur && cur !== f) { cur.tour.pause(); cur.el.classList.remove('is-running'); }
    cur = f; f.done = false; f.tour.render(0, true); run(f);
  }));
  ready.then(() => { if (alive) { films.forEach((f) => f.tour.onFrame(Math.max(0, f.tour.t))); pick(); } });
  window.changelog = { films: films.map((f) => f.tour.api) };

  return () => { alive = false; cancelAnimationFrame(raf); off.forEach((f) => f()); films.forEach((f) => f.tour.destroy()); };
}
