/* haeckel-radiolaria — scroll is time: radiolaria plate: line first, then
   radiolaria ink in radially with subtle depth parallax. Final frame is the plate itself. */
export function haeckelRadiolaria(runway, opts = {}) {
  const frame = runway.querySelector('.hr-frame');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let raf = 0, target = 0, current = reduced ? 1 : 0, visible = true, destroyed = false;
  const clamp01 = v => Math.min(1, Math.max(0, v));
  function measure() {
    const r = runway.getBoundingClientRect();
    const total = runway.offsetHeight - innerHeight;
    target = total > 0 ? clamp01(-r.top / total) : 1;
  }
  function apply() {
    frame.style.setProperty('--p', current.toFixed(4));
    frame.style.setProperty('--wet', (4 * current * (1 - current)).toFixed(4));
  }
  let vel = 0;
  function tick() {
    raf = 0;
    const w = target > current ? 10 : 15;
    const dt = 1 / 60;
    vel += (-w * w * (current - target) - 2 * w * vel) * dt;
    current = clamp01(current + vel * dt);
    if (Math.abs(target - current) < 0.0004 && Math.abs(vel) < 0.0004) { current = target; vel = 0; apply(); return; }
    apply();
    if (visible && !document.hidden && !destroyed) raf = requestAnimationFrame(tick);
  }
  function kick() { measure(); if (!raf && visible && !destroyed) raf = requestAnimationFrame(tick); }
  const onScroll = () => kick(), onResize = () => kick();
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onResize);
  const io = new IntersectionObserver(e => { visible = e[0].isIntersecting; if (visible) kick(); else if (raf) { cancelAnimationFrame(raf); raf = 0; } });
  io.observe(runway);
  if (reduced) { current = target = 1; apply(); }
  else kick();
  return function destroy() {
    destroyed = true;
    if (raf) cancelAnimationFrame(raf);
    removeEventListener('scroll', onScroll); removeEventListener('resize', onResize);
    io.disconnect();
    frame.style.removeProperty('--p'); frame.style.removeProperty('--wet');
  };
}
let api = null;
const el = document.querySelector('[data-haeckel-radiolaria]');
if (el) api = haeckelRadiolaria(el);
export function destroy() { if (api) { api(); api = null; } }
if (typeof window !== 'undefined') window.__haeckelRadiolaria = { destroy };
