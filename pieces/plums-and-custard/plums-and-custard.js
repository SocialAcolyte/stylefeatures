/* plums-and-custard — a hand-coloured engraving of fungi, made in front of you as you scroll.
 *
 *   <section data-plums-and-custard data-src="assets/plate.json">
 *     <div class="pc-stage"><img class="pc-img" src="assets/plate.webp" alt="" aria-hidden="true"></div>
 *   </section>
 *
 * James Sowerby, Coloured Figures of English Fungi, tab. 31 (1 July 1796): Agaricus xerampelinus,
 * the "plums and custard" (Tricholomopsis rutilans). The leaf starts bare. The inked copperplate is
 * pulled through the press and the etched line and the plate mark come up under the roller. Then the
 * colourist works pigment by pigment over the whole sheet: crimson on every cap, chrome on every gill,
 * straw on the stems and the cut flesh, brown on the ground, each a flat wash that creeps up to the line
 * wet and dark and dries lighter with a rim, the figures overlapping in time; then the finishing touches
 * all over, stroke by stroke (the gills round the fan). The whole leaf stays in view. Much later an
 * owner pencils the modern name under the plate. The last frame is the scan, pixel for pixel.
 * Scroll back and it un-makes.
 *
 * Everything heavy is offline (see README): the scan split in optical density into the bare leaf, the
 * printed impression, the flat washes and the finishing touches, with maps of when each reaches each point.
 *
 * Options (data-* or the options object, which wins):
 *   src      the plate's JSON (required); images beside it: <name>.webp, -paper, -print, -wash (.webp),
 *            -mapa (lossless, half size: wash, finishing and pencil times), -mapb (lossless: sheet edge,
 *            pencil, line)
 *   mode     'scroll' (default: a pinned stage on a runway) | 'static' (the finished plate)
 *   runway   section height in svh (default 560)
 *   webgl    'off' leaves the finished plate as an image
 *
 * Events (bubbling, for sound later): 'plums-and-custard:stage' {stage} as each pass begins while scrolling
 * forward ('print', 'colour', 'pencil'), and 'plums-and-custard:done' at the end.
 */

const calm = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const NS = 'plums-and-custard';

function loadImage(url) {
    return new Promise((res, rej) => {
        const im = new Image();
        im.decoding = 'async';
        im.onload = () => res(im);
        im.onerror = () => rej(new Error(NS + ': could not load ' + url));
        im.src = url;
    });
}
function loadExact(url) {
    return fetch(url).then((r) => { if (!r.ok) throw new Error(NS + ': could not load ' + url); return r.blob(); })
        .then((b) => createImageBitmap(b, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }));
}

/* ── Paper noise: one tileable 512² RGBA texture, made once ────────────────
 * R fibres   G sizing mottle (how fast a wash runs and dries)   B tooth   A broad, for the sheen */
let noiseCache = null;
function makeNoise() {
    if (noiseCache) return noiseCache;
    const S = 512, out = new Uint8Array(S * S * 4);
    let seed = 9127;
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
    const f1 = lattice(256), f2 = lattice(128), m1 = lattice(8), m2 = lattice(20), m3 = lattice(48),
        t1 = lattice(170), t2 = lattice(64), b1 = lattice(3), b2 = lattice(7);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const u = x / S, v = y / S, k = (y * S + x) * 4;
        out[k] = clamp(f1(u, v) * .6 + f2(u, v) * .4, 0, 1) * 255;
        out[k + 1] = clamp(.5 + (m1(u, v) * .5 + m2(u, v) * .32 + m3(u, v) * .18 - .5) * 1.6, 0, 1) * 255;
        out[k + 2] = clamp(.5 + (t1(u, v) * .55 + t2(u, v) * .3 + rnd() * .15 - .5) * 2.1, 0, 1) * 255;
        out[k + 3] = clamp(b1(u, v) * .65 + b2(u, v) * .35, 0, 1) * 255;
    }
    noiseCache = { S, data: out };
    return noiseCache;
}

const VERT = `attribute vec2 aP; uniform vec2 uStage; varying vec2 vQ;
void main(){ vQ = vec2(aP.x * .5 + .5, .5 - aP.y * .5) * uStage; gl_Position = vec4(aP, 0., 1.); }`;

/* One quad, everything in optical density (linear light), D = -ln(colour / reference paper).
 * The plate splits as  bare leaf + L1 (the print) + L2 (the flat washes) + L3 (finishing touches and pencil),
 * and each pass is shown as it arrives:  D = D_leaf + c1·L1' + c2·L2' + c3·L3'.
 * The pixel is O · exp(-(D - D_O)): when every pass is down and dry it is O exactly. */
