// demo/contact-sheet: the selects. A roll contact-printed on one sheet of paper; a loupe the cursor carries; grease
// pencil loops round the picks and an X through a reject; then the picks enlarged, one to a screen, on paper, and
// prints and commissions. This file:
//   · dresses the sheet from the markup: edge type and frame numbers on the rebate, perforations, the hooks script.js
//     points at (@f4, @s1…) and the grease-pencil marks for every data-pick, each stroke made once, by hand rules
//     (uneven pressure, a wobble, a loop that closes past where it started), and drawn as far as its --draw says;
//   · carries the loupe (a magnified copy of the sheet under a lens) and the pencil with the film's cursor;
//   · plays the film once when the sheet is on screen, then gives the loupe to the visitor;
//   · flies the first select out of the sheet into its page as you scroll, and sends the enquiry line as an email.
// ?t=12.5 freezes a moment; ?record&ratio=16:9|1:1|9:16 is a clean stage for screen recording (../tour/README.md).
import { Tour } from '../tour/tour.js';
import { film, DRAW } from './script.js';

const q = new URLSearchParams(location.search);
const SW = 1040, SH = 832;                 // the sheet, in its own px (10 × 8, landscape)
const MAG = 2.5;                           // the loupe's magnification
const shape = (r) => (r < .8 ? 'tall' : r < 1.15 ? 'square' : 'wide');     // the engine's own thresholds
const cl = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sm = (a, b, x) => { const t = cl((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const ease = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const NS = 'http://www.w3.org/2000/svg';
const pad2 = (n) => String(n).padStart(2, '0');

/* ── grease pencil: every mark is a ribbon of points with a width at each (the pressure) ─────────────────────── */
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// a loop round a frame, the way a hand does it: starts on the top edge, goes anticlockwise, a little boxy (the frame is
// a rectangle), never quite round, pressed hardest down the left side, and carries on past the start before it lifts
function loopStroke(r, seed) {
  const R = rng(seed), N = 200;
  const cx = r.x + r.w / 2 + (R() - .5) * 6, cy = r.y + r.h / 2 + (R() - .5) * 5;
  const ax = r.w / 2 + 14 + R() * 8, ay = r.h / 2 + 12 + R() * 7;
  const tilt = (R() - .5) * .12, n = 2.15 + R() * .45;
  const a0 = -1.8 + (R() - .5) * .45, sweep = Math.PI * 2 + .6 + R() * .3;
  const ph = [0, 0, 0, 0, 0].map(() => R() * 6.283);
  const pts = [], w = [];
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1), a = a0 - sweep * u, c = Math.cos(a), s = Math.sin(a);
    // it starts a little inside and spirals out, so the end passes outside the start where the loop closes
    const k = (.945 + .12 * u) * (1 + .03 * Math.sin(2 * a + ph[0]) + .018 * Math.sin(3 * a + ph[1]) + .009 * Math.sin(5 * a + ph[2]));
    let x = Math.sign(c) * Math.pow(Math.abs(c), 2 / n) * ax * k, y = Math.sign(s) * Math.pow(Math.abs(s), 2 / n) * ay * k;
    [x, y] = [x * Math.cos(tilt) - y * Math.sin(tilt), x * Math.sin(tilt) + y * Math.cos(tilt)];
    const hook = 5 * (1 - sm(0, .045, u));          // the touch-down: the tip lands and drags in before it runs
    pts.push([cx + x * (1 - hook / ax), cy + y * (1 - hook / ay) + hook * .4]);
    const p = (.32 + .68 * sm(0, .06, u)) * (1 - .8 * sm(.86, 1, u)) * (.8 + .2 * Math.sin(u * 8.3 + ph[3]) * Math.sin(u * 3.1 + ph[4])) * (1 - .16 * c);
    w.push(1 + 7.6 * p);
  }
  return { pts, w, split: (Math.PI * 2) / sweep };
}
// one stroke of an X: lands hard with a little hook, eases off, flicks away at the end
function xStroke(a, b, seed) {
  const R = rng(seed), N = 60, dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L;
  const bow = (R() - .5) * 12, hook = 3 + R() * 3, pts = [], w = [];
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1), off = bow * Math.sin(Math.PI * u) - hook * (1 - sm(0, .08, u)) * (u < .08 ? 1 : 0);
    pts.push([a[0] + dx * u + nx * off, a[1] + dy * u + ny * off]);
    w.push(.9 + 7.4 * (.5 + .5 * sm(0, .06, u)) * (1 - .66 * sm(.7, 1, u)) * (.9 + .1 * Math.sin(u * 7 + R())));
  }
  return { pts, w, split: 2 };
}
// the outline of points [i0 … f] (f fractional) as a filled path, with soft round-ish caps
function ribbon(st, i0, f) {
  const P = st.pts, W = st.w, last = Math.min(P.length - 1, f), n = Math.floor(last);
  if (last - i0 < .2) return '';
  const pts = [], ws = [];
  for (let i = i0; i <= n; i++) { pts.push(P[i]); ws.push(W[i]); }
  if (last > n) { const t = last - n, a = P[n], b = P[n + 1]; pts.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t)]); ws.push(lerp(W[n], W[n + 1], t)); }
  const L = [], Rr = [], T = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1]; const d = Math.hypot(tx, ty) || 1; tx /= d; ty /= d; T.push([tx, ty]);
    const h = ws[i] / 2; L.push([pts[i][0] - ty * h, pts[i][1] + tx * h]); Rr.push([pts[i][0] + ty * h, pts[i][1] - tx * h]);
  }
  const f2 = (p) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`, e = pts.length - 1;
  const tipE = [pts[e][0] + T[e][0] * ws[e] * .75, pts[e][1] + T[e][1] * ws[e] * .75], tip0 = [pts[0][0] - T[0][0] * ws[0] * .75, pts[0][1] - T[0][1] * ws[0] * .75];
  return `M${f2(L[0])}L${L.map(f2).join('L')}Q${f2(tipE)} ${f2(Rr[e])}L${Rr.reverse().map(f2).join('L')}Q${f2(tip0)} ${f2(L[0])}Z`;
}
const headOf = (st, v) => { const f = v * (st.pts.length - 1), n = Math.floor(f), t = f - n, a = st.pts[n], b = st.pts[Math.min(n + 1, st.pts.length - 1)]; return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)]; };

/* the china marker, seen from above: a waxy red tip, paper wrapped round the rest, the pull-string. Tip at 0,0 */
const PENCIL = `<svg viewBox="-6 -4 70 130" width="70" height="130" aria-hidden="true">
  <g transform="rotate(-27)">
    <path d="M0 0 L-4.2 12 L4.2 12 Z" fill="#b8291d"/><path d="M-1 1.5 L-3.4 11 L-.6 11 Z" fill="#e0574a" opacity=".55"/>
    <rect x="-5.6" y="11.5" width="11.2" height="16" rx="1" fill="#c22f22"/>
    <rect x="-5.9" y="27" width="11.8" height="96" rx="1.4" fill="#f4efe6"/>
    <path d="M-5.9 33 L5.9 41 M-5.9 47 L5.9 55 M-5.9 61 L5.9 69 M-5.9 75 L5.9 83 M-5.9 89 L5.9 97 M-5.9 103 L5.9 111" stroke="#cfc6b6" stroke-width=".7"/>
    <path d="M3.4 27 L3.4 123" stroke="#b8291d" stroke-width=".8" opacity=".8"/>
    <rect x="-5.9" y="27" width="3" height="96" fill="#000" opacity=".06"/>
  </g></svg>`;

export default function init(root) {
  const stage = root.querySelector('[data-tour-stage]');
  const win = root.querySelector('[data-tour-window]');
  const desk = win.querySelector('.cs-desk');
  const sheet = win.querySelector('.cs-sheet');
  const rec = q.has('record'), fixed = q.has('t'), thumb = q.has('thumb');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const off = [];

  // ── dress the sheet: hooks, edge type, frame numbers ──
  const frames = [...sheet.querySelectorAll('.cs-f')];
  const byN = new Map(frames.map((f) => [+f.dataset.n, f]));
  const name = (sheet.dataset.rebate || '').trim().toUpperCase(), year = sheet.dataset.year || '';
  sheet.querySelectorAll('.cs-strip').forEach((s, si) => {
    const fs = [...s.querySelectorAll('.cs-f')];
    const top = document.createElement('div'); top.className = 'cs-edge is-top'; top.setAttribute('aria-hidden', 'true');
    top.innerHTML = fs.map((f, i) => `<span>${i % 3 === (si % 3) ? `${name}<b>${year}</b>` : ''}</span>`).join('');
    const bot = document.createElement('div'); bot.className = 'cs-edge is-bot'; bot.setAttribute('aria-hidden', 'true');
    bot.innerHTML = fs.map((f) => `<span><i>${f.dataset.n}</i><i>▸${f.dataset.n}A</i></span>`).join('');
    s.prepend(top); s.append(bot);
  });
  for (const f of frames) f.setAttribute('data-tour', 'f' + f.dataset.n);

  // ── the marks: geometry in sheet px, from where each frame sits (strips lie a little askew, as laid by hand) ──
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'cs-marks'); svg.setAttribute('viewBox', `0 0 ${SW} ${SH}`); svg.setAttribute('aria-hidden', 'true');
  const wax = document.createElementNS(NS, 'g'); wax.setAttribute('filter', 'url(#cs-wax)'); svg.append(wax);
  sheet.append(svg);
  const marks = [];
  function addStroke(id, st) {
    const g = document.createElementNS(NS, 'g'); g.setAttribute('class', 'cs-mark'); g.setAttribute('data-tour', id);
    const a = document.createElementNS(NS, 'path'), b = document.createElementNS(NS, 'path'); b.setAttribute('class', 'is-over');
    g.append(a, b); wax.append(g);
    const at = document.createElement('i'); at.className = 'cs-pt'; at.setAttribute('data-tour', id + '-at');
    at.style.left = st.pts[0][0] + 'px'; at.style.top = st.pts[0][1] + 'px'; sheet.append(at);
    marks.push({ id, st, els: [g], v: -1, end: st.pts[st.pts.length - 1], start: st.pts[0], dur: st.split > 1 ? DRAW.x : DRAW.loop });
  }
  function frameBox(f) {      // the frame's box in sheet px, through the strip's slight rotation
    const k = sheet.getBoundingClientRect().width / SW || 1, s = sheet.getBoundingClientRect(), r = f.getBoundingClientRect();
    return { x: (r.left - s.left) / k, y: (r.top - s.top) / k, w: r.width / k, h: r.height / k };
  }
  for (const f of frames) {
    const p = f.dataset.pick; if (!p) continue;
    const n = +f.dataset.n, r = frameBox(f);
    if (p === 'x') {
      addStroke(`x${n}a`, xStroke([r.x - 7, r.y - 5], [r.x + r.w + 6, r.y + r.h + 7], n * 31 + 1));
      addStroke(`x${n}b`, xStroke([r.x + r.w + 5, r.y - 7], [r.x - 6, r.y + r.h + 5], n * 31 + 2));
    } else addStroke(`m${n}`, loopStroke(r, n * 97 + 13));
  }
  function paint(m, v) {
    const f = v * (m.st.pts.length - 1), si = Math.round(m.st.split * (m.st.pts.length - 1));
    const a = v > 0 ? ribbon(m.st, 0, f) : '', b = v * (m.st.pts.length - 1) > si ? ribbon(m.st, si, f) : '';
    for (const g of m.els) { g.children[0].setAttribute('d', a); g.children[1].setAttribute('d', b); }
  }

  // ── the loupe: a lens over a magnified copy of the sheet (marks included), and its shadow on the paper ──
  const loupe = document.createElement('div'); loupe.className = 'cs-loupe'; loupe.setAttribute('aria-hidden', 'true');
  loupe.innerHTML = '<i class="cs-loupe-sh"></i><div class="cs-lens"><div class="cs-lens-in"></div><i class="cs-glass"></i></div><i class="cs-ring"></i>';
  const copy = sheet.cloneNode(true);
  for (const e of [copy, ...copy.querySelectorAll('*')]) { e.removeAttribute('data-tour'); e.removeAttribute('id'); }
  copy.classList.add('is-copy');
  loupe.querySelector('.cs-lens-in').append(copy);
  copy.querySelectorAll('.cs-mark').forEach((g, i) => marks[i]?.els.push(g));
  const lensIn = loupe.querySelector('.cs-lens-in');
  const pencil = document.createElement('div'); pencil.className = 'cs-pencil'; pencil.innerHTML = PENCIL;
  desk.append(loupe, pencil);

  // ── ?record: the paper the selects are enlarged onto, built from the selects below the sheet ──
  const sels = [...root.querySelectorAll('.cs-sel')];
  let prints = null;
  if (rec) {
    prints = document.createElement('div'); prints.className = 'cs-prints'; prints.setAttribute('data-tour', 'prints');
    sels.forEach((s, i) => {
      const pr = document.createElement('div'); pr.className = 'cs-pr' + (s.classList.contains('is-portrait') ? ' is-portrait' : '');
      pr.setAttribute('data-tour', 'pr' + (i + 1)); pr.style.setProperty('--i', i); pr.style.setProperty('--lift', i ? 1 : 0);
      pr.append(s.querySelector('.cs-print').cloneNode(true), s.querySelector('.cs-cap').cloneNode(true));
      prints.append(pr);
    });
    desk.append(prints);
  }
  // each select's caption gets its frame number, the way it's written on the sleeve
  sels.forEach((s) => {
    const n = +s.dataset.frame, tag = document.createElement('p'); tag.className = 'cs-cap-n';
    tag.innerHTML = `<svg viewBox="0 0 40 26" aria-hidden="true"><path d="M27.5 4.2C21 1.6 7.6 2.4 4.3 8.6c-3.4 6.4 4.6 13.3 15.2 13.6 9.6.3 17.6-3.7 16.9-9.6-.6-4.8-8-8.4-14.6-9.3"/></svg>Frame ${pad2(n)}`;
    s.querySelector('.cs-cap').append(tag);
    if (prints) prints.querySelectorAll('.cs-cap')[sels.indexOf(s)]?.append(tag.cloneNode(true));
  });

  // ── the engine ──
  const ratio = () => {
    if (rec) { const [a, b] = (q.get('ratio') || '16:9').split(':').map(Number); return a > 0 && b > 0 ? a / b : 16 / 9; }
    return stage.clientWidth / Math.max(1, stage.clientHeight);
  };
  let kind = shape(ratio());
  const tour = new Tour(root, film(kind, { prints: rec }));
  root.tour = tour;
  off.push(() => tour.destroy());

  // where things are in the window (design px); changes only with the layout
  let G = null, Gkey = '';
  function geo() {
    const key = `${tour.Wd}x${tour.Hd}|${root.className}`;
    if (G && key === Gkey) return G;
    const k = win.getBoundingClientRect().width / tour.Wd || 1, w = win.getBoundingClientRect();
    const loc = (el) => { const r = el.getBoundingClientRect(); return { x: (r.left - w.left) / k, y: (r.top - w.top) / k, w: r.width / k, h: r.height / k }; };
    const s = loc(sheet), rs = loc(win.querySelector('.cs-rest'));
    G = { sx: s.x, sy: s.y, ss: s.w / SW, rest: [rs.x + rs.w / 2, rs.y + rs.h / 2], R: loupe.offsetWidth / 2 };
    Gkey = key;
    if (prints) {         // the first print grows out of its frame: where the frame is, as seen from the print
      const pr = prints.querySelector('.cs-pr'), img = pr?.querySelector('.cs-print'), fr = byN.get(+sels[0]?.dataset.frame);
      if (img && fr) {
        const was = pr.style.getPropertyValue('--lift'); pr.style.setProperty('--lift', 1); prints.style.setProperty('--measuring', 1);
        const a = loc(fr), b = loc(img); pr.style.setProperty('--lift', was);
        img.style.setProperty('--dx', (a.x - b.x).toFixed(2)); img.style.setProperty('--dy', (a.y - b.y).toFixed(2)); img.style.setProperty('--ds', (a.w / b.w).toFixed(4));
      }
    }
    return G;
  }
  const chanSegs = (el, prop) => tour.chMap?.get(el)?.get(prop)?.segs || [];
  // the loupe lies where it was last set down: the cursor's place at each --carry 1 → 0
  function restAt(t, g) {
    let rest = g.rest;
    for (const s of chanSegs(desk, '--carry')) { if (s.start > t) break; if (s.at(s.start + 9, () => 0) < .5) rest = tour.cursorAt(s.start).p; }
    return rest;
  }
  // the pencil: at the head of the stroke being drawn; after one, it eases back onto the cursor as the hand moves on
  function penAt(t, cp) {
    let last = null;
    for (const m of marks) {
      const s = chanSegs(m.els[0], '--draw')[0]; if (!s) continue;
      const t0 = s.start, t1 = t0 + m.dur;
      if (t >= t0 && t < t1) return toWin(headOf(m.st, cl(m.v)));
      if (t >= t1 && (!last || t1 > last.t1)) last = { m, t1 };
    }
    if (!last) return cp;
    const tm = tour.tracks.main.find((g) => g.start >= last.t1 - 1e-6)?.start ?? Infinity;
    const k = 1 - ease(cl((t - tm) / .55)), e = toWin(last.m.end), s0 = toWin(last.m.start);
    return [cp[0] + (e[0] - s0[0]) * k, cp[1] + (e[1] - s0[1]) * k];
  }
  const toWin = (p) => [G.sx + p[0] * G.ss, G.sy + p[1] * G.ss];

  // draw the loupe at window point p, held (lift 1) or lying on the paper (lift 0)
  let loupeAt = null;
  function placeLoupe(p, lift, vis = 1) {
    const g = geo(), R = g.R; loupeAt = p;
    loupe.style.transform = `translate(${(p[0] - R).toFixed(2)}px,${(p[1] - R).toFixed(2)}px) scale(${(1 + .035 * lift).toFixed(4)})`;
    loupe.style.setProperty('--lift', lift.toFixed(3)); loupe.style.opacity = vis.toFixed(3);
    const m = MAG * g.ss;
    lensIn.style.transform = `translate(${(R + MAG * (g.sx - p[0])).toFixed(2)}px,${(R + MAG * (g.sy - p[1])).toFixed(2)}px) scale(${m.toFixed(4)})`;
  }
  function placePen(p, on) {
    pencil.style.transform = `translate(${p[0].toFixed(2)}px,${p[1].toFixed(2)}px) scale(${(1 + .06 * (1 - on)).toFixed(3)})`;
    pencil.style.opacity = on.toFixed(3);
  }

  // every frame of the film: marks as far as --draw says, the loupe and the pencil with the cursor
  let mine = false;      // the visitor has the loupe
  tour.onFrame = (t) => {
    const g = geo();
    for (const m of marks) { const v = +m.els[0].style.getPropertyValue('--draw') || 0; if (v !== m.v) { m.v = v; paint(m, v); } }
    if (mine) return;
    const ds = desk.style, carry = +ds.getPropertyValue('--carry') || 0, pn = +ds.getPropertyValue('--pen') || 0;
    const paper = prints ? +prints.style.getPropertyValue('--paper') || 0 : 0;
    const cp = tour.cursorAt(t).p;
    const rest = restAt(t, g);
    placeLoupe([lerp(rest[0], cp[0], carry), lerp(rest[1], cp[1], carry)], carry, 1 - paper);
    placePen(penAt(t, cp), pn * (1 - paper));
    stage.style.setProperty('--arrow', (1 - Math.max(carry, pn, paper)).toFixed(3));
  };
  tour.render(tour.t < 0 ? 0 : tour.t, true);
  if (rec) return () => off.forEach((f) => f());
  win.removeAttribute('aria-hidden');

  // ── the visitor's loupe: it follows the pointer over the sheet (a touch drags it), and stays where it's left ──
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  let lp = null, aim = null, held = 0, raf = 0;
  const winPt = (e) => { const r = win.getBoundingClientRect(), k = r.width / tour.Wd; return [(e.clientX - r.left) / k, (e.clientY - r.top) / k]; };
  function loop() {
    raf = 0; if (!mine || !lp) return;
    const k = .3; let more = false;
    if (aim) { lp = [lerp(lp[0], aim[0], k), lerp(lp[1], aim[1], k)]; more = Math.hypot(aim[0] - lp[0], aim[1] - lp[1]) > .2; }
    const want = aim ? 1 : 0; held = lerp(held, want, .2); if (Math.abs(held - want) > .01) more = true; else held = want;
    placeLoupe(lp, held);
    if (more) raf = requestAnimationFrame(loop);
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };
  function yours(on) {
    mine = on; root.classList.toggle('is-yours', on);
    if (on) {
      lp = (loupeAt || geo().rest).slice(); aim = null; held = 0; placePen([0, 0], 0);
      stage.style.setProperty('--arrow', 1); kick();
    }
    label();
  }
  const inSheet = (p) => { const g = geo(); return p[0] > g.sx && p[1] > g.sy && p[0] < g.sx + SW * g.ss && p[1] < g.sy + SH * g.ss; };
  if (fine) {
    win.addEventListener('pointermove', (e) => { if (!mine || e.pointerType !== 'mouse') return; const p = winPt(e); aim = inSheet(p) ? p : null; root.classList.toggle('is-looking', !!aim); kick(); });
    win.addEventListener('pointerleave', () => { aim = null; root.classList.remove('is-looking'); kick(); });
  }
  let drag = null;
  loupe.addEventListener('pointerdown', (e) => {
    if (!mine || e.pointerType === 'mouse') return;
    e.preventDefault(); loupe.setPointerCapture(e.pointerId); const p = winPt(e); drag = [lp[0] - p[0], lp[1] - p[1]]; aim = lp.slice(); kick();
  });
  loupe.addEventListener('pointermove', (e) => { if (!drag) return; const p = winPt(e); aim = [p[0] + drag[0], p[1] + drag[1]]; kick(); });
  const drop = () => { if (!drag) return; drag = null; lp = aim || lp; aim = null; kick(); };
  loupe.addEventListener('pointerup', drop); loupe.addEventListener('pointercancel', drop);

  // a click on a select goes to its page; anywhere else on the sheet during the film hands it over
  const seqOf = (n) => sels.find((s) => +s.dataset.frame === n);
  win.addEventListener('click', (e) => {
    if (tour.playing) { finish(); return; }
    const p = winPt(e), hit = frames.find((f) => { const r = f.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; });
    const s = hit && seqOf(+hit.dataset.n);
    if (s && inSheet(p)) s.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
  });
  for (const f of frames) if (seqOf(+f.dataset.n)) f.classList.add('is-pick');

  function finish() { tour.pause(); tour.render(tour.duration, true); yours(true); }
  function again() { yours(false); tour.render(0, true); tour.play(); label(); }
  const btn = root.querySelector('.cs-ctl-btn'), say = btn?.querySelector('.cs-ctl-say');
  function label() { if (say) say.textContent = tour.playing ? 'Skip the edit' : mine ? 'Watch the edit again' : 'Watch the edit'; }
  btn?.addEventListener('click', () => { if (tour.playing) finish(); else again(); });
  root.addEventListener('tour:end', () => yours(true));

  // ── the stage changed shape: rebuild the script for that layout ──
  let rz = 0;
  const onResize = () => { clearTimeout(rz); rz = setTimeout(relayout, 140); };
  function relayout() {
    const k = shape(ratio()); G = null;
    if (k === kind) { if (mine) { const g = geo(); lp = lp || g.rest; placeLoupe(lp, held); } return; }
    kind = k;
    const t = tour.t, playing = tour.playing;
    tour.load(film(k));
    tour.render(mine ? tour.duration : Math.min(t, tour.duration), true);
    if (playing) tour.play();
    if (mine) { G = null; const g = geo(); lp = g.rest.slice(); placeLoupe(lp, 0); }
  }
  addEventListener('resize', onResize); off.push(() => removeEventListener('resize', onResize));

  // ── the first select flies out of the sheet into its page as you scroll down ──
  const first = sels[0], firstFig = first?.querySelector('.cs-print'), firstFrame = first && byN.get(+first.dataset.frame);
  let fly = null;
  if (first && firstFrame && !reduced) {
    fly = document.createElement('div'); fly.className = 'cs-fly'; fly.setAttribute('aria-hidden', 'true');
    fly.append(firstFig.querySelector('.cs-print-img').cloneNode(true));
    root.append(fly); first.classList.add('is-flown');
  }
  function onScroll() {
    if (!fly) return;
    const b = firstFig.getBoundingClientRect(), a = firstFrame.getBoundingClientRect();
    const s1 = b.top + scrollY + b.height / 2 - innerHeight / 2, p = cl(scrollY / Math.max(1, s1));
    const on = p > .001 && p < .999 && a.width > 0;
    first.classList.toggle('is-landed', p >= .999);
    fly.style.visibility = on ? 'visible' : 'hidden';
    if (!on) return;
    const e = ease(p), bw = parseFloat(getComputedStyle(firstFig).paddingLeft) || 0;
    const x = lerp(a.left, b.left, e), y = lerp(a.top, b.top, e), w = lerp(a.width, b.width, e), h = lerp(a.height, b.height, e);
    fly.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`; fly.style.width = w.toFixed(1) + 'px'; fly.style.height = h.toFixed(1) + 'px';
    fly.style.padding = (bw * e).toFixed(2) + 'px'; fly.style.setProperty('--e', e.toFixed(3));
  }
  addEventListener('scroll', onScroll, { passive: true }); off.push(() => removeEventListener('scroll', onScroll));
  addEventListener('resize', onScroll); onScroll();

  // ── the enquiry line: opens the visitor's mail app, addressed, with their sentence ──
  const ask = root.querySelector('.cs-ask');
  ask?.addEventListener('submit', (e) => {
    e.preventDefault();
    const what = ask.querySelector('.cs-ask-what')?.value || '', mail = ask.querySelector('.cs-ask-mail')?.value || '';
    const say = (n) => (n.matches?.('select') ? what : n.matches?.('input') ? mail : n.matches?.('button') ? '' : n.matches?.('.cs-nw') ? [...n.childNodes].map(say).join('') : n.textContent);
    const words = [...ask.querySelector('.cs-ask-line').childNodes].map(say).join(' ').replace(/\s+/g, ' ').replace(/\s+([.,])/g, '$1').trim();
    location.href = `mailto:${ask.dataset.to}?subject=${encodeURIComponent(ask.dataset.subject || '')}&body=${encodeURIComponent(words + '.')}`;
  });

  // ── when to play: never under ?t=; reduced motion gets the marked sheet, already the visitor's; otherwise once ──
  if (fixed) return () => off.forEach((f) => f());
  if (reduced) { tour.render(tour.duration, true); yours(true); }
  else if (thumb) tour.render(tour.api.marks.poster ?? 0, true);
  else {
    let wait = 0, done = false;
    const io = new IntersectionObserver(([e]) => {
      clearTimeout(wait);
      if (e.isIntersecting && !done) wait = setTimeout(() => { done = true; if (!mine) { tour.play(); label(); } }, 900);
    }, { threshold: .45 });
    io.observe(stage); off.push(() => { io.disconnect(); clearTimeout(wait); });
  }
  label();
  return () => off.forEach((f) => f());
}
