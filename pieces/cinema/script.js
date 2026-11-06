// cinema: the backdrop loops a short tour while it is on screen; "Watch the full film" plays the whole tour,
// with chapters and captions, in a dialog. The tours themselves are in ./film/tours.js.
import { film, fmt } from './film/film.js';

const theatre = document.getElementById('theatre');
const [loop, full] = await Promise.all([film(document.querySelector('.film')), film(theatre.querySelector('[data-film]'))]);

document.getElementById('pause').addEventListener('click', loop.toggle);
document.querySelector('#watch .dur').textContent = fmt(full.duration);

let resume = false;
document.getElementById('watch').addEventListener('click', () => {
  resume = loop.playing;
  loop.pause();
  theatre.showModal();
  full.fit();
  full.seek(0);
  full.play();
});
theatre.addEventListener('close', () => { full.pause(); if (resume) loop.play(); });
theatre.addEventListener('click', (e) => { if (e.target === theatre) theatre.close(); });
