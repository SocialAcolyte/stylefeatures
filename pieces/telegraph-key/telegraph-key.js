// telegraph-key: a Send button that is the Morse–Vail key of 1844 (Smithsonian NMAH, CC0).
//
// The HTML is the button: a real <button type="submit"> holding the key's four layers and a label. CSS alone presses
// it (:active) when this module is not running. With it, the module makes the stroke: it presses for Enter (which
// never makes a button :active), waits a moment on a touch so a scroll is never taken for a press, springs the key
// back if the pointer slides off it, holds it down on the anvil while a send is going (hold / done), and reports:
//   telegraph-key:down     the point has met the anvil: the circuit is closed           detail { via }
//   telegraph-key:contact  ...and the stroke is a press, not the start of a scroll       detail { via }
//   telegraph-key:up       the spring has thrown the lever back onto its back stop       detail { via, held, cancelled, contact }
//   telegraph-key:send     it was activated: its form is submitting (a submit button      detail { via, held, mark, form }
//                          whose form the browser let through), or else its click
//   telegraph-key:state    idle -> sending -> sent -> idle                               detail { state, from }
// held is how long the circuit stayed closed (ms); mark is 'dot' or 'dash' (held longer than opts.dash, 200 ms).
// A stroke is never cut short: however quick the click (a trackpad's tap), the tap or the send, the point lands on the
// anvil and rests there a dot's worth before the spring throws the lever back, so when down and contact fire, it is there.
// cancelled is true when the stroke ended without a click: the pointer slid off, the touch became a scroll, focus left.
// contact comes with down for a mouse, a key or a click. A touch or a pen cannot be told from the start of a scroll
// until it lifts on the key, so its contact comes then (or with down, if it has lifted by then). A stroke that turns
// into a scroll never makes contact: its up says contact: false. The sounds are wired to contact and to up with contact.
//
//   import { telegraphKey } from './telegraph-key.js';
//   const key = telegraphKey(button, { sending: 'Sending', sent: 'Sent' });   // auto-starts on [data-telegraph-key]
//   form.addEventListener('submit', async (e) => { e.preventDefault(); key.hold(); await post(); key.done(); });
//   key.press(); key.release(); key.tap(); key.reset(); key.down; key.state;
//   key();                               // destroy: listeners and timers go; the plain button stays

const DASH_MS = 200;                        // held longer than this, it was a dash (opts.dash, data-dash)
const TAP_MS = 90;                          // the shortest stroke, press to lift: a dot (Enter, a quick click, a send)
const TOUCH_WAIT = 100;                     // a touch or pen presses only once it is clearly not the start of a scroll
const TOUCH_SLOP = 8;                       // ...and is dropped if it moves this far (px) before that
const SENT_MS = 1600;                       // how long the sent word shows after done() (opts.sentFor, data-sent-for)

function ms(v, fallback) {
  const s = String(v || '').trim();
  const n = parseFloat(s);
  if (!isFinite(n)) return fallback;
  return s.endsWith('ms') ? n : s.endsWith('s') ? n * 1000 : n;
}
const num = (v, fallback) => { const n = parseFloat(v); return isFinite(n) ? n : fallback; };

