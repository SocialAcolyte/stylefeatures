/*
 *  REEDBED // a common reed (Phragmites australis) bed at dusk that the wind moves.
 *
 *  Markup:  <figure data-reedbed><img src="assets/reedbed-dusk.webp" alt=""></figure>
 *  Or call  reedbed(figure, options)  yourself. Returns destroy(), which also
 *  carries destroy.gust(x, y, dx, dy), destroy.breeze (get/set, m/s) and
 *  destroy.running.
 *
 *  The photograph (a Midjourney dusk plate) is the sky, the mist, the far reeds
 *  and the open water. Over it a few thousand reed stems are drawn with WebGL2,
 *  instanced: culm, leaf blades and the feathery panicle. Each stem is a damped
 *  oscillator (a cantilever with a heavy head) with its own natural frequency,
 *  1-1.8 Hz, driven by a turbulent wind field whose coherent gusts are carried
 *  across the bed at about the canopy-top wind speed. When the gusts arrive at a
 *  rate near the stems' own frequency the stems lock in and bend together, and
 *  the bending runs across the bed as a wave: honami (Py, de Langre & Moulia
 *  2006). The waves are seen because the panicles are backlit: their silky
 *  hairs forward-scatter the low sun, and a panicle tipped towards the line of
 *  sight is seen end-on, through more hair, so it glows brighter.
 *
 *  The same wind field roughens the water. Where a gust touches down it raises
 *  capillary ripples, a cat's-paw: the patch stops mirroring the bright horizon
 *  and reflects the darker sky higher up, so it shows dark and travels with the
 *  gust. The plate's own reeds sway a little with the same field.
 *
 *  The pointer or finger is the wind: drag to blow, faster for a stronger gust.
 *  Tilting a phone turns the prevailing wind. A range input sets the breeze
 *  (m/s, named on the Beaufort scale) for the keyboard and screen readers.
 *
 *  Without WebGL2 a canvas fallback draws fewer stems. Without JS it is the
 *  photograph. Reduced motion: the reeds stand still, leaning in the breeze.
 *  The loop only runs while the band is on screen and the tab is visible; with
 *  data-idle="still" it also stops once the reeds settle.
 */
import tilt from './tilt.js';

const calm = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

/* ---- the plate's camera ----------------------------------------------------
 * Measured from the photograph: horizon (far edge of the water under the mist)
 * at 33.5% of its height, the sun at (49.1%, 30.8%). A pinhole camera 0.55 m
 * above the water with a focal length of 1.1 plate-heights (a ~49 degree
 * vertical field of view) puts the bottom edge of the frame 0.9 m away.
 * Plate coordinates: u across 0..1, v down 0..1; world: X right, Y up, Z away. */
const PLATE = new URL('./assets/reedbed-dusk.webp', import.meta.url).href;
const MASK = new URL('./assets/reedbed-mask.webp', import.meta.url).href;
const ASPECT = 1680 / 720;
const VH = 0.335;
const SUN_U = 0.491, SUN_V = 0.308;
const FOCAL = 1.1;
const CAMH = 0.55;
const ZFOCUS = 2.2;          // where the plate's lens is focused (its sharp panicles)
const APERTURE = 0.045;       // circle of confusion, plate-heights per dioptre
const sunDir = (() => {
    const x = (SUN_U - 0.5) * ASPECT / FOCAL, y = (VH - SUN_V) / FOCAL, l = Math.hypot(x, y, 1);
    return [x / l, y / l, 1 / l];
})();

/* ---- the wind --------------------------------------------------------------
 * A grid over the visible ground (u across, log Z away) holds the wind at
 * canopy top each frame: the mean, a frozen-turbulence field carried along at
 * the convection speed, and travelling gusts (the idle ones, and yours).    */
const GW = 64, GH = 40;
const U0 = -0.1, U1 = 1.1;
const S0 = Math.log(1), S1 = Math.log(220);
const LAMBDA_A = 3.2, LAMBDA_C = 4.5;   // eddy length along / across the wind (m): gust fronts are broad
const INTENSITY = 0.38;                 // turbulence intensity in the canopy, sigma_u / U
const VOGEL = 1.4;                      // drag ~ U^(2 + Vogel number), reconfiguring reeds: V ~ -0.6
const BEAUFORT = [[0.5, 'Calm'], [1.6, 'Light air'], [3.4, 'Light breeze'], [5.5, 'Gentle breeze'],
    [8.0, 'Moderate breeze'], [10.8, 'Fresh breeze'], [99, 'Strong breeze']];

function hash3(i, j, k) {
    let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(k, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h & 0xffff) / 32767.5 - 1;
}
function vnoise(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    let xf = x - xi, yf = y - yi, zf = z - zi;
    xf = xf * xf * (3 - 2 * xf); yf = yf * yf * (3 - 2 * yf); zf = zf * zf * (3 - 2 * zf);
    const a = mix(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), xf);
    const b = mix(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), xf);
    const c = mix(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), xf);
    const d = mix(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), xf);
    return mix(mix(a, b, yf), mix(c, d, yf), zf);
}
const fbm = (x, y, z) => vnoise(x, y, z) * 0.62 + vnoise(x * 2.03 + 5.1, y * 2.03, z * 1.7) * 0.28 + vnoise(x * 4.1, y * 4.1 + 3.3, z * 2.9) * 0.12;

function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* ---- the stems -------------------------------------------------------------
 * Placed on the ground at random, kept off the open water in the middle of the
 * plate, denser in log-depth so the far bed reads as a bed. Beyond ~15 m one
 * drawn stem stands for a small clump, so its head is drawn a little larger. */
function makeStems(scale, seed) {
    const r = rng(seed);
    const out = [];
    // the open water in the middle of the plate, narrowing a little with distance
    const water = (u, Z) => Z < 70 && Math.abs(u - 0.51) < (Z < 6 ? 0.15 : 0.13 - Math.min(0.04, (Z - 6) / 900));
    const add = (n, z0, z1, ranges, inWater, hs = 1) => {
        const span = ranges.reduce((a, [u0, u1]) => a + u1 - u0, 0);
        for (let i = 0, tries = 0; i < n && tries < n * 40; tries++) {
            const Z = z0 * Math.pow(z1 / z0, r());
            let x = r() * span, u = 0;
            for (const [u0, u1] of ranges) { if (x <= u1 - u0) { u = u0 + x; break; } x -= u1 - u0; }
            if (!inWater && water(u, Z)) continue;
            const X = (u - 0.5) * ASPECT * Z / FOCAL;
            // height above the water: the reeds stand in it, shorter at the open edge
            const H = (1.25 + r() * 1.05 + Math.min(0.6, Math.max(0, Z - 10) / 40)) * hs;
            const clump = 1 + Math.max(0, Z - 14) / 26;
            const heavy = r() < 0.16;
            out.push({
                X, Z, H, u, seed: r(),
                f: (1.05 + r() * 0.75) * Math.pow(1.9 / H, 0.8),   // natural frequency, Hz
                zeta: 0.06 + r() * 0.05,
                lean: [(r() - 0.5) * (heavy ? 0.7 : 0.2), (r() - 0.5) * (heavy ? 0.4 : 0.14)],
                diam: (0.005 + r() * 0.004) * Math.sqrt(clump),
                plen: (0.28 + r() * 0.2) * clump,
                pwid: (0.1 + r() * 0.08) * clump,
                naz: r() * Math.PI * 2, nod: 0.55 + r() * 1.0,
                leaves: Z < 13,
            });
            i++;
        }
    };
    const ALL = [[-0.12, 1.12]];
    const n = (k) => Math.max(1, Math.round(k * scale));
    // in front of the lens's focus, soft
    add(n(6), 1.0, 1.6, [[-0.05, 0.3], [0.74, 1.05]], false, 0.9);
    // at the focus, sharp: the stems at the edge of the open water, standing in it
    add(n(11), 1.7, 3.2, [[0.6, 1.05]], false, 0.55);
    add(n(2), 1.7, 3.2, [[-0.05, 0.3]], false, 0.6);
    add(n(2), 1.8, 3.4, [[0.37, 0.44], [0.57, 0.63]], true, 0.55);
    add(n(60), 3.2, 6.5, ALL, false, 0.95);
    add(n(380), 6.5, 18, ALL);
    add(n(1500), 18, 55, ALL);
    out.sort((a, b) => b.Z - a.Z);
    return out;
}

