/* paper-theatre — a Victorian toy theatre set in front of you as you scroll.
 *
 *   <section data-paper-theatre data-src="assets/stage.json">
 *     <div class="pt-stage"><img class="pt-img" src="assets/scene.webp" alt="" aria-hidden="true"></div>
 *   </section>
 *
 * The stage opens empty: a bare back wall inside the proscenium. Then it is set the
 * way a toy theatre was: the backcloth let down from the flies, the set piece (the
 * temple on its island) slid on along its groove, the side wings pushed in from left
 * and right, the birds lowered on threads, the boat and the heron pushed on, the
 * ground row of reeds raised from the front slot. Every piece is a card cut out of
 * an engraved sheet; it is absent until its turn, comes on from where a stagehand
 * would bring it, and stops on its mark. Last, the footlights come up and each card
 * throws its shadow back onto the
 * scene behind it. Scroll back and the stage is struck in reverse.
 *
 * Pointer (or tilt on a phone) moves your eye: near cards slide against far ones.
 *
 * Options (data-* or the options object, which wins):
 *   src      the stage JSON (required); images are named in it, beside it
 *   mode     'scroll' (default: a pinned stage on a runway) | 'static' (the set stage)
 *   runway   section height in svh (default 440)
 *
 * Events (bubbling, for sound later): 'paper-theatre:piece' {name, enter} as each
 * piece starts to come on while scrolling forward, 'paper-theatre:lamps' when the
 * footlights come up, and 'paper-theatre:done' when the stage is set.
 */
import tilt from './tilt.js';

const calm = matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = matchMedia('(pointer: fine)');
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
// a hand pushing a card along a groove: it starts gently, travels, and slows onto its mark
const push = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function loadImage(url) {
    return new Promise((res, rej) => {
        const im = new Image();
        im.decoding = 'async';
        im.onload = () => (im.decode ? im.decode().catch(() => {}).then(() => res(im)) : res(im));
        im.onerror = () => rej(new Error('paper-theatre: could not load ' + url));
        im.src = url;
    });
}

/* ── Where each piece is at a given point in the scroll ─────────────────────
 * Pure functions of p (0..1), so scrolling back strikes the stage exactly. */
function entrance(piece, p, W, H) {
    const [w0, w1] = piece.window;
    const u = clamp((p - w0) / (w1 - w0));
    if (u <= 0) return null;                       // not on yet: absent
    const e = push(u), r = 1 - e;
    let dx = 0, dy = 0;
    switch (piece.enter) {
        case 'left': dx = -(piece.x + piece.w + 60) * r; break;
        case 'right': dx = (W - piece.x + 60) * r; break;
        case 'rise': dy = (H - piece.y + 60) * r; break;
        case 'fly': dy = -(piece.y + piece.h + 80) * r; break;   // let down from the flies
    }
    return { u, dx, dy };
}

/* The camera: on a wide screen the whole proscenium; on a phone it goes in and
 * follows what is being set, and pulls back for the lamps. A pure function of p,
 * smoothed along p, so it never jumps. */
function cameraAt(stage, p, zMax, zEnd) {
    const W = stage.width, H = stage.height;
    // look at the piece that came on most recently and is still being set
    const look = [{ x: W / 2, window: stage.backcloth.window }, ...stage.pieces.map((q) => ({ x: q.x + q.w / 2, window: q.window }))];
    let target = null, wgt = 0;
    for (const l of look) {
        const [a, b] = l.window;
        const w = smooth(a - 0.03, a + 0.02, p) * (1 - smooth(b + 0.01, b + 0.06, p));
        if (w > 0 && (!target || a > target.window[0])) { target = l; wgt = w; }
    }
    const lamps = stage.light.window[0];
    const busy = clamp(wgt) * (1 - smooth(lamps - 0.04, lamps + 0.02, p));
    const z = mix(zEnd, zMax, busy);
    // only pans sideways: on a phone the whole height of the opening is in view
    const cx = mix(W / 2, target ? target.x : W / 2, busy);
    const cy = H / 2;
    // keep the view inside the proscenium
    const hw = W / (2 * z), hh = H / (2 * z);
    return { x: clamp(cx, hw, W - hw), y: clamp(cy, hh, H - hh), z };
}

