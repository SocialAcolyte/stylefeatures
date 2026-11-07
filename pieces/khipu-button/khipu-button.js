/* khipu-button: a "next option" stepper button made of the Cleveland Museum of Art's Inka khipu 1940.469 (CC0).
 *
 * The end of one of the khipu's two-colour cords runs across the button from its left edge, as the primary, and ends
 * in its own knot. From behind it hang the ends of real pendant cords, one for each option: each one the last few
 * centimetres of one cord, with its own knotted or curled end, cut in one piece from the photograph on its own pixel
 * grid (assets/ends.webp). The option you are on hangs plumb; the others are laid aside to either side of it. Press, and
 * the next cord is drawn plumb as the last is laid aside: each cord only turns, as one rigid piece, about where it is
 * tied. Nothing is drawn, straightened or joined.
 *
 *   <button type="button" class="kb" data-khipu-button data-count="3" data-current="2" data-noun="version">
 *     <span class="kb-label">2 of 3</span><span class="kb-go" aria-hidden="true">›</span>
 *   </button>
 *
 *   import { khipuButton } from './khipu-button.js';
 *   const kb = khipuButton(button, { count: 3, current: 2, noun: 'version' });
 *   kb.current; kb.count;              // 2, 3 (1-based, like the label)
 *   kb.next(); kb.prev(); kb.set(1);   // step or jump; set(i, { say: true }) also announces it. With a previous button
 *                                      // it stops at the ends; without one it goes round (data-wrap sets either)
 *   kb.setCount(4, 4);                 // a fourth option arrives (its cord is tied on), and it is the one shown
 *   button.addEventListener('khipu-button:change', (e) => e.detail);   // { current, count, from, dir, via }
 *   kb.destroy();                      // removes the cords, the name, the live line and every listener
 */

const NS = 'kb';
const atlasCache = new Map();

/* ── the atlas: whole cut ends, each on the photograph's own pixel grid ─────────────────────────────── */

function loadAtlas(src) {
  const url = new URL(src, document.baseURI).href;
  if (atlasCache.has(url)) return atlasCache.get(url);
  const p = fetch(url).then((r) => {
    if (!r.ok) throw new Error('khipu-button: ' + url + ' ' + r.status);
    return r.json();
  }).then((spec) => new Promise((res, rej) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => res({ spec, img, cut: new Map(), lines: new Map() });
    img.onerror = () => rej(new Error('khipu-button: atlas failed to load'));
    img.src = new URL(spec.file || 'ends.webp', url).href;
  }));
  atlasCache.set(url, p);
  p.catch(() => atlasCache.delete(url));
  return p;
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  return c;
}

/* A piece as its own canvas, copied 1:1 out of the atlas (no resampling), so nothing beside it can bleed in. */
function piece(A, name) {
  let c = A.cut.get(name);
  if (c) return c;
  const [x, y, w, h] = A.spec.pieces[name].rect;
  c = canvas(w, h);
  c.getContext('2d').drawImage(A.img, x, y, w, h, 0, 0, w, h);
  A.cut.set(name, c);
  return c;
}

/* The cord's centreline, from its tip back along it, as [x, y] points `step` px of cord apart (piece coordinates). */
function lineOf(A, name) {
  let L = A.lines.get(name);
  if (L) return L;
  const f = A.spec.pieces[name].line;
  L = [];
  for (let i = 0; i + 1 < f.length; i += 2) L.push([f[i], f[i + 1]]);
  A.lines.set(name, L);
  return L;
}
function at(L, step, u) {
  const f = Math.max(0, Math.min(L.length - 1, u / step)), i = Math.min(L.length - 2, Math.floor(f)), t = f - i;
  return [L[i][0] + (L[i + 1][0] - L[i][0]) * t, L[i][1] + (L[i + 1][1] - L[i][1]) * t];
}

/* Draws piece `name` turned by `phi` about the point `p` of the piece, so that p lands at (ox, oy) of a new canvas. */
function turned(A, name, phi, p, w, h, ox, oy) {
  const c = canvas(w, h), x = c.getContext('2d');
  const co = Math.cos(phi), si = Math.sin(phi);
  x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
  x.setTransform(co, si, -si, co, ox - co * p[0] + si * p[1], oy - si * p[0] - co * p[1]);
  x.drawImage(piece(A, name), 0, 0);
  return c;
}

