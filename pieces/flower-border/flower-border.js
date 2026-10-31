/* flower-border — a Ghent-Bruges strewn-flower border painted in front of you as you scroll.
 *
 *   <section data-flower-border data-src="assets/leaf.json">
 *     <div class="fb-stage">
 *       <div class="fb-leaf">
 *         <img class="fb-img" src="assets/leaf.webp" alt="" aria-hidden="true" width="2400" height="3569">
 *         <p class="fb-text">Your passage…</p>
 *       </div>
 *     </div>
 *   </section>
 *
 * A leaf from the Spinola Hours (Getty, Ms. Ludwig IX 18, fol. 265) is made again in the
 * illuminator's order: the ruled page with the scribe's text already on it, a fine grey
 * underdrawing of every flower, the yellow ground laid round them as one travelling wet
 * front, then flower by flower a transparent wash, the body colour and the fine strokes,
 * and last the cast shadows, a soft grey-brown wash that lifts every flower off the page.
 * The last frame is the leaf itself, pixel for pixel. Scroll back and it un-paints.
 * Your paragraph replaces the scribe's: it is set by Cheng Lou's pretext, justified and
 * hyphenated, with a red initial, in the text block the scribe left, and it stays
 * readable from the first frame to the last.
 *
 * Everything heavy is offline (see README): the leaf split into bare vellum, the ground,
 * the first washes and the body colour; per pixel which object it belongs to, which object
 * casts the shadow on it, and when each pass reaches it.
 *
 * Options (data-* or the options object, which wins):
 *   src      the leaf's JSON (required); images are <name>.webp, -vellum, -ground, -wash,
 *            -body, -masks, -id, -time (.webp) beside it
 *   mode     'scroll' (default: a pinned stage on a runway) | 'static' (the finished page)
 *   runway   section height in svh (default 420)
 *   webgl    'off' leaves the finished leaf as an image (the text is still set)
 *
 * Events (bubbling, for sound later): 'flower-border:stage' {stage} as each pass begins while
 * scrolling forward ('drawing', 'ground', 'flowers', 'shadows'), 'flower-border:object'
 * {name, kind} as each flower or insect is begun, and 'flower-border:done' at the end.
 */

const calm = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const LIB = new URL('./vendor/pretext/layout.js', import.meta.url).href;
const HYPHEN = new URL('./vendor/hyphen/en-us.js', import.meta.url).href;

function loadImage(url) {
    return new Promise((res, rej) => {
        const im = new Image();
        im.decoding = 'async';
        im.onload = () => res(im);
        im.onerror = () => rej(new Error('flower-border: could not load ' + url));
        im.src = url;
    });
}
function loadExact(url) {
    return fetch(url).then((r) => { if (!r.ok) throw new Error('flower-border: could not load ' + url); return r.blob(); })
        .then((b) => createImageBitmap(b, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }));
}

/* Liang's hyphenation (TeX's patterns), as pretext-vine uses it: soft hyphens in long words */
let hyphP = null;
const loadHyphen = () => (hyphP ||= import(HYPHEN).then((m) => {
    const pats = new Map();
    let maxLen = 0;
    for (const p of m.default.split(' ')) {
        const letters = p.replace(/[0-9]/g, '');
        const pts = new Array(letters.length + 1).fill(0);
        let k = 0;
        for (const ch of p) { if (ch >= '0' && ch <= '9') pts[k] = +ch; else k++; }
        pats.set(letters, pts);
        maxLen = Math.max(maxLen, letters.length);
    }
    const word = (w) => {
        const n = w.length, s = '.' + w.toLowerCase() + '.';
        const pts = new Array(s.length + 1).fill(0);
        for (let i = 0; i < s.length; i++) {
            for (let j = i + 1; j <= Math.min(s.length, i + maxLen); j++) {
                const pt = pats.get(s.slice(i, j));
                if (pt) for (let q = 0; q < pt.length; q++) if (pt[q] > pts[i + q]) pts[i + q] = pt[q];
            }
        }
        let out = '';
        for (let i = 0; i < n; i++) {
            if (i >= 2 && i <= n - 3 && pts[i + 1] % 2 === 1) out += '­';
            out += w[i];
        }
        return out;
    };
    return (text) => text.replace(/[A-Za-z]{6,}/g, (w) => word(w));
}).catch(() => (t) => t));

/* ── Paper noise: one tileable 512² RGBA texture, made once ────────────────
 * R  fibres / fine speckle   G  mid mottle   B  tooth   A  broad, for the sheen of wet paint */
