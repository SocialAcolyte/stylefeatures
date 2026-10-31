/* botticelli-primavera — Botticelli's Primavera painted in egg-tempera order as you scroll.
 *
 *   <section data-botticelli-primavera data-src="assets/primavera.json">
 *     <div class="bp-stage"><div class="bp-sheet">
 *       <img class="bp-img" src="assets/primavera.webp" alt="" aria-hidden="true">
 *     </div></div>
 *   </section>
 *
 * The panel starts as bare gesso. A brush underdrawing goes down line by line, each line
 * pulled from one end at an even pace, figure by figure. Then the tempera, which dries as
 * it is laid and cannot be blended, so everything is built in short hatched strokes, patch
 * by patch along the forms: first the dark ground of the grove and the meadow, flat, the
 * figures held in reserve as gesso and line; the grove's leaves, oranges and sky over it;
 * then each figure left to right (Mercury, the three Graces, Venus, Cupid, Flora, Chloris,
 * Zephyrus): a first layer (green earth under the flesh, flat local colour elsewhere) and
 * a second, cross-hatched, that models it (pink over the green in the flesh). The meadow's
 * flowers come last. Then shell gold is touched into the hair and the borders, and the
 * final glazes deepen everything, left to right, into the Uffizi panel itself, pixel for
 * pixel. Scroll back and it un-paints.
 *
 * Everything heavy is offline (see README): the underdrawing with the time each point of
 * a line is reached, the figure regions, the underpainting, the gold and a flow field
 * for the direction of the hatching. The strokes themselves are drawn in the shader.
 *
 * Options (data-* or the options object, which wins):
 *   src      the panel's JSON (required); images are <name>.webp, -under, -lines, -map, -flow (.webp)
 *   mode     'scroll' (default: a pinned stage on a runway) | 'static' (the finished panel)
 *   runway   section height in svh (default 520)
 *   webgl    'off' leaves the finished panel as an image
 *
 * Events (bubbling, for sound later): 'botticelli-primavera:stage' {stage} as each stage
 * begins while scrolling forward ('drawing', 'ground', 'mercury' … 'zephyrus', 'meadow',
 * 'gold', 'glaze'), and 'botticelli-primavera:done' when the last glaze is on.
 */

const calm = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
// Everything is decoded off the main thread into ImageBitmaps, exactly as stored (no
// premultiplying, no colour conversion), so uploading them is a copy, never a re-decode.
function loadBits(url) {
    return fetch(url).then((r) => { if (!r.ok) throw new Error('botticelli-primavera: could not load ' + url); return r.blob(); })
        .then((b) => createImageBitmap(b, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }));
}

/* ── The order of work, as fractions of the pinned scroll ───────────────────
 * Each region has two passes: a = the first layer (dark ground; green earth under the
 * flesh, flat colour elsewhere), b = the modelling, hatched across it. `dir` is the way
 * the painter works through the region (in its box: down, or across). */
const STAGES = {
    drawing: [0.025, 0.19],
    gold: [0.795, 0.855],
    glaze: [0.845, 0.94],
    end: 0.945,
};
const REGIONS = {
    grove:    { a: [0.19, 0.275],  b: [0.245, 0.345], dir: [0.15, 1] },
    meadow:   { a: [0.205, 0.29],  b: [0.70, 0.79],   dir: [0.15, 1] },
    mercury:  { a: [0.335, 0.39],  b: [0.365, 0.425], dir: [0, 1] },
    graces:   { a: [0.39, 0.475],  b: [0.43, 0.515],  dir: [1, 0.55] },
    venus:    { a: [0.48, 0.535],  b: [0.51, 0.57],   dir: [0, 1] },
    cupid:    { a: [0.53, 0.56],   b: [0.55, 0.585],  dir: [1, 0.3] },
    flora:    { a: [0.565, 0.615], b: [0.59, 0.645],  dir: [0, 1] },
    chloris:  { a: [0.615, 0.66],  b: [0.64, 0.69],   dir: [0.2, 1] },
    zephyrus: { a: [0.655, 0.70],  b: [0.68, 0.725],  dir: [0.3, 1] },
};
const MAXR = 10;

/* ── Paper noise: one tileable 256² RGBA texture, made once ────────────────
 * R fine grain   G mid mottle   B broad (glaze streaks)   A fibre */
