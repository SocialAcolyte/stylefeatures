/*
 *  PYRAMID-STEPS // a stepper that lays limestone courses.
 *
 *    <nav data-pyramid-steps aria-label="Application">
 *      <ol>
 *        <li>Account</li>
 *        <li aria-current="step">Details</li>
 *        <li>Payment</li>
 *      </ol>
 *    </nav>
 *
 *  Auto-starts on [data-pyramid-steps], or call pyramidSteps(el, options); it returns an object with next(),
 *  back(), go(i), progress(f), destroy() and the current state. Without JS it is the list.
 *
 *  Each finished step is one course of limestone, laid block by block: blocks come up the ramp over the far edge
 *  of the working platform and are slid across the wet gypsum bed to their places, front rows first. The step you
 *  are on is the course being laid. Finishing the last step sets the capstone. Going back takes the top course off
 *  again, the last block laid the first one lifted.
 *
 *  The model is measured: courses shrink upward as Khufu's do (Petrie's course heights, averaged band by band),
 *  the faces rise at the 69 degrees of the capstone (Iufaa's pyramidion, The Met, H 35.5 x W 27.2 x D 26.4 cm),
 *  blocks keep the proportions of Giza core blocks, and alternate courses run their joints the other way. Every
 *  block face is a cut-out from a photograph of a real Giza block; the capstone's four faces are the four
 *  photographs of Iufaa's.
 *
 *  The view is orthographic, so every face maps by an affine transform and Canvas2D draws it exactly. The low
 *  sun comes from the left and rakes across the bed of the course being laid. Nothing runs at rest.
 */
const calm = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false, addEventListener() {}, removeEventListener() {} };
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const mix = (a, b, t) => a + (b - a) * t;
const easeOut = (t) => 1 - (1 - t) ** 3;
const easeInOut = (t) => t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

/* ---- Khufu's courses ---------------------------------------------------------------------------------------
 * Course heights in cm at the north-east corner, courses 1 to 203, from W. M. F. Petrie, The Pyramids and Temples
 * of Gizeh (1883), pl. VIII, as tabulated at cheops-pyramide.ch. Thick courses (1, 35, 44, 67, 90, 98, 118) start
 * runs that thin upward; overall the courses go from about 1.5 m at the foot to about 0.55 m near the top.
 */
const PETRIE = [148.8, 124.7, 122.4, 111.8, 102.1, 96.5, 99.6, 96, 92.5, 91.4, 85.6, 75.4, 75.7, 74.7, 74.4, 73.4, 71.1, 79, 96.8, 59.7,
    60.5, 87.6, 83.8, 82.3, 82, 78.2, 75.4, 74.2, 71.4, 71.6, 70.6, 66.8, 66.8, 66.5, 126.5, 104.4, 97, 92.2, 86.1, 81,
    78.5, 71.1, 84.6, 104.4, 96.3, 69.3, 90.4, 90.2, 79.2, 71.1, 67.6, 66.8, 65, 65.3, 64.3, 63, 57.2, 72.6, 72.9, 71.4,
    66.5, 62, 66, 65, 66.5, 60.2, 88.9, 77.7, 82.3, 70.6, 73.2, 65.5, 64.3, 77.2, 73.7, 59.9, 64.8, 60.2, 58.7, 61.2,
    58.9, 59.2, 57.4, 70.6, 58.2, 66.8, 55.6, 58.7, 57.7, 97.8, 87.1, 84.1, 74.7, 66.3, 65, 58.4, 66, 95.3, 97.3, 90.4,
    85.1, 69.6, 74.4, 66.8, 67.1, 63.5, 63, 74.4, 67.6, 58.9, 58.2, 61.2, 58.9, 58.4, 56.1, 68.8, 56.9, 90.4, 80.8, 75.7,
    73.9, 66, 67.1, 61.7, 63, 58.4, 57.4, 57.9, 56.1, 67.6, 63.2, 58.9, 54.6, 57.9, 53.8, 60.2, 56.6, 65.3, 64.8, 55.1,
    53.3, 58.7, 53.1, 79, 61.5, 60.7, 56.1, 55.6, 55.1, 67.6, 62, 58.4, 56.4, 55.4, 52.1, 54.1, 53.8, 54.9, 52.3, 54.6,
    52.6, 60.5, 56.1, 65.5, 54.4, 65.5, 52.3, 50.8, 52.1, 52.8, 50, 53.8, 52.8, 50, 51.6, 52.1, 51.6, 51.1, 52.3, 67.3,
    62.7, 59.2, 57.2, 56.4, 52.6, 53.6, 52.5, 53.1, 52.1, 51.8, 53.8, 51.1, 52.3, 52.6, 50.3, 60.7, 59.7, 56.1, 54.9, 57.9,
    56.4, 57.2, 54.4];

/** n course heights: Khufu's courses split into n equal bands of height, each band's mean course height. Mean 1. */
export function courseHeights(n) {
    const tops = []; let z = 0;
    for (const h of PETRIE) { tops.push(z + h / 2); z += h; }
    const out = [];
    for (let b = 0; b < n; b++) {
        const lo = z * b / n, hi = z * (b + 1) / n; let s = 0, k = 0;
        PETRIE.forEach((h, i) => { if (tops[i] >= lo && tops[i] < hi) { s += h; k++; } });
        out.push(s / Math.max(1, k));
    }
    const m = out.reduce((a, b) => a + b, 0) / n;
    return out.map((h) => h / m);
}