let noiseCache = null;
function makeNoise() {
    if (noiseCache) return noiseCache;
    const S = 512, out = new Uint8Array(S * S * 4);
    let seed = 5281;
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

const NOBJ = 32;
const VERT = `#version 300 es
in vec2 aP; uniform vec2 uStage; out vec2 vQ;
void main(){ vQ = vec2(aP.x * .5 + .5, .5 - aP.y * .5) * uStage; gl_Position = vec4(aP, 0., 1.); }`;

/* One quad. Everything is in optical density, D = -ln(colour / vellum), in linear light.
 *   ground  gp = mix(P, mix(G, P, reserve), cg)        the yellow laid round the reserved flowers
 *   flower  fp = gp → wash W (cw) → body colour B (cb) → the leaf itself O (cf)
 *   both    Dn = mix(gp, fp, m)                          m: the object's soft mask
 *   shadow  D  = mix(Dn, O, cs)                          the cast shadow, last
 * When every pass is down and dry, D is O's density exactly: the leaf, pixel for pixel. */
const FRAG = `#version 300 es
precision highp float;
in vec2 vQ; out vec4 outC;
uniform sampler2D uO, uG, uP, uW, uB, uM, uI, uT, uNz;
uniform vec4 uView;            // the leaf in the stage: x, y, w, h (css px, camera applied)
uniform vec3 uPage, uPaper;
uniform float uGam;
uniform vec4 uA[${NOBJ}];      // per object: wash front, body front, fine front, drawing front
uniform vec4 uB2[${NOBJ}];     // per object: shadow front, wash dryness, body dryness, shadow dryness
uniform vec4 uGround;          // ground front, ground dryness, ruling strength, mip level for the wet blur (half-size layers)
uniform float uLodO;           // the same blur on the full-size leaf
uniform float uPx;             // asset px per css px

vec3 lin(vec3 c){ return max(pow(max(c, vec3(0.)), vec3(uGam)), vec3(1e-5)); }
// pigment in suspension: a soft copy, four taps at a modest mip level (never a big blocky mip)
vec3 soft(sampler2D t, vec2 u, float lod, float r){
  vec2 d = vec2(r) / uView.zw;
  float l = max(lod - 1.5, 0.);
  return .25 * (textureLod(t, u + vec2(d.x, d.y * .4), l).rgb + textureLod(t, u - vec2(d.x, d.y * .4), l).rgb
              + textureLod(t, u + vec2(-d.x * .4, d.y), l).rgb + textureLod(t, u + vec2(d.x * .4, -d.y), l).rgb);
}
vec3 dens(vec3 c){ return -log(c / uPaper); }
float lum(vec3 d){ return dot(d, vec3(.2126, .7152, .0722)); }

void main(){
  vec2 sp = vQ - uView.xy;
  vec2 uv = sp / uView.zw;
  float inS = min(min(sp.x, uView.z - sp.x), min(sp.y, uView.w - sp.y));
  // the page, with the leaf's tight shadow (light from above)
  vec2 sq = sp - vec2(0., 2.5);
  float ox = max(max(-sq.x, sq.x - uView.z), 0.), oy = max(max(-sq.y, sq.y - uView.w), 0.);
  float dsh = length(vec2(ox, oy));
  vec3 page = mix(uPage, vec3(.157, .118, .07), .13 * exp(-dsh / 7.) + .09 * exp(-dsh / 1.6));
  if (inS < -1.) { outC = vec4(page, 1.); return; }
  float edge = clamp(inS + .5, 0., 1.);
  vec2 u = clamp(uv, vec2(0.), vec2(1.));
  vec3 Ol = lin(texture(uO, u).rgb), DO = dens(Ol);
  vec4 id = texture(uI, u);
  vec4 tm = texture(uT, u);
  vec3 mk = texture(uM, u).rgb;                    // object mask, reserve mask, ink
  // bare parchment: the scan's own outside the border, the filled parchment inside it
  vec3 DP = id.a > .75 ? dens(lin(texture(uP, u).rgb)) : DO;
  // the ruled frame lines: inked from the first frame, at the leaf's own strength
  float rule = (1. - step(.3, mk.r)) * mk.b;
  DP = mix(DP, DO, rule);
  int k = int(id.r * 255. + .5), so = int(id.g * 255. + .5);
  float rim = id.b * 255. / 4.;                     // asset px to the object's edge
  vec2 q = uv * uView.zw;
  vec4 nz1 = texture(uNz, q / 512.);
  vec4 nz2 = texture(uNz, q / 1400. + .37);
  float nz3 = texture(uNz, q / 380. + .61).g;
  float tooth = nz1.b, fib = nz1.r, mott = nz2.g;

  // ── the ground: one wet front travelling round the border ──────────────────────
  float fG = uGround.x, gG = uGround.y;
  float Tg = tm.b + (mott - .5) * .03 + (nz3 - .5) * .016 + (fib - .5) * .005;
  float cg = smoothstep(Tg - .006, Tg + .0015, fG);
  float dryG = smoothstep(Tg + .02 + (mott - .5) * .03, Tg + .09 + (mott - .5) * .05, gG);
  float wetG = cg * (1. - dryG);
  vec3 DG = dens(lin(texture(uG, u).rgb));
  vec3 DGr = mix(DG, DP, mk.g);
  float beadG = cg * exp(-max(fG - Tg, 0.) / .004) * (1. - dryG);
  vec3 gp = mix(DP, DGr * (1. + .22 * wetG + .35 * beadG), cg);
  float wet = wetG * (1. - mk.g);

  vec3 Dn = gp;
  float pen = 0.;
  if (k > 0) {
    vec4 a = uA[k], b = uB2[k];
    float T = tm.r;
    // the drawing: a fine grey line run along every outline, gone under the body colour
    float Tu = T + (fib - .5) * .02;
    float cu = smoothstep(Tu - .02, Tu, a.w);
    // first wash: transparent, flat, pale; spreads from where the brush went down
    float Tw = T + (mott - .5) * .05 + (nz3 - .5) * .05 + (fib - .5) * .03 + (tooth - .5) * .012;
    float cw = smoothstep(Tw - .012, Tw + .002, a.x);
    float gw = b.y;
    float dw = smoothstep(.15 + .5 * T + (mott - .5) * .2, .45 + .5 * T + (mott - .5) * .2, gw);
    vec3 DW = dens(lin(texture(uW, u).rgb));
    vec3 DWb = dens(lin(soft(uW, u, uGround.w, 3.)));
    float bell = 4. * dw * (1. - dw);
    vec3 DWs = mix(DWb * 1.35, DW, dw) * (1. + bell * (.9 * exp(-rim / (2.4 * max(uPx, .5))) - .12) + bell * (tooth - .5) * .5);
    // body colour: the solid petals, laid in crisp strokes from the same start
    float Tb = T + (mott - .5) * .02 + (nz3 - .5) * .012;
    float cb = smoothstep(Tb - .008, Tb + .002, a.y);
    float db = smoothstep(Tb + .05, Tb + .2 + (mott - .5) * .05, a.y);
    vec3 DB = dens(lin(texture(uB, u).rgb));
    // fine strokes: veins, stamens, hatching and the white lights; the leaf's own pixels
    float Tf = T + (fib - .5) * .03 + (tooth - .5) * .01;
    float cf = smoothstep(Tf - .006, Tf + .001, a.z);
    vec3 fp = mix(gp, DWs, cw);
    fp = mix(fp, DB * (1. + .16 * (1. - db)), cb);
    fp = mix(fp, DO, cf);
    Dn = mix(gp, fp, mix(mk.r, 1., cf));          // (once its fine strokes are down, the object's own edge pixels are the leaf's)
    pen = mk.b * cu * (1. - max(.45 * cw, cb)) * mk.r;
    float wetF = max(cw * (1. - dw) * .9, cb * (1. - db) * .55) * mk.r;
    wet = max(wet * (1. - mk.r), wetF);
  }
  // ── the cast shadows: a soft grey-brown wash, spreading out from under each object ──
  vec3 D = Dn;
  if (so > 0) {
    vec4 b = uB2[so];
    // two passes: a pale wash that spreads out from under the object, then a darker core
    float Ts = tm.g + (mott - .5) * .06 + (nz3 - .5) * .05;
    float cs = smoothstep(Ts - .06, Ts + .01, b.x);
    float ds = smoothstep(Ts + .12 + (mott - .5) * .1, Ts + .55 + (mott - .5) * .1, b.x);
    float Tc = tm.g * .85 + (mott - .5) * .05 + (fib - .5) * .02;
    float cc = smoothstep(Tc - .04, Tc + .006, b.z);
    float dc = smoothstep(Tc + .15 + (mott - .5) * .1, Tc + .75 + (mott - .5) * .1, b.z);
    vec3 Ls = DO - Dn;
    vec3 Lsb = max(dens(lin(soft(uO, u, uLodO, 3.))) - Dn, vec3(0.));   // in suspension: soft
    vec3 Lneg = min(Ls, vec3(0.));
    vec3 L1 = mix(Lsb * .45 * 1.7 + Lneg * .45, Ls * .45, ds);
    vec3 L2 = mix(Lsb * .55 * 2.0 + Lneg * .55, Ls * .55, dc);
    float bead = cs * (1. - cs) * 4. * (1. - ds) + cc * (1. - cc) * 4. * (1. - dc);
    D = Dn + (cs * L1 + cc * L2) * (1. + .22 * bead);
    wet = max(wet, max(cs * (1. - ds), cc * (1. - dc)) * smoothstep(.02, .12, lum(Ls)));
  } else if (k == 0) {
    D = mix(Dn, DO, cg);                            // mottle far from any flower comes with the ground
  }
  vec3 col = uPaper * exp(-D);
  // wet paint: a touch darker, and a faint sheen of the window on the film
  col *= 1. - .06 * wet;
  float sheen = smoothstep(.5, .9, texture(uNz, q / 2600. + vec2(.13, .71)).a) * (.55 + .45 * fib);
  col = mix(col, vec3(1., .99, .96), wet * (.015 + .09 * sheen));
  // the underdrawing: grey-brown on the vellum's tooth; the ruling: faint red-brown
  col *= 1. - pen * vec3(.7, .72, .74) * (.75 + .4 * tooth);
  vec3 s = pow(max(col, vec3(0.)), vec3(1. / uGam));
  outC = vec4(mix(page, s, edge), 1.);
}`;

function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    return sh;
}