/* ---- GLSL ------------------------------------------------------------------ */
const HEAD = `#version 300 es
precision highp float;
precision highp int;
uniform vec4 uCov;
uniform float uPx;
uniform float uTime;
uniform vec3 uSun;
uniform float uMirror;
uniform highp sampler2D uState;
const float A = ${ASPECT.toFixed(6)};
const float VH = ${VH.toFixed(4)};
const float F = ${FOCAL.toFixed(4)};
const float CAMH = ${CAMH.toFixed(3)};
const float ZF = ${ZFOCUS.toFixed(3)};
const float APER = ${APERTURE.toFixed(4)};
vec2 proj(vec3 P) { return vec2(0.5 + F * P.x / (P.z * A), VH + F * (CAMH - P.y) / P.z); }
vec4 clipOf(vec2 uv, float z) {
  return vec4(uv.x * uCov.x + uCov.y, -(uv.y * uCov.z + uCov.w), clamp(z / 160.0, 0.0, 1.0) * 1.98 - 0.99, 1.0);
}
vec4 stateOf(int i) { return texelFetch(uState, ivec2(i & 127, i >> 7), 0); }
// a cantilever under a load at its head: deflection grows as eta^2 (3 - eta) / 2,
// and the stem keeps its length, so the head drops as it leans
vec3 stemAt(vec3 base, float H, vec2 th, float e) {
  float k2 = dot(th, th);
  float ph = e * e * (3.0 - e) * 0.5;
  float e3 = e * e * e;
  float sh = 1.125 * k2 * (4.0 * e3 / 3.0 - e3 * e + e3 * e * e / 5.0);
  return base + vec3(th.x * H * ph, H * (e - sh), th.y * H * ph);
}
float hg(float c, float g) { float d = 1.0 + g * g - 2.0 * g * c; return (1.0 - g * g) / (d * sqrt(d)); }
// forward scattering of the low sun towards the camera (two-lobe Henyey-Greenstein)
float phaseAt(vec3 P) {
  vec3 V = normalize(P - vec3(0.0, CAMH, 0.0));
  float c = dot(V, uSun);
  return 0.6 * hg(c, 0.7) / hg(1.0, 0.7) + 0.4 * hg(c, 0.3) / hg(1.0, 0.3);
}
float cocAt(float z) { return APER * abs(1.0 / z - 1.0 / ZF); }
vec3 mirrorY(vec3 P) { return uMirror > 0.5 ? vec3(P.x, -P.y, P.z) : P; }
`;

