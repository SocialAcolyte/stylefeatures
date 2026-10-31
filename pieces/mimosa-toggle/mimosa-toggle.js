/* mimosa-toggle — a switch that is the great leaf of a real botanical plate of Mimosa pudica.
 *
 *   <figure class="mt">
 *     <img class="mt-plate" src="assets/plate.webp" width="2200" height="3096" alt="…">
 *     <input type="checkbox" role="switch" class="mt-switch" data-mimosa-toggle
 *            data-src="assets/mimosa.json" aria-label="Leaf open" checked>
 *   </figure>
 *
 * The plate is Andrews' Botanist's Repository pl. 544 (1807), hand-coloured engraving. Its large
 * lower leaf was cut, offline, into the parts the plant moves: the petiole with its hub, four
 * rachises, and 255 leaflets, each with its pulvinule (pivot) on the rachis. What lay under the leaf
 * was painted back from the plate's own paper (see README). The checkbox lies over the leaf.
 *
 * Switch it off and you have touched it. The signal runs from the leaflet under your finger toward
 * the base of its pinna; the painted leaflets fold pair by pair, rising faces together and sweeping
 * forward, so each pinna narrows to a braid; at the hub the pinnae draw together, the signal runs
 * out into the others from their bases, and the primary pulvinus at the stem lets the whole leaf
 * fall. Switch it on and it reopens slowly and unevenly. Toggle it too often and it tires: it still
 * closes (the switch never lies), but slowly and without the fall, the way it folds at dusk.
 *
 * Open and at rest, the page shows the plate itself (the <img>), pixel for pixel; the WebGL canvas
 * is only shown while the leaf is moving or closed, and draws only when something moves.
 *
 * Options (data-* on the input, or the options object, which wins):
 *   src        the leaf's JSON (required); its textures sit beside it
 *   speed      signal speed, plate px per second (default 900; about twice life)
 *   recover    reopening time scale (default 1)
 *   habituate  'false' to fold fully every time
 *
 * Events (bubbling, from the input): 'mimosa-toggle:fold' {response, strength: 'full'|'tired'},
 * 'mimosa-toggle:fall' when the petiole drops, 'mimosa-toggle:open' when it has reopened.
 */

const calm = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const EASE = {
    // a pulvinus losing turgor: quick start, settling in
    fold: (t) => 1 - Math.pow(1 - t, 3),
    // the leaf falling under its own weight, a small give at the bottom, then still
    fall: (t) => { const a = t < .7 ? smooth(0, .7, t) * 1.035 : 1.035 - .035 * smooth(.7, 1, t); return a; },
    // turgor coming back: slow, even
    open: (t) => t * t * (3 - 2 * t),
};

/* An actuator: a value that goes from where it is to a target, starting at t0, over dur. */
class Act {
    constructor() { this.from = 0; this.to = 0; this.t0 = 0; this.dur = 0; this.ease = EASE.fold; }
    at(now) {
        if (now <= this.t0 || this.dur <= 0) return now <= this.t0 ? this.from : this.to;
        const u = clamp((now - this.t0) / this.dur);
        return this.from + (this.to - this.from) * this.ease(u);
    }
    go(now, to, delay, dur, ease) {
        this.from = this.at(now); this.to = to; this.t0 = now + delay; this.dur = dur; this.ease = ease;
    }
    set(v) { this.from = this.to = v; this.dur = 0; this.t0 = 0; }
    busy(now) { return now < this.t0 + this.dur; }
}

