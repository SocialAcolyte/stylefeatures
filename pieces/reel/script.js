// reel: each row's clip is a short tour of one feature (./film/tours.js). It plays only while it is on
// screen (data-autoplay), loops (data-loop), and has its own pause button. With reduced motion nothing
// starts by itself; the button still plays a clip on request.
import { film } from './film/film.js';

for (const clip of document.querySelectorAll('.clip')) {
  film(clip).then((p) => clip.querySelector('.ctl').addEventListener('click', p.toggle));
}
