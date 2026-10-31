/* florilegium — a colourist's bench. Plates from Curtis's Botanical Magazine
 * (hand-coloured engravings, 1787 onward) arrive one after another as bare
 * impressions and are coloured by hand as you scroll: the greens first, then the
 * flower, then its small bright parts. Each wash spreads as a wet front from where
 * the brush went down, held back by the engraved lines; it is darker and faintly
 * glossy while wet and dries from the edges in, pigment drawn to the rim and settled
 * into the paper's tooth, into exactly the real coloured plate. The finished plate
 * is laid aside on the pile, the next bare one is underneath, and at the end the
 * whole set lies on the bench together. Scroll back and it all un-colours.
 *
 *   <section data-florilegium data-src="assets/florilegium.json">
 *     <div class="fl-stage">
 *       <div class="fl-row">
 *         <img class="fl-plate" src="assets/passiflora.webp" alt="" aria-hidden="true">  (one per plate, in order)
 *       </div>
 *     </div>
 *   </section>
 *
 * Each plate has, beside its coloured scan <id>.webp, an uncoloured impression
 * <id>-bare.webp, its washes in suspension <id>-flat.webp and a lossless map
 * <id>-map.webp (wash index, arrival time, distance to edge, distance to a damp
 * neighbour), made offline (see README). The collection JSON lists the plates.
 *
 * Options (data-* or the options object, which wins):
 *   src      the collection JSON (required)
 *   mode     'scroll' (default) | 'static' (the finished set)
 *   first    svh of scroll for the first plate (default 110); later plates get `later`
 *   later    svh for each later plate (default 52)
 *   pattern  'on' (default) shows the coloured pattern plate small beside the bench on wide screens
 *
 * Events (bubbling): 'florilegium:wash' {plate, index, kind} as a wash goes down
 * scrolling forward, 'florilegium:plate' {plate} as a finished plate is laid aside,
 * 'florilegium:done' when the set is complete.
 */

const calm = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

function loadImage(url) {
    return new Promise((res, rej) => {
        const im = new Image();
        im.decoding = 'async';
        im.onload = () => res(im);
        im.onerror = () => rej(new Error('florilegium: could not load ' + url));
        im.src = url;
    });
}
function loadBits(url) {
    return fetch(url).then((r) => { if (!r.ok) throw new Error('florilegium: could not load ' + url); return r.blob(); })
        .then((b) => createImageBitmap(b, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }));
}

/* ── Paper noise: one tileable 512² RGBA texture, made once ────────────────
 * R fibres   G sizing mottle   B tooth   A broad, for the sheen */
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

