/* The agentic film's script: one real task, start to finish. Same engine and vocabulary as every tour
   (../tour/README.md); what this format leans on:
     { by: 'agent', tag: 'read_docs' }   a pointer step for the agent's own cursor; the tag shows its current tool
     click('@approve', { from: [.98, 1.02] })   the person's cursor (labelled "You") comes in from off the edge
     stream('@r-search')        a run-sheet row arrives; set(…, { class: '+is-run' }) / '+is-done' as the call finishes
     mark('lapse') … mark('lapse-end')   a time-lapse: section.js runs the clock at `lapses[i]` seconds over that span
     mark('ready' | 'run' | 'ask' | 'approved' | 'done')   where the live page waits for the visitor (Run, Approve)
     chapter('05', 'Test')      a phase: named on the timeline and announced to screen readers (no card is shown)
   It is a function of the section, so the task sentence comes from the markup. Check any moment with ?t=31. */
import { click, move, type, show, hide, set, tween, stream, zoom, unzoom, chapter, pause, mark } from '../tour/tour.js';

const WINS = ['editor', 'term', 'browser', 'docs'];

export default function build(root) {
  const task = root.querySelector('[data-tour="task"]')?.textContent.trim() || '';

  // ── helpers: the run sheet ──
  const now = (text) => set('@now', { text });
  const status = (state, text) => [set('@status', { 'data-state': state }), set('@status-text', { text })];
  const begin = (id, line) => [mark('call'), stream(`@r-${id}`, { dur: .3 }), set(`@r-${id}`, { class: '+is-run' }), ...(line ? [now(line)] : [])];
  const done = (id, open = 0) => [set(`@r-${id}`, { class: '-is-run +is-done' }),
    ...(open ? [show(`@r-${id} .ag-res`, { dur: .35 }), hide(`@r-${id} .ag-res`, { dur: .45, wait: open })] : [])];
  const plan = (n, state) => set(`@p${n}`, { class: state === 'doing' ? '+is-doing' : '-is-doing +is-done' });
  // ── helpers: the workspace ──
  const focus = (w) => [...WINS.map((n) => tween(`@w-${n}`, '--on', null, n === w ? 1 : 0, { dur: .4 })),
    ...WINS.map((n) => set(`@tab-${n}`, { class: n === w ? '+is-on' : '-is-on' }))];
  const file = (f) => [...['page', 'csv', 'test'].map((n) => set(`@t-${n}`, { class: n === f ? '+is-on' : '-is-on' })),
    ...['empty', 'page', 'csv', 'test'].map((n) => tween(`@pane-${n}`, '--in', null, n === f ? 1 : 0, { dur: .25 }))];
  const ag = (o = {}) => ({ by: 'agent', dur: .75, ...o });
  const lapse = (rows, o = {}) => [mark('lapse'), show('@lapse', { dur: .3 }), set('@desk', { class: '+is-lapse' }), stream(rows, o), mark('lapse-end'),
    hide('@lapse', { dur: .3 }), set('@desk', { class: '-is-lapse' })];

  return {
    size: [1600, 900],
    pointers: {
      main: { label: 'You', idle: 1.4 },                                  // the person: types the task, approves
      agent: { label: root.dataset.agent || 'Agent', look: 'agent', bow: .2, enter: [.33, .2] },
    },
    enter: [.66, .97],
    intro: 0,
    settle: .4,
    outro: 7,
    lapses: [153, 80],          // run seconds that pass during each mark('lapse') … mark('lapse-end') span
    steps: [
      // 01 · the task: a person types one sentence and presses Run
      chapter('01', 'Task'),
      pause(.5),
      click('@box', { dur: 1, aim: [.18, .3] }),
      type('@ask', task, { rhythm: 'human', cps: 19, lead: .15, caret: 30 }),
      mark('ready'),
      pause(.3),
      click('@run', { dur: .75 }),
      mark('run'),
      set('@ask', { class: '-is-caret' }),
      tween('@desk', '--send', 0, 1, { dur: .85, ease: 'out' }),
      tween('@desk', '--desk', 0, 1, { dur: .8, wait: .2 }),
      tween('.ag-win', '--up', 0, 1, { dur: .55, stagger: .09, wait: .4 }),
      ...status('plan', 'Planning'), now('Making a plan'),
      pause(1),

      // 02 · the plan streams in
      chapter('02', 'Plan'),
      ...focus('editor'),           // square and tall: a window in the live view while it plans
      stream('.ag-plan li', { every: .3, dur: .3 }),
      pause(.4),
      ...status('run', 'Running'), plan(1, 'doing'),
      tween('@plan', '--fold', 0, 1, { dur: .7, wait: 1.4 }),      // square and tall fold the plan away once the work starts

      // 03 · read: search, open the file, read the docs
      chapter('03', 'Read'),
      ...begin('search', 'Looking for the toolbar'),
      ...focus('editor'),
      click('@ed-search', ag({ tag: 'search_code', dur: .85 })),
      type('@ed-q', 'export', { cps: 24, rhythm: 'stream', caret: .25 }),
      stream('@ed-hits .ed-hit', { every: .12, dur: .2 }),
      ...done('search', 1.5),
      pause(.25),
      ...begin('read'),
      click('@hit-1', ag({ tag: 'read_file', dur: .6 })),
      stream('@t-page', { dur: .2 }), ...file('page'),
      move('@pg-toolbar', ag({ dur: .6, aim: [.3, .5] })),
      ...done('read'),
      plan(1, 'done'), plan(2, 'doing'),
      pause(.3),
      ...begin('docs', 'Reading the docs on CSV'),
      ...focus('docs'),
      zoom('@w-docs', 'fit', { fill: [.5, .98], dur: 1.1 }),
      move('@hl', ag({ tag: 'read_docs', aim: [0, .25], dur: .9 })),
      tween('@hl', '--hl', 0, 1, { dur: 1.1, wait: .1, ease: 'linear' }),
      move('@hl', ag({ aim: [.62, .8], dur: 1.1, wait: .1 })),
      ...done('docs', 1.8),
      pause(.5),

      // 04 · write: the export, its test, the button
      chapter('04', 'Write'),
      ...begin('csv', 'Writing the export'),
      ...focus('editor'),
      zoom('@w-editor', 'fit', { fill: [.8, .98], dur: 1.1 }),
      stream('@f-csv', { dur: .2 }), stream('@t-csv', { dur: .2 }), ...file('csv'),
      move('@pane-csv', ag({ tag: 'write_file', aim: [.62, .22] })),
      stream('@csv-add', { every: .15, jitter: .6, dur: .12 }),
      ...done('csv'),
      ...begin('test'),
      stream('@f-test', { dur: .2 }), stream('@t-test', { dur: .2 }), ...file('test'),
      stream('@test-add', { every: .13, jitter: .6, dur: .12 }),
      ...done('test'),
      plan(2, 'done'), plan(3, 'doing'),
      ...begin('page', 'Adding the button'),
      ...file('page'),
      move('@pg-toolbar', ag({ tag: 'edit_file', aim: [.5, .5] })),
      stream('@pg-add', { every: .2, dur: .15 }),
      ...done('page'),
      plan(3, 'done'), plan(4, 'doing'),
      pause(.3),

      // 05 · test: a failure, the fix, a pass. The long runs pass as time-lapses
      chapter('05', 'Test'),
      ...begin('run1', 'Running the tests'),
      ...focus('term'),
      zoom('@w-term', 'fit', { fill: [.54, .98], dur: 1.1 }),
      click('@tm', ag({ tag: 'run_command', aim: [.5, .12] })),
      type('@cmd-1', 'npm test reports', { cps: 30, rhythm: 'stream', caret: .2 }),
      ...lapse('@o1 .tl', { every: .38, dur: .1 }),
      stream('@o1b .tl', { every: .16, dur: .1 }),
      now('One test failed. Reading why'),
      ...done('run1', 2.6),
      move('@fail', ag({ aim: [.45, .5] })),
      pause(.9),
      ...begin('fix', 'Fixing the header row'),
      ...focus('editor'),
      ...file('csv'),
      move('.ln.bug', ag({ tag: 'edit_file', aim: [.62, .5] })),
      set('.ln.bug', { class: '+del' }),
      stream('@fix-add', { wait: .45, dur: .25 }),
      pause(1.3),
      set('.ln.bug', { class: '+gone' }),
      ...done('fix'),
      ...begin('run2', 'Running the tests again'),
      ...focus('term'),
      click('@tm', ag({ tag: 'run_command', aim: [.5, .9] })),
      type('@cmd-2', 'npm test reports', { cps: 30, rhythm: 'stream', caret: .2 }),
      ...lapse('@o2 .tl', { every: .34, dur: .1 }),
      now('All 24 tests pass'),
      ...done('run2'),
      pause(.5),

      // 06 · verify: open it, press the new button
      chapter('06', 'Verify'),
      ...begin('open', 'Trying it in a browser'),
      ...focus('browser'),
      zoom('@w-browser', 'fit', { fill: [.76, .98], dur: 1.1 }),
      click('@w-browser > .tour-chrome', ag({ tag: 'browser_open', aim: [.55, .5] })),
      tween('@br-load', '--p', 0, 1, { dur: .9 }), hide('@br-idle', { wait: .45, dur: .2 }), show('@br-page', { wait: .7, dur: .35 }),
      pause(1.2),
      ...done('open'),
      ...begin('click'),
      click('@br-export', ag({ tag: 'browser_click', dur: .7 })),
      show('@br-dl', { wait: .25, dur: .45, ease: 'ios' }),
      pause(.5),
      ...done('click'),
      plan(4, 'done'), plan(5, 'doing'),
      pause(.7),

      // 07 · approve: it stops and asks; the person's cursor comes in and approves
      chapter('07', 'Approve'),
      ...begin('ask'),
      ...status('wait', 'Waiting for you'), now('Asking before it pushes'),
      zoom('@ask-card', 'fit', { fill: [.5, .62], dur: 1.2 }),
      move('@ask-card', ag({ tag: 'waiting for you', aim: [.86, .16], dur: 1 })),
      pause(.35),
      mark('ask'),                // the live page waits here for the visitor's Approve
      pause(.5),
      click('@approve', { from: [.99, 1.03], dur: 1.15 }),
      mark('approved'),
      set('@r-ask', { class: '-is-run +is-done +is-ok' }), set('@ask-ms', { text: '4 s' }),
      ...status('run', 'Running'),
      pause(.5),
      unzoom({ dur: 1 }),

      // 08 · ship: push, open the pull request, done
      chapter('08', 'Ship'),
      ...begin('pr', 'Opening the pull request'),
      ...focus('term'),
      click('@tm', ag({ tag: 'create_pull_request', aim: [.5, .92] })),
      type('@cmd-3', 'git push -u origin export-csv', { cps: 34, rhythm: 'stream', caret: .2 }),
      stream('@o3 .tl', { every: .25, dur: .1 }),
      pause(.4),
      ...done('pr'),
      move('@pr-link', ag({ tag: 'done', dur: .9 })),
      plan(5, 'done'),
      stream('@r-done', { dur: .3 }),
      ...status('done', 'Done'), now('Done. Here is what it did'),
      mark('done'),
      pause(1.2),
    ],
  };
}
