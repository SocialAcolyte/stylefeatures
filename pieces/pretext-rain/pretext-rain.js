/*
 *  PRETEXT-RAIN // rain on a handwritten letter left out on a garden table.
 *  Scroll and a shower comes over: the first drops sit as glossy beads and
 *  sink into dark round spots; the fountain-pen ink in their way redissolves
 *  and bleeds out with the water, feathering along the fibres and separating
 *  into violet and turquoise at the edge of the run; then the shower thickens,
 *  the spots join, the sheet cockles and water runs down it in rivulets
 *  carrying ink; then it stops and the wet dries from the edges in, leaving
 *  tide lines. Scroll back and the letter is dry and fresh again.
 *
 *  Markup:  <section data-pretext-rain>
 *             <div class="pr-stage">
 *               <article class="pr-letter">
 *                 <p class="pr-date">…</p> <p class="pr-greet">…</p>
 *                 <p>…</p> <p>…</p>
 *                 <p class="pr-close">…</p> <p class="pr-sign">…</p>
 *                 <p class="pr-ps">…</p>
 *                 <p class="pr-verso">…</p>   (written on the back)
 *               </article>
 *             </div>
 *           </section>
 *  Or call pretextRain(section, opts) yourself; it returns destroy().
 *
 *  1. pretext (Cheng Lou, vendor/pretext) sets the letter on the sheet at the
 *     largest size that fits; each line is written onto a canvas with a
 *     hand's irregularities. That canvas is the dye source.
 *  2. A GPU simulation on a grid over the sheet (two ping-pong textures):
 *     water held in the paper, water standing on it, two dyes (violet and
 *     turquoise: together, royal blue) and the paper's own solubles, each
 *     split between fixed-on-fibre and dissolved. Water wicks by nonlinear
 *     diffusion (Lucas-Washburn-like fronts), faster along the grain and
 *     along individual fibres, slower in dense flocs of the real sheet;
 *     dissolved matter rides the flow; standing water above a pinning depth
 *     runs downhill in rivulets along the valleys of the cockle; evaporation
 *     is fastest at the thin edge, so dye and solubles end in a ring.
 *  3. The rain is a seeded schedule over the scroll. State at any scroll
 *     position is the simulation run to that step; checkpoints every few
 *     hundred steps make scrolling back exact and cheap.
 *  4. One shader paints the sheet: the real paper (a blank leaf from
 *     Alexander Cozens's sketchbook), darker and translucent where wet (the
 *     writing on the back shows through), the ink by Beer-Lambert from the
 *     two dyes, tide lines, cockle shading, and beads of water that refract
 *     the writing and catch the sky.
 */

const REF = 100;
const calm = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const mix = (a, b, t) => a + (b - a) * t;
const ss = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

const NB = 2400;          // steps in the whole shower
const CK = 200;           // checkpoint spacing (steps)
const GW = 200;           // grid columns across the sheet
const ITER = 3;            // simulation passes per step
const TAP_STEPS = 160;    // a tapped drop is given this many steps to soak in
const TAP_RATE = 50;      // ... played at this many steps a second

function rng(seed) {
    let a = (seed >>> 0) || 1;
    return () => { a ^= a << 13; a >>>= 0; a ^= a >>> 17; a ^= a << 5; a >>>= 0; return a / 4294967296; };
}
function hash(ix, iy, s) {
    let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(s, 982451653)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}
