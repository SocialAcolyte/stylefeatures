/* elephant-clock — a countdown that is al-Jazari's Elephant Clock, the 1315 folio itself, simulated.
 *
 *   <div class="ec" data-elephant-clock data-duration="25m">
 *     <div class="ec-sheet"><img class="ec-folio" src="assets/folio.webp" width="1600" height="2281" alt="…"></div>
 *     <p class="ec-readout"><time class="ec-time" datetime="PT25M">25:00</time></p>
 *     <button type="button" data-ec="toggle">Start</button> <button type="button" data-ec="reset">Reset</button>
 *   </div>
 *
 * The folio is "The Elephant Clock" from the 1315 copy of al-Jazari's Book of Knowledge of Ingenious Mechanical
 * Devices (Met 57.51.23, CC0). Its moving parts were cut from the painting offline (tools/), what lay under them
 * painted back, and here they are a small machine, stepped at 240 Hz, built as Hill's translation describes it:
 *
 *   float      a hemispherical bowl with a hole, filling by the orifice law (flow ~ sqrt of the head of water)
 *              and sinking; its depth turns the scribe (the ball riding in it, on a string over the pulleys) and
 *              draws its chain down through the arch. At the rim it floods and sinks; the chain pulls the
 *              release and one ball runs.
 *   ball       gravity and collisions: out of the falcon's beak, into the serpent's mouth, into the vase, out of
 *              the breast onto the cymbal, away under the elephant
 *   serpent    a balance on its axle: its own weight holds it raised; the ball's weight at the mouth tips it;
 *              the chain wound on its back lifts the float (whose weight resists) and empties it
 *   spoon      inside the breast, a lever whose handle is heavier than its scoop: the ball tips it, a rod brings
 *              the mahout's axe down and a chain lifts his mallet; the ball rolls out, the mallet falls
 *   cymbal     a pendulum on its cord; bird: on a bladed wheel with friction; balcony man: on his axle
 *
 * The timer is exact: the float's flow is calibrated so it floods on each cycle boundary, as al-Jazari widened
 * the onyx with emery until it sank in half an hour. Touch: drag the serpent (hold its head at the vase and the
 * float empties: the half hour starts again, which is how the servant set the clock), flick the bird, swing the
 * cymbal, pull the axe down, tap the vase to drop a ball into it. Idle, it is the folio pixel for pixel (<img>).
 *
 * Options (data-* on the root, or the options object, which wins):
 *   duration   '25m', '90s', '1h30m', or ms                          countdown from start()
 *   until      an ISO date-time                                       counts down to it, running from load
 *   cycle      one sinking of the float ('30m' as in life)            default: the duration if 30 min or less
 *   autostart  'true' to start a duration timer at once
 *   touch      'false' to make the folio look-only
 *   src        the clock's JSON (default: assets/clock.json beside the <img>)
 *   doneText   what the live region says at the end ('Time is up.')
 * Events (bubbling, on the root): elephant-clock:tick {remaining, elapsed, progress, cycle}, :cycle {index},
 *   :done, :restart (the float was emptied by hand), and for sounds :whistle, :strike {force}, :cymbal {force}.
 * API: const c = elephantClock(root); c.start(); c.pause(); c.toggle(); c.reset(); c.seek(ms); c.dropBall();
 *   c.state; c.remaining; c(); (destroy) — also on root.elephantClock.
 */

const calm = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const RAD = Math.PI / 180;
const DT = 1 / 240;                // physics step, s
const G = 9800;                    // gravity, master px / s^2 (the folio's clock is drawn at about 1 px to 1 mm)

/* ── the float: a hemisphere (radius 1, water density 1) whose bowl and ball weigh a quarter of its full
 *    displacement. Water enters at sqrt(2 g head); computed once into a table of draft against time. ─────── */
const FLOAT = (() => {
    const cap = (x) => Math.PI * x * x * (1 - x / 3);
    const inv = (V) => { let a = 0, b = 1; for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (cap(m) < V) a = m; else b = m; } return (a + b) / 2; };
    const full = cap(1), m = .25 * full, d0 = inv(m);
    const ts = [0], ds = [0];
    let Vin = 0, t = 0;
    const dt = 2e-4;
    while (m + Vin < full) {
        const d = inv(m + Vin), h = inv(Vin);
        Vin += Math.sqrt(2 * Math.max(d - h, 1e-6)) * dt; t += dt;
        if (ts.length < 2000 && t - ts[ts.length - 1] > 1 / 400) { ts.push(t); ds.push((inv(Math.min(full, m + Vin)) - d0) / (1 - d0)); }
    }
    ts.push(t); ds.push(1);
    const T = t;
    // depth (0 floating empty .. 1 rim at the surface) at a fraction u of the sinking time
    return (u) => {
        const tt = clamp(u) * T;
        let lo = 0, hi = ts.length - 1;
        while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (ts[mid] < tt) lo = mid; else hi = mid; }
        const f = (tt - ts[lo]) / Math.max(1e-9, ts[hi] - ts[lo]);
        return ds[lo] + (ds[hi] - ds[lo]) * f;
    };
})();
const FLOOD = 1.6;                 // s: water over the rim, the float goes down; the whistle sounds
const FLOOD_DEPTH = .22;           // the extra sinking once it floods (of the full travel)
const SCRIBE_TURN = 38;            // degrees the scribe turns through as the float goes down
const SCRIBE_TILT = .2;
const CHAIN_TRAVEL = 3.2;          // S-links the chain is drawn down through the arch by one sinking
const AXE_BLOW = -142, MALLET_LIFT = 20, BALCONY_SHIFT = 5;

