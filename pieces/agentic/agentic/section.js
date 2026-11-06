// demo/agentic: the page is a task, then the run, then its receipt. One Tour on the engine's manual driver, played by
// this file's own clock so it can change speed and wait for the visitor:
//   task     the sentence types itself in, then waits for the visitor's Run (mark 'ready'); Enter works too
//   run      plays at 1× / 2× / 4×; the run clock in the sheet follows the trace, racing through each time-lapse
//   approve  at mark 'ask' it waits for the visitor's Approve; after 7 s the person's cursor approves for them
//   receipt  the closing frame ([data-tour-end]), with real links, the run time and "Watch it again"
// ?record&ratio=16:9|1:1|9:16 plays it straight through for Monet Shot (no waits; the drawn cursors do it all),
// ?t=31 freezes a moment, reduced motion shows the task, then the finished run.
import { Tour, include } from '../tour/tour.js';
import build from './script.js';

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const span = (s) => (s < 60 ? `${Math.round(s)} s` : `${Math.floor(s / 60)} m ${String(Math.round(s % 60)).padStart(2, '0')} s`);
const PLAY = '<svg viewBox="0 0 20 20"><path d="M6 3.8v12.4L16 10z"/></svg>', PAUSE = '<svg viewBox="0 0 20 20"><path d="M5.5 4h3v12h-3zM11.5 4h3v12h-3z"/></svg>';
const AGAIN = '<svg viewBox="0 0 20 20"><path d="M4.5 10a5.5 5.5 0 1 0 1.7-4M4.5 3.5v3h3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export default function init(root) {
  const q = new URLSearchParams(location.search), rec = q.has('record');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (k) => root.querySelector(`[data-ag="${k}"]`);
  const stage = root.querySelector('[data-tour-stage]');
  let tour = null, alive = true, raf = 0, rate = 1, playing = false, lastNow = 0, hold = null, waitT = 0, ran = false, approved = false;
  const off = [];
  const on = (el, ev, fn, o) => { if (!el) return; el.addEventListener(ev, fn, o); off.push(() => el.removeEventListener(ev, fn, o)); };

  (async () => {
    await include(root);
    if (!alive) return;
    const S = build(root);
    tour = new Tour(root, S, { driver: 'manual' });
    const W = (s) => tour.win.querySelector(s);
    const at = (n) => tour.marks.filter((m) => m.name === n).map((m) => m.t);
    const [tReady] = at('ready'), [tRun] = at('run'), [tAsk] = at('ask'), [tOk] = at('approved'), [tDone] = at('done');
    const ends = at('lapse-end'), calls = at('call');
    const lapses = at('lapse').map((a, i) => ({ a, b: ends[i], run: (S.lapses || [])[i] ?? 60 }));

    // the run's own clock: film seconds after Run, except each time-lapse span counts as its real duration
    const runAt = (t) => {
      if (!(t > tRun)) return 0;
      const e = Math.min(t, tDone ?? t); let s = e - tRun;
      for (const L of lapses) if (e > L.a) { const o = Math.min(e, L.b) - L.a; s += o * (L.run / Math.max(.01, L.b - L.a) - 1); }
      return s;
    };
    const total = runAt(tDone ?? tour.duration);
    const rows = [...tour.win.querySelectorAll('.ag-row')];
    // numbers the page derives from the script, so they never disagree with the film
    tour.win.querySelectorAll('.ag-lapse-row').forEach((r, i) => { const L = lapses[i]; if (L) r.querySelector('b').textContent = `${span(L.run)} in ${span(L.b - L.a)}`; });
    const steps = $('rc-steps'), time = $('rc-time');
    if (steps) steps.textContent = rows.length;
    if (time) time.textContent = span(total);
    const doneLine = W('[data-tour="done-line"]'); if (doneLine) doneLine.textContent = `${rows.length} steps · ${span(total)}`;
    const clock = W('[data-tour="clock"]'), count = W('[data-tour="count"]'), lx = W('[data-tour="lapse-x"]'), nowEl = W('[data-tour="now"]');
    let said = '';

    const hit = { run: $('run'), approve: $('approve'), deny: $('deny') }, target = { run: W('[data-tour="run"]'), approve: W('[data-tour="approve"]'), deny: W('[data-tour="deny"]') };
    const place = () => {
      const sr = stage.getBoundingClientRect();
      for (const k of Object.keys(hit)) {
        const show = (k === 'run' && hold === 'gate') || (k !== 'run' && hold === 'ask');
        hit[k]?.classList.toggle('is-on', show);
        if (!show || !target[k] || !hit[k]) continue;
        const r = target[k].getBoundingClientRect();
        hit[k].style.cssText = `left:${(r.left - sr.left - 4).toFixed(1)}px;top:${(r.top - sr.top - 4).toFixed(1)}px;width:${(r.width + 8).toFixed(1)}px;height:${(r.height + 8).toFixed(1)}px`;
      }
    };

    tour.onFrame = (t) => {
      const r = runAt(t);
      if (clock) clock.textContent = fmt(r);
      const L = lapses.find((x) => t >= x.a - .3 && t <= x.b + .3); if (L && lx) lx.textContent = `×${Math.round(L.run / (L.b - L.a))}`;
      if (count) count.textContent = rows.filter((e) => e.classList.contains('is-in')).length;
      root.classList.toggle('is-ran', t >= (tRun ?? 0) - .01);
      if (rec || tour.fixT != null) return;
      const sc = $('scrub'); if (sc && document.activeElement !== sc) sc.value = t / tour.duration;
      $('tl')?.style.setProperty('--v', (t / tour.duration).toFixed(4));
      const ch = tour.chapters.filter((c) => c.start <= t + .01).pop();
      const tm = $('time'); if (tm) tm.textContent = `${ch ? ch.title + ' · ' : ''}${fmt(r)}`;
      if (playing && nowEl && nowEl.textContent !== said) { said = nowEl.textContent; const lv = $('live'); if (lv) lv.textContent = said; }
      place();
    };

    if (rec || tour.fixT != null) { tour.render(tour.t < 0 ? 0 : tour.t, true); return; }   // the engine plays the recording itself

    // ── the live page: our own clock, with a speed, and two places where it waits for the visitor ──
    root.classList.add('hide-you');                  // the visitor is "You": the drawn person's cursor stays hidden unless it has to act
    const pp = $('pp'), tip = $('tip');
    const sync = () => {
      const end = tour.t >= tour.duration - .02;
      if (pp) { pp.innerHTML = playing ? PAUSE : end ? AGAIN : PLAY; pp.setAttribute('aria-label', playing ? 'Pause' : end ? 'Watch it again' : 'Play'); }
      root.classList.toggle('is-playing', playing); root.classList.toggle('is-gate', hold === 'gate'); root.classList.toggle('is-ask', hold === 'ask');
      root.classList.toggle('is-end', end);
    };
    const say = (text, el) => {
      if (!tip) return;
      tip.textContent = text || ''; tip.classList.toggle('is-on', !!text);
      if (text && el) { const sr = stage.getBoundingClientRect(), r = el.getBoundingClientRect(); tip.style.left = `${r.left - sr.left + r.width / 2}px`; tip.style.top = `${r.top - sr.top}px`; }
    };
    const stop = () => { playing = false; cancelAnimationFrame(raf); sync(); };
    const play = () => {
      if (tour.t >= tour.duration - .02) { tour.render(tRun ?? 0, true); approved = false; }
      if (!ran && tour.t >= tReady - .01) return wait('gate');
      hold = null; playing = true; lastNow = performance.now(); say(''); cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); sync();
    };
    const wait = (what) => {
      stop(); hold = what; sync(); place();
      if (what === 'ask') {
        say('Your call. Approve to let it push.', target.approve);
        clearTimeout(waitT);
        waitT = setTimeout(() => { if (hold === 'ask') { root.classList.remove('hide-you'); approved = true; hold = null; say(''); play(); } }, 7000);   // nobody's there: "You" approves
      }
    };
    function tick(nowMs) {
      if (!alive || !playing) return;
      const dt = Math.min(.1, (nowMs - lastNow) / 1000); lastNow = nowMs;
      let t = tour.t + dt * rate;
      if (!ran && t >= tReady) { tour.render(tReady); return wait('gate'); }
      if (!approved && tAsk != null && tour.t < tAsk && t >= tAsk) { tour.render(tAsk); return wait('ask'); }
      if (t >= tour.duration) { tour.render(tour.duration); stop(); return; }
      tour.render(t); raf = requestAnimationFrame(tick);
    }
    const run = () => {                               // the visitor pressed Run: skip the drawn click, go
      if (ran && hold !== 'gate') return;
      if (reduce) { ran = true; hold = null; tour.render(tour.duration, true); sync(); place(); return; }   // no film: the finished run
      ran = true; hold = null; root.classList.add('is-ran');
      if (tour.t < tRun) tour.render(tRun, true);
      play();
    };
    const approve = () => {                           // the visitor approved: on from just after the drawn click
      if (hold !== 'ask') return;
      clearTimeout(waitT); approved = true; hold = null; say('');
      tour.render(tOk, true); play();
    };
    const seek = (t) => {
      clearTimeout(waitT); hold = null; say('');
      if (t > tReady) ran = true;
      approved = t > (tAsk ?? Infinity);
      tour.render(t, true); sync();
    };

    on(hit.run, 'click', run);
    on(hit.approve, 'click', approve);
    on(hit.deny, 'click', () => say('In a real run it stops here and asks what to change. Approve to see the rest.', target.deny));
    on(pp, 'click', () => (playing ? stop() : hold === 'ask' ? approve() : hold === 'gate' ? run() : play()));
    on($('replay'), 'click', () => { approved = false; seek(tRun); play(); });
    on($('scrub'), 'input', (e) => { stop(); seek(+e.target.value * tour.duration); });
    root.querySelectorAll('[data-rate]').forEach((b) => on(b, 'click', () => {
      rate = +b.dataset.rate;
      root.querySelectorAll('[data-rate]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    }));
    on(document, 'keydown', (e) => {
      if (e.target.closest?.('input, textarea, select, [contenteditable]') && e.target !== $('scrub')) return;
      if (e.key === 'Enter' && hold === 'gate' && !e.target.closest?.('button, a')) { e.preventDefault(); run(); }
      else if ((e.key === ' ' || e.key === 'k') && !e.target.closest?.('button, a')) { e.preventDefault(); pp?.click(); }
      else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && ran && e.target === document.body) {   // step through the tool calls
        e.preventDefault(); stop();
        const t = tour.t, next = e.key === 'ArrowRight' ? calls.find((c) => c > t + .05) : [...calls].reverse().find((c) => c < t - .3);
        seek(next ?? (e.key === 'ArrowRight' ? tDone : tRun));
      }
    });
    on(window, 'resize', place);

    // the timeline: a tick per tool call, hatched time-lapses, the approval
    const tl = $('tl');
    if (tl) {
      const pct = (t) => `${(t / tour.duration) * 100}%`;
      tl.insertAdjacentHTML('beforeend', calls.map((c) => `<i class="ag-tk" style="left:${pct(c)}"></i>`).join('')
        + lapses.map((L) => `<i class="ag-tk-lapse" style="left:${pct(L.a)};width:${pct(L.b - L.a)}"></i>`).join('')
        + (tAsk != null ? `<i class="ag-tk-ask" style="left:${pct(tAsk)}"></i>` : ''));
    }

    if (reduce) { tour.render(tReady ?? 0, true); hold = 'gate'; sync(); place(); return; }   // reduced motion: the task, then (Run) the finished run
    tour.render(0, true); play();
    window.agentic = { play, stop, seek, run, approve, get t() { return tour.t; } };
  })();

  return () => { alive = false; cancelAnimationFrame(raf); clearTimeout(waitT); off.forEach((f) => f()); tour?.destroy(); };
}
