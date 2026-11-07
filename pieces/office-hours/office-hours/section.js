// demo/office-hours: book a call.
//   the week      the diary fills in from the coming week (or data-week="YYYY-MM-DD" on the root: its Monday) before the
//                 film is measured: dates, the week's title and number, the little month in the margin, the slip and
//                 the invite card. Times shorter than the film's offer get .is-short, so they fade when it's picked.
//   the film      tour.js on the play driver; it starts once it's on screen and plays once. Reduced motion shows the
//                 week with the entry written in. ?record films it once; ?t=12 freezes a moment (../tour/README.md).
//   your turn     an open time or an offer in the diary, clicked, takes the visitor to the booking with it chosen.
//   the booking   the offer picker, both time zones with live clocks (data-tz on the root: your IANA zone, e.g.
//                 "Europe/Lisbon"; empty means the visitor's own), your scheduler's embed (data-embed / data-embed-0..2
//                 on .oh-embed) and an email fallback that carries the offer and the time.
import { Tour } from '../tour/tour.js';
import script, { FILM_OFFER } from './script.js';

const q = new URLSearchParams(location.search);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const fmt = (d, o) => new Intl.DateTimeFormat('en-GB', o).format(d);

export default function init(root) {
  const off = [];
  const week = fillWeek(root);
  const film = root.querySelector('.oh-film');
  let tour = null;
  if (film) { const r = diary(root, film); tour = r.tour; off.push(r.off); }
  const book = root.querySelector('.oh-book');
  if (book) off.push(booking(root, book, week, tour));
  off.push(rules(root));
  return () => off.forEach((f) => f && f());
}

/* ── the coming week ── */
function monday(root) {
  const set = root.dataset.week;
  if (set && /^\d{4}-\d{2}-\d{2}$/.test(set)) { const [y, m, d] = set.split('-').map(Number); const t = new Date(y, m - 1, d); t.setDate(t.getDate() - ((t.getDay() + 6) % 7)); return t; }
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const dow = (t.getDay() + 6) % 7;                       // 0 = Monday
  t.setDate(t.getDate() + (dow === 0 ? 0 : 7 - dow));     // today if it's Monday, otherwise next Monday
  return t;
}
function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const n = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - n); const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - y0) / 864e5 + 1) / 7);
}
function fillWeek(root) {
  const mon = monday(root), day = (i) => { const d = new Date(mon); d.setDate(d.getDate() + i); return d; };
  root.querySelectorAll('[data-oh-date]').forEach((b) => { b.textContent = day(+b.dataset.ohDate).getDate(); });
  root.querySelectorAll('[data-oh-weekof]').forEach((e) => { e.textContent = fmt(mon, { day: 'numeric', month: 'long' }); });
  root.querySelectorAll('[data-oh-weekno]').forEach((e) => { e.textContent = 'Week ' + isoWeek(mon); });
  // the booked day: the column the film's slot sits in
  const slot = root.querySelector('[data-tour="slot-thu"]'), di = +(slot?.closest('.oh-col')?.dataset.d ?? 3), bd = day(di);
  const time = slot?.querySelector(':scope > b')?.textContent || '10:00';
  root.querySelectorAll('[data-oh-when="long"]').forEach((e) => { e.textContent = `${DAYS[di]} ${fmt(bd, { day: 'numeric', month: 'long' })}`; });
  root.querySelectorAll('[data-oh-when="short"]').forEach((e) => { e.textContent = `${DAYS[di].slice(0, 3)} ${bd.getDate()}, ${time}`; });
  root.querySelectorAll('[data-oh-month]').forEach((e) => { e.textContent = fmt(bd, { month: 'long', year: 'numeric' }); });
  // the little month in the margin: Monday first, the week ringed, a dot on the booked day (the film shows it)
  const cal = root.querySelector('.oh-cal');
  if (cal) {
    const first = new Date(bd.getFullYear(), bd.getMonth(), 1), lead = (first.getDay() + 6) % 7, n = new Date(bd.getFullYear(), bd.getMonth() + 1, 0).getDate();
    const cells = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((c) => `<b>${c}</b>`);
    for (let i = 0; i < lead; i++) cells.push('<span class="is-out">.</span>');
    const inWeek = (k) => { const d = new Date(bd.getFullYear(), bd.getMonth(), k); return d >= mon && d <= day(4); };
    for (let k = 1; k <= n; k++) cells.push(`<span${inWeek(k) ? ' class="is-wk"' : ''}>${k}</span>`);
    const at = lead + bd.getDate() - 1, row = Math.floor(at / 7) + 1;
    cal.innerHTML = cells.join('') +
      `<i class="oh-cal-band" style="top:${row * 22}px"></i><i class="oh-cal-dot" data-tour="cal-dot" style="left:${(at % 7) * 26}px;top:${row * 22}px"></i>`;
  }
  // times too short for the film's offer fade when it's picked
  const len = +(root.querySelector(`[data-tour="${FILM_OFFER}"]`)?.dataset.len || 45);
  root.querySelectorAll('.oh-slot[data-m]').forEach((s) => s.classList.toggle('is-short', +s.dataset.m < len));
  // time zone labels
  const tz = zoneOf(root);
  if (!root.dataset.tzLabel) root.querySelectorAll('[data-oh-tz]').forEach((e) => { if (/your city/i.test(e.textContent) && root.dataset.tz) e.textContent = city(tz); });
  return { mon, day, tz };
}
const zoneOf = (root) => root.dataset.tz || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const city = (tz) => (tz.split('/').pop() || tz).replace(/_/g, ' ') + ' time';
function offsetMin(tz, d = new Date()) {
  try {
    const v = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(d).find((p) => p.type === 'timeZoneName')?.value || 'GMT';
    const m = v.match(/([+-])(\d{1,2}):?(\d{2})?/); return m ? (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +(m[3] || 0)) : 0;
  } catch { return 0; }
}

