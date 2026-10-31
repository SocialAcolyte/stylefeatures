/*
 *  DRIP-TIP // rain in Rousseau's painted jungle.
 *
 *  Markup:  <section data-drip-tip
 *                    data-src="assets/rousseau-the-equatorial-jungle.webp">
 *             <div class="dt-stage">
 *               <img class="dt-still" src="assets/rousseau-…webp" alt="">
 *             </div>
 *           </section>
 *  Or call  dripTip(section, { src, masks, under, seed, rain, focus })  yourself.
 *  It returns destroy().
 *
 *  Fourteen of the painting's own leaves have been cut out where Rousseau put
 *  them (their outlines in assets/leaf-masks.png, the paint behind them
 *  filled in assets/leaf-under.webp). At rest each is pixel for pixel the
 *  painting. Rain falls; on each leaf the water gathers, runs down the
 *  midrib to the pointed tip, swells there into a bead that holds the jungle
 *  upside down, lets go and falls, and a leaf it lands on dips a few degrees
 *  on its petiole and rings back. Scrolling through the section eases the
 *  downpour: fewer streaks, then only drops from the crowns above and from
 *  leaf to leaf, slower and slower, a last drop, stillness, and the colour of
 *  the painting comes back. Scroll up and the rain returns.
 *
 *  Events (bubbling, on the section):
 *    drip-tip:drip   a drop leaves a tip    detail { leaf, volume (mm3), x, y, kind }
 *    drip-tip:hit    a drop lands on a leaf  detail { leaf, strength 0-1, x, y }
 *    drip-tip:shake  a leaf was knocked      detail { leaf, volume }
 *
 *  Canvas 2D. Nothing runs off screen, in a hidden tab, or once the water
 *  has stopped moving. Reduced motion: the moment after the rain.
 */

const calm = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

// ── the leaves cut from The Equatorial Jungle (3681 x 4000 px) ─────────────
// box: where the cut-out sits in the painting (x, y, w, h); at: its place in
// the two atlases; base: the petiole it swings on; tip: its point. All in
// painting px.
export const LEAVES = [
    {id: "P2", box: [758, 267, 147, 39], at: [0, 0], base: [760, 282], tip: [882, 291]},
    {id: "P1", box: [775, 371, 194, 49], at: [151, 0], base: [780, 402], tip: [946, 392]},
    {id: "H3", box: [1335, 258, 160, 87], at: [349, 0], base: [1485, 321], tip: [1357, 308]},
    {id: "H2", box: [1368, 328, 267, 124], at: [513, 0], base: [1628, 395], tip: [1390, 351]},
    {id: "H1", box: [1432, 444, 179, 157], at: [784, 0], base: [1589, 471], tip: [1450, 584]},
    {id: "H5", box: [1609, 332, 256, 231], at: [967, 0], base: [1628, 364], tip: [1842, 415]},
    {id: "H6", box: [1890, 250, 277, 218], at: [0, 235], base: [2147, 333], tip: [1911, 437]},
    {id: "H7", box: [2095, 417, 179, 176], at: [281, 235], base: [2254, 442], tip: [2113, 575]},
    {id: "C1", box: [1290, 1273, 232, 238], at: [464, 235], base: [1512, 1498], tip: [1307, 1290]},
    {id: "C2", box: [1527, 1219, 151, 292], at: [700, 235], base: [1550, 1500], tip: [1660, 1240]},
    {id: "C3", box: [1618, 1352, 201, 305], at: [855, 235], base: [1640, 1635], tip: [1796, 1372]},
    {id: "C4", box: [1327, 1459, 269, 208], at: [1060, 235], base: [1585, 1655], tip: [1346, 1475]},
    {id: "L1", box: [1298, 1657, 359, 165], at: [0, 544], base: [1646, 1782], tip: [1319, 1682]},
    {id: "L2", box: [1701, 1664, 306, 93], at: [363, 544], base: [1996, 1714], tip: [1723, 1709]},
];

// how the painting is framed: a full-bleed band, cropped in on the jungle.
// `crop` is how many painting px the stage's width should show (the zoom),
// `focus` the object-position of the crop.
const FRAMES = {
    // wide: x 560-3681, y 30-1785, the hanging leaves against the sky and the
    // spray below them; tall: x 1180-2380, the same column, down to y 2370.
    // Both stop short of the bird on the left and the creature in the grass.
    wide: { band: [0.05, 0.05], crop: 3121, focus: [1, 0.013] },
    tall: { band: [0.04, 0.04], crop: 1200, focus: [0.476, 0.018] },
};

// ── the weather, as a function of how far through the section you are ──
export function weather(p) {
    return {
        rain: 1 - smooth(0.14, 0.5, p),                              // the downpour (throughfall)
        canopy: smooth(0.04, 0.32, p) * (1 - smooth(0.46, 0.8, p)),  // big drops from the crowns, after
        colour: smooth(0.36, 0.92, p),                               // the painting's own colour returning
        veil: 1 - smooth(0.08, 0.62, p),                             // grey of falling water
    };
}

const G = 9.81;               // m/s^2
const SRC_PX_PER_MM = 2.0;    // the hanging leaves are ~250 px: blades of about 12 cm
const BEAD_GAIN = 2.1;        // beads drawn about twice life size so they read at arm's length
const TIP_GAIN = 1.45;        // the pendant drop at a tip is the hero: it holds the whole leaf's run-off
const TAU = 2.4;              // s, for a leaf's film to run down to the tip
const V_CRIT = [16, 26];      // mm3, what a drip tip lets go (La Selva: 8-30 mm3)

function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function hash2(x, s) { let h = (x * 374761393 + s * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function noise1(x, s) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return mix(hash2(i, s), hash2(i + 1, s), u); }

function loadImage(src) {
    return new Promise((res, rej) => { const im = new Image(); im.decoding = 'async'; im.onload = () => res(im); im.onerror = rej; im.src = src; });
}

// rain-dulled copy: the painting's own colour kept, desaturated to about 55%,
// contrast lowered a touch and cooled toward the blue-grey of a wet afternoon.
// Never monochrome.
function greyed(canvas, amt = 1, lift = 0.1) {
    const c = document.createElement('canvas'); c.width = canvas.width; c.height = canvas.height;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(canvas, 0, 0);
    const im = g.getImageData(0, 0, c.width, c.height), d = im.data;
    const keep = 1 - 0.45 * amt, fog = [150, 168, 178];
    for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] === 0) continue;
        const l = d[i] * 0.3 + d[i + 1] * 0.55 + d[i + 2] * 0.15;
        for (let k = 0; k < 3; k++) {
            let v = l + (d[i + k] - l) * keep;
            v = 128 + (v - 128) * (1 - 0.08 * amt);
            d[i + k] = v + (fog[k] - v) * lift * amt;
        }
    }
    g.putImageData(im, 0, 0);
    return c;
}

