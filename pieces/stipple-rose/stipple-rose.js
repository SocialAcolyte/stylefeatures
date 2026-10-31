/* stipple-rose — a plate of Redouté's Les Roses printed the way it was, as you scroll.
 *
 *   <section data-stipple-rose data-src="assets/rose.json">
 *     <div class="sr-stage"><img class="sr-img" src="assets/rose.webp" alt="" aria-hidden="true"></div>
 *   </section>
 *
 * 1. The engraved copper: the plate's own stipple, a field of tiny pits in polished copper,
 *    the rose the wrong way round. It opens close, under a glass, and pulls back.
 * 2. Inking à la poupée: rose madder dabbed into the petals, green into the leaves, yellow
 *    into the stamens, black into the lettering, each in soft round dabs a little past its
 *    area, then wiped off the surface so the colour stays only in the dots.
 * 3. The pull: dampened paper laid on, the roller passes, the sheet is peeled back from one
 *    edge and turned over: the print, the right way round, pale and flat.
 * 4. Finished by hand in watercolour: the leaves greened, the hip and the bud, the flowers'
 *    first glaze, the stamens, and last the deep flush of the petals. The last frame is the
 *    scan of the real plate, pixel for pixel. Scroll back and it all un-makes.
 *
 * Everything heavy is offline (see README): the scan split in optical density into the
 * print (on the dots) and the watercolour (the smooth floor between them), the dots found
 * one by one, the poupée areas and their dabs, the wash areas and their wet fronts.
 *
 * Options (data-* or the options object, which wins):
 *   src      the plate's JSON (required); images beside it: <name>.webp, -wash, -paper,
 *            -dots, -ink, -wmap (.webp)
 *   mode     'scroll' (default: a pinned stage on a runway) | 'static' (the finished plate)
 *   runway   section height in svh (default 380)
 *   webgl    'off' leaves the finished plate as an image
 *
 * Events (bubbling, for sound later): 'stipple-rose:stage' {stage} as each stage begins
 * while scrolling forward ('ink', 'pull', 'press', 'peel', 'finish'), 'stipple-rose:dab'
 * {group, kind} as each colour goes on, and 'stipple-rose:done' when the last wash is dry.
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
        im.onerror = () => rej(new Error('stipple-rose: could not load ' + url));
        im.src = url;
    });
}
function loadExact(url) {
    return fetch(url).then((r) => { if (!r.ok) throw new Error('stipple-rose: could not load ' + url); return r.blob(); })
        .then((b) => createImageBitmap(b, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }));
}

/* ── Noise: one tileable 512² RGBA texture, made once ─────────────────────────
 * R fibres / fine speckle   G mid mottle (sizing, the rag's soft unevenness)
 * B tooth (grain)           A broad (sheen, the copper's soft reflections) */
