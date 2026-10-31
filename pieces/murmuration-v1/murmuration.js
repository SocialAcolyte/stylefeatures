/*
 *  MURMURATION // a dusk sky with a few thousand starlings in it.
 *
 *  Each bird is simulated in 3D (metres, seconds) and steers by its seven
 *  nearest neighbours *by rank* (topological interaction, Ballerini et al.
 *  2008), found every frame with a uniform-grid spatial hash. Birds turn by
 *  banking, as real birds do: the steering a bird wants becomes a roll
 *  angle, and the roll tips its lift sideways. The pointer is a peregrine.
 *  Birds that see it make a zig escape (roll out 0.25s, back 0.30s), and
 *  their neighbours repeat it after a reaction time of ~76ms, so the roll
 *  runs through the flock like a bucket brigade, faster than any bird flies
 *  (Procaccini et al. 2011; Hemelrijk, van Zuidam & Hildenbrandt 2015).
 *
 *  Nothing is painted as a "wave": every bird is drawn as its own projected
 *  silhouette (two tapered wings and a body, seen from a camera standing on
 *  the ground), so a bird that rolls shows the camera more wing and covers
 *  more sky. The dark bands are just that, happening to many birds in a row.
 *
 *  murmuration(el, opts) returns destroy(), which also carries
 *  destroy.scatter(x, y), destroy.roost(), destroy.wake() and destroy.state.
 */
import tilt from './tilt.js';

const calm = matchMedia('(prefers-reduced-motion: reduce)');
const coarse = matchMedia('(pointer: coarse)');

/* ── the bird (European starling, Sturnus vulgaris) ── */
const SPAN = 0.38;          // wingspan, m
const CHORD = 0.10;         // wing chord at the root, m
const BODY = 0.20;          // body length, m
const BODY_W = 0.05;        // body width, m
const FLAP_HZ = 12;         // wingbeats a second, roughly
const V0 = 10.6;            // cruise speed, m/s (the flock speed Procaccini et al. measured)
const G = 9.81;

/* ── the flock (StarDisplay-style; Hildenbrandt et al. 2010, Hemelrijk et al. 2015) ── */
const K = 7;                // topological neighbours
const RSEP = 2.0;           // separation radius, m (StarDisplay default)
const REACT = 0.076;        // reaction time to a neighbour's escape, s (mean)
const REACT_SD = 0.01;
const ZIG_OUT = 0.25;       // escape roll: out...
const ZIG_BACK = 0.30;      // ...and back, s
const REFRACT = 1.0;        // before a bird will repeat another escape, s
const ZIG_ROLL = 1.45;      // how far it rolls, rad (~83 degrees: nearly on its side)
const DETECT = 14;          // a bird sees the falcon coming within this, m
const FLEE = 11;            // and gets out of its path within this, m

/* ── the scene ── */
const DIST = 95;           // flock's mean distance from the camera, m
const EYE = 1.6;            // camera height, m
const HAZE = 420;           // aerial perspective: contrast falls by 1/e every HAZE metres
const ROOST_DIVE = 0.9;     // funnel slope over the roost (m of height per m out)

/* The drawn sky, used only without the photograph (data-src="none", or if it
   fails to load): colours sampled from the clear parts of Frederic Edwin
   Church's "Twilight in the Wilderness" (1860, Cleveland Museum of Art, CC0),
   lightened in linear light to undo the darkened varnish. Top -> horizon. */
const SKY = [
    [0.00, '#2a4753'], [0.22, '#3c6670'], [0.42, '#5a8a82'], [0.58, '#8f8a6c'],
    [0.70, '#b9764f'], [0.82, '#d08a52'], [0.92, '#dcac60'], [1.00, '#e2d873'],
];

/* The default backdrop: a Midjourney dusk over a wetland (assets/credits.json).
   Measured from the image: where the ground meets the sky, the run of trees
   along the right (the roost), and the tops of the trees. */
const PLATE = {
    w: 1680, h: 720, horizon: 0.847, treetop: 0.775, roost: [0.64, 0.99], top: '#576780',
    narrow: { x0: 0.5649, w: 0.4286 },
};

export const CHART = {
    flying:   { HUNT: 'hunted', ROOST: 'roosting' },
    hunted:   { CLEAR: 'flying', ROOST: 'roosting' },
    roosting: { SETTLED: 'roosted', HUNT: 'flying', WAKE: 'flying' },
    roosted:  { HUNT: 'flying', WAKE: 'flying' },
};

function machine(chart, initial, onChange) {
    const m = {
        state: initial,
        send(ev) {
            const to = chart[m.state] && chart[m.state][ev];
            if (!to) return false;
            const from = m.state;
            m.state = to;
            onChange(to, from, ev);
            return true;
        },
    };
    return m;
}

