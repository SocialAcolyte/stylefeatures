/*
 *  PRETEXT-VINE // a passionflower climbs a paragraph.
 *
 *  Markup:  <section data-pretext-vine>
 *             <div class="pv-stage">
 *               <p class="pv-text">The paragraph.</p>
 *             </div>
 *           </section>
 *  Or call pretextVine(element, { seed, side }) yourself; it returns
 *  destroy(), which also carries growTo(progress) (0..1, or null to hand
 *  growth back to the scroll).
 *
 *  The paragraph is set by Cheng Lou's pretext (vendor/pretext, MIT). The
 *  vine's path is planned first, as a plant would grow, and the text flows
 *  round it: wherever the stem crosses a line, that line is set by pretext as
 *  two runs, one each side of the stem, each justified on its own; where the
 *  flower opens over the paragraph's corner the lines flow round its petals.
 *  Those layouts are worked out once (one per obstacle, in the order the vine
 *  reaches them) and the words ease from one to the next as it climbs, so
 *  scrolling back un-flows them.
 *
 *  The stem grows along the path, its tip sweeping slow ellipses
 *  (circumnutation). At the nodes palmate leaves unfold (lobes cut from
 *  Curtis's Botanical Magazine plate 28, Passiflora caerulea, 1787) and
 *  tendrils revolve, find a real ascender, coil round it (the letter in front
 *  of the turns that pass behind it), then wind their free length into a
 *  spring that reverses its hand in the middle: a perversion. At the top the
 *  painted bud from the same plate swells and opens into Redouté's flower
 *  (Duhamel, Traité des arbres et arbustes, 1800s), split into its tepals,
 *  corona and stamens so it can open; the open flower is the plate's own
 *  pixels.
 *
 *  Events (bubbling, for sound later): pretext-vine:touch (a tendril meets a
 *  letter), pretext-vine:bloom (the flower opens past halfway).
 */

const LIB = new URL('./vendor/pretext/layout.js', import.meta.url).href;
const ASSET = (f) => new URL('./assets/' + f, import.meta.url).href;

// Painted leaf lobes (atlas): muted row at y 0, full colour at ROW2. Each is
// drawn base up, tip down; bx is the base (and tip) x, len the axis.
const LOBE = [
    { x: 0, w: 203, h: 565, bx: 74.6, len: 560 },
    { x: 213, w: 202, h: 571, bx: 107.5, len: 560 },
];
const ROW2 = 579;
// The bud (Curtis): muted row then colour row; base = stalk end, tip = bud tip.
const BUD = { w: 360, h: 398, row2: 404, base: [324, 399], tip: [59.5, 19.5] };
// The flower (Redouté), split into layers that share one frame.
const FL = {
    w: 792, h: 630, cx: 369.6, cy: 288.42, R: 345,
    tips: [-3.1067, -2.5482, -1.9373, -1.1083, -0.0349, 0.3752, 0.9076, 1.5097, 2.1904, 2.7053],
    tipR: [358, 351, 239, 283, 333, 415, 374, 338, 338, 377],
};

const calm = matchMedia('(prefers-reduced-motion: reduce)');
const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const hyp = Math.hypot;

function rng(seed) {
    let a = (seed >>> 0) || 1;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Liang's hyphenation (TeX's), as page-turn uses it: the patterns score the
// gaps between letters, odd scores are breaks; Knuth's US English patterns.
const HYPHEN = new URL('./vendor/hyphen/en-us.js', import.meta.url).href;
let hyphP = null;
const loadHyphen = () => (hyphP ||= import(HYPHEN).then((m) => {
    const pats = new Map();
    let maxLen = 0;
    for (const p of m.default.split(' ')) {
        const letters = p.replace(/[0-9]/g, '');
        const pts = new Array(letters.length + 1).fill(0);
        let k = 0;
        for (const ch of p) { if (ch >= '0' && ch <= '9') pts[k] = +ch; else k++; }
        pats.set(letters, pts);
        maxLen = Math.max(maxLen, letters.length);
    }
    const word = (w) => {
        const n = w.length, s = '.' + w.toLowerCase() + '.';
        const pts = new Array(s.length + 1).fill(0);
        for (let i = 0; i < s.length; i++) {
            for (let j = i + 1; j <= Math.min(s.length, i + maxLen); j++) {
                const pt = pats.get(s.slice(i, j));
                if (pt) for (let q = 0; q < pt.length; q++) if (pt[q] > pts[i + q]) pts[i + q] = pt[q];
            }
        }
        let out = '';
        for (let i = 0; i < n; i++) {
            if (i >= 2 && i <= n - 3 && pts[i + 1] % 2 === 1) out += '\u00ad';
            out += w[i];
        }
        return out;
    };
    return (text) => text.replace(/[A-Za-z]{6,}/g, (w) => word(w));
}).catch(() => (t) => t));

function loadImage(src) {
    return new Promise((ok, no) => {
        const im = new Image();
        im.decoding = 'async';
        im.onload = () => ok(im);
        im.onerror = no;
        im.src = src;
    });
}

// Cubic Bézier sampled into the path, roughly one point per 1.5 CSS px.
function cubic(out, p0, p1, p2, p3) {
    const n = Math.max(4, Math.ceil((hyp(p1.x - p0.x, p1.y - p0.y) + hyp(p2.x - p1.x, p2.y - p1.y) + hyp(p3.x - p2.x, p3.y - p2.y)) / 1.5));
    for (let i = out.length ? 1 : 0; i <= n; i++) {
        const t = i / n, s = 1 - t;
        out.push({
            x: s * s * s * p0.x + 3 * s * s * t * p1.x + 3 * s * t * t * p2.x + t * t * t * p3.x,
            y: s * s * s * p0.y + 3 * s * s * t * p1.y + 3 * s * t * t * p2.y + t * t * t * p3.y,
        });
    }
}

// [a, b] minus a set of intervals: the runs left for type.
function subtract(a, b, obs) {
    let runs = [[a, b]];
    for (const [o0, o1] of obs) {
        const next = [];
        for (const [r0, r1] of runs) {
            if (o1 <= r0 || o0 >= r1) { next.push([r0, r1]); continue; }
            if (o0 > r0) next.push([r0, o0]);
            if (o1 < r1) next.push([o1, r1]);
        }
        runs = next;
    }
    return runs;
}

