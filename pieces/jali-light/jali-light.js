/*
 *  JALI-LIGHT // a row of real stone windows, and the sun that crosses them.
 *
 *  Markup:  <figure data-jali-light data-wall="assets/wall.webp" data-floor="assets/floor.webp">
 *             <img src="assets/tree-of-life.webp" data-h="1.5" alt="">
 *             <img src="assets/geometric.webp" data-h="2.5" alt="">
 *           </figure>
 *  Each window is a photograph, and beside it (same name plus -mask) a greyscale
 *  photograph of the same lattice: white where the sun gets through, black on
 *  stone. Or call  jaliLight(figure, { screens, masks, heights, wall, floor,
 *  start, motes, intensity, dust, shafts, glimmer }). It returns destroy().
 *
 *  Everything you see is photographed: the windows (Wikimedia Commons), the
 *  wall and the floor (scanned stone, CC0). Nothing is painted in code except
 *  light. The room is a little geometry (wall z = 0, floor y = 0, a camera five
 *  units back) and the sun is behind the wall.
 *
 *  Light is computed. For every floor pixel we know where it is in the room;
 *  follow it along the ray to the sun until it crosses the wall and read the
 *  mask there: stone is shadow, an opening is sun. The same lookup runs for each
 *  mote of dust. All the masks share one atlas, pre-blurred at six widths; the
 *  lookup picks a width from the length of the ray, so the lace is crisp at the
 *  foot of the wall and melts to a glow far from it, as a sun of finite size does.
 *
 *  Travel: the page scroll is pinned and mapped to a sideways walk along the
 *  wall (a drag, a horizontal swipe or wheel and the arrow keys move the same
 *  scroll). The sun climbs as you walk: cold grey dawn at the first window,
 *  gold, white noon, amber evening at the last. Colour is earned along the way.
 *  Pointer x and phone tilt nudge the sun a little around its place.
 *
 *  Orbs: in front of each window hangs one glass orb (orbs.js), a button that
 *  opens a small app. Configure with data-orb / data-glyph / data-app on each
 *  <img>, data-orbs="off" on the figure, or the `orbs` and `apps` options.
 *
 *  Air (air.js): shafts of sun, dust that shows only in the beam, slow glints.
 *
 *  Reduced motion: no pinned scroll; a finished still at one window, with the
 *  shafts and a few frozen glints but no drifting dust.
 *  Drag, pointer and keys still walk it, directly.
 */

import { createOrbs } from './orbs.js';
import { createAir } from './air.js';

const calm = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const mix = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, k) => a.map((n, i) => mix(n, b[i], k));
const RAD = Math.PI / 180;

// the room, in metres-ish. Wall z = 0, floor y = 0, the camera looks down -z.
const GAP = 1.3, SILL = 0.5, MARGIN = 1.4;
const CAMY = 1.7, CAMZ = 5;
const PPU = 230;                          // mask pixels per unit on the wall
const RADII = [0, 1, 2, 4, 8, 16];        // blur radii of the mask pyramid, in mask px
const PENW = 0.0156;                      // penumbra growth per unit of ray length
const AZ = 38;                            // degrees of sun swing either side of south
const TW_WALL = 3.2, TW_FLOOR = 2.6;      // world size of one wall / floor texture tile
const FPPU = 220;                         // floor canvas pixels per unit

// sun colour, sky, ambient (floor in shade), gain and colour amount through the day
const STOPS = [
    { t: 0,   sun: [150, 170, 208], sky: [188, 199, 217], amb: [.40, .44, .54], gain: .55, sat: 0 },
    { t: .3,  sun: [255, 206, 132], sky: [255, 236, 194], amb: [.50, .40, .32], gain: 1.0, sat: 1 },
    { t: .6,  sun: [255, 226, 172], sky: [255, 244, 218], amb: [.52, .43, .35], gain: 1.1, sat: 1 },
    { t: 1,   sun: [255, 140, 88],  sky: [255, 186, 150], amb: [.46, .34, .30], gain: .78, sat: .9 },
];
function palette(t) {
    let i = 0;
    while (i < STOPS.length - 2 && t > STOPS[i + 1].t) i++;
    const a = STOPS[i], b = STOPS[i + 1];
    const k = clamp((t - a.t) / (b.t - a.t)), e = k * k * (3 - 2 * k);
    const v = (x, y) => x.map((n, j) => mix(n, y[j], e));
    return { sun: v(a.sun, b.sun), sky: v(a.sky, b.sky), amb: v(a.amb, b.amb), gain: mix(a.gain, b.gain, e), sat: mix(a.sat, b.sat, e) };
}
const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