/* ── shaders ──────────────────────────────────────────────────────────────── */
const PIECE_VS = `#version 300 es
layout(location=0) in vec2 aCorner;
layout(location=1) in vec4 iRect;     // piece bbox in box px
layout(location=2) in vec3 iMx;       // dest.x = a*x + c*y + e   (src in box px, dest in plate px)
layout(location=3) in vec3 iMy;       // dest.y = b*x + d*y + f
layout(location=4) in vec4 iInfo;     // id, underside, shade (shadow strength), unused
uniform vec2 uPlate;                  // plate size, px
uniform vec2 uShift;                  // shadow offset per unit shade (plate px); 0 for colour
out vec2 vSrc; flat out int vId; out float vUnder; out float vShade;
void main(){
  vec2 s = mix(iRect.xy - 2., iRect.zw + 2., aCorner);
  vec2 d = vec2(dot(iMx, vec3(s, 1.)), dot(iMy, vec3(s, 1.))) + uShift * iInfo.z;
  vSrc = s; vId = int(iInfo.x + .5); vUnder = iInfo.y; vShade = iInfo.z;
  gl_Position = vec4(d.x / uPlate.x * 2. - 1., 1. - d.y / uPlate.y * 2., 0., 1.);
}`;
const PIECE_FS = `#version 300 es
precision highp float; precision highp int;
in vec2 vSrc; flat in int vId; in float vUnder; in float vShade;
uniform sampler2D uLeaf; uniform highp usampler2D uIds; uniform vec2 uBox; uniform int uMode;
out vec4 o;
int idAt(ivec2 p){ p = clamp(p, ivec2(0), ivec2(uBox) - 1); uvec4 v = texelFetch(uIds, p, 0); return int(v.r) + 256 * int(v.g); }
float ownAt(vec2 s){
  vec2 q = s - .5; ivec2 b = ivec2(floor(q)); vec2 f = q - floor(q);
  return (idAt(b) == vId ? (1. - f.x) * (1. - f.y) : 0.) + (idAt(b + ivec2(1, 0)) == vId ? f.x * (1. - f.y) : 0.)
       + (idAt(b + ivec2(0, 1)) == vId ? (1. - f.x) * f.y : 0.) + (idAt(b + ivec2(1, 1)) == vId ? f.x * f.y : 0.);
}
void main(){
  // soft ownership: bilinear weight of the texels that belong to this piece, averaged over the
  // pixel's footprint (a folded leaflet is squeezed several texels into one pixel)
  vec2 ex = dFdx(vSrc) * .25, ey = dFdy(vSrc) * .25;
  float own = (ownAt(vSrc - ex - ey) + ownAt(vSrc + ex - ey) + ownAt(vSrc - ex + ey) + ownAt(vSrc + ex + ey)) * .25;
  if (own <= 0.) discard;
  vec4 fa = texture(uLeaf, vSrc / uBox);
  float a = fa.a * own;
  vec3 F = fa.rgb;
  // the lower (abaxial) face of a Mimosa leaflet is paler and greyer than the upper
  vec3 pale = mix(F, vec3(dot(F, vec3(.3, .55, .15))) * vec3(1.02, 1.04, .96), .45) * 1.12 + .03;
  F = mix(F, min(pale, vec3(1.)), vUnder);
  o = uMode == 0 ? vec4(F * a, a) : vec4(a * vShade);
}`;
const QUAD_VS = `#version 300 es
layout(location=0) in vec2 aCorner; out vec2 vUv;
void main(){ vUv = aCorner; gl_Position = vec4(aCorner * 2. - 1., 0., 1.); }`;
const BLUR_FS = `#version 300 es
precision highp float; in vec2 vUv; uniform sampler2D uT; uniform vec2 uDir; out vec4 o;
void main(){
  float w[5] = float[](.2270, .1946, .1216, .0541, .0162); float s = texture(uT, vUv).r * w[0];
  for (int i = 1; i < 5; i++) { s += texture(uT, vUv + uDir * float(i)).r * w[i]; s += texture(uT, vUv - uDir * float(i)).r * w[i]; }
  o = vec4(s);
}`;
const FINAL_FS = `#version 300 es
precision highp float; in vec2 vUv;
uniform sampler2D uPlate, uClean, uAcc, uSh; uniform vec4 uBoxR; uniform float uShK;
out vec4 o;
void main(){
  vec2 uv = vec2(vUv.x, 1. - vUv.y);                 // plate uv, y down
  vec3 O = texture(uPlate, uv).rgb;
  vec2 bu = (uv - uBoxR.xy) / uBoxR.zw;
  vec3 C = O;
  if (all(greaterThanEqual(bu, vec2(0.))) && all(lessThanEqual(bu, vec2(1.)))) {
    vec4 c = texture(uClean, bu); C = mix(O, c.rgb, c.a);
  }
  vec4 acc = texelFetch(uAcc, ivec2(gl_FragCoord.xy), 0);
  float A = acc.a; vec3 P = A > 1. ? acc.rgb / A : acc.rgb; A = min(A, 1.);
  float sh = texture(uSh, vUv).r;
  vec3 bg = C * (1. - uShK * sh * vec3(1., 1.02, 1.1));   // a shadow on warm paper is a little cool
  o = vec4(bg * (1. - A) + P, 1.);
}`;

