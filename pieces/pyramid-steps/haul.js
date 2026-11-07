/*
 *  HAUL // a block of limestone on a wooden sledge, hauled over sand. A layer of pyramid-steps; it can also stand
 *  alone:  const lane = haul(container, { assets, faces });  lane.go() hauls one block; lane.destroy().
 *
 *  The sand is a height field (3.2 cm cells). The sledge's runners sink into it as far as the sand gives under
 *  their load and push what is above that level ahead and aside: dry, a bow wave of sand builds in front of each
 *  runner, is pushed along and slumps at its angle of repose, and the runners leave ruts with low ridges. Wet,
 *  capillary bridges between the grains stiffen the sand: the runners barely sink, no heap builds, and the force
 *  the haulers need about halves. That is the measurement of Fall, Weber, Pakpour, Lenoir, Shahidzadeh, Fiscina,
 *  Wagner and Bonn, "Sliding friction on wet and dry sand", Phys. Rev. Lett. 112, 175502 (2014), and it is what
 *  the man standing on the front of the sledge in the tomb of Djehutihotep (Deir el-Bersha, c. 1880 BCE) is
 *  doing: pouring water on the sand before the runners. Too much water and it turns to mud: the runners sink again
 *  and the force climbs.
 *
 *  Water is a second field: poured from the jar on the sledge's deck (press and hold it), it lands just ahead of
 *  the runners, spreads a little and dries over about twenty seconds. The haulers are off to the right, pulling
 *  the rope with a force that falls as they walk faster; take hold of the rope and your pull is added to theirs.
 *  A rope only pulls.
 *
 *  Units are metres, kilograms, seconds; time runs twice as fast as life. WebGL1, one draw of the sand as a lit,
 *  displaced mesh, the sledge and block as textured boxes, the jar as a cut-out, the rope as a ribbon. Nothing
 *  runs at rest.
 */
const calm = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false, addEventListener() {}, removeEventListener() {} };
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/* ---- the physics ------------------------------------------------------------------------------------------ */
export const SAND = {
    L: 5.2, W: 1.5, cell: .032,               // the lane, metres
    repose: Math.tan(34 * Math.PI / 180),     // dry sand's angle of repose
    g: 9.81,
    timescale: 2,
};
// Pulling force over weight, against gravimetric water content w (kg water / kg sand). Fall et al. 2014 measured
// the force on a sledge over sand falling by about half from dry to around 5% water, as the sand's shear modulus
// rises; past that the capillary bridges merge and the sand softens toward mud.
export function pullCoefficient(w) {
    const dry = .6, best = .3;
    if (w <= .05) return mix(dry, best, smooth(0, .05, w) * .8 + (w / .05) * .2);
    return best + (.62 - best) * smooth(.07, .15, w);
}
// how far the runners sink under the load, metres: soft dry sand gives; damp sand is stiff; mud gives again
export const sinkDepth = (w) => .024 * (1 - .88 * smooth(0, .05, w)) + .04 * smooth(.08, .15, w);
// wet sand stands steeper (capillary cohesion), up to near vertical in a damp cut
const reposeAt = (w) => SAND.repose * (1 + 2.4 * smooth(.01, .06, w) - 1.2 * smooth(.1, .16, w));

const BLOCK = { L: 1.2, H: .78, D: .9, rho: 2300 };      // a core block: about 1.9 tonnes
const SLED = { L: 1.753, H: .222, gauge: .781, runner: .12, mass: 110 };   // Met 24.1.84: w 175.3, h 78.1, d 22.2 cm

/* ---- the view ---------------------------------------------------------------------------------------------- */
const VIEW = { yaw: 18 * Math.PI / 180, pitch: 23 * Math.PI / 180 };
const SUN = (() => { const el = 26 * Math.PI / 180, az = -60 * Math.PI / 180; return [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)]; })();
const cy = Math.cos(VIEW.yaw), sy = Math.sin(VIEW.yaw), cp = Math.cos(VIEW.pitch), sp = Math.sin(VIEW.pitch);
const R = [cy, 0, -sy], U = [-sp * sy, cp, -sp * cy], C = [cp * sy, sp, cp * cy];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/* ---- shaders ----------------------------------------------------------------------------------------------- */
const COMMON = `
uniform vec3 uR, uU, uC; uniform vec4 uFit;
vec4 place(vec3 p) { return vec4(dot(p, uR) * uFit.x + uFit.z, dot(p, uU) * uFit.y + uFit.w, -dot(p, uC) * .08, 1.); }`;
const LIGHT = `
uniform vec3 uSun;
vec3 light(vec3 n, float lit) {
    float d = max(dot(n, uSun), 0.) * lit;
    vec3 sun = vec3(1., .9, .74) * d * 1.62, sky = vec3(.62, .7, .86) * (.56 + .14 * n.y);
    vec3 sand = vec3(1., .86, .66) * .44 * (1. - abs(n.y));
    return (sun + sky + sand) / 1.39;
}`;
const SAND_VS = `
attribute vec3 aP; attribute vec3 aN; attribute vec2 aW;
varying vec3 vP; varying vec3 vN; varying vec2 vW;` + COMMON + `
void main() { vP = aP; vN = aN; vW = aW; gl_Position = place(aP); }`;
const SAND_FS = `precision mediump float;
varying vec3 vP; varying vec3 vN; varying vec2 vW;
uniform sampler2D uGrain; uniform vec2 uLane;` + LIGHT + `
void main() {
    vec3 n = normalize(vN);
    float g = texture2D(uGrain, vP.xz * 1.9).r, g2 = texture2D(uGrain, vP.xz * .37 + .31).r;
    vec3 base = vec3(.87, .75, .57) * (.84 + .3 * (g - .5) + .12 * (g2 - .5));
    float w = vW.x;
    float wet = smoothstep(.006, .06, w);
    base *= mix(vec3(1.), vec3(.6, .56, .52), wet);
    base = mix(base, base * vec3(.92, .86, .8), smoothstep(.09, .15, w));      // mud: browner
    vec3 col = base * light(n, 1. - vW.y);
    // standing water on mud catches the sun
    vec3 h = normalize(uSun + vec3(0., .4, .9));
    col += vec3(1., .95, .85) * pow(max(dot(n, h), 0.), 60.) * smoothstep(.1, .16, w) * .5;
    // the strip of sand lies on the paper: its long edges and ends are feathered by the grain
    float e = min(min(vP.z + uLane.y * .5, uLane.y * .5 - vP.z) / .22, min(vP.x + .05, uLane.x + .05 - vP.x) / .5);
    float a = smoothstep(0., 1., e + (g - .5) * .9);
    gl_FragColor = vec4(col, 1.) * a;
}`;
const BOX_VS = `
attribute vec3 aP; attribute vec3 aN; attribute vec2 aT; attribute float aS;
varying vec2 vT; varying vec3 vN; varying float vS;` + COMMON + `
void main() { vT = aT; vN = aN; vS = aS; gl_Position = place(aP); }`;
const BOX_FS = `precision mediump float;
varying vec2 vT; varying vec3 vN; varying float vS;
uniform sampler2D uTex; uniform vec3 uRim; uniform float uCut;` + LIGHT + `
void main() {
    vec4 t = texture2D(uTex, vT);
    if (uCut > .5 && t.a < .5) discard;
    vec3 c = uCut > .5 ? t.rgb : mix(uRim, t.rgb, t.a);
    gl_FragColor = vec4(c * light(normalize(vN), 1. - vS), 1.);
}`;
const DROP_VS = `
attribute vec3 aP; attribute float aA; varying float vA;` + COMMON + `
uniform float uPx;
void main() { vA = aA; gl_Position = place(aP); gl_PointSize = uPx; }`;
const DROP_FS = `precision mediump float; varying float vA;
void main() { vec2 d = gl_PointCoord - .5; float r = dot(d, d); if (r > .25) discard;
    gl_FragColor = vec4(vec3(.82, .87, .9) * (1. - r), 1.) * vA * .75; }`;

