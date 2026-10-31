/*
 *  SEAGRASS MEADOW // a Posidonia meadow five metres down, simulated.
 *
 *  Markup:  <figure data-seagrass-meadow><img src="assets/meadow-plate.webp" alt="…"></figure>
 *  JS:      import { seagrassMeadow } from './seagrass-meadow.js';
 *           const destroy = seagrassMeadow(el, { blades: 700 });
 *           destroy.pause(); destroy.play(); destroy.sweep(); destroy.state;
 *
 *  Every leaf near the camera is a chain of segments rooted in the sand, with
 *  bending stiffness (EI), buoyancy from its air channels and quadratic drag on
 *  the flow normal to it, plus the added-mass (Morison) force of the water's
 *  own acceleration. The water is three things added together:
 *    1. wave surge: the near-bed orbital velocity of an irregular swell
 *       (three linear waves, periods near 6 s, so the sets come and go),
 *    2. a weak current with a shear layer at the canopy top, rolled up into a
 *       row of Kelvin-Helmholtz vortices (Stuart's exact solution), which is
 *       what drives monami, the travelling waves across the meadow,
 *    3. the swimmer's hand: a sphere, its potential-flow dipole and the
 *       momentum it leaves behind in puffs of wake.
 *  Far leaves use the steady (quasi-static) answer of the same model on the GPU.
 *  Light: caustics from refracting the sun through a wave heightfield, the same
 *  caustics marched through the water for the shafts, Beer-Lambert colour loss
 *  with distance, and leaves that age from the tip (browning, epiphytes).
 */

const calm = matchMedia('(prefers-reduced-motion: reduce)');
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ── physical constants (SI) ───────────────────────────────────────────────────
const RHO = 1025;            // sea water, kg/m³
const G = 9.81;
const CD = 1.95;             // drag coefficient of a flat blade normal to the flow (Luhar & Nepf 2011)
const CF = 0.012;            // skin friction along the blade
const CA = 1.0;              // added-mass coefficient of a flat plate

const SPECIES = {
    // E (Pa), thickness t (m), density deficit Δρ (kg/m³), width (m), length range (m)
    posidonia: { E: 0.45e9, t: 0.40e-3, drho: 300, b: [0.008, 0.0105], L: [0.28, 0.95], leaves: [4, 7], sheath: 0.045 },
    zostera:   { E: 0.40e9, t: 0.25e-3, drho: 220, b: [0.003, 0.0055], L: [0.18, 0.62], leaves: [3, 5], sheath: 0.02 },
};

const DEFAULTS = {
    plate: 'assets/meadow-plate.webp',
    species: 'posidonia',
    blades: 0,               // simulated leaves (0 = auto: 760 desktop, 420 phone)
    far: 0,                  // quasi-static far leaves (0 = auto)
    snow: 0,                 // marine snow particles (0 = auto)
    surge: 0.14,             // orbital velocity amplitude at the bed, m/s (a 25 cm swell at 5 m)
    period: 6.2,             // dominant wave period, s
    current: 0.13,           // current above the canopy, m/s (a gentle tidal stream)
    depth: 5,                // m
    heading: 18,             // surge direction, degrees from screen-right toward the distance
    label: 'A Posidonia seagrass meadow seen from the sand, five metres down: ribbons of leaves sway with the swell under a sunlit surface, and now and then a school of striped salema passes over to graze.',
    sound: true,
    fishImg: 'assets/salema.webp',
    fish: null,              // salema in the school (null = auto: 34, phone 22; 0 = none)
    idle: 24,                // seconds without scroll or touch before the swell dies away and the meadow comes to rest
};

// ── tiny mat4 (column-major) ──────────────────────────────────────────────────
const M = {
    mul(a, b) {
        const o = new Float32Array(16);
        for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
            o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
        }
        return o;
    },
    persp(fy, asp, n, f) {
        const t = 1 / Math.tan(fy / 2), o = new Float32Array(16);
        o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f);
        return o;
    },
    look(eye, fwd) {
        const z = [-fwd[0], -fwd[1], -fwd[2]];
        let x = [z[2], 0, -z[0]]; const xl = Math.hypot(x[0], x[2]); x = [x[0] / xl, 0, x[2] / xl]; // up × z
        const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
        const o = new Float32Array(16);
        o[0] = x[0]; o[4] = x[1]; o[8] = x[2];
        o[1] = y[0]; o[5] = y[1]; o[9] = y[2];
        o[2] = z[0]; o[6] = z[1]; o[10] = z[2];
        o[12] = -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]);
        o[13] = -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]);
        o[14] = -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]);
        o[15] = 1;
        return o;
    },
    inv(m) {
        const o = new Float32Array(16);
        const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m;
        const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10;
        const b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
        const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30;
        const b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
        const d = 1 / (b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06);
        o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * d; o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * d;
        o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * d; o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * d;
        o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * d; o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * d;
        o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * d; o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * d;
        o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * d; o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * d;
        o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * d; o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * d;
        o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * d; o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * d;
        o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * d; o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * d;
        return o;
    },
};

// deterministic random
function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// where the meadow grows: a sand channel (an "intermatte") opens in front of the
// camera and closes with distance, and the cover is patchy. Mirrored in GLSL.
function meadowDensity(x, z) {
    const d = -z;
    const xc = 0.22 * Math.sin(d * 0.45 + 0.8) + 0.08 * d;
    const w = 0.26 + 0.11 * d;
    const open = Math.exp(-(((x - xc) / w) ** 2)) * smooth(5.5, 2.0, d);
    const patch = 0.72 + 0.28 * Math.sin(x * 1.3 + 0.7) * Math.sin(d * 1.1 + 2.0);
    return clamp((1 - 0.92 * open) * patch, 0, 1);
}

// wave dispersion ω² = g k tanh(k h), solved for k by Newton
function waveNumber(omega, h) {
    let k = omega * omega / G;
    for (let i = 0; i < 30; i++) {
        const th = Math.tanh(k * h);
        const f = G * k * th - omega * omega;
        const df = G * th + G * k * h * (1 - th * th);
        k -= f / df;
    }
    return k;
}

// ── the water ─────────────────────────────────────────────────────────────────
class Flow {
    constructor(o, seed) {
        const r = rng(seed);
        this.depth = o.depth;
        this.Uw = o.surge;
        this.U1 = o.current;                 // above the canopy
        this.U2 = o.current * 0.2;           // inside it (a dense canopy slows it to 10-30 %)
        this.Uc = (this.U1 + this.U2) / 2;   // the vortices ride at the mean (Ghisalberti & Nepf 2002)
        this.dU = this.U1 - this.U2;
        this.lam = 0.65;                     // monami wavelength, m (a few shear-layer thicknesses)
        this.kv = TAU / this.lam;
        this.yv = 0.46;                      // shear-layer centre: the (deflected) canopy top, m
        this.heading = o.heading * Math.PI / 180;
        this.tiltAng = 0;
        // current flows across the view, a little toward the camera
        this.dc = [Math.cos(-0.30), 0, Math.sin(-0.30) * -1];
        const n = Math.hypot(this.dc[0], this.dc[2]); this.dc = [this.dc[0] / n, 0, this.dc[2] / n];
        this.dp = [-this.dc[2], 0, this.dc[0]];
        // three swell components (irregular sea: the sets come from their beating)
        const T0 = o.period;
        this.comps = [[0.93, 0.55], [1.05, 0.36], [1.19, 0.22]].map(([f, a], i) => {
            const T = T0 * f, w = TAU / T, k = waveNumber(w, this.depth);
            const spread = (r() - 0.5) * 0.22;
            // surface half-height giving this bed velocity: a = U sinh(kh) / ω
            const U = a * this.Uw;
            return { w, k, U, amp: U * Math.sinh(k * this.depth) / w, ph: r() * TAU, spread, dir: [1, 0], c: 0, s: 0, i };
        });
        this.t = 0;
        this.E = 0;                          // sea state: 0 slack .. 1 the swell running
        this.scroll = 0;                     // current stirred by scrolling the page, m/s along x
        this.setDir();
    }
    setDir() {
        const a = this.heading + this.tiltAng;
        for (const c of this.comps) {
            const b = a + c.spread;
            c.dir = [Math.cos(b), -Math.sin(b)]; // x right, -z away
        }
    }
    // per-step caches
    advance(t) {
        this.t = t;
        for (const c of this.comps) { c.c = Math.cos(c.w * t + c.ph); c.s = Math.sin(c.w * t + c.ph); }
    }
    // surge at a point (phase from the long wave's k·x): writes [ux, uz, ax, az]
    surgeAt(x, z, out) {
        let ux = 0, uz = 0, ax = 0, az = 0;
        for (const c of this.comps) {
            const kx = c.k * (c.dir[0] * x + c.dir[1] * z);
            const ck = Math.cos(kx), sk = Math.sin(kx);
            const cs = c.c * ck + c.s * sk;          // cos(ωt+φ-k·x)
            const sn = c.s * ck - c.c * sk;          // sin(ωt+φ-k·x)
            const u = c.U * cs, a = -c.U * c.w * sn;
            ux += u * c.dir[0]; uz += u * c.dir[1]; ax += a * c.dir[0]; az += a * c.dir[1];
        }
        const E = this.E;
        out[0] = ux * E; out[1] = uz * E; out[2] = ax * E; out[3] = az * E;
        return out;
    }
    // surge along the mean heading at the origin, for the sound cue
    surgeHere() { let u = 0; for (const c of this.comps) u += c.U * c.c * Math.cos(c.spread); return u * this.E; }
    // monami: vortex concentration and spanwise phase of the roll-up at (s, q)
    rho(s, q, t) {
        // trains of three or four vortices (envelope ~3.5 m long) that drift with them and come and go
        const env = Math.sin(1.8 * (s - this.Uc * t) + 0.35 * q + 1.3 * Math.sin(0.07 * t + 0.3 * q));
        return (0.22 + 0.68 * smooth(-0.6, 0.6, env)) * this.E;
    }
    phi(q) { return 0.9 * Math.sin(0.45 * q + 1.3) + 0.4 * Math.sin(1.1 * q + 4.1); }
}

// ── the meadow (physics + placement) ──────────────────────────────────────────
function buildMeadow(o, view, seed) {
    const sp = SPECIES[o.species] || SPECIES.posidonia;
    const r = rng(seed);
    const S = 8;
    const leaves = [];
    const nTarget = o.blades;
    const zNear = 0.42, zFar = 2.9;
    const tx = view.tanX;
    // shoots on jittered positions, density ∝ meadowDensity, uniform in ground area
    let guard = 0;
    while (leaves.length < nTarget && guard++ < 20000) {
        // area-uniform in a frustum slice: d ~ sqrt(uniform)
        const d = Math.sqrt(zNear * zNear + r() * (zFar * zFar - zNear * zNear));
        const half = d * tx + 0.25;
        const x = (r() * 2 - 1) * half + view.cx * d;
        const z = -d;
        if (r() > meadowDensity(x, z)) continue;
        const nl = sp.leaves[0] + Math.floor(r() * (sp.leaves[1] - sp.leaves[0] + 1));
        const axis = r() * Math.PI;
        const shootLen = sp.L[0] + (sp.L[1] - sp.L[0]) * Math.pow(r(), 0.8);
        for (let j = 0; j < nl && leaves.length < nTarget; j++) {
            // distichous fan: outer leaves are the oldest and longest
            const rank = nl === 1 ? 0 : (j / (nl - 1)) * 2 - 1;
            const age = clamp(0.25 + 0.75 * Math.abs(rank) + (r() - 0.5) * 0.3, 0, 1);
            const L = shootLen * (0.55 + 0.45 * age) * (0.9 + 0.2 * r());
            const fan = rank * (0.14 + 0.2 * r()) + (r() - 0.5) * 0.12;
            leaves.push({
                x: x + Math.cos(axis) * rank * 0.006, z: z + Math.sin(axis) * rank * 0.006,
                L, b: sp.b[0] + (sp.b[1] - sp.b[0]) * r(), age, seed: r(), axis,
                twist: (r() - 0.5) * 1.6, fan, fanDir: [Math.cos(axis), Math.sin(axis)],
            });
        }
    }
    const N = leaves.length;
    const pos = new Float32Array(N * (S + 1) * 3);
    const vel = new Float32Array(N * (S + 1) * 3);
    const frc = new Float32Array(N * (S + 1) * 3);
    const rest = new Float32Array(N * 3);
    const par = new Float32Array(N * 8); // ds, m, fb, kb, cdl, cfl, mai, L
    leaves.forEach((lf, i) => {
        const ds = lf.L / S;
        const I = lf.b * sp.t ** 3 / 12;
        const EI = sp.E * I;
        const mLen = (RHO - sp.drho) * lf.b * sp.t + CA * RHO * Math.PI * lf.b * lf.b / 4;
        const fb = sp.drho * G * lf.b * sp.t;
        par.set([ds, mLen * ds, fb * ds, EI / (ds * ds * ds), 0.5 * RHO * CD * lf.b * ds, 0.5 * RHO * CF * 2 * lf.b * ds,
            (RHO * lf.b * sp.t + CA * RHO * Math.PI * lf.b * lf.b / 4) * ds, lf.L], i * 8);
        const sf = Math.sin(lf.fan), cf = Math.cos(lf.fan);
        const rd = [lf.fanDir[0] * sf, cf, lf.fanDir[1] * sf];
        rest.set(rd, i * 3);
        for (let k = 0; k <= S; k++) {
            const o3 = (i * (S + 1) + k) * 3;
            pos[o3] = lf.x + rd[0] * ds * k; pos[o3 + 1] = rd[1] * ds * k; pos[o3 + 2] = lf.z + rd[2] * ds * k;
        }
    });
    return { leaves, N, S, pos, vel, frc, rest, par, sp };
}

// LOD leaves: placed from zFar of the simulated ones out into the blue
function buildFar(o, view, seed, sp) {
    const r = rng(seed);
    const out = [];
    // from just behind the nearest simulated leaves out to where the canopy medium takes over
    const z0 = 0.6, z1 = 7.5;
    let guard = 0;
    while (out.length < o.far && guard++ < 60000) {
        const d = Math.sqrt(z0 * z0 + r() * (z1 * z1 - z0 * z0));
        const half = d * view.tanX + 0.6;
        const x = (r() * 2 - 1) * half + view.cx * d;
        // shoots grow in clumps (a rhizome branches and runs), so the cover is lumpy at the 20-50 cm scale
        const clump = 0.3 + 0.7 * smooth(-0.6, 0.9, Math.sin(x * 7.3 + 1.1) * Math.sin(d * 6.1 + 0.4) + 0.6 * Math.sin(x * 3.1 - d * 4.3 + 2.0));
        if (r() > meadowDensity(x, -d) * clump) continue;
        const nl = sp.leaves[0] + Math.floor(r() * (sp.leaves[1] - sp.leaves[0] + 1));
        const axis = r() * Math.PI, sl = sp.L[0] + (sp.L[1] - sp.L[0]) * Math.pow(r(), 0.8);
        for (let j = 0; j < nl && out.length < o.far; j++) {
            const rank = nl === 1 ? 0 : (j / (nl - 1)) * 2 - 1;
            const age = clamp(0.25 + 0.75 * Math.abs(rank) + (r() - 0.5) * 0.3, 0, 1);
            out.push([x, -d, sl * (0.55 + 0.45 * age), sp.b[0] + (sp.b[1] - sp.b[0]) * r(), r(), axis, age, rank * (0.14 + 0.2 * r()) + (r() - 0.5) * 0.12]);
        }
    }
    return out;
}

