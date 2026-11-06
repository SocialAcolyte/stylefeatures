/*
 *  TEMPER-RUN // heat tint for real pages: a small kit of ground steel that tempers.
 *
 *  One engine, four kinds, one API:
 *    <div data-temper-run><progress value="0" max="100" aria-label="Uploading"></progress></div>   a loading bar
 *    <button data-temper-run data-hold="1200">Delete draft</button>                                 a steel button (hold to confirm)
 *    <div data-temper-run data-kind="rule" role="separator"></div>                                  a hairline rule
 *    <a data-temper-run data-kind="rule" href="...">a link</a>                                      a tempering underline
 *    <figure data-temper-run data-kind="frame" data-temper=".5"><img ...></figure>                  a heat-tinted frame
 *  Auto-starts on [data-temper-run], or call temperRun(el, options); it returns destroy().
 *
 *  The colour is the physics of heated steel: the film of oxide a few tens of nanometres
 *  thick that grows on a bright face when it is warmed, and shows, by thin-film
 *  interference, as straw, gold, brown, bronze, purple and blue. Computed here from
 *  complex refractive indices of magnetite on iron and the CIE 1931 observer under D65;
 *  nothing in the colour sequence is a hand palette. The heat runs through the steel by
 *  the heat equation, the film grows by a parabolic Arrhenius law and never shrinks.
 *
 *  Nothing runs at rest: the clock only turns while heat is on or the steel is still hot
 *  enough to colour. Reduced motion: no animation of its own; direct input still works.
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

/* ---- the steel: heat and oxide ---------------------------------------------
 * One model for every shape. A field of nx x ny cells of steel (ny = 1 for a
 * bar, a rule or a frame; a frame's line closes on itself). Heat obeys
 *   dT/dt = alpha lap(T) - beta(T) (T - Ta) + u S(x, y)
 * with fin losses (free convection + grey radiation) through PA, the cooled
 * perimeter over the section. Solved implicitly, one direction at a time
 * (locally one-dimensional splitting, Thomas algorithm, Sherman-Morrison for a
 * closed loop), so long time-lapse steps are safe. Oxide grows by the
 * parabolic Arrhenius law, d^2 += k0 exp(-Q/RT) dt, in every cell, so it only
 * ever thickens. Units: mm, s, K, nm.
 */
export const STEEL = {
    alpha: 13,          // mm^2/s, carbon steel (k 50 W/mK, rho 7850, c 490)
    Ta: 293,            // K, the room
    hc: 12,             // W/m^2K, free convection
    eps: 0.55,          // emissivity of lightly oxidised steel
    rhoC: 7850 * 490,   // J/m^3K
    Q: 70e3,            // J/mol, activation energy (fitted, see README)
    k0: 2.17e7,         // nm^2/s, pre-factor (fitted, see README)
    Q2: 200e3,          // J/mol, the fast high-temperature scaling regime (estimate)
    k2: 1.5e16,         // nm^2/s
    dFront: 18,         // nm, "straw": where a front is read
};
const Rgas = 8.314, SIGMA = 5.67e-8;
export const growthRate = (T) => STEEL.k0 * Math.exp(-STEEL.Q / (Rgas * T)) + STEEL.k2 * Math.exp(-STEEL.Q2 / (Rgas * T));   // nm^2/s

/* Names for thicknesses, read off the computed colours. `from` and `to` take these or nm. */
export const BANDS = [
    [0, 'bright'], [12, 'pale-straw'], [18, 'straw'], [23, 'gold'], [28, 'brown'],
    [33, 'bronze'], [39, 'purple'], [45, 'dark-blue'], [52, 'blue'], [62, 'pale-blue'], [85, 'grey'],
];
export const bandName = (d) => { let n = BANDS[0][1]; for (const [t, s] of BANDS) if (d >= t) n = s; return n; };
export const nm = (v, dflt) => {
    if (v == null || v === '') return dflt;
    if (typeof v === 'number') return v;
    const b = BANDS.find((x) => x[1] === String(v).trim().toLowerCase());
    return b ? b[0] : (Number.isFinite(+v) ? +v : dflt);
};
/** Temperature (K) at which a hold of `seconds` grows `d` nm, by the same law. */
export const temperatureFor = (d, seconds = 300) => STEEL.Q / (Rgas * Math.log(STEEL.k0 * seconds / (d * d)));

export function makeField(nx, ny, Lx, Ly, o = {}) {
    const n = nx * ny, m = Math.max(nx, ny), f0 = o.from || 0;
    const A = () => new Float64Array(m);
    return {
        nx, ny, Lx, Ly, loop: !!o.loop, PA: o.PA ?? 476,
        T: new Float64Array(n).fill(STEEL.Ta), D2: new Float64Array(n).fill(f0 * f0), T0: new Float64Array(n),
        S: new Float64Array(n), sKey: '',
        from2: f0 * f0, cap2: o.to ? o.to * o.to : Infinity,
        u: 0, uSeen: 0, sx: 0, sy: 0, sw: o.sw ?? 6, sPeak: o.sPeak ?? 90, Tcap: o.Tcap ?? 840,
        b: A(), bb: A(), d: A(), cp: A(), x: A(), z: A(), w: A(),
    };
}
export function copyField(F, into) {
    const G = into && into.T.length === F.T.length ? into : makeField(F.nx, F.ny, F.Lx, F.Ly, { loop: F.loop, PA: F.PA });
    G.T.set(F.T); G.D2.set(F.D2);
    Object.assign(G, { PA: F.PA, cap2: F.cap2, from2: F.from2, sw: F.sw, sPeak: F.sPeak, Tcap: F.Tcap, u: 0, sx: F.sx, sy: F.sy });
    return G;
}
export function freshField(F) { F.T.fill(STEEL.Ta); F.D2.fill(F.from2); F.u = 0; F.uSeen = 0; }

function srcWeights(F) {
    const key = F.sx + ',' + F.sy + ',' + F.sw + ',' + F.sPeak;
    if (key === F.sKey) return;
    F.sKey = key;
    const { nx, ny, Lx, Ly, S, sw, sPeak } = F, dx = Lx / nx, dy = Ly / ny;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        let ex = (i + 0.5) * dx - F.sx;
        if (F.loop) ex -= Lx * Math.round(ex / Lx);
        const ey = ny > 1 ? (j + 0.5) * dy - F.sy : 0;
        S[j * nx + i] = sPeak * Math.exp(-(ex * ex + ey * ey) / (sw * sw));
    }
}

// Thomas algorithm with constant off-diagonals a: solves into x, using cp
function thomas(b, d, a, m, cp, x) {
    let den = b[0];
    cp[0] = a / den; x[0] = d[0] / den;
    for (let k = 1; k < m; k++) {
        den = b[k] - a * cp[k - 1];
        cp[k] = a / den;
        x[k] = (d[k] - a * x[k - 1]) / den;
    }
    for (let k = m - 2; k >= 0; k--) x[k] -= cp[k] * x[k + 1];
}

function solveLine(F, o, st, m, dt, r, loop, ue, split) {
    const { T, S, b, bb, d, cp, x, z, w, PA } = F, { Ta, hc, eps, rhoC } = STEEL, h = dt * split;
    for (let k = 0, idx = o; k < m; k++, idx += st) {
        const Ti = T[idx];
        const beta = (hc + eps * SIGMA * (Ti * Ti + Ta * Ta) * (Ti + Ta)) * PA / rhoC;
        const nb = loop ? 2 : m === 1 ? 0 : k === 0 || k === m - 1 ? 1 : 2;
        b[k] = 1 + beta * h + r * nb;
        d[k] = Ti + h * (ue * S[idx] + beta * Ta);
    }
    const a = -r;
    if (!loop || m < 3) thomas(b, d, a, m, cp, x);
    else {
        // cyclic: Sherman-Morrison around two ordinary solves
        const gamma = -b[0];
        for (let k = 0; k < m; k++) { bb[k] = b[k]; w[k] = 0; }
        bb[0] = b[0] - gamma; bb[m - 1] = b[m - 1] - a * a / gamma;
        thomas(bb, d, a, m, cp, x);
        w[0] = gamma; w[m - 1] = a;
        thomas(bb, w, a, m, cp, z);
        const f = (x[0] + a * x[m - 1] / gamma) / (1 + z[0] + a * z[m - 1] / gamma);
        for (let k = 0; k < m; k++) x[k] -= f * z[k];
    }
    for (let k = 0, idx = o; k < m; k++, idx += st) T[idx] = x[k];
}

export const maxT = (T) => { let m = 0; for (let i = 0; i < T.length; i++) if (T[i] > m) m = T[i]; return m; };

