/*
 *  EXCAVATION // a mosaic floor under a skin of sand and dust, uncovered with a brush.
 *
 *  Markup:  <figure data-excavation>
 *             <img src="assets/lod-floor.webp" alt="">
 *             <button class="ex-sponge" type="button" aria-label="Wet the floor">
 *               <img src="assets/sponge.webp" alt="">
 *             </button>
 *           </figure>
 *  Or call  excavation(figure, { depth, brush, hint, dry, sand })  yourself.
 *  It returns destroy().
 *
 *  Options (data attributes, all optional; the options object wins):
 *    data-depth="7"        css px of sand over the floor, on average
 *    data-brush="1"        scales the brush (its width; how much a pass moves)
 *    data-hint=".14 .8"    where the corner already brushed clean lies (fractions); "none" for none
 *    data-dry="24"         seconds a splash takes to dry at its heart (its edges go first)
 *    data-sand="assets/sand.webp"   grain texture (a seamless greyscale tile, power of two)
 *
 *  The sand is a height field on the CPU, about 300 cells on the long side, in
 *  css px, so slopes are real slopes. A brush stroke is cut into steps shorter
 *  than a cell; each step lifts part of the sand under the bristles (more in
 *  the middle of the brush than at its edges) and throws it: some ahead of the
 *  brush, where it is picked up again by the next step, so a little moving
 *  mound builds in front and is left as a pile where the stroke ends, and some
 *  out to the side, just past the bristles, where it builds the low ridges
 *  that line every brushed track. Then the sand relaxes: wherever two
 *  neighbours differ by more than the angle of repose (34 degrees) allows,
 *  part of the excess slides down, a few passes a frame, so a ridge that piles
 *  too steep slumps. Under the sand a separate film of fine dust is thinned a
 *  little by each pass but never quite goes, and remembers the direction of
 *  the last strokes, which the shader draws as faint bristle streaks.
 *
 *  Water is a third field: a splash lays down most at its heart, it
 *  evaporates at an even rate (with a patchy, fixed variation), so a patch
 *  dries from its edges inward. Wet tesserae are darker, saturated and
 *  glossy, the wet dust film turns translucent (which is why excavators wet a
 *  floor before they photograph it), and wet sand is darker and holds a
 *  steeper slope and resists the brush.
 *
 *  One fragment shader draws it all: the floor (chalky and pale dry, deep
 *  when wet, with glints off the tesserae's own facets), the dust veil, the
 *  sand (Beer-Lambert-ish cover, a real grain photo for albedo and micro
 *  relief, lit from normals by a low warm light) and the shadows that light
 *  casts, marched through the height field, including the trench's own walls.
 *  Around it, the cut of the trench and a ragged band of soil.
 *
 *  The loop runs only while brushing, while sand is still slumping and while
 *  anything is wet, never off screen or in a hidden tab.
 *  Reduced motion: a floor already half brushed, brushing still works, sand
 *  settles at once, water stays wet (no drying animation).
 *  Without WebGL the <img> stays, dusted by CSS.
 */

const calm = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

const HMAX = 48;          // css px at the top of the 8-bit height encoding (sqrt-encoded)
const GMAX = 2;           // slope at the edge of the gradient encoding
const REPOSE = 0.62;      // tan(32 deg): the steepest slope dry sand holds
const RESIDUE = 0.05;     // css px of sand the bristles always leave
const DUST_MIN = 0.16;    // the dust film never brushes away entirely
const K_LIFT = 3.3;       // how much of the sand under the brush a pass lifts (~ 1 - e^-1.35)
const K_DUST = 0.9;       // how much of the dust film a pass takes (~ 1 - e^-0.45)
const KEEP = 0.5;        // share of what a stroke lifts that lands again as sand
const ELEV = 36;          // light elevation, degrees: low, raking
const LIGHT = [-0.74, -0.58];   // toward the light, on the screen (y down): upper left

// ── noise (value noise; the same in JS for the cut of the trench) ──────────
function hash(x, y) {
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, s = 0) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = hash(xi + s, yi), b = hash(xi + 1 + s, yi), c = hash(xi + s, yi + 1), d = hash(xi + 1 + s, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, s = 0, oct = 4) {
    let f = 0, a = 0.5, n = 0;
    for (let i = 0; i < oct; i++) { f += a * vnoise(x, y, s + i * 101); n += a; x = x * 2.03 + 17.1; y = y * 2.03 - 9.3; a *= 0.5; }
    return f / n;
}

const VERT = `
attribute vec2 p;
varying vec2 vUv;
void main() { vUv = vec2(p.x * .5 + .5, .5 - p.y * .5); gl_Position = vec4(p, 0., 1.); }`;

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uImg;      // the floor, cropped to the canvas, 1 texel = 1 device px
uniform sampler2D uSand;     // grain: a seamless greyscale tile, mean .5
uniform sampler2D uState;    // r sqrt(height / HMAX), g wet, b a slope
uniform sampler2D uState2;   // r dust film, g b stroke direction (cos 2a, sin 2a), a brushed
uniform sampler2D uMask;     // r inner cut sdf, g outer edge sdf (+-32 css px), b wall height
uniform vec2 uSize;          // css px
uniform vec2 uGrid;          // css px the state grid covers
uniform vec2 uImgTexel;
uniform vec2 uMaskTexel;
uniform float uTile;         // css px per sand tile
uniform float uDpr;
uniform vec3 uL;             // toward the light (y down)
uniform vec2 uL2;            // same, on the screen, normalised
uniform float uTanE;
uniform vec3 uSandTint;
uniform vec3 uSoilTint;
uniform vec3 uDustTint;
uniform float uWallH;          // css px from the floor to the top of the cut
varying vec2 vUv;

float lum(vec3 c) { return dot(c, vec3(.3, .55, .15)); }
float hsh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3. - 2. * f);
    return mix(mix(hsh(i), hsh(i + vec2(1., 0.)), f.x), mix(hsh(i + vec2(0., 1.)), hsh(i + vec2(1., 1.)), f.x), f.y);
}
float heightAt(vec2 p) { float e = texture2D(uState, p / uGrid).r; return e * e * ${HMAX.toFixed(1)}; }
float grain(vec2 p) {
    // two reads of the tile at different scales and angles, so it never repeats visibly
    float a = texture2D(uSand, p / uTile).r;
    float b = texture2D(uSand, mat2(.8, -.6, .6, .8) * p / (uTile * 1.37) + .31).r;
    return (a - .5) * .75 + (b - .5) * .6 + .5;
}

// dry: dust in every pore lifts the darks toward a pale stone grey and drains
// the colour, as a dry excavated floor reads: light, chalky, low in contrast
vec3 chalk(vec3 m) {
    float l = lum(m);
    vec3 c = mix(vec3(l), m, .45);
    c = 1. - (1. - c) * .5;
    return c * vec3(.975, .96, .935);
}
// wet: water fills the pores and the stone shows its own colour, deeper and
// more saturated in its own hue (whites stay a pale cream); the joints go dark
vec3 wetten(vec3 m, float joint) {
    float l = lum(m);
    vec3 c = clamp(mix(vec3(l), m, 1.65), 0., 1.);
    c = pow(c, vec3(1.16));
    return c * (1. - .45 * joint);
}
// a cell noise at the scale of the tesserae: each stone its own small tilt
float cellRnd(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    float best = 9., id = 0.;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
        vec2 o = vec2(float(x), float(y));
        vec2 c = o + vec2(hsh(i + o), hsh(i + o + 17.3)) * .8 + .1;
        float d = dot(f - c, f - c);
        if (d < best) { best = d; id = hsh(i + o + 3.1); }
    }
    return id;
}
// pebbles in the soil: (coverage, dome x, dome y, colour seed)
vec4 pebble(vec2 p, float sc, float density) {
    vec2 q = p / sc, i = floor(q), f = fract(q);
    vec4 r = vec4(0.);
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
        vec2 o = vec2(float(x), float(y));
        if (hsh(i + o + 5.5) > density) continue;
        vec2 c = o + vec2(hsh(i + o + 1.3), hsh(i + o + 2.9));
        float rad = .07 + .26 * pow(hsh(i + o + 7.7), 2.);
        vec2 d = (f - c) / rad;
        d.x *= 1. + .5 * hsh(i + o + 9.1);
        float k = 1. - dot(d, d);
        if (k > r.x) r = vec4(smoothstep(0., .3, k), d * .45, hsh(i + o + 4.4));
    }
    return r;
}

