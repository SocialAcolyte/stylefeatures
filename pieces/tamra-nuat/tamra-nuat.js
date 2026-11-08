/* tamra-nuat — an accordion that is a Thai folding book.
   A group of real <details>/<summary> sections. The picture is a samut khoi, a concertina of one long strip of khoi
   paper: the Wellcome Collection's Tamra nuat (MS Thai 801), a nineteenth-century manual of massage, photographed
   panel by panel. Each section is one opening of the book, in the book's order, on one of its drawn figures, folded
   into pleats while it is closed and laid flat when it is open. Each pleat is two rigid panels turning on their creases
   (one fold at a time, top first when opening, bottom first when closing); the section's text is written by pretext
   into the free paper round the figure, measured from the photographs.

   Geometry and free space: assets/tamra-nuat.json (tools/cut.py). Prefix .tn-

   Layout, wide: the questions (the summaries) stand in a column to the left of the book, each at its section's first
   crease; the book stands to the right, the front board above, the back board and the closed stack below. A closed
   section's pleats are folded to exactly the height of its question, so the column and the book stay in step.
   Narrow: each question stands above its own pleats, and the answer is set in the page's type under its opening. */

const HERE = new URL('.', import.meta.url).href;
const DEF = { src: null, assets: null, fold: 26 };          // fold: the crease's spring, rad/s (critically damped)
const THAI = ['๑', '๒', '๓', '๔', '๕', '๖', '๗', '๘', '๙', '๑๐', '๑๑', '๑๒'];
const STEP = 1 / 240;                                          // fixed physics step
const cache = new Map();

