/*
 *  WINDOW-PANE // a painting seen through a cold window on a wet day.
 *
 *  Markup:  <figure data-window-pane>
 *             <img src="assets/caillebotte-paris-street-rainy-day.webp" alt="">
 *           </figure>
 *  Or call  windowPane(figure, { mist, rain, refog, writing, seed })  yourself.
 *  It returns destroy().
 *
 *  Options (data attributes, all optional; the options object wins):
 *    data-mist="0.85"     0-1, how thick the condensation is
 *    data-rain="0.5"      0-1, how hard it is raining outside
 *    data-refog="22"      seconds for a wipe to fog over again; 0 = never
 *    data-wiped="1"       a broad wipe someone made earlier, half fogged
 *                         back, with drips run down from it; 0 for none
 *    data-writing=""      a word already written there instead (letters
 *                         h e l o only), half fogged over
 *    data-seed="3"        the rain and the mist's grain
 *
 *  Two layers of water on one sheet of glass, in one WebGL2 context:
 *
 *    mist     condensation on the inside. A density map on the CPU (about one
 *             cell per 3 css px): wiped by a finger, refogging from the edges
 *             in and in faint haze everywhere, carrying a rim of droplets
 *             pushed up at each wipe's border, the wet film the finger leaves,
 *             and the oily trace that makes old writing come back as a ghost.
 *             Seen through it, the street is light scattered by millions of
 *             tiny lenses: a blur of the painting plus a little of it
 *             still sharp (exp(-k * density) gets through unscattered), under
 *             a luminous grey veil, with a fine grain of droplets up close.
 *    rain     drops on the outside, simulated after Lucas Bebber's Rain &
 *             Water Effect (Codrops, 2015): drops land, sit, grow by merging,
 *             and the heavy ones slip, stick and slip again, gathering the
 *             small ones and leaving a trail of tiny drops and a clean track
 *             that the drizzle fills again. Each frame they are drawn as
 *             normal-mapped lenses into a texture; the composite reads it to
 *             show the painting through every drop sharp, inverted and
 *             minified, with a dark rim, a highlight and a soft shadow. Seen
 *             through the mist (4 mm away, not 40 m) a drop is only a little
 *             softened: its own mip level.
 *
 *  Press and drag wipes (on a phone: a sideways stroke wipes at once, and a
 *  press held still for a quarter of a second wipes in any direction; a
 *  vertical swipe always scrolls). Fresh wipes drip.
 *
 *  Without WebGL2 (or with a cross-origin image) the <img> simply stays.
 *  Reduced motion: still drops on misted glass; wiping still works, and the
 *  wipe stays.
 */