let noiseCache = null;
function makeNoise() {
    if (noiseCache) return noiseCache;
    const S = 256, out = new Uint8Array(S * S * 4);
    let seed = 1482;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    function lattice(p) {
        const g = new Float32Array(p * p);
        for (let i = 0; i < g.length; i++) g[i] = rnd();
        return (u, v) => {
            const fx = u * p, fy = v * p, ix = Math.floor(fx), iy = Math.floor(fy);
            const tx = fx - ix, ty = fy - iy, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
            const x0 = ((ix % p) + p) % p, x1 = (x0 + 1) % p, y0 = ((iy % p) + p) % p, y1 = (y0 + 1) % p;
            const a = g[y0 * p + x0], b = g[y0 * p + x1], c = g[y1 * p + x0], d = g[y1 * p + x1];
            return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
        };
    }
    const f1 = lattice(128), m1 = lattice(8), m2 = lattice(24), b1 = lattice(3), b2 = lattice(6), r1 = lattice(64);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const u = x / S, v = y / S, k = (y * S + x) * 4;
        out[k] = clamp(f1(u, v) * .7 + rnd() * .3) * 255;
        out[k + 1] = clamp(.5 + (m1(u, v) * .6 + m2(u, v) * .4 - .5) * 1.7) * 255;
        out[k + 2] = clamp(.5 + (b1(u, v) * .6 + b2(u, v) * .4 - .5) * 1.8) * 255;
        out[k + 3] = clamp(r1(u, v)) * 255;
    }
    noiseCache = { S, data: out };
    return noiseCache;
}

const VERT = `attribute vec2 aP; varying vec2 vUv;
void main(){ vUv = vec2(aP.x * .5 + .5, .5 - aP.y * .5); gl_Position = vec4(aP, 0., 1.); }`;