// the sun at time t, as a vector toward it (it is behind the wall, so lz < 0)
function sunAt(t) {
    const az = (t - 0.5) * 2 * AZ * RAD;
    const el = (24 + 40 * Math.pow(Math.sin(Math.PI * clamp(t, 0.001, 0.999)), 0.75)) * RAD;
    return { lx: Math.cos(el) * Math.sin(az), ly: Math.sin(el), lz: -Math.cos(el) * Math.cos(az), el, az };
}

function mulberry(seed) {
    return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function boxBlur(src, w, h, r) {
    if (!r) return src;
    const tmp = new Float32Array(w * h), out = new Float32Array(w * h), n = 2 * r + 1;
    for (let y = 0; y < h; y++) {
        let acc = 0;
        for (let x = -r; x <= r; x++) acc += src[y * w + clamp(x, 0, w - 1)];
        for (let x = 0; x < w; x++) {
            tmp[y * w + x] = acc / n;
            acc += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)];
        }
    }
    for (let x = 0; x < w; x++) {
        let acc = 0;
        for (let y = -r; y <= r; y++) acc += tmp[clamp(y, 0, h - 1) * w + x];
        for (let y = 0; y < h; y++) {
            out[y * w + x] = acc / n;
            acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
        }
    }
    return out;
}

const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
function loadImg(src) {
    return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}