/* ── the scribe's part: the passage set by pretext in the text block ─────────────────
 * Laid out once in the leaf's own units (asset px), justified and hyphenated, with a red
 * initial three lines deep, sized to fill the block; drawn as positioned spans inside one
 * box that is moved and scaled with the leaf. */
async function setText(src, words, meta) {
    const api = await import(LIB);
    const hy = await loadHyphen();
    const cs = getComputedStyle(src);
    const family = cs.fontFamily, weight = cs.fontWeight || '400';
    try { await document.fonts.load(`${weight} 60px ${family}`); await document.fonts.ready; } catch (e) { /* measure what we have */ }
    const raw = src.textContent.replace(/\s+/g, ' ').trim();
    if (!raw) return null;
    const first = raw[0], rest = hy(raw.slice(1));
    const [tx, ty, tw, th] = meta.text;
    const bx = tx * meta.w, by = ty * meta.h, bw = tw * meta.w, bh = th * meta.h;
    const pad = { l: bw * .028, r: bw * .03, t: bh * .022, b: bh * .018 };
    const W0 = bw - pad.l - pad.r, H0 = bh - pad.t - pad.b;
    const mctx = document.createElement('canvas').getContext('2d');
    const font = (s, w = weight) => `${w} ${s}px ${family}`;
    let best = null;
    for (let fs = 96; fs >= 40; fs -= 0.5) {
        const LH = fs * 1.3;
        const nMax = Math.floor((H0 + LH * .25) / LH);
        mctx.font = font(fs);
        const capH = fs * .66;
        const I = (2 * LH + capH) / .66;              // the initial's size: its cap spans three lines
        mctx.font = font(I, 500);
        const iw = mctx.measureText(first).width + fs * .3;
        mctx.font = font(fs);
        const P = api.prepareWithSegments(rest, font(fs));
        let cur = { segmentIndex: 0, graphemeIndex: 0 }, lines = [], ok = true;
        for (let i = 0; i < 200; i++) {
            const x0 = i < 3 ? iw : 0;
            const range = api.layoutNextLineRange(P, cur, W0 - x0);
            if (!range) break;
            lines.push({ x0, w: W0 - x0, text: api.materializeLineRange(P, range).text });
            cur = range.end;
            if (lines.length > nMax) { ok = false; break; }
        }
        if (ok && lines.length >= 4) { best = { fs, LH, I, iw, lines }; break; }
    }
    if (!best) return null;
    const { fs, LH, I, lines } = best;
    mctx.font = font(fs);
    const mm = mctx.measureText('Hxg');
    const fa = mm.fontBoundingBoxAscent ?? fs * .9, fd = mm.fontBoundingBoxDescent ?? fs * .3;
    const baseOff = (LH - (fa + fd)) / 2 + fa;
    const space = mctx.measureText(' ').width;
    // the box is the text block in leaf units; spans are absolutely placed inside it
    words.textContent = '';
    words.style.width = bw + 'px'; words.style.height = bh + 'px';
    words.style.font = font(fs);
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'fb-rule'); svg.setAttribute('width', bw); svg.setAttribute('height', bh);
    svg.setAttribute('viewBox', `0 0 ${bw} ${bh}`);
    const nRules = Math.floor((bh - pad.t) / LH);
    for (let i = 0; i < nRules; i++) {
        const y = pad.t + i * LH + baseOff + fs * .02;
        const l = document.createElementNS(svgNS, 'line');
        l.setAttribute('x1', pad.l * .35); l.setAttribute('x2', bw - pad.r * .35);
        l.setAttribute('y1', y); l.setAttribute('y2', y);
        svg.appendChild(l);
    }
    words.appendChild(svg);
    const frag = document.createDocumentFragment();
    lines.forEach((ln, i) => {
        const toks = ln.text.trim().split(/\s+/).filter(Boolean);
        const ws = toks.map((t) => mctx.measureText(t).width);
        const sum = ws.reduce((a, b) => a + b, 0);
        const last = i === lines.length - 1;
        let gap = space;
        if (!last && toks.length > 1) gap = (ln.w - sum) / (toks.length - 1);
        if (gap > space * 2.4) gap = space * 1.1;
        let x = pad.l + ln.x0;
        toks.forEach((t, j) => {
            const s = document.createElement('span');
            s.className = 'fb-w';
            s.textContent = t;
            s.style.transform = `translate(${x.toFixed(2)}px, ${(pad.t + i * LH).toFixed(2)}px)`;
            s.style.lineHeight = LH + 'px';
            frag.appendChild(s);
            x += ws[j] + gap;
        });
    });
    // the red initial: its baseline on the third line's
    mctx.font = font(I, 500);
    const im = mctx.measureText(first);
    const ia = im.fontBoundingBoxAscent ?? I * .9, idd = im.fontBoundingBoxDescent ?? I * .3;
    const ib = (I - (ia + idd)) / 2 + ia;
    const cap = document.createElement('span');
    cap.className = 'fb-initial';
    cap.textContent = first;
    cap.style.font = font(I, 500);
    cap.style.lineHeight = I + 'px';
    cap.style.transform = `translate(${(pad.l - I * .02).toFixed(2)}px, ${(pad.t + 2 * LH + baseOff - ib).toFixed(2)}px)`;
    frag.appendChild(cap);
    words.appendChild(frag);
    return { box: [bx, by, bw, bh] };
}