/* ---- the capstone ------------------------------------------------------------------------------------------
 * Iufaa's pyramidion: H 35.5, base 27.2 x 26.4 cm, so its faces rise at atan(35.5 / 13.4) = 69.3 degrees. The
 * pyramid takes the capstone's slope, so its arrises run straight into it. It is drawn as large against the
 * courses as Khufu's lost pyramidion would have been against his top courses (about twice their height).
 */
const CAP_H = 35.5, CAP_B = 26.8;
const SLOPE = Math.atan(CAP_H / (CAP_B / 2));
const RUN = 1 / Math.tan(SLOPE);            // horizontal setback per unit of height, each side
const CAP_RATIO = 2.1;                      // capstone height / top course height
// The four faces in the atlas, in order round the stone. The two sun faces (scarab in its barque; the disc between
// adoring baboons) are taken as east and west, opposite each other, as on most pyramidia; the two faces of Iufaa
// kneeling under the jackal are north and south.
const CAP_FACES = 4;

/* ---- light -------------------------------------------------------------------------------------------------
 * A low afternoon sun from the left, 26 degrees up, nearly along the front-left face, so it rakes across that face
 * and across the bed of the course being laid; the right face is in shade, lit by the sky and the sand.
 */
const VIEW = { yaw: 33 * Math.PI / 180, pitch: 15 * Math.PI / 180 };
const SUN = (() => {
    const el = 26 * Math.PI / 180, az = -60 * Math.PI / 180;      // azimuth from +z toward -x
    return [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)];
})();
const SUN_RGB = [1, .9, .74], SKY_RGB = [.62, .7, .86], SAND_RGB = [1, .86, .66];
function shadeFor(n) {
    const d = Math.max(0, n[0] * SUN[0] + n[1] * SUN[1] + n[2] * SUN[2]);
    const sky = .56 + .14 * n[1], sand = .44 * (1 - Math.abs(n[1])) + (n[1] < 0 ? .2 : 0);
    return [0, 1, 2].map((i) => SUN_RGB[i] * d * 1.62 + SKY_RGB[i] * sky + SAND_RGB[i] * sand);
}
const SHADE = {};                           // per face orientation, normalised so the sun face is 1 at its brightest
{
    const raw = { top: shadeFor([0, 1, 0]), front: shadeFor([0, 0, 1]), side: shadeFor([1, 0, 0]),
        capFront: shadeFor([0, Math.cos(SLOPE), Math.sin(SLOPE)]), capSide: shadeFor([Math.sin(SLOPE), Math.cos(SLOPE), 0]) };
    const k = 1 / Math.max(...raw.front);       // the photographs are of sunlit faces: the sun face is them as shot
    for (const [n, v] of Object.entries(raw)) SHADE[n] = v.map((c) => Math.min(1, c * k));
    // in shadow on a horizontal bed: sky only
    const sh = shadeFor([0, 1, 0]).map((c, i) => (SKY_RGB[i] * .64 + SAND_RGB[i] * .12) / c);
    SHADE.cast = sh.map((c) => clamp(c, 0, 1));
}
const STONE = [.64, .54, .4];               // mean Giza core limestone in the block atlas (sRGB), for the joints
const rgb = (c, a = 1) => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;

/* ---- projection --------------------------------------------------------------------------------------------- */
const cy = Math.cos(VIEW.yaw), sy = Math.sin(VIEW.yaw), cp = Math.cos(VIEW.pitch), sp = Math.sin(VIEW.pitch);
const R = [cy, 0, -sy], U = [-sp * sy, cp, -sp * cy], C = [cp * sy, sp, cp * cy];
const proj = (x, y, z) => [x * R[0] + z * R[2], -(x * U[0] + y * U[1] + z * U[2])];
const depth = (x, y, z) => x * C[0] + y * C[1] + z * C[2];

/* ---- seeded randomness ------------------------------------------------------------------------------------- */
function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function split(total, mean, lo, hi, r) {
    // cut `total` into pieces of about `mean` (each between lo and hi times mean), in random order
    const n = Math.max(1, Math.round(total / mean));
    const w = Array.from({ length: n }, () => mix(lo, hi, r()));
    const s = w.reduce((a, b) => a + b, 0);
    return w.map((v) => v * total / s);
}