const FRAG = `precision highp float;
varying vec2 vUv;
uniform sampler2D uOrig, uUnder, uLines, uMap, uFlow, uNz;
uniform vec2 uAsset;          // the panel's size in asset px
uniform float uPx;            // asset px per device px (anti-aliasing of the strokes)
uniform float uPitch;         // the hatching's row pitch, asset px
uniform float uS;             // scroll progress 0..1
uniform vec2 uLine, uGold, uGlaze;   // start, duration
uniform float uEnd;
uniform vec3 uGesso;
uniform vec4 uR[${MAXR}];     // per region: a start, a dur, b start, b dur
uniform vec4 uBox[${MAXR}];   // per region: its box in uv
uniform vec2 uDir[${MAXR}];   // per region: the direction the painter works through it

float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash2(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .103, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }

// One pass of hatching. Returns, for this pixel: x = local time its stroke reaches it,
// y = how much of the pixel the stroke covers, z = local time the gaps between strokes fill.
vec3 hatch(vec2 q, float angOff, float seed, vec4 box, vec2 dir){
  float C = uPitch * 12.;
  // patches of parallel strokes, their borders warped so they never read as tiles
  vec2 wq = q + (texture2D(uNz, q / (C * 9.)).gb - .5) * C * .9;
  vec2 cell = floor(wq / C), pc = cell, pp = vec2(0.);
  float best = 1e9;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 c = cell + vec2(float(i), float(j));
    vec2 p = (c + .5 + (hash2(c + seed) - .5) * .8) * C;
    vec2 dd = wq - p; float d2 = dot(dd, dd);
    if (d2 < best) { best = d2; pc = c; pp = p; }
  }
  vec2 f = texture2D(uFlow, pp / uAsset).rg * 2. - 1.;
  float th = .5 * atan(f.y, f.x) + angOff + (hash(pc + 3.1 + seed) - .5) * .32;
  vec2 dv = vec2(cos(th), sin(th)), nv = vec2(-dv.y, dv.x);
  vec2 d = q - pp;
  float u = dot(d, dv), v = dot(d, nv);
  float w = uPitch;
  float rv = v / w, r = floor(rv + .5), vc = (rv - r) * w;
  float rh = hash(vec2(r, 7.) + pc * 1.7 + seed);
  float L = w * (4.5 + 3.5 * rh);
  float uu = u + rh * L, s = floor(uu / L), al = fract(uu / L);
  float sh = hash(vec2(s, r) + pc * 3.3 + seed * 1.3);
  float halfw = w * .5 * (.8 + .42 * sh) * sqrt(max(sin(3.14159 * al), 0.));
  float wob = (hash(vec2(s, r) + pc + 9.) - .5) * w * .28 + sin(al * 3. + sh * 6.) * w * .09;
  float cover = clamp((halfw - abs(vc - wob)) / max(uPx, .5) + .5, 0., 1.);
  // when: the patch by its place along the painter's way through the region, then row by row
  vec2 nb = (pp / uAsset - box.xy) / max(box.zw - box.xy, vec2(1e-3));
  float rank = clamp(dot(nb, dir) / (abs(dir.x) + abs(dir.y)) + (hash(pc + 11.) - .5) * .22, 0., 1.);
  float rowRank = clamp(v / (C * 1.5) + .5, 0., 1.);
  float PD = .14, SD = .025;
  float st = rank * (1. - PD) + PD * (rowRank * .85 + sh * .15);
  float t = st * (1. - SD) + al * SD;
  return vec3(t, cover, min(1., t + .16));
}
float arrive(float t, float p){ return smoothstep(t - .004, t, p); }

void main(){
  vec2 uv = vUv;
  vec3 o = texture2D(uOrig, uv).rgb;
  if (uS >= uEnd) { gl_FragColor = vec4(o, 1.); return; }
  vec2 q = uv * uAsset;
  vec4 m = texture2D(uMap, uv);
  vec4 ln = texture2D(uLines, uv);
  vec4 nz = texture2D(uNz, q / 700.);
  float id = floor(m.r * 255. + .5);

  // the gesso, and the underdrawing pulled along each line
  vec3 col = uGesso * (1. - .016 * (nz.g - .5) - .018 * (nz.r - .5));
  float lt = (m.g * 255. * 256. + m.b * 255.) / 65000.;
  float pl = (uS - uLine.x) / uLine.y;
  float drawn = smoothstep(lt - .0025, lt, pl);
  float ink = ln.r * drawn;
  vec3 inkC = vec3(.24, .19, .15);
  col = mix(col, inkC, ink * .82);

  vec4 R = vec4(2.), B = vec4(0., 0., 1., 1.); vec2 D = vec2(0., 1.);
  for (int i = 0; i < ${MAXR}; i++) if (float(i) == id) { R = uR[i]; B = uBox[i]; D = uDir[i]; }

  // the tempera before its glazes: the panel a shade paler and cooler, the gold not yet laid
  vec3 lin = pow(o, vec3(2.2));
  vec3 tl = exp(log(max(lin, vec3(.002))) * .8);
  vec3 T = pow(tl, vec3(1. / 2.2));
  T = mix(T, vec3(dot(T, vec3(.3, .55, .15))), .1);
  float gm = ln.g;
  if (gm > .01) {
    vec2 px = 3. / uAsset;
    vec3 av = (texture2D(uOrig, uv + vec2(px.x, 0.)).rgb + texture2D(uOrig, uv - vec2(px.x, 0.)).rgb
             + texture2D(uOrig, uv + vec2(0., px.y)).rgb + texture2D(uOrig, uv - vec2(0., px.y)).rgb) * .25;
    av = pow(exp(log(max(pow(av, vec3(2.2)), vec3(.002))) * .8), vec3(1. / 2.2));
    T = mix(T, av * vec3(.97, .95, .93), gm);
  }

  // first layer (once the second has covered it, neither needs its strokes any more)
  float pa = (uS - R.x) / R.y, pb = (uS - R.z) / R.w;
  if (pb > 1.25) col = T;
  else if (pa > 1.25) col = mix(texture2D(uUnder, uv).rgb, texture2D(uUnder, uv).rgb * inkC * 2.2, ink * .3);
  else if (pa > 0.) {
    vec3 h = hatch(q, 0., 1., B, D);
    float a = h.y * arrive(h.x, pa) + (1. - h.y) * arrive(h.z, pa);
    float op = .8 + .2 * smoothstep(h.x, h.x + .2, pa);
    vec3 un = texture2D(uUnder, uv).rgb;
    un = mix(un, un * inkC * 2.2, ink * .3);            // the drawing still shows through
    col = mix(col, un, a * op);
  }
  // second layer, hatched across the first
  if (pb > 0. && pb <= 1.25) {
    vec3 h = hatch(q, 1.0, 5., B, D);
    float b = h.y * arrive(h.x, pb) + (1. - h.y) * arrive(h.z, pb);
    float op = .78 + .22 * smoothstep(h.x, h.x + .22, pb);
    col = mix(col, T, b * op);
  }
  // shell gold, touched in with a fine brush, bright as it goes on
  float pg = (uS - uGold.x) / uGold.y;
  if (gm > .01 && pg > 0. && m.a < .999) {
    float gt = (m.a * 255. - 1.) / 252.;
    float ga = smoothstep(gt - .01, gt, pg) * gm;
    float glint = ga * (1. - smoothstep(gt, gt + .2, pg));
    col = mix(col, o, ga) + glint * vec3(.42, .33, .12) * (.6 + .4 * nz.a);
  }
  // the glazes: thin and broad, laid left to right in long strokes, deepening into the panel
  float pz = (uS - uGlaze.x) / uGlaze.y;
  if (pz > 0.) {
    float streak = texture2D(uNz, vec2(q.x / 2600., q.y / 160.)).b;
    float gz = clamp(.8 * uv.x + .2 * streak, 0., 1.);
    float g = smoothstep(gz - .1, gz + .03, pz * 1.18 - .1);
    col = mix(col, o, g);
  }
  gl_FragColor = vec4(col, 1.);
}`;

