/*
 *  CERA-TABLET // a Roman wax tablet and stylus as a text input.
 *
 *  Markup:  <div data-cera-tablet>
 *             <div class="ct-leaf"><textarea name="note"></textarea></div>
 *             <div class="ct-leaf">…</div>
 *           </div>
 *  or just  <textarea data-cera-tablet rows="3"></textarea>  (wrapped in one leaf)
 *  or call  ceraTablet(el, options)  yourself. Returns destroy(), which also
 *  carries destroy.clear(), destroy.sync(), destroy.fields.
 *
 *  The fields stay real <textarea>/<input> elements on top: their text is
 *  transparent, the caret and selection are native, so keyboard, IME,
 *  autofill, spellcheck menus, screen readers and phone keyboards all work.
 *  They are set in "Cera Metrics", a font with no outlines at all, only the
 *  advance widths of the incised hand below, so the browser's own wrapping
 *  and caret land exactly on the letters. A hidden mirror of each field
 *  reports where every character sits (Range rects); the module diffs each
 *  edit against what is already cut in the wax and queues physical work:
 *
 *    insert  -> the stylus point ploughs each letter's strokes: a V-groove,
 *               the displaced wax pushed up into low ridges either side.
 *               Force follows typing speed (or pen pressure); a forceful cut
 *               goes through the wax and scores the wood beneath.
 *    delete  -> the flat spatula end drags across the letters: the wax is
 *               levelled (an anisotropic blur pulled toward the flat), with a
 *               faint smear and polish. Wood scores survive; the wax over them
 *               sinks a little, so deleted text stays as a palimpsest.
 *    reflow  -> letters that had to move are smoothed and re-cut, as a scribe
 *               would have to.
 *    clear   -> the leaf is warmed: the wax melts in patches, levels, cools.
 *
 *  The heightfield (wax surface, wood score depth, polish) lives on the CPU
 *  in Float32Arrays; only changed rectangles are uploaded to WebGL2, where
 *  one fragment shader lights wax and wooden frame together under a low
 *  raking light (normals, a short shadow march, a little specular). Without
 *  WebGL2 a 2D canvas shades the wax and CSS draws the frame. rAF runs only
 *  while something moves.
 */

import tilt from './tilt.js';

const calm = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

const BASE_URL = new URL('.', import.meta.url);
const ASSET = (f) => new URL('./assets/' + f, import.meta.url).href;

/* The leaves are two leaves of one Coptic wax-tablet set at the Met (14.2.4b
 * and d, CC0), cut from the museum's photographs by tools/cut-leaves.py.
 * img = the image box.
 * cera-tablet.css places .ct-wax on the photographed wax panel; the shader
 * lights only inside that panel and leaves the rest to the photograph.     */
const LEAVES = {
    l: { img: 'leaf-l.webp', w: 1129, h: 1752 },          // 14.2.4b: written in Greek, holes on its right
    r: { img: 'leaf-r.webp', w: 1128, h: 1752 },          // 14.2.4d: smooth wax, holes on its left
    one: { img: 'leaf-one.webp', w: 1752, h: 1125 },      // 14.2.4d's twin face, lying landscape
    land: { img: 'leaf-land.webp', w: 1752, h: 1129 },    // l and r turned a quarter, for narrow screens
    'land-r': { img: 'leaf-land-r.webp', w: 1752, h: 1128 },
};
const NARROW = matchMedia('(max-width: 640px)');  // keep in step with cera-tablet.css
const GLYPH_URL = new URL('./assets/glyphs.json', import.meta.url).href;

/* ---- the hand ------------------------------------------------------------
 * Glyph units: an em is 12 units, x-height 5, caps 7.6. Keep XS and TRACK in
 * step with tools/build-font.py, which builds the metrics font from the same
 * glyphs.json.                                                               */
const EM = 12;
const XS = 0.86;       // horizontal compression
const TRACK = 0.3;     // added to each advance
const SLANT = 0.16;    // rightward lean per unit of height
const TENSION = 0.3;   // Catmull-Rom tangent scale (0.5 = classic); lower is more angular, as stylus strokes in wax are
const ASC = 0.8;       // font ascent, em
const DESC = 0.3;      // font descent, em

/* ---- the material, in wax-thickness units (the wax layer is 1) --------- */
const T = 1;              // wax thickness
const D_MIN = 0.4;        // groove depth at the lightest touch
const D_MAX = 1.26;       // at full force: past 1 the point is in the wood
const SCORE_GAIN = 1.25;  // how deep the point bites into wood for the excess
const SAG_SMOOTH = 1.6;   // spatula: a cut that went through to the wood is never packed full again (per unit of score)
const SAG_CLEAR = 1.1;    // melting: thicker wax over a score shrinks more as it cools
const RESIDUE = 0.2;      // how much of the old relief the spatula leaves, smeared
const GHOST = 0.36;       // after a sent note: one quick pass of the spatula, so more of the old letters stays, faint
const WIPE_MS = 1000;     // that pass, start to finish
const SWEEP_MS = 1500;    // on sending: the tablet tipped to the lamp once, to see the letters set
const GROOVE = 0.036;     // groove half width, in ems of the hand (a stylus point is about 1 mm; letters about 6 to 8 mm high)
const BURR = 0.14;
const RELIEF = 0.034;     // CSS px of depth per wax thickness, per px of letter size (the lamp's view of the cut)        // height of the burr beside a groove, per unit of depth

const MELT_MS = 1500;
const COOL_MS = 1600;

let GLYPHS = null;
let glyphsReady = null;
function loadGlyphs() {
    if (!glyphsReady) {
        glyphsReady = fetch(GLYPH_URL).then((r) => r.json()).then((g) => {
            GLYPHS = {};
            for (const [ch, spec] of Object.entries(g)) GLYPHS[ch] = parseGlyph(spec);
        }).catch(() => { GLYPHS = {}; });
    }
    return glyphsReady;
}

function parseGlyph(spec) {
    const parts = spec.split('|');
    const adv = parseFloat(parts[0]);
    const strokes = [];
    for (const s of parts.slice(1)) {
        const toks = s.trim().split(/\s+/).filter(Boolean);
        if (!toks.length) continue;
        const runs = [[]];
        for (let t of toks) {
            const corner = t[0] === '!';
            if (corner) t = t.slice(1);
            const [x, y] = t.split(',').map(Number);
            runs[runs.length - 1].push([x, y]);
            if (corner) runs.push([[x, y]]);
        }
        strokes.push(runs.filter((r) => r.length > 1 || runs.length === 1));
    }
    return { adv, strokes };
}

// Hermite through the points, with tangents scaled by TENSION.
function spline(run, step) {
    if (run.length < 3) return run.slice();
    const n = run.length;
    const P = [[2 * run[0][0] - run[1][0], 2 * run[0][1] - run[1][1]], ...run,
        [2 * run[n - 1][0] - run[n - 2][0], 2 * run[n - 1][1] - run[n - 2][1]]];
    const out = [];
    for (let i = 1; i < P.length - 2; i++) {
        const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2];
        const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
        const k = Math.max(2, Math.ceil(len / step));
        const m1 = [TENSION * (p2[0] - p0[0]), TENSION * (p2[1] - p0[1])];
        const m2 = [TENSION * (p3[0] - p1[0]), TENSION * (p3[1] - p1[1])];
        for (let j = 0; j < k; j++) {
            const t = j / k, t2 = t * t, t3 = t2 * t;
            const a = 2 * t3 - 3 * t2 + 1, b = t3 - 2 * t2 + t, c = -2 * t3 + 3 * t2, d = t3 - t2;
            out.push([a * p1[0] + b * m1[0] + c * p2[0] + d * m2[0], a * p1[1] + b * m1[1] + c * p2[1] + d * m2[1]]);
        }
    }
    out.push(run[n - 1]);
    return out;
}

// combining marks drawn as their own small strokes over the base letter
const MARKS = {
    '́': [[[-0.3, 0], [0.7, 1.1]]],
    '̀': [[[-0.7, 1.1], [0.3, 0]]],
    '̂': [[[-0.9, 0], [0, 1], [0.9, 0]]],
    '̈': [[[-0.8, 0.2], [-0.7, 0.55]], [[0.7, 0.2], [0.8, 0.55]]],
    '̃': [[[-1, 0.2], [-0.4, 0.8], [0.3, 0.3], [1, 0.9]]],
    '̊': [[[0, 1.1], [-0.5, 0.6], [0, 0.1], [0.5, 0.6], [0, 1.1]]],
    '̧': [[[0, 0], [0.4, -0.8], [-0.4, -1.4]]],
};

function rnd(seed) { // mulberry32
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* A glyph's strokes in canvas CSS px, with a little of a hand's variation:
 * each letter sits a touch rotated, scaled and lifted, the same way every
 * time for the same letter in the same place (seeded), so a re-cut matches. */
function glyphStrokes(ch, x0, base, size, seed) {
    if (!GLYPHS) return null;
    const u = size / EM;
    let g = GLYPHS[ch];
    let marks = null;
    if (!g) {
        const nfd = ch.normalize('NFD');
        if (nfd.length > 1 && GLYPHS[nfd[0]]) {
            g = GLYPHS[nfd[0]];
            marks = [...nfd.slice(1)].map((m) => MARKS[m]).filter(Boolean);
            ch = nfd[0];
        } else return null;
    }
    const lower = ch.toLowerCase() === ch && ch.toUpperCase() !== ch;
    const ey = (y) => (lower ? (y > 5 ? 5 + (y - 5) * 1.18 : y < 0 ? y * 1.12 : y) : y);
    const r = rnd(seed);
    // a quick hand in wax: each letter a touch turned, sized and lifted off the line
    const rot = (r() - 0.5) * 0.09, sc = 1 + (r() - 0.5) * 0.1, lift = (r() - 0.5) * 0.45, lean = (r() - 0.5) * 0.12;
    // and every stroke drags a little: a slow sideways drift along its length
    const wob = [r() * 6.28, r() * 6.28, 0.05 + r() * 0.07];
    const cx = (g.adv * XS) / 2;
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const map = (gx, gy) => {
        let x = (gx * XS - cx) * sc, y = (ey(gy) + lift) * sc;
        const xr = x * cs - y * sn, yr = x * sn + y * cs;
        const xx = xr + cx + TRACK / 2 + yr * (SLANT + lean);
        const dw = Math.sin(gy * 0.9 + wob[0]) * wob[2], dv = Math.sin(gx * 1.1 + wob[1]) * wob[2];
        return { x: x0 + (xx + dw) * u + (r() - 0.5) * 0.05 * u, y: base - (yr + dv) * u + (r() - 0.5) * 0.05 * u };
    };
    const step = 0.35;
    const out = [];
    for (const runs of g.strokes) {
        const pts = [];
        for (const run of runs) {
            const sp = spline(run, step);
            for (let i = pts.length ? 1 : 0; i < sp.length; i++) pts.push(sp[i]);
        }
        out.push(pts.map(([gx, gy]) => map(gx, gy)));
    }
    if (marks) {
        const top = lower ? 6.0 : 8.3, bottom = -0.2;
        for (const m of marks) for (const st of m) {
            const below = st === MARKS['̧'][0];
            out.push(spline(st.map(([a, b]) => [a / XS + g.adv / 2, (below ? bottom : top) + b]), step)
                .map(([gx, gy]) => map(gx, below ? gy : gy / (lower ? 1 : 1)))); // marks are not stretched
        }
    }
    return out;
}

/* ---- noise --------------------------------------------------------------- */
function hash2(x, y, s) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}
function vnoise(x, y, s) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/* ---- sound: a dry scratch whose grain follows the stroke ---------------- */
const scratch = (() => {
    let ctx = null, src = null, gain = null, bp = null, on = false;
    const stored = () => { try { return localStorage.getItem('sf-sound') === 'on'; } catch { return false; } };
    on = stored();
    addEventListener('sf-sound', (e) => { on = !!e.detail; if (!on) quiet(); });
    addEventListener('storage', (e) => { if (e.key === 'sf-sound') on = stored(); });
    function init() {
        if (ctx || !on) return;
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
        // a second of grit: sparse clicks (the point catching on wax grains)
        // over a thin bed of noise; played faster for a faster stroke, so the
        // grains come closer together and higher, as they do.
        const n = ctx.sampleRate | 0, buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
        const r = rnd(7);
        let lp = 0;
        for (let i = 0; i < n; i++) {
            const w = r() * 2 - 1;
            lp += (w - lp) * 0.6;
            d[i] = (w - lp) * 0.16;
        }
        for (let k = 0; k < 520; k++) {
            const at = (r() * n) | 0, amp = 0.25 + r() * 0.75, len = 18 + ((r() * 60) | 0);
            for (let j = 0; j < len && at + j < n; j++) d[at + j] += amp * Math.exp(-j / (len * 0.25)) * (r() * 2 - 1);
        }
        src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
        bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.7; bp.frequency.value = 2600;
        gain = ctx.createGain(); gain.gain.value = 0;
        src.connect(bp).connect(gain).connect(ctx.destination);
        src.start();
    }
    function quiet() { if (gain && ctx) gain.gain.setTargetAtTime(0, ctx.currentTime, 0.02); }
    return {
        wake() { if (on) { init(); if (ctx && ctx.state === 'suspended') ctx.resume(); } },
        // v: stroke speed in px/s; force 0..1; kind 'point' | 'spatula'
        set(v, force, kind) {
            if (!on || !ctx) return;
            const t = ctx.currentTime;
            if (v <= 0) { gain.gain.setTargetAtTime(0, t, 0.015); return; }
            const sp = clamp(v / 900, 0.15, 2.4);
            src.playbackRate.setTargetAtTime(kind === 'spatula' ? 0.35 + sp * 0.2 : 0.55 + sp * 0.55, t, 0.01);
            bp.frequency.setTargetAtTime(kind === 'spatula' ? 900 : 1800 + sp * 1500 + force * 600, t, 0.01);
            gain.gain.setTargetAtTime((kind === 'spatula' ? 0.18 : 0.22) * (0.5 + force * 0.7) * Math.min(1, sp * 1.4), t, 0.012);
        },
        quiet,
    };
})();

