/* coral-reef — Saville-Kent's Great Barrier Reef corals (Chromo V, 1893) printed as you scroll,
 * stone by stone, the way Riddle & Couchman printed it.
 *
 *   <section data-coral-reef data-src="assets/reef.json">
 *     <div class="cr-stage"><img class="cr-img" src="assets/reef.webp" alt="" aria-hidden="true"></div>
 *   </section>
 *
 * The sheet starts as bare plate paper. The key goes through the press first (the outlines, the
 * numerals, the frame line and the lettering in the plate's brown-crimson), then one stone per ink,
 * lightest first: chrome yellow, buff, the olive and ochre yellows, the blue-green, the greys, the
 * vermilion, then the crimsons and red-browns that model the brain corals, darkest last. Each stone
 * prints along the scraper's line as the press bed travels: a slightly uneven front moves down the
 * sheet, the fresh ink a touch deeper and oily for a moment, then matte. Everywhere a stone has not
 * printed, its ink is absent. The last frame is the scan of the plate, pixel for pixel. Scroll back
 * and the plate un-prints.
 *
 * Everything heavy is offline (see README): the scan unmixed in optical density into the plate's own
 * inks (one coverage map per stone, packed three to a lossless WebP), a time map for the scraper's
 * line, and the stone list (ink colours, scales) in the JSON.
 *
 * Options (data-* or the options object, which wins):
 *   src      the plate's JSON (required)
 *   mode     'scroll' (default: a pinned stage on a runway) | 'static' (the finished plate)
 *   runway   section height in svh (default 560)
 *   webgl    'off' leaves the finished plate as an image
 *
 * Events (bubbling): 'coral-reef:stone' {index, name} as each stone goes on the press while scrolling
 * forward, and 'coral-reef:done' when the last impression is made.
 */

const calm = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const MAXS = 15;          // stone slots in the shader (five RGB textures)

function loadImage(url) {
    return new Promise((res, rej) => {
        const im = new Image();
        im.decoding = 'async';
        im.onload = () => res(im);
        im.onerror = () => rej(new Error('coral-reef: could not load ' + url));
        im.src = url;
    });
}
// coverage and time maps must arrive exactly as stored: no premultiply, no colour management
function loadExact(url) {
    return fetch(url).then((r) => { if (!r.ok) throw new Error('coral-reef: could not load ' + url); return r.blob(); })
        .then((b) => createImageBitmap(b, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }));
}

/* ── paper noise: one tileable 512² texture, made once ──────────────────────
 * R  fine fibre   G  broad mottle (the damp sheet)   B  tooth   A  slow, for the ink's sheen */
let noiseCache = null;
function makeNoise() {
    if (noiseCache) return noiseCache;
    const S = 512, out = new Uint8Array(S * S * 4);
    let seed = 90127;
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
    const f1 = lattice(256), f2 = lattice(128), m1 = lattice(6), m2 = lattice(16), t1 = lattice(170), t2 = lattice(64), b1 = lattice(3), b2 = lattice(9);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const u = x / S, v = y / S, k = (y * S + x) * 4;
        out[k] = clamp(f1(u, v) * .6 + f2(u, v) * .4) * 255;
        out[k + 1] = clamp(.5 + (m1(u, v) * .6 + m2(u, v) * .4 - .5) * 1.6) * 255;
        out[k + 2] = clamp(.5 + (t1(u, v) * .55 + t2(u, v) * .3 + rnd() * .15 - .5) * 2.1) * 255;
        out[k + 3] = clamp(b1(u, v) * .6 + b2(u, v) * .4) * 255;
    }
    noiseCache = { S, data: out };
    return noiseCache;
}

const VERT = `attribute vec2 aP; uniform vec2 uStage; varying vec2 vQ;
void main(){ vQ = vec2(aP.x * .5 + .5, .5 - aP.y * .5) * uStage; gl_Position = vec4(aP, 0., 1.); }`;

/* One quad. Optical density in linear light against the sheet's own paper: D = -ln(colour / paper).
 * The plate O is  D_O = sum_k a_k d_k + R : stone k lays ink d_k with coverage a_k (its crayon grain),
 * and R is what the inks do not explain (the paper's own texture where there is no ink, the scan's
 * noise where there is). R is shared out: to the bare paper where nothing prints, otherwise to each
 * stone in proportion to the ink it lays there. When every stone has printed, D = D_O exactly and
 * the pixel is O, the scan. */
