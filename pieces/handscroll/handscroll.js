/* ─── handscroll: a Chinese handscroll, read right to left an arm's length at a time ───────────────────────
   Zhou Chen's Beggars and Street Characters (1516, Cleveland Museum of Art 1964.94), mounted as a handscroll.
   The slides are the scroll's own sections: twelve album leaves, the artist's inscription and three colophons,
   behind a frontispiece, each a real <img> cut at the scroll's own seams. A page may mount leaves of its own between
   them (li.hs-sheet: its own words on this scroll's paper, between its silk), as albums faced paintings with
   writing. Without JS it is all a row that scrolls sideways from the right.

   Two ways to read it:
   - data-mode="carousel" (default): it lies open; Unroll/Back, drag, keys.
   - data-mode="scene": it lies closed in the page, the wrapper and title slip up. Scrolling the page on pins it
     and opens it: the closed scroll rolls to the left until its free edge comes round under it, lays the start of
     the scroll out to its right, and the page scroll then unrolls it, section by section, with the part seen
     rolled up on the right. With reduced motion it is the carousel.

   The flat paper is always the <img>s (and the page's own leaves, as HTML). A WebGL2 canvas draws only the rolls:
   each a strip of the scroll's own paper wound on a cylinder (the brocade wrapper and its title slip for the first
   turn, Cleveland's photograph laid flat; the end paper after it), in the light measured on Cleveland's photograph
   of this scroll rolled up, and, while it is closed, the ribbon cut from that photograph.

   import { handscroll } from './handscroll.js';
   const hs = handscroll(el);                  // also auto-starts on [data-handscroll]
   hs.next(); hs.prev(); hs.go(5); hs.index;   // carousel; in a scene these scroll the page to that section
   el.addEventListener('handscroll:change', (e) => e.detail);   // {index, count, label}
   hs.destroy();
*/

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);
const BAND = 1600;                                   // the sections' band height in the 1600 set
const TAU = Math.PI * 2;

