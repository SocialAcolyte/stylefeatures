/*
 *  CANON-TABLES // a comparison table set in a run of painted canon pages.
 *
 *  Markup:  <figure class="cn" data-canon-tables>
 *             <table>
 *               <caption>Canon I</caption>
 *               <thead><tr><td></td><th scope="col">Matthew</th><th scope="col">Mark</th>…</tr></thead>
 *               <tbody>
 *                 <tr><th scope="row">The place</th>
 *                     <td><b>14.13</b> He departed thence…<span data-more> and the rest of the passage</span></td>…</tr>
 *               </tbody>
 *             </table>
 *           </figure>
 *  Or call canonTables(figure, options) yourself; it returns destroy().
 *
 *  Gospel books open with the canon tables of Eusebius: the four Gospels in
 *  columns under painted arches, so that one passage can be found in every
 *  Gospel by reading across a row. They run over several pages (Canon I, II…),
 *  each page an arcade painted once, at its own proportions. This is the same
 *  thing for any comparison: two to five columns of a real <table>, set in the
 *  canon pages of a Carolingian Gospel book (Metz, ca. 825-50; Met 2015.560),
 *  assembled from its arches, capitals, shafts and bases.
 *
 *  The text is set in the architecture, not over it. Cheng Lou's pretext
 *  (vendor/pretext, MIT) measures every cell once; then every line is set by
 *  layoutNextLineRange into the run left free between the painted silhouettes
 *  (read from each part's own alpha). The Gospel's name sits up in the crown;
 *  the first row starts inside the lunette, so its lines are short where the
 *  curve closes in. A page holds what its painted shafts hold: the rest of the
 *  table goes on to the next page of the book, and a cell that does not fit
 *  is continued there from the word where it stopped.
 *
 *  It is read and handled:
 *    - scrolling: each row is written in, across every Gospel at once, as it
 *      comes up the page (scrubbed by the scroll, so it goes back with it).
 *    - clicking a row finds its passage in every Gospel: a rubric line is
 *      ruled across it, each cell opens to the whole passage (its data-more),
 *      the other rows of the page close up to their first line, and the page
 *      is scrolled to it if it has moved out of view. Click again, or Escape.
 *    - grab a column (capital, shaft and base) and slide it. It is stone: a
 *      heavy, damped spring behind the hand. The two bays it divides widen and
 *      narrow (each arch rescaled whole about its springing, never stretched),
 *      every line in them is set again every frame, and the rows re-align on
 *      springs. Let go and it settles back to the painter's spacing.
 *    - pick up a Gospel (drag its text, or hold it on a phone) and carry it to
 *      another bay: the others make room on every page, and when it is put
 *      down the real table's columns are reordered too.
 *  Keyboard: the column heads of the real table are one tab stop (left/right
 *  between them, Shift+arrows carries the column, Alt+arrows leans its right
 *  shaft); the row heads another (up/down lights a row, Enter opens it).
 *  Reduced motion: no springs and no writing in; the settled state at once.
 *
 *  The <table> stays in the DOM, visually hidden, for screen readers, find
 *  and print, with every passage whole; the drawing is aria-hidden.
 */

const REF = 100;
const calm = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const HERE = new URL('.', import.meta.url).href;
const START = { segmentIndex: 0, graphemeIndex: 0 };
const END = { end: true, segmentIndex: 1e9, graphemeIndex: 0 };
const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii', 'xiii', 'xiv', 'xv', 'xvi'];
// springs: [angular frequency, damping ratio]. Stone is heavy: it lags the hand
// and comes home without a bounce.
const HOLD = [10, 0.95], HOME = [6, 1], ROWS = [12, 1], SLIDE = [11, 1];
const cmpCur = (a, b) => a.segmentIndex - b.segmentIndex || a.graphemeIndex - b.graphemeIndex;

const manifests = new Map();
function loadManifest(url) {
    if (!manifests.has(url)) manifests.set(url, fetch(url).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }));
    return manifests.get(url);
}
const images = new Map();
function preload(src) {
    if (!images.has(src)) images.set(src, new Promise((ok) => {
        const im = new Image(); im.decoding = 'async';
        im.onload = () => (im.decode ? im.decode().catch(() => {}) : Promise.resolve()).then(() => ok(im));
        im.onerror = () => ok(null);
        im.src = src;
    }));
    return images.get(src);
}
function rng(seed) {
    let t = (seed >>> 0) || 1;
    return () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
}
function spring(st, target, [w, z], dt) {
    const a = w * w * (target - st.x) - 2 * z * w * st.v;
    st.v += a * dt; st.x += st.v * dt;
}

/* ---- reading the table -------------------------------------------------- */
// A cell becomes one string for pretext plus marks (ranges drawn in rubric).
// Only the colour changes inside a cell, so pretext's widths stay exact.
// The short form leaves out [data-more]; the whole passage leaves out [data-less].
function flowOf(el, upper = false, whole = false) {
    const f = { text: '', marks: [] };
    const add = (t) => {
        t = t.replace(/\s+/g, ' ');
        if (!f.text || / $/.test(f.text)) t = t.replace(/^ /, '');
        f.text += upper ? t.toUpperCase() : t;
    };
    const walk = (node) => {
        for (const n of node.childNodes) {
            if (n.nodeType === 3) add(n.nodeValue);
            else if (n.nodeType === 1 && !n.classList.contains('cn-sr')) {
                if (n.tagName === 'BR') { add(' '); continue; }
                if (n.hasAttribute('data-more') && !whole) continue;
                if (n.hasAttribute('data-less') && whole) continue;
                const a = f.text.length;
                walk(n);
                if (n.tagName === 'B' || n.tagName === 'STRONG' || n.hasAttribute('data-rubric')) {
                    let b = f.text.length;
                    while (b > a && f.text[b - 1] === ' ') b--;
                    if (b > a) f.marks.push({ a, b, c: 'cn-rub' });
                }
            }
        }
    };
    walk(el);
    f.text = f.text.replace(/ +$/, '');
    return f;
}
function readTable(table) {
    const body = [...table.tBodies].flatMap((b) => [...b.rows]);
    const headRow = table.tHead ? table.tHead.rows[0] : null;
    const isLabel = (c) => c && c.tagName === 'TH' && (c.scope === 'row' || !c.scope);
    const hasLabels = body.length > 0 && body.every((r) => isLabel(r.cells[0]));
    const skip = hasLabels ? 1 : 0;
    const hskip = headRow && headRow.cells.length > (body[0]?.cells.length ?? 0) - skip ? skip : 0;
    const heads = headRow ? [...headRow.cells].slice(hskip) : [];
    const rows = body.map((r) => ({ el: r, label: hasLabels ? r.cells[0] : null, cells: [...r.cells].slice(skip) }));
    const n = Math.max(heads.length, ...rows.map((r) => r.cells.length));
    const uniform = rows.every((r) => r.cells.length === n) && (!headRow || heads.length === n);
    return { hasLabels, heads, headRow, hskip, skip, rows, n, uniform, caption: table.caption };
}

