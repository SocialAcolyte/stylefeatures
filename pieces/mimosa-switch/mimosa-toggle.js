/*
 *  MIMOSA-TOGGLE // a switch that is a living frond of Mimosa pudica.
 *
 *  Markup:  <label>Sync <input type="checkbox" role="switch" data-mimosa-toggle checked></label>
 *  Or call  mimosaToggle(input, options)  yourself. Returns destroy(), which
 *  also carries destroy.set(), destroy.sync(), destroy.touch() and a few
 *  read-only props (checked, response, habituation, busy).
 *
 *  The real checkbox stays in charge. It is wrapped, made transparent and laid
 *  over the box, so the label, Space, forms and screen readers use it exactly
 *  as before; a canvas behind it draws one leaf of the sensitive plant.
 *
 *  The leaf is modelled as the plant builds it: a petiole from the stem with a
 *  swollen primary pulvinus at its base; at its tip two pairs of pinnae held
 *  like fingers, each on its own pinnar pulvinus; along each pinna 12 to 25
 *  pairs of small oblong leaflets, each on a pulvinule. Three tiers of motor
 *  organs, three actuators in the code (pulvinule f, pinna c, primary q).
 *
 *    ON  = open: leaflets flat, pinnae spread, petiole raised off the page.
 *    OFF = the stimulus. A signal leaves the touched point (or the pinna tips,
 *          for a key or a label click) and travels along the leaf at a fixed
 *          speed; each pair folds as it arrives (upward, so the upper faces
 *          press together and the paler undersides show), the pinnae converge
 *          when it reaches their bases, and last the whole petiole drops at
 *          the primary pulvinus.
 *    Back ON is slow: the petiole rises, the pinnae part, the leaflets reopen
 *          one by one, unevenly, over a couple of seconds.
 *
 *  Habituation: a fold that comes soon after another is weaker (amplitude
 *  1 - h, h decaying over ~12 s). Toggle quickly and the reflex fades until
 *  the leaf rests; the value is always right, and a habituated leaf closes
 *  afterwards, slowly, the way it does at dusk.
 *
 *  rAF runs only while something moves; offscreen or in a hidden tab it does
 *  not run at all (the motion is time-based, so it is simply further along
 *  when you look again). Reduced motion: every change is instant.
 */

const calm = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const mix = (a, b, t) => a + (b - a) * t;
const DEG = Math.PI / 180;

/* ---- tiny vector kit (model space: millimetres; x right, y up, z out of the page) ---- */
const V = (x, y, z) => [x, y, z];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lin = (a, s, b, t) => [a[0] * s + b[0] * t, a[1] * s + b[1] * t, a[2] * s + b[2] * t];

/* the house key light: from the upper left (azimuth 225deg, elevation 44deg, as
 * wax-seal), in front of the page; the camera looks straight at it */
const LIGHT = norm(V(-Math.cos(44 * DEG) * Math.SQRT1_2, Math.cos(44 * DEG) * Math.SQRT1_2, Math.sin(44 * DEG)));
const HALF = norm(add(LIGHT, V(0, 0, 1)));

