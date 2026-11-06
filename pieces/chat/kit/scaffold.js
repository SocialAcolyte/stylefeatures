/* StyleFeatures scaffolds: shared runtime. Safe to load twice.
   - [data-reveal] fades in on scroll
   - .ph-video gets a play/pause button, a running timeline and a timecode, so a video slot behaves like one
     (data-dur="12" seconds, data-autoplay for background loops)
   - press N (or ?clean in the URL) to hide the notes */
if (!window.__sfScaffold) {
  window.__sfScaffold = true;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }),
    { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
  const PLAY = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 3.8v12.4L16 10z" fill="currentColor"/></svg>';
  const PAUSE = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5.5 4h3v12h-3zM11.5 4h3v12h-3z" fill="currentColor"/></svg>';
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  function video(el) {
    if (el.__sf) return; el.__sf = true;
    const dur = +el.dataset.dur || 12, loop = el.hasAttribute('data-autoplay') || el.hasAttribute('data-loop');
    const btn = document.createElement('button');
    btn.className = 'ph-play'; btn.type = 'button'; btn.setAttribute('aria-label', 'Play video'); btn.innerHTML = PLAY;
    const bar = document.createElement('div'); bar.className = 'ph-bar'; bar.setAttribute('aria-hidden', 'true');
    bar.innerHTML = `<span class="t">0:00</span><span class="ph-track"><i></i></span><span>${fmt(dur)}</span>`;
    if (el.hasAttribute('data-nobar')) bar.hidden = true;
    if (el.hasAttribute('data-nobutton')) btn.hidden = true;
    el.append(btn, bar);
    const t = bar.querySelector('.t');
    let pos = 0, playing = false, last = 0, raf = 0, visible = true;
    const draw = () => { el.style.setProperty('--p', pos / dur); t.textContent = fmt(pos); el.style.setProperty('--sf-t', pos); };
    const tick = (now) => {
      if (!playing) return;
      pos += Math.min(.1, (now - last) / 1000); last = now;
      if (pos >= dur) { if (loop) pos = 0; else { pos = dur; set(false); } }
      draw(); el.dispatchEvent(new CustomEvent('sf:time', { detail: { t: pos, dur } }));
      if (visible) raf = requestAnimationFrame(tick);
    };
    function set(on) {
      playing = on; el.classList.toggle('is-playing', on);
      btn.innerHTML = on ? PAUSE : PLAY; btn.setAttribute('aria-label', on ? 'Pause video' : 'Play video');
      cancelAnimationFrame(raf);
      if (on) { if (pos >= dur) pos = 0; last = performance.now(); raf = requestAnimationFrame(tick); }
    }
    btn.addEventListener('click', (e) => { e.stopPropagation(); set(!playing); });
    el.sfVideo = { play: () => set(true), pause: () => set(false), seek: (s) => { pos = Math.max(0, Math.min(dur, s)); draw(); }, get t() { return pos; }, dur };
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && playing) { last = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); } }).observe(el);
    if (el.hasAttribute('data-autoplay') && !reduce) set(true);
    draw();
  }

  const scan = (root = document) => {
    root.querySelectorAll('[data-reveal]:not(.is-in)').forEach((el) => (reduce ? el.classList.add('is-in') : io.observe(el)));
    root.querySelectorAll('.ph-video').forEach(video);
  };
  window.sfScan = scan;
  window.sfVideo = video;
  const boot = () => scan();
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot); else boot();
  if (location.search.includes('clean')) document.documentElement.classList.add('sf-clean');
  if (location.search.includes('thumb')) document.documentElement.classList.add('sf-thumb');
  if (innerWidth < 700) addEventListener('DOMContentLoaded', () => document.querySelector('.sf-spec')?.classList.add('is-min'));
  addEventListener('keydown', (e) => { if (e.key === 'n' && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName)) document.documentElement.classList.toggle('sf-clean'); });
  const down = () => document.documentElement.classList.toggle('is-down', scrollY > 24);
  addEventListener('scroll', down, { passive: true }); down();
}