function mulberry(a) {
    return () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const hex = (h) => { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix = (a, b, t) => a.map((v, i) => Math.round(lerp(v, b[i], t)));
const css = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

/* ──────────────────────────────────────────────────────────────────────────
   The flock: plain typed arrays and one step() function. Exported so it can
   be measured outside a page.
   ────────────────────────────────────────────────────────────────────────── */
export function createFlock(N, seed = 1, spacing = 1) {
    const rnd = mulberry(seed);
    const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2832 * v); };
    const S = spacing;
    const f = {
        N, n: N, S, t: 0,                // n: birds in play (fewer than N if a slow device retired some)
        px: new Float32Array(N), py: new Float32Array(N), pz: new Float32Array(N),
        vx: new Float32Array(N), vy: new Float32Array(N), vz: new Float32Array(N),
        roll: new Float32Array(N),       // bank angle, rad (+ = right wing down)
        escT: new Float32Array(N).fill(-1), escSide: new Int8Array(N), refr: new Float32Array(N),
        react: new Float32Array(N), pref: new Float32Array(N),
        flap: new Float32Array(N), bout: new Float32Array(N), flapping: new Uint8Array(N),
        landed: new Uint8Array(N),
        fade: new Float32Array(N).fill(1),   // 1 = seen; going to 0 as a bird drops out of sight (the last into the roost, or retired)
        wan: new Float32Array(N), aL: new Float32Array(N), urgeL: new Float32Array(N), urgeV: new Float32Array(N),   // a turn or climb begun by a few birds
        nb: new Int32Array(N * K), nbn: new Uint8Array(N),
        // the world the birds live in (set by the scene)
        roost: { x: 0, z: DIST, r: 12, alt: 40, ceil: 1e9, mode: 'roam', y0: 0, half: 20 },
        wind: { x: 0, z: 0 },
        falcon: { on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 },
        escaping: 0, landedCount: 0, frame: 0,
    };
    for (let i = 0; i < N; i++) {
        f.react[i] = Math.max(0.045, REACT + gauss() * REACT_SD);
        f.pref[i] = V0 + gauss() * 0.7;
        f.flap[i] = rnd() * 6.2832;
        f.bout[i] = rnd() * 1.2;
        f.flapping[i] = rnd() < 0.6 ? 1 : 0;
    }
    f.rnd = rnd; f.gauss = gauss;

    /* spatial hash: cells about one and a quarter neighbour distances wide */
    const TB = 1 << 15, TM = TB - 1;
    const C = 1.6 * S, inv = 1 / C;
    const start = new Int32Array(TB + 1), count = new Int32Array(TB), cursor = new Int32Array(TB);
    const order = new Int32Array(N), hof = new Int32Array(N);
    const hash = (ix, iy, iz) => (Math.imul(ix, 73856093) ^ Math.imul(iy, 19349663) ^ Math.imul(iz, 83492791)) & TM;
    const bd = new Float32Array(K), bi = new Int32Array(K);

    function grid() {
        count.fill(0);
        for (let i = 0; i < f.n; i++) {
            if (f.landed[i]) { hof[i] = -1; continue; }
            const h = hash(Math.floor(f.px[i] * inv), Math.floor(f.py[i] * inv), Math.floor(f.pz[i] * inv));
            hof[i] = h; count[h]++;
        }
        start[0] = 0;
        for (let h = 0; h < TB; h++) { start[h + 1] = start[h] + count[h]; cursor[h] = start[h]; }
        for (let i = 0; i < f.n; i++) { const h = hof[i]; if (h >= 0) order[cursor[h]++] = i; }
    }

    function knn(i) {
        const x = f.px[i], y = f.py[i], z = f.pz[i];
        const cx = Math.floor(x * inv), cy = Math.floor(y * inv), cz = Math.floor(z * inv);
        let n = 0;
        for (let r = 1; r <= 3; r++) {
            n = 0;
            for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) {
                const h = hash(cx + dx, cy + dy, cz + dz);
                for (let k = start[h], e = start[h + 1]; k < e; k++) {
                    const j = order[k];
                    if (j === i) continue;
                    const ax = f.px[j] - x, ay = f.py[j] - y, az = f.pz[j] - z;
                    const d2 = ax * ax + ay * ay + az * az;
                    if (n === K && d2 >= bd[K - 1]) continue;
                    let dup = false;
                    for (let m = 0; m < n; m++) if (bi[m] === j) { dup = true; break; }
                    if (dup) continue;
                    let m = n < K ? n++ : K - 1;
                    while (m > 0 && bd[m - 1] > d2) { bd[m] = bd[m - 1]; bi[m] = bi[m - 1]; m--; }
                    bd[m] = d2; bi[m] = j;
                }
            }
            if (n === K) break;
        }
        const o = i * K;
        for (let m = 0; m < n; m++) f.nb[o + m] = bi[m];
        f.nbn[i] = n;
    }

    function startEscape(i, side) {
        f.escT[i] = 0; f.escSide[i] = side;
    }

    f.neighbours = (all) => {
        grid();
        const par = f.frame & 1;
        for (let i = 0; i < f.n; i++) if (!f.landed[i] && (all || (i & 1) === par)) knn(i);
    };

    f.step = (dt) => {
        f.t += dt; f.frame++;
        f.neighbours(false);
        // now and then a handful of birds start a turn, or a climb or dive, and the rest
        // follow it through their neighbours (turns start locally: Attanasi et al. 2014)
        if (f.roost.mode !== 'roost' && rnd() < dt * 0.45) {
            const i0 = Math.floor(rnd() * f.n);
            if (!f.landed[i0]) {
                const side = rnd() < 0.5 ? -1 : 1, lat = rnd() < 0.7 ? side * (5 + rnd() * 5) : 0, ver = (rnd() - 0.5) * 10;
                const r2 = (4.5 * S) ** 2, X = f.px[i0], Y = f.py[i0], Z = f.pz[i0];
                for (let i = 0; i < f.n; i++) {
                    const dx = f.px[i] - X, dy = f.py[i] - Y, dz = f.pz[i] - Z;
                    if (dx * dx + dy * dy + dz * dz < r2) { f.urgeL[i] = lat; f.urgeV[i] = ver; }
                }
            }
        }
        const R = f.roost, F = f.falcon, W = f.wind;
        const rs = RSEP * S, rs2 = rs * rs, sig2 = (rs * 0.5) * (rs * 0.5);
        const roosting = R.mode === 'roost';
        const fsp = F.on ? Math.hypot(F.vx, F.vy, F.vz) : 0;
        let esc = 0, landedCount = 0;
        for (let i = 0; i < f.n; i++) {
            if (f.landed[i]) { landedCount++; continue; }
            const x = f.px[i], y = f.py[i], z = f.pz[i];
            let vx = f.vx[i], vy = f.vy[i], vz = f.vz[i];
            const sp = Math.hypot(vx, vy, vz) || 1;
            const fx = vx / sp, fy = vy / sp, fz = vz / sp;

            let ax = 0, ay = 0, az = 0;
            // neighbours: separation (metric, inside RSEP), alignment, cohesion
            const n = f.nbn[i], o = i * K;
            let cx = 0, cy = 0, cz = 0, ux = 0, uy = 0, uz = 0, hx = 0, hy = 0, hz = 0;
            for (let m = 0; m < n; m++) {
                const j = f.nb[o + m];
                const dx = f.px[j] - x, dy = f.py[j] - y, dz = f.pz[j] - z;
                const d2 = dx * dx + dy * dy + dz * dz + 1e-6, d = Math.sqrt(d2);
                cx += dx; cy += dy; cz += dz;
                ux += dx / d; uy += dy / d; uz += dz / d;
                const sj = Math.hypot(f.vx[j], f.vy[j], f.vz[j]) || 1;
                hx += f.vx[j] / sj; hy += f.vy[j] / sj; hz += f.vz[j] / sj;
                if (d2 < rs2) {
                    // stronger fore and aft than to the sides: starlings keep their neighbours
                    // beside them, not in front or behind (Ballerini et al. 2008)
                    const c = (dx * fx + dy * fy + dz * fz) / d;
                    const w = 7.5 * (1 + 1.6 * c * c) * Math.exp(-d2 / sig2) / d;
                    ax -= dx * w; ay -= dy * w * 0.22; az -= dz * w;
                }
                // the escape spreads: repeat a neighbour's zig once it is react[i] old
                if (f.escT[i] < 0 && f.t > f.refr[i] && f.escT[j] >= f.react[i] && f.escT[j] < f.react[i] + 0.034) startEscape(i, f.escSide[j]);
            }
            if (n) {
                const inv = 1 / n;
                // alignment: turn toward the neighbours' mean heading
                const ka = 2.6;
                ax += (hx * inv - fx) * ka * V0; ay += (hy * inv - fy) * ka * V0; az += (hz * inv - fz) * ka * V0;
                // cohesion, weighted by how much this bird is on the edge (centrality)
                const cen = Math.hypot(ux, uy, uz) * inv;
                const kc = 0.35 + 2.4 * cen * cen;
                ax += cx * inv * kc; ay += cy * inv * (kc + 2.5); az += cz * inv * kc;
            }

            // the roost: a horizontal pull once outside its radius, and a preferred height
            // (birds turn for the roost before they overshoot it: aim from where they will be in a second)
            const rx = R.x - x - vx, rz = R.z - z - vz, rd = Math.hypot(rx, rz) || 1;
            let alt = R.alt;
            if (roosting) {
                alt = Math.min(R.alt, Math.max(R.y0 - 1, (rd - 3) * ROOST_DIVE));
                const pull = Math.min(1 + rd * 0.25, 8);
                ax += rx / rd * pull; az += rz / rd * pull;
            } else if (rd > R.r) {
                const pull = Math.min((rd - R.r) * 0.22, 7);
                ax += rx / rd * pull; az += rz / rd * pull;
            }
            ay += clamp((alt - y) * (roosting ? 0.6 : 0.16) - Math.max(0, y + vy - R.ceil) * 0.8, -8, 6) - vy * (roosting ? 0.3 : 0.45);

            // speed: back toward this bird's own cruise speed (slower when coming in to land)
            const want = roosting ? lerp(7, f.pref[i], clamp(rd / 40, 0, 1)) : f.pref[i];
            const ka2 = (want - sp) * 1.1;
            ax += fx * ka2; ay += fy * ka2; az += fz * ka2;

            // a little of each bird's own mind, and any turn or climb it has started
            f.wan[i] += f.gauss() * Math.sqrt(dt) * 1.2;                     // a slowly wandering wish to turn
            f.wan[i] *= 1 - dt * 0.8;
            ax += -fz * f.wan[i] * 1.6; az += fx * f.wan[i] * 1.6; ay += f.gauss() * 0.3;
            if (f.urgeL[i] !== 0 || f.urgeV[i] !== 0) {
                ax += -fz * f.urgeL[i]; az += fx * f.urgeL[i]; ay += f.urgeV[i];
                const dk = Math.exp(-dt / 0.7);
                f.urgeL[i] *= dk; f.urgeV[i] *= dk;
                if (Math.abs(f.urgeL[i]) + Math.abs(f.urgeV[i]) < 0.05) { f.urgeL[i] = 0; f.urgeV[i] = 0; }
            }

            // the falcon
            if (F.on) {
                const dx = x - F.x, dy = y - F.y, dz = z - F.z, d = Math.hypot(dx, dy, dz) || 1;
                if (d < FLEE) {
                    // away from the falcon, and mostly out of its line of flight: the flock opens
                    // in front of it and closes behind (a split, or a vacuole round it)
                    const fv = fsp || 1, ex = F.vx / fv, ey = F.vy / fv, ez = F.vz / fv;
                    const along = dx * ex + dy * ey + dz * ez;
                    let px = dx - ex * along * 0.8, py = dy - ey * along * 0.8, pz = dz - ez * along * 0.8;
                    const pl = Math.hypot(px, py, pz) || 1;
                    const k = 38 * (1 - d / FLEE) + 6;
                    ax += px / pl * k; ay += py / pl * k * 0.8; az += pz / pl * k;
                }
                if (d < DETECT && f.escT[i] < 0 && f.t > f.refr[i] && fsp > 2.5) {
                    // bank away: roll toward the side the falcon is not on
                    const lx = -fz, lz = fx;   // the bird's right, horizontal
                    startEscape(i, (F.x - x) * lx + (F.z - z) * lz > 0 ? -1 : 1);
                }
            }

            // escape: a zig, out and back
            let zig = 0;
            if (f.escT[i] >= 0) {
                const e = f.escT[i];
                zig = e < ZIG_OUT ? Math.sin(1.5708 * e / ZIG_OUT) : Math.cos(1.5708 * (e - ZIG_OUT) / ZIG_BACK);
                zig *= f.escSide[i] * ZIG_ROLL;
                f.escT[i] += dt; esc++;
                if (f.escT[i] > ZIG_OUT + ZIG_BACK) { f.escT[i] = -1; f.refr[i] = f.t + REFRACT; }
            }

            // flight: what the bird wants becomes forward, sideways and vertical parts.
            // sideways it can only get by banking: roll to atan(a/g), and the lift does the rest.
            let rxh = -fz, rzh = fx; const rl = Math.hypot(rxh, rzh) || 1; rxh /= rl; rzh /= rl;   // right, level
            const upx = -rzh * fy, upy = rzh * fx - rxh * fz, upz = rxh * fy;                      // up, perpendicular to heading
            const aF = ax * fx + ay * fy + az * fz;
            const aL = ax * rxh + az * rzh;
            const aU = ax * upx + ay * upy + az * upz;
            // small, quick corrections are made by yawing a little; only a sustained wish to turn becomes a bank
            f.aL[i] += (aL - f.aL[i]) * (1 - Math.exp(-dt / 0.3));
            const target = clamp(Math.atan2(f.aL[i], G), -0.95, 0.95) + zig;
            let rho = f.roll[i];
            const into = Math.abs(target) > Math.abs(rho) && target * rho >= 0;
            rho += (target - rho) * (1 - Math.exp(-dt / (into ? 0.07 : 0.16)));
            f.roll[i] = rho;
            const lat = clamp(G * Math.tan(rho), -1.6 * G, 1.6 * G) + clamp(aL - f.aL[i], -3, 3);
            const fwd = clamp(aF, -6, 6), up = clamp(aU, -9, 9);
            vx += (fx * fwd + rxh * lat + upx * up) * dt;
            vy += (fy * fwd + upy * up) * dt;
            vz += (fz * fwd + rzh * lat + upz * up) * dt;
            // keep it flying: 6-17 m/s, never steeper than ~55 degrees
            let s2 = Math.hypot(vx, vy, vz);
            const smin = roosting ? 4.5 : 6, smax = 17;
            if (s2 < smin || s2 > smax) { const k = clamp(s2, smin, smax) / s2; vx *= k; vy *= k; vz *= k; s2 = clamp(s2, smin, smax); }
            if (Math.abs(vy) > s2 * 0.82) vy = Math.sign(vy) * s2 * 0.82;
            f.vx[i] = vx; f.vy[i] = vy; f.vz[i] = vz;
            f.px[i] = x + (vx + W.x) * dt;
            f.py[i] = Math.max(0.3, y + vy * dt);
            f.pz[i] = z + (vz + W.z) * dt;

            // wings: flapping bouts and glides
            f.bout[i] -= dt;
            if (f.bout[i] <= 0) {
                f.flapping[i] ^= 1;
                f.bout[i] = f.flapping[i] ? 0.3 + f.rnd() * 0.6 : 0.4 + f.rnd() * 1.0;
            }
            if (f.flapping[i]) f.flap[i] += 6.2832 * FLAP_HZ * dt * (0.92 + 0.16 * ((i * 0.618) % 1));

            // down in the reeds
            if (roosting && f.py[i] < R.y0 + 0.9 && Math.abs(f.px[i] - R.x) < R.half && Math.abs(f.pz[i] - R.z) < R.half * 0.6) {
                f.landed[i] = 1; landedCount++;
            }
        }
        f.escaping = esc;
        f.landedCount = landedCount;
    };

    /* a flock already in the air, all heading one way: a thin, gently curled sheet with a
       lobed outline and thicker and thinner patches (an even ellipsoid reads as a swarm
       for the first few seconds, before the flock has made its own shape) */
    f.place = (cx, cy, cz, heading = 0) => {
        const a = 0.95 * S * Math.cbrt(N);           // ~ size for NND ~1.3 m
        const ch = Math.cos(heading), sh = Math.sin(heading);
        const q1 = rnd() * 6.2832, q2 = rnd() * 6.2832, q3 = rnd() * 6.2832;
        for (let i = 0; i < N; i++) {
            let u, v, w;
            for (;;) {
                u = rnd() * 2 - 1; v = rnd() * 2 - 1; w = rnd() * 2 - 1;
                const ang = Math.atan2(w, u);
                const edge = 1 + 0.2 * Math.sin(2 * ang + q1) + 0.1 * Math.sin(3 * ang + q2);
                const dens = 0.6 + 0.4 * Math.sin(2.4 * u + q3) * Math.cos(1.8 * w + q1);
                if (u * u + w * w < edge * edge * 0.85 && rnd() < dens) break;
            }
            const lx = u * a * 1.75, lz = w * a * 0.95;
            const ly = v * a * 0.2 + a * 0.3 * Math.sin(1.6 * u + q2) * (0.6 + 0.4 * w);
            f.px[i] = cx + lx * ch - lz * sh; f.py[i] = cy + ly; f.pz[i] = cz + lx * sh + lz * ch;
            const s = f.pref[i];
            f.vx[i] = ch * s + gauss() * 0.4; f.vy[i] = gauss() * 0.2; f.vz[i] = sh * s + gauss() * 0.4;
            f.roll[i] = 0; f.escT[i] = -1; f.refr[i] = 0; f.landed[i] = 0; f.fade[i] = 1;
        }
        f.neighbours(true);
    };

    /* up out of the reeds */
    f.takeoff = () => {
        const R = f.roost;
        for (let i = 0; i < f.n; i++) {
            f.fade[i] = 1;
            if (!f.landed[i]) continue;
            f.landed[i] = 0;
            f.px[i] = R.x + (rnd() * 2 - 1) * R.half * 0.6;
            f.pz[i] = R.z + (rnd() * 2 - 1) * R.half * 0.3;
            f.py[i] = R.y0 + 0.5 + rnd() * 2;
            const a = rnd() * 6.2832, s = 7 + rnd() * 3;
            f.vx[i] = Math.cos(a) * s * 0.7; f.vz[i] = Math.sin(a) * s * 0.7; f.vy[i] = s * (0.55 + rnd() * 0.25);
            f.escT[i] = -1; f.refr[i] = f.t + 0.5;
            f.flapping[i] = 1; f.bout[i] = 1.5 + rnd();
        }
        f.landedCount = 0;
        f.neighbours(true);
    };

    return f;
}

