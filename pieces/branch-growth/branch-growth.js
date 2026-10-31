// branch-growth: a flowering ink-plum branch that grows down a long page as you read.
//
// Growth is space colonisation (Runions, Lane & Prusinkiewicz 2007) over attractor points
// scattered in the page's free space (never on a line of text); thickness is the pipe model
// (r^g = sum of the children's r^g, g = 2.3, after Eloy 2011); blossoms open in stages on the
// young wood. The whole season is computed once from the seed and the measured layout, and the
// scroll position picks how far into it you are. Rendered in WebGL as brush strokes, with ink
// texture and moss dots sampled from Jin Nong's plum album leaf of 1757 (Met, CC0).

const GAMMA = 2.3;

const DEFAULTS = {
  seed: 7,
  avoid: 'p, h1, h2, h3, h4, h5, h6, blockquote, li, figcaption, dt, dd, pre, img, figure, video, [data-bgr-avoid]',
  lead: 0.72,          // where the growing front sits, as a fraction down the viewport
  limbs: 4,            // how many old limbs: each a major event, with paper between
  density: 1,          // scales the number of attractors (how bushy)
  blossoms: 1,         // scales the number of flowers
  ink: null,           // css colour; default: the host's --ink
  paper: null,         // css colour for the petals; default: the host's --paper
  assets: null,        // base URL of ink-texture.png and moss-dots.png
};

const reduceMQ = matchMedia('(prefers-reduced-motion: reduce)');

// ---------- small helpers ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash2(x, y, s) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
function parseColor(str, fallback) {
  const c = document.createElement('canvas').getContext('2d');
  c.fillStyle = fallback; c.fillStyle = (str || '').trim() || fallback;
  const v = c.fillStyle; // #rrggbb or rgba()
  if (v[0] === '#') return [1, 3, 5].map(i => parseInt(v.slice(i, i + 2), 16) / 255);
  const m = v.match(/[\d.]+/g); return m ? m.slice(0, 3).map(n => +n / 255) : [0, 0, 0];
}
const loadImage = (url) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; });

// ---------- layout: where the words are ----------
function measure(host, opts) {
  const hr = host.getBoundingClientRect();
  const W = host.clientWidth, H = host.scrollHeight;
  const rects = [];
  const els = [...host.querySelectorAll(opts.avoid)].filter(e => !e.closest('.bgr-layer'));
  const set = new Set(els);
  const range = document.createRange();
  for (const el of els) {
    let p = el.parentElement, nested = false;
    while (p && p !== host) { if (set.has(p)) { nested = true; break; } p = p.parentElement; }
    if (nested) continue;
    const tag = el.tagName;
    let list;
    if (tag === 'IMG' || tag === 'VIDEO' || tag === 'FIGURE' || el.hasAttribute('data-bgr-avoid')) list = [el.getBoundingClientRect()];
    else {
      // the glyphs' own line boxes, not their blocks: a short line leaves its end free
      list = [];
      const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let t = tw.nextNode(); t; t = tw.nextNode()) {
        if (!t.nodeValue.trim()) continue;
        range.selectNodeContents(t);
        for (const r of range.getClientRects()) list.push(r);
      }
    }
    for (const r of list) {
      if (r.width < 1 || r.height < 1) continue;
      rects.push({ x0: r.left - hr.left, y0: r.top - hr.top, x1: r.right - hr.left, y1: r.bottom - hr.top });
    }
  }
  return { W, H, rects };
}

// y-bucketed rectangle index for fast "is this point on a word?" queries
function rectIndex(rects, H) {
  const B = 48, n = Math.ceil(H / B) + 2, buckets = Array.from({ length: n }, () => []);
  for (const r of rects) {
    for (let b = Math.max(0, Math.floor(r.y0 / B) - 1); b <= Math.min(n - 1, Math.floor(r.y1 / B) + 1); b++) buckets[b].push(r);
  }
  function hit(x, y, pad) {
    const b = Math.floor(y / B); if (b < 0 || b >= n) return false;
    for (const r of buckets[b]) if (x > r.x0 - pad && x < r.x1 + pad && y > r.y0 - pad && y < r.y1 + pad) return true;
    return false;
  }
  // a push away from nearby words, strongest close in (old wood keeps its distance)
  const seen = new Set();
  hit.push = function (x, y, R) {
    let px = 0, py = 0; seen.clear();
    for (let b = Math.max(0, Math.floor((y - R) / B)); b <= Math.min(n - 1, Math.floor((y + R) / B)); b++) {
      for (const r of buckets[b]) {
        if (seen.has(r)) continue; seen.add(r);
        const cx = clamp(x, r.x0, r.x1), cy = clamp(y, r.y0, r.y1);
        const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
        if (d >= R || d < 0.01) continue;
        const w = (1 - d / R); px += dx / d * w * w; py += dy / d * w * w;
      }
    }
    return [px, py];
  };
  return hit;
}

