/*
 *  LOTUS-LEAF // rain on a cluster of lotus leaves in a still pond.
 *
 *  Markup:  <figure data-lotus-leaf>
 *             <img src="assets/lotus-leaf.webp" alt="" width="2000" height="1730" data-navel=".4995 .4948" data-radius=".4523">
 *             <img src="assets/lotus-leaf-2.webp" alt="" width="2000" height="1915" data-navel=".4957 .5383" data-radius=".4756">
 *           </figure>
 *  Or call  lotusLeaf(figure, options)  yourself. It returns destroy().
 *
 *  Each <img> is a cut-out leaf seen from above (alpha = the leaf); data-navel is
 *  where the stalk joins, data-radius the leaf's mean radius, both as fractions
 *  of the image width/height. The figure becomes a small pond: several leaves of
 *  different sizes, some floating flat, some held above the water on stalks,
 *  cupped and tipped a little, the higher ones larger and shading the lower ones
 *  and the water. Beads of water sit on every leaf as near-perfect spheres that
 *  shine like quicksilver; tilt the phone, press a leaf, or push a bead and they
 *  roll, merge with a quick shiver, gather in each leaf's cup, and run off the
 *  edge, falling onto a leaf below or into the pond with a ring.
 *
 *  Physics (CPU, in millimetres): each leaf has a height field in its own frame
 *  (a cup, gentle hollows, the veins as faint ridges, the stalk's tip, the
 *  phone's tilt turned into that frame, a dimple where it is pressed). Beads
 *  roll with a little viscous loss and are held by contact-angle hysteresis below
 *  a critical tilt that grows as 1/R^2. Shape from the Bond number. Drops leave a
 *  leaf as free bodies and land on whatever is below. Stalked leaves sway on a
 *  spring when a heavy drop lands.
 *
 *  Light (WebGL1): the pond (its edge, the leaves' shadows, rings); then, from
 *  the lowest leaf to the highest: the leaf with the shadows of the leaves above
 *  it, its beads' shadows and caustics, its dust, its beads ray-traced as lenses
 *  with the plastron's silver, and any drop falling past that height.
 *
 *  Options (data- attributes or the options object, which wins):
 *    span      420     width of the pond in mm (sets the scale of the beads)
 *    shower    auto    drops in the shower when the pond first comes into view
 *    rain      9000    ms between later drops (jittered); 0 = none after the shower
 *    drops     14      how many later drops before the sky clears
 *    seed      7
 *  Events (bubbling, on the figure): lotus-leaf:land, lotus-leaf:merge,
 *  lotus-leaf:runoff, lotus-leaf:splash (a drop into the pond), detail { r } mm.
 */
import tilt from './tilt.js';

const calm = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// ── the physics, in mm and seconds ──────────────────────────────────────────
const G = 9810;              // mm/s^2
const ROLL = 0.62;           // a rolling drop gets about this share of g sin(a)
const LC = 2.7;              // capillary length of water, mm
const HALF_MAX = 0.985 * LC; // a puddle's half-height: 2 lc sin(160deg / 2) / 2
const PIN_ANGLE = 4.2;       // deg, critical tilt for a 1.2 mm bead (lotus: 2-5 deg)
const DRAG = 1.1;            // 1/s, viscous loss of a rolling bead
const TILT_DEG = 24;         // phone tilt (tilt.js unit) in degrees
const FALL = 0.32;           // falls are shown at this share of g (a real one is over in a blink)
const PERSP = 620;           // mm from the eye to the water: higher leaves look larger
const SHADOW = 0.38;         // shadow length per mm of height (a high, slightly veiled sun)
const MAX_DROPS = 1400;
const SAT0 = 0.24, SAT1 = 0.74;  // colour: grey-green when dry, the leaves' own blue-green once wet
const AWAY = [0.643, 0.766];     // on the page, away from the light

// the cluster: x, y (fractions of the pond), d (diameter, fraction of its width), h (mm above
// the water: 0 = floating), image, rotation, mirrored, hue shift, tip of a stalked leaf (deg) and its direction
const LAYOUT_WIDE = { aspect: 1.18, mm: 420, leaves: [
    { x: 0.44, y: 0.48, d: 0.42, h: 92, t: 0, rot: -6, mir: 0, hue: 0.0, tip: 8, dir: 210 },        // the big one
    { x: 0.73, y: 0.69, d: 0.27, h: 0, t: 1, rot: 200, mir: 0, hue: -0.28 },                          // floating, partly under it
    { x: 0.74, y: 0.27, d: 0.24, h: 54, t: 1, rot: 35, mir: 1, hue: -0.32, tip: 12, dir: 320 },
    { x: 0.17, y: 0.30, d: 0.25, h: 128, t: 0, rot: 250, mir: 1, hue: 0.02, tip: 55, dir: 150 },     // high, tipped, seen half on edge
    { x: 0.685, y: 0.53, d: 0.10, h: 80, t: 2, bud: 1, rot: 62 },                                   // a closed bud, its stalk hidden under the big leaf
    { x: 0.21, y: 0.73, d: 0.21, h: 0, t: 1, rot: 80, mir: 1, hue: -0.3 },                             // floating, its edge under the big one
    { x: 0.53, y: 0.88, d: 0.13, h: 0, t: 0, rot: 115, mir: 1, hue: 0.03 },                            // a young one at the edge of the cluster
    { x: 0.92, y: 0.47, d: 0.11, h: 0, t: 0, rot: 20, mir: 0, hue: 0.0 },
] };
const LAYOUT_TALL = { aspect: 0.86, mm: 300, leaves: [
    { x: 0.47, y: 0.46, d: 0.54, h: 84, t: 0, rot: -6, mir: 0, hue: 0.0, tip: 8, dir: 210 },
    { x: 0.76, y: 0.76, d: 0.32, h: 0, t: 1, rot: 200, mir: 0, hue: -0.28 },
    { x: 0.22, y: 0.20, d: 0.30, h: 118, t: 0, rot: 250, mir: 1, hue: 0.02, tip: 55, dir: 150 },
    { x: 0.76, y: 0.56, d: 0.13, h: 72, t: 2, bud: 1, rot: 68 },
    { x: 0.80, y: 0.22, d: 0.24, h: 50, t: 1, rot: 35, mir: 1, hue: -0.32, tip: 12, dir: 320 },
    { x: 0.19, y: 0.80, d: 0.25, h: 0, t: 1, rot: 80, mir: 1, hue: -0.3 },
] };

function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// volume of a superellipsoid of revolution z = +-b (1 - (r/a)^p)^(1/p): V = 4 pi a^2 b K(p)
const KTAB = [];
for (let i = 0; i <= 120; i++) {
    const p = 2 + i * 0.1; let s = 0; const N = 400;
    for (let j = 0; j < N; j++) { const u = (j + 0.5) / N; s += u * Math.pow(1 - Math.pow(u, p), 1 / p) / N; }
    KTAB.push(s);
}
const Kp = (p) => { const f = clamp((p - 2) / 0.1, 0, 120); const i = Math.floor(f); return KTAB[i] + (KTAB[Math.min(120, i + 1)] - KTAB[i]) * (f - i); };

// the shape of a bead of equivalent radius R (mm)
function shape(R) {
    const b = HALF_MAX * Math.tanh(R / HALF_MAX);            // half-height: R when small, saturating
    const p = 2 + 11 * smooth(0.6, 2.4, R / LC);              // sphere -> flat-topped puddle
    const V = 4 / 3 * Math.PI * R * R * R;
    const a = Math.sqrt(V / (4 * Math.PI * b * Kp(p)));      // footprint radius
    return { a, b, p };
}



// ── shaders ─────────────────────────────────────────────────────────────────
const HEAD = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`;
// one leaf: world (canvas css px) -> its image, graded
const SCENE = `
uniform sampler2D uLeaf;     // the leaf, premultiplied, mipmapped
uniform mat2 uM;             // canvas css px -> image uv, about the navel
uniform vec2 uC;             // the navel, canvas css px
uniform vec2 uNav;           // the navel, image uv
uniform float uSat, uHue, uLit, uNone;
uniform vec3 uBelow;         // what is under the leaf (the pond)
uniform vec4 uPress;         // dimple: x, y (css px), depth (css px), sigma (css px)
uniform vec3 uCup;           // a tipped, cupped leaf: its low side darker (direction, per css px)
const vec3 LIGHT = vec3(-0.45, -0.54, 0.71);

