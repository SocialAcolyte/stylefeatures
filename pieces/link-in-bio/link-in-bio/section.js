// demo/link-in-bio: picks the page's layout for the stage (a spread on a wide screen, two columns on a square one, one
// column on a phone and in 9:16), hands that layout's script to the engine, and swaps it if the stage changes shape.
// The film plays by itself once it's on screen (a link-in-bio visitor shouldn't have to scroll through a film to
// reach the links), and pauses when it leaves. ?t=12.5 freezes a moment; ?record&ratio=9:16|16:9|1:1 is a clean
// stage for screen recording (../tour/README.md).
import { Tour } from '../tour/tour.js';
import { film } from './script.js';

const q = new URLSearchParams(location.search);
const shape = (r) => (r < .8 ? 'tall' : r < 1.15 ? 'square' : 'wide');     // the engine's own thresholds

export default function init(root) {
  const stage = root.querySelector('[data-tour-stage]');
  const ratio = () => {
    if (q.has('record')) { const [a, b] = (q.get('ratio') || '16:9').split(':').map(Number); return a > 0 && b > 0 ? a / b : 16 / 9; }
    return stage.clientWidth / Math.max(1, stage.clientHeight);
  };
  let kind = shape(ratio());
  const tour = new Tour(root, film(kind));
  root.tour = tour;                       // the instance, for the console
  // reduced motion: one calm frame, the one the script marks as 'still' (a link unfolded)
  if (tour.still && !q.has('t') && tour.api.marks.still != null) tour.render(tour.api.marks.still, true);
  const off = [() => tour.destroy()];

  // the stage changed shape (a window resized past a threshold, a phone turned): rebuild the script for that layout
  const ro = new ResizeObserver(() => {
    const k = shape(ratio());
    if (k === kind || tour.still || tour.rec) return;
    kind = k; const t = tour.t, playing = tour.playing;
    tour.load(film(kind));
    ticks();
    tour.render(Math.min(t, tour.duration), true);
    if (playing) tour.play();
  });
  ro.observe(stage); off.push(() => ro.disconnect());

  // the play bar's chapter ticks and length follow the script that's loaded
  function ticks() {
    const ctl = root.querySelector('.tour-ctl'); if (!ctl) return;
    const rg = ctl.querySelector('input'); rg.max = tour.duration;
    ctl.querySelectorAll('.tour-scrub i').forEach((i) => i.remove());
    for (const c of tour.chapters) rg.insertAdjacentHTML('afterend', `<i style="left:${(c.start / tour.duration) * 100}%"></i>`);
  }

  // real clips: a <video muted playsinline> inside a .lib-clip follows that clip's --p (0 → 1 over the script's tween),
  // so the newest piece really plays in the film and still lands on the same frame at any ?t= or scrub.
  // data-span on the video is how many seconds of it the film plays (default 5, the tween's length).
  const vids = [...root.querySelectorAll('.lib-clip video')];
  if (vids.length) {
    const prev = tour.onFrame;
    tour.onFrame = (t) => {
      prev && prev(t);
      for (const v of vids) {
        const clip = v.closest('.lib-clip'), p = +clip.style.getPropertyValue('--p') || 0, at = p * (+v.dataset.span || 5);
        const live = tour.playing && p > 0 && p < 1;
        if (live && v.paused) v.play().catch(() => {});
        if (!live && !v.paused) v.pause();
        if (Math.abs(v.currentTime - at) > (live ? .3 : .04) && v.readyState > 0) v.currentTime = at;
      }
    };
    vids.forEach((v) => v.addEventListener('loadedmetadata', () => tour.onFrame(tour.t)));
  }

  // play once it's on screen, after a beat on the name; pause when it leaves; never take over someone's own pause
  if (!tour.still && !tour.rec) {
    let mine = false, wait = 0;
    const own = (e) => { if (e.target.closest?.('.tour-ctl, [data-tour-gate]')) mine = true; };
    root.addEventListener('pointerdown', own); root.addEventListener('keydown', () => { mine = true; });
    const io = new IntersectionObserver(([e]) => {
      clearTimeout(wait);
      if (e.isIntersecting && !mine) wait = setTimeout(() => { if (!tour.begun) tour.begin(); else if (!tour.playing && tour.t < tour.duration - .05) tour.play(); }, 1400);
      if (!e.isIntersecting && tour.playing) tour.pause();
    }, { threshold: .5 });
    io.observe(root); off.push(() => { io.disconnect(); clearTimeout(wait); });
  }
  return () => off.forEach((f) => f());
}