function compile(gl, vs, fs) {
    const p = gl.createProgram();
    for (const [t, s] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
        const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error('mimosa-toggle: ' + gl.getShaderInfoLog(sh));
        gl.attachShader(p, sh);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('mimosa-toggle: ' + gl.getProgramInfoLog(p));
    const U = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const nm = gl.getActiveUniform(p, i).name; U[nm] = gl.getUniformLocation(p, nm); }
    return { p, U };
}
async function bitmap(url, exact) {
    const r = await fetch(url);
    if (!r.ok) throw new Error('mimosa-toggle: could not load ' + url);
    return createImageBitmap(await r.blob(), exact ? { premultiplyAlpha: 'none', colorSpaceConversion: 'none' } : { premultiplyAlpha: 'none' });
}

/* ── the leaf as a little machine: geometry from the JSON, three tiers of actuator ───────── */
function buildLeaf(meta) {
    const [bx, by] = meta.box;
    const P0 = meta.pulvinus, J = meta.hub;
    const pieces = meta.pieces.map((p) => ({ ...p }));
    const leaflets = pieces.filter((p) => p.kind === 'leaflet');
    for (const p of leaflets) {
        p.P = [p.pivot[0] + bx, p.pivot[1] + by];                 // pulvinule, plate px
        const t = p.t, N = [-t[1], t[0]], m = [N[0] * p.side, N[1] * p.side];
        const a = p.axis, w = [-a[1], a[0]];
        p.m = m; p.w = w;
        p.a3 = [a[0] * t[0] + a[1] * t[1], a[0] * m[0] + a[1] * m[1]];
        p.w3 = [w[0] * t[0] + w[1] * t[1], w[0] * m[0] + w[1] * m[1]];
        p.beta0 = Math.atan2(Math.abs(p.a3[1]), p.a3[0]);
        p.mid = [p.P[0] + a[0] * p.len * .5, p.P[1] + a[1] * p.len * .5];
        p.jit = (Math.sin(p.id * 12.9898) * 43758.5453) % 1;     // a fixed small difference per leaflet
        p.jit = p.jit - Math.floor(p.jit);
    }
    // pinna base directions, and how far each turns when the pinnae converge
    const ang = meta.pinnae.map((pn) => {
        const path = pn.path, q = path[Math.min(path.length - 1, 30)];
        return Math.atan2(q[1] - J[1], q[0] - J[0]);
    });
    const mx = ang.reduce((s, a) => s + Math.cos(a), 0), my = ang.reduce((s, a) => s + Math.sin(a), 0);
    const mean = Math.atan2(my, mx);
    const conv = ang.map((a) => { let d = mean - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d * .5; });
    const pet = [J[0] - P0[0], J[1] - P0[1]], petLen = Math.hypot(pet[0], pet[1]);
    const u = [pet[0] / petLen, pet[1] / petLen];
    return { pieces, leaflets, P0, J, conv, u, petLen, box: meta.box, plate: meta.plate, nP: meta.pinnae.length };
}

// 2D affine as [a, b, c, d, e, f]:  x' = a x + c y + e,  y' = b x + d y + f
const mul = (A, B) => [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3],
    A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]];
const about = (L, P) => [L[0], L[1], L[2], L[3], P[0] - L[0] * P[0] - L[2] * P[1], P[1] - L[1] * P[0] - L[3] * P[1]];
const rot = (th) => [Math.cos(th), Math.sin(th), -Math.sin(th), Math.cos(th)];

/* A leaflet folding on its pulvinule, in its own frame: t along the rachis toward the tip, m out to
 * its side, z toward the viewer. It rises about the rachis (phi) until it nearly stands against its
 * partner, faces together, and sweeps forward toward the tip (sigma) so the closed pairs overlap like
 * tiles along the rachis. Returns the 2D affine (plate px) and the leaflet's height for its shadow. */
