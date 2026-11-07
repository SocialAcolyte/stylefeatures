// demo/canvas: the board. The film (tour.js, script.js) flies the camera frame to frame; when it ends, or the moment the
// visitor touches anything, the same camera becomes theirs: drag to pan (with inertia and soft edges), wheel or pinch to
// zoom about the pointer, arrow keys frame to frame, click a frame to fly to it, a minimap, the top bar's places.
// Phones (≤ 700 px wide) get no film and no camera: the same items as a vertical sequence (.cv-seq in section.css).
// ?t=12.5 freezes a moment of the film; ?record&ratio=16:9|1:1|9:16 is the clean stage (../tour/README.md).
import { Tour } from '../tour/tour.js';
import { film } from './script.js';

const q = new URLSearchParams(location.search);
const shape = (r) => (r < .8 ? 'tall' : r < 1.15 ? 'square' : 'wide');     // the engine's own thresholds
const VARS = { wide: ['x', 'y', 'w', 'h'], square: ['sx', 'sy', 'sw', 'sh'], tall: ['tx', 'ty', 'tw', 'th'] };
const REGION = { wide: [3200, 1700], square: [1800, 1800], tall: [1200, 2120] };      // .cv-region in section.css
const cl = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const ease = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + (b - a) * t;

export default function init(root) {
  const stage = root.querySelector('[data-tour-stage]'), win = root.querySelector('[data-tour-window]');
  const region = root.querySelector('.cv-region'), svg = root.querySelector('.cv-arrows');
  const items = [...root.querySelectorAll('.cv-item')];
  const by = Object.fromEntries(items.map((e) => [e.dataset.cv, e]));
  const frames = items.filter((e) => e.classList.contains('cv-frame'));
  const box = (el, k) => VARS[k].map((n) => parseFloat(el.style.getPropertyValue('--' + n)) || 0);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const narrow = matchMedia('(max-width: 700px)');
  const seqWanted = () => !q.has('record') && narrow.matches;
  const off = [];

  /* zones: data-zone="a" items make one invisible box per group (all three layouts), for the film and the top bar */
  const zoneOf = {};
  for (const el of items) if (el.dataset.zone) (zoneOf[el.dataset.zone] ||= []).push(el);
  for (const [z, els] of Object.entries(zoneOf)) {
    const zel = document.createElement('i'); zel.className = 'cv-item cv-zone'; zel.dataset.tour = zel.dataset.cv = 'zone-' + z;
    for (const k of Object.keys(VARS)) {
      const bs = els.map((e) => box(e, k)), x0 = Math.min(...bs.map((b) => b[0])), y0 = Math.min(...bs.map((b) => b[1]));
      const x1 = Math.max(...bs.map((b) => b[0] + b[2])), y1 = Math.max(...bs.map((b) => b[1] + b[3]));
      VARS[k].forEach((n, i) => zel.style.setProperty('--' + n, [x0, y0, x1 - x0, y1 - y0][i]));
    }
    region.append(zel); by['zone-' + z] = zel;
  }

  /* arrows: each path runs from data-from to data-to. For every layout it tries each pair of sides and keeps the
     shortest curve that leaves and arrives the right way and crosses no other item, then adds a small open head. */
  function arrows(k) {
    const [RW, RH] = REGION[k];
    svg.setAttribute('viewBox', `0 0 ${RW} ${RH}`);
    // comment bubbles open to the right unless that would run off the board in this layout (data-left="always" pins one)
    for (const pin of root.querySelectorAll('.cv-pin')) {
      const fr = pin.closest('.cv-item'); if (!fr) continue;
      if (pin.dataset.left == null) pin.dataset.left = pin.classList.contains('is-left') ? 'always' : '';
      const [x, , w] = box(fr, k), px = x + w * (parseFloat(pin.style.getPropertyValue('--px')) || 0);
      pin.classList.toggle('is-left', pin.dataset.left === 'always' || px + 54 + 340 > RW - 24);
    }
    const others = items.filter((e) => !e.classList.contains('cv-head')).map((e) => [e, box(e, k)]);
    for (const p of svg.querySelectorAll('path')) {
      const A = by[p.dataset.from], B = by[p.dataset.to]; if (!A || !B) continue;
      const a = box(A, k), b = box(B, k), bc = [b[0] + b[2] / 2, b[1] + b[3] / 2];
      const side = (r, s, bias) => {
        const [x, y, w, h] = r, m = bias || [x + w / 2, y + h / 2];
        return s === 't' ? [[cl(m[0], x + w * .25, x + w * .75), y], [0, -1]] : s === 'b' ? [[cl(m[0], x + w * .25, x + w * .75), y + h], [0, 1]]
          : s === 'l' ? [[x, cl(m[1], y + h * .25, y + h * .75)], [-1, 0]] : [[x + w, cl(m[1], y + h * .25, y + h * .75)], [1, 0]];
      };
      let best = null;
      for (const s of 'trbl') for (const e of 'trbl') {
        const [p0, n0] = side(a, s), [p1, n1] = side(b, e, [lerp(p0[0], bc[0], .5), lerp(p0[1], bc[1], .5)]);
        const P0 = [p0[0] + n0[0] * 18, p0[1] + n0[1] * 18], P1 = [p1[0] + n1[0] * 22, p1[1] + n1[1] * 22];
        const dx = P1[0] - P0[0], dy = P1[1] - P0[1], d = Math.hypot(dx, dy) || 1;
        let cost = d;
        if (n0[0] * dx + n0[1] * dy < d * .2) cost += 4000;          // leaves away from where it's going
        if (-(n1[0] * dx + n1[1] * dy) < d * .2) cost += 4000;       // arrives from behind
        const c0 = [P0[0] + n0[0] * d * .42, P0[1] + n0[1] * d * .42], c1 = [P1[0] + n1[0] * d * .42, P1[1] + n1[1] * d * .42];
        for (let i = 1; i < 12; i++) {
          const t = i / 12, u = 1 - t, X = u * u * u * P0[0] + 3 * u * u * t * c0[0] + 3 * u * t * t * c1[0] + t * t * t * P1[0], Y = u * u * u * P0[1] + 3 * u * u * t * c0[1] + 3 * u * t * t * c1[1] + t * t * t * P1[1];
          for (const [el, r] of others) if (el !== A && el !== B && X > r[0] - 10 && X < r[0] + r[2] + 10 && Y > r[1] - 36 && Y < r[1] + r[3] + 10) cost += 1500;
        }
        if (!best || cost < best.cost) best = { cost, P0, P1, c0, c1 };
      }
      const { P0, P1, c0, c1 } = best, tx = P1[0] - c1[0], ty = P1[1] - c1[1], tl = Math.hypot(tx, ty) || 1, ux = tx / tl, uy = ty / tl;
      const head = (ang) => { const c = Math.cos(ang), s = Math.sin(ang); return [P1[0] - 15 * (ux * c - uy * s), P1[1] - 15 * (uy * c + ux * s)]; };
      const h1 = head(.48), h2 = head(-.48), f = (v) => v.toFixed(1);
      p.setAttribute('d', `M${f(P0[0])} ${f(P0[1])}C${f(c0[0])} ${f(c0[1])} ${f(c1[0])} ${f(c1[1])} ${f(P1[0])} ${f(P1[1])}M${f(h1[0])} ${f(h1[1])}L${f(P1[0])} ${f(P1[1])}L${f(h2[0])} ${f(h2[1])}`);
    }
  }

  /* what the film says, read from the page so it types exactly what the board shows */
  const copy = () => {
    const c = { name: root.querySelector('.cv-name')?.textContent.replace(/\s+/g, ' ').trim() };
    for (let n = 1; n <= 4; n++) c['pin' + n] = root.querySelector(`[data-tour="pin-${n}-t"]`)?.textContent.trim();
    return c;
  };

  let tour = null, kind = null;
  const ratio = () => {
    if (q.has('record')) { const [a, b] = (q.get('ratio') || '16:9').split(':').map(Number); return a > 0 && b > 0 ? a / b : 16 / 9; }
    return stage.clientWidth / Math.max(1, stage.clientHeight);
  };

  /* ── the visitor's camera: centre (board px), zoom (× the whole-board fit), velocity, a flight, a drag ── */
  const C = { on: false, cx: 0, cy: 0, z: 1, zt: 1, vx: 0, vy: 0, anchor: null, fly: null, drag: null, at: null, raf: 0, last: 0 };
  const P = new Map();      // pointers down on the stage
  const L = () => tour.L, F = () => tour.L.F, S = () => tour.L.s * C.z;
  const zmax = () => Math.max(1.5, 2.2 / tour.L.s);       // at most 2.2 screen px per board px
  const bounds = (z = C.z) => {
    const s = tour.L.s * z, f = F(), hw = f.w / 2 / s, hh = f.h / 2 / s, W = tour.Wd, H = tour.Hd;
    return { x0: Math.min(hw, W / 2), x1: Math.max(W - hw, W / 2), y0: Math.min(hh, H / 2), y1: Math.max(H - hh, H / 2) };
  };
  const pct = root.querySelector('.cv-pct');
  function apply() {
    const s = S(), f = F(), x = f.x + f.w / 2 - C.cx * s, y = f.y + f.h / 2 - C.cy * s;
    win.style.transform = `translate(${x.toFixed(2)}px,${y.toFixed(2)}px) scale(${s.toFixed(5)})`;
    if (pct) pct.textContent = Math.round(s * 100) + '%';
    root.classList.toggle('cv-whole', C.z < 1.04);       // the minimap only once there's somewhere to be on it
    mini();
  }
  function kick() { if (!C.raf) { C.last = performance.now(); C.raf = requestAnimationFrame(tick); } }
  function tick(now) {
    C.raf = 0; if (!tour || !C.on) return;
    const dt = Math.min(.05, (now - C.last) / 1000); C.last = now;
    let busy = false;
    if (C.fly) {
      const g = C.fly, u = cl((now - g.t0) / 1000 / g.dur), p = ease(u);
      C.z = Math.max(1, g.z0 * Math.pow(g.z1 / g.z0, p) * Math.pow(1 - g.arc, Math.sin(Math.PI * p)));
      C.cx = lerp(g.x0, g.x1, p); C.cy = lerp(g.y0, g.y1, p); C.zt = C.z;
      if (u >= 1) { C.fly = null; g.done && g.done(); } else busy = true;
    } else {
      if (Math.abs(Math.log(C.zt / C.z)) > 1e-4) {       // wheel / buttons: glide to the zoom asked for, holding the point under the pointer
        C.z = Math.exp(lerp(Math.log(C.z), Math.log(C.zt), 1 - Math.exp(-dt * 13)));
        if (C.anchor) { const s = S(); C.cx = C.anchor.bx - C.anchor.sx / s; C.cy = C.anchor.by - C.anchor.sy / s; }
        if (!C.drag) { const b = bounds(); C.cx = cl(C.cx, b.x0, b.x1); C.cy = cl(C.cy, b.y0, b.y1); }
        busy = true;
      } else { C.z = C.zt; C.anchor = null; }
      if (!C.drag && !P.size) {
        if (Math.hypot(C.vx, C.vy) * S() > 4) {          // inertia: let go and it glides, slowing like paper on a table
          C.cx += C.vx * dt; C.cy += C.vy * dt; const k = Math.exp(-dt * 3.6); C.vx *= k; C.vy *= k; busy = true;
        } else C.vx = C.vy = 0;
        const b = bounds(), tx = cl(C.cx, b.x0, b.x1), ty = cl(C.cy, b.y0, b.y1);      // soft edges: spring back onto the board
        if (Math.abs(tx - C.cx) + Math.abs(ty - C.cy) > .05) {
          const k = 1 - Math.exp(-dt * 9); C.cx += (tx - C.cx) * k; C.cy += (ty - C.cy) * k;
          if ((tx - C.cx) * C.vx < 0) C.vx *= .5; if ((ty - C.cy) * C.vy < 0) C.vy *= .5; busy = true;
        } else { C.cx = tx; C.cy = ty; }
      }
    }
    apply();
    if (busy) kick();
  }
  const stopAll = () => { C.fly = null; C.vx = C.vy = 0; C.anchor = null; C.zt = C.z; };
  const manual = () => { root.classList.add('cv-moved'); setAt(null); };
  function setAt(el) { C.at = el; for (const fr of frames) fr.classList.toggle('is-at', fr === el); }

  /* a flight: smootherstep in time, log-even in zoom, pulled back mid-way when it's going far */
  function flyTo(cx, cy, z, o = {}) {
    const f = F(), d = Math.hypot(cx - C.cx, cy - C.cy) * tour.L.s / f.w, b = bounds(z);
    cx = cl(cx, b.x0, b.x1); cy = cl(cy, b.y0, b.y1);
    const zr = Math.abs(Math.log(z / C.z)) / Math.log(4);
    const dur = reduced ? .001 : o.dur ?? cl(.8 + .55 * Math.min(1, d) + .3 * Math.min(1, zr), .7, 1.7);
    C.vx = C.vy = 0; C.anchor = null;
    C.fly = { t0: performance.now(), dur, x0: C.cx, y0: C.cy, z0: C.z, x1: cx, y1: cy, z1: z, arc: o.arc ?? (d > .22 && Math.min(z, C.z) > 1.3 ? Math.min(.42, d * .55) : 0), done: o.done };
    kick();
  }
  function rectOf(el) {
    const w = win.getBoundingClientRect(), r = el.getBoundingClientRect(), k = w.width / tour.Wd || 1;
    return [(r.left - w.left) / k, (r.top - w.top) / k, r.width / k, r.height / k];
  }
  function flyToEl(el, o = {}) {
    let [x, y, w, h] = rectOf(el);
    if (el.classList.contains('cv-frame')) { y -= 40; h += 40; }       // keep the frame's name in shot
    const f = F(), fill = o.fill ?? .8, z = cl(Math.min(f.w * fill / (w * tour.L.s), (f.h - 120) * fill / (h * tour.L.s)), 1, zmax());
    setAt(el.classList.contains('cv-frame') ? el : null);
    flyTo(x + w / 2, y + h / 2 + 8 / (tour.L.s * z), z, o);
  }
  const overview = (o) => { setAt(null); flyTo(tour.Wd / 2, tour.Hd / 2, 1, o); };
  function step(d) {
    let i = C.at ? frames.indexOf(C.at) : -1;
    if (i < 0) {      // not on a frame: start from the one nearest the middle of the screen
      let best = 1e12; frames.forEach((fr, j) => { const [x, y, w, h] = rectOf(fr), dd = Math.hypot(x + w / 2 - C.cx, y + h / 2 - C.cy); if (dd < best) { best = dd; i = j; } });
      if (C.z < 1.15) i = d > 0 ? -1 : frames.length;      // from the whole board, → starts at the cover
    }
    i = (i + d + frames.length) % frames.length;
    flyToEl(frames[i]);
  }

  /* the hand-over: the camera stays exactly where the film left it; every pin and arrow is put in */
  function soften(to) {      // pins and arrows fade to `to` rather than popping (the film writes them; this eases the jump)
    const els = [...root.querySelectorAll('.cv-pin')].map((e) => [e, '--in']).concat([...svg.querySelectorAll('path')].map((e) => [e, '--draw']));
    const from = els.map(([e, p]) => parseFloat(e.style.getPropertyValue(p)) || 0), t0 = performance.now();
    return () => {
      const run = (now) => {
        const u = reduced ? 1 : cl((now - t0) / 600), k = ease(u);
        els.forEach(([e, p], i) => e.style.setProperty(p, lerp(from[i], to, k).toFixed(3)));
        if (u < 1) requestAnimationFrame(run);
      };
      requestAnimationFrame(run);
    };
  }
  function takeover() {
    if (C.on || !tour || tour.rec || q.has('t') || root.classList.contains('cv-seq')) return;
    const m = /translate\(([-\d.e]+)px,\s*([-\d.e]+)px\)\s*scale\(([-\d.e]+)\)/.exec(win.style.transform);
    const Lr = L(), f = Lr.F, s = m ? +m[3] : Lr.s, x = m ? +m[1] : Lr.x, y = m ? +m[2] : Lr.y;
    C.z = C.zt = Math.max(1, s / Lr.s); C.cx = (f.x + f.w / 2 - x) / s; C.cy = (f.y + f.h / 2 - y) / s;
    const fadeIn = soften(1);
    C.on = true; root.classList.add('cv-yours');
    tour.pause(); tour.render(tour.duration, true); fadeIn();
    win.removeAttribute('aria-hidden');
    apply(); kick();
  }
  function replay() {
    if (!tour) return;
    root.classList.remove('cv-moved');
    soften(0)();
    overview({ dur: reduced ? .001 : .9, done: () => {
      C.on = false; root.classList.remove('cv-yours'); setAt(null);
      tour.render(0, true); if (!reduced) tour.play(); else takeover();
    } });
  }

  /* ── the minimap ── */
  const miniEl = root.querySelector('.cv-mini'), miniSvg = root.querySelector('.cv-mini-svg'), miniView = root.querySelector('.cv-mini-view');
  let miniK = 0, miniKind = null, miniH = 0;
  function mini() {
    if (!miniEl || !tour) return;
    const W = tour.Wd, H = tour.Hd;
    if (miniKind !== kind + H) {
      miniKind = kind + H;
      const mw = Math.min(180, 150 * W / H); miniK = mw / W; miniH = H * miniK;
      miniEl.style.width = mw + 'px'; miniEl.style.height = miniH + 'px';
      miniSvg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      const [, RH] = REGION[kind], oy = (H - RH) / 2;
      miniSvg.innerHTML = items.map((e) => { const [x, y, w, h] = box(e, kind); return `<rect class="${e.classList.contains('cv-note') ? 'is-note' : e.classList.contains('cv-head') ? 'is-head' : ''}" x="${x}" y="${y + oy + (e.classList.contains('cv-head') ? h - 6 : 0)}" width="${w}" height="${e.classList.contains('cv-head') ? 6 : h}" rx="${e.classList.contains('cv-tall') ? 14 : 3}"/>`; }).join('');
    }
    const z = C.on ? C.z : 1, s = tour.L.s * z, f = F(), cx = C.on ? C.cx : W / 2, cy = C.on ? C.cy : H / 2;
    const vw = f.w / s, vh = f.h / s, x0 = cl(cx - vw / 2, 0, W), y0 = cl(cy - vh / 2, 0, H), x1 = cl(cx + vw / 2, 0, W), y1 = cl(cy + vh / 2, 0, H);
    miniView.style.transform = `translate(${(x0 * miniK).toFixed(1)}px,${(y0 * miniK).toFixed(1)}px)`;
    miniView.style.width = ((x1 - x0) * miniK).toFixed(1) + 'px'; miniView.style.height = ((y1 - y0) * miniK).toFixed(1) + 'px';
  }

  /* ── input ── */
  const ui = (t) => t.closest?.('.cv-top, .cv-dock, .cv-skip, .sf-note');
  const local = (e) => { const r = stage.getBoundingClientRect(), f = F(); return [e.clientX - r.left - (f.x + f.w / 2), e.clientY - r.top - (f.y + f.h / 2)]; };
  function down(e) {
    if (!tour || root.classList.contains('cv-seq') || ui(e.target) || e.button > 0) return;
    if (!C.on) takeover(); if (!C.on) return;
    P.set(e.pointerId, [e.clientX, e.clientY]);
    try { stage.setPointerCapture(e.pointerId); } catch {}
    stopAll();
    if (P.size === 2) {       // pinch: zoom about the middle of the two fingers, and follow it
      const [a, b] = [...P.values()], mid = local({ clientX: (a[0] + b[0]) / 2, clientY: (a[1] + b[1]) / 2 });
      C.pinch = { d0: Math.hypot(a[0] - b[0], a[1] - b[1]), z0: C.z, bx: C.cx + mid[0] / S(), by: C.cy + mid[1] / S() };
      C.drag = null; manual(); return;
    }
    C.drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, cx0: C.cx, cy0: C.cy, moved: false, target: e.target, at: [[performance.now(), e.clientX, e.clientY]] };
  }
  function moveP(e) {
    if (!P.has(e.pointerId)) return;
    P.set(e.pointerId, [e.clientX, e.clientY]);
    if (C.pinch && P.size >= 2) {
      const [a, b] = [...P.values()], mid = local({ clientX: (a[0] + b[0]) / 2, clientY: (a[1] + b[1]) / 2 });
      C.z = C.zt = cl(C.pinch.z0 * Math.hypot(a[0] - b[0], a[1] - b[1]) / C.pinch.d0, .9, zmax());
      C.cx = C.pinch.bx - mid[0] / S(); C.cy = C.pinch.by - mid[1] / S(); apply(); return;
    }
    const g = C.drag; if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
    if (!g.moved && Math.hypot(dx, dy) > 4) { g.moved = true; root.classList.add('is-dragging'); manual(); }
    if (!g.moved) return;
    const s = S(), b = bounds(), rx = g.cx0 - dx / s, ry = g.cy0 - dy / s;
    const rub = (v, a, c) => { const k = cl(v, a, c); return k + (v - k) * .32; };      // past the edge it gives, a little
    C.cx = rub(rx, b.x0, b.x1); C.cy = rub(ry, b.y0, b.y1);
    const now = performance.now(); g.at.push([now, e.clientX, e.clientY]); while (g.at.length > 2 && now - g.at[0][0] > 90) g.at.shift();
    apply();
  }
  function up(e) {
    if (!P.has(e.pointerId)) return;
    P.delete(e.pointerId);
    if (C.pinch) { if (P.size < 2) { C.pinch = null; C.drag = null; kick(); } return; }
    const g = C.drag; C.drag = null; root.classList.remove('is-dragging');
    if (!g) return;
    if (g.moved) {
      const now = performance.now(), a = g.at[0], b = g.at[g.at.length - 1], dt = (b[0] - a[0]) / 1000, s = S();
      if (dt > .012 && now - b[0] < 70) {
        const k = 1 / s, vx = (b[1] - a[1]) / dt, vy = (b[2] - a[2]) / dt, sp = Math.hypot(vx, vy), cap = Math.min(1, 4200 / (sp || 1));
        C.vx = -vx * k * cap; C.vy = -vy * k * cap;
      }
      kick();
    } else {       // a click: fly to the frame (or back out, if you're already on it); links work as links
      if (g.target.closest('a, button')) return;
      const fr = g.target.closest('.cv-frame');
      if (fr && fr === C.at) overview(); else if (fr) flyToEl(fr); else kick();
    }
  }
  function wheel(e) {
    if (!tour || root.classList.contains('cv-seq') || ui(e.target)) return;
    e.preventDefault();
    if (!C.on) takeover(); if (!C.on) return;
    C.fly = null; manual();
    const k = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1, dx = e.deltaX * k, dy = e.deltaY * k;
    if (!e.ctrlKey && Math.abs(dx) > Math.abs(dy) * 1.2) { C.cx += dx / S(); C.vx = C.vy = 0; kick(); return; }      // sideways on a trackpad: pan
    const [sx, sy] = local(e), s = S();
    C.zt = cl(C.zt * Math.exp(-dy * (e.ctrlKey ? .011 : .0024)), 1, zmax());
    C.anchor = { sx, sy, bx: C.cx + sx / s, by: C.cy + sy / s };
    C.vx = C.vy = 0; kick();
  }
  function zoomBy(f) {
    if (!C.on) takeover(); if (!C.on) return;
    manual(); C.fly = null; const s = S();
    C.zt = cl(C.zt * f, 1, zmax()); C.anchor = { sx: 0, sy: 0, bx: C.cx, by: C.cy }; kick(); void s;
  }
  function key(e) {
    if (!tour || root.classList.contains('cv-seq') || e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    const k = e.key;
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', '+', '=', '-', '_', '0', 'Escape', 'Home'].includes(k)) return;
    if (k === 'Escape' && !C.on) return;
    e.preventDefault();
    if (!C.on) takeover(); if (!C.on) return;
    root.classList.add('cv-moved');
    if (k === 'ArrowRight' || k === 'ArrowDown') step(1);
    else if (k === 'ArrowLeft' || k === 'ArrowUp') step(-1);
    else if (k === '+' || k === '=') zoomBy(1.5);
    else if (k === '-' || k === '_') zoomBy(1 / 1.5);
    else overview();
  }

  function wire() {
    stage.addEventListener('pointerdown', down);
    addEventListener('pointermove', moveP); addEventListener('pointerup', up); addEventListener('pointercancel', up);
    stage.addEventListener('wheel', wheel, { passive: false });
    addEventListener('keydown', key);
    off.push(() => { stage.removeEventListener('pointerdown', down); removeEventListener('pointermove', moveP); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); stage.removeEventListener('wheel', wheel); removeEventListener('keydown', key); });
    root.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => { if (!C.on) takeover(); const el = by[b.dataset.go]; if (el) { root.classList.add('cv-moved'); flyToEl(el, { fill: b.dataset.go.startsWith('zone') ? .9 : .8 }); } }));
    root.querySelector('[data-cv-replay]')?.addEventListener('click', replay);
    root.querySelector('[data-cv-skip]')?.addEventListener('click', () => { takeover(); overview({ dur: 1.2 }); });
    root.querySelectorAll('[data-zoom]').forEach((b) => b.addEventListener('click', () => { const d = +b.dataset.zoom; if (d) zoomBy(d > 0 ? 1.5 : 1 / 1.5); else { if (!C.on) takeover(); root.classList.add('cv-moved'); overview(); } }));
    // tabbing into the board's links brings their frame into view
    win.addEventListener('focusin', (e) => { const fr = e.target.closest('.cv-frame'); if (fr && !root.classList.contains('cv-seq')) { if (!C.on) takeover(); flyToEl(fr); } });
    // the minimap: press or drag on it to move there
    if (miniEl) {
      const go = (e, glide) => { const r = miniEl.getBoundingClientRect(); const x = (e.clientX - r.left) / miniK, y = (e.clientY - r.top) / miniK;
        if (!C.on) takeover(); manual(); if (glide) flyTo(x, y, Math.max(C.z, 1.6), { dur: .8 }); else { C.fly = null; const b = bounds(); C.cx = cl(x, b.x0, b.x1); C.cy = cl(y, b.y0, b.y1); apply(); } };
      let md = false;
      miniEl.addEventListener('pointerdown', (e) => { md = true; miniEl.setPointerCapture(e.pointerId); go(e, true); });
      miniEl.addEventListener('pointermove', (e) => { if (md && !C.fly) go(e, false); });
      miniEl.addEventListener('pointerup', () => { md = false; });
    }
  }

  /* ── start: the film on a desktop or a recording, the sequence on a phone ── */
  function start() {
    kind = shape(ratio());
    arrows(kind);
    tour = new Tour(root, film(kind, copy()), { driver: 'manual' });
    root.tour = tour; root.camera = C;      // the instances, for the console
    tour.onFrame = () => { if (C.on) apply(); else mini(); };
    root.addEventListener('tour:end', () => takeover());
    off.push(() => tour.destroy());
    if (tour.rec || q.has('t')) return;
    wire();
    if (tour.still) { takeover(); return; }       // reduced motion: the finished board, whole, already theirs
    tour.api.ready.then(() => setTimeout(() => { if (!C.on && !tour.playing && !root.classList.contains('cv-seq')) tour.play(); }, 1300));
    // the stage changed shape past a threshold: that layout's board and script
    const ro = new ResizeObserver(() => {
      const k = shape(ratio()); if (k === kind || root.classList.contains('cv-seq')) return;
      kind = k; arrows(kind);
      const was = C.on, t = tour.t, playing = tour.playing;
      tour.load(film(kind, copy()));
      if (was) { tour.render(tour.duration, true); C.z = C.zt = 1; C.cx = tour.Wd / 2; C.cy = tour.Hd / 2; stopAll(); apply(); }
      else { tour.render(Math.min(t, tour.duration), true); if (playing) tour.play(); }
    });
    ro.observe(stage); off.push(() => ro.disconnect());
  }
  function seq(on) {
    root.classList.toggle('cv-seq', on);
    if (on) { tour?.pause(); win.removeAttribute('aria-hidden'); }
    else if (!tour) start();
    else { tour.relayout(); if (!C.on) takeover(); }
  }
  if (seqWanted()) seq(true); else start();
  const mq = () => { if (seqWanted() !== root.classList.contains('cv-seq')) seq(seqWanted()); };
  narrow.addEventListener('change', mq); off.push(() => narrow.removeEventListener('change', mq));
  return () => off.forEach((f) => f());
}