/* ──────────────────────────────────────────────────────────────────────────
   WebGL: each bird is one point sprite; the fragment shader draws its
   projected silhouette (two tapered wing strokes and a body) with coverage
   computed analytically, so a bird smaller than a pixel is a faint speck,
   and many of them in a line of sight add up to a dark core.
   ────────────────────────────────────────────────────────────────────────── */
const STRIDE = 12;   // cx cy  wlx wly  wrx wry  bx by  tl tr tb  alpha
const VS = `
attribute vec2 a_c; attribute vec4 a_w; attribute vec2 a_b; attribute vec4 a_t;
uniform vec2 u_res;
varying vec4 v_w; varying vec2 v_b; varying vec4 v_t; varying float v_s;
void main(){
  float r = max(max(length(a_w.xy), length(a_w.zw)), length(a_b)) + max(a_t.x, max(a_t.y, a_t.z)) + 1.5;
  float s = ceil(2.0 * r);
  gl_PointSize = s;
  gl_Position = vec4(a_c.x / u_res.x * 2.0 - 1.0, 1.0 - a_c.y / u_res.y * 2.0, 0.0, 1.0);
  v_w = a_w; v_b = a_b; v_t = a_t; v_s = s;
}`;
const FS = `
precision mediump float;
uniform vec3 u_ink;
varying vec4 v_w; varying vec2 v_b; varying vec4 v_t; varying float v_s;
float seg(vec2 p, vec2 a, vec2 b, float w0, float w1){
  vec2 ab = b - a; float h = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0);
  float d = length(p - a - ab * h);
  float w = mix(w0, w1, h);
  float ww = max(w, 1.0);
  return clamp(ww * 0.5 + 0.5 - d, 0.0, 1.0) * (w / ww);
}
void main(){
  vec2 p = (gl_PointCoord - 0.5) * v_s;
  float c = seg(p, vec2(0.0), v_w.xy, v_t.x, v_t.x * 0.22);
  c = max(c, seg(p, vec2(0.0), v_w.zw, v_t.y, v_t.y * 0.22));
  c = max(c, seg(p, -v_b, v_b, v_t.z, v_t.z * 0.7));
  float a = c * v_t.w;
  if (a < 0.003) discard;
  gl_FragColor = vec4(u_ink * a, a);
}`;

function glRenderer(canvas) {
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'low-power' });
    if (!gl) return null;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    let prog;
    try {
        prog = gl.createProgram();
        gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    } catch (e) { return null; }
    const maxPt = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1];
    if (maxPt < 24) return null;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    const at = (name, size, off) => { const l = gl.getAttribLocation(prog, name); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, STRIDE * 4, off * 4); };
    at('a_c', 2, 0); at('a_w', 4, 2); at('a_b', 2, 6); at('a_t', 4, 8);
    const uRes = gl.getUniformLocation(prog, 'u_res'), uInk = gl.getUniformLocation(prog, 'u_ink');
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);
    let cap = 0;
    return {
        kind: 'webgl',
        draw(data, n, w, h, ink) {
            gl.viewport(0, 0, w, h);
            gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
            if (!n) return;
            gl.uniform2f(uRes, w, h); gl.uniform3f(uInk, ink[0] / 255, ink[1] / 255, ink[2] / 255);
            if (data.length > cap) { cap = data.length; gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW); }
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, data.subarray(0, n * STRIDE));
            gl.drawArrays(gl.POINTS, 0, n);
        },
        lost: () => gl.isContextLost(),
        destroy() { gl.deleteBuffer(buf); gl.deleteProgram(prog); const x = gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); },
    };
}

/* Canvas 2D: the same silhouettes as hairlines, bucketed by darkness so a
   whole flock is a handful of strokes. */
