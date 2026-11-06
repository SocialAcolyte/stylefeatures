/*
 *  HOHMANN-LOADER // a page loader drawn as an engraved plate of a Hohmann
 *  transfer from Earth's orbit to Mars's.
 *
 *  Two hairline orbits round an engraved Sun. As the page loads, the transfer
 *  ellipse is drawn in ink from the departure point, tangent to Earth's orbit,
 *  over the top to the far side, where it touches Mars's orbit. Progress is
 *  TIME on the transfer, so it is mean anomaly, M = pi * progress, and the
 *  craft's place comes from Kepler's equation: it runs away from perihelion and
 *  slows towards aphelion. Earth and Mars move on their own orbits at their own
 *  rates over the same time, and Mars, which led by the Hohmann phase angle at
 *  launch, reaches the meeting point exactly as the craft does: at 100%.
 *
 *  Two forms:
 *    <div data-hohmann-loader="page"></div>    full-page overlay (first thing in <body>)
 *    <span data-hohmann-loader><progress max="100"></progress></span>   inline
 *
 *  Page: follows the document (readyState, images, the load event) unless
 *  data-source="manual"; then drive it with el.hohmannLoader.setProgress(0..1)
 *  and .done(). It leaves on its own when the transfer is complete.
 *  Inline: the <progress> inside is the source of truth (set its value, or
 *  call setProgress). No value = waiting in the parking orbit.
 *
 *  Nothing runs at rest: the frame loop exists only while the drawing still
 *  has somewhere to go (or while an inline loader is waiting and on screen).
 *  Reduced motion: no loop at all; each change redraws the plate once, with the
 *  transfer inked to exactly the current fraction.
 */

const NS = 'http://www.w3.org/2000/svg';
const PI = Math.PI, TAU = PI * 2;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const calm = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

/* ---- the orbit ------------------------------------------------------------
 * Units: Earth's orbit r1 = 1, GM = 1, so Earth's mean motion is 1 rad per
 * unit time. Mars's semi-major axis is 1.5237 AU. Both orbits are treated as
 * circular and coplanar (the textbook Hohmann case).                         */
export const R1 = 1, R2 = 1.5237;
export function transfer(r1 = R1, r2 = R2) {
    const a = (r1 + r2) / 2, e = (r2 - r1) / (r2 + r1);
    const tH = PI * Math.sqrt(a * a * a);           // half the ellipse's period
    const n1 = Math.sqrt(1 / (r1 * r1 * r1)), n2 = Math.sqrt(1 / (r2 * r2 * r2));
    const lead = PI - n2 * tH;                      // target's lead at departure
    return { r1, r2, a, e, tH, n1, n2, lead };
}
/* Kepler: M = E - e sin E, by Newton from E0 = M (fine for e < 0.8). */
export function eccentric(M, e) {
    let E = M;
    for (let i = 0; i < 12; i++) {
        const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
        E -= d; if (Math.abs(d) < 1e-12) break;
    }
    return E;
}
/* true anomaly and radius after a fraction p of the transfer time */
export function along(o, p) {
    if (p <= 0) return { nu: 0, r: o.r1 };
    if (p >= 1) return { nu: PI, r: o.r2 };
    const E = eccentric(PI * p, o.e);
    const nu = 2 * Math.atan2(Math.sqrt(1 + o.e) * Math.sin(E / 2), Math.sqrt(1 - o.e) * Math.cos(E / 2));
    return { nu, r: o.a * (1 - o.e * Math.cos(E)) };
}
const rOf = (o, nu) => o.a * (1 - o.e * o.e) / (1 + o.e * Math.cos(nu));

/* ---- drawing helpers ----------------------------------------------------- */
function el(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
}
const f2 = (v) => Math.round(v * 100) / 100;

/* A small seeded random, so the engraver's irregularities are the same on
 * every visit (and in every screenshot).                                    */
function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* A burin line: a filled sliver that swells from nothing to w and back,
 * the way an engraved line does where the tool enters and leaves the plate.
 * pts: [[x,y],...]; wAt(t) gives the half-width at t in 0..1.               */