const VS_STEM = HEAD + `
layout(location=0) in vec2 aSeg;
layout(location=1) in vec4 aI0;   // X, Z, H, seed
layout(location=2) in vec4 aI1;   // lean x, lean z, diameter, -
out vec2 vUV; out float vSide; out float vAlpha; out float vPhase; out float vFog; out float vEta; out float vSoft;
void main() {
  vec4 st = stateOf(gl_InstanceID);
  vec2 th = st.xy + aI1.xy;
  vec3 base = vec3(aI0.x, 0.0, aI0.y);
  float e = aSeg.x;
  vec3 P = mirrorY(stemAt(base, aI0.z, th, e));
  vec3 Q = mirrorY(stemAt(base, aI0.z, th, min(e + 0.02, 1.0) - (e > 0.98 ? 0.02 : 0.0)));
  vec2 a = proj(P), b = proj(Q);
  vec2 pa = vec2(a.x * A, a.y), pb = vec2(b.x * A, b.y);
  vec2 t = (e > 0.98) ? normalize(pa - pb) : normalize(pb - pa);
  vec2 n = vec2(-t.y, t.x);
  float w = F * aI1.z * (1.0 - 0.45 * e) / P.z;
  float c = cocAt(P.z);
  float wt = max(w + c, uPx * 1.25);
  vAlpha = clamp((w + 0.3 * uPx) / wt, 0.0, 1.0);
  vSoft = clamp(c / (w + c), 0.0, 1.0);
  pa += n * aSeg.y * wt * 0.5;
  vSide = aSeg.y;
  vEta = e;
  vUV = vec2(pa.x / A, pa.y);
  vPhase = phaseAt(P);
  vFog = 1.0 - exp(-P.z / 26.0);
  gl_Position = clipOf(vUV, P.z);
  if (uMirror > 0.5 && aI0.y > 24.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;

const FS_STEM = `#version 300 es
precision highp float;
uniform sampler2D uPlate; uniform sampler2D uMask; uniform float uMirror; uniform vec3 uSunCol; uniform vec3 uDark; uniform float uDepthOnly;
in vec2 vUV; in float vSide; in float vAlpha; in float vPhase; in float vFog; in float vEta; in float vSoft;
out vec4 o;
void main() {
  float edge = abs(vSide);
  // a defocused stem is a soft-edged smear, not a pane of glass
  float cov = 1.0 - smoothstep(mix(0.55, 0.0, vSoft), 1.0, edge);
  cov *= mix(1.0, 1.6, vSoft) * (1.0 - smoothstep(1.0 - 0.25 * vSoft, 1.0, vEta));
  vec3 col = uDark * (0.8 + 0.4 * vEta);
  col += uSunCol * vPhase * (0.1 + 0.6 * edge * edge) * 0.5 * (1.0 - vSoft);
  vec3 fog = textureLod(uPlate, vUV, 1.5).rgb;
  col = mix(col, fog, vFog);
  float a = cov * vAlpha;
  if (uMirror > 0.5) {
    vec4 m = texture(uMask, vUV);
    a *= m.r * 0.8;
    col *= 0.8;
  }
  // depth pass: only the solid core of a stem or blade hides what is behind it
  if (uDepthOnly > 0.5 && a < 0.55) discard;
  o = vec4(col * a, a);
}`;

const VS_LEAF = HEAD + `
layout(location=0) in vec2 aSeg;
layout(location=1) in vec4 aL0;   // X, Z, H, stem index
layout(location=2) in vec4 aL1;   // eta, azimuth, length, width
layout(location=3) in vec4 aL2;   // lean x, lean z, seed, droop
out vec2 vUV; out float vSide; out float vAlpha; out float vGlow; out float vFog; out float vA; out float vSoft;
void main() {
  vec4 st = stateOf(int(aL0.w));
  vec2 th = st.xy + aL2.xy;
  vec3 base = vec3(aL0.x, 0.0, aL0.y);
  vec3 node = stemAt(base, aL0.z, th, aL1.x);
  vec3 w3 = vec3(st.z, 0.0, st.w);
  float ws = length(w3);
  float q = clamp(ws / 5.5, 0.0, 0.9);
  vec3 d0 = normalize(vec3(cos(aL1.y), 0.42, sin(aL1.y)));
  vec3 wd = ws > 0.01 ? w3 / ws : d0;
  // leaf blades swing round on their sheaths to stream downwind (flagging)
  vec3 dir = normalize(mix(d0, wd + vec3(0.0, 0.12, 0.0), q));
  float a = aSeg.x;
  float sd = aL2.z;
  vec3 side = normalize(cross(dir, vec3(0.0, 1.0, 0.0)) + vec3(1e-4));
  float flut = q * sin(uTime * (5.0 + sd * 4.0) + a * 3.5 + sd * 40.0);
  vec3 P = node + aL1.z * (a * dir + a * a * vec3(0.0, -aL2.w * (1.0 - 0.7 * q), 0.0)) + side * aL1.z * 0.07 * flut * a * a;
  vec3 Q = node + aL1.z * ((a + 0.04) * dir + (a + 0.04) * (a + 0.04) * vec3(0.0, -aL2.w * (1.0 - 0.7 * q), 0.0)) + side * aL1.z * 0.07 * flut * (a + 0.04) * (a + 0.04);
  vec2 pu = proj(P), qu = proj(Q);
  vec2 pa = vec2(pu.x * A, pu.y), pb = vec2(qu.x * A, qu.y);
  vec2 t = normalize(pb - pa + vec2(1e-6));
  vec2 n = vec2(-t.y, t.x);
  // the blade twists as it flutters, so its visible width (and the light through it) changes
  float tw = abs(cos(sd * 6.28 + q * 1.3 * sin(uTime * (3.0 + sd * 2.0) + sd * 17.0)));
  float shape = a < 0.12 ? a / 0.12 : pow(max(0.0, (1.0 - a) / 0.88), 0.8);
  float w = F * aL1.w * shape * (0.25 + 0.75 * tw) / P.z;
  float c = cocAt(P.z);
  float wt = max(w + c, uPx * 1.1);
  vAlpha = clamp((w + 0.2 * uPx) / wt, 0.0, 1.0) * smoothstep(0.0, 0.05, shape);
  vSoft = clamp(c / (w + c), 0.0, 1.0);
  pa += n * aSeg.y * wt * 0.5;
  vSide = aSeg.y; vA = a;
  vUV = vec2(pa.x / A, pa.y);
  vGlow = phaseAt(P) * (0.3 + 0.7 * tw);
  vFog = 1.0 - exp(-P.z / 26.0);
  gl_Position = clipOf(vUV, P.z - 0.01);
}`;

const FS_LEAF = `#version 300 es
precision highp float;
uniform sampler2D uPlate; uniform vec3 uSunCol; uniform vec3 uDark; uniform float uDepthOnly;
in vec2 vUV; in float vSide; in float vAlpha; in float vGlow; in float vFog; in float vA; in float vSoft;
out vec4 o;
void main() {
  float cov = (1.0 - smoothstep(mix(0.5, 0.0, vSoft), 1.0, abs(vSide))) * mix(1.0, 1.5, vSoft);
  vec3 col = uDark * vec3(1.0, 1.06, 0.9) + uSunCol * vec3(0.95, 0.8, 0.45) * vGlow * 0.42 * (0.6 + 0.4 * vA);
  col = mix(col, textureLod(uPlate, vUV, 2.5).rgb, vFog);
  float a = cov * vAlpha;
  // depth pass: only the solid core of a stem or blade hides what is behind it
  if (uDepthOnly > 0.5 && a < 0.55) discard;
  o = vec4(col * a, a);
}`;

const VS_PLUME = HEAD + `
layout(location=0) in vec2 aSeg;
layout(location=1) in vec4 aI0;   // X, Z, H, seed
layout(location=2) in vec4 aI1;   // lean x, lean z, diameter, -
layout(location=3) in vec4 aP;    // length, width, nod azimuth, nod amount
out vec2 vUV; out vec2 vAB; out float vAlpha; out float vGlow; out float vFog; out float vSoft; out float vSeed; out float vPhase; out float vComb;
vec3 axisAt(vec3 tip, vec3 t3, vec3 bend, float L, float a) {
  return tip + L * (a * t3 + 0.8 * a * a * bend) / (1.0 + 0.3 * length(bend));
}
void main() {
  vec4 st = stateOf(gl_InstanceID);
  vec2 th = st.xy + aI1.xy;
  vec3 base = vec3(aI0.x, 0.0, aI0.y);
  vec3 tip = stemAt(base, aI0.z, th, 1.0);
  vec3 t3 = normalize(tip - stemAt(base, aI0.z, th, 0.96));
  vec3 w3 = vec3(st.z, 0.0, st.w);
  float ws = length(w3);
  float sd = aI0.w;
  vec3 nodDir = vec3(cos(aP.z), 0.0, sin(aP.z));
  // the panicle nods to one side under its own weight and streams downwind;
  // its branches flutter faster than the stem sways
  vec3 bend = nodDir * aP.w * 1.3 + vec3(0.0, -0.95 * aP.w, 0.0) + w3 * 0.09;
  bend += (ws > 0.01 ? w3 / ws : nodDir) * 0.05 * min(ws, 8.0) * sin(uTime * (7.0 + sd * 5.0) + sd * 50.0);
  float a = aSeg.x;
  // wind combs the panicle out: longer, narrower, its silk streaming and parted
  float comb = smoothstep(2.0, 8.0, ws);
  vComb = comb;
  float L = aP.x * (1.0 + 0.22 * comb);
  vec3 P = axisAt(tip, t3, bend, L, a);
  vec3 Q = axisAt(tip, t3, bend, L, a + 0.05);
  vec3 M0 = axisAt(tip, t3, bend, L, 0.35), M1 = axisAt(tip, t3, bend, L, 0.65);
  vec3 T = normalize(M1 - M0);
  vec3 Pm = mirrorY(P), Qm = mirrorY(Q);
  vec2 pu = proj(Pm), qu = proj(Qm);
  vec2 pa = vec2(pu.x * A, pu.y), pb = vec2(qu.x * A, qu.y);
  vec2 t = normalize(pb - pa + vec2(1e-6));
  vec2 n = vec2(-t.y, t.x);
  float prof = pow(sin(3.14159 * pow(clamp(a, 0.0, 1.0), 0.75)), 0.7) * 0.85 + 0.15;
  float w = F * aP.y * prof * (1.0 - 0.3 * comb) / P.z;
  float c = cocAt(P.z);
  float wt = max(w + 2.0 * c, uPx * 2.0);
  vSoft = clamp(2.0 * c / (w + 2.0 * c), 0.0, 1.0);
  vAlpha = clamp(w / wt + 0.15, 0.0, 1.0);
  pa += n * aSeg.y * wt * 0.5;
  // a little past the ends so the tip and base can be feathered in the fragment
  pa += t * (a - 0.5) * 2.0 * c;
  vAB = aSeg;
  vSeed = sd;
  vUV = vec2(pa.x / A, pa.y);
  // honami: backlit silky hairs forward-scatter the sun. Seen end-on (head tipped
  // towards the camera) the line of sight crosses more hair, so it glows more;
  // the fibre's scattering cone (Marschner TT) also favours some orientations.
  vec3 V = normalize(P - vec3(0.0, CAMH, 0.0));
  float sinTV = length(cross(T, V));
  float tau = 0.4 / max(0.2, sinTV);
  float cone = exp(-pow(dot(V, T) - dot(uSun, T), 2.0) / (2.0 * 0.3 * 0.3));
  vPhase = phaseAt(P);
  vGlow = vPhase * (1.0 - exp(-tau)) * (0.6 + 0.4 * cone) * (1.0 + 1.3 * comb);
  vFog = 1.0 - exp(-P.z / 30.0);
  gl_Position = clipOf(vUV, P.z - 0.02);
  if (uMirror > 0.5 && aI0.y > 24.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;

const FS_PLUME = `#version 300 es
precision highp float;
uniform sampler2D uPlate; uniform sampler2D uMask; uniform float uMirror; uniform vec3 uSunCol; uniform vec3 uPlumeCol;
in vec2 vUV; in vec2 vAB; in float vAlpha; in float vGlow; in float vFog; in float vSoft; in float vSeed; in float vPhase; in float vComb;
out vec4 o;
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}
void main() {
  float a = vAB.x, b = vAB.y;
  float ab = abs(b);
  float sd = vSeed * 97.0;
  float side = sign(b) * 0.5 + 0.5;
  // the panicle: a nodding rachis with ~16 branches a side, angled towards the
  // tip, each carrying spikelets whose long silky hairs make the feather
  float N = 22.0;
  // branches leave the rachis at varied angles and arch over as they go out
  float slant = 0.22 + 0.2 * vn(vec2(a * 6.0 + sd, side * 5.0));
  float p = a * N - (slant * ab + 0.22 * ab * ab) * N + 0.8 * vn(vec2(a * 3.0 + sd, ab * 2.0 + side * 9.0));
  float k = floor(p), fr = p - k;
  float hk = h21(vec2(k + sd, side * 7.0 + sd));
  float hk2 = h21(vec2(k * 1.7 + sd, side * 3.0 + 1.3));
  float shape = pow(sin(3.14159 * clamp(a * 1.05, 0.0, 1.0)), 0.6);
  // one-sided: the heavier side of the panicle is the one it nods towards
  float lop = (vSeed > 0.5 ? 1.0 : -1.0) * b > 0.0 ? 1.0 : 0.62;
  float reach = (0.35 + 0.65 * hk) * mix(0.6, 1.0, shape) * lop * (hk2 < 0.12 ? 0.3 : 1.0);
  float branch = exp(-pow((fr - 0.5 - 0.15 * (hk2 - 0.5)) / (0.28 + 0.16 * ab), 2.0));
  branch = 0.3 + 0.7 * branch;
  float inside = 1.0 - smoothstep(reach - 0.3, reach + 0.05, ab);
  float hair = vn(vec2(fr * 7.0 + k * 3.1, ab * 5.0 + sd));
  float strands = smoothstep(0.25, 0.9, vn(vec2((p / N + ab * 0.3) * 160.0, ab * 3.0 + a * 4.0 + side * 3.0)));
  float sharpness = 1.0 - clamp(vSoft * 2.2, 0.0, 1.0);
  strands = mix(0.5, strands, sharpness);
  hair = mix(0.5, hair, sharpness);
  branch = mix(0.65, branch, sharpness);
  float rach = exp(-b * b / 0.012) * smoothstep(0.0, 0.06, a) * (1.0 - smoothstep(0.85, 1.0, a));
  float dens = (branch * inside * (0.35 + 0.45 * hair + 0.35 * strands) + 0.7 * rach) * (1.0 - 0.35 * vComb);
  dens *= smoothstep(-0.02, 0.1, a) * (1.0 - smoothstep(0.88, 1.02, a));
  // out of focus it is just a soft lump of the same weight
  float blob = 0.55 * exp(-pow((a - 0.5) / 0.36, 2.0) - pow(b / 0.6, 2.0));
  dens = mix(dens, blob, vSoft * vSoft);
  float al = clamp(dens * 1.6, 0.0, 1.0) * vAlpha;
  // backlit: the fine hairs at the edges forward-scatter the sun (emission over
  // the sky, so it is added whatever the coverage); the dense core is darker
  float thin = 1.0 - clamp(dens * 1.5, 0.0, 1.0);
  float hairs = branch * (0.5 + 0.5 * strands) * smoothstep(reach + 0.15, reach - 0.35, ab) * (0.35 + 0.65 * ab);
  hairs = mix(hairs, blob * 0.6, vSoft * vSoft) * smoothstep(-0.02, 0.1, a) * (1.0 - smoothstep(0.88, 1.02, a));
  vec3 col = uPlumeCol * (0.75 + 0.5 * vPhase) + uSunCol * vGlow * 0.35;
  vec3 fog = textureLod(uPlate, vUV, 2.5).rgb;
  col = mix(col, fog, vFog * 0.75);
  vec3 emit = uSunCol * vGlow * hairs * (0.5 + thin) * 1.7 * vAlpha * (1.0 - 0.6 * vFog);
  if (uMirror > 0.5) {
    vec4 m = texture(uMask, vUV);
    float wm = m.r * 0.75;
    al *= wm; emit *= wm * 0.6;
    col *= 0.75;
  }
  o = vec4(col * al + emit, al);
}`;

const VS_FULL = `#version 300 es
layout(location=0) in vec2 aSeg;
void main() { gl_Position = vec4(aSeg * 2.0 - 1.0, 0.0, 1.0); }`;

const FS_PLATE = `#version 300 es
precision highp float;
uniform sampler2D uPlate; uniform sampler2D uMask; uniform sampler2D uGust;
uniform vec4 uCov; uniform vec2 uRes; uniform float uTime; uniform vec2 uMean; uniform vec3 uSunCol;
const float A = ${ASPECT.toFixed(6)};
const float VH = ${VH.toFixed(4)};
const float F = ${FOCAL.toFixed(4)};
const float CAMH = ${CAMH.toFixed(3)};
const float SU = ${SUN_U.toFixed(4)};
out vec4 o;
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}
vec4 gustAt(float u, float z) {
  return texture(uGust, vec2((u - ${U0.toFixed(2)}) / ${(U1 - U0).toFixed(2)}, (log(z) - ${S0.toFixed(4)}) / ${(S1 - S0).toFixed(4)}));
}
void main() {
  vec2 cl = gl_FragCoord.xy / uRes * 2.0 - 1.0;
  vec2 uv = vec2((cl.x - uCov.y) / uCov.x, (-cl.y - uCov.w) / uCov.z);
  vec4 m = texture(uMask, uv);
  // the plate's own reeds sway with the gusts passing at a few metres: a shear
  // that grows with height above their roots, nothing at the sun or the water
  float h = clamp((0.98 - uv.y) / 0.98, 0.0, 1.0);
  vec4 g = gustAt(uv.x, 4.0);
  float dw = (g.x - uMean.x * 0.55) + 0.25 * (g.y - uMean.y);
  // smooth weights only: a warp that varied with the reed mask would tear the image
  float dSun = length(vec2((uv.x - SU) * A, uv.y - ${SUN_V.toFixed(4)}));
  float keep = smoothstep(0.05, 0.16, dSun) * mix(1.0, smoothstep(0.1, 0.0, abs(uv.x - SU) * A), smoothstep(VH, VH + 0.02, uv.y) * 0.0);
  float sway = dw * 0.0016 * h * h * keep;
  vec2 suv = uv - vec2(sway / A, -abs(sway) * 0.15);
  vec3 col = texture(uPlate, suv).rgb;
  if (m.r > 0.004 && uv.y > VH + 0.003) {
    float Z = F * CAMH / (uv.y - VH);
    float X = (uv.x - 0.5) * A * Z / F;
    vec4 gw = gustAt(uv.x, min(Z, 200.0));
    float T = gw.z;
    // cat's-paw: the patch of capillary ripples under a gust. Ripple facets tilt
    // towards the camera, so they mirror sky from higher up (darker) at a less
    // grazing angle (less Fresnel reflection), smeared by the many slopes.
    vec2 wdir = normalize(gw.xy + vec2(1e-3));
    vec2 wper = vec2(-wdir.y, wdir.x);
    // ripples a few centimetres long, crests across the wind, running with it
    vec2 q = vec2(X, Z);
    vec2 rp = vec2(dot(q, wdir) * 11.0, dot(q, wper) * 6.0) - vec2(uTime * 7.0, 0.0);
    float rip = vn(rp) * 0.6 + vn(rp * 2.1 + 3.7) * 0.4;
    float patchy = smoothstep(0.2, 0.8, vn(q * 0.8 - wdir * uTime * 1.2) * 0.7 + 0.55 * T);
    // far off, the mist between us and the water veils the darkening
    float R = T * mix(0.45, 1.0, patchy) * m.r * exp(-Z / 16.0);
    // the facets tilt towards us and mirror the darker, higher sky at a steeper
    // angle (less Fresnel reflection): a cat's-paw shows dark, with texture
    vec3 skyHigh = textureLod(uPlate, vec2(uv.x, 0.1), 4.0).rgb;
    vec3 rough = mix(col, skyHigh, 0.35) * (0.42 + 0.3 * rip);
    col = mix(col, rough, clamp(R * 1.2, 0.0, 1.0));
    // and the sun's path breaks into glints over a wider column (Cox and Munk)
    float colw = 0.02 + 0.06 * R;
    float path = exp(-pow((uv.x - SU) * A / colw, 2.0) * 0.5) * smoothstep(0.0, 0.1, uv.y - VH);
    float gl = smoothstep(0.86, 0.99, vn(vec2(dot(q, wdir) * 30.0 - uTime * 9.0, dot(q, wper) * 18.0)));
    col += uSunCol * gl * path * R * 1.6;
  }
  o = vec4(col, 1.0);
}`;

/* ---- WebGL plumbing -------------------------------------------------------- */
function compile(gl, vs, fs) {
    const p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        gl.attachShader(p, s);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
    return { p, u };
}
function strip(n) {
    const a = new Float32Array((n + 1) * 4);
    for (let i = 0; i <= n; i++) { a.set([i / n, -1, i / n, 1], i * 4); }
    return a;
}
function loadImage(src) {
    return new Promise((res, rej) => { const im = new Image(); im.decoding = 'async'; im.onload = () => res(im); im.onerror = rej; im.src = src; });
}

/* ---- wind hiss: filtered noise that rises with the gusts ------------------ */
function windSound() {
    let ctx = null, gain = null, band = null, low = null, on = false, src = null;
    const stored = () => { try { return localStorage.getItem('sf-sound') === 'on'; } catch { return false; } };
    on = stored();
    function start() {
        if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
        const len = ctx.sampleRate * 3, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
        // pink-ish noise (Paul Kellet's filter), the hiss of many leaves and hairs rubbing
        let b0 = 0, b1 = 0, b2 = 0;
        for (let i = 0; i < len; i++) {
            const w = Math.random() * 2 - 1;
            b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
            d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
        }
        src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
        band = ctx.createBiquadFilter(); band.type = 'bandpass'; band.frequency.value = 1800; band.Q.value = 0.6;
        low = ctx.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = 6000;
        gain = ctx.createGain(); gain.gain.value = 0;
        src.connect(band).connect(low).connect(gain).connect(ctx.destination);
        src.start();
    }
    return {
        get on() { return on; },
        set(v) { on = v; if (v) start(); else if (gain) gain.gain.setTargetAtTime(0, ctx.currentTime, 0.2); },
        unlock() { if (on) start(); },
        level(x) {
            if (!ctx || !gain) return;
            const t = ctx.currentTime, v = on ? clamp(x) : 0;
            gain.gain.setTargetAtTime(0.012 + 0.11 * v * v, t, 0.25);
            if (!on) gain.gain.setTargetAtTime(0, t, 0.2);
            band.frequency.setTargetAtTime(1200 + 2600 * v, t, 0.3);
        },
        pause() { if (ctx && ctx.state === 'running') ctx.suspend(); },
        destroy() { try { src?.stop(); ctx?.close(); } catch {} ctx = null; },
    };
}

/* ---- the component --------------------------------------------------------- */
export function reedbed(el, opts = {}) {
    const ds = el.dataset;
    const o = {
        breeze: +(opts.breeze ?? ds.breeze ?? 2.6),
        idle: opts.idle ?? ds.idle ?? 'breeze',
        density: +(opts.density ?? ds.density ?? 1),
        seed: +(opts.seed ?? ds.seed ?? 20061),
        label: opts.label ?? ds.label ?? 'Wind',
        tilt: (opts.tilt ?? ds.tilt ?? 'true') !== 'false',
        sound: (opts.sound ?? ds.sound ?? 'true') !== 'false',
        renderer: opts.renderer ?? ds.renderer ?? 'auto',
    };
    const off = [];
    const on = (t, type, fn, opt) => { t.addEventListener(type, fn, opt); off.push(() => t.removeEventListener(type, fn, opt)); };
    el.classList.add('rb');
    const img = el.querySelector('img');
    const plateSrc = opts.plate || (img && img.currentSrc) || (img && img.src) || PLATE;
    const maskSrc = opts.mask || ds.mask || MASK;

    const canvas = document.createElement('canvas');
    canvas.className = 'rb-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    el.prepend(canvas);

    // the native control: the breeze in m/s, named on the Beaufort scale
    const ctl = document.createElement('label');
    ctl.className = 'rb-wind';
    ctl.innerHTML = `<span class="rb-wind-name"></span><input type="range" min="0" max="12" step="0.2"><output class="rb-wind-val" aria-hidden="true"></output>`;
    const range = ctl.querySelector('input');
    const outEl = ctl.querySelector('output');
    ctl.querySelector('.rb-wind-name').textContent = o.label;
    range.value = String(o.breeze);
    el.append(ctl);
    const beaufort = (v) => BEAUFORT.find(([lim]) => v < lim)[1];
    const showWind = () => {
        const v = +range.value, txt = `${beaufort(v)}, ${v.toFixed(1)} m/s`;
        range.setAttribute('aria-valuetext', txt);
        outEl.textContent = `${beaufort(v)} · ${v.toFixed(1)} m/s`;
    };
    showWind();

    const reduced = () => calm.matches;
    const area = () => { const r = el.getBoundingClientRect(); return Math.max(0.35, Math.min(1.2, (r.width * r.height) / (1280 * 550))); };

    let mode = 'none';            // 'gl' | '2d' | 'none'
    let gl = null, ctx2d = null;
    let stems = [], leaves = [];
    let W = 1, H = 1, dpr = 1, cov = null;
    let visible = true, raf = 0, last = 0, time = 0, dead = false, settleT = 0, held = !!opts.paused;
    let plateImg = null;
    const sound = o.sound ? windSound() : null;

    // wind state
    let U = o.breeze;
    let azBase = 0.56;                // prevailing wind: from the far left, across and a little towards the camera
    let az = azBase;
    const wdir = () => [Math.cos(az), -Math.sin(az)];   // (X, Z): Z negative = towards the camera
    const grid = new Float32Array(GW * GH * 4);
    const puffs = [];
    let nextGust = 3 + Math.random() * 3;
    let energy = 0;

    // per-stem dynamics, packed: th x, th z, w x, w z  (texture rows of 128)
    let st = null, vel = null, sampleIdx = null;

    function buildStems() {
        const scale = o.density * (mode === '2d' ? 0.2 : area());
        stems = makeStems(scale, o.seed);
        const n = stems.length, rows = Math.ceil(n / 128);
        st = new Float32Array(128 * rows * 4);
        vel = new Float32Array(n * 2);
        sampleIdx = new Float32Array(n * 2);
        const r = rng(o.seed + 7);
        leaves = [];
        stems.forEach((s, i) => {
            sampleIdx[i * 2] = (s.u - U0) / (U1 - U0) * GW - 0.5;
            sampleIdx[i * 2 + 1] = (Math.log(s.Z) - S0) / (S1 - S0) * GH - 0.5;
            if (!s.leaves || mode !== 'gl') return;
            const nl = 4 + Math.floor(r() * 4);
            for (let k = 0; k < nl; k++) {
                const eta = 0.12 + 0.6 * (k + r() * 0.6) / nl;
                leaves.push([s.X, s.Z, s.H, i, eta, r() * 6.283, 0.3 + r() * 0.22, 0.018 + r() * 0.016, s.lean[0], s.lean[1], r(), 0.45 + r() * 0.5]);
            }
        });
        computeGrid(0);
        // start at the static lean the mean wind gives
        stems.forEach((s, i) => {
            const w = gridAt(i);
            const om = 2 * Math.PI * s.f, sp = Math.hypot(w[0], w[1]);
            const k = forceK(sp) / (om * om);
            st[i * 4] = w[0] * k; st[i * 4 + 1] = w[1] * k; st[i * 4 + 2] = w[0]; st[i * 4 + 3] = w[1];
        });
    }
    const forceK = (sp) => 1.45 * Math.pow(sp, VOGEL - 1);   // times the wind vector: |u|^1.4 along u

    function gridAt(i) {
        const gx = clamp(sampleIdx[i * 2], 0, GW - 1.001), gy = clamp(sampleIdx[i * 2 + 1], 0, GH - 1.001);
        const x0 = gx | 0, y0 = gy | 0, fx = gx - x0, fy = gy - y0;
        const a = (y0 * GW + x0) * 4, b = a + 4, c = a + GW * 4, d = c + 4;
        return [
            mix(mix(grid[a], grid[b], fx), mix(grid[c], grid[d], fx), fy),
            mix(mix(grid[a + 1], grid[b + 1], fx), mix(grid[c + 1], grid[d + 1], fx), fy),
        ];
    }

    function computeGrid(t) {
        const [wx, wz] = wdir();
        const cx = -wz, cz = wx;
        const Uc = Math.max(0.6, U * 1.05);
        const still = o.idle === 'still';
        const turb = still ? 0 : 1;
        let e = 0;
        for (let j = 0; j < GH; j++) {
            const Z = Math.exp(S0 + (j + 0.5) / GH * (S1 - S0));
            for (let i = 0; i < GW; i++) {
                const u = U0 + (i + 0.5) / GW * (U1 - U0);
                const X = (u - 0.5) * ASPECT * Z / FOCAL;
                // frozen turbulence carried along at the convection speed (Taylor)
                const qa = X * wx + Z * wz - Uc * t, qc = X * cx + Z * cz;
                const n1 = fbm(qa / LAMBDA_A, qc / LAMBDA_C, t * 0.09);
                const n2 = fbm(qa / LAMBDA_A + 31.7, qc / LAMBDA_C - 12.1, t * 0.11 + 4);
                // gusts are skewed: sharp strong sweeps, weaker lulls
                const g = (n1 > 0 ? n1 * 1.5 : n1 * 0.8) * INTENSITY * 2.2 * turb;
                let ux = wx * U * (1 + g) + cx * U * 0.3 * n2 * turb;
                let uz = wz * U * (1 + g) + cz * U * 0.3 * n2 * turb;
                // gusts overlap, they do not stack: the strongest one sets the speed
                let gx = 0, gz = 0, gmax = 0;
                for (const p of puffs) {
                    const dx = X - p.x, dz = Z - p.z;
                    const da = dx * p.dx + dz * p.dz, dc = -dx * p.dz + dz * p.dx;
                    const k = (da * da) / (p.sa * p.sa) + (dc * dc) / (p.sc * p.sc);
                    if (k > 9) continue;
                    const f = p.amp * Math.exp(-0.5 * k);
                    gx += p.dx * f; gz += p.dz * f;
                    if (f > gmax) gmax = f;
                }
                const gm = Math.hypot(gx, gz);
                if (gm > gmax * 1.15) { const c = gmax * 1.15 / gm; gx *= c; gz *= c; }
                ux += gx; uz += gz;
                const sp = Math.hypot(ux, uz);
                const T = Math.max(smooth(0.5, 2.6, sp - U * 1.25), smooth(4, 10, U) * 0.45);
                const k = (j * GW + i) * 4;
                grid[k] = ux; grid[k + 1] = uz; grid[k + 2] = T; grid[k + 3] = 0;
                e += T;
            }
        }
        return e / (GW * GH);
    }

    function stepPuffs(dt) {
        const [wx, wz] = wdir();
        const Uc = Math.max(0.6, U * 1.05);
        for (let i = puffs.length - 1; i >= 0; i--) {
            const p = puffs[i];
            p.age += dt;
            const relax = 1 - Math.exp(-dt / 1.8);
            p.vx += (wx * Uc - p.vx) * relax; p.vz += (wz * Uc - p.vz) * relax;
            p.x += p.vx * dt; p.z += p.vz * dt;
            p.amp *= Math.exp(-dt / p.decay);
            p.sa += p.grow * dt; p.sc += p.grow * dt;
            if (p.amp < 0.08 || p.age > 20 || p.z < -30 || p.z > 300) puffs.splice(i, 1);
        }
        if (o.idle !== 'still' && !reduced()) {
            nextGust -= dt;
            if (nextGust <= 0) {
                // a gust front, broad across the wind and short along it, arriving from upwind
                nextGust = 4 + Math.random() * 7;
                const cx = -wz, cz = wx;
                const z0 = 6 + Math.random() * 30, x0 = (Math.random() - 0.5) * z0 * 1.2;
                const back = 26 + Math.random() * 10;
                puffs.push({ x: x0 - wx * back + cx * (Math.random() - 0.5) * 6, z: z0 - wz * back + cz * 0, dx: wx, dz: wz,
                    vx: wx * Uc * 1.1, vz: wz * Uc * 1.1, amp: U * (0.6 + Math.random() * 0.7) + 0.7, sa: 2.6 + Math.random(), sc: 5 + Math.random() * 5,
                    grow: 0.15, decay: 14, age: 0 });
            }
        }
        if (puffs.length > 24) puffs.splice(0, puffs.length - 24);
    }

    function stepStems(dt) {
        const n = stems.length;
        let ke = 0;
        const sub = dt > 1 / 50 ? 2 : 1, h = dt / sub;
        for (let i = 0; i < n; i++) {
            const s = stems[i];
            const w = gridAt(i);
            const sp = Math.hypot(w[0], w[1]);
            const kf = forceK(sp);
            const om = 2 * Math.PI * s.f, om2 = om * om;
            let tx = st[i * 4], tz = st[i * 4 + 1], vx = vel[i * 2], vz = vel[i * 2 + 1];
            for (let k = 0; k < sub; k++) {
                // theta'' + 2 zeta omega theta' + omega^2 theta = drag(u) / (stiffness-normalised inertia)
                const ax = kf * w[0] - 2 * s.zeta * om * vx - om2 * tx;
                const az2 = kf * w[1] - 2 * s.zeta * om * vz - om2 * tz;
                vx += ax * h; vz += az2 * h;
                tx += vx * h; tz += vz * h;
            }
            // a reed can only lean so far before it is lying in the water
            const m = Math.hypot(tx, tz);
            if (m > 0.85) { const f = 0.85 / m; tx *= f; tz *= f; vx *= 0.5; vz *= 0.5; }
            st[i * 4] = tx; st[i * 4 + 1] = tz; st[i * 4 + 2] = w[0]; st[i * 4 + 3] = w[1];
            vel[i * 2] = vx; vel[i * 2 + 1] = vz;
            ke += vx * vx + vz * vz;
        }
        return ke / Math.max(1, n);
    }

    /* ---- GL setup ---- */
    let P = {}, tex = {}, vao = {}, counts = {};
    function initGL() {
        gl = canvas.getContext('webgl2', { antialias: true, alpha: false, premultipliedAlpha: true, powerPreference: 'high-performance' });
        if (!gl || !gl.getExtension) return false;
        P.plate = compile(gl, VS_FULL, FS_PLATE);
        P.stem = compile(gl, VS_STEM, FS_STEM);
        P.leaf = compile(gl, VS_LEAF, FS_LEAF);
        P.plume = compile(gl, VS_PLUME, FS_PLUME);
        return true;
    }
    function texture(image, mip) {
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        if (mip) gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return t;
    }
    function buffers() {
        const mk = (data, loc, size, stride, offset, div) => {
            gl.enableVertexAttribArray(loc);
            gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
            if (div) gl.vertexAttribDivisor(loc, 1);
        };
        const seg = (n) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, strip(n), gl.STATIC_DRAW); mk(null, 0, 2, 0, 0, false); };
        // stems + plumes share per-stem data
        const n = stems.length;
        const inst = new Float32Array(n * 12);
        stems.forEach((s, i) => inst.set([s.X, s.Z, s.H, s.seed, s.lean[0], s.lean[1], s.diam, 0, s.plen, s.pwid, s.naz, s.nod], i * 12));
        for (const k of ['stem', 'plume']) {
            vao[k] = gl.createVertexArray(); gl.bindVertexArray(vao[k]);
            seg(k === 'stem' ? 14 : 12);
            const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, inst, gl.STATIC_DRAW);
            mk(null, 1, 4, 48, 0, true); mk(null, 2, 4, 48, 16, true);
            if (k === 'plume') mk(null, 3, 4, 48, 32, true);
        }
        counts.stem = 15 * 2; counts.plume = 13 * 2;
        vao.leaf = gl.createVertexArray(); gl.bindVertexArray(vao.leaf);
        seg(7);
        const li = new Float32Array(leaves.length * 12);
        leaves.forEach((l, i) => li.set(l, i * 12));
        const lb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, lb); gl.bufferData(gl.ARRAY_BUFFER, li, gl.STATIC_DRAW);
        mk(null, 1, 4, 48, 0, true); mk(null, 2, 4, 48, 16, true); mk(null, 3, 4, 48, 32, true);
        counts.leaf = 8 * 2;
        vao.full = gl.createVertexArray(); gl.bindVertexArray(vao.full);
        const fb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, fb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 2, 0, 0, 2]), gl.STATIC_DRAW);
        mk(null, 0, 2, 0, 0, false);
        gl.bindVertexArray(null);

        tex.state = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex.state);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 128, st.length / 512, 0, gl.RGBA, gl.FLOAT, st);
        for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST);
        tex.gust = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex.gust);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, GW, GH, 0, gl.RGBA, gl.FLOAT, grid);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }

    // colours sampled from the plate: the sun-side gold, the reeds' darkest silhouettes
    const SUNCOL = [1.0, 0.72, 0.44], DARK = [0.048, 0.045, 0.044], PLUMECOL = [0.12, 0.096, 0.09];

    function layout() {
        const r = el.getBoundingClientRect();
        W = Math.max(1, r.width); H = Math.max(1, r.height);
        dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
        // the plate covers the band (object-fit: cover, centred), in plate-heights
        const s = Math.max(W / ASPECT, H);
        const ox = (W - ASPECT * s) / 2, oy = (H - s) / 2;
        cov = { s, ox, oy, gl: [ASPECT * s * 2 / W, ox * 2 / W - 1, s * 2 / H, oy * 2 / H - 1] };
    }

    function drawGL() {
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.bindTexture(gl.TEXTURE_2D, tex.state);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 128, st.length / 512, gl.RGBA, gl.FLOAT, st);
        gl.bindTexture(gl.TEXTURE_2D, tex.gust);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, GW, GH, gl.RGBA, gl.FLOAT, grid);
        const bindTex = () => {
            gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex.plate);
            gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tex.mask);
            gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, tex.gust);
            gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, tex.state);
        };
        bindTex();
        const common = (prog, mirror) => {
            const u = prog.u;
            gl.useProgram(prog.p);
            if (u.uPlate) gl.uniform1i(u.uPlate, 0);
            if (u.uMask) gl.uniform1i(u.uMask, 1);
            if (u.uGust) gl.uniform1i(u.uGust, 2);
            if (u.uState) gl.uniform1i(u.uState, 3);
            if (u.uCov) gl.uniform4fv(u.uCov, cov.gl);
            if (u.uPx) gl.uniform1f(u.uPx, 1 / (cov.s * dpr));
            if (u.uTime) gl.uniform1f(u.uTime, time);
            if (u.uSun) gl.uniform3fv(u.uSun, sunDir);
            if (u.uSunCol) gl.uniform3fv(u.uSunCol, SUNCOL);
            if (u.uDark) gl.uniform3fv(u.uDark, DARK);
            if (u.uPlumeCol) gl.uniform3fv(u.uPlumeCol, PLUMECOL);
            if (u.uMirror) gl.uniform1f(u.uMirror, mirror ? 1 : 0);
        };
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.BLEND);
        common(P.plate);
        gl.uniform2f(P.plate.u.uRes, canvas.width, canvas.height);
        const [wx, wz] = wdir();
        gl.uniform2f(P.plate.u.uMean, wx * U, wz * U);
        gl.bindVertexArray(vao.full);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        // reflections in the open water first
        common(P.stem, true); gl.bindVertexArray(vao.stem); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, counts.stem, stems.length);
        common(P.plume, true); gl.bindVertexArray(vao.plume); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, counts.plume, stems.length);

        gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
        // each layer is painted far to near without writing depth, then its solid
        // cores are written to depth so later layers (blades, heads) pass behind them
        const layer = (prog, v, count, n) => {
            common(prog, false); gl.bindVertexArray(v);
            gl.depthMask(false); gl.uniform1f(prog.u.uDepthOnly, 0);
            gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, count, n);
            gl.depthMask(true); gl.colorMask(false, false, false, false); gl.uniform1f(prog.u.uDepthOnly, 1);
            gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, count, n);
            gl.colorMask(true, true, true, true);
        };
        layer(P.stem, vao.stem, counts.stem, stems.length);
        if (leaves.length) layer(P.leaf, vao.leaf, counts.leaf, leaves.length);
        gl.depthMask(false);
        common(P.plume, false); gl.bindVertexArray(vao.plume); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, counts.plume, stems.length);
        gl.depthMask(true);
        gl.bindVertexArray(null);
    }

    /* ---- canvas fallback: same stems and wind, fewer of them, drawn as curves ---- */
    function project(X, Y, Z) {
        const u = 0.5 + FOCAL * X / (Z * ASPECT), v = VH + FOCAL * (CAMH - Y) / Z;
        return [cov.ox + u * ASPECT * cov.s, cov.oy + v * cov.s];
    }
    function stemPoint(s, tx, tz, e) {
        const k2 = tx * tx + tz * tz, ph = e * e * (3 - e) / 2, e3 = e * e * e;
        const sh = 1.125 * k2 * (4 * e3 / 3 - e3 * e + e3 * e * e / 5);
        return project(s.X + tx * s.H * ph, s.H * (e - sh), s.Z + tz * s.H * ph);
    }
    function draw2d() {
        const c = ctx2d;
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        c.drawImage(plateImg, cov.ox, cov.oy, ASPECT * cov.s, cov.s);
        c.lineCap = 'round';
        stems.forEach((s, i) => {
            const tx = st[i * 4] + s.lean[0], tz = st[i * 4 + 1] + s.lean[1];
            const fog = 1 - Math.exp(-s.Z / 26);
            const a = stemPoint(s, tx, tz, 0), b = stemPoint(s, tx, tz, 0.6), d = stemPoint(s, tx, tz, 1);
            const px = cov.s / s.Z * FOCAL;
            c.strokeStyle = `rgba(14,12,12,${(0.9 * (1 - fog)).toFixed(3)})`;
            c.lineWidth = Math.max(0.6, s.diam * px);
            c.beginPath(); c.moveTo(a[0], a[1]); c.quadraticCurveTo(2 * b[0] - (a[0] + d[0]) / 2, 2 * b[1] - (a[1] + d[1]) / 2, d[0], d[1]); c.stroke();
            const wx = st[i * 4 + 2], wz = st[i * 4 + 3];
            const L = s.plen * px, nod = s.nod;
            const ex = d[0] + (Math.cos(s.naz) * nod * 0.5 + wx * 0.05 + tx * 0.6) * L, ey = d[1] + (0.75 - nod * 0.2) * L * -1 + nod * 0.55 * L;
            const sx = (ex - d[0]) * 0.5 + d[0], sy = (ey - d[1]) * 0.5 + d[1];
            const dx = s.X * 0 + (sx - cov.ox) / (ASPECT * cov.s) - SUN_U, dy = (sy - cov.oy) / cov.s - SUN_V;
            const ph = Math.exp(-(dx * dx + dy * dy) * 6);
            const glow = (0.25 + 0.75 * ph) * (1 - 0.6 * fog);
            c.strokeStyle = `rgba(${Math.round(120 + 135 * glow)},${Math.round(80 + 110 * glow)},${Math.round(70 + 60 * glow)},${(0.35 + 0.4 * glow).toFixed(3)})`;
            c.lineWidth = Math.max(1, s.pwid * px * 0.6);
            c.beginPath(); c.moveTo(d[0], d[1]); c.quadraticCurveTo(d[0] + (ex - d[0]) * 0.2, d[1] + (ey - d[1]) * 0.8 - L * 0.2, ex, ey); c.stroke();
        });
    }

    function render() {
        if (mode === 'gl') drawGL();
        else if (mode === '2d') draw2d();
    }

    /* ---- the loop ---- */
    function frame(now) {
        raf = 0;
        if (dead) return;
        const dt = last ? Math.min(1 / 30, (now - last) / 1000) : 1 / 60;
        last = now;
        time += dt;
        // tilt turns the prevailing wind
        if (o.tilt && tilt.active) az = azBase - tilt.x * 1.0 + tilt.y * 0.4;
        U += (+range.value - U) * (1 - Math.exp(-dt / 0.8));
        stepPuffs(dt);
        const water = computeGrid(time);
        const ke = stepStems(dt);
        energy = mix(energy, clamp(0.15 + water * 2.5 + (U / 10) + puffs.reduce((a, p) => a + p.amp, 0) / 30), 0.08);
        sound?.level(energy);
        render();
        if (o.idle === 'still' && !puffs.length && Math.abs(U - +range.value) < 0.01) {
            settleT = ke < 1e-6 ? settleT + dt : 0;
            if (settleT > 0.5) { sound?.level(0); return; }   // at rest: no loop
        }
        schedule();
    }
    function schedule() {
        if (dead || raf || held || !visible || document.hidden || mode === 'none') return;
        if (reduced()) { render(); return; }
        last = 0;
        raf = requestAnimationFrame(frame);
    }
    function kick() { settleT = 0; schedule(); }
    function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; sound?.pause(); }

    function staticPose() {
        // reduced motion: every stem at the lean the mean wind gives it, no turbulence
        const [wx, wz] = wdir();
        stems.forEach((s, i) => {
            const om = 2 * Math.PI * s.f, k = forceK(U) / (om * om);
            st[i * 4] = wx * U * k; st[i * 4 + 1] = wz * U * k; st[i * 4 + 2] = wx * U; st[i * 4 + 3] = wz * U;
        });
        for (let k = 0; k < grid.length; k += 4) { grid[k] = wx * U; grid[k + 1] = wz * U; grid[k + 2] = 0; }
    }

    /* ---- input: the pointer is the wind ---- */
    let drag = null;
    function toWorld(px, py) {
        const u = (px - cov.ox) / (ASPECT * cov.s), v = (py - cov.oy) / cov.s;
        let Z;
        if (v < VH - 0.012) Z = FOCAL * (1.6 - CAMH) / (VH - v);       // up among the heads
        else if (v > VH + 0.012) Z = FOCAL * CAMH / (v - VH);            // down on the water
        else Z = 60;
        Z = clamp(Z, 1.5, 70);
        return { u, v, Z, X: (u - 0.5) * ASPECT * Z / FOCAL };
    }
    function gust(px, py, dxPx, dyPx, dtS = 1 / 60) {
        if (!cov || reduced()) return;
        const w = toWorld(px, py);
        const scale = ASPECT * cov.s;
        // world direction of the drag: across the screen is across, down the screen is towards you
        let vx = dxPx / scale * ASPECT * w.Z / FOCAL, vz = -dyPx / scale * ASPECT * w.Z / FOCAL * 1.4;
        const m = Math.hypot(vx, vz);
        if (m < 1e-6) return;
        // the eddy is carried off at the speed the finger moved it (in metres per
        // second at that depth), then drifts back to travelling with the breeze
        const vw = Math.min(12, m / dtS * 0.8);
        vx /= m; vz /= m;
        const speed = Math.hypot(dxPx, dyPx) / dtS;           // css px per second
        const amp = clamp(speed / W * 6, 0.4, 10);
        const sig = Math.max(0.8, 0.09 * ASPECT * w.Z / FOCAL);
        puffs.push({ x: w.X, z: w.Z, dx: vx, dz: vz, vx: vx * vw, vz: vz * vw, amp, sa: sig, sc: sig * 1.3,
            grow: 0.7, decay: 1.8, age: 0 });
        kick();
    }
    function local(e) { const r = el.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
    on(el, 'pointerdown', (e) => {
        if (e.target === range || e.button > 0) return;
        const [x, y] = local(e);
        drag = { id: e.pointerId, x, y, t: performance.now() };
        sound?.unlock();
    });
    on(el, 'pointermove', (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        const [x, y] = local(e), t = performance.now();
        const dx = x - drag.x, dy = y - drag.y, dts = Math.max(0.008, (t - drag.t) / 1000);
        if (Math.hypot(dx, dy) < 10 && dts < 0.05) return;
        gust(x, y, dx, dy, dts);
        drag.x = x; drag.y = y; drag.t = t;
    });
    const end = (e) => { if (drag && e.pointerId === drag.id) drag = null; };
    on(el, 'pointerup', end); on(el, 'pointercancel', end); on(el, 'pointerleave', end);
    on(range, 'input', () => { showWind(); if (reduced()) { U = +range.value; staticPose(); render(); } else kick(); });
    on(window, 'sf-sound', (e) => { sound?.set(!!e.detail); if (e.detail) kick(); });
    on(document, 'visibilitychange', () => { if (document.hidden) stop(); else kick(); });
    const io = new IntersectionObserver((en) => { visible = en[0].isIntersecting; if (visible) kick(); else stop(); });
    io.observe(el);
    let ro = null;
    const onMotion = () => { if (reduced()) { stop(); staticPose(); render(); } else kick(); };
    calm.addEventListener('change', onMotion); off.push(() => calm.removeEventListener('change', onMotion));
    const tiltFn = () => kick();
    tilt.listeners.add(tiltFn); off.push(() => tilt.listeners.delete(tiltFn));

    (async () => {
        try {
            const [pi, mi] = await Promise.all([loadImage(plateSrc), loadImage(maskSrc).catch(() => null)]);
            if (dead) return;
            plateImg = pi;
            layout();
            let ok = false;
            try { ok = o.renderer !== '2d' && initGL() && !!mi; } catch (err) { console.warn('reedbed: WebGL2 unavailable, using canvas', err); ok = false; }
            if (ok) {
                mode = 'gl';
                buildStems();
                buffers();
                tex.plate = texture(pi, true);
                tex.mask = texture(mi, false);
                canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); stop(); mode = 'none'; el.classList.remove('is-live'); });
            } else {
                gl = null;
                const c2 = document.createElement('canvas');
                c2.className = 'rb-canvas'; c2.setAttribute('aria-hidden', 'true');
                canvas.replaceWith(c2);
                canvas2 = c2;
                c2.width = canvas.width; c2.height = canvas.height;
                ctx2d = c2.getContext('2d');
                if (!ctx2d) return;
                mode = '2d';
                buildStems();
            }
            if (reduced()) staticPose();
            render();
            el.classList.add('is-live');
            ro = new ResizeObserver(() => {
                const cw = canvas2 || canvas;
                const r = el.getBoundingClientRect();
                if (Math.abs(r.width - W) < 1 && Math.abs(r.height - H) < 1) return;
                layout();
                if (canvas2) { canvas2.width = canvas.width; canvas2.height = canvas.height; }
                if (reduced()) { staticPose(); }
                render();
                cw && kick();
            });
            ro.observe(el);
            schedule();
        } catch (err) {
            console.warn('reedbed:', err);
        }
    })();
    let canvas2 = null;

    function destroy() {
        dead = true;
        stop();
        io.disconnect(); ro?.disconnect();
        off.forEach((f) => f()); off.length = 0;
        sound?.destroy();
        if (gl) gl.getExtension('WEBGL_lose_context')?.loseContext();
        canvas.remove(); canvas2?.remove(); ctl.remove();
        el.classList.remove('rb', 'is-live');
    }
    destroy.gust = (x, y, dx, dy, dt) => gust(x, y, dx, dy, dt);
    // step the simulation by a fixed amount of time and draw once (tests, stills)
    destroy.advance = (sec = 1 / 60) => {
        if (mode === 'none') return;
        for (let i = 0, n = Math.max(1, Math.round(sec * 60)); i < n; i++) {
            time += 1 / 60;
            U += (+range.value - U) * (1 - Math.exp(-1 / 60 / 0.8));
            stepPuffs(1 / 60); computeGrid(time); stepStems(1 / 60);
        }
        render();
    };
    Object.defineProperty(destroy, 'breeze', { get: () => +range.value, set: (v) => { range.value = String(v); showWind(); kick(); } });
    Object.defineProperty(destroy, 'running', { get: () => !!raf });
    Object.defineProperty(destroy, 'stems', { get: () => stems.length });
    // send the next idle gust front now
    destroy.gustFront = () => { nextGust = 0; kick(); };
    // stop / restart the live loop (stills, tests); advance() still steps it
    destroy.pause = (v = true) => { held = !!v; if (held) stop(); else kick(); };
    return destroy;
}

document.querySelectorAll('[data-reedbed]').forEach((el) => { el.__reedbed = reedbed(el); });