const PHI = 1.16, BETA_CLOSED = .30;
function foldAffine(p, f) {
    if (f <= 1e-4) return { M: [1, 0, 0, 1, 0, 0], z: 0 };
    const phi = PHI * f, cph = Math.cos(phi), sph = Math.sin(phi);
    const r1 = (v) => [v[0], v[1] * cph, v[1] * sph];
    const a1 = r1(p.a3), w1 = r1(p.w3), n = [0, -sph, cph];
    const sig = -smooth(.12, 1, f) * Math.max(0, p.beta0 - BETA_CLOSED);
    const cs = Math.cos(sig), sn = Math.sin(sig);
    const rr = (v) => {                                                // Rodrigues about n
        const cx = n[1] * v[2] - n[2] * v[1], cy = n[2] * v[0] - n[0] * v[2], cz = n[0] * v[1] - n[1] * v[0];
        const d = n[0] * v[0] + n[1] * v[1] + n[2] * v[2];
        return [v[0] * cs + cx * sn + n[0] * d * (1 - cs), v[1] * cs + cy * sn + n[1] * d * (1 - cs), v[2] * cs + cz * sn + n[2] * d * (1 - cs)];
    };
    const a2 = rr(a1), w2 = rr(w1);
    const t = p.t, m = p.m;
    const A = [a2[0] * t[0] + a2[1] * m[0], a2[0] * t[1] + a2[1] * m[1]];
    const W = [w2[0] * t[0] + w2[1] * m[0], w2[0] * t[1] + w2[1] * m[1]];
    const a = p.axis, w = p.w;
    const L = [A[0] * a[0] + W[0] * w[0], A[1] * a[0] + W[1] * w[0], A[0] * a[1] + W[0] * w[1], A[1] * a[1] + W[1] * w[1]];
    return { M: about(L, p.P), z: Math.max(Math.max(0, a2[2]) * p.len * .5, Math.abs(w2[2]) * p.width * .6) };
}

