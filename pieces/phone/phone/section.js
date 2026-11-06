// demo/phone: hands the script to the engine. The driver comes from data-driver on the section (scroll: pinned and
// scroll-played with auto-play; play: a clock with a scrubber), or ?driver= in the address. ?t=12.5 freezes a moment;
// ?record&ratio=9:16|16:9|1:1 is a clean stage for screen recording (../tour/README.md).
import { Tour } from '../tour/tour.js';
import script from './script.js';

export default function init(root) {
  const tour = new Tour(root, script);
  root.tour = tour;                       // the instance, for the console
  return () => tour.destroy();
}
