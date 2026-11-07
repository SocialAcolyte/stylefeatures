// demo/writer: a writer's and speaker's site.
//   the film      tour.js on the play driver, looping while it's on screen; the chapter titles become the words under
//                 it (click one to go there); ?record&ratio=16:9|1:1|9:16 films it once, ?t=12 freezes a moment
//   quoting       select any sentence in a [data-quotable] block (or click the marked line) and it becomes a card:
//                 a link straight to that line (#:~:text=, or #t= for a talk), an image to save, a post to share
//   the talk      a compact player: slides change at their data-at, the transcript follows and seeks when clicked;
//                 a <video> or <audio> inside .wr-pl-pip becomes its clock, otherwise it plays at data-demo-rate
//   the letter    the form posts to its action; with action="#" it just says thanks
import { Tour, include } from '../tour/tour.js';
import script from './script.js';

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const mmss = (v) => `${Math.floor(v / 60)}:${String(Math.floor(v % 60)).padStart(2, '0')}`;

export default function init(root) {
  const off = []; let dead = false;
  start();
  return () => { dead = true; off.forEach((f) => f && f()); };

  async function start() {
    await include(root);                  // harvested fragments: <div data-tour-include="writer/fragments/…">
    if (dead) return;
    const film = root.querySelector('.wr-film');
    if (film) off.push(filmUp(film));
    root.querySelectorAll('[data-wr-player]').forEach((p) => off.push(player(p)));
    off.push(quotes(root), sweep(root));
    root.querySelectorAll('.wr-form').forEach((f) => off.push(letter(f)));
  }
}

/* the film, and its chapters as words with a progress line each */
function filmUp(film) {
  const tour = new Tour(film, script);
  film.tour = tour;                       // the instance, for the console
  const list = film.querySelector('.wr-steps'), ch = tour.chapters;
  list.innerHTML = ch.map((c, i) => `<li><button type="button" data-i="${i}"${tour.rec ? ' tabindex="-1"' : ''}><span>${c.title.replace(/<[^>]+>/g, '')}</span><i></i></button></li>`).join('');
  const items = [...list.children];
  const paint = (t) => items.forEach((li, i) => {
    const c = ch[i], p = Math.max(0, Math.min(1, (t - c.start) / (c.end - c.start)));
    li.style.setProperty('--p', p.toFixed(4)); li.classList.toggle('is-on', t >= c.start && t < c.end); li.classList.toggle('is-done', t >= c.end);
  });
  const prev = tour.onFrame; tour.onFrame = (t) => { prev?.(t); paint(t); };
  paint(Math.max(0, tour.t));
  const off = [() => tour.destroy()];
  if (tour.rec) return () => off.forEach((f) => f());

  let mine = false;                       // the visitor paused it themselves: don't autoplay over that
  const go = (e) => {
    const b = e.target.closest('button[data-i]'); if (!b) return;
    const c = ch[+b.dataset.i];
    if (tour.still) { tour.render((c.start + c.end) / 2, true); paint(tour.t); return; }
    if (!tour.begun) { tour.begun = true; film.classList.add('is-begun'); }
    tour.render(c.start + .01, true); tour.play(); mine = false;
  };
  list.addEventListener('click', go); off.push(() => list.removeEventListener('click', go));
  if (!tour.still) {
    const pp = (e) => { if (e.target.closest('.tour-pp')) mine = !tour.playing; };
    film.addEventListener('click', pp); off.push(() => film.removeEventListener('click', pp));
    const io = new IntersectionObserver(([e]) => {     // plays once a third of it is on screen; pauses once it's gone
      if (e.intersectionRatio >= .33 && !mine) { if (!tour.begun) tour.begin(); else if (!tour.playing) tour.play(); }
      if (!e.isIntersecting && tour.playing) tour.pause();
    }, { threshold: [0, .33] });
    io.observe(film); off.push(() => io.disconnect());
  }
  return () => off.forEach((f) => f());
}