function vn(x, y, s) {
    const ix = Math.floor(x), iy = Math.floor(y);
    let fx = x - ix, fy = y - iy;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const a = hash(ix, iy, s), b = hash(ix + 1, iy, s), c = hash(ix, iy + 1, s), d = hash(ix + 1, iy + 1, s);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
function fbm(x, y, s, o) {
    let v = 0, amp = 0.5, f = 1, n = 0;
    for (let i = 0; i < o; i++) { v += amp * vn(x * f, y * f, s + i * 17); n += amp; amp *= 0.5; f *= 2.03; }
    return v / n;
}
function colour(css, fallback) {
    const c = document.createElement('canvas').getContext('2d');
    c.fillStyle = fallback; c.fillStyle = css || fallback;
    const v = c.fillStyle;
    if (v[0] === '#') return [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
    const m = v.match(/[\d.]+/g) || [0, 0, 0];
    return m.slice(0, 3).map((x) => +x / 255);
}

// ---- shaders -------------------------------------------------------------------
const QUAD_VS = `#version 300 es
in vec2 a;
void main() { gl_Position = vec4(a * 2. - 1., 0., 1.); }`;

// One step of the paper. A: water in paper, standing water, dissolved
// solubles, fixed solubles. B: fixed violet, fixed turquoise, dissolved
// violet, dissolved turquoise. Fluxes are computed identically from both
// sides of each link, so water and dye are conserved.
const SIM_FS = `#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D uA, uB, uK, uG;
uniform vec4 uDrops[8];
uniform int uND;
uniform float uEv, uDw, uScrit, uSr, uKa, uDm, uRain;
uniform vec3 uKb, uDis, uAds;
uniform vec2 uGrain;
layout(location = 0) out vec4 oA;
layout(location = 1) out vec4 oB;
void main() {
    ivec2 p = ivec2(gl_FragCoord.xy);
    ivec2 N = textureSize(uA, 0);
    vec4 A = texelFetch(uA, p, 0), B = texelFetch(uB, p, 0), K = texelFetch(uK, p, 0);
    float th = A.r, S = A.g;
    vec3 c = vec3(B.b, B.a, A.b) / (th + S + 1e-4);
    float dth = 0., sIn = 0., mn = th;
    vec3 dD = vec3(0.);
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
        if (i == 0 && j == 0) continue;
        ivec2 q = p + ivec2(i, j);
        if (q.x < 0 || q.y < 0 || q.x >= N.x || q.y >= N.y) continue;
        vec4 An = texelFetch(uA, q, 0), Bn = texelFetch(uB, q, 0), Kn = texelFetch(uK, q, 0);
        vec2 d = normalize(vec2(i, j));
        float w = (i == 0 || j == 0) ? .6667 : .1667;
        float m = .5 * (An.r + th); m *= m;
        float g = dot(uGrain, d);
        float f1 = dot(K.gb, d), f2 = dot(Kn.gb, d);
        float fib = 1. + .8 * .5 * (K.a * f1 * f1 + Kn.a * f2 * f2);
        float qf = uDw * w * m * .5 * (K.r + Kn.r) * (1. + .55 * g * g) * fib * (An.r - th);
        dth += qf;
        vec3 cn = vec3(Bn.b, Bn.a, An.b) / (An.r + An.g + 1e-4);
        dD += qf * (qf > 0. ? cn : c);
        // and dissolved matter diffuses within the water itself
        dD += uDm * w * min(th + S, An.r + An.g) * (cn - c);
        mn = min(mn, An.r);
        // standing water above the pinning depth runs downhill to the three
        // cells below it, split by the slope of the cockled sheet
        if (j == -1) {
            vec4 Gq = texelFetch(uG, q, 0);
            // a bead on sized paper stays put; under the downpour the
            // standing water joins up and runs
            float outq = uSr * max(An.g - mix(uScrit, 3.5, abs(Gq.a)), 0.);
            if (outq > 0.) {
                float share = i == -1 ? Gq.b : i == 0 ? Gq.g : Gq.r;
                sIn += outq * share;
                dD += outq * share * cn;
            }
        }
    }
    float mask = texelFetch(uG, p, 0).a;
    float outp = uSr * max(S - mix(uScrit, 3.5, abs(mask)), 0.);
    dD -= outp * c;
    th += dth;
    S += sIn - outp;
    // rain: the many small drops of a downpour as an even wetting, and the
    // big drops one by one
    S += uRain * max(mask, 0.);
    for (int k = 0; k < 8; k++) {
        if (k >= uND) break;
        vec4 dr = uDrops[k];
        vec2 dv = vec2(p) + .5 - dr.xy;
        float r2 = dot(dv, dv) / (dr.z * dr.z);
        if (r2 < 1.) S += dr.w * (1. - r2);
    }
    // sized paper takes up standing water as fast as it has room
    float ab = min(S, uKa * pow(max(1. - th, 0.), 2.));
    th += ab; S -= ab;
    // evaporation, fastest at the thin edge of a wet patch
    float edge = clamp((th - mn) * 8., 0., 1.);
    th = max(th - uEv * (1. + 3. * edge), 0.);
    S = max(S - uEv * 14., 0.);
    // each dye (and the solubles) shares itself between the water and the
    // fibres: the more strongly held dye runs less far (chromatography)
    vec3 D = max(vec3(B.b, B.a, A.b) + dD, 0.);
    vec3 F = vec3(B.r, B.g, A.a);
    vec3 T = F + D;
    float Wn = th + S;
    float Wp = th + .12 * S;      // dye is taken up mostly by the water in the paper
    vec3 Dst = T * Wp / (Wp + uKb);
    D += (Dst - D) * mix(uAds, uDis, step(D, Dst));
    if (Wn < 1e-3) D = vec3(0.);
    F = T - D;
    oA = vec4(th, S, D.z, F.z);
    oB = vec4(F.x, F.y, D.x, D.y);
}`;

// state -> a filterable half-float copy for drawing
const PREP_FS = `#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D uA;
out vec4 o;
void main() { vec4 A = texelFetch(uA, ivec2(gl_FragCoord.xy), 0); o = vec4(A.r, A.g, A.a, A.b); }`;

const SHEET_VS = `#version 300 es
in vec2 a;
uniform vec4 uRect;
uniform float uMarg;
uniform vec2 uCanvas;
out vec2 vP;
void main() {
    vec2 p = mix(vec2(-uMarg), uRect.zw + uMarg, a);
    vP = p;
    vec2 c = uRect.xy + p;
    gl_Position = vec4(c.x / uCanvas.x * 2. - 1., 1. - c.y / uCanvas.y * 2., 0., 1.);
}`;

const SHEET_FS = `#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D uD, uB, uS, uInk, uVerso, uPaper, uNoise;
uniform vec2 uSheet, uN;
uniform vec3 uPaperC, uPaperM;
uniform float uDpr, uLight;
in vec2 vP;
out vec4 o;

float n1(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return texture(uNoise, (i + f + .5) / 256.).r; }
float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return texture(uNoise, (i + f + .5) / 256.).g; }

// smooth (cubic B-spline) sampling of a grid texture, from four bilinear taps
vec4 cubic(sampler2D t, vec2 p) {
    vec2 g = p / uSheet * uN - .5;
    vec2 i = floor(g), f = g - i;
    vec2 f2 = f * f, f3 = f2 * f;
    vec2 w0 = (1. - 3. * f + 3. * f2 - f3) / 6.;
    vec2 w1 = (4. - 6. * f2 + 3. * f3) / 6.;
    vec2 w2 = (1. + 3. * f + 3. * f2 - 3. * f3) / 6.;
    vec2 w3 = f3 / 6.;
    vec2 s0 = w0 + w1, s1 = w2 + w3;
    vec2 o0 = i - 1. + w1 / s0 + .5, o1 = i + 1. + w3 / s1 + .5;
    vec4 a = texture(t, vec2(o0.x, o0.y) / uN), b = texture(t, vec2(o1.x, o0.y) / uN);
    vec4 c = texture(t, vec2(o0.x, o1.y) / uN), d = texture(t, vec2(o1.x, o1.y) / uN);
    return mix(mix(d, c, s0.x), mix(b, a, s0.x), s0.y);
}

void main() {
    vec2 p = vP;
    vec2 e = min(p, uSheet - p);
    float cov = clamp(min(e.x, e.y) * uDpr + .5, 0., 1.);
    // the sheet's own soft shadow on the table
    vec2 q = p - vec2(1.5, 3.);
    vec2 dq = max(max(-q, q - uSheet), 0.);
    float sh = exp(-dot(dq, dq) / 70.) * .2 + exp(-dot(dq, dq) / 6.) * .08;
    vec4 under = vec4(vec3(.16, .13, .1) * sh, sh);
    if (cov <= 0.) { o = under; return; }
    vec2 pc = clamp(p, vec2(0.), uSheet);
    float h = uSheet.x / uN.x;              // one cell, in css px

    vec4 D0 = cubic(uD, pc);
    vec4 Dx1 = cubic(uD, pc + vec2(h, 0.)), Dx0 = cubic(uD, pc - vec2(h, 0.));
    vec4 Dy1 = cubic(uD, pc + vec2(0., h)), Dy0 = cubic(uD, pc - vec2(0., h));
    float th = D0.r;
    float S = D0.g;
    // standing water: a lens over the paper
    float sc = .42;
    vec2 gS = vec2(Dx1.g - Dx0.g, Dy1.g - Dy0.g) / (2. * h) * sc;
    float wS = smoothstep(.3, 1.6, S);
    vec2 pr = clamp(pc - gS * 2.6 * wS, vec2(0.), uSheet);
    vec2 uv = pr / uSheet;

    // wet: a ragged front at fibre scale, darker the wetter
    vec2 fq = vec2(pr.x * .9, pr.y * .22);
    float fibN = n1(pr * 1.7) * .6 + n2(fq * 1.3) * .4;
    float wetM = smoothstep(.02, .045, th + ((fibN - .5) * .1 + (n2(pr * .3) - .5) * .07) * smoothstep(.003, .02, th));
    float wet = wetM * (.5 + .5 * smoothstep(.04, .75, th)) + .25 * wS;
    float was = clamp((1. - D0.b) * 2.2, 0., 1.);

    vec3 pt = texture(uPaper, uv).rgb;
    vec3 col = pt * uPaperC / uPaperM;
    vec3 dryCol = col;
    float lum = dot(pt / uPaperM, vec3(.33));
    // wet paper: water fills the air between the fibres, less light comes
    // back, the cloudy formation of the sheet shows, and so does the back
    col *= 1. + (lum - 1.) * 2.8 * wet;
    col *= mix(vec3(1.), vec3(.93, .9, .815), clamp(wet, 0., 1.));
    vec3 wetCol = col;
    vec3 kA = vec3(1.66, 2.5, .99), kB = vec3(2.58, .87, .78);
    float vers = textureLod(uVerso, uv, .8).a;
    col *= exp(-mix(kA * .55 + kB * .45, vec3(1.4), .45) * vers * (.007 + .26 * wetM));

    // ink: the crisp written line, as much of it as is still fixed, plus the
    // dye that has run (dissolved, or set down again somewhere else)
    vec4 Bc = cubic(uB, pr);
    vec4 S0 = cubic(uS, pr);
    float a0 = .55 * S0.r, b0 = .45 * S0.r;
    float Ta = Bc.r + Bc.b, Tb = Bc.g + Bc.a;
    // a line that has been wet goes soft at the edges and feathers along
    // the fibres; how much is how much of its dye has run
    float lost = S0.r > .02 ? clamp(1. - (Ta + Tb) / (a0 + b0), 0., 1.) : 0.;
    float soak = max(was, wetM);
    float crisp = texture(uInk, uv).a;
    // wetted ink spreads out from the stroke in every direction: a soft
    // halo hugging it, broken into fine tendrils along the fibres, with the
    // turquoise running furthest
    float near = textureLod(uInk, uv, 1.6).a;
    float far = textureLod(uInk, uv, 2.7).a;
    vec2 tq = vec2(pr.x * 1.6, pr.y * .3);
    float tend = smoothstep(.45, .85, n1(tq * 1.1 + 3.) * .65 + n2(pr * 2.3) * .35);
    float line = mix(crisp, max(crisp * .8, near * .9), soak * (.15 + .6 * lost));
    float haloA = soak * max(near - crisp, 0.) * (.08 + .4 * lost) * (.55 + .9 * tend);
    float haloB = soak * max(far - crisp * .7, 0.) * (.07 + .45 * lost) * (.5 + 1.1 * tend);
    float ra = a0 > .012 ? clamp(Ta / a0, 0., 1.) : 1.;
    float rb = b0 > .01 ? clamp(Tb / b0, 0., 1.) : 1.;
    float fibre = .62 + .76 * fibN;
    // dye that has run: what a cell holds beyond its own writing. Next to a
    // stroke that would hide the run dye under the stroke's share, so take
    // the level of the cells around as well
    vec2 ex = max(vec2(Ta - a0, Tb - b0), 0.);
    // the level of run dye in the clean paper round about (cells with no
    // writing of their own), so the ground next to a stroke gets it too
    vec2 exN = vec2(0.);
    float wN = 0.;
    for (int k = 0; k < 8; k++) {
        float an = float(k) * .7854 + .39;
        vec2 o = vec2(cos(an), sin(an)) * 2.2 * h;
        vec4 Bn = cubic(uB, pr + o), Sn = cubic(uS, pr + o);
        float wk = 1. - smoothstep(.02, .15, Sn.r);
        exN += max(vec2(Bn.r + Bn.b - .55 * Sn.r, Bn.g + Bn.a - .45 * Sn.r), 0.) * wk;
        wN += wk;
    }
    exN /= max(wN, 1e-3);
    ex = max(ex, exN * smoothstep(0., 1., wN) * (1. - crisp));
    float amA = .55 * line * ra + ex.x * fibre * 2. + haloA * ra;
    float amB = .45 * line * rb + ex.y * fibre * 2.2 + haloB * (.5 + .5 * rb);
    col *= exp(-(kA * amA + kB * amB));

    // tide lines: the paper's solubles carried to the last dry edge and
    // left there, a thin brown line where the clean ground meets the deposit
    float Fs = D0.b;
    vec2 gF = vec2(Dx1.b - Dx0.b, Dy1.b - Dy0.b) / (2. * h);
    // one line at the last edge of each dried patch: sharp and darkest on
    // its outer side, fading over a few px into the cleaned ground inside
    float gFl = length(gF);
    float d2 = (Fs - .8 - (n2(pc * .09) - .5) * .1) / max(gFl, 1e-4);   // + outside, - inside
    float prof = d2 > 0. ? exp(-d2 * d2 / .35) : exp(d2 / 2.6) * .8;
    float tl2 = prof * smoothstep(.05, .16, gFl) * (1. - wetM) * (.55 + .6 * n1(pc * .07 + 9.));
    vec3 kT = vec3(.14, .24, .5);
    col *= exp(-kT * (max(Fs - 1., 0.) * .05 + tl2 * .75));
    col *= 1. + .01 * clamp(1. - D0.b, 0., 1.) * (1. - wetM);

    col = min(col, wetCol);

    // cockle: the sheet swells where wet and keeps some of it when dry
    float amp = 16. * (.6 * smoothstep(.02, .6, th) + .4 * was);
    float ax = amp * (cubic(uS, pc + vec2(h, 0.)).g - cubic(uS, pc - vec2(h, 0.)).g) / (2. * h);
    float ay = amp * (cubic(uS, pc + vec2(0., h)).g - cubic(uS, pc - vec2(0., h)).g) / (2. * h);
    vec3 L = normalize(vec3(-.42, -.62, .66));
    vec3 Nc = normalize(vec3(-ax, -ay, 1.));
    col *= .96 + .04 / L.z * dot(Nc, L);

    // the water itself: a dark rim, sky in the surface, a highlight
    vec3 Nw = normalize(vec3(-gS, 1.));
    float slope = length(gS);
    col *= 1. - .1 * smoothstep(.1, 1.2, slope) * wS;
    vec3 Hh = normalize(L + vec3(0., 0., 1.));
    float nh = max(dot(Nw, Hh), 0.);
    float fz = max(1. - Nw.z, 0.);
    float fres = .03 + .25 * fz * fz;
    col = mix(col, vec3(.9, .89, .86), fres * wS);
    col += wS * (pow(nh, 90.) * .35 * smoothstep(6., 11., S) + pow(nh, 14.) * .06) * vec3(1., .99, .97);
    // a satin sheen on soaked paper
    col += wet * .025 * pow(max(dot(Nc, Hh), 0.), 30.);

    col = clamp(col * uLight, 0., 1.);
    o = vec4(col * cov, cov) + under * (1. - cov);
}`;

function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
}
function program(gl, vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'a');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const U = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const u = gl.getActiveUniform(p, i); U[u.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, u.name); }
    return { p, U };
}

