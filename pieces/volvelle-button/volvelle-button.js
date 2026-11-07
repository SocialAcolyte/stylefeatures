/*
 *  VOLVELLE-BUTTON // the button part of dragon-volvelle.
 *
 *  A <button> with Peter Apian's lunar dragon volvelle (Astronomicum Caesareum, Ingolstadt 1540) in it: the paper
 *  disc and the ring of the printed mater it turns on, cut round from the plate's own pixels (assets/face.webp,
 *  ring.webp, disc.webp). Press it and a thumb takes CAPVT's tab: the disc turns a few degrees, and is held there
 *  while the button is down (a finger takes it as the button is pressed, since a touch may still turn into a scroll
 *  until it lifts). Let go and the button is busy: the disc turns on slowly while the work is done,
 *  following its progress (a whole job is one turn, home again at 100%), never faster than 36 degrees a second.
 *  The moment the work is done the button says so, and the disc comes to rest on the next sign of the zodiac:
 *  quick work sets it a sign or two on, long work brings it home, where it was printed.
 *
 *    <button type="button" class="vb" data-volvelle-button
 *            data-working="Uploading" data-done="Uploaded">Upload</button>
 *
 *  dragon-volvelle.js, unchanged, draws the disc: its canvas turns the disc's own pixels, rigid, about the centre
 *  printed on it, over the restored mater. This file gives it a button (states, words, aria, a polite status line,
 *  the press) and the pace: it says where the disc is, frame by frame.
 */
import { dragonVolvelle } from './dragon-volvelle.js';

const calm = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
const clamp = (v) => Math.min(1, Math.max(0, +v || 0));
const FACE = new URL('./assets/face.webp', import.meta.url).href;
const SS = 2;               // the canvas is drawn at twice the screen's pixels (see dense())
const SIGN = 30;            // deg: one sign of the zodiac. The disc comes to rest on one when the work is done
const TAKE = 5;             // deg: a press turns the disc this far (a thumb on CAPVT's tab), and holds it there
const TOUCH = 90;           // ms: a finger's press shows on the face after this long, in case it is starting a scroll
const HOLD = 28;            // rad/s: the disc follows the pace on a stiff, critically damped spring (about 0.15 s)
const ACC = 40, DEC = 50;   // deg/s2: the most the pace ever changes, speeding up and slowing down
const SET = 28;             // deg/s: carrying the disc on to its sign, once the work is over (or its own pace, if more)
const LAG = 0.8;            // s: the disc follows the work's progress about this far behind it
const STOP = 0.35;          // s: a job given up brakes to a stop where it is, in this time
const STEP = 1 / 240;       // s: the pace is worked out in steps this long

