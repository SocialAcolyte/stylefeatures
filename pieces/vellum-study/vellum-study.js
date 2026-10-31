/* vellum-study — a botanical watercolour on vellum, painted in layers as you scroll.
 *
 *   <section data-vellum-study data-src="assets/waratah.json">
 *     <div class="vs-stage"><img class="vs-img" src="assets/waratah.webp" alt="" aria-hidden="true"></div>
 *   </section>
 *
 * The sheet starts as bare vellum with a graphite underdrawing on it, and is painted the
 * way the botanical painters of the Jardin du Roi worked on calfskin: thin transparent
 * washes laid object by object (on vellum the water stands on the skin instead of
 * sinking in, so a wash is a glossy pool with a hard, beaded edge that dries with its
 * pigment pooled at the rim); then body colour, opaque with lead white, laid in touches
 * for the lights; then the miniaturist's finish, thousands of hair-fine strokes with a
 * small brush, region by region along the curve of each form, until the flat wash turns
 * into a flower; last the gold frame ruled round the sheet and the signature.
 * The last frame is the painting itself, pixel for pixel. Scroll back and it un-paints.
 *
 * Everything heavy is offline (see README): the painting split into bare vellum, a first
 * wash, the wash with its body colour, a graphite drawing, and a map of when each layer
 * reaches each point of the sheet.
 *
 * Options (data-* or the options object, which wins):
 *   src      the painting's JSON (required); images are <name>.webp, -bare, -wash, -body,
 *            -lines and -map (.webp) beside it
 *   mode     'scroll' (default: a pinned stage on a runway) | 'static' (the finished painting)
 *   runway   section height in svh (default: the JSON's, 380)
 *   webgl    'off' leaves the finished painting as an image
 *
 * Events (bubbling, for sound later): 'vellum-study:stage' {stage} as each layer begins
 * while scrolling forward ('wash', 'body', 'hatch', 'gold'), and 'vellum-study:done'.
 */

const calm = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

function loadImage(url) {
    return new Promise((res, rej) => {
        const im = new Image();
        im.decoding = 'async';
        im.onload = () => res(im);
        im.onerror = () => rej(new Error('vellum-study: could not load ' + url));
        im.src = url;
    });
}
function loadExact(url) {
    return fetch(url).then((r) => { if (!r.ok) throw new Error('vellum-study: could not load ' + url); return r.blob(); })
        .then((b) => createImageBitmap(b, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }));
}

/* ── Surface noise: one tileable 512² RGBA texture, made once ──────────────
 * R  fine speckle   G  mid mottle (how unevenly a pool dries)
 * B  the skin's grain   A  broad, for the sheen of standing water */
