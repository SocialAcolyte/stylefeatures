// stories: each story is a short phone tour (./film/tours.js). Tap the right side for next, the left for
// back, swipe either way, hold to pause; a story moves on when its tour ends. Keys: arrows and space.
// With reduced motion nothing plays until the visitor presses play.
import { film, still } from './film/film.js';

const viewer = document.getElementById('stories');
const stories = [...viewer.querySelectorAll('.story')];
const bars = [...viewer.querySelectorAll('.bars i')];
const pauseBtn = document.getElementById('pause');
const players = await Promise.all(stories.map((s) => { const slot = s.querySelector('[data-film]'); return slot ? film(slot) : null; }));
let i = 0;
let paused = still;

const sync = () => {
  viewer.classList.toggle('is-paused', paused);
  viewer.classList.toggle('at-end', !players[i]);
  pauseBtn.firstElementChild.textContent = paused ? 'Play' : 'Pause';
};

const go = (n) => {
  n = Math.max(0, Math.min(stories.length - 1, n));
  players[i]?.pause();
  stories[i].classList.remove('is-on');
  i = n;
  stories[i].classList.add('is-on');
  bars.forEach((b, k) => b.style.setProperty('--p', k < i ? 1 : 0));
  const p = players[i];
  if (p) { p.seek(0); if (!paused) p.play(); }
  sync();
};

const setPaused = (v) => {
  paused = v;
  const p = players[i];
  if (p) { if (v) p.pause(); else p.play(); }
  sync();
};

players.forEach((p) => p?.on('end', () => { if (players[i] === p) go(i + 1); }));

// the progress bar of the current story follows its tour
const tick = () => {
  const p = players[i];
  if (p && p.duration && bars[i]) bars[i].style.setProperty('--p', (p.t / p.duration).toFixed(4));
  requestAnimationFrame(tick);
};
requestAnimationFrame(tick);

// pointer: a short press is a tap, a long press holds, a sideways drag is a swipe
let down = null, holdTimer = 0, holding = false;
viewer.addEventListener('pointerdown', (e) => {
  if (e.target.closest('button, a')) return;
  down = { x: e.clientX, y: e.clientY };
  holdTimer = setTimeout(() => {
    if (!players[i]) return;
    holding = true;
    viewer.classList.add('is-holding');
    players[i].pause();
  }, 220);
});
viewer.addEventListener('pointermove', (e) => { if (down && Math.abs(e.clientX - down.x) > 10) clearTimeout(holdTimer); });
const release = (e, cancelled) => {
  if (!down) return;
  clearTimeout(holdTimer);
  const dx = e.clientX - down.x;
  down = null;
  if (holding) {
    holding = false;
    viewer.classList.remove('is-holding');
    if (!paused) players[i].play();
  } else if (!cancelled && Math.abs(dx) < 40) {
    const r = viewer.getBoundingClientRect();
    return go(i + (e.clientX - r.left < r.width / 3 ? -1 : 1));
  }
  if (!cancelled && Math.abs(dx) >= 40) go(i + (dx < 0 ? 1 : -1));
};
viewer.addEventListener('pointerup', (e) => release(e, false));
viewer.addEventListener('pointercancel', (e) => release(e, true));
viewer.addEventListener('contextmenu', (e) => e.preventDefault());

document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') go(i + 1);
  else if (e.key === 'ArrowLeft') go(i - 1);
  else if (e.key === ' ' && !e.target.closest('a, button')) { e.preventDefault(); setPaused(!paused); }
});

pauseBtn.addEventListener('click', () => setPaused(!paused));
document.getElementById('big').addEventListener('click', () => setPaused(false));
document.getElementById('again').addEventListener('click', () => go(0));

go(0);
