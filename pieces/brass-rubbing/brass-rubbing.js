/*
 *  brass-rubbing
 *  A sheet of thin paper taped over an engraved surface. Rub it and the image
 *  comes up out of blank paper, black where the surface is raised, pale where
 *  it is cut away, grainy and streaked along your strokes like real heelball.
 *
 *  <figure data-brass-rubbing data-surface="assets/aubernoun-relief.webp">
 *    <img src="assets/aubernoun-rubbed.webp" alt="…">   finished rubbing: the no-JS picture, and the sheet's size
 *  </figure>
 *
 *    data-surface="url"     height map (grey: white = raised, black = cut). Same aspect as the img
 *    data-wax="black"       black heelball on white paper, or "gold" on black paper
 *    data-hint="0.5 0.2"    centre of the small patch already rubbed on arrival (fractions); "none"
 *    data-reach="22"        half-width of the rub under a finger, css px (scales with the sheet)
 *    data-duration="6"      seconds for the automatic rub (Enter)
 *    data-tooth="url"       paper fibre texture (defaults to assets/paper-tooth.webp beside this file)
 *    data-seed="3"          creases, tape and streaks
 *
 *  Mouse and pen: press and drag. Touch: sideways strokes rub at once; hold
 *  still for a quarter second and that touch rubs in any direction; an
 *  up-and-down swipe scrolls the page. Enter rubs the whole sheet.
 *
 *  brassRubbing(el, opts) returns destroy(); destroy.rub() starts the
 *  automatic rub, destroy.clear() lays a fresh sheet, destroy.state reports.
 */

const HERE = new URL('.', import.meta.url).href;
const DPR_CAP = 2;
const MAX_PX = 4.6e6;
const HOLD_MS = 250;
const STREAK_N = 8192;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function rng(seed) {
    let s = (seed * 2654435761) >>> 0 || 1;
    return () => {
        s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
        return s / 4294967296;
    };
}

function loadImage(src) {
    return new Promise((res, rej) => {
        const im = new Image();
        im.decoding = 'async';
        im.onload = () => res(im);
        im.onerror = () => rej(new Error('brass-rubbing: could not load ' + src));
        im.src = src;
    });
}

function parseColor(str, fallback) {
    const s = (str || '').trim();
    let m = /^#([0-9a-f]{6})$/i.exec(s);
    if (m) { const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
    m = /^#([0-9a-f]{3})$/i.exec(s);
    if (m) return [...m[1]].map((c) => parseInt(c + c, 16));
    m = /rgba?\(([^)]+)\)/.exec(s);
    if (m) return m[1].split(/[ ,/]+/).slice(0, 3).map(Number);
    return fallback;
}

/* ---- separable filters on Float32 fields --------------------------------- */

// box blur, radius r (integer), in place via scratch; edges clamp
function boxBlur(src, w, h, r, tmp) {
    if (r < 1) return src;
    const inv = 1 / (2 * r + 1);
    for (let y = 0; y < h; y++) {
        const o = y * w;
        let acc = src[o] * (r + 1);
        for (let x = 1; x <= r; x++) acc += src[o + Math.min(x, w - 1)];
        for (let x = 0; x < w; x++) {
            tmp[o + x] = acc * inv;
            acc += src[o + Math.min(x + r + 1, w - 1)] - src[o + Math.max(x - r, 0)];
        }
    }
    for (let x = 0; x < w; x++) {
        let acc = tmp[x] * (r + 1);
        for (let y = 1; y <= r; y++) acc += tmp[Math.min(y, h - 1) * w + x];
        for (let y = 0; y < h; y++) {
            src[y * w + x] = acc * inv;
            acc += tmp[Math.min(y + r + 1, h - 1) * w + x] - tmp[Math.max(y - r, 0) * w + x];
        }
    }
    return src;
}

// 1-2-1 blur, rows then columns, in place
function binomial(a, w, h, tmp) {
    for (let y = 0; y < h; y++) {
        const o = y * w;
        for (let x = 0; x < w; x++) tmp[o + x] = (a[o + Math.max(x - 1, 0)] + 2 * a[o + x] + a[o + Math.min(x + 1, w - 1)]) * 0.25;
    }
    for (let y = 0; y < h; y++) {
        const o = y * w, up = Math.max(y - 1, 0) * w, dn = Math.min(y + 1, h - 1) * w;
        for (let x = 0; x < w; x++) a[o + x] = (tmp[up + x] + 2 * tmp[o + x] + tmp[dn + x]) * 0.25;
    }
    return a;
}