function ctxRenderer(canvas) {
    const ctx = canvas.getContext('2d');
    const B = 10;
    return {
        kind: '2d',
        draw(data, n, w, h, ink) {
            ctx.clearRect(0, 0, w, h);
            const paths = [];
            for (let b = 0; b < B; b++) paths.push(new Path2D());
            for (let k = 0; k < n; k++) {
                const o = k * STRIDE;
                const cx = data[o], cy = data[o + 1];
                const t = Math.max(data[o + 8], data[o + 9]) * 0.62 + data[o + 10] * 0.3;
                const a = Math.min(1, t) * data[o + 11];
                const b = Math.min(B - 1, Math.floor(a * B * 1.1));
                if (a < 0.03) continue;
                const p = paths[b];
                p.moveTo(cx + data[o + 2], cy + data[o + 3]);
                p.lineTo(cx, cy);
                p.lineTo(cx + data[o + 4], cy + data[o + 5]);
                p.moveTo(cx - data[o + 6], cy - data[o + 7]);
                p.lineTo(cx + data[o + 6], cy + data[o + 7]);
            }
            ctx.lineWidth = Math.max(1, w / 1400);
            ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            for (let b = 0; b < B; b++) {
                ctx.strokeStyle = css(ink, Math.min(1, (b + 0.6) / B));
                ctx.stroke(paths[b]);
            }
        },
        lost: () => false,
        destroy() {},
    };
}

/* ──────────────────────────────────────────────────────────────────────────
   The land: a far treeline and a lake on the sky layer (behind the birds),
   the reedbed and near bank on the land layer (in front of them).
   ────────────────────────────────────────────────────────────────────────── */
function noise1(seed) {
    const r = mulberry(seed), T = 256, v = new Float32Array(T);
    for (let i = 0; i < T; i++) v[i] = r() * 2 - 1;
    return (x) => {
        const i = Math.floor(x), t = x - i, s = t * t * (3 - 2 * t);
        return lerp(v[i & 255], v[(i + 1) & 255], s);
    };
}
const fbm = (n, x, o = 4) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { s += n(x * f + i * 17.3) * a; a *= 0.5; f *= 2.03; } return s; };

function paintSky(ctx, w, h, sc, pal, seed) {
    const hY = sc.hY;
    const g = ctx.createLinearGradient(0, 0, 0, hY);
    pal.sky.forEach(([t, c]) => g.addColorStop(t, css(c)));
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, hY + 2);
    // the afterglow: brighter low in the sky above where the sun went down
    const sx = w * 0.62;
    const rg = ctx.createRadialGradient(sx, hY, 0, sx, hY, Math.max(w, h) * 0.75);
    rg.addColorStop(0, css(pal.glow, 0.38)); rg.addColorStop(0.35, css(pal.glow, 0.12)); rg.addColorStop(1, css(pal.glow, 0));
    ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = rg; ctx.fillRect(0, 0, w, hY + 2);
    ctx.globalCompositeOperation = 'source-over';

    // the lake under the far shore: the horizon sky, reflected and dimmed
    const lake = sc.lakeY - hY;
    const lg = ctx.createLinearGradient(0, hY, 0, sc.lakeY);
    lg.addColorStop(0, css(mix(pal.horizon, pal.land, 0.25))); lg.addColorStop(1, css(mix(pal.sky[5][1], pal.land, 0.5)));
    ctx.fillStyle = lg; ctx.fillRect(0, hY, w, lake + 2);
    const r = mulberry(seed + 5);
    ctx.fillStyle = css(pal.land, 0.35);
    for (let i = 0; i < 26; i++) {
        const y = hY + r() * lake, len = w * (0.04 + r() * 0.2), x = r() * w;
        ctx.fillRect(x, y, len, Math.max(1, sc.dpr * 0.6));
    }

    // far hills, then the treeline, a little lifted by the air between
    const n1 = noise1(seed + 11), n2 = noise1(seed + 23), n3 = noise1(seed + 37);
    const unit = h * 0.01;
    ctx.fillStyle = css(mix(pal.land, pal.horizon, 0.38));
    ctx.beginPath(); ctx.moveTo(0, hY + 1);
    for (let x = 0; x <= w; x += 2 * sc.dpr) ctx.lineTo(x, hY - unit * (1.2 + 2.4 * (0.5 + fbm(n1, x / w * 3.2, 3))));
    ctx.lineTo(w, hY + 1); ctx.fill();

    const tops = new Float32Array(Math.ceil(w) + 1);
    const tr = mulberry(seed + 99);
    for (let x = 0; x <= w; x++) tops[x] = unit * (0.6 + 2.6 * Math.max(0, 0.45 + fbm(n2, x / w * 5, 3)));
    const crowns = Math.round(w / (unit * 1.6));
    for (let k = 0; k < crowns; k++) {
        const cx = tr() * w;
        const base = unit * (1.5 + 3.5 * Math.max(0, 0.5 + fbm(n3, cx / w * 4, 2)));
        const rad = unit * (0.6 + tr() * 1.5);
        for (let x = Math.max(0, Math.floor(cx - rad)); x <= Math.min(w, Math.ceil(cx + rad)); x++) {
            const dx = (x - cx) / rad;
            tops[x] = Math.max(tops[x], base + rad * 0.8 * Math.sqrt(Math.max(0, 1 - dx * dx)));
        }
    }
    // a few Lombardy poplars
    for (let k = 0; k < 4; k++) {
        const cx = (0.08 + tr() * 0.84) * w, ph = unit * (6 + tr() * 4), pw = unit * (0.5 + tr() * 0.35);
        for (let x = Math.max(0, Math.floor(cx - pw)); x <= Math.min(w, Math.ceil(cx + pw)); x++) {
            const dx = (x - cx) / pw;
            tops[x] = Math.max(tops[x], ph * Math.pow(Math.max(0, 1 - dx * dx), 0.6));
        }
    }
    ctx.fillStyle = css(mix(pal.land, pal.horizon, 0.14));
    ctx.beginPath(); ctx.moveTo(0, hY + 1);
    const leaf = mulberry(seed + 7);
    for (let x = 0; x <= w; x++) ctx.lineTo(x, hY - tops[x] - (leaf() - 0.5) * unit * 0.35);
    ctx.lineTo(w, hY + 1); ctx.fill();

    // fine grain, so the gradient never bands
    const tile = document.createElement('canvas'); tile.width = tile.height = 96;
    const tc = tile.getContext('2d'), id = tc.createImageData(96, 96), gr = mulberry(seed + 3);
    for (let i = 0; i < id.data.length; i += 4) { const v = gr() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
    tc.putImageData(id, 0, 0);
    ctx.globalAlpha = 0.035; ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = ctx.createPattern(tile, 'repeat'); ctx.fillRect(0, 0, w, hY);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}

function paintLand(ctx, w, h, sc, pal, seed) {
    ctx.clearRect(0, 0, w, h);
    const r = mulberry(seed + 41), n = noise1(seed + 53);
    const dark = pal.land, near = mix(pal.land, [0, 0, 0], 0.35);
    const proj = (y, z) => sc.hY - sc.F * (y - EYE) / z;   // screen y of height y at distance z

    // the near bank: rough grass from the lake's edge to the bottom
    ctx.fillStyle = css(dark);
    ctx.beginPath(); ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 3 * sc.dpr) ctx.lineTo(x, sc.lakeY + (h - sc.lakeY) * 0.05 * fbm(n, x / w * 9, 3) - sc.dpr);
    ctx.lineTo(w, h); ctx.fill();

    // the reedbed (Phragmites): stems 2.4-3.4 m at 40-95 m, plumes leaning downwind
    const x0 = sc.reed[0] * w, x1 = sc.reed[1] * w;
    const count = Math.round((x1 - x0) / sc.dpr * 1.7);
    const lean = 0.35;
    const stems = [];
    for (let k = 0; k < count; k++) {
        const z = 40 + Math.pow(r(), 0.7) * 55;
        let x = x0 + r() * (x1 - x0);
        const edge = Math.min(x - x0, x1 - x) / ((x1 - x0) * 0.18);      // thinner at the ends of the bed
        if (edge < 1 && r() > edge) continue;
        const hgt = 2.4 + r() * 1.0 + 0.4 * fbm(n, x / w * 20, 2);
        stems.push({ x, z, hgt, b: (r() - 0.5) * 0.4 });
    }
    stems.sort((a, b) => b.z - a.z);
    for (const s of stems) {
        const top = proj(s.hgt, s.z), bot = proj(0, s.z) + (h - sc.lakeY) * 0.3;
        const px = sc.F / s.z;                                            // px per metre at this distance
        const bend = (lean + s.b) * px * 0.35;
        const c = mix(near, dark, clamp((s.z - 40) / 60, 0, 1) * 0.6);
        ctx.strokeStyle = css(c); ctx.lineWidth = Math.max(0.6 * sc.dpr, px * 0.008);
        ctx.beginPath(); ctx.moveTo(s.x, bot);
        ctx.quadraticCurveTo(s.x, (top + bot) / 2, s.x + bend, top);
        ctx.stroke();
        // the plume: a drooping, feathery panicle, lit a little from behind
        const pl = px * (0.22 + 0.1 * Math.abs(s.b)), pw = px * 0.055;
        ctx.save();
        ctx.translate(s.x + bend, top);
        ctx.rotate(1.25 + s.b * 0.6);
        ctx.fillStyle = css(c, 0.88);
        ctx.beginPath(); ctx.ellipse(pl * 0.5, 0, pl * 0.55, Math.max(pw, 0.7 * sc.dpr), 0, 0, 6.2832); ctx.fill();
        ctx.restore();
        // a leaf or two
        if (r() < 0.5) {
            const ly = lerp(bot, top, 0.35 + r() * 0.4), dir = r() < 0.5 ? -1 : 1;
            ctx.lineWidth = Math.max(0.5 * sc.dpr, px * 0.012);
            ctx.beginPath(); ctx.moveTo(s.x + bend * 0.3, ly);
            ctx.quadraticCurveTo(s.x + dir * px * 0.2, ly - px * 0.08, s.x + dir * px * 0.35 + bend * 0.2, ly + px * 0.12);
            ctx.stroke();
        }
    }
}