let noiseCache = null;
function makeNoise() {
    if (noiseCache) return noiseCache;
    const S = 512, out = new Uint8Array(S * S * 4);
    let seed = 4127;
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

const VERT = `#version 300 es
in vec2 aP; uniform vec2 uStage; out vec2 vQ;
void main(){ vQ = vec2(aP.x * .5 + .5, .5 - aP.y * .5) * uStage; gl_Position = vec4(aP, 0., 1.); }`;

/* One quad. World coordinates are in units of the sheet (x in sheet widths, y in sheet
 * heights); the finished sheet lies at [0,1]². Before the pull the paper and the plate lie
 * to the left of it, at uPaperX, so that the peeled sheet, turned over to the right, lands
 * exactly where the finished sheet is.
 * Optical density everywhere (linear light): O = paper · exp(-Dp) · exp(-Dw). */
const FRAG = `#version 300 es
precision highp float;
in vec2 vQ;
out vec4 frag;
uniform sampler2D uO, uWash, uPap, uDots, uInk, uWmap, uState, uNz;
uniform vec2 uStage;
uniform vec4 uView;          // the finished sheet's rect in the stage (css px, camera applied)
uniform vec3 uPage;
uniform float uG, uDpr;
uniform vec2 uSrc;           // source scan size (px): the dots live there
uniform vec2 uGrid;          // dot grid size (cells of 3 source px)
uniform vec4 uPlate;         // plate inset in its paper frame: l, t, r, b (fractions)
uniform float uPlateX;       // plate frame's left edge (world x)
uniform float uPaperX;       // the paper frame's left edge during the pull (world x)
uniform vec4 uPull;          // lower (0 high..1 down), roller y (world), fold F, pressed amount
uniform float uPullOn;       // 1 while the paper is on / over the plate
uniform float uPlateOn;      // 1 while the plate is in the scene
uniform float uSheetOn;      // 1 once the sheet lies face up
uniform float uSheetZ;       // the turned sheet's height above the bed (shadow), 0 when down
uniform vec2 uInkS[6];       // per poupée group: dab progress, wipe progress
uniform vec3 uInkC[6];       // per group: surface ink colour (linear)
uniform float uInked;        // how much of the plate's ink is still in the dots (1, or less after the pull)
uniform float uFinish;       // 1 when the watercolour stage is live

vec3 lin(vec3 c){ return pow(max(c, vec3(0.)), vec3(uG)); }
float lum(vec3 d){ return dot(d, vec3(.2126, .7152, .0722)); }
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }

// the print's density at an image point: what the dots carry (0 outside the drawing)
vec3 printD(vec2 m, float bias){
  vec3 o = lin(texture(uO, m, bias).rgb);
  vec3 tw = lin(texture(uWash, m, bias).rgb);
  vec3 pp = lin(texture(uPap, m, bias).rgb);
  return max(-log(max(o, vec3(1e-4)) / max(pp * tw, vec3(1e-4))), vec3(0.));
}

// ── the copper plate at image point m (the true image's uv; the plate shows it mirrored) ──
// sp: screen position (0..1) for the fixed studio light; fw: source px per device px
vec3 copper(vec2 m, vec2 sp, float fw, vec2 wpos){
  vec2 cq = wpos * uView.zw;                    // css px on the plate (at this zoom)
  vec4 nzA = texture(uNz, cq / 700. + .21);
  vec4 nzB = texture(uNz, sp * vec2(.9, .7) + .53);
  // polished copper reflecting a studio window: two crisp-edged panes of light with a dark
  // glazing bar between, a dim room elsewhere. The reflection is fixed to the screen, so it
  // slides over the metal as the plate moves; the plate is not perfectly flat, so its edges waver.
  float wav = (texture(uNz, cq / 4200. + .4).a - .5) * .06;            // the plate is not quite flat
  float g = sp.x * .6 - sp.y * .8 + wav;
  float es = .005;
  float win = smoothstep(-.13 - es, -.13 + es, g) * (1. - smoothstep(-.005 - es, -.005 + es, g));
  float bar = smoothstep(.17 - es, .17 + es, g) * (1. - smoothstep(.31 - es, .31 + es, g));
  float box = win * (.9 + .1 * smoothstep(-.13, -.005, g));
  float room = .4 + .1 * smoothstep(-.8, .6, g) - .08 * smoothstep(.4, 1.1, g);
  float e = mix(room, .13, bar) + .7 * box + (nzB.a - .5) * .04;
  vec3 alb = vec3(.84, .35, .14);
  vec3 cu = alb * e + vec3(.012, .005, .002) + vec3(.16, .12, .09) * box * box;   // the window's core goes paler
  // tarnish: the plate's margins dulled and browned by handling
  float edgeD = min(min(wpos.x, 1. - wpos.x), min(wpos.y, 1. - wpos.y));
  float tarn = (1. - smoothstep(.0, .07, edgeD + (texture(uNz, cq / 380. + .9).g - .5) * .05)) * .8;
  cu = mix(cu, cu * vec3(.66, .6, .55) + vec3(.008, .006, .004), tarn);
  // polishing: fine scratches running one way, catching the window
  vec2 sr = vec2(dot(wpos, vec2(.94, .34)), dot(wpos, vec2(-.34, .94)));
  float scr = texture(uNz, vec2(sr.x * uView.z / 12000., sr.y * uView.w / 260.) + .7).r;
  float scr2 = texture(uNz, vec2(sr.x * uView.z / 7000. + .3, sr.y * uView.w / 200.) + .2).r;
  float sc2 = smoothstep(.66, .86, scr) * .5 + smoothstep(.74, .92, scr2) * .4;
  cu *= 1. + sc2 * (.05 + .2 * box) - .03 * smoothstep(.6, .2, scr);
  vec4 im = texture(uInk, m);
  float gid = floor(im.r * 255. + .5);
  vec3 Dp = gid > .5 ? printD(m, 0.) : vec3(0.);
  float L = lum(Dp);
  // the ink this pixel's dots hold, and whether the dolly has been here
  float dab = 0., wiped = 1., ring = 0., rag = .5, streak = .5, wipeAge = 0.;
  vec3 film = vec3(0.);
  vec2 s0 = vec2(0.);
  if (gid > .5) {
    int gi = int(gid) - 1;
    s0 = uInkS[gi];
    float arr = im.g * 255. / 254.;
    rag = texture(uNz, cq / 160. + .13).g;
    float fib = texture(uNz, cq / 60. + .41).r;
    // the dab's edge is ragged where the cloth's folds touch first
    float aE = arr + (rag - .5) * .012 + (fib - .5) * .006;
    dab = arr <= 1. && s0.x > 0. ? smoothstep(aE - .004, aE + .0008, s0.x) : 0.;
    // the tarlatan works in broad curved strokes: arcs about a point off the plate
    vec2 ac = (wpos - vec2(.35, -.7)) * uView.zw;
    float rad = length(ac), ang = atan(ac.y, ac.x);
    streak = texture(uNz, vec2(ang * .06 + .11, rad / 1100.)).r * .65 + texture(uNz, vec2(ang * .2, rad / 600.)).b * .35;
    float wp = min(max(im.b + (rag - .5) * .04, arr + .035), .97);
    // as the cloth passes the film clears stroke by stroke: the strokes it bears on hardest first
    float wt = smoothstep(wp - .11, wp + .015, s0.y);
    wiped = 1. - smoothstep(wt - .1, wt + .1, streak * .9 + .05);
    wipeAge = s0.y - wp;
    ring = im.a * 255. / 254.;
    film = uInkC[gi];
  }
  // ink in the pits: the print's own colour, as a dense ink
  vec3 n = Dp / max((Dp.r + Dp.g + Dp.b) / 3., .02);
  vec3 inkC = exp(-max(1.7 * (1. + 2. * (n - 1.)), vec3(.12)));
  float filled = dab * uInked;
  // ── the raster: the engraved image as a tone (dots smaller than a pixel). A pit scatters
  // the light: dark against the bright reflection, a little lighter than the dark one.
  float T = 1. - exp(-1.9 * L);
  vec3 pitC = alb * mix(.3, .045, smoothstep(.14, .45, e)) + vec3(.008, .004, .003);
  vec3 inkLit = inkC * (.42 + .3 * e);
  vec3 rasterC = mix(cu, mix(pitC, inkLit, filled), T * .92);
  // ── the dots themselves (close up): round pits found in the scan, lit from the upper left
  float an = 1. - smoothstep(.75, 1.5, fw);
  vec3 col = rasterC;
  if (an > 0. && gid > .5) {
    vec2 s = m * uSrc;                         // source px (true image)
    vec2 cell = floor(s / 3.);
    float cov = 0., lit = 0., rim = 0.;
    float r0 = clamp(.3 + 2.0 * L, .4, 3.4);
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 c = cell + vec2(float(i), float(j));
      float v = floor(texture(uDots, (c + .5) / uGrid).r * 255. + .5);
      if (v < .5) continue;
      float q = v - 1.;
      float qy = floor(q / 15.), qx = q - qy * 15.;
      vec2 ctr = (c + vec2((qx + .5) / 15., (qy + .5) / 16.)) * 3.;
      float hr = h21(c);
      float r = r0 * (.82 + .36 * hr);
      vec2 dv = s - ctr;
      // a graver's dot is not quite round
      float ang = atan(dv.y, dv.x);
      float d = length(dv) * (1. + .09 * sin(3. * ang + hr * 6.28) + .05 * sin(2. * ang + hr * 17.));
      float a = clamp((r - d) / fw + .5, 0., 1.);
      if (a > cov) {
        cov = a;
        vec2 nn = -dv / max(r, .3) * .85;
        float nz = sqrt(max(1. - dot(nn, nn), 0.));
        lit = max(dot(vec3(nn, nz), normalize(vec3(-.55, -.62, .56))), 0.);
      }
      // the lit lip of the pit, just outside it on the far side from the light
      float lip = clamp(1. - abs(d - r - .35) / max(fw, .35), 0., 1.) * clamp(dot(normalize(dv + 1e-4), vec2(.62, .7)), 0., 1.);
      rim = max(rim, lip);
    }
    // inside a pit: its walls catch the key light whatever the reflection does
    vec3 pit = alb * (.05 + .62 * lit * lit) + vec3(.01, .005, .003);
    vec3 inkD = inkLit * (.85 + .25 * lit) + .05 * box * lit;
    vec3 dotC = mix(pit, inkD, filled);
    vec3 anC = mix(cu + alb * .22 * rim * (1. - filled), dotC, cov);
    col = mix(rasterC, anC, an);
  }
  // ── the ink lying on the surface (dabbed on, not yet wiped): stiff, tacky, glossy
  float onS = dab * (1. - wiped);
  if (onS > 0.) {
    // which way is out of this dab (from its distance field), for the relief at its edge
    vec2 tx = 1. / vec2(textureSize(uInk, 0));
    float rX = texture(uInk, m + vec2(tx.x, 0.)).a - texture(uInk, m - vec2(tx.x, 0.)).a;
    float rY = texture(uInk, m + vec2(0., tx.y)).a - texture(uInk, m - vec2(0., tx.y)).a;
    vec2 outw = vec2(-rX, rY);                   // image is mirrored on the plate: x flips
    outw = length(outw) > 1e-4 ? normalize(outw) : vec2(0.);
    float lump = texture(uNz, cq / 300. + .31).g;
    float fine = texture(uNz, cq / 26. + .6).r;
    // the rag's weave pressed into the ink, where the cloth bore down
    vec2 wc = mat2(.87, .5, -.5, .87) * cq / 3.4 + (texture(uNz, cq / 200.).rg - .5) * 3.;
    float wx = sin(wc.x * 6.283), wy = sin(wc.y * 6.283);
    float weave = .5 + .25 * wx * sign(sin(wc.y * 3.1416)) + .25 * wy * sign(sin(wc.x * 3.1416));
    float press = smoothstep(.35, .75, texture(uNz, cq / 160. + .27).g);
    // thicker in the middle of each dab, a raised lip where it lifted
    float lip = smoothstep(.8, .95, ring) * (1. - smoothstep(.96, 1.01, ring)) * smoothstep(.3, .7, texture(uNz, cq / 120. + .5).g);
    float th = .7 + .2 * (1. - ring * ring) + .34 * (lump - .5) + .1 * lip + .12 * press * (weave - .5);
    vec3 fc = film * (1.3 - .45 * th);
    // the lip catches the light on the side that faces it, and shades the other
    float faceL = dot(outw, normalize(vec2(-.6, -.8)));
    float relief = lip * faceL;
    fc *= 1. - .12 * lip * max(-faceL, 0.);
    // a glossy, tacky surface: the window breaks up on lumps, the weave and the pulled peaks
    float hl = clamp(lump * .7 + fine * .25 + press * (weave - .5) * .5 - .5, 0., 1.);
    float gloss = box * (.035 + .5 * pow(hl, 2.)) + max(relief, 0.) * (.035 + .2 * box)
                + .05 * box * smoothstep(.8, .95, fine);
    fc += vec3(1., .95, .88) * gloss;
    float op = clamp(.85 + .4 * th, 0., 1.);
    // half wiped: the film thins in streaks along the strokes before it clears
    col = mix(col, fc, onS * op);
  }
  // the plate tone the tarlatan leaves: a faint film of colour on the copper, streaked along
  // the strokes, which the palm thins but never quite clears (it prints as a soft tint)
  if (gid > .5 && wiped > 0. && dab > 0.) {
    vec3 tint = film / max(max(film.r, film.g), max(film.b, .02));
    float tone = wiped * uInked * (.045 + .17 * exp(-max(wipeAge, 0.) * 10.)) * (.45 + 1.1 * streak);
    col = mix(col, col * tint * .9, clamp(tone, 0., .5));
  }
  return col;
}

// the bevelled edge of the plate and its shadow: d = signed distance inside (css px)
vec3 plateEdge(vec3 c, float dIn, vec2 nrm, float e){
  float bev = 1. - smoothstep(0., 4.5, dIn);
  float facing = dot(nrm, normalize(vec2(-.6, -.8)));      // light from the upper left
  return mix(c, c * (1. + .9 * facing) + .06 * facing, bev * .8);
}

// ── the watercolour stage: the print (O with the wash taken out), the washes laid back in
vec3 finished(vec2 uv, vec2 q, out float wetOut){
  wetOut = 0.;
  vec3 O = lin(texture(uO, uv).rgb);
  vec3 tw = lin(texture(uWash, uv).rgb);
  vec3 Dw = -log(max(tw, vec3(1e-4)));
  if (uFinish < .5) return O * exp(Dw);         // the bare print
  vec4 mp = texture(uWmap, uv);
  float id = floor(mp.r * 255. + .5);
  if (id < .5) return O;
  vec4 st = texture(uState, vec2((id + .5) / 256., .25));
  vec4 aux = texture(uState, vec2((id + .5) / 256., .75));
  float T = mp.g, dist = mp.b * 255. / 4.;
  float maxd = max(aux.r * 255. / 4., 1.);
  vec4 nz1 = texture(uNz, q / 512.);
  vec4 nz2 = texture(uNz, q / 1300. + .37);
  float tooth = nz1.b, fib = nz1.r, mott = nz2.g;
  // the wet look: the wash in suspension (smooth, a few px soft), darker, faintly glossy
  vec3 Dwf = -log(max(lin(texture(uWash, uv, 2.2).rgb), vec3(1e-4)));
  vec3 cap = aux.gba * 4.;                       // first glaze's share (petals), else all of it
  bool two = cap.r + cap.g + cap.b > .001;
  vec3 G1 = two ? min(Dw, cap) : Dw, G2 = Dw - G1;
  vec3 G1f = two ? min(Dwf, cap) : Dwf, G2f = max(Dwf - G1f, 0.);
  float dn = clamp(dist / min(maxd, 64.), 0., 1.);
  float Tn = clamp(T + (mott - .5) * .07 + (fib - .5) * .035, 0., 1.);
  float rim = exp(-dist / 2.4);
  vec3 D = vec3(0.);
  float wetAll = 0.;
  for (int k = 0; k < 2; k++) {
    float f = k == 0 ? st.r : st.b, g = k == 0 ? st.g : st.a;
    if (f <= 0.) continue;
    vec3 Gd = k == 0 ? G1 : G2, Gf = k == 0 ? G1f : G2f;
    float fr = f * 1.14 - .08;
    float cov = smoothstep(Tn - .022, Tn + .004, fr);
    if (cov <= 0.) continue;
    float dryAt = min(.84, .6 * dn + .22 * T + (mott - .5) * .12 + .04);
    float dp = smoothstep(dryAt, dryAt + .16, g * 1.05);
    float wet = cov * (1. - dp);
    float bell = 4. * dp * (1. - dp) * cov;
    vec3 w = mix(Gf, Gd, smoothstep(.05, .95, dp));
    float kk = 1. + .5 * wet + bell * (1.2 * rim - .2) + bell * (tooth - .5) * .55;
    float front = cov * (1. - cov) * 4.;
    kk += front * .4;
    D += w * max(kk, 0.) * cov;
    wetAll = max(wetAll, wet * smoothstep(.015, .09, max(max(Gd.r, Gd.g), Gd.b)));
  }
  vec3 col = O * exp(Dw - D);
  col *= 1. - .045 * wetAll;
  float sheen = smoothstep(.5, .9, texture(uNz, q / 2600. + vec2(.13, .71)).a) * (.6 + .4 * fib);
  col = mix(col, vec3(.98, .975, .965), wetAll * (.03 + .18 * sheen));
  wetOut = wetAll;
  return col;
}

// the back of the paper (the face is down on the plate): its own paper, a little grey with damp
vec3 paperBack(vec2 u, vec2 q){
  vec3 p = lin(texture(uPap, vec2(1. - u.x, u.y)).rgb);
  float fib = texture(uNz, q / 512.).r;
  return p * (.93 + .03 * fib);
}

void main(){
  vec2 px = vQ;
  vec2 W = (px - uView.xy) / uView.zw;          // world (sheet units)
  vec2 sp = px / uStage;
  float pxW = 1. / uView.z, pxH = 1. / uView.w;  // one css px in world units
  vec2 q = W * uView.zw;                          // css px on the sheet, for paper noise
  vec3 page = uPage;
  float fwSrc = uSrc.x / (uView.z * uDpr);       // source px per device px

  // ── the page, with the plate's and the sheet's shadows
  vec3 col = page;
  float shade = 0.;
  // plate frame
  vec4 P = vec4(uPlateX + uPlate.x, uPlate.y, uPlateX + 1. - uPlate.z, 1. - uPlate.w);
  if (uPlateOn > .5) {
    vec2 dO = vec2(max(max(P.x - W.x, W.x - P.z), 0.) * uView.z, max(max(P.y - (W.y - 3. * pxH), (W.y - 3. * pxH) - P.w), 0.) * uView.w);
    float d = length(dO);
    shade = max(shade, .2 * exp(-d / 9.) + .12 * exp(-d / 2.));
  }
  // the finished sheet's own tight shadow, once it lies face up
  if (uSheetOn > .5) {
    float lift = uSheetZ;
    vec2 off = vec2(0., (2.5 + 14. * lift)) ;
    vec2 Wc = W - vec2(off.x * pxW, off.y * pxH) - vec2(lift * 8. * pxW, 0.);
    vec2 dO = vec2(max(max(-Wc.x, Wc.x - 1.), 0.) * uView.z, max(max(-Wc.y, Wc.y - 1.), 0.) * uView.w);
    float d = length(dO);
    float bl = 7. + 30. * lift;
    shade = max(shade, (.13 - .05 * lift) * exp(-d / bl) + (.1 - .08 * lift) * exp(-d / 1.6));
  }
  if (uPullOn > .5 && uPull.z > 3.14159 * .055) {
    float x0 = uPaperX + uPull.z, x1 = uPaperX + 2. * uPull.z - 3.14159 * .055;
    vec2 Wc = W - vec2(8. * pxW, 16. * pxH);
    vec2 dO = vec2(max(max(x0 - Wc.x, Wc.x - x1), 0.) * uView.z, max(max(-Wc.y, Wc.y - 1.), 0.) * uView.w);
    float d = length(dO);
    shade = max(shade, .09 * exp(-d / 34.));
  }
  col = mix(page, vec3(.157, .118, .07), shade);

  // ── the plate
  if (uPlateOn > .5) {
    float dIn = min(min(W.x - P.x, P.z - W.x) * uView.z, min(W.y - P.y, P.w - W.y) * uView.w);
    if (dIn > -1.) {
      vec2 lp = vec2((W.x - uPlateX), W.y);       // plate frame coords 0..1
      vec2 m = vec2(1. - lp.x, lp.y);             // the image, mirrored on the copper
      vec3 c = copper(m, sp, fwSrc, lp);
      // bevel normal: which edge we are near
      vec2 nrm = vec2(0.);
      float dl = (W.x - P.x) * uView.z, dr = (P.z - W.x) * uView.z, dt = (W.y - P.y) * uView.w, db = (P.w - W.y) * uView.w;
      float mn = min(min(dl, dr), min(dt, db));
      nrm = mn == dl ? vec2(-1., 0.) : mn == dr ? vec2(1., 0.) : mn == dt ? vec2(0., -1.) : vec2(0., 1.);
      // the bevelled edge: a narrow slope that catches the light on the upper and left sides,
      // falls dark on the others, with a bright arris where it meets the face
      float bw = 3.5;
      float facing = dot(nrm, normalize(vec2(-.6, -.8)));
      vec3 alb = vec3(.84, .35, .14);
      vec3 bev = alb * (.22 + 1.05 * max(facing, 0.)) + vec3(.25, .2, .15) * pow(max(facing, 0.), 3.);
      c = mix(c, bev, 1. - smoothstep(bw - .6, bw + .4, dIn));
      float arris = exp(-pow((dIn - bw) / .7, 2.));
      c += vec3(.5, .38, .28) * arris * (.25 + .6 * max(facing, 0.));
      col = mix(col, c, clamp(dIn + .5, 0., 1.));
    }
  }

  // ── the paper over the plate: lowered, pressed, peeled back and turned over
  if (uPullOn > .5) {
    float F = uPull.z;                            // the fold, in paper-frame x
    float rc = .055;                              // radius of the curl (sheet widths)
    vec2 xr = vec2(W.x - uPaperX, W.y);           // paper-frame coords (paper on the plate)
    vec3 pc = vec3(-1.);
    float pa = 0.;
    if (F <= 0.) {
      // laid from one edge: the lower edge touches first, then the sheet is rolled down onto
      // the plate toward its upper edge; the part still in the air rises over a bend
      float p = uPull.x;
      float Lc = 1. - p;                          // the contact line (paper y)
      float th = 1.45 * pow(1. - p, .7);          // angle of the part still held up
      float R = .13;
      float lift = .5 * (1. - smoothstep(0., .2, p));   // still being brought in
      float alpha = smoothstep(0., .07, p);
      float y = xr.y, v = -1., zz = 0., slope = 0.;
      if (y >= Lc) { v = y; }
      else {
        float aa = Lc - y, arcH = R * sin(th);
        if (aa <= arcH) { float s1 = R * asin(clamp(aa / R, 0., 1.)); v = Lc - s1; zz = R * (1. - cos(s1 / R)); slope = s1 / R; }
        else { float s1 = R * th + (aa - arcH) / max(cos(th), .06); v = Lc - s1; zz = R * (1. - cos(th)) + (s1 - R * th) * sin(th); slope = th; }
      }
      // nearer the eye looks larger: scale about the sheet's middle
      float zt = zz + lift;
      float ux = .5 + (xr.x - .5) / (1. + .2 * zt);
      vec2 u = vec2(ux, v);
      // the shadow it casts on the plate, falling down and to the right of the raised part
      if (p < 1. && alpha > 0.) {
        float sy = (y - Lc) * uView.w;
        float spread = 1. + .2 * zt;
        float inX = smoothstep(-.02, .01, (xr.x - .5) / spread + .5) * smoothstep(-.02, .01, .5 - (xr.x - .5) / spread);
        col *= 1. - alpha * inX * (.22 * (1. - p) * smoothstep(40., -30., -sy) * step(y, Lc + .5));
      }
      if (u.x >= 0. && u.x <= 1. && u.y >= 0. && u.y <= 1.) {
        float dIn = min(min(u.x, 1. - u.x) * uView.z, min(u.y, 1. - u.y) * uView.w);
        pc = paperBack(u, q);
        // the raised part faces the light more (the light is above and to the upper left)
        float lit = .5 * sin(slope) + .77 * cos(slope);
        pc *= clamp(lit / .77, .7, 1.14);
        // the bend shades the flat part just beside the contact line
        if (y >= Lc && p < 1.) pc *= 1. - .1 * (1. - p) * exp(-(y - Lc) * uView.w / 30.);
        if (y < Lc) pc *= 1. - .1 * (1. - p) * exp(-(Lc - y) * uView.w / 14.);
        // pressed: the damp sheet takes the plate's edge (the plate mark) and the image shows through
        float pr = smoothstep(uPull.y + .012, uPull.y - .03, u.y) * step(1e-4, uPull.w);
        if (pr > 0.) {
          vec2 m = vec2(1. - u.x, u.y);
          vec3 Dp = printD(m, 1.);
          pc *= exp(-Dp * .1 * pr);
          float ex = min(abs(u.x - uPlate.x), abs(1. - uPlate.z - u.x)) * uView.z;
          float ey = min(abs(u.y - uPlate.y), abs(1. - uPlate.w - u.y)) * uView.w;
          bool inX = u.x > uPlate.x - .003 && u.x < 1. - uPlate.z + .003, inY = u.y > uPlate.y - .003 && u.y < 1. - uPlate.w + .003;
          float mk = 0.;
          if (inY) mk += exp(-ex * ex / 2.) * (u.x < .5 ? 1. : -1.);
          if (inX) mk += exp(-ey * ey / 2.) * (u.y < .5 ? 1. : -1.);
          pc *= 1. + .16 * mk * pr;
          // inside the plate the paper is pressed down a shade
          bool inP = u.x > uPlate.x && u.x < 1. - uPlate.z && u.y > uPlate.y && u.y < 1. - uPlate.w;
          pc *= 1. - (inP ? .035 : .0) * pr;
        }
        // the press passing: a band of compression travelling down, the paper squeezed darker
        // under it, a faint raised wave just ahead
        if (uPull.w > 0. && uPull.w < 1.) {
          float dyc = (u.y - uPull.y) * uView.w;
          pc *= 1. - .2 * exp(-dyc * dyc / 1400.) + .035 * exp(-pow((dyc + 52.) / 12., 2.)) - .05 * exp(-pow((dyc - 44.) / 10., 2.));
        }
        pa = clamp(dIn + .5, 0., 1.) * alpha;
      }
    } else {
      // the peel: the left edge lifted and rolled over a curl to the right
      float x = xr.x, y = xr.y;
      bool inY = y >= 0. && y <= 1.;
      float topU = 2. * F - 3.14159 * rc - x;    // paper coord under the turned-over flat part
      if (inY && x >= F + .5 * pxW && topU >= 0. && topU <= 1.) {
        // the turned part, face up: the print, the right way round
        vec2 tv = vec2(1. - topU, y);
        float dummy;
        pc = finished(tv, tv * uView.zw, dummy);
        float edge = min(min(topU, 1. - topU) * uView.z, min(y, 1. - y) * uView.w);
        pa = clamp(edge + .5, 0., 1.);
        // it is held above the bed: light falls on it a little more
        pc *= 1.02;
      } else if (inY && x < F + .5 * pxW && x >= F - rc) {
        float sn = clamp((F - x) / rc, 0., 1.);
        float ph2 = 3.14159 - asin(clamp(sn, 0., 1.));
        float ph1 = asin(clamp(sn, 0., 1.));
        float uu2 = F - rc * ph2, uu1 = F - rc * ph1;
        if (uu2 >= 0. && uu2 <= 1.) {
          vec2 tv = vec2(1. - uu2, y);
          float dummy;
          pc = finished(tv, tv * uView.zw, dummy);
          // the curl's face: lit from the upper left, turning away from the eye toward its edge
          float lightN = clamp(.42 * sin(ph2) - .9 * cos(ph2), 0., 1.);
          float tw = smoothstep(1., .55, sn);
          pc *= (.5 + .5 * lightN / .9) * (.82 + .18 * tw);
          pa = 1.;
        } else if (uu1 >= 0. && uu1 <= 1.) {
          pc = paperBack(vec2(uu1, y), q) * (.5 + .45 * cos(ph1));                 // the back, rising
          pa = 1.;
        }
      }
      if (pa == 0. && inY && x >= F && x <= 1.) {
        pc = paperBack(vec2(x, y), q);
        vec3 Dp = printD(vec2(1. - x, y), 1.);
        pc *= exp(-Dp * .09) * .97;
        // the turned part's shadow on the sheet still lying down
        float se = (x - (2. * F - 3.14159 * rc)) * uView.z;
        pc *= 1. - .22 * exp(-max(se, 0.) / 10.) * step(0., 2. * F - 3.14159 * rc - F + .0001);
        pa = clamp(min(min(x - F, 1. - x) * uView.z, min(y, 1. - y) * uView.w) + .5, 0., 1.);
      }
      // shadow of the curl on the plate it has left
      if (pa == 0.) {
        float sd = (F - rc - x) * uView.z;
        if (inY && sd > 0.) col *= 1. - .25 * exp(-sd / 16.);
      }
    }
    if (pa > 0.) col = mix(col, pc, pa);
  }

  // ── the sheet, face up, where it stays: the print, then the watercolour
  if (uSheetOn > .5) {
    float lift = uSheetZ;
    vec2 Wl = W;
    float inS = min(min(Wl.x, 1. - Wl.x) * uView.z, min(Wl.y, 1. - Wl.y) * uView.w);
    if (inS > -1.) {
      vec2 uv = clamp(Wl, 0., 1.);
      float wet;
      vec3 c = finished(uv, uv * uView.zw, wet);
      col = mix(col, c, clamp(inS + .5, 0., 1.));
    }
  }
  frag = vec4(pow(max(col, vec3(0.)), vec3(1. / uG)), 1.);
}`;

function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    return sh;
}