// running max over a window of 2r+1 (van Herk / Gil-Werman), rows then columns
function maxFilter(src, w, h, r, out) {
    const n = Math.max(w, h), k = 2 * r + 1;
    const line = new Float32Array(n + 2 * r), g = new Float32Array(n + 2 * r), hh = new Float32Array(n + 2 * r);
    const tmp = new Float32Array(w * h);
    const pass = (len, get, set) => {
        const L = len + 2 * r;
        for (let i = 0; i < L; i++) line[i] = get(clamp(i - r, 0, len - 1));
        for (let i = 0; i < L; i++) g[i] = i % k === 0 ? line[i] : Math.max(g[i - 1], line[i]);
        for (let i = L - 1; i >= 0; i--) hh[i] = (i === L - 1 || (i + 1) % k === 0) ? line[i] : Math.max(hh[i + 1], line[i]);
        for (let i = 0; i < len; i++) set(i, Math.max(hh[i], g[i + 2 * r]));
    };
    for (let y = 0; y < h; y++) { const o = y * w; pass(w, (i) => src[o + i], (i, v) => { tmp[o + i] = v; }); }
    for (let x = 0; x < w; x++) pass(h, (i) => tmp[i * w + x], (i, v) => { out[i * w + x] = v; });
    return out;
}

/* ---- the component -------------------------------------------------------- */