/* ──────────────────────────────────────────────────────────────────────────
   Wing rush: pink noise through a band-pass, louder where the birds are
   dense near the listener and when they are agitated. Synthesised here, no
   file. Follows the house sound toggle (localStorage "sf-sound").
   ────────────────────────────────────────────────────────────────────────── */
function rush() {
    let ac = null, gain = null, bp = null, src = null;
    const on = () => { try { return localStorage.getItem('sf-sound') === 'on'; } catch { return false; } };
    function make() {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ac = new AC();
        const len = ac.sampleRate * 4, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;      // Paul Kellet's pink filter
        for (let i = 0; i < len; i++) {
            const w = Math.random() * 2 - 1;
            b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.96900 * b2 + w * 0.1538520;
            b3 = 0.86650 * b3 + w * 0.3104856; b4 = 0.55000 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.0168980;
            d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
        }
        // crossfade the loop seam
        const fade = 2048;
        for (let i = 0; i < fade; i++) { const t = i / fade; d[i] = d[i] * t + d[len - fade + i] * (1 - t); }
        src = ac.createBufferSource(); src.buffer = buf; src.loop = true; src.loopEnd = (len - fade) / ac.sampleRate;
        bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.6;
        const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4200;
        gain = ac.createGain(); gain.gain.value = 0;
        src.connect(bp).connect(lp).connect(gain).connect(ac.destination);
        src.start();
    }
    return {
        wake() { if (!on()) return; if (!ac) make(); if (ac && ac.state === 'suspended') ac.resume(); },
        set(level, agit) {
            if (!ac) return;
            const t = ac.currentTime, v = on() ? level : 0;
            gain.gain.setTargetAtTime(v, t, 0.18);
            bp.frequency.setTargetAtTime(700 + 1700 * agit, t, 0.25);
        },
        sleep() { if (ac && ac.state === 'running') { gain.gain.value = 0; ac.suspend(); } },
        destroy() { if (ac) ac.close(); ac = null; },
    };
}

/* ──────────────────────────────────────────────────────────────────────────
   The component
   ────────────────────────────────────────────────────────────────────────── */
const FALCON = 'M97 50Q95 47 90 46.5L76 45.5Q66 28 46 5Q52 30 55 46L40 47L18 44Q15 47 16 50Q15 53 18 56L40 53L55 54Q52 70 46 95Q66 72 76 54.5L90 53.5Q95 53 97 50Z';   // a peregrine from below, 90 units across