// ---------- the season's growth ----------
function grow(layout, opts, vh) {
  const { W, H, rects } = layout;
  const rnd = mulberry32((opts.seed * 2654435761) ^ Math.round(W) ^ (Math.round(H) << 9));
  const hit = rectIndex(rects, H);
  const phone = W < 700;
  const P = phone
    ? { D: 6, di: 80, dk: 18, cell: 24, pad: 9, r0: 0.95, rMax: 10, limbR: 8.5, flowerR: 12, V: 4 }
    : { D: 8, di: 110, dk: 28, cell: 36, pad: 15, r0: 1.25, rMax: 22, limbR: 18, flowerR: 17, V: 4 };

  // nodes
  let cap = 4096, N = 0;
  let X = new Float32Array(cap), Y = new Float32Array(cap), DX = new Float32Array(cap), DY = new Float32Array(cap);
  let BIRTH = new Float32Array(cap), PAR = new Int32Array(cap), NCH = new Uint8Array(cap), FLAG = new Uint8Array(cap);
  let A0 = new Float32Array(cap), STEER = new Uint8Array(cap), DEAD = new Uint8Array(cap), ORD = new Uint8Array(cap), LEN = new Float32Array(cap), MAXL = new Float32Array(cap);
  let KINK = new Int16Array(cap), SINCE = new Int16Array(cap), TEXTRUN = new Int16Array(cap), PREMIN = new Float32Array(cap);
  const PRE = 1, INTEXT = 2;
  function growCap() {
    cap *= 2;
    const re = (A, T) => { const B = new T(cap); B.set(A); return B; };
    X = re(X, Float32Array); Y = re(Y, Float32Array); DX = re(DX, Float32Array); DY = re(DY, Float32Array);
    BIRTH = re(BIRTH, Float32Array); PAR = re(PAR, Int32Array); NCH = re(NCH, Uint8Array); FLAG = re(FLAG, Uint8Array);
    A0 = re(A0, Float32Array); STEER = re(STEER, Uint8Array); DEAD = re(DEAD, Uint8Array); ORD = re(ORD, Uint8Array); LEN = re(LEN, Float32Array); MAXL = re(MAXL, Float32Array);
    KINK = re(KINK, Int16Array); SINCE = re(SINCE, Int16Array); TEXTRUN = re(TEXTRUN, Int16Array); PREMIN = re(PREMIN, Float32Array);
  }
  // spatial grid of nodes (cell = di)
  const GC = P.di, GW = Math.ceil((W + 200) / GC) + 1, GH = Math.ceil((H + 200) / GC) + 1;
  const grid = new Map();
  const gkey = (x, y) => (Math.floor((y + 100) / GC)) * GW + Math.floor((x + 100) / GC);
  function addNode(x, y, dx, dy, parent, birth, flag) {
    if (N >= cap) growCap();
    const i = N++;
    X[i] = x; Y[i] = y; DX[i] = dx; DY[i] = dy; PAR[i] = parent; BIRTH[i] = birth; FLAG[i] = flag;
    KINK[i] = 4 + Math.floor(rnd() * 7); SINCE[i] = 0; TEXTRUN[i] = 0; ORD[i] = 0; LEN[i] = 0; MAXL[i] = 1e9;
    if (parent >= 0) NCH[parent]++;
    const k = gkey(x, y); let c = grid.get(k); if (!c) grid.set(k, c = []); c.push(i);
    return i;
  }
  function nearest(x, y, maxd) {
    const cx = Math.floor((x + 100) / GC), cy = Math.floor((y + 100) / GC);
    let best = -1, bd = maxd * maxd;
    for (let j = cy - 1; j <= cy + 1; j++) for (let i = cx - 1; i <= cx + 1; i++) {
      const c = grid.get(j * GW + i); if (!c) continue;
      for (const n of c) { const ddx = X[n] - x, ddy = Y[n] - y, d = ddx * ddx + ddy * ddy; if (d < bd) { bd = d; best = n; } }
    }
    return best;
  }

  // --- the bands of open paper: rows the full width of the page with no words in them ---
  const bands = [];
  {
    let start = -1;
    const free = (y) => !rects.some(r => r.y1 > y - 4 && r.y0 < y + 4);
    for (let y = 0; y <= H; y += 8) {
      const f = y < H && free(y);
      if (f && start < 0) start = y;
      if (!f && start >= 0) { if (y - start >= (phone ? 100 : 140)) bands.push({ y0: start, y1: y }); start = -1; }
    }
  }

  // --- a few old limbs, each a major event: it enters at one margin above a band of open
  // paper, crosses the full width in the gap in angular, iron-bent strokes, and on a wide page
  // hangs down into the far margin beside the next section. Between them, whole screens of paper.
  const limbs = [];
  {
    const count = opts.limbs || 4;
    const minGap = (phone ? 1.6 : 1.2) * vh;
    for (let k = 0; k < count; k++) {
      const target = k === 0 ? 0 : (H - vh * 0.6) * k / (count - 0.4);
      let best = null;
      for (const b of bands) {
        const mid = (b.y0 + b.y1) / 2;
        if (limbs.some(l => Math.abs(l.mid - mid) < minGap)) continue;
        if (mid > H - 0.35 * vh) continue;
        const score = Math.abs(mid - target) - Math.min(b.y1 - b.y0, 400) * 0.3;
        if (!best || score < best.score) best = { b, mid, score };
      }
      if (best) limbs.push({ y0: best.b.y0, y1: best.b.y1, mid: best.mid });
    }
    limbs.sort((a, b) => a.mid - b.mid);
    // a last, smaller limb by the end, so the essay closes beside a flowering branch
    const last = limbs[limbs.length - 1];
    const coda = bands.filter(b => (b.y0 + b.y1) / 2 > (last ? last.mid + 0.9 * vh : 0) && (b.y0 + b.y1) / 2 < H - 0.08 * vh).pop();
    if (coda) limbs.push({ y0: coda.y0, y1: coda.y1, mid: (coda.y0 + coda.y1) / 2, coda: true });
    limbs.forEach((l, i) => { l.side = i % 2 ? 1 : -1; });
  }
  const KNOT = 4;
  for (const L of limbs) {
    const s = L.side, bh = L.y1 - L.y0, top = L.y0 < 40;
    const ex = (f) => s < 0 ? f * W : W - f * W; // fraction across from the entering side
    // waypoints
    // it enters low and climbs across the gap, then turns at an elbow (60-90 degrees), and
    // turns again: a gesture, not a rail
    const j1 = (rnd() - 0.5) * 0.06, lowY = Math.min(H - 30, L.y1 + (phone ? -0.08 * bh : 0.16 * vh));
    const wp = L.coda ? (phone ? [
      [ex(-0.06), L.y1 - bh * 0.12],
      [ex(0.36), L.y0 + bh * 0.3],
      [ex(0.62), L.mid + bh * 0.05],
    ] : [
      [ex(-0.03), lowY],
      [ex(0.16 + j1), L.y0 + bh * 0.28],
      [ex(0.3), L.mid + bh * 0.12],
    ]) : phone ? [
      [ex(-0.06), L.y1 - bh * 0.1],
      [ex(0.46 + j1), L.y0 + bh * 0.2],
      [ex(1.08), L.mid + bh * 0.22],
    ] : [
      [ex(-0.03), top ? L.y1 - bh * 0.05 : lowY],
      [ex(0.42 + j1), L.y0 + bh * 0.18],
      [ex(0.8), L.mid + bh * 0.3],
    ];
    // between waypoints, straight pieces broken at knots
    const pts = [wp[0]];
    for (let i = 1; i < wp.length; i++) {
      const [ax, ay] = pts[pts.length - 1], [bx, by] = wp[i];
      const len = Math.hypot(bx - ax, by - ay), nk = Math.max(1, Math.round(len / ((phone ? 55 : 85) + rnd() * (phone ? 50 : 80))));
      for (let j = 1; j <= nk; j++) {
        const t = j / nk;
        const jit = j === nk ? 0 : (rnd() - 0.5) * Math.min(phone ? 18 : 34, len / nk * 0.35);
        const nxv = -(by - ay) / len, nyv = (bx - ax) / len;
        pts.push([ax + (bx - ax) * t + nxv * jit, ay + (by - ay) * t + nyv * jit]);
      }
    }
    // sample nodes along the pieces; girth drops suddenly at some knots
    const total = pts.reduce((a, p, i) => i ? a + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0, 0);
    const R0 = (phone ? 10 : 24) * (L.coda ? 0.55 : 1);
    let drop = 1, rc = R0, parent = -1, sAcc = 0;
    const tau0 = L.mid - 0.2 * vh, span = 0.45 * vh;
    L.knots = [];
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
      const len = Math.hypot(bx - ax, by - ay), steps = Math.max(1, Math.round(len / P.D));
      const dx = (bx - ax) / len, dy = (by - ay) / len;
      for (let j = i === 1 ? 0 : 1; j <= steps; j++) {
        const t = j / steps, x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
        const sNow = sAcc + len * t;
        const id = addNode(x, y, dx, dy, parent, tau0 + span * sNow / total, PRE | (j === steps ? KNOT : 0));
        const r = R0 * (1 - 0.42 * smooth(0, 0.8, sNow / total)) * drop; // a thick base, tapering
        rc += (r - rc) * 0.35; PREMIN[id] = rc; DEAD[id] = 0;
        if (j === steps) {
          L.knots.push(id);
          if (rnd() < 0.35) drop *= 0.8 + rnd() * 0.1; else drop *= 0.95 + rnd() * 0.05;
          drop = Math.max(drop, 0.55);
          // a scar where a branch was lost: a short broken stub
          if (rnd() < 0.3 && i < pts.length - 1) {
            const a = Math.atan2(dy, dx) + (rnd() < 0.6 ? -1 : 1) * s * -1 * (0.7 + rnd() * 0.5);
            let q = id; const sl = 2 + Math.floor(rnd() * 3);
            for (let k = 1; k <= sl; k++) {
              q = addNode(x + Math.cos(a) * P.D * k, y + Math.sin(a) * P.D * k, Math.cos(a), Math.sin(a), q, BIRTH[id] + 2, PRE);
              PREMIN[q] = r * 0.55; NCH[q] = 3; DEAD[q] = 1;
            }
          }
        }
        parent = id;
      }
      sAcc += len;
    }
    L.tip = parent;
    if (L.coda) { ORD[parent] = 1; LEN[parent] = 1; MAXL[parent] = 0; } // the last limb ends where it is: no leader runs on
  }

  // --- attractors: patchy, in the free space only, and only in each limb's stretch ---
  const zones = limbs.map(L => L.coda ? [L.y0 - 0.35 * vh, H] : [L.y0 - (phone ? 0.32 : 0.55) * vh, L.y1 + (phone ? 0.5 : 0.85) * vh]);
  const ax = [], ay = [];
  {
    const cs = P.cell / Math.sqrt(opts.density);
    for (let y = cs * 0.5; y < H - 10; y += cs) {
      if (!zones.some(z => y > z[0] && y < z[1])) continue;
      for (let x = cs * 0.5; x < W; x += cs) {
        const px = x + (rnd() - 0.5) * cs * 0.9, py = y + (rnd() - 0.5) * cs * 0.9;
        if (px < 8 || px > W - 8) continue;
        let behind = 1;
        if (hit(px, py, P.pad + 4)) {
          // on a phone the margins are a finger wide: let the wood pass behind the words near the edges
          if (!phone) continue;
          const e = Math.min(px, W - px) / W; if (e > 0.3) continue;
          behind = 0.4 * (1 - e / 0.3);
        }
        // clusters and voids: the plum prizes sparseness
        const n = 0.65 * vnoise(px / 230, py / 230, 11) + 0.35 * vnoise(px / 90, py / 90, 12);
        const keep = smooth(0.3, 0.7, n) * 0.7 + 0.3;
        if (rnd() < keep * behind) { ax.push(px); ay.push(py); }
      }
    }
  }
  // sort by y so the sweep can switch them on in order
  const order = ax.map((_, i) => i).sort((a, b) => ay[a] - ay[b]);
  const AX = new Float32Array(order.map(i => ax[i])), AY = new Float32Array(order.map(i => ay[i]));
  const AN = AX.length, alive = new Uint8Array(AN);
  let next = 0; const active = [];

  // --- the sweep: attractors switch on as the season moves down the page ---
  // Growth units after the plum's architecture: leaders (order 0, the old wood that carries the
  // tree down the margin), whips (order 1, one season's straight shoots, rising) and short
  // flowering twigs (order 2). Each unit grows by space colonisation; leaders follow the free
  // space down, whips and twigs are stiff, phototropic and of limited length.
  const V = P.V;
  const sumX = new Float32Array(1 << 17), sumY = new Float32Array(1 << 17), cnt = new Uint16Array(1 << 17);
  let sweep = Math.min(0, ...zones.map(z => z[0])) - 20;
  const touched = [];
  const STALE = phone ? 420 : 560;
  for (let iter = 0; iter < 8000; iter++) {
    sweep += V;
    while (next < AN && AY[next] < sweep) { alive[next] = 1; active.push(next); next++; }
    if (next >= AN && !active.length) break;
    touched.length = 0;
    for (let k = active.length - 1; k >= 0; k--) {
      const a = active[k];
      if (!alive[a] || AY[a] < sweep - STALE) { alive[a] = 0; active[k] = active[active.length - 1]; active.pop(); continue; }
      const n = nearest(AX[a], AY[a], P.di);
      if (n < 0) continue;
      const ddx = AX[a] - X[n], ddy = AY[a] - Y[n], d = Math.hypot(ddx, ddy);
      if (d < P.dk) { alive[a] = 0; active[k] = active[active.length - 1]; active.pop(); continue; }
      if (n >= sumX.length) continue;
      if (!cnt[n]) touched.push(n);
      sumX[n] += ddx / d; sumY[n] += ddy / d; cnt[n]++;
    }
    // leaders see further: a stalled leader tip reaches for the nearest open space
    for (let n = 0; n < N; n++) {
      if (ORD[n] !== 0 || NCH[n] !== 0 || cnt[n] || DEAD[n]) continue;
      if (Y[n] < sweep - STALE) { DEAD[n] = 1; continue; }
      let sx = 0, sy = 0, c = 0; const R2 = P.di * 2.4;
      for (const a of active) {
        const ddx = AX[a] - X[n], ddy = AY[a] - Y[n]; if (Math.abs(ddx) > R2 || Math.abs(ddy) > R2) continue;
        const d = Math.hypot(ddx, ddy); if (d > R2 || d < 1) continue;
        sx += ddx / d; sy += ddy / d; c++;
      }
      if (c) { sumX[n] = sx; sumY[n] = sy; cnt[n] = 1; touched.push(n); }
    }
    for (const n of touched) {
      let ex = sumX[n], ey = sumY[n];
      sumX[n] = 0; sumY[n] = 0; cnt[n] = 0;
      const el = Math.hypot(ex, ey); if (el < 1e-4) continue;
      ex /= el; ey /= el;
      const tip = NCH[n] === 0;
      if (NCH[n] >= 3) continue;
      const ord = ORD[n];
      const out = X[n] < W / 2 ? -1 : 1;
      let nx, ny, nord = ord, maxl = MAXL[n], kink = KINK[n] - 1;
      if (tip) {
        if (ord > 0 && LEN[n] >= MAXL[n]) continue;
        if (ord === 0) {
          const [qx, qy] = hit.push(X[n], Y[n], phone ? 26 : 75);
          nx = ex + DX[n] * 2.4 + out * 0.05 + qx * 2.2; ny = ey + DY[n] * 2.4 + 0.22 + qy * 2.2;
        }
        else { nx = ex * 0.55 + DX[n] * 4.2 + out * 0.10; ny = ey * 0.55 + DY[n] * 4.2 - (ord === 1 ? 0.42 : 0.3); }
        let l = Math.hypot(nx, ny); nx /= l; ny /= l;
        // stems are stiff: a limited turn per step, so no curls; old wood changes course
        // in angular kinks instead (as ink-plum painters prize), young whips bend a little
        {
          const a0 = Math.atan2(DY[n], DX[n]); let da = Math.atan2(ny, nx) - a0;
          da = Math.atan2(Math.sin(da), Math.cos(da));
          let a;
          if (ord === 0) {
            if (kink <= 0 || (Math.abs(da) > 0.6 && kink <= 3)) {
              a = a0 + (Math.abs(da) > 0.25 ? clamp(da * 1.1, -0.9, 0.9) : Math.sign(rnd() - 0.5) * (0.3 + rnd() * 0.35));
              kink = 6 + Math.floor(rnd() * 7);
            } else a = a0 + clamp(da, -0.012, 0.012);
          } else {
            a = a0 + clamp(da, -0.025, 0.025);
            if (kink <= 0) {
              // one decisive angle, toward the light
              const up = Math.sin(a0 + 0.4) < Math.sin(a0 - 0.4) ? 1 : -1;
              a += up * (0.3 + rnd() * 0.3); kink = 9999;
            }
          }
          // a whip keeps to the line it set out on: no loops
          if (ord > 0) { let dv = a - A0[n]; dv = Math.atan2(Math.sin(dv), Math.cos(dv)); if (Math.abs(dv) > 0.7) a = A0[n] + Math.sign(dv) * 0.7; }
          nx = Math.cos(a); ny = Math.sin(a);
          // leaders carry the tree down the page: they may wander, never climb back
          if (ord === 0 && ny < -0.2) { ny = -0.2; nx = Math.sign(nx || 1) * Math.sqrt(1 - ny * ny); }
        }
      } else {
        if (ord === 2) continue;
        if (FLAG[n] & PRE ? (n % 2 !== 0 || DEAD[n]) : SINCE[n] < (ord === 0 ? 2 : 3)) continue;
        // the side shoot leaves at an angle, on the side the free space is
        const cross = DX[n] * ey - DY[n] * ex, sg = cross >= 0 ? 1 : -1;
        const a = Math.atan2(DY[n], DX[n]) + sg * (0.5 + rnd() * 0.5);
        nx = Math.cos(a); ny = Math.sin(a);
        if (ord === 0 && ny > 0.5 && LEN[n] > 160 && rnd() < 0.05) { nord = 0; maxl = 1e9; }
        else {
          nord = ord + 1;
          maxl = nord === 1 ? (phone ? 40 : 55) + (phone ? 150 : 230) * Math.pow(rnd(), 1.5) : (phone ? 14 : 18) + (phone ? 36 : 50) * rnd();
          ny -= nord === 1 ? 0.35 : 0.2; nx += out * 0.08;
        }
        const l = Math.hypot(nx, ny); nx /= l; ny /= l;
        kink = nord > 0 && rnd() < 0.55 ? Math.max(2, Math.round(maxl / P.D * (0.3 + rnd() * 0.4))) : (nord > 0 ? 9999 : 3 + Math.floor(rnd() * 6));
      }
      let x = X[n] + nx * P.D, y = Y[n] + ny * P.D;
      // words: steer round them; on a phone the branch may pass behind them (drawn pale), never far
      let flag = 0, run = 0, steered = false;
      const tpad = phone ? 2 : P.pad + (nord === 0 ? 16 : 0);
      if (hit(x, y, tpad)) {
        steered = true;
        let ok = false;
        if (tip && !phone) {
          const a0 = Math.atan2(ny, nx), sg = ex * ny - ey * nx > 0 ? -1 : 1;
          if (STEER[n] > (ord === 0 ? 12 : 4)) continue;
          for (const da of ord === 0 ? [0.3, -0.3, 0.6, -0.6] : [0.3, -0.3, 0.6, -0.6]) {
            const a = a0 + da * sg, tx = X[n] + Math.cos(a) * P.D, ty = Y[n] + Math.sin(a) * P.D;
            if (!hit(tx, ty, tpad)) { nx = Math.cos(a); ny = Math.sin(a); x = tx; y = ty; ok = true; break; }
          }
        }
        if (!ok) {
          if (!phone) continue;
          run = TEXTRUN[n] + 1; if (run > 60 && ORD[n] > 0) continue; flag = INTEXT;
        }
      }
      if (x < -20 || x > W + 20 || y > H - 4 || y < 4) continue;
      const m = nearest(x, y, P.D * 0.62);
      if (m >= 0 && m !== n) continue;
      const i = addNode(x, y, nx, ny, n, Math.max(sweep, BIRTH[n] + V), flag);
      KINK[i] = kink; ORD[i] = nord; MAXL[i] = maxl; A0[i] = tip ? A0[n] : Math.atan2(ny, nx); STEER[i] = steered ? STEER[n] + 1 : 0;
      LEN[i] = (tip ? LEN[n] : 0) + P.D;
      SINCE[i] = tip ? SINCE[n] + 1 : 0;
      if (!tip) SINCE[n] = 0;
      TEXTRUN[i] = run;
    }
  }

  // the old limb does not end where the painter's first stroke did: its girth runs on and fades
  for (let i = 0; i < N; i++) {
    const p = PAR[i];
    if (FLAG[i] & PRE) continue;
    if (p >= 0 && ORD[i] === 0 && PREMIN[p] > 0) PREMIN[i] = Math.max(PREMIN[i], PREMIN[p] * (phone ? 0.97 : 0.976));
    if (ORD[i] === 0) PREMIN[i] = Math.max(PREMIN[i], P.r0 * 2);
  }
  // --- structure: children, subtree tips, strokes ---
  const kids = Array.from({ length: N }, () => []);
  for (let i = 0; i < N; i++) if (PAR[i] >= 0) kids[PAR[i]].push(i);
  const tips = new Float32Array(N);
  for (let i = N - 1; i >= 0; i--) { if (!kids[i].length) tips[i] += 1; if (PAR[i] >= 0) tips[PAR[i]] += tips[i]; }
  const finalR = new Float32Array(N);
  for (let i = 0; i < N; i++) finalR[i] = Math.max(PREMIN[i], Math.min(P.rMax, P.r0 * Math.pow(tips[i], 1 / GAMMA)));

  const strokes = [];
  const strokeOf = new Int32Array(N).fill(-1);
  const stack = [];
  for (let i = 0; i < N; i++) if (PAR[i] < 0) stack.push([i, -1, 0.92]);
  while (stack.length) {
    const [start, joint, ptone] = stack.pop();
    const nodes = []; if (joint >= 0) nodes.push(joint);
    let n = start;
    const id = strokes.length;
    const tone = rnd() < 0.1 ? 0.5 + rnd() * 0.15 : 0.8 + rnd() * 0.16;
    while (n >= 0) {
      nodes.push(n); strokeOf[n] = id;
      const ks = kids[n]; if (!ks.length) break;
      // the old limb runs on as one line of strokes: prefer its own continuation, then a leader
      const rank = (k) => ((FLAG[k] & PRE) && !DEAD[k] ? 2e6 : 0) + (ORD[k] === 0 && !DEAD[k] ? 1e6 : 0) + tips[k];
      let main = ks[0]; for (const k of ks) if (rank(k) > rank(main)) main = k;
      for (const k of ks) if (k !== main) stack.push([k, n, tone]);
      n = main;
    }
    let y0 = Infinity, y1 = -Infinity, rmax = 0;
    for (const k of nodes) { y0 = Math.min(y0, Y[k]); y1 = Math.max(y1, Y[k]); rmax = Math.max(rmax, finalR[k]); }
    const pre = (FLAG[nodes[joint >= 0 ? 1 : 0]] & PRE) !== 0;
    const own = nodes.length - (joint >= 0 ? 1 : 0);
    if (joint >= 0 && own < 3 && nodes.slice(1).every(k => kids[k].length <= 1) && rnd() < 0.75) { for (let k = 1; k < nodes.length; k++) BIRTH[nodes[k]] = Infinity; continue; }
    strokes.push({ ord: ORD[nodes[joint >= 0 ? 1 : 0]], nodes: Int32Array.from(nodes), y0: y0 - rmax - 30, y1: y1 + rmax + 30, tone: pre ? 0.95 : tone, seed: rnd(), dry: pre ? 0.85 : 0.5 + rnd() * 0.4, pre, joint });
  }

  // --- old wood is painted as several overlapping strokes, a new one at each knot ---
  for (const s of strokes) {
    const ns = s.nodes; let rmax = 0;
    for (const k of ns) rmax = Math.max(rmax, finalR[k]);
    if (!s.pre && rmax < (phone ? 3 : 4.5)) continue;
    const arc = [0];
    for (let k = 1; k < ns.length; k++) arc.push(arc[k - 1] + Math.hypot(X[ns[k]] - X[ns[k - 1]], Y[ns[k]] - Y[ns[k - 1]]));
    const Lf = arc[arc.length - 1];
    const cuts = [0];
    for (let k = 1; k < ns.length - 1; k++) {
      const n = ns[k], p = ns[k - 1];
      const turn = Math.abs(Math.atan2(Math.sin(Math.atan2(DY[n], DX[n]) - Math.atan2(DY[p], DX[p])), Math.cos(Math.atan2(DY[n], DX[n]) - Math.atan2(DY[p], DX[p]))));
      const since = arc[k] - cuts[cuts.length - 1];
      if (((FLAG[n] & KNOT) || turn > 0.35) && since > 50 || since > 260) cuts.push(arc[k]);
    }
    if (Lf - cuts[cuts.length - 1] < 24 && cuts.length > 1) cuts.pop();
    cuts.push(Lf);
    s.knotArcs = cuts.slice(1, -1);
    s.subs = [];
    for (let i = 0; i + 1 < cuts.length; i++) {
      const a = cuts[i] - (i ? 6 + rnd() * 10 : 30), b = cuts[i + 1], len = b - a;
      s.subs.push({ a, b: b + (i + 2 < cuts.length ? 18 + rnd() * 22 : 2), off: (rnd() - 0.5) * 0.2, wf: 0.9 + rnd() * 0.18, tone: 0.95, dry: 0.45 + rnd() * 0.45, seed: rnd() });
      const sg = rnd() < 0.5 ? -1 : 1;
      s.subs.push({ a: a + len * rnd() * 0.25, b: b - len * rnd() * 0.3, off: sg * (0.14 + rnd() * 0.16), wf: 0.62 + rnd() * 0.2, tone: 0.86, dry: 0.7 + rnd() * 0.3, seed: rnd() });
      if (rnd() < 0.45) {
        const a3 = a + len * rnd() * 0.4;
        s.subs.push({ a: a3, b: a3 + len * (0.3 + rnd() * 0.4), off: -sg * (0.62 + rnd() * 0.12), wf: 0.2 + rnd() * 0.1, tone: 1, dry: 0.3, seed: rnd() });
      }
    }
  }

  // --- blossoms on the young wood, singly or in twos and threes on short spurs ---
  const flowers = [];
  const fR = P.flowerR;
  const VIEWW = [0.22, 0.14, 0.14, 0.12, 0.1, 0.09, 0.07, 0.07, 0.05];
  const pickView = () => { let q = rnd(); for (let i = 0; i < VIEWW.length; i++) { q -= VIEWW[i]; if (q < 0) return i; } return 0; };
  const sizeOf = () => { const q = rnd(); return q < 0.12 ? 0.55 + rnd() * 0.15 : q < 0.85 ? 0.82 + rnd() * 0.25 : 1.12 + rnd() * 0.2; };
  function addFlower(n, cx, cy, last, cluster) {
    const fBehind = hit(cx, cy, phone ? fR * 0.5 : fR * 0.9);
    if (fBehind && (!phone || rnd() < 0.5)) return false;
    const q = rnd();
    const maxS = last ? 0.3 : q < 0.2 ? 0.28 : q < 0.34 ? 0.62 : 1;
    const rot = Math.atan2(Y[n] - cy, X[n] - cx) - Math.PI / 2 + (rnd() - 0.5) * 0.5;
    const lag = 10 + rnd() * 110 + cluster * 30;
    flowers.push({ x: cx, y: cy, node: n, t0: BIRTH[n] + lag, dur: 150 + rnd() * 130, maxS, view: pickView(), rot, size: fR * sizeOf() * (last ? 0.85 : 1), faint: fBehind || (FLAG[n] & INTEXT) ? 0.3 : 1, fired: false });
    return true;
  }
  for (const s of strokes) {
    if (s.pre || s.ord === 0) continue;
    const ns = s.nodes; const first = s.joint >= 0 ? 1 : 0;
    let gap = 2 + Math.floor(rnd() * 4), side = rnd() < 0.5 ? 1 : -1;
    for (let k = first + 2; k < ns.length; k++) {
      const n = ns[k];
      if (tips[n] > 5) continue;
      const last = k === ns.length - 1;
      if (--gap > 0 && !last) continue;
      gap = 3 + Math.floor(rnd() * 6);
      if (rnd() > 0.72 * opts.blossoms && !last) continue;
      const nx = -DY[n] * side, ny = DX[n] * side;
      const off = fR * (0.25 + rnd() * 0.3);
      if (!addFlower(n, X[n] + nx * off + DX[n] * (rnd() - 0.5) * 3, Y[n] + ny * off, last, 0)) continue;
      // a cluster on a short spur: one or two more, close round the same node
      if (!last && rnd() < 0.38) {
        const c = 1 + (rnd() < 0.35 ? 1 : 0);
        for (let j = 1; j <= c; j++) {
          const a = Math.atan2(ny, nx) + (j === 1 ? 1 : -1) * (0.9 + rnd() * 0.6);
          const d = fR * (0.75 + rnd() * 0.35);
          addFlower(n, X[n] + Math.cos(a) * d, Y[n] + Math.sin(a) * d, false, j);
        }
      }
      side = -side;
    }
  }
  flowers.sort((a, b) => a.y - b.y);

  // --- a few fallen petals on the paper below old flowers ---
  const petals = [];
  for (const f of flowers) {
    if (f.maxS < 1 || f.faint < 1 || rnd() > (phone ? 0.06 : 0.09)) continue;
    const n = 1 + (rnd() < 0.3 ? 1 : 0);
    for (let j = 0; j < n; j++) {
      const x = f.x + (rnd() - 0.5) * 50, y = f.y + 30 + rnd() * 70;
      if (hit(x, y, 10) || y > H - 10) continue;
      petals.push({ x, y, node: f.node, t0: f.t0 + f.dur + 180 + rnd() * 260, rot: rnd() * 6.28, spr: Math.floor(rnd() * 8), size: f.size * (0.5 + rnd() * 0.15) });
    }
  }
  petals.sort((a, b) => a.y - b.y);

  // --- moss dots, clustered at the knots of the old wood; small dark buds along the whips ---
  const dots = [];
  const GOOD = [0, 1, 2, 3, 4, 5, 6, 7, 9, 10, 12, 13];
  const nodeAt = (s, S) => { const ns = s.nodes; let acc = 0; for (let k = 1; k < ns.length; k++) { acc += Math.hypot(X[ns[k]] - X[ns[k - 1]], Y[ns[k]] - Y[ns[k - 1]]); if (acc >= S) return ns[k]; } return ns[ns.length - 1]; };
  for (const s of strokes) {
    if (s.subs) {
      const spots = [...s.knotArcs.map(a => [a, 3 + Math.floor(rnd() * 4)])];
      let acc = 30 + rnd() * 60; const Lf = s.subs.length ? s.subs[s.subs.length - 1].b : 0;
      while (acc < Lf) { spots.push([acc, 1 + Math.floor(rnd() * 2)]); acc += 70 + rnd() * 110; }
      for (const [S, c] of spots) {
        const n = nodeAt(s, S), r = finalR[n];
        for (let j = 0; j < c; j++) {
          const side = rnd() < 0.62 ? -1 : 1;
          dots.push({ node: n, side, along: (rnd() - 0.5) * (8 + r), out: 0.75 + rnd() * 0.4, size: (phone ? 4.5 : 6.5) + rnd() * (phone ? 4 : 7) + r * 0.2, rot: rnd() * 6.28, spr: GOOD[Math.floor(rnd() * GOOD.length)], thr: s.pre ? 0 : Math.max(phone ? 3 : 4.5, r * 0.6) });
        }
      }
      continue;
    }
    if (s.ord === 0) continue;
    // buds as small dark dots along the whips, where no flower sits
    const ns = s.nodes; let acc = 0, nextAt = 14 + rnd() * 30;
    for (let k = 2; k < ns.length - 1; k++) {
      acc += P.D; if (acc < nextAt) continue;
      acc = 0; nextAt = 16 + rnd() * 34;
      if (rnd() < 0.4) continue;
      const n = ns[k];
      dots.push({ node: n, side: rnd() < 0.5 ? -1 : 1, along: 0, out: 0.9, size: (phone ? 2.6 : 3.4) + rnd() * 1.6, rot: rnd() * 6.28, spr: GOOD[4 + Math.floor(rnd() * 8)], thr: 0, bud: true });
    }
  }

  return {
    ORD, DEAD, STEER, N, X, Y, DX, DY, BIRTH, PAR, FLAG, PREMIN, finalR, strokes, flowers, petals, dots, P, phone, W, H, PRE, INTEXT,
    tauEnd: H + 520, V, limbs, bands,
  };
}