vec3 hueTurn(vec3 c, float a) {
    vec3 y = mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312) * c;
    float cs = cos(a), sn = sin(a);
    y.yz = vec2(cs * y.y - sn * y.z, sn * y.y + cs * y.z);
    return mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703) * y;
}
vec3 grade(vec3 c) {
    c = hueTurn(c, uHue);
    float l = dot(c, vec3(0.3, 0.59, 0.11));
    vec3 g = mix(vec3(l), c, uSat) * vec3(0.97, 0.995, 1.02);
    return mix(g, vec3(0.70, 0.79, 0.83), 0.09);      // the waxy bloom
}
vec4 leafAt(vec2 q) {
    if (uNone > 0.5) return vec4(0.0);
    vec2 d = q - uPress.xy;
    float e = exp(-dot(d, d) / (2.0 * uPress.w * uPress.w));
    vec2 grad = uPress.z * e * d / (uPress.w * uPress.w);
    vec2 uv = uM * (q - uC + d * 0.05 * e * step(0.01, uPress.z)) + uNav;
    vec4 t = texture2D(uLeaf, uv);
    vec2 inb = step(vec2(0.0), uv) * step(uv, vec2(1.0));
    t *= inb.x * inb.y;
    float a = t.a;
    vec3 c = a > 0.0 ? t.rgb / a : vec3(0.0);
    c = grade(c) * uLit * (1.0 + clamp(uCup.z * dot(q - uC, uCup.xy), -0.22, 0.12));
    vec3 n = normalize(vec3(grad, 1.0));
    c *= 1.0 + (dot(n, LIGHT) / LIGHT.z - 1.0) * 0.9;
    return vec4(c * a, a);
}
vec3 sceneAt(vec2 q) { vec4 l = leafAt(q); return l.rgb + uBelow * (1.0 - l.a); }
`;
// the soft shadows of the leaves above: up to 8 casters, each its blurred alpha moved away from the sun
const CASTERS = `
uniform sampler2D uShade0, uShade1, uShade2;
uniform vec4 uKM[8];         // caster: canvas px -> its image uv (m00 m01 m10 m11)
uniform vec4 uKC[8];         // caster: navel px moved along its shadow, navel uv
uniform vec4 uKP[8];         // caster: which image, blur (mip bias), strength
uniform int uNK;
float casters(vec2 q) {
    float s = 0.0;
    for (int i = 0; i < 8; i++) {
        if (i >= uNK) break;
        vec4 m = uKM[i]; vec2 dq = q - uKC[i].xy;
        vec2 uv = vec2(m.x * dq.x + m.y * dq.y, m.z * dq.x + m.w * dq.y) + uKC[i].zw;
        vec2 su = uv * (176.0 / 256.0) + 40.0 / 256.0;    // the image sits well inset in the shadow map, so its blur has room
        vec2 inb = step(vec2(0.0), su) * step(su, vec2(1.0));
        float k = uKP[i].x;
        float a = (texture2D(uShade0, su, uKP[i].y).r * step(k, 0.5) + texture2D(uShade1, su, uKP[i].y).r * step(0.5, k) * step(k, 1.5)
                 + texture2D(uShade2, su, uKP[i].y).r * step(1.5, k)) * inb.x * inb.y;
        s = 1.0 - (1.0 - s) * (1.0 - a * uKP[i].z);
    }
    return s;
}
`;

const RECT_VS = `
attribute vec2 aPos;
uniform vec2 uView;
uniform vec4 uRect;
varying vec2 vQ;
void main() { vQ = uRect.xy + aPos * uRect.zw; gl_Position = vec4(vQ.x / uView.x * 2.0 - 1.0, 1.0 - vQ.y / uView.y * 2.0, 0.0, 1.0); }`;

const LEAF_FS = HEAD + SCENE + CASTERS + `
varying vec2 vQ;
void main() {
    vec4 l = leafAt(vQ);
    float sh = casters(vQ);
    gl_FragColor = vec4(l.rgb * (1.0 - sh * vec3(0.82, 0.9, 1.0)), l.a);   // warm-grey shade
}`;

// below the leaves: either nothing but the paper (their shadows and the rings lie on it as faint
// warm greys), or a broad, very pale wash of water with no outline
const WATER_FS = HEAD + CASTERS + `
varying vec2 vQ;
uniform vec2 uStage;
uniform sampler2D uPond;
uniform vec3 uWater;
uniform float uWash;
uniform vec4 uRings[12];     // x, y (css px), radius (css px), strength
uniform int uNR;
void main() {
    float a = texture2D(uPond, vQ / uStage).r * uWash;
    float s = 0.0;
    for (int i = 0; i < 12; i++) {
        if (i >= uNR) break;
        vec4 r = uRings[i];
        float dr = length(vQ - r.xy) - r.z;
        float w = 0.9 + r.z * 0.06;
        // a capillary ring: a crest and a trough, the light catching the side toward it
        s += r.w * (dr / w) * exp(-dr * dr / (w * w));
        float dr2 = dr + r.z * 0.32;
        s += r.w * 0.5 * (dr2 / w) * exp(-dr2 * dr2 / (w * w));
    }
    vec3 col = uWater * a; float al = a;
    float ra = min(abs(s) * 0.32, 0.3);
    vec3 rc = s > 0.0 ? vec3(1.0, 0.995, 0.98) : vec3(0.40, 0.38, 0.35);
    col = rc * ra + col * (1.0 - ra); al = ra + al * (1.0 - ra);
    float sa = casters(vQ) * 0.4;
    col = vec3(0.30, 0.27, 0.23) * sa + col * (1.0 - sa); al = sa + al * (1.0 - sa);
    if (al <= 0.002) discard;
    gl_FragColor = vec4(col, al);
}`;

// one quad per bead (or speck)
const DROP_VS = `
attribute vec2 aCorner;
attribute vec4 aA;    // centre x, y (css px), a, b (css px)
attribute vec4 aB;    // p, shiver, shiver axis, lift z (css px)
attribute vec4 aC;    // opacity, half-size of the quad (css px), offset x, offset y (quad centre - bead centre)
attribute vec4 aE;    // silver (small beads), outline seed, merge lobe angle, merge lobe size
uniform vec2 uView;
varying vec2 vD;
varying vec4 vA; varying vec4 vB; varying vec4 vC; varying vec4 vE;
void main() {
    vec2 c = aA.xy + aC.zw;
    vec2 q = c + aCorner * aC.y;
    vD = q - aA.xy;
    vA = aA; vB = aB; vC = aC; vE = aE;
    gl_Position = vec4(q.x / uView.x * 2.0 - 1.0, 1.0 - q.y / uView.y * 2.0, 0.0, 1.0);
}`;

// shadow and caustic: written as (c, a) and blended dst * (c + a), so it can darken and brighten
const SHADOW_FS = HEAD + `
varying vec2 vD; varying vec4 vA; varying vec4 vB; varying vec4 vC;
uniform float uDpr;
const vec2 AWAY = vec2(0.643, 0.766);    // on the paper, away from the light
void main() {
    float a = vA.z, b = vA.w, p = vB.x, z = vB.w;
    float flt = clamp((p - 2.0) / 6.0, 0.0, 1.0);
    // the sun at about 50 deg: a sphere's shadow is an ellipse centred 0.84 R away from the light,
    // R across and 1.3 R along; the light through it converges into a spot 0.35 R wide at its middle
    float off = b * 0.84 + z * 0.84;
    vec2 d = vD - AWAY * off;
    vec2 dl = vec2(dot(d, AWAY), dot(d, vec2(-AWAY.y, AWAY.x)));
    dl.x /= (a + 0.3 * b) / a;
    float r = length(dl) / a;
    float soft = 0.08 + 0.3 * clamp(z / (a + 1.0), 0.0, 2.0);
    float inside = 1.0 - smoothstep(1.0 - soft, 1.0 + soft, r);
    float air = 1.0 / (1.0 + z / (a * 1.5 + 1.0));
    float ring = smoothstep(0.25, 0.75, r);
    float shade = (0.07 + 0.25 * ring) * inside * air * (1.0 - 0.55 * flt);
    vec2 ds = vD - AWAY * off * 1.12;
    float spot = exp(-dot(ds, ds) / (2.0 * pow(a * 0.24 + 0.4, 2.0))) * (1.0 - flt);
    float cres = exp(-pow((length(vD) - a * 0.97) / (a * 0.06 + 0.6), 2.0)) * smoothstep(0.1, 0.8, dot(normalize(vD + 1e-4), AWAY)) * flt;
    float caus = (spot * 1.5 + cres * 0.6) * air * air;
    float f = (1.0 - shade) + caus;
    f = mix(1.0, f, vC.x);
    gl_FragColor = vec4(vec3(max(f - 1.0, 0.0)) * vec3(1.0, 0.98, 0.9), min(f, 1.0));
}`;


const BODY_FS = HEAD + SCENE + `
varying vec2 vD; varying vec4 vA; varying vec4 vB; varying vec4 vC; varying vec4 vE;
uniform float uDpr;
const float ETA = 1.333;
const vec2 AWAY = vec2(0.643, 0.766);
const vec3 SKY = vec3(0.90, 0.93, 0.965);       // overcast sky: grey-white, a little blue
const vec2 WIN = vec2(-0.30, -0.38);             // a bright window up to the left (projective x/z, y/z)

// what the water mirrors: the bright sky overhead with one window in it, dimming to the
// surroundings at the horizon, and the leaf below it
vec3 sky(vec3 r) {
    vec3 c = mix(vec3(0.20, 0.25, 0.23), SKY * 0.84, smoothstep(-0.18, 0.35, r.z));
    return mix(c, SKY * 1.08, smoothstep(0.35, 0.95, r.z));
}
vec3 env(vec3 r) {
    vec3 c = sky(r);
    if (r.z > 0.05) {
        vec2 q = r.xy / r.z - WIN;
        vec2 w = abs(q) - vec2(0.12, 0.155);
        float win = 1.0 - smoothstep(-0.012, 0.016, max(w.x, w.y));
        float bars = smoothstep(0.006, 0.014, abs(q.x)) * smoothstep(0.006, 0.014, abs(q.y + 0.02));
        c += vec3(1.0, 0.99, 0.96) * win * mix(0.45, 1.0, bars) * 22.0;
    }
    return c;
}

