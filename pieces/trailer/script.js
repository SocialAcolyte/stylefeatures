// trailer: the hero loops a short tour; each tile is a mini tour that plays on hover and opens bigger, with its
// captions and the play bar, in a lightbox. The tours are in ./film/tours.js.
import { film, fmt, still } from './film/film.js';

const canHover = matchMedia('(hover: hover)').matches;
const tiles = [...document.querySelectorAll('.tile')];
const [hero, ...clips] = await Promise.all([film(document.getElementById('trailer')), ...tiles.map((t) => film(t.querySelector('.frame')))]);

// the hero: pause, and sound only when it is a recording (a tour is silent)
document.getElementById('pause').addEventListener('click', hero.toggle);
const sound = document.getElementById('sound');
if (hero.video) {
  sound.hidden = false;
  sound.addEventListener('click', () => {
    hero.video.muted = !hero.video.muted;
    sound.setAttribute('aria-pressed', String(!hero.video.muted));
    if (!hero.video.muted) { hero.seek(0); hero.play(); }
  });
}

// the tiles: their length, play on hover (only with a mouse, and not with reduced motion), open on click
tiles.forEach((tile, i) => {
  const p = clips[i];
  tile.querySelector('time').textContent = fmt(p.duration);
  if (canHover && !still) {
    tile.addEventListener('pointerenter', () => { p.seek(0); p.play(); });
    tile.addEventListener('pointerleave', () => { p.pause(); p.rest(); });
  }
  tile.addEventListener('click', () => open(i));
});

// the lightbox: the clicked clip's tour, mounted bigger with the play bar and captions
const box = document.getElementById('box');
const screen = document.getElementById('boxScreen');
const title = document.getElementById('boxTitle');
let at = 0, resume = false, shown = null, seq = 0;
const show = async (i) => {
  const n = ++seq;
  at = (i + tiles.length) % tiles.length;
  shown?.tour?.destroy();
  screen.replaceChildren();
  title.textContent = tiles[at].querySelector('.t b').textContent;
  const p = await film(screen, { ...tiles[at].querySelector('.frame').dataset, driver: 'play', captions: 'always', sound: '', fit: '.9 .8 .45' });
  if (n !== seq) { p.tour?.destroy(); p.el.remove(); return; }     // another clip was asked for meanwhile
  (shown = p).play();
};
function open(i) {
  if (!box.open) { resume = hero.playing; hero.pause(); box.showModal(); }
  show(i);
}
box.addEventListener('close', () => { shown?.pause(); tiles[at].focus(); if (resume) hero.play(); });
box.addEventListener('click', (e) => { if (e.target === box) box.close(); });
document.getElementById('close').addEventListener('click', () => box.close());
document.getElementById('prev').addEventListener('click', () => show(at - 1));
document.getElementById('next').addEventListener('click', () => show(at + 1));
box.addEventListener('keydown', (e) => {
  if (e.target.closest('.tour-scrub, video')) return;      // the play bar's own arrow keys seek
  if (e.key === 'ArrowRight') show(at + 1);
  if (e.key === 'ArrowLeft') show(at - 1);
});
