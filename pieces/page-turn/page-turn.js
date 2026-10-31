/*
 *  PAGE-TURN // an old printed herbal lying open; you turn its leaves.
 *
 *  Markup:  <div data-page-turn aria-label="…">
 *             <article class="pt-title">…</article>          the first recto
 *             <article data-head="Tulips">                    a text page
 *               <h2><span>Chap. II.</span> Of the Tulip.</h2>
 *               <p class="pt-latin">Tulipa Turcarum.</p>
 *               <p>…</p><p>…</p>
 *             </article>
 *             <article class="pt-plate"><img src="assets/tulip.webp" alt="" width="1560" height="1920"></article>
 *             …
 *             <article class="pt-colophon">…</article>
 *           </div>
 *  Or call  pageTurn(el, { start, single, focal }) yourself; it returns destroy().
 *
 *  The articles are the book's pages in reading order, starting with a recto.
 *  On a wide screen they lie open as spreads (verso left, recto right); below
 *  data-single px of width the book shows one page at a time, its spine at
 *  the left edge. Without JS or WebGL2 they are simply a sequence of pages.
 *
 *  Options (data attributes; the options object wins):
 *    data-start="1"     spread (or, single, page) to open at. Default 1.
 *    data-single="640"  below this container width, one page at a time.
 *    data-focal="4.2"   camera height in page widths: lower = stronger perspective.
 *
 *  A leaf is a developable surface. In its own frame (x from the spine, y
 *  down the page) every point is measured along a direction n (s) and across
 *  it (t). Paper with s below the fold line s_f lies on the page; beyond it
 *  the sheet bends round a cylinder of radius R through an angle alpha, then
 *  runs straight (or with a little curvature k2, from gravity and air). The
 *  generators stay parallel to the fold, so the sheet never stretches: it is
 *  the cylinder construction of the classic page-curl papers, with the bend
 *  radius growing away from the held point (a cone's look, a cone's lag) and
 *  the fold walking from the held corner toward the spine as the leaf lifts.
 *  Dragging solves for the shape that puts the held point under the finger,
 *  in perspective. Letting go hands the leaf to a little physics: gravity's
 *  torque on the lifted share, heavy air drag, an air cushion as it lands,
 *  and the air bowing the trailing edge while it falls.
 *
 *  WebGL2, three passes: the leaves' shadows (projected along the light by
 *  height into a half-size buffer, blurred with two radii so the contact is
 *  sharp and the lifted part soft and wide); the book (boards, page-block
 *  edges, the two open pages bent into the gutter, with the shadows laid
 *  on); then each moving leaf, lit per pixel: a wrapped diffuse normalised so
 *  a flat page shows its print exactly, a broad sheen along the bend, and
 *  light coming through the paper from behind, carrying the mirrored print
 *  of the other side and the chain lines of the mould.
 *  Text pages are set with pretext (Cheng Lou) into canvases.
 */

const PRETEXT = new URL('./vendor/pretext/layout.js', import.meta.url).href;
const calm = matchMedia('(prefers-reduced-motion: reduce)');
const PI = Math.PI;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

/* ── the paper and the turn ─────────────────────────────────────────── */
const ASPECT = 1.27;          // page height / width (a small folio)
const R0 = 0.15;              // bend radius of a lifted leaf, in page widths
const RMIN = 0.002;           // ... as it lands
const CONE = 0.75;            // bend radius grows away from the held point
const GUT_G = 0.05;           // how deep the pages dip into the gutter (page widths)
const GUT_W = 0.075;          // ... and over what width
const TRANS = 0.075;          // paper translucency when lifted against the light
const GHOST = 0.024;          // show-through of the other side, lying flat
const GRAV = 4.4;             // gravity on the turn, in turns / s^2
const DRAG1 = 2.2, DRAG2 = 1.4;   // air: linear and quadratic
const MAX_FLYING = 3;
const L = (() => { const v = [-0.3, -0.62, 1]; const m = Math.hypot(...v); return v.map((c) => c / m); })();

const INK = '#1e1914';
const RUBRIC = '#8f2c1c';
const PAPER = [236, 227, 206];   // the plates' paper is normalised to this

let uid = 0;

/* ── shaders ──────────────────────────────────────────────────────────── */

const SHAPE = `
uniform vec2 uPage;
uniform vec2 uN;
uniform float uSf, uA, uR, uTg, uCone, uK2, uSide, uZ0;
uniform vec3 uCam;
uniform vec4 uView;      // canvas rect in world px: x, y, w, h
uniform vec2 uGut;       // gutter dip depth, width (px)
float gut(float ax) { return -uGut.x * exp(-ax / uGut.y); }
float gutSlope(float ax) { return uGut.x / uGut.y * exp(-ax / uGut.y); }
// leaf point (0..1) -> world position, up-face normal, flatness
void shape(vec2 a, out vec3 P, out vec3 N, out float flatW) {
    vec2 p = a * uPage;
    vec2 d = vec2(-uN.y, uN.x);
    float s = dot(p, uN), t = dot(p, d);
    float R = uR * (1. + uCone * abs(t - uTg) / uPage.y);
    float l = s - uSf;
    float X, Z, phi;
    if (l <= 0.) { X = s; Z = 0.; phi = 0.; }
    else if (l < R * uA) { phi = l / R; X = uSf + R * sin(phi); Z = R * (1. - cos(phi)); }
    else {
        float q = l - R * uA;
        float X1 = uSf + R * sin(uA), Z1 = R * (1. - cos(uA));
        phi = uA + uK2 * q;
        if (abs(uK2 * q) < 1e-3) { float m = uA + .5 * uK2 * q; X = X1 + q * cos(m); Z = Z1 + q * sin(m); }
        else { X = X1 + (sin(phi) - sin(uA)) / uK2; Z = Z1 - (cos(phi) - cos(uA)) / uK2; }
    }
    Z = max(Z, 0.);
    vec2 xy = uN * X + d * t;
    vec3 Ts = vec3(uN * cos(phi), sin(phi));
    N = normalize(cross(Ts, vec3(d, 0.)));
    float wx = uSide * xy.x, ax = abs(wx);
    N.x *= uSide;
    flatW = max(1. - smoothstep(0., .35 * uR + 1., l), smoothstep(2.9, 3.1416, uA));
    N = normalize(N + vec3(-sign(wx) * gutSlope(ax) * flatW * sign(N.z), 0., 0.));
    P = vec3(wx, xy.y, Z + gut(ax) + uZ0);
}
vec4 project(vec3 P) {
    float k = uCam.z / (uCam.z - P.z);
    vec2 sp = uCam.xy + (P.xy - uCam.xy) * k;
    vec2 c = (sp - uView.xy) / uView.zw * 2. - 1.;
    return vec4(c.x, -c.y, -P.z / (uPage.x * 3.) , 1.);
}`;

const LEAF_VS = `#version 300 es
in vec2 aP;
${SHAPE}
out vec3 vPos;
out vec3 vN;
out vec2 vA;
out float vFlat;
void main() {
    vec3 P, N; float f;
    shape(aP, P, N, f);
    gl_Position = project(P);
    vPos = P; vN = N; vA = aP; vFlat = f;
}`;

const LIGHT_FN = `
uniform vec3 uL;
uniform vec3 uPaper;
uniform float uGhost;
float lum(vec3 c) { return dot(c, vec3(.3, .59, .11)); }
// light on a page whose visible normal is Nv: exactly 1 when it lies flat
float lightOn(vec3 Nv) {
    float diff = max(dot(Nv, uL) + .25, 0.) / (uL.z + .25);
    float hemi = .64 + .36 * Nv.z;
    return .52 * hemi + .48 * diff;
}
// the gutter: darkening into the binding
float gutterAO(float ax, float W) {
    return 1. - .4 * exp(-ax / (.02 * W)) - .17 * exp(-ax / (.1 * W)) - .05 * exp(-ax / (.3 * W));
}
// the mould: chain lines (vertical in a folio) and laid lines
float laid(vec2 p, float W) {
    float cx = p.x / (W / 11.5);
    float ch = exp(-pow((fract(cx) - .5) * 9., 2.));
    float ly = sin(p.y / (W / 230.) * 6.2832);
    float fw = fwidth(p.y / (W / 230.));
    float la = ly * (1. - smoothstep(.25, .5, fw));
    return 1. - .16 * ch + .045 * la;
}
`;

