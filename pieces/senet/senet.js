// senet: pagination on a New Kingdom senet board.
//
// The control is a real <nav><ol> of page links. Above it lies a photograph of a faience senet board (the Met,
// 01.4.1a, Abydos, ca. 1479-1425 BCE) and one of its own pieces, photographed from above in the same campaign. The
// piece stands on the square that is the current page. When the page changes it is moved there the way a player
// moves: a throw of one to five is counted out square by square along the board's S, each hop under gravity with a
// knock as it lands; a longer move is lifted, carried, and set down. Nothing is drawn: the board is the <img>, the
// piece is an <img>, and its shadow is the piece's own silhouette.
//
//   <nav class="sn" data-senet data-pages="43" data-page="1" data-href="?page={n}" aria-label="Pages">…</nav>
//   import { senet } from './senet.js';  const s = senet(nav, { pages: 43 });
//   s.go(12); s.page; s.pages; s.setPages(50); s.hold(); s.advance(ms); s();   // s() destroys
//
// Events on the <nav>: senet:change {page, from, pages, square}, senet:knock {square, force}, senet:settle {page}.

// The 30 squares in play order (1-10 top row left to right, 11-20 middle row right to left, 21-30 bottom row left to
// right), as fractions of the board image. Measured by tools/cut.py on the Met photograph (assets/board.json).
const SQUARES = [[0.0605,0.1895],[0.1575,0.1890],[0.2544,0.1895],[0.3525,0.1895],[0.4487,0.1871],[0.5481,0.1885],
  [0.6442,0.1880],[0.7416,0.1866],[0.8391,0.1861],[0.9364,0.1856],[0.9367,0.4926],[0.8393,0.4941],[0.7419,0.4946],
  [0.6444,0.4951],[0.5472,0.4971],[0.4501,0.4985],[0.3527,0.4971],[0.2549,0.4975],[0.1582,0.5000],[0.0601,0.5005],
  [0.0602,0.8075],[0.1585,0.8046],[0.2553,0.8051],[0.3535,0.8066],[0.4504,0.8041],[0.5468,0.8036],[0.6450,0.8056],
  [0.7418,0.8041],[0.8395,0.8046],[0.9362,0.8046]];
const SQ_W = 0.0774, SQ_H = 0.2439;          // a faience tile, as fractions of the board image
const ASPECT = 2400 / 755;                    // the board image
const TAIL = 5;                               // the last five pages always take the marked squares 26-30

// physics (board units: x in board widths, h in piece diameters)
const HZ = 240, DT = 1 / HZ;
const G = 90;                                 // gravity, in piece diameters per s² (the hop is a hand's, not a fall)
const HOP_T = 0.2;                            // one counted square: time in the air, s (it rises about half its width)
const TAP_T = 0.26;                           // lifted and set down on the same square: it rises about 3/4 of its width
const CARRY_LIFT = 1.15;                      // a carried piece is held this high (piece diameters)

export function squareOf(page, pages) {
  if (pages <= 30) return Math.max(1, Math.min(30, page));
  if (page > pages - TAIL) return 30 - (pages - page);
  return 1 + Math.floor((page - 1) * (30 - TAIL) / (pages - TAIL));
}
export function pagesOn(square, pages) {
  const out = [];
  if (pages <= 30) { if (square <= pages) out.push(square); return out; }
  for (let p = 1; p <= pages; p++) { const s = squareOf(p, pages); if (s === square) out.push(p); else if (s > square) break; }
  return out;
}