// the per-stone shader code is written out once per stone (constant indices: fast everywhere)
const STONES = (fn, sep = '\n  ') => Array.from({ length: MAXS }, (_, k) => fn(k, 's' + ((k / 3) | 0) + '.' + 'rgb'[k % 3])).join(sep);
const FRAG = `precision highp float;
varying vec2 vQ;
uniform sampler2D uO, uS0, uS1, uS2, uS3, uS4, uT, uNz;
uniform vec4 uView;            // the sheet in the stage, css px
uniform vec3 uPage;
uniform float uG, uEps, uUS;     // uUS: the shipped sheet's width as a fraction of the scan the paper was fitted on
uniform vec3 uPP[10];          // the paper field: cubic in (u, v), per channel
uniform vec3 uSI[${MAXS}];        // each stone's ink (optical density per channel) times its coverage scale
uniform float uF[${MAXS}];        // each stone's scraper position (0 top .. 1 bottom; <0 not yet; >1 past)
uniform float uFa;             // the scraper's line of the stone on the press, -1 between impressions

vec3 lin(vec3 c){ return max(pow(max(c, vec3(0.)), vec3(uG)), vec3(1e-6)); }
float lum(vec3 d){ return dot(d, vec3(.2126, .7152, .0722)); }

void main(){
  vec2 sp = vQ - uView.xy;
  vec2 uv = sp / uView.zw;
  float inS = min(min(sp.x, uView.z - sp.x), min(sp.y, uView.w - sp.y));
  // the page, and the sheet's tight shadow (light from above)
  vec2 sq = sp - vec2(0., 2.5);
  float ox = max(max(-sq.x, sq.x - uView.z), 0.), oy = max(max(-sq.y, sq.y - uView.w), 0.);
  float dsh = length(vec2(ox, oy));
  vec3 page = mix(uPage, vec3(.157, .118, .07), .12 * exp(-dsh / 7.) + .09 * exp(-dsh / 1.6));
  if (inS < -1.) { gl_FragColor = vec4(page, 1.); return; }
  vec2 t = clamp(uv, vec2(0.), vec2(1.));
  float u = t.x * uUS, v = t.y;
  vec3 pap = uPP[0] + uPP[1]*u + uPP[2]*v + uPP[3]*u*u + uPP[4]*u*v + uPP[5]*v*v
           + uPP[6]*u*u*u + uPP[7]*v*v*v + uPP[8]*u*u*v + uPP[9]*u*v*v;
  vec3 PL = lin(clamp(pap, 0., 1.));
  vec3 OL = lin(texture2D(uO, t).rgb);
  vec3 DO = -log(OL / PL);
  vec3 s0 = texture2D(uS0, t).rgb, s1 = texture2D(uS1, t).rgb, s2 = texture2D(uS2, t).rgb,
       s3 = texture2D(uS3, t).rgb, s4 = texture2D(uS4, t).rgb;
  // each stone's density here: its coverage (crayon grain) times its ink (unrolled, constant indices)
${STONES((k, ch) => `vec3 d${k} = ${ch} * uSI[${k}];`)}
  vec3 sum = ${STONES((k) => `d${k}`, ' + ')};
  float S = ${STONES((k) => `max(lum(d${k}), 0.)`, ' + ')};
  vec3 R = DO - sum;
  float inv = 1. / (S + uEps);
  vec4 tm = texture2D(uT, t) * (255. / 254.);
  vec2 q = uv * uView.zw;
  vec4 nz = texture2D(uNz, q / 512.);
  float mott = texture2D(uNz, q / 1600. + .29).g;
  float T = tm.r + (mott - .5) * .006 + (nz.r - .5) * .0025;     // the scraper's line: slightly uneven
  vec3 D = R * (uEps * inv);                                      // bare paper: its own texture from the start
  float wet = 0.;
  // fresh litho ink is oily: a shade deeper and with a little gloss, then it sets matte.
  // thin films set first; heavy deposits (tm.g) stay wet longest
  float w0 = .02 + .06 * tm.g, w1 = .10 + .24 * tm.g;
${STONES((k) => `if (uF[${k}] > -.5) { float c = smoothstep(T - .0035, T + .0012, uF[${k}]);
    float w = c * (1. - smoothstep(w0, w1, uF[${k}] - T)); float ld = max(lum(d${k}), 0.);
    D += c * (d${k} * (1. + .14 * w) + R * (ld * inv)); wet = max(wet, w * smoothstep(.02, .25, ld)); }`)}
  vec3 col = PL * exp(-D);
  // the oily film: a faint sheen of the window on the fresh ink
  float sheen = smoothstep(.4, .95, texture2D(uNz, q / 2400. + vec2(.41, .13)).a) * (.6 + .4 * nz.r);
  col = mix(col, vec3(1., .992, .975), clamp(wet * (.025 + .12 * sheen), 0., .2));
  // the damp sheet just at the scraper's line, where the impression is being made
  if (uFa >= 0. && uFa <= 1.) {
    float band = exp(-abs(uFa - T) / .0035);
    col *= 1. - .035 * band * (.6 + .4 * nz.b);
  }
  vec3 s = pow(max(col, vec3(0.)), vec3(1. / uG));
  float edge = clamp(inS + 1., 0., 1.);
  gl_FragColor = vec4(mix(page, s, edge), 1.);
}`;