/* ── the timeline (fractions of the runway) ─────────────────────────────────── */
const ST = {
    macro: [0, .03, .115],                       // hold close, then pull back to the whole plate
    ink: [.11, .37],
    lower: [.375, .426], press: [.426, .462], peel: [.466, .535], away: [.528, .565],
    finish: [.565, .95],
};
// the poupée groups' windows (dab, wipe) inside the inking stage
const INKWIN = {
    flower: [[.115, .178], [.152, .205]],
    hip: [[.188, .206], [.2, .218]],
    leaves: [[.212, .298], [.245, .318]],
    stamens: [[.305, .326], [.318, .338]],
    lettering: [[.334, .356], [.348, .37]],
};

export function stippleRose(root, opts = {}) {
    const ds = root.dataset;
    const o = {
        src: opts.src ?? ds.src,
        mode: opts.mode ?? ds.mode ?? 'scroll',
        runway: +(opts.runway ?? ds.runway ?? 380),
        webgl: (opts.webgl ?? ds.webgl ?? 'on') !== 'off' && opts.webgl !== false,
    };
    if (!o.src) return () => {};
    const base = o.src.replace(/\.json$/, '');
    const stage = root.querySelector('.sr-stage') || root;
    let dead = false, cleanup = [];
    const on = (t, ev, fn, opt) => { t.addEventListener(ev, fn, opt); cleanup.push(() => t.removeEventListener(ev, fn, opt)); };
    root.classList.add('sr');
    const still = () => calm.matches || o.mode === 'static' || !o.webgl;
    if (still()) root.classList.add('sr-still');

    const canvas = document.createElement('canvas');
    canvas.className = 'sr-canvas';
    canvas.setAttribute('aria-hidden', 'true');

    let meta, ims = {}, gl = null, prog = null, U = {}, tex = {};
    let dpr = 1, texW = 0, NW = 0, sched = null, cam = null;
    let target = 0, shown = 0, vel = 0, visible = false, raf = 0, last = 0, lastShown = -1;
    const state = new Uint8Array(256 * 2 * 4);
    const fired = new Set();

    /* ── the colourist's washes in the finishing window, in order, at most two or three wet ── */
    function buildSchedule() {
        const Wd = meta.washes;
        const [a0, a1] = ST.finish;
        const items = [];
        Wd.forEach((w, i) => items.push({ i, k: 0, kind: w.kind, area: w.area }));
        // the deep glaze of the petals, last and slowest
        Wd.forEach((w, i) => { if (w.glaze) items.push({ i, k: 1, kind: 'flush', area: w.area }); });
        let t = 0, prev = null;
        const s = [], d = [], D = [];
        items.forEach((it, j) => {
            let dur = clamp(3 + 15 * Math.sqrt(it.area / 30000), 3, 20);
            if (it.kind === 'petals') dur *= 1.2;
            if (it.kind === 'flush') dur *= 1.55;
            if (j > 0) {
                const same = prev.kind === it.kind;
                t += same ? prev.dur * (it.kind === 'leaves' ? .42 : .6) : prev.dur * .62 + 2;
                if (it.kind === 'touches' || prev.kind === 'touches') t -= 1;
            }
            s.push(t); d.push(dur); D.push(dur * .9 + 4);
            it.dur = dur; prev = it;
        });
        const end = Math.max(...s.map((v, j) => v + .55 * d[j] + D[j]));
        const k = (a1 - a0) / end;
        sched = { items, s: s.map((v) => a0 + v * k), d: d.map((v) => v * k), D: D.map((v) => v * k) };
        sched.dry = Math.max(...sched.s.map((v, j) => v + .55 * sched.d[j] + sched.D[j]));
    }
    function washState(S) {
        state.fill(0);
        for (let j = 0; j < sched.items.length; j++) {
            const it = sched.items[j], a = sched.s[j], dd = sched.d[j];
            const f = clamp((S - a) / dd), g = clamp((S - a - .55 * dd) / sched.D[j]);
            const p = (it.i + 1) * 4;
            state[p + it.k * 2] = Math.round(f * 255);
            state[p + it.k * 2 + 1] = Math.round(g * 255);
        }
        meta.washes.forEach((w, i) => {
            const p = (256 + i + 1) * 4;
            state[p] = Math.min(255, Math.round(Math.min(64, w.maxd) * 4));
            const g = w.glaze || [0, 0, 0];
            state[p + 1] = Math.round(clamp(g[0] / 4) * 255); state[p + 2] = Math.round(clamp(g[1] / 4) * 255); state[p + 3] = Math.round(clamp(g[2] / 4) * 255);
        });
    }

    /* ── geometry of the scene ─────────────────────────────────────────────── */
    const RC = .055;
    const P0 = -(1 + Math.PI * RC);              // the paper (and plate) frame before the turn
    const plateIn = [.025, .025, .025, .02];
    function scene(S) {
        const lower = clamp((S - ST.lower[0]) / (ST.lower[1] - ST.lower[0]));
        const pressT = clamp((S - ST.press[0]) / (ST.press[1] - ST.press[0]));
        const peelT = clamp((S - ST.peel[0]) / (ST.peel[1] - ST.peel[0]));
        const away = smooth(ST.away[0], ST.away[1], S);
        const ease = (t) => t * t * (3 - 2 * t);
        const F = peelT <= 0 ? 0 : 1e-4 + ease(peelT) * (1 + Math.PI * RC);
        return {
            lower, F,
            rollerY: lerp(-.06, 1.06, pressT),
            pressed: S >= ST.press[0] ? (S >= ST.press[1] ? 1 : Math.max(1e-3, ease(pressT))) : 0,
            pullOn: S >= ST.lower[0] - .002 && peelT < 1,
            sheetOn: peelT >= 1,
            sheetZ: peelT >= 1 ? 1 - smooth(ST.peel[1], ST.away[1], S) : 0,
            plateX: P0 - away * 1.35,
            plateOn: away < 1,
            inked: 1 - .62 * smooth(ST.press[0], ST.press[1], S),
            finish: S >= ST.finish[0] - .001,
        };
    }

    /* ── the camera: centre (sheet units) and zoom, a pure function of scroll ── */
    let fit = { x: 0, y: 0, w: 0, h: 0 }, stg = { w: 0, h: 0 }, zTrack = 1, zMacro = 6;
    function inkProgress(S, g) {
        const w = INKWIN[g.kind] || INKWIN.leaves;
        return [clamp((S - w[0][0]) / (w[0][1] - w[0][0])), clamp((S - w[1][0]) / (w[1][1] - w[1][0]))];
    }
    function trackAt(tr, f) {
        const j = clamp(f) * (tr.length - 1), j0 = Math.floor(j), j1 = Math.min(tr.length - 1, j0 + 1), t = j - j0;
        return [lerp(tr[j0][0], tr[j1][0], t), lerp(tr[j0][1], tr[j1][1], t), lerp(tr[j0][2], tr[j1][2], t)];
    }
    function buildCamera() {
        const n = 1000, X = new Float32Array(n + 1), Y = new Float32Array(n + 1), Z = new Float32Array(n + 1);
        const plateC = [P0 + .5, .5];
        const mt = meta.macro || [.4, .27];          // the close-up: a petal near the stamens (true image uv)
        const macroW = [P0 + (1 - mt[0]), mt[1]];   // on the copper it is mirrored
        let lx = plateC[0], ly = plateC[1];
        for (let j = 0; j <= n; j++) {
            const S = j / n;
            let x = plateC[0], y = plateC[1], z = 1;
            if (S < ST.ink[0] + .01) {
                // pull back from the glass: zoom in log space, the point under the glass held still
                const t = smooth(ST.macro[1], ST.macro[2], S);
                z = Math.exp(Math.log(zMacro) * (1 - t));
                const kk = zMacro > 1 ? (1 / z - 1 / zMacro) / (1 - 1 / zMacro) : 1;
                x = lerp(macroW[0], plateC[0], kk); y = lerp(macroW[1], plateC[1], kk);
            } else if (S < ST.lower[0]) {
                // follow the dolly where the work is (phones zoom in)
                let sw = 0, sx = 0, sy = 0;
                for (const g of meta.ink) {
                    const [fd, fw] = inkProgress(S, g);
                    if (fd <= 0 || fw >= 1) continue;
                    const pd = trackAt(g.track, fd);
                    const wgt = (fd < 1 ? 1.4 : .6) * Math.sqrt(g.area);
                    sw += wgt; sx += wgt * (P0 + 1 - pd[0]); sy += wgt * pd[1];
                }
                if (sw > 0) { lx = sx / sw; ly = sy / sw; }
                const zin = smooth(ST.ink[0] + .01, ST.ink[0] + .04, S) * (1 - smooth(ST.ink[1] - .01, ST.lower[0], S));
                z = 1 + (zTrack - 1) * zin;
                const zf = zTrack > 1 ? zin : 0;
                x = lerp(plateC[0], lx, zf); y = lerp(plateC[1], ly, zf);
            } else if (S < ST.finish[0]) {
                // the pull: from the plate to the turned sheet, following the fold
                const sc = scene(S);
                // keep both the plate and the turned sheet in view, then settle on the sheet
                const xs = P0 + Math.max(.5, sc.F - Math.PI * RC * .5);
                x = lerp(xs, .5, smooth(ST.peel[1] - .01, ST.away[1], S)); y = .5;
                lx = .5; ly = .5;
            } else {
                let sw = 0, sx = 0, sy = 0;
                for (let k = 0; k < sched.items.length; k++) {
                    const it = sched.items[k];
                    const f = (S - sched.s[k]) / sched.d[k], g = (S - sched.s[k] - .55 * sched.d[k]) / sched.D[k];
                    if (f <= 0 || g >= 1) continue;
                    const w = meta.washes[it.i];
                    const p = trackAt(w.track, clamp(f));
                    const wgt = Math.sqrt(w.area) * (f < 1 ? 1.6 : 1 - g);
                    sw += wgt; sx += wgt * p[0]; sy += wgt * p[1];
                }
                if (sw > 0) { lx = sx / sw; ly = sy / sw; }
                const zin = smooth(ST.finish[0], ST.finish[0] + .03, S) * (1 - smooth(sched.dry, sched.dry + .03, S));
                z = 1 + (zTrack - 1) * zin;
                const zf = zTrack > 1 ? zin : 0;
                x = lerp(.5, lx, zf); y = lerp(.5, ly, zf);
            }
            X[j] = x; Y[j] = y; Z[j] = Math.log(z);
        }
        // smooth along the scroll so it drifts and never jumps (not the close-up's pull-back)
        const sm = (a, r, sg, from) => {
            const o2 = Float32Array.from(a);
            for (let j = from; j < a.length; j++) {
                let s2 = 0, w2 = 0;
                for (let k = -r; k <= r; k++) {
                    const jj = clamp(j + k, from, a.length - 1), w = Math.exp(-(k * k) / (2 * sg * sg));
                    s2 += a[jj] * w; w2 += w;
                }
                o2[j] = s2 / w2;
            }
            return o2;
        };
        const from = Math.round(ST.ink[0] * n);
        cam = { n, X: sm(X, 30, 11, from), Y: sm(Y, 30, 11, from), Z: sm(Z, 30, 11, from) };
    }
    function camAt(S) {
        const j = clamp(S) * cam.n, j0 = Math.floor(j), j1 = Math.min(cam.n, j0 + 1), t = j - j0;
        return { x: lerp(cam.X[j0], cam.X[j1], t), y: lerp(cam.Y[j0], cam.Y[j1], t), z: Math.exp(lerp(cam.Z[j0], cam.Z[j1], t)) };
    }
    function viewAt(S) {
        const c = camAt(S);
        const w = fit.w * c.z, h = fit.h * c.z;
        let cx = c.x, cy = c.y;
        // zoomed in on the plate or the sheet: keep its edges from coming inside the view
        if (c.z > 1.02 && (S >= ST.ink[0] + .01)) {
            const ox = S < ST.lower[0] ? P0 : 0;
            const hw = stg.w / (2 * w), hh = stg.h / (2 * h), m = 6 / w, mh = 6 / h;
            if (hw < .5) cx = clamp(cx, ox + hw - m, ox + 1 - hw + m); else cx = ox + .5;
            if (hh < .5) cy = clamp(cy, hh - mh, 1 - hh + mh); else cy = .5;
        }
        return [stg.w / 2 - cx * w, stg.h / 2 - cy * h, w, h];
    }

    function layout() {
        const r = stage.getBoundingClientRect();
        const cs = getComputedStyle(stage);
        const pl = parseFloat(cs.paddingLeft), pr = parseFloat(cs.paddingRight), pt = parseFloat(cs.paddingTop), pb = parseFloat(cs.paddingBottom);
        stg = { w: Math.max(120, Math.round(r.width)), h: Math.max(120, Math.round(innerHeight)) };
        const availW = Math.max(100, stg.w - pl - pr), availH = Math.max(100, stg.h - pt - pb);
        const scale = Math.min(availW / meta.w, availH / meta.h);
        fit = { w: meta.w * scale, h: meta.h * scale };
        fit.x = pl + (availW - fit.w) / 2; fit.y = pt + (availH - fit.h) / 2;
        dpr = Math.min(2, devicePixelRatio || 1);
        // narrow screens zoom in to follow the work, until the sheet nearly fills the height
        zTrack = clamp((stg.h * .9) / fit.h, 1, 1.7);
        if (zTrack < 1.12) zTrack = 1;
        // the close-up: the dots at about 3-4 device px across
        zMacro = clamp((meta.src[0] / (fit.w * dpr)) / .42, 3, 16);
        canvas.style.width = stg.w + 'px'; canvas.style.height = stg.h + 'px';
        canvas.width = Math.round(stg.w * dpr); canvas.height = Math.round(stg.h * dpr);
        gl.viewport(0, 0, canvas.width, canvas.height);
        buildCamera();
        const want = Math.min(meta.w, Math.round(fit.w * zTrack * dpr * 1.25));
        if (Math.abs(want - texW) > 2) pack(want, Math.round(want * meta.h / meta.w));
    }

    function setTex(img, mip, nearest) {
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        if (mip) gl.generateMipmap(gl.TEXTURE_2D);
        const mn = nearest ? gl.NEAREST : (mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mn);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, nearest ? gl.NEAREST : gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    // The plate's picture is resampled to about the size it is shown at (good downsampling, so
    // the stipple never aliases) and mipmapped; the maps go up once, exact, sampled nearest.
    function pack(w, h) {
        texW = w;
        for (const [k, near, mip] of [['dots', true, false], ['ink', true, false], ['wmap', true, false], ['wash', false, true], ['pap', false, true]]) {
            if (tex[k]) continue;
            tex[k] = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex[k]); setTex(ims[k], mip, near);
        }
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        const cx = cv.getContext('2d');
        cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
        cx.drawImage(ims.orig, 0, 0, w, h);
        if (!tex.orig) tex.orig = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex.orig);
        setTex(w === ims.orig.width ? ims.orig : cv, true, false);
        cv.width = cv.height = 0;
    }

    function initGL() {
        const ca = { alpha: false, antialias: false, preserveDrawingBuffer: false };
        const g = canvas.getContext('webgl2', ca);
        if (!g) return false;
        gl = g;
        try {
            prog = gl.createProgram();
            gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
            gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
            gl.linkProgram(prog);
            if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
        } catch (err) { console.warn('stipple-rose: shader failed', err); gl = null; return false; }
        gl.useProgram(prog);
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        tex.buf = buf;
        const loc = gl.getAttribLocation(prog, 'aP');
        gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        for (const n of ['uO', 'uWash', 'uPap', 'uDots', 'uInk', 'uWmap', 'uState', 'uNz', 'uStage', 'uView', 'uPage', 'uG', 'uDpr', 'uSrc', 'uGrid',
            'uPlate', 'uPlateX', 'uPaperX', 'uPull', 'uPullOn', 'uPlateOn', 'uSheetOn', 'uSheetZ', 'uInkS', 'uInkC', 'uInked', 'uFinish']) U[n] = gl.getUniformLocation(prog, n);
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
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 2, 0, gl.RGBA, gl.UNSIGNED_BYTE, state);
        for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        ['uO', 'uWash', 'uPap', 'uDots', 'uInk', 'uWmap', 'uState', 'uNz'].forEach((n, i) => gl.uniform1i(U[n], i));
        gl.uniform1f(U.uG, meta.gamma);
        gl.uniform2f(U.uSrc, meta.src[0], meta.src[1]);
        gl.uniform2f(U.uGrid, meta.grid[0], meta.grid[1]);
        gl.uniform4f(U.uPlate, ...plateIn);
        // the surface inks: each group's colour as a dense, stiff printing ink (linear)
        const cols = new Float32Array(18);
        const PAL = { rose: [.25, .022, .032], green: [.034, .072, .036], yellow: [.62, .38, .03], black: [.016, .014, .013] };
        meta.ink.forEach((g, i) => { if (i < 6) cols.set(PAL[g.ink] || PAL.black, i * 3); });
        gl.uniform3fv(U.uInkC, cols);
        return true;
    }

    let pageRGB = null;
    function pageColour() {
        if (pageRGB) return pageRGB;
        const m = getComputedStyle(root).backgroundColor.match(/[\d.]+/g) || [243, 240, 232];
        pageRGB = m.slice(0, 3).map((v) => Math.pow(+v / 255, meta.gamma));
        return pageRGB;
    }

    function draw() {
        const S = shown;
        const sc = scene(S);
        washState(S);
        const order = ['orig', 'wash', 'pap', 'dots', 'ink', 'wmap', 'state', 'nz'];
        order.forEach((k, i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, tex[k]); });
        gl.activeTexture(gl.TEXTURE6);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 2, gl.RGBA, gl.UNSIGNED_BYTE, state);
        const view = viewAt(S);
        gl.uniform2f(U.uStage, stg.w, stg.h);
        gl.uniform4f(U.uView, ...view);
        gl.uniform3fv(U.uPage, pageColour());
        gl.uniform1f(U.uDpr, dpr);
        gl.uniform1f(U.uPlateX, sc.plateX);
        gl.uniform1f(U.uPaperX, P0);
        gl.uniform4f(U.uPull, sc.lower, sc.rollerY, sc.F, sc.pressed);
        gl.uniform1f(U.uPullOn, sc.pullOn ? 1 : 0);
        gl.uniform1f(U.uPlateOn, sc.plateOn ? 1 : 0);
        gl.uniform1f(U.uSheetOn, sc.sheetOn ? 1 : 0);
        gl.uniform1f(U.uSheetZ, sc.sheetZ);
        gl.uniform1f(U.uInked, sc.inked);
        gl.uniform1f(U.uFinish, sc.finish ? 1 : 0);
        const is = new Float32Array(12);
        meta.ink.forEach((g, i) => { if (i < 6) is.set(inkProgress(S, g), i * 2); });
        gl.uniform2fv(U.uInkS, is);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        events(S, sc);
        lastShown = S;
    }
    function events(S, sc) {
        const fwd = S > lastShown;
        const marks = [['ink', ST.ink[0]], ['pull', ST.lower[0]], ['press', ST.press[0]], ['peel', ST.peel[0]], ['finish', ST.finish[0]]];
        for (const [k, at] of marks) {
            if (fwd && !fired.has(k) && S >= at) { fired.add(k); root.dispatchEvent(new CustomEvent('stipple-rose:stage', { bubbles: true, detail: { stage: k } })); }
            if (S < at) fired.delete(k);
        }
        meta.ink.forEach((g) => {
            const key = 'dab' + g.id, at = (INKWIN[g.kind] || INKWIN.leaves)[0][0];
            if (fwd && !fired.has(key) && S >= at) { fired.add(key); root.dispatchEvent(new CustomEvent('stipple-rose:dab', { bubbles: true, detail: { group: g.id, kind: g.kind } })); }
            if (S < at) fired.delete(key);
        });
        if (fwd && !fired.has('done') && S >= sched.dry) { fired.add('done'); root.dispatchEvent(new CustomEvent('stipple-rose:done', { bubbles: true })); }
        if (S < sched.dry) fired.delete('done');
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
        if (still()) return;                         // the finished plate, as an image
        try {
            meta = await (await fetch(o.src)).json();
            const [orig, wash, pap, dots, ink, wmap] = await Promise.all([
                loadImage(base + '.webp'), loadImage(base + '-wash.webp'), loadImage(base + '-paper.webp'),
                loadExact(base + '-dots.webp'), loadExact(base + '-ink.webp'), loadExact(base + '-wmap.webp')]);
            ims = { orig, wash, pap, dots, ink, wmap };
        } catch (err) { console.warn(err); return; }
        if (dead || still()) return;
        buildSchedule();
        root.classList.add('sr-scroll');
        root.style.setProperty('--sr-runway', o.runway + 'svh');
        stage.appendChild(canvas);
        if (!initGL()) { canvas.remove(); root.classList.remove('sr-scroll'); root.style.removeProperty('--sr-runway'); return; }
        layout();
        root.classList.add('is-live'); live = true;
        readScroll(); shown = target; lastShown = shown;
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
        if (calm.matches && live) { root.classList.add('sr-still'); root.classList.remove('sr-scroll', 'is-live'); root.style.removeProperty('--sr-runway'); }
        else if (!calm.matches && live) { root.classList.remove('sr-still'); root.classList.add('sr-scroll', 'is-live'); root.style.setProperty('--sr-runway', o.runway + 'svh'); pageRGB = null; layout(); readScroll(); shown = target; draw(); }
        else if (!calm.matches && !live && o.mode !== 'static' && o.webgl) { root.classList.remove('sr-still'); start(); }
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
        ['dots', 'ink', 'wmap'].forEach((k) => ims[k]?.close?.());
        canvas.remove();
        root.classList.remove('sr', 'is-live', 'sr-scroll', 'sr-still');
        root.style.removeProperty('--sr-runway');
    };
}

/* auto-start */
const started = new WeakMap();
function boot() {
    document.querySelectorAll('[data-stipple-rose]').forEach((el) => {
        if (!started.has(el)) started.set(el, stippleRose(el));
    });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
