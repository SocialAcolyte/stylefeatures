/*
 *  AUTODRIFT // the page scrolls itself, with a mimosa leaf as its switch.
 *
 *  autoDrift({ speed, end, delay, resume, held, lock })
 *    speed()   px per second, read every frame (so it can slow for a stretch)
 *    end()     the scroll position to stop at (default: the bottom)
 *    delay     ms before it starts (default 4000)
 *    ramp      ms it takes to ease up to full speed, each time it (re)starts (default 1400)
 *    resume    ms of quiet after a touch, wheel or key before it carries on (default 2000)
 *    held()    true while it should wait regardless (a dialog open, say)
 *    lock      true: while the drift is on, swipes, the wheel and scroll keys
 *              don't move the page at all. The leaf flinches and a note points
 *              at the switch, which is the one way to take over. Once the drift
 *              reaches end() the page is free for good. (default false)
 *
 *  Without lock, any wheel, touch, key or press hands control back: the leaf
 *  flinches shut, as the sensitive plant does, and opens again as the drift
 *  picks up. The switch itself turns the drift off and on for good. Reduced
 *  motion: no drift and no switch.
 */
import { mimosaToggle } from './mimosa-toggle.js';

const SCROLL_KEYS = new Set([' ', 'PageDown', 'PageUp', 'ArrowDown', 'ArrowUp', 'Home', 'End']);

export function autoDrift(o = {}) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || location.search.includes('still')) return null;
    const speed = o.speed || (() => innerHeight * 0.3);
    const end = o.end || (() => document.documentElement.scrollHeight - innerHeight);
    const delay = o.delay ?? 4000, ramp = o.ramp ?? 1400, resume = o.resume ?? 2000, held = o.held || (() => false);

    const box = document.createElement('label');
    box.className = 'ad';
    box.innerHTML = '<span class="ad-t">Auto-scroll</span>';
    const input = document.createElement('input');
    input.type = 'checkbox'; input.setAttribute('role', 'switch'); input.checked = true;
    input.setAttribute('data-mimosa-toggle', '');
    box.append(input);
    document.body.append(box);
    const leaf = mimosaToggle(input, { size: 'compact', recover: resume, habituate: false, seed: 4 });

    let on = true, paused = 0, pos = 0, lastSet = null, lastT = 0, running = false, done = false, since = 0;
    const started = performance.now();
    function stop() {
        paused = performance.now(); lastSet = null;
        if (running) { running = false; leaf.touch && leaf.touch(); }
    }
    const mine = (e) => box.contains(e.target);

    if (o.lock) {
        // the page is the drift's while it runs: a swipe only makes the leaf flinch and says where the switch is
        const say = document.createElement('span');
        say.className = 'ad-say'; say.setAttribute('aria-hidden', 'true');
        say.textContent = matchMedia('(hover: none)').matches ? 'It scrolls by itself. Tap here to take over.' : 'It scrolls by itself. Click here to take over.';
        box.append(say);
        let lastNudge = 0, sayT = 0;
        const locked = () => on && !done && !held();
        const nudge = () => {
            const t = performance.now();
            if (t - lastNudge > 900) { lastNudge = t; leaf.touch && leaf.touch(); }
            box.classList.add('is-saying'); clearTimeout(sayT);
            sayT = setTimeout(() => box.classList.remove('is-saying'), 2600);
        };
        const block = (e) => { if (locked() && !mine(e) && e.cancelable) { e.preventDefault(); nudge(); } };
        addEventListener('wheel', block, { passive: false });
        addEventListener('touchmove', block, { passive: false });
        addEventListener('keydown', (e) => {
            if (SCROLL_KEYS.has(e.key) && !e.target.closest('input, textarea, select, button, [contenteditable]')) block(e);
        });
        input.addEventListener('change', () => { if (!input.checked) box.classList.remove('is-saying'); });
    } else {
        ['wheel', 'touchstart', 'touchmove', 'keydown', 'mousedown'].forEach((ev) =>
            addEventListener(ev, (e) => { if (!mine(e)) stop(); }, { passive: true }));
        // a flick keeps coasting after the finger lifts: wait for it to settle
        addEventListener('scroll', () => { if (paused && performance.now() - paused < resume) paused = performance.now(); }, { passive: true });
    }
    document.querySelectorAll('a[href^="#"]').forEach((a) => a.addEventListener('click', stop));
    input.addEventListener('change', () => { on = input.checked; paused = 0; lastSet = null; running = false; });

    function tick(t) {
        const dt = Math.min(0.05, (t - lastT) / 1000 || 0); lastT = t;
        const stopAt = end();
        const idle = !paused || t - paused > resume;
        if (on && !done && idle && !held() && t - started > delay && scrollY < stopAt - 1) {
            // Phones report the new position a frame late, so allow a few frames' worth of
            // our own steps before deciding someone else moved the page (a scrollbar drag).
            // Locked, that someone is followed rather than obeyed: the drift carries on from there.
            if (lastSet !== null && Math.abs(scrollY - lastSet) > 40) { if (o.lock) pos = lastSet = scrollY; else stop(); }
            else {
                if (lastSet === null) { pos = scrollY; since = t; }
                running = true;
                const k = Math.min(1, (t - since) / ramp), ease = k * k * (3 - 2 * k);   // pull away gently, never lurch
                pos = Math.min(stopAt, pos + speed() * ease * dt);
                scrollTo({ top: pos, behavior: 'instant' }); lastSet = pos;   // instant: a page-wide smooth scroll would turn each step into a glide
            }
        } else if (held()) lastSet = null;
        if (o.lock && on && scrollY >= stopAt - 2) done = true;   // arrived: the page is theirs now
        box.classList.toggle('is-gone', (scrollY >= stopAt - 2 && on) || done || held());
        requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    return { stop, box, get on() { return on; }, get done() { return done; } };
}