function program(gl, vs, fs) {
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {}, a = {};
    const nu = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); for (let i = 0; i < nu; i++) { const n = gl.getActiveUniform(p, i).name; u[n] = gl.getUniformLocation(p, n); }
    const na = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES); for (let i = 0; i < na; i++) { const n = gl.getActiveAttrib(p, i).name; a[n] = gl.getAttribLocation(p, n); }
    return { p, u, a };
}
function texture(gl, img, repeat) {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    const pot = (n) => (n & (n - 1)) === 0;
    const mip = pot(img.width) && pot(img.height);
    if (mip) gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const wrap = repeat && mip ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    return t;
}

function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* ---- the layer --------------------------------------------------------------------------------------------- */
export function haul(el, opts = {}) {
    const base = new URL(opts.assets || './assets/', opts.assets ? document.baseURI : import.meta.url);
    const r = rng(opts.seed ?? ((Math.random() * 1e9) | 0));
    const NX = Math.round(SAND.L / SAND.cell) + 1, NZ = Math.round(SAND.W / SAND.cell) + 1, N = NX * NZ;
    const dx = SAND.L / (NX - 1), dz = SAND.W / (NZ - 1);
    const h = new Float32Array(N), w = new Float32Array(N), tmp = new Float32Array(N), sh = new Float32Array(N);
    const X = (i) => (i % NX) * dx, Z = (i) => Math.floor(i / NX) * dz - SAND.W / 2;
    // the lane: wind ripples across it on a long gentle swell
    for (let k = 0; k < N; k++) {
        const x = X(k), z = Z(k);
        // ripples about 18 cm apart (the grid resolves nothing finer; the grain photograph carries the rest)
        const rip = Math.sin((x * .96 + z * .28) * 2 * Math.PI / .18 + Math.sin(z * 2.1 + x * .5) * 1.1);
        h[k] = .005 * (rip * .5 + .5) ** 1.6 + .02 * Math.sin(x * .9 + 1.3) * Math.sin(z * 2.2 + .4);
        w[k] = .003;
    }
    let dirty = true;

    // ---- DOM
    const canvas = document.createElement('canvas');
    canvas.className = 'ps-lane-canvas'; canvas.setAttribute('aria-hidden', 'true');
    el.appendChild(canvas);
    const jar = document.createElement('button');
    jar.type = 'button'; jar.className = 'ps-jar';
    jar.setAttribute('aria-label', 'Pour water on the sand before the runners (press and hold)');
    el.appendChild(jar);
    el.tabIndex = el.tabIndex >= 0 ? el.tabIndex : 0;
    if (!el.hasAttribute('aria-label')) el.setAttribute('aria-label', 'The haul. Hold the right arrow to pull with the haulers');

    // ---- state of the sledge: x is the back of the runners along the lane
    const mass = BLOCK.L * BLOCK.H * BLOCK.D * BLOCK.rho + SLED.mass;
    const S = { phase: 'idle', x: -SLED.L - .4, v: 0, yb: 0, loaded: false, bx: 0, by: 0, pour: 0, pull: 0, tilt: 0, force: 0, mu: 0 };
    const stopX = SAND.L - SLED.L - .55;
    let tex = null, faces = opts.faces || null, blockTex = null;
    let onArrive = null;

    // ---- forces
    function underRunners(field) {
        // mean of a field under the front halves of both runners (where the load bears on the sand first)
        let s = 0, n = 0;
        const x0 = S.x + SLED.L * .45, x1 = S.x + SLED.L;
        for (const zc of [-1, 1]) {
            const z = zc * (SLED.gauge / 2 - SLED.runner / 2);
            for (let x = x0; x <= x1; x += dx * 2) {
                const ix = Math.round(x / dx), iz = Math.round((z + SAND.W / 2) / dz);
                if (ix < 0 || ix >= NX) continue;
                s += field[iz * NX + ix]; n++;
            }
        }
        return n ? s / n : (field === w ? .003 : 0);
    }
    function physics(dt) {
        const wu = underRunners(w);
        const mu = pullCoefficient(wu);
        const N = mass * SAND.g;
        const team = S.phase === 'enter' ? .95 * N * Math.max(0, 1 - S.v / 1.2) : S.phase === 'leave' ? .5 * N * Math.max(0, 1 - S.v / 1.6) : 0;
        const pull = S.phase === 'enter' || S.phase === 'leave' ? Math.max(0, S.pull) * N : 0;   // a rope only pulls
        const drive = team + pull;
        const fr = mu * (S.loaded ? N : SLED.mass * SAND.g);
        let a;
        if (Math.abs(S.v) < 1e-3 && drive <= fr) { S.v = 0; a = 0; }
        else a = (drive - fr * Math.sign(S.v || 1)) / (S.loaded ? mass : SLED.mass + mass * .02);
        S.v = Math.max(0, S.v + a * dt);
        S.x += S.v * dt;
        S.force = drive; S.mu = mu;
        if (S.phase === 'enter' && S.x >= stopX) { S.phase = 'stop'; }
        if (S.phase === 'stop' && S.v === 0) { S.phase = 'unload'; S.t0 = now(); el.dispatchEvent(new CustomEvent('haul:arrive', { bubbles: true })); }
        // runners settle into the sand as far as it gives
        const target = underRunnersSurface() - sinkDepth(wu) * (S.loaded ? 1 : .25);
        S.yb += (target - S.yb) * Math.min(1, dt * 14);
        if (S.x > -SLED.L && S.x < SAND.L) plough();
    }
    // the undisturbed surface level just ahead of the runners
    function underRunnersSurface() {
        let s = 0, n = 0;
        for (const zc of [-1, 1]) {
            const z = zc * (SLED.gauge / 2 - SLED.runner / 2);
            const iz = Math.round((z + SAND.W / 2) / dz);
            for (let x = S.x; x <= S.x + SLED.L * .8; x += dx * 3) {
                const ix = Math.round(x / dx); if (ix < 0 || ix >= NX) continue;
                s += hBase[iz * NX + ix]; n++;
            }
        }
        return n ? s / n : 0;
    }
    // where the runners are, the sand above their bottom is pushed: ahead from under the front, aside from under the
    // rest. Volume is conserved; the relaxation pass then slumps it.
    function plough() {
        const yb = S.yb, half = SLED.runner / 2;
        let moved = false;
        for (const zc of [-1, 1]) {
            const zc0 = zc * (SLED.gauge / 2 - half);
            const iz0 = Math.max(0, Math.floor((zc0 - half + SAND.W / 2) / dz)), iz1 = Math.min(NZ - 1, Math.ceil((zc0 + half + SAND.W / 2) / dz));
            const ixF = Math.floor((S.x + SLED.L - .06) / dx), ixB = Math.max(0, Math.ceil(S.x / dx));
            for (let iz = iz0; iz <= iz1; iz++) {
                for (let ix = Math.min(NX - 2, ixF); ix >= ixB; ix--) {
                    const k = iz * NX + ix, e = h[k] - yb;
                    if (e <= 0) continue;
                    h[k] = yb; moved = true;
                    if (ix >= ixF - 2) {
                        // the prow's bow wave: most ahead, some to each side
                        const ka = k + Math.min(3, NX - 1 - ix);
                        h[ka] += e * .7;
                        const side = iz < (iz0 + iz1) / 2 ? -1 : 1;
                        const ks = Math.max(0, Math.min(NZ - 1, iz + side * (iz1 - iz0 + 1))) * NX + ix + 1;
                        h[Math.min(N - 1, ks)] += e * .3;
                    } else {
                        // under the runner behind its front: squeezed out to the nearer side, a ridge along the rut
                        const side = iz < (iz0 + iz1) / 2 ? -1 : 1;
                        const iz2 = Math.max(0, Math.min(NZ - 1, side < 0 ? iz0 - 1 : iz1 + 1));
                        h[iz2 * NX + ix] += e;
                    }
                }
            }
        }
        if (moved) { dirty = true; relaxFrames = Math.max(relaxFrames, 40); }
    }
    let relaxFrames = 0;
    // granular relaxation: any neighbour pair steeper than the angle of repose passes part of the excess downhill
    function relax() {
        tmp.fill(0);
        let any = false;
        for (let iz = 0; iz < NZ; iz++) for (let ix = 0; ix < NX; ix++) {
            const k = iz * NX + ix;
            const pairs = ix < NX - 1 ? [[k + 1, dx]] : [];
            if (iz < NZ - 1) pairs.push([k + NX, dz]);
            for (const [j, d] of pairs) {
                const diff = h[k] - h[j], t = reposeAt(Math.max(w[k], w[j])) * d;
                const ex = Math.abs(diff) - t;
                if (ex > 1e-5) { const q = ex * .2 * Math.sign(diff); tmp[k] -= q; tmp[j] += q; any = true; }
            }
        }
        if (any) { for (let k = 0; k < N; k++) h[k] += tmp[k]; dirty = true; }
        return any;
    }
    // water: soaks and spreads a little, dries back to the desert's few per mille
    function water(dt) {
        let any = false;
        if (S.pour > 0 && S.x > -SLED.L && S.x < SAND.L) {
            // the stream lands just ahead of the prows and is swung across both runners' tracks
            const xa = S.x + SLED.L + .14, rate = .085 * S.pour * dt;
            for (let iz = 0; iz < NZ; iz++) for (let ix = Math.max(0, Math.floor((xa - .3) / dx)); ix < Math.min(NX, Math.ceil((xa + .3) / dx)); ix++) {
                const z = iz * dz - SAND.W / 2, x = ix * dx;
                const lobe = Math.exp(-((x - xa) ** 2) / (2 * .09 ** 2)) * (Math.exp(-((Math.abs(z) - .33) ** 2) / (2 * .12 ** 2)) + .35 * Math.exp(-(z * z) / (2 * .18 ** 2)));
                w[iz * NX + ix] = Math.min(.22, w[iz * NX + ix] + rate * lobe);
            }
            any = true;
        }
        const k = 1 - dt / 20;
        for (let i = 0; i < N; i++) { const v = w[i]; if (v > .0031) { w[i] = .003 + (v - .003) * k; any = true; } }
        if (any) dirty = true;
        return any;
    }
    const hBase = new Float32Array(h);       // the lane as it lay before anything crossed it

    // ---- GL
    const gl = canvas.getContext('webgl', { antialias: true, premultipliedAlpha: true, alpha: true });
    if (!gl) { canvas.remove(); jar.remove(); return { go() { return Promise.resolve(); }, destroy() {} }; }
    const sandP = program(gl, SAND_VS, SAND_FS), boxP = program(gl, BOX_VS, BOX_FS), dropP = program(gl, DROP_VS, DROP_FS);
    const vb = gl.createBuffer(), ib = gl.createBuffer(), bb = gl.createBuffer(), db = gl.createBuffer();
    const verts = new Float32Array(N * 8);
    const idx = new Uint16Array((NX - 1) * (NZ - 1) * 6);
    { let p = 0; for (let iz = 0; iz < NZ - 1; iz++) for (let ix = 0; ix < NX - 1; ix++) { const k = iz * NX + ix; idx.set([k, k + NX, k + 1, k + 1, k + NX, k + NX + 1], p); p += 6; } }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    let W = 1, H = 1, dpr = 1, fit = [1, 1, 0, 0], pxPerM = 100;

    function shadows() {
        // what the sledge and block shade on the sand, and the sand's own heaps (marched toward the sun)
        const boxes = sceneBoxes();
        const sx = SUN[0], syy = SUN[1], sz = SUN[2];
        for (let k = 0; k < N; k++) {
            const x = X(k), z = Z(k), y = h[k];
            let s = 0;
            for (const b of boxes) {
                // slab test of the ray p + t*SUN against the box
                let t0 = 0, t1 = 1e9;
                const o = [x, y, z], d = [sx, syy, sz];
                let hit = true;
                for (let a = 0; a < 3 && hit; a++) {
                    if (Math.abs(d[a]) < 1e-6) { if (o[a] < b[0][a] || o[a] > b[1][a]) hit = false; continue; }
                    let ta = (b[0][a] - o[a]) / d[a], tb = (b[1][a] - o[a]) / d[a];
                    if (ta > tb) { const q = ta; ta = tb; tb = q; }
                    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) hit = false;
                }
                if (hit) { s = 1; break; }
            }
            if (!s) {
                // self shadow of the sand: a few steps toward the sun
                const ix = k % NX, iz = (k / NX) | 0;
                const stepx = sx / Math.hypot(sx, sz) * dx, stepz = sz / Math.hypot(sx, sz) * dx, rise = syy / Math.hypot(sx, sz) * dx;
                for (let n = 1; n < 10; n++) {
                    const jx = Math.round(ix + stepx * n / dx), jz = Math.round(iz + stepz * n / dz);
                    if (jx < 0 || jx >= NX || jz < 0 || jz >= NZ) break;
                    if (h[jz * NX + jx] > y + rise * n + .002) { s = .85; break; }
                }
            }
            sh[k] = s;
        }
    }
    function upload() {
        shadows();
        for (let iz = 0; iz < NZ; iz++) for (let ix = 0; ix < NX; ix++) {
            const k = iz * NX + ix, o = k * 8;
            const hl = h[iz * NX + Math.max(0, ix - 1)], hr = h[iz * NX + Math.min(NX - 1, ix + 1)];
            const hd = h[Math.max(0, iz - 1) * NX + ix], hu = h[Math.min(NZ - 1, iz + 1) * NX + ix];
            let nx = -(hr - hl) / (2 * dx), nz = -(hu - hd) / (2 * dz), ny = 1; const l = Math.hypot(nx, ny, nz);
            verts[o] = ix * dx; verts[o + 1] = h[k]; verts[o + 2] = iz * dz - SAND.W / 2;
            verts[o + 3] = nx / l; verts[o + 4] = ny / l; verts[o + 5] = nz / l; verts[o + 6] = w[k]; verts[o + 7] = sh[k];
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
        dirty = false;
    }

    // the sledge and its load as axis-aligned boxes (for shadows) and as textured faces (for drawing)
    function sceneBoxes() {
        if (S.x < -SLED.L - .3 || S.x > SAND.L + .5) return [];
        const out = [], y0 = S.yb;
        for (const zc of [-1, 1]) {
            const z = zc * (SLED.gauge / 2 - SLED.runner / 2);
            out.push([[S.x, y0, z - SLED.runner / 2], [S.x + SLED.L - .2, y0 + SLED.H, z + SLED.runner / 2]]);
        }
        if (S.loaded || S.phase === 'unload') {
            const bx = S.x + (SLED.L - BLOCK.L) / 2 + S.bx;
            out.push([[bx, y0 + SLED.H, -BLOCK.D / 2], [bx + BLOCK.L, y0 + SLED.H + BLOCK.H, BLOCK.D / 2]]);
        }
        return out;
    }
    const boxVerts = [];
    function quad(P0, P1, P3, n, uv, shade) {
        // P0 top-left, P1 top-right, P3 bottom-left; uv = [u0, v0, u1, v1]
        const P2 = [P1[0] + P3[0] - P0[0], P1[1] + P3[1] - P0[1], P1[2] + P3[2] - P0[2]];
        const v = (P, u, t) => boxVerts.push(P[0], P[1], P[2], n[0], n[1], n[2], u, t, shade);
        v(P0, uv[0], uv[1]); v(P1, uv[2], uv[1]); v(P3, uv[0], uv[3]);
        v(P1, uv[2], uv[1]); v(P2, uv[2], uv[3]); v(P3, uv[0], uv[3]);
    }
    function drawBoxes() {
        if (!tex) return;
        const y0 = S.yb;
        // runners: the far one first, then crossbeams, then the near one
        boxVerts.length = 0;
        const runner = (zc) => {
            const z = zc * (SLED.gauge / 2 - SLED.runner / 2), zf = z + SLED.runner / 2, zb = z - SLED.runner / 2;
            const xb = S.x, xf = S.x + SLED.L - .24;
            quad([xb, y0 + SLED.H, zf], [xf, y0 + SLED.H, zf], [xb, y0, zf], [0, 0, 1], [0, 0, .86, 1], 0);
            quad([xb, y0 + SLED.H, zb], [xf, y0 + SLED.H, zb], [xb, y0 + SLED.H, zf], [0, 1, 0], [0, .1, .86, .35], 0);
            // the upturned prow, in five segments: the runner's end curls up through a quarter turn
            const seg = 5, rad = .24;
            for (let s = 0; s < seg; s++) {
                const a0 = s / seg * Math.PI / 2, a1 = (s + 1) / seg * Math.PI / 2;
                const ox0 = xf + Math.sin(a0) * rad, oy0 = y0 + rad - Math.cos(a0) * rad, ox1 = xf + Math.sin(a1) * rad, oy1 = y0 + rad - Math.cos(a1) * rad;
                // its side: a band of the runner's height, swept round the curve
                const ix0 = ox0 - Math.sin(a0) * (SLED.H * .1), iy0 = oy0 + SLED.H * Math.cos(a0) * .95;
                const ix1 = ox1 - Math.sin(a1) * (SLED.H * .1), iy1 = oy1 + SLED.H * Math.cos(a1) * .95;
                const u0 = .86 + s / seg * .14, u1 = .86 + (s + 1) / seg * .14;
                boxVerts.push(ix0, iy0, zf, 0, 0, 1, u0, 0, 0, ix1, iy1, zf, 0, 0, 1, u1, 0, 0, ox0, oy0, zf, 0, 0, 1, u0, 1, 0);
                boxVerts.push(ix1, iy1, zf, 0, 0, 1, u1, 0, 0, ox1, oy1, zf, 0, 0, 1, u1, 1, 0, ox0, oy0, zf, 0, 0, 1, u0, 1, 0);
                // its outer face (the underside turning forward)
                const nn = [Math.sin((a0 + a1) / 2), -Math.cos((a0 + a1) / 2), 0];
                quad([ox0, oy0, zb], [ox1, oy1, zb], [ox0, oy0, zf], nn, [u0, .6, u1, 1], 0);
            }
        };
        const blockFaces = [];
        const lit = 0;
        runner(-1);
        // crossbeams: mortised between the runners, flush with their tops
        for (const fx of [.18, .5, .8]) {
            const x = S.x + fx * (SLED.L - .24) - .07, zl = -SLED.gauge / 2 + SLED.runner, zr = SLED.gauge / 2 - SLED.runner;
            quad([x, y0 + SLED.H - .01, zl], [x + .14, y0 + SLED.H - .01, zl], [x, y0 + SLED.H - .01, zr], [0, 1, 0], [0, 0, 1, 1], 0);
        }
        runner(1);
        const sledN = boxVerts.length / 9;
        // the block, on the deck (or being levered off it)
        if (S.loaded || S.phase === 'unload') {
            const bx = S.x + (SLED.L - BLOCK.L) / 2 + S.bx, by = y0 + SLED.H + S.by, x1 = bx + BLOCK.L, y1 = by + BLOCK.H, zf = BLOCK.D / 2, zb = -BLOCK.D / 2;
            const uv = (f) => { const [rx, ry, rw, rh] = f.rect; return [rx / tex.blockW, ry / tex.blockH, (rx + rw) / tex.blockW, (ry + rh) / tex.blockH]; };
            quad([bx, y1, zf], [x1, y1, zf], [bx, by, zf], [0, 0, 1], uv(blockTex.front), 0);
            quad([x1, y1, zf], [x1, y1, zb], [x1, by, zf], [1, 0, 0], uv(blockTex.side), 0);
            quad([bx, y1, zb], [x1, y1, zb], [bx, y1, zf], [0, 1, 0], uv(blockTex.top), 0);
        }
        const all = new Float32Array(boxVerts);
        gl.useProgram(boxP.p); uniforms(boxP);
        gl.bindBuffer(gl.ARRAY_BUFFER, bb); gl.bufferData(gl.ARRAY_BUFFER, all, gl.DYNAMIC_DRAW);
        const st = 9 * 4;
        gl.enableVertexAttribArray(boxP.a.aP); gl.vertexAttribPointer(boxP.a.aP, 3, gl.FLOAT, false, st, 0);
        gl.enableVertexAttribArray(boxP.a.aN); gl.vertexAttribPointer(boxP.a.aN, 3, gl.FLOAT, false, st, 12);
        gl.enableVertexAttribArray(boxP.a.aT); gl.vertexAttribPointer(boxP.a.aT, 2, gl.FLOAT, false, st, 24);
        gl.enableVertexAttribArray(boxP.a.aS); gl.vertexAttribPointer(boxP.a.aS, 1, gl.FLOAT, false, st, 32);
        gl.uniform1i(boxP.u.uTex, 0); gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex.wood); gl.uniform1f(boxP.u.uCut, 0); gl.uniform3f(boxP.u.uRim, .25, .2, .15);
        gl.drawArrays(gl.TRIANGLES, 0, sledN);
        if (all.length / 9 > sledN) {
            gl.bindTexture(gl.TEXTURE_2D, tex.blocks); gl.uniform3f(boxP.u.uRim, .3, .24, .17);
            gl.drawArrays(gl.TRIANGLES, sledN, all.length / 9 - sledN);
        }
    }
    function uniforms(P) {
        gl.uniform3fv(P.u.uR, R); gl.uniform3fv(P.u.uU, U); gl.uniform3fv(P.u.uC, C); gl.uniform4fv(P.u.uFit, fit);
        if (P.u.uSun) gl.uniform3fv(P.u.uSun, SUN);
    }

    // the rope: from the prows' lashing out to the haulers beyond the right edge; where you hold it, it goes
    // through your hand
    const rope = { grab: false, gx: 0, gy: 0, px: 0, py: 0 };
    function ropePoints() {
        const yb = S.yb;
        const a = [S.x + SLED.L - .02, yb + SLED.H + .16, 0];
        const far = [SAND.L + 3.5, 1.05, -.1];
        if (!rope.grab) {
            // a heavy rope under tension, sagging a little
            const pts = [];
            const sag = S.phase === 'enter' ? .025 : .1;
            for (let i = 0; i <= 16; i++) { const t = i / 16; pts.push([mix(a[0], far[0], t), mix(a[1], far[1], t) - Math.sin(t * Math.PI) * sag, mix(a[2], far[2], t)]); }
            return pts;
        }
        const hand = unproject(rope.px, rope.py, a[1] + .2);
        return [a, hand, far];
    }
    function drawRope() {
        const pts = ropePoints();
        const v = [];
        const thick = .028;
        for (let i = 0; i < pts.length - 1; i++) {
            const p = pts[i], q = pts[i + 1];
            v.push(p[0], p[1] + thick, p[2], 0, 1, 0, 0, 0, 0, q[0], q[1] + thick, q[2], 0, 1, 0, 1, 0, 0, p[0], p[1] - thick, p[2], 0, 1, 0, 0, 1, 0);
            v.push(q[0], q[1] + thick, q[2], 0, 1, 0, 1, 0, 0, q[0], q[1] - thick, q[2], 0, 1, 0, 1, 1, 0, p[0], p[1] - thick, p[2], 0, 1, 0, 0, 1, 0);
        }
        gl.useProgram(boxP.p); uniforms(boxP);
        gl.bindBuffer(gl.ARRAY_BUFFER, bb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.DYNAMIC_DRAW);
        const st = 36;
        gl.vertexAttribPointer(boxP.a.aP, 3, gl.FLOAT, false, st, 0); gl.vertexAttribPointer(boxP.a.aN, 3, gl.FLOAT, false, st, 12);
        gl.vertexAttribPointer(boxP.a.aT, 2, gl.FLOAT, false, st, 24); gl.vertexAttribPointer(boxP.a.aS, 1, gl.FLOAT, false, st, 32);
        gl.bindTexture(gl.TEXTURE_2D, tex.wood); gl.uniform1f(boxP.u.uCut, 0); gl.uniform3f(boxP.u.uRim, .55, .42, .28);
        gl.drawArrays(gl.TRIANGLES, 0, v.length / 9);
    }

    // drops falling from the jar's mouth
    const drops = [];
    function drawDrops(dt) {
        if (S.pour > 0 && Math.random() < .9) {
            const m = jarMouth();
            for (let k = 0; k < 3; k++) drops.push({ p: [m[0] + (Math.random() - .5) * .03, m[1], m[2] + (Math.random() - .5) * .5], v: [.9 + Math.random() * .3, .2, (Math.random() - .5) * .4], a: 1 });
        }
        for (const d of drops) { d.v[1] -= SAND.g * dt; d.p[0] += d.v[0] * dt; d.p[1] += d.v[1] * dt; d.p[2] += d.v[2] * dt; }
        for (let i = drops.length - 1; i >= 0; i--) if (drops[i].p[1] < 0) drops.splice(i, 1);
        if (!drops.length) return false;
        const v = new Float32Array(drops.length * 4);
        drops.forEach((d, i) => v.set([d.p[0], d.p[1], d.p[2], d.a], i * 4));
        gl.useProgram(dropP.p); uniforms(dropP); gl.uniform1f(dropP.u.uPx, Math.max(2, pxPerM * .018 * dpr));
        gl.bindBuffer(gl.ARRAY_BUFFER, db); gl.bufferData(gl.ARRAY_BUFFER, v, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(dropP.a.aP); gl.vertexAttribPointer(dropP.a.aP, 3, gl.FLOAT, false, 16, 0);
        gl.enableVertexAttribArray(dropP.a.aA); gl.vertexAttribPointer(dropP.a.aA, 1, gl.FLOAT, false, 16, 12);
        gl.drawArrays(gl.POINTS, 0, drops.length);
        gl.disableVertexAttribArray(dropP.a.aA);
        return true;
    }
    // the jar stands on the deck in front of the block
    const JAR = { h: .46, w: .3 };          // Met 22.1.1507: h 46.2 cm
    function jarFoot() { return [S.x + SLED.L - .38, S.yb + SLED.H, .18]; }
    function jarMouth() {
        const f = jarFoot(), t = S.tilt;
        return [f[0] + Math.sin(t) * JAR.h, f[1] + Math.cos(t) * JAR.h, f[2]];
    }

    function draw(dt) {
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        if (dirty) upload();
        gl.useProgram(sandP.p); uniforms(sandP);
        gl.uniform2f(sandP.u.uLane, SAND.L, SAND.W);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex.sand); gl.uniform1i(sandP.u.uGrain, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, vb);
        gl.enableVertexAttribArray(sandP.a.aP); gl.vertexAttribPointer(sandP.a.aP, 3, gl.FLOAT, false, 32, 0);
        gl.enableVertexAttribArray(sandP.a.aN); gl.vertexAttribPointer(sandP.a.aN, 3, gl.FLOAT, false, 32, 12);
        gl.enableVertexAttribArray(sandP.a.aW); gl.vertexAttribPointer(sandP.a.aW, 2, gl.FLOAT, false, 32, 24);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
        gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);
        gl.disableVertexAttribArray(sandP.a.aW);
        if (S.x > -SLED.L - .3 && S.x < SAND.L + .6) { drawBoxes(); drawRope(); }
        gl.depthMask(false);
        const raining = drawDrops(dt);
        gl.depthMask(true);
        placeJar();
        return raining;
    }
    function placeJar() {
        // the jar is a real button over the canvas, moving with the sledge and tipping as it pours
        const visible = S.x > -SLED.L && S.x < SAND.L && (S.loaded || S.phase === 'unload');
        jar.hidden = !visible;
        if (!visible) return;
        const f = jarFoot();
        const p = screen(f[0], f[1], f[2]);
        const hpx = JAR.h * pxPerM;
        jar.style.height = `${hpx.toFixed(1)}px`;
        jar.style.width = `${(hpx * 520 / 813).toFixed(1)}px`;
        jar.style.transform = `translate(${(p[0] - hpx * 260 / 813).toFixed(1)}px, ${(p[1] - hpx).toFixed(1)}px) rotate(${(S.tilt * 180 / Math.PI).toFixed(1)}deg)`;
    }
    // css px on the element for a world point
    function screen(x, y, z) {
        const sxp = (dot([x, y, z], R) * fit[0] + fit[2]), syp = (dot([x, y, z], U) * fit[1] + fit[3]);
        return [(sxp + 1) / 2 * W, (1 - syp) / 2 * H];
    }
    // world point on the plane z = 0 at height ~y for a css px (for the rope in your hand)
    function unproject(px, py, y) {
        const sxp = px / W * 2 - 1, syp = 1 - py / H * 2;
        const a = (sxp - fit[2]) / fit[0], b = (syp - fit[3]) / fit[1];
        // a = x*R0 + z*R2 ; b = x*U0 + y*U1 + z*U2, with z = 0
        const x = a / R[0];
        const yy = (b - x * U[0]) / U[1];
        return [x, yy, 0];
    }

    function layout() {
        const rect = el.getBoundingClientRect();
        W = Math.max(1, rect.width); H = Math.max(1, rect.height);
        dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
        canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
        // fit the lane and the load standing on it
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        for (const x of [0, SAND.L]) for (const z of [-SAND.W / 2, SAND.W / 2]) for (const y of [0, 1.35]) {
            const a = dot([x, y, z], R), b = dot([x, y, z], U);
            x0 = Math.min(x0, a); x1 = Math.max(x1, a); y0 = Math.min(y0, b); y1 = Math.max(y1, b);
        }
        const s = Math.min(W / (x1 - x0), H / (y1 - y0));
        pxPerM = s;
        // to clip space: x in [-1, 1] over W css px, y over H
        fit = [2 * s / W, 2 * s / H, -1 - 2 * s * x0 / W + (W - s * (x1 - x0)) / W, -1 - 2 * s * y0 / H + (H - s * (y1 - y0)) / H];
        draw(0);
    }

    // ---- the loop
    let raf = 0, last = 0, alive = true, visible = true, acc = 0;
    const now = () => performance.now();
    function busy() { return S.phase !== 'idle' || S.pour > 0 || relaxFrames > 0 || drops.length || wetting(); }
    let wetEnd = 0; const wetting = () => now() < wetEnd;
    function kick() { if (!raf && alive && tex) { last = now(); raf = requestAnimationFrame(loop); } }
    function loop(t) {
        raf = 0;
        let dt = Math.min(.05, (t - last) / 1000); last = t;
        const sim = dt * SAND.timescale;
        acc += sim;
        const h0 = 1 / 120;
        while (acc >= h0) {
            acc -= h0;
            if (S.phase === 'enter' || S.phase === 'stop' || S.phase === 'leave') physics(h0);
            water(h0);
        }
        // pouring tips the jar; letting go sets it upright
        S.tilt += ((S.pour > 0 ? .95 : 0) - S.tilt) * Math.min(1, dt * 8);
        if (S.phase === 'unload') unload(t);
        if (S.phase === 'leave' && S.x > SAND.L + .6) { S.phase = 'idle'; S.x = -SLED.L - .4; S.v = 0; el.dispatchEvent(new CustomEvent('haul:done', { bubbles: true })); if (onArrive) { const f = onArrive; onArrive = null; f(); } }
        for (let k = 0; k < 3 && relaxFrames > 0; k++) { if (!relax()) relaxFrames = 0; else relaxFrames--; }
        draw(sim);
        if (visible && busy()) raf = requestAnimationFrame(loop);
    }
    // at the end of the lane the block is levered off the deck onto its bed ahead, and the empty sledge goes back
    function unload(t) {
        const u = clamp((t - S.t0) / 1400);
        // levered: the back lifts a hand's breadth, then it slides forward off the prows
        S.by = Math.sin(clamp(u / .35) * Math.PI) * .05;
        S.bx = u < .3 ? 0 : (SLED.L + .3) * ((u - .3) / .7) ** 1.6;
        if (u >= 1) { S.loaded = false; S.bx = 0; S.by = 0; S.phase = 'leave'; S.v = 0; }
    }

    // ---- input: the rope, the jar, the keyboard
    function ptr(e) { const r = el.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
    function nearRope(p) {
        const pts = ropePoints().map((q) => screen(q[0], q[1], q[2]));
        for (let i = 0; i < pts.length - 1; i++) {
            const a = pts[i], b = pts[i + 1], ab = [b[0] - a[0], b[1] - a[1]], t = clamp(((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / (ab[0] ** 2 + ab[1] ** 2 || 1));
            if (Math.hypot(a[0] + ab[0] * t - p[0], a[1] + ab[1] * t - p[1]) < 18) return true;
        }
        return false;
    }
    function onDown(e) {
        if (e.target === jar || S.phase !== 'enter') return;
        const p = ptr(e);
        if (!nearRope(p)) return;
        rope.grab = true; rope.px = p[0]; rope.py = p[1];
        rope.gx = unproject(p[0], p[1], 0)[0] - S.x;     // where along the rope you took hold, from the sledge
        el.setPointerCapture(e.pointerId); e.preventDefault();
    }
    function onMove(e) {
        if (!rope.grab) { el.style.cursor = S.phase === 'enter' && nearRope(ptr(e)) ? 'grab' : ''; return; }
        const p = ptr(e); rope.px = p[0]; rope.py = p[1];
        // the rope through your hand: how far your hand is ahead of where that bit of rope would be, as a pull
        const x = unproject(p[0], p[1], 0)[0];
        S.pull = clamp((x - (S.x + rope.gx)) * 1.1, 0, 1.2);
        el.style.cursor = 'grabbing';
        kick();
    }
    function onUp() { rope.grab = false; S.pull = 0; el.style.cursor = ''; }
    const pourOn = (e) => { if (e) e.preventDefault(); S.pour = 1; el.dispatchEvent(new CustomEvent('haul:pour', { bubbles: true, detail: { on: true } })); kick(); };
    const pourOff = () => { if (!S.pour) return; S.pour = 0; wetEnd = now() + 22000; el.dispatchEvent(new CustomEvent('haul:pour', { bubbles: true, detail: { on: false } })); kick(); };
    const onJarKey = (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { pourOn(e); } };
    const onJarKeyUp = (e) => { if (e.key === ' ' || e.key === 'Enter') pourOff(); };
    const onKey = (e) => { if (e.target !== el) return; if (e.key === 'ArrowRight') { S.pull = .6; kick(); e.preventDefault(); } };
    const onKeyUp = (e) => { if (e.key === 'ArrowRight') S.pull = 0; };
    el.addEventListener('pointerdown', onDown); el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp); el.addEventListener('pointercancel', onUp);
    jar.addEventListener('pointerdown', pourOn); jar.addEventListener('pointerup', pourOff); jar.addEventListener('pointerleave', pourOff); jar.addEventListener('pointercancel', pourOff);
    jar.addEventListener('keydown', onJarKey); jar.addEventListener('keyup', onJarKeyUp); jar.addEventListener('blur', pourOff);
    jar.addEventListener('click', (e) => e.preventDefault());
    el.addEventListener('keydown', onKey); el.addEventListener('keyup', onKeyUp);
    const ro = new ResizeObserver(() => { if (tex) layout(); });
    const io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) kick(); });

    // ---- assets
    const img = (n) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = new URL(n, base).href; });
    const ready = Promise.all([img('sand.webp'), img('wood.webp'), img('blocks.webp'), faces ? Promise.resolve(faces) : fetch(new URL('blocks.json', base)).then((x) => x.json()), img('jar.webp')])
        .then(([sand, wood, blocks, info, jarImg]) => {
            if (!alive) return;
            faces = info.map((f) => ({ rect: f.rect, aspect: f.rect[2] / f.rect[3], kind: f.kind || 'face' }));
            tex = { sand: texture(gl, sand, true), wood: texture(gl, wood, false), blocks: texture(gl, blocks, false), blockW: blocks.width, blockH: blocks.height };
            jar.style.backgroundImage = `url("${jarImg.src}")`;
            pickBlock();
            ro.observe(el); io.observe(el);
            layout();
        });
    function pickBlock() {
        const fs = faces.filter((f) => f.kind === 'face'), ts = faces.filter((f) => f.kind === 'top');
        const near = (list, asp) => list.slice().sort((a, b) => Math.abs(Math.log(a.aspect / asp)) - Math.abs(Math.log(b.aspect / asp)) + (r() - .5) * .5)[0];
        blockTex = { front: near(fs, BLOCK.L / BLOCK.H), side: near(fs, BLOCK.D / BLOCK.H), top: near(ts, BLOCK.L / BLOCK.D) };
    }

    return {
        ready,
        /** haul one block in; resolves when it has been levered off and the sledge has gone */
        go() {
            return ready.then(() => new Promise((res) => {
                pickBlock();
                S.loaded = true; S.x = -SLED.L - .4; S.v = 0; S.bx = 0; S.by = 0; S.yb = 0;
                if (calm.matches) { S.loaded = false; S.phase = 'idle'; el.dispatchEvent(new CustomEvent('haul:arrive', { bubbles: true })); res(); draw(0); return; }
                S.phase = 'enter'; onArrive = res;
                el.dispatchEvent(new CustomEvent('haul:start', { bubbles: true }));
                kick();
            }));
        },
        pour(on) { on ? pourOn() : pourOff(); },
        get state() { return { phase: S.phase, x: S.x, v: S.v, mu: S.mu, force: S.force, wetUnder: underRunners(w) }; },
        /** for tests: the fields */
        _fields: { h, w, NX, NZ, dx, dz },
        destroy() {
            alive = false; cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
            el.removeEventListener('pointerdown', onDown); el.removeEventListener('pointermove', onMove);
            el.removeEventListener('pointerup', onUp); el.removeEventListener('pointercancel', onUp);
            el.removeEventListener('keydown', onKey); el.removeEventListener('keyup', onKeyUp);
            canvas.remove(); jar.remove();
            const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
        },
    };
}
