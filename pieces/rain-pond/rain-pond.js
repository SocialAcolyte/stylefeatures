/*
 *  RAIN-POND // a painted bank of willows over still water, and rain arriving
 *  on it as you scroll.
 *
 *  Markup:  <section data-rain-pond>
 *             <div class="rpd-stage">
 *               <figure class="rpd-pic"><img src="assets/corot-pond-in-picardy.webp" alt=""></figure>
 *             </div>
 *           </section>
 *  Or call  rainPond(section, { seed, strength, density, focus, water, mono })  yourself.
 *  It returns destroy().
 *
 *  The <img> is a painting cut at its far waterline. Above the line the bank
 *  stays exactly as painted; below it this module makes the water, a mirror of
 *  that bank seen at a glancing angle:
 *
 *    surface    a height field (ripple-pool's: the wave equation, surface
 *               tension so short ripples run ahead, a little viscosity) laid
 *               out in perspective. Each row of cells is a strip of the pond
 *               further away than the one below it, so each row is wider and
 *               much deeper in the world than it looks; the sim's coefficients
 *               change row by row and a ring spreads as a flattened ellipse,
 *               slower and flatter toward the far bank.
 *    reflection the bank mirrored across the waterline, sampled where the
 *               reflected ray actually goes: a slope toward or away from you
 *               tips it up or down the bank (2 x slope x focal length, so a
 *               small ring moves the picture a long way), a sideways slope
 *               shifts it by less (x sin of the glancing angle). Fresnel: the
 *               far water is a bright mirror, the near water shows more of
 *               its own dark body.
 *    rain       intensity, drop sizes and the branches' drips are a
 *               deterministic function of scroll progress (seeded). Drops
 *               make a crater, big ones a crown and a Worthington jet that may
 *               pinch off a droplet that falls back and rings again. Recent
 *               rain roughens the whole surface below the sim's scale, so the
 *               reflection breaks into a grey, darker, shimmering blur.
 *    colour     the painting starts silvery, almost monochrome; its greens
 *               come back as the rain clears.
 *
 *  Events (bubbling, on the section):
 *    rain-pond:drop   { size (mm), x, y (0-1 on the water), kind: 'rain' | 'tap' | 'droplet' }
 *    rain-pond:drip   { size (mm), x, y }   a drop from the overhanging branches
 *    rain-pond:rain   { intensity (0-1) }   when the shower's strength changes
 *
 *  Nothing runs while the pond is still or off screen. Reduced motion: the
 *  scene just after the rain, in colour, with a few rings caught part way out.
 *  Without WebGL the painting stays as a picture.
 */

const calm = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// ── the physics, in one place ─────────────────────────────────────────
const CELL = 2;            // css px per sim cell across
const CELL_Y = 1.5;        // and down: rings are flat ellipses, so rows are finer
const RATIO = 2.4;         // the far bank is this many times further away than the bottom of the frame
const GLANCE = 1.6;        // focal length / depth below the horizon at the bottom edge: rings there are 1 / 1.6 as tall as wide
const SPEED = 1.5;         // wave stiffness: long waves run 0.61 cells a step across the near water. Stable while (SPEED + TENSION * 1.83) * 1.83 < 4
const TENSION = 0.22;      // surface tension: short ripples outrun long ones, so a drop sends a train of rings
const VISCOSITY = 0.02;    // short ripples die fastest...
const HYPER = 0.1;         // ...and the very shortest at once (a small drop's rings live ~0.5 s)
const HZ = 72;             // sim steps a second: near rings spread at ~90 css px/s
const STEP = 1 / HZ;
const DECAY = 0.5;         // s, amplitude e-folding on top of the spreading: rings are gone in 1.5-2.5 s
const SMALL = 1.7;         // mm: drops below this ring analytically (the grid is too coarse for them)
const RING_V = 26;         // world units a second a small ring spreads (~52 css px/s near you)
const MAX_RINGS = 220;     // small rings written at once (the rest of a downpour is roughness)
const RING_T = 0.26;       // s, e-folding of a small ring
const SLOPE = 0.4;         // world slope at the edge of the 8-bit encoding (square-root encoded)
const PEAK = 720;          // drops a second at the height of the shower (on a desktop-sized pond)

// drop radius (world units; one unit is a cell at the bottom edge) and strength by size in mm
// (rain 0.4-1.6 mm: craters of 3-5 px near you; fat drops and drips much bigger)
const dropR = (mm) => 2.6 + 0.6 * mm + 0.35 * mm * mm;
const dropA = (r) => 1.1 * Math.pow(r, 0.8);

// Drip points: branch tips that overhang the water, as fractions of the painting.
const DRIPS = [
    [0.095, 0.47], [0.2, 0.62], [0.305, 0.73], [0.395, 0.69], [0.47, 0.71],
    [0.548, 0.775], [0.655, 0.72], [0.79, 0.64], [0.9, 0.62],
];

// ── the weather, as a function of scroll progress p (0-1) ─────────────
// It moves from left to right, over the open lake first: calm; the light
// goes and a squall comes across the far bank; a gust; the first fat drops;
// the downpour; the rain eases from the left as the squall moves off; drips;
// the sun breaks through.
const bell = (a, b, c, d, p) => smooth(a, b, p) * (1 - smooth(c, d, p));
function weather(p) {
    const gust = bell(0.27, 0.31, 0.38, 0.43, p);
    return {
        dark: bell(0.05, 0.2, 0.66, 0.82, p),
        veil: bell(0.05, 0.12, 0.82, 0.9, p),
        veilF: lerp(-0.2, 1.5, smooth(0.06, 0.34, p)),        // leading edge, fraction of the width
        veilT: lerp(-0.5, 1.4, smooth(0.56, 0.84, p)),        // trailing edge
        haze: bell(0.36, 0.46, 0.6, 0.74, p),
        wind: clamp(0.22 * bell(0.14, 0.26, 0.7, 0.8, p) + gust + 0.38 * bell(0.4, 0.45, 0.6, 0.72, p)),
        gust,
        sheets: bell(0.4, 0.46, 0.6, 0.68, p),
        rainF: lerp(-0.25, 1.6, smooth(0.2, 0.46, p)),        // where it is raining on the pond
        rainT: lerp(-0.6, 1.25, smooth(0.6, 0.8, p)),
        sun: smooth(0.8, 0.93, p),
        sunB: lerp(-0.3, 1.45, smooth(0.8, 0.94, p)),
        sunBand: bell(0.8, 0.84, 0.93, 0.98, p),
        glitter: smooth(0.85, 0.95, p),
    };
}
// is anything in the weather moving (and so worth a frame)?
const moving = (w) => w.wind > 0.01 || w.veil > 0.01 || w.sheets > 0.01 || w.glitter > 0.01;

// drops a second (relative to PEAK), the share of fat drops, and the drips
function rateAt(p) {
    if (p < 0.22) return 0;
    if (p < 0.34) return lerp(0.8, 4, smooth(0.22, 0.34, p)) / PEAK;                  // the first fat drops
    if (p < 0.44) return Math.exp(lerp(Math.log(4), Math.log(PEAK), smooth(0.34, 0.44, p))) / PEAK;
    if (p < 0.6) return 1;                                                          // the downpour
    if (p < 0.72) return Math.exp(lerp(Math.log(PEAK), Math.log(4), smooth(0.6, 0.72, p))) / PEAK;
    if (p < 0.82) return lerp(4, 0, smooth(0.72, 0.82, p)) / PEAK;                   // the last drops
    return 0;
}
const fatAt = (p) => (p < 0.36 ? 0.8 : p < 0.6 ? lerp(0.8, 0.03, smooth(0.36, 0.42, p)) : lerp(0.03, 0.45, smooth(0.64, 0.76, p)));
// seconds between drips at one branch: none before the leaves are wet, quick
// while they run with water, slower and slower as they drain, then none
function dripPeriod(p) {
    if (p < 0.46 || p > 0.88) return 0;
    if (p < 0.66) return lerp(2.4, 1.6, smooth(0.46, 0.66, p));
    return lerp(1.6, 7, smooth(0.68, 0.88, p));
}
// colour: silvery until the storm has gone, then fuller than at the start
// colour all the way through: Corot's own (a little silvery), drained and
// cooled by the storm but never grey, then warmer and fuller with the sun
const satAt = (p, start) => lerp(start, 0.58, bell(0.05, 0.25, 0.7, 0.86, p)) + (1.18 - start) * smooth(0.8, 0.96, p);
const phaseAt = (p) => (p < 0.06 ? 0 : p < 0.27 ? 1 : p < 0.4 ? 2 : p < 0.62 ? 3 : p < 0.8 ? 4 : 5);
const PHASES = ['', 'A squall is coming across the far bank.', 'Wind on the water.', 'A downpour.', 'The rain eases; the squall moves off.', 'The sun breaks through.'];