function sliver(pts, wAt) {
    const n = pts.length; if (n < 2) return '';
    const L = [], R = [];
    let total = 0; const acc = [0];
    for (let i = 1; i < n; i++) { total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); acc.push(total); }
    for (let i = 0; i < n; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
        let tx = b[0] - a[0], ty = b[1] - a[1]; const m = Math.hypot(tx, ty) || 1; tx /= m; ty /= m;
        const w = wAt(total ? acc[i] / total : 0);
        L.push([pts[i][0] - ty * w, pts[i][1] + tx * w]);
        R.push([pts[i][0] + ty * w, pts[i][1] - tx * w]);
    }
    let d = 'M' + f2(L[0][0]) + ' ' + f2(L[0][1]);
    for (let i = 1; i < n; i++) d += 'L' + f2(L[i][0]) + ' ' + f2(L[i][1]);
    for (let i = n - 1; i >= 0; i--) d += 'L' + f2(R[i][0]) + ' ' + f2(R[i][1]);
    return d + 'Z';
}

/* The engraved Sun: a disc ruled with fine horizontal lines, its limb cut
 * once, and a crown of tapering rays, long and short in turn, each a little
 * uneven, as a hand-cut crown is.                                           */
function drawSun(g, R, fine, rand) {
    if (!fine) { el('circle', { r: R, class: 'hl-ink' }, g); return; }
    let d = '';
    for (let y = -R + 1.1; y < R; y += 1.55) {
        const c = Math.sqrt(R * R - y * y) - .35; if (c <= .4) continue;
        // lines thicken a touch towards the lower limb, as the plate's shading does
        const w = .17 + .16 * ((y + R) / (2 * R));
        d += sliver([[-c, y], [-c * .33, y], [c * .33, y], [c, y]], (t) => w * Math.min(1, Math.sin(PI * t) * 2.4));
    }
    el('path', { d, class: 'hl-ink' }, g);
    el('circle', { r: R, class: 'hl-limb', 'stroke-width': .62 }, g);
    let rays = '';
    const N = 36;
    for (let i = 0; i < N; i++) {
        const a = (i / N) * TAU + (rand() - .5) * .012, long = i % 2 === 0;
        const r0 = R + 2.4, r1 = R + (long ? 10.5 : 6.4) + (rand() - .5) * .7, hw = (long ? .82 : .6) * (.92 + rand() * .16);
        const ca = Math.cos(a), sa = Math.sin(a), px = -sa, py = ca;
        rays += `M${f2(ca * r0 + px * hw)} ${f2(sa * r0 + py * hw)}L${f2(ca * r1)} ${f2(sa * r1)}L${f2(ca * r0 - px * hw)} ${f2(sa * r0 - py * hw)}Z`;
    }
    el('path', { d: rays, class: 'hl-ink' }, g);
}

/* An engraved planet: the limb, and the night side (local +x, away from the
 * Sun) ruled with parallel lines that thicken towards the dark limb. The lines
 * begin a little on the day side, very fine, so the terminator is soft.     */
function drawPlanet(g, R, fine) {
    // small: an open ring, so the solid dot is always the craft
    if (!fine) { el('circle', { r: R, class: 'hl-paper hl-ring' }, g); return; }
    el('circle', { r: R, class: 'hl-paper' }, g);
    let d = '';
    const step = R > 6 ? 1.02 : .92;
    for (let x = -R * .32; x < R - .25; x += step) {
        const c = Math.sqrt(R * R - x * x) - .2; if (c <= .3) continue;
        const k = clamp((x + R * .32) / (R * 1.32));
        const w = .07 + .5 * k * k;
        d += sliver([[x, -c], [x, -c * .3], [x, c * .3], [x, c]], (t) => w * Math.min(1, Math.sin(PI * t) * 3));
    }
    el('path', { d, class: 'hl-ink' }, g);
    el('circle', { r: R, class: 'hl-limb', 'stroke-width': .55 }, g);
}

