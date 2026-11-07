// denarii: a bar chart counted out in real Roman silver.
// The <table> is the chart's content; each value is laid out as a row of real denarii (one coin = one unit), with a
// real quinarius, the half-denarius, for a half unit. Every coin is a separate photograph of a separate coin, shown at
// its true relative size. No build step: auto-starts on [data-denarii]; or import { denarii } and call it.

const HERE = new URL('.', import.meta.url);
const POOLS = new Map();
const GROUP = 5;          // coins are laid in fives (V), with a little gap between fives
const STEP = 0.7;         // pitch along a row, as a fraction of a slot: each coin rests a little on the one before
const GAP = 0.3;          // the gap between fives, as a fraction of a slot
const SLOT_MM = 22;       // a slot is as wide as the widest denarius; every coin is centred in one, at its own size
const NICE = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8];   // units a reader can multiply by
const CLOTH = 'assets/cloth.webp';   // the ground: a wool tunic fragment, Egypt, 400s-600s (see README)

function loadPool(url) {
  if (!POOLS.has(url)) POOLS.set(url, fetch(url).then((r) => { if (!r.ok) throw new Error(`denarii: ${url} ${r.status}`); return r.json(); }));
  return POOLS.get(url);
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function shuffle(arr, rnd) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function parseValue(cell) {
  const raw = cell.dataset.value ?? cell.textContent;
  const t = String(raw).replace(/−/g, '-').replace(/[^\d.\-]/g, '');
  const v = parseFloat(t);
  return Number.isFinite(v) ? v : null;
}

// n whole coins and maybe a half, for value v in units u
export function count(v, u) {
  const x = Math.max(0, v) / u; let n = Math.floor(x + 1e-9); const f = x - n;
  let half = false;
  if (f >= 0.75) n += 1; else if (f >= 0.25) half = true;
  return { n, half, slots: n + (half ? 1 : 0) };
}

function units(max) {
  const out = []; const e = Math.floor(Math.log10(Math.max(max, 1e-9)));
  for (let k = e - 3; k <= e + 2; k++) for (const m of NICE) out.push(+(m * 10 ** k).toPrecision(6));
  return out;
}

// in slots (D): the length of a row of n coins, and the centre of slot i
const rowLen = (n) => (n <= 0 ? 0 : 1 + (n - 1) * STEP + Math.floor((n - 1) / GROUP) * GAP);
const slotC = (i) => 0.5 + i * STEP + Math.floor(i / GROUP) * GAP;

export function denarii(root, opts = {}) {
  const ds = root.dataset;
  const o = {
    src: opts.src ?? ds.src ?? new URL('assets/coins.json', HERE).href,
    unit: +(opts.unit ?? ds.unit ?? 0) || 0,
    max: +(opts.max ?? ds.max ?? 0) || 0,
    minCoins: +(opts.minCoins ?? ds.minCoins ?? 15),
    maxCoins: +(opts.maxCoins ?? ds.maxCoins ?? 40),
    coin: +(opts.coin ?? ds.coin ?? 0) || 0,            // largest slot in px (0 = from CSS --dn-coin)
    cloth: opts.cloth ?? ds.cloth ?? 'true',
    column: +(opts.column ?? ds.column ?? 0),
    face: opts.face ?? ds.face ?? 'obv',
    seed: opts.seed ?? ds.seed,
    unitLabel: opts.unitLabel ?? ds.unitLabel ?? '',
    label: opts.label ?? ds.label ?? 'Show',
  };
  const table = root.querySelector('table');
  if (!table) return Object.assign(() => {}, { show() {} });
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const lang = root.closest('[lang]')?.lang || document.documentElement.lang || undefined;
  const fmt = (v) => new Intl.NumberFormat(lang, { maximumFractionDigits: 2 }).format(v);
  const [unitOne, unitMany] = String(o.unitLabel).includes('|') ? String(o.unitLabel).split('|') : [o.unitLabel, o.unitLabel];
  const withUnit = (v) => `${fmt(v)}${unitMany ? ' ' + (v === 1 ? unitOne : unitMany) : ''}`;

  // --- read the table ---
  const headRow = table.tHead?.rows[0];
  const body = Array.from(table.tBodies).flatMap((b) => Array.from(b.rows));
  const rows = body.map((tr) => {
    const cells = Array.from(tr.cells);
    const th = cells.find((c) => c.tagName === 'TH') || cells[0];
    const data = cells.filter((c) => c !== th);
    return { tr, th, data, values: data.map(parseValue), label: th.textContent.trim() };
  }).filter((r) => r.data.length);
  const ncol = Math.max(0, ...rows.map((r) => r.data.length));
  const headCells = headRow ? Array.from(headRow.cells) : [];
  const colNames = Array.from({ length: ncol }, (_, i) => (headCells[headCells.length - ncol + i]?.textContent.trim()) || `Column ${i + 1}`);
  let col = Math.min(Math.max(0, o.column), ncol - 1);
  if (!rows.length || ncol < 1) return Object.assign(() => {}, { show() {} });

  const added = [];
  const ac = new AbortController(); const on = (t, e, f, p) => t.addEventListener(e, f, { signal: ac.signal, ...p });
  let pool = null, pxmm = 8, deck = [], halves = [], geom = null, built = false, shown = false, active = -1, ro = null, io = null;
  const lanes = [];

  // --- the extra parts (all aria-hidden or real buttons) ---
  let sw = null, title = null;
  if (table.caption) {   // the caption names the table for assistive tech; sighted readers see a copy above the switch and the cloth
    title = document.createElement('div'); title.className = 'dn-title'; title.setAttribute('aria-hidden', 'true');
    title.innerHTML = table.caption.innerHTML; root.insertBefore(title, table); added.push(title); root.classList.add('dn-titled');
  }
  if (ncol > 1) {
    sw = document.createElement('div'); sw.className = 'dn-switch'; sw.setAttribute('role', 'group'); sw.setAttribute('aria-label', o.label);
    colNames.forEach((name, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = name; b.dataset.col = i;
      b.setAttribute('aria-pressed', String(i === col)); sw.append(b);
    });
    root.insertBefore(sw, table); added.push(sw);
    on(sw, 'click', (e) => { const b = e.target.closest('button[data-col]'); if (b) show(+b.dataset.col); });
  }
  const live = document.createElement('p'); live.className = 'dn-live'; live.setAttribute('role', 'status'); root.append(live); added.push(live);
  const tip = document.createElement('div'); tip.className = 'dn-tip'; tip.setAttribute('aria-hidden', 'true'); root.append(tip); added.push(tip);
  const key = document.createElement('div'); key.className = 'dn-key'; key.setAttribute('aria-hidden', 'true'); root.append(key); added.push(key);

  // the cloth the count is laid on (aria-hidden; behind the rows)
  const clothBox = document.createElement('div'); clothBox.className = 'dn-cloth'; clothBox.setAttribute('aria-hidden', 'true');
  const clothImg = new Image(); clothImg.alt = ''; clothImg.decoding = 'async'; clothImg.draggable = false; clothBox.append(clothImg);
  let clothGeo = null; const useCloth = String(o.cloth) !== 'false';
  if (useCloth) { root.prepend(clothBox); added.push(clothBox); }

  rows.forEach((r, ri) => {
    const td = document.createElement('td'); td.className = 'dn-bar'; td.setAttribute('aria-hidden', 'true');
    const lane = document.createElement('div'); lane.className = 'dn-lane';
    const val = document.createElement('span'); val.className = 'dn-val';
    const name = document.createElement('span'); name.className = 'dn-name'; name.textContent = r.label;   // shown when narrow
    lane.append(val); td.append(name, lane); r.th.after(td); added.push(td);
    lanes[ri] = { td, lane, val, name, pieces: new Map() };
  });

  // --- coins ---
  function seedOf() {
    if (o.seed != null && o.seed !== '') return [...String(o.seed)].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
    return (Math.random() * 2 ** 32) >>> 0;
  }
  function coinFor(ri, i) {   // the same row and slot always get the same coin, whatever the column
    return deck[(ri * (o.maxCoins + 1) + i) % deck.length];
  }
  function makeCoin(c, ri, slot, kind) {
    const img = new Image(); img.className = 'dn-coin' + (kind === 'h' ? ' dn-half' : ''); img.alt = ''; img.decoding = 'async'; img.draggable = false;
    const face = o.face === 'rev' ? 'rev' : o.face === 'mixed' ? (((ri * 7 + slot * 3) % 5) < 2 ? 'rev' : 'obv') : 'obv';
    img.dataset.face = face; img.dataset.slot = slot; img.dataset.kind = kind; img.dataset.row = ri;
    img.src = new URL('coins/' + c[face], new URL('.', o.src)).href;
    img._coin = c;
    return img;
  }

  // one coin size for this width (so ~15-26 coins fill a row), then for each column the smallest round unit whose
  // longest row still fits: the longest row in every column fills most of the width (75% or more)
  function sizeFor(avail) {
    const css = getComputedStyle(root);
    const dmax = o.coin || parseFloat(css.getPropertyValue('--dn-coin')) || 60;
    const dmin = parseFloat(css.getPropertyValue('--dn-min')) || 20;
    const target = Math.max(o.minCoins, Math.min(30, Math.round(avail / 30)));
    const D = Math.max(dmin, Math.min(dmax, avail / rowLen(target)));
    let cap = 1; while (cap < o.maxCoins && rowLen(cap + 1) * D <= avail + 0.5) cap++;
    return { D, cap };
  }
  function solve(c, D, cap) {
    const vals = rows.map((r) => r.values[c]).filter((v) => v != null);
    const max = o.max || Math.max(0, ...vals);
    if (o.unit) return { u: o.unit, N: count(max, o.unit).slots, D };
    if (max <= 0) return { u: 1, N: 0, D };
    const u = units(max).find((x) => count(max, x).slots <= cap) ?? max;
    return { u, N: count(max, u).slots, D };
  }

  function place(img, slot, D) {
    // the image is at px_per_mm of the coin's recorded diameter; a slot is SLOT_MM wide
    const [w, h] = img._coin[img.dataset.face + '_wh'] || [1, 1]; const k = D / SLOT_MM / pxmm;
    img.style.width = `${w * k}px`; img.style.height = `${h * k}px`;
    img.style.left = `${slotC(slot) * D}px`;
  }

  function makeKey() {
    const { u } = geom.cols[col]; const D = Math.min(geom.laneD, 44);
    key.replaceChildren();
    const k1 = document.createElement('span'); k1.className = 'dn-k';
    const c1 = makeCoin(deck[deck.length - 1], 0, 0, 'c'); c1.className = 'dn-kc'; place(c1, 0, D); c1.style.left = '';
    k1.append(c1, document.createTextNode(` ${withUnit(u)}`));
    const k2 = document.createElement('span'); k2.className = 'dn-k';
    const c2 = makeCoin(halves[0], 0, 0, 'h'); c2.className = 'dn-kc'; place(c2, 0, D); c2.style.left = '';
    k2.append(c2, document.createTextNode(` ${withUnit(u / 2)}`));
    key.append(k1, k2);
  }

  function target(ri) {
    const v = rows[ri].values[col]; if (v == null) return new Map();
    const { n, half } = count(v, geom.cols[col].u); const m = new Map();
    for (let i = 0; i < n; i++) m.set('c' + i, { slot: i, kind: 'c' });
    if (half) m.set('h' + n, { slot: n, kind: 'h' });
    return m;
  }

  function valueX(ri) {
    const v = rows[ri].values[col]; if (v == null) return 0;
    const g = geom.cols[col]; return rowLen(count(v, g.u).slots) * g.D;
  }

  function anim(el, frames, opt) {
    if (reduce.matches || !el.animate) return null;
    return el.animate(frames, { fill: 'none', ...opt });
  }

  // lay a row out for the current column; how: 'none' | 'count' (first arrival) | 'change'
  function render(ri, how) {
    const L = lanes[ri]; const { D } = geom.cols[col]; const want = target(ri);
    let k = 0;
    for (const [id, img] of L.pieces) {
      if (want.has(id)) continue;
      L.pieces.delete(id);
      if (how === 'none' || reduce.matches) { img.remove(); continue; }
      const a = anim(img, [{ opacity: 1, transform: 'translate(-50%,-50%)' }, { opacity: 0, transform: `translate(calc(-50% - ${0.5 * D}px),-50%)` }], { duration: 240, delay: (k++) * 14, easing: 'cubic-bezier(.4,0,.7,.4)', fill: 'forwards' });
      if (a) a.finished.then(() => img.remove(), () => img.remove()); else img.remove();
    }
    const fresh = [];
    for (const [id, w] of want) {
      let img = L.pieces.get(id);
      if (!img) {
        const c = w.kind === 'h' ? halves[ri % halves.length] : coinFor(ri, w.slot);
        img = makeCoin(c, ri, w.slot, w.kind); L.pieces.set(id, img); fresh.push(img);
        // later coins lie on earlier ones: keep the lane in slot order
        const after = [...L.lane.querySelectorAll('.dn-coin')].find((el) => +el.dataset.slot > w.slot);
        L.lane.insertBefore(img, after || L.val);
        place(img, w.slot, D);
      } else if (how === 'change') {
        // a coin that stays may move and change size when the unit changes: slide it there (FLIP)
        const x0 = parseFloat(img.style.left) || 0, w0 = parseFloat(img.style.width) || 1;
        place(img, w.slot, D);
        const dx = x0 - parseFloat(img.style.left), sc = w0 / (parseFloat(img.style.width) || 1);
        if (Math.abs(dx) > 0.5 || Math.abs(sc - 1) > 0.01)
          anim(img, [{ transform: `translate(calc(-50% + ${dx}px),-50%) scale(${sc})` }, { transform: 'translate(-50%,-50%)' }], { duration: 420, easing: 'cubic-bezier(.3,.6,.2,1)' });
      } else place(img, w.slot, D);
    }
    fresh.sort((a, b) => a.dataset.slot - b.dataset.slot);
    const x = valueX(ri);
    L.val.textContent = rows[ri].data[col]?.textContent.trim() ?? '';
    const prevX = L.valX ?? 0; L.valX = x;
    L.val.style.left = `${x}px`;
    if (how === 'none' || reduce.matches) return;
    // counted out as coins are on a table: each one is set down just short of its place, a little beyond the last,
    // and slides the rest of the way on the cloth (constant friction: an even deceleration, quadratic ease-out). Left
    // to right, one after another, so the row grows like a bar and each comes to rest on the one before.
    const step = Math.max(28, Math.min(66, 1300 / Math.max(1, fresh.length)));
    let t = how === 'change' ? 160 : 0; let last = 0;
    fresh.forEach((img) => {
      const dur = 300;
      anim(img, [
        { opacity: 0, transform: `translate(calc(-50% - ${0.4 * D}px),calc(-50% - 1px))` },
        { opacity: 1, offset: 0.22 },
        { opacity: 1, transform: 'translate(-50%,-50%)' },
      ], { duration: dur, delay: t, easing: 'cubic-bezier(.33,.67,.67,1)', fill: 'backwards' });
      last = t + dur; t += step;
    });
    if (how === 'count') {
      anim(L.val, [{ opacity: 0 }, { opacity: 1 }], { duration: 360, delay: Math.max(0, last - 120), fill: 'backwards', easing: 'ease-out' });
    } else if (prevX !== x) {
      anim(L.val, [{ transform: `translate(${prevX - x}px,-50%)` }, { transform: 'translate(0,-50%)' }], { duration: Math.max(420, last - 60), easing: 'cubic-bezier(.3,.6,.2,1)' });
    }
  }

  // geometry at this width. The coin size is shared by every column, so rows (and the cloth under them) keep their
  // place when the column changes. The cloth's plain field is scaled to hold the rows, its corner band in the gutter
  // to their left (when there is room), and the cloth photograph is never shown larger than it is sharp.
  function measure() {
    const css = getComputedStyle(root);
    const reserve = parseFloat(css.getPropertyValue('--dn-reserve')) || 56;
    const stacked = root.classList.contains('dn-stack');
    const rootR = root.getBoundingClientRect();
    const tdLeft = lanes[0].td.getBoundingClientRect().left - rootR.left;
    const tdW = rootR.width - tdLeft;
    let band = 0, size = null, s = 0, cols = [], laneD = 0;
    const dmax = o.coin || parseFloat(css.getPropertyValue('--dn-coin')) || 60;
    for (let it = 0; it < 4; it++) {
      const padX = 0.3 * (laneD || 30);
      const lane = Math.max(60, tdW - band - padX);               // the visible width of the field for the coins
      size = sizeFor(Math.max(60, lane - reserve));
      // each column's coins are then sized so its longest row reaches ~90% of the field, its number still after it
      cols = colNames.map((_, c) => {
        const g = solve(c, size.D, size.cap); const L = rowLen(Math.max(1, g.N));
        return { ...g, D: Math.max(size.D, Math.min(dmax, (0.9 * lane) / L, (lane - 50) / L)) };
      });
      laneD = Math.max(...cols.map((g) => g.D));
      root.style.setProperty('--dn-d', `${laneD}px`);
      root.style.setProperty('--dn-band', `${band + 0.3 * laneD}px`);
      if (!useCloth || !clothGeo) break;
      const first = rows[0].tr.getBoundingClientRect(), last = rows[rows.length - 1].tr.getBoundingClientRect();
      const f = clothGeo.field;
      s = (last.bottom - first.top + 0.6 * laneD) / (f.bottom - f.top);       // css px per mm of the cloth
      const nb = stacked ? 0 : (f.left - clothGeo.edge_left) * s;
      if (Math.abs(nb - band) < 0.5) break;
      band = nb;
    }
    return { cols, laneD, s, band, tdLeft, stacked };
  }

  function placeCloth() {
    if (!useCloth || !clothGeo || !geom.s) return;
    const { s, laneD, tdLeft, stacked } = geom; const f = clothGeo.field;
    // the near crop (full resolution, left 330 mm) when the cloth is shown large and it covers what is visible
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const near = clothGeo.near && s * dpr > clothGeo.px_per_mm * 1.1;
    const url = new URL(near ? CLOTH.replace('.webp', '-near.webp') : CLOTH, HERE).href;
    if (clothImg.dataset.src !== url) { clothImg.dataset.src = url; clothImg.src = url; }
    const wmm = near ? clothGeo.near.w_mm : clothGeo.w_mm;
    const rootR = root.getBoundingClientRect();
    const first = rows[0].tr.getBoundingClientRect();
    const padY = 0.3 * laneD, padX = 0.3 * laneD;
    const top = first.top - rootR.top - padY;                      // the field's top edge
    const laneLeft = lanes[0].lane.getBoundingClientRect().left - rootR.left;
    const boxLeft = stacked ? 0 : tdLeft;
    clothBox.style.left = `${boxLeft}px`; clothBox.style.right = '0px';
    clothBox.style.top = `${top - f.top * s}px`; clothBox.style.height = `${clothGeo.h_mm * s}px`;
    clothImg.style.width = `${wmm * s}px`; clothImg.style.height = `${clothGeo.h_mm * s}px`;
    clothImg.style.left = `${laneLeft - padX - f.left * s - boxLeft}px`;
  }

  function layout(how = 'none') {
    if (!lanes[0].td.getBoundingClientRect().width) return;
    const prev = geom;
    const g = measure();
    const changed = !prev || prev.cols.some((c, i) => c.u !== g.cols[i].u || Math.abs(c.D - g.cols[i].D) > 0.25);
    if (prev && prev.cols[col].u !== g.cols[col].u) lanes.forEach((L) => { L.pieces.forEach((img) => img.remove()); L.pieces.clear(); });
    geom = g;
    if (useCloth && clothGeo) {
      const f = clothGeo.field;
      root.style.setProperty('--dn-above', `${f.top * g.s + 0.3 * g.laneD}px`);
      root.style.setProperty('--dn-below', `${(clothGeo.h_mm - f.bottom) * g.s + 0.3 * g.laneD}px`);
    }
    root.style.setProperty('--dn-keypad', `${Math.max(0, lanes[0].lane.getBoundingClientRect().left - root.getBoundingClientRect().left)}px`);
    placeCloth();
    if (changed || !key.childNodes.length) makeKey();
    if (!shown && how === 'none') return;
    rows.forEach((_, ri) => render(ri, how));
  }

  function show(c, quiet) {
    c = Math.max(0, Math.min(ncol - 1, c | 0));
    if (c === col && built) return;
    col = c; showTip(null);
    rows.forEach((r) => r.data.forEach((d, i) => d.classList.toggle('dn-cur', i === col)));
    sw?.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.col === col)));
    if (built && shown) { makeKey(); rows.forEach((_, ri) => render(ri, 'change')); }
    if (!quiet) { say(`${colNames[col]}.` + (active >= 0 ? ` ${rows[active].label}: ${rows[active].data[col]?.textContent.trim()}` : '')); root.dispatchEvent(new CustomEvent('denarii:change', { detail: { column: col, name: colNames[col] } })); }
  }

  let sayT = 0;
  function say(t) { clearTimeout(sayT); sayT = setTimeout(() => { live.textContent = t; }, 60); }

  function setActive(ri, announce) {
    if (ri === active) return;
    active = ri;
    root.classList.toggle('dn-has-active', ri >= 0);
    rows.forEach((r, i) => r.tr.classList.toggle('dn-active', i === ri));
    if (ri >= 0) {
      if (announce) say(`${rows[ri].label}: ${rows[ri].data[col]?.textContent.trim()}`);
      root.dispatchEvent(new CustomEvent('denarii:select', { detail: { row: ri, label: rows[ri].label, value: rows[ri].values[col], column: col } }));
    }
  }

  // --- reading: hover a coin for the running count; tap a coin to turn it over ---
  let lifted = null;
  function showTip(img) {
    if (lifted !== img) { lifted?.classList.remove('dn-lift'); lifted = img; img?.classList.add('dn-lift'); }
    if (!img) { tip.classList.remove('dn-tip-on'); return; }
    const slot = +img.dataset.slot; const u = geom.cols[col].u;
    const upto = img.dataset.kind === 'h' ? slot * u + u / 2 : (slot + 1) * u;
    const v = rows[+img.dataset.row].values[col];
    tip.textContent = `${withUnit(upto)} of ${rows[+img.dataset.row].data[col]?.textContent.trim() ?? fmt(v)}`;
    const r = img.getBoundingClientRect(); const rr = root.getBoundingClientRect();
    // above the lifted coin (offsetHeight is its size on the cloth; lifted it is 1.42 times that)
    tip.style.left = `${r.left + r.width / 2 - rr.left}px`; tip.style.top = `${r.top + r.height / 2 - rr.top - img.offsetHeight * 0.71 - 2}px`;
    tip.classList.add('dn-tip-on');
  }

  function turn(img) {
    if (img._turning) return;
    const to = img.dataset.face === 'obv' ? 'rev' : 'obv';
    const url = new URL('coins/' + img._coin[to], new URL('.', o.src)).href;
    const swap = () => { img.dataset.face = to; img.src = url; place(img, +img.dataset.slot, geom.cols[col].D); };
    if (reduce.matches || !img.animate) { swap(); return; }
    img._turning = true;
    const pre = new Image(); pre.src = url;
    const a = img.animate([{ transform: 'translate(-50%,-50%) perspective(500px) rotateY(0deg)' }, { transform: 'translate(-50%,calc(-50% - 3px)) perspective(500px) rotateY(90deg)' }], { duration: 170, easing: 'cubic-bezier(.5,0,.9,.6)' });
    a.finished.then(() => (pre.decode ? pre.decode().catch(() => {}) : 0)).then(() => {
      swap();
      return img.animate([{ transform: 'translate(-50%,calc(-50% - 3px)) perspective(500px) rotateY(-90deg)' }, { transform: 'translate(-50%,-50%) perspective(500px) rotateY(0deg)' }], { duration: 260, easing: 'cubic-bezier(.15,.5,.3,1)' }).finished;
    }).catch(() => {}).finally(() => { img._turning = false; });
  }

  const rowOf = (el) => { const tr = el?.closest?.('tr'); return rows.findIndex((r) => r.tr === tr); };
  on(table, 'pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const ri = rowOf(e.target); setActive(ri, false);
    showTip(e.target.classList?.contains('dn-coin') ? e.target : null);
  });
  on(table, 'pointerleave', (e) => { if (e.pointerType === 'touch') return; setActive(-1); showTip(null); });
  on(table, 'click', (e) => {
    const img = e.target.closest?.('.dn-coin');
    const ri = rowOf(e.target);
    if (ri >= 0) setActive(ri, true);
    if (img) { turn(img); showTip(img); }
  });
  on(document, 'pointerdown', (e) => { if (e.pointerType === 'touch' && !root.contains(e.target)) { setActive(-1); showTip(null); } });

  // keys: the table is one tab stop; up/down read rows, left/right change column, Enter turns the row's coins over
  table.tabIndex = 0; table.classList.add('dn-focusable');
  on(table, 'keydown', (e) => {
    let ri = active;
    if (e.key === 'ArrowDown') ri = Math.min(rows.length - 1, ri + 1);
    else if (e.key === 'ArrowUp') ri = Math.max(0, ri < 0 ? 0 : ri - 1);
    else if (e.key === 'Home') ri = 0;
    else if (e.key === 'End') ri = rows.length - 1;
    else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && ncol > 1) { e.preventDefault(); show(col + (e.key === 'ArrowRight' ? 1 : -1)); return; }
    else if ((e.key === 'Enter' || e.key === ' ') && active >= 0) { e.preventDefault(); lanes[active].pieces.forEach((img, id) => setTimeout(() => turn(img), (+img.dataset.slot) * 40)); return; }
    else return;
    e.preventDefault(); setActive(ri, true);
  });
  on(table, 'focus', () => { if (active < 0) setActive(0, true); });
  on(table, 'blur', () => { setActive(-1); showTip(null); });

  // --- start ---
  rows.forEach((r) => r.data.forEach((d, i) => d.classList.toggle('dn-cur', i === col)));

  const clothUrl = new URL(CLOTH, HERE).href;
  const clothReady = useCloth ? fetch(clothUrl.replace(/\.webp$/, '.json')).then((r) => r.json()).then((g) => {
    clothGeo = g; clothImg.src = clothUrl; return clothImg.decode ? clothImg.decode().catch(() => {}) : 0;
  }).catch(() => { clothGeo = null; }) : Promise.resolve();
  Promise.all([loadPool(o.src), clothReady]).then(([data]) => {
    if (ac.signal.aborted) return;
    pool = data.coins; pxmm = data.px_per_mm || 8;
    const rnd = mulberry(seedOf());
    deck = shuffle(pool.filter((c) => c.kind === 'denarius'), rnd);
    halves = shuffle(pool.filter((c) => c.kind === 'quinarius'), rnd);
    root.classList.add('dn-on'); if (useCloth && clothGeo) root.classList.add('dn-clothed'); built = true;
    const narrow = () => root.classList.toggle('dn-stack', root.getBoundingClientRect().width <= 640);
    narrow(); layout('none');
    // fetch the coins this chart needs before it is counted out
    const need = new Set(); rows.forEach((r, ri) => { const n = r.values[col] == null ? 0 : count(r.values[col], geom.cols[col].u).slots; for (let i = 0; i < n; i++) need.add(coinFor(ri, i)); });
    const pre = [...need].map((c) => { const im = new Image(); im.src = new URL('coins/' + c.obv, new URL('.', o.src)).href; return im.decode ? im.decode().catch(() => {}) : Promise.resolve(); });
    const ready = Promise.race([Promise.all(pre), new Promise((r) => setTimeout(r, 2500))]);
    const arrive = () => ready.then(() => { if (shown || ac.signal.aborted) return; shown = true; root.classList.add('dn-shown'); layout(reduce.matches ? 'none' : 'count'); });
    if ('IntersectionObserver' in window && !reduce.matches) {
      io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); arrive(); } }, { threshold: 0.2 });
      io.observe(root);
    } else arrive();
    let lastW = 0;
    ro = new ResizeObserver(() => { const w = root.getBoundingClientRect().width; if (!built || Math.abs(w - lastW) < 0.5) return; lastW = w; narrow(); layout('none'); });
    ro.observe(root);
  }).catch((err) => { console.warn(err.message || err); });

  const destroy = () => {
    ac.abort(); io?.disconnect(); ro?.disconnect(); clearTimeout(sayT);
    lanes.forEach((L) => L.td.remove()); added.forEach((n) => n.remove());
    rows.forEach((r) => { r.tr.classList.remove('dn-active'); r.data.forEach((d) => d.classList.remove('dn-cur')); });
    table.removeAttribute('tabindex'); table.classList.remove('dn-focusable');
    root.classList.remove('dn-on', 'dn-shown', 'dn-has-active', 'dn-titled', 'dn-clothed', 'dn-stack');
    ['--dn-d', '--dn-keypad', '--dn-band', '--dn-above', '--dn-below'].forEach((p) => root.style.removeProperty(p));
  };
  return Object.assign(destroy, {
    show: (c) => show(c),
    recount: () => { if (!built) return; lanes.forEach((L) => { L.pieces.forEach((img) => img.remove()); L.pieces.clear(); L.valX = 0; }); shown = true; rows.forEach((_, ri) => render(ri, reduce.matches ? 'none' : 'count')); },
    select: (ri) => setActive(ri, true),
    turn: (ri, slot) => { const img = [...(lanes[ri]?.pieces.values() || [])].find((im) => +im.dataset.slot === slot); if (img) turn(img); },
  }) && Object.defineProperties(destroy, {
    column: { get: () => col },
    unit: { get: () => geom?.cols[col].u },
  });
}

if (typeof document !== 'undefined') {
  const boot = () => document.querySelectorAll('[data-denarii]').forEach((el) => { if (!el._denarii) el._denarii = denarii(el); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
}