export function mimosaToggle(input, opts = {}) {
    const ds = input.dataset;
    const o = {
        src: opts.src ?? ds.src,
        speed: +(opts.speed ?? ds.speed ?? 900),
        recover: +(opts.recover ?? ds.recover ?? 1),
        habituate: String(opts.habituate ?? ds.habituate ?? 'true') !== 'false',
    };
    const fig = input.closest('.mt') || input.parentElement;
    const img = fig.querySelector('.mt-plate');
    if (!o.src || !img) return Object.assign(() => {}, { set() {}, sync() {} });
    const base = o.src.replace(/[^/]*$/, '');
    let dead = false, raf = 0, visible = true, gl = null, R = null, leaf = null, ready = false;
    const off = [];
    const on = (t, ev, fn, op) => { t.addEventListener(ev, fn, op); off.push(() => t.removeEventListener(ev, fn, op)); };
    const fire = (name, detail) => input.dispatchEvent(new CustomEvent('mimosa-toggle:' + name, { bubbles: true, detail }));

    const canvas = document.createElement('canvas');
    canvas.className = 'mt-canvas'; canvas.setAttribute('aria-hidden', 'true');
    const ring = document.createElement('span');
    ring.className = 'mt-ring'; ring.setAttribute('aria-hidden', 'true');
    fig.insertBefore(canvas, input);
    input.after(ring);
    fig.classList.add('mt-js');

    /* state */
    let A = null;                        // { q, c[], f[] }
    let h = 0, hT = performance.now();   // habituation and when it was last updated
    let lastPt = null, closedShown = false, fellAt = 0, openAt = 0;
    const tired = (now) => { h *= Math.exp(-(now - hT) / 25000); hT = now; return h; };

    /* ── placing the switch over the leaf ── */
    function placeSwitch() {
        const [W, H] = leaf.plate, [bx, by] = leaf.box;
        // the leaf's outline: convex hull of its pieces' corners
        const pts = [];
        for (const p of leaf.pieces) { const b = p.bbox; pts.push([b[0] + bx, b[1] + by], [b[2] + bx, b[1] + by], [b[0] + bx, b[3] + by], [b[2] + bx, b[3] + by]); }
        pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        const cross = (O, A2, B) => (A2[0] - O[0]) * (B[1] - O[1]) - (A2[1] - O[1]) * (B[0] - O[0]);
        const lo = [], hi = [];
        for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
        for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
        const hull = lo.slice(0, -1).concat(hi.slice(0, -1));
        const x0 = Math.min(...hull.map((p) => p[0])), x1 = Math.max(...hull.map((p) => p[0]));
        const y0 = Math.min(...hull.map((p) => p[1])), y1 = Math.max(...hull.map((p) => p[1]));
        const pc = (v, a) => (v / a * 100).toFixed(3) + '%';
        for (const el of [input, ring]) {
            el.style.left = pc(x0, W); el.style.top = pc(y0, H); el.style.width = pc(x1 - x0, W); el.style.height = pc(y1 - y0, H);
        }
        input.style.clipPath = 'polygon(' + hull.map((p) => pc(p[0] - x0, x1 - x0) + ' ' + pc(p[1] - y0, y1 - y0)).join(',') + ')';
        leaf.hit = { x0, y0, x1, y1 };
    }
    function platePoint(ev) {
        const r = img.getBoundingClientRect();
        return [(ev.clientX - r.left) / r.width * leaf.plate[0], (ev.clientY - r.top) / r.height * leaf.plate[1]];
    }

    /* ── the reflex ── */
    function nearestLeaflet(pt) {
        let best = null, bd = 1e9;
        for (const p of leaf.leaflets) {
            const d = Math.hypot(p.mid[0] - pt[0], p.mid[1] - pt[1]);
            if (d < bd) { bd = d; best = p; }
        }
        return best;
    }
    function fold(pt) {
        const now = performance.now();
        const hh = o.habituate ? tired(now) : 0;
        if (o.habituate) h = hh + (1 - hh) * .34;
        const strong = hh < .55;
        if (calm.matches) { setPose(1); fire('fold', { response: strong ? 1 : .4, strength: strong ? 'full' : 'tired' }); return; }
        if (!strong) {
            // a tired leaf: no reflex, no fall; it closes all the same, slowly, as at dusk
            for (const p of leaf.leaflets) A.f[p.id].go(now, 1, (p.jit * 1.1 + p.s / p.slen * .4) * 1000, (1.6 + p.jit * .9) * 1000, EASE.open);
            for (let k = 0; k < leaf.nP; k++) A.c[k].go(now, .45, 900, 2600, EASE.open);
            A.q.go(now, 0, 0, 1800, EASE.open);
            fire('fold', { response: .4, strength: 'tired' });
            return kick();
        }
        const start = nearestLeaflet(pt || defaultPoint());
        const k0 = start.pinna, s0 = start.s, v = o.speed / 1000;          // px per ms
        const tHub = s0 / v + 40;
        for (const p of leaf.leaflets) {
            let t;
            if (p.pinna === k0) t = p.s <= s0 ? (s0 - p.s) / v : (p.s - s0) / (v * .55);   // toward the base, and more slowly outward
            else t = tHub + 90 + p.s / v;                                                    // into the other pinnae from their bases
            A.f[p.id].go(now, 1, t + p.jit * 30, 190 + p.jit * 70, EASE.fold);
        }
        for (let k = 0; k < leaf.nP; k++) A.c[k].go(now, 1, tHub + (k === k0 ? 60 : 160), 650, EASE.fold);
        const tFall = tHub + leaf.petLen / (v * 2.4) + 80;
        A.q.go(now, 1, tFall, 520, EASE.fall);
        fellAt = now + tFall;
        fire('fold', { response: 1 - hh * .5, strength: 'full' });
        kick();
    }
    function unfold() {
        const now = performance.now();
        if (calm.matches) { setPose(0); fire('open', {}); return; }
        const k = o.recover;
        A.q.go(now, 0, 150 * k, 2600 * k, EASE.open);                     // the petiole lifts first
        for (let i = 0; i < leaf.nP; i++) A.c[i].go(now, 0, (600 + i * 170) * k, 2600 * k, EASE.open);
        for (const p of leaf.leaflets) {
            const r = (p.jit * 7.13) % 1;                                     // each leaflet at its own moment
            A.f[p.id].go(now, 0, (1000 + r * 3200 + (1 - p.s / p.slen) * 500) * k, (1100 + p.jit * 1300) * k, EASE.open);
        }
        openAt = now + 6500 * k;
        kick();
    }
    function defaultPoint() {
        // a key or a label click: the signal starts at the tip of the long middle pinna
        const p = leaf.leaflets.filter((l) => l.pinna === 2).sort((a, b) => b.s - a.s)[0];
        return p.mid;
    }
    function setPose(v) {
        const now = performance.now();
        A.q.set(v); for (const c of A.c) c.set(v); for (const p of leaf.leaflets) A.f[p.id].set(v);
        draw(now); show(v > 0);
    }

    /* ── drawing ── */
    let inst = null, instBuf = null;
    function poses(now) {
        const [bx, by] = leaf.box;
        const toPlate = [1, 0, 0, 1, bx, by];
        const q = A.q.at(now);
        // the leaf falls at the primary pulvinus, away from you: seen from the front it foreshortens
        // along the petiole (and turns down a hair), so the stalk stays on its own line
        const s = 1 - .2 * q, u = leaf.u;
        const S = [1 + (s - 1) * u[0] * u[0], (s - 1) * u[0] * u[1], (s - 1) * u[0] * u[1], 1 + (s - 1) * u[1] * u[1]];
        const R0 = rot(.012 * q);
        const Mleaf = about([R0[0] * S[0] + R0[2] * S[1], R0[1] * S[0] + R0[3] * S[1], R0[0] * S[2] + R0[2] * S[3], R0[1] * S[2] + R0[3] * S[3]], leaf.P0);
        const Mp = [];
        for (let k = 0; k < leaf.nP; k++) Mp.push(mul(Mleaf, about(rot(leaf.conv[k] * A.c[k].at(now)), leaf.J)));
        let n = 0, any = q > 1e-4;
        const fl = inst;
        for (const p of leaf.pieces) {
            let M, under = 0, shade = 0;
            if (p.kind === 'petiole') M = mul(Mleaf, toPlate);
            else if (p.kind === 'rachis') M = mul(Mp[p.pinna], toPlate);
            else {
                const f = A.f[p.id].at(now);
                if (f > 1e-4) any = true;
                const F = foldAffine(p, clamp(f, 0, 1.02));
                M = mul(Mp[p.pinna], mul(F.M, toPlate));
                under = smooth(.4, 1, f) * .6;
                shade = clamp(F.z / 22) * .7;
            }
            const b = p.bbox, j = n * 14;
            fl[j] = b[0]; fl[j + 1] = b[1]; fl[j + 2] = b[2]; fl[j + 3] = b[3];
            fl[j + 4] = M[0]; fl[j + 5] = M[2]; fl[j + 6] = M[4];
            fl[j + 7] = M[1]; fl[j + 8] = M[3]; fl[j + 9] = M[5];
            fl[j + 10] = p.id; fl[j + 11] = under; fl[j + 12] = shade + .04 * q; fl[j + 13] = 0;
            n++;
        }
        for (let k = 0; k < leaf.nP; k++) if (A.c[k].at(now) > 1e-4) any = true;
        return any;
    }
    function draw(now) {
        if (!R) return false;
        const any = poses(now);
        const [W, H] = leaf.plate, [bx, by, bx1, by1] = leaf.box;
        gl.bindBuffer(gl.ARRAY_BUFFER, instBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, inst);
        gl.bindVertexArray(R.vaoP);
        gl.useProgram(R.piece.p);
        gl.uniform2f(R.piece.U.uPlate, W, H); gl.uniform2f(R.piece.U.uBox, bx1 - bx, by1 - by);
        gl.uniform1i(R.piece.U.uLeaf, 1); gl.uniform1i(R.piece.U.uIds, 2);
        gl.enable(gl.BLEND);
        // 1. the leaf's colour and coverage, summed (exact where pieces abut at rest)
        gl.bindFramebuffer(gl.FRAMEBUFFER, R.acc.fb); gl.viewport(0, 0, R.w, R.h);
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE);
        gl.uniform1i(R.piece.U.uMode, 0); gl.uniform2f(R.piece.U.uShift, 0, 0);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, leaf.pieces.length);
        // 2. shadows of whatever has lifted off the paper (key light upper left)
        gl.bindFramebuffer(gl.FRAMEBUFFER, R.shA.fb); gl.viewport(0, 0, R.sw, R.sh);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.blendEquation(gl.MAX);
        gl.uniform1i(R.piece.U.uMode, 1); gl.uniform2f(R.piece.U.uShift, 12, 17);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, leaf.pieces.length);
        gl.disable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD);
        gl.bindVertexArray(R.vaoQ);
        gl.useProgram(R.blur.p); gl.uniform1i(R.blur.U.uT, 0); gl.activeTexture(gl.TEXTURE0);
        const rad = 1.6;
        gl.bindFramebuffer(gl.FRAMEBUFFER, R.shB.fb); gl.bindTexture(gl.TEXTURE_2D, R.shA.tex);
        gl.uniform2f(R.blur.U.uDir, rad / R.sw, 0); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, R.shA.fb); gl.bindTexture(gl.TEXTURE_2D, R.shB.tex);
        gl.uniform2f(R.blur.U.uDir, 0, rad / R.sh); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        // 3. the plate, the clean plate under the leaf, the shadow, the leaf
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, R.w, R.h);
        gl.useProgram(R.fin.p);
        const U = R.fin.U;
        gl.uniform1i(U.uPlate, 3); gl.uniform1i(U.uClean, 4); gl.uniform1i(U.uAcc, 5); gl.uniform1i(U.uSh, 6);
        gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, R.acc.tex);
        gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, R.shA.tex);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, null);
        gl.uniform4f(U.uBoxR, bx / W, by / H, (bx1 - bx) / W, (by1 - by) / H);
        gl.uniform1f(U.uShK, .30);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        return any;
    }
    function show(on) {
        if (on === closedShown) return;
        closedShown = on;
        fig.classList.toggle('mt-moving', on);          // canvas over the plate; the <img> is the plate at rest
    }
    function busy(now) {
        if (A.q.busy(now)) return true;
        for (const c of A.c) if (c.busy(now)) return true;
        for (const p of leaf.leaflets) if (A.f[p.id].busy(now)) return true;
        return false;
    }
    let fellFired = true;
    function tick() {
        raf = 0;
        if (dead || !R) return;
        const now = performance.now();
        const any = draw(now);
        show(any);
        if (!fellFired && now >= fellAt) { fellFired = true; fire('fall', {}); }
        if (busy(now)) { if (visible && !document.hidden) raf = requestAnimationFrame(tick); }
        else if (!any && input.checked) fire('open', {});
    }
    function kick() { fellFired = false; if (!raf && visible && !document.hidden) raf = requestAnimationFrame(tick); }

    /* ── GL setup ── */
    function tex(src, { mip = true, ids = false } = {}) {
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
        if (ids) {
            const c = new OffscreenCanvas(src.width, src.height), x = c.getContext('2d', { willReadFrequently: true });
            x.drawImage(src, 0, 0);
            const d = x.getImageData(0, 0, src.width, src.height).data;
            gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8UI, src.width, src.height, 0, gl.RGBA_INTEGER, gl.UNSIGNED_BYTE, d);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        } else {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
            if (mip) gl.generateMipmap(gl.TEXTURE_2D);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        }
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return t;
    }
    function target(w, h, half) {
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        const f = half ? gl.RGBA16F : gl.RGBA8;
        gl.texImage2D(gl.TEXTURE_2D, 0, f, w, h, 0, gl.RGBA, half ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const fb = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
        const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
        return ok ? { tex: t, fb } : null;
    }
    let images = null;
    function setupGL() {
        gl = canvas.getContext('webgl2', { alpha: false, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true });
        if (!gl) throw new Error('mimosa-toggle: no WebGL2');
        const half = !!gl.getExtension('EXT_color_buffer_float') || !!gl.getExtension('EXT_color_buffer_half_float');
        R = { half };
        R.piece = compile(gl, PIECE_VS, PIECE_FS);
        R.blur = compile(gl, QUAD_VS, BLUR_FS);
        R.fin = compile(gl, QUAD_VS, FINAL_FS);
        const quad = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
        R.vaoQ = gl.createVertexArray(); gl.bindVertexArray(R.vaoQ);
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        inst = new Float32Array(leaf.pieces.length * 14);
        instBuf = gl.createBuffer();
        R.vaoP = gl.createVertexArray(); gl.bindVertexArray(R.vaoP);
        gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, instBuf); gl.bufferData(gl.ARRAY_BUFFER, inst.byteLength, gl.DYNAMIC_DRAW);
        const lay = [[1, 4, 0], [2, 3, 16], [3, 3, 28], [4, 4, 40]];
        for (const [loc, size, offB] of lay) {
            gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 56, offB); gl.vertexAttribDivisor(loc, 1);
        }
        gl.bindVertexArray(null);
        gl.activeTexture(gl.TEXTURE1); R.tLeaf = tex(images.leaf);
        const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
        if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
        gl.activeTexture(gl.TEXTURE2); R.tIds = tex(images.ids, { ids: true });
        gl.activeTexture(gl.TEXTURE3); R.tPlate = tex(images.plate);
        gl.activeTexture(gl.TEXTURE4); R.tClean = tex(images.clean);
        gl.activeTexture(gl.TEXTURE0);
        resize();
    }
    function resize() {
        if (!gl) return;
        const r = img.getBoundingClientRect();
        if (r.width < 2) return;
        const dpr = Math.min(2, devicePixelRatio || 1);
        const w = Math.round(r.width * dpr), h2 = Math.round(r.height * dpr);
        if (R.w === w && R.h === h2) return;
        canvas.width = w; canvas.height = h2;
        for (const k of ['acc', 'shA', 'shB']) if (R[k]) { gl.deleteTexture(R[k].tex); gl.deleteFramebuffer(R[k].fb); }
        R.w = w; R.h = h2; R.sw = Math.max(2, w >> 1); R.sh = Math.max(2, h2 >> 1);
        R.acc = target(w, h2, R.half) || target(w, h2, false);
        R.shA = target(R.sw, R.sh, false); R.shB = target(R.sw, R.sh, false);
        draw(performance.now());
    }

    /* ── events ── */
    on(input, 'pointerdown', (e) => { if (ready) lastPt = platePoint(e); });
    on(input, 'keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); input.click(); } });
    on(input, 'change', () => {
        if (!ready) return;
        const pt = lastPt; lastPt = null;
        if (input.checked) unfold(); else fold(pt);
    });
    const ro = new ResizeObserver(() => resize());
    ro.observe(img);
    const io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible && ready && busy(performance.now())) kick(); });
    io.observe(fig);
    on(document, 'visibilitychange', () => { if (!document.hidden && ready && busy(performance.now())) kick(); });
    on(canvas, 'webglcontextlost', (e) => { e.preventDefault(); R = null; cancelAnimationFrame(raf); raf = 0; fig.classList.remove('mt-moving'); closedShown = false; });
    on(canvas, 'webglcontextrestored', () => { try { setupGL(); draw(performance.now()); show(!input.checked); } catch (err) { console.warn(err); } });

    (async () => {
        const meta = await (await fetch(o.src)).json();
        const [leafB, idsB, plateB, cleanB] = await Promise.all([
            bitmap(base + 'mimosa-leaf.webp', true), bitmap(base + 'mimosa-ids.png', true),
            bitmap(img.currentSrc || img.src, false), bitmap(base + 'mimosa-clean.webp', true)]);
        if (dead) return;
        leaf = buildLeaf(meta);
        images = { leaf: leafB, ids: idsB, plate: plateB, clean: cleanB };
        A = { q: new Act(), c: Array.from({ length: leaf.nP }, () => new Act()), f: [] };
        for (const p of leaf.leaflets) A.f[p.id] = new Act();
        placeSwitch();
        setupGL();
        ready = true;
        fig.classList.add('mt-ready');
        input.__mimosa = api;
        if (!input.checked) setPose(1);
    })().catch((err) => { console.warn(err); fig.classList.add('mt-fallback'); });

    function destroy() {
        dead = true; cancelAnimationFrame(raf);
        off.forEach((f) => f()); ro.disconnect(); io.disconnect();
        if (gl) gl.getExtension('WEBGL_lose_context')?.loseContext();
        canvas.remove(); ring.remove();
        fig.classList.remove('mt-js', 'mt-ready', 'mt-moving', 'mt-fallback');
        input.style.cssText = '';
        delete input.__mimosa;
    }
    const api = Object.assign(destroy, {
        /** switch it as a person would: fires input and change, the leaf folds or opens */
        set(v) { if (input.checked === !!v) return; input.checked = !!v; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); },
        /** the value was changed in code: jump the drawing to match, no movement */
        sync() { if (ready) setPose(input.checked ? 0 : 1); },
        /** render a frame at a given time (tests and screenshots) */
        render(t) { if (ready) { const any = draw(t); show(any); return any; } },
    });
    Object.defineProperties(api, {
        ready: { get: () => ready },
        habituation: { get: () => (o.habituate && ready ? tired(performance.now()) : 0) },
        leaf: { get: () => leaf },
    });
    return api;
}

const live = new WeakMap();
function boot() {
    for (const el of document.querySelectorAll('input[data-mimosa-toggle]')) if (!live.has(el)) live.set(el, mimosaToggle(el));
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
