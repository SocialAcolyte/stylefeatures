/* moves.js: a phone's screen transitions as tour.js steps. Each returns an array, so spread it into the script:
     tap('@row-3'), ...push('@home', '@detail'),
   They only move CSS variables (--in, --under, --sheet); section.css decides what that looks like, per device
   (data-device="ios" slides and scales like UIKit, "android" fades and shifts like Material). The timings and the
   'ios' ease (a critically damped spring) are UIKit's defaults. */
import { tween, set } from '../tour/tour.js';

const T = { dur: .5, ease: 'ios' };

/** push: `to` slides in from the right over `from`, which slides a third of the way out and dims. */
export const push = (from, to, o = {}) => [tween(to, '--in', 0, 1, { ...T, ...o }), tween(from, '--under', 0, 1, { ...T, ...o })];

/** pop: back again (a Back tap, or an edge swipe). */
export const pop = (from, to, o = {}) => [tween(from, '--in', 1, 0, { ...T, dur: .42, ...o }), tween(to, '--under', 1, 0, { ...T, dur: .42, ...o })];

/** sheet up: the sheet rises, the screens behind it scale back (one variable, --sheet, on the app root). */
export const sheet = (app = '@app', o = {}) => [tween(app, '--sheet', 0, 1, { ...T, dur: .55, ...o })];
export const unsheet = (app = '@app', o = {}) => [tween(app, '--sheet', 1, 0, { ...T, dur: .42, ...o })];

/** tab switch: a quick cross-fade, and the tab bar follows. */
export const tab = (from, to, tabFrom, tabTo, o = {}) => [
  tween(from, '--in', 1, 0, { dur: .14, ease: 'out', ...o }), tween(to, '--in', 0, 1, { dur: .2, ease: 'out', wait: .05, ...o }),
  set(tabFrom, { class: '-is-on' }), set(tabTo, { class: '+is-on' }),
];

/** the keyboard rises (true) or falls (false). */
export const keyboard = (up = true, o = {}) => [tween('@kb', '--in', up ? 0 : 1, up ? 1 : 0, { ...T, dur: up ? .45 : .35, ...o })];

/** a system-style banner: in, held, out. */
export const toast = (text, o = {}) => [
  ...(text ? [set('@toast-text', { text })] : []),
  tween('@toast', '--in', 0, 1, { dur: .45, ease: 'spring', ...o }),
  tween('@toast', '--in', 1, 0, { dur: .3, ease: 'out', wait: (o.wait || 0) + (o.hold ?? 1.8) }),
];