export function telegraphKey(el, opts = {}) {
  if (el.__telegraphKey) el.__telegraphKey();
  const ds = el.dataset;
  const pick = (k, d) => opts[k] ?? ds[k] ?? d;          // the options object wins over data- attributes
  const dashMs = num(pick('dash', DASH_MS), DASH_MS);
  const sentMs = num(pick('sentFor', SENT_MS), SENT_MS);
  const holdOpt = pick('hold', false);                   // data-hold, data-hold="true" or { hold: true }
  const autoHold = holdOpt === true || holdOpt === '' || String(holdOpt) === 'true';
  const off = [];
  const timers = new Set();
  const listen = (t, type, fn, o) => { t.addEventListener(type, fn, o); off.push(() => t.removeEventListener(type, fn, o)); };
  const later = (fn, t) => { const id = setTimeout(() => { timers.delete(id); fn(); }, t); timers.add(id); return id; };
  const stop = (id) => { if (id) { clearTimeout(id); timers.delete(id); } return 0; };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const travel = (prop, fallback) => (reduce.matches ? 0 : ms(getComputedStyle(el).getPropertyValue(prop), fallback));
  const dot = () => Math.max(TAP_MS, travel('--tk-press', 48) + 20);   // the shortest stroke: lands, then rests a moment
  const emit = (name, detail) => el.dispatchEvent(new CustomEvent('telegraph-key:' + name, { bubbles: true, detail }));
  const usable = () => !el.disabled && el.getAttribute('aria-disabled') !== 'true';

  el.classList.add('tk-js');                // from here the module makes the stroke; CSS stops using :active

  // ---- the words: the label, and the words for sending and sent, stacked in one cell so the button never resizes
  const label = el.querySelector('.tk-label');
  const labelHTML = label ? label.innerHTML : '';
  const words = {};
  const sentWord = pick('sent', '');
  if (label && (pick('sending', '') || sentWord)) {
    const cell = document.createElement('span');
    cell.className = 'tk-words';
    for (const [k, text] of [['rest', label.textContent.trim()], ['sending', pick('sending', '')], ['sent', pick('sent', '')]]) {
      if (!text) continue;
      const w = document.createElement('span');
      w.className = 'tk-word';
      w.textContent = text;
      cell.appendChild(w);
      words[k] = w;
    }
    label.replaceChildren(cell);
  }
  function show(k, text) {
    if (!words.rest) return;
    const on = words[k] || words.rest;
    if (k === 'sent' && on !== words.rest) on.textContent = text || sentWord;   // done('Not sent') says it once
    for (const w of Object.values(words)) {
      w.classList.toggle('tk-on', w === on);
      if (w === on) w.removeAttribute('aria-hidden'); else w.setAttribute('aria-hidden', 'true');
    }
  }
  show('rest');

  // ---- the lever: 'up' on its back stop, 'closing', 'closed' with its point on the anvil, 'opening'
  let lever = 'up', via = 'other', closedAt = 0, leverTimer = 0, upTimer = 0, upDetail = null;
  // when this stroke began to close, when its point meets the anvil, and when the spring may throw it back
  let strokeAt = 0, landsAt = 0, liftAt = 0, liftTimer = 0;
  // sure: the stroke is a press. A touch or a pen still on the key may yet be the start of a scroll, so it is sure
  // only once it lifts there. struck: the stroke's contact has been reported.
  let sure = true, struck = false;
  let pressed = false, pressVia = 'other';  // a finger or a key is on it
  let lastHeld = 0, lastVia = 'other', recent = -1e9;
  let tapping = false, tapHeld = 0;
  let state = 'idle', sentTimer = 0, ariaRest = null;

  function strike() {                       // the point is on the anvil and the stroke is a press: the contact counts
    if (sure && !struck && lever === 'closed') { struck = true; emit('contact', { via }); }
  }
  function close(how, certain = true) {     // turn the lever down until its point meets the anvil
    if (lever === 'closing' || lever === 'closed') return;
    if (lever === 'opening') { upTimer = stop(upTimer); emit('up', upDetail); }
    lever = 'closing'; via = how; sure = certain; struck = false;
    const t = travel('--tk-press', 48);
    strokeAt = performance.now(); landsAt = strokeAt + t; liftTimer = stop(liftTimer);
    el.setAttribute('data-tk-down', '');
    // the circuit closes as the point lands (landsAt), however late the timer that reports it runs
    leverTimer = later(() => { lever = 'closed'; closedAt = landsAt; emit('down', { via }); strike(); }, t);
  }
  function open(cancelled = false, at = performance.now()) {   // let the spring throw it back onto its stop
    if (lever === 'up' || lever === 'opening') return;
    el.removeAttribute('data-tk-down');
    if (lever === 'closing') {
      leverTimer = stop(leverTimer);
      // let go before the point reached the anvil: a scroll or a slide-off closed nothing. Any other stroke waits to
      // land (springBack), so only timers that ran late (a background tab) get past here, and then the stroke counts
      if (cancelled) { lever = 'up'; lastHeld = 0; return; }
      lever = 'closed'; closedAt = at;
      emit('down', { via }); strike();
    }
    const held = Math.max(0, Math.round(at - closedAt)), how = via;
    lastHeld = held; lastVia = how; recent = at; closedAt = 0;
    lever = 'opening';
    const d = upDetail = { via: how, held, cancelled, contact: struck };
    upTimer = later(() => { lever = 'up'; emit('up', d); }, travel('--tk-release', 72));
  }

  // ---- a finger or a key on it
  function press(how = 'other', certain = true) {
    if (pressed || !usable() || state === 'sending') return;
    pressed = true; pressVia = how;
    if (state === 'sent') rest();
    close(how, certain);
  }
  let clickWait = 0;
  function release(expectClick = false) {
    if (!pressed) return;
    pressed = false;
    sure = true; strike();                  // it lifted on the key, so it was never a scroll: the stroke is a press
    const at = performance.now();
    // a click quicker than the lever (a trackpad's tap) still makes a whole stroke: the point lands, rests a dot,
    // and only then does the spring throw the lever back. held counts the circuit closed for as long as it shows
    liftAt = Math.max(at, strokeAt + dot());
    lastHeld = Math.max(0, Math.round(liftAt - (lever === 'closed' ? closedAt : landsAt))); lastVia = via;
    recent = at;
    // a click follows this release (at once for a mouse or Space, a moment later for a touch): the key springs back
    // only once the click and whatever it starts have run, so a send can keep it down on the anvil with no bounce
    if (expectClick) clickWait = later(springBack, 120);
    else later(springBack, 0);
  }
  function springBack() {                   // back onto its stop, unless a finger or a send holds it down, and never
    clickWait = stop(clickWait);            // before the stroke has landed and rested its dot
    liftTimer = stop(liftTimer);
    if (pressed || state === 'sending') return;
    const wait = liftAt - performance.now();
    if (wait > 0) liftTimer = later(springBack, wait);
    else open(false, liftAt);
  }
  function letGo() {                        // done() or reset(): the page lets go, the key springs back after its dot
    if (pressed) return;
    liftAt = Math.max(performance.now(), strokeAt + dot());
    springBack();
  }
  function cancel() {                       // it ended without a click
    if (!pressed) return;
    pressed = false;
    if (state !== 'sending') open(true);
  }
  function tap(how = 'other') {
    if (pressed || !usable() || state === 'sending') return;
    const t = dot();
    tapping = true; tapHeld = Math.round(t - travel('--tk-press', 48));
    press(how);
    later(() => { tapping = false; release(); }, t);
  }

  // ---- the send state: the key held down on the anvil while the message goes, then back onto its stop
  function setState(next) {
    if (next === state) return;
    const from = state; state = next;
    el.dataset.state = next;
    emit('state', { state: next, from });
  }
  function hold() {
    if (state === 'sending') return true;
    if (el.disabled) return false;
    sentTimer = stop(sentTimer);
    ariaRest = el.getAttribute('aria-disabled');
    el.setAttribute('aria-disabled', 'true');
    el.setAttribute('aria-busy', 'true');
    show('sending');
    setState('sending');
    close(pressed ? pressVia : via);
    return true;
  }
  function unbusy() {
    el.removeAttribute('aria-busy');
    if (ariaRest == null) el.removeAttribute('aria-disabled'); else el.setAttribute('aria-disabled', ariaRest);
    ariaRest = null;
  }
  function done(text) {
    if (state !== 'sending') return;
    unbusy();
    show('sent', typeof text === 'string' ? text : '');
    setState('sent');
    letGo();
    sentTimer = later(() => { show('rest'); setState('idle'); }, sentMs);
  }
  function rest() {
    sentTimer = stop(sentTimer);
    if (state === 'sending') unbusy();
    show('rest');
    setState('idle');
    letGo();
  }

  // ---- wiring
  let pointerId = null, pending = null, slidOff = false;
  listen(el, 'pointerdown', (e) => {
    if (e.button !== 0 || !usable() || state === 'sending') return;
    pointerId = e.pointerId; slidOff = false;
    if (e.pointerType === 'mouse') { press('pointer'); return; }
    // a touch or a pen: wait, so the start of a scroll never presses the key. Held still past that, it presses, but
    // it is not sure until it lifts on the key: if the browser takes it for a scroll after all, it made no contact
    const how = e.pointerType === 'touch' ? 'touch' : 'pointer';
    pending = { x: e.clientX, y: e.clientY, how, timer: later(() => { pending = null; press(how, false); }, TOUCH_WAIT) };
  });
  // slide off while held and the key springs back, so it shows that letting go there sends nothing; slide back on
  // and it presses again. Only a mouse, and only from the pointer's own moves (a touch stays with the key until the
  // browser takes it to scroll; a hover update the browser makes up on its own is not the finger moving)
  const over = (e) => { const r = el.getBoundingClientRect(); return e.clientX >= r.left && e.clientX < r.right && e.clientY >= r.top && e.clientY < r.bottom; };
  listen(window, 'pointermove', (e) => {
    if (e.pointerId !== pointerId) return;
    if (pending) {
      if (Math.hypot(e.clientX - pending.x, e.clientY - pending.y) > TOUCH_SLOP) { stop(pending.timer); pending = null; pointerId = null; }
      return;
    }
    if (e.pointerType !== 'mouse') return;
    if (pressed && !over(e)) { slidOff = true; cancel(); }
    else if (slidOff && (e.buttons & 1) && over(e)) { slidOff = false; press('pointer'); }
  }, true);
  listen(window, 'pointerup', (e) => {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
    if (pending) { stop(pending.timer); const how = pending.how; pending = null; tap(how); return; }  // a quick tap
    if (slidOff) { slidOff = false; return; }                                                        // let go off it
    release(el.contains(e.target));     // let go on the key: its click comes next
  }, true);
  listen(window, 'pointercancel', (e) => {
    if (e.pointerId !== pointerId) return;
    pointerId = null; slidOff = false;
    if (pending) { stop(pending.timer); pending = null; return; }   // the touch became a scroll: nothing happened
    cancel();
  }, true);
  listen(el, 'keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'Enter') {
      if (e.repeat) { e.preventDefault(); return; }    // one press, one send: never the key's auto-repeat
      tap('key');                                      // Enter clicks at once; the key still makes its stroke
    } else if ((e.key === ' ' || e.code === 'Space') && !e.repeat) press('key');
  });
  listen(el, 'keyup', (e) => { if ((e.key === ' ' || e.code === 'Space') && pressVia === 'key') release(true); });
  listen(el, 'blur', () => { if (!tapping) cancel(); });
  // A submit button's click runs before the browser checks its form, so it sends only once the form submits: a click
  // that validation stops (a required field still empty) or that a click handler cancels sends nothing and never
  // holds. Any other button sends on its click.
  const submits = () => el.type === 'submit' && !!el.form;
  let armed = null, armTimer = 0;           // a submit button's send, from its click, waiting for its form's submit
  const sendNow = (detail) => { emit('send', detail); if (autoHold) hold(); };
  listen(el, 'click', (e) => {
    // busy (or the author's aria-disabled): no second send and no form submit, before anyone else hears it
    if (state === 'sending' || el.getAttribute('aria-disabled') === 'true') {
      e.preventDefault(); e.stopImmediatePropagation(); return;
    }
    const now = performance.now();
    // a click with no press of ours (assistive tech, el.click(), a label, implicit submission): give it its stroke
    if (!pressed && !tapping && lever === 'up' && now - recent > 400) tap('other');
    let held, how;
    if (tapping) { held = tapHeld; how = pressVia; }
    else if (pressed) { held = lever === 'closed' ? Math.round(now - closedAt) : 0; how = pressVia; }
    else { held = lastHeld; how = lastVia; }
    const detail = { via: how, held, mark: held > dashMs ? 'dash' : 'dot', form: el.form || null };
    if (submits()) {                        // the form's submit, if the browser lets it through, comes before this
      armed = detail;                       // timer: after it, the click submitted nothing
      stop(armTimer); armTimer = later(() => { armed = null; armTimer = 0; }, 0);
    } else sendNow(detail);
    if (clickWait) { clickWait = stop(clickWait); later(springBack, 0); }   // after the submit this click starts
  }, true);
  listen(document, 'submit', (e) => {       // capture: before the page's own submit handlers
    if (!('submitter' in e ? e.submitter === el : armed && e.target === el.form)) return;
    let detail = armed; armed = null; armTimer = stop(armTimer);
    if (state === 'sending') return;        // form.requestSubmit(key) while busy: the page's call; the key stays held
    if (!detail) {                          // form.requestSubmit(key): no click came, so give it its stroke here
      if (!pressed && lever === 'up') tap('other');
      const held = tapping ? tapHeld : lastHeld;
      detail = { via: 'other', held, mark: held > dashMs ? 'dash' : 'dot', form: e.target };
    }
    sendNow(detail);
  }, true);

  function destroy() {
    off.forEach((f) => f()); off.length = 0;
    timers.forEach(clearTimeout); timers.clear();
    if (state === 'sending') unbusy();
    el.removeAttribute('data-tk-down');
    el.removeAttribute('data-state');
    el.classList.remove('tk-js');
    if (label && words.rest) label.innerHTML = labelHTML;
    delete el.__telegraphKey;
  }
  Object.assign(destroy, { press, release, tap, hold, done, reset: rest });
  Object.defineProperty(destroy, 'down', { get: () => lever === 'closing' || lever === 'closed', enumerable: true });
  Object.defineProperty(destroy, 'state', { get: () => state, enumerable: true });
  el.dataset.state = 'idle';
  el.__telegraphKey = destroy;
  return destroy;
}

function start() { document.querySelectorAll('[data-telegraph-key]').forEach((el) => el.__telegraphKey || telegraphKey(el)); }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
