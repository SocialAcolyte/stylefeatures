// demo/terminal: loads any harvested fragments (data-tour-include), then hands the script to the shared engine.
// Driver from data-driver (scroll | play) or ?driver=; ?t=12.5 freezes a moment; ?record&ratio=16:9|1:1|9:16 is the
// clean stage for Monet Shot (../tour/README.md).
import { Tour, include } from '../tour/tour.js';
import script from './script.js';

export default function init(root) {
  let tour = null, dead = false;
  include(root).then(() => { if (!dead) tour = new Tour(root, script); });
  return () => { dead = true; tour?.destroy(); };
}