function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    return sh;
}

export function coralReef(root, opts = {}) {
    const ds = root.dataset;
    const o = {
        src: opts.src ?? ds.src,
        mode: opts.mode ?? ds.mode ?? 'scroll',
        runway: +(opts.runway ?? ds.runway ?? 560),
        webgl: (opts.webgl ?? ds.webgl ?? 'on') !== 'off' && opts.webgl !== false,
    };
    if (!o.src) return () => {};
    const dir = o.src.replace(/[^/]*$/, '');
    const stage = root.querySelector('.cr-stage') || root;
    let dead = false, cleanup = [];
    const on = (t, ev, fn, opt) => { t.addEventListener(ev, fn, opt); cleanup.push(() => t.removeEventListener(ev, fn, opt)); };
    root.classList.add('cr');
    const still = () => calm.matches || o.mode === 'static' || !o.webgl;
    if (still()) root.classList.add('cr-still');

    const canvas = document.createElement('canvas');
    canvas.className = 'cr-canvas';
    canvas.setAttribute('aria-hidden', 'true');

    let meta, ims = {}, NS = 0, win = [];
    let gl = null, prog = null, U = {}, tex = {};
    let dpr = 1, packs = null;
    let target = 0, shown = 0, vel = 0, visible = false, raf = 0, last = 0, lastShown = -1;
    const fired = new Set();

    /* ── the run: each stone gets its own slice of the runway, one at a time ──
     * Within a slice the press bed travels (the scraper's line crosses the sheet in the first
     * ~72%), then the sheet comes off and dries a beat before the next stone goes on. */
    function buildWindows() {
        const a = meta.run[0], b = meta.run[1];
        const wts = meta.stones.map((s) => s.weight || 1);
        const tot = wts.reduce((x, y) => x + y, 0);
        let p = a;
        win = wts.map((w) => { const len = (b - a) * w / tot; const r = [p, p + len]; p += len; return r; });
    }
    const PASS = .74;     // fraction of a stone's slice the scraper takes to cross the sheet
    const PRE = -.08;     // progress while the section's top is still coming up the screen
    function fronts(S) {
        const f = new Float32Array(MAXS).fill(-1);
        let active = -1;
        for (let k = 0; k < NS; k++) {
            const [a, b] = win[k], x = (S - a) / (b - a);
            if (x <= 0) { f[k] = -1; continue; }
            // the bed starts slowly, runs evenly, and eases out at the far end
            const e = x < PASS ? smooth(0, 1, x / PASS) * .2 + (x / PASS) * .8 : 1 + (x - PASS) * 1.6;
            f[k] = Math.min(e * 1.03 - .015, 3);
            if (x > 0 && x < PASS) active = k;
        }
        return { f, active };
    }

    let fit = { x: 0, y: 0, w: 0, h: 0 }, stg = { w: 0, h: 0 }, mips = false;
    function layout() {
        const r = stage.getBoundingClientRect();
        const cs = getComputedStyle(stage);
        const pl = parseFloat(cs.paddingLeft), pr = parseFloat(cs.paddingRight), pt = parseFloat(cs.paddingTop), pb = parseFloat(cs.paddingBottom);
        const H = root.classList.contains('cr-scroll') ? innerHeight : (r.height || innerHeight);
        stg = { w: Math.max(120, Math.round(r.width)), h: Math.max(120, Math.round(H)) };
        const availW = Math.max(100, Math.min(stg.w - pl - pr, 900)), availH = Math.max(100, stg.h - pt - pb);
        const scale = Math.min(availW / meta.w, availH / meta.h, 1);
        fit = { w: Math.round(meta.w * scale), h: Math.round(meta.h * scale) };
        fit.x = Math.round((stg.w - fit.w) / 2); fit.y = Math.round(pt + (availH - fit.h) / 2);
        dpr = Math.min(2, devicePixelRatio || 1);
        canvas.style.width = stg.w + 'px'; canvas.style.height = stg.h + 'px';
        canvas.width = Math.round(stg.w * dpr); canvas.height = Math.round(stg.h * dpr);
        gl.viewport(0, 0, canvas.width, canvas.height);
    }

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
    /* The stones ship as one greyscale WebP each (8-bit coverage). Here they are packed three to a
     * texture, once. The plate and the stones go up at full size and are mipmapped the same way
     * (WebGL2), so at any size the grain of every stone lines up with the grain of the scan: they
     * are the same specks. The time map goes up exact. */
    function packStones() {
        const W = meta.w, H = meta.h, N = W * H;
        const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
        const cx = cv.getContext('2d', { willReadFrequently: true });
        const packs = [];
        for (let t = 0; t < MAXS / 3; t++) packs.push(t * 3 < NS ? new Uint8Array(N * 4) : null);
        packs.forEach((p) => { if (p) for (let i = 3; i < p.length; i += 4) p[i] = 255; });
        for (let j = 0; j < NS; j++) {
            cx.clearRect(0, 0, W, H);
            cx.drawImage(ims.g[j], 0, 0, W, H);
            const src = cx.getImageData(0, 0, W, H).data, dst = packs[(j / 3) | 0], c = j % 3;
            for (let i = 0; i < N; i++) dst[i * 4 + c] = src[i * 4];
            ims.g[j].close?.();
        }
        cv.width = cv.height = 0;
        return packs;
    }
    function upload(packs) {
        tex.time = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex.time); setTex(ims.time, false);
        tex.orig = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex.orig); setTex(ims.orig, mips);
        packs.forEach((p, t) => {
            tex['s' + t] = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, tex['s' + t]);
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
            if (p) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, meta.w, meta.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, p);
            else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
            if (p && mips) gl.generateMipmap(gl.TEXTURE_2D);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, p && mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        });
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
        } catch (err) { console.warn('coral-reef: shader failed', err); gl = null; return false; }
        gl.useProgram(prog);
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        tex.buf = buf;
        const loc = gl.getAttribLocation(prog, 'aP');
        gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        for (const n of ['uO', 'uS0', 'uS1', 'uS2', 'uS3', 'uS4', 'uT', 'uNz', 'uStage', 'uView', 'uPage', 'uG', 'uEps', 'uUS', 'uPP', 'uSI', 'uF', 'uFa']) U[n] = gl.getUniformLocation(prog, n);
        const nz = makeNoise();
        tex.nz = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex.nz);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, nz.S, nz.S, 0, gl.RGBA, gl.UNSIGNED_BYTE, nz.data);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        ['uO', 'uS0', 'uS1', 'uS2', 'uS3', 'uS4', 'uT', 'uNz'].forEach((n, i) => gl.uniform1i(U[n], i));
        // constants: the paper field (cubic per channel), each stone's ink and scale
        const pp = new Float32Array(30);
        for (let i = 0; i < 10; i++) for (let c = 0; c < 3; c++) pp[i * 3 + c] = meta.paperP[c][i];
        gl.uniform3fv(U.uPP, pp);
        const si = new Float32Array(MAXS * 3);     // unused slots stay zero: no ink
        meta.stones.slice(0, MAXS).forEach((s, k) => { for (let c = 0; c < 3; c++) si[k * 3 + c] = s.ink[c] * s.scale; });
        gl.uniform3fv(U.uSI, si); gl.uniform1f(U.uG, meta.gamma); gl.uniform1f(U.uEps, meta.eps); gl.uniform1f(U.uUS, meta.uScale || 1);
        return true;
    }

    let pageRGB = null;
    function pageColour() {
        if (pageRGB) return pageRGB;
        const m = getComputedStyle(root).backgroundColor.match(/[\d.]+/g) || [243, 240, 232];
        pageRGB = m.slice(0, 3).map((v) => +v / 255);
        return pageRGB;
    }

    function draw() {
        const S = shown;
        const order = ['orig', 's0', 's1', 's2', 's3', 's4', 'time', 'nz'];
        order.forEach((k, i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, tex[k]); });
        gl.uniform2f(U.uStage, stg.w, stg.h);
        gl.uniform4f(U.uView, fit.x, fit.y, fit.w, fit.h);
        gl.uniform3fv(U.uPage, pageColour());
        const { f, active } = fronts(S);
        gl.uniform1fv(U.uF, f);
        gl.uniform1f(U.uFa, active >= 0 ? f[active] : -1);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        // events: each stone going on the press (forward only), and the plate finished
        if (S > lastShown) {
            for (let k = 0; k < NS; k++) {
                if (!fired.has(k) && S >= win[k][0]) { fired.add(k); root.dispatchEvent(new CustomEvent('coral-reef:stone', { bubbles: true, detail: { index: k, name: meta.stones[k].name } })); }
            }
            if (!fired.has('done') && S >= win[NS - 1][0] + (win[NS - 1][1] - win[NS - 1][0]) * PASS) { fired.add('done'); root.dispatchEvent(new CustomEvent('coral-reef:done', { bubbles: true })); }
        } else {
            for (let k = 0; k < NS; k++) if (S < win[k][0]) fired.delete(k);
            if (S < win[NS - 1][1]) fired.delete('done');
        }
        lastShown = S;
    }

    function frame(now) {
        raf = 0;
        const dt = Math.min(.1, (now - (last || now)) / 1000); last = now;
        // critically damped spring toward the scroll position; quicker going back
        const w = target < shown ? 14 : 9, x0 = shown - target, c2 = vel + w * x0, e = Math.exp(-w * dt);
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
        // the key goes through the press while the sheet arrives, so it is printed by the time the
        // stage pins: progress runs from a little below 0
        target = run > 0 ? clamp(-r.top / run, PRE, 1) : 1;
    }

    let live = false;
    async function start() {
        if (still()) return;                         // the finished plate, as an image
        try {
            meta = await (await fetch(o.src)).json();
            const loads = [loadImage(dir + meta.image), loadExact(dir + meta.time), ...meta.files.map((fn) => loadExact(dir + fn))];
            const got = await Promise.all(loads);
            ims = { orig: got[0], time: got[1], g: got.slice(2) };
        } catch (err) { console.warn(err); return; }
        if (dead || still()) return;
        NS = Math.min(MAXS, meta.stones.length);
        buildWindows();
        packs = packStones();
        root.classList.add('cr-scroll');
        root.style.setProperty('--cr-runway', o.runway + 'svh');
        stage.appendChild(canvas);
        if (!initGL()) { canvas.remove(); root.classList.remove('cr-scroll'); root.style.removeProperty('--cr-runway'); return; }
        upload(packs);
        layout();
        root.classList.add('is-live'); live = true;
        readScroll(); shown = target; lastShown = shown;
        for (let k = 0; k < NS; k++) if (shown >= win[k][0]) fired.add(k);
        if (shown >= win[NS - 1][1]) fired.add('done');
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
        on(canvas, 'webglcontextlost', (e) => { e.preventDefault(); root.classList.remove('is-live'); });
        on(canvas, 'webglcontextrestored', () => {
            tex = {}; U = {};
            if (initGL()) { upload(packs); layout(); root.classList.add('is-live'); draw(); }
        });
    }
    // reduced motion switched on mid-visit: settle on the finished plate
    on(calm, 'change', () => {
        if (calm.matches && live) { root.classList.add('cr-still'); root.classList.remove('cr-scroll', 'is-live'); root.style.removeProperty('--cr-runway'); }
        else if (!calm.matches && live) { root.classList.remove('cr-still'); root.classList.add('cr-scroll', 'is-live'); root.style.setProperty('--cr-runway', o.runway + 'svh'); pageRGB = null; layout(); readScroll(); shown = target; draw(); }
        else if (!calm.matches && !live && o.mode !== 'static' && o.webgl) { root.classList.remove('cr-still'); start(); }
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
        ims.time?.close?.(); packs = null;
        canvas.remove();
        root.classList.remove('cr', 'is-live', 'cr-scroll', 'cr-still');
        root.style.removeProperty('--cr-runway');
    }
    // for tests and tooling: where the run is, and how far each stone has printed
    Object.defineProperty(destroy, 'progress', { get: () => shown });
    destroy.stones = () => (meta ? meta.stones.map((s, k) => ({ name: s.name, window: win[k] })) : []);
    return destroy;
}

/* auto-start */
const started = new WeakMap();
function boot() {
    document.querySelectorAll('[data-coral-reef]').forEach((el) => {
        if (!started.has(el)) started.set(el, coralReef(el));
    });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
