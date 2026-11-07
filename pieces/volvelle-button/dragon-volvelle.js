// dragon-volvelle: a loader / progress indicator that is Apian's lunar dragon volvelle (Astronomicum Caesareum,
// Ingolstadt 1540), its own paper disc turning on its pin over the printed mater.
//
// The control is a real <progress> inside the component. With a value, the disc has turned through that share of
// a full turn: the dragon's head (CAPVT) goes back through the zodiac the way the moon's node does, and at 100% it
// is home where it was printed. With no value (an indeterminate <progress>) the disc keeps going round, slowly.
// While it waits it can be handled: take the disc and turn it; let go and the work takes it back.
//
// At rest the <img> is the plate, pixel for pixel. Moving, a canvas over it draws the restored mater and the turned
// disc (assets/ring.webp, assets/disc.webp; geometry in assets/volvelle.json, cut offline by tools/).
//
//   import { dragonVolvelle } from './dragon-volvelle.js';
//   const v = dragonVolvelle(root);  v.value = .4;  v.value = null;  v.done();  v();  // destroy

const TAU = Math.PI * 2;
const calm = matchMedia('(prefers-reduced-motion: reduce)');
const live = new WeakMap();

const loadImage = (src) => new Promise((res, rej) => {
  const i = new Image();
  i.decoding = 'async';
  i.onload = () => (i.decode ? i.decode().catch(() => {}) : Promise.resolve()).then(() => res(i));
  i.onerror = rej;
  i.src = src;
});

function num(v, d) { const n = parseFloat(v); return Number.isFinite(n) ? n : d; }