// ---------- blossom atlas (drawn once, after the painters' way of drawing the flower) ----------
const NS = 16, NV = 9, CELL = 112, RF = 34;
const VIEWS = [8, 22, 38, 52, 66, 82, 112, 136, 160].map(d => d * Math.PI / 180); // tilt of the flower's axis from the viewer
function buildAtlas(mossImg, ink, paper, seed) {
  const W = NS * CELL, H = NV * CELL + 128;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const rnd = mulberry32(seed * 7919 + 13);
  arcSeed = seed * 7 + 1;
  const inkC = `rgb(${ink.map(v => Math.round(v * 255)).join(',')})`;
  const lineC = `rgb(${ink.map((v, i) => Math.round((v * 0.62 + paper[i] * 0.38) * 255)).join(',')})`;
  const pap = paper.map(v => Math.round(v * 255));
  const rose = [205, 104, 110], sepal = [116, 36, 30];
  for (let vi = 0; vi < NV; vi++) {
    const th = VIEWS[vi];
    // per-view petal jitter, kept across stages so a flower keeps its face while it opens
    // the calyx is not one red: brown-red, wine, rust, from flower to flower
    const sep = [[116, 36, 30], [96, 34, 40], [138, 58, 40], [104, 46, 34], [124, 40, 48]][vi % 5];
    const pj = Array.from({ length: 5 }, () => ({ a: (rnd() - 0.5) * 0.22, s: 0.92 + rnd() * 0.16, w: rnd() * 6.28 }));
    const st = Array.from({ length: 22 }, (_, k) => ({ az: k * 6.2832 / 22 + rnd() * 0.25, sp: 0.45 + rnd() * 0.55, len: 0.7 + rnd() * 0.5, dot: 1.1 + rnd() * 0.8 }));
    const az0 = rnd() * 6.28;
    for (let si = 0; si < NS; si++) {
      const s = si / (NS - 1);
      g.save(); g.translate(si * CELL + CELL / 2, vi * CELL + CELL / 2);
      drawBlossom(g, s, th, pj, st, az0, { inkC, lineC, pap, rose, sepal: sep, dots: vi % 3 === 1 });
      g.restore();
    }
  }
  // moss dots from the painting: grey = ink density
  if (mossImg) {
    const t = document.createElement('canvas'); t.width = 256; t.height = 256;
    const tg = t.getContext('2d'); tg.drawImage(mossImg, 0, 0);
    const id = tg.getImageData(0, 0, 256, 256), d = id.data;
    for (let i = 0; i < d.length; i += 4) { const a = d[i]; d[i] = ink[0] * 255; d[i + 1] = ink[1] * 255; d[i + 2] = ink[2] * 255; d[i + 3] = Math.min(255, a * 1.15); }
    tg.putImageData(id, 0, 0);
    for (let k = 0; k < 16; k++) g.drawImage(t, (k % 4) * 64, Math.floor(k / 4) * 64, 64, 64, k * 64, NV * CELL, 64, 64);
  }
  // fallen petals: single petals lying on the paper, seen at different slants
  for (let k = 0; k < 8; k++) {
    g.save(); g.translate(k * 64 + 32, NV * CELL + 64 + 32); g.rotate(rnd() * 6.28);
    const rx = 15 + rnd() * 3, ry = rx * (0.55 + rnd() * 0.45);
    g.beginPath();
    for (let i = 0; i <= 40; i++) {
      const a = i / 40 * Math.PI * 2, rr = 1 + 0.04 * Math.sin(3 * a + k) - 0.08 * Math.exp(-Math.pow((a - Math.PI / 2) / 0.25, 2));
      const x = Math.cos(a) * rx * rr, y = Math.sin(a) * ry * rr; i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.closePath(); g.fillStyle = `rgba(${pap.join(',')},0.97)`; g.fill();
    const grd = g.createRadialGradient(0, -ry * 0.8, 0, 0, 0, rx);
    grd.addColorStop(0, `rgba(${rose.join(',')},0.4)`); grd.addColorStop(0.6, `rgba(${rose.join(',')},0.06)`); grd.addColorStop(1, `rgba(${rose.join(',')},0)`);
    g.fillStyle = grd; g.fill();
    pressureArc(g, (t) => { const a = -Math.PI / 2 + 0.5 + t * (2 * Math.PI - 1.0); return [Math.cos(a) * rx, Math.sin(a) * ry]; }, 1.7, lineC, 1);
    g.restore();
  }
  return cv;
}

function drawBlossom(g, s, th, pj, st, az0, C) {
  // 3D frame: the flower's axis A tilted by th toward the top of the cell; e1, e2 span the face
  const A = [0, -Math.sin(th), Math.cos(th)];
  const e1 = [1, 0, 0];
  const e2 = [A[1] * e1[2] - A[2] * e1[1], A[2] * e1[0] - A[0] * e1[2], A[0] * e1[1] - A[1] * e1[0]];
  const P = (v, k) => [v[0] * k, v[1] * k, v[2] * k];
  const add = (...vs) => vs.reduce((a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], [0, 0, 0]);
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const back = th > Math.PI / 2;
  const R = RF;
  const ink = C.inkC;
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

  // stage 0 .. .3: a bead in a red-brown cup; .3 .. 1: petals part, flatten, stamens fan out
  if (s < 0.001) return;
  if (s < 0.3) {
    const b = s / 0.3;
    const rb = R * (0.07 + 0.27 * b * b);
    const cy = R * 0.05 * b;
    // sepal cup first (behind/below), then the bead, then its lower half re-covered by the sepals
    const sepals = (front) => {
      const n = 5;
      for (let k = 0; k < n; k++) {
        const a = az0 + k * 2 * Math.PI / n;
        const sx = Math.cos(a) * rb * 0.62, sy = rb * 0.45 + Math.sin(a) * rb * 0.22;
        if ((Math.sin(a) > 0) !== front) continue;
        g.fillStyle = rgba(C.sepal, 0.92);
        g.beginPath(); g.ellipse(sx, cy + sy, Math.max(1.6, rb * 0.42), Math.max(1.4, rb * 0.36), a * 0.3, 0, 7); g.fill();
      }
    };
    if (b < 0.25) { // a pepper-seed bud: just the dark sepals
      g.fillStyle = rgba(C.sepal, 0.95);
      for (let k = 0; k < 3; k++) { const a = az0 + k * 2.1; g.beginPath(); g.ellipse(Math.cos(a) * 1.6, Math.sin(a) * 1.4, 2.4 + b * 6, 2 + b * 5, a, 0, 7); g.fill(); }
      return;
    }
    sepals(false);
    const grd = g.createRadialGradient(0, cy + rb * 0.3, rb * 0.1, 0, cy, rb);
    grd.addColorStop(0, rgba(C.rose, 0.55)); grd.addColorStop(1, rgba(C.pap, 1));
    g.fillStyle = rgba(C.pap, 1); g.beginPath(); g.arc(0, cy - rb * 0.2, rb, 0, 7); g.fill();
    g.fillStyle = grd; g.globalAlpha = 0.9; g.beginPath(); g.arc(0, cy - rb * 0.2, rb, 0, 7); g.fill(); g.globalAlpha = 1;
    pressureArc(g, (t) => { const a = -Math.PI / 2 + 0.5 + t * (2 * Math.PI - 1.0); return [Math.cos(a) * rb, cy - rb * 0.2 + Math.sin(a) * rb]; }, 1.2 + b * 1.1, C.lineC, 1);
    sepals(true);
    return;
  }
  const o = smooth(0.3, 0.92, s);               // how open
  const alpha = 0.55 + 1.0 * o;                  // cup angle from the axis (rad)
  const pr = R * (0.36 + 0.16 * o);              // petal radius
  const items = [];
  for (let k = 0; k < 5; k++) {
    const phi = az0 + k * 2 * Math.PI / 5 + pj[k].a;
    const rk = add(P(e1, Math.cos(phi)), P(e2, Math.sin(phi)));
    const pk = add(P(rk, Math.sin(alpha)), P(A, Math.cos(alpha)));
    const tk = cross(A, rk);
    const c = add(P(pk, pr * 0.92 * pj[k].s), P(A, R * 0.04));
    items.push({ kind: 'petal', z: c[2], c, pk, tk, r: pr * pj[k].s, w: pj[k].w });
    // a sepal between this petal and the next, folded back behind the corolla
    const ps = phi + Math.PI / 5;
    const rs = add(P(e1, Math.cos(ps)), P(e2, Math.sin(ps)));
    const sig = 0.9 + 1.0 * o;
    const sd = add(P(rs, Math.sin(sig)), P(A, Math.cos(sig)));
    const sc = add(P(sd, R * 0.17), P(A, -R * 0.06));
    items.push({ kind: 'sepal', z: sc[2] - 0.5, c: sc, d: sd });
  }
  items.sort((a, b) => a.z - b.z);
  const proj = (v) => [v[0], v[1]];
  const drawStamens = () => {
    const sp = 0.15 + 1.0 * smooth(0.45, 1, s), L = R * (0.2 + 0.5 * smooth(0.4, 1, s));
    for (const q of st) {
      const az = q.az, b = sp * q.sp;
      const rk = add(P(e1, Math.cos(az)), P(e2, Math.sin(az)));
      const d = add(P(rk, Math.sin(b)), P(A, Math.cos(b)));
      const base = P(A, R * 0.06);
      const tip = add(base, P(d, L * q.len));
      const [x0, y0] = proj(base), [x1, y1] = proj(tip);
      g.lineCap = 'round'; g.strokeStyle = ink;
      if (C.dots) {
        // Jin Nong's way: no filaments, just short black dashes and dots round the heart
        const xm = x0 + (x1 - x0) * 0.55, ym = y0 + (y1 - y0) * 0.55;
        g.globalAlpha = 0.9; g.lineWidth = 1.5 + q.dot * 0.5;
        g.beginPath(); g.moveTo(xm, ym); g.lineTo(x1, y1); g.stroke();
      } else {
        g.globalAlpha = 0.45; g.lineWidth = 0.9;
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      }
      g.globalAlpha = 0.85; g.fillStyle = ink;
      g.beginPath(); g.ellipse(x1, y1, q.dot * (C.dots ? 1.3 : 1), q.dot * 0.8, Math.atan2(y1 - y0, x1 - x0), 0, 7); g.fill();
      g.globalAlpha = 1;
    }
  };
  let stamensDone = back;
  for (const it of items) {
    if (it.kind === 'sepal') {
      const [x, y] = proj(it.c), [dx, dy] = proj(it.d);
      const ang = Math.atan2(dy, dx), len = Math.hypot(dx, dy);
      g.fillStyle = rgba(C.sepal, 0.9);
      g.beginPath(); g.ellipse(x, y, R * 0.16 * Math.max(0.45, len), R * 0.12, ang, 0, 7); g.fill();
      continue;
    }
    if (!stamensDone && th > 0.6 && th < 1.0 && it.z > R * 0.25) { drawStamens(); stamensDone = true; }
    // petal: a disc in the plane (tk, pk), outlined as a C open at its base
    const pt = (a, k = 1) => {
      const rr = it.r * k * (1 + 0.035 * Math.sin(3 * a + it.w) - 0.07 * Math.exp(-Math.pow((a - Math.PI / 2) / 0.22, 2)));
      const v = add(it.c, P(it.tk, Math.cos(a) * rr), P(it.pk, Math.sin(a) * rr));
      return proj(v);
    };
    g.beginPath();
    for (let i = 0; i <= 40; i++) { const [x, y] = pt(i / 40 * Math.PI * 2); i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.closePath();
    g.fillStyle = rgba(C.pap, 0.97); g.fill();
    // a touch of rose wash, pooled toward the base of the petal
    const [bx, by] = pt(-Math.PI / 2, 0.7), [cx, cy] = proj(it.c);
    const grd = g.createRadialGradient(bx, by, 0, cx, cy, it.r * 1.15);
    grd.addColorStop(0, rgba(C.rose, 0.44 - 0.12 * o)); grd.addColorStop(0.5, rgba(C.rose, 0.1)); grd.addColorStop(1, rgba(C.rose, 0));
    g.fillStyle = grd; g.fill();
    const gap = 0.42 + 0.1 * Math.sin(it.w);
    pressureArc(g, (t) => pt(-Math.PI / 2 + gap + t * (2 * Math.PI - 2 * gap)), 1.9, C.lineC, 1);
  }
  if (!stamensDone) drawStamens();
  // the receptacle seen from behind
  if (back) {
    const [x, y] = proj(P(A, -R * 0.05));
    g.fillStyle = rgba(C.sepal, 0.9); g.beginPath(); g.ellipse(x, y, R * 0.07, R * 0.06, 0, 0, 7); g.fill();
  }
}

// a fine line with brush pressure: heavier where it starts, thinning as it leaves
// a brush line, not a pen: heavier where it lands, thinning as it leaves, its weight wandering,
// and now and then the hairs skip and leave a small break
let arcSeed = 1;
function pressureArc(g, f, w, ink, alpha) {
  g.strokeStyle = ink; g.lineCap = 'round'; g.globalAlpha = alpha;
  const n = 32; let [px, py] = f(0);
  const sd = (arcSeed = (arcSeed * 16807) % 2147483647) / 2147483647 * 100;
  for (let i = 1; i <= n; i++) {
    const t = i / n, [x, y] = f(t);
    const wob = 0.65 + 0.7 * vnoise(t * 5 + sd, sd, 21);
    const skip = vnoise(t * 9 + sd * 1.7, sd, 22) < 0.17 && t > 0.15 && t < 0.95;
    g.lineWidth = w * wob * (0.5 + 0.85 * Math.sin(Math.PI * Math.min(1, t * 1.25 + 0.12)) * (1 - 0.4 * t));
    if (!skip) { g.beginPath(); g.moveTo(px, py); g.lineTo(x, y); g.stroke(); }
    px = x; py = y;
  }
  g.globalAlpha = 1;
}

// ---------- WebGL ----------
const VS_WOOD = `
attribute vec2 aPos; attribute vec2 aUV; attribute vec4 aK; attribute vec3 aK2;
uniform vec2 uSize; uniform float uTop;
varying vec2 vUV; varying vec4 vK; varying vec3 vK2; varying vec2 vPage;
void main(){
  vUV = aUV; vK = aK; vK2 = aK2; vPage = vec2(aPos.x, aPos.y + uTop);
  vec2 c = aPos / uSize * 2.0 - 1.0;
  gl_Position = vec4(c.x, -c.y, 0.0, 1.0);
}`;
const FS_WOOD = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uTex; uniform vec3 uInk; uniform float uDpr; uniform float uMode;
varying vec2 vUV; varying vec4 vK; varying vec3 vK2; varying vec2 vPage;
float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),u.x), mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),u.x), u.y); }
void main(){
  float u = vUV.x, v = vUV.y;
  float r = max(vK.x, 0.25), tone = vK.y, old = vK.z, seed = vK.w, dry = vK2.x, faint = vK2.y, prog = vK2.z;
  float side = v < 0.0 ? 0.0 : 1.0;
  float d = abs(v);
  float g = texture2D(uTex, vPage / vec2(256.0, 64.0)).g - 0.5;
  // the outline: broken and ragged on the old wood, more so where the brush lifts dry
  float n1 = vn(vec2(u*0.05/(0.5+0.1*r) + seed*17.0, side*7.3 + seed*3.0));
  float n2 = vn(vec2(u*0.32 + seed*5.0, side*3.1 + 11.0));
  float n3 = vn(vec2(u*0.9 + seed*9.0, side*5.7 + 2.0));
  float lift = smoothstep(0.55, 1.0, prog);
  float n0 = vn(vec2(u*0.022/(0.5+0.06*r) + seed*23.0, side*5.0 + seed*7.0));
  float edge = 1.0 + old*(0.26*(n0 - 0.35) - 0.12*n1 - 0.12*n2 - 0.08*n3 - 0.3*lift*n2) - (1.0-old)*(0.05*n1 + 0.04*n3);
  float aa = 0.8/(r*uDpr) + 0.015;
  float mask = 1.0 - smoothstep(edge - aa, edge + aa, d);
  if (mask <= 0.0) discard;
  float t = d / edge;
  // young wood: wet, even ink, a shade darker where it pooled at the very edge
  float wet = 0.9 + 0.12*smoothstep(0.6, 0.98, t) - 0.05*n2;
  // old wood: flat, nearly black wet ink, the painting's own unevenness, and flying white:
  // long streaks along the stroke where the bristles ran dry, more toward the stroke's end
  float lanes = 0.8*vn(vec2(v*r*0.2 + seed*31.0, u*0.0022 + seed*9.0)) + 0.2*vn(vec2(v*r*0.75 + 5.0, u*0.006 + seed));
  float dryness = dry*(0.05 + 1.05*smoothstep(0.1, 0.95, prog));
  float thr = dryness*0.8;
  float ink = smoothstep(thr - 0.04, thr + 0.04, lanes + g*0.14);
  if (uMode > 0.5) {
    // old wood goes into the wash buffer: coverage (unioned), how much ink the bristles left,
    // where a dark accent runs, and how many strokes overlap here
    float soft = 1.0 - smoothstep(edge - aa*2.2 - 0.05, edge + aa, d);
    float accSide = step(0.5, fract(seed*7.13)) > 0.5 ? step(0.0, v) : step(v, 0.0);
    float acc = tone > 0.99 ? 1.0 : smoothstep(0.72, 0.96, t) * accSide * smoothstep(0.55, 0.8, vn(vec2(u*0.012 + seed*3.0, seed)));
    float m = soft * faint;
    gl_FragColor = vec4(m, ink*m, acc*m, m*0.5);
    return;
  }
  float dens = wet;
  dens *= 1.0 + g*0.16;
  float a = clamp(dens*tone, 0.0, 1.0) * mask * faint;
  gl_FragColor = vec4(uInk*a, a);
}`;
// the old wood's wash, painted wet-into-wet: one grey shape from all its strokes, darker where it
// pooled at the edges and the lower side and where strokes overlap, lighter where the brush ran dry
const VS_WASH = `
attribute vec2 aPos; varying vec2 vUV;
void main(){ vUV = aPos*0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;
const FS_WASH = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uWash; uniform sampler2D uTex; uniform vec2 uRes; uniform vec2 uSize; uniform float uTop; uniform float uDpr; uniform vec3 uInk;
varying vec2 vUV;
float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),u.x), mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),u.x), u.y); }
void main(){
  vec4 w = texture2D(uWash, vUV);
  vec2 px = 1.0 / uRes; float s = 2.6*uDpr;
  float b = 0.0;
  b += texture2D(uWash, vUV + vec2( s, 0.0)*px).r + texture2D(uWash, vUV + vec2(-s, 0.0)*px).r;
  b += texture2D(uWash, vUV + vec2(0.0,  s)*px).r + texture2D(uWash, vUV + vec2(0.0, -s)*px).r;
  b += texture2D(uWash, vUV + vec2( s,  s)*px*0.7).r + texture2D(uWash, vUV + vec2(-s, -s)*px*0.7).r;
  b += texture2D(uWash, vUV + vec2( s, -s)*px*0.7).r + texture2D(uWash, vUV + vec2(-s,  s)*px*0.7).r;
  b *= 0.125;
  float c = w.r;
  if (c < 0.002 && b < 0.002) discard;
  vec2 page = vec2(vUV.x*uSize.x, (1.0 - vUV.y)*uSize.y + uTop);
  float g = texture2D(uTex, page / vec2(256.0, 64.0)).g - 0.5;
  float lf = 0.6*vn(page*0.011) + 0.4*vn(page*0.034 + 7.0);
  float inkF = clamp(w.g / max(c, 1e-3), 0.0, 1.0);
  float acc = clamp(w.b / max(c, 1e-3), 0.0, 1.0);
  float rim = clamp((c - b)*2.4, 0.0, 1.0);
  float below = texture2D(uWash, vUV - vec2(0.0, 3.5*uDpr)*px).r;
  float pool = clamp(c - below, 0.0, 1.0);
  float overlap = clamp(w.a*2.0 - 1.0, 0.0, 1.0);
  float dens = 0.5 + 0.26*(lf - 0.5);
  dens += 0.13*rim + 0.2*pool + 0.13*overlap;
  dens *= mix(0.32, 1.0, inkF);
  dens = mix(dens, 0.9, acc*0.85);
  dens *= 1.0 + g*0.34;
  float a = clamp(dens, 0.0, 1.0)*c + 0.06*b*(1.0 - c);
  gl_FragColor = vec4(uInk*a, a);
}`;
const VS_SPR = `
attribute vec2 aPos; attribute vec2 aUV; attribute float aA;
uniform vec2 uSize; varying vec2 vUV; varying float vA;
void main(){ vUV = aUV; vA = aA; vec2 c = aPos / uSize * 2.0 - 1.0; gl_Position = vec4(c.x, -c.y, 0.0, 1.0); }`;
const FS_SPR = `
precision mediump float;
uniform sampler2D uTex; varying vec2 vUV; varying float vA;
void main(){ gl_FragColor = texture2D(uTex, vUV) * vA; }`;

function makeGL(canvas) {
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true, preserveDrawingBuffer: false });
  if (!gl) return null;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const prog = (vs, fs) => { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p; };
  const wood = prog(VS_WOOD, FS_WOOD), spr = prog(VS_SPR, FS_SPR), wash = prog(VS_WASH, FS_WASH);
  const quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
  return { gl, wood, spr, wash, quad, minmax: gl.getExtension('EXT_blend_minmax'), woodBuf: gl.createBuffer(), washBuf: gl.createBuffer(), sprBuf: gl.createBuffer(), fbo: null, fboTex: null, fboW: 0, fboH: 0 };
}
function texture(gl, src, repeat) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, !repeat);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  const w = repeat ? gl.MIRRORED_REPEAT : gl.CLAMP_TO_EDGE;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, w); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, w);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  return t;
}

// ---------- the component ----------
export function branchGrowth(el, options = {}) {
  if (el._branchGrowth) return el._branchGrowth;
  const ds = el.dataset;
  const opts = { ...DEFAULTS };
  if (ds.seed) opts.seed = +ds.seed;
  if (ds.avoid) opts.avoid = ds.avoid;
  if (ds.lead) opts.lead = +ds.lead;
  if (ds.density) opts.density = +ds.density;
  if (ds.limbs) opts.limbs = +ds.limbs;
  if (ds.blossoms) opts.blossoms = +ds.blossoms;
  if (ds.ink) opts.ink = ds.ink;
  if (ds.paper) opts.paper = ds.paper;
  if (ds.assets) opts.assets = ds.assets;
  Object.assign(opts, options);

  el.classList.add('bgr-host');
  const layer = document.createElement('div'); layer.className = 'bgr-layer'; layer.setAttribute('aria-hidden', 'true');
  const canvas = document.createElement('canvas'); canvas.className = 'bgr-canvas';
  layer.appendChild(canvas); el.prepend(layer);

  let lastW = el.clientWidth, lastH = el.scrollHeight, rt = 0;
  let G = null, tree = null, atlasTex = null, inkTex = null, dead = false, raf = 0, visible = true;
  let tauShown = null, tauTarget = 0, manual = null, lastT = 0, canvasTop = 0, canvasH = 0, dpr = 1, lastKey = '';
  let woodData = new Float32Array(1 << 16), washData = new Float32Array(1 << 16), sprData = new Float32Array(1 << 14);
  let radius = new Float32Array(0), w = new Float32Array(0);
  let lastBloom = 0, lastTau = 0, drawMs = 0;
  const cs = getComputedStyle(el);
  const ink = parseColor(opts.ink || cs.getPropertyValue('--ink'), '#141312');
  const paper = parseColor(opts.paper || cs.getPropertyValue('--paper'), '#f3f0e8');
  const base = opts.assets ? new URL(opts.assets, location.href) : null;
  let images = null;

  function hostTop() { return el.getBoundingClientRect().top + scrollY; }

  async function init() {
    try { await document.fonts.ready; } catch (e) {}
    try {
      // each file named in full (not by folder) so bundlers copy them
      images = await Promise.all(opts.assets
        ? [loadImage(new URL('ink-texture.png', base)), loadImage(new URL('moss-dots.png', base))]
        : [loadImage(new URL('./assets/ink-texture.png', import.meta.url)), loadImage(new URL('./assets/moss-dots.png', import.meta.url))]);
    } catch (e) { images = [null, null]; }
    if (dead) return;
    try { G = makeGL(canvas); } catch (e) { G = null; console.warn('branch-growth: no WebGL', e); }
    if (!G) { layer.remove(); return; }
    const { gl } = G;
    if (images[0]) inkTex = texture(gl, images[0], true);
    else { const c = document.createElement('canvas'); c.width = c.height = 2; const x = c.getContext('2d'); x.fillStyle = 'rgb(110,128,128)'; x.fillRect(0, 0, 2, 2); inkTex = texture(gl, c, true); }
    atlasTex = texture(gl, buildAtlas(images[1], ink, paper, opts.seed), false);
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); G = null; });
    rebuild();
  }

  function rebuild() {
    if (dead || !G) return;
    const t0 = performance.now();
    const layout = measure(el, opts);
    tree = grow(layout, opts, innerHeight);
    lastW = layout.W; lastH = layout.H;
    radius = new Float32Array(tree.N); w = new Float32Array(tree.N);
    tree.ms = performance.now() - t0;
    lastKey = '';
    tauShown = null;
    request();
  }

  // scroll -> how far into the season
  function targetTau() {
    if (!tree) return 0;
    if (reduceMQ.matches) return tree.tauEnd;
    if (manual != null) return manual * tree.tauEnd;
    const vh = innerHeight;
    const y0 = scrollY - hostTop();
    const maxY = Math.max(1, document.documentElement.scrollHeight - vh - hostTop());
    const raw = y0 + vh * opts.lead;
    const endRaw = maxY + vh * opts.lead;
    const extra = Math.max(0, tree.tauEnd - endRaw) * smooth(maxY - 1.4 * vh, maxY, y0);
    return raw + extra;
  }

  function request() { if (!raf && !dead) raf = requestAnimationFrame(frame); }
  function frame(now) {
    raf = 0;
    if (!G || !tree || dead) return;
    const dt = lastT ? Math.min(0.1, (now - lastT) / 1000) : 0.016; lastT = now;
    tauTarget = targetTau();
    if (tauShown == null || reduceMQ.matches) { tauShown = tauTarget; lastTau = tauTarget; }
    else tauShown += (tauTarget - tauShown) * (1 - Math.exp(-dt / 0.16));
    const settled = Math.abs(tauTarget - tauShown) < 0.6;
    if (settled) tauShown = tauTarget;
    if (visible) { const t0 = performance.now(); draw(tauShown); drawMs = performance.now() - t0; }
    if (!settled) request(); else lastT = 0;
  }

  function draw(tau) {
    const { gl } = G;
    const vh = innerHeight, W = el.clientWidth, H = tree.H;
    dpr = Math.min(2, devicePixelRatio || 1);
    const over = Math.round(vh * 0.25);
    canvasH = Math.min(H, vh + 2 * over);
    const y0 = scrollY - hostTop();
    canvasTop = clamp(Math.round(y0 - over), 0, Math.max(0, H - canvasH));
    const cw = Math.round(W * dpr), ch = Math.round(canvasH * dpr);
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw; canvas.height = ch; canvas.style.width = W + 'px'; canvas.style.height = canvasH + 'px';
    }
    const key = `${tau.toFixed(1)}|${canvasTop}|${cw}x${ch}`;
    if (key === lastKey) return; lastKey = key;
    canvas.style.transform = `translate3d(0,${canvasTop}px,0)`;

    // pipe model at this moment: r^g = sum over the living children
    const { N, BIRTH, PAR, FLAG, PREMIN, P, V } = tree;
    const r0g = Math.pow(P.r0, GAMMA);
    w.fill(0);
    for (let i = N - 1; i >= 0; i--) {
      if (BIRTH[i] - V > tau) { radius[i] = 0; continue; }
      const f = clamp((tau - (BIRTH[i] - V)) / V, 0, 1);
      const wi = w[i] > 0 ? w[i] : r0g * f;
      let r = Math.min(P.rMax, Math.pow(wi, 1 / GAMMA));
      if (PREMIN[i] > r) r = PREMIN[i];
      radius[i] = r;
      if (PAR[i] >= 0) w[PAR[i]] += wi;
    }

    gl.viewport(0, 0, cw, ch);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    // ---- wood ----
    const top = canvasTop, bot = canvasTop + canvasH;
    let wn = 0, hn = 0, toWash = false;
    const push = (x, y, u, v, r, tone, old, seed, dry, faint, prog) => {
      if (toWash) {
        if (hn + 11 > washData.length) { const b = new Float32Array(washData.length * 2); b.set(washData); washData = b; }
        washData[hn++] = x; washData[hn++] = y - top; washData[hn++] = u; washData[hn++] = v; washData[hn++] = r; washData[hn++] = tone;
        washData[hn++] = old; washData[hn++] = seed; washData[hn++] = dry; washData[hn++] = faint; washData[hn++] = prog;
        return;
      }
      if (wn + 11 > woodData.length) { const b = new Float32Array(woodData.length * 2); b.set(woodData); woodData = b; }
      woodData[wn++] = x; woodData[wn++] = y - top; woodData[wn++] = u; woodData[wn++] = v;
      woodData[wn++] = r; woodData[wn++] = tone; woodData[wn++] = old; woodData[wn++] = seed;
      woodData[wn++] = dry; woodData[wn++] = faint; woodData[wn++] = prog;
    };
    const E = 1.5;
    // one brush stroke along points q (x, y, r, faint, s): radius already shaped, `off` shifts it across
    const qx = [], qy = [], qr = [], qf = [], qs = [];
    function ribbon(tone, old, seed, dry, sA, sB) {
      const m = qx.length; if (m < 2) return;
      let lnx = 0, lny = 0, lx = 0, ly = 0, lr = 0, lu = 0, lf = 0, lp = 0;
      for (let k = 0; k < m; k++) {
        let tx, ty;
        if (k === 0) { tx = qx[1] - qx[0]; ty = qy[1] - qy[0]; }
        else if (k === m - 1) { tx = qx[k] - qx[k - 1]; ty = qy[k] - qy[k - 1]; }
        else {
          const ax = qx[k] - qx[k - 1], ay = qy[k] - qy[k - 1], bx = qx[k + 1] - qx[k], by = qy[k + 1] - qy[k];
          const la = Math.hypot(ax, ay) || 1, lb = Math.hypot(bx, by) || 1;
          tx = ax / la + bx / lb; ty = ay / la + by / lb;
        }
        const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
        const nx = -ty, ny = tx, r = Math.max(0.05, qr[k]), u = qs[k] + seed * 400;
        const prog = clamp((qs[k] - sA) / Math.max(1, sB - sA), 0, 1);
        if (k > 0) {
          const R0 = lr * E, R1 = r * E;
          const a = [lx + lnx * R0, ly + lny * R0, lu, E, lr, lf, lp], b = [lx - lnx * R0, ly - lny * R0, lu, -E, lr, lf, lp];
          const c = [qx[k] + nx * R1, qy[k] + ny * R1, u, E, r, qf[k], prog], d = [qx[k] - nx * R1, qy[k] - ny * R1, u, -E, r, qf[k], prog];
          for (const q of [a, b, c, b, d, c]) push(q[0], q[1], q[2], q[3], q[4], tone, old, seed, dry, q[5], q[6]);
        }
        lnx = nx; lny = ny; lx = qx[k]; ly = qy[k]; lr = r; lu = u; lf = qf[k]; lp = prog;
      }
    }
    const { X, Y } = tree;
    const px = [], py = [], pr = [], pf = [], sl = [], nxs = [], nys = [];
    for (const s of tree.strokes) {
      if (s.y1 < top || s.y0 > bot) continue;
      const ns = s.nodes;
      px.length = py.length = pr.length = pf.length = 0;
      let done = true;
      for (let k = 0; k < ns.length; k++) {
        const n = ns[k];
        if (radius[n] <= 0) { done = false; break; }
        const f = clamp((tau - (BIRTH[n] - V)) / V, 0, 1);
        const fa = FLAG[n] & tree.INTEXT ? 0.32 : 1;
        if (k > 0 && f < 1) {
          done = false;
          const p = ns[k - 1];
          px.push(X[p] + (X[n] - X[p]) * f); py.push(Y[p] + (Y[n] - Y[p]) * f); pr.push(radius[n]); pf.push(fa);
          break;
        }
        px.push(X[n]); py.push(Y[n]); pr.push(k === 0 && s.joint >= 0 ? radius[ns[1] ?? n] || radius[n] : radius[n]); pf.push(fa);
      }
      if (px.length < 2) continue;
      // a side shoot starts at the edge of the wood it leaves, not at its centre line
      let s0 = 0;
      if (s.joint >= 0) {
        let cut = radius[s.joint] * 0.6;
        while (px.length > 2 && cut > 0) {
          const seg = Math.hypot(px[1] - px[0], py[1] - py[0]);
          if (seg > cut) break;
          cut -= seg; s0 += seg; px.shift(); py.shift(); pr.shift(); pf.shift();
        }
        const seg = Math.hypot(px[1] - px[0], py[1] - py[0]);
        if (cut > 0 && seg > cut) { const f = cut / seg; px[0] += (px[1] - px[0]) * f; py[0] += (py[1] - py[0]) * f; s0 += cut; }
      }
      const m = px.length;
      sl.length = 0; sl.push(s0); for (let k = 1; k < m; k++) sl.push(sl[k - 1] + Math.hypot(px[k] - px[k - 1], py[k] - py[k - 1]));
      const L = sl[m - 1]; if (L - s0 < 0.5) continue;
      nxs.length = nys.length = 0;
      for (let k = 0; k < m; k++) {
        const a = Math.max(0, k - 1), b = Math.min(m - 1, k + 1);
        let tx = px[b] - px[a], ty = py[b] - py[a]; const tl = Math.hypot(tx, ty) || 1;
        nxs.push(-ty / tl); nys.push(tx / tl);
      }
      if (s.subs) {
        // old wood: several overlapping strokes, one per stretch between knots, each pressed where it
        // lands and lifted, dry and split, where it leaves
        for (const b of s.subs) {
          if (b.a >= L) continue;
          const B = Math.min(b.b, L);
          qx.length = qy.length = qr.length = qf.length = qs.length = 0;
          const at = (S) => { // interpolate the stroke at arc length S
            let k = 1; while (k < m - 1 && sl[k] < S) k++;
            const t = clamp((S - sl[k - 1]) / Math.max(1e-3, sl[k] - sl[k - 1]), -0.5, 1);
            return [px[k - 1] + (px[k] - px[k - 1]) * t, py[k - 1] + (py[k] - py[k - 1]) * t, pr[k - 1] + (pr[k] - pr[k - 1]) * clamp(t, 0, 1), pf[k], nxs[k - 1], nys[k - 1]];
          };
          const add = (S, p) => {
            const prog = (S - b.a) / (b.b - b.a);
            let r = p[2] * b.wf;
            r *= 0.8 + 0.2 * smooth(0, Math.max(3, p[2] * 0.7), S - b.a);             // the brush lands, round
            r *= 1 + 0.12 * Math.exp(-(S - b.a) / Math.max(3, p[2] * 0.8));          // press
            r *= 0.08 + 0.92 * Math.pow(1 - smooth(0.4, 1, prog), 0.9);               // lift
            if (!done && B < b.b) r *= 0.2 + 0.8 * smooth(0, 10 + p[2] * 2, B - S);    // still being painted
            const o = b.off * p[2];
            qx.push(p[0] + p[4] * o); qy.push(p[1] + p[5] * o); qr.push(r); qf.push(p[3]); qs.push(S);
          };
          const A = Math.max(b.a, s0 - 4);
          { // a round landing: a half disc of brush before the stroke proper
            const p0 = at(A), rr = p0[2] * b.wf * 0.8, tl = Math.hypot(p0[5], p0[4]) || 1;
            const tx = p0[5] / tl, ty = -p0[4] / tl, o = b.off * p0[2];
            for (let j = 4; j >= 1; j--) {
              const d = rr * j / 4.5;
              qx.push(p0[0] + p0[4] * o - tx * d); qy.push(p0[1] + p0[5] * o - ty * d);
              qr.push(rr * Math.sqrt(Math.max(0.04, 1 - (j / 4.5) ** 2))); qf.push(p0[3]); qs.push(A - d);
            }
          }
          add(A, at(A));
          for (let k = 0; k < m; k++) if (sl[k] > A && sl[k] < B) add(sl[k], [px[k], py[k], pr[k], pf[k], nxs[k], nys[k]]);
          add(B, at(B));
          toWash = true; ribbon(b.tone, 1, b.seed, b.dry, b.a, b.b); toWash = false;
        }
        continue;
      }
      // young wood: one stroke, pressed at the base, tapering to a fine lifted tip
      qx.length = qy.length = qr.length = qf.length = qs.length = 0;
      {
        const back = Math.min(pr[0] * 0.9, 4);
        qx.push(px[0] - nys[0] * back); qy.push(py[0] + nxs[0] * back); qr.push(pr[0] * 0.55); qf.push(pf[0]); qs.push(sl[0] - back);
      }
      const endR = pr[m - 1], stub = done && endR > 3;
      for (let k = 0; k < m; k++) {
        let r = pr[k];
        const toEnd = L - sl[k], from = sl[k] - s0;
        const taperLen = stub ? Math.min(L * 0.5, 3 + endR * 1.1) : Math.min((L - s0) * 0.7, 14 + r * 8);
        r *= (stub ? 0.5 : 0.07) + (stub ? 0.5 : 0.93) * Math.pow(smooth(0, taperLen, toEnd), 0.75);
        r *= 1 + 0.45 * Math.exp(-from / (2 + r * 2.2));
        qx.push(px[k]); qy.push(py[k]); qr.push(r); qf.push(pf[k]); qs.push(sl[k]);
      }
      const old = clamp((pr[0] - 1.8) / 4, 0, 1) * 0.6;
      ribbon(s.tone, old, s.seed, s.dry * 0.6, s0, L);
    }
    const drawWood = (data, n, mode) => {
      const p = G.wood; gl.useProgram(p);
      gl.bindBuffer(gl.ARRAY_BUFFER, mode ? G.washBuf : G.woodBuf);
      gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, n), gl.STREAM_DRAW);
      const S = 44;
      const at = (name, size, off) => { const l = gl.getAttribLocation(p, name); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, S, off); };
      at('aPos', 2, 0); at('aUV', 2, 8); at('aK', 4, 16); at('aK2', 3, 32);
      gl.uniform2f(gl.getUniformLocation(p, 'uSize'), W, canvasH);
      gl.uniform1f(gl.getUniformLocation(p, 'uTop'), top);
      gl.uniform1f(gl.getUniformLocation(p, 'uDpr'), dpr);
      gl.uniform1f(gl.getUniformLocation(p, 'uMode'), mode);
      gl.uniform3f(gl.getUniformLocation(p, 'uInk'), ink[0], ink[1], ink[2]);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, inkTex);
      gl.uniform1i(gl.getUniformLocation(p, 'uTex'), 0);
      gl.drawArrays(gl.TRIANGLES, 0, n / 11);
      for (const k of ['aPos', 'aUV', 'aK', 'aK2']) gl.disableVertexAttribArray(gl.getAttribLocation(p, k));
    };
    if (hn) {
      // 1. every stroke of the old wood into one wash buffer (union, not layers: no seams)
      if (!G.fbo || G.fboW !== cw || G.fboH !== ch) {
        if (G.fbo) { gl.deleteFramebuffer(G.fbo); gl.deleteTexture(G.fboTex); }
        G.fboTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, G.fboTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, cw, ch, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
        G.fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, G.fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, G.fboTex, 0);
        G.fboW = cw; G.fboH = ch;
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, G.fbo);
      gl.viewport(0, 0, cw, ch); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      if (G.minmax) { gl.blendEquationSeparate(G.minmax.MAX_EXT, gl.FUNC_ADD); gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ONE, gl.ONE); }
      else { gl.blendEquation(gl.FUNC_ADD); gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_COLOR, gl.ONE, gl.ONE); }
      drawWood(washData, hn, 1);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      // 2. the wash itself, toned
      const p = G.wash; gl.useProgram(p);
      gl.bindBuffer(gl.ARRAY_BUFFER, G.quad);
      const l = gl.getAttribLocation(p, 'aPos'); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 2, gl.FLOAT, false, 8, 0);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, G.fboTex); gl.uniform1i(gl.getUniformLocation(p, 'uWash'), 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, inkTex); gl.uniform1i(gl.getUniformLocation(p, 'uTex'), 1);
      gl.uniform2f(gl.getUniformLocation(p, 'uRes'), cw, ch);
      gl.uniform2f(gl.getUniformLocation(p, 'uSize'), W, canvasH);
      gl.uniform1f(gl.getUniformLocation(p, 'uTop'), top);
      gl.uniform1f(gl.getUniformLocation(p, 'uDpr'), dpr);
      gl.uniform3f(gl.getUniformLocation(p, 'uInk'), ink[0], ink[1], ink[2]);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.disableVertexAttribArray(l);
      gl.activeTexture(gl.TEXTURE0);
    }
    // 3. the young wood, stroke by stroke on top
    if (wn) drawWood(woodData, wn, 0);

    // ---- moss dots and blossoms ----
    let sn = 0;
    const AW = NS * CELL, AH = NV * CELL + 128;
    const quad = (cx, cy, size, rot, u0, v0, u1, v1, a) => {
      if (sn + 30 > sprData.length) { const b = new Float32Array(sprData.length * 2); b.set(sprData); sprData = b; }
      const c = Math.cos(rot) * size / 2, s = Math.sin(rot) * size / 2;
      const P4 = [[-c + s, -s - c], [c + s, s - c], [c - s, s + c], [-c - s, -s + c]];
      const U4 = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
      for (const i of [0, 1, 2, 0, 2, 3]) {
        sprData[sn++] = cx + P4[i][0]; sprData[sn++] = cy - top + P4[i][1];
        sprData[sn++] = U4[i][0]; sprData[sn++] = U4[i][1]; sprData[sn++] = a;
      }
    };
    for (const d of tree.dots) {
      const n = d.node, r = radius[n];
      if (r <= 0 || Y[n] < top - 30 || Y[n] > bot + 30) continue;
      if (r < d.thr) continue;
      const a = d.thr ? smooth(d.thr, d.thr + 1.5, r) : 1;
      const nx = -tree.DY[n] * d.side, ny = tree.DX[n] * d.side;
      const x = X[n] + nx * r * d.out + tree.DX[n] * d.along, y = Y[n] + ny * r * d.out + tree.DY[n] * d.along;
      const col = d.spr % 16;
      const u0 = (col * 64) / AW, v0 = (NV * CELL) / AH;
      quad(x, y, d.size * 1.9, d.rot, u0, v0, u0 + 64 / AW, v0 + 64 / AH, a * ((FLAG[n] & tree.INTEXT) ? 0.25 : 1));
    }
    for (const p of tree.petals) {
      if (p.y < top - 30) continue; if (p.y > bot + 30) break;
      if (radius[p.node] <= 0 || tau < p.t0) continue;
      const u0 = (p.spr * 64) / AW, v0 = (NV * CELL + 64) / AH;
      quad(p.x, p.y, 64 * p.size / RF, p.rot, u0, v0, u0 + 64 / AW, v0 + 64 / AH, smooth(p.t0, p.t0 + 60, tau));
    }
    let bloomNow = false;
    const forward = tau > lastTau;
    for (const f of tree.flowers) {
      if (f.y < top - 40) continue; if (f.y > bot + 40) break;
      if (radius[f.node] <= 0) continue;
      const s = Math.min(f.maxS, (tau - f.t0) / f.dur);
      if (s <= 0) continue;
      if (forward && !f.fired && s >= 0.7) { f.fired = true; bloomNow = f; }
      if (s < 0.6) f.fired = false;
      const si = Math.round(s * (NS - 1));
      const u0 = si * CELL / AW, v0 = f.view * CELL / AH;
      const size = CELL * f.size / RF;
      quad(f.x, f.y, size, f.rot, u0, v0, u0 + CELL / AW, v0 + CELL / AH, f.faint);
    }
    lastTau = tau;
    if (sn) {
      const p = G.spr; gl.useProgram(p);
      gl.bindBuffer(gl.ARRAY_BUFFER, G.sprBuf);
      gl.bufferData(gl.ARRAY_BUFFER, sprData.subarray(0, sn), gl.STREAM_DRAW);
      const S = 20;
      const at = (name, size, off) => { const l = gl.getAttribLocation(p, name); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, S, off); };
      at('aPos', 2, 0); at('aUV', 2, 8); at('aA', 1, 16);
      gl.uniform2f(gl.getUniformLocation(p, 'uSize'), W, canvasH);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, atlasTex);
      gl.uniform1i(gl.getUniformLocation(p, 'uTex'), 0);
      gl.drawArrays(gl.TRIANGLES, 0, sn / 5);
      for (const n of ['aPos', 'aUV', 'aA']) gl.disableVertexAttribArray(gl.getAttribLocation(p, n));
    }
    if (bloomNow && performance.now() - lastBloom > 140) {
      lastBloom = performance.now();
      el.dispatchEvent(new CustomEvent('branch-growth:bloom', { bubbles: true, detail: { x: bloomNow.x, y: bloomNow.y } }));
    }
  }

  // ---- wiring ----
  const onScroll = () => request();
  addEventListener('scroll', onScroll, { passive: true });
  const ro = new ResizeObserver(() => {
    const W = el.clientWidth, H = el.scrollHeight;
    if (W === lastW && Math.abs(H - lastH) < 60 && tree) { request(); return; }
    lastW = W; lastH = H;
    clearTimeout(rt); rt = setTimeout(rebuild, 250);
  });
  ro.observe(el);
  const io = new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) request(); });
  io.observe(el);
  const onMQ = () => { lastKey = ''; request(); };
  reduceMQ.addEventListener?.('change', onMQ);
  init();

  const api = {
    growTo(p) { manual = p == null ? null : clamp(+p, 0, 1); lastKey = ''; request(); },
    redraw() { lastKey = ''; request(); },
    rebuild,
    get _tree() { return tree; },
    get state() {
      return tree ? { nodes: tree.N, strokes: tree.strokes.length, flowers: tree.flowers.length, dots: tree.dots.length, tau: tauShown, tauEnd: tree.tauEnd, buildMs: Math.round(tree.ms), drawMs: +drawMs.toFixed(2), running: !!raf, limbs: tree.limbs.map(l => [l.side, Math.round(l.mid)]), bands: tree.bands.map(b => [b.y0, b.y1]) } : null;
    },
    destroy() {
      dead = true; cancelAnimationFrame(raf); clearTimeout(rt);
      removeEventListener('scroll', onScroll); ro.disconnect(); io.disconnect();
      reduceMQ.removeEventListener?.('change', onMQ);
      if (G) { const ext = G.gl.getExtension('WEBGL_lose_context'); ext && ext.loseContext(); }
      layer.remove(); el.classList.remove('bgr-host'); delete el._branchGrowth;
    },
  };
  el._branchGrowth = api;
  return api;
}

// auto-start
for (const el of document.querySelectorAll('[data-branch-growth]')) branchGrowth(el);