/* What is drawn, as [left, right, bottom] of the opaque pixels about (ox, oy). Falls back to the canvas. */
function extent(c, ox, oy) {
  try {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let l = c.width, r = -1, b = -1;
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        if (d[(y * c.width + x) * 4 + 3] > 10) { if (x < l) l = x; if (x > r) r = x; b = y; }
      }
    }
    if (r < 0) return [0, 0, 0];
    return [l - ox, r + 1 - ox, b + 1 - oy];
  } catch { return [-ox, c.width - ox, c.height - oy]; }
}

/**
 * A pendant, hung: the last `len` px of the cord (from its own tip) turned as one rigid piece so that it hangs with its
 * centre of mass straight under the point `len` px up the cord, its tie. Everything above the tie (the rest of that
 * cord, which in the button runs on behind the primary) is left out. -> { c, ox, oy: the tie in c, ext: [l, r, b] }
 */
function hang(A, name, len) {
  const ck = 'h|' + name + '|' + len.toFixed(2);
  if (A.cut.has(ck)) return A.cut.get(ck);
  const P = A.spec.pieces[name], L = lineOf(A, name), step = A.spec.step || 2;
  len = Math.min(len, (L.length - 1) * step - 2);
  const tie = at(L, step, len), n = Math.max(1, Math.floor(len / step));
  let gx = 0, gy = 0;
  for (let i = 0; i <= n; i++) { gx += L[i][0]; gy += L[i][1]; }
  gx /= n + 1; gy /= n + 1;
  const phi = -Math.PI / 2 - Math.atan2(tie[1] - gy, tie[0] - gx);   // the tie straight above the centre of mass
  const co = Math.cos(phi), si = Math.sin(phi);
  let l = 0, r = 0, b = 0;
  for (let i = 0; i <= n; i++) {
    const dx = L[i][0] - tie[0], dy = L[i][1] - tie[1];
    const x = co * dx - si * dy, y = si * dx + co * dy;
    l = Math.min(l, x); r = Math.max(r, x); b = Math.max(b, y);
  }
  const m = (P.tipr || 24) + (P.w || 5) + 6;                           // room for the fray and the halo
  const ox = Math.ceil(m - l), w = Math.ceil(r - l + 2 * m), h = Math.ceil(b + m);
  const c = turned(A, name, phi, tie, w, h, ox, 0);                     // the canvas's top edge is the tie line
  const out = { c, ox, oy: 0, ext: extent(c, ox, 0) };
  A.cut.set(ck, out);
  return out;
}

/* Scaled down in halves (each a 2x2 box), then the last step with the browser's best filter: sharp, never blocky. */
function scaled(src, w, h) {
  w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
  let cur = src;
  while (cur.width >= w * 2 && cur.height >= h * 2) {
    const n = canvas(cur.width / 2, cur.height / 2), x = n.getContext('2d');
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.drawImage(cur, 0, 0, n.width, n.height);
    cur = n;
  }
  const out = canvas(w, h), x = out.getContext('2d');
  x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
  x.drawImage(cur, 0, 0, w, h);
  return out;
}

/* ── the button ──────────────────────────────────────────────────────────────────────────────────── */

const num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
const bool = (v, d) => (v == null ? d : v !== 'false' && v !== '0');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const MAXN = 7;                    // the clean whole cord ends of one kind there are to cut: no more options than that

