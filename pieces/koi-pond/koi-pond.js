/*
 *  KOI-POND // koi from a woodblock print, living under water you can touch.
 *
 *  Markup:  <figure data-koi-pond>
 *             <img src="assets/koi-pond-still.webp" alt="">   (what shows without WebGL)
 *           </figure>
 *  Or call  koiPond(figure, { koi, floor, seed, size, caustics, ambient, rest })  yourself.
 *  It returns destroy().
 *
 *  Options (data attributes, all optional; the options object wins):
 *    data-koi="auto"        how many fish (auto: 3 on a phone, 4-5 on a desktop)
 *    data-floor="assets/pond-floor.webp"   the pond floor (any pale stone or ground)
 *    data-seed              pond shape and fish; random each visit unless set
 *    data-size="1"          scales the fish
 *    data-caustics="0.7"    0-1, how strongly the ripples focus light on the floor
 *    data-ambient="0.6"     0-1, the slow sunlit swell and its net of light
 *    data-rest="60"         seconds without input before the fish go to rest
 *
 *  Events (bubbling, on the figure): koi-pond:crumb (a crumb lands),
 *  koi-pond:rise (a fish takes it at the surface), koi-pond:startle (fish bolt).
 *  detail: { x, y } in css px within the pond; startle also { count }.
 *
 *  The pond is a full-bleed band: its top and bottom meet the page along an
 *  irregular line with a 9 px fade (never a blurred vignette).
 *
 *  One WebGL context, two passes a frame. The scene pass draws, into a
 *  texture, the floor, every fish's shadow (offset and blurred by how high it
 *  swims) and the fish, deepest first, dimmed and softened by the water above
 *  them; its alpha channel carries how much water lies over each pixel. Then
 *  the water pass (ripple-pool's height field: wave equation, surface tension,
 *  viscosity, caustics from 1/det(I + kH), a soft glint) looks down through
 *  the surface at that scene, refracting deep things more than shallow ones.
 *
 *  Each koi is one painted fish (assets/koi-body.webp, baked from Utagawa
 *  Toyokuni I's "The Red Carp") bent along its spine as a strip mesh: a wave
 *  runs down the body, growing toward the tail; turns bend the whole body as
 *  the tail follows the head's path; the pectoral fins are separate and scull.
 *  Kohaku, sanke, yamabuki and chagoi are recoloured in the shader from the
 *  print's own reds, so the scales and the grain of the block stay.
 */

const calm = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const TAU = Math.PI * 2;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const ASSET = (f) => new URL('assets/' + f, import.meta.url).href;

// water (from ripple-pool)
const SPEED = 1.0;
const TENSION = 0.26;
const VISCOSITY = 0.012;
const WAVE = 300;
const SLOPE = 0.32;
const FOCUS = 2;
const REFRACT = 48;
const FOCUS_K = 30;

// fish
const SEG = 22;               // spine segments
const TEX_X0 = 32 / 1024;     // snout in the body texture
const TEX_L = 960 / 1024;     // nose to tail tip
const HALF = 128 / 960;       // strip half-width, in body lengths
const KINDS = { hi: 0, kohaku: 1, yamabuki: 2, chagoi: 3, sanke: 4 };

// ── shaders ───────────────────────────────────────────────────────────
const VQ = `
attribute vec4 a;
varying vec2 vUv;
void main() { vUv = vec2(a.x * .5 + .5, .5 - a.y * .5); gl_Position = vec4(a.xy, 0., 1.); }`;

const VM = `
attribute vec4 a;            // css px, texture uv
uniform vec2 uRes;
uniform vec2 uOff;
varying vec2 vT;
void main() {
    vT = a.zw;
    vec2 q = a.xy + uOff;
    gl_Position = vec4(q.x / uRes.x * 2. - 1., 1. - q.y / uRes.y * 2., 0., 1.);
}`;

