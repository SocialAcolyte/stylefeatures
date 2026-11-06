// pushou: a press button holding a Warring States bronze mask-and-ring handle, photographed by the Freer Gallery
// (F1917.18). Pressing lifts the ring on the bar inside the nose loop; letting go, it swings back against the door,
// and that blow is the knock. The ring is the photograph's own pixels turned as a rigid plane about its hinge; the
// mask never moves.
//
//   <button type="button" class="po" data-pushou>
//     <span class="po-knocker" aria-hidden="true"> <img class="po-plate" ...> <img class="po-ring" ...> <img class="po-loop" ...> </span>
//     <span class="po-label">Ring for service</span>
//   </button>
//
// The button is a real <button>: its click is yours, as usual. `pushou:knock` fires on the button when the ring
// strikes the door after a click (detail: {force 0-1, strike 1 | 2, source 'pointer' | 'keyboard' | 'script'}).
// Options (data- attributes or the options object, which wins): hold (deg the hand lifts it: 24, or 32 on a knocker
// under 48 px), tap (deg for Enter and knock(): 18, or 24 under 48 px), wait (deg wait() holds it at: 11, or 18
// under 48 px), size (cm, the knocker's scale for the swing, 16), bounce (0-1, 0.32).
// Returns a destroy function with knock(), wait(), cancel(), lift() and release() on it.

const RAD = Math.PI / 180;
const G = 981;                      // cm/s^2
const STEP = 1 / 240;
const DOOR = -1.2 * RAD;            // the ring swings a hair past hanging straight before it meets the door
const DAMP = 1.6;                   // air and the hinge while it swings, 1/s
const SETTLE = 9;                   // once it can't reach the door again, the bar's friction takes it, 1/s
const REST = 0.3 * RAD;             // a swing smaller than this is over: the ring hangs as photographed
const MAX = 32 * RAD;               // the most the ring is ever lifted: what the restored plate behind it allows
const BRIEF = 110;                  // ms: a hand that lets go sooner still carries the ring up this long (a tap)
const TOUCH = 90;                   // ms: a finger waits this long before it lifts, in case it is starting a scroll
const SMALL = 48;                   // px: a knocker shorter than this lifts higher and casts a firmer shadow
const live = new WeakMap();
const reduced = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

const num = (v, d) => (v === undefined || v === null || v === '' || isNaN(+v) ? d : +v);
const dud = () => Object.assign(() => {}, { knock() {}, wait() {}, cancel() {}, lift() {}, release() {} });