export function khipuButton(button, opts = {}) {
  const ds = button.dataset;
  // one cord for each option, and there are seven: with more, the button is left as it is rather than show a count
  // its cords cannot keep
  const asked = Math.round(num(opts.count ?? ds.count, 2));
  if (asked > MAXN) {
    console.warn(`khipu-button: ${asked} options, and there are cords for ${MAXN}. The button is left as it is; keep its options to ${MAXN} or fewer.`);
    return null;
  }
  if (button.__khipuButton) button.__khipuButton.destroy();
  const o = {
    src: ds.src || new URL('assets/ends.json', import.meta.url).href,
    count: Math.round(num(ds.count, 2)),
    current: Math.round(num(ds.current, 1)),
    max: Math.round(num(ds.max, 0)),                 // room kept for this many cords, so setCount never widens it
    noun: ds.noun || 'option',
    label: ds.label || '{i} of {n}',                // the visible words; {i}, {n}, {noun} and {Noun} are filled in
    wrap: ds.wrap != null ? bool(ds.wrap, false) : null,   // default: stop at the ends when there is a previous button
    status: ds.status || null,                       // the id of your own live region
    prev: ds.prev || null,                           // the id of a "previous" button that steps back
    ...opts,
  };
  let count = Math.max(1, Math.round(num(o.count, 2))), cur = clampI(o.current);
  function clampI(i) { return Math.min(count, Math.max(1, Math.round(i))); }

  const off = [];
  const on = (t, type, fn, op) => { t.addEventListener(type, fn, op); off.push(() => t.removeEventListener(type, fn, op)); };
  const timers = new Set();
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); return id; };
  const cancel = (id) => { if (id != null) { clearTimeout(id); timers.delete(id); } };
  let destroyed = false;

  const hadClass = button.classList.contains(NS);
  button.classList.add(NS, 'kb-js');
  const setType = !button.hasAttribute('type') && !button.form;
  if (setType) button.type = 'button';

  /* words: the name is the visible words and then what a press does ("2 of 3, next version"), kept in step */
  let label = button.querySelector('.kb-label');
  const madeLabel = !label;
  if (!label) { label = document.createElement('span'); label.className = 'kb-label'; button.append(label); }
  let arrow = button.querySelector('.kb-go');
  const madeArrow = !arrow;
  if (!arrow) { arrow = document.createElement('span'); arrow.className = 'kb-go'; arrow.textContent = '›'; label.after(arrow); }
  arrow.setAttribute('aria-hidden', 'true');
  const authoredLabel = label.textContent;
  const fixedName = button.hasAttribute('data-label-fixed') || button.hasAttribute('aria-labelledby');
  const authoredName = button.getAttribute('aria-label');
  let ourBlock = false, ourPrevBlock = false, prevNamed = false;

  /* the cords: a box of canvases, the primary in front of its pendants */
  const box = document.createElement('span');
  box.className = 'kb-cords';
  box.setAttribute('aria-hidden', 'true');
  button.insertBefore(box, button.firstChild);

  /* the live line: polite, after the button (or yours, by id) */
  let live = o.status ? document.getElementById(o.status) : null;
  const ownLive = !live;
  let addedRole = false;
  if (!live) {
    live = document.createElement('span');
    live.className = 'kb-live';
    live.setAttribute('role', 'status');
    (button.closest('.kb-pair') || button).after(live);
  } else if (!live.hasAttribute('role') && !live.hasAttribute('aria-live')) { live.setAttribute('role', 'status'); addedRole = true; }

  /* the "previous" counterpart */
  let prevBtn = o.prev ? (typeof o.prev === 'string' ? document.getElementById(o.prev) : o.prev) : null;
  if (!prevBtn) {
    const pair = button.closest('.kb-pair');
    prevBtn = pair ? pair.querySelector('.kb-prev') : null;
  }
  if (o.wrap == null) o.wrap = !prevBtn;            // without one, the only way back to the first is round
  const prevHadReady = prevBtn ? prevBtn.classList.contains('kb-prev-ready') : false;
  prevBtn?.classList.add('kb-prev-ready');

  const fill = (tpl, i) => tpl.replaceAll('{i}', i).replaceAll('{n}', count).replaceAll('{noun}', o.noun).replaceAll('{Noun}', cap(o.noun));
  let now = null, ghost = null;
  function words() {
    const shown = fill(o.label, cur), widest = fill(o.label, count);
    if (widest.length !== shown.length || ghost) {
      // the widest words sit unseen under the shown ones, so the button never changes width as you step
      if (!ghost) {
        label.textContent = '';
        now = document.createElement('span'); now.className = 'kb-now';
        ghost = document.createElement('span'); ghost.className = 'kb-ghost'; ghost.setAttribute('aria-hidden', 'true');
        label.append(now, ghost);
      }
      now.textContent = shown; ghost.textContent = widest;
    } else label.textContent = shown;
    const to = nextIndex(1);
    const then = count < 2 ? `the only ${o.noun}` : to == null ? `the last ${o.noun}` : `next ${o.noun}`;
    if (!fixedName) button.setAttribute('aria-label', `${shown}, ${then}`);
    // nowhere to go (one option, or the end without wrap): focusable but inert, so focus is never lost
    const blockedNow = count < 2 || to == null;
    if (blockedNow && button.getAttribute('aria-disabled') !== 'true') { button.setAttribute('aria-disabled', 'true'); ourBlock = true; }
    else if (!blockedNow && ourBlock) { button.removeAttribute('aria-disabled'); ourBlock = false; }
    if (prevBtn) {
      const pb = count < 2 || nextIndex(-1) == null;
      if (pb && prevBtn.getAttribute('aria-disabled') !== 'true') { prevBtn.setAttribute('aria-disabled', 'true'); ourPrevBlock = true; }
      else if (!pb && ourPrevBlock) { prevBtn.removeAttribute('aria-disabled'); ourPrevBlock = false; }
      if (!prevBtn.hasAttribute('aria-label') || prevNamed) { prevBtn.setAttribute('aria-label', `Previous ${o.noun}`); prevNamed = true; }
    }
  }
  function nextIndex(dir) {
    const j = cur + dir;
    if (j >= 1 && j <= count) return j;
    if (!o.wrap || count < 2) return null;
    return j < 1 ? count : 1;
  }

  /* ── geometry, in source px of the photograph (about 44 a centimetre) ── */
  const G = {
    tie: 30,          // the primary's centre line at the first tie, from the top of the box (CSS --kb-tie)
    space: 50,        // between ties along the primary
    end: 88,          // from the last tie along the primary to its own tip (past its end knot)
    lean: 24,         // degrees: how far the cords you are not on lie to either side
    spread: 2,        // degrees more for each cord further out, as the khipu's own fan opens
    maxLean: 28,      // and never more than this
    foot: 2,          // kept clear at the bottom of the box
  };
  Object.assign(G, o.geometry || {});

  let A = null, built = null, kept = null, dpr = 1, cords = [], prim = null, tall = 168, raf = 0;
  let hover = 0, down = 0, hoverType = '';
  const slots = () => Math.max(count, Math.min(MAXN, o.max || 0));

  function angle(k, c = cur - 1) {
    if (k === c) return 0;
    const a = Math.min(G.maxLean, G.lean + (Math.abs(k - c) - 1) * G.spread);
    return k < c ? a : -a;              // CSS rotate: positive swings a hanging cord's end to the left
  }
  const rad = (d) => d * Math.PI / 180;
  // the furthest a cord ever leans to the left (k at the left end, the last one shown) and to the right
  const leanL = (k, n) => (n - 1 - k > 0 ? Math.min(G.maxLean, G.lean + (n - 2 - k) * G.spread) : 0);
  const leanR = (k) => (k > 0 ? Math.min(G.maxLean, G.lean + (k - 1) * G.spread) : 0);

  /* the box's width before the cords arrive, from the size alone, so nothing moves when they do */
  function estimate(H, s) {
    const n = slots(), len = tall - G.tie - G.foot - 18;
    const left = len * Math.sin(rad(leanL(0, n))) + 20;
    const right = Math.max(G.end + 28, len * Math.sin(rad(leanR(n - 1))) + 20);
    return (left + (n - 1) * G.space + right) * s;
  }
  function size() {
    const cs = getComputedStyle(box);
    const H = box.clientHeight || parseFloat(cs.height) || 26;
    tall = num(cs.getPropertyValue('--kb-fragment'), 168);
    G.tie = num(cs.getPropertyValue('--kb-tie'), G.tie);
    const s = H / tall;
    if (!built) box.style.width = estimate(H, s).toFixed(2) + 'px';
    return { H, s };
  }

  /* the primary: the end of a two-colour cord, turned so its run under the ties lies level, its tip to the right */
  function primaryGeom(n) {
    const name = A.spec.primary, P = A.spec.pieces[name], L = lineOf(A, name), step = A.spec.step || 2;
    const us = []; for (let k = 0; k < n; k++) us.push(G.end + (n - 1 - k) * G.space);
    const a = at(L, step, us[0]), b = n > 1 ? at(L, step, us[n - 1]) : at(L, step, us[0] - 24);
    const phi = -Math.atan2(b[1] - a[1], b[0] - a[0]);
    const co = Math.cos(phi), si = Math.sin(phi);
    const rot = (p) => [co * (p[0] - a[0]) - si * (p[1] - a[1]), si * (p[0] - a[0]) + co * (p[1] - a[1])];
    const ties = us.map((u) => rot(at(L, step, u)));
    let top = 0, bot = 0, right = 0;
    for (const p of L) { const q = rot(p); if (q[0] > -400) { top = Math.min(top, q[1]); bot = Math.max(bot, q[1]); } right = Math.max(right, q[0]); }
    const m = (P.tipr || 20) + (P.w || 4) + 4;
    return { name, phi, a, ties, top: top - m, bot: bot + m, right: right + m };
  }

  function build() {
    if (!A || destroyed) return;
    const { H, s } = size();
    dpr = Math.min(3, window.devicePixelRatio || 1);
    const n = slots();
    const key = [H, tall, G.tie, dpr, count, n].join();
    if (built === key) return;
    const old = cords;
    const fam = A.spec.pendants.brown;
    const pg = primaryGeom(n);
    // each pendant: as long as fits in the box under its tie, fray and all
    const hung = [];
    for (let k = 0; k < n; k++) {
      const name = fam[k % fam.length];
      const room = tall - G.foot - (G.tie + pg.ties[k][1]);
      let len = room - 16, h = hang(A, name, len);
      for (let t = 0; t < 3 && Math.abs(h.ext[2] - room) > 1; t++) { len += room - h.ext[2] - 0.5; h = hang(A, name, len); }
      while (h.ext[2] > room && len > 20) { len -= 2; h = hang(A, name, len); }
      hung.push(h);
    }
    // the room the fan needs either side, from what each cord really covers when it leans furthest
    const reach = (h, deg) => {
      const r = rad(deg), co = Math.cos(r), si = Math.sin(r), [l, rr, b] = h.ext;
      const xs = [[l, 0], [rr, 0], [l, b], [rr, b]].map(([x, y]) => x * co - y * si);
      return [Math.min(...xs), Math.max(...xs)];
    };
    let left = 0, right = pg.right;
    hung.forEach((h, k) => {
      const tx = pg.ties[k][0];
      left = Math.max(left, -(tx + reach(h, leanL(k, n))[0]), -(tx + h.ext[0]));
      right = Math.max(right, tx + reach(h, -leanR(k))[1], tx + h.ext[1]);
    });
    left = Math.max(left + 3, 12);
    const est = parseFloat(box.style.width) || 0;
    const sameRoom = kept && kept.n === n && kept.H === H && kept.tall === tall;
    const W = Math.max((left + right + 3) * s, built ? (sameRoom ? kept.W : 0) : est);
    kept = { n, H, tall, W };
    box.style.width = W.toFixed(2) + 'px';
    built = key;
    const snap = (v) => (Math.round(v * dpr) / dpr).toFixed(3) + 'px';      // whole device pixels: sharp at rest
    box.textContent = '';
    cords = [];
    const S = s * dpr;
    for (let k = 0; k < count; k++) {
      const h = hung[k];
      const c = scaled(h.c, h.c.width * S, h.c.height * S);
      c.className = 'kb-cord';
      const cw = c.width / dpr, ch = c.height / dpr;
      const ox = Math.round(h.ox * S) / dpr, oy = 0;
      const tx = (left + pg.ties[k][0]) * s, ty = (G.tie + pg.ties[k][1]) * s;
      c.style.width = cw + 'px'; c.style.height = ch + 'px';
      c.style.left = snap(tx - ox);
      c.style.top = snap(ty - oy);
      c.style.transformOrigin = `${ox}px ${oy}px`;
      c.style.setProperty('--kb-i', k);
      if (old[k]) c.style.setProperty('--kb-a', old[k].style.getPropertyValue('--kb-a'));
      else if (old.length) c.classList.add('kb-new');
      box.append(c);
      cords.push(c);
    }
    // the primary: from under the button's left edge to its own knotted end, in front of the pendants' tops
    const x0 = -(left + 2), pw = x0 < 0 ? pg.right - x0 : pg.right;
    const ph = pg.bot - pg.top;
    const psrc = turned(A, pg.name, pg.phi, pg.a, Math.ceil(pw), Math.ceil(ph), -x0, -pg.top);
    prim = scaled(psrc, psrc.width * S, psrc.height * S);
    prim.className = 'kb-primary';
    prim.style.width = prim.width / dpr + 'px';
    prim.style.height = prim.height / dpr + 'px';
    prim.style.left = snap((left + x0) * s);
    prim.style.top = snap((G.tie + pg.top) * s);
    box.append(prim);
    if (old.length && old.length !== count) {
      // options were added or taken away: the cords that were there stay where they were, the new one fades in
      box.classList.add('kb-still');
      cords.forEach((el, k) => { if (!old[k]) el.style.setProperty('--kb-a', angle(k) + 'deg'); });
      void box.offsetWidth;
      box.classList.remove('kb-still');
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => { raf = 0; cords.forEach((el) => el.classList.remove('kb-new')); pose(); });
    } else pose(true);
  }

  /* where each cord rests, and which one a press or a hover would draw */
  function pose(instant = false) {
    if (!cords.length) return;
    const c = cur - 1;
    const nx = nextIndex(1), pv = nextIndex(-1);
    if (instant) box.classList.add('kb-still');
    cords.forEach((el, k) => {
      el.style.setProperty('--kb-a', angle(k, c).toFixed(3) + 'deg');
      el.classList.toggle('kb-on', k === c);
      el.classList.toggle('kb-to-next', nx != null && k === nx - 1);
      el.classList.toggle('kb-to-prev', pv != null && k === pv - 1);
    });
    if (instant) { void box.offsetWidth; box.classList.remove('kb-still'); }
  }

  /* A move of more than one option (round from the last to the first, or a jump by set() or setCount()) turns every
     cord between. They go a cord at a time, from the one let go toward the one drawn, so each turns into the room its
     neighbour has just left and no two cross; and each turns slowly enough that none is faster than a plain step. */
  const SWEEP = { gap: 180, spread: 720, rate: 115, slope: 3.3 };  // ms apart; ms all the starts fit in; deg/s at most;
                                                                   // the peak slope of --kb-settle (3.28 at its steepest)
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  let settleT = null, sweepT = null;
  function mark(from, to, born = Infinity) {
    const span = Math.abs(to - from), s = Math.sign(to - from);
    const sweep = span > 1 && cords.length > 0 && !still.matches;
    const gap = Math.min(SWEEP.gap, SWEEP.spread / Math.max(1, span - 1));
    const plan = cords.map((el, k) => ({
      el,
      d: Math.max(0, Math.min(span, (k - (from - 1)) * s)) * gap,          // its place on the way from the old to the new
      turn: k >= born ? 0 : Math.abs(angle(k, to - 1) - angle(k, from - 1)),   // a cord just tied on only fades in
    }));
    // the first cord that really turns starts at once (setCount may have taken away the ones before it)
    const first = Math.min(...plan.filter((p) => p.turn > 0.5).map((p) => p.d), Infinity);
    const lead = Number.isFinite(first) ? first : 0;
    let end = 0;
    plan.forEach(({ el, d, turn }, k) => {
      el.classList.toggle('kb-was', k === from - 1);
      if (!sweep) { el.style.removeProperty('--kb-d'); el.style.removeProperty('--kb-t'); return; }
      d = Math.max(0, d - lead);
      const t = Math.max(700, turn * SWEEP.slope / SWEEP.rate * 1000);
      el.style.setProperty('--kb-d', Math.round(d) + 'ms');
      el.style.setProperty('--kb-t', Math.round(t) + 'ms');
      end = Math.max(end, d + t);
    });
    box.classList.toggle('kb-sweep', sweep);
    cancel(sweepT); sweepT = null;
    if (sweep) sweepT = later(() => { sweepT = null; box.classList.remove('kb-sweep'); hintBack(); }, end + 60);
  }
  // after a press the hover hint pauses (0.7 s, or until a sweep has come to rest); then, still under a mouse, it
  // comes back for the next press
  function hintBack() {
    if (destroyed || settleT || sweepT) return;
    delete button.dataset.kbSettling;
    for (const [el, d] of [[button, 1], [prevBtn, -1]]) {
      if (el && hoverType === 'mouse' && el.matches(':hover') && !blocked(el)) { hover = d; syncHover(); }
    }
  }
  function step(dir, via) {
    if (destroyed || count < 2) return false;
    const to = nextIndex(dir);
    if (to == null) return false;
    return go(to, dir > 0 ? 'next' : 'prev', via, true);
  }
  function go(i, dir, via, say) {
    if (destroyed) return false;
    const from = cur;
    i = clampI(i);
    if (i === cur) return false;
    cur = i;
    mark(from, cur);
    button.dataset.kbSettling = '';
    hover = 0; syncHover();
    cancel(settleT);
    settleT = later(() => { settleT = null; hintBack(); }, 700);
    words();
    pose();
    if (say) live.textContent = `${cap(o.noun)} ${cur} of ${count}`;
    button.dispatchEvent(new CustomEvent('khipu-button:change', { bubbles: true, detail: { current: cur, count, from, dir, via } }));
    return true;
  }

  /* ── the press: a press takes hold of the next cord and draws it part of the way; letting go passes the option ── */
  function blocked(el) { return el.disabled || el.getAttribute('aria-disabled') === 'true' || !!el.closest('fieldset:disabled'); }
  function syncHover() {
    box.classList.toggle('kb-hover', hover > 0 && !down);
    box.classList.toggle('kb-hover-prev', hover < 0 && !down);
  }
  function press(dir) {
    down = dir;
    button.toggleAttribute('data-kb-down', dir > 0);
    prevBtn?.toggleAttribute('data-kb-down', dir < 0);
    box.classList.toggle('kb-drawn-next', dir > 0);
    box.classList.toggle('kb-drawn-prev', dir < 0);
    syncHover();
  }
  function release() {
    if (!down) return;
    down = 0;
    button.removeAttribute('data-kb-down');
    prevBtn?.removeAttribute('data-kb-down');
    box.classList.remove('kb-drawn-next', 'kb-drawn-prev');
    syncHover();
  }
  /* A tap steps on its click, as a native button does (so a tap that only stops a scroll stays inert, as theirs does).
     A touch held LONG may bring no click at all (Android's long press), so it steps when it lifts on the button, and
     the one click that may still follow it is not counted again. */
  const LONG = 450;
  let pid = null, ptype = 'mouse', pel = null, pdir = 0, pt0 = 0, touchT = null, waitT = null, lastVia = 'other';
  let tapEl = null, tapType = '', tapAt = 0;      // the button a pointer last let go on: the click that follows is its
  let eatEl = null, eatT = null;                  // the button a long touch stepped on its lift: its next click is eaten
  const disarm = () => { eatEl = null; cancel(eatT); eatT = null; };
  const inside = (el, e, slop = 6) => {
    const r = el.getBoundingClientRect();
    return e.clientX >= r.left - slop && e.clientX <= r.right + slop && e.clientY >= r.top - slop && e.clientY <= r.bottom + slop;
  };
  function bindPress(el, dir) {
    on(el, 'pointerdown', (e) => {
      if (e.button !== 0 || blocked(el)) return;
      cancel(waitT); waitT = null; release();        // a tap still waiting for its click: that is over
      pid = e.pointerId; ptype = e.pointerType || 'mouse'; pel = el; pdir = dir; pt0 = performance.now();
      if (ptype === 'touch') {
        // a touch may be the start of a scroll: wait a moment before the cord is taken hold of, as :active does
        try { el.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
        cancel(touchT);
        touchT = later(() => { touchT = null; if (pid === e.pointerId) press(dir); }, 100);
      } else press(dir);
    });
    on(el, 'pointerleave', (e) => {
      if (e.pointerId === pid) { cancel(touchT); touchT = null; if (down === dir) release(); }   // slid off: the cord goes back
      if (e.pointerType === 'mouse' && hover === dir) { hover = 0; syncHover(); }
    });
    on(el, 'pointerenter', (e) => {
      if (e.pointerType) hoverType = e.pointerType;
      if (e.pointerId === pid && pel === el && !down && ptype !== 'touch') press(dir);           // back on, still held
      if (e.pointerType === 'mouse' && !blocked(el) && !button.hasAttribute('data-kb-settling')) { hover = dir; syncHover(); }
    });
    on(el, 'keydown', (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'Enter' || e.key === ' ' || e.code === 'Space') { tapEl = null; disarm(); }   // a key's click, not a pointer's
      if (e.key === 'Enter' && e.repeat) { e.preventDefault(); return; }   // a held Enter steps once, not on and on
      if ((e.key === ' ' || e.code === 'Space') && !e.repeat && !blocked(el)) { lastVia = 'key'; press(dir); }
      if (e.key === 'Enter') lastVia = 'key';
    });
    on(el, 'keyup', (e) => { if (e.key === ' ' || e.code === 'Space') release(); });
    on(el, 'blur', () => { if (down === dir) release(); });
    on(el, 'click', (e) => {
      if (eatEl === el) { disarm(); e.preventDefault(); return; }       // a long touch already stepped when it lifted
      const fromTap = tapEl === el && performance.now() - tapAt < 1500;
      const via = fromTap ? (tapType === 'touch' ? 'touch' : 'pointer') : lastVia === 'key' ? 'key' : 'other';
      tapEl = null; lastVia = 'other';
      cancel(waitT); waitT = null;
      release();                                                        // let go first, then step: nothing flicks
      if (blocked(el)) { e.preventDefault(); return; }
      step(dir, via);
    });
  }
  const upAnywhere = (e) => {
    if (pid === null || e.pointerId !== pid) return;
    const el = pel, dir = pdir, touch = ptype === 'touch', held = performance.now() - pt0;
    pid = null;
    cancel(touchT); touchT = null;
    if (e.type === 'pointercancel') { release(); return; }               // a scroll took it: the cord goes back
    tapEl = el; tapType = ptype; tapAt = performance.now();
    if (!touch) { later(release, 0); return; }                          // a mouse: its click comes at once
    if (!el || !inside(el, e) || blocked(el)) { tapEl = null; release(); return; }
    if (held >= LONG) {
      tapEl = null;
      release();
      step(dir, 'touch');
      eatEl = el; cancel(eatT); eatT = later(disarm, 1000);           // timed from after the step, however long it took
    } else {
      // a tap: the cord stays as it is until its click steps it (or, if no click comes, goes back)
      cancel(waitT); waitT = later(() => { waitT = null; release(); }, 350);
    }
  };
  on(window, 'pointerup', upAnywhere, true);
  on(window, 'pointercancel', upAnywhere, true);
  on(window, 'pointerdown', disarm, true);         // a new press anywhere: no click is still to come from the last touch
  bindPress(button, 1);
  if (prevBtn) bindPress(prevBtn, -1);

  /* sizes come from CSS; rebuild only when the box's height or the screen's density changes */
  const ro = new ResizeObserver(() => { if (A) build(); });
  ro.observe(box);
  let mq = null;
  const watchDpr = () => {
    mq?.removeEventListener?.('change', onDpr);
    mq = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    mq.addEventListener?.('change', onDpr);
  };
  function onDpr() { watchDpr(); built = null; build(); }
  watchDpr();

  words();
  size();
  const ready = loadAtlas(o.src).then((a) => {
    if (destroyed) return;
    A = a;
    build();
    button.classList.add('kb-ready');
    button.dispatchEvent(new CustomEvent('khipu-button:ready', { bubbles: true, detail: { current: cur, count } }));
  }).catch((err) => { console.warn(err.message); button.classList.add('kb-failed'); });

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    off.forEach((f) => f()); off.length = 0;
    timers.forEach(clearTimeout); timers.clear();
    cancelAnimationFrame(raf);
    ro.disconnect();
    mq?.removeEventListener?.('change', onDpr);
    box.remove();
    if (ownLive) live.remove(); else if (addedRole) live.removeAttribute('role');
    if (madeLabel) label.remove(); else label.textContent = fill(o.label, cur) || authoredLabel;
    if (madeArrow) arrow.remove();
    if (!hadClass) button.classList.remove(NS);
    button.classList.remove('kb-js');
    if (setType) button.removeAttribute('type');
    if (!fixedName) { if (authoredName != null) button.setAttribute('aria-label', authoredName); else button.removeAttribute('aria-label'); }
    button.classList.remove('kb-ready', 'kb-failed');
    button.removeAttribute('data-kb-down'); delete button.dataset.kbSettling;
    // the markup carries on where it was: khipuButton(button) starts again at this option
    button.dataset.current = String(cur); button.dataset.count = String(count);
    if (ourBlock) button.removeAttribute('aria-disabled');
    if (prevBtn) {
      if (ourPrevBlock) prevBtn.removeAttribute('aria-disabled');
      if (prevNamed) prevBtn.removeAttribute('aria-label');
      prevBtn.removeAttribute('data-kb-down');
      if (!prevHadReady) prevBtn.classList.remove('kb-prev-ready');
    }
    delete button.__khipuButton;
  }

  const api = {
    ready,
    get current() { return cur; },
    get count() { return count; },
    next: () => step(1, 'api'),
    prev: () => step(-1, 'api'),
    set(i, { say = false } = {}) { return go(i, 'set', 'api', say); },
    setCount(n, i = cur, { say = false } = {}) {
      if (destroyed) return false;
      n = Math.max(1, Math.round(num(n, count)));
      if (n > MAXN) {
        // nothing changes, so the host can say no to an eighth option (its Retry, say)
        console.warn(`khipu-button: ${n} options, and there are cords for ${MAXN}. It stays at ${count}.`);
        return false;
      }
      if (n === count) return go(i, 'set', 'api', say);
      const from = cur, was = count;
      count = n; cur = clampI(i);
      words(); build();                  // the cords that were there stay; a new one fades in at the next tie
      mark(from, cur, was);              // the one let go, and a sweep if the option shown moves by more than one
      if (from !== cur) {
        button.dataset.kbSettling = ''; hover = 0; syncHover();
        cancel(settleT); settleT = later(() => { settleT = null; hintBack(); }, 700);
      }
      if (say) live.textContent = `${cap(o.noun)} ${cur} of ${count}`;
      button.dispatchEvent(new CustomEvent('khipu-button:change', { bubbles: true, detail: { current: cur, count, from, dir: 'set', via: 'api' } }));
      return true;
    },
    destroy,
    /** tests and screenshots: each cord's resting angle, and which one is on */
    state: () => cords.map((el, k) => ({ k: k + 1, on: k === cur - 1, angle: angle(k), shown: getComputedStyle(el).transform })),
  };
  button.__khipuButton = api;
  return api;
}

/* auto-start */
function auto() {
  for (const el of document.querySelectorAll('[data-khipu-button]')) if (!el.__khipuButton) khipuButton(el);
}
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto, { once: true });
  else queueMicrotask(auto);
}