/** Advance the field by dt seconds of steel time. The heat eases off as the hottest cell nears Tcap. */
export function stepField(F, dt) {
    const { nx, ny, T, T0, D2 } = F;
    // the flame is eased off as the hottest cell nears Tcap (over a band no narrower than one
    // step's worth of heating, so a long time-lapse step cannot overshoot)
    const band = F.sPeak * dt > 200 ? F.sPeak * dt : 25;
    const ue = F.u > 0 ? F.u * Math.min(1, Math.max(0, (F.Tcap - maxT(T)) / band)) : 0;
    F.uSeen = ue;
    if (ue > 0) srcWeights(F);
    T0.set(T);
    const split = ny > 1 ? 0.5 : 1, dx = F.Lx / nx, dy = F.Ly / ny;
    const rx = STEEL.alpha * dt / (dx * dx);
    for (let j = 0; j < ny; j++) solveLine(F, j * nx, 1, nx, dt, rx, F.loop, ue, split);
    if (ny > 1) {
        const ry = STEEL.alpha * dt / (dy * dy);
        for (let i = 0; i < nx; i++) solveLine(F, i, nx, ny, dt, ry, false, ue, split);
    }
    const cap = F.cap2;
    for (let k = 0; k < T.length; k++) {
        const Tm = 0.5 * (T0[k] + T[k]);
        if (Tm > 340 && D2[k] < cap) { D2[k] += growthRate(Tm) * dt; if (D2[k] > cap) D2[k] = cap; }
    }
}
/** Step in pieces no longer than `maxStep` seconds. */
export function advanceField(F, simDt, maxStep = 1.5) {
    const n = Math.max(1, Math.ceil(simDt / maxStep));
    let used = 0;
    for (let k = 0; k < n; k++) { stepField(F, simDt / n); used += F.uSeen / n; }
    F.uSeen = used;
}
/** Where (mm from the start of a line) the straw front stands, reading from the far end. */
export function frontOf(F, dF = STEEL.dFront) {
    const { nx, Lx, D2 } = F, dx = Lx / nx, f2 = dF * dF;
    if (D2[nx - 1] >= f2) return Lx;
    for (let i = nx - 2; i >= 0; i--) {
        if (D2[i] >= f2) {
            const a = Math.sqrt(D2[i]), b = Math.sqrt(D2[i + 1]);
            return (i + 0.5 + Math.min(1, Math.max(0, (a - dF) / Math.max(1e-6, a - b)))) * dx;
        }
    }
    return 0;
}
/** Fraction of cells carrying at least `dF` nm. */
export function coverOf(F, dF = STEEL.dFront) {
    const f2 = dF * dF; let c = 0;
    for (let k = 0; k < F.D2.length; k++) if (F.D2[k] >= f2) c++;
    return c / F.D2.length;
}

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

// Belt-grinding scratches: long, nearly straight, of random length and depth, over a
// row-wise grain. Along W, across H.
function scratches(W, H, R, dpr, density = 1) {
    const g = new Float32Array(W * H);
    let carry = 0;
    for (let y = 0; y < H; y++) {
        carry = carry * 0.45 + (R() - 0.5);
        const rg = carry * 0.04 + (R() - 0.5) * 0.03;
        for (let x = 0; x < W; x++) g[y * W + x] = rg;
    }
    const count = ((W * H) / 16 * density) | 0;
    for (let k = 0; k < count; k++) {
        const y0 = R() * H, x0 = R() * W * 1.1 - W * 0.05;
        const len = (8 + R() ** 2 * 300) * dpr, slope = (R() - 0.5) * 0.004;
        const amp = (R() < 0.6 ? 1 : -0.6) * (0.03 + 0.15 * R() ** 3);
        for (let s = 0; s < len; s++) {
            const x = (x0 + s) | 0; if (x < 0 || x >= W) continue;
            const y = (y0 + s * slope) | 0; if (y < 0 || y >= H) continue;
            g[y * W + x] += amp * Math.sin(Math.PI * s / len);
        }
    }
    return g;
}
// low-frequency blotches (bilinear value noise)
function blotches(W, H, cell, R) {
    const gw = Math.ceil(W / cell) + 2, gh = Math.ceil(H / cell) + 2, g = new Float32Array(gw * gh);
    for (let i = 0; i < g.length; i++) g[i] = R();
    return (x, y) => {
        const fx = x / cell, fy = y / cell, ix = fx | 0, iy = fy | 0, tx = fx - ix, ty = fy - iy;
        const a = g[iy * gw + ix], b = g[iy * gw + ix + 1], c = g[(iy + 1) * gw + ix], d = g[(iy + 1) * gw + ix + 1];
        return mix(mix(a, b, tx), mix(c, d, tx), ty);
    };
}

/* A surface is a set of pixels (cov, zone, lighting) and a lattice of sample points that
 * carry the film's colour. Every pixel names its lattice point (li). A lattice point has a
 * place in the field (fx, fy, in cells), a place on screen (sx, sy, 0..1) and the direction
 * of the grind there (or: 0 along x, 1 along y), which decides where the brushed highlight
 * falls: a ground face shines in a band drawn out across its scratches.
 *   zone: 0 face, 1 back arris, 2 front arris (rounded), 3 bevel, 4 side face, 5 forged */
function newSurface(PW, PH, L) {
    const n = PW * PH;
    return {
        PW, PH, L,
        cov: new Float32Array(n), zone: new Uint8Array(n), amb: new Float32Array(n), spec: new Float32Array(n),
        jit: new Float32Array(n), nu: new Float32Array(n), mot: new Float32Array(n), fz: new Float32Array(n), li: new Int32Array(n),
        fx: new Float32Array(L), fy: new Float32Array(L), sx: new Float32Array(L), sy: new Float32Array(L), or: new Uint8Array(L),
    };
}

