/* _chat/chat.js: the chat kit shared by demo/chat and demo/mcp. README.md beside this file has the markup.

   The thread in the HTML is the script. Each .ck-row inside a [data-ck-thread] is one message, in order, and
   conversation() turns them into tour steps: a person's message is typed (into the composer, or in place) and
   sent; an agent's turn shows the typing dots, then its rows arrive one after another, text streaming word by
   word, a tool call running and finishing, a card opening. Rows take height as they arrive (data-tour-grow,
   measured by the engine), so the thread rises smoothly at every frame and any moment renders on its own.

     import { prepare, conversation } from '../_chat/chat.js';
     prepare(win);                                     // once, before new Tour(): names rows, splits words, adds the dots
     steps.push(...conversation(win, thread, { chapters, before, after }));

   Pacing lives on the rows: data-think (s of dots before an agent turn), data-read (s held after a row), data-run
   (s a tool call takes), data-cps (a person's typing speed). Interactions inside cards (taps on a slot, a Send
   button) are ordinary tour steps the script adds after a row: after: { 'row-name': [tap('@slot'), …] }. */
import { show, hide, set, tween, type, click, stream, pause, mark, chapter } from '../tour/tour.js';

const WORD = /(\s+)/;
const rnd = (n) => { const x = Math.sin(n * 77.3 + 5.1) * 43758.5453; return x - Math.floor(x); };

/* ── DOM preparation: run once, before new Tour() ─────────────────────────────────────────────────── */
export function prepare(win) {
  const avatar = win.querySelector('[data-ck-avatar]');
  [...win.querySelectorAll('[data-ck-thread]')].forEach((thread, ti) => {
    const rows = [...thread.children].filter((r) => r.classList.contains('ck-row'));
    let prev = null;
    rows.forEach((row, i) => {
      if (!row.dataset.tour) row.dataset.tour = `ck-${ti}-${i}`;
      const from = row.dataset.from || 'agent', lead = from === 'agent' && (!prev || (prev.dataset.from || 'agent') !== 'agent');
      row.dataset.from = from;
      row.classList.toggle('is-lead', lead || from === 'person');
      if (row.classList.contains('is-static')) { prev = row; return; }   // there from the start (a date line, an intro)
      row.setAttribute('data-tour-grow', '');
      row.querySelectorAll('.ck-tool-body, [data-ck-swap] > :first-child').forEach((b) => b.setAttribute('data-tour-grow', ''));
      row.querySelectorAll('[data-stream]').forEach(splitWords);
      if (row.dataset.via === 'inline') {             // typed in place: keep the words for type(), start it empty
        const said = row.querySelector('[data-said]') || row.querySelector('.ck-bubble, p');
        if (said && !said.dataset.say) { said.dataset.say = said.textContent.trim(); said.textContent = ''; said.setAttribute('data-said', ''); }
      }
      if (lead && avatar && thread.dataset.avatars !== 'off' && !row.querySelector('.ck-av')) row.querySelector('.ck-pad')?.prepend(avatarOf(avatar));
      if (lead && thread.dataset.typing !== 'off' && row.dataset.think !== '0') {   // the typing dots, a row of their own
        const dots = document.createElement('div');
        dots.className = 'ck-row is-typing is-lead'; dots.dataset.from = 'agent'; dots.dataset.tour = row.dataset.tour + '-dots';
        dots.setAttribute('data-tour-grow', ''); dots.setAttribute('aria-hidden', 'true');
        dots.innerHTML = '<div class="ck-pad"><span class="ck-dots"><i></i><i></i><i></i></span></div>';
        if (avatar && thread.dataset.avatars !== 'off') dots.firstChild.prepend(avatarOf(avatar));
        row.before(dots);
      }
      prev = row;
    });
  });
}
function avatarOf(src) { const a = document.createElement('span'); a.className = 'ck-av'; a.setAttribute('aria-hidden', 'true'); a.innerHTML = src.innerHTML; return a; }

/* wrap each word of a [data-stream] element in <span class="w">, keeping its markup (bold, links, code, lists) */
function splitWords(el) {
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), nodes = [];
  while (walk.nextNode()) nodes.push(walk.currentNode);
  for (const n of nodes) {
    if (!n.textContent.trim() || n.parentElement.closest('.w')) continue;
    const f = document.createDocumentFragment();
    for (const part of n.textContent.split(WORD)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) f.append(part); else { const s = document.createElement('span'); s.className = 'w'; s.textContent = part; f.append(s); }
    }
    n.replaceWith(f);
  }
}