// ---- the component ----------------------------------------------------------------
export function pretextRain(root, opts = {}) {
    const letter = root && root.querySelector('.pr-letter');
    if (!root || !letter) return () => {};
    const stage = root.querySelector('.pr-stage') || root;
    const ds = root.dataset;
    const opt = (k, d) => opts[k] ?? ds[k] ?? d;
    const seed = String(opt('seed', '7')) === 'random' ? (Math.random() * 1e9) | 0 : Number(opt('seed', 7)) || 7;
    const aspect = Number(opt('aspect', 1.38));
    const leading = Number(opt('leading', 1.85));
    const heavy = clamp(Number(opt('heavy', 1)), 0, 3);

    root.classList.add('pr');
    let dead = false;
    const off = [];
    const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); off.push(() => t.removeEventListener(ev, fn, o)); };

    const canvas = document.createElement('canvas');
    canvas.className = 'pr-canvas';
    canvas.setAttribute('aria-hidden', 'true');

    let gl = null, SIM = null, PREP = null, SH = null, tex = {}, fbs = {}, bufs = {}, api;
    let font = { style: 'normal', weight: '400', family: 'cursive' };
    let paperRGB = [0.965, 0.945, 0.9];
    let L = null, ready = false, visible = false, raf = 0, last = 0;
    let paperImg = null;
    const PM = [232.8 / 255, 225.5 / 255, 212.3 / 255];

    // simulation bookkeeping
    let G = null;              // grid: { gw, gh }
    let cur = 0;               // actual steps simulated in the live state
    let ping = 0;              // which state set is live
    let cks = [];              // checkpoints: { step, A, B, fb }
    let sched = [];            // drops per base step
    const taps = [];           // { b, x, y, r, w, t0, n }
    let budget = 18, shown = -1, lightNow = 1, addedTab = false;

    // ---- layout -------------------------------------------------------------------
    function paragraphs() {
        return [...letter.querySelectorAll('p')].map((p) => {
            const c = p.className;
            const kind = /pr-date/.test(c) ? 'date' : /pr-greet/.test(c) ? 'greet' : /pr-close/.test(c) ? 'close'
                : /pr-sign/.test(c) ? 'sign' : /pr-ps/.test(c) ? 'ps' : /pr-verso/.test(c) ? 'verso' : 'body';
            return { kind, text: p.textContent.replace(/\s+/g, ' ').trim() };
        }).filter((p) => p.text);
    }
    const spec = (s) => `${font.style} ${font.weight} ${s}px ${font.family}`;

    function setLetter(paras, size, width) {
        const lead = size * leading;
        const lines = [];
        let y = 0, prevKind = null;
        for (const pa of paras) {
            const gap = prevKind === null ? 0 : pa.kind === 'greet' ? 0.7 : pa.kind === 'close' ? 0.5 : pa.kind === 'sign' ? 0
                : pa.kind === 'ps' ? 0.6 : pa.kind === 'body' && prevKind === 'greet' ? 0.15 : 0.1;
            y += gap * lead;
            let cur = { segmentIndex: 0, graphemeIndex: 0 }, first = true;
            const left = pa.kind === 'close' ? 0.4 * width : pa.kind === 'sign' ? 0.58 * width : 0;
            for (;;) {
                const ind = pa.kind === 'body' && first ? 2.2 * size : 0;
                const ln = api.layoutNextLine(pa.P, cur, ((width - left - ind) * REF) / size);
                if (!ln) break;
                const w = (ln.width * size) / REF;
                const x = pa.kind === 'date' ? width - w : left + ind;
                lines.push({ text: ln.text.trim(), x, y, kind: pa.kind });
                cur = ln.end; y += lead; first = false;
            }
            prevKind = pa.kind;
        }
        return { lines, h: y - lead + size * 0.5 };
    }

    function geometry() {
        const vw = stage.clientWidth || innerWidth;
        const vh = innerHeight;
        const phone = vw < 640;
        const my = phone ? Math.max(18, vh * 0.04) : Math.max(36, vh * 0.065);
        const mx = phone ? 16 : 40;
        let W = Math.min(vw - 2 * mx, (vh - 2 * my) / aspect, 600);
        let H = W * aspect;
        if (phone) H = Math.min(vh - 2 * my, W * Math.max(aspect, 1.7));
        W = Math.round(W); H = Math.round(H);
        return { vw, vh, W, H, x: Math.round((vw - W) / 2), y: Math.round((vh - H) / 2), phone };
    }

    function layout() {
        const g = geometry();
        const all = paragraphs();
        all.forEach((p) => { p.P = api.prepareWithSegments(p.text, spec(REF)); });
        const front = all.filter((p) => p.kind !== 'verso');
        const back = all.filter((p) => p.kind === 'verso').map((p) => ({ ...p, kind: 'body' }));
        const padX = Math.round(g.W * (g.phone ? 0.075 : 0.09)), padT = Math.round(g.W * 0.09), padB = Math.round(g.W * 0.08);
        const tw = g.W - 2 * padX, th = g.H - padT - padB;
        let lo = 5, hi = 30;
        for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; if (setLetter(front, m, tw).h <= th) lo = m; else hi = m; }
        const size = Math.floor(lo * 8) / 8;
        const set = setLetter(front, size, tw);
        const verso = back.length ? setLetter(back, size, tw).lines : [];
        const dpr = Math.min(2, devicePixelRatio || 1);
        const top = padT + (th - set.h) * 0.3;
        L = { ...g, size, padX, top, lines: set.lines, verso, dpr };
    }

    // the hand: a drifting baseline, a slight slope, ink running drier
    // between dips of the pen
    function writeLines(x, lines, r, mirror) {
        const { size, W } = L;
        const space = x.measureText(' ').width;
        let sinceDip = 0, dipAt = 6 + ((r() * 6) | 0), drift = 0;
        for (const ln of lines) {
            drift = drift * 0.6 + (r() - 0.5) * 0.12 * size;
            const base = L.top + ln.y + size;
            const ang = (r() - 0.62) * 0.012;
            x.save();
            if (mirror) { x.translate(W, 0); x.scale(-1, 1); }
            x.translate(L.padX + ln.x, base + drift);
            x.rotate(ang);
            let wx = 0;
            for (const w of ln.text.split(' ').filter(Boolean)) {
                if (sinceDip >= dipAt) { sinceDip = 0; dipAt = 5 + ((r() * 7) | 0); }
                x.globalAlpha = 0.97 - 0.28 * (sinceDip / 11) - r() * 0.04;
                sinceDip++;
                x.fillText(w, wx, (r() - 0.5) * 0.07 * size);
                wx += x.measureText(w).width + space * (0.92 + r() * 0.2);
            }
            x.restore();
        }
    }
    function writeInk(lines, mirror, scale) {
        const { W, H, size } = L;
        const k = L.dpr * scale;
        const c = document.createElement('canvas');
        c.width = Math.round(W * k); c.height = Math.round(H * k);
        const x = c.getContext('2d');
        x.setTransform(k, 0, 0, k, 0, 0);
        x.font = spec(size);
        x.textBaseline = 'alphabetic';
        x.fillStyle = '#fff';
        writeLines(x, lines, rng(seed * 13 + (mirror ? 77 : 5)), mirror);
        return c;
    }

    // ---- GL -----------------------------------------------------------------------
    function texture(name, unit, w, h, ifmt, fmt, type, data, filter, wrap) {
        if (!tex[name]) tex[name] = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, tex[name]);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        if (data && !ArrayBuffer.isView(data)) gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, fmt, type, data);
        else gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, fmt, type, data);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter === gl.LINEAR_MIPMAP_LINEAR ? gl.LINEAR : filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap || gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap || gl.CLAMP_TO_EDGE);
        if (filter === gl.LINEAR_MIPMAP_LINEAR) gl.generateMipmap(gl.TEXTURE_2D);
        return tex[name];
    }
    function stateTex(w, h, f32) {
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texStorage2D(gl.TEXTURE_2D, 1, f32 ? gl.RGBA32F : gl.RGBA16F, w, h);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f32 ? gl.NEAREST : gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f32 ? gl.NEAREST : gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return t;
    }
    function fbo(a, b) {
        const f = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, f);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, a, 0);
        if (b) gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, b, 0);
        gl.drawBuffers(b ? [gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1] : [gl.COLOR_ATTACHMENT0]);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('fbo');
        return f;
    }

    function initGL() {
        gl = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: false });
        if (!gl) throw new Error('no webgl2');
        if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('no float targets');
        SIM = program(gl, QUAD_VS, SIM_FS);
        PREP = program(gl, QUAD_VS, PREP_FS);
        SH = program(gl, SHEET_VS, SHEET_FS);
        bufs.quad = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, bufs.quad);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
        bufs.vao = gl.createVertexArray();
        gl.bindVertexArray(bufs.vao);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        const nz = new Uint8Array(256 * 256 * 4), r = rng(seed * 31 + 3);
        for (let i = 0; i < nz.length; i++) nz[i] = (r() * 256) | 0;
        texture('noise', 6, 256, 256, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, nz, gl.LINEAR, gl.REPEAT);
        texture('paper', 5, 0, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, paperImg, gl.LINEAR_MIPMAP_LINEAR);
    }

    // ---- the sheet's fixed properties ------------------------------------------------
    // K: permeability (dense flocs of the real sheet wick slower), and the
    // fibres: short segments, mostly along the grain, that wick faster along
    // their length (this is what feathers the ink).
    // G: how standing water divides between the three cells below it, from
    // the slope of the sheet plus its cockle.
    // S: the written ink per cell (the dye's starting place) and the cockle.
    function staticFields(inkC) {
        const gw = GW, gh = Math.round(GW * L.H / L.W);
        const N = gw * gh, R = rng(seed * 5 + 11);
        // paper formation from the real sheet
        const pc = document.createElement('canvas');
        pc.width = gw; pc.height = gh;
        const px = pc.getContext('2d', { willReadFrequently: true });
        px.drawImage(paperImg, 0, 0, gw, gh);
        const pd = px.getImageData(0, 0, gw, gh).data;
        let mean = 0;
        for (let i = 0; i < N; i++) mean += pd[i * 4] + pd[i * 4 + 1] + pd[i * 4 + 2];
        mean /= N * 3;
        const K = new Float32Array(N * 4);
        for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
            const k = j * gw + i;
            const lum = (pd[k * 4] + pd[k * 4 + 1] + pd[k * 4 + 2]) / 3 - mean;
            const nz = fbm(i / 7, j / 7, seed + 3, 3) - 0.5;
            K[k * 4] = clamp(1 + lum * 0.05 + nz * 0.9 + (fbm(i / 2.5, j / 2.5, seed + 5, 2) - 0.5) * 0.35, 0.66, 1.34);
        }
        const nf = Math.round(N * 0.05);
        for (let f = 0; f < nf; f++) {
            const ang = Math.PI / 2 + (R() + R() + R() - 1.5) * 0.9;
            const len = 3 + R() * 9, st = 0.55 + R() * 0.45;
            const cx = R() * gw, cy = R() * gh, dx = Math.cos(ang), dy = Math.sin(ang);
            for (let s = -len / 2; s <= len / 2; s += 0.5) {
                const i = Math.round(cx + dx * s), j = Math.round(cy + dy * s);
                if (i < 0 || j < 0 || i >= gw || j >= gh) continue;
                const k = (j * gw + i) * 4;
                if (K[k + 3] < st) { K[k + 1] = dx; K[k + 2] = dy; K[k + 3] = st; }
            }
        }
        // cockle: soft waves a few cm across, their ridges along the grain
        const ck = new Float32Array(N);
        for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
            ck[j * gw + i] = fbm(i / 15, j / 34, seed + 41, 3) - 0.5 + 0.35 * (fbm(i / 6, j / 9, seed + 43, 2) - 0.5);
        }
        const Gw = new Float32Array(N * 4);
        const beta = 7.5, Ac = 5.5;
        for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
            const k = j * gw + i;
            const ws = [];
            let sum = 0;
            for (const dx of [-1, 0, 1]) {
                const ii = i + dx, jj = Math.min(gh - 1, j + 1);
                if (ii < 0 || ii >= gw) { ws.push(0); continue; }
                const drop = 1 + Ac * (ck[k] - ck[jj * gw + ii]);
                const w = Math.exp(beta * drop / Math.hypot(dx, 1));
                ws.push(w); sum += w;
            }
            for (let d = 0; d < 3; d++) Gw[k * 4 + d] = ws[d] / sum;
            // where the downpour falls hardest: drips off the hedge above
            // the table, heavier toward one side
            const mx = fbm(i / 55, j / 55, seed + 61, 3);
            Gw[k * 4 + 3] = ss(0.6, 0.72, mx * 0.75 + 0.25 * (i / gw));
        }
        // the rivulets: from the lowest edge of the soaked patch, the water
        // finds its way down the valleys of the cockle. Along that path the
        // standing water is not pinned (stored negative: no extra rain there)
        const starts = [];
        for (let i = 2; i < gw - 2; i++) {
            for (let j = gh - 1; j >= 0; j--) if (Gw[(j * gw + i) * 4 + 3] > 0.75) { starts.push([j, i]); break; }
        }
        starts.sort((a, b) => b[0] - a[0]);
        const picked = [];
        for (const st of starts) { if (picked.every((p) => Math.abs(p[1] - st[1]) > 18)) picked.push(st); if (picked.length === 2) break; }
        for (const [j0, i0] of picked) {
            let i = i0;
            for (let j = j0; j < gh; j++) {
                for (let di = -2; di <= 2; di++) {
                    const ii = i + di;
                    if (ii < 0 || ii >= gw) continue;
                    const kk = (j * gw + ii) * 4 + 3, v = Math.exp(-di * di / 2.2);
                    if (Gw[kk] < 0.5) Gw[kk] = -Math.max(-Gw[kk], v);
                }
                const k = j * gw + i;
                const w = [Gw[k * 4], Gw[k * 4 + 1], Gw[k * 4 + 2]];
                i = Math.min(gw - 1, Math.max(0, i + w.indexOf(Math.max(...w)) - 1));
            }
        }
        // ink per cell
        const sm = document.createElement('canvas');
        sm.width = gw; sm.height = gh;
        const sx = sm.getContext('2d', { willReadFrequently: true });
        sx.imageSmoothingQuality = 'high';
        sx.drawImage(inkC, 0, 0, gw, gh);
        const id = sx.getImageData(0, 0, gw, gh).data;
        const Sf = new Float32Array(N * 4);
        const A0 = new Float32Array(N * 4), B0 = new Float32Array(N * 4);
        for (let k = 0; k < N; k++) {
            const ink = id[k * 4 + 3] / 255;
            Sf[k * 4] = ink; Sf[k * 4 + 1] = ck[k];
            A0[k * 4 + 3] = 1;                     // the paper's own solubles
            B0[k * 4] = 0.55 * ink; B0[k * 4 + 1] = 0.45 * ink;
        }
        return { gw, gh, K, Gw, Sf, A0, B0 };
    }

    // ---- the shower -----------------------------------------------------------------
    // drops per step over the shower: a few first drops, a downpour, easing off
    function rate(f) {
        if (f < 0.04 || f > 0.63) return 0;
        if (f < 0.3) return 0.02;
        const up = ss(0.3, 0.47, f), down = 1 - ss(0.55, 0.63, f);
        return mix(0.02, 0.055 * heavy, up) * down;
    }
    function film(f) { return 0.011 * heavy * ss(0.43, 0.49, f) * (1 - ss(0.55, 0.6, f)); }
    function evap(f) { return 0.00003 + 0.00055 * ss(0.6, 0.69, f); }
    function schedule() {
        const R = rng(seed * 101 + 7);
        const { gw, gh } = G;
        sched = [];
        let acc = R();
        let first = 0;
        for (let b = 0; b < NB; b++) {
            const f = b / NB;
            acc += rate(f);
            const list = [];
            while (acc >= 1) {
                acc -= 1;
                // the first few land well inside the sheet, on the writing
                const inner = first < 6;
                const x = inner ? (0.12 + R() * 0.76) * gw : (-0.03 + R() * 1.06) * gw;
                const y = inner ? (0.12 + R() * 0.7) * gh : (-0.03 + R() * 1.06) * gh;
                // most drops small, a few big ones
                const big = Math.pow(R(), 2.2);
                const r = gw * (0.008 + 0.017 * big);
                const w = 6 + 7 * big + R() * 1.5;
                list.push([x, y, r, w]);
                first++;
                // some come down two or three together, or smear a little
                // down the slope as they land: irregular, merged spots
                if (R() < 0.35) {
                    const n = 1 + ((R() * 2) | 0);
                    for (let s = 0; s < n; s++) {
                        const down = R() < 0.6;
                        const ox = down ? (R() - 0.5) * 0.8 * r : (R() - 0.5) * 2.4 * r;
                        const oy = down ? r * (0.8 + R() * 0.9) : (R() - 0.5) * 2.4 * r;
                        list.push([x + ox, y + oy, r * (0.55 + R() * 0.4), w * (0.6 + R() * 0.3)]);
                    }
                }
                // a splash throws a few small droplets round the drop
                if (R() < 0.3) {
                    const n = 1 + ((R() * 2) | 0);
                    for (let s = 0; s < n; s++) {
                        const a = R() * 6.283, d = r * (1.8 + R() * 2.6);
                        list.push([x + Math.cos(a) * d, y + Math.sin(a) * d, gw * (0.0035 + R() * 0.004), 3 + R() * 2.5]);
                    }
                }
            }
            sched.push(list);
        }
    }

    // the timeline: base steps with tapped drops' soak-in steps inserted
    function locate(s) {
        let offset = 0;
        for (const t of taps) {
            const start = t.b + offset;
            if (s < start) return { b: s - offset, tap: null };
            if (s < start + TAP_STEPS) return { b: t.b, tap: t, k: s - start };
            offset += TAP_STEPS;
        }
        return { b: s - offset, tap: null };
    }
    function actualOf(b, now) {
        let s = b;
        for (const t of taps) {
            if (t.b > b) break;
            s += calm.matches ? TAP_STEPS : Math.min(TAP_STEPS, Math.floor((now - t.t0) / 1000 * TAP_RATE));
        }
        return s;
    }

    // ---- stepping -------------------------------------------------------------------
    const dropBuf = new Float32Array(32);
    function step(s) {
        const at = locate(s);
        const f = at.b / NB;
        let n = 0;
        const add = (d) => { if (n < 8) { dropBuf.set(d, n * 4); n++; } };
        if (at.tap) { if (at.k === 0) add([at.tap.x, at.tap.y, at.tap.r, at.tap.w]); }
        else (sched[at.b] || []).forEach(add);
        gl.uniform1f(SIM.U.uEv, evap(f));
        gl.uniform1f(SIM.U.uRain, at.tap ? 0 : film(f));
        for (let it = 0; it < ITER; it++) {
            const src = ping, dst = 1 - ping;
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbs.state[dst]);
            gl.uniform1i(SIM.U.uND, it ? 0 : n);
            if (n && !it) gl.uniform4fv(SIM.U.uDrops, dropBuf);
            gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex.A[src]);
            gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tex.B[src]);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            ping = dst;
        }
        cur = s + 1;
    }
    function beginSim() {
        gl.useProgram(SIM.p);
        gl.bindVertexArray(bufs.vao);
        gl.disable(gl.BLEND);
        gl.viewport(0, 0, G.gw, G.gh);
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, tex.K);
        gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, tex.G);
    }
    function blit(fromFb, toFb) {
        const { gw, gh } = G;
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fromFb);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, toFb);
        for (const att of [0, 1]) {
            gl.readBuffer(gl.COLOR_ATTACHMENT0 + att);
            gl.drawBuffers(att ? [gl.NONE, gl.COLOR_ATTACHMENT1] : [gl.COLOR_ATTACHMENT0, gl.NONE]);
            gl.blitFramebuffer(0, 0, gw, gh, 0, 0, gw, gh, gl.COLOR_BUFFER_BIT, gl.NEAREST);
        }
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, toFb);
        gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    function saveCk() {
        if (cks.some((c) => c.step === cur)) return;
        const A = stateTex(G.gw, G.gh, true), B = stateTex(G.gw, G.gh, false);
        const fb = fbo(A, B);
        blit(fbs.state[ping], fb);
        cks.push({ step: cur, A, B, fb });
        cks.sort((a, b) => a.step - b.step);
    }
    function dropCksAfter(s) {
        cks = cks.filter((c) => {
            if (c.step <= s) return true;
            gl.deleteFramebuffer(c.fb); gl.deleteTexture(c.A); gl.deleteTexture(c.B);
            return false;
        });
    }
    function restore(s) {
        let c = cks[0];
        for (const k of cks) if (k.step <= s) c = k;
        blit(c.fb, fbs.state[ping]);
        cur = c.step;
    }
    // advance the live state toward step `to`; returns true when there
    function advance(to, maxSteps) {
        if (to < cur) restore(to);
        beginSim();
        let n = 0;
        while (cur < to && n < maxSteps) {
            step(cur);
            n++;
            if (cur % CK === 0) saveCk();
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return cur === to;
    }

    // ---- build -------------------------------------------------------------------------
    function build() {
        layout();
        const inkC = writeInk(L.lines, false, 1);
        const versoC = writeInk(L.verso, true, 0.5);
        const F = staticFields(inkC);
        // drop old sim resources
        dropCksAfter(-1);
        ['A', 'B'].forEach((k) => (tex[k] || []).forEach((t) => gl.deleteTexture(t)));
        (fbs.state || []).forEach((f) => gl.deleteFramebuffer(f));
        if (fbs.prep) gl.deleteFramebuffer(fbs.prep);
        G = { gw: F.gw, gh: F.gh };
        tex.A = [stateTex(G.gw, G.gh, true), stateTex(G.gw, G.gh, true)];
        tex.B = [stateTex(G.gw, G.gh, false), stateTex(G.gw, G.gh, false)];
        for (let i = 0; i < 2; i++) {
            gl.bindTexture(gl.TEXTURE_2D, tex.A[i]);
            gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, G.gw, G.gh, gl.RGBA, gl.FLOAT, F.A0);
            gl.bindTexture(gl.TEXTURE_2D, tex.B[i]);
            gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, G.gw, G.gh, gl.RGBA, gl.FLOAT, F.B0);
        }
        fbs.state = [fbo(tex.A[0], tex.B[0]), fbo(tex.A[1], tex.B[1])];
        if (tex.Dsp) gl.deleteTexture(tex.Dsp);
        tex.Dsp = stateTex(G.gw, G.gh, false);
        fbs.prep = fbo(tex.Dsp);
        tex.K = texture('K', 2, G.gw, G.gh, gl.RGBA32F, gl.RGBA, gl.FLOAT, F.K, gl.NEAREST);
        tex.G = texture('G', 3, G.gw, G.gh, gl.RGBA32F, gl.RGBA, gl.FLOAT, F.Gw, gl.NEAREST);
        texture('S', 4, G.gw, G.gh, gl.RGBA16F, gl.RGBA, gl.FLOAT, F.Sf, gl.LINEAR);
        texture('ink', 7, 0, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, inkC, gl.LINEAR_MIPMAP_LINEAR);
        texture('verso', 8, 0, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, versoC, gl.LINEAR_MIPMAP_LINEAR);
        ping = 0; cur = 0;
        canvas.width = Math.round(L.vw * L.dpr);
        canvas.height = Math.round(L.vh * L.dpr);
        // the paper's physics, in grid cells and steps
        gl.useProgram(SIM.p);
        ['uA', 'uB', 'uK', 'uG'].forEach((k, i) => gl.uniform1i(SIM.U[k], i));
        gl.uniform1f(SIM.U.uDw, 0.082);
        gl.uniform1f(SIM.U.uScrit, 16.);
        gl.uniform1f(SIM.U.uSr, 0.5);
        gl.uniform1f(SIM.U.uKa, 0.3);
        gl.uniform1f(SIM.U.uDm, 0.002);
        gl.uniform3f(SIM.U.uKb, 16., 3., 0.15);     // violet held hardest, turquoise runs, solubles go with the water
        gl.uniform3f(SIM.U.uDis, 0.08, 0.12, 0.12);
        gl.uniform3f(SIM.U.uAds, 0.2, 0.12, 0.25);
        gl.uniform2f(SIM.U.uGrain, 0, 1);
        gl.useProgram(SH.p);
        ['uD', 'uB', 'uS', 'uInk', 'uVerso', 'uPaper', 'uNoise'].forEach((k) => gl.uniform1i(SH.U[k], { uD: 9, uB: 1, uS: 4, uInk: 7, uVerso: 8, uPaper: 5, uNoise: 6 }[k]));
        gl.uniform2f(SH.U.uSheet, L.W, L.H);
        gl.uniform2f(SH.U.uN, G.gw, G.gh);
        gl.uniform3f(SH.U.uPaperC, ...paperRGB);
        gl.uniform3f(SH.U.uPaperM, ...PM);
        gl.uniform1f(SH.U.uDpr, L.dpr);
        schedule();
        saveCk();
        ready = true;
        root.classList.add('is-live');
        shown = -1;
    }

    // ---- draw ---------------------------------------------------------------------------
    function draw(light) {
        gl.bindVertexArray(bufs.vao);
        gl.disable(gl.BLEND);
        gl.useProgram(PREP.p);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbs.prep);
        gl.viewport(0, 0, G.gw, G.gh);
        gl.uniform1i(PREP.U.uA, 0);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex.A[ping]);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(SH.p);
        gl.activeTexture(gl.TEXTURE9); gl.bindTexture(gl.TEXTURE_2D, tex.Dsp);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tex.B[ping]);
        gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, tex.S);
        gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, tex.paper);
        gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, tex.noise);
        gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D, tex.ink);
        gl.activeTexture(gl.TEXTURE8); gl.bindTexture(gl.TEXTURE_2D, tex.verso);
        gl.uniform4f(SH.U.uRect, L.x, L.y, L.W, L.H);
        gl.uniform1f(SH.U.uMarg, 22);
        gl.uniform2f(SH.U.uCanvas, L.vw, L.vh);
        gl.uniform1f(SH.U.uLight, light);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        shown = cur;
    }

    // ---- time ----------------------------------------------------------------------------
    function progress() {
        if (calm.matches) return 1;
        const r = root.getBoundingClientRect();
        const run = r.height - innerHeight;
        if (run <= 0) return 1;
        return clamp(-r.top / run);
    }
    const baseAt = (p) => Math.round(NB * clamp((p - 0.02) / 0.94));
    // the light under the cloud: a little greyer while it rains
    function lightAt(b) {
        const f = b / NB;
        return 1 - 0.07 * ss(0.22, 0.42, f) * (1 - ss(0.6, 0.74, f));
    }

    function emitDrops(from, to) {
        let n = 0, sent = 0;
        for (let s = from; s < to && sent < 3; s++) {
            const at = locate(s);
            const list = at.tap ? [] : (sched[at.b] || []);
            for (const d of list) {
                if (d[3] < 6) continue;             // the main drops, not their splashes
                n++;
                if (sent < 3) {
                    sent++;
                    root.dispatchEvent(new CustomEvent('pretext-rain:drop', {
                        bubbles: true,
                        detail: { x: L.x + d[0] / G.gw * L.W, y: L.y + d[1] / G.gh * L.H, size: d[2] / G.gw, tap: false, intensity: rate(at.b / NB) },
                    }));
                }
            }
        }
        return n;
    }

    function frame(now) {
        raf = 0;
        if (dead || !ready) return;
        const dt = last ? now - last : 16;
        last = now;
        const b = baseAt(progress());
        const target = actualOf(b, now);
        const from = cur;
        const back = target < cur;
        const lim = calm.matches ? 400 : budget;
        const done = advance(target, lim);
        if (!back && cur > from && !calm.matches) emitDrops(from, cur);
        const light = calm.matches ? 1 : lightAt(locate(Math.max(0, cur - 1)).b);
        // while replaying from a checkpoint the last good frame stays up
        if (done || (!back && !calm.matches)) {
            if (cur !== shown || light !== lightNow) {
                draw(light);
                if (light !== lightNow) stage.style.backgroundColor = `rgb(${[243, 240, 232].map((c) => Math.round(c * light)).join(',')})`;
            }
            lightNow = light;
        }
        // keep a frame's work near 16ms
        if (!calm.matches && cur - from >= budget - 1) budget = dt > 22 ? Math.max(6, budget * 0.85) : dt < 18 ? Math.min(40, budget + 1) : budget;
        const tapping = taps.some((t) => !calm.matches && now - t.t0 < (TAP_STEPS / TAP_RATE) * 1000 + 100);
        if ((!done || tapping) && visible && !document.hidden) raf = requestAnimationFrame(frame);
        else last = 0;
    }
    const kick = () => { if (!raf && !dead && ready && visible) raf = requestAnimationFrame(frame); };
    on(window, 'scroll', kick, { passive: true });
    on(document, 'visibilitychange', kick);

    // ---- a tap lets one drop fall there -----------------------------------------------------
    let down = null;
    function dropAt(cx, cy, big) {
        if (!ready) return;
        const x = (cx - L.x) / L.W * G.gw, y = (cy - L.y) / L.H * G.gh;
        if (x < 0 || y < 0 || x > G.gw || y > G.gh) return;
        const b = baseAt(progress());
        const R = Math.random();
        const t = { b, x, y, r: G.gw * (0.02 + 0.008 * (big ?? R)), w: 12 + 2 * R, t0: performance.now() };
        // insert after any earlier taps at the same step
        let i = taps.length;
        while (i > 0 && taps[i - 1].b > b) i--;
        taps.splice(i, 0, t);
        // states after the insertion point are no longer valid
        let start = b;
        for (let k = 0; k < i; k++) start += TAP_STEPS;
        dropCksAfter(start);
        if (cur > start) restore(start);
        root.dispatchEvent(new CustomEvent('pretext-rain:drop', { bubbles: true, detail: { x: cx, y: cy, size: t.r / G.gw, tap: true, intensity: 0 } }));
        kick();
    }
    on(stage, 'pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    on(stage, 'pointerup', (e) => {
        if (!down) return;
        const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
        if (moved < 10 && performance.now() - down.t < 600) dropAt(e.clientX - stage.getBoundingClientRect().left, e.clientY - stage.getBoundingClientRect().top);
        down = null;
    });
    on(stage, 'pointercancel', () => { down = null; });
    on(stage, 'keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        if (!ready) return;
        e.preventDefault();
        const R = Math.random();
        dropAt(L.x + L.W * (0.2 + 0.6 * R), L.y + L.H * (0.2 + 0.6 * Math.random()));
    });

    // ---- start ------------------------------------------------------------------------------
    (async () => {
        try {
            const cs = getComputedStyle(letter);
            font = { style: cs.fontStyle, weight: opt('weight', cs.fontWeight), family: opt('font', cs.fontFamily) };
            paperRGB = colour(getComputedStyle(root).getPropertyValue('--pr-sheet').trim(), '#f6f0e2');
            const src = new URL('./assets/paper.webp', import.meta.url).href;
            const imgP = new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
            api = await import('./vendor/pretext/layout.js');
            try { await document.fonts.load(`${font.style} ${font.weight} 30px ${font.family}`, 'Dear'); await document.fonts.ready; } catch (e) { /* measure what we have */ }
            paperImg = await imgP;
            if (dead) return;
            stage.insertBefore(canvas, stage.firstChild);
            initGL();
            build();
        } catch (e) {
            console.warn('pretext-rain: showing the plain letter', e);
            canvas.remove();
            root.classList.remove('is-live');
            return;
        }
        if (!stage.hasAttribute('tabindex')) { stage.tabIndex = 0; addedTab = true; }
        const io = new IntersectionObserver((en) => {
            for (const e of en) visible = e.isIntersecting;
            if (visible) kick();
        });
        io.observe(root);
        off.push(() => io.disconnect());
        on(calm, 'change', () => { shown = -1; kick(); });
        let timer = 0, lastW = stage.clientWidth, lastH = innerHeight;
        const ro = new ResizeObserver(() => {
            const w = stage.clientWidth, h = innerHeight;
            if (w === lastW && Math.abs(h - lastH) < 120) return;
            lastW = w; lastH = h;
            clearTimeout(timer);
            timer = setTimeout(() => { if (!dead) { taps.length = 0; build(); kick(); } }, 180);
        });
        ro.observe(stage);
        off.push(() => { ro.disconnect(); clearTimeout(timer); });
        kick();
    })();

    function destroy() {
        dead = true;
        if (raf) cancelAnimationFrame(raf);
        off.forEach((f) => f());
        if (gl) {
            dropCksAfter(-1);
            const all = [...(tex.A || []), ...(tex.B || []), tex.Dsp, ...Object.values(tex).filter((t) => t instanceof WebGLTexture)];
            new Set(all).forEach((t) => t && gl.deleteTexture(t));
            [...(fbs.state || []), fbs.prep].forEach((f) => f && gl.deleteFramebuffer(f));
            if (bufs.quad) gl.deleteBuffer(bufs.quad);
            if (bufs.vao) gl.deleteVertexArray(bufs.vao);
            [SIM, PREP, SH].forEach((P) => P && gl.deleteProgram(P.p));
            const lose = gl.getExtension('WEBGL_lose_context');
            if (lose) lose.loseContext();
        }
        canvas.remove();
        stage.style.backgroundColor = '';
        if (addedTab) stage.removeAttribute('tabindex');
        root.classList.remove('pr', 'is-live');
    }
    destroy.debug = () => ({ cur, shown, budget, cks: cks.length, taps: taps.length, size: L && L.size, grid: G, raf: !!raf });
    destroy.drop = (x, y) => dropAt(x, y, 0.6);
    return destroy;
}

// Auto-start every [data-pretext-rain] once it is near the viewport.
document.querySelectorAll('[data-pretext-rain]').forEach((el) => {
    const go = () => { el.pretextRain = pretextRain(el); };
    if (!('IntersectionObserver' in window)) { go(); return; }
    const io = new IntersectionObserver((en) => {
        if (!en[0].isIntersecting) return;
        io.disconnect();
        go();
    }, { rootMargin: '800px' });
    io.observe(el);
});