// ── shaders ───────────────────────────────────────────────────────────────────
const GLSL_COMMON = `
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), f.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), f.x), f.y); }
float meadowDensity(float x, float z){
  float d = -z;
  float xc = 0.22*sin(d*0.45+0.8) + 0.08*d;
  float w = 0.26 + 0.11*d;
  float t = clamp((d-5.5)/(2.0-5.5), 0., 1.); t = t*t*(3.-2.*t);
  float open = exp(-pow((x-xc)/w, 2.)) * t;
  float patchy = 0.72 + 0.28*sin(x*1.3+0.7)*sin(d*1.1+2.0);
  return clamp((1.-0.92*open)*patchy, 0., 1.);
}
uniform vec4 u_crop;      // plate-NDC centre (xy) and half-size (zw) of what the element shows
uniform vec2 u_vpx;       // viewport, px
uniform sampler2D u_plate;
uniform float u_hv;       // horizon row in plate uv
uniform float u_band;     // top edge of the water band, plate NDC y (the canvas rises above it, into the page)
bool aboveBand(vec2 fragCoord){ vec2 n = fragCoord/u_vpx*2.-1.; return u_crop.y + u_crop.w*n.y > u_band; }
vec2 plateUV(vec2 screenNdc){ vec2 p = u_crop.xy + u_crop.zw*screenNdc; return vec2(p.x*.5+.5, .5-p.y*.5); }
vec3 fogColor(vec2 fragCoord){
  vec2 n = fragCoord/u_vpx*2.-1.;
  vec2 uv = plateUV(n);
  return textureLod(u_plate, vec2(clamp(uv.x,0.,1.), u_hv-0.035), 4.5).rgb;
}
`;

const VS_QUAD = `#version 300 es
out vec2 v_ndc;
void main(){ vec2 p = vec2((gl_VertexID<<1)&2, gl_VertexID&2); v_ndc = p*2.-1.; gl_Position = vec4(p*2.-1., 0, 1); }`;

// caustics: refract the sun through the wave heightfield, splat the floor hits,
// irradiance = (area before) / (area after). Classic, after Evan Wallace's WebGL Water.
const VS_CAUSTIC = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_uv;
uniform float u_tile, u_depth, u_t;
uniform vec4 u_wk[10];  // kx, kz, amp, phase
uniform float u_ww[10]; // omega
uniform vec2 u_swell;   // uniform slope of the long swell
uniform vec3 u_sunAir;  // direction of travel of sunlight in air (pointing down)
out vec2 v_old; out vec2 v_new;
void main(){
  vec2 off = vec2(float(gl_InstanceID%3)-1., float(gl_InstanceID/3)-1.);
  vec2 x = a_uv*u_tile;
  vec2 g = u_swell;
  for(int i=0;i<10;i++){ float th = dot(u_wk[i].xy, x) - u_ww[i]*u_t + u_wk[i].w; g += -u_wk[i].z*u_wk[i].xy*sin(th); }
  vec3 n = normalize(vec3(-g.x, 1., -g.y));
  vec3 r = refract(u_sunAir, n, 1./1.333);
  vec3 r0 = refract(u_sunAir, vec3(0,1,0), 1./1.333);
  vec2 hit = x + r.xz*(u_depth/-r.y) - r0.xz*(u_depth/-r0.y);
  v_old = x; v_new = hit;
  vec2 uv = hit/u_tile + off;
  gl_Position = vec4(uv*2.-1., 0., 1.);
}`;
const FS_CAUSTIC = `#version 300 es
precision highp float;
in vec2 v_old; in vec2 v_new; out vec4 o;
void main(){
  vec2 ox = dFdx(v_old), oy = dFdy(v_old), nx = dFdx(v_new), ny = dFdy(v_new);
  float a0 = abs(ox.x*oy.y - ox.y*oy.x), a1 = abs(nx.x*ny.y - nx.y*ny.x);
  float I = min(a0/max(a1, 1e-12), 7.);
  o = vec4(vec3(I*0.14), 1.);
}`;

// god rays: march the view ray, sample the caustic pattern carried down each sun ray
const FS_RAYS = `#version 300 es
precision highp float;
${GLSL_COMMON}
in vec2 v_ndc; out vec4 o;
uniform mat4 u_ivp; uniform vec3 u_cam, u_L; uniform sampler2D u_caus; uniform float u_tile, u_t;
void main(){
  vec2 pn = u_crop.xy + u_crop.zw*v_ndc;
  vec4 a = u_ivp*vec4(pn, -1, 1), b = u_ivp*vec4(pn, 1, 1);
  vec3 dir = normalize(b.xyz/b.w - a.xyz/a.w);
  float tMax = 16.;
  if(dir.y < -1e-4) tMax = min(tMax, u_cam.y/-dir.y);
  if(dir.y > 1e-4) tMax = min(tMax, (4.6-u_cam.y)/dir.y);
  const int N = 14;
  float dt = tMax/float(N);
  float j = hash12(gl_FragCoord.xy + fract(u_t*7.)*61.);
  float s = 0.;
  for(int i=0;i<N;i++){
    float t = (float(i)+j)*dt;
    vec3 P = u_cam + dir*t;
    vec2 Q = P.xz - u_L.xz*(P.y/u_L.y);
    float lod = 1.6 + 0.5*log2(1. + t);
    float c = textureLod(u_caus, Q/u_tile, lod).r/0.14;
    s += max(c - 0.82, 0.) * exp(-0.16*t) * dt * (0.55 + 0.45*clamp(P.y/2., 0., 1.));
  }
  float mu = dot(dir, u_L);
  float g = 0.72;
  float hg = (1.-g*g)/pow(1.+g*g-2.*g*mu, 1.5) / 12.566;
  o = vec4(vec3(s*hg), 1.);
}`;

// background: the plate above the horizon (with a living surface), sand below
const FS_BG = `#version 300 es
precision highp float;
${GLSL_COMMON}
in vec2 v_ndc; out vec4 o;
uniform mat4 u_ivp; uniform vec3 u_cam, u_L, u_sun, u_amb, u_sigma; uniform vec2 u_sdir;
uniform sampler2D u_caus, u_shadow, u_rays; uniform float u_tile, u_t, u_raysGain; uniform vec4 u_shRect;
uniform vec4 u_wk[10]; uniform float u_ww[10];
uniform vec4 u_mon; uniform vec4 u_dc;
// the far meadow as a medium: past the drawn leaves, hundreds of shoots per square metre are
// too many and too small to see one by one, so the canopy layer (sand to ~0.42 m) is treated
// as a cloud of leaf area with an effective extinction, lit like a leaf, fogged like one, and
// bowed by the same monami vortices (bent leaves turn their faces up, so a passing crest brightens)
vec4 canopyMedium(vec3 dir, float tFloor, vec3 fogc){
  float hc = 0.42;
  float tEnd = dir.y < 0. ? tFloor : (dir.y > 1e-4 ? (hc - u_cam.y)/dir.y : 40.);
  tEnd = min(tEnd, 40.);
  float t0 = 3.0;
  if(tEnd <= t0) return vec4(0, 0, 0, 1);
  const int N = 12;
  float j = hash12(gl_FragCoord.xy);
  float Tm = 1.;
  vec3 acc = vec3(0);
  // geometric steps: dense near the start, long in the distance
  float r = pow(tEnd/t0, 1./float(N));
  float ta = t0;
  for(int i=0;i<N;i++){
    float tb = ta*r;
    float t = mix(ta, tb, j);
    vec3 P = u_cam + dir*t;
    float md = meadowDensity(P.x, P.z);
    float clump = smoothstep(0.25, 0.75, vnoise(P.xz*5.5 + 7.)*0.7 + vnoise(P.xz*17.)*0.3);
    // monami: Stuart vortex row riding the canopy top
    float s = dot(P.xz, u_dc.xy), q = dot(P.xz, u_dc.zw);
    float env = sin(1.8*(s - u_mon.x*u_t) + 0.35*q + 1.3*sin(0.07*u_t + 0.3*q));
    float rho = 0.22 + 0.68*smoothstep(-0.6, 0.6, env);
    float phi = 0.9*sin(0.45*q + 1.3) + 0.4*sin(1.1*q + 4.1);
    float kx = u_mon.z*(s - u_mon.x*u_t) + phi;
    float bow = rho*sin(kx);                       // ∝ the downward sweep at the canopy top
    float top = hc*(1. - 0.12*bow);
    float inside = smoothstep(top, top - 0.12, P.y);
    float k = 2.6*md*mix(0.45, 1., clump)*inside*smoothstep(t0, t0 + 2.5, t);
    float a = 1. - exp(-k*(tb - ta));
    // leaf colour: sun through the canopy plus sky, deeper green low down
    vec3 leaf = mix(vec3(0.20, 0.36, 0.13), vec3(0.32, 0.50, 0.18), smoothstep(0., hc, P.y)) * mix(0.8, 1.15, clump);
    vec3 E = u_amb*0.9 + u_sun*u_L.y*(0.45 + 0.35*smoothstep(0., hc, P.y))*(1. + 0.35*bow);
    vec3 c = leaf*E;
    vec3 T = exp(-u_sigma*t);
    c = c*T + fogc*(1. - T);
    acc += Tm*a*c;
    Tm *= 1. - a;
    ta = tb;
  }
  return vec4(acc, Tm);
}
void bgBody(){
  vec2 pn = u_crop.xy + u_crop.zw*v_ndc;
  vec4 a = u_ivp*vec4(pn, -1, 1), b = u_ivp*vec4(pn, 1, 1);
  vec3 dir = normalize(b.xyz/b.w - a.xyz/a.w);
  vec2 uv = vec2(pn.x*.5+.5, .5-pn.y*.5);
  vec3 col;
  vec3 fogc = fogColor(gl_FragCoord.xy);
  // the surface overhead: a little refraction wobble from the same ripples
  float up = smoothstep(0.12, 0.5, dir.y);
  vec2 sp = u_cam.xz + dir.xz*(4.6/max(dir.y, 0.05));
  vec2 g = vec2(0);
  for(int i=0;i<5;i++){ float th = dot(u_wk[i].xy, sp) - u_ww[i]*u_t + u_wk[i].w; g += -u_wk[i].z*u_wk[i].xy*sin(th); }
  vec3 plate = texture(u_plate, uv + g*0.09*up).rgb;
  col = plate;
  if(dir.y < 0.){
    float t = u_cam.y/-dir.y;
    vec3 P = u_cam + dir*t;
    vec2 x = P.xz;
    float near = exp(-t*0.35);
    // pale carbonate sand: grains, mottling, organic litter under the meadow
    float gr = mix(0.5, vnoise(x*170.)*0.55 + vnoise(x*52.)*0.45, near);
    float mot = vnoise(x*4.3)*0.6 + vnoise(x*11.)*0.4;
    vec3 alb = vec3(0.88, 0.86, 0.77)*(0.86 + 0.2*gr)*(0.9 + 0.16*mot);
    float md = meadowDensity(x.x, x.y);
    float litter = smoothstep(0.45, 0.8, vnoise(x*vec2(9., 26.) + 3.)) * md;
    alb = mix(alb, alb*vec3(0.55, 0.52, 0.40), md*0.45 + litter*0.35);
    // wave ripples in the open sand: crests across the surge, λ ≈ 0.65 × orbital diameter
    float rp = dot(x, u_sdir)*(6.2832/0.12) + 2.5*vnoise(x*1.7);
    float slope = sin(rp)*pow(abs(cos(rp*0.5)), 0.5);
    float rip = 1. + 0.32*slope*dot(vec2(u_sdir.x, u_sdir.y), normalize(u_L.xz))*(1.-md)*exp(-t*0.3);
    // light: diffuse sky plus the sun's caustic net, minus the leaves' shadows
    vec2 suv = (x - u_shRect.xy)/u_shRect.zw;
    float sh = (suv.x>0. && suv.x<1. && suv.y>0. && suv.y<1.) ? texture(u_shadow, suv).r : 0.;
    // under the canopy the bed gets a fraction of the light (dense meadows pass 10-30 %)
    sh = max(sh, md*0.55);
    // the sun's disc (0.5°) blurs the net by ~4 cm at this depth: never sample finer than that
    float lod = clamp(log2(t*1.2) + 1.0, 1.4, 6.);
    float c = textureLod(u_caus, x/u_tile, lod).r/0.14;
    c = 1. + (min(c, 4.) - 1.)*0.55;
    vec3 E = u_amb*(1. - 0.35*md) + u_sun*u_L.y*c*(1.-sh)*0.9;
    col = alb*E*rip;
    vec3 T = exp(-u_sigma*t);
    col = col*T + fogc*(1.-T);
  }
  {
    float tF = dir.y < 0. ? u_cam.y/-dir.y : 1e4;
    vec4 cm = canopyMedium(dir, tF, fogc);
    col = col*cm.a + cm.rgb;
  }
  col += texture(u_rays, gl_FragCoord.xy/u_vpx).rgb * u_sun * u_raysGain;
  o = vec4(col, 1.);
}
void main(){ if(aboveBand(gl_FragCoord.xy)) { o = vec4(0.); return; } bgBody(); }`;

// leaves: ribbons, near ones from the simulated node chains, far ones quasi-static
const VS_BLADE = (lod, shadow) => `#version 300 es
precision highp float; precision highp int;
${lod ? '#define LOD 1' : ''}
${shadow ? '#define SHADOW 1' : ''}
layout(location=0) in vec2 a_vert;    // row, side
layout(location=1) in vec4 a_i0;
layout(location=2) in vec4 a_i1;
uniform mat4 u_vp; uniform vec3 u_cam; uniform vec2 u_vpx; uniform float u_rows;
uniform vec4 u_shRect; uniform vec3 u_L;
#ifdef LOD
uniform vec4 u_sw[3]; uniform vec4 u_sk[3]; uniform float u_t;
uniform vec4 u_mon; uniform vec4 u_mon2; uniform vec4 u_dc; uniform float u_rdb;
uniform vec4 u_hand; uniform vec3 u_handV;
#else
uniform highp sampler2D u_nodes; uniform int u_S;
#endif
out vec2 v_uv; out vec3 v_P; out vec3 v_N; out vec3 v_W; out vec4 v_info; out float v_cov; out float v_twist;
vec3 rotAx(vec3 v, vec3 k, float a){ return v*cos(a) + cross(k, v)*sin(a) + k*dot(k, v)*(1.-cos(a)); }
#ifndef LOD
vec3 nd(int i, int id){ return texelFetch(u_nodes, ivec2(i, id), 0).xyz; }
vec3 ext(int i, int id){
  if(i < 0) return 2.*nd(0,id) - nd(1,id);
  if(i > u_S) return 2.*nd(u_S,id) - nd(u_S-1,id);
  return nd(i,id);
}
#endif
void main(){
  float u = a_vert.x/(u_rows-1.);
  float side = a_vert.y;
  vec3 C, T, H; float len, wid, age, seed, axis, twist;
#ifdef LOD
  vec2 root = a_i0.xy; len = a_i0.z; wid = a_i0.w; seed = a_i1.x; axis = a_i1.y; age = a_i1.z; float fan = a_i1.w;
  twist = (seed-.5)*1.4;
  // surge: the leaf's upper part rides the water's orbital excursion (A << L)
  vec2 X = vec2(0); vec2 Uh = vec2(0);
  for(int i=0;i<3;i++){
    float th = u_sw[i].w*u_t + u_sk[i].z - dot(u_sk[i].xy, root);
    X += u_sw[i].xy*(u_sw[i].z/u_sw[i].w)*sin(th);
    Uh += u_sw[i].xy*u_sw[i].z*cos(th);
  }
  // current + rolled-up shear layer (Stuart vortices) at 0.6 of the leaf height
  float s = dot(root, u_dc.xy), q = dot(root, u_dc.zw);
  float yv = u_mon.w;
  float y = 0.6*len;
  float env = sin(1.8*(s - u_mon.x*u_t) + 0.35*q + 1.3*sin(0.07*u_t + 0.3*q));
  float rho = (0.22 + 0.68*smoothstep(-0.6, 0.6, env))*u_mon2.x;   // sea state: no vortices on a slack sea
  float phi = 0.9*sin(0.45*q + 1.3) + 0.4*sin(1.1*q + 4.1);
  float kx = u_mon.z*(s - u_mon.x*u_t) + phi;
  float ky = u_mon.z*(y - yv);
  float e = exp(ky), D = 0.5*(e + 1./e) - rho*cos(kx);
  float us = u_mon.x + 0.5*u_mon.y*(0.5*(e - 1./e))/D;
  // quasi-static lean: drag on the normal flow against buoyancy
  vec2 uvec = u_dc.xy*us + Uh*0.35 + vec2(u_mon2.y, 0.);            // + the current your scrolling stirs up
  float ratio = u_rdb*dot(uvec, uvec);
  float thc = 1.25*(1. - exp(-ratio*0.7));
  vec2 lean = (length(uvec) > 1e-5 ? normalize(uvec) : vec2(1,0))*thc + X/len*1.25;
  vec2 fanv = vec2(cos(axis), sin(axis))*fan;
  lean += fanv;
  // the hand: leaves near it are pushed aside and dragged along (the near leaves do this in full)
  if(u_hand.w > 0.){
    vec3 hr = vec3(root.x, 0.6*len*cos(min(length(lean), 1.2)), root.y) - u_hand.xyz;
    float hd = length(hr);
    float hp = smoothstep(0.32, 0.06, hd)*u_hand.w;
    vec2 away = length(hr.xz) > 1e-4 ? normalize(hr.xz) : vec2(0.);
    lean += (away*0.9 + u_handV.xz*1.4)*hp;
  }
  float lt = min(length(lean), 1.45);
  vec2 ld = length(lean) > 1e-5 ? lean/length(lean) : vec2(1,0);
  // integrate the bent centreline: angle grows toward the tip
  float ds = len/(u_rows-1.);
  vec3 P = vec3(root.x, 0., root.y);
  int row = int(a_vert.x + .5);
  for(int j=0;j<16;j++){
    if(j >= row) break;
    float f = (float(j)+.5)/(u_rows-1.);
    float a = lt*pow(f, 0.8);
    P += ds*vec3(ld.x*sin(a), cos(a), ld.y*sin(a));
  }
  float a = lt*pow(u, 0.8);
  C = P; T = vec3(ld.x*sin(a), cos(a), ld.y*sin(a));
  H = vec3(ld.x, 0, ld.y)*lt*len;
#else
  int id = int(a_i0.x + .5); wid = a_i0.y; len = a_i0.z; age = a_i0.w;
  seed = a_i1.x; axis = a_i1.y; twist = a_i1.z;
  float f = u*float(u_S); int i = int(min(floor(f), float(u_S-1))); float t = f - float(i);
  vec3 p0 = ext(i-1,id), p1 = ext(i,id), p2 = ext(i+1,id), p3 = ext(i+2,id);
  vec3 c1 = -p0 + p2, c2 = 2.*p0 - 5.*p1 + 4.*p2 - p3, c3 = -p0 + 3.*p1 - 3.*p2 + p3;
  C = 0.5*(2.*p1 + c1*t + c2*t*t + c3*t*t*t);
  T = normalize(0.5*(c1 + 2.*c2*t + 3.*c3*t*t) + vec3(0, 1e-6, 0));
  H = nd(u_S,id) - nd(0,id);
#endif
  // width axis: the leaf turns its flat face to the flow and bends about its weak axis
  vec3 ax = vec3(cos(axis), 0., sin(axis));
  vec2 hh = H.xz;
  float hl = length(hh);
  if(hl > 1e-4){
    vec3 pp = vec3(-hh.y, 0., hh.x)/hl;
    if(dot(pp, ax) < 0.) pp = -pp;
    ax = normalize(mix(ax, pp, smoothstep(0.02, 0.25*len, hl)));
  }
  vec3 W = ax - T*dot(ax, T);
  W = length(W) > 1e-4 ? normalize(W) : normalize(cross(T, vec3(0,0,1)));
  W = rotAx(W, T, twist*u);
  vec3 N = normalize(cross(T, W));
  // ribbon of constant width, a short rounded tip, slightly narrower at the sheath
  float hw = 0.5*wid*(u > 0.965 ? sqrt(max(0., 1. - pow((u-0.965)/0.035, 2.))) : 1.)*(0.85 + 0.15*smoothstep(0., 0.06, u));
#ifdef SHADOW
  // shadows on the sand: projected along the sun; a thin leaf's shadow is kept a texel wide but lighter
  float texel = u_shRect.z/512.;
  float hwS = max(hw, texel*0.9);
  vec3 Pw = C + W*hwS*side;
  vec2 Q = Pw.xz - u_L.xz*(Pw.y/u_L.y);
  vec2 sc = (Q - u_shRect.xy)/u_shRect.zw;
  gl_Position = vec4(sc*2.-1., 0., 1.);
  v_P = Pw; v_uv = vec2(u, side); v_N = N; v_W = W; v_info = vec4(age, seed, len, wid); v_cov = hw/hwS; v_twist = 0.;
#else
  vec4 cc = u_vp*vec4(C, 1.);
  vec4 ce = u_vp*vec4(C + W*hw, 1.);
  vec2 dpx = (ce.xy/ce.w - cc.xy/cc.w)*0.5*u_vpx;
  float px = length(dpx);
  float k = max(1., 0.55/max(px, 1e-4));
  vec3 Pw = C + W*hw*k*side;
  gl_Position = u_vp*vec4(Pw, 1.);
  v_P = Pw; v_uv = vec2(u, side); v_N = N; v_W = W; v_info = vec4(age, seed, len, wid); v_cov = 1./k; v_twist = twist;
#endif
}`;

const FS_BLADE = (shadow) => shadow ? `#version 300 es
precision highp float;
in vec2 v_uv; in vec3 v_P; in vec3 v_N; in vec3 v_W; in vec4 v_info; in float v_cov; in float v_twist;
out vec4 o;
void main(){ float a = 0.7*mix(0.35, 1., v_cov)*exp(-v_P.y*0.9); o = vec4(a, a, a, 1.); }`
    : `#version 300 es