function greyTwin(img, tint = [0.98, 1, 1.04], mixc = 1) {
    const c = canvas(img.naturalWidth || img.width, img.naturalHeight || img.height), g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const id = g.getImageData(0, 0, c.width, c.height), d = id.data;
    for (let i = 0; i < d.length; i += 4) {
        const l = d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11;
        d[i] = mix(d[i], l * tint[0], mixc); d[i + 1] = mix(d[i + 1], l * tint[1], mixc); d[i + 2] = mix(d[i + 2], l * tint[2], mixc);
    }
    g.putImageData(id, 0, 0);
    return c;
}
export function jaliLight(root, opts = {}) {
    const imgs = [...root.querySelectorAll('img')];
    const srcs = opts.screens || (root.dataset.screens ? root.dataset.screens.split(',').map((s) => s.trim()) : imgs.map((i) => i.getAttribute('src')));
    if (!srcs.length) return () => {};
    const maskSrcs = opts.masks || srcs.map((u, k) => (imgs[k] && imgs[k].dataset.mask) || u.replace(/\.webp$/, '-mask.webp'));
    const heights = opts.heights || srcs.map((u, k) => +(imgs[k] && imgs[k].dataset.h) || 1.9);
    const dir = (srcs[0] || '').replace(/[^/]*$/, '');
    const wallSrc = opts.wall || root.dataset.wall || dir + 'wall.webp';
    const floorSrc = opts.floor || root.dataset.floor || dir + 'floor.webp';
    const N = srcs.length;
    const startAt = clamp(+(opts.start ?? root.dataset.start ?? 1), 0, N - 1);
    const moteN = +(opts.motes ?? root.dataset.motes ?? 700);
    const intensity = clamp(+(opts.intensity ?? root.dataset.intensity ?? .7));
    const off = (o, d) => (o === false || d === 'off');
    const airOpt = { intensity, motes: moteN, dust: moteN > 0 && !off(opts.dust, root.dataset.dust),
        shafts: !off(opts.shafts, root.dataset.shafts), glimmer: !off(opts.glimmer, root.dataset.glimmer) };
    const HMAX = Math.max(...heights);
    const orbCfg = opts.orbs === false || root.dataset.orbs === 'off' ? null
        : srcs.map((u, k) => ({ ...((opts.orbs && opts.orbs[k]) || {}), ...(imgs[k] ? { label: imgs[k].dataset.orb, glyph: imgs[k].dataset.glyph, app: imgs[k].dataset.app } : {}) }))
            .map((c) => Object.fromEntries(Object.entries(c).filter(([, v]) => v != null && v !== '')));
    let orbs = null, air = null;
    const V = {};                                    // what the air layer reads each frame


    let dead = false, ready = false;
    const room = document.createElement('canvas'); room.className = 'jl-room'; room.setAttribute('aria-hidden', 'true');
    const rc = room.getContext('2d');
    root.append(room);
    if (!root.hasAttribute('tabindex')) root.tabIndex = 0;
    root.setAttribute('role', 'group');
    root.setAttribute('aria-roledescription', 'room');
    root.setAttribute('aria-label', 'Windows along a wall, and the sun with them. Arrow keys walk along it.');
    const status = document.createElement('div'); status.className = 'jl-sr'; status.setAttribute('role', 'status'); root.append(status);
    let said = '';

    // the pinned track: the page's own scroll is the walk along the wall
    let track = root.parentElement, madeTrack = false;
    if (!track || !track.classList.contains('jl-track')) {
        track = document.createElement('div'); track.className = 'jl-track'; madeTrack = true;
        root.before(track); track.append(root);
    }
    let pinned = !calm.matches;
    const setPinned = () => { track.classList.toggle('jl-pinned', pinned); track.style.setProperty('--jl-n', String(N)); };
    setPinned();

    // world
    let shots = [];                            // per window: { img, grey, mask, w, h, x, glow }
    let levels = [], AW = 0, AH = 0, XA0 = 0, XW = 0, XEND = 0, FX0 = 0, FZ = 5;
    let wallC, wallG, floorC;
    let Wc = 0, Hc = 0, dpr = 1, s = 1, cy = 0, yb = 0, f = 1;
    let lm = null, lmc = null, lmW = 0, lmH = 0, lmScale = .5, flc = null, flg = null, litc = null, litg = null;
    let scr = null, scg = null, tintc = null, tintg = null;
    let wallPat = null, wallPatG = null;
    // where the camera stands for a window position (0..N-1), and how far apart windows are on average
    const camX = (p) => { const i = clamp(Math.floor(p), 0, N - 2), k = p - i; return N < 2 ? shots[0].x : mix(shots[i].x, shots[i + 1].x, clamp(k)); };
    const spAvg = () => (N < 2 ? 2 : (shots[N - 1].x - shots[0].x) / (N - 1));

    // state
    let pos = pinned ? 0 : startAt, posT = pos;       // eased and target window position, 0..N-1
    let nudge = 0, nudgeT = 0;                        // pointer / tilt shift of the sun
    let drawnPos = NaN, drawnNud = NaN, visible = false, raf = 0, last = 0, drag = null;
    let tilt = { x: 0, y: 0, active: false };
    let lmD = null;

    const sunT = () => clamp(0.02 + 0.96 * (N > 1 ? pos / (N - 1) : .3) + nudge);

    function build(loaded, maskImgs, wallImg, floorImg) {
        let cx = 0, pw = 0;
        shots = loaded.map((img, k) => {
            const h = heights[k], w = h * img.naturalWidth / img.naturalHeight;
            cx = k ? cx + (pw + w) / 2 + GAP : 0; pw = w;
            return { img, mask: maskImgs[k], w, h, x: cx, grey: greyTwin(img) };
        });
        XA0 = shots[0].x - shots[0].w / 2 - MARGIN;
        XEND = shots[N - 1].x + shots[N - 1].w / 2 + MARGIN;
        XW = XEND - XA0;
        AW = Math.round(XW * PPU); AH = Math.round(HMAX * PPU);
        // the mask atlas: 1 where the sun gets through (an opening), 0 on stone and on bare wall
        const ac = canvas(AW, AH), ag = ac.getContext('2d', { willReadFrequently: true });
        const base = new Float32Array(AW * AH);
        for (const sh of shots) {
            const x0 = Math.round((sh.x - sh.w / 2 - XA0) * PPU), y0 = Math.round((HMAX - sh.h) * PPU);
            const sw = Math.round(sh.w * PPU), shh = Math.round(sh.h * PPU);
            sh.x0 = x0; sh.sw = sw;
            ag.clearRect(0, 0, AW, AH); ag.imageSmoothingQuality = 'high'; ag.drawImage(sh.mask, x0, y0, sw, shh);
            const d = ag.getImageData(x0, y0, sw, shh).data;
            for (let y = 3; y < shh - 3; y++) for (let x = 3; x < sw - 3; x++) base[(y0 + y) * AW + x0 + x] = d[(y * sw + x) * 4] / 255;
        }
        levels = RADII.map((r) => { const b = boxBlur(base, AW, AH, r), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b[i] * 255 + .5; return u; });
        // a slim glow for the bloom round the lace, one per window
        for (const sh of shots) {
            const y0 = Math.round((HMAX - sh.h) * PPU), shh = Math.round(sh.h * PPU), gl = levels[4];
            const g = canvas(sh.sw, shh), gg = g.getContext('2d'), id = gg.createImageData(sh.sw, shh);
            for (let y = 0; y < shh; y++) for (let x = 0; x < sh.sw; x++) {
                const o = (y * sh.sw + x) * 4; id.data[o] = id.data[o + 1] = id.data[o + 2] = 255; id.data[o + 3] = gl[(y0 + y) * AW + sh.x0 + x];
            }
            gg.putImageData(id, 0, 0); sh.glow = g;
        }
        // and a wide haze of each lace, for the far end of its shaft
        const wide = boxBlur(levels[3] ? Float32Array.from(levels[3], (n) => n / 255) : base, AW, AH, 30);
        for (const sh of shots) {
            const y0 = Math.round((HMAX - sh.h) * PPU), shh = Math.round(sh.h * PPU);
            const g = canvas(sh.sw, shh), gg = g.getContext('2d'), id = gg.createImageData(sh.sw, shh);
            for (let y = 0; y < shh; y++) for (let x = 0; x < sh.sw; x++) {
                const o = (y * sh.sw + x) * 4; id.data[o] = id.data[o + 1] = id.data[o + 2] = 255; id.data[o + 3] = wide[(y0 + y) * AW + sh.x0 + x] * 255;
            }
            gg.putImageData(id, 0, 0); sh.haze = g;
        }
        // wall: the photograph and its grey twin (colour is earned)
        wallC = canvas(wallImg.naturalWidth, wallImg.naturalHeight); wallC.getContext('2d').drawImage(wallImg, 0, 0);
        wallG = greyTwin(wallImg);
        // floor: the photographed tile laid across the whole room, in part-desaturated stone so the light supplies the colour
        const ft = greyTwin(floorImg, [1, 1, 1], .4);
        FX0 = shots[0].x - 8; FZ = 5;
        const FW = Math.round((shots[N - 1].x + 8 - FX0) * FPPU), FH = Math.round(FZ * FPPU), tp = Math.round(TW_FLOOR * FPPU);
        floorC = canvas(FW, FH); const fg = floorC.getContext('2d'); fg.imageSmoothingQuality = 'high';
        for (let y = 0; y < FH; y += tp) for (let x = 0; x < FW; x += tp) fg.drawImage(ft, x, y, tp, tp);
        scr = canvas(8, 8); scg = scr.getContext('2d');
        tintc = canvas(8, 8); tintg = tintc.getContext('2d');
    }

    function layout() {
        Wc = root.clientWidth; Hc = root.clientHeight;
        if (!Wc || !Hc) return false;
        dpr = Math.min(2, window.devicePixelRatio || 1);
        room.width = Math.round(Wc * dpr); room.height = Math.round(Hc * dpr);
        const phone = Wc < 640, top = phone ? 0.035 : 0.03, baseFrac = phone ? 0.70 : 0.68;
        const wmax = Math.max(...shots.map((q) => q.w));
        s = Math.min((baseFrac - top) * Hc / (SILL + HMAX), (phone ? 1.12 : 0.94) * Wc / wmax);
        f = s * CAMZ;
        yb = Math.round(baseFrac * Hc);          // where wall meets floor
        cy = yb - CAMY * s;                      // horizon row
        const fh = Math.max(1, Math.ceil((Hc - yb) * dpr));
        flc = canvas(room.width, fh); flg = flc.getContext('2d');
        litc = canvas(room.width, fh); litg = litc.getContext('2d');
        lmScale = Math.min(1, 760 / Wc);
        lmW = Math.max(8, Math.round(Wc * lmScale)); lmH = Math.max(8, Math.round((Hc - yb) * lmScale));
        lm = canvas(lmW, lmH); lmc = lm.getContext('2d');
        wallPat = rc.createPattern(wallC, 'repeat'); wallPatG = rc.createPattern(wallG, 'repeat');
        if (air) air.resize(Wc, Hc, dpr);
        drawnPos = NaN;
        return true;
    }

    // bilinear read of one mask level at mask-pixel coords (0..1); off the atlas is wall
    function bil(a, x, y) {
        if (x < 0 || y < 0 || x > AW - 1 || y > AH - 1) return 0;
        const x0 = x | 0, y0 = y | 0, x1 = Math.min(AW - 1, x0 + 1), y1 = Math.min(AH - 1, y0 + 1), fx = x - x0, fy = y - y0;
        return mix(mix(a[y0 * AW + x0], a[y0 * AW + x1], fx), mix(a[y1 * AW + x0], a[y1 * AW + x1], fx), fy) / 255;
    }
    // the sun reaching the point (x, y, z): follow the ray to the wall and read the masks there
    function beam(x, y, z, S, soft = 1) {
        const tt = z / -S.lz;
        const hx = x + tt * S.lx, hy = y + tt * S.ly;
        const u = (hx - XA0) / XW, v = (SILL + HMAX - hy) / HMAX;
        if (u < 0 || u > 1 || v < 0 || v > 1) return 0;
        const r = tt * PENW * soft * PPU;
        let k = 0;
        while (k < RADII.length - 2 && r > RADII[k + 1]) k++;
        const w = clamp((r - RADII[k]) / (RADII[k + 1] - RADII[k]));
        const px = u * (AW - 1), py = v * (AH - 1);
        return mix(bil(levels[k], px, py), bil(levels[k + 1], px, py), w);
    }

    function lightmap(S, cam) {
        const id = lmc.createImageData(lmW, lmH), d = id.data, P = palette(sunT());
        const kEl = .55 + .6 * Math.sin(S.el);
        for (let j = 0; j < lmH; j++) {
            const sy = yb + (j + .5) / lmScale;
            const dd = f * CAMY / Math.max(1, sy - cy), z = CAMZ - dd;
            for (let i = 0; i < lmW; i++) {
                const x = cam + ((i + .5) / lmScale - Wc / 2) * dd / f;
                let m = 0;
                if (z > 0.001) { m = beam(x, 0, z, S); const tt = z / -S.lz; m *= kEl / (1 + 0.035 * tt * tt); }
                const o = (j * lmW + i) * 4;
                d[o] = P.sun[0]; d[o + 1] = P.sun[1]; d[o + 2] = P.sun[2]; d[o + 3] = clamp(m) * 255;
            }
        }
        lmc.putImageData(id, 0, 0); lmD = d;
    }

    function draw() {
        const t = sunT(), P = palette(t), S = sunAt(t), cam = camX(pos);
        const ex = Wc / 2 - cam * s;                           // wall x (world 0) on screen
        rc.setTransform(dpr, 0, 0, dpr, 0, 0);
        rc.globalCompositeOperation = 'source-over'; rc.globalAlpha = 1;
        // ---- the wall: a photograph of stone, grey until the sun warms it, lit only by what bounces
        const pm = (pat) => { const sc = TW_WALL * s / wallC.width; pat.setTransform(new DOMMatrix().translate(ex, yb - TW_WALL * s).scale(sc)); return pat; };
        rc.fillStyle = pm(wallPatG); rc.fillRect(0, 0, Wc, yb);
        rc.globalAlpha = clamp(P.sat); rc.fillStyle = pm(wallPat); rc.fillRect(0, 0, Wc, yb); rc.globalAlpha = 1;
        rc.globalCompositeOperation = 'multiply';
        const tone = P.amb.map((c) => Math.min(255, c * 255 * 1.2));
        rc.fillStyle = rgb(tone); rc.fillRect(0, 0, Wc, yb);
        const wl = rc.createLinearGradient(0, 0, 0, yb);
        wl.addColorStop(0, 'rgba(0,0,0,.5)'); wl.addColorStop(.6, 'rgba(0,0,0,0)'); wl.addColorStop(1, 'rgba(0,0,0,.3)');
        rc.globalCompositeOperation = 'source-over'; rc.fillStyle = wl; rc.fillRect(0, 0, Wc, yb);
        // ---- the windows: the photographs themselves, graded to the hour
        const bright = clamp(P.gain / 1.05, .45, 1);
        for (let k = 0; k < N; k++) {
            const sh = shots[k], ww = sh.w * s, wh = sh.h * s;
            const xl = ex + (sh.x - sh.w / 2) * s;
            if (xl > Wc + 40 || xl + ww < -40) continue;
            const yt = yb - (SILL + sh.h) * s;
            const pw = Math.max(2, Math.round(ww * dpr)), ph = Math.max(2, Math.round(wh * dpr));
            if (scr.width < pw || scr.height < ph) { scr.width = Math.max(scr.width, pw); scr.height = Math.max(scr.height, ph); }
            scg.setTransform(1, 0, 0, 1, 0, 0); scg.globalCompositeOperation = 'source-over'; scg.clearRect(0, 0, scr.width, scr.height);
            scg.imageSmoothingQuality = 'high';
            scg.globalAlpha = 1; scg.drawImage(sh.grey, 0, 0, pw, ph);
            scg.globalAlpha = P.sat; scg.drawImage(sh.img, 0, 0, pw, ph); scg.globalAlpha = 1;
            scg.globalCompositeOperation = 'source-atop';
            scg.fillStyle = `rgba(0,0,0,${1 - bright})`; scg.fillRect(0, 0, pw, ph);
            rc.globalCompositeOperation = 'lighten';
            rc.drawImage(scr, 0, 0, pw, ph, xl, yt, ww, wh);
            rc.globalCompositeOperation = 'source-over';
            // bloom: light spilling round the lace onto the stone
            const gw = sh.glow.width, gh = sh.glow.height;
            if (tintc.width !== gw || tintc.height !== gh) { tintc.width = gw; tintc.height = gh; }
            tintg.globalCompositeOperation = 'source-over'; tintg.clearRect(0, 0, gw, gh);
            tintg.fillStyle = rgb(P.sun); tintg.fillRect(0, 0, gw, gh);
            tintg.globalCompositeOperation = 'destination-in'; tintg.drawImage(sh.glow, 0, 0);
            rc.globalCompositeOperation = 'lighter'; rc.globalAlpha = .22 * P.gain;
            rc.drawImage(tintc, xl - ww * .015, yt - wh * .015, ww * 1.03, wh * 1.03);
            rc.globalAlpha = 1; rc.globalCompositeOperation = 'source-over';
        }
        // ---- the floor: the photographed stone drawn in perspective a row at a time
        const fh = flc.height, FWc = floorC.width;
        flg.setTransform(1, 0, 0, 1, 0, 0); flg.clearRect(0, 0, flc.width, fh);
        for (let y = 0; y < fh; y++) {
            const sy = yb + y / dpr;
            const dd = f * CAMY / Math.max(1, sy - cy), z = CAMZ - dd;
            const xl = cam + (0 - Wc / 2) * dd / f, xr = cam + (Wc - Wc / 2) * dd / f;
            const sx0 = (xl - FX0) * FPPU, sw = (xr - xl) * FPPU;
            const sz = clamp(z * FPPU, 0, floorC.height - 1);
            if (sx0 < 0 || sx0 + sw > FWc) continue;
            flg.drawImage(floorC, sx0, sz, sw, 1, 0, y, flc.width, 1);
        }
        rc.setTransform(1, 0, 0, 1, 0, 0);
        const fy = Math.round(yb * dpr);
        rc.drawImage(flc, 0, fy);
        rc.globalCompositeOperation = 'multiply'; rc.fillStyle = rgb(P.amb.map((c) => c * 255 * 1.1)); rc.fillRect(0, fy, room.width, fh);
        lightmap(S, cam);
        litg.globalCompositeOperation = 'source-over'; litg.clearRect(0, 0, litc.width, litc.height);
        litg.drawImage(flc, 0, 0);
        litg.globalCompositeOperation = 'multiply'; litg.fillStyle = rgb(P.sun); litg.fillRect(0, 0, litc.width, litc.height);
        litg.globalCompositeOperation = 'destination-in'; litg.imageSmoothingQuality = 'high'; litg.drawImage(lm, 0, 0, litc.width, litc.height);
        rc.globalCompositeOperation = 'lighter';
        rc.globalAlpha = Math.min(1, 1.2 * P.gain); rc.drawImage(litc, 0, fy);
        rc.globalAlpha = Math.min(1, .8 * P.gain); rc.drawImage(litc, 0, fy);
        rc.globalAlpha = 1; rc.globalCompositeOperation = 'source-over';
        // ---- where wall meets floor, and a vignette
        rc.setTransform(dpr, 0, 0, dpr, 0, 0);
        const bs = rc.createLinearGradient(0, yb - 6, 0, yb + 22);
        bs.addColorStop(0, 'rgba(0,0,0,.0)'); bs.addColorStop(.3, 'rgba(0,0,0,.45)'); bs.addColorStop(1, 'rgba(0,0,0,0)');
        rc.fillStyle = bs; rc.fillRect(0, yb - 6, Wc, 28);
        const vg = rc.createLinearGradient(0, yb, 0, Hc);
        vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.34)');
        rc.fillStyle = vg; rc.fillRect(0, yb, Wc, Hc - yb);
        const vx = rc.createRadialGradient(Wc / 2, Hc * .45, Hc * .4, Wc / 2, Hc * .45, Math.max(Wc, Hc) * .85);
        vx.addColorStop(0, 'rgba(0,0,0,0)'); vx.addColorStop(1, 'rgba(0,0,0,.42)');
        rc.fillStyle = vx; rc.fillRect(0, 0, Wc, Hc);
        drawnPos = pos; drawnNud = nudge;
        const near = Math.round(pos) + 1, say = `window ${near} of ${N}, ${t < .15 ? 'dawn' : t < .45 ? 'morning' : t < .7 ? 'midday' : t < .88 ? 'afternoon' : 'evening'}`;
        if (say !== said) { said = say; status.textContent = say; }
        if (orbs) orbs.place({ P, S, cam, Wc, Hc, f, s, cy, yb });
        Object.assign(V, { P, S, cam, Wc, Hc, f, s, cy, yb, shots, lmD, lmW, lmH, lmScale });
        if (air && calm.matches) air.frame(0, 0);
    }

    // the scroll of the track is the walk
    function trackRange() { const r = track.getBoundingClientRect(); return { top: r.top, range: Math.max(1, r.height - innerHeight), y0: window.scrollY + r.top }; }
    function scrollP() { const { top, range } = trackRange(); return clamp(-top / range); }
    function walkTo(p) {                                    // p in window units, 0..N-1
        p = clamp(p, 0, N - 1);
        if (pinned) { const { range, y0 } = trackRange(); window.scrollTo({ top: y0 + (p / Math.max(1, N - 1)) * range, behavior: 'instant' }); }
        else { posT = p; kick(); }
    }
    const pxPerWindow = () => (trackRange().range / Math.max(1, N - 1));

    function frame(now) {
        raf = 0;
        if (dead || !visible || !ready) return;
        const dt = Math.min(.05, last ? (now - last) / 1000 : .016); last = now;
        if (pinned) posT = scrollP() * (N - 1);
        let nt = 0;
        if (!calm.matches) nt = (tilt.active ? tilt.x * .12 : 0) + nudgeT;
        const k = 1 - Math.exp(-dt * 7), kn = 1 - Math.exp(-dt * 3);
        pos += (posT - pos) * k; if (Math.abs(posT - pos) < 0.0005) pos = posT;
        nudge += (nt - nudge) * kn; if (Math.abs(nt - nudge) < 0.0005) nudge = nt;
        if (pos !== drawnPos || nudge !== drawnNud) draw();
        if (orbs) orbs.tick(dt);
        if (air) air.frame(dt, now / 1000);
        raf = requestAnimationFrame(frame);
    }
    function kick() {
        if (calm.matches && ready) { pos = posT; draw(); return; }
        if (!raf && visible && ready) { last = 0; raf = requestAnimationFrame(frame); }
    }

    const io = new IntersectionObserver((es) => {
        visible = es[0].isIntersecting;
        if (visible) { if (calm.matches && ready && pos !== drawnPos) draw(); kick(); } else if (raf) { cancelAnimationFrame(raf); raf = 0; }
    }, { threshold: 0 });
    const ro = new ResizeObserver(() => { if (ready && layout()) { draw(); if (air && !calm.matches) air.frame(0, 0); } });

    // input
    const onScroll = () => { if (pinned) kick(); };
    const onMove = (e) => {
        if (drag) {
            const dx = e.clientX - drag.x;
            if (e.pointerType === 'touch' && Math.abs(e.clientX - drag.x0) < 4) return;
            drag.x = e.clientX;
            if (pinned) window.scrollBy({ top: -dx * pxPerWindow() / (spAvg() * s), behavior: 'instant' });
            else { posT = clamp(posT - dx / (spAvg() * s), 0, N - 1); kick(); }
        } else if (e.pointerType === 'mouse' && !calm.matches) {
            const r = root.getBoundingClientRect(); nudgeT = ((e.clientX - r.left) / r.width - .5) * .16; kick();
        }
    };
    const onDown = (e) => {
        if (e.target.closest && e.target.closest('.jl-vr, .jl-scrim')) return;     // an orb or an open app is not the wall
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        drag = { x: e.clientX, x0: e.clientX };
        try { root.setPointerCapture(e.pointerId); } catch {}
        root.focus({ preventScroll: true });
    };
    const onUp = () => { drag = null; };
    const onWheel = (e) => {
        if (!pinned || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
        e.preventDefault(); window.scrollBy({ top: e.deltaX, behavior: 'instant' });
    };
    const onKey = (e) => {
        const cur = Math.round(posT);
        const to = e.key === 'ArrowLeft' ? cur - 1 : e.key === 'ArrowRight' ? cur + 1 : e.key === 'Home' ? 0 : e.key === 'End' ? N - 1 : null;
        if (to === null) return;
        e.preventDefault(); walkTo(to);
    };
    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerdown', onDown);
    root.addEventListener('pointerup', onUp);
    root.addEventListener('pointercancel', onUp);
    root.addEventListener('keydown', onKey);
    root.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('scroll', onScroll, { passive: true });
    const onCalm = () => {
        pinned = !calm.matches; setPinned();
        if (calm.matches) { cancelAnimationFrame(raf); raf = 0; posT = pos = startAt; nudge = nudgeT = 0; if (ready) { draw(); if (air) air.frame(0, 0); } }
        else kick();
    };
    calm.addEventListener('change', onCalm);

    (async () => {
        try {
            const [loaded, maskImgs, wallImg, floorImg] = await Promise.all([Promise.all(srcs.map(loadImg)), Promise.all(maskSrcs.map(loadImg)), loadImg(wallSrc), loadImg(floorSrc)]);
            if (dead) return;
            if (document.fonts && document.fonts.ready) await document.fonts.ready;
            build(loaded, maskImgs, wallImg, floorImg);
            if (!layout()) { await new Promise((r) => requestAnimationFrame(r)); layout(); }
            if (orbCfg) orbs = createOrbs(root, {
                config: orbCfg, apps: opts.apps, glyphs: opts.glyphs, camy: CAMY, camz: CAMZ,
                shotX: (i) => shots[i].x, beam, walkTo, tilt: () => tilt, images: () => srcs,
            });
            if (airOpt.dust || airOpt.shafts || airOpt.glimmer) air = createAir(root, {
                opts: airOpt, consts: { CAMY, CAMZ, SILL }, beam, view: () => V, calm: () => calm.matches,
                orbs: () => (orbs ? orbs.points() : []), look: () => (orbs ? orbs.look() : { x: 0, y: 0 }), tilt: () => tilt,
            });
            ready = true; root.classList.add('jl-on');
            if (air) air.resize(Wc, Hc, dpr);
            if (pinned) { posT = scrollP() * (N - 1); pos = posT; }
            draw(); if (air) air.frame(0, 0);
            ro.observe(root); io.observe(root);
            import('./tilt.js').then((m) => { tilt = m.default; }).catch(() => {});
        } catch (err) { console.warn('jali-light:', err); /* the plain photographs stay */ }
    })();

    return function destroy() {
        dead = true; cancelAnimationFrame(raf); io.disconnect(); ro.disconnect();
        if (air) air.destroy();
        if (orbs) orbs.destroy(); status.remove();
        root.removeEventListener('pointermove', onMove); root.removeEventListener('pointerdown', onDown);
        root.removeEventListener('pointerup', onUp); root.removeEventListener('pointercancel', onUp);
        root.removeEventListener('keydown', onKey); root.removeEventListener('wheel', onWheel);
        window.removeEventListener('scroll', onScroll); calm.removeEventListener('change', onCalm);
        room.remove(); root.classList.remove('jl-on');
        for (const a of ['role', 'aria-label', 'aria-roledescription']) root.removeAttribute(a);
        track.classList.remove('jl-pinned'); track.style.removeProperty('--jl-n');
        if (madeTrack) { track.before(root); track.remove(); }
    };
}

if (typeof document !== 'undefined') {
    const start = () => document.querySelectorAll('[data-jali-light]').forEach((el) => { if (!el.__jl) el.__jl = jaliLight(el); });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
}
export default jaliLight;