/* ---- the shader ---------------------------------------------------------- */
const VS = `#version 300 es
in vec2 aP; out vec2 vUv;
void main(){ vUv = aP * .5 + .5; vUv.y = 1. - vUv.y; gl_Position = vec4(aP, 0., 1.); }`;

const FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform vec2 uSize; uniform float uS; uniform vec2 uGrid;
uniform sampler2D tH, tS, tP, tPrev, tL0, tL1;
uniform vec4 uImg[2]; uniform vec4 uWax[2]; uniform float uSeed[2]; uniform int uN;
uniform vec3 uL; uniform float uU;
uniform float uWarm; uniform float uFade; uniform vec4 uFadeRect;

float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float a = .5, s = 0.; for (int i = 0; i < 4; i++){ s += a * vn(p); p = p * 2.03 + 17.1; a *= .5; } return s; }

// the photograph of the leaf (premultiplied)
vec4 photo(int i, vec2 p){
  vec4 R = uImg[i]; vec2 uv = (p - R.xy) / (R.zw - R.xy);
  if (uv.x < 0. || uv.y < 0. || uv.x > 1. || uv.y > 1.) return vec4(0.);
  return i == 0 ? texture(tL0, uv) : texture(tL1, uv);
}

// how far the melt has reached here (0..1): the leaf goes soft in patches, not all at once
float meltAt(vec2 p){
  float thr = fbm(p * .018 + 3.1) * .9 + vn(p * .09) * .1;
  return smoothstep(thr - .18, thr + .18, uFade * 1.45 - .2);
}
// wax surface in units (1 = the level surface, 0 = the wood floor), melting in patches while warmed
float waxU(vec2 p){
  vec2 uv = p * uS / uGrid;
  float h = texture(tH, uv).r;
  if (uFade < 1. && uv.x >= uFadeRect.x && uv.y >= uFadeRect.y && uv.x <= uFadeRect.z && uv.y <= uFadeRect.w) {
    h = mix(texture(tPrev, uv).r, h, meltAt(p));
  }
  return h;
}

// height in CSS px, 0 at the level wax. Off the panels everything is level: the
// photograph already holds the real walls and rims, lit as the museum lit them.
float H(vec2 p, out int li){
  li = -1;
  for (int i = 0; i < 2; i++){
    if (i >= uN) break;
    vec4 W = uWax[i];
    if (p.x > W.x && p.y > W.y && p.x < W.z && p.y < W.w) { li = i; return (waxU(p) - 1.) * uU; }
  }
  return 0.;
}
float Hs(vec2 p){ int l; return H(p, l); }

// bare wood at the bottom of a cut that went right through
vec3 woodCol(vec2 q, bool vert, float seed){
  float along = vert ? q.y : q.x, across = vert ? q.x : q.y;
  float w = fbm(vec2(along * .004, across * .03) + seed) * 16.;
  float ring = fract((across + w) * .09 + seed * 3.);
  float late = smoothstep(.6, .78, ring) * (1. - smoothstep(.9, 1., ring));
  float fib = vn(vec2(along * .035, across * 1.3) + seed) * .55 + vn(vec2(along * .09, across * 2.7)) * .45;
  return mix(vec3(.62, .40, .19), vec3(.42, .25, .11), late * .8) * (.88 + .22 * fib);
}

