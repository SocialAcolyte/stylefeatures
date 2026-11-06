/*
 *  TEMPER-BUTTON // the button part of temper-run.
 *
 *  A <button> with a face of ground steel. Press it and temper colours bloom
 *  from under the press, pale straw to straw and gold; a long press runs on to
 *  purple, and a moment later the face is rubbed bright again. With data-hold
 *  it is hold-to-confirm: it fires when the colour under the press turns blue.
 *
 *    <button data-temper-button type="submit">Save</button>
 *    <button data-temper-button data-hold="1400" type="button">Hold to discard</button>
 *
 *  The steel is temper-run.js, unchanged: its button kind. This file starts it
 *  on buttons only, and adds what a button needs:
 *    - sliding off a press cancels it, as on a native button (the engine
 *      captures the pointer, which would let a release anywhere click it, and
 *      let a hold confirm while held off the button);
 *    - temper-run:cancel says why, in detail.reason: release, slide, blur,
 *      scroll (the browser took the touch to scroll), or click (a hold button
 *      got a click with no press behind it: a screen reader in browse mode,
 *      voice control, el.click());
 *    - a touch that turns into a scroll was not a press: the face is rubbed
 *      bright again straight after;
 *    - aria-disabled="true" makes it inert but keeps it focusable (busy);
 *    - a plain button runs faster than the engine's own, 1.4 to 2 by the
 *      width of its face, so a quick click leaves straw;
 *    - classes for the styles: tb--hold on a hold button (its hold time in
 *      --tb-hold), tb--keep on one that keeps its record (data-reset="0").
 */
import { temperRun } from './temper-run.js';

const SLOP = { mouse: 8, pen: 8, touch: 16 };    // css px off the button before a press lets go
const KEYS = new Set([' ', 'Enter']);
const BARE = 120;                                // ms: a click this soon after a press ends belongs to it
// a plain button's speed, from the width of its face. A narrow plate fills with heat sooner: at 2, half a
// second's press tempers an 85 px face from end to end; at 1.4 a click still leaves pale straw there.
const speedFor = (w) => Math.round((1.4 + 0.6 * Math.min(1, Math.max(0, (w - 100) / 40))) * 100) / 100;

