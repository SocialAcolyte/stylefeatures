/*
 *  HOHMANN-BUTTON // the button part of hohmann-loader.
 *
 *  A <button> with the inline Hohmann loader in it. At rest the loader shows
 *  the launch window: Earth (the craft riding with it) and Mars 44.3 degrees
 *  ahead, still. Pressed, the button is busy. A job that reports at once (as
 *  upload progress does) leaves straight from that still window. One that is
 *  really queued parks the craft after a moment: Earth and Mars go round at
 *  their true rates until the first progress comes in. Then the parking
 *  picture cross-fades to a fresh launch window (the Sun and the orbits stay
 *  put) and the transfer ellipse is inked from Earth's orbit to Mars's, the
 *  craft at its tip, as far as the job has got. At 100% the craft meets Mars
 *  (hohmann:arrive) and the button reads its done label, then comes back to
 *  rest at a fresh launch window by the same cross-fade.
 *
 *    <button type="button" class="hb" data-hohmann-button
 *            data-working="Publishing" data-done="Published">Publish</button>
 *
 *  The drawing is hohmann-loader.js, unchanged. This file only gives it a
 *  button: states, labels, aria, a polite status line, and a way to drive it.
 */
import { hohmannLoader } from './hohmann-loader.js';

const calm = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
const clamp = (v) => Math.min(1, Math.max(0, +v || 0));
const GRACE = 300;                                   // ms after a press before the craft parks
const SWAP = 250;                                    // ms for one picture to cross-fade to the next