export function canonTables(root, opts = {}) {
    if (!root) return () => {};
    const table = root.querySelector('table');
    if (!table) return () => {};
    const num = (v, d) => (v === undefined || v === null || v === '' || isNaN(+v) ? d : +v);
    const o = {
        hand: String(opts.hand ?? root.dataset.hand ?? 'auto'),
        src: opts.src ?? root.dataset.src ?? null,
        folio: String(opts.folio ?? root.dataset.folio ?? 'auto'),
        seed: opts.seed ?? root.dataset.seed ?? null,
        size: num(opts.size ?? root.dataset.size, 0),
        maxScale: num(opts.maxScale ?? root.dataset.maxScale, 0),
        minCell: num(opts.minCell ?? root.dataset.minCell, 6.4),
        ink: String(opts.ink ?? root.dataset.ink ?? 'on') !== 'off',
    };
    // the hands: T'oros Roslin's canon pages whole (Getty Ms. 59), each a plate with its
    // columns lifted off, wherever he painted a page for this many columns; otherwise the
    // Carolingian book's arcades, assembled from parts for two to five
    const SRC = { roslin: HERE + 'assets/roslin.json', metz: HERE + 'assets/arcades.json' };

    let dead = false;
    const off = [];
    const on = (t, ev, fn, op) => { t.addEventListener(ev, fn, op); off.push(() => t.removeEventListener(ev, fn, op)); };
    const added = [];

    let api = null, man = null, src = null, fonts = null;
    let host = null;
    // The pages, and the one being worked on: L its layout constants, D its live DOM,
    // J its joints' springs, rowsS its rows' springs, flow its last composition.
    let pages = [], PG = null, L = null, D = null, J = [], rowsS = [], flow = null;
    function use(pg) { PG = pg; L = pg.G; D = pg.D; J = pg.J; rowsS = pg.rowsS; flow = pg.flow; return pg; }
    const setFlow = (f) => { flow = f; PG.flow = f; };
    const setRowsS = (r) => { rowsS = r; PG.rowsS = r; };
    // rows are known by their index in the table (ri); open: the row whose passage is opened
    let lit = -1, pinned = -1, hover = -1, focusR = -1, lastIn = 'hover', focusC = -1, open = -1;
    let raf = 0, lastT = 0, visible = true;

    /* ---- measuring ---------------------------------------------------- */
    const fontOf = (el) => { const cs = getComputedStyle(el); return { style: cs.fontStyle, weight: cs.fontWeight, family: cs.fontFamily }; };
    const spec = (f, s) => `${f.style} ${f.weight} ${s}px ${f.family}`;
    function prep(flow, f) {
        const P = api.prepareWithSegments(flow.text, spec(f, REF));
        const seg = P.segments || [];
        const offs = new Int32Array(seg.length + 1);
        for (let i = 0; i < seg.length; i++) offs[i + 1] = offs[i] + seg[i].length;
        P._off = offs;
        return P;
    }
    const gseg = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
    function posOf(P, cur) {
        let p = P._off[cur.segmentIndex] ?? P._off[P._off.length - 1];
        if (cur.graphemeIndex > 0 && P.segments[cur.segmentIndex]) {
            const s = P.segments[cur.segmentIndex];
            if (gseg) { let i = 0; for (const g of gseg.segment(s)) { if (i++ >= cur.graphemeIndex) break; p += g.segment.length; } }
            else p += cur.graphemeIndex;
        }
        return p;
    }
    // Plain lines at a fixed width (the margin labels, and the fit test).
    function lines(item, width, size) {
        const out = [];
        if (!item.flow.text) return { lines: out, broke: false };
        const k = REF / size;
        let cur = START, broke = false;
        for (let i = 0; i < 400; i++) {
            const r = api.layoutNextLineRange(item.P, cur, Math.max(1, width) * k);
            if (!r) break;
            if (r.end.graphemeIndex > 0) broke = true;
            out.push({ a: posOf(item.P, r.start), b: posOf(item.P, r.end), w: r.width / k });
            cur = r.end;
        }
        return { lines: out, broke };
    }
    // The widest unbreakable word of a text, in px at this size (measured whole:
    // pretext would break an over-long word into letters rather than report it).
    const wctx = document.createElement('canvas').getContext('2d');
    function widestWord(item, size) {
        if (!item || !item.flow.text) return 0;
        if (item._ww && item._ww[0] === size) return item._ww[1];
        wctx.font = spec(item.f, size);
        let w = 0;
        for (const word of item.flow.text.split(/\s+/)) if (word) w = Math.max(w, wctx.measureText(word).width);
        if (item.full) w = Math.max(w, widestWord(item.full, size));
        item._ww = [size, w];
        return w;
    }
    function dress(flow, a, b) {
        while (a < b && flow.text[a] === ' ') a++;
        while (b > a && flow.text[b - 1] === ' ') b--;
        const cuts = new Set([a, b]);
        for (const m of flow.marks) { if (m.a > a && m.a < b) cuts.add(m.a); if (m.b > a && m.b < b) cuts.add(m.b); }
        const xs = [...cuts].sort((p, q) => p - q);
        let html = '';
        for (let i = 0; i < xs.length - 1; i++) {
            const t = esc(flow.text.slice(xs[i], xs[i + 1]));
            const m = flow.marks.find((q) => q.a <= xs[i] && q.b >= xs[i + 1]);
            html += m ? `<span class="${m.c}">${t}</span>` : t;
        }
        return html;
    }

    /* ---- the book: which folio each page is ------------------------------ */
    // The canon pages in the book's own order, starting from a chosen (or a
    // seeded) one; a folio with finials only serves its own bay count, so no
    // finial is ever cut in half.
    function runFor(n) {
        const all = man.folios;
        const ok = all.filter((f) => (f.finials ? f.cols.length - 1 === n : true));
        const pool = ok.length ? ok : all;
        let start = pool.findIndex((f) => f.id === o.folio.padStart(2, '0'));
        if (start < 0) start = Math.floor(rng(o.seed !== null ? +o.seed : (Math.random() * 2 ** 32) >>> 0)() * pool.length);
        return (p) => pool[(start + p) % pool.length];
    }
    // n bays from a folio of B. Every joint between bays sits on a capital and joins two
    // interior halves of the band, so any bay can follow any other; the two ends are always
    // the folio's own. As few joints as possible join bays that were not painted side by
    // side: fewer than B takes the first n-1 bays and the last; more inserts middle bays in
    // pairs (m+1, m), each pair adding one such joint.
    function plan(f, n) {
        const B = f.cols.length - 1;
        let bays;
        if (n <= B) bays = [...Array.from({ length: n - 1 }, (_, i) => i), B - 1];
        else {
            const m = Math.max(0, Math.floor((B - 2) / 2)), d = n - B, X = [];
            if (d % 2) X.push(m);
            for (let i = 0; i < d >> 1; i++) X.push(Math.min(m + 1, B - 1), m);
            bays = [...Array.from({ length: m + 1 }, (_, i) => i), ...X, ...Array.from({ length: B - m - 1 }, (_, i) => m + 1 + i)];
        }
        const joints = bays.concat(bays[n - 1] + 1);   // the folio column standing at each joint
        // a part from the gutter side of the open book is replaced by a sister of the same
        // colour (two columns along, as the painters alternated them), carrying its own column
        const pickPart = (list, k) => {
            for (const d of [0, 2, -2, 4, -4, 1, -1]) if (list[k + d]) return { ...list[k + d], col: k + d };
            const i = list.findIndex(Boolean);
            return i < 0 ? null : { ...list[i], col: i };
        };
        return {
            bays, joints,
            caps: joints.map((k) => pickPart(f.capitals, k)),
            shafts: joints.map((k) => pickPart(f.shafts, k)),
            bases: joints.map((k) => pickPart(f.bases, k)),
        };
    }

    /* ---- the fixed part of a page's solve (once per width) --------------- */
    function solve(T, f) {
        const top = clamp(Math.round(T / 60), 15, 17);
        const sizes = o.size ? [o.size] : [top, 16, 15].filter((v, i, a) => a.indexOf(v) === i && v <= top);
        let G = null;
        for (const z of sizes) { G = solveAt(T, z, 'folio', f); if (G.fits) break; }
        if (!G.fits) G = solveAt(T, o.size || 15, 'swipe', f);
        return G;
    }
    function solveAt(T, size, mode, f, sFix = Infinity) {
        const n = src.n, pl = plan(f, n);
        const lh = Math.round(size * 1.4);
        const cx = f.cols.map((c) => c.cx), sw = f.cols[0].sw;
        const A = f.arches;
        const eL = cx[0] - A.x, eR = f.mirrorEnd ? eL : A.x + A.w - cx[cx.length - 1];
        const bw = pl.bays.map((b) => cx[b + 1] - cx[b]);
        const srcW = eL + bw.reduce((a, b) => a + b, 0) + eR;
        const pad = size * 0.5, gap = size * 0.9;
        const labelW = (lo, hi, maxLines) => {
            if (!src.hasLabels) return 0;
            const fits = (w) => src.rows.every((r) => { const q = lines(r.labelItem, w, size); return !q.broke && q.lines.length <= maxLines; });
            if (!fits(hi)) return maxLines < 3 ? labelW(lo, hi, 3) : hi;
            for (let i = 0; i < 14 && hi - lo > 1; i++) { const m = (lo + hi) / 2; if (fits(m)) hi = m; else lo = m; }
            return Math.ceil(hi);
        };
        // the end capitals may stand out past the band's ends: they too must be on the page
        const ov = (j, side) => {
            const cap = pl.caps[j];
            if (!cap) return 0;
            const reach = side ? cap.x + cap.w - cx[cap.col] : cx[cap.col] - cap.x;
            return Math.max(0, reach - (side ? eR : eL));
        };
        const over = ov(0, 0) + ov(n, 1);
        let Lw, s, view;
        if (mode === 'folio') {
            Lw = labelW(T * 0.09, T * 0.22, 2);
            s = Math.min(o.maxScale, sFix, (T - Lw - (Lw ? gap : 0)) / (srcW + over));
            view = srcW * s;
        } else {
            Lw = 0; view = T;
            const med = [...bw].sort((a, b) => a - b)[bw.length >> 1];
            s = Math.min(o.maxScale, (view * 0.84) / (med + sw * 0.5));
        }
        const X = [eL * s];
        for (let i = 0; i < n; i++) X.push(X[i] + bw[i] * s);
        const cellW = bw.map((w) => w * s - sw * s - 2 * pad);
        const fits = cellW.every((w) => w >= o.minCell * size && src.cols.every((c) => c.items.every((it) => widestWord(it, size) <= w)));
        // the heads come down in size (never below the text) until the longest word fits every bay
        let hsize = Math.round(size * 1.3);
        const minW = Math.min(...cellW);
        while (hsize > size && src.cols.some((c) => c.head && widestWord(c.head, hsize) > minW)) hsize -= 0.5;
        return { mode, fits, size, lh, hsize, hlh: Math.round(hsize * 1.2), pad, gap, Lw, s, view, X, cellW, f, A, pl, cx, sw, eL, eR, bw, arcW: srcW * s, T, over: over * s, overL: ov(0, 0) * s,
            springY: (f.spring - A.y) * s, neckY: (f.neck - A.y) * s, baseFade: Math.max(6, 34 * s),
            paintedEnd: (f.btop - A.y) * s, minShaft: 0, plate: f.kind === 'plate' };
    }
    // How far down the text of a page may go: as far as its painted shafts reach.
    const capOf = (G) => G.paintedEnd - G.size * (G.plate ? 0.35 : 0.7);

    // Silhouettes, in css px relative to each joint's centre: per 2px of height,
    // the leftmost and rightmost solid pixel of its capital and shaft.
    const SIL_STEP = 2;
    function silhouettes(G) {
        const { s, A, cx, pl } = G;
        const H = Math.ceil((G.neckY + 9000) / SIL_STEP);
        return pl.joints.map((_, j) => {
            const Ls = new Float32Array(H).fill(1e9), Rs = new Float32Array(H).fill(-1e9);
            const cap = pl.caps[j], sh = pl.shafts[j];
            if (cap && cap.prof) {
                const top = (cap.y - A.y) * s, ox = (cap.x - cx[cap.col]) * s, st = cap.prof.step * s;
                cap.prof.l.forEach((l, q) => {
                    if (l < 0) return;
                    const r = cap.prof.r[q];
                    const y0 = Math.floor((top + q * st) / SIL_STEP), y1 = Math.ceil((top + (q + 1) * st) / SIL_STEP);
                    for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) {
                        Ls[y] = Math.min(Ls[y], ox + l * s); Rs[y] = Math.max(Rs[y], ox + (r + 1) * s);
                    }
                });
            }
            if (sh) {
                const top = (sh.y - A.y) * s, ox = (sh.x - cx[sh.col]) * s;
                const ax = sh.axis || [sh.w / 2, 0], hw = (sh.hw || sh.w / 2) * s;
                for (let y = Math.max(0, Math.floor(top / SIL_STEP)); y < H; y++) {
                    const row = Math.min(sh.h * 0.9, (y * SIL_STEP - top) / s);
                    const c = ox + (ax[0] + ax[1] * row) * s;
                    Ls[y] = Math.min(Ls[y], c - hw); Rs[y] = Math.max(Rs[y], c + hw);
                }
            }
            return { Ls, Rs };
        });
    }
    // Each bay's intrados: sample x (css, from the left joint, at k=1) and the
    // height of the inner curve above the springing (css, at k=1).
    function intrados(G) {
        const { s, A, cx, pl, f } = G;
        const I = A.intr;
        if (!I) return pl.bays.map((b) => ({ xs: Float32Array.from([0, (cx[b + 1] - cx[b]) * s]), hs: Float32Array.from([1e5, 1e5]), crown: 0 }));
        return pl.bays.map((b) => {
            const xs = [], hs = [];
            for (let q = 0; q < I.y.length; q++) {
                const sx = A.x + q * I.step;
                if (sx < cx[b] || sx > cx[b + 1]) continue;
                xs.push((sx - cx[b]) * s);
                hs.push(Math.max(0, (f.spring - (A.y + I.y[q])) * s));
            }
            return { xs: Float32Array.from(xs), hs: Float32Array.from(hs), crown: Math.max(...hs) };
        });
    }
    function makePage(G, slices) {
        G.sil = silhouettes(G);
        G.intr = intrados(G);
        return { G, slices, J: G.pl.joints.map(() => ({ x: 0, v: 0, t: 0, held: false })), rowsS: [], flow: null, D: null,
            dS: new Map(src.cols.map((c) => [c.id, { x: 0, v: 0 }])), active: true };
    }

    /* ---- the live state of the page in hand ------------------------------ */
    // J: the springs of the joints (offsets from the painter's place); order: which
    // Gospel stands in which bay (the same on every page); rowsS: the row tops.
    let order = [], drag = null, carry = null;
    const dsOf = (c) => PG.dS.get(c.id);

    function jointX(j) { return L.X[j] + J[j].x; }
    function bayK(i) { return (jointX(i + 1) - jointX(i)) / (L.bw[i] * L.s); }
    function colEdge(j, y0, y1, side) {
        const S = L.sil[j], a = clamp(Math.floor(y0 / SIL_STEP), 0, S.Ls.length - 1), b = clamp(Math.ceil(y1 / SIL_STEP), 0, S.Ls.length - 1);
        let v = side ? -1e9 : 1e9;
        for (let y = a; y <= b; y++) v = side ? Math.max(v, S.Rs[y]) : Math.min(v, S.Ls[y]);
        if (Math.abs(v) > 1e8) v = (side ? 1 : -1) * L.sw * L.s / 2;
        return jointX(j) + v;
    }
    // The free run of bay i for a line from y0 to y1, or null.
    function run(i, y0, y1) {
        let a = colEdge(i, y0, y1, 1) + L.pad, b = colEdge(i + 1, y0, y1, 0) - L.pad;
        if (L.plate) { if (y0 < L.springY + L.size * 0.3) return null; }
        else if (y0 < L.springY) {
            const I = L.intr[i], k = bayK(i), x0 = jointX(i), clr = L.size * 0.35;
            const lim = (L.springY - y0 + clr) / k;   // the curve must stand at least this high
            const m = I.xs.length >> 1;
            if (I.hs[m] < lim) return null;
            let l = m, r = m;
            while (l > 0 && I.hs[l - 1] >= lim) l--;
            while (r < I.xs.length - 1 && I.hs[r + 1] >= lim) r++;
            a = Math.max(a, x0 + I.xs[l] * k + L.pad * 0.6);
            b = Math.min(b, x0 + I.xs[r] * k - L.pad * 0.6);
        }
        return b - a > 0 ? [a, b] : null;
    }
    // The bay's run in the body of the shafts, below the capitals: the widest it gets.
    function fullRun(i) {
        const y = L.neckY + L.lh * 2, rr = run(i, y, y + L.lh);
        return rr ? rr[1] - rr[0] : 0;
    }
    // Set a text into bay i from y down, line by line, each into its own free run,
    // from the cursor `from` up to the cursor `to` (a cell split over two pages), and
    // no lower than yMax. Returns where it got to: { y, cur } (cur is END when done).
    function setInto(item, i, y, size, lh, cls, row, out, from = START, to = null, yMax = Infinity) {
        if (!item || !item.flow.text || from === END) return { y, cur: END };
        if (to === END) to = null;
        const k = REF / size, minRun = size * 3.4, full = fullRun(i);
        const start = out.length;
        let cur = from, skipped = 0;
        for (let guard = 0; guard < 400; guard++) {
            if (to && cmpCur(cur, to) >= 0) return { y, cur: END };
            if (y + lh > yMax + 0.5) return { y, cur };
            const rr = run(i, y, y + lh);
            const w = rr ? rr[1] - rr[0] : 0;
            // too narrow here (the arch's curve, a capital's elbow): go a half line lower,
            // unless this is already as wide as the bay gets
            const narrow = w < Math.min(minRun, full * 0.98);
            if (narrow && skipped < 24) {
                // a lone fragment stranded above the obstruction is withdrawn: the cell starts below it
                const placed = out.length - start;
                let chars = 0;
                for (let q = start; q < out.length; q++) chars += out[q].b - out[q].a;
                if (placed > 0 && placed <= 3 && chars < 28) { out.length = start; cur = from; }
                y += lh * 0.5; skipped++; continue;
            }
            const r = api.layoutNextLineRange(item.P, cur, Math.max(1, w) * k);
            if (!r) return { y, cur: END };
            if (r.end.graphemeIndex > 0 && w < full * 0.98 && skipped < 24) { y += lh * 0.5; skipped++; continue; }   // a word would break: lower, where it is wider
            const b = to && cmpCur(r.end, to) > 0 ? posOf(item.P, to) : posOf(item.P, r.end);
            out.push({ item, a: posOf(item.P, r.start), b, x: rr ? rr[0] : jointX(i) + L.pad, y, cls, row, h: lh, fs: size });
            cur = r.end; y += lh; skipped = 0;
        }
        return { y, cur: END };
    }

    // The page at the joints' present places: heads in the crowns, rows aligned
    // across, every line in its run. Row tops are targets for the springs.
    // yMax (the pagination's test): no line lower than this; ends says where each cell got to.
    function compose(yMax = Infinity) {
        const lh = L.lh, size = L.size, out = [];
        const n = src.n;
        // heads: on one line high in the crowns (as the scribes wrote MAT, MAR, LVC small
        // where the arch closed in), one size for all, the size the tightest crown allows;
        // the first row starts just under them, inside the lunette
        let crownLow = 1e9;
        for (let i = 0; i < n; i++) crownLow = Math.min(crownLow, L.intr[i].crown * bayK(i));
        const hy = L.plate ? L.springY + L.size * 0.55 : L.springY - crownLow * 0.72;
        let fs = L.hsize;
        const w0s = order.map((c) => { if (!c.head) return 0; const h = c.head; if (!h._w0 || h._w0[0] !== L.hsize) h._w0 = [L.hsize, lines(h, 1e5, L.hsize).lines[0]?.w ?? 0]; return h._w0[1]; });
        for (let i = 0; i < n; i++) {
            if (!order[i].head) continue;
            const rr = run(i, hy, hy + L.hlh), fit = rr ? rr[1] - rr[0] : 0;
            if (w0s[i] > fit) fs = Math.min(fs, Math.max(L.size * 0.9, L.hsize * fit / w0s[i]));
        }
        const hh = Math.round(fs * 1.2);
        const heads = [];
        let headBottom = hy;
        // on a plate the names stand on one line, low enough to be clear of every capital
        let common = null;
        if (L.plate) {
            common = hy + (L.hlh - hh) * 0.7;
            for (let i = 0; i < n; i++) {
                if (!order[i].head) continue;
                const w = w0s[i] * fs / L.hsize;
                let rr = run(i, common, common + hh);
                while ((!rr || w > rr[1] - rr[0] + 0.5) && common < L.springY + L.size * 10) { common += 2; rr = run(i, common, common + hh); }
            }
        }
        for (let i = 0; i < n; i++) {
            const c = order[i];
            if (!c.head) continue;
            const w = w0s[i] * fs / L.hsize;
            let y = common ?? hy + (L.hlh - hh) * 0.7, rr = run(i, y, y + hh);
            // a name that still will not fit comes down the curve until it does
            while (rr !== undefined && (!rr || w > rr[1] - rr[0] + 0.5) && y < L.springY + (L.plate ? L.size * 8 : 0)) { y += 2; rr = run(i, y, y + hh); }
            const x = rr ? (rr[0] + rr[1] - w) / 2 : (jointX(i) + jointX(i + 1) - w) / 2;
            heads.push({ item: c.head, a: 0, b: c.head.flow.text.length, x, y, cls: 'cn-head', row: -1, k: -1, h: hh, fs: +fs.toFixed(2), col: c });
            headBottom = Math.max(headBottom, y + hh);
        }
        const padT = size * 0.42, padB = size * 0.5;
        let y = headBottom + size * 0.15;
        const rows = [], ends = [];
        const inBay = L.mode === 'swipe';
        // a row opened here: the others on this page close up to their first line
        const openHere = open >= 0 && PG.slices.some((sl) => sl.ri === open && !sl.cont);
        PG.slices.forEach((sl, k) => {
            const ri = sl.ri, r = src.rows[ri];
            const top = y;
            let bottom = top + padT + lh;
            const folded = openHere && ri !== open, opened = ri === open;
            const e = {};
            if (opened && sl.cont) { rows.push({ top, h: 0, ri, gone: true }); ends.push(e); return; }   // opened whole where it begins
            for (let i = 0; i < n; i++) {
                const c = order[i], cell = c.items[ri];
                let yy = top + padT;
                const mine = [];
                if (inBay && r.labelItem) yy = setInto(r.labelItem, i, yy, size, lh, 'cn-lab is-in', ri, mine, START, null, folded ? yy + lh : Infinity).y;
                const it = opened && cell.full ? cell.full : cell;
                const from = opened ? START : (sl.from && sl.from[c.id]) || START;
                const to = opened ? null : (sl.to && sl.to[c.id]) || null;
                const lim = folded ? yy + lh : yMax - padB;
                const res = setInto(it, i, yy, size, lh, '', ri, mine, from, to, lim);
                e[c.id] = res.cur;
                const more = folded && (res.cur !== END || !!cell.full);
                mine.forEach((m) => { m.col = c; m.rel = m.y - top; m.k = k; m.fold = more; m.open = opened && !!cell.full; });
                out.push(...mine);
                bottom = Math.max(bottom, res.y);
            }
            rows.push({ top, h: bottom - top + padB, ri });
            ends.push(e);
            y = bottom + padB;
        });
        heads.forEach((h) => { h.rel = h.y; });
        return { lines: out, heads, rows, bodyEnd: y, ends };
    }

    /* ---- pagination: the table over the canon pages of the book ---------- */
    // Rows go onto a page while its painted shafts hold them; the next goes over.
    // A row too tall for a page by itself is cut at the page's foot, each cell at
    // the word where it stopped, and continued at the head of the next page.
    // A table that fits one page is set at the scale that fills that page.
    function paginate(T) {
        const was = open;
        open = -1;   // pages are cut at rest, every row closed
        try { return paginateAt(T); } finally { open = was; }
    }
    function paginateAt(T) {
        const folioAt = runFor(src.n);
        const out = [];
        let queue = src.rows.map((_, ri) => ({ ri, from: null, to: null }));
        let G0 = null;
        for (let p = 0; queue.length && p < 40; p++) {
            const f = folioAt(p);
            const G = p === 0 ? solve(T, f) : solveAt(T, G0.size, G0.mode, f);
            if (!p) G0 = G;
            const pg = use(makePage(G, []));
            const cap = capOf(G);
            while (queue.length) {
                const before = pg.slices.length ? compose().bodyEnd : 0;
                pg.slices = [...pg.slices, queue[0]];
                if (compose().bodyEnd <= cap + 0.5) { queue.shift(); continue; }
                pg.slices.pop();
                // a row is cut at the foot of the page (as the scribes did) if it is the first,
                // or if a good part of the page would otherwise stand empty
                if (!pg.slices.length || cap - before > G.lh * 6) {
                    const k = pg.slices.length;
                    pg.slices = [...pg.slices, queue[0]];
                    // no widows: if fewer than three lines would go over, the cut comes up a line at a time
                    let lim = cap, e = compose(lim).ends[k];
                    for (let t = 0; t < 6; t++) {
                        const left = restLines(e, queue[0].to);
                        if (left === 0 || left >= 3) break;
                        lim -= G.lh; e = compose(lim).ends[k];
                    }
                    if (restLines(e, queue[0].to) > 0 && compose(lim).rows[k].h < G.lh * 3.5 && pg.slices.length > 1) { pg.slices.pop(); break; }   // too little this side: all of it goes over
                    const done = src.cols.every((c) => e[c.id] === END);
                    const moved = src.cols.some((c) => e[c.id] === END || cmpCur(e[c.id], (queue[0].from && queue[0].from[c.id]) || START) > 0);
                    if (done) { queue.shift(); continue; }
                    if (!moved) { pg.slices.pop(); if (!pg.slices.length) { pg.slices = [queue.shift()]; } break; }   // (nothing of it fits: the next page, or overflow)
                    pg.slices[k] = { ...queue[0], to: e };
                    queue[0] = { ri: queue[0].ri, from: e, to: queue[0].to, cont: true };
                }
                break;
            }
            out.push(pg);
        }
        // one page: the arcade is drawn at the scale at which the table fills it
        if (out.length === 1 && G0.mode === 'folio') {
            const pg = out[0], f = pg.G.f, sMax = pg.G.s;
            const test = (s) => {
                const G = solveAt(T, G0.size, 'folio', f, s);
                const q = use(makePage(G, pg.slices));
                return G.fits && compose().bodyEnd <= capOf(G) + 0.5 ? q : null;
            };
            let lo = sMax * 0.86, hi = sMax, best = pg;
            const low = test(lo);
            if (low) best = low;
            else for (let i = 0; i < 10 && hi - lo > 0.002; i++) { const m = (lo + hi) / 2, q = test(m); if (q) { hi = m; best = q; } else lo = m; }
            out[0] = best;
        }
        // more than one page: every page but the last keeps its painted height, as in the book;
        // the last ends with its text, on shafts no longer than the painter's
        if (out.length > 1) out.slice(0, -1).forEach((pg) => { pg.G.minShaft = pg.G.paintedEnd; });
        return out;
    }

    // How many lines (in its longest cell) a row has left from the cursors e, at the bays' rest widths.
    function restLines(e, to) {
        let most = 0;
        order.forEach((c, i) => {
            const cur = e[c.id];
            if (!cur || cur === END) return;
            const it = c.items[PG.slices[PG.slices.length - 1].ri];
            const k = REF / L.size, w = Math.max(1, L.cellW[i]) * k;
            let q = cur, nlines = 0;
            for (let g = 0; g < 200; g++) {
                if (to && to[c.id] && to[c.id] !== END && cmpCur(q, to[c.id]) >= 0) break;
                const r = api.layoutNextLineRange(it.P, q, w);
                if (!r) break;
                nlines++; q = r.end;
            }
            most = Math.max(most, nlines);
        });
        return most;
    }

    /* ---- building the drawing (once per width) ----------------------------- */
    function build(pg, p) {
        use(pg);
        const G = L;
        const { s, A, pl, f } = G;
        const url = (q) => new URL(q.file, new URL(o.src, document.baseURI)).href;
        const page = el('div', 'cn-page');
        page.dataset.p = p; page.dataset.folio = f.id;
        const draw = el('div', 'cn-draw'); draw.setAttribute('aria-hidden', 'true'); draw.dataset.mode = G.mode;
        draw.style.setProperty('--cn-fs', G.size + 'px');
        const margin = el('div', 'cn-margin'), scroll = el('div', 'cn-scroll'), arcade = el('div', 'cn-arcade');
        const under = el('div', 'cn-under'), text = el('div', 'cn-text');
        arcade.append(under); scroll.append(arcade); draw.append(margin, scroll); page.append(draw); host.append(page);
        const aw = A.w * s, ah = A.h * s;
        const archImg = url(A);
        const arch = (cls) => { const d = el('div', 'cn-arch' + (cls ? ' ' + cls : '')); d.style.backgroundImage = `url("${archImg}")`; arcade.append(d); return d; };
        let ends = [], bays = [];
        if (G.plate) {
            // the folio, whole: its band, birds, candles and trees as painted; only its columns move
            const im = new Image(); im.alt = ''; im.className = 'cn-plate'; im.decoding = 'async'; im.src = archImg;
            if (p) im.loading = 'lazy';
            im.style.cssText = `width:${aw.toFixed(1)}px;height:${ah.toFixed(1)}px`;
            arcade.append(im);
        } else {
            ends = [arch(), arch(f.mirrorEnd ? 'is-turned' : '')];
            bays = pl.bays.map(() => arch('is-bay'));
        }
        // the joints: capital, shaft and base, moved together
        const restBody = Math.max(compose().bodyEnd, G.minShaft);   // (uses the rest places: J are zero)
        const cols = pl.joints.map((_, j) => {
            const g = el('div', 'cn-col');
            const cap = pl.caps[j], sh = pl.shafts[j], base = pl.bases[j];
            const ox = (q) => (q.x - G.cx[q.col]) * s;
            let shaft = null, baseEl = null;
            if (sh) {
                shaft = el('div', 'cn-shaft');
                const w = sh.w * s, h = sh.h * s, over = Math.min(h * 0.16, 70), r0 = sh.h * 0.12, cut = h * 0.95;
                const ax = sh.axis || [sh.w / 2, 0], cxAt = (row) => ax[0] + ax[1] * row;
                // the painted shaft, and (only for a row opened or a bay squeezed past what the page
                // holds) continuation copies cross-faded on its own axis
                const want = (restBody - (sh.y - A.y) * s) * 1.6 + 300;
                const copies = [{ top: 0, left: 0, from: -1 }];
                let end = cut, shift = 0, prevTop = 0;
                while (end < want && copies.length < 10) {
                    const Y = end - over, imgTop = Y - r0 * s, mid = Y + over * 0.5;
                    shift += (cxAt((mid - prevTop) / s) - cxAt((mid - imgTop) / s)) * s;
                    copies.push({ top: imgTop, left: shift, from: r0 * s });
                    prevTop = imgTop; end = imgTop + cut;
                }
                copies.forEach((q, i) => {
                    const im = new Image(); im.alt = ''; im.src = url(sh); im.decoding = 'async';
                    if (i) im.loading = 'lazy';
                    const a = q.from, b = q.from + over * 0.6, c = cut - over * 0.4, last = i === copies.length - 1;
                    const head = q.from < 0 ? '#000 0px' : `transparent ${a.toFixed(1)}px,#000 ${b.toFixed(1)}px`;
                    const mask = last ? `linear-gradient(180deg,${head})` : `linear-gradient(180deg,${head},#000 ${c.toFixed(1)}px,transparent ${cut.toFixed(1)}px)`;
                    im.style.cssText = `top:${q.top.toFixed(2)}px;left:${q.left.toFixed(2)}px;width:${w.toFixed(2)}px;height:${h.toFixed(2)}px;-webkit-mask-image:${mask};mask-image:${mask}`;
                    shaft.append(im);
                });
                shaft.style.cssText = `left:${ox(sh).toFixed(2)}px;top:${((sh.y - A.y) * s).toFixed(2)}px;width:${w.toFixed(2)}px`;
                const em = `linear-gradient(180deg,#000 calc(100% - ${G.baseFade.toFixed(1)}px),transparent)`;
                shaft.style.webkitMaskImage = em; shaft.style.maskImage = em;
                g.append(shaft);
            }
            if (base) {
                baseEl = new Image(); baseEl.alt = ''; baseEl.className = 'cn-part'; baseEl.src = url(base);
                const bm = `linear-gradient(180deg,transparent,#000 ${G.baseFade.toFixed(1)}px)`;
                baseEl.style.cssText = `left:${ox(base).toFixed(2)}px;width:${(base.w * s).toFixed(2)}px;height:${(base.h * s).toFixed(2)}px;-webkit-mask-image:${bm};mask-image:${bm}`;
                g.append(baseEl);
            }
            if (cap) {
                const ci = new Image(); ci.alt = ''; ci.className = 'cn-part cn-cap'; ci.src = url(cap);
                if (G.plate && p) ci.loading = 'lazy';
                ci.style.cssText = `left:${ox(cap).toFixed(2)}px;top:${((cap.y - A.y) * s).toFixed(2)}px;width:${(cap.w * s).toFixed(2)}px;height:${(cap.h * s).toFixed(2)}px`;
                g.append(ci);
            }
            arcade.append(g);
            // the handle: the column's own width, from the capital to the base
            const grip = el('div', 'cn-grip');
            grip.dataset.j = j;
            const half = Math.max(L.sil[j].Rs[Math.floor((G.neckY + 40) / SIL_STEP)], -L.sil[j].Ls[Math.floor((G.neckY + 40) / SIL_STEP)], G.sw * s * 0.5) + G.size * 0.3;
            grip.style.cssText = `left:${(-half).toFixed(1)}px;width:${(2 * half).toFixed(1)}px;top:${(cap ? (cap.y - A.y) * s : G.springY).toFixed(1)}px` + (G.plate && cap ? `;height:${(cap.h * s).toFixed(1)}px` : '');
            g.append(grip);
            return { g, shaft, base: baseEl, baseP: base, grip };
        });
        arcade.append(text);
        const read = el('div', 'cn-read'); under.append(read);
        const readM = el('div', 'cn-read is-margin'); margin.append(readM);
        // the margin's labels: fixed lines, moved with their rows
        const labels = pg.slices.map((sl) => {
            const r = src.rows[sl.ri];
            if (!r.labelItem || G.mode !== 'folio') return [];
            return lines(r.labelItem, G.Lw, G.size).lines.map((ln, k) => {
                const d = el('div', 'cn-ln cn-lab');
                d.dataset.r = sl.ri; d.innerHTML = dress(r.labelItem.flow, ln.a, ln.b);
                d.style.cssText = `right:0;top:0;height:${G.lh}px;line-height:${G.lh}px`;
                d._k = k; margin.append(d);
                return d;
            });
        });
        // swipe: snap points and a pager of column names
        let pager = null, snaps = [];
        if (G.mode === 'swipe') {
            snaps = G.X.slice(0, -1).map(() => { const i = el('i', 'cn-snap'); arcade.append(i); return i; });
            pager = el('div', 'cn-pager');
            page.append(pager);
        }
        if (src.captionItem) {
            const capText = el('p', 'cn-cap-text'); capText.setAttribute('aria-hidden', 'true');
            capText.innerHTML = dress(src.captionItem.flow, 0, src.captionItem.flow.text.length) + (pages.length > 1 ? `<span class="cn-folio"> · ${ROMAN[p] || p + 1}</span>` : '');
            page.append(capText);
        }
        const gapW = G.Lw ? G.gap : 0;
        const total = G.Lw + gapW + (G.mode === 'folio' ? G.arcW : G.view);
        const shift = G.mode === 'folio' ? Math.max(0, (G.T - total - G.over) / 2) + G.overL : 0;
        margin.style.cssText = `left:${shift.toFixed(1)}px;width:${G.Lw.toFixed(1)}px`;
        scroll.style.cssText = `left:${(shift + G.Lw + gapW).toFixed(1)}px;width:${(G.mode === 'folio' ? G.arcW : G.view).toFixed(1)}px`;
        arcade.style.width = G.arcW.toFixed(1) + 'px';
        pg.D = D = { page, draw, margin, scroll, arcade, under, text, ends, bays, cols, read, readM, labels, pager, snaps, rules: [], pool: new Map(), leaving: new Set(), aw, ah };
        if (G.mode === 'swipe') renderPager();
    }
    function el(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }
    function renderPager() {
        if (!D.pager) return;
        D.pager.innerHTML = order.map((c, i) => `<button type="button" data-col="${i}" aria-label="Show column ${esc(c.name || i + 1)}">${esc(c.name || i + 1)}</button>`).join('');
        markPager();
    }

    /* ---- one frame: springs, the solve at the joints' places, the drawing -- */
    function frame(now) {
        raf = 0;
        if (dead || !pages.length) return;
        const dt = Math.min(0.05, lastT ? (now - lastT) / 1000 : 1 / 60);
        lastT = now;
        const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
        let any = false;
        const tf = performance.now();
        for (const pg of pages) {
            if (!pg.active || !pg.D) continue;
            use(pg);
            pg.active = step(dt, steps);
            any = any || pg.active;
        }
        root.dataset.cnFrame = (performance.now() - tf).toFixed(2);
        const shown = (drag && drag.pg) || (carry && carry.pg) || pages[0];
        root.dataset.cnJoints = shown.J.map((q) => q.x.toFixed(1)).join(' ');
        ink();
        if (any && visible) raf = requestAnimationFrame(frame);
        else lastT = 0;
    }
    function step(dt, steps) {
        const still = calm.matches;
        let moving = (!!drag && drag.pg === PG) || (!!carry && carry.pg === PG);
        for (const st of J) {
            if (still) { st.x = st.t; st.v = 0; continue; }
            for (let k = 0; k < steps; k++) spring(st, st.t, st.held ? HOLD : HOME, dt / steps);
            if (Math.abs(st.x - st.t) > 0.05 || Math.abs(st.v) > 0.05) moving = true; else if (!st.held) { st.x = st.t; st.v = 0; }
        }
        for (const c of src.cols) {
            if (carry && carry.col === c && carry.pg === PG) continue;
            const d = dsOf(c);
            if (still) { d.x = 0; d.v = 0; continue; }
            for (let k = 0; k < steps; k++) spring(d, 0, SLIDE, dt / steps);
            if (Math.abs(d.x) > 0.05 || Math.abs(d.v) > 0.05) moving = true; else { d.x = 0; d.v = 0; }
        }
        setFlow(compose());
        if (L.plate && drag && drag.pg === PG && flow.bodyEnd > capOf(L) + 1) {
            const j = drag.j, st = J[j];
            PG.stop = PG.stop || {};
            if (st.x > 0) PG.stop[j] = [PG.stop[j] ? PG.stop[j][0] : -Infinity, Math.min(PG.stop[j] ? PG.stop[j][1] : Infinity, st.x - 1)];
            else PG.stop[j] = [Math.max(PG.stop[j] ? PG.stop[j][0] : -Infinity, st.x + 1), PG.stop[j] ? PG.stop[j][1] : Infinity];
            st.t = clamp(st.t, PG.stop[j][0], PG.stop[j][1]);
        }
        if (rowsS.length !== flow.rows.length) setRowsS(flow.rows.map((r) => ({ x: r.top, v: 0 })));
        flow.rows.forEach((r, i) => {
            const st = rowsS[i];
            if (still) { st.x = r.top; st.v = 0; return; }
            for (let k = 0; k < steps; k++) spring(st, r.top, ROWS, dt / steps);
            if (Math.abs(st.x - r.top) > 0.05 || Math.abs(st.v) > 0.05) moving = true; else { st.x = r.top; st.v = 0; }
        });
        draw();
        return moving;
    }
    function kick(pg = PG) { if (pg) pg.active = true; if (!raf && !dead) raf = requestAnimationFrame(frame); }
    function kickAll() { pages.forEach((pg) => { pg.active = true; }); kick(null); }

    function draw() {
        const { s, A, f, pl } = L;
        const n = src.n;
        const rowY = (k) => (rowsS[k] ? rowsS[k].x : flow.rows[k].top);
        const last = flow.rows.length - 1;
        const bodyEnd = last >= 0 ? rowY(last) + flow.rows[last].h : flow.bodyEnd;
        const shaftEnd = Math.max(bodyEnd + L.size * 0.7, L.minShaft);
        if (L.plate) {
            // a plate: the columns slide under the band; the page is as tall as the folio
            D.cols.forEach((c, j) => { c.g.style.transform = `translate3d(${jointX(j).toFixed(2)}px,0,0)`; });
            const H = Math.max(D.ah, bodyEnd + L.size);
            if (D._H !== Math.round(H * 2)) { D._H = Math.round(H * 2); D.draw.style.height = H.toFixed(1) + 'px'; D.arcade.style.height = H.toFixed(1) + 'px'; }
        } else {
        // arches: each bay its own clip, rescaled whole about the springing
        const fe = Math.max(6, 44 * s);
        const setArch = (d, left, width, k, srcLeft, feather, out = 0) => {
            const top = L.springY - (f.spring - A.y) * s * k;
            const st = d.style;
            st.left = (left - feather).toFixed(2) + 'px'; st.top = top.toFixed(2) + 'px';
            st.width = (width + feather + out + 0.6).toFixed(2) + 'px'; st.height = (D.ah * k).toFixed(2) + 'px';
            if (d._out !== Math.round(out)) { d._out = Math.round(out); d._m = 0; }
            st.backgroundSize = `${(D.aw * k).toFixed(2)}px ${(D.ah * k).toFixed(2)}px`;
            st.backgroundPosition = `${(-(srcLeft - A.x) * s * k + feather).toFixed(2)}px 0`;
            if (!d._m) {
                // the inner side fades in over its neighbour; an end's outer side (the crop's edge) fades out;
                // where this bay meets a differently scaled one, its own edge fades out too
                const o8 = 8, m = d === D.ends[0] ? `linear-gradient(90deg,transparent,#000 ${o8}px)`
                    : d === D.ends[1] ? `linear-gradient(90deg,transparent,#000 ${feather.toFixed(1)}px,#000 calc(100% - ${o8}px),transparent)`
                    : out > 0.5 ? `linear-gradient(90deg,transparent,#000 ${feather.toFixed(1)}px,#000 calc(100% - ${(out * 2).toFixed(1)}px),transparent)`
                    : `linear-gradient(90deg,transparent,#000 ${feather.toFixed(1)}px)`;
                st.webkitMaskImage = m; st.maskImage = m; d._m = 1;
            }
        };
        setArch(D.ends[0], jointX(0) - L.eL * s, L.eL * s, 1, A.x, 0);
        pl.bays.forEach((b, i) => {
            const k = bayK(i), kn = i < n - 1 ? bayK(i + 1) : 1;
            const out = Math.min(Math.abs(k - kn) * 300 * s, (jointX(i + 1) - jointX(i)) * 0.16);
            setArch(D.bays[i], jointX(i), jointX(i + 1) - jointX(i), k, L.cx[b], fe, out);
        });
        if (f.mirrorEnd) {
            const d = D.ends[1], st = d.style;
            st.left = (jointX(n) - fe).toFixed(2) + 'px'; st.top = '0px';
            st.width = (L.eL * s + fe + 0.6).toFixed(2) + 'px'; st.height = D.ah.toFixed(2) + 'px';
            st.backgroundSize = `${D.aw.toFixed(2)}px ${D.ah.toFixed(2)}px`; st.backgroundPosition = '0 0';
            if (!d._m) { const m = `linear-gradient(90deg,transparent,#000 8px,#000 calc(100% - ${fe.toFixed(1)}px),transparent)`; st.webkitMaskImage = m; st.maskImage = m; d._m = 1; }
        } else setArch(D.ends[1], jointX(n), L.eR * s, 1, L.cx[L.cx.length - 1], fe);
        // joints
        D.cols.forEach((c, j) => {
            c.g.style.transform = `translate3d(${jointX(j).toFixed(2)}px,0,0)`;
            if (c.shaft) c.shaft.style.height = Math.max(0, shaftEnd + L.baseFade - parseFloat(c.shaft.style.top)).toFixed(2) + 'px';
            if (c.base) c.base.style.top = (shaftEnd + (c.baseP.y - f.btop) * s).toFixed(2) + 'px';
            c.grip.style.height = Math.max(0, shaftEnd + (c.baseP ? c.baseP.h * s : 0) - parseFloat(c.grip.style.top)).toFixed(1) + 'px';
        });
        let floor = shaftEnd;
        D.cols.forEach((c) => { if (c.baseP) floor = Math.max(floor, shaftEnd + (c.baseP.y - f.btop + c.baseP.h) * s); });
        const H = floor + L.size * 0.6;
        if (D._H !== Math.round(H * 2)) { D._H = Math.round(H * 2); D.draw.style.height = H.toFixed(1) + 'px'; D.arcade.style.height = H.toFixed(1) + 'px'; }
        }
        // rules between rows, under the shafts
        const x0 = jointX(0), x1 = jointX(n);
        while (D.rules.length < flow.rows.length + 1) { const r = el('div', 'cn-rule'); D.under.append(r); D.rules.push(r); }
        flow.rows.forEach((r, i) => {
            D.rules[i].style.cssText = `display:${i ? 'block' : 'none'};left:${x0.toFixed(1)}px;width:${(x1 - x0).toFixed(1)}px;top:${rowY(i).toFixed(1)}px`;
        });
        const foot = D.rules[flow.rows.length];
        foot.className = 'cn-rule is-foot';
        foot.style.cssText = `left:${x0.toFixed(1)}px;width:${(x1 - x0).toFixed(1)}px;top:${bodyEnd.toFixed(1)}px`;
        D.read.style.left = x0.toFixed(1) + 'px'; D.read.style.width = (x1 - x0).toFixed(1) + 'px';
        // text: pooled lines, moved, re-set only when their words change
        const seen = new Set();
        const calmNow = calm.matches || !!drag || !!carry;
        const put = (key, ln, x, y) => {
            let d = D.pool.get(key);
            if (!d) {
                d = el('div', 'cn-ln'); D.text.append(d); D.pool.set(key, d); d._h = ''; d._c = ''; d._w = 100;
                if (!calmNow && PG.flow && D._built) { d._fresh = 1; }
            }
            const html = dress(ln.item.flow, ln.a, ln.b);
            if (d._h !== html) { d.innerHTML = html; d._h = html; }
            const cls = 'cn-ln' + (ln.cls ? ' ' + ln.cls : '') + (ln.row >= 0 && ln.row === lit ? ' is-on' : '') + (ln.fold ? ' is-folded' : '') + (ln.open ? ' is-open' : '')
                + (ln.cls === 'cn-head' && focusC >= 0 && order[focusC] === ln.col ? ' is-focus' : '') + (carry && carry.col === ln.col ? ' is-carried' : '')
                + (d._w < 100 ? ' is-ink' : '') + (d._fresh ? ' is-new' : '');
            if (d._c !== cls) { d.className = cls; d._c = cls; }
            if (ln.row >= 0) d.dataset.r = ln.row; else delete d.dataset.r;
            const st = d.style;
            if (d._fs !== ln.fs) { st.fontSize = ln.fs + 'px'; st.height = ln.h + 'px'; st.lineHeight = ln.h + 'px'; d._fs = ln.fs; }
            st.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0)`;
            d._ri = ln.row; d._rel = ln.rel || 0; d._len = ln.b - ln.a;
            seen.add(key);
        };
        const dxOf = (c) => (carry && carry.col === c && carry.pg === PG ? carry.dx : dsOf(c).x);
        const lift = (c) => (carry && carry.col === c && carry.pg === PG ? 3 : 0);
        flow.heads.forEach((h) => put(`${h.col.id}|h`, h, h.x + dxOf(h.col), h.y - lift(h.col)));
        const count = new Map();
        flow.lines.forEach((ln) => {
            const kk = `${ln.col.id}|${ln.k}|${ln.cls ? 'l' : 'c'}`;
            const k = count.get(kk) || 0; count.set(kk, k + 1);
            put(`${kk}|${k}`, ln, ln.x + dxOf(ln.col), rowY(ln.k) + ln.rel - lift(ln.col));
        });
        // lines no longer set (a row closed up) fade where they stand
        for (const [k, d] of D.pool) if (!seen.has(k)) {
            D.pool.delete(k);
            if (calmNow || calm.matches) { d.remove(); continue; }
            d.classList.add('is-leaving'); D.leaving.add(d);
            setTimeout(() => { d.remove(); if (D) D.leaving.delete(d); }, 380);
        }
        if (D._built) for (const d of D.pool.values()) if (d._fresh === 1) { d._fresh = 2; requestAnimationFrame(() => { d._fresh = 0; d.classList.remove('is-new'); d._c = d.className; }); }
        D._built = 1;
        // margin labels ride their rows
        D.labels.forEach((ds, k) => ds.forEach((d) => {
            const ri = PG.slices[k].ri;
            const y = rowY(k) + L.size * 0.42 + d._k * L.lh;
            d.style.transform = `translate3d(0,${y.toFixed(2)}px,0)`;
            d._ri = ri; d._rel = d._k * L.lh; d._len = d.textContent.length;
            d.classList.toggle('is-on', ri === lit);
            d.classList.toggle('is-focus', ri === lit && focusR === ri && lastIn === 'focus');
        }));
        // snap points stay at the painter's places, so moving a column never re-snaps the scroller
        if (D.snaps.length && !D._snapped) { D.snaps.forEach((sn, i) => { sn.style.left = Math.max(0, L.X[i] - L.sw * s * 0.5 - L.size * 0.3).toFixed(1) + 'px'; }); D._snapped = 1; }
        placeRead();
    }

    /* ---- writing in: the scroll ----------------------------------------- */
    // A row is written in as it comes up into the window: every Gospel's cell at
    // once (a row is read across), line after line at a pen's pace, the rubric
    // numbers with their words. Rows come one after another, never all at once;
    // a row written stays written. Rows already scrolled past are simply there,
    // and at the foot of the document everything left is written.
    const wrote = new Map();   // ri -> the time its writing starts (s)
    let iraf = 0, queued = 0;
    const PEN = { line: 0.11, base: 0.22, perChar: 0.0075 };
    function ink() {
        iraf = 0;
        if (!pages.length || dead) return;
        const vh = innerHeight || 800;
        const still = calm.matches || !o.ink;
        const t = performance.now() / 1000;
        const se = document.scrollingElement || document.documentElement;
        const remain = se.scrollHeight - (se.scrollTop + vh);
        const line = vh * 0.9 + Math.max(0, vh * 0.4 - remain);
        let busy = false;
        for (const pg of pages) {
            if (!pg.D || !pg.flow) continue;
            const top = pg.D.draw.getBoundingClientRect().top;
            if (!still) pg.flow.rows.forEach((r, k) => {
                if (wrote.has(r.ri)) return;
                const y = top + (pg.rowsS[k] ? pg.rowsS[k].x : r.top);
                if (y + r.h < 0) wrote.set(r.ri, -1e9);              // gone by already
                else if (y < line) { queued = Math.max(t, Math.min(queued + 0.32, t + 0.6)); wrote.set(r.ri, queued); }   // one after another, none kept waiting
            });
            const lh = pg.G.lh;
            const set = (d) => {
                let w = 100;
                if (!still && d._ri !== undefined && d._ri >= 0) {
                    const s0 = wrote.get(d._ri);
                    if (s0 === undefined) w = 0;
                    else {
                        const a = s0 + (d._rel / lh) * PEN.line;
                        w = Math.round(clamp((t - a) / (PEN.base + d._len * PEN.perChar), 0, 1) * 100);
                    }
                }
                if (w < 100 && wrote.get(d._ri) !== undefined) busy = true;   // queued or under the pen
                if (d._w === w) return;
                const was = d._w < 100;
                d._w = w;
                if (w >= 100) { if (was) { d.classList.remove('is-ink'); d.style.removeProperty('--w'); d._c = d.className; } }
                else { d.style.setProperty('--w', w); if (!was) { d.classList.add('is-ink'); d._c = d.className; } }
            };
            for (const d of pg.D.pool.values()) set(d);
            for (const ds of pg.D.labels) for (const d of ds) set(d);
        }
        if (busy && !iraf) iraf = requestAnimationFrame(ink);
    }

    /* ---- lighting a row ------------------------------------------------ */
    function placeRead() {
        if (!D) return;
        const k = lit >= 0 ? flow.rows.findIndex((r) => r.ri === lit) : -1;
        root.classList.toggle('is-lit', lit >= 0);
        if (k < 0) { D.read.classList.remove('is-drawn'); D.readM.classList.remove('is-drawn'); return; }
        const firsts = flow.lines.filter((l) => l.k === k && !l.cls);
        const rel = firsts.length ? Math.min(...firsts.map((l) => l.rel)) : L.size * 0.42;
        const y = (rowsS[k] ? rowsS[k].x : flow.rows[k].top) + rel + L.lh * 0.93;
        D.read.style.top = D.readM.style.top = y.toFixed(1) + 'px';
        D.read.classList.add('is-drawn'); D.readM.classList.add('is-drawn');
    }
    function paint() {
        if (!pages.length) return;
        const r = pinned >= 0 ? pinned : lastIn === 'focus' && focusR >= 0 ? focusR : hover >= 0 ? hover : focusR;
        const fresh = r !== lit;
        lit = r;
        const keep = PG;
        for (const pg of pages) {
            if (!pg.D || !pg.flow) continue;
            use(pg);
            if (fresh && r >= 0 && !calm.matches) for (const nd of [D.read, D.readM]) { nd.classList.add('is-reset'); nd.classList.remove('is-drawn'); void nd.offsetWidth; nd.classList.remove('is-reset'); }
            draw();
        }
        if (keep) use(keep);
        if (r >= 0) root.dataset.cnRow = String(r); else delete root.dataset.cnRow;
        ink();
    }
    const pageOf = (t) => { const p = t && t.closest ? t.closest('.cn-page') : null; return p ? pages[+p.dataset.p] : null; };
    const localY = (clientY) => clientY - D.draw.getBoundingClientRect().top;
    const localX = (clientX) => clientX - D.arcade.getBoundingClientRect().left;
    // the row (its place on this page) under a point, or -1
    function rowAt(clientY) {
        if (!flow || !D) return -1;
        const y = localY(clientY);
        const top = (i) => (rowsS[i] ? rowsS[i].x : flow.rows[i].top);
        const last = flow.rows.length - 1;
        if (last < 0 || y < top(0) || y > top(last) + flow.rows[last].h) return -1;
        let r = 0;
        for (let i = 0; i <= last; i++) if (top(i) <= y) r = i;
        return r;
    }
    function slotAt(x) {
        for (let i = 0; i < src.n; i++) if (x < jointX(i + 1)) return i;
        return src.n - 1;
    }

    /* ---- finding a passage: a click opens the row ------------------------ */
    const pieces = (ri) => pages.reduce((a, pg) => a + pg.slices.filter((sl) => sl.ri === ri).length, 0);
    const canOpen = (ri) => ri >= 0 && src.cols.some((c) => c.items[ri].full);
    function choose(ri, how) {
        if (ri === pinned || ri < 0) { pinned = -1; open = -1; }
        else { pinned = ri; open = canOpen(ri) ? ri : -1; }
        kickAll();
        paint();
        const name = (r) => (src.rows[r].label ? src.rows[r].label.textContent.trim() : `Row ${r + 1}`);
        if (open >= 0) {
            say(`${name(open)}: the passage is opened in every column.`);
            carryReader(open, how);
        }
    }
    // the reader is carried to the opened row: once the page has closed up round it,
    // if it is not in view, the window is scrolled to it
    let carryT = 0;
    function carryReader(ri, how) {
        clearTimeout(carryT);
        carryT = setTimeout(() => {
            const pg = pages.find((q) => q.slices.some((sl) => sl.ri === ri));
            if (!pg || !pg.D || !pg.flow) return;
            const k = pg.flow.rows.findIndex((r) => r.ri === ri);
            const top = pg.D.draw.getBoundingClientRect().top + pg.flow.rows[k].top - pg.G.size * 2.2;
            const bottom = top + pg.flow.rows[k].h + pg.G.size * 3;
            const vh = innerHeight;
            if (top >= 0 && bottom <= vh) return;
            // bring it into view: its foot up into the window, but never its head out of it
            const by = top < 0 ? top - vh * 0.08 : Math.min(bottom - vh + vh * 0.06, top - vh * 0.08);
            window.scrollBy({ top: by, behavior: calm.matches ? 'auto' : 'smooth' });
        }, calm.matches ? 0 : 420);
    }

    /* ---- handling the arcade -------------------------------------------- */
    // How far joint j may go: every bay keeps room for its widest word, no
    // arch is scaled below half or above five thirds, the outer columns stay
    // near the page.
    function limits(j) {
        const n = src.n, s = L.s;
        const yb = Math.floor((L.neckY + L.lh * 2) / SIL_STEP);
        const room = (i) => {
            const c = order[i];
            const w = Math.max(L.size * 3.6, ...c.items.map((it) => widestWord(it, L.size)));
            // the text's widest word, its margins, the two columns' half-widths in the body, and the stop's give
            return Math.max(w + 2 * L.pad + L.sil[i].Rs[yb] - L.sil[i + 1].Ls[yb] + L.size * 0.5, L.bw[i] * s * 0.5);
        };
        let lo = -Infinity, hi = Infinity;
        if (j > 0) { lo = jointX(j - 1) + room(j - 1); hi = Math.min(hi, jointX(j - 1) + L.bw[j - 1] * s * 1.66); }
        const outer = L.plate ? 0.06 : 0.18;   // a plate's outer columns keep clear of its trees
        if (j === 0) lo = L.X[0] - L.bw[0] * s * outer;
        if (j < n) { hi = Math.min(hi, jointX(j + 1) - room(j)); lo = Math.max(lo, jointX(j + 1) - L.bw[j] * s * 1.66); }
        if (j === n) hi = L.X[n] + L.bw[n - 1] * s * outer;
        return [lo - L.X[j], hi - L.X[j]];
    }
    function holdTo(j, want) {
        const [lo, hi] = limits(j);
        // past the limit the stone gives a little, like a weight against a stop
        const give = (d) => Math.min(L.size * 0.35, d * 0.04);
        let t = want < lo ? lo - give(lo - want) : want > hi ? hi + give(want - hi) : want;
        if (PG.stop && PG.stop[j]) t = clamp(t, PG.stop[j][0], PG.stop[j][1]);
        J[j].t = t; J[j].held = true;
        kick();
    }
    function release(j) { if (!J[j]) return; J[j].t = 0; J[j].held = false; if (PG.stop) delete PG.stop[j]; kick(); }

    // Put column c at slot ns: on every page the others keep where they were drawn and slide.
    function reorder(c, ns, except) {
        const keep = PG;
        const before = pages.map((pg) => { use(pg); return order.map((q, i) => [q, jointX(i)]); });
        const slot = order.indexOf(c);
        order.splice(slot, 1); order.splice(ns, 0, c);
        pages.forEach((pg, p) => {
            use(pg);
            for (const [q, x] of before[p]) if (!(q === c && pg === except)) dsOf(q).x += x - jointX(order.indexOf(q));
            pg.active = true;
        });
        use(keep);
    }
    function startCarry(c, clientX) {
        carry = { pg: PG, col: c, x0: clientX, slot0: order.indexOf(c), dx: dsOf(c).x, base: dsOf(c).x };
        carry.left0 = jointX(carry.slot0);
        root.classList.add('is-carrying');
        kick();
    }
    function moveCarry(clientX) {
        use(carry.pg);
        const c = carry.col;
        let slot = order.indexOf(c);
        const want = carry.left0 + (clientX - carry.x0) + carry.base;   // where its left edge is wanted
        const centre = want + (jointX(slot + 1) - jointX(slot)) / 2;
        const ns = clamp(slotAt(centre), 0, src.n - 1);
        if (ns !== slot) { reorder(c, ns, carry.pg); slot = ns; kick(null); }
        carry.dx = want - jointX(slot);
        kick();
    }
    function endCarry() {
        use(carry.pg);
        const c = carry.col;
        dsOf(c).x = carry.dx; dsOf(c).v = 0;
        const moved = order.indexOf(c) !== carry.slot0;
        carry = null;
        root.classList.remove('is-carrying');
        if (moved) commitOrder(c);
        kickAll();
    }
    // The real table follows the drawing: its columns are put in the new order.
    function commitOrder(moved) {
        const t = readTable(table);
        const rowsEls = [t.headRow, ...t.rows.map((r) => r.el)].filter(Boolean);
        rowsEls.forEach((tr) => {
            const skip = tr === t.headRow ? t.hskip : t.skip;
            const cells = [...tr.cells].slice(skip);
            order.forEach((c) => { if (cells[c.idx]) tr.appendChild(cells[c.idx]); });
        });
        order.forEach((c, i) => { c.idx = i; });
        src.cols = order.slice();
        const keep = PG;
        pages.forEach((pg) => { use(pg); renderPager(); });
        use(keep);
        const at = order.indexOf(moved);
        say(`${moved.name || 'Column'} moved to column ${at + 1} of ${src.n}.`);
        root.dispatchEvent(new CustomEvent('canon-tables:reorder', { bubbles: true, detail: { order: order.map((c) => c.name) } }));
        // a Gospel in a narrower bay may no longer fit its page: once the stone has
        // settled, the run of pages is laid out again in the new order
        clearTimeout(repT);
        const again = () => { if (dead) return; if (drag || carry || pages.some((pg) => pg.active)) { repT = setTimeout(again, 250); return; } relayout(true); };
        repT = setTimeout(again, calm.matches ? 0 : 700);
    }
    let repT = 0;
    function moveCol(c, dir) {
        const i = order.indexOf(c), j = clamp(i + dir, 0, src.n - 1);
        if (i === j) return;
        reorder(c, j, null);
        commitOrder(c);
        kickAll();
    }
    let live = null;
    function say(msg) { if (live) { live.textContent = ''; setTimeout(() => { if (live) live.textContent = msg; }, 30); } }
    // the page most in view (for the keyboard's lean)
    function pageInView() {
        let best = pages[0], bv = -1;
        for (const pg of pages) {
            if (!pg.D) continue;
            const r = pg.D.draw.getBoundingClientRect();
            const v = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0);
            if (v > bv) { bv = v; best = pg; }
        }
        return best;
    }

    /* ---- input ---------------------------------------------------------- */
    let press = null, suppressClick = false;
    function wire() {
        // pointer: a column by its grip; a Gospel by its text; a click opens a row
        on(host, 'pointerdown', (e) => {
            if (!pages.length || e.button > 0) return;
            const pg = pageOf(e.target);
            if (!pg || !pg.D) return;
            use(pg);
            const grip = e.target.closest('.cn-grip');
            if (grip) {
                const j = +grip.dataset.j;
                drag = { pg, j, id: e.pointerId, x0: e.clientX, off: J[j].x };
                try { grip.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
                root.classList.add('is-dragging');
                holdTo(j, J[j].x);
                if (e.pointerType === 'mouse') e.preventDefault();
                return;
            }
            if (!e.target.closest('.cn-draw') || L.mode !== 'folio') return;
            const x = localX(e.clientX);
            const c = order[slotAt(x)];
            press = { pg, id: e.pointerId, x: e.clientX, y: e.clientY, c, t: performance.now(), mouse: e.pointerType === 'mouse', timer: 0 };
            if (!press.mouse) press.timer = setTimeout(() => { if (press && !carry) { use(press.pg); startCarry(press.c, press.x); try { host.setPointerCapture(press.id); } catch (err) { /* fine */ } } }, 380);
        });
        on(host, 'pointermove', (e) => {
            if (drag && e.pointerId === drag.id) { use(drag.pg); holdTo(drag.j, drag.off + (e.clientX - drag.x0)); return; }
            if (press && e.pointerId === press.id) {
                const dx = e.clientX - press.x, dy = e.clientY - press.y;
                if (!carry) {
                    if (press.mouse && Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) { use(press.pg); startCarry(press.c, press.x); try { host.setPointerCapture(press.id); } catch (err) { /* fine */ } }
                    else if (!press.mouse && Math.hypot(dx, dy) > 9) { clearTimeout(press.timer); press = null; }
                }
                if (carry) moveCarry(e.clientX);
                return;
            }
            if (e.pointerType !== 'mouse' || !e.target.closest('.cn-draw')) return;
            const pg = pageOf(e.target);
            if (!pg) return;
            use(pg);
            const k = rowAt(e.clientY), r = k >= 0 ? PG.slices[k].ri : -1;
            if (r !== hover) { hover = r; lastIn = 'hover'; paint(); }
        });
        const up = (e) => {
            if (drag && e.pointerId === drag.id) { use(drag.pg); release(drag.j); drag = null; root.classList.remove('is-dragging'); suppressClick = true; kickAll(); return; }
            if (press && e.pointerId === press.id) {
                clearTimeout(press.timer);
                if (carry) { endCarry(); suppressClick = true; }
                press = null;
            }
        };
        on(host, 'pointerup', up);
        on(host, 'pointercancel', up);
        on(host, 'lostpointercapture', (e) => { if (drag && e.pointerId === drag.id) up(e); });
        // while a Gospel is carried on a phone, the page must not scroll under it
        on(host, 'touchmove', (e) => { if (carry || drag) { if (e.cancelable) e.preventDefault(); } }, { passive: false });
        on(host, 'pointerleave', () => { if (hover >= 0) { hover = -1; paint(); } });
        on(host, 'click', (e) => {
            const b = e.target.closest('.cn-pager button');
            if (b) { const pg = pageOf(b); if (pg) { use(pg); scrollToCol(+b.dataset.col); } return; }
            if (suppressClick) { suppressClick = false; return; }
            if (!e.target.closest('.cn-draw')) return;
            const pg = pageOf(e.target);
            if (!pg) return;
            use(pg);
            const k = rowAt(e.clientY);
            choose(k >= 0 ? PG.slices[k].ri : -1, 'click');
        });
        on(document, 'pointerdown', (e) => { if (pinned >= 0 && !root.contains(e.target)) choose(-1); });
        on(document, 'keydown', (e) => { if (e.key === 'Escape' && pinned >= 0) choose(-1); });
        on(window, 'scroll', () => { if (!iraf) iraf = requestAnimationFrame(ink); }, { passive: true });

        // keyboard: the row heads of the real table (one tab stop, up/down; Enter opens)...
        const rowHeads = src.rows.map((r) => r.label || r.cells[0]).filter(Boolean);
        rowHeads.forEach((h, i) => {
            const had = h.getAttribute('tabindex');
            h.tabIndex = i === 0 ? 0 : -1; h.dataset.cnR = i;
            added.push(() => { if (had === null) h.removeAttribute('tabindex'); else h.setAttribute('tabindex', had); delete h.dataset.cnR; });
        });
        // ...and its column heads (one tab stop: left/right, Shift carries, Alt leans the shaft)
        src.cols.forEach((c, i) => {
            if (!c.headEl) return;
            const had = c.headEl.getAttribute('tabindex');
            c.headEl.tabIndex = i === 0 ? 0 : -1;
            c.headEl.dataset.cnC = c.id;
            added.push(() => { if (had === null) c.headEl.removeAttribute('tabindex'); else c.headEl.setAttribute('tabindex', had); delete c.headEl.dataset.cnC; });
        });
        on(table, 'focusin', (e) => {
            const h = e.target.closest('[data-cn-r]');
            if (h) {
                focusR = +h.dataset.cnR; lastIn = 'focus';
                rowHeads.forEach((x, i) => { x.tabIndex = i === focusR ? 0 : -1; });
                revealRow(focusR);
                paint(); return;
            }
            const ch = e.target.closest('[data-cn-c]');
            if (ch) {
                const c = src.cols.find((q) => String(q.id) === ch.dataset.cnC);
                focusC = order.indexOf(c);
                src.cols.forEach((q) => { if (q.headEl) q.headEl.tabIndex = q === c ? 0 : -1; });
                if (pages[0] && pages[0].G.mode === 'swipe') { use(pageInView()); scrollToCol(focusC); }
                paint();
            }
        });
        on(table, 'focusout', (e) => {
            const to = e.relatedTarget && e.relatedTarget.closest ? e.relatedTarget : null;
            if (!to || !to.closest('[data-cn-r]')) { if (focusR >= 0) { focusR = -1; paint(); } }
            if (!to || !to.closest('[data-cn-c]')) { if (focusC >= 0) { const j = focusC + 1; focusC = -1; pages.forEach((pg) => { use(pg); release(j); }); paint(); } }
        });
        on(table, 'keydown', (e) => {
            const h = e.target.closest('[data-cn-r]');
            if (h) {
                const i = +h.dataset.cnR;
                let j = -1;
                if (e.key === 'ArrowDown') j = Math.min(rowHeads.length - 1, i + 1);
                else if (e.key === 'ArrowUp') j = Math.max(0, i - 1);
                else if (e.key === 'Home') j = 0;
                else if (e.key === 'End') j = rowHeads.length - 1;
                else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(i, 'key'); return; }
                else if (pages[0] && pages[0].G.mode === 'swipe' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
                    use(pageOf(rowPageEl(i)) || pages[0]);
                    scrollToCol(clamp(currentCol() + (e.key === 'ArrowRight' ? 1 : -1), 0, src.n - 1)); e.preventDefault(); return;
                }
                if (j >= 0) { e.preventDefault(); rowHeads[j].focus(); }
                return;
            }
            const ch = e.target.closest('[data-cn-c]');
            if (!ch || !pages.length) return;
            const c = src.cols.find((q) => String(q.id) === ch.dataset.cnC);
            const i = order.indexOf(c);
            const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
            if (!dir) return;
            e.preventDefault();
            if (e.shiftKey) {
                moveCol(c, dir);
                focusC = order.indexOf(c);
                ch.focus();
                paint();
            } else if (e.altKey) {
                // lean the shaft on the column's right, on the page in view: a shove, held a moment
                const pg = use(pageInView());
                const j = i + 1;
                holdTo(j, J[j].t + dir * L.bw[Math.min(i, src.n - 1)] * L.s * 0.12);
                clearTimeout(c._lean);
                c._lean = setTimeout(() => { use(pg); release(j); }, 900);
            } else {
                const k = clamp(i + dir, 0, src.n - 1);
                if (order[k].headEl) order[k].headEl.focus();
            }
        });
    }
    const rowPageEl = (ri) => { const pg = pages.find((q) => q.slices.some((sl) => sl.ri === ri)); return pg && pg.D ? pg.D.page : null; };
    function revealRow(ri) {
        const pg = pages.find((q) => q.slices.some((sl) => sl.ri === ri));
        if (!pg || !pg.D || !pg.flow) return;
        const k = pg.flow.rows.findIndex((r) => r.ri === ri);
        const rect = pg.D.draw.getBoundingClientRect();
        const top = rect.top + pg.flow.rows[k].top, bottom = top + pg.flow.rows[k].h;
        if (top < 0 || bottom > innerHeight) window.scrollBy({ top: top - innerHeight * 0.3, behavior: calm.matches ? 'auto' : 'smooth' });
    }
    function currentCol() {
        if (!D || !L) return 0;
        const x = D.scroll.scrollLeft + L.sw * L.s;
        let best = 0;
        for (let i = 0; i < src.n; i++) if (Math.abs(jointX(i) - x) < Math.abs(jointX(best) - x)) best = i;
        return best;
    }
    function scrollToCol(i) {
        if (!D || !L || L.mode !== 'swipe') return;
        D.scroll.scrollTo({ left: Math.max(0, jointX(i) - L.sw * L.s * 0.5 - L.size * 0.3), behavior: calm.matches ? 'auto' : 'smooth' });
    }
    function markPager() {
        if (!D || !D.pager) return;
        const c = currentCol();
        D.pager.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-current', i === c ? 'true' : 'false'));
    }
    // swiping one page of a run swipes them all, so the same Gospel stays in view
    let syncing = false;
    function syncFrom(pg) {
        if (syncing) return;
        syncing = true;
        use(pg);
        const x = D.scroll.scrollLeft;
        let i = 0;
        while (i < src.n - 1 && L.X[i + 1] <= x) i++;
        const fr = clamp((x - L.X[i]) / (L.X[i + 1] - L.X[i]), 0, 1);
        markPager();
        for (const q of pages) {
            if (q === pg || !q.D) continue;
            use(q);
            q.D.scroll.scrollLeft = L.X[i] + fr * (L.X[i + 1] - L.X[i]) + (x - pg.G.X[i] - fr * (pg.G.X[i + 1] - pg.G.X[i]));
            markPager();
        }
        use(pg);
        requestAnimationFrame(() => { syncing = false; });
    }

    /* ---- layout on size ---------------------------------------------- */
    let lastW = -1, rraf = 0;
    const contentWidth = () => { const cs = getComputedStyle(root); return root.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); };
    function relayout(force) {
        rraf = 0;
        if (dead || !api || !src) return;
        const T = Math.floor(contentWidth());
        if (!force && T === lastW) return;
        lastW = T;
        const t0 = performance.now();
        const keepCol = pages[0] && pages[0].D && pages[0].G.mode === 'swipe' ? (use(pages[0]), currentCol()) : 0;
        drag = null; carry = null; press = null;
        host.innerHTML = '';
        pages = paginate(T);
        const p0 = pages[0].G.f;
        pages.forEach((pg, p) => {
            build(pg, p);
            setRowsS([]);
            setFlow(compose());
            setRowsS(flow.rows.map((r) => ({ x: r.top, v: 0 })));
            draw();
            if (pg.G.mode === 'swipe') {
                on(D.scroll, 'scroll', () => syncFrom(pg), { passive: true });
                D.scroll.scrollLeft = Math.max(0, jointX(keepCol) - L.sw * L.s * 0.5 - L.size * 0.3);   // on a bay, never on the margin
            }
            pg.active = false;
        });
        use(pages[0]);
        root.classList.add('is-drawn');
        root.dataset.cnMode = pages[0].G.mode;
        root.dataset.cnPages = String(pages.length);
        root.dataset.cnSolve = `${(performance.now() - t0).toFixed(1)}ms folios=${pages.map((pg) => pg.G.f.id).join(',')} n=${src.n} s=${pages.map((pg) => pg.G.s.toFixed(3)).join(',')} mode=${pages[0].G.mode} first=${p0.id}`;
        lit = -1; paint();
        // the folios after the first are fetched as they come near
        pages.slice(1).forEach((pg) => { const f = pg.G.f; [f.arches, ...f.capitals, ...f.shafts, ...f.bases].filter(Boolean).forEach((q) => preload(new URL(q.file, new URL(o.src, document.baseURI)).href)); });
    }

    /* ---- start -------------------------------------------------------- */
    (async () => {
        try {
            const t = readTable(table);
            if (t.n < 2 || t.n > 6 || !t.uniform) { root.classList.add('is-plain'); return; }
            const pick = async () => {
                if (o.src) return loadManifest(new URL(o.src, document.baseURI).href);
                if (o.hand !== 'metz') {
                    o.src = SRC.roslin;
                    const m = await loadManifest(o.src);
                    if (o.hand === 'roslin' || m.folios.some((f) => f.cols.length - 1 === t.n)) return m;
                }
                o.src = SRC.metz;
                return loadManifest(o.src);
            };
            [api, man] = await Promise.all([import('./vendor/pretext/layout.js'), pick()]);
            root.dataset.cnHand = man.hand || 'metz';
            if (!o.maxScale) o.maxScale = man.maxScale || 0.56;
            for (const f of man.folios) if (f.kind === 'plate' && !f.arches) {
                f.arches = { ...f.plate, intr: null };
                f.spring = f.band; f.neck = f.band; f.btop = f.base;
            }
            const cellEl = table.querySelector('tbody td') || table.querySelector('td');
            const headEl = table.querySelector('thead th') || cellEl;
            const labEl = table.querySelector('tbody th') || cellEl;
            fonts = { cell: fontOf(cellEl), head: fontOf(headEl), lab: fontOf(labEl) };
            try {
                await Promise.all([fonts.cell, fonts.head, fonts.lab].map((f) => document.fonts.load(spec(f, 16))));
                await document.fonts.ready;
            } catch (e) { /* measure what we have */ }
            if (dead) return;
            const item = (el, f, upper) => {
                const flow = flowOf(el, upper);
                const it = { flow, f, P: prep(flow, f) };
                if (el.querySelector('[data-more],[data-less]')) {
                    const whole = flowOf(el, upper, true);
                    if (whole.text !== flow.text) it.full = { flow: whole, f, P: prep(whole, f) };
                }
                return it;
            };
            src = {
                n: t.n, hasLabels: t.hasLabels,
                rows: t.rows.map((r) => ({ el: r.el, label: r.label, cells: r.cells, labelItem: r.label ? item(r.label, fonts.lab) : null })),
                captionItem: t.caption ? { flow: flowOf(t.caption) } : null,
            };
            // a column: its head and its cells, carried as one
            src.cols = Array.from({ length: t.n }, (_, i) => ({
                id: i, idx: i, name: t.heads[i] ? t.heads[i].textContent.trim() : '', headEl: t.heads[i] || null,
                head: t.heads[i] ? item(t.heads[i], fonts.head, true) : null,
                items: t.rows.map((r) => item(r.cells[i], fonts.cell)),
            }));
            order = src.cols.slice();
            const first = runFor(t.n)(0);
            const parts = [first.arches, ...first.capitals, ...first.shafts, ...first.bases].filter(Boolean);
            await Promise.all(parts.map((p) => preload(new URL(p.file, new URL(o.src, document.baseURI)).href)));
            if (dead) return;
            host = document.createElement('div');
            host.className = 'cn-drawing';
            table.after(host);
            live = document.createElement('p');
            live.className = 'cn-sr'; live.setAttribute('aria-live', 'polite');
            host.after(live);
            added.push(() => live && live.remove());
            wire();
        } catch (e) {
            console.warn('canon-tables: left as a plain table', e);
            root.classList.add('is-plain');
            return;
        }
        relayout(true);
        const ro = new ResizeObserver(() => { if (!rraf && !dead) rraf = requestAnimationFrame(() => relayout(false)); });
        ro.observe(root);
        const io = new IntersectionObserver((en) => { visible = en[0].isIntersecting; if (visible) kick(null); }, { rootMargin: '200px' });
        io.observe(root);
        on(calm, 'change', () => { kickAll(); ink(); });
        on(window, 'resize', () => { if (!iraf) iraf = requestAnimationFrame(ink); });
        off.push(() => { ro.disconnect(); io.disconnect(); cancelAnimationFrame(rraf); cancelAnimationFrame(raf); cancelAnimationFrame(iraf); clearTimeout(carryT); clearTimeout(repT); });
    })();

    return function destroy() {
        dead = true;
        off.forEach((f) => f());
        added.forEach((f) => f());
        if (host) host.remove();
        host = null; pages = []; PG = null; L = null; D = null;
        root.classList.remove('is-drawn', 'is-lit', 'is-plain', 'is-dragging', 'is-carrying');
        delete root.dataset.cnMode; delete root.dataset.cnHand; delete root.dataset.cnSolve; delete root.dataset.cnFrame; delete root.dataset.cnJoints; delete root.dataset.cnRow; delete root.dataset.cnPages;
    };
}

// Auto-start every [data-canon-tables] once it is near the viewport.
function autoStart(el) {
    if (!('IntersectionObserver' in window)) return canonTables(el);
    const io = new IntersectionObserver((en) => {
        if (!en[0].isIntersecting) return;
        io.disconnect();
        canonTables(el);
    }, { rootMargin: '600px' });
    io.observe(el);
}
document.querySelectorAll('[data-canon-tables]').forEach(autoStart);
