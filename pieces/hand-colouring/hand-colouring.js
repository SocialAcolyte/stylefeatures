/* hand-colouring — an engraved plate coloured by hand as you read.
 *
 *   <section data-hand-colouring data-src="assets/pomegranate.json">
 *     <div class="hc-stage"><img class="hc-img" src="assets/pomegranate.webp" alt=""></div>
 *   </section>
 *
 * The plate arrives as a bare impression (black-brown line on its own paper) and a
 * colourist's brush lays a watercolour wash into it one area at a time: leaves and
 * stems, then fruit and flowers, the caterpillar and chrysalis, the butterflies last.
 * Each wash spreads as a wet front from where the brush went down, slowed by the
 * engraved lines; while wet it is darker, smooth and faintly glossy; as it dries
 * (edges first) pigment gathers at the rim and settles into the paper's tooth, and it
 * dries lighter and matte, into exactly the real coloured plate.
 *
 * Everything heavy is offline (see README): the uncoloured impression, a "flat" wash
 * (the pigment in suspension), and a map (wash index, arrival time, distance to edge).
 * Scroll progress drives the schedule deterministically: scroll back and it un-colours.
 *
 * Options (data-* or the options object, which wins):
 *   src      the plate's JSON (required); images are <name>.webp, -bare.webp, -flat.webp, -map.webp
 *   mode     'scroll' (default: a pinned stage on a runway) | 'static' (the finished plate)
 *   runway   section height in svh (default 320)
 *   webgl    'off' forces the 2D fallback (a cross-fade)
 *
 * Events (bubbling, for sound later): 'hand-colouring:wash' {index, kind} when a wash
 * goes down while scrolling forward; 'hand-colouring:done' when the last wash is dry.
 */

const calm = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

function loadImage(url) {
    return new Promise((res, rej) => {
        const im = new Image();
        im.decoding = 'async';
        im.onload = () => res(im);
        im.onerror = () => rej(new Error('hand-colouring: could not load ' + url));
        im.src = url;
    });
}

/* ── Paper noise: one tileable 512² RGBA texture, made once ────────────────
 * R  fibres/fine speckle   G  mid mottle (sizing unevenness)
 * B  tooth (the grain that catches granulating pigment)   A  broad, for the sheen */
