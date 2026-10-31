/* chladni-slider: Chladni's own sand figures, made again as you scroll.
 *
 *   <section data-chladni data-src="assets/tab8.json">
 *     <div class="cl-stage"><img class="cl-img" src="assets/tab8.webp" alt="" aria-hidden="true"></div>
 *   </section>
 *
 * The sheet is Tab. VIII of Ernst Chladni's Entdeckungen über die Theorie des Klanges
 * (Leipzig 1787): twenty square plates, figures 87 to 106, engraved by Capieux in 1786.
 * It starts as the bare toned paper inside its ruled border. Then, figure by figure in
 * Chladni's own numbering, the square of a plate is ruled, sand is sifted over it, and
 * the bow is drawn: the grains hop out of the swinging parts of the plate and gather on
 * the lines that stand still, which are the engraving's own lines. Where the sand has
 * settled the printed line comes up out of it, from the heaviest heap outward, and each
 * grain goes as the ink reaches it. Number and letters last. When the twentieth figure
 * has printed, the title and the engraver's line follow and the sheet is the scan, pixel
 * for pixel. Scroll back and it un-makes.
 *
 * Offline (see README): the scan split, in optical density, into the paper before it was
 * printed and the ink; every ink pixel classed (figure lines, plate square, letters,
 * border, title) with its arrival time; and for each plate a vibration field built from
 * the distance to Chladni's nodal lines, which drives the sand here.
 *
 * Options (data-* or the options object, which wins):
 *   src      the sheet's JSON (required); <name>.webp, -paper.webp, -times.webp, -sand.webp beside it
 *   runway   section height in svh (default 300)
 *   grains   multiplier on sand density (default 1)
 *
 * Events (bubbling): 'chladni:bow' {fig} as the bow starts on a plate, 'chladni:figure'
 * {fig} when its line has printed, 'chladni:done' at the end (forward scrolling only).
 */

const calm = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

/* ── timing, as shares of the runway ─────────────────────────────────────────
 * border 0-.035; every figure runs the same schedule at once (FIG0 plus a small ripple
 * across the sheet, under 3.5% of the runway), for FIG_LEN; inside a figure:
 * the square is ruled, sand sifted on, the bow drawn, the line printed, the letters cut. */
const BORDER = [0.004, 0.034];
const FIG0 = 0.04, RIPPLE = 0.032, FIG_LEN = 0.895 - FIG0 - RIPPLE;   // all twenty together
const LOC = { rule: [0, 0.11], sift: [0.07, 0.23], bow: [0.21, 0.62], ink: [0.57, 0.9], label: [0.84, 1] };
const TITLE = [0.9, 0.95];

function loadImage(url) {
    return new Promise((res, rej) => {
        const im = new Image();
        im.decoding = 'async';
        im.onload = () => res(im);
        im.onerror = () => rej(new Error('chladni: could not load ' + url));
        im.src = url;
    });
}
function loadExact(url) {
    return fetch(url).then((r) => { if (!r.ok) throw new Error('chladni: could not load ' + url); return r.blob(); })
        .then((b) => createImageBitmap(b, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }));
}
function rng(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
// a stateless hash in 0..1, for the hops of a grain at a moment
const hash = (a, b) => {
    let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca77);
    h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
};