export function paperTheatre(root, options = {}) {
    const ds = root.dataset;
    const opts = {
        src: options.src || ds.src,
        mode: options.mode || ds.mode || 'scroll',
        runway: +(options.runway || ds.runway || 440),
    };
    if (!opts.src) throw new Error('paper-theatre: data-src is required');
    const base = new URL(opts.src, document.baseURI);
    const stageEl = root.querySelector('.pt-stage') || root;
    root.classList.add('pt');
    if (opts.mode === 'scroll') root.classList.add('pt-scroll');
    root.style.setProperty('--pt-runway', opts.runway + 'svh');

    let alive = true, raf = 0, visible = true, ready = false;
    let canvas = null, ctx = null, stage = null;
    const img = {}, shade = {};
    const cleanups = [];
    const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); cleanups.push(() => t.removeEventListener(ev, fn, o)); };

    // state
    let pT = 0, pS = 0, pV = 0;                    // scroll progress: target, spring, velocity
    const eye = { x: 0, y: 0, tx: 0, ty: 0 };      // where the viewer's eye is (-1..1)
    let lastT = 0, lastFired = -1, cssW = 0, cssH = 0, dpr = 1, fit = null;

    function measure() {
        const r = root.getBoundingClientRect();
        if (opts.mode !== 'scroll') { pT = 1; return; }
        const travel = r.height - innerHeight;
        pT = travel > 0 ? clamp(-r.top / travel) : 1;
    }

    function layout() {
        if (!canvas) return;
        const r = stageEl.getBoundingClientRect();
        cssW = r.width; cssH = r.height;
        dpr = Math.min(2, devicePixelRatio || 1);
        canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
        const narrow = cssW < 640;
        const padX = narrow ? 6 : Math.max(16, cssW * 0.04), padY = narrow ? 0 : Math.max(16, cssH * 0.07);
        const W = stage.width, H = stage.height;
        const s0 = Math.min((cssW - 2 * padX) / W, (cssH - 2 * padY) / H);
        // on a phone the opening is a letterbox; go in until it fills about 60% of the height
        const zMax = cssW / cssH < 1.1 ? clamp((0.6 * cssH) / (H * s0), 1, 2.3) : 1;
        // the set stage at the end: a little in, so the scene still reads (the wings crop)
        fit = { s0, zMax, zEnd: Math.min(zMax, 1.25), ox: cssW / 2, oy: cssH / 2 };
    }

    function wake() { if (!raf && alive && visible && ready) { lastT = 0; raf = requestAnimationFrame(frame); } }

    function frame(t) {
        raf = 0;
        const dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 1 / 60;
        lastT = t;
        // scroll on a critically damped spring (quicker going back)
        const w = pT < pS ? 11 : 7.5;
        const a = w * w * (pT - pS) - 2 * w * pV;
        pV += a * dt; pS += pV * dt;
        if (Math.abs(pT - pS) < 1e-4 && Math.abs(pV) < 1e-4) { pS = pT; pV = 0; }
        // the eye follows pointer or tilt
        if (tilt.active) { eye.tx = tilt.x; eye.ty = tilt.y * 0.6; }
        const ke = 1 - Math.exp(-dt / 0.18);
        eye.x += (eye.tx - eye.x) * ke; eye.y += (eye.ty - eye.y) * ke;
        draw();
        fire();
        const still = pS === pT && Math.abs(eye.tx - eye.x) < 1e-3 && Math.abs(eye.ty - eye.y) < 1e-3;
        if (!still || tilt.active) raf = requestAnimationFrame(frame);
    }

    function fire() {
        // events only going forward, once per crossing
        const marks = [...stage.pieces.map((q) => [q.window[0], 'piece', { name: q.name, enter: q.enter }]), [stage.light.window[0], 'lamps'], [stage.light.window[1], 'done']];
        for (const [m, kind, detail] of marks) {
            if (lastFired < m && pS >= m) {
                root.dispatchEvent(new CustomEvent('paper-theatre:' + kind, { bubbles: true, detail }));
            }
        }
        lastFired = pS;
    }

    /* ── Drawing ────────────────────────────────────────────────────────────── */
    function draw() {
        const W = stage.width, H = stage.height, p = pS;
        const g = ctx;
        // camera, smoothed along p
        let cx = 0, cy = 0, cz = 0;
        for (let i = -3; i <= 3; i++) { const c = cameraAt(stage, clamp(p + i * 0.006), fit.zMax, fit.zEnd); cx += c.x; cy += c.y; cz += c.z; }
        cx /= 7; cy /= 7; cz /= 7;
        const s = fit.s0 * cz;
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, canvas.width, canvas.height);
        // stage units -> device px
        g.setTransform(s * dpr, 0, 0, s * dpr, (fit.ox - cx * s) * dpr, (fit.oy - cy * s) * dpr);

        // the opening: the back wall of an empty stage
        g.save();
        g.beginPath(); g.rect(0, 0, W, H); g.clip();
        g.fillStyle = stage.wall; g.fillRect(0, 0, W, H);

        const L = stage.light;
        const lamps = smooth(L.window[0], L.window[1], p);
        const shadowA = 0.07 + 0.17 * lamps;          // house light at first, then the footlights
        const par = (z) => ({ x: eye.x * 46 * (1 - z), y: eye.y * 20 * (1 - z) });   // far things move with your eye

        // backcloth, let down from the flies
        const bc = stage.backcloth;
        const ub = smooth(bc.window[0], bc.window[1], p);
        if (ub > 0) {
            const e = push(ub);
            const bw = W * bc.over, bh = H * bc.over, o = par(0);
            const bx = (W - bw) / 2 + o.x, by = (H - bh) / 2 + o.y - (bh + 40) * (1 - e);
            g.drawImage(img.backcloth, bx, by, bw, bh);
            if (ub < 1) {                                 // its batten and the lines it hangs from
                g.fillStyle = 'rgba(40,46,38,.55)'; g.fillRect(bx, by + bh - 6, bw, 6);
            }
        }

        for (const q of stage.pieces) {
            const at = entrance(q, p, W, H);
            if (!at) continue;                             // not on yet: absent
            const o = par(q.z);
            const x = q.x + at.dx + o.x, y = q.y + at.dy + o.y;
            g.save();
            if (q.enter === 'fly') {                       // the thread it hangs from, straight down
                const tx = x + q.w / 2;
                g.strokeStyle = 'rgba(30,38,30,.42)'; g.lineWidth = 1.4 / (fit.s0 * cz);
                g.beginPath(); g.moveTo(tx, -260); g.lineTo(tx, y + q.h * 0.3); g.stroke();
            }
            // its shadow, thrown back from the footlights onto the scene behind it
            const k = L.z / (L.z - q.z);
            const pad = q.shadowPad;
            const sx = L.x + (x - pad - L.x) * k, sy = L.y + (y - pad - L.y) * k;
            g.globalAlpha = shadowA * (0.55 + 0.45 * at.u);
            g.drawImage(shade[q.name], sx, sy, (q.w + 2 * pad) * k, (q.h + 2 * pad) * k);
            g.globalAlpha = 1;
            g.drawImage(img[q.name], x, y, q.w, q.h);
            g.restore();
        }

        // footlights: the stage brighter low down and warmer, as the lamps come up
        if (lamps > 0) {
            const gr = g.createLinearGradient(0, 0, 0, H);
            gr.addColorStop(0, `rgba(48,40,22,${0.10 * lamps})`);
            gr.addColorStop(0.65, 'rgba(48,40,22,0)');
            g.fillStyle = gr; g.globalCompositeOperation = 'multiply'; g.fillRect(0, 0, W, H);
            const gl = g.createRadialGradient(L.x, H * 1.08, 0, L.x, H * 1.08, W * 0.62);
            gl.addColorStop(0, `rgba(255,214,150,${0.16 * lamps})`);
            gl.addColorStop(1, 'rgba(255,214,150,0)');
            g.fillStyle = gl; g.globalCompositeOperation = 'soft-light'; g.fillRect(0, 0, W, H);
            g.globalCompositeOperation = 'source-over';
        }
        g.restore();

        // the proscenium's edge: a fine double rule round the opening
        g.strokeStyle = 'rgba(20,19,18,.55)'; g.lineWidth = 2 / (fit.s0 * cz);
        g.strokeRect(-6, -6, W + 12, H + 12);
        g.strokeStyle = 'rgba(20,19,18,.25)'; g.lineWidth = 1 / (fit.s0 * cz);
        g.strokeRect(-16, -16, W + 32, H + 32);
    }

    /* ── Start ─────────────────────────────────────────────────────────────── */
    async function start() {
        stage = await (await fetch(base)).json();
        const urls = { backcloth: stage.backcloth.src };
        for (const q of stage.pieces) urls[q.name] = q.src;
        const jobs = Object.entries(urls).map(([n, u]) => loadImage(new URL(u, base)).then((im) => { img[n] = im; }));
        for (const q of stage.pieces) jobs.push(loadImage(new URL(q.shadow, base)).then((im) => { shade[q.name] = im; }));
        await Promise.all(jobs);
        if (!alive) return;
        canvas = document.createElement('canvas');
        canvas.className = 'pt-canvas';
        canvas.setAttribute('aria-hidden', 'true');
        stageEl.appendChild(canvas);
        ctx = canvas.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        root.classList.add('is-live');
        layout(); measure();
        pS = pT; lastFired = pS;
        ready = true;
        wake();
    }

    function setCalm() {
        // reduced motion: the set stage as an image, nothing moves (CSS shows the <img>)
        if (calm.matches) { cancelAnimationFrame(raf); raf = 0; } else wake();
    }

    on(window, 'scroll', () => { measure(); wake(); }, { passive: true });
    on(window, 'resize', () => { layout(); measure(); wake(); });
    on(root, 'pointermove', (e) => {
        if (!finePointer.matches || !fit) return;
        const r = stageEl.getBoundingClientRect();
        eye.tx = clamp(((e.clientX - r.left) / r.width - 0.5) * 2, -1, 1);
        eye.ty = clamp(((e.clientY - r.top) / r.height - 0.5) * 2, -1, 1);
        wake();
    });
    on(root, 'pointerleave', () => { eye.tx = 0; eye.ty = 0; wake(); });
    on(calm, 'change', setCalm);
    const onTilt = () => wake();
    tilt.listeners.add(onTilt); cleanups.push(() => tilt.listeners.delete(onTilt));
    const io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) wake(); else { cancelAnimationFrame(raf); raf = 0; } });
    io.observe(root); cleanups.push(() => io.disconnect());

    if (!calm.matches) start().catch((err) => { console.warn(err); root.classList.remove('is-live'); });
    else on(calm, 'change', () => { if (!calm.matches && !ready) start(); });

    return {
        destroy() {
            alive = false;
            cancelAnimationFrame(raf);
            cleanups.forEach((f) => f());
            canvas?.remove();
            root.classList.remove('pt', 'pt-scroll', 'is-live');
            root.style.removeProperty('--pt-runway');
        },
    };
}

for (const el of document.querySelectorAll('[data-paper-theatre]')) paperTheatre(el);