function parseDur(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return v;
    const s = String(v).trim();
    if (/^\d+(\.\d+)?$/.test(s)) return +s;
    let ms = 0, ok = false;
    for (const [, n, u] of s.matchAll(/(\d+(?:\.\d+)?)\s*(ms|h|m|s)/g)) { ok = true; ms += +n * ({ h: 3600e3, m: 60e3, s: 1e3, ms: 1 })[u]; }
    return ok ? ms : null;
}
const pad = (n) => String(n).padStart(2, '0');
const split = (ms) => { const t = Math.max(0, Math.ceil(ms / 1000)); return [Math.floor(t / 86400), Math.floor(t / 3600) % 24, Math.floor(t / 60) % 60, t % 60]; };
function fmt(ms) { const [d, h, m, s] = split(ms); return d ? `${d}d ${pad(h)}:${pad(m)}:${pad(s)}` : h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`; }
function iso(ms) { const [d, h, m, s] = split(ms); return 'P' + (d ? d + 'D' : '') + 'T' + (h ? h + 'H' : '') + (m ? m + 'M' : '') + s + 'S'; }
function spoken(ms) {
    const [d, h, m, s] = split(Math.round(ms / 1000) * 1000);
    const part = (n, w) => n ? `${n} ${w}${n === 1 ? '' : 's'}` : '';
    return [part(d, 'day'), part(h, 'hour'), part(m, 'minute'), d || h || m >= 5 ? '' : part(s, 'second')].filter(Boolean).join(' ') || '0 seconds';
}

// 2D affine [a, b, c, d, e, f]: x' = a x + c y + e, y' = b x + d y + f
const rotAbout = (p, deg) => {
    const c = Math.cos(deg * RAD), s = Math.sin(deg * RAD);
    return [c, s, -s, c, p[0] - c * p[0] + s * p[1], p[1] - s * p[0] - c * p[1]];
};
const apply = (M, p) => [M[0] * p[0] + M[2] * p[1] + M[4], M[1] * p[0] + M[3] * p[1] + M[5]];
const invert = (M) => {
    const det = M[0] * M[3] - M[1] * M[2];
    const a = M[3] / det, b = -M[1] / det, c = -M[2] / det, d = M[0] / det;
    return [a, b, c, d, -(a * M[4] + c * M[5]), -(b * M[4] + d * M[5])];
};
const cardTurn = (ax, deg, tilt) => { const c = Math.cos(deg * RAD), s = Math.sin(deg * RAD); return [c, tilt * s, 0, 1, ax * (1 - c), -ax * tilt * s]; };
const wrapPi = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

export function elephantClock(root, opts = {}) {
    const ds = root.dataset;
    const img = root.querySelector('.ec-folio');
    const timeEl = root.querySelector('time, .ec-time');
    if (!img) return Object.assign(() => {}, { start() {}, pause() {}, reset() {} });
    const o = {
        duration: parseDur(opts.duration ?? ds.duration),
        until: opts.until ?? ds.until ?? null,
        cycle: parseDur(opts.cycle ?? ds.cycle),
        autostart: String(opts.autostart ?? ds.autostart ?? 'false') === 'true',
        touch: String(opts.touch ?? ds.touch ?? 'true') !== 'false',
        src: opts.src ?? ds.src ?? (img.getAttribute('src') || '').replace(/[^/]*$/, '') + 'clock.json',
        doneText: opts.doneText ?? ds.doneText ?? 'Time is up.',
    };
    const untilT = o.until ? Date.parse(o.until) : NaN;
    const mode = Number.isFinite(untilT) ? 'until' : 'duration';
    const D = mode === 'duration' ? (o.duration ?? 25 * 60e3) : null;
    const C = Math.max(12e3, o.cycle ?? (mode === 'duration' && D <= 30 * 60e3 ? D : 30 * 60e3));

    let dead = false, raf = 0, ticker = 0, visible = true, ready = false;
    let state = 'idle';                     // idle | running | paused | done
    let acc = 0, runFrom = 0;
    let lastCycle = -1, lastSpoken = null;
    const off = [];
    const on = (t, ev, fn, op) => { t.addEventListener(ev, fn, op); off.push(() => t.removeEventListener(ev, fn, op)); };
    const fire = (name, detail = {}) => root.dispatchEvent(new CustomEvent('elephant-clock:' + name, { bubbles: true, detail }));

    /* ── DOM ── */
    const sheet = img.parentElement;
    const canvas = document.createElement('canvas');
    canvas.className = 'ec-canvas'; canvas.setAttribute('aria-hidden', 'true');
    sheet.appendChild(canvas);
    const live = document.createElement('p');
    live.className = 'ec-live'; live.setAttribute('aria-live', 'polite'); live.setAttribute('role', 'status');
    root.appendChild(live);
    root.classList.add('ec-js');
    if (o.touch) root.classList.add('ec-touch');
    const toggleBtns = [...root.querySelectorAll('[data-ec="toggle"]')];
    const resetBtns = [...root.querySelectorAll('[data-ec="reset"]')];
    const labels = { start: ds.labelStart || 'Start', pause: ds.labelPause || 'Pause', resume: ds.labelResume || 'Resume', again: ds.labelAgain || 'Again' };
    const say = (t) => { live.textContent = ''; requestAnimationFrame(() => { live.textContent = t; }); };

    /* ── time (the truth) ── */
    const elapsed = () => mode === 'until' ? Date.now() : acc + (state === 'running' ? performance.now() - runFrom : 0);
    const remaining = () => mode === 'until' ? untilT - Date.now() : Math.max(0, D - elapsed());
    const cycleOf = (e) => Math.floor(e / C);
    const progress = () => { const e = mode === 'until' ? Date.now() : Math.min(elapsed(), D); return (e % C) / C; };
    const flowing = () => mode === 'until' || state === 'running';

    /* ── the machine ── */
    let M = null, atlas = null, base = null, ctx = null, kx = 1, ky = 1, alpha = null;
    let UP = 100;
    const W = {
        // float: where it is in its sinking, set by timer time. depth 0..1 (rim), then flood to 1 + FLOOD_DEPTH
        float: { set: false, eSet: 0, eNext: 0, depth: 0, lifted: 0, water: 0, flooded: false, released: false },
        serpent: { p: 0, w: 0, held: true },          // p: angle (rad) from the painted pose; held = the servant's hand
        spoon: { s: 0, v: 0 },                         // 0 at rest (axe raised) .. 1 tipped (axe down, mallet up)
        bell: { a: 0, w: 0 },
        bird: { a: 0, w: 0 },
        balcony: { a: 0, w: 0, until: 0 },
        balls: [],
        drag: null,
        lastStep: 0, simTime: 0,
    };
    let SP = null;     // serpent constants, from the geometry

    function setupPhysics() {
        const piv = M.parts.serpent.pivot, mo = M.points.mouth;
        const r = Math.hypot(mo[0] - piv[0], mo[1] - piv[1]);
        const a0 = Math.atan2(mo[1] - piv[1], mo[0] - piv[0]);
        // raised: the mouth under the falcon's beak, where a ball rolling out of it at its speed lands
        const out = M.points.beakOut, vx = -180;
        let x = out[0];
        let p = 0;
        for (let k = 0; k < 4; k++) {
            const a1 = -Math.acos(clamp((x - piv[0]) / r, -1, 1));
            p = a1 - a0; while (p < 0) p += 2 * Math.PI;
            const my = piv[1] + r * Math.sin(a1);
            const t = Math.sqrt(2 * Math.max(10, my - out[1]) / G);
            x = out[0] + vx * t;
        }
        UP = p / RAD;
        const rxUp = Math.abs(piv[0] + r * Math.cos(a0 + p) - piv[0]);
        SP = {
            piv, r, a0, up: p, phi0: -70 * RAD,
            K: .86 * G * rxUp / Math.cos(-70 * RAD + p),     // its own weight: just less than the ball's when raised
            I: 1.1e6, c: 7.0e5, chainK: 25,
        };
    }
    const mouthAt = (p) => [SP.piv[0] + SP.r * Math.cos(SP.a0 + p), SP.piv[1] + SP.r * Math.sin(SP.a0 + p)];

    function scribeAngle() {
        const f = W.float, y = clamp((f.depth - f.lifted) / 1, 0, 1 + FLOOD_DEPTH);
        return SCRIBE_TURN * clamp(y, 0, 1);
    }
    function chainOffset() {
        const f = W.float, y = clamp(f.depth - f.lifted, 0, 1 + FLOOD_DEPTH);
        return y / (1 + FLOOD_DEPTH) * CHAIN_TRAVEL * M.parts.chain.period;
    }
    function mats() {
        const P = M.parts, sp = W.spoon.s;
        return {
            serpent: rotAbout(P.serpent.pivot, W.serpent.p / RAD),
            scribe: cardTurn(P.scribe.axis, scribeAngle(), SCRIBE_TILT),
            balcony: rotAbout(P.balcony.pivot, W.balcony.a),
            bird: cardTurn(P.bird.axis, W.bird.a / RAD, 0),
            mallet: rotAbout(P.mallet.pivot, MALLET_LIFT * sp),
            axe: rotAbout(P.axe.pivot, AXE_BLOW * sp),
            bell: rotAbout(P.bell.pivot, W.bell.a / RAD),
        };
    }
    const ORDER = ['serpent', 'scribe', 'balcony', 'bird', 'mallet', 'axe', 'bell'];

    /* ── the float, from timer time ── */
    function floatSchedule(e) {
        // the float is set on the water (empty) at e: it must flood on the next cycle boundary (the end of time
        // for the last one), so its flow is set for that, as the onyx was widened until it sank in half an hour
        const f = W.float;
        let next = (cycleOf(e) + 1) * C;
        if (mode === 'duration') next = Math.min(next, D);
        if (next - e < (FLOOD + 2) * 1000) {
            if (mode === 'duration' && next >= D) { f.set = false; f.depth = 0; return; }   // no time left to sink in
            next = Math.min(mode === 'duration' ? D : Infinity, next + C);
        }
        f.set = true; f.eSet = e; f.eNext = next; f.flooded = false; f.released = false; f.water = 0;
    }
    function updateFloat(dt) {
        const f = W.float;
        const sp = W.serpent;
        // the serpents' chains: wound on the serpent's back as it bows, they lift the float
        const lift = clamp((SP.up - sp.p) / (SP.up * .55));
        f.lifted = lift * (1 + FLOOD_DEPTH);
        if (lift > .5) {
            // lifted far enough, it tips on its hinges and empties
            f.water = Math.max(0, f.water - dt * (.15 + .85 * W.float.water));   // it pours out, slower as it empties
            if (f.set && f.water < .5) { f.set = false; f.flooded = false; if (flowing() && f.depth > .08 && !f.released) restartCycle(); }
            f.depth = Math.min(f.depth, (1 + FLOOD_DEPTH) * (1 - lift));
        }
        if (!f.set) {
            f.depth = Math.max(0, f.depth - dt * 1.5);
            if (lift < .02 && (flowing() || state === 'paused')) floatSchedule(elapsed());
            return;
        }
        const e = elapsed();
        const span = f.eNext - f.eSet - FLOOD * 1000;
        const u = (e - f.eSet) / Math.max(1, span);
        if (u < 1) { f.depth = FLOAT(u); f.water = u; return; }
        // over the rim: it floods and goes down; air out through the whistle is the bird's voice
        if (!f.flooded) { f.flooded = true; fire('whistle'); }
        const v = clamp((e - f.eSet - span) / (FLOOD * 1000));
        f.depth = 1 + FLOOD_DEPTH * (1 - (1 - v) * (1 - v));
        f.water = 1;
        if (v >= 1 && !f.released && sp.p > SP.up - .05) {
            // the chain is taut: it pulls the ring of the tilting channel and lets one ball go
            f.released = true;
            releaseBall();
        }
    }
    function restartCycle() {
        if (mode !== 'duration' || state === 'done') return;
        // the float was emptied by hand: the half hour starts again, as when the servant sets the clock
        const e = elapsed(), start = cycleOf(e) * C;
        if (e - start < 1000) return;
        acc = start; if (state === 'running') runFrom = performance.now();
        lastCycle = cycleOf(start);
        fire('restart', { cycle: lastCycle });
        say('The float was emptied: ' + spoken(remaining()) + ' left.');
        update();
    }

    /* ── balls ── */
    function releaseBall() {
        // inside the castle: the channel drops it on the bladed wheel (the bird turns), into the trough, through
        // the Balance (the man on the balcony shifts) and down to the falcon's head
        const b = { state: 'castle', t: 0, x: M.points.beakIn[0], y: M.points.beakIn[1], vx: 0, vy: 0 };
        W.balls.push(b);
        wake();
    }
    function dropBall() {               // by hand, into the vase: it runs down to the spoon
        if (!ready) return;
        const v = M.points.vaseIn, d = M.ball.d;
        W.balls.push({ state: 'fly', t: 0, x: v[0] + 6, y: v[1] - 90, vx: 0, vy: 0, hand: true });
        show(true); wake();
    }
    function stepBalls(dt) {
        const P = M.points, rb = M.ball.d / 2;
        for (const b of W.balls) {
            b.t += dt;
            if (b.state === 'castle') {
                if (b.t > .12 && !b.wheel) { b.wheel = true; W.bird.w += 9.5 + Math.random() * 1.5; }
                if (b.t > .3 && !b.balance) { b.balance = true; W.balcony.until = W.simTime + 1.6; }
                if (b.t > .5) { b.state = 'beak'; b.t = 0; b.x = P.beakIn[0]; b.y = P.beakIn[1]; }
                continue;
            }
            if (b.state === 'beak') {          // rolling along the falcon's neck and out of the beak
                const u = clamp(b.t / .14);
                b.x = P.beakIn[0] + (P.beakOut[0] - P.beakIn[0]) * u; b.y = P.beakIn[1] + (P.beakOut[1] - P.beakIn[1]) * u;
                if (u >= 1) { b.state = 'fly'; b.vx = (P.beakOut[0] - P.beakIn[0]) / .14; b.vy = 0; }
                continue;
            }
            if (b.state === 'mouth') {
                const m = mouthAt(W.serpent.p); b.x = m[0]; b.y = m[1] - rb * .3;
                if (W.serpent.p < .06) { b.state = 'fly'; b.vx = 20; b.vy = 40; b.intoVase = true; }
                continue;
            }
            if (b.state === 'pipe') {          // down the pipe from the vase to the scoop of the spoon
                if (b.t > .28) { b.state = 'spoon'; b.t = 0; }
                continue;
            }
            if (b.state === 'spoon') {
                if (W.spoon.s > .88) { b.state = 'breast'; b.t = 0; }     // it rolls out of the tipped scoop
                continue;
            }
            if (b.state === 'breast') {        // through the hollow of the breast, out between the forelegs
                if (b.t > .16) { b.state = 'fly'; b.x = P.breast[0]; b.y = P.breast[1]; b.vx = -160; b.vy = 20; b.fromBreast = true; b.intoVase = b.hand = false; }
                continue;
            }
            if (b.state !== 'fly') continue;
            b.vy += G * dt; b.x += b.vx * dt; b.y += b.vy * dt;
            // the serpent's open mouth
            if (!b.fromBreast && !b.intoVase && !b.hand) {
                const m = mouthAt(W.serpent.p);
                if (Math.hypot(b.x - m[0], b.y - m[1]) < rb * 2.2 && b.vy > 0) { b.state = 'mouth'; W.serpent.w += b.vy * .0004; continue; }
            }
            // into the vase's mouth
            const v = P.vaseIn;
            if ((b.intoVase || b.hand) && b.y > v[1] - 38) { b.state = 'pipe'; b.t = 0; continue; }
            // the cymbal
            if (b.fromBreast) {
                const bc = bellCentre();
                const dx = b.x - bc[0], dy = b.y - bc[1], dist = Math.hypot(dx, dy), R = rb + M.parts.bell.r;
                if (dist < R && (b.vx * dx + b.vy * dy) < 0) {
                    const nx = dx / dist, ny = dy / dist, vn = b.vx * nx + b.vy * ny;
                    b.vx -= 1.4 * vn * nx; b.vy -= 1.4 * vn * ny;              // restitution .4
                    b.x = bc[0] + nx * R; b.y = bc[1] + ny * R;
                    const force = Math.min(1, Math.abs(vn) / 900);
                    W.bell.w += -nx * Math.abs(vn) * .0022;                      // the blow swings it on its cord
                    fire('cymbal', { force });
                }
            }
            // gone: under the elephant, into the tray between its legs (or lost behind the dais)
            if (b.y > P.footIn[1] || b.y > M.master[1]) b.state = 'gone';
            if (!b.fromBreast && !b.intoVase && !b.hand && b.y > P.mouth[1] + 40) {
                b.state = 'gone';                     // it missed the serpent (held aside by a hand): the next one runs
                W.float.released = false;
            }
        }
        W.balls = W.balls.filter((b) => b.state !== 'gone');
    }
    function bellCentre() {
        const B = M.parts.bell, m = rotAbout(B.pivot, W.bell.a / RAD);
        return apply(m, B.centre);
    }

    /* ── one step of everything ── */
    function step(dt) {
        W.simTime += dt;
        const sp = W.serpent, d = W.drag;
        updateFloat(dt);
        stepBalls(dt);
        // the serpent: own weight, a ball at its mouth, the float's chain, a hand, the axle's friction
        if (sp.held && !(d && d.part === 'serpent')) { sp.p = 0; sp.w = 0; }
        else {
            let tau = SP.K * Math.cos(SP.phi0 + sp.p);
            if (W.balls.some((b) => b.state === 'mouth')) tau += G * (mouthAt(sp.p)[0] - SP.piv[0]);
            const lift = clamp((SP.up - sp.p) / (SP.up * .55));
            if (W.float.water > .05 && lift < 1) tau += SP.chainK * G * W.float.water * (sp.w < 0 ? 1 : 0);
            if (d && d.part === 'serpent') tau += handTorque(d, sp.p, sp.w, d.servant ? 1.6e7 : 8e6);
            tau -= SP.c * sp.w;
            sp.w += tau / SP.I * dt; sp.p += sp.w * dt;
            if (sp.p < 0) { sp.p = 0; if (sp.w < -.3) fire('knock', { part: 'serpent' }); sp.w = sp.w < -.05 ? -sp.w * .12 : 0; }
            if (sp.p > SP.up) { sp.p = SP.up; sp.w = sp.w > .05 ? -sp.w * .1 : 0; }
        }
        // the spoon: its handle is heavier than its scoop; a ball in the scoop outweighs it
        const s = W.spoon;
        let a = -9;                                                     // handle down: axe raised, mallet resting
        if (W.balls.some((b) => b.state === 'spoon')) a += 26;
        if (d && d.part === 'axe') a += handTorque(d, s.s * AXE_BLOW * RAD, s.v * AXE_BLOW * RAD, 260) / (AXE_BLOW * RAD);
        if (d && d.part === 'mallet') a += handTorque(d, s.s * MALLET_LIFT * RAD, s.v * MALLET_LIFT * RAD, 40) / (MALLET_LIFT * RAD);
        a -= 3.2 * s.v;
        s.v += a * dt; s.s += s.v * dt;
        if (s.s > 1) { if (s.v > 1.2) fire('strike', { force: Math.min(1, s.v / 6), with: 'axe' }); s.s = 1; s.v = s.v > .4 ? -s.v * .15 : 0; }
        if (s.s < 0) { if (s.v < -1.2) fire('strike', { force: Math.min(1, -s.v / 6), with: 'mallet' }); s.s = 0; s.v = s.v < -.4 ? -s.v * .2 : 0; }
        // the cymbal on its cord
        const bl = W.bell, L = M.parts.bell.len;
        let ab = -(G / L) * Math.sin(bl.a) - 1.4 * bl.w;
        if (d && d.part === 'bell') ab += handTorque(d, bl.a, bl.w, 900);
        bl.w += ab * dt; bl.a = clamp(bl.a + bl.w * dt, -.4, .4);
        // the bird on its rod: friction at the wheel, a slight preference for facing one way or the other
        const bd = W.bird;
        if (d && d.part === 'bird') bd.w += (d.flick - bd.w) * Math.min(1, dt * 12);
        else {
            if (W.birdHome && Math.abs(bd.w) < 3) bd.w += (-14 * Math.sin(bd.a) - 4 * bd.w) * dt;     // the servant turns it back
            if (Math.abs(bd.w) > 1.6) bd.w -= (2.6 * Math.sign(bd.w) + .7 * bd.w) * dt;     // the wheel's friction
            else bd.w += (-7 * Math.sin(2 * bd.a) - 3.2 * bd.w) * dt;                   // slow: it settles facing a side
        }
        bd.a += bd.w * dt;
        // the man on the balcony, on his axle: the Balance throws him over while a ball runs through
        const bc = W.balcony, target = W.simTime < bc.until ? BALCONY_SHIFT : 0;
        let ac = 70 * (target - bc.a) - 14 * bc.w;
        if (d && d.part === 'balcony') ac += handTorque(d, bc.a * RAD, bc.w * RAD, 90) / RAD;
        bc.w += ac * dt; bc.a += bc.w * dt;
        bc.a = clamp(bc.a, -BALCONY_SHIFT, BALCONY_SHIFT * 1.6);
    }
    function handTorque(d, angle, w, k) {
        // a hand on the part: a firm spring toward the angle under the pointer, critically damped
        const want = d.angle0 + wrapPi(d.pointerAngle - d.grabAngle);
        return k * wrapPi(want - angle) - 2 * Math.sqrt(k) * w;
    }
    function resting() {
        const sp = W.serpent, f = W.float;
        if (W.drag || W.balls.length) return false;
        if (Math.abs(sp.w) > .002 || (!sp.held && sp.p < SP.up - .002)) return false;
        if (Math.abs(W.spoon.v) > .002 || W.spoon.s > .002) return false;
        if (Math.abs(W.bell.w) > .004 || Math.abs(W.bell.a) > .0015) return false;
        if (Math.abs(W.bird.w) > .004 || Math.abs(Math.sin(2 * W.bird.a)) > .01) return false;
        if (Math.abs(W.balcony.w) > .01 || Math.abs(W.balcony.a) > .01 || W.simTime < W.balcony.until) return false;
        if (f.set && f.flooded && !f.released) return false;
        if (!f.set && !sp.held && (f.lifted > .001 || f.depth > .001)) return false;
        return true;
    }
    function settle() {
        // after a long gap (hidden tab, reduced motion): put everything where the machine would have come to rest
        W.balls.length = 0;
        const sp = W.serpent;
        if (!sp.held) { sp.p = SP.up; sp.w = 0; }
        W.spoon.s = W.spoon.v = 0; W.bell.a = W.bell.w = 0; W.bird.w = 0; W.bird.a = Math.round(W.bird.a / Math.PI) * Math.PI;
        W.balcony.a = W.balcony.w = 0; W.balcony.until = 0;
        const f = W.float;
        f.lifted = 0;
        if (f.flooded && !f.released) { f.released = true; fire('strike', { force: .5, with: 'axe' }); fire('cymbal', { force: .5 }); }
        if (f.released || !f.set) { if (flowing() || state === 'paused') floatSchedule(elapsed()); else { f.set = false; f.depth = 0; } }
    }

    /* ── drawing ── */
    function draw() {
        if (!ctx || !base) return;
        const mt = mats();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(base, 0, 0);
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
        // the chain in the arch, drawn down as the float sinks: its links slide inside their own corridor
        const ch = M.parts.chain, [cx, cy, cw, chh] = ch.atlas, [x0, y0, x1, y1] = ch.clip;
        const off = chainOffset() % ch.period;
        ctx.save();
        ctx.setTransform(kx, 0, 0, ky, 0, 0);
        ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip();
        ctx.drawImage(atlas, cx, cy, cw, chh, ch.at[0], ch.at[1] + off, cw, chh);
        ctx.drawImage(atlas, cx, cy, cw, chh, ch.at[0], ch.at[1] + off - ch.period, cw, chh);
        ctx.restore();
        for (const k of ORDER) {
            const P = M.parts[k], m = mt[k], [sx, sy, sw, sh] = P.atlas;
            ctx.setTransform(kx * m[0], ky * m[1], kx * m[2], ky * m[3], kx * m[4], ky * m[5]);
            ctx.drawImage(atlas, sx, sy, sw, sh, P.at[0], P.at[1], sw, sh);
            if (k === 'serpent' && W.serpent.p > .01) {
                // the mahout sits in front of the castle: the serpent's head passes behind him
                const O = M.occluders.occ_mahout, [ox, oy, ow, oh] = O.atlas;
                ctx.setTransform(kx, 0, 0, ky, 0, 0);
                ctx.drawImage(atlas, ox, oy, ow, oh, O.at[0], O.at[1], ow, oh);
            }
        }
        ctx.setTransform(kx, 0, 0, ky, 0, 0);
        const [bsx, bsy, bsw, bsh] = M.ball.atlas, bd = M.ball.d;
        for (const b of W.balls) {
            if (b.state === 'castle' || b.state === 'pipe' || b.state === 'spoon' || b.state === 'breast') continue;
            ctx.drawImage(atlas, bsx, bsy, bsw, bsh, b.x - bd / 2, b.y - bd / 2, bd, bd);
            for (const k of ['occ_falcon', 'occ_vase', 'occ_leg', 'occ_foot']) {
                const O = M.occluders[k], [ox, oy, ow, oh] = O.atlas;
                if (b.x + bd / 2 > O.at[0] && b.x - bd / 2 < O.at[0] + ow && b.y + bd / 2 > O.at[1] && b.y - bd / 2 < O.at[1] + oh)
                    ctx.drawImage(atlas, ox, oy, ow, oh, O.at[0], O.at[1], ow, oh);
            }
        }
    }
    function show(moving) { root.classList.toggle('ec-moving', moving); }
    const atPainting = () => state === 'idle' && W.serpent.held && resting() && W.float.depth < .001 && Math.abs(Math.sin(W.bird.a / 2)) < .01;
    function frame(now) {
        raf = 0;
        if (dead || !ready || frozen) return;
        let gap = (now - W.lastStep) / 1000;
        W.lastStep = now;
        if (gap > .25) { settle(); gap = DT; }
        let n = Math.min(60, Math.round(gap / DT));
        while (n-- > 0) step(DT);
        if (calm.matches && !W.drag) settle();
        draw();
        if (!resting() && visible && !document.hidden) raf = requestAnimationFrame(frame);
        else if (atPainting()) show(false);
    }
    function wake() {
        if (!ready || raf || frozen || !visible || document.hidden) return;
        show(true);
        W.lastStep = performance.now();
        raf = requestAnimationFrame(frame);
    }

    /* ── touch ── */
    function toMaster(ev) {
        const r = img.getBoundingClientRect();
        return [(ev.clientX - r.left) / r.width * M.master[0], (ev.clientY - r.top) / r.height * M.master[1]];
    }
    function hitPart(pt0) {
        // a finger is not a pixel: try the point and a ring 7 px round it
        for (const [ox, oy] of [[0, 0], [7, 0], [-7, 0], [0, 7], [0, -7], [5, 5], [-5, -5], [5, -5], [-5, 5]]) {
            const k = hitAt([pt0[0] + ox, pt0[1] + oy]);
            if (k) return k;
        }
        return null;
    }
    function hitAt(pt) {
        const mt = mats();
        for (const k of ['axe', 'mallet', 'bell', 'bird', 'balcony', 'serpent']) {
            const P = M.parts[k], q = apply(invert(mt[k]), pt);
            const lx = Math.floor(q[0] - P.at[0]), ly = Math.floor(q[1] - P.at[1]);
            const [sx, sy, sw, sh] = P.atlas;
            if (lx < 0 || ly < 0 || lx >= sw || ly >= sh) continue;
            if (alpha[(sy + ly) * alpha.w + sx + lx] > 90) return k;
        }
        const v = M.occluders.occ_vase, [, , vw, vh] = v.atlas;
        if (pt[0] > v.at[0] - 6 && pt[0] < v.at[0] + vw + 6 && pt[1] > v.at[1] - 26 && pt[1] < v.at[1] + vh) return 'vase';
        return null;
    }
    const pivotOf = (k) => k === 'bird' ? null : M.parts[k].pivot;
    function partAngle(k) {
        if (k === 'serpent') return W.serpent.p;
        if (k === 'axe') return W.spoon.s * AXE_BLOW * RAD;
        if (k === 'mallet') return W.spoon.s * MALLET_LIFT * RAD;
        if (k === 'bell') return W.bell.a;
        if (k === 'balcony') return W.balcony.a * RAD;
        return 0;
    }
    function onDown(ev) {
        if (!ready || !o.touch || (ev.button != null && ev.button > 0)) return;
        const pt = toMaster(ev), k = hitPart(pt);
        if (!k) return;
        if (k === 'vase') { dropBall(); ev.preventDefault(); return; }
        if (k === 'serpent' && W.serpent.held && state === 'idle') {
            // the servant's hand is on it: lifting it and letting go sets the clock going
            W.serpent.held = false; W.drag = null;
        }
        const pv = pivotOf(k);
        const ang = pv ? Math.atan2(pt[1] - pv[1], pt[0] - pv[0]) : 0;
        W.drag = { part: k, id: ev.pointerId, grabAngle: ang, pointerAngle: ang, angle0: partAngle(k), x: pt[0], t: performance.now(), flick: W.bird.w, startP: W.serpent.p, moved: 0 };
        try { sheet.setPointerCapture(ev.pointerId); } catch {}
        root.classList.add('ec-grabbing');
        ev.preventDefault();
        wake();
    }
    function onMove(ev) {
        if (!ready || !o.touch) return;
        const pt = toMaster(ev), d = W.drag;
        if (!d) { if (ev.pointerType === 'mouse') sheet.style.cursor = hitPart(pt) ? 'grab' : ''; return; }
        if (ev.pointerId !== d.id) return;
        const pv = pivotOf(d.part);
        if (pv) d.pointerAngle = Math.atan2(pt[1] - pv[1], pt[0] - pv[0]);
        else {
            const now = performance.now(), dtm = Math.max(8, now - d.t);
            const R = 60, vx = (pt[0] - d.x) / (dtm / 1000);
            d.flick = clamp(d.flick * .4 + .6 * (-vx / R), -9.5, 9.5);   // a flick across the bird turns its rod (gently)
            d.x = pt[0]; d.t = now;
        }
        d.moved = Math.max(d.moved, Math.abs(wrapPi(d.pointerAngle - d.grabAngle)));
        wake();
    }
    function onUp(ev) {
        const d = W.drag;
        if (!d || ev.pointerId !== d.id) return;
        W.drag = null;
        root.classList.remove('ec-grabbing');
        if (d.part === 'bird') W.bird.w = d.flick;
        if (d.part === 'serpent' && state === 'idle' && mode === 'duration') {
            if (W.serpent.p > 12 * RAD) start();                 // let go of it raised: the clock is set going
            else { W.serpent.held = true; }
        }
        wake();
    }

    /* ── running ── */
    function update() {
        if (dead) return;
        const rem = remaining();
        if (timeEl) { timeEl.textContent = fmt(rem); timeEl.setAttribute('datetime', iso(rem)); }
        if (flowing()) {
            const ci = mode === 'until' ? cycleOf(Date.now()) : cycleOf(Math.min(elapsed(), D));
            if (lastCycle >= 0 && ci > lastCycle && rem > 500) fire('cycle', { index: ci });
            lastCycle = ci;
            fire('tick', { remaining: rem, elapsed: mode === 'until' ? 0 : elapsed(), progress: progress(), cycle: ci });
            announce(rem);
            if (rem <= 0) finish();
        }
        if (ready) { if (!raf) { updateFloat(0); if (!resting()) wake(); else if (state !== 'idle' || mode === 'until') { show(true); draw(); } } }
    }
    function announce(rem) {
        const m = Math.ceil(rem / 60e3);
        const mark = rem > 3600e3 ? Math.ceil(rem / 1800e3) * 30 : (m > 5 ? Math.ceil(m / 5) * 5 : m);
        if (lastSpoken === null) { lastSpoken = mark; return; }
        if (mark !== lastSpoken && rem > 1000) { lastSpoken = mark; say(spoken(Math.round(rem / 60e3) * 60e3) + ' left.'); }
    }
    function schedule() {
        clearTimeout(ticker);
        if (dead || !flowing()) return;
        const ms = ((remaining() % 1000) + 1000) % 1000 || 1000;
        ticker = setTimeout(() => { update(); schedule(); }, ms + 8);
    }
    function finish() {
        if (state === 'done') return;
        state = 'done'; acc = D;
        clearTimeout(ticker);
        fire('cycle', { index: Math.ceil(D / C) });
        fire('done');
        say(o.doneText);
        root.classList.add('ec-done');
        syncButtons();
        if (ready) { updateFloat(0); wake(); }
    }
    function syncButtons() {
        for (const b of toggleBtns) {
            b.textContent = state === 'running' ? labels.pause : state === 'paused' ? labels.resume : state === 'done' ? labels.again : labels.start;
            b.setAttribute('aria-pressed', String(state === 'running'));
        }
        for (const b of resetBtns) b.disabled = state === 'idle';
        root.dataset.state = state;
    }
    function start() {
        if (dead || mode === 'until') return;
        if (state === 'done') reset(true);
        if (state === 'running') return;
        const now = performance.now();
        if (state === 'idle') { acc = 0; lastCycle = 0; lastSpoken = null; say(spoken(D) + '. Started.'); }
        else say('Resumed, ' + spoken(remaining()) + ' left.');
        state = 'running'; runFrom = now;
        W.birdHome = false;
        root.classList.remove('ec-done');
        // Hill sec. 15: the servant lets go of the serpent he lowered to the vase; it rises, the float empties
        W.serpent.held = false;
        syncButtons(); update(); schedule(); wake();
    }
    function pause() {
        if (state !== 'running') return;
        acc = elapsed(); state = 'paused';
        clearTimeout(ticker);
        say('Paused, ' + spoken(remaining()) + ' left.');
        syncButtons(); update();
    }
    function reset(quiet) {
        if (mode === 'until') return;
        clearTimeout(ticker);
        state = 'idle'; acc = 0; lastCycle = -1; lastSpoken = null;
        root.classList.remove('ec-done');
        // the servant lowers the serpent's head to the vase again: the float is lifted and emptied
        if (ready) {
            W.balls.length = 0;
            W.birdHome = true;
            W.drag = { part: 'serpent', id: -1, grabAngle: 0, pointerAngle: -W.serpent.p - .05, angle0: W.serpent.p, servant: true };
            W.serpent.held = false;
            const s = W.serpent, poll = () => {
                if (dead) return;
                if (s.p < .01 || state !== 'idle') { if (W.drag && W.drag.servant) W.drag = null; if (state === 'idle') s.held = true; W.float.set = false; wake(); return; }
                setTimeout(poll, 60);
            };
            poll(); wake();
        }
        if (!quiet) say('Reset.');
        syncButtons(); update();
    }
    function seek(ms) {                 // tests and demos: jump the elapsed time (duration mode)
        if (mode !== 'duration') return;
        if (state === 'idle') { state = 'paused'; W.serpent.held = false; }
        acc = clamp(ms, 0, D); runFrom = performance.now();
        lastCycle = cycleOf(acc);
        W.float.set = false;
        if (ready) { settle(); W.serpent.p = SP.up; floatSchedule((cycleOf(acc)) * C + 1); }
        syncButtons(); update(); if (ready) draw();
    }

    /* ── loading and drawing surface ── */
    function resize() {
        if (!ready) return;
        const r = img.getBoundingClientRect();
        if (r.width < 2) return;
        const dpr = Math.min(2, devicePixelRatio || 1);
        const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
        if (canvas.width === w && canvas.height === h && base) return;
        canvas.width = w; canvas.height = h;
        kx = w / M.master[0]; ky = h / M.master[1];
        ctx = canvas.getContext('2d');
        base = document.createElement('canvas'); base.width = w; base.height = h;
        const b = base.getContext('2d');
        b.imageSmoothingEnabled = true; b.imageSmoothingQuality = 'high';
        b.drawImage(img, 0, 0, w, h);
        for (const c of M.clean) { const [sx, sy, sw, sh] = c.atlas; b.drawImage(atlas, sx, sy, sw, sh, c.at[0] * kx, c.at[1] * ky, sw * kx, sh * ky); }
        draw();
    }
    const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.decoding = 'async'; i.onload = () => res(i); i.onerror = rej; i.src = src; });
    (async () => {
        const meta = await (await fetch(o.src)).json();
        const dir = o.src.replace(/[^/]*$/, '');
        const at = await loadImg(dir + 'parts.webp');
        if (!img.complete) await new Promise((r) => img.addEventListener('load', r, { once: true }));
        if (dead) return;
        M = meta; atlas = at;
        // alpha of the atlas, for touching parts by their own painted outline
        const c = document.createElement('canvas'); c.width = at.width; c.height = at.height;
        const cx = c.getContext('2d', { willReadFrequently: true }); cx.drawImage(at, 0, 0);
        const px = cx.getImageData(0, 0, at.width, at.height).data;
        alpha = new Uint8Array(at.width * at.height); alpha.w = at.width;
        for (let i = 0; i < alpha.length; i++) alpha[i] = px[i * 4 + 3];
        // the cymbal: its body's centre and its length on the cord, from its own outline
        const B = M.parts.bell, [bx, by, bw, bh] = B.atlas;
        let sx = 0, sy = 0, n = 0, maxY = 0;
        for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) if (alpha[(by + y) * alpha.w + bx + x] > 128) { const Y = B.at[1] + y; if (Y > B.pivot[1] + 20) { sx += B.at[0] + x; sy += Y; n++; } maxY = Math.max(maxY, Y); }
        B.centre = [sx / n, sy / n]; B.len = Math.hypot(B.centre[0] - B.pivot[0], B.centre[1] - B.pivot[1]); B.r = Math.max(8, (maxY - B.centre[1]) * .9);
        setupPhysics();
        ready = true;
        root.classList.add('ec-ready');
        resize();
        if (mode === 'until') { W.serpent.held = false; W.serpent.p = SP.up; floatSchedule(Date.now()); W.float.eSet = cycleOf(Date.now()) * C + 6000; show(true); draw(); }
        else if (state !== 'idle') { W.serpent.held = false; wake(); }
    })().catch((err) => { console.warn('elephant-clock:', err); root.classList.add('ec-fallback'); });

    const ro = new ResizeObserver(() => resize()); ro.observe(img);
    const io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible && ready) { draw(); if (!resting()) wake(); } });
    io.observe(root);
    on(document, 'visibilitychange', () => { if (!document.hidden) { update(); schedule(); wake(); } });
    for (const b of toggleBtns) on(b, 'click', () => (state === 'running' ? pause() : start()));
    for (const b of resetBtns) on(b, 'click', () => reset());
    on(sheet, 'pointerdown', onDown);
    on(sheet, 'pointermove', onMove);
    on(sheet, 'pointerup', onUp);
    on(sheet, 'pointercancel', onUp);

    function destroy() {
        dead = true; cancelAnimationFrame(raf); clearTimeout(ticker);
        off.forEach((f) => f()); ro.disconnect(); io.disconnect();
        canvas.remove(); live.remove();
        sheet.style.cursor = '';
        root.classList.remove('ec-js', 'ec-ready', 'ec-moving', 'ec-done', 'ec-fallback', 'ec-touch', 'ec-grabbing');
        delete root.dataset.state; delete root.elephantClock;
    }
    let frozen = false;
    const api = Object.assign(destroy, {
        start, pause, reset: () => reset(), seek, dropBall,
        toggle: () => (state === 'running' ? pause() : start()),
        // tests and screenshots: run the machine forward by s seconds of simulated time, without waiting
        advance: (s) => { if (!ready) return; show(true); let n = Math.round(s / DT); while (n-- > 0) { if (state === 'running') acc += DT * 1000; step(DT); } update(); draw(); },
        hold: (v = true) => { frozen = v; if (v) { cancelAnimationFrame(raf); raf = 0; } else wake(); },
        world: () => W,
        hit: (x, y) => (ready ? hitPart([x, y]) : null),          // which part is under a master-px point
    });
    Object.defineProperties(api, {
        state: { get: () => state },
        remaining: { get: () => remaining() },
        ready: { get: () => ready },
    });
    root.elephantClock = api;
    syncButtons(); update();
    if (mode === 'until') { lastCycle = cycleOf(Date.now()); schedule(); }
    else if (o.autostart) start();
    return api;
}

const live = new WeakMap();
function boot() {
    for (const el of document.querySelectorAll('[data-elephant-clock]')) if (!live.has(el)) live.set(el, elephantClock(el));
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