/* ── shaders ─────────────────────────────────────────────────────────────── */
const SHEET_VS = `#version 300 es
uniform vec2 uStage;
out vec2 vQ;
void main() {
    vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
    vQ = vec2(p.x, 1.0 - p.y) * uStage;
    gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

// The sheet. Every pixel is the paper before printing (P) with as much of the ink as has
// arrived there: in linear light, colour = P * (O / P)^a. Where a = 1 everywhere, the
// result is the scan itself. The class and arrival time of each ink pixel come from the
// times map (R: time inside its stage, G: class), read exactly with texelFetch.
const SHEET_FS = `#version 300 es
precision highp float;
precision highp int;
in vec2 vQ;
out vec4 frag;
uniform sampler2D uO, uP, uT;
uniform vec2 uStage;
uniform vec4 uView;          // the sheet's rectangle in the stage, css px
uniform vec3 uPage;          // the page colour around the sheet (sRGB)
uniform vec4 uFig[20];       // per figure: square, line, letters (stage-local progress)
uniform vec2 uGlob;          // border, title + engraver
uniform float uPx;           // css px per sheet pixel
vec3 lin(vec3 c) { return pow(max(c, vec3(1e-5)), vec3(2.2)); }
float arrive(float t, float p, float w) { return smoothstep(t, t + w, p * (1.0 + w)); }
void main() {
    vec2 uv = (vQ - uView.xy) / uView.zw;
    vec2 d2 = max(max(uView.xy - vQ, vQ - uView.xy - uView.zw), 0.0);
    if (d2.x > 0.0 || d2.y > 0.0) {
        // the page, with the sheet's tight shadow (it lies a fraction of a millimetre above)
        vec2 ds = max(max(uView.xy + vec2(0.0, 1.5) - vQ, vQ - uView.xy - uView.zw - vec2(0.0, 1.5)), 0.0);
        float d = length(ds);
        float sh = 0.10 * exp(-d / 1.6) + 0.07 * exp(-d / 7.0);
        frag = vec4(uPage * (1.0 - sh), 1.0);
        return;
    }
    vec3 O = lin(texture(uO, uv).rgb);
    vec3 P = lin(texture(uP, uv).rgb);
    ivec2 ts = textureSize(uT, 0);
    vec4 t = texelFetch(uT, clamp(ivec2(uv * vec2(ts)), ivec2(0), ts - 1), 0);
    int c = int(t.g * 255.0 + 0.5);
    float tt = t.r * (255.0 / 254.0);
    float a = 1.0;
    if (c >= 1 && c <= 20) a = arrive(tt, uFig[c - 1].y, 0.035);
    else if (c >= 21 && c <= 40) a = arrive(tt, uFig[c - 21].x, 0.03);
    else if (c >= 41 && c <= 60) a = arrive(tt, uFig[c - 41].z, 0.08);
    else if (c == 61) a = arrive(tt, uGlob.x, 0.02);
    else if (c == 62) a = arrive(tt, uGlob.y, 0.08);
    vec3 col = P * pow(O / P, vec3(a));
    frag = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
}`;

// Sand. Each grain is a point sprite: x, y on the sheet (0..1), its height above the paper
// in grain diameters (a grain in mid-hop throws its shadow further off), a seed, and its
// size (it goes to nothing as the ink reaches it).
const GRAIN_COMMON = `#version 300 es
precision highp float;
uniform vec2 uStage;
uniform vec4 uView;
uniform float uD;            // grain diameter, device px
uniform float uDpr;
float hash(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
const vec2 LAMP = vec2(-0.62, -0.78);   // toward the window, upper left
vec4 clip(vec2 uv, vec2 offPx) {
    vec2 q = uView.xy + uv * uView.zw + offPx / uDpr;
    return vec4(q.x / uStage.x * 2.0 - 1.0, 1.0 - q.y / uStage.y * 2.0, 0.0, 1.0);
}`;
const SHADOW_VS = GRAIN_COMMON + `
layout(location = 0) in vec4 aG;
layout(location = 1) in float aK;
out float vA; out float vR;
void main() {
    float r = uD * 0.5 * aK * (0.86 + 0.28 * hash(aG.w));
    vec2 off = -LAMP * uD * (0.45 + aG.z * 0.9);         // a low lamp: the shadow lengthens with height
    vR = r; vA = aK * (0.62 - 0.32 * clamp(aG.z / 4.0, 0.0, 1.0));
    gl_PointSize = aK > 0.02 ? 2.0 * r + 2.0 : 0.0;
    gl_Position = clip(aG.xy, off);
}`;
const SHADOW_FS = `#version 300 es
precision highp float;
in float vA; in float vR;
out vec4 o;
void main() {
    float d = length(gl_PointCoord - 0.5) * (2.0 * vR + 2.0);
    float a = (1.0 - smoothstep(vR - 0.7, vR + 0.7, d)) * vA;
    if (a < 0.004) discard;
    o = vec4(0.0, 0.0, 0.0, a);     // multiplied into the paper: dst * (1 - a)
}`;
const GRAIN_VS = GRAIN_COMMON + `
layout(location = 0) in vec4 aG;
layout(location = 1) in float aK;
out vec3 vAlb; out float vR; out float vS; out float vRot;
void main() {
    float s1 = hash(aG.w), s2 = hash(aG.w + 7.13), s3 = hash(aG.w + 3.71), s4 = hash(aG.w + 1.37);
    // washed river sand: warm quartz, some iron-stained, a few pale, the odd dark mineral
    vec3 alb = mix(vec3(0.72, 0.60, 0.43), vec3(0.55, 0.42, 0.28), smoothstep(0.3, 1.0, s1));
    alb = mix(alb, vec3(0.86, 0.80, 0.68), step(0.95, s2));
    alb = mix(alb, vec3(0.22, 0.19, 0.17), step(0.90, s3));
    vAlb = alb * (0.86 + 0.24 * s4);
    float r = uD * 0.5 * aK * (0.86 + 0.28 * s2) * (1.0 + 0.06 * aG.z);
    vR = r; vS = aG.w; vRot = s4 * 6.2831;
    gl_PointSize = aK > 0.02 ? 2.0 * r + 2.0 : 0.0;
    gl_Position = clip(aG.xy, vec2(0.0, -aG.z * uD * 0.35));
}`;
const GRAIN_FS = `#version 300 es
precision highp float;
in vec3 vAlb; in float vR; in float vS; in float vRot;
out vec4 o;
const vec2 LAMP = vec2(-0.62, -0.78);
void main() {
    vec2 p = (gl_PointCoord - 0.5) * (2.0 * vR + 2.0);
    float c = cos(vRot), s = sin(vRot);
    vec2 q = vec2(c * p.x + s * p.y, -s * p.x + c * p.y) * vec2(1.0, 1.18);
    float r = length(q) / max(vR, 0.5);
    float cov = clamp((1.0 - r) * vR + 0.5, 0.0, 1.0);
    if (cov <= 0.0) discard;
    vec2 u = p / max(vR, 0.5);
    vec3 n = normalize(vec3(u, sqrt(max(0.05, 1.0 - dot(u, u)))));
    vec3 L = normalize(vec3(LAMP, 0.55));
    float diff = max((dot(n, L) + 0.35) / 1.35, 0.0);    // quartz is translucent: wrapped light
    vec3 col = vAlb * (0.36 + 0.80 * diff);
    o = vec4(min(col, vec3(1.0)) * cov, cov);
}`;

function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    return sh;
}
function program(gl, vs, fs, names) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    for (const n of names) u[n] = gl.getUniformLocation(p, n);
    return { p, u };
}

/* ── the sand on one plate ───────────────────────────────────────────────────
 * The field A (0 on Chladni's nodal lines, 1 where the plate swings most, built offline
 * from the distance to his lines and to the ridges between them) stands in for the
 * plate's amplitude. A grain hops only where the plate's acceleration beats gravity
 * (A above a threshold), its hop growing with A; a grain landing on a plate that is
 * tilted as it swings is kicked down the amplitude slope a little more often than up it.
 * Nothing places a grain on a line: they random-walk there and stall. The walk runs once,
 * from a fixed seed, and is kept as snapshots, so scroll can play it both ways. */
const SIM_STEPS = 240, SNAP_EVERY = 10, SNAPS = SIM_STEPS / SNAP_EVERY + 1;
const THR = 0.075, K0 = 0.021, DRIFT = 0.16;

function simulatePlate(field, FG, N, seed, heaps = []) {
    const rnd = rng(seed * 7919 + 13);
    const X = new Float32Array(N), Y = new Float32Array(N);
    for (let i = 0; i < N; i++) { X[i] = 0.004 + rnd() * 0.992; Y[i] = 0.004 + rnd() * 0.992; }
    const snaps = new Uint16Array(SNAPS * N * 2);
    const put = (k) => { const o = k * N * 2; for (let i = 0; i < N; i++) { snaps[o + 2 * i] = X[i] * 65535; snaps[o + 2 * i + 1] = Y[i] * 65535; } };
    put(0);
    const g1 = FG - 1;
    let rs = (seed * 2654435761) >>> 0 || 1;
    const R = () => { rs ^= rs << 13; rs >>>= 0; rs ^= rs >>> 17; rs ^= rs << 5; rs >>>= 0; return rs / 4294967296; };
    for (let st = 1; st <= SIM_STEPS; st++) {
        const env = Math.min(1, st / 12);                      // the bow takes a moment to bite
        for (let i = 0; i < N; i++) {
            let x = X[i], y = Y[i];
            const gx = x * g1, gy = y * g1;
            let ix = gx | 0, iy = gy | 0;
            if (ix >= g1) ix = g1 - 1; if (iy >= g1) iy = g1 - 1;
            const fx = gx - ix, fy = gy - iy, k = iy * FG + ix;
            const a00 = field[k], a10 = field[k + 1], a01 = field[k + FG], a11 = field[k + FG + 1];
            const a = (a00 * (1 - fx) * (1 - fy) + a10 * fx * (1 - fy) + a01 * (1 - fx) * fy + a11 * fx * fy) * env;
            if (a <= THR) {
                // on a line the plate still trembles a little: grains creep along it toward the
                // stillest point, where lines cross, and pile there (the heaps Chladni drew)
                for (const h of heaps) {
                    const dx = h.x - x, dy = h.y - y, d = Math.hypot(dx, dy) || 1e-4;
                    if (d < h.r && R() < 0.35) {
                        if (d > h.w * 0.9) {
                            const c = 0.0016 * env * Math.sqrt(1 - d / h.r) * (0.5 + R()) / d;
                            X[i] = x + dx * c + (R() - 0.5) * 0.001; Y[i] = y + dy * c + (R() - 0.5) * 0.001;
                        } else {
                            // in the heap: grains roll over each other and the mound spreads to its foot
                            X[i] = x + (R() - 0.5) * h.w * 0.25; Y[i] = y + (R() - 0.5) * h.w * 0.25;
                        }
                        break;
                    }
                }
                continue;                                       // under about one g the grain stays put
            }
            const s = K0 * a + 0.0016 * env;
            let ax = (a10 - a00) * (1 - fy) + (a11 - a01) * fy, ay = (a01 - a00) * (1 - fx) + (a11 - a10) * fx;
            const al = Math.hypot(ax, ay) || 1;
            ax *= DRIFT / al; ay *= DRIFT / al;
            x += s * ((R() + R() - 1) * 1.7 - ax);
            y += s * ((R() + R() - 1) * 1.7 - ay);
            if (x < 0.002) x = 0.004 - x; else if (x > 0.998) x = 1.996 - x;   // the free edge throws them back
            if (y < 0.002) y = 0.004 - y; else if (y > 0.998) y = 1.996 - y;
            X[i] = x; Y[i] = y;
        }
        if (st % SNAP_EVERY === 0) put(st / SNAP_EVERY);
    }
    return snaps;
}

/* ── the component ───────────────────────────────────────────────────────── */
export function chladniSlider(root, opts = {}) {
    const ds = root.dataset;
    const o = {
        src: opts.src ?? ds.src,
        runway: +(opts.runway ?? ds.runway ?? 300),
        grains: +(opts.grains ?? ds.grains ?? 1),
    };
    if (!o.src || root.__chladni) return () => {};
    root.__chladni = true;
    const base = o.src.replace(/\.json$/, '');
    const stage = root.querySelector('.cl-stage') || root;
    let dead = false, cleanup = [];
    const on = (t, ev, fn, opt) => { t.addEventListener(ev, fn, opt); cleanup.push(() => t.removeEventListener(ev, fn, opt)); };
    root.classList.add('cl');
    if (calm.matches) root.classList.add('cl-still');

    const canvas = document.createElement('canvas');
    canvas.className = 'cl-canvas';
    canvas.setAttribute('aria-hidden', 'true');

    let meta = null, ims = {}, gl = null, P = {}, tex = {}, vao = null, vbo = null, vaoFull = null;
    let figs = [], FG = 128, fieldA = [], fieldT = [];
    let dpr = 1, texW = 0;
    let target = 0, shown = 0, vel = 0, visible = false, raf = 0, last = 0, lastShown = -1;
    const fired = new Set();

    /* figure stage helpers */
    // a faint ripple from the top left across the sheet, so it is organic, never one by one
    const figStart = (i) => FIG0 + RIPPLE * ((Math.floor(i / 4) + (i % 4)) / 7 * 0.8 + hash(i, 87) * 0.2);
    const figU = (i, S) => (S - figStart(i)) / FIG_LEN;
    const part = (u, k) => (u - LOC[k][0]) / (LOC[k][1] - LOC[k][0]);

    /* ── the whole sheet, always in view, lying in the page ── */
    let fit = { x: 0, y: 0, w: 0, h: 0 }, stg = { w: 0, h: 0 }, grainD = 2, grainN = 0;
    function layout() {
        const r = stage.getBoundingClientRect();
        const cs = getComputedStyle(stage);
        const pl = parseFloat(cs.paddingLeft), pr = parseFloat(cs.paddingRight), pt = parseFloat(cs.paddingTop), pb = parseFloat(cs.paddingBottom);
        stg = { w: Math.max(120, Math.round(r.width)), h: Math.max(120, Math.round(innerHeight)) };
        const availW = Math.max(100, stg.w - pl - pr), availH = Math.max(100, stg.h - pt - pb);
        const scale = Math.min(availW / meta.W, availH / meta.H, 1);
        fit = { w: meta.W * scale, h: meta.H * scale };
        fit.x = pl + (availW - fit.w) / 2; fit.y = pt + (availH - fit.h) / 2;
        dpr = Math.min(2, devicePixelRatio || 1);
        canvas.style.width = stg.w + 'px'; canvas.style.height = stg.h + 'px';
        canvas.width = Math.round(stg.w * dpr); canvas.height = Math.round(stg.h * dpr);
        gl.viewport(0, 0, canvas.width, canvas.height);
        const wantTex = Math.min(meta.W, Math.round(fit.w * dpr * 1.02));
        if (Math.abs(wantTex - texW) > 2) pack(wantTex, Math.round(wantTex * meta.H / meta.W));
        // sand at the size it is seen: a grain never under 1.7 device px, and enough grains that
        // a freshly sifted plate is about a fifth covered
        const boxDev = fit.w * figs[0].s * dpr;
        grainD = Math.max(1.7, 3.3 * fit.w * dpr / meta.W);
        const n = Math.round(clamp(o.grains * (0.2 * boxDev * boxDev) / (0.785 * grainD * grainD), 500, 9000));
        if (!grainN || Math.abs(n - grainN) / grainN > 0.15) { grainN = n; sims.length = 0; warm(0); }
    }
    const viewAt = () => [fit.x, fit.y, fit.w, fit.h];

    /* ── textures ── */
    function setTex(img, mip) {
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        if (mip) gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, mip ? gl.LINEAR : gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    // the scan and the paper go up at the size they are shown at, closest (good downsampling,
    // so the engraved line never aliases), mipmapped
    function pack(w, h) {
        texW = w;
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        const cx = cv.getContext('2d');
        for (const k of ['orig', 'paper']) {
            cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
            cx.drawImage(ims[k], 0, 0, w, h);
            if (!tex[k]) tex[k] = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, tex[k]);
            setTex(w === meta.W ? ims[k] : cv, true);
        }
        cv.width = cv.height = 0;
        if (!tex.times) { tex.times = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex.times); setTex(ims.times, false); }
    }

    function initGL() {
        const g = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, preserveDrawingBuffer: false });
        if (!g) return false;
        gl = g;
        try {
            P.sheet = program(gl, SHEET_VS, SHEET_FS, ['uO', 'uP', 'uT', 'uStage', 'uView', 'uPage', 'uFig', 'uGlob', 'uPx']);
            P.shadow = program(gl, SHADOW_VS, SHADOW_FS, ['uStage', 'uView', 'uD', 'uDpr']);
            P.grain = program(gl, GRAIN_VS, GRAIN_FS, ['uStage', 'uView', 'uD', 'uDpr']);
        } catch (err) { console.warn('chladni: shader failed', err); gl = null; return false; }
        gl.useProgram(P.sheet.p);
        gl.uniform1i(P.sheet.u.uO, 0); gl.uniform1i(P.sheet.u.uP, 1); gl.uniform1i(P.sheet.u.uT, 2);
        vaoFull = gl.createVertexArray();
        vao = gl.createVertexArray(); vbo = gl.createBuffer();
        gl.bindVertexArray(vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 20, 0);
        gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 20, 16);
        gl.bindVertexArray(null);
        tex = {}; texW = 0;
        return true;
    }

    let pageRGB = null;
    function pageColour() {
        if (pageRGB) return pageRGB;
        const m = getComputedStyle(root).backgroundColor.match(/[\d.]+/g) || [243, 240, 232];
        pageRGB = m.slice(0, 3).map((v) => +v / 255);
        return pageRGB;
    }

    /* ── sand, plate by plate ── */
    const sims = [];          // per figure: { N, snaps, seeds, drop, tn }
    function plate(i) {
        if (sims[i]) return sims[i];
        const f = figs[i];
        const N = Math.round(clamp(grainN * Math.sqrt(f.ink / 20000), grainN * 0.7, grainN * 1.35));
        const snaps = simulatePlate(fieldA[i], FG, N, i + 87, f.heaps || []);
        const r = rng(i * 104729 + 5);
        const drop = new Float32Array(N), tn = new Float32Array(N), rest = new Float32Array(N);
        const last0 = (SNAPS - 1) * N * 2;
        for (let k = 0; k < N; k++) {
            const x0 = snaps[2 * k] / 65535, y0 = snaps[2 * k + 1] / 65535;
            // sifted from a hand moving across the plate, left to right, a little ragged
            drop[k] = clamp(0.08 + 0.7 * x0 + 0.12 * (y0 - 0.5) * 0.4 + (r() - 0.5) * 0.22, 0, 1);
            const x = snaps[last0 + 2 * k] / 65535, y = snaps[last0 + 2 * k + 1] / 65535;
            const gx = Math.min(FG - 1, (x * FG) | 0), gy = Math.min(FG - 1, (y * FG) | 0);
            const a = fieldA[i][gy * FG + gx];
            // a grain left out in the field is not on a line: it is brushed off early in the printing
            tn[k] = a > THR * 1.6 ? 0.15 + r() * 0.25 : fieldT[i][gy * FG + gx];
            rest[k] = a;
        }
        sims[i] = { N, snaps, drop, tn, rest };
        return sims[i];
    }
    // warm the next plates while the browser is idle, so a plate never stalls the scroll
    let idleId = 0;
    const ric = window.requestIdleCallback || ((fn) => setTimeout(() => fn({ timeRemaining: () => 8 }), 60));
    const cic = window.cancelIdleCallback || clearTimeout;
    function warm(from) {
        cic(idleId);
        idleId = ric(() => {
            for (let i = 0; i < figs.length; i++) if (!sims[i]) { plate(i); warm(); return; }
        });
    }

    let verts = new Float32Array(0);
    function grains(S) {
        let n = 0, need = 0;
        const act = [];
        figs.forEach((f, i) => {
            const u = figU(i, S);
            if (u < LOC.sift[0] || u > LOC.ink[1] + 0.02) return;
            act.push(i); need += plate(i).N;
        });
        if (verts.length < need * 5) verts = new Float32Array(need * 5);
        for (const i of act) {
            const f = figs[i], sm = sims[i], N = sm.N, u = figU(i, S);
            const sift = part(u, 'sift'), bow = clamp(part(u, 'bow')), ink = part(u, 'ink');
            // the sand settles fast at first and slowly at the end, as a note rings in
            const tau = (1 - Math.pow(1 - bow, 1.7)) * (SNAPS - 1);
            const j0 = Math.min(SNAPS - 2, Math.floor(tau)), ft = tau - j0;
            const o0 = j0 * N * 2, o1 = o0 + N * 2;
            const ringing = bow > 0 && bow < 1 ? smooth(0, 0.05, bow) * (1 - smooth(0.82, 1, bow)) : 0;
            const tick = Math.floor(tau * 3.0);
            for (let k = 0; k < N; k++) {
                // falling from the sieve: visible once it lands
                const land = sift - sm.drop[k];
                if (land < 0) continue;
                const g = smooth(sm.tn[k] - 0.015, sm.tn[k] + 0.05, ink);   // the ink reaches it
                if (g >= 1) continue;
                let x = lerp(sm.snaps[o0 + 2 * k], sm.snaps[o1 + 2 * k], ft) / 65535;
                let y = lerp(sm.snaps[o0 + 2 * k + 1], sm.snaps[o1 + 2 * k + 1], ft) / 65535;
                let z = Math.max(0, 1 - land / 0.06) * 3.5;                  // still dropping
                for (const h of f.heaps) {                                    // up on a heap
                    const d = Math.hypot(x - h.x, y - h.y);
                    if (d < h.w) z += (1 - d / h.w) * 2.2 * bow * ((k % 7) / 6);
                }
                if (ringing > 0) {
                    // in mid-hop: lifted, a little off its averaged path
                    const gx = Math.min(FG - 1, (x * FG) | 0), gy = Math.min(FG - 1, (y * FG) | 0);
                    const a = fieldA[i][gy * FG + gx] * ringing;
                    if (a > THR) {
                        const h1 = hash(k + i * 131071, tick), h2 = hash(k * 7 + 3, tick + 911), h3 = hash(k * 13 + 1, tick * 3 + 5);
                        const hop = K0 * a * 0.5;
                        x += (h1 - 0.5) * hop; y += (h2 - 0.5) * hop;
                        z += 4.5 * a * Math.sin(Math.PI * h3);
                    }
                }
                const vi = n * 5;
                verts[vi] = f.x + x * f.s;
                verts[vi + 1] = f.y + y * f.sy;
                verts[vi + 2] = z;
                verts[vi + 3] = (k % 9973) + i * 0.37 + 0.5;
                verts[vi + 4] = 1 - g;
                n++;
            }
        }
        return n;
    }

    /* ── drawing ── */
    const figU4 = new Float32Array(80);
    function draw() {
        const S = shown;
        const view = viewAt(S);
        // stage-local progress for every figure's square, line and letters
        figs.forEach((f, i) => {
            const u = figU(i, S);
            figU4[i * 4] = clamp(part(u, 'rule'), -1, 2);
            figU4[i * 4 + 1] = clamp(part(u, 'ink'), -1, 2);
            figU4[i * 4 + 2] = clamp(part(u, 'label'), -1, 2);
            figU4[i * 4 + 3] = 0;
        });
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.disable(gl.BLEND);
        gl.useProgram(P.sheet.p);
        const U = P.sheet.u;
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex.orig);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tex.paper);
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, tex.times);
        gl.uniform2f(U.uStage, stg.w, stg.h);
        gl.uniform4f(U.uView, ...view);
        gl.uniform3fv(U.uPage, pageColour());
        gl.uniform4fv(U.uFig, figU4);
        gl.uniform2f(U.uGlob, clamp((S - BORDER[0]) / (BORDER[1] - BORDER[0]), -1, 2), clamp((S - TITLE[0]) / (TITLE[1] - TITLE[0]), -1, 2));
        gl.uniform1f(U.uPx, view[2] / meta.W);
        gl.bindVertexArray(vaoFull);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        const n = grains(S);
        if (n) {
            const D = grainD;
            gl.bindVertexArray(vao);
            gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
            gl.bufferData(gl.ARRAY_BUFFER, verts.subarray(0, n * 5), gl.DYNAMIC_DRAW);
            gl.enable(gl.BLEND);
            for (const k of ['shadow', 'grain']) {
                const p = P[k];
                gl.useProgram(p.p);
                gl.uniform2f(p.u.uStage, stg.w, stg.h);
                gl.uniform4f(p.u.uView, ...view);
                gl.uniform1f(p.u.uD, D);
                gl.uniform1f(p.u.uDpr, dpr);
                if (k === 'shadow') gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
                else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
                gl.drawArrays(gl.POINTS, 0, n);
            }
            gl.bindVertexArray(null);
        }
        events(S);
    }

    function events(S) {
        const fire = (name, detail) => root.dispatchEvent(new CustomEvent(name, { bubbles: true, detail }));
        if (S > lastShown) {
            figs.forEach((f, i) => {
                const u = figU(i, S);
                if (u >= LOC.bow[0] && !fired.has('b' + i)) { fired.add('b' + i); if (lastShown >= 0) fire('chladni:bow', { fig: f.fig }); }
                if (u >= LOC.ink[1] && !fired.has('f' + i)) { fired.add('f' + i); if (lastShown >= 0) fire('chladni:figure', { fig: f.fig }); }
            });
            if (S >= TITLE[1] && !fired.has('done')) { fired.add('done'); if (lastShown >= 0) fire('chladni:done'); }
        } else {
            figs.forEach((f, i) => { const u = figU(i, S); if (u < LOC.bow[0]) fired.delete('b' + i); if (u < LOC.ink[1]) fired.delete('f' + i); });
            if (S < TITLE[1]) fired.delete('done');
        }
        lastShown = S;
    }

    /* ── scroll is time ── */
    function frame(now) {
        raf = 0;
        const dt = Math.min(0.1, (now - (last || now)) / 1000); last = now;
        // a critically damped spring toward the scroll position, then the loop stops
        const w = target < shown ? 14 : 9, x0 = shown - target, c2 = vel + w * x0, e = Math.exp(-w * dt);
        shown = target + (x0 + c2 * dt) * e;
        vel = (c2 - w * (x0 + c2 * dt)) * e;
        if (Math.abs(target - shown) < 2e-5 && Math.abs(vel) < 2e-5) { shown = target; vel = 0; }
        draw();
        if (shown !== target && visible && !document.hidden) kick(); else last = 0;
    }
    function kick() { if (!raf && !dead) raf = requestAnimationFrame(frame); }
    function readScroll() {
        const r = root.getBoundingClientRect();
        const run = r.height - innerHeight;
        target = run > 0 ? clamp(-r.top / run) : 1;
    }

    let live = false;
    async function start() {
        if (calm.matches) return;                         // the finished sheet, as an image
        try {
            meta = await (await fetch(o.src)).json();
            const [orig, paper, times, sand] = await Promise.all([
                loadImage(base + '.webp'), loadImage(base + '-paper.webp'),
                loadExact(base + '-times.webp'), loadExact(base + '-sand.webp')]);
            ims = { orig, paper, times, sand };
        } catch (err) { console.warn(err); return; }
        if (dead || calm.matches) return;
        // the sand fields: 5 tiles across, R = amplitude, G = when the nearest line prints
        FG = meta.field;
        const cv = document.createElement('canvas'); cv.width = ims.sand.width; cv.height = ims.sand.height;
        const cx = cv.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' });
        cx.drawImage(ims.sand, 0, 0);
        const px = cx.getImageData(0, 0, cv.width, cv.height).data;
        cv.width = cv.height = 0;
        figs = meta.figs.map((f, i) => {
            const tx = (i % 5) * FG, ty = Math.floor(i / 5) * FG;
            const A = new Float32Array(FG * FG), T = new Float32Array(FG * FG);
            for (let y = 0; y < FG; y++) for (let x = 0; x < FG; x++) {
                const q = ((ty + y) * ims.sand.width + tx + x) * 4;
                A[y * FG + x] = px[q] / 255; T[y * FG + x] = px[q + 1] / 254;
            }
            fieldA[i] = A; fieldT[i] = T;
            return { ...f, cx: f.bx + f.bw / 2, cy: f.by + f.bh / 2 };
        });
        ims.sand.close?.();
        root.classList.add('cl-scroll');
        root.style.setProperty('--cl-runway', o.runway + 'svh');
        stage.appendChild(canvas);
        if (!initGL()) { canvas.remove(); root.classList.remove('cl-scroll'); root.style.removeProperty('--cl-runway'); return; }
        layout();
        root.classList.add('is-live'); live = true;
        readScroll(); shown = target;
        warm();
        draw();

        const io = new IntersectionObserver((en) => {
            visible = en[0].isIntersecting;
            if (visible) { readScroll(); kick(); }
        }, { rootMargin: '10% 0px' });
        io.observe(root); cleanup.push(() => io.disconnect());
                on(window, 'scroll', () => {
            if (!visible) return;
            readScroll(); kick();
        }, { passive: true });
        let rt = 0;
        const ro = new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(() => { if (dead || !gl) return; layout(); readScroll(); shown = target; draw(); }, 80); });
        ro.observe(stage); cleanup.push(() => { ro.disconnect(); clearTimeout(rt); cic(idleId); });
        on(document, 'visibilitychange', () => { if (!document.hidden) kick(); });
        on(canvas, 'webglcontextlost', (e) => { e.preventDefault(); root.classList.remove('is-live'); });
        on(canvas, 'webglcontextrestored', () => { if (initGL()) { layout(); root.classList.add('is-live'); draw(); } });
    }
    // reduced motion switched on mid-visit: settle on the sheet as printed
    on(calm, 'change', () => {
        if (calm.matches) { root.classList.add('cl-still'); root.classList.remove('cl-scroll', 'is-live'); root.style.removeProperty('--cl-runway'); }
        else if (live) { root.classList.remove('cl-still'); root.classList.add('cl-scroll', 'is-live'); root.style.setProperty('--cl-runway', o.runway + 'svh'); pageRGB = null; layout(); readScroll(); shown = target; draw(); }
        else { root.classList.remove('cl-still'); start(); }
    });
    start();

    function destroy() {
        dead = true;
        cancelAnimationFrame(raf);
        cleanup.forEach((f) => f()); cleanup = [];
        if (gl) {
            Object.values(tex).forEach((t) => gl.deleteTexture(t));
            if (vbo) gl.deleteBuffer(vbo);
            Object.values(P).forEach((p) => gl.deleteProgram(p.p));
            gl.getExtension('WEBGL_lose_context')?.loseContext();
        }
        ims.times?.close?.();
        canvas.remove();
        root.classList.remove('cl', 'is-live', 'cl-scroll', 'cl-still');
        root.style.removeProperty('--cl-runway');
        delete root.__chladni;
    }
    // for tests and figure sheets: show a given moment at once (0..1), without the spring
    destroy.seek = (S) => { if (!gl) return false; target = shown = clamp(S); vel = 0; draw(); return true; };
    Object.defineProperty(destroy, 'progress', { get: () => shown });
    Object.defineProperty(destroy, 'running', { get: () => raf !== 0 });
    Object.defineProperty(destroy, 'ready', { get: () => live });
    return destroy;
}

export const chladni = chladniSlider;

/* auto-start */
function boot() {
    document.querySelectorAll('[data-chladni], [data-chladni-slider]').forEach((el) => {
        if (!el.__chladniApi) el.__chladniApi = chladniSlider(el);
    });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