// the windowed list: first, …, pages around the current one, …, last
export function windowed(page, pages, around = 2) {
  if (pages <= around * 2 + 5) return Array.from({ length: pages }, (_, i) => i + 1);
  const lo = Math.max(2, page - around), hi = Math.min(pages - 1, page + around);
  const out = [1];
  if (lo > 2) out.push(lo === 3 ? 2 : '…');
  for (let p = lo; p <= hi; p++) out.push(p);
  if (hi < pages - 1) out.push(hi === pages - 2 ? pages - 1 : '…');
  out.push(pages);
  return out;
}

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function senet(root, opts = {}) {
  if (root.senet) return root.senet;            // already running (auto-started): the same controller
  const d = root.dataset;
  const o = {
    pages: +(opts.pages ?? d.pages ?? 1),
    page: +(opts.page ?? 0),
    href: opts.href ?? d.href ?? '?page={n}',
    param: opts.param ?? d.param ?? 'page',
    history: opts.history ?? d.history ?? 'push',      // push | replace | none | load
    around: opts.around ?? (d.around != null ? +d.around : null),   // null: 2, or 1 when narrow
    compact: opts.compact ?? root.classList.contains('sn-compact'),
    label: opts.label ?? d.label ?? 'Page',
  };
  const board = root.querySelector('.sn-board');
  const list = root.querySelector('.sn-pages');
  if (!board || !list) return Object.assign(() => {}, { go() {}, hold() {}, advance() {} });

  // current page: the option, the URL, the link marked current, or 1
  const fromUrl = () => { const v = +new URL(location.href).searchParams.get(o.param); return v > 0 ? v : 0; };
  let page = o.page || fromUrl() || +d.page || +(list.querySelector('[aria-current="page"]')?.textContent) || 1;
  let pages = Math.max(1, o.pages);
  page = Math.min(Math.max(1, page), pages);

  // ---- the piece and its shadow (the same photograph, as a silhouette) ----
  let piece = board.querySelector('.sn-piece');
  if (!piece) {
    piece = document.createElement('img');
    piece.className = 'sn-piece'; piece.alt = ''; piece.src = new URL('assets/cone.webp', import.meta.url).href;
    board.append(piece);
  }
  const shadow = piece.cloneNode();
  shadow.className = piece.className.replace('sn-piece', 'sn-shadow');
  shadow.removeAttribute('style');
  board.insertBefore(shadow, piece);
  const tip = document.createElement('span');
  tip.className = 'sn-tip'; tip.setAttribute('aria-hidden', 'true');
  board.append(tip);
  const live = document.createElement('p');
  live.className = 'sn-live'; live.setAttribute('aria-live', 'polite');
  root.append(live);
  root.classList.add('sn-js');

  // ---- the list ----
  const hrefFor = (p) => o.href.replace('{n}', p);
  const around = () => o.around ?? (root.clientWidth < 520 ? 1 : 2);
  function render() {
    lastAround = around();
    const li = [];
    const step = (cls, p, text, rel, sr) => {
      const off = p < 1 || p > pages;
      const inner = off
        ? `<span class="sn-off" aria-disabled="true">${text}</span>`
        : `<a href="${hrefFor(p)}" rel="${rel}" data-page="${p}"${sr ? ` aria-label="${sr}"` : ''}>${text}</a>`;
      li.push(`<li class="sn-step ${cls}">${inner}</li>`);
    };
    step('sn-prev', page - 1, '<span aria-hidden="true">‹ </span><span class="sn-word">Previous</span>', 'prev', 'Previous page');
    if (o.compact) {
      li.push(`<li class="sn-count"><a href="${hrefFor(page)}" data-page="${page}" aria-current="page" aria-label="${o.label} ${page} of ${pages}">${page}</a><span aria-hidden="true"> / ${pages}</span></li>`);
    } else {
      for (const p of windowed(page, pages, around())) {
        if (p === '…') { li.push('<li class="sn-gap" aria-hidden="true">…</li>'); continue; }
        li.push(`<li><a href="${hrefFor(p)}" data-page="${p}"${p === page ? ' aria-current="page"' : ''}>${p}</a></li>`);
      }
    }
    step('sn-next', page + 1, '<span class="sn-word">Next</span><span aria-hidden="true"> ›</span>', 'next', 'Next page');
    list.innerHTML = li.join('');
  }

  // ---- the simulation ----
  const sq = (n) => SQUARES[n - 1];
  let sqNow = squareOf(page, pages);
  const s = { x: sq(sqNow)[0], y: sq(sqNow)[1], vx: 0, vy: 0, h: 0, vh: 0 };
  let plan = [];          // queue of moves: {kind:'hop'|'carry'|'tap', to}
  let move = null;        // the move in progress
  let raf = 0, last = 0, acc = 0, held = false;

  function place() {
    const W = board.clientWidth, H = W / ASPECT;
    const dpx = pieceW() * W;                       // piece diameter in px
    const lift = Math.max(0, s.h);
    const k = 1 + 0.12 * Math.min(lift, 1.4);       // nearer the camera (straight above) as it rises
    const x = s.x * W, y = s.y * H;
    piece.style.transform = `translate(${x - dpx / 2}px, ${y - dpx / 2}px) scale(${k})`;
    // the shadow stays on the board, falls further and softer as the piece rises (light from above, a little behind)
    // (at least 1.2 px of offset and blur, so a small piece still stands off the pale tiles)
    const sx = s.x * W + Math.max(1.2, dpx * (0.05 + 0.2 * lift)), sy = s.y * H + Math.max(1.6, dpx * (0.09 + 0.36 * lift));
    shadow.style.transform = `translate(${sx - dpx / 2}px, ${sy - dpx / 2}px) scale(${1 + 0.05 * lift})`;
    shadow.style.setProperty('--sn-blur', `${Math.max(1.2, (0.035 + 0.09 * lift) * dpx)}px`);
    shadow.style.opacity = String((dpx < 34 ? 0.6 : 0.45) - 0.12 * Math.min(lift, 1.2));
  }
  let pw = 0.04005;
  const pieceW = () => pw;
  // the piece's rendered width as a fraction of the board's: its measured size, or the CSS minimum on a small board
  const measure = () => {
    const W = board.clientWidth;
    pw = (W && piece.offsetWidth) ? piece.offsetWidth / W : +(getComputedStyle(piece).getPropertyValue('--sn-piece').trim() || 0.04005);
  };

  function path(a, b) {           // squares strictly after a, up to b, along the S
    const out = [], dir = Math.sign(b - a);
    for (let n = a + dir; dir && n !== b + dir; n += dir) out.push(n);
    return out;
  }

  function planTo(target) {
    const from = move ? move.to : sqNow;
    plan = [];
    const steps = path(from, target);
    if (!steps.length) plan.push({ kind: 'tap', to: target });
    else if (steps.length <= 5) for (const n of steps) plan.push({ kind: 'hop', to: n });
    else plan.push({ kind: 'carry', to: target });
  }

  function begin(m) {
    move = m;
    m.t = 0;
    const [tx, ty] = sq(m.to);
    if (m.kind === 'hop' || m.kind === 'tap') {
      // a page that shares the square still gets an answer: picked up a little higher and set back down in place
      const T = m.kind === 'tap' ? TAP_T : HOP_T;
      s.vh = G * T / 2;                              // leaves the square: up under gravity, back down in T
      if (s.h < 0) s.h = 0;
      m.x0 = s.x; m.y0 = s.y; m.tx = tx; m.ty = ty; m.T = T;
    } else {
      m.tx = tx; m.ty = ty; m.phase = 'lift';
    }
  }

  function knock(force) {
    root.dispatchEvent(new CustomEvent('senet:knock', { detail: { square: move ? move.to : sqNow, force } }));
  }

  function step(dt) {
    if (!move) {
      if (plan.length) begin(plan.shift());
      else return false;
    }
    const m = move;
    m.t += dt;
    if (m.kind === 'hop' || m.kind === 'tap') {
      // the hand guides it across: a critically damped spring that has all but arrived as the piece comes down
      const w = 7 / m.T;
      const ax = w * w * (m.tx - s.x) - 2 * w * s.vx, ay = w * w * (m.ty - s.y) - 2 * w * s.vy;
      s.vx += ax * dt; s.vy += ay * dt; s.x += s.vx * dt; s.y += s.vy * dt;
      s.vh -= G * dt; s.h += s.vh * dt;
      if (s.h <= 0 && s.vh < 0) {
        const f = Math.min(1, -s.vh / (G * HOP_T / 2));
        s.h = 0; s.vh = 0; s.x = m.tx; s.y = m.ty; s.vx = s.vy = 0;
        sqNow = m.to; knock(f);
        move = null;
        if (plan.length) dwell = 0.05;
      }
    } else {
      // carried: lifted first, then taken across in the air (a spring on the hand), then let down onto the square
      const w = 2 * Math.PI * 1.15, z = 1;
      if (m.phase === 'lift') {
        s.vh += (w * 2.2) ** 2 * (CARRY_LIFT - s.h) * dt - 2 * z * (w * 2.2) * s.vh * dt; s.h += s.vh * dt;
        if (s.h > CARRY_LIFT * 0.55) m.phase = 'carry';
      } else if (m.phase === 'carry') {
        const ax = w * w * (m.tx - s.x) - 2 * z * w * s.vx, ay = w * w * (m.ty - s.y) - 2 * z * w * s.vy;
        s.vx += ax * dt; s.vy += ay * dt; s.x += s.vx * dt; s.y += s.vy * dt;
        s.vh += (w * 2.2) ** 2 * (CARRY_LIFT - s.h) * dt - 2 * (w * 2.2) * s.vh * dt; s.h += s.vh * dt;
        const dist = Math.hypot((m.tx - s.x) * ASPECT, m.ty - s.y);
        if (dist < 0.03 && Math.hypot(s.vx * ASPECT, s.vy) < 0.25) m.phase = 'drop';
      } else {
        // set down: the hand lowers it (a critically damped spring aimed a little below the board), the board stops it
        const ax = 400 * (m.tx - s.x) - 40 * s.vx, ay = 400 * (m.ty - s.y) - 40 * s.vy;
        s.vx += ax * dt; s.vy += ay * dt; s.x += s.vx * dt; s.y += s.vy * dt;
        const wd = 17;
        s.vh += (wd * wd * (-0.25 - s.h) - 2 * wd * s.vh) * dt; s.h += s.vh * dt;
        if (s.h <= 0) {
          const f = Math.min(1, -s.vh / 9);
          s.h = 0; s.vh = 0; s.x = m.tx; s.y = m.ty; s.vx = s.vy = 0;
          sqNow = m.to; knock(f); move = null;
        }
      }
    }
    return true;
  }

  let dwell = 0;
  function tick(now) {
    raf = 0;
    if (held) return;
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    acc += dt;
    let alive = true;
    while (acc >= DT) {
      acc -= DT;
      if (dwell > 0) { dwell -= DT; continue; }
      alive = step(DT);
      if (!alive) break;
    }
    place();
    if (alive || dwell > 0) raf = requestAnimationFrame(tick);
    else settle();
  }
  function settle() {
    acc = 0; last = 0;
    root.classList.remove('sn-moving');
    root.dispatchEvent(new CustomEvent('senet:settle', { detail: { page } }));
  }
  function run() {
    if (held) return;
    root.classList.add('sn-moving');
    if (!raf) { last = 0; raf = requestAnimationFrame(tick); }
  }
  function jump(n) {
    plan = []; move = null; dwell = 0;
    sqNow = n; [s.x, s.y] = sq(n); s.vx = s.vy = s.h = s.vh = 0;
    place();
  }

  // ---- navigation ----
  const KEY = 'senet:' + (root.id || o.param);
  function go(p, how = {}) {
    p = Math.min(Math.max(1, Math.round(+p) || 1), pages);
    const from = page;
    if (p === from && !how.force) return;
    page = p;
    // keep the keyboard where it was: on Previous / Next if it pressed one, else on the new current page
    const f = document.activeElement, had = list.contains(f);
    const kind = had ? (f.closest('.sn-prev') ? '.sn-prev a' : f.closest('.sn-next') ? '.sn-next a' : '') : '';
    render();
    if (had) (kind && list.querySelector(kind) || list.querySelector('[aria-current="page"]'))?.focus({ preventScroll: true });
    if (how.history !== false) {
      const mode = how.mode || o.history;
      if (mode === 'push' || mode === 'replace') {
        const u = new URL(location.href);
        u.searchParams.set(o.param, p);
        history[mode === 'push' ? 'pushState' : 'replaceState']({ ...(history.state || {}), [KEY]: p }, '', u);
      }
    }
    const target = squareOf(p, pages);
    live.textContent = `${o.label} ${p} of ${pages}`;
    root.dispatchEvent(new CustomEvent('senet:change', { detail: { page: p, from, pages, square: target } }));
    if (reduced() || how.instant || !root.isConnected) { jump(target); settle(); }
    else { planTo(target); run(); }
  }

  function onClick(e) {
    const a = e.target.closest('a[data-page]');
    if (!a || !list.contains(a) || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const p = +a.dataset.page;
    if (o.history === 'load') { try { sessionStorage.setItem(KEY, String(page)); } catch {} return; }
    e.preventDefault();
    go(p);
  }
  function onPop() {
    const p = fromUrl() || 1;
    if (p !== page) go(p, { history: false });
  }

  // the board itself: a square is a target too (pointer only; the list is the control for keyboards and readers)
  const hit = (e) => {
    const r = board.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
    for (let n = 1; n <= 30; n++) {
      const [x, y] = sq(n);
      if (Math.abs(fx - x) < SQ_W * 0.62 && Math.abs(fy - y) < SQ_H * 0.62) return n;
    }
    return 0;
  };
  function onMove(e) {
    if (e.pointerType === 'touch') return;
    const n = hit(e), on = n ? pagesOn(n, pages) : [];
    board.classList.toggle('sn-point', on.length > 0);
    if (!on.length) { tip.classList.remove('sn-tip-on'); return; }
    const [x, y] = sq(n);
    tip.textContent = on.length === 1 ? `${on[0]}` : `${on[0]}–${on[on.length - 1]}`;
    tip.style.left = `${x * 100}%`; tip.style.top = `${(y - SQ_H / 2) * 100}%`;
    tip.classList.add('sn-tip-on');
  }
  function onLeave() { tip.classList.remove('sn-tip-on'); board.classList.remove('sn-point'); }
  function onBoardClick(e) {
    const n = hit(e), on = n ? pagesOn(n, pages) : [];
    if (!on.length) return;
    const p = on.includes(page) ? page : on[0];
    if (o.history === 'load') { try { sessionStorage.setItem(KEY, String(page)); } catch {} location.href = hrefFor(p); return; }
    go(p, { force: p === page });
  }

  let lastAround = -1;
  const ro = new ResizeObserver(() => { measure(); if (around() !== lastAround) render(); place(); });
  list.addEventListener('click', onClick);
  board.addEventListener('pointermove', onMove);
  board.addEventListener('pointerleave', onLeave);
  board.addEventListener('click', onBoardClick);
  addEventListener('popstate', onPop);

  // arriving from another page of a multi-page site: start on the square we left, then walk
  measure();
  render();
  let arrivedFrom = 0;
  if (o.history === 'load') {
    try { arrivedFrom = +sessionStorage.getItem(KEY) || 0; sessionStorage.removeItem(KEY); } catch {}
  }
  jump(squareOf(arrivedFrom && arrivedFrom !== page ? arrivedFrom : page, pages));
  ro.observe(root);
  piece.decode?.().catch(() => {}).finally(() => {
    measure(); place();
    if (arrivedFrom && arrivedFrom !== page && !reduced()) { planTo(squareOf(page, pages)); run(); }
  });

  const api = () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    list.removeEventListener('click', onClick);
    board.removeEventListener('pointermove', onMove);
    board.removeEventListener('pointerleave', onLeave);
    board.removeEventListener('click', onBoardClick);
    removeEventListener('popstate', onPop);
    shadow.remove(); tip.remove(); live.remove();
    root.classList.remove('sn-js', 'sn-moving');
    piece.style.transform = '';
    delete root.senet;
  };
  root.senet = api;
  Object.defineProperties(api, {
    page: { get: () => page },
    pages: { get: () => pages },
  });
  return Object.assign(api, {
    go,
    setPages(n) { pages = Math.max(1, Math.round(n)); page = Math.min(page, pages); render(); jump(squareOf(page, pages)); },
    // stills: freeze the simulation, then step it by hand
    hold() { held = true; cancelAnimationFrame(raf); raf = 0; },
    advance(ms) {
      let t = ms / 1000;
      while (t > 0) { if (dwell > 0) dwell -= DT; else if (!step(DT) && dwell <= 0) break; t -= DT; }
      place();
    },
    release() { held = false; run(); },
  });
}

// auto-start
function boot() {
  document.querySelectorAll('[data-senet]').forEach((el) => senet(el));   // el.senet is its controller
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