/* ---- the component ------------------------------------------------------- */
export function hohmannLoader(root, opts = {}) {
    if (root.hohmannLoader) return root.hohmannLoader;
    const ds = root.dataset;
    const page = (opts.mode || ds.hohmannLoader) === 'page';
    const source = opts.source || ds.source || 'document';
    const pace = +(opts.pace ?? ds.pace ?? 1.25);      // shortest time to draw the whole transfer, s
    const coast = +(opts.coast ?? ds.coast ?? 2.6);    // inline: seconds per parking orbit while waiting
    const fine = page || opts.fine === true || ds.fine === 'true';
    const o = transfer();
    const added = [];
    const off = [];
    const on = (t, ev, fn, o2) => { t.addEventListener(ev, fn, o2); off.push(() => t.removeEventListener(ev, fn, o2)); };

    /* scale: Mars's orbit at 200 units */
    const S = 200 / o.r2;
    const VB = page ? 226 : 214;
    const RS = fine ? 12.5 : 30, RE = fine ? 7.4 : 25, RM = fine ? 5.6 : 21, RC = fine ? 2.7 : 15;

    /* ---- build ---- */
    root.classList.add('hl', page ? 'hl-page' : 'hl-inline');
    const prog = root.querySelector('progress');
    let plate = root;
    if (page) {
        // the script has arrived: the <head> failsafe that would lift the plate is no longer needed
        if (window.hlFailsafe) { clearTimeout(window.hlFailsafe); window.hlFailsafe = 0; }
        plate = document.createElement('div'); plate.className = 'hl-plate'; root.appendChild(plate); added.push(plate);
        root.setAttribute('role', 'progressbar');
        root.setAttribute('aria-label', root.getAttribute('aria-label') || 'Loading');
        root.setAttribute('aria-valuemin', '0'); root.setAttribute('aria-valuemax', '100');
    }
    const svg = el('svg', { viewBox: `${-VB} ${-VB} ${VB * 2} ${VB * 2}`, class: 'hl-svg', 'aria-hidden': 'true', focusable: 'false' });
    plate.appendChild(svg); added.push(svg);
    const rand = rng(1925);

    const gOrb = el('g', { class: 'hl-orbits' }, svg);
    const o1 = el('circle', { r: f2(o.r1 * S), class: 'hl-orbit' }, gOrb);
    const o2 = el('circle', { r: f2(o.r2 * S), class: 'hl-orbit' }, gOrb);
    const plan = el('path', { class: 'hl-plan' }, svg);
    const flown = el('path', { class: 'hl-ink' }, svg);
    const ticks = el('path', { class: 'hl-ink' }, svg);
    const markA = el('circle', { r: RM + (fine ? 2.6 : 8), class: 'hl-mark' }, svg);
    const markD = el('circle', { r: RE + (fine ? 2.6 : 8), class: 'hl-mark' }, svg);
    const sun = el('g', {}, svg); drawSun(sun, RS, fine, rand);
    const earth = el('g', {}, svg); drawPlanet(earth, RE, fine);
    const mars = el('g', {}, svg); drawPlanet(mars, RM, fine);
    const craft = el('g', {}, svg);
    el('circle', { r: RC + (fine ? 1.3 : 6), class: 'hl-paper' }, craft);
    el('circle', { r: RC, class: 'hl-ink' }, craft);
    const strokes = [o1, o2, plan, markA, markD];

    /* hairlines stay hairlines: set stroke widths in CSS px whatever the size */
    let unit = 1;
    function measure() {
        const w = svg.getBoundingClientRect().width || 1;
        unit = (VB * 2) / w;                         // user units per CSS px
        const hair = page ? .7 : (w < 40 ? .9 : 1);
        o1.setAttribute('stroke-width', f2(hair * unit * 1000) / 1000);
        o2.setAttribute('stroke-width', f2(hair * unit * 1000) / 1000);
        markA.setAttribute('stroke-width', f2(hair * unit * 1000) / 1000);
        markD.setAttribute('stroke-width', f2(hair * unit * 1000) / 1000);
        for (const r of svg.querySelectorAll('.hl-ring')) r.setAttribute('stroke-width', f2(hair * 1.1 * unit * 1000) / 1000);
        plan.setAttribute('stroke-width', f2(hair * 1.15 * unit * 1000) / 1000);
        plan.setAttribute('stroke-dasharray', `0 ${f2((page ? 4.2 : 3.2) * unit * 100) / 100}`);
        draw(true);
    }

    /* ---- state ----
     * shown: the fraction of transfer time drawn now; target: where it is going.
     * phiD: the direction of departure (the ellipse's perihelion). The page
     * plate departs from the left and arrives on the right, so the transfer
     * arcs over the top and reads as a line being drawn left to right.     */
    let shown = 0, target = 0, waiting = false, finished = false, leaving = false;
    let phiD = PI;
    let coastT = 0;                                  // inline, while waiting: parking-orbit clock
    let phE = PI, phM = PI - o.lead;                 // planet angles while waiting

    function readProgress() {
        if (!prog) return;
        if (!prog.hasAttribute('value')) { if (!waiting && !page) park(); }
        else {
            const v = clamp(prog.value / (prog.max || 1));
            if (waiting) depart();
            setTarget(v, true);
        }
        kick();
    }
    /* Leaving the parking orbit. A real craft waits for the window: the
     * moment Mars leads Earth by the Hohmann angle. While waiting, both coast
     * at their true rates; here the clock is run forward until that angle
     * comes round, then the transfer starts from wherever Earth then is.   */
    let warp = 0;
    function depart() {
        waiting = false;
        let lag = ((phE - phM) - o.lead) % TAU; if (lag < 0) lag += TAU;   // phase still to close
        warp = lag / (o.n1 - o.n2);                  // parking time until the window
        shown = 0; finished = false; root.classList.remove('hl-arrived');
        phiD = phE - warp;                           // where Earth will be at the window
        if (calm.matches) { phE -= warp; phM -= warp * o.n2; warp = 0; }
    }
    /* back to the parking orbit from wherever the transfer clock stands */
    function park() {
        const t = shown * o.tH;
        phE = phiD - o.n1 * t; phM = phiD - PI + o.n2 * (o.tH - t);
        waiting = true; finished = false; warp = 0; root.classList.remove('hl-arrived');
    }
    function setTarget(v, fromProg) {
        v = clamp(+v || 0);
        if (v < target - 1e-6 && v < shown && !page) { park(); depart(); }   // a new load: start over
        target = v;
        if (!fromProg && prog) { prog.value = v * (prog.max || 1); }
    }

    /* ---- document readiness (page, source="document") ----
     * Milestones that really are progress: the parser done (interactive),
     * then every <img> in the document, then the load event. Between them a
     * slow creep, so a stalled network still shows the line moving, never
     * past 0.92 before load says so.                                       */
    let ms = 0.06, creep = 0.06, imgs = [], done = false;
    function docMilestone() {
        if (document.readyState === 'complete') { ms = 1; done = true; return; }
        let m = 0.12;
        if (document.readyState !== 'loading') {
            imgs = Array.from(document.images).filter((i) => !i.closest('.hl'));
            const n = imgs.length, c = imgs.filter((i) => i.complete).length;
            m = 0.42 + 0.48 * (n ? c / n : 1);
        }
        ms = Math.max(ms, m);
    }
    if (page && source === 'document') {
        docMilestone();
        const upd = () => { docMilestone(); kick(); };
        on(document, 'readystatechange', () => {
            upd();
            for (const i of document.images) if (!i.complete) { on(i, 'load', upd); on(i, 'error', upd); }
        });
        on(window, 'load', () => { ms = 1; done = true; kick(); });
    }

    /* ---- the frame ---- */
    function pos(phi, r) { return [r * S * Math.cos(phi), -r * S * Math.sin(phi)]; }
    function place(g, xy, rotDeg) {
        g.setAttribute('transform', `translate(${f2(xy[0])} ${f2(xy[1])})` + (rotDeg == null ? '' : ` rotate(${f2(rotDeg)})`));
    }
    const away = (xy) => Math.atan2(xy[1], xy[0]) * 180 / PI;   // the planet's night side faces away from the Sun

    let lastKey = '';
    function draw(force) {
        const key = waiting ? 'w' + f2(phE) + f2(phM) : f2(shown * 1e4) + '|' + f2(phiD);
        if (!force && key === lastKey) return; lastKey = key;
        if (waiting) {
            /* parking: Earth (and the craft with it) and Mars on their circles */
            const e = pos(phE, o.r1), m = pos(phM, o.r2);
            place(earth, e, away(e)); place(mars, m, away(m)); place(craft, e);
            craft.style.visibility = '';            // the craft rides with Earth until the burn
            plan.setAttribute('d', ''); flown.setAttribute('d', ''); ticks.setAttribute('d', '');
            markA.style.visibility = markD.style.visibility = 'hidden';
            return;
        }
        craft.style.visibility = '';
        markA.style.visibility = markD.style.visibility = fine ? '' : 'hidden';
        const p = shown, now = along(o, p), t = p * o.tH;
        /* the ellipse: perihelion at phiD, travelling clockwise on the page */
        const at = (nu, r) => pos(phiD - nu, r);
        // inked part: from the burn to the craft, a burin line that enters thin
        const pts = [];
        const steps = Math.max(2, Math.ceil(now.nu / 0.02));
        for (let i = 0; i <= steps; i++) { const nu = now.nu * i / steps; pts.push(at(nu, rOf(o, nu))); }
        const W = fine ? .92 : 7.5;                  // half-width; the line enters the plate thin
        flown.setAttribute('d', now.nu > 1e-4 ? sliver(pts, (k) => W * Math.min(1, .3 + k * now.nu * 1.8)) : '');
        // the plan ahead: dotted, as a projected course is drawn
        let pd = '';
        if (fine && now.nu < PI - 1e-3) {             // too fine to read at inline size
            const st = Math.max(2, Math.ceil((PI - now.nu) / 0.02));
            for (let i = 0; i <= st; i++) {
                const nu = now.nu + (PI - now.nu) * i / st, q = at(nu, rOf(o, nu));
                pd += (i ? 'L' : 'M') + f2(q[0]) + ' ' + f2(q[1]);
            }
        }
        plan.setAttribute('d', pd);
        // equal-time ticks: one per tenth of the transfer, cut as the craft passes.
        // Kepler spaces them wide near the Sun and close towards aphelion.
        let td = '';
        if (fine) for (let k = 1; k < 10; k++) {
            if (p < k / 10) break;
            const q = along(o, k / 10), phi = phiD - q.nu, c = Math.cos(phi), s = -Math.sin(phi);
            const r = q.r * S, h = 4.2, w = .36;
            const x0 = c * (r - h), y0 = s * (r - h), x1 = c * (r + h), y1 = s * (r + h);
            const seg = [0, .25, .5, .75, 1].map((u) => [x0 + (x1 - x0) * u, y0 + (y1 - y0) * u]);
            td += sliver(seg, (u) => w * (.3 + .7 * Math.sin(PI * u)));
        }
        ticks.setAttribute('d', td);
        // planets at their true places at time t
        const e = pos(phiD - o.n1 * t, o.r1);
        const m = pos(phiD - PI + o.n2 * (o.tH - t), o.r2);
        place(earth, e, away(e)); place(mars, m, away(m));
        place(craft, at(now.nu, now.r));
        place(markD, at(0, o.r1)); place(markA, at(PI, o.r2));
        if (page) root.setAttribute('aria-valuenow', Math.round(p * 100));
    }

    /* ---- the loop: alive only while there is somewhere to go ---- */
    let raf = 0, last = 0, visible = true, holdUntil = 0;
    function moving() {
        if (leaving) return false;
        if (waiting) return !page && visible && !calm.matches && !document.hidden;
        if (calm.matches) return false;
        if (page && source === 'document' && !done) return true;     // the creep
        return shown < target - 1e-5 || warp > 0 || (target >= 1 && !finished);
    }
    function kick() {
        if (calm.matches) { snap(); return; }
        if (!raf && moving()) { last = 0; raf = requestAnimationFrame(frame); }
    }
    function snap() {                                 // reduced motion: straight to the state
        if (page && source === 'document') target = Math.max(target, ms);
        if (!waiting) { warp = 0; shown = target; }
        draw();
        if (shown >= 1 && !finished) arrive();
    }
    function frame(now) {
        raf = 0;
        const dt = last ? Math.min(.05, (now - last) / 1000) : 1 / 60; last = now;
        if (waiting) {
            coastT += dt; phE -= dt * TAU / coast; phM -= dt * TAU / coast * (o.n2 / o.n1);
        } else if (warp > 0) {
            /* run the clock on to the window, both bodies together, fast */
            const step = Math.min(warp, Math.max(dt * 9, warp * dt * 6));
            warp -= step; phE -= step; phM -= step * o.n2;
            if (warp <= 1e-6) warp = 0;
            // during the warp the plate is still in parking dress
            waiting = true; draw(); waiting = false;
            raf = requestAnimationFrame(frame); return;
        } else {
            if (page && source === 'document') {
                if (!done) {                          // creep towards (but never past) 0.92
                    creep = Math.max(creep, ms); creep += (0.92 - creep) * dt * 0.09;
                    target = Math.max(target, Math.min(.92, creep));
                } else target = 1;
            }
            const gap = target - shown;
            if (gap > 0) {
                const ease = gap * (1 - Math.exp(-dt / .3));
                shown += Math.min(gap, dt / pace, Math.max(ease, dt * .04));
            }
            if (shown >= 1 - 1e-6 && target >= 1) { shown = 1; }
        }
        draw();
        if (!waiting && shown >= 1 && !finished) arrive();
        if (moving()) raf = requestAnimationFrame(frame);
    }

    /* ---- arrival and exit ---- */
    let leaveT = 0;
    function arrive() {
        finished = true;
        root.classList.add('hl-arrived');
        root.dispatchEvent(new CustomEvent('hohmann:arrive', { bubbles: true }));
        if (page) leaveT = setTimeout(leave, calm.matches ? 120 : 650);
    }
    function leave() {
        if (leaving) return; leaving = true;
        document.documentElement.classList.remove('hl-loading');
        const end = () => {
            root.dispatchEvent(new CustomEvent('hohmann:done', { bubbles: true }));
            destroy(); root.remove();
        };
        if (calm.matches) { end(); return; }
        root.classList.add('hl-leaving');
        let fired = false;
        const fin = (e) => { if (e && e.target !== root) return; if (fired) return; fired = true; end(); };
        root.addEventListener('transitionend', fin);
        leaveT = setTimeout(fin, 1200);
    }

    /* ---- wiring ---- */
    if (prog) {
        waiting = !prog.hasAttribute('value');
        if (!waiting) { target = shown = clamp(prog.value / (prog.max || 1)); }
        const mo = new MutationObserver(readProgress);
        mo.observe(prog, { attributes: true, attributeFilter: ['value', 'max'] });
        off.push(() => mo.disconnect());
    } else if (!page) { waiting = true; }
    if (page) { shown = 0; target = 0; waiting = false; }

    const ro = new ResizeObserver(measure); ro.observe(svg); off.push(() => ro.disconnect());
    if (!page) {
        const io = new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; kick(); });
        io.observe(root); off.push(() => io.disconnect());
    }
    on(document, 'visibilitychange', kick);
    const onCalm = () => { if (calm.matches) { cancelAnimationFrame(raf); raf = 0; snap(); } else kick(); };
    if (calm.addEventListener) { calm.addEventListener('change', onCalm); off.push(() => calm.removeEventListener('change', onCalm)); }

    measure();
    kick();
    if (calm.matches) snap();

    /* ---- API ---- */
    function destroy() {
        cancelAnimationFrame(raf); raf = 0; clearTimeout(leaveT);
        off.splice(0).forEach((f) => f());
        added.splice(0).forEach((n) => n.remove());
        root.classList.remove('hl', 'hl-page', 'hl-inline', 'hl-arrived', 'hl-leaving');
        for (const a of ['role', 'aria-valuemin', 'aria-valuemax', 'aria-valuenow']) root.removeAttribute(a);
        delete root.hohmannLoader;
    }
    const api = {
        setProgress(v) { if (waiting && !page) depart(); setTarget(v, false); kick(); },
        done() { done = true; ms = 1; setTarget(1, false); kick(); },
        wait() { if (page) return; if (!waiting) park(); if (prog) prog.removeAttribute('value'); kick(); },
        leave,
        destroy,
        get progress() { return shown; },
        get orbit() { return o; },
    };
    root.hohmannLoader = api;
    return api;
}

/* ---- auto-start ---- */
function boot() { for (const n of document.querySelectorAll('[data-hohmann-loader]')) hohmannLoader(n); }
if (typeof document !== 'undefined') {
    boot();                                           // the page plate is first in <body>: start it at once
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
}
export default hohmannLoader;
