/*  autoscroll-drift: the page scrolls itself, with a mimosa leaf as its switch.
 *  The leaf is Taste's mimosa toggle (autodrift.js + mimosa-toggle.js, from monetshot-site/c/autodrift); credits in mimosa-credits.json.
 *  config: { speed: px/second (default 30% of the viewport height), delay: ms before it starts (4000),
 *            resume: ms of quiet after a touch before it carries on (2000), lock: true to take the wheel/touch away until the leaf is switched off, end: px to stop at }
 *  Returns destroy().  Reduced motion: nothing is added.  Steps are behavior:'instant'. */
import { autoDrift } from './autodrift.js';

export default function init(config = {}) {
  const c = config || {};
  const h = autoDrift({
    speed: typeof c.speed === 'function' ? c.speed : c.speed ? () => c.speed : undefined,
    end: typeof c.end === 'function' ? c.end : c.end ? () => c.end : undefined,
    delay: c.delay, resume: c.resume, lock: !!c.lock,
  });
  return () => { if (h && h.destroy) h.destroy(); };
}