// The active plate, drawn over a transparent canvas (premultiplied alpha): the sheet
// with a sharp trimmed edge and a tight shadow; the bench (the page) shows around it.
const FRAG = `precision highp float;
varying vec2 vQ;
uniform sampler2D uOrig, uBare, uFlat, uMap, uState, uNz;
uniform vec4 uView;           // the sheet in the stage: x, y, w, h (css px, camera applied)
uniform float uFlatScale;
uniform float uPxA;           // asset px per css px (distances in the map are asset px)
const vec3 SH = vec3(.157, .118, .07);
void main(){
  vec2 sp = vQ - uView.xy;
  vec2 uv = sp / uView.zw;
  float inS = min(min(sp.x, uView.z - sp.x), min(sp.y, uView.w - sp.y));
  if (inS < 0.) {
    vec2 sq = sp - vec2(0., 2.5);
    float ox = max(max(-sq.x, sq.x - uView.z), 0.), oy = max(max(-sq.y, sq.y - uView.w), 0.);
    float d = length(vec2(ox, oy));
    float sh = .13 * exp(-d / 7.) + .1 * exp(-d / 1.6);
    gl_FragColor = vec4(SH * sh, sh);
    return;
  }
  float edgeA = clamp(inS + .5, 0., 1.);
  vec3 o = texture2D(uOrig, uv).rgb;
  vec4 m = texture2D(uMap, uv);
  float id = floor(m.r * 255. + .5);
  vec3 col = o;
  if (id > .5) {
    vec3 b = texture2D(uBare, uv).rgb;
    vec4 st = texture2D(uState, vec2((id + .5) / 256., .5));
    float f = st.r, g = st.g, maxd = max(st.b * 255. / 4., 1.);
    col = b;
    if (f > 0.) {
      float T = m.g, dist = m.b * 255. / 4.;
      vec2 q = uv * uView.zw;
      vec4 nz1 = texture2D(uNz, q / 512.);
      vec4 nz2 = texture2D(uNz, q / 1300. + .37);
      float nz3 = texture2D(uNz, q / 380. + .61).g;
      float tooth = nz1.b, fib = nz1.r, mott = nz2.g;
      // the wet front, ragged along the fibres and branching a little at its edge
      float Tn = clamp(T + (mott - .5) * .07 + (nz3 - .5) * .03 + (fib - .5) * .03, 0., 1.);
      float cov = smoothstep(Tn - .02, Tn + .004, f * 1.14 - .08);
      if (cov > 0.) {
        // drying: edges first, the last-wetted parts last
        float dn = clamp(dist / min(maxd, 64.), 0., 1.);
        float dryAt = min(.84, .6 * dn + .22 * T + (mott - .5) * .12 + .04);
        float dp = smoothstep(dryAt, dryAt + .16, g * 1.05);
        float wet = cov * (1. - dp);
        float bell = 4. * dp * (1. - dp) * cov;
        vec3 wd = o / max(b, vec3(.012));
        vec3 wf = texture2D(uFlat, uv).rgb * uFlatScale;
        vec3 w = mix(wf, wd, smoothstep(.05, .95, dp));
        vec3 od = -log(clamp(w, vec3(.002), vec3(6.)));
        float rim = exp(-dist / (3.6 * max(uPxA, .6)));
        float k = 1. + .55 * wet
                + bell * (1.25 * rim - .2)
                + bell * (tooth - .5) * .55;
        float dcon = m.a * 255. / 8.;
        if (dcon < 31.) {
          float R = 6. + 10. * mott + (fib - .5) * 5.;
          float e = dcon - R;
          float inside = 1. - smoothstep(-2.5, 0., e);
          float fringe = exp(-e * e / 2.2);
          float bl = smoothstep(.04, .3, dp) * (1. - smoothstep(.55, 1., dp)) * cov;
          k += bl * (.85 * fringe - .38 * inside);
        }
        // the bead: while the water is still moving its leading edge carries more pigment
        float front = cov * (1. - cov) * 4.;
        k += front * .5;
        od *= max(k, 0.);
        col = b * exp(-od * cov);
        wet *= smoothstep(.015, .09, max(max(od.r, od.g), od.b));
        col *= 1. - .045 * wet;
        float sheen = smoothstep(.5, .9, texture2D(uNz, q / 2600. + vec2(.13, .71)).a) * (.6 + .4 * fib);
        col = mix(col, vec3(1., .995, .985), wet * (.035 + .2 * sheen));
      }
    }
  }
  gl_FragColor = vec4(col * edgeA, edgeA);
}`;

function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    return sh;
}

const GROUP = { leaf: 0, stem: 0, flower: 1, detail: 2 };