// A ground bar, plate or rod of steel seen from above and a little in front, so its
// thickness shows as a narrow side face under the top face. With `chisel`, the left end is
// forge black behind a ragged line where the grinder stopped, and the right end is a bevel.
// mode 'col': one lattice point per column (bars, rules); 'pix': per pixel (a 2D plate).
function plateSurface(PW, PH, dpr, seed, o) {
    const thin = PH / dpr < 14;
    const pix = o.mode === 'pix';
    const G = newSurface(PW, PH, pix ? PW * PH : PW);
    const { cov, zone, amb, spec, jit, nu, mot, fz } = G;
    const R = rng(seed ^ 0x51ab);
    const grind = scratches(PW, PH, R, dpr);
    const m1 = blotches(PW, PH, Math.max(3, PH * 0.22), R), m2 = blotches(PW, PH, Math.max(2, PH * 0.07), R);
    const colG = new Float32Array(PW);
    { let c = 0; for (let x = 0; x < PW; x++) { c = c * 0.3 + (R() - 0.5); colG[x] = c * 0.16; } }
    const room = new Float32Array(PW);         // a soft variation of the room seen along the steel
    const f1 = R() * 6, f2 = R() * 6;
    for (let x = 0; x < PW; x++) { const t = x / PW; room[x] = 1 + 0.05 * Math.sin(t * 5.1 + f1) + 0.03 * Math.sin(t * 13.7 + f2); }
    const T0 = PH * (o.side ?? (thin ? 0.22 : 0.16));             // the side face, foreshortened
    const fT0 = PH * (thin ? 0.03 : 0.03), fB0 = PH * 0.98 - T0, sB = PH * 0.98;
    const chisel = !!o.chisel;
    const bevL = chisel ? Math.min(PW * 0.12, PH * (thin ? 2.4 : 1.25)) : 0, bev0 = PW - bevL;
    const tangL = chisel ? (thin ? Math.min(PW * 0.05, PH * 2) : PW * 0.06) : -1e9;
    const ragged = new Float32Array(PH);
    { const q = R() * 6; let c = 0; for (let y = 0; y < PH; y++) { c = c * 0.93 + (R() - 0.5) * 0.12; ragged[y] = PH * (0.14 * Math.sin(y / PH * 3.3 + q) + 0.35 * c); } }
    const endR = chisel ? PH * 0.14 : 0;
    const rad = Math.max(1, (o.radius ?? 1.5) * dpr);
    const p1 = R() * 6;
    const rA = thin ? Math.max(0.8, 0.6 * dpr) : Math.max(1.2, 1.7 * dpr), hw = Math.max(1, 0.8 * dpr);
    const tops = new Float32Array(PW), fbs = new Float32Array(PW);
    for (let x = 0; x < PW; x++) {
        const xm = x + 0.5;
        let top = fT0, fb = fB0, bot = sB, z0 = 0, bq = 0;
        if (chisel && xm >= bev0) { bq = (xm - bev0) / bevL; const dr = 0.93 * bq * T0; top += dr; fb += dr; z0 = 3; }
        if (chisel && xm < endR) {
            // the forged end: drawn down a little and rounded off under the hammer
            const e = endR - xm, ins = endR - Math.sqrt(Math.max(0, endR * endR - e * e));
            top += ins * 0.9 + PH * 0.01 * Math.sin(p1 + xm * 0.3 / dpr); bot -= ins * 0.7; fb = Math.min(fb, bot - 0.5);
        }
        // the corners, rounded by the grinder
        const er = Math.max(0, rad - (PW - xm), chisel ? 0 : rad - xm);
        if (er > 0) { const ins = rad - Math.sqrt(Math.max(0, rad * rad - er * er)); top += ins; bot -= ins; fb = Math.min(fb, bot - 0.5); }
        tops[x] = top; fbs[x] = fb;
        const xc = clamp(Math.min(xm, PW - xm) + 0.5);
        for (let y = 0; y < PH; y++) {
            const i = y * PW + x, ym = y + 0.5;
            const c = clamp(y + 1 - top) * clamp(bot - y) * xc;
            cov[i] = c;
            if (c <= 0) continue;
            const g = grind[i];
            const mo = 0.7 * m1(x, y) + 0.3 * m2(x, y);
            mot[i] = 0.6 + 0.8 * mo;
            const fa = chisel ? smooth(-PH * 0.07, PH * 0.07, tangL + ragged[y] - xm) : 0, forged = fa > 0.5;
            fz[i] = fa;
            let z = forged ? 5 : z0, a, s, j = clamp(g * 6, -1, 1), v = 0.3;
            if (z === 5 && ym - top >= hw && ym <= fb - rA) { a = 0.55 + 0.5 * mo; s = 0.12; j = 0; v = 0.5; }
            else if (ym - top < hw) { z = 1; a = 1.6; s = 0.6; v = 0.75; }
            else if (Math.abs(ym - fb) < rA) {
                // the front arris, rounded: its normal turns from the window toward the eye,
                // so a hairline catches the light and then falls away
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
        if (chisel && Math.abs(xm - bev0) < 0.75) for (let y = 0; y < PH; y++) { const i = y * PW + x; if (zone[i] === 3 || zone[i] === 0) { amb[i] *= 1.45; nu[i] = 0.7; } }
    }
    const nx = o.nx, ny = o.ny || 1;
    if (!pix) {
        // the fronts are not ruled lines: the film grows a little ahead where the grind is
        // deeper, so each row runs slightly ahead or behind, and the arrises lag (they lose
        // heat from three faces)
        const rowShift = new Int16Array(PH);
        const amp = o.wobble ?? 1;
        let w1 = R() * 6, w2 = R() * 6, nz = 0;
        for (let y = 0; y < PH; y++) {
            const v = (y + 0.5) / PH;
            nz = nz * 0.96 + (R() - 0.5) * 0.04;
            const edge = Math.max(0, 1 - Math.min(v, 1 - v) / 0.3) ** 2;
            rowShift[y] = Math.round(amp * Math.min(PH, 60 * dpr) * (0.035 * Math.sin(v * 3.4 + w1) + 0.012 * Math.sin(v * 8.9 + w2) + 0.08 * nz - 0.07 * edge));
        }
        for (let y = 0, i = 0; y < PH; y++) for (let x = 0; x < PW; x++, i++) {
            const xs = x - rowShift[y]; G.li[i] = xs < 0 ? 0 : xs >= PW ? PW - 1 : xs;
        }
        for (let x = 0; x < PW; x++) { G.fx[x] = (x + 0.5) / PW * nx - 0.5; G.fy[x] = 0; G.sx[x] = (x + 0.5) / PW; G.sy[x] = 0.5; }
    } else {
        // a plate: each pixel samples the field where it lies on the face; the side face
        // shows the front edge. A slow, low wobble in where each pixel samples makes the
        // rings a little uneven, as the film is over a real grind.
        const wb = blotches(PW, PH, Math.max(4, PH * 0.5), R), wc = blotches(PW, PH, Math.max(4, PH * 0.5), R);
        const amp = 0.35 * (o.wobble ?? 1);
        for (let y = 0, i = 0; y < PH; y++) for (let x = 0; x < PW; x++, i++) {
            G.li[i] = i;
            const ym = y + 0.5, top = tops[x], fb = fbs[x];
            const vy = clamp((ym - top) / Math.max(1, fb - top));
            G.fx[i] = (x + 0.5) / PW * nx - 0.5 + amp * (wb(x, y) - 0.5) * 2;
            G.fy[i] = vy * ny - 0.5 + amp * (wc(x, y) - 0.5);
            G.sx[i] = (x + 0.5) / PW; G.sy[i] = ym / PH;
        }
    }
    return G;
}

// A frame of ground flat bar, mitred at the corners, around the element's box. Each side's
// grind runs along it, so the grain turns at the mitre. Lattice: one point per device pixel
// along the frame's perimeter, clockwise from the top-left corner.
function frameSurface(PW, PH, dpr, seed, o) {
    const fw = Math.max(2, o.width * dpr), P = 2 * (PW + PH);
    const G = newSurface(PW, PH, P);
    const { cov, zone, amb, spec, jit, nu, mot, li } = G;
    const R = rng(seed ^ 0x7a11);
    const across = Math.ceil(fw) + 1;
    const grind = scratches(P + 400, across, R, dpr);
    const m1 = blotches(PW, PH, Math.max(4, fw * 2), R);
    const off = [0, 97, 211, 331].map((v) => (v * dpr + R() * 120) | 0);
    const lit = [1.04, 0.92, 0.8, 0.97];                  // top, right, bottom, left: the window is above
    const rad = Math.max(1, 1.2 * dpr), hw = Math.max(0.8, 0.6 * dpr), rA = Math.max(1, 1.1 * dpr);
    const shift = new Float32Array(across);
    { let nz = 0; const w = R() * 6; for (let k = 0; k < across; k++) { nz = nz * 0.8 + (R() - 0.5) * 0.4; shift[k] = dpr * (2.5 * Math.sin(k / across * 2.6 + w) + 2 * nz); } }
    for (let y = 0, i = 0; y < PH; y++) for (let x = 0; x < PW; x++, i++) {
        const xm = x + 0.5, ym = y + 0.5;
        const dl = xm, dr = PW - xm, dt = ym, db = PH - ym;
        const m = Math.min(dl, dr, dt, db);
        if (m > fw + 0.5) { li[i] = 0; continue; }
        // outer corner rounding
        const cxd = Math.max(0, rad - Math.min(dl, dr)), cyd = Math.max(0, rad - Math.min(dt, db));
        const outer = clamp(rad - Math.hypot(cxd, cyd) + 0.5);
        const c = outer * clamp(fw - m + 0.5);
        cov[i] = c;
        if (c <= 0) continue;
        // which side (the mitre is where two distances are equal)
        let sd = 0, d1 = dt;
        if (dr < d1) { sd = 1; d1 = dr; } if (db < d1) { sd = 2; d1 = db; } if (dl < d1) { sd = 3; d1 = dl; }
        const s = sd === 0 ? xm : sd === 1 ? PW + ym : sd === 2 ? PW + PH + (PW - xm) : 2 * PW + PH + (PH - ym);
        const k = Math.min(across - 1, d1 | 0);
        const sI = ((s + shift[k]) % P + P) % P;
        li[i] = Math.min(P - 1, sI | 0);
        const g = grind[k * (P + 400) + (((s | 0) + off[sd]) % (P + 400))];
        const mo = m1(x, y);
        mot[i] = 0.6 + 0.8 * mo;
        // distance to the mitre line: the second-nearest edge minus the nearest
        const d2 = sd === 0 || sd === 2 ? Math.min(dl, dr) : Math.min(dt, db);
        const seam = d2 - d1;
        let z = 0, a, sp, v = 0.3, j = clamp(g * 6, -1, 1);
        const u = d1 / fw;
        if (d1 < hw) { z = 1; a = 1.5 * lit[sd]; sp = 0.6; v = 0.75; }
        else if (fw - d1 < rA) {
            const t = (d1 - (fw - rA)) / rA;
            z = 2; a = mix(0.95, 0.4, t) * lit[sd]; sp = 0.45; v = 0.6;
        } else {
            a = mix(1.02, 0.9, u) * lit[sd]; sp = 1;
            a *= 1 + g * 0.5; sp *= Math.max(0.15, 0.6 + g * 2.6); v = clamp(0.28 + g * 2.5, 0.12, 0.65);
        }
        if (seam < 0.9 * dpr && d1 > hw) { const t = 1 - seam / (0.9 * dpr); a *= 1 - 0.35 * t; sp *= 1 - 0.5 * t; }
        zone[i] = z; amb[i] = a; spec[i] = sp; jit[i] = j; nu[i] = v;
    }
    const nx = o.nx, half = fw / 2;
    for (let s = 0; s < P; s++) {
        let x, y, or;
        if (s < PW) { x = s; y = half; or = 0; }
        else if (s < PW + PH) { x = PW - half; y = s - PW; or = 1; }
        else if (s < 2 * PW + PH) { x = PW - (s - PW - PH); y = PH - half; or = 0; }
        else { x = half; y = PH - (s - 2 * PW - PH); or = 1; }
        G.fx[s] = (s + 0.5) / P * nx - 0.5; G.fy[s] = 0; G.sx[s] = x / PW; G.sy[s] = y / PH; G.or[s] = or;
    }
    G.perimeter = P;
    return G;
}

// The shadow on the paper: a contact line where the steel meets the page, and a short
// penumbra from the room's overhead light. `lift` (css px) sets its reach.
function shadowOf(G, dpr, lift) {
    const { PW, PH, cov } = G;
    const m = document.createElement('canvas');
    m.width = PW; m.height = PH;
    const mi = new ImageData(PW, PH);
    for (let i = 0; i < PW * PH; i++) mi.data[i * 4 + 3] = Math.round(255 * cov[i]);
    m.getContext('2d').putImageData(mi, 0, 0);
    const pad = Math.round(Math.max(4, lift * 0.6) * dpr);
    const c = document.createElement('canvas');
    c.width = PW + pad * 2; c.height = PH + pad * 2;
    const g = c.getContext('2d');
    const far = c.width + 100;
    const put = (blur, dy, col) => {
        g.shadowColor = col; g.shadowBlur = blur * dpr; g.shadowOffsetX = far; g.shadowOffsetY = dy * dpr;
        g.drawImage(m, pad - far, pad);
    };
    if (lift < 12) { put(Math.max(1, lift * 0.25), Math.max(0.5, lift * 0.12), 'rgba(38,28,18,.3)'); put(0.6, 0.3, 'rgba(26,20,14,.22)'); }
    else {
        put(Math.max(6, lift * 0.16), lift * 0.07, 'rgba(46,34,22,.18)');
        put(Math.max(2, lift * 0.035), lift * 0.02, 'rgba(38,28,18,.3)');
        put(0.8, 0.4, 'rgba(26,20,14,.5)');
    }
    return { c, pad };
}

/* ---- the painter: film colour per lattice point, light per pixel ---------- */
const SCALE = [0.05, 0.053, 0.061];              // forge scale: a matte, faintly bluish dark grey
function angSample(tabs, a, d, out, o) {
    const k = Math.min(1, a | 0), t = clamp(a - k);
    sampleLUT(tabs[k], d, out, o);
    const r = out[o], g = out[o + 1], b = out[o + 2];
    sampleLUT(tabs[k + 1], d, out, o);
    out[o] = mix(r, out[o], t); out[o + 1] = mix(g, out[o + 1], t); out[o + 2] = mix(b, out[o + 2], t);
}
// bilinear read of a field array at cell coordinates (fx, fy)
function fieldAt(F, A, fx, fy) {
    const { nx, ny } = F;
    let x = fx, i0, i1, tx;
    if (F.loop) { x = ((x % nx) + nx) % nx; i0 = x | 0; i1 = (i0 + 1) % nx; tx = x - i0; }
    else { x = clamp(x, 0, nx - 1.0001); i0 = x | 0; i1 = i0 + 1; tx = x - i0; }
    if (ny === 1) return A[i0] + (A[i1] - A[i0]) * tx;
    const y = clamp(fy, 0, ny - 1.0001), j0 = y | 0, ty = y - j0, r0 = j0 * nx, r1 = r0 + nx;
    return mix(A[r0 + i0] + (A[r0 + i1] - A[r0 + i0]) * tx, A[r1 + i0] + (A[r1 + i1] - A[r1 + i0]) * tx, ty);
}

function makePainter(G) {
    const { L } = G;
    const cols = Array.from({ length: 6 }, () => new Float32Array(L * 3));
    const S = new Float32Array(L), sAc = new Float32Array(L), glow = new Float32Array(L * 3), wetC = new Float32Array(L);
    const img = new ImageData(G.PW, G.PH);
    let NEUT = null;
    /* env: { F, sheenX, sheenY, glowT?: (fx)=>K or null, wet?: (fx)=>0..1 or null } */
    return function paint(env) {
        const tabs = LUT || lut();
        if (!NEUT) { NEUT = [0, 0, 0]; sampleLUT(tabs[0], 0, NEUT, 0); }
        const { F } = env, { PW, PH } = G;
        const [cFl, cFm, cFh, cBl, cBm, cBh] = cols;
        let anyScale = false;
        for (let l = 0; l < L; l++) {
            const o = l * 3, fx = G.fx[l], fy = G.fy[l];
            const d = Math.sqrt(Math.max(0, fieldAt(F, F.D2, fx, fy)));
            const vert = G.or[l] === 1, span = vert ? PH : PW;
            const q = vert ? (G.sy[l] - env.sheenY) * PH : (G.sx[l] - env.sheenX) * PW;
            S[l] = 0.5 * Math.exp(-((q / (span * 0.16)) ** 2)) + 0.45 * Math.exp(-((q / (span * 0.035)) ** 2)) + 0.07;
            const a = clamp(0.2 + 2.1 * Math.abs(q) / span, 0, 2), ab = Math.min(2, a + 0.8);
            // the film a little thinner and thicker than the mean: what a scratch shows
            angSample(tabs, a, d * 0.9, cFl, o); angSample(tabs, a, d, cFm, o); angSample(tabs, a, d * 1.1, cFh, o);
            angSample(tabs, ab, d * 0.9, cBl, o); angSample(tabs, ab, d, cBm, o); angSample(tabs, ab, d * 1.1, cBh, o);
            const sc = d > 140 ? smooth(140, 650, d) ** 0.8 : 0;
            sAc[l] = sc; if (sc > 0) anyScale = true;
            if (env.glow) glowAt(fieldAt(F, env.glow, fx, fy), glow, o); else glow[o] = glow[o + 1] = glow[o + 2] = 0;
            wetC[l] = env.wet ? env.wet(fx) : 0;
        }
        const data = img.data, { cov, zone, amb, spec, jit, nu, mot, fz, li } = G;
        const Nr = NEUT[0], Ng = NEUT[1], Nb = NEUT[2], hasWet = !!env.wet;
        for (let i = 0; i < PW * PH; i++) {
            const o = i * 4, cv = cov[i];
            if (cv <= 0) { data[o + 3] = 0; continue; }
            const z = zone[i], l = li[i], k = l * 3;
            const side = z === 3 || z === 4;
            const lo = side ? cBl : cFl, md = side ? cBm : cFm, hi = side ? cBh : cFh;
            const jj = jit[i] * 0.5;
            const cr = md[k] + jj * (hi[k] - lo[k]), cg = md[k + 1] + jj * (hi[k + 1] - lo[k + 1]), cb = md[k + 2] + jj * (hi[k + 2] - lo[k + 2]);
            let ed = amb[i], sp = S[l] * spec[i], gloss = 0;
            if (hasWet) { const w = wetC[l]; ed *= 1 - 0.32 * w; sp *= 1 - 0.45 * w; gloss = 0.05 * w * S[l]; }
            const v = nu[i], iv = 1 - v;
            let r = cr * ed + sp * (cr * iv + Nr * v) + gloss;
            let g = cg * ed + sp * (cg * iv + Ng * v) + gloss;
            let b = cb * ed + sp * (cb * iv + Nb * v) + gloss;
            const sa = anyScale ? Math.max(fz[i], sAc[l]) : fz[i];
            if (sa > 0) {
                const m = mot[i] * (0.55 + 0.45 * amb[i]), gl = sp * 0.12;
                r = mix(r, SCALE[0] * m + gl * Nr, sa); g = mix(g, SCALE[1] * m + gl * Ng, sa); b = mix(b, SCALE[2] * m + gl * Nb, sa);
            }
            if (env.glow) { const gw = z === 4 ? 0.7 : 1; r += glow[k] * gw; g += glow[k + 1] * gw; b += glow[k + 2] * gw; }
            // a shoulder on the brightest channel, the same factor for all three: a hot
            // highlight on blue steel stays blue, it does not clip to cyan
            const mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
            if (mx > 0.8) { const s = (0.8 + 0.2 * (1 - Math.exp(-(mx - 0.8) / 0.2))) / mx; r *= s; g *= s; b *= s; }
            data[o] = enc(r); data[o + 1] = enc(g); data[o + 2] = enc(b);
            data[o + 3] = (255 * cv + 0.5) | 0;
        }
        return img;
    };
}

/* ---- the kit ---------------------------------------------------------------
 * Four kinds share the engine above:
 *   bar     a progress / loading bar: the value says where the straw must stand
 *   button  a steel-faced button: the face blooms where it is pressed (data-hold: hold to confirm)
 *   rule    a hairline rod (a section rule, or a link's underline) that tempers where the pointer runs
 *   frame   a mitred steel frame round an image or card, heat-tinted; it takes more heat where pointed at
 */
const MM_PER_PX = 0.27;                  // how big the steel is: one css pixel is about a quarter of a millimetre
const KINDS = {
    bar: { sheen: 0.62, done: 'Done', shape: 'flat' },
    button: { sheen: 0.36, done: 'Confirmed', to: 'blue', reset: 1800, hint: 'Press and hold to confirm' },
    rule: { sheen: 0.5, to: 'purple', reset: 0 },
    frame: { sheen: 0.4, to: 'purple', reset: 0, at: 'bottom-left' },
};
// the heat for each kind: PA (cooled perimeter / section, 1/m), the flame's 1/e radius (mm),
// its peak heating rate (K/s), the hottest the steel is let go (K), and steel-seconds per second
const HEAT = {
    bar: { PA: 476, sw: 6, sPeak: 90, Tcap: 840, rate: 15 },
    rule: { PA: 3000, sw: 6, sPeak: 1000, Tcap: 690, rate: 4 },
    frame: { PA: 600, sw: 7, sPeak: 1000, Tcap: 680, rate: 3 },
    button: { PA: 3000, sw: 11, sPeak: 1000, Tcap: 700 },
};
const BAR = { L: 110, N: 110, torchX: 9, Tcap: 840, Tidle: 528 };
const RATE_MAX = 480;
const WET_LIFE = 3;
const Ta = STEEL.Ta;

// a fresh field of a new size that keeps the film of the old one, resampled
function resampled(old, nx, ny, Lx, Ly, o) {
    const F = makeField(nx, ny, Lx, Ly, o);
    if (old) {
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
            const fx = (i + 0.5) / nx * old.nx - 0.5, fy = ny > 1 ? (j + 0.5) / ny * old.ny - 0.5 : 0;
            F.D2[j * nx + i] = Math.max(F.from2, fieldAt(old, old.D2, fx, fy));
        }
    }
    return F;
}

// steel-seconds a press at the middle of a plate takes to bring the film there to `to` nm
const holdCache = new Map();
function holdSteelTime(nx, ny, Lx, Ly, h, to) {
    const key = [nx, ny, h.sw, to].join(',');
    if (holdCache.has(key)) return holdCache.get(key);
    const F = makeField(nx, ny, Lx, Ly, { ...h, to: to + 1 });
    F.u = 1; F.sx = Lx / 2; F.sy = Ly / 2;
    let t = 0;
    const c = ((ny / 2) | 0) * nx + ((nx / 2) | 0);
    while (t < 600 && F.D2[c] < to * to) { stepField(F, 0.1); t += 0.1; }
    holdCache.set(key, t);
    return t;
}

const atFraction = (at, w, h) => {
    const P = 2 * (w + h);
    const named = { 'top-left': 0, 'top-right': w / P, 'bottom-right': (w + h) / P, 'bottom-left': (2 * w + h) / P, start: 0, center: 0.5, end: 1 };
    return at in named ? named[at] : clamp(+at || 0);
};

export function temperRun(el, opts = {}) {
    if (el.__temperRun) el.__temperRun();
    const ds = el.dataset;
    const guess = el.tagName === 'BUTTON' ? 'button' : el.querySelector('progress') ? 'bar' : el.querySelector('img,picture,video,canvas:not(.tr-canvas)') ? 'frame' : 'rule';
    const kind = KINDS[opts.kind ?? ds.kind] ? (opts.kind ?? ds.kind) : guess;
    const K = KINDS[kind], H = HEAT[kind];
    const get = (k) => opts[k] ?? ds[k] ?? K[k];
    const holdRaw = opts.hold ?? ds.hold;
    const cfg = {
        speed: Math.max(0.05, +(get('speed') ?? 1) || 1),
        sheen: +(get('sheen') ?? 0.5),
        seed: +(get('seed') ?? 0) || ((Math.random() * 2 ** 31) | 0),
        done: get('done'), label: get('label') ?? null, hint: get('hint'),
        from: nm(get('from'), 0), to: nm(get('to'), 52),
        hold: holdRaw === '' || holdRaw === true ? 1200 : Math.max(0, +(holdRaw ?? 0) || 0),
        reset: Math.max(0, +(get('reset') ?? 0) || 0),
        shape: get('shape'), place: get('place'), temper: clamp(+(get('temper') ?? 0) || 0), at: get('at') ?? 0,
    };
    const ac = new AbortController();
    const on = (t, type, fn, o) => t.addEventListener(type, fn, { signal: ac.signal, ...o });
    const timers = new Set();
    const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };

    el.classList.add('tr', 'tr--' + kind);
    const canvas = document.createElement('canvas');
    canvas.className = 'tr-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    if (kind === 'button') el.prepend(canvas); else el.append(canvas);
    const ctx = canvas.getContext('2d');
    const steel = document.createElement('canvas');
    const sctx = steel.getContext('2d');
    let live = null;
    const say = (t) => { if (live) live.textContent = t; };
    if (kind === 'bar' || kind === 'button') {
        live = document.createElement('span');
        live.className = 'tr-sr';
        live.setAttribute('aria-live', 'polite');
        el.after(live);                   // beside, not inside: a progressbar's children are presentational
    }

    // ---- shared state
    let bar = null, btn = null, line = null;
    let F = null, G = null, paint = null, shade = null;
    let dpr = 1, box = { x: 0, y: 0, w: 0, h: 0 }, pad = { t: 0, b: 0, s: 0 };
    let raf = 0, last = 0, visible = true, manual = false;
    let fade = null, resetT = 0, hot = false, state = 'cold', tempered = false;
    let sheenX = cfg.sheen, sheenTo = cfg.sheen, sheenY = 0.35, sheenYTo = 0.35;

    function setState(s) {
        if (s === state) return;
        const from = state;
        state = s;
        el.dataset.state = s;
        el.dispatchEvent(new CustomEvent('temper-run:state', { bubbles: true, detail: { state: s, from } }));
    }
    function snapshot() {
        if (!steel.width) return;
        const img = document.createElement('canvas');
        img.width = steel.width; img.height = steel.height;
        img.getContext('2d').drawImage(steel, 0, 0);
        fade = { img, t: 0 };
    }
    // a fresh face: the steel rubbed bright again on a stone (oxide never shrinks by itself)
    function regrind(animate = !calm.matches) {
        if (!F) return;
        if (animate) snapshot();
        freshField(F); hot = false;
        if (bar) bar.fresh();
        if (btn) btn.fresh();
        setState('cold');
        render(); wake();
    }
    function scheduleReset() {
        clearTimeout(resetT); timers.delete(resetT);
        if (!cfg.reset || !F) return;
        if (!F.D2.some((v) => v > F.from2 + 4)) return;
        resetT = later(() => { if (!hot && !(F && F.u > 0)) regrind(); }, cfg.reset);
    }
    const cancelReset = () => { clearTimeout(resetT); timers.delete(resetT); };

    // heat on (u = 1) at a place along the steel (fx 0..1, and fy 0..1 for a plate)
    function heat(fx, fy = 0.5, u = 1) {
        if (!F) return;
        F.sx = clamp(fx) * F.Lx; F.sy = clamp(fy) * F.Ly; F.u = u;
        if (u > 0) { cancelReset(); hot = true; setState('heating'); }
        wake();
    }
    // the heat-driven kinds: run while heat is on or the steel is still hot enough to grow film
    const settle = (s) => { if (state !== 'confirmed') setState(s); };
    function heatStep(dt, rate, maxStep = 0.25) {
        if (!(F.u > 0 || hot)) return false;
        const r = F.u > 0 ? rate : rate * 3;             // heat off: the cooling is time-lapsed
        advanceField(F, dt * r, F.u > 0 ? maxStep : 1);
        if (F.u <= 0 && maxT(F.T) < 470) {
            // below about 200 C the film grows too slowly to see: let the clock stop
            F.T.fill(Ta); hot = false; settle(F.D2.some((v) => v > F.from2 + 4) ? 'resting' : 'cold');
            scheduleReset();
            return false;
        }
        if (F.u <= 0) settle('coasting');
        return true;
    }
    function coastOut() {
        F.u = 0;
        let n = 0;
        while (maxT(F.T) >= 470 && n++ < 400) stepField(F, 2);
        F.T.fill(Ta); hot = false;
        settle(F.D2.some((v) => v > F.from2 + 4) ? 'resting' : 'cold');
    }

    /* ======================== bar: a progress bar ======================== */
    bar = null;
    if (kind === 'bar') bar = (() => {
        let prog = el.querySelector('progress');
        const madeProg = !prog;
        if (!prog) { prog = document.createElement('progress'); prog.max = 100; prog.value = 0; el.append(prog); }
        const before = { role: el.getAttribute('role'), label: el.getAttribute('aria-label'), lb: el.getAttribute('aria-labelledby') };
        el.setAttribute('role', 'progressbar');
        el.setAttribute('aria-valuemin', '0');
        if (!el.hasAttribute('aria-label') && !el.hasAttribute('aria-labelledby')) {
            if (!cfg.label && prog.hasAttribute('aria-labelledby')) el.setAttribute('aria-labelledby', prog.getAttribute('aria-labelledby'));
            else el.setAttribute('aria-label', cfg.label || prog.getAttribute('aria-label') || 'Progress');
        }
        prog.setAttribute('aria-hidden', 'true');
        prog.tabIndex = -1;

        F = makeField(BAR.N, 1, BAR.L, 1, { ...H, from: cfg.from });
        const scratchF = makeField(BAR.N, 1, BAR.L, 1, H);
        const rate0 = H.rate * cfg.speed;
        let u = 0, torchX = BAR.torchX, front = 0, quenched = false;
        let qT = null, qt = 9, wet = null, wanderT = 0;
        const glowArr = new Float64Array(BAR.N);
        const read = () => {
            const max = +prog.getAttribute('max') || 1, hasV = prog.hasAttribute('value');
            return { max, ind: !hasV, p: hasV ? clamp((+prog.getAttribute('value') || 0) / max) : 0 };
        };
        let want = read();
        const pFront = () => clamp((front - BAR.torchX) / (BAR.L - BAR.torchX));
        const targetX = (p) => (p <= 0 ? 0 : BAR.torchX + p * (BAR.L - BAR.torchX));
        const forecast = () => {
            copyField(F, scratchF);
            for (let k = 0; k < 24; k++) stepField(scratchF, 15);
            return frontOf(scratchF);
        };
        function aria() {
            const { p, ind, max } = want;
            el.setAttribute('aria-valuemax', String(max));
            if (ind) { el.removeAttribute('aria-valuenow'); el.removeAttribute('aria-valuetext'); }
            else {
                el.setAttribute('aria-valuenow', String(Math.round(p * max * 100) / 100));
                el.setAttribute('aria-valuetext', p >= 1 ? cfg.done : `${Math.round(p * 100)}%`);
            }
        }
        // the heat is a model-predictive controller: "if the flame went away now, where would
        // the straw stop?", and it backs off as that answer reaches the mark, as a smith does
        function control() {
            if (want.ind) { u = 1; return; }
            const xT = targetX(want.p);
            if (xT <= 0 || quenched) { u = 0; return; }
            const goal = want.p >= 1 ? BAR.L + 3 : xT;
            u = clamp((goal - forecast() - 0.5) / 5);
        }
        function advance(simDt) {
            F.u = u; F.sx = torchX; F.Tcap = want.ind ? BAR.Tidle : BAR.Tcap;
            advanceField(F, simDt, 1.5);
            front = frontOf(F);
        }
        const lagMM = () => (want.ind ? 0 : Math.max(0, targetX(want.p) - front));
        function fresh() { front = 0; quenched = false; u = 0; qT = null; qt = 9; wet = null; }
        function quench(animate) {
            quenched = true;
            if (animate) {
                qT = Float64Array.from(F.T); qt = 0;
                // it comes out of the water wet, and a wet face is darker; the heat still in
                // the steel drives the water off, the hottest stretch first
                wet = new Float32Array(BAR.N);
                for (let i = 0; i < BAR.N; i++) wet[i] = 0.3 + 2.1 * (1 - clamp((F.T[i] - 330) / 260)) ** 1.4;
            }
            F.T.fill(Ta); u = 0; F.u = 0;
            setState('quenched');
            say(cfg.done);
            el.dispatchEvent(new CustomEvent('temper-run:quench', { bubbles: true, detail: { front: front / BAR.L } }));
        }
        function fastForward() {
            sheenX = sheenTo;
            if (!want.ind && targetX(want.p) > 0) {
                let it = 0;
                while (it++ < 4000) {
                    if (it % 3 === 1) control();
                    if (want.p >= 1 && front >= BAR.L - 0.6) break;
                    if (u <= 0.001 && it > 2) {
                        const c = forecast();
                        if (c - front < 0.3 || c >= targetX(want.p) - 0.3) { coastOut(); front = frontOf(F); break; }
                    }
                    advance(2);
                }
            }
            if (want.p >= 1 && !want.ind && !quenched) quench(false);
            qT = null; wet = null; fade = null;
            setState(quenched ? 'quenched' : front > 0 ? 'resting' : 'cold');
            render();
        }
        function step(dt) {
            let busy = false;
            if (want.ind) {
                wanderT += dt;
                torchX = BAR.L * (0.1 + 0.8 * (0.5 - 0.5 * Math.cos(wanderT * 2 * Math.PI / 11)));
                control();
                advance(dt * rate0);
                setState('wandering');
                let dm = 0; for (let i = 0; i < BAR.N; i++) dm += Math.sqrt(F.D2[i]);
                if (dm / BAR.N > 52) regrind();
                busy = true;
            } else if (!quenched) {
                torchX = mix(torchX, BAR.torchX, clamp(dt * 3));
                control();
                const lag = lagMM();
                const rate = clamp(rate0 * (1 + lag / 2.5), rate0, RATE_MAX);
                F.uSeen = 0;
                if (u > 0.01 || lag > 0.6 || maxT(F.T) > 760) {
                    advance(dt * rate);
                    if (F.uSeen > 0.06) setState('heating'); else if (F.uSeen < 0.01) setState('coasting');
                    busy = true;
                }
                if (want.p >= 1 && front >= BAR.L - 0.6) quench(true);
                else if (!busy || (u <= 0.01 && lag <= 0.6)) {
                    if (maxT(F.T) < 760) { setState(front > 0 ? 'resting' : 'cold'); busy = false; }
                    else busy = true;
                }
            }
            if (qT) { qt += dt; if (qt > 1.2) qT = null; else busy = true; }
            if (wet) { if (!qT) qt += dt; if (qt > WET_LIFE) wet = null; else busy = true; }
            return busy;
        }
        function env(e) {
            if (qT) {
                const cool = Math.exp(-qt / 0.18);          // the red going out in the water
                for (let i = 0; i < BAR.N; i++) glowArr[i] = Ta + (qT[i] - Ta) * cool;
                e.glow = glowArr;
            } else e.glow = F.T;
            if (wet) e.wet = (fx) => {
                const f = clamp(fx, 0, BAR.N - 1.0001), i = f | 0, td = mix(wet[i], wet[i + 1], f - i);
                return 1 - smooth(td - 0.35, td + 0.35, qt);
            };
        }
        function update() {
            const prev = want;
            want = read();
            aria();
            if (prev.ind && !want.ind) torchX = BAR.torchX;
            if (prev.ind !== want.ind && (prev.ind || quenched) && F.D2.some((v) => v > F.from2 + 4)) regrind();
            else if (!want.ind && !prev.ind && want.p < prev.p - 1e-9) {
                // a lower value: oxide does not shrink, so a fresh blank (if the colours are past it)
                if (pFront() > want.p + 0.015 || quenched) regrind();
            } else if (!want.ind && quenched && want.p < 1) regrind();
            if (want.p < 1) say('');
            if (calm.matches) fastForward(); else wake();
        }
        const mo = new MutationObserver(update);
        mo.observe(prog, { attributes: true, attributeFilter: ['value', 'max'] });
        aria();
        return {
            step, env, fresh, fastForward, update,
            surface: (PW, PH) => plateSurface(PW, PH, dpr, cfg.seed, { mode: 'col', nx: BAR.N, chisel: cfg.shape === 'chisel', radius: box.h < 14 ? 1 : 2 }),
            api: {
                value: { get: () => +prog.getAttribute('value') || 0, set: (v) => prog.setAttribute('value', String(v)) },
                max: { get: () => want.max, set: (v) => prog.setAttribute('max', String(v)) },
                indeterminate: { get: () => want.ind, set: (v) => (v ? prog.removeAttribute('value') : prog.setAttribute('value', '0')) },
                front: { get: () => pFront() },
            },
            destroy() {
                mo.disconnect();
                ['aria-valuemin', 'aria-valuemax', 'aria-valuenow', 'aria-valuetext'].forEach((a) => el.removeAttribute(a));
                before.role ? el.setAttribute('role', before.role) : el.removeAttribute('role');
                before.label ? el.setAttribute('aria-label', before.label) : el.removeAttribute('aria-label');
                before.lb ? el.setAttribute('aria-labelledby', before.lb) : el.removeAttribute('aria-labelledby');
                prog.removeAttribute('aria-hidden'); prog.removeAttribute('tabindex');
                if (madeProg) prog.remove();
            },
        };
    })();

    /* ======================== button ======================== */
    btn = null;
    if (kind === 'button') btn = (() => {
        let pressing = false, done = false, pfx = 0.5, pfy = 0.5, held = 0, minUntil = 0, rate = 10, hint = null;
        const holdSec = cfg.hold > 0 ? cfg.hold / 1000 : 1.8;
        // a plain button only warms: a click leaves a little straw, a long press reaches purple
        if (!cfg.hold && (opts.to ?? ds.to) == null) cfg.to = nm('purple');
        let passing = false;
        if (cfg.hold > 0) {
            hint = document.createElement('span');
            hint.className = 'tr-sr';
            hint.id = 'tr-hint-' + (cfg.seed >>> 0).toString(36);
            hint.textContent = cfg.hint;
            el.after(hint);
            el.setAttribute('aria-describedby', ((el.getAttribute('aria-describedby') || '') + ' ' + hint.id).trim());
            // a hold-to-confirm button does nothing on a plain click: only a held press confirms
            on(el, 'click', (e) => { if (!passing) { e.preventDefault(); e.stopImmediatePropagation(); } }, { capture: true });
        }
        const faceFrac = 0.8;                      // the top face's share of the button's height
        function press(lx, ly) {
            if (el.disabled || !F) return;
            if (done || state === 'confirmed') { done = false; regrind(); }
            pressing = true; held = 0; minUntil = performance.now() + 260;
            pfx = clamp(lx, 0.02, 0.98); pfy = clamp(ly / faceFrac, 0.05, 0.95);
            heat(pfx, pfy, 1);
            el.classList.add('tr--pressed');
        }
        function release() {
            if (!pressing) return;
            pressing = false;
            el.classList.remove('tr--pressed');
            if (cfg.hold > 0 && !done) el.dispatchEvent(new CustomEvent('temper-run:cancel', { bubbles: true }));
            if (calm.matches && performance.now() >= minUntil) { coastOut(); scheduleReset(); render(); }
            wake();
        }
        function confirm() {
            done = true; F.u = 0;
            setState('confirmed');
            say(cfg.done);
            el.dispatchEvent(new CustomEvent('temper-run:confirm', { bubbles: true }));
            passing = true; try { el.click(); } finally { passing = false; }
        }
        on(el, 'pointerdown', (e) => {
            if (e.button !== 0) return;
            const r = el.getBoundingClientRect();
            try { el.setPointerCapture(e.pointerId); } catch { /* fine */ }
            press((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
        });
        on(el, 'pointerup', release); on(el, 'pointercancel', release); on(el, 'lostpointercapture', release);
        on(el, 'keydown', (e) => {
            if ((e.key === ' ' || e.key === 'Enter') && !e.repeat && !pressing) press(0.5, 0.5 * faceFrac);
        });
        on(el, 'keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') release(); });
        on(el, 'blur', release);
        function step(dt) {
            if (pressing && F.u > 0) {
                held += dt;
                if (cfg.hold > 0 && !done) {
                    const d = Math.sqrt(fieldAt(F, F.D2, pfx * F.nx - 0.5, pfy * F.ny - 0.5));
                    if (d >= cfg.to - 0.6 || held > holdSec * 1.6) confirm();
                }
            } else if (!pressing && F.u > 0 && performance.now() >= minUntil) {
                F.u = 0;
                if (calm.matches) { coastOut(); scheduleReset(); return false; }
            }
            const busy = heatStep(dt, rate, 0.1);
            return busy || F.u > 0;
        }
        return {
            step,
            fresh() { done = false; },
            surface(PW, PH) {
                const Lx = Math.max(24, box.w * MM_PER_PX), Ly = Lx * (box.h * faceFrac) / box.w;
                const nx = Math.round(Lx), ny = Math.max(3, Math.round(Ly));
                const h = { ...H, sw: clamp(Lx * 0.17, 4, 14) };
                if (!F || F.nx !== nx || F.ny !== ny) F = resampled(F, nx, ny, Lx, Ly, { ...h, from: cfg.from, to: cfg.to });
                rate = holdSteelTime(nx, ny, Lx, Ly, h, cfg.to) / holdSec * cfg.speed;
                return plateSurface(PW, PH, dpr, cfg.seed, { mode: 'pix', nx, ny, radius: 3, side: Math.min(0.2, 3.5 / box.h) });
            },
            destroy() {
                if (hint) {
                    const ids = (el.getAttribute('aria-describedby') || '').split(/\s+/).filter((x) => x && x !== hint.id);
                    ids.length ? el.setAttribute('aria-describedby', ids.join(' ')) : el.removeAttribute('aria-describedby');
                    hint.remove();
                }
                el.classList.remove('tr--pressed');
            },
            get pressing() { return pressing; },
        };
    })();

    /* ======================== rule and frame ======================== */
    line = null;
    if (kind === 'rule' || kind === 'frame') line = (() => {
        const rate = H.rate * cfg.speed;
        const isFrame = kind === 'frame';
        let fw = 10;
        // where along the steel a point (local css px) lies, and whether it is near enough to heat
        function locate(x, y) {
            if (!isFrame) return { f: x / box.w, near: true };
            const w = box.w, h = box.h, P = 2 * (w + h);
            const dl = x, dr = w - x, dt = y, db = h - y, m = Math.min(dl, dr, dt, db);
            let s;
            if (m === dt) s = x; else if (m === dr) s = w + y; else if (m === db) s = w + h + (w - x); else s = 2 * w + h + (h - y);
            return { f: s / P, near: m < Math.max(28, fw * 3) };
        }
        const local = (e) => { const r = el.getBoundingClientRect(); return [e.clientX - r.left - box.x, e.clientY - r.top - box.y]; };
        on(el, 'pointermove', (e) => {
            if (e.pointerType === 'touch' && !e.buttons) return;
            const [x, y] = local(e), p = locate(x, y);
            if (p.near) heat(p.f, 0.5, 1); else if (F && F.u > 0) { F.u = 0; wake(); }
        });
        on(el, 'pointerdown', (e) => { const [x, y] = local(e), p = locate(x, y); if (p.near) heat(p.f, 0.5, 1); });
        const off = () => { if (F && F.u > 0) { F.u = 0; if (calm.matches) { coastOut(); scheduleReset(); render(); } wake(); } };
        on(el, 'pointerleave', off); on(el, 'pointerup', (e) => { if (e.pointerType !== 'mouse') off(); }); on(el, 'pointercancel', off);
        on(el, 'focusin', () => { if (el.matches(':focus-visible')) heat(0.5, 0.5, 1); });
        on(el, 'focusout', off);
        function pretemper() {
            if (tempered || !cfg.temper) return;
            tempered = true;
            const at = isFrame ? atFraction(cfg.at, box.w, box.h) : atFraction(cfg.at, 1, 0);
            // run from one place, as a smith runs the colours from the shank: the steel there
            // goes past blue to grey, and the colours spread out ahead of it. The cap on the
            // film (data-to) is for live heat only, so it is lifted for the run.
            const cap = F.cap2, sw = F.sw, Tc = F.Tcap;
            F.cap2 = Infinity; F.sw = 12; F.Tcap = 640;
            F.sx = at * F.Lx; F.u = 1;
            let n = 0;
            while (n++ < 2600 && (n % 4 || coverOf(F) < cfg.temper)) stepField(F, 8);
            coastOut();
            F.cap2 = cap; F.sw = sw; F.Tcap = Tc;
        }
        return {
            step(dt) { return heatStep(dt, rate); },
            surface(PW, PH) {
                if (isFrame) {
                    fw = parseFloat(getComputedStyle(el).getPropertyValue('--tr-frame')) || 10;
                    const P = 2 * (box.w + box.h), Lx = Math.max(40, P * MM_PER_PX), nx = Math.round(clamp(Lx, 40, 1200));
                    if (!F || F.nx !== nx) F = resampled(F, nx, 1, Lx, 1, { ...H, loop: true, from: cfg.from, to: cfg.to });
                    pretemper();
                    return frameSurface(PW, PH, dpr, cfg.seed, { width: fw, nx });
                }
                const Lx = Math.max(20, box.w * MM_PER_PX), nx = Math.round(clamp(Lx, 20, 800));
                if (!F || F.nx !== nx) F = resampled(F, nx, 1, Lx, 1, { ...H, from: cfg.from, to: cfg.to });
                pretemper();
                return plateSurface(PW, PH, dpr, cfg.seed, { mode: 'col', nx, radius: box.h * 0.5, side: 0.3, wobble: 0.6 });
            },
        };
    })();

    const ctrl = bar || btn || line;

    /* ---- geometry ---- */
    function layout() {
        const w = el.offsetWidth, h = el.offsetHeight;
        if (!w || !h) return;
        dpr = Math.min(2, window.devicePixelRatio || 1);
        if (kind === 'rule') {
            const cs = getComputedStyle(el);
            const rh = parseFloat(cs.getPropertyValue('--tr-h')) || 3, gap = parseFloat(cs.getPropertyValue('--tr-gap')) || 0;
            const place = cfg.place || (el.tagName === 'A' || getComputedStyle(el).display.startsWith('inline') ? 'under' : 'center');
            box = { x: 0, y: place === 'under' ? h - rh + gap : Math.round((h - rh) / 2), w, h: rh };
        } else box = { x: 0, y: 0, w, h };
        const lift = kind === 'frame' ? 10 : kind === 'button' ? box.h * 0.55 : box.h;
        pad = kind === 'bar' && box.h >= 12
            ? { t: Math.round(Math.max(14, box.h * 0.6)), b: Math.round(Math.max(16, box.h * 0.75)), s: Math.round(Math.max(14, box.h * 0.6)) }
            : lift < 12 ? { t: 3, b: 5, s: 3 } : { t: Math.round(Math.max(8, lift * 0.45)), b: Math.round(Math.max(12, lift * 0.7)), s: Math.round(Math.max(8, lift * 0.45)) };
        Object.assign(canvas.style, { left: box.x - pad.s + 'px', top: box.y - pad.t + 'px', width: box.w + 2 * pad.s + 'px', height: box.h + pad.t + pad.b + 'px' });
        canvas.width = Math.round((box.w + 2 * pad.s) * dpr);
        canvas.height = Math.round((box.h + pad.t + pad.b) * dpr);
        const PW = Math.max(2, Math.round(box.w * dpr)), PH = Math.max(2, Math.round(box.h * dpr));
        steel.width = PW; steel.height = PH;
        G = ctrl.surface(PW, PH);
        paint = makePainter(G);
        shade = shadowOf(G, dpr, lift);
        fade = null;
        render();
    }

    function render() {
        if (!G || !F) return;
        const env = { F, sheenX, sheenY, glow: null, wet: null };
        if (bar) bar.env(env);
        sctx.putImageData(paint(env), 0, 0);
        const ox = Math.round(pad.s * dpr), oy = Math.round(pad.t * dpr);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 1;
        ctx.drawImage(shade.c, ox - shade.pad, oy - shade.pad);
        ctx.drawImage(steel, ox, oy);
        if (fade) { ctx.globalAlpha = 1 - fade.t; ctx.drawImage(fade.img, ox, oy); ctx.globalAlpha = 1; }
    }

    /* ---- the clock: runs only while something changes ---- */
    function tick(now) {
        raf = 0;
        const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
        last = now;
        frame(dt);
    }
    function frame(dt) {
        if (!F) return;
        let busy = ctrl.step(dt);
        if (fade) { fade.t += dt / 0.6; if (fade.t >= 1) fade = null; else busy = true; }
        const ds2 = Math.abs(sheenTo - sheenX) + Math.abs(sheenYTo - sheenY);
        if (ds2 > 0.001) { const k = clamp(dt * 8); sheenX = mix(sheenX, sheenTo, k); sheenY = mix(sheenY, sheenYTo, k); busy = true; }
        else { sheenX = sheenTo; sheenY = sheenYTo; }
        render();
        if (busy) wake(); else last = 0;
    }
    function wake() {
        if (raf || manual || !visible || document.hidden) return;
        if (calm.matches && !(btn && btn.pressing) && !(F && F.u > 0)) { sheenX = sheenTo; sheenY = sheenYTo; fade = null; render(); return; }
        raf = requestAnimationFrame(tick);
    }

    /* ---- the light follows the mouse, or the phone's tilt ---- */
    on(el, 'pointermove', (e) => {
        if (e.pointerType !== 'mouse') return;
        const r = el.getBoundingClientRect();
        sheenTo = clamp((e.clientX - r.left) / r.width, 0.05, 0.95);
        sheenYTo = clamp((e.clientY - r.top) / r.height, 0.05, 0.95);
        wake();
    });
    on(el, 'pointerleave', () => { sheenTo = cfg.sheen; sheenYTo = 0.35; wake(); });
    import('./tilt.js').then((m) => {
        if (ac.signal.aborted) return;
        const tilt = m.default;
        const fn = () => {
            const to = clamp(cfg.sheen + tilt.x * 0.4, 0.05, 0.95), toY = clamp(0.35 + tilt.y * 0.4, 0.05, 0.95);
            if (Math.abs(to - sheenTo) + Math.abs(toY - sheenYTo) < 0.008) return;   // a steady hand is no reason to redraw
            sheenTo = to; sheenYTo = toY; wake();
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
    let lastSize = '';
    const ro = new ResizeObserver(() => { const s = el.offsetWidth + 'x' + el.offsetHeight; if (s !== lastSize) { lastSize = s; layout(); } });
    ro.observe(el);
    on(calm, 'change', () => {
        if (!calm.matches) return wake();
        if (bar) bar.fastForward(); else if (F && hot) { coastOut(); render(); }
    });

    // first paint: the state for the starting value, without a show
    el.dataset.state = state;
    lastSize = el.offsetWidth + 'x' + el.offsetHeight;
    layout();
    if (bar) bar.fastForward();
    el.classList.add('tr--live');

    function destroy() {
        ac.abort(); io.disconnect(); ro.disconnect();
        timers.forEach(clearTimeout); timers.clear();
        if (raf) cancelAnimationFrame(raf);
        ctrl.destroy && ctrl.destroy();
        canvas.remove(); if (live) live.remove();
        el.classList.remove('tr', 'tr--' + kind, 'tr--live');
        el.removeAttribute('data-state');
        delete el.__temperRun;
    }
    Object.defineProperties(destroy, {
        kind: { value: kind },
        state: { get: () => state },
        ...(bar ? bar.api : {}),
        /** oxide thickness (nm) at fx (0..1 along the steel) and fy (0..1 down a plate) */
        thicknessAt: { value: (fx, fy = 0.5) => F ? Math.sqrt(fieldAt(F, F.D2, fx * F.nx - 0.5, fy * F.ny - 0.5)) : 0 },
        temperatureAt: { value: (fx, fy = 0.5) => F ? fieldAt(F, F.T, fx * F.nx - 0.5, fy * F.ny - 0.5) : Ta },
    });
    /** put heat in at fx (0..1 along the steel; fy down a button's face), or take it away with on = false */
    destroy.heat = (fx = 0.5, fy = 0.5, onOff = true) => { if (onOff) heat(fx, fy, 1); else if (F) { F.u = 0; wake(); } };
    /** rub the face bright again (or, for a bar, start a fresh blank at 0) */
    destroy.reset = () => { if (bar) { regrind(); destroy.value = 0; } else regrind(); };
    /** advance by `dt` seconds of wall time without waiting for a frame (tests, stills) */
    destroy.step = (dt = 1 / 60) => { manual = true; if (raf) { cancelAnimationFrame(raf); raf = 0; } if (bar) bar.update(); frame(dt); };
    el.__temperRun = destroy;
    return destroy;
}

if (typeof document !== 'undefined') {
    const boot = () => document.querySelectorAll('[data-temper-run]').forEach((el) => el.__temperRun || temperRun(el));
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
}
