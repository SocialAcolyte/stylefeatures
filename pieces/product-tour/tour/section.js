// demo/tour: hands the script to the engine. The driver comes from data-driver on the section
// (scroll: pinned and scroll-played with auto-play; play: a clock with a scrubber), or ?driver= in the address.
// ?t=12.5 freezes a moment; ?record&ratio=16:9|1:1|9:16 is a clean stage for screen recording (README.md).
import { Tour } from './tour.js';
import script from './script.js';

export default function init(root) {
  const tour = new Tour(root, script);
  return () => tour.destroy();
}