void main() {
    float a = vA.z, b = vA.w, p = vB.x, s = vB.y, ang = vB.z, z = vB.w;
    float flt = clamp((p - 2.0) / 6.0, 0.0, 1.0);
    // the shiver: a damped mode-2 oscillation, stretched along the line of the merger
    vec2 ax = vec2(cos(ang), sin(ang));
    vec2 d0 = vec2(dot(vD, ax), dot(vD, vec2(-ax.y, ax.x)));
    d0.x /= 1.0 + s; d0.y *= 1.0 + s * 0.9;
    vec2 d = d0.x * ax + d0.y * vec2(-ax.y, ax.x);
    // a pool's outline is not a circle: it follows the cup, and keeps a lobe where a bead ran in
    float th = atan(d.y, d.x), sd = vE.y;
    float da = th - vE.z; da = mod(da + 3.14159, 6.28318) - 3.14159;
    float m = 1.0 + flt * (0.045 * sin(2.0 * th + sd) + 0.03 * sin(3.0 * th + sd * 1.7) + 0.018 * sin(5.0 * th + sd * 2.3))
                  + vE.w * exp(-da * da / 0.22);
    float ae = a * m;
    float r = length(d) / ae;
    float aa = clamp((1.0 - r) * ae * uDpr + 0.5, 0.0, 1.0);
    if (aa <= 0.0) discard;
    float rr = min(r, 0.9995);
    float rp = pow(rr, p);
    float sp = pow(max(1.0 - rp, 1e-5), 1.0 / p);
    // a pool's top is not quite flat: a faint dome, enough to bring the window into one side of it
    float dome = 0.2 * flt;
    float zt = b + b * sp + dome * ae * (1.0 - rr * rr) * 0.5;
    float dzdr = -(b / ae) * pow(rr, p - 1.0) * pow(max(1.0 - rp, 1e-5), 1.0 / p - 1.0) - dome * rr;
    vec2 dir = r > 1e-4 ? d / (r * ae) : vec2(0.0);
    vec3 n = normalize(vec3(-dzdr * dir, 1.0));
    vec3 v = vec3(0.0, 0.0, -1.0);
    float F = 0.02 + 0.98 * pow(1.0 - n.z, 5.0);
    vec3 refl = env(reflect(v, n));

    // through the bead to the leaf: in at the top, out through the underside
    vec3 t = refract(v, n, 1.0 / ETA);
    vec3 P = vec3(d, zt);
    vec2 hit; float Rb = 0.0;
    float contact = max(0.0, ae - b * 1.15) * flt;
    vec2 q0 = P.xy + t.xy * (P.z / max(-t.z, 0.05));
    if (length(q0) < contact) {
        hit = q0;
    } else {
        vec3 Ps = vec3(P.xy / ae, (P.z - b) / b);
        vec3 ts = vec3(t.xy / ae, t.z / b);
        float A = dot(ts, ts), B = 2.0 * dot(Ps, ts), C = dot(Ps, Ps) - 1.0;
        float disc = max(B * B - 4.0 * A * C, 0.0);
        float sq = (-B + sqrt(disc)) / (2.0 * A);
        vec3 Q = P + t * max(sq, 0.0);
        Q.z = max(Q.z, 0.0);
        vec3 nq = normalize(vec3(Q.xy / (ae * ae), (Q.z - b) / (b * b)));
        vec3 t2 = refract(t, -nq, ETA);
        float ci = clamp(dot(t, nq), 0.0, 1.0);
        if (dot(t2, t2) < 1e-4) { Rb = 1.0; hit = Q.xy; }
        else { Rb = 0.02 + 0.98 * pow(1.0 - ci, 5.0); hit = Q.xy + t2.xy * ((Q.z + z) / max(-t2.z, 0.12)); }
    }
    vec3 trans = sceneAt(vA.xy + hit);
    // light gathered by the lens glows on the far side, inside the bead
    float glow = pow(max(dot(dir, AWAY), 0.0), 1.5) * smoothstep(0.35, 0.92, r) * (1.0 - smoothstep(0.92, 1.0, r));
    trans += vec3(1.0, 0.99, 0.95) * glow * 0.45 * (1.0 - 0.7 * flt);

    // the plastron: under the water lies a film of air held by the wax, and where the underside
    // curves up to the margin it mirrors the sky (total internal reflection): quicksilver
    vec3 silver = sky(normalize(vec3(-dir * 0.42, 1.0))) * mix(0.94, 1.02, dot(dir, -AWAY) * 0.5 + 0.5);
    float low = 0.62 + 0.38 * smoothstep(-0.6, 0.8, dot(dir, normalize(vec2(0.25, 1.0))));   // strongest in the lower half
    float band = smoothstep(0.38, 0.80, r) * low;
    float plast = max(Rb, band * mix(0.72, 0.92, flt));
    trans = mix(trans, silver, plast);
    // a pool's top mirrors the sky evenly; the leaf shows through it only faintly
    trans = mix(trans, SKY * 0.95, 0.6 * flt * (1.0 - band));

    vec3 col = trans * (1.0 - F) + refl * F;
    // small beads are nearly all mirror, like ball bearings: the sky, the window, the leaf at the rim
    vec3 chrome = env(reflect(v, n)) + sceneAt(vA.xy - d * 0.6) * 0.06;
    col = mix(col, chrome, vE.x * (0.55 + 0.4 * smoothstep(0.2, 0.9, r)));
    // a fine dark line at the very edge, where the surface turns away and sees only the dim surroundings
    col *= 1.0 - 0.5 * smoothstep(0.9, 1.0, r) * (1.0 - 0.4 * flt) * clamp((a * uDpr - 2.0) / 5.0, 0.15, 1.0);   // a point of silver has no dark outline
    col = min(col, vec3(1.0));
    float o = aa * vC.x;
    gl_FragColor = vec4(col * o, o);
}`;


// a speck of dust: soft dark grain; vB.y = depth cue (0 on the leaf, 1 seen through the water)
const SPECK_FS = HEAD + `
varying vec2 vD; varying vec4 vA; varying vec4 vB; varying vec4 vC;
uniform float uDpr;
void main() {
    float r = length(vD) / vA.z;
    float o = clamp((1.0 - r) * vA.z * uDpr * 0.8 + 0.2, 0.0, 1.0) * vC.x;
    if (o <= 0.0) discard;
    vec3 c = mix(vec3(0.24, 0.19, 0.13), vec3(0.36, 0.32, 0.26), vB.y);
    gl_FragColor = vec4(c * o, o);
}`;


// ── helpers ─────────────────────────────────────────────────────────────────
function compile(gl, vs, fs) {
    const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const nm = gl.getActiveUniform(p, i).name; u[nm] = gl.getUniformLocation(p, nm); }
    return { p, u };
}

function boxBlur(src, w, h, r, passes) {
    let a = Float32Array.from(src), b = new Float32Array(w * h);
    for (let k = 0; k < passes; k++) {
        for (let y = 0; y < h; y++) { let s = 0; for (let x = -r; x <= r; x++) s += a[y * w + clamp(x, 0, w - 1)]; for (let x = 0; x < w; x++) { b[y * w + x] = s / (2 * r + 1); s += a[y * w + Math.min(w - 1, x + r + 1)] - a[y * w + Math.max(0, x - r)]; } }
        for (let x = 0; x < w; x++) { let s = 0; for (let y = -r; y <= r; y++) s += b[clamp(y, 0, h - 1) * w + x]; for (let y = 0; y < h; y++) { a[y * w + x] = s / (2 * r + 1); s += b[Math.min(h - 1, y + r + 1) * w + x] - b[Math.max(0, y - r) * w + x]; } }
    }
    return a;
}


// ── the component ───────────────────────────────────────────────────────────
export function lotusLeaf(el, options = {}) {
    const imgs = [...el.querySelectorAll('img')];
    if (!imgs.length) return () => {};
    const ds = el.dataset;
    const num = (k, d) => (options[k] != null ? +options[k] : ds[k] != null && ds[k] !== '' ? +ds[k] : d);
    const opt = { water: options.water || ds.water || 'none', span: num('span', 420), shower: num('shower', 0), rain: num('rain', 9000), drops: num('drops', 14), seed: num('seed', 7) };
    const reduced = calm.matches;
    const rand = rng(opt.seed);
    const cleanup = [];
    const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); cleanup.push(() => t.removeEventListener(ev, fn, o)); };
    let dead = false, raf = 0, io = null, tiltTimer = 0, rainTimer = 0;

    const canvas = document.createElement('canvas');
    canvas.className = 'll-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false });
    if (!gl) return () => {};
    el.appendChild(canvas);

    let progLeaf, progWater, progShadow, progBody, progSpeck;
    try {
        progLeaf = compile(gl, RECT_VS, LEAF_FS);
        progWater = compile(gl, RECT_VS, WATER_FS);
        progShadow = compile(gl, DROP_VS, SHADOW_FS);
        progBody = compile(gl, DROP_VS, BODY_FS);
        progSpeck = compile(gl, DROP_VS, SPECK_FS);
    } catch (e) { console.warn('lotus-leaf:', e); canvas.remove(); return () => {}; }

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]), gl.STATIC_DRAW);
    const FLOATS = 18;
    const vdata = new Float32Array((MAX_DROPS + 600) * 6 * FLOATS);
    const vbuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbuf);
    gl.bufferData(gl.ARRAY_BUFFER, vdata.byteLength, gl.DYNAMIC_DRAW);

    const mkTex = (min, mag) => {
        const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, min); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, mag || gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return t;
    };
    const texPond = mkTex(gl.LINEAR);

    // ── the leaf images: fields shared by every leaf cut from them ───────────
    const GW = 128;
    const kinds = imgs.map((img, i) => {
        const nav = (img.dataset.navel || ['.4995 .4948', '.4957 .5383', '.5 .88'][Math.min(i, 2)]).trim().split(/[\s,]+/).map(Number);
        const rad = +(img.dataset.radius || [0.4523, 0.4756, 0.5][Math.min(i, 2)]);
        return { img, nav, rad, GH: 0, mask: null, vein: null, tex: mkTex(gl.LINEAR_MIPMAP_LINEAR), shade: mkTex(gl.LINEAR_MIPMAP_LINEAR) };
    });

    function buildKind(k) {
        const img = k.img;
        k.GH = Math.round(GW * img.naturalHeight / img.naturalWidth);
        const GH = k.GH;
        const c = document.createElement('canvas'); c.width = GW; c.height = GH;
        const x = c.getContext('2d', { willReadFrequently: true });
        x.drawImage(img, 0, 0, GW, GH);
        const px = x.getImageData(0, 0, GW, GH).data;
        k.mask = new Float32Array(GW * GH);
        const lum = new Float32Array(GW * GH);
        for (let i = 0; i < GW * GH; i++) { k.mask[i] = px[i * 4 + 3] / 255; lum[i] = (px[i * 4] * 0.3 + px[i * 4 + 1] * 0.59 + px[i * 4 + 2] * 0.11) / 255; }
        const lb = boxBlur(lum, GW, GH, 2, 2);
        k.vein = new Float32Array(GW * GH);
        for (let i = 0; i < GW * GH; i++) k.vein[i] = clamp((lum[i] - lb[i] - 0.006) * 40) * k.mask[i];
        // the image, square and mipmapped so a small leaf is never shimmery
        const S = 1024, cc = document.createElement('canvas'); cc.width = S; cc.height = S;
        const cx = cc.getContext('2d'); cx.imageSmoothingQuality = 'high'; cx.drawImage(img, 0, 0, S, S);
        gl.bindTexture(gl.TEXTURE_2D, k.tex);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cc);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.generateMipmap(gl.TEXTURE_2D);
        // its shadow: the alpha, softened, square, mipmapped (the mip level is the blur)
        const T = 256, sc = document.createElement('canvas'); sc.width = T; sc.height = T;
        const sx = sc.getContext('2d', { willReadFrequently: true }); sx.drawImage(img, 40, 40, T - 80, T - 80);
        const sp = sx.getImageData(0, 0, T, T).data, al = new Float32Array(T * T);
        for (let i = 0; i < T * T; i++) al[i] = sp[i * 4 + 3] / 255;
        const bl = boxBlur(al, T, T, 2, 2), sb = new Uint8Array(T * T);
        for (let i = 0; i < T * T; i++) sb[i] = bl[i] * 255;
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.bindTexture(gl.TEXTURE_2D, k.shade);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, T, T, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, sb);
        gl.generateMipmap(gl.TEXTURE_2D);
    }

    // ── the pond and its leaves (all in mm; only px per mm changes with the size) ──
    let layout = null, pondW = opt.span, pondH = 0, leaves = [], byHeight = [], pond = null, PGW = 0, PGH = 0;
    const falling = [], rings = [];

    function makeLeaf(def, i) {
        const k = kinds[Math.min(def.t, kinds.length - 1)];
        const span = def.d * pondW;
        const imgMM = span / (2 * k.rad), imgMMh = imgMM * k.GH / GW;
        const th = (def.rot || 0) * Math.PI / 180, cs = Math.cos(th), sn = Math.sin(th), m = def.mir ? -1 : 1;
        const R = [cs * m, -sn, sn * m, cs];                  // local (image) direction -> world: rotation after mirroring
        // a stalked leaf is tipped: seen a little from the side, it is foreshortened along its tip
        const tip = (def.tip || 0) * Math.PI / 180, ud = (def.dir || 0) * Math.PI / 180, ux = Math.cos(ud), uy = Math.sin(ud), f = Math.cos(tip);
        const F = [1 - (1 - f) * ux * ux, -(1 - f) * ux * uy, -(1 - f) * ux * uy, 1 - (1 - f) * uy * uy];
        const A = [F[0] * R[0] + F[1] * R[2], F[0] * R[1] + F[1] * R[3], F[2] * R[0] + F[3] * R[2], F[2] * R[1] + F[3] * R[3]];
        const det = A[0] * A[3] - A[1] * A[2];
        const Ai = [A[3] / det, -A[1] / det, -A[2] / det, A[0] / det];
        const leaf = {
            i, def, k, span, imgMM, imgMMh, h: def.h, persp: 1 + def.h / PERSP,
            navX: k.nav[0] * imgMM, navY: k.nav[1] * imgMMh,
            X0: def.x * pondW, Y0: def.y * pondH,          // the navel on the pond, mm
            R, A, Ai, slope: [-Math.min(Math.sin(tip) * 0.35, 0.09) * ux, -Math.min(Math.sin(tip) * 0.35, 0.09) * uy],
            cup: [ux, uy, def.tip ? -0.2 * Math.sin(tip) / Math.max(0.05, def.d * 0.5) : 0],
            lit: (1 + 0.9 * Math.sin(tip) * (ux * -0.45 + uy * -0.54)) * (def.t === 1 ? 0.92 : 1),   // the second photograph is brighter
            sway: { x: 0, y: 0, vx: 0, vy: 0 },
            drops: [], specks: [], height: null,
        };
        if (def.bud) { leaf.bud = true; return leaf; }
        // its relief, in its own frame
        const GH = k.GH, mmc = imgMM / GW, R0 = span / 2, waves = [];
        for (let w = 0; w < 10; w++) { const t = rand() * Math.PI * 2, l = 9 + rand() * 9; waves.push([Math.cos(t) * 2 * Math.PI / l, Math.sin(t) * 2 * Math.PI / l, rand() * 6.3]); }
        const veinS = boxBlur(k.vein, GW, GH, 1, 1), sc = span / 92;
        leaf.height = new Float32Array(GW * GH);
        for (let j = 0; j < GH; j++) for (let x = 0; x < GW; x++) {
            const X = (x + 0.5) * mmc - leaf.navX, Y = (j + 0.5) * mmc - leaf.navY;
            const rho = Math.hypot(X, Y) / R0, rm = Math.hypot(X, Y);
            let h = 1.8 * sc * (1 - Math.exp(-rho * rho / (2 * 0.36 * 0.36))) + 0.7 * sc * rho ** 4 - 1.4 * Math.exp(-rm * rm / (2 * 49 * sc * sc));
            let wv = 0; for (const [kx, ky, ph] of waves) wv += Math.sin(kx * X + ky * Y + ph);
            h += 0.09 * wv / Math.sqrt(waves.length) * smooth(0.12, 0.35, rho);
            h += 0.44 * veinS[j * GW + x] / Math.max(1, sc);
            leaf.height[j * GW + x] = h;
        }
        // dust specks
        const n = Math.round(span * 0.22);
        for (let s = 0; s < n; s++) {
            const t = rand() * 6.283, r = Math.sqrt(rand()) * span * 0.47;
            const X = Math.cos(t) * r, Y = Math.sin(t) * r;
            if (leafMask(leaf, X, Y) > 0.9) leaf.specks.push({ x: X, y: Y, s: 0.11 + rand() * rand() * 0.22, free: true });
        }
        return leaf;
    }

    function buildPond() {
        const L = canvas.clientWidth < 560 ? LAYOUT_TALL : LAYOUT_WIDE;
        if (layout === L && leaves.length) return;
        layout = L; pondW = opt.span * L.mm / 420; pondH = pondW / L.aspect;
        el.style.aspectRatio = String(L.aspect);
        for (const lf of leaves) for (const d of lf.drops) d.dead = true;
        leaves = L.leaves.filter((d) => !d.bud || kinds.length > 2).map(makeLeaf);
        byHeight = leaves.slice().sort((a, b) => a.h - b.h || a.i - b.i);
        falling.length = 0; rings.length = 0;
        // the pond's outline: a soft union round the leaves, a little uneven, inside the frame
        PGW = 420; PGH = Math.round(PGW / L.aspect);
        const f = new Float32Array(PGW * PGH), nz = new Float32Array(PGW * PGH);
        for (let i = 0; i < nz.length; i++) nz[i] = rand();
        const n1 = boxBlur(nz, PGW, PGH, 24, 3);
        pond = new Float32Array(PGW * PGH);
        const cxm = leaves.reduce((t, lf) => t + lf.X0, 0) / leaves.length, cym = leaves.reduce((t, lf) => t + lf.Y0, 0) / leaves.length;
        for (let j = 0; j < PGH; j++) for (let i = 0; i < PGW; i++) {
            const X = (i + 0.5) / PGW * pondW, Y = (j + 0.5) / PGH * pondH;
            // the open water among the leaves: one broad swell at the middle of the cluster fills the gaps
            let s = Math.exp(-(((X - cxm) / (pondW * 0.36)) ** 2 + ((Y - cym) / (pondH * 0.36)) ** 2) * 1.2) * 0.55;
            for (const lf of leaves) { const r = lf.span * 0.5 * (lf.h > 0 ? 1.05 : 1.3) + 14; const dd = Math.hypot(X - lf.X0, Y - lf.Y0) / r; s += Math.exp(-dd * dd * 1.6); }
            s += (n1[j * PGW + i] - 0.5) * 1.6;
            const edge = Math.min(X, Y, pondW - X, pondH - Y);
            s *= smooth(0, 16, edge);                     // never cut by the frame
            let a = smooth(0.06, 0.5, s) * 0.6;     // a broad wash, no outline
            pond[j * PGW + i] = a;
        }
        const pb = new Uint8Array(PGW * PGH); for (let i = 0; i < pb.length; i++) pb[i] = pond[i] * 255;
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.bindTexture(gl.TEXTURE_2D, texPond);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, PGW, PGH, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, pb);
        totalArea = leaves.reduce((s, lf) => s + (lf.bud ? 0 : Math.PI * (lf.span / 2) ** 2), 0);
    }
    let totalArea = 1;

    // leaf frame (mm about the navel, image axes) <-> pond (mm) <-> canvas (css px)
    const leafToPond = (lf, X, Y) => [lf.X0 + lf.sway.x / pxmm + lf.persp * (lf.A[0] * X + lf.A[1] * Y), lf.Y0 + lf.sway.y / pxmm + lf.persp * (lf.A[2] * X + lf.A[3] * Y)];
    const pondToLeaf = (lf, x, y) => { const dx = (x - lf.X0 - lf.sway.x / pxmm) / lf.persp, dy = (y - lf.Y0 - lf.sway.y / pxmm) / lf.persp; return [lf.Ai[0] * dx + lf.Ai[1] * dy, lf.Ai[2] * dx + lf.Ai[3] * dy]; };
    const sampleGrid = (arr, gw, gh, gx, gy) => {
        const i = clamp(Math.floor(gx), 0, gw - 2), j = clamp(Math.floor(gy), 0, gh - 2);
        const fx = clamp(gx - i), fy = clamp(gy - j), k = j * gw + i;
        return (arr[k] * (1 - fx) + arr[k + 1] * fx) * (1 - fy) + (arr[k + gw] * (1 - fx) + arr[k + gw + 1] * fx) * fy;
    };
    const leafGrid = (lf, arr, X, Y) => {
        const mmc = lf.imgMM / GW, gx = (X + lf.navX) / mmc - 0.5, gy = (Y + lf.navY) / mmc - 0.5;
        if (gx < 0 || gy < 0 || gx > GW - 1 || gy > lf.k.GH - 1) return arr === lf.height ? 50 : 0;
        return sampleGrid(arr, GW, lf.k.GH, gx, gy);
    };
    const leafMask = (lf, X, Y) => leafGrid(lf, lf.k.mask, X, Y);
    const pondAt = (x, y) => sampleGrid(pond, PGW, PGH, x / pondW * PGW - 0.5, y / pondH * PGH - 0.5);
    // the highest leaf at a point of the pond
    function leafAtPond(x, y, below = Infinity) {
        for (let i = byHeight.length - 1; i >= 0; i--) {
            const lf = byHeight[i]; if (lf.h >= below || lf.bud) continue;
            const [X, Y] = pondToLeaf(lf, x, y);
            if (leafMask(lf, X, Y) > 0.5) return [lf, X, Y];
        }
        return null;
    }

    // ── state ───────────────────────────────────────────────────────────────
    let landed = 0, satNow = reduced ? SAT1 : SAT0;
    let tiltX = 0, tiltY = 0, keyTX = 0, keyTY = 0;
    const keyHold = { x: 0, y: 0 };
    const press = { leaf: null, x: 0, y: 0, depth: 0, target: 0, v: 0, sigma: 9 };
    let pointer = null;
    const shower = { left: 0, total: 0 };
    let rainLeft = opt.drops, visible = false, started = false, emptied = false;

    function makeDrop(lf, X, Y, R) {
        const d = { lf, x: X, y: Y, vx: 0, vy: 0, R, stuck: true, z: 0, phase: 'rest', t: 0,
            sh: 0, shT: 0, shAx: 0, shF: 12, shTau: 0.12, out: 0, specks: [], held: false, squash: 1,
            seed: rand() * 6.283, lobeAng: 0, lobeAmp: 0, grew: false };
        lf.drops.push(d);
        return d;
    }
    const rainSize = () => {
        const u = rand();
        if (u < 0.40) return 0.3 + rand() * 0.4;       // fine drizzle and splash: tiny beads, held where they fall
        if (u < 0.64) return 0.7 + rand() * 0.45;      // small
        if (u < 0.82) return 1.15 + rand() * 0.65;     // medium
        return 2.0 + rand() * 0.8;                      // big drops: they run to the middle and make the pool
    };
    function emit(name, detail) { el.dispatchEvent(new CustomEvent('lotus-leaf:' + name, { bubbles: true, detail })); }

    // a big drop striking a water-repellent leaf throws off a few tiny satellite droplets
    function splash(d) {
        if (d.R < 1.1 || d.lf.drops.length > 400) return;
        const n = 1 + Math.floor(rand() * (d.R > 1.8 ? 4 : 2)), a = shape(d.R).a;
        for (let k = 0; k < n; k++) {
            const t = rand() * 6.283, r = a * (1.8 + rand() * 2.2);
            const X = d.x + Math.cos(t) * r, Y = d.y + Math.sin(t) * r;
            if (leafMask(d.lf, X, Y) > 0.9) makeDrop(d.lf, X, Y, 0.16 + rand() * 0.24);
        }
    }
    function land(lf, X, Y, R) {
        const d = makeDrop(lf, X, Y, R);
        d.phase = 'impact'; d.t = 0; d.stuck = false;
        landed += 4.19 * R ** 3;
        emit('land', { r: +R.toFixed(2) });
        splash(d);
        if (lf.h > 0) {
            // a stalked leaf nods under a heavy drop and springs back
            const m = R ** 3 / (lf.span * lf.span) * 900;
            const [wx, wy] = [lf.A[0] * X + lf.A[1] * Y, lf.A[2] * X + lf.A[3] * Y];
            const l = Math.hypot(wx, wy) || 1;
            lf.sway.vx += wx / l * m * 40; lf.sway.vy += wy / l * m * 40;
        }
        return d;
    }
    function ring(x, y, R) {
        rings.push({ x, y, t: 0, s: clamp(0.12 + R * 0.16, 0.1, 0.6) });
        if (rings.length > 12) rings.shift();
        emit('splash', { r: +R.toFixed(2) });
    }

    // ── simulation ──────────────────────────────────────────────────────────
    function slopeAt(lf, X, Y, a) {
        let gx = 0, gy = 0;
        const rs = Math.max(0.35, a * 0.6), e = 0.35;
        const pts = a > 1.2 ? [[0, 0], [rs, 0], [-rs, 0], [0, rs], [0, -rs]] : [[0, 0]];
        for (const [ox, oy] of pts) {
            gx += (leafGrid(lf, lf.height, X + ox + e, Y + oy) - leafGrid(lf, lf.height, X + ox - e, Y + oy)) / (2 * e);
            gy += (leafGrid(lf, lf.height, X + ox, Y + oy + e) - leafGrid(lf, lf.height, X + ox, Y + oy - e)) / (2 * e);
        }
        gx /= pts.length; gy /= pts.length;
        if (press.leaf === lf && press.depth > 0.01) {
            const dx = X - press.x, dy = Y - press.y, s2 = press.sigma * press.sigma;
            const e2 = Math.exp(-(dx * dx + dy * dy) / (2 * s2));
            gx += press.depth * e2 * dx / s2; gy += press.depth * e2 * dy / s2;
        }
        // the tilt of the phone (and the tip of a stalked leaf), turned into this leaf's frame
        const wx = -Math.sin((tiltX + keyTX) * TILT_DEG * Math.PI / 180) + lf.slope[0];
        const wy = -Math.sin((tiltY + keyTY) * TILT_DEG * Math.PI / 180) + lf.slope[1];
        gx += lf.R[0] * wx + lf.R[2] * wy; gy += lf.R[1] * wx + lf.R[3] * wy;
        return [gx, gy];
    }

    function rollSpecks(d, dx, dy) {
        const dist = Math.hypot(dx, dy); if (!d.specks.length || dist < 1e-6) return;
        const ang = dist / Math.max(shape(d.R).a, 0.3);
        const kx = -dy / dist, ky = dx / dist, c = Math.cos(ang), s = Math.sin(ang);
        for (const p of d.specks) {
            const kv = kx * p.u + ky * p.v;
            const cx = ky * p.w, cy = -kx * p.w, cz = kx * p.v - ky * p.u;
            p.u = p.u * c + cx * s + kx * kv * (1 - c);
            p.v = p.v * c + cy * s + ky * kv * (1 - c);
            p.w = p.w * c + cz * s;
        }
    }
    function absorbSpecks(d, a) {
        for (const p of d.lf.specks) {
            if (!p.free) continue;
            const dx = p.x - d.x, dy = p.y - d.y;
            if (dx * dx + dy * dy < a * a * 0.8) {
                p.free = false;
                const l = Math.min(1, Math.hypot(dx, dy) / a);
                d.specks.push({ u: dx / a, v: dy / a, w: -Math.sqrt(Math.max(0, 1 - l * l)), s: p.s });
            }
        }
    }

    function merge(A, B) {
        const VA = A.R ** 3, VB = B.R ** 3, V = VA + VB;
        const big = VA >= VB ? A : B, small = big === A ? B : A;
        const ang = Math.atan2(small.y - big.y, small.x - big.x);
        big.x = (A.x * VA + B.x * VB) / V; big.y = (A.y * VA + B.y * VB) / V;
        big.vx = (A.vx * VA + B.vx * VB) / V; big.vy = (A.vy * VA + B.vy * VB) / V;
        const Rs = small.R;
        big.R = Math.cbrt(V); big.grew = true;
        for (const p of small.specks) big.specks.push(p);
        if (big.specks.length > 40) big.specks.splice(0, big.specks.length - 40);
        const Rm = big.R * 1e-3;
        const fPhys = Math.sqrt(8 * 0.072 / (1000 * Rm * Rm * Rm)) / (2 * Math.PI);
        big.sh = Math.min(0.32, 0.36 * Math.pow(Rs / big.R, 1.2)) + big.sh * 0.5;
        big.shT = 0; big.shAx = ang; big.shF = clamp(fPhys / 4, 7, 15); big.shTau = 0.07 + 0.03 * big.R;
        if (big.R > 2.4) { big.lobeAng = ang; big.lobeAmp = Math.min(0.24, 0.55 * Rs / big.R + big.lobeAmp * 0.5); }
        big.stuck = false;
        if (big.held || small.held) { big.held = true; if (pointer && pointer.drop === small) pointer.drop = big; }
        small.dead = true;
        if (Rs > 0.45) emit('merge', { r: +big.R.toFixed(2) });
    }

    function stepLeaf(lf, dt) {
        const drops = lf.drops;
        for (const d of drops) {
            if (d.dead) continue;
            const sh = shape(d.R);
            d.t += dt;
            if (d.sh > 0) { d.shT += dt; if (d.shT > d.shTau * 6) d.sh = 0; }
            if (d.lobeAmp > 0) { d.lobeAmp *= Math.exp(-dt / 2.2); if (d.lobeAmp < 0.004) d.lobeAmp = 0; }
            if (d.phase === 'impact') {
                // spread to a pancake, pull back, a small real rebound, settle (stretched x3 to be seen)
                const T1 = 0.075, T2 = 0.13;
                if (d.t < T1) { const u = d.t / T1; d.squash = 1 + 0.8 * Math.sin(Math.PI * u) * (1 - 0.3 * u); }
                else if (d.t < T1 + T2) { const u = (d.t - T1) / T2; d.squash = 1 - 0.12 * Math.sin(Math.PI * u) * (1 - u); d.z = sh.b * 0.9 * 4 * u * (1 - u); }
                else { d.phase = 'rest'; d.z = 0; d.squash = 1; d.stuck = false; d.sh = 0.12; d.shT = 0; d.shAx = rand() * 3; d.shF = 13; d.shTau = 0.07; }
                continue;
            }
            const [gx, gy] = slopeAt(lf, d.x, d.y, sh.a);
            let fx = -ROLL * G * gx, fy = -ROLL * G * gy;
            const pin = G * Math.sin(clamp(PIN_ANGLE * (1.2 / d.R) ** 2, 1.2, 40) * Math.PI / 180) * ROLL;
            if (d.held && pointer) {
                const kx = 160, cx = 2 * Math.sqrt(kx);
                fx = kx * (pointer.mx - d.x) - cx * d.vx; fy = kx * (pointer.my - d.y) - cx * d.vy;
                d.stuck = false;
            }
            const f = Math.hypot(fx, fy);
            if (d.stuck) { if (f > pin * 1.05) d.stuck = false; else continue; }
            const sp = Math.hypot(d.vx, d.vy);
            const drag = DRAG + 2.5 * clamp((sh.p - 2) / 6);
            let ax = fx - drag * d.vx, ay = fy - drag * d.vy;
            if (sp > 1e-3 && !d.held) { ax -= 0.35 * pin * d.vx / sp; ay -= 0.35 * pin * d.vy / sp; }
            d.vx += ax * dt; d.vy += ay * dt;
            if (!d.held && Math.hypot(d.vx, d.vy) < 2.5 && f < pin) { d.vx = d.vy = 0; d.stuck = true; continue; }
            const ox = d.x, oy = d.y;
            d.x += d.vx * dt; d.y += d.vy * dt;
            rollSpecks(d, d.x - ox, d.y - oy);
            absorbSpecks(d, sh.a);
            if (leafMask(lf, d.x, d.y) < 0.5) {
                // over the edge: it falls from here, onto a leaf below or into the pond
                const [px, py] = leafToPond(lf, d.x, d.y);
                const vx = lf.persp * (lf.A[0] * d.vx + lf.A[1] * d.vy), vy = lf.persp * (lf.A[2] * d.vx + lf.A[3] * d.vy);
                falling.push({ x: px, y: py, vx, vy, z: lf.h - 0.5, vz: -40, R: d.R, from: lf });
                d.dead = true; d.held = false;
                if (pointer && pointer.drop === d) pointer.drop = null;
                emit('runoff', { r: +d.R.toFixed(2) });
            }
        }
        // merging: beads touch at their equators
        for (let i = 0; i < drops.length; i++) {
            const A = drops[i]; if (A.dead || A.phase === 'impact') continue;
            const aA = shape(A.R).a;
            for (let j = i + 1; j < drops.length; j++) {
                const B = drops[j]; if (B.dead || B.phase === 'impact' || A.dead) continue;
                if (A.stuck && B.stuck && !A.grew && !B.grew) continue;
                const aB = shape(B.R).a;
                const dx = A.x - B.x, dy = A.y - B.y, rr = (aA + aB) * 0.96;
                if (dx * dx + dy * dy < rr * rr) merge(A, B);
            }
        }
        for (let i = drops.length - 1; i >= 0; i--) { if (drops[i].dead) drops.splice(i, 1); else drops[i].grew = false; }
        // sway: a damped spring
        const s = lf.sway, k = 55, c = 2 * Math.sqrt(k) * 0.2;
        s.vx += (-k * s.x - c * s.vx) * dt; s.vy += (-k * s.y - c * s.vy) * dt;
        s.x += s.vx * dt; s.y += s.vy * dt;
    }

    function step(dt) {
        if (tilt.active) { tiltX = tilt.x; tiltY = tilt.y; }
        keyTX += (keyHold.x * 0.4 - keyTX) * (1 - Math.exp(-dt / 0.25));
        keyTY += (keyHold.y * 0.4 - keyTY) * (1 - Math.exp(-dt / 0.25));
        const k = 90, c = 2 * Math.sqrt(k) * 0.95;
        press.v += (k * (press.target - press.depth) - c * press.v) * dt;
        press.depth = Math.max(0, press.depth + press.v * dt);
        for (const lf of leaves) if (!lf.bud) stepLeaf(lf, dt);
        // falling drops: past each leaf's height, onto the first one under them, else the pond
        for (let i = falling.length - 1; i >= 0; i--) {
            const f = falling[i];
            f.vz -= G * FALL * dt;
            const z1 = f.z + f.vz * dt;
            f.x += f.vx * dt; f.y += f.vy * dt;
            let done = false;
            for (let j = byHeight.length - 1; j >= 0 && !done; j--) {
                const lf = byHeight[j];
                if (lf.bud) continue;
                if (lf === f.from && lf.h === 0) continue;
                if (!(lf.h < f.z && lf.h >= z1) && !(lf.h === 0 && z1 <= 0 && f.z > -0.01)) continue;
                const [X, Y] = pondToLeaf(lf, f.x, f.y);
                if (leafMask(lf, X, Y) > 0.6) { land(lf, X, Y, f.R); done = true; }
            }
            if (!done && z1 <= 0) {
                if (opt.water !== 'wash' || pondAt(f.x, f.y) > 0.15) ring(f.x, f.y, f.R);
                done = true;
            }
            if (done) falling.splice(i, 1); else f.z = z1;
        }
        for (let i = rings.length - 1; i >= 0; i--) { rings[i].t += dt; if (rings[i].t > 1.6) rings.splice(i, 1); }
        const target = SAT0 + (SAT1 - SAT0) * clamp(landed / (totalArea * 0.06));
        satNow += (target - satNow) * (1 - Math.exp(-dt / 1.6));
    }

    function busy() {
        if (pointer || press.depth > 0.02 || Math.abs(press.v) > 0.05) return true;
        if (Math.abs(keyTX) > 0.002 || Math.abs(keyTY) > 0.002 || keyHold.x || keyHold.y) return true;
        if (shower.left > 0 || falling.length || rings.length) return true;
        const target = SAT0 + (SAT1 - SAT0) * clamp(landed / (totalArea * 0.06));
        if (Math.abs(target - satNow) > 0.003) return true;
        for (const lf of leaves) {
            if (Math.abs(lf.sway.x) + Math.abs(lf.sway.y) + Math.abs(lf.sway.vx) * 0.1 + Math.abs(lf.sway.vy) * 0.1 > 0.02) return true;
            for (const d of lf.drops) if (!d.stuck || d.phase !== 'rest' || d.sh > 0 || d.lobeAmp > 0) return true;
        }
        return false;
    }

    // ── layout ──────────────────────────────────────────────────────────────
    let W = 0, H = 0, dpr = 1, pxmm = 1;
    function layoutCanvas() {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return false;
        W = r.width; H = r.height;
        dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
        buildPond();
        pxmm = W / pondW;
        return true;
    }

    // ── drawing ─────────────────────────────────────────────────────────────
    const water = [0.86, 0.89, 0.87];
    const paper = (() => {
        const c = getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g);
        return c && c.length >= 3 ? c.slice(0, 3).map((v) => v / 255) : [0.953, 0.941, 0.91];
    })();
    let nv = 0;
    function pushQuad(cx, cy, a, b, p, sh, ax, z, op, half, ox, oy, e0 = 0, e1 = 0, e2 = 0, e3 = 0) {
        const corners = [-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1];
        for (let k = 0; k < 6; k++) {
            const o = nv * FLOATS;
            vdata[o] = corners[k * 2]; vdata[o + 1] = corners[k * 2 + 1];
            vdata[o + 2] = cx; vdata[o + 3] = cy; vdata[o + 4] = a; vdata[o + 5] = b;
            vdata[o + 6] = p; vdata[o + 7] = sh; vdata[o + 8] = ax; vdata[o + 9] = z;
            vdata[o + 10] = op; vdata[o + 11] = half; vdata[o + 12] = ox; vdata[o + 13] = oy;
            vdata[o + 14] = e0; vdata[o + 15] = e1; vdata[o + 16] = e2; vdata[o + 17] = e3;
            nv++;
        }
    }
    function flush(prog, setup) {
        if (!nv) return;
        gl.useProgram(prog.p);
        gl.bindBuffer(gl.ARRAY_BUFFER, vbuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, vdata.subarray(0, nv * FLOATS));
        const S = FLOATS * 4;
        for (const [n, sz, off] of [['aCorner', 2, 0], ['aA', 4, 2], ['aB', 4, 6], ['aC', 4, 10], ['aE', 4, 14]]) {
            const l = gl.getAttribLocation(prog.p, n); if (l < 0) continue;
            gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, sz, gl.FLOAT, false, S, off * 4);
        }
        gl.uniform2f(prog.u.uView, W, H);
        if (prog.u.uDpr) gl.uniform1f(prog.u.uDpr, dpr);
        if (setup) setup(prog);
        gl.drawArrays(gl.TRIANGLES, 0, nv);
        for (const n of ['aCorner', 'aA', 'aB', 'aC', 'aE']) { const l = gl.getAttribLocation(prog.p, n); if (l >= 0) gl.disableVertexAttribArray(l); }
        nv = 0;
    }
    function rect(prog, x, y, w, h) {
        gl.useProgram(prog.p);
        gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        const l = gl.getAttribLocation(prog.p, 'aPos');
        gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 2, gl.FLOAT, false, 0, 0);
        gl.uniform2f(prog.u.uView, W, H);
        gl.uniform4f(prog.u.uRect, x, y, w, h);
    }
    const unrect = (prog) => gl.disableVertexAttribArray(gl.getAttribLocation(prog.p, 'aPos'));
    const pxOf = (x, y) => [x * pxmm, y * pxmm];
    const navPx = (lf) => [lf.X0 * pxmm + lf.sway.x, lf.Y0 * pxmm + lf.sway.y];
    // canvas px -> image uv for a leaf, as a 2x2 (row-major) about its navel
    function uvMatrix(lf) {
        const s = 1 / (pxmm * lf.persp);
        return [lf.Ai[0] * s / lf.imgMM, lf.Ai[1] * s / lf.imgMM, lf.Ai[2] * s / lf.imgMMh, lf.Ai[3] * s / lf.imgMMh];
    }
    function leafUniforms(prog, lf) {
        const u = prog.u;
        gl.uniform1i(u.uLeaf, 0);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, lf ? lf.k.tex : kinds[0].tex);
        gl.uniform1f(u.uNone, lf ? 0 : 1);
        if (lf) {
            const m = uvMatrix(lf), [cx, cy] = navPx(lf);
            gl.uniformMatrix2fv(u.uM, false, new Float32Array([m[0], m[2], m[1], m[3]]));
            gl.uniform2f(u.uC, cx, cy);
            gl.uniform2f(u.uNav, lf.k.nav[0], lf.k.nav[1]);
            gl.uniform1f(u.uHue, lf.def.hue || 0);
            gl.uniform1f(u.uLit, lf.lit);
            gl.uniform3f(u.uCup, lf.cup[0], lf.cup[1], lf.cup[2] / (pxmm * pondW));
            if (press.leaf === lf) {
                const [px, py] = pxOf(...leafToPond(lf, press.x, press.y));
                gl.uniform4f(u.uPress, px, py, press.depth * pxmm * lf.persp * 0.9, press.sigma * pxmm * lf.persp);
            } else gl.uniform4f(u.uPress, 0, 0, 0, 10);
        }
        gl.uniform1f(u.uSat, lf && lf.bud ? Math.min(1, satNow + 0.3) : satNow);   // the bud: the one touch of colour
        const bl = opt.water === 'wash' ? water.map((w, i) => w * 0.5 + paper[i] * 0.5) : paper;
        gl.uniform3f(u.uBelow, bl[0], bl[1], bl[2]);
    }
    // the shadows cast onto a surface at height h by every leaf above it
    function casterUniforms(prog, h, strength) {
        const u = prog.u;
        gl.uniform1i(u.uShade0, 1); gl.uniform1i(u.uShade1, 2); gl.uniform1i(u.uShade2, 4);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, kinds[0].shade);
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, kinds[Math.min(1, kinds.length - 1)].shade);
        gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, kinds[Math.min(2, kinds.length - 1)].shade);
        const KM = new Float32Array(32), KC = new Float32Array(32), KP = new Float32Array(32);
        let n = 0;
        for (const lf of byHeight) {
            if (lf.h <= h && !(h < 0)) continue;
            if (n >= 8) break;
            const dh = lf.h - Math.max(h, 0) + (h < 0 ? 0.8 : 0);
            const m = uvMatrix(lf), [cx, cy] = navPx(lf);
            const off = dh * SHADOW * pxmm;
            KM.set(m, n * 4);
            // the shadow's own shape: the leaf's uv about a moved navel (the image was inset by 6/256 in the shadow map)
            KC.set([cx + AWAY[0] * off, cy + AWAY[1] * off, lf.k.nav[0], lf.k.nav[1]], n * 4);
            const sizePx = lf.imgMM * lf.persp * pxmm, texel = sizePx / 176, blur = 1.6 + dh * 0.1 * pxmm;
            KP.set([kinds.indexOf(lf.k), clamp(Math.log2(blur / texel), 0, 4), strength * (h < 0 ? 1 : clamp(0.55 - dh * 0.0015, 0.3, 0.55)), 0], n * 4);
            n++;
        }
        gl.uniform4fv(u['uKM[0]'], KM); gl.uniform4fv(u['uKC[0]'], KC); gl.uniform4fv(u['uKP[0]'], KP);
        gl.uniform1i(u.uNK, n);
    }
    function leafBox(lf) {
        const k = lf.k, xs = [], ys = [];
        for (const [X, Y] of [[-lf.navX, -lf.navY], [lf.imgMM - lf.navX, -lf.navY], [-lf.navX, lf.imgMMh - lf.navY], [lf.imgMM - lf.navX, lf.imgMMh - lf.navY]]) {
            const [x, y] = pxOf(...leafToPond(lf, X, Y)); xs.push(x); ys.push(y);
        }
        const x0 = Math.max(0, Math.min(...xs) - 2), y0 = Math.max(0, Math.min(...ys) - 2);
        return [x0, y0, Math.min(W, Math.max(...xs) + 2) - x0, Math.min(H, Math.max(...ys) + 2) - y0];
    }

    function dropGeom(d) {
        const sh = shape(d.R);
        let a = sh.a, b = sh.b;
        if (d.squash !== 1) { a *= d.squash; b /= d.squash * d.squash; }
        let s = 0;
        if (d.sh > 0) s = d.sh * Math.exp(-d.shT / d.shTau) * Math.cos(2 * Math.PI * d.shF * d.shT);
        return { a, b, p: sh.p, s };
    }
    function drawFalling(lo, hi) {
        for (const f of falling) {
            if (!(f.z > lo && f.z <= hi)) continue;
            const sh = shape(f.R), persp = 1 + f.z / PERSP;
            const [x, y] = pxOf(f.x, f.y);
            const a = Math.max(sh.a * pxmm * persp, 1.3), b = sh.b * pxmm * persp * a / Math.max(sh.a * pxmm * persp, 1e-3);
            pushQuad(x, y, a, b, 2, 0, 0, 0, 1, a * 1.1 + 2, 0, 0, 1 - smooth(0.6, 1.5, f.R), 0, 0, 0);
        }
        flush(progBody, (p) => leafUniforms(p, null));
    }

    function draw() {
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        // the pond
        rect(progWater, 0, 0, W, H);
        gl.uniform1i(progWater.u.uPond, 3);
        gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, texPond);
        gl.uniform3f(progWater.u.uWater, water[0], water[1], water[2]);
        gl.uniform2f(progWater.u.uStage, W, H);
        const RG = new Float32Array(48);
        rings.forEach((r, i) => {
            const rad = (60 * r.t / (1 + r.t * 1.6) + 0.8) * pxmm;          // capillary rings slow as they spread, and soon die
            RG.set([r.x * pxmm, r.y * pxmm, rad, r.s * Math.exp(-r.t / 0.45)], i * 4);
        });
        gl.uniform4fv(progWater.u['uRings[0]'], RG); gl.uniform1i(progWater.u.uNR, rings.length);
        gl.uniform1f(progWater.u.uWash, opt.water === 'wash' ? 1 : 0);
        casterUniforms(progWater, -1, 0.6);
        gl.drawArrays(gl.TRIANGLES, 0, 6); unrect(progWater);
        drawFalling(-1e9, byHeight.length ? byHeight[0].h - 1e-6 : 1e9);

        byHeight.forEach((lf, li) => {
            // the leaf, with the shadows of the leaves above it
            const [bx, by, bw, bh] = leafBox(lf);
            rect(progLeaf, bx, by, bw, bh);
            leafUniforms(progLeaf, lf);
            casterUniforms(progLeaf, lf.h, 0.24);
            gl.drawArrays(gl.TRIANGLES, 0, 6); unrect(progLeaf);
            const pl = pxmm * lf.persp;
            const geo = lf.drops.map(dropGeom);
            const pos = lf.drops.map((d) => pxOf(...leafToPond(lf, d.x, d.y)));
            // its beads' shadows and caustics
            lf.drops.forEach((d, i) => {
                const g = geo[i], [x, y] = pos[i];
                const a = g.a * pl, b = g.b * pl, z = Math.max(0, d.z) * pl;
                const off = (b * 0.84 + z * 0.84) * 0.6;
                pushQuad(x, y, a, b, g.p, g.s, d.shAx, z, 1, a * 1.4 + b * 0.5 + off + 3, 0.643 * off, 0.766 * off);
            });
            gl.blendFuncSeparate(gl.DST_COLOR, gl.SRC_ALPHA, gl.ZERO, gl.ONE);
            flush(progShadow);
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            // its dust
            for (const s of lf.specks) if (s.free) { const [x, y] = pxOf(...leafToPond(lf, s.x, s.y)); const r = Math.max(0.5, s.s * pl); pushQuad(x, y, r, 0, 0, 0, 0, 0, 0.8, r + 1.5, 0, 0); }
            flush(progSpeck);
            // its beads, the tiniest kept legible as points of silver
            const order = lf.drops.map((d, i) => i).sort((i, j) => lf.drops[j].R - lf.drops[i].R);
            for (const i of order) {
                const d = lf.drops[i], g = geo[i], [x, y] = pos[i];
                const a0 = g.a * pl, a = Math.max(a0, 1.3), b = g.b * pl * a / a0;
                pushQuad(x, y, a, b, g.p, g.s, d.shAx, Math.max(0, d.z) * pl, 1, a * (1 + Math.abs(g.s) + d.lobeAmp + 0.12) * 1.05 + 2, 0, 0,
                    1 - smooth(0.6, 1.5, d.R), d.seed, d.lobeAng, d.lobeAmp);
            }
            flush(progBody, (p) => leafUniforms(p, lf));
            // the specks they carry
            lf.drops.forEach((d, i) => {
                if (!d.specks.length) return;
                const [x, y] = pos[i], a = geo[i].a * pl;
                for (const p of d.specks) {
                    const r = Math.max(0.45, p.s * pl * (p.w > 0 ? 1 : 1.25)), k = p.w > 0 ? 0.92 : 0.8;
                    pushQuad(x + p.u * a * k, y + p.v * a * k, r, 0, 0, p.w > 0 ? 0 : 1, 0, 0, p.w > 0 ? 0.8 : 0.45, r + 1.5, 0, 0);
                }
            });
            flush(progSpeck);
            const next = byHeight[li + 1];
            drawFalling(lf.h - 1e-6, next ? next.h - 1e-6 : 1e9);
        });
    }

    // ── loop ────────────────────────────────────────────────────────────────
    let last = 0;
    function frame(t) {
        raf = 0;
        if (dead || !ready) return;
        const dt = last ? Math.min(0.05, (t - last) / 1000) : 1 / 60;
        last = t;
        const n = Math.ceil(dt / (1 / 240));
        for (let i = 0; i < n; i++) step(dt / n);
        draw();
        if (visible && !document.hidden && busy()) raf = requestAnimationFrame(frame);
        else last = 0;
    }
    function kick() { if (!raf && ready && !dead && !reduced) raf = requestAnimationFrame(frame); }

    // ── rain ────────────────────────────────────────────────────────────────
    function rainSpot() {
        if (rand() < 0.82) {
            // mostly onto the leaves (they are most of what the eye is on), weighted by area
            let r = rand() * totalArea;
            for (const lf of leaves) {
                if (lf.bud) continue;
                r -= Math.PI * (lf.span / 2) ** 2;
                if (r <= 0) { const t = rand() * 6.283, q = Math.sqrt(rand()) * lf.span * 0.5; return leafToPond(lf, Math.cos(t) * q, Math.sin(t) * q); }
            }
        }
        for (let k = 0; k < 40; k++) { const x = rand() * pondW, y = rand() * pondH; if (pondAt(x, y) > 0.6) return [x, y]; }
        return [pondW / 2, pondH / 2];
    }
    function dropOne(R) {
        let n = 0; for (const lf of leaves) n += lf.drops.length;
        if (n >= MAX_DROPS) return;
        const [x, y] = rainSpot();
        const top = byHeight.length ? byHeight[byHeight.length - 1].h : 0;
        falling.push({ x, y, vx: 0, vy: 0, z: top + 25, vz: -900, R: R || rainSize(), from: null });
        kick();
    }
    function scheduleRain() {
        clearTimeout(rainTimer);
        if (!visible || document.hidden || reduced || dead) return;
        if (shower.left > 0) {
            // a light shower: several drops a frame at its height, thinning out at the end
            rainTimer = setTimeout(() => {
                const k = Math.max(1, Math.round(shower.total / 240 * (0.5 + rand())));
                for (let i = 0; i < k && shower.left > 0; i++) { shower.left--; dropOne(); }
                scheduleRain();
            }, 20 + rand() * 40);
            return;
        }
        if (emptied) {
            emptied = false;
            rainTimer = setTimeout(() => { shower.left = shower.total = Math.round(showerSize() * 0.4); scheduleRain(); }, 3500);
            return;
        }
        if (opt.rain > 0 && rainLeft > 0) {
            rainTimer = setTimeout(() => { rainLeft--; dropOne(); scheduleRain(); }, opt.rain * (0.6 + rand() * 0.8));
        }
    }
    const showerSize = () => opt.shower > 0 ? opt.shower : Math.round(clamp(totalArea / 95, 120, 1000));

    // ── the still arrangement (reduced motion) ──────────────────────────────
    function settleOffline() {
        const n = showerSize();
        for (let k = 0; k < n; k++) {
            const [x, y] = rainSpot(), hit = leafAtPond(x, y);
            if (!hit) continue;
            const d = makeDrop(hit[0], hit[1], hit[2], rainSize()); d.stuck = false; landed += 4.19 * d.R ** 3; splash(d);
        }
        for (let i = 0; i < 6 * 240; i++) step(1 / 240);
        falling.length = 0; rings.length = 0;
        for (const lf of leaves) { lf.sway = { x: 0, y: 0, vx: 0, vy: 0 }; for (const d of lf.drops) { d.sh = 0; d.phase = 'rest'; d.z = 0; d.lobeAmp = 0; } }
        satNow = SAT1;
    }

    // ── input ───────────────────────────────────────────────────────────────
    const local = (e) => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) / pxmm, (e.clientY - r.top) / pxmm]; };
    on(el, 'pointerdown', (e) => {
        if (!ready || e.button > 0 || reduced) return;
        const [x, y] = local(e);
        const hit = leafAtPond(x, y);
        if (!hit) { if (opt.water !== 'wash' || pondAt(x, y) > 0.3) { ring(x, y, 1.6); kick(); } return; }
        const [lf, X, Y] = hit;
        let best = null, bd = 1e9;
        for (const d of lf.drops) {
            if (d.phase !== 'rest') continue;
            const a = shape(d.R).a, q = Math.hypot(d.x - X, d.y - Y);
            if (q < a + 5 / (pxmm * lf.persp) && q - a < bd) { bd = q - a; best = d; }
        }
        pointer = { id: e.pointerId, lf, mx: X, my: Y, drop: best, mode: best ? 'drag' : 'press' };
        if (best) { best.held = true; best.stuck = false; }
        else { press.leaf = lf; press.x = X; press.y = Y; press.target = 4.5; press.sigma = lf.span * 0.08; }
        try { el.setPointerCapture(e.pointerId); } catch (_) {}
        kick();
    });
    on(el, 'pointermove', (e) => {
        if (!pointer || e.pointerId !== pointer.id) return;
        const [X, Y] = pondToLeaf(pointer.lf, ...local(e));
        pointer.mx = X; pointer.my = Y;
        if (pointer.mode === 'press') { press.x += (X - press.x) * 0.5; press.y += (Y - press.y) * 0.5; }
        kick();
    });
    const release = (e) => {
        if (!pointer || (e && e.pointerId !== pointer.id)) return;
        for (const lf of leaves) for (const d of lf.drops) d.held = false;
        press.target = 0; pointer = null; kick();
    };
    on(el, 'pointerup', release); on(el, 'pointercancel', release); on(el, 'lostpointercapture', release);
    on(el, 'contextmenu', (e) => { if (pointer) e.preventDefault(); });
    on(el, 'dragstart', (e) => e.preventDefault());   // a mouse drag must not pick up an <img>
    imgs.forEach((im) => { im.draggable = false; });
    const keys = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    on(el, 'keydown', (e) => {
        if (keys[e.key]) { const [kx, ky] = keys[e.key]; if (kx) keyHold.x = kx; if (ky) keyHold.y = ky; e.preventDefault(); kick(); }
        else if ((e.key === 'Enter' || e.key === ' ') && !reduced) { for (let i = 0; i < 6; i++) dropOne(); e.preventDefault(); }
    });
    on(el, 'keyup', (e) => { if (keys[e.key]) { if (keys[e.key][0]) keyHold.x = 0; if (keys[e.key][1]) keyHold.y = 0; kick(); } });
    // the visitor has tipped every leaf clear: after a moment another light shower
    on(el, 'lotus-leaf:runoff', () => {
        if (shower.left > 0 || emptied) return;
        let n = 0; for (const lf of leaves) for (const d of lf.drops) if (d.R > 0.55) n++;
        if (n <= 3) { emptied = true; scheduleRain(); }
    });

    // ── start ───────────────────────────────────────────────────────────────
    let ready = false;
    function start() {
        if (dead || ready) return;
        if (!imgs.every((im) => im.complete && im.naturalWidth)) return;
        kinds.forEach(buildKind);
        if (!layoutCanvas()) return;
        if (reduced) settleOffline();
        ready = true;
        el.classList.add('is-live');
        if (!el.hasAttribute('tabindex') && !reduced) el.tabIndex = 0;
        if (!el.hasAttribute('aria-label')) el.setAttribute('aria-label', reduced ? 'Lotus leaves in a pond, with beads of water resting on them' : 'Lotus leaves in a pond, with beads of water. Arrow keys tip the leaves; Enter lets a few drops fall.');
        el.setAttribute('role', 'img');
        draw();
        if (visible) onVisible();
    }
    function onVisible() {
        if (!ready) return;
        if (!started && !reduced) { started = true; shower.left = shower.total = showerSize(); }
        scheduleRain(); kick();
        if (!tiltTimer) tiltTimer = setInterval(() => {
            if (!tilt.active || !visible || document.hidden) return;
            if (Math.abs(tilt.x - tiltX) > 0.004 || Math.abs(tilt.y - tiltY) > 0.004) kick();
        }, 120);
    }
    function onHidden() { clearTimeout(rainTimer); clearInterval(tiltTimer); tiltTimer = 0; if (raf) cancelAnimationFrame(raf); raf = 0; last = 0; }

    imgs.forEach((im) => { if (!(im.complete && im.naturalWidth)) on(im, 'load', start); });
    start();
    io = new IntersectionObserver((en) => {
        for (const e of en) { const v = e.isIntersecting && e.intersectionRatio > 0.15; if (v !== visible) { visible = v; v ? onVisible() : onHidden(); } }
    }, { threshold: [0, 0.15, 0.4] });
    io.observe(el);
    on(document, 'visibilitychange', () => { if (document.hidden) onHidden(); else if (visible) onVisible(); });
    let rsT = 0;
    const ro = new ResizeObserver(() => { clearTimeout(rsT); rsT = setTimeout(() => { if (ready && layoutCanvas()) draw(); }, 80); });
    ro.observe(el);
    on(canvas, 'webglcontextlost', (e) => { e.preventDefault(); ready = false; el.classList.remove('is-live'); onHidden(); });

    const api = function destroy() {
        dead = true; onHidden(); io.disconnect(); ro.disconnect(); clearTimeout(rsT);
        cleanup.forEach((f) => f());
        canvas.remove(); el.classList.remove('is-live');
        const ext = gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext();
    };
    api.state = () => ({
        leaves: leaves.length, beads: leaves.reduce((s, lf) => s + lf.drops.length, 0),
        perLeaf: leaves.map((lf) => lf.drops.length), pools: leaves.map((lf) => +lf.drops.reduce((m, d) => Math.max(m, d.R), 0).toFixed(1)),
        falling: falling.length, rings: rings.length, sat: +satNow.toFixed(2), running: !!raf,
    });
    api.rain = (n = 1, R) => { for (let i = 0; i < n; i++) dropOne(R); };
    api.tip = (x, y) => { keyHold.x = x; keyHold.y = y; kick(); };
    // for tests: the canvas px of the biggest bead on the highest leaf
    api.bigBead = () => { const lf = byHeight[byHeight.length - 1]; const d = lf.drops.reduce((m, d) => (!m || d.R > m.R ? d : m), null); return d && pxOf(...leafToPond(lf, d.x, d.y)).map(Math.round); };
    return api;
}

function autoStart(el) {
    if (el._lotusLeaf) return;
    el._lotusLeaf = lotusLeaf(el);
}
document.querySelectorAll('[data-lotus-leaf]').forEach(autoStart);
export default lotusLeaf;