const FRAG = `precision highp float;
varying vec2 vQ;
uniform sampler2D uO, uP, uR, uC, uA, uB, uNz;
uniform vec4 uView;        // the sheet in the stage: x, y, w, h (css px)
uniform vec3 uPage, uRef;
uniform float uG;
uniform vec4 uT;           // print front, colour (stage-local), pencil, wet-blur bias (mip levels)
uniform float uDamp;       // the dampened sheet, darker until it dries after the pull
uniform vec2 uIn;          // rows above the leaf's top edge and below its bottom edge (fractions of the scan)

vec3 lin(vec3 c){ return max(pow(max(c, vec3(0.)), vec3(uG)), vec3(1e-6)); }
vec3 dens(vec3 c){ return -log(c / uRef); }
float lum(vec3 d){ return dot(d, vec3(.2126, .7152, .0722)); }

void main(){
  vec2 sp = vQ - uView.xy;
  vec2 uv = sp / uView.zw;
  float inS = min(min(sp.x, uView.z - sp.x), min(sp.y, uView.w - sp.y));
  // the page, with the leaf's tight shadow (light from above)
  vec2 sq = sp - vec2(0., 2.5);
  float ox = max(max(-sq.x, sq.x - uView.z), 0.), oy = max(max(-sq.y, sq.y - uView.w), 0.);
  float dsh = length(vec2(ox, oy));
  vec3 page = inS >= 0. ? uPage : mix(uPage, vec3(.157, .118, .07), .12 * exp(-dsh / 7.) + .09 * exp(-dsh / 1.6));
  if (inS < -1.) { gl_FragColor = vec4(page, 1.); return; }
  vec2 uvc = clamp(uv, vec2(0.), vec2(1.));
  uvc.y = uIn.x + uvc.y * (1. - uIn.x - uIn.y);
  vec4 mb = texture2D(uB, uvc);                 // r the leaf's real edge, g pencil, b engraved line
  float edge = mb.r * clamp(inS + 1., 0., 1.);
  vec3 Ol = lin(texture2D(uO, uvc).rgb), DO = dens(Ol);
  vec3 DP = dens(lin(texture2D(uP, uvc).rgb));
  vec3 DR = dens(lin(texture2D(uR, uvc).rgb));
  vec3 DC = dens(lin(texture2D(uC, uvc).rgb));
  vec3 L1 = DR - DP, L2 = DC - DR, L3 = DO - DC;
  vec4 A = texture2D(uA, uvc) * (255. / 254.);  // wash, finishing, pencil times
  vec2 q = uv * uView.zw;
  vec4 nz1 = texture2D(uNz, q / 512.);
  vec4 nz2 = texture2D(uNz, q / 1400. + .37);
  float nz3 = texture2D(uNz, q / 380. + .61).g;
  float tooth = nz1.b, fib = nz1.r, mott = nz2.g;

  // ── 1. the pull: the roller crosses the sheet top to bottom, the impression comes up behind it ──
  float Ty = uv.y * .94 + .03 + (fib - .5) * .004 + (mott - .5) * .006;
  float c1 = smoothstep(Ty - .004, Ty + .0015, uT.x);
  float fresh = c1 * (1. - smoothstep(Ty + .02, Ty + .35, uT.x));     // fresh ink: a touch blacker, a little gloss
  vec3 L1s = L1 * (1. + .18 * fresh * mb.b);
  // the dampened leaf (intaglio is printed on wet paper): darker under and just after the roller
  float damp = uDamp * smoothstep(Ty - .03, Ty, uT.x) * (1. - smoothstep(Ty + .05, Ty + .55, uT.x));

  // ── 2. the flat washes: a wet front creeping to the line, wet darker and glossy, drying with a rim ──
  float fC = uT.y;
  float Tw = A.r + (mott - .5) * .006 + (nz3 - .5) * .006 + (fib - .5) * .003;
  float c2 = smoothstep(Tw - .0045, Tw + .001, fC);
  float dryAt = Tw + .012 + .03 * mott;
  float g2 = smoothstep(dryAt, dryAt + .028, fC);
  float sh2 = smoothstep(.01, .06, lum(max(L2, 0.)));
  float wet2 = c2 * (1. - g2) * sh2;
  vec3 L2b = dens(lin(texture2D(uC, uvc, uT.w).rgb)) - dens(lin(texture2D(uR, uvc, uT.w).rgb));   // pigment in suspension
  vec3 L2w = mix(L2, max(L2b, 0.) * sh2, .6) * 1.28;
  float bead = c2 * exp(-max(fC - A.r, 0.) / .004) * (1. - g2);          // the bead at the moving front
  float b2 = 4. * g2 * (1. - g2);
  vec3 L2s = mix(L2w, L2, g2) * (1. + .5 * bead) + b2 * max(L2 - L2b, 0.) * .9 + b2 * (tooth - .5) * .3 * L2;

  // ── 3. finishing touches, stroke by stroke, wet-on-dry; then (much later) the pencil ──
  float Tf = A.g + (mott - .5) * .005 + (nz3 - .5) * .004 + (fib - .5) * .002;
  float c3 = smoothstep(Tf - .0035, Tf + .001, fC);
  float g3 = smoothstep(Tf + .006, Tf + .022 + .01 * mott, fC);
  float sh3 = smoothstep(.02, .1, lum(max(L3, 0.)));
  float wet3 = c3 * (1. - g3) * sh3 * (1. - mb.g) * .5;     // small touches wet-on-dry: little water, little gloss
  vec3 L3s = mix(L3 * 1.22, L3, g3);
  float Tn = A.b + (fib - .5) * .01;
  float c4 = smoothstep(Tn - .008, Tn + .001, uT.z);
  vec3 L3t = mix(c3 * L3s, c4 * L3, mb.g);

  vec3 D = DP + c1 * L1s + c2 * L2s + L3t;
  vec3 col = Ol * exp(-(D - DO));
  float wet = max(wet2, wet3);
  col *= 1. - .05 * wet - .045 * damp;
  float sheen = smoothstep(.45, .9, texture2D(uNz, q / 2600. + vec2(.13, .71)).a) * (.55 + .45 * fib);
  col = mix(col, vec3(1., .995, .985), wet * (.03 + .16 * sheen) + fresh * mb.b * .05 * sheen);
  vec3 s = pow(max(col, vec3(0.)), vec3(1. / uG));
  gl_FragColor = vec4(mix(page, s, edge), 1.);
}`;

