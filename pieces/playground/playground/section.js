// demo/playground: the tour plays once, then the product is the visitor's. One Tour on the engine's manual driver:
//   intro   the band, and a choice: Watch the tour, or Let me try
//   watch   script.js (its act() steps expanded through machine.js) plays, with pause, scrub and "Your turn"
//   turn    the product goes back to its start; a hotspot sits on every action machine.js allows right now, and a
//           click on one appends that action's steps to a live script the engine plays on from (playground.js)
// ?turn starts on the visitor's turn (&do=open,name applies actions first: handy for checking), ?t=12 freezes the
// film, ?record&ratio=16:9 is the clean stage for Monet Shot (the film, then a closing frame).
import { Tour, include } from '../tour/tour.js';
import film from './script.js';
import def from './machine.js';
import { Machine, expand, live, sel } from './playground.js';

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const PLAY = '<svg viewBox="0 0 20 20"><path d="M6 3.8v12.4L16 10z"/></svg>', PAUSE = '<svg viewBox="0 0 20 20"><path d="M5.5 4h3v12h-3zM11.5 4h3v12h-3z"/></svg>';

export default function init(root) {
  const q = new URLSearchParams(location.search), rec = q.has('record');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stage = root.querySelector('[data-tour-stage]'), spotsEl = root.querySelector('.demo-playground-spots');
  const $ = (k) => [...root.querySelectorAll(`[data-pg="${k}"]`)];
  const F = expand(film, def);
  const filmScript = { ...F, outro: rec ? film.outro ?? 4 : .25 };
  const base = { size: film.size, enter: film.enter, pointer: film.pointer };
  const goals = Object.keys(def.actions).filter((n) => !def.actions[n].minor);
  let tour = null, phase = 'intro', hist = [], m = new Machine(def), busyUntil = 0, alive = true, swapT = 0, pingT = 0, refocus = false;
  const spots = new Map(), off = [];
  const on = (el, ev, fn, o) => { if (!el) return; el.addEventListener(ev, fn, o); off.push(() => el.removeEventListener(ev, fn, o)); };

  const setPhase = (p) => {
    phase = p;
    root.classList.toggle('is-watch', p === 'watch'); root.classList.toggle('is-turn', p === 'turn'); root.classList.toggle('is-begun', p !== 'intro');
    if (p !== 'turn') { spots.forEach((b) => b.remove()); spots.clear(); root.classList.remove('is-all'); }
  };

  // ── watching: the film, with its own little bar ──
  const watch = (from = 0) => {
    clearTimeout(swapT); root.classList.remove('is-swap');
    setPhase('watch'); tour.load(filmScript); tour.render(from, true); tour.play();
  };
  const syncPP = () => { const pp = $('pp')[0]; if (!pp) return; pp.innerHTML = tour?.playing ? PAUSE : PLAY; pp.setAttribute('aria-label', tour?.playing ? 'Pause' : 'Play'); };

  // ── the visitor's turn ──
  const toTurn = (instant) => {
    const go = () => {
      hist = []; m = new Machine(def); busyUntil = 0;
      tour.load(live(def, [], base).script); tour.render(0, true);
      setPhase('turn'); root.classList.remove('is-swap'); say(); place();
    };
    tour.pause(); clearTimeout(swapT);
    if (instant === true || reduce || phase === 'turn') return go();
    root.classList.add('is-swap'); swapT = setTimeout(go, 380);    // a short fade, so the reset never reads as a glitch
  };
  const act = (name, instant) => {
    if (phase !== 'turn' || !m.can(name)) return;
    const now = Math.max(tour.t, hist.length ? hist[hist.length - 1].at : 0);
    hist.push({ name, at: now });
    const L = live(def, hist, base); m = L.machine;
    tour.load(L.script);
    if (instant || reduce) { tour.render(tour.duration, true); busyUntil = 0; }
    else { tour.render(now, true); busyUntil = Math.min(tour.duration, now + 1.25); if (tour.duration - now > .03) tour.play(); }
    say(); place();
  };
  const next = () => {
    const avail = m.available(), fresh = (n) => avail.includes(n) && !m.s.done.has(n);
    return F.path.find(fresh) || avail.find((n) => fresh(n) && !def.actions[n].minor) || null;
  };
  const say = () => {
    const done = goals.filter((n) => m.s.done.has(n)).length, all = done === goals.length, n = next();
    $('count').forEach((e) => { e.textContent = `${done} / ${goals.length}`; });
    root.classList.toggle('is-all', all);
    const line = all ? "That's everything it does. Yours to keep, below." : n && hist.length ? `Next: ${def.actions[n].hint || n}.` : null;
    if (line) $('say').forEach((e) => { e.textContent = line; });
    else $('say').forEach((e) => { e.textContent = 'Click anything with a dot. It works the way you just watched.'; });
  };
  const target = (name) => tour.win.querySelector(sel(def.actions[name].on));
  const spot = (name) => {
    const a = def.actions[name], b = document.createElement('button');
    b.type = 'button'; b.className = 'demo-playground-spot' + (a.minor ? ' is-minor' : '');
    b.setAttribute('aria-label', a.hint || name);
    b.innerHTML = `<i></i><span class="demo-playground-tip" aria-hidden="true">${a.hint || name}</span>`;
    const hov = (k, v) => target(name)?.classList.toggle(k, v);
    b.addEventListener('pointerenter', () => hov('is-hover', true));
    b.addEventListener('pointerleave', () => { hov('is-hover', false); hov('is-press', false); });
    b.addEventListener('pointerdown', () => hov('is-press', true));
    b.addEventListener('click', () => { hov('is-hover', false); hov('is-press', false); refocus = document.activeElement === b && b.matches(':focus-visible'); act(name); });
    spotsEl.append(b); spots.set(name, b); return b;
  };
  // hotspots follow their targets every frame (the camera moves them), and show once the last action has settled
  function place() {
    if (phase !== 'turn' || !tour) return;
    const avail = new Set(m.available()), ready = !tour.playing || tour.t >= busyUntil, nx = next(), sr = stage.getBoundingClientRect();
    for (const [n, b] of spots) if (!avail.has(n)) { b.remove(); spots.delete(n); }
    for (const n of avail) {
      const el = target(n); if (!el) continue;
      const b = spots.get(n) || spot(n), r = el.getBoundingClientRect();
      const w = Math.max(r.width, 34), h = Math.max(r.height, 34);
      b.style.cssText = `left:${(r.left - sr.left + r.width / 2 - w / 2).toFixed(1)}px;top:${(r.top - sr.top + r.height / 2 - h / 2).toFixed(1)}px;width:${w.toFixed(1)}px;height:${h.toFixed(1)}px`;
      b.classList.toggle('is-shown', ready); b.classList.toggle('is-next', n === nx && ready); b.classList.toggle('is-below', r.top - sr.top < 64);
    }
    if (ready && refocus) { refocus = false; (spots.get(nx) || spots.values().next().value)?.focus({ preventScroll: true }); }
  }

  (async () => {
    await include(root);
    if (!alive) return;
    tour = new Tour(root, filmScript, { driver: 'manual' });
    if (rec || tour.fixT != null) return;              // the recording and frozen frames are the film alone
    tour.syncCtl = syncPP;
    const scrub = $('scrub')[0], time = $('time')[0];
    tour.onFrame = (t) => {
      if (phase === 'watch' && scrub) { scrub.max = tour.duration; if (document.activeElement !== scrub) scrub.value = t; scrub.parentNode.style.setProperty('--v', t / tour.duration); }
      if (phase === 'watch' && time) time.textContent = `${fmt(t)} / ${fmt(tour.duration)}`;
      if (phase === 'turn') place();
    };
    on(root, 'tour:end', () => { if (phase === 'watch') toTurn(); else place(); syncPP(); });
    $('watch').forEach((b) => on(b, 'click', () => watch(0)));
    $('try').forEach((b) => on(b, 'click', () => toTurn()));
    $('replay').forEach((b) => on(b, 'click', () => watch(1)));      // the band has already gone: start as it clears
    $('reset').forEach((b) => on(b, 'click', () => toTurn()));
    $('pp').forEach((b) => on(b, 'click', () => (tour.playing ? tour.pause() : tour.play())));
    on(scrub, 'input', () => { tour.pause(); tour.render(+scrub.value); });
    on(stage, 'pointerdown', (e) => {
      if (e.target.closest('button, a, input, .demo-playground-turn, .demo-playground-band, .tour-ctl')) return;
      if (phase === 'intro') { watch(0); return; }
      if (phase === 'turn') { spotsEl.classList.remove('is-ping'); void spotsEl.offsetWidth; spotsEl.classList.add('is-ping'); clearTimeout(pingT); pingT = setTimeout(() => spotsEl.classList.remove('is-ping'), 520); }
    });
    tour.render(0, true); syncPP();                     // reduced motion too: the band first, the choice is theirs
    window.playground = { watch, turn: toTurn, act, get state() { return m.s; }, get available() { return m.available(); } };
    if (q.has('turn')) { toTurn(true); (q.get('do') || '').split(',').filter(Boolean).forEach((n) => act(n.trim(), true)); }
  })();

  return () => { alive = false; clearTimeout(swapT); clearTimeout(pingT); off.forEach((f) => f()); spots.forEach((b) => b.remove()); tour?.destroy(); };
}