void main(){
  vec2 p = vUv * uSize;
  int li;
  float h0 = H(p, li);
  if (li < 0) { o = vec4(0.); return; }       // off the wax: the photograph beneath (CSS)
  vec4 ph = photo(li, p);
  if (ph.a < .5) { o = vec4(0.); return; }
  vec4 W = uWax[li];
  float edge = min(min(p.x - W.x, W.z - p.x), min(p.y - W.y, W.w - p.y));

  vec3 L = normalize(uL);
  vec2 ld = normalize(L.xy);
  float tanEl = L.z / length(L.xy);
  float e = .5;
  float hx = Hs(p + vec2(e, 0.)) - Hs(p - vec2(e, 0.));
  float hy = Hs(p + vec2(0., e)) - Hs(p - vec2(0., e));
  vec3 N = normalize(vec3(-hx / (2. * e), -hy / (2. * e), 1.));
  float sh = 1.;
  for (int k = 1; k <= 11; k++){
    float s = .35 * pow(float(k), 1.4);
    sh = min(sh, 1. - smoothstep(0., .3 + s * .04, Hs(p + ld * s) - (h0 + s * tanEl)));
  }

  vec3 pal = pow(ph.rgb / max(ph.a, 1e-3), vec3(1.9));   // to linear-ish
  vec2 q = p - W.xy;
  bool vert = (W.w - W.y) > (W.z - W.x);
  float seed = uSeed[li];
  vec2 uv = p * uS / uGrid;
  float hu = waxU(p);
  float sc = texture(tS, uv).r;
  float pol = texture(tP, uv).r;
  float thick = hu + sc;                       // wax over the wood floor (the floor is -score)

  // The surface of the wax is a dark skin (soot, grime, centuries of handling).
  // A cut lifts it: the walls of a fresh groove are the wax's own paler brown and
  // catch the lamp, so a stroke reads as a fine light line with one shaded side.
  float cut = clamp((1. - hu) / .3, 0., 1.);
  vec3 body = clamp(pal * 2.6, vec3(.15, .105, .06), vec3(.34, .25, .15));
  vec3 wax = mix(pal, body, smoothstep(.04, .5, cut));
  float inR = step(uFadeRect.x, uv.x) * step(uFadeRect.y, uv.y) * step(uv.x, uFadeRect.z) * step(uv.y, uFadeRect.w);
  // warm wax is a little translucent and browner, only where the melt has reached
  float wm = uWarm * inR * (uFade < 1. ? meltAt(p) : 1.);
  wax = mix(wax, vec3(.10, .055, .025), wm * .45);
  vec3 wood = woodCol(q, vert, seed);
  wood *= 1. - .6 * smoothstep(.01, .16, sc);           // old scores, wax-filled, read dark
  float show = 1. - smoothstep(.0, .14, thick);         // cut through: bare wood
  float thin = exp(-max(thick, 0.) / .16) * (1. - show);
  vec3 alb = mix(wax + wood * .2 * thin, wood, show);

  vec3 Lc = vec3(1., .96, .88);
  float amb = .32;
  float nl = max(dot(N, L), 0.);
  float d = min(nl / max(L.z, .15), 2.4);      // flat wax reads as its own photographed colour
  vec3 Hv = normalize(L + vec3(0., 0., 1.));
  float sp = .05 + pol * .16 + wm * .45 + cut * .1, spk = 26. + pol * 50. + wm * 40.;
  float spec = pow(max(dot(N, Hv), 0.), spk) - pow(max(Hv.z, 0.), spk);
  // cavity: the floor of a groove sees less of the room
  float cr = max(1., uU * .5);
  float cav = (Hs(p + vec2(cr, 0.)) + Hs(p - vec2(cr, 0.)) + Hs(p + vec2(0., cr)) + Hs(p - vec2(0., cr))) * .25 - h0;
  float occ = mix(1., .8, smoothstep(0., uU * .6, cav));
  vec3 lit = (amb * occ + Lc * d * .72 * sh) / (amb + Lc * .72);
  vec3 col = alb * lit + Lc * max(spec, 0.) * sp * sh;
  col = pow(max(col, 0.), vec3(1. / 1.9));
  // the lit wax melts into the same photograph beneath over the panel's last few px
  o = vec4(col, 1.) * smoothstep(0., 5., edge);
}`;

/* ---- the factory ---------------------------------------------------------- */
export function ceraTablet(target, opts = {}) {
    // A bare textarea/input: wrap it in a one-leaf tablet.
    let root = target;
    let wrapped = null;
    if (/^(TEXTAREA|INPUT)$/.test(target.tagName)) {
        root = document.createElement('div');
        root.className = 'cera-tablet ct-single';
        const leaf = document.createElement('div');
        leaf.className = 'ct-leaf';
        const wax = document.createElement('div');
        wax.className = 'ct-wax';
        for (const a of ['data-palimpsest', 'data-leaf']) if (target.hasAttribute(a)) leaf.setAttribute(a, target.getAttribute(a));
        target.replaceWith(root);
        root.append(leaf);
        leaf.append(wax);
        wax.append(target);
        wrapped = target;
    }
    root.classList.add('cera-tablet');
    const ds = root.dataset;
    const o = {
        clearLabel: opts.clearLabel ?? ds.clearLabel ?? 'Warm and level',
        fullText: opts.fullText ?? ds.fullText ?? 'This leaf is full.',
        clearControl: opts.clearControl ?? ds.clearControl ?? 'auto',
    };

    const off = [];
    const on = (el, t, f, op) => { el.addEventListener(t, f, op); off.push(() => el.removeEventListener(t, f, op)); };
    let dead = false;
    const made = [];               // nodes we add, removed by destroy()

    const leaves = [...root.querySelectorAll(':scope > .ct-leaf')];
    if (!leaves.length) { const l = document.createElement('div'); l.className = 'ct-leaf'; l.append(...root.childNodes); root.append(l); leaves.push(l); }
    // which photographed leaf each one is: a diptych is left + right; one leaf alone lies landscape
    leaves.forEach((leaf, i) => {
        let v = leaf.dataset.leaf;
        if (!LEAVES[v]) v = leaves.length === 2 ? (i ? 'r' : 'l') : 'one';
        leaf.dataset.leaf = v;
        if (!leaf.querySelector(':scope > .ct-wax')) {
            const w = document.createElement('div');
            w.className = 'ct-wax';
            w.append(...[...leaf.childNodes].filter((n) => !(n.classList && n.classList.contains('ct-label'))));
            leaf.append(w);
        }
    });
    root.classList.toggle('ct-diptych', leaves.length === 2);

    // live region
    const live = document.createElement('span');
    live.className = 'ct-live'; live.setAttribute('aria-live', 'polite');
    root.append(live); made.push(live);
    const say = (t) => { live.textContent = ''; setTimeout(() => { live.textContent = t; }, 30); };

    // canvas + overlay
    const canvas = document.createElement('canvas');
    canvas.className = 'ct-canvas'; canvas.setAttribute('aria-hidden', 'true');
    root.prepend(canvas); made.push(canvas);
    const overlay = document.createElement('div');
    overlay.className = 'ct-overlay'; overlay.setAttribute('aria-hidden', 'true');
    const uid = ++instances;
    overlay.innerHTML = STYLUS_SVG.replace(/ct-(bronze|blur)/g, `ct-$1-${uid}`);
    root.append(overlay); made.push(overlay);
    const stylusShadow = overlay.querySelector('.ct-stylus-shadow');
    const stylusBody = overlay.querySelector('.ct-stylus-body');

    // fields
    const fields = [];
    let bar = null;
    leaves.forEach((leaf, li) => {
        for (const el of leaf.querySelectorAll('textarea, input:not([type]), input[type=text], input[type=search], input[type=email], input[type=url], .ct-inscription')) {
            fields.push({ el, li, kind: el.tagName === 'TEXTAREA' ? 'area' : el.tagName === 'INPUT' ? 'line' : 'text', cut: [], last: '', lastSel: [0, 0], mirror: null });
        }
        // a clear control for every leaf that has something to write in
        if (o.clearControl !== 'none' && fields.some((f) => f.li === li && f.kind !== 'text')) {
            if (!bar) { bar = document.createElement('div'); bar.className = 'ct-bar'; root.append(bar); made.push(bar); root.classList.add('ct-has-bar'); }
            const b = document.createElement('button');
            b.type = 'button'; b.className = 'ct-clear';
            b.innerHTML = `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.5c1.6 2.4 4 4.2 4 7.6a4 4 0 0 1-8 0c0-1.6.8-2.8 1.7-3.8.2 1.4.9 2.2 1.8 2.6-.4-2.4-.2-4.4.5-6.4Z"/></svg><span>${o.clearLabel}</span>`;
            const lab = leaf.dataset.name || (leaves.length > 1 ? (li ? 'right leaf' : 'left leaf') : 'tablet');
            b.setAttribute('aria-label', `${o.clearLabel}: clear the ${lab}`);
            bar.append(b);
            on(b, 'click', () => clearLeaf(li));
        }
    });
    root.querySelectorAll('[data-ct-clear]').forEach((b) => on(b, 'click', () => leaves.forEach((_, i) => clearLeaf(i))));

    root.classList.add('ct-on');

    /* ---- geometry ---- */
    let W = 0, Hh = 0, S = 1.5, GW = 0, GH = 0;
    let Hf, SC, PO, BASE;          // wax height, wood score, polish (0..255), level field
    let geo = [];                  // per leaf: img (the photo's box), wax: CSS px, root-relative
    let fontSize = 22;
    const history = [];            // forceful strokes, kept to re-score the wood after a resize

    // a diptych on a narrow screen is turned a quarter (see the CSS)
    const variant = (leaf) => (leaves.length === 2 && NARROW.matches ? (leaf.dataset.leaf === 'r' ? 'land-r' : 'land') : leaf.dataset.leaf);
    function readGeometry() {
        const rr = root.getBoundingClientRect();
        W = rr.width; Hh = rr.height;
        geo = leaves.map((leaf) => {
            const r = leaf.getBoundingClientRect();
            const img = [r.left - rr.left, r.top - rr.top, r.right - rr.left, r.bottom - rr.top];
            const v = LEAVES[variant(leaf)];
            const w = leaf.querySelector(':scope > .ct-wax').getBoundingClientRect();
            const wax = [w.left - rr.left, w.top - rr.top, w.right - rr.left, w.bottom - rr.top];
            return { img, wax, v, el: leaf, scale: (img[2] - img[0]) / v.w };
        });
        const f = fields.find((x) => x.kind !== 'text') || fields[0];
        if (f) fontSize = parseFloat(getComputedStyle(f.el).fontSize) || 22;
    }

    function allocate() {
        const dpr = Math.min(2, devicePixelRatio || 1);
        S = clamp(dpr, 1.25, 2);
        const cells = W * Hh * S * S;
        if (cells > 2.6e6) S = Math.sqrt(2.6e6 / (W * Hh));
        GW = Math.max(2, Math.ceil(W * S)); GH = Math.max(2, Math.ceil(Hh * S));
        Hf = new Float32Array(GW * GH);
        SC = new Float32Array(GW * GH);
        PO = new Uint8Array(GW * GH);
        BASE = new Float32Array(GW * GH);
        for (const g of geo) {
            const [x0, y0, x1, y1] = g.wax.map((v) => Math.round(v * S));
            for (let y = Math.max(0, y0); y < Math.min(GH, y1); y++) {
                for (let x = Math.max(0, x0); x < Math.min(GW, x1); x++) {
                    const px = x / S, py = y / S;
                    // the leaf was levelled with a warm spatula once, across its width
                    // (the photograph carries the wax's own unevenness; this is only what the lamp needs to find)
                    const b = T + 0.03 * (vnoise(px / 70, py / 70, 3) - 0.5) + 0.012 * (vnoise(px / 16, py / 16, 5) - 0.5)
                        + 0.006 * (vnoise(px / 2.2, py / 2.2, 11) - 0.5);
                    const i = y * GW + x;
                    BASE[i] = b; Hf[i] = b; PO[i] = 0;
                }
            }
        }
        canvas.width = Math.round(W * Math.min(2, devicePixelRatio || 1));
        canvas.height = Math.round(Hh * Math.min(2, devicePixelRatio || 1));
        dirtyAll();
    }

    /* ---- dirty tracking ---- */
    let dirty = null;
    let paintAll = true;          // the next draw covers the whole canvas (else only what changed)
    const dirtyAll = () => { dirty = [0, 0, GW, GH]; paintAll = true; };
    const markDirty = (x0, y0, x1, y1) => {
        x0 = Math.max(0, x0 | 0); y0 = Math.max(0, y0 | 0); x1 = Math.min(GW, Math.ceil(x1)); y1 = Math.min(GH, Math.ceil(y1));
        if (x1 <= x0 || y1 <= y0) return;
        dirty = dirty ? [Math.min(dirty[0], x0), Math.min(dirty[1], y0), Math.max(dirty[2], x1), Math.max(dirty[3], y1)] : [x0, y0, x1, y1];
    };

    /* ---- measuring the fields ---- */
    const MIRROR_PROPS = ['boxSizing', 'width', 'height', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
        'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderStyle', 'fontFamily', 'fontSize',
        'fontWeight', 'fontStyle', 'fontStretch', 'fontKerning', 'fontVariantLigatures', 'letterSpacing', 'wordSpacing',
        'lineHeight', 'textAlign', 'textIndent', 'textTransform', 'tabSize', 'wordBreak', 'overflowWrap', 'direction'];

    function measure(f) {
        const rr = root.getBoundingClientRect();
        const out = [];
        let nodeList;
        let text;
        let scrollX = 0, scrollY = 0, dx = 0, dy = 0;
        if (f.kind === 'text') {
            text = f.el.textContent;
            nodeList = [];
            const tw = document.createTreeWalker(f.el, NodeFilter.SHOW_TEXT);
            while (tw.nextNode()) nodeList.push(tw.currentNode);
        } else {
            text = f.el.value;
            if (!f.mirror) {
                f.mirror = document.createElement('div');
                f.mirror.className = 'ct-mirror';
                f.mirror.setAttribute('aria-hidden', 'true');
                root.append(f.mirror);
            }
            const m = f.mirror, cs = getComputedStyle(f.el);
            for (const k of MIRROR_PROPS) m.style[k] = cs[k];
            m.style.whiteSpace = f.kind === 'area' ? 'pre-wrap' : 'pre';
            if (f.kind === 'area') m.style.overflowWrap = 'break-word';
            const er = f.el.getBoundingClientRect();
            m.style.left = (er.left - rr.left) + 'px';
            m.style.top = (er.top - rr.top) + 'px';
            m.textContent = text + (f.kind === 'area' ? '​' : '');
            nodeList = [m.firstChild];
            scrollX = f.el.scrollLeft; scrollY = f.el.scrollTop;
        }
        const lh = parseFloat(getComputedStyle(f.kind === 'text' ? f.el : f.el).lineHeight) || fontSize * 1.5;
        const size = parseFloat(getComputedStyle(f.el).fontSize) || fontSize;
        const range = document.createRange();
        let gi = 0;
        for (const node of nodeList) {
            if (!node) continue;
            const s = node.nodeValue;
            for (let k = 0; k < s.length; k++, gi++) {
                const ch = s[k];
                if (gi >= text.length) break;
                if (ch === '\n' || ch === '\r') { out.push(null); continue; }
                // keep surrogate pairs together
                let len = 1;
                const c0 = s.charCodeAt(k);
                if (c0 >= 0xd800 && c0 < 0xdc00 && k + 1 < s.length) len = 2;
                range.setStart(node, k); range.setEnd(node, k + len);
                const rects = range.getClientRects();
                const r = rects.length ? rects[rects.length - 1] : null;
                if (!r || (r.width === 0 && ch !== ' ')) { out.push(null); if (len === 2) { out.push(null); k++; gi++; } continue; }
                const x = r.left - rr.left - scrollX + dx;
                const mid = (r.top + r.bottom) / 2 - rr.top - scrollY + dy;
                // baseline: the line box centred on its content area
                const base = mid + ((ASC - DESC) / 2) * size;
                out.push({ ch: s.slice(k, k + len), x, base, w: r.width, top: mid - lh / 2, lh, size });
                if (len === 2) { out.push(null); k++; gi++; }
            }
        }
        return { text, pos: out };
    }

    /* ---- job queue ---- */
    const jobs = [];
    let active = null;
    let raf = 0;
    let visible = true;
    let lastFrame = 0;
    let stylus = { x: 0, y: 0, kind: 'point', shown: false, hideAt: 0, opacity: 0 };

    function kick() { if (!raf && !dead) { lastFrame = performance.now(); raf = requestAnimationFrame(frame); } }

    function frame(now) {
        raf = 0;
        frames++;
        const dt = Math.min(0.05, (now - lastFrame) / 1000);
        lastFrame = now;
        let busy = false;
        const instant = calm.matches || !visible || document.hidden;
        let budget = dt;
        // fast-forward when the queue grows (typing faster than the hand)
        const queueSpeed = 1 + Math.max(0, jobs.length - 2) * 0.6;
        if (jobs.length > 80) { while (active || jobs.length) { if (!active) active = start(jobs.shift()); if (active) { stepJob(active, 1e9, true); active = null; } } }
        while (budget > 0) {
            if (!active) {
                if (!jobs.length) break;
                active = start(jobs.shift());
                if (!active) continue;
            }
            const used = stepJob(active, budget * queueSpeed, instant);
            if (active.done) { active = null; budget -= used / queueSpeed; if (instant) budget = 1; continue; }
            break;
        }
        if (active || jobs.length) busy = true;
        // clear / cool animation
        if (warm.on) { busy = stepWarm(now) || busy; }
        // light easing
        if (sweep.on) {
            const t = (now - sweep.t0) / SWEEP_MS;
            if (t >= 1 || instant) { sweep.on = false; light.az = light.taz = AZ0; light.el = light.tel = EL0; }
            else { const e = Math.sin(Math.PI * t); light.az = light.taz = AZ0 + 1.1 * e * (1 - 0.3 * t); light.el = light.tel = EL0 - 0.18 * e; busy = true; }
        }
        if (lightEase()) busy = true;
        // stylus visibility
        if (stylus.shown && !active && !jobs.length && now > stylus.hideAt) stylus.shown = false;
        const targetOp = stylus.shown && !instant ? 1 : 0;
        stylus.opacity += (targetOp - stylus.opacity) * Math.min(1, dt * (targetOp ? 18 : 6));
        if (Math.abs(stylus.opacity - targetOp) > 0.01) busy = true; else stylus.opacity = targetOp;
        drawStylus();
        if (!active) scratch.set(0, 0, 'point');
        render();
        if (busy || (stylus.shown && !instant)) kick();
    }

    function start(job) {
        if (job.type === 'carve') return startCarve(job);
        if (job.type === 'smooth') return startSmooth(job);
        if (job.type === 'call') { job.fn(); return null; }
        return job;
    }

    // returns the time used (s)
    function stepJob(j, dt, instant) {
        if (j.type === 'carve') return stepCarve(j, dt, instant);
        if (j.type === 'smooth') return stepSmooth(j, dt, instant);
        j.done = true; return 0;
    }

    /* ---- carving ---- */
    function forceToDepth(f) { return D_MIN + (D_MAX - D_MIN) * f; }

    function startCarve(job) {
        const g = job.g;
        const strokes = job.strokes || glyphStrokes(g.ch, g.x, g.base, g.size, job.seed);
        if (!strokes) { if (g.ch.trim()) carveMask(job); job.done = true; return null; }
        const w = g.size * GROOVE;         // groove half width, CSS px (the bronze point is about a millimetre)
        const r = w * 0.9;                 // the burr of pushed-up wax beside it
        const D = forceToDepth(job.force);
        // timeline: air moves and cuts
        const segs = [];
        let px = stylus.shown ? stylus.x : strokes[0][0].x, py = stylus.shown ? stylus.y : strokes[0][0].y;
        let total = 0;
        for (const st of strokes) {
            const a = st[0];
            const air = Math.hypot(a.x - px, a.y - py);
            if (air > 0.01 && air < g.size * 3) { segs.push({ a: { x: px, y: py }, b: a, cut: false, len: air * 0.6, s0: total }); total += air * 0.6; }
            let sl = 0;
            for (let i = 1; i < st.length; i++) sl += Math.hypot(st[i].x - st[i - 1].x, st[i].y - st[i - 1].y);
            let acc = 0;
            for (let i = 1; i < st.length; i++) {
                const p0 = st[i - 1], p1 = st[i];
                const l = Math.hypot(p1.x - p0.x, p1.y - p0.y);
                const t0 = sl ? acc / sl : 0, t1 = sl ? (acc + l) / sl : 1;
                acc += l;
                // the point goes in hard and a little wide where a stroke starts (a
                // blunt, rounded head), and lifts away to a hairline where it ends
                const lift = (t) => 1 - 0.55 * smooth(0.62, 1, t);
                const head = (t) => 1 + 0.32 * (1 - smooth(0, Math.min(0.5, 1.6 * w / Math.max(sl, 1e-3)), t * sl / Math.max(sl, 1e-3)));
                segs.push({ a: p0, b: p1, cut: true, len: l, s0: total, d0: D * lift(t0) * (1 + 0.15 * (head(t0) - 1)), d1: D * lift(t1) * (1 + 0.15 * (head(t1) - 1)),
                    k0: head(t0) * (0.55 + 0.45 * lift(t0)), k1: head(t1) * (0.55 + 0.45 * lift(t1)) });
                total += l;
            }
            if (st.length === 1) { segs.push({ a: st[0], b: { x: st[0].x + 0.01, y: st[0].y }, cut: true, len: 0.3, s0: total, d0: D, d1: D, k0: 1.2, k1: 1.2 }); total += 0.3; }
            px = st[st.length - 1].x; py = st[st.length - 1].y;
        }
        // bbox in cells
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        for (const st of strokes) for (const p of st) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
        const R = w * 1.35 + r + 1;
        const wr = geo[job.li]?.wax || [0, 0, W, Hh];
        const bx0 = Math.max(Math.floor((Math.max(x0 - R, wr[0])) * S), 0), by0 = Math.max(Math.floor((Math.max(y0 - R, wr[1])) * S), 0);
        const bx1 = Math.min(Math.ceil((Math.min(x1 + R, wr[2])) * S), GW), by1 = Math.min(Math.ceil((Math.min(y1 + R, wr[3])) * S), GH);
        const bw = Math.max(0, bx1 - bx0), bh = Math.max(0, by1 - by0);
        const base = new Float32Array(bw * bh), dist = new Float32Array(bw * bh).fill(1e9), dep = new Float32Array(bw * bh), wid = new Float32Array(bw * bh).fill(1);
        for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) base[y * bw + x] = Hf[(y + by0) * GW + x + bx0];
        // dur: a quick hand cuts a letter in ~100ms; the job speed is set by the caller
        const speed = job.speed || 300;
        Object.assign(job, { segs, total, s: 0, si: 0, w, r, D, bx0, by0, bw, bh, base, dist, dep, wid, speed, scored: false });
        if (!job.quiet) { stylus.kind = 'point'; stylus.shown = true; }
        return job;
    }

    function stepCarve(j, dt, instant) {
        const want = instant ? j.total : Math.min(j.total, j.s + j.speed * dt);
        const s0 = j.s;
        while (j.si < j.segs.length && j.segs[j.si].s0 < want) {
            const sg = j.segs[j.si];
            const a = clamp((s0 - sg.s0) / sg.len), b = clamp((want - sg.s0) / sg.len);
            if (b > a) {
                const pa = { x: mix(sg.a.x, sg.b.x, a), y: mix(sg.a.y, sg.b.y, a) }, pb = { x: mix(sg.a.x, sg.b.x, b), y: mix(sg.a.y, sg.b.y, b) };
                if (sg.cut) stamp(j, pa, pb, mix(sg.d0, sg.d1, a), mix(sg.d0, sg.d1, b), mix(sg.k0, sg.k1, a), mix(sg.k0, sg.k1, b));
                stylus.x = pb.x; stylus.y = pb.y;
                if (!instant && !j.quiet) scratch.set(sg.cut ? j.speed : 0, j.force, 'point');
            }
            if (b >= 1) j.si++; else break;
        }
        const used = j.speed ? (want - s0) / j.speed : 0;
        j.s = want;
        if (j.s >= j.total - 1e-6) {
            j.done = true;
            stylus.hideAt = performance.now() + 700;
            if (j.scored && j.record !== false) history.push({ li: j.li, strokes: relStrokes(j), D: j.D, w: j.w, fs: fontSize });
        }
        return used;
    }

    function relStrokes(j) {
        const g = geo[j.li];
        return j.segs.filter((s) => s.cut).map((s) => [s.a.x - g.wax[0], s.a.y - g.wax[1], s.b.x - g.wax[0], s.b.y - g.wax[1], s.d0, s.d1]);
    }

    // cut the segment pa-pb into the local distance field, then rebuild the
    // affected cells from the snapshot: V-groove, burr, wood score.
    // da/db: depth at each end; ka/kb: width factor at each end.
    function stamp(j, pa, pb, da, db, ka = 1, kb = 1) {
        const { w, r, bx0, by0, bw, bh, base, dist, dep, wid } = j;
        const R = w * 1.35 + r;
        const ax = pa.x * S - bx0, ay = pa.y * S - by0, bxx = pb.x * S - bx0, byy = pb.y * S - by0;
        const RS = R * S;
        const cx0 = Math.max(0, Math.floor(Math.min(ax, bxx) - RS - 1)), cy0 = Math.max(0, Math.floor(Math.min(ay, byy) - RS - 1));
        const cx1 = Math.min(bw, Math.ceil(Math.max(ax, bxx) + RS + 1)), cy1 = Math.min(bh, Math.ceil(Math.max(ay, byy) + RS + 1));
        const vx = bxx - ax, vy = byy - ay, vv = vx * vx + vy * vy || 1e-9;
        for (let y = cy0; y < cy1; y++) {
            for (let x = cx0; x < cx1; x++) {
                const qx = x + 0.5 - ax, qy = y + 0.5 - ay;
                const t = clamp((qx * vx + qy * vy) / vv);
                const ex = qx - vx * t, ey = qy - vy * t;
                const kk = mix(ka, kb, t);
                // distance in units of this point's own half width, so a wider head and a hairline tail share one field
                const d = Math.sqrt(ex * ex + ey * ey) / S / kk;
                const k = y * bw + x;
                if (d < dist[k]) { dist[k] = d; dep[k] = mix(da, db, t); wid[k] = kk; }
            }
        }
        const wp = w * 0.7;
        for (let y = cy0; y < cy1; y++) {
            for (let x = cx0; x < cx1; x++) {
                const k = y * bw + x;
                const d = dist[k];
                if (d > w + r) continue;
                const gi = (y + by0) * GW + x + bx0;
                const b0 = base[k];
                const D = dep[k];
                const floor0 = -SC[gi];
                const avail = Math.max(0, b0 - floor0);
                const Dw = Math.min(D, avail);
                let h = b0;
                // a low burr of displaced wax (most of it is carried along and curls away)
                if (d > w * 0.85) {
                    const t = (d - w * 0.85) / (w * 0.15 + r);
                    if (t < 1) h += BURR * Dw * Math.pow(Math.sin(Math.PI * t), 1.6) * (1 - 0.4 * t);
                }
                // the groove: a V with a slightly rounded floor
                if (d < w) {
                    const u = d / w;
                    const cut = D * (1 - u) * (1 - 0.25 * Math.max(0, 0.3 - u));
                    h = Math.min(h, b0 - cut);
                }
                // the point, past the wax, scores the wood
                if (d < wp) {
                    const tip = b0 - D * (1 - (d / wp) * 0.35);
                    if (tip < floor0) {
                        const s = (floor0 - tip) * SCORE_GAIN * (1 - (d / wp) * (d / wp));
                        if (s > SC[gi]) { SC[gi] = s; j.scored = true; }
                    }
                }
                Hf[gi] = Math.max(h, -SC[gi]);
                if (d < w) PO[gi] = Math.max(PO[gi], 50); // the cut walls are fresh and a little glossy
            }
        }
        markDirty(cx0 + bx0, cy0 + by0, cx1 + bx0, cy1 + by0);
    }

    // a letter the hand has no strokes for: pressed in from its shape
    function carveMask(job) {
        const g = job.g;
        const c = document.createElement('canvas');
        const pad = 4, wpx = Math.ceil(g.w + pad * 2), hpx = Math.ceil(g.lh + pad * 2);
        c.width = Math.ceil(wpx * S); c.height = Math.ceil(hpx * S);
        const x = c.getContext('2d', { willReadFrequently: true });
        x.scale(S, S);
        x.font = `${g.size}px ${getComputedStyle(document.body).fontFamily}`;
        x.textBaseline = 'alphabetic';
        x.fillText(g.ch, pad, g.base - g.top + pad);
        const id = x.getImageData(0, 0, c.width, c.height).data;
        const ox = Math.floor((g.x - pad) * S), oy = Math.floor((g.top - pad) * S);
        const D = forceToDepth(job.force) * 0.8;
        for (let y = 0; y < c.height; y++) for (let xx = 0; xx < c.width; xx++) {
            const a = id[(y * c.width + xx) * 4 + 3] / 255;
            if (a < 0.02) continue;
            const gx = ox + xx, gy = oy + y;
            if (gx < 0 || gy < 0 || gx >= GW || gy >= GH) continue;
            const i = gy * GW + gx;
            Hf[i] = Math.max(-SC[i], Hf[i] - D * a);
        }
        markDirty(ox, oy, ox + c.width, oy + c.height);
    }

    /* ---- smoothing with the spatula ---- */
    // segs: [{x0,x1,y0,y1} css], dir -1 (right to left) or 1
    function startSmooth(job) {
        const segs = [];
        for (const s of job.segs) {
            const wr = geo[job.li].wax;
            const x0 = Math.max(Math.floor(Math.max(s.x0, wr[0]) * S), 0), x1 = Math.min(Math.ceil(Math.min(s.x1, wr[2]) * S), GW);
            const y0 = Math.max(Math.floor(Math.max(s.y0, wr[1]) * S), 0), y1 = Math.min(Math.ceil(Math.min(s.y1, wr[3]) * S), GH);
            const bw = x1 - x0, bh = y1 - y0;
            if (bw < 1 || bh < 1) continue;
            const old = new Float32Array(bw * bh);
            for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) old[y * bw + x] = Hf[(y + y0) * GW + x + x0];
            segs.push({ x0, y0, bw, bh, old, fin: levelled(x0, y0, bw, bh, old, job.dir, job.ghost ? GHOST : RESIDUE), p: 0 });
        }
        if (!segs.length) return null;
        Object.assign(job, { list: segs, k: 0 });
        if (!job.quiet) {
            root.dispatchEvent(new CustomEvent('cera-tablet:smooth', { bubbles: true, detail: { chars: job.chars || 0 } }));
            stylus.kind = 'spatula'; stylus.shown = true;
        }
        return job;
    }

    function levelled(x0, y0, bw, bh, old, dir, residue = RESIDUE) {
        // anisotropic box blur: long along the drag, short across it
        const rx = Math.max(2, Math.round(2.6 * S)), ry = Math.max(1, Math.round(0.9 * S));
        let a = Float32Array.from(old), b = new Float32Array(bw * bh);
        for (let pass = 0; pass < 2; pass++) {
            for (let y = 0; y < bh; y++) {
                let acc = 0, n = 0;
                for (let x = -rx; x < bw + rx; x++) {
                    const xi = x + rx; if (xi < bw) { acc += a[y * bw + xi]; n++; }
                    const xo = x - rx - 1; if (xo >= 0) { acc -= a[y * bw + xo]; n--; }
                    if (x >= 0 && x < bw) b[y * bw + x] = acc / n;
                }
            }
            for (let x = 0; x < bw; x++) {
                let acc = 0, n = 0;
                for (let y = -ry; y < bh + ry; y++) {
                    const yi = y + ry; if (yi < bh) { acc += b[yi * bw + x]; n++; }
                    const yo = y - ry - 1; if (yo >= 0) { acc -= b[yo * bw + x]; n--; }
                    if (y >= 0 && y < bh) a[y * bw + x] = acc / n;
                }
            }
        }
        const fin = new Float32Array(bw * bh);
        const seed = (Math.random() * 1e6) | 0;
        const fe = Math.max(1.5, 1.6 * S);
        for (let y = 0; y < bh; y++) {
            // striations along the drag: grit under the blade
            const row = (vnoise(0.5, (y + y0) / (0.9 * S), seed) - 0.5) * 0.05 + (hash2(y + y0, 3, seed) < 0.04 ? -0.05 : 0);
            for (let x = 0; x < bw; x++) {
                const i = (y + y0) * GW + x + x0, k = y * bw + x;
                const lv = BASE[i] - SAG_SMOOTH * SC[i];
                let v = lv + (a[k] - lv) * residue + row * (0.6 + 0.4 * vnoise((x + x0) / (8 * S), y / 3, seed));
                const ef = Math.min(x + 0.5, bw - x - 0.5, y + 0.5, bh - y - 0.5) / fe;
                v = mix(old[k], v, smooth(0, 1, ef));
                fin[k] = Math.max(v, -SC[i]);
            }
        }
        // the blade leaves a slight lip where it stops
        const ex = dir < 0 ? 0 : bw - 1;
        for (let y = 0; y < bh; y++) for (let dx = 0; dx < Math.ceil(1.5 * S); dx++) {
            const x = dir < 0 ? ex + dx : ex - dx;
            if (x < 0 || x >= bw) continue;
            const ef = Math.min(y + 0.5, bh - y - 0.5) / fe;
            fin[y * bw + x] += 0.06 * Math.exp(-dx / S) * smooth(0, 1, ef);
        }
        return fin;
    }

    function stepSmooth(j, dt, instant) {
        let used = 0;
        const speed = (j.speed || 700) * S; // cells per second
        while (j.k < j.list.length) {
            const sg = j.list[j.k];
            const step = instant ? 1e9 : speed * (dt - used);
            const p1 = Math.min(sg.bw + 3 * S, sg.p + step);
            applySweep(j, sg, p1);
            used += instant ? 0 : (p1 - sg.p) / speed;
            sg.p = p1;
            if (!instant && !j.quiet) {
                const cx = j.dir < 0 ? sg.x0 + sg.bw - sg.p : sg.x0 + sg.p;
                stylus.x = clamp(cx, sg.x0, sg.x0 + sg.bw) / S; stylus.y = (sg.y0 + sg.bh * 0.62) / S;
                scratch.set(speed / S, 0.3, 'spatula');
            }
            if (sg.p >= sg.bw + 3 * S) { j.k++; continue; }
            break;
        }
        if (j.k >= j.list.length) { j.done = true; stylus.hideAt = performance.now() + 600; }
        return used;
    }

    function applySweep(j, sg, p) {
        const { x0, y0, bw, bh, old, fin } = sg;
        const front = 2.5 * S;
        for (let x = 0; x < bw; x++) {
            const along = j.dir < 0 ? bw - 1 - x : x;      // distance from the start of the sweep
            const behind = p - along;                       // >0: blade has passed
            let t;
            if (behind >= front) t = 1; else if (behind <= 0) t = 0; else t = behind / front;
            const bulge = behind > -front && behind < front * 0.5 ? 0.12 * Math.exp(-Math.abs(behind) / (0.8 * S)) : 0;
            for (let y = 0; y < bh; y++) {
                const k = y * bw + x, i = (y + y0) * GW + x + x0;
                const ef = Math.min(y + 0.5, bh - y - 0.5) / Math.max(1, 1.5 * S);
                Hf[i] = mix(old[k], fin[k], t) + (t < 1 ? bulge * smooth(0, 1, ef) : 0);
                if (t >= 1) PO[i] = Math.min(255, Math.max(PO[i], 120 * smooth(0, 1, ef)));
            }
        }
        markDirty(x0, y0, x0 + bw, y0 + bh);
    }

    /* ---- warming and levelling a leaf ---- */
    const warm = { on: false, t0: 0, rect: null };
    // keep: a form reset has already put the fields back to their default values; keep and re-cut them
    function clearLeaf(li, keep = false) {
        // flush pending work first: the clear sees the wax as it is
        while (active || jobs.length) { if (!active) active = start(jobs.shift()); if (active) { stepJob(active, 1e9, true); active = null; } }
        let changed = false;
        for (const f of fields) {
            if (f.li !== li || f.kind === 'text') continue;
            if (f.el.value || f.last) changed = true;
            if (!keep) {
                suppress = true;
                f.el.value = '';
                f.el.dispatchEvent(new Event('input', { bubbles: true }));
                suppress = false;
            }
            f.cut = []; f.last = '';
        }
        const g = geo[li];
        const [x0, y0, x1, y1] = g.wax.map((v) => Math.round(v * S));
        if (gl) uploadPrev();
        for (let y = Math.max(0, y0); y < Math.min(GH, y1); y++) for (let x = Math.max(0, x0); x < Math.min(GW, x1); x++) {
            const i = y * GW + x;
            Hf[i] = BASE[i] - SAG_CLEAR * SC[i];
            PO[i] = 150;
        }
        markDirty(x0, y0, x1, y1);
        // re-cut any inscription on this leaf
        for (const f of fields) if (f.li === li && (f.kind === 'text' || keep)) { f.cut = []; syncField(f, { instant: true, quiet: true, force: 0.45 }); }
        while (jobs.length) { const j = start(jobs.shift()); if (j) stepJob(j, 1e9, true); }
        root.dispatchEvent(new CustomEvent('cera-tablet:clear', { bubbles: true, detail: { leaf: li } }));
        say(changed ? 'The wax is warmed and levelled; the leaf is clear.' : 'The wax is levelled.');
        if (calm.matches || !gl) { warm.on = false; render(); return; }   // the 2D fallback has no melt to show
        warm.on = true; warm.t0 = performance.now();
        root.classList.add('ct-warming');   // placeholders wait until the wax has cooled
        warm.rect = [x0 / GW, y0 / GH, x1 / GW, y1 / GH];
        kick();
    }
    function stepWarm(now) {
        const t = now - warm.t0;
        if (t > MELT_MS + COOL_MS) { warm.on = false; paintAll = true; root.classList.remove('ct-warming'); return false; }
        return true;
    }

    /* ---- sending: the note is set; the next writing smooths it away ---- */
    const sealed = new Set();
    const sweep = { on: false, t0: 0 };
    function flush() { while (active || jobs.length) { if (!active) active = start(jobs.shift()); if (active) { stepJob(active, 1e9, true); active = null; } } }
    // The note stays exactly as written. The stylus is lifted, the cut walls
    // take a little gloss as the wax sets, and the tablet is tipped to the lamp
    // once, so the letters catch the light in turn.
    function seal() {
        flush();
        let any = false;
        leaves.forEach((_, li) => {
            if (!fields.some((f) => f.li === li && f.kind !== 'text' && f.el.value)) return;
            sealed.add(li); any = true;
            const [x0, y0, x1, y1] = geo[li].wax.map((v) => Math.round(v * S));
            for (let y = Math.max(0, y0); y < Math.min(GH, y1); y++) for (let x = Math.max(0, x0); x < Math.min(GW, x1); x++) {
                const i = y * GW + x;
                if (BASE[i] - Hf[i] > 0.15) PO[i] = Math.max(PO[i], 150);
            }
            markDirty(x0, y0, x1, y1);
        });
        if (!any) return false;
        if (root.contains(document.activeElement)) document.activeElement.blur();
        stylus.shown = false;
        root.classList.add('ct-sent');
        root.dispatchEvent(new CustomEvent('cera-tablet:sealed', { bubbles: true }));
        say('Sent. The note is set in the wax.');
        if (!calm.matches) { sweep.on = true; sweep.t0 = performance.now(); }
        paintAll = true; kick();
        return true;
    }
    // Writing again on a sent leaf: the flat end of the stylus passes over the
    // old note once, line by line, and leaves it as a faint palimpsest.
    function wipe(li) {
        if (!sealed.delete(li)) return;
        root.classList.remove('ct-sent');
        flush();
        const boxes = [];
        for (const f of fields) {
            if (f.li !== li || f.kind === 'text') continue;
            for (const g of f.cut) {
                if (!g || !g.ch.trim()) continue;
                const u = g.size / EM;
                boxes.push({ key: Math.round(g.top * 2), x0: g.x - u * 0.25, x1: g.x + g.w + u * 1.6, y0: g.top, y1: g.top + g.lh });
            }
            suppress = true;
            f.el.value = '';
            f.el.dispatchEvent(new Event('input', { bubbles: true }));
            suppress = false;
            f.cut = []; f.last = '';
        }
        const lines = new Map();
        for (const b of boxes) { if (!lines.has(b.key)) lines.set(b.key, []); lines.get(b.key).push(b); }
        const segs = [];
        for (const k of [...lines.keys()].sort((a, b) => a - b)) {
            for (const b of lines.get(k).sort((a, b) => a.x0 - b.x0)) {
                const m = segs[segs.length - 1];
                if (m && m.key === k && b.x0 <= m.x1 + 2) m.x1 = Math.max(m.x1, b.x1); else segs.push({ ...b });
            }
        }
        if (!segs.length) return;
        // one steady pass: the blade's speed is set so the whole note takes WIPE_MS
        const travel = segs.reduce((a, sg) => a + (sg.x1 - sg.x0) + 3, 0);
        jobs.push({ type: 'smooth', li, segs, dir: 1, ghost: true, chars: 0, speed: travel / (WIPE_MS / 1000) });
        root.classList.add('ct-warming');   // the placeholder waits for the blade to pass
        jobs.push({ type: 'call', fn: () => { if (!warm.on) root.classList.remove('ct-warming'); } });
        say('The old note is smoothed away.');
        kick();
    }

    /* ---- reading an edit ---- */
    let suppress = false;
    let lastInsertT = 0;
    let pen = { p: 0, t: 0 };

    function forceNow() {
        const now = performance.now();
        if (now - pen.t < 2000) return clamp(pen.p * 1.15);
        const iv = lastInsertT ? now - lastInsertT : 400;
        lastInsertT = now;
        // a quick hand presses harder: ~260ms between letters is gentle, ~90ms is hammering
        return 0.12 + 0.88 * clamp((260 - Math.min(iv, 1500)) / 170);
    }

    function seedFor(f, i, ch) { return (fields.indexOf(f) * 7919 + i * 104729 + ch.charCodeAt(0) * 31) >>> 0; }

    function syncField(f, { instant = false, quiet = false, inputType = '', force: forced } = {}) {
        const { text, pos } = measure(f);
        const oldT = f.last, oldCut = f.cut;
        // common prefix / suffix
        let pre = 0;
        const maxPre = Math.min(oldT.length, text.length);
        while (pre < maxPre && oldT[pre] === text[pre]) pre++;
        let suf = 0;
        while (suf < Math.min(oldT.length, text.length) - pre && oldT[oldT.length - 1 - suf] === text[text.length - 1 - suf]) suf++;
        const delta = text.length - oldT.length;
        const same = (a, b) => a && b && Math.abs(a.x - b.x) < 0.6 && Math.abs(a.base - b.base) < 0.6 && Math.abs(a.size - b.size) < 0.1;
        const newCut = new Array(text.length).fill(null);
        const toSmooth = [];      // old glyph records
        const toCarve = [];       // [index, force, moved]
        const deletedCount = oldT.length - pre - suf;
        for (let i = 0; i < oldT.length; i++) {
            const g = oldCut[i];
            let ni = -1;
            if (i < pre) ni = i; else if (i >= oldT.length - suf) ni = i + delta;
            if (ni < 0) { if (g) toSmooth.push({ g, del: true }); continue; }
            const p = pos[ni];
            if (g && same(g, p)) newCut[ni] = g;
            else { if (g) toSmooth.push({ g, del: false }); if (p) toCarve.push([ni, g ? g.force : 0.45, true]); }
        }
        const ins = [];
        for (let i = pre; i < text.length - suf; i++) if (pos[i]) ins.push(i);
        const f0 = forced ?? (ins.length > 3 ? 0.42 : null);
        for (const i of ins) toCarve.push([i, f0 ?? forceNow(), false]);
        f.last = text;

        // smoothing jobs: per line, adjacent boxes merged
        if (toSmooth.length) {
            const dir = inputType === 'deleteContentForward' || inputType === 'deleteWordForward' ? 1 : -1;
            const lines = new Map();
            for (const { g } of toSmooth) {
                const key = Math.round(g.top * 2);
                const u = g.size / EM;
                const box = { x0: g.x - u * 0.25, x1: g.x + g.w + u * 1.6, y0: g.top, y1: g.top + g.lh };
                if (!lines.has(key)) lines.set(key, []);
                lines.get(key).push(box);
            }
            const order = [...lines.keys()].sort((a, b) => (dir < 0 ? b - a : a - b));
            for (const k of order) {
                const boxes = lines.get(k).sort((a, b) => a.x0 - b.x0);
                const merged = [];
                for (const b of boxes) {
                    const m = merged[merged.length - 1];
                    if (m && b.x0 <= m.x1 + 2) m.x1 = Math.max(m.x1, b.x1); else merged.push({ ...b });
                }
                if (dir < 0) merged.reverse();
                const delChars = toSmooth.filter((t) => t.del).length;
                jobs.push({ type: 'smooth', li: f.li, segs: merged, dir, quiet: quiet || !deletedCount, speed: deletedCount ? 520 : 1400, chars: delChars });
            }
        }
        // carving jobs
        toCarve.sort((a, b) => a[0] - b[0]);
        for (const [i, force, moved] of toCarve) {
            const p = pos[i];
            if (!p.ch.trim()) { newCut[i] = { ...p, force }; continue; }
            const g = { ...p, force };
            newCut[i] = g;
            const u = p.size / EM;
            const iv = moved ? 60 : clamp(performance.now() - (lastInsertT || 0), 60, 240);
            // a letter's strokes run ~22 units; cut in about 0.8 of the gap between keys
            const speed = moved ? 2600 : (22 * u) / (Math.max(70, Math.min(200, iv * 0.8)) / 1000);
            jobs.push({ type: 'carve', li: f.li, g, force, seed: seedFor(f, i, p.ch), speed, quiet: quiet || moved });
        }
        f.cut = newCut;
        if (instant) {
            while (jobs.length) { const j = start(jobs.shift()); if (j) stepJob(j, 1e9, true); }
            render();
        } else kick();
    }

    // Palimpsest: an older text cut hard into this leaf and levelled away
    function underwrite(li, text) {
        const leaf = leaves[li];
        const tmp = document.createElement('p');
        tmp.className = 'ct-inscription ct-ghost';
        tmp.setAttribute('aria-hidden', 'true');
        tmp.textContent = text;
        leaf.querySelector(':scope > .ct-wax').append(tmp);
        const f = { el: tmp, li, kind: 'text', cut: [], last: '' };
        const { pos } = measure(f);
        tmp.remove();
        for (let i = 0; i < pos.length; i++) {
            const p = pos[i];
            if (!p || !p.ch.trim()) continue;
            const j = startCarve({ type: 'carve', li, g: { ...p, force: 1 }, force: 1, seed: 999 + i * 13, speed: 1, quiet: true });
            if (j) stepJob(j, 1e9, true);
        }
        const g = geo[li];
        const [x0, y0, x1, y1] = g.wax.map((v) => Math.round(v * S));
        for (let y = Math.max(0, y0); y < Math.min(GH, y1); y++) for (let x = Math.max(0, x0); x < Math.min(GW, x1); x++) {
            const i = y * GW + x;
            Hf[i] = BASE[i] - SAG_CLEAR * SC[i];
        }
        history.length = 0; // these are replayed from the attribute, not the history
    }

    function rescore() {
        for (const hst of history) {
            const g = geo[hst.li];
            if (!g) continue;
            const k = fontSize / hst.fs;    // the hand scales with the leaf, so do its old scores
            for (const [ax, ay, bx, by, d0, d1] of hst.strokes) {
                const pa = { x: ax * k + g.wax[0], y: ay * k + g.wax[1] }, pb = { x: bx * k + g.wax[0], y: by * k + g.wax[1] };
                scoreOnly(pa, pb, Math.max(d0, d1), hst.w * k, g.wax);
            }
        }
    }
    function scoreOnly(pa, pb, D, w, wr) {
        const wp = w * 0.7, ex = D - T;
        if (ex <= 0) return;
        const x0 = Math.max(Math.floor((Math.min(pa.x, pb.x) - wp) * S), Math.floor(wr[0] * S)), x1 = Math.min(Math.ceil((Math.max(pa.x, pb.x) + wp) * S), Math.ceil(wr[2] * S));
        const y0 = Math.max(Math.floor((Math.min(pa.y, pb.y) - wp) * S), Math.floor(wr[1] * S)), y1 = Math.min(Math.ceil((Math.max(pa.y, pb.y) + wp) * S), Math.ceil(wr[3] * S));
        const vx = pb.x - pa.x, vy = pb.y - pa.y, vv = vx * vx + vy * vy || 1e-9;
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
            const qx = (x + 0.5) / S - pa.x, qy = (y + 0.5) / S - pa.y;
            const t = clamp((qx * vx + qy * vy) / vv);
            const d = Math.hypot(qx - vx * t, qy - vy * t);
            if (d >= wp) continue;
            const s = ex * SCORE_GAIN * (1 - (d / wp) * 0.35) * (1 - (d / wp) * (d / wp));
            const i = y * GW + x;
            if (s > SC[i]) SC[i] = s;
        }
    }

    /* ---- input wiring ---- */
    // the leaf is full: a small knock, an event and an announcement
    function knock() {
        root.classList.remove('ct-full'); void root.offsetWidth; root.classList.add('ct-full');
        root.dispatchEvent(new CustomEvent('cera-tablet:full', { bubbles: true }));
        say(o.fullText);
    }
    // would this value make the field scroll? Tested on an unseen copy of the field
    function fits(f, value) {
        let pr = f.probe;
        if (!pr) {
            pr = f.probe = document.createElement(f.el.tagName);
            if (f.kind === 'line') pr.type = 'text';
            pr.className = f.el.className;
            pr.setAttribute('aria-hidden', 'true'); pr.tabIndex = -1;
            pr.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;pointer-events:none;';
            f.el.parentNode.append(pr);
        }
        pr.style.width = f.el.offsetWidth + 'px'; pr.style.height = f.el.offsetHeight + 'px';
        pr.value = value;
        return f.kind === 'area' ? pr.scrollHeight <= pr.clientHeight + 2 : pr.scrollWidth <= pr.clientWidth + 2;
    }

    for (const f of fields) {
        if (f.kind === 'text') continue;
        const el = f.el;
        const spell = el.getAttribute('spellcheck');
        if (spell == null) { el.setAttribute('spellcheck', 'false'); off.push(() => el.removeAttribute('spellcheck')); }
        on(el, 'input', (e) => {
            if (suppress || e.isComposing) return;
            scratch.wake();
            // a tablet has only so much wax
            const over = f.kind === 'area' ? el.scrollHeight > el.clientHeight + 2 : el.scrollWidth > el.clientWidth + 2;
            if (over && el.value.length > f.last.length) {
                const v = el.value;
                el.value = f.last;
                el.setSelectionRange(f.lastSel[0], f.lastSel[1]);
                if (v.length - f.last.length > 1) {
                    // a paste: keep as much as fits
                    let lo = 0, hi = v.length - f.last.length;
                    const s = f.lastSel[0], tail = f.last.slice(f.lastSel[1]);
                    while (lo < hi) {
                        const mid = (lo + hi + 1) >> 1;
                        el.value = f.last.slice(0, s) + v.slice(s, s + mid) + tail;
                        const ov = f.kind === 'area' ? el.scrollHeight > el.clientHeight + 2 : el.scrollWidth > el.clientWidth + 2;
                        if (ov) hi = mid - 1; else lo = mid;
                    }
                    el.value = f.last.slice(0, s) + v.slice(s, s + lo) + tail;
                    el.setSelectionRange(s + lo, s + lo);
                }
                el.scrollTop = 0; el.scrollLeft = 0;
                knock();
                if (el.value === f.last) return;
            }
            syncField(f, { inputType: e.inputType });
        });
        on(el, 'compositionend', () => syncField(f));
        on(el, 'focus', () => wipe(f.li));
        const remember = () => { f.lastSel = [el.selectionStart ?? 0, el.selectionEnd ?? 0]; };
        on(el, 'keydown', (e) => { remember(); if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete') scratch.wake(); });
        // Fit an insertion before it happens, so the browser's own undo stack is kept
        // (setting .value afterwards would wipe it): a paste or drop is trimmed to what
        // fits and inserted with execCommand, which is undoable. Composition (IME) cannot
        // be cancelled; the input handler above catches it.
        on(el, 'beforeinput', (e) => {
            remember();
            const t = e.inputType || '';
            if (!e.cancelable || e.isComposing || !t.startsWith('insert') || t === 'insertCompositionText') return;
            let data = t === 'insertParagraph' || t === 'insertLineBreak' ? '\n' : (e.data ?? e.dataTransfer?.getData('text/plain'));
            if (data == null) return;
            if (f.kind === 'line') data = data.replace(/[\r\n]+/g, '');
            const v = el.value, s = el.selectionStart ?? v.length, en = el.selectionEnd ?? s;
            if (fits(f, v.slice(0, s) + data + v.slice(en))) return;
            e.preventDefault();
            const cps = [...data];
            let lo = 0, hi = cps.length - 1;
            while (lo < hi) {
                const mid = (lo + hi + 1) >> 1;
                if (fits(f, v.slice(0, s) + cps.slice(0, mid).join('') + v.slice(en))) lo = mid; else hi = mid - 1;
            }
            if (lo > 0) {
                const part = cps.slice(0, lo).join('');
                el.focus();
                if (!document.execCommand('insertText', false, part)) { el.setRangeText(part, s, en, 'end'); el.dispatchEvent(new Event('input', { bubbles: true })); }
            }
            knock();
        });
        on(el, 'scroll', () => { if (el.scrollTop || el.scrollLeft) { el.scrollTop = 0; el.scrollLeft = 0; } });
        const penRead = (e) => { if (e.pointerType === 'pen' && e.pressure > 0) pen = { p: e.pressure, t: performance.now() }; };
        on(el, 'pointerdown', penRead); on(el, 'pointermove', penRead);
    }
    const form = root.closest('form');
    if (form) on(form, 'reset', () => setTimeout(() => leaves.forEach((_, i) => { if (fields.some((f) => f.li === i && f.kind !== 'text' && (f.last || f.el.value))) clearLeaf(i, true); }), 0));

    /* ---- light ---- */
    // the museum's light falls from above and a little to the left; so does the lamp
    const AZ0 = -2.1, EL0 = 0.46;
    const light = { az: AZ0, el: EL0, taz: AZ0, tel: EL0 };
    function lightVec() { const c = Math.cos(light.el); return [Math.cos(light.az) * c, Math.sin(light.az) * c, Math.sin(light.el)]; }
    function lightEase() {
        const k = calm.matches ? 1 : 0.18;
        light.az += (light.taz - light.az) * k; light.el += (light.tel - light.el) * k;
        return Math.abs(light.taz - light.az) > 0.002 || Math.abs(light.tel - light.el) > 0.002;
    }
    const tiltRead = () => {
        if (!tilt.active) return;
        light.taz = AZ0 + tilt.x * 1.1;
        light.tel = clamp(EL0 - tilt.y * 0.22, 0.16, 0.7);
        if (Math.abs(light.taz - light.az) > 0.004 || Math.abs(light.tel - light.el) > 0.004) kick();
    };
    on(window, 'deviceorientation', () => setTimeout(tiltRead, 0), { passive: true });
    // with a mouse, the lamp leans a little toward where you point
    on(root, 'pointermove', (e) => {
        if (e.pointerType !== 'mouse' || tilt.active) return;
        const r = root.getBoundingClientRect();
        const nx = clamp((e.clientX - r.left) / r.width * 2 - 1, -1, 1), ny = clamp((e.clientY - r.top) / r.height * 2 - 1, -1, 1);
        light.taz = AZ0 + nx * 0.35; light.tel = EL0 - ny * 0.06;
        kick();
    });
    on(root, 'pointerleave', () => { if (!tilt.active) { light.taz = AZ0; light.tel = EL0; kick(); } });

    /* ---- rendering ---- */
    let gl = null, prog = null, tex = {}, loc = {}, photosLeft = 0;
    function initGL() {
        try {
            gl = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: false, preserveDrawingBuffer: true });
        } catch { gl = null; }
        if (!gl) return false;
        const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
        try {
            prog = gl.createProgram();
            gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
            gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
            gl.linkProgram(prog);
            if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
        } catch (err) { console.warn('cera-tablet: WebGL2 shader failed, using 2D', err); gl = null; return false; }
        gl.useProgram(prog);
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        const aP = gl.getAttribLocation(prog, 'aP');
        gl.enableVertexAttribArray(aP);
        gl.vertexAttribPointer(aP, 2, gl.FLOAT, false, 0, 0);
        for (const n of ['uSize', 'uS', 'uGrid', 'tH', 'tS', 'tP', 'tPrev', 'tL0', 'tL1', 'uImg', 'uWax', 'uSeed', 'uN', 'uL', 'uU', 'uWarm', 'uFade', 'uFadeRect']) loc[n] = gl.getUniformLocation(prog, n);
        gl.uniform1i(loc.tL0, 4); gl.uniform1i(loc.tL1, 5);
        loadPhotos();
        return true;
    }
    // the photographed leaves, as albedo (reloaded if a resize changes which photo a leaf uses)
    const photoTex = [], photoOf = [];
    function loadPhotos() {
        leaves.forEach((leaf, i) => {
            const v = variant(leaf);
            if (photoOf[i] === v) return;
            photoOf[i] = v;
            photosLeft++;
            if (!photoTex[i]) {
                photoTex[i] = gl.createTexture();
                gl.activeTexture(gl.TEXTURE4 + i);
                gl.bindTexture(gl.TEXTURE_2D, photoTex[i]);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
            }
            const im = new Image();
            im.decoding = 'async';
            im.onload = () => {
                if (dead) return;
                if (photoOf[i] !== v) { photosLeft = Math.max(0, photosLeft - 1); return; }
                gl.activeTexture(gl.TEXTURE4 + i);
                gl.bindTexture(gl.TEXTURE_2D, photoTex[i]);
                gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
                gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
                gl.generateMipmap(gl.TEXTURE_2D);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                photosLeft = Math.max(0, photosLeft - 1);
                if (!photosLeft) { root.classList.add('ct-gl'); paintAll = true; render(); }
            };
            im.src = ASSET(LEAVES[v].img);
        });
    }
    function makeTextures() {
        for (const t of Object.values(tex)) gl.deleteTexture(t);
        const mk = (unit, ifmt, fmt, type) => {
            const t = gl.createTexture();
            gl.activeTexture(gl.TEXTURE0 + unit);
            gl.bindTexture(gl.TEXTURE_2D, t);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texStorage2D(gl.TEXTURE_2D, 1, ifmt, GW, GH);
            return t;
        };
        tex.H = mk(0, gl.R16F); tex.S = mk(1, gl.R16F); tex.P = mk(2, gl.R8); tex.Prev = mk(3, gl.R16F);
        gl.uniform1i(loc.tH, 0); gl.uniform1i(loc.tS, 1); gl.uniform1i(loc.tP, 2); gl.uniform1i(loc.tPrev, 3);
    }
    function upload(t, unit, data, fmt, type, r) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.pixelStorei(gl.UNPACK_ROW_LENGTH, GW);
        gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, r[0]);
        gl.pixelStorei(gl.UNPACK_SKIP_ROWS, r[1]);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, r[0], r[1], r[2] - r[0], r[3] - r[1], fmt, type, data);
        gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
        gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
        gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
    }
    function uploadPrev() { upload(tex.Prev, 3, Hf, gl.RED, gl.FLOAT, [0, 0, GW, GH]); }

    let ctx2d = null, img2d = null;
    let renderPending = false;
    function render() {
        if (!visible) { renderPending = true; return; }
        renderPending = false;
        if (gl) renderGL(); else render2D();
    }
    let lastLight = '';
    function renderGL() {
        if (photosLeft) return;
        // only redraw what changed: the touched cells, widened by how far a
        // ridge's shadow can reach. The lamp moving or the wax melting redraws all.
        const lk = lightVec().map((v) => v.toFixed(4)).join();
        if (lk !== lastLight || warm.on) paintAll = true;
        lastLight = lk;
        let sc = null;
        if (!paintAll && dirty) {
            const pad = 18, k = canvas.width / W;
            const x0 = Math.max(0, Math.floor((dirty[0] / S - pad) * k)), x1 = Math.min(canvas.width, Math.ceil((dirty[2] / S + pad) * k));
            const y0 = Math.max(0, Math.floor((dirty[1] / S - pad) * k)), y1 = Math.min(canvas.height, Math.ceil((dirty[3] / S + pad) * k));
            sc = [x0, canvas.height - y1, x1 - x0, y1 - y0];
        } else if (!paintAll && !dirty) return;
        paintAll = false;
        if (sc) { gl.enable(gl.SCISSOR_TEST); gl.scissor(sc[0], sc[1], sc[2], sc[3]); } else gl.disable(gl.SCISSOR_TEST);
        if (dirty) {
            upload(tex.H, 0, Hf, gl.RED, gl.FLOAT, dirty);
            upload(tex.S, 1, SC, gl.RED, gl.FLOAT, dirty);
            upload(tex.P, 2, PO, gl.RED, gl.UNSIGNED_BYTE, dirty);
            dirty = null;
        }
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.uniform2f(loc.uSize, W, Hh);
        gl.uniform1f(loc.uS, S);
        gl.uniform2f(loc.uGrid, GW, GH);
        const img = new Float32Array(8), wax = new Float32Array(8), seed = new Float32Array(2);
        geo.forEach((g, i) => { img.set(g.img, i * 4); wax.set(g.wax, i * 4); seed[i] = 1.7 + i * 2.3; });
        gl.uniform4fv(loc.uImg, img); gl.uniform4fv(loc.uWax, wax); gl.uniform1fv(loc.uSeed, seed);
        gl.uniform1i(loc.uN, geo.length);
        gl.uniform3fv(loc.uL, lightVec());
        gl.uniform1f(loc.uU, fontSize * RELIEF);
        let fade = 1, wv = 0;
        if (warm.on) {
            const t = performance.now() - warm.t0;
            fade = clamp(t / MELT_MS);
            wv = t < MELT_MS ? smooth(0, 0.35, fade) : 1 - smooth(0, 1, (t - MELT_MS) / COOL_MS);
            gl.uniform4fv(loc.uFadeRect, warm.rect);
        }
        gl.uniform1f(loc.uFade, fade);
        gl.uniform1f(loc.uWarm, wv);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    function render2D() {
        if (!ctx2d) {
            ctx2d = canvas.getContext('2d');
            canvas.width = GW; canvas.height = GH;
            img2d = ctx2d.createImageData(GW, GH);
            dirtyAll();
        }
        if (!dirty) return;
        const [x0, y0, x1, y1] = dirty;
        dirty = null;
        const d = img2d.data;
        const [lx, ly, lz] = lightVec();
        const U = fontSize * RELIEF * S;
        const cr = Math.max(1, Math.round(Math.max(1.2, fontSize * RELIEF * 0.55) * S));
        for (const g of geo) {
            const wx0 = Math.max(x0, Math.round(g.wax[0] * S)), wy0 = Math.max(y0, Math.round(g.wax[1] * S));
            const wx1 = Math.min(x1, Math.round(g.wax[2] * S)), wy1 = Math.min(y1, Math.round(g.wax[3] * S));
            for (let y = wy0; y < wy1; y++) for (let x = wx0; x < wx1; x++) {
                const i = y * GW + x;
                const hx = (Hf[Math.min(i + 1, Hf.length - 1)] - Hf[Math.max(i - 1, 0)]) * U / 2;
                const hy = (Hf[Math.min(i + GW, Hf.length - 1)] - Hf[Math.max(i - GW, 0)]) * U / 2;
                const n = 1 / Math.hypot(hx, hy, 1);
                const dd = Math.min(2.6, Math.max(0, (-hx * lx - hy * ly + lz) * n) / lz);
                const thick = Hf[i] + SC[i];
                const show = 1 - smooth(0, 0.14, thick);
                // no shadow march here, but the same cavity term as the shader: a groove's floor sees little of the room
                const cav = (Hf[Math.min(i + cr, Hf.length - 1)] + Hf[Math.max(i - cr, 0)] + Hf[Math.min(i + cr * GW, Hf.length - 1)] + Hf[Math.max(i - cr * GW, 0)]) * 0.25 - Hf[i];
                const occ = mix(1, 0.3, smooth(0, 0.5, cav));
                // the photographed wax shows through: only the change in light is drawn over it
                const lit = (0.3 * occ + 0.72 * dd) / 1.02, hi = 0.24 * Math.max(0, dd - 1);
                const p = i * 4;
                let r, g, bl, al;
                if (hi > 0.01) { r = 236; g = 222; bl = 188; al = Math.min(0.85, hi * 2.4); }
                else { r = g = bl = 0; al = clamp(1 - lit) * 0.92; }
                if (show > 0) { const v = 0.3 + 0.72 * dd; r = mix(r, 150 * v, show); g = mix(g, 100 * v, show); bl = mix(bl, 60 * v, show); al = mix(al, 1, show); }
                d[p] = r; d[p + 1] = g; d[p + 2] = bl; d[p + 3] = al * 255;   // ImageData is not premultiplied
            }
        }
        ctx2d.putImageData(img2d, 0, 0, x0, y0, x1 - x0, y1 - y0);
    }

    /* ---- the stylus, drawn over the canvas while it works ---- */
    function drawStylus() {
        overlay.style.opacity = stylus.opacity.toFixed(3);
        if (stylus.opacity <= 0.001) return;
        const L = clamp((geo[0] ? (geo[0].wax[2] - geo[0].wax[0]) : 300) * 0.55, 130, 230);
        const ang = 58 * Math.PI / 180;           // the shaft runs back toward the writer's hand
        const sc = L / 100;
        const spat = stylus.kind === 'spatula';
        const tr = `translate(${stylus.x.toFixed(2)}px, ${stylus.y.toFixed(2)}px) rotate(${ang}rad) scale(${sc})` + (spat ? ' translate(100px,0) scale(-1,1)' : '');
        stylusBody.style.transform = tr;
        // its shadow: the shaft rises off the wax, so the shadow leaves the tip and falls away from the light
        const [lx, ly, lz] = lightVec();
        const k = Math.min(0.55, 0.22 / Math.max(0.1, lz / Math.hypot(lx, ly)));
        const ox = -lx / Math.hypot(lx, ly), oy = -ly / Math.hypot(lx, ly);
        // shear: displacement grows along the shaft
        const ca = Math.cos(ang), sa = Math.sin(ang);
        const m = (s) => s * k;
        // matrix that maps (u along shaft, v across) to screen, plus height-driven offset along (ox,oy)
        const a = ca * sc + ox * m(sc), b = sa * sc + oy * m(sc), c = -sa * sc, d = ca * sc;
        stylusShadow.style.transform = spat
            ? `translate(${stylus.x}px, ${stylus.y}px) matrix(${a},${b},${c},${d},0,0) translate(100px,0) scale(-1,1)`
            : `translate(${stylus.x}px, ${stylus.y}px) matrix(${a},${b},${c},${d},0,0)`;
    }

    /* ---- lifecycle ---- */
    let built = false;
    async function build() {
        await loadGlyphs();
        try { await document.fonts.load(`${fontSize}px "Cera Metrics"`); } catch {}
        if (dead) return;
        readGeometry();
        allocate();
        if (!gl && !ctx2d && !initGL()) root.classList.add('ct-2d');
        if (gl) makeTextures();
        leaves.forEach((leaf, li) => { const p = leaf.dataset.palimpsest; if (p) underwrite(li, p); });
        rescore();
        for (const f of fields) { f.cut = []; f.last = ''; syncField(f, { instant: true, quiet: true, force: f.kind === 'text' ? 0.5 : 0.45 }); }
        dirtyAll();
        built = true;
        render();
    }
    let rT = 0, lastW = 0, lastH = 0;
    const ro = new ResizeObserver(() => {
        const r = root.getBoundingClientRect();
        if (Math.abs(r.width - lastW) < 0.5 && Math.abs(r.height - lastH) < 0.5) return;
        lastW = r.width; lastH = r.height;
        clearTimeout(rT);
        rT = setTimeout(() => { if (built) rebuild(); }, 120);
    });
    ro.observe(root);
    off.push(() => ro.disconnect());
    function rebuild() {
        while (active || jobs.length) { if (!active) active = start(jobs.shift()); if (active) { stepJob(active, 1e9, true); active = null; } }
        readGeometry();
        allocate();
        if (gl) { makeTextures(); loadPhotos(); }
        if (ctx2d) { ctx2d = null; }
        leaves.forEach((leaf, li) => { const p = leaf.dataset.palimpsest; if (p) underwrite(li, p); });
        rescore();
        for (const g of geo) { const [x0, y0, x1, y1] = g.wax.map((v) => Math.round(v * S)); for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = y * GW + x; Hf[i] = BASE[i] - SAG_CLEAR * SC[i]; } }
        for (const f of fields) { f.cut = []; f.last = ''; syncField(f, { instant: true, quiet: true, force: 0.45 }); }
        dirtyAll();
        render();
    }
    const io = new IntersectionObserver((es) => {
        visible = es[es.length - 1].isIntersecting;
        if (visible && renderPending) render();
    });
    io.observe(root);
    off.push(() => io.disconnect());
    on(document, 'visibilitychange', () => { if (!document.hidden && renderPending) render(); });
    if (gl === null && typeof canvas.getContext !== 'function') root.classList.remove('ct-on');

    build();

    const destroy = () => {
        dead = true;
        cancelAnimationFrame(raf);
        off.forEach((f) => f());
        made.forEach((n) => n.remove());
        fields.forEach((f) => { f.mirror?.remove(); f.probe?.remove(); });
        root.classList.remove('ct-on', 'ct-gl', 'ct-2d', 'ct-diptych', 'ct-has-bar', 'ct-full', 'ct-warming', 'ct-sent');
        clearTimeout(rT);
        if (wrapped) { root.replaceWith(wrapped); }
    };
    destroy.clear = (li) => (li == null ? leaves.forEach((_, i) => clearLeaf(i)) : clearLeaf(li));
    destroy.sync = () => fields.forEach((f) => f.kind !== 'text' && syncField(f));
    destroy.seal = () => seal();
    destroy.fields = fields.map((f) => f.el);
    Object.defineProperty(destroy, 'busy', { get: () => !!(raf || active || jobs.length) });
    Object.defineProperty(destroy, 'frames', { get: () => frames });
    return destroy;
}

