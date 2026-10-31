/*
 *  AUTODRIFT // the page scrolls itself, with a mimosa leaf as its switch.
 *
 *  autoDrift({ speed, end, delay, resume, held })
 *    speed()   px per second, read every frame (so it can slow for a stretch)
 *    end()     the scroll position to stop at (default: the bottom)
 *    delay     ms before it starts (default 4000)
 *    resume    ms of quiet after a touch, wheel or key before it carries on (default 2000)
 *    held()    true while it should wait regardless (a dialog open, say)
 *
 *  Any wheel, touch, key or press hands control back: the leaf flinches shut,
 *  as the sensitive plant does, and opens again as the drift picks up. The
 *  switch itself turns the drift off and on for good. Reduced motion: no drift
 *  and no switch.
 */
import { mimosaToggle } from './mimosa-toggle.js';

export function autoDrift(o = {}) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || location.search.includes('still')) return null;
    const speed = o.speed || (() => innerHeight * 0.3);
    const end = o.end || (() => document.documentElement.scrollHeight - innerHeight);
    const delay = o.delay ?? 4000, resume = o.resume ?? 2000, held = o.held || (() => false);

    const box = document.createElement('label');
    box.className = 'ad';
    box.innerHTML = '<span class="ad-t">Auto-scroll</span>';
    const input = document.createElement('input');
    input.type = 'checkbox'; input.setAttribute('role', 'switch'); input.checked = true;
    input.setAttribute('data-mimosa-toggle', '');
    box.append(input);
    document.body.append(box);
    const leaf = mimosaToggle(input, { size: 'compact', recover: resume, habituate: false, seed: 4 });

    let on = true, paused = 0, pos = 0, lastSet = null, lastT = 0, running = false;
    const started = performance.now();
    function stop() {
        paused = performance.now(); lastSet = null;
        if (running) { running = false; leaf.touch && leaf.touch(); }
    }
    const mine = (e) => box.contains(e.target);
    ['wheel', 'touchstart', 'touchmove', 'keydown', 'mousedown'].forEach((ev) =>
        addEventListener(ev, (e) => { if (!mine(e)) stop(); }, { passive: true }));
    // a flick keeps coasting after the finger lifts: wait for it to settle
    addEventListener('scroll', () => { if (paused && performance.now() - paused < resume) paused = performance.now(); }, { passive: true });
    document.querySelectorAll('a[href^="#"]').forEach((a) => a.addEventListener('click', stop));
    input.addEventListener('change', () => { on = input.checked; paused = 0; lastSet = null; running = false; });

    function tick(t) {
        const dt = Math.min(0.05, (t - lastT) / 1000 || 0); lastT = t;
        const stopAt = end();
        const idle = !paused || t - paused > resume;
        if (on && idle && !held() && t - started > delay && scrollY < stopAt - 1) {
            // Phones report the new position a frame late, so allow a few frames' worth of
            // our own steps before deciding someone else moved the page (a scrollbar drag).
            if (lastSet !== null && Math.abs(scrollY - lastSet) > 40) stop();
            else {
                if (lastSet === null) pos = scrollY;
                running = true;
                pos = Math.min(stopAt, pos + speed() * dt);
                scrollTo({ top: pos, behavior: 'instant' }); lastSet = pos;   // instant: a page-wide smooth scroll would turn each step into a glide
            }
        } else if (held()) lastSet = null;
        box.classList.toggle('is-gone', (scrollY >= stopAt - 2 && on) || held());
        requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    return { stop, box, get on() { return on; } };
}
