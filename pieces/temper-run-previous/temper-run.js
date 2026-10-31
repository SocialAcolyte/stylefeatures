/*
 *  TEMPER-RUN // a progress bar that is a ground steel chisel being tempered.
 *
 *  Markup:  <div data-temper-run><progress value="0" max="100" aria-label="Uploading"></progress></div>
 *  Or call  temperRun(el, options)  yourself. Returns destroy(), which also
 *  carries .value, .max, .indeterminate, .reset(), .state and .front.
 *
 *  Heat goes into the shank from off the page. It runs along the bar (a 1D
 *  heat equation, solved implicitly), the steel oxidises wherever it is hot (a
 *  parabolic Arrhenius law, d^2 = k0 t exp(-Q/RT), integrated in time so the
 *  film only ever thickens), and the oxide's thickness decides its colour:
 *  thin-film interference in magnetite on iron, computed here from complex
 *  refractive indices and the CIE 1931 observer under D65. Nothing in the
 *  colour sequence is a hand palette. The only sign of the heat itself is the
 *  shank's own dull red, from Planck's law through the same observer.
 *
 *  The value sets where the straw band must stand. The heat is a
 *  model-predictive controller: each frame it asks "if the heat were taken
 *  away now, where would the straw stop?" and backs off as that answer reaches
 *  the target, as a smith does, because the colours keep running on stored
 *  heat. At the maximum, once straw reaches the cutting edge, the chisel is
 *  quenched: the red goes out, the face comes up dark with water and dries
 *  off from the shank towards the edge, and the colours stay where they stood.
 *
 *  Values only go forward (oxide does not shrink). A lower value, or reset(),
 *  brings a fresh blank. No value attribute on the <progress> = indeterminate:
 *  a low heat wanders slowly up and down the bar.
 *
 *  Without JS it is the native <progress>. rAF runs only while something
 *  moves; offscreen or in a hidden tab the clock stops. Reduced motion: the
 *  bar is drawn straight at the colours for the value.
 */

const calm = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false, addEventListener() {} };
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

/* ---- optical data, 380..780 nm every 10 nm ---------------------------------
 * CIE 1931 2 degree colour-matching functions: CVRL (cvrl.org, ciexyz31.csv),
 * sampled every 10 nm. D65 relative SPD: CIE 15, via colour-science.
 * Iron: Johnson & Christy, Phys. Rev. B 9, 5056 (1974). Magnetite (Fe3O4):
 * Querry, CRDC-CR-85034 (1985). Both via refractiveindex.info, interpolated.
 */