let noiseCache = null;
function makeNoise() {
    if (noiseCache) return noiseCache;
    const S = 512, out = new Uint8Array(S * S * 4);
    let seed = 9871;
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

const FRAG = `precision highp float;
varying vec2 vQ;               // css px in the stage
uniform sampler2D uOrig, uBare, uFlat, uMap, uState, uNz;
uniform vec4 uView;           // the sheet in the stage: x, y, w, h (css px, camera applied)
uniform vec3 uPage;           // the page's paper colour
uniform float uFlatScale;
uniform float uPxA;           // asset px per css px (distances in the map are asset px)
void main(){
  vec2 sp = vQ - uView.xy;
  vec2 uv = sp / uView.zw;
  // outside the sheet: the page, with the sheet's tight shadow (light from above)
  float dx = max(-sp.x, sp.x - uView.z), dy = max(-sp.y, sp.y - uView.w);
  float inS = min(min(sp.x, uView.z - sp.x), min(sp.y, uView.w - sp.y));
  if (inS < 0.) {
    vec2 sq = vQ - uView.xy - vec2(0., 2.5);
    float ox = max(max(-sq.x, sq.x - uView.z), 0.), oy = max(max(-sq.y, sq.y - uView.w), 0.);
    float d = length(vec2(ox, oy));
    float sh = .13 * exp(-d / 7.) + .1 * exp(-d / 1.6);
    gl_FragColor = vec4(mix(uPage, vec3(.157, .118, .07), sh), 1.);
    return;
  }
  float edgeA = clamp(inS + .5, 0., 1.);       // the trimmed edge, sharp, anti-aliased
  vec3 o = texture2D(uOrig, uv).rgb;
  vec4 m = texture2D(uMap, uv);
  float id = floor(m.r * 255. + .5);
  if (id < .5) { gl_FragColor = vec4(mix(uPage, o, edgeA), 1.); return; }
  vec3 b = texture2D(uBare, uv).rgb;
  vec4 st = texture2D(uState, vec2((id + .5) / 256., .5));
  float f = st.r, g = st.g, maxd = max(st.b * 255. / 4., 1.);
  if (f <= 0.) { gl_FragColor = vec4(mix(uPage, b, edgeA), 1.); return; }
  float T = m.g, dist = m.b * 255. / 4.;
  vec2 q = uv * uView.zw;
  vec4 nz1 = texture2D(uNz, q / 512.);           // fibre, ~1-2 css px
  vec4 nz2 = texture2D(uNz, q / 1300. + .37);    // sizing, a few px to a few tens
  float tooth = nz1.b, fib = nz1.r, mott = nz2.g;

  // the wet front: where the water has got to, a little ragged along the fibres
  float Tn = clamp(T + (mott - .5) * .07 + (fib - .5) * .035, 0., 1.);
  float fr = f * 1.14 - .08;
  float cov = smoothstep(Tn - .022, Tn + .004, fr);
  if (cov <= 0.) { gl_FragColor = vec4(mix(uPage, b, edgeA), 1.); return; }

  // drying: edges first, the last-wetted parts last
  float dn = clamp(dist / min(maxd, 64.), 0., 1.);
  float dryAt = min(.84, .6 * dn + .22 * T + (mott - .5) * .12 + .04);
  float dp = smoothstep(dryAt, dryAt + .16, g * 1.05);
  float wet = cov * (1. - dp);
  float bell = 4. * dp * (1. - dp) * cov;

  // the wash: in suspension (smooth) while wet, settling into its real texture as it dries
  vec3 wd = o / max(b, vec3(.012));
  vec3 wf = texture2D(uFlat, uv).rgb * uFlatScale;
  vec3 w = mix(wf, wd, smoothstep(.05, .95, dp));
  vec3 od = -log(clamp(w, vec3(.002), vec3(6.)));
  float rim = exp(-dist / (3.6 * max(uPxA, .6)));
  float k = 1. + .55 * wet                     // wet paint is darker
          + bell * (1.25 * rim - .2)           // pigment drawn to the drying rim, the middle paler
          + bell * (tooth - .5) * .55;          // granulating into the paper's tooth
  // a bloom: along the border with the wash laid just before (still damp), water from this
  // one runs back into it, pushing pigment out into a pale lobe with a dark, frilled edge
  float dcon = m.a * 255. / 8.;
  if (dcon < 31.) {
    float R = 7. + 11. * mott + (fib - .5) * 5.;
    float e = dcon - R;
    float inside = 1. - smoothstep(-2.5, 0., e);
    float fringe = exp(-e * e / 2.2);
    float bl = smoothstep(.04, .3, dp) * (1. - smoothstep(.55, 1., dp)) * cov;
    k += bl * (.85 * fringe - .38 * inside);
  }
  float front = cov * (1. - cov) * 4.;
  k += front * .45;                             // the bead at the leading edge
  od *= max(k, 0.);
  vec3 col = b * exp(-od * cov);
  // the water itself: wet paper a touch darker, and a faint sheen of the window on the film
  // (only where there is paint: the outline zone beyond the wash stays dry)
  wet *= smoothstep(.015, .09, max(max(od.r, od.g), od.b));
  col *= 1. - .045 * wet;
  float sheen = smoothstep(.5, .9, texture2D(uNz, q / 2600. + vec2(.13, .71)).a) * (.6 + .4 * fib);
  col = mix(col, vec3(1., .995, .985), wet * (.035 + .2 * sheen));
  gl_FragColor = vec4(mix(uPage, col, edgeA), 1.);
}`;

function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    return sh;
}

