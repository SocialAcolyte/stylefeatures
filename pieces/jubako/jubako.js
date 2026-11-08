/* jubako — tabs that are the tiers of a Japanese food box (jūbako, 17th century, The Met 40343, CC0).
 * Choose a tab, or take hold of a tier and lift, and the tiers above lift off along the box's own axis, so the tier
 * you chose stands open and its panel comes out beside it.
 *
 *   <section class="jb" data-jubako aria-label="The five tiers">
 *     <div class="jb-stage"><div class="jb-box" aria-hidden="true">
 *       <img class="jb-shadow" src="assets/shadow.webp" width="826" height="369" alt="" style="--x:-2;--y:675;--w:826">
 *       <img class="jb-tier" src="assets/tier-5.webp" width="750" height="540" alt="" style="--x:45;--y:479;--w:750">
 *       … tier-4 to tier-1, the top tier last (README has all six)
 *     </div></div>
 *     <div class="jb-panels">
 *       <section class="jb-panel" id="first"><h3 class="jb-head">First tier</h3> …</section>
 *       … one per tab, at most five (the box has five tiers; the first panel is the top tier)
 *     </div>
 *   </section>
 *
 * Without JS the box stands with its top tier open and every panel is shown under its own heading, in order: a
 * page that reads straight through. With JS the headings become a real tablist (role="tablist", role="tab" buttons
 * with aria-controls, role="tabpanel" sections labelled by their tab, roving tabindex, arrows / Home / End, selection
 * following focus), the headings are kept for screen readers only (a heading's markup, e.g. a <span lang="ja">, is
 * carried into its tab), and one panel shows.
 *
 * A second way in, by hand: press a tier (a finger rests on it for a moment first) and draw upward and the tiers from it up come off with your hand; let go
 * past 40 % of the lift (or with a flick) and the tier under them is chosen. Press a lifted tier and draw down to
 * close the stack onto it. A press without a draw chooses the tier pressed. The tablist stays the control.
 *
 * The parts are the Met's own photographs: the box was photographed five times from one camera, a tier taken off
 * each time. tier-n is tier n as the n-th photograph shows it (nothing on it, its inside open), cut along its own
 * bottom seam. Stacked, each tier hides the inside of the one below, so the stack is the first photograph again;
 * lifted, a tier shows the inside the photographer saw when it was the top. No pixel is drawn.
 *
 * Motion: every tier is a mass on a spring (ζ 0.8, ω 19 /s; ω 34 /s while a hand holds it; stepped at 240 Hz). Its
 * target is the lift for the tiers above the chosen one and 0 for the rest, or the hand's height; a tier never sinks
 * into the one under it (it rides on it). Lacquered tiers fit close: as a stack comes off, the tier left behind is
 * drawn up with it a couple of millimetres and drops back. The loop runs only while something moves and the box is
 * on screen. Reduced motion: the state at once (dragging still moves what you hold).
 *
 * Two layouts, chosen by measuring: "aside" puts each tab beside its own tier (the labels rise with their tiers)
 * and the panel to the right, its top level with the open tier's mouth, coming out from the box's side; "list" (a
 * container under 760 px, or tiers too close for a 26 px tab) sets a small box at the left with the tabs listed
 * beside it, and the panel under both.
 *
 * Options (data-* on the root, or the options object, which wins):
 *   selected   index (0-based) or panel id to start on; lands there without moving. Else the URL's #hash if it
 *              names a panel, else 0
 *   lift       how far lifted tiers rise, as a share of the top tier's open mouth (default 0.8)
 *   layout     'auto' (default), 'aside' or 'list'
 *   align      'true' (default) sets the panel level with the open tier in the aside layout; 'false' keeps it at top
 *   hash       'true' writes the chosen panel's id to the URL (replaceState) — off by default
 * Events (bubbling, on the root): jubako:change {index, id, tab, panel, by: 'tab'|'key'|'hand'|'api'}
 * API: const j = jubako(root); j.select(i | id); j.index; j.hold(true|false); j.advance(seconds); j();  (destroy:
 *   listeners, observers, the tablist it made; the page goes back to its no-JS reading) — also on root.jubako.
 */