void main() {
    vec2 p = vUv * uSize;
    vec4 mk = texture2D(uMask, vUv);
    float din = (mk.r * 2. - 1.) * 32.;
    float dout = (mk.g * 2. - 1.) * 32.;
    float base = mk.b * uWallH;

    vec4 st = texture2D(uState, p / uGrid);
    float H = st.r * st.r * ${HMAX.toFixed(1)};
    float wet = st.g;
    vec2 g = (st.ba * 2. - 1.) * ${GMAX.toFixed(1)};
    vec4 s2 = texture2D(uState2, p / uGrid);

    float pit = 1. - smoothstep(2., 3., din);       // sand runs up to the foot of the cut
    float h = H * pit;                        // sand thickness on the floor
    float gr = grain(p);
    float gx = grain(p + vec2(.7, 0.)) - grain(p - vec2(.7, 0.));
    float gy = grain(p + vec2(0., .7)) - grain(p - vec2(0., .7));

    // ── the floor ──
    vec3 M = texture2D(uImg, vUv).rgb;
    vec2 o = uImgTexel * 1.5;
    float lx = lum(texture2D(uImg, vUv + vec2(o.x, 0.)).rgb) - lum(texture2D(uImg, vUv - vec2(o.x, 0.)).rgb);
    float ly = lum(texture2D(uImg, vUv + vec2(0., o.y)).rgb) - lum(texture2D(uImg, vUv - vec2(0., o.y)).rgb);
    // the joints: darker than the stones around them
    vec2 o2 = uImgTexel * 2.5;
    float lm = (lum(texture2D(uImg, vUv + o2).rgb) + lum(texture2D(uImg, vUv - o2).rgb)
              + lum(texture2D(uImg, vUv + vec2(o2.x, -o2.y)).rgb) + lum(texture2D(uImg, vUv + vec2(-o2.x, o2.y)).rgb)) * .25;
    float joint = clamp((lm - lum(M)) * 5., 0., 1.);
    vec3 F = mix(chalk(M), wetten(M, joint), wet);

    // the dust film, with bristle streaks along the last strokes
    vec2 cs = s2.gb * 2. - 1.;
    float coh = clamp(length(cs), 0., 1.);
    float ang = atan(cs.y, cs.x) * .5;
    vec2 dv = vec2(cos(ang), sin(ang));
    vec2 q = vec2(dot(p, dv), dot(p, vec2(-dv.y, dv.x)));
    float stk = vn(vec2(q.x * .045, q.y * .85)) * .65 + vn(vec2(q.x * .02, q.y * .3) + 7.) * .35;
    float brushed = s2.a * coh;
    float film = s2.r * (1. + (stk - .5) * 1.6 * brushed) * (.85 + .3 * gr);
    // the veil only ever whitens: a pale dust laid over the stone
    float aV = clamp(film * .34, 0., 1.) * (1. - .92 * wet);
    vec3 dustC = uDustTint * (.94 + .12 * gr);
    F = mix(F, max(F, dustC), aV);

    // wet gloss. Only the few stones tilted toward the light catch it (about
    // one in seven): a small, sharp glint on each of those. Over the whole wet
    // area, a broad, soft, low-gloss sheen, brighter toward the light.
    float cr = cellRnd(p / 5.2);
    float catches = smoothstep(.84, .9, cr);
    vec2 tilt = (vec2(hsh(vec2(cr, 1.7)), hsh(vec2(cr, 8.3))) - .5) * .35;
    vec3 nm = normalize(vec3(-lx * 4. + tilt.x, -ly * 4. + tilt.y, 1.));
    vec3 hv = normalize(uL + vec3(0., 0., 1.));
    float sp = pow(max(dot(nm, hv), 0.), 90.) * catches * (1. - joint);
    vec3 ns = normalize(vec3(-lx * 1.2, -ly * 1.2, 1.));
    float toward = clamp(.55 - dot(vUv - .5, uL2) * .9, 0., 1.);
    float broad = pow(max(dot(ns, hv), 0.), 5.) * (.05 + .07 * toward) * (.7 + .6 * vn(p / 170.));
    float glossy = wet * (1. - aV);
    F += vec3(1., .98, .94) * glossy * (sp * 1.1 + broad);

    // ── the sand ──
    // a wet film of sand goes see-through, as the dust does
    float aS = 1. - exp(-max(h - .12 - .7 * wet, 0.) / (1.9 * (.5 + gr)));
    vec3 sandC = uSandTint * (.8 + .4 * gr) * (.93 + .14 * vn(p / 130. + 9.));
    // damp at the foot of the walls, and soil spilled in where the cut has crumbled
    float spill = mk.a * smoothstep(-34., -4., din) * (.6 + .4 * vn(p / 14.));
    float damp = smoothstep(-20., 0., din) * (.55 + .45 * vn(p / 26. + 2.));
    vec3 soilC = uSoilTint * (.75 + .5 * gr);
    sandC = mix(sandC, soilC, clamp(spill * 1.3, 0., .85));
    sandC *= 1. - .2 * damp;
    // wet sand: darker in its own hue; a darker line where wet meets dry
    float rim = clamp(wet * (1. - wet) * 4., 0., 1.);
    float sl = lum(sandC);
    vec3 sandW = clamp(mix(vec3(sl), sandC, 1.5), 0., 1.) * .66;
    sandC = mix(sandC, sandW, wet) * (1. - .16 * rim);
    vec3 n = normalize(vec3(-g * pit - vec2(gx, gy) * 1.1, 1.));

    // the cut and the soil above it
    vec2 mo = uMaskTexel;
    float bx = texture2D(uMask, vUv + vec2(mo.x, 0.)).b - texture2D(uMask, vUv - vec2(mo.x, 0.)).b;
    float by = texture2D(uMask, vUv + vec2(0., mo.y)).b - texture2D(uMask, vUv - vec2(0., mo.y)).b;
    vec2 bg = vec2(bx, by) * uWallH / (2. * mo * uSize);
    float wallMix = smoothstep(.3, 2.6, din);       // the cut face is soil only once it rises
    vec3 nw = normalize(vec3(-bg - vec2(gx, gy) * 1.2, 1.));
    n = normalize(mix(n, nw, wallMix));

    // shadow: march toward the light through the height field (sand and walls)
    float H0 = max(h, base);
    float occ = 0.;
    for (int i = 1; i <= 14; i++) {
        float d = float(i) * 2.6;
        vec2 qp = p + uL2 * d;
        float hq = max(heightAt(qp), texture2D(uMask, qp / uSize).b * uWallH);
        occ = max(occ, clamp((hq - H0 - d * uTanE) / (1.2 + d * .07), 0., 1.));   // the penumbra widens with distance
    }
    float diff = max(dot(n, uL), 0.) / uL.z;
    float lit = .52 + .48 * diff * (1. - occ);

    vec3 S = sandC * lit;
    vec3 c = mix(F * (1. - vec3(.26, .27, .25) * occ), S, aS);
    float gs = grain(p * .42 + 31.);
    float clod = vn(p / 40.) * .6 + vn(p / 11. + 5.) * .4;
    vec3 soil = uSoilTint * (.6 + .45 * gs + .4 * clod);
    // the soil just behind the cut is damper and darker
    soil *= 1. - .22 * (1. - smoothstep(4., 18., din)) * smoothstep(1., 4., din);
    // pebbles: lit domes, each its own colour, with a shadow on the far side
    vec4 pb = pebble(p, 17., .26) * smoothstep(4., 9., din);
    vec3 pc = uSoilTint * mix(vec3(1.05, 1.02, 1.), vec3(1.3, 1.24, 1.16), pb.w) * (.9 + .25 * gs);
    pc = mix(pc, uSoilTint * vec3(.95, .82, .72), step(.78, pb.w));
    float pl = .7 + .45 * max(dot(normalize(vec3(pb.yz, 1.)), uL), 0.) / uL.z * .5;
    soil = mix(soil, pc * pl, pb.x);
    soil *= mix(lit, 1., pb.x);
    c = mix(c, soil, wallMix);

    // the ragged outer edge of the soil, crumbling into the paper
    float a = 1. - smoothstep(-.7, .7, dout + (gr - .5) * 5.);
    gl_FragColor = vec4(c * a, a);
}`;

export function excavation(root, opts = {}) {
    const img = root && root.querySelector(':scope > img');
    if (!img) return () => {};
    const num = (k, d) => {
        const v = opts[k] ?? root.dataset[k];
        return v == null || v === '' || !isFinite(Number(v)) ? d : Number(v);
    };
    const hintRaw = opts.hint ?? root.dataset.hint ?? '.14 .8';
    const hint = hintRaw === 'none' ? null : String(hintRaw).trim().split(/[\s,]+/).map(Number);
    const cfg = {
        depth: clamp(num('depth', 7), 1, 30),
        brush: clamp(num('brush', 1), 0.3, 3),
        dry: Math.max(2, num('dry', 24)),
        sand: opts.sand || root.dataset.sand || new URL('assets/sand.webp', import.meta.url).href,
    };

    let dead = false;
    let gl = null, prog = null, buf = null, U = {};
    let texImg, texSand, texState, texState2, texMask;
    let canvas = null, live = null;
    let W = 0, H = 0, dpr = 1, cell = 4, cols = 0, rows = 0;
    let h, D, Wt, C2, S2, Sb, evap, inPit, edge, delta;   // fields
    let px1, px2;                                          // packed textures
    let dirty = null;          // rows to re-upload
    let relax = null;          // rect still slumping
    let wetRect = null;        // rect that holds water
    let visible = false, raf = 0, last = 0;
    let sandImg = null;
    let brushing = null;       // { x, y } css px of the last point
    const queue = [];          // pending segments
    const splashes = [];       // splashes still spreading
    let sizeTimer = 0;
    const off = [];
    const on = (t, type, fn, o) => { t.addEventListener(type, fn, o); off.push(() => t.removeEventListener(type, fn, o)); };

    // ── GL ────────────────────────────────────────────────────────────
    function initGL() {
        gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
        if (!gl) return false;
        const sh = (type, src) => {
            const s = gl.createShader(type);
            gl.shaderSource(s, src);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; }
            return s;
        };
        const vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG);
        if (!vs || !fs) return false;
        prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
        gl.useProgram(prog);
        buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(prog, 'p');
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        for (const n of ['uImg', 'uSand', 'uState', 'uState2', 'uMask', 'uSize', 'uGrid', 'uImgTexel', 'uMaskTexel', 'uTile', 'uDpr', 'uL', 'uL2', 'uTanE', 'uSandTint', 'uSoilTint', 'uDustTint', 'uWallH']) U[n] = gl.getUniformLocation(prog, n);
        const tex = (wrap) => {
            const t = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, t);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap || gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap || gl.CLAMP_TO_EDGE);
            return t;
        };
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        texImg = tex(); texState = tex(); texState2 = tex(); texMask = tex();
        texSand = tex(gl.REPEAT);
        if (sandImg) {
            gl.bindTexture(gl.TEXTURE_2D, texSand);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, gl.LUMINANCE, gl.UNSIGNED_BYTE, sandImg);
            gl.generateMipmap(gl.TEXTURE_2D);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        } else {
            gl.bindTexture(gl.TEXTURE_2D, texSand);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 1, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, new Uint8Array([128]));
        }
        ['uImg', 'uSand', 'uState', 'uState2', 'uMask'].forEach((n, i) => gl.uniform1i(U[n], i));
        const e = (ELEV * Math.PI) / 180, l = Math.hypot(LIGHT[0], LIGHT[1]);
        const lx = LIGHT[0] / l, ly = LIGHT[1] / l;
        gl.uniform3f(U.uL, lx * Math.cos(e), ly * Math.cos(e), Math.sin(e));
        gl.uniform2f(U.uL2, lx, ly);
        gl.uniform1f(U.uTanE, Math.tan(e));
        gl.uniform3f(U.uSandTint, ...(cssColor('--ex-sand') || [0.79, 0.71, 0.58]));
        gl.uniform3f(U.uSoilTint, ...(cssColor('--ex-soil') || [0.52, 0.44, 0.36]));
        gl.uniform3f(U.uDustTint, ...(cssColor('--ex-dust') || [0.86, 0.82, 0.74]));
        return true;
    }

    function cssColor(name) {
        const raw = getComputedStyle(root).getPropertyValue(name).trim();
        if (!raw) return null;
        const g = document.createElement('canvas').getContext('2d');
        g.fillStyle = '#000';
        g.fillStyle = raw;
        const m = g.fillStyle.match(/^#([0-9a-f]{6})$/i);
        if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
        const p = g.fillStyle.match(/[\d.]+/g);
        return p ? p.slice(0, 3).map((x) => Number(x) / 255) : null;
    }

    // The visible crop of the image (object-fit / object-position honoured),
    // drawn once at device resolution so the shader samples it 1:1.
    function prepareImage() {
        const cs = getComputedStyle(img);
        const iw = img.naturalWidth, ih = img.naturalHeight;
        let sx = 0, sy = 0, sw = iw, sh = ih;
        if (cs.objectFit === 'cover') {
            const k = Math.max(W / iw, H / ih);
            sw = W / k; sh = H / k;
            const pos = (cs.objectPosition || '50% 50%').split(' ');
            const frac = (s, room) => (s.endsWith('%') ? parseFloat(s) / 100 : room > 0 ? clamp(parseFloat(s) / room) : 0.5);
            sx = (iw - sw) * frac(pos[0] || '50%', (iw - sw) * k);
            sy = (ih - sh) * frac(pos[1] || '50%', (ih - sh) * k);
        }
        const c = document.createElement('canvas');
        c.width = canvas.width;
        c.height = canvas.height;
        const g = c.getContext('2d');
        g.imageSmoothingEnabled = true;
        g.imageSmoothingQuality = 'high';
        g.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texImg);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, c);   // throws if cross-origin
    }

    // ── the trench: its cut (inner) and the ragged edge of the soil (outer) ──
    let margin = 20, amp1 = 6, amp2 = 6;
    function sdBox(x, y, hx, hy, r) {
        const qx = Math.abs(x) - hx + r, qy = Math.abs(y) - hy + r;
        return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
    }
    // the cut sits off-centre in its soil: a wide bank on one side, almost none on another
    const IN = [0.85, 1.3, 0.62, 0.42];      // left, top, right, bottom, in margins
    const OUT = [0.18, 0.12, 0.2, 0.16];
    function sdLTRB(x, y, k, r) {
        const l = margin * k[0], t = margin * k[1], rr = margin * k[2], b = margin * k[3];
        return sdBox(x - (l + W - rr) / 2, y - (t + H - b) / 2, (W - rr - l) / 2, (H - b - t) / 2, r);
    }
    // where the cut has crumbled and soil has spilled into the trench
    const spillAt = (x, y) => smooth(0.56, 0.72, fbm(x / 140, y / 140, 61, 2));
    function dIn(x, y) {
        const d = sdLTRB(x, y, IN, 10);
        // a spade-cut edge: long straight runs that wander, a few bites, crumbs
        return d + amp1 * (fbm(x / 260, y / 260, 3, 2) * 2 - 1) + amp1 * 0.35 * (fbm(x / 45, y / 45, 4, 2) * 2 - 1)
            + 1.4 * (vnoise(x / 7, y / 7, 41) * 2 - 1);
    }
    function dOut(x, y, din) {
        const d = sdLTRB(x, y, OUT, 18) + amp2 * 0.55;
        const r = d + amp2 * (fbm(x / 170, y / 170, 9, 3) * 2 - 1) * 1.1 + amp2 * 0.3 * (fbm(x / 30, y / 30, 19, 3) * 2 - 1) + 2 * (vnoise(x / 6, y / 6, 77) * 2 - 1);
        return Math.min(r, din - 4);     // always at least a little soil beyond the cut
    }
    let WALL_H = 40, WALL_W = 7;   // css px: the height of the cut, and how far its face leans, seen from above

    function buildMask() {
        const mw = Math.max(8, Math.ceil(W / 2)), mh = Math.max(8, Math.ceil(H / 2));
        const data = new Uint8Array(mw * mh * 4);
        const enc = (d) => Math.round(clamp(d / 32 * 0.5 + 0.5) * 255);
        for (let y = 0; y < mh; y++) {
            for (let x = 0; x < mw; x++) {
                const cx = ((x + 0.5) / mw) * W, cy = ((y + 0.5) / mh) * H;
                const din = dIn(cx, cy);
                const o = (y * mw + x) * 4;
                data[o] = enc(din);
                data[o + 1] = enc(dOut(cx, cy, din));
                data[o + 2] = Math.round(smooth(0, WALL_W, din) * 255);
                data[o + 3] = Math.round(spillAt(cx, cy) * 255);
            }
        }
        gl.activeTexture(gl.TEXTURE4);
        gl.bindTexture(gl.TEXTURE_2D, texMask);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, mw, mh, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
        gl.uniform2f(U.uMaskTexel, 1 / mw, 1 / mh);
    }

    // ── layout ────────────────────────────────────────────────────────
    function layout(keep) {
        const r = root.getBoundingClientRect();
        const old = keep && h ? { h, D, Wt, C2, S2, Sb, cols, rows } : null;
        W = Math.max(1, r.width);
        H = Math.max(1, r.height);
        dpr = Math.min(devicePixelRatio || 1, 2);
        const max = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;
        dpr = Math.min(dpr, max / W, max / H);
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        gl.viewport(0, 0, canvas.width, canvas.height);

        margin = clamp(Math.min(W, H) * 0.085, 22, 64);
        amp1 = margin * 0.38;
        amp2 = margin * 0.5;
        WALL_H = clamp(Math.min(W, H) * 0.055, 18, 40);
        WALL_W = clamp(WALL_H * 0.18, 4, 7);
        gl.uniform1f(U.uWallH, WALL_H);

        cell = Math.max(Math.max(W, H) / 300, 2.5);
        cols = Math.max(8, Math.round(W / cell));
        cell = W / cols;
        rows = Math.max(8, Math.round(H / cell));
        const n = cols * rows;
        h = new Float32Array(n); D = new Float32Array(n); Wt = new Float32Array(n);
        C2 = new Float32Array(n); S2 = new Float32Array(n); Sb = new Float32Array(n);
        evap = new Float32Array(n); inPit = new Uint8Array(n);
        delta = new Float32Array(n);
        px1 = new Uint8Array(n * 4); px2 = new Uint8Array(n * 4);
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const i = y * cols + x, cx = (x + 0.5) * cell, cy = (y + 0.5) * cell;
                const din = dIn(cx, cy);
                inPit[i] = din < -0.5 ? 1 : 0;
                evap[i] = 0.75 + 0.5 * fbm(cx / 40, cy / 40, 55, 3);
            }
        }
        edge = new Int32Array(n).fill(-1);
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const i = y * cols + x;
                if (inPit[i]) continue;
                let best = -1, bd = 9;
                for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
                    const xx = x + dx, yy = y + dy, d = dx * dx + dy * dy;
                    if (xx < 0 || yy < 0 || xx >= cols || yy >= rows || d >= bd) continue;
                    if (inPit[yy * cols + xx]) { bd = d; best = yy * cols + xx; }
                }
                edge[i] = best;
            }
        }
        if (old) resample(old); else bury();

        prepareImage();
        buildMask();
        gl.uniform2f(U.uSize, W, H);
        gl.uniform2f(U.uGrid, cols * cell, rows * cell);
        gl.uniform2f(U.uImgTexel, 1 / canvas.width, 1 / canvas.height);
        gl.uniform1f(U.uTile, 420);
        gl.uniform1f(U.uDpr, dpr);
        for (const [t, unit, data] of [[texState, 2, px1], [texState2, 3, px2]]) {
            gl.activeTexture(gl.TEXTURE0 + unit);
            gl.bindTexture(gl.TEXTURE_2D, t);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, cols, rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
        }
        relax = null;
        dirty = { y0: 0, y1: rows - 1 };
        pack(0, rows - 1);
    }

    function resample(o) {
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const i = y * cols + x;
                const j = Math.min(o.rows - 1, Math.floor(((y + 0.5) / rows) * o.rows)) * o.cols + Math.min(o.cols - 1, Math.floor(((x + 0.5) / cols) * o.cols));
                h[i] = inPit[i] ? o.h[j] : 0; D[i] = o.D[j]; Wt[i] = inPit[i] ? o.Wt[j] : 0;
                C2[i] = o.C2[j]; S2[i] = o.S2[j]; Sb[i] = o.Sb[j];
            }
        }
        wetRect = { x0: 0, y0: 0, x1: cols - 1, y1: rows - 1 };
    }

    // The floor as it is found: an even skin of sand, thicker in places and
    // against the walls, with wind ripples across it, and a dust film.
    function bury() {
        const dep = cfg.depth;
        const rx = 0.82, ry = 0.57;                 // ripple crests run across the wind
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const i = y * cols + x;
                D[i] = 0.88 + 0.12 * vnoise(x / 7, y / 7, 5);
                if (!inPit[i]) { h[i] = 0; continue; }
                const cx = (x + 0.5) * cell, cy = (y + 0.5) * cell;
                const din = dIn(cx, cy);
                let t = dep * (0.72 + 0.62 * fbm(cx / 210, cy / 210, 1, 3)) + dep * 0.25 * (fbm(cx / 55, cy / 55, 2, 3) - 0.5);
                // drift ripples: asymmetric, wandering, fading in and out
                const ph = (cx * rx + cy * ry) / 23 + 3.2 * fbm(cx / 160, cy / 160, 6, 2);
                const s = ph - Math.floor(ph);
                const prof = s < 0.7 ? s / 0.7 : (1 - s) / 0.3;      // a long stoss, a short lee
                t += (prof - 0.5) * 1.5 * smooth(0.35, 0.7, fbm(cx / 140, cy / 140, 8, 2));
                // sand slumped against the foot of the walls
                t += dep * (0.5 + 1.6 * spillAt(cx, cy)) * Math.exp(din / 24);
                h[i] = Math.max(0.5, t);
            }
        }
        // a corner someone has already started on
        if (hint) brushPatch(hint[0], hint[1], 0.15, 9, 7);
        if (calm.matches) {
            brushPatch(0.47, 0.5, 0.28, 16, 11);
            brushPatch(0.7, 0.36, 0.2, 10, 13);
        }
        settle(400);
        // reduced motion: the floor as it is photographed, one patch already wet (and it stays wet)
        if (calm.matches) spread({ x: W * 0.47, y: H * 0.5, R: clamp(Math.min(W, H) * 0.3, 70, 230), drops: [], seed: 3 }, 1);
    }

    // brush a ragged patch: wiggly back-and-forth strokes, as a person does
    function brushPatch(fx, fy, size, strokes, seed) {
        const R = Math.min(W, H) * size;
        let s = seed;
        const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
        for (let k = 0; k < strokes; k++) {
            const a = (rnd() - 0.5) * 1.1 + (k % 2 ? 0.25 : -0.2);
            const cx = fx * W + (rnd() - 0.5) * R * 0.9, cy = fy * H + (rnd() - 0.5) * R * 0.7;
            const L = R * (0.7 + 0.5 * rnd());
            let prev = null;
            const N = 60;
            for (let i = 0; i <= N; i++) {
                const t = i / N;
                // back and forth along the stroke, drifting sideways
                const along = Math.sin(t * Math.PI * 5) * L * 0.5;
                const side = (t - 0.5) * R * 0.8;
                const x = cx + Math.cos(a) * along - Math.sin(a) * side;
                const y = cy + Math.sin(a) * along + Math.cos(a) * side;
                if (prev) segment(prev.x, prev.y, x, y);
                prev = { x, y };
            }
            settle(6);
        }
    }

    // ── the brush ─────────────────────────────────────────────────────
    const brushR = () => clamp(Math.sqrt(W * H) * 0.039, 20, 40) * cfg.brush;

    let travel = 0, stepN = 0;
    function segment(ax, ay, bx, by) {
        const len = Math.hypot(bx - ax, by - ay);
        if (len < 0.01) return;
        const n = Math.max(1, Math.ceil(len / (cell * 0.7)));
        const dx = (bx - ax) / len, dy = (by - ay) / len;
        const R = brushR();
        for (let i = 0; i < n; i++) {
            const f = (i + 1) / n;
            travel += len / n;
            // a hand wobbles: the bristles wander a little either side of the path
            const wob = R * 0.16 * (fbm(travel / 55, 3.7, 71, 2) * 2 - 1);
            stepBrush(ax + (bx - ax) * f - dy * wob, ay + (by - ay) * f + dx * wob, dx, dy, len / n, len);
        }
    }

    // One small step of the brush, centred at (px, py) css px, moving along (dx, dy).
    function stepBrush(px, py, dx, dy, len, speed) {
        const R = brushR(), A = R * 0.85;          // a round brush, a little narrower along the stroke
        const sn = ++stepN * 7919;
        const ext = Math.max(R, A) * 1.7 + cell * 2;
        const x0 = Math.max(0, Math.floor((px - ext) / cell)), x1 = Math.min(cols - 1, Math.ceil((px + ext) / cell));
        const y0 = Math.max(0, Math.floor((py - ext) / cell)), y1 = Math.min(rows - 1, Math.ceil((py + ext) / cell));
        const kl = (K_LIFT * len) / (2 * A), kd = (K_DUST * len) / (2 * A);
        const ca = dx * dx - dy * dy, sa = 2 * dx * dy;   // cos 2a, sin 2a of the stroke
        const throwS = 1 + clamp(speed / (R * 0.6) - 0.5, 0, 1.2);   // a quick flick throws further
        // Which way is out? Look at the sand on a ring around the brush: an
        // excavator throws toward the unexcavated side, so a cleared patch grows
        // and its sand banks up round its edge instead of back into it.
        let ox = 0, oy = 0, hs = 0;
        for (let k = 0; k < 12; k++) {
            const a = (k / 12) * Math.PI * 2, ca = Math.cos(a), sa2 = Math.sin(a);
            const gx = Math.floor((px + ca * R * 1.8) / cell), gy = Math.floor((py + sa2 * R * 1.8) / cell);
            const j = gy * cols + gx;
            const hh = gx < 0 || gy < 0 || gx >= cols || gy >= rows || !inPit[j] ? cfg.depth * 1.5 : h[j];
            ox += ca * hh; oy += sa2 * hh; hs += hh;
        }
        const ol = Math.hypot(ox, oy) || 1;
        const bias = clamp((ol / (hs / 12 * 4 + 0.6)) * 1.8, 0, 0.85);   // 0 in even sand, toward .85 at a patch's edge
        ox /= ol; oy /= ol;
        for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
                const i = y * cols + x;
                if (!inPit[i]) continue;
                const rx = (x + 0.5) * cell - px, ry = (y + 0.5) * cell - py;
                const u = rx * dx + ry * dy, v = -rx * dy + ry * dx;
                const e = (u / A) * (u / A) + (v / R) * (v / R);
                if (e >= 1) {
                    // Just outside the bristles the splayed tips still flick sand
                    // outward, toward the unexcavated side: a spur of sand left
                    // between two strokes is knocked out to the bank, so the
                    // clearing's edge stays one continuous, rounded bank.
                    if (e < 2.6 && bias > 0.12 && h[i] > 0.4) {
                        const k = 0.2 * (1 - (e - 1) / 1.6) * bias * Math.min(1, len / (cell * 0.7));
                        const q = (h[i] - 0.3) * k;
                        if (q > 0) {
                            const t = land((x + 0.5) * cell, (y + 0.5) * cell, ox, oy, R * 0.45, R);
                            const put = deposit(t.x, t.y, q);
                            delta[i] -= put;
                        }
                    }
                    continue;
                }
                const w = Math.pow(1 - e, 1.4);              // soft at the edge: the outer bristles barely touch
                const avail = h[i] - RESIDUE;
                const hold = 1 - 0.8 * smooth(0.1, 0.6, Wt[i]);       // wet sand clings
                if (avail > 0) {
                    const m = avail * (1 - Math.exp(-kl * w * hold));
                    const vn = v / R;
                    const side = Math.abs(vn) < 0.1 ? (hash(x, y) < 0.5 ? -1 : 1) : Math.sign(vn);
                    const lat = 0.72 + 0.26 * Math.abs(vn);
                    // fresh randomness every step, so the same spot is never hit twice
                    const j1 = hash(x * 3 + sn, y + 7), j2 = hash(x + 11, y * 5 + sn), j3 = hash(x + sn, y * 13 + 3);
                    // ahead of the bristles (picked up again by the next step), fanned
                    // over an arc, so a turnaround leaves a spread bank, not a heap
                    const fw = A * 1.0 + j2 * (R * 0.5 + Math.min(speed * 0.4, R * 0.6));
                    let fx = dx * (1 - bias) + ox * bias, fy = dy * (1 - bias) + oy * bias;
                    let fl = Math.hypot(fx, fy) || 1;
                    const fa = (j1 - 0.5) * 1.8, fc = Math.cos(fa), fs = Math.sin(fa);
                    const gx = (fx * fc - fy * fs) / fl, gy = (fx * fs + fy * fc) / fl;
                    let q0 = land(px - dy * v * 0.6 * (1 - bias), py + dx * v * 0.6 * (1 - bias), gx, gy, fw, R);
                    let moved = deposit(q0.x, q0.y, m * (1 - lat) * KEEP);
                    // out to the side, past the bristles: the banks; bent toward the
                    // outside of the patch, and fanned too
                    const sd = R * (1.02 + 0.85 * j2 * throwS);
                    const fu = u * 0.5 + (j1 - 0.5) * R * 0.7;
                    let tx = -dy * side * (1 - bias) + ox * bias * 1.6, ty = dx * side * (1 - bias) + oy * bias * 1.6;
                    const tl = Math.hypot(tx, ty) || 1;
                    const ta = (j3 - 0.5) * 1.2, tc = Math.cos(ta), ts = Math.sin(ta);
                    const sx = (tx * tc - ty * ts) / tl, sy = (tx * ts + ty * tc) / tl;
                    q0 = land(px + dx * fu * (1 - bias), py + dy * fu * (1 - bias), sx, sy, sd, R);
                    moved += deposit(q0.x, q0.y, m * lat * KEEP);
                    // what would land on the wall stays where it was; the fine fraction is lost to the air (and the dustpan)
                    delta[i] -= moved > 0 ? moved / KEEP : 0;
                }
                // the bristles reach the floor only where the sand is thin
                const touch = smooth(2.2, 0.5, h[i]) * w;
                if (touch > 0) {
                    D[i] = Math.max(DUST_MIN, D[i] * Math.exp(-kd * touch * hold));
                    const k = clamp(touch * len / A * 0.9);
                    C2[i] += (ca - C2[i]) * k; S2[i] += (sa - S2[i]) * k;
                    Sb[i] = Math.min(1, Sb[i] + touch * len / A * 0.25);
                }
            }
        }
        for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
                const i = y * cols + x;
                if (delta[i] !== 0) { h[i] = Math.max(0, h[i] + delta[i]); delta[i] = 0; }
            }
        }
        grow('relax', x0, y0, x1, y1);
        markDirty(y0, y1);
    }

    // Where thrown sand comes to rest. Sand pushed across bare, already-cleared
    // floor keeps sliding until it meets standing sand, and stops against its
    // foot: so strokes inside a cleared patch feed the one bank around it,
    // instead of leaving a ridge (and a row of teeth) between every two strokes.
    function land(x, y, ux, uy, d0, R) {
        const thr = Math.max(1, cfg.depth * 0.3);
        const step = cell * 1.2, dmax = d0 + R * 2.4;
        let d = d0, lx = x + ux * d, ly = y + uy * d;
        for (; d < dmax; d += step) {
            const qx = x + ux * d, qy = y + uy * d;
            const gx = Math.floor(qx / cell), gy = Math.floor(qy / cell);
            if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) break;
            const j = gy * cols + gx;
            if (!inPit[j]) break;
            lx = qx; ly = qy;
            if (h[j] + delta[j] > thr) break;
        }
        return { x: lx, y: ly };
    }

    // Add sand at a point (bilinear), on cells in the pit only. Returns how
    // much it placed: sand thrown against the wall stays where it was.
    function deposit(x, y, m) {
        if (m <= 0) return 0;
        const gx = x / cell - 0.5, gy = y / cell - 0.5;
        const ix = Math.floor(gx), iy = Math.floor(gy);
        const fx = gx - ix, fy = gy - iy;
        const ws = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy];
        const ids = [[ix, iy], [ix + 1, iy], [ix, iy + 1], [ix + 1, iy + 1]];
        let tot = 0;
        for (let k = 0; k < 4; k++) {
            const [cx, cy] = ids[k];
            if (cx < 0 || cy < 0 || cx >= cols || cy >= rows || !inPit[cy * cols + cx]) ws[k] = 0;
            tot += ws[k];
        }
        if (tot < 0.25) return 0;
        for (let k = 0; k < 4; k++) {
            if (!ws[k]) continue;
            const i = ids[k][1] * cols + ids[k][0];
            const a = (m * ws[k]) / tot;
            delta[i] += a;
            D[i] = Math.min(1, D[i] + a * 0.4);       // sand carries its dust with it
        }
        return m;
    }

    // ── granular relaxation ───────────────────────────────────────────
    // Each pair of neighbours (across, down and both diagonals) whose
    // difference is steeper than the angle of repose passes part of the
    // excess downhill. Symmetric, so no sand is made or lost.
    function relaxPass(r) {
        const C = cols;
        const x0 = Math.max(0, r.x0 - 1), x1 = Math.min(cols - 1, r.x1 + 1);
        const y0 = Math.max(0, r.y0 - 1), y1 = Math.min(rows - 1, r.y1 + 1);
        const T = REPOSE * cell, Td = T * Math.SQRT2;
        let moved = 0, nx0 = 1e9, ny0 = 1e9, nx1 = -1, ny1 = -1;
        const pair = (i, j, t) => {
            if (!inPit[j]) return 0;
            const d = h[i] - h[j];
            const wet = Math.max(Wt[i], Wt[j]);
            const tt = t * (1 + 2.2 * smooth(0.05, 0.5, wet));    // wet sand stands steeper
            // past the angle of repose it slides; a little short of it, it creeps,
            // which rounds the crest of a bank off
            let ex = Math.abs(d) - tt;
            if (ex <= 0) {
                ex = (Math.abs(d) - tt * 0.45) * 0.12;
                if (ex <= 0.004) return 0;
            }
            const q = ex * 0.15 * Math.sign(d);
            delta[i] -= q; delta[j] += q;
            return Math.abs(q);
        };
        for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
                const i = y * C + x;
                if (!inPit[i]) continue;
                let q = 0;
                if (x < C - 1) q += pair(i, i + 1, T);
                if (y < rows - 1) {
                    q += pair(i, i + C, T);
                    if (x < C - 1) q += pair(i, i + C + 1, Td);
                    if (x > 0) q += pair(i, i + C - 1, Td);
                }
                if (q > 0.004) {
                    moved = Math.max(moved, q);
                    if (x < nx0) nx0 = x; if (x > nx1) nx1 = x;
                    if (y < ny0) ny0 = y; if (y > ny1) ny1 = y;
                }
            }
        }
        for (let y = Math.max(0, y0 - 1); y <= Math.min(rows - 1, y1 + 1); y++) {
            for (let x = Math.max(0, x0 - 1); x <= Math.min(cols - 1, x1 + 1); x++) {
                const i = y * C + x;
                if (delta[i] !== 0) { h[i] = Math.max(0, h[i] + delta[i]); delta[i] = 0; }
            }
        }
        markDirty(Math.max(0, y0 - 1), Math.min(rows - 1, y1 + 1));
        return nx1 < 0 ? null : { x0: nx0, y0: ny0, x1: nx1, y1: ny1 };
    }
    function settle(n) {
        for (let k = 0; k < n && relax; k++) relax = relaxPass(relax);
    }

    function grow(which, x0, y0, x1, y1) {
        const r = which === 'relax' ? relax : wetRect;
        const nr = r ? { x0: Math.min(r.x0, x0), y0: Math.min(r.y0, y0), x1: Math.max(r.x1, x1), y1: Math.max(r.y1, y1) } : { x0, y0, x1, y1 };
        if (which === 'relax') relax = nr; else wetRect = nr;
    }
    function markDirty(y0, y1) {
        dirty = dirty ? { y0: Math.min(dirty.y0, y0), y1: Math.max(dirty.y1, y1) } : { y0, y1 };
    }

    // ── water ─────────────────────────────────────────────────────────
    function splash(fx, fy) {
        const R = clamp(Math.min(W, H) * 0.36, 80, 260);
        let s = Math.floor(fx * 9973 + fy * 7919 + performance.now()) % 2147483646 + 1;
        const sp = makeSplash(fx, fy, R, () => (s = (s * 16807) % 2147483647) / 2147483647);
        sp.t = calm.matches ? 1 : 0;
        splashes.push(sp);
        if (calm.matches) { spread(sp, 1); splashes.pop(); }
        announce('The floor is wet. The colours come up.');
        kick();
    }
    // A sponge-load thrown on a floor: a few overlapping lobes, runnels that
    // run off down the floor's slight fall, and drops flung past the edge.
    function makeSplash(fx, fy, R, rnd) {
        const lobes = [{ x: fx, y: fy, r: R * 0.62, k: 1 }];
        for (let k = 0; k < 4; k++) {
            const a = rnd() * Math.PI * 2, d = R * (0.25 + rnd() * 0.4);
            lobes.push({ x: fx + Math.cos(a) * d, y: fy + Math.sin(a) * d, r: R * (0.32 + rnd() * 0.3), k: 0.75 + rnd() * 0.25 });
        }
        const runs = [];
        for (let k = 0; k < 3; k++) {
            // the floor falls a little toward the lower right
            const a = 0.55 + (rnd() - 0.5) * 1.2, a0 = a + (rnd() - 0.5) * 1.6;
            const sx = fx + Math.cos(a0) * R * 0.5, sy = fy + Math.sin(a0) * R * 0.5;
            runs.push({ x: sx, y: sy, dx: Math.cos(a), dy: Math.sin(a), len: R * (0.4 + rnd() * 0.45), w: 9 + rnd() * 9, wob: rnd() * 10 });
        }
        const drops = [];
        for (let k = 0; k < 40; k++) {
            const a = rnd() * Math.PI * 2, d = R * (0.75 + rnd() * rnd() * 1.1);
            drops.push({ x: fx + Math.cos(a) * d, y: fy + Math.sin(a) * d, r: 1.5 + rnd() * rnd() * 7 });
        }
        return { x: fx, y: fy, R, lobes, runs, drops, seed: rnd() * 100 };
    }
    // the water reaches out over a third of a second, more at its heart
    function spread(sp, t) {
        if (!sp.lobes) { let s = 7; Object.assign(sp, makeSplash(sp.x, sp.y, sp.R, () => (s = (s * 16807) % 2147483647) / 2147483647)); }
        const e = 1 - Math.pow(1 - t, 3);
        const reach = sp.R * 1.6 * e;
        const x0 = Math.max(0, Math.floor((sp.x - sp.R * 2) / cell)), x1 = Math.min(cols - 1, Math.ceil((sp.x + sp.R * 2) / cell));
        const y0 = Math.max(0, Math.floor((sp.y - sp.R * 2) / cell)), y1 = Math.min(rows - 1, Math.ceil((sp.y + sp.R * 2) / cell));
        for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
                const i = y * cols + x;
                if (!inPit[i]) continue;
                const cx = (x + 0.5) * cell, cy = (y + 0.5) * cell;
                const ddx = cx - sp.x, ddy = cy - sp.y, d = Math.hypot(ddx, ddy);
                if (d > reach * 1.2) continue;
                // overlapping lobes, each rim wandering with the ground
                const rough = 1 + 0.35 * (fbm(cx / 38 + sp.seed, cy / 38, 12, 3) - 0.5) + 0.15 * (vnoise(cx / 9, cy / 9, 13) - 0.5);
                let w = 0;
                for (const lb of sp.lobes) {
                    const dl = Math.hypot(cx - lb.x, cy - lb.y) / (lb.r * rough);
                    if (dl < 1) w = Math.max(w, 1.8 * lb.k * Math.min(1, (1 - dl) * 2));   // a soft rim, about a tenth of the lobe
                }
                for (const rn of sp.runs) {
                    const rx = cx - rn.x, ry = cy - rn.y;
                    const al = rx * rn.dx + ry * rn.dy;
                    if (al < 0 || al > rn.len * Math.min(1, e * 1.4)) continue;
                    const wob = Math.sin(al / 23 + rn.wob) * 6 + Math.sin(al / 9 + rn.wob * 2) * 2;
                    const across = Math.abs(-rx * rn.dy + ry * rn.dx - wob);
                    const ww = rn.w * (1 - 0.6 * al / rn.len) * rough;
                    if (across < ww) w = Math.max(w, 1.1 * (1 - al / rn.len * 0.6) * Math.min(1, (1 - across / ww) * 2.2));
                }
                for (const dr of sp.drops) {
                    const dd = Math.hypot(cx - dr.x, cy - dr.y);
                    if (dd < dr.r && Math.hypot(dr.x - sp.x, dr.y - sp.y) <= reach) w = Math.max(w, 0.55 * (1 - dd / dr.r) + 0.2);
                }
                if (w > Wt[i]) Wt[i] = w;
            }
        }
        grow('wet', x0, y0, x1, y1);
        markDirty(y0, y1);
    }
    function dry(dt) {
        if (!wetRect) return;
        const r = wetRect, rate = 1.8 / cfg.dry;          // the heart (1.8) is dry in cfg.dry seconds
        let any = false;
        for (let y = r.y0; y <= r.y1; y++) {
            for (let x = r.x0; x <= r.x1; x++) {
                const i = y * cols + x;
                if (Wt[i] <= 0) continue;
                // thick sand drinks the water up a little sooner
                Wt[i] = Math.max(0, Wt[i] - dt * rate * evap[i] * (1 + 0.04 * h[i]));
                if (Wt[i] > 0) any = true;
            }
        }
        markDirty(r.y0, r.y1);
        if (!any) wetRect = null;
    }

    // ── pack the fields into the two state textures ───────────────────
    function pack(y0, y1) {
        const C = cols;
        for (let y = y0; y <= y1; y++) {
            for (let x = 0; x < C; x++) {
                const i = y * C + x, o = i * 4;
                // outside the pit, carry the sand at its edge (the walls come from the mask)
                const H0 = inPit[i] ? h[i] : edge[i] >= 0 ? h[edge[i]] : 0;
                const nb = (j) => (inPit[j] ? h[j] : H0);
                const l = nb(x > 0 ? i - 1 : i), r = nb(x < C - 1 ? i + 1 : i);
                const u = nb(y > 0 ? i - C : i), d = nb(y < rows - 1 ? i + C : i);
                const gx = (r - l) / (2 * cell), gy = (d - u) / (2 * cell);
                px1[o] = Math.round(Math.sqrt(clamp(H0 / HMAX)) * 255);
                px1[o + 1] = Math.round(smooth(0, 0.65, Wt[i]) * 255);
                px1[o + 2] = Math.round(clamp(gx / GMAX * 0.5 + 0.5) * 255);
                px1[o + 3] = Math.round(clamp(gy / GMAX * 0.5 + 0.5) * 255);
                px2[o] = Math.round(clamp(D[i]) * 255);
                px2[o + 1] = Math.round(clamp(C2[i] * 0.5 + 0.5) * 255);
                px2[o + 2] = Math.round(clamp(S2[i] * 0.5 + 0.5) * 255);
                px2[o + 3] = Math.round(clamp(Sb[i]) * 255);
            }
        }
    }
    function upload() {
        if (!dirty) return;
        const { y0, y1 } = dirty;
        dirty = null;
        pack(y0, y1);
        const n = y1 - y0 + 1;
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, texState);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, y0, cols, n, gl.RGBA, gl.UNSIGNED_BYTE, px1.subarray(y0 * cols * 4, (y1 + 1) * cols * 4));
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, texState2);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, y0, cols, n, gl.RGBA, gl.UNSIGNED_BYTE, px2.subarray(y0 * cols * 4, (y1 + 1) * cols * 4));
    }

    function draw() {
        upload();
        const t = [texImg, texSand, texState, texState2, texMask];
        t.forEach((x, k) => { gl.activeTexture(gl.TEXTURE0 + k); gl.bindTexture(gl.TEXTURE_2D, x); });
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    // ── loop ──────────────────────────────────────────────────────────
    let dryAcc = 0;
    function frame(t) {
        raf = 0;
        if (dead || !gl || gl.isContextLost()) return;
        const dt = last ? Math.min(0.1, (t - last) / 1000) : 1 / 60;
        last = t;
        while (queue.length) { const s = queue.shift(); segment(s[0], s[1], s[2], s[3]); }
        // sand slumps: a few passes a frame, so a steep ridge slides over a
        // fraction of a second, not at once
        if (relax) {
            if (calm.matches && !brushing) settle(400);
            else for (let k = 0; k < 4 && relax; k++) relax = relaxPass(relax);
        }
        for (let k = splashes.length - 1; k >= 0; k--) {
            const sp = splashes[k];
            sp.t = Math.min(1, sp.t + dt / 0.38);
            spread(sp, sp.t);
            if (sp.t >= 1) splashes.splice(k, 1);
        }
        // drying needs no more than ~20 frames a second
        if (wetRect && !calm.matches && !splashes.length) {
            dryAcc += dt;
            if (dryAcc > 0.05 || dirty) { dry(dryAcc); dryAcc = 0; }
        }
        if (dirty) draw();
        const busy = brushing || queue.length || relax || splashes.length || (wetRect && !calm.matches);
        if (busy && visible && !document.hidden) raf = requestAnimationFrame(frame);
        else last = 0;
    }
    function kick() {
        if (!raf && visible && gl && !dead) raf = requestAnimationFrame(frame);
    }

    // ── input ─────────────────────────────────────────────────────────
    const local = (cx, cy) => { const r = root.getBoundingClientRect(); return { x: cx - r.left, y: cy - r.top }; };
    const onSponge = (e) => e.target.closest && e.target.closest('.ex-sponge');
    function to(p) {
        if (brushing) queue.push([brushing.x, brushing.y, p.x, p.y]);
        brushing = p;
        kick();
    }

    // mouse and pen: drag brushes, a double click wets
    function onPointerDown(e) {
        if (e.pointerType === 'touch' || e.button !== 0 || onSponge(e)) return;
        e.preventDefault();
        brushing = local(e.clientX, e.clientY);
        try { root.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
        root.classList.add('is-brushing');
    }
    function onPointerMove(e) {
        if (e.pointerType === 'touch' || !brushing) return;
        const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
        for (const c of evs.length ? evs : [e]) to(local(c.clientX, c.clientY));
    }
    function onPointerUp(e) {
        if (e.pointerType === 'touch' || !brushing) return;
        brushing = null;
        root.classList.remove('is-brushing');
        kick();
    }
    function onDbl(e) {
        if (onSponge(e)) return;
        const p = local(e.clientX, e.clientY);
        splash(p.x, p.y);
    }

    // Touch: a sideways stroke brushes at once; a finger held still for a
    // quarter of a second brushes in any direction for that touch; anything
    // else is left to scroll the page. Two quick taps wet the floor.
    let tt = null, lastTap = null;
    function onTouchStart(e) {
        if (onSponge(e) || e.touches.length > 1) { tt = null; return; }
        const t = e.changedTouches[0];
        const p = local(t.clientX, t.clientY);
        tt = { id: t.identifier, x0: t.clientX, y0: t.clientY, p, at: performance.now(), mode: null, moved: 0 };
        tt.timer = setTimeout(() => {
            if (tt && !tt.mode && tt.moved < 8) {
                tt.mode = 'free';
                brushing = tt.p;
                root.classList.add('is-brushing');
            }
        }, 250);
    }
    function onTouchMove(e) {
        if (!tt) return;
        for (const t of e.changedTouches) {
            if (t.identifier !== tt.id) continue;
            const dx = t.clientX - tt.x0, dy = t.clientY - tt.y0;
            tt.moved = Math.max(tt.moved, Math.hypot(dx, dy));
            const p = local(t.clientX, t.clientY);
            if (!tt.mode && tt.moved > 7) {
                if (Math.abs(dx) > Math.abs(dy) * 1.15) {
                    tt.mode = 'side';
                    brushing = tt.p;
                    root.classList.add('is-brushing');
                } else {
                    tt.mode = 'scroll';
                    clearTimeout(tt.timer);
                }
            }
            if (tt.mode === 'side' || tt.mode === 'free') {
                if (e.cancelable) e.preventDefault();
                to(p);
            }
        }
    }
    function onTouchEnd(e) {
        if (!tt) return;
        for (const t of e.changedTouches) {
            if (t.identifier !== tt.id) continue;
            clearTimeout(tt.timer);
            const now = performance.now();
            if (e.type === 'touchend' && tt.moved < 10 && now - tt.at < 300) {
                const p = local(t.clientX, t.clientY);
                if (lastTap && now - lastTap.at < 360 && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < 40) {
                    splash(p.x, p.y);
                    lastTap = null;
                    if (e.cancelable) e.preventDefault();      // no double-tap zoom
                } else lastTap = { x: p.x, y: p.y, at: now };
            }
            if (brushing && (tt.mode === 'side' || tt.mode === 'free')) { brushing = null; kick(); }
            root.classList.remove('is-brushing');
            tt = null;
        }
    }

    // Keyboard: Enter wets the middle of the floor, arrows brush a stroke across it.
    function onKey(e) {
        if (e.target !== root) return;
        const dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            splash(W / 2, H / 2);
        } else if (dirs[e.key]) {
            e.preventDefault();
            const [dx, dy] = dirs[e.key];
            kb.x = clamp(kb.x + dx * 0.08, 0.12, 0.88);
            kb.y = clamp(kb.y + dy * 0.1, 0.15, 0.85);
            const cx = kb.x * W, cy = kb.y * H, L = brushR() * 3;
            let prev = null;
            for (let i = 0; i <= 40; i++) {
                const t = i / 40, a = Math.sin(t * Math.PI * 4) * L;
                const p = { x: cx + (dy ? a : 0) + dx * (t - 0.5) * L, y: cy + (dx ? a : 0) + dy * (t - 0.5) * L };
                if (prev) queue.push([prev.x, prev.y, p.x, p.y]);
                prev = p;
            }
            kick();
        }
    }
    const kb = { x: 0.5, y: 0.5 };

    // the sponge, pressed: water where the brushing has been
    function onSpongePress(e) {
        e.preventDefault();
        const b = e.currentTarget;
        b.classList.remove('is-squeezed');
        void b.offsetWidth;
        b.classList.add('is-squeezed');
        const p = cleared();
        splash(p.x, p.y);
    }
    // the middle of the floor that has been brushed clean (or the middle)
    function cleared() {
        let sx = 0, sy = 0, n = 0;
        for (let y = 0; y < rows; y += 2) {
            for (let x = 0; x < cols; x += 2) {
                const i = y * cols + x;
                if (inPit[i] && h[i] < 1.5) { const k = 1.5 - h[i]; sx += x * k; sy += y * k; n += k; }
            }
        }
        return n > 20 ? { x: (sx / n + 0.5) * cell, y: (sy / n + 0.5) * cell } : { x: W / 2, y: H / 2 };
    }

    let liveT = 0;
    function announce(s) {
        if (!live) return;
        clearTimeout(liveT);
        live.textContent = s;
        liveT = setTimeout(() => { if (live) live.textContent = ''; }, 4000);
    }

    // ── start ─────────────────────────────────────────────────────────
    let io = null, ro = null;
    async function start() {
        try { await img.decode(); } catch (e) { if (!img.complete || !img.naturalWidth) await new Promise((res) => img.addEventListener('load', res, { once: true })); }
        if (dead || !img.naturalWidth) return;
        sandImg = await new Promise((res) => {
            const s = new Image();
            s.onload = () => res(s);
            s.onerror = () => res(null);
            s.src = cfg.sand;
        });
        if (dead) return;

        canvas = document.createElement('canvas');
        canvas.className = 'ex-canvas';
        canvas.setAttribute('aria-hidden', 'true');
        try {
            if (!initGL()) throw new Error('no webgl');
            root.insertBefore(canvas, img.nextSibling);
            layout(false);
            draw();
        } catch (e) {
            if (canvas) canvas.remove();
            canvas = null;
            gl = null;
            return;      // the dusted <img> stays: that is the fallback
        }
        root.classList.add('is-live');

        on(canvas, 'webglcontextlost', (e) => { e.preventDefault(); cancelAnimationFrame(raf); raf = 0; root.classList.remove('is-live'); });
        on(canvas, 'webglcontextrestored', () => {
            try { if (initGL()) { layout(true); draw(); root.classList.add('is-live'); } } catch (e) { /* stay on the img */ }
        });

        img.draggable = false;
        if (!root.hasAttribute('tabindex')) { root.tabIndex = 0; root.dataset.exTab = '1'; }
        if (!root.hasAttribute('role')) { root.setAttribute('role', 'application'); root.dataset.exRole = '1'; }
        if (!root.hasAttribute('aria-label')) {
            root.setAttribute('aria-label', 'A mosaic floor under sand. Drag to brush the sand aside, double-tap or press Enter to wet the floor, arrow keys to brush.');
            root.dataset.exLabel = '1';
        }
        live = document.createElement('span');
        live.className = 'ex-live';
        live.setAttribute('aria-live', 'polite');
        root.appendChild(live);

        on(root, 'pointerdown', onPointerDown);
        on(root, 'pointermove', onPointerMove);
        on(root, 'pointerup', onPointerUp);
        on(root, 'pointercancel', onPointerUp);
        on(root, 'dblclick', onDbl);
        on(root, 'touchstart', onTouchStart, { passive: true });
        on(root, 'touchmove', onTouchMove, { passive: false });
        on(root, 'touchend', onTouchEnd, { passive: false });
        on(root, 'touchcancel', onTouchEnd, { passive: true });
        on(root, 'keydown', onKey);
        on(root, 'dragstart', (e) => e.preventDefault());
        root.querySelectorAll('.ex-sponge').forEach((b) => {
            on(b, 'click', onSpongePress);
            on(b, 'animationend', () => b.classList.remove('is-squeezed'));
        });
        on(document, 'visibilitychange', () => { if (!document.hidden) { last = 0; kick(); } });

        io = new IntersectionObserver((en) => {
            visible = en[0].isIntersecting;
            if (visible) { last = 0; kick(); }
        });
        io.observe(root);

        let w0 = W, h0 = H;
        ro = new ResizeObserver(() => {
            const r = root.getBoundingClientRect();
            if (Math.abs(r.width - w0) < 1 && Math.abs(r.height - h0) < 1) return;
            clearTimeout(sizeTimer);
            sizeTimer = setTimeout(() => {
                if (dead || !gl) return;
                layout(true); w0 = W; h0 = H;
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
        clearTimeout(liveT);
        if (tt) clearTimeout(tt.timer);
        off.forEach((f) => f());
        if (io) io.disconnect();
        if (ro) ro.disconnect();
        if (gl) { const x = gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); }
        if (canvas) canvas.remove();
        if (live) live.remove();
        root.classList.remove('is-live', 'is-brushing');
        if (root.dataset.exTab) { root.removeAttribute('tabindex'); delete root.dataset.exTab; }
        if (root.dataset.exRole) { root.removeAttribute('role'); delete root.dataset.exRole; }
        if (root.dataset.exLabel) { root.removeAttribute('aria-label'); delete root.dataset.exLabel; }
    };
}

// Auto-start every [data-excavation], each once it is near the viewport.
function autoStart(el) {
    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((en) => {
        if (!en[0].isIntersecting) return;
        io.disconnect();
        excavation(el);
    }, { rootMargin: '600px' });
    io.observe(el);
}
document.querySelectorAll('[data-excavation]').forEach(autoStart);