export function hohmannButton(btn, opts = {}) {
    if (btn.hohmannButton) return btn.hohmannButton;
    const ds = btn.dataset;
    const pick = (k, d) => opts[k] ?? ds[k] ?? d;
    const reset = +pick('reset', 2600);              // ms showing the done label; 0 = stay done
    const auto = String(pick('auto', true)) !== 'false';
    // coast: seconds per parking orbit. The engine's own 2.6 s reads as a spinner at button size; 6 s is a calm drift
    const eng = { fine: String(pick('fine', false)) === 'true', coast: +pick('coast', 6) || 6, pace: pick('pace') };
    const off = [], added = [];
    const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); off.push(() => t.removeEventListener(ev, fn, o)); };
    let timer = 0, parkT = 0, hush = 0;              // the done word's stay, the grace before parking, a first word
    let dead = false;                                // destroyed: a job that outlives the button can no longer touch it

    /* ---- build: the loader first, then the label stack ---- */
    const orig = Array.from(btn.childNodes);         // destroy() puts these back, in this order
    let span = btn.querySelector(':scope > [data-hohmann-loader]');
    const own = !span;
    let prog, progHad = null;
    if (own) {
        span = document.createElement('span');
        span.setAttribute('data-hohmann-loader', '');
        prog = document.createElement('progress'); prog.max = 100;
        span.appendChild(prog); btn.prepend(span); added.push(span);
    } else {
        prog = span.querySelector('progress');
        if (!prog) { prog = document.createElement('progress'); prog.max = 100; span.appendChild(prog); added.push(prog); }
        progHad = prog.getAttribute('value');
        if (span.hohmannLoader) span.hohmannLoader.destroy();    // started by the engine's own boot: start it again at rest
    }
    span.classList.add('hb-orbit');
    span.setAttribute('aria-hidden', 'true');        // a button's children are presentational: the status line speaks
    btn.classList.add('hb-live');                    // the script drives the pressed look from here on (hohmann-button.css)

    // the label: the button's own content, plus the working and done words, stacked in one cell.
    // The cell is as wide as the word on show, and never narrower than the resting word: the pill is even at
    // rest, and keeps its size for a shorter busy or done word. When the word changes, the two cross-fade and
    // the cell eases to the new width (hohmann-button.css), so only a longer word grows the pill, and it never jumps.
    const label = document.createElement('span'); label.className = 'hb-label';
    const idle = document.createElement('span'); idle.className = 'hb-say hb-on';
    for (const n of Array.from(btn.childNodes)) if (n !== span) idle.appendChild(n);
    label.appendChild(idle); btn.appendChild(label);
    const text = (idle.textContent || '').replace(/\s+/g, ' ').trim();
    const say = { idle };
    for (const k of ['working', 'done']) {
        const t = pick(k, '');
        if (t) {
            const s = document.createElement('span'); s.className = 'hb-say'; s.textContent = t;
            s.setAttribute('aria-hidden', 'true');   // only the word on show is in the button's name
            label.appendChild(s); say[k] = s;
        }
    }
    const words = { working: pick('working', '') || text, done: pick('done', '') || text };
    let said = idle;                                 // the word on show
    const wide = new Map();                          // each word's own width in CSS px, kept by a ResizeObserver
    function fit(snap) {                             // the cell: the word on show, or the resting word if that is wider
        const w = wide.get(said);
        if (w == null) return;
        if (snap) label.style.transition = 'none';   // the first measure, or a font arriving: no ease
        label.style.width = Math.max(w, wide.get(idle) || 0) + 'px';
        if (snap) { void label.offsetWidth; label.style.transition = ''; }
    }
    const ro = new ResizeObserver((es) => {
        for (const e of es) {
            const b = e.borderBoxSize && e.borderBoxSize[0];
            wide.set(e.target, b ? b.inlineSize : e.contentRect.width);
        }
        fit(true);
    });
    for (const n of label.children) ro.observe(n);
    off.push(() => ro.disconnect());

    // the polite status line after the button (or the element named by data-status)
    let status = opts.status || (ds.status && document.getElementById(ds.status));
    const mine = !status;
    let roled = false;
    if (mine) {
        status = document.createElement('span'); status.className = 'hb-status'; status.setAttribute('role', 'status');
        added.push(status);
    } else if (!status.hasAttribute('role') && !status.hasAttribute('aria-live')) {
        status.setAttribute('role', 'status'); roled = true;   // the author's element speaks only as a live region
    }
    // after the button. A button made in script has no place for it yet: it goes in once there is one
    // (on focus, a press, or the first word said), and again if the button was moved into the page without it.
    const pin = () => {
        if (mine && btn.parentNode && !(status.parentNode && status.isConnected === btn.isConnected)) btn.after(status);
    };
    pin();

    /* ---- the loader: hohmann-loader.js, started at rest (value 0 = the launch window) ---- */
    // The engine reads value / max, so every write is a share of the <progress>'s own max (a hand-written one
    // may have none, which is 1).
    let loader = null, ghost = null;
    let seen = true, parked = false, landed = false; // on screen; in the parking orbit; put on Mars while off screen
    const put = (f) => { const w = Math.round(f * prog.max * 1e4) / 1e4; if (!prog.hasAttribute('value') || prog.value !== w) prog.value = w; };
    const unghost = () => { if (ghost) { ghost.remove(); ghost = null; } };
    function arm(at = 0) {                           // a share of the transfer: 0 the launch window, 1 the craft on Mars
        unghost();
        if (loader) loader.destroy();
        prog.value = Math.round(at * prog.max * 1e4) / 1e4;
        loader = hohmannLoader(span, eng);
    }
    arm();
    /* A fresh picture, cross-faded in over the one on show, so the icon never empties. The Sun and the two orbits
     * are the same in every picture and stay where they are; the planets, the craft and any ink are copied out of
     * the old drawing, laid over the new one, and fade out while their new places fade in. Under reduced motion,
     * off screen or in a hidden tab the new picture is simply there.                                              */
    const moves = (n) => n.matches('path, [transform]');      // the planets, the craft and the ink (not the Sun or orbits)
    function swap(at = 0) {
        const old = loader && span.querySelector(':scope > svg.hl-svg:not(.hb-ghost)');
        if (!old || calm.matches || !seen || document.hidden || typeof old.animate !== 'function') { arm(at); return; }
        const was = old.cloneNode(true);
        for (const n of Array.from(was.children)) if (!moves(n)) n.remove();
        was.classList.add('hb-ghost');
        arm(at);
        span.appendChild(was); ghost = was;
        const ease = 'cubic-bezier(.45, 0, .55, 1)';             // the same curve both ways: the two always add up to one
        was.animate([{ opacity: 1 }, { opacity: 0 }], { duration: SWAP, easing: ease, fill: 'forwards' })
            .onfinish = () => { if (ghost === was) unghost(); };
        const now = span.querySelector(':scope > svg.hl-svg:not(.hb-ghost)');
        if (now) for (const n of now.children) if (moves(n)) n.animate([{ opacity: 0 }, { opacity: 1 }], { duration: SWAP, easing: ease });
    }

    /* ---- state ---- */
    let state = 'idle', cur = 0, lastSaid = 0, lastTen = -1, stay = false, doneSay = '', ending = false, voice = 0;
    let ariaRest = null;                             // the author's own aria-disabled, put back when it comes to rest
    // at rest: the disabled attribute (or a disabled fieldset), and the author's aria-disabled, both mean "not now"
    const usable = () => !btn.matches(':disabled') && btn.getAttribute('aria-disabled') !== 'true';
    function show(k) {
        const s = say[k] || (k === 'waiting' && say.working) || say.idle;
        if (s === said) return;
        said = s;
        for (const n of label.children) {
            n.classList.toggle('hb-on', n === s);
            if (n === s) n.removeAttribute('aria-hidden'); else n.setAttribute('aria-hidden', 'true');
        }
        fit(false);
    }
    function speak(t) {
        const late = mine && !status.isConnected;
        pin();
        lastSaid = performance.now();
        const k = ++voice;
        clearTimeout(hush); hush = 0;
        if (late && status.isConnected) {            // only just put in the page: a live region speaks once it is there,
            status.textContent = '';                 // so its first word goes in a moment later
            hush = setTimeout(() => { hush = 0; if (!dead && k === voice) status.textContent = t; }, 120);
        } else status.textContent = t;
    }
    function hushed() { ++voice; clearTimeout(hush); hush = 0; status.textContent = ''; }
    function set(next) {
        if (dead || next === state) return;
        const from = state; state = next;
        btn.dataset.state = next;
        show(next === 'waiting' ? 'working' : next);
        if (from === 'idle') ariaRest = btn.getAttribute('aria-disabled');
        if (next !== 'idle') btn.setAttribute('aria-disabled', 'true');
        else if (ariaRest == null) btn.removeAttribute('aria-disabled');
        else btn.setAttribute('aria-disabled', ariaRest);
        btn.dispatchEvent(new CustomEvent('hohmann-button:state', { bubbles: true, detail: { state: next, from } }));
    }

    /* ---- the drawing follows the job, while it can be seen ----
     * The <progress> is the engine's source of truth, and the engine draws for as long as its value is ahead of
     * the drawing. So the job's share is written to it only while the button is on screen. Off screen it is kept,
     * and written once on the way back; a transfer still being inked when the button leaves the screen is
     * stopped where it is; and a job that finishes off screen starts the engine with the craft already on Mars,
     * so it arrives (and hohmann:arrive fires) on the next frame. Nothing is drawn that no one can see.
     * A press gives the job a moment (GRACE) before the craft parks. A job that reports in that time is inked
     * straight from the still launch window. One that reports later takes the craft out of the parking orbit:
     * left to itself the engine would run its clock on, fast, to the next window, and Earth would whirl round
     * once or twice in half a second. Here the parking picture cross-fades to a fresh launch window instead
     * (swap), and the craft leaves from there: from the left, so the transfer always reads left to right.      */
    function ink() {
        if (dead || (state !== 'waiting' && state !== 'working')) return;
        const v = ending ? 1 : cur;
        if (v > 0 && parkT) { clearTimeout(parkT); parkT = 0; }     // it reported within the grace: it never parks
        if (!seen) {
            if (ending && !landed) { landed = true; parked = false; arm(1); }
            else if (!parked && loader && loader.progress < prog.value / prog.max - 1e-4) arm(loader.progress);
            return;
        }
        if (v <= 0) return;
        if (parked) { parked = false; swap(); }      // the parking picture out, the launch window in, and the ink at once
        put(v);
    }
    const io = new IntersectionObserver((es) => { seen = es[es.length - 1].isIntersecting; ink(); });
    io.observe(btn); off.push(() => io.disconnect());

    function start() {
        if (dead || state !== 'idle' || !usable()) return false;
        clearTimeout(timer); clearTimeout(parkT);
        cur = 0; lastTen = -1; stay = false; doneSay = ''; ending = false; landed = false; parked = false;
        // no value on the <progress> is the parking orbit: it goes in only once the grace is over with no word yet
        parkT = setTimeout(() => {
            parkT = 0;
            if (!dead && state === 'waiting') { parked = true; prog.removeAttribute('value'); }
        }, GRACE);
        set('waiting');
        speak(words.working === text ? text + ', working' : words.working);
        btn.dispatchEvent(new CustomEvent('hohmann-button:start', { bubbles: true, detail: { button: btn } }));
        return true;
    }
    function progress(v) {
        if (dead || (state !== 'waiting' && state !== 'working')) return;   // only while busy: start() (or a press) first
        v = Math.max(cur, clamp(v));                 // forwards only (the engine would start a lower value over)
        if (v <= 0) return;                          // 0% is still waiting: the grace runs on, then the parking orbit
        cur = v;
        if (state === 'waiting') set('working');
        ink();
        const ten = Math.floor(v * 10);
        if (v < 1 && ten > lastTen && performance.now() - lastSaid > 3000) { lastTen = ten; speak(`${words.working}, ${ten * 10}%`); }
    }
    function done(o = {}) {
        if (dead || (state !== 'waiting' && state !== 'working')) return;
        stay = !!o.stay; doneSay = o.say || ''; cur = 1; ending = true;
        if (state === 'waiting') set('working');     // done before any progress: the whole transfer is drawn now
        ink();                                       // the craft finishes the transfer at its own pace, then arrives
    }
    function arrived() {
        if (dead || state === 'idle' || state === 'done') return;
        set('done');
        speak(doneSay || (words.done === text ? text + ', done' : words.done));
        if (reset > 0 && !stay) timer = setTimeout(() => rest(), reset);
    }
    function rest(o) {
        if (dead) return;
        clearTimeout(timer); stay = false;
        if (state === 'idle') return;
        const mid = state !== 'done';                // stopped part way: abandoned, or failed
        // still the launch window (stopped within the grace, before any ink): there is nothing to redraw
        const still = !parked && loader && loader.progress <= 0 && prog.hasAttribute('value') && +prog.value === 0;
        clearTimeout(parkT); parkT = 0; parked = false; ending = false;
        set('idle');
        if (o && o.say) speak(o.say);                // reset({ say: 'Could not publish' })
        else if (mid) hushed();                      // no stale "Backing up, 40%" left in the live region
        if (!still) swap();                          // the arrived plate (or the parking picture) to a fresh launch window
    }

    /* ---- wiring ---- */
    on(span, 'hohmann:arrive', arrived);
    on(btn, 'click', (e) => {
        // busy: a second press does nothing at all (no double submit), before anyone else hears it
        if (state !== 'idle') { e.preventDefault(); e.stopImmediatePropagation(); return; }
        // the author's aria-disabled (the focusable disabled pattern): no start and no form submit, but the
        // page's own listeners still hear the press, so it can say why
        if (btn.getAttribute('aria-disabled') === 'true') { e.preventDefault(); return; }
        if (auto) start();
    }, true);
    // The pressed look (.hb-press, the only one while the script runs): the main button, a touch, or a held Space.
    // A press slid off the button lets go of it (releasing there does nothing), and slid back on, it presses again.
    const press = (v) => btn.classList.toggle('hb-press', v && state === 'idle' && usable());
    let held = false;                                // the main button went down here and has not come up anywhere yet
    on(btn, 'pointerdown', (e) => { pin(); if (e.button === 0) { held = true; press(true); } });
    on(btn, 'pointerenter', (e) => { if (held && (e.buttons & 1)) press(true); });
    for (const ev of ['pointerup', 'pointercancel']) on(document, ev, () => { held = false; }, true);
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave', 'blur']) on(btn, ev, () => press(false));
    on(btn, 'keydown', (e) => { if (e.key === ' ') press(true); });
    on(btn, 'keyup', (e) => { if (e.key === ' ') press(false); });
    btn.dataset.state = 'idle';

    /* ---- API ---- */
    function destroy() {
        if (dead) return;                            // a second destroy(), or a stale one after a re-init, does nothing
        dead = true;
        clearTimeout(timer); clearTimeout(parkT); clearTimeout(hush);
        off.splice(0).forEach((f) => f());
        unghost();
        if (loader) { loader.destroy(); loader = null; }
        label.remove();
        btn.replaceChildren(...orig);
        if (!own) {
            span.classList.remove('hb-orbit'); span.removeAttribute('aria-hidden');
            if (!span.className) span.removeAttribute('class');
            if (progHad === null) prog.removeAttribute('value'); else prog.setAttribute('value', progHad);
        }
        added.splice(0).forEach((n) => n.remove());
        if (roled) status.removeAttribute('role');
        btn.classList.remove('hb-press', 'hb-live');
        if (state !== 'idle') {                      // busy: its aria-disabled was ours. At rest it is the author's
            if (ariaRest == null) btn.removeAttribute('aria-disabled'); else btn.setAttribute('aria-disabled', ariaRest);
        }
        delete btn.dataset.state;
        if (btn.hohmannButton === api) delete btn.hohmannButton;
    }
    const api = {
        start, progress, done,
        reset: rest,
        destroy,
        get state() { return state; },
        get loader() { return loader; },
    };
    btn.hohmannButton = api;
    return api;
}

/* ---- auto-start ---- */
function boot() { for (const b of document.querySelectorAll('[data-hohmann-button]')) hohmannButton(b); }
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
}
export default hohmannButton;
