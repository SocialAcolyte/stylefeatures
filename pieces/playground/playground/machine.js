/* machine.js: what your product can do, as named actions. The film (script.js) and the visitor both use these,
   so write one action for every click that changes something, and give the visitor the same freedom you'd give
   them in the real product (a Cancel, a Close, a Done).

     on      the element the action is on ('@name' = [data-tour="name"]); the visitor's hotspot sits on it
     from    the state(s) it can happen in; to: the state it leads to (leave it out to stay put)
     steps   side steps that change the screen (show, hide, set, tween, type), or (s) => steps worked out from
             the state; they start when the click lands, exactly as they would after click() in a plain script
     hint    what the hotspot says ('Start a project'); minor: true for a quiet one (Cancel, Close, Done)
     once    it can only happen once; if: (s) => bool, a condition; then: (s) => { s.vars.x = … } after it
   views: per state, the element the camera frames during the visitor's turn: [selector, fill] */
import { show, hide, set, tween, type } from '../tour/tour.js';

const TONES = [1, 2, 3, 4, 5];
const tone = (n) => ({
  on: `@tone-${n}`, from: 'inspect', if: (s) => s.vars.tone !== n, minor: n !== 3, hint: n === 3 ? 'Change its tone' : 'Try another tone',
  steps: [...TONES.map((m) => set(`@tone-${m}`, { class: m === n ? '+is-on' : '-is-on' })),
    set('@card-1', { 'data-tone': String(n) }), set('@insp-cover', { 'data-tone': String(n) }), set('@recent-new i', { 'data-tone': String(n) })],
  then: (s) => { s.vars.tone = n; },
});

export default {
  start: 'empty',
  vars: { visible: false, tone: 1 },
  views: { naming: ['@modal', .5], sharing: ['@sharebox', .42] },
  actions: {
    open: { on: '@new', from: 'empty', to: 'naming', hint: 'Start a project',
      steps: [show('@scrim'), show('@modal', { dur: .4 })] },
    name: { on: '@name', from: 'naming', once: true, hint: 'Name it',
      steps: [type('@name-text', 'Launch plan', { rhythm: 'human' })] },
    template: { on: '@tpl-2', from: 'naming', once: true, hint: 'Pick a template',
      steps: [set('@tpl-2', { class: '+is-on' }), set('@tpl-1', { class: '-is-on' })] },
    cancel: { on: '@cancel', from: 'naming', to: 'empty', minor: true, hint: 'Cancel',
      steps: [hide('@modal'), hide('@scrim', { dur: .35 })] },
    create: { on: '@create', from: 'naming', to: 'list', if: (s) => s.done.has('name'), hint: 'Create it',
      steps: [hide('@modal'), hide('@scrim', { dur: .35 }), hide('@empty', { dur: .25 }),
        show('.app-card', { dur: .55, stagger: .07, wait: .15 }), tween('@count', 'text', 0, 6, { dur: .7, wait: .15, fmt: Math.round }),
        show('@recent-new', { wait: .4, dur: .4 }), set('@toast-text', { text: 'Project created' }), show('@toast', { wait: .45 }), hide('@toast', { wait: 2.6 })] },
    select: { on: '@card-1', from: 'list', to: 'inspect', hint: 'Open its settings',
      steps: [set('@card-1', { class: '+is-sel' }), tween('@app', '--insp', null, 1, { dur: .6 })] },
    visible: { on: '@toggle-1', from: 'inspect', hint: 'Flip a switch',
      steps: (s) => [tween('@toggle-1', '--on', null, s.vars.visible ? 0 : 1, { dur: .22 })], then: (s) => { s.vars.visible = !s.vars.visible; } },
    ...Object.fromEntries(TONES.map((n) => [`tone-${n}`, tone(n)])),
    close: { on: '@insp-close', from: 'inspect', to: 'list', minor: true, hint: 'Close settings',
      steps: [tween('@app', '--insp', null, 0, { dur: .5 }), set('@card-1', { class: '-is-sel' })] },
    share: { on: '@share', from: 'list', to: 'sharing', hint: 'Share it',
      steps: [show('@sharebox', { dur: .3 })] },
    copy: { on: '@copy', from: 'sharing', once: true, hint: 'Copy the link',
      steps: [set('@copy', { text: 'Copied' }), set('@toast-text', { text: 'Link copied' }), show('@toast'), hide('@toast', { wait: 2 })] },
    done: { on: '@share-done', from: 'sharing', to: 'list', minor: true, hint: 'Done',
      steps: [hide('@sharebox')] },
  },
};
