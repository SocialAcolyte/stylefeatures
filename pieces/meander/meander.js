/*
 *  MEANDER // a river wanders across its floodplain as you scroll, and the
 *  plain fills with its old courses, drawn after Harold Fisk's 1944 maps of
 *  the ancient courses of the lower Mississippi.
 *
 *  Markup:  <section data-meander>
 *             <div class="mr-stage">
 *               <img class="mr-still" src="assets/fisk-detail.webp" alt="">   (no-JS fallback)
 *             </div>
 *           </section>
 *  Or call meander(element, { seed, courses, runway, ... }); it returns destroy().
 *
 *  The river is a centreline in channel widths (W). Its banks migrate after
 *  Howard & Knutson (1984) / Ikeda, Parker & Sawai (1981): the rate at a point
 *  is -1 x its own curvature plus 2.5 x the curvature upstream, averaged with
 *  a kernel that decays over about one channel width, so bends grow, lean
 *  downstream and travel. Bank erodibility varies over the plain, and every
 *  oxbow leaves a clay plug that erodes at 0.4 of the rate (Fisk's own
 *  finding), which is what makes the loops irregular. When two points far
 *  apart along the river come within 1.15 W the neck breaks: the loop is cut
 *  off and becomes a lake, then a swamp, then a scar.
 *
 *  The whole history is computed at load, deterministically from the seed, in
 *  small chunks between frames; scroll scrubs through it in both directions.
 *  The history is divided into stages ("courses"). Each place on the plain
 *  belongs to the last course that reworked it, so, as in Fisk's plates,
 *  younger courses overprint older ones; a course is coloured and patterned
 *  when it is abandoned, i.e. when the next stage begins.
 *
 *  Events (bubbling, on the host): meander:cutoff  { step, length }
 *                                  meander:course  { course }
 *  Reduced motion: the finished map, still.
 */

const calm = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

// Fisk's legend, oldest first. Most stages are a flat printed tint; a few
// carry a sparse screen (hatch, wide stripes, dots, stipple), as on Plate 22.
// c: the tint, p: its screen, d: the darker tone of its line plate.
const COURSES = [
  { c: '#d9da94', p: 'flat', d: '#76803f' },
  { c: '#e6d5ae', p: 'stipple', d: '#8d7a52' },
  { c: '#d3e0a6', p: 'flat', d: '#6c8556' },
  { c: '#bcd28e', p: 'hatch', d: '#587a3e' },
  { c: '#f1b8a4', p: 'flat', d: '#ad5848' },
  { c: '#eb9a86', p: 'wide', d: '#a5483c' },
  { c: '#d3d5cb', p: 'flat', d: '#62716f' },
  { c: '#b9cfd0', p: 'dots', d: '#4f7880' },
  { c: '#ebdc88', p: 'flat', d: '#8f8230' },
  { c: '#e5866f', p: 'hatch', d: '#9a3e32' },
  { c: '#b4cbcd', p: 'flat', d: '#4a7480' },
  { c: '#c3d696', p: 'flat', d: '#5a7a42' },
  { c: '#e2765f', p: 'flat', d: '#923a2c' },
  { c: '#cdc3d2', p: 'flat', d: '#6a5a7e' },
];

const BASE_INK = '78,70,62'; // the grey topographic base, printed at 20-30%
const TOWNS = ['Tallulah', 'Newellton', 'Waterproof', 'St. Joseph', 'Lake Village', 'Mayersville', 'Rolling Fork', 'Ferriday'];
const BAYOUS = ['Bayou Macon', 'Steele Bayou', 'Roundaway Bayou', 'Deer Creek', 'Tensas River', 'Bayou Vidal'];

const LAKES = ['Lake Bruin', 'Lake St. John', 'Moon Lake', 'Lake Chicot', 'Eagle Lake', 'Lake Concordia',
  'Old River', 'Horseshoe Lake', 'Lake Whittington', 'Tunica Lake', 'Lake Washington', 'Lake Lee',
  'Lake Ferguson', 'Lake Beulah', 'Swan Lake', 'Lake Charles'];

const DEFAULTS = {
  seed: 7, courses: 13, steps: 2600, runway: 350, span: 72,
  // simulation (lengths in channel widths)
  L: 110, ds: 0.5, decay: 0.9, omega: -1, gamma: 2.5, dt: 0.05, spin: 150, ymax: 14, soft: 8,
  cut: 1.15, gap: 9, smoothing: 0.08, noise: 0.25, hetero: 0.75, clay: 0.4, force: 0.004,
  lake: 160, swamp: 520,
};

/* ─── the simulation ───────────────────────────────────────────────────── */

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Resample a polyline (and a value carried along it) to an even spacing.
function resample(x, y, m, ds) {
  const n = x.length, s = new Float64Array(n);
  for (let i = 1; i < n; i++) s[i] = s[i - 1] + Math.hypot(x[i] - x[i - 1], y[i] - y[i - 1]);
  const total = s[n - 1], cnt = Math.max(2, Math.round(total / ds) + 1), step = total / (cnt - 1);
  const nx = new Float64Array(cnt), ny = new Float64Array(cnt), nm = new Float64Array(cnt);
  let j = 0;
  for (let k = 0; k < cnt; k++) {
    const t = k * step;
    while (j < n - 2 && s[j + 1] < t) j++;
    const u = clamp((t - s[j]) / (s[j + 1] - s[j] || 1));
    nx[k] = x[j] + (x[j + 1] - x[j]) * u; ny[k] = y[j] + (y[j + 1] - y[j]) * u; nm[k] = m[j] + (m[j + 1] - m[j]) * u;
  }
  nx[cnt - 1] = x[n - 1]; ny[cnt - 1] = y[n - 1];
  return [nx, ny, nm];
}

