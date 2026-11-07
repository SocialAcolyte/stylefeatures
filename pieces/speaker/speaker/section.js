// demo/speaker: a speaker's event page.
//   the broadcast  tour.js on the play driver. It starts once it's on screen, plays the whole film once (the talk,
//                  then an organiser using the press kit), then goes back to the talk and keeps it running, like a
//                  stream left on. The clock in the lower third runs from data-start. A <video> in .sp-cam plays in
//                  step with the film (data-from: the second of your recording it starts at).
//   the dock       scroll past the stage and the talk docks in the corner, still playing, until you come back or
//                  close it (wide screens only; never with reduced motion or in ?record)
//   the press kit  bio tabs with a copy button, headshot downloads, and the request: action="#" just shows the
//                  note; any other action is posted with fetch, with a mailto fallback if that fails
// ?record&ratio=16:9|1:1|9:16 films it once, ?t=12 freezes a moment (../tour/README.md).
import { Tour } from '../tour/tour.js';
import script from './script.js';

const q = new URLSearchParams(location.search);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export default function init(root) {
  const off = [];
  const film = root.querySelector('.sp-film');
  if (film) off.push(broadcast(film));
  root.querySelectorAll('.sp-pk-bio').forEach((b) => off.push(bios(b)));
  root.querySelectorAll('.sp-ask').forEach((a) => off.push(request(a)));
  return () => off.forEach((f) => f && f());
}

/* ── the broadcast ── */
function broadcast(film) {
  const tour = new Tour(film, script);
  film.tour = tour;                                    // the instance, for the console
  const marks = tour.api.marks, T0 = marks.talk ?? 2, T1 = marks['talk-end'] ?? 15;
  const off = [() => tour.destroy()];

  // the lower third's clock: data-start (m:ss) plus the film's time
  const clock = film.querySelector('[data-tour="clock"]');
  const [cm, cs] = (clock?.dataset.start || '18:04').split(':').map(Number), c0 = cm * 60 + (cs || 0);
  // a real recording in the camera slot follows the film's clock
  const vid = film.querySelector('.sp-cam video');
  if (vid) { vid.muted = true; vid.playsInline = true; }

  let mode = 'full';                                   // 'full': the whole film; 'talk': the talk alone, on a loop
  const prev = tour.onFrame;
  const frame = (t) => {
    prev && prev(t);
    if (clock) clock.textContent = mmss(c0 + t);
    if (vid && vid.readyState > 0) {
      const at = (+vid.dataset.from || 0) + t;
      if (tour.playing && vid.paused) vid.play().catch(() => {});
      if (!tour.playing && !vid.paused) vid.pause();
      if (Math.abs(vid.currentTime - at) > (tour.playing ? .35 : .05)) vid.currentTime = at;
    }
    if (mode === 'talk' && tour.playing && (t >= T1 || t < T0 - .5)) queueMicrotask(() => { tour.pause(); tour.render(T0, true); tour.play(); });
  };
  tour.onFrame = frame; frame(Math.max(0, tour.t));

  if (tour.still && !q.has('t') && marks.still != null) tour.render(marks.still, true);   // reduced motion: the kit, the talk docked in it
  if (tour.still || tour.rec) return () => off.forEach((f) => f());

  // starts once it's on screen; never plays over someone's own pause; back to the talk after the film ends
  let mine = false, wait = 0, again = 0;
  const own = (e) => { if (e.target.closest?.('.tour-ctl')) { mine = true; mode = 'full'; } };
  film.addEventListener('pointerdown', own); off.push(() => film.removeEventListener('pointerdown', own));
  const ended = () => { clearTimeout(again); again = setTimeout(() => { if (mine) return; mode = 'talk'; tour.render(T0, true); tour.play(); }, 3800); };
  film.addEventListener('tour:end', ended); off.push(() => { film.removeEventListener('tour:end', ended); clearTimeout(again); });
  const io = new IntersectionObserver(([e]) => {
    clearTimeout(wait);
    if (e.intersectionRatio >= .45 && !mine && !tour.begun) wait = setTimeout(() => tour.begin(), 700);
  }, { threshold: [0, .45] });
  io.observe(film); off.push(() => { io.disconnect(); clearTimeout(wait); });

  // the dock: past the stage, the talk keeps playing in the corner
  let docked = false, closed = false;
  const canDock = () => innerWidth >= 760 && !reduce;
  const dock = () => {
    docked = true; film.style.setProperty('--sp-held', film.offsetHeight + 'px'); film.classList.add('is-docked');
    tour.relayout();
    if (mine && !tour.playing) return;
    mode = 'talk';
    if (tour.t >= T1 || tour.t < T0) tour.render(T0, true);
    if (!tour.playing) tour.play();
  };
  const undock = () => { docked = false; film.classList.remove('is-docked'); film.style.removeProperty('--sp-held'); tour.relayout(); };
  const dio = new IntersectionObserver(([e]) => {
    if (!docked && !closed && tour.begun && e.intersectionRatio < .18 && e.boundingClientRect.top < 0 && canDock()) dock();
    else if (docked && (e.intersectionRatio > .3 || !canDock())) undock();
  }, { threshold: [0, .18, .3, .6] });
  dio.observe(film); off.push(() => dio.disconnect());
  // over the request, the docked talk gets smaller so it never sits on the form
  const ask = film.closest('[data-tpl]')?.querySelector('.sp-ask');
  if (ask) {
    const tio = new IntersectionObserver(([e]) => film.classList.toggle('is-tucked', e.isIntersecting), { rootMargin: '0px 0px -30% 0px' });
    tio.observe(ask); off.push(() => tio.disconnect());
  }
  const back = film.querySelector('.sp-dock-back'), x = film.querySelector('.sp-dock-x');
  const goBack = () => film.closest('section')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  const close = () => { closed = true; undock(); tour.pause(); };
  back?.addEventListener('click', goBack); x?.addEventListener('click', close);
  off.push(() => { back?.removeEventListener('click', goBack); x?.removeEventListener('click', close); });
  return () => off.forEach((f) => f());
}