let noiseCache = null;
function makeNoise() {
    if (noiseCache) return noiseCache;
    const S = 512, out = new Uint8Array(S * S * 4);
    let seed = 5309;
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
    const f1 = lattice(256), f2 = lattice(128), m1 = lattice(8), m2 = lattice(20), m3 = lattice(48), t1 = lattice(170), t2 = lattice(64), b1 = lattice(3), b2 = lattice(7);
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

/* One quad. Everything is in optical density (linear light): D = -ln(colour / paper).
 * The layers are nested:  bare vellum -> first wash (W) -> wash with body colour (B) -> the
 * painting (O), each arriving per pixel from its time map:
 *   D = mix(mix(mix(D_bare, W', cw), B', cb), D_O, max(ch, cg))
 * and the pixel is O · exp(-(D - D_O)), so when every layer is down and dry it is O exactly. */
const FRAG = `precision highp float;
varying vec2 vQ;
uniform sampler2D uO, uBare, uW, uB, uMod, uL, uM, uNz;
uniform vec4 uView;        // the sheet in the stage: x, y, w, h (css px, camera applied)
uniform vec3 uPage, uPaper;
uniform float uG;          // the gamma used to go to linear light
uniform vec4 uT;           // local times: wash, body colour, strokes, gold
uniform vec2 uU;           // wet-blur bias (mip levels), asset px per css px

vec3 lin(vec3 c){ return max(pow(max(c, vec3(0.)), vec3(uG)), vec3(1e-6)); }
vec3 dens(vec3 c){ return -log(c / uPaper); }
float lum(vec3 d){ return dot(d, vec3(.2126, .7152, .0722)); }

void main(){
  vec2 sp = vQ - uView.xy;
  vec2 uv = sp / uView.zw;
  // the skin cockles a little: the sheet's edge wanders by a hair and its shadow lifts in places
  float along = (uv.x + uv.y) * 3.1;
  float lift = .5 + .5 * sin(along * 2.3 + 1.7) * sin(along * 0.9 + .4);
  float wob = (sin(uv.y * 41. + 1.3) * .35 + sin(uv.x * 37. + .4) * .35 + sin((uv.x + uv.y) * 13.) * .3) * .5;
  float inS = min(min(sp.x, uView.z - sp.x), min(sp.y, uView.w - sp.y)) + wob;
  // the page, with the sheet's tight shadow (light from above, a little to the left)
  vec2 sq = sp - vec2(-.6, 2.2 + 1.6 * lift);
  float ox = max(max(-sq.x, sq.x - uView.z), 0.), oy = max(max(-sq.y, sq.y - uView.w), 0.);
  float dsh = length(vec2(ox, oy));
  vec3 page = mix(uPage, vec3(.157, .118, .07), (.10 + .05 * lift) * exp(-dsh / (5. + 5. * lift)) + .1 * exp(-dsh / 1.4));
  if (inS < -1.) { gl_FragColor = vec4(page, 1.); return; }
  float edge = clamp(inS + .5, 0., 1.);
  vec2 uvc = clamp(uv, vec2(0.), vec2(1.));
  vec3 o = texture2D(uO, uvc).rgb;
  vec3 Ol = lin(o);
  vec3 DO = dens(Ol);
  vec4 ln = texture2D(uL, uvc);                  // r graphite, g body-colour opacity, b when the fine strokes arrive
  vec4 M = texture2D(uM, uvc) * (255. / 254.);   // times: wash, body colour (dab by dab), broad strokes, gold
  vec2 q = uv * uView.zw;                          // css px on the sheet: noise scale
  vec4 nz1 = texture2D(uNz, q / 512.);
  vec4 nz2 = texture2D(uNz, q / 1400. + .37);
  float nz3 = texture2D(uNz, q / 380. + .61).g;
  float grain = nz1.b, fib = nz1.r, mott = nz2.g;
  float pxA = uU.y;

  vec3 Db = dens(lin(texture2D(uBare, uvc).rgb));
  vec3 DW = dens(lin(texture2D(uW, uvc).rgb));
  vec3 DB = dens(lin(texture2D(uB, uvc).rgb));

  // ── 1. the washes: water stands on the skin; a glossy pool with a hard, beaded edge ──
  float fW = uT.x;
  float Tw = M.r + (mott - .5) * .02 + (fib - .5) * .008 + (nz3 - .5) * .012;
  float cw = smoothstep(Tw - .006, Tw + .0015, fW);
  vec3 DWs = dens(lin(texture2D(uW, uvc, uU.x).rgb));            // pigment in suspension: fused
  float rimE = smoothstep(.0, .12, lum(DW - DWs));                // where the dry wash has its tide line
  float dryAt = Tw + .09 + (mott - .5) * .09 - .045 * rimE;       // edges first, islands last
  float gw = smoothstep(dryAt, dryAt + .06, fW);
  float wetW = cw * (1. - gw);
  vec3 LW = DW - Db;
  vec3 LWw = mix(DWs - Db, LW, .35) * 1.28;
  float bead = cw * exp(-max(fW - Tw, 0.) / .008) * (1. - gw);   // the meniscus at the advancing edge
  float bw = 4. * gw * (1. - gw);
  vec3 LWs = mix(LWw, LW, gw) * (1. + .7 * bead + bw * (.55 * rimE - .08) + bw * (grain - .5) * .25);
  vec3 D = Db + cw * LWs;

  // ── 2. body colour: opaque dabs of lead white and pigment over the wash, touch by touch ──
  float fB = uT.y;
  float Tb = M.g + (fib - .5) * .004;
  float ab = ln.g;
  float cb = smoothstep(Tb - .003, Tb + .0006, fB) * ab;
  float gb = smoothstep(Tb + .008, Tb + .06, fB);
  vec3 DBs = mix(DB * 1.16 + .03, DB, gb);                          // wet gouache is darker, dries pale and matte
  D = mix(D, DBs, cb);
  float wetB = cb * (1. - gb);
  // the paint stands a hair proud of the skin: lit on its upper left edge, shaded lower right
  vec2 o1 = vec2(1.1) / uView.zw;
  float relief = (texture2D(uL, uvc - o1).g - texture2D(uL, uvc + o1).g) * cb * gb;

  // ── 3. the strokes: broad ones lay in the modelling, hair-fine ones bring it into focus ──
  float fH = uT.z;
  float Tl = M.b;
  float cl = smoothstep(Tl - .0025, Tl + .0005, fH);
  float Tf = ln.b * (255. / 254.);
  float cf = smoothstep(Tf - .0025, Tf + .0005, fH);
  vec3 DM = dens(lin(texture2D(uMod, uvc).rgb));
  float freshL = cl * (1. - smoothstep(Tl + .002, Tl + .025, fH));
  float freshF = cf * (1. - smoothstep(Tf + .002, Tf + .025, fH));
  D = mix(D, DM + freshL * .12 * max(DM - D, vec3(0.)), cl);
  // ── 4. the gold ruled round the sheet ──
  float fG = uT.w;
  float Tg = M.a;
  float cg = smoothstep(Tg - .004, Tg + .0008, fG);
  float cO = max(cf, cg);
  vec3 DOs = DO + freshF * .16 * max(DO - D, vec3(0.));            // a stroke is a shade darker while wet
  D = mix(D, DOs, cO);
  float fresh = max(freshL, freshF);

  vec3 col = Ol * exp(-(D - DO));
  // standing water: a touch darker, and the window caught in it
  float wet = max(wetW, wetB * .7);
  col *= 1. - .045 * wet;
  float sheen = smoothstep(.42, .88, texture2D(uNz, q / 2400. + vec2(.13, .71)).a) * (.55 + .45 * fib);
  col = mix(col, vec3(1., .996, .99), wet * (.04 + .22 * sheen) + fresh * .05 * sheen);
  col *= 1. + relief * .07 * (1. - max(cl, cO));
  // graphite: shows through a transparent wash, hidden by body colour, worked over by the strokes
  float pen = ln.r * (1. - .25 * cw) * (1. - cb) * (1. - max(cl, cO)) * (.78 + .34 * grain);
  col *= 1. - pen * vec3(.8, .8, .77);
  vec3 s = pow(max(col, vec3(0.)), vec3(1. / uG));
  gl_FragColor = vec4(mix(page, s, edge), 1.);
}`;

function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    return sh;
}