function rng(seed) {
    return () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/* ---- easing ---- */
const EASE = {
    // turgor loss: the pulvinus gives way at once, then the leaflet coasts in
    turgor: (t) => 1 - Math.pow(1 - t, 2.6),
    // the petiole falls under its own weight and settles with a small bob
    drop: (t) => { const c = 0.9; const u = t - 1; return 1 + (c + 1) * u * u * u + c * u * u; },
    // recovery: water returning, slow at both ends
    swell: (t) => 0.5 - 0.5 * Math.cos(Math.PI * t),
    lin: (t) => t,
};

/* ---- actuators: one per motor organ. A value 0 (open) .. 1 (closed), the
 *  tween it is running and a queue of tweens waiting for their start time.
 *  Each tween is tagged with its kind so a new decision can drop the plans it
 *  replaces without touching a signal that is already on its way.            */
const actuator = (v) => ({ v, tw: null, q: [] });
function evalAt(a, t) {
    while (a.q.length && a.q[0].t0 <= t) {
        const n = a.q.shift();
        n.from = cur(a, n.t0);
        a.tw = n;
    }
    return cur(a, t);
}
function cur(a, t) {
    const w = a.tw;
    if (!w) return a.v;
    const p = clamp((t - w.t0) / w.dur);
    const v = w.from + (w.to - w.from) * w.ease(p);
    if (p >= 1) { a.v = w.to; a.tw = null; return a.v; }
    return v;
}
function plan(a, t0, to, dur, ease, kind) {
    const n = { t0, to, dur: Math.max(1, dur), ease, kind, from: 0 };
    let i = a.q.length;
    while (i > 0 && a.q[i - 1].t0 > t0) i--;
    a.q.splice(i, 0, n);
}
const drop = (a, kinds) => { a.q = a.q.filter((n) => !kinds.includes(n.kind)); };
const endOf = (a) => Math.max(a.tw ? a.tw.t0 + a.tw.dur : 0, ...a.q.map((n) => n.t0 + n.dur));
const busy = (a) => !!(a.tw || a.q.length);
const settle = (a, v) => { a.tw = null; a.q.length = 0; a.v = v; };

/* ---- the leaflet outline (unit template) -----------------------------------
 *  u runs base to tip, v across; +v is the acroscopic (forward) edge. Mimosa
 *  leaflets are linear-oblong, the base oblique with a small rounded auricle
 *  on the back edge, the tip acute and turned slightly forward, and the
 *  midvein runs close to the forward edge (eccentric), not down the middle. */
function leafletTemplate(n) {
    const g = (u) => Math.pow(Math.min(1, u / 0.09), 0.5) * Math.pow(1 - Math.pow(Math.max(0, (u - 0.5) / 0.5), 2.1), 0.62);
    const c = (u) => 0.16 * Math.pow(Math.max(0, (u - 0.55) / 0.45), 2);
    const fwd = [], back = [];
    for (let i = 0; i <= n; i++) {
        const u = i / n;
        fwd.push([u, c(u) + 0.36 * g(u)]);
        back.push([u, c(u) - 0.64 * g(u) * (1 + 0.22 * Math.exp(-Math.pow((u - 0.12) / 0.09, 2)))]);
    }
    const ring = [[0, 0.02], ...fwd.slice(1, -1), [1.04, c(1) + 0.01], ...back.slice(1, -1).reverse(), [0.004, -0.14]];
    return { ring, vein: [[0.03, 0.03], [0.5, c(0.5) + 0.02], [0.95, c(0.95) + 0.01]] };
}

/* ---- the plant ------------------------------------------------------------- */
const PRESET = {
    // compact: fewer, broader leaflets, so at 1x each one is a stroke you can see, not a texture
    compact: { petiole: 13, pinna: [41, 50], pairs: [11, 13], leaflet: 7.6, wid: 0.31, zNode: 4, tmpl: 6, detail: 0, theta: [16, -20], spread: 0.72 },
    hero:    { petiole: 30, pinna: [46, 56], pairs: [19, 23], leaflet: 8.4, wid: 0.27, zNode: 6, tmpl: 11, detail: 2, theta: [26, -32], spread: 1 },
};

function buildPlant(cfg, rand) {
    const P = PRESET[cfg.size] || PRESET.compact;
    const two = cfg.pinnae !== 1;
    const scaleN = (n) => Math.round(clamp(n * (cfg.leaflets / P.pairs[1]), 10, 25));
    // digitate: the inner pinnae longest, the pair of outer ones a little
    // shorter and set a millimetre or two lower on the very short rachis
    const spec = two ? [
        { g: -38, gc: -5.5, L: P.pinna[0], n: scaleN(P.pairs[0]), off: 1.6, bend: -0.10 },
        { g: -12, gc: -1.6, L: P.pinna[1], n: scaleN(P.pairs[1]), off: 0, bend: -0.03 },
        { g: 12, gc: 1.6, L: P.pinna[1] * 0.97, n: scaleN(P.pairs[1]), off: 0, bend: 0.03 },
        { g: 38, gc: 5.5, L: P.pinna[0] * 1.02, n: scaleN(P.pairs[0]), off: 1.6, bend: 0.10 },
    ] : [
        { g: -15, gc: -2, L: P.pinna[1], n: scaleN(P.pairs[1]), off: 0, bend: -0.05 },
        { g: 15, gc: 2, L: P.pinna[1] * 0.97, n: scaleN(P.pairs[1]), off: 0, bend: 0.05 },
    ];
    const pinnae = spec.map((s, i) => ({ ...s, g: s.g * P.spread, i, c: actuator(0), leaflets: [] }));
    const leaflets = [];
    for (const pn of pinnae) {
        for (let k = 0; k < pn.n; k++) {
            const t = 0.06 + 0.92 * (k + 0.5) / pn.n;                 // position along the pinna, 0..1
            const size = (0.38 + 0.62 * Math.sin(Math.PI * (0.13 + 0.8 * t))) * P.leaflet;
            for (const side of [-1, 1]) {
                const lf = {
                    pinna: pn, k, side, s: t * pn.L,
                    len: size * (0.94 + rand() * 0.12) * (k === pn.n - 1 ? 0.86 : 1),
                    wid: size * (P.wid + rand() * 0.03),
                    a0: (66 + rand() * 8) * DEG,                            // open: angled a little toward the tip
                    phi: (92 + rand() * 10) * DEG,                           // folded: risen past upright, pressed to its partner
                    a1: (17 + rand() * 9) * DEG,                            // folded: swept forward, imbricate
                    tone: rand() * 2 - 1,
                    f: actuator(0), sx: 0, sy: 0,
                };
                pn.leaflets.push(lf); leaflets.push(lf);
            }
        }
    }
    return { P, pinnae, leaflets, primary: actuator(0), tmpl: leafletTemplate(P.tmpl) };
}

/* Distances along the leaf, in mm, from a stimulus to a point on it. The
 * signal has only one road: along a pinna to its base, across the petiole
 * tip, and out along another pinna or down the petiole to the primary
 * pulvinus. That is what gives the real order of events.                   */
function along(plant, S, i, s) {
    const pn = plant.pinnae;
    if (S.kind === 'tips') return Math.min(pn[i].L - s, ...pn.map((p, j) => (j === i ? Infinity : p.L + p.off + pn[i].off + s)));
    if (S.kind === 'pinna') return S.i === i ? Math.abs(s - S.s) : S.s + pn[S.i].off + pn[i].off + s;
    return plant.P.petiole - S.p + pn[i].off + s;                       // petiole
}
function toPrimary(plant, S) {
    const P = plant.P.petiole;
    if (S.kind === 'tips') return Math.min(...plant.pinnae.map((p) => p.L + p.off)) + P;
    if (S.kind === 'pinna') return S.s + plant.pinnae[S.i].off + P;
    return S.p;
}

/* ---- colours ---- */
const probe = document.createElement('canvas').getContext('2d');
function rgb(css, fallback) {
    probe.fillStyle = fallback; probe.fillStyle = css || fallback;
    const s = probe.fillStyle;
    if (s[0] === '#') return [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
    const m = s.match(/[\d.]+/g); return m ? m.slice(0, 3).map(Number) : [0, 0, 0];
}
const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const cmix = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

/* ===================================================================== */

export function mimosaToggle(el, opts = {}) {
    if (el.__mimosa) return el.__mimosa;
    const isInput = el instanceof HTMLInputElement;
    const d = el.dataset;
    const num = (v, def) => (v == null || v === '' || isNaN(+v) ? def : +v);
    const cfg = {
        size: opts.size || d.size || 'compact',
        pinnae: num(opts.pinnae ?? d.pinnae, 2),                   // pairs of pinnae: 1 or 2
        leaflets: num(opts.leaflets ?? d.leaflets, 0),             // leaflet pairs on the longest pinna (10..25)
        speed: num(opts.speed ?? d.speed, 22),                     // signal speed, cm/s of leaf
        recover: num(opts.recover ?? d.recover, 2400),             // ms for the slow reopening
        habituate: String(opts.habituate ?? d.habituate ?? 'true') !== 'false',
        brush: String(opts.brush ?? d.brush ?? (isInput ? 'false' : 'true')) !== 'false',
        seed: num(opts.seed ?? d.seed, (Math.random() * 1e9) | 0),
        flower: String(opts.flower ?? d.flower ?? 'true') !== 'false',
    };
    if (!PRESET[cfg.size]) cfg.size = 'compact';
    if (!cfg.leaflets) cfg.leaflets = PRESET[cfg.size].pairs[1];
    const rand = rng(cfg.seed);
    const plant = buildPlant(cfg, rand);
    const { P } = plant;
    const hero = cfg.size === 'hero';
    const V_SIG = cfg.speed / 100;                                  // mm per ms

    /* -- DOM -- */
    let wrap, input = null;
    if (isInput) {
        input = el;
        wrap = document.createElement('span');
        input.before(wrap);
        wrap.append(input);
    } else {
        wrap = el;
        wrap.setAttribute('aria-hidden', 'true');
    }
    wrap.classList.add('mt');
    if (hero) wrap.classList.add('mt--hero');
    if (!isInput) wrap.classList.add('mt--still');
    const canvas = document.createElement('canvas');
    canvas.className = 'mt-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    wrap.prepend(canvas);
    const ctx = canvas.getContext('2d');
    const shade = document.createElement('canvas');
    const sctx = shade.getContext('2d');

    /* -- state -- */
    let open = input ? input.checked : true;
    const all = [plant.primary, ...plant.pinnae.map((p) => p.c), ...plant.leaflets.map((l) => l.f)];
    const settleAll = (v) => all.forEach((a) => settle(a, v));
    settleAll(open ? 0 : 1);
    let hab = 0, habT = 0, lastResponse = 1;
    let raf = 0, visible = true, inView = true, dead = false;
    let k = 1, ox = 0, oy = 0, dpr = 1, cw = 0, ch = 0, cLeft = 0, cTop = 0;
    let colors;
    let lastPointer = null;
    let autoTimer = 0;

    function readColors() {
        const cs = getComputedStyle(wrap);
        const g = (n, f) => rgb(cs.getPropertyValue(n).trim(), f);
        colors = {
            leaf: g('--mt-leaf', '#335c22'), under: g('--mt-under', '#a3b98e'), glow: g('--mt-glow', '#b4cf54'),
            stalk: g('--mt-stalk', '#6f8a3c'), pulv: g('--mt-pulvinus', '#9a6a3e'), stem: g('--mt-stem', '#7a4532'),
            shadow: g('--mt-shadow', '#2a2216'),
        };
    }

    /* ---- geometry for the current actuator values ---- */
    const node = V(0, 0, P.zNode);
    /* The leaf as a rigid body hinged at the primary pulvinus. Open, the
     * petiole points out and a little toward the viewer, the blade turned to
     * the light; the droop is one rotation of all of it about the hinge axis
     * (horizontal, across the petiole), as the real pulvinus bends.        */
    const PSI = 9 * DEG;
    const OPEN = (() => {
        const th = P.theta[0] * DEG;
        const d0 = V(Math.cos(th) * Math.cos(PSI), Math.sin(th), Math.cos(th) * Math.sin(PSI));
        const hinge = norm(cross(d0, V(0, 1, 0)));
        const up = norm(cross(hinge, d0));
        const e2 = norm(sub(V(0, 0, 1), mul(d0, d0[2])));
        let e3 = norm(cross(d0, e2));
        if (dot(e3, up) < 0) e3 = mul(e3, -1);
        const beta = 16 * DEG;
        const n = norm(lin(e2, Math.cos(beta), e3, Math.sin(beta)));
        return { d0, up, n, hinge };
    })();
    const rot = (v, a, ang) => {
        const c = Math.cos(ang), s = Math.sin(ang);
        return add(add(mul(v, c), mul(cross(a, v), s)), mul(a, dot(a, v) * (1 - c)));
    };
    function frame3(q) {
        const ang = (P.theta[1] - P.theta[0]) * DEG * q;
        // sign: a positive droop must carry the petiole downward
        const h = OPEN.hinge, sg = rot(OPEN.d0, h, 0.1)[1] < OPEN.d0[1] ? 1 : -1;
        const d0 = rot(OPEN.d0, h, -ang * sg);
        const up = rot(OPEN.up, h, -ang * sg);
        const n = rot(OPEN.n, h, -ang * sg);
        const lat = norm(cross(n, d0));
        return { d0, up, n, lat };
    }
    function petiolePt(F, s, q) {
        const bow = 0.07 * P.petiole * (1 - 0.7 * q);
        return add(add(node, mul(F.d0, s)), mul(F.up, bow * (s * (P.petiole - s)) / (P.petiole * P.petiole) * 4));
    }
    function pinnaGeom(F, pn, c, tip) {
        const g = mix(pn.g, pn.gc, c) * DEG;
        let dir = lin(F.d0, Math.cos(g), F.lat, Math.sin(g));
        dir = norm(add(dir, mul(F.n, -0.10 - 0.16 * c - (pn.off ? 0.06 : 0))));
        const nn = norm(sub(F.n, mul(dir, dot(F.n, dir))));
        const lt = norm(cross(nn, dir));
        const base = add(tip, mul(F.d0, -pn.off));
        const bend = mix(pn.bend, pn.bend * 0.25, c);
        return { dir, nn, lt, base, bend, L: pn.L };
    }
    const rachisAt = (G, s) => add(add(G.base, mul(G.dir, s)), mul(G.lt, (G.bend * s * s) / G.L));
    const rachisTan = (G, s) => norm(add(G.dir, mul(G.lt, (2 * G.bend * s) / G.L)));

    // camera: straight on; shadow: the same point slid along the light onto the page (z = 0)
    const X = (p) => ox + p[0] * k, Y = (p) => oy - p[1] * k;
    const SX = (p) => ox + (p[0] - LIGHT[0] * p[2] / LIGHT[2]) * k, SY = (p) => oy - (p[1] - LIGHT[1] * p[2] / LIGHT[2]) * k;

    /* Build every drawable for time t. Returns a list sorted back to front. */
    function build(t, collect) {
        const q = evalAt(plant.primary, t);
        const F = frame3(q);
        const tip = petiolePt(F, P.petiole, q);
        const items = [];
        // petiole
        const pet = [];
        for (let i = 0; i <= 8; i++) pet.push(petiolePt(F, (i / 8) * P.petiole, q));
        items.push({ z: node[2] + 0.2, kind: 'petiole', pts: pet, F, q });
        // pinnae and leaflets
        for (const pn of plant.pinnae) {
            const c = evalAt(pn.c, t);
            const G = pinnaGeom(F, pn, c, tip);
            pn.G = G;
            const r = [];
            for (let i = 0; i <= 10; i++) r.push(rachisAt(G, (i / 10) * G.L));
            items.push({ z: (r[0][2] + r[10][2]) / 2 + 0.4, kind: 'rachis', pts: r, pn, c });
            for (const lf of pn.leaflets) {
                const f = evalAt(lf.f, t);
                const tau = rachisTan(G, lf.s);
                const nn = norm(sub(G.nn, mul(tau, dot(G.nn, tau))));
                const side = mul(cross(nn, tau), lf.side);
                const fe = EASE.swell(clamp(f));
                const phi = lf.phi * f + (lf.tone * 3 * DEG) * (1 - f);
                const al = mix(lf.a0, lf.a1, fe);
                const radial = lin(side, Math.cos(phi), nn, Math.sin(phi));
                const L = lin(tau, Math.cos(al), radial, Math.sin(al));
                const W = lin(tau, Math.sin(al), radial, -Math.cos(al));     // forward edge
                const N = lin(nn, Math.cos(phi), side, -Math.sin(phi));       // adaxial (upper) face
                const A = add(add(rachisAt(G, lf.s), mul(side, 0.35)), mul(tau, lf.side * 0.25));
                const C = add(A, mul(L, lf.len * 0.5));
                items.push({ z: C[2], kind: 'leaflet', lf, A, L, W, N, f });
                if (collect) collect(A, C, add(A, mul(L, lf.len)));
            }
        }
        if (collect) { pet.forEach((p) => collect(p)); }
        items.sort((a, b) => a.z - b.z);
        return { items, F, q, tip };
    }

    /* ---- fitting the plant into the box ---- */
    function fit() {
        const r = wrap.getBoundingClientRect();
        const W = r.width, H = r.height;
        if (!W || !H) return false;
        // extent of the open and the closed leaf, at unit scale
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        const grab = (...ps) => ps.forEach((p) => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, -p[1]); y1 = Math.max(y1, -p[1]); });
        const saved = all.map((a) => [a.v, a.tw, a.q]);
        for (const v of [0, 1]) { all.forEach((a) => { a.v = v; a.tw = null; a.q = []; }); build(0, grab); }
        all.forEach((a, i) => { [a.v, a.tw, a.q] = saved[i]; });
        if (hero) {
            // the whole sprig: stem from its cut end to the apex, and the flower head
            grab(...stemPath(null, PROJ).pts, ...(flower ? [add(flower.c0, V(-9, 9, 0))] : []));
            const pad = 0.07;
            k = Math.min((W * (1 - 2 * pad)) / (x1 - x0), (H * (1 - 2 * pad)) / (y1 - y0));
            ox = (W - (x1 - x0) * k) / 2 - x0 * k;
            oy = (H - (y1 - y0) * k) / 2 - y0 * k;
            cLeft = 0; cTop = 0; cw = W; ch = H;
        } else {
            // the open fan fills the box; the drooped leaf may hang below it
            k = Math.min((W - 8) / (x1 - x0), (H * 1.5) / (y1 - y0));
            ox = (W - (x1 - x0) * k) / 2 - x0 * k + 2;
            oy = H / 2 - ((y0 + y1) / 2) * k;
            // canvas covers the leaf at every pose plus its shadow, and the box
            const sh = P.zNode * 1.6 * k + 6;
            const L = Math.min(0, x0 * k + ox - 8), T = Math.min(0, y0 * k + oy - 10);
            const R = Math.max(W, x1 * k + ox + sh), B = Math.max(H, y1 * k + oy + sh);
            cLeft = Math.floor(L); cTop = Math.floor(T); cw = Math.ceil(R - cLeft); ch = Math.ceil(B - cTop);
            ox -= cLeft; oy -= cTop;
            Object.assign(canvas.style, { left: cLeft + 'px', top: cTop + 'px', width: cw + 'px', height: ch + 'px' });
        }
        dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = shade.width = Math.max(1, Math.round(cw * dpr));
        canvas.height = shade.height = Math.max(1, Math.round(ch * dpr));
        return true;
    }

    /* ---- drawing ---- */
    function tube(c, pts, w0, w1, proj) {
        // a tapered stalk as a filled ribbon
        const [px, py] = proj;
        const L = [], R = [];
        for (let i = 0; i < pts.length; i++) {
            const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
            let dx = px(b) - px(a), dy = py(b) - py(a); const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
            const w = mix(w0, w1, i / (pts.length - 1)) / 2;
            L.push([px(pts[i]) - dy * w, py(pts[i]) + dx * w]); R.push([px(pts[i]) + dy * w, py(pts[i]) - dx * w]);
        }
        c.beginPath();
        c.moveTo(L[0][0], L[0][1]);
        for (const p of L) c.lineTo(p[0], p[1]);
        for (let i = R.length - 1; i >= 0; i--) c.lineTo(R[i][0], R[i][1]);
        c.closePath();
    }
    function leafletPath(c, it, proj) {
        const [px, py] = proj;
        const { lf, A, L, W } = it;
        c.beginPath();
        const ring = plant.tmpl.ring;
        for (let i = 0; i < ring.length; i++) {
            const [u, v] = ring[i];
            const p = add(add(A, mul(L, u * lf.len)), mul(W, v * lf.wid));
            i ? c.lineTo(px(p), py(p)) : c.moveTo(px(p), py(p));
        }
        c.closePath();
    }
    const PROJ = [X, Y], SHAD = [SX, SY];

    function stemPath(c, proj) {
        // the main stem through the node: off the plate at both ends for the
        // large leaf, a short fading stub for the compact switch
        const pts = hero
            ? [V(3.5, -74, P.zNode - 1.6), V(2, -46, P.zNode - 1.3), V(0.6, -20, P.zNode - 1), node, V(-2.2, 20, P.zNode - 1), V(-5.5, 40, P.zNode - 1.2), V(-8.5, 56, P.zNode - 1.4)]
            : [V(-0.5, -11, P.zNode - 0.5), V(-0.2, -5, P.zNode - 0.4), node, V(-0.6, 5, P.zNode - 0.4), V(-1.6, 9, P.zNode - 0.5)];
        const a = pts[0], m = node, b = pts[pts.length - 1];
        // a point at fraction t (-1 = cut end, 0 = node, 1 = apex) along the polyline
        const at = (t) => {
            const i0 = 3, seg = t < 0 ? pts.slice(0, i0 + 1).reverse() : pts.slice(i0);
            const lens = []; let tot = 0;
            for (let i = 1; i < seg.length; i++) { const l = Math.hypot(...sub(seg[i], seg[i - 1])); lens.push(l); tot += l; }
            let want = Math.abs(t) * tot;
            for (let i = 0; i < lens.length; i++) { if (want <= lens[i]) return lin(seg[i], 1 - want / lens[i], seg[i + 1], want / lens[i]); want -= lens[i]; }
            return seg[seg.length - 1];
        };
        return { a, m, b, pts, at, draw(w0, w1) { tube(c, pts, w0, w1, proj); } };
    }

    const flower = hero && cfg.flower ? (() => {
        // a flower head in the next leaf axil: a globose capitulum of pink stamens
        const r = rng(cfg.seed ^ 0x51f15e);
        const ped = [V(-0.8, 1.5, P.zNode - 0.5), V(-4, 9, P.zNode + 0.8), V(-9, 17, P.zNode + 2), V(-15, 24, P.zNode + 3)];
        const c0 = V(-20, 29, P.zNode + 3.5);
        const fil = [];
        const N = 230;
        for (let i = 0; i < N; i++) {
            const y = 1 - (2 * (i + 0.5)) / N, rad = Math.sqrt(1 - y * y), th = i * 2.399963 + r() * 0.3;
            const dir = V(Math.cos(th) * rad, y, Math.sin(th) * rad);
            fil.push({ dir, len: 6.4 + r() * 2.2, tone: r() });
        }
        return { ped, c0, fil };
    })() : null;

    function render(t) {
        if (!colors) readColors();
        const { items, F, q, tip } = build(t);
        const D = dpr;
        const col = colors;

        /* shadow pass: every part slid along the light onto the page, as one silhouette */
        sctx.setTransform(D, 0, 0, D, 0, 0);
        sctx.clearRect(0, 0, cw, ch);
        sctx.fillStyle = '#000'; sctx.strokeStyle = '#000';
        const st = stemPath(sctx, SHAD);
        if (hero) { st.draw(2.1 * k, 0.7 * k); sctx.fill(); }
        if (flower) drawFlower(sctx, SHAD, true);
        for (const it of items) {
            if (it.kind === 'leaflet') { leafletPath(sctx, it, SHAD); sctx.fill(); }
            else if (it.kind === 'petiole') { tube(sctx, it.pts, 1.5 * k, 0.9 * k, SHAD); sctx.fill(); }
            else { tube(sctx, it.pts, Math.max(0.6, 0.55 * k), Math.max(0.4, 0.25 * k), SHAD); sctx.fill(); }
        }

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // the soft shadow: blur grows with the leaf's height above the page
        const zm = P.zNode + (tip[2] - P.zNode) * 0.6;
        const blur = Math.max(1, (0.8 + zm * 0.16) * k) * D;
        ctx.save();
        ctx.shadowColor = css(col.shadow, hero ? 0.26 : 0.24);
        ctx.shadowBlur = blur;
        ctx.shadowOffsetX = canvas.width + 50;
        ctx.drawImage(shade, -canvas.width - 50, 0);
        ctx.restore();

        ctx.setTransform(D, 0, 0, D, 0, 0);
        // stem
        if (hero) {
            const g = ctx.createLinearGradient(X(st.a), Y(st.a), X(st.b), Y(st.b));
            g.addColorStop(0, css(cmix(col.stem, [40, 30, 20], 0.15)));
            g.addColorStop(0.5, css(cmix(col.stem, col.stalk, 0.35)));
            g.addColorStop(1, css(cmix(col.stem, col.stalk, 0.55)));
            const sm = stemPath(ctx, PROJ);
            sm.draw(2.1 * k, 0.7 * k);
            ctx.fillStyle = g; ctx.fill();
            // round in section: shade the side away from the light, a sheen on the near one
            ctx.save(); ctx.clip();
            ctx.lineWidth = 1.1 * k; ctx.strokeStyle = 'rgba(30,18,10,.32)';
            ctx.beginPath(); sm.pts.forEach((p, i) => (i ? ctx.lineTo(X(p) + 0.95 * k, Y(p)) : ctx.moveTo(X(p) + 0.95 * k, Y(p)))); ctx.stroke();
            ctx.lineWidth = 0.35 * k; ctx.strokeStyle = 'rgba(255,240,215,.35)';
            ctx.beginPath(); sm.pts.forEach((p, i) => (i ? ctx.lineTo(X(p) - 0.45 * k, Y(p)) : ctx.moveTo(X(p) - 0.45 * k, Y(p)))); ctx.stroke();
            ctx.restore();
            drawStemDetail(sm);
        } else {
            const g = ctx.createLinearGradient(X(st.a), Y(st.a), X(st.b), Y(st.b));
            g.addColorStop(0, css(col.stem, 0)); g.addColorStop(0.35, css(col.stem, 0.9));
            g.addColorStop(0.7, css(cmix(col.stem, col.stalk, 0.4), 0.9)); g.addColorStop(1, css(col.stalk, 0));
            stemPath(ctx, PROJ).draw(1.7 * k, 1.3 * k);
            ctx.fillStyle = g; ctx.fill();
        }
        if (flower) drawFlower(ctx, PROJ, false);

        for (const it of items) {
            if (it.kind === 'leaflet') drawLeaflet(it);
            else if (it.kind === 'petiole') drawPetiole(it);
            else drawRachis(it);
        }
    }

    function drawStemDetail(st) {
        // stipules at the node and a few recurved prickles, as on the plant
        const c = ctx;
        c.fillStyle = css(cmix(colors.stalk, colors.pulv, 0.35), 0.9);
        for (const s of [-1, 1]) {
            const b = V(node[0] + s * 0.4, node[1] - 0.5, node[2] + 0.4);
            const e = add(b, V(s * 1.6 - 1.5, 7.5, 0.6));
            c.beginPath();
            c.moveTo(X(b) - 0.9 * k, Y(b)); c.quadraticCurveTo(X(e) - 0.6 * k, (Y(b) + Y(e)) / 2, X(e), Y(e));
            c.quadraticCurveTo(X(e) + 0.7 * k, (Y(b) + Y(e)) / 2, X(b) + 0.9 * k, Y(b)); c.fill();
        }
        c.fillStyle = css(cmix(colors.stem, [230, 210, 170], 0.25));
        const pr = [[-0.2, 1], [-0.47, -1], [-0.76, 1], [0.3, -1], [0.62, 1]];
        // the cut end, pale pith in a darker ring, and the soft green apex
        const cut = st.pts[0], cn = st.pts[1];
        const ang = Math.atan2(Y(cn) - Y(cut), X(cn) - X(cut));
        c.save(); c.translate(X(cut), Y(cut)); c.rotate(ang + Math.PI / 2);
        c.beginPath(); c.ellipse(0, 0, 1.05 * k, 0.5 * k, 0, 0, Math.PI * 2);
        c.fillStyle = css([214, 204, 168]); c.fill();
        c.strokeStyle = css(colors.stem, 0.8); c.lineWidth = Math.max(0.4, 0.18 * k); c.stroke();
        c.restore();
        const ap = st.pts[st.pts.length - 1], ap0 = st.pts[st.pts.length - 2];
        const aa = Math.atan2(Y(ap) - Y(ap0), X(ap) - X(ap0));
        c.save(); c.translate(X(ap), Y(ap)); c.rotate(aa);
        c.beginPath(); c.moveTo(-0.4 * k, -0.45 * k); c.quadraticCurveTo(2.2 * k, -0.6 * k, 3.2 * k, 0); c.quadraticCurveTo(2.2 * k, 0.6 * k, -0.4 * k, 0.45 * k); c.closePath();
        c.fillStyle = css(cmix(colors.stalk, colors.leaf, 0.4)); c.fill();
        c.restore();
        c.fillStyle = css(cmix(colors.stem, [230, 210, 170], 0.25));
        for (const [t, s] of pr) {
            const p = st.at(t), w = mix(1.5, t < 0 ? 2.1 : 0.7, Math.abs(t)) / 2;
            const x = X(p) + s * (w - 0.15) * k, y = Y(p);
            c.beginPath(); c.moveTo(x, y - 0.9 * k); c.quadraticCurveTo(x + s * 2.2 * k, y + 0.2 * k, x + s * 2.6 * k, y + 1.6 * k);
            c.lineTo(x, y + 0.9 * k); c.closePath(); c.fill();
        }
        // bristly hairs
        c.strokeStyle = css([235, 225, 200], 0.55); c.lineWidth = Math.max(0.4, 0.12 * k);
        const r = rng(cfg.seed ^ 77);
        c.beginPath();
        for (let i = 0; i < 26; i++) {
            const t = r() * 2 - 1, s = r() < 0.5 ? -1 : 1;
            const p = st.at(t * 0.95), w = mix(1.5, t < 0 ? 2.1 : 0.7, Math.abs(t)) / 2;
            const x = X(p) + s * w * k, y = Y(p);
            c.moveTo(x, y); c.lineTo(x + s * 1.6 * k, y - (0.4 + r()) * k);
        }
        c.stroke();
    }

    function drawFlower(c, proj, shadow) {
        const [px, py] = proj;
        const { ped, c0, fil } = flower;
        tube(c, [...ped, c0], 1.0 * k, 0.75 * k, proj);
        if (!shadow) c.fillStyle = css(cmix(colors.stalk, colors.stem, 0.3));
        c.fill();
        const pink = [205, 112, 176], pale = [246, 206, 232], anther = [240, 222, 140];
        const order = fil.slice().sort((a, b) => a.dir[2] - b.dir[2]);
        if (shadow) {
            c.beginPath(); c.arc(px(c0), py(c0), 6.6 * k, 0, Math.PI * 2); c.globalAlpha = 0.55; c.fill(); c.globalAlpha = 1;
            return;
        }
        c.lineCap = 'round';
        for (const f of order) {
            const a = add(c0, mul(f.dir, 1.6)), b = add(c0, mul(f.dir, f.len));
            const lit = 0.75 + 0.35 * clamp(dot(f.dir, LIGHT), -1, 1);
            const front = f.dir[2] > 0;
            c.strokeStyle = css(cmix(pink, pale, f.tone * 0.6 + (front ? 0.2 : 0)).map((v) => v * lit), front ? 0.95 : 0.7);
            c.lineWidth = Math.max(0.45, 0.13 * k);
            c.beginPath(); c.moveTo(px(a), py(a)); c.lineTo(px(b), py(b)); c.stroke();
            if (front || f.tone > 0.5) {
                c.fillStyle = css(anther.map((v) => v * lit), 0.95);
                c.beginPath(); c.arc(px(b), py(b), Math.max(0.45, 0.24 * k), 0, Math.PI * 2); c.fill();
            }
        }
        c.lineCap = 'butt';
    }

    function drawPetiole(it) {
        const c = ctx;
        const { pts } = it;
        const col = colors;
        // the petiole: green flushed with red, lit along its upper flank
        tube(c, pts, 1.35 * k, 0.85 * k, PROJ);
        const g = c.createLinearGradient(X(pts[0]), Y(pts[0]), X(pts[8]), Y(pts[8]));
        g.addColorStop(0, css(cmix(col.stalk, col.stem, 0.45)));
        g.addColorStop(1, css(cmix(col.stalk, col.stem, 0.18)));
        c.fillStyle = g; c.fill();
        c.strokeStyle = css([255, 250, 230], 0.28); c.lineWidth = Math.max(0.4, 0.22 * k);
        c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(X(p) - 0.25 * k, Y(p) - 0.3 * k) : c.moveTo(X(p) - 0.25 * k, Y(p) - 0.3 * k))); c.stroke();
        // primary pulvinus: the swollen hinge at the base
        const pv = [0, 0.04, 0.09, 0.14, 0.19].map((f) => petiolePt(it.F, P.petiole * f, it.q));
        const sw = [1.0, 1.0, 0.9, 0.62, 0.42];
        const L = [], R = [];
        for (let i = 0; i < pv.length; i++) {
            const a = pv[Math.max(0, i - 1)], b = pv[Math.min(pv.length - 1, i + 1)];
            let dx = X(b) - X(a), dy = Y(b) - Y(a); const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
            const w = sw[i] * 1.25 * k;
            L.push([X(pv[i]) - dy * w, Y(pv[i]) + dx * w]); R.push([X(pv[i]) + dy * w, Y(pv[i]) - dx * w]);
        }
        c.beginPath(); c.moveTo(L[0][0], L[0][1]);
        L.forEach((p) => c.lineTo(p[0], p[1])); R.reverse().forEach((p) => c.lineTo(p[0], p[1])); c.closePath();
        c.fillStyle = css(cmix(col.pulv, col.stalk, 0.45)); c.fill();
        c.strokeStyle = css(cmix(col.pulv, [40, 30, 15], 0.4), 0.5); c.lineWidth = Math.max(0.4, 0.12 * k); c.stroke();
        if (P.detail > 1) {
            // appressed bristles along the petiole
            c.strokeStyle = css([240, 232, 205], 0.5); c.lineWidth = Math.max(0.35, 0.1 * k);
            c.beginPath();
            for (let i = 1; i < 8; i++) {
                const p = pts[i], dx = X(pts[i + 1]) - X(p), dy = Y(pts[i + 1]) - Y(p), l = Math.hypot(dx, dy) || 1;
                for (const s of [-1, 1]) {
                    const x = X(p) - (dy / l) * s * 0.6 * k, y = Y(p) + (dx / l) * s * 0.6 * k;
                    c.moveTo(x, y); c.lineTo(x + (dx / l) * 1.4 * k - (dy / l) * s * 0.5 * k, y + (dy / l) * 1.4 * k + (dx / l) * s * 0.5 * k);
                }
            }
            c.stroke();
        }
    }

    function drawRachis(it) {
        const c = ctx;
        const { pts, pn } = it;
        tube(c, pts, Math.max(0.7, 0.6 * k), Math.max(0.45, 0.24 * k), PROJ);
        c.fillStyle = css(cmix(colors.stalk, colors.stem, 0.1)); c.fill();
        // pinnar pulvinus at its base
        const b = pts[0], e = pn.G ? rachisAt(pn.G, 2.4) : pts[1];
        c.lineCap = 'round';
        c.strokeStyle = css(cmix(colors.pulv, colors.stalk, 0.55)); c.lineWidth = Math.max(1, 0.95 * k);
        c.beginPath(); c.moveTo(X(b), Y(b)); c.lineTo(X(e), Y(e)); c.stroke();
        c.lineCap = 'butt';
    }

    function drawLeaflet(it) {
        const c = ctx;
        const { lf, N, A, L, W } = it;
        const col = colors;
        const front = N[2] >= 0;                         // which face the camera sees
        const Nf = front ? N : mul(N, -1);
        const lam = dot(Nf, LIGHT);
        const base = front ? col.leaf : col.under;
        const tone = 1 + lf.tone * 0.07;
        let rgbv = base.map((v) => v * tone * (0.52 + 0.56 * Math.max(0, lam)));
        if (lam < 0) rgbv = rgbv.map((v, i) => v + col.glow[i] * -lam * 0.5);     // light through the blade
        if (front) {
            const sp = Math.pow(Math.max(0, dot(Nf, HALF)), 36) * 0.12;               // a waxy sheen on the upper face
            rgbv = rgbv.map((v) => v + 255 * sp);
        }
        leafletPath(c, it, PROJ);
        if (P.detail > 0) {
            const a = add(A, mul(L, 0.1 * lf.len)), b = add(A, mul(L, lf.len));
            const g = c.createLinearGradient(X(a), Y(a), X(b), Y(b));
            g.addColorStop(0, css(cmix(rgbv, col.glow, 0.16), 0.93));
            g.addColorStop(0.6, css(rgbv, 0.93));
            g.addColorStop(1, css(rgbv.map((v) => v * 0.92), 0.93));
            c.fillStyle = g;
        } else {
            c.fillStyle = css(rgbv, 0.94);
        }
        c.fill();
        // a folded leaflet is seen nearly edge-on; a stroke in its own colour
        // gives it the body it has in life (the pressed pair is not a perfect
        // knife edge) and keeps the folded pinna a visible line at 1x
        const lw = P.detail === 0 ? mix(0.25, 0.7, clamp(it.f)) : 0.9 * clamp(it.f);
        if (lw > 0.05) { c.strokeStyle = css(rgbv, 0.9); c.lineWidth = lw; c.lineJoin = 'round'; c.stroke(); }
        if (P.detail > 0) {
            // margin catches light; the midvein runs near the forward edge
            c.strokeStyle = css(cmix(rgbv, [240, 245, 210], front ? 0.3 : 0.18), 0.65);
            c.lineWidth = Math.max(0.35, 0.09 * k);
            c.stroke();
            const vn = plant.tmpl.vein;
            c.beginPath();
            vn.forEach(([u, v], i) => { const p = add(add(A, mul(L, u * lf.len)), mul(W, v * lf.wid)); i ? c.lineTo(X(p), Y(p)) : c.moveTo(X(p), Y(p)); });
            c.strokeStyle = css(cmix(rgbv, front ? [210, 225, 170] : [235, 240, 220], 0.4), 0.7);
            c.lineWidth = Math.max(0.4, 0.13 * k);
            c.stroke();
            if (P.detail > 1) {
                // marginal bristles (the leaflets are ciliate)
                c.beginPath();
                for (const u of [0.3, 0.5, 0.7, 0.86]) {
                    for (const s of [1, -1]) {
                        const v = s > 0 ? 0.36 : -0.62;
                        const p = add(add(A, mul(L, u * lf.len)), mul(W, (v + 0.16 * Math.pow(Math.max(0, (u - 0.55) / 0.45), 2)) * lf.wid));
                        const q2 = add(add(p, mul(W, s * 0.5)), mul(L, 0.35));
                        c.moveTo(X(p), Y(p)); c.lineTo(X(q2), Y(q2));
                    }
                }
                c.strokeStyle = css([240, 236, 210], 0.4); c.lineWidth = Math.max(0.3, 0.06 * k); c.stroke();
            }
        }
        const C = add(A, mul(L, lf.len * 0.55));
        lf.sx = X(C) + cLeft; lf.sy = Y(C) + cTop;
    }

    /* ---- the plant's behaviour ---- */
    function loop() {
        raf = 0;
        if (dead || !visible) return;
        const t = performance.now();
        render(t);
        if (all.some(busy)) raf = requestAnimationFrame(loop);
    }
    const kick = () => { if (!raf && visible && !dead) raf = requestAnimationFrame(loop); };
    const still = () => calm.matches;

    function emit(name, detail) {
        (input || wrap).dispatchEvent(new CustomEvent('mimosa-toggle:' + name, { bubbles: true, detail }));
    }

    /* The stimulus: fold, pair by pair, as the signal arrives. */
    function fold(S, now, opts = {}) {
        const { local = false, amp: ampIn } = opts;
        let A = ampIn ?? 1;
        if (!local && cfg.habituate && ampIn == null) {
            hab *= Math.exp(-(now - habT) / 12000);
            A = 1 - hab;
            hab += (1 - hab) * 0.5;
            habT = now;
            if (A < 0.12) A = 0;                                        // it rests
        }
        if (!local) lastResponse = A;
        if (still()) { if (!local) settleAll(1); render(now); return; }
        const LAT = 40;                                                 // ms before the first pulvinule answers
        const reach = local ? 7 : A >= 0.999 ? Infinity : 30 + A * 110;
        let end = now;
        for (const pn of plant.pinnae) {
            for (const lf of pn.leaflets) {
                const dist = along(plant, S, pn.i, lf.s);
                if (dist > reach) continue;
                const amp = local ? 0.95 - dist / 30 : A >= 0.999 ? 1 : A * (1 - 0.5 * dist / reach);
                if (amp <= 0.02) continue;
                drop(lf.f, ['open', 'close']);
                const t0 = now + LAT + dist / V_SIG;
                const to = Math.max(amp, Math.min(1, cur(lf.f, t0)));
                plan(lf.f, t0, to, 120 + rand() * 40, EASE.turgor, 'reflex');
                end = Math.max(end, t0 + 160);
            }
            if (!local && A > 0.25) {
                const t0 = now + LAT + 30 + along(plant, S, pn.i, 0) / V_SIG;
                drop(pn.c, ['open', 'close']);
                plan(pn.c, t0, Math.max(A, cur(pn.c, t0)), 260, EASE.turgor, 'reflex');
                end = Math.max(end, t0 + 260);
            }
        }
        if (!local && A > 0.5) {
            const t0 = now + LAT + 60 + toPrimary(plant, S) / V_SIG;
            drop(plant.primary, ['open', 'close']);
            plan(plant.primary, t0, A > 0.85 ? 1 : A * 0.8, 420, EASE.drop, 'reflex');
            end = Math.max(end, t0 + 420);
        }
        if (!local && A < 0.999 && input && !input.checked) {
            // habituated: the reflex was weak, but the value is off, so the leaf
            // closes anyway, slowly, the way it folds for the night
            closeSlowly(end + 900);
        }
        if (local) {
            for (const lf of plant.leaflets) if (lf.f.q.some((n) => n.kind === 'reflex' && n.t0 >= now)) reopenLeaflet(lf, end + 900 + rand() * 900);
        }
        if (!local) emit('fold', { strength: A >= 0.6 ? 'full' : A > 0 ? 'weak' : 'none', response: A });
        kick();
    }
    function closeSlowly(t) {
        all.forEach((a) => drop(a, ['close', 'open']));
        plant.leaflets.forEach((lf) => plan(lf.f, Math.max(t, endOf(lf.f)) + rand() * 500, 1, 1100 + rand() * 500, EASE.swell, 'close'));
        plant.pinnae.forEach((pn) => plan(pn.c, Math.max(t + 300, endOf(pn.c)), 1, 1300, EASE.swell, 'close'));
        plan(plant.primary, Math.max(t + 500, endOf(plant.primary)), 1, 1500, EASE.swell, 'close');
    }
    function reopenLeaflet(lf, t) {
        plan(lf.f, Math.max(t, endOf(lf.f)), 0, cfg.recover * (0.35 + rand() * 0.25), EASE.swell, 'open');
    }
    /* Recovery: slow, the petiole first, then pinnae, then leaflets one by one. */
    function unfurl(now) {
        if (still()) { settleAll(0); render(now); return; }
        const R = cfg.recover;
        all.forEach((a) => drop(a, ['close', 'open']));
        const s0 = Math.max(now, endOf(plant.primary));
        plan(plant.primary, s0, 0, R * 0.62, EASE.swell, 'open');
        for (const pn of plant.pinnae) {
            plan(pn.c, Math.max(now + R * 0.12 + rand() * 80, endOf(pn.c)), 0, R * 0.6, EASE.swell, 'open');
            for (const lf of pn.leaflets) {
                const t = now + R * (0.22 + rand() * 0.35 + 0.08 * (lf.s / pn.L));
                reopenLeaflet(lf, t);
            }
        }
        emit('open', {});
        kick();
    }

    /* ---- input ---- */
    function stimulusAt(x, y) {
        // x, y relative to the wrapper box; nearest leaflet within reach, else the petiole, else the tips
        let best = null, bd = Infinity;
        for (const lf of plant.leaflets) {
            const dd = Math.hypot(lf.sx - x, lf.sy - y);
            if (dd < bd) { bd = dd; best = lf; }
        }
        const lim = Math.max(10, k * 6);
        if (best && bd < lim) return { kind: 'pinna', i: best.pinna.i, s: best.s, lf: best };
        return { kind: 'tips' };
    }
    const ac = new AbortController();
    const on = (t, type, fn, o = {}) => t.addEventListener(type, fn, { ...o, signal: ac.signal });
    const local = (e) => { const r = wrap.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

    on(wrap, 'pointerdown', (e) => { lastPointer = { xy: local(e), t: performance.now() }; }, { capture: true });

    if (input) {
        on(input, 'change', () => {
            const now = performance.now();
            const recent = lastPointer && now - lastPointer.t < 1200 ? lastPointer : null;
            lastPointer = null;
            open = input.checked;
            wrap.classList.toggle('is-off', !open);
            if (open) unfurl(now);
            else fold(recent ? stimulusAt(...recent.xy) : { kind: 'tips' }, now);
        });
        // Space is the checkbox's own; Enter toggles too, as the switch pattern allows
        on(input, 'keydown', (e) => {
            if (e.key !== 'Enter' || e.repeat || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || input.disabled) return;
            e.preventDefault();
            input.click();
        });
        const focus = () => wrap.classList.toggle('is-focus', input.matches(':focus-visible'));
        on(input, 'focus', focus); on(input, 'blur', focus); on(input, 'keyup', focus);
        const dis = () => wrap.classList.toggle('is-disabled', input.disabled);
        dis();
        var mo = new MutationObserver(dis);
        mo.observe(input, { attributes: true, attributeFilter: ['disabled'] });
        if (input.form) on(input.form, 'reset', () => setTimeout(sync, 0));
    } else {
        // decorative: a touch folds the leaf (and it reopens by itself); a brush folds a few pairs
        on(wrap, 'pointerdown', (e) => {
            if (still()) return;
            const now = performance.now();
            const [x, y] = local(e);
            const S = stimulusAt(x, y);
            if (S.kind === 'tips' && Math.hypot(x - ox - cLeft, y - oy - cTop) > Math.max(wrap.clientWidth, wrap.clientHeight) * 0.6) return;
            fold(S, now);
            clearTimeout(autoTimer);
            autoTimer = setTimeout(() => unfurl(performance.now()), 2600);
        });
        let lastBrush = 0;
        on(wrap, 'pointermove', (e) => {
            if (!cfg.brush || still() || e.buttons) return;
            const now = performance.now();
            if (now - lastBrush < 40) return;
            lastBrush = now;
            const [x, y] = local(e);
            const r = Math.max(9, k * 3.2);
            for (const lf of plant.leaflets) {
                if (Math.hypot(lf.sx - x, lf.sy - y) < r && cur(lf.f, now) < 0.35 && !lf.f.q.some((n) => n.kind === 'reflex')) {
                    fold({ kind: 'pinna', i: lf.pinna.i, s: lf.s }, now, { local: true });
                }
            }
        });
    }

    const io = new IntersectionObserver((es) => {
        inView = es[es.length - 1].isIntersecting;
        visible = inView && !document.hidden;
        if (visible) { render(performance.now()); kick(); }
    });
    io.observe(wrap);
    on(document, 'visibilitychange', () => {
        if (document.hidden) { visible = false; cancelAnimationFrame(raf); raf = 0; }
        else { visible = inView; if (visible) { render(performance.now()); kick(); } }
    });
    const ro = new ResizeObserver(() => { if (fit()) render(performance.now()); });
    ro.observe(wrap);
    on(calm, 'change', () => { if (calm.matches) { settleAll(open ? 0 : 1); render(performance.now()); } });
    const mq = matchMedia('(prefers-color-scheme: dark)');
    on(mq, 'change', () => { readColors(); render(performance.now()); });

    function sync() {
        if (!input) return;
        open = input.checked;
        wrap.classList.toggle('is-off', !open);
        settleAll(open ? 0 : 1);
        render(performance.now());
    }

    wrap.classList.toggle('is-off', !open);
    if (fit()) render(performance.now());
    el.__mimosa = destroy;

    function destroy() {
        dead = true;
        ac.abort(); io.disconnect(); ro.disconnect(); if (mo) mo.disconnect();
        cancelAnimationFrame(raf); clearTimeout(autoTimer);
        canvas.remove();
        wrap.classList.remove('mt', 'mt--hero', 'mt--still', 'is-focus', 'is-disabled', 'is-off');
        if (input) { wrap.before(input); wrap.remove(); }
        else wrap.removeAttribute('aria-hidden');
        delete el.__mimosa;
    }
    /** set the value as if the person had toggled it (fires input/change) */
    destroy.set = (v) => { if (!input || input.checked === !!v) return; input.checked = !!v; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); };
    /** after changing input.checked in code: jump the drawing to match, no animation */
    destroy.sync = sync;
    /** touch the leaf without changing anything (decorative or demo use) */
    destroy.touch = (S = { kind: 'tips' }) => fold(S, performance.now(), { amp: 1 });
    destroy.recolor = () => { readColors(); render(performance.now()); };
    destroy.render = () => render(performance.now());
    Object.defineProperties(destroy, {
        checked: { get: () => (input ? input.checked : open) },
        response: { get: () => lastResponse },
        habituation: { get: () => hab * Math.exp(-(performance.now() - habT) / 12000) },
        busy: { get: () => all.some(busy) || !!raf },
        plant: { get: () => plant },
    });
    return destroy;
}

document.querySelectorAll('[data-mimosa-toggle]').forEach((el) => mimosaToggle(el));