/* the marked lines sweep in once, when they're read */
function sweep(root) {
  const marks = root.querySelectorAll('.wr-hl');
  if (reduce) { marks.forEach((m) => m.classList.add('is-in')); return null; }
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { setTimeout(() => e.target.classList.add('is-in'), 250); io.unobserve(e.target); } }), { threshold: 1, rootMargin: '0px 0px -12% 0px' });
  marks.forEach((m) => io.observe(m));
  return () => io.disconnect();
}

/* select → Quote → a card with a link back to exactly that line */
function quotes(root) {
  const dlg = root.querySelector('.wr-qd'), pop = root.querySelector('.wr-qpop');
  if (!dlg || !pop) return null;
  const zones = [...root.querySelectorAll('[data-quotable]')];
  const q = dlg.querySelector('.wr-qc-q'), src = dlg.querySelector('.wr-qc-src'), code = dlg.querySelector('.wr-qd-url code');
  const btnCopy = dlg.querySelector('[data-act=copy]'), btnSave = dlg.querySelector('[data-act=save]'), aPost = dlg.querySelector('[data-act=post]');
  let pending = null, current = null, timer = 0;
  const off = [];
  const on = (el, ev, fn, o) => { el.addEventListener(ev, fn, o); off.push(() => el.removeEventListener(ev, fn, o)); };
  const clean = (s) => s.replace(/\s+/g, ' ').trim();
  const enc = (s) => encodeURIComponent(s).replace(/-/g, '%2D');
  // a text fragment: the whole line if it's short, else its first and last few words
  const fragment = (text) => {
    const w = text.split(' ');
    return ':~:text=' + (text.length <= 90 || w.length < 10 ? enc(text) : `${enc(w.slice(0, 5).join(' '))},${enc(w.slice(-5).join(' '))}`);
  };
  const linkFor = (zone, text, at) => {
    const u = new URL(zone.dataset.quoteHref && zone.dataset.quoteHref !== '#' ? zone.dataset.quoteHref : location.href, location.href);
    ['clean', 'thumb'].forEach((k) => u.searchParams.delete(k)); u.hash = at != null ? `t=${Math.floor(at)}` : fragment(text);
    return u.href.replace(/#%3A~%3A/, '#:~:');
  };
  const open = (text, zone, at) => {
    text = clean(text).replace(/^[“"']+|[”"']+$/g, '');
    if (!text) return;
    const href = linkFor(zone, text, at), title = zone.dataset.quoteTitle || document.title;
    current = { text, title, href, at };
    q.textContent = text; src.textContent = title + (at != null ? ` · at ${mmss(at)}` : '');
    code.textContent = href.replace(/^https?:\/\//, '');
    aPost.href = `https://x.com/intent/post?text=${encodeURIComponent(`“${text}”`)}&url=${encodeURIComponent(href)}`;
    btnCopy.textContent = 'Copy link';
    hidePop(); getSelection()?.removeAllRanges();
    dlg.showModal();
  };
  const hidePop = () => { pop.hidden = true; pending = null; };
  // a selection inside one paragraph grows to the whole sentences it touches, so half a word never ends up on a card
  const whole = (r, text) => {
    const blk = (n) => (n.nodeType === 1 ? n : n.parentElement)?.closest('p, li, blockquote');
    const b = blk(r.startContainer);
    if (!b || b !== blk(r.endContainer)) return text;
    const pre = document.createRange(); pre.selectNodeContents(b); pre.setEnd(r.startContainer, r.startOffset);
    const all = b.textContent, i = pre.toString().length, j = i + r.toString().length;
    let s0 = i; while (s0 > 0 && !/[.!?]\s/.test(all.slice(s0 - 2, s0))) s0--;
    let s1 = j; while (s1 < all.length && !/[.!?]/.test(all[s1 - 1] || '')) s1++;
    if (/^\d{1,2}:\d{2}/.test(all)) s0 = Math.max(s0, all.search(/\d[^\d:]/) + 1);     // a transcript line: leave its time out
    return clean(all.slice(s0, s1)) || text;
  };
  const check = () => {
    const s = getSelection();
    if (!s || s.isCollapsed || !s.rangeCount) return hidePop();
    const r = s.getRangeAt(0), zone = zones.find((z) => z.contains(r.commonAncestorContainer));
    const text = clean(s.toString());
    if (!zone || text.length < 4) return hidePop();
    const el = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement;
    const at = el?.closest('[data-at]')?.dataset.at;
    pending = { text: whole(r, text), zone, at: at != null ? +at : null };
    const b = r.getBoundingClientRect(), x = Math.max(60, Math.min(innerWidth - 60, b.left + b.width / 2));
    pop.style.left = x + 'px'; pop.style.top = Math.max(52, b.top) + 'px'; pop.hidden = false;
  };
  on(document, 'selectionchange', () => { clearTimeout(timer); timer = setTimeout(check, 160); });
  on(window, 'scroll', () => { if (!pop.hidden) check(); }, { passive: true });
  on(pop, 'pointerdown', (e) => e.preventDefault());       // keep the selection while the button is pressed
  on(pop, 'click', () => pending && open(pending.text, pending.zone, pending.at));
  root.querySelectorAll('.wr-hl').forEach((m) => {
    const zone = m.closest('[data-quotable]'); if (!zone) return;
    on(m, 'click', () => { if (getSelection()?.isCollapsed !== false) open(m.textContent, zone); });
    on(m, 'keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(m.textContent, zone); } });
  });
  on(dlg, 'click', async (e) => {
    if (e.target === dlg) return dlg.close();               // a click on the paper around the card
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'close') dlg.close();
    if (act === 'copy' && current) {
      try { await navigator.clipboard.writeText(current.href); btnCopy.textContent = 'Link copied'; }
      catch { getSelection()?.selectAllChildren(code); btnCopy.textContent = 'Press ⌘C to copy'; }
    }
    if (act === 'save' && current) cardImage(root, current);
  });
  return () => { clearTimeout(timer); off.forEach((f) => f()); };
}

/* the card as a 1600 × 900 image, drawn in the page's own type */
async function cardImage(root, { text, title, href, at }) {
  const css = getComputedStyle(root), v = (k, d) => css.getPropertyValue(k).trim() || d;
  const serif = 'Newsreader, Georgia, serif', sans = '"Inter Tight", system-ui, sans-serif';
  await Promise.all([document.fonts?.load(`italic 64px ${serif}`), document.fonts?.load(`500 26px ${sans}`)]).catch(() => {});
  const W = 1600, H = 900, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = v('--page', '#f5f3ef'); g.fillRect(0, 0, W, H);
  g.save(); g.shadowColor = 'rgba(25,24,22,.16)'; g.shadowBlur = 70; g.shadowOffsetY = 30;
  g.fillStyle = v('--ph', '#fff'); g.fillRect(120, 96, W - 240, H - 192); g.restore();
  const x = 220, maxW = W - 440;
  g.fillStyle = v('--wr-mark-2', '#e4c96f'); g.font = `400 190px ${serif}`; g.fillText('“', x - 14, 300);
  let size = 66, lines = [];
  const wrap = () => {
    g.font = `italic 400 ${size}px ${serif}`; lines = []; let line = '';
    for (const w of text.split(' ')) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
    lines.push(line);
  };
  do { wrap(); size -= 4; } while (lines.length * size * 1.2 > 400 && size > 30);
  size += 4; g.fillStyle = v('--ink', '#191816');
  lines.forEach((l, i) => g.fillText(l, x, 340 + i * size * 1.18));
  g.fillStyle = v('--rule', '#d8d3c9'); g.fillRect(x, H - 230, maxW, 2);
  g.fillStyle = v('--ink', '#191816'); g.font = `600 26px ${sans}`;
  const name = root.querySelector('.wr-qc figcaption b')?.textContent || '';
  g.fillText(name, x, H - 180);
  g.fillStyle = v('--ink-2', '#5f5a53'); g.font = `400 26px ${sans}`; g.textAlign = 'right';
  g.fillText(title + (at != null ? ` · ${mmss(at)}` : ''), x + maxW, H - 180);
  g.textAlign = 'left'; g.fillStyle = v('--ink-3', '#9c968c'); g.font = `500 20px ui-monospace, Menlo, monospace`;
  g.fillText(new URL(href).host + new URL(href).pathname, x, H - 140);
  c.toBlob((b) => { if (!b) return; const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'quote.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); });
}

/* the talk: slides and transcript lines carry data-at (seconds); one clock moves both */
function player(el) {
  const screen = el.querySelector('.wr-pl-screen'), slides = [...el.querySelectorAll('.wr-pl-slide')], lines = [...el.querySelectorAll('.wr-pl-script li')];
  const big = el.querySelector('.wr-pl-big'), pp = el.querySelector('.wr-pl-pp'), track = el.querySelector('.wr-pl-track');
  const range = track.querySelector('input'), time = el.querySelector('.wr-pl-time b'), pip = el.querySelector('.wr-pl-pip');
  const media = el.querySelector('video, audio');
  let dur = +el.dataset.dur || 600;
  const rate = media ? 1 : +el.dataset.demoRate || 1;
  let t = 0, playing = false, raf = 0, last = 0, iS = -1, iL = -1;
  const off = [];
  const on = (n, ev, fn) => { n?.addEventListener(ev, fn); off.push(() => n?.removeEventListener(ev, fn)); };
  const ticks = () => { track.querySelectorAll('i').forEach((i) => i.remove()); track.insertAdjacentHTML('beforeend', slides.slice(1).map((s) => `<i style="left:${(+s.dataset.at / dur) * 100}%"></i>`).join('')); range.max = dur; };
  const idx = (list) => { let i = 0; list.forEach((x, k) => { if (+x.dataset.at <= t + .01) i = k; }); return i; };
  const draw = () => {
    const s = idx(slides), l = idx(lines);
    if (s !== iS) { slides.forEach((x, k) => x.classList.toggle('is-on', k === s)); iS = s; }
    if (l !== iL) { lines.forEach((x, k) => { x.classList.toggle('is-on', k === l && (playing || t > 0)); x.classList.toggle('is-past', k < l); }); iL = l; }
    track.style.setProperty('--p', (t / dur).toFixed(4)); if (document.activeElement !== range) range.value = t;
    time.textContent = mmss(t);
  };
  const tick = (now) => {
    if (!playing) return;
    t = media ? media.currentTime : Math.min(dur, t + Math.min(.1, (now - last) / 1000) * rate); last = now;
    if (t >= dur) { t = dur; set(false); }
    draw(); raf = requestAnimationFrame(tick);
  };
  function set(p) {
    playing = p; pp.classList.toggle('is-playing', p); pp.setAttribute('aria-label', p ? 'Pause' : 'Play'); big.hidden = p || t > 0;
    if (media) p ? media.play().catch(() => {}) : media.pause();
    cancelAnimationFrame(raf); iL = -1;
    if (p) { if (t >= dur) t = 0; last = performance.now(); raf = requestAnimationFrame(tick); }
    draw();
  }
  const seek = (s) => { t = Math.max(0, Math.min(dur, s)); if (media) media.currentTime = t; iL = -1; big.hidden = true; draw(); };
  if (media) on(media, 'loadedmetadata', () => { dur = media.duration || dur; ticks(); draw(); });
  ticks();
  on(big, 'click', () => set(true));
  on(pp, 'click', () => set(!playing));
  on(range, 'input', () => seek(+range.value));
  on(pip, 'click', () => screen.classList.toggle('is-swapped'));
  lines.forEach((li) => on(li, 'click', () => { if (getSelection()?.isCollapsed === false) return; seek(+li.dataset.at); if (!playing) set(true); }));
  // pause when it scrolls away
  const io = new IntersectionObserver(([e]) => { if (!e.isIntersecting && playing) set(false); }, { threshold: .15 });
  io.observe(el); off.push(() => io.disconnect());
  draw();
  return () => { cancelAnimationFrame(raf); off.forEach((f) => f()); };
}

/* the letter: posts to the newsletter service; with action="#" it only says thanks */
function letter(form) {
  const done = form.parentElement.querySelector('.wr-form-done');
  const submit = (e) => {
    if ((form.getAttribute('action') || '#') !== '#') return;
    e.preventDefault(); form.hidden = true; if (done) { done.hidden = false; done.tabIndex = -1; done.focus(); }
  };
  form.addEventListener('submit', submit);
  return () => form.removeEventListener('submit', submit);
}