export function murmuration(el, opts = {}) {
    if (el.__murmuration) return el.__murmuration;
    const d = el.dataset;
    const num = (v, def) => (v == null || v === '' || isNaN(+v) ? def : +v);
    const o = {
        birds: num(opts.birds ?? d.birds, 3000),
        birdsPhone: num(opts.birdsPhone ?? d.birdsPhone, 1600),
        roost: num(opts.roost ?? d.roost, 90),
        falcon: (opts.falcon ?? d.falcon ?? 'pointer') !== 'none',
        wind: (opts.wind ?? d.wind ?? 'tilt') !== 'none',
        sound: (opts.sound ?? d.sound ?? 'on') !== 'off',
        seed: num(opts.seed ?? d.seed, Math.floor(Math.random() * 1e9)),
        ink: num(opts.ink ?? d.ink, 1.1),
        renderer: opts.renderer ?? d.renderer ?? 'auto',
        adapt: String(opts.adapt ?? d.adapt ?? 'on') !== 'off' && (opts.adapt ?? d.adapt) !== false,
        reedbed: opts.reedbed ?? d.reedbed ?? '0.03 0.56',
        src: opts.src ?? d.src ?? new URL('assets/dusk.webp', import.meta.url).href,
        srcNarrow: opts.srcNarrow ?? d.srcNarrow ?? new URL('assets/dusk-narrow.webp', import.meta.url).href,
        land: opts.land ?? d.land ?? new URL('assets/dusk-land.webp', import.meta.url).href,
        landNarrow: opts.landNarrow ?? d.landNarrow ?? new URL('assets/dusk-narrow-land.webp', import.meta.url).href,
        horizon: num(opts.horizon ?? d.horizon, PLATE.horizon),
        treetop: num(opts.treetop ?? d.treetop, PLATE.treetop),
        roostSpan: opts.roostSpan ?? d.roostSpan ?? PLATE.roost.join(' '),
        label: opts.label ?? d.label ?? 'A murmuration of starlings over a wetland at dusk.',
    };
    const phone = coarse.matches && Math.min(screen.width, screen.height) < 820;
    const N = Math.max(50, Math.round(phone ? Math.min(o.birds, o.birdsPhone) : o.birds));
    const spacing = clamp(0.85 * Math.cbrt(3000 / N), 0.85, 1.7);   // NND ~1.1 m at 3000 birds

    /* palette from CSS (so it can be themed), else Church's sky */
    const cs = getComputedStyle(el);
    const read = (name, def) => { const v = cs.getPropertyValue(name).trim(); return v ? v : def; };
    const toRGB = (c) => {
        if (/^#/.test(c)) return hex(c.length === 4 ? '#' + [...c.slice(1)].map((x) => x + x).join('') : c);
        const m = c.match(/[\d.]+/g); return m ? m.slice(0, 3).map(Number) : [0, 0, 0];
    };
    const pal = {
        sky: SKY.map(([t, c], i) => [t, toRGB(read(`--mm-sky-${i}`, c))]),
        glow: toRGB(read('--mm-glow', '#f2c46d')),
        ink: toRGB(read('--mm-bird', '#120d0f')),
        land: toRGB(read('--mm-land', '#17110f')),
    };
    pal.horizon = pal.sky[pal.sky.length - 1][1];

    /* layers */
    el.classList.add('mm');
    const stage = document.createElement('div');
    stage.className = 'mm-stage';
    stage.setAttribute('role', 'img');
    stage.setAttribute('aria-label', o.label);
    const skyC = document.createElement('canvas'); skyC.className = 'mm-sky';
    let birdC = document.createElement('canvas'); birdC.className = 'mm-birds';
    const landC = document.createElement('canvas'); landC.className = 'mm-land';
    const hawk = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    hawk.setAttribute('class', 'mm-falcon'); hawk.setAttribute('viewBox', '0 0 100 100'); hawk.setAttribute('aria-hidden', 'true');
    hawk.innerHTML = `<path d="${FALCON}"/>`;
    [skyC, birdC, landC].forEach((c) => c.setAttribute('aria-hidden', 'true'));
    stage.append(skyC, birdC, hawk, landC);
    el.prepend(stage);

    let R = o.renderer === '2d' ? null : glRenderer(birdC);
    if (!R) {
        // a canvas that has handed out a WebGL context (whose shaders then failed) will not give a 2D one
        const fresh = document.createElement('canvas'); fresh.className = 'mm-birds'; fresh.setAttribute('aria-hidden', 'true');
        birdC.replaceWith(fresh); birdC = fresh;
        R = ctxRenderer(birdC);
    }
    el.dataset.renderer = R.kind;

    const flock = createFlock(N, o.seed, spacing);
    const rnd = mulberry(o.seed ^ 0x5bd1e995);
    const phase = rnd() * 100;
    const data = new Float32Array(N * STRIDE);
    const sc = { w: 0, h: 0, dpr: 1, F: 1, hY: 0, lakeY: 0, cx: 0, hw: 50, reed: o.reedbed.split(/[\s,]+/).map(Number), plate: null };
    const sound = o.sound ? rush() : null;

    const m = machine(CHART, 'flying', (to, from, ev) => {
        el.dataset.state = to;
        el.dispatchEvent(new CustomEvent('murmuration:state', { bubbles: true, detail: { state: to, from, event: ev } }));
    });
    el.dataset.state = 'flying';

    /* ── geometry: camera, frame and the roost, all from the element's size ── */
    function layout() {
        const r = el.getBoundingClientRect();
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
        if (w === sc.w && h === sc.h) return false;
        Object.assign(sc, { w, h, dpr });
        const aspect = r.width / Math.max(1, r.height);
        sc.hY = h * (aspect > 1 ? 0.865 : 0.84);
        sc.lakeY = sc.hY + h * 0.018;
        // the frame is ~132 m wide at the flock's distance on a wide sky, ~70 m on a tall phone
        const Wm = lerp(70, 132, clamp((aspect - 0.45) / 0.9, 0, 1));
        sc.F = w / Wm * DIST;
        sc.cx = w / 2;
        sc.hw = Wm / 2;
        for (const c of [skyC, birdC, landC]) { c.width = w; c.height = h; }
        if (usePlate()) placePlate(aspect); else {
            sc.plate = null;
            paintSky(skyC.getContext('2d'), w, h, sc, pal, o.seed & 0xffff);
            paintLand(landC.getContext('2d'), w, h, sc, pal, o.seed & 0xffff);
            // the roost: in the middle of the reedbed, at the flock's distance
            const rx = ((sc.reed[0] + sc.reed[1]) / 2 * w - sc.cx) * DIST / sc.F;
            setHome({ x: rx, z: DIST, half: ((sc.reed[1] - sc.reed[0]) * w / 2) * DIST / sc.F * 0.8, y0: 0 });
        }
        return true;
    }
    /* ── the photograph: a dusk sky and its own treeline, which is the roost ── */
    const plates = {};
    const usePlate = () => o.src !== 'none' && !plateFailed;
    let plateFailed = false;
    function loadImg(url) {
        if (!plates[url]) {
            const im = new Image();
            im.decoding = 'async';
            plates[url] = im;
            im.onload = () => { if (!dead) { sc.w = 0; layout(); render(); } };
            im.onerror = () => { plateFailed = true; if (!dead) { sc.w = 0; layout(); render(); } };
            im.src = url;
        }
        return plates[url];
    }
    function topColour(im) {
        // the photograph's top row, averaged, so the sky above it continues without a seam
        if (!im.__top) {
            im.__top = hex(PLATE.top);
            try {
                const c = document.createElement('canvas'); c.width = 32; c.height = 1;
                const x = c.getContext('2d'); x.drawImage(im, 0, 2, im.naturalWidth, 4, 0, 0, 32, 1);
                const d = x.getImageData(0, 0, 32, 1).data; let r = 0, g = 0, b = 0;
                for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
                im.__top = [r / 32, g / 32, b / 32].map(Math.round);
            } catch (e) { /* a cross-origin image: keep the measured default */ }
        }
        return im.__top;
    }
    function setHome(h) {
        // where they will roost; the roost point only takes it over when they go down
        sc.home = h;
        flock.roost.half = h.half; flock.roost.y0 = h.y0;
        if (flock.roost.mode === 'roost') { flock.roost.x = h.x; flock.roost.z = h.z; }
    }
    function placePlate(aspect) {
        const { w, h } = sc;
        const narrow = aspect < 1.15;
        // the plate's geometry, in its own fractions (the narrow plate is a square crop over the trees)
        const span = o.roostSpan.split(/[\s,]+/).map(Number);
        const nx = PLATE.narrow;
        const g = narrow
            ? { iw: 1, ih: 1, roost: span.map((v) => clamp((v - nx.x0) / nx.w, 0, 1)) }
            : { iw: PLATE.w / PLATE.h, ih: 1, roost: span };
        // scale: fill the width, and at least 70% of the height; anything above is more sky
        const s = Math.max(w / g.iw, h * 0.7 / g.ih);
        const pw = g.iw * s, ph = g.ih * s;
        const rc = (g.roost[0] + g.roost[1]) / 2;
        const ox = clamp(w * 0.66 - rc * pw, w - pw, 0), oy = h - ph;
        sc.hY = oy + o.horizon * ph;
        sc.lakeY = sc.hY;
        sc.plate = { ox, oy, pw, ph };
        const sky = loadImg(narrow ? o.srcNarrow : o.src), land = loadImg(narrow ? o.landNarrow : o.land);
        const ctx = skyC.getContext('2d');
        // above the photograph the sky goes on darkening toward the zenith; the seam is feathered
        if (sky.complete && sky.naturalWidth) {
            ctx.drawImage(sky, ox, oy, pw, ph);
            const top = topColour(sky);
            if (oy > 0) {
                const zen = mix(top, [22, 28, 46], clamp(oy / h * 1.6, 0, 0.55));
                const gr = ctx.createLinearGradient(0, 0, 0, oy + ph * 0.18);
                gr.addColorStop(0, css(zen));
                gr.addColorStop(oy / (oy + ph * 0.18), css(top));
                gr.addColorStop(1, css(top, 0));
                ctx.fillStyle = gr; ctx.fillRect(0, 0, w, oy + ph * 0.18);
            }
        } else {
            ctx.fillStyle = css(hex(PLATE.top)); ctx.fillRect(0, 0, w, h);
        }
        const lc = landC.getContext('2d');
        lc.clearRect(0, 0, w, h);
        if (land.complete && land.naturalWidth) lc.drawImage(land, ox, oy, pw, ph);
        // the roost: the trees, at the flock's distance; birds go down to about half their height
        const x0 = ox + g.roost[0] * pw, x1 = ox + g.roost[1] * pw;
        const treeH = Math.max(2, (sc.hY - (oy + o.treetop * ph)) * DIST / sc.F);
        setHome({ x: ((x0 + x1) / 2 - sc.cx) * DIST / sc.F, z: DIST, half: (x1 - x0) / 2 * DIST / sc.F * 0.85, y0: EYE + treeH * 0.45 });
    }
    const worldY = (fy) => EYE + (sc.hY - fy * sc.h) * DIST / sc.F;   // height at the flock's distance for a screen fraction

    /* where the flock wants to be: wandering slowly about the frame */
    function roam(t) {
        const R = flock.roost;
        if (R.mode === 'roost') return;
        R.r = sc.hw * 0.1;
        R.x = sc.hw * 0.12 * Math.sin(t * 0.05 + phase) + sc.hw * 0.05 * Math.sin(t * 0.13 + phase * 2);
        R.z = DIST + 6 * Math.sin(t * 0.06 + phase * 3);
        const hi = worldY(0.34), lo = worldY(0.56);
        R.ceil = worldY(0.14);
        R.alt = lerp(lo, hi, 0.5 + 0.45 * Math.sin(t * 0.11 + phase * 1.7) + 0.15 * Math.sin(t * 0.29));
    }

    /* ── the falcon: a bird of its own that flies to the pointer ── */
    const fal = { mode: 'off', x: 0, y: 0, z: DIST, vx: 0, vy: 0, vz: 0, tx: 0, ty: 0, tz: DIST, wing: 0, pass: null };
    const pointer = { in: false, x: 0, y: 0 };
    function unproject(px, py, z) { return [(px - sc.cx) * z / sc.F, EYE + (sc.hY - py) * z / sc.F]; }
    function centroid() {
        let x = 0, y = 0, z = 0, n = 0;
        for (let i = 0; i < flock.n; i += 7) if (!flock.landed[i]) { x += flock.px[i]; y += flock.py[i]; z += flock.pz[i]; n++; }
        return n ? [x / n, y / n, z / n] : [0, worldY(0.5), DIST];
    }
    function falconStep(dt) {
        const F = flock.falcon;
        if (fal.mode === 'off') { F.on = false; return; }
        let max = 30, acc = 55;
        if (fal.mode === 'pointer') {
            const c = centroid();
            fal.tz += (c[2] - fal.tz) * (1 - Math.exp(-dt / 1.5));
            const [x, y] = unproject(pointer.x * sc.dpr, pointer.y * sc.dpr, fal.tz);
            fal.tx = x; fal.ty = y;
        } else if (fal.mode === 'pass') {
            max = 34; acc = 45;
            const p = fal.pass;
            if (p.leg === 0 && Math.hypot(fal.x - p.mx, fal.y - p.my, fal.z - p.mz) < 6) p.leg = 1;
            [fal.tx, fal.ty, fal.tz] = p.leg === 0 ? [p.mx, p.my, p.mz] : [p.ex, p.ey, p.ez];
            if (p.leg === 1 && Math.hypot(fal.x - p.ex, fal.y - p.ey) < 8) { fal.mode = 'off'; F.on = false; return; }
        } else if (fal.mode === 'leave') {
            max = 22;
            if (fal.y > worldY(-0.15) || Math.abs(fal.x) > sc.hw * 1.6) { fal.mode = 'off'; F.on = false; return; }
        }
        // steer toward the target, a bird's acceleration, not a cursor's
        const dx = fal.tx - fal.x, dy = fal.ty - fal.y, dz = fal.tz - fal.z;
        const dist = Math.hypot(dx, dy, dz) || 1;
        const want = Math.min(max, dist * 2.2);
        const wx = dx / dist * want, wy = dy / dist * want, wz = dz / dist * want;
        let ax = (wx - fal.vx) * 4, ay = (wy - fal.vy) * 4, az = (wz - fal.vz) * 4;
        const am = Math.hypot(ax, ay, az);
        if (am > acc) { ax *= acc / am; ay *= acc / am; az *= acc / am; }
        fal.vx += ax * dt; fal.vy += ay * dt; fal.vz += az * dt;
        fal.x += fal.vx * dt; fal.y += fal.vy * dt; fal.z += fal.vz * dt;
        Object.assign(F, { on: true, x: fal.x, y: fal.y, z: fal.z, vx: fal.vx, vy: fal.vy, vz: fal.vz });
    }
    function falconEnter(px, py) {
        // it comes in from above, out of the sun's side
        const c = centroid();
        fal.z = fal.tz = c[2];
        const [x] = unproject(px * sc.dpr, py * sc.dpr, fal.z);
        fal.x = x + (x > 0 ? 1 : -1) * 6; fal.y = worldY(-0.05);
        fal.vx = 0; fal.vy = -10; fal.vz = 0;
    }
    function drawFalcon(t) {
        if (fal.mode === 'off') { hawk.style.opacity = '0'; return; }
        const z = Math.max(20, fal.z);
        const sx = (sc.cx + sc.F * fal.x / z) / sc.dpr, sy = (sc.hY - sc.F * (fal.y - EYE) / z) / sc.dpr;
        const span = Math.max(13, sc.F * 1.0 / z / sc.dpr);         // a peregrine is about a metre across (never under 13px)
        const vsx = fal.vx, vsy = -fal.vy;
        const ang = Math.atan2(vsy, vsx) * 180 / Math.PI;
        const sp = Math.hypot(fal.vx, fal.vy, fal.vz);
        const tuck = clamp((sp - 18) / 14, 0, 1);                  // wings folded back in a stoop
        const flap = 1 - tuck * 0.5 - (1 - tuck) * 0.22 * (0.5 + 0.5 * Math.sin(t * 2 * Math.PI * 4.5));
        const flip = Math.abs(ang) > 90 ? -1 : 1;
        hawk.style.opacity = '1';
        hawk.style.transform = `translate(${sx}px,${sy}px) rotate(${ang}deg) scale(${(span / 90 * 0.55).toFixed(3)},${(span / 90 * flap * flip).toFixed(3)})`;
    }

    /* ── project every bird to the screen ── */
    function project() {
        const f = flock, F = sc.F, cx = sc.cx, hY = sc.hY;
        let n = 0;
        const ink = o.ink, Rs = f.roost, roosting = Rs.mode === 'roost', floor = Rs.y0 + 0.9;
        for (let i = 0; i < f.n; i++) {
            if (f.landed[i]) continue;
            const x = f.px[i], y = f.py[i] - EYE, z = f.pz[i];
            if (z < 5) continue;
            const iz = 1 / z, sx = cx + F * x * iz, sy = hY - F * y * iz;
            if (sx < -40 || sx > sc.w + 40 || sy < -40 || sy > sc.h + 40) continue;
            const vx = f.vx[i], vy = f.vy[i], vz = f.vz[i], sp = Math.hypot(vx, vy, vz) || 1;
            const fx = vx / sp, fy = vy / sp, fz = vz / sp;
            let rx = -fz, rz = fx; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
            const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;
            const c = Math.cos(f.roll[i]), s = Math.sin(f.roll[i]);
            // banked frame: right wing down for positive roll
            const Rx = rx * c - ux * s, Ry = -uy * s, Rz = rz * c - uz * s;
            const Ux = ux * c + rx * s, Uy = uy * c, Uz = uz * c + rz * s;
            // wing elevation: flapping, or a shallow glide dihedral
            // (in a roll the wings are held out: the escape is a glide on its side)
            const beta = f.escT[i] >= 0 ? 0.06 : f.flapping[i] ? 0.2 + 0.38 * Math.sin(f.flap[i]) : 0.08;
            const cb = Math.cos(beta), sb = Math.sin(beta), h = SPAN / 2;
            // view direction (camera at the origin, eye height)
            const dl = Math.hypot(x, y, z), dx = x / dl, dy = y / dl, dz = z / dl;
            const k = F * iz, ox = x * iz, oy = y * iz;
            const off = (ax, ay, az) => [k * (ax - ox * az), -k * (ay - oy * az)];
            const [wrx, wry] = off(h * (Rx * cb + Ux * sb), h * (Ry * cb + Uy * sb), h * (Rz * cb + Uz * sb));
            const [wlx, wly] = off(h * (-Rx * cb + Ux * sb), h * (-Ry * cb + Uy * sb), h * (-Rz * cb + Uz * sb));
            const [bx, by] = off(fx * BODY / 2, fy * BODY / 2, fz * BODY / 2);
            // how much of each wing's surface faces the camera
            const nR = Math.abs((Ux * cb - Rx * sb) * dx + (Uy * cb - Ry * sb) * dy + (Uz * cb - Rz * sb) * dz);
            const nL = Math.abs((Ux * cb + Rx * sb) * dx + (Uy * cb + Ry * sb) * dy + (Uz * cb + Rz * sb) * dz);
            const q = n * STRIDE;
            data[q] = sx; data[q + 1] = sy;
            data[q + 2] = wlx; data[q + 3] = wly; data[q + 4] = wrx; data[q + 5] = wry;
            data[q + 6] = bx; data[q + 7] = by;
            data[q + 8] = k * (CHORD * nL + 0.008);
            data[q + 9] = k * (CHORD * nR + 0.008);
            data[q + 10] = k * BODY_W;
            let a = Math.min(1, ink * Math.exp(-(dl - 60) / HAZE)) * f.fade[i];
            // coming down into the roost, a bird is lost among the twigs before it lands
            // (the cut-out hides most of it; this covers the gaps between crowns)
            if (roosting && f.py[i] < floor + 1.6 && Math.abs(f.px[i] - Rs.x) < Rs.half && Math.abs(f.pz[i] - Rs.z) < Rs.half * 0.6) a *= clamp((f.py[i] - floor) / 1.6, 0, 1);
            data[q + 11] = a;
            n++;
        }
        return n;
    }

    /* ── the loop: alive while on screen, asleep when hidden, off when roosted ── */
    let raf = 0, last = 0, visible = true, dead = false, idle = 0, audioTick = 0, settleT = 0, closing = false;
    // a slow device: if a frame's work stays over budget, retire birds (faded out, a fifth at a time)
    const BUDGET = 12, floorN = Math.min(N, Math.max(300, Math.round(N * 0.4)));
    const adapt = { cost: 0, over: 0, wait: 2, to: N };
    let ready = false;   // the flock has had its few seconds of evening
    const running = () => ready && !dead && visible && !document.hidden && !calm.matches && m.state !== 'roosted';
    function kick() {
        if (raf || !running()) { if (!running() && sound) sound.sleep(); return; }
        last = 0;
        raf = requestAnimationFrame(frame);
    }
    function frame(now) {
        raf = 0;
        if (!running()) { if (sound) sound.sleep(); return; }
        const dt = last ? Math.min(1 / 30, (now - last) / 1000) : 1 / 60;
        last = now;
        const t0 = performance.now();
        tick(dt);
        render();
        if (o.adapt) budget(performance.now() - t0, dt);
        raf = requestAnimationFrame(frame);
    }
    function budget(ms, dt) {
        const f = flock;
        if (adapt.to < f.n) {
            // fading the retired ones out
            let done = true;
            for (let i = adapt.to; i < f.n; i++) { f.fade[i] -= dt / 1.2; if (f.fade[i] > 0) done = false; }
            if (done) { for (let i = adapt.to; i < f.n; i++) f.fade[i] = 1; f.n = adapt.to; f.neighbours(true); adapt.wait = 2; adapt.cost = 0; }
            return;
        }
        adapt.cost = adapt.cost ? adapt.cost + (ms - adapt.cost) * 0.05 : ms;
        if ((adapt.wait -= dt) > 0) return;
        adapt.over = adapt.cost > BUDGET ? adapt.over + dt : 0;
        if (adapt.over > 1.5 && f.n > floorN && m.state !== 'roosting') {
            adapt.to = Math.max(floorN, Math.round(f.n * 0.8));
            adapt.over = 0;
        }
    }
    function tick(dt) {
        const t = flock.t;
        roam(t);
        // wind: tilt the phone, or a slow breeze on its own
        const W = flock.wind;
        const tx = o.wind && tilt.active ? tilt.x * 5 : 1.4 * Math.sin(t * 0.09 + phase) + 0.6 * Math.sin(t * 0.31);
        const tz = o.wind && tilt.active ? tilt.y * 3 : 0.8 * Math.sin(t * 0.07 + phase * 2);
        W.x += (tx - W.x) * (1 - Math.exp(-dt / 0.6)); W.z += (tz - W.z) * (1 - Math.exp(-dt / 0.6));
        falconStep(dt);
        flock.step(dt);
        // state bookkeeping
        if (m.state === 'roosting') {
            settleT += dt;
            // the last few, still circling low over the trees, drop out of sight over most of a second
            if (!closing && (flock.landedCount >= flock.n * 0.996 || settleT > 75)) closing = true;
            if (closing) {
                let left = 0;
                for (let i = 0; i < flock.n; i++) {
                    if (flock.landed[i]) continue;
                    flock.fade[i] -= dt / 0.8;
                    if (flock.fade[i] <= 0) { flock.landed[i] = 1; flock.fade[i] = 1; } else left++;
                }
                if (!left) { closing = false; flock.landedCount = flock.n; m.send('SETTLED'); }
            }
        } else if (m.state === 'flying' && o.roost > 0 && fal.mode === 'off') {
            idle += dt;
            if (idle > o.roost) doRoost();
        }
        if (m.state === 'hunted' && fal.mode === 'off' && flock.escaping === 0) m.send('CLEAR');
    }
    function render() {
        const n = project();
        R.draw(data, n, sc.w, sc.h, pal.ink);
        drawFalcon(flock.t);
        if (sound && ++audioTick % 6 === 0) listen(n);
    }
    function listen(n) {
        // how many birds, how close, near the listener (the pointer, or the middle of the sky)
        const lx = pointer.in ? pointer.x * sc.dpr : sc.w / 2, ly = pointer.in ? pointer.y * sc.dpr : sc.h * 0.45;
        const rad = Math.min(sc.w, sc.h) * 0.22, r2 = rad * rad;
        let s = 0;
        for (let k = 0; k < n; k += 3) {
            const q = k * STRIDE, dx = data[q] - lx, dy = data[q + 1] - ly;
            if (dx * dx + dy * dy < r2) s += data[q + 10];
        }
        const dens = clamp(s * 3 / (flock.n * 0.06 * sc.F / DIST * BODY_W), 0, 1.4);
        const agit = clamp(flock.escaping / (flock.n * 0.08), 0, 1);
        sound.set(0.01 + 0.22 * dens * (0.45 + 0.75 * agit), agit);
    }

    /* ── actions ── */
    function falconAway() {
        if (fal.mode === 'pointer' || fal.mode === 'pass') { fal.mode = 'leave'; fal.tx = fal.x + fal.vx * 3; fal.ty = worldY(-0.4); fal.tz = fal.z; }
    }
    function doRoost() {
        if (!m.send('ROOST')) return;
        flock.roost.mode = 'roost';
        flock.roost.x = sc.home.x; flock.roost.z = sc.home.z;
        settleT = 0; idle = 0; closing = false;
        falconAway();
        if (calm.matches) {
            // reduced motion: no descent to watch; the sky is simply empty
            fal.mode = 'off';
            for (let i = 0; i < flock.n; i++) flock.landed[i] = 1;
            flock.landedCount = flock.n;
            m.send('SETTLED');
            render();
            return;
        }
        kick();
    }
    function wake() {
        const was = m.state;
        if (was === 'roosted') flock.takeoff();
        flock.roost.mode = 'roam';
        idle = 0; closing = false;
        for (let i = 0; i < flock.n; i++) flock.fade[i] = 1;
        if (was === 'roosting' || was === 'roosted') m.send('WAKE');
        if (calm.matches && was === 'roosted') {
            // reduced motion: the flock is back in the sky, still, as at the start
            roam(flock.t);
            flock.place(flock.roost.x - sc.hw * 0.15, flock.roost.alt, DIST, rnd() < 0.5 ? 0.35 : Math.PI - 0.35);
            for (let k = 0; k < 150; k++) { roam(flock.t); flock.step(1 / 30); }
            render();
            return;
        }
        kick();
    }
    function scatter(x, y) {
        // a falcon stoops through the flock (or through the point x, y: fractions of the element)
        if (calm.matches) return;
        if (m.state === 'roosted' || m.state === 'roosting') wake();
        const c = centroid();
        let mx = c[0], my = c[1], mz = c[2];
        if (x != null) [mx, my] = unproject(x * sc.w, y * sc.h, mz);
        const side = rnd() < 0.5 ? -1 : 1;
        fal.mode = 'pass';
        fal.x = mx - side * sc.hw * 0.9; fal.y = my + sc.hw * 0.75; fal.z = mz;
        fal.vx = side * 14; fal.vy = -16; fal.vz = 0;
        fal.pass = { leg: 0, mx, my, mz, ex: mx + side * sc.hw * 1.6, ey: my - sc.hw * 0.25, ez: mz };
        idle = 0;
        m.send('HUNT');
        el.dispatchEvent(new CustomEvent('murmuration:scatter', { bubbles: true, detail: { x, y } }));
        if (sound) sound.wake();
        kick();
    }

    /* ── input: the pointer is the falcon ── */
    const ac = new AbortController();
    const on = (t, ev, fn, opt) => t.addEventListener(ev, fn, { signal: ac.signal, ...opt });
    const local = (e) => { const r = el.getBoundingClientRect(); pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top; };
    if (o.falcon) {
        // a mouse or pen: the falcon follows it while it is over the sky
        const follow = (e) => {
            if (calm.matches) return;
            local(e); idle = 0;
            if (!pointer.in) {
                pointer.in = true;
                if (m.state === 'roosted' || m.state === 'roosting') wake();
                if (fal.mode === 'off') falconEnter(pointer.x, pointer.y);
            }
            if (fal.mode !== 'pass') fal.mode = 'pointer';
            if (m.state === 'flying') m.send('HUNT');
            kick();
        };
        const leave = () => {
            pointer.in = false;
            if (fal.mode === 'pointer') { fal.mode = 'leave'; fal.tx = fal.x + fal.vx * 3; fal.ty = worldY(-0.4); fal.tz = fal.z; }
        };
        // a finger: a tap sends the falcon down through where you touched; a sideways drag
        // steers it; a vertical swipe is left to the page (touch-action: pan-y), so scrolling
        // past the sky does not set the falcon on the birds
        const touch = { id: -1, x: 0, y: 0, drag: false };
        on(el, 'pointerenter', (e) => { if (e.pointerType !== 'touch') follow(e); });
        on(el, 'pointermove', (e) => {
            if (e.pointerType !== 'touch') { follow(e); return; }
            if (e.pointerId !== touch.id) return;
            if (!touch.drag && Math.abs(e.clientX - touch.x) > 12) touch.drag = true;
            if (touch.drag) follow(e);
        });
        on(el, 'pointerleave', (e) => { if (e.pointerType !== 'touch') leave(); });
        on(el, 'pointerdown', (e) => {
            if (sound) sound.wake();
            if (e.pointerType === 'touch') Object.assign(touch, { id: e.pointerId, x: e.clientX, y: e.clientY, drag: false });
            else if (!calm.matches && (m.state === 'roosted' || m.state === 'roosting')) { wake(); follow(e); }
        });
        on(el, 'pointerup', (e) => {
            if (e.pointerType !== 'touch' || e.pointerId !== touch.id) return;
            touch.id = -1;
            if (touch.drag) { leave(); return; }
            if (calm.matches || Math.hypot(e.clientX - touch.x, e.clientY - touch.y) > 12) return;
            local(e);
            const r = el.getBoundingClientRect();
            scatter(pointer.x / r.width, pointer.y / r.height);
        });
        on(el, 'pointercancel', (e) => { if (e.pointerId === touch.id) { touch.id = -1; if (touch.drag) leave(); } else leave(); });
    }
    on(document, 'visibilitychange', () => { if (document.hidden) { if (sound) sound.sleep(); } else kick(); });
    on(calm, 'change', () => { if (calm.matches) { cancelAnimationFrame(raf); raf = 0; fal.mode = 'off'; render(); if (sound) sound.sleep(); } else kick(); });
    on(window, 'sf-sound', (e) => { if (e.detail && sound) sound.wake(); else if (sound) sound.set(0, 0); });

    const io = new IntersectionObserver((en) => {
        visible = en[en.length - 1].isIntersecting;
        // a sky further down the page gets its flock ready only when it is first seen
        if (visible && !warming) warmUp();
        if (visible) kick(); else if (sound) sound.sleep();
    }, { threshold: 0 });
    io.observe(el);
    let rzT = 0;
    const ro = new ResizeObserver(() => {
        clearTimeout(rzT);
        rzT = setTimeout(() => { if (!dead && layout()) render(); }, 60);
    });
    ro.observe(el);

    /* ── start: a flock already formed, a few seconds into its evening ── */
    layout();
    roam(0);
    const c0y = flock.roost.alt;
    flock.place(flock.roost.x - sc.hw * 0.15, c0y, DIST, rnd() < 0.5 ? 0.35 : Math.PI - 0.35);
    // a few seconds of evening before the birds are shown, flown in slices of ~30ms so a
    // slow phone loading three skies never freezes; the photograph is there meanwhile,
    // and the birds fade in once they are a flock
    const warm = calm.matches ? 150 : 75;
    let wk = 0;
    birdC.style.opacity = '0';
    el.classList.add('is-live');
    let warming = false;
    function warmUp() {
        if (dead) return;
        warming = true;
        const t0 = performance.now();
        while (wk < warm && performance.now() - t0 < 30) { roam(flock.t); flock.step(1 / 30); wk++; }
        if (wk < warm) { setTimeout(warmUp, 0); return; }
        ready = true;
        render();
        birdC.style.transition = calm.matches ? '' : 'opacity .9s ease-out';
        birdC.style.opacity = '';
        kick();
    }

    function destroy() {
        dead = true;
        cancelAnimationFrame(raf);
        ac.abort(); io.disconnect(); ro.disconnect(); clearTimeout(rzT);
        R.destroy(); if (sound) sound.destroy();
        stage.remove();
        el.classList.remove('mm', 'is-live');
        delete el.dataset.state; delete el.dataset.renderer;
        delete el.__murmuration;
    }
    destroy.scatter = scatter;
    destroy.roost = doRoost;
    destroy.wake = wake;
    destroy.flock = flock;
    // where the flock is: its centre as fractions of the element (for placing things, or tests)
    Object.defineProperty(destroy, 'centre', { get: () => { const c = centroid(); return { x: (sc.cx + sc.F * c[0] / c[2]) / sc.w, y: (sc.hY - sc.F * (c[1] - EYE) / c[2]) / sc.h }; } });
    Object.defineProperty(destroy, 'state', { get: () => m.state });
    Object.defineProperty(destroy, 'birds', { get: () => flock.n });
    Object.defineProperty(destroy, 'running', { get: () => !!raf });
    el.__murmuration = destroy;
    return destroy;
}

document.querySelectorAll('[data-murmuration]').forEach((el) => murmuration(el));