const PREC = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`;

const F_FLOOR = PREC + `
uniform sampler2D uFloor;
varying vec2 vUv;
void main() { gl_FragColor = vec4(texture2D(uFloor, vUv).rgb, 1.); }`;

const F_SHADOW = PREC + `
uniform sampler2D uTex;
uniform float uH;            // height above the floor, 0..1
uniform float uStrength;
uniform float uMode;         // 0 body (blur stack), 1 fin (mip blur), 2 crumb (soft dot)
varying vec2 vT;
void main() {
    float a;
    if (uMode < .5) {
        vec3 b = texture2D(uTex, vT).rgb;
        a = mix(mix(b.r, b.g, clamp(uH * 2., 0., 1.)), b.b, clamp(uH * 2. - 1., 0., 1.));
    } else if (uMode < 1.5) {
        a = texture2D(uTex, vT, 1.5 + uH * 3.5).a;

    } else {
        a = smoothstep(1., .1, length(vT * 2. - 1.));
    }
    // under water a shadow is not black: the floor loses the sun but keeps
    // the sky's green-grey light, so the shade is cool and never deep
    float k = clamp(a * uStrength, 0., 1.);
    gl_FragColor = vec4(mix(vec3(1.), vec3(.42, .5, .53), k), 1.);
}`;

const F_FISH = PREC + `
uniform sampler2D uTex;
uniform float uDepth;        // 0 at the surface .. 1 on the floor
uniform float uKind;
uniform float uSeed;
uniform float uFin;
uniform float uAlpha;
uniform vec3 uWater;
varying vec2 vT;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3. - 2. * f);
    return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), f.x), f.y);
}
float fbm(vec2 p) { return noise(p) * .6 + noise(p * 2.1 + 3.7) * .28 + noise(p * 4.3 + 7.1) * .12; }
void main() {
    vec4 t = texture2D(uTex, vT, max(0., uDepth - .3) * 1.4);     // shallow fish stay sharp
    if (t.a < .004) discard;
    // body coordinates (snout 0, tail tip 1; across in body lengths)
    vec2 b = vec2((vT.x * 1024. - 32.) / 960., (vT.y - .5) * 256. / 960.);
    float eye = (1. - uFin) * smoothstep(.0112, .0092, length(vec2(b.x - .086, abs(b.y) - .0745)));
    vec3 c = t.rgb;
    float l = dot(c, vec3(.3, .59, .11));
    // the print's brick red, pushed a little toward living vermilion
    vec3 red = mix(vec3(l), c, 1.5) * vec3(1.07, .86, .8);
    vec3 white = vec3(.97, .95, .9) * (.8 + .26 * smoothstep(.3, .78, l));
    vec3 gold = vec3(l) * vec3(1.5, 1.16, .5) + vec3(.06, .035, 0.);
    vec3 dark = vec3(l) * vec3(.92, .66, .42) + vec3(.03, .02, .0);              // chagoi: the colour of tea
    vec3 sumi = vec3(.1, .095, .09) + l * .07;
    // pattern in body coordinates: patches of red on white (kohaku)
    vec2 q = vec2(vT.x * 7.5, (vT.y - .5) * 5.) + uSeed * 7.31;
    float n = fbm(q);
    float head = smoothstep(.2, .12, vT.x);                    // a red cap on the head is common
    float tail = smoothstep(.73, .79, vT.x);                   // fins and tail stay white
    float m = smoothstep(.5, .545, n + head * .12) * (1. - tail);
    float s = smoothstep(.69, .72, fbm(q * 1.3 + 11.)) * smoothstep(.16, .24, vT.x) * (1. - tail * .7);   // sumi
    vec3 col;
    if (uKind < .5)      col = red;
    else if (uKind < 1.5) col = mix(white, red, m * (1. - uFin));
    else if (uKind < 2.5) col = gold;
    else if (uKind < 3.5) col = dark;
    else                 col = mix(mix(white, red, m * (1. - uFin)), sumi, s * (1. - uFin) * .92);
    // fins and tail: thin and translucent, the floor shows through; the rays
    // carry the colour, and near the body they take a little of its tint
    float finness = max(uFin, tail);
    float base = uFin > .5 ? 1. - vT.x : 1. - smoothstep(.78, .95, vT.x);
    if (uKind > .5 && uKind < 1.5 || uKind > 3.5) col = mix(col, mix(white, red, .16 + .3 * base), finness);
    float rays = smoothstep(.8, .45, l);
    float finA = mix(1., .38 + .4 * rays + .15 * base, finness);
    col = mix(col, t.rgb, eye);
    // a rounded back: flanks fall away from the light, a soft sheen down the spine
    float across = abs(vT.y - .5) / .1;
    float body = (1. - uFin) * (1. - tail);
    col *= mix(1., .74 + .26 * sqrt(clamp(1. - across * across, 0., 1.)), body);
    col += body * vec3(1., .98, .92) * .07 * exp(-across * across * 6.) * smoothstep(.12, .3, vT.x) * (1. - smoothstep(.55, .75, vT.x));
    // the water above: colour drains, the pond's green comes in
    float d = uDepth;
    float lc = dot(col, vec3(.3, .59, .11));
    col = mix(col, vec3(lc), d * .3);
    col = mix(col, uWater, d * .46);
    gl_FragColor = vec4(col, t.a * finA * uAlpha * (1. - .25 * d));
}`;

const F_CRUMB = PREC + `
uniform float uFade;
uniform float uSeed;
varying vec2 vT;
void main() {
    vec2 p = vT * 2. - 1.;
    float ang = atan(p.y, p.x);
    float r = length(p) * (1. + .14 * sin(ang * 3. + uSeed) + .08 * sin(ang * 5. + uSeed * 2.3));
    float a = smoothstep(.86, .7, r);
    float hi = smoothstep(.75, 0., length(p - vec2(-.25, -.3)));
    vec3 c = mix(vec3(.56, .4, .23), vec3(.9, .78, .58), hi);
    c *= 1. - .25 * smoothstep(.45, .8, r);
    // the wet meniscus round it, a faint bright ring
    float ring = smoothstep(.98, .86, r) * (1. - a);
    vec4 o = vec4(c * a, a) + vec4(vec3(1., .98, .93) * ring * .25, ring * .25);
    gl_FragColor = o * uFade;
}`;

// A lily pad on the surface: a real leaf, lit by how the ripples tilt it,
// with the thin dark line of wet meniscus round its edge.
const F_PAD = PREC + `
uniform sampler2D uTex;
uniform vec2 uTilt;
varying vec2 vT;
void main() {
    vec4 t = texture2D(uTex, vT);
    float halo = texture2D(uTex, vT, 3.).a;
    float rim = clamp(halo * 1.8 - t.a, 0., 1.) * (1. - t.a);
    float lit = 1. + clamp(dot(uTilt, vec2(-.6, -.8)), -.4, .4);
    vec3 c = t.rgb * lit;
    // a waxy leaf catches a soft sheen where the ripples turn it to the light
    // a waxy leaf: a cool sheen of sky across it, more where the ripples turn it to the light
    c = mix(c, vec3(.62, .7, .74), .06 + .1 * max(0., dot(uTilt, vec2(-.6, -.8))));
    gl_FragColor = vec4(c * t.a, t.a) + vec4(0., 0., 0., rim * .55);
}`;

const F_WATER = PREC + `
uniform sampler2D uImg;      // the scene: rgb, a = how much the water bends it
uniform sampler2D uWater;    // r g slope, b light focus, a height. 128 = flat.
uniform sampler2D uMask;     // where the pond is
uniform vec2 uShift;
uniform vec2 uCell;
uniform vec2 uSize;
uniform float uCaustics;
uniform float uAmbient;
uniform float uTime;
uniform vec3 uTint;
uniform vec3 uGlint;
uniform vec3 uLight;
uniform float uLong;          // 1: the band is wider than tall (it deepens to the right), 0: deepens downward
uniform vec4 uPads[3];       // the pads' shadows on the floor: centre (css px), radius, on
varying vec2 vUv;
float dec(float v) { return (v * 255. - 128.) / 127.; }
vec3 shoulder(vec3 x) { return mix(x, .78 + .22 * (1. - exp(-(x - .78) / .22)), step(.78, x)); }
vec4 scene(vec2 q) { return texture2D(uImg, vec2(q.x, 1. - q.y)); }
// The sunlit swell: six short waves crossing at uneven angles (no two near
// parallel, so no bands). Their exact Hessian through 1 / det(I + f H) gives
// the caustic net; only the bright side is kept, sharpened, so it reads as
// thin filaments of focused light rather than wobbly cells.
void swell(vec2 q, float t, out vec2 grad, out float light) {
    float hxx = 0., hyy = 0., hxy = 0.;
    grad = vec2(0.);
    vec2 D[6]; vec3 W[6];
    D[0] = vec2(0.993, 0.122); W[0] = vec3(31., 8., 0.0);
    D[1] = vec2(-0.788, -0.616); W[1] = vec3(23., 6., 1.7);
    D[2] = vec2(0.156, 0.988); W[2] = vec3(27., 9., 4.1);
    D[3] = vec2(0.326, -0.946); W[3] = vec3(19., 7., 2.6);
    D[4] = vec2(-0.788, 0.616); W[4] = vec3(35., 5., 5.3);
    D[5] = vec2(0.988, -0.156); W[5] = vec3(16., 8., 3.3);
    for (int i = 0; i < 6; i++) {
        float k = 6.2831853 / W[i].x;
        float ph = k * (dot(D[i], q) - W[i].y * t) + W[i].z;
        grad += D[i] * (.5 * cos(ph));
        float c = -sin(ph) * (.8 + .4 * float(i) / 5.);
        hxx += c * D[i].x * D[i].x; hyy += c * D[i].y * D[i].y; hxy += c * D[i].x * D[i].y;
    }
    float f = .62;                          // enough focusing that the bright curves join into a web
    float det = (1. + f * hxx) * (1. + f * hyy) - f * f * hxy * hxy;
    float v = clamp(1. / max(abs(det), .06) - 1., 0., 5.);
    light = pow(v, 1.15) * .3 - .12;
}
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3. - 2. * f);
    return mix(mix(hash2(i), hash2(i + vec2(1., 0.)), f.x), mix(hash2(i + vec2(0., 1.)), hash2(i + vec2(1., 1.)), f.x), f.y);
}
void main() {
    vec4 w = texture2D(uWater, vUv) * .4
           + (texture2D(uWater, vUv + vec2(uCell.x, 0.)) + texture2D(uWater, vUv - vec2(uCell.x, 0.))
            + texture2D(uWater, vUv + vec2(0., uCell.y)) + texture2D(uWater, vUv - vec2(0., uCell.y))) * .15;
    vec2 s = vec2(dec(w.r), dec(w.g));
    float focus = dec(w.b) * ${FOCUS.toFixed(1)};
    float h = dec(w.a);
    vec2 sw = vec2(0.);
    float net = 0.;
    if (uAmbient > 0.) {
        swell(vUv * uSize, uTime, sw, net);
        sw *= uAmbient * 1.6 / uSize;
    }
    float depth = scene(vUv).a;                 // 1 floor; a fish near the surface much less
    vec3 base = scene(vUv + (s * uShift + sw) * depth).rgb;
    // light focuses with depth: a fish at the surface catches little of the net
    float cw = mix(.3, 1., depth);
    // the net is uneven: strong in patches, faint in others, fading into the
    // deep end and gone in the shade of the pads
    vec2 qp = vUv * uSize;
    float ps = max(uSize.x, uSize.y) * .3;     // patches scale with the band: a few across it
    float patchy = vnoise(qp / ps + vec2(uTime * .012, -uTime * .008)) * .65 + vnoise(qp / (ps * .4) - uTime * .01) * .35;
    float netK = mix(.14, 1., smoothstep(.34, .66, patchy));
    netK *= mix(1., .3, smoothstep(.45, 1., mix(vUv.y, vUv.x, uLong)));
    for (int i = 0; i < 3; i++) netK *= 1. - uPads[i].w * .9 * smoothstep(uPads[i].z * 1.15, uPads[i].z * .45, length(qp - uPads[i].xy));
    float L = (focus * uCaustics * 1.35 + net * uAmbient * .32 * netK) * cw;
    float up = 1. - exp(-1.3 * max(L, 0.));
    float dn = 1. - exp(-1.6 * max(-L, 0.));
    float lum = dot(base, vec3(.3, .55, .15));
    vec3 lit = base * (1. - .45 * dn) * (1. + .52 * up * clamp(1.25 - lum, .3, 1.));
    vec3 c = base + shoulder(lit) - shoulder(base);
    c = mix(c, uTint, clamp(-h * 1.4, 0., 1.) * .26);
    vec3 n = normalize(vec3(-s * .5, 1.));
    vec3 r = reflect(vec3(0., 0., -1.), n);
    float g = smoothstep(.988, .999, dot(r, uLight));
    c += uGlint * g * .05;
    float m = texture2D(uMask, vUv).r;
    gl_FragColor = vec4(c * m, m);
}`;

// a small seeded random
function rng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function koiPond(root, opts = {}) {
    if (!root) return () => {};
    const img = root.querySelector('img');
    const num = (k, d) => {
        const v = opts[k] ?? root.dataset[k];
        return v == null || v === '' || !isFinite(Number(v)) ? d : Number(v);
    };
    const seed0 = num('seed', Math.floor(Math.random() * 1e9));
    const cfg = {
        koi: (opts.koi ?? root.dataset.koi ?? 'auto'),
        floor: opts.floor || root.dataset.floor || ASSET('pond-floor.webp'),
        size: clamp(num('size', 1), 0.4, 2),
        caustics: clamp(num('caustics', 0.7)),
        ambient: clamp(num('ambient', 0.6)),
        rest: Math.max(5, num('rest', 60)),
    };

    let dead = false;
    let gl = null, canvas = null;
    const P = {};                 // programs
    let quadBuf = null, dynBuf = null, fbo = null, texScene = null;
    let texPads = [], pads = [];
    let texFloor = null, texMask = null, texWater = null, texKoi = null, texFin = null, texShadow = null;
    let images = null;
    let W = 0, H = 0, dpr = 1, cell = 4, cols = 0, rows = 0, longCells = 0;
    let h, v, lap, lapV, px, sponge;
    let mean = 0, maxV = 0, maxS = 0;
    let visible = false, raf = 0, last = 0, acc = 0, simT = 0, now = 0;
    let HZ = 180, STEP = 1 / 180;
    let flat = true, ambT = 7.3, lastDraw = 0;
    let tint = [0.3, 0.32, 0.28], waterCol = [0.55, 0.58, 0.5];
    const events = [];
    let segs = [];
    let ptr = null, ptrT = 0;
    let touch0 = null, press = null;
    let fish = [], crumbs = [];
    let lastInput = 0, restFade = 1, sleeping = false, settledFor = 0, lastStartleEvt = -9;
    let shape = null, restSpot = { x: 0, y: 0 }, restHeading = 0;
    let verts = new Float32Array(4096);
    let sizeTimer = 0;
    const off = [];
    const on = (t, type, fn, o) => { t.addEventListener(type, fn, o); off.push(() => t.removeEventListener(type, fn, o)); };
    const rand = rng(seed0);

    // ── pond shape ────────────────────────────────────────────────────
    // A full-bleed band of water: the sides run off the edge of the figure,
    // the top and bottom meet the page along a gently irregular line and fade
    // into it over a few pixels (FADE), never a blurred vignette. shape()
    // is a distance field for the fish: 1 at the edge, falling inward over
    // about two body lengths, negative in open water.
    const FADE = 9;
    let edgeTop = null, edgeBot = null;
    function makeShape() {
        const r = rng(seed0 ^ 0x5bd1e995);
        const ph = Array.from({ length: 6 }, () => r() * TAU);
        const inset = clamp(H * 0.025, 10, 20);
        const line = (x, k) => inset + 4 + 5 * Math.sin(x / 210 + ph[k]) + 3 * Math.sin(x / 83 + ph[k + 1]) + 1.2 * Math.sin(x / 29 + ph[k + 2]);
        edgeTop = (x) => line(x, 0);
        edgeBot = (x) => H - line(x + 977, 3);
        const E = fishLen() * 1.25;
        return (x, y) => 1 - Math.min(y - edgeTop(x), edgeBot(x) - y, x, W - x) / E;
    }
    const maskAt = (x, y) => smooth(0, FADE, Math.min(y - edgeTop(x), edgeBot(x) - y));
    function gradD(x, y) {
        const e = 4;
        return { x: shape(x + e, y) - shape(x - e, y), y: shape(x, y + e) - shape(x, y - e) };
    }

    // ── GL setup ──────────────────────────────────────────────────────
    function program(vs, fs, names) {
        const sh = (type, src) => {
            const s = gl.createShader(type);
            gl.shaderSource(s, src);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
            return s;
        };
        const p = gl.createProgram();
        gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
        gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
        gl.bindAttribLocation(p, 0, 'a');
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link');
        const u = {};
        for (const n of names) u[n] = gl.getUniformLocation(p, n);
        return { p, u };
    }
    function tex(filter = gl.LINEAR) {
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return t;
    }
    function initGL() {
        gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true, depth: false, stencil: false });
        if (!gl) return false;
        P.floor = program(VQ, F_FLOOR, ['uFloor']);
        P.shadow = program(VM, F_SHADOW, ['uRes', 'uOff', 'uTex', 'uH', 'uStrength', 'uMode']);
        P.fish = program(VM, F_FISH, ['uRes', 'uOff', 'uTex', 'uDepth', 'uKind', 'uSeed', 'uFin', 'uAlpha', 'uWater']);
        P.crumb = program(VM, F_CRUMB, ['uRes', 'uOff', 'uFade', 'uSeed']);
        P.pad = program(VM, F_PAD, ['uRes', 'uOff', 'uTex', 'uTilt']);
        P.water = program(VQ, F_WATER, ['uImg', 'uWater', 'uMask', 'uShift', 'uCell', 'uSize', 'uCaustics', 'uAmbient', 'uTime', 'uTint', 'uGlint', 'uLight', 'uLong', 'uPads']);
        quadBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 0, 0, 1, -1, 0, 0, -1, 1, 0, 0, 1, 1, 0, 0]), gl.STATIC_DRAW);
        dynBuf = gl.createBuffer();
        gl.enableVertexAttribArray(0);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

        const mip = (im) => {
            const t = tex(gl.LINEAR_MIPMAP_LINEAR);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
            gl.generateMipmap(gl.TEXTURE_2D);
            return t;
        };
        texKoi = mip(images.koi);
        texFin = mip(images.fin);
        texPads = images.padA && images.padB ? [mip(images.padA), mip(images.padB)] : [];
        texShadow = tex();
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, images.shadow);
        texFloor = tex();
        texMask = tex();
        texWater = tex();
        texScene = tex();
        fbo = gl.createFramebuffer();

        gl.useProgram(P.water.p);
        const L = [-0.42, -0.5, 1], m = Math.hypot(...L);
        gl.uniform3f(P.water.u.uLight, L[0] / m, L[1] / m, L[2] / m);
        gl.uniform3f(P.water.u.uGlint, 1, 0.98, 0.94);
        return true;
    }

    // ── layout ────────────────────────────────────────────────────────
    function layout() {
        const r = root.getBoundingClientRect();
        const oldW = W, oldH = H, oldL = W > 1 ? fishLen() : 0;
        W = Math.max(1, r.width);
        H = Math.max(1, r.height);
        const raw = devicePixelRatio || 1;
        dpr = Math.min(raw, 2);
        if (raw > 2 && W * H * raw * raw <= 3.4e6) dpr = Math.min(raw, 3);
        const max = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;
        dpr = Math.min(dpr, max / W, max / H);
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        shape = makeShape();

        // the scene target
        gl.bindTexture(gl.TEXTURE_2D, texScene);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texScene, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        // water grid, as ripple-pool: ~256 cells on the long side
        const long = Math.max(W, H);
        cell = Math.max(long / 256, 3);
        cols = Math.max(8, Math.round(W / cell));
        rows = Math.max(8, Math.round(H / cell));
        cell = W / cols;
        longCells = Math.max(cols, rows);
        HZ = clamp(WAVE / (Math.sqrt(SPEED / 4) * cell), 60, 240);
        STEP = 1 / HZ;
        h = new Float32Array(cols * rows);
        v = new Float32Array(cols * rows);
        lap = new Float32Array(cols * rows);
        lapV = new Float32Array(cols * rows);
        px = new Uint8Array(cols * rows * 4).fill(128);
        // the shallows soak waves up rather than reflect them, like a real bank
        sponge = new Float32Array(cols * rows);
        const soak = Math.exp(Math.log(0.02) / (0.35 * HZ));
        for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
            const m = maskAt((x + 0.5) * cell, (y + 0.5) * (H / rows));
            sponge[y * cols + x] = 1 - (1 - soak) * smooth(0.75, 0.2, m);
        }
        mean = 0; events.length = 0; segs = []; ptr = null;

        prepareFloor();
        gl.bindTexture(gl.TEXTURE_2D, texWater);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, cols, rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, px);
        gl.useProgram(P.water.p);
        gl.uniform2f(P.water.u.uShift, REFRACT / W, REFRACT / H);
        gl.uniform2f(P.water.u.uCell, 1 / cols, 1 / rows);
        gl.uniform1f(P.water.u.uCaustics, cfg.caustics);
        gl.uniform2f(P.water.u.uSize, W, H);
        gl.uniform3f(P.water.u.uTint, ...tint);

        // fish: keep them where they were, in proportion
        if (fish.length && oldW > 1) {
            for (const f of fish) { f.x *= W / oldW; f.y *= H / oldH; f.L = fishLen() * f.k; }
            for (const q of pads) { q.x *= W / oldW; q.y *= H / oldH; q.r *= fishLen() / (oldL || fishLen()); }
        }
        pickRestSpot();
    }

    // The floor: the stone under a little green water, deeper (darker) in the
    // middle, with the shade of the bank over one corner. The mask fades it all
    // into the page.
    function prepareFloor() {
        const c = document.createElement('canvas');
        c.width = canvas.width; c.height = canvas.height;
        const g = c.getContext('2d');
        const fl = images.floor;
        const k = Math.max(c.width / fl.naturalWidth, c.height / fl.naturalHeight);
        const sw = c.width / k, sh = c.height / k;
        g.imageSmoothingQuality = 'high';
        g.drawImage(fl, (fl.naturalWidth - sw) / 2, (fl.naturalHeight - sh) / 2, sw, sh, 0, 0, c.width, c.height);
        // The floor, dressed: drifts of silt, a few river pebbles, sunken
        // leaves, then the water over it all. It shelves away from the left:
        // shallow, pale and warm there, deeper, darker and cooler to the right.
        const fr = rng(seed0 ^ 0x1b873593);
        const D = c.width / W, Lf = fishLen();
        g.globalCompositeOperation = 'multiply';
        for (let i = 0; i < 10; i++) {
            const x = (0.2 + fr() * 0.85) * c.width, y = fr() * c.height, r = (0.5 + fr() * 0.9) * Lf * D;
            const gr = g.createRadialGradient(x, y, 0, x, y, r);
            gr.addColorStop(0, 'rgba(160, 150, 120, 0.34)');
            gr.addColorStop(1, 'rgba(160, 150, 120, 0)');
            g.fillStyle = gr;
            g.fillRect(x - r, y - r, 2 * r, 2 * r);
        }
        g.globalCompositeOperation = 'source-over';
        const shadowed = (fn, blur) => {
            g.save();
            g.shadowColor = 'rgba(38, 46, 40, 0.5)';
            g.shadowBlur = blur * D;
            g.shadowOffsetX = blur * 0.35 * D; g.shadowOffsetY = blur * 0.5 * D;
            fn();
            g.restore();
        };
        const sprite = (im, sx, sy, sw, sh, x, y, size, rot, alpha = 1) => {
            g.save();
            g.translate(x * D, y * D);
            g.rotate(rot);
            g.globalAlpha = alpha;
            const k = size * D / Math.max(sw, sh);
            g.drawImage(im, sx, sy, sw, sh, -sw * k / 2, -sh * k / 2, sw * k, sh * k);
            g.restore();
        };
        // sunken leaves, lying flat, in the middle and the deep
        const nl = images.leaves ? (W > 700 ? 5 : 3) : 0;
        for (let i = 0; i < nl; i++) {
            const x = W * (0.3 + fr() * 0.65), y = H * (0.12 + fr() * 0.76);
            shadowed(() => sprite(images.leaves, (i % 3) * 384, 0, 384, 384, x, y, Lf * (0.24 + fr() * 0.1), fr() * TAU, 0.92), Lf * 0.012);
            // half buried: a veil of silt over part of it
            if (fr() < 0.6) {
                const vx = (x + (fr() - 0.5) * Lf * 0.2) * D, vy = (y + (fr() - 0.5) * Lf * 0.2) * D, vr = Lf * 0.14 * D;
                const gr = g.createRadialGradient(vx, vy, 0, vx, vy, vr);
                gr.addColorStop(0, 'rgba(196, 192, 170, 0.55)');
                gr.addColorStop(1, 'rgba(196, 192, 170, 0)');
                g.fillStyle = gr;
                g.fillRect(vx - vr, vy - vr, 2 * vr, 2 * vr);
            }
        }
        // river pebbles: a few small gatherings in the shallows and by the banks
        const groups = images.pebbles ? (W > 700 ? 5 : 3) : 0;
        for (let gI = 0; gI < groups; gI++) {
            const gx0 = gI < 2 ? W * (0.04 + fr() * 0.22) : W * (0.1 + fr() * 0.85);
            const gy0 = gI < 2 ? H * (0.2 + fr() * 0.6) : (fr() < 0.5 ? H * (0.08 + fr() * 0.08) : H * (0.84 + fr() * 0.08));
            const n = 2 + Math.floor(fr() * 4);
            for (let i = 0; i < n; i++) {
                const a = fr() * TAU, d = fr() * Lf * 0.22;
                const cell = Math.floor(fr() * 6);
                shadowed(() => sprite(images.pebbles, (cell % 4) * 256, Math.floor(cell / 4) * 256, 256, 256,
                    gx0 + Math.cos(a) * d, gy0 + Math.sin(a) * d, Lf * (0.06 + fr() * 0.07), fr() * TAU), Lf * 0.01);
            }
        }
        // the water over it: a little green, less light with depth
        g.globalCompositeOperation = 'multiply';
        g.fillStyle = 'rgb(238, 238, 226)';
        g.fillRect(0, 0, c.width, c.height);
        // along the band's long side: the pond deepens toward one end
        const deep = c.width >= c.height ? g.createLinearGradient(0, 0, c.width, c.height * 0.35) : g.createLinearGradient(0, 0, c.width * 0.35, c.height);
        deep.addColorStop(0, 'rgb(255, 252, 242)');
        deep.addColorStop(0.4, 'rgb(226, 229, 214)');
        deep.addColorStop(1, 'rgb(150, 168, 166)');
        g.fillStyle = deep;
        g.fillRect(0, 0, c.width, c.height);
        // the shade of the bank over the deep corner, where the fish rest
        const sx = restSpotFrac().x * c.width, sy = restSpotFrac().y * c.height;
        const sr = Math.min(c.width, c.height) * 0.6;
        const shade = g.createRadialGradient(sx, sy, 0, sx, sy, sr);
        shade.addColorStop(0, 'rgb(196, 200, 194)');
        shade.addColorStop(0.6, 'rgb(236, 238, 232)');
        shade.addColorStop(1, 'rgb(255, 255, 255)');
        g.fillStyle = shade;
        g.fillRect(0, 0, c.width, c.height);
        g.globalCompositeOperation = 'source-over';

        // mean colour, darkened: the colour of depth for the troughs
        const s = document.createElement('canvas');
        s.width = s.height = 8;
        const sg = s.getContext('2d');
        sg.drawImage(c, 0, 0, 8, 8);
        const d = sg.getImageData(0, 0, 8, 8).data;
        let r = 0, gg = 0, b = 0;
        for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
        const n = (d.length / 4) * 255;
        tint = [r / n * 0.45, gg / n * 0.47, b / n * 0.44];
        waterCol = [r / n * 0.7, gg / n * 0.76, b / n * 0.7];

        gl.bindTexture(gl.TEXTURE_2D, texFloor);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, c);

        // mask, at css resolution: per column, a short ramp at the top and bottom lines
        const mw = Math.max(16, Math.round(W)), mh = Math.max(16, Math.round(H));
        const md = new Uint8Array(mw * mh);
        for (let x = 0; x < mw; x++) {
            const cx = (x + 0.5) / mw * W, t = edgeTop(cx), b = edgeBot(cx);
            for (let y = 0; y < mh; y++) {
                const cy = (y + 0.5) / mh * H;
                md[y * mw + x] = Math.round(255 * smooth(0, FADE, Math.min(cy - t, b - cy)));
            }
        }
        gl.bindTexture(gl.TEXTURE_2D, texMask);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, mw, mh, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, md);
    }

    function restSpotFrac() {
        // the corner farthest from where the page's light comes from (top left)
        return { x: 0.8, y: 0.3 };
    }
    function pickRestSpot() {
        const f = restSpotFrac();
        let x = f.x * W, y = f.y * H;
        // walk it in until it is comfortably inside the pond
        for (let i = 0; i < 40 && shape(x, y) > 0.55; i++) { x += (W / 2 - x) * 0.06; y += (H / 2 - y) * 0.06; }
        restSpot = { x, y };
        restHeading = Math.atan2(H / 2 - y, W / 2 - x) + Math.PI * 0.5;
    }

    // ── fish ──────────────────────────────────────────────────────────
    // koi are the subject: about a third of the band's height long, 40% of a phone's width
    const fishLen = () => clamp(Math.min(H * 0.34, W * 0.4), 60, 300) * cfg.size;
    function inside(lim) {
        for (let i = 0; i < 200; i++) {
            const x = W * (0.08 + rand() * 0.84), y = H * (0.08 + rand() * 0.84);
            if (shape(x, y) < lim) return { x, y };
        }
        return { x: W / 2, y: H / 2 };
    }
    function spawn() {
        const n = cfg.koi === 'auto' || !isFinite(Number(cfg.koi))
            ? clamp(Math.round((W * H) / (fishLen() ** 2 * 4.5)), 3, 5)
            : clamp(Math.round(Number(cfg.koi)), 1, 12);
        // the colour is the payoff: mostly red and white and gold, one dark old fish
        const pool = ['kohaku', 'hi', 'yamabuki', 'sanke', 'kohaku', 'chagoi', 'hi', 'kohaku', 'yamabuki', 'sanke', 'hi', 'kohaku'];
        fish = [];
        for (let i = 0; i < n; i++) {
            const k = 0.8 + rand() * 0.36 + (i === 0 ? 0.12 : 0);
            const p = inside(0.62);
            const f = {
                i, k, L: fishLen() * k, x: p.x, y: p.y,
                th: rand() * TAU, v: 0, w: 0, d: 0.3 + rand() * 0.5, dT: 0.4, dTT: 4 + rand() * 6,
                ph: rand() * TAU, A: 0.04, f: 1, beat: rand() < 0.5, beatT: rand() * 2,
                kind: KINDS[pool[i % pool.length]], seed: rand() * 100, mirror: rand() < 0.5,
                fin: rand() * TAU, mode: 'cruise', st: 0, mt: 0, alert: 0, pend: null, lastC: -9,
                dest: null, destT: 0, sp: 0.85 + rand() * 0.3, edge: rand(), crumb: null, cD: 0, cDur: 0.09,
            };
            f.tt = f.th;
            f.v = f.L * 0.4;
            f.dest = pickDest(f);
            fish.push(f);
        }
    }
    // Two or three lily pads, apart from each other, clear of the banks.
    function spawnPads() {
        const n = texPads.length ? (W > 700 ? 3 : 2) : 0, Lf = fishLen();
        const r0 = rng(seed0 ^ 0x2545f491);
        pads = [];
        for (let i = 0; i < n; i++) {
            let best = null;
            for (let t = 0; t < 40; t++) {
                const x = W * (0.1 + r0() * 0.8), y = H * (0.18 + r0() * 0.64);
                if (shape(x, y) > 0.3) continue;
                const room = Math.min(...pads.map((q) => Math.hypot(q.x - x, q.y - y)), 1e9);
                if (!best || room > best.room) best = { x, y, room };
            }
            pads.push({ x: best.x, y: best.y, r: Lf * (0.18 + r0() * 0.05), rot: r0() * TAU, img: i % 2, vx: 0, vy: 0, w: 0, tx: 0, ty: 0, lift: 0 });
        }
    }
    // They ride the water: pushed downhill by the ripples' slope, bobbing with
    // the height, turning a little, settling back to rest.
    function updatePads(dt) {
        for (const q of pads) {
            let gx = 0, gy = 0, hh = 0;
            if (!flat) {
                const cx = clamp(Math.floor(q.x / W * cols), 1, cols - 2), cy = clamp(Math.floor(q.y / H * rows), 1, rows - 2);
                const j = cy * cols + cx;
                gx = (h[j + 1] - h[j - 1]) * 0.5; gy = (h[j + cols] - h[j - cols]) * 0.5; hh = h[j];
            }
            const push = fishLen() * 9;
            q.vx += (-gx * push - q.vx * 0.9) * dt;
            q.vy += (-gy * push - q.vy * 0.9) * dt;
            q.w += ((gx * q.vy - gy * q.vx) * 0.002 - q.w * 0.8) * dt;
            q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.w * dt;
            if (shape(q.x, q.y) > 0.4) { const gr = gradD(q.x, q.y), m = Math.hypot(gr.x, gr.y) || 1; q.vx -= gr.x / m * 20 * dt; q.vy -= gr.y / m * 20 * dt; }
            q.tx = clamp(gx / SLOPE, -1, 1); q.ty = clamp(gy / SLOPE, -1, 1); q.lift = clamp(hh, -1, 1);
        }
    }

    function pickDest(f) {
        // some cruise along the edges, some cross the middle
        if (rand() < 0.35 + f.edge * 0.4) {
            const a0 = Math.atan2(f.y - H / 2, f.x - W / 2) + (rand() < 0.75 ? 1 : -1) * (0.6 + rand() * 0.9);
            let x = W / 2 + Math.cos(a0) * W, y = H / 2 + Math.sin(a0) * H;
            for (let i = 0; i < 60 && shape(x, y) > 0.6; i++) { x += (W / 2 - x) * 0.05; y += (H / 2 - y) * 0.05; }
            return { x, y };
        }
        return inside(0.45);
    }
    // head, middle and tail of a fish, for keeping room between bodies
    const bodyPts = (f) => {
        const c = Math.cos(f.th), sn = Math.sin(f.th), ta = (f.th + f.tt) / 2;
        const tc = Math.cos(ta), ts = Math.sin(ta);
        return [{ x: f.x, y: f.y }, { x: f.x - c * f.L * 0.3, y: f.y - sn * f.L * 0.3 },
            { x: f.x - c * f.L * 0.45 - tc * f.L * 0.15, y: f.y - sn * f.L * 0.45 - ts * f.L * 0.15 },
            { x: f.x - c * f.L * 0.45 - tc * f.L * 0.45, y: f.y - sn * f.L * 0.45 - ts * f.L * 0.45 }];
    };
    // a fish's middle, where a disturbance is measured from
    const mid = (f) => ({ x: f.x - Math.cos(f.th) * f.L * 0.35, y: f.y - Math.sin(f.th) * f.L * 0.35 });

    function update(dt) {
        const idle = (now - lastInput) / 1000 > cfg.rest && !crumbs.length;
        const resting = !calm.matches && idle;
        // crumbs: the nearest calm fish notices one after a second or two
        for (const c of crumbs) {
            c.age += dt;
            c.x += c.vx * dt; c.y += c.vy * dt;
            c.vx *= 1 - dt * 0.2; c.vy *= 1 - dt * 0.2;
            if (c.claim == null && c.age > c.notice) {
                let best = null, bd = 1e9;
                for (const f of fish) {
                    if (f.mode === 'flee' || f.mode === 'feed' || f.alert > 2) continue;
                    const dd = Math.hypot(f.x - c.x, f.y - c.y) / f.L;
                    if (dd < bd) { bd = dd; best = f; }
                }
                if (best) { c.claim = best; best.mode = 'feed'; best.crumb = c; best.mt = 0; best.beat = true; }
            }
        }
        crumbs = crumbs.filter((c) => !c.gone && c.age < 45);

        for (const f of fish) {
            const L = f.L;
            if (f.pend && now >= f.pend.at) { startle(f, f.pend); f.pend = null; }
            f.mt += dt;
            if (f.alert > 0) f.alert = Math.max(0, f.alert - dt);

            // where it wants to go
            let goal = f.dest, vT = L * 0.62 * f.sp * (1 + 0.6 * clamp(f.alert / 4)), dRate = 0.22;
            let wMax = 0.35 + 0.7 * clamp(f.v / L, 0, 1.5), lagK = 0.9;
            if (f.mode === 'rest' && !resting) { f.mode = 'cruise'; f.held = false; f.dest = pickDest(f); }
            if (f.mode === 'cruise' && resting) { f.mode = 'rest'; f.mt = 0; }

            if (f.mode === 'cruise') {
                f.destT -= dt;
                if (!f.dest || f.destT < 0 || Math.hypot(f.dest.x - f.x, f.dest.y - f.y) < L * 1.2) {
                    f.dest = pickDest(f); f.destT = 8 + rand() * 12;
                }
                f.dTT -= dt;
                if (f.dTT < 0) { f.dT = 0.2 + rand() * 0.65; f.dTT = 7 + rand() * 9; }
                goal = f.dest;
            } else if (f.mode === 'feed') {
                const c = f.crumb;
                if (!c || c.gone || f.mt > 14) { f.mode = 'cruise'; f.crumb = null; if (c && !c.gone) c.claim = null, c.notice = c.age + 1.5; }
                else {
                    goal = c;
                    // aim the mouth (the head) at it: rise as it closes in, slow to take it
                    const dist = Math.hypot(c.x - f.x, c.y - f.y);
                    // it starts up at once, steeply; near the crumb it all but stops and
                    // noses round to it while it finishes rising
                    f.dT = 0;
                    dRate = dist < L * 1.5 ? 2 : 1.3;
                    vT = L * clamp(dist / L * 0.55, 0.18, 0.9);
                    const ahead = Math.cos(Math.atan2(c.y - f.y, c.x - f.x) - f.th);
                    if (dist < L * 0.45 && f.d > 0.22) vT = L * 0.08;
                    // behind or beside it: brake and pivot on the pectorals
                    if (ahead < 0.5) { vT = L * (dist < L * 0.9 ? 0.04 : 0.12); f.brake = true; } else f.brake = false;
                    wMax = Math.max(wMax, ahead < 0.5 ? (dist < L * 0.9 ? 2.4 : 1.6) : dist < L * 0.7 ? 1.1 : 0.9);
                    if (dist < L * 0.24 && f.d < 0.22 && ahead > 0.3) take(f, c);
                }
            } else if (f.mode === 'flee') {
                dRate = 0.9;
                if (f.st === 1) {                       // stage 1: the C, head whipped round
                    f.w = f.cD / f.cDur;
                    lagK = 0.15;
                    vT = f.v * 0.8;
                    f.A += (0 - f.A) * clamp(dt * 20);
                    if (f.mt > f.cDur) { f.st = 2; f.mt = 0; f.w = 0; f.v = Math.max(f.v, L * 1.2); }
                } else if (f.st === 2) {                // stage 2: the tail kicks, a sprint
                    vT = L * f.burst;
                    lagK = 7;
                    f.A = 0.15; f.f = 5.5;
                    wMax = 3;
                    if (f.mt > f.burstT) { f.st = 3; f.mt = 0; }
                } else {                                // glide out, then cruise on alert
                    vT = L * 0.5;
                    wMax = 2;
                    if (f.mt > 0.9) { f.mode = 'cruise'; f.beat = true; f.beatT = 1.5; f.destT = 6; }
                }
                goal = f.dest;
            } else if (f.mode === 'rest') {
                const o = restOffset(f);
                goal = o;
                const dist = Math.hypot(o.x - f.x, o.y - f.y);
                f.dT = 0.8 + (f.i % 3) * 0.04;
                // swim to its place, then hang there (and only come back if it drifts well off)
                if (dist < L * 0.6) f.held = true; else if (dist > L * 1.6) f.held = false;
                vT = f.held ? 0 : L * clamp(dist / L * 0.3, 0.08, 0.32);
                if (f.held) goal = { x: f.x + Math.cos(restHeading) * L * 4, y: f.y + Math.sin(restHeading) * L * 4 };
                wMax = f.held ? 0.16 : wMax;
            }

            // steering: the goal, room from the others, the bank
            let gx = 0, gy = 0;
            if (goal) {
                const dx = goal.x - f.x, dy = goal.y - f.y, m = Math.hypot(dx, dy) || 1;
                gx += dx / m; gy += dy / m;
            }
            if (f.mode !== 'flee' || f.st === 3) {
                // keep about 0.6 body lengths between bodies (nearest of head, middle
                // and tail on each), whatever the depth when cruising, so calm
                // fish never lie stacked; a looser pull toward company further off
                const pf = bodyPts(f);
                for (const o of fish) {
                    if (o === f) continue;
                    const po = bodyPts(o);
                    let best = 1e9, bx = 0, by = 0;
                    for (const a of pf) for (const b of po) {
                        const dx = a.x - b.x, dy = a.y - b.y, dd = dx * dx + dy * dy;
                        if (dd < best) { best = dd; bx = dx; by = dy; }
                    }
                    const dd = Math.sqrt(best) || 0.01;
                    const cruising = f.mode === 'cruise' || f.mode === 'rest';
                    const near = (cruising ? 1 : (Math.abs(o.d - f.d) < 0.3 ? 1 : 0.5)) * (f.held ? 0.35 : 1);
                    const room = (f.L + o.L) * 0.32;
                    if (dd < room) {
                        const s = (1 - dd / room) * 3.6 * near; gx += bx / dd * s; gy += by / dd * s;
                        // and a gentle sideways give, as two fish ease apart rather than pass through
                        if (cruising) { const k = (room - dd) * 0.9 * dt * near; f.x += bx / dd * k; f.y += by / dd * k; }
                    }
                    else if (dd < room * 4 && f.mode === 'cruise') {
                        const m = mid(f), n = mid(o), cx = n.x - m.x, cy = n.y - m.y, cm = Math.hypot(cx, cy) || 1;
                        gx += cx / cm * 0.04; gy += cy / cm * 0.04;
                    }
                }
            }
            const look = L * 0.9 + f.v * 0.7;
            const ax = f.x + Math.cos(f.th) * look, ay = f.y + Math.sin(f.th) * look;
            const dA = shape(ax, ay), dH = shape(f.x, f.y);
            // a feeding fish noses right up to the bank; otherwise it keeps off
            const bank = f.mode === 'feed' ? 0.86 : 0.6;
            if (dA > bank || dH > bank + 0.06) {
                const gr = gradD(ax, ay), gm = Math.hypot(gr.x, gr.y) || 1;
                const push = clamp((Math.max(dA, dH) - bank) / 0.12, 0, 2.5) * 2.2 * (f.mode === 'feed' ? 0.5 : 1);
                gx -= gr.x / gm * push; gy -= gr.y / gm * push;
                wMax = Math.max(wMax, 0.5 + push * 0.4);
            }
            if (!(f.mode === 'flee' && f.st === 1)) {
                const want = Math.atan2(gy, gx);
                let dth = (gx || gy) ? wrap(want - f.th) : 0;
                // something right behind: commit to one way round instead of dithering
                if (Math.abs(dth) > 2.6) dth = Math.abs(f.w) > 0.04 ? Math.sign(f.w) * Math.abs(dth) : (f.i % 2 ? 1 : -1) * Math.abs(dth);
                const wT = clamp(dth * 1.3, -wMax, wMax);
                f.w += (wT - f.w) * clamp(dt * 2.6);
            }
            f.th = wrap(f.th + f.w * dt);
            // the tail follows the head's path: the lag is the bend
            f.tt = f.th - clamp(wrap(f.th - f.tt), -2.4, 2.4);
            f.tt += wrap(f.th - f.tt) * clamp(dt * (lagK * f.v / L + 0.45));

            // the stroke: beat and glide
            if (f.mode !== 'flee' || f.st === 3) {
                if (f.mode === 'cruise' || f.mode === 'rest') {
                    f.beatT -= dt;
                    if (f.beatT < 0) {
                        f.beat = !f.beat;
                        f.beatT = f.beat ? 1.2 + rand() * 2.4 : 1 + rand() * 2.8;
                    }
                } else f.beat = true;
                const slow = f.mode === 'rest' && vT < L * 0.05;
                if (f.beat && !slow) {
                    f.v += (vT - f.v) * clamp(dt / (f.brake && f.mode === 'feed' ? 0.5 : 1.1));
                    f.A += (0.075 - f.A) * clamp(dt * 2);
                    f.f += (0.7 + 1.3 * f.v / L - f.f) * clamp(dt * 2);
                } else {
                    f.v += ((slow ? vT : 0) - f.v) * clamp(dt / (slow ? 1.5 : 3.2));
                    f.A += ((slow ? 0.012 : 0.008) - f.A) * clamp(dt * 1.5);
                    f.f += ((slow ? 0.5 : 0.35) - f.f) * clamp(dt);
                }
            } else {
                f.v += (vT - f.v) * clamp(dt / (f.st === 2 ? 0.07 : 0.6));
                if (f.st === 3) f.A += (0.02 - f.A) * clamp(dt * 3);
            }
            f.ph += TAU * f.f * dt;
            f.fin += TAU * dt * (f.v / L < 0.35 ? 1.3 : 0.5);
            f.x += Math.cos(f.th) * f.v * dt;
            f.y += Math.sin(f.th) * f.v * dt;
            // never through the bank
            if (shape(f.x, f.y) > (f.mode === 'feed' ? 0.93 : 0.76)) {
                const gr = gradD(f.x, f.y), gm = Math.hypot(gr.x, gr.y) || 1;
                f.x -= gr.x / gm * 2; f.y -= gr.y / gm * 2;
            }
            f.d += (f.dT - f.d) * clamp(dt * dRate);
            // a fish right under the surface lifts a bulge as it goes
            if (f.d < 0.12 && f.v > L * 0.15) {
                const g0 = toGridCss(f.x - Math.cos(f.th) * f.v * dt, f.y - Math.sin(f.th) * f.v * dt), g1 = toGridCss(f.x, f.y);
                segs.push({ ax: g0.x, ay: g0.y, bx: g1.x, by: g1.y, k: 0.14 * (1 - f.d / 0.12) });
            }
        }
        // resting: once all hang still, the pond can sleep
        if (resting) {
            restFade = Math.max(0, restFade - dt / 12);
            const still = fish.every((f) => f.mode === 'rest' && f.held && f.v < f.L * 0.05);
            settledFor = still ? settledFor + dt : 0;
        } else { restFade = Math.min(1, restFade + dt / 1.5); settledFor = 0; }
    }

    function restOffset(f) {
        const n = fish.length, i = f.i;
        const a = restHeading, ca = Math.cos(a), sa = Math.sin(a);
        const col = (i % 3) - 1, row = Math.floor(i / 3);
        const L = fishLen();
        const ox = col * L * 0.62 + (row % 2) * L * 0.3, oy = row * L * 1.05 - (n > 3 ? L * 0.5 : 0);
        let x = restSpot.x + ox * -sa + oy * ca, y = restSpot.y + ox * ca + oy * sa;
        for (let k = 0; k < 40 && shape(x, y) > 0.56; k++) { x += (W / 2 - x) * 0.05; y += (H / 2 - y) * 0.05; }
        return { x, y };
    }

    // the C-start
    function startle(f, src) {
        if (now / 1000 - f.lastC < 0.8) return;
        f.lastC = now / 1000;
        const m = mid(f);
        const away = Math.atan2(m.y - src.y, m.x - src.x);
        let dth = wrap(away - f.th);
        // turn to whichever side has more open water
        const tryH = (a) => shape(f.x + Math.cos(a) * f.L * 2, f.y + Math.sin(a) * f.L * 2);
        if (Math.abs(dth) < 0.7) dth = (dth < 0 ? -1 : 1) * (0.7 + rand() * 0.4);
        if (tryH(f.th + dth) > 0.7 && tryH(f.th - dth) < tryH(f.th + dth)) dth = -dth;
        f.cD = clamp(dth, -2.1, 2.1);
        f.cDur = 0.07 + rand() * 0.04;
        f.mode = 'flee'; f.st = 1; f.mt = 0;
        f.burst = 3 + rand() * 1.4 * src.s;
        f.burstT = 0.28 + rand() * 0.2;
        f.alert = 5 + rand() * 4;
        f.dT = Math.min(0.95, f.d + 0.35);
        if (f.crumb) { f.crumb.claim = null; f.crumb.notice = f.crumb.age + 2 + rand() * 2; f.crumb = null; }
        const a = f.th + f.cD;
        let x = f.x + Math.cos(a) * f.L * 4, y = f.y + Math.sin(a) * f.L * 4;
        for (let i = 0; i < 60 && shape(x, y) > 0.6; i++) { x += (W / 2 - x) * 0.05; y += (H / 2 - y) * 0.05; }
        f.dest = { x, y };
    }
    function veer(f, src) {
        const m = mid(f);
        const away = Math.atan2(m.y - src.y, m.x - src.x);
        let x = f.x + Math.cos(away) * f.L * 3, y = f.y + Math.sin(away) * f.L * 3;
        for (let i = 0; i < 60 && shape(x, y) > 0.6; i++) { x += (W / 2 - x) * 0.05; y += (H / 2 - y) * 0.05; }
        f.dest = { x, y }; f.destT = 5; f.alert = Math.max(f.alert, 2.5); f.beat = true; f.beatT = 1.5;
        if (f.mode === 'rest') f.mode = 'cruise';
    }

    // A hand drawn through the water, from a to b (css px) at speed sp px/s.
    // Fish near it bolt; further ones react later and less, or only turn away.
    function disturb(ax, ay, bx, by, sp, k) {
        let count = 0;
        const t0 = now;
        for (const f of fish) {
            const m = mid(f);
            const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
            const t = clamp(((m.x - ax) * dx + (m.y - ay) * dy) / l2);
            const qx = ax + dx * t, qy = ay + dy * t;
            const dist = Math.hypot(m.x - qx, m.y - qy);
            const fall = clamp(1 - (dist - f.L * 0.45) / (f.L * 2.3));
            const s = fall * (0.3 + 0.7 * clamp(sp / 650)) * k;
            if (s > 0.38 && f.mode !== 'flee' && !f.pend) {
                f.pend = { at: t0 + (0.015 + dist / 1400 + rand() * 0.05) * 1000, x: qx, y: qy, s: clamp(s) };
                count++;
            } else if (s > 0.14 && f.mode !== 'flee') veer(f, { x: qx, y: qy });
        }
        if (count && (now - lastStartleEvt) > 600) {
            lastStartleEvt = now;
            root.dispatchEvent(new CustomEvent('koi-pond:startle', { bubbles: true, detail: { x: bx, y: by, count } }));
        }
    }

    function dropCrumb(x, y) {
        if (maskAt(x, y) < 0.6 || shape(x, y) > 0.9 || crumbs.length > 7) return;
        crumbs.push({ x, y, vx: 0, vy: 0, age: 0, notice: 0.5 + rand() * 0.8, claim: null, gone: false, seed: rand() * 6, fade: 0 });
        const g = toGridCss(x, y);
        ring(g.x, g.y, Math.max(3, stoneR() * 0.42), 0.07 * lift());
        flat = false;
        root.dispatchEvent(new CustomEvent('koi-pond:crumb', { bubbles: true, detail: { x, y } }));
        kick();
    }
    function take(f, c) {
        c.gone = true;
        f.crumb = null;
        f.mode = 'cruise'; f.dT = 0.45; f.dTT = 6; f.beat = true; f.beatT = 1.2; f.destT = 0;
        const g = toGridCss(c.x, c.y);
        // the rise: the lips break the surface, a ring, then the slurp closing over
        ring(g.x, g.y, Math.max(3.2, stoneR() * 0.5), 0.22 * lift());
        events.push({ t: simT + 0.16, fn: () => bump(h, g.x, g.y, Math.max(2.6, stoneR() * 0.4), -0.1 * lift()) });
        flat = false;
        root.dispatchEvent(new CustomEvent('koi-pond:rise', { bubbles: true, detail: { x: c.x, y: c.y } }));
    }

    // ── water simulation (ripple-pool) ────────────────────────────────
    const stonePx = () => clamp(Math.max(W, H) * 0.034, 14, 56);
    const stoneR = () => stonePx() / cell;
    const lift = () => (stoneR() / 5) * clamp(stonePx() / 40, 0.6, 1);
    const toGridCss = (x, y) => ({ x: (x / W) * cols, y: (y / H) * rows });

    function bump(arr, gx, gy, r, amp) {
        const x0 = Math.max(0, Math.floor(gx - r)), x1 = Math.min(cols - 1, Math.ceil(gx + r));
        const y0 = Math.max(0, Math.floor(gy - r)), y1 = Math.min(rows - 1, Math.ceil(gy + r));
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
            const d = Math.hypot(x + 0.5 - gx, y + 0.5 - gy) / r;
            if (d < 1) arr[y * cols + x] += amp * (0.5 + 0.5 * Math.cos(Math.PI * d));
        }
    }
    function ring(gx, gy, r, amp) {
        const R = r * 2.4, k = Math.PI / (r * 0.62);
        const x0 = Math.max(0, Math.floor(gx - R)), x1 = Math.min(cols - 1, Math.ceil(gx + R));
        const y0 = Math.max(0, Math.floor(gy - R)), y1 = Math.min(rows - 1, Math.ceil(gy + R));
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
            const d = Math.hypot(x + 0.5 - gx, y + 0.5 - gy);
            if (d < R) h[y * cols + x] -= amp * 0.42 * Math.cos(k * d) * Math.exp(-(d * d) / (r * r * 1.1));
        }
    }
    function wake(seg, f0, f1) {
        const ax = seg.ax + (seg.bx - seg.ax) * f0, ay = seg.ay + (seg.by - seg.ay) * f0;
        const bx = seg.ax + (seg.bx - seg.ax) * f1, by = seg.ay + (seg.by - seg.ay) * f1;
        const len = Math.hypot(bx - ax, by - ay);
        const fast = clamp(len / (stoneR() * 0.18), 0, 1);
        const r = stoneR() * (0.85 + 0.35 * fast) * (seg.k < 0.3 ? 0.8 : 1);
        const n = Math.max(1, Math.ceil(len / (r * 0.3)));
        const depth = 0.68 * seg.k * lift() * (1 - 0.4 * fast);
        for (let i = 0; i < n; i++) {
            const f = n === 1 ? 1 : (i + 1) / n;
            sink(ax + (bx - ax) * f, ay + (by - ay) * f, r, depth);
        }
    }
    function sink(gx, gy, r, depth) {
        const x0 = Math.max(0, Math.floor(gx - r)), x1 = Math.min(cols - 1, Math.ceil(gx + r));
        const y0 = Math.max(0, Math.floor(gy - r)), y1 = Math.min(rows - 1, Math.ceil(gy + r));
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
            const d = Math.hypot(x + 0.5 - gx, y + 0.5 - gy) / r;
            if (d >= 1) continue;
            const w = 0.5 + 0.5 * Math.cos(Math.PI * d);
            const j = y * cols + x, t = -depth * w;
            if (h[j] > t) h[j] += (t - h[j]) * 0.5 * w;
        }
    }
    function step(i, n) {
        simT += STEP;
        for (let k = events.length - 1; k >= 0; k--) if (events[k].t <= simT) { events[k].fn(); events.splice(k, 1); }
        for (const s of segs) wake(s, i / n, (i + 1) / n);
        let damp = Math.exp(Math.log(0.3) / (3.2 * HZ));
        if (maxS < 12 / 127 && !segs.length && !events.length) damp *= Math.exp(Math.log(0.25) / HZ);
        const C = cols, R = rows;
        const Lp = (a, out) => {
            for (let y = 0; y < R; y++) {
                const row = y * C, up = y > 0 ? row - C : row, dn = y < R - 1 ? row + C : row;
                for (let x = 0; x < C; x++) {
                    const j = row + x, aj = a[j];
                    out[j] = ((x > 0 ? a[j - 1] : aj) + (x < C - 1 ? a[j + 1] : aj) + a[up + x] + a[dn + x]) * 0.25 - aj;
                }
            }
        };
        Lp(h, lap);
        for (let y = 0; y < R; y++) {
            const row = y * C, up = y > 0 ? row - C : row, dn = y < R - 1 ? row + C : row;
            for (let x = 0; x < C; x++) {
                const j = row + x, dj = lap[j];
                const ll = ((x > 0 ? lap[j - 1] : dj) + (x < C - 1 ? lap[j + 1] : dj) + lap[up + x] + lap[dn + x]) * 0.25 - dj;
                v[j] = (v[j] + dj * SPEED - ll * TENSION) * damp * sponge[j];
            }
        }
        Lp(v, lapV);
        let sum = 0, mv = 0;
        for (let j = 0, N = C * R; j < N; j++) {
            const vj = (v[j] += lapV[j] * VISCOSITY);
            const hj = (h[j] = (h[j] + vj - mean) * (sponge[j] < 1 ? 0.5 + 0.5 * sponge[j] : 1));
            sum += hj;
            if (vj > mv) mv = vj; else if (-vj > mv) mv = -vj;
        }
        mean = sum / (C * R);
        maxV = mv;
    }
    function encode() {
        const C = cols, R = rows, kc = FOCUS_K;
        let ms = 0;
        for (let y = 0; y < R; y++) {
            const row = y * C, up = y > 0 ? row - C : row, dn = y < R - 1 ? row + C : row;
            for (let x = 0; x < C; x++) {
                const j = row + x, hj = h[j];
                const xl = x > 0 ? x - 1 : x, xr = x < C - 1 ? x + 1 : x;
                const l = h[row + xl], r = h[row + xr], u = h[up + x], d = h[dn + x];
                const gx = (r - l) * 0.5, gy = (d - u) * 0.5;
                const hxx = l + r - 2 * hj, hyy = u + d - 2 * hj;
                const hxy = (h[dn + xr] - h[dn + xl] - h[up + xr] + h[up + xl]) * 0.25;
                const det = (1 + kc * hxx) * (1 + kc * hyy) - kc * kc * hxy * hxy;
                const I = 1 / Math.max(det, 1 / (1 + FOCUS));
                const sx = Math.tanh(gx / SLOPE), sy = Math.tanh(gy / SLOPE);
                const a = Math.abs(sx) + Math.abs(sy);
                if (a > ms) ms = a;
                const o = j * 4;
                px[o] = 128 + Math.round(sx * 127);
                px[o + 1] = 128 + Math.round(sy * 127);
                px[o + 2] = 128 + Math.round(clamp((I - 1) / FOCUS, -1, 1) * 127);
                px[o + 3] = 128 + Math.round(clamp(hj, -1, 1) * 127);
            }
        }
        maxS = ms;
        gl.bindTexture(gl.TEXTURE_2D, texWater);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, cols, rows, gl.RGBA, gl.UNSIGNED_BYTE, px);
    }
    function flatten() {
        h.fill(0); v.fill(0); px.fill(128); mean = 0; maxV = maxS = 0; flat = true;
        encode();
    }

    // ── meshes ────────────────────────────────────────────────────────
    // The spine: the head is where the fish is; behind it each segment turns
    // a little more toward where the tail still points (the lag), and a wave
    // runs down, growing toward the tail.
    function buildFish(f, out, o) {
        const L = f.L, N = SEG;
        const bend = wrap(f.th - f.tt);
        let x = f.x, y = f.y;
        const p0 = -TEX_X0 / TEX_L, p1 = (1 - TEX_X0) / TEX_L;
        // start a little ahead of the snout (texture margin)
        let ang = f.th;
        x += Math.cos(ang) * (-p0) * L; y += Math.sin(ang) * (-p0) * L;
        const pts = [];
        for (let i = 0; i <= N; i++) {
            const p = p0 + (p1 - p0) * (i / N);
            const pc = clamp(p, 0, 1.05);
            const g = Math.pow(clamp(pc / 0.85), 1.3);
            ang = f.th - bend * g;
            if (i > 0) {
                const ds = (p1 - p0) / N * L;
                x -= Math.cos(ang) * ds; y -= Math.sin(ang) * ds;
            }
            // lateral wave, mostly in the back half
            const amp = f.A * L * (0.1 + 0.9 * pc * pc);
            const lat = amp * Math.sin(TAU * pc / 0.95 - f.ph);
            // the slope of the wave turns the local cross-section a touch
            pts.push({ x: x - Math.sin(ang) * lat, y: y + Math.cos(ang) * lat, a: ang, p });
        }
        // normals from neighbours
        const hw = HALF * L;
        for (let i = 0; i <= N; i++) {
            const a = pts[Math.max(0, i - 1)], b = pts[Math.min(N, i + 1)];
            const dx = a.x - b.x, dy = a.y - b.y, m = Math.hypot(dx, dy) || 1;
            const nx = -dy / m, ny = dx / m;
            const u = i / N;
            const v0 = f.mirror ? 1 : 0, v1 = 1 - v0;
            out[o++] = pts[i].x + nx * hw; out[o++] = pts[i].y + ny * hw; out[o++] = u; out[o++] = v0;
            out[o++] = pts[i].x - nx * hw; out[o++] = pts[i].y - ny * hw; out[o++] = u; out[o++] = v1;
        }
        f.pts = pts;
        // pectoral fins: out from the sides just behind the head; they fold
        // back as the fish speeds up and scull when it hangs still
        const iF = Math.round((0.215 - p0) / (p1 - p0) * N);
        const B = pts[iF], back = B.a + Math.PI;
        const spd = clamp(f.v / f.L / 1.1);
        const scull = 0.26 * (1 - clamp(f.v / f.L / 0.7));
        const fold = f.mode === 'flee' && f.st < 3 ? 0.18 : 0;
        for (const side of [-1, 1]) {
            const turnIn = clamp(-side * f.w / 0.9, 0, 1) * 0.3;
            const alpha = fold || (1.15 - 0.75 * spd + turnIn + scull * Math.sin(f.fin + (side > 0 ? 0 : Math.PI)));
            const da = back - side * alpha;                    // out and back
            const ex = Math.cos(da), ey = Math.sin(da);
            const qx = -ey, qy = ex;
            const bx = B.x + Math.cos(B.a + side * Math.PI / 2) * L * 0.062, by = B.y + Math.sin(B.a + side * Math.PI / 2) * L * 0.062;
            const fl = L * 0.15, fw = L * 0.07 * (0.85 + 0.15 * Math.cos(f.fin));
            const sv = side > 0 ? 1 : 0;
            const put = (X, Y, U, V) => { out[o++] = X; out[o++] = Y; out[o++] = U; out[o++] = V; };
            put(bx - qx * fw / 2, by - qy * fw / 2, 0, sv);
            put(bx + qx * fw / 2, by + qy * fw / 2, 0, 1 - sv);
            put(bx + ex * fl - qx * fw / 2, by + ey * fl - qy * fw / 2, 1, sv);
            put(bx + ex * fl + qx * fw / 2, by + ey * fl + qy * fw / 2, 1, 1 - sv);
        }
        // the shadow's strip: the same spine, longer and wider, so a shadow
        // blurred by a fish high in the water has room to spread
        const sp0 = -0.15, sp1 = 1.15, hs = 0.325 * L;
        const at = (pp) => {
            if (pp <= p0) { const a0 = pts[0]; return { x: a0.x + Math.cos(f.th) * (p0 - pp) * L, y: a0.y + Math.sin(f.th) * (p0 - pp) * L }; }
            if (pp >= p1) { const a1 = pts[N]; return { x: a1.x - Math.cos(a1.a) * (pp - p1) * L, y: a1.y - Math.sin(a1.a) * (pp - p1) * L }; }
            const t = (pp - p0) / (p1 - p0) * N, k = Math.min(N - 1, Math.floor(t)), fr = t - k;
            return { x: pts[k].x + (pts[k + 1].x - pts[k].x) * fr, y: pts[k].y + (pts[k + 1].y - pts[k].y) * fr };
        };
        const sp = [];
        for (let i = 0; i <= N; i++) sp.push(at(sp0 + (sp1 - sp0) * (i / N)));
        for (let i = 0; i <= N; i++) {
            const a = sp[Math.max(0, i - 1)], b = sp[Math.min(N, i + 1)];
            const dx = a.x - b.x, dy = a.y - b.y, m = Math.hypot(dx, dy) || 1;
            const nx = -dy / m, ny = dx / m, u = i / N;
            const v0 = f.mirror ? 1 : 0, v1 = 1 - v0;
            out[o++] = sp[i].x + nx * hs; out[o++] = sp[i].y + ny * hs; out[o++] = u; out[o++] = v0;
            out[o++] = sp[i].x - nx * hs; out[o++] = sp[i].y - ny * hs; out[o++] = u; out[o++] = v1;
        }
        return o;
    }
    function buildCrumb(c, out, o, size) {
        const s = size / 2;
        out[o++] = c.x - s; out[o++] = c.y - s; out[o++] = 0; out[o++] = 0;
        out[o++] = c.x + s; out[o++] = c.y - s; out[o++] = 1; out[o++] = 0;
        out[o++] = c.x - s; out[o++] = c.y + s; out[o++] = 0; out[o++] = 1;
        out[o++] = c.x + s; out[o++] = c.y + s; out[o++] = 1; out[o++] = 1;
        return o;
    }

    // ── render ────────────────────────────────────────────────────────
    const BODY_V = (SEG + 1) * 2;
    function draw() {
        // vertices: per fish body strip + two fin quads; then crumbs
        const per = BODY_V * 2 + 8;
        const need = (fish.length * per + crumbs.length * 4 + pads.length * 4) * 4;
        if (verts.length < need) verts = new Float32Array(need * 2);
        let o = 0;
        for (const f of fish) o = buildFish(f, verts, o);
        const crumbPx = clamp(fishLen() * 0.065, 7, 12);
        for (const c of crumbs) o = buildCrumb(c, verts, o, crumbPx);
        for (const q of pads) {
            const k = q.r * (1 + q.lift * 0.03), ca = Math.cos(q.rot) * k, sa = Math.sin(q.rot) * k;
            const put = (ux, uy) => { verts[o++] = q.x + ux * ca - uy * sa; verts[o++] = q.y + ux * sa + uy * ca; verts[o++] = (ux + 1) / 2; verts[o++] = (uy + 1) / 2; };
            put(-1, -1); put(1, -1); put(-1, 1); put(1, 1);
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, dynBuf);
        gl.bufferData(gl.ARRAY_BUFFER, verts.subarray(0, o), gl.DYNAMIC_DRAW);

        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.viewport(0, 0, canvas.width, canvas.height);
        // floor
        gl.disable(gl.BLEND);
        gl.useProgram(P.floor.p);
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
        gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texFloor);
        gl.uniform1i(P.floor.u.uFloor, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        gl.bindBuffer(gl.ARRAY_BUFFER, dynBuf);
        gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
        gl.enable(gl.BLEND);

        // shadows: the sun from the upper left, so they fall down and right;
        // the higher the fish, the further off and the softer
        gl.useProgram(P.shadow.p);
        gl.uniform2f(P.shadow.u.uRes, W, H);
        gl.uniform1i(P.shadow.u.uTex, 0);
        gl.blendFuncSeparate(gl.DST_COLOR, gl.ZERO, gl.ZERO, gl.ONE);      // multiply
        fish.forEach((f, i) => {
            const hgt = 1 - f.d;
            const off = f.L * (0.08 + 0.42 * hgt);
            gl.uniform2f(P.shadow.u.uOff, off * 0.62, off * 0.78);
            gl.uniform1f(P.shadow.u.uH, hgt);
            gl.uniform1f(P.shadow.u.uStrength, 0.62 - 0.22 * hgt);
            gl.uniform1f(P.shadow.u.uMode, 0);
            gl.bindTexture(gl.TEXTURE_2D, texShadow);
            gl.drawArrays(gl.TRIANGLE_STRIP, i * per + BODY_V + 8, BODY_V);
            gl.uniform1f(P.shadow.u.uMode, 1);
            gl.uniform1f(P.shadow.u.uStrength, (0.62 - 0.22 * hgt) * 0.4);
            gl.bindTexture(gl.TEXTURE_2D, texFin);
            gl.drawArrays(gl.TRIANGLE_STRIP, i * per + BODY_V, 4);
            gl.drawArrays(gl.TRIANGLE_STRIP, i * per + BODY_V + 4, 4);
        });
        const cBase = fish.length * per;
        crumbs.forEach((c, i) => {
            const off = fishLen() * 0.5;
            gl.uniform2f(P.shadow.u.uOff, off * 0.62, off * 0.78);
            gl.uniform1f(P.shadow.u.uMode, 2);
            gl.uniform1f(P.shadow.u.uStrength, 0.35 * c.fade);
            gl.drawArrays(gl.TRIANGLE_STRIP, cBase + i * 4, 4);
        });

        // the pads' shadows: they float at the surface, so furthest off and softest
        const pBase = cBase + crumbs.length * 4;
        pads.forEach((q, i) => {
            const off = fishLen() * 0.5;
            gl.uniform2f(P.shadow.u.uOff, off * 0.62, off * 0.78);
            gl.uniform1f(P.shadow.u.uMode, 2);          // a soft disc: at the surface the notch is lost in the blur
            gl.uniform1f(P.shadow.u.uStrength, 0.75);
            gl.drawArrays(gl.TRIANGLE_STRIP, pBase + i * 4, 4);
        });

        // fish, deepest first; alpha keeps how much water bends each one
        gl.useProgram(P.fish.p);
        gl.uniform2f(P.fish.u.uRes, W, H);
        gl.uniform2f(P.fish.u.uOff, 0, 0);
        gl.uniform1i(P.fish.u.uTex, 0);
        gl.uniform3f(P.fish.u.uWater, ...waterCol);
        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.CONSTANT_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        const order = fish.map((f, i) => i).sort((a, b) => fish[b].d - fish[a].d);
        for (const i of order) {
            const f = fish[i];
            gl.blendColor(0, 0, 0, 0.22 + 0.78 * f.d);
            gl.uniform1f(P.fish.u.uDepth, f.d);
            gl.uniform1f(P.fish.u.uKind, f.kind);
            gl.uniform1f(P.fish.u.uSeed, f.seed);
            gl.uniform1f(P.fish.u.uFin, 1);
            gl.uniform1f(P.fish.u.uAlpha, 1);
            gl.bindTexture(gl.TEXTURE_2D, texFin);
            gl.drawArrays(gl.TRIANGLE_STRIP, i * per + BODY_V, 4);
            gl.drawArrays(gl.TRIANGLE_STRIP, i * per + BODY_V + 4, 4);
            gl.uniform1f(P.fish.u.uFin, 0);
            gl.uniform1f(P.fish.u.uAlpha, 1);
            gl.bindTexture(gl.TEXTURE_2D, texKoi);
            gl.drawArrays(gl.TRIANGLE_STRIP, i * per, BODY_V);
        }

        // the water, looking down through it
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.disable(gl.BLEND);
        gl.useProgram(P.water.p);
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
        gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texScene); gl.uniform1i(P.water.u.uImg, 0);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texWater); gl.uniform1i(P.water.u.uWater, 1);
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, texMask); gl.uniform1i(P.water.u.uMask, 2);
        gl.uniform1f(P.water.u.uTime, ambT);
        gl.uniform1f(P.water.u.uLong, W >= H ? 1 : 0);
        const po = fishLen() * 0.5, pu = new Float32Array(12);
        pads.slice(0, 3).forEach((q, i) => { pu.set([q.x + po * 0.62, q.y + po * 0.78, q.r, 1], i * 4); });
        gl.uniform4fv(P.water.u.uPads, pu);
        // at rest the swell slows to a stop but its net of light stays, as on still water
        gl.uniform1f(P.water.u.uAmbient, cfg.ambient * (0.55 + 0.45 * restFade));
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.activeTexture(gl.TEXTURE0);

        // lily pads on the surface: the fish pass under them
        if (pads.length) {
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            gl.useProgram(P.pad.p);
            gl.uniform2f(P.pad.u.uRes, W, H);
            gl.uniform2f(P.pad.u.uOff, 0, 0);
            gl.uniform1i(P.pad.u.uTex, 0);
            gl.bindBuffer(gl.ARRAY_BUFFER, dynBuf);
            gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
            pads.forEach((q, i) => {
                gl.uniform2f(P.pad.u.uTilt, q.tx, q.ty);
                gl.bindTexture(gl.TEXTURE_2D, texPads[q.img]);
                gl.drawArrays(gl.TRIANGLE_STRIP, pBase + i * 4, 4);
            });
            gl.disable(gl.BLEND);
        }

        // crumbs float on top
        if (crumbs.length) {
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            gl.useProgram(P.crumb.p);
            gl.uniform2f(P.crumb.u.uRes, W, H);
            gl.uniform2f(P.crumb.u.uOff, 0, 0);
            gl.bindBuffer(gl.ARRAY_BUFFER, dynBuf);
            gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
            crumbs.forEach((c, i) => {
                gl.uniform1f(P.crumb.u.uFade, c.fade);
                gl.uniform1f(P.crumb.u.uSeed, c.seed);
                gl.drawArrays(gl.TRIANGLE_STRIP, cBase + i * 4, 4);
            });
            gl.disable(gl.BLEND);
        }
    }

    // ── loop ──────────────────────────────────────────────────────────
    let cost = 0;
    function frame(t) {
        raf = 0;
        if (dead || !gl || gl.isContextLost()) return;
        const c0 = performance.now();
        now = t;
        const dt = last ? Math.min(0.05, (t - last) / 1000) : 1 / 60;
        last = t;
        acc += dt;
        let n = Math.floor(acc / STEP);
        if (n > 8) { n = 8; acc = 0; } else acc -= n * STEP;

        update(dt);
        updatePads(dt);
        for (const c of crumbs) c.fade = Math.min(1, c.fade + dt * 6) * (c.age > 40 ? clamp((45 - c.age) / 5) : 1);
        if (segs.length || events.length) flat = false;
        if (cfg.ambient) ambT += dt * restFade;
        if (!flat && n > 0) {
            for (let i = 0; i < n; i++) step(i, n);
            segs = [];
            encode();
        } else segs = [];
        const lively = !flat && (maxV > 1e-3 || maxS > 2 / 127 || events.length > 0);
        if (!flat && !lively) flatten();

        const resting = restFade < 1 && settledFor > 0;
        const interval = resting ? 1000 / 24 : 0;
        if (t - lastDraw >= interval) { draw(); lastDraw = t; }
        sleeping = settledFor > 14 && flat && restFade === 0;
        cost += (performance.now() - c0 - cost) * 0.05;
        if (visible && !document.hidden && !sleeping) raf = requestAnimationFrame(frame);
        else { last = 0; acc = 0; }
    }
    function kick() {
        if (!raf && visible && gl && !calm.matches && !document.hidden) raf = requestAnimationFrame(frame);
    }
    function wakeUp() {
        lastInput = performance.now();
        if (sleeping) { sleeping = false; settledFor = 0; }
        kick();
    }

    // ── input ─────────────────────────────────────────────────────────
    const local = (cx, cy) => { const r = root.getBoundingClientRect(); return { x: cx - r.left, y: cy - r.top }; };
    const inPond = (p) => p.x >= 0 && p.y >= 0 && p.x <= W && p.y <= H;
    function trail(p, k) {
        const t = performance.now();
        if (ptr && inPond(p)) {
            const len = Math.hypot(p.x - ptr.x, p.y - ptr.y);
            const dtp = Math.max(8, t - ptrT) / 1000;
            if (len > 0.3 && (k === 1 || len < Math.max(W, H) * 0.3)) {
                const a = toGridCss(ptr.x, ptr.y), b = toGridCss(p.x, p.y);
                segs.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, k });
                disturb(ptr.x, ptr.y, p.x, p.y, len / dtp, k === 1 ? 1 : 0.55);
                wakeUp();
            }
        }
        ptr = inPond(p) ? p : null;
        ptrT = t;
    }
    function onPointerMove(e) {
        if (e.pointerType === 'touch' || calm.matches) return;
        trail(local(e.clientX, e.clientY), e.buttons ? 1 : 0.3);
    }
    function onPointerDown(e) {
        if (e.pointerType === 'touch' || calm.matches || e.button !== 0) return;
        e.preventDefault();
        const p = local(e.clientX, e.clientY);
        ptr = p; ptrT = performance.now();
        press = { x: e.clientX, y: e.clientY, at: performance.now(), p };
        wakeUp();
    }
    function onPointerUp(e) {
        if (!press || e.pointerType === 'touch') return;
        if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < 6 && performance.now() - press.at < 450) dropCrumb(press.p.x, press.p.y);
        press = null;
    }
    const onPointerLeave = (e) => { if (e.pointerType !== 'touch') ptr = null; };

    // Touch: horizontal strokes stir the water (touch-action: pan-y keeps
    // them ours), vertical swipes scroll the page, a tap drops a crumb.
    function onTouchStart(e) {
        if (calm.matches) return;
        const t = e.changedTouches[0];
        touch0 = { id: t.identifier, x: t.clientX, y: t.clientY, at: performance.now(), moved: 0, dir: 0 };
        ptr = null;
        wakeUp();
    }
    function onTouchMove(e) {
        if (!touch0 || calm.matches) return;
        for (const t of e.changedTouches) {
            if (t.identifier !== touch0.id) continue;
            const dx = t.clientX - touch0.x, dy = t.clientY - touch0.y;
            touch0.moved = Math.max(touch0.moved, Math.hypot(dx, dy));
            if (!touch0.dir && touch0.moved > 8) touch0.dir = Math.abs(dy) > Math.abs(dx) * 1.2 ? 2 : 1;
            if (touch0.dir === 1) trail(local(t.clientX, t.clientY), 1);
        }
    }
    function onTouchEnd(e) {
        if (!touch0) return;
        for (const t of e.changedTouches) {
            if (t.identifier !== touch0.id) continue;
            if (e.type === 'touchend' && touch0.moved < 10 && performance.now() - touch0.at < 350) {
                const p = local(t.clientX, t.clientY);
                if (inPond(p)) dropCrumb(p.x, p.y);
            }
            touch0 = null;
            ptr = null;
        }
    }
    function onKey(e) {
        if (calm.matches || !gl) return;
        const dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            const p = inside(0.5);
            dropCrumb(p.x, p.y);
            wakeUp();
        } else if (dirs[e.key]) {
            e.preventDefault();
            const [dx, dy] = dirs[e.key];
            const Lw = Math.min(W, H) * 0.5;
            const cx = W / 2 - (dx * Lw) / 2, cy = H / 2 - (dy * Lw) / 2;
            for (let i = 0; i < 12; i++) {
                setTimeout(() => {
                    if (dead) return;
                    const a = i / 12, b = (i + 1) / 12;
                    const A = { x: cx + dx * Lw * a, y: cy + dy * Lw * a }, B = { x: cx + dx * Lw * b, y: cy + dy * Lw * b };
                    const ga = toGridCss(A.x, A.y), gb = toGridCss(B.x, B.y);
                    segs.push({ ax: ga.x, ay: ga.y, bx: gb.x, by: gb.y, k: 1 });
                    disturb(A.x, A.y, B.x, B.y, Lw / 0.26, 1);
                    wakeUp();
                }, i * 22);
            }
        }
    }

    // Reduced motion: the fish at rest in a quiet arrangement, the water
    // still but for two faint rings caught part way out.
    function still() {
        // heads placed so the five bodies lie apart, two shallow, three deeper
        const layoutR = [
            [0.34, 0.36, 0.2, 0.32, 0.5], [0.60, 0.30, 2.9, -0.28, 0.3], [0.74, 0.64, -2.85, 0.3, 0.6],
            [0.46, 0.74, -0.25, -0.22, 0.42], [0.13, 0.74, -1.5, 0.2, 0.55],
        ];
        // a tall band gets its own arrangement: the bodies lie along it
        const layoutP = [
            [0.42, 0.2, -1.35, 0.25, 0.45], [0.68, 0.8, 1.78, -0.25, 0.32], [0.26, 0.6, -1.9, 0.2, 0.55], [0.75, 0.42, -1.2, -0.2, 0.6],
        ];
        const lay = H > W ? layoutP : layoutR;
        fish.forEach((f, i) => {
            const q = lay[i % lay.length];
            let x = q[0] * W, y = q[1] * H;
            for (let k = 0; k < 40 && shape(x, y) > 0.62; k++) { x += (W / 2 - x) * 0.06; y += (H / 2 - y) * 0.06; }
            f.x = x; f.y = y; f.th = q[2]; f.tt = q[2] - q[3]; f.d = q[4];
            f.A = 0.035; f.ph = i * 1.7; f.v = f.L * 0.2; f.w = 0; f.fin = i;
        });
        crumbs = [];
        h.fill(0); v.fill(0);
        const r = stoneR() * 1.4;
        bump(h, cols * 0.3, rows * 0.36, r, -0.12);
        bump(h, cols * 0.72, rows * 0.7, r * 0.8, -0.08);
        for (let i = 0; i < 70; i++) step(0, 1);
        encode();
        flat = false;
        restFade = 1;
        draw();
    }

    // ── start ─────────────────────────────────────────────────────────
    let io = null, ro = null;
    const load = (src) => new Promise((res, rej) => {
        const im = new Image();
        im.decoding = 'async';
        im.onload = () => res(im);
        im.onerror = rej;
        im.src = src;
    });
    async function start() {
        try {
            const [koi, fin, shadow, floor, padA, padB, pebbles, leaves] = await Promise.all([
                load(ASSET('koi-body.webp')), load(ASSET('koi-fin.webp')), load(ASSET('koi-shadow.webp')), load(cfg.floor),
                // the dressing is optional: a pond without it is still a pond
                ...['lily-pad-a.webp', 'lily-pad-b.webp', 'pebbles.webp', 'leaves.webp'].map((f) => load(ASSET(f)).catch(() => null)),
            ]);
            images = { koi, fin, shadow, floor, padA, padB, pebbles, leaves };
        } catch (e) { return; }
        if (dead) return;
        canvas = document.createElement('canvas');
        canvas.className = 'kp-canvas';
        canvas.setAttribute('aria-hidden', 'true');
        try {
            if (!initGL()) throw new Error('no webgl');
            root.appendChild(canvas);
            layout();
            spawn();
            spawnPads();
        } catch (e) {
            if (canvas) canvas.remove();
            canvas = null; gl = null;
            return;
        }
        lastInput = performance.now();
        on(canvas, 'webglcontextlost', (e) => { e.preventDefault(); cancelAnimationFrame(raf); raf = 0; root.classList.remove('is-live'); });
        on(canvas, 'webglcontextrestored', () => {
            try { if (initGL()) { layout(); calm.matches ? still() : (flatten(), draw()); root.classList.add('is-live'); kick(); } } catch (e) { /* the img stays */ }
        });
        if (calm.matches) still(); else { flatten(); draw(); }
        root.classList.add('is-live');
        if (img) {
            const drag = img.getAttribute('draggable');
            img.draggable = false;
            off.push(() => (drag == null ? img.removeAttribute('draggable') : img.setAttribute('draggable', drag)));
        }
        if (!calm.matches) {
            root.tabIndex = 0;
            root.setAttribute('role', 'button');
            if (!root.hasAttribute('aria-label')) {
                root.setAttribute('aria-label', 'A koi pond. Press Enter to drop a crumb for the fish, arrow keys to stir the water.');
                root.dataset.kpLabel = '1';
            }
            root.dataset.kpAdded = '1';
        }
        on(root, 'pointermove', onPointerMove);
        on(root, 'pointerdown', onPointerDown);
        on(root, 'pointerleave', onPointerLeave);
        on(window, 'pointerup', onPointerUp);
        on(root, 'touchstart', onTouchStart, { passive: true });
        on(window, 'touchmove', onTouchMove, { passive: true });
        on(window, 'touchend', onTouchEnd, { passive: true });
        on(window, 'touchcancel', onTouchEnd, { passive: true });
        on(root, 'keydown', onKey);
        on(document, 'visibilitychange', () => { if (!document.hidden) { last = 0; kick(); } });
        on(calm, 'change', () => { if (gl) { layout(); if (calm.matches) still(); else { flatten(); wakeUp(); } } });

        io = new IntersectionObserver((en) => {
            const was = visible;
            visible = en[0].isIntersecting;
            if (visible && !was) { last = 0; wakeUp(); }
        }, { rootMargin: '40px' });
        io.observe(root);

        let w0 = W, h0 = H;
        ro = new ResizeObserver(() => {
            const r = root.getBoundingClientRect();
            if (Math.abs(r.width - w0) < 1 && Math.abs(r.height - h0) < 1) return;
            clearTimeout(sizeTimer);
            sizeTimer = setTimeout(() => {
                if (dead || !gl) return;
                layout(); w0 = W; h0 = H;
                if (calm.matches) still(); else { flatten(); draw(); kick(); }
            }, 150);
        });
        ro.observe(root);
    }
    start();

    function destroy() {
        dead = true;
        cancelAnimationFrame(raf);
        clearTimeout(sizeTimer);
        off.forEach((f) => f());
        if (io) io.disconnect();
        if (ro) ro.disconnect();
        if (gl) { const x = gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); }
        if (canvas) canvas.remove();
        root.classList.remove('is-live');
        if (root.dataset.kpAdded) {
            root.removeAttribute('tabindex');
            root.removeAttribute('role');
            if (root.dataset.kpLabel) root.removeAttribute('aria-label');
            delete root.dataset.kpAdded;
            delete root.dataset.kpLabel;
        }
    }
    // a read-only peek, for tests and for pages that want to know
    Object.defineProperty(destroy, 'state', { get: () => ({
        running: !!raf, sleeping, rippling: !flat, slope: +maxS.toFixed(3), cells: cols + "x" + rows, resting: restFade < 1, crumbs: crumbs.length, pads: pads.map((q) => ({ x: Math.round(q.x), y: Math.round(q.y), r: Math.round(q.r) })), crumbList: crumbs.map((c) => ({ x: Math.round(c.x), y: Math.round(c.y), age: +c.age.toFixed(1), claim: c.claim ? c.claim.i : null })),
        fish: fish.map((f) => ({ x: Math.round(f.x), y: Math.round(f.y), depth: +f.d.toFixed(2), mode: f.mode, kind: Object.keys(KINDS)[f.kind], held: !!f.held, v: +(f.v / f.L).toFixed(3), L: Math.round(f.L), th: +f.th.toFixed(2), alert: +f.alert.toFixed(1) })), settled: +settledFor.toFixed(1), restFade: +restFade.toFixed(2), ms: +cost.toFixed(2),
    }) });
    return destroy;
}

function autoStart(el) {
    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((en) => {
        if (!en[0].isIntersecting) return;
        io.disconnect();
        el._koiPond = koiPond(el);
    }, { rootMargin: '600px' });
    io.observe(el);
}
document.querySelectorAll('[data-koi-pond]').forEach(autoStart);