/* ── the bio in three lengths ── */
function bios(box) {
  const tabs = [...box.querySelectorAll('[role=tab]')], panels = [...box.querySelectorAll('[role=tabpanel]')];
  const btn = box.querySelector('.sp-pk-copy'), label = btn?.querySelector('span'), count = box.querySelector('.sp-pk-count');
  const words = (p) => p.innerText.trim().split(/\s+/).filter(Boolean).length;
  const current = () => panels.find((p) => !p.hidden) || panels[0];
  const tell = () => {
    const p = current(); if (!count || !p) return;
    count.textContent = p.querySelector('.ph-text') ? `${p.dataset.len} words, when it's written` : `${words(p)} words`;
  };
  const pick = (tab, focus) => {
    tabs.forEach((t) => { const on = t === tab; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; });
    panels.forEach((p) => { const on = p.dataset.len === tab.dataset.len; p.hidden = !on; p.classList.toggle('is-in', on); });
    if (focus) tab.focus();
    if (label) { label.textContent = 'Copy bio'; btn.classList.remove('is-done'); }
    tell();
  };
  const onClick = (e) => { const t = e.target.closest('[role=tab]'); if (t) pick(t); };
  const onKey = (e) => {
    const i = tabs.indexOf(document.activeElement); if (i < 0) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); pick(tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length], true); }
  };
  let reset = 0;
  const copy = async () => {
    const text = current().innerText.trim();
    try { await navigator.clipboard.writeText(text); label.textContent = 'Copied'; }
    catch { const r = document.createRange(); r.selectNodeContents(current()); getSelection().removeAllRanges(); getSelection().addRange(r); label.textContent = 'Press ⌘C to copy'; }
    btn.classList.add('is-done'); clearTimeout(reset);
    reset = setTimeout(() => { label.textContent = 'Copy bio'; btn.classList.remove('is-done'); }, 2600);
  };
  box.addEventListener('click', onClick); box.addEventListener('keydown', onKey); btn?.addEventListener('click', copy);
  tabs.forEach((t, i) => { t.tabIndex = i ? -1 : 0; });
  tell();
  return () => { clearTimeout(reset); box.removeEventListener('click', onClick); box.removeEventListener('keydown', onKey); btn?.removeEventListener('click', copy); };
}

/* ── the request ── */
function request(box) {
  const form = box.querySelector('form'), sent = box.querySelector('.sp-sent');
  if (!form) return null;
  const land = () => { form.hidden = true; if (sent) { sent.hidden = false; sent.focus({ preventScroll: true }); } };
  const mailto = () => {
    const to = box.querySelector('.sp-ask-mail a')?.getAttribute('href')?.replace(/^mailto:/, '') || '';
    const f = new FormData(form), lines = [...f.entries()].map(([k, v]) => `${k[0].toUpperCase() + k.slice(1)}: ${v}`);
    location.href = `mailto:${to}?subject=${encodeURIComponent('Speaking request: ' + (f.get('event') || ''))}&body=${encodeURIComponent(lines.join('\n'))}`;
  };
  const submit = async (e) => {
    e.preventDefault();
    const action = form.getAttribute('action') || '#';
    if (action === '#') return land();
    const b = form.querySelector('[type=submit]'); if (b) { b.disabled = true; b.textContent = 'Sending…'; }
    try {
      const r = await fetch(action, { method: form.method || 'POST', body: new FormData(form), headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error(r.status); land();
    } catch { if (b) { b.disabled = false; b.textContent = 'Send request'; } mailto(); }
  };
  form.addEventListener('submit', submit);
  return () => form.removeEventListener('submit', submit);
}