export function tamraNuat(root, opts = {}) {
  const o = { ...DEF, ...readData(root), ...opts };
  const assets = o.assets ? new URL(o.assets, location.href).href : HERE + 'assets/';
  const src = o.src ? new URL(o.src, location.href).href : assets + 'tamra-nuat.json';
  const items = [...root.querySelectorAll(':scope > details')];
  if (!items.length) return Object.assign(() => {}, { open() {}, close() {} });

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const off = [];
  const on = (el, ev, fn, opt) => { el.addEventListener(ev, fn, opt); off.push(() => el.removeEventListener(ev, fn, opt)); };
  let geo = null, api = null, book = null, live = null, raf = 0, last = 0, acc = 0, dead = false, width = 0;
  let L = null;                                                // the current layout (sections, panels, sizes)

  // the real control's parts: summary, answer; numbered in the book's numerals
  const secs = items.map((d, i) => {
    const sum = d.querySelector(':scope > summary');
    const ans = [...d.children].filter((c) => c !== sum);
    const q = sum ? sum.textContent.replace(/\s+/g, ' ').trim() : '';
    if (sum && !sum.querySelector('.tn-n')) {
      const n = document.createElement('span');
      n.className = 'tn-n'; n.setAttribute('aria-hidden', 'true'); n.textContent = THAI[i] || String(i + 1);
      sum.prepend(n);
    }
    return { d, sum, ans, q, tents: [], open: d.open };
  });

  live = document.createElement('p');
  live.className = 'tn-live'; live.setAttribute('role', 'status');
  root.appendChild(live);

  const ready = Promise.all([
    load(src),
    import('./vendor/pretext/layout.js'),
  ]).then(async ([g, mod]) => {
    geo = g; api = mod;
    await fonts(root);
    if (dead) return;
    root.classList.add('tn-on');
    build();
    layout();
    for (const s of secs) on(s.d, 'toggle', () => toggled(s));
    const ro = new ResizeObserver(() => { if (Math.abs(root.clientWidth - width) > 0.5) layout(); });
    ro.observe(root); off.push(() => ro.disconnect());
    on(reduced, 'change', () => settleAll());
  }).catch((e) => { console.warn('tamra-nuat:', e); });

  /* ─── the book's parts (aria-hidden: the details are the control) ───────────────────────────────── */
  function build() {
    book = document.createElement('div');
    book.className = 'tn-book'; book.setAttribute('aria-hidden', 'true');
    const cover = img('cover'); cover.className = 'tn-cover';
    const back = img('back'); back.className = 'tn-board';
    const edge = document.createElement('div'); edge.className = 'tn-edge';
    const ei = document.createElement('img'); ei.src = assets + 'edge.webp'; ei.alt = ''; ei.decoding = 'async'; ei.draggable = false;
    edge.appendChild(ei);
    book.append(cover, back, edge);
    root.appendChild(book);
    const hot = (si, v) => { const s = secs[si]; if (!s || s.hot === v) return; s.hot = v; s.d.classList.toggle('tn-hot', v); render(); };
    on(book, 'pointerover', (e) => { const p = e.target.closest('.tn-p'); if (p) hot(+p.dataset.s, true); });
    on(book, 'pointerout', (e) => {
      const p = e.target.closest('.tn-p'), to = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.tn-p');
      if (p && (!to || to.dataset.s !== p.dataset.s)) hot(+p.dataset.s, false);
    });
    secs.forEach((s, i) => {
      on(s.sum, 'click', () => { s.byHand = true; });
      on(s.sum, 'keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') s.byHand = true; });
      on(s.sum, 'pointerenter', () => hot(i, true));
      on(s.sum, 'pointerleave', () => hot(i, false));
    });
    on(book, 'click', (e) => {
      const p = e.target.closest('.tn-p');
      if (!p || !L) return;
      const s = secs[+p.dataset.s];
      s.byHand = true;
      s.d.open = !s.d.open;                         // the toggle event does the rest
    });
  }
  function img(name, el) {
    const im = el || document.createElement('img');
    im.src = assets + name + '-s.webp';
    im.srcset = `${assets}${name}-s.webp 680w, ${assets}${name}.webp 1240w`;
    im.alt = ''; im.decoding = 'async'; im.draggable = false;
    return im;
  }

  /* ─── layout: sizes, which panels each section takes, the writing ───────────────────────────────── */
  // Wide: the questions in a column, the book beside them, each answer written into its opening. Narrow (under 620 px):
  // each question above its own pleats, the book the full width, the answer in the page's type under its opening
  // (a figure leaves too little paper beside it at that width).
  function layout() {
    if (!geo || !book) return;
    width = root.clientWidth;
    const cs = getComputedStyle(root);
    const narrow = width < 620;
    const BW = Math.round(narrow ? width : Math.min(660, width * 0.6));
    const gap = narrow ? 0 : Math.round(Math.min(48, width * 0.04));
    const QW = narrow ? width : width - BW - gap;
    root.classList.toggle('tn-narrow', narrow);
    root.style.setProperty('--tn-bw', BW + 'px');
    root.style.setProperty('--tn-qw', QW + 'px');
    root.style.setProperty('--tn-gap', gap + 'px');
    const font = { family: cs.getPropertyValue('--tn-font').trim() || '"EB Garamond", Georgia, serif', weight: 400 };
    const ink = geo.ink;
    root.style.setProperty('--tn-ink', `rgb(${ink[0]},${ink[1]},${ink[2]})`);

    const P = geo.panels.map((p) => ({ ...p, H: (BW * p.h) / p.w }));
    const at = new Map(P.map((p, i) => [p.id, i]));
    const sections = [];
    let blank = 0;
    const blanks = (geo.blanks || []).map((id) => at.get(id));
    secs.forEach((s, si) => {
      const op = (geo.openings || [])[si];
      let ids = [];
      if (op) for (let k = at.get(op[0]); k <= at.get(op[1]); k++) ids.push(k);
      const plan = { ids, lines: [], fs: 0, drawn: false };
      if (!narrow) {
        if (ids.length) Object.assign(plan, writeSection(s, ids, P, BW, font));
        else {
          // a section past the book's six openings: blank panels, two at a time, as many as its text needs
          for (let n = 2; blank + n <= blanks.length; n += 2) {
            const r = writeSection(s, blanks.slice(blank, blank + n), P, BW, font);
            if (r.drawn || blank + n + 2 > blanks.length) { Object.assign(plan, r, { ids: blanks.slice(blank, blank + n) }); break; }
          }
          blank += plan.ids.length;
        }
      } else if (!ids.length) { plan.ids = blanks.slice(blank, blank + 2); blank += 2; }
      sections.push(plan);
    });
    L = { BW, QW, gap, narrow, P, sections };

    // the boards and the stack
    L.coverH = (BW * geo.cover.h) / geo.cover.w;
    L.backH = (BW * geo.back.h) / geo.back.w;
    const lastP = P[Math.max(...sections.flatMap((x) => x.ids))];
    const left = Math.max(0, geo.edge.folds - (lastP ? lastP.n : 0)) / geo.edge.folds;   // still folded under the back board
    L.edgeH = ((BW * geo.edge.h) / geo.edge.w) * left;
    L.edgeLook = 0.32;                                                       // its face, seen from the reader's side
    L.depth = 14 * (P.reduce((a, p) => a + p.H, 0) / P.length);             // the eye's distance (perspective)
    const crease = geo.crease, prof = crease.profile;
    let fw = 0; const min = Math.min(...prof);
    for (const v of prof) if (v <= min / 2) fw++;
    L.creaseW = Math.max(1.5, (fw * crease.step * BW) / crease.scale);       // the fold's line, in display px
    L.creaseD = -min / 210;                                                  // how dark, against the paper (~210)

    draw();
    for (const s of secs) {
      s.Hs = narrow ? 26 : Math.max(s.sum.getBoundingClientRect().height, 30);
      closeTo(s, s.Hs);
      for (const t of s.tents) { t.v = 0; t.u = s.d.open ? 1 : 0; t.target = t.u; }
      s.open = s.d.open;
    }
    root.style.setProperty('--tn-top', L.coverH + 'px');
    root.style.setProperty('--tn-bottom', L.backH + L.edgeH * L.edgeLook + 'px');
    render();
  }

  function textOf(s) {
    const ps = [];
    for (const el of s.ans) {
      const blocks = el.matches('p, li, h3, h4') ? [el] : [...el.querySelectorAll('p, li, h3, h4')];
      if (!blocks.length) blocks.push(el);
      for (const b of blocks) { const t = b.textContent.replace(/\s+/g, ' ').trim(); if (t) ps.push(t); }
    }
    return ps.map((t, k) => (k ? '๏ ' + t : t));            // after the first, a paragraph opens with the book's ๏
  }

  // free runs in a band of a panel: a cell is free only if it is free in every grid row the band covers
  function bandRuns(p, BW, y0, y1) {
    const [gw, gh] = p.grid;
    const q = BW / p.w, pad = p.pad * q, cw = (BW - 2 * pad) / gw, ch = p.H / gh;
    const r0 = Math.max(0, Math.floor(y0 / ch)), r1 = Math.min(gh - 1, Math.ceil(y1 / ch) - 1);
    if (r1 < r0) return [];
    let runs = p.free[r0].map((r) => r.slice());
    for (let r = r0 + 1; r <= r1 && runs.length; r++) {
      const next = [];
      for (const [a, b] of runs) for (const [c, d] of p.free[r]) { const s = Math.max(a, c), e = Math.min(b, d); if (e - s >= 1) next.push([s, e]); }
      runs = next;
    }
    return runs.map(([a, b]) => ({ x: pad + a * cw, w: (b - a) * cw }));
  }

  // Write a section's answer into its opening, at the largest comfortable size that fits (17 down to 13.5 px).
  // The opening is read as one surface, top to bottom: where the drawing leaves columns of paper (beside a figure's
  // legs, between its labels) the text goes down each column in turn, left to right; where a panel is blank it runs
  // in one column with one left edge. When the opening has no blank panel, the columns are balanced (the fewest lines a
  // column that still fits) so that the text sits round the figure rather than down one side of it.
  function writeSection(s, ids, P, BW, font) {
    const paras = textOf(s);
    const at = new Map();
    // blank paper is used from the top down (the writing follows the drawing); columns beside a drawing, widest first
    const score = (b) => (b.full ? 1e12 - b.top * 1e6 : (b.area * b.area) / b.rows.length);
    const tryAt = (fs) => {
      if (!at.has(fs)) {
        const lh = Math.round(fs * 1.32 * 10) / 10;
        const spec = `${font.weight} ${fs}px ${font.family}`;
        const surf = surface(ids, P, BW, fs, lh);
        at.set(fs, { lh, surf, prepared: paras.map((t) => api.prepareWithSegments(t, spec)),
          bySize: surf.blocks.slice().sort((a, c) => score(c) - score(a)) });
      }
      return at.get(fs);
    };
    // As few blocks as will hold the answer, the largest (and widest) first, read in the page's order: text in one or
    // two good columns of paper reads better than text scattered into every gap between the labels. Fewer blocks win
    // over a larger size, down to 15 px; below that, the size gives way first.
    const attempt = (fs, n) => {
      const T = tryAt(fs);
      if (n > T.bySize.length) return null;
      const use = new Set(T.bySize.slice(0, n));
      const sub = { blocks: T.surf.blocks.filter((b) => use.has(b)) };
      sub.hasFull = sub.blocks.some((b) => b.full);
      const go = (cap) => fill(sub, T.prepared, cap, BW, fs);
      let r = go(1e9);
      if (!r.done) return null;
      if (!sub.hasFull) {
        let lo = 1, hi = 60;
        while (lo < hi) { const m = (lo + hi) >> 1; if (go(m).done) hi = m; else lo = m + 1; }
        r = go(lo);
      }
      return { ids, lines: r.lines, fs, lh: T.lh, drawn: true };
    };
    for (const sizes of [[17, 16.5, 16, 15.5, 15], [14.5, 14, 13.5]])
      for (let n = 1; n <= 8; n++) for (const fs of sizes) { const r = attempt(fs, n); if (r) return r; }
    return { ids, lines: [], fs: 0, drawn: false };
  }

  // The opening's free paper as blocks: a band is one line high, panel by panel; a run of free paper in a band joins
  // the block above it when the two overlap by most of their width, so a block is a column of paper beside a drawing
  // (or a blank panel). Blocks under three lines (the slots between labels) are left alone. Each block gets one
  // straight left edge (the furthest in of its runs) and a ragged right that follows the drawing. Blocks are read top
  // to bottom; two that stand side by side are read left, then right.
  function surface(ids, P, BW, fs, lh) {
    const minCol = Math.max(fs * 6.2, BW * 0.15);
    const bands = [];
    for (const k of ids) {
      const p = P[k];
      let y0 = -1;
      for (let y = 0; y + lh <= p.H; y += 1) if (bandRuns(p, BW, y, y + lh).some((r) => r.w >= minCol)) { y0 = y; break; }
      if (y0 < 0) continue;
      for (let y = y0; y + lh <= p.H; y += lh) bands.push({ k, y, runs: bandRuns(p, BW, y, y + lh).filter((r) => r.w >= minCol) });
    }
    const blocks = [];
    let open = [];
    bands.forEach((b, bi) => {
      const next = [];
      for (const r of b.runs) {
        const blk = open.find((o) => { const q = o.rows[o.rows.length - 1].r; const ov = Math.min(q.x + q.w, r.x + r.w) - Math.max(q.x, r.x); return ov >= 0.6 * Math.max(q.w, r.w); });
        const into = blk || { rows: [], top: bi };
        if (!blk) blocks.push(into);
        into.rows.push({ k: b.k, y: b.y, r, bi });
        next.push(into);
      }
      open = next;
    });
    for (const o of blocks) {
      o.x0 = Math.max(...o.rows.map((w) => w.r.x));
      o.area = o.rows.reduce((a, w) => a + (w.r.x + w.r.w - o.x0), 0);
    }
    const keep = blocks.filter((o) => (o.rows.length >= 3 && o.area / o.rows.length >= BW * 0.18) ||
      (o.rows.length >= 2 && o.rows.every((w) => w.r.w >= BW * 0.55)));
    for (const o of keep) {
      o.end = o.rows[o.rows.length - 1].bi;
      o.full = o.rows.filter((w) => w.r.w >= BW * 0.55).length > o.rows.length / 2;
    }
    // reading order: by top, except that blocks standing side by side go left to right
    const ordered = [];
    for (const o of keep.sort((a, c) => a.top - c.top)) {
      let at = ordered.length;
      for (let i = 0; i < ordered.length; i++) {
        const q = ordered[i];
        const ov = Math.min(q.end, o.end) - Math.max(q.top, o.top) + 1;
        if (ov >= 0.5 * Math.min(q.end - q.top + 1, o.end - o.top + 1) && o.x0 < q.x0) { at = i; break; }
      }
      ordered.splice(at, 0, o);
    }
    return { blocks: ordered, hasFull: ordered.some((o) => o.full) };
  }

  function fill(surf, prepared, cap, BW, fs) {
    const paras = prepared.map((P) => ({ P, cur: { segmentIndex: 0, graphemeIndex: 0 } }));
    const lines = [];
    let pi = 0;
    const inset = Math.min(10, BW * 0.012), minW = fs * 6.2;
    const put = (k, x, w, y) => {
      while (pi < paras.length) {
        const para = paras[pi];
        const ln = api.layoutNextLine(para.P, para.cur, w - 2 * inset);
        if (!ln) { pi++; continue; }
        lines.push({ k, x: x + inset, y, text: ln.text.trimEnd() });
        para.cur = ln.end;
        if (!api.layoutNextLine(para.P, para.cur, 1e6)) pi++;        // a paragraph ends its line
        return true;
      }
      return false;
    };
    for (const o of surf.blocks) {
      let n = 0;
      for (const w of o.rows) {
        if (pi >= paras.length || n >= cap) break;
        const width = w.r.x + w.r.w - o.x0;
        if (width >= minW && put(w.k, o.x0, width, w.y)) n++;
      }
    }
    return { lines, done: pi >= paras.length };
  }

  /* ─── the panels on the page ────────────────────────────────────────────────────────────────────── */
  function draw() {
    for (const el of book.querySelectorAll('.tn-p')) el.remove();
    L.sections.forEach((sec, si) => {
      const s = secs[si];
      s.panels = [];
      sec.ids.forEach((k, j) => {
        const p = L.P[k];
        const el = document.createElement('div');
        el.className = 'tn-p'; el.dataset.s = si;
        el.style.height = p.H + 'px';
        const im = img('p/' + p.id);
        const tx = document.createElement('div'); tx.className = 'tn-tx';
        if (sec.drawn) { tx.style.fontSize = sec.fs + 'px'; tx.style.lineHeight = sec.lh + 'px'; }
        for (const ln of sec.lines) if (ln.k === k) {
          const sp = document.createElement('span'); sp.className = 'tn-l';
          sp.style.left = ln.x + 'px'; sp.style.top = ln.y + 'px'; sp.textContent = ln.text;
          tx.appendChild(sp);
        }
        const cr = document.createElement('div'); cr.className = 'tn-cr';
        el.append(im, tx, cr);
        book.insertBefore(el, book.querySelector('.tn-board'));
        s.panels.push({ el, tx, H: p.H, cr, odd: j % 2 === 1 });
      });
      s.tents = [];
      for (let t = 0; t < s.panels.length; t += 2) s.tents.push({ e: s.panels[t], o: s.panels[t + 1], u: 1, v: 0, target: 1, F1: 1, Fc: 1 });
      // the section's real text stays in the page for readers; drawn in the book, it is not shown twice
      s.d.classList.toggle('tn-drawn', !!sec.drawn);
      // narrow: the pleats' room is inside the summary (a closed <details> renders only its summary), so a tap on them opens it
      if (!s.room) { s.room = document.createElement('span'); s.room.className = 'tn-room'; s.room.setAttribute('aria-hidden', 'true'); s.sum.appendChild(s.room); }
    });
  }

  // A pleat is two panels of one height h joined at a ridge, their outer creases on the table F apart (its
  // footprint): each stands at acos(F / 2h) and the ridge is h·sin of that above the table. Flat, F = 2h. u runs from
  // 0 (folded as far as the section's question is tall) to 1 (flat).
  function pleat(t, u) {
    const F = t.Fc + (t.F1 - t.Fc) * u;
    const a = Math.acos(Math.min(1, F / (t.F1)));
    return { F, a };
  }
  function sectionH(s) { let h = 0; for (const t of s.tents) h += pleat(t, t.u).F; return h; }
  // folded: the section's pleats share its question's height in proportion to their length
  function closeTo(s, Hs) {
    const sum = s.tents.reduce((a, t) => a + (t.e.H + (t.o ? t.o.H : 0)), 0);
    for (const t of s.tents) { t.F1 = t.e.H + (t.o ? t.o.H : 0); t.Fc = Math.max(2, (Hs * t.F1) / sum); }
  }

  // light: diffuse room light plus a lamp above the top of the page, normalised so a flat panel is its photograph
  const AMB = 0.72, LAMP = (35 * Math.PI) / 180;
  const lit = (n) => (AMB + (1 - AMB) * Math.max(0, n)) / (AMB + (1 - AMB) * Math.cos(LAMP));

  function render() {
    if (!L) return;
    const D = L.depth.toFixed(0);
    let y = L.coverH;
    const heights = secs.map((s) => sectionH(s));
    if (L.narrow) {
      secs.forEach((s, i) => { s.d.style.height = ''; s.room.style.height = heights[i].toFixed(2) + 'px'; });
    } else {
      secs.forEach((s, i) => { s.d.style.height = Math.max(heights[i], s.Hs || 0) + 'px'; if (s.room) s.room.style.height = '0px'; });
    }
    const rootTop = L.narrow ? root.getBoundingClientRect().top : 0;
    secs.forEach((s, i) => {
      if (L.narrow) y = s.room.getBoundingClientRect().top - rootTop;
      const lift = s.hot ? 1.05 : 1;                    // under the pointer the paper catches a little more light
      for (const t of s.tents) {
        const { F, a } = pleat(t, t.u);
        const e = t.e.el;
        e.style.transformOrigin = '50% 0';
        e.style.transform = `translate3d(0,${y.toFixed(2)}px,0) perspective(${D}px) rotateX(${a.toFixed(4)}rad)`;
        face(t.e, lit(Math.cos(a - LAMP)) * lift, Math.sin(a), 'top');
        // the writing is ours, not the book's: it is on the paper while the pleat lies open, and lifts as it folds
        const ink = Math.min(1, Math.max(0, (t.u - 0.6) / 0.35)).toFixed(3);
        t.e.tx.style.opacity = ink; if (t.o) t.o.tx.style.opacity = ink;
        if (t.o) {
          // the odd panel turns about its bottom crease; drawn from the pleat's top so both share one eye
          const oe = t.o.el;
          oe.style.transformOrigin = '50% 0';
          oe.style.transform = `translate3d(0,${y.toFixed(2)}px,0) perspective(${D}px) translateY(${F.toFixed(2)}px) rotateX(${(-a).toFixed(4)}rad) translateY(${(-t.o.H).toFixed(2)}px)`;
          face(t.o, lit(Math.cos(a + LAMP)) * lift, Math.sin(a), 'bottom');
        }
        y += F;
      }
      if (!L.narrow && heights[i] < (s.Hs || 0)) y += s.Hs - heights[i];   // never shorter than its question
    });
    if (L.narrow) { const lastD = secs[secs.length - 1].d; y = lastD.getBoundingClientRect().bottom - rootTop + 12; }
    const board = book.querySelector('.tn-board');
    board.style.transform = `translate3d(0,${y.toFixed(2)}px,0)`;
    const edge = book.querySelector('.tn-edge');
    edge.style.transform = `translate3d(0,${(y + L.backH).toFixed(2)}px,0)`;
    edge.style.height = (L.edgeH * L.edgeLook).toFixed(2) + 'px';
    edge.firstChild.style.transform = `scaleY(${L.edgeLook})`;
    book.style.height = y + L.backH + L.edgeH * L.edgeLook + 'px';
  }

  // a face's light, and the measured crease line deepening at its fold as the fold closes
  function face(p, light, fold, side) {
    p.el.style.filter = Math.abs(light - 1) < 0.002 ? '' : `brightness(${light.toFixed(3)})`;
    const w = L.creaseW * (1 + 6 * fold);
    p.cr.style.height = w.toFixed(1) + 'px';
    p.cr.style.top = side === 'top' ? '0' : 'auto';
    p.cr.style.bottom = side === 'top' ? 'auto' : '0';
    p.cr.style.background = `linear-gradient(${side === 'top' ? 180 : 0}deg, rgba(40,26,14,${(L.creaseD * 1.6 * fold).toFixed(3)}), rgba(40,26,14,0))`;
  }

  /* ─── motion: one fold at a time ────────────────────────────────────────────────────────────────── */
  function toggled(s) {
    s.open = s.d.open;
    live.textContent = (s.open ? 'Unfolded: ' : 'Folded: ') + s.q;
    if (s.open && s.byHand) reveal(s);
    s.byHand = false;
    if (reduced.matches) { settle(s); render(); return; }
    kick();
  }
  // Opened by hand: if the opening, once flat, would not be in view, the page is carried so that its figure stands in
  // the middle of the window as the pleats lay flat (never past the question).
  function reveal(s) {
    const flat = s.tents.reduce((a, t) => a + t.F1, 0);
    const q = s.sum.getBoundingClientRect();
    const top = L.narrow ? q.bottom : q.top;
    if (top >= 0 && top + flat <= innerHeight) return;
    const want = top + flat / 2 - innerHeight / 2;
    const dy = Math.min(want, q.top - 16);
    if (Math.abs(dy) > 4) scrollBy({ top: dy, behavior: reduced.matches ? 'auto' : 'smooth' });
  }
  function targets(s) {
    const n = s.tents.length;
    for (let t = 0; t < n; t++) {
      const T = s.tents[t];
      // opening runs from the top, a pleat starting once the one above is most of the way flat; closing from the bottom
      if (s.open) { if (T.target !== 1 && (t === 0 || s.tents[t - 1].u >= 0.7)) T.target = 1; }
      else if (T.target !== 0 && (t === n - 1 || s.tents[t + 1].u <= 0.3)) T.target = 0;
    }
  }
  function settle(s) { for (const t of s.tents) { t.u = t.target = s.open ? 1 : 0; t.v = 0; } }
  function settleAll() { for (const s of secs) settle(s); render(); }
  function kick() { if (!raf) { last = performance.now(); acc = 0; raf = requestAnimationFrame(tick); } }
  function tick(now) {
    raf = 0;
    acc += Math.min(0.05, (now - last) / 1000); last = now;
    const w = o.fold;
    while (acc >= STEP) {
      acc -= STEP;
      for (const s of secs) {
        targets(s);
        for (const t of s.tents) {
          const f = w * w * (t.target - t.u) - 2 * w * t.v;      // a critically damped spring on the crease
          t.v += f * STEP; t.u += t.v * STEP;
          if (t.u > 1) { t.u = 1; t.v = 0; }                     // flat on the table, never through it
          if (t.u < 0) { t.u = 0; t.v = 0; }
        }
      }
    }
    let moving = false;
    for (const s of secs) {
      const goal = s.open ? 1 : 0;
      for (const t of s.tents) if (t.target !== goal || Math.abs(t.u - goal) > 1e-4 || Math.abs(t.v) > 1e-3) moving = true;
    }
    if (!moving) for (const s of secs) settle(s);
    render();
    if (moving) raf = requestAnimationFrame(tick);
  }

  /* ─── the handle ────────────────────────────────────────────────────────────────────────────────── */
  const destroy = () => {
    dead = true;
    cancelAnimationFrame(raf);
    off.forEach((f) => f());
    if (book) book.remove();
    live.remove();
    root.classList.remove('tn-on');
    root.classList.remove('tn-narrow');
    for (const s of secs) { s.d.style.height = ''; s.d.classList.remove('tn-drawn', 'tn-hot'); if (s.room) s.room.remove(); const n = s.sum && s.sum.querySelector('.tn-n'); if (n) n.remove(); }
    for (const p of ['--tn-bw', '--tn-qw', '--tn-gap', '--tn-top', '--tn-bottom', '--tn-ink']) root.style.removeProperty(p);
  };
  destroy.ready = ready;
  destroy.open = (i) => { if (secs[i]) secs[i].d.open = true; };
  destroy.close = (i) => { if (secs[i]) secs[i].d.open = false; };
  destroy.toggle = (i) => { if (secs[i]) secs[i].d.open = !secs[i].d.open; };
  // stills: hold section i part-way, u from 0 (folded) to 1 (flat), the pleats going flat one after another
  destroy.pose = (i, u) => {
    const s = secs[i]; if (!s || !L) return;
    const n = s.tents.length;
    s.tents.forEach((t, k) => { t.u = t.target = Math.min(1, Math.max(0, u * n - k)); t.v = 0; });
    render();
  };
  destroy.layout = () => layout();
  Object.defineProperty(destroy, 'sections', { get: () => (L ? L.sections.map((x) => ({ panels: x.ids.map((k) => L.P[k].id), lines: x.lines.length, fs: x.fs, drawn: x.drawn })) : []) });
  return destroy;
}

function readData(el) {
  const d = el.dataset, o = {};
  if (d.src) o.src = d.src;
  if (d.assets) o.assets = d.assets;
  if (d.fold) o.fold = +d.fold;
  return o;
}

function load(url) {
  if (!cache.has(url)) cache.set(url, fetch(url).then((r) => { if (!r.ok) throw new Error(r.status + ' ' + url); return r.json(); }));
  return cache.get(url);
}

async function fonts(root) {
  if (!document.fonts) return;
  const fam = getComputedStyle(root).getPropertyValue('--tn-font').trim() || '"EB Garamond"';
  try {
    await Promise.race([
      Promise.all([document.fonts.load(`400 16px ${fam}`, 'Aa'), document.fonts.load(`400 16px ${fam}`, '\u0E4F')]),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch { }
  try { await document.fonts.ready; } catch { }
}

// auto-start
if (typeof document !== 'undefined') {
  const boot = () => document.querySelectorAll('[data-tamra-nuat]').forEach((el) => { if (!el._tn) el._tn = tamraNuat(el); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
}