export function dragonVolvelle(root, opts = {}) {
  if (live.has(root)) return live.get(root);
  const ds = root.dataset;
  const o = {
    turn: num(opts.turn ?? ds.turn, 40),               // seconds per turn while indeterminate
    speed: num(opts.speed ?? ds.speed, 100),           // most degrees a second the work turns it (by hand: any)
    touch: (opts.touch ?? ds.touch) !== false && (opts.touch ?? ds.touch) !== 'false',
    src: opts.src ?? ds.src,
    doneText: opts.doneText ?? ds.doneText ?? 'Done.',
  };
  const img = root.querySelector('.dv-img');
  const plateEl = root.querySelector('.dv-plate');
  const bar = root.querySelector('progress');
  const readout = root.querySelector('.dv-readout');
  if (!img || !plateEl) return Object.assign(() => {}, { value: null });

  const offs = [];
  const on = (t, e, f, p) => { t.addEventListener(e, f, p); offs.push(() => t.removeEventListener(e, f, p)); };
  const added = [];

  // ---- state -----------------------------------------------------------------------------------------------------
  let G = null;                 // geometry
  let ready = false;
  let theta = 0, omega = 0;     // the disc's turn (clockwise on screen = the nodes' regression) and its speed, rad, rad/s
  let base = 0;                 // whole turns already made (the target is base + value * TAU)
  let value = null;             // 0..1, or null while indeterminate
  let finished = false;
  let hand = null;              // {pid, a0, t0, last:[t, theta]}
  let raf = 0, lastT = 0, visible = true;
  let canvas, ctx, baseCv, discCv, scale = 1, dpr = 1, cssW = 0;

  root.classList.add('dv-on');
  if (o.touch) root.classList.add('dv-touch');

  // the live region: says start, every quarter, and done (the <progress> itself carries the exact value)
  const status = document.createElement('p');
  status.className = 'dv-status';
  status.setAttribute('role', 'status');
  root.appendChild(status); added.push(status);
  let spokenQuarter = -1;
  const say = (t) => { status.textContent = ''; requestAnimationFrame(() => { status.textContent = t; }); };

  // ---- reading the <progress> -----------------------------------------------------------------------------------
  function readBar() {
    if (!bar) return;
    const has = bar.hasAttribute('value');
    const max = num(bar.getAttribute('max'), 1) || 1;
    setValue(has ? Math.min(1, Math.max(0, num(bar.getAttribute('value'), 0) / max)) : null, false);
  }

  function setValue(v, writeBar = true) {
    const was = value;
    value = v == null ? null : Math.min(1, Math.max(0, v));
    if (writeBar && bar) {
      if (value == null) bar.removeAttribute('value');
      else bar.value = value * (num(bar.getAttribute('max'), 1) || 1);
    }
    if (value != null && (was == null || value < was)) {
      // from indeterminate, or a new job starting again: carry on forwards from wherever the disc has got to
      base = Math.ceil((theta - value * TAU) / TAU - 1e-6) * TAU;
    }
    if (value != null && value >= 1 && !finished) { finished = true; root.classList.add('dv-done'); }
    if (value != null && value < 1 && finished) { finished = false; root.classList.remove('dv-done'); }
    root.setAttribute('aria-busy', String(!(value != null && value >= 1)));
    root.classList.toggle('dv-indeterminate', value == null);
    if (readout) readout.textContent = value == null ? (readout.dataset.busy || '') : `${Math.round(value * 100)}%`;
    const q = value == null ? -1 : Math.floor(value * 4 + 1e-9);
    if (value != null && q !== spokenQuarter) {
      if (value >= 1) say(o.doneText);
      else if (q > spokenQuarter && q > 0) say(`${q * 25}%`);
      spokenQuarter = q;
    }
    if (value == null) spokenQuarter = -1;
    root.dispatchEvent(new CustomEvent('dragon-volvelle:change', { detail: { value } }));
    if (value != null && value >= 1 && was !== value) root.dispatchEvent(new CustomEvent('dragon-volvelle:done'));
    wake();
  }

  const mo = bar ? new MutationObserver(readBar) : null;
  if (mo) mo.observe(bar, { attributes: true, attributeFilter: ['value', 'max'] });

  // ---- drawing --------------------------------------------------------------------------------------------------
  function layout() {
    const w = plateEl.clientWidth;
    if (!w || !G) return;
    const d = Math.min(2, devicePixelRatio || 1);
    if (w === cssW && d === dpr && baseCv) return;
    cssW = w; dpr = d;
    scale = (w * dpr) / G.plate.w;
    const W = Math.round(G.plate.w * scale), H = Math.round(G.plate.h * scale);
    canvas.width = W; canvas.height = H;
    // cached base: the plate, with the restored mater laid over the ring the disc can uncover
    baseCv = document.createElement('canvas');
    baseCv.width = W; baseCv.height = H;
    const b = baseCv.getContext('2d');
    b.imageSmoothingQuality = 'high';
    b.drawImage(img, 0, 0, W, H);
    const sq = G.square;
    b.drawImage(G.ringImg, sq.x * scale, sq.y * scale, sq.size * scale, sq.size * scale);
    // the disc, resampled once to this size so each frame's turn is a 1:1 resample
    const s = Math.ceil(sq.size * scale);
    discCv = document.createElement('canvas');
    discCv.width = s; discCv.height = s;
    const dc = discCv.getContext('2d');
    dc.imageSmoothingQuality = 'high';
    dc.drawImage(G.discImg, 0, 0, s, s);
    draw();
  }

  function atRest() {
    const r = ((theta % TAU) + TAU) % TAU;
    return Math.min(r, TAU - r) < 1e-4 && Math.abs(omega) < 1e-4 && !hand && (value == null ? calm.matches : true);
  }

  function draw() {
    if (!ready || !baseCv) return;
    const rest = atRest();
    root.classList.toggle('dv-moving', !rest);
    if (rest) return;                       // the <img> is the plate
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(baseCv, 0, 0);
    const sq = G.square, px = G.pin[0] * scale, py = G.pin[1] * scale;
    ctx.translate(px, py);
    ctx.rotate(theta);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(discCv, sq.x * scale - px, sq.y * scale - py, sq.size * scale, sq.size * scale);
  }

  // ---- motion ---------------------------------------------------------------------------------------------------
  const target = () => base + (value ?? 0) * TAU;

  function step(dt) {
    if (hand) return;
    const vmax = (o.speed * Math.PI) / 180;
    if (calm.matches) {                     // reduced motion: put it where it would come to rest
      omega = 0;
      if (value != null) theta = target();
      return;
    }
    if (value == null) {
      // the work goes round: friction brings any flick back to a slow, steady turn
      const w0 = TAU / Math.max(4, o.turn);
      omega += (w0 - omega) * (1 - Math.exp(-dt / 1.4));
      theta += omega * dt;
    } else {
      // a critically damped spring to the value; the work never hurries it past vmax
      const wn = 3.2;
      const err = theta - target();
      const acc = -wn * wn * err - 2 * wn * omega;
      omega += acc * dt;
      if (Math.abs(omega) > vmax && Math.abs(err) > .02) omega = Math.sign(omega) * Math.max(vmax, Math.abs(omega) * Math.exp(-dt * 3));
      theta += omega * dt;
      if (Math.abs(theta - target()) < 2e-4 && Math.abs(omega) < 2e-3) { theta = target(); omega = 0; }
    }
  }

  function settled() {
    if (hand) return false;
    if (value == null) return calm.matches;
    return theta === target() && omega === 0;
  }

  function frame(t) {
    raf = 0;
    const dt = Math.min(.05, lastT ? (t - lastT) / 1000 : 1 / 60);
    lastT = t;
    for (let k = 0, n = Math.max(1, Math.round(dt * 240)); k < n; k++) step(dt / n);
    if (settled() && Math.abs(theta) > TAU) {          // keep the numbers small: drop whole turns
      const k = Math.floor(theta / TAU) * TAU;
      theta -= k; base -= k;
    }
    draw();
    if (visible && !document.hidden && !settled()) raf = requestAnimationFrame(frame);
    else lastT = 0;
  }

  function wake() {
    if (!ready || raf || !visible || document.hidden) return;
    lastT = 0;
    raf = requestAnimationFrame(frame);
  }

  // ---- the hand -------------------------------------------------------------------------------------------------
  function local(e) {
    const r = plateEl.getBoundingClientRect();
    const k = G.plate.w / r.width;
    return [(e.clientX - r.left) * k - G.pin[0], (e.clientY - r.top) * k - G.pin[1]];
  }
  function onDisc(e) {
    const [x, y] = local(e);
    const r = Math.hypot(x, y);
    if (r > G.r_max) return false;
    if (r <= G.r_disc + 2) return true;
    // beyond the disc only the tabs are paper: within a few degrees of where each tab points now
    const a = Math.atan2(y, x);
    return Object.values(G.tabs).some((t) => {
      let d = a - ((t.angle * Math.PI) / 180 + theta);
      d = Math.atan2(Math.sin(d), Math.cos(d));
      return Math.abs(d) < .065 && r < t.r_tip + 4;
    });
  }
  function down(e) {
    if (!ready || hand || (e.pointerType === 'mouse' && e.button !== 0) || !onDisc(e)) return;
    const [x, y] = local(e);
    hand = { pid: e.pointerId, a: Math.atan2(y, x), th: theta, hist: [[performance.now(), theta]] };
    omega = 0;
    plateEl.setPointerCapture?.(e.pointerId);
    root.classList.add('dv-grabbing');
    wake(); draw();
    e.preventDefault();
  }
  function move(e) {
    if (!hand) {
      if (ready && e.pointerType === 'mouse') plateEl.style.cursor = onDisc(e) ? 'grab' : '';
      return;
    }
    if (e.pointerId !== hand.pid) return;
    const [x, y] = local(e);
    let d = Math.atan2(y, x) - hand.a;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    hand.a += d;
    theta += d;
    const now = performance.now();
    hand.hist.push([now, theta]);
    while (hand.hist.length > 2 && now - hand.hist[0][0] > 90) hand.hist.shift();
    draw();
  }
  function up(e) {
    if (!hand || e.pointerId !== hand.pid) return;
    const h = hand.hist, a = h[0], b = h[h.length - 1];
    const dt = (b[0] - a[0]) / 1000;
    omega = dt > .01 ? Math.max(-6, Math.min(6, (b[1] - a[1]) / dt)) : 0;
    hand = null;
    root.classList.remove('dv-grabbing');
    if (value != null) {
      // the work's own position is the nearest whole turn to where the hand left it
      base = Math.round((theta - value * TAU) / TAU) * TAU;
    }
    if (calm.matches) omega = 0;
    root.dispatchEvent(new CustomEvent('dragon-volvelle:turned', { detail: { angle: theta } }));
    wake();
  }
  // keyboard: the plate is focusable while it can be handled; arrows turn it a little
  function key(e) {
    if (!ready) return;
    const k = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
    if (!k) return;
    e.preventDefault();
    omega += k * (calm.matches ? 0 : 1.2);
    if (calm.matches) theta += k * .2;
    wake(); draw();
  }

  // ---- start ----------------------------------------------------------------------------------------------------
  const jsonURL = o.src || new URL('volvelle.json', img.currentSrc || img.src).href;
  let alive = true;
  (async () => {
    try {
      const g = await (await fetch(jsonURL)).json();
      const dir = new URL('.', jsonURL).href;
      const [ringImg, discImg] = await Promise.all([loadImage(dir + 'ring.webp'), loadImage(dir + 'disc.webp')]);
      if (!img.complete) await new Promise((r) => img.addEventListener('load', r, { once: true }));
      if (!alive) return;
      G = Object.assign(g, { ringImg, discImg });
      canvas = document.createElement('canvas');
      canvas.className = 'dv-canvas';
      canvas.setAttribute('aria-hidden', 'true');
      plateEl.appendChild(canvas); added.push(canvas);
      ctx = canvas.getContext('2d');
      ready = true;
      layout();
      const ro = new ResizeObserver(() => layout());
      ro.observe(plateEl); offs.push(() => ro.disconnect());
      const io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) wake(); });
      io.observe(root); offs.push(() => io.disconnect());
      on(document, 'visibilitychange', () => wake());
      on(calm, 'change', () => wake());
      if (o.touch) {
        plateEl.tabIndex = plateEl.tabIndex >= 0 ? plateEl.tabIndex : 0;
        if (!plateEl.hasAttribute('aria-label')) plateEl.setAttribute('aria-label', 'Turn the disc by hand');
        on(plateEl, 'pointerdown', down);
        on(plateEl, 'pointermove', move);
        on(plateEl, 'pointerup', up);
        on(plateEl, 'pointercancel', up);
        on(plateEl, 'keydown', key);
      }
      root.classList.add('dv-ready');
      wake();
    } catch (err) {
      console.warn('dragon-volvelle: the plate will stay still', err);
    }
  })();
  readBar();
  if (!bar) setValue(opts.value ?? null, false);

  function destroy() {
    alive = false;
    cancelAnimationFrame(raf);
    mo?.disconnect();
    offs.forEach((f) => f());
    added.forEach((n) => n.remove());
    root.classList.remove('dv-on', 'dv-touch', 'dv-moving', 'dv-ready', 'dv-done', 'dv-grabbing', 'dv-indeterminate');
    root.removeAttribute('aria-busy');
    plateEl.style.cursor = '';
    live.delete(root);
  }
  Object.defineProperties(destroy, {
    value: { get: () => value, set: (v) => setValue(v) },
    angle: { get: () => theta },
  });
  destroy.done = () => setValue(1);
  destroy.hold = (h) => { if (h) cancelAnimationFrame(raf), (raf = 0), (visible = false); else (visible = true), wake(); };
  destroy.advance = (s) => { for (let k = 0; k < Math.round(s * 240); k++) step(1 / 240); draw(); };
  live.set(root, destroy);
  return destroy;
}

const start = () => document.querySelectorAll('[data-dragon-volvelle]').forEach((el) => dragonVolvelle(el));
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