export function pretextVine(root, opts = {}) {
    const src = root && root.querySelector('.pv-text');
    const stage = (root && root.querySelector('.pv-stage')) || root;
    if (!root || !src) return () => {};
    const seed = Number(opts.seed ?? root.dataset.seed ?? 7) | 0;
    const sidePref = opts.side ?? root.dataset.side ?? 'left';
    root.classList.add('pv');

    let dead = false;
    const off = [];
    const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); off.push(() => t.removeEventListener(ev, fn, o)); };

    const back = document.createElement('canvas');
    const front = document.createElement('canvas');
    const wordsEl = document.createElement('div');
    back.className = 'pv-back'; front.className = 'pv-front'; wordsEl.className = 'pv-words';
    for (const el of [back, front, wordsEl]) el.setAttribute('aria-hidden', 'true');
    const bx = back.getContext('2d'), fx = front.getContext('2d');
    if (!bx || !fx) return () => {};

    let api, img = {}, text = '';
    let family = 'serif', weight = '400', inkColour = '#141312', paperColour = '#f3f0e8';

    // Layout state (CSS px, stage coordinates).
    let W = 0, H = 0, dpr = 1, fs = 24, LH = 42, baseOff = 30, textTop = 0, G = 0;
    let colL = 0, colR = 0, side = -1, phone = false;
    let words = [], wordList = [], hyText = '', hyphenate = (t) => t, keys = [], ramps = [], path = [], Ltot = 1, nodes = [], flower = null, P = null;

    // Growth state.
    let target = 0, shown = -1, manual = null, visible = false, raf = 0, last = 0;
    let touched = new Set(), bloomed = false, primed = false;

    // ---- type ----------------------------------------------------------------
    const mctx = document.createElement('canvas').getContext('2d');
    const fontAt = (s) => `${weight} ${s}px ${family}`;
    const lineTop = (i) => textTop + i * LH;
    const lineBase = (i) => textTop + i * LH + baseOff;

    // Where the ascenders of a word stand (l h k d b f, t last): draw it and
    // scan between x-height and ascender height for each letter's stem.
    const scan = document.createElement('canvas');
    const sctx = scan.getContext('2d', { willReadFrequently: true });
    function ascendersOf(word) {
        const out = [];
        if (!/[lhkdbft]/.test(word)) return out;
        const K = 3, pad = fs * 0.4;
        const w = Math.ceil((mctx.measureText(word).width + pad * 2) * K), h = Math.ceil(fs * 1.4 * K);
        scan.width = w; scan.height = h;
        sctx.setTransform(K, 0, 0, K, 0, 0);
        sctx.font = fontAt(fs);
        sctx.fillStyle = '#000';
        sctx.textBaseline = 'alphabetic';
        const B = fs * 1.1;
        sctx.fillText(word, pad, B);
        const data = sctx.getImageData(0, 0, w, h).data;
        const ink = (px, py) => data[(py * w + px) * 4 + 3] > 120;
        const gl = [...word];
        let pre = 0;
        for (let i = 0; i < gl.length; i++) {
            const a = pre;
            pre = mctx.measureText(gl.slice(0, i + 1).join('')).width;
            if (!/[lhkdbft]/.test(gl[i])) continue;
            const yb = Math.round((B - fs * 0.56) * K);
            let l = -1, r = -1;
            const pxA = Math.floor((pad + a - fs * 0.04) * K), pxB = Math.ceil((pad + pre + fs * 0.04) * K);
            for (let px = pxA; px <= pxB; px++) {
                if (ink(px, yb)) { if (l < 0) l = px; r = px; } else if (l >= 0) break;
            }
            if (l < 0) continue;
            const cx = (l + r) / 2 | 0;
            let top = yb;
            while (top > 0 && ink(cx, top - 1)) top--;
            const topY = top / K - B;
            if (-topY < fs * 0.62) continue;       // a short t
            out.push({
                ch: gl[i], dx: (l + r + 1) / 2 / K - pad, half: (r - l + 1) / 2 / K,
                y0: topY + fs * 0.05, y1: -fs * 0.3,          // the coil's span, from the baseline
                pref: gl[i] === 't' ? 0.4 : 1,
            });
        }
        return out;
    }

    // Set the paragraph into the runs left by a set of obstacles (per line, a
    // list of [x0, x1]). Each run is filled by pretext and justified on its
    // own; where justifying would gape, the run is set ragged on the side that
    // faces the obstacle. Returns, per word, its x and its line.
    function flow(obsAt) {
        const nU = words.length, nW = wordList.length;
        const pos = new Float32Array(nU * 3).fill(-1);
        let cursor = { segmentIndex: 0, graphemeIndex: 0 }, wi = 0, co = 0;
        const minRun = fs * 5.5, space = words.space;   // about three words
        for (let i = 0; i < G && wi < nW; i++) {
            // A run narrower than about three words is not set on its own: if
            // the stem made it, the stem just passes between words there
            // (behind the type, with its halo); beside the flower it stays empty.
            let obs = obsAt(i), runs;
            for (let guard = 0; guard < 8; guard++) {
                runs = subtract(colL, colR, obs);
                const bad = runs.find((r) => r[1] - r[0] < minRun);
                if (!bad) break;
                const k = obs.findIndex((o) => o[2] === 's' && (Math.abs(o[0] - bad[1]) < 0.5 || Math.abs(o[1] - bad[0]) < 0.5));
                if (k < 0) { runs = runs.filter((r) => r[1] - r[0] >= minRun); break; }
                obs = obs.filter((_, j) => j !== k);
            }
            // Set the line into its runs without committing; if a run beside the
            // stem would be left with a hole (ragged by more than about an em),
            // set the line whole instead and let the stem pass behind its words.
            const setLine = (rs) => {
                let cur = cursor, w1 = wi, c1 = co, hole = false;
                const placed = [];
                for (const [a, b] of rs) {
                    if (w1 >= nW) break;
                    const range = api.layoutNextLineRange(P, cur, b - a);
                    if (!range) { w1 = nW; break; }
                    const toks = api.materializeLineRange(P, range).text.trim().split(/\s+/).filter(Boolean);
                    if (!toks.length) { cur = range.end; continue; }
                    // tokens back to words: the last may be the first part of a
                    // word broken at a hyphenation point (pretext adds the '-')
                    const pieces = [];
                    let w2 = w1, c2 = c1;
                    for (let j = 0; j < toks.length && w2 < nW; j++) {
                        const vis = toks[j], rest = wordList[w2].t.slice(c2);
                        const broke = j === toks.length - 1 && vis !== rest && vis.endsWith('-') && rest.startsWith(vis.slice(0, -1));
                        const len = broke ? vis.length - 1 : rest.length;
                        pieces.push({ wi: w2, from: c2, to: c2 + len, broke, w: mctx.measureText(vis).width });
                        if (broke) c2 += len; else { w2++; c2 = 0; }
                    }
                    const n = pieces.length, sum = pieces.reduce((t, q) => t + q.w, 0);
                    const lastRun = w2 >= nW;
                    let gap = space, x = a;
                    if (n > 1 && !lastRun) gap = (b - a - sum) / (n - 1);
                    if (gap > space * 2.6 || (n === 1 && !lastRun)) {
                        gap = n > 1 && !lastRun ? Math.min(gap, space * 1.15) : space;
                        const width = sum + gap * (n - 1);
                        if (!lastRun && b - a - width > fs * 0.9) hole = true;
                        if (b >= colR - 0.5 && a > colL + 0.5) x = b - width;
                    }
                    for (const q of pieces) { placed.push({ q, x }); x += q.w + gap; }
                    w1 = w2; c1 = c2; cur = range.end;
                }
                return { cur, w1, c1, hole, placed };
            };
            let res = setLine(runs);
            const stemHere = obs.filter((o) => o[2] === 's');
            if (res.hole && stemHere.length) res = setLine(subtract(colL, colR, obs.filter((o) => o[2] !== 's')).filter((r) => r[1] - r[0] >= minRun));
            for (const { q, x } of res.placed) {
                let x0 = null;
                for (const u of wordList[q.wi].units) {
                    const U = words[u];
                    if (U.start < q.from || U.end > q.to) continue;
                    if (x0 == null) x0 = U.x0;
                    pos[u * 3] = x + U.x0 - x0; pos[u * 3 + 1] = i; pos[u * 3 + 2] = q.broke && U.end === q.to ? 1 : 0;
                }
            }
            cursor = res.cur; wi = res.w1; co = res.c1;
        }
        return pos;
    }

    // ---- layout ----------------------------------------------------------------
    function layout() {
        const r = stage.getBoundingClientRect();
        W = Math.round(r.width); H = Math.round(r.height);
        phone = W < 620;
        dpr = Math.min(phone ? 3 : 2, devicePixelRatio || 1);
        const rand = rng(seed);
        const gutter = phone ? Math.max(22, W * 0.06) : Math.max(48, W * 0.06);
        side = sidePref === 'right' ? 1 : -1;

        // Size: generous serif, shrunk until the paragraph (with a line to
        // spare for what the vine displaces), the bud above it and the stem's
        // way in all fit.
        fs = clamp(13 + W * 0.009, 16, 26);
        let colW, N0, Rf;
        for (let tries = 0; tries < 30; tries++) {
            LH = Math.round(fs * (phone ? 1.72 : 1.8) * 100) / 100;
            colW = Math.min(W - gutter * 2, fs * 28);
            colL = Math.round((W - colW) / 2); colR = colL + colW;
            P = api.prepareWithSegments(hyText, fontAt(fs));
            N0 = api.layout(P, colW, LH).lineCount;
            Rf = phone ? clamp(fs * 5.4, 70, Math.min(100, W * 0.25)) : clamp(fs * 5.2, 90, 140);
            const textH = (N0 + 1) * LH;
            const above = phone ? Rf * 1.55 + 10 : Rf * 1.05 + 12;
            const below = Math.max(LH * 1.3, H * 0.05);
            if (textH + above + below <= H || fs <= 14) {
                textTop = Math.round(above + Math.max(0, (H - textH - above - below) * (phone ? 0.45 : 0.42)));
                break;
            }
            fs -= 0.5;
        }
        G = N0 + 3;
        mctx.font = fontAt(fs);
        const mm = mctx.measureText('Hxg');
        const fa = mm.fontBoundingBoxAscent ?? fs * 0.9, fd = mm.fontBoundingBoxDescent ?? fs * 0.3;
        baseOff = (LH - (fa + fd)) / 2 + fa;

        // Words, each split into its syllables (TeX hyphenation points), so a
        // justified run can break a word; the syllables are the units placed.
        words = []; wordList = [];
        hyText.split(/\s+/).filter(Boolean).forEach((hw, wi) => {
            const t = hw.replace(/\u00ad/g, '');
            const pre = (n) => mctx.measureText(t.slice(0, n)).width;
            const units = [];
            let start = 0;
            for (const part of hw.split('\u00ad')) {
                const end = start + part.length;
                units.push(words.length);
                words.push({ t: part, wi, start, end, x0: pre(start), w: pre(end) - pre(start), asc: [] });
                start = end;
            }
            for (const a of ascendersOf(t)) {
                const u = units.map((k) => words[k]).find((U) => a.dx >= U.x0 - 0.5 && a.dx < U.x0 + U.w + 0.5);
                if (u) u.asc.push({ ...a, dx: a.dx - u.x0 });
            }
            wordList.push({ t, units });
        });
        words.space = mctx.measureText(' ').width;

        // ---- the flower's place: over the paragraph's top corner ---------------
        const E = phone
            ? { x: side < 0 ? Math.max(Rf + 4, colL + Rf * 0.62) : Math.min(W - Rf - 4, colR - Rf * 0.62), y: textTop - Rf * 0.42 }
            : { x: side < 0 ? colL - Rf * 0.22 : colR + Rf * 0.22, y: lineTop(0) + LH * 0.15 };
        const rot = side < 0 ? 0.15 : -0.15;           // the plate turned a little
        const kImg = Rf / FL.R;
        flower = { E, Rf, rot, k: kImg };

        // ---- plan the climb, bottom to top --------------------------------------
        // The vine leans from the far side toward the flower, swaying, at most
        // a few ems sideways per line. It crosses each line either in a margin
        // or well inside the column (so the runs either side can hold words).
        const mg = Math.min(fs * 1.4, (colL - 6) * 0.5);
        const inside = (x) => x > colL + fs * 5 && x < colR - fs * 5;
        const roomy = colL > fs * 2.2;                 // a margin wide enough to climb in
        const startX = roomy ? (side < 0 ? colR + mg : colL - mg) : (side < 0 ? colR - fs * 5.2 : colL + fs * 5.2);
        const endX = E.x - side * Rf * 0.45;          // up behind the flower
        const phase = rand() * TAU;
        const cross = new Array(G);
        let prev = startX;
        for (let i = G - 1; i >= 0; i--) {
            const k = (G - 1 - i) / (G - 1);
            let want = mix(startX, endX, Math.pow(k, 0.85)) + (colR - colL) * 0.13 * Math.sin(phase + k * TAU * 0.9) * Math.sin(Math.PI * k);
            if (i <= 2) want = endX;
            let x = clamp(want, prev - fs * 4.5, prev + fs * 4.5);
            if (i > 2 && !inside(x) && (!roomy || (x > colL - mg * 0.5 && x < colR + mg * 0.5))) {
                // too close to an edge for a run beside it: commit to the margin or the text
                const toIn = x < (colL + colR) / 2 ? colL + fs * 5.2 : colR - fs * 5.2;
                const toOut = x < (colL + colR) / 2 ? colL - mg : colR + mg;
                x = !roomy || Math.abs(x - toIn) < Math.abs(x - toOut) ? toIn : toOut;
            }
            cross[i] = x; prev = x;
        }

        path = [];
        const mid = (i) => ({ x: cross[i], y: lineBase(i) - fs * 0.3 });
        const m0 = mid(G - 1);
        const start = { x: m0.x + (rand() - 0.5) * fs, y: Math.max(H + 8, m0.y + LH) };
        cubic(path, start, { x: start.x, y: mix(start.y, m0.y, 0.5) }, { x: m0.x, y: m0.y + LH * 0.6 }, m0);
        const nodeAt = [];
        const h = LH * 0.8;
        for (let i = G - 1; i > 0; i--) {
            const A = mid(i), B = mid(i - 1);
            const i0 = path.length;
            cubic(path, path[path.length - 1], { x: A.x, y: A.y - h }, { x: B.x, y: B.y + h }, B);
            nodeAt.push({ idx: Math.round(mix(i0, path.length - 1, 0.5)), below: i });
        }
        // above the top line: the flower's node, then the shoot's tip
        const P0 = path[path.length - 1];
        const NF = { x: P0.x - side * fs * 0.6, y: lineTop(0) - LH * 0.25 };
        if (phone) NF.y = Math.min(NF.y, E.y + Rf * 0.25);
        cubic(path, P0, { x: P0.x, y: P0.y - LH * 0.6 }, { x: NF.x + side * fs * 0.4, y: NF.y + LH * 0.3 }, NF);
        const flowerIdx = path.length - 1;
        const tip = { x: NF.x - side * LH * 0.9, y: Math.max(12, NF.y - LH * 1.5) };
        cubic(path, NF, { x: NF.x, y: NF.y - LH * 0.6 }, { x: tip.x + side * LH * 0.5, y: tip.y + LH * 0.4 }, tip);

        let s = 0;
        for (let i = 0; i < path.length; i++) {
            const p = path[i], q = path[Math.min(path.length - 1, i + 1)], o = path[Math.max(0, i - 1)];
            if (i) s += hyp(p.x - o.x, p.y - o.y);
            p.s = s;
            const tx = q.x - o.x, ty = q.y - o.y, l = hyp(tx, ty) || 1;
            p.tx = tx / l; p.ty = ty / l; p.nx = -p.ty; p.ny = p.tx;
        }
        Ltot = s;
        flower.s = path[flowerIdx].s;

        // ---- obstacles: the stem through each line, the flower over the corner --
        const stemObs = [];
        const clear = fs * 0.105 + fs * 0.35;           // the stem's half-width and 0.35em of air
        for (let i = 0; i < G; i++) {
            const y0 = lineBase(i) - fs * 0.85, y1 = lineBase(i) + fs * 0.35;
            let x0 = Infinity, x1 = -Infinity, sIn = Infinity;
            for (const p of path) if (p.y >= y0 && p.y <= y1) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); sIn = Math.min(sIn, p.s); }
            if (x1 < colL - 1 || x0 > colR + 1 || !isFinite(sIn)) continue;
            stemObs.push({ line: i, a: x0 - clear, b: x1 + clear, s: sIn });
        }
        stemObs.sort((a, b) => a.s - b.s);
        // The open flower's outline as a star of its ten tips, in stage px.
        const star = (f) => {
            const pts = [];
            for (let k = 0; k < 10; k++) {
                const a0 = FL.tips[k] + rot, a1 = (FL.tips[k] + FL.tips[(k + 1) % 10] + (k === 9 ? TAU : 0)) / 2 + rot;
                const rt = FL.tipR[k] * kImg * f, rv = Math.min(FL.tipR[k], FL.tipR[(k + 1) % 10]) * kImg * 0.62 * f;
                pts.push([E.x + Math.cos(a0) * rt, E.y + Math.sin(a0) * rt], [E.x + Math.cos(a1) * rv, E.y + Math.sin(a1) * rv]);
            }
            return pts;
        };
        const starSpan = (f, i) => {
            const y0 = lineBase(i) - fs * 0.8, y1 = lineBase(i) + fs * 0.3;
            const pts = star(f);
            let x0 = Infinity, x1 = -Infinity;
            for (let k = 0; k < pts.length; k++) {
                const [ax, ay] = pts[k], [bx2, by] = pts[(k + 1) % pts.length];
                for (let t = 0; t <= 1; t += 0.1) {
                    const x = mix(ax, bx2, t), y = mix(ay, by, t);
                    if (y >= y0 && y <= y1) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
                }
            }
            // fill between the outline crossings (a horizontal band through a star)
            return isFinite(x0) ? [x0 - fs * 0.45, x1 + fs * 0.45] : null;
        };
        const FSTEPS = [0.45, 0.7, 0.88, 1];
        // Keys: no obstacles, then each stem crossing in the order the vine
        // reaches it, then the flower at each step of opening.
        const active = [];
        keys = [];
        const obsFor = (list) => (i) => list.filter((o) => o.line === i).map((o) => [o.a, o.b, o.kind || 's']);
        keys.push(flow(obsFor(active)));
        ramps = [];
        for (const o of stemObs) {
            active.push(o);
            keys.push(flow(obsFor(active)));
            ramps.push({ kind: 's', s: o.s });
        }
        for (const f of FSTEPS) {
            const list = active.slice();
            for (let i = 0; i < G; i++) { const sp = starSpan(f, i); if (sp) list.push({ line: i, a: sp[0], b: sp[1], kind: 'f' }); }
            keys.push(flow(obsFor(list)));
            // the corner clears as the bud swells, before any tendril takes hold
            const j = ramps.filter((r) => r.kind === 'f').length;
            ramps.push({ kind: 'f', f, p0: 0.56 + j * 0.028, p1: 0.6 + j * 0.028 });
        }
        flower.star = star;

        // DOM: one span per word, moved by transform
        wordsEl.textContent = '';
        const frag = document.createDocumentFragment();
        words.forEach((w) => {
            const sp = document.createElement('span');
            sp.className = 'pv-w';
            sp.textContent = w.t;
            sp.style.lineHeight = LH + 'px';
            w.span = sp; w.cx = NaN; w.cy = NaN; w.op = NaN; w.hy = 0;
            frag.appendChild(sp);
        });
        wordsEl.appendChild(frag);
        wordsEl.style.font = fontAt(fs);

        // ---- nodes: leaves and tendrils ------------------------------------------
        nodes = [];
        const every = phone ? 2 : 1;
        const final = keys[keys.length - 1];
        const boxes = [];
        for (let k = 0; k < words.length; k++) {
            if (final[k * 3 + 1] < 0) continue;
            const x = final[k * 3], b = lineBase(final[k * 3 + 1]);
            boxes.push({ x0: x, x1: x + words[k].w, y0: b - fs * 0.72, y1: b + fs * 0.2 });
        }
        const leafS = phone ? fs * 2.25 : fs * 2.5;
        const placed = [];
        const plan = nodeAt.filter((n, i) => i % every === 0 && n.idx < flowerIdx - LH * 0.8);
        plan.push({ idx: flowerIdx, below: 0, flower: true });
        // two young nodes on the shoot beyond the flower, leaves still folded
        const tipIdx = (frac) => { const sT = mix(flower.s, Ltot, frac); let j = flowerIdx; while (j < path.length - 1 && path[j].s < sT) j++; return j; };
        plan.push({ idx: tipIdx(0.45), below: -1, young: 0.45 });
        plan.push({ idx: tipIdx(0.85), below: -1, young: 0.2 });
        plan.forEach((n, k) => {
            const p = path[n.idx];
            const lr = k % 2 === 0 ? 1 : -1;
            const node = { s: p.s, idx: n.idx, below: n.below, flower: !!n.flower, young: n.young || 0, lr };
            const size = leafS * (n.young ? 0.55 : mix(0.72, 1.12, rand()));
            const extra = !n.young && !n.flower && k % 2 === 1 && !phone;
            node.leaf = placeLeaf(p, lr, size * (extra ? 0.8 : 1), placed, rand, boxes, !!n.young);
            // the in-between nodes keep a leaf only where it lies in the clear
            if (extra && node.leaf && node.leaf.score > 0.6) return;
            if (node.leaf) placed.push(node.leaf);
            node.tendril = planTendril(node, p, rand);
            nodes.push(node);
        });

        // Contact, bottom node first, once the text has settled: the tendrils
        // revolve while the stem climbs and catch hold one after another.
        const held = nodes.filter((n) => n.tendril.target).sort((a, b) => a.s - b.s);
        held.forEach((n, i) => { n.tendril.pc = 0.68 + 0.08 * (held.length > 1 ? i / (held.length - 1) : 0); });
        for (const c of [back, front]) {
            c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
            c.style.width = W + 'px'; c.style.height = H + 'px';
        }
        wordsEl.style.width = W + 'px'; wordsEl.style.height = H + 'px';
        haloDirty = true;
        flowState = '';
    }

    // ---- leaves ----------------------------------------------------------------
    function leafLobes(L, u, tilt) {
        const spread = mix(0.12, 1, smooth(0.15, 1, u));
        const ang = [-1.3, -0.66, 0, 0.66, 1.3].map((a) => a * spread);
        const len = [0.6, 0.85, 1, 0.85, 0.6];
        return ang.map((a, i) => {
            const dx = Math.sin(a), dy = Math.cos(a) * tilt;
            const l = hyp(dx, dy);
            return { a, ux: dx / l, uy: dy / l, L: L * len[i] * mix(0.35, 1, u) * mix(0.75, 1, l) };
        });
    }
    function leafSamples(lf, u = 1) {
        const pts = [];
        const c = Math.cos(lf.rot), s = Math.sin(lf.rot);
        for (const lo of leafLobes(lf.L, u, lf.tilt)) {
            for (let t = 0.15; t <= 0.95; t += 0.2) {
                for (const o of [-0.11, 0, 0.11]) {
                    const lx = lo.ux * lo.L * t - lo.uy * lo.L * o * Math.sin(Math.PI * t);
                    const ly = lo.uy * lo.L * t + lo.ux * lo.L * o * Math.sin(Math.PI * t);
                    pts.push({ x: lf.bx + lx * c - ly * s, y: lf.by + lx * s + ly * c });
                }
            }
        }
        return pts;
    }
    // Place a leaf by scoring trial angles and sizes: as little text under it
    // as possible (never more than about a word), inside the stage, off the
    // flower and the other leaves.
    function placeLeaf(p, lr, S, placed, rand, boxes, young) {
        const up = Math.atan2(p.ty, p.tx);
        let best = null, bs = Infinity;
        const tilt = mix(0.62, 0.95, rand());
        const wordArea = fs * fs * 2.6;
        const mirror = rand() < 0.5 ? -1 : 1, tex = rand() < 0.5 ? 0 : 1;
        for (const sc of [1, 0.86, 0.72, 0.6, 0.5]) {
            for (let k = 0; k < 9; k++) {
                const dev = mix(young ? 0.3 : 0.55, young ? 1.2 : 2.1, k / 8);
                const ang = up + lr * dev;
                const lp = S * mix(0.28, 0.4, rand()) * sc;
                const lf = { bx: p.x + Math.cos(ang) * lp, by: p.y + Math.sin(ang) * lp, rot: ang - Math.PI / 2, L: S * sc, tilt, lp, nx: p.x, ny: p.y, mirror, tex };
                const pts = leafSamples(lf);
                let inText = 0, out = 0, clash = 0;
                for (const q of pts) {
                    if (q.x < 2 || q.y < 4 || q.y > H - 4) out++;
                    else if (q.x > W - 2) out += 0.15;          // may run off the page's edge
                    for (const b of boxes) if (q.x > b.x0 && q.x < b.x1 && q.y > b.y0 && q.y < b.y1) { inText++; break; }
                    if (hyp(q.x - flower.E.x, q.y - flower.E.y) < flower.Rf * 1.0) clash += 2;
                    for (const o of placed) if (hyp(q.x - o.bx, q.y - o.by) < o.L * 0.7) { clash++; break; }
                }
                const area = (S * sc) * (S * sc) * 0.55;
                const covered = (inText / pts.length) * area;
                let score = covered / wordArea + out * 0.5 + clash * 0.08 + (1 - sc) * 0.9;
                if (covered > wordArea) score += 4;
                if (score < bs) { bs = score; best = lf; lf.score = score; }
            }
        }
        return best;
    }

    // ---- tendrils ----------------------------------------------------------------
    // A tendril's letter is chosen from words that stay on their line from the
    // time it touches them to the end, and the tendril follows the letter if
    // its word slides along the line.
    function planTendril(node, p, rand) {
        const t = { lr: -node.lr, target: null, len: fs * mix(2.4, 3.2, rand()), ph: rand() * TAU, hand: rand() < 0.5 ? 1 : -1 };
        if (node.young) { t.len *= 0.5; t.dir = Math.atan2(p.ty, p.tx) + t.lr * 0.7; return t; }
        const kc = keys.length - 1;
        let best = null, bs = Infinity;
        const fin = keys[keys.length - 1];
        for (let k = 0; k < words.length; k++) {
            const w = words[k];
            if (!w.asc.length || w.used) continue;
            const li = fin[k * 3 + 1];
            if (li < 0) continue;
            let stable = true;
            for (let j = Math.max(0, kc); j < keys.length; j++) if (keys[j][k * 3 + 1] !== li) { stable = false; break; }
            if (!stable) continue;
            for (const a of w.asc) {
                const cx = keys[Math.max(0, kc)][k * 3] + a.dx, cy = lineBase(li) + (a.y0 + a.y1) / 2;
                const dx = cx - p.x, dy = cy - p.y, d = hyp(dx, dy);
                if (d < fs * 1.3 || d > fs * 6.2) continue;
                if (dy < -LH * 0.4 || dy > LH * 1.3) continue;          // a letter level with or below the node
                const drift = Math.abs(fin[k * 3] - keys[Math.max(0, kc)][k * 3]);
                if (drift > fs * 2.5 || hyp(fin[k * 3] + a.dx - p.x, dy) > fs * 6.5) continue;
                let s = Math.abs(d - fs * 3.4) / fs + (1 - a.pref) * 2 + drift / fs * 0.5;
                if (Math.sign(dx) !== t.lr) s += 1.2;
                if (node.leaf) for (const q of leafSamples(node.leaf)) if (hyp(q.x - cx, q.y - cy) < fs * 0.6) { s += 6; break; }
                if (s < bs) { bs = s; best = { k, a, li }; }
            }
        }
        if (best) {
            words[best.k].used = true;
            t.target = best;
            const x0 = keys[keys.length - 1][best.k * 3] + best.a.dx;
            t.nh = Math.max(1, Math.round(hyp(x0 - p.x, lineBase(best.li) - p.y) / (fs * 1.55)));
        } else {
            t.dir = Math.atan2(p.ty, p.tx) + t.lr * 0.9;
        }
        return t;
    }
    // The tendril's letter, now: where its word is on the screen this frame.
    function letterNow(tg) {
        const w = words[tg.k];
        const x = (isNaN(w.cx) ? keys[keys.length - 1][tg.k * 3] : w.cx) + tg.a.dx;
        const b = lineBase(tg.li);
        return { cx: x, half: tg.a.half, y0: b + tg.a.y0, y1: b + tg.a.y1 };
    }

    // ---- growth: everything is a function of progress ---------------------------
    // tau is a length of growth; the stem is drawn to min(tau, length) and each
    // node's age is tau minus its place. In line heights: one tip ellipse per
    // ~5 lines of growth; a tendril searches for ~3.5, grips over ~0.8, coils
    // its spring over ~2.2. The stem is up by ~55% of the runway, the bud
    // swells to 75%, the flower opens from 75% to 95%, then holds.
    const T_NUT = 5.2, A_EMERGE = 0.3, A_CONTACT = 3.8, A_GRIP = 0.8, A_SPRING = 2.2;
    const tauOf = (p) => (Ltot + LH * 8) * clamp((p - 0.02) / 0.65);
    const openOf = (p) => clamp((p - 0.75) / 0.2);

    // How far through the sequence of layouts the text is (0..keys-1).
    function flowAt(Lc, p) {
        let F = 0;
        for (const r of ramps) {
            if (r.kind === 's') F += smooth(r.s - LH * 1.9, r.s - LH * 0.25, Lc);
            else F += smooth(r.p0, r.p1, p);
        }
        return F;
    }

    let flowState = '';
    function placeWords(F) {
        const st = F.toFixed(4);
        if (st === flowState) return;
        flowState = st;
        const a = Math.min(keys.length - 1, Math.floor(F)), b = Math.min(keys.length - 1, a + 1);
        const t = F - a;
        const A = keys[a], B = keys[b];
        for (let k = 0; k < words.length; k++) {
            const w = words[k];
            const la = A[k * 3 + 1], lb = B[k * 3 + 1];
            let x, li, op = 1, hy;
            // syllables that change line fade out first, then the rest slide,
            // then the arrivals fade in: nothing passes through anything else
            if (la === lb || b === a) { x = mix(A[k * 3], B[k * 3], smooth(0.3, 0.7, t)); li = la; hy = (t < 0.5 ? A : B)[k * 3 + 2]; }
            else if (t < 0.5) { x = A[k * 3]; li = la; op = 1 - smooth(0, 0.3, t); hy = A[k * 3 + 2]; }
            else { x = B[k * 3]; li = lb; op = smooth(0.7, 1, t); hy = B[k * 3 + 2]; }
            if (li < 0) { op = 0; li = 0; }
            hy = hy > 0 ? 1 : 0;
            if (hy !== w.hy) { w.span.textContent = w.t + (hy ? '-' : ''); w.hy = hy; haloDirty = true; }
            const y = lineTop(li);
            if (Math.abs(x - w.cx) > 0.01 || y !== w.cy) {
                w.span.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;
                w.cx = x; w.cy = y; haloDirty = true;
            }
            if (Math.abs(op - w.op) > 0.004) {
                w.span.style.opacity = op > 0.996 ? '' : op.toFixed(3);
                w.op = op; haloDirty = true;
            }
        }
    }

    function stemAt(tau, pNow) {
        const Lc = Math.min(Ltot, tau);
        const ph = (tau / (LH * T_NUT)) * TAU;
        const A = fs * 0.9 * (1 - smooth(Ltot - LH * 0.5, Ltot + LH * 6, tau) * 0.6);
        const Ln = LH * 1.7;
        const pts = [];
        const pulls = [];
        for (const n of nodes) {
            const t = n.tendril;
            if (!t.target) continue;
            const k = smooth(t.pc + 0.02, t.pc + 0.08, pNow);
            if (k <= 0) continue;
            const p = path[n.idx], L = letterNow(t.target);
            const dx = L.cx - p.x, dy = L.y0 - p.y, d = hyp(dx, dy) || 1;
            const m = Math.min(fs * 0.3, d * 0.08) * k;
            pulls.push({ s: n.s, x: dx / d * m, y: dy / d * m });
        }
        for (let i = 0; i < path.length; i++) {
            const p = path[i];
            if (p.s > Lc) break;
            const w = smooth(Lc - Ln, Lc, p.s);
            const ox = w * w * (p.nx * A * Math.sin(ph) + p.tx * A * 0.35 * Math.cos(ph));
            const oy = w * w * (p.ny * A * Math.sin(ph) + p.ty * A * 0.35 * Math.cos(ph));
            let px = 0, py = 0;
            for (const q of pulls) {
                const z = (p.s - q.s) / (LH * 0.9), g = Math.exp(-z * z);
                px += q.x * g; py += q.y * g;
            }
            pts.push({ x: p.x + ox + px, y: p.y + oy + py, s: p.s, nx: p.nx, ny: p.ny, tx: p.tx, ty: p.ty });
        }
        return pts;
    }
    const pointAt = (pts, s) => {
        if (!pts.length) return null;
        let lo = 0, hi = pts.length - 1;
        if (s >= pts[hi].s) return pts[hi];
        while (hi - lo > 1) { const m = (lo + hi) >> 1; (pts[m].s < s ? lo = m : hi = m); }
        return pts[hi];
    };

    // ---- drawing -----------------------------------------------------------------
    const C = {
        stem: '#86915f', stemDark: '#2c3022', stemLight: 'rgba(226,229,200,0.75)',
        tendril: '#455033', tendrilCore: '#a6b083',
    };

    // The stem as the plate engraves it: woody and olive at the foot, green
    // toward the tip, a dark line down its shadow side with fine hatching
    // across it, and a light line down the lit side.
    function drawStem(ctx, pts, Lc) {
        if (pts.length < 2) return;
        const wMax = fs * 0.21, wTip = fs * 0.04;
        const wAt = (s) => {
            const age = (Lc - s) / (LH * 7);
            return wTip + (wMax - wTip) * Math.pow(clamp(age), 0.55) * mix(0.75, 1.1, clamp(1 - s / Ltot));
        };
        const L = [], R = [], ws = [];
        for (const p of pts) {
            const w = wAt(p.s) / 2;
            ws.push(w * 2);
            L.push(p.x + p.nx * w, p.y + p.ny * w);
            R.push(p.x - p.nx * w, p.y - p.ny * w);
        }
        ctx.beginPath();
        ctx.moveTo(L[0], L[1]);
        for (let i = 2; i < L.length; i += 2) ctx.lineTo(L[i], L[i + 1]);
        const end = pts[pts.length - 1];
        ctx.lineTo(end.x + end.tx * wTip * 0.6, end.y + end.ty * wTip * 0.6);
        for (let i = R.length - 2; i >= 0; i -= 2) ctx.lineTo(R[i], R[i + 1]);
        ctx.closePath();
        const yTop = Math.min(end.y, ...[pts[0].y]);
        const g = ctx.createLinearGradient(0, H, 0, Math.min(yTop, H * 0.2));
        g.addColorStop(0, '#6d6848');
        g.addColorStop(0.35, '#7c8457');
        g.addColorStop(1, '#93a06c');
        ctx.fillStyle = g;
        ctx.fill();
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        // hatching across the shadow side
        ctx.beginPath();
        for (let i = 0; i < pts.length; i += 2) {
            const p = pts[i], w = ws[i];
            if (w < 1.6) continue;
            const rx = R[i * 2], ry = R[i * 2 + 1];
            ctx.moveTo(rx, ry);
            ctx.lineTo(rx + p.nx * w * 0.5 + p.tx * w * 0.32, ry + p.ny * w * 0.5 + p.ty * w * 0.32);
        }
        ctx.strokeStyle = 'rgba(38,42,28,0.5)'; ctx.lineWidth = Math.max(0.4, fs * 0.018); ctx.stroke();
        ctx.beginPath();
        for (let i = 0; i < R.length; i += 2) i ? ctx.lineTo(R[i], R[i + 1]) : ctx.moveTo(R[i], R[i + 1]);
        ctx.strokeStyle = C.stemDark; ctx.lineWidth = Math.max(0.6, fs * 0.04); ctx.stroke();
        ctx.beginPath();
        for (let i = 0; i < L.length; i += 2) i ? ctx.lineTo(L[i], L[i + 1]) : ctx.moveTo(L[i], L[i + 1]);
        ctx.strokeStyle = 'rgba(44,48,34,0.45)'; ctx.lineWidth = Math.max(0.4, fs * 0.018); ctx.stroke();
        ctx.beginPath();
        for (let i = 0; i < pts.length; i += 2) {
            const p = pts[i], w = ws[i] * 0.22;
            i ? ctx.lineTo(p.x + p.nx * w, p.y + p.ny * w) : ctx.moveTo(p.x + p.nx * w, p.y + p.ny * w);
        }
        ctx.strokeStyle = C.stemLight; ctx.lineWidth = Math.max(0.4, fs * 0.026); ctx.stroke();
    }

    function drawLeaf(ctx, lf, u, from, colour) {
        if (u <= 0.002) return;
        const nx = from.x, ny = from.y;
        const g = mix(0.3, 1, u);
        const bxp = nx + (lf.bx - lf.nx) * g, byp = ny + (lf.by - lf.ny) * g;
        ctx.beginPath();
        ctx.moveTo(nx, ny);
        ctx.quadraticCurveTo(mix(nx, bxp, 0.5) - (byp - ny) * 0.12, mix(ny, byp, 0.5) + (bxp - nx) * 0.12, bxp, byp);
        ctx.strokeStyle = C.stemDark; ctx.lineWidth = Math.max(0.9, fs * 0.07) * mix(0.6, 1, u); ctx.lineCap = 'round'; ctx.stroke();
        ctx.strokeStyle = C.stem; ctx.lineWidth = Math.max(0.45, fs * 0.035) * mix(0.6, 1, u); ctx.stroke();
        ctx.fillStyle = C.stemDark;
        for (const t of [0.62, 0.72]) {
            ctx.beginPath(); ctx.arc(mix(nx, bxp, t), mix(ny, byp, t), fs * 0.035 * u, 0, TAU); ctx.fill();
        }
        const lobes = leafLobes(lf.L, u, lf.tilt);
        const c = Math.cos(lf.rot), s = Math.sin(lf.rot);
        const fold = mix(0.22, 1, smooth(0.1, 0.95, u));
        for (const i of [0, 4, 1, 3, 2]) {
            const lo = lobes[i];
            const T = LOBE[(lf.tex + i) % 2];
            const dx = lo.ux * c - lo.uy * s, dy = lo.ux * s + lo.uy * c;
            const k = lo.L / T.len;
            const wf = fold * (i % 2 ? -1 : 1) * lf.mirror * 0.92;
            const a = -dy * k * wf, b = dx * k * wf, cc = dx * k, d = dy * k;
            const e = bxp - a * T.bx, f = byp - b * T.bx;
            ctx.setTransform(a * dpr, b * dpr, cc * dpr, d * dpr, e * dpr, f * dpr);
            ctx.globalAlpha = mix(0.75, 1, u);
            ctx.drawImage(img.lobes, T.x, 0, T.w, T.h, 0, 0, T.w, T.h);
            if (colour > 0.005) { ctx.globalAlpha = colour; ctx.drawImage(img.lobes, T.x, ROW2, T.w, T.h, 0, 0, T.w, T.h); }
        }
        ctx.globalAlpha = 1;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // A tendril is a polyline with depth: z < 0 behind the letters, z > 0 in
    // front of them. Runs are split by depth and drawn on the two canvases.
    function tendrilPoints(n, from, a, p) {
        const t = n.tendril;
        const ageL = a / LH;
        if (ageL < A_EMERGE) return null;
        const pts = [];
        const grow = smooth(A_EMERGE, A_EMERGE + 1.6, ageL);
        const sweep = TAU * (ageL - A_EMERGE) / 3.4 + t.ph;
        const L0 = t.target ? letterNow(t.target) : null;
        if (L0) {
            const fromLeft = from.x < L0.cx;
            L0.C = { x: L0.cx + (fromLeft ? -1 : 1) * (L0.half + fs * 0.07), y: mix(L0.y0, L0.y1, 0.06) };
        }
        if (L0 && p >= t.pc) {
            const g = smooth(t.pc, t.pc + 0.02, p);
            const k = smooth(t.pc + 0.02, t.pc + 0.08, p);
            const Cp = L0.C;
            const dx = Cp.x - from.x, dy = Cp.y - from.y, D = hyp(dx, dy) || 1;
            const ex = dx / D, ey = dy / D, nx = -ey, ny = ex;
            // The free length winds into a spring. Both ends are held, so it
            // turns one way for half its length and back the other way for
            // the rest, with a short straight perversion between.
            const R = fs * 0.34 * k, chi = 0.9, nh = t.nh;
            const M = Math.max(30, Math.round(D / 1));
            for (let i = 0; i <= M; i++) {
                const u = i / M;
                const half = u < 0.5 ? u : 1 - u;
                const phi = TAU * nh * 2 * half * t.hand;
                const env = Math.pow(Math.sin(Math.PI * u), 0.5) * smooth(0.025, 0.08, Math.abs(u - 0.5));
                const sag = (1 - k) * Math.sin(Math.PI * u) * fs * 0.25 * (1 - g * 0.6);
                const r = R * env;
                const along = D * u + r * Math.cos(phi) * chi;
                const across = r * Math.sin(phi) + sag;
                const x = from.x + ex * along + nx * across, y = from.y + ey * along + ny * across;
                pts.push(r > 0.3 ? { x, y, z: Math.cos(phi) } : { x, y, z: k > 0.5 ? 0.3 : -0.3, g: 1 });
            }
            // the grip: turns round the ascender's stem, down from the contact
            const turns = (fs < 20 ? 1.8 : 2.5) * g;
            const rc = L0.half + fs * 0.08;
            const side0 = Cp.x < L0.cx ? -1 : 1;
            const span = L0.y1 - Cp.y;
            const steps = Math.max(2, Math.ceil(turns * 28));
            for (let i = 1; i <= steps; i++) {
                const th = (turns * TAU * i) / steps;
                pts.push({ x: L0.cx + side0 * rc * Math.cos(th), y: Cp.y + span * (i / steps) * Math.min(1, turns / 2.5), z: -Math.sin(th) * side0 * t.hand, g: 1 });
            }
            return pts;
        }
        // searching: straight and stiff, revolving, with a hooked tip
        let dir, L;
        if (L0) {
            const want = Math.atan2(L0.C.y - from.y, L0.C.x - from.x);
            // it revolves, searching, for as long as it takes; the sweep closes
            // onto the letter just before it touches
            const conv = smooth(t.pc - 0.035, t.pc, p);
            const upA = Math.atan2(-1, 0.3 * t.lr);
            dir = mix(mix(upA, want, smooth(A_EMERGE, A_EMERGE + 2.2, ageL)), want, conv) + Math.sin(sweep) * 0.55 * (1 - conv);
            const Dn = hyp(L0.C.x - from.x, L0.C.y - from.y);
            L = mix(Math.min(Dn * 0.6, fs * 2.2) * mix(0.35, 1, smooth(A_EMERGE, A_EMERGE + 2.4, ageL)), Dn, conv) * (1 - 0.14 * (1 + Math.cos(sweep)) / 2 * (1 - conv));
        } else {
            dir = t.dir + Math.sin(sweep) * 0.5 * (1 - smooth(A_CONTACT, A_CONTACT + 1, ageL));
            L = t.len * grow;
        }
        const coil = L0 ? 0 : smooth(A_CONTACT, A_CONTACT + 2.6, ageL) * (n.young ? 0 : 1);
        const M = Math.max(16, Math.round(L / 1.5));
        let x = from.x, y = from.y, ang = dir;
        pts.push({ x, y, z: -0.3 });
        if (!coil) {
            for (let i = 1; i <= M; i++) {
                const u = i / M;
                ang = dir + t.lr * 0.9 * smooth(0.82, 1, u) * (1 - (L0 ? smooth(t.pc - 0.012, t.pc, p) : 0));
                x += Math.cos(ang) * L / M; y += Math.sin(ang) * L / M;
                pts.push({ x, y, z: -0.3 });
            }
            return pts;
        }
        // unattached: it winds up from the tip into a loose spiral, one hand only
        const ex = Math.cos(dir), ey = Math.sin(dir), nx = -ey, ny = ex;
        const R = fs * 0.19;
        const nT = Math.max(2, Math.round(L / (fs * 0.8)));
        for (let i = 1; i <= M; i++) {
            const u = i / M;
            const hh = smooth(1 - coil * 0.75, 1 - coil * 0.75 + 0.18, u);
            const phi = TAU * nT * u * t.hand;
            const r = R * hh;
            const along = L * (u - 0.3 * coil * Math.max(0, u - (1 - coil * 0.75))) + r * Math.cos(phi) * 0.85;
            const across = r * Math.sin(phi);
            pts.push({ x: from.x + ex * along + nx * across, y: from.y + ey * along + ny * across, z: hh > 0.05 ? Math.cos(phi) : -0.3 });
        }
        return pts;
    }

    function strokeRuns(pts, wantFront, ctx, w) {
        // Turns in front get a hairline of paper where they cross the tendril's
        // own back turns (as an engraver leaves a gap), but not where they wrap
        // a letter, which would eat into it.
        let open = false, grip = false;
        const flush = () => {
            if (!open) return;
            if (wantFront && !grip) {
                ctx.strokeStyle = paperColour; ctx.globalAlpha = 0.85; ctx.lineWidth = w + 1; ctx.stroke(); ctx.globalAlpha = 1;
            }
            ctx.strokeStyle = C.tendril; ctx.lineWidth = w; ctx.stroke();
            if (wantFront && w * dpr > 2) { ctx.strokeStyle = C.tendrilCore; ctx.lineWidth = w * 0.36; ctx.stroke(); }
            open = false; grip = false;
        };
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        for (let i = 1; i < pts.length; i++) {
            const a = pts[i - 1], b = pts[i];
            const f = (a.z + b.z) / 2 > 0;
            if (f === wantFront) {
                if (!open) { ctx.beginPath(); ctx.moveTo(a.x, a.y); open = true; }
                ctx.lineTo(b.x, b.y);
                if (b.g) grip = true;
            } else flush();
        }
        flush();
    }

    // ---- the flower ----------------------------------------------------------------
    // The bud is Curtis's, painted; it swells on its stalk, then turns to face
    // you and gives way to Redouté's flower opening: the ten tepals spread
    // from pointing at you to lying flat (each a wedge of the plate, scaled
    // along its own axis), the corona fans out over them, and the stamens and
    // styles rise last. At the end the layers give way to the uncut plate.
    function flowerMatrix(ctx, extra) {
        const { E, k, rot } = flower;
        const c = Math.cos(rot) * k, s = Math.sin(rot) * k;
        // image px -> stage px: rotate and scale about the flower's centre
        ctx.setTransform(c * dpr, s * dpr, -s * dpr, c * dpr, (E.x - c * FL.cx + s * FL.cy) * dpr, (E.y - s * FL.cx - c * FL.cy) * dpr);
        if (extra) extra();
    }
    function drawFlower(ctx, from, grow, o) {
        const { E, Rf } = flower;
        if (grow <= 0.01) return;
        // the stalk, from the node to behind the flower's centre
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.quadraticCurveTo(mix(from.x, E.x, 0.15), mix(from.y, E.y, 0.8), E.x, E.y);
        ctx.strokeStyle = C.stemDark; ctx.lineWidth = Math.max(1.2, fs * 0.1); ctx.lineCap = 'round'; ctx.stroke();
        ctx.strokeStyle = C.stem; ctx.lineWidth = Math.max(0.6, fs * 0.055); ctx.stroke();
        ctx.imageSmoothingQuality = 'high';

        // the bud, base at the flower's centre, leaning out over the margin
        const budA = 1 - smooth(0.05, 0.24, o);
        if (budA > 0.003) {
            const bl = Rf * 1.12 * mix(0.28, 1, grow);
            const ax = BUD.tip[0] - BUD.base[0], ay = BUD.tip[1] - BUD.base[1], al = hyp(ax, ay);
            const want = -Math.PI / 2 + side * 0.5;            // up and out
            const ang = want - Math.atan2(ay, ax);
            const fore = 1 - 0.55 * smooth(0.02, 0.24, o);    // turning to face you
            const sc = bl / al;
            ctx.setTransform(dpr, 0, 0, dpr, E.x * dpr, E.y * dpr);
            ctx.rotate(want); ctx.scale(fore, 1 + 0.12 * smooth(0, 0.2, o)); ctx.rotate(-want);
            ctx.rotate(ang); ctx.scale(sc, sc);
            ctx.translate(-BUD.base[0], -BUD.base[1]);
            const colour = smooth(0.0, 0.12, o);
            ctx.globalAlpha = budA;
            ctx.drawImage(img.bud, 0, 0, BUD.w, BUD.h, 0, 0, BUD.w, BUD.h);
            if (colour > 0.005) { ctx.globalAlpha = budA * colour; ctx.drawImage(img.bud, 0, BUD.row2, BUD.w, BUD.h, 0, 0, BUD.w, BUD.h); }
            ctx.globalAlpha = 1;
        }
        if (o <= 0.03) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); return; }

        const fin = smooth(0.9, 0.99, o);
        if (fin < 1) {
            // tepals: five sepals behind, then five petals, each wedge scaled
            // along its axis by the sine of its opening angle
            const showT = smooth(0.04, 0.16, o);
            const order = [0, 2, 4, 6, 8, 1, 3, 5, 7, 9];
            for (const kk of order) {
                const late = kk % 2 ? 0.1 : 0;
                const th = mix(0.16, Math.PI / 2, smooth(0.06 + late, 0.62 + late, o));
                const sr = Math.sin(th), sw = mix(0.62, 1, smooth(0.06 + late, 0.5 + late, o));
                const a0 = FL.tips[kk];
                const prevA = FL.tips[(kk + 9) % 10] - (kk === 0 ? TAU : 0), nextA = FL.tips[(kk + 1) % 10] + (kk === 9 ? TAU : 0);
                const lo = (a0 + prevA) / 2, hi = (a0 + nextA) / 2;
                ctx.save();
                flowerMatrix(ctx, () => {
                    ctx.translate(FL.cx, FL.cy); ctx.rotate(a0); ctx.scale(sr, sw); ctx.rotate(-a0); ctx.translate(-FL.cx, -FL.cy);
                });
                ctx.beginPath();
                ctx.moveTo(FL.cx, FL.cy);
                for (let j = 0; j <= 8; j++) { const aa = mix(lo - 0.02, hi + 0.02, j / 8); ctx.lineTo(FL.cx + Math.cos(aa) * 700, FL.cy + Math.sin(aa) * 700); }
                ctx.closePath();
                ctx.clip();
                ctx.globalAlpha = showT * (1 - fin);
                ctx.drawImage(img.tepals, 0, 0);
                ctx.restore();
            }
            // corona: fans out from tight and turned, over the tepals
            const cs = smooth(0.32, 0.82, o);
            if (cs > 0.001) {
                ctx.save();
                flowerMatrix(ctx, () => {
                    ctx.translate(FL.cx, FL.cy); ctx.rotate(-0.5 * (1 - cs)); ctx.scale(mix(0.22, 1, cs), mix(0.22, 1, cs)); ctx.translate(-FL.cx, -FL.cy);
                });
                ctx.globalAlpha = smooth(0.32, 0.5, o) * (1 - fin);
                ctx.drawImage(img.corona, 0, 0);
                ctx.restore();
            }
            // stamens and styles rise last
            const ks = smooth(0.58, 0.9, o);
            if (ks > 0.001) {
                ctx.save();
                const ox = FL.cx + 40, oy = FL.cy - 20;
                flowerMatrix(ctx, () => {
                    ctx.translate(ox, oy); ctx.scale(mix(0.4, 1, ks), mix(0.4, 1, ks)); ctx.translate(-ox, -oy);
                });
                ctx.globalAlpha = smooth(0.58, 0.7, o) * (1 - fin);
                ctx.drawImage(img.cluster, 0, 0);
                ctx.restore();
            }
        }
        if (fin > 0) {
            // the plate itself
            flowerMatrix(ctx);
            ctx.globalAlpha = fin;
            ctx.drawImage(img.flower, 0, 0);
            ctx.globalAlpha = 1;
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // ---- the type's paper halo, redrawn when the words move -------------------
    const halo = document.createElement('canvas');
    let haloDirty = true;
    function paintHalo() {
        haloDirty = false;
        if (halo.width !== back.width || halo.height !== back.height) { halo.width = back.width; halo.height = back.height; }
        const x = halo.getContext('2d');
        x.setTransform(1, 0, 0, 1, 0, 0);
        x.clearRect(0, 0, halo.width, halo.height);
        x.setTransform(dpr, 0, 0, dpr, 0, 0);
        x.font = fontAt(fs);
        x.textBaseline = 'alphabetic';
        x.lineJoin = 'round';
        x.strokeStyle = paperColour; x.fillStyle = paperColour;
        x.lineWidth = Math.max(1.6, fs * 0.15);
        for (const w of words) {
            if (!(w.op > 0.02)) continue;
            x.globalAlpha = w.op;
            const tx = w.t + (w.hy ? '-' : '');
            x.strokeText(tx, w.cx, w.cy + baseOff);
            x.fillText(tx, w.cx, w.cy + baseOff);
        }
        x.globalAlpha = 1;
    }

    // ---- a frame ---------------------------------------------------------------
    function render(p) {
        const tau = tauOf(p);
        const Lc = Math.min(Ltot, tau);
        const o = openOf(p);
        placeWords(flowAt(Lc, p));
        for (const [ctx, c] of [[bx, back], [fx, front]]) {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, c.width, c.height);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
        const pts = stemAt(tau, p);
        if (pts.length < 2) return;
        drawStem(bx, pts, Lc);
        const tw = Math.max(1, fs * 0.075);
        const green = 0.5 * smooth(0.82, 0.96, p);
        const tendrilPts = [];
        for (const n of nodes) {
            const a = tau - n.s;
            if (!n.tendril.target || p < n.tendril.pc) touched.delete(n);
            if (n.s > Lc) continue;
            const from = pointAt(pts, n.s);
            let u = smooth(0.15, 3.6, a / LH);
            if (n.young) u = Math.min(u, n.young);
            if (n.leaf) drawLeaf(bx, n.leaf, u, from, green);
            const tp = tendrilPoints(n, from, n.young ? Math.min(a, LH * 1.6) : a, p);
            if (tp) tendrilPts.push(tp);
            if (n.tendril.target && p >= n.tendril.pc && !touched.has(n)) {
                touched.add(n);
                if (primed) root.dispatchEvent(new CustomEvent('pretext-vine:touch', { bubbles: true, detail: { letter: n.tendril.target.a.ch } }));
            }
        }
        for (const tp of tendrilPts) strokeRuns(tp, false, bx, tw);
        // a hairline of paper round every letter, under the type: a word over a
        // leaf still reads, and a turn behind a letter is cut cleanly by it
        if (haloDirty) paintHalo();
        bx.setTransform(1, 0, 0, 1, 0, 0);
        bx.drawImage(halo, 0, 0);
        bx.setTransform(dpr, 0, 0, dpr, 0, 0);
        for (const tp of tendrilPts) strokeRuns(tp, true, fx, tw);
        if (Lc >= flower.s - 1) {
            const grow = smooth(0.52, 0.75, p);
            drawFlower(fx, pointAt(pts, flower.s), grow, o);
            if (o > 0.5 && !bloomed) { bloomed = true; if (primed) root.dispatchEvent(new CustomEvent('pretext-vine:bloom', { bubbles: true })); }
            else if (o < 0.3) bloomed = false;
        }
    }

    // ---- motion ------------------------------------------------------------------
    function progress() {
        if (manual != null) return manual;
        if (calm.matches) return 1;
        const r = root.getBoundingClientRect();
        const run = r.height - innerHeight;
        return run > 0 ? clamp(-r.top / run) : 1;
    }
    function frame(now) {
        raf = 0;
        if (dead) return;
        const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
        last = now;
        target = progress();
        if (shown < 0 || calm.matches) shown = target;
        else shown += (target - shown) * (1 - Math.exp(-dt / 0.22));
        if (Math.abs(target - shown) < 0.0004) shown = target;
        render(shown);
        if (shown !== target && (visible || manual != null)) raf = requestAnimationFrame(frame);
        else last = 0;
    }
    const kick = () => { if (!raf && !dead && path.length) raf = requestAnimationFrame(frame); };

    // ---- start -------------------------------------------------------------------
    (async () => {
        try {
            api = await import(LIB);
            const [lobes, bud, fl, tepals, corona, cluster] = await Promise.all(
                ['leaf-lobes.webp', 'bud.webp', 'flower.webp', 'flower-tepals.webp', 'flower-corona.webp', 'flower-cluster.webp'].map((f) => loadImage(ASSET(f))));
            img = { lobes, bud, flower: fl, tepals, corona, cluster };
            const cs = getComputedStyle(src);
            family = cs.fontFamily; weight = cs.fontWeight; inkColour = cs.color;
            paperColour = getComputedStyle(root).backgroundColor || '#f3f0e8';
            if (/rgba\(0, 0, 0, 0\)|transparent/.test(paperColour)) paperColour = '#f3f0e8';
            text = src.textContent.replace(/\s+/g, ' ').trim();
            hyphenate = await loadHyphen();
            hyText = hyphenate(text);
            try { await document.fonts.load(`${weight} 24px ${family}`); await document.fonts.ready; } catch (e) { /* measure what we have */ }
            if (dead || !text) return;
            root.classList.add('is-live');
            stage.append(back, wordsEl, front);
            wordsEl.style.color = inkColour;
            layout();
        } catch (e) {
            back.remove(); front.remove(); wordsEl.remove();
            root.classList.remove('is-live');
            console.warn('pretext-vine:', e);
            return;
        }
        target = progress(); shown = target;
        render(shown);
        primed = true;

        const io = new IntersectionObserver((en) => {
            visible = en[0].isIntersecting;
            if (visible) kick();
        }, { rootMargin: '80px' });
        io.observe(root);
        off.push(() => io.disconnect());
        on(window, 'scroll', () => { if (visible) kick(); }, { passive: true });
        on(document, 'visibilitychange', () => { if (document.hidden && raf) { cancelAnimationFrame(raf); raf = 0; last = 0; } else kick(); });
        let timer = 0, lastW = -1, lastH = innerHeight;
        const ro = new ResizeObserver((en) => {
            const w = Math.round(en[0].contentRect.width);
            if (lastW < 0) { lastW = w; return; }
            if (w === lastW && Math.abs(innerHeight - lastH) < 140) return;
            lastW = w; lastH = innerHeight;
            clearTimeout(timer);
            timer = setTimeout(() => { if (!dead) { primed = false; touched = new Set(); layout(); render(shown); primed = true; kick(); } }, 140);
        });
        ro.observe(stage);
        off.push(() => { ro.disconnect(); clearTimeout(timer); });
        on(calm, 'change', () => { shown = -1; kick(); });
    })();

    function destroy() {
        dead = true;
        if (raf) cancelAnimationFrame(raf);
        off.forEach((f) => f());
        back.remove(); front.remove(); wordsEl.remove();
        root.classList.remove('pv', 'is-live');
        if (root.pretextVine === destroy) delete root.pretextVine;
    }
    // growTo(p): drive the growth yourself (0..1); growTo(null) returns it to the scroll.
    destroy.growTo = (p) => { manual = p == null ? null : clamp(+p || 0); kick(); };
    destroy.destroy = destroy;
    root.pretextVine = destroy;
    return destroy;
}

// Auto-start every [data-pretext-vine] once it is near the viewport.
function autoStart(el) {
    if (!('IntersectionObserver' in window)) return pretextVine(el);
    const io = new IntersectionObserver((en) => {
        if (!en[0].isIntersecting) return;
        io.disconnect();
        pretextVine(el);
    }, { rootMargin: '800px' });
    io.observe(el);
}
document.querySelectorAll('[data-pretext-vine]').forEach(autoStart);