// The box as exported by tools/cut.py (assets/geometry.json), in frame px (half the Met crop's scale).
const GEO = {
    frame: [823, 1042],
    opening: 288.5,         // tier 1's mouth: rim front corner to far corner
    left: 9.5, right: 819.0,   // the box's left and right edges
    // the boundary lines: rim, seams 1|2 … 4|5, the foot. Each runs from its front corner c with slope l to the left
    // and r to the right (the two faces, each to its vanishing point)
    lines: [
        { c: [562.0, 292.5], l: 0.18329, r: -0.83564 },
        { c: [562.0, 383.49], l: 0.1951, r: -0.88949 },
        { c: [562.0, 544.6], l: 0.21601, r: -0.98483 },
        { c: [562.0, 700.11], l: 0.2362, r: -1.07686 },
        { c: [562.0, 848.55], l: 0.25546, r: -1.1647 },
        { c: [562.0, 1009.69], l: 0.27687, r: -1.26006 },
    ],
};
const TIERS = GEO.lines.length - 1;
const DT = 1 / 240, ZETA = 0.8, OMEGA = 19, OMEGA_HAND = 34;
const MIN_PITCH = 26;       // css px: tiers closer than this, the tabs go into a list beside a small box
const NUDGE = 0.045;        // share of the lift a tier gives when its tab is pointed at
const TUG = 0.02;           // share of the lift the tier left behind is drawn up as a stack comes off it
const SNAP = 0.4;           // share of the lift past which a let-go chooses the next tier
const HOLD_MS = 180;        // a finger rests this long on a tier before it holds it

const lineY = (L, x) => L.c[1] + (x < L.c[0] ? L.l : L.r) * (x - L.c[0]);

function opt(root, o, k, d) {
    if (o[k] != null) return o[k];
    const v = root.dataset[k];
    return v == null ? d : v;
}

let uid = 0;