export function florilegium(root, opts = {}) {
    const ds = root.dataset;
    const o = {
        src: opts.src ?? ds.src,
        mode: opts.mode ?? ds.mode ?? 'scroll',
        first: +(opts.first ?? ds.first ?? 110),
        later: +(opts.later ?? ds.later ?? 52),
        pattern: (opts.pattern ?? ds.pattern ?? 'on') !== 'off',
    };
    if (!o.src) return () => {};
    const dir = o.src.replace(/[^/]*$/, '');
    const stage = root.querySelector('.fl-stage') || root;
    const row = stage.querySelector('.fl-row');
    let dead = false, cleanup = [];
    const on = (t, ev, fn, opt) => { t.addEventListener(ev, fn, opt); cleanup.push(() => t.removeEventListener(ev, fn, opt)); };
    root.classList.add('fl');
    const still = () => calm.matches || o.mode === 'static';

    let meta = null, P = [], N = 0, travel = 0, T = null;
    let gl = null, prog = null, U = {}, nzTex = null, stTex = null, mips = false;
    const sets = [null, null];                 // GPU texture sets: { plate, orig, bare, flat, map, w }
    const state = new Uint8Array(256 * 4);
    let stg = { w: 0, h: 0 }, dpr = 1, wide = false;
    let target = 0, shown = 0, vel = 0, visible = false, raf = 0, last = 0, lastShown = -1;
    let fired = { wash: [], plate: -1, done: false };

    const canvas = document.createElement('canvas');
    canvas.className = 'fl-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    const unders = [0, 1].map(() => { const d = document.createElement('div'); d.className = 'fl-under'; d.setAttribute('aria-hidden', 'true'); return d; });
    const pattern = document.createElement('img');
    pattern.className = 'fl-pattern'; pattern.alt = ''; pattern.setAttribute('aria-hidden', 'true');
    let patternFor = -1;

    /* ── the timeline, in svh of travel ──────────────────────────────────────── */
    const LEAD = 12, HOLD = 5, SLIDE = 11, FINAL = 24, REST = 16;
    function buildTimeline() {
        let t = LEAD;
        T = [];
        for (let i = 0; i < N; i++) {
            const B = i === 0 ? o.first : o.later;
            const c0 = t, c1 = t + B;
            t = c1 + HOLD;
            const s0 = t, s1 = i < N - 1 ? t + SLIDE : t;   // the last plate is not laid aside: it goes straight into the set
            t = s1;
            T.push({ c0, c1, s0, s1 });
        }
        const f0 = t, f1 = t + FINAL;
        travel = f1 + REST;
        T.final = [f0, f1];
        P.forEach((p, i) => buildSchedule(p, T[i].c0 / travel, T[i].c1 / travel, i === 0));
    }

    // One plate's washes inside its window: one area after another, at most two or three
    // wet at once; big areas take the longest (12-20svh on the first plate, about half that
    // later); specks are touched in quickly; if it does not fit it is scaled to fit.
    function buildSchedule(p, a, b, first) {
        const W = p.washes, n = W.length;
        let t = 0, prevG = -1, prevD = 0, prevA = 1e9;
        const s = [], d = [], D = [];
        const ref = p.w * p.h * .06;
        W.forEach((w, i) => {
            const g = GROUP[w.kind] ?? 0;
            const dur = clamp(2.5 + 16 * Math.sqrt(w.area / ref), 2.5, 20) * (g === 1 ? 1.15 : 1);
            if (i > 0) t += g !== prevG ? prevD * .55 + 1.5 : prevD / 2.1 * (prevA < p.w * p.h * .003 ? .35 : 1);
            s.push(t); d.push(dur); D.push(dur * .9 + 3);
            prevG = g; prevD = dur; prevA = w.area;
        });
        const end = Math.max(...s.map((v, i) => v + .55 * d[i] + D[i]));
        const span = b - a, k = span / end;
        p.sched = { s: s.map((v) => a + v * k), d: d.map((v) => v * k), D: D.map((v) => v * k) };
        p.sched.first = p.sched.s[0];
        p.sched.dry = b;
        buildCamera(p);
    }

    // The phone's camera: follows the washes that are wet (a function of scroll only).
    function buildCamera(p) {
        const n = 240, fx = new Float32Array(n + 1), fy = new Float32Array(n + 1), S0 = p.sched.first, S1 = p.sched.dry;
        let lx = p.washes[0].c[0], ly = p.washes[0].c[1];
        for (let j = 0; j <= n; j++) {
            const S = S0 + (S1 - S0) * j / n;
            let sw = 0, sx = 0, sy = 0;
            p.washes.forEach((w, i) => {
                const f = (S - p.sched.s[i]) / p.sched.d[i], g = (S - p.sched.s[i] - .55 * p.sched.d[i]) / p.sched.D[i];
                if (f <= 0 || g >= 1) return;
                const wt = Math.sqrt(w.area) * (f < 1 ? 1.6 : 1 - g);
                sw += wt; sx += wt * w.c[0]; sy += wt * w.c[1];
            });
            if (sw > 0) { lx = sx / sw; ly = sy / sw; }
            fx[j] = lx; fy[j] = ly;
        }
        const sm = (arr) => {
            const out = new Float32Array(arr.length), r = 24;
            for (let j = 0; j < arr.length; j++) {
                let s2 = 0, w2 = 0;
                for (let q = -r; q <= r; q++) {
                    const jj = Math.min(arr.length - 1, Math.max(0, j + q)), w = Math.exp(-(q * q) / (2 * 9 * 9));
                    s2 += arr[jj] * w; w2 += w;
                }
                out[j] = s2 / w2;
            }
            return out;
        };
        p.cam = { n, fx: sm(fx), fy: sm(fy), S0, S1 };
    }
    function camAt(p, S) {
        const c = p.cam, j = clamp((S - c.S0) / (c.S1 - c.S0)) * c.n, j0 = Math.floor(j), j1 = Math.min(c.n, j0 + 1), t = j - j0;
        const zin = smooth(c.S0 - .012, c.S0 + .008, S), zout = smooth(c.S1 - .02, c.S1, S);
        return { x: lerp(c.fx[j0], c.fx[j1], t), y: lerp(c.fy[j0], c.fy[j1], t), z: zin * (1 - zout) };
    }

    /* ── the bench: where every sheet lies at a given moment ─────────────────── */
    let L = null;
    function layout() {
        const r = stage.getBoundingClientRect();
        stg = { w: Math.max(200, Math.round(r.width)), h: Math.max(200, Math.round(root.classList.contains('fl-scroll') ? innerHeight : r.height || innerHeight)) };
        wide = stg.w >= 860 && stg.w / stg.h > 1.15;
        const m = wide ? 0 : 5;
        const hA = wide ? stg.h * .84 : Math.min(stg.h * .86, (stg.w - 2 * m) / Math.min(...P.map((p) => p.w / p.h)));
        const act = P.map((p) => {
            const h = hA, w = h * p.w / p.h;
            return { x: (stg.w - w) / 2, y: (stg.h - h) / 2, w, h };
        });
        // the finished set: a row on a wide bench; a fanned hand on a phone
        const fin = [];
        if (wide) {
            const g = stg.w * .012, asp = P.reduce((s, p) => s + p.w / p.h, 0);
            const hF = Math.min(stg.h * .5, (stg.w * .94 - g * (N - 1)) / asp);
            let x = (stg.w - (hF * asp + g * (N - 1))) / 2;
            P.forEach((p) => { const w = hF * p.w / p.h; fin.push({ x, y: (stg.h - hF) / 2, w, h: hF }); x += w + g; });
        } else {
            const wF = stg.w * .5, step = (stg.w - 2 * 10 - wF) / Math.max(1, N - 1);
            P.forEach((p, i) => { const h = wF * p.h / p.w; fin.push({ x: 10 + i * step, y: (stg.h - h) / 2 + (i - (N - 1) / 2) * 6, w: wF, h }); });
        }
        // the pile of finished plates (left of the bench on a wide screen; off to the left on a phone)
        const pile = (i, a) => {
            const A = act[i];
            if (!wide) return { x: -A.w * .62 - 30, y: A.y + 30, w: A.w * .6, h: A.h * .6 };
            const h = A.h * .46, w = h * P[i].w / P[i].h;
            return { x: A.x - stg.w * .045 - w - a, y: (stg.h - h) / 2 + 20, w, h };
        };
        const patH = act[0].h * .34;
        L = { act, fin, pile, patH, m };
        dpr = Math.min(2, devicePixelRatio || 1);
        canvas.style.width = stg.w + 'px'; canvas.style.height = stg.h + 'px';
        canvas.width = Math.round(stg.w * dpr); canvas.height = Math.round(stg.h * dpr);
        if (gl) gl.viewport(0, 0, canvas.width, canvas.height);
        // a resize invalidates the packed textures (they are packed at the size shown)
        sets.forEach((s) => { if (s) s.stale = true; });
    }

    const zMaxFor = (i) => {
        if (wide || !mips || still()) return 1;
        const z = clamp((stg.h * .94) / L.act[i].h, 1, 1.75);
        return z < 1.12 ? 1 : z;
    };
    function viewAt(i, S) {
        const A = L.act[i], zM = zMaxFor(i);
        if (zM === 1) return [A.x, A.y, A.w, A.h];
        const c = camAt(P[i], S), z = 1 + (zM - 1) * c.z, w = A.w * z, h = A.h * z, m = A.x;
        const place = (len0, len, f) => len <= len0 - 2 * m ? (len0 - len) / 2 : clamp(len0 / 2 - f * len, len0 - m - len, m);
        return [place(stg.w, w, c.x), place(stg.h, h, c.y), w, h];
    }

    const lr = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), w: lerp(a.w, b.w, t), h: lerp(a.h, b.h, t) });
    // which plate is on the bench (under the brush) at S, and where everything else lies
    function scene(S) {
        const s = S * travel;
        const fe = smooth(T.final[0], T.final[1], s);
        let active = 0;
        for (let i = 1; i < N; i++) if (s >= T[i - 1].s0) active = i;
        const showCanvas = s < T.final[0];
        const sheets = [];                      // DOM sheets: { i, rect }
        const step = wide ? Math.min(34, L.act[0].w * .085) : 0;
        for (let i = 0; i < N; i++) {
            let a = 0;                         // later finished plates push this one along the pile
            for (let j = i + 1; j < N - 1; j++) a += smooth(T[j].s0, T[j].s1, s) * step;
            if (!showCanvas) {
                const from = i < N - 1 ? L.pile(i, a) : L.act[i];
                sheets.push({ i, rect: lr(from, L.fin[i], fe) });
            } else if (i < active) {
                sheets.push({ i, rect: lr(L.act[i], L.pile(i, a), smooth(T[i].s0, T[i].s1, s)) });
            }
        }
        return { s, active, showCanvas, sheets, fe };
    }

    /* ── GPU textures: the active plate and the next, packed at the size shown ── */
    function packSet(slot, i) {
        const p = P[i];
        if (!p.ims) return false;
        const A = L.act[i], want = Math.min(p.w, Math.round(A.w * zMaxFor(i) * dpr));
        const h = Math.round(want * p.h / p.w);
        let st = sets[slot];
        if (!st) st = sets[slot] = { tex: {} };
        st.plate = i; st.w = want; st.stale = false;
        const cv = document.createElement('canvas'); cv.width = want; cv.height = h;
        const cx = cv.getContext('2d');
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
        for (const k of ['orig', 'bare', 'flat']) {
            cx.clearRect(0, 0, want, h);
            cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
            cx.drawImage(p.ims[k], 0, 0, want, h);
            if (!st.tex[k]) st.tex[k] = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, st.tex[k]);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
            if (mips) gl.generateMipmap(gl.TEXTURE_2D);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        }
        cv.width = cv.height = 0;
        if (!st.tex.map) st.tex.map = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, st.tex.map);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, p.ims.map);
        for (const q of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, q, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return true;
    }
    const setFor = (i) => sets.find((s) => s && s.plate === i && !s.stale);
    function ensureSet(i) {
        let st = setFor(i);
        if (st) return st;
        // reuse a slot that is empty, or not holding the next plate (prepared in advance)
        let slot = [0, 1].find((k) => !sets[k]);
        if (slot == null) slot = [0, 1].find((k) => sets[k].plate !== i + 1) ?? 0;
        return packSet(slot, i) ? sets[slot] : null;
    }

    // images for a plate: loaded once, on demand (the next plate is fetched while this one is worked)
    function want(i) {
        const p = P[i];
        if (!p || p.loading) return;
        p.loading = true;
        const b = dir + p.id;
        Promise.all([loadImage(b + '.webp'), loadImage(b + '-bare.webp'), loadImage(b + '-flat.webp'), loadBits(b + '-map.webp')])
            .then(([orig, bare, flat, map]) => { if (dead) { map.close?.(); return; } p.ims = { orig, bare, flat, map }; draw(); })
            .catch((e) => { console.warn(e); p.loading = false; });
    }

    function initGL() {
        const ca = { alpha: true, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: false };
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
        } catch (err) { console.warn('florilegium: shader failed', err); gl = null; return false; }
        gl.useProgram(prog);
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(prog, 'aP');
        gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        for (const n of ['uOrig', 'uBare', 'uFlat', 'uMap', 'uState', 'uNz', 'uStage', 'uView', 'uFlatScale', 'uPxA']) U[n] = gl.getUniformLocation(prog, n);
        const nz = makeNoise();
        nzTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, nzTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, nz.S, nz.S, 0, gl.RGBA, gl.UNSIGNED_BYTE, nz.data);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        stTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, stTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, state);
        for (const q of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, q, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        ['uOrig', 'uBare', 'uFlat', 'uMap', 'uState', 'uNz'].forEach((n, i) => gl.uniform1i(U[n], i));
        return true;
    }

    function updateState(p, S) {
        const sc = p.sched;
        for (let i = 0; i < Math.min(255, p.washes.length); i++) {
            const a = sc.s[i], dd = sc.d[i];
            const j = (i + 1) * 4;
            state[j] = Math.round(clamp((S - a) / dd) * 255);
            state[j + 1] = Math.round(clamp((S - a - .55 * dd) / sc.D[i]) * 255);
            state[j + 2] = Math.min(255, Math.round(Math.min(64, p.washes[i].maxd) * 4));
            state[j + 3] = 255;
        }
    }

    const place = (el, r, z) => {
        el.style.transform = `translate(${r.x.toFixed(2)}px, ${r.y.toFixed(2)}px) scale(${(r.w / el._w).toFixed(5)}, ${(r.h / el._h).toFixed(5)})`;
        if (z != null) el.style.zIndex = z;
    };

    function draw() {
        if (!T || !L) return;
        const S = shown, sc = scene(S), s = sc.s;
        const act = sc.active, p = P[act];
        want(act); if (act + 1 < N) want(act + 1);
        // the DOM sheets: finished plates (on the pile, sliding, or in the set)
        P.forEach((q, i) => { q.el.style.visibility = 'hidden'; });
        sc.sheets.forEach(({ i, rect }) => {
            const el = P[i].el;
            el.style.visibility = 'visible';
            place(el, rect, 3 + i);
        });
        // the bare sheets waiting under the one on the bench
        unders.forEach((u, k) => {
            const i = act + 1 + k;
            if (i >= N || !sc.showCanvas) { u.style.visibility = 'hidden'; return; }
            const A = L.act[act];
            // as the finished plate slides off, the stack below settles up by one sheet
            const prev = act > 0 ? smooth(T[act - 1].s0, T[act - 1].s1, s) : 1;
            const off = (k + 1 - (1 - prev)) * (wide ? 5 : 3.5);
            u.style.visibility = 'visible';
            place(u, { x: A.x + off, y: A.y + off * .8, w: A.w, h: A.h }, 1);
        });
        // the pattern plate: the coloured model for the plate on the bench, small, beside it
        if (o.pattern && wide && sc.showCanvas) {
            const i = act, A = L.act[i], h = L.patH, w = h * P[i].w / P[i].h;
            const fadeIn = smooth(T[i].c0 - 6, T[i].c0 + 2, s), fadeOut = 1 - smooth(T[i].c1 - 2, T[i].c1 + HOLD, s);
            if (patternFor !== i) { pattern.src = dir + P[i].id + '.webp'; patternFor = i; }
            pattern.style.visibility = 'visible';
            pattern.style.opacity = (fadeIn * fadeOut).toFixed(3);
            if (pattern._for !== i) { pattern._w = 100; pattern._h = 100 * P[i].h / P[i].w; pattern.style.width = '100px'; pattern.style.height = pattern._h + 'px'; pattern._for = i; }
            place(pattern, { x: A.x + A.w + stg.w * .05, y: A.y + A.h - h - A.h * .04, w, h }, 2);
        } else pattern.style.visibility = 'hidden';

        // the plate under the brush
        const sliding = act > 0 && s < T[act - 1].s1;    // its predecessor is still moving off it
        if (gl && sc.showCanvas && p.sched) {
            canvas.style.visibility = 'visible';
            const st = ensureSet(act);
            gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
            if (st) {
                updateState(p, S);
                const order = [st.tex.orig, st.tex.bare, st.tex.flat, st.tex.map, stTex, nzTex];
                order.forEach((t, i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t); });
                gl.activeTexture(gl.TEXTURE4);
                gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 1, gl.RGBA, gl.UNSIGNED_BYTE, state);
                const v = viewAt(act, S);
                gl.uniform2f(U.uStage, stg.w, stg.h);
                gl.uniform4f(U.uView, ...v);
                gl.uniform1f(U.uFlatScale, p.flatScale || 1);
                gl.uniform1f(U.uPxA, p.w / v[2]);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            }
            // while this one is being worked, get the next one ready on the GPU
            if (act + 1 < N && P[act + 1].ims && !setFor(act + 1) && s > T[act].c0 + 4 && !sliding) {
                const keep = sets.findIndex((x) => x && x.plate === act);
                packSet(keep === 0 ? 1 : 0, act + 1);
            }
        } else canvas.style.visibility = 'hidden';
        // the plate on the bench, while its predecessor slides off, is still bare: nothing to hide
        events(S, sc);
        lastShown = S;
    }

    function events(S, sc) {
        const fwd = S > lastShown;
        P.forEach((p, pi) => {
            if (!p.sched) return;
            let f = fired.wash[pi] ?? -1;
            if (fwd) {
                for (let i = f + 1; i < p.washes.length && p.sched.s[i] <= S; i++) {
                    root.dispatchEvent(new CustomEvent('florilegium:wash', { bubbles: true, detail: { plate: p.id, index: i, kind: p.washes[i].kind } }));
                    f = i;
                }
            } else while (f >= 0 && p.sched.s[f] > S) f--;
            fired.wash[pi] = f;
        });
        let laid = -1;
        for (let i = 0; i < N - 1; i++) if (sc.s >= T[i].s0) laid = i;
        if (fwd && laid > fired.plate) for (let i = fired.plate + 1; i <= laid; i++) root.dispatchEvent(new CustomEvent('florilegium:plate', { bubbles: true, detail: { plate: P[i].id } }));
        fired.plate = laid;
        const done = sc.s >= T.final[1];
        if (done && !fired.done && fwd) root.dispatchEvent(new CustomEvent('florilegium:done', { bubbles: true }));
        fired.done = done;
    }

    function frame(now) {
        raf = 0;
        const dt = Math.min(.1, (now - (last || now)) / 1000); last = now;
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
        if (still()) { root.classList.remove('fl-scroll'); root.style.removeProperty('--fl-runway'); return; }
        root.classList.add('fl-scroll');
        root.style.setProperty('--fl-runway', Math.round(travel + 100) + 'svh');
    }

    async function start() {
        try { meta = await (await fetch(o.src)).json(); } catch (err) { console.warn(err); return; }
        if (dead) return;
        const imgs = row ? [...row.querySelectorAll('.fl-plate')] : [];
        P = meta.plates.map((p, i) => ({ ...p }));
        N = P.length;
        P.forEach((p, i) => {
            let el = imgs[i];
            if (!el) { el = document.createElement('img'); el.className = 'fl-plate'; el.alt = ''; el.setAttribute('aria-hidden', 'true'); el.src = dir + p.id + '.webp'; (row || stage).appendChild(el); }
            p.el = el;
        });
        buildTimeline();
        if (still()) { root.classList.add('fl-still'); return; }   // the finished set, as laid out by CSS
        if (!initGL()) { root.classList.add('fl-still'); return; }
        setRunway();
        root.classList.add('is-live');
        stage.appendChild(canvas);
        unders.forEach((u) => stage.appendChild(u));
        stage.appendChild(pattern);
        layout();
        const base = (el, w, h) => { el._w = w; el._h = h; el.style.width = w + 'px'; el.style.height = h + 'px'; };
        P.forEach((p) => base(p.el, 100, 100 * p.h / p.w));
        unders.forEach((u) => base(u, 100, 100 * P[0].h / P[0].w));
        readScroll(); shown = target; lastShown = shown;
        want(0); want(1);
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
        on(calm, 'change', () => location.reload());
        canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); canvas.style.visibility = 'hidden'; });
        canvas.addEventListener('webglcontextrestored', () => { sets[0] = sets[1] = null; U = {}; if (initGL()) { layout(); draw(); } });
    }
    start();

    return function destroy() {
        dead = true;
        cancelAnimationFrame(raf);
        cleanup.forEach((f) => f()); cleanup = [];
        if (gl) {
            sets.forEach((s) => s && Object.values(s.tex).forEach((t) => gl.deleteTexture(t)));
            if (nzTex) gl.deleteTexture(nzTex);
            if (stTex) gl.deleteTexture(stTex);
            if (prog) gl.deleteProgram(prog);
            gl.getExtension('WEBGL_lose_context')?.loseContext();
        }
        P.forEach((p) => { p.ims?.map?.close?.(); if (p.el) { p.el.style.removeProperty('transform'); p.el.style.removeProperty('visibility'); p.el.style.removeProperty('z-index'); p.el.style.removeProperty('width'); p.el.style.removeProperty('height'); } });
        canvas.remove(); pattern.remove(); unders.forEach((u) => u.remove());
        root.classList.remove('fl', 'is-live', 'fl-scroll', 'fl-still');
        root.style.removeProperty('--fl-runway');
    };
}

/* auto-start */
const started = new WeakMap();
function boot() {
    document.querySelectorAll('[data-florilegium]').forEach((el) => {
        if (!started.has(el)) started.set(el, florilegium(el));
    });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