const calm = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// ── handwriting ──────────────────────────────────────────────────────
// Glyphs in x-height units, y up from the baseline, each relative to its
// own origin; `adv` moves the pen on. One joined stroke per word.
const GLYPHS = {
    h: { adv: 0.98, p: [[0.02, 0.06], [0.34, 0.72], [0.6, 1.5], [0.66, 2.12], [0.52, 2.42], [0.34, 2.24], [0.25, 1.5], [0.2, 0.7], [0.16, 0.0],
                        [0.22, 0.42], [0.4, 0.82], [0.62, 0.96], [0.78, 0.74], [0.76, 0.3], [0.82, 0.04], [0.98, 0.1]] },
    e: { adv: 0.74, p: [[0.18, 0.34], [0.46, 0.6], [0.56, 0.86], [0.42, 1.0], [0.22, 0.84], [0.14, 0.42], [0.26, 0.07], [0.5, 0.0], [0.74, 0.14]] },
    l: { adv: 0.62, p: [[0.24, 0.6], [0.5, 1.34], [0.64, 2.0], [0.56, 2.42], [0.32, 2.34], [0.2, 1.8], [0.17, 1.0], [0.2, 0.32], [0.36, 0.0], [0.62, 0.1]] },
    o: { adv: 1.0, p: [[0.2, 0.62], [0.46, 0.98], [0.3, 0.94], [0.12, 0.6], [0.16, 0.14], [0.38, 0.0], [0.6, 0.22], [0.62, 0.68], [0.5, 0.97], [0.66, 0.9], [0.98, 0.98]] },
};
function catmull(pts, per) {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
        for (let k = 0; k < per; k++) {
            const t = k / per, t2 = t * t, t3 = t2 * t;
            out.push([0, 1].map((j) => 0.5 * (2 * p1[j] + (p2[j] - p0[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (3 * p1[j] - p0[j] - 3 * p2[j] + p3[j]) * t3)));
        }
    }
    out.push(pts[pts.length - 1].slice());
    return out;
}
/** A word in joined handwriting as one stroke of points: baseline-left at
 *  (x, y), x-height `size` px, `per` points per control point. */
export function cursive(word, x, y, size, per = 3, slant = 0.22, wide = 1.18) {
    const pts = [[-0.22, 0.12]];
    let ox = 0;
    for (const ch of String(word).toLowerCase()) {
        const g = GLYPHS[ch];
        if (!g) { ox += 0.6; continue; }
        for (const [gx, gy] of g.p) pts.push([ox + gx, gy]);
        ox += g.adv;
    }
    return catmull(pts, per).map(([u, v]) => [x + (u * wide + v * slant) * size, y - v * size]);
}
const wordWidth = (word) => ([...String(word).toLowerCase()].reduce((s, ch) => s + (GLYPHS[ch] ? GLYPHS[ch].adv : 0.6), 0)) * 1.18 + 0.8;

// ── shaders ──────────────────────────────────────────────────────────
const VERT = `#version 300 es
in vec2 p;
uniform float uFlip;
out vec2 vUv;
void main() { vUv = vec2(p.x * .5 + .5, .5 - p.y * .5); gl_Position = vec4(p.x, p.y * uFlip, 0., 1.); }`;

const COPY = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
in vec2 vUv; out vec4 o;
void main() { o = vec4(texture(uSrc, vUv).rgb, 1.); }`;

// separable gaussian, 25 taps at a quarter sigma
const BLUR = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uStep;
in vec2 vUv; out vec4 o;
void main() {
    vec3 s = vec3(0.); float n = 0.;
    for (int i = -12; i <= 12; i++) {
        float x = float(i) / 4.;
        float w = exp(-.5 * x * x);
        s += texture(uSrc, vUv + uStep * float(i)).rgb * w; n += w;
    }
    o = vec4(s / n, 1.);
}`;

// one drop: a lens of radius r, stretched as it runs, its outline a little
// irregular where the water is pinned to the glass
const DROP_V = `#version 300 es
in vec2 aCorner;
in vec4 aDrop;      // x, y (css px, y down), r, stretch
in vec3 aShape;     // seed, taper, irregularity
uniform vec2 uSize;
uniform float uDpr;
out vec2 vQ; out vec3 vS; out float vAA;
void main() {
    vec2 q = aCorner * 1.3;
    vec2 pos = aDrop.xy + vec2(q.x * aDrop.z, q.y * aDrop.z * aDrop.w);
    vQ = q; vS = aShape; vAA = 1.1 / max(aDrop.z * uDpr, .5);
    gl_Position = vec4(pos / uSize * 2. - 1., 0., 1.);
}`;
const DROP_F = `#version 300 es
precision highp float;
in vec2 vQ; in vec3 vS; in float vAA;
out vec4 o;
void main() {
    vec2 q = vQ;
    q.x /= 1. - vS.y * clamp(-q.y, 0., 1.) * .42;      // the trailing top of a running drop narrows
    float ang = atan(q.y, q.x);
    float rr = 1. + vS.z * (.6 * sin(2. * ang + vS.x * 6.283) + .4 * sin(3. * ang + vS.x * 17.1));
    float d = length(q) / rr;
    float a = 1. - smoothstep(1. - vAA, 1. + vAA, d);
    if (a <= 0.) discard;
    vec2 n = q / rr;
    float h = sqrt(max(0., 1. - d * d));
    o = vec4(n * .5 + .5, h, 1.) * a;
}`;

const COMP = `#version 300 es
precision highp float;
uniform sampler2D uImg;     // the painting, cropped to the canvas, mipmapped
uniform sampler2D uMid;     // blurred ~0.15% of the width
uniform sampler2D uHeavy;   // blurred ~0.5% of the width (sigma)
uniform sampler2D uVeil;    // blurred ~110 css px
uniform sampler2D uDrops;   // rain: rg normal, b height, a cover (premultiplied), mipmapped
uniform sampler2D uMist;    // r mist, g rim of pushed droplets, b wet film, a oily trace
uniform sampler2D uMicro;   // a tile of condensation droplets: rg normal, b height, a cover
uniform vec2 uSize;         // css px
uniform vec2 uReach;        // uv the scene shifts at a drop's rim (inverted, minified)
uniform float uDpr;
uniform float uTime;
uniform float uMistAmt;
uniform float uBias;        // a touch of mip bias: the street through glass, not the relief of the paint
in vec2 vUv; out vec4 o;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
    return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), f.x), f.y);
}
float fbm(vec2 p) { return vnoise(p) * .55 + vnoise(p * 2.03 + 7.1) * .3 + vnoise(p * 4.1 + 3.3) * .15; }
float luma(vec3 c) { return dot(c, vec3(.3, .55, .15)); }

// The scene through one drop: a lens that shows it inverted and small, with a
// dark rim (the steep edge mirrors the dim room), light gathered into the
// lower inner edge, and the window's highlight near the top.
vec3 drop(vec4 D, float bias) {
    float a = max(D.a, 1e-4);
    vec2 n = (D.rg / a) * 2. - 1.;
    float r = length(n);
    vec2 ruv = clamp(vUv - n * uReach, vec2(.002), vec2(.998));
    vec3 c = texture(uImg, ruv, bias).rgb;
    c = mix(vec3(luma(c)), c, 1.18) * 1.04;
    float rim = smoothstep(.62, .99, r);
    c *= 1. - .62 * rim * (.78 - .38 * n.y);           // darkest along the top, light gathered at the bottom
    c += .2 * smoothstep(.3, .8, r) * (1. - smoothstep(.82, .97, r)) * max(0., n.y) * (1. - abs(n.x));
    vec2 hp = (n - vec2(-.3, -.48)) * vec2(1., 1.5);
    c += vec3(1., .99, .97) * .62 * exp(-dot(hp, hp) * 70.);
    return c;
}

void main() {
    vec2 css = vUv * uSize;
    float s = min(uSize.x, uSize.y);
    vec4 M = texture(uMist, vUv);

    // where the glass is coldest: the bottom and the sides, never even, and
    // drifting a little as the room's air moves past it
    float bottom = smoothstep(.42, 1., vUv.y);
    float side = smoothstep(.55, 1., abs(vUv.x * 2. - 1.)) + smoothstep(.75, 1., 1. - vUv.y) * .5;
    float drift = fbm(css / (s * .42) + vec2(uTime * .012, -uTime * .007));
    float drift2 = vnoise(css / (s * .13) + vec2(-uTime * .02, uTime * .011));
    float base = clamp(.74 + .3 * bottom + .14 * side + (drift - .5) * .3 + (drift2 - .5) * .08, 0., 1.) * uMistAmt;

    // condensation droplets: a fine tile, and larger beads low on the pane,
    // on the rim of a wipe and over an oily trace
    vec4 m1 = texture(uMicro, css / 240.);
    vec4 m2 = texture(uMicro, (css * mat2(.8, -.6, .6, .8)) / 560. + .31);
    float big = clamp(bottom * bottom * .7 + M.a * .7 + M.g * 1.4, 0., 1.);
    vec4 mc = mix(m1, m2, big);

    // a wipe's border is ragged at the scale of the droplets
    float mm = M.r;
    mm = clamp(mm + (m1.b - .42) * .55 * mm * (1. - mm) * 4., 0., 1.);
    float dens = mm * base * (1. - .42 * M.a);
    float densL = dens * mix(.62, 1.1, mc.a);

    // clear glass: the painting sharp, every drop a sharp little lens
    vec3 img = texture(uImg, vUv, uBias).rgb;
    vec4 Ds = texture(uDrops, vUv);
    vec3 clear = img * (1. - Ds.a) + drop(Ds, 0.) * Ds.a;
    float halo = textureLod(uDrops, vUv - vec2(.6, 2.2) / uSize, 3.2).a;
    clear *= 1. - .24 * max(0., halo - Ds.a);

    // through the mist: scattered light, a blur of the street; drops a
    // few millimetres behind it are only a little softened
    vec2 wob = (mc.rg * 2. - 1.) * mc.a * 2.5 / uSize;
    vec3 mid = texture(uMid, vUv + wob).rgb;
    vec3 heavy = texture(uHeavy, vUv + wob * 3.).rgb;
    vec3 scat = mix(mid, heavy, smoothstep(.12, .62, dens));
    vec4 Dm = textureLod(uDrops, vUv, .8 + dens * 2.4);
    scat = scat * (1. - Dm.a * .92) + drop(Dm, 1. + dens * 1.5) * Dm.a * .92;
    float hm = textureLod(uDrops, vUv - vec2(.6, 2.6) / uSize, 3.6).a;
    scat *= 1. - .16 * max(0., hm - Dm.a);

    vec3 col = mix(scat, clear, exp(-6.5 * densL));

    // the veil: light from everywhere, scattered back toward the eye. A
    // luminous grey that keeps a little of the street's colour.
    vec3 vt = texture(uVeil, vUv).rgb;
    vec3 veil = mix(vt, vec3(luma(vt)), .62) * .7 + .3;
    col = mix(col, veil, clamp(densL * .74, 0., .76));

    // up close the mist is droplets: each catches the light above it and
    // darkens at its edge
    vec2 mn = mc.rg * 2. - 1.;
    float ml = length(mn);
    col += dens * mc.a * (.05 * -mn.y - .045 * smoothstep(.55, 1., ml) + .05 * exp(-dot(mn - vec2(-.25, -.45), mn - vec2(-.25, -.45)) * 20.));

    // the line of droplets a finger pushes up at the edge of its stroke
    vec2 bn = m2.rg * 2. - 1.;
    float bead = M.g * m2.a;
    float bl = length(bn);
    col = mix(col, veil * 1.06, bead * .55);
    col += bead * (.38 * exp(-dot(bn - vec2(-.25, -.42), bn - vec2(-.25, -.42)) * 22.) - .3 * smoothstep(.5, 1., bl));

    // the finger's wet film: a faint, streaky sheen while it dries
    col = mix(col, veil, M.b * .07 * (.6 + .8 * vnoise(css * vec2(.02, .12))));

    o = vec4(col, 1.);
}`;

// ── the drops ────────────────────────────────────────────────────────
function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// A tile of breath-figure droplets, 512 texels square, wrapping: many small
// ones packed close, a few larger, the gaps clear glass.
function microTile(rand) {
    const N = 512, data = new Uint8Array(N * N * 4);
    for (let i = 0; i < N * N; i++) { data[i * 4] = 128; data[i * 4 + 1] = 128; }
    const G = 8, gn = N / G, grid = Array.from({ length: gn * gn }, () => []);
    const placed = [];
    for (let k = 0; k < 30000; k++) {
        const big = rand() < 0.035;
        const r = big ? 3.2 + rand() * 3.2 : 0.9 + 2.3 * Math.pow(rand(), 2.2);
        const x = rand() * N, y = rand() * N;
        const gx = Math.floor(x / G), gy = Math.floor(y / G), reach = Math.ceil((r + 6.4) / G);
        let ok = true;
        for (let j = -reach; j <= reach && ok; j++) {
            for (let i = -reach; i <= reach && ok; i++) {
                for (const p of grid[((gy + j + gn) % gn) * gn + ((gx + i + gn) % gn)]) {
                    let dx = Math.abs(x - p[0]), dy = Math.abs(y - p[1]);
                    if (dx > N / 2) dx = N - dx;
                    if (dy > N / 2) dy = N - dy;
                    if (Math.hypot(dx, dy) < (r + p[2]) * 1.08 + 0.4) { ok = false; break; }
                }
            }
        }
        if (!ok) continue;
        const d = [x, y, r];
        placed.push(d);
        grid[gy * gn + gx].push(d);
    }
    for (const [x, y, r] of placed) {
        const R = Math.ceil(r + 1);
        for (let j = -R; j <= R; j++) {
            for (let i = -R; i <= R; i++) {
                const px = Math.floor(x) + i, py = Math.floor(y) + j;
                const dx = px + 0.5 - x, dy = py + 0.5 - y;
                const d = Math.hypot(dx, dy) / r;
                if (d >= 1.0 + 0.6 / r) continue;
                const o = ((((py % N) + N) % N) * N + (((px % N) + N) % N)) * 4;
                const h = Math.sqrt(Math.max(0, 1 - d * d));
                const cov = clamp((1 - d) * r * 1.4 + 0.5);
                if (cov * 255 <= data[o + 3] && h * 255 <= data[o + 2]) continue;
                data[o] = 128 + Math.round(clamp(dx / r, -1, 1) * 127);
                data[o + 1] = 128 + Math.round(clamp(dy / r, -1, 1) * 127);
                data[o + 2] = Math.round(h * 255);
                data[o + 3] = Math.round(cov * 255);
            }
        }
    }
    return { N, data };
}

export function windowPane(root, opts = {}) {
    const img = root && root.querySelector('img');
    if (!img) return () => {};
    const num = (k, d) => {
        const v = opts[k] ?? root.dataset[k];
        return v == null || v === '' || !isFinite(Number(v)) ? d : Number(v);
    };
    const cfg = {
        mist: clamp(num('mist', 0.85)),
        rain: clamp(num('rain', 0.5)),
        refog: Math.max(0, num('refog', 22)),
        wiped: num('wiped', 1) ? 1 : 0,
        writing: String(opts.writing ?? root.dataset.writing ?? ''),
        seed: Math.round(num('seed', 3)),
    };
    const still = () => calm.matches;

    let dead = false;
    let gl = null, canvas = null;
    let W = 0, H = 0, dpr = 1, CW = 0, CH = 0;
    const P = {};                       // programs
    const T = {};                       // textures
    const F = {};                       // framebuffers
    let quad = null, cornerBuf = null, instBuf = null, vaoDrops = null, vaoQuad = null;
    let visible = false, raf = 0, lastT = 0, lastDraw = 0, clock = 0;
    let sizeTimer = 0;
    const off = [];
    const on = (t, type, fn, o) => { t.addEventListener(type, fn, o); off.push(() => t.removeEventListener(type, fn, o)); };

    // ── GL plumbing ───────────────────────────────────────────────────
    function program(vs, fs, attribs) {
        const sh = (type, src) => {
            const s = gl.createShader(type);
            gl.shaderSource(s, src);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; }
            return s;
        };
        const v = sh(gl.VERTEX_SHADER, vs), f = sh(gl.FRAGMENT_SHADER, fs);
        if (!v || !f) throw new Error('shader');
        const p = gl.createProgram();
        gl.attachShader(p, v); gl.attachShader(p, f);
        attribs.forEach((a, i) => gl.bindAttribLocation(p, i, a));
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link');
        const u = {};
        const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
        for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i).name; u[name] = gl.getUniformLocation(p, name); }
        return { p, u };
    }
    function texture(w, h, { mip = false, wrap = gl.CLAMP_TO_EDGE, data = null } = {}) {
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
        if (w) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
        return t;
    }
    function target(w, h, mip = false) {
        const t = texture(w, h, { mip });
        const f = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, f);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return { t, f, w, h };
    }
    function freeRT(rt) {
        if (!rt) return;
        gl.deleteTexture(rt.t); gl.deleteFramebuffer(rt.f);
    }

    function initGL() {
        gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false });
        if (!gl) return false;
        P.copy = program(VERT, COPY, ['p']);
        P.blur = program(VERT, BLUR, ['p']);
        P.comp = program(VERT, COMP, ['p']);
        P.drop = program(DROP_V, DROP_F, ['aCorner', 'aDrop', 'aShape']);

        vaoQuad = gl.createVertexArray();
        gl.bindVertexArray(vaoQuad);
        quad = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

        vaoDrops = gl.createVertexArray();
        gl.bindVertexArray(vaoDrops);
        cornerBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        instBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 0);
        gl.vertexAttribDivisor(1, 1);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 28, 16);
        gl.vertexAttribDivisor(2, 1);
        gl.bindVertexArray(null);

        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        const mt = microTile(rng(cfg.seed * 7919 + 11));
        T.micro = texture(mt.N, mt.N, { mip: true, wrap: gl.REPEAT, data: mt.data });
        gl.generateMipmap(gl.TEXTURE_2D);
        return true;
    }

    // ── layout: the painting, its blurs, the maps ─────────────────────
    let cell = 3, cols = 0, rows = 0;
    let mist, rim, film, trace, rate, slow, mistPx;
    let box = null;                      // cells that are still changing
    let mistDirty = true;
    let RT = {};

    function layout() {
        const r = root.getBoundingClientRect();
        W = Math.max(1, r.width);
        H = Math.max(1, r.height);
        dpr = Math.min(devicePixelRatio || 1, 2);
        const max = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;
        dpr = Math.min(dpr, max / W, max / H);
        CW = Math.round(W * dpr); CH = Math.round(H * dpr);
        canvas.width = CW; canvas.height = CH;

        // the visible crop of the image (object-fit / object-position honoured)
        const cs = getComputedStyle(img);
        const iw = img.naturalWidth, ih = img.naturalHeight;
        let sx = 0, sy = 0, sw = iw, sh = ih;
        if (cs.objectFit === 'cover') {
            const k = Math.max(W / iw, H / ih);
            sw = W / k; sh = H / k;
            const pos = (cs.objectPosition || '50% 50%').split(' ');
            const frac = (s, room) => (s.endsWith('%') ? parseFloat(s) / 100 : room > 0 ? clamp(parseFloat(s) / room) : 0.5);
            sx = (iw - sw) * frac(pos[0] || '50%', (iw - sw) * k);
            sy = (ih - sh) * frac(pos[1] || '50%', (ih - sh) * k);
        }
        const c = document.createElement('canvas');
        c.width = CW; c.height = CH;
        const g = c.getContext('2d');
        g.imageSmoothingEnabled = true;
        g.imageSmoothingQuality = 'high';
        g.drawImage(img, sx, sy, sw, sh, 0, 0, CW, CH);
        if (T.img) gl.deleteTexture(T.img);
        T.img = texture(0, 0, { mip: true });
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);   // throws if cross-origin
        gl.generateMipmap(gl.TEXTURE_2D);
        c.width = c.height = 1;

        // blurs, made once: the street through mist of three thicknesses
        Object.values(RT).forEach(freeRT);
        RT = {};
        const mk = (k) => [Math.max(4, Math.round(W / k)), Math.max(4, Math.round(H / k))];
        const level = (name, k, sigmaCss, passes) => {
            const [w, h] = mk(k);
            const a = target(w, h), b = target(w, h);
            pass(P.copy, a, { uSrc: T.img });
            const sg = sigmaCss / k;          // in texels
            for (let i = 0; i < passes; i++) {
                pass(P.blur, b, { uSrc: a.t, uStep: [sg / 4 / w, 0] });
                pass(P.blur, a, { uSrc: b.t, uStep: [0, sg / 4 / h] });
            }
            freeRT(b);
            RT[name] = a;
        };
        // through condensation the street keeps its big shapes: a blur of
        // about 1% of the pane's width at full density, never under 4 px
        level('mid', 1, Math.max(1.5, W * 0.0015), 1);
        level('heavy', 2, Math.max(4, W * 0.0046), 1);
        level('veil', 24, 80, 1);
        RT.drops = target(CW, CH, true);

        // the mist map: about a cell per 3 css px
        cell = clamp(W / 480, 2.2, 3.2);
        cols = Math.max(16, Math.round(W / cell));
        rows = Math.max(16, Math.round(H / cell));
        const n = cols * rows;
        mist = new Float32Array(n).fill(1);
        rim = new Float32Array(n);
        film = new Float32Array(n);
        trace = new Float32Array(n);
        rate = new Float32Array(n);
        slow = new Float32Array(n).fill(1);
        mistPx = new Uint8Array(n * 4);
        // refog is not even: some patches nucleate sooner than others
        const rr = rng(cfg.seed * 31 + 5);
        const lat = [], LG = 9;
        const lw = Math.ceil(cols / LG) + 2, lh = Math.ceil(rows / LG) + 2;
        for (let i = 0; i < lw * lh; i++) lat.push(rr());
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const fx = x / LG, fy = y / LG, ix = Math.floor(fx), iy = Math.floor(fy);
                const tx = smooth(0, 1, fx - ix), ty = smooth(0, 1, fy - iy);
                const v = (lat[iy * lw + ix] * (1 - tx) + lat[iy * lw + ix + 1] * tx) * (1 - ty) + (lat[(iy + 1) * lw + ix] * (1 - tx) + lat[(iy + 1) * lw + ix + 1] * tx) * ty;
                rate[y * cols + x] = 0.55 + v * 0.9;
            }
        }
        if (T.mist) gl.deleteTexture(T.mist);
        T.mist = texture(cols, rows);
        box = null;
        mistDirty = true;

        reach = [Math.min(W, H) * 0.42 / W, Math.min(W, H) * 0.42 / H];
        size = clamp(Math.sqrt(W * H) / 1050, 0.8, 1.25);
        minR = 3 * size; maxR = 15 * size;
        finger = clamp(Math.min(W, H) * 0.02, 9, 15);
    }
    let reach = [0.1, 0.1], size = 1, minR = 2.3, maxR = 10.5, finger = 12;

    function pass(prog, rt, uni) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, rt ? rt.f : null);
        gl.viewport(0, 0, rt ? rt.w : CW, rt ? rt.h : CH);
        gl.useProgram(prog.p);
        gl.bindVertexArray(vaoQuad);
        gl.disable(gl.BLEND);
        let unit = 0;
        for (const [k, v] of Object.entries(uni)) {
            const loc = prog.u[k];
            if (loc == null) continue;
            if (v instanceof WebGLTexture) {
                gl.activeTexture(gl.TEXTURE0 + unit);
                gl.bindTexture(gl.TEXTURE_2D, v);
                gl.uniform1i(loc, unit++);
            } else if (Array.isArray(v)) {
                gl['uniform' + v.length + 'f'](loc, ...v);
            } else gl.uniform1f(loc, v);
        }
        if (prog.u.uFlip) gl.uniform1f(prog.u.uFlip, rt ? -1 : 1);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    // ── mist: wiping, refogging ───────────────────────────────────────
    const grow = (x0, y0, x1, y1) => {
        if (!box) box = [x0, y0, x1, y1];
        else { box[0] = Math.min(box[0], x0); box[1] = Math.min(box[1], y0); box[2] = Math.max(box[2], x1); box[3] = Math.max(box[3], y1); }
    };

    // A fingertip drawn from a to b (css px). Inside, the mist is gone and a
    // wet film is left; at the border the droplets it pushed aside stand in a
    // thin line; underneath, a trace of skin oil that fog will later find.
    // `k` < 1 for a lighter touch; `ghost` writes only the trace.
    function wipe(ax, ay, bx, by, R, k = 1, ghost = 0) {
        const pad = R + 3 * cell;
        const x0 = Math.max(0, Math.floor((Math.min(ax, bx) - pad) / cell)), x1 = Math.min(cols - 1, Math.ceil((Math.max(ax, bx) + pad) / cell));
        const y0 = Math.max(0, Math.floor((Math.min(ay, by) - pad) / cell)), y1 = Math.min(rows - 1, Math.ceil((Math.max(ay, by) + pad) / cell));
        if (x0 > x1 || y0 > y1) return;
        const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-6;
        const soft = Math.max(1.2 * cell, R * 0.12);
        for (let y = y0; y <= y1; y++) {
            const py = (y + 0.5) * cell;
            for (let x = x0; x <= x1; x++) {
                const px = (x + 0.5) * cell;
                const t = clamp(((px - ax) * dx + (py - ay) * dy) / L2);
                const d = Math.hypot(px - ax - dx * t, py - ay - dy * t);
                if (d > pad) continue;
                const j = y * cols + x;
                const c = (1 - smooth(R - soft, R + 0.25 * cell, d)) * k;
                if (ghost) { trace[j] = Math.max(trace[j], c * ghost); continue; }
                const ring = smooth(R - 0.3 * cell, R + 0.5 * cell, d) * (1 - smooth(R + 0.8 * cell, R + 2.6 * cell, d));
                const m0 = mist[j];
                mist[j] = m0 * (1 - c);
                rim[j] = Math.max(rim[j] * (1 - c), ring * m0);
                film[j] = Math.max(film[j], c);
                trace[j] = Math.max(trace[j], c * 0.8);
                if (c > 0.3) slow[j] = 1;
            }
        }
        if (!ghost) grow(x0, y0, x1, y1);
        mistDirty = true;
    }

    // slow refog: haze nucleating everywhere at its own pace, and the fog
    // creeping in from the edges of a wipe
    function refog(dt) {
        if (!box) return;
        const Tf = cfg.refog;
        if (!Tf || still()) return;
        const U = 2.5 / Tf, Gr = 0.32 * 22 / Tf, Kr = 1 / (Tf * 0.7), Kf = 1 / 5;
        const [x0, y0, x1, y1] = box;
        let nx0 = cols, ny0 = rows, nx1 = -1, ny1 = -1;
        const C = cols;
        for (let y = y0; y <= y1; y++) {
            const row = y * C;
            const up = y > 0 ? row - C : row, dn = y < rows - 1 ? row + C : row;
            for (let x = x0; x <= x1; x++) {
                const j = row + x;
                const m = mist[j];
                if (m < 0.997 || rim[j] > 0.01 || film[j] > 0.01) {
                    const avg = ((x > 0 ? mist[j - 1] : m) + (x < C - 1 ? mist[j + 1] : m) + mist[up + x] + mist[dn + x]) * 0.25;
                    const v = m + dt * slow[j] * (Gr * Math.max(0, avg - m) + U * rate[j] * (1.03 - m) * (0.14 + 0.86 * m));
                    mist[j] = v > 1 ? 1 : v;
                    rim[j] *= Math.exp(-dt * Kr);
                    film[j] *= Math.exp(-dt * Kf);
                    if (mist[j] < 0.997 || rim[j] > 0.01 || film[j] > 0.01) {
                        if (x < nx0) nx0 = x; if (x > nx1) nx1 = x; if (y < ny0) ny0 = y; if (y > ny1) ny1 = y;
                    }
                }
            }
        }
        box = nx1 < 0 ? null : [Math.max(0, nx0 - 1), Math.max(0, ny0 - 1), Math.min(cols - 1, nx1 + 1), Math.min(rows - 1, ny1 + 1)];
        mistDirty = true;
    }

    function uploadMist() {
        if (!mistDirty) return;
        mistDirty = false;
        const n = cols * rows;
        for (let j = 0; j < n; j++) {
            const o = j * 4;
            mistPx[o] = mist[j] * 255 + 0.5;
            mistPx[o + 1] = clamp(rim[j]) * 255 + 0.5;
            mistPx[o + 2] = clamp(film[j]) * 255 + 0.5;
            mistPx[o + 3] = clamp(trace[j]) * 255 + 0.5;
        }
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, T.mist);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, cols, rows, gl.RGBA, gl.UNSIGNED_BYTE, mistPx);
    }

    // ── drips on the inside: water a wipe gathered, running down ──────
    const drips = [];
    function drip(x, y, delay = 0, len = 0) {
        drips.push({ x, y, wait: delay, left: len || (22 + rand() * 90) * size, v: 0, r: (2.1 + rand() * 0.9) * size, pause: 0, wob: rand() * 6.28, seed: rand() });
    }
    function stepDrips(dt) {
        for (let i = drips.length - 1; i >= 0; i--) {
            const d = drips[i];
            if (d.wait > 0) { d.wait -= dt; continue; }
            if (d.left > 0) {
                if (d.pause > 0) d.pause -= dt;
                else {
                    d.v = 14 + 26 * rand();
                    const s = d.v * dt * size;
                    const nx = d.x + Math.sin(d.y * 0.09 + d.wob) * 0.12 * s;
                    const ny = d.y + s;
                    carve(d.x, d.y, nx, ny, d.r * 0.78);
                    d.x = nx; d.y = ny; d.left -= s;
                    if (rand() < dt * 1.6) d.pause = 0.2 + rand() * 0.9;
                    if (d.y > H + 4) d.left = 0;
                }
            } else {
                d.r -= dt * 0.05 * size;      // the bead at the end slowly goes
                if (d.r < 0.8 || d.y > H + 4) drips.splice(i, 1);
            }
        }
    }
    function carve(ax, ay, bx, by, R) {
        const pad = R + 2 * cell;
        const x0 = Math.max(0, Math.floor((Math.min(ax, bx) - pad) / cell)), x1 = Math.min(cols - 1, Math.ceil((Math.max(ax, bx) + pad) / cell));
        const y0 = Math.max(0, Math.floor((Math.min(ay, by) - pad) / cell)), y1 = Math.min(rows - 1, Math.ceil((Math.max(ay, by) + pad) / cell));
        if (x0 > x1 || y0 > y1) return;
        const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-6;
        for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
                const px = (x + 0.5) * cell, py = (y + 0.5) * cell;
                const t = clamp(((px - ax) * dx + (py - ay) * dy) / L2);
                const d = Math.hypot(px - ax - dx * t, py - ay - dy * t);
                const j = y * cols + x;
                const c = 1 - smooth(R * 0.55, R + 0.6 * cell, d);
                const ring = smooth(R * 0.6, R + 0.4 * cell, d) * (1 - smooth(R + 0.8 * cell, R + 2 * cell, d));
                const m0 = mist[j];
                mist[j] = Math.min(m0, m0 * (1 - 0.94 * c));
                rim[j] = Math.max(rim[j] * (1 - c), ring * m0 * 0.7);
                trace[j] = Math.max(trace[j], c * 0.5);
            }
        }
        grow(x0, y0, x1, y1);
        mistDirty = true;
    }

    // ── rain outside ──────────────────────────────────────────────────
    let rand = Math.random;
    let drops = [];
    // static drizzle: a few thousand tiny droplets, in flat arrays + a grid
    const DG = 24;
    let dl = { n: 0, x: null, y: null, r: null, s: null, alive: null }, dgrid = null, dgw = 0, dgh = 0;
    let dropletCap = 0;

    function resetRain() {
        rand = rng(cfg.seed * 1013 + 7);
        drops = [];
        drips.length = 0;
        const area = (W * H) / 1e6;
        dropletCap = Math.round(1700 * area);
        dl = { n: 0, x: new Float32Array(dropletCap), y: new Float32Array(dropletCap), r: new Float32Array(dropletCap), s: new Float32Array(dropletCap), alive: new Uint8Array(dropletCap) };
        dgw = Math.ceil(W / DG) + 1; dgh = Math.ceil(H / DG) + 1;
        dgrid = Array.from({ length: dgw * dgh }, () => []);
    }
    function addDroplet(x, y, r) {
        let i = dl.n;
        if (i >= dropletCap) {                       // full: reuse a dead slot, or give up
            i = -1;
            for (let k = 0; k < 6; k++) { const t = Math.floor(rand() * dropletCap); if (!dl.alive[t]) { i = t; break; } }
            if (i < 0) return;
        } else dl.n++;
        dl.x[i] = x; dl.y[i] = y; dl.r[i] = r; dl.s[i] = rand(); dl.alive[i] = 1;
        const g = Math.floor(y / DG) * dgw + Math.floor(x / DG);
        if (dgrid[g]) dgrid[g].push(i);
    }
    // Clear the drizzle under a running drop; returns the water picked up (r² sum)
    function clearDroplets(x, y, r) {
        let got = 0;
        const gx0 = Math.max(0, Math.floor((x - r) / DG)), gx1 = Math.min(dgw - 1, Math.floor((x + r) / DG));
        const gy0 = Math.max(0, Math.floor((y - r) / DG)), gy1 = Math.min(dgh - 1, Math.floor((y + r) / DG));
        for (let gy = gy0; gy <= gy1; gy++) {
            for (let gx = gx0; gx <= gx1; gx++) {
                const list = dgrid[gy * dgw + gx];
                for (let k = list.length - 1; k >= 0; k--) {
                    const i = list[k];
                    if (!dl.alive[i]) { list.splice(k, 1); continue; }
                    if (Math.hypot(dl.x[i] - x, dl.y[i] - y) < r + dl.r[i] * 0.5) { got += dl.r[i] * dl.r[i]; dl.alive[i] = 0; list.splice(k, 1); }
                }
            }
        }
        return got;
    }
    // The biggest droplet just below a running drop: it will veer toward it.
    function pull(d) {
        const y0 = d.y + d.r * 0.6, y1 = d.y + d.r * 2.6, x0 = d.x - d.r * 1.8, x1 = d.x + d.r * 1.8;
        let best = 0, bx = 0;
        for (let gy = Math.max(0, Math.floor(y0 / DG)); gy <= Math.min(dgh - 1, Math.floor(y1 / DG)); gy++) {
            for (let gx = Math.max(0, Math.floor(x0 / DG)); gx <= Math.min(dgw - 1, Math.floor(x1 / DG)); gx++) {
                for (const i of dgrid[gy * dgw + gx]) {
                    if (!dl.alive[i] || dl.y[i] < y0 || dl.y[i] > y1 || dl.x[i] < x0 || dl.x[i] > x1) continue;
                    const w = dl.r[i] / (1 + Math.abs(dl.x[i] - d.x) / d.r);
                    if (w > best) { best = w; bx = dl.x[i]; }
                }
            }
        }
        return best ? bx - d.x : 0;
    }
    function newDrop(x, y, r, o = {}) {
        const k = clamp(r / maxR);
        const d = {
            x, y, r, mo: 0, mx: 0, last: 0, next: 0, seed: rand(), killed: false, trail: false,
            // a resting drop is never a perfect circle: pinned on the glass,
            // a little heavier at the bottom, the big ones more so
            irr: 0.02 + rand() * (0.03 + 0.1 * k), st: 1 + rand() * 0.14 * k, tp: rand() * 0.3 * k,
            ...o,
        };
        drops.push(d);
        return d;
    }
    const drizzleR = () => (0.4 + 1.9 * Math.pow(rand(), 2.8)) * size;

    // One step of Bebber's rain, in css px. ts = 1 at 60 fps.
    function stepRain(ts, spawn = true) {
        const area = (W * H) / 1e6;
        const V = 0.34 * size;
        const dR = maxR - minR;
        if (spawn) {
            // fine drizzle lands everywhere and fills the tracks back in
            let k = (0.25 + 1.3 * cfg.rain) * area * ts;
            while (k > 0) {
                if (rand() < k) addDroplet(rand() * W, rand() * H, drizzleR());
                k -= 1;
            }
            // and now and then a real drop
            const ar = Math.max(area, 0.6);          // a phone is a closer look, not less rain
            let c = (0.08 + 0.36 * cfg.rain) * ar * ts;
            while (c > 0) {
                if (rand() < c && drops.length < 500 * ar) {
                    const r = minR * 0.6 + (maxR * 0.85 - minR * 0.6) * Math.pow(rand(), 2.6);
                    newDrop(rand() * W, rand() * H * 0.98 - 0.04 * H, r);
                }
                c -= 1;
            }
        }
        drops.sort((a, b) => (a.y - b.y) || (a.x - b.x));
        for (let i = 0; i < drops.length; i++) {
            const d = drops[i];
            if (d.killed) continue;
            // the beads a trail leaves dry away, smallest first, so old trails break into gaps
            if (d.trail && d.mo === 0) {
                d.r -= ts * 0.0011 * size * (0.6 + d.seed);
                if (d.r < 0.45 * size) { d.killed = true; continue; }
            }
            // heavy drops let go now and then: stick, slip
            if (rand() < (d.r - maxR * 0.5) * (0.1 / dR) * ts * 0.2) {
                d.mo += rand() * (d.r / maxR) * 4 * V;
                d.mx += (rand() - 0.5) * 0.3 * d.mo;
            }
            if (d.mo > 0) {
                // a running drop wanders: a random walk, and a pull toward the
                // water just below it, which it gathers up as it goes
                d.mx += (rand() - 0.5) * 0.09 * d.mo * ts + pull(d) * 0.012 * ts;
                // and leaves beads behind, at uneven intervals and of uneven size
                d.last += d.mo * ts;
                if (d.last > d.next) {
                    const tr = d.r * (0.07 + Math.pow(rand(), 1.8) * 0.36);
                    if (tr > 0.5 * size && rand() < 0.62) newDrop(d.x + (rand() - 0.5) * d.r * 0.7, d.y - d.r * (0.3 + rand() * 0.6), tr, { trail: true, irr: 0.03, st: 1, tp: 0 });
                    d.r *= 0.975;
                    d.last = 0;
                    d.next = minR * (0.5 + 2.6 * -Math.log(1 - rand() * 0.95)) + (maxR - d.r) * 0.4;
                }
                d.y += d.mo * ts;
                d.x += d.mx * ts;
                if (d.y - d.r > H) { d.killed = true; continue; }
                const got = clearDroplets(d.x, d.y, d.r * 0.92);
                if (got) d.r = Math.min(maxR * 1.25, Math.sqrt(d.r * d.r + got * 0.6));
            }
            // drops that touch run together: the bigger one swallows the other
            for (let j = i + 1; j < Math.min(drops.length, i + 70); j++) {
                const e = drops[j];
                if (e.killed) continue;
                if (e.y - d.y > maxR * 2.2) break;
                if (Math.hypot(e.x - d.x, e.y - d.y) < (d.r + e.r) * (0.62 + d.mo * 0.01 * ts)) {
                    const [a, b] = d.r >= e.r ? [d, e] : [e, d];
                    const R = Math.min(maxR * 1.25, Math.sqrt(a.r * a.r + b.r * b.r * 0.8));
                    a.r = R;
                    a.trail = false;
                    a.x += (b.x - a.x) * (b.r * b.r) / (R * R) * 0.5;
                    a.mx += (b.x - a.x) * 0.02;
                    a.mo = Math.max(b.mo, Math.min(40 * V, a.mo + R * 0.03 * V + (a.r > minR * 2 ? V * 0.6 : 0)));
                    b.killed = true;
                    if (b === d) break;
                }
            }
            if (d.killed) continue;
            d.mo -= Math.max(0.3 * V, 1.5 * V - d.mo) * 0.1 * ts;
            if (d.mo < 0) d.mo = 0;
            d.mx *= Math.pow(0.9, ts);
        }
        drops = drops.filter((d) => !d.killed);
    }

    // ── draw ──────────────────────────────────────────────────────────
    let inst = new Float32Array(7 * 4096);
    function drawDrops() {
        const total = dl.n + drops.length + drips.length;
        if (inst.length < total * 7) inst = new Float32Array(total * 7 + 7 * 1024);
        let k = 0;
        const put = (x, y, r, st, seed, taper, irr) => {
            const o = k * 7;
            inst[o] = x; inst[o + 1] = y; inst[o + 2] = r; inst[o + 3] = st;
            inst[o + 4] = seed; inst[o + 5] = taper; inst[o + 6] = irr;
            k++;
        };
        for (let i = 0; i < dl.n; i++) if (dl.alive[i]) put(dl.x[i], dl.y[i], dl.r[i], 1, dl.s[i], 0, 0.04);
        for (const d of drops) {
            const run = clamp(d.mo / (0.6 * size));
            put(d.x, d.y, d.r * (1 - 0.08 * run), d.st + 0.32 * run, d.seed, d.tp + (0.6 - d.tp) * run, d.irr * (1 - run * 0.5));
        }
        for (const d of drips) if (d.wait <= 0) put(d.x, d.y, d.r, d.left > 0 ? 1.25 : 1.05, d.seed, d.left > 0 ? 0.5 : 0, 0.05);

        gl.bindFramebuffer(gl.FRAMEBUFFER, RT.drops.f);
        gl.viewport(0, 0, CW, CH);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(P.drop.p);
        gl.uniform2f(P.drop.u.uSize, W, H);
        gl.uniform1f(P.drop.u.uDpr, dpr);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.bindVertexArray(vaoDrops);
        gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
        gl.bufferData(gl.ARRAY_BUFFER, inst.subarray(0, k * 7), gl.DYNAMIC_DRAW);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, k);
        gl.disable(gl.BLEND);
        gl.bindVertexArray(null);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, RT.drops.t);
        gl.generateMipmap(gl.TEXTURE_2D);
    }

    function render() {
        if (!gl || gl.isContextLost()) return;
        uploadMist();
        drawDrops();
        pass(P.comp, null, {
            uImg: T.img, uMid: RT.mid.t, uHeavy: RT.heavy.t, uVeil: RT.veil.t, uDrops: RT.drops.t, uMist: T.mist, uMicro: T.micro,
            uSize: [W, H], uReach: reach, uDpr: dpr, uTime: clock, uMistAmt: cfg.mist, uBias: Math.max(0, Math.log2(dpr)) * 0.5,
        });
    }

    // ── loop ──────────────────────────────────────────────────────────
    function frame(t) {
        raf = 0;
        if (dead || !gl || gl.isContextLost()) return;
        if (still()) { render(); return; }
        if (t - lastDraw >= 31) {
            const dt = lastT ? Math.min(0.1, (t - lastT) / 1000) : 1 / 30;
            lastT = t;
            lastDraw = t;
            clock += dt;
            const steps = Math.max(1, Math.round(dt * 60 / 2));
            for (let i = 0; i < steps; i++) stepRain((dt * 60) / steps);
            stepDrips(dt);
            refog(dt);
            render();
        }
        if (visible && !document.hidden) raf = requestAnimationFrame(frame);
    }
    function kick() {
        if (raf || !visible || !gl || document.hidden) return;
        lastT = 0;
        raf = requestAnimationFrame(frame);
    }
    let pending = 0;
    function redraw() {           // reduced motion: draw on demand
        if (pending) return;
        pending = requestAnimationFrame(() => { pending = 0; if (!dead) render(); });
    }

    // ── what is already on the glass ──────────────────────────────────
    function prepare() {
        resetRain();
        // the drizzle that has already collected
        const area = (W * H) / 1e6;
        for (let i = 0; i < 900 * area; i++) addDroplet(rand() * W, rand() * H, drizzleR());
        // the rain so far: run it on, unseen, for a while
        const saved = cfg.rain;
        cfg.rain = Math.max(saved, 0.5) * 1.6;
        for (let i = 0; i < 420; i++) stepRain(2);
        cfg.rain = saved;
        for (let i = 0; i < 160; i++) stepRain(2);

        const wr = rng(cfg.seed * 97 + 1);
        // condensation that has already run at the bottom of the pane
        for (let i = 0; i < Math.round(W / 420) + 1; i++) {
            const x = (0.04 + wr() * 0.92) * W;
            run(x, H * (0.62 + wr() * 0.3), H + 4, (1.7 + wr() * 0.5) * size);
        }

        // Someone wiped a patch to look out, a while ago: a broad, slightly
        // curved diagonal sweep of overlapping strokes, a finger dragged off
        // its edge once or twice, drips run down from its lower edge, and the
        // fog half back over all of it.
        if (cfg.wiped) {
            const s = Math.min(W, H), wide = W > H;
            const A = wide ? [0.22 * W, 0.68 * H] : [0.08 * W, 0.62 * H];
            const B = wide ? [0.62 * W, 0.38 * H] : [0.92 * W, 0.42 * H];
            const bow = wide ? 0.06 * H : 0.04 * H;
            const at = (t) => {
                const x = A[0] + (B[0] - A[0]) * t, y = A[1] + (B[1] - A[1]) * t - bow * Math.sin(Math.PI * t);
                return [x, y];
            };
            const Rb = clamp(s * 0.03, 14, 26);
            const len = Math.hypot(B[0] - A[0], B[1] - A[1]);
            const nx = -(B[1] - A[1]) / len, ny = (B[0] - A[0]) / len;   // across the sweep
            const passes = 4;
            for (let p = 0; p < passes; p++) {
                const off = (p - (passes - 1) / 2) * Rb * 1.45 + (wr() - 0.5) * Rb * 0.3;
                const e = Math.abs(p - (passes - 1) / 2);
                const t0 = 0.02 + wr() * 0.1 + e * 0.05, t1 = 0.98 - wr() * 0.1 - e * 0.04;
                const ph = wr() * 6.28;
                let prev = null;
                for (let k = 0; k <= 60; k++) {
                    const t = t0 + (t1 - t0) * (k / 60);
                    const [cx, cy] = at(t);
                    const o = off + Math.sin(t * 7 + ph) * Rb * 0.18;
                    const pt = [cx + nx * o, cy + ny * o];
                    if (prev) wipe(prev[0], prev[1], pt[0], pt[1], Rb * (0.95 + 0.1 * Math.sin(k * 0.3 + ph)));
                    prev = pt;
                }
            }
            // a finger dragged off the edge of it, twice
            for (let f = 0; f < 2; f++) {
                const [sx, sy] = at(0.3 + f * 0.38);
                const side = f ? 1 : -1;
                const dx = (f ? 0.35 : -0.55) * Rb * 3.2, dy = side * Rb * 3.4;
                let prev = [sx + nx * side * Rb * 1.5, sy + ny * side * Rb * 1.5];
                for (let k = 1; k <= 24; k++) {
                    const t = k / 24;
                    const pt = [prev[0] + dx / 24 + Math.sin(t * 3) * 0.6, prev[1] + dy / 24];
                    wipe(prev[0], prev[1], pt[0], pt[1], finger * (0.85 - 0.25 * t));
                    prev = pt;
                }
            }
            // drips from its lower edge
            const nd = wide ? 5 : 3;
            for (let i = 0; i < nd; i++) {
                const t = 0.12 + (i + wr() * 0.7) * 0.8 / nd;
                const [cx, cy] = at(t);
                const x = cx + nx * Rb * 2.9, y = cy + ny * Rb * 2.9;
                run(x, y, y + (25 + wr() * (wide ? 150 : 90)) * size, (1.6 + wr() * 0.6) * size);
            }
        }

        // a word someone wrote earlier (off by default)
        const word = cfg.writing.replace(/[^a-z ]/gi, '').slice(0, 12);
        if (word) {
            const wSize = clamp(Math.min(W * 0.6 / wordWidth(word), H * 0.14), 30, 96);
            const R = Math.max(5, wSize * 0.105);
            const x = W > H ? W * 0.56 : W * 0.12, y = H * (W > H ? 0.6 : 0.56);
            const pts = cursive(word, x, y, wSize, 6);
            for (let i = 1; i < pts.length; i++) {
                const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
                wipe(ax, ay, bx, by, R * (0.9 + 0.12 * Math.sin(i * 0.21)));
            }
        }

        // all of that happened a while ago: the fog is half back, unevenly,
        // and comes back over it far more slowly than over a fresh wipe
        for (let j = 0; j < mist.length; j++) {
            if (mist[j] > 0.995) continue;
            const floor = 0.4 + 0.3 * (rate[j] - 0.55) / 0.9;
            mist[j] = Math.max(mist[j], floor + (1 - floor) * mist[j] * 0.5);
            rim[j] *= 0.6;
            film[j] = 0;
            slow[j] = 0.07;
        }
        box = [0, 0, cols - 1, rows - 1];
        mistDirty = true;
    }
    // water that ran down the inside of the glass from (x, y0) to y1
    function run(x, y0, y1, r) {
        let y = y0, xx = x;
        const ph = rand() * 6.28;
        while (y < Math.min(y1, H + 4)) {
            const ny = y + 5, nx = xx + Math.sin(y * 0.05 + ph) * 0.35 + (rand() - 0.5) * 0.5;
            carve(xx, y, nx, ny, r);
            xx = nx; y = ny;
        }
    }

    // ── input ─────────────────────────────────────────────────────────
    let stroke = null;                   // { x, y, len, phase, pts }
    const local = (cx, cy) => { const r = root.getBoundingClientRect(); return [cx - r.left, cy - r.top]; };
    let tip = 12;                        // this stroke's fingertip radius, css px
    function strokeStart(x, y, isTouch = false) {
        // a real finger is broader than a pointer, whatever the screen
        tip = isTouch ? Math.max(finger, clamp(W * 0.036, 12, 16)) : finger;
        stroke = { x, y, len: 0, phase: Math.random() * 6.28, low: [] };
        wipe(x, y, x + 0.01, y, tip * 1.05);
        after();
    }
    function strokeTo(x, y) {
        if (!stroke) return;
        const L = Math.hypot(x - stroke.x, y - stroke.y);
        if (L < 0.5) return;
        const n = Math.max(1, Math.ceil(L / (cell * 0.8)));
        for (let i = 1; i <= n; i++) {
            const ax = stroke.x + (x - stroke.x) * (i - 1) / n, ay = stroke.y + (y - stroke.y) * (i - 1) / n;
            const bx = stroke.x + (x - stroke.x) * i / n, by = stroke.y + (y - stroke.y) * i / n;
            const s = stroke.len + (L * i) / n;
            const R = tip * (1 + 0.07 * Math.sin(s * 0.045 + stroke.phase) + 0.04 * Math.sin(s * 0.17 + stroke.phase * 2));
            wipe(ax, ay, bx, by, R);
        }
        stroke.len += L;
        if (stroke.low.length < 40 && rand() < 0.5) stroke.low.push([x, y]);
        stroke.x = x; stroke.y = y;
        after();
    }
    function strokeEnd() {
        if (!stroke) return;
        // water the finger gathered runs down from the bottom of a fresh wipe
        if (!still() && stroke.len > 60) {
            const pts = stroke.low.slice().sort((a, b) => b[1] - a[1]);
            const n = stroke.len > 260 ? 2 : 1;
            for (let i = 0; i < Math.min(n, pts.length); i++) {
                if (Math.random() < 0.75) {
                    const p = pts[Math.floor(Math.random() * Math.min(pts.length, 6))];
                    drip(p[0] + (Math.random() - 0.5) * tip * 0.6, p[1] + tip * 0.95, 0.5 + Math.random() * 2.2);
                }
            }
        }
        stroke = null;
    }
    function after() { if (still()) redraw(); else kick(); }

    // mouse and pen: press and drag
    let pid = null;
    function onPointerDown(e) {
        if (e.pointerType === 'touch' || e.button !== 0) return;
        e.preventDefault();
        pid = e.pointerId;
        try { root.setPointerCapture(pid); } catch (err) { /* fine */ }
        strokeStart(...local(e.clientX, e.clientY));
    }
    function onPointerMove(e) {
        if (e.pointerId !== pid || e.pointerType === 'touch') return;
        const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
        for (const c of evs.length ? evs : [e]) strokeTo(...local(c.clientX, c.clientY));
    }
    function onPointerUp(e) {
        if (e.pointerId !== pid) return;
        pid = null;
        strokeEnd();
    }

    // touch: never trap the scroll. A sideways stroke wipes at once (the
    // element is touch-action: pan-y, so it never scrolls); a vertical swipe
    // scrolls; a press held still for a quarter second wipes in any
    // direction, and only then are that touch's moves kept from scrolling.
    let touch = null, holdTimer = 0;
    function onTouchStart(e) {
        if (touch) return;
        const t = e.changedTouches[0];
        const [x, y] = local(t.clientX, t.clientY);
        touch = { id: t.identifier, x0: t.clientX, y0: t.clientY, mode: 'wait', x, y };
        clearTimeout(holdTimer);
        holdTimer = setTimeout(() => {
            if (touch && touch.mode === 'wait') { touch.mode = 'free'; strokeStart(touch.x, touch.y, true); }
        }, 250);
    }
    function onTouchMove(e) {
        if (!touch) return;
        for (const t of e.changedTouches) {
            if (t.identifier !== touch.id) continue;
            const dx = t.clientX - touch.x0, dy = t.clientY - touch.y0;
            if (touch.mode === 'wait' && Math.hypot(dx, dy) > 7) {
                clearTimeout(holdTimer);
                if (Math.abs(dx) > Math.abs(dy)) { touch.mode = 'wipe'; strokeStart(touch.x, touch.y, true); }
                else touch.mode = 'scroll';
            }
            if (touch.mode === 'free' || touch.mode === 'wipe') {
                if (e.cancelable) e.preventDefault();
                strokeTo(...local(t.clientX, t.clientY));
            }
        }
    }
    function onTouchEnd(e) {
        if (!touch) return;
        for (const t of e.changedTouches) {
            if (t.identifier !== touch.id) continue;
            clearTimeout(holdTimer);
            strokeEnd();
            touch = null;
        }
    }

    // ── start ─────────────────────────────────────────────────────────
    let io = null, ro = null;
    function setup() {
        layout();
        prepare();
        clock = 7.3;
        render();
    }
    async function start() {
        try { await img.decode(); } catch (e) { if (!img.complete || !img.naturalWidth) await new Promise((res) => img.addEventListener('load', res, { once: true })); }
        if (dead || !img.naturalWidth) return;

        canvas = document.createElement('canvas');
        canvas.className = 'wp-canvas';
        canvas.setAttribute('aria-hidden', 'true');
        try {
            if (!initGL()) throw new Error('no webgl2');
            root.appendChild(canvas);
            setup();
        } catch (e) {
            if (canvas) canvas.remove();
            canvas = null; gl = null;
            return;                              // the <img> stays: that is the fallback
        }
        root.classList.add('is-live');

        on(canvas, 'webglcontextlost', (e) => {
            e.preventDefault();
            cancelAnimationFrame(raf); raf = 0;
            root.classList.remove('is-live');
        });
        on(canvas, 'webglcontextrestored', () => {
            try { RT = {}; T.img = T.mist = null; if (initGL()) { setup(); root.classList.add('is-live'); kick(); } } catch (e) { /* the img stays */ }
        });

        const drag = img.getAttribute('draggable');
        img.draggable = false;
        off.push(() => (drag == null ? img.removeAttribute('draggable') : img.setAttribute('draggable', drag)));

        on(root, 'pointerdown', onPointerDown);
        on(root, 'pointermove', onPointerMove);
        on(root, 'pointerup', onPointerUp);
        on(root, 'pointercancel', onPointerUp);
        on(root, 'touchstart', onTouchStart, { passive: true });
        on(root, 'touchmove', onTouchMove, { passive: false });
        on(root, 'touchend', onTouchEnd, { passive: true });
        on(root, 'touchcancel', onTouchEnd, { passive: true });
        on(root, 'contextmenu', (e) => { if (touch || pid != null) e.preventDefault(); });
        on(document, 'visibilitychange', () => { if (!document.hidden) kick(); });
        on(calm, 'change', () => { if (gl) { render(); kick(); } });

        io = new IntersectionObserver((en) => {
            visible = en[0].isIntersecting;
            if (visible) kick();
        }, { rootMargin: '60px' });
        io.observe(root);

        let w0 = W, h0 = H;
        ro = new ResizeObserver(() => {
            const r = root.getBoundingClientRect();
            if (Math.abs(r.width - w0) < 1 && Math.abs(r.height - h0) < 1) return;
            clearTimeout(sizeTimer);
            sizeTimer = setTimeout(() => {
                if (dead || !gl) return;
                // a phone's toolbar sliding away changes the height a little:
                // keep the glass as it is unless the width changed
                if (Math.abs(r.width - w0) < 1 && Math.abs(r.height - h0) < 120) return;
                setup(); w0 = W; h0 = H;
            }, 200);
        });
        ro.observe(root);
    }
    start();

    return function destroy() {
        dead = true;
        cancelAnimationFrame(raf);
        cancelAnimationFrame(pending);
        clearTimeout(holdTimer);
        clearTimeout(sizeTimer);
        off.forEach((f) => f());
        if (io) io.disconnect();
        if (ro) ro.disconnect();
        if (gl) { const x = gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); }
        if (canvas) canvas.remove();
        root.classList.remove('is-live');
    };
}

// Auto-start every [data-window-pane], each once it is near the viewport.
function autoStart(el) {
    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((en) => {
        if (!en[0].isIntersecting) return;
        io.disconnect();
        windowPane(el);
    }, { rootMargin: '600px' });
    io.observe(el);
}
document.querySelectorAll('[data-window-pane]').forEach(autoStart);
