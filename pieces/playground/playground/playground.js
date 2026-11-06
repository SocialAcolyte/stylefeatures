/* playground.js: the part the film and the visitor share. Don't edit; describe your product in machine.js.

   machine.js names every action the product can take (open the dialog, create, share…): which element it's on,
   which states it's allowed in, and the side steps (show, hide, set, tween, type) that change the screen.
   The film says act('open') where a plain script would say click('@new'), show('@modal'); the visitor clicks
   the same element and gets the same steps. So whatever the tour shows, the visitor can do, and nothing else.

   The visitor's turn is a script too: each click appends that action's steps at the current moment and the
   engine plays on from there (tour.load), so the visitor gets the same eases, timings and camera as the film. */
import { zoom, unzoom } from '../tour/tour.js';

/* in a film script: do this action. Options go to its pointer step ({ dur, aim, wait }); { pointer: 'dblclick' } or
   { pointer: false } (the change happens with no cursor, e.g. a timer) choose how it's done. */
export const act = (name, o = {}) => ({ do: 'act', name, o });

export class Machine {
  constructor(def) { this.def = def; this.reset(); }
  reset() { this.s = { at: this.def.start, done: new Set(), vars: structuredClone(this.def.vars || {}) }; return this; }
  action(name) { return this.def.actions[name]; }
  can(name) {
    const a = this.action(name), s = this.s; if (!a) return false;
    const from = [].concat(a.from ?? []);
    return (!from.length || from.includes(s.at)) && !(a.once && s.done.has(name)) && (!a.if || !!a.if(s));
  }
  available() { return Object.keys(this.def.actions).filter((n) => this.can(n)); }
  view(at = this.s.at) { const v = this.def.views?.[at]; return v ? [].concat(v) : null; }
  /* apply an action: returns its steps (worked out from the state before it) and where it went */
  apply(name) {
    const a = this.action(name), from = this.s.at;
    const steps = typeof a.steps === 'function' ? a.steps(this.s) : a.steps || [];
    a.then?.(this.s); this.s.done.add(name); if (a.to) this.s.at = a.to;
    return { steps, from, to: this.s.at };
  }
}

/* a film script with act() steps → a plain engine script; warns when the film does something the machine wouldn't */
export function expand(script, def) {
  const m = new Machine(def), out = [], path = [];
  for (const st of script.steps || []) {
    if (st.do !== 'act') { out.push(st); continue; }
    const a = m.action(st.name);
    if (!a) { console.warn(`[playground] machine.js has no action "${st.name}"`); continue; }
    if (!m.can(st.name)) console.warn(`[playground] the film does "${st.name}" while the product is "${m.s.at}", which machine.js doesn't allow`);
    const { pointer = 'click', ...o } = st.o || {};
    if (pointer) out.push({ ...o, do: pointer, to: a.on });
    out.push(...m.apply(st.name).steps);
    path.push(st.name);
  }
  return { ...script, steps: out, path };
}

/* the visitor's session as a script: each action at the moment it was clicked, the camera following the views */
export function live(def, history, base = {}) {
  const m = new Machine(def), steps = [{ do: 'pause', dur: .05, at: 0 }];
  for (const h of history) {
    const r = m.apply(h.name);
    steps.push({ do: 'pause', dur: 0, at: h.at });                 // the clock jumps to the click
    const v0 = m.view(r.from), v1 = m.view(r.to);
    if (String(v0) !== String(v1)) steps.push(v1 ? zoom(v1[0], 'fit', { fill: v1[1] ?? .6, dur: 1.1 }) : unzoom({ dur: 1.1 }));
    steps.push(...r.steps);
  }
  return { script: { ...base, intro: 0, settle: 0, outro: 0, steps }, machine: m };
}

export const sel = (s) => s.replace(/@([\w-]+)/g, '[data-tour="$1"]');