precision highp float;
${GLSL_COMMON}
in vec2 v_uv; in vec3 v_P; in vec3 v_N; in vec3 v_W; in vec4 v_info; in float v_cov; in float v_twist;
out vec4 o;
uniform vec3 u_cam, u_L, u_sun, u_amb, u_ambUp, u_sigma; uniform sampler2D u_caus, u_rays; uniform float u_tile, u_raysGain, u_sheath;
void main(){
  float u = v_uv.x, side = v_uv.y;
  float age = v_info.x, seed = v_info.y, len = v_info.z, wid = v_info.w;
  vec3 P = v_P;
  vec3 V = normalize(u_cam - P);
  float dist = length(u_cam - P);
  vec3 N = normalize(v_N); if(dot(N, V) < 0.) N = -N;
  float sm = u*len;                         // metres from the base
  float cm = side*wid*50.;                  // across, in cm-ish units
  // pigment: young leaves a fresh yellow-green, older ones deeper; and along each leaf the
  // youngest tissue is at the base (Posidonia grows from a basal meristem), the oldest at the tip
  vec3 young = vec3(0.47, 0.70, 0.21), old = vec3(0.25, 0.43, 0.14);
  float hue = fract(seed*7.31) - .5;
  vec3 base = mix(young, old, age)*(0.86 + 0.28*seed) + vec3(0.05, 0.02, -0.02)*hue;
  vec3 fresh = vec3(0.56, 0.78, 0.30);
  base = mix(fresh, base, smoothstep(0.02, 0.38, u)*0.75 + 0.25*age);
  // parallel veins (Posidonia has 13-17), only resolvable close up
  float vein = abs(sin(side*3.1416*6.5 + seed*7.));
  base *= 1. - 0.07*smoothstep(0.75, 1., vein)*exp(-dist*0.9);
  // leaf sheath at the base, brown and fibrous
  base = mix(vec3(0.36, 0.33, 0.17), base, smoothstep(u_sheath*0.3, u_sheath*1.1, sm));
  // old tissue: tip browning, the line between ragged
  float bf = pow(age, 1.6)*0.42*(0.55 + 0.9*fract(seed*13.7));
  float edge = 1. - bf + 0.035*(vnoise(vec2(side*2.5, seed*40.)) - .5);
  float brown = smoothstep(edge - 0.03, edge + 0.025, u);
  vec3 dead = mix(vec3(0.47, 0.38, 0.18), vec3(0.58, 0.50, 0.34), smoothstep(edge + 0.04, 1., u));
  base = mix(base, dead, brown*step(0.02, bf));
  // epiphytes: a furry olive-brown film toward the tip of older leaves, with crusts of coralline algae
  float cov = age*smoothstep(0.2, 1., u);
  float film = vnoise(vec2(sm*90., cm*1.2 + seed*30.))*0.6 + vnoise(vec2(sm*23., seed*11.))*0.4;
  base = mix(base, vec3(0.44, 0.40, 0.27), cov*0.75*smoothstep(0.25, 0.75, film));
  vec2 cell = vec2(sm*420., cm*3.2 + seed*91.);
  vec2 cf = fract(cell) - .5 + (vec2(hash12(floor(cell)+7.), hash12(floor(cell)+3.)) - .5)*0.4;
  float crust = step(1. - cov*0.18, hash12(floor(cell))) * smoothstep(0.42, 0.12, length(cf*vec2(1., 1.6)));
  base = mix(base, vec3(0.74, 0.66, 0.64), crust*0.6*exp(-dist*0.5));
  // the blade is slightly cupped across its width, so the light rolls across it
  vec3 Wd = normalize(v_W);
  N = normalize(N + Wd*side*0.3);
  if(dot(N, V) < 0.) N = -N;
  // light: the same caustic net that lies on the sand crawls over the leaves
  vec2 Q = P.xz - u_L.xz*(P.y/u_L.y);
  float lod = clamp(log2(dist*1.3) + 0.4, 0.8, 6.);
  float c = textureLod(u_caus, Q/u_tile, lod).r/0.14;
  c = 1. + (min(c, 4.5) - 1.)*0.95;
  float canopy = mix(0.38, 1., smoothstep(0.0, 0.55, P.y));     // light lost through the canopy above
  vec3 direct = u_sun*c*canopy;
  float ndl = dot(N, u_L);
  // a leaf 0.4 mm thick passes a good share of green-yellow light: lit from behind it glows,
  // most where we look toward the sun (forward scattering) and at its thinner margins
  vec3 trans = base*vec3(1.3, 1.2, 0.5)*mix(1., 0.45, brown)*(1. - cov*0.4);
  float toSun = max(dot(-V, u_L), 0.);
  float back = pow(toSun, 2.5);
  float margin = smoothstep(0.6, 1., abs(side));
  float graze = 1. - abs(dot(normalize(v_N), V));
  // ambient: darker toward the base, where the canopy hides the sky
  float ao = mix(0.55, 1., smoothstep(0., 0.6, u)) * mix(0.75, 1., smoothstep(0., 0.4, P.y));
  vec3 amb = mix(u_amb*0.8, u_ambUp, N.y*.5 + .5)*ao;
  vec3 col = base*(amb + direct*max(ndl, 0.)*1.05)
           + trans*direct*(max(-ndl, 0.)*1.0 + back*(0.9 + 0.9*margin + 0.6*graze) + 0.14);
  // wet cuticle: a broad, faint sheen rather than a hard glint
  vec3 Hh = normalize(u_L + V);
  col += u_sun*min(c, 2.)*pow(max(dot(N, Hh), 0.), 14.)*0.045*canopy;
  float lum = dot(col, vec3(0.3, 0.55, 0.15));
  col = mix(vec3(lum), col, 0.84);
  // water between us and the leaf: Beer-Lambert per channel, in-scatter from the plate
  vec3 Tr = exp(-u_sigma*dist);
  col = col*Tr + fogColor(gl_FragCoord.xy)*(1. - Tr);
  col += texture(u_rays, gl_FragCoord.xy/u_vpx).rgb*u_sun*u_raysGain*(1. - exp(-dist*0.18));
  float a = clamp(v_cov*1.4, 0.18, 1.);
  // above the water, on the page: the leaves the canvas cannot hold thin out at its sides and top
  // instead of ending on a cut line
  if(aboveBand(gl_FragCoord.xy)){
    vec2 q = gl_FragCoord.xy/u_vpx;
    a *= smoothstep(0., .035, q.x)*(1. - smoothstep(.965, 1., q.x))*(1. - smoothstep(.9, 1., q.y));
    o = vec4(col*a, a);                    // premultiplied, for the page behind
    return;
  }
  o = vec4(col, a);
}`;

const VS_SNOW = `#version 300 es
precision highp float;
layout(location=0) in vec4 a_p;   // xyz, size (m)
uniform mat4 u_vp; uniform vec3 u_cam; uniform float u_focal;
out float v_a; out float v_d;
void main(){
  vec4 c = u_vp*vec4(a_p.xyz, 1.);
  gl_Position = c;
  float d = length(a_p.xyz - u_cam);
  float sz = a_p.w*u_focal/d;
  float coc = abs(1./d - 1./1.4)*3.0;             // out of focus near and far (focused ~1.4 m)
  gl_PointSize = clamp(sz + coc*u_focal*0.004, 1.2, 24.);
  v_a = clamp(sz*sz/(gl_PointSize*gl_PointSize)*3., 0.05, 0.9);
  v_d = d;
}`;
const FS_SNOW = `#version 300 es
precision highp float;
${GLSL_COMMON}
in float v_a; in float v_d; out vec4 o;
uniform vec3 u_sun, u_sigma;
void main(){
  vec2 p = gl_PointCoord*2.-1.;
  float r = dot(p,p);
  if(r > 1. || aboveBand(gl_FragCoord.xy)) discard;
  float a = v_a*smoothstep(1., 0.35, r);
  vec3 Tr = exp(-u_sigma*v_d);
  vec3 col = mix(fogColor(gl_FragCoord.xy), vec3(0.85, 0.93, 0.9)*u_sun*0.9, Tr.g);
  o = vec4(col*a, a);
}`;


// salema: one photographed fish (assets/salema.webp), drawn per animal as a vertical card
// along its heading, so it foreshortens to a sliver as it turns toward you. The rear body
// sweeps across the card's plane with each tail beat (carangiform: the wave grows toward
// the tail). Lit like the leaves (the caustic net crawls over its back) and sunk into the
// water by the same Beer-Lambert as everything else.
const VS_FISH = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_st;        // s: 0 tail .. 1 snout; t: -.5 belly .. .5 back
layout(location=1) in vec4 a_p;         // centre (m), length (m)
layout(location=2) in vec4 a_d;         // heading (unit), tail phase
layout(location=3) in vec4 a_e;         // tail amplitude, -, -, -
uniform mat4 u_vp; uniform float u_fa;
out vec2 v_tex; out vec3 v_P; out vec3 v_N;
void main(){
  vec3 f = normalize(a_d.xyz);
  vec3 side = normalize(cross(f, vec3(0., 1., 0.)) + vec3(1e-4, 0., 0.));
  vec3 up = cross(side, f);
  float s = a_st.x, t = a_st.y;
  float w = a_e.x*pow(1. - s, 2.)*sin(a_d.w - 5.*(1. - s));
  vec3 P = a_p.xyz + f*(s - .5)*a_p.w*(1. - .08*w*w) + up*t*u_fa*a_p.w + side*w*.32*a_p.w;
  v_tex = vec2(s, .5 - t); v_P = P; v_N = side;
  gl_Position = u_vp*vec4(P, 1.);
}`;
const FS_FISH = `#version 300 es
precision highp float;
${GLSL_COMMON}
in vec2 v_tex; in vec3 v_P; in vec3 v_N; out vec4 o;
uniform sampler2D u_fish, u_caus;
uniform vec3 u_cam, u_L, u_sun, u_amb, u_sigma; uniform float u_tile;
void main(){
  vec4 f = texture(u_fish, v_tex);
  if(f.a < .02 || aboveBand(gl_FragCoord.xy)) discard;
  vec3 base = pow(f.rgb, vec3(2.2))*1.15;
  float dist = length(u_cam - v_P);
  vec2 Q = v_P.xz - u_L.xz*(v_P.y/u_L.y);
  float c = textureLod(u_caus, Q/u_tile, clamp(log2(dist*1.3) + 0.4, 0.8, 6.)).r/0.14;
  float backLit = mix(.78, 1.12, smoothstep(.3, .9, 1. - v_tex.y));    // the sun is above: backs brighter
  vec3 col = base*(u_amb*1.6 + u_sun*(.55 + .25*min(c, 3.))*backLit);
  vec3 Tr = exp(-u_sigma*dist);
  col = col*Tr + fogColor(gl_FragCoord.xy)*(1. - Tr);
  o = vec4(col, f.a);
}`;