export function jubako(root, options = {}) {
    if (!root || root.jubako) return root && root.jubako;
    const box = root.querySelector('.jb-box');
    const stage = root.querySelector('.jb-stage') || box?.parentElement;
    const tierImgs = box ? [...box.querySelectorAll('.jb-tier')].reverse() : [];   // markup is bottom tier first
    const panels = [...root.querySelectorAll('.jb-panel')].slice(0, TIERS);
    if (!box || tierImgs.length !== TIERS || !panels.length) return null;

    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const LIFT = GEO.opening * +opt(root, options, 'lift', 0.8);           // frame px
    const layoutOpt = String(opt(root, options, 'layout', 'auto'));
    const align = String(opt(root, options, 'align', 'true')) !== 'false';
    const writeHash = String(opt(root, options, 'hash', 'false')) === 'true';
    root.style.setProperty('--jb-lift', String(Math.round(LIFT)));

    /* ── the tablist, made from the panels' headings ─────────────────────────────────────────────────────── */
    const id = 'jb' + (++uid);
    let list = root.querySelector('.jb-tabs');
    const madeList = !list;
    if (!list) {
        list = document.createElement('div');
        list.className = 'jb-tabs';
        box.after(list);
    }
    list.setAttribute('role', 'tablist');
    list.setAttribute('aria-orientation', 'vertical');      // both layouts list the tiers top to bottom
    if (!list.hasAttribute('aria-label') && !list.hasAttribute('aria-labelledby')) {
        const name = root.getAttribute('aria-label'), by = root.getAttribute('aria-labelledby');
        if (by) list.setAttribute('aria-labelledby', by); else if (name) list.setAttribute('aria-label', name);
    }
    const tabs = panels.map((p, i) => {
        const head = p.querySelector('.jb-head');
        if (!p.id) p.id = `${id}-panel-${i}`;
        let t = list.children[i];
        if (!t) {
            t = document.createElement('button');
            t.type = 'button';
            t.className = 'jb-tab';
            const text = document.createElement('span');
            text.className = 'jb-tab-text';
            if (head) text.append(...head.cloneNode(true).childNodes);
            else text.textContent = `Tier ${i + 1}`;
            for (const el of text.querySelectorAll('[id]')) el.removeAttribute('id');
            t.appendChild(text);
            list.appendChild(t);
        }
        if (!t.id) t.id = `${id}-tab-${i}`;
        t.setAttribute('role', 'tab');
        t.setAttribute('aria-controls', p.id);
        p.setAttribute('role', 'tabpanel');
        p.setAttribute('aria-labelledby', t.id);
        p.tabIndex = 0;
        return t;
    });
    root.classList.add('jb-js');

    /* ── the tiers: springs ──────────────────────────────────────────────────────────────────────────────── */
    const y = new Float64Array(TIERS), v = new Float64Array(TIERS), target = new Float64Array(TIERS);
    let index = -1, hover = -1, raf = 0, frozen = false, visible = true, alive = true, last = 0;
    let k = 1;              // css px per frame px
    let row = false;        // the list layout (narrow)
    let omega = OMEGA;
    let hand = null;        // a tier held: {g, mode: 'lift'|'lower', from, to, y0, pos, vel, t, moved, pid}

    function targets() {
        for (let i = 0; i < TIERS; i++) target[i] = i < index ? LIFT : 0;
        if (hand && hand.moved) {
            for (let i = hand.from; i <= hand.to; i++) target[i] = hand.pos;
            return;
        }
        if (hand && hand.armed && hand.mode && !reduced.matches) {
            // held, not yet drawn: the tiers in hand give a little, so the hand knows what it holds
            for (let i = hand.from; i <= hand.to; i++) target[i] += (hand.mode === 'lift' ? 1 : -1) * 1.5 * NUDGE * LIFT;
            return;
        }
        if (hover >= 0 && hover !== index && !reduced.matches) {
            // pointing at a tab: the tiers that would move give a little, toward where they would go
            const a = Math.min(hover, index), b = Math.max(hover, index);
            for (let i = a; i < b; i++) target[i] += (hover > index ? 1 : -1) * NUDGE * LIFT;
        }
    }
    function step(dt) {
        let moving = false;
        for (let i = 0; i < TIERS; i++) {
            const a = -2 * ZETA * omega * v[i] - omega * omega * (y[i] - target[i]);
            v[i] += a * dt; y[i] += v[i] * dt;
        }
        // a tier rests on the one below: never lower than it (it is carried up), never below the table
        for (let i = TIERS - 1; i >= 0; i--) {
            if (y[i] < 0) { y[i] = 0; if (v[i] < 0) v[i] = 0; }
            if (i < TIERS - 1 && y[i] < y[i + 1]) { y[i] = y[i + 1]; if (v[i] < v[i + 1]) v[i] = v[i + 1]; }
        }
        for (let i = 0; i < TIERS; i++) if (Math.abs(y[i] - target[i]) > 0.05 || Math.abs(v[i]) > 0.5) moving = true;
        return moving;
    }
    function settle() { for (let i = 0; i < TIERS; i++) { y[i] = target[i]; v[i] = 0; } }

    function render() {
        for (let i = 0; i < TIERS; i++) {
            const px = -y[i] * k;
            tierImgs[i].style.transform = px ? `translate3d(0,${px.toFixed(2)}px,0)` : '';
            if (!row && tabs[i]) tabs[i].style.transform = `translate3d(0,${(tabY[i] + px).toFixed(2)}px,0)`;
        }
    }
    function frame(t) {
        raf = 0;
        if (!alive || frozen) return;
        let dt = Math.min(0.05, last ? (t - last) / 1000 : DT);
        last = t;
        let moving = false;
        for (; dt > 1e-6; dt -= DT) moving = step(Math.min(DT, dt));
        render();
        if ((moving || hand) && visible) raf = requestAnimationFrame(frame);
        else { last = 0; if (!moving) settle(), render(); }
    }
    function wake() {
        if (frozen || !alive) return;
        if (reduced.matches && !hand) { settle(); render(); return; }
        if (!raf && visible) { last = 0; raf = requestAnimationFrame(frame); }
        if (!visible) { settle(); render(); }                    // off screen: land, no loop
    }

    /* ── layout: tab beside its tier, or a list beside a small box ───────────────────────────────────────── */
    const tabY = new Float64Array(TIERS);
    function layout() {
        const w = box.clientWidth;
        if (!w) return;
        k = w / GEO.frame[0];
        // the middle of each tier's band where it meets the box's right edge, in the stage's px (the box sits under
        // its lift room)
        const xr = GEO.right - 14;
        const centres = [];
        for (let i = 0; i < TIERS; i++) {
            const a = lineY(GEO.lines[i], xr), b = lineY(GEO.lines[i + 1], xr);
            centres.push(((a + b) / 2 + LIFT) * k);
        }
        let pitch = Infinity;
        for (let i = 0; i < tabs.length - 1; i++) pitch = Math.min(pitch, centres[i + 1] - centres[i]);
        const wantRow = layoutOpt === 'list' || (layoutOpt !== 'aside' && (root.clientWidth < 760 || pitch < MIN_PITCH));
        if (wantRow !== row || !root.classList.contains(row ? 'jb-list' : 'jb-aside')) {
            row = wantRow;
            root.classList.toggle('jb-list', row);
            root.classList.toggle('jb-aside', !row);
            for (const t of tabs) t.style.transform = '';
            // the box changed size with the layout: measure again
            requestAnimationFrame(layout);
            return;
        }
        for (let i = 0; i < tabs.length; i++) tabY[i] = centres[i];
        list.style.setProperty('--jb-tabs-x', (GEO.right * k).toFixed(1) + 'px');
        place();
        render();
    }
    // the panel's top level with the open tier's far rim (its mouth), in the aside layout
    function place() {
        const p = panels[index];
        if (!p) return;
        for (const q of panels) if (q !== p) q.style.marginTop = '';
        if (row || !align) { p.style.marginTop = ''; return; }
        p.style.marginTop = '0px';
        const natural = p.getBoundingClientRect().top - stage.getBoundingClientRect().top;
        const mouth = (lineY(GEO.lines[index], GEO.lines[index].c[0]) - GEO.opening * 0.92 + LIFT) * k;
        p.style.marginTop = Math.max(0, mouth - natural).toFixed(1) + 'px';
    }

    /* ── choosing ────────────────────────────────────────────────────────────────────────────────────────── */
    function show(i, { focus = false, still = false, announce = true, by = 'api' } = {}) {
        i = Math.max(0, Math.min(tabs.length - 1, i));
        const prev = index, changed = i !== index;
        index = i;
        tabs.forEach((t, n) => {
            const on = n === i;
            t.setAttribute('aria-selected', on ? 'true' : 'false');
            t.tabIndex = on ? 0 : -1;
            panels[n].hidden = !on;
        });
        root.dataset.tier = String(i + 1);
        if (changed && prev >= 0) {
            // the panel comes out from the box's side (an entrance the CSS plays once)
            panels[i].classList.remove('jb-in');
            void panels[i].offsetWidth;
            panels[i].classList.add('jb-in');
        }
        place();
        if (focus) tabs[i].focus({ preventScroll: true });
        targets();
        if (still || (reduced.matches && !hand)) { settle(); render(); }
        else {
            // lacquered tiers fit close: the tier a stack comes off is drawn up with it a little, and drops back
            if (changed && prev >= 0 && i > prev && !reduced.matches && y[i] < 1) v[i] += TUG * LIFT * omega / 0.42;
            wake();
        }
        if (changed && announce) {
            if (writeHash && panels[i].id) history.replaceState(null, '', '#' + panels[i].id);
            root.dispatchEvent(new CustomEvent('jubako:change', { bubbles: true,
                detail: { index: i, id: panels[i].id, tab: tabs[i], panel: panels[i], by } }));
        }
    }
    const indexOf = (x) => typeof x === 'number' ? x : panels.findIndex((p) => p.id === String(x).replace(/^#/, ''));

    function onClick(e) {
        const t = e.target.closest('[role="tab"]');
        const i = tabs.indexOf(t);
        if (i >= 0) show(i, { focus: true, by: 'tab' });
    }
    function onKey(e) {
        const i = tabs.indexOf(document.activeElement);
        if (i < 0) return;
        let n = -1;
        const back = ['ArrowUp', 'ArrowLeft'], fwd = ['ArrowDown', 'ArrowRight'];
        if (back.includes(e.key)) n = (i - 1 + tabs.length) % tabs.length;
        else if (fwd.includes(e.key)) n = (i + 1) % tabs.length;
        else if (e.key === 'Home') n = 0;
        else if (e.key === 'End') n = tabs.length - 1;
        if (n < 0) return;
        e.preventDefault();
        show(n, { focus: true, by: 'key' });
    }
    function onOver(e) {
        const i = tabs.indexOf(e.target.closest('[role="tab"]'));
        if (i === hover) return;
        hover = i;
        targets(); wake();
    }
    function onLeave() { if (hover < 0 || hand) return; hover = -1; targets(); wake(); }

    /* ── by hand ─────────────────────────────────────────────────────────────────────────────────────────── */
    function tierAt(e) {
        const r = box.getBoundingClientRect();
        const x = (e.clientX - r.left) / k, yy = (e.clientY - r.top) / k - LIFT;   // frame px, the box at rest
        if (x < GEO.left || x > GEO.right) return -1;
        // the topmost tier whose side (or open mouth) is under the point, where it is now
        for (let i = 0; i < tabs.length; i++) {
            const top = lineY(GEO.lines[i], x) - GEO.opening - y[i], bottom = lineY(GEO.lines[i + 1], x) - y[i];
            if (yy >= top && yy <= bottom) return i;
        }
        return -1;
    }
    const rubber = (p) => p < 0 ? 0 : p <= LIFT ? p : LIFT + (p - LIFT) * 0.22;
    function onDown(e) {
        if (hand || e.button > 0 || frozen) return;
        const g = tierAt(e);
        if (g < 0) return;
        // a resting tier comes off with everything above it (if there is a tier under it with a tab to show);
        // a lifted tier goes down onto the stack with everything between it and the open tier
        let mode = null, from = 0, to = 0;
        if (g >= index && g + 1 < tabs.length) { mode = 'lift'; from = index; to = g; }
        else if (g < index) { mode = 'lower'; from = g; to = index - 1; }
        // a finger has to rest a moment before it holds a tier (so a swipe across the box still scrolls the page);
        // a mouse or pen holds at once
        const touch = e.pointerType === 'touch';
        hand = { g, mode, from, to, y0: e.clientY, pos: mode === 'lower' ? LIFT : 0, vel: 0, t: performance.now(),
            moved: false, pid: e.pointerId, armed: !touch, timer: 0 };
        if (touch) hand.timer = setTimeout(() => { if (hand && !hand.moved) { hand.armed = true; targets(); wake(); } }, HOLD_MS);
        try { box.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ }
    }
    function onTouchMove(e) { if (hand && hand.armed && e.cancelable) e.preventDefault(); }
    function onMove(e) {
        if (!hand || e.pointerId !== hand.pid) {
            if (e.pointerType !== 'mouse' || hand) return;
            const i = tierAt(e);
            box.style.cursor = i >= 0 ? (i !== index ? 'grab' : '') : '';
            if (i !== hover) { hover = i; targets(); wake(); }
            return;
        }
        const d = (hand.y0 - e.clientY) / k;                   // frame px, up is positive
        if (!hand.moved && Math.abs(d * k) < 6) return;
        if (!hand.armed) { clearTimeout(hand.timer); hand = null; targets(); wake(); return; }   // a swipe: the page's
        if (!hand.mode) return;
        hand.moved = true;
        root.classList.add('jb-held');
        omega = OMEGA_HAND;
        const pos = rubber(hand.mode === 'lift' ? d : LIFT + d);
        const now = performance.now(), dt = Math.max(1, now - hand.t) / 1000;
        hand.vel = 0.7 * hand.vel + 0.3 * (pos - hand.pos) / dt;
        hand.pos = pos; hand.t = now;
        targets(); wake();
    }
    function onUp(e) {
        if (!hand || e.pointerId !== hand.pid) return;
        const h = hand;
        clearTimeout(h.timer);
        hand = null;
        omega = OMEGA;
        root.classList.remove('jb-held');
        try { box.releasePointerCapture(e.pointerId); } catch (err) { /* gone */ }
        const focus = list.contains(document.activeElement);
        if (!h.moved) { show(h.g, { focus, by: 'hand' }); return; }
        const p = h.pos / LIFT, flick = h.vel / LIFT;            // share of the lift, and per second
        if (h.mode === 'lift') show(p > SNAP || flick > 2.5 ? h.to + 1 : index, { focus, by: 'hand' });
        else show(1 - p > SNAP || flick < -2.5 ? h.from : index, { focus, by: 'hand' });
        targets(); wake();
    }
    function onCancel(e) { if (hand && e.pointerId === hand.pid) { clearTimeout(hand.timer); hand = null; omega = OMEGA; root.classList.remove('jb-held'); targets(); wake(); } }

    list.addEventListener('click', onClick);
    list.addEventListener('keydown', onKey);
    list.addEventListener('pointerover', onOver);
    list.addEventListener('pointerleave', onLeave);
    box.addEventListener('pointerdown', onDown);
    box.addEventListener('pointermove', onMove);
    box.addEventListener('pointerup', onUp);
    box.addEventListener('pointercancel', onCancel);
    box.addEventListener('pointerleave', onLeave);
    box.addEventListener('touchmove', onTouchMove, { passive: false });
    const onMotion = () => { if (reduced.matches) { settle(); render(); } };
    reduced.addEventListener?.('change', onMotion);

    const ro = new ResizeObserver(() => layout());
    ro.observe(root); ro.observe(box);
    const io = new IntersectionObserver((es) => {
        visible = es[es.length - 1].isIntersecting;
        if (visible) wake(); else { cancelAnimationFrame(raf); raf = 0; settle(); render(); }
    });
    io.observe(box);

    const start = opt(root, options, 'selected', null);
    let first = start != null ? indexOf(isNaN(+start) ? start : +start) : -1;
    if (first < 0 && location.hash) first = indexOf(location.hash);
    layout();
    show(first < 0 ? 0 : first, { still: true, announce: false });

    function destroy() {
        alive = false;
        cancelAnimationFrame(raf);
        list.removeEventListener('click', onClick);
        list.removeEventListener('keydown', onKey);
        list.removeEventListener('pointerover', onOver);
        list.removeEventListener('pointerleave', onLeave);
        box.removeEventListener('pointerdown', onDown);
        box.removeEventListener('pointermove', onMove);
        box.removeEventListener('pointerup', onUp);
        box.removeEventListener('pointercancel', onCancel);
        box.removeEventListener('pointerleave', onLeave);
        box.removeEventListener('touchmove', onTouchMove);
        reduced.removeEventListener?.('change', onMotion);
        ro.disconnect(); io.disconnect();
        for (const im of tierImgs) im.style.transform = '';
        for (const p of panels) {
            p.hidden = false; p.style.marginTop = ''; p.classList.remove('jb-in');
            p.removeAttribute('role'); p.removeAttribute('aria-labelledby'); p.removeAttribute('tabindex');
        }
        if (madeList) list.remove();
        else for (const t of tabs) { t.style.transform = ''; t.removeAttribute('aria-selected'); }
        box.style.cursor = '';
        root.style.removeProperty('--jb-lift');
        list.style.removeProperty('--jb-tabs-x');
        root.classList.remove('jb-js', 'jb-list', 'jb-aside', 'jb-held');
        delete root.dataset.tier;
        delete root.jubako;
    }
    destroy.select = (x) => { const i = indexOf(x); if (i >= 0) show(i); };
    destroy.hold = (on = true) => { frozen = !!on; if (frozen) { cancelAnimationFrame(raf); raf = 0; } else wake(); };
    destroy.advance = (s) => { let n = Math.round(s / DT); while (n-- > 0) step(DT); render(); };
    Object.defineProperty(destroy, 'index', { get: () => index });
    destroy.tabs = tabs; destroy.panels = panels;
    root.jubako = destroy;
    return destroy;
}

function boot() {
    for (const el of document.querySelectorAll('[data-jubako]')) jubako(el);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