export function handscroll(root, opts = {}) {
  if (root.__hs) return root.__hs;
  const o = { start: +(root.dataset.start || 0), mode: root.dataset.mode || 'carousel', ...opts };
  const scroll = root.querySelector('.hs-scroll');
  const track = root.querySelector('.hs-track');
  const lis = [...track.children];
  const slides = lis.filter((li) => li.classList.contains('hs-slide'));
  const imgs = lis.map((li) => li.querySelector('img'));
  const btnNext = root.querySelector('[data-hs="next"]');
  const btnPrev = root.querySelector('[data-hs="prev"]');
  const caption = root.querySelector('.hs-caption');
  const labels = slides.map((s) => (s.querySelector('.hs-label')?.textContent || '').trim());
  const mq = matchMedia('(prefers-reduced-motion: reduce)');
  const listeners = [];
  const on = (t, e, f, opt) => { t.addEventListener(e, f, opt); listeners.push(() => t.removeEventListener(e, f, opt)); };

  let geo = null, gl = null, canvas = null, win = null, clip = null, ro = null, io = null;
  let items = [], L = null;
  let a = 0, v = 0, target = 0;       // carousel: a = paper position (scan px from the free end) at the right roll's contact
  let idx = 0, raf = 0, last = 0, visible = true, drag = null, destroyed = false, mode = 'row';
  let scene = false;

  const api = {
    get index() { return idx; },
    get count() { return slides.length; },
    go(i, instant) { if (scene) revealSlide(i); else setIndex(i, instant); },
    next() { api.go(scene && L && L.phase !== 'read' ? 0 : idx + 1); },
    prev() { api.go(idx - 1); },
    destroy,
  };
  root.__hs = api;

  /* ── row mode (no WebGL2, or no geometry): the plain row, with the buttons scrolling it ── */
  function rowMode() {
    mode = 'row';
    root.classList.remove('hs-on', 'hs-scene-on');
    root.classList.add('hs-row');
    const step = (d) => {
      const i = clamp(rowIndex() + d, 0, slides.length - 1);
      slides[i].scrollIntoView({ behavior: mq.matches ? 'auto' : 'smooth', block: 'nearest', inline: 'start' });
    };
    if (btnNext) on(btnNext, 'click', () => step(1));
    if (btnPrev) on(btnPrev, 'click', () => step(-1));
    on(track, 'scroll', () => { const i = rowIndex(); if (i !== idx) { idx = i; announce(); } }, { passive: true });
    announce(true);
  }
  function rowIndex() {
    const r = track.getBoundingClientRect();
    let best = 0, bd = 1e9;
    slides.forEach((s, i) => { const d = Math.abs(s.getBoundingClientRect().right - r.right); if (d < bd) { bd = d; best = i; } });
    return best;
  }

  /* ── the scroll's build. u is the paper's position in scan px from its free end (the end of the start, at the
        stave). The right roll holds the paper before its contact, the left roll the paper after its contact. ── */
  const rRight = (aa) => Math.sqrt((geo.roll.stave / 2) ** 2 + geo.roll.turn * Math.max(0, aa) / Math.PI);
  const rLeft = (bb) => Math.sqrt((geo.roll.roller / 2) ** 2 + geo.roll.turn * Math.max(0, L.total - bb) / Math.PI);

  // every item along the track, in reading order: where it starts (u), how long it is
  function buildItems() {
    const s = geo.sizes[String(BAND)].scale;
    let u = 0, si = 0;
    items = lis.map((li) => {
      let w, kind, sec = null;
      if (li.classList.contains('hs-start')) { kind = 'start'; w = geo.start.width; }
      else if (li.classList.contains('hs-sheet')) { kind = 'sheet'; w = parseFloat(getComputedStyle(li).getPropertyValue('--w')) || 1000; }
      else { kind = 'section'; sec = geo.sections[si++]; w = sec.px[String(BAND)][1] - sec.px[String(BAND)][0]; }
      const it = { li, kind, sec, w, u0: u, len: w / s };
      u += it.len;
      return it;
    });
    return { total: u + geo.roll.end_paper, paper: u };
  }
  function itemAt(u) {
    for (const it of items) if (u < it.u0 + it.len) return it;
    return items[items.length - 1];
  }
  // the paper's own edges (band px) at position u, so a roll sits exactly on the paper it touches
  function edgesAt(u) {
    const it = itemAt(clamp(u, 0, L.paper - 1)), e = geo.roll.edges;
    if (it.kind === 'section') {
      const x = it.sec.x[1] - (u - it.u0);
      const bx = clamp(x * geo.sizes[String(BAND)].scale / e.step, 0, e.top.length - 1.001), i = Math.floor(bx), f = bx - i;
      return [e.top[i] + (e.top[i + 1] - e.top[i]) * f, e.bot[i] + (e.bot[i + 1] - e.bot[i]) * f];
    }
    if (it.kind === 'start') return [e.top[e.top.length - 1], e.bot[e.bot.length - 1]];
    return e.backing;
  }

  function measure() {
    const cw = scroll.clientWidth, h = scroll.clientHeight;
    if (!cw || !h) return false;
    const k = h / (geo.band[1] - geo.band[0]);           // css px per scan px
    const tot = buildItems();
    L = { cw, h, k, span: 0, total: tot.total, paper: tot.paper };
    // where the rolls lie: far enough in for the biggest either gets (the whole scroll wound on it)
    const rMax = Math.sqrt((geo.roll.roller / 2) ** 2 + geo.roll.turn * L.total / Math.PI);
    L.xL = 3 + rMax * k;
    L.xR = cw - 3 - rMax * k;
    L.span = (L.xR - L.xL) / k;
    L.first = items.findIndex((it) => it.kind !== 'start');
    // the wrapper is cut to go once round the closed scroll and a little over; with the page's own leaves mounted in,
    // the scroll is thicker than Cleveland's, so it is that much longer (its weave repeats; the slip stays at the start)
    L.wrap = Math.max(geo.roll.wrapper.length, TAU * rLeft(0) + 80);
    L.stops = stops();
    // the page's own leaves: their paper and silk laid on the edges of the section they are joined to
    const pe = geo.roll.edges.backing, se = geo.silk.edges || [5, 1584];
    for (const it of items) {
      if (it.kind !== 'sheet') continue;
      const [t, b] = edgesAt(Math.max(0, it.u0 - 2)), mp = (b - t) / (pe[1] - pe[0]), ms = (b - t) / (se[1] - se[0]);
      const st = it.li.style;
      st.setProperty('--ph', `${(BAND * mp * h / BAND).toFixed(2)}px`); st.setProperty('--pt', `${((t - pe[0] * mp) * h / BAND).toFixed(2)}px`);
      st.setProperty('--sh', `${(BAND * ms * h / BAND).toFixed(2)}px`); st.setProperty('--st', `${((t - se[0] * ms) * h / BAND).toFixed(2)}px`);
    }
    return true;
  }
  function stopFor(u) { let aa = u - 150; for (let n = 0; n < 6; n++) aa = u - rRight(aa); return aa; }
  function lastStop() {                                   // the end of the paper at the left roll's edge
    let aa = L.paper - L.span; for (let n = 0; n < 6; n++) aa = L.paper - L.span + rLeft(aa + L.span); return aa;
  }
  const slideItems = () => items.filter((it) => it.kind !== 'start');
  function stops() {
    const lo = stopFor(items[L.first].u0), hi = Math.max(lo, lastStop());
    return slideItems().map((it) => clamp(stopFor(it.u0), lo, hi));
  }
  function lastReachable() { const hi = L.stops[L.stops.length - 1]; return L.stops.findIndex((s) => s >= hi - 0.5); }
  function indexAt(aa) { let i = 0; for (let j = 0; j < L.stops.length; j++) if (L.stops[j] <= aa + 0.5) i = j; return i; }

  /* ── the scene: page scroll -> what the scroll is doing ── */
  function sceneLayout() {
    const vh = innerHeight, s = {};
    s.hold = 0.12 * vh;                                   // closed, while it pins
    s.roll = 0.5 * vh;                                    // the closed scroll rolls until its free edge is under it
    s.lay = L.span * L.k * 0.9;                           // laying out the start
    s.unroll = Math.max(0, lastStop()) * L.k / 1.25;      // the rest, a little faster than the page
    s.total = s.hold + s.roll + s.lay + s.unroll;
    root.style.height = `${Math.round(s.total + vh)}px`;
    L.scene = s;
    // the closed scroll: its radius, and its turn so that the title slip faces up
    L.R0 = rLeft(0);
    const slipMid = (geo.roll.wrapper.slip[0] + geo.roll.wrapper.slip[1]) / 2;
    L.phiE0 = Math.PI / 2 + slipMid / L.R0;
    L.dPhi = 1.5 * Math.PI - L.phiE0;                    // the turn that brings the free edge under it
    L.xc = L.cw / 2;
    L.xm = L.xc - L.R0 * L.dPhi * L.k;                    // where it lies when the free edge touches down
  }
  function sceneProgress() { return clamp(-root.getBoundingClientRect().top, 0, L.scene.total); }
  function sceneState(d) {
    const s = L.scene, st = {};
    if (d < s.hold + s.roll) {                            // closed, then rolling left as one piece
      const q = ease(clamp((d - s.hold) / s.roll, 0, 1));
      st.phase = 'closed';
      st.phiE = L.phiE0 + L.dPhi * q;
      st.xRoll = L.xc - L.R0 * L.dPhi * q * L.k;
      st.cam = 0;
    } else if (d < s.hold + s.roll + s.lay) {            // laying out the start: the roll goes left, the free edge right
      const q = ease(clamp((d - s.hold - s.roll) / s.lay, 0, 1));
      st.phase = 'lay';
      st.xRoll = lerp(L.xm, L.xL, q);
      st.xE = lerp(L.xm, L.xR, q);
      st.laid = (st.xE - st.xRoll) / L.k;
      st.cam = st.xE - L.xm;                              // how far the table has moved right on the page
    } else {                                              // reading: the right roll takes up what has been seen
      const q = clamp((d - s.hold - s.roll - s.lay) / Math.max(1, s.unroll), 0, 1);
      st.phase = 'read';
      st.a = lerp(0, lastStop(), q);
    }
    return st;
  }

  /* ── drawing ── */
  function placeTrack(xOfFreeEnd, clipL, clipR) {
    const tw = L.paper * L.k;
    track.style.transform = `translate3d(${(xOfFreeEnd - tw).toFixed(3)}px,0,0)`;
    const l = clamp(clipL, 0, L.cw), r = clamp(clipR, l, L.cw);
    clip.style.clipPath = `inset(0 ${(L.cw - r).toFixed(2)}px 0 ${l.toFixed(2)}px)`;
  }
  // the vertical placement of a roll strip whose texture edges are [e0, e1] (band px), on the paper's edges at u
  function placeV(u, e0, e1) {
    const [t, b] = edgesAt(u); const m = (b - t) / (e1 - e0), s = L.h / BAND;
    return [(t - e0 * m) * s, (t + (BAND - e0) * m) * s];
  }
  // one roll: its visible half as runs of one texture each (the wrapper for the first turn, then the end paper)
  function rollAt(x, R, uContact, uAt, jumpAt) {
    const runs = [];
    const add = (p0, p1) => { if (p1 - p0 > 1e-4) runs.push([p0, p1]); };
    if (jumpAt !== undefined && jumpAt > 0 && jumpAt < Math.PI) { add(0, jumpAt - 1e-4); add(jumpAt + 1e-4, Math.PI); } else add(0, Math.PI);
    const W = L.wrap;                                     // the wrapper goes once round the closed scroll
    for (const [p0, p1] of runs) {
      const u0 = uAt(p0), u1 = uAt(p1), cuts = [p0];    // u falls as phi rises within a run
      for (const c of [W, 0]) if ((u0 - c) * (u1 - c) < 0) cuts.push(p0 + (u0 - c) / (u0 - u1) * (p1 - p0));
      cuts.push(p1); cuts.sort((m, n) => m - n);
      for (let i = 0; i + 1 < cuts.length; i++) {
        const q0 = cuts[i], q1 = cuts[i + 1], um = uAt((q0 + q1) / 2);
        if (um < 0) continue;                             // before the free edge there is no paper (the stave)
        const wrap = um < W;
        const ys = wrap ? placeV(uContact, ...geo.roll.wrapper.edges) : placeV(uContact, ...geo.roll.edges.backing);
        gl.roll(wrap ? 'wrapper' : 'backing', x, R * L.k, ys, uAt, q0, q1, wrap ? 0 : 0);
      }
    }
  }
  function renderCarousel() {
    const { k, xL, xR, h } = L;
    placeTrack(xR + a * k, xL, xR);
    if (!gl) return;
    const RR = rRight(a), b = a + L.span, RL = rLeft(b);
    gl.begin(L.cw, h);
    rollAt(xR, RR, a, (phi) => a - RR * (phi + Math.PI / 2));
    rollAt(xL, RL, b, (phi) => b + RL * (1.5 * Math.PI - phi));
  }
  // the ribbon of the closed scroll lies on the table to its left, where it leaves the stave; it shows only where
  // nothing has been rolled or laid over it
  function ribbonLeft(rollLeftEdge, cam) {
    const rib = geo.roll.ribbon, s = L.h / BAND, [rt, rb] = edgesAt(0);
    const rootX = L.xc - L.R0 * L.k + 1.5 + cam, rootY = (rt + rib.root_v * (rb - rt)) * s;
    gl.quad('ribbonL', rootX - rib.width * s, rootY - rib.left_root_y * s, rib.width * s, rib.height * s, [0, rollLeftEdge]);
  }
  function renderScene(d) {
    const st = sceneState(d), { k, h } = L;
    if (st.phase === 'closed') {
      placeTrack(0, 0, 0);
      if (gl) {
        gl.begin(L.cw, h);
        ribbonLeft(st.xRoll - L.R0 * k, 0);
        rollAt(st.xRoll, L.R0, 0, (phi) => L.R0 * ((((st.phiE - phi) % TAU) + TAU) % TAU), st.phiE);
      }
    } else if (st.phase === 'lay') {
      placeTrack(st.xE, st.xRoll, st.xE);
      if (gl) {
        gl.begin(L.cw, h);
        const b = st.laid, RL = rLeft(b);
        ribbonLeft(st.xRoll - RL * k, st.cam);
        rollAt(st.xRoll, RL, b, (phi) => b + RL * (1.5 * Math.PI - phi));
      }
    } else {
      a = st.a;
      renderCarousel();
    }
    const at = st.phase === 'read' ? indexAt(st.a + 1) : 0;
    if (st.phase !== L.phase) { L.phase = st.phase; announce(); }
    if (at !== idx) { idx = at; preload(at); announce(); settle(); }
  }

  function render() { if (!L) return; if (scene) renderScene(sceneProgress()); else renderCarousel(); }

  function frame(t) {
    raf = 0;
    if (scene) { render(); return; }
    const dt = Math.min(0.05, last ? (t - last) / 1000 : 1 / 60); last = t;
    if (!drag) {
      const w = 6.5, x = a - target;                     // a critically damped spring: calm, no overshoot
      v += (-w * w * x - 2 * w * v) * dt; a += v * dt;
      if (Math.abs(a - target) < 0.3 && Math.abs(v) < 2) { a = target; v = 0; }
    }
    render();
    if (drag || a !== target) schedule(); else { last = 0; settle(); }
  }
  function schedule() { if (!raf && visible && !destroyed) raf = requestAnimationFrame(frame); }

  function setIndex(i, instant) {
    if (mode !== 'scroll' || !L) return;
    i = clamp(i, 0, lastReachable());
    const from = indexAt(a);
    idx = i; target = L.stops[i];
    for (let j = Math.min(from, i); j <= Math.max(from, i); j++) preload(j);
    if (instant || mq.matches) { a = target; v = 0; render(); settle(); } else schedule();
    announce();
  }
  // in a scene, going to a section scrolls the page to where the scroll lies open at it
  function revealSlide(i) {
    if (!L || !L.scene) return;
    i = clamp(i, 0, lastReachable());
    const s = L.scene, q = clamp(L.stops[i] / Math.max(1, lastStop()), 0, 1);
    const d = s.hold + s.roll + s.lay + q * s.unroll + 2;
    preload(i);
    scrollTo({ top: root.getBoundingClientRect().top + scrollY + d, behavior: mq.matches ? 'auto' : 'smooth' });
  }
  let settled = -1;
  function settle() {
    if (settled === idx) return;
    settled = idx;
    root.dispatchEvent(new CustomEvent('handscroll:change', { detail: { index: idx, count: slides.length, label: labels[idx] } }));
  }
  function announce(quiet) {
    const n = slides.length;
    if (btnPrev) btnPrev.disabled = idx <= 0;
    if (btnNext) btnNext.disabled = mode === 'scroll' && L ? idx >= lastReachable() : idx >= n - 1;
    if (!caption) return;
    const c = caption.querySelector('.hs-count'), t = caption.querySelector('.hs-title');
    const shut = scene && L && L.phase && L.phase !== 'read';        // still rolled up, or opening
    if (c) c.textContent = shut ? (L.phase === 'closed' ? 'Rolled up' : 'Opening') : `${idx + 1} of ${n}`;
    if (t) t.textContent = shut ? (root.dataset.title || labels[idx]) : labels[idx];
    if (quiet && !scene) caption.setAttribute('aria-live', 'polite');
  }
  function preload(i) {
    const si = slideItems();
    for (let j = Math.max(0, i - 1); j <= Math.min(si.length - 1, i + 3); j++) { const im = si[j].li.querySelector('img'); if (im) im.loading = 'eager'; }
  }

  /* ── hands (carousel): drag the paper; tap a roll to turn it; keys ── */
  function down(e) {
    if (e.button !== 0 || mode !== 'scroll' || scene) return;
    drag = { x: e.clientX, y: e.clientY, a0: a, vx: 0, moved: false, id: e.pointerId, lx: e.clientX, lt: performance.now() };
  }
  function move(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved) {
      if (Math.abs(dx) < 6) return;
      if (Math.abs(dy) > Math.abs(dx)) { drag = null; return; }
      drag.moved = true; root.classList.add('hs-dragging');
      try { scroll.setPointerCapture(e.pointerId); } catch {}
    }
    e.preventDefault();
    const now = performance.now(), lo = L.stops[0], hi = L.stops[L.stops.length - 1];
    let na = drag.a0 + dx / L.k;                     // pulling the paper to the right brings more out of the left roll
    if (na < lo) na = lo - rubber(lo - na); else if (na > hi) na = hi + rubber(na - hi);
    const inst = (e.clientX - drag.lx) / Math.max(1, now - drag.lt) * 1000 / L.k;
    drag.vx = drag.vx * 0.6 + inst * 0.4; drag.lx = e.clientX; drag.lt = now;
    a = na; v = 0;
    preload(indexAt(a));
    schedule();
  }
  function rubber(d) { const m = 900; return m * (1 - 1 / (d / m + 1)); }
  function up(e) {
    if (!drag || (e.pointerId !== undefined && e.pointerId !== drag.id)) return;
    const dd = drag; drag = null; root.classList.remove('hs-dragging');
    if (!dd.moved) { tap(e); return; }
    const proj = a + (mq.matches ? 0 : dd.vx * 0.22);
    let best = 0, bd = Infinity;
    L.stops.forEach((s, i) => { const x = Math.abs(s - proj); if (x < bd - 0.5) { bd = x; best = i; } });
    best = Math.min(best, lastReachable());
    if (best === idx && Math.abs(proj - a) > 30) best = clamp(idx + Math.sign(proj - L.stops[idx]), 0, lastReachable());
    v = mq.matches ? 0 : dd.vx;
    setIndex(best);
  }
  function tap(e) {
    const r = scroll.getBoundingClientRect(), x = e.clientX - r.left;
    if (x < L.xL + rLeft(a + L.span) * L.k + 6) api.next();
    else if (x > L.xR - rRight(a) * L.k - 6) api.prev();
  }
  function key(e) {
    if (mode !== 'scroll' || scene) return;
    const k = e.key;
    if (k === 'ArrowLeft') api.next();
    else if (k === 'ArrowRight') api.prev();
    else if (k === 'Home') setIndex(0);
    else if (k === 'End') setIndex(slides.length - 1);
    else return;
    e.preventDefault();
  }

  /* ── start ── */
  async function start() {
    const firstImg = imgs.find(Boolean);
    const src = o.src || root.dataset.src || new URL('../scroll.json', firstImg.currentSrc || firstImg.src).href;
    try { geo = await (await fetch(src)).json(); } catch { geo = null; }
    if (destroyed) return;
    const nSections = lis.filter((li) => li.classList.contains('hs-slide') && !li.classList.contains('hs-sheet')).length;
    if (!geo || !geo.roll || geo.sections.length !== nSections) { rowMode(); return; }
    // the rolls need WebGL2; without it the scroll stays the plain row (with working buttons)
    const probe = document.createElement('canvas').getContext('webgl2');
    if (!probe) { rowMode(); return; }
    probe.getExtension('WEBGL_lose_context')?.loseContext();
    geo.band = geo.source.band;
    if (!geo.start) geo.start = { width: 0, length: 0 };

    win = document.createElement('div'); win.className = 'hs-window';
    clip = document.createElement('div'); clip.className = 'hs-clip';
    track.replaceWith(win); clip.appendChild(track); win.appendChild(clip);
    canvas = document.createElement('canvas'); canvas.className = 'hs-canvas'; canvas.setAttribute('aria-hidden', 'true');
    scroll.appendChild(canvas);
    scene = o.mode === 'scene' && !mq.matches;
    root.classList.add('hs-on'); if (scene) root.classList.add('hs-scene-on');
    if (caption) { if (scene) { caption.setAttribute('aria-hidden', 'true'); caption.removeAttribute('aria-live'); } else { caption.removeAttribute('aria-hidden'); caption.setAttribute('aria-live', 'polite'); caption.setAttribute('aria-atomic', 'true'); } }
    mode = 'scroll';
    if (!scroll.hasAttribute('tabindex') && !scene) scroll.tabIndex = 0;

    gl = makeGL(canvas, geo.roll.light);
    const base = new URL('.', src);
    const need = [['backing', geo.roll.backing.file, true], ['wrapper', geo.roll.wrapper.file, true]];
    if (scene) need.push(['ribbonL', geo.roll.ribbon.left_file, false]);
    const loaded = await Promise.all(need.map(([, f]) => loadImage(new URL(f, base).href)));
    if (destroyed) return;
    if (gl && loaded.every(Boolean)) {
      need.forEach(([name, , rep], i) => gl.texture(name, loaded[i], rep));
      gl.scale = geo.sizes[String(BAND)].scale;
      gl.widths = { backing: geo.roll.backing.width, wrapper: geo.roll.wrapper.width };
    } else { gl?.destroy(); gl = null; canvas.remove(); canvas = null; }

    if (!scene) {
      on(scroll, 'pointerdown', down);
      on(window, 'pointermove', move, { passive: false });
      on(window, 'pointerup', up);
      on(window, 'pointercancel', up);
      on(scroll, 'keydown', key);
    } else {
      on(window, 'scroll', () => schedule(), { passive: true });
      // a focus or a link inside the scroll: bring the page to where that section lies open
      on(track, 'focusin', (e) => { const i = slides.findIndex((sl) => sl.contains(e.target)); if (i >= 0) revealSlide(i); });
      on(document, 'click', (e) => {
        const aEl = e.target.closest?.('a[href^="#"]'); if (!aEl) return;
        const t = document.getElementById(decodeURIComponent(aEl.getAttribute('href').slice(1)));
        const i = t ? slides.findIndex((sl) => sl === t || sl.contains(t)) : -1;
        if (i >= 0) { e.preventDefault(); revealSlide(i); }
      });
    }
    on(scroll, 'dragstart', (e) => e.preventDefault());
    if (btnNext) on(btnNext, 'click', () => api.next());
    if (btnPrev) on(btnPrev, 'click', () => api.prev());
    on(mq, 'change', () => { if (!scene && mq.matches) { a = target; v = 0; render(); } });

    const relayout = () => {
      if (!measure()) return;
      if (scene) sceneLayout();
      else { target = L.stops[Math.min(idx, lastReachable())]; a = target; v = 0; }
      sizeCanvas(); render(); announce();
    };
    ro = new ResizeObserver(relayout); ro.observe(scroll);
    on(window, 'resize', relayout);
    io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) schedule(); });
    io.observe(root);
    await document.fonts?.ready;
    if (!measure()) return;
    if (scene) sceneLayout();
    idx = Math.min(clamp(o.start | 0, 0, slides.length - 1), lastReachable());
    a = target = L.stops[idx];
    sizeCanvas();
    preload(idx);
    render(); announce(true); settle();
  }
  function sizeCanvas() {
    if (!canvas || !L) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.round(L.cw * dpr); canvas.height = Math.round(L.h * dpr);
  }

  function destroy() {
    destroyed = true;
    cancelAnimationFrame(raf);
    listeners.forEach((f) => f()); listeners.length = 0;
    ro?.disconnect(); io?.disconnect();
    if (gl) gl.destroy();
    canvas?.remove();
    if (win) win.replaceWith(track);
    track.style.transform = '';
    root.style.height = '';
    root.classList.remove('hs-on', 'hs-row', 'hs-dragging', 'hs-scene-on');
    delete root.__hs;
  }

  start();
  return api;
}