// ── WebGL renderer ────────────────────────────────────────────────────────────
function makeGL(canvas) {
    let gl = null;
    try { gl = canvas.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: false }); } catch { gl = null; }
    if (!gl) return null;
    function sh(type, src) {
        const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { const e = gl.getShaderInfoLog(s); gl.deleteShader(s); throw new Error(e + '\n' + src.split('\n').map((l, i) => i + 1 + ': ' + l).join('\n')); }
        return s;
    }
    function prog(vs, fs) {
        const p = gl.createProgram();
        gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
        const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
        for (let i = 0; i < n; i++) { const inf = gl.getActiveUniform(p, i); const nm = inf.name.replace(/\[0\]$/, ''); u[nm] = gl.getUniformLocation(p, inf.name); }
        return { p, u };
    }
    return { gl, prog };
}

function glRenderer(canvas, world) {
    const made = makeGL(canvas);
    if (!made) return null;
    const { gl, prog } = made;
    let P;
    try {
        P = {
            caus: prog(VS_CAUSTIC, FS_CAUSTIC),
            rays: prog(VS_QUAD, FS_RAYS),
            bg: prog(VS_QUAD, FS_BG),
            blade: prog(VS_BLADE(false, false), FS_BLADE(false)),
            lod: prog(VS_BLADE(true, false), FS_BLADE(false)),
            shadow: prog(VS_BLADE(false, true), FS_BLADE(true)),
            snow: prog(VS_SNOW, FS_SNOW),
            fish: prog(VS_FISH, FS_FISH),
        };
    } catch (e) { console.warn('seagrass-meadow: WebGL shaders failed, using canvas', e); return null; }
    const R_NEAR = 18, R_FAR = 7;
    const CAUS = 256, SHADOW = 512;
    const ext = gl.getExtension('EXT_color_buffer_float');

    function tex(w, h, { filter = gl.LINEAR, wrap = gl.CLAMP_TO_EDGE, mip = false, fmt = gl.RGBA8, type = gl.UNSIGNED_BYTE, base = gl.RGBA } = {}) {
        const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, fmt, w, h, 0, base, type, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
        return t;
    }
    function fbo(t) { const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); gl.bindFramebuffer(gl.FRAMEBUFFER, null); return f; }

    const causTex = tex(CAUS, CAUS, { wrap: gl.REPEAT, mip: true });
    const causFbo = fbo(causTex);
    const shTex = tex(SHADOW, SHADOW);
    const shFbo = fbo(shTex);
    let raysTex = null, raysFbo = null, raysW = 0, raysH = 0;
    const plateTex = tex(1, 1, { mip: false });
    gl.bindTexture(gl.TEXTURE_2D, plateTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([20, 110, 120, 255]));
    let plateReady = false;

    // caustic grid
    const GN = 88;
    const gv = new Float32Array((GN + 1) * (GN + 1) * 2);
    for (let j = 0, k = 0; j <= GN; j++) for (let i = 0; i <= GN; i++) { gv[k++] = i / GN; gv[k++] = j / GN; }
    const gi = new Uint16Array(GN * GN * 6);
    for (let j = 0, k = 0; j < GN; j++) for (let i = 0; i < GN; i++) {
        const a = j * (GN + 1) + i, b = a + 1, c = a + GN + 1, d = c + 1;
        gi.set([a, b, c, b, d, c], k); k += 6;
    }
    const causVao = gl.createVertexArray(); gl.bindVertexArray(causVao);
    let buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, gv, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    buf = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, gi, gl.STATIC_DRAW);
    const quadVao = gl.createVertexArray();

    function ribbonVao(rows, inst) {
        const v = new Float32Array(rows * 4);
        for (let r = 0; r < rows; r++) v.set([r, -1, r, 1], r * 4);
        const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
        const b0 = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b0); gl.bufferData(gl.ARRAY_BUFFER, v, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        const b1 = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b1); gl.bufferData(gl.ARRAY_BUFFER, inst, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 0); gl.vertexAttribDivisor(1, 1);
        gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 16); gl.vertexAttribDivisor(2, 1);
        gl.bindVertexArray(null);
        return vao;
    }
    let nearVao = null, farVao = null, nodesTex = null, nodeBuf = null, nNear = 0, nFar = 0;
    let snowVao = null, snowBuf = null, snowN = 0;
    // fish: a strip of 20 cells along the body, instanced
    const FSEG = 20, FMAX = 64;
    const fv = [];
    for (let i = 0; i < FSEG; i++) { const s0 = i / FSEG, s1 = (i + 1) / FSEG; fv.push(s0, -.5, s1, -.5, s0, .5, s1, -.5, s1, .5, s0, .5); }
    const fishVao = gl.createVertexArray(); gl.bindVertexArray(fishVao);
    const fvb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, fvb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(fv), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const fishBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, fishBuf); gl.bufferData(gl.ARRAY_BUFFER, FMAX * 48, gl.DYNAMIC_DRAW);
    for (let k = 0; k < 3; k++) { gl.enableVertexAttribArray(1 + k); gl.vertexAttribPointer(1 + k, 4, gl.FLOAT, false, 48, k * 16); gl.vertexAttribDivisor(1 + k, 1); }
    gl.bindVertexArray(null);
    const fishTex = tex(1, 1);
    let fishReady = false, fishAspect = 0.35;
    function setFish(img) {
        gl.bindTexture(gl.TEXTURE_2D, fishTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        fishAspect = img.naturalHeight / img.naturalWidth; fishReady = true;
    }

    function setMeadow(m, far) {
        nNear = m.N; nFar = far.length;
        const inst = new Float32Array(m.N * 8);
        m.leaves.forEach((lf, i) => inst.set([i, lf.b, lf.L, lf.age, lf.seed, lf.axis, lf.twist, 0], i * 8));
        nearVao = ribbonVao(R_NEAR, inst);
        const fi = new Float32Array(far.length * 8);
        far.forEach((f, i) => fi.set(f, i * 8));
        farVao = ribbonVao(R_FAR, fi);
        nodesTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, nodesTex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, m.S + 1, Math.max(1, m.N), 0, gl.RGBA, gl.FLOAT, null);
        nodeBuf = new Float32Array((m.S + 1) * Math.max(1, m.N) * 4);
    }
    function setSnow(n) {
        snowN = n;
        snowVao = gl.createVertexArray(); gl.bindVertexArray(snowVao);
        snowBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, snowBuf); gl.bufferData(gl.ARRAY_BUFFER, n * 16, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);
    }
    function setPlate(img) {
        gl.bindTexture(gl.TEXTURE_2D, plateTex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        plateReady = true;
    }

    function common(p, v) {
        const u = p.u;
        if (u.u_crop) gl.uniform4fv(u.u_crop, v.crop);
        if (u.u_vpx) gl.uniform2f(u.u_vpx, v.W, v.H);
        if (u.u_hv) gl.uniform1f(u.u_hv, v.hv);
        if (u.u_band) gl.uniform1f(u.u_band, v.band);
        if (u.u_t) gl.uniform1f(u.u_t, v.tc);
        if (u.u_plate) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, plateTex); gl.uniform1i(u.u_plate, 0); }
        if (u.u_caus) { gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, causTex); gl.uniform1i(u.u_caus, 1); }
        if (u.u_shadow) { gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, shTex); gl.uniform1i(u.u_shadow, 2); }
        if (u.u_rays) { gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, raysTex); gl.uniform1i(u.u_rays, 3); }
        if (u.u_nodes) { gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, nodesTex); gl.uniform1i(u.u_nodes, 4); }
        if (u.u_ivp) gl.uniformMatrix4fv(u.u_ivp, false, v.ivp);
        if (u.u_vp) gl.uniformMatrix4fv(u.u_vp, false, v.vp);
        if (u.u_cam) gl.uniform3fv(u.u_cam, v.cam);
        if (u.u_L) gl.uniform3fv(u.u_L, v.L);
        if (u.u_sun) gl.uniform3fv(u.u_sun, v.sun);
        if (u.u_amb) gl.uniform3fv(u.u_amb, v.amb);
        if (u.u_ambUp) gl.uniform3fv(u.u_ambUp, v.ambUp);
        if (u.u_sigma) gl.uniform3fv(u.u_sigma, v.sigma);
        if (u.u_tile) gl.uniform1f(u.u_tile, v.tile);
        if (u.u_raysGain) gl.uniform1f(u.u_raysGain, v.raysGain);
        if (u.u_shRect) gl.uniform4fv(u.u_shRect, v.shRect);
        if (u.u_wk) gl.uniform4fv(u.u_wk, v.wk);
        if (u.u_ww) gl.uniform1fv(u.u_ww, v.ww);
        if (u.u_sdir) gl.uniform2fv(u.u_sdir, v.sdir);
        if (u.u_sheath) gl.uniform1f(u.u_sheath, v.sheath);
        if (u.u_mon) gl.uniform4fv(u.u_mon, v.mon);
        if (u.u_dc) gl.uniform4fv(u.u_dc, v.dc);
    }

    function render(v, m, snow, opts) {
        const W = v.W, H = v.H;
        if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
        // low-res target for the shafts
        const rw = Math.max(1, Math.round(W / 4)), rh = Math.max(1, Math.round(H / 4));
        if (rw !== raysW || rh !== raysH) {
            if (raysTex) gl.deleteTexture(raysTex);
            raysTex = tex(rw, rh); raysFbo = fbo(raysTex); raysW = rw; raysH = rh;
        }
        gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
        // 1. caustics
        if (opts.caustics) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, causFbo); gl.viewport(0, 0, CAUS, CAUS);
            gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
            gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.blendEquation(gl.FUNC_ADD);
            gl.useProgram(P.caus.p);
            const u = P.caus.u;
            gl.uniform1f(u.u_tile, v.tile); gl.uniform1f(u.u_depth, v.depth); gl.uniform1f(u.u_t, v.tc);
            gl.uniform4fv(u.u_wk, v.wk); gl.uniform1fv(u.u_ww, v.ww); gl.uniform2fv(u.u_swell, v.swell); gl.uniform3fv(u.u_sunAir, v.sunAir);
            gl.bindVertexArray(causVao);
            gl.drawElementsInstanced(gl.TRIANGLES, gi.length, gl.UNSIGNED_SHORT, 0, 9);
            gl.disable(gl.BLEND);
            gl.bindTexture(gl.TEXTURE_2D, causTex); gl.generateMipmap(gl.TEXTURE_2D);
        }
        // 2. node upload + leaf shadows on the sand (only the leaves the quality governor keeps)
        const nN = Math.min(m.N, v.nNear ?? m.N);
        if (nN) {
            const S1 = m.S + 1;
            for (let i = 0, n = nN * S1; i < n; i++) { nodeBuf[i * 4] = m.pos[i * 3]; nodeBuf[i * 4 + 1] = m.pos[i * 3 + 1]; nodeBuf[i * 4 + 2] = m.pos[i * 3 + 2]; }
            gl.bindTexture(gl.TEXTURE_2D, nodesTex);
            gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, S1, nN, gl.RGBA, gl.FLOAT, nodeBuf);
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, shFbo); gl.viewport(0, 0, SHADOW, SHADOW);
        gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
        if (nN) {
            gl.enable(gl.BLEND); gl.blendEquation(gl.MAX); gl.blendFunc(gl.ONE, gl.ONE);
            gl.useProgram(P.shadow.p); common(P.shadow, v);
            gl.uniform1f(P.shadow.u.u_rows, R_NEAR); gl.uniform1i(P.shadow.u.u_S, m.S);
            gl.bindVertexArray(nearVao);
            gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, R_NEAR * 2, nN);
            gl.blendEquation(gl.FUNC_ADD); gl.disable(gl.BLEND);
        }
        // 3. shafts
        gl.bindFramebuffer(gl.FRAMEBUFFER, raysFbo); gl.viewport(0, 0, rw, rh);
        gl.useProgram(P.rays.p); common(P.rays, v);
        gl.uniform2f(P.rays.u.u_vpx, rw, rh);
        gl.bindVertexArray(quadVao); gl.drawArrays(gl.TRIANGLES, 0, 3);
        // 4. the scene
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H);
        gl.useProgram(P.bg.p); common(P.bg, v);
        gl.bindVertexArray(quadVao); gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(true);
        gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE);
        // colour replaces, alpha accumulates: in the band it stays 1, above it (the page) a leaf makes its own
        gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.ONE, gl.ZERO, gl.ONE, gl.ONE); gl.blendEquation(gl.FUNC_ADD);
        if (nFar) {
            gl.useProgram(P.lod.p); common(P.lod, v);
            const u = P.lod.u;
            gl.uniform1f(u.u_rows, R_FAR);
            gl.uniform4fv(u.u_sw, v.sw); gl.uniform4fv(u.u_sk, v.sk);
            gl.uniform4fv(u.u_mon, v.mon); gl.uniform4fv(u.u_dc, v.dc); gl.uniform1f(u.u_rdb, v.rdb);
            gl.uniform1f(u.u_t, v.t); gl.uniform4fv(u.u_mon2, v.mon2);
            gl.uniform4fv(u.u_hand, v.hand); gl.uniform3fv(u.u_handV, v.handV);
            gl.bindVertexArray(farVao);
            gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, R_FAR * 2, Math.min(nFar, v.nFar ?? nFar));
        }
        if (nN) {
            gl.useProgram(P.blade.p); common(P.blade, v);
            gl.uniform1f(P.blade.u.u_rows, R_NEAR); gl.uniform1i(P.blade.u.u_S, m.S);
            gl.bindVertexArray(nearVao);
            gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, R_NEAR * 2, nN);
        }
        gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE); gl.disable(gl.BLEND);
        if (fishReady && v.nFish) {
            gl.useProgram(P.fish.p); common(P.fish, v);
            gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, fishTex); gl.uniform1i(P.fish.u.u_fish, 5);
            gl.uniform1f(P.fish.u.u_fa, fishAspect);
            gl.bindBuffer(gl.ARRAY_BUFFER, fishBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, v.fish, 0, Math.min(v.nFish, FMAX) * 12);
            gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE);
            gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.ONE, gl.ZERO, gl.ONE, gl.ONE);   // the band stays opaque under a fish's edge
            gl.bindVertexArray(fishVao);
            gl.drawArraysInstanced(gl.TRIANGLES, 0, FSEG * 6, Math.min(v.nFish, FMAX));
            gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE); gl.disable(gl.BLEND);
        }
        if (snowN && snow) {
            gl.bindBuffer(gl.ARRAY_BUFFER, snowBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, snow);
            gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
            gl.useProgram(P.snow.p); common(P.snow, v);
            gl.uniform1f(P.snow.u.u_focal, v.focal);
            gl.bindVertexArray(snowVao); gl.drawArrays(gl.POINTS, 0, snowN);
            gl.depthMask(true); gl.disable(gl.BLEND);
        }
        gl.bindVertexArray(null);
    }
    return { kind: 'webgl', gl, setMeadow, setSnow, setPlate, setFish, render, get plateReady() { return plateReady; }, lost: () => gl.isContextLost(), ext };
}

