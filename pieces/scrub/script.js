// scrub: the scroll position drives the tour's clock (seek), and the chapter timeline fills as you go.
// A tour renders any moment on its own, instantly, forwards or backwards: no video, no keyframes, no stutter.
import { film, still } from './film/film.js';

const section = document.getElementById('scrub');
const items = [...document.querySelectorAll('#chapters li')];
section.style.setProperty('--chapters', items.length);
const p = await film(document.querySelector('.frame'));
// where each chapter starts: the tour's chapter() steps (a recording needs data-at="seconds" on each <li>)
const starts = items.map((li, i) => +(li.dataset.at ?? (i ? p.chapters[i]?.t : 0) ?? 0));

const progress = () => {
  const r = section.getBoundingClientRect();
  return Math.min(1, Math.max(0, -r.top / (r.height - innerHeight)));
};
const update = () => {
  const dur = p.duration, t = progress() * dur * 0.999;
  p.seek(t);
  items.forEach((li, i) => {
    const end = starts[i + 1] ?? dur;
    li.style.setProperty('--p', Math.min(1, Math.max(0, (t - starts[i]) / (end - starts[i]))).toFixed(4));
    li.classList.toggle('is-on', t >= starts[i] && t < end);
  });
};
let ticking = false;
addEventListener('scroll', () => {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => { ticking = false; update(); });
}, { passive: true });
addEventListener('resize', update);
update();

// a chapter label scrolls the page to where that chapter starts
items.forEach((li, i) => li.querySelector('button').addEventListener('click', () => {
  const span = section.offsetHeight - innerHeight;
  const top = section.getBoundingClientRect().top + scrollY + span * (starts[i] / p.duration) + 2;
  scrollTo({ top, behavior: still ? 'auto' : 'smooth' });
}));
