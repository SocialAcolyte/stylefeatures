/* ─── shadow-puppet // wayang kulit on a lit cotton screen ───────────────
 *
 *  A carved and punched buffalo-hide puppet held between an oil lamp (the
 *  blencong) and a stretched cotton screen (the kelir). The page shows the
 *  audience's side: the warm cloth lit from behind, and on it the puppet's
 *  shadow, a lace of light through every punched hole.
 *
 *    <figure class="sp" data-shadow-puppet data-src="assets/figure.webp" data-scroll="#scene">
 *      <img class="sp-still" src="assets/figure.webp" alt="" aria-hidden="true">
 *    </figure>
 *
 *  Or call  shadowPuppet(el, opts)  yourself. It returns destroy(), with
 *  destroy.set(opts) and destroy.state.
 *
 *  Physics. The lamp is a small flame at distance D behind the screen; the
 *  puppet is flat and parallel to the screen at distance d in front of the
 *  lamp's side of it. A puppet point P lands on the screen at
 *      s = L + (P - L) · M,   M = D / (D - d)        (magnification)
 *  where L is the foot of the lamp on the screen. A flame of width F blurs
 *  every edge by the penumbra  w = F · d / (D - d). The flame is taller than
 *  it is wide, so the blur is too (vertical edges stay sharper). When the
 *  flame sways by δ, the shadow moves by δ · (1 - M): nothing at the screen,
 *  a tremble when the puppet is drawn back.
 *
 *  Drawing. The puppet's alpha (holes and all) is blurred once by discs of
 *  growing radius into a stack of eight levels packed into two RGBA textures;
 *  each frame every pixel maps back through the projection to the puppet and
 *  reads the level its penumbra needs. The cloth (weave, slubs, seams, the
 *  dyed border bands, the banana trunk's shadow along the foot) and the lamp's
 *  cos³ fall-off are in the same shader. The hide is translucent: a little of
 *  the painted colour glows inside the shadow.
 *
 *  Motion. The flame flickers (noise in four octaves, and now and then a
 *  draught that lays it over). Scroll draws the puppet from the lamp to the
 *  screen. Drag moves it (the shadow follows the finger); it hangs on a horn
 *  rod held from below, so it leans behind a quick move and settles back with
 *  a small pendulum lag. Arrow keys move it too.
 *
 *  Reduced motion: a still frame, the puppet at the screen, crisp, the flame
 *  at rest; dragging still works.
 */