export function temperButton(el, opts = {}) {
    if (el.__temperButton) el.__temperButton();
    const ds = el.dataset;
    // a hold, as the engine reads it: a bare data-hold, true, or a number of ms above 0
    const h = opts.hold ?? ds.hold;
    const hold = h === '' || h === true || +h > 0;
    const auto = !hold && (opts.speed ?? ds.speed) == null;
    // for the styles: a hold button, and how long its hold takes (forced colours draw it filling); and a
    // button whose record is kept (reset 0, as the engine reads it), which is never rubbed bright
    const r = opts.reset ?? ds.reset;
    el.classList.toggle('tb--hold', hold);
    el.classList.toggle('tb--keep', r != null && !(+r > 0));
    if (hold) el.style.setProperty('--tb-hold', Math.round((h === '' || h === true ? 1200 : +h) / Math.max(0.05, +(opts.speed ?? ds.speed ?? 1) || 1)) + 'ms');

    const ac = new AbortController();
    const on = (type, fn, capture = false) => el.addEventListener(type, fn, { capture, signal: ac.signal });
    const inert = () => el.getAttribute('aria-disabled') === 'true';
    let t = null, speed = 0, manual = false;
    let down = false, upAt = -Infinity, why = 'release', sending = false, panT = 0, tuneT = 0;

    // Everything here is added before the engine starts, so it runs ahead of the engine's own listeners.

    // aria-disabled="true": it stays in the tab order and is announced as dimmed,
    // but a press does not heat it and a click (Space, Enter, form submission) is stopped
    on('pointerdown', (e) => { if (inert()) e.stopImmediatePropagation(); }, true);
    on('keydown', (e) => { if (inert() && KEYS.has(e.key)) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
    on('click', (e) => { if (inert()) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);

    // whether a press is on, and what ended it
    const up = (reason) => { if (down) why = reason; down = false; upAt = performance.now(); };
    on('pointerdown', (e) => { if (e.button === 0) { down = true; why = 'release'; clearTimeout(panT); } }, true);
    on('keydown', (e) => { if (KEYS.has(e.key) && !e.repeat) { down = true; why = 'release'; clearTimeout(panT); } }, true);
    on('pointerup', () => up('release'), true);
    on('keyup', (e) => { if (KEYS.has(e.key)) up('release'); }, true);
    on('blur', () => up('blur'));
    // the browser took the touch to scroll (or zoom). That was not a press: rub the face bright straight after
    on('pointercancel', () => {
        up('scroll');
        clearTimeout(panT);
        panT = setTimeout(() => { if (!down && t && t.state !== 'cold' && t.state !== 'confirmed') t.reset(); }, 300);
    }, true);

    // slide off to cancel. Losing the capture runs the engine's own release: the heat
    // stops, a hold button fires temper-run:cancel, and the release no longer clicks
    on('pointermove', (e) => {
        if (!el.hasPointerCapture(e.pointerId)) return;
        const r = el.getBoundingClientRect(), s = SLOP[e.pointerType] ?? 8;
        if (e.clientX < r.left - s || e.clientX > r.right + s || e.clientY < r.top - s || e.clientY > r.bottom + s) {
            up('slide');
            el.releasePointerCapture(e.pointerId);
        }
    });

    // the engine's cancel carries no detail: stop it here and send one that says why
    const send = (reason) => {
        sending = true;
        try { el.dispatchEvent(new CustomEvent('temper-run:cancel', { bubbles: true, detail: { reason } })); } finally { sending = false; }
    };
    on('temper-run:cancel', (e) => {
        if (sending || e.target !== el) return;
        e.stopImmediatePropagation();
        send(why);
    }, true);

    // a hold button stops plain clicks. One with no press behind it would do nothing and say nothing
    // (a screen reader in browse mode, voice control and el.click() can only click), so say so
    on('click', () => {
        if (!hold || !t || down || t.state === 'confirmed' || performance.now() - upAt < BARE) return;
        send('click');
    }, true);

    function start() {
        clearTimeout(tuneT);
        if (t) t();
        const o = { ...opts, kind: 'button' };
        if (auto) o.speed = speed = speedFor(el.offsetWidth || 140);
        t = temperRun(el, o);
        // a hold button's hint is its description. As page text too, browse mode would read it a second
        // time; a description is still read from an aria-hidden element
        const hint = el.nextElementSibling;
        if (hold && hint && hint.classList.contains('tr-sr') && !hint.hasAttribute('aria-live')) hint.setAttribute('aria-hidden', 'true');
    }
    start();

    // the engine reads its speed when it starts. A button that starts hidden, or changes width, is
    // started again with the speed for its face, once that face is bright and nothing presses it
    function retune() {
        clearTimeout(tuneT);
        const w = el.offsetWidth;
        if (manual || !w || Math.abs(speedFor(w) - speed) < 0.1 || down || t.state !== 'cold') return;
        start();
    }
    if (auto && typeof ResizeObserver === 'function') {
        const ro = new ResizeObserver(retune);
        ro.observe(el);
        ac.signal.addEventListener('abort', () => ro.disconnect());
        on('temper-run:state', (e) => { if (e.detail.state === 'cold') { clearTimeout(tuneT); tuneT = setTimeout(retune, 0); } });
    }

    function destroy() {
        ac.abort(); clearTimeout(panT); clearTimeout(tuneT);
        if (el.__temperRun === t) t();
        el.classList.remove('tb--hold', 'tb--keep'); el.style.removeProperty('--tb-hold');
        if (el.__temperButton === destroy) delete el.__temperButton;
    }
    Object.defineProperties(destroy, {
        state: { get: () => t.state },
        speed: { get: () => (auto ? speed : Math.max(0.05, +(opts.speed ?? ds.speed ?? 1) || 1)) },
        engine: { get: () => t },
    });
    destroy.destroy = destroy;
    destroy.reset = () => t.reset();
    destroy.thicknessAt = (fx = 0.5, fy = 0.5) => t.thicknessAt(fx, fy);
    destroy.step = (dt) => { manual = true; t.step(dt); };
    el.__temperButton = destroy;
    return destroy;
}

if (typeof document !== 'undefined') {
    const boot = () => document.querySelectorAll('button[data-temper-button]').forEach((el) => el.__temperButton || temperButton(el));
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
}