function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    return sh;
}

export function plumsAndCustard(root, opts = {}) {
    const ds = root.dataset;
    const o = {
        src: opts.src ?? ds.src,
        mode: opts.mode ?? ds.mode ?? 'scroll',
        runway: +(opts.runway ?? ds.runway ?? 560),
        webgl: (opts.webgl ?? ds.webgl ?? 'on') !== 'off' && opts.webgl !== false,
    };
    if (!o.src) return () => {};
    const base = o.src.replace(/\.json$/, '');
    const stage = root.querySelector('.pc-stage') || root;
    let dead = false, cleanup = [];
    const on = (t, ev, fn, opt) => { t.addEventListener(ev, fn, opt); cleanup.push(() => t.removeEventListener(ev, fn, opt)); };
    root.classList.add('pc');
    const still = () => calm.matches || o.mode === 'static' || !o.webgl;
    if (still()) root.classList.add('pc-still');

    const canvas = document.createElement('canvas');
    canvas.className = 'pc-canvas';
    canvas.setAttribute('aria-hidden', 'true');

    let meta, ims = {}, st = null;
    let gl = null, prog = null, U = {}, tex = {};
    let dpr = 1, texW = 0;
    let target = 0, shown = 0, vel = 0, visible = false, raf = 0, last = 0, lastShown = -1;
    const fired = new Set();

    let fit = { x: 0, y: 0, w: 0, h: 0 }, stg = { w: 0, h: 0 }, mips = false;
    function layout() {
        const r = stage.getBoundingClientRect();
        const cs = getComputedStyle(stage);
        const pl = parseFloat(cs.paddingLeft), pr = parseFloat(cs.paddingRight), pt = parseFloat(cs.paddingTop), pb = parseFloat(cs.paddingBottom);
        const H = root.classList.contains('pc-scroll') ? innerHeight : (r.height || innerHeight);
        stg = { w: Math.max(120, Math.round(r.width)), h: Math.max(120, Math.round(H)) };
        const availW = Math.max(100, stg.w - pl - pr), availH = Math.max(100, stg.h - pt - pb);
        const scale = Math.min(availW / meta.w, availH / meta.h, 1);
        fit = { w: meta.w * scale, h: meta.h * scale };
        fit.x = pl + (availW - fit.w) / 2; fit.y = pt + (availH - fit.h) / 2;
        dpr = Math.min(2, devicePixelRatio || 1);
        canvas.style.width = stg.w + 'px'; canvas.style.height = stg.h + 'px';
        canvas.width = Math.round(stg.w * dpr); canvas.height = Math.round(stg.h * dpr);
        const want = Math.min(meta.w, Math.round(fit.w * dpr));
        gl.viewport(0, 0, canvas.width, canvas.height);
        if (Math.abs(want - texW) > 2) pack(want, Math.round(want * meta.h0 / meta.w));
    }
    // the whole leaf stays in view, always: no zoom, no camera
    const viewAt = () => [fit.x, fit.y, fit.w, fit.h];

    // The pictures are resampled to the size they are shown at and mipmapped (WebGL2): the mips give the
    // soft look of pigment in suspension. The maps go up once at their own size, exact, sampled linearly.
    function setTex(img, mip) {
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        if (mip) gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    function pack(w, h) {
        texW = w;
        for (const k of ['mapa', 'mapb']) {
            if (tex[k]) continue;
            tex[k] = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex[k]); setTex(ims[k], false);
        }
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        const cx = cv.getContext('2d');
        for (const k of ['orig', 'paper', 'print', 'wash']) {
            cx.clearRect(0, 0, w, h);
            cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
            cx.drawImage(ims[k], 0, 0, w, h);
            if (!tex[k]) tex[k] = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, tex[k]);
            setTex(cv, mips);
        }
        cv.width = cv.height = 0;
    }

    const TEX = ['orig', 'paper', 'print', 'wash', 'mapa', 'mapb', 'nz'];
    const UNI = ['uO', 'uP', 'uR', 'uC', 'uA', 'uB', 'uNz'];
    function initGL() {
        const ca = { alpha: false, antialias: false, preserveDrawingBuffer: false };
        const g2 = canvas.getContext('webgl2', ca);
        const g = g2 || canvas.getContext('webgl', ca);
        if (!g) return false;
        gl = g; mips = !!g2;
        try {
            prog = gl.createProgram();
            gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
            gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
            gl.linkProgram(prog);
            if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
        } catch (err) { console.warn(NS + ': shader failed', err); gl = null; return false; }
        gl.useProgram(prog);
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        tex.buf = buf;
        const loc = gl.getAttribLocation(prog, 'aP');
        gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        for (const n of [...UNI, 'uStage', 'uView', 'uPage', 'uRef', 'uG', 'uT', 'uDamp', 'uIn']) U[n] = gl.getUniformLocation(prog, n);
        const nz = makeNoise();
        tex.nz = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex.nz);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, nz.S, nz.S, 0, gl.RGBA, gl.UNSIGNED_BYTE, nz.data);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        UNI.forEach((n, i) => gl.uniform1i(U[n], i));
        gl.uniform3fv(U.uRef, meta.paper.map((v) => Math.pow(v, meta.gamma)));
        gl.uniform1f(U.uG, meta.gamma);
        const ins = meta.inset || [0, 0];
        gl.uniform2f(U.uIn, ins[0], ins[1]);
        return true;
    }

    let pageRGB = null;
    function pageColour() {
        if (pageRGB) return pageRGB;
        const m = getComputedStyle(root).backgroundColor.match(/[\d.]+/g) || [243, 240, 232];
        pageRGB = m.slice(0, 3).map((v) => +v / 255);
        return pageRGB;
    }

    // stage-local time; a little overshoot so every front has passed and dried by the stage's end
    const loc = (k, S, end = 1) => ((S - st[k][0]) / (st[k][1] - st[k][0])) * end;
    const STAGES = ['print', 'colour', 'pencil'];
    function draw() {
        const S = shown;
        TEX.forEach((k, i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, tex[k]); });
        const view = viewAt(S);
        gl.uniform2f(U.uStage, stg.w, stg.h);
        gl.uniform4f(U.uView, ...view);
        gl.uniform3fv(U.uPage, pageColour());
        // pigment in suspension: about 5 css px of softness at any zoom, as a mip bias
        const bias = mips ? clamp(Math.log2(5 * dpr * texW / view[2]), 0, 6) : 0;
        gl.uniform4f(U.uT, clamp(loc('print', S, 1.06), -1, 2), clamp(loc('colour', S, 1.06), -1, 2), clamp(loc('pencil', S, 1.03), -1, 2), bias);
        gl.uniform1f(U.uDamp, 1 - smooth(st.colour[0] - .03, st.colour[0] + .01, S));
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        if (S > lastShown) {
            for (const k of STAGES) {
                if (!fired.has(k) && S >= st[k][0]) { fired.add(k); root.dispatchEvent(new CustomEvent(NS + ':stage', { bubbles: true, detail: { stage: k } })); }
            }
            if (!fired.has('done') && S >= st.pencil[1]) { fired.add('done'); root.dispatchEvent(new CustomEvent(NS + ':done', { bubbles: true })); }
        } else {
            for (const k of STAGES) if (S < st[k][0]) fired.delete(k);
            if (S < st.pencil[1]) fired.delete('done');
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
    function kick() { if (!raf && !dead) raf = requestAnimationFrame(frame); }

    function readScroll() {
        const r = root.getBoundingClientRect();
        const run = r.height - innerHeight;
        target = run > 0 ? clamp(-r.top / run) : 1;
    }

    let live = false;
    async function start() {
        if (still()) return;                        // the finished plate, as an image
        try {
            meta = await (await fetch(o.src)).json();
            const [orig, paper, print, wash, mapa, mapb] = await Promise.all([
                loadImage(base + '.webp'), loadImage(base + '-paper.webp'), loadImage(base + '-print.webp'),
                loadImage(base + '-wash.webp'), loadExact(base + '-mapa.webp'), loadExact(base + '-mapb.webp')]);
            ims = { orig, paper, print, wash, mapa, mapb };
        } catch (err) { console.warn(err); return; }
        if (dead || still()) return;
        st = meta.stages;
        meta.h0 = meta.h; meta.h = Math.round(meta.h0 * (1 - (meta.inset ? meta.inset[0] + meta.inset[1] : 0)));
        root.classList.add('pc-scroll');
        root.style.setProperty('--pc-runway', o.runway + 'svh');
        stage.appendChild(canvas);
        if (!initGL()) { canvas.remove(); root.classList.remove('pc-scroll'); root.style.removeProperty('--pc-runway'); return; }
        layout();
        root.classList.add('is-live'); live = true;
        readScroll(); shown = target; lastShown = shown;
        for (const k of STAGES) if (shown >= st[k][0]) fired.add(k);
        if (shown >= st.pencil[1]) fired.add('done');
        draw();

        const io = new IntersectionObserver((en) => {
            visible = en[0].isIntersecting;
            if (visible) { readScroll(); kick(); }
        }, { rootMargin: '10% 0px' });
        io.observe(root); cleanup.push(() => io.disconnect());
        on(window, 'scroll', () => { if (!visible) return; readScroll(); kick(); }, { passive: true });
        let rt = 0;
        const ro = new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(() => { if (dead || !gl) return; layout(); readScroll(); shown = target; draw(); }, 80); });
        ro.observe(stage); cleanup.push(() => { ro.disconnect(); clearTimeout(rt); });
        on(document, 'visibilitychange', () => { if (!document.hidden) kick(); });
        canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); root.classList.remove('is-live'); });
        canvas.addEventListener('webglcontextrestored', () => {
            tex = {}; texW = 0; U = {};
            if (initGL()) { layout(); root.classList.add('is-live'); draw(); }
        });
    }
    // reduced motion switched on mid-visit: settle on the finished plate
    on(calm, 'change', () => {
        if (calm.matches && live) { root.classList.add('pc-still'); root.classList.remove('pc-scroll', 'is-live'); root.style.removeProperty('--pc-runway'); }
        else if (!calm.matches && live) { root.classList.remove('pc-still'); root.classList.add('pc-scroll', 'is-live'); root.style.setProperty('--pc-runway', o.runway + 'svh'); pageRGB = null; layout(); readScroll(); shown = target; draw(); }
        else if (!calm.matches && !live && o.mode !== 'static' && o.webgl) { root.classList.remove('pc-still'); start(); }
    });
    start();

    function destroy() {
        dead = true;
        cancelAnimationFrame(raf);
        cleanup.forEach((f) => f()); cleanup = [];
        if (gl) {
            Object.values(tex).forEach((t) => (t instanceof WebGLTexture ? gl.deleteTexture(t) : gl.deleteBuffer(t)));
            if (prog) gl.deleteProgram(prog);
            gl.getExtension('WEBGL_lose_context')?.loseContext();
        }
        ims.mapa?.close?.(); ims.mapb?.close?.();
        canvas.remove();
        root.classList.remove('pc', 'is-live', 'pc-scroll', 'pc-still');
        root.style.removeProperty('--pc-runway');
    }
    // for tests and tools: set the progress directly (0-1), bypassing the scroll
    destroy.seek = (p) => { if (!gl) return; target = shown = clamp(p); vel = 0; draw(); };
    return destroy;
}

/* auto-start */
const started = new WeakMap();
function boot() {
    document.querySelectorAll('[data-plums-and-custard]').forEach((el) => {
        if (!started.has(el)) { const d = plumsAndCustard(el); started.set(el, d); el.__pc = d; }
    });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