/* ── the thread as steps ──────────────────────────────────────────────────────────────────────────── */
/* o.chapters  { rowName: ['01 / 04', 'Find a <em>time</em>', 'One line.'] }  a chapter starts at that row
   o.before / o.after  { rowName: [steps] }   extra steps around a row (taps inside a card, a zoom)
   o.composer  { field: '@ck-input', input: '@ck-input', send: '@ck-send' }  where a person types (chat)
   o.prefix    a string put before every mark: marks are `${prefix}${rowName}`                              */
export function conversation(win, thread, o = {}) {
  thread = typeof thread === 'string' ? win.querySelector(thread) : thread || win.querySelector('[data-ck-thread]');
  const C = { field: '@ck-input', input: '@ck-input', send: '@ck-send', ...(o.composer || {}) };
  const steps = [], at = (r) => `@${r.dataset.tour}`;
  let focused = false;
  [...thread.children].filter((r) => r.classList.contains('ck-row') && !r.classList.contains('is-static')).forEach((row, i) => {
    const name = row.dataset.tour, from = row.dataset.from, kind = row.dataset.kind || (row.classList.contains('is-typing') ? 'dots' : 'text');
    if (kind === 'dots') return;                               // played by the row it belongs to
    const ch = o.chapters?.[name]; if (ch) steps.push(chapter(...ch));
    steps.push(mark((o.prefix || '') + name));
    steps.push(...(o.before?.[name] || []));
    const read = row.dataset.read != null ? +row.dataset.read : null;

    if (from === 'person') {
      const said = row.querySelector('[data-said]');
      if (row.dataset.via === 'inline' && said) {             // typed in place, then it stands (mcp)
        steps.push(show(at(row), { dur: .3, ease: 'out' }));
        steps.push(type(`${at(row)} [data-said]`, said.dataset.say, { rhythm: 'human', cps: +row.dataset.cps || 15, lead: .35, caret: .45 }));
        steps.push(pause(read ?? .45));
      } else if (row.dataset.via && row.dataset.via.startsWith('@')) {   // a tap on a chip or a button sends it
        steps.push(click(row.dataset.via, { dur: .85 }), set(row.dataset.via, { class: '+is-picked' }));
        steps.push(show(at(row), { dur: .42, ease: 'out', wait: .12, block: true }), pause(read ?? .55));
      } else {                                                 // typed into the composer and sent
        const text = (row.querySelector('.ck-bubble') || row).textContent.trim().replace(/\s+/g, ' ');
        if (!focused) { steps.push(click(C.field, { dur: .9, aim: [.82, .5] })); focused = true; }
        steps.push(type(C.input, text, { rhythm: 'human', cps: +row.dataset.cps || 16, lead: .2, caret: .5 }));
        steps.push(pause(.2), click(C.send, { dur: .55 }));
        steps.push(set(C.input, { text: '', class: '-is-caret' }), show(at(row), { dur: .42, ease: 'out', block: true }), pause(read ?? .55));
      }
    } else {
      const dots = row.previousElementSibling?.classList.contains('is-typing') ? row.previousElementSibling : null;
      if (dots) {
        const think = row.dataset.think != null ? +row.dataset.think : .75 + .35 * rnd(i);
        steps.push(show(at(dots), { dur: .3, ease: 'out' }), tween(`${at(dots)} .ck-dots`, '--tk', 0, think * 1.6, { dur: think + .3, ease: 'linear' }));
        steps.push(pause(think + .3), hide(at(dots), { dur: .26 }));
      }
      steps.push(show(at(row), { dur: .4, ease: 'out' }));
      if (kind === 'tool') steps.push(...toolSteps(row, at(row)));
      const words = row.querySelectorAll('[data-stream] .w');
      if (words.length) steps.push(stream(`${at(row)} [data-stream] .w`, { every: .034, jitter: .55, dur: .22, wait: kind === 'tool' ? 0 : .12 }));
      const parts = row.querySelectorAll('[data-ck-in]');      // a card's parts settle in one after another
      if (parts.length) steps.push(show(`${at(row)} [data-ck-in]`, { dur: .45, stagger: .07, ease: 'out', wait: words.length ? 0 : .15, block: true }));
      const grows = row.querySelectorAll('[data-ck-grow]');    // bars, meters: --g 0 → 1
      if (grows.length) steps.push(tween(`${at(row)} [data-ck-grow]`, '--g', 0, 1, { dur: .7, stagger: .05, ease: 'out', block: true }));
      steps.push(pause(read ?? readTime(row, kind)));
    }
    steps.push(...(o.after?.[name] || []));
  });
  return steps;
}