const LEAF_FS = `#version 300 es
precision highp float;
uniform sampler2D uUp;
uniform sampler2D uDn;
uniform float uFlipU, uTrans, uShadowOn;
uniform sampler2D uShadow;
uniform vec4 uView;
${LIGHT_FN}
uniform vec3 uCam;
uniform vec2 uPage;
in vec3 vPos;
in vec3 vN;
in vec2 vA;
in float vFlat;
out vec4 o;
uniform float uCutX;
void main() {
    if (vPos.x < uCutX && vPos.z < 3.) discard;
    vec3 N = normalize(vN);
    vec3 V = normalize(uCam - vPos);
    bool upSeen = dot(N, V) >= 0.;
    vec3 Nv = upSeen ? N : -N;
    float uu = mix(vA.x, 1. - vA.x, uFlipU);
    vec2 uvU = vec2(uu, vA.y), uvD = vec2(1. - uu, vA.y);
    vec3 cU = texture(uUp, uvU).rgb, cD = texture(uDn, uvD).rgb;
    vec3 cs = upSeen ? cU : cD;
    vec3 co = upSeen ? cD : cU;
    // the other side seen through the paper is softened by it
    vec3 cob = upSeen ? texture(uDn, uvD, 2.5).rgb : texture(uUp, uvU, 2.5).rgb;
    float pl = lum(uPaper);
    float li = lightOn(Nv);
    // light thrown back up from the page beneath onto an underside
    li += .42 * max(-Nv.z, 0.) + .24 * (1. - abs(Nv.z));
    // shade in a room of cream paper is warm
    vec3 col = cs * li * mix(vec3(1.07, .99, .86), vec3(1.), smoothstep(.45, .95, li));
    col *= 1. - uGhost * (1. - lum(cob) / pl);
    // light through the leaf: the mirrored print of the other side, the mould's lines
    float back = max(dot(-Nv, uL), 0.);
    float lift = 1. - vFlat;
    float tr = uTrans * lift * (back * 1.1 + .65 * (1. - abs(Nv.z)) + .15);
    vec2 pp = vA * uPage;
    col += tr * (co / pl) * cs * laid(pp, uPage.x);
    // a broad sheen where the bend turns toward the light
    vec3 H = normalize(uL + V);
    float sh = pow(max(dot(Nv, H), 0.), 10.);
    float sh0 = pow(max(normalize(uL + vec3(0., 0., 1.)).z, 0.), 10.);
    col += max(sh - sh0, 0.) * .1 * vec3(1., .985, .95);
    // and away from it, the underside of the curl in its own shade
    col *= mix(1., gutterAO(abs(vPos.x), uPage.x), vFlat);
    // the lifted part's shadow on the part still lying down
    if (uShadowOn > 0. && vFlat > .01) {
        vec2 suv = (vPos.xy - uView.xy) / uView.zw;
        vec2 s = texture(uShadow, vec2(suv.x, 1. - suv.y)).rg;
        col *= 1. - clamp(.75 * s.r + .8 * s.g, 0., .8) * vFlat;
    }
    // the cut edge of the sheet
    float e = min((1. - vA.x) * uPage.x, min(vA.y, 1. - vA.y) * uPage.y);
    float px = max(fwidth(e), 1e-3);
    col *= 1. - .22 * (1. - smoothstep(0., 1.3 * px, e)) * (.35 + .65 * lift);
    o = vec4(col, 1.);
}`;

const SHADOW_VS = `#version 300 es
in vec2 aP;
${SHAPE}
uniform vec3 uL;
out float vZ;
void main() {
    vec3 P, N; float f;
    shape(aP, P, N, f);
    vec2 g = P.xy - uL.xy / uL.z * max(P.z, 0.);
    vec2 c = (g - uView.xy) / uView.zw * 2. - 1.;
    gl_Position = vec4(c.x, -c.y, 0., 1.);
    vZ = max(P.z - gut(abs(P.x)), 0.);
}`;

const SHADOW_FS = `#version 300 es
precision highp float;
uniform float uW;
in float vZ;
out vec4 o;
void main() {
    float on = smoothstep(.2, 2.5, vZ);
    float near = on * exp(-vZ / (.09 * uW));
    float far = on * (1. - exp(-vZ / (.05 * uW))) * exp(-vZ / (2.2 * uW));
    o = vec4(near, far, 0., 1.);
}`;

const QUAD_VS = `#version 300 es
in vec2 aP;
out vec2 vUv;
void main() { vUv = aP * .5 + .5; gl_Position = vec4(aP, 0., 1.); }`;

