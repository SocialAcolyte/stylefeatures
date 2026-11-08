// badbezan: a range input that is a Qajar lacquer brisé fan (Iran, dated 1301 AH / 1883-84 CE, the Met 443577),
// opening on its own rivet.
//
// The control is a real <input type="range"> inside the component, with its <label> and an <output>. The fan is its
// picture: closed is the minimum, fully open the maximum, and every value between opens it that far. Take the top
// guard (or anywhere on the fan) and turn it round the pin, use the keys, or set the value: the fan follows.
//
// Twenty rigid sticks, each its own photographed face cut from one Met photograph (tools/), turn about the brass
// pin in their real stacking order. Closing turns each back over the one below, so it only ever hides photographed
// pixels. The ribbon threaded through them pulls them open one after another; each stick then settles on its share
// of the opening with a small critically damped spring. Fully open and at rest, what you see is the <img>: the
// photograph itself.
//
//   import { badbezan } from './badbezan.js';
//   const f = badbezan(root);  f.value = 120;  f.hold(true); f.advance(.2);  f();  // destroy

const calm = matchMedia('(prefers-reduced-motion: reduce)');
const live = new WeakMap();
const D2R = Math.PI / 180;
// the box the fan needs while it closes, in the photograph's output px (assets/fan.json `box`, rounded out):
// the closed fan reaches 14 px left of the photograph. The CSS uses the same numbers.
const BOX_X = -14, BOX_W = 1704, BOX_H = 913;

const loadImage = (src) => new Promise((res, rej) => {
  const i = new Image();
  i.decoding = 'async';
  i.onload = () => (i.decode ? i.decode().catch(() => {}) : Promise.resolve()).then(() => res(i));
  i.onerror = rej;
  i.src = src;
});
const num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// a region of the atlas, resampled once to `f` (device px per output px), its origin at a sub-pixel offset so
// that, drawn at whole pixels, it lands exactly where the photograph has it. Big reductions go by halves.
function resample(src, sx, sy, sw, sh, f, ox, oy) {
  let cur = src, cx = sx, cy = sy, cw = sw, ch = sh, k = f;
  while (k < .5) {
    const c = document.createElement('canvas');
    c.width = Math.ceil(cw / 2) + 1; c.height = Math.ceil(ch / 2) + 1;
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(cur, cx, cy, cw, ch, 0, 0, cw / 2, ch / 2);
    cur = c; cx = 0; cy = 0; cw /= 2; ch /= 2; k *= 2;
  }
  const out = document.createElement('canvas');
  out.width = Math.ceil(cw * k + ox) + 1; out.height = Math.ceil(ch * k + oy) + 1;
  const g = out.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(cur, cx, cy, cw, ch, ox, oy, cw * k, ch * k);
  return out;
}