/* a tool call: running (a spinner, the arguments; in an open block the result streams in), then done, then it folds */
function toolSteps(row, me) {
  const tool = row.querySelector('.ck-tool'), run = +(row.dataset.run || .9), open = row.dataset.open != null;
  const s = [set(`${me} .ck-tool`, { class: '+is-running' }), tween(`${me} .ck-tool`, '--spin', 0, run * 1.3, { dur: run + .2, ease: 'linear' })];
  const meta = tool?.querySelector('[data-done]');
  if (open) {
    s.push(show(`${me} .ck-tool-body`, { dur: .45, ease: 'out', wait: .15 }));
    const lines = tool.querySelectorAll('.ck-out > *');
    if (lines.length) s.push(stream(`${me} .ck-out > *`, { every: .07, jitter: .4, dur: .16, wait: Math.max(.25, run - .1) }));
    else s.push(pause(run));
  } else s.push(pause(run));
  s.push(set(`${me} .ck-tool`, { class: '-is-running +is-done' }));
  if (meta) s.push(set(`${me} [data-done]`, { text: meta.dataset.done }));
  if (open && row.dataset.fold !== 'off') s.push(pause(+(row.dataset.hold || 1.3)), hide(`${me} .ck-tool-body`, { dur: .5 }));
  else s.push(pause(.35));
  return s;
}
function readTime(row, kind) {
  const n = (row.textContent.match(/\S+/g) || []).length;
  return kind === 'tool' ? .2 : Math.min(2.2, Math.max(.7, .45 + n * .045));
}

/* ── the page helpers ─────────────────────────────────────────────────────────────────────────────── */
/* copy buttons: <button data-ck-copy="#id-or-text">Copy</button> copies the element's text (or the attribute's text) */
export function copyButtons(root) {
  const on = async (e) => {
    const b = e.target.closest('[data-ck-copy]'); if (!b || !root.contains(b)) return;
    e.preventDefault();
    const v = b.dataset.ckCopy, el = v.startsWith('#') || v.startsWith('.') ? root.querySelector(v) : null;
    const text = el ? el.innerText.trim() : v;
    try { await navigator.clipboard.writeText(text); } catch { const ta = Object.assign(document.createElement('textarea'), { value: text }); document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
    const was = b.dataset.label || b.textContent; b.dataset.label = was; b.textContent = b.dataset.copied || 'Copied'; b.classList.add('is-copied');
    clearTimeout(b._t); b._t = setTimeout(() => { b.textContent = was; b.classList.remove('is-copied'); }, 1800);
    const say = root.querySelector('[data-ck-said]'); if (say) say.textContent = `${b.dataset.what || 'Text'} copied`;
  };
  root.addEventListener('click', on);
  return () => root.removeEventListener('click', on);
}

/* tabs: [data-ck-tabs] holding [role=tab] buttons (aria-controls) and their [role=tabpanel]s */
export function tabs(root) {
  const off = [];
  for (const list of root.querySelectorAll('[data-ck-tabs]')) {
    const tabsEls = [...list.querySelectorAll('[role=tab]')];
    const pick = (t, focus) => {
      for (const x of tabsEls) { const on = x === t; x.setAttribute('aria-selected', on); x.tabIndex = on ? 0 : -1; const p = root.querySelector('#' + x.getAttribute('aria-controls')); if (p) p.hidden = !on; }
      if (focus) t.focus();
    };
    const click = (e) => { const t = e.target.closest('[role=tab]'); if (t && list.contains(t)) pick(t); };
    const key = (e) => {
      const i = tabsEls.indexOf(document.activeElement); if (i < 0) return;
      const j = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabsEls.length - 1 }[e.key]; if (j == null) return;
      e.preventDefault(); pick(tabsEls[(j + tabsEls.length) % tabsEls.length], true);
    };
    list.addEventListener('click', click); list.addEventListener('keydown', key);
    off.push(() => { list.removeEventListener('click', click); list.removeEventListener('keydown', key); });
  }
  return () => off.forEach((f) => f());
}

/* tool blocks fold and unfold when a visitor clicks their head (once the film has left them alone) */
export function foldable(root) {
  const on = (e) => {
    const h = e.target.closest('.ck-tool-head'); if (!h || !root.contains(h)) return;
    const t = h.closest('.ck-tool'), body = t.querySelector('.ck-tool-body'); if (!body) return;
    const was = t.classList.contains('is-user-open') || (!t.classList.contains('is-user-shut') && +getComputedStyle(body).getPropertyValue('--in') > .5);
    t.classList.toggle('is-user-open', !was); t.classList.toggle('is-user-shut', was); h.setAttribute('aria-expanded', String(!was));
  };
  root.addEventListener('click', on);
  return () => root.removeEventListener('click', on);
}
