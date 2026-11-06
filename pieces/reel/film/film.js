/* film.js: a code tour wherever a film layout would have put a video. The tour engine does the work; this
   file builds the window into a slot, starts and stops it, and hands the page a small player.

     <figure class="clip" data-film="create" data-autoplay data-loop></figure>

   data-film       which tour to play: a key of tours.js
   data-autoplay   plays while half of it is on screen; never with reduced motion, and not after a pause
   data-loop       starts again at the end, through a short fade
   data-driver     manual (default: the page drives it) | play (the engine's play bar, Space and arrows)
   data-captions   record (default: only in ?record) | always: the tour's caption steps on screen
   data-fit        "w h [y]": how much of a wide slot the window fills (default: the engine's .74 × .7)
   data-src        a recording to show instead (a Monet Shot MP4). The slot gets a <video> and the same
                   player, so the page's buttons, timelines and transcripts keep working. data-poster,
                   data-vtt (captions file) and data-sound (not muted) go with it.

   await film(slot) → { play() pause() toggle() seek(t) rest() t duration playing chapters captions on('end', fn) }
   ?record shows only the slot marked data-record (or ?record=<tour name>), alone, for Monet Shot. */
import { Tour } from '../tour/tour.js';
import tours from './tours.js';

const q = new URLSearchParams(location.search);
export const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const cache = {};
const screen = (name) => (cache[name] ??= fetch(new URL(`screens/${name}`, import.meta.url)).then((r) => (r.ok ? r.text() : '')));

export function film(slot, o = {}) {
  if (q.has('record')) return new Promise(() => {});      // recording: the page stays unwired, only the recorded tour exists
  const d = { ...slot.dataset, ...o };
  return d.src ? video(slot, d) : tour(slot, d);
}

async function tour(host, d) {
  const S = tours[d.film];
  if (!S) throw new Error(`[film] no tour called "${d.film}" in tours.js`);
  const root = document.createElement('div');
  root.className = 'film-tour';
  root.innerHTML = `<div data-tour-stage>${S.chrome === 'phone' ? '<div class="film-glass" data-tour-frame></div>' : ''}<div class="tour-rig">
    <div data-tour-window data-chrome="${S.chrome || 'browser'}" data-size="${(S.size || [1200, 750]).join('x')}" data-url="${S.url || 'app.yourproduct.com/projects'}">${await screen(S.screen || 'app.html')}</div></div></div>`;
  host.append(root);
  const fit = d.fit ? d.fit.split(/[\s,]+/).map(Number) : S.fit;     // data-fit="w h [y]": the window's share of a wide slot
  const t = new Tour(root, { ...S, fit }, { driver: d.driver || 'manual', loop: d.loop != null && d.loop !== false, captions: d.captions });
  const api = t.api;
  const p = {
    tour: t, el: root, duration: api.duration, chapters: api.chapters,
    captions: t.caps.map((c) => ({ t: c.start, end: c.end, text: c.text })),
    get t() { return api.t; }, get playing() { return t.playing; },
    play: () => (t.begun || t.driver !== 'play' ? api.play() : t.begin()),
    pause: () => api.pause(), seek: (s) => api.seek(s), rest: () => api.seek(t.stillAt),
    fit: () => t.relayout(),          // after the slot was hidden (a closed dialog) and is shown again
    on: (e, fn) => root.addEventListener('tour:' + e, fn),
  };
  await api.ready;
  return t.rec ? p : wire(host, p, d, t.still);
}

async function video(slot, d) {
  const v = document.createElement('video');
  Object.assign(v, { src: d.src, muted: d.sound == null, loop: d.loop != null, playsInline: true, preload: d.preload || 'metadata', controls: d.driver === 'play' });
  if (d.poster) v.poster = d.poster;
  if (d.vtt) v.innerHTML = `<track kind="captions" src="${d.vtt}" srclang="en" label="English" default>`;
  slot.append(v);
  ['play', 'pause'].forEach((e) => v.addEventListener(e, () => v.classList.toggle('is-playing', !v.paused)));
  const tr = v.querySelector('track');
  const when = (el, ok, ...evs) => new Promise((r) => (ok() ? r() : evs.forEach((e) => el.addEventListener(e, r, { once: true }))));
  await Promise.all([when(v, () => v.readyState >= 1, 'loadedmetadata', 'error'), tr && when(tr, () => tr.readyState >= 2, 'load', 'error')]);
  const p = {
    video: v, el: v, duration: v.duration || 0, chapters: [],
    captions: [...(tr?.track.cues || [])].map((c) => ({ t: c.startTime, end: c.endTime, text: c.text })),
    get t() { return v.currentTime; }, get playing() { return !v.paused; },
    play: () => v.play().catch(() => {}), pause: () => v.pause(), seek: (s) => { v.currentTime = s; }, rest: () => {}, fit: () => {},
    on: (e, fn) => v.addEventListener(e === 'end' ? 'ended' : e, fn),
  };
  return wire(slot, p, d, still);
}

/* autoplay while on screen; a visitor's pause holds until they press play again */
function wire(slot, p, d, frozen) {
  let held = false;
  p.toggle = () => { held = p.playing; held ? p.pause() : p.play(); };
  if (d.autoplay != null && !frozen) {
    new IntersectionObserver(([e]) => { if (e.isIntersecting && !held) p.play(); else if (!e.isIntersecting && p.playing) p.pause(); }, { threshold: .5 }).observe(slot);
  } else if ((d.driver || 'manual') === 'manual' && !frozen) p.rest();
  return p;
}

/* ?record: the chosen tour alone, straight in <body>, so the engine's record stage can take the window */
if (q.has('record')) {
  const want = q.get('record'), slots = [...document.querySelectorAll('[data-film]:not([data-src])')];
  const slot = slots.find((s) => (want ? s.dataset.film === want : s.hasAttribute('data-record'))) || slots[0];
  if (slot) tour(document.body, { film: want && tours[want] ? want : slot.dataset.film, captions: slot.dataset.captions });
}