function mulberry(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
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
uniform sampler2D uBank;     // the painted bank, 1 texel ~ 1 device px
uniform sampler2D uBlur;     // the same, softened: what a rough surface reflects
uniform sampler2D uWater;    // r g world slope across / toward the viewer, b splash. 128 = flat
uniform sampler2D uMask;     // the top and bottom fades into the paper
uniform sampler2D uNoise;    // a small tileable smooth random field
uniform vec2 uSize;          // the whole band, css px
uniform float uHb;           // bank height, css px (the waterline)
uniform float uHw;           // water height, css px
uniform vec2 uMap;           // bank texture spans x in [uMap.x, uMap.x + uMap.y] css px
uniform float uHf;           // the painting's full height above the waterline, css px
uniform vec4 uOff;           // two random offsets into the noise field...
uniform float uFade;         // ...cross-faded: rain dimples appear and vanish in place
uniform float uDyT;          // css px from the horizon down to the waterline
uniform float uF;            // focal length, css px
uniform float uDyB;          // css px from the horizon to the bottom edge
uniform vec2 uCell;          // one water cell, in water uv
uniform float uRough;        // 0-1, how rained-on the surface is
uniform float uSat;          // colour: 0 grey, 1 the painting, above 1 rinsed and fuller
uniform float uTime;
uniform vec3 uPaper, uBody, uSky, uMist;
// the weather
uniform float uDark;         // storm light: sky darkened, contrast down, cooler
uniform vec3 uVeil;          // squall veil: amount, trailing edge, leading edge (css px)
uniform float uHaze;         // rain haze over the far bank
uniform float uWind;         // how hard the willows are moving
uniform float uGust;         // cat's paws racing over the water
uniform vec3 uSheets;        // sheets of rain: amount, then the rain's trailing / leading edge (css px)
uniform vec3 uSun;           // sun: overall warmth, the passing band's position (css px), its strength
uniform vec2 uGlit;          // glitter path: strength, x of the sun (css px)
varying vec2 vUv;

float dec(float v) { return (v * 255. - 128.) / 127.; }
float nz(vec2 q) { return texture2D(uNoise, q / 64.).r; }
// slope of the fine roughness rain leaves everywhere: a small smooth random
// field at two scales, sampled at two random places and cross-faded, so
// dimples come and go where they are
vec2 rough(vec2 q) {
    vec4 a = mix(texture2D(uNoise, (q + uOff.xy) / 64.), texture2D(uNoise, (q + uOff.zw) / 64.), uFade);
    vec4 b = mix(texture2D(uNoise, (q * 2.1 + uOff.yx) / 64.), texture2D(uNoise, (q * 2.1 + uOff.wz) / 64.), uFade);
    float k = inversesqrt(1. - 2. * uFade * (1. - uFade));
    return ((a.rg - .5) + (b.ba - .5) * .6) * 4. * k;
}
// y is css px down from the top of the band; above it is the hidden sky
vec2 bankUv(float x, float y) { return vec2((x - uMap.x) / uMap.y, (y + uHf - uHb) / uHf); }

// The willows in the wind: crowns sway as masses, the light twigs flutter
// more, the trunks hardly at all (by height above the water).
vec2 sway(vec2 p) {
    if (uWind < .002) return vec2(0.);
    float hf = clamp((uHb - p.y) / uHf, 0., 1.);
    float m = smoothstep(.2, .85, hf);
    float t = uTime;
    float mass = sin(t * 1.9 + p.x * .007) * .55 + sin(t * 1.1 + p.x * .0021 + 1.3) * .45;
    vec2 fl = vec2(texture2D(uNoise, vec2(p.x / 70. + t * 1.6, p.y / 70.) / 64.).g,
                   texture2D(uNoise, vec2(p.x / 70. - t * 1.3, p.y / 70. + 9.) / 64.).b) - .5;
    return (vec2(mass * 15. + 9. * uGust, mass * 2.) + fl * vec2(22., 9.)) * uWind * m;
}

// What the weather does to a point of the bank (and so to its reflection).
vec3 atmos(vec3 c, vec2 p) {
    float hp = uHb - p.y, hf = clamp(hp / uHf, 0., 1.);
    float l = dot(c, vec3(.3, .55, .15));
    // storm light: the bright sky goes dark first, contrast drops, the light
    // cools to a blue-green grey; the willows stay olive under it
    c *= 1. - uDark * (.1 + .32 * smoothstep(.3, .85, l));
    c = mix(c, vec3(dot(c, vec3(.3, .55, .15))), uDark * .12);
    c *= mix(vec3(1.), vec3(.86, .97, 1.03), uDark);
    if (uVeil.x > .002) {
        // The squall: a slanted grey wall, its foot running ahead of its top,
        // with a ragged leading edge and darker streaks hanging from the
        // cloud. Densest just behind the front; behind that, rain and haze.
        float vx = p.x + hp * .38;
        float edge = sin(p.y * .011 + 1.7) * 46. + sin(p.y * .037) * 20. + (nz(vec2(p.y / 12., 3.3)) - .5) * 60.;
        float d = uVeil.z - (vx + edge);                     // css px behind the leading edge
        float front = smoothstep(-6., 40., d);               // a defined edge
        float body = front * (.42 + .58 * exp(-max(d, 0.) / (uSize.x * .28)));
        float tail = smoothstep(uVeil.y - 120., uVeil.y + 260., vx + edge);
        float sx = vx - uTime * 14.;
        float shafts = .5 + .26 * sin(sx * .021 + 1.3) + .16 * sin(sx * .057 + 4.) + .08 * sin(sx * .13 + 2.);
        float st = nz(vec2(vx / 2.6, p.y / 210. - uTime * .55));
        float v = uVeil.x * body * tail * (.24 + .22 * (1. - hf) + .2 * smoothstep(.2, .95, shafts));
        c = mix(c, uMist * .84, clamp(v, 0., .5));
        // dark streaks hanging from the cloud base
        c = mix(c, uMist * .5, uVeil.x * body * tail * .3 * smoothstep(.52, .82, st) * (.4 + .6 * hf));
    }
    // rain haze over the far bank, thickest at its foot
    c = mix(c, uMist * .8, uHaze * (.1 + .2 * (1. - hf)));
    // sun: a warm light passes across, then stays
    if (uSun.x + uSun.z > .002) {
        float band = exp(-pow((p.x - hp * .5 - uSun.y) / 300., 2.));
        float lit = clamp(uSun.x * .38 + band * uSun.z * .75, 0., 1.);
        c = c * mix(vec3(1.), vec3(1.2, 1.07, .86), lit) + vec3(.05, .035, .01) * lit * smoothstep(.2, .7, l);
    }
    return c;
}
vec3 bankAt(vec2 p) {
    vec2 q = p - sway(p);
    return atmos(texture2D(uBank, bankUv(q.x, q.y)).rgb, p);
}

void main() {
    vec2 p = vUv * uSize;
    float a = texture2D(uMask, vUv).r;
    float tilt = .16 + .3 * uWind;                       // how far the rain leans
    // where it is raining now: between the squall's trailing and leading edges
    float span = smoothstep(uSheets.y - 160., uSheets.y + 160., p.x) * (1. - smoothstep(uSheets.z - 160., uSheets.z + 160., p.x));
    vec3 c;
    if (p.y < uHb) {
        c = bankAt(p);
        c = mix(c, uMist, uRough * span * .12);
    } else {
        float dw = p.y - uHb;
        float dy = uDyT + dw;               // depth below the horizon, css px
        float q = uDyB / dy;                // how much further than the bottom edge this strip is
        float sinT = dy / sqrt(dy * dy + uF * uF);
        vec2 wuv = vec2(vUv.x, dw / uHw);
        vec4 w = texture2D(uWater, wuv) * .4
               + (texture2D(uWater, wuv + vec2(uCell.x, 0.)) + texture2D(uWater, wuv - vec2(uCell.x, 0.))
                + texture2D(uWater, wuv + vec2(0., uCell.y)) + texture2D(uWater, wuv - vec2(0., uCell.y))) * .15;
        vec2 e = vec2(dec(w.r), dec(w.g));
        vec2 s = sign(e) * e * e * ${SLOPE.toFixed(3)};
        float splash = texture2D(uWater, wuv).b;
        float rgh = uRough * span;
        // cat's paws: patches of fine ripples that race across with the gust
        float cp = 0.;
        if (uGust > .002) {
            // world position on the pond (same units across and in depth),
            // so a round patch is flattened by perspective like the rings
            vec2 Wp = vec2((p.x - uSize.x * .5) * q - uTime * 260., q * uF);
            float n = nz(Wp / 230.) * .6 + nz(Wp / 95. + 17.) * .3 + nz(Wp / 28. + 41.) * .1;
            cp = uGust * smoothstep(.5, .58, n);
        }
        if (rgh + cp > .003) {
            vec2 g = rough(vec2(p.x * q / 1.8, dw / 1.));
            s += g * (vec2(.005, .006) * rgh + vec2(.003, .016) * rgh * uSheets.x + vec2(.012, .02) * cp);
        }
        // the reflected ray: tipped up or down the bank by twice the slope
        // toward you, sideways by less at a glancing angle
        float hb = dw - 2. * s.y * uF;
        float x = p.x - 2. * s.x * sinT * uF;
        float by = clamp(uHb - hb, uHb - uHf + .5, uHb - .5);
        vec2 rp = vec2(x, by);
        vec3 refl = bankAt(rp);
        vec3 soft = atmos(texture2D(uBlur, bankUv(rp.x, rp.y)).rgb, rp);
        refl = mix(refl, soft, clamp(.04 + rgh * .3 + cp * .6, 0., 1.));
        refl = mix(refl, uSky * 1.05 * (1. - .15 * uDark), smoothstep(0., uHb * .06, hb - uHf));
        refl = mix(refl, refl * .45 + uBody * .55, smoothstep(0., uHb * .04, -hb));
        refl = mix(refl, uSky * (1. - .4 * uDark), .04 + .06 * rgh);
        // a cat's paw has no mirror in it: the dark of the water shows
        float fine = mix(nz(vec2(p.x * q / 1.4, dw / .9) + uOff.xy), nz(vec2(p.x * q / 1.4, dw / .9) + uOff.zw), uFade);
        refl = mix(refl, refl * .45 + uBody * .25, cp * (.45 + .5 * fine));
        float cosi = clamp(sinT - s.y, .02, 1.);
        float R = .02 + .98 * pow(1. - cosi, 5.);
        R = mix(R, 1., .55);
        c = mix(mix(uBody, uMist * .55, uDark * .5), refl, R);
        c = mix(c, uMist * .8, rgh * .07 + uHaze * .06);
        c *= 1. - .035 * rgh;
        // in rain the far shore loses its crisp line
        c = mix(mix(c, bankAt(vec2(p.x, uHb - 1.5)), .7), c, mix(1., smoothstep(0., 14., dw), rgh));
        c = mix(c, vec3(.94, .93, .9), clamp(splash, 0., 1.) * .8);
        // rain-roughened water: fine wavelets catching the sky's light
        // between the rings, so the surface boils rather than lies flat
        if (rgh > .02) {
            vec2 fq = vec2(p.x * q / 1.1, dw / .55);
            float f = mix(nz(fq + uOff.xy), nz(fq + uOff.zw), uFade);
            float gl = smoothstep(.58, .82, f) * rgh * (.55 + .45 * uSheets.x);
            c = mix(c, uSky * vec3(.92, 1., 1.04) * (1.02 - .12 * uDark), gl * .45);
        }
        // the glitter path under the sun: glints on the small waves, narrow
        // and dense far out, wider and sparser toward you
        if (uGlit.x > .002) {
            float col = exp(-pow((p.x - uGlit.y) / ((10. + .42 * dw) * clamp(uSize.x / 1440., .35, 1.)), 2.));
            float n = mix(nz(vec2(p.x * q / 1.3, dw / .7) + uOff.xy), nz(vec2(p.x * q / 1.3, dw / .7) + uOff.zw), uFade);
            float sp = smoothstep(.7 + .12 * dw / uHw, .88, n) * col * (1. - .55 * dw / uHw);
            c += vec3(1., .93, .78) * sp * uGlit.x * 1.3 + vec3(.2, .15, .08) * col * uGlit.x * (1. - dw / uHw) * .4;
        }
    }
    // sheets of rain sweeping across in waves, leaning with the wind
    if (uSheets.x > .002) {
        float lean = p.x + (uSize.y - p.y) * tilt;
        float wave = nz(vec2((lean - uTime * 190.) / 300., 3.5));
        float st = nz(vec2(lean / 2.2, p.y / 60. - uTime * 7.));
        float sh = uSheets.x * span * smoothstep(.5, .78, wave);
        c = max(c, mix(c, uMist * 1.18, sh * (.16 + .4 * smoothstep(.35, .8, st))));
    }
    float l = dot(c, vec3(.3, .55, .15));
    c = mix(vec3(l) * vec3(1.01, 1., .985), c, uSat);
    gl_FragColor = vec4(mix(uPaper, c, a), 1.);
}`;

export function rainPond(root, opts = {}) {
    const fig = root && root.querySelector('.rpd-pic, figure');
    const img = fig && fig.querySelector('img');
    if (!img) return () => {};
    const stage = root.querySelector('.rpd-stage') || root;
    const num = (k, d) => {
        const v = opts[k] ?? root.dataset[k];
        return v == null || v === '' || !isFinite(Number(v)) ? d : Number(v);
    };
    const cfg = {
        seed: Math.round(num('seed', 11)),
        strength: Math.max(0, num('strength', 1)),
        density: Math.max(0, num('density', 1)),
        focus: clamp(num('focus', 0.36)),
        water: num('water', 0),             // water height / bank height; 0 = by aspect
        mono: clamp(num('mono', 0.85)),
    };

    let dead = false;
    let gl = null, prog = null, U = {}, buf = null;
    let texBank = null, texBlur = null, texWater = null, texMask = null, texNoise = null;
    let canvas = null, over = null, og = null, maskCanvas = null, live = null;
    let Wc = 0, Hc = 0, Hb = 0, Hw = 0, dpr = 1, Wv = 0, Hv = 0;
    let dyT = 0, dyB = 0, F = 0, mapX = 0, mapW = 1, srcX0 = 0, srcW = 1;
    let cols = 0, rows = 0;
    let h, v, lap, lap2, lapV, splash, addX, addZ, px, AX, AZ, SX, SZ, Q, SPONGE;
    let mean = 0, maxV = 0, maxS = 0, maxSplash = 0, flat = true;
    let visible = false, raf = 0, last = 0, acc = 0, simT = 0, clock = 0;
    let progress = 0, sat = cfg.mono, rough = 0, lastScroll = 0, parked = 1;
    let W = weather(0), sunX = 0, scriptMs = 0;
    let rainAcc = 0, rainNext = 1, lastPhase = -1, lastI = 0, prevP = 0;
    let drawn = { sat: -1, rough: -1 };
    let sizeTimer = 0;
    let rnd = mulberry(cfg.seed);
    const events = [];                      // timed disturbances
    const jets = [], falls = [], rings = [];   // overlay jets and drips; the shower's small rings            // overlay: Worthington jets, falling drips
    let drips = [];
    let segs = [], ptr = null, touch0 = null, press = null;
    let body = [0.2, 0.2, 0.18], sky = [0.8, 0.82, 0.82], mist = [0.6, 0.6, 0.6], paper = [0.953, 0.941, 0.91];
    const off = [];
    const on = (t, type, fn, o) => { t.addEventListener(type, fn, o); off.push(() => t.removeEventListener(type, fn, o)); };
    const emit = (name, detail) => root.dispatchEvent(new CustomEvent('rain-pond:' + name, { bubbles: true, detail }));

    // ── GL ────────────────────────────────────────────────────────────
    function initGL() {
        gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false });
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
        for (const n of ['uBank', 'uBlur', 'uWater', 'uMask', 'uSize', 'uHb', 'uHw', 'uMap', 'uDyT', 'uF', 'uDyB', 'uCell',
            'uNoise', 'uHf', 'uOff', 'uFade', 'uDark', 'uVeil', 'uHaze', 'uWind', 'uGust', 'uSheets', 'uSun', 'uGlit', 'uRough', 'uSat', 'uTime', 'uPaper', 'uBody', 'uSky', 'uMist']) U[n] = gl.getUniformLocation(prog, n);
        const tex = () => {
            const t = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, t);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            return t;
        };
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        texBank = tex(); texBlur = tex(); texWater = tex(); texMask = tex();
        texNoise = tex();
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        {
            const N = 64, r = mulberry(cfg.seed + 101), raw = new Float32Array(N * N * 4).map(() => r());
            const out = new Uint8Array(N * N * 4);
            for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) for (let c = 0; c < 4; c++) {
                let sum = 0;
                for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) sum += raw[(((y + dy + N) % N) * N + ((x + dx + N) % N)) * 4 + c];
                out[(y * N + x) * 4 + c] = Math.round(clamp(0.5 + (sum / 9 - 0.5) * 2.2) * 255);
            }
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, N, N, 0, gl.RGBA, gl.UNSIGNED_BYTE, out);
        }
        gl.uniform1i(U.uBank, 0);
        gl.uniform1i(U.uBlur, 1);
        gl.uniform1i(U.uWater, 2);
        gl.uniform1i(U.uMask, 3);
        gl.uniform1i(U.uNoise, 4);
        return true;
    }
    function upload(unit, t, src) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, src);   // throws if the image is cross-origin
    }

    function cssColor(name, el = root) {
        const raw = getComputedStyle(el).getPropertyValue(name).trim();
        if (!raw) return null;
        const g = document.createElement('canvas').getContext('2d');
        g.fillStyle = '#000';
        g.fillStyle = raw;
        const m = g.fillStyle.match(/^#([0-9a-f]{6})$/i);
        if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
        const p = g.fillStyle.match(/[\d.]+/g);
        return p ? p.slice(0, 3).map((x) => Number(x) / 255) : null;
    }
    function paperColor() {
        return cssColor('--rpd-paper') || cssColor('--paper') ||
            (() => { const m = getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g); return m ? m.slice(0, 3).map((x) => x / 255) : [0.953, 0.941, 0.91]; })();
    }

    // ── layout ────────────────────────────────────────────────────────
    // The picture is a full-bleed band: the stage's whole width, about 88% of
    // its height, bank above and water below. The painting covers the bank's
    // area anchored at its waterline: on a wide screen its top (sky and the
    // crowns of the willows) runs off above the band, on a phone its sides are
    // cropped around data-focus. The bank texture keeps the hidden sky above,
    // so a steep ripple reflects what is really there.
    let Hfull = 1;
    function measure() {
        Wv = stage.clientWidth; Hv = stage.clientHeight;
        const iw = img.naturalWidth, ih = img.naturalHeight;
        const portrait = Wv < Hv * 0.9;
        const k = cfg.water > 0 ? cfg.water : portrait ? 0.95 : 0.56;
        Hc = Math.round(Hv * (portrait ? 0.86 : 0.88));
        Hb = Math.round(Hc / (1 + k));
        Hw = Hc - Hb;
        Wc = Wv;
        const sc = Math.max(Wc / iw, Hb / ih);       // css px per painting px
        const full = iw * sc;                        // the painting's width at this scale
        Hfull = ih * sc;
        const fw = Math.min(1, Wc / full);           // visible fraction across
        srcX0 = clamp(cfg.focus - fw / 2, 0, 1 - fw);
        srcW = fw;
        // a margin each side, when there is more painting, so a ripple can
        // swing the reflection past the frame
        const mL = Math.min(srcX0, fw * 0.08), mR = Math.min(1 - srcX0 - fw, fw * 0.08);
        mapX = -mL * full;
        mapW = (fw + mL + mR) * full;
        // perspective: the bottom edge is RATIO times nearer than the bank
        dyB = Hw / (1 - 1 / RATIO);
        dyT = dyB / RATIO;
        F = GLANCE * dyB;
        return { mL, mR, full };
    }

    function layout() {
        const { mL, mR } = measure();
        fig.style.width = Wc + 'px';
        fig.style.height = Hc + 'px';
        fig.style.setProperty('--rpd-hb', Hb + 'px');
        dpr = Math.min(devicePixelRatio || 1, 2);
        const max = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;
        dpr = Math.min(dpr, max / mapW, max / Hfull, max / Wc, max / Hc);
        canvas.width = Math.round(Wc * dpr);
        canvas.height = Math.round(Hc * dpr);
        over.width = canvas.width;
        over.height = canvas.height;
        gl.viewport(0, 0, canvas.width, canvas.height);

        // where the sun will break through: behind the big cloud, 57% across the painting
        sunX = clamp((0.57 - srcX0) / srcW, 0.12, 0.88) * Wc;

        // the bank, the whole painting above the waterline, at device resolution
        const iw = img.naturalWidth, ih = img.naturalHeight;
        const sx = (srcX0 - mL) * iw, sw = (srcW + mL + mR) * iw;
        const bc = document.createElement('canvas');
        bc.width = Math.round(mapW * dpr);
        bc.height = Math.round(Hfull * dpr);
        const bg = bc.getContext('2d');
        bg.imageSmoothingQuality = 'high';
        bg.drawImage(img, sx, 0, sw, ih, 0, 0, bc.width, bc.height);
        upload(0, texBank, bc);
        // what a rough surface sees: the same bank softened by a few tens of px
        const small = document.createElement('canvas');
        small.width = Math.max(8, Math.round(mapW / 4));
        small.height = Math.max(8, Math.round(Hfull / 4));
        const sg = small.getContext('2d');
        if ('filter' in sg) sg.filter = 'blur(2.5px)';
        sg.drawImage(bc, -4, -4, small.width + 8, small.height + 8);
        upload(1, texBlur, small);

        // colours from the painting: its water's own dark body, the sky, a rain grey
        const t = document.createElement('canvas');
        t.width = 16; t.height = 16;
        const tg = t.getContext('2d');
        tg.drawImage(img, 0, 0, iw, ih, 0, 0, 16, 16);
        const d = tg.getImageData(0, 0, 16, 16).data;
        const avg = (y0, y1) => {
            const s = [0, 0, 0]; let n = 0;
            for (let y = y0; y < y1; y++) for (let x = 0; x < 16; x++) { const o = (y * 16 + x) * 4; s[0] += d[o]; s[1] += d[o + 1]; s[2] += d[o + 2]; n++; }
            return s.map((c) => c / n / 255);
        };
        const low = avg(10, 16), top = avg(0, 3), all = avg(0, 16);
        body = cssColor('--rpd-body') || low.map((c) => c * 0.52);
        sky = cssColor('--rpd-sky') || top;
        const lm = all[0] * 0.3 + all[1] * 0.55 + all[2] * 0.15;
        mist = cssColor('--rpd-mist') || all.map((c, i) => lerp(c, lm, 0.6) * [0.98, 1.04, 1.1][i]);   // a cool blue-green grey
        paper = paperColor();

        buildMask();

        // the water grid
        cols = Math.max(8, Math.round(Wc / CELL));
        rows = Math.max(8, Math.round(Hw / CELL_Y));
        const n = cols * rows;
        h = new Float32Array(n); v = new Float32Array(n); lap = new Float32Array(n);
        lap2 = new Float32Array(n); lapV = new Float32Array(n); splash = new Float32Array(n);
        addX = new Float32Array(n); addZ = new Float32Array(n); rings.length = 0;
        px = new Uint8Array(n * 4);
        AX = new Float32Array(rows); AZ = new Float32Array(rows); SX = new Float32Array(rows); SZ = new Float32Array(rows); Q = new Float32Array(rows);
        const cellY = Hw / rows, cellX = Wc / cols;
        for (let r = 0; r < rows; r++) {
            const q = dyB / (dyT + (r + 0.5) * cellY);
            Q[r] = q;
            SX[r] = q;                                   // world size of a cell across...
            SZ[r] = GLANCE * q * q * (cellY / cellX);    // ...and in depth: far strips are long
            AX[r] = 1 / (SX[r] * SX[r]);
            AZ[r] = 1 / (SZ[r] * SZ[r]);
        }
        // an absorbing margin at the sides and the near edge: the pond goes on
        SPONGE = new Float32Array(n);
        const M = 10;
        for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
            const dd = Math.min(x, cols - 1 - x, (rows - 1 - y) * 0.6);
            SPONGE[y * cols + x] = dd >= M ? 1 : 1 - 0.07 * (1 - dd / M) ** 2;
        }
        mean = 0; events.length = 0; jets.length = 0; falls.length = 0; segs = []; ptr = null;

        // drips: the branch tips that fall within this crop
        drips = DRIPS.map(([fx, fy], i) => ({
            x: (fx - srcX0) / srcW * Wc, y: Hb - (1 - fy) * Hfull, i,
            land: Hw * (0.12 + 0.16 * ((i * 0.618) % 1)),
            next: 0,
        })).filter((d) => d.x > Wc * 0.04 && d.x < Wc * 0.96 && d.y > Hc * 0.12);

        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, texWater);
        px.fill(128);
        for (let i = 2; i < px.length; i += 4) px[i] = 0;
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, cols, rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, px);

        gl.uniform2f(U.uSize, Wc, Hc);
        gl.uniform1f(U.uHb, Hb);
        gl.uniform1f(U.uHw, Hw);
        gl.uniform2f(U.uMap, mapX, mapW);
        gl.uniform1f(U.uHf, Hfull);
        gl.uniform1f(U.uDyT, dyT);
        gl.uniform1f(U.uF, F);
        gl.uniform1f(U.uDyB, dyB);
        gl.uniform2f(U.uCell, 1 / cols, 1 / rows);
        gl.uniform3f(U.uPaper, ...paper);
        gl.uniform3f(U.uBody, ...body);
        gl.uniform3f(U.uSky, ...sky);
        gl.uniform3f(U.uMist, ...mist);
    }

    // The edges: only top and bottom. The pale sky melts into the paper
    // along a long, quiet, slightly uneven contour; the near water fades out
    // over a short distance. Everything between is shown sharp.
    function buildMask() {
        const s = 0.5;
        const mw = Math.max(8, Math.round(Wc * s)), mh = Math.max(8, Math.round(Hc * s));
        maskCanvas = maskCanvas || document.createElement('canvas');
        maskCanvas.width = mw; maskCanvas.height = mh;
        const g = maskCanvas.getContext('2d');
        const im = g.createImageData(mw, mh);
        const r = mulberry(cfg.seed * 7 + 3);
        const lat = new Float32Array(256).map(() => r());
        const n1 = (x) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lat[i & 255] * (1 - u) + lat[(i + 1) & 255] * u; };
        const wob = (x, o) => n1(x / 420 + o) * 0.7 + n1(x / 170 + o + 40) * 0.3 - 0.5;
        const Et = Hc * 0.085, Eb = Hc * 0.05;
        const ease = (t) => { t = clamp(t); return t * t * t * (t * (t * 6 - 15) + 10); };
        for (let x = 0; x < mw; x++) {
            const xx = (x + 0.5) / s;
            const t0 = wob(xx, 3) * Et * 0.55, b0 = wob(xx, 90) * Eb * 0.5;
            for (let y = 0; y < mh; y++) {
                const yy = (y + 0.5) / s;
                const k = ease((yy - t0 + Et * 0.25) / Et) * ease((Hc - yy - b0 + Eb * 0.2) / Eb);
                const o = (y * mw + x) * 4;
                im.data[o] = im.data[o + 1] = im.data[o + 2] = Math.round(k * 255);
                im.data[o + 3] = 255;
            }
        }
        g.putImageData(im, 0, 0);
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, texMask);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, maskCanvas);
    }

    // ── the water ─────────────────────────────────────────────────────
    // A crater ringed by a lip and a fainter second trough, in world units,
    // drawn into the grid as the ellipse perspective makes of it.
    function ring(gx, gy, r, amp) {
        const row = clamp(Math.floor(gy), 0, rows - 1);
        const sx = SX[row], sz = Math.min(SZ[row], r * 0.8);
        const R = r * 2, i1 = 1 / (0.2 * r * r), i2 = 1 / (0.6 * r * r);
        const x0 = Math.max(0, Math.floor(gx - R / sx)), x1 = Math.min(cols - 1, Math.ceil(gx + R / sx));
        const y0 = Math.max(0, Math.floor(gy - R / sz)), y1 = Math.min(rows - 1, Math.ceil(gy + R / sz));
        for (let y = y0; y <= y1; y++) {
            const dz = (y + 0.5 - gy) * sz;
            for (let x = x0; x <= x1; x++) {
                const dx = (x + 0.5 - gx) * sx;
                const d = Math.hypot(dx, dz);
                // a smooth crater with a faint lip; dispersion turns it into the train of rings
                if (d < R) h[y * cols + x] -= amp * 0.5 * (Math.exp(-(d * d) * i1) - 0.3 * Math.exp(-(d * d) * i2));
            }
        }
    }
    function bump(arr, gx, gy, r, amp, cap) {
        const row = clamp(Math.floor(gy), 0, rows - 1);
        const sx = SX[row], sz = Math.min(SZ[row], r * 0.8);
        const x0 = Math.max(0, Math.floor(gx - r / sx)), x1 = Math.min(cols - 1, Math.ceil(gx + r / sx));
        const y0 = Math.max(0, Math.floor(gy - r / sz)), y1 = Math.min(rows - 1, Math.ceil(gy + r / sz));
        for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
                const d = Math.hypot((x + 0.5 - gx) * sx, (y + 0.5 - gy) * sz) / r;
                if (d < 1) {
                    const j = y * cols + x;
                    arr[j] += amp * (0.5 + 0.5 * Math.cos(Math.PI * d));
                    if (cap) arr[j] = Math.min(arr[j], cap);
                }
            }
        }
    }

    // One drop, size in mm, at grid position (gx, gy). Small ones only dimple;
    // big ones throw up a crown and a Worthington jet, which may pinch off a
    // droplet that falls back and rings again.
    function drop(gx, gy, mm, kind = 'rain', quiet = false) {
        if (mm < SMALL) return small(gx, gy, mm, kind, quiet);
        const r = dropR(mm), a = dropA(r) * cfg.strength;
        ring(gx, gy, r, a);
        bump(splash, gx, gy, Math.max(r * 0.5, 1.2), mm > 2.2 ? 0.9 : 0.45, 1);
        const later = (t, rr, aa) => events.push({ t: simT + t, fn: () => bump(h, gx, gy, r * rr, aa * a) });
        if (mm > 1.2) {
            later(0.09, 0.42, 0.32);               // the column springs back
            later(0.24, 0.45, -0.13);
        }
        const row = clamp(Math.floor(gy), 0, rows - 1);
        if (mm > 2.3 && !calm.matches) {
            const scale = CELL / Q[row];           // css px per world unit at this distance
            const sx = gx * Wc / cols, sy = Hb + (gy / rows) * Hw;
            const H = (1.4 + 1.6 * (mm - 2.3)) * scale;
            const pinch = mm > 2.8 && rnd() < 0.7;
            jets.push({ x: sx, y: sy, t: 0, H, w: Math.max(0.7, (0.5 + 0.18 * mm) * scale * 0.55), cr: r * 0.35 * scale, pinch,
                ox: (rnd() - 0.5) * 0.6 * scale, gx, gy, mm });
        }
        flat = false;
        if (!quiet) emit('drop', { size: +mm.toFixed(2), x: gx / cols, y: gy / rows, kind });
        kick();
    }

    // The wake: a fingertip pressed into the water to a fixed depth and drawn
    // along (ripple-pool's), here in world units so it too is an ellipse.
    function wake(seg, f0, f1) {
        const ax = seg.ax + (seg.bx - seg.ax) * f0, ay = seg.ay + (seg.by - seg.ay) * f0;
        const bx = seg.ax + (seg.bx - seg.ax) * f1, by = seg.ay + (seg.by - seg.ay) * f1;
        const len = Math.hypot(bx - ax, by - ay);
        const n = Math.max(1, Math.ceil(len / 0.8));
        const depth = 0.9 * cfg.strength * seg.k;
        for (let i = 0; i < n; i++) {
            const f = (i + 1) / n;
            sink(ax + (bx - ax) * f, ay + (by - ay) * f, 6, depth);
        }
    }
    function sink(gx, gy, r, depth) {
        const row = clamp(Math.floor(gy), 0, rows - 1);
        const sx = SX[row], sz = Math.min(SZ[row], r * 0.8);
        const x0 = Math.max(0, Math.floor(gx - r / sx)), x1 = Math.min(cols - 1, Math.ceil(gx + r / sx));
        const y0 = Math.max(0, Math.floor(gy - r / sz)), y1 = Math.min(rows - 1, Math.ceil(gy + r / sz));
        for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
                const d = Math.hypot((x + 0.5 - gx) * sx, (y + 0.5 - gy) * sz) / r;
                if (d >= 1) continue;
                const w = 0.5 + 0.5 * Math.cos(Math.PI * d);
                const j = y * cols + x, t = -depth * w;
                if (h[j] > t) h[j] += (t - h[j]) * 0.5 * w;
            }
        }
    }

    // anisotropic laplacian: each row has its own world cell size
    function L(a, out) {
        const C = cols, R = rows;
        for (let y = 0; y < R; y++) {
            const row = y * C, ax = AX[y] * 0.25, az = AZ[y] * 0.25;
            const up = y > 0 ? row - C : row, dn = y < R - 1 ? row + C : row;
            for (let x = 0; x < C; x++) {
                const j = row + x, aj = a[j];
                out[j] = ax * ((x > 0 ? a[j - 1] : aj) + (x < C - 1 ? a[j + 1] : aj) - 2 * aj) + az * (a[up + x] + a[dn + x] - 2 * aj);
            }
        }
    }

    function step(i, n) {
        simT += STEP;
        for (let k = events.length - 1; k >= 0; k--) {
            if (events[k].t <= simT) { events[k].fn(); events.splice(k, 1); }
        }
        for (const s of segs) wake(s, i / n, (i + 1) / n);
        let damp = Math.exp(-STEP / DECAY);
        if (maxS < 0.12 && !segs.length && !events.length) damp *= Math.exp(Math.log(0.12) / HZ);
        L(h, lap);
        L(lap, lap2);
        const N = cols * rows;
        for (let j = 0; j < N; j++) v[j] = (v[j] + lap[j] * SPEED - lap2[j] * TENSION) * damp;
        L(v, lapV);
        L(lapV, lap2);                    // hyperviscosity: takes out grid-scale ripples, spares rings
        let sum = 0, mv = 0;
        for (let j = 0; j < N; j++) {
            const sp = SPONGE[j];
            const vj = (v[j] = (v[j] + lapV[j] * VISCOSITY - lap2[j] * HYPER) * sp);
            const hj = (h[j] = (h[j] + vj - mean) * sp);
            sum += hj;
            if (vj > mv) mv = vj; else if (-vj > mv) mv = -vj;
        }
        mean = sum / N;
        maxV = mv;
    }

    // world slopes and splash into the water texture
    // The shower's small drops are too fine for the grid, so their rings are
    // written straight into the slopes: a short packet of two or three
    // crests that leaves the splash at ~25 cm/s, flattened by perspective
    // like everything else, gone in about half a second.
    let addDirty = false;
    function small(gx, gy, mm, kind, quiet) {
        rings.push({ gx, gy, t: 0, A: (0.085 + 0.05 * mm) * cfg.strength, R0: 1 + mm, L: 6 + 2.5 * mm });
        bump(splash, gx, gy, 1.3 + 0.4 * mm, 0.55 + 0.3 * mm, 1);
        // in the downpour the bigger of them throw up little jets, and near
        // you some bounce up as crowns
        if (W.sheets > 0.25 && mm > 0.8 && jets.length < 180 && rnd() < 0.55 && !calm.matches) {
            const row = clamp(Math.floor(gy), 0, rows - 1), scale = CELL / Q[row];
            jets.push({ x: gx * Wc / cols, y: Hb + (gy / rows) * Hw, t: 0, T: 0.13, H: (1 + 2.4 * mm) * scale,
                w: Math.max(0.6, (0.35 + 0.2 * mm) * scale), cr: (1.4 + 1.2 * mm) * scale, pinch: false,
                crown: gy / rows > 0.55 && rnd() < 0.6, ox: 0, gx, gy, mm });
        }
        flat = false;
        if (!quiet) emit('drop', { size: +mm.toFixed(2), x: gx / cols, y: gy / rows, kind });
        kick();
    }
    function stampRings() {
        if (addDirty) { addX.fill(0); addZ.fill(0); addDirty = false; }
        if (!rings.length) return;
        addDirty = true;
        const TAU = 2 * Math.PI;
        for (const g of rings) {
            const Rt = g.R0 + RING_V * g.t, w = g.L * (0.7 + 0.9 * g.t), lam = g.L * (1 + 0.8 * g.t);
            const amp = g.A * Math.exp(-g.t / RING_T);
            const row = clamp(Math.floor(g.gy), 0, rows - 1);
            const sx = SX[row], sz = SZ[row];
            const Rm = Rt + w;
            const x0 = Math.max(0, Math.floor(g.gx - Rm / sx)), x1 = Math.min(cols - 1, Math.ceil(g.gx + Rm / sx));
            const y0 = Math.max(0, Math.floor(g.gy - Rm / sz)), y1 = Math.min(rows - 1, Math.ceil(g.gy + Rm / sz));
            for (let y = y0; y <= y1; y++) {
                const dz = (y + 0.5 - g.gy) * sz;
                for (let x = x0; x <= x1; x++) {
                    const dx = (x + 0.5 - g.gx) * sx;
                    const d = Math.sqrt(dx * dx + dz * dz) + 1e-3;
                    const u = (d - Rt) / w;
                    if (u <= -1 || u >= 1) continue;
                    const e = 1 - u * u;
                    const sl = amp * e * e * Math.cos(TAU * (d - Rt) / lam) / d;
                    const j = y * cols + x;
                    addX[j] += sl * dx;
                    addZ[j] += sl * dz;
                }
            }
        }
    }

    function encode() {
        const C = cols, R = rows;
        let ms = 0, mspl = 0;
        stampRings();
        for (let y = 0; y < R; y++) {
            const row = y * C, sx = SX[y], sz = SZ[y];
            const up = y > 0 ? row - C : row, dn = y < R - 1 ? row + C : row;
            for (let x = 0; x < C; x++) {
                const j = row + x;
                const gxw = ((x < C - 1 ? h[j + 1] : h[j]) - (x > 0 ? h[j - 1] : h[j])) * 0.5 / sx + addX[j];
                const gzw = (h[dn + x] - h[up + x]) * 0.5 / sz + addZ[j];
                const a = Math.sign(gxw) * Math.sqrt(Math.min(1, Math.abs(gxw) / SLOPE)), b = Math.sign(gzw) * Math.sqrt(Math.min(1, Math.abs(gzw) / SLOPE));
                const m = Math.abs(a) + Math.abs(b);
                if (m > ms) ms = m;
                const o = j * 4;
                px[o] = 128 + Math.round(a * 127);
                px[o + 1] = 128 + Math.round(b * 127);
                const sp = splash[j];
                if (sp > mspl) mspl = sp;
                px[o + 2] = Math.round(clamp(sp) * 255);
            }
        }
        maxS = ms; maxSplash = mspl;
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, texWater);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, cols, rows, gl.RGBA, gl.UNSIGNED_BYTE, px);
    }

    function draw() {
        gl.uniform1f(U.uTime, clock);
        gl.uniform1f(U.uRough, rough);
        gl.uniform1f(U.uSat, sat);
        // the roughness field is re-dealt ten times a second and cross-faded
        const T = clock * 10, i = Math.floor(T);
        const o = (n, k) => ((Math.sin(n * 127.1 + k * 311.7) * 43758.5453) % 1 + 1) % 1 * 64;
        gl.uniform4f(U.uOff, o(i, 1), o(i, 2), o(i + 1, 1), o(i + 1, 2));
        gl.uniform1f(U.uFade, T - i);
        // the weather; what moves (wind, gusts, sheets, glitter) dies away
        // with the visitor's attention, like the rain
        const k = parked;
        gl.uniform1f(U.uDark, W.dark);
        gl.uniform3f(U.uVeil, W.veil, W.veilT * Wc, W.veilF * Wc);
        gl.uniform1f(U.uHaze, W.haze);
        gl.uniform1f(U.uWind, W.wind * k);
        gl.uniform1f(U.uGust, W.gust * k);
        gl.uniform3f(U.uSheets, W.sheets * k, W.rainT * Wc, W.rainF * Wc);
        gl.uniform3f(U.uSun, W.sun, W.sunB * Wc, W.sunBand);
        gl.uniform2f(U.uGlit, W.glitter * (calm.matches ? 1 : k), sunX);
        for (const [u, t] of [[0, texBank], [1, texBlur], [2, texWater], [3, texMask], [4, texNoise]]) {
            gl.activeTexture(gl.TEXTURE0 + u);
            gl.bindTexture(gl.TEXTURE_2D, t);
        }
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        drawn.sat = sat; drawn.rough = rough;
    }

    function flatten() {
        h.fill(0); v.fill(0); splash.fill(0); rings.length = 0; mean = 0; maxV = maxS = maxSplash = 0; flat = true;
        encode();
    }

    // ── the air: rain streaks, jets and crowns, falling drips ────────
    let overDirty = false;
    function drawOver(dt, streak) {
        const g = og;
        if (overDirty) { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, over.width, over.height); overDirty = false; }
        if (!streak && !jets.length && !falls.length) return;
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        overDirty = true;
        // streaks: very faint, thin, nearly upright; seen against the dark
        // trees, lost against the sky, as real rain is
        if (streak > 0) {
            // drawn 'screen': a streak only ever lightens what is behind it,
            // so it shows against trunks and dark water and vanishes on sky
            const n = Math.round(streak * Wc * Hc / 1800);
            const lean = -(0.16 + 0.3 * W.wind * parked);         // leaning with the wind, which blows to the right
            g.lineCap = 'round';
            g.globalCompositeOperation = 'screen';
            for (let i = 0; i < n; i++) {
                const sx0 = clamp(W.rainT) - 0.05, sx1 = clamp(W.rainF) + 0.05;
                const x = Wc * (sx0 + (sx1 - sx0) * Math.random()), y = Hc * (0.1 + 0.85 * Math.random());
                const r = Math.random();
                const len = 12 + 52 * r * r + 12 * (y / Hc);
                const a = (0.1 + 0.16 * Math.random()) * streak;
                g.strokeStyle = `rgba(214,214,208,${a.toFixed(3)})`;
                g.lineWidth = 0.75 + 0.45 * Math.random();
                g.beginPath(); g.moveTo(x, y); g.lineTo(x - len * lean, y + len); g.stroke();
            }
            g.globalCompositeOperation = 'source-over';
        }
        // jets: the column rises and falls in ~0.2 s; its reflection hangs
        // below it; a pinched-off droplet goes on up and drops back
        for (let k = jets.length - 1; k >= 0; k--) {
            const J = jets[k];
            J.t += dt;
            const T = J.T || 0.2, t = J.t;
            if (t < 0.06) {                                     // the crown: a bright rim for a moment
                const a = 0.32 * (1 - t / 0.06);
                g.strokeStyle = `rgba(240,238,232,${a.toFixed(3)})`;
                g.lineWidth = Math.max(0.5, J.w * 0.5);
                const rr = J.cr * (0.7 + 0.5 * t / 0.06);
                g.beginPath(); g.ellipse(J.x, J.y, rr, Math.max(0.6, rr / (GLANCE * 1.6)), 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
            }
            if (J.crown && t < 0.16) {
                // a crown: a ring of droplets thrown up and out round the crater
                const f = t / 0.16, rr = J.cr * (1 + 1.6 * f), lift = J.H * 0.7 * Math.sin(Math.PI * f);
                g.fillStyle = `rgba(240,238,232,${(0.55 * (1 - f * 0.6)).toFixed(3)})`;
                for (let i = 0; i < 8; i++) {
                    const a = Math.PI * (1.05 + 0.9 * i / 7);
                    const ex = J.x + Math.cos(a) * rr, ey = J.y + Math.sin(a) * rr / (GLANCE * 1.3) - lift * (0.6 + 0.4 * Math.abs(Math.sin(a)));
                    g.beginPath(); g.arc(ex, ey, Math.max(0.55, J.w * 0.45), 0, 2 * Math.PI); g.fill();
                }
            }
            if (t > 0.03 && t < T + 0.03) {
                // a slender column, thicker at the foot, and its reflection below
                const hh = J.H * Math.sin(Math.PI * (t - 0.03) / T), w = J.w;
                const col = (y0, dir, a) => {
                    g.fillStyle = `rgba(238,236,229,${a.toFixed(3)})`;
                    g.beginPath();
                    g.moveTo(J.x - w * 0.6, y0);
                    g.quadraticCurveTo(J.x - w * 0.25, y0 + dir * hh * 0.6, J.x, y0 + dir * hh);
                    g.quadraticCurveTo(J.x + w * 0.25, y0 + dir * hh * 0.6, J.x + w * 0.6, y0);
                    g.fill();
                };
                col(J.y, -1, 0.42);
                col(J.y + 0.5, 1, 0.12);
            }
            if (J.pinch && t > 0.1) {
                // ballistic, from 0.9 H at 0.1 s, rising a little, back down at ~0.34 s
                const tt = t - 0.1, v0 = J.H * 2.2, gg = 2 * (0.9 * J.H + v0 * 0.24) / (0.24 * 0.24);
                const y = 0.9 * J.H + v0 * tt - 0.5 * gg * tt * tt;
                if (y > 0) {
                    g.fillStyle = 'rgba(240,238,232,.5)';
                    g.beginPath(); g.arc(J.x + J.ox, J.y - y, Math.max(0.6, J.w * 0.45), 0, 2 * Math.PI); g.fill();
                } else if (!J.landed) {
                    J.landed = true;
                    drop(J.gx + J.ox / (Wc / cols), J.gy, J.mm * 0.32, 'droplet');
                }
            }
            if (t > 0.45 || (!J.pinch && t > Math.max(T + 0.05, J.crown ? 0.17 : 0))) jets.splice(k, 1);
        }
        // drips: a fat drop falling from a branch tip
        for (let k = falls.length - 1; k >= 0; k--) {
            const D = falls[k];
            D.t += dt;
            const f = D.t / D.dur;
            if (f >= 1) {
                falls.splice(k, 1);
                drop(D.gx, D.gy, D.mm, 'drip', true);
                emit('drip', { size: D.mm, x: D.gx / cols, y: D.gy / rows });
                continue;
            }
            const y = lerp(D.y0, D.y1, f * f);
            const len = 2 + 10 * f;
            g.strokeStyle = 'rgba(236,234,226,.32)';
            g.lineWidth = 1;
            g.beginPath(); g.moveTo(D.x, y - len); g.lineTo(D.x, y); g.stroke();
        }
        // the air shares the picture's soft edge
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.globalCompositeOperation = 'destination-in';
        g.drawImage(maskCanvas, 0, 0, over.width, over.height);
        g.globalCompositeOperation = 'source-over';
    }

    // ── the shower ────────────────────────────────────────────────────
    function readProgress() {
        if (calm.matches) return 1;
        const r = root.getBoundingClientRect();
        const run = r.height - stage.clientHeight;
        return run > 1 ? clamp(-r.top / run) : clamp((innerHeight - r.top) / (innerHeight + r.height));
    }

    function rain(dt) {
        const p = progress;
        const area = clamp((Wc * Hw) / 400000, 0.4, 1.5);   // drops scale with the pond on screen
        const rate = rateAt(p) * PEAK * cfg.density * parked;
        // the very first drop always comes, and comes here
        if (prevP < 0.27 && p >= 0.27 && p < 0.36) drop(cols * 0.12, rows * 0.55, 3.6);
        prevP = p;
        // it rains only where the squall is over the pond
        const x0 = clamp(W.rainT), x1 = clamp(W.rainF);
        rainAcc += rate * area * Math.max(0, x1 - x0) * dt;
        let guard = 0;
        while (rainAcc >= rainNext && guard++ < 40) {
            rainAcc -= rainNext;
            rainNext = -Math.log(1 - rnd() * 0.999);
            // where: evenly over the water as you see it (the far water gets
            // far more drops than this, but their rings are below a pixel and
            // live in the roughness instead)
            let gy = rows * (0.01 + 0.98 * rnd());
            if (rnd() < 0.35) gy = rows * (0.35 + 0.64 * rnd());   // a little more in the near water, where rings are seen
            if (x1 - x0 < 0.02) continue;
            const gx = cols * (x0 + (x1 - x0) * rnd());
            const fat = rnd() < fatAt(p);
            const mm = fat ? 2.4 + 2.1 * rnd() : 0.4 + 1.2 * rnd() * rnd();
            drop(gx, gy, mm);
        }
        // drips from the branches, each on its own slowly lengthening beat
        const per = dripPeriod(p) * (parked < 1 ? 1 / Math.max(parked, 0.05) : 1);
        for (const d of drips) {
            if (!per) { d.next = 0; continue; }
            if (!d.next) d.next = clock + per * (0.1 + 0.6 * rnd());
            if (clock >= d.next) {
                d.next = clock + per * (0.75 + 0.5 * rnd());
                const gy = (d.land / Hw) * rows;
                falls.push({ x: d.x, y0: d.y, y1: Hb + d.land, t: 0, dur: 0.34, gx: d.x / Wc * cols, gy, mm: 5 + 1.5 * rnd() });
            }
        }
        // how rained-on the surface is follows the rain, with a lag
        const target = Math.pow(rate / PEAK / Math.max(cfg.density, 0.01), 0.55) * Math.min(1, cfg.density) ;
        const tau = target > rough ? 1.1 : 1.5;
        rough += (clamp(target) - rough) * (1 - Math.exp(-dt / tau));
        if (rough < 0.012 && target === 0) rough = 0;
        const I = clamp(rate / PEAK);
        if (Math.abs(I - lastI) > 0.05 || (I === 0 && lastI !== 0)) { lastI = I; emit('rain', { intensity: +I.toFixed(2) }); }
        return smooth(0.3, 0.9, rate / PEAK);            // streak strength
    }

    // ── loop ──────────────────────────────────────────────────────────
    function frame(t) {
        raf = 0;
        if (dead || !gl || gl.isContextLost()) return;
        const dt = last ? Math.min(0.05, (t - last) / 1000) : 1 / 60;
        last = t;
        clock += dt;
        // a pond left alone in the rain: after 40 s without scrolling the
        // shower passes on its own; scrolling brings it back
        const idle = (performance.now() - lastScroll) / 1000;
        parked = idle > 40 ? Math.max(0, 1 - (idle - 40) / 10) : Math.min(1, parked + dt / 2);
        const t0 = performance.now();
        W = weather(progress);
        weatherEvents();
        const streak = calm.matches ? 0 : rain(dt);
        sat = satAt(progress, cfg.mono);

        for (let k = rings.length - 1; k >= 0; k--) if ((rings[k].t += dt) > 0.62) rings.splice(k, 1);
        if (rings.length > MAX_RINGS) rings.splice(0, rings.length - MAX_RINGS);   // the oldest, faintest go first
        acc += dt;
        let n = Math.floor(acc / STEP);
        if (n > 5) { n = 5; acc = 0; } else acc -= n * STEP;
        if (segs.length || events.length) flat = false;
        if (!flat && n > 0) {
            for (let i = 0; i < n; i++) step(i, n);
            segs = [];
            const k = Math.exp(-dt / 0.07);
            if (maxSplash > 0.004) for (let j = 0; j < splash.length; j++) splash[j] *= k;
            else if (maxSplash) splash.fill(0);
            encode();
        }
        draw();
        drawOver(dt, streak);
        scriptMs = scriptMs * 0.95 + (performance.now() - t0) * 0.05;
        const lively = !flat && (rings.length > 0 || maxV > 4e-4 || maxS > 0.05 || maxSplash > 0.004 || events.length > 0 || segs.length > 0);
        if (!flat && !lively) { flatten(); draw(); }
        const raining = rateAt(progress) * parked > 0 || drips.some((d) => d.next) || falls.length || jets.length || (moving(W) && parked > 0);
        if (raf) return announce();          // something inside this frame already asked for the next
        if (visible && !document.hidden && (lively || raining || rough > 0)) raf = requestAnimationFrame(frame);
        else { last = 0; acc = 0; }
        announce();
    }
    function kick() {
        if (!raf && visible && gl && !calm.matches && !document.hidden) raf = requestAnimationFrame(frame);
    }
    // the loop is asleep but something only the shader shows has changed
    function redraw() {
        if (raf || !gl || dead) return;
        raf = requestAnimationFrame(() => { raf = 0; draw(); kick(); });
    }

    // the gust and the sun break, for sound: once each time they arrive
    let gustOn = false, sunOn = false;
    function weatherEvents() {
        if (!gustOn && W.gust > 0.5) emit('gust', { strength: +W.gust.toFixed(2) });
        if (!sunOn && W.sunBand > 0.5) emit('sun', { warmth: +W.sun.toFixed(2) });
        gustOn = W.gust > 0.3 ? gustOn || W.gust > 0.5 : false;
        sunOn = W.sunBand > 0.3 ? sunOn || W.sunBand > 0.5 : false;
    }

    function announce() {
        const ph = phaseAt(progress);
        if (ph !== lastPhase && live) {
            if (lastPhase !== -1 && PHASES[ph]) live.textContent = PHASES[ph];
            lastPhase = ph;
        }
    }

    function onScroll() {
        if (calm.matches) return;
        lastScroll = performance.now();
        progress = readProgress();
        sat = satAt(progress, cfg.mono);
        W = weather(progress);
        weatherEvents();
        if (rateAt(progress) > 0 || dripPeriod(progress) > 0 || moving(W)) { parked = Math.max(parked, 0.05); kick(); }
        else redraw();
        if (!raf) announce();
    }

    // ── input ─────────────────────────────────────────────────────────
    const toGrid = (cx, cy) => {
        const r = fig.getBoundingClientRect();
        return { x: ((cx - r.left) / r.width) * cols, y: ((cy - r.top - Hb * r.height / Hc) / (Hw * r.height / Hc)) * rows };
    };
    const inside = (p) => p.x >= 0 && p.y >= 0 && p.x <= cols && p.y <= rows;
    function trail(p, k) {
        if (ptr && inside(p)) {
            const len = Math.hypot(p.x - ptr.x, p.y - ptr.y);
            if (len > 0.05 && len < cols * 0.3) { segs.push({ ax: ptr.x, ay: ptr.y, bx: p.x, by: p.y, k }); flat = false; kick(); }
        }
        ptr = inside(p) ? p : null;
    }
    function onPointerMove(e) {
        if (e.pointerType === 'touch' || calm.matches || !gl) return;
        trail(toGrid(e.clientX, e.clientY), e.buttons ? 1 : 0.3);
    }
    function onPointerDown(e) {
        if (e.pointerType === 'touch' || calm.matches || e.button !== 0 || !gl) return;
        const p = toGrid(e.clientX, e.clientY);
        if (!inside(p)) return;
        e.preventDefault();
        ptr = p;
        press = { x: e.clientX, y: e.clientY, at: performance.now(), p };
    }
    function onPointerUp(e) {
        if (!press || e.pointerType === 'touch') return;
        if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < 6 && performance.now() - press.at < 450) drop(press.p.x, press.p.y, 3.4, 'tap');
        press = null;
    }
    const onPointerLeave = (e) => { if (e.pointerType !== 'touch') ptr = null; };
    function onTouchStart(e) {
        if (calm.matches || !gl) return;
        const t = e.changedTouches[0];
        touch0 = { id: t.identifier, x: t.clientX, y: t.clientY, at: performance.now(), moved: 0 };
        const p = toGrid(t.clientX, t.clientY);
        ptr = inside(p) ? p : null;
    }
    function onTouchMove(e) {
        if (!touch0 || calm.matches) return;
        for (const t of e.changedTouches) {
            if (t.identifier !== touch0.id) continue;
            touch0.moved = Math.max(touch0.moved, Math.hypot(t.clientX - touch0.x, t.clientY - touch0.y));
            trail(toGrid(t.clientX, t.clientY), 1);
        }
    }
    function onTouchEnd(e) {
        if (!touch0) return;
        for (const t of e.changedTouches) {
            if (t.identifier !== touch0.id) continue;
            if (e.type === 'touchend' && touch0.moved < 10 && performance.now() - touch0.at < 350) {
                const p = toGrid(t.clientX, t.clientY);
                if (inside(p)) drop(p.x, p.y, 3.4, 'tap');
            }
            touch0 = null;
            ptr = null;
        }
    }
    function onKey(e) {
        if (calm.matches || !gl) return;
        const dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            drop(cols * (0.25 + rnd() * 0.5), rows * (0.3 + rnd() * 0.5), 3.4, 'tap');
        } else if (dirs[e.key]) {
            e.preventDefault();
            const [dx] = dirs[e.key];
            const Lx = cols * 0.4, cx = cols / 2 - (dx * Lx) / 2, cy = rows * 0.6;
            for (let i = 0; i < 14; i++) {
                setTimeout(() => {
                    if (dead) return;
                    segs.push({ ax: cx + dx * Lx * i / 14, ay: cy, bx: cx + dx * Lx * (i + 1) / 14, by: cy, k: 1 });
                    flat = false; kick();
                }, i * 22);
            }
        }
    }

    // Reduced motion: just after the rain, in colour; a few rings caught part
    // way out, nothing moving.
    function still() {
        progress = 1; sat = 1.18; rough = 0; W = weather(1);
        flatten();
        const spots = [[0.32, 0.45, 3.2], [0.7, 0.68, 2.6], [0.55, 0.2, 3.8], [0.18, 0.84, 1.9]];
        for (const [x, y, mm] of spots) drop(cols * x, rows * y, mm, 'rain', true);
        for (let i = 0; i < Math.round(0.42 * HZ); i++) step(0, 1);
        for (let j = 0; j < h.length; j++) h[j] *= 0.8;      // gentle: caught as they fade
        splash.fill(0);
        flat = false;
        encode();
        draw();
    }

    // ── start ─────────────────────────────────────────────────────────
    let io = null, ro = null;
    async function start() {
        try { await img.decode(); } catch (e) { if (!img.complete || !img.naturalWidth) await new Promise((res) => img.addEventListener('load', res, { once: true })); }
        if (dead || !img.naturalWidth) return;
        if (document.fonts && document.fonts.ready) await document.fonts.ready;
        if (dead) return;

        canvas = document.createElement('canvas');
        canvas.className = 'rpd-canvas';
        canvas.setAttribute('aria-hidden', 'true');
        over = document.createElement('canvas');
        over.className = 'rpd-air';
        over.setAttribute('aria-hidden', 'true');
        og = over.getContext('2d');
        try {
            if (!initGL()) throw new Error('no webgl');
            fig.appendChild(canvas);
            fig.appendChild(over);
            layout();
        } catch (e) {
            canvas.remove(); over.remove();
            canvas = over = null; gl = null;
            fig.style.width = fig.style.height = '';
            return;      // the painting stays: that is the fallback
        }
        live = document.createElement('p');
        live.className = 'rpd-live';
        live.setAttribute('aria-live', 'polite');
        root.appendChild(live);

        on(canvas, 'webglcontextlost', (e) => { e.preventDefault(); cancelAnimationFrame(raf); raf = 0; root.classList.remove('is-live'); });
        on(canvas, 'webglcontextrestored', () => {
            try { if (initGL()) { layout(); calm.matches ? still() : (flatten(), draw()); root.classList.add('is-live'); kick(); } } catch (e) { /* stay on the img */ }
        });

        progress = readProgress();
        prevP = progress;
        sat = calm.matches ? 1.18 : satAt(progress, cfg.mono);
        if (calm.matches) still(); else { flatten(); draw(); }
        root.classList.add('is-live');
        lastScroll = performance.now();

        if (!calm.matches) {
            fig.tabIndex = 0;
            fig.setAttribute('role', 'button');
            if (!fig.hasAttribute('aria-label')) {
                fig.setAttribute('aria-label', 'A pond under willows. Scroll to bring the rain; press Enter to let a drop fall, the arrow keys to stir the water.');
                fig.dataset.rpdLabel = '1';
            }
            fig.dataset.rpdAdded = '1';
        }

        on(fig, 'pointermove', onPointerMove);
        on(fig, 'pointerdown', onPointerDown);
        on(fig, 'pointerleave', onPointerLeave);
        on(window, 'pointerup', onPointerUp);
        on(fig, 'touchstart', onTouchStart, { passive: true });
        on(window, 'touchmove', onTouchMove, { passive: true });
        on(window, 'touchend', onTouchEnd, { passive: true });
        on(window, 'touchcancel', onTouchEnd, { passive: true });
        on(fig, 'keydown', onKey);
        on(window, 'scroll', onScroll, { passive: true });
        on(document, 'visibilitychange', () => { if (!document.hidden) { last = 0; kick(); } });
        on(calm, 'change', () => { if (gl) { layout(); calm.matches ? still() : (progress = readProgress(), flatten(), draw(), kick()); } });

        io = new IntersectionObserver((en) => {
            visible = en[0].isIntersecting;
            if (visible) { last = 0; progress = readProgress(); kick(); redraw(); }
        }, { rootMargin: '40px' });
        io.observe(stage);

        let w0 = Wv, h0 = Hv;
        ro = new ResizeObserver(() => {
            const w = stage.clientWidth, hh = stage.clientHeight;
            // a phone's toolbar sliding away changes the height a little: ignore that
            if (Math.abs(w - w0) < 1 && Math.abs(hh - h0) < Math.max(1, h0 * 0.12)) return;
            clearTimeout(sizeTimer);
            sizeTimer = setTimeout(() => {
                if (dead || !gl) return;
                layout(); w0 = Wv; h0 = Hv;
                calm.matches ? still() : (flatten(), draw());
            }, 150);
        });
        ro.observe(stage);
    }
    start();

    function destroy() {
        dead = true;
        cancelAnimationFrame(raf);
        clearTimeout(sizeTimer);
        off.forEach((f) => f());
        if (io) io.disconnect();
        if (ro) ro.disconnect();
        if (gl) { const x = gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); }
        if (canvas) canvas.remove();
        if (over) over.remove();
        if (live) live.remove();
        fig.style.width = fig.style.height = '';
        fig.style.removeProperty('--rpd-hb');
        root.classList.remove('is-live');
        if (fig.dataset.rpdAdded) {
            fig.removeAttribute('tabindex');
            fig.removeAttribute('role');
            if (fig.dataset.rpdLabel) fig.removeAttribute('aria-label');
            delete fig.dataset.rpdAdded;
            delete fig.dataset.rpdLabel;
        }
        delete root.rainPond;
    }
    root.rainPond = {
        destroy,
        get progress() { return progress; },
        // let a drop fall at (x, y), fractions of the water; size in mm
        drop(x = 0.5, y = 0.5, mm = 3.4) { if (gl && !calm.matches) drop(clamp(x) * cols, clamp(y) * rows, mm, 'tap'); },
        get state() { return { ms: +scriptMs.toFixed(2), rings: rings.length, cols, rows, maxS, maxV, rough, sat, flat, raf: !!raf, visible }; },
    };
    return destroy;
}

function autoStart(el) {
    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((en) => {
        if (!en[0].isIntersecting) return;
        io.disconnect();
        rainPond(el);
    }, { rootMargin: '800px' });
    io.observe(el);
}
document.querySelectorAll('[data-rain-pond]').forEach(autoStart);