export function badbezan(root, opts = {}) {
  if (live.has(root)) return live.get(root);
  const ds = root.dataset;
  const o = {
    src: opts.src ?? ds.src,
    format: opts.format ?? ds.format ?? '{value}',      // what the <output> says; {value} is the input's value
    open: num(opts.open ?? ds.open, 13),                 // how briskly the guard follows a value (rad/s)
  };
  const fanEl = root.querySelector('.bz-fan');
  const img = root.querySelector('.bz-img');
  const input = root.querySelector('input[type="range"]');
  const out = root.querySelector('output');
  if (!fanEl || !img || !input) return Object.assign(() => {}, { value: null });

  const offs = [];
  const on = (t, e, f, p) => { t.addEventListener(e, f, p); offs.push(() => t.removeEventListener(e, f, p)); };
  const added = [];

  // ---- state -----------------------------------------------------------------------------------------------------
  let G = null, ready = false, alive = true;
  let a = [], gap = [], N = 0;      // each stick's angle in the photograph (rad, image coords), and the gaps
  let phi = [], om = [];            // each stick's angle now, and its angular speed
  let guardTarget = 0;              // where the top guard is going
  let hand = null;                  // {pid}
  let raf = 0, lastT = 0, visible = true, held = false;
  let canvas, ctx, sprites = [], rivet = null, f = 1, cssW = 0, dpr = 1, P = [0, 0];

  root.classList.add('bz-on');

  const range = () => {
    const min = num(input.min, 0), max = num(input.max, 100);
    return [min, max > min ? max : min + 1, input.step === 'any' ? 0 : num(input.step, 1)];
  };
  const openness = () => { const [min, max] = range(); return clamp((num(input.value, min) - min) / (max - min), 0, 1); };
  const guardFor = (v) => a[0] + v * (a[N - 1] - a[0]);

  function say() {
    if (out) out.textContent = o.format.replace('{value}', input.value);
  }

  // ---- motion ----------------------------------------------------------------------------------------------------
  // each inner stick settles on its share of the guard's opening; the top ones are a little quicker, so a fast
  // flick deals them out from the top. The ribbon is the hard limit: no stick lies further from the one below than
  // it does in the photograph (fully open), and none passes the one below it.
  function stickTarget(k) {
    const v = (phi[N - 1] - a[0]) / (a[N - 1] - a[0]);
    return a[0] + v * (a[k] - a[0]);
  }
  function constrain() {
    for (let it = 0; it < 3; it++) {
      for (let k = N - 2; k >= 1; k--) {
        const lo = phi[k + 1] - gap[k + 1], hi = phi[k + 1];
        if (phi[k] < lo) { phi[k] = lo; om[k] = Math.max(om[k], om[k + 1]); }
        else if (phi[k] > hi) { phi[k] = hi; om[k] = Math.min(om[k], om[k + 1]); }
      }
      for (let k = 1; k < N - 1; k++) {
        const lo = phi[k - 1], hi = phi[k - 1] + gap[k];
        if (phi[k] < lo) { phi[k] = lo; om[k] = Math.max(om[k], om[k - 1]); }
        else if (phi[k] > hi) { phi[k] = hi; om[k] = Math.min(om[k], om[k - 1]); }
      }
    }
  }
  function settle() {               // put everything where it comes to rest
    phi[N - 1] = guardTarget; om[N - 1] = 0;
    for (let k = 1; k < N - 1; k++) { phi[k] = stickTarget(k); om[k] = 0; }
  }
  function step(dt) {
    if (calm.matches && !hand) { settle(); return; }
    const W = hand ? 38 : o.open;
    om[N - 1] += (W * W * (guardTarget - phi[N - 1]) - 2 * W * om[N - 1]) * dt;
    phi[N - 1] += om[N - 1] * dt;
    phi[N - 1] = clamp(phi[N - 1], a[0], a[N - 1]);
    if (calm.matches) { for (let k = 1; k < N - 1; k++) { phi[k] = stickTarget(k); om[k] = 0; } return; }
    for (let k = 1; k < N - 1; k++) {
      const w = 7 + 8 * k / (N - 2);
      om[k] += (w * w * (stickTarget(k) - phi[k]) - 2 * w * om[k]) * dt;
      phi[k] += om[k] * dt;
    }
    constrain();
  }
  function settled() {
    if (hand) return false;
    if (Math.abs(phi[N - 1] - guardTarget) > 2e-5 || Math.abs(om[N - 1]) > 1e-3) return false;
    for (let k = 1; k < N - 1; k++) if (Math.abs(phi[k] - stickTarget(k)) > 2e-5 || Math.abs(om[k]) > 1e-3) return false;
    settle();
    return true;
  }

  // ---- drawing ---------------------------------------------------------------------------------------------------
  function layout() {
    const w = fanEl.clientWidth;
    if (!w || !G) return;
    const d = Math.min(2, devicePixelRatio || 1);
    if (w === cssW && d === dpr && sprites.length) return;
    cssW = w; dpr = d;
    const W = Math.round(w * d), H = Math.round(W * BOX_H / BOX_W);
    f = W / BOX_W;
    canvas.width = W; canvas.height = H;
    P = [(G.pivot[0] - BOX_X) * f, G.pivot[1] * f];
    const make = (s) => {
      const X = (s.x - BOX_X) * f, Y = s.y * f;
      return { cv: resample(G.atlas, s.ax, s.ay, s.w, s.h, f, X - Math.floor(X), Y - Math.floor(Y)), x: Math.floor(X), y: Math.floor(Y) };
    };
    sprites = G.sticks.map(make);
    rivet = make(G.rivet);
    draw();
  }
  function atRest() {
    if (hand) return false;
    for (let k = 1; k < N; k++) if (Math.abs(phi[k] - a[k]) > 1e-6 || om[k] !== 0) return false;
    return true;
  }
  function draw() {
    if (!ready || !sprites.length) return;
    const rest = atRest();
    root.classList.toggle('bz-moving', !rest);
    if (rest) return;                               // fully open and still: the <img> is the photograph
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = 'high';
    for (let k = 0; k < N; k++) {
      const s = sprites[k], t = phi[k] - a[k];
      if (Math.abs(t) < 1e-6) ctx.setTransform(1, 0, 0, 1, 0, 0);
      else {
        const c = Math.cos(t), si = Math.sin(t);
        ctx.setTransform(c, si, -si, c, P[0] - c * P[0] + si * P[1], P[1] - si * P[0] - c * P[1]);
      }
      ctx.drawImage(s.cv, s.x, s.y);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(rivet.cv, rivet.x, rivet.y);       // the pin and its washer do not turn
  }

  function frame(t) {
    raf = 0;
    const dt = Math.min(.05, lastT ? (t - lastT) / 1000 : 1 / 60);
    lastT = t;
    for (let k = 0, n = Math.max(1, Math.round(dt * 240)); k < n; k++) step(dt / n);
    const done = settled();
    draw();
    if (!done && visible && !held && !document.hidden) raf = requestAnimationFrame(frame);
    else lastT = 0;
  }
  function wake() {
    if (!ready || held) return;
    if (!visible || document.hidden) { settle(); draw(); return; }
    if (!raf) { lastT = 0; raf = requestAnimationFrame(frame); }
  }

  // ---- the value -------------------------------------------------------------------------------------------------
  function fromInput() {
    say();
    if (!ready) return;
    if (!hand) guardTarget = guardFor(openness());
    root.dispatchEvent(new CustomEvent('badbezan:change', { detail: { value: num(input.value, 0), open: openness() } }));
    wake();
  }
  function setValue(v, fire = true) {
    const before = input.value;
    input.value = String(v);
    if (fire && input.value !== before) input.dispatchEvent(new Event('input', { bubbles: true }));
    else fromInput();
  }

  // ---- the hand: take the guard (or anywhere on the fan) round the pin --------------------------------------------
  function pointerAngle(e) {
    const r = fanEl.getBoundingClientRect();
    const k = BOX_W / r.width;
    const x = (e.clientX - r.left) * k + BOX_X - G.pivot[0];
    const y = (e.clientY - r.top) * k - G.pivot[1];
    let t = Math.atan2(y, x);                       // image coords: the fan spans about 185..348 degrees
    if (t < 0) t += 2 * Math.PI;
    else t = t < Math.PI / 2 ? 2 * Math.PI : Math.PI;   // below the pin: fully open to the right, closed to the left
    return clamp(t, a[0], a[N - 1]);
  }
  function handTo(e) {
    const t = pointerAngle(e);
    guardTarget = t;
    const [min, max, st] = range();
    let v = min + (t - a[0]) / (a[N - 1] - a[0]) * (max - min);
    if (st) v = min + Math.round((v - min) / st) * st;
    v = clamp(v, min, max);
    if (String(v) !== input.value && num(input.value) !== v) setValue(+v.toFixed(6));
    wake();
  }
  // A touch that turns out to be a scroll (the fan lets vertical swipes scroll the page) changes nothing: a finger
  // acts once it moves sideways or lifts as a tap, and a cancelled touch puts the value back.
  function down(e) {
    if (!ready || hand || input.disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    hand = { pid: e.pointerId, touch: e.pointerType === 'touch', moved: false, from: input.value };
    fanEl.setPointerCapture?.(e.pointerId);
    root.classList.add('bz-grabbing', 'bz-pointer');     // focus for the keys, without a keyboard focus ring
    input.focus({ preventScroll: true });
    if (!hand.touch) { handTo(e); e.preventDefault(); }
  }
  function move(e) {
    if (!hand || e.pointerId !== hand.pid) return;
    hand.moved = true;
    handTo(e);
  }
  function up(e) {
    if (!hand || e.pointerId !== hand.pid) return;
    const h = hand;
    if (e.type === 'pointerup' && h.touch && !h.moved) handTo(e);           // a tap
    hand = null;
    root.classList.remove('bz-grabbing');
    if (e.type === 'pointercancel' && h.touch && input.value !== h.from) setValue(h.from);
    guardTarget = guardFor(openness());            // settle on the stepped value
    if (input.value !== h.from) input.dispatchEvent(new Event('change', { bubbles: true }));
    wake();
  }

  // ---- start -----------------------------------------------------------------------------------------------------
  on(input, 'input', fromInput);
  on(input, 'keydown', () => root.classList.remove('bz-pointer'));
  on(input, 'blur', () => root.classList.remove('bz-pointer'));
  say();
  const jsonURL = o.src || new URL('fan.json', img.currentSrc || img.src).href;
  (async () => {
    try {
      const g = await (await fetch(jsonURL)).json();
      const atlas = await loadImage(new URL('sticks.webp', jsonURL).href);
      if (!alive) return;
      G = Object.assign(g, { atlas });
      N = G.sticks.length;
      a = G.sticks.map((s) => s.a * D2R);
      gap = a.map((v, k) => (k ? v - a[k - 1] : 0));
      phi = a.slice(); om = a.map(() => 0);
      guardTarget = guardFor(openness());
      settle();                                    // land on the value at once
      canvas = document.createElement('canvas');
      canvas.className = 'bz-canvas';
      canvas.setAttribute('aria-hidden', 'true');
      fanEl.appendChild(canvas); added.push(canvas);
      ctx = canvas.getContext('2d');
      ready = true;
      layout();
      const ro = new ResizeObserver(() => layout());
      ro.observe(fanEl); offs.push(() => ro.disconnect());
      const io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) wake(); });
      io.observe(root); offs.push(() => io.disconnect());
      on(document, 'visibilitychange', () => wake());
      on(calm, 'change', () => wake());
      on(fanEl, 'pointerdown', down);
      on(fanEl, 'pointermove', move);
      on(fanEl, 'pointerup', up);
      on(fanEl, 'pointercancel', up);
      root.classList.add('bz-ready');
      draw();
    } catch (err) {
      console.warn('badbezan: the fan will stay as photographed', err);
    }
  })();

  function destroy() {
    alive = false;
    cancelAnimationFrame(raf);
    offs.forEach((fn) => fn());
    added.forEach((n) => n.remove());
    root.classList.remove('bz-on', 'bz-ready', 'bz-moving', 'bz-grabbing', 'bz-pointer');
    live.delete(root);
  }
  Object.defineProperties(destroy, {
    value: { get: () => num(input.value, 0), set: (v) => setValue(v) },
    open: { get: () => (ready ? (phi[N - 1] - a[0]) / (a[N - 1] - a[0]) : openness()) },
  });
  destroy.hold = (h) => { held = !!h; if (held) { cancelAnimationFrame(raf); raf = 0; } else wake(); };
  destroy.advance = (s) => { for (let k = 0, n = Math.round(s * 240); k < n; k++) step(1 / 240); settled(); draw(); };
  destroy.settle = () => { settle(); draw(); };
  live.set(root, destroy);
  return destroy;
}

const start = () => document.querySelectorAll('[data-badbezan]').forEach((el) => badbezan(el));
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