/* ---- the pyramid as blocks ---------------------------------------------------------------------------------- */
function build(n, seed, faces) {
    const r = rng(seed);
    const h = courseHeights(n);
    const top = h[n - 1];
    const capH = top * CAP_RATIO, capB = capH * CAP_B / CAP_H;
    const courses = []; let y = 0;
    const widths = [];
    for (let i = 0; i < n; i++) { let above = 0; for (let j = i + 1; j < n; j++) above += h[j]; widths.push(capB + 2 * RUN * above); }
    const blocks = [];
    for (let i = 0; i < n; i++) {
        const W = widths[i], H = h[i], half = W / 2;
        // the ramp comes up the back on alternate sides; lanes run from it to the front, so the face the lanes
        // end on shows headers (block ends) and the other face shows stretchers (block sides)
        const dir = i % 2 ? 'x' : 'z';
        const lanes = split(W, H * .98, .8, 1.2, r);
        const course = { i, y0: y, y1: y + H, W, H, dir, blocks: [] };
        let a = -half;
        for (const lw of lanes) {
            const lens = split(W, H * 1.24, .72, 1.28, r);
            let b = -half;
            for (const L of lens) {
                const blk = { course: i, y0: y, y1: y + H, s: 0, v: 0, t0: 0, dur: 0, from: 0, to: 0, tex: {} };
                if (dir === 'z') { blk.x0 = a; blk.x1 = a + lw; blk.z0 = b; blk.z1 = b + L; }
                else { blk.z0 = a; blk.z1 = a + lw; blk.x0 = b; blk.x1 = b + L; }
                // laid from the front corner back toward the ramp: farthest from the back corner first, so no
                // block is ever dragged through one already set
                blk.key = Math.hypot((blk.x0 + blk.x1) / 2 + half, (blk.z0 + blk.z1) / 2 + half) + r() * .12 * H;
                blk.len = L;
                course.blocks.push(blk); blocks.push(blk);
                b += L;
            }
            a += lw;
        }
        course.blocks.sort((p, q) => q.key - p.key);
        course.blocks.forEach((b, k) => { b.order = k; });
        courses.push(course);
        y += H;
    }
    // textures: each visible face takes a cut-out of about its own proportions; neighbours differ
    const used = new Map();
    const pick = (aspect, avoid, kind = 'face') => {
        const scored = faces.map((f, k) => ({ k, f, d: Math.abs(Math.log(f.aspect / aspect)) + r() * .22 + (used.get(k) || 0) * .08 }))
            .filter((s) => s.f.kind === kind).sort((p, q) => (avoid.includes(p.k) - avoid.includes(q.k)) || p.d - q.d);
        const k = scored[0].k; used.set(k, (used.get(k) || 0) + 1); return k;
    };
    for (const c of courses) {
        for (const b of c.blocks) {
            const near = blocks.filter((o) => o !== b && Math.abs(o.course - b.course) <= 1 &&
                o.x0 <= b.x1 + 1e-6 && o.x1 >= b.x0 - 1e-6 && o.z0 <= b.z1 + 1e-6 && o.z1 >= b.z0 - 1e-6);
            const avoid = near.flatMap((o) => [o.tex.front, o.tex.side, o.tex.top]).filter((v) => v !== undefined);
            b.tex.front = pick((b.x1 - b.x0) / c.H, avoid);
            b.tex.side = pick((b.z1 - b.z0) / c.H, [...avoid, b.tex.front]);
            // tops are the weathered upper surfaces of Red Pyramid and Khufu blocks
            b.tex.top = pick((b.x1 - b.x0) / (b.z1 - b.z0), avoid, 'top');
            b.flip = r() < .5;
            b.glint = Array.from({ length: 7 }, () => r());
        }
    }
    const cap = { y0: y, H: capH, B: capB, s: 0, t0: 0, dur: 0, from: 0, to: 0 };
    return { n, h, courses, blocks, widths, cap, top: y };
}

/* ---- drawing ----------------------------------------------------------------------------------------------- */
// a parallelogram face: P0 top-left, P1 top-right, P3 bottom-left, in screen px
function drawQuad(ctx, img, rect, P0, P1, P3, shade, joint, flip) {
    const P2 = [P1[0] + P3[0] - P0[0], P1[1] + P3[1] - P0[1]];
    ctx.save();
    ctx.beginPath(); ctx.moveTo(P0[0], P0[1]); ctx.lineTo(P1[0], P1[1]); ctx.lineTo(P2[0], P2[1]); ctx.lineTo(P3[0], P3[1]); ctx.closePath();
    ctx.clip();
    if (joint) { ctx.fillStyle = joint; ctx.fill(); }
    const ux = P1[0] - P0[0], uy = P1[1] - P0[1], vx = P3[0] - P0[0], vy = P3[1] - P0[1];
    if (flip) ctx.transform(-ux, -uy, vx, vy, P1[0], P1[1]);
    else ctx.transform(ux, uy, vx, vy, P0[0], P0[1]);
    ctx.drawImage(img, rect[0], rect[1], rect[2], rect[3], 0, 0, 1, 1);
    ctx.restore();
    ctx.save();
    ctx.beginPath(); ctx.moveTo(P0[0], P0[1]); ctx.lineTo(P1[0], P1[1]); ctx.lineTo(P2[0], P2[1]); ctx.lineTo(P3[0], P3[1]); ctx.closePath();
    ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = shade; ctx.fill();
    ctx.restore();
}

/* ---- the component ----------------------------------------------------------------------------------------- */
const ASSETS = new URL('./assets/', import.meta.url);
let assetsPromise = null;
function loadAssets(base) {
    if (assetsPromise && !base) return assetsPromise;
    const at = base ? new URL(base, document.baseURI) : ASSETS;
    const img = (n) => new Promise((res, rej) => { const i = new Image(); i.decoding = 'async'; i.onload = () => res(i); i.onerror = rej; i.src = new URL(n, at).href; });
    const p = Promise.all([fetch(new URL('blocks.json', at)).then((r) => r.json()), img('blocks.webp'), img('capstone.webp'), img('mortar.webp')])
        .then(([info, blocks, cap, mortar]) => ({ faces: info.map((f) => ({ rect: f.rect, aspect: f.rect[2] / f.rect[3], kind: f.kind || 'face' })), blocks, cap, mortar }));
    if (!base) assetsPromise = p;
    return p;
}

const LIVE = new Set();
let uid = 0;