let frames = 0;
let instances = 0;
export const frameCount = () => frames;

const STYLUS_SVG = `
<svg class="ct-stylus" width="100%" height="100%" aria-hidden="true">
  <defs>
    <linearGradient id="ct-bronze" x1="0" y1="-3" x2="0" y2="3" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#e7cf96"/><stop offset=".22" stop-color="#b48a4c"/>
      <stop offset=".6" stop-color="#6e4f27"/><stop offset="1" stop-color="#2c1e0e"/>
    </linearGradient>
    <filter id="ct-blur" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="1.6"/></filter>
  </defs>
  <g class="ct-stylus-shadow" filter="url(#ct-blur)" opacity=".45">
    <path d="M0 0 L22 -1.7 L96 -1.7 L96 -4.2 L100 -4.2 L100 4.2 L96 4.2 L96 1.7 L22 1.7 Z" fill="#000"/>
  </g>
  <g class="ct-stylus-body">
    <path d="M0 0 L22 -1.7 L92 -1.7 L92 1.7 L22 1.7 Z" fill="url(#ct-bronze)"/>
    <path d="M24 -1.75h2.2v3.5H24zM44 -1.8h5v3.6h-5zM68 -1.8h4v3.6h-4zM88 -1.75h2v3.5h-2z" fill="#3a2812" opacity=".55"/>
    <path d="M45 -1.8l1.2 3.6M46.6 -1.8l1.2 3.6M48.2 -1.8l1 3.6M69 -1.8l1 3.6M70.6 -1.8l1 3.6" stroke="#e9d39b" stroke-width=".3" opacity=".7"/>
    <path d="M92 -1.7 L95.5 -1.9 L96 -4.4 L100 -4.6 L100 4.6 L96 4.4 L95.5 1.9 L92 1.7 Z" fill="url(#ct-bronze)"/>
    <path d="M0.3 -0.12 L14 -1.15" stroke="#f6e7bd" stroke-width=".35" opacity=".8"/>
  </g>
</svg>`;

/* ---- auto-init ---- */
function auto() {
    document.querySelectorAll('[data-cera-tablet]').forEach((el) => {
        if (el.__ct) return;
        const d = ceraTablet(el);
        el.__ct = Object.assign(() => { d(); delete el.__ct; }, d);
        for (const k of ['busy', 'frames']) Object.defineProperty(el.__ct, k, { get: () => d[k] });
    });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto, { once: true }); else auto();
export default ceraTablet;
export { BASE_URL };