export function pushou(btn, opts = {}) {
  if (!btn) return dud();
  if (live.has(btn)) return live.get(btn);
  const d = btn.dataset;
  const o = { hold: num(d.hold, null), tap: num(d.tap, null), wait: num(d.wait, null), size: num(d.size, 16),
    bounce: num(d.bounce, 0.32), ...opts };
  const knocker = btn.querySelector('.po-knocker');
  const ring = knocker && knocker.querySelector('.po-ring');
  if (!ring) return dud();
  const plate = knocker.querySelector('.po-plate');
  const imgs = [...knocker.querySelectorAll('img')];
  const sizes0 = imgs.map((im) => im.getAttribute('sizes'));

  const w2 = G / Math.max(1, o.size);                  // (g / L) for the ring as a pendulum, 1/s^2
  const KH = (2 * Math.PI / 0.14) ** 2;                // the hand: a stiff, critically damped spring
  const off = [];
  const on = (el, t, f, opt) => { el.addEventListener(t, f, opt); off.push(() => el.removeEventListener(t, f, opt)); };
  const timers = new Set();
  const later = (f, ms) => { const id = setTimeout(() => { timers.delete(id); f(); }, ms); timers.add(id); return id; };
  const stop = (id) => { if (id) { clearTimeout(id); timers.delete(id); } return 0; };

  let th = 0, om = 0;               // lift beyond hanging straight (rad, out from the door is positive), and its rate
  let target = null;                // while a hand holds the ring: the angle it is held at (0: putting it back down)
  let auto = 0;                     // a tap or a scripted knock lets go by itself at this time
  let armed = false, source = 'pointer', strikes = 0, touched = false;
  let pressed = false, keyHeld = false, waiting = false;
  let raf = 0, clock = 0, since = 0, downTimer = 0, tapTimer = 0;
  let visible = true;

  // the shadow the ring casts on the door while it is lifted, from the ring's own outline
  const shade = document.createElement('span');
  shade.className = 'po-shade';
  shade.setAttribute('aria-hidden', 'true');
  knocker.insertBefore(shade, ring);
  // the shadows (this one, and the contact shadows behind the knocker in pushou.css) are cut from the layers' own
  // images: use the files that are showing
  const srcs = () => {
    if (ring.currentSrc) knocker.style.setProperty('--po-ring-src', `url("${ring.currentSrc}")`);
    if (plate && plate.currentSrc) knocker.style.setProperty('--po-plate-src', `url("${plate.currentSrc}")`);
  };
  srcs();
  on(ring, 'load', srcs);
  if (plate) on(plate, 'load', srcs);

  // a backstop for the markup's sizes: if a layer's file was chosen for a width more than 20% off the width it is
  // shown at, choose again. Only then: choosing again lets the browser swap in a larger file it happens to have
  // cached, and the three layers should come from the same file size, as cut.
  let hpx = 40;                                         // the knocker's height, for the perspective and the shadow
  const fit = () => {
    const r = knocker.getBoundingClientRect();
    if (knocker.offsetHeight > 0) hpx = knocker.offsetHeight;
    if (r.width > 0) for (const im of imgs) {
      const chosen = im.complete ? im.naturalWidth : 0;   // with a w-descriptor srcset: the sizes width it was chosen for
      if (im.srcset && chosen && Math.abs(chosen - r.width) > r.width * 0.2) im.sizes = Math.ceil(r.width) + 'px';
    }
  };
  fit();
  for (const im of imgs) on(im, 'load', fit);
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
  if (ro) ro.observe(knocker);
  const holdDeg = () => o.hold ?? (hpx < SMALL ? 32 : 24);
  const tapDeg = () => o.tap ?? (hpx < SMALL ? 24 : 18);
  const waitDeg = () => o.wait ?? (hpx < SMALL ? 18 : 11);
  const omRef = (deg) => Math.sqrt(Math.max(1e-6, 2 * w2 * (Math.cos(DOOR) - Math.cos(deg * RAD))));
  const amp = () => Math.sqrt(th * th + (om * om) / w2);  // how far this swing will carry the ring (rad)

  function draw() {
    if (Math.abs(th) < 1e-4) {
      ring.style.transform = '';
      shade.style.opacity = shade.style.transform = shade.style.filter = '';
      knocker.style.removeProperty('--po-lift');
      return;
    }
    const h = hpx, s = Math.max(0, Math.sin(th));
    ring.style.transform = `perspective(${(h * 3.6).toFixed(1)}px) rotateX(${(th / RAD).toFixed(3)}deg)`;
    // its shadow leaves the door with it: further, softer and darker the higher it is lifted. On a small knocker it
    // has a floor (1.5 px, 0.42, sharp), so that a lifted ring is seen to leave the door
    let op = 0.34 * Math.min(1, s * 2.2), dy = h * 0.075 * s, blur = h * (0.004 + 0.03 * s);
    if (h < SMALL) {
      const k = Math.min(1, s / 0.21);                    // full by about 12 degrees
      op = Math.max(op, 0.42 * k); dy = Math.max(dy, 1.5 * k); blur = Math.min(blur, 0.8);
    }
    shade.style.opacity = op.toFixed(3);
    shade.style.transform = `translateY(${dy.toFixed(2)}px) scaleY(${Math.cos(th * 0.8).toFixed(4)})`;
    shade.style.filter = `blur(${blur.toFixed(2)}px)`;
    knocker.style.setProperty('--po-lift', Math.min(1, s / 0.14).toFixed(3));   // its contact shadow lets go of it
  }

  const emit = (force, n) => btn.dispatchEvent(new CustomEvent('pushou:knock',
    { bubbles: true, detail: { force: +force.toFixed(3), strike: n, source } }));
  function strike(v) {
    strikes += 1;
    const force = Math.min(1, Math.abs(v) / omRef(Math.max(holdDeg(), tapDeg())));
    if (armed && force > 0.06 && strikes <= 2) emit(force, strikes);
  }

  function step(dt, now) {
    if (target !== null) {
      om += (KH * (target - th) - 2 * Math.sqrt(KH) * om) * dt;
      th = Math.min(MAX, th + om * dt);
      if (auto && now >= auto) { target = null; auto = 0; }
      return;
    }
    const settling = strikes >= 2 || touched || (strikes >= 1 && amp() < -DOOR);
    om += (-w2 * Math.sin(th) - (settling ? SETTLE : DAMP) * om) * dt;
    th += om * dt;
    if (th > MAX) { th = MAX; if (om > 0) om = 0; }        // the band's top meets the plate behind it
    if (th < DOOR) {
      th = DOOR;
      if (om < -0.35) { strike(om); om = -om * o.bounce; }
      else { om = 0; touched = true; }
    }
  }
  function settle() {               // at rest: the photograph, untouched
    th = 0; om = 0; target = null; auto = 0; strikes = 0; armed = false; touched = false;
    draw();
  }

  // time comes from the clock, not from frames: after a stalled frame the world catches up (up to half a second)
  function frame(now) {
    raf = 0;
    if (now - clock > 500) clock = now - 500;
    while (clock + STEP * 1000 <= now) { step(STEP, clock); clock += STEP * 1000; }
    if (target === null ? amp() < REST : !auto && Math.abs(target - th) < 1e-3 && Math.abs(om) < 1e-2) {
      if (target === null || target === 0) settle();
      else { th = target; om = 0; draw(); }               // held still: nothing moves, so nothing runs
      return;
    }
    draw();
    raf = requestAnimationFrame(frame);
  }
  // off screen nothing is animated: what the ring was about to do is done at once
  function jump() {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    if (target !== null && auto) { th = Math.max(th, target); om = 0; target = null; auto = 0; }   // it lets go now
    if (target !== null && target !== 0) { th = target; om = 0; draw(); return; }                   // still held
    if (target === null && armed && strikes === 0 && th > 0) {    // the knock that was coming lands now, as hard
      strike(-0.83 * Math.sqrt(om * om + 2 * w2 * (Math.cos(DOOR) - Math.cos(th))));               // as it would have
    }
    settle();
  }
  const wake = () => {
    if (!visible) { jump(); return; }
    if (!raf) { clock = performance.now(); raf = requestAnimationFrame(frame); }
  };
  const inert = () => btn.disabled || btn.getAttribute('aria-disabled') === 'true';

  function lift(deg = holdDeg(), src = 'script') {
    if (inert() || reduced.matches) return;
    source = src;
    strikes = 0; touched = false;
    if (target === null) since = performance.now();
    target = Math.min(MAX, Math.max(0, deg * RAD));      // the cut allows up to 32 deg (see tools/parts.py)
    wake();
  }
  function release() {
    if (target === null) return;
    const held = performance.now() - since;
    if (held < BRIEF) { auto = since + BRIEF; wake(); return; }   // a tap: finish the lift, then let go
    target = null; auto = 0;
    wake();
  }
  function lower() {                // the hand puts the ring back against the door: it doesn't fall, so no knock
    armed = false; auto = 0;
    if (reduced.matches || (target === null && Math.abs(th) < 1e-4)) return;
    target = 0;
    wake();
  }
  const unbusy = () => { if (waiting) { waiting = false; btn.removeAttribute('aria-busy'); } };
  // while the app works on what the click asked for, the hand holds the ring a little way up, still
  function wait(deg = waitDeg()) {
    if (inert()) return;
    waiting = true; armed = false; auto = 0;
    btn.setAttribute('aria-busy', 'true');
    if (reduced.matches) return;
    if (target === null) since = performance.now();
    strikes = 0; touched = false;
    target = Math.min(MAX, Math.max(0, deg * RAD));
    wake();
  }
  function cancel() { unbusy(); lower(); }
  function knock(src = 'script') {
    if (inert()) return;
    const held = waiting;
    unbusy();
    armed = true; source = src;
    if (reduced.matches) {          // nothing moves: the knock is the event alone (after the click's other listeners,
      later(() => { if (armed) { armed = false; emit(1, 1); } }, 0);   // so that one of them can still wait())
      return;
    }
    if (held || target === 0 || (target === null && th < 0.05)) {   // lift it a little higher from where it is, and let go
      since = performance.now();
      strikes = 0; touched = false;
      target = Math.min(MAX, Math.max(th, tapDeg() * RAD));
      auto = since + BRIEF;
      wake();
    }
  }

  // pointer: the hand lifts the ring while it presses, and lets go on release
  function press() { btn.classList.add('po-press'); lift(holdDeg(), 'pointer'); }
  on(btn, 'pointerdown', (e) => {
    if (e.button !== 0 || !e.isPrimary || inert() || waiting) return;
    pressed = true;
    tapTimer = stop(tapTimer);
    if (e.pointerType === 'mouse') press();
    else downTimer = later(() => { downTimer = 0; press(); }, TOUCH);   // a finger may be starting a scroll
  });
  // is the pointer over the button (its own touch target included)? A press let go anywhere else doesn't click
  const over = (e) => {
    if (!e || !Number.isFinite(e.clientX)) return false;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    return !!el && btn.contains(el);
  };
  const up = (e) => {
    if (!pressed) return;
    pressed = false;
    const onIt = over(e);
    if (downTimer) {                // a quick tap: lift now, and let go as soon as the lift is done
      downTimer = stop(downTimer);
      if (inert() || waiting || !onIt) return;
      press();
      tapTimer = later(() => { tapTimer = 0; btn.classList.remove('po-press'); }, BRIEF);
    } else btn.classList.remove('po-press');
    if (onIt) release();
    else lower();                   // slid off and let go: the click is off, so the hand puts the ring back down
  };
  const abandon = () => {           // it was a scroll after all, or the window lost the press: no knock
    if (!pressed) return;
    pressed = false;
    if (downTimer) { downTimer = stop(downTimer); return; }
    btn.classList.remove('po-press');
    lower();
  };
  on(btn, 'pointerup', up);
  on(btn, 'pointercancel', abandon);
  on(btn, 'pointerleave', (e) => { if (!e.buttons) up(null); });   // let go out of our sight: no click
  on(window, 'pointerup', up);      // a hand still pressing keeps hold of the ring: let go on the button, it knocks
  // keyboard: Space holds it up until the key comes up (the button clicks then); Enter clicks at once
  const unkey = () => { if (keyHeld) { keyHeld = false; btn.classList.remove('po-press'); lower(); } };
  on(window, 'blur', () => { abandon(); unkey(); });
  on(btn, 'keydown', (e) => {
    if (e.key !== ' ' || e.repeat || inert() || waiting) return;
    keyHeld = true;
    btn.classList.add('po-press');
    lift(holdDeg(), 'keyboard');
  });
  on(btn, 'keyup', (e) => {
    if (e.key !== ' ' || !keyHeld) return;
    keyHeld = false;
    btn.classList.remove('po-press');
    release();
  });
  on(btn, 'blur', unkey);
  // the click: the knock that follows it is reported; a scripted or Enter click lifts the ring itself. Captured, so
  // that it runs before your own click listeners on the button: an aria-disabled or waiting button doesn't click
  on(btn, 'click', (e) => {
    if (btn.getAttribute('aria-disabled') === 'true' || waiting) {
      e.preventDefault(); e.stopImmediatePropagation();
      return;
    }
    if (btn.disabled) return;
    const src = e.detail === 0 ? (source === 'keyboard' || document.activeElement === btn ? 'keyboard' : 'script') : 'pointer';
    const aloft = (target !== null && target !== 0) || (target === null && th > 0.05);   // a hand has it up, or it is falling
    if (aloft) { armed = true; source = src === 'script' ? source : src; return; }
    knock(src);
  }, true);

  // cheap when idle: off screen, the loop doesn't run
  const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver((es) => {
    visible = es[es.length - 1].isIntersecting;
    if (!visible) { if (raf) jump(); }
    else if (target !== null ? auto || Math.abs(target - th) > 1e-3 : Math.abs(th) > 1e-4) wake();
  }) : null;
  if (io) io.observe(knocker);

  btn.dataset.poReady = '';
  draw();

  function destroy() {
    off.forEach((f) => f());
    timers.forEach((id) => clearTimeout(id)); timers.clear();
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (ro) ro.disconnect();
    if (io) io.disconnect();
    shade.remove();
    ring.style.transform = '';
    for (const p of ['--po-ring-src', '--po-plate-src', '--po-lift']) knocker.style.removeProperty(p);
    for (const el of [ring, knocker]) if (el.getAttribute('style') === '') el.removeAttribute('style');
    imgs.forEach((im, i) => (sizes0[i] === null ? im.removeAttribute('sizes') : im.setAttribute('sizes', sizes0[i])));
    unbusy();
    btn.classList.remove('po-press');
    delete btn.dataset.poReady;
    live.delete(btn);
  }
  const api = Object.assign(destroy, {
    knock: () => knock('script'),
    wait: (deg) => wait(deg ?? waitDeg()),
    cancel,
    lift: (deg) => lift(deg ?? holdDeg(), 'script'),
    release,
  });
  Object.defineProperty(api, 'angle', { get: () => th / RAD });   // degrees out from hanging straight
  Object.defineProperty(api, 'waiting', { get: () => waiting });
  live.set(btn, api);
  return api;
}

function start() {
  document.querySelectorAll('[data-pushou]').forEach((el) => pushou(el));
}
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}