function loadImage(url) {
  return new Promise((res) => { const i = new Image(); i.decoding = 'async'; i.onload = () => res(i); i.onerror = () => res(null); i.src = url; });
}

/* ── WebGL2: textured strips. A roll is a strip of the paper across the visible half of a cylinder, each column
      placed at the cylinder's projected x, with the paper position that lies there and the light measured across a
      real roll; the ribbon is one rigid quad. Premultiplied, mipmapped, one context. ── */
function makeGL(canvas, light) {
  const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: true });
  if (!gl) return null;
  const sh = (type, src) => { const x = gl.createShader(type); gl.shaderSource(x, src); gl.compileShader(x); return x; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, `#version 300 es
    in vec2 pos; in vec2 uv; in float lit; uniform vec2 res; out vec2 vuv; out float vlit;
    void main(){ vec2 p = pos / res * 2.0 - 1.0; gl_Position = vec4(p.x, -p.y, 0.0, 1.0); vuv = uv; vlit = lit; }`));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, `#version 300 es
    precision highp float; uniform sampler2D t; in vec2 vuv; in float vlit; out vec4 o;
    void main(){ vec4 c = texture(t, vuv, -0.35); o = vec4(c.rgb * vlit, c.a); }`));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  const U = { res: gl.getUniformLocation(prog, 'res'), t: gl.getUniformLocation(prog, 't') };
  const vao = gl.createVertexArray(), buf = gl.createBuffer();
  gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  const att = (n, size, off) => { const l = gl.getAttribLocation(prog, n); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, 20, off); };
  att('pos', 2, 0); att('uv', 2, 8); att('lit', 1, 16);
  const tex = {};
  const N = 72;
  const data = new Float32Array((N + 1) * 2 * 5);
  // the light across a roll, -1 (its left edge) to 1 (its right), as measured on the photograph of this scroll rolled up
  const litAt = (t) => { const x = (clamp(t, -1, 1) + 1) / 2 * (light.length - 1), i = Math.min(light.length - 2, Math.floor(x)); return light[i] + (light[i + 1] - light[i]) * (x - i); };
  let res = [1, 1];
  const R = {
    scale: 1, widths: {},
    texture(name, img, repeat) {
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, repeat ? gl.MIRRORED_REPEAT : gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      tex[name] = t;
    },
    begin(w, h) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.disable(gl.SCISSOR_TEST);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(prog); gl.bindVertexArray(vao);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      res = [w, h];
      gl.uniform2f(U.res, w, h); gl.activeTexture(gl.TEXTURE0); gl.uniform1i(U.t, 0);
    },
    // a rigid quad (css px); xclip [x0, x1] limits it to the part of the page nothing lies on
    quad(name, x, y, w, h, xclip) {
      if (!tex[name]) return;
      gl.bindTexture(gl.TEXTURE_2D, tex[name]);
      if (xclip) {
        const sx = canvas.width / res[0], x0 = Math.max(0, xclip[0] * sx), x1 = Math.max(x0, xclip[1] * sx);
        if (x1 - x0 < 1) return;
        gl.enable(gl.SCISSOR_TEST); gl.scissor(Math.floor(x0), 0, Math.ceil(x1 - x0), canvas.height);
      }
      const d = new Float32Array([x, y, 0, 0, 1, x + w, y, 1, 0, 1, x, y + h, 0, 1, 1, x + w, y + h, 1, 1, 1]);
      gl.bufferData(gl.ARRAY_BUFFER, d, gl.STREAM_DRAW); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.disable(gl.SCISSOR_TEST);
    },
    // part of a roll at axis x, radius r (css px), from y0 to y1, for angles p0..p1 (0 = its +x side, pi = its -x side);
    // uAt(phi) is the paper position (scan px) lying there; the texture repeats along the paper (backing) or not (wrapper)
    roll(name, x, r, [y0, y1], uAt, p0, p1) {
      if (!tex[name]) return;
      gl.bindTexture(gl.TEXTURE_2D, tex[name]);
      const k = R.scale / (R.widths[name] || 1);
      for (let j = 0; j <= N; j++) {
        const phi = p0 + (p1 - p0) * j / N, c = Math.cos(phi), px = x + r * c;
        const s = uAt(phi) * k, l = litAt(c);
        data.set([px, y0, s, 0, l, px, y1, s, 1, l], j * 10);
      }
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STREAM_DRAW); gl.drawArrays(gl.TRIANGLE_STRIP, 0, (N + 1) * 2);
    },
    destroy() {
      Object.values(tex).forEach((t) => gl.deleteTexture(t)); gl.deleteBuffer(buf); gl.deleteVertexArray(vao); gl.deleteProgram(prog);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
  return R;
}

/* auto-start */
function boot() { document.querySelectorAll('[data-handscroll]').forEach((el) => handscroll(el)); }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