export function vellumStudy(root, opts = {}) {
    const ds = root.dataset;
    const o = {
        src: opts.src ?? ds.src,
        mode: opts.mode ?? ds.mode ?? 'scroll',
        runway: opts.runway ?? ds.runway,
        webgl: (opts.webgl ?? ds.webgl ?? 'on') !== 'off' && opts.webgl !== false,
    };
    if (!o.src) return () => {};
    const base = o.src.replace(/\.json$/, '');
    const stage = root.querySelector('.vs-stage') || root;
    let dead = false, cleanup = [];
    const on = (t, ev, fn, opt) => { t.addEventListener(ev, fn, opt); cleanup.push(() => t.removeEventListener(ev, fn, opt)); };
    root.classList.add('vs');
    const still = () => calm.matches || o.mode === 'static' || !o.webgl;
    if (still()) root.classList.add('vs-still');

    const canvas = document.createElement('canvas');
    canvas.className = 'vs-canvas';
    canvas.setAttribute('aria-hidden', 'true');

    let meta, ims = {}, st = null, runway = 380;
    let gl = null, prog = null, U = {}, tex = {};
    let dpr = 1, texW = 0;
    let target = 0, shown = 0, vel = 0, visible = false, raf = 0, last = 0, lastShown = -1;
    const fired = new Set();
    const STAGES = ['wash', 'body', 'hatch', 'gold'];

    /* ── the camera (narrow screens): follow the brush, as a function of scroll only ── */
    let cam = null;
    function buildCamera() {
        const n = 600, fx = new Float32Array(n + 1), fy = new Float32Array(n + 1);
        const tr = meta.cam;
        let lx = .5, ly = .35;
        for (let j = 0; j <= n; j++) {
            const s = j / n, k = Math.min(tr.length - 1, Math.round(s * (tr.length - 1)));
            if (tr[k][1] != null) { lx = tr[k][1]; ly = tr[k][2]; }
            fx[j] = lx; fy[j] = ly;
        }
        // before the first stroke, look where the first wash will go
        const first = tr.findIndex((r) => r[1] != null);
        for (let j = 0; j <= n && first >= 0 && j / n < tr[first][0]; j++) { fx[j] = tr[first][1]; fy[j] = tr[first][2]; }
        const sm = (a) => {
            const o2 = new Float32Array(a.length), r = 36;
            for (let j = 0; j < a.length; j++) {
                let s2 = 0, w2 = 0;
                for (let k = -r; k <= r; k++) {
                    const jj = clamp(j + k, 0, a.length - 1), w = Math.exp(-(k * k) / (2 * 12 * 12));
                    s2 += a[jj] * w; w2 += w;
                }
                o2[j] = s2 / w2;
            }
            return o2;
        };
        cam = { n, fx: sm(fx), fy: sm(fy) };
    }
    function camAt(S) {
        const j = clamp(S) * cam.n, j0 = Math.floor(j), j1 = Math.min(cam.n, j0 + 1), t = j - j0;
        // a little closer for the washes and the body colour, close for the fine strokes, the whole
        // sheet again for the gold frame and the end
        const zin = smooth(.004, st.wash[0] + .02, S), zh = smooth(st.body[1] - .03, st.hatch[0] + .01, S);
        const zout = smooth(st.hatch[1] - .01, st.gold[0] + .004, S);
        const z = (1 + (zA - 1) * zin + (zH - zA) * zh) * (1 - zout) + zout;
        return { x: cam.fx[j0] + (cam.fx[j1] - cam.fx[j0]) * t, y: cam.fy[j0] + (cam.fy[j1] - cam.fy[j0]) * t, z };
    }

    let fit = { x: 0, y: 0, w: 0, h: 0 }, stg = { w: 0, h: 0 }, zA = 1, zH = 1, mips = false;
    function layout() {
        const r = stage.getBoundingClientRect();
        const cs = getComputedStyle(stage);
        const pl = parseFloat(cs.paddingLeft), pr = parseFloat(cs.paddingRight), pt = parseFloat(cs.paddingTop), pb = parseFloat(cs.paddingBottom);
        const H = root.classList.contains('vs-scroll') ? innerHeight : (r.height || innerHeight);
        stg = { w: Math.max(120, Math.round(r.width)), h: Math.max(120, Math.round(H)) };
        const availW = Math.max(100, stg.w - pl - pr), availH = Math.max(100, stg.h - pt - pb);
        const scale = Math.min(availW / meta.w, availH / meta.h, 1);
        fit = { w: meta.w * scale, h: meta.h * scale };
        fit.x = pl + (availW - fit.w) / 2; fit.y = pt + (availH - fit.h) / 2;
        // on a narrow screen the sheet fills the width: go a little closer for the washes, and
        // close (about twice) for the fine strokes, so the brushwork can be seen
        const narrow = mips && stg.w < 760;
        zA = narrow ? clamp((stg.h * .92) / fit.h, 1, 1.4) : 1;
        zH = narrow ? 2.15 : 1;
        if (zA < 1.08) zA = 1;
        dpr = Math.min(2, devicePixelRatio || 1);
        canvas.style.width = stg.w + 'px'; canvas.style.height = stg.h + 'px';
        canvas.width = Math.round(stg.w * dpr); canvas.height = Math.round(stg.h * dpr);
        const want = Math.min(meta.w, Math.round(fit.w * Math.max(zA, zH) * dpr));
        gl.viewport(0, 0, canvas.width, canvas.height);
        if (Math.abs(want - texW) > 2) pack(want, Math.round(want * meta.h / meta.w));
    }
    function viewAt(S) {
        if (zH === 1 && zA === 1) return [fit.x, fit.y, fit.w, fit.h];
        const c = camAt(S), w = fit.w * c.z, h = fit.h * c.z;
        const m = Math.min(fit.x, 8);
        const place = (stageLen, len, f) => len <= stageLen - 2 * m ? (stageLen - len) / 2 : clamp(stageLen / 2 - f * len, stageLen - m - len, m);
        return [place(stg.w, w, c.x), place(stg.h, h, c.y), w, h];
    }

    // The pictures are resampled on the CPU to the size they are shown at (good downsampling,
    // so the graphite and the fine strokes never alias) and mipmapped (WebGL2): the mips give
    // the fused look of pigment in suspension and keep the zoomed-out sheet clean.
    // The time map goes up once at its own size, exact, and is sampled linearly.
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
        if (!tex.map) { tex.map = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex.map); setTex(ims.map, false); }
        // the lines carry the fine strokes' times as well as the graphite: up exact, at full size
        if (!tex.lines) { tex.lines = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex.lines); setTex(ims.lines, mips); }
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        const cx = cv.getContext('2d');
        for (const k of ['orig', 'bare', 'wash', 'body', 'model']) {
            cx.clearRect(0, 0, w, h);
            cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
            cx.drawImage(ims[k], 0, 0, w, h);
            if (!tex[k]) tex[k] = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, tex[k]);
            setTex(cv, mips);
        }
        cv.width = cv.height = 0;
    }

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
        } catch (err) { console.warn('vellum-study: shader failed', err); gl = null; return false; }
        gl.useProgram(prog);
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        tex.buf = buf;
        const loc = gl.getAttribLocation(prog, 'aP');
        gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        for (const n of ['uO', 'uBare', 'uW', 'uB', 'uMod', 'uL', 'uM', 'uNz', 'uStage', 'uView', 'uPage', 'uPaper', 'uG', 'uT', 'uU']) U[n] = gl.getUniformLocation(prog, n);
        const nz = makeNoise();
        tex.nz = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex.nz);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, nz.S, nz.S, 0, gl.RGBA, gl.UNSIGNED_BYTE, nz.data);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        ['uO', 'uBare', 'uW', 'uB', 'uMod', 'uL', 'uM', 'uNz'].forEach((n, i) => gl.uniform1i(U[n], i));
        gl.uniform3fv(U.uPaper, meta.paper.map((v) => Math.pow(v, meta.gamma)));
        gl.uniform1f(U.uG, meta.gamma);
        return true;
    }

    let pageRGB = null;
    function pageColour() {
        if (pageRGB) return pageRGB;
        const m = getComputedStyle(root).backgroundColor.match(/[\d.]+/g) || [243, 240, 232];
        pageRGB = m.slice(0, 3).map((v) => +v / 255);
        return pageRGB;
    }

    // a stage's local time: 0 when it begins, 1 when its last pixel is reached (and a little beyond)
    const loc = (k, S) => clamp((S - st[k][0]) / (st[k][1] - st[k][0]), -1, 1.6);
    function draw() {
        const S = shown;
        ['orig', 'bare', 'wash', 'body', 'model', 'lines', 'map', 'nz'].forEach((k, i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, tex[k]); });
        const view = viewAt(S);
        gl.uniform2f(U.uStage, stg.w, stg.h);
        gl.uniform4f(U.uView, ...view);
        gl.uniform3fv(U.uPage, pageColour());
        // pigment in suspension as a mip bias: about 4 css px at any zoom
        const bias = mips ? clamp(Math.log2(4 * dpr * (texW / view[2]) / dpr), 0, 5) : 0;
        gl.uniform4f(U.uT, loc('wash', S), loc('body', S), loc('hatch', S), loc('gold', S));
        gl.uniform2f(U.uU, bias, meta.w / view[2]);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        if (S > lastShown) {
            for (const k of STAGES) {
                if (!fired.has(k) && S >= st[k][0]) { fired.add(k); root.dispatchEvent(new CustomEvent('vellum-study:stage', { bubbles: true, detail: { stage: k } })); }
            }
            if (!fired.has('done') && S >= st.gold[1]) { fired.add('done'); root.dispatchEvent(new CustomEvent('vellum-study:done', { bubbles: true })); }
        } else {
            for (const k of STAGES) if (S < st[k][0]) fired.delete(k);
            if (S < st.gold[1]) fired.delete('done');
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
    const setRunway = () => { root.classList.add('vs-scroll'); root.style.setProperty('--vs-runway', runway + 'svh'); };
    const dropRunway = () => { root.classList.remove('vs-scroll', 'is-live'); root.style.removeProperty('--vs-runway'); };

    let live = false;
    async function start() {
        if (still()) return;                        // the finished painting, as an image
        try {
            meta = await (await fetch(o.src)).json();
            const [orig, bare, wash, body, model, lines, map] = await Promise.all([
                loadImage(base + '.webp'), loadImage(base + '-bare.webp'), loadImage(base + '-wash.webp'),
                loadImage(base + '-body.webp'), loadImage(base + '-model.webp'), loadExact(base + '-lines.webp'), loadExact(base + '-map.webp')]);
            ims = { orig, bare, wash, body, model, lines, map };
        } catch (err) { console.warn(err); return; }
        if (dead || still()) return;
        st = meta.stages;
        runway = +(o.runway ?? meta.runway ?? 380);
        setRunway();
        stage.appendChild(canvas);
        if (!initGL()) { canvas.remove(); dropRunway(); return; }
        buildCamera();
        layout();
        root.classList.add('is-live'); live = true;
        readScroll(); shown = target; lastShown = shown;
        for (const k of STAGES) if (shown >= st[k][0]) fired.add(k);
        if (shown >= st.gold[1]) fired.add('done');
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
    // reduced motion switched on mid-visit: settle on the finished painting
    on(calm, 'change', () => {
        if (calm.matches && live) { root.classList.add('vs-still'); dropRunway(); }
        else if (!calm.matches && live) { root.classList.remove('vs-still'); setRunway(); root.classList.add('is-live'); pageRGB = null; layout(); readScroll(); shown = target; draw(); }
        else if (!calm.matches && !live && o.mode !== 'static' && o.webgl) { root.classList.remove('vs-still'); start(); }
    });
    start();

    return function destroy() {
        dead = true;
        cancelAnimationFrame(raf);
        cleanup.forEach((f) => f()); cleanup = [];
        if (gl) {
            Object.values(tex).forEach((t) => (t instanceof WebGLTexture ? gl.deleteTexture(t) : gl.deleteBuffer(t)));
            if (prog) gl.deleteProgram(prog);
            gl.getExtension('WEBGL_lose_context')?.loseContext();
        }
        ims.map?.close?.(); ims.lines?.close?.();
        canvas.remove();
        root.classList.remove('vs', 'is-live', 'vs-scroll', 'vs-still');
        root.style.removeProperty('--vs-runway');
    };
}

/* auto-start */
const started = new WeakMap();
function boot() {
    document.querySelectorAll('[data-vellum-study]').forEach((el) => {
        if (!started.has(el)) started.set(el, vellumStudy(el));
    });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