const BLUR_FS = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uStepA, uStepB;   // per-tap offsets: near (R) and far (G)
in vec2 vUv;
out vec4 o;
void main() {
    float w[5] = float[5](.2270, .1946, .1216, .0541, .0162);
    float r = texture(uSrc, vUv).r * w[0], g = texture(uSrc, vUv).g * w[0];
    for (int i = 1; i < 5; i++) {
        float fi = float(i);
        r += (texture(uSrc, vUv + uStepA * fi).r + texture(uSrc, vUv - uStepA * fi).r) * w[i];
        g += (texture(uSrc, vUv + uStepB * fi).g + texture(uSrc, vUv - uStepB * fi).g) * w[i];
    }
    o = vec4(r, g, 0., 1.);
}`;

const BOOK_VS = `#version 300 es
in vec2 aP;
uniform vec4 uRect;     // world rect of the book quad
uniform vec4 uView;
out vec2 vW;
void main() {
    vW = uRect.xy + aP * uRect.zw;
    vec2 c = (vW - uView.xy) / uView.zw * 2. - 1.;
    gl_Position = vec4(c.x, -c.y, 0., 1.);
}`;

const BOOK_FS = `#version 300 es
precision highp float;
uniform sampler2D uLt, uRt, uLo, uRo, uLf, uRf, uShadow;
uniform float uFade, uShadowOn;
uniform vec2 uPage;
uniform vec4 uView;
uniform vec2 uGut;
uniform vec4 uEdge;       // fore-edge width left, right; head/tail width; board margin
uniform float uLeftW;     // how much of the left page shows (all of it, or a sliver at the spine)
uniform vec3 uBoard;
${LIGHT_FN}
in vec2 vW;
out vec4 o;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float rbox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.)) + min(max(q.x, q.y), 0.) - r; }
void main() {
    float W = uPage.x, H = uPage.y;
    vec2 p = vW;
    float ax = abs(p.x);
    bool left = p.x < 0.;
    float fe = left ? uEdge.x : uEdge.y;
    float he = uEdge.z, mb = uEdge.w;
    vec3 col; float a = 1.;
    // the block runs from -(uLeftW + fe) to W + fe; the boards a margin beyond
    float bx0 = -uLeftW - uEdge.x, bx1 = W + uEdge.y;
    vec2 c = vec2((bx0 + bx1) * .5, H * .5);
    vec2 hb = vec2((bx1 - bx0) * .5, H * .5 + he);
    float dBoard = rbox(p - c, hb + mb, 5.);
    float dBlock = rbox(p - c, hb, 1.5);
    float edgeX = left ? uLeftW : W;
    if (p.x >= -uLeftW && p.x <= W && p.y >= 0. && p.y <= H) {
        // an open page, dipping into the gutter
        vec2 uv = vec2(left ? (p.x + W) / W : p.x / W, p.y / H);
        vec3 ct = left ? texture(uLt, uv).rgb : texture(uRt, uv).rgb;
        vec3 cf = left ? texture(uLf, uv).rgb : texture(uRf, uv).rgb;
        vec3 co = left ? texture(uLo, vec2(1. - uv.x, uv.y), 2.5).rgb : texture(uRo, vec2(1. - uv.x, uv.y), 2.5).rgb;
        ct = mix(cf, ct, uFade);
        float pl = lum(uPaper);
        ct *= 1. - uGhost * (1. - lum(co) / pl);
        float sl = uGut.x / uGut.y * exp(-ax / uGut.y);
        vec3 Nv = normalize(vec3(left ? sl : -sl, 0., 1.));
        col = ct * lightOn(Nv) * gutterAO(ax, W);
        // the pages fall away a touch at the head and tail of the gutter
        col *= 1. - .25 * exp(-ax / (.04 * W)) * (1. - smoothstep(0., .02 * H, min(p.y, H - p.y)));
    } else if (dBlock <= 0.) {
        // the edges of the leaves underneath: fore-edge, head and tail
        float dx = ax - edgeX, dy = p.y < 0. ? -p.y : p.y - H;
        float depth = max(dx > 0. ? dx / max(fe, 1.) : 0., dy > 0. ? dy / max(he, 1.) : 0.);
        float k = dx > 0. ? dx : dy;
        float stripe = .5 + .5 * sin(k * 3.6 + noise(vec2(p.y * .02, p.x * .02) + k) * 2.);
        float n = noise(p * vec2(.6, .05)) * .5 + noise(p * vec2(.05, .6)) * .5;
        vec3 edge = vec3(.86, .82, .73) * (.95 + .07 * n);
        col = edge * mix(1., .78, depth) * (1. - .1 * stripe);
        col *= gutterAO(ax, W * 1.4);
    } else if (dBoard <= 0.) {
        // the boards: calf, sprinkled, worn pale at the very edge
        float n = noise(p * .09) * .55 + noise(p * .4) * .3 + noise(p * 1.7) * .15;
        float sprinkle = step(.93, hash(floor(p * .7))) * .25;
        col = uBoard * (.85 + .3 * n) * (1. - sprinkle);
        col = mix(col, uBoard * 1.55, (1. - smoothstep(0., 2.2, -dBoard)) * .55);
        col *= 1. - .35 * exp(-ax / (.03 * W)) * (1. - smoothstep(-mb, 0., -abs(p.y - H * .5) + H * .5)) ;
    } else {
        // the table: the book's own soft shadow
        float d = rbox(p - c - vec2(.012 * W, .02 * W), hb + mb, 6.);
        a = .3 * exp(-max(d, 0.) / (.02 * W)) + .1 * exp(-max(d, 0.) / (.05 * W));
        col = vec3(0.);
        vec2 suv = (p - uView.xy) / uView.zw;
        float edgeC = smoothstep(0., .035, min(min(suv.x, 1. - suv.x), min(suv.y, 1. - suv.y)));
        a *= edgeC;
        o = vec4(.07, .05, .03, 1.) * a;
        if (uShadowOn > 0.) {
            vec2 s = texture(uShadow, vec2(suv.x, 1. - suv.y)).rg;
            float edgeF = smoothstep(0., .04, min(min(suv.x, 1. - suv.x), min(suv.y, 1. - suv.y)));
            float sa = (.24 * s.r + .12 * s.g) * edgeF * exp(-max(d, 0.) / (.12 * W));
            o = vec4(.07, .05, .03, 1.) * (1. - (1. - a) * (1. - sa));
        }
        return;
    }
    if (uShadowOn > 0.) {
        vec2 suv = (p - uView.xy) / uView.zw;
        vec2 s = texture(uShadow, vec2(suv.x, 1. - suv.y)).rg;
        float sh = clamp(.75 * s.r + .8 * s.g, 0., .8);
        col *= 1. - sh * vec3(.93, .97, 1.);
    }
    o = vec4(col, 1.) * a;
}`;

/* ── pretext, fonts, paper ───────────────────────────────────────────── */

let pretextP = null;
const loadPretext = () => (pretextP ||= import(PRETEXT));

/* Liang's hyphenation (TeX's): the patterns score the gaps between letters,
 * odd scores are breaks. vendor/hyphen holds Knuth's US English patterns. */
const HYPHEN = new URL('./vendor/hyphen/en-us.js', import.meta.url).href;
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
            // a break before w[i]: two letters before it, three after
            if (i >= 2 && i <= n - 3 && pts[i + 1] % 2 === 1) out += '\u00ad';
            out += w[i];
        }
        return out;
    };
    // every word of six letters or more, unless it already carries its breaks
    return (text) => text.replace(/[A-Za-z\u00c0-\u017f]{6,}/g, (w) => word(w));
}).catch(() => (t) => t));

function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}

// A sheet of rag paper at the texture's size: the plates' cream, clouded the
// way hand-made paper is (the pulp settles unevenly on the mould), a little
// darker toward the edges that met the air, a few fibres and spots of foxing.
function paperSheet(w, h, seed, outerLeft) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    const r = rng(seed * 7919 + 17);
    x.fillStyle = `rgb(${PAPER[0]},${PAPER[1]},${PAPER[2]})`;
    x.fillRect(0, 0, w, h);
    // clouding: smooth value noise at three scales
    for (const [cells, amt] of [[5, 0.07], [13, 0.045], [34, 0.03]]) {
        const n = document.createElement('canvas');
        n.width = cells; n.height = Math.round(cells * h / w);
        const nx = n.getContext('2d');
        const im = nx.createImageData(n.width, n.height);
        for (let i = 0; i < im.data.length; i += 4) {
            const v = r();
            im.data[i] = 120 + v * 30; im.data[i + 1] = 100 + v * 26; im.data[i + 2] = 70 + v * 18;
            im.data[i + 3] = 255 * Math.abs(v - 0.5) * 2;
        }
        nx.putImageData(im, 0, 0);
        x.globalAlpha = amt;
        x.globalCompositeOperation = 'multiply';
        x.imageSmoothingEnabled = true;
        x.imageSmoothingQuality = 'high';
        x.drawImage(n, 0, 0, w, h);
    }
    x.globalCompositeOperation = 'multiply';
    // edges toned by air and hands: the fore-edge and the head most
    const tone = (x0, y0, x1, y1, a) => {
        const g = x.createLinearGradient(x0, y0, x1, y1);
        g.addColorStop(0, `rgba(196,170,128,${a})`);
        g.addColorStop(1, 'rgba(196,170,128,0)');
        x.globalAlpha = 1;
        x.fillStyle = g;
        x.fillRect(0, 0, w, h);
    };
    const fore = outerLeft ? 0 : w;
    tone(fore, 0, outerLeft ? w * 0.09 : w * 0.91, 0, 0.42);
    tone(0, 0, 0, h * 0.06, 0.38);
    tone(0, h, 0, h * 0.95, 0.3);
    // foxing: a few small rust-brown spots
    const spots = 3 + Math.floor(r() * 7);
    for (let i = 0; i < spots; i++) {
        const sx = r() * w, sy = r() * h, sr = (0.5 + r() * 2.2) * w / 700;
        const g = x.createRadialGradient(sx, sy, 0, sx, sy, sr * 3);
        g.addColorStop(0, `rgba(160,110,60,${0.12 + r() * 0.18})`);
        g.addColorStop(0.4, `rgba(170,125,75,${0.06 + r() * 0.05})`);
        g.addColorStop(1, 'rgba(170,125,75,0)');
        x.fillStyle = g;
        x.fillRect(sx - sr * 3, sy - sr * 3, sr * 6, sr * 6);
    }
    // fibres
    x.globalCompositeOperation = 'source-over';
    x.lineCap = 'round';
    const fibres = Math.round(w * h / 9000);
    for (let i = 0; i < fibres; i++) {
        const fx = r() * w, fy = r() * h, a = r() * PI, len = (2 + r() * 9) * w / 1000;
        x.strokeStyle = r() < 0.5 ? 'rgba(120,96,64,0.07)' : 'rgba(255,252,240,0.12)';
        x.lineWidth = Math.max(0.6, w / 1600);
        x.beginPath();
        x.moveTo(fx, fy);
        x.quadraticCurveTo(fx + Math.cos(a) * len * 0.5 + (r() - 0.5) * len * 0.4, fy + Math.sin(a) * len * 0.5, fx + Math.cos(a) * len, fy + Math.sin(a) * len);
        x.stroke();
    }
    x.globalAlpha = 1;
    return c;
}

const fontsReady = (fams) => Promise.all(fams.map((f) => document.fonts.load(f).catch(() => null))).then(() => document.fonts.ready);

/* ── page typesetting ────────────────────────────────────────────────── */

function lozenge(x, cx, cy, s, col) {
    x.fillStyle = col;
    x.beginPath();
    x.moveTo(cx, cy - s); x.lineTo(cx + s * 0.62, cy); x.lineTo(cx, cy + s); x.lineTo(cx - s * 0.62, cy);
    x.closePath();
    x.fill();
}

// A printer's ornament: a rule, three lozenges, a rule.
function ornament(x, cx, cy, w, s, col) {
    x.strokeStyle = col;
    x.lineWidth = Math.max(0.8, s * 0.16);
    x.beginPath();
    x.moveTo(cx - w / 2, cy); x.lineTo(cx - s * 3.2, cy);
    x.moveTo(cx + s * 3.2, cy); x.lineTo(cx + w / 2, cy);
    x.stroke();
    lozenge(x, cx, cy, s, col);
    lozenge(x, cx - s * 1.9, cy, s * 0.55, col);
    lozenge(x, cx + s * 1.9, cy, s * 0.55, col);
}

/* Set paragraphs with pretext into [left, left+measure], from y, justified,
 * the first paragraph opening with a drop cap. Returns the y it ended at, or
 * null if it ran past `bottom`. */
function setBody(api, x, paras, fonts, left, measure, y, bottom, fs, lh, dropCap, r, drawIt) {
    const font = `${fs}px ${fonts.body}`;
    x.font = font;
    const space = x.measureText(' ').width;
    let capLines = 0, capW = 0, capText = '';
    if (dropCap && paras.length) {
        capText = paras[0].trim()[0];
        paras = [paras[0].trim().slice(1), ...paras.slice(1)];
        capLines = 3;
    }
    let capFs = 0;
    if (capLines) {
        // its cap height spans three lines, its foot on the third baseline
        x.font = `100px ${fonts.cap}`;
        const m = x.measureText(capText);
        const capH = m.actualBoundingBoxAscent || 68;
        const bodyCap = fs * 0.66;
        capFs = 100 * (lh * (capLines - 1) + bodyCap) / capH;
        x.font = `${capFs}px ${fonts.cap}`;
        capW = x.measureText(capText).width + fs * 0.45;
        if (drawIt) {
            x.fillStyle = RUBRIC;
            x.globalAlpha = 0.94;
            x.fillText(capText, left - capFs * 0.02, y + lh * (capLines - 1));
            x.globalAlpha = 1;
        }
    }
    let line = 0;
    for (let pi = 0; pi < paras.length; pi++) {
        const prepared = api.prepareWithSegments(paras[pi], font);
        let cursor = { segmentIndex: 0, graphemeIndex: 0 };
        let first = true;
        for (;;) {
            const indent = line < capLines ? capW : (first && pi > 0 ? fs * 1.3 : 0);
            const maxW = measure - indent;
            // spaces may shrink a little, as a compositor's would
            const ln = api.layoutNextLine(prepared, cursor, maxW * 1.009);
            if (!ln) break;
            if (y > bottom) return null;
            const next = api.layoutNextLine(prepared, ln.end, maxW * 1.009);
            const last = next === null;
            if (drawIt) {
                x.font = font;
                x.fillStyle = INK;
                const words = ln.text.replace(/\s+$/, '').split(/ +/).filter(Boolean);
                const ws = words.map((w) => x.measureText(w).width);
                const total = ws.reduce((a, b) => a + b, 0);
                const gaps = words.length - 1;
                let gap = space, ls = 0;
                if (!last && gaps > 0) {
                    gap = (maxW - total) / gaps;
                    if (gap > space * 1.4) {
                        // stretch no further than 1.4 spaces; then a hair of letter-spacing
                        gap = space * 1.4;
                        const chars = words.reduce((a, w) => a + w.length, 0) - words.length;
                        const rest = maxW - total - gap * gaps;
                        ls = Math.min(fs * 0.02, rest / Math.max(1, chars));
                        // whatever is left (rare, with hyphenation) goes back into the spaces
                        gap += Math.max(0, rest - ls * chars) / gaps;
                    }
                }
                let cx = left + indent;
                for (let i = 0; i < words.length; i++) {
                    x.globalAlpha = 0.84 + r() * 0.16;
                    if (ls) {
                        let lx = cx;
                        for (const ch of words[i]) { x.fillText(ch, lx, y); lx += x.measureText(ch).width + ls; }
                        cx += ws[i] + ls * (words[i].length - 1) + gap;
                    } else {
                        x.fillText(words[i], cx, y);
                        cx += ws[i] + gap;
                    }
                }
                x.globalAlpha = 1;
            }
            cursor = ln.end;
            y += lh;
            line++;
            first = false;
        }
    }
    return y;
}

function textOf(el) { return el ? el.textContent.replace(/\s+/g, ' ').trim() : ''; }

// Lay out one text page. side: 'v' (a verso, outer margin left) or 'r'.
function typeset(api, art, kind, folio, side, W, H, scale, seed, fonts) {
    const c = paperSheet(Math.round(W * scale), Math.round(H * scale), seed, side === 'v');
    const x = c.getContext('2d');
    x.scale(scale, scale);
    x.textBaseline = 'alphabetic';
    if (kind === 'blank') return c;
    const r = rng(seed * 31 + 7);
    const inner = W * 0.115, outer = W * 0.145;
    const left = side === 'v' ? outer : inner;
    const measure = W - inner - outer;
    const top = H * 0.085, bottom = H * 0.875;
    const cx = left + measure / 2;
    const centred = (t, font, y, col = INK, track = 0) => {
        x.font = font;
        x.fillStyle = col;
        if ('letterSpacing' in x) x.letterSpacing = `${track}px`;
        const w = x.measureText(t).width - track;
        x.fillText(t, cx - w / 2, y);
        if ('letterSpacing' in x) x.letterSpacing = '0px';
    };

    if (kind === 'title') {
        let fs = W / 9.5, y = H * 0.22;
        const spans = (el) => { const s = [...el.querySelectorAll('span')].map(textOf); return s.length ? s : [textOf(el)]; };
        const big = spans(art.querySelector('h1'));
        for (const b of big) { centred(b.toUpperCase(), `${fs}px ${fonts.cap}`, y, INK, fs * 0.08); y += fs * 1.08; }
        y += fs * 0.15;
        ornament(x, cx, y, measure * 0.5, W / 110, RUBRIC);
        y += fs * 0.75;
        const sub = [...art.querySelectorAll('p')].map(spans);
        const sfs = W / 27;
        for (let i = 0; i < sub.length; i++) {
            const last = i === sub.length - 1;
            const font = last ? `${sfs * 0.9}px ${fonts.sc}` : `italic ${sfs}px ${fonts.body}`;
            if (last) y = H * 0.84;
            for (const t of sub[i]) { centred(t, font, y, last ? INK : INK, last ? sfs * 0.18 : 0); y += sfs * 1.42; }
            y += sfs * 0.5;
        }
        return c;
    }

    // running head and folio
    const head = art.dataset.head || '';
    const hfs = W / 38;
    if (head) centred(head.toUpperCase(), `${hfs}px ${fonts.sc}`, top, INK, hfs * 0.22);
    if (folio) {
        x.font = `${hfs * 1.05}px ${fonts.body}`;
        x.fillStyle = INK;
        const t = String(folio), w = x.measureText(t).width;
        x.fillText(t, side === 'v' ? left : left + measure - w, top);
    }

    const h2 = art.querySelector('h2');
    const chap = h2 && h2.querySelector('span') ? textOf(h2.querySelector('span')) : '';
    const title = h2 ? textOf(h2).replace(chap, '').trim() : '';
    const latin = textOf(art.querySelector('.pt-latin'));
    const paras = [...art.querySelectorAll('p:not(.pt-latin):not(.pt-finis)')].map(textOf).filter(Boolean).map(fonts.hy || ((t) => t));
    const finis = textOf(art.querySelector('.pt-finis'));

    // a herbal's size: about 24-28 lines to the page; smaller only if it must
    for (let fs = W / 34; fs > W / 44; fs *= 0.97) {
        const lh = fs * 1.3;
        let y = top + hfs * 2.6;
        const layout = (drawIt) => {
            let yy = y;
            if (chap) { if (drawIt) centred(chap, `italic ${fs * 0.92}px ${fonts.body}`, yy); yy += fs * 1.5; }
            if (title) { if (drawIt) centred(title, `${fs * 1.32}px ${fonts.cap}`, yy, INK, fs * 0.02); yy += fs * 1.55; }
            if (latin) { if (drawIt) centred(latin, `italic ${fs}px ${fonts.body}`, yy, RUBRIC); yy += fs * 1.0; }
            yy += lh * 0.95;
            const end = setBody(api, x, paras, fonts, left, measure, yy, bottom, fs, lh, kind === 'text', r, drawIt);
            if (end === null) return null;
            yy = end;
            if (finis) { yy += lh * 0.8; if (drawIt) centred(finis.toUpperCase(), `${fs * 1.05}px ${fonts.cap}`, yy, INK, fs * 0.3); yy += lh; }
            if (drawIt && yy < bottom - lh * 1.5) ornament(x, cx, Math.min(yy + lh * 0.6, bottom - lh * 0.5), measure * 0.28, fs * 0.28, INK);
            return yy;
        };
        if (layout(false) !== null) { layout(true); return c; }
    }
    return c;
}

// A plate: the engraving, its own paper divided out to white, printed with
// multiply onto the book's paper inside the page's margins, as a plate is.
function platePage(img, W, H, scale, seed, side) {
    const c = paperSheet(Math.round(W * scale), Math.round(H * scale), seed, side === 'v');
    const x = c.getContext('2d');
    x.scale(scale, scale);
    x.imageSmoothingEnabled = true;
    x.imageSmoothingQuality = 'high';
    const inner = W * 0.075, outer = W * 0.095, top = H * 0.055, bottom = H * 0.075;
    const bw = W - inner - outer, bh = H - top - bottom;
    const ia = img.naturalHeight / img.naturalWidth;
    let w = bw, h = bw * ia;
    if (h > bh) { h = bh; w = bh / ia; }
    const left = side === 'v' ? outer : inner;
    const px = left + (bw - w) / 2, py = top + (bh - h) * 0.42;
    x.globalCompositeOperation = 'multiply';
    x.drawImage(img, px, py, w, h);
    x.globalCompositeOperation = 'source-over';
    return c;
}

/* ── the component ───────────────────────────────────────────────────── */

export function pageTurn(root, opts = {}) {
    const id = ++uid;
    const ds = root.dataset;
    const cfg = {
        start: opts.start ?? (ds.start != null ? +ds.start : 1),
        single: opts.single ?? (ds.single != null ? +ds.single : 640),
        focal: opts.focal ?? (ds.focal != null ? +ds.focal : 4.2),
    };
    const off = [];
    const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); off.push(() => t.removeEventListener(ev, fn, o)); };
    let dead = false;

    const arts = [...root.querySelectorAll(':scope > article')];
    const kindOf = (a) => a.classList.contains('pt-plate') || (a.querySelector('img') && !a.querySelector('p')) ? 'plate'
        : a.classList.contains('pt-title') ? 'title' : a.classList.contains('pt-colophon') ? 'colophon' : 'text';
    const kinds = arts.map(kindOf);
    const imgs = arts.map((a) => a.querySelector('img'));

    // Folio numbers: every page after the title counts, plates included.
    const folioOf = (i) => (kinds[i] === 'title' ? 0 : i + 1);

    // the stage
    root.classList.add('pt-on');
    const stage = document.createElement('div');
    stage.className = 'pt-stage';
    stage.setAttribute('aria-hidden', 'true');
    const canvas = document.createElement('canvas');
    canvas.className = 'pt-canvas';
    stage.appendChild(canvas);
    const nav = document.createElement('div');
    nav.className = 'pt-nav';
    const bPrev = document.createElement('button');
    const bNext = document.createElement('button');
    bPrev.type = bNext.type = 'button';
    bPrev.className = 'pt-btn pt-prev'; bNext.className = 'pt-btn pt-next';
    bPrev.setAttribute('aria-label', 'Previous page'); bNext.setAttribute('aria-label', 'Next page');
    bPrev.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6.5 9 12l5.5 5.5"/></svg>';
    bNext.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 6.5 15 12l-5.5 5.5"/></svg>';
    const live = document.createElement('p');
    live.className = 'pt-status';
    live.setAttribute('aria-live', 'polite');
    nav.append(bPrev, live, bNext);
    const src = document.createElement('div');
    src.className = 'pt-src';
    arts.forEach((a) => src.appendChild(a));
    root.append(stage, nav, src);

    // ── geometry ──
    let single = false, W = 0, H = 0, leftW = 0, dpr = 1, view = [0, 0, 1, 1], cam = [0, 0, 1];
    let edges = [4, 4, 2, 8];

    function measure() {
        const r = root.getBoundingClientRect();
        const cw = r.width;
        single = cw < cfg.single;
        const maxH = Math.max(320, innerHeight * (single ? 0.74 : 0.84));
        const mb = single ? 6 : 10;                         // boards beyond the block
        if (single) {
            // one page, inset in the column, with a sliver of the facing page at the spine
            const W0 = cw - 2 * mb;
            W = Math.min(W0 - 2 * Math.max(2.5, W0 * 0.009) - W0 * 0.035, maxH / ASPECT);
        } else {
            W = Math.min((cw - 2 * mb - 16) / 2, maxH / ASPECT);
        }
        W = Math.floor(W);
        H = Math.round(W * ASPECT);
        const fe = Math.max(2.5, W * 0.009), he = Math.max(1.5, W * 0.005);
        edges = [fe, fe, he, mb];
        leftW = single ? Math.round(W * 0.035) : W;
        const bookW = leftW + W + 2 * (fe + mb);
        const bookH = H + 2 * (he + mb);
        stage.style.width = `${Math.round(bookW)}px`;
        stage.style.height = `${Math.round(bookH)}px`;
        // world: x = 0 at the spine, y = 0 at the head of the pages
        const sr = { w: bookW, h: bookH };
        const ox = leftW + fe + mb;                        // world x of the stage's left edge is -ox
        const oy = he + mb;
        // the canvas reaches past the stage: above and below for a lifted leaf,
        // sideways to the edge of the viewport (a single page's leaf turns off it)
        const vr = stage.getBoundingClientRect();
        const padY = Math.round(H * 0.17);
        const padL = Math.round(single ? Math.max(0, vr.left) : Math.min(vr.left, W * 0.08));
        const padR = Math.round(Math.max(0, Math.min(document.documentElement.clientWidth - vr.right, W * 0.45)));
        canvas.style.left = `${-padL}px`;
        canvas.style.top = `${-padY}px`;
        canvas.style.width = `${sr.w + padL + padR}px`;
        canvas.style.height = `${sr.h + 2 * padY}px`;
        view = [-ox - padL, -oy - padY, sr.w + padL + padR, sr.h + 2 * padY];
        // a single page on a phone is small type: let it have the screen's 3x
        dpr = Math.min(single ? 3 : 2, devicePixelRatio || 1);
        if (view[2] * view[3] * dpr * dpr > 4.2e6) dpr = Math.min(dpr, 2);
        canvas.width = Math.round(view[2] * dpr);
        canvas.height = Math.round(view[3] * dpr);
        cam = [single ? W / 2 : 0, H / 2, cfg.focal * W * (single ? 1.6 : 1)];
        root.classList.toggle('pt-single', single);
    }

    // ── book state ──
    // Leaves: in spread mode leaf i carries article 2i on its front and 2i+1
    // on its back; in single mode, article i on its front and a blank back.
    let nLeaves = 0;
    const frontOf = (i) => (single ? i : 2 * i);
    const backOf = (i) => (single ? -1 : (2 * i + 1 < arts.length ? 2 * i + 1 : -1));
    let state = [];       // per leaf: 0 resting right, 1 resting left
    const flying = [];    // leaves in the air

    function setLeaves(turnedCount) {
        nLeaves = single ? arts.length : Math.ceil(arts.length / 2);
        turnedCount = clamp(turnedCount, 0, nLeaves);
        state = Array.from({ length: nLeaves }, (_, i) => (i < turnedCount ? 1 : 0));
    }
    const turned = () => state.reduce((a, s) => a + (s === 1 ? 1 : 0), 0);
    const restingTopRight = () => { for (let i = 0; i < nLeaves; i++) if (state[i] === 0) return i; return -1; };
    const restingTopLeft = () => { for (let i = nLeaves - 1; i >= 0; i--) if (state[i] === 1) return i; return -1; };

    // ── WebGL ──
    let gl = null, progs = {}, bufs = {}, nIdx = 0, fbA = null, fbB = null, txA = null, txB = null, fbW = 0, fbH = 0;
    let api = null, fonts = null;
    const tex = new Map();       // key -> { t, used }
    let blankTex = null, endTex = null;
    let texScale = 1;

    function compile(vs, fs) {
        const mk = (type, srcCode) => {
            const s = gl.createShader(type);
            gl.shaderSource(s, srcCode);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
            return s;
        };
        const p = gl.createProgram();
        gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
        gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
        gl.bindAttribLocation(p, 0, 'aP');
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
        const u = {};
        const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
        for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, a.name); }
        return { p, u };
    }

    function initGL() {
        gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: true, preserveDrawingBuffer: false });
        if (!gl) return false;
        progs.leaf = compile(LEAF_VS, LEAF_FS);
        progs.shadow = compile(SHADOW_VS, SHADOW_FS);
        progs.blur = compile(QUAD_VS, BLUR_FS);
        progs.book = compile(BOOK_VS, BOOK_FS);
        // the leaf mesh: fine enough for a tight curl at any angle
        const NX = 84, NY = 100;
        const v = new Float32Array((NX + 1) * (NY + 1) * 2);
        let k = 0;
        for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) { v[k++] = i / NX; v[k++] = j / NY; }
        const idx = new Uint32Array(NX * NY * 6);
        k = 0;
        for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
            const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1;
            idx[k++] = a; idx[k++] = c; idx[k++] = b; idx[k++] = b; idx[k++] = c; idx[k++] = d;
        }
        nIdx = idx.length;
        bufs.leaf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, bufs.leaf);
        gl.bufferData(gl.ARRAY_BUFFER, v, gl.STATIC_DRAW);
        bufs.idx = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bufs.idx);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
        bufs.quad = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, bufs.quad);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        bufs.unit = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, bufs.unit);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
        bufs.vao = gl.createVertexArray();
        return true;
    }

    function makeTarget(w, h) {
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const f = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, f);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return [f, t];
    }

    function layoutGL() {
        fbW = Math.max(8, Math.round(canvas.width / 2));
        fbH = Math.max(8, Math.round(canvas.height / 2));
        for (const t of [txA, txB]) if (t) gl.deleteTexture(t);
        for (const f of [fbA, fbB]) if (f) gl.deleteFramebuffer(f);
        [fbA, txA] = makeTarget(fbW, fbH);
        [fbB, txB] = makeTarget(fbW, fbH);
    }

    const aniso = () => gl.getExtension('EXT_texture_filter_anisotropic');
    function upload(canvasSrc) {
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvasSrc);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const an = aniso();
        if (an) gl.texParameterf(gl.TEXTURE_2D, an.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(an.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
        return t;
    }

    // ── page textures, made on demand, a handful kept ──
    const imgCache = new Map();
    function loadImg(i) {
        if (imgCache.has(i)) return imgCache.get(i);
        const im = new Image();
        im.decoding = 'async';
        const p = new Promise((res) => {
            im.onload = () => (im.decode ? im.decode().catch(() => {}) : Promise.resolve()).then(() => res(im));
            im.onerror = () => res(null);
        });
        im.src = imgs[i].currentSrc || imgs[i].src;
        imgCache.set(i, p);
        return p;
    }
    const pending = new Set();
    let useClock = 0;
    function sideOf(i) {
        // which side the article lies on when the book is open there
        if (single) return 'r';
        return i % 2 === 0 ? 'r' : 'v';
    }
    function pageTex(i) {
        if (i < 0) return blankTex;
        if (i >= arts.length) return endTex;
        const key = i;
        const hit = tex.get(key);
        if (hit) { hit.used = ++useClock; return hit.t; }
        if (!pending.has(key)) {
            pending.add(key);
            const make = kinds[i] === 'plate'
                ? loadImg(i).then((im) => (im ? platePage(im, W, H, texScale, i + 3, sideOf(i)) : null))
                : Promise.resolve(typeset(api, arts[i], kinds[i], folioOf(i), sideOf(i), W, H, texScale, i + 3, fonts));
            make.then((cv) => {
                pending.delete(key);
                if (dead || !gl || !cv) return;
                tex.set(key, { t: upload(cv), used: ++useClock });
                trim();
                requestDraw();
            });
        }
        return blankTex;
    }
    function trim() {
        const keep = 12;
        if (tex.size <= keep) return;
        const arr = [...tex.entries()].sort((a, b) => a[1].used - b[1].used);
        for (let k = 0; k < arr.length - keep; k++) { gl.deleteTexture(arr[k][1].t); tex.delete(arr[k][0]); }
    }
    function clearTextures() {
        for (const v of tex.values()) gl.deleteTexture(v.t);
        tex.clear();
        pending.clear();
        if (blankTex) gl.deleteTexture(blankTex);
        if (endTex) gl.deleteTexture(endTex);
        blankTex = upload(typeset(null, null, 'blank', 0, 'v', W, H, texScale, 1, fonts));
        endTex = upload(typeset(null, null, 'blank', 0, 'r', W, H, texScale, 2, fonts));
    }
    function warm() {
        // the pages within a leaf or two of the opening
        const t = turned();
        for (let i = Math.max(0, t - 2); i <= Math.min(nLeaves - 1, t + 2); i++) { pageTex(frontOf(i)); if (backOf(i) >= 0) pageTex(backOf(i)); }
    }

    // ── the shape of a leaf ──
    // In its own frame (x from the spine, y down), a leaf lifted through an
    // angle alpha: how much of it has left the page (ell), the bend (R), the
    // straight run (q), where the fold lies (sf), and how far its held point
    // has travelled toward the spine (d) and risen (z).
    function fam(alpha, sg, smax) {
        const lmax = Math.max(1, sg - smax);
        const w = smooth(0.15, 1.75, alpha);
        const ell = Math.max(lmax * w, Math.min(lmax, 0.02 * W));
        let R = W * (R0 * (1 - smooth(2.0, PI, alpha)) + RMIN);
        if (alpha > 1e-4) R = Math.min(R, ell / alpha);
        const q = Math.max(0, ell - R * alpha);
        return {
            R, q, sf: sg - R * alpha - q, w,
            d: R * (alpha - Math.sin(alpha)) + q * (1 - Math.cos(alpha)),
            z: R * (1 - Math.cos(alpha)) + q * Math.sin(alpha),
        };
    }
    function alphaFor(D, sg, smax) {
        let a = 0, b = PI;
        if (D <= 0) return 0;
        if (fam(PI, sg, smax).d <= D) return PI;
        for (let k = 0; k < 28; k++) { const m = (a + b) / 2; if (fam(m, sg, smax).d < D) a = m; else b = m; }
        return (a + b) / 2;
    }
    // The leaf's shape from a held point g (own frame) and the direction it
    // has been drawn toward (angle beta of n) and its progress u (0..1).
    function shapeFrom(L0, beta, u) {
        const n = [Math.cos(beta), Math.sin(beta)];
        const sg = L0.g[0] * n[0] + L0.g[1] * n[1];
        const smax = Math.max(0, H * n[1]);
        const dPI = fam(PI, sg, smax).d;
        const D = clamp(u) * dPI;
        const alpha = alphaFor(D, sg, smax);
        const f = fam(alpha, sg, smax);
        const tg = -L0.g[0] * n[1] + L0.g[1] * n[0];
        return { n, alpha, f, sg, smax, D, dPI, tg };
    }

    // Drag: find (beta, u) that put the held point under the pointer, in
    // perspective. ptr is the pointer in world px at the page plane.
    function solveDrag(F, ptrWorld) {
        const side = F.side;
        const camO = [side * cam[0], cam[1]];
        let P = [side * ptrWorld[0], ptrWorld[1]];
        const Pw = P.slice();
        let res = null;
        for (let it = 0; it < 3; it++) {
            const g = F.g;
            let vx = g[0] - P[0], vy = g[1] - P[1];
            vx += 0.03 * W * Math.exp(-Math.hypot(vx, vy) / (0.05 * W));   // a barely moved finger means: toward the spine
            let beta = Math.atan2(vy, Math.max(vx, 1e-3));
            beta = clamp(beta, -1.05, 1.05);
            const n = [Math.cos(beta), Math.sin(beta)];
            const sg = g[0] * n[0] + g[1] * n[1];
            const smax = Math.max(0, H * n[1]);
            const dPI = fam(PI, sg, smax).d;
            const D = clamp(vx * n[0] + vy * n[1], 0, dPI);
            const u = D / dPI;
            res = { beta, u };
            const f = fam(alphaFor(D, sg, smax), sg, smax);
            const z = f.z;
            // where must the pointer's ray meet height z
            const k = (cam[2] - z) / cam[2];
            P = [camO[0] + (Pw[0] - camO[0]) * k, camO[1] + (Pw[1] - camO[1]) * k];
        }
        return res;
    }

    function startFlight(leaf, side, g, mode) {
        const F = {
            leaf, side, g, mode,          // mode: 'drag' | 'hand' | 'free'
            beta: 0, u: 0, du: 0, k2: 0, cone: CONE, t: 0,
            hist: [], z0: 0.4 + flying.length * 0.5,
        };
        state[leaf] = 2;
        flying.push(F);
        return F;
    }

    function finish(F) {
        const toOther = F.u >= 0.5;
        const landedLeft = (F.side > 0) === toOther;
        state[F.leaf] = landedLeft ? 1 : 0;
        flying.splice(flying.indexOf(F), 1);
        announce();
        root.dispatchEvent(new CustomEvent('pageturn', { detail: { turned: turned(), leaves: nLeaves } }));
    }

    // one physics step for a released leaf
    function stepFree(F, dt) {
        const sh = shapeFrom(F, F.beta, F.u);
        const lifted = 0.25 + 0.75 * sh.f.w;
        let acc = -GRAV * Math.cos(sh.alpha) * lifted - DRAG1 * F.du - DRAG2 * F.du * Math.abs(F.du);
        // air trapped under a landing leaf
        const near = F.du > 0 ? smooth(0.86, 1, F.u) : smooth(0.14, 0, F.u);
        acc -= 16 * near * F.du;
        F.du += acc * dt;
        F.u += F.du * dt;
        if (F.u >= 1) { F.u = 1; if (F.du > 0) F.du *= -0.06; }
        if (F.u <= 0) { F.u = 0; if (F.du < 0) F.du *= -0.06; }
        // the fold straightens toward the spine as it goes
        F.beta *= Math.exp(-2.6 * dt);
        F.cone += (0.25 * CONE - F.cone) * Math.min(1, 2 * dt);
        // the trailing edge bows back in the air, and droops under its weight
        const k2t = (-0.95 * F.du - 0.45 * Math.cos(sh.alpha) * sh.f.w) * (1 - smooth(2.6, PI, sh.alpha)) / W;
        F.k2 += (k2t - F.k2) * Math.min(1, 10 * dt);
        if ((F.u === 1 || F.u === 0) && Math.abs(F.du) < 0.02) { F.u = Math.round(F.u); finish(F); }
    }

    const HAND_T = 0.6;
    function stepHand(F, dt) {
        F.t += dt;
        const s = clamp(F.t / HAND_T);
        const u0 = F.u;
        F.u = 0.6 * (1 - Math.cos(s * PI / 2)) * (0.5 + 0.5 * s);
        F.beta = 0.32 * Math.sin(s * PI) * (F.g[1] > H / 2 ? 1 : -1);
        F.du = (F.u - u0) / dt;
        if (s >= 1) { F.mode = 'free'; }
    }

    // ── drawing ──
    let raf = 0, last = 0, fade = 1, fadeFrom = null, needDraw = false, visible = true;
    const running = () => flying.length > 0 || fade < 1;

    function bindTex(unit, t) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); }
    function attrib(buf) {
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    }

    function leafUniforms(p, F) {
        const sh = shapeFrom(F, F.beta, F.u);
        const u = p.u;
        gl.uniform2f(u.uPage, W, H);
        gl.uniform2f(u.uN, sh.n[0], sh.n[1]);
        gl.uniform1f(u.uSf, sh.f.sf);
        gl.uniform1f(u.uA, Math.max(sh.alpha, 1e-4));
        gl.uniform1f(u.uR, Math.max(sh.f.R, 0.5));
        gl.uniform1f(u.uTg, sh.tg);
        gl.uniform1f(u.uCone, F.cone * (1 - smooth(2.2, PI, sh.alpha)));
        gl.uniform1f(u.uK2, F.mode === 'drag' ? 0 : F.k2);
        gl.uniform1f(u.uSide, F.side);
        gl.uniform1f(u.uZ0, F.z0);
        gl.uniform3f(u.uCam, cam[0], cam[1], cam[2]);
        gl.uniform4f(u.uView, view[0], view[1], view[2], view[3]);
        gl.uniform2f(u.uGut, GUT_G * W, GUT_W * W);
        if (u.uL) gl.uniform3f(u.uL, L[0], L[1], L[2]);
        return sh;
    }

    function draw() {
        needDraw = false;
        if (!gl || !blankTex) return;
        gl.bindVertexArray(bufs.vao);
        const shadowOn = flying.length > 0 && !calm.matches;
        // 1. shadows
        if (shadowOn) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbA);
            gl.viewport(0, 0, fbW, fbH);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.disable(gl.DEPTH_TEST);
            gl.enable(gl.BLEND);
            gl.blendEquation(gl.MAX);
            gl.blendFunc(gl.ONE, gl.ONE);
            gl.useProgram(progs.shadow.p);
            attrib(bufs.leaf);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bufs.idx);
            gl.uniform1f(progs.shadow.u.uW, W);
            for (const F of flying) {
                leafUniforms(progs.shadow, F);
                gl.drawElements(gl.TRIANGLES, nIdx, gl.UNSIGNED_INT, 0);
            }
            gl.blendEquation(gl.FUNC_ADD);
            gl.disable(gl.BLEND);
            gl.useProgram(progs.blur.p);
            attrib(bufs.quad);
            gl.uniform1i(progs.blur.u.uSrc, 0);
            const pxA = 0.005 * W * dpr / 2, pxB = 0.022 * W * dpr / 2;
            const blur = (srcT, dstF, dx, dy) => {
                gl.bindFramebuffer(gl.FRAMEBUFFER, dstF);
                bindTex(0, srcT);
                gl.uniform2f(progs.blur.u.uStepA, dx * pxA / fbW, dy * pxA / fbH);
                gl.uniform2f(progs.blur.u.uStepB, dx * pxB / fbW, dy * pxB / fbH);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            };
            blur(txA, fbB, 1, 0); blur(txB, fbA, 0, 1);
            blur(txA, fbB, 0.6, 0.6); blur(txB, fbA, 0.6, -0.6);
        }
        // 2. the book
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clearDepth(1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.disable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        const bp = progs.book;
        gl.useProgram(bp.p);
        attrib(bufs.unit);
        const tl = restingTopLeft(), tr = restingTopRight();
        const lt = tl >= 0 ? (backOf(tl) >= 0 ? pageTex(backOf(tl)) : blankTex) : blankTex;
        const lo = tl >= 0 ? pageTex(frontOf(tl)) : blankTex;
        const rt = tr >= 0 ? pageTex(frontOf(tr)) : endTex;
        const ro = tr >= 0 && backOf(tr) >= 0 ? pageTex(backOf(tr)) : blankTex;
        bindTex(0, lt); bindTex(1, rt); bindTex(2, lo); bindTex(3, ro);
        bindTex(4, fade < 1 && fadeFrom ? fadeFrom[0] : lt);
        bindTex(5, fade < 1 && fadeFrom ? fadeFrom[1] : rt);
        bindTex(6, shadowOn ? txA : blankTex);
        gl.uniform1i(bp.u.uLt, 0); gl.uniform1i(bp.u.uRt, 1); gl.uniform1i(bp.u.uLo, 2); gl.uniform1i(bp.u.uRo, 3);
        gl.uniform1i(bp.u.uLf, 4); gl.uniform1i(bp.u.uRf, 5); gl.uniform1i(bp.u.uShadow, 6);
        gl.uniform1f(bp.u.uFade, fade < 1 ? fade * fade * (3 - 2 * fade) : 1);
        gl.uniform1f(bp.u.uShadowOn, shadowOn ? 1 : 0);
        gl.uniform2f(bp.u.uPage, W, H);
        gl.uniform4f(bp.u.uView, view[0], view[1], view[2], view[3]);
        gl.uniform2f(bp.u.uGut, GUT_G * W, GUT_W * W);
        const share = nLeaves ? turned() / nLeaves : 0.5;
        const fe = edges[0];
        gl.uniform4f(bp.u.uEdge, fe * (0.55 + 0.9 * share), fe * (0.55 + 0.9 * (1 - share)), edges[2], edges[3]);
        gl.uniform3f(bp.u.uBoard, 0.36, 0.22, 0.13);
        gl.uniform1f(bp.u.uLeftW, leftW);
        gl.uniform3f(bp.u.uL, L[0], L[1], L[2]);
        gl.uniform3f(bp.u.uPaper, PAPER[0] / 255, PAPER[1] / 255, PAPER[2] / 255);
        gl.uniform1f(bp.u.uGhost, GHOST);
        gl.uniform4f(bp.u.uRect, view[0], view[1], view[2], view[3]);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        // 3. the leaves in the air
        if (flying.length) {
            gl.disable(gl.BLEND);
            gl.enable(gl.DEPTH_TEST);
            gl.depthFunc(gl.LEQUAL);
            const lp = progs.leaf;
            gl.useProgram(lp.p);
            attrib(bufs.leaf);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bufs.idx);
            gl.uniform3f(lp.u.uPaper, PAPER[0] / 255, PAPER[1] / 255, PAPER[2] / 255);
            gl.uniform1f(lp.u.uGhost, GHOST);
            gl.uniform1f(lp.u.uTrans, TRANS);
            gl.uniform1f(lp.u.uCutX, single ? -leftW - 0.5 : -1e6);
            gl.uniform1i(lp.u.uUp, 0); gl.uniform1i(lp.u.uDn, 1); gl.uniform1i(lp.u.uShadow, 2);
            bindTex(2, shadowOn ? txA : blankTex);
            gl.uniform1f(lp.u.uShadowOn, shadowOn ? 1 : 0);
            for (const F of flying) {
                leafUniforms(lp, F);
                const fr = frontOf(F.leaf), bk = backOf(F.leaf);
                const tf = pageTex(fr), tb = bk >= 0 ? pageTex(bk) : blankTex;
                // own frame: the face lying up at the start is the front for a
                // leaf leaving the right, the back for one leaving the left
                bindTex(0, F.side > 0 ? tf : tb);
                bindTex(1, F.side > 0 ? tb : tf);
                gl.uniform1f(lp.u.uFlipU, F.side > 0 ? 0 : 1);
                gl.drawElements(gl.TRIANGLES, nIdx, gl.UNSIGNED_INT, 0);
            }
            gl.disable(gl.DEPTH_TEST);
        }
        gl.bindVertexArray(null);
    }

    function frame(now) {
        raf = 0;
        if (dead) return;
        const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
        last = now;
        const steps = Math.max(1, Math.round(dt * 240));
        const h = dt / steps;
        for (let s = 0; s < steps; s++) {
            for (const F of flying.slice()) {
                if (F.mode === 'free') stepFree(F, h);
                else if (F.mode === 'hand') stepHand(F, h);
            }
        }
        if (fade < 1) { fade = Math.min(1, fade + dt / 0.32); if (fade >= 1) fadeFrom = null; }
        draw();
        if (running() && !document.hidden && visible) raf = requestAnimationFrame(frame);
        else last = 0;
    }
    function kick() { if (!raf && gl && !dead) raf = requestAnimationFrame(frame); }
    function requestDraw() {
        if (raf) return;
        if (!needDraw) { needDraw = true; requestAnimationFrame(() => { if (!raf && needDraw) draw(); }); }
    }

    // ── turning ──
    function canStart(dir) {
        // leaves already in the air must be going the same way
        if (flying.some((F) => (F.side > 0 ? 1 : -1) !== dir && F.mode !== 'drag')) return false;
        return flying.length < MAX_FLYING;
    }
    function crossfade(dir) {
        const tl = restingTopLeft(), tr = restingTopRight();
        const lt = tl >= 0 && backOf(tl) >= 0 ? pageTex(backOf(tl)) : blankTex;
        const rt = tr >= 0 ? pageTex(frontOf(tr)) : endTex;
        if (dir > 0 && tr >= 0) state[tr] = 1;
        else if (dir < 0 && tl >= 0) state[tl] = 0;
        else return;
        fadeFrom = [lt, rt];
        fade = 0;
        announce();
        warm();
        kick();
    }
    function turn(dir) {
        if (!gl) return;
        if (calm.matches) { crossfade(dir); return; }
        if (!canStart(dir)) return;
        const leaf = dir > 0 ? restingTopRight() : restingTopLeft();
        if (leaf < 0) return;
        const F = startFlight(leaf, dir > 0 ? 1 : -1, [W * 0.97, H * 0.94], 'hand');
        void F;
        warm();
        kick();
    }

    // ── pointer ──
    let ptr = null;
    function world(e) {
        const r = canvas.getBoundingClientRect();
        return [view[0] + (e.clientX - r.left) / r.width * view[2], view[1] + (e.clientY - r.top) / r.height * view[3]];
    }
    function onDown(e) {
        if (!gl || e.button > 0 || dead) return;
        const p = world(e);
        const onRight = p[0] > 0 && p[0] < W && p[1] > -8 && p[1] < H + 8;
        const onLeft = !single && p[0] < 0 && p[0] > -W && p[1] > -8 && p[1] < H + 8;
        if (!onRight && !onLeft) return;
        ptr = { id: e.pointerId, x0: e.clientX, y0: e.clientY, p0: p, side: onLeft ? -1 : 1, F: null, type: e.pointerType };
        if (e.pointerType === 'mouse') e.preventDefault();
        try { root.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
    }
    function grabFor(dir, p0) {
        if (calm.matches) return null;
        if (!canStart(dir)) return null;
        const leaf = dir > 0 ? restingTopRight() : restingTopLeft();
        if (leaf < 0) return null;
        const side = dir > 0 ? 1 : -1;
        // the held point, in the leaf's own frame: where you took it, kept to the outer half
        let gx = side * p0[0], gy = clamp(p0[1], 0, H);
        if (single && side < 0) gx = W - p0[0];         // reaching back for the leaf off the edge
        gx = clamp(gx, W * (single ? 0.62 : 0.5), W * 0.995);
        const F = startFlight(leaf, side, [gx, gy], 'drag');
        F.hist = [];
        warm();
        return F;
    }
    function onMove(e) {
        if (!ptr || e.pointerId !== ptr.id) {
            if (e.pointerType === 'mouse' && gl) {
                const p = world(e);
                const ok = (p[0] > W * 0.45 && p[0] < W && p[1] > 0 && p[1] < H) || (!single && p[0] < -W * 0.45 && p[0] > -W && p[1] > 0 && p[1] < H);
                root.classList.toggle('pt-over', ok);
            }
            return;
        }
        const dx = e.clientX - ptr.x0, dy = e.clientY - ptr.y0;
        if (!ptr.F && !ptr.moved) {
            if (Math.hypot(dx, dy) < 6) return;
            ptr.moved = true;
            if (Math.abs(dy) > Math.abs(dx) * 1.2 && ptr.type !== 'mouse') { ptr = null; return; }   // a scroll
            let dir;
            if (single) dir = dx < 0 ? 1 : -1;
            else dir = ptr.side;
            ptr.dir = dir;
            ptr.F = grabFor(dir, ptr.p0);
            root.classList.add('pt-grabbing');
            if (!ptr.F) return;
        }
        if (!ptr.F) return;
        const F = ptr.F;
        const r = canvas.getBoundingClientRect();
        const sx = view[2] / r.width;
        const gain = single ? 2.1 : 1;
        // the pointer, as the held point would follow it
        const gw = [F.side * F.g[0], F.g[1]];
        const start = single ? gw : ptr.p0;
        const pw = [start[0] + dx * sx * gain, start[1] + dy * sx * (single ? 0.6 : 1)];
        const s = solveDrag(F, single ? pw : [pw[0] - (ptr.p0[0] - gw[0]), pw[1] - (ptr.p0[1] - gw[1])]);
        F.beta += (s.beta - F.beta) * 0.6;
        F.u = s.u;
        const t = performance.now() / 1000;
        F.hist.push([t, F.u, e.clientX]);
        while (F.hist.length > 2 && t - F.hist[0][0] > 0.09) F.hist.shift();
        kick();
    }
    function onUp(e) {
        if (!ptr || e.pointerId !== ptr.id) return;
        const P = ptr;
        ptr = null;
        root.classList.remove('pt-grabbing');
        if (calm.matches && P.moved) {
            const dx = e.clientX - P.x0;
            if (Math.abs(dx) > 30) crossfade(dx < 0 ? 1 : -1);
            return;
        }
        if (!P.F) {
            // a click on a page: turn it
            if (!P.moved && e.type === 'pointerup' && P.type === 'mouse') turn(single ? 1 : P.side);
            return;
        }
        const F = P.F;
        let du = 0, vx = 0;
        if (F.hist.length > 1) {
            const a = F.hist[0], b = F.hist[F.hist.length - 1];
            if (b[0] - a[0] > 0.012) { du = (b[1] - a[1]) / (b[0] - a[0]); vx = (b[2] - a[2]) / (b[0] - a[0]); }
        }
        F.du = clamp(du, -4, 4);
        // a flick (the finger moving fast toward the spine, or away) turns it
        // however little it was lifted, or lays it back
        const toward = -vx * F.side;
        if (toward > 450 || F.du > 1.4) F.du = Math.max(F.du, 2.7);
        else if (toward < -450 && F.u < 0.5) F.du = Math.min(F.du, -1.2);
        F.mode = 'free';
        kick();
    }

    function onKey(e) {
        if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); turn(1); }
        else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); turn(-1); }
        else if (e.key === 'Home') { e.preventDefault(); if (!flying.length) { setLeaves(0); announce(); requestDraw(); } }
        else if (e.key === 'End') { e.preventDefault(); if (!flying.length) { setLeaves(nLeaves); announce(); requestDraw(); } }
    }

    function label(i) {
        if (i < 0 || i >= arts.length) return '';
        const a = arts[i];
        if (kinds[i] === 'plate') return 'plate';
        if (kinds[i] === 'title') return 'title page';
        const h = a.querySelector('h2');
        return h ? textOf(h).replace(/^Chap\.\s*[IVXL]+\.\s*/, '').replace(/\.$/, '') : (kinds[i] === 'colophon' ? 'colophon' : 'text');
    }
    function announce() {
        const t = turned();
        let msg;
        if (single) {
            const i = Math.min(t, arts.length - 1);
            msg = `Page ${i + 1} of ${arts.length}: ${label(i)}`;
        } else {
            const l = t > 0 ? backOf(t - 1) : -1, r = t < nLeaves ? frontOf(t) : -1;
            const parts = [l, r].filter((i) => i >= 0);
            const what = parts.length === 2 && kinds[parts[1]] === 'plate' && kinds[parts[0]] === 'text'
                ? `${label(parts[0])}, with its plate` : parts.map(label).join(', ');
            msg = parts.length ? `Pages ${parts.map((i) => i + 1).join(' and ')} of ${arts.length}: ${what}` : 'The end of the book';
        }
        live.textContent = msg;
        bPrev.disabled = t <= 0;
        bNext.disabled = t >= nLeaves;
    }

    // ── start ──
    let io = null, ro = null, sizeTimer = 0;
    async function start() {
        try {
            const cs = getComputedStyle(root);
            const v = (n, d) => (cs.getPropertyValue(n).trim() || d);
            fonts = {
                body: v('--pt-font', '"IM Fell English", "EB Garamond", Georgia, serif'),
                sc: v('--pt-font-sc', '"IM Fell English SC", "IM Fell English", Georgia, serif'),
                cap: v('--pt-font-display', '"IM Fell French Canon", "IM Fell English", Georgia, serif'),
            };
            const fam1 = (f) => f.split(',')[0].trim();
            await fontsReady([`20px ${fam1(fonts.body)}`, `italic 20px ${fam1(fonts.body)}`, `20px ${fam1(fonts.sc)}`, `20px ${fam1(fonts.cap)}`]);
            api = await loadPretext();
            fonts.hy = await loadHyphen();
        } catch (err) {
            root.classList.remove('pt-on');
            stage.remove(); nav.remove();
            arts.forEach((a) => root.insertBefore(a, src));
            src.remove();
            return;
        }
        if (dead) return;
        measure();
        let ok = false;
        try { ok = initGL(); } catch (err) { console.warn('page-turn:', err); ok = false; }
        if (!ok) {
            root.classList.remove('pt-on');
            stage.remove(); nav.remove();
            arts.forEach((a) => root.insertBefore(a, src));
            src.remove();
            gl = null;
            return;
        }
        texScale = Math.max(1, dpr) * 1.08;
        if (W * texScale > 2048) texScale = 2048 / W;
        layoutGL();
        clearTextures();
        setLeaves(single ? Math.max(0, cfg.start * 2 - 1) : cfg.start);
        warm();
        draw();
        root.classList.add('pt-live');
        if (!root.hasAttribute('tabindex')) { root.tabIndex = 0; root.dataset.ptTab = '1'; }
        if (!root.hasAttribute('role')) { root.setAttribute('role', 'region'); root.dataset.ptRole = '1'; }
        if (!root.hasAttribute('aria-roledescription')) { root.setAttribute('aria-roledescription', 'book'); root.dataset.ptRd = '1'; }
        announce();

        on(root, 'pointerdown', onDown);
        on(root, 'pointermove', onMove);
        on(root, 'pointerup', onUp);
        on(root, 'pointercancel', onUp);
        on(root, 'lostpointercapture', onUp);
        on(root, 'pointerleave', () => root.classList.remove('pt-over'));
        on(root, 'keydown', onKey);
        on(root, 'dragstart', (e) => e.preventDefault());
        on(bPrev, 'click', () => turn(-1));
        on(bNext, 'click', () => turn(1));
        on(document, 'visibilitychange', () => { if (!document.hidden && running()) kick(); });
        on(canvas, 'webglcontextlost', (e) => { e.preventDefault(); cancelAnimationFrame(raf); raf = 0; });
        on(canvas, 'webglcontextrestored', () => {
            try { tex.clear(); pending.clear(); progs = {}; bufs = {}; txA = txB = fbA = fbB = null; if (initGL()) { layoutGL(); clearTextures(); warm(); draw(); } } catch (err) { /* keep what we had */ }
        });
        io = new IntersectionObserver((en) => {
            visible = en[en.length - 1].isIntersecting;
            if (visible && running()) kick();
        });
        io.observe(stage);
        let w0 = root.getBoundingClientRect().width, vh0 = innerHeight;
        ro = new ResizeObserver(() => {
            const w = root.getBoundingClientRect().width;
            if (Math.abs(w - w0) < 1 && Math.abs(innerHeight - vh0) < 120) return;
            clearTimeout(sizeTimer);
            sizeTimer = setTimeout(() => {
                if (dead || !gl) return;
                w0 = w; vh0 = innerHeight;
                const wasSingle = single;
                // settle anything in the air first
                for (const F of flying.slice()) { F.u = F.u >= 0.5 ? 1 : 0; finish(F); }
                const t = turned();
                measure();
                texScale = Math.max(1, dpr) * 1.08;
                if (W * texScale > 2048) texScale = 2048 / W;
                layoutGL();
                clearTextures();
                // keep the same page in view when the book changes shape
                let nt = t;
                if (wasSingle && !single) nt = Math.ceil(t / 2);
                else if (!wasSingle && single) nt = Math.max(0, 2 * t - 1);
                setLeaves(nt);
                announce();
                warm();
                draw();
            }, 150);
        });
        ro.observe(root);
    }
    start();

    return function destroy() {
        dead = true;
        cancelAnimationFrame(raf);
        clearTimeout(sizeTimer);
        off.forEach((f) => f());
        if (io) io.disconnect();
        if (ro) ro.disconnect();
        if (gl) { const x = gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); }
        arts.forEach((a) => root.insertBefore(a, stage));
        stage.remove(); nav.remove(); src.remove();
        root.classList.remove('pt-on', 'pt-live', 'pt-single', 'pt-over', 'pt-grabbing');
        if (root.dataset.ptTab) { root.removeAttribute('tabindex'); delete root.dataset.ptTab; }
        if (root.dataset.ptRole) { root.removeAttribute('role'); delete root.dataset.ptRole; }
        if (root.dataset.ptRd) { root.removeAttribute('aria-roledescription'); delete root.dataset.ptRd; }
        delete root.dataset.ptStarted;
        void id;
    };
}

// Auto-start every [data-page-turn] when it comes near the viewport.
function autoStart(el) {
    if (el.dataset.ptStarted) return;
    el.dataset.ptStarted = '1';
    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((en) => {
        if (!en[0].isIntersecting) return;
        io.disconnect();
        pageTurn(el);
    }, { rootMargin: '600px' });
    io.observe(el);
}
document.querySelectorAll('[data-page-turn]').forEach(autoStart);