export function flowerBorder(root, opts = {}) {
    const ds = root.dataset;
    const o = {
        src: opts.src ?? ds.src,
        mode: opts.mode ?? ds.mode ?? 'scroll',
        runway: +(opts.runway ?? ds.runway ?? 420),
        webgl: (opts.webgl ?? ds.webgl ?? 'on') !== 'off' && opts.webgl !== false,
    };
    if (!o.src) return () => {};
    const base = o.src.replace(/\.json$/, '');
    const stage = root.querySelector('.fb-stage') || root;
    const leaf = root.querySelector('.fb-leaf');
    const img = root.querySelector('.fb-img');
    const src = root.querySelector('.fb-text');
    let dead = false, cleanup = [];
    const on = (t, ev, fn, opt) => { t.addEventListener(ev, fn, opt); cleanup.push(() => t.removeEventListener(ev, fn, opt)); };
    root.classList.add('fb');
    const still = () => calm.matches || o.mode === 'static' || !o.webgl;
    if (still()) root.classList.add('fb-still');

    const canvas = document.createElement('canvas');
    canvas.className = 'fb-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    const words = document.createElement('div');
    words.className = 'fb-words';
    words.setAttribute('aria-hidden', 'true');

    let meta = null, ims = {}, textBox = null;
    let gl = null, prog = null, U = {}, tex = {};
    let dpr = 1, texW = 0, live = false;
    let target = 0, shown = 0, vel = 0, visible = false, raf = 0, last = 0, lastShown = -1;
    const fired = new Set();

    /* ── the illuminator's schedule, as fractions of the runway ─────────────────────
     * drawing 0.03-0.15, ground 0.15-0.36, flowers and insects one by one 0.35-0.75
     * (big ones take longer; at most two or three in hand at once), shadows 0.755-0.975
     * in two passes each (a pale wash, then a darker core). */
    let sch = null;
    function buildSchedule() {
        const ob = meta.objects, n = ob.length;
        const draw = [], wash = [];
        for (let i = 0; i < n; i++) draw.push([.03 + i * .0046, .03 + i * .0046 + .028]);
        let t = 0;
        const s = [], d = [];
        ob.forEach((b, i) => {
            const dur = clamp(.9 + 3.2 * Math.sqrt(b.area / 350000), .9, 4);
            if (i > 0) t += d[i - 1] * (b.kind !== ob[i - 1].kind ? .9 : .62);
            s.push(t); d.push(dur);
        });
        const end = Math.max(...s.map((v, i) => v + d[i] * 1.75));
        const F0 = .35, F1 = .75, k = (F1 - F0) / end;
        for (let i = 0; i < n; i++) wash.push([F0 + s[i] * k, d[i] * k]);
        const shadow = [];
        for (let i = 0; i < n; i++) shadow.push([.755 + i * .0078, .04]);
        sch = { draw, wash, shadow, ground: [.15, .36], end: .975 };
        buildCamera();
    }
    const uA = new Float32Array(NOBJ * 4), uB = new Float32Array(NOBJ * 4);
    function updateState(S) {
        const n = meta.objects.length;
        for (let i = 0; i < n; i++) {
            const k = (i + 1) * 4;
            const [d0, d1] = sch.draw[i];
            const [w0, wd] = sch.wash[i];
            const [s0, sd] = sch.shadow[i];
            uA[k] = (S - w0) / wd * 1.12;                                  // wash front
            uA[k + 1] = (S - w0 - wd * .42) / wd * 1.1;                    // body colour follows
            uA[k + 2] = (S - w0 - wd * .85) / (wd * .8) * 1.08;            // fine strokes last
            uA[k + 3] = (S - d0) / (d1 - d0) * 1.05;                       // the drawing
            uB[k] = (S - s0) / sd * 1.12;                                  // shadow front
            uB[k + 1] = (S - w0 - wd * .15) / (wd * .9);                   // wash drying
            uB[k + 2] = (S - s0 - sd * .4) / sd * 1.6;                     // the darker core
        }
    }

    /* ── the camera (narrow screens): close in on the work in hand, a function of scroll only ── */
    let cam = null;
    function buildCamera() {
        const n = 800, fx = new Float32Array(n + 1), fy = new Float32Array(n + 1), fz = new Float32Array(n + 1);
        const ob = meta.objects, tr = meta.groundTrack;
        let lx = .5, ly = .5;
        for (let j = 0; j <= n; j++) {
            const S = j / n;
            let sw = 0, sx = 0, sy = 0, z = 0;
            const add = (c, w) => { sw += w; sx += w * c[0]; sy += w * c[1]; };
            // drawing
            ob.forEach((b, i) => { const [a, e] = sch.draw[i]; if (S > a && S < e + .01) add(b.c, Math.sqrt(b.area)); });
            if (sw > 0) z = .55;
            // ground: the wet front
            const [g0, g1] = sch.ground;
            if (S > g0 - .01 && S < g1 + .01) {
                const f = clamp((S - g0) / (g1 - g0)) * (tr.length - 1), i0 = Math.floor(f), i1 = Math.min(tr.length - 1, i0 + 1), t = f - i0;
                add([tr[i0][0] + (tr[i1][0] - tr[i0][0]) * t, tr[i0][1] + (tr[i1][1] - tr[i0][1]) * t], 400); z = .6;
            }
            // flowers: what is wet now
            ob.forEach((b, i) => {
                const [a, d] = sch.wash[i];
                if (S > a - d * .1 && S < a + d * 1.6) add(b.c, Math.sqrt(b.area) * (S < a + d ? 1.6 : .6));
            });
            if (S > .35 && S < .755) z = 1;
            ob.forEach((b, i) => { const [a, d] = sch.shadow[i]; if (S > a && S < a + d) add(b.c, Math.sqrt(b.area)); });
            if (S >= .755 && S < .975) z = .55;
            if (sw > 0) { lx = sx / sw; ly = sy / sw; }
            fx[j] = lx; fy[j] = ly; fz[j] = z;
        }
        const sm = (a, r, sig) => {
            const o2 = new Float32Array(a.length);
            for (let j = 0; j < a.length; j++) {
                let s2 = 0, w2 = 0;
                for (let q = -r; q <= r; q++) {
                    const jj = clamp(j + q, 0, a.length - 1), w = Math.exp(-(q * q) / (2 * sig * sig));
                    s2 += a[jj] * w; w2 += w;
                }
                o2[j] = s2 / w2;
            }
            return o2;
        };
        cam = { n, fx: sm(fx, 50, 18), fy: sm(fy, 50, 18), fz: sm(fz, 40, 14) };
    }
    function camAt(S) {
        const j = clamp(S) * cam.n, j0 = Math.floor(j), j1 = Math.min(cam.n, j0 + 1), t = j - j0;
        const L = (a) => a[j0] + (a[j1] - a[j0]) * t;
        const z = L(cam.fz) * smooth(.02, .05, S) * (1 - smooth(.97, .995, S));
        return { x: L(cam.fx), y: L(cam.fy), z: 1 + (zMax - 1) * z };
    }

    let fit = { x: 0, y: 0, w: 0, h: 0 }, stg = { w: 0, h: 0 }, zMax = 1, view = [0, 0, 0, 0];
    function layout() {
        const r = stage.getBoundingClientRect();
        const cs = getComputedStyle(stage);
        const pl = parseFloat(cs.paddingLeft), pr = parseFloat(cs.paddingRight), pt = parseFloat(cs.paddingTop), pb = parseFloat(cs.paddingBottom);
        const H = r.height || innerHeight;              // the pinned stage is 100svh
        stg = { w: Math.max(120, Math.round(r.width)), h: Math.max(120, Math.round(H)) };
        const availW = Math.max(100, stg.w - pl - pr), availH = Math.max(100, stg.h - pt - pb);
        const scale = Math.min(availW / meta.w, availH / meta.h, 1);
        fit = { w: meta.w * scale, h: meta.h * scale };
        fit.x = pl + (availW - fit.w) / 2; fit.y = pt + (availH - fit.h) / 2;
        // a narrow screen: the leaf fills the width, and the view goes in close while it is painted
        zMax = stg.w < 700 ? clamp(Math.min(2.1, (stg.w * 2.05) / fit.w), 1, 2.1) : 1;
        if (zMax < 1.15) zMax = 1;
        dpr = Math.min(2, devicePixelRatio || 1);
        canvas.style.width = stg.w + 'px'; canvas.style.height = stg.h + 'px';
        canvas.width = Math.round(stg.w * dpr); canvas.height = Math.round(stg.h * dpr);
        const want = Math.min(meta.w, Math.round(fit.w * zMax * dpr));
        gl.viewport(0, 0, canvas.width, canvas.height);
        if (Math.abs(want - texW) > 2) pack(want, Math.round(want * meta.h / meta.w));
    }
    function viewAt(S) {
        if (zMax === 1) return [fit.x, fit.y, fit.w, fit.h];
        const c = camAt(S), w = fit.w * c.z, h = fit.h * c.z;
        const m = Math.min(fit.x, 10);
        const place = (stageLen, len, f) => len <= stageLen - 2 * m ? (stageLen - len) / 2 : clamp(stageLen / 2 - f * len, stageLen - m - len, m);
        return [place(stg.w, w, c.x), place(stg.h, h, c.y), w, h];
    }
    // the text box follows the leaf: one transform, the spans inside never move
    function placeWords(v) {
        if (!textBox) return;
        const s = v[2] / meta.w;
        words.style.transform = `translate(${(v[0] + textBox.box[0] * s).toFixed(2)}px, ${(v[1] + textBox.box[1] * s).toFixed(2)}px) scale(${s.toFixed(5)})`;
    }

    function setTex(srcImg, mip, filter) {
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, srcImg);
        if (mip) gl.generateMipmap(gl.TEXTURE_2D);
        const f = filter || gl.LINEAR;
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : f);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    // The leaf, the ground and the masks are resampled to the size they are shown at (good
    // downsampling, so the fine strokes never alias) and mipmapped. The half-size layers go
    // up as they are; the object ids exact and nearest, the time maps exact and linear.
    function pack(w, h) {
        texW = w;
        for (const [k, mip, f] of [['vellum', true], ['wash', true], ['body', true], ['id', false, gl.NEAREST], ['time', false]]) {
            if (tex[k]) continue;
            tex[k] = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex[k]); setTex(ims[k], mip, f);
        }
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        const cx = cv.getContext('2d');
        for (const k of ['orig', 'ground', 'masks']) {
            cx.clearRect(0, 0, w, h);
            cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
            cx.drawImage(ims[k], 0, 0, w, h);
            if (!tex[k]) tex[k] = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, tex[k]);
            setTex(cv, true);
        }
        cv.width = cv.height = 0;
    }

    const ORDER = ['orig', 'ground', 'vellum', 'wash', 'body', 'masks', 'id', 'time', 'nz'];
    const SAMP = ['uO', 'uG', 'uP', 'uW', 'uB', 'uM', 'uI', 'uT', 'uNz'];
    function initGL() {
        const g = canvas.getContext('webgl2', { alpha: false, antialias: false, preserveDrawingBuffer: false });
        if (!g) return false;
        gl = g;
        try {
            prog = gl.createProgram();
            gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
            gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
            gl.linkProgram(prog);
            if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
        } catch (err) { console.warn('flower-border: shader failed', err); gl = null; return false; }
        gl.useProgram(prog);
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        tex.buf = buf;
        const loc = gl.getAttribLocation(prog, 'aP');
        gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        for (const n of [...SAMP, 'uStage', 'uView', 'uPage', 'uPaper', 'uGam', 'uA', 'uB2', 'uGround', 'uPx', 'uLodO']) U[n] = gl.getUniformLocation(prog, n);
        const nz = makeNoise();
        tex.nz = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex.nz);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, nz.S, nz.S, 0, gl.RGBA, gl.UNSIGNED_BYTE, nz.data);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        SAMP.forEach((n, i) => gl.uniform1i(U[n], i));
        gl.uniform3fv(U.uPaper, meta.paper.map((v) => Math.pow(v, meta.gamma)));
        gl.uniform1f(U.uGam, meta.gamma);
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
        ORDER.forEach((k, i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, tex[k]); });
        view = viewAt(S);
        gl.uniform2f(U.uStage, stg.w, stg.h);
        gl.uniform4f(U.uView, ...view);
        gl.uniform3fv(U.uPage, pageColour());
        gl.uniform1f(U.uPx, meta.w / view[2]);
        gl.uniform4fv(U.uA, uA); gl.uniform4fv(U.uB2, uB);
        const [g0, g1] = sch.ground;
        const fG = (S - g0) / (g1 - g0) * 1.04, gG = (S - g0 - .035) / (g1 - g0);
        // the wet blur (pigment in suspension) as a mip level: about 4 css px at any zoom
        const lodH = clamp(Math.log2(4 * (meta.w / 2) / view[2]), 0, 6), lodO = clamp(Math.log2(4 * texW / view[2]), 0, 7);
        gl.uniform4f(U.uGround, fG, gG, 1 - smooth(.12, .2, S), lodH);
        gl.uniform1f(U.uLodO, lodO);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        placeWords(view);
        events(S);
        lastShown = S;
    }
    function fire(name, detail) { root.dispatchEvent(new CustomEvent('flower-border:' + name, { bubbles: true, detail })); }
    function events(S) {
        const stages = [['drawing', sch.draw[0][0]], ['ground', sch.ground[0]], ['flowers', sch.wash[0][0]], ['shadows', sch.shadow[0][0]]];
        if (S > lastShown) {
            for (const [k, at] of stages) if (!fired.has(k) && S >= at) { fired.add(k); fire('stage', { stage: k }); }
            meta.objects.forEach((b, i) => {
                const key = 'o' + i;
                if (!fired.has(key) && S >= sch.wash[i][0]) { fired.add(key); fire('object', { name: b.name, kind: b.kind }); }
            });
            if (!fired.has('done') && S >= sch.end) { fired.add('done'); fire('done'); }
        } else {
            for (const [k, at] of stages) if (S < at) fired.delete(k);
            meta.objects.forEach((b, i) => { if (S < sch.wash[i][0]) fired.delete('o' + i); });
            if (S < sch.end) fired.delete('done');
        }
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

    // the text over the still image (reduced motion, static, no WebGL): follows the <img>
    function placeStill() {
        if (!textBox || !img) return;
        const ir = img.getBoundingClientRect(), sr = (leaf || stage).getBoundingClientRect();
        placeWords([ir.left - sr.left, ir.top - sr.top, ir.width, ir.height]);
    }

    async function start() {
        try {
            meta = await (await fetch(o.src)).json();
        } catch (err) { console.warn(err); return; }
        if (dead) return;
        // the scribe's part first: it is there in every mode
        try {
            (leaf || stage).appendChild(words);
            textBox = await setText(src, words, meta);
            if (textBox) root.classList.add('fb-set');
            else words.remove();
        } catch (err) { console.warn('flower-border: text', err); words.remove(); textBox = null; }
        if (dead) return;
        if (still()) { stillMode(); return; }
        await goLive();
    }
    function stillMode() {
        root.classList.add('fb-still');
        if (textBox && words.parentNode !== (leaf || stage)) (leaf || stage).appendChild(words);
        placeStill();
        if (img && !img.complete) img.addEventListener('load', placeStill, { once: true });
    }
    let ro = null, io = null;
    async function goLive() {
        try {
            const [orig, ground, vellum, wash, body, masks, id, time] = await Promise.all([
                loadImage(base + '.webp'), loadImage(base + '-ground.webp'), loadImage(base + '-vellum.webp'),
                loadImage(base + '-wash.webp'), loadImage(base + '-body.webp'), loadImage(base + '-masks.webp'),
                loadExact(base + '-id.webp'), loadExact(base + '-time.webp')]);
            ims = { orig, ground, vellum, wash, body, masks, id, time };
        } catch (err) { console.warn(err); stillMode(); return; }
        if (dead || still()) { stillMode(); return; }
        root.classList.remove('fb-still');
        root.classList.add('fb-scroll');
        root.style.setProperty('--fb-runway', o.runway + 'svh');
        stage.appendChild(canvas);
        if (textBox) stage.appendChild(words);
        if (!initGL()) { canvas.remove(); root.classList.remove('fb-scroll'); root.style.removeProperty('--fb-runway'); stillMode(); return; }
        buildSchedule();
        root.classList.add('is-live'); live = true;
        layout();
        readScroll(); shown = target; lastShown = shown;
        events(shown);
        draw();
        io = new IntersectionObserver((en) => {
            visible = en[0].isIntersecting;
            if (visible) { readScroll(); kick(); }
        }, { rootMargin: '10% 0px' });
        io.observe(root); cleanup.push(() => io.disconnect());
        on(window, 'scroll', () => { if (!visible) return; readScroll(); kick(); }, { passive: true });
        on(document, 'visibilitychange', () => { if (!document.hidden) kick(); });
        canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); root.classList.remove('is-live'); });
        canvas.addEventListener('webglcontextrestored', () => {
            tex = {}; texW = 0; U = {};
            if (initGL()) { layout(); root.classList.add('is-live'); draw(); }
        });
    }
    let rt = 0;
    ro = new ResizeObserver(() => {
        clearTimeout(rt);
        rt = setTimeout(() => {
            if (dead || !meta) return;
            if (live && gl && !root.classList.contains('fb-still')) { layout(); readScroll(); shown = target; draw(); }
            else placeStill();
        }, 80);
    });
    ro.observe(stage); cleanup.push(() => { ro.disconnect(); clearTimeout(rt); });
    on(window, 'resize', () => ro && (clearTimeout(rt), rt = setTimeout(() => { if (dead || !meta) return; if (live && gl && !root.classList.contains('fb-still')) { layout(); readScroll(); shown = target; draw(); } else placeStill(); }, 80)));
    // reduced motion switched on mid-visit: settle on the finished page
    on(calm, 'change', () => {
        if (calm.matches && live) {
            root.classList.add('fb-still'); root.classList.remove('fb-scroll', 'is-live'); root.style.removeProperty('--fb-runway');
            (leaf || stage).appendChild(words); placeStill();
        } else if (!calm.matches && live) {
            root.classList.remove('fb-still'); root.classList.add('fb-scroll', 'is-live'); root.style.setProperty('--fb-runway', o.runway + 'svh');
            stage.appendChild(words); pageRGB = null; layout(); readScroll(); shown = target; draw();
        } else if (!calm.matches && !live && meta && o.mode !== 'static' && o.webgl) { goLive(); }
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
        ims.id?.close?.(); ims.time?.close?.();
        canvas.remove(); words.remove();
        root.classList.remove('fb', 'is-live', 'fb-scroll', 'fb-still', 'fb-set');
        root.style.removeProperty('--fb-runway');
    };
}

/* auto-start */
const started = new WeakMap();
function boot() {
    document.querySelectorAll('[data-flower-border]').forEach((el) => {
        if (!started.has(el)) started.set(el, flowerBorder(el));
    });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