/* ── the diary film, and the diary as the visitor's after it ── */
function diary(root, film) {
  const tour = new Tour(film, script);
  film.tour = tour;
  const off = [() => tour.destroy()];
  if (tour.still && !q.has('t') && tour.api.marks.still != null) tour.render(tour.api.marks.still, true);
  if (tour.rec) return { tour, off: () => off.forEach((f) => f()) };

  if (!tour.still) {
    let mine = false, wait = 0;
    const own = (e) => { if (e.target.closest?.('.tour-ctl')) mine = true; };
    film.addEventListener('pointerdown', own); off.push(() => film.removeEventListener('pointerdown', own));
    const io = new IntersectionObserver(([e]) => {
      clearTimeout(wait);
      if (e.intersectionRatio >= .45 && !mine && !tour.begun) wait = setTimeout(() => tour.begin(), 700);
    }, { threshold: [0, .45] });
    io.observe(film); off.push(() => { io.disconnect(); clearTimeout(wait); });
  }

  // your turn: an open time or an offer in the diary goes to the booking with it chosen
  const win = film.querySelector('[data-tour-window]');
  const pick = (e) => {
    const s = e.target.closest('.oh-slot[data-open]'), o = e.target.closest('.oh-offer');
    if (!s && !o) return;
    if (tour.playing) tour.pause();
    root.dispatchEvent(new CustomEvent('oh:pick', { detail: s ? { slot: s } : { offer: [...root.querySelectorAll('.oh-offer')].indexOf(o) } }));
  };
  win?.addEventListener('click', pick); off.push(() => win?.removeEventListener('click', pick));
  return { tour, off: () => off.forEach((f) => f()) };
}