const FPS = 30;
const LEVELS = [0, 1, 2, 4, 8, 16, 32, 64];      // blur stack radii, texels (x; y is ×ASPECT)
const ASPECT = 1.55;                              // the flame's height over its width
const LAMP_RGB = [1.0, 0.53, 0.2];               // a coconut-oil flame, about 1900 K

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
function hash(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
function noise(x) {               // smooth 1D value noise in [-1, 1]
    const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
    return (hash(i) * (1 - u) + hash(i + 1) * u) * 2 - 1;
}

// ── shaders ───────────────────────────────────────────────────────────

const VS = `
attribute vec2 p;
varying vec2 vUv;
void main() { vUv = p * .5 + .5; gl_Position = vec4(p, 0., 1.); }`;

const COPY_FS = `
precision mediump float;
uniform sampler2D uSrc;
varying vec2 vUv;
void main() { gl_FragColor = vec4(texture2D(uSrc, vUv).a); }`;

// a disc (an ellipse, the flame's shape) of radius uR, 64 taps on a Vogel spiral
const BLUR_FS = `
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uR;
varying vec2 vUv;
void main() {
    float s = 0.;
    for (int i = 0; i < 64; i++) {
        float fi = float(i) + .5;
        float rr = sqrt(fi / 64.), an = fi * 2.3999632;
        s += texture2D(uSrc, vUv + uR * rr * vec2(cos(an), sin(an))).a;
    }
    gl_FragColor = vec4(s / 64.);
}`;

const MAIN_FS = `
precision highp float;
uniform vec2 uDev;         // canvas size, device px
uniform float uDpr;
uniform vec2 uSize;        // screen size, css px
uniform sampler2D uA, uB, uCol;
uniform vec4 uLR, uLR2;    // stack radii
uniform vec2 uLamp;        // foot of the flame on the screen, css px
uniform float uM;          // magnification
uniform vec2 uGrip;        // the hand on the rod, puppet plane, css px
uniform vec2 uGuv;         // the rod's end in the texture
uniform vec2 uPsz;         // puppet texture size at the screen, css px
uniform float uRot;        // lean about the grip
uniform float uR;          // penumbra, texels (horizontal)
uniform float uBias;       // mip bias for the paint's glow
uniform float uBloom;      // bloom radius, texels
uniform vec4 uLight;       // brightness, lamp distance (px), hot-spot radius (px), hot-spot strength
uniform float uHideT;      // how much light the hide lets through
uniform vec4 uCloth;       // two seams (x as fractions), top band, bottom band (fractions of height)
uniform float uTrunk;      // banana trunk's shadow along the foot (fraction of height)
uniform float uSeed;
uniform vec3 uLampRGB;

float h1(float n) { return fract(sin(n * 91.345 + uSeed) * 47453.5453); }
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed) * 43758.5453); }
float vn1(float x) { float i = floor(x), f = fract(x); f = f * f * (3. - 2. * f); return mix(h1(i), h1(i + 1.), f); }
float vn2(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
    return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y);
}

float stack(vec2 uv, float r) {
    vec4 A = texture2D(uA, uv), B = texture2D(uB, uv);
    if (r < uLR.y) return mix(A.r, A.g, r / uLR.y);
    if (r < uLR.z) return mix(A.g, A.b, (r - uLR.y) / (uLR.z - uLR.y));
    if (r < uLR.w) return mix(A.b, A.a, (r - uLR.z) / (uLR.w - uLR.z));
    if (r < uLR2.x) return mix(A.a, B.r, (r - uLR.w) / (uLR2.x - uLR.w));
    if (r < uLR2.y) return mix(B.r, B.g, (r - uLR2.x) / (uLR2.y - uLR2.x));
    if (r < uLR2.z) return mix(B.g, B.b, (r - uLR2.y) / (uLR2.z - uLR2.y));
    if (r < uLR2.w) return mix(B.b, B.a, (r - uLR2.z) / (uLR2.w - uLR2.z));
    return B.a;
}

// How much of the light gets through the cotton here (1 = an average spot).
float cloth(vec2 s) {
    // the weave: a fine, even over-and-under of warp and weft, about a css
    // pixel apart, laid out in device pixels so it never beats with them; the
    // threads wander a little so it is cloth, not a grid
    vec2 sd = s * uDpr;
    float P = 2.6;
    float wx = sd.x + .5 * sin(sd.y / 41.) + .35 * sin(sd.y / 13. + 2.);
    float wy = sd.y + .5 * sin(sd.x / 47. + 1.) + .35 * sin(sd.x / 17.);
    float c = 1. - .026 * (.5 + .5 * sin(6.2832 * wx / P) * sin(6.2832 * wy / P));
    // slubs: now and then one thread runs thick for a long way, a little darker
    float row = floor(wy / P), col = floor(wx / P);
    float sr = step(.988, h1(row * 1.37 + 5.)) * smoothstep(.35, .8, vn1(s.x / 260. + row * .71));
    float sc = step(.991, h1(col * 2.11 + 31.)) * smoothstep(.35, .8, vn1(s.y / 300. + col * .53));
    float fr = 1. - abs(fract(wy / P) - .5) * 2., fc = 1. - abs(fract(wx / P) - .5) * 2.;
    c *= 1. - .055 * sr * smoothstep(.1, .7, fr) - .05 * sc * smoothstep(.1, .7, fc);
    // density: the cotton is not even, and the lamp behind shows it, cloudy
    c *= 1. - .055 * (vn2(s / 140. + 3.) - .5) - .035 * (vn2(s / 48. + 7.) - .5) - .018 * (vn2(s / 17. + 11.) - .5);
    // sag: the cloth bellies a little between its ties, top to bottom
    c *= 1. + .018 * sin(s.y / uSize.y * 3.1416) - .012 * sin(s.x / uSize.x * 9.4 + 1.2);
    // seams: where two widths are sewn, a double layer and a fold of light
    for (int i = 0; i < 2; i++) {
        float sx = (i == 0 ? uCloth.x : uCloth.y) * uSize.x;
        if (sx <= 0.) continue;
        float d = s.x - sx - 1.5 * sin(s.y / 140. + float(i) * 2.);
        c *= 1. - .13 * exp(-d * d / 3.2) + .04 * exp(-(d - 3.4) * (d - 3.4) / 1.4);
    }
    return c;
}

void main() {
    vec2 s = vec2(gl_FragCoord.x, uDev.y - gl_FragCoord.y) / uDpr;     // css px, y down
    vec2 n = s / uSize;

    // the puppet: back through the projection, then undo its lean
    vec2 P = uLamp + (s - uLamp) / uM;
    vec2 q = P - uGrip;
    float c = cos(uRot), sn = sin(uRot);
    q = vec2(c * q.x + sn * q.y, -sn * q.x + c * q.y);
    vec2 uv = uGuv + q / uPsz;
    float cov = 0., bloom = 0.;
    vec3 glow = vec3(0.);
    if (uv.x > -.1 && uv.x < 1.1 && uv.y > -.1) {
        cov = stack(uv, uR);
        // the hide is opaque: the half-tones the texture leaves in small holes
        // are resampling, not translucency, so while the shadow is crisp they
        // are pushed back to open (each hole passes the lamp undimmed)
        float crisp = 1. - smoothstep(.8, 3., uR);
        cov = mix(cov, smoothstep(.12, .72, cov), crisp);
        // a hair of bloom: light from the holes spills a pixel or two round them
        float wide = stack(uv, uR + uBloom);
        bloom = (1. - wide) * cov * .35;
        // the hide is rawhide, scraped thin: a little of the lamp comes through
        // it, coloured by the paint (premultiplied, blurred alike)
        glow = texture2D(uCol, uv, uBias).rgb * uHideT;
    }
    vec3 T = vec3(1. - cov + bloom) + glow;

    // the lamp: a small source at distance D, so the screen falls off as cos³,
    // and through the cotton a brighter hot spot where it looks into the flame
    vec2 dv = s - uLamp;
    float D = uLight.y;
    float E = uLight.x * pow(D * D / (D * D + dot(dv, dv)), 1.5);
    E += uLight.x * uLight.w * exp(-dot(dv, dv) / (uLight.z * uLight.z));

    float cl = cloth(s);
    vec3 trans = vec3(1.);
    // the dyed borders top and bottom: deep red cloth, lit through
    float bt = uCloth.z * uSize.y, bb = uCloth.w * uSize.y;
    float inTop = 1. - smoothstep(bt - 1., bt + 1., s.y);
    float inBot = smoothstep(uSize.y - bb - 1., uSize.y - bb + 1., s.y);
    trans = mix(trans, vec3(.36, .07, .045), max(inTop, inBot));
    // the banana trunk the puppets stand in, close against the screen
    float tk = uSize.y * (1. - uTrunk) + .8 * sin(s.x / 170. + 2.) + .5 * (vn1(s.x / 31.) - .5);
    float trunk = smoothstep(tk - 2., tk + 2.5, s.y);
    // the frame's shadow at the sides
    float side = smoothstep(0., uSize.y * .05, s.x) * smoothstep(0., uSize.y * .05, uSize.x - s.x);

    vec3 lit = E * cl * trans * T * uLampRGB * (1. - .93 * trunk) * mix(.55, 1., side);
    vec3 col = 1. - exp(-2.15 * lit);
    // the room's own dim light on the audience side of the cloth
    col += vec3(.052, .038, .03) * cl * mix(vec3(1.), vec3(.8, .45, .4), max(inTop, inBot));
    gl_FragColor = vec4(col, 1.);
}`;

// ── the component ─────────────────────────────────────────────────────

function readCfg(el, opts) {
    const d = el.dataset;
    const num = (k, def) => (opts[k] != null ? Number(opts[k]) : d[k] != null && d[k] !== '' ? Number(d[k]) : def);
    const pair = (k, def) => {
        if (opts[k] != null) return opts[k];
        if (d[k]) { const v = d[k].trim().split(/[\s,]+/).map(Number); if (v.length === 2 && v.every(Number.isFinite)) return v; }
        return def;
    };
    return {
        src: opts.src || d.src || (el.querySelector('img') && el.querySelector('img').currentSrc) || '',
        height: num('height', 1),       // the puppet texture's height at the screen, of the screen's height
        top: num('top', .06),           // where its top sits at the screen, of the screen's height
        at: num('at', .5),              // across, of the screen's width
        grip: pair('grip', [.5, 1]),    // the rod's end in the texture
        lamp: pair('lamp', [.5, .3]),   // the foot of the flame on the screen
        depth: num('depth', 1.15),      // lamp to screen, in screen heights
        far: num('far', .62),           // how far back toward the lamp scroll starts it, of depth
        flame: num('flame', .05),       // the flame's width, in screen heights
        glow: num('glow', .05),          // the hide's translucency
        flicker: num('flicker', 1),
        sway: num('sway', 1),
        reach: num('reach', .78),       // the share of the scroll it takes to reach the screen
        scroll: opts.scroll !== undefined ? opts.scroll : (d.scroll != null ? d.scroll : null),
        distance: opts.distance != null ? Number(opts.distance) : null,   // fixed 0-1, overrides scroll
        seams: pair('seams', [.34, .69]),
        seed: num('seed', 3),
    };
}

export function shadowPuppet(el, opts = {}) {
    const cfg = readCfg(el, opts);
    const calm = matchMedia('(prefers-reduced-motion: reduce)');
    const off = [];
    const on = (t, type, fn, o) => { t.addEventListener(type, fn, o); off.push(() => t.removeEventListener(type, fn, o)); };
    let dead = false, raf = 0, visible = false, lastT = 0, lastDraw = 0;
    let gl = null, canvas = null, P = {}, quad = null, tex = {}, img = null;
    let W = 0, H = 0, dpr = 1, ro = null, io = null, ownTab = false, ownLabel = false;

    // live state, in css px of the screen
    const st = {
        t: hash(cfg.seed) * 100, d: cfg.far, dT: cfg.far,
        g: [0, 0], gv: [0, 0], gT: [0, 0], off: [0, 0],   // grip (offset from rest), its velocity, its target
        th: 0, thv: 0,
        fl: { b: 1, s: 1, dx: 0, dy: 0, ev: null, next: 3 },
        dragging: false,
    };
    const flameRest = { b: 1, s: 1, dx: 0, dy: 0 };

    // ── geometry ──────────────────────────────────────────────────────
    const aspect = () => (img ? img.naturalWidth / img.naturalHeight : .5);
    // how far back it may start: on a narrow screen a puppet drawn right back
    // to the lamp would darken the whole cloth, so its shadow is kept to about
    // the screen's width
    function farthest() {
        if (!W || !H) return cfg.far;
        const Wp = cfg.height * H * aspect() * .75;
        const Mcap = Math.max(1.6, 1.15 * W / Math.max(1, Wp));
        return Math.min(cfg.far, 1 - 1 / Mcap);
    }
    function geo() {
        const D = cfg.depth * H;
        const d = clamp(st.d, 0, .95) * D;
        const M = D / (D - d);
        const Hp = cfg.height * H, Wp = Hp * aspect();
        const rest = [cfg.at * W, (cfg.top + cfg.height * cfg.grip[1]) * H];
        const fl = calm.matches ? flameRest : st.fl;
        const F = cfg.flame * H * fl.s;
        const L = [cfg.lamp[0] * W + fl.dx * cfg.flame * H, cfg.lamp[1] * H + fl.dy * cfg.flame * H];
        return { D, d, M, Hp, Wp, rest, F, L, fl };
    }
    // keep the shadow of the hand on the screen, whatever the distance
    function clampTarget() {
        const { M, rest } = geo();
        const L0 = cfg.lamp[0] * W;
        const xmin = L0 + (W * .1 - L0) / M - rest[0], xmax = L0 + (W * .9 - L0) / M - rest[0];
        st.gT[0] = clamp(st.gT[0], Math.min(xmin, xmax), Math.max(xmin, xmax));
        st.gT[1] = clamp(st.gT[1], -.2 * H, .28 * H);
    }

    // ── GL ────────────────────────────────────────────────────────────
    function compile(fs) {
        const sh = (type, src) => {
            const s = gl.createShader(type);
            gl.shaderSource(s, src);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn('shadow-puppet:', gl.getShaderInfoLog(s)); return null; }
            return s;
        };
        const v = sh(gl.VERTEX_SHADER, VS), f = sh(gl.FRAGMENT_SHADER, fs);
        if (!v || !f) return null;
        const p = gl.createProgram();
        gl.attachShader(p, v); gl.attachShader(p, f);
        gl.bindAttribLocation(p, 0, 'p');
        gl.linkProgram(p);
        gl.deleteShader(v); gl.deleteShader(f);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return null;
        const cache = {};
        return { p, u: (n) => (n in cache ? cache[n] : (cache[n] = gl.getUniformLocation(p, n))) };
    }
    function texture(w, h, src, mip) {
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
        if (src) {
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
            if (mip) gl.generateMipmap(gl.TEXTURE_2D);
        } else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        return t;
    }
    function fbo(t) {
        const f = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, f);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
        return f;
    }
    function bind(prog, name, unit, t) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.uniform1i(prog.u(name), unit);
    }

    // The puppet's alpha, blurred by ellipses of growing radius (each level
    // from the one before, so the large ones stay smooth), four to a texture.
    function buildStack() {
        const tw = img.naturalWidth, th = img.naturalHeight;
        const pot = (n) => (n & (n - 1)) === 0;
        tex.col = texture(tw, th, img, pot(tw) && pot(th));
        tex.A = texture(tw, th); tex.B = texture(tw, th);
        const tmp = [texture(tw, th), texture(tw, th)];
        const fA = fbo(tex.A), fB = fbo(tex.B);
        for (const f of [fA, fB]) { gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }
        const ft = tmp.map(fbo);
        gl.viewport(0, 0, tw, th);
        gl.disable(gl.BLEND);
        gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        const masks = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
        const store = (src, i) => {
            gl.useProgram(P.copy.p);
            bind(P.copy, 'uSrc', 0, src);
            gl.bindFramebuffer(gl.FRAMEBUFFER, i < 4 ? fA : fB);
            gl.colorMask(...masks[i % 4].map(Boolean));
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            gl.colorMask(true, true, true, true);
        };
        // level 0: the crisp alpha
        gl.useProgram(P.copy.p);
        bind(P.copy, 'uSrc', 0, tex.col);
        gl.bindFramebuffer(gl.FRAMEBUFFER, ft[0]);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        store(tmp[0], 0);
        let cur = 0, prev = 0;
        for (let i = 1; i < LEVELS.length; i++) {
            const R = LEVELS[i];
            const inc = Math.sqrt(Math.max(.25, R * R - prev * prev));
            gl.useProgram(P.blur.p);
            bind(P.blur, 'uSrc', 0, tmp[cur]);
            gl.uniform2f(P.blur.u('uR'), inc / tw, inc * ASPECT / th);
            gl.bindFramebuffer(gl.FRAMEBUFFER, ft[1 - cur]);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            cur = 1 - cur;
            store(tmp[cur], i);
            prev = R;
        }
        [fA, fB, ...ft].forEach((f) => gl.deleteFramebuffer(f));
        tmp.forEach((t) => gl.deleteTexture(t));
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        tex.w = tw; tex.h = th;
    }

    function initGL() {
        canvas = document.createElement('canvas');
        canvas.className = 'sp-canvas';
        canvas.setAttribute('aria-hidden', 'true');
        gl = canvas.getContext('webgl', { alpha: false, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: false });
        if (!gl) return false;
        P.copy = compile(COPY_FS);
        P.blur = compile(BLUR_FS);
        P.main = compile(MAIN_FS);
        if (!P.copy || !P.blur || !P.main) return false;
        quad = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        buildStack();
        return true;
    }
    function freeGL() {
        if (!gl) return;
        for (const k of ['col', 'A', 'B']) if (tex[k]) gl.deleteTexture(tex[k]);
        for (const k in P) if (P[k]) gl.deleteProgram(P[k].p);
        if (quad) gl.deleteBuffer(quad);
        tex = {}; P = {}; quad = null;
    }

    // ── layout ────────────────────────────────────────────────────────
    function layout() {
        if (!canvas) return;
        const w = el.clientWidth, h = el.clientHeight;
        if (!w || !h) return;
        let k = Math.min(devicePixelRatio || 1, 2);
        const cap = 4.6e6;
        if (w * h * k * k > cap) k = Math.sqrt(cap / (w * h));
        const keep = W ? [st.gT[0] / W, st.gT[1] / H, st.g[0] / W, st.g[1] / H] : null;
        W = w; H = h; dpr = k;
        canvas.width = Math.round(w * k);
        canvas.height = Math.round(h * k);
        if (keep) { st.gT = [keep[0] * W, keep[1] * H]; st.g = [keep[2] * W, keep[3] * H]; }
        draw();
    }

    // ── simulation ────────────────────────────────────────────────────
    function targetDistance() {
        if (calm.matches) return 0;
        if (cfg.distance != null) return clamp(cfg.distance) * farthest();
        let host = null;
        if (cfg.scroll) host = el.closest(cfg.scroll) || document.querySelector(cfg.scroll);
        let p;
        const vh = innerHeight;
        if (host) {
            const r = host.getBoundingClientRect();
            const span = Math.max(1, r.height - vh);
            p = clamp(-r.top / span);
        } else {
            const r = el.getBoundingClientRect();
            // arrives at the screen as its middle reaches the middle of the view
            p = clamp(1 - (r.top + r.height / 2 - vh / 2) / (vh * .75));
        }
        const k = smooth(0, 1, clamp(p / cfg.reach));
        return farthest() * (1 - k);
    }

    function stepFlame(dt) {
        const f = st.fl, t = st.t, F = cfg.flicker;
        // still air: a slow breath, a flutter, a shimmer; the flame leans and lifts a little
        let b = 1 + F * (.07 * noise(t * .55) + .045 * noise(t * 1.7 + 11) + .025 * noise(t * 4.6 + 23) + .012 * noise(t * 9.3 + 37));
        let s = 1 + F * (.1 * noise(t * 1.1 + 5) + .05 * noise(t * 3.7 + 9));
        let dx = F * (.16 * noise(t * .62 + 3) + .07 * noise(t * 2.3 + 17));
        let dy = F * (-.08 * (s - 1) + .05 * noise(t * .9 + 29));
        // now and then a draught from the night outside lays the flame over
        if (t > f.next && !f.ev) {
            f.ev = { t0: t, dur: 1.1 + hash(t) * 1.6, dir: hash(t + 1) > .5 ? 1 : -1, amp: .6 + hash(t + 2) * .6 };
            f.next = t + 4 + hash(t + 3) * 6;
        }
        if (f.ev) {
            const k = (t - f.ev.t0) / f.ev.dur;
            if (k >= 1) f.ev = null;
            else {
                const env = Math.sin(Math.PI * Math.min(1, k * 1.4)) ** 2 * (k < .7 ? 1 : 1 - (k - .7) / .3);
                const fl = noise(t * 11 + 7) * .5 + .5;
                dx += F * f.ev.dir * f.ev.amp * .9 * env;
                s += F * .35 * env;
                b -= F * (.1 + .1 * fl) * env * f.ev.amp;
            }
        }
        f.b = b; f.s = s; f.dx = dx; f.dy = dy;
    }

    function step(dt) {
        st.t += dt;
        stepFlame(dt);
        // distance: scroll-driven, eased a touch so a flick of the wheel glides
        st.dT = targetDistance();
        st.d += (st.dT - st.d) * (1 - Math.exp(-dt / .14));
        // the hand: follows its target closely; its acceleration swings the puppet
        const w = 16, t = st.t;
        const idle = st.dragging ? [0, 0] : [H * .0028 * noise(t * .23 + 41), H * .002 * noise(t * .31 + 53)];
        let ax = 0;
        for (let i = 0; i < 2; i++) {
            const tgt = st.gT[i] + idle[i];
            const a = w * w * (tgt - st.g[i]) - 2 * w * st.gv[i];
            st.gv[i] += a * dt;
            st.g[i] += st.gv[i] * dt;
            if (i === 0) ax = a;
        }
        // the lean: hide and rod are springy, the puppet's top lags behind the hand
        const { Hp } = geo();
        const w0 = 6.2, z = .26;
        const drive = -ax / Math.max(1, Hp) * 1.3 * cfg.sway;
        const thIdle = .006 * noise(t * .17 + 61);
        st.thv += (w0 * w0 * (thIdle - st.th) + drive - 2 * z * w0 * st.thv) * dt;
        st.th = clamp(st.th + st.thv * dt, -.3, .3);
    }

    function draw() {
        if (!gl || !W || !tex.A) return;
        const { D, d, M, Hp, Wp, rest, F, L, fl } = geo();
        const prog = P.main;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.useProgram(prog.p);
        gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        bind(prog, 'uA', 0, tex.A);
        bind(prog, 'uB', 1, tex.B);
        bind(prog, 'uCol', 2, tex.col);
        gl.uniform2f(prog.u('uDev'), canvas.width, canvas.height);
        gl.uniform1f(prog.u('uDpr'), dpr);
        gl.uniform2f(prog.u('uSize'), W, H);
        gl.uniform4f(prog.u('uLR'), LEVELS[0], LEVELS[1], LEVELS[2], LEVELS[3]);
        gl.uniform4f(prog.u('uLR2'), LEVELS[4], LEVELS[5], LEVELS[6], LEVELS[7]);
        gl.uniform2f(prog.u('uLamp'), L[0], L[1]);
        gl.uniform1f(prog.u('uM'), M);
        const g = calm.matches ? st.gT : st.g;
        gl.uniform2f(prog.u('uGrip'), rest[0] + g[0], rest[1] + g[1]);
        gl.uniform2f(prog.u('uGuv'), cfg.grip[0], cfg.grip[1]);
        gl.uniform2f(prog.u('uPsz'), Wp, Hp);
        gl.uniform1f(prog.u('uRot'), calm.matches ? 0 : st.th);
        // penumbra on the screen, then in texels of the puppet; plus half a
        // device pixel of footprint so the crisp lace never aliases
        const pen = F * d / Math.max(1e-3, D - d);
        const tpp = tex.h / (Hp * M);                 // texels per css px on the screen
        const foot = .4 * tpp / dpr;
        const r = Math.hypot(pen * .5 * tpp, foot);
        gl.uniform1f(prog.u('uR'), Math.min(r, LEVELS[LEVELS.length - 1]));
        gl.uniform1f(prog.u('uBloom'), 2.2 * tpp);    // about two css px on the screen
        // the paint's glow is read a few mip levels softer: light through hide is diffuse,
        // and it keeps the photograph's own lighting out of the shadow
        gl.uniform1f(prog.u('uBias'), 2.5 + Math.max(0, Math.log2(Math.max(1, r * 1.4)) - Math.log2(Math.max(1, tpp / dpr))));
        gl.uniform4f(prog.u('uLight'), fl.b, D, H * .19 * (.9 + .1 * fl.s), .62 * (.8 + .2 * fl.b));
        gl.uniform1f(prog.u('uHideT'), cfg.glow);
        gl.uniform4f(prog.u('uCloth'), cfg.seams[0], cfg.seams[1], .045, .03);
        gl.uniform1f(prog.u('uTrunk'), .062);
        gl.uniform1f(prog.u('uSeed'), cfg.seed);
        gl.uniform3f(prog.u('uLampRGB'), ...LAMP_RGB);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    function frame(now) {
        raf = 0;
        if (dead || !gl) return;
        const live = visible && !document.hidden && !calm.matches;
        if (!live) return;
        raf = requestAnimationFrame(frame);
        if (now - lastDraw < 1000 / FPS - 2) return;
        const dt = lastT ? Math.min(.08, (now - lastT) / 1000) : 1 / FPS;
        lastT = lastDraw = now;
        step(dt);
        draw();
    }
    function wake() {
        if (raf || dead || !gl) return;
        if (calm.matches) { raf = requestAnimationFrame(() => { raf = 0; draw(); }); return; }
        if (!visible || document.hidden) return;
        lastT = 0;
        raf = requestAnimationFrame(frame);
    }

    // ── the dalang's hand ─────────────────────────────────────────────
    let drag = null;
    function onDown(e) {
        if (e.button > 0 || !gl) return;
        drag = { id: e.pointerId, x: e.clientX, y: e.clientY, touch: e.pointerType !== 'mouse' };
        st.dragging = true;
        if (!drag.touch) { el.setPointerCapture?.(e.pointerId); el.classList.add('is-dragging'); }
        wake();
    }
    function onMove(e) {
        if (!drag || e.pointerId !== drag.id) return;
        const dx = e.clientX - drag.x, dy = drag.touch ? 0 : e.clientY - drag.y;
        drag.x = e.clientX; drag.y = e.clientY;
        const { M } = geo();
        // the shadow follows the finger: the hand moves 1/M as far
        st.gT[0] += dx / M;
        st.gT[1] += dy / M;
        clampTarget();
        wake();
    }
    function onUp(e) {
        if (!drag || (e.pointerId != null && e.pointerId !== drag.id)) return;
        drag = null;
        st.dragging = false;
        el.classList.remove('is-dragging');
    }
    function onKey(e) {
        const k = e.key;
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(k)) return;
        e.preventDefault();
        const { M } = geo();
        const step = (e.shiftKey ? 3 : 1) / M;
        if (k === 'ArrowLeft') st.gT[0] -= W * .04 * step;
        if (k === 'ArrowRight') st.gT[0] += W * .04 * step;
        if (k === 'ArrowUp') st.gT[1] -= H * .03 * step;
        if (k === 'ArrowDown') st.gT[1] += H * .03 * step;
        clampTarget();
        wake();
    }

    // ── life cycle ────────────────────────────────────────────────────
    function goLive() {
        if (dead) return;
        if (!initGL()) { freeGL(); canvas = null; gl = null; return; }
        el.prepend(canvas);
        el.classList.add('is-live');
        if (!el.hasAttribute('tabindex')) { el.tabIndex = 0; ownTab = true; }
        if (!el.hasAttribute('aria-label')) {
            el.setAttribute('aria-label', 'A shadow-puppet screen, lit from behind by an oil lamp. Drag, or use the arrow keys, to move the puppet.');
            ownLabel = true;
        }
        on(canvas, 'webglcontextlost', (e) => { e.preventDefault(); cancelAnimationFrame(raf); raf = 0; tex = {}; P = {}; quad = null; el.classList.remove('is-live'); });
        on(canvas, 'webglcontextrestored', () => { if (initGL()) { el.classList.add('is-live'); layout(); wake(); } });
        ro = new ResizeObserver(() => layout());
        ro.observe(el);
        io = new IntersectionObserver((es) => {
            visible = es[es.length - 1].isIntersecting;
            if (visible) wake(); else { cancelAnimationFrame(raf); raf = 0; }
        }, { rootMargin: '80px 0px' });
        io.observe(el);
        on(document, 'visibilitychange', () => (document.hidden ? (cancelAnimationFrame(raf), raf = 0) : wake()));
        on(el, 'pointerdown', onDown);
        on(window, 'pointermove', onMove, { passive: true });
        on(window, 'pointerup', onUp);
        on(window, 'pointercancel', onUp);
        on(el, 'keydown', onKey);
        on(calm, 'change', () => { cancelAnimationFrame(raf); raf = 0; st.d = targetDistance(); draw(); wake(); });
        st.d = st.dT = targetDistance();
        layout();
        wake();
    }

    function destroy() {
        dead = true;
        cancelAnimationFrame(raf); raf = 0;
        off.forEach((f) => f()); off.length = 0;
        ro?.disconnect(); io?.disconnect();
        freeGL();
        gl?.getExtension('WEBGL_lose_context')?.loseContext();
        gl = null;
        canvas?.remove(); canvas = null;
        el.classList.remove('is-live', 'is-dragging');
        if (ownTab) el.removeAttribute('tabindex');
        if (ownLabel) el.removeAttribute('aria-label');
        delete el.shadowPuppet;
    }
    destroy.set = (o) => {
        Object.assign(cfg, readCfg(el, { ...cfg, ...o }));
        clampTarget();
        if (calm.matches) draw(); else wake();
    };
    Object.defineProperty(destroy, 'state', {
        get: () => ({ distance: st.d / (cfg.far || 1), magnification: gl ? geo().M : 1, lean: st.th, grip: [...st.g], flame: { ...st.fl, ev: !!st.fl.ev }, live: !!gl, running: !!raf }),
    });
    el.shadowPuppet = destroy;

    // load the puppet (same origin: WebGL will not take a cross-origin image)
    if (!cfg.src) { console.warn('shadow-puppet: no data-src'); return destroy; }
    img = new Image();
    img.decoding = 'async';
    img.onload = () => goLive();
    img.onerror = () => console.warn('shadow-puppet: could not load', cfg.src);
    img.src = new URL(cfg.src, document.baseURI).href;
    return destroy;
}

function autoStart(el) {
    if (el.shadowPuppet) return;
    shadowPuppet(el);
}
if (typeof document !== 'undefined') {
    const go = () => document.querySelectorAll('[data-shadow-puppet]').forEach(autoStart);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go, { once: true });
    else go();
}
