/* tour.js: a declarative product-tour engine. The shared foundation for every StyleFeatures demo film.
   Full reference: README.md beside this file. In short:

     import { Tour, click, type, show, zoom, chapter } from './tour.js';
     new Tour(rootElement, { size: [1200, 750], steps: [ chapter('01 / 03', 'Start <em>here</em>', 'One line.'),
                                                        click('@new'), show('@modal'), type('@name', 'Hello') ] });

   Everything on screen is a pure function of one number, t (seconds). Each frame the engine works out the
   product's state at t (classes, attributes, text, CSS variables, scroll positions), the camera, the fake
   cursor and the overlays, and writes only what changed. So any moment can be rendered on its own:
   ?t=12.5 freezes there, seek(t) jumps there, and a scroll, a clock or a screen recorder can all drive it.

   Selectors ('@name' is short for [data-tour="name"]) are measured against the product as it is at the moment
   each step happens, and measured again whenever the layout changes (fonts, resize, your CSS), so editing the
   product never breaks the script. */

const cl = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const ease = (t) => t * t * t * (t * (t * 6 - 15) + 10);           // smootherstep: settles, no overshoot
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (n) => { const x = Math.sin(n * 91.7 + 13.1) * 43758.5453; return x - Math.floor(x); };
const sel = (s) => (typeof s === 'string' ? s.replace(/@([\w-]+)/g, '[data-tour="$1"]') : s);
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/* ── step builders ─────────────────────────────────────────────────────────────────────────────
   Pointer steps run one after another on the script's clock. Side steps (zoom, show, hide, set, tween,
   chapter, caption) start at the current moment and let the next step start with them.
   Any step takes { at: seconds } to pin it, { wait: seconds } to start later, { parallel: true }
   so a pointer step doesn't hold up the next one, { block: true } so a side step does. */
export const move = (to, o = {}) => ({ ...o, do: 'move', to });
export const click = (to, o = {}) => ({ ...o, do: 'click', to });
export const dblclick = (to, o = {}) => ({ ...o, do: 'dblclick', to });
export const hover = (to, o = {}) => ({ ...o, do: 'hover', to });
export const type = (el, text, o = {}) => ({ ...o, do: 'type', el, text });
export const drag = (handle, o = {}) => ({ ...o, do: 'drag', handle });
export const scroll = (el, to, o = {}) => ({ ...o, do: 'scroll', el, to });
export const key = (keys, o = {}) => ({ ...o, do: 'key', keys: [].concat(keys) });
export const zoom = (to, z = 'fit', o = {}) => ({ ...o, do: 'zoom', to, z });
export const unzoom = (o = {}) => ({ ...o, do: 'zoom', to: null, z: 1 });
export const show = (el, o = {}) => ({ ...o, do: 'show', el });
export const hide = (el, o = {}) => ({ ...o, do: 'hide', el });
export const set = (el, changes, o = {}) => ({ ...o, do: 'set', el, changes });
export const tween = (el, prop, from, to, o = {}) => ({ ...o, do: 'tween', el, prop, from, to });
export const chapter = (n, title, line = '', o = {}) => ({ ...o, do: 'chapter', n, title, line });
export const caption = (text, o = {}) => ({ ...o, do: 'caption', text });
export const pause = (dur = 1) => ({ do: 'pause', dur });
export const stream = (el, o = {}) => ({ ...o, do: 'stream', el });   // reveal matches one after another, like output arriving
export const tap = click;                                                 // the same step; reads better in a touch film
export const longpress = (to, o = {}) => ({ ...o, do: 'longpress', to }); // press and hold; it fires after { hold } s
export const swipe = (on, o = {}) => ({ ...o, do: 'swipe', on });         // a finger flick: { by, scroll } or { prop, from, to } (README)
export const mark = (name, o = {}) => ({ ...o, do: 'mark', name });       // a named moment: tour.api.marks[name] is its time, and the list is in order (README)

/* eases for show / hide / tween: { ease: 'out' | 'ios' | 'spring' | (t) => t }. Default: smootherstep.
   'ios' is a critically damped spring (UIKit pushes and sheets), 'spring' overshoots by about 3%. */
export const eases = {
  linear: (t) => t,
  out: (t) => 1 - Math.pow(1 - t, 3),
  ios: (t) => (t >= 1 ? 1 : (1 - (1 + 9 * t) * Math.exp(-9 * t)) / (1 - 10 * Math.exp(-9))),
  spring: (t) => (t >= 1 ? 1 : 1 - Math.exp(-6 * t) * (Math.cos(5.3 * t) + 1.13 * Math.sin(5.3 * t))),
};
const easeOf = (e) => (typeof e === 'function' ? e : eases[e] || ease);

/* when each character of a typed string lands. rhythm: undefined (even, as before) | 'human' (beats between
   words, a reach for symbols, the odd hesitation) | 'stream' (chunks, like a model's reply arriving) */