function createSim(P) {
  const R = rng(P.seed);
  let n = Math.round(P.L / P.ds) + 1;
  let x = new Float64Array(n), y = new Float64Array(n), m = new Float64Array(n);
  const ph = [R(), R(), R()].map((v) => v * 6.283);
  for (let i = 0; i < n; i++) {
    x[i] = i * P.ds;
    const env = Math.min(1, x[i] / 6, (P.L - x[i]) / 6);
    y[i] = env * P.noise * (Math.sin(x[i] * 0.52 + ph[0]) + 0.6 * Math.sin(x[i] * 0.31 + ph[1]) + 0.4 * Math.sin(x[i] * 0.83 + ph[2]));
  }
  const ek = Math.exp(-P.ds / P.decay);
  // bank erodibility: smooth value noise over the plain
  const NG = 64, gv = new Float64Array(NG * NG);
  for (let i = 0; i < gv.length; i++) gv[i] = R() * 2 - 1;
  const sm = (t) => t * t * (3 - 2 * t);
  const g = (a, b) => gv[((a % NG + NG) % NG) + ((b % NG + NG) % NG) * NG];
  const vn = (px, py) => {
    const fx = Math.floor(px), fy = Math.floor(py), ux = sm(px - fx), uy = sm(py - fy);
    return (g(fx, fy) * (1 - ux) + g(fx + 1, fy) * ux) * (1 - uy) + (g(fx, fy + 1) * (1 - ux) + g(fx + 1, fy + 1) * ux) * uy;
  };
  // A grid over the plain at 2 cells per W: the clay plugs, and which course
  // owns each place (for the numerals and the pointer).
  const GX = 2, X0 = -10, Y0 = -24, GW = Math.ceil((P.L + 20) * GX), GH = 48 * GX;
  const plug = new Float32Array(GW * GH).fill(1), own = new Int8Array(GW * GH).fill(-1);
  const cellOf = (px, py) => {
    const gx = Math.floor((px - X0) * GX), gy = Math.floor((py - Y0) * GX);
    return gx >= 0 && gy >= 0 && gx < GW && gy < GH ? gx + gy * GW : -1;
  };
  const erod = (px, py) => {
    const c = cellOf(px, py);
    return (c < 0 ? 1 : plug[c]) * Math.max(0.25, 1 + P.hetero * (0.5 * vn(px / 11, py / 11 + 11) + 0.32 * vn(px / 5, py / 5 + 3) + 0.18 * vn(px / 2.2 + 5, py / 2.2)));
  };
  const mark = (arr, xs, ys, val, r) => {
    for (let k = 0; k < xs.length; k++) {
      const cx = (xs[k] - X0) * GX, cy = (ys[k] - Y0) * GX;
      for (let a = Math.floor(cx - r); a <= Math.ceil(cx + r); a++) for (let b = Math.floor(cy - r); b <= Math.ceil(cy + r); b++) {
        if (a < 0 || b < 0 || a >= GW || b >= GH) continue;
        if ((a + .5 - cx) ** 2 + (b + .5 - cy) ** 2 <= r * r) arr[a + b * GW] = val;
      }
    }
  };

  let up = 0, upv = 0, step = 0;
  const total = P.spin + P.steps, per = P.steps / P.courses;
  const S = { frames: [], oxbows: [], labels: [], done: false, P, per, GX, X0, Y0, GW, GH, own: null, owns: [] };

  function advance() {
    n = x.length;
    const C = new Float64Array(n), tx = new Float64Array(n), ty = new Float64Array(n);
    for (let i = 1; i < n - 1; i++) {
      const dx = (x[i + 1] - x[i - 1]) / 2, dy = (y[i + 1] - y[i - 1]) / 2;
      const ddx = x[i + 1] - 2 * x[i] + x[i - 1], ddy = y[i + 1] - 2 * y[i] + y[i - 1];
      const l2 = dx * dx + dy * dy, l = Math.sqrt(l2);
      C[i] = (dx * ddy - dy * ddx) / (l2 * l);
      tx[i] = dx / l; ty[i] = dy / l;
    }
    // bends upstream of the map, felt through the kernel at the inflow
    upv += -up * 0.0016 - upv * 0.01 + (R() - .5) * P.force; up += upv;
    let s = up * P.decay, w = P.decay;
    for (let i = 1; i < n - 1; i++) {
      s = s * ek + C[i] * P.ds; w = w * ek + P.ds;
      const R1 = P.omega * C[i] + P.gamma * s / w;
      const k = Math.min(1, i * P.ds / 4, (n - 1 - i) * P.ds / 6) * erod(x[i], y[i]);
      let dx = R1 * ty[i] * P.dt * k, dy = -R1 * tx[i] * P.dt * k;
      const ay = Math.abs(y[i]);
      if (dy * y[i] > 0 && ay > P.ymax - P.soft) { const f = Math.max(0, (P.ymax - ay) / P.soft); dy *= f; dx *= .5 + .5 * f; }
      x[i] += dx; y[i] += dy;
      m[i] = R1 * k; // > 0: moving to its right, so the left bank is building a bar
    }
    m[0] = m[n - 1] = 0;
    if (P.smoothing > 0) {
      const ox = x.slice(), oy = y.slice();
      for (let i = 1; i < n - 1; i++) {
        x[i] += P.smoothing * ((ox[i - 1] + ox[i + 1]) / 2 - ox[i]);
        y[i] += P.smoothing * ((oy[i - 1] + oy[i + 1]) / 2 - oy[i]);
      }
    }
    [x, y, m] = resample(x, y, m, P.ds);
    n = x.length;
    // neck cut-off: two points far apart along the river within P.cut of each other
    const cell = P.cut, grid = new Map(), key = (cx, cy) => cx * 4096 + cy;
    for (let i = 0; i < n; i++) {
      const kk = key(Math.floor(x[i] / cell), Math.floor(y[i] / cell) + 64);
      let a = grid.get(kk); if (!a) grid.set(kk, a = []); a.push(i);
    }
    const gap = Math.round(P.gap / P.ds);
    let cut = null;
    for (let i = 0; i < n && !cut; i++) {
      const cx = Math.floor(x[i] / cell), cy = Math.floor(y[i] / cell) + 64;
      let bj = -1, bd = P.cut;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        const list = grid.get(key(cx + a, cy + b)); if (!list) continue;
        for (const j of list) if (j > i + gap) { const d = Math.hypot(x[j] - x[i], y[j] - y[i]); if (d < bd) { bd = d; bj = j; } }
      }
      if (bj > 0) cut = [i, bj];
    }
    if (cut) {
      const [i, j] = cut, ox = Array.from(x.subarray(i, j + 1)), oy = Array.from(y.subarray(i, j + 1));
      mark(plug, ox, oy, P.clay, 1.3);
      if (step >= P.spin) {
        const st = step - P.spin;
        S.oxbows.push({ step: st, course: Math.min(P.courses - 1, Math.floor(st / per)), x: Float32Array.from(ox), y: Float32Array.from(oy), len: (j - i) * P.ds });
      }
      const len = n - (j - i - 1), nx = new Float64Array(len), ny = new Float64Array(len), nm = new Float64Array(len);
      nx.set(x.subarray(0, i + 1)); nx.set(x.subarray(j), i + 1);
      ny.set(y.subarray(0, i + 1)); ny.set(y.subarray(j), i + 1);
      nm.set(m.subarray(0, i + 1)); nm.set(m.subarray(j), i + 1);
      [x, y, m] = resample(nx, ny, nm, P.ds);
      n = x.length;
    }
    if (step >= P.spin) {
      const st = step - P.spin, f = { x: Float32Array.from(x), y: Float32Array.from(y), m: Float32Array.from(m) };
      S.frames.push(f);
      if (st % 2 === 0) mark(own, f.x, f.y, Math.min(P.courses - 1, Math.floor(st / per)), 1.0);
      if ((st + 1) % per === 0) closeCourse(Math.round((st + 1) / per) - 1);
    }
    step++;
  }

  // At the end of each course: who owns each place, and where its numerals go.
  // Numerals stay where they were while their place is still theirs.
  function closeCourse(c) {
    S.owns[c] = own.slice();
    const dist = new Float32Array(GW * GH);
    for (let i = 0; i < dist.length; i++) dist[i] = own[i] < 0 ? 0 : 1e9;
    const pass = (i, j, d) => { if (j >= 0 && j < dist.length && own[j] !== own[i]) dist[i] = Math.min(dist[i], d); else if (j >= 0 && j < dist.length) dist[i] = Math.min(dist[i], dist[j] + d); };
    for (let b = 0; b < GH; b++) for (let a = 0; a < GW; a++) {
      const i = a + b * GW; if (own[i] < 0) continue;
      if (a > 0) pass(i, i - 1, 1); else dist[i] = Math.min(dist[i], 1);
      if (b > 0) pass(i, i - GW, 1); else dist[i] = Math.min(dist[i], 1);
      if (a > 0 && b > 0) pass(i, i - GW - 1, 1.41);
      if (a < GW - 1 && b > 0) pass(i, i - GW + 1, 1.41);
    }
    for (let b = GH - 1; b >= 0; b--) for (let a = GW - 1; a >= 0; a--) {
      const i = a + b * GW; if (own[i] < 0) continue;
      if (a < GW - 1) pass(i, i + 1, 1); else dist[i] = Math.min(dist[i], 1);
      if (b < GH - 1) pass(i, i + GW, 1); else dist[i] = Math.min(dist[i], 1);
      if (a < GW - 1 && b < GH - 1) pass(i, i + GW + 1, 1.41);
      if (a > 0 && b < GH - 1) pass(i, i + GW - 1, 1.41);
    }
    const keep = (S.labels.at(-1) || []).filter((l) => own[l.cell] === l.course && dist[l.cell] >= 2.2);
    const cand = [];
    for (let i = 0; i < dist.length; i++) if (own[i] >= 0 && dist[i] >= 2.6) cand.push(i);
    cand.sort((a, b) => dist[b] - dist[a]);
    const count = new Map();
    keep.forEach((l) => count.set(l.course, (count.get(l.course) || 0) + 1));
    const lab = keep.slice();
    for (const i of cand) {
      const e = own[i], a = i % GW, b = (i / GW) | 0;
      if ((count.get(e) || 0) >= 14) continue;
      if (lab.some((l) => (l.a - a) ** 2 + (l.b - b) ** 2 < (l.course === e ? 11 * 11 : 6 * 6))) continue;
      lab.push({ cell: i, a, b, course: e, x: X0 + (a + .5) / GX, y: Y0 + (b + .5) / GX });
      count.set(e, (count.get(e) || 0) + 1);
    }
    S.labels[c] = lab;
  }

  S.run = (budgetMs) => {
    const t0 = performance.now();
    while (step < total && performance.now() - t0 < budgetMs) advance();
    if (step >= total) S.done = true;
    return S.done;
  };
  S.total = P.steps;
  return S;
}

/* ─── drawing ──────────────────────────────────────────────────────────── */