export function dripTip(el, opts = {}) {
    const ds = el.dataset;
    const base = (u) => new URL(u, document.baseURI).href;
    const o = {
        src: opts.src ?? ds.src ?? el.querySelector('img')?.getAttribute('src'),
        masks: opts.masks ?? ds.masks ?? 'assets/leaf-masks.png',
        under: opts.under ?? ds.under ?? 'assets/leaf-under.webp',
        seed: +(opts.seed ?? ds.seed ?? 11),
        rain: +(opts.rain ?? ds.rain ?? 1),
        focus: opts.focus ?? (ds.focus ? ds.focus.split(/[\s,]+/).map(Number) : null),
    };
    const reduced = calm.matches;
    el.classList.add('dt');
    if (reduced) el.classList.add('dt-calm');
    const stage = el.querySelector('.dt-stage') || el;
    const canvas = document.createElement('canvas');
    canvas.className = 'dt-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    stage.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    const prevTab = stage.getAttribute('tabindex'), prevRole = stage.getAttribute('role'), prevLabel = stage.getAttribute('aria-label');
    stage.setAttribute('tabindex', '0'); stage.setAttribute('role', 'button');
    stage.setAttribute('aria-label', 'Rousseau’s jungle in the rain. Press to knock a leaf and shed its water.');

    let dead = false, W = 0, H = 0, dpr = 1;
    let paint = null, maskImg = null, underImg = null, maskData = null;
    let bgColour = null, bgGrey = null, bgComp = null, compKey = '';
    let F = null;                                // framing: sc, ox, oy, top, bottom, pxmm
    let leaves = [];
    let visible = false, raf = 0, last = 0, time = 0;
    let p = reduced ? 1 : 0, lastScrollAt = performance.now();
    const R = rng(o.seed * 7919 + 1);
    const streaks = [], drops = [], bits = [], flashes = [];
    const listeners = [];
    const on = (t, ev, fn, opt) => { t.addEventListener(ev, fn, opt); listeners.push(() => t.removeEventListener(ev, fn, opt)); };
    const emit = (name, detail) => el.dispatchEvent(new CustomEvent('drip-tip:' + name, { bubbles: true, detail }));

    // ── framing ───────────────────────────────────────────────────────
    function frame() {
        const tall = H > W * 1.1, fr = FRAMES[tall ? 'tall' : 'wide'];
        const PW = paint.naturalWidth, PH = paint.naturalHeight;
        const top = Math.round(H * fr.band[0]), bottom = Math.round(H * (1 - fr.band[1])), bh = bottom - top;
        const cover = Math.max(W / PW, bh / PH);
        // zoom in on the jungle, but never past ~1.2 device px per painted px
        const sc = Math.max(cover, Math.min(W / fr.crop, 1.2 / dpr));
        const foc = o.focus || fr.focus;
        const ox = (W - PW * sc) * foc[0], oy = top + (bh - PH * sc) * foc[1];
        const pxmm = sc * SRC_PX_PER_MM;
        return { sc, ox, oy, top, bottom, pxmm, gain: BEAD_GAIN * clamp(0.5 / sc, 1, 1.5), tall };
    }
    const P2S = (x, y) => [F.ox + x * F.sc, F.oy + y * F.sc];

    function build() {
        const r = rng(o.seed);
        leaves = LEAVES.map((d, i) => {
            const [bx, by] = P2S(d.base[0], d.base[1]), [tx, ty] = P2S(d.tip[0], d.tip[1]);
            const lenS = Math.hypot(d.tip[0] - d.base[0], d.tip[1] - d.base[1]);
            const drip = (d.tip[1] - d.base[1]) > -0.15 * lenS;      // water runs to a tip that is not held up
            // the area of the blade, from its mask
            let area = 0;
            for (let y = 0; y < d.box[3]; y += 2) for (let x = 0; x < d.box[2]; x += 2) if (maskData.data[(d.at[1] + y) * maskData.w + d.at[0] + x] > 200) area += 4;
            const L = {
                i, d, id: d.id, drip, bx, by, tx, ty, lenS, len: lenS * F.sc, area,
                // a damped spring on the petiole: big leaves slower
                omega: 2 * Math.PI * mix(3.6, 2.0, clamp((lenS - 120) / 180)) * (0.9 + 0.2 * r()),
                zeta: 0.11 + 0.05 * r(), mass: lenS / 200,
                down: tx >= bx ? 1 : -1,
                th: 0, w: 0, W: 0, V: 0, flow: 0, wet: reduced ? 0.7 : 0,
                vcrit: mix(V_CRIT[0], V_CRIT[1], r()),
                glints: [], beads: [], hitRain: 0, neck: 0, dash: [],
            };
            L.mid = midrib(d);
            for (let k = 0; k < 8; k++) L.dash.push(mix(1.5, 6, r()), mix(5, 14, r()));
            L.V = !drip ? 0 : reduced ? L.vcrit * (0.6 + 0.25 * r()) : L.vcrit * 0.4 * r();
            // beads that sit on the blade after rain
            const n = Math.round(clamp(area / 1600, 3, 9));
            for (let k = 0, tries = 0; k < n && tries < 400; tries++) {
                const sx = r() * d.box[2], sy = r() * d.box[3];
                if (maskData.data[(d.at[1] + (sy | 0)) * maskData.w + d.at[0] + (sx | 0)] < 250) continue;
                const px = d.box[0] + sx, py = d.box[1] + sy;
                if (Math.hypot(px - d.tip[0], py - d.tip[1]) < 30) continue;
                L.beads.push({ px, py, r: 0.6 + r() * r() * 1.4, show: r() });
                k++;
            }
            return L;
        });
    }

    // the midrib, traced from the mask: the middle of the blade across its width,
    // from a third of the way out to the tip (painting px)
    function midrib(d) {
        const b = d.base, t = d.tip, dx = t[0] - b[0], dy = t[1] - b[1], len = Math.hypot(dx, dy);
        const ux = dx / len, uy = dy / len, nx = -uy, ny = ux, pts = [];
        const at = (x, y) => { const ix = Math.round(x - d.box[0]), iy = Math.round(y - d.box[1]); return ix >= 0 && iy >= 0 && ix < d.box[2] && iy < d.box[3] && maskData.data[(d.at[1] + iy) * maskData.w + d.at[0] + ix] > 160; };
        for (let k = 0; k <= 20; k++) {
            const sfrac = 0.3 + 0.7 * k / 20, px = b[0] + dx * sfrac, py = b[1] + dy * sfrac;
            if (k === 20) { pts.push([t[0], t[1]]); break; }
            let lo = 0, hi = 0;
            while (lo > -120 && at(px + nx * (lo - 1), py + ny * (lo - 1))) lo--;
            while (hi < 120 && at(px + nx * (hi + 1), py + ny * (hi + 1))) hi++;
            const c = (lo + hi) / 2;
            pts.push([px + nx * c, py + ny * c]);
        }
        // smooth it, keeping the tip
        return pts.map((q, i) => i === 0 || i === pts.length - 1 ? q : [(pts[i - 1][0] + 2 * q[0] + pts[i + 1][0]) / 4, (pts[i - 1][1] + 2 * q[1] + pts[i + 1][1]) / 4]);
    }

    // a leaf's painting point, where the leaf is now (rotated th about its base)
    function toStage(L, px, py) {
        const [x, y] = P2S(px, py), c = Math.cos(L.th), s = Math.sin(L.th), dx = x - L.bx, dy = y - L.by;
        return [L.bx + dx * c - dy * s, L.by + dx * s + dy * c];
    }
    function inside(L, X, Y, thr = 128) {
        const c = Math.cos(-L.th), s = Math.sin(-L.th), dx = X - L.bx, dy = Y - L.by;
        const x = L.bx + dx * c - dy * s, y = L.by + dx * s + dy * c;
        const px = (x - F.ox) / F.sc - L.d.box[0], py = (y - F.oy) / F.sc - L.d.box[1];
        const ix = px | 0, iy = py | 0;
        if (px < 0 || py < 0 || ix >= L.d.box[2] || iy >= L.d.box[3]) return false;
        return maskData.data[(L.d.at[1] + iy) * maskData.w + L.d.at[0] + ix] >= thr;
    }
    const tipOf = (L) => toStage(L, L.d.tip[0], L.d.tip[1]);

    // ── preparing the pictures ───────────────────────────────────────
    function makeEdgeMask() {
        // the band of painting fades into the paper above and below over a
        // short, slightly irregular contour; the paint itself is never blurred
        const mw = Math.ceil(W / 4), mh = Math.ceil(H);
        const m = document.createElement('canvas'); m.width = mw; m.height = mh;
        const g = m.getContext('2d'); const im = g.createImageData(mw, mh), d = im.data;
        const fade = 3, amp = 3;
        for (let x = 0; x < mw; x++) {
            const X = x * 4;
            const t = F.top + (noise1(X / 70, o.seed) - 0.5) * 2 * amp + (noise1(X / 17, o.seed + 5) - 0.5) * amp * 0.5;
            const b = F.bottom + (noise1(X / 70, o.seed + 9) - 0.5) * 2 * amp + (noise1(X / 17, o.seed + 13) - 0.5) * amp * 0.5;
            for (let y = 0; y < mh; y++) d[(y * mw + x) * 4 + 3] = 255 * smooth(t - fade, t + 2, y) * (1 - smooth(b - 2, b + fade, y));
        }
        g.putImageData(im, 0, 0);
        return m;
    }

    function prepare() {
        const w = Math.round(W * dpr), h = Math.round(H * dpr);
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const g = c.getContext('2d');
        g.imageSmoothingQuality = 'high';
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.drawImage(paint, F.ox, F.oy, paint.naturalWidth * F.sc, paint.naturalHeight * F.sc);
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.globalCompositeOperation = 'destination-in';
        g.drawImage(makeEdgeMask(), 0, 0, w, h);
        g.globalCompositeOperation = 'source-over';
        bgColour = c;
        bgGrey = greyed(c);
        bgComp = document.createElement('canvas'); bgComp.width = w; bgComp.height = h;
        compKey = '';
        // each leaf as a sprite cut from the painting at its own resolution
        for (const L of leaves) {
            const d = L.d, s = document.createElement('canvas'); s.width = d.box[2]; s.height = d.box[3];
            const sg = s.getContext('2d');
            sg.drawImage(paint, d.box[0], d.box[1], d.box[2], d.box[3], 0, 0, d.box[2], d.box[3]);
            sg.globalCompositeOperation = 'destination-in';
            sg.drawImage(maskImg, d.at[0], d.at[1], d.box[2], d.box[3], 0, 0, d.box[2], d.box[3]);
            L.sprite = s; L.spriteGrey = greyed(s);
            // the paint behind it, filled in, shown only while it moves
            const u = document.createElement('canvas'); u.width = d.box[2]; u.height = d.box[3];
            u.getContext('2d').drawImage(underImg, d.at[0], d.at[1], d.box[2], d.box[3], 0, 0, d.box[2], d.box[3]);
            L.under = u; L.underGrey = greyed(u);
        }
    }

    function resize() {
        const r = stage.getBoundingClientRect();
        const nw = Math.round(r.width), nh = Math.round(r.height);
        if (!nw || !nh) return false;
        if (nw === W && nh === H && bgColour) return false;
        W = nw; H = nh; dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
        canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
        F = frame(); build(); prepare();
        streaks.length = drops.length = bits.length = flashes.length = 0;
        return true;
    }

    // grey in the rain, colour after; a thin veil of falling water
    function composeBackground(wx) {
        const key = wx.colour.toFixed(3);
        if (key === compKey) return;
        compKey = key;
        const g = bgComp.getContext('2d');
        g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
        g.clearRect(0, 0, bgComp.width, bgComp.height);
        g.drawImage(bgGrey, 0, 0);
        if (wx.colour > 0) { g.globalAlpha = wx.colour; g.drawImage(bgColour, 0, 0); g.globalAlpha = 1; }
    }

    // ── water ─────────────────────────────────────────────────────────
    const beadR = (vol) => Math.cbrt(3 * vol / (4 * Math.PI)) * F.pxmm * F.gain;
    function landing() { return mix(90, 380, R() * R()) * F.pxmm; }   // the painted foliage it lands on below, unseen

    function release(L, vol, kind = 'drip') {
        const [tx, ty] = tipOf(L);
        const r = beadR(vol) * TIP_GAIN;
        drops.push({ x: tx, y: ty + r * 1.6, vx: 0, vy: 0.05 * 1000 * F.pxmm, r, from: L.i, age: 0, vol, land: ty + landing() });
        if (R() < 0.6) drops.push({ x: tx, y: ty + r * 0.3, vx: 0, vy: 0, r: r * 0.36, from: L.i, age: -0.03 - 0.02 * R(), vol: vol * 0.05, sat: 1, land: ty + landing() });
        L.w -= L.down * 0.35 * (vol / L.vcrit) / L.mass;        // relieved of the weight, it springs up
        L.neck = 1;
        emit('drip', { leaf: L.i, volume: Math.round(vol * 10) / 10, x: tx, y: ty, kind });
    }

    function hitLeaf(L, x, y, vol, speed, show = true, quiet = false) {
        const [bx, by] = [L.bx, L.by];
        const arm = clamp(Math.hypot(x - bx, y - by) / L.len, 0.2, 1);
        const J = vol * speed * arm;                             // mm3 * m/s
        L.w += L.down * 0.03 * J / L.mass;
        L.W += vol * 0.8 * (1 - 0.6 * smooth(0.75, 0.95, p));    // late on, more of it is lost to the splash
        L.wet = Math.min(1, L.wet + vol / 60);
        if (show) splash(x, y, vol, speed);
        if (!quiet) emit('hit', { leaf: L.i, strength: clamp(J / 60), x, y });
    }

    function splash(x, y, vol, speed) {
        const big = vol > 6, n = big ? 4 + Math.floor(R() * 4) : 1 + Math.floor(R() * 3);
        for (let k = 0; k < n; k++) {
            const a = -Math.PI / 2 + (R() - 0.5) * 2.4;
            const sp = (0.25 + R() * 0.75) * Math.min(1.4, 0.2 + speed * 0.28) * 1000 * F.pxmm;
            bits.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: (0.35 + R() * 0.6) * Math.max(0.7, F.pxmm * (big ? 0.6 : 0.4)), y0: y, age: 0 });
        }
        if (big) flashes.push({ x, y, r: Math.cbrt(vol) * F.pxmm * 1.3, age: 0 });
    }

    function shake(L) {
        L.w += (R() < 0.5 ? 1 : -1) * 2.4 / Math.sqrt(L.mass);
        const vol = L.V + L.W;
        if (L.drip && L.V > 2) release(L, L.V, 'shake');
        L.V = 0;
        const d = L.d, n = 2 + Math.floor(Math.min(5, (L.W + L.wet * 25) / 9));
        for (let k = 0, tries = 0; k < n && tries < 200; tries++) {
            const sx = R() * d.box[2], sy = R() * d.box[3];
            if (maskData.data[(d.at[1] + (sy | 0)) * maskData.w + d.at[0] + (sx | 0)] < 200) continue;
            const [x, y] = toStage(L, d.box[0] + sx, d.box[1] + sy);
            const v = 3 + R() * 9;
            drops.push({ x, y, vx: (R() - 0.5) * 0.3 * 1000 * F.pxmm, vy: -0.15 * 1000 * F.pxmm * R(), r: beadR(v), from: L.i, age: 0, vol: v, land: y + landing() });
            k++;
        }
        L.W = 0; L.wet *= 0.45;
        L.beads.forEach((b) => (b.gone = R() < 0.7));
        emit('shake', { leaf: L.i, volume: Math.round(vol) });
        wake();
    }

    // ── step ──────────────────────────────────────────────────────────
    function step(dt, wx) {
        time += dt;
        const idle = clamp(1 - (performance.now() - lastScrollAt - 50000) / 25000);  // a parked page: the shower passes
        const rain = wx.rain * o.rain * idle, canopy = wx.canopy * o.rain * idle;
        const g = G * 1000 * F.pxmm;                                  // px/s^2
        const bh = F.bottom - F.top;

        // throughfall streaks across the band
        let spawn = rain * (W * bh) / 5200 * dt * 8;
        while (spawn > 0) {
            if (spawn < 1 && R() > spawn) break;
            spawn -= 1;
            const near = R() < 0.4, k = near ? mix(0.9, 1.3, R()) : mix(0.45, 0.8, R());
            const v = mix(5.5, 8.5, R()) * 1000 * F.pxmm * k;           // m/s, near terminal
            streaks.push({ x: R() * W * 1.06 - W * 0.03, y: F.top - R() * bh * 0.3, v, len: Math.min(v / 60, bh * 0.25), near, w: near ? 1.3 : 0.75 });
        }
        // big drops still coming down from the crowns, aimed at the cut leaves most of the time
        if (R() < canopy * 4.5 * Math.max(0.6, W / 1100) * dt) {
            const vis = leaves.filter((L) => L.bx > -20 && L.bx < W + 20 && L.by > F.top && L.by < F.bottom);
            let x = R() * W, L = null;
            if (vis.length && R() < 0.8) { L = vis[Math.floor(R() * vis.length)]; x = mix(L.bx, L.tx, 0.2 + 0.6 * R()); }
            const vol = 30 + R() * 40, y0 = L ? Math.min(L.by, L.ty) - mix(60, 240, R()) * F.pxmm : F.top;
            drops.push({ x, y: y0, vx: 0, vy: 2.5 * 1000 * F.pxmm, r: beadR(vol), from: -1, age: 0, vol, land: F.bottom + 50, canopy: 1 });
        }

        for (let i = streaks.length - 1; i >= 0; i--) {
            const s = streaks[i];
            s.y += s.v * dt;
            let gone = s.y - s.len > F.bottom;
            if (!gone && s.near && s.y > F.top) {
                for (const L of leaves) {
                    if (Math.abs(s.x - L.bx) > L.len * 1.05 || Math.abs(s.y - L.by) > L.len * 1.05) continue;
                    if (inside(L, s.x, s.y)) { hitLeaf(L, s.x, s.y, 2.5 + R() * 3, 6, true, true); gone = true; break; }
                }
            }
            if (gone) streaks.splice(i, 1);
        }
        // rain on each leaf beyond what is drawn: water, and a tremble
        for (const L of leaves) {
            L.W += rain * 50 * (L.area / 8000) * dt;
            L.wet = Math.min(1, L.wet + rain * dt * 0.5);
            L.hitRain += rain * 2.6 * dt;
            while (L.hitRain > 1) {
                L.hitRain -= 1 + R();
                L.w += L.down * (R() - 0.3) * 0.06 / L.mass;
                if (R() < 0.5) {
                    const d = L.d;
                    for (let t = 0; t < 8; t++) {
                        const sx = R() * d.box[2], sy = R() * d.box[3];
                        if (maskData.data[(d.at[1] + (sy | 0)) * maskData.w + d.at[0] + (sx | 0)] < 220) continue;
                        const [x, y] = toStage(L, d.box[0] + sx, d.box[1] + sy); splash(x, y, 3, 6); break;
                    }
                }
            }
        }

        // the film runs to the tip; the bead there grows until it lets go
        for (const L of leaves) {
            if (rain < 0.001 && canopy < 0.001 && L.W < 1.5) { if (L.drip) L.V += L.W; L.W = 0; }   // the last of the film
            const q = L.W / (TAU * (1 - 0.5 * smooth(0.75, 0.95, p)));
            const flow = Math.min(L.W, q * dt);
            L.W -= flow;
            if (L.drip) L.V += flow;
            L.flow = mix(L.flow, L.drip ? q : 0, 1 - Math.exp(-dt * 6));
            if (L.drip && L.V >= L.vcrit) {
                const keep = L.vcrit * (0.34 + 0.16 * R());
                release(L, L.V - keep);
                L.V = keep;
            }
            L.neck = Math.max(0, L.neck - dt * 9);
            // the weight of the water bends it down a little
            const load = L.down * clamp(L.W / (L.vcrit * 3), 0, 1) * 0.025;   // only while water is running on it: at rest it is the painting again
            const a = -L.omega * L.omega * (L.th - load) - 2 * L.zeta * L.omega * L.w;
            L.w += a * dt; L.th += L.w * dt;
            if (Math.abs(L.th) > 0.13) { L.th = Math.sign(L.th) * 0.13; L.w *= -0.3; }
            if (L.flow > 0.4 && R() < Math.min(0.9, L.flow * 0.04) * dt) L.glints.push({ u: 0.1 + R() * 0.3, v: 0.2 + R() * 0.25 });
            for (let k = L.glints.length - 1; k >= 0; k--) { const gl = L.glints[k]; gl.u += gl.v * dt * (0.6 + gl.u); if (gl.u > 0.97) L.glints.splice(k, 1); }
            if (rain < 0.05) L.wet = Math.max(0.55 * Math.min(1, L.wet * 2), L.wet - dt * 0.01);
        }

        // drops fall; on a cut leaf they splash and it dips; otherwise they land unseen on the paint below
        for (let i = drops.length - 1; i >= 0; i--) {
            const d = drops[i];
            d.age += dt;
            if (d.age < 0) continue;
            const px0 = d.x, py0 = d.y;
            d.vy += g * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.vx *= 1 - dt * 0.5;
            let gone = false;
            if (d.age > 0.02) {
                for (const L of leaves) {
                    if (L.i === d.from && d.age < 0.3) continue;
                    if (Math.abs(d.x - L.bx) > L.len * 1.05 || Math.abs(d.y - L.by) > L.len * 1.05) continue;
                    const n = Math.max(1, Math.ceil(Math.abs(d.y - py0) / 3));
                    let hit = null;
                    for (let k = 1; k <= n; k++) { const x = mix(px0, d.x, k / n), y = mix(py0, d.y, k / n); if (inside(L, x, y, 160)) { hit = [x, y]; break; } }
                    if (hit) {
                        const speed = d.vy / (1000 * F.pxmm);
                        if (!d.sat) hitLeaf(L, hit[0], hit[1], d.vol, speed); else L.W += d.vol;
                        gone = true; break;
                    }
                }
            }
            if (!gone && d.y > d.land) { if (!d.sat && d.y < F.bottom) splash(d.x, d.land, d.vol * 0.4, d.vy / (1000 * F.pxmm)); gone = true; }
            if (!gone && d.y - 60 > H) gone = true;
            if (gone) drops.splice(i, 1);
        }
        for (let i = bits.length - 1; i >= 0; i--) {
            const b = bits[i]; b.age += dt;
            b.vy += g * dt; b.x += b.vx * dt; b.y += b.vy * dt;
            if (b.age > 0.9 || b.y > b.y0 + 60) bits.splice(i, 1);
        }
        for (let i = flashes.length - 1; i >= 0; i--) { flashes[i].age += dt; if (flashes[i].age > 0.14) flashes.splice(i, 1); }

        return streaks.length || drops.length || bits.length || flashes.length || rain > 0.001 || canopy > 0.001 ||
            leaves.some((L) => Math.abs(L.w) > 0.002 || Math.abs(L.th) > 0.0008 || L.W > 0.05 || L.glints.length || L.neck > 0);
    }

    // ── drawing ───────────────────────────────────────────────────────
    const moving = (L) => Math.abs(L.th) >= 0.0006;
    function drawPair(a, b, L, colour, x, y) {
        const w = L.d.box[2] * F.sc, h = L.d.box[3] * F.sc;
        if (colour < 1) ctx.drawImage(b, x, y, w, h);
        if (colour > 0) { ctx.globalAlpha = colour; ctx.drawImage(a, x, y, w, h); ctx.globalAlpha = 1; }
    }
    function drawLeaves(colour) {
        // at rest every cut-out is the painting itself, so nothing is drawn.
        // A moving leaf uncovers the filled paint behind it; its neighbours are
        // redrawn over that fill so they keep their edges.
        const live = leaves.filter(moving);
        if (!live.length) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        for (const L of live) { const [x, y] = P2S(L.d.box[0], L.d.box[1]); drawPair(L.under, L.underGrey, L, colour, x, y); }
        const hits = (A, B) => A.d.box[0] < B.d.box[0] + B.d.box[2] && B.d.box[0] < A.d.box[0] + A.d.box[2] && A.d.box[1] < B.d.box[1] + B.d.box[3] && B.d.box[1] < A.d.box[1] + A.d.box[3];
        for (const L of leaves) {
            if (!moving(L) && !live.some((M) => hits(L, M))) continue;
            const [x, y] = P2S(L.d.box[0], L.d.box[1]);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.translate(L.bx, L.by); ctx.rotate(L.th); ctx.translate(-L.bx, -L.by);
            drawPair(L.sprite, L.spriteGrey, L, colour, x, y);
        }
    }

    function drawWater(L) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const d = L.d;
        // the rivulet: the film of water running down the midrib to the tip. Wet
        // paint only deepens a little (10-15%), in a broad soft band that widens
        // where the water gathers; now and then a bright glint of sky slides along it
        if (L.drip) {
            const fl = clamp(L.flow / 12);
            const M = L.mid.map(([x, y]) => toStage(L, x, y)), n = M.length;
            const k = Math.sqrt(F.sc / 0.5);
            if (fl > 0.02) {
                ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                ctx.globalCompositeOperation = 'multiply';
                for (const [wm, am] of [[1, 0.35], [0.62, 0.4], [0.32, 0.45]]) {      // three passes: a soft edge
                    for (let i = 1; i < n; i++) {
                        const u = i / (n - 1), v = Math.round(255 * (1 - 0.045 * am * fl * smooth(0, 0.4, u) / 0.4));   // ~13% at the core in all
                        ctx.strokeStyle = `rgb(${v},${v},${Math.min(255, v + 2)})`;
                        ctx.lineWidth = mix(4, 10, u * u) * k * wm;
                        ctx.beginPath(); ctx.moveTo(M[i - 1][0], M[i - 1][1]); ctx.lineTo(M[i][0], M[i][1]); ctx.stroke();
                    }
                }
                ctx.globalCompositeOperation = 'source-atop';
            }
            // glints: small bright specular flashes sliding toward the tip, no shadow
            for (const gl of L.glints) {
                const f = gl.u * (n - 1), i = Math.min(n - 2, Math.floor(f)), t = f - i;
                const x = mix(M[i][0], M[i + 1][0], t), y = mix(M[i][1], M[i + 1][1], t);
                const al = Math.sin(Math.PI * clamp((gl.u - 0.05) / 0.95)) ** 2;
                const ang = Math.atan2(M[i + 1][1] - M[i][1], M[i + 1][0] - M[i][0]);
                ctx.fillStyle = `rgba(250,252,248,${0.75 * al})`;
                ctx.beginPath(); ctx.ellipse(x, y, (1.6 + 1.2 * gl.u) * k, 0.7 * k, ang, 0, 7); ctx.fill();
            }
        }
        // beads sitting on the blade
        for (const b of L.beads) {
            if (b.gone || b.show > L.wet) continue;
            const [x, y] = toStage(L, b.px, b.py), r = Math.max(0.8, b.r * F.pxmm * F.gain * 0.9);
            ctx.fillStyle = 'rgba(6,12,6,0.3)';
            ctx.beginPath(); ctx.arc(x + 0.25 * r, y + 0.35 * r, r, 0, 7); ctx.fill();
            ctx.fillStyle = 'rgba(214,224,214,0.4)';
            ctx.beginPath(); ctx.arc(x, y, r * 0.85, 0, 7); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,252,0.95)';
            ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.32, Math.max(0.45, r * 0.32), 0, 7); ctx.fill();
        }
    }

    // a bead is a lens: the jungle behind it upside down and small, a dark
    // rim where the curved surface mirrors the shade, a hard highlight
    function lens(x, y, r, ry = r) {
        ctx.save();
        ctx.beginPath(); ctx.ellipse(x, y, r, ry, 0, 0, 7); ctx.clip();
        const k = 5.5;
        const sx = Math.max(0, (x - k * r) * dpr), sy = Math.max(0, (y - k * r * 1.4) * dpr), sw = 2 * k * r * dpr;
        ctx.translate(x, y); ctx.scale(-1, -1);
        if (sx + sw < bgComp.width && sy + sw < bgComp.height) ctx.drawImage(bgComp, sx, sy, sw, sw, -r, -ry, 2 * r, 2 * ry);
        else { ctx.fillStyle = 'rgba(200,210,204,0.6)'; ctx.fillRect(-r, -ry, 2 * r, 2 * ry); }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const g = ctx.createRadialGradient(x - r * 0.2, y - ry * 0.25, r * 0.1, x, y, Math.max(r, ry) * 1.02);
        g.addColorStop(0, 'rgba(240,246,240,0.2)'); g.addColorStop(0.55, 'rgba(20,30,22,0.05)'); g.addColorStop(0.86, 'rgba(10,18,12,0.45)'); g.addColorStop(1, 'rgba(8,14,10,0.8)');
        ctx.fillStyle = g; ctx.fillRect(x - r - 2, y - ry - 2, 2 * r + 4, 2 * ry + 4);
        const c = ctx.createRadialGradient(x, y + ry * 0.55, 0, x, y + ry * 0.55, r * 0.7);
        c.addColorStop(0, 'rgba(255,255,246,0.6)'); c.addColorStop(1, 'rgba(255,255,246,0)');
        ctx.fillStyle = c; ctx.fillRect(x - r, y, 2 * r, ry + 1);
        ctx.restore();
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.beginPath(); ctx.ellipse(x - r * 0.34, y - ry * 0.4, Math.max(0.6, r * 0.24), Math.max(0.45, ry * 0.17), -0.5, 0, 7); ctx.fill();
    }

    function drawBead(L) {
        if (!L.drip || L.V < 0.6) return;
        const [tx, ty] = tipOf(L);
        const r = beadR(L.V) * TIP_GAIN, fill = clamp(L.V / L.vcrit);
        // a pendant drop: round below, drawn to a point at the tip, hanging
        // lower and longer as it swells, necking just before it goes
        const hang = r * (1.08 + 0.9 * fill * fill + 0.5 * L.neck);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        teardrop(tx, ty, tx, ty + hang, r);
    }

    // the drop as a lens: the painting behind it upside down and small, a dark
    // rim, light gathered low inside, and a bright catchlight
    function teardrop(tx, ty, cx, cy, r) {
        const dd = Math.max(r * 1.02, cy - ty), a = Math.asin(clamp(r / dd, 0, 0.999));
        const path = () => {
            ctx.beginPath(); ctx.moveTo(tx, ty);
            ctx.quadraticCurveTo(cx + r * Math.cos(a) * 0.55, (ty + cy - r * Math.sin(a)) / 2, cx + r * Math.cos(a), cy - r * Math.sin(a));
            ctx.arc(cx, cy, r, -a, Math.PI + a);
            ctx.quadraticCurveTo(cx - r * Math.cos(a) * 0.55, (ty + cy - r * Math.sin(a)) / 2, tx, ty);
            ctx.closePath();
        };
        ctx.save();
        path(); ctx.clip();
        const k = 5.5, sw = 2 * k * r * dpr, sx = Math.max(0, (cx - k * r) * dpr), sy = Math.max(0, (cy - k * r * 1.5) * dpr);
        ctx.translate(cx, cy); ctx.scale(-1, -1);
        if (sx + sw < bgComp.width && sy + sw < bgComp.height) ctx.drawImage(bgComp, sx, sy, sw, sw, -r, -r, 2 * r, 2 * r);
        else { ctx.fillStyle = 'rgba(200,210,204,0.6)'; ctx.fillRect(-r, -r, 2 * r, 2 * r); }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        // the neck above the bulb shows the leaf it hangs from, darkly
        ctx.fillStyle = 'rgba(18,30,20,0.35)'; ctx.fillRect(cx - r, ty, 2 * r, cy - ty - r * 0.6);
        const g = ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.25, r * 0.1, cx, cy, r * 1.04);
        g.addColorStop(0, 'rgba(240,246,240,0.18)'); g.addColorStop(0.58, 'rgba(20,30,22,0.04)'); g.addColorStop(0.86, 'rgba(10,18,12,0.42)'); g.addColorStop(1, 'rgba(8,14,10,0.78)');
        ctx.fillStyle = g; ctx.fillRect(cx - r - 2, ty - 2, 2 * r + 4, cy - ty + r + 4);
        const c = ctx.createRadialGradient(cx, cy + r * 0.55, 0, cx, cy + r * 0.55, r * 0.75);
        c.addColorStop(0, 'rgba(255,255,246,0.65)'); c.addColorStop(1, 'rgba(255,255,246,0)');
        ctx.fillStyle = c; ctx.fillRect(cx - r, cy, 2 * r, r + 1);
        ctx.restore();
        path(); ctx.strokeStyle = 'rgba(8,14,10,0.35)'; ctx.lineWidth = 0.6; ctx.stroke();
        // catchlight: the bright sky above, small and hard, and a softer second one
        ctx.fillStyle = 'rgba(255,255,255,0.97)';
        ctx.beginPath(); ctx.ellipse(cx - r * 0.36, cy - r * 0.38, Math.max(0.7, r * 0.26), Math.max(0.5, r * 0.18), -0.6, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath(); ctx.arc(cx + r * 0.3, cy + r * 0.45, Math.max(0.4, r * 0.1), 0, 7); ctx.fill();
    }

    function drawDrop(d) {
        if (d.age < 0) return;
        const v = Math.hypot(d.vx, d.vy), r = Math.max(d.sat ? 1 : 2.2, d.r);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        // a bright bead with a short tail you can just follow
        const tail = Math.min(v / 70, r * (d.canopy ? 10 : 7));
        if (tail > r * 0.6) {
            const ux = d.vx / v, uy = d.vy / v, x0 = d.x - ux * tail, y0 = d.y - uy * tail, nx = -uy, ny = ux;
            const taper = (hw, fill) => { ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(d.x + nx * hw, d.y + ny * hw); ctx.lineTo(d.x - nx * hw, d.y - ny * hw); ctx.closePath(); ctx.fill(); };
            const sh = ctx.createLinearGradient(x0, y0, d.x, d.y);
            sh.addColorStop(0, 'rgba(12,20,14,0)'); sh.addColorStop(1, 'rgba(12,20,14,0.25)');
            taper(r * 1.05, sh);
            const h = ctx.createLinearGradient(x0, y0, d.x, d.y);
            h.addColorStop(0, 'rgba(246,250,246,0)'); h.addColorStop(1, 'rgba(252,253,250,0.85)');
            taper(r * 0.6, h);
        }
        lens(d.x, d.y, r * 0.9, r * (0.9 + Math.min(0.4, v / (20000 * F.pxmm))));
        // catching the light from above
        const c = ctx.createRadialGradient(d.x, d.y + r * 0.15, 0, d.x, d.y + r * 0.15, r * 0.8);
        c.addColorStop(0, 'rgba(255,255,250,0.75)'); c.addColorStop(1, 'rgba(255,255,250,0)');
        ctx.fillStyle = c; ctx.beginPath(); ctx.arc(d.x, d.y + r * 0.15, r * 0.8, 0, 7); ctx.fill();
    }

    function drawStreaks(near) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.lineCap = 'butt';
        ctx.beginPath();
        let any = false;
        for (const s of streaks) {
            if (s.near !== near) continue;
            ctx.moveTo(s.x, s.y - s.len); ctx.lineTo(s.x + s.len * 0.08, s.y); any = true;
        }
        if (!any) return;
        ctx.lineWidth = near ? 1.2 : 0.75;
        ctx.strokeStyle = near ? 'rgba(240,245,243,0.4)' : 'rgba(230,238,236,0.26)';
        ctx.stroke();
    }

    function render(wx) {
        composeBackground(wx);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(bgComp, 0, 0);
        ctx.globalCompositeOperation = 'source-atop';           // rain only over the painting
        drawStreaks(false);
        drawLeaves(wx.colour);
        if (wx.veil > 0.002) {                                   // the grey of falling water, over painting and leaves alike
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.fillStyle = `rgba(204,214,222,${0.15 * wx.veil})`;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        for (const L of leaves) drawWater(L);
        for (const L of leaves) drawBead(L);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        for (const b of bits) {
            ctx.fillStyle = 'rgba(14,22,16,0.28)'; ctx.beginPath(); ctx.arc(b.x, b.y + 0.4, b.r * 1.15, 0, 7); ctx.fill();
            ctx.fillStyle = 'rgba(246,250,246,0.85)'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.fill();
        }
        for (const fl of flashes) {
            const t = fl.age / 0.14;
            ctx.strokeStyle = `rgba(246,250,246,${0.6 * (1 - t)})`; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.ellipse(fl.x, fl.y, fl.r * (0.6 + t), fl.r * (0.25 + 0.3 * t), 0, Math.PI, 2 * Math.PI); ctx.stroke();
        }
        for (const d of drops) drawDrop(d);
        drawStreaks(true);
        ctx.globalCompositeOperation = 'source-over';
    }

    // ── loop ──────────────────────────────────────────────────────────
    function progress() {
        if (reduced) return 1;
        const r = el.getBoundingClientRect();
        const run = r.height - innerHeight;
        return run > 0 ? clamp(-r.top / run) : clamp(0.5 - r.top / innerHeight);
    }
    function tick(now) {
        raf = 0;
        if (dead || !visible || document.hidden || !bgColour) { last = 0; return; }
        const dt = last ? Math.min(0.033, (now - last) / 1000) : 1 / 60;
        last = now;
        const wx = weather(p);
        let moving = false;
        for (let k = 0; k < 2; k++) moving = step(dt / 2, wx) || moving;
        render(wx);
        if (moving) raf = requestAnimationFrame(tick);
        else last = 0;
    }
    function wake() { if (!raf && !dead && visible && !reduced) raf = requestAnimationFrame(tick); }
    function still() { if (bgColour) render(weather(p)); }
    function settleForStill() { for (const L of leaves) { L.wet = 0.75; L.flow = 0; L.W = 0; L.th = 0; } }

    // ── input ─────────────────────────────────────────────────────────
    function leafAt(x, y) {
        for (let k = leaves.length - 1; k >= 0; k--) if (inside(leaves[k], x, y, 80)) return leaves[k];
        return null;
    }
    on(canvas, 'click', (e) => {
        const r = canvas.getBoundingClientRect();
        const L = leafAt(e.clientX - r.left, e.clientY - r.top);
        if (!L) return;
        if (reduced) { L.V = 0; L.beads.forEach((b) => (b.gone = true)); still(); return; }   // sheds the water, no swing
        shake(L);
    });
    on(canvas, 'pointermove', (e) => {
        if (e.pointerType !== 'mouse') return;
        const r = canvas.getBoundingClientRect();
        canvas.style.cursor = leafAt(e.clientX - r.left, e.clientY - r.top) ? 'pointer' : '';
    });
    on(stage, 'keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        let best = null, bs = -1e9;
        for (const L of leaves) {
            if (L.bx < 0 || L.bx > W || L.by < F.top || L.by > F.bottom) continue;
            const sc = L.V + L.W - Math.abs(L.bx - W / 2) / W * 20; if (sc > bs) { bs = sc; best = L; }
        }
        if (best) { if (reduced) { best.V = 0; still(); } else shake(best); }
    });
    on(window, 'scroll', () => {
        const np = progress();
        if (np !== p) { p = np; lastScrollAt = performance.now(); if (visible && !reduced) wake(); }
    }, { passive: true });
    let rsT = 0;
    const ro = new ResizeObserver(() => {
        clearTimeout(rsT);
        rsT = setTimeout(() => { if (dead || !paint) return; if (resize()) { if (reduced) settleForStill(); p = progress(); still(); wake(); } }, 80);
    });
    on(document, 'visibilitychange', () => { if (!document.hidden) { last = 0; wake(); } });
    const io = new IntersectionObserver((en) => {
        visible = en[0].isIntersecting;
        if (visible) { p = progress(); lastScrollAt = performance.now(); wake(); }
    }, { rootMargin: '80px' });

    // ── start ─────────────────────────────────────────────────────────
    Promise.all([loadImage(o.src), loadImage(base(o.masks)), loadImage(base(o.under))]).then(([pi, mi, ui]) => {
        if (dead) return;
        paint = pi; maskImg = mi; underImg = ui;
        const c = document.createElement('canvas'); c.width = mi.naturalWidth; c.height = mi.naturalHeight;
        const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(mi, 0, 0);
        const id = g.getImageData(0, 0, c.width, c.height).data, a = new Uint8Array(c.width * c.height);
        // the mask atlas is greyscale: its brightness is the alpha (and its alpha, if it has one)
        for (let i = 0; i < a.length; i++) a[i] = Math.min(id[i * 4], id[i * 4 + 3]);
        maskData = { w: c.width, h: c.height, data: a };
        // make the sprite mask an alpha channel the canvas can composite with
        const m = g.getImageData(0, 0, c.width, c.height);
        for (let i = 0; i < a.length; i++) { m.data[i * 4] = m.data[i * 4 + 1] = m.data[i * 4 + 2] = 255; m.data[i * 4 + 3] = a[i]; }
        g.putImageData(m, 0, 0); maskImg = c;
        resize();
        if (reduced) settleForStill();
        el.classList.add('is-live');
        p = progress();
        still();
        io.observe(el); ro.observe(stage);
    }).catch(() => { /* the painting stays as a plain image */ });

    function destroy() {
        dead = true;
        cancelAnimationFrame(raf); clearTimeout(rsT);
        io.disconnect(); ro.disconnect();
        listeners.forEach((f) => f());
        canvas.remove();
        el.classList.remove('dt', 'dt-calm', 'is-live');
        const restore = (k, v) => (v == null ? stage.removeAttribute(k) : stage.setAttribute(k, v));
        restore('tabindex', prevTab); restore('role', prevRole); restore('aria-label', prevLabel);
    }
    // a read-out for tests and for anything wired to the piece
    destroy.state = () => ({
        progress: p, running: !!raf, weather: weather(p), drops: drops.length, dropsAt: drops.map((d) => [Math.round(d.x), Math.round(d.y)]), streaks: streaks.length, bits: bits.length,
        frame: F && { scale: F.sc, top: F.top, bottom: F.bottom },
        leaves: leaves.map((L) => { const [tx, ty] = tipOf(L), [mx, my] = toStage(L, (L.d.base[0] + L.d.tip[0]) / 2, (L.d.base[1] + L.d.tip[1]) / 2); return { id: L.id, drip: L.drip, tip: [tx, ty], middle: [mx, my], bead: L.V, film: L.W, angle: L.th, spin: L.w }; }),
    });
    destroy.shake = (i) => leaves[i] && shake(leaves[i]);
    return destroy;
}

// auto-start
const started = new WeakMap();
function boot() {
    document.querySelectorAll('[data-drip-tip]').forEach((el) => { if (!started.has(el)) { const d = dripTip(el); started.set(el, d); el.dripTip = d; } });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