// ── Canvas 2D fallback ────────────────────────────────────────────────────────
function canvasRenderer(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    let plate = null;
    const tmp = [0, 0, 0, 0];
    function project(v, x, y, z) {
        const m = v.vp;
        const cx = m[0] * x + m[4] * y + m[8] * z + m[12], cy = m[1] * x + m[5] * y + m[9] * z + m[13], cw = m[3] * x + m[7] * y + m[11] * z + m[15];
        tmp[0] = (cx / cw * 0.5 + 0.5) * v.W; tmp[1] = (0.5 - cy / cw * 0.5) * v.H; tmp[2] = cw; return tmp;
    }
    return {
        kind: 'canvas',
        setMeadow() {}, setSnow() {},
        setPlate(img) { plate = img; },
        get plateReady() { return !!plate; },
        lost: () => false,
        render(v, m, snow) {
            const W = v.W, H = v.H;
            if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
            ctx.fillStyle = '#1d6a72'; ctx.fillRect(0, 0, W, H);
            if (plate) {
                // the visible part of the plate
                const pw = plate.naturalWidth, ph = plate.naturalHeight;
                const sx = (v.crop[0] - v.crop[2]) * 0.5 + 0.5, sy = 0.5 - (v.crop[1] + v.crop[3]) * 0.5;
                ctx.drawImage(plate, sx * pw, sy * ph, v.crop[2] * pw, v.crop[3] * ph, 0, 0, W, H);
            }
            // sand: a fogged gradient below the horizon
            const yh = clamp((0.5 - ((v.horizonNdc - v.crop[1]) / v.crop[3]) * 0.5) * H, 0, H);
            const g = ctx.createLinearGradient(0, yh, 0, H);
            g.addColorStop(0, 'rgba(40,128,130,0)'); g.addColorStop(0.4, 'rgba(84,146,140,0.75)'); g.addColorStop(1, 'rgba(176,190,170,1)');
            ctx.fillStyle = g; ctx.fillRect(0, yh, W, H - yh);
            // leaves far to near
            const S1 = m.S + 1;
            const order = m._order || (m._order = Array.from({ length: m.N }, (_, i) => i).sort((a, b) => m.leaves[a].z - m.leaves[b].z));
            ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            const nN = Math.min(m.N, v.nNear ?? m.N);
            for (const i of order) {
                if (i >= nN) continue;
                const lf = m.leaves[i];
                const d = -lf.z;
                const T = Math.exp(-0.13 * d);
                const k = 0.7 + 0.3 * lf.seed;
                const r = Math.round((70 * k) * T + 30 * (1 - T)), gg = Math.round((140 * k) * T + 120 * (1 - T)), b = Math.round((40 * k) * T + 125 * (1 - T));
                ctx.strokeStyle = `rgb(${r},${gg},${b})`;
                ctx.beginPath();
                let w = 1;
                for (let j = 0; j < S1; j++) {
                    const o = (i * S1 + j) * 3;
                    const p = project(v, m.pos[o], m.pos[o + 1], m.pos[o + 2]);
                    if (j === 0) { ctx.moveTo(p[0], p[1]); w = Math.max(1, lf.b * v.focal / p[2]); } else ctx.lineTo(p[0], p[1]);
                }
                ctx.lineWidth = w; ctx.stroke();
            }
            if (snow) {
                ctx.fillStyle = 'rgba(220,240,235,0.5)';
                for (let i = 0; i < snow.length; i += 4) {
                    const p = project(v, snow[i], snow[i + 1], snow[i + 2]);
                    if (p[2] <= 0.1) continue;
                    const s = Math.max(1, snow[i + 3] * v.focal / p[2]);
                    ctx.fillRect(p[0], p[1], s, s);
                }
            }
        },
    };
}

