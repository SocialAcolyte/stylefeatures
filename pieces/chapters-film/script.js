// chapters: one long tour on the engine's play bar. Click a chapter or a transcript line to jump; the chapter
// list and the transcript follow the film. Both come from the tour itself (its chapter() and caption()
// steps in ./film/tours.js), so the words and the timing are written once.
import { film, fmt, still } from './film/film.js';

const items = [...document.querySelectorAll('#chapters li')];
const box = document.getElementById('transcript');
const p = await film(document.querySelector('.screen'));
const starts = items.map((li, i) => +(li.dataset.at ?? (i ? p.chapters[i]?.t : 0) ?? 0));
const chapterAt = (t) => starts.reduce((k, s, i) => (t >= s ? i : k), 0);
items.forEach((li, i) => { li.querySelector('time').textContent = fmt(starts[i]); });
document.querySelectorAll('[data-dur]').forEach((e) => { e.textContent = fmt(p.duration); });

const jump = (t) => { p.seek(t); p.play(); };
items.forEach((li, i) => li.querySelector('button').addEventListener('click', () => jump(starts[i])));

// transcript: one paragraph per chapter, one button per caption
let para = null, ch = -1;
const lines = p.captions.map((c) => {
  const k = chapterAt(c.t);
  if (k !== ch) {
    ch = k;
    para = box.appendChild(document.createElement('p'));
    para.appendChild(document.createElement('small')).textContent = items[k].querySelector('b').textContent;
  }
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = c.text;
  b.addEventListener('click', () => jump(c.t + 0.01));
  para.append(b, ' ');
  return { c, b };
});
if (!lines.length) box.closest('.transcript').hidden = true;

// follow the film: the current chapter darkens and fills; the line on screen is dark, and the box (never the page) scrolls to it
let last = -1, on = null;
const follow = () => {
  const t = p.t;
  if (t !== last) {
    last = t;
    items.forEach((li, i) => {
      const end = starts[i + 1] ?? p.duration;
      li.classList.toggle('is-on', t >= starts[i] && t < end);
      li.firstElementChild.style.setProperty('--p', Math.min(1, Math.max(0, (t - starts[i]) / (end - starts[i]))).toFixed(3));
    });
    const now = lines.find(({ c }) => t >= c.t && t < c.end);
    if (now !== on) {
      on?.b.classList.remove('is-on');
      on = now;
      if (on) { on.b.classList.add('is-on'); box.scrollTo({ top: on.b.offsetTop - 40, behavior: still ? 'auto' : 'smooth' }); }
    }
  }
  requestAnimationFrame(follow);
};
follow();