function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    return sh;
}

export function botticelliPrimavera(root, opts = {}) {
    const ds = root.dataset;
    const o = {
        src: opts.src ?? ds.src ?? 'assets/primavera.json',
        mode: opts.mode ?? ds.mode ?? 'scroll',
        runway: +(opts.runway ?? ds.runway ?? 520),
        webgl: (opts.webgl ?? ds.webgl ?? 'on') !== 'off' && opts.webgl !== false,
    };
    const base = o.src.replace(/\.json$/, '');
    const stage = root.querySelector('.bp-stage') || root;
    const sheet = stage.querySelector('.bp-sheet') || stage;
    let dead = false, cleanup = [];
    const on = (t, ev, fn, opt) => { t.addEventListener(ev, fn, opt); cleanup.push(() => t.removeEventListener(ev, fn, opt)); };
    root.classList.add('bp');
    const still = () => calm.matches || o.mode === 'static';

    const canvas = document.createElement('canvas');
    canvas.className = 'bp-canvas';
    canvas.setAttribute('aria-hidden', 'true');

    let meta, ims = {}, gl = null, prog = null, U = {}, tex = {};
    let cw = 0, ch = 0, texW = 0, cssW = 1;
    let target = 0, shown = 0, vel = 0, visible = false, raf = 0, last = 0, lastShown = -1, firedTo = -1, doneFired = false;
    let cues = [];

    function readScroll() {
        if (still()) { target = 1; return; }
        const r = root.getBoundingClientRect();
        const run = r.height - innerHeight;
        target = run > 0 ? clamp(-r.top / run) : 1;
    }
    function setRunway() {
        if (still()) { root.classList.remove('bp-scroll'); root.style.removeProperty('--bp-runway'); return; }
        root.classList.add('bp-scroll');
        root.style.setProperty('--bp-runway', o.runway + 'svh');
    }

    function upload(name, src, linear) {
        if (!tex[name]) tex[name] = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex[name]);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
        const f = linear ? gl.LINEAR : gl.NEAREST;
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    // The painting and the drawing are resampled to the canvas's pixel size (good
    // downsampling, so fine line never aliases); at or above their own size they go up as is.
    function packOne(k, w, h) {
        if (w >= meta.w) { upload(k, ims[k], true); return; }
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        const cx = cv.getContext('2d');
        cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
        cx.drawImage(ims[k], 0, 0, w, h);
        upload(k, cv, true);
        cv.width = cv.height = 0;
    }
    function pack(w, h) { texW = w; packOne('orig', w, h); packOne('lines', w, h); }

    function initGL() {
        const ca = { alpha: false, antialias: false, preserveDrawingBuffer: false };
        const g = canvas.getContext('webgl2', ca) || canvas.getContext('webgl', ca);
        if (!g) return false;
        gl = g;
        try {
            prog = gl.createProgram();
            gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
            gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
            gl.linkProgram(prog);
            if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
        } catch (err) { console.warn('botticelli-primavera: shader failed', err); gl = null; return false; }
        gl.useProgram(prog);
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(prog, 'aP');
        gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        const names = ['uOrig', 'uUnder', 'uLines', 'uMap', 'uFlow', 'uNz', 'uAsset', 'uPx', 'uPitch', 'uS', 'uLine', 'uGold', 'uGlaze', 'uEnd', 'uGesso', 'uR', 'uBox', 'uDir'];
        for (const n of names) U[n] = gl.getUniformLocation(prog, n);
        const nz = makeNoise();
        tex.nz = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex.nz);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, nz.S, nz.S, 0, gl.RGBA, gl.UNSIGNED_BYTE, nz.data);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        ['uOrig', 'uUnder', 'uLines', 'uMap', 'uFlow', 'uNz'].forEach((n, i) => gl.uniform1i(U[n], i));
        // the schedule, per region in the map's order
        const r4 = new Float32Array(MAXR * 4).fill(2), b4 = new Float32Array(MAXR * 4), d2 = new Float32Array(MAXR * 2);
        meta.regions.forEach((rg, i) => {
            const s = REGIONS[rg.name]; if (!s || i >= MAXR) return;
            r4.set([s.a[0], s.a[1] - s.a[0], s.b[0], s.b[1] - s.b[0]], i * 4);
            b4.set(rg.box, i * 4); d2.set(s.dir, i * 2);
        });
        gl.uniform4fv(U.uR, r4); gl.uniform4fv(U.uBox, b4); gl.uniform2fv(U.uDir, d2);
        gl.uniform2f(U.uAsset, meta.w, meta.h);
        gl.uniform2f(U.uLine, STAGES.drawing[0], STAGES.drawing[1] - STAGES.drawing[0]);
        gl.uniform2f(U.uGold, STAGES.gold[0], STAGES.gold[1] - STAGES.gold[0]);
        gl.uniform2f(U.uGlaze, STAGES.glaze[0], STAGES.glaze[1] - STAGES.glaze[0]);
        gl.uniform1f(U.uEnd, STAGES.end);
        gl.uniform3fv(U.uGesso, meta.gesso);
        texW = 0;
        return true;
    }

    function layout(staged) {
        const r = sheet.getBoundingClientRect();
        const dpr = Math.min(2, devicePixelRatio || 1);
        cssW = Math.max(60, r.width);
        cw = Math.max(2, Math.round(r.width * dpr)); ch = Math.max(2, Math.round(r.height * dpr));
        if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
        if (!gl) return;
        gl.viewport(0, 0, cw, ch);
        const want = Math.min(meta.w, cw);
        if (want !== texW && !staged) pack(want, ch);   // texel for pixel when the canvas is smaller than the scan
        gl.uniform1f(U.uPx, meta.w / cw);
        // hatching on the panel's scale on a big screen; never finer than ~2 css px a row on a small one
        gl.uniform1f(U.uPitch, Math.max(4.4, 2.1 * meta.w / cssW));
    }

    function draw() {
        const S = shown;
        if (gl) {
            ['orig', 'under', 'lines', 'map', 'flow', 'nz'].forEach((k, i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, tex[k]); });
            gl.uniform1f(U.uS, S);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
        // events: a stage beginning (forward only), and the last glaze on
        if (S > lastShown) {
            for (let i = firedTo + 1; i < cues.length && cues[i].at <= S; i++) {
                root.dispatchEvent(new CustomEvent('botticelli-primavera:stage', { bubbles: true, detail: { stage: cues[i].stage } }));
                firedTo = i;
            }
            if (S >= STAGES.end && !doneFired) { doneFired = true; root.dispatchEvent(new CustomEvent('botticelli-primavera:done', { bubbles: true })); }
        } else {
            while (firedTo >= 0 && cues[firedTo].at > S) firedTo--;
            if (S < STAGES.end) doneFired = false;
        }
        lastShown = S;
    }

    function frame(now) {
        raf = 0;
        const dt = Math.min(.1, (now - (last || now)) / 1000); last = now;
        // critically damped spring toward the scroll position; going back it is quicker
        const w = target < shown ? 15 : 10, x0 = shown - target, c2 = vel + w * x0, e = Math.exp(-w * dt);
        shown = target + (x0 + c2 * dt) * e;
        vel = (c2 - w * (x0 + c2 * dt)) * e;
        if (Math.abs(target - shown) < 2e-5 && Math.abs(vel) < 2e-5) { shown = target; vel = 0; }
        draw();
        if (shown !== target && visible && !document.hidden) kick();
        else last = 0;
    }
    function kick() { if (!raf && !dead && visible && !document.hidden) raf = requestAnimationFrame(frame); }

    async function start() {
        setRunway();
        if (!o.webgl) return;
        try {
            meta = await (await fetch(o.src)).json();
            const [orig, under, lines, map, flow] = await Promise.all([
                loadBits(base + '.webp'), loadBits(base + '-under.webp'), loadBits(base + '-lines.webp'),
                loadBits(base + '-map.webp'), loadBits(base + '-flow.webp')]);
            ims = { orig, under, lines, map, flow };
        } catch (err) { console.warn(err); return; }
        if (dead) return;
        cues = [{ at: STAGES.drawing[0], stage: 'drawing' }, { at: REGIONS.grove.a[0], stage: 'ground' },
            ...['mercury', 'graces', 'venus', 'cupid', 'flora', 'chloris', 'zephyrus'].map((n) => ({ at: REGIONS[n].a[0], stage: n })),
            { at: REGIONS.meadow.b[0], stage: 'meadow' }, { at: STAGES.gold[0], stage: 'gold' }, { at: STAGES.glaze[0], stage: 'glaze' }]
            .sort((a, b) => a.at - b.at);
        sheet.style.aspectRatio = meta.w + ' / ' + meta.h;
        sheet.appendChild(canvas);
        if (!initGL()) { canvas.remove(); return; }
        // the big textures go up one per frame, so the page never stalls on them
        // (the map is exact, an ImageBitmap not premultiplied, sampled by nearest: its values are indices and times)
        for (const [k, lin] of [['map', false], ['under', true], ['flow', true]]) {
            await nextFrame(); if (dead || !gl) return;
            upload(k, ims[k], lin);
        }
        layout(true);
        texW = Math.min(meta.w, cw);
        for (const k of ['orig', 'lines']) { await nextFrame(); if (dead || !gl) return; packOne(k, texW, ch); }
        await nextFrame(); if (dead || !gl) return;
        layout();
        root.classList.add('is-live');
        readScroll(); shown = target; lastShown = shown;
        firedTo = cues.findLastIndex ? cues.findLastIndex((c) => c.at <= shown) : -1;
        doneFired = shown >= STAGES.end;
        draw();

        const io = new IntersectionObserver((en) => {
            visible = en[0].isIntersecting;
            if (visible) { readScroll(); kick(); }
        }, { rootMargin: '10% 0px' });
        io.observe(root); cleanup.push(() => io.disconnect());
        on(window, 'scroll', () => { if (!visible) return; readScroll(); kick(); }, { passive: true });
        let rt = 0;
        const ro = new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(() => { if (dead || !gl) return; layout(); readScroll(); shown = target; draw(); }, 80); });
        ro.observe(sheet); cleanup.push(() => { ro.disconnect(); clearTimeout(rt); });
        on(document, 'visibilitychange', () => { if (!document.hidden) { readScroll(); kick(); } });
        on(calm, 'change', () => { setRunway(); if (!gl) return; layout(); readScroll(); shown = target; draw(); });
        canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); root.classList.remove('is-live'); });
        canvas.addEventListener('webglcontextrestored', () => {
            tex = {}; texW = 0; U = {};
            if (initGL()) { upload('map', ims.map, false); upload('under', ims.under, true); upload('flow', ims.flow, true); layout(); root.classList.add('is-live'); draw(); }
        });
    }
    start();

    return {
        destroy() {
            dead = true;
            cancelAnimationFrame(raf);
            cleanup.forEach((f) => f()); cleanup = [];
            if (gl) {
                Object.values(tex).forEach((t) => gl.deleteTexture(t));
                if (prog) gl.deleteProgram(prog);
                gl.getExtension('WEBGL_lose_context')?.loseContext();
            }
            Object.values(ims).forEach((b) => b.close?.());
            canvas.remove();
            sheet.style.removeProperty('aspect-ratio');
            root.classList.remove('bp', 'is-live', 'bp-scroll');
            root.style.removeProperty('--bp-runway');
        },
    };
}

/* auto-start */
window.botticelliPrimavera = botticelliPrimavera;
const started = new WeakMap();
function boot() {
    document.querySelectorAll('[data-botticelli-primavera]').forEach((el) => {
        if (!started.has(el)) started.set(el, botticelliPrimavera(el));
    });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