function hexRGB(h) { if (!/^#[0-9a-f]{6}$/i.test(h)) return [243, 240, 232]; const v = parseInt(h.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
const rgba = (h, a) => { const [r, g, b] = hexRGB(h); return `rgba(${r},${g},${b},${a})`; };

// Print screens, as in the legend of Plate 22: sparse white hatch, wide
// stripes, dots or a dark stipple over the tint, at low contrast.
function makePattern(ctx, kind, colour, dpr) {
  const s = Math.max(1, dpr);
  const c = document.createElement('canvas'), x = c.getContext('2d');
  const tile = (w) => { c.width = c.height = Math.round(w * s); x.scale(s, s); x.fillStyle = colour; x.fillRect(0, 0, w, w); };
  const diag = (p, lw, a) => {
    x.strokeStyle = `rgba(250,248,240,${a})`; x.lineWidth = lw;
    for (let k = -1; k <= 1; k++) { x.beginPath(); x.moveTo(k * p - 2, p + 2); x.lineTo(k * p + p + 2, -2); x.stroke(); }
  };
  if (kind === 'hatch') { tile(16); diag(16, 2, .5); }
  else if (kind === 'wide') { tile(22); diag(22, 7, .34); }
  else if (kind === 'dots') {
    tile(12); x.fillStyle = 'rgba(250,248,240,.6)';
    for (const [a, b] of [[3, 3], [9, 9]]) { x.beginPath(); x.arc(a, b, 1.5, 0, 6.3); x.fill(); }
  } else if (kind === 'stipple') {
    tile(9); x.fillStyle = 'rgba(110,88,58,.34)';
    for (const [a, b] of [[2, 2], [6.5, 6.5]]) { x.beginPath(); x.arc(a, b, .75, 0, 6.3); x.fill(); }
  } else tile(4);
  const pat = ctx.createPattern(c, 'repeat');
  if (pat.setTransform) pat.setTransform(new DOMMatrix([1 / s, 0, 0, 1 / s, 0, 0]));
  return pat;
}

// Paper grain: a still speckle, light and dark, at device resolution.
function makeGrain(ctx, dpr, seed) {
  const n = 192, c = document.createElement('canvas'); c.width = c.height = n;
  const x = c.getContext('2d'), im = x.createImageData(n, n), d = im.data, R = rng(seed);
  for (let i = 0; i < n * n; i++) {
    const v = R(), dark = v < .5;
    d[i * 4] = dark ? 70 : 255; d[i * 4 + 1] = dark ? 58 : 252; d[i * 4 + 2] = dark ? 44 : 244;
    d[i * 4 + 3] = Math.floor((dark ? v * 2 : (v - .5) * 2) ** 2 * 26);
  }
  x.putImageData(im, 0, 0);
  const pat = ctx.createPattern(c, 'repeat');
  if (pat.setTransform) pat.setTransform(new DOMMatrix([1 / dpr, 0, 0, 1 / dpr, 0, 0]));
  return pat;
}

// The same screens for the legend's swatches, as CSS backgrounds.
function swatchCSS(k) {
  const w = 'rgba(250,248,240,.55)';
  switch (k.p) {
    case 'hatch': return `repeating-linear-gradient(-45deg, ${k.c} 0 4px, ${w} 4px 5.3px)`;
    case 'wide': return `repeating-linear-gradient(-45deg, ${k.c} 0 4px, rgba(250,248,240,.4) 4px 7px)`;
    case 'dots': return `radial-gradient(rgba(250,248,240,.7) .9px, transparent 1.2px) 0 0/5px 5px, ${k.c}`;
    case 'stipple': return `radial-gradient(rgba(110,88,58,.45) .6px, transparent .9px) 0 0/4px 4px, ${k.c}`;
    default: return k.c;
  }
}

export function meander(el, opts = {}) {
  const ds = el.dataset;
  const o = Object.assign({}, DEFAULTS);
  for (const k of Object.keys(DEFAULTS)) if (ds[k] != null && ds[k] !== '') o[k] = parseFloat(ds[k]);
  Object.assign(o, opts);
  o.courses = Math.max(2, Math.min(COURSES.length, Math.round(o.courses)));
  const reduced = calm.matches;

  el.classList.add('mr', 'is-live');
  if (!reduced) el.classList.add('mr-scroll');
  el.style.setProperty('--mr-runway', o.runway + 'svh');
  let stage = el.querySelector('.mr-stage');
  const madeStage = !stage;
  if (!stage) { stage = document.createElement('div'); stage.className = 'mr-stage'; el.appendChild(stage); }
  const cv = document.createElement('canvas');
  cv.className = 'mr-canvas'; cv.setAttribute('aria-hidden', 'true');
  stage.appendChild(cv);
  const ctx = cv.getContext('2d');
  const base = document.createElement('canvas'), bctx = base.getContext('2d');
  const tmp = document.createElement('canvas'), tctx = tmp.getContext('2d');
  const topo = document.createElement('canvas'), pctx = topo.getContext('2d');   // the grey base plate

  // the legend, in the map's own manner: the stages, earned one by one, and a scale
  const legend = document.createElement('div');
  legend.className = 'mr-legend'; legend.setAttribute('aria-hidden', 'true');
  legend.innerHTML = `<div class="mr-lg-head"><span>Stage</span><span>Legend</span></div><ol class="mr-lg-row"></ol>
    <div class="mr-scale"><div class="mr-scale-bar"></div><div class="mr-scale-n"><span>0</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span></div><div class="mr-scale-t">Scale of Miles</div></div>`;
  const row = legend.querySelector('ol');
  const items = [];
  for (let c = 0; c < o.courses; c++) {
    const li = document.createElement('li');
    li.innerHTML = `<i style="background:${swatchCSS(COURSES[c])}"></i><b>${c + 1}</b>`;
    row.appendChild(li); items.push(li);
  }
  const now = document.createElement('li'); now.className = 'mr-now';
  now.innerHTML = '<i><svg viewBox="0 0 22 12" aria-hidden="true"><path d="M0 3.2C5 1 8 1.4 11 3.4S17 5.6 22 3.6M0 9.2C5 7 8 7.4 11 9.4S17 11.6 22 9.6"/></svg></i><b></b>';
  row.appendChild(now);
  stage.appendChild(legend);

  const sim = createSim(o);
  const per = sim.per;
  // A few scroll lines per course (3-4), at uneven moments: the old inner banks.
  const picks = [];
  {
    const R = rng(o.seed * 131 + 7);
    for (let c = 0; c < o.courses; c++) {
      const n = 3 + (R() < .45 ? 1 : 0), a = [];
      for (let q = 0; q < n; q++) a.push(Math.round(c * per + per * (q + .12 + R() * .76) / n));
      picks.push(a);
    }
  }

  let W = 0, H = 0, dpr = 1, k = 1, orient = 'h', xc = o.L / 2, pats = [], grain = null, fonts = {};
  let built = -1;        // courses composited into base
  let tShow = 0, tTarget = 0, drawn = -1, drawnFade = -1, raf = 0, visible = true, killed = false;
  let lastStep = -1;

  // sim (x along the valley, y across) -> CSS px
  const PX = (x, y) => orient === 'h' ? (x - xc) * k + W / 2 : W / 2 - y * k;
  const PY = (x, y) => orient === 'h' ? y * k + H / 2 : (x - xc) * k + H / 2;
  const unproject = (px, py) => orient === 'h' ? [(px - W / 2) / k + xc, (py - H / 2) / k] : [(py - H / 2) / k + xc, (W / 2 - px) / k];

  function layout() {
    const r = stage.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
    dpr = Math.min(2, devicePixelRatio || 1);
    orient = W >= H * 1.02 ? 'h' : 'v';
    el.classList.toggle('mr-v', orient === 'v');
    // upright screens: the map stops above the legend, which sits in the margin under it
    if (orient === 'v') H = Math.max(200, H - legend.offsetHeight - 22);
    const long = orient === 'h' ? W : H, short = orient === 'h' ? H : W;
    k = orient === 'h' ? Math.min(long / o.span, short / (2 * (o.ymax + 0.6))) : Math.min(short / (2 * (o.ymax - 1)), long / 40);
    xc = o.L / 2 + (orient === 'h' ? 1 : 0);
    for (const c of [cv, base, tmp, topo]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    pats = COURSES.map((st) => makePattern(ctx, st.p, st.c, dpr));
    grain = makeGrain(ctx, dpr, o.seed);
    const cs = getComputedStyle(el);
    fonts = {
      serif: cs.getPropertyValue('--mr-serif').trim() || "'Cormorant Garamond', Georgia, serif",
      sans: cs.getPropertyValue('--mr-sans').trim() || "'Inter', 'Helvetica Neue', Arial, sans-serif",
    };
    legend.style.setProperty('--mr-mile', (k * 1.609) + 'px'); // W ~ 1 km
    built = -1; drawn = -1; hlKey = ''; topoDone = false;
  }

  /* paths */
  function line(c, xs, ys, i0 = 0, i1 = xs.length) {
    c.moveTo(PX(xs[i0], ys[i0]), PY(xs[i0], ys[i0]));
    for (let i = i0 + 1; i < i1; i++) c.lineTo(PX(xs[i], ys[i]), PY(xs[i], ys[i]));
  }
  // The bank on the side that is building a point bar (inside of the bend).
  function scrollLine(c, f, minM) {
    const n = f.x.length; let open = false;
    for (let i = 1; i < n - 1; i++) {
      const mv = f.m[i];
      if (Math.abs(mv) < minM) { open = false; continue; }
      const tx = f.x[i + 1] - f.x[i - 1], ty = f.y[i + 1] - f.y[i - 1], l = Math.hypot(tx, ty) || 1;
      const sgn = mv > 0 ? 1 : -1; // left bank (-ty, tx) when moving right
      const bx = f.x[i] - sgn * ty / l * 0.46, by = f.y[i] + sgn * tx / l * 0.46;
      const X = PX(bx, by), Y = PY(bx, by);
      if (!open || (i > 1 && Math.sign(f.m[i - 1]) !== sgn)) { c.moveTo(X, Y); open = true; } else c.lineTo(X, Y);
    }
  }
  const bankW = () => k * 0.78;
  function sweepPath(c, a, b, every) {
    c.beginPath();
    for (let s = a; s <= b; s += every) { const f = sim.frames[s]; line(c, f.x, f.y); }
    if ((b - a) % every) { const f = sim.frames[b]; line(c, f.x, f.y); }
  }

  // A polyline offset sideways by d (in W), e.g. a bank of a channel.
  function offsetLine(c, xs, ys, d) {
    const n = xs.length;
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      const tx = xs[b] - xs[a], ty = ys[b] - ys[a], l = Math.hypot(tx, ty) || 1;
      const x = xs[i] - ty / l * d, y = ys[i] + tx / l * d;
      i ? c.lineTo(PX(x, y), PY(x, y)) : c.moveTo(PX(x, y), PY(x, y));
    }
  }
  const resetCtx = (c) => { c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; };

  /* One course, printed. Three passes, as from three plates:
     1. where it reworked the ground, the older inks are lifted two-thirds of the way to paper;
     2. its tint plate, flat or screened, with grain, multiplied over what is there;
     3. its line plate (outline, a few scroll lines, the scars of its oxbows),
        multiplied too, a hair out of register with the tint. */
  function drawCourse(c) {
    const a = c * per, b = Math.min(sim.frames.length - 1, (c + 1) * per - 1), st = COURSES[c], bw = bankW();
    const sweep = (c2) => {   // the course's swept ground, as a mask
      c2.setTransform(dpr, 0, 0, dpr, 0, 0); c2.lineCap = c2.lineJoin = 'round';
      sweepPath(c2, a, b, 3); c2.strokeStyle = '#000'; c2.lineWidth = bw; c2.stroke(); c2.setTransform(1, 0, 0, 1, 0, 0);
    };
    // 1. erase: the older deposits it swept through are gone; back to bare sheet
    resetCtx(tctx); tctx.clearRect(0, 0, tmp.width, tmp.height);
    sweep(tctx); tctx.globalCompositeOperation = 'source-in';
    paperFill(tctx);
    resetCtx(bctx); bctx.drawImage(tmp, 0, 0);
    // 2. tint
    resetCtx(tctx); tctx.clearRect(0, 0, tmp.width, tmp.height);
    sweep(tctx); tctx.globalCompositeOperation = 'source-in';
    tctx.setTransform(dpr, 0, 0, dpr, 0, 0); tctx.fillStyle = pats[c]; tctx.fillRect(0, 0, W, H);
    tctx.globalCompositeOperation = 'source-atop'; tctx.fillStyle = grain; tctx.fillRect(0, 0, W, H);
    resetCtx(bctx); bctx.globalCompositeOperation = 'multiply'; bctx.drawImage(tmp, 0, 0);
    // 3. lines
    resetCtx(tctx); tctx.clearRect(0, 0, tmp.width, tmp.height);
    tctx.setTransform(dpr, 0, 0, dpr, 0, 0); tctx.lineCap = tctx.lineJoin = 'round';
    sweepPath(tctx, a, b, 3); tctx.strokeStyle = rgba(st.d, .62); tctx.lineWidth = bw + 1.7; tctx.stroke();
    tctx.globalCompositeOperation = 'destination-out'; sweep(tctx);
    tctx.globalCompositeOperation = 'source-over'; tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    tctx.beginPath();
    for (const s of picks[c]) if (s < sim.frames.length) scrollLine(tctx, sim.frames[s], 0.06);
    tctx.strokeStyle = rgba(st.d, .5); tctx.lineWidth = .6; tctx.stroke();
    tctx.beginPath();
    for (const ob of sim.oxbows) if (ob.course === c) { offsetLine(tctx, ob.x, ob.y, .34); offsetLine(tctx, ob.x, ob.y, -.34); }
    tctx.strokeStyle = rgba(st.d, .6); tctx.lineWidth = .65; tctx.stroke();
    const off = (c % 3 - 1) * .55 + .35, off2 = ((c * 7) % 5 - 2) * .25;
    resetCtx(bctx); bctx.globalCompositeOperation = 'multiply';
    bctx.drawImage(tmp, Math.round(off * dpr * 2) / 2, Math.round(off2 * dpr * 2) / 2);
    resetCtx(bctx);
  }

  // Pointer over an old course: the rest of the plain recedes under a wash of
  // paper and that course stands out. hl holds the course's visible part of base.
  let hl = null, hlKey = '', hover = -1, hlA = 0, hlShown = -1;
  function buildHighlight(e, cNow) {
    const key = `${e}:${cNow}:${W}x${H}`;
    if (key === hlKey) return; hlKey = key;
    if (!hl) hl = document.createElement('canvas');
    hl.width = cv.width; hl.height = cv.height;
    const h = hl.getContext('2d');
    h.setTransform(dpr, 0, 0, dpr, 0, 0); h.lineCap = h.lineJoin = 'round';
    h.strokeStyle = '#000'; h.lineWidth = bankW() + 1.6;
    sweepPath(h, e * per, (e + 1) * per - 1, 3); h.stroke();
    h.globalCompositeOperation = 'destination-out';
    for (let c = e + 1; c < cNow; c++) { sweepPath(h, c * per, (c + 1) * per - 1, 3); h.stroke(); }
    h.globalCompositeOperation = 'source-in';
    h.setTransform(1, 0, 0, 1, 0, 0); h.drawImage(base, 0, 0);
    h.globalCompositeOperation = 'source-over';
  }

  /* The grey topographic base the colours are printed on, drawn once:
     paper grain, an irregular survey grid of townships and sections, bayous,
     swamp, a railroad, a few towns. Positions are in valley coordinates, from
     the seed, so the base turns with the map. */
  // The bare sheet: paper, its own buff, a still grain (in device pixels).
  const BUFF = 'rgba(232,214,174,.2)';
  function sheetColour() {
    const [r, g, b] = hexRGB(getPaper());
    return `rgb(${Math.round(r * .8 + 46.4)},${Math.round(g * .8 + 42.8)},${Math.round(b * .8 + 34.8)})`;
  }
  function paperFill(c2) {
    c2.save(); c2.setTransform(dpr, 0, 0, dpr, 0, 0);
    const op = c2.globalCompositeOperation;
    c2.fillStyle = sheetColour(); c2.fillRect(0, 0, W, H);
    if (op === 'source-in') c2.globalCompositeOperation = 'source-atop';
    c2.fillStyle = grain; c2.globalAlpha *= .7; c2.fillRect(0, 0, W, H);
    c2.restore();
  }
  function underlay() {
    resetCtx(bctx); bctx.clearRect(0, 0, base.width, base.height);
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paperFill(bctx);
    // the linework goes on its own plate, printed over the colours (multiply), so it shows through them
    if (!topoDone) { topoDone = true; resetCtx(pctx); pctx.clearRect(0, 0, topo.width, topo.height); topoPlate(pctx); }
  }
  let topoDone = false;
  function topoPlate(bctx) {
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    bctx.lineCap = bctx.lineJoin = 'round';
    const R = rng(o.seed * 977 + 3), ink = (a) => `rgba(${BASE_INK},${a})`;
    const th = 8 * Math.PI / 180, ct = Math.cos(th), sn = Math.sin(th);
    const toXY = (u, v) => [u * ct - v * sn, u * sn + v * ct];
    const seg = (c, u0, v0, u1, v1) => { const [a, b] = toXY(u0, v0), [x2, y2] = toXY(u1, v1); c.moveTo(PX(a, b), PY(a, b)); c.lineTo(PX(x2, y2), PY(x2, y2)); };
    // survey: township rows 6 miles (9.66 W) deep, each row jogged along a correction line
    const T = 9.66, S = T / 6;
    const secs = new Path2D(), twps = new Path2D(), nums = [];
    for (let v = -30; v < 30; v += T) {
      const jog = (R() - .5) * 3.2, skew = (R() - .5) * .03;
      seg(twps, -20, v, o.L + 20, v);
      for (let u = -20 + jog; u < o.L + 20; u += T) {
        seg(twps, u, v, u + skew * T, v + T);
        for (let r = 0; r < 6; r++) for (let q = 0; q < 6; q++) if (R() < (Math.abs(toXY(u + (q + .5) * S, v + (r + .5) * S)[1]) < 15 ? .45 : .08)) {
          nums.push([toXY(u + (q + .5) * S, v + (r + .5) * S), r % 2 ? r * 6 + q + 1 : r * 6 + 6 - q]);
        }
        for (let q = 1; q < 6; q++) {
          const w = (R() - .5) * .12;
          seg(secs, u + q * S + w, v, u + q * S + w + skew * T, v + T);
          seg(secs, u, v + q * S + w, u + T, v + q * S + w);
        }
      }
    }
    bctx.strokeStyle = ink(.085); bctx.lineWidth = .5; bctx.stroke(secs);
    bctx.strokeStyle = ink(.2); bctx.lineWidth = .7; bctx.stroke(twps);
    // section numbers, and spot heights, small
    const nf = Math.max(4.6, Math.min(5.2, k * .25));
    bctx.font = `500 ${nf}px ${fonts.sans}`; bctx.textAlign = 'center'; bctx.textBaseline = 'middle';
    bctx.fillStyle = ink(.2);
    for (const [[x, y], nn] of nums) { const X = PX(x, y), Y = PY(x, y); if (X > -9 && Y > -9 && X < W + 9 && Y < H + 9) bctx.fillText(String(nn), X, Y); }
    bctx.fillStyle = ink(.32);
    for (let q = 0; q < 34; q++) {
      const x = R() * o.L, y = (R() - .5) * 46, X = PX(x, y), Y = PY(x, y);
      bctx.fillText('×', X, Y); bctx.fillText(String(148 + Math.floor(R() * 30)), X + nf * 2, Y);
    }
    // a few contours, dotted, wandering with the old natural levees
    bctx.setLineDash([1.2, 2.4]); bctx.strokeStyle = ink(.3); bctx.lineWidth = .6;
    for (let q = 0; q < 7; q++) {
      let x = R() * o.L, y = (R() - .5) * 44, a = (R() < .5 ? 0 : Math.PI) + (R() - .5), da = 0;
      bctx.beginPath(); bctx.moveTo(PX(x, y), PY(x, y));
      for (let i = 0; i < 90; i++) { da = da * .9 + (R() - .5) * .3; a += da; x += Math.cos(a) * .5; y += Math.sin(a) * .5; bctx.lineTo(PX(x, y), PY(x, y)); }
      bctx.stroke();
    }
    bctx.setLineDash([]);
    // bayous and small streams: slow random walks down the plain
    const streams = [];
    for (let q = 0; q < 14; q++) {
      let x = R() * o.L, y = (R() < .5 ? -1 : 1) * (3 + R() * 20), a = (R() < .5 ? 0 : Math.PI) + (R() - .5) * 1.2, da = 0;
      const xs = [], ys = [], n = 40 + Math.floor(R() * 70);
      for (let i = 0; i < n; i++) {
        xs.push(x); ys.push(y);
        da = da * .86 + (R() - .5) * .22; a += da;
        if (Math.abs(y) > 22) a += (y > 0 ? 1 : -1) * Math.sign(Math.sin(a)) * .15;
        x += Math.cos(a) * .55; y += Math.sin(a) * .55;
      }
      streams.push([xs, ys]);
      bctx.beginPath(); line(bctx, xs, ys); bctx.strokeStyle = ink(q < 4 ? .32 : .22); bctx.lineWidth = q < 4 ? .85 : .6; bctx.stroke();
    }
    // swamp: tufts in a few low places
    const tuft = Math.max(3.5, Math.min(6, k * .3));
    bctx.beginPath();
    for (let q = 0; q < 9; q++) {
      const cx = R() * o.L, cy = (R() - .5) * 40;
      for (let i = 0; i < 9; i++) {
        const X = PX(cx + (R() - .5) * 5, cy + (R() - .5) * 3), Y = PY(cx + (R() - .5) * 5, cy + (R() - .5) * 3);
        bctx.moveTo(X - tuft * .5, Y); bctx.lineTo(X + tuft * .5, Y);
        bctx.moveTo(X, Y); bctx.lineTo(X, Y - tuft * .55);
        bctx.moveTo(X - tuft * .28, Y); bctx.lineTo(X - tuft * .42, Y - tuft * .38);
        bctx.moveTo(X + tuft * .28, Y); bctx.lineTo(X + tuft * .42, Y - tuft * .38);
      }
    }
    bctx.strokeStyle = ink(.3); bctx.lineWidth = .55; bctx.stroke();
    // a railroad along the high ground, and a branch across the valley
    const rail = (xs, ys) => {
      bctx.beginPath(); line(bctx, xs, ys); bctx.strokeStyle = ink(.36); bctx.lineWidth = .8; bctx.stroke();
      bctx.beginPath();
      let acc = 0;
      for (let i = 1; i < xs.length; i++) {
        const X0 = PX(xs[i - 1], ys[i - 1]), Y0 = PY(xs[i - 1], ys[i - 1]), X1 = PX(xs[i], ys[i]), Y1 = PY(xs[i], ys[i]);
        const l = Math.hypot(X1 - X0, Y1 - Y0) || 1, nx = -(Y1 - Y0) / l, ny = (X1 - X0) / l;
        for (acc += l; acc > 5; acc -= 5) { const t = 1 - (acc - 5) / l, X = X0 + (X1 - X0) * t, Y = Y0 + (Y1 - Y0) * t; bctx.moveTo(X - nx * 2, Y - ny * 2); bctx.lineTo(X + nx * 2, Y + ny * 2); }
      }
      bctx.lineWidth = .6; bctx.stroke();
    };
    const ph = R() * 6, rx = [], ry = [], bx = [], by = [];
    for (let x = -10; x <= o.L + 10; x += .5) { rx.push(x); ry.push(-16.8 + 1.3 * Math.sin(x / 15 + ph)); }
    rail(rx, ry);
    for (let t = 0; t <= 1; t += .01) { bx.push(o.L * .62 + t * 15 + 2 * Math.sin(t * 3)); by.push(-16.8 + t * 40); }
    rail(bx, by);
    // towns: a dot and a name in small roman capitals
    const fs = Math.max(8, Math.min(10, k * .45));
    bctx.font = `600 ${fs}px ${fonts.serif}`; bctx.textBaseline = 'middle'; bctx.textAlign = 'left';
    const at = [[o.L * .3, -16.8], [o.L * .5, -16.8], [o.L * .7, 6], [o.L * .42, 18.5], [o.L * .62, -16.8 + .3 * 40]];
    at.forEach(([x, y0], i) => {
      const y = i < 2 ? -16.8 + 1.3 * Math.sin(x / 15 + ph) : y0;
      const X = PX(x, y), Y = PY(x, y);
      bctx.fillStyle = ink(.55); bctx.beginPath(); bctx.arc(X, Y, 1.7, 0, 6.3); bctx.fill();
      bctx.fillStyle = ink(.5);
      bctx.fillText(TOWNS[(i + o.seed) % TOWNS.length].toUpperCase().split('').join(String.fromCharCode(8202)), X + 4, Y - fs * .7);
    });
    // two bayous named, in italic along their course
    bctx.fillStyle = ink(.5);
    for (let q = 0; q < 2; q++) textOnPath(bctx, streams[q][0], streams[q][1], BAYOUS[(q + o.seed) % BAYOUS.length], Math.max(9, Math.min(11, k * .5)), .5, false);
  }

  function ensureBase(c) {
    if (c === built) return;
    const t0 = performance.now();
    rebuild(c);
    rebuildMs = performance.now() - t0;
  }
  function rebuild(c) {
    if (c < built || built < 0) { underlay(); built = 0; }
    while (built < c) drawCourse(built++);
  }

  /* the live parts: oxbow lakes, the fresh sand of this course, the levees, the river */
  function drawLake(ob, age) {
    const lakeT = smooth(o.lake * .35, o.swamp, age);         // 0 open water -> 1 swamp
    const fade = 1 - smooth(o.swamp * .7, o.swamp, age);        // gone into the scar
    if (fade <= 0) return;
    const n = ob.x.length, plugEnd = 0.08 + 0.22 * smooth(0, o.swamp, age);
    const half = 0.38 * (1 - 0.3 * lakeT);
    const L = [], Rr = [];
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1), e = Math.min(u, 1 - u);
      const wv = half * smooth(plugEnd * .5, plugEnd + .12, e);
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      const tx = ob.x[b] - ob.x[a], ty = ob.y[b] - ob.y[a], l = Math.hypot(tx, ty) || 1;
      L.push([ob.x[i] - ty / l * wv, ob.y[i] + tx / l * wv]); Rr.push([ob.x[i] + ty / l * wv, ob.y[i] - tx / l * wv]);
    }
    const outline = () => {
      ctx.beginPath();
      L.forEach(([a, b], i) => i ? ctx.lineTo(PX(a, b), PY(a, b)) : ctx.moveTo(PX(a, b), PY(a, b)));
      for (let i = n - 1; i >= 0; i--) ctx.lineTo(PX(Rr[i][0], Rr[i][1]), PY(Rr[i][0], Rr[i][1]));
      ctx.closePath();
    };
    outline();
    ctx.globalAlpha = fade; ctx.fillStyle = sheetColour(); ctx.fill();
    ctx.globalAlpha = fade * .7; ctx.fillStyle = grain; ctx.fill();
    if (lakeT > 0) { ctx.globalAlpha = fade * smooth(.15, .9, lakeT) * .8; ctx.fillStyle = '#dcdcc2'; ctx.fill(); }
    ctx.globalAlpha = fade;
    ctx.strokeStyle = `rgba(58,46,38,${.72 - .35 * lakeT})`; ctx.lineWidth = Math.max(.7, Math.min(.9, k * .045));
    ctx.setLineDash(lakeT > .55 ? [2.2, 2.2] : []); ctx.stroke(); ctx.setLineDash([]);
    // one waterline inside the shore while it is open water
    if (lakeT < .7 && k > 9) {
      ctx.beginPath();
      for (let i = 0; i < n; i++) { const lx = ob.x[i] + (L[i][0] - ob.x[i]) * .5, ly = ob.y[i] + (L[i][1] - ob.y[i]) * .5; i ? ctx.lineTo(PX(lx, ly), PY(lx, ly)) : ctx.moveTo(PX(lx, ly), PY(lx, ly)); }
      for (let i = 0; i < n; i++) { const lx = ob.x[i] + (Rr[i][0] - ob.x[i]) * .5, ly = ob.y[i] + (Rr[i][1] - ob.y[i]) * .5; i ? ctx.lineTo(PX(lx, ly), PY(lx, ly)) : ctx.moveTo(PX(lx, ly), PY(lx, ly)); }
      ctx.strokeStyle = `rgba(52,86,110,${.3 * (1 - lakeT / .7)})`; ctx.lineWidth = .5; ctx.stroke();
    }
    // marsh tufts as it fills
    if (lakeT > .3) {
      ctx.strokeStyle = `rgba(58,70,48,${.6 * smooth(.3, .8, lakeT)})`; ctx.lineWidth = .6; ctx.beginPath();
      const t = Math.max(3.5, k * .3);
      for (let i = 3; i < n - 3; i += 5) {
        const X = PX(ob.x[i], ob.y[i]), Y = PY(ob.x[i], ob.y[i]) + t * .2;
        ctx.moveTo(X - t * .5, Y); ctx.lineTo(X + t * .5, Y);
        ctx.moveTo(X, Y); ctx.lineTo(X, Y - t * .55);
        ctx.moveTo(X - t * .28, Y); ctx.lineTo(X - t * .42, Y - t * .38);
        ctx.moveTo(X + t * .28, Y); ctx.lineTo(X + t * .42, Y - t * .38);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (ob.name && lakeT < .85) textOnPath(ctx, ob.x, ob.y, ob.name, Math.max(10.5, Math.min(13, k * .62)), fade * (1 - smooth(.5, .85, lakeT)), true);
  }

  // Italic lettering set along a curve's straightest middle stretch, reading left to right.
  function textOnPath(c, xs, ys, text, fs, alpha, halo) {
    const n = xs.length;
    c.font = `italic 500 ${fs}px ${fonts.serif}`;
    const pts = []; let s = 0;
    for (let i = 0; i < n; i++) {
      const X = PX(xs[i], ys[i]), Y = PY(xs[i], ys[i]);
      if (i) s += Math.hypot(X - pts[i - 1][0], Y - pts[i - 1][1]);
      pts.push([X, Y, s]);
    }
    const chars = [...text], track = fs * .06;
    const widths = chars.map((ch) => c.measureText(ch).width + track), tw = widths.reduce((a, b) => a + b, 0);
    if (tw > s * .58) return;
    const at = (d) => {
      let j = 1; while (j < n - 1 && pts[j][2] < d) j++;
      const u = clamp((d - pts[j - 1][2]) / (pts[j][2] - pts[j - 1][2] || 1));
      return [pts[j - 1][0] + (pts[j][0] - pts[j - 1][0]) * u, pts[j - 1][1] + (pts[j][1] - pts[j - 1][1]) * u,
        Math.atan2(pts[j][1] - pts[j - 1][1], pts[j][0] - pts[j - 1][0])];
    };
    let best = s / 2 - tw / 2, bestTurn = 1e9;
    for (let a0 = s * .2; a0 + tw < s * .8; a0 += 3) {
      let turn = 0, prev = at(a0)[2];
      for (let q = 1; q <= 6; q++) { const g = at(a0 + tw * q / 6)[2]; let d = Math.abs(g - prev); if (d > Math.PI) d = 2 * Math.PI - d; turn += d; prev = g; }
      if (turn < bestTurn - .02) { bestTurn = turn; best = a0; }
    }
    if (bestTurn > 2.6) return;
    const [x0, y0] = at(best), [x1, y1] = at(best + tw);
    if (x0 < -40 || x0 > W + 40 || y0 < -40 || y0 > H + 40) return;
    const rev = x1 < x0;
    c.fillStyle = `rgba(28,40,56,${alpha})`; c.textAlign = 'center'; c.textBaseline = 'middle';
    if (halo) { c.strokeStyle = rgba(getPaper(), .8 * alpha); c.lineWidth = 2.4; c.lineJoin = 'round'; }
    let d = 0;
    for (let q = 0; q < chars.length; q++) {
      const w = widths[q], mid = rev ? best + tw - d - w / 2 : best + d + w / 2;
      let [X, Y, ang] = at(mid);
      if (rev) ang += Math.PI;
      c.save(); c.translate(X, Y); c.rotate(ang);
      if (halo) c.strokeText(chars[q], 0, fs * .04);
      c.fillText(chars[q], 0, fs * .04); c.restore();
      d += w;
    }
  }

  // Levees: a hachured line each side, a little outside the present meander belt.
  function drawLevees(f) {
    const n = f.x.length, x0 = -4, x1 = o.L + 4, dx = .5, m = Math.round((x1 - x0) / dx) + 1;
    const hi = new Float32Array(m).fill(-1e9), lo = new Float32Array(m).fill(1e9);
    for (let i = 0; i < n; i++) {
      const g = Math.round((f.x[i] - x0) / dx);
      for (let q = g - 8; q <= g + 8; q++) if (q >= 0 && q < m) { if (f.y[i] > hi[q]) hi[q] = f.y[i]; if (f.y[i] < lo[q]) lo[q] = f.y[i]; }
    }
    const avg = (arr, sign) => {
      const out = new Float32Array(m);
      for (let q = 0; q < m; q++) { let s = 0, c = 0; for (let r = q - 5; r <= q + 5; r++) if (r >= 0 && r < m && Math.abs(arr[r]) < 1e8) { s += arr[r]; c++; } out[q] = c ? s / c + sign * 1.6 : NaN; }
      return out;
    };
    const tick = Math.max(2, k * .14);
    for (const [arr, sign] of [[avg(hi, 1), 1], [avg(lo, -1), -1]]) {
      const pts = [];
      for (let q = 0; q < m; q++) if (!isNaN(arr[q])) pts.push([PX(x0 + q * dx, arr[q]), PY(x0 + q * dx, arr[q]), x0 + q * dx, arr[q]]);
      if (pts.length < 2) continue;
      ctx.beginPath(); pts.forEach(([X, Y], i) => i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y));
      ctx.strokeStyle = 'rgba(60,52,46,.42)'; ctx.lineWidth = .7; ctx.stroke();
      ctx.beginPath();
      let acc = 0;
      for (let i = 1; i < pts.length; i++) {
        const [Xa, Ya] = pts[i - 1], [Xb, Yb] = pts[i], l = Math.hypot(Xb - Xa, Yb - Ya) || 1;
        // the land side, away from the river: in valley terms, further out in y
        const [ox, oy] = [PX(pts[i][2], pts[i][3] + sign) - Xb, PY(pts[i][2], pts[i][3] + sign) - Yb], ol = Math.hypot(ox, oy) || 1;
        for (acc += l; acc > 4; acc -= 4) { const t = 1 - (acc - 4) / l, X = Xa + (Xb - Xa) * t, Y = Ya + (Yb - Ya) * t; ctx.moveTo(X, Y); ctx.lineTo(X + ox / ol * tick, Y + oy / ol * tick); }
      }
      ctx.lineWidth = .5; ctx.stroke();
    }
  }

  // The present river as Fisk prints it: paper inside, fine wavering banklines,
  // a dashed thalweg, and its name in widely spaced capitals along the channel.
  function drawRiver(f) {
    const bw = bankW(), n = f.x.length;
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.beginPath(); line(ctx, f.x, f.y);
    ctx.strokeStyle = sheetColour(); ctx.lineWidth = bw + 1.6; ctx.stroke();   // the sheet's own buff, nothing whiter
    ctx.strokeStyle = grain; ctx.globalAlpha = .7; ctx.stroke(); ctx.globalAlpha = 1;
    ctx.setLineDash([Math.max(3, k * .32), Math.max(2.2, k * .2)]);
    ctx.strokeStyle = 'rgba(70,58,48,.45)'; ctx.lineWidth = .5; ctx.stroke(); ctx.setLineDash([]);
    const X = new Float32Array(n), Y = new Float32Array(n);
    for (let i = 0; i < n; i++) { X[i] = PX(f.x[i], f.y[i]); Y[i] = PY(f.x[i], f.y[i]); }
    ctx.beginPath();
    for (const side of [1, -1]) {
      for (let i = 0; i < n; i++) {
        const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1), tx = X[b] - X[a], ty = Y[b] - Y[a], l = Math.hypot(tx, ty) || 1;
        const wob = .26 * Math.sin(f.x[i] * 2.3 + f.y[i] * 1.7 + side) + .22 * Math.sin(f.x[i] * 5.9 - f.y[i] * 4.3 + 2 * side);
        const d = side * (bw / 2 + wob);
        const px = X[i] - ty / l * d, py = Y[i] + tx / l * d;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
    }
    ctx.strokeStyle = 'rgba(58,46,38,.72)'; ctx.lineWidth = Math.max(.7, Math.min(.9, k * .045)); ctx.stroke();
    letterRiver(f, X, Y);
  }

  const NAME = 'MISSISSIPPI RIVER';
  const letterY = []; let letterStep = -999, drawStep = 0;
  function letterRiver(f, X, Y) {
    const fs = Math.max(8, Math.min(11.5, k * .56)), n = f.x.length;
    const step = Math.max(1.3, fs * 2.3 / k), slots = [...NAME].reduce((a, ch) => a + (ch === ' ' ? 2.5 : 1), 0) - 1;
    let x = xc + (orient === 'h' ? 9 : 0) - slots * step / 2;
    ctx.font = `600 ${fs}px ${fonts.serif}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(52,42,36,.78)';
    const fresh = Math.abs(drawStep - letterStep) > 40;   // a jump: forget where the letters were
    let li = -1;
    for (const ch of NAME) {
      if (ch === ' ') { x += step * 2.5; continue; }
      li++;
      const prev = fresh ? null : letterY[li];
      let best = -1, bs = -1e9, bu = 0;
      for (let j = 0; j < n - 1; j++) {
        const xa = f.x[j], xb = f.x[j + 1];
        if ((xa - x) * (xb - x) > 0 || xa === xb) continue;
        const u = (x - xa) / (xb - xa), tx = xb - xa, ty = f.y[j + 1] - f.y[j], l = Math.hypot(tx, ty);
        const yy = f.y[j] + (f.y[j + 1] - f.y[j]) * u;
        // prefer the down-valley crossing near the middle, and above all the one it used last frame
        const score = tx / l - .04 * Math.abs(yy) - (prev == null ? 0 : .35 * Math.min(4, Math.abs(yy - prev)));
        if (score > bs) { bs = score; best = j; bu = u; }
      }
      letterY[li] = best >= 0 ? f.y[best] + (f.y[best + 1] - f.y[best]) * bu : null;
      if (best >= 0) {
        const px = X[best] + (X[best + 1] - X[best]) * bu, py = Y[best] + (Y[best + 1] - Y[best]) * bu;
        let ang = Math.atan2(Y[best + 1] - Y[best], X[best + 1] - X[best]);
        if (orient === 'h' ? Math.cos(ang) < 0 : Math.sin(ang) < 0) ang += Math.PI;  // keep letters upright
        ctx.save(); ctx.translate(px, py); ctx.rotate(ang); ctx.fillText(ch, 0, fs * .06); ctx.restore();
      }
      x += step;
    }
    letterStep = drawStep;
  }

  function freshCovers(l, step) {
    const a = Math.floor((step + 1) / per) * per;
    for (let s2 = a; s2 <= step; s2 += 6) {
      const f = sim.frames[s2];
      for (let i = 0; i < f.x.length; i += 2) if ((f.x[i] - l.x) ** 2 + (f.y[i] - l.y) ** 2 < .6) return true;
    }
    return false;
  }
  let renderMs = 0, rebuildMs = 0;
  function render(t) {
    const t0 = performance.now();
    renderBody(t);
    renderMs = performance.now() - t0;
  }
  function renderBody(t) {
    const fN = sim.frames.length;
    if (!fN) return;
    const step = Math.min(fN - 1, Math.max(0, Math.round(t)));
    const cNow = Math.min(o.courses, Math.floor((step + 1) / per));  // completed courses
    const fadeLen = per * .22;
    const since = step + 1 - cNow * per;                             // steps since the last course closed
    const fade = cNow > 0 && since < fadeLen && step < sim.total - 1 ? 1 - since / fadeLen : 0;
    ensureBase(cNow);
    resetCtx(ctx); ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(base, 0, 0);
    if (hover >= 0 && hover < cNow) hlShown = hover;
    if (hlA > .002 && hlShown >= 0 && hlShown < cNow) {
      buildHighlight(hlShown, cNow);
      ctx.globalAlpha = hlA * .62; ctx.fillStyle = getPaper(); ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.globalAlpha = hlA; ctx.drawImage(hl, 0, 0); ctx.globalAlpha = 1;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = ctx.lineJoin = 'round';
    const pencil = (a, b) => {
      ctx.beginPath();
      for (const st of picks[Math.floor(a / per)] || []) if (st >= a && st <= b) scrollLine(ctx, sim.frames[st], 0.06);
      ctx.strokeStyle = 'rgba(52,52,56,.4)'; ctx.lineWidth = .55; ctx.stroke();
    };
    // fresh ground, not yet a mapped stage: bare sheet over whatever it reworked
    const bare = (a, b, alpha) => {
      sweepPath(ctx, a, b, 3); ctx.lineWidth = bankW();
      ctx.globalAlpha = alpha; ctx.strokeStyle = sheetColour(); ctx.stroke();
      ctx.globalAlpha = alpha * .7; ctx.strokeStyle = grain; ctx.stroke();
      ctx.globalAlpha = alpha; pencil(a, b); ctx.globalAlpha = 1;
    };
    // the stage just closed, its colour arriving
    if (fade > 0) bare((cNow - 1) * per, cNow * per - 1, fade);
    // this stage so far
    if (cNow < o.courses && step > cNow * per) bare(cNow * per, step, 1);
    // the grey base plate, over everything printed so far
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'multiply'; ctx.drawImage(topo, 0, 0); ctx.globalCompositeOperation = 'source-over';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // numerals, in a plain gothic, as on the plates; some of them circled
    if (cNow > 0) {
      const fs = Math.max(8.5, Math.min(11.5, k * .52));
      ctx.font = `500 ${fs}px ${fonts.sans}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const curOwn = cNow < o.courses && step > cNow * per;
      for (const l of sim.labels[cNow - 1] || []) {
        const X = PX(l.x, l.y), Y = PY(l.x, l.y);
        if (X < -10 || Y < -10 || X > W + 10 || Y > H + 10) continue;
        // hidden once this stage's fresh ground has covered it
        if (curOwn && freshCovers(l, step)) continue;
        const d = COURSES[l.course].d;
        if ((l.a * 7 + l.b * 3) % 3 === 0) {
          ctx.beginPath(); ctx.arc(X, Y, fs * .92, 0, 6.3);
          ctx.fillStyle = rgba(getPaper(), .72); ctx.fill();
          ctx.strokeStyle = rgba(d, .8); ctx.lineWidth = .7; ctx.stroke();
        }
        ctx.fillStyle = rgba(d, .92);
        ctx.fillText(String(l.course + 1), X, Y + fs * .04);
      }
    }
    // lakes, open or filling
    const live = sim.oxbows.filter((ob) => ob.step <= step && step - ob.step < o.swamp);
    for (const ob of live) drawLake(ob, step - ob.step);
    drawLevees(sim.frames[step]);
    drawStep = step;
    drawRiver(sim.frames[step]);
    // legend: stages earned so far
    if (cNow !== drawnC) {
      items.forEach((li, i) => li.classList.toggle('is-on', i < cNow));
      now.querySelector('b').textContent = String(Math.min(o.courses, cNow) + 1);
      now.classList.toggle('is-on', true);
      drawnC = cNow;
    }
    // events, forward only
    if (lastStep >= 0 && step > lastStep) {
      for (const ob of sim.oxbows) if (ob.step > lastStep && ob.step <= step) el.dispatchEvent(new CustomEvent('meander:cutoff', { bubbles: true, detail: { step: ob.step, length: ob.len } }));
      const cPrev = Math.floor((lastStep + 1) / per);
      for (let c = cPrev; c < cNow; c++) el.dispatchEvent(new CustomEvent('meander:course', { bubbles: true, detail: { course: c + 1 } }));
    }
    lastStep = step;
    drawn = step; drawnFade = fade;
  }
  let drawnC = -1, paperCache = '';
  function getPaper() {
    if (!paperCache) paperCache = getComputedStyle(el).getPropertyValue('--paper').trim() || '#f3f0e8';
    return paperCache;
  }

  // name the larger lakes, once, as the history is computed
  let named = 0;
  function nameLakes() {
    for (const ob of sim.oxbows) {
      if (ob.named) continue; ob.named = true;
      const mx = ob.x[ob.x.length >> 1];
      if (ob.len > 7 && mx > o.L / 2 - 30 && mx < o.L / 2 + 30 && named < LAKES.length) ob.name = LAKES[(named++ * 7 + o.seed) % LAKES.length];
    }
  }

  /* scroll -> time */
  function progress() {
    if (reduced) return 1;
    const r = el.getBoundingClientRect(), run = el.offsetHeight - stage.offsetHeight;
    if (run <= 0) return 1;
    return clamp((-r.top) / run);
  }
  function targetT() {
    const p = smooth(0, 1, clamp((progress() - .03) / .92)) * .15 + clamp((progress() - .03) / .92) * .85;
    return p * (sim.total - 1);
  }
  let lastTs = 0;
  function tick(ts) {
    raf = 0;
    if (killed) return;
    const dt = lastTs ? Math.min(.1, (ts - lastTs) / 1000) : 1 / 60; lastTs = ts;
    const limit = sim.frames.length - 1;
    const goal = Math.min(limit, tTarget);
    tShow += (goal - tShow) * (1 - Math.exp(-dt / .14));
    if (Math.abs(goal - tShow) < .5) tShow = goal;
    const hlGoal = hover >= 0 && hover < Math.floor((Math.round(tShow) + 1) / per) ? 1 : 0;
    const hlMoving = hlA !== hlGoal;
    if (hlMoving && reduced) hlA = hlGoal;
    else if (hlMoving) { hlA += (hlGoal - hlA) * (1 - Math.exp(-dt / .12)); if (Math.abs(hlGoal - hlA) < .01) hlA = hlGoal; }
    if (Math.round(tShow) !== drawn || drawnFade > 0 || hlMoving) render(tShow);
    if (tShow !== goal || hlA !== hlGoal) raf = requestAnimationFrame(tick); else lastTs = 0;
  }
  function wake() { if (!raf && visible && !killed) raf = requestAnimationFrame(tick); }
  function onScroll() { tTarget = targetT(); wake(); }

  // compute the history in small slices between frames
  let computeId = 0, computeMs = 0;
  function compute() {
    computeId = 0;
    if (killed) return;
    const t0 = performance.now();
    const done = sim.run(12);
    computeMs += performance.now() - t0;
    nameLakes();
    if (reduced) { if (done) { tShow = tTarget = sim.total - 1; render(tShow); } }
    else if (tTarget > drawn) wake();
    else if (drawn < 0) render(0);
    if (!done) computeId = setTimeout(compute, 0);
  }

  let ro, io, resizeT = 0;
  const start = () => {
    if (killed) return;
    layout();
    tTarget = reduced ? sim.total - 1 : targetT(); tShow = reduced ? tTarget : Math.min(tTarget, sim.frames.length - 1);
    compute();
    ro = new ResizeObserver(() => { clearTimeout(resizeT); resizeT = setTimeout(() => { const w = W, h = H; layout(); if (w !== W || h !== H || true) { drawn = -1; drawnC = -1; render(tShow); } }, 120); });
    ro.observe(stage);
    io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) onScroll(); }, { rootMargin: '10% 0px' });
    io.observe(el);
    addEventListener('scroll', onScroll, { passive: true });
    {
      stage.addEventListener('pointermove', onPointer);
      stage.addEventListener('pointerleave', onLeave);
      items.forEach((li, i) => { li.addEventListener('pointerenter', () => setHover(i)); li.addEventListener('pointerleave', onLeave); });
    }
  };
  function setHover(e) { if (e !== hover) { hover = e; items.forEach((li, i) => li.classList.toggle('is-hl', i === e)); wake(); } }
  function onLeave() { setHover(-1); }
  function onPointer(ev) {
    if (ev.pointerType !== 'mouse' || legend.contains(ev.target)) return;
    const r = stage.getBoundingClientRect(), cNow = Math.floor((drawn + 1) / per);
    if (cNow < 1) return setHover(-1);
    const [x, y] = unproject(ev.clientX - r.left, ev.clientY - r.top);
    const gx = Math.floor((x - sim.X0) * sim.GX), gy = Math.floor((y - sim.Y0) * sim.GX);
    const own = sim.owns[Math.min(cNow, o.courses) - 1];
    const e = own && gx >= 0 && gy >= 0 && gx < sim.GW && gy < sim.GH ? own[gx + gy * sim.GW] : -1;
    setHover(e);
  }
  document.fonts && document.fonts.ready ? Promise.all([
    document.fonts.load(`italic 500 14px 'Cormorant Garamond'`), document.fonts.load(`500 12px 'Inter'`),
  ]).catch(() => {}).then(start) : start();
  const onVis = () => { if (document.hidden && raf) { cancelAnimationFrame(raf); raf = 0; } else onScroll(); };
  document.addEventListener('visibilitychange', onVis);

  function destroy() {
    killed = true;
    cancelAnimationFrame(raf); clearTimeout(computeId); clearTimeout(resizeT);
    ro && ro.disconnect(); io && io.disconnect();
    removeEventListener('scroll', onScroll);
    stage.removeEventListener('pointermove', onPointer); stage.removeEventListener('pointerleave', onLeave);
    if (hl) hl.width = 0;
    document.removeEventListener('visibilitychange', onVis);
    cv.remove(); legend.remove(); if (madeStage) stage.remove();
    el.classList.remove('mr', 'is-live', 'mr-scroll');
    el.style.removeProperty('--mr-runway');
    base.width = tmp.width = topo.width = 0;
  }
  destroy.state = () => ({ renderMs: +renderMs.toFixed(1), rebuildMs: +rebuildMs.toFixed(1), computeMs: +computeMs.toFixed(0), step: drawn, frames: sim.frames.length, done: sim.done, oxbows: sim.oxbows.length, orient, k });
  return destroy;
}

function autostart() {
  document.querySelectorAll('[data-meander]').forEach((el) => {
    if (!el.__meander) el.__meander = meander(el);
  });
}
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autostart, { once: true });
  else autostart();
}