const CMF_X = [0.001368,0.004243,0.01431,0.04351,0.1344,0.2839,0.3483,0.3362,0.2908,0.1954,0.09564,0.03201,0.0049,0.0093,0.06327,0.1655,0.2904,0.4334,0.5945,0.7621,0.9163,1.026,1.062,1.003,0.8545,0.6424,0.4479,0.2835,0.1649,0.0874,0.04677,0.0227,0.01136,0.005790,0.002899,0.001440,0.000690,0.000332,0.000166,0.0000831,0.0000415];
const CMF_Y = [3.9e-05,0.00012,0.000396,0.00121,0.004,0.0116,0.023,0.038,0.06,0.09098,0.139,0.208,0.323,0.503,0.71,0.862,0.954,0.995,0.995,0.952,0.87,0.757,0.631,0.503,0.381,0.265,0.175,0.107,0.061,0.032,0.017,0.00821,0.004102,0.002091,0.001047,0.00052,0.000249,0.00012,0.00006,0.00003,0.000015];
const CMF_Z = [0.00645,0.02005,0.06785,0.2074,0.6456,1.386,1.747,1.772,1.669,1.288,0.813,0.4652,0.272,0.1582,0.07825,0.04216,0.0203,0.00875,0.0039,0.0021,0.00165,0.0011,0.0008,0.00034,0.00019,0.00005,0.00002,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
const D65 = [49.98,54.65,82.75,91.49,93.43,86.68,104.9,117,117.8,114.9,115.9,108.8,109.4,107.8,104.8,107.7,104.4,104,100,96.33,95.79,88.69,90.01,89.6,87.7,83.29,83.7,80.03,80.21,82.28,78.28,69.72,71.61,74.35,61.6,69.89,75.09,63.59,46.42,66.81,63.38];
const FE_N=[2.11,2.19,2.26,2.33,2.4,2.47,2.53,2.58,2.63,2.67,2.7,2.72,2.76,2.81,2.86,2.89,2.92,2.95,2.95,2.94,2.94,2.93,2.91,2.89,2.88,2.89,2.9,2.91,2.92,2.91,2.89,2.88,2.87,2.86,2.86,2.87,2.87,2.87,2.87,2.89,2.9];
const FE_K=[2.49,2.54,2.59,2.64,2.67,2.71,2.74,2.77,2.79,2.82,2.84,2.87,2.88,2.9,2.91,2.92,2.92,2.93,2.95,2.97,2.99,3,3.02,3.04,3.05,3.07,3.08,3.09,3.1,3.12,3.14,3.16,3.18,3.2,3.22,3.23,3.25,3.27,3.29,3.3,3.32];
const OX_N=[2.459,2.464,2.462,2.453,2.44,2.423,2.404,2.386,2.374,2.367,2.365,2.364,2.359,2.354,2.349,2.346,2.344,2.343,2.342,2.342,2.342,2.344,2.346,2.35,2.353,2.358,2.366,2.366,2.363,2.364,2.362,2.359,2.355,2.349,2.343,2.336,2.329,2.32,2.312,2.303,2.294];
const OX_K=[0.096,0.08,0.062,0.047,0.034,0.026,0.026,0.032,0.042,0.054,0.063,0.067,0.071,0.077,0.083,0.091,0.099,0.105,0.112,0.118,0.125,0.131,0.136,0.141,0.144,0.148,0.145,0.138,0.137,0.135,0.131,0.127,0.124,0.122,0.12,0.119,0.118,0.118,0.119,0.12,0.123];

const LAMBDA = CMF_Y.map((_, i) => 380 + 10 * i);

// XYZ (D65 white) to linear sRGB, IEC 61966-2-1
const toRGB = (X, Y, Z) => [
    3.2406 * X - 1.5372 * Y - 0.4986 * Z,
    -0.9689 * X + 1.8758 * Y + 0.0415 * Z,
    0.0557 * X - 0.2040 * Y + 1.0570 * Z,
];

/* ---- complex arithmetic, just enough for Fresnel ------------------------- */
const cx = (re, im = 0) => ({ re, im });
const cadd = (a, b) => cx(a.re + b.re, a.im + b.im);
const csub = (a, b) => cx(a.re - b.re, a.im - b.im);
const cmul = (a, b) => cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const cdiv = (a, b) => { const q = b.re * b.re + b.im * b.im; return cx((a.re * b.re + a.im * b.im) / q, (a.im * b.re - a.re * b.im) / q); };
const cabs2 = (a) => a.re * a.re + a.im * a.im;
const csqrt = (a) => {
    const m = Math.hypot(a.re, a.im);
    let re = Math.sqrt((m + a.re) / 2), im = Math.sqrt(Math.max(0, (m - a.re) / 2));
    if (a.im < 0) im = -im;
    return cx(re, im);
};

/* ---- the film -------------------------------------------------------------
 * Air | magnetite, thickness d | iron. Airy summation for one layer:
 *   r = (r01 + r12 e^{2i beta}) / (1 + r01 r12 e^{2i beta}),  beta = 2 pi n1 cos(t1) d / lambda
 * with complex n1, n2 and complex cosines (Snell), for s and p, averaged over
 * a cone of incidence (a ground bar seen in a room is lit from many angles).
 * Above COH_D the film is let go incoherent (see README: thick films roughen
 * and grow hematite, and real steel never shows the third-order colours a
 * perfect film would).
 */
export const FILM = { cohD: 80, cohW: 34, rough: 0.3 };

function filmR(d, j, sin0, cos0, pol) {
    const n1 = cx(OX_N[j], OX_K[j]), n2 = cx(FE_N[j], FE_K[j]);
    const s2 = sin0 * sin0;
    const c1 = csqrt(csub(cx(1), cdiv(cx(s2), cmul(n1, n1))));
    const c2 = csqrt(csub(cx(1), cdiv(cx(s2), cmul(n2, n2))));
    const n0c0 = cx(cos0), n1c1 = cmul(n1, c1), n2c2 = cmul(n2, c2);
    let r01, r12;
    if (pol === 0) {
        r01 = cdiv(csub(n0c0, n1c1), cadd(n0c0, n1c1));
        r12 = cdiv(csub(n1c1, n2c2), cadd(n1c1, n2c2));
    } else {
        const a = cmul(n1, cx(cos0)), b = c1, e = cmul(n2, c1), f = cmul(n1, c2);
        r01 = cdiv(csub(a, b), cadd(a, b));
        r12 = cdiv(csub(e, f), cadd(e, f));
    }
    const k = 4 * Math.PI * d / LAMBDA[j];                    // 2 beta = k * n1 c1
    const ph = cmul(cx(k), n1c1);
    const amp = Math.exp(-ph.im);
    const e2 = cx(amp * Math.cos(ph.re), amp * Math.sin(ph.re));
    const num = cadd(r01, cmul(r12, e2));
    const den = cadd(cx(1), cmul(cmul(r01, r12), e2));
    const Rcoh = cabs2(cdiv(num, den));
    const R01 = cabs2(r01), R12 = cabs2(r12), A = amp * amp;
    const Rinc = R01 + (1 - R01) * (1 - R01) * R12 * A / (1 - R01 * R12 * A);
    const c = d <= FILM.cohD ? 1 : Math.exp(-(((d - FILM.cohD) / FILM.cohW) ** 2));
    // a thick scale is rough: light scattered out of the mirror direction (Debye-Waller,
    // sigma growing with the film past cohD) is lost to the eye, so heavy scale goes dark
    const sg = d > FILM.cohD ? FILM.rough * (d - FILM.cohD) : 0;
    const dw = sg ? Math.exp(-((4 * Math.PI * sg / LAMBDA[j]) ** 2)) : 1;
    // Past the grey band the film becomes mill scale: thick, rough, porous Fe3O4/FeO that
    // traps and scatters light, so the steel goes dark grey-black, a touch bluish (it holds
    // a little more of the short wavelengths). Phenomenological: from 110 nm to 900 nm the
    // specular reflectance falls by about two thirds more: gunmetal to black, graded.
    const sc = smooth(110, 900, d) ** 0.7;
    const tint = 1 + 0.35 * (560 - LAMBDA[j]) / 180;
    return (c * Rcoh + (1 - c) * Rinc) * (0.25 + 0.75 * dw) * (1 - sc * (1 - 0.32 * tint));
}

let Ynorm = 0;
function spectrumToRGB(R) {
    if (!Ynorm) for (let j = 0; j < LAMBDA.length; j++) Ynorm += CMF_Y[j] * D65[j];
    let X = 0, Y = 0, Z = 0;
    for (let j = 0; j < LAMBDA.length; j++) {
        const w = D65[j] * R[j];
        X += CMF_X[j] * w; Y += CMF_Y[j] * w; Z += CMF_Z[j] * w;
    }
    return toRGB(X / Ynorm, Y / Ynorm, Z / Ynorm);
}

/** Linear-sRGB colour of steel carrying `d` nm of oxide, seen through a cone of angles (degrees). */
export function oxideColour(d, from = 0, to = 30, steps = 4) {
    const R = new Array(LAMBDA.length).fill(0);
    let wsum = 0;
    for (let a = 0; a < steps; a++) {
        const th = (from + (to - from) * (steps > 1 ? a / (steps - 1) : 0)) * Math.PI / 180;
        const w = Math.sin(th) + 0.05;                         // solid angle of the ring, never zero
        const s = Math.sin(th), c = Math.cos(th);
        for (let j = 0; j < LAMBDA.length; j++) R[j] += w * (filmR(d, j, s, c, 0) + filmR(d, j, s, c, 1)) / 2;
        wsum += w;
    }
    for (let j = 0; j < R.length; j++) R[j] /= wsum;
    return spectrumToRGB(R).map((v) => Math.max(0, v));
}

/* Thickness to colour table: 0.5 nm steps to 200 nm, then 5 nm steps to 1000. */
const LUT_FINE = 200, LUT_STEP = 0.5, LUT_MAX = 1000, LUT_COARSE = 5;
const LUT_N = LUT_FINE / LUT_STEP + (LUT_MAX - LUT_FINE) / LUT_COARSE + 1;
let LUT = null;
// Three tables for three cones of incidence (0-22, 18-40, 34-56 degrees): the colour shifts a
// little toward the blue as the steel is seen more obliquely. Each is then smeared along d by
// the film's own unevenness: on a ground face it grows a little thicker in the scratch valleys
// and thinner on the burnished ridges (a relative spread of about 10%, plus 0.8 nm).
const ANGLES = [[0, 22], [18, 40], [34, 56]];
function lut() {
    if (LUT) return LUT;
    const tabs = ANGLES.map(([a, b]) => {
        const raw = new Float32Array(LUT_N * 3);
        for (let i = 0; i < LUT_N; i++) raw.set(oxideColour(lutD(i), a, b, 4), i * 3);
        const out = new Float32Array(LUT_N * 3), tmp = [0, 0, 0];
        const Z = [-1.5, -0.75, 0, 0.75, 1.5], W = [0.1, 0.24, 0.32, 0.24, 0.1];
        for (let i = 0; i < LUT_N; i++) {
            const d = lutD(i), sg = 0.1 * d + 0.8;
            for (let k = 0; k < 5; k++) {
                sampleLUT(raw, Math.max(0, d + Z[k] * sg), tmp, 0);
                out[i * 3] += W[k] * tmp[0]; out[i * 3 + 1] += W[k] * tmp[1]; out[i * 3 + 2] += W[k] * tmp[2];
            }
        }
        return out;
    });
    return (LUT = tabs);
}
const lutD = (i) => i <= LUT_FINE / LUT_STEP ? i * LUT_STEP : LUT_FINE + (i - LUT_FINE / LUT_STEP) * LUT_COARSE;
function lutIndex(d) {
    if (d <= LUT_FINE) return d / LUT_STEP;
    return Math.min(LUT_N - 1, LUT_FINE / LUT_STEP + (d - LUT_FINE) / LUT_COARSE);
}
function sampleLUT(tab, d, out, o) {
    const f = lutIndex(d), i = Math.min(LUT_N - 2, f | 0), t = f - i;
    out[o] = tab[i * 3] + (tab[i * 3 + 3] - tab[i * 3]) * t;
    out[o + 1] = tab[i * 3 + 1] + (tab[i * 3 + 4] - tab[i * 3 + 1]) * t;
    out[o + 2] = tab[i * 3 + 2] + (tab[i * 3 + 5] - tab[i * 3 + 2]) * t;
}

/* ---- incandescence --------------------------------------------------------
 * Planck's law through the same observer. Only the overall exposure is chosen
 * (GLOW_AT_900K, the red channel at 627 C, as in a dim workshop); how fast the
 * glow rises with temperature, and its hue, are Planck's.
 */
const GLOW_AT_900K = 0.1;
let PLANCK = null;
function planck() {
    if (PLANCK) return PLANCK;
    const c2 = 1.4388e7;                                       // nm K
    const rgbAt = (T) => {
        let X = 0, Y = 0, Z = 0;
        for (let j = 0; j < LAMBDA.length; j++) {
            const l = LAMBDA[j];
            const B = 1 / (l ** 5 * (Math.exp(c2 / (l * T)) - 1));
            X += CMF_X[j] * B; Y += CMF_Y[j] * B; Z += CMF_Z[j] * B;
        }
        return toRGB(X, Y, Z);
    };
    const k = GLOW_AT_900K / rgbAt(900)[0];
    const tab = new Float32Array(141 * 3);                     // 700..1400 K, 5 K steps
    for (let i = 0; i <= 140; i++) {
        const c = rgbAt(700 + i * 5);
        // the hue (out of gamut at low T) is clipped to the red edge, keeping luminance roughly
        tab[i * 3] = Math.max(0, c[0] * k); tab[i * 3 + 1] = Math.max(0, c[1] * k); tab[i * 3 + 2] = Math.max(0, c[2] * k);
    }
    return (PLANCK = tab);
}
function glowAt(T, out, o) {
    if (T < 760) { out[o] = out[o + 1] = out[o + 2] = 0; return; }
    const tab = planck(), f = clamp((T - 700) / 5, 0, 139.999), i = f | 0, t = f - i;
    for (let c = 0; c < 3; c++) out[o + c] = tab[i * 3 + c] + (tab[i * 3 + 3 + c] - tab[i * 3 + c]) * t;
}

/* ---- the bar --------------------------------------------------------------
 * 1D heat equation with fin losses (convection + grey radiation), backward
 * Euler on cells of 1 mm, insulated ends:
 *   dT/dt = alpha d2T/dx2 - beta(T) (T - Ta) + u S(x)
 * Oxide: d^2 grows by k0 exp(-Q / R T) dt in every cell (parabolic law).
 * Units: mm, s, K, nm.
 */
export const STEEL = {
    L: 110,             // mm, bar length (shank to cutting edge)
    N: 110,             // cells
    alpha: 13,          // mm^2/s, carbon steel (k 50 W/mK, rho 7850, c 490)
    Ta: 293,            // K, the room
    hc: 12,             // W/m^2K, free convection
    eps: 0.55,          // emissivity of lightly oxidised steel
    PA: 476,            // 1/m, perimeter / area of a 14 x 6 mm bar
    rhoC: 7850 * 490,   // J/m^3K
    Q: 70e3,            // J/mol, activation energy (fitted, see README)
    k0: 2.17e7,         // nm^2/s, pre-factor (fitted, see README)
    torchX: 9,          // mm, where the flame plays
    torchW: 6,          // mm, its 1/e half-width
    torchS: 90,         // K/s, peak heating rate at full flame
    Tcap: 840,          // K, the smith keeps the shank below a dull red (567 C), short of scaling
    Tidle: 528,         // K, the wandering torch's ceiling (indeterminate)
    dFront: 18,         // nm, "straw": where the band front is read
    Q2: 200e3,          // J/mol, high-temperature scaling regime (order of the literature for FeO growth)
    k2: 1.5e16,         // nm^2/s, its pre-factor (estimate, see README)
};
const Rgas = 8.314, SIGMA = 5.67e-8;
// Two parabolic regimes: the thin temper film (fitted to the temper chart), and above
// about 570 C the fast wustite-bearing scale, which the low-temperature law badly
// underestimates (Q2, k2 chosen so scale grows of order a micrometre a minute at 600 C).
export const growthRate = (T) => STEEL.k0 * Math.exp(-STEEL.Q / (Rgas * T)) + STEEL.k2 * Math.exp(-STEEL.Q2 / (Rgas * T));   // nm^2/s

function makeBar() {
    const N = STEEL.N;
    return { T: new Float64Array(N).fill(STEEL.Ta), D2: new Float64Array(N), a: new Float64Array(N), b: new Float64Array(N), r: new Float64Array(N) };
}
function stepBar(bar, dt, u, torchX) {
    const { N, L, alpha, Ta, hc, eps, PA, rhoC, torchW, torchS } = STEEL;
    const dx = L / N, r = alpha * dt / (dx * dx);
    const T = bar.T, cp = bar.a, dp = bar.b, rhs = bar.r;
    // Thomas algorithm, constant off-diagonals -r
    let prevC = 0, prevD = 0;
    for (let i = 0; i < N; i++) {
        const Ti = T[i];
        const h = hc + eps * SIGMA * (Ti * Ti + Ta * Ta) * (Ti + Ta);
        const beta = h * PA / rhoC;
        const x = (i + 0.5) * dx;
        const src = u > 0 ? u * torchS * Math.exp(-(((x - torchX) / torchW) ** 2)) : 0;
        const diag = 1 + beta * dt + (i === 0 || i === N - 1 ? r : 2 * r);
        const d = Ti + dt * (src + beta * Ta);
        const m = diag - (i ? -r * prevC : 0);
        prevC = i < N - 1 ? -r / m : 0;
        prevD = (d - (i ? -r * prevD : 0)) / m;
        cp[i] = prevC; dp[i] = prevD;
    }
    const D2 = bar.D2;
    let Tn = dp[N - 1];
    for (let i = N - 1; i >= 0; i--) {
        if (i < N - 1) Tn = dp[i] - cp[i] * Tn;
        const Tmid = 0.5 * (T[i] + Tn);
        if (Tmid > 340) D2[i] += growthRate(Tmid) * dt;
        rhs[i] = Tn;
    }
    T.set(rhs);
}
function frontOf(D2) {
    const { N, L, dFront } = STEEL, dx = L / N, f2 = dFront * dFront;
    if (D2[N - 1] >= f2) return L;
    for (let i = N - 2; i >= 0; i--) {
        if (D2[i] >= f2) {
            const a = Math.sqrt(D2[i]), b = Math.sqrt(D2[i + 1]);
            return (i + 0.5 + clamp((a - dFront) / Math.max(1e-6, a - b))) * dx;
        }
    }
    return 0;
}
const maxT = (T) => { let m = 0; for (let i = 0; i < T.length; i++) if (T[i] > m) m = T[i]; return m; };

// "if the flame went away now": coast for six minutes of bar time
const scratch = makeBar();
function forecast(bar) {
    scratch.T.set(bar.T); scratch.D2.set(bar.D2);
    for (let k = 0; k < 24; k++) stepBar(scratch, 15, 0, 0);
    return frontOf(scratch.D2);
}

/** The bar model, for tests and tools. */
export const sim = { makeBar, stepBar, frontOf, forecast, maxT, glowAt };

/* Bands, for names. Thicknesses read off the computed colours (see README). */
export const BANDS = [
    [0, 'bright steel'], [11, 'pale straw'], [18, 'straw'], [25, 'dark straw'], [29, 'brown'],
    [34, 'bronze-purple'], [38, 'purple'], [44, 'dark blue'], [50, 'blue'], [60, 'pale blue'], [84, 'grey'],
];
export const bandName = (d) => { let n = BANDS[0][1]; for (const [t, s] of BANDS) if (d >= t) n = s; return n; };
/** Temperature (K) at which a hold of `seconds` grows `d` nm, by the same law. */
export const temperatureFor = (d, seconds = 300) => STEEL.Q / (Rgas * Math.log(STEEL.k0 * seconds / (d * d)));

/* ---- rendering helpers ---------------------------------------------------- */
const ENC = (() => {                     // linear 0..1 -> sRGB byte, 4096 entries
    const t = new Uint8ClampedArray(4097);
    for (let i = 0; i <= 4096; i++) {
        const c = i / 4096;
        t[i] = Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055));
    }
    return t;
})();
const enc = (v) => ENC[v <= 0 ? 0 : v >= 1 ? 4096 : (v * 4096) | 0];