export function pyramidSteps(el, options = {}) {
    if (el.__pyramidSteps) return el.__pyramidSteps;
    const ds = el.dataset;
    const opt = {
        layout: options.layout ?? ds.layout ?? 'tower',
        progress: +(options.progress ?? ds.progress ?? .35),
        revisit: options.revisit ?? ds.revisit ?? 'done',
        face: options.face ?? (ds.face !== undefined ? +ds.face : null),
        seed: options.seed ?? (ds.seed !== undefined ? +ds.seed : (Math.random() * 1e9) | 0),
        assets: options.assets ?? ds.assets ?? null,
        speed: +(options.speed ?? ds.speed ?? 1),
    };
    const list = el.querySelector('ol');
    if (!list) return null;
    const items = [...list.children].filter((li) => li.tagName === 'LI');
    const N = items.length;
    if (N < 2) return null;
    const id = `ps${++uid}`;
    let current = items.findIndex((li) => li.getAttribute('aria-current') === 'step');
    if (ds.current !== undefined) current = +ds.current;
    if (options.current !== undefined) current = options.current;
    if (current < 0) current = 0;
    current = clamp(current | 0, 0, N);
    let frac = clamp(opt.progress);
    const face = opt.face === null ? (opt.seed % CAP_FACES + CAP_FACES) % CAP_FACES : ((opt.face % 4) + 4) % 4;

    // ---- DOM: the list stays the list; labels become buttons where a step can be revisited
    const saved = items.map((li) => li.innerHTML);
    const savedAttrs = { cls: el.className };
    el.classList.add('ps', `ps--${opt.layout}`);
    list.classList.add('ps-steps');
    const canvas = document.createElement('canvas');
    canvas.className = 'ps-canvas'; canvas.setAttribute('aria-hidden', 'true');
    const frame = document.createElement('div'); frame.className = 'ps-frame'; frame.setAttribute('aria-hidden', 'true');
    frame.appendChild(canvas);
    el.insertBefore(frame, list);
    const live = document.createElement('div');
    live.className = 'ps-sr'; live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite');
    el.appendChild(live);
    const labels = items.map((li, i) => {
        li.classList.add('ps-step');
        const own = li.querySelector('a[href],button');
        if (own) { own.classList.add('ps-label'); return { li, el: own, own: true, text: own.textContent.trim() }; }
        const text = li.textContent.trim();
        li.textContent = '';
        // a revisitable step is a button; any other is plain text (a span), never a disabled button
        const b = document.createElement('button'); b.type = 'button'; b.className = 'ps-label';
        const sp = document.createElement('span'); sp.className = 'ps-label';
        const t = document.createElement('span'); t.className = 'ps-text'; t.textContent = text;
        const st = document.createElement('span'); st.className = 'ps-sr ps-state';
        sp.append(t, st); li.appendChild(sp);
        b.addEventListener('click', () => select(i));
        return { li, el: sp, btn: b, span: sp, own: false, text, st };
    });
    const onOwnClick = (i) => (e) => {
        const ev = new CustomEvent('pyramid-steps:select', { bubbles: true, cancelable: true, detail: { index: i } });
        el.dispatchEvent(ev);
        if (ev.defaultPrevented) e.preventDefault();
    };
    const ownHandlers = labels.map((l, i) => { if (!l.own) return null; const f = onOwnClick(i); l.el.addEventListener('click', f); return f; });

    function select(i) {
        const ev = new CustomEvent('pyramid-steps:select', { bubbles: true, cancelable: true, detail: { index: i } });
        el.dispatchEvent(ev);
        if (!ev.defaultPrevented && revisitable(i)) go(i);
    }
    const revisitable = (i) => i !== current && (opt.revisit === 'all' || (opt.revisit === 'done' && i < current));

    function syncDOM(announce) {
        labels.forEach((l, i) => {
            const state = i < current ? 'done' : i === current ? 'current' : 'todo';
            l.li.dataset.state = state;
            if (state === 'current') l.li.setAttribute('aria-current', 'step'); else l.li.removeAttribute('aria-current');
            if (!l.own) {
                const want = revisitable(i) ? l.btn : l.span;
                if (l.el !== want) {
                    const hadFocus = l.li.contains(document.activeElement);
                    while (l.el.firstChild) want.appendChild(l.el.firstChild);
                    l.el.replaceWith(want); l.el = want;
                    if (hadFocus) { if (want === l.span) want.tabIndex = -1; want.focus({ preventScroll: true }); }
                }
                l.st.textContent = state === 'done' ? ', done' : state === 'current' ? ', current step' : '';
            }
        });
        el.dataset.complete = current >= N ? 'true' : 'false';
        if (announce) live.textContent = current >= N ? `All ${N} steps done` : `Step ${current + 1} of ${N}: ${labels[current].text}`;
    }

    // ---- model
    let A = null;                     // assets
    let M = null;                     // model
    let W = 0, Hc = 0, dpr = 1, scale = 1, ox = 0, oy = 0;
    let ctx = null, staticLayer = null, staticKey = '';
    let raf = 0, visible = true, alive = true;

    function targetPlaced(course) { return course < current ? M.courses[course].blocks.length : course === current ? Math.round(frac * M.courses[course].blocks.length) : 0; }

    // schedule every block toward where the state says it should be: arrivals bottom course first, front rows
    // first; departures top course first, last laid first lifted
    function schedule(instant) {
        if (!M) return;
        const now = performance.now();
        const arrive = [], leave = [];
        for (const c of M.courses) {
            const k = targetPlaced(c.i);
            for (const b of c.blocks) {
                const want = b.order < k ? 1 : 0;
                if (b.to !== want) (want ? arrive : leave).push(b);
            }
        }
        leave.sort((p, q) => q.course - p.course || q.order - p.order);
        arrive.sort((p, q) => p.course - q.course || p.order - q.order);
        const capWant = current >= N ? 1 : 0;
        const moves = leave.length + arrive.length + (capWant !== M.cap.to ? 1 : 0);
        const reduce = instant || calm.matches;
        const gap = clamp(1500 / Math.max(1, moves), 60, 200) / opt.speed;
        let t = now;
        const start = (o, want, dur) => {
            o.from = o.s; o.to = want; o.t0 = t; o.dur = reduce ? 0 : dur * Math.abs(want - o.s) / opt.speed;
            if (reduce) o.s = want;
            t += reduce ? 0 : gap;
        };
        if (capWant === 0 && M.cap.to === 1) start(M.cap, 0, 1100);
        for (const b of leave) start(b, 0, 760);
        for (const b of arrive) start(b, 1, 820);
        if (capWant === 1 && M.cap.to === 0) { t += reduce ? 0 : 160; start(M.cap, 1, 1400); }
        kick();
    }

    function step(now) {
        let moving = false;
        const upd = (o) => {
            if (o.s === o.to) return;
            if (o.dur <= 0 || now >= o.t0 + o.dur) { o.s = o.to; o.done = true; return; }
            moving = true;
            if (now < o.t0) return;
            o.s = mix(o.from, o.to, (now - o.t0) / o.dur);
        };
        for (const b of M.blocks) {
            const was = b.s; upd(b);
            if (was !== 1 && b.s === 1) laid(b);
        }
        const cw = M.cap.s; upd(M.cap);
        if (cw !== 1 && M.cap.s === 1) el.dispatchEvent(new CustomEvent('pyramid-steps:capstone', { bubbles: true }));
        return moving;
    }
    function laid(b) {
        const c = M.courses[b.course];
        if (c.blocks.every((o) => o.s === 1)) el.dispatchEvent(new CustomEvent('pyramid-steps:laid', { bubbles: true, detail: { course: c.i } }));
    }

    function kick() {
        if (!raf && alive) raf = requestAnimationFrame(frameLoop);
    }
    function frameLoop(now) {
        raf = 0;
        if (!M || !ctx) return;
        const moving = step(now);
        draw();
        if (moving && visible) raf = requestAnimationFrame(frameLoop);
    }

    // ---- where a block is, from its progress s (0 out, 1 home): hauled up the ramp at the back corner, where
    // the pyramid hides it, over the corner onto the bed, then dragged straight across the wet bed to its place
    function blockPose(b) {
        const c = M.courses[b.course];
        if (b.s >= 1) return { dx: 0, dz: 0, dy: 0, behind: false };
        const hx = (b.x0 + b.x1) / 2, hz = (b.z0 + b.z1) / 2, bw = b.x1 - b.x0, bd = b.z1 - b.z0;
        const ax = -c.W / 2 + bw / 2, az = -c.W / 2 + bd / 2;     // set down in the back corner of the bed
        const rx = ax - .75 * c.H, rz = az - .75 * c.H;           // lower on the ramp, behind the corner
        const s = b.s, sr = .34;
        let x, z, dy;
        if (s < sr) { const u = easeInOut(s / sr); x = mix(rx, ax, u); z = mix(rz, az, u); dy = mix(-.7 * c.H, 0, u); }
        else { const u = easeOut((s - sr) / (1 - sr)); x = mix(ax, hx, u); z = mix(az, hz, u); dy = 0; }
        return { dx: x - hx, dz: z - hz, dy, behind: dy < -1e-4 };
    }
    function capPose() {
        const c = M.cap, s = c.s;
        if (s >= 1) return { dx: 0, dz: 0, dy: 0, behind: false };
        const sr = .4, H = M.h[M.n - 1];
        const a = -c.B * .45, r0 = a - .8 * H;
        let p, dy;
        if (s < sr) { const u = easeInOut(s / sr); p = mix(r0, a, u); dy = mix(-.75 * H, 0, u); }
        else { const u = easeOut((s - sr) / (1 - sr)); p = mix(a, 0, u); dy = 0; }
        return { dx: p, dz: p, dy, behind: dy < -1e-4 };
    }

    const S = (x, y, z) => { const p = proj(x, y, z); return [ox + p[0] * scale, oy + p[1] * scale]; };

    function drawBlock(g, b, pose) {
        const x0 = b.x0 + pose.dx, x1 = b.x1 + pose.dx, z0 = b.z0 + pose.dz, z1 = b.z1 + pose.dz;
        const y0 = b.y0 + pose.dy, y1 = b.y1 + pose.dy;
        const F = A.faces;
        const j = jointFill;
        // front (+z), side (+x), top
        drawQuad(g, A.blocks, F[b.tex.front].rect, S(x0, y1, z1), S(x1, y1, z1), S(x0, y0, z1), rgb(SHADE.front), j.front, b.flip);
        drawQuad(g, A.blocks, F[b.tex.side].rect, S(x1, y1, z1), S(x1, y1, z0), S(x1, y0, z1), rgb(SHADE.side), j.side, !b.flip);
        drawQuad(g, A.blocks, F[b.tex.top].rect, S(x0, y1, z0), S(x1, y1, z0), S(x0, y1, z1), rgb(SHADE.top), j.top, b.flip);
        // the worn front arris catches the low sun: a broken hairline, never a ruled one
        if (scale > 60) {
            const a = S(x0, y1, z1), e = S(x1, y1, z1), n = 7;
            g.save(); g.lineWidth = Math.max(1, scale * .008); g.lineCap = 'round';
            for (let k = 0; k < n; k++) {
                const t0 = k / n + .02, t1 = (k + 1) / n - .02, w = b.glint[k];
                if (w < .15) continue;
                g.strokeStyle = `rgba(255,240,214,${(.34 * w).toFixed(3)})`;
                g.beginPath(); g.moveTo(mix(a[0], e[0], t0), mix(a[1], e[1], t0) + .6); g.lineTo(mix(a[0], e[0], t1), mix(a[1], e[1], t1) + .6); g.stroke();
            }
            g.restore();
        }
    }
    // the shadow a box throws on the horizontal plane y = yb, with the sun SUN
    function boxShadow(g, x0, x1, z0, z1, y0, y1, yb, add) {
        const k = (y1 - yb) / SUN[1];
        const pts = [];
        for (const [x, z] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]) {
            pts.push([x, z]);
            pts.push([x - SUN[0] * k, z - SUN[2] * k]);
        }
        const hull = convexHull(pts);
        if (!add) g.beginPath();
        hull.forEach(([x, z], i) => { const p = S(x, yb, z); i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); });
        g.closePath();
        if (!add) g.fill();
    }
    // what is built throws one shadow on the paper it stands on (y = 0): the union of every block's and the
    // capstone's, a warm grey, a little soft at the edge as a sun shadow is
    function drawGround(g, pose, cp) {
        g.save(); g.beginPath();
        let any = false;
        for (const b of M.blocks) {
            if (b.s <= 0) continue; const p = pose.get(b); if (p.behind) continue;
            boxShadow(g, b.x0 + p.dx, b.x1 + p.dx, b.z0 + p.dz, b.z1 + p.dz, 0, b.y1 + p.dy, 0, true); any = true;
        }
        if (M.cap.s > 0 && !cp.behind) {
            const c = M.cap, h = c.B / 2, k = (c.y0 + c.H) / SUN[1];
            const pts = [[-h + cp.dx, -h + cp.dz], [h + cp.dx, -h + cp.dz], [h + cp.dx, h + cp.dz], [-h + cp.dx, h + cp.dz], [cp.dx - SUN[0] * k, cp.dz - SUN[2] * k]];
            convexHull(pts).forEach(([x, z], i) => { const p = S(x, 0, z); i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); });
            g.closePath(); any = true;
        }
        if (any) {
            // full at the foot, gone by about two thirds of its length: a shadow on paper, not a slab across the page
            const k = (M.cap.y0 + M.cap.H) / SUN[1];
            const p0 = S(0, 0, 0), p1 = S(-SUN[0] * k * .62, 0, -SUN[2] * k * .62);
            const grad = g.createLinearGradient(p0[0], p0[1], p1[0], p1[1]);
            grad.addColorStop(0, 'rgb(219,211,197)'); grad.addColorStop(.35, 'rgb(229,223,212)'); grad.addColorStop(1, 'rgb(255,255,255)');
            g.globalCompositeOperation = 'multiply';
            g.filter = `blur(${Math.max(.5, scale * .01).toFixed(1)}px)`;
            g.fillStyle = grad; g.fill('nonzero');
        }
        g.restore();
    }
    // the courses still to come, set out in hairline on the paper, as an elevation is drawn
    function drawPlan(g, from) {
        g.save();
        g.lineWidth = Math.max(1, dpr * .75); g.lineJoin = 'round';
        g.strokeStyle = 'rgba(138,133,125,.55)';
        const line = (...pts) => { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke(); };
        for (let i = from; i < M.n; i++) {
            const c = M.courses[i], h = c.W / 2;
            const a = S(-h, c.y1, h), b = S(h, c.y1, h), d = S(h, c.y1, -h), e = S(-h, c.y1, -h);
            const a0 = S(-h, c.y0, h), b0 = S(h, c.y0, h), d0 = S(h, c.y0, -h);
            line(a0, a, b, d, d0); line(a, e, d); line(b, b0); line(a0, b0, d0);
        }
        if (M.cap.s < 1) {
            const c = M.cap, h = c.B / 2, ap = S(0, c.y0 + c.H, 0);
            line(S(-h, c.y0, h), ap, S(h, c.y0, -h)); line(S(h, c.y0, h), ap);
        }
        g.restore();
    }
    function bedClip(g, c, yb) {
        const h = c.W / 2;
        const a = S(-h, yb, -h), b = S(h, yb, -h), d = S(h, yb, h), e = S(-h, yb, h);
        g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(d[0], d[1]); g.lineTo(e[0], e[1]); g.closePath(); g.clip();
    }
    let jointFill = {}, mortar = null;
    // the bed of course c (the top of the course below) spread with mortar where c is still to be laid
    function drawBed(g, c) {
        if (!mortar || c.i === 0) return;
        const h = c.W / 2, yb = c.y0;
        const a = S(-h, yb, -h), b = S(h, yb, -h), e = S(-h, yb, h);
        // map the pattern onto the bed plane: one tile about a block across
        const k = (c.H * 1.3) / 1024;
        const m = new DOMMatrix([(b[0] - a[0]) / (c.W) * k, (b[1] - a[1]) / (c.W) * k, (e[0] - a[0]) / (c.W) * k, (e[1] - a[1]) / (c.W) * k, a[0], a[1]]);
        mortar.setTransform(m);
        g.save(); bedClip(g, c, yb);
        g.globalAlpha = .38; g.fillStyle = mortar; g.fillRect(0, 0, W, Hc);
        g.globalAlpha = 1; g.globalCompositeOperation = 'multiply'; g.fillStyle = rgb(SHADE.top); g.fillRect(0, 0, W, Hc);
        g.restore();
    }
    function sortBlocks(arr, poses) {
        return arr.map((b, k) => [b, poses[k]]).sort((p, q) =>
            depth((p[0].x0 + p[0].x1) / 2 + p[1].dx, 0, (p[0].z0 + p[0].z1) / 2 + p[1].dz) -
            depth((q[0].x0 + q[0].x1) / 2 + q[1].dx, 0, (q[0].z0 + q[0].z1) / 2 + q[1].dz));
    }
    // a course and the shadows it throws on the course below
    function drawCourse(g, c, list) {
        if (c.i > 0) {
            const below = M.courses[c.i - 1];
            g.save(); bedClip(g, below, c.y0);
            g.globalCompositeOperation = 'multiply'; g.fillStyle = rgb(SHADE.cast);
            for (const [b, p] of list) boxShadow(g, b.x0 + p.dx, b.x1 + p.dx, b.z0 + p.dz, b.z1 + p.dz, b.y0 + p.dy, b.y1 + p.dy, c.y0);
            g.restore();
        }
        for (const [b, p] of list) drawBlock(g, b, p);
    }

    function drawCap(g) {
        const c = M.cap, p = capPose();
        const half = c.B / 2, y0 = c.y0 + p.dy, y1 = y0 + c.H, dz = p.dz, dx = p.dx;
        // texture triangle in the atlas: tile k at x = k * 642, 640 x 906; base along the bottom, apex at top middle
        const tile = (k) => [(k % 4) * 642, 0, 640, 906];
        const tri = (k, BL, BR, AP, shade) => {
            const [tx, ty, tw, th] = tile(k);
            g.save();
            g.beginPath(); g.moveTo(BL[0], BL[1]); g.lineTo(BR[0], BR[1]); g.lineTo(AP[0], AP[1]); g.closePath(); g.clip();
            // affine: (0,th)->BL, (tw,th)->BR, (tw/2,0)->AP
            const ax = (BR[0] - BL[0]) / tw, ay = (BR[1] - BL[1]) / tw;
            const mx = (BL[0] + BR[0]) / 2, my = (BL[1] + BR[1]) / 2;
            const bx = (mx - AP[0]) / th, by = (my - AP[1]) / th;
            const ex = AP[0] - ax * tw / 2, ey = AP[1] - ay * tw / 2;
            g.transform(ax, ay, bx, by, ex, ey);
            g.drawImage(A.cap, tx, ty, tw, th, 0, 0, tw, th);
            g.restore();
            g.save();
            g.beginPath(); g.moveTo(BL[0], BL[1]); g.lineTo(BR[0], BR[1]); g.lineTo(AP[0], AP[1]); g.closePath();
            g.globalCompositeOperation = 'multiply'; g.fillStyle = rgb(shade); g.fill();
            g.restore();
        };
        const apex = S(dx, y1, dz);
        tri(face, S(-half + dx, y0, half + dz), S(half + dx, y0, half + dz), apex, SHADE.capFront);
        tri((face + 1) % 4, S(half + dx, y0, half + dz), S(half + dx, y0, -half + dz), apex, SHADE.capSide);
    }

    function layout() {
        if (!M) return;
        const rect = frame.getBoundingClientRect();
        const cssW = Math.max(1, rect.width), cssH = Math.max(1, rect.height);
        // the canvas reaches past the frame on the right, where the shadow falls on the paper
        const spill = Math.round(cssW * .5);
        dpr = Math.min(2, window.devicePixelRatio || 1);
        // fit the finished pyramid (capstone included), with room for a block cresting the far edge
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        const add = (x, y, z) => { const p = proj(x, y, z); x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); };
        const w0 = M.widths[0] / 2;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(sx * w0, 0, sz * w0);
        add(0, M.cap.y0 + M.cap.H, 0);
        for (const c of M.courses) { const h = c.W / 2; for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(sx * h, c.y1, sz * h); }
        const pad = .04 * (x1 - x0);
        scale = Math.min((cssW - 2) * dpr / (x1 - x0 + 2 * pad), (cssH - 2) * dpr / (y1 - y0 + 2 * pad));
        W = Math.round((cssW + spill) * dpr); Hc = Math.round(cssH * dpr);
        canvas.width = W; canvas.height = Hc;
        canvas.style.width = (cssW + spill) + 'px'; canvas.style.height = cssH + 'px';
        ox = cssW * dpr / 2 - (x0 + x1) / 2 * scale;
        oy = Hc - pad * scale - y1 * scale;
        ctx = canvas.getContext('2d');
        // joints: the stone itself, deep in the shade of the joint (the face's own light is multiplied on after)
        jointFill = { front: rgb(STONE.map((v) => v * .42)), side: rgb(STONE.map((v) => v * .55)), top: rgb(STONE.map((v) => v * .5)) };
        // the bed of the course being laid is spread with gypsum mortar: the Met's sample from the Great Pyramid
        mortar = ctx.createPattern(A.mortar, 'repeat');
        staticKey = '';
        placeLabels();
        draw();
    }

    function placeLabels() {
        if (opt.layout !== 'tower' || !M) return;
        const fr = frame.getBoundingClientRect();
        labels.forEach((l, i) => {
            const lr = l.li.getBoundingClientRect();
            const c = M.courses[i];
            const h = c.W / 2;
            // the right silhouette edge of the course is its back-right corner (+x, -z)
            const p = S(h, (c.y0 + c.y1) / 2, -h);
            const yCss = p[1] / dpr + fr.top - list.getBoundingClientRect().top;
            const edge = p[0] / dpr + fr.left;
            l.li.style.setProperty('--y', `${yCss.toFixed(1)}px`);
            l.li.style.setProperty('--lead', `${Math.max(0, lr.left - 6 - edge - 10).toFixed(1)}px`);
        });
    }

    function draw() {
        if (!ctx || !M) return;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, W, Hc);
        const poses = M.blocks.map(blockPose);
        const pose = new Map(M.blocks.map((b, k) => [b, poses[k]]));
        const cp = capPose();
        let m = 0;
        while (m < M.n && M.courses[m].blocks.every((b) => b.s === 1)) m++;
        // 0. the shadow on the paper, and the courses still to come set out in hairline
        drawGround(ctx, pose, cp);
        drawPlan(ctx, m);
        // 1. what is still on the ramp, behind the pyramid
        const behind = M.blocks.filter((b) => b.s > 0 && pose.get(b).behind);
        for (const [b, p] of sortBlocks(behind, behind.map((b) => pose.get(b)))) drawBlock(ctx, b, p);
        if (M.cap.s > 0 && cp.behind) drawCap(ctx);
        // 2. courses fully home and still, from a cached layer
        const key = `${m}|${W}x${Hc}`;
        if (key !== staticKey) {
            staticLayer = staticLayer || document.createElement('canvas');
            staticLayer.width = W; staticLayer.height = Hc;
            const g = staticLayer.getContext('2d');
            g.clearRect(0, 0, W, Hc);
            for (let i = 0; i < m; i++) {
                const c = M.courses[i];
                drawCourse(g, c, sortBlocks(c.blocks, c.blocks.map(() => ({ dx: 0, dz: 0, dy: 0 }))));
            }
            staticKey = key;
        }
        ctx.drawImage(staticLayer, 0, 0);
        // 3. the courses still being laid (or lifted)
        for (let i = m; i < M.n; i++) {
            const c = M.courses[i];
            const here = c.blocks.filter((b) => b.s > 0 && !pose.get(b).behind);
            const open = i === current || (here.length && here.length < c.blocks.length);
            if (open && i <= m) drawBed(ctx, c);
            if (!here.length) continue;
            drawCourse(ctx, c, sortBlocks(here, here.map((b) => pose.get(b))));
        }
        // 4. the capstone, once it is up on the platform
        if (M.cap.s > 0 && !cp.behind) drawCap(ctx);
    }

    // ---- state changes
    function setCurrent(n, instant) {
        n = clamp(n | 0, 0, N);
        if (n === current) return;
        const prev = current;
        current = n;
        frac = clamp(opt.progress);
        syncDOM(true);
        schedule(instant);
        el.dispatchEvent(new CustomEvent('pyramid-steps:change', { bubbles: true, detail: { current, previous: prev, complete: current >= N } }));
    }
    function go(n) { setCurrent(n); }
    function next() { setCurrent(current + 1); }
    function back() { setCurrent(current - 1); }
    function progress(f) { frac = clamp(+f || 0); schedule(); }

    // ---- life cycle
    const ro = new ResizeObserver(() => layout());
    const io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) kick(); });
    const onCalm = () => schedule(true);
    syncDOM(false);
    loadAssets(opt.assets).then((a) => {
        if (!alive) return;
        A = a;
        M = build(N, opt.seed, A.faces);
        // the state at load is drawn as it stands, no laying
        for (const c of M.courses) { const k = targetPlaced(c.i); for (const b of c.blocks) b.s = b.to = b.order < k ? 1 : 0; }
        M.cap.s = M.cap.to = current >= N ? 1 : 0;
        el.classList.add('ps--live');
        ro.observe(frame); io.observe(el);
        calm.addEventListener('change', onCalm);
        layout();
    }).catch((e) => { console.warn('pyramid-steps: could not start, keeping the list', e); });

    const api = {
        next, back, go, progress,
        complete: () => setCurrent(N),
        get current() { return current; },
        get length() { return N; },
        get done() { return current >= N; },
        destroy() {
            alive = false; cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); calm.removeEventListener('change', onCalm);
            labels.forEach((l, i) => { if (l.own) { l.el.removeEventListener('click', ownHandlers[i]); l.el.classList.remove('ps-label'); } });
            items.forEach((li, i) => { if (!labels[i].own) li.innerHTML = saved[i]; li.classList.remove('ps-step'); delete li.dataset.state; li.style.removeProperty('--y'); li.style.removeProperty('--lead'); });
            items.forEach((li, i) => { if (i === Math.min(current, N - 1) && current < N) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current'); });
            frame.remove(); live.remove(); list.classList.remove('ps-steps');
            el.className = savedAttrs.cls; delete el.dataset.complete;
            delete el.__pyramidSteps; LIVE.delete(api);
        },
    };
    el.__pyramidSteps = api;
    LIVE.add(api);
    return api;
}

function convexHull(pts) {
    const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], hi = [];
    for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (const q of p.reverse()) { while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
    return lo.slice(0, -1).concat(hi.slice(0, -1));
}

function auto() {
    document.querySelectorAll('[data-pyramid-steps]').forEach((el) => pyramidSteps(el));
}
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto, { once: true });
    else auto();
}

/** for tests only: the model builder */
export const _model = { build, courseHeights };