export function brassRubbing(el, opts = {}) {
    const ds = el.dataset;
    const opt = (k, d) => (opts[k] !== undefined ? opts[k] : ds[k] !== undefined ? ds[k] : d);
    const gold = String(opt('wax', 'black')) === 'gold';
    const surfaceSrc = opt('surface', null);
    const toothSrc = opt('tooth', HERE + 'assets/paper-tooth.webp');
    const hintOpt = String(opt('hint', '0.5 0.2'));
    const reachCss = +opt('reach', 22) || 22;
    const duration = (+opt('duration', 6) || 6) * 1000;
    const seed = +opt('seed', 3) || 3;
    const calm = matchMedia('(prefers-reduced-motion: reduce)');
    const img = el.querySelector('img');

    const offs = [];
    const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); offs.push(() => t.removeEventListener(ev, fn, o)); };

    let dead = false, ready = false, raf = 0, visible = true;
    let W = 0, H = 0, S = 1, U = 1;                // sim size, sim px per css px, sim px per 1/1000 of the width
    let C = null, D = null, TH = null, PAPER = null; // contact, density, wax threshold, paper rgb
    let streak = null;
    let cPaper, cWax, cOver, xWax, wImg = null;
    let dirty = null;
    const queue = [];
    let auto = null;
    let anyInk = false;
    let col = null;
    const rand = rng(seed);

    el.classList.add('br');
    const added = [];
    const attr = (k, v) => { if (!el.hasAttribute(k)) { el.setAttribute(k, v); added.push(k); } };
    attr('tabindex', '0');
    attr('aria-label', 'A sheet of paper taped over a memorial brass. Drag across it to rub, or press Enter to rub it all.');
    attr('role', 'img');
    const live = document.createElement('span');
    live.className = 'br-live';
    live.setAttribute('aria-live', 'polite');
    el.appendChild(live);

    const colors = () => {
        const cs = getComputedStyle(el);
        return {
            paper: parseColor(cs.getPropertyValue('--br-paper'), gold ? [30, 27, 25] : [244, 241, 233]),
            wax: parseColor(cs.getPropertyValue('--br-wax'), gold ? [190, 150, 78] : [22, 20, 19]),
            sheen: parseColor(cs.getPropertyValue('--br-sheen'), gold ? [246, 221, 150] : [78, 76, 76]),
            tape: parseColor(cs.getPropertyValue('--br-tape'), [221, 205, 160]),
        };
    };

    /* ---- build ----------------------------------------------------------- */

    function mkCanvas(cls) {
        const c = document.createElement('canvas');
        c.className = cls;
        c.setAttribute('aria-hidden', 'true');
        el.appendChild(c);
        return c;
    }

    async function build() {
        if (!surfaceSrc) throw new Error('brass-rubbing: data-surface is required');
        const [surf, tooth] = await Promise.all([loadImage(surfaceSrc), loadImage(toothSrc), img && !img.complete ? img.decode().catch(() => {}) : null]);
        if (dead) return;
        const rect = el.getBoundingClientRect();
        const cssW = rect.width || 400, cssH = rect.height || cssW * surf.naturalHeight / surf.naturalWidth;
        S = Math.min(devicePixelRatio || 1, DPR_CAP);
        if (cssW * cssH * S * S > MAX_PX) S = Math.sqrt(MAX_PX / (cssW * cssH));
        W = Math.round(cssW * S); H = Math.round(cssH * S);
        U = W / 1000;
        const N = W * H;

        // the surface, at sim resolution
        const tc = document.createElement('canvas');
        tc.width = W; tc.height = H;
        const tx = tc.getContext('2d', { willReadFrequently: true });
        tx.imageSmoothingQuality = 'high';
        tx.clearRect(0, 0, W, H);
        tx.drawImage(surf, 0, 0, W, H);
        let px = tx.getImageData(0, 0, W, H).data;
        // grey = height; alpha (if any) = grip, how readily the surface takes wax
        const Hs = new Float32Array(N), G = new Float32Array(N);
        for (let i = 0; i < N; i++) {
            const a = px[i * 4 + 3];
            Hs[i] = px[i * 4] / 255;
            G[i] = a / 255;
        }

        // paper tooth, tiled at 2 tile px per css px
        tx.clearRect(0, 0, W, H);
        tx.save();
        tx.scale(S / 2, S / 2);
        tx.fillStyle = tx.createPattern(tooth, 'repeat');
        tx.fillRect(0, 0, W * 2 / S + 2, H * 2 / S + 2);
        tx.restore();
        px = tx.getImageData(0, 0, W, H).data;
        const T = new Float32Array(N);
        for (let i = 0; i < N; i++) T[i] = px[i * 4] / 255;
        tc.width = tc.height = 1;

        // contact: how hard the paper presses back against the crayon.
        // The paper bridges narrow cuts a little (blur), and the crayon rides
        // on the local high points (max filter), so the wax only reaches the
        // paper where it lies at that top level.
        const tmp = new Float32Array(N);
        // The paper cannot follow a cut narrower than its own stiffness: it
        // bridges it partway (a morphological closing, blended), which greys a
        // hairline without ever lowering the metal between two close cuts.
        const rc = Math.max(1, Math.round(1.1 * U));
        const dil = maxFilter(Hs, W, H, rc, new Float32Array(N));
        for (let i = 0; i < N; i++) dil[i] = -dil[i];
        const clo = maxFilter(dil, W, H, rc, new Float32Array(N));
        const Hp = new Float32Array(N);
        for (let i = 0; i < N; i++) Hp[i] = Hs[i] + (-clo[i] - Hs[i]) * 0.45;
        binomial(Hp, W, H, tmp);
        // (a square max, then blurred wider than itself, so its corners round off)
        const M = maxFilter(Hp, W, H, Math.max(2, Math.round(4 * U)), new Float32Array(N));
        const rb = Math.max(1, Math.round(5 * U));
        boxBlur(boxBlur(M, W, H, rb, tmp), W, H, rb, tmp);
        C = new Float32Array(N);
        const depth = 0.4;
        for (let i = 0; i < N; i++) {
            const c = clamp(1 - (M[i] - Hp[i]) / depth, 0, 1);
            // gold heelball is harder and lays less on the rough stone
            C[i] = c * c * (3 - 2 * c) * (gold ? G[i] * G[i] ** 0.6 : G[i]);
        }
        const creases = makeCreases();
        applyCreases(creases);

        // wax threshold: high fibres catch first, the valleys of the paper last
        TH = new Float32Array(N);
        for (let i = 0; i < N; i++) { const v = 1 - T[i]; TH[i] = 0.12 + v * v * 2.6; }
        D = new Float32Array(N);

        // streaks: a 1D profile across the stroke (lumps on the heelball's edge)
        streak = new Float32Array(STREAK_N);
        const r2 = rng(seed * 7 + 1);
        const oct = [[1.3, 0.55], [2.6, 0.6], [6, 0.55], [15, 0.45], [42, 0.35]];
        for (const [per, amp] of oct) {
            const p = per * U, n = Math.ceil(STREAK_N / p) + 2, v = [];
            for (let i = 0; i < n; i++) v.push(r2() * 2 - 1);
            for (let i = 0; i < STREAK_N; i++) {
                const f = i / p, k = Math.floor(f), t = f - k, s = t * t * (3 - 2 * t);
                streak[i] += amp * (v[k % n] * (1 - s) + v[(k + 1) % n] * s);
            }
        }
        let mean = 0;
        for (let i = 0; i < STREAK_N; i++) { streak[i] = Math.exp(streak[i] * 0.95); mean += streak[i]; }
        mean /= STREAK_N;
        for (let i = 0; i < STREAK_N; i++) streak[i] /= mean;

        // canvases
        cPaper = mkCanvas('br-paper');
        cWax = mkCanvas('br-wax');
        cOver = mkCanvas('br-over');
        for (const c of [cPaper, cWax]) { c.width = W; c.height = H; }
        xWax = cWax.getContext('2d');
        wImg = xWax.createImageData(W, H);
        paintPaper(T);
        paintOver(creases);
        el.classList.add('br-on');
        ready = true;

        if (calm.matches) {
            rubAll(true);
        } else if (hintOpt !== 'none') {
            const [hx, hy] = hintOpt.split(/[ ,]+/).map(Number);
            hint(isFinite(hx) ? hx : 0.5, isFinite(hy) ? hy : 0.2);
        }
    }

    /* ---- paper, creases, tape ---------------------------------------------- */

    function makeCreases() {
        const out = [];
        const corners = [[0, 0, 1, 1], [1, 0, -1, 1], [0, 1, 1, -1], [1, 1, -1, -1]];
        for (const [cx, cy, sx, sy] of corners) {
            const n = 1 + (rand() < 0.6 ? 1 : 0);
            for (let k = 0; k < n; k++) {
                const x0 = (cx + sx * (0.03 + rand() * 0.05)) * W, y0 = (cy + sy * (0.03 + rand() * 0.05)) * H;
                // toward the middle, fanning a little either side of the diagonal
                const base = Math.atan2(sy * H, sx * W);
                const a = base + (rand() - 0.5) * 0.7;
                const len = Math.hypot(W, H) * (0.07 + rand() * 0.13);
                const bend = (rand() - 0.5) * 0.4;
                const pts = [];
                for (let i = 0; i <= 12; i++) {
                    const t = i / 12, aa = a + bend * t;
                    pts.push([x0 + Math.cos(aa) * len * t, y0 + Math.sin(aa) * len * t]);
                }
                out.push({ pts, w: (0.8 + rand() * 0.9) * U, side: rand() < 0.5 ? 1 : -1 });
            }
        }
        return out;
    }

    // a crease is a thin ridge with a little hollow either side: the wax
    // catches on the ridge and skips the hollows
    function applyCreases(creases) {
        for (const cr of creases) {
            const reach = cr.w * 7;
            for (let s = 0; s < cr.pts.length - 1; s++) {
                const [ax, ay] = cr.pts[s], [bx, by] = cr.pts[s + 1];
                const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - reach)), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + reach));
                const y0 = Math.max(0, Math.floor(Math.min(ay, by) - reach)), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + reach));
                const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
                for (let y = y0; y <= y1; y++) {
                    for (let x = x0; x <= x1; x++) {
                        let t = ((x - ax) * dx + (y - ay) * dy) / l2;
                        if (t < 0 || t > 1) continue;
                        const gt = (s + t) / (cr.pts.length - 1);
                        const life = Math.sin(Math.PI * Math.min(1, gt * 1.6 + 0.08)) * (1 - gt * 0.6);
                        const d = Math.abs((x - ax) * dy - (y - ay) * dx) / Math.sqrt(l2);
                        const i = y * W + x;
                        const ridge = Math.exp(-(d * d) / (cr.w * cr.w)) * life;
                        const hollow = Math.exp(-((d - cr.w * 3) ** 2) / (cr.w * cr.w * 4)) * life;
                        C[i] = clamp(C[i] * (1 - 0.75 * hollow) + 0.55 * ridge * (0.4 + C[i]), 0, 1);
                    }
                }
            }
        }
    }

    function paintPaper(T) {
        const { paper } = colors();
        const x = cPaper.getContext('2d');
        const im = x.createImageData(W, H), d = im.data;
        // cockles: the sheet is not quite flat
        const blobs = [];
        for (let i = 0; i < 7; i++) blobs.push([rand() * W, rand() * H, (0.15 + rand() * 0.3) * W, (rand() - 0.5) * 0.05]);
        const dark = paper[0] < 100;
        for (let y = 0, i = 0; y < H; y++) {
            for (let xx = 0; xx < W; xx++, i++) {
                let l = 1 + (T[i] - 0.5) * (dark ? 0.16 : 0.07);
                if ((xx & 7) === 0 || i === 0) {
                    let c = 0;
                    for (const [bx, by, br, bs] of blobs) { const q = ((xx - bx) ** 2 + (y - by) ** 2) / (br * br); c += bs * Math.exp(-q); }
                    paintPaper.c = c;
                }
                l += paintPaper.c;
                const o = i * 4;
                d[o] = paper[0] * l; d[o + 1] = paper[1] * l; d[o + 2] = paper[2] * l; d[o + 3] = 255;
            }
        }
        x.putImageData(im, 0, 0);
    }

    function paintOver(creases) {
        const { tape } = colors();
        const m = Math.round(18 * S);                // the tape overhangs the sheet
        cOver.width = W + 2 * m; cOver.height = H + 2 * m;
        cOver.style.setProperty('--br-m', (m / S) + 'px');
        const x = cOver.getContext('2d');
        x.translate(m, m);
        // crease light: a bright edge on one side of the ridge, a soft shade on the other
        x.lineCap = 'round'; x.lineJoin = 'round';
        const dark = colors().paper[0] < 100;
        for (const cr of creases) {
            const n = cr.pts.length;
            for (let s = 0; s < n - 1; s++) {
                const gt = s / (n - 1);
                const life = Math.sin(Math.PI * Math.min(1, gt * 1.6 + 0.08)) * (1 - gt * 0.6);
                const [ax, ay] = cr.pts[s], [bx, by] = cr.pts[s + 1];
                const nx = -(by - ay), ny = bx - ax, nl = Math.hypot(nx, ny) || 1;
                const ox = nx / nl * cr.w * cr.side, oy = ny / nl * cr.w * cr.side;
                for (const k of [3, 6, 10, 15]) {
                    x.strokeStyle = `rgba(40,30,20,${(dark ? 0.06 : 0.022) * life})`;
                    x.lineWidth = cr.w * k;
                    x.beginPath(); x.moveTo(ax - ox * k * 0.5, ay - oy * k * 0.5); x.lineTo(bx - ox * k * 0.5, by - oy * k * 0.5); x.stroke();
                }
                x.strokeStyle = `rgba(255,253,248,${(dark ? 0.07 : 0.6) * life})`;
                x.lineWidth = cr.w * 1.3;
                x.beginPath(); x.moveTo(ax + ox * 0.6, ay + oy * 0.6); x.lineTo(bx + ox * 0.6, by + oy * 0.6); x.stroke();
            }
        }
        // masking tape across each corner
        const corners = [[0, 0, 1, 1], [1, 0, -1, 1], [0, 1, 1, -1], [1, 1, -1, -1]];
        for (const [cx, cy, sx, sy] of corners) {
            const len = (50 + rand() * 16) * S, wid = (16 + rand() * 3) * S;
            const px = cx * W + sx * (6 + rand() * 6) * S, py = cy * H + sy * (6 + rand() * 6) * S;
            const ang = Math.atan2(sy, sx) + Math.PI / 2 + (rand() - 0.5) * 0.5;
            x.save();
            x.translate(px, py); x.rotate(ang);
            // torn ends
            const path = new Path2D();
            const teeth = 7;
            path.moveTo(-len / 2, -wid / 2);
            path.lineTo(len / 2, -wid / 2);
            for (let i = 1; i <= teeth; i++) path.lineTo(len / 2 + (rand() - 0.5) * 2.4 * S, -wid / 2 + wid * i / teeth);
            path.lineTo(-len / 2, wid / 2);
            for (let i = teeth - 1; i >= 0; i--) path.lineTo(-len / 2 + (rand() - 0.5) * 2.4 * S, -wid / 2 + wid * i / teeth);
            path.closePath();
            x.shadowColor = 'rgba(30,20,10,.16)'; x.shadowBlur = 2.5 * S; x.shadowOffsetY = 0.6 * S;
            x.fillStyle = `rgba(${tape[0]},${tape[1]},${tape[2]},${dark ? 0.86 : 0.74})`;
            x.fill(path);
            x.shadowColor = 'transparent';
            x.clip(path);
            // crepe: fine creping across the tape, and the paper's edge showing through
            for (let i = 0; i < len / (1.3 * S); i++) {
                const xx = -len / 2 + i * 1.3 * S + rand() * S;
                x.fillStyle = `rgba(${rand() < 0.5 ? '255,250,235' : '120,100,60'},${0.05 + rand() * 0.07})`;
                x.fillRect(xx, -wid / 2, 0.6 * S, wid);
            }
            const g = x.createLinearGradient(0, -wid / 2, 0, wid / 2);
            g.addColorStop(0, 'rgba(255,250,235,.22)'); g.addColorStop(0.15, 'rgba(255,250,235,0)');
            g.addColorStop(0.85, 'rgba(90,70,40,0)'); g.addColorStop(1, 'rgba(90,70,40,.12)');
            x.fillStyle = g; x.fillRect(-len, -wid, len * 2, wid * 2);
            x.restore();
        }
    }

    /* ---- the wax ----------------------------------------------------------- */

    // one segment of a stroke: every pixel within reach of the segment takes
    // wax in proportion to the length of the stroke that passed over it,
    // across a soft profile, times the streaks, times how hard the paper
    // pressed back there
    function deposit(x0, y0, x1, y1, pr, R, off) {
        const dx = x1 - x0, dy = y1 - y0;
        let L = Math.hypot(dx, dy);
        let ux, uy;
        if (L < 0.01) { ux = 1; uy = 0; L = R * 0.25; } else { ux = dx / L; uy = dy / L; }
        // a consistent normal, so going back over the same line reuses the same streaks
        let nx = -uy, ny = ux;
        if (ny < 0 || (ny === 0 && nx < 0)) { nx = -nx; ny = -ny; }
        const bx0 = Math.max(0, Math.floor(Math.min(x0, x1) - R)), bx1 = Math.min(W - 1, Math.ceil(Math.max(x0, x1) + R));
        const by0 = Math.max(0, Math.floor(Math.min(y0, y1) - R)), by1 = Math.min(H - 1, Math.ceil(Math.max(y0, y1) + R));
        if (bx0 > bx1 || by0 > by1) return;
        const k = 0.75 * pr / R, R2 = R * R, iR2 = 1 / R2;
        for (let y = by0; y <= by1; y++) {
            const py = y + 0.5 - y0;
            let i = y * W + bx0;
            for (let x = bx0; x <= bx1; x++, i++) {
                const c = C[i];
                if (c < 0.004) continue;
                const pxx = x + 0.5 - x0;
                const d = pxx * nx + py * ny;
                const d2 = d * d;
                if (d2 >= R2) continue;
                const t = pxx * ux + py * uy;
                const hh = Math.sqrt(R2 - d2);
                const chord = Math.min(L, t + hh) - Math.max(0, t - hh);
                if (chord <= 0) continue;
                const q = d2 * iR2;
                const prof = Math.exp(-2.6 * q) * (1 - q);
                let s = (x * nx + y * ny) + off;
                s = ((s % STREAK_N) + STREAK_N) % STREAK_N;
                const si = s | 0, sf = s - si;
                const st = streak[si] * (1 - sf) + streak[(si + 1) % STREAK_N] * sf;
                D[i] += k * chord * prof * st * c;
            }
        }
        grow(bx0, by0, bx1, by1);
        anyInk = true;
    }

    function grow(x0, y0, x1, y1) {
        if (!dirty) dirty = [x0, y0, x1, y1];
        else { dirty[0] = Math.min(dirty[0], x0); dirty[1] = Math.min(dirty[1], y0); dirty[2] = Math.max(dirty[2], x1); dirty[3] = Math.max(dirty[3], y1); }
    }

    function paintWax() {
        if (!dirty) return;
        const [x0, y0, x1, y1] = dirty;
        dirty = null;
        const { wax, sheen } = col || (col = colors());
        const d = wImg.data;
        const maxA = gold ? 0.95 : 0.975;
        for (let y = y0; y <= y1; y++) {
            let i = y * W + x0;
            for (let x = x0; x <= x1; x++, i++) {
                const v = D[i];
                const o = i * 4;
                if (v <= 0) { d[o + 3] = 0; continue; }
                // the fibres take wax from the top down: a light rub greys the
                // peaks, more rubbing fills the valleys of the paper
                let a = (v - TH[i]) / 0.42;
                a = a <= 0 ? 0 : a >= 1 ? 1 : a * a * (3 - 2 * a);
                // a whisper of wax dust even on the low fibres
                a = Math.max(a, Math.min(0.14, v * 0.1));
                // burnished: heavy wax on the top fibres takes a slight shine
                const sh = clamp((v - 1.6) / 2.4, 0, 1) * clamp((TH[i] < 0.5 ? 1 : 0.35), 0, 1) * (gold ? 0.55 : 0.5);
                d[o] = wax[0] + (sheen[0] - wax[0]) * sh;
                d[o + 1] = wax[1] + (sheen[1] - wax[1]) * sh;
                d[o + 2] = wax[2] + (sheen[2] - wax[2]) * sh;
                d[o + 3] = a * maxA * 255;
            }
        }
        xWax.putImageData(wImg, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
    }

    /* ---- strokes ----------------------------------------------------------- */

    // a pointer stroke: points in css px relative to the sheet
    const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

    // a pointer stroke: points in css px relative to the sheet
    function strokeTo(st, cx, cy, pressure, now) {
        const x = cx * S, y = cy * S;
        if (st.x == null) { st.x = x; st.y = y; st.t = now; return; }
        const dt = Math.max(1, now - st.t), dist = Math.hypot(x - st.x, y - st.y) / S;
        if (dist < 0.25) return;
        const v = dist / dt;                                   // css px per ms
        st.v = st.v == null ? v : st.v * 0.55 + v * 0.45;     // how fast now
        st.va = st.va == null ? Math.max(v, 0.3) : Math.max(0.25, st.va * 0.93 + v * 0.07); // how fast this hand goes
        // the hand slows and eases off at every turn, so each stroke tapers at its ends
        const lift = 0.08 + 0.92 * smooth(0.12, 0.75, st.v / st.va);
        // and the crayon only comes down over the first few pixels
        st.travel += dist;
        const land = smooth(0, 24, st.travel);
        const speed = 1 / (1 + 0.25 * st.v);                  // a quick stroke skims a little
        st.wob += dist * 0.02;
        const wobble = 0.86 + 0.28 * (0.5 + 0.5 * Math.sin(st.wob + st.ph) * Math.sin(st.wob * 0.37 + 1.3));
        // the width under the hand wanders too, so a patch's edge is ragged
        const reach = st.R * (0.8 + 0.32 * (0.5 + 0.5 * Math.sin(st.wob * 1.9 + st.ph * 2) * Math.sin(st.wob * 0.61 + 0.4)));
        queue.push([st.x, st.y, x, y, pressure * speed * wobble * lift * land, reach, st.off]);
        st.x = x; st.y = y; st.t = now;
        kick();
    }

    function newStroke() {
        return { x: null, y: null, t: 0, travel: 0, wob: 0, off: rand() * STREAK_N, ph: rand() * 6.3, R: reachCss * S * (W / S / 460) ** 0.5 };
    }

    /* ---- automatic rub ------------------------------------------------------ */

    // a hand going over the sheet: close zigzags that work down it, then a
    // lighter diagonal pass, the way people actually rub
    function handPath() {
        const pts = [];
        const r = rng(seed * 13 + 5);
        const R = reachCss * S * 1.35 * (W / S / 460) ** 0.5;
        const step = R * 0.55;
        let y = R * 0.3, dir = 1;
        while (y < H - R * 0.3) {
            const slant = (r() - 0.5) * 0.12 * W;
            const xa = -R * 0.2 + r() * R * 0.4, xb = W + R * 0.2 - r() * R * 0.4;
            const a = dir > 0 ? xa : xb, b = dir > 0 ? xb : xa;
            for (let i = 0; i <= 8; i++) {
                const t = i / 8;
                pts.push([a + (b - a) * t, y + slant * (t - 0.5) + step * t, 0.85 + 0.3 * r(), R]);
            }
            y += step; dir = -dir;
        }
        const first = pts.length;
        // the second pass: diagonals
        const ang = -0.6, ca = Math.cos(ang), sa = Math.sin(ang);
        const diag = Math.hypot(W, H), step2 = R * 1.1;
        dir = 1;
        for (let o = -diag / 2; o < diag / 2; o += step2) {
            const ox = W / 2 - sa * o, oy = H / 2 + ca * o;
            const a = dir > 0 ? -diag / 2 : diag / 2, b = -a;
            for (let i = 0; i <= 10; i++) {
                const t = a + (b - a) * i / 10;
                pts.push([ox + ca * t, oy + sa * t, 0.55 + 0.25 * r(), R]);
            }
            dir = -dir;
        }
        // timing: the first pass takes most of the time, so the figure comes
        // up down the sheet for the whole rub; the second pass only deepens it
        let total = 0;
        const segs = [];
        for (let i = 1; i < pts.length; i++) {
            if (i === first) continue;
            const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) * (i < first ? 1 : 0.3);
            segs.push([pts[i - 1], pts[i], total, l]);
            total += l;
        }
        return { segs, total, done: 0, si: 0, off: r() * STREAK_N };
    }

    function advanceAuto(to) {
        const a = auto;
        while (a.si < a.segs.length) {
            const [p, q, start, l] = a.segs[a.si];
            const from = Math.max(a.done, start), end = Math.min(to, start + l);
            if (end > from) {
                const t0 = (from - start) / l, t1 = (end - start) / l;
                deposit(p[0] + (q[0] - p[0]) * t0, p[1] + (q[1] - p[1]) * t0, p[0] + (q[0] - p[0]) * t1, p[1] + (q[1] - p[1]) * t1, p[2], p[3], a.off);
            }
            if (start + l <= to) a.si++; else break;
        }
        a.done = to;
    }

    function rubAll(instant) {
        if (!ready) return;
        auto = handPath();
        if (instant) {
            advanceAuto(auto.total);
            auto = null;
            paintWax();
            say('The rubbing is finished.');
            return;
        }
        auto.t0 = performance.now();
        say('Rubbing the sheet.');
        kick();
    }

    // someone has already started: a few loose strokes back and forth, longer
    // in the middle, easing off at every turn
    function hint(fx, fy) {
        const r = rng(seed * 31 + 7);
        const R = reachCss * S * (W / S / 460) ** 0.5;
        const cx = fx * W, cy = fy * H, w = W * 0.36, h = W * 0.2;
        const off = r() * STREAK_N;
        const ang = (r() - 0.5) * 0.35, ca = Math.cos(ang), sa = Math.sin(ang);
        const n = 20;
        let side = 0, prev = null;
        for (let k = 0; k < n; k++) {
            const g = (k + 0.5) / n;
            const L = w * (0.4 + 0.6 * Math.sin(Math.PI * g)) * (0.8 + 0.3 * r());
            side = side * 0.7 + (r() - 0.5) * 0.12 * w;
            const v0 = -h / 2 + h * g, bow = (r() - 0.5) * 0.12 * L, tilt = (r() - 0.5) * 0.3;
            const dir = k % 2 ? -1 : 1, steps = 10;
            for (let j = 0; j <= steps; j++) {
                const f = j / steps, e = 0.5 - 0.5 * Math.cos(Math.PI * f);
                const u = dir * (e - 0.5) * L + side, v = v0 + bow * (1 - (2 * e - 1) ** 2) + u * tilt;
                const p = [cx + u * ca - v * sa, cy + u * sa + v * ca];
                if (prev) {
                    const pr = (0.15 + 0.85 * Math.sin(Math.PI * f)) * (0.75 + 0.3 * r()) * (0.6 + 0.4 * Math.sin(Math.PI * g));
                    deposit(prev[0], prev[1], p[0], p[1], pr, R * (0.8 + 0.3 * r()), off);
                }
                prev = p;
            }
        }
        paintWax();
    }

    function say(t) { live.textContent = t; }

    /* ---- the loop ----------------------------------------------------------- */

    function kick() { if (!raf && !dead) raf = requestAnimationFrame(frame); }

    function frame(now) {
        raf = 0;
        if (!ready || dead) return;
        for (const [x0, y0, x1, y1, pr, R, off] of queue.splice(0)) deposit(x0, y0, x1, y1, pr, R, off);
        if (auto && visible) {
            const f = clamp((now - auto.t0) / duration, 0, 1);
            const e = f < 0.08 ? f * f / 0.16 : f - 0.04;      // the hand gets going
            advanceAuto(auto.total * clamp(e / 0.96, 0, 1));
            if (f >= 1) { auto = null; say('The rubbing is finished.'); }
        }
        paintWax();
        if (queue.length || (auto && visible)) kick();
    }

    /* ---- input ---------------------------------------------------------------- */

    const strokes = new Map();       // pointerId -> stroke (or pending touch)
    let lockTouch = false;

    const local = (e) => {
        const r = el.getBoundingClientRect();
        return [(e.clientX - r.left) * (W / S) / r.width, (e.clientY - r.top) * (H / S) / r.height];
    };
    const pressureOf = (e) => {
        if (e.pointerType === 'pen' && e.pressure > 0) return 0.35 + e.pressure * 1.1;
        if (e.pointerType === 'touch' && e.pressure > 0 && e.pressure !== 0.5 && e.pressure !== 1) return 0.45 + e.pressure * 0.9;
        return 0.85;
    };

    function onDown(e) {
        if (!ready || (e.pointerType === 'mouse' && e.button !== 0)) return;
        if (auto) return;
        const [x, y] = local(e);
        if (e.pointerType === 'touch') {
            const p = { pending: true, sx: e.clientX, sy: e.clientY, x0: x, y0: y, st: newStroke() };
            p.timer = setTimeout(() => { if (p.pending) { activate(e.pointerId, p); strokeTo(p.st, p.x0, p.y0, 0.85, performance.now()); } }, HOLD_MS);
            strokes.set(e.pointerId, p);
            return;
        }
        e.preventDefault();
        try { el.setPointerCapture(e.pointerId); } catch (_) { /* fine */ }
        const p = { pending: false, st: newStroke() };
        strokes.set(e.pointerId, p);
        el.classList.add('br-rubbing');
        strokeTo(p.st, x, y, pressureOf(e), e.timeStamp || performance.now());
    }

    function activate(id, p) {
        p.pending = false;
        clearTimeout(p.timer);
        lockTouch = true;
        el.classList.add('br-rubbing');
        try { el.setPointerCapture(id); } catch (_) { /* fine */ }
    }

    function onMove(e) {
        const p = strokes.get(e.pointerId);
        if (!p) return;
        if (p.pending) {
            const dx = e.clientX - p.sx, dy = e.clientY - p.sy;
            if (Math.hypot(dx, dy) < 6) return;
            if (Math.abs(dx) > Math.abs(dy) * 1.1) {
                activate(e.pointerId, p);
                strokeTo(p.st, p.x0, p.y0, pressureOf(e), e.timeStamp || performance.now());
            } else {
                // an up-and-down swipe: that's the page scrolling, let it
                clearTimeout(p.timer);
                strokes.delete(e.pointerId);
                return;
            }
        }
        const list = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
        for (const c of (list.length ? list : [e])) {
            const [x, y] = local(c);
            strokeTo(p.st, x, y, pressureOf(c), c.timeStamp || performance.now());
        }
    }

    function onUp(e) {
        const p = strokes.get(e.pointerId);
        if (!p) return;
        clearTimeout(p.timer);
        strokes.delete(e.pointerId);
        if (![...strokes.values()].some((q) => !q.pending)) { lockTouch = false; el.classList.remove('br-rubbing'); }
    }

    // iOS and Chrome: once a touch is rubbing, the page must not move under it
    const onTouchMove = (e) => { if (lockTouch && e.cancelable) e.preventDefault(); };

    function onKey(e) {
        if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
            e.preventDefault();
            if (calm.matches) rubAll(true);
            else if (!auto) rubAll(false);
        }
    }

    on(el, 'pointerdown', onDown);
    on(el, 'pointermove', onMove);
    on(el, 'pointerup', onUp);
    on(el, 'pointercancel', onUp);
    on(el, 'touchmove', onTouchMove, { passive: false });
    on(el, 'keydown', onKey);
    on(el, 'contextmenu', (e) => { if (strokes.size) e.preventDefault(); });

    // the sheet is prepared when it comes near the screen, and an automatic
    // rub pauses while it is away
    let started = false;
    const io = new IntersectionObserver((ents) => {
        visible = ents[ents.length - 1].isIntersecting;
        if (visible && !started) {
            started = true;
            build().catch((err) => { console.warn(err.message || err); el.classList.remove('br-on'); });
        }
        if (visible && auto) { auto.t0 = performance.now() - (auto.done / auto.total) * duration; kick(); }
    }, { rootMargin: '600px 0px' });
    io.observe(el);

    const destroy = () => {
        dead = true;
        cancelAnimationFrame(raf);
        for (const p of strokes.values()) clearTimeout(p.timer);
        offs.forEach((f) => f());
        io.disconnect();
        for (const c of [cPaper, cWax, cOver, live]) c && c.remove();
        el.classList.remove('br', 'br-on', 'br-rubbing');
        added.forEach((k) => el.removeAttribute(k));
    };
    // the sheet as one picture (paper and wax; no tape), e.g. for the no-JS image
    destroy.snapshot = (type = 'image/webp', q = 0.82) => {
        if (!ready) return null;
        const c = document.createElement('canvas');
        c.width = W; c.height = H;
        const x = c.getContext('2d');
        x.drawImage(cPaper, 0, 0); x.drawImage(cWax, 0, 0);
        return c.toDataURL(type, q);
    };
    destroy.rub = () => rubAll(calm.matches);
    destroy.clear = () => { if (!ready) return; D.fill(0); auto = null; dirty = [0, 0, W - 1, H - 1]; paintWax(); };
    Object.defineProperty(destroy, 'state', { get: () => ({ ready, rubbing: !!auto, anyInk, size: [W, H] }) });
    return destroy;
}

function init() {
    for (const el of document.querySelectorAll('[data-brass-rubbing]')) {
        if (el.__brassRubbing) continue;
        el.__brassRubbing = brassRubbing(el);
    }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();