function rng(seed) {                     // mulberry32
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/* ---- the component -------------------------------------------------------- */
const DEFAULTS = { variant: 'bar', done: 'Done', rate: 15, sheen: 0.62 };
const RATE_MAX = 480;                     // bar-seconds per second while catching up

export function temperRun(el, opts = {}) {
    if (el.__temperRun) el.__temperRun();
    const ds = el.dataset;
    const cfg = {
        variant: opts.variant ?? ds.variant ?? DEFAULTS.variant,
        done: opts.done ?? ds.done ?? DEFAULTS.done,
        rate: +(opts.rate ?? ds.rate ?? DEFAULTS.rate),
        seed: +(opts.seed ?? ds.seed ?? 0) || ((Math.random() * 2 ** 31) | 0),
        sheen: +(opts.sheen ?? ds.sheen ?? DEFAULTS.sheen),
        label: opts.label ?? ds.label ?? null,
    };
    const thin = cfg.variant === 'thin';
    const ac = new AbortController();
    const on = (t, type, fn, o) => t.addEventListener(type, fn, { signal: ac.signal, ...o });

    // native progress: the no-JS fallback, and the source of truth for value/max
    let prog = el.querySelector('progress');
    const madeProg = !prog;
    if (!prog) { prog = document.createElement('progress'); prog.max = 100; prog.value = 0; el.append(prog); }

    el.classList.add('tr');
    if (thin) el.classList.add('tr--thin');
    const before = { role: el.getAttribute('role'), label: el.getAttribute('aria-label'), lb: el.getAttribute('aria-labelledby') };
    el.setAttribute('role', 'progressbar');
    el.setAttribute('aria-valuemin', '0');
    if (!el.hasAttribute('aria-label') && !el.hasAttribute('aria-labelledby')) {
        // a name on the <progress> itself (which also serves without JS) moves up to the wrapper
        if (!cfg.label && prog.hasAttribute('aria-labelledby')) el.setAttribute('aria-labelledby', prog.getAttribute('aria-labelledby'));
        else el.setAttribute('aria-label', cfg.label || prog.getAttribute('aria-label') || 'Progress');
    }
    prog.setAttribute('aria-hidden', 'true');
    prog.tabIndex = -1;

    const canvas = document.createElement('canvas');
    canvas.className = 'tr-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    const live = document.createElement('span');
    live.className = 'tr-live';
    live.setAttribute('aria-live', 'polite');
    el.append(canvas);
    // the live region sits beside the bar, not in it: a progressbar's children are presentational
    el.after(live);
    const ctx = canvas.getContext('2d');
    const steel = document.createElement('canvas');      // the chisel alone, composited over its shadow
    const sctx = steel.getContext('2d');

    // ---- state
    let bar = makeBar();
    let state = 'cold';                   // cold | heating | coasting | resting | quenched | wandering
    let u = 0, uSeen = 0;
    let torchX = STEEL.torchX;
    let front = 0;                        // mm
    let quenched = false;
    let qT = null, qt = 9;                // the temperatures at the quench, and the time since
    let wet = null;                       // per cell: when the quench water dries off there
    let wanderT = 0;
    let raf = 0, last = 0, visible = true, manual = false;
    let fade = null;                      // { img, t } crossfade when a fresh blank comes in
    let sheenX = cfg.sheen, sheenTo = cfg.sheen;
    const rand = rng(cfg.seed);

    const read = () => {
        const max = +prog.getAttribute('max') || 1;
        const hasV = prog.hasAttribute('value');
        return { max, ind: !hasV, p: hasV ? clamp((+prog.getAttribute('value') || 0) / max) : 0 };
    };
    let want = read();

    const pFront = () => clamp((front - STEEL.torchX) / (STEEL.L - STEEL.torchX));
    const targetX = (p) => (p <= 0 ? 0 : STEEL.torchX + p * (STEEL.L - STEEL.torchX));

    function setState(s) {
        if (s === state) return;
        const from = state;
        state = s;
        el.dataset.state = s;
        el.dispatchEvent(new CustomEvent('temper-run:state', { bubbles: true, detail: { state: s, from } }));
    }

    function aria() {
        const { p, ind, max } = want;
        el.setAttribute('aria-valuemax', String(max));
        if (ind) { el.removeAttribute('aria-valuenow'); el.removeAttribute('aria-valuetext'); }
        else {
            el.setAttribute('aria-valuenow', String(Math.round(p * max * 100) / 100));
            el.setAttribute('aria-valuetext', p >= 1 ? cfg.done : `${Math.round(p * 100)}%`);
        }
    }

    /* ---- control: one frame of bar time ---- */
    function control() {
        if (want.ind) { u = 1; return; }                  // the ceiling in advance() holds it at Tidle
        const xT = targetX(want.p);
        if (xT <= 0 || quenched) { u = 0; return; }
        const goal = want.p >= 1 ? STEEL.L + 3 : xT;      // at the end, aim a little past the edge
        const coast = forecast(bar);
        u = clamp((goal - coast - 0.5) / 5);              // half a millimetre of dead band: no flicker at rest
    }

    function advance(simDt) {
        const n = Math.max(1, Math.ceil(simDt / 1.5));
        // the smith never lets the shank go past a dull red: the heat is eased off per step
        const cap = want.ind ? STEEL.Tidle : STEEL.Tcap;
        let used = 0;
        for (let k = 0; k < n; k++) {
            const ue = u * clamp((cap - maxT(bar.T)) / 25);
            used += ue / n;
            stepBar(bar, simDt / n, ue, torchX);
        }
        uSeen = used;
        front = frontOf(bar.D2);
    }

    const lagMM = () => (want.ind ? 0 : Math.max(0, targetX(want.p) - front));

    function freshBlank(animate) {
        if (animate && PW) {
            const img = document.createElement('canvas');
            img.width = PW; img.height = PH;
            img.getContext('2d').drawImage(steel, 0, 0);
            fade = { img, t: 0 };
        }
        bar = makeBar(); front = 0; quenched = false; u = 0; uSeen = 0; qT = null; qt = 9; wet = null;
        setState('cold');
    }

    function quench(animate) {
        quenched = true;
        if (animate) {
            qT = Float64Array.from(bar.T); qt = 0;
            // The chisel comes out of the water wet, and a wet face is a darker one (the film
            // fills the grind, so less light is scattered back). The heat still in the steel
            // drives the film off, the hottest stretch first; the edge, coolest, dries last.
            wet = new Float32Array(STEEL.N);
            for (let i = 0; i < STEEL.N; i++) wet[i] = 0.3 + 2.1 * (1 - clamp((bar.T[i] - 330) / 260)) ** 1.4;
        }
        bar.T.fill(STEEL.Ta);
        u = 0;
        setState('quenched');
        live.textContent = cfg.done;
        el.dispatchEvent(new CustomEvent('temper-run:quench', { bubbles: true, detail: { front: front / STEEL.L } }));
    }

    // jump straight to the state for the value (reduced motion, first paint)
    function fastForward() {
        sheenX = sheenTo;
        if (!want.ind && targetX(want.p) > 0) {
            let it = 0;
            while (it++ < 4000) {
                if (it % 3 === 1) control();
                if (want.p >= 1 && front >= STEEL.L - 0.6) break;
                if (u <= 0.001 && it > 2) {
                    const c = forecast(bar);
                    if (c - front < 0.3 || c >= targetX(want.p) - 0.3) { coastOut(); break; }
                }
                advance(2);
            }
        }
        if (want.p >= 1 && !want.ind && !quenched) quench(false);
        qT = null; wet = null; fade = null;
        setState(quenched ? 'quenched' : front > 0 ? 'resting' : 'cold');
        render();
    }
    function coastOut() { for (let k = 0; k < 24; k++) stepBar(bar, 15, 0, 0); front = frontOf(bar.D2); }

    /* ---- the frame ---- */
    function tick(now) {
        raf = 0;
        const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
        last = now;
        frame(dt);
    }
    function frame(dt) {
        let busy = false;
        if (want.ind) {
            wanderT += dt;
            torchX = STEEL.L * (0.1 + 0.8 * (0.5 - 0.5 * Math.cos(wanderT * 2 * Math.PI / 11)));
            control();
            advance(dt * cfg.rate);
            setState('wandering');
            // left long enough, the wandering heat takes the whole bar to blue; past that it
            // would only go grey, so a fresh blank comes in
            let dm = 0; for (let i = 0; i < STEEL.N; i++) dm += Math.sqrt(bar.D2[i]);
            if (dm / STEEL.N > 52) freshBlank(true);
            busy = true;
        } else if (!quenched) {
            torchX = mix(torchX, STEEL.torchX, clamp(dt * 3));
            control();
            const lag = lagMM();
            const rate = clamp(cfg.rate * (1 + lag / 2.5), cfg.rate, RATE_MAX);
            uSeen = 0;
            if (u > 0.01 || lag > 0.6 || maxT(bar.T) > 760) {
                advance(dt * rate);
                if (uSeen > 0.06) setState('heating'); else if (uSeen < 0.01) setState('coasting');
                busy = true;
            }
            if (want.p >= 1 && front >= STEEL.L - 0.6) quench(true);
            else if (!busy || (u <= 0.01 && lag <= 0.6)) {
                // settled: nothing visible will change; let the clock stop
                if (maxT(bar.T) < 760) { setState(front > 0 ? 'resting' : 'cold'); busy = false; }
                else busy = true;
            }
        }
        if (qT) { qt += dt; if (qt > 1.2) qT = null; else busy = true; }
        if (wet) { if (!qT) qt += dt; if (qt > WET_LIFE) wet = null; else busy = true; }
        if (fade) { fade.t += dt / 0.45; if (fade.t >= 1) fade = null; else busy = true; }
        if (Math.abs(sheenTo - sheenX) > 0.001) { sheenX = mix(sheenX, sheenTo, clamp(dt * 8)); busy = true; } else sheenX = sheenTo;
        render();
        if (busy) wake();
    }
    function wake() {
        if (raf || manual || !visible || document.hidden) return;
        // reduced motion: the state was settled by fastForward(); only the sheen moves, instantly
        if (calm.matches) { sheenX = sheenTo; render(); return; }
        raf = requestAnimationFrame(tick);
    }

    /* ---- geometry and the static light field ---- */
    let bw = 0, barH = 0, pt = 0, pb = 0, ps = 0, dpr = 1;   // CSS px
    let PW = 0, PH = 0;                                       // device px of the bar box
    let rowShift = null, amb = null, spec = null, zone = null, cov = null, fz = null, jit = null, nu = null, mot = null, img = null, glow = null, shade = null;
    let sAc = null, angC = null, S = null; const cols = [];

    function layout() {
        const r = el.getBoundingClientRect();
        barH = r.height; bw = r.width;
        if (!bw || !barH) return;
        pt = thin ? 3 : Math.round(Math.max(14, barH * 0.6));    // room for the shadow's spread
        pb = thin ? 4 : Math.round(Math.max(16, barH * 0.75));  // the shadow on the paper
        ps = thin ? 3 : Math.round(Math.max(14, barH * 0.6));
        dpr = Math.min(2, window.devicePixelRatio || 1);
        Object.assign(canvas.style, { left: -ps + 'px', top: -pt + 'px', width: bw + 2 * ps + 'px', height: barH + pt + pb + 'px' });
        canvas.width = Math.round((bw + 2 * ps) * dpr);
        canvas.height = Math.round((barH + pt + pb) * dpr);
        PW = Math.max(2, Math.round(bw * dpr)); PH = Math.max(2, Math.round(barH * dpr));
        steel.width = PW; steel.height = PH;
        lightField();
        render();
    }

    // Per-pixel geometry and lighting of the chisel, computed once per size. The blank is seen
    // from above and a little in front, so its thickness shows as a narrow side face below the
    // ground top face. Left: a forged shank end, narrower and a little irregular, black from
    // the forge. Right: the bevel, ground on top, dropping toward the cutting edge.
    //   zone: 0 face, 1 back arris, 2 front arris (rounded), 3 bevel, 4 side face, 5 forged shank
    function lightField() {
        const n = PW * PH;
        amb = new Float32Array(n); spec = new Float32Array(n); zone = new Uint8Array(n); cov = new Float32Array(n);
        jit = new Float32Array(n); nu = new Float32Array(n); mot = new Float32Array(n); fz = new Float32Array(n);
        img = new ImageData(PW, PH);
        for (let k = 0; k < 6; k++) cols[k] = new Float32Array(PW * 3);
        glow = new Float32Array(PW * 3); sAc = new Float32Array(PW); angC = new Float32Array(PW); S = new Float32Array(PW);
        const R = rng(cfg.seed ^ 0x51ab);
        // grind: a belt-ground face, long nearly horizontal scratches over a row-wise grain
        const grind = new Float32Array(n);
        const rowG = new Float32Array(PH);
        let carry = 0;
        for (let y = 0; y < PH; y++) { carry = carry * 0.45 + (R() - 0.5); rowG[y] = carry * 0.04 + (R() - 0.5) * 0.03; }
        const count = (n / 16) | 0;
        for (let k = 0; k < count; k++) {
            const y0 = R() * PH, x0 = R() * PW * 1.1 - PW * 0.05;
            const len = (8 + R() ** 2 * 300) * dpr, slope = (R() - 0.5) * 0.004;
            const amp = (R() < 0.6 ? 1 : -0.6) * (0.03 + 0.15 * R() ** 3);
            for (let s = 0; s < len; s++) {
                const x = (x0 + s) | 0; if (x < 0 || x >= PW) continue;
                const y = (y0 + s * slope) | 0; if (y < 0 || y >= PH) continue;
                grind[y * PW + x] += amp * Math.sin(Math.PI * s / len);
            }
        }
        // mottle: low-frequency blotches for forge scale (bilinear value noise, two octaves)
        const blot = (cell) => {
            const gw = Math.ceil(PW / cell) + 2, gh = Math.ceil(PH / cell) + 2, g = new Float32Array(gw * gh);
            for (let i = 0; i < g.length; i++) g[i] = R();
            return (x, y) => {
                const fx = x / cell, fy = y / cell, ix = fx | 0, iy = fy | 0, tx = fx - ix, ty = fy - iy;
                const a = g[iy * gw + ix], b = g[iy * gw + ix + 1], c = g[(iy + 1) * gw + ix], d = g[(iy + 1) * gw + ix + 1];
                return mix(mix(a, b, tx), mix(c, d, tx), ty);
            };
        };
        const m1 = blot(Math.max(3, PH * 0.22)), m2 = blot(Math.max(2, PH * 0.07));
        const colG = new Float32Array(PW);
        { let c = 0; for (let x = 0; x < PW; x++) { c = c * 0.3 + (R() - 0.5); colG[x] = c * 0.16; } }
        const room = new Float32Array(PW);         // a soft variation of the room seen along the steel
        const f1 = R() * 6, f2 = R() * 6;
        for (let x = 0; x < PW; x++) { const t = x / PW; room[x] = 1 + 0.05 * Math.sin(t * 5.1 + f1) + 0.03 * Math.sin(t * 13.7 + f2); }
        // ---- the outline, per column
        const T0 = PH * (thin ? 0.22 : 0.16);                       // the side face, foreshortened
        const fT0 = PH * 0.03, fB0 = PH * 0.98 - T0, sB = PH * 0.98;
        const bevL = Math.min(PW * 0.12, PH * (thin ? 2.4 : 1.25)), bev0 = PW - bevL;
        const tangL = thin ? Math.min(PW * 0.05, PH * 2) : PW * 0.06;
        const ragged = new Float32Array(PH);
        { const q = R() * 6; let c = 0; for (let y = 0; y < PH; y++) { c = c * 0.93 + (R() - 0.5) * 0.12; ragged[y] = PH * (0.14 * Math.sin(y / PH * 3.3 + q) + 0.35 * c); } }
        const endR = PH * 0.14, rad = Math.max(1, 1.5 * dpr);
        const p1 = R() * 6, p2 = R() * 6, p3 = R() * 6;
        const rA = thin ? Math.max(0.8, 0.6 * dpr) : Math.max(1.2, 1.7 * dpr), hw = Math.max(1, 0.8 * dpr);
        for (let x = 0; x < PW; x++) {
            const xm = x + 0.5;
            let top = fT0, fb = fB0, bot = sB, z0 = 0, bq = 0;
            if (xm >= bev0) { bq = (xm - bev0) / bevL; const dr = 0.93 * bq * T0; top += dr; fb += dr; z0 = 3; }
            if (xm < endR) {
                // the forged end: drawn down a little and rounded off under the hammer
                const e = endR - xm, ins = endR - Math.sqrt(Math.max(0, endR * endR - e * e));
                top += ins * 0.9 + PH * 0.01 * Math.sin(p1 + xm * 0.3 / dpr); bot -= ins * 0.7; fb = Math.min(fb, bot - 0.5);
            }
            const er = Math.max(0, rad - (PW - xm));
            if (er > 0) { const ins = rad - Math.sqrt(Math.max(0, rad * rad - er * er)); top += ins; bot -= ins; }
            const xc = clamp(Math.min(xm, PW - xm) + 0.5);
            for (let y = 0; y < PH; y++) {
                const i = y * PW + x, ym = y + 0.5;
                const c = clamp(y + 1 - top) * clamp(bot - y) * xc;
                cov[i] = c;
                if (c <= 0) continue;
                const g = grind[i] + rowG[y];
                const mo = 0.7 * m1(x, y) + 0.3 * m2(x, y);
                mot[i] = 0.6 + 0.8 * mo;
                // the grinder stopped short of the shank: forge black behind a ragged line
                const fa = smooth(-PH * 0.07, PH * 0.07, tangL + ragged[y] - xm), forged = fa > 0.5;
                fz[i] = fa;
                let z = forged ? 5 : z0, a, s, j = clamp(g * 6, -1, 1), v = 0.3;
                if (z === 5 && ym - top >= hw && ym <= fb - rA) { a = 0.55 + 0.5 * mo; s = 0.12; j = 0; v = 0.5; }
                else if (ym - top < hw) { z = 1; a = 1.6; s = 0.6; v = 0.75; }
                else if (Math.abs(ym - fb) < rA) {
                    // the front arris, rounded by the grinder: its normal turns from the window
                    // toward the camera, so a hairline catches the light and then falls away
                    const u = (ym - (fb - rA)) / (2 * rA);
                    z = 2; a = mix(1.0, 0.5, u) + 1.1 * Math.exp(-(((u - 0.3) / 0.22) ** 2)); s = 0.5; v = 0.7;
                } else if (ym > fb) {
                    const w = (ym - fb) / Math.max(1, bot - fb);
                    z = forged ? 5 : 4; a = (z === 5 ? 0.45 + 0.4 * mo : mix(0.5, 0.3, w)) * (z === 5 ? 1 : 1 + g * 0.5); s = z === 5 ? 0.08 : 0.22; v = 0.4;
                } else if (z0 === 3) {
                    const vv = (ym - top) / Math.max(1, fb - top);
                    a = mix(1.22, 1.06, vv) * (1.04 - 0.1 * bq); s = 0.85;
                    j = clamp(colG[x] + (R() - 0.5) * 0.1, -1, 1);    // honed across: its scratches run the other way
                } else {
                    const vv = (ym - top) / Math.max(1, fb - top);
                    a = mix(1.02, 0.8, vv ** 1.1) * room[x]; s = 1;
                }
                if (forged) { z = 5; s = Math.min(s, 0.15); if (a > 1) a = 0.75 + 0.25 * mo; }
                if (z === 0 || z === 3 || z === 4) {
                    const gt = z === 3 ? colG[x] * 0.5 : g;
                    a *= 1 + gt * 0.5;
                    s *= Math.max(0.15, 0.6 + gt * 2.6);
                    v = clamp(0.28 + gt * 2.5, 0.12, 0.65);   // a glinting ridge is burnished: near neutral
                }
                zone[i] = z; amb[i] = a; spec[i] = s; jit[i] = j; nu[i] = v;
            }
            // the crease where the face turns down into the bevel catches the light
            if (Math.abs(xm - bev0) < 0.75) for (let y = 0; y < PH; y++) { const i = y * PW + x; if (zone[i] === 3 || zone[i] === 0) { amb[i] *= 1.45; nu[i] = 0.7; } }
        }
        // the colour fronts are not ruled lines: the film grows a little ahead where the
        // grind is deeper, so each row runs slightly ahead or behind, and the arrises lag
        rowShift = new Int16Array(PH);
        let w1 = R() * 6, w2 = R() * 6, nz = 0;
        for (let y = 0; y < PH; y++) {
            const v = (y + 0.5) / PH;
            nz = nz * 0.96 + (R() - 0.5) * 0.04;
            // the two arrises lose heat from three faces, so the colours lag a little there
            const edge = Math.max(0, 1 - Math.min(v, 1 - v) / 0.3) ** 2;
            rowShift[y] = Math.round(PH * (0.035 * Math.sin(v * 3.4 + w1) + 0.012 * Math.sin(v * 8.9 + w2) + 0.08 * nz - 0.07 * edge));
        }
        shade = shadowOf();
    }

    // The shadow on the paper, tight and soft: a contact line where the steel's lower edge
    // meets the page, and a short penumbra from the room's overhead light.
    function shadowOf() {
        const m = document.createElement('canvas');
        m.width = PW; m.height = PH;
        const mi = new ImageData(PW, PH);
        for (let i = 0; i < PW * PH; i++) { mi.data[i * 4 + 3] = Math.round(255 * cov[i]); }
        m.getContext('2d').putImageData(mi, 0, 0);
        const pad = Math.round((thin ? 4 : Math.max(24, barH * 0.5)) * dpr);
        const c = document.createElement('canvas');
        c.width = PW + pad * 2; c.height = PH + pad * 2;
        const g = c.getContext('2d');
        const far = c.width + 100;
        const put = (blur, dy, col) => {
            g.shadowColor = col; g.shadowBlur = blur * dpr; g.shadowOffsetX = far; g.shadowOffsetY = dy * dpr;
            g.drawImage(m, pad - far, pad);
        };
        if (thin) { put(1.5, 0.8, 'rgba(38,28,18,.3)'); }
        else {
            put(Math.max(6, barH * 0.16), barH * 0.07, 'rgba(46,34,22,.18)');
            put(Math.max(2, barH * 0.035), barH * 0.02, 'rgba(38,28,18,.3)');
            put(0.8, 0.4, 'rgba(26,20,14,.5)');
        }
        return { c, pad };
    }

    /* ---- draw ---- */
    const WET_LIFE = 3;
    let wetC = null;
    const SCALE = [0.05, 0.053, 0.061];              // forge scale: a matte, faintly bluish dark grey
    let NEUT = null;                                 // bare ground steel, the neutral of a glint
    function angSample(tabs, a, d, out, o) {
        const k = Math.min(1, a | 0), t = clamp(a - k);
        sampleLUT(tabs[k], d, out, o);
        const r = out[o], g = out[o + 1], b = out[o + 2];
        sampleLUT(tabs[k + 1], d, out, o);
        out[o] = mix(r, out[o], t); out[o + 1] = mix(g, out[o + 1], t); out[o + 2] = mix(b, out[o + 2], t);
    }
    function render() {
        if (!PW || !amb) return;
        const tabs = LUT || lut();
        if (!NEUT) { NEUT = [0, 0, 0]; sampleLUT(tabs[0], 0, NEUT, 0); }
        const { N } = STEEL;
        const data = img.data;
        const cool = qT ? Math.exp(-qt / 0.18) : 0;      // the red going out in the water
        if (wet && (!wetC || wetC.length !== PW)) wetC = new Float32Array(PW);
        // the brushed highlight: drawn out across the scratches, i.e. a soft vertical band,
        // and the angle at which each stretch of steel sees its light (grows away from it)
        const hx = sheenX * PW, sw1 = PW * 0.16, sw2 = PW * 0.035;
        for (let x = 0; x < PW; x++) {
            const q = x - hx;
            S[x] = 0.5 * Math.exp(-((q / sw1) ** 2)) + 0.45 * Math.exp(-((q / sw2) ** 2)) + 0.07;
            angC[x] = clamp(0.2 + 2.1 * Math.abs(q) / PW, 0, 2);
        }
        const [cFl, cFm, cFh, cBl, cBm, cBh] = cols;
        for (let x = 0; x < PW; x++) {
            const f = clamp((x + 0.5) / PW * N - 0.5, 0, N - 1.0001), i = f | 0, t = f - i;
            const d = Math.sqrt(mix(bar.D2[i], bar.D2[i + 1], t)), a = angC[x], ab = Math.min(2, a + 0.8), o = x * 3;
            // the film a little thinner and thicker than the mean: what a scratch shows
            angSample(tabs, a, d * 0.9, cFl, o); angSample(tabs, a, d, cFm, o); angSample(tabs, a, d * 1.1, cFh, o);
            angSample(tabs, ab, d * 0.9, cBl, o); angSample(tabs, ab, d, cBm, o); angSample(tabs, ab, d * 1.1, cBh, o);
            sAc[x] = smooth(140, 650, d) ** 0.8;
            const Tk = qT ? STEEL.Ta + (mix(qT[i], qT[i + 1], t) - STEEL.Ta) * cool : mix(bar.T[i], bar.T[i + 1], t);
            glowAt(Tk, glow, o);
            if (wet) { const td = mix(wet[i], wet[i + 1], t); wetC[x] = 1 - smooth(td - 0.35, td + 0.35, qt); }
        }
        const Nr = NEUT[0], Ng = NEUT[1], Nb = NEUT[2];
        for (let y = 0, i = 0; y < PH; y++) {
            const sh = rowShift[y];
            for (let x = 0; x < PW; x++, i++) {
                const o = i * 4, cv = cov[i];
                if (cv <= 0) { data[o + 3] = 0; continue; }
                const z = zone[i], xs = x - sh, xx = xs < 0 ? 0 : xs >= PW ? PW - 1 : xs, k = xx * 3, kg = x * 3;
                const side = z === 3 || z === 4;
                const lo = side ? cBl : cFl, md = side ? cBm : cFm, hi = side ? cBh : cFh;
                const jj = jit[i] * 0.5;
                const cr = md[k] + jj * (hi[k] - lo[k]), cg = md[k + 1] + jj * (hi[k + 1] - lo[k + 1]), cb = md[k + 2] + jj * (hi[k + 2] - lo[k + 2]);
                let ed = amb[i], sp = S[x] * spec[i], gloss = 0;
                if (wet) { const w = wetC[x]; ed *= 1 - 0.32 * w; sp *= 1 - 0.45 * w; gloss = 0.05 * w * S[x]; }
                const v = nu[i], iv = 1 - v;
                let r = cr * ed + sp * (cr * iv + Nr * v) + gloss;
                let g = cg * ed + sp * (cg * iv + Ng * v) + gloss;
                let b = cb * ed + sp * (cb * iv + Nb * v) + gloss;
                // scale: past a few hundred nanometres the film is a matte dark grey crust,
                // blotchy, the grind only faintly showing through; the forged shank always is
                const sa = Math.max(fz[i], sAc[xx]);
                if (sa > 0) {
                    const m = mot[i] * (0.55 + 0.45 * amb[i]), gl = sp * 0.12;
                    r = mix(r, SCALE[0] * m + gl * Nr, sa); g = mix(g, SCALE[1] * m + gl * Ng, sa); b = mix(b, SCALE[2] * m + gl * Nb, sa);
                }
                const gw = z === 4 ? 0.7 : 1;
                r += glow[kg] * gw; g += glow[kg + 1] * gw; b += glow[kg + 2] * gw;
                // a shoulder on the brightest channel, the same factor for all three: a hot
                // highlight on blue steel stays blue, it does not clip to cyan
                const mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
                if (mx > 0.8) { const s = (0.8 + 0.2 * (1 - Math.exp(-(mx - 0.8) / 0.2))) / mx; r *= s; g *= s; b *= s; }
                data[o] = enc(r); data[o + 1] = enc(g); data[o + 2] = enc(b);
                data[o + 3] = (255 * cv + 0.5) | 0;
            }
        }
        sctx.putImageData(img, 0, 0);
        // compose: the shadow on the paper, then the steel
        const ox = Math.round(ps * dpr), oy = Math.round(pt * dpr);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 1;
        ctx.drawImage(shade.c, ox - shade.pad, oy - shade.pad);
        ctx.drawImage(steel, ox, oy);
        if (fade) { ctx.globalAlpha = 1 - fade.t; ctx.drawImage(fade.img, ox, oy); ctx.globalAlpha = 1; }
    }

    /* ---- inputs ---- */
    function update() {
        const prev = want;
        want = read();
        aria();
        if (prev.ind && !want.ind) torchX = STEEL.torchX;
        if (prev.ind !== want.ind && (prev.ind || quenched) && bar.D2.some((v) => v > 4)) {
            // out of the wandering heat (its oxide says nothing about a value),
            // or a finished bar going indeterminate: a fresh blank
            freshBlank(!calm.matches);
        } else if (!want.ind && prev.ind === false && want.p < prev.p - 1e-9) {
            // a lower value: oxide does not shrink, so a fresh blank (if the colours are past it)
            if (pFront() > want.p + 0.015 || quenched) freshBlank(!calm.matches);
        } else if (!want.ind && quenched && want.p < 1) freshBlank(!calm.matches);
        if (want.p < 1) live.textContent = '';
        if (calm.matches) fastForward(); else wake();
    }
    const mo = new MutationObserver(update);
    mo.observe(prog, { attributes: true, attributeFilter: ['value', 'max'] });

    on(el, 'pointermove', (e) => {
        if (e.pointerType !== 'mouse') return;
        const r = el.getBoundingClientRect();
        sheenTo = clamp((e.clientX - r.left) / r.width, 0.05, 0.95);
        wake();
    });
    on(el, 'pointerleave', () => { sheenTo = cfg.sheen; wake(); });

    import('./tilt.js').then((m) => {
        if (ac.signal.aborted) return;
        const tilt = m.default;
        const fn = () => {
            const to = clamp(cfg.sheen + tilt.x * 0.4, 0.05, 0.95);
            if (Math.abs(to - sheenTo) < 0.006) return;      // a steady hand is not a reason to redraw
            sheenTo = to; wake();
        };
        tilt.listeners.add(fn);
        on(window, 'deviceorientation', () => tilt.active && fn(), { passive: true });
        ac.signal.addEventListener('abort', () => tilt.listeners.delete(fn));
    }).catch(() => {});

    const io = new IntersectionObserver((es) => {
        visible = es[es.length - 1].isIntersecting;
        if (visible) { last = 0; wake(); } else if (raf) { cancelAnimationFrame(raf); raf = 0; }
    });
    io.observe(el);
    on(document, 'visibilitychange', () => { if (document.hidden) { if (raf) cancelAnimationFrame(raf); raf = 0; } else { last = 0; wake(); } });
    const ro = new ResizeObserver(() => layout());
    ro.observe(el);
    on(calm, 'change', () => { if (calm.matches) fastForward(); else wake(); });

    // first paint: the state for the starting value, without a show
    el.dataset.state = state;
    aria();
    layout();
    fastForward();
    el.classList.add('tr--live');

    function destroy() {
        ac.abort(); mo.disconnect(); io.disconnect(); ro.disconnect();
        if (raf) cancelAnimationFrame(raf);
        canvas.remove(); live.remove();
        el.classList.remove('tr', 'tr--thin', 'tr--live');
        ['aria-valuemin', 'aria-valuemax', 'aria-valuenow', 'aria-valuetext', 'data-state'].forEach((a) => el.removeAttribute(a));
        before.role ? el.setAttribute('role', before.role) : el.removeAttribute('role');
        before.label ? el.setAttribute('aria-label', before.label) : el.removeAttribute('aria-label');
        before.lb ? el.setAttribute('aria-labelledby', before.lb) : el.removeAttribute('aria-labelledby');
        prog.removeAttribute('aria-hidden'); prog.removeAttribute('tabindex');
        if (madeProg) prog.remove();
        delete el.__temperRun;
    }
    Object.defineProperties(destroy, {
        value: { get: () => +prog.getAttribute('value') || 0, set: (v) => prog.setAttribute('value', String(v)) },
        max: { get: () => want.max, set: (v) => prog.setAttribute('max', String(v)) },
        indeterminate: { get: () => want.ind, set: (v) => (v ? prog.removeAttribute('value') : prog.setAttribute('value', '0')) },
        state: { get: () => state },
        /** where the straw front stands, as a value fraction 0..1 (comparable with value/max) */
        front: { get: () => pFront() },
        /** the same, as a fraction of the bar's length (for thicknessAt / temperatureAt) */
        frontAt: { get: () => front / STEEL.L },
        /** oxide thickness (nm) at a fraction 0..1 along the bar */
        thicknessAt: { value: (f) => Math.sqrt(bar.D2[Math.min(STEEL.N - 1, Math.max(0, Math.floor(f * STEEL.N)))]) },
        temperatureAt: { value: (f) => bar.T[Math.min(STEEL.N - 1, Math.max(0, Math.floor(f * STEEL.N)))] },
    });
    destroy.reset = () => { freshBlank(!calm.matches); prog.setAttribute('value', '0'); };
    destroy.update = update;
    /** advance the bar by `dt` seconds of wall time, without waiting for a frame (tests, stills) */
    destroy.step = (dt = 1 / 60) => { manual = true; if (raf) { cancelAnimationFrame(raf); raf = 0; } want = read(); frame(dt); };
    el.__temperRun = destroy;
    return destroy;
}

if (typeof document !== 'undefined') document.querySelectorAll('[data-temper-run]').forEach((el) => temperRun(el));