export function volvelleButton(btn, opts = {}) {
    if (btn.volvelleButton) return btn.volvelleButton;
    const ds = btn.dataset;
    const pick = (k, d) => opts[k] ?? ds[k] ?? d;
    const reset = +pick('reset', 2600);                 // ms showing the done word; 0 = stay done until reset()
    const auto = String(pick('auto', true)) !== 'false';
    const turn = Math.max(6, +pick('turn', 24) || 24);   // seconds a turn while there is no value yet
    const WAIT = 360 / turn;                            // deg/s while it waits: 15
    const MAX = Math.max(WAIT, +pick('speed', 36) || 36);  // deg/s: the most the work ever turns it
    const off = [], added = [];
    const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); off.push(() => t.removeEventListener(ev, fn, o)); };
    let timer = 0, dead = false;

    /* ---- build: the roundel first, then the label stack ---- */
    const orig = Array.from(btn.childNodes);            // destroy() puts these back, in this order
    let face = btn.querySelector(':scope > img.vb-face');   // written in the HTML, the roundel shows without JS too
    if (!face) {
        face = document.createElement('img');
        face.className = 'vb-face'; face.alt = ''; face.width = face.height = 384; face.decoding = 'async';
        face.src = pick('face', FACE);
    }
    face.classList.add('dv-img');                       // the engine's plate: at home this <img> IS the roundel
    const disc = document.createElement('span'); disc.className = 'vb-disc';
    disc.setAttribute('aria-hidden', 'true');           // a button's children are presentational: the status line speaks
    const plate = document.createElement('span'); plate.className = 'dv-plate';
    const bar = document.createElement('progress'); bar.max = 1; bar.value = 0;    // value 0: home, still
    plate.appendChild(face); disc.append(plate, bar);
    btn.prepend(disc); added.push(disc);

    // the label: the button's own word, plus the working and done words, stacked in one grid cell. The cell is as
    // wide as the widest of them, so the pill is the same size in every state and nothing beside it reflows. Written
    // in the markup (span.vb-label, see the README), the pill has that width before the script runs; otherwise it is
    // built here from the button's text and data-working / data-done.
    let label = btn.querySelector(':scope > .vb-label');
    const ownLabel = !label;
    const was = [];                                     // an adopted label's words as written, for destroy()
    const say = {};
    let wrap = null;                                    // a written label with no stack of words: its text, wrapped
    if (label) {
        if (!label.querySelector(':scope > .vb-say')) {
            wrap = document.createElement('span'); wrap.className = 'vb-say vb-on';
            wrap.append(...label.childNodes); label.appendChild(wrap);
        }
        for (const s of label.querySelectorAll(':scope > .vb-say')) {
            if (s !== wrap) was.push([s, s.className, s.getAttribute('aria-hidden')]);
            const k = s.dataset.say || 'idle';
            if (!say[k]) say[k] = s;
        }
        if (!say.idle) say.idle = label.querySelector(':scope > .vb-say');
    } else {
        label = document.createElement('span'); label.className = 'vb-label';
        const idle = document.createElement('span'); idle.className = 'vb-say vb-on';
        for (const n of Array.from(btn.childNodes)) if (n !== disc) idle.appendChild(n);
        label.appendChild(idle); btn.appendChild(label);
        say.idle = idle;
    }
    const text = (say.idle.textContent || '').replace(/\s+/g, ' ').trim();
    const extra = [];                                   // words the script added to a written label
    for (const k of ['working', 'done']) {
        const t = opts[k] ?? (say[k] ? '' : ds[k] || '');
        if (!t) continue;
        if (say[k]) { if (opts[k] != null) { was.push([say[k], null, null, say[k].textContent]); say[k].textContent = t; } continue; }
        const s = document.createElement('span'); s.className = 'vb-say'; s.textContent = t;
        s.dataset.say = k;
        s.setAttribute('aria-hidden', 'true');          // only the word on show is in the button's name
        label.appendChild(s); say[k] = s;
        if (!ownLabel) extra.push(s);
    }
    const word = (k) => (say[k] ? say[k].textContent.replace(/\s+/g, ' ').trim() : text);
    const words = { working: word('working'), done: word('done') };
    let said = null;                                    // the word on show

    // the polite status line after the button (or the element named by data-status)
    let status = opts.status || (ds.status && document.getElementById(ds.status));
    const mine = !status;
    let roled = false;
    if (mine) {
        status = document.createElement('span'); status.className = 'vb-status'; status.setAttribute('role', 'status');
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

    /* ---- the volvelle: dragon-volvelle.js on the roundel, look-only (no drag-to-turn in a button) ---- */
    // speed: the engine's own spring is stepped to where the pace puts the disc (see feed), so its speed cap must
    // not hold it back there. Its own loop never moves the disc: the button holds it, and draws each frame itself.
    const loader = dragonVolvelle(disc, { touch: false, turn, speed: 3600, doneText: '' });
    // the engine adds its own live region; inside a button nothing would read it (and a <p> may not sit in one),
    // so it is taken out. The status line after the button speaks instead.
    const engineSays = disc.querySelector(':scope > .dv-status');
    if (engineSays) engineSays.remove();

    // the engine draws its canvas at most 2x. The plate is laid out larger by --vb-k and scaled back down
    // (volvelle-button.css), so the canvas is drawn at twice the screen's own pixels on any screen, and the turned
    // disc is as sharp as the resting <img>. The engine itself is unchanged.
    let dpr = 0, mq = null;
    function dense() {
        const d = devicePixelRatio || 1;
        if (d !== dpr) { dpr = d; disc.style.setProperty('--vb-k', String(SS * d / Math.min(2, d))); }
        if (mq) mq.removeEventListener('change', dense);
        mq = matchMedia(`(resolution: ${d}dppx)`);
        mq.addEventListener('change', dense);
    }
    dense();
    off.push(() => mq && mq.removeEventListener('change', dense));

    /* ---- the pace ----
     * Two layers, in degrees since the page loaded:
     *   the plan, X, moves at a pace u that only ever changes gently (ACC, DEC);
     *   the disc, A, follows the plan on a stiff, critically damped spring (HOLD), and never passes it.
     * A press steps the plan on by TAKE and the disc follows in about 0.15 s; nothing else ever changes speed
     * suddenly. Both only go forwards, as the engine only turns the disc forwards.
     *   still   the plan stays where it is
     *   wait    busy, no value yet: it goes on at WAIT
     *   work    it follows the work: aim = where the work's share of the job puts it (LAG behind, at most MAX)
     *   set     the work is over: it is carried on to the sign `to`, and stops there
     *   stop    a job given up: it brakes to a stop where it is, in STOP seconds                                 */
    let X = 0, u = 0, A = 0, w = 0, mode = 'still', aim = 0, to = 0, cap = SET, brake = DEC, fed = 0;
    let from = 0, span = 360, began = false;
    let raf = 0, last = 0, away = 0;
    function plan(h) {
        let want = 0, dec = DEC;
        if (mode === 'wait') want = WAIT;
        else if (mode === 'work') { const g = aim - X; if (g > 0) want = Math.min(MAX, Math.sqrt(2 * DEC * g), Math.max(0.6, g / LAG)); }
        else if (mode === 'set') { const g = to - X; if (g > 0) want = Math.min(cap, Math.sqrt(2 * DEC * g) + 0.3); }
        else if (mode === 'stop') dec = brake;
        u = Math.max(0, u + Math.max(-dec * h, Math.min(ACC * h, want - u)));
        X += u * h;
        if (mode === 'work' && X > aim) { X = aim; u = 0; }        // never ahead of the work
        if (mode === 'set' && X >= to) { X = to; u = 0; }
        // the disc: a critically damped spring to the plan, forwards only, never past it
        w += (HOLD * HOLD * (X - A) - 2 * HOLD * w) * h;
        if (w < 0) w = 0;
        A += w * h;
        if (A > X) { A = X; w = Math.min(w, u); }
    }
    function run(dt) { for (let n = Math.max(1, Math.ceil(dt / STEP - 1e-9)), h = dt / n; n > 0; n--) plan(h); }
    // nothing moves: the plan has stopped (for good, or until the work reports again) and the disc is on it
    function still() {
        if (u > 1e-4 || X - A > 1e-4 || w > 1e-3) return false;
        return mode === 'still' || mode === 'stop' || (mode === 'set' && X >= to) || (mode === 'work' && aim - X < 1e-6);
    }
    // tell the engine where the disc is. It turns the disc only forwards: a share of its turn that is smaller than
    // the last one means the next turn. Its own spring is then stepped until the disc is there, and drawn once.
    function feed(final) {
        if (dead || (!(A > fed + 1e-9) && !final)) return;
        if (!seen) { watch(true); return; }             // drawn as it comes back into view (see near())
        const T = A / 360, big = A - fed > 2;
        fed = Math.max(fed, A);
        loader.hold(true);                              // its own loop stays off: the button draws, once a frame
        loader.value = T - Math.floor(T);
        loader.advance(final || big ? 20 : 2.5);
    }
    function frame(now) {
        raf = 0;
        if (dead) return;
        const dt = last ? Math.min(1 / 30, (now - last) / 1000) : 1 / 60;  // a stalled frame pauses it, never a jump
        last = now;
        run(dt);
        if (still()) { land(); return; }                // at rest: nothing runs
        feed(false);
        raf = requestAnimationFrame(frame);
    }
    function land() { A = X; w = u = 0; if (mode !== 'work') mode = 'still'; feed(true); }
    function go() {
        if (dead || raf) return;
        if (!seen) { if (!away) away = performance.now(); watch(true); return; }
        last = 0; raf = requestAnimationFrame(frame);
    }
    // out of sight (scrolled well away, or another tab) nothing runs at all. What would have happened meanwhile is
    // worked out when it matters: before the plan changes, and as it comes back into view (a quarter screen early),
    // so the first frame it is seen in is already in place, with no catching up. A jump straight back into view (Tab
    // to the button, a link, scrollIntoView) is painted before the observer can say so: while the disc is out of
    // sight with turning to catch up, a scroll listener puts it in place first (scroll events come before the paint).
    let watching = false;
    function watch(v) {
        if (v === watching) return;
        watching = v;
        if (v) addEventListener('scroll', near, { capture: true, passive: true });
        else removeEventListener('scroll', near, { capture: true });
    }
    function near() {
        if (dead || seen) return watch(false);
        if (document.hidden) return;
        const r = disc.getBoundingClientRect(), m = innerHeight / 4;
        if (r.bottom > -m && r.top < innerHeight + m && r.right > 0 && r.left < innerWidth) { inView = true; sight(); }
    }
    off.push(() => watch(false));
    function sync() {
        if (!away) return;
        const now = performance.now();
        let t = Math.min(120, (now - away) / 1000);
        away = now;
        while (t > 1e-6 && !still()) { const h = Math.min(1 / 30, t); run(h); t -= h; }
    }
    let inView = true, seen = !document.hidden;
    function sight() {
        const s = inView && !document.hidden;
        if (s === seen) return;
        seen = s;
        if (s) {
            watch(false);
            sync(); away = 0;
            if (still()) land(); else { feed(false); go(); }
        } else if (raf) { cancelAnimationFrame(raf); raf = 0; away = performance.now(); watch(true); }
    }
    const io = new IntersectionObserver((es) => { inView = es[es.length - 1].isIntersecting; sight(); }, { rootMargin: '25% 0px' });
    io.observe(disc); off.push(() => io.disconnect());
    on(document, 'visibilitychange', sight);
    const home = () => Math.ceil(X / 360 - 1e-9) * 360;  // home ahead: where it was printed
    function put(x) { X = A = x; u = w = 0; mode = 'still'; feed(true); }   // reduced motion: there at once

    // the press: a thumb takes CAPVT's tab and turns the disc TAKE degrees, held while the button is down. Once per
    // press: slid off and back on, it does not go further. Slid off and let go, the disc stays where the hand left it,
    // as paper does. The disc only turns forwards, so a turn is never taken back: a mouse or a held Space takes the
    // tab as it goes down, but a finger only when the button is really pressed (its click: see start()), since a
    // touch can turn into a scroll at any moment until it lifts.
    let anchor = null;
    function take() {
        if (dead || calm.matches) return;
        sync();
        if (anchor === null) anchor = X;
        if (X < anchor + TAKE) {
            X = anchor + TAKE;
            if (mode === 'set' && X >= to) { mode = 'still'; u = 0; }   // the hand got to its sign first
            go();
        }
    }

    /* ---- state ---- */
    let state = 'idle', cur = 0, lastSaid = 0, lastTen = -1, stay = false, doneSay = '';
    const busy = () => state === 'waiting' || state === 'working';
    // aria-disabled is the page's at rest (the focusable disabled pattern): the script never writes it then. From the
    // press to the rest after done it is the script's ("true": a press does nothing), and what the page writes
    // meanwhile is kept, so its latest word is what the button goes back to at rest (and at destroy()). A press that
    // starts it writes "true" only once its click has been dispatched, so the page's own click listener, asking
    // "is it aria-disabled?" to say why a press did nothing, hears the page's answer, not the script's.
    let author = null, pressing = false, shutT = 0;
    const heed = new MutationObserver((r) => hear(r));
    heed.observe(btn, { attributes: true, attributeFilter: ['aria-disabled'] });
    off.push(() => heed.disconnect());
    function hear(r) {                                  // the page wrote it (the script's own writes are never heard)
        if (!r.length || state === 'idle') return;      // at rest it is the page's, as it stands
        author = btn.getAttribute('aria-disabled');
        if (author !== 'true') own('true');             // still busy: kept for the rest, and the button stays shut
    }
    function own(v) {                                   // the script writes it: the page's writes before this are heard first
        hear(heed.takeRecords());
        if (v == null) btn.removeAttribute('aria-disabled'); else btn.setAttribute('aria-disabled', v);
        heed.takeRecords();                             // and this one is not
    }
    function show(k) {
        const s = say[k] || (k === 'waiting' && say.working) || say.idle;
        if (s === said) return;
        said = s;
        for (const n of label.children) {
            if (!n.classList.contains('vb-say')) continue;
            n.classList.toggle('vb-on', n === s);
            if (n === s) n.removeAttribute('aria-hidden'); else n.setAttribute('aria-hidden', 'true');
        }
    }
    show('idle');
    function speak(t) { pin(); status.textContent = t; lastSaid = performance.now(); }
    function set(next) {
        if (dead || next === state) return;
        hear(heed.takeRecords());                       // what the page wrote while busy, before the state changes
        const from = state; state = next;
        btn.dataset.state = next;
        show(next === 'waiting' ? 'working' : next);
        if (from === 'idle') author = btn.getAttribute('aria-disabled');   // going busy: the page's own, as it is now
        clearTimeout(shutT); shutT = 0;
        if (next === 'idle') own(author);
        else if (pressing) shutT = setTimeout(() => { shutT = 0; if (!dead && state !== 'idle') own('true'); });   // after its click
        else own('true');
        btn.dispatchEvent(new CustomEvent('volvelle-button:state', { bubbles: true, detail: { state: next, from } }));
    }
    function start() {
        // not while busy or done, nor when the page says no: disabled (or a disabled fieldset), or its aria-disabled
        if (dead || state !== 'idle' || btn.matches(':disabled') || btn.getAttribute('aria-disabled') === 'true') return false;
        clearTimeout(timer);
        cur = 0; lastTen = -1; stay = false; doneSay = ''; began = false;
        if (!calm.matches) {
            if (anchor === null) take();                // no tab taken yet (a finger, Enter, or a script): the thumb now
            sync(); mode = 'wait'; go();
        }
        anchor = null;
        set('waiting');
        speak(words.working === text ? text + ', working' : words.working);
        btn.dispatchEvent(new CustomEvent('volvelle-button:start', { bubbles: true, detail: { button: btn } }));
        return true;
    }
    function begin() {                                  // the first value of a job: where has the disc got to?
        if (began) return;
        began = true;
        from = aim = X;
        const f = ((from % 360) + 360) % 360;
        span = f < 1e-6 ? 360 : 360 - f;                // at 100% it is home, where it was printed
        if (span < 90) span += 360;                     // less than a quarter turn to go: the next turn as well
    }
    function progress(v) {
        if (dead || !busy()) return;                    // only while busy: start() (or a press) first
        v = Math.max(cur, clamp(v));                    // forwards only
        if (v <= 0) return;                             // 0% is still waiting: the slow turn goes on
        if (v >= 1) return done();
        cur = v;
        sync();
        begin();
        if (calm.matches) put(Math.max(X, from + Math.floor((v * span) / SIGN + 1e-9) * SIGN));   // sign by sign, at once
        else { aim = Math.max(aim, X, from + v * span); mode = 'work'; go(); }
        if (state === 'waiting') set('working');
        const ten = Math.floor(v * 10);
        if (ten > lastTen && performance.now() - lastSaid > 3000) { lastTen = ten; speak(`${words.working}, ${ten * 10}%`); }
    }
    // the work is over: the disc is carried on to the next sign it can stop on calmly. The word does not wait for it.
    function settle() {
        sync();
        if (calm.matches) return put(home());
        to = Math.ceil((X + (u * u) / (2 * DEC)) / SIGN - 1e-9) * SIGN;
        cap = Math.max(u, SET);
        mode = 'set'; go();
    }
    function done(o = {}) {
        if (dead || !busy()) return;
        stay = !!o.stay; doneSay = o.say || ''; cur = 1;
        settle();
        set('done');
        speak(doneSay || (words.done === text ? text + ', done' : words.done));
        btn.dispatchEvent(new CustomEvent('volvelle-button:done', { bubbles: true, detail: { button: btn } }));
        if (!dead && reset > 0 && !stay) timer = setTimeout(rest, reset);
    }
    function rest(o) {
        if (dead) return;
        clearTimeout(timer); stay = false;
        if (state === 'idle') return;
        const given = state !== 'done';                 // reset() while the work was still going: a job given up
        cur = 0; began = false;
        if (given) {                                    // it stops where it is, in a moment (never a lap)
            sync();
            if (calm.matches) put(home());
            else { mode = 'stop'; brake = Math.max(DEC, u / STOP); go(); }
        }
        set('idle');
        if (o && o.say) speak(o.say);                   // reset({ say: 'Could not sync' })
        else if (given) status.textContent = '';        // no stale "Uploading, 40%" left in the live region
    }

    /* ---- wiring ---- */
    btn.classList.add('vb-live');                       // the script draws the pressed look from here on (volvelle-button.css)
    // busy: a press does nothing at all (no double submit), before anyone else hears it. The author's aria-disabled
    // at rest (the focusable disabled pattern): no start and no form submit, but the page's own listeners still
    // hear it, so it can say why (and the click comes to them with defaultPrevented).
    on(btn, 'click', (e) => {
        if (state !== 'idle') { e.preventDefault(); e.stopImmediatePropagation(); return; }
        if (btn.getAttribute('aria-disabled') === 'true') { e.preventDefault(); return; }
        if (auto) { pressing = true; try { start(); } finally { pressing = false; } }
    }, true);
    // the pressed look (.vb-press): the main mouse button, a touch, or a held Space. A press slid off the button lets
    // go of the look (releasing there does nothing), and slid back on, it presses again. `hand`: the thumb takes the
    // tab as well, for a mouse or a key, which cannot turn into a scroll. A finger's press only shows on the face
    // until the click (start() takes the tab), so a touch that becomes a scroll leaves the disc exactly where it was.
    const usable = () => state === 'idle' && !btn.matches(':disabled') && btn.getAttribute('aria-disabled') !== 'true';
    let held = '', keyed = false, touchT = 0, tapT = 0;   // held: the pointer type of the press going on
    function press(v, hand) {
        v = v && usable();
        btn.classList.toggle('vb-press', v);
        if (v && hand) take();
    }
    const over = (e) => {
        const el = e && Number.isFinite(e.clientX) ? document.elementFromPoint(e.clientX, e.clientY) : null;
        return !!el && btn.contains(el);
    };
    on(btn, 'pointerdown', (e) => {
        pin();
        if (e.button !== 0 || !e.isPrimary || !usable()) return;
        held = e.pointerType || 'mouse'; anchor = null;
        clearTimeout(touchT); clearTimeout(tapT); touchT = tapT = 0;
        if (held === 'mouse') press(true, true);
        else touchT = setTimeout(() => { touchT = 0; if (held) press(true, false); }, TOUCH);   // a finger may be starting a scroll
    });
    on(btn, 'pointerenter', (e) => { if (held === 'mouse' && (e.buttons & 1)) press(true, true); });
    on(btn, 'pointerleave', () => { if (held) btn.classList.remove('vb-press'); });
    on(document, 'pointerup', (e) => {
        if (!held) return;
        const quick = !!touchT;
        held = ''; clearTimeout(touchT); touchT = 0;
        // a quick tap: the face shows it a moment (the click that follows takes the tab)
        if (quick && over(e) && usable()) { press(true, false); tapT = setTimeout(() => { tapT = 0; btn.classList.remove('vb-press'); }, 110); return; }
        btn.classList.remove('vb-press');
    }, true);
    const letGo = () => {                               // a scroll after all, or the window lost the press: no click
        held = ''; keyed = false;
        clearTimeout(touchT); touchT = 0;
        btn.classList.remove('vb-press');
    };
    on(document, 'pointercancel', () => { if (held) letGo(); }, true);
    on(btn, 'keydown', (e) => {
        if (e.repeat) return;
        if (e.key === ' ' || e.key === 'Enter') anchor = null;
        if (e.key === ' ' && usable()) { keyed = true; press(true, true); }
    });
    on(btn, 'keyup', (e) => { if (e.key === ' ' && keyed) { keyed = false; btn.classList.remove('vb-press'); } });
    on(btn, 'blur', letGo);
    on(window, 'blur', letGo);
    btn.dataset.state = 'idle';

    /* ---- API ---- */
    function destroy() {
        if (dead) return;                               // a second destroy(), or a stale one after a re-init, does nothing
        if (state !== 'idle') own(author);              // busy or done: the page's own aria-disabled back (at rest it is the page's)
        dead = true;
        clearTimeout(timer); clearTimeout(touchT); clearTimeout(tapT); clearTimeout(shutT);
        cancelAnimationFrame(raf); raf = 0;
        off.splice(0).forEach((f) => f());
        loader();                                       // the engine's destroy: its canvas, observers and loop
        face.classList.remove('dv-img');                // the page's own <img class="vb-face"> goes back as it was
        if (!face.className) face.removeAttribute('class');
        if (ownLabel) label.remove();
        else {
            extra.forEach((n) => n.remove());
            if (wrap) { label.append(...wrap.childNodes); wrap.remove(); }
            for (const [n, cls, hid, txt] of was) {
                if (txt != null) { n.textContent = txt; continue; }
                n.className = cls;
                if (hid === null) n.removeAttribute('aria-hidden'); else n.setAttribute('aria-hidden', hid);
            }
        }
        btn.replaceChildren(...orig);
        added.splice(0).forEach((n) => n.remove());
        if (roled) status.removeAttribute('role');
        btn.classList.remove('vb-press', 'vb-live');
        delete btn.dataset.state;
        if (btn.volvelleButton === api) delete btn.volvelleButton;
    }
    const api = {
        start, progress, done,
        reset: rest,
        destroy,
        get state() { return state; },
        get loader() { return loader; },
    };
    btn.volvelleButton = api;
    return api;
}

/* ---- auto-start ---- */
function boot() { for (const b of document.querySelectorAll('[data-volvelle-button]')) volvelleButton(b); }
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
}
export default volvelleButton;