/* ── the booking ── */
function booking(root, book, week, tour) {
  const off = [];
  const btns = [...book.querySelectorAll('.oh-pick [role=radio]')];
  const embed = book.querySelector('.oh-embed'), mail = book.querySelector('[data-oh-mail]'), chosenEl = book.querySelector('[data-oh-chosen]');
  const names = [...root.querySelectorAll('.oh-offer')].map((o) => o.dataset.name);
  const to = (mail?.getAttribute('href') || '').replace(/^mailto:/, '');
  let offer = Math.max(0, btns.findIndex((b) => b.getAttribute('aria-checked') === 'true')), slot = null;

  const url = (i) => embed?.getAttribute(`data-embed-${i}`) || embed?.dataset.embed || '';
  const showEmbed = () => {
    const u = url(offer); if (!embed || !u) return;
    let f = embed.querySelector('iframe');
    if (!f) { embed.innerHTML = ''; f = document.createElement('iframe'); f.title = 'Book a time'; f.loading = 'lazy'; embed.append(f); }
    if (f.getAttribute('src') !== u) f.src = u;
  };
  const mailto = () => {
    if (!mail) return;
    const myTz = week.tz, yourTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const lines = [`I'd like to book: ${names[offer] || ''}`];
    if (slot) lines.push(`The time I picked: ${slot} (${city(myTz)})`); else lines.push('Two times that suit me: ');
    lines.push(`My time zone: ${yourTz}`, '', 'What it\'s about: ');
    mail.href = `mailto:${to}?subject=${encodeURIComponent('Booking: ' + (names[offer] || 'a call'))}&body=${encodeURIComponent(lines.join('\n'))}`;
  };
  const choose = (i, focus) => {
    offer = i;
    btns.forEach((b, k) => { b.setAttribute('aria-checked', k === i); b.tabIndex = k === i ? 0 : -1; });
    if (focus) btns[i].focus();
    showEmbed(); mailto(); say();
  };
  const say = () => {
    if (!chosenEl) return;
    chosenEl.hidden = !slot; if (slot) chosenEl.textContent = `${names[offer] || ''}, ${slot}`;
  };
  const onClick = (e) => { const b = e.target.closest('.oh-pick [role=radio]'); if (b) choose(btns.indexOf(b)); };
  const onKey = (e) => {
    const i = btns.indexOf(document.activeElement); if (i < 0) return;
    if (['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(e.key)) { e.preventDefault(); choose((i + (/Down|Right/.test(e.key) ? 1 : btns.length - 1)) % btns.length, true); }
  };
  book.addEventListener('click', onClick); book.addEventListener('keydown', onKey);
  off.push(() => { book.removeEventListener('click', onClick); book.removeEventListener('keydown', onKey); });

  // "Book this" on an offer, or a time / an offer clicked in the diary
  const go = () => book.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  const fromLink = (e) => { const a = e.target.closest('.oh-off-book[data-offer]'); if (!a) return; e.preventDefault(); choose(+a.dataset.offer); go(); };
  root.addEventListener('click', fromLink); off.push(() => root.removeEventListener('click', fromLink));
  const fromDiary = (e) => {
    const d = e.detail || {};
    if (d.slot) {
      const di = +(d.slot.closest('.oh-col')?.dataset.d ?? 0), date = week.day(di);
      slot = `${DAYS[di]} ${fmt(date, { day: 'numeric', month: 'long' })} at ${d.slot.querySelector(':scope > b')?.textContent || ''}`;
      const m = +d.slot.dataset.m || 0, fit = [...root.querySelectorAll('.oh-offer')].map((o) => +o.dataset.len || 0);
      if ((fit[offer] || 0) > m) { const k = fit.findIndex((l) => l <= m); if (k >= 0) offer = k; }
      choose(offer);
    } else if (d.offer >= 0) choose(d.offer);
    go();
  };
  root.addEventListener('oh:pick', fromDiary); off.push(() => root.removeEventListener('oh:pick', fromDiary));

  // the two clocks, and the gap between them
  const myTz = week.tz, yourTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const tick = () => {
    const now = new Date(), hm = (tz) => { try { return fmt(now, { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }); } catch { return '--:--'; } };
    book.querySelectorAll('[data-oh-now="you"]').forEach((e) => { e.textContent = hm(yourTz); });
    book.querySelectorAll('[data-oh-now="me"]').forEach((e) => { e.textContent = hm(myTz); });
    const gap = offsetMin(myTz, now) - offsetMin(yourTz, now), h = Math.abs(gap) / 60, hs = `${Number.isInteger(h) ? h : h.toFixed(1)} hour${h === 1 ? '' : 's'}`;
    const g = book.querySelector('[data-oh-gap]');
    if (g) g.textContent = gap === 0 ? 'We keep the same time. The times in my diary are yours too.' : `I'm ${hs} ${gap > 0 ? 'ahead of' : 'behind'} you. The booking page shows every time in yours.`;
  };
  book.querySelectorAll('[data-oh-zone="you"]').forEach((e) => { e.textContent = yourTz.replace(/_/g, ' '); });
  tick(); const iv = setInterval(tick, 15000); off.push(() => clearInterval(iv));

  choose(offer);
  return () => off.forEach((f) => f());
}

/* the offers' hour rules ink themselves in as they arrive */
function rules(root) {
  const rs = [...root.querySelectorAll('.oh-rule i')];
  if (!rs.length || reduce || q.has('record')) return null;
  rs.forEach((r) => r.style.setProperty('--k', 0));
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.style.setProperty('--k', 1); io.unobserve(e.target); } }), { rootMargin: '0px 0px -15% 0px' });
  rs.forEach((r) => io.observe(r));
  return () => io.disconnect();
}