// ── the component ─────────────────────────────────────────────────────────────
export function seagrassMeadow(el, opts = {}) {
    if (el.__seagrassMeadow) el.__seagrassMeadow();
    const ds = el.dataset;
    const num = (k, d) => (ds[k] != null && ds[k] !== '' && !isNaN(+ds[k]) ? +ds[k] : d);
    const o = {
        ...DEFAULTS,
        plate: ds.plate || el.querySelector('img')?.getAttribute('src') || DEFAULTS.plate,
        species: ds.species || DEFAULTS.species,
        blades: num('blades', 0), far: num('far', 0), snow: num('snow', 0),
        surge: num('surge', DEFAULTS.surge), period: num('period', DEFAULTS.period),
        current: num('current', DEFAULTS.current), depth: num('depth', DEFAULTS.depth),
        heading: num('heading', DEFAULTS.heading), label: ds.label || DEFAULTS.label,
        fish: ds.fish != null && ds.fish !== '' ? +ds.fish : null, idle: num('idle', DEFAULTS.idle),
        paused: ds.paused != null && ds.paused !== 'false',
        ...opts,
    };
    const ac = new AbortController();
    const on = (t, type, fn, op = {}) => t.addEventListener(type, fn, { signal: ac.signal, ...op });
    const small = matchMedia('(max-width: 640px), (pointer: coarse)').matches;
    if (!o.blades) o.blades = small ? 520 : 1000;
    if (!o.far) o.far = small ? 14000 : 30000;
    if (!o.snow) o.snow = small ? 160 : 280;
    const sp = SPECIES[o.species] || SPECIES.posidonia;

    el.classList.add('sm');
    const img = el.querySelector('img');
    function makeCanvas() {
        const c = document.createElement('canvas');
        c.className = 'sm-canvas';
        c.setAttribute('role', 'img');
        c.setAttribute('aria-label', o.label);
        el.prepend(c);
        return c;
    }
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'sm-pause';
    btn.setAttribute('aria-pressed', 'false');
    btn.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path class="sm-i-pause" d="M5.5 3.5v9M10.5 3.5v9"/><path class="sm-i-play" d="M5 3.2l7.5 4.8L5 12.8z"/></svg><span class="sm-vh">Pause the meadow</span>';
    el.append(btn);
    if (o.paused) { btn.setAttribute('aria-pressed', 'true'); btn.querySelector('.sm-vh').textContent = 'Play the meadow'; }

    let canvas = makeCanvas();
    let R = glRenderer(canvas, null);
    if (!R) {
        // a canvas that has handed out a WebGL context cannot give a 2D one
        canvas.remove(); canvas = makeCanvas();
        R = canvasRenderer(canvas);
    }
    if (R.kind === 'canvas') { o.blades = Math.min(o.blades, 240); o.snow = Math.min(o.snow, 120); }
    el.dataset.renderer = R.kind;

    // ── camera, matched to the plate ──
    const PLATE_ASPECT = 1600 / 896;
    const HV = 0.554;                  // the plate's horizon row
    const FOVY = 52 * Math.PI / 180;
    const pitch = Math.atan((2 * HV - 1) * Math.tan(FOVY / 2));
    const cam = [0, 0.3, 0];
    const fwd = [0, Math.sin(pitch), -Math.cos(pitch)];
    const Vm = M.look(cam, fwd);
    const Pm = M.persp(FOVY, PLATE_ASPECT, 0.03, 40);
    const PV = M.mul(Pm, Vm);
    const IPV = M.inv(PV);
    // sun: elevation inside Snell's window (≥ 41.4° underwater), ahead and to the left like the plate's rays
    const sunElevAir = 62 * Math.PI / 180;
    const hs = [-0.42, -0.9], hn = Math.hypot(hs[0], hs[1]);
    const hx = hs[0] / hn, hz = hs[1] / hn;                       // toward the sun, horizontally
    const cosE = Math.cos(sunElevAir);
    const sunAir = [-hx * cosE, -Math.sin(sunElevAir), -hz * cosE]; // sunlight's direction of travel in air
    const cosW = cosE / 1.333;                                      // Snell: sin(zenith) shrinks by n
    const L = [hx * cosW, Math.sqrt(1 - cosW * cosW), hz * cosW];   // toward the sun, underwater
    // light at 5 m: the red is mostly gone (diffuse attenuation Kd per channel, clear coastal water)
    const Kd = [0.15, 0.05, 0.04];
    // ...then white-balanced the way the plate (and any diver's camera) is, so the colours sit with the photograph
    const WB = [1.19, 0.85, 0.81];
    const sun = Kd.map((k, i) => [1.25, 1.18, 1.05][i] * Math.exp(-k * o.depth) * WB[i]);
    const amb = [0.20, 0.31, 0.31], ambUp = [0.22, 0.40, 0.42];
    // horizontal beam attenuation of the view, per m: absorption plus scattering by the fine
    // particles over a meadow (c ≈ 0.25 /m in green is clear coastal water); the far meadow is
    // gone into the blue by eight metres or so, as in the plate
    const sigma = [0.52, 0.25, 0.22];

    const view = { W: 1, H: 1, crop: new Float32Array([0, 0, 1, 1]), tanX: 1, cx: 0, band: 1 };
    function layout() {
        const r = el.getBoundingClientRect();
        const cr = canvas.getBoundingClientRect();
        const rise = r.height > 0 ? Math.max(0, (cr.height - r.height) / r.height) : 0;   // the canvas rises above the band, into the page
        const dpr = Math.min(window.devicePixelRatio || 1, R.kind === 'canvas' ? 1.5 : 2);
        const W = Math.max(2, Math.round(r.width * dpr)), H = Math.max(2, Math.round(r.height * dpr));
        const ea = W / H;
        let sx = 1, sy = 1, cx = 0, cy = 0;
        if (ea >= PLATE_ASPECT) { sy = PLATE_ASPECT / ea; cy = clamp(-0.02, -1 + sy, 1 - sy); }
        else { sx = ea / PLATE_ASPECT; cx = clamp(-0.08, -1 + sx, 1 - sx); }
        view.band = cy + sy;                          // the water's top edge, plate NDC
        const sy2 = sy * (1 + rise), cy2 = cy + sy * rise;
        view.W = W; view.H = Math.max(2, Math.round(H * (1 + rise)));
        view.crop = new Float32Array([cx, cy2, sx, sy2]);
        // the camera's visible half-width per metre of distance, and its centre offset
        const tX = Math.tan(FOVY / 2) * PLATE_ASPECT;
        view.tanX = tX * sx; view.cx = tX * cx;
        // crop matrix: screen NDC = (plate NDC − c) / s
        const C = new Float32Array([1 / sx, 0, 0, 0, 0, 1 / sy2, 0, 0, 0, 0, 1, 0, -cx / sx, -cy2 / sy2, 0, 1]);
        view.vp = M.mul(C, PV);
        view.focal = view.H / (2 * Math.tan(FOVY / 2) * sy2);
    }
    layout();

    // ── adaptive quality: if frames run long (a slow phone, a throttled CPU), simulate and draw
    // fewer leaves. Shoots were placed in random order, so dropping the last ones thins the
    // meadow evenly instead of emptying a corner. It only ever steps down.
    const quality = { near: Infinity, far: Infinity, ema: 16.7, phys: 0, n: 0, level: 0 };
    function govern(frameMs, physMs) {
        quality.ema += (frameMs - quality.ema) * 0.05;
        quality.phys += (physMs - quality.phys) * 0.05;
        if (++quality.n < 90) return;
        quality.n = 0;
        const slow = quality.ema > 26, physHeavy = quality.phys > 7;
        if (!slow && !physHeavy) return;
        if (physHeavy || slow) quality.near = Math.max(Math.round(meadow.N * 0.3), Math.round(Math.min(quality.near, meadow.N) * 0.78));
        if (slow) quality.far = Math.max(Math.round(far.length * 0.25), Math.round(Math.min(quality.far, far.length) * 0.7));
        quality.level++;
        el.dataset.quality = String(quality.level);
    }

    // ── state ──
    let flow = new Flow(o, 11);
    let meadow = buildMeadow(o, view, 7);
    let far = R.kind === 'webgl' ? buildFar(o, view, 23, sp) : [];
    R.setMeadow(meadow, far);
    // marine snow
    const snowRng = rng(91);
    const snow = new Float32Array(o.snow * 4);
    const snowBox = () => ({ x: view.tanX * 2.6 + 0.4, z0: 0.35, z1: 3.2, y1: 1.9 });
    function seedSnow(i) {
        const b = snowBox(); const d = b.z0 + (b.z1 - b.z0) * snowRng();
        snow[i * 4] = (snowRng() * 2 - 1) * (d * view.tanX + 0.2) + view.cx * d;
        snow[i * 4 + 1] = 0.03 + snowRng() * b.y1;
        snow[i * 4 + 2] = -d;
        snow[i * 4 + 3] = 0.0006 + 0.0024 * Math.pow(snowRng(), 3);
    }
    for (let i = 0; i < o.snow; i++) seedSnow(i);
    R.setSnow(o.snow);

    // surface ripples for caustics: periodic on the tile
    const TILE = 1.7;
    const wk = new Float32Array(40), ww = new Float32Array(10);
    {
        const r = rng(5);
        const set = [[3, 2], [-2, 4], [5, 1], [1, 6], [-5, 4], [6, -3], [7, 3], [-2, -8], [8, 5], [-6, 7]];
        set.forEach(([n, m], i) => {
            const kx = TAU * n / TILE, kz = TAU * m / TILE, k = Math.hypot(kx, kz);
            // gravity-capillary dispersion; slope amplitude falls off gently with k
            ww[i] = Math.sqrt(G * k + 0.074 / 1025 * k * k * k);
            const slope = 0.011 * (0.7 + 0.6 * r());
            wk.set([kx, kz, slope / k, r() * TAU], i * 4);
        });
    }

    // ── hand ──
    const hand = { on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, R: 0.05, lastT: 0, sx: 0, sy: 0, fresh: false, w: 0 };
    const puffs = [];
    function handRay(clientX, clientY) {
        const r = canvas.getBoundingClientRect();
        const nx = ((clientX - r.left) / r.width) * 2 - 1, ny = 1 - ((clientY - r.top) / r.height) * 2;
        const px = view.crop[0] + view.crop[2] * nx, py = view.crop[1] + view.crop[3] * ny;
        const a = mulv(IPV, [px, py, -1, 1]), b = mulv(IPV, [px, py, 1, 1]);
        let d = [b[0] / b[3] - a[0] / a[3], b[1] / b[3] - a[1] / a[3], b[2] / b[3] - a[2] / a[3]];
        const l = Math.hypot(...d); d = d.map((x) => x / l);
        let t = 1.5;
        if (d[1] < 0) t = Math.min(t, (cam[1] - 0.12) / -d[1]);
        t = Math.max(0.45, t);
        return [cam[0] + d[0] * t, cam[1] + d[1] * t, cam[2] + d[2] * t];
    }
    function mulv(m, v) { return [0, 1, 2, 3].map((r) => m[r] * v[0] + m[4 + r] * v[1] + m[8 + r] * v[2] + m[12 + r] * v[3]); }
    let swishAt = 0;
    function handTo(p, now) {
        if (!hand.on) {
            hand.on = true; hand.x = p[0]; hand.y = p[1]; hand.z = p[2]; hand.vx = hand.vy = hand.vz = 0; hand.lastT = now;
            hand.tx = p[0]; hand.ty = p[1]; hand.tz = p[2];
        }
        hand.tx = p[0]; hand.ty = p[1]; hand.tz = p[2];
        kick();
    }

    // ── physics step ──
    const sv = [0, 0, 0, 0];
    function waterVel(x, y, z, s0q, out) {
        // s0q: [rho, phi] for the column; returns [ux, uy, uz]
        const f = flow;
        const bed = 1 - Math.exp(-y / 0.012);
        const s = x * f.dc[0] + z * f.dc[2];
        const kx = f.kv * (s - f.Uc * f.t) + s0q[1];
        const ky = f.kv * (y - f.yv);
        const e = Math.exp(clamp(ky, -12, 12)), ie = 1 / e;
        const D = 0.5 * (e + ie) - s0q[0] * Math.cos(kx);
        const us = f.Uc + 0.5 * f.dU * 0.5 * (e - ie) / D;
        const vs = -0.5 * f.dU * s0q[0] * Math.sin(kx) / D;
        const att = 0.82 + 0.18 * smooth(0, 0.5, y);    // waves are damped a little inside the canopy
        out[0] = (f.dc[0] * us + sv[0] * att + f.scroll * smooth(0, 0.3, y)) * bed;
        out[1] = vs * (1 - Math.exp(-y / 0.08));
        out[2] = (f.dc[2] * us + sv[1] * att) * bed;
        // the hand: a moving sphere (potential-flow dipole) and the puffs of momentum it leaves
        if (hand.on) {
            const rx = x - hand.x, ry = y - hand.y, rz = z - hand.z;
            const r2 = rx * rx + ry * ry + rz * rz;
            if (r2 < 0.16) {
                const r = Math.sqrt(r2) + 1e-4, a3 = hand.R ** 3 / (2 * r2 * r);
                const vd = (hand.vx * rx + hand.vy * ry + hand.vz * rz) / r;
                const k = Math.min(a3, 0.6);
                out[0] += k * (3 * vd * rx / r - hand.vx); out[1] += k * (3 * vd * ry / r - hand.vy); out[2] += k * (3 * vd * rz / r - hand.vz);
            }
        }
        for (let i = 0; i < puffs.length; i++) {
            const p = puffs[i];
            const rx = x - p.x, ry = y - p.y, rz = z - p.z;
            const r2 = rx * rx + ry * ry + rz * rz;
            if (r2 > p.R2 * 9) continue;
            const g = p.a * Math.exp(-r2 / p.R2);
            out[0] += p.vx * g; out[1] += p.vy * g; out[2] += p.vz * g;
        }
        return out;
    }

    const u3 = [0, 0, 0];
    const col = [0, 0];
    function step(dt) {
        const m = meadow, S = m.S, S1 = S + 1, pos = m.pos, vel = m.vel, F = m.frc, par = m.par, rest = m.rest;
        flow.advance(flow.t + dt);
        const t = flow.t;
        // hand: ease toward the pointer, measure its velocity, shed wake
        if (hand.on) {
            const k = 1 - Math.exp(-dt / 0.05);
            const nx = hand.x + (hand.tx - hand.x) * k, ny = hand.y + (hand.ty - hand.y) * k, nz = hand.z + (hand.tz - hand.z) * k;
            hand.vx = (nx - hand.x) / dt; hand.vy = (ny - hand.y) / dt; hand.vz = (nz - hand.z) / dt;
            // a swimmer's hand moves at up to about a metre a second; a flung mouse is not faster than that
            const hs = Math.hypot(hand.vx, hand.vy, hand.vz);
            if (hs > 1.0) { hand.vx /= hs; hand.vy /= hs; hand.vz /= hs; }
            hand.x = nx; hand.y = ny; hand.z = nz;
            const sp2 = hand.vx ** 2 + hand.vy ** 2 + hand.vz ** 2;
            hand.trav = (hand.trav || 0) + Math.sqrt(sp2) * dt;
            if (hand.trav > 0.03 && sp2 > 0.0025) {
                hand.trav = 0;
                puffs.push({ x: hand.x, y: hand.y, z: hand.z, vx: hand.vx * 0.4, vy: hand.vy * 0.25, vz: hand.vz * 0.4, R0: hand.R * 1.3, R2: (hand.R * 1.3) ** 2, a: 1, age: 0 });
                if (puffs.length > 48) puffs.shift();
                const now = performance.now();
                if (sp2 > 0.36 && now - swishAt > 900) { swishAt = now; el.dispatchEvent(new CustomEvent('seagrass-meadow:swish', { bubbles: true })); }
            }
        }
        for (let i = puffs.length - 1; i >= 0; i--) {
            const p = puffs[i];
            p.age += dt;
            if (p.age > 3) { puffs.splice(i, 1); continue; }
            flow.surgeAt(p.x, p.z, sv);
            p.x += sv[0] * dt; p.z += sv[1] * dt;
            const R = p.R0 * Math.sqrt(1 + p.age / 0.4);
            p.R2 = R * R;
            p.a = Math.exp(-p.age / 0.8) * (p.R0 / R) ** 3;
        }
        const handOn = hand.on;
        const hr = hand.R + 0.004;
        const nAct = Math.min(m.N, quality.near);
        for (let b = 0; b < nAct; b++) {
            const pb = b * 8;
            const dsl = par[pb], mass = par[pb + 1], fb = par[pb + 2], kb = par[pb + 3], cdl = par[pb + 4], cfl = par[pb + 5], mai = par[pb + 6];
            const o0 = b * S1 * 3;
            const rx = pos[o0], rz = pos[o0 + 2];
            flow.surgeAt(rx, rz, sv);
            const sq = rx * flow.dc[0] + rz * flow.dc[2], q = rx * flow.dp[0] + rz * flow.dp[2];
            col[0] = flow.rho(sq, q, t); col[1] = flow.phi(q);
            // bending: each joint pulls the next node back toward the line of the segment below
            for (let i = o0; i < o0 + S1 * 3; i++) F[i] = 0;
            for (let i = 0; i < S; i++) {
                let dx, dy, dz;
                const a = o0 + i * 3;
                if (i === 0) { dx = rest[b * 3]; dy = rest[b * 3 + 1]; dz = rest[b * 3 + 2]; }
                else {
                    dx = pos[a] - pos[a - 3]; dy = pos[a + 1] - pos[a - 2]; dz = pos[a + 2] - pos[a - 1];
                    const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
                }
                const fx = kb * (pos[a] + dx * dsl - pos[a + 3]), fy = kb * (pos[a + 1] + dy * dsl - pos[a + 4]), fz = kb * (pos[a + 2] + dz * dsl - pos[a + 5]);
                // a couple: the node beyond and the node before both swing toward straight, the joint takes the reaction
                F[a + 3] += fx; F[a + 4] += fy; F[a + 5] += fz;
                if (i > 0) { F[a - 3] += fx; F[a - 2] += fy; F[a - 1] += fz; F[a] -= 2 * fx; F[a + 1] -= 2 * fy; F[a + 2] -= 2 * fz; }
            }
            for (let i = 1; i <= S; i++) {
                const a = o0 + i * 3;
                const end = i === S ? 0.5 : 1;
                // tangent
                let tx = pos[a] - pos[a - 3], ty = pos[a + 1] - pos[a - 2], tz = pos[a + 2] - pos[a - 1];
                if (i < S) { tx += pos[a + 3] - pos[a]; ty += pos[a + 4] - pos[a + 1]; tz += pos[a + 5] - pos[a + 2]; }
                const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
                waterVel(pos[a], pos[a + 1], pos[a + 2], col, u3);
                let wx = u3[0] - vel[a], wy = u3[1] - vel[a + 1], wz = u3[2] - vel[a + 2];
                const wt = wx * tx + wy * ty + wz * tz;
                const nx = wx - wt * tx, ny = wy - wt * ty, nz = wz - wt * tz;
                const nm = Math.hypot(nx, ny, nz);
                const mm = mass * end;
                // buoyancy + bending + Morison inertia (the water's acceleration) + skin friction
                let ax = (F[a] + mai * end * sv[2] * 0.82 + cfl * end * Math.abs(wt) * wt * tx) / mm;
                let ay = (F[a + 1] + fb * end + cfl * end * Math.abs(wt) * wt * ty) / mm;
                let az = (F[a + 2] + mai * end * sv[3] * 0.82 + cfl * end * Math.abs(wt) * wt * tz) / mm;
                vel[a] += ax * dt; vel[a + 1] += ay * dt; vel[a + 2] += az * dt;
                // form drag on the normal flow, integrated exactly (stiff when the hand sweeps)
                const c = cdl * end * nm / mm;
                const kd = 1 - Math.exp(-c * dt);
                vel[a] += nx * kd; vel[a + 1] += ny * kd; vel[a + 2] += nz * kd;
            }
            // tissue damping: neighbouring nodes cannot move very differently (kills zig-zag modes)
            for (let i = 1; i < S; i++) {
                const a = o0 + i * 3;
                vel[a] += 0.18 * (0.5 * (vel[a - 3] + vel[a + 3]) - vel[a]);
                vel[a + 1] += 0.18 * (0.5 * (vel[a - 2] + vel[a + 4]) - vel[a + 1]);
                vel[a + 2] += 0.18 * (0.5 * (vel[a - 1] + vel[a + 5]) - vel[a + 2]);
            }
            // predict, then hold each segment's length (follow-the-leader from the root)
            for (let i = 1; i <= S; i++) {
                const a = o0 + i * 3;
                const ox = pos[a], oy = pos[a + 1], oz = pos[a + 2];
                let px = ox + vel[a] * dt, py = oy + vel[a + 1] * dt, pz = oz + vel[a + 2] * dt;
                if (handOn) {
                    // the hand is soft-edged: leaves inside it are eased out over a few steps, not snapped
                    const hx = px - hand.x, hy = py - hand.y, hz = pz - hand.z, h2 = hx * hx + hy * hy + hz * hz;
                    if (h2 < hr * hr) { const h = Math.sqrt(h2) + 1e-6, push = (hr - h) * 0.35; px += hx / h * push; py += hy / h * push; pz += hz / h * push; }
                }
                let dx = px - pos[a - 3], dy = py - pos[a - 2], dz = pz - pos[a - 1];
                const l = Math.hypot(dx, dy, dz) || 1;
                px = pos[a - 3] + dx / l * dsl; py = pos[a - 2] + dy / l * dsl; pz = pos[a - 1] + dz / l * dsl;
                if (py < 0.004) py = 0.004;
                vel[a] = (px - ox) / dt * 0.998; vel[a + 1] = (py - oy) / dt * 0.998; vel[a + 2] = (pz - oz) / dt * 0.998;
                pos[a] = px; pos[a + 1] = py; pos[a + 2] = pz;
            }
        }
        // marine snow rides the same water, sinking a millimetre a second
        const b = snowBox();
        const z0 = [0, 0];
        for (let i = 0; i < o.snow; i++) {
            const x = snow[i * 4], y = snow[i * 4 + 1], z = snow[i * 4 + 2];
            flow.surgeAt(x, z, sv);
            const sq = x * flow.dc[0] + z * flow.dc[2], q = x * flow.dp[0] + z * flow.dp[2];
            z0[0] = flow.rho(sq, q, t); z0[1] = flow.phi(q);
            waterVel(x, y, z, z0, u3);
            const se = flow.E;   // on a slack sea the specks hang still (and the loop can stop)
            snow[i * 4] += u3[0] * dt * se; snow[i * 4 + 1] += (u3[1] - 0.0012) * dt * se; snow[i * 4 + 2] += u3[2] * dt * se;
            const d = -snow[i * 4 + 2];
            const half = d * view.tanX + 0.25;
            const xc = view.cx * d;
            if (snow[i * 4] > xc + half) snow[i * 4] -= 2 * half; else if (snow[i * 4] < xc - half) snow[i * 4] += 2 * half;
            if (d < b.z0) snow[i * 4 + 2] = -b.z1; else if (d > b.z1) snow[i * 4 + 2] = -b.z0;
            if (snow[i * 4 + 1] < 0.01) snow[i * 4 + 1] = b.y1; else if (snow[i * 4 + 1] > b.y1 + 0.2) snow[i * 4 + 1] = 0.02;
        }
        // the sound of the surge: one cue per wave, as the flow turns shoreward
        const uh = flow.surgeHere();
        if (lastSurge < 0 && uh >= 0) {
            const big = surgePeak > o.surge * 0.85;
            el.dispatchEvent(new CustomEvent('seagrass-meadow:surge', { bubbles: true, detail: { size: big ? 'big' : 'small' } }));
            surgePeak = 0;
        }
        surgePeak = Math.max(surgePeak, Math.abs(uh));
        lastSurge = uh;
    }
    let lastSurge = 0, surgePeak = 0;


    // ── the salema ──
    // Sarpa salpa is the Mediterranean's one fish that grazes Posidonia itself: schools of
    // twenty to a few hundred cruise over the meadow and break up to crop the leaf tips.
    // Each fish follows the three zones of Couzin et al. (2002): keep clear of the nearest,
    // swim the way the next ones swim, close up on the rest; and the school's own heading.
    // They come and go on their own schedule. A hand moving fast near them makes them bolt
    // and the fright spreads; nothing ever steers them toward the pointer.
    const FN = R.kind === 'webgl' ? (o.fish != null ? o.fish : (small ? 22 : 34)) : 0;
    const fr = rng(29);
    const fish = [];
    for (let i = 0; i < FN; i++) fish.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, L: 0.23 + 0.1 * fr(), ph: fr() * TAU, amp: 0.3, mode: 'school', t: 0, tx: 0, ty: 0, tz: 0, leaf: -1, bites: 0, alarm: -1, cruise: 0.9 + 0.2 * fr(), fx: 0, fy: 0, fz: 0 });
    const school = { phase: 'away', t: 0, next: 4, dir: 1 };
    const fishData = new Float32Array(64 * 12);
    let nFish = 0, schoolClock = 0;
    const CANOPY = 0.62;                    // the meadow's top, m (the outer leaves lean, the tallest reach ~0.9)
    // screen x (0..1 of the band) of a point, and the world x of a screen edge at depth d
    function screenU(x, y, z) {
        const m = view.vp, w = m[3] * x + m[7] * y + m[11] * z + m[15];
        return ((m[0] * x + m[4] * y + m[8] * z + m[12]) / w + 1) / 2;
    }
    const edgeX = (d, side) => view.cx * d + side * (view.tanX * d + 0.5);
    function spawnSchool() {
        school.dir = fr() < 0.5 ? 1 : -1; school.phase = 'in'; school.t = 0;
        const d0 = 2.0 + 1.0 * fr();
        for (const f of fish) {
            const d = clamp(d0 + (fr() - 0.5) * 1.8, 1.4, 5.5);
            f.z = -d; f.x = edgeX(d, -school.dir) - school.dir * (fr() * 1.2);
            f.y = CANOPY + 0.25 + fr() * 0.55;
            f.vx = school.dir * 0.3 * f.cruise; f.vy = 0; f.vz = (fr() - 0.5) * 0.05;
            f.mode = 'school'; f.t = 0; f.alarm = -1;
        }
    }
    // a bite: tug the leaf toward the fish and down, from the tip
    function bite(li, dx, dz) {
        const m = meadow, S1 = m.S + 1, o0 = li * S1 * 3;
        for (let k = m.S - 3; k <= m.S; k++) { const a = o0 + k * 3, w = (k - m.S + 4) / 4; m.vel[a] += dx * 0.35 * w; m.vel[a + 1] -= 0.12 * w; m.vel[a + 2] += dz * 0.35 * w; }
    }
    function nearestTip(x, z) {
        const m = meadow, S1 = m.S + 1, n = Math.min(m.N, quality.near);
        let best = -1, bd = 0.09;            // within 30 cm
        for (let i = 0; i < n; i++) {
            const a = (i * S1 + m.S) * 3, dx = m.pos[a] - x, dz = m.pos[a + 2] - z, d2 = dx * dx + dz * dz;
            if (d2 < bd) { bd = d2; best = i; }
        }
        return best;
    }
    function swim(dt, awake = true) {
        if (!FN) return;
        schoolClock += dt;
        if (school.phase === 'away') { nFish = 0; if (awake && schoolClock > school.next) spawnSchool(); else return; }
        if (!awake && school.phase !== 'out') { school.phase = 'out'; school.t = 0; }   // left alone, the school moves on
        school.t += dt;
        let cx = 0, cz = 0;
        for (const f of fish) { cx += f.x; cz += f.z; }
        cx /= FN; cz /= FN;
        const mid = view.cx * -cz;
        if (school.phase === 'in' && Math.abs(cx - mid) < 0.5) { school.phase = 'graze'; school.t = 0; }
        if (school.phase === 'graze' && school.t > 26) { school.phase = 'out'; school.t = 0; }
        let gx, sp;
        if (school.phase === 'in') { gx = school.dir; sp = 0.32; }
        else if (school.phase === 'graze') { gx = 0.35 * Math.sin(school.t * 0.21) * school.dir + (mid - cx) * 0.4; sp = 0.18; }
        else { gx = school.dir; sp = 0.4; }
        let allGone = true;
        // a pointer sweeping past close by, on screen, frightens a fish (the hand is nearer than they are)
        const rc = canvas.getBoundingClientRect(), vm = view.vp;
        const pAge = performance.now() - ptr.t, pSpeed = Math.hypot(ptr.vx, ptr.vy);
        const fright = pAge < 160 && pSpeed > 140;
        for (let i = 0; i < FN; i++) {
            const f = fish[i];
            const spd = Math.hypot(f.vx, f.vy, f.vz) || 1e-6;
            let dx = 0, dy = 0, dz = 0, nr = 0, ox = 0, oy = 0, oz = 0, ax = 0, ay = 0, az = 0;
            for (let j = 0; j < FN; j++) {
                if (j === i) continue;
                const g = fish[j];
                const rx = g.x - f.x, ry = g.y - f.y, rz = g.z - f.z, d = Math.hypot(rx, ry, rz) || 1e-6;
                if (d < 0.15) { dx -= rx / d; dy -= ry / d; dz -= rz / d; nr++; }
                else if (d < 0.6) { const gs = Math.hypot(g.vx, g.vy, g.vz) || 1e-6; ox += g.vx / gs; oy += g.vy / gs; oz += g.vz / gs; }
                else if (d < 1.5) { ax += rx / d; ay += ry / d; az += rz / d; }
                // fright passes from fish to fish, a beat late
                if (g.mode === 'flee' && g.t < 0.4 && d < 0.45 && f.mode !== 'flee' && f.alarm < 0) { f.alarm = 0.08 + 0.12 * fr(); f.fx = g.fx; f.fy = g.fy; f.fz = g.fz; }
            }
            let tx, ty, tz, target = sp * f.cruise, turn = 1.6;
            if (f.alarm >= 0) { f.alarm -= dt; if (f.alarm < 0) { f.mode = 'flee'; f.t = 0; } }
            if (f.mode === 'flee') {
                tx = f.fx; ty = f.fy; tz = f.fz; target = 1.1 * Math.exp(-f.t / 0.7) + sp; turn = 7;
                f.t += dt; if (f.t > 1.4) f.mode = 'school';
            } else if (f.mode === 'dive' || f.mode === 'nip') {
                // down to a leaf tip, three twisting bites, then back up to the others
                const a = (f.leaf * (meadow.S + 1) + meadow.S) * 3;
                f.tx = meadow.pos[a]; f.ty = meadow.pos[a + 1] + 0.02; f.tz = meadow.pos[a + 2];
                const ex = f.tx - f.x, ey = f.ty - f.y, ez = f.tz - f.z, d = Math.hypot(ex, ey, ez) || 1e-6;
                f.t += dt;
                if (f.mode === 'dive') {
                    tx = ex / d; ty = ey / d; tz = ez / d; target = 0.2; turn = 2.4;
                    if (d < 0.06) { f.mode = 'nip'; f.t = 0; f.bites = 0; }
                    if (f.t > 7) { f.mode = 'rise'; f.t = 0; }
                } else {
                    const hs = Math.hypot(f.vx, f.vz) || 1;
                    tx = f.vx / hs * 0.35; ty = -0.94; tz = f.vz / hs * 0.35; target = 0.03; turn = 3;
                    f.x += ex * dt * 3; f.y += ey * dt * 3; f.z += ez * dt * 3;
                    if (f.t > 0.25 + f.bites * 0.38 && f.bites < 3) { f.bites++; bite(f.leaf, f.vx / hs, f.vz / hs); }
                    if (f.t > 1.4) { f.mode = 'rise'; f.t = 0; }
                }
            } else {
                if (nr) { tx = dx; ty = dy; tz = dz; }
                else {
                    const on_ = Math.hypot(ox, oy, oz), an = Math.hypot(ax, ay, az);
                    tx = (on_ ? ox / on_ : f.vx / spd) + (an ? ax / an : 0) * 0.6;
                    ty = (on_ ? oy / on_ : f.vy / spd) + (an ? ay / an : 0) * 0.6;
                    tz = (on_ ? oz / on_ : f.vz / spd) + (an ? az / an : 0) * 0.6;
                }
                tx += gx * 0.9;
                const floor = CANOPY + 0.18, ceil = CANOPY + 0.95;
                if (f.y < floor) ty += (floor - f.y) * 6; else if (f.y > ceil) ty -= (f.y - ceil) * 4;
                {   // and below the water's top edge, where the band meets the page
                    const w = vm[3] * f.x + vm[7] * f.y + vm[11] * f.z + vm[15];
                    const ny = (vm[1] * f.x + vm[5] * f.y + vm[9] * f.z + vm[13]) / w;          // canvas NDC
                    const top = (view.band - view.crop[1]) / view.crop[3];                         // band top, canvas NDC
                    if (ny > top - 0.12) ty -= (ny - top + 0.12) * 12;
                }
                ty *= 0.6;                       // fish keep level: they turn far more than they climb
                const d = -f.z;
                if (d < 1.4) tz -= (1.4 - d) * 3; else if (d > 5.5) tz += (d - 5.5) * 3;
                if (f.mode === 'rise') { f.t += dt; ty += 0.6; if (f.t > 1.5) { f.mode = 'school'; f.t = 0; } }
                // while the school grazes, a fish now and then drops to a leaf tip below it
                if (school.phase === 'graze' && f.mode === 'school' && fr() < dt / 8) {
                    const li = nearestTip(f.x + f.vx * 0.6, f.z + f.vz * 0.6);
                    if (li >= 0) { f.mode = 'dive'; f.t = 0; f.leaf = li; }
                }
            }
            const tn = Math.hypot(tx, ty, tz) || 1, k = 1 - Math.exp(-turn * dt);
            const hx = f.vx / spd + (tx / tn - f.vx / spd) * k, hy = f.vy / spd + (ty / tn - f.vy / spd) * k, hz = f.vz / spd + (tz / tn - f.vz / spd) * k;
            const hn = Math.hypot(hx, hy, hz) || 1;
            const ns = spd + (target - spd) * (1 - Math.exp(-dt / (f.mode === 'flee' ? 0.08 : 0.9)));
            f.vx = hx / hn * ns; f.vy = hy / hn * ns; f.vz = hz / hn * ns;
            // a hand moving fast close by: bolt away from it
            if (hand.on && f.mode !== 'flee') {
                const rx = f.x - hand.x, ry = f.y - hand.y, rz = f.z - hand.z, d = Math.hypot(rx, ry, rz) || 1e-6;
                if (d < 0.55 && Math.hypot(hand.vx, hand.vy, hand.vz) > 0.25) { f.mode = 'flee'; f.t = 0; f.fx = rx / d; f.fy = Math.max(0.1, ry / d) * 0.6; f.fz = rz / d; }
            }
            if (fright && f.mode !== 'flee') {
                const w = vm[3] * f.x + vm[7] * f.y + vm[11] * f.z + vm[15];
                const sx = rc.left + ((vm[0] * f.x + vm[4] * f.y + vm[8] * f.z + vm[12]) / w + 1) / 2 * rc.width;
                const sy = rc.top + (1 - (vm[1] * f.x + vm[5] * f.y + vm[9] * f.z + vm[13]) / w) / 2 * rc.height;
                const ddx = sx - ptr.x, ddy = sy - ptr.y, dd = Math.hypot(ddx, ddy);
                if (dd < 0.1 * rc.width) {
                    f.mode = 'flee'; f.t = 0;
                    const n = dd || 1;
                    f.fx = ddx / n; f.fy = -ddy / n * 0.5; f.fz = -0.5;          // away on screen, and off into the blue
                    const fl = Math.hypot(f.fx, f.fy, f.fz); f.fx /= fl; f.fy /= fl; f.fz /= fl;
                }
            }
            f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
            // tail beat: frequency rises with speed (U ≈ 0.6 L f, Bainbridge), wider strokes when bolting
            f.ph += TAU * clamp(ns / (0.6 * f.L), 0.8, 9) * dt;
            f.amp += ((f.mode === 'flee' ? 0.9 : 0.25 + 0.4 * ns) - f.amp) * (1 - Math.exp(-dt / 0.2));
            const u = screenU(f.x, f.y, f.z);
            if (u > -0.15 && u < 1.15) allGone = false;
        }
        if (school.phase === 'out' && allGone && school.t > 1) { school.phase = 'away'; schoolClock = 0; school.next = 30 + 25 * fr(); nFish = 0; return; }
        nFish = 0;
        for (const f of fish) {
            const sp_ = Math.hypot(f.vx, f.vy, f.vz) || 1;
            let hx = f.vx / sp_, hy = f.vy / sp_, hz = f.vz / sp_;
            hy = clamp(hy, -0.6, 0.6);
            if (f.mode === 'nip') { const hs = Math.hypot(hx, hz) || 1; hx = hx / hs * 0.55; hz = hz / hs * 0.55; hy = -0.84 + 0.1 * Math.sin(f.t * 17); }
            fishData.set([f.x, f.y, f.z, f.L, hx, hy, hz, f.ph, f.amp, 0, 0, 0], nFish * 12);
            nFish++;
        }
    }

    let causT = 0;
    // uniforms that change per frame
    function frameUniforms() {
        const f = flow;
        const sw = new Float32Array(12), sk = new Float32Array(12);
        let swx = 0, swz = 0;
        f.comps.forEach((c, i) => {
            sw.set([c.dir[0], c.dir[1], c.U * f.E, c.w], i * 4);
            sk.set([c.k * c.dir[0], c.k * c.dir[1], c.ph, 0], i * 4);
            // slope of the long swell at the origin: dη/dx = a k sin(ωt+φ)
            const sl = c.amp * c.k * Math.sin(c.w * f.t + c.ph) * f.E;
            swx += sl * c.dir[0]; swz += sl * c.dir[1];
        });
        const sd = f.comps[0].dir;
        return {
            ...view, ivp: IPV, cam, L, sun, amb, ambUp, sigma, tile: TILE, t: f.t, tc: causT, depth: o.depth,
            mon2: new Float32Array([f.E, f.scroll, 0, 0]),
            raysGain: 0.55, shRect: new Float32Array([view.cx * 2 - 3.2, -4.6, 6.4, 4.4]),
            wk, ww, swell: new Float32Array([swx, swz]), sunAir: new Float32Array(sunAir), sdir: new Float32Array([sd[0], sd[1]]),
            sheath: sp.sheath, hv: HV, horizonNdc: 1 - 2 * HV,
            sw, sk, mon: new Float32Array([f.Uc, f.dU, f.kv, f.yv]), dc: new Float32Array([f.dc[0], f.dc[2], f.dp[0], f.dp[2]]),
            rdb: 0.5 * RHO * CD / (sp.drho * G * sp.t),
            hand: new Float32Array([hand.x, hand.y, hand.z, hand.on ? 1 : 0]), handV: new Float32Array([hand.vx, hand.vy, hand.vz]),
            nFar: quality.far, nNear: quality.near, fish: fishData, nFish,
        };
    }

    // ── loop ──
    let raf = 0, last = 0, visible = false, paused = !!o.paused, dead = false, acc = 0, frames = 0;
    let awakeUntil = 0, scrollTarget = 0;
    let state = 'idle';
    const reduced = () => calm.matches;
    function setState(s) { if (state === s && el.dataset.state === s) return; state = s; el.dataset.state = s; }
    function draw(caustics = true) { if (R.plateReady || R.kind === 'webgl') R.render(frameUniforms(), meadow, snow, { caustics }); frames++; }
    function running() { return !dead && visible && !paused && !reduced() && !document.hidden; }
    function kick() {
        if (raf || !running()) return;
        last = performance.now();
        raf = requestAnimationFrame(tick);
    }
    const DT = 1 / 90;
    // the sea is up while someone is here: arriving, scrolling, a hand in the water. Left alone,
    // the swell dies away, the vortices stop rolling, the surface goes glassy, the school leaves,
    // and when nothing is moving any more the loop stops.
    function wake() {
        if (dead || reduced() || paused) return;
        awakeUntil = performance.now() + o.idle * 1000;
        kick();
    }
    function maxLeafSpeed() {
        const v = meadow.vel, n = Math.min(meadow.N, quality.near) * (meadow.S + 1) * 3;
        let m = 0;
        for (let i = 0; i < n; i++) { const a = Math.abs(v[i]); if (a > m) m = a; }
        return m;
    }
    function tick(now) {
        raf = 0;
        if (!running()) { setState(paused ? 'paused' : 'idle'); return; }
        setState('live');
        const frameMs = now - last;
        let dt = Math.min(0.05, frameMs / 1000); last = now;
        const target = now < awakeUntil ? 1 : 0;
        // the swell builds over a few seconds and dies away more slowly
        flow.E += (target - flow.E) * (1 - Math.exp(-dt / (target > flow.E ? 2.4 : 5)));
        if (!target && flow.E < 0.003) flow.E = 0;
        causT += dt * flow.E;
        // scrolling stirs a current that leans the meadow, then slackens
        scrollTarget *= Math.exp(-dt / 0.3);
        flow.scroll += (scrollTarget - flow.scroll) * (1 - Math.exp(-dt / 0.35));
        if (Math.abs(flow.scroll) < 1e-4 && Math.abs(scrollTarget) < 1e-4) flow.scroll = scrollTarget = 0;
        acc += dt;
        let n = 0;
        const p0 = performance.now();
        while (acc >= DT && n < 5) { step(DT); acc -= DT; n++; }
        if (n === 5) acc = 0;
        swim(Math.min(dt, 0.05), target === 1);
        if (frames > 30) govern(frameMs, (performance.now() - p0) / Math.max(1, n) * 1.5);
        if (tilt && tilt.active) { flow.tiltAng += (clamp(tilt.x, -1, 1) * 0.9 - flow.tiltAng) * 0.05; flow.setDir(); }
        if (hand.on && now - hand.lastMove > 1400 && hand.pointer !== 'mouse') hand.on = false;
        draw(true);
        if (!target && flow.E === 0 && !flow.scroll && !hand.on && !puffs.length && school.phase === 'away' && maxLeafSpeed() < 2e-3) {
            setState('resting');
            return;
        }
        raf = requestAnimationFrame(tick);
    }
    // settle the meadow into the flow before anyone sees it
    function settle(seconds) { const n = Math.round(seconds / DT); for (let i = 0; i < n; i++) step(DT); }
    function stillFrame() {
        // reduced motion: let the leaves lean into a frozen moment of the flow, no animation
        const t0 = flow.t;
        const saved = flow.comps.map((c) => c.w);
        flow.comps.forEach((c) => { c.w = 0; });
        flow.Uc0 = flow.Uc;
        flow.E = 1;
        for (let i = 0; i < 360; i++) { flow.t = t0; step(DT); flow.t = t0; }
        flow.comps.forEach((c, i) => { c.w = saved[i]; });
        draw(true);
    }

    let tilt = null;
    import('./tilt.js').then((m) => { tilt = m.default; }).catch(() => {});

    // pointer = a swimmer's hand. The canvas rises above the band over the page's own text, so it
    // takes no events itself: the band listens (touch, pen, mouse), and a mouse is also followed
    // over the risen leaves. A vertical swipe on the band still scrolls (touch-action: pan-y).
    const ptr = { x: 0, y: 0, vx: 0, vy: 0, t: 0 };
    function pointerAt(e) {
        const dtp = Math.max(8, e.timeStamp - ptr.t);
        ptr.vx = (e.clientX - ptr.x) / dtp * 1000; ptr.vy = (e.clientY - ptr.y) / dtp * 1000;
        ptr.x = e.clientX; ptr.y = e.clientY; ptr.t = e.timeStamp;
        hand.pointer = e.pointerType; hand.lastMove = performance.now();
        handTo(handRay(e.clientX, e.clientY), e.timeStamp);
        wake();
    }
    const inCanvas = (e) => { const r = canvas.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; };
    on(el, 'pointerdown', (e) => { if (!reduced() && !paused) pointerAt(e); });
    on(el, 'pointermove', (e) => {
        if (reduced() || paused || e.pointerType === 'mouse') return;
        if (!e.buttons && e.pressure === 0) return;
        pointerAt(e);
    });
    on(window, 'pointermove', (e) => {
        if (reduced() || paused || e.pointerType !== 'mouse' || !visible) return;
        if (inCanvas(e)) pointerAt(e); else if (hand.on && hand.pointer === 'mouse') hand.on = false;
    }, { passive: true });
    const handOff = () => { hand.on = false; };
    on(el, 'pointercancel', handOff);
    on(el, 'pointerup', (e) => { if (e.pointerType !== 'mouse') hand.on = false; });
    // scroll is current: the page's scroll speed stirs the water along the band
    let lastSY = window.scrollY, lastST = performance.now();
    on(window, 'scroll', () => {
        const now = performance.now(), dts = Math.max(8, now - lastST);
        const v = (window.scrollY - lastSY) / dts * 1000;          // px/s
        lastSY = window.scrollY; lastST = now;
        if (!visible || reduced() || paused) return;
        scrollTarget = clamp(scrollTarget * 0.5 + v * 0.00011, -0.16, 0.16);
        wake();
    }, { passive: true });

    btn.addEventListener('click', () => {
        paused = !paused;
        btn.setAttribute('aria-pressed', String(paused));
        btn.querySelector('.sm-vh').textContent = paused ? 'Play the meadow' : 'Pause the meadow';
        if (paused) { cancelAnimationFrame(raf); raf = 0; setState('paused'); } else wake();
    }, { signal: ac.signal });

    on(document, 'visibilitychange', () => { if (!document.hidden) kick(); });
    const io = new IntersectionObserver((en) => { const was = visible; visible = en[en.length - 1].isIntersecting; if (visible && !was) wake(); else if (visible) kick(); }, { rootMargin: '0px', threshold: 0.12 });
    io.observe(el);
    let w0 = 0, h0 = 0, rt = 0;
    const ro = new ResizeObserver(() => {
        const r = el.getBoundingClientRect();
        if (Math.abs(r.width - w0) < 1 && Math.abs(r.height - h0) < 1) return;
        w0 = r.width; h0 = r.height;
        clearTimeout(rt);
        rt = setTimeout(() => {
            if (dead) return;
            const oldTan = view.tanX, oldCx = view.cx;
            layout();
            // rebuild placement only if the visible width changed a lot
            if (Math.abs(view.tanX - oldTan) > 0.15 || Math.abs(view.cx - oldCx) > 0.1) {
                meadow = buildMeadow(o, view, 7);
                far = R.kind === 'webgl' ? buildFar(o, view, 23, sp) : [];
                R.setMeadow(meadow, far);
                settle(reduced() ? 0 : 3);
                for (let i = 0; i < o.snow; i++) seedSnow(i);
            }
            if (reduced()) stillFrame(); else if (!raf) draw(true);
        }, 80);
    });
    ro.observe(el);
    on(calm, 'change', () => { if (reduced()) { cancelAnimationFrame(raf); raf = 0; setState('still'); stillFrame(); } else wake(); });

    // plate
    const plateImg = new Image();
    plateImg.decoding = 'async';
    plateImg.onload = () => {
        if (dead) return;
        R.setPlate(plateImg);
        el.classList.add('is-live');
        if (reduced()) { setState('still'); stillFrame(); } else { draw(true); kick(); }
    };
    plateImg.onerror = () => { el.classList.add('is-live'); draw(true); kick(); };
    plateImg.src = new URL(o.plate, el.baseURI || document.baseURI).href;
    if (FN && R.setFish) {
        const fishImg = new Image();
        fishImg.decoding = 'async';
        fishImg.onload = () => { if (!dead) R.setFish(fishImg); };
        fishImg.src = new URL(o.fishImg, el.baseURI || document.baseURI).href;
    }

    flow.advance(0);
    settle(reduced() ? 0 : 2.5);
    if (reduced()) setState('still');
    on(canvas, 'webglcontextlost', (e) => { e.preventDefault(); cancelAnimationFrame(raf); raf = 0; });

    function destroy() {
        dead = true;
        ac.abort();
        cancelAnimationFrame(raf);
        io.disconnect(); ro.disconnect();
        canvas.remove(); btn.remove();
        el.classList.remove('sm', 'is-live');
        delete el.dataset.state; delete el.dataset.renderer;
        if (img) img.removeAttribute('aria-hidden');
        delete el.__seagrassMeadow;
    }
    destroy.pause = () => { if (!paused) btn.click(); };
    destroy.play = () => { if (paused) btn.click(); };
    // a hand swept through the meadow, left to right, about 40 cm above the sand at 1.2 m
    destroy.sweep = (dur = 1.3) => new Promise((res) => {
        const t0 = performance.now();
        hand.pointer = 'script';
        const go = () => {
            const k = (performance.now() - t0) / (dur * 1000);
            if (k >= 1 || dead) { hand.on = false; res(); return; }
            const x = -0.9 + 1.8 * k, z = -1.1 - 0.15 * Math.sin(k * Math.PI);
            hand.lastMove = performance.now();
            handTo([x + view.cx * 1.2, 0.28, z], performance.now());
            requestAnimationFrame(go);
        };
        go();
    });
    // testing / scripting: advance the simulation by `sec` seconds without waiting for frames
    destroy.advance = (sec, handPath, noDraw) => {
        const n = Math.round(sec / DT);
        for (let i = 0; i < n; i++) {
            if (handPath) { const p = handPath(i / n); if (p) { if (!hand.on) handTo(p, 0); hand.tx = p[0]; hand.ty = p[1]; hand.tz = p[2]; } else hand.on = false; }
            step(DT);
            if (i % 3 === 2) swim(DT * 3);
        }
        if (handPath) hand.on = false;
        if (!noDraw) draw(true);
    };
    destroy.school = () => ({ phase: school.phase, n: nFish });
    // test-only internals (not part of the API, may change): non-enumerable so they stay out of
    // spreads, Object.keys and console listings
    Object.defineProperty(destroy, '_sim', { enumerable: false, configurable: false, get: () => ({ meadow, flow, quality }) });
    Object.defineProperty(destroy, '_loop', { enumerable: false, configurable: false, get: () => ({ raf, visible, paused, hidden: document.hidden }) });
    Object.defineProperty(destroy, 'state', { get: () => state });
    Object.defineProperty(destroy, 'frames', { get: () => frames });
    Object.defineProperty(destroy, 'time', { get: () => flow.t });
    destroy.renderer = R.kind;
    destroy.blades = meadow.N; destroy.farBlades = far.length;
    if (img) img.setAttribute('aria-hidden', 'true');
    el.__seagrassMeadow = destroy;
    return destroy;
}

document.querySelectorAll('[data-seagrass-meadow]').forEach((el) => seagrassMeadow(el));