function keyTimes(txt, cps, seed, rhythm, c) {
  const at = [], b = 1 / cps;
  if (rhythm === 'stream') {
    for (let i = 0, j = 0; i < txt.length; j++) { const n = 1 + Math.floor(rnd(seed * 13 + j) * 5); c += b * n * (.5 + rnd(seed * 29 + j)); for (let m = 0; m < n && i < txt.length; m++, i++) at.push(c); }
    return at;
  }
  for (let i = 0; i < txt.length; i++) {
    let d = b * (.55 + .9 * rnd(seed * 31 + i));
    if (rhythm === 'human') {
      const ch = txt[i], pv = txt[i - 1] || '';
      if (pv === ' ') d += b * (.3 + .9 * rnd(seed * 37 + i));
      if (/[-/.:=_@|&>~"'`]/.test(ch)) d += b * .7;
      if (/[,;!?]/.test(pv) || (pv === '.' && ch === ' ')) d += b * 1.4;
      if (ch === pv && /\w/.test(ch)) d *= .6;
      if (i > 2 && rnd(seed * 43 + i) < .035) d += .2 + .25 * rnd(seed * 47 + i);
    }
    c += d; at.push(c);
  }
  return at;
}

/* load harvested fragments: <div data-tour-include="fragments/home.html"></div>. Await it before new Tour(). */
export async function include(root) {
  await Promise.all([...root.querySelectorAll('[data-tour-include]')].map(async (el) => {
    const r = await fetch(el.dataset.tourInclude); el.innerHTML = r.ok ? await r.text() : ''; el.removeAttribute('data-tour-include');
    if (!r.ok) console.warn('[tour] could not load', r.url);
  }));
}

/* ?record for a page with several tours in one frame (demo/versus, demo/deck): makes el the record stage, the box
   of ?ratio= centred on near-black with the rest of the page hidden, exactly as a single film gets it. Build each
   Tour inside it with { record: 'page' } and drive them from the page. Returns { w, h, ratio } and keeps it current. */
export function recordStage(el, q = new URLSearchParams(location.search)) {
  document.documentElement.classList.add('tour-record', 'sf-clean');
  el.setAttribute('data-tour-root', ''); el.classList.add('is-record');
  const r = (q.get('ratio') || '16:9').split(':').map(Number), box = { w: 0, h: 0, ratio: r.join(':') };
  const fit = () => {
    let w = innerWidth, h = innerHeight;
    if (r.length === 2 && r[0] > 0) { const a = r[0] / r[1]; if (w / h > a) w = Math.round(h * a); else h = Math.round(w / a); }
    box.w = w; box.h = h; el.style.setProperty('--rw', w + 'px'); el.style.setProperty('--rh', h + 'px');
  };
  fit(); addEventListener('resize', fit);
  return box;
}

const BLOCKS = new Set(['move', 'click', 'dblclick', 'hover', 'type', 'drag', 'scroll', 'key', 'pause', 'stream', 'longpress', 'swipe']);
const POINT = new Set(['move', 'click', 'dblclick', 'hover', 'drag', 'longpress', 'swipe']);

/* ── window chromes ─────────────────────────────────────────────────────────────────────────── */
const CHROME = {
  browser: (w) => `<div class="tour-chrome" data-kind="browser"><span class="tour-lights"><i></i><i></i><i></i></span>
    <span class="tour-navs"><svg viewBox="0 0 16 16"><path d="M10 3 5 8l5 5"/></svg><svg viewBox="0 0 16 16"><path d="m6 3 5 5-5 5"/></svg></span>
    <span class="tour-url"><svg viewBox="0 0 16 16"><path d="M5 7V5a3 3 0 0 1 6 0v2M4 7h8v6H4z"/></svg>${w.dataset.url || 'yourproduct.com'}</span>
    <span class="tour-navs is-end"><svg viewBox="0 0 16 16"><path d="M8 3v7M5 6l3-3 3 3M3 9v4h10V9"/></svg><svg viewBox="0 0 16 16"><path d="M8 3v10M3 8h10"/></svg></span></div>`,
  app: (w) => `<div class="tour-chrome" data-kind="app"><span class="tour-lights"><i></i><i></i><i></i></span><b>${w.dataset.title || ''}</b></div>`,
  terminal: (w) => `<div class="tour-chrome" data-kind="terminal"><span class="tour-lights"><i></i><i></i><i></i></span><b>${w.dataset.title || ''}</b></div>`,
  phone: () => `<div class="tour-chrome" data-kind="phone"><b>9:41</b><span class="tour-notch"></span><span class="tour-status"><i></i><i></i><i></i></span></div>`,
  none: () => '',
};

/* ── cursor art (hotspot at 0,0) ─────────────────────────────────────────────────────────────── */
const CURSORS = `
<svg class="tour-arrow" width="22" height="30" viewBox="-1 -1 16 23"><path d="M0 0V16.6L4.3 12.6L7.2 19.4L10 18.2L7.2 11.6H13Z" stroke-linejoin="round"/></svg>
<svg class="tour-hand" width="24" height="26" viewBox="0 0 20 22"><path d="M7 1.4c.9 0 1.6.7 1.6 1.6V9h.3V7.5c0-.8.7-1.4 1.5-1.4s1.5.6 1.5 1.4v1.9h.3V8.3c0-.8.7-1.4 1.5-1.4s1.5.6 1.5 1.4v1.5h.3v-.6c0-.8.6-1.3 1.3-1.3.8 0 1.4.6 1.4 1.3V15c0 3.4-2.5 6-5.8 6h-1.6c-2 0-3.4-.8-4.6-2.3l-4.1-5.1c-.6-.7-.5-1.7.2-2.2.7-.5 1.6-.4 2.2.2l.7.9V3c0-.9.7-1.6 1.6-1.6Z" stroke-linejoin="round"/></svg>
<svg class="tour-beam" width="10" height="24" viewBox="0 0 10 24"><path d="M2 1.5h2.2c.5 0 .8.3.8.8v19.4c0 .5-.3.8-.8.8H2M8 1.5H5.8c-.5 0-.8.3-.8.8v19.4c0 .5.3.8.8.8H8M3 12h4" fill="none" stroke-linecap="round"/></svg>`;

export class Tour {
  constructor(root, script, o = {}) {
    this.root = root; this.S = script; this.o = o; root.setAttribute('data-tour-root', '');
    const q = new URLSearchParams(location.search), d = root.dataset;
    this.q = q;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.rec = q.has('record');
    this.host = this.rec && o.record === 'page';     // { record: 'page' }: the page owns the record stage (recordStage()) and drives this tour
    this.fixT = q.get('t') != null ? +q.get('t') : null;
    this.driver = this.host ? 'manual' : this.rec ? 'record' : q.get('driver') || o.driver || d.driver || 'scroll';
    this.still = this.fixT != null || (this.reduced && !this.rec);
    const cam = q.get('camera') || o.camera || d.camera || 'on';
    this.camOn = cam !== 'off' && !(this.still && this.fixT == null);   // reduced motion: the whole window, no push-in
    const caps = q.get('captions') || o.captions || d.captions || 'record';
    this.capsOn = caps === 'always' || caps === 'on' || (caps === 'record' && this.rec);
    this.cursorOn = (q.get('cursor') || d.cursor) !== 'off';
    this.touch = (q.get('pointer') || o.pointer || d.pointer || script.pointer) === 'touch';   // a fingertip instead of the arrow
    this.loop = !this.rec && (q.has('loop') || !!o.loop || d.loop != null || !!script.loop);   // play driver: start again at the end
    root.classList.toggle('is-touch', this.touch);
    this.t = -1; this.begun = false; this.playing = false; this.frozen = false; this.alive = true;

    this.stage = root.querySelector('[data-tour-stage]');
    this.win = root.querySelector('[data-tour-window]');
    this.band = root.querySelector('[data-tour-band]');
    this.end = root.querySelector('[data-tour-end]');
    const [w, h] = (script.size || (this.win.dataset.size || '1200x750').split('x')).map(Number);
    this.Wd = w; this.Hd = h > 0 ? h : w;       // a height of 'auto' takes the shape of the data-tour-frame at each layout
    this.win.style.width = w + 'px'; this.win.style.height = this.Hd + 'px';
    const tall = script.sizeTall || this.win.dataset.sizeTall?.split('x');     // optional second design size for tall stages
    const sq = script.sizeSquare || this.win.dataset.sizeSquare?.split('x');   // optional third, for squarish stages (.8 ≤ W/H < 1.15)
    this.sizes = { wide: [w, h], tall: tall ? tall.map(Number) : null, square: sq ? sq.map(Number) : null };
    const kind = this.win.dataset.chrome || 'browser';
    if (!this.win.querySelector('.tour-chrome')) this.win.insertAdjacentHTML('afterbegin', (CHROME[kind] || CHROME.none)(this.win));
    // windows inside the window (a desk with a terminal and a browser): each [data-chrome] gets its own chrome
    for (const e of this.win.querySelectorAll('[data-chrome]')) if (!e.querySelector(':scope > .tour-chrome')) e.insertAdjacentHTML('afterbegin', (CHROME[e.dataset.chrome] || CHROME.none)(e));
    this.follow = [...this.win.querySelectorAll('[data-tour-follow]')];     // kept scrolled to their newest content
    this.grows = [...this.win.querySelectorAll('[data-tour-grow]')].reverse();   // natural height measured into --h, innermost first
    this.win.setAttribute('aria-hidden', 'true');
    this.overlays();
    this.compile();
    if (this.rec && !this.host) this.recordSetup();
    this.layout();
    this.grow();
    this.probe();
    const api = {
      seek: (t) => { this.pause(); this.frozen = true; this.render(+t, true); return this.t; },
      play: () => this.play(), pause: () => this.pause(), load: (s) => this.load(s), begin: () => this.begin(),
      get t() { return api._t(); }, _t: () => this.t,
      duration: this.duration, chapters: this.chapters.map((c) => ({ t: c.start, n: c.n, title: c.title })), marks: this.marks,
      ready: (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => new Promise((r) => requestAnimationFrame(() => { this.relayout(); r(true); }))),
    };
    this.api = api;
    if (!window.tour || o.global) window.tour = api;
    this.drivers();
    this.ro = new ResizeObserver(() => { clearTimeout(this.rz); this.rz = setTimeout(() => this.relayout(), 60); });
    this.ro.observe(this.stage);
    document.fonts?.ready.then(() => this.relayout());
  }

  $$(s) { return s ? [...this.win.querySelectorAll(sel(s))] : []; }
  one(s) { const e = this.$$(s)[0]; if (!e && s) console.warn('[tour] nothing matches', s); return e || null; }

  /* ── overlays the engine owns ── */
  overlays() {
    const mk = (cls, html = '', tag = 'div') => { const e = document.createElement(tag); e.className = cls; e.innerHTML = html; this.stage.append(e); return e; };
    this.card = mk('tour-card', '<span class="tour-card-n"></span><h3></h3><p></p>');
    this.cap = mk('tour-cap', '', 'p');
    this.keysEl = mk('tour-keys');
    this.rings = [mk('tour-ring'), mk('tour-ring'), mk('tour-ring')];
    this.cur = mk('tour-cur', CURSORS + '<span class="tour-touch"></span>');
    this.cur.dataset.look = this.root.dataset.cursorLook || 'dark';
    this.shapes = { arrow: this.cur.querySelector('.tour-arrow'), pointer: this.cur.querySelector('.tour-hand'), text: this.cur.querySelector('.tour-beam') };
    this.gates = [...this.root.querySelectorAll('[data-tour-gate]')];
    if (matchMedia('(hover: none)').matches) this.gates.forEach((g) => { const l = g.querySelector('[data-tour-gate-label]'); if (l) l.textContent = 'Tap to play'; });
  }

  /* ── compile the script into channels, a cursor track, zooms and overlays ── */
  compile() {
    const S = this.S;
    this.ch = []; this.chMap = new Map(); this.track = []; this.zooms = []; this.chapters = []; this.caps = []; this.keyList = [];
    this.ringAt = []; this.deferred = []; this.n = 0; this.marks = [];
    let clock = 0, last = 0, k = 0;
    for (const st of S.steps || []) {
      const start = st.at != null ? st.at : clock + (st.wait || 0);
      let end = start; k++;
      switch (st.do) {
        case 'pause': end = start + (st.dur ?? 1); break;
        case 'move': case 'hover': case 'click': case 'dblclick': case 'drag': case 'longpress': case 'swipe': {
          const el = this.one(st.do === 'drag' ? st.handle : st.do === 'swipe' ? st.on : st.to); const g = { kind: st.do, el, i: k, start, aim: st.aim || [.5 + (rnd(k) - .5) * .18, .55 + (rnd(k + 7) - .5) * .16], shape: st.cursor, who: st.by || 'main', from: st.from, tag: st.tag };
          g.arrive = start + (st.do === 'drag' || st.do === 'swipe' ? st.approach ?? (st.do === 'swipe' ? .7 : .8) : st.dur ?? .9);
          if (st.do === 'longpress') { const c0 = g.arrive + .06; g.act = c0 + (st.hold ?? .7); g.press = [[c0, g.act + (st.lift ?? .35)]]; g.end = g.act; this.ringAt.push({ t: g.act, g }); }
          if (st.do === 'swipe') this.swipeStep(st, g, el);
          if (st.do === 'move') g.end = g.arrive;
          if (st.do === 'hover') g.end = g.arrive + (st.hold ?? .6);
          if (st.do === 'click') { g.press = [[g.arrive + .06, g.arrive + .18]]; g.act = g.arrive + .18; g.end = g.act + .12; }
          if (st.do === 'dblclick') { const a = g.arrive; g.press = [[a + .06, a + .15], [a + .26, a + .35]]; g.act = a + .35; g.end = g.act + .15; }
          if (st.do === 'drag') {
            g.g0 = g.arrive + .22; g.g1 = g.g0 + (st.dur ?? 1.2); g.release = g.g1 + .1; g.end = g.release + .12;
            g.press = [[g.arrive + .08, g.release]]; g.act = g.release;
            const p = (t) => ease(cl((t - g.g0) / (g.g1 - g.g0)));
            if (st.prop) for (const e of st.el ? this.$$(st.el) : [el]) if (e) this.seg(e, st.prop, g.g0, (t) => lerp(st.from ?? 0, st.to ?? 1, p(t)));
            if (st.text) { const [ts, f] = st.text; for (const e of this.$$(ts)) this.seg(e, 'text', g.g0, (t) => f(lerp(st.from ?? 0, st.to ?? 1, p(t)))); }
            if (st.onto && el) { g.onto = this.one(st.onto); g.delta = [0, 0]; this.seg(el, 'translate', g.g0, (t) => [g.delta[0] * p(t), g.delta[1] * p(t)]); this.deferred.push({ t: g.arrive, run: () => this.measureDelta(g) }); }
          }
          if (g.press) for (const [a, b] of g.press) { if (el) { this.seg(el, 'class:is-press', a, () => true); this.seg(el, 'class:is-press', b, () => false); } }
          if (st.do === 'click' || st.do === 'dblclick') for (const [, b] of g.press) this.ringAt.push({ t: b, g });
          if (st.do === 'drag') this.ringAt.push({ t: g.press[0][0] + .1, g });
          this.track.push(g); end = g.end; break;
        }
        case 'type': {
          const els = this.$$(st.el), cps = st.cps ?? 13, txt = String(st.text);
          const at = keyTimes(txt, cps, k, st.rhythm, start + (st.lead || 0));
          end = (at[at.length - 1] ?? start) + .15;
          const stop = st.blink ?? end + (st.caret ?? 1.6), typed = end;
          for (const e of els) {
            this.seg(e, 'text', start, (t) => { let n = 0; while (n < at.length && at[n] <= t) n++; return txt.slice(0, n); });
            this.seg(e, 'class:is-caret', start, (t) => t < typed || Math.floor((t - typed) * 2.1) % 2 === 0);
            this.seg(e, 'class:is-caret', stop, () => false);
          }
          break;
        }
        case 'scroll': {
          const e = this.one(st.el); end = start + (st.dur ?? 1.4);
          if (e) { const sg = { to: 0 }; this.seg(e, 'scrollTop', start, (t, from) => lerp(from(), sg.to, ease(cl((t - start) / (end - start))))); this.deferred.push({ t: start, run: () => { sg.to = this.scrollTarget(e, st.to, st.offset ?? 16); } }); }
          break;
        }
        case 'stream': {
          const els = this.$$(st.el), every = st.every ?? .06, jit = st.jitter ?? .5, dur = st.dur ?? .08; let c = start;
          els.forEach((e, j) => {
            c += (j ? every * (1 - jit + 2 * jit * rnd(k * 17 + j)) : 0) + (+e.dataset.tourWait || 0); const s0 = c;
            this.seg(e, 'class:is-in', s0, () => true); this.seg(e, '--in', s0, (t) => ease(cl((t - s0) / dur)));
          });
          if (!els.length) console.warn('[tour] nothing matches', st.el);
          end = c + dur; break;
        }
        case 'key': this.keyList.push({ start, end: start + (st.hold ?? 1.4), keys: st.keys }); end = start + (st.dur ?? .9); break;
        case 'zoom': this.zooms.push({ start, dur: st.dur ?? 1.3, el: st.to ? this.one(st.to) : null, z: st.z, fill: st.fill ?? .66, aim: st.aim || [.5, .5], pt: null, size: null }); end = start + (st.dur ?? 1.3); break;
        case 'show': case 'hide': {
          const els = this.$$(st.el), dur = st.dur ?? (st.do === 'show' ? .35 : .28), to = st.do === 'show' ? 1 : 0;
          const E = easeOf(st.ease);
          els.forEach((e, j) => { const s0 = start + j * (st.stagger || 0); this.seg(e, '--in', s0, (t, from) => lerp(+from() || 0, to, E(cl((t - s0) / dur)))); end = Math.max(end, s0 + dur); });
          if (!els.length) console.warn('[tour] nothing matches', st.el);
          break;
        }
        case 'set': for (const e of this.$$(st.el)) for (const [key2, v] of Object.entries(st.changes)) {
          if (key2 === 'class') for (const tok of String(v).split(/\s+/).filter(Boolean)) { const off = tok[0] === '-'; const name = tok.replace(/^[+-]/, ''); this.seg(e, 'class:' + name, start, () => !off); }
          else this.seg(e, key2, start, () => v);
        } break;
        case 'tween': {
          const els = this.$$(st.el), dur = st.dur ?? .45;
          const E = easeOf(st.ease), curve = (x) => E(cl(x));
          els.forEach((e, j) => { const s0 = start + j * (st.stagger || 0); this.seg(e, st.prop, s0, (t, from) => { const f = st.from ?? (+from() || 0); const v = lerp(f, st.to, curve((t - s0) / dur)); return st.fmt ? st.fmt(v) : v; }); end = Math.max(end, s0 + dur); });
          break;
        }
        case 'chapter': this.chapters.push({ start, n: st.n, title: st.title, line: st.line || '', end: st.until }); break;
        case 'caption': this.caps.push({ start, text: st.text, dur: st.dur }); break;
        case 'mark': this.marks.push({ t: start, name: st.name }); this.marks[st.name] = start; break;   // marks[name] is its time; the list is in order
        default: console.warn('[tour] unknown step', st);
      }
      if ((BLOCKS.has(st.do) && !st.parallel) || st.block) clock = end;
      last = Math.max(last, end);
    }
    // one track per pointer (steps with { by: 'agent' } move a second cursor; README, "More than one pointer")
    this.tracks = { main: [] };
    for (const g of this.track) (this.tracks[g.who] ||= []).push(g);
    // the hover look: on from arrival until that pointer sets off again
    for (const tr of Object.values(this.tracks)) tr.forEach((g, i) => {
      if (!g.el) return;
      const off = tr[i + 1] ? tr[i + 1].start + .1 : Infinity;
      this.seg(g.el, 'class:is-hover', g.arrive - .12, () => true);
      if (off < Infinity) this.seg(g.el, 'class:is-hover', off, () => false);
    });
    for (const c of this.ch) c.segs.sort((a, b) => a.start - b.start || a.n - b.n);
    this.outroAt = Math.max(clock, last) + (S.settle ?? .6);
    this.duration = +(this.outroAt + (S.outro ?? 4.5)).toFixed(2);
    this.chapters.forEach((c, i) => { c.end = Math.min(c.end ?? Infinity, this.chapters[i + 1]?.start ?? this.outroAt); });
    this.caps.forEach((c, i) => { c.end = Math.min(c.start + (c.dur ?? 4), this.caps[i + 1]?.start ?? this.outroAt); });
    this.firstMove = this.tracks.main[0]?.start ?? Infinity;
    this.stillAt = S.still ?? this.duration * .45;
  }

  chan(el, prop) {
    let m = this.chMap.get(el); if (!m) this.chMap.set(el, (m = new Map()));
    let c = m.get(prop);
    if (!c) { c = { el, prop, init: this.read(el, prop), segs: [], last: undefined }; m.set(prop, c); this.ch.push(c); }
    return c;
  }
  seg(el, prop, start, at) { this.chan(el, prop).segs.push({ start, at, n: this.n++ }); }
  read(el, prop) {
    if (prop === 'text') return el.textContent;
    if (prop === 'scrollTop') return 0;
    if (prop === 'translate') return [0, 0];
    if (prop.startsWith('class:')) return el.classList.contains(prop.slice(6));
    if (prop.startsWith('--')) { const v = getComputedStyle(el).getPropertyValue(prop).trim(); return v === '' ? 0 : isNaN(+v) ? v : +v; }
    return el.getAttribute(prop);
  }
  valueAt(c, t) { let i = -1; for (let k = 0; k < c.segs.length && c.segs[k].start <= t; k++) i = k; return this.evalSeg(c, i, t); }
  evalSeg(c, i, t) { if (i < 0) return c.init; const s = c.segs[i]; return s.at(t, () => this.evalSeg(c, i - 1, s.start)); }
  write(c, v) {
    if (Array.isArray(v) ? c.last && v[0] === c.last[0] && v[1] === c.last[1] : v === c.last) return;
    c.last = v; const e = c.el, p = c.prop;
    if (p === 'text') e.textContent = v;
    else if (p === 'scrollTop') e.scrollTop = v;
    else if (p === 'translate') e.style.translate = `${v[0]}px ${v[1]}px`;
    else if (p.startsWith('class:')) e.classList.toggle(p.slice(6), !!v);
    else if (p.startsWith('--')) e.style.setProperty(p, typeof v === 'number' ? String(+v.toFixed(4)) : v);
    else if (v == null || v === false) e.removeAttribute(p); else e.setAttribute(p, v === true ? '' : v);
  }
  applyState(t) {
    for (const c of this.ch) this.write(c, this.valueAt(c, t));
    for (const f of this.follow) { const m = f.scrollHeight - f.clientHeight; if (f.scrollTop !== m) f.scrollTop = m; }
  }

  /* ── measuring: every point the cursor and camera need, in window pixels, at the moment it's needed ── */
  local(el, aim = [.5, .5]) {
    const w = this.win.getBoundingClientRect(), r = el.getBoundingClientRect(), k = w.width / this.Wd || 1;
    return { p: [(r.left - w.left + r.width * aim[0]) / k, (r.top - w.top + r.height * aim[1]) / k], size: [r.width / k, r.height / k], r, k };
  }
  scrollTarget(e, to, off) {
    const max = e.scrollHeight - e.clientHeight;
    if (typeof to === 'number') return Math.min(max, to);
    if (to === 'end') return max;
    if (typeof to === 'string' && to.endsWith('%')) return max * parseFloat(to) / 100;
    const c = this.one(to); if (!c) return 0;
    const k = this.win.getBoundingClientRect().width / this.Wd || 1;
    return Math.max(0, Math.min(max, (c.getBoundingClientRect().top - e.getBoundingClientRect().top) / k + e.scrollTop - off));
  }
  /* a swipe: the finger lands, travels `by` (window px) speeding up, and lifts while still moving; what it moves
     follows it 1:1, then coasts to rest over `coast` s with the speed it was let go at (momentum). */
  swipeStep(st, g, el) {
    const dur = st.dur ?? .36, C = st.coast ?? .8, by = st.by || [0, -220];
    g.by = by; g.g0 = g.arrive + .06; g.g1 = g.g0 + dur; g.release = g.g1; g.press = [[g.g0, g.g1]]; g.act = g.g1;
    g.end = g.g1 + (st.settle ?? C * .5);
    g.f = C > 0 ? (t) => Math.pow(cl((t - g.g0) / dur), 1.5) : (t) => ease(cl((t - g.g0) / dur));
    const coast = (rest, v, t) => { const u = C > 0 ? cl((t - g.g1) / C) : 1, n = Math.min(7, Math.max(1.2, rest > .5 ? v * C / rest : 1.2)); return rest * (1 - Math.pow(1 - u, n)); };
    if (st.scroll != null) {
      const e = st.in ? this.one(st.in) : el, sg = { to: 0 }, fy = Math.abs(by[1]);
      if (e) {
        this.seg(e, 'scrollTop', g.g0, (t, from) => {
          const s0 = from(), D = sg.to - s0, sgn = Math.sign(D) || 1, Ld = Math.min(fy, Math.abs(D));
          return t < g.g1 ? s0 + sgn * Ld * g.f(t) : s0 + sgn * (Ld + coast(Math.abs(D) - Ld, 1.5 * fy / dur, t));
        });
        this.deferred.push({ t: g.g0, run: () => { sg.to = this.scrollTarget(e, st.scroll, st.offset ?? 16); } });
      }
    }
    if (st.prop) {
      const fr = st.follow ?? (C > 0 ? .45 : 1), a = st.from ?? 0, b = st.to ?? 1;
      const p = (t) => (t < g.g1 ? fr * g.f(t) : fr + coast(1 - fr, 1.5 * fr / dur, t));
      for (const e of st.el ? this.$$(st.el) : [el]) if (e) this.seg(e, st.prop, g.g0, (t) => lerp(a, b, p(t)));
    }
  }
  measureDelta(g) { if (!g.onto) return; const a = this.local(g.el).p, b = this.local(g.onto).p; g.delta = [b[0] - a[0], b[1] - a[1]]; }
  probe() {
    for (const c of this.ch) c.last = undefined;
    for (const g of this.track) g.ptEnd = null;      // re-measured below, so a relayout never keeps a stale end point
    const jobs = [...this.deferred.map((d) => ({ t: d.t, run: d.run, first: true }))];
    for (const g of this.track) {
      if (!g.el) continue;
      jobs.push({ t: g.arrive, run: () => { g.pt = this.local(g.el, g.aim).p; } });
      if (g.kind === 'drag') jobs.push({ t: g.release, run: () => { g.ptEnd = this.local(g.el, g.aim).p; } });
    }
    for (const z of this.zooms) if (z.el) jobs.push({ t: z.start + z.dur, run: () => { const m = this.local(z.el, z.aim); z.pt = m.p; z.size = m.size; } });
    jobs.sort((a, b) => a.t - b.t || (b.first ? 1 : 0) - (a.first ? 1 : 0));
    for (const j of jobs) { this.applyState(j.t); j.run(); }
    this.track.forEach((g) => { g.pt = g.pt || [this.Wd / 2, this.Hd / 2]; g.ptEnd = g.by ? [g.pt[0] + g.by[0], g.pt[1] + g.by[1]] : g.ptEnd || g.pt; });
    const t = this.t < 0 ? 0 : this.t; this.t = -1; this.render(t, true);
  }

  /* ── layout of the stage ── */
  recordSetup() {
    document.documentElement.classList.add('tour-record', 'sf-clean');
    this.root.classList.add('is-record');
    const r = (this.q.get('ratio') || '16:9').split(':').map(Number);
    const fit = () => {
      const vw = innerWidth, vh = innerHeight;
      let w = vw, h = vh;
      if (r.length === 2 && r[0] > 0) { const a = r[0] / r[1]; if (vw / vh > a) w = Math.round(vh * a); else h = Math.round(vw / a); }
      this.root.style.setProperty('--rw', w + 'px'); this.root.style.setProperty('--rh', h + 'px');
    };
    fit(); addEventListener('resize', fit);
  }
  relayout() { if (!this.alive) return; this.layout(); this.grow(); this.probe(); }
  /* [data-tour-grow]: each one's natural height (design px) goes into --h, so CSS can open it with --in as it arrives */
  grow() {
    for (const e of this.grows) { e.style.setProperty('max-height', 'none', 'important'); e.style.setProperty('--h', e.offsetHeight + 'px'); e.style.removeProperty('max-height'); }
  }
  layout() {
    const W = this.stage.clientWidth, H = this.stage.clientHeight, rec = this.rec;
    const sqr = !!this.sizes.square && W / H >= .8 && W / H < 1.15;
    let [Wd, Hd] = this.sizes.tall && W / H < .8 ? this.sizes.tall : sqr ? this.sizes.square : this.sizes.wide;
    this.root.classList.toggle('is-tall', W / H < .8); this.root.classList.toggle('is-square', sqr);
    if (!(Hd > 0)) { const b = this.stage.querySelector('[data-tour-frame]')?.getBoundingClientRect() || { width: W, height: H }; Hd = Math.max(1, Math.round(Wd * b.height / (b.width || 1))); }   // 'auto': the frame's shape
    if (Wd !== this.Wd || Hd !== this.Hd) { this.Wd = Wd; this.Hd = Hd; this.win.style.width = Wd + 'px'; this.win.style.height = Hd + 'px'; }
    this.root.classList.toggle('is-tall', W / H < .8);       // before measuring, so the product's CSS can reflow for it
    const stack = W / H < 1.15, L = { W, H, stack };
    const su = rec ? Math.min(W, H) / 100 : Math.min(Math.max(Math.min(W * .0125, H * .01), 6), 9.6);
    this.stage.style.setProperty('--su', su + 'px');
    L.bandH = this.band ? this.band.offsetHeight : 0;
    const fr = this.stage.querySelector('[data-tour-frame]');
    if (fr) {     // the format draws the frame (a phone's glass, a mat) in CSS: the window fills it and every zoom stays inside it
      const sr = this.stage.getBoundingClientRect(), r = fr.getBoundingClientRect(), F = { x: r.left - sr.left, y: r.top - sr.top, w: r.width, h: r.height };
      L.F = F; L.framed = true; L.s = Math.max(F.w / Wd, F.h / Hd); L.x = F.x + (F.w - Wd * L.s) / 2; L.y = F.y + (F.h - Hd * L.s) / 2; L.aim = [.5, .5]; L.lift = 0;
      this.stage.style.removeProperty('--card-top');
      this.rig().style.clipPath = `inset(${F.y}px ${W - F.x - F.w}px ${H - F.y - F.h}px ${F.x}px round ${getComputedStyle(fr).borderTopLeftRadius})`;
      this.L = L; this.capTop();
    } else if (!stack) {
      const fit = !rec && this.S.fit;      // fit: [w, h, y] the window's share of a stage that holds nothing else (README)
      const fw = fit ? fit[0] : rec ? .8 : .74, fh = fit ? fit[1] : rec ? .76 : .7;
      L.s = Math.min(W * fw / Wd, H * fh / Hd);
      L.x = (W - Wd * L.s) / 2; L.y = H * (fit ? fit[2] ?? .5 : rec ? .455 : .47) - Hd * L.s / 2;
      L.F = { x: 0, y: 0, w: W, h: H }; L.aim = fit ? [.5, .5] : [.56, .44]; L.lift = .3;
      this.stage.style.removeProperty('--card-top'); this.rig().style.clipPath = '';
    } else {
      const pad = W * .04, tall = W / H < .8;
      L.s = Math.min((W - 2 * pad) / Wd, H * (rec ? (tall ? .42 : .6) : .5) / Hd);
      const fy = rec ? (tall ? H * .25 : H * .045) : Math.max(64, (H - Hd * L.s - 2 * pad) * (tall ? .3 : .12));
      L.F = { x: 0, y: fy, w: W, h: Hd * L.s + 2 * pad };
      L.x = (W - Wd * L.s) / 2; L.y = fy + pad; L.aim = [.5, .5]; L.lift = 0;
      this.stage.style.setProperty('--card-top', fy + L.F.h + su * 1.4 + 'px'); this.L = L; this.capTop();
      this.rig().style.clipPath = `inset(${fy}px 0 ${H - fy - L.F.h}px 0)`;
    }
    this.root.classList.toggle('is-stack', stack); this.root.classList.toggle('is-tall', W / H < .8);
    L.cs = Math.min(1.15, Math.max(.6, L.s));      // cursor size follows the window, within reason
    this.L = L;
    if (this.driver === 'scroll' && !this.still) this.root.style.height = `${H + this.duration * H * .3}px`;
    this.t = this.t < 0 ? 0 : this.t; const t = this.t; this.t = -1; this.render(t, true);
  }
  rig() { return this.win.parentElement; }

  /* ── the camera: push in on a point, keep the window filling the frame (Monet Shot's fit clamp) ── */
  zFor(zm) {
    if (!zm.el) return 1;
    if (typeof zm.z === 'number') return zm.z * (this.L.stack && !this.L.framed ? 1.15 : 1);
    const F = this.L.F, sz = zm.size || [this.Wd, this.Hd], f = Array.isArray(zm.fill) ? zm.fill[this.L.stack ? 1 : 0] : zm.fill;   // fill: n or [wide, stacked]
    return Math.min(2.6, Math.max(1, Math.min(F.w * f / (sz[0] * this.L.s), F.h * f / (sz[1] * this.L.s))));
  }
  camAt(t) { let i = -1; for (let k = 0; k < this.zooms.length && this.zooms[k].start <= t; k++) i = k; return this.camSeg(i, t); }
  camSeg(i, t) {
    if (i < 0) return { z: 1, c: [this.Wd / 2, this.Hd / 2] };
    const zm = this.zooms[i], from = this.camSeg(i - 1, zm.start), toZ = this.zFor(zm), toC = zm.el && zm.pt ? zm.pt : from.c;
    const p = ease(cl((t - zm.start) / zm.dur));
    return { z: from.z * Math.pow(toZ / from.z, p), c: [lerp(from.c[0], toC[0], p), lerp(from.c[1], toC[1], p)] };
  }
  camT(z, c, b) {
    if (z <= 1.0001) return b;
    const L = this.L, F = L.F, s = b.s * z, ww = this.Wd * s, wh = this.Hd * s;
    const fit = (t, len, f0, fl) => (len <= fl ? f0 + (fl - len) / 2 : Math.min(f0, Math.max(f0 + fl - len, t)));
    const x1 = fit(F.x + F.w * L.aim[0] - s * c[0], ww, F.x, F.w), y1 = fit(F.y + F.h * L.aim[1] - s * c[1], wh, F.y, F.h);
    const k = cl((z - 1) / .6);
    const px = lerp(b.x + b.s * c[0], x1 + s * c[0], k), py = lerp(b.y + b.s * c[1], y1 + s * c[1], k);
    // never show past an edge: the window either sits wholly inside the frame or covers it
    const keep = (v, len, f0, fl) => { const a = f0, b = f0 + fl - len; return Math.min(Math.max(a, b), Math.max(Math.min(a, b), v)); };
    return { s, x: keep(px - s * c[0], ww, F.x, F.w), y: keep(py - s * c[1], wh, F.y, F.h) };
  }

  /* ── the cursor: gentle arcs between points, smootherstep, glued to a handle while dragging ── */
  /* who: 'main', or a second pointer's name (script.pointers). vis: its idle fade (pointers.<who>.idle, step `from`);
     tag: the latest `tag` its steps gave, shown beside its label */
  cursorAt(t, who = 'main') {
    const tr = this.tracks?.[who] || [], P = this.S.pointers?.[who] || {}; let i = -1;
    for (let k = 0; k < tr.length && tr[k].start <= t; k++) i = k;
    const en = P.enter || this.S.enter || [.86, .96], entry = [en[0] * this.Wd, en[1] * this.Hd];
    if (i < 0 || !tr[i].pt) return { p: entry, shape: 'arrow', press: false, vis: 1 };   // not measured yet (a pointer step at t=0 before probe)
    const g = tr[i], from = g.from && [g.from[0] * this.Wd, g.from[1] * this.Hd], prev = from || (i ? tr[i - 1].ptEnd : entry);
    const gap = i ? g.start - tr[i - 1].end : Infinity, back = from || (P.idle != null && gap > P.idle);
    const vis = P.idle != null && t >= g.end ? 1 - ease(cl((t - g.end - P.idle) / .45)) : back ? ease(cl((t - g.start) / .3)) : 1;
    let tag; for (let k = i; k >= 0 && tag == null; k--) tag = tr[k].tag;
    const press = !!g.press?.some(([a, b]) => t >= a && t < b);
    const shape = g.shape || this.shapeOf(g.el);
    if (t < g.arrive) {
      const u = cl((t - g.start) / (g.arrive - g.start)), e = ease(Math.pow(u, .9));
      const dx = g.pt[0] - prev[0], dy = g.pt[1] - prev[1], dist = Math.hypot(dx, dy);
      const side = (dx >= 0 ? -1 : 1) * (rnd(g.i * 3) > .2 ? 1 : -1), bow = Math.sin(Math.PI * e) * Math.min(.1, dist / 2200) * side * (P.bow ?? 1);
      return { p: [lerp(prev[0], g.pt[0], e) - dy * bow, lerp(prev[1], g.pt[1], e) + dx * bow], shape: u > .82 ? shape : 'arrow', press: false, vis, tag };
    }
    if ((g.kind === 'drag' || g.kind === 'swipe') && t < g.release) { const e = g.f ? g.f(t) : ease(cl((t - g.g0) / (g.g1 - g.g0))); return { p: [lerp(g.pt[0], g.ptEnd[0], e), lerp(g.pt[1], g.ptEnd[1], e)], shape, press, vis, tag }; }
    return { p: g.ptEnd, shape, press, vis, tag };
  }
  /* a second pointer (an AI agent's cursor, a collaborator's): an arrow in its own look, with a label */
  drawPointer(who, t, T, cz) {
    const L = this.L, P = this.S.pointers?.[who] || {}, tr = this.tracks[who];
    let c = (this.curs ||= {})[who];
    if (!c) {
      c = this.curs[who] = document.createElement('div'); c.className = 'tour-cur'; c.dataset.who = who; c.dataset.look = P.look || 'agent';
      c.innerHTML = CURSORS + '<span class="tour-tag"><b></b><span></span></span>'; this.stage.append(c);
      c.shapes = { arrow: c.querySelector('.tour-arrow'), pointer: c.querySelector('.tour-hand'), text: c.querySelector('.tour-beam') };
    }
    const cu = this.cursorAt(t, who), sp = [T.x + T.s * cu.p[0], T.y + T.s * cu.p[1]], shape = P.shapes ? cu.shape : 'arrow';
    const co = (this.cursorOn && tr.length ? ease(cl((t - tr[0].start + .15) / .35)) * (1 - ease(cl((t - this.outroAt + .3) / .5))) : 0) * cu.vis
      * (L.stack ? cl(1 - Math.max(L.F.y - sp[1], sp[1] - L.F.y - L.F.h) / 24) : 1);
    c.style.opacity = co.toFixed(3);
    c.style.transform = `translate(${sp[0].toFixed(2)}px,${sp[1].toFixed(2)}px) scale(${(cz * (cu.press ? .86 : 1)).toFixed(4)})`;
    if (shape !== c.shapeNow) { c.shapeNow = shape; for (const [k, el] of Object.entries(c.shapes)) el.style.display = k === shape ? '' : 'none'; }
    const lab = P.label ?? who, tg = cu.tag ?? '';
    if (c.tagNow !== lab + '|' + tg) { c.tagNow = lab + '|' + tg; const [b, s] = c.querySelector('.tour-tag').children; b.textContent = lab; s.textContent = tg; s.hidden = !tg; }
  }
  /* the finger (pointer: 'touch'): unseen between touches; a soft shadow gathers just before contact, flattens
     while pressed and lifts away. Drags and swipes carry it across the glass. */
  touchAt(t) {
    const A = .18, UP = .28; let hit = null;
    for (const g of this.tracks.main) if (g.press) for (const [a, b] of g.press) if (t >= a - A && t <= b + UP) hit = { g, a, b };
    if (!hit) return null;
    const { g, a, b } = hit, slide = (g.kind === 'drag' || g.kind === 'swipe') && t >= a && t <= b;
    const e = slide ? (g.f ? g.f(t) : ease(cl((t - g.g0) / (g.g1 - g.g0)))) : 0;
    const p = t < a ? g.pt : slide ? [lerp(g.pt[0], g.ptEnd[0], e), lerp(g.pt[1], g.ptEnd[1], e)] : g.ptEnd;
    let o, k;
    if (t < a) { const u = ease(cl((t - a + A) / A)); o = .4 * u; k = 1.45 - .35 * u; }
    else if (t <= b) { const u = ease(cl((t - a) / .09)); o = .4 + .5 * u; k = 1.1 - .2 * u - (g.kind === 'longpress' ? .1 * ease(cl((t - a) / (b - a))) : 0); }
    else { const u = ease(cl((t - b) / UP)); o = .9 * (1 - u); k = .9 + .35 * u; }
    return { p, o, k, down: t >= a && t <= b };
  }
  shapeOf(el) {
    if (!el) return 'arrow';
    if (el.closest('input, textarea, [contenteditable], [data-tour-cursor="text"]')) return 'text';
    if (el.closest('[data-tour-cursor="arrow"]')) return 'arrow';
    if (el.closest('a, button, label, select, summary, [role="button"], [role="tab"], [role="switch"], [data-tour-cursor="pointer"]')) return 'pointer';
    return 'arrow';
  }

  /* ── one frame ── */
  render(t, force) {
    t = Math.max(0, Math.min(this.duration, t));
    if (t === this.t && !force) return;
    this.t = t; this.api && (this.api._t = () => this.t);
    this.applyState(t);
    const L = this.L, W = L.W, H = L.H;
    const band = this.S.intro === 0 ? 0 : 1 - ease(cl((t - .3) / (this.S.intro ?? 1.3)));
    const out = ease(cl((t - this.outroAt) / 1.4));
    const base = { s: L.s, x: L.x, y: L.y - L.bandH * L.lift * band };
    let { z, c } = this.camOn ? this.camAt(t) : { z: 1, c: [0, 0] };
    z = Math.pow(z, 1 - out);
    let T = this.camT(z, c, base);
    if (out > 0 && !L.framed) { const k = 1 - .1 * out, px = W / 2, py = L.F.y + L.F.h * .3; T = { s: T.s * k, x: px + (T.x - px) * k, y: py + (T.y - py) * k - H * .04 * out }; }
    this.win.style.transform = `translate(${T.x.toFixed(2)}px,${T.y.toFixed(2)}px) scale(${T.s.toFixed(5)})`;
    // a framed window stays put for the outro (the format's CSS can use --tour-out); a loop fades through its seam
    const seam = this.loop ? Math.min(this.wraps ? ease(cl(t / .4)) : 1, 1 - ease(cl((t - this.duration + .4) / .4))) : 1;
    this.win.style.opacity = String((L.framed ? 1 : 1 - .55 * out) * seam);
    this.root.style.setProperty('--tour-out', out.toFixed(4));
    if (this.band) {      // data-tour-band="css": no slide; the format animates it from --tour-band (1 → 0)
      this.root.style.setProperty('--tour-band', band.toFixed(4));
      if (this.band.dataset.tourBand !== 'css') this.band.style.transform = `translateY(${((1 - band) * 104).toFixed(2)}%)`;
      this.band.style.visibility = band < .001 ? 'hidden' : '';
    }
    if (this.end) { const e = ease(cl((t - this.outroAt - .4) / 1.1)); this.end.style.setProperty('--in', e.toFixed(4)); this.end.style.visibility = e < .001 ? 'hidden' : ''; }
    this.root.style.setProperty('--tour-p', (t / this.duration).toFixed(4));

    // cursor
    const cz = this.touch ? T.s : (1 + (z - 1) * .45) * L.cs;      // a fingertip is part of the screen, so it zooms with it
    if (this.touch) {
      const tu = this.cursorOn ? this.touchAt(t) : null;
      this.cur.style.opacity = tu ? (tu.o * seam).toFixed(3) : '0';
      if (tu) this.cur.style.transform = `translate(${(T.x + T.s * tu.p[0]).toFixed(2)}px,${(T.y + T.s * tu.p[1]).toFixed(2)}px) scale(${(cz * tu.k).toFixed(4)})`;
      this.cur.classList.toggle('is-down', !!tu?.down);
    } else {
      const cu = this.cursorAt(t), sp = [T.x + T.s * cu.p[0], T.y + T.s * cu.p[1]];
      const co = (this.cursorOn ? ease(cl((t - this.firstMove + .15) / .35)) * (1 - ease(cl((t - this.outroAt + .3) / .5))) : 0) * cu.vis
      * (L.stack ? cl(1 - Math.max(L.F.y - sp[1], sp[1] - L.F.y - L.F.h) / 24) : 1);   // stacked: never drawn outside the window's frame
      this.cur.style.opacity = co.toFixed(3);
      const ml = this.S.pointers?.main?.label;     // pointers.main.label: the person's cursor gets a label too
      if (ml && !this.cur.querySelector('.tour-tag')) { this.cur.dataset.who = 'main'; this.cur.insertAdjacentHTML('beforeend', `<span class="tour-tag"><b>${ml}</b></span>`); }
      this.cur.style.transform = `translate(${sp[0].toFixed(2)}px,${sp[1].toFixed(2)}px) scale(${(cz * (cu.press ? .86 : 1)).toFixed(4)})`;
      if (cu.shape !== this.shapeNow) { this.shapeNow = cu.shape; for (const [k, el] of Object.entries(this.shapes)) el.style.display = k === cu.shape ? '' : 'none'; }
    }
    for (const who of Object.keys(this.tracks)) if (who !== 'main' && this.tracks[who].length) this.drawPointer(who, t, T, cz);
    for (const who in this.curs || {}) if (!this.tracks[who]?.length) this.curs[who].style.opacity = '0';
    // ripples
    let r = 0;
    for (const rp of this.ringAt) {
      const u = (t - rp.t) / .6; if (u < 0 || u > 1 || r >= this.rings.length || !this.cursorOn) continue;
      const q = rp.g.kind === 'drag' ? rp.g.pt : rp.g.ptEnd, el = this.rings[r++]; el.dataset.who = rp.g.who;
      el.style.opacity = ((1 - u) * (this.touch ? .55 : .9)).toFixed(3);
      el.style.transform = `translate(${(T.x + T.s * q[0]).toFixed(1)}px,${(T.y + T.s * q[1]).toFixed(1)}px) scale(${((this.touch ? .85 + ease(u) * .75 : .3 + ease(u) * .9) * cz).toFixed(3)})`;
    }
    for (; r < this.rings.length; r++) this.rings[r].style.opacity = '0';
    // chapter card, caption, keys
    this.fade(this.card, this.chapters, t, (c) => { this.card.children[0].textContent = c.n; this.card.children[1].innerHTML = c.title; this.card.children[2].innerHTML = c.line; this.card.children[2].hidden = !c.line; this.capTop(); });
    this.fade(this.cap, this.capsOn ? this.caps : [], t, (c) => { this.cap.textContent = c.text; });
    this.fade(this.keysEl, this.keyList, t, (c) => { this.keysEl.innerHTML = c.keys.map((k2) => `<kbd>${k2}</kbd>`).join(''); }, .18, .3);
    if (this.keyList.length) { this.keysEl.style.left = W / 2 + 'px'; this.keysEl.style.top = (L.stack ? L.F.y + L.F.h * .78 : Math.min(H * .78, T.y + T.s * this.Hd * .82)) + 'px'; }
    this.onFrame && this.onFrame(t);
  }
  capTop() { if (this.L.stack) this.stage.style.setProperty('--cap-top', this.card.offsetTop + this.card.offsetHeight + parseFloat(this.stage.style.getPropertyValue('--su')) * 2.2 + 'px'); }
  fade(el, list, t, fill, fi = .6, fo = .5) {
    const i = list.findIndex((c) => t >= c.start && t < c.end);
    if (i !== (el._i ?? -2)) { el._i = i; if (i >= 0) fill(list[i]); }
    const c = list[i], o = !c ? 0 : this.still && this.fixT == null ? 1 : ease(cl((t - c.start) / fi)) * (1 - ease(cl((t - (c.end - fo)) / fo)));
    el.style.opacity = o.toFixed(3); el.style.setProperty('--o', o.toFixed(3));
  }

  /* ── drivers: scroll (pinned, with autodrift), play (a clock, with controls), record, still ── */
  drivers() {
    const R = this.root;
    R.classList.add('is-' + this.driver);
    if (this.still) {
      R.classList.add('is-still'); R.style.height = '';
      this.begun = true; this.render(this.fixT ?? this.stillAt, true);
      return;
    }
    if (this.rec && !this.host) {
      this.render(0, true);
      this.api.ready.then(() => setTimeout(() => { if (!this.frozen) this.play(); }, (+this.q.get('hold') || 1.2) * 1000));
      return;
    }
    if (this.driver === 'manual') { this.render(0, true); return; }   // the page drives it: play(), pause(), seek(), load(), onFrame
    this.gates.forEach((g) => g.addEventListener('click', (e) => { e.preventDefault(); this.begin(); }));
    if (this.driver === 'play') this.controls();
    else this.scrollDriver();
  }
  begin() {
    if (this.begun) { if (this.driver === 'play') this.toggle(); return; }
    this.begun = true; this.root.classList.add('is-begun');
    this.root.dispatchEvent(new CustomEvent('tour:begin', { bubbles: true }));
    this.music();
    if (this.driver === 'play') this.play(); else this.drift.start();
  }
  music() {
    const src = this.root.dataset.music; if (!src) return;
    const a = (this.audio = new Audio(src)); a.loop = true; a.volume = 0;
    a.play().then(() => { let v = 0; const up = () => { v = Math.min(1, v + .04); a.volume = v; if (v < 1) setTimeout(up, 40); }; up(); }).catch(() => {});
  }
  play() {
    if (this.t >= this.duration - .02) this.t = 0;
    this.frozen = false; this.playing = true; this.root.classList.add('is-playing');
    let t0 = performance.now() - this.t * 1000;
    const loop = (now) => {
      if (!this.playing || !this.alive) return;
      const t = (now - t0) / 1000;
      if (t >= this.duration && this.loop) { t0 = now; this.wraps = (this.wraps || 0) + 1; this.render(0); this.raf = requestAnimationFrame(loop); return; }
      if (t >= this.duration) { this.render(this.duration); this.pause(); this.root.dispatchEvent(new CustomEvent('tour:end', { bubbles: true })); return; }
      this.render(t); this.raf = requestAnimationFrame(loop);
    };
    cancelAnimationFrame(this.raf); this.raf = requestAnimationFrame(loop);
    this.syncCtl && this.syncCtl();
  }
  pause() { this.playing = false; cancelAnimationFrame(this.raf); this.root.classList.remove('is-playing'); this.syncCtl && this.syncCtl(); }
  toggle() { this.playing ? this.pause() : this.play(); }

  controls() {
    const c = document.createElement('div'); c.className = 'tour-ctl';
    c.innerHTML = `<button type="button" class="tour-pp" aria-label="Play"></button>
      <span class="tour-scrub"><input type="range" min="0" max="${this.duration}" step="0.01" value="0" aria-label="Seek">${this.chapters.map((ch) => `<i style="left:${(ch.start / this.duration) * 100}%"></i>`).join('')}</span>
      <span class="tour-time">0:00 / ${fmtTime(this.duration)}</span>`;
    this.stage.append(c);
    const pp = c.querySelector('.tour-pp'), rg = c.querySelector('input'), tm = c.querySelector('.tour-time');
    const PLAY = '<svg viewBox="0 0 20 20"><path d="M6 3.8v12.4L16 10z"/></svg>', PAUSE = '<svg viewBox="0 0 20 20"><path d="M5.5 4h3v12h-3zM11.5 4h3v12h-3z"/></svg>';
    this.syncCtl = () => { pp.innerHTML = this.playing ? PAUSE : PLAY; pp.setAttribute('aria-label', this.playing ? 'Pause' : 'Play'); };
    this.onFrame = (t) => { if (document.activeElement !== rg) rg.value = t; rg.style.setProperty('--v', t / this.duration); tm.textContent = `${fmtTime(t)} / ${fmtTime(this.duration)}`; };
    pp.addEventListener('click', () => { if (!this.begun) this.begin(); else this.toggle(); });
    rg.addEventListener('input', () => { if (!this.begun) { this.begun = true; this.root.classList.add('is-begun'); } this.pause(); this.render(+rg.value); });
    this.root.addEventListener('keydown', (e) => {
      if (e.target.closest('input, textarea, select') && e.target !== rg) return;
      if (e.key === ' ' || e.key === 'k') { e.preventDefault(); this.begin(); }
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { if (e.target === rg) return; e.preventDefault(); this.pause(); this.render(this.t + (e.key === 'ArrowRight' ? 3 : -3)); }
    });
    this.syncCtl(); this.render(0, true);
  }

  scrollDriver() {
    const R = this.root, D = (this.drift = { on: true, done: false, active: false, pos: 0, last: null, lt: 0 });
    const lock = (R.dataset.lock ?? 'true') !== 'false';
    const span = () => R.offsetHeight - this.stage.clientHeight;
    const top = () => R.getBoundingClientRect().top + scrollY;
    const tNow = () => { const s = span(); return s > 0 ? cl((scrollY - top()) / s) * this.duration : 0; };
    // the switch: the one way to take over while it plays itself
    const sw = document.createElement('label'); sw.className = 'tour-drift';
    sw.innerHTML = `<span>Auto-play</span><input type="checkbox" role="switch" checked><i></i><span class="tour-say">It plays by itself. ${matchMedia('(hover: none)').matches ? 'Tap' : 'Click'} here to take over.</span>`;
    this.stage.append(sw);
    const input = sw.querySelector('input');
    input.addEventListener('change', () => { D.on = input.checked; D.last = null; sw.classList.remove('is-saying'); });
    let sayT = 0;
    const locked = () => D.active && D.on && !D.done;
    const block = (e) => { if (!locked() || (e.target instanceof Node && sw.contains(e.target)) || !e.cancelable) return; e.preventDefault(); sw.classList.add('is-saying'); clearTimeout(sayT); sayT = setTimeout(() => sw.classList.remove('is-saying'), 2600); };
    // before the first click, a film at the very top holds the page still (the gate)
    const atTop = top() < 4;
    const hold = (e) => { if (!this.begun && atTop && e.cancelable && scrollY < 4) e.preventDefault(); };
    const KEYS = new Set([' ', 'PageDown', 'PageUp', 'ArrowDown', 'ArrowUp', 'Home', 'End']);
    const onKey = (e) => { if (KEYS.has(e.key) && !e.target?.closest?.('input, textarea, select, button, [contenteditable]')) { block(e); hold(e); } };
    const onWheel = (e) => { if (lock) block(e); hold(e); };
    const onFirst = (e) => {
      if (this.begun || !atTop || scrollY > 4) return;
      if (e.type === 'keydown' && ['Tab', 'Shift', 'Meta', 'Alt', 'Control', 'CapsLock'].includes(e.key)) return;
      if (e.target.closest && e.target.closest('a[href]')) return;
      this.begin();
    };
    addEventListener('wheel', onWheel, { passive: false }); addEventListener('touchmove', onWheel, { passive: false });
    addEventListener('keydown', onKey); addEventListener('pointerdown', onFirst, true); addEventListener('keydown', onFirst, true);
    document.querySelectorAll('a[href^="#"]').forEach((a) => a.addEventListener('click', () => { if (!R.contains(a) || !a.matches('[data-tour-gate]')) { input.checked = false; D.on = false; } }));
    D.start = () => { D.active = true; D.last = null; R.classList.add('is-drifting'); };
    this.cleanup = () => { removeEventListener('wheel', onWheel); removeEventListener('touchmove', onWheel); removeEventListener('keydown', onKey); removeEventListener('pointerdown', onFirst, true); removeEventListener('keydown', onFirst, true); sw.remove(); };
    const pxps = () => this.stage.clientHeight * .3;
    const loop = (now) => {
      if (!this.alive) return;
      const dt = Math.min(.05, (now - D.lt) / 1000 || 0); D.lt = now;
      const endY = top() + span();
      if (D.active && D.on && !D.done && scrollY < endY - 1) {
        if (D.last !== null && Math.abs(scrollY - D.last) > 40) D.pos = scrollY;     // a scrollbar drag: carry on from there
        else if (D.last === null) D.pos = scrollY;
        D.pos = Math.min(endY, D.pos + pxps() * dt);
        scrollTo({ top: D.pos, behavior: 'instant' }); D.last = D.pos;
      }
      if (D.active && scrollY >= endY - 2) D.done = true;
      sw.classList.toggle('is-gone', !D.active || D.done);
      if (!this.frozen) this.render(tNow());
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /* swap in another script on the same window: the product goes back to how the page drew it, then the new
     script is compiled and measured. The playground uses it to turn a visitor's clicks into a live script. */
  load(script) {
    this.pause();
    for (const c of this.ch) { c.last = undefined; this.write(c, c.init); }
    this.S = script; this.compile();
    Object.assign(this.api, { duration: this.duration, chapters: this.chapters.map((c) => ({ t: c.start, n: c.n, title: c.title })), marks: this.marks });
    this.t = -1; this.layout(); this.grow(); this.probe();
    return this.api;
  }

  destroy() { this.alive = false; this.pause(); this.ro?.disconnect(); this.cleanup?.(); this.audio?.pause(); }
}