export function handColouring(root, opts = {}) {
    const ds = root.dataset;
    const o = {
        src: opts.src ?? ds.src,
        mode: opts.mode ?? ds.mode ?? 'scroll',
        runway: +(opts.runway ?? ds.runway ?? 390),
        webgl: (opts.webgl ?? ds.webgl ?? 'on') !== 'off' && opts.webgl !== false,
    };
    if (!o.src) return () => {};
    const base = o.src.replace(/\.json$/, '');
    const stage = root.querySelector('.hc-stage') || root;
    const img = stage.querySelector('.hc-img');
    let dead = false, cleanup = [];
    const on = (t, ev, fn, opt) => { t.addEventListener(ev, fn, opt); cleanup.push(() => t.removeEventListener(ev, fn, opt)); };
    root.classList.add('hc');
    const still = () => calm.matches || o.mode === 'static';

    const canvas = document.createElement('canvas');
    canvas.className = 'hc-canvas';
    canvas.setAttribute('aria-hidden', 'true');

    let meta, ims = {}, N = 0, sched = null;
    let gl = null, prog = null, U = {}, tex = {}, ctx2d = null;
    const state = new Uint8Array(256 * 4);
    let dpr = 1, texW = 0;
    let target = 0, shown = 0, vel = 0, visible = false, raf = 0, last = 0;
    let lastShown = -1, firedTo = -1, doneFired = false;

    /* ── the colourist's schedule, in svh of scroll ─────────────────────────────
     * One area after another, at most two or three wet at once, so the eye can follow
     * a brush: a big area (the main leaves, the fruit, a wing) takes 12-20svh, a small
     * one goes quickly, and the morpho's blue is slowest, last. If it does not fit the
     * runway it is scaled to fit. */
    function buildSchedule() {
        const W = meta.washes;
        const group = { leaf: 0, stem: 0, fruit: 1, flower: 2, caterpillar: 3, chrysalis: 3, butterfly: 4, morpho: 5, 'morpho-blue': 6 };
        const travel = Math.max(100, o.runway - 100), lead = 14, tail = 26;
        let t = 0, prevG = -1, prevD = 0, prevA = 1e9;
        const s = [], d = [], D = [];
        W.forEach((w, i) => {
            const g = group[w.kind] ?? 0;
            let dur = clamp(2.5 + 16 * Math.sqrt(w.area / 90000), 2.5, 20);
            if (w.kind === 'morpho-blue') dur = Math.min(40, dur * 2);
            if (i > 0) t += g !== prevG ? prevD * .55 + 2 : prevD / (g === 6 ? 1.25 : 2) * (prevA < 6000 ? .35 : 1);   // a speck is touched in quickly
            s.push(t); d.push(dur); D.push(dur * .9 + 3);
            prevG = g; prevD = dur; prevA = w.area;
        });
        const end = Math.max(...s.map((v, i) => v + .55 * d[i] + D[i]));
        const k = (travel - lead - tail) / end;            // svh per schedule unit
        const toS = (v) => v / travel;
        sched = { s: s.map((v) => toS(lead + v * k)), d: d.map((v) => toS(v * k)), D: D.map((v) => toS(v * k)) };
        sched.first = sched.s[0];
        sched.dry = Math.max(...sched.s.map((v, i) => v + .55 * sched.d[i] + sched.D[i]));
        buildCamera();
    }

    /* ── the camera (narrow screens): follow the washes that are wet, a function of
     * scroll only. Zoomed in while colouring; the whole sheet at the start and the end. */
    let cam = null;
    function buildCamera() {
        const n = 600, fx = new Float32Array(n + 1), fy = new Float32Array(n + 1);
        let lx = meta.washes[0].c[0], ly = meta.washes[0].c[1];
        for (let j = 0; j <= n; j++) {
            const S = j / n;
            let sw = 0, sx = 0, sy = 0;
            for (let i = 0; i < N; i++) {
                const f = (S - sched.s[i]) / sched.d[i];
                const g = (S - sched.s[i] - .55 * sched.d[i]) / sched.D[i];
                if (f <= 0 || g >= 1) continue;
                const wgt = Math.sqrt(meta.washes[i].area) * (f < 1 ? 1.6 : 1 - g);
                sw += wgt; sx += wgt * meta.washes[i].c[0]; sy += wgt * meta.washes[i].c[1];
            }
            if (sw > 0) { lx = sx / sw; ly = sy / sw; }
            fx[j] = lx; fy[j] = ly;
        }
        // smooth along the scroll so the camera drifts and never jumps
        const sm = (a) => {
            const o2 = new Float32Array(a.length), r = 30;
            for (let j = 0; j < a.length; j++) {
                let s2 = 0, w2 = 0;
                for (let q = -r; q <= r; q++) {
                    const jj = Math.min(a.length - 1, Math.max(0, j + q)), w = Math.exp(-(q * q) / (2 * 12 * 12));
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
        const zin = smooth(sched.first - .045, sched.first + .02, S), zout = smooth(sched.dry + .005, sched.dry + .06, S);
        return { x: cam.fx[j0] + (cam.fx[j1] - cam.fx[j0]) * t, y: cam.fy[j0] + (cam.fy[j1] - cam.fy[j0]) * t, z: 1 + (zMax - 1) * zin * (1 - zout) };
    }

    function updateState(S) {
        for (let i = 0; i < N; i++) {
            const a = sched.s[i], dd = sched.d[i];
            const f = clamp((S - a) / dd);
            const g = clamp((S - a - .55 * dd) / sched.D[i]);
            const j = (i + 1) * 4;
            state[j] = Math.round(f * 255);
            state[j + 1] = Math.round(g * 255);
            state[j + 2] = Math.min(255, Math.round(Math.min(64, meta.washes[i].maxd) * 4));
            state[j + 3] = 255;
        }
    }

    let fit = { x: 0, y: 0, w: 0, h: 0 }, stg = { w: 0, h: 0 }, zMax = 1, mips = false, view = [0, 0, 0, 0];
    function layout() {
        const r = stage.getBoundingClientRect();
        const cs = getComputedStyle(stage);
        const pl = parseFloat(cs.paddingLeft), pr = parseFloat(cs.paddingRight), pt = parseFloat(cs.paddingTop), pb = parseFloat(cs.paddingBottom);
        const H = root.classList.contains('hc-scroll') ? innerHeight : (r.height || innerHeight);
        stg = { w: Math.max(120, Math.round(r.width)), h: Math.max(120, Math.round(H)) };
        const availW = Math.max(100, stg.w - pl - pr), availH = Math.max(100, stg.h - pt - pb);
        const scale = Math.min(availW / meta.w, availH / meta.h);
        fit = { w: meta.w * scale, h: meta.h * scale };
        fit.x = pl + (availW - fit.w) / 2; fit.y = pt + (availH - fit.h) / 2;
        // on a narrow screen the sheet fills the width but is small; zoom in while colouring
        // until it nearly fills the height (needs mipmaps to zoom back out cleanly)
        zMax = mips && !still() ? clamp((stg.h * .94) / fit.h, 1, 1.75) : 1;
        if (zMax < 1.12) zMax = 1;
        dpr = Math.min(2, devicePixelRatio || 1);
        canvas.style.width = stg.w + 'px'; canvas.style.height = stg.h + 'px';
        canvas.width = Math.round(stg.w * dpr); canvas.height = Math.round(stg.h * dpr);
        const want = Math.min(meta.w, Math.round(fit.w * zMax * dpr));
        if (gl) {
            gl.viewport(0, 0, canvas.width, canvas.height);
            if (Math.abs(want - texW) > 2) pack(want, Math.round(want * meta.h / meta.w));
        } else if (ctx2d) texW = want;
    }

    function viewAt(S) {
        if (zMax === 1) return [fit.x, fit.y, fit.w, fit.h];
        const c = camAt(S), w = fit.w * c.z, h = fit.h * c.z;
        const m = fit.x;                                   // keep the hair of margin at the edges
        const place = (stageLen, len, f) => len <= stageLen - 2 * m ? (stageLen - len) / 2 : clamp(stageLen / 2 - f * len, stageLen - m - len, m);
        return [place(stg.w, w, c.x), place(stg.h, h, c.y), w, h];
    }

    // Resample the pictures to the canvas's pixel size (good downsampling, so the hatching
    // never aliases and no mipmaps are needed). The map goes up once at its own size, exact
    // (an ImageBitmap, not premultiplied) and sampled by nearest: its values are indices.
    function pack(w, h) {
        texW = w;
        if (!tex.map) {
            tex.map = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, tex.map);
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
            gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, ims.map);
            for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        }
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        const cx = cv.getContext('2d');
        for (const k of ['orig', 'bare', 'flat']) {
            cx.clearRect(0, 0, w, h);
            cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
            cx.drawImage(ims[k], 0, 0, w, h);
            if (!tex[k]) tex[k] = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, tex[k]);
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
            gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
            if (mips) gl.generateMipmap(gl.TEXTURE_2D);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        }
        cv.width = cv.height = 0;
    }

    function initGL() {
        // WebGL2 when there is one: mipmaps on any size, so the zoomed-out sheet stays clean
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
        } catch (err) { console.warn('hand-colouring: shader failed, using 2D', err); gl = null; return false; }
        gl.useProgram(prog);
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(prog, 'aP');
        gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        for (const n of ['uOrig', 'uBare', 'uFlat', 'uMap', 'uState', 'uNz', 'uStage', 'uView', 'uPage', 'uFlatScale', 'uPxA']) U[n] = gl.getUniformLocation(prog, n);
        const nz = makeNoise();
        tex.nz = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex.nz);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, nz.S, nz.S, 0, gl.RGBA, gl.UNSIGNED_BYTE, nz.data);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        tex.state = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex.state);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, state);
        for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        ['uOrig', 'uBare', 'uFlat', 'uMap', 'uState', 'uNz'].forEach((n, i) => gl.uniform1i(U[n], i));
        gl.uniform1f(U.uFlatScale, meta.flatScale || 1);
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
        updateState(S);
        if (gl) {
            const order = ['orig', 'bare', 'flat', 'map', 'state', 'nz'];
            order.forEach((k, i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, tex[k]); });
            gl.activeTexture(gl.TEXTURE4);
            gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 1, gl.RGBA, gl.UNSIGNED_BYTE, state);
            view = viewAt(S);
            gl.uniform2f(U.uStage, stg.w, stg.h);
            gl.uniform4f(U.uView, ...view);
            gl.uniform3fv(U.uPage, pageColour());
            gl.uniform1f(U.uPxA, meta.w / view[2]);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        } else if (ctx2d) {
            // 2D: the bare impression, the coloured plate fading in over the washing
            const c = ctx2d, a = clamp((S - sched.s[0]) / (sched.s[N - 1] + sched.d[N - 1] - sched.s[0]));
            c.setTransform(dpr, 0, 0, dpr, 0, 0);
            c.fillStyle = `rgb(${pageColour().map((v) => Math.round(v * 255)).join(',')})`;
            c.fillRect(0, 0, stg.w, stg.h);
            c.save(); c.shadowColor = 'rgba(40,30,18,.2)'; c.shadowBlur = 10; c.shadowOffsetY = 3;
            c.drawImage(ims.bare, fit.x, fit.y, fit.w, fit.h); c.restore();
            c.globalAlpha = a; c.drawImage(ims.orig, fit.x, fit.y, fit.w, fit.h);
            c.globalAlpha = 1;
        }
        // events: a wash going down (forward only), and the last one dry
        if (S > lastShown) {
            for (let i = firedTo + 1; i < N && sched.s[i] <= S; i++) {
                root.dispatchEvent(new CustomEvent('hand-colouring:wash', { bubbles: true, detail: { index: i, kind: meta.washes[i].kind } }));
                firedTo = i;
            }
        } else {
            while (firedTo >= 0 && sched.s[firedTo] > S) firedTo--;
        }
        const allDry = S >= sched.s[N - 1] + .55 * sched.d[N - 1] + sched.D[N - 1];
        if (allDry && !doneFired && S > lastShown) { doneFired = true; root.dispatchEvent(new CustomEvent('hand-colouring:done', { bubbles: true })); }
        if (!allDry) doneFired = false;
        lastShown = S;
    }

    function frame(now) {
        raf = 0;
        const dt = Math.min(.1, (now - (last || now)) / 1000); last = now;
        // critically damped spring toward the scroll position; going back it is quicker
        const w = target < shown ? 16 : 11, x0 = shown - target, c2 = vel + w * x0, e = Math.exp(-w * dt);
        shown = target + (x0 + c2 * dt) * e;
        vel = (c2 - w * (x0 + c2 * dt)) * e;
        if (Math.abs(target - shown) < 2e-5 && Math.abs(vel) < 2e-5) { shown = target; vel = 0; }
        draw();
        if (shown !== target && visible && !document.hidden) kick();
        else last = 0;
    }
    function kick() { if (!raf && !dead) raf = requestAnimationFrame(frame); }

    function readScroll() {
        if (still()) { target = 1; return; }
        const r = root.getBoundingClientRect();
        const run = r.height - innerHeight;
        target = run > 0 ? clamp(-r.top / run) : 1;
    }
    function setRunway() {
        if (still()) { root.classList.remove('hc-scroll'); root.style.removeProperty('--hc-runway'); return; }
        root.classList.add('hc-scroll');
        root.style.setProperty('--hc-runway', o.runway + 'svh');
    }

    async function start() {
        if (still()) { root.classList.add('hc-still'); }
        try {
            meta = await (await fetch(o.src)).json();
            const mapBits = fetch(base + '-map.webp').then((r) => { if (!r.ok) throw new Error('hand-colouring: could not load map'); return r.blob(); })
                .then((b) => createImageBitmap(b, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }));
            const [orig, bare, flat, map] = await Promise.all([...['.webp', '-bare.webp', '-flat.webp'].map((s) => loadImage(base + s)), mapBits]);
            ims = { orig, bare, flat, map };
        } catch (err) { console.warn(err); return; }
        if (dead) return;
        N = Math.min(255, meta.washes.length);
        buildSchedule();
        setRunway();
        stage.appendChild(canvas);
        if (!o.webgl || !initGL()) { ctx2d = canvas.getContext('2d'); root.classList.add('hc-2d'); }
        layout();
        root.classList.add('is-live');
        readScroll(); shown = target; lastShown = shown;
        firedTo = sched.s.findLastIndex ? sched.s.findLastIndex((v) => v <= shown) : -1;
        draw();

        const io = new IntersectionObserver((en) => {
            visible = en[0].isIntersecting;
            if (visible) { readScroll(); kick(); }
        }, { rootMargin: '10% 0px' });
        io.observe(root); cleanup.push(() => io.disconnect());
        on(window, 'scroll', () => { if (!visible) return; readScroll(); kick(); }, { passive: true });
        let rt = 0;
        const ro = new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(() => { if (dead) return; layout(); readScroll(); shown = target; draw(); }, 80); });
        ro.observe(stage); cleanup.push(() => { ro.disconnect(); clearTimeout(rt); });
        on(document, 'visibilitychange', () => { if (!document.hidden) kick(); });
        on(calm, 'change', () => { root.classList.toggle('hc-still', still()); pageRGB = null; setRunway(); layout(); readScroll(); shown = target; draw(); });
        canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); root.classList.remove('is-live'); });
        canvas.addEventListener('webglcontextrestored', () => {
            tex = {}; texW = 0; U = {};
            if (initGL()) { layout(); root.classList.add('is-live'); draw(); }
        });
    }
    start();

    return function destroy() {
        dead = true;
        cancelAnimationFrame(raf);
        cleanup.forEach((f) => f()); cleanup = [];
        if (gl) {
            Object.values(tex).forEach((t) => gl.deleteTexture(t));
            if (prog) gl.deleteProgram(prog);
            gl.getExtension('WEBGL_lose_context')?.loseContext();
        }
        ims.map?.close?.();
        canvas.remove();
        root.classList.remove('hc', 'is-live', 'hc-scroll', 'hc-2d', 'hc-still');
        root.style.removeProperty('--hc-runway');
    };
}

/* auto-start */
const started = new WeakMap();
function boot() {
    document.querySelectorAll('[data-hand-colouring]').forEach((el) => {
        if (!started.has(el)) started.set(el, handColouring(el));
    });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
