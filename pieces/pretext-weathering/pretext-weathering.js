/*
 *  PRETEXT-WEATHERING // a paragraph cut into sandstone, and three hundred
 *  years of weather, scrubbed by the scroll.
 *
 *  Markup:  <section data-pretext-weathering data-years="1726 2026">
 *             <div class="pw-stage"><p class="pw-text">Traveller, this is the ford …</p></div>
 *           </section>
 *  Or call  pretextWeathering(section, options)  yourself; it returns destroy().
 *
 *  pretext (Cheng Lou, vendor/pretext) sets the paragraph once at 100px; its
 *  widths are linear in size, so a binary search finds the largest type that
 *  fills the stone, and every line is justified word by word. The letters are
 *  drawn into a mask and an exact Euclidean distance transform makes each
 *  stroke a V-groove: deepest down the middle, two flat walls, one lit from
 *  the upper left and one in shadow.
 *
 *  Time is one number, t, from 0 (the mason has just swept the dust away) to
 *  1 (three centuries later), and the scroll drives it through a pinned stage.
 *  Nothing is simulated per frame. When the stone is laid out a worker
 *  precomputes, once:
 *    - the groove at four stages of wear (the depth field blurred wider each
 *      time: arrises round off, serifs and hairlines go first);
 *    - rain: where water leaves the foot of each stroke and runs down the
 *      face, and where it drips from the top, with the moment each pixel is
 *      first stained;
 *    - lichen: colonies seeded where they grow (orange Xanthoria along the
 *      top where birds sit, grey-green and grey crusts on the face, black
 *      dots in the damp), grown outward by a multi-source Dijkstra over a
 *      noisy substrate that is slow in the deep of the grooves, so each pixel
 *      holds the moment its colony reaches it; colonies meet and stop, as
 *      real ones do;
 *    - a crack that runs in from the top edge, and two spalls where the face
 *      scales off.
 *  One WebGL2 shader then thresholds all of it by t and lights the result:
 *  scrolling back runs exactly the same frames in reverse.
 *
 *  The real <p> stays in the DOM (screen readers, ctrl+F, print). Without JS
 *  or WebGL it is set in a serif on a stone-coloured block. Reduced motion:
 *  no runway, the stone shown weathered but legible.
 */

const LIB = './vendor/pretext/layout.js';
const REF = 100;

const calm = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const mix = (a, b, t) => a + (b - a) * t;
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

function colour(css, fallback) {
    const c = document.createElement('canvas').getContext('2d');
    c.fillStyle = fallback;
    c.fillStyle = css || fallback;
    const s = c.fillStyle;
    if (s[0] === '#') return [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16) / 255);
    const m = s.match(/[\d.]+/g) || [0, 0, 0];
    return [0, 1, 2].map((i) => Number(m[i]) / 255);
}

function loadImage(src) {
    return new Promise((ok, no) => {
        const im = new Image();
        im.decoding = 'async';
        im.onload = () => ok(im);
        im.onerror = no;
        im.src = src;
    });
}

// ---- the precompute ------------------------------------------------------------
// Self-contained: its source is handed to a Worker as a string (and, if a
// worker cannot be made, it runs here on the main thread instead).
function weatherKernel() {
    const BIG = 1e20;
    const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
    const ss = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

    function rng(seed) {
        let a = seed >>> 0;
        return () => {
            a = (a + 0x6d2b79f5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    function hash(ix, iy, s) {
        let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(s, 1274126177)) | 0;
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        h ^= h >>> 16;
        return (h >>> 0) / 4294967296;
    }
    function vn(x, y, s) {
        const ix = Math.floor(x), iy = Math.floor(y);
        let fx = x - ix, fy = y - iy;
        fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
        const a = hash(ix, iy, s), b = hash(ix + 1, iy, s), c = hash(ix, iy + 1, s), d = hash(ix + 1, iy + 1, s);
        return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
    }
    const fbm = (x, y, s) => 0.5 * vn(x, y, s) + 0.3 * vn(x * 2.03 + 17.1, y * 2.03 + 3.7, s + 1) + 0.2 * vn(x * 4.1 + 5.3, y * 4.1 + 11.9, s + 2);

    // Exact squared Euclidean distance transform (Felzenszwalb & Huttenlocher).
    function edt(g, w, h) {
        const n = Math.max(w, h);
        const f = new Float64Array(n), d = new Float64Array(n), z = new Float64Array(n + 1);
        const v = new Int32Array(n);
        const line = (len) => {
            let k = 0;
            v[0] = 0; z[0] = -BIG; z[1] = BIG;
            for (let q = 1; q < len; q++) {
                let r = v[k];
                let s = ((f[q] + q * q) - (f[r] + r * r)) / (2 * q - 2 * r);
                while (s <= z[k]) { k--; r = v[k]; s = ((f[q] + q * q) - (f[r] + r * r)) / (2 * q - 2 * r); }
                k++; v[k] = q; z[k] = s; z[k + 1] = BIG;
            }
            k = 0;
            for (let q = 0; q < len; q++) {
                while (z[k + 1] < q) k++;
                const r = v[k];
                d[q] = (q - r) * (q - r) + f[r];
            }
        };
        for (let x = 0; x < w; x++) {
            for (let y = 0; y < h; y++) f[y] = g[y * w + x];
            line(h);
            for (let y = 0; y < h; y++) g[y * w + x] = d[y];
        }
        for (let y = 0; y < h; y++) {
            const o = y * w;
            for (let x = 0; x < w; x++) f[x] = g[o + x];
            line(w);
            for (let x = 0; x < w; x++) g[o + x] = d[x];
        }
        return g;
    }

    // Three box passes (close to a gaussian of sigma ~ r), in place.
    function blur(a, w, h, r) {
        if (r < 1) return a;
        const t = new Float32Array(Math.max(w, h));
        const k = 1 / (2 * r + 1);
        for (let it = 0; it < 3; it++) {
            for (let y = 0; y < h; y++) {
                const o = y * w;
                let acc = 0;
                for (let i = -r; i <= r; i++) acc += a[o + clamp(i, 0, w - 1)];
                for (let x = 0; x < w; x++) {
                    t[x] = acc * k;
                    acc += a[o + Math.min(w - 1, x + r + 1)] - a[o + Math.max(0, x - r)];
                }
                for (let x = 0; x < w; x++) a[o + x] = t[x];
            }
            for (let x = 0; x < w; x++) {
                let acc = 0;
                for (let i = -r; i <= r; i++) acc += a[clamp(i, 0, h - 1) * w + x];
                for (let y = 0; y < h; y++) {
                    t[y] = acc * k;
                    acc += a[Math.min(h - 1, y + r + 1) * w + x] - a[Math.max(0, y - r) * w + x];
                }
                for (let y = 0; y < h; y++) a[y * w + x] = t[y];
            }
        }
        return a;
    }

    // float -> IEEE half (small values flush to zero; fine for these fields)
    const fb = new Float32Array(1), ub = new Uint32Array(fb.buffer);
    function half(v) {
        fb[0] = v;
        const x = ub[0];
        const s = (x >>> 16) & 0x8000;
        const e = ((x >>> 23) & 0xff) - 112;
        if (e <= 0) return s;
        if (e > 30) return s | 0x7bff;
        return s | ((e << 10) + (((x & 0x7fffff) + 0x1000) >>> 13));
    }

    // a binary min-heap of (time, cell)
    function heap() {
        let k = new Float32Array(1 << 16), v = new Int32Array(1 << 16), n = 0;
        return {
            get size() { return n; },
            push(key, val) {
                if (n === k.length) {
                    const k2 = new Float32Array(n * 2); k2.set(k); k = k2;
                    const v2 = new Int32Array(n * 2); v2.set(v); v = v2;
                }
                let i = n++;
                while (i > 0) {
                    const p = (i - 1) >> 1;
                    if (k[p] <= key) break;
                    k[i] = k[p]; v[i] = v[p]; i = p;
                }
                k[i] = key; v[i] = val;
            },
            pop(out) {
                out[0] = k[0]; out[1] = v[0];
                const lk = k[--n], lv = v[n];
                let i = 0;
                while (true) {
                    let c = 2 * i + 1;
                    if (c >= n) break;
                    if (c + 1 < n && k[c + 1] < k[c]) c++;
                    if (k[c] >= lk) break;
                    k[i] = k[c]; v[i] = v[c]; i = c;
                }
                k[i] = lk; v[i] = lv;
            },
        };
    }

    // midpoint displacement between two points, down to steps of `fine` px
    function fractal(a, b, amp, fine, R) {
        let seg = [a, b];
        while (true) {
            const L = Math.hypot(seg[1][0] - seg[0][0], seg[1][1] - seg[0][1]);
            if (L < fine) break;
            const out = [seg[0]];
            for (let i = 0; i < seg.length - 1; i++) {
                const p = seg[i], q = seg[i + 1];
                const dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy) || 1;
                const off = (R() * 2 - 1) * amp;
                out.push([p[0] + dx * 0.5 - (dy / len) * off, p[1] + dy * 0.5 + (dx / len) * off], q);
            }
            seg = out;
            amp *= 0.55;
        }
        return seg;
    }

    const CRACK = [0.68, 0.9], SPALL = [0.83, 0.93];

    function compute(job) {
        const { W, H, dpr, alpha, cw, ch, block, font, seed } = job;
        const R = rng(seed);
        const N = W * H;
        const [bx0, by0, bx1, by1] = block;
        const S = bx1 - bx0, SH = by1 - by0;

        // ---- 1. the groove: depth from the edge of each stroke, at four stages of wear
        const g = new Float32Array(N);
        for (let i = 0; i < N; i++) g[i] = alpha[i] >= 128 ? BIG : 0;
        edt(g, W, H);
        let dmax = 1;
        for (let i = 0; i < N; i++) {
            const v = alpha[i] >= 128 ? Math.sqrt(g[i]) - 0.5 : (alpha[i] / 255) * 0.5;
            g[i] = v;
            if (v > dmax) dmax = v;
        }
        const glyph = new Uint16Array(N * 4);
        for (let i = 0; i < N; i++) glyph[i * 4] = half(g[i] / dmax);
        // the field-resolution copy of the sharp groove (for rain and lichen)
        const Wf = Math.ceil(cw), Hf = Math.ceil(ch), NF = Wf * Hf;
        const depF = new Float32Array(NF), covF = new Float32Array(NF);
        for (let y = 0; y < Hf; y++) {
            for (let x = 0; x < Wf; x++) {
                let dsum = 0, csum = 0;
                for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
                    const px = Math.min(W - 1, Math.floor((x + 0.25 + 0.5 * i) * dpr));
                    const py = Math.min(H - 1, Math.floor((y + 0.25 + 0.5 * j) * dpr));
                    dsum += g[py * W + px]; csum += alpha[py * W + px];
                }
                depF[y * Wf + x] = dsum / 4 / dmax;
                covF[y * Wf + x] = csum / 4 / 255;
            }
        }
        const wear = [0.024, 0.06, 0.12].map((k) => Math.max(1, Math.round(font * dpr * k)));
        const tmp = new Float32Array(N);
        wear.forEach((r, c) => {
            tmp.set(g);
            blur(tmp, W, H, r);
            for (let i = 0; i < N; i++) glyph[i * 4 + 1 + c] = half(tmp[i] / dmax);
        });

        // ---- 2. a crack in from the top edge, with short side branches, and two
        // spalls where a flake of the face has broken away (one takes the ends
        // of a few letters with it)
        const crackD = new Float32Array(NF).fill(40), crackT = new Float32Array(NF).fill(2);
        const crack = (a, b, t0, t1, amp) => {
            const pts = fractal(a, b, amp, 3, R);
            const lens = [0];
            for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
            const tot = lens[lens.length - 1] || 1;
            const B = 14;
            for (let i = 0; i < pts.length - 1; i++) {
                const [ax, ay] = pts[i], [qx, qy] = pts[i + 1];
                const dx = qx - ax, dy = qy - ay, ll = dx * dx + dy * dy || 1;
                for (let y = Math.max(0, Math.floor(Math.min(ay, qy) - B)); y < Math.min(Hf, Math.ceil(Math.max(ay, qy) + B)); y++) {
                    for (let x = Math.max(0, Math.floor(Math.min(ax, qx) - B)); x < Math.min(Wf, Math.ceil(Math.max(ax, qx) + B)); x++) {
                        const u = clamp(((x + 0.5 - ax) * dx + (y + 0.5 - ay) * dy) / ll);
                        const d = Math.hypot(x + 0.5 - ax - u * dx, y + 0.5 - ay - u * dy);
                        const k = y * Wf + x;
                        if (d < crackD[k]) {
                            crackD[k] = d;
                            crackT[k] = t0 + ((lens[i] + u * Math.sqrt(ll)) / tot) * (t1 - t0);
                        }
                    }
                }
            }
            return pts;
        };
        const cx0 = bx0 + S * (0.6 + 0.12 * R());
        const main = crack([cx0, by0 - 2], [cx0 - S * 0.08, by0 + SH * 0.55], CRACK[0], CRACK[1], SH * 0.06);
        const mid = main[Math.floor(main.length * 0.45)];
        crack(mid, [mid[0] + S * 0.1, mid[1] + SH * 0.16], 0.82, 0.95, SH * 0.03);
        // short side branches, each opening a little after the crack passes
        for (let k = 0; k < 4; k++) {
            const i0 = Math.floor(main.length * (0.15 + 0.7 * R()));
            const p0 = main[i0], side = R() < 0.5 ? -1 : 1, len = S * (0.015 + 0.035 * R());
            const ang = Math.PI / 2 + side * (0.6 + 0.6 * R());
            const t0 = CRACK[0] + (i0 / main.length) * (CRACK[1] - CRACK[0]) + 0.03;
            crack(p0, [p0[0] + Math.cos(ang) * len * side, p0[1] + Math.sin(ang) * len * 0.6], t0, t0 + 0.08, len * 0.18);
        }

        const spall = (cx, cy, rx, ry, rot) => {
            const pts = [];
            const n = 90, ph = R() * 10;
            for (let i = 0; i < n; i++) {
                const a = (i / n) * Math.PI * 2;
                const r = 1 + 0.32 * (fbm(Math.cos(a) * 1.6 + ph, Math.sin(a) * 1.6, seed + 51) - 0.5) * 2 + (R() - 0.5) * 0.05;
                const x = Math.cos(a) * rx * r, y = Math.sin(a) * ry * r;
                pts.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]);
            }
            const M = 26;
            const minx = Math.max(0, Math.floor(Math.min(...pts.map((p) => p[0])) - M)), maxx = Math.min(Wf, Math.ceil(Math.max(...pts.map((p) => p[0])) + M));
            const miny = Math.max(0, Math.floor(Math.min(...pts.map((p) => p[1])) - M)), maxy = Math.min(Hf, Math.ceil(Math.max(...pts.map((p) => p[1])) + M));
            const w = maxx - minx, h = maxy - miny;
            const inside = new Uint8Array(w * h);
            for (let y = 0; y < h; y++) {
                const py = miny + y + 0.5;
                const xs = [];
                for (let i = 0; i < n; i++) {
                    const a = pts[i], b = pts[(i + 1) % n];
                    if ((a[1] <= py) !== (b[1] <= py)) xs.push(a[0] + ((py - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
                }
                xs.sort((p, q) => p - q);
                for (let k = 0; k + 1 < xs.length; k += 2) {
                    for (let x = Math.max(0, Math.ceil(xs[k] - minx - 0.5)); x < Math.min(w, xs[k + 1] - minx - 0.5); x++) inside[y * w + x] = 1;
                }
            }
            const a = new Float32Array(w * h), b = new Float32Array(w * h);
            for (let i = 0; i < w * h; i++) { a[i] = inside[i] ? BIG : 0; b[i] = inside[i] ? 0 : BIG; }
            edt(a, w, h); edt(b, w, h);
            const sdf = new Float32Array(NF).fill(M);
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
                const i = y * w + x;
                sdf[(miny + y) * Wf + minx + x] = clamp(inside[i] ? -(Math.sqrt(a[i]) - 0.5) : Math.sqrt(b[i]) - 0.5, -M, M);
            }
            return sdf;
        };
        const spA = spall(bx1 - S * 0.015, by0 + SH * 0.7, S * 0.1, SH * 0.12, -0.4);
        const spB = spall(bx0 + S * 0.02, by0 + SH * (0.56 + 0.1 * R()), S * 0.055, SH * 0.07, 0.3);

        // ---- 3. rain. Water runs down the face from features: it collects in a
        // groove and leaves at the foot of the stroke, it sheds from the top
        // edge in a few places, it seeps out of the crack and off the lower lip
        // of a spall. Each streak has its own strength and length, many feet
        // shed nothing visible, and whole stretches of the face stay clean.
        const stI = new Float32Array(NF), stT = new Float32Array(NF).fill(2);
        const topI = new Float32Array(NF);
        const fx0 = Math.max(0, Math.floor(bx0)), fx1 = Math.min(Wf, Math.ceil(bx1));
        const fy0 = Math.max(0, Math.floor(by0)), fy1 = Math.min(Hf, Math.ceil(by1));
        for (let x = fx0; x < fx1; x++) {
            const cx = (x - bx0) / S;
            const clean = ss(0.38, 0.62, fbm(cx * 2.2, 3.3, seed + 23));        // stretches that stay clean
            const tw = clamp(Math.pow(fbm(cx * 7, 0.5, seed + 11), 4) * 6 - 0.32) * (0.3 + 0.7 * clean);
            const tL = SH * (0.12 + 0.8 * Math.pow(fbm(cx * 4, 7.7, seed + 21), 2));
            const tBorn = 0.22 + 0.12 * vn(cx * 20, 1.3, seed + 3);
            let water = 0, dist = 0, L = 1, born = 1, catchment = 0;
            for (let y = fy0; y < fy1; y++) {
                const i = y * Wf + x;
                const ty = y - fy0;
                const tv = tw * Math.exp(-ty / tL);
                if (tv > 0.02) { topI[i] = tv; stT[i] = Math.min(stT[i], tBorn + (ty / tL) * 0.3); }
                let src = 0, sL = 0, sB = 1;
                if (covF[i] > 0.5) catchment += 1;
                else if (catchment > 0) {
                    // the foot of a stroke: only some shed a visible tail
                    const v = vn(cx * 90, y * 0.06, seed + 9);
                    src = clamp(catchment / (font * 0.5)) * ss(0.5, 0.78, v) * clean * 1.2;
                    sL = font * (0.5 + 7 * Math.pow(vn(cx * 70, y * 0.07, seed + 13), 3));
                    sB = 0.26 + 0.2 * vn(cx * 50, y * 0.03, seed + 17);
                    catchment = 0;
                }
                if (crackD[i] < 0.7 && crackT[i] < 1) {                        // seeping from the crack
                    src = Math.max(src, 0.55 + 0.3 * vn(y * 0.1, cx * 30, seed + 19));
                    sL = SH * (0.04 + 0.14 * vn(cx * 40, 2.2, seed + 29)); sB = crackT[i] + 0.04;
                }
                if (i >= Wf && ((spA[i - Wf] < 0 && spA[i] >= 0) || (spB[i - Wf] < 0 && spB[i] >= 0))) {   // off a spall's lower lip
                    src = Math.max(src, 0.5 * vn(cx * 60, 5.5, seed + 37) + 0.15);
                    sL = font * (1 + 4 * vn(cx * 50, 6.1, seed + 41)); sB = (spA[i - Wf] < 0 ? SPALL[0] : SPALL[1]) + 0.03;
                }
                if (src > 0.15 && src > water * 0.7) { water = Math.max(water, src); L = sL; dist = 0; born = sB; }
                water *= Math.exp(-1 / Math.max(3, L));
                dist++;
                if (water > 0.02) {
                    stI[i] = water;
                    stT[i] = Math.min(stT[i], born + (dist / Math.max(3, L)) * 0.2);
                }
            }
        }
        // a tail is as wide as a stroke, with soft sides and a faint halo of
        // patina round it; a drip from the top is wider; both break up along
        // their length
        {
            const t2 = new Float32Array(NF);
            const tb = blur(topI.slice(), Wf, Hf, 2);
            const halo = blur(stI.slice(), Wf, Hf, 5);
            for (let y = fy0; y < fy1; y++) for (let x = fx0; x < fx1; x++) {
                const i = y * Wf + x;
                t2[i] = (stI[i - 2] || 0) * 0.12 + (stI[i - 1] || 0) * 0.22 + stI[i] * 0.32 + (stI[i + 1] || 0) * 0.22 + (stI[i + 2] || 0) * 0.12;
            }
            for (let y = fy0; y < fy1; y++) for (let x = fx0; x < fx1; x++) {
                const i = y * Wf + x;
                const n = 0.45 + 0.8 * fbm(x * 0.3, y * 0.025, seed + 31);
                stI[i] = clamp(Math.max(t2[i] * n, tb[i] * 1.2 * n, halo[i] * 0.45));
                if (stT[i] > 1.5) stT[i] = Math.min(stT[i - 1] || 2, stT[i + 1] || 2, stT[i - 2] || 2, stT[i + 2] || 2, stT[i - 4] || 2, stT[i + 4] || 2);
            }
        }

        // ---- 4. lichen
        const C = 2;                                    // css px a cell
        const lw = Math.ceil(cw / C), lh = Math.ceil(ch / C), LN = lw * lh;
        const T = new Float32Array(LN).fill(4);
        const lab = new Int16Array(LN).fill(-1);
        const spd = new Float32Array(LN);
        for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) {
            const px = (x + 0.5) * C, py = (y + 0.5) * C;
            if (px < bx0 + 1 || px > bx1 - 1 || py < by0 + 1 || py > by1 - 1) continue;
            const fi = Math.min(Hf - 1, Math.floor(py)) * Wf + Math.min(Wf - 1, Math.floor(px));
            const deep = ss(0.12, 0.6, depF[fi]);
            const sub = 0.35 + 1.3 * fbm(px / (S * 0.035), py / (S * 0.035), seed + 41);
            spd[y * lw + x] = Math.max(0.04, sub * (1 - 0.9 * deep));
        }
        const cols = [];
        const area = (S * SH) / (900 * 650);
        const SR = Math.max(S, 620);             // colonies keep a readable size on a small stone
        const add = (sp, x, y, birth, rad, lobe) => {
            if (x < bx0 || x > bx1 || y < by0 || y > by1) return;
            // radius reached at t = 1 if it grew unhindered; speed in css px per unit t
            cols.push({ sp, x, y, birth, g: rad / Math.max(0.05, 1 - birth), a: lobe,
                k1: 5 + Math.floor(R() * 5), k2: 9 + Math.floor(R() * 6), p1: R() * 6.283, p2: R() * 6.283, r: R() });
        };
        const gauss = () => (R() + R() + R() - 1.5) / 1.5;
        // where lichen does well: the top edge (birds perch there and feed it
        // nitrogen), the sides, the tops of the letters where water and dust
        // sit on the ledge, along the crack, and a few damp patches (a noise
        // map); colonies are seeded there by rejection, so the middle of the
        // face stays mostly bare
        const ledge = new Float32Array(NF);
        for (let y = 0; y < Hf - 3; y++) for (let x = 0; x < Wf; x++) {
            const i = y * Wf + x;
            if (covF[i] < 0.3 && covF[i + 2 * Wf] > 0.5) ledge[i] = 1;
        }
        blur(ledge, Wf, Hf, 2);
        const habitat = (x, y) => {
            const u = (x - bx0) / S, v = (y - by0) / SH;
            const fi = Math.min(Hf - 1, Math.max(0, Math.floor(y))) * Wf + Math.min(Wf - 1, Math.max(0, Math.floor(x)));
            const n = fbm(u * 5.5, v * 5.5 * SH / S, seed + 61);
            return clamp((n - 0.55) * 3) * 0.45 + 0.75 * ss(0.12, 0, v) + 0.35 * ss(0.07, 0, Math.min(u, 1 - u))
                + 0.22 * clamp(ledge[fi] * 3) + 0.6 * ss(6, 0, crackD[fi]);
        };
        const place = (yfn) => {
            for (let k = 0; k < 60; k++) {
                const x = bx0 + R() * S, y = yfn();
                if (R() < habitat(x, y)) return [x, y];
            }
            return [bx0 + R() * S, yfn()];
        };
        // sizes: many specks for every big colony
        const size = (big) => SR * (0.003 + big * Math.pow(R(), 2.6));
        // 1, 5: Xanthoria and Caloplaca, orange, thick along the top edge, a few lower down
        const nX = Math.round(28 * Math.sqrt(area)) + 8;
        for (let i = 0; i < nX; i++) {
            const low = R() < 0.25;
            const [x, y] = low ? place(() => by0 + R() * SH * 0.8) : [bx0 + R() * S, by0 + Math.abs(gauss()) * SH * 0.09];
            add(R() < 0.35 ? 5 : 1, x, y, 0.36 + R() * 0.46, low ? size(0.022) : SR * (0.01 + 0.028 * R()), 0.3);
        }
        // 2: Lecanora muralis, grey-green rosettes
        const nG = Math.round(24 * Math.sqrt(area)) + 5;
        for (let i = 0; i < nG; i++) {
            const [x, y] = place(() => by0 + R() * SH);
            add(2, x, y, 0.42 + R() * 0.5, size(0.024), 0.2);
        }
        // 3: a grey crust
        const nC = Math.round(20 * Math.sqrt(area)) + 4;
        for (let i = 0; i < nC; i++) {
            const [x, y] = place(() => by0 + SH * (0.1 + 0.9 * R()));
            add(3, x, y, 0.44 + R() * 0.46, size(0.026), 0.14);
        }
        // a few that take hold in the crack once it has opened
        for (let i = 0; i < 6; i++) {
            const q = main[Math.floor(R() * main.length)];
            const fi = Math.min(Hf - 1, Math.max(0, Math.floor(q[1]))) * Wf + Math.min(Wf - 1, Math.max(0, Math.floor(q[0])));
            add(R() < 0.5 ? 2 : 1, q[0] + (R() - 0.5) * 3, q[1], Math.min(0.97, crackT[fi] + 0.05 + R() * 0.05), SR * (0.004 + 0.006 * R()), 0.2);
        }
        const hp = heap();
        cols.forEach((c, ci) => {
            const x = Math.floor(c.x / C), y = Math.floor(c.y / C);
            if (x < 0 || y < 0 || x >= lw || y >= lh) return;
            const i = y * lw + x;
            if (!spd[i] || T[i] <= c.birth) return;
            T[i] = c.birth; lab[i] = ci;
            hp.push(c.birth, i);
        });
        const out = [0, 0];
        const nb = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [-1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, -1, Math.SQRT2]];
        while (hp.size) {
            hp.pop(out);
            const t = out[0], i = out[1];
            if (t > T[i]) continue;
            const c = cols[lab[i]];
            const x = i % lw, y = (i / lw) | 0;
            for (const [dx, dy, l] of nb) {
                const xx = x + dx, yy = y + dy;
                if (xx < 0 || yy < 0 || xx >= lw || yy >= lh) continue;
                const j = yy * lw + xx;
                const s = spd[j];
                if (!s) continue;
                const th = Math.atan2((yy + 0.5) * C - c.y, (xx + 0.5) * C - c.x);
                const lobe = 1 + c.a * (0.6 * Math.sin(c.k1 * th + c.p1) + 0.4 * Math.sin(c.k2 * th + c.p2));
                const nt = t + (l * C) / (c.g * s * lobe);
                if (nt < T[j] && nt < 4) { T[j] = nt; lab[j] = lab[i]; hp.push(nt, j); }
            }
        }

        // tidy the territories: a cell alone among another colony's joins it
        for (let pass = 0; pass < 2; pass++) {
            const l2 = lab.slice(), t2 = T.slice();
            for (let y = 1; y < lh - 1; y++) for (let x = 1; x < lw - 1; x++) {
                const i = y * lw + x, me = lab[i];
                if (me < 0) continue;
                let same = 0, best = -1, bestN = 0, bestT = 9;
                const cnt = new Map();
                for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                    if (!dx && !dy) continue;
                    const j = i + dy * lw + dx, o = lab[j];
                    if (o === me) same++;
                    else if (o >= 0) {
                        const c = (cnt.get(o) || 0) + 1; cnt.set(o, c);
                        if (c > bestN) { bestN = c; best = o; }
                        if (o === best) bestT = Math.min(bestT, T[j]);
                    }
                }
                if (same <= 2 && bestN >= 5) { l2[i] = best; t2[i] = Math.max(T[i], bestT); }
            }
            lab.set(l2); T.set(t2);
        }

        // 4: black dots (Verrucaria), round, in the damp lower half: drawn
        // exactly, at the field's resolution, as the moment each pixel is covered
        const dotT = new Float32Array(NF).fill(2);
        const nB = Math.round(45 * area) + 14;
        for (let k = 0; k < nB; k++) {
            let x = 0, y = 0;
            for (let tries = 0; tries < 30; tries++) {
                x = bx0 + R() * S; y = by0 + SH * (0.3 + 0.7 * Math.sqrt(R()));
                const fi = Math.min(Hf - 1, Math.floor(y)) * Wf + Math.min(Wf - 1, Math.floor(x));
                if (R() < 0.15 + stI[fi] * 2 + 0.6 * clamp((fbm(x / (S * 0.07), y / (S * 0.07), seed + 71) - 0.5) * 4)) break;
            }
            const birth = 0.3 + R() * 0.62;
            const rad = Math.max(1.2, S * (0.0018 + 0.0045 * R() * R()));
            const gr = rad / Math.max(0.05, 1 - birth);
            const B = Math.ceil(rad + 2);
            for (let yy = Math.max(0, Math.floor(y - B)); yy < Math.min(Hf, y + B); yy++) {
                for (let xx = Math.max(0, Math.floor(x - B)); xx < Math.min(Wf, x + B); xx++) {
                    const d = Math.hypot(xx + 0.5 - x, yy + 0.5 - y);
                    const t = birth + d / gr;
                    const i = yy * Wf + xx;
                    if (t < dotT[i]) dotT[i] = t;
                }
            }
        }

        // ---- pack
        const f1 = new Uint16Array(NF * 4), f2 = new Uint16Array(NF * 4);
        // the lichen cells: arrival time, the colony's centre, its speed here;
        // and its species, a random number, its birth
        const lA = new Uint16Array(LN * 4), lB = new Uint8Array(LN * 4);
        for (let i = 0; i < LN; i++) {
            const c = lab[i] >= 0 ? cols[lab[i]] : null;
            if (!c) continue;
            lA[i * 4] = half(T[i]);
            lA[i * 4 + 1] = half(c.x);
            lA[i * 4 + 2] = half(c.y);
            lA[i * 4 + 3] = half(c.g * Math.max(spd[i], 0.04));
            lB[i * 4] = c.sp;
            lB[i * 4 + 1] = Math.floor(c.r * 255);
            lB[i * 4 + 2] = Math.round(clamp(c.birth) * 255);
            lB[i * 4 + 3] = 255;
        }
        for (let y = 0; y < Hf; y++) {
            for (let x = 0; x < Wf; x++) {
                const i = y * Wf + x;
                f1[i * 4] = half(stI[i]);
                f1[i * 4 + 1] = half(stT[i]);
                f1[i * 4 + 3] = half(dotT[i]);
                f2[i * 4] = half(crackD[i]);
                f2[i * 4 + 1] = half(crackT[i]);
                f2[i * 4 + 2] = half(spA[i]);
                f2[i * 4 + 3] = half(spB[i]);
            }
        }
        return { glyph, f1, f2, lA, lB, lw, lh, cell: C, dmax, Wf, Hf };
    }
    return { compute };
}

function makeWorker() {
    const src = `const K = (${weatherKernel.toString()})();
onmessage = (e) => {
  const r = K.compute(e.data);
  postMessage(r, [r.glyph.buffer, r.f1.buffer, r.f2.buffer, r.lA.buffer, r.lB.buffer]);
};`;
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    const w = new Worker(url);
    URL.revokeObjectURL(url);
    return w;
}

// ---- WebGL -------------------------------------------------------------------
const VS = `#version 300 es
in vec2 a; void main(){ gl_Position = vec4(a, 0., 1.); }`;
const FS = `#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D uGlyph, uF1, uF2, uLA, uLB, uStone, uAtlas, uNoise;
uniform ivec2 uLRes;
uniform float uCell;
uniform vec2 uRes, uFRes;
uniform float uDpr, uT, uDmax, uK, uFont, uDraft, uMean;
uniform vec4 uBlock, uStoneMap;
uniform vec3 uL, uTint;
// the clocks, from the one t
uniform float uE, uPat, uGrime, uDust, uRain, uBleach, uSoot;
uniform vec2 uSpallT;
out vec4 o;

float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return texture(uNoise, (i + f + 0.5) / 256.).r; }
float fbm(vec2 p) { return 0.5 * vn(p) + 0.3 * vn(p * 2.07 + 19.3) + 0.2 * vn(p * 4.13 + 41.7); }
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

vec2 C, HS; float S, SHt;

// how weak the stone is here: soft beds, and the foot of the block where
// splash and rising damp work hardest
float weak(vec2 p) {
  vec2 q = (p - uBlock.xy) / S;
  float yN = (p.y - uBlock.y) / SHt;
  return 0.45 + 0.9 * fbm(q * 4.2 + 3.1) + 0.5 * smoothstep(0.6, 1.0, yN) + 0.2 * smoothstep(0.25, 0.0, yN);
}
// the groove, worn: four precomputed stages blended by the local wear
float gdepth(vec4 g, float e) {
  e = clamp(e, 0., 3.);
  float d = e < 1. ? mix(g.r, g.g, e) : (e < 2. ? mix(g.g, g.b, e - 1.) : mix(g.b, g.a, e - 2.));
  return d * (1. - 0.16 * e);
}
// the block's outline: square and crisp when new, rounded and bitten later
float edgeSD(vec2 p) {
  float rad = mix(0.8, 10., clamp(uE / 1.6, 0., 1.)) * uDpr;
  vec2 d = abs(p - C) - (HS - rad);
  float sd = length(max(d, 0.)) + min(max(d.x, d.y), 0.) - rad;
  float near = smoothstep(-24. * uDpr, 0., sd);
  float bite = smoothstep(0.6, 0.82, fbm(p / (64. * uDpr) + 7.)) * 20. + smoothstep(0.72, 0.95, vn(p / (18. * uDpr) + 3.)) * 3.5 + (vn(p / (3. * uDpr)) - 0.5) * 0.7;
  return sd + near * uE * bite * uDpr * 0.5;
}
vec4 F1(vec2 p) { return texture(uF1, (p / uDpr) / uFRes); }
vec4 F2(vec2 p) { return texture(uF2, (p / uDpr) / uFRes); }

// inside a spall: 1 on its floor, 0 on the face, and a rough wall about
// two css px wide between them (the broken edge of the flake)
float spallIn(vec2 p, vec4 f2) {
  float r = (vn(p / (5. * uDpr)) - 0.5) * 2.4 + (vn(p / (1.6 * uDpr)) - 0.5) * 0.8;
  float a = (1. - smoothstep(-2., 0.4, f2.b + r)) * smoothstep(uSpallT.x, uSpallT.x + 0.012, uT);
  float b = (1. - smoothstep(-2., 0.4, f2.a + r)) * smoothstep(uSpallT.y, uSpallT.y + 0.012, uT);
  return max(a, b);
}
// the crack: a V in the face, a hairline at the newly reached tip and up to
// about two css px where it opened long ago
float crackV(vec2 p, vec4 f2) {
  float age = clamp((uT - f2.g) / 0.18, 0., 1.);
  float w = mix(0.45, 1.9, age) * (0.65 + 0.7 * vn(p / (12. * uDpr)));
  return step(f2.g, uT) * clamp(1. - f2.r / (w * 0.5 + 0.35), 0., 1.);
}

// lichen: returns cover (0..1) and writes the colony facts. Which colony
// owns this pixel is settled here, per device pixel: each of the four
// nearest cells offers its colony's arrival time plus the walk from the
// cell's centre at that colony's speed, and the earliest wins. Where the
// runner-up arrives almost as soon, two colonies meet: a dark seam.
float lichen(vec2 p, vec4 f1, out vec4 sp, out float rel, out float lobe, out float seam) {
  vec2 pc = p / uDpr;
  vec2 cp = pc / uCell - 0.5;
  ivec2 b0 = ivec2(floor(cp));
  float e1 = 9., e2 = 9., id1 = -1.;
  vec4 A1 = vec4(0.);
  sp = vec4(0.);
  for (int j = 0; j < 2; j++) for (int i = 0; i < 2; i++) {
    ivec2 q = clamp(b0 + ivec2(i, j), ivec2(0), uLRes - 1);
    vec4 B = texelFetch(uLB, q, 0);
    if (B.a < 0.5) continue;
    vec4 A = texelFetch(uLA, q, 0);
    float est = A.r + length(pc - (vec2(q) + 0.5) * uCell) / max(A.a, 1.);
    float id = A.g * 4096. + A.b;
    if (est < e1) { if (id != id1) e2 = e1; e1 = est; id1 = id; A1 = A; sp = B; }
    else if (id != id1 && est < e2) e2 = est;
  }
  float s = sp.r * 255.;
  lobe = 0.5; seam = 0.;
  if (s < 0.5) { rel = 0.; return 0.; }
  // lobes: noise laid out in (arc length, radius) round the colony's centre,
  // stretched along the radius, so the margin grows out in fingers
  vec2 d = pc - A1.gb;
  float r = length(d), th = atan(d.y, d.x);
  bool fol = s < 1.5 || s > 4.5;
  float lw = fol ? 4.6 : 2.2;                       // crusts: finer lobes
  float lob = vn(vec2(th * r / lw, r / (lw * 2.2)) + sp.g * 50.);
  lobe = lob;
  float gap = (e2 - e1) * A1.a + (vn(p / (1.5 * uDpr)) - 0.5) * 0.4;
  seam = (1. - smoothstep(0.25, 0.9, gap)) * smoothstep(0., 0.004, uT - e2);
  // the outline: lobes, a coarser wander, and the grain of the stone (a
  // crust runs on along the paler, rougher grains and stops at the pits)
  vec2 uv = p * uStoneMap.xy + uStoneMap.zw;
  float grain = lum(texture(uStone, uv).rgb) - lum(textureLod(uStone, uv, 3.).rgb);
  float px = (lob - 0.5) * (fol ? 6.5 : 4.) + (fbm(p / (2.2 * uDpr)) - 0.5) * 2.5
           + (fbm(pc / 9. + sp.g * 20.) - 0.5) * (fol ? 3. : 22.) + (fbm(pc / 22. + sp.g * 31.) - 0.5) * (fol ? 0. : 70.) - grain * (fol ? 0. : 110.);
  // the wander scales with the colony (a speck stays a speck), and nothing
  // shows before the colony is born
  float big = clamp(A1.a * (1. - sp.b) / 30., 0.15, 1.);
  float lt = max(e1 + px * big / max(A1.a, 1.) + (vn(p / (0.9 * uDpr)) - 0.5) * 0.004, sp.b + 0.002);
  float age = uT - lt;
  rel = clamp(age / max(uT - sp.b, 1e-3), 0., 1.);
  // foliose lobes end crisply; a crust feathers out over two or three px
  float c = smoothstep(0., (fol ? 0.9 : 3.) / max(A1.a, 1.), age);
  // old crusts die back in the middle and leave a ring
  if (s > 1.5 && s < 3.5) {
    float hole = smoothstep(0.7, 0.9, rel + (fbm(p / (3. * uDpr) + 3.) - 0.5) * 0.7) * smoothstep(0.35, 0.55, uT - sp.b);
    c *= 1. - hole * 0.7;
  }
  return c;
}

float moss(vec2 p, float gd, float yN, vec4 f2) {
  float zone = smoothstep(0.45, 0.92, yN) * (0.5 + fbm(p / (S * 0.06) + 9.));
  float tt = 0.58 + 0.34 * fbm(p / (S * 0.035) + 5.);
  float m = smoothstep(0.08, 0.32, gd) * zone * smoothstep(tt, tt + 0.08, uT);
  // and a fringe along the foot of the block
  float foot = smoothstep(0.95, 1.0, yN) * smoothstep(0.7, 0.98, uT) * smoothstep(0.5, 0.75, fbm(p / (S * 0.02) + 1.)) * 0.7;
  // and in the crack, a while after it opens, where it holds water
  float ck = (1. - smoothstep(0.6, 2.6, f2.r)) * smoothstep(f2.g + 0.06, f2.g + 0.14, uT) * smoothstep(0.45, 0.65, fbm(p / (6. * uDpr) + 4.)) * 0.6;
  return clamp(max(max(m, foot), ck) * smoothstep(0.3, 0.55, fbm(p / (2.5 * uDpr) + 2.) + 0.2), 0., 1.);
}

// the height of the face at p (device px). e, the local wear, varies slowly
// and is passed in from the centre pixel; whole terms are skipped while
// their time has not come, or far from the block's edge
float H(vec2 p, float e, bool nearEdge, out float gdOut) {
  vec4 g = texture(uGlyph, p / uRes);
  float gd = gdepth(g, e);
  gdOut = gd;
  vec2 uv = p * uStoneMap.xy + uStoneMap.zw;
  float l0 = lum(textureLod(uStone, uv, 0.).rgb), l3 = lum(textureLod(uStone, uv, 3.).rgb);
  float relief = (l0 - l3) * (0.5 + 1.6 * e) * uDpr;
  float h = relief - gd * uDmax * uK;
  // the tooled margin: fine batted strokes square to each edge, mitred at the corners
  vec2 d = HS - abs(p - C);
  float m = min(d.x, d.y);
  float dm = smoothstep(uDraft + 0.5 * uDpr, uDraft - 0.5 * uDpr, m);
  float along = d.x < d.y ? p.y : p.x;
  float pitch = max(3.2 * uDpr, S * 0.0042);
  float u = along / pitch + 0.12 * vn(vec2(along / (pitch * 5.), m / (pitch * 6.)));
  float stroke = abs(fract(u) - 0.5) * 2.;
  float deep = 0.25 + 0.75 * vn(vec2(floor(u) * 1.7, m / (pitch * 1.5)));
  h -= dm * (1. - stroke * stroke) * deep * 0.32 * uDpr * (1. - 0.8 * clamp(e, 0., 1.));
  // soft grains wash out first: the photograph's darker specks become pits
  h -= smoothstep(0.03, 0.14, l3 - l0) * smoothstep(0.7, 2.2, e) * 0.9 * uDpr;
  // the arris
  if (nearEdge) {
    float sd = edgeSD(p);
    float bw = mix(1.4, 8., clamp(uE / 1.6, 0., 1.)) * uDpr;
    float k = clamp(-sd / bw, 0., 1.);
    h -= (1. - k) * (1. - k) * bw * 0.8;
  }
  if (uT < 0.3) return h;
  float si = 0.;
  if (uT > 0.66) {
  // crack
  vec4 f2 = F2(p);
  h -= crackV(p, f2) * 2.6 * uDpr;
  // spalls: the face has scaled off; only the deepest cuts survive in the new floor
  si = spallIn(p, f2);
  float floorH = -(2.2 + uFont / uDpr * 0.09) * uDpr * (0.75 + 0.5 * fbm(p / (9. * uDpr))) + relief * 2.2
                 + (fbm(p / (2.2 * uDpr)) - 0.5) * 1.6 * uDpr + (vn(p / (0.8 * uDpr)) - 0.5) * 0.5 * uDpr;
  h = mix(h, min(h + gd * uDmax * uK * 0.55, floorH - gd * uDmax * uK * 0.45), si);
  }
  // lichen and moss have a little thickness
  vec4 f1 = F1(p);
  vec4 sp; float rel, lobe;
  float seam;
  float lc = lichen(p, f1, sp, rel, lobe, seam) * (1. - si);
  float th = sp.r * 255. < 1.5 || sp.r * 255. > 4.5 ? 0.8 : 0.1;
  h += lc * th * uDpr * (0.6 + 0.8 * vn(p / (1.6 * uDpr))) * (1. - 0.7 * seam);
  float dots = smoothstep(0., 0.004, uT - f1.a) * (1. - si);
  h += dots * 0.08 * uDpr;
  if (uT > 0.58) {
    float yN = (p.y - uBlock.y) / SHt;
    h += moss(p, gd, yN, F2(p)) * gd * uDmax * uK * 0.8;
  }
  return h;
}

// a cell of the atlas (each cell a seamless tile cut from a photograph),
// turned and shifted for each colony so no two look the same
vec3 atlas(float cell, vec2 p, float scale, float r) {
  float a = r * 6.2832;
  mat2 rot = mat2(cos(a), sin(a), -sin(a), cos(a));
  vec2 q = rot * (p / uDpr) / scale + r * 17.31 + cell * 3.7;
  vec2 c = vec2(mod(cell, 3.), floor(cell / 3.));
  vec2 uv = (c + fract(q)) / vec2(3., 2.);
  return textureGrad(uAtlas, uv, dFdx(q) / vec2(3., 2.), dFdy(q) / vec2(3., 2.)).rgb;
}

void main() {
  C = (uBlock.xy + uBlock.zw) * 0.5; HS = (uBlock.zw - uBlock.xy) * 0.5;
  S = uBlock.z - uBlock.x; SHt = uBlock.w - uBlock.y;
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  float sd = edgeSD(p);
  float a = clamp(0.5 - sd, 0., 1.);
  // the block's shadow on the paper, thrown down and right
  vec2 off = vec2(-uL.x, -uL.y) / max(uL.z, 0.3) * 7. * uDpr;
  vec2 ds = abs(p - off - C) - HS;
  float sds = length(max(ds, 0.)) + min(max(ds.x, ds.y), 0.);
  float sh = (1. - smoothstep(-10. * uDpr, 16. * uDpr, sds)) * 0.34 + (1. - smoothstep(-1. * uDpr, 3. * uDpr, sd)) * 0.12;
  vec3 shadowC = vec3(0.17, 0.13, 0.09);
  if (a <= 0.) { o = vec4(shadowC * sh, sh); return; }

  float gd, g0;
  float e = uE * weak(p);
  bool nearEdge = sd > -(30. + 12. * uE) * uDpr;
  float h0 = H(p, e, nearEdge, gd);
  float hl = H(p - vec2(1., 0.), e, nearEdge, g0), hr = H(p + vec2(1., 0.), e, nearEdge, g0);
  float hu = H(p - vec2(0., 1.), e, nearEdge, g0), hd = H(p + vec2(0., 1.), e, nearEdge, g0);
  // the slope. Outside a cut, take the gentler one-sided difference, so the
  // face right at a letter's edge stays flat: the walls are inside the
  // stroke, and nothing spills onto the stone around it
  vec2 dh = vec2(hr - hl, hd - hu) * 0.5;
  if (gd < 0.004) {
    vec2 a1 = vec2(h0 - hl, h0 - hu), b1 = vec2(hr - h0, hd - h0);
    dh = mix(vec2(0.), sign(a1) * min(abs(a1), abs(b1)), step(0., a1 * b1));
  }
  vec3 n = normalize(vec3(-dh, 1.));

  float yN = (p.y - uBlock.y) / SHt;
  vec2 q = (p - uBlock.xy) / S;
  vec4 g = texture(uGlyph, p / uRes);
  vec4 f1 = F1(p), f2 = F2(p);
  float n1 = fbm(q * 7. + 1.3), n2 = fbm(q * 3. + 8.1), n3 = fbm(q * 18. + 4.4);

  // the stone itself: the photograph's colour around the chosen tint
  vec2 uv = p * uStoneMap.xy + uStoneMap.zw;
  vec3 ph = texture(uStone, uv).rgb;
  vec3 alb = uTint * mix(vec3(1.), ph / max(uMean, 0.05), 0.4 + 0.5 * uPat);
  vec3 fresh = alb;
  // fresh: the dust of the cut lies pale in every groove
  float cov = clamp(g.r * uDmax * 1.6, 0., 1.);
  alb = mix(alb, vec3(0.95, 0.91, 0.83), cov * uDust * 0.22);
  // patina: decades darken and warm the face, unevenly
  alb *= mix(vec3(1.), vec3(0.74, 0.64, 0.5), uPat * (0.55 + 0.7 * n1));
  // rain washes the top of the face pale; elsewhere soot and biofilm grey
  // and darken it, in blotches, most where the water does not reach
  float top = (1. - smoothstep(0.0, 0.3, yN)) * (0.5 + 0.7 * n3);
  float washed = clamp(uBleach * top, 0., 1.);
  float sootM = uSoot * smoothstep(0.25, 0.75, n2 + 0.25 * yN) * (1. - washed);
  alb = mix(alb, vec3(lum(alb)) * vec3(0.62, 0.6, 0.56), sootM * 0.75);
  alb = mix(alb, fresh * vec3(1.02, 1.0, 0.96) + 0.02, washed * 0.7);
  // grime settles in the grooves
  float gN = clamp(gd * 1.6, 0., 1.);
  alb *= 1. - uGrime * smoothstep(0.1, 0.8, gN) * (0.3 + 0.25 * n3);
  // rain streaks: water drains out of each letter and stains the face below it
  float stain = clamp(f1.r * smoothstep(f1.g, f1.g + 0.07, uT) * uRain * 1.5, 0., 1.);
  vec3 stainC = mix(vec3(0.22, 0.19, 0.16), vec3(0.18, 0.19, 0.15), smoothstep(0.5, 1., yN));
  alb = mix(alb, stainC, stain * 0.6);
  // moss in the bottom of the grooves, low down where it stays damp
  float mo = moss(p, gd, yN, f2);
  // the crack
  // the crack: lit and shaded walls come from its V; only its narrow core
  // is dark, with water stain soaked into the stone either side
  float cv = crackV(p, f2);
  float cr = smoothstep(0.55, 1., cv);
  float crHalo = step(f2.g, uT) * smoothstep(f2.g, f2.g + 0.1, uT) * (1. - smoothstep(0.5, 7., f2.r)) * (0.16 + 0.12 * vn(p / (6. * uDpr)));
  // the spall: new stone, paler and rawer, with nothing living on it yet
  float si = spallIn(p, f2);
  // the floor of a spall: fresher, paler, rougher stone, weathering a little
  // in the years since the flake came away
  float since = max(smoothstep(uSpallT.x, 1.05, uT) * step(f2.b, 0.), smoothstep(uSpallT.y, 1.05, uT) * step(f2.a, 0.));
  vec3 raw = fresh * vec3(0.95, 0.9, 0.83) * (0.8 + 0.3 * n3 + 0.25 * (lum(ph) - uMean));
  raw = mix(vec3(lum(raw)), raw, 0.75);
  raw *= mix(vec3(1.), vec3(0.8, 0.74, 0.65), 0.75 * since);
  alb = mix(alb, raw, si);
  alb *= 1. - crHalo;

  // lichen, coloured from photographs of the real thing
  vec4 sp; float rel, lobe;
  float seam;
  float lc = lichen(p, f1, sp, rel, lobe, seam) * (1. - si);
  if (lc > 0.) {
    float s = floor(sp.r * 255. + 0.5);
    vec3 lcol;
    float rim = 1. - smoothstep(0., 0.3, rel);
    if (s < 1.5 || s > 4.5) {           // Xanthoria / Caloplaca: orange; bright young lobes at the rim, fruit in the middle
      lcol = atlas(s > 4.5 ? 1. : 0., p, s > 4.5 ? 30. : 34., sp.g);
      // the growing rim: smooth yellow-orange lobes, crevices between them
      vec3 lobeC = vec3(0.93, 0.66, 0.2) * (0.75 + 0.5 * lum(lcol));
      float rz = smoothstep(0.32, 0.05, rel);
      lcol = mix(lcol, lobeC * mix(0.72, 1.12, smoothstep(0.3, 0.7, lobe)), rz * 0.75);
      lcol *= mix(0.8, 1.0, smoothstep(0., 0.5, rel));
    } else {
      // crusts are zoned: a paler, finely lobed growing margin, and an older,
      // darker, cracked (areolate) middle
      vec3 tex = s < 2.5 ? atlas(2., p, 30., sp.g) : atlas(3., p, 34., sp.g) * vec3(0.92, 0.92, 0.89);
      vec3 avg = s < 2.5 ? vec3(0.66, 0.68, 0.6) : vec3(0.64, 0.64, 0.61);
      lcol = mix(avg, tex, 0.7);
      vec3 margin = (s < 2.5 ? vec3(0.78, 0.8, 0.7) : vec3(0.8, 0.79, 0.76)) * mix(0.86, 1.06, smoothstep(0.3, 0.7, lobe));
      lcol = mix(lcol, margin, smoothstep(0.28, 0.06, rel) * 0.65);
      lcol *= mix(1., 0.8, smoothstep(0.45, 0.9, rel));
      // some carry a black prothallus line round the outside
      lcol = mix(lcol, vec3(0.17, 0.16, 0.15), (1. - smoothstep(0.0, 0.02, rel)) * step(0.55, sp.g) * 0.7);
      // they sit in the same weather as the stone
      lcol *= mix(1., 0.84, uSoot);
      lc *= 0.88;
    }
    if (s < 1.5 || s > 4.5) lcol = clamp(mix(vec3(lum(lcol)), lcol, 1.25) * vec3(1.14, 1.0, 0.82), 0., 1.);
    lcol = mix(lcol, vec3(0.13, 0.12, 0.11), seam * 0.85);
    alb = mix(alb, lcol, lc);
  }
  float dots = smoothstep(0., 0.004, uT - f1.a) * (1. - si);
  if (dots > 0.) alb = mix(alb, atlas(4., p, 40., 0.6) * 0.45, dots * 0.9);
  if (mo > 0.) alb = mix(alb, atlas(5., p, 45., 0.3) * vec3(0.7, 0.72, 0.6), clamp(mo * 1.2, 0., 1.) * (1. - si));
  alb *= 1. - cr * 0.72;

  // the light: lambert normalised so flat stone shows its own colour
  float ndl = dot(n, uL);
  float diff = max(ndl, 0.) / max(uL.z, 0.15);
  float amb = 0.36;
  // the spall's rim throws a shadow onto its floor
  vec2 l2 = normalize(uL.xy);
  float rimSh = si * (1. - spallIn(p + l2 * (2.5 + uFont / uDpr * 0.12) * uDpr / max(uL.z, 0.3) * 0.8, F2(p + l2 * (2.5 + uFont / uDpr * 0.12) * uDpr / max(uL.z, 0.3) * 0.8)));
  diff *= 1. - 0.75 * rimSh;
  float shade = amb + (1. - amb) * diff;
  shade *= 1. - 0.22 * smoothstep(0., 0.8, gN) * (1. - uDust * 0.6);   // a little occlusion deep in the cut
  shade = shade < 1. ? shade : 1. + (1. - exp(-(shade - 1.) * 1.4)) * 0.5;
  vec3 col = alb * shade;
  col += pow(max(dot(reflect(-uL, n), vec3(0., 0., 1.)), 0.), 14.) * 0.05 * (1. - lc);
  // a lamp's falloff: the far corner a touch darker
  col *= 1. - 0.06 * clamp(dot((p - C) / HS, -uL.xy), -1., 1.);
  col = clamp(col, 0., 1.);
  o = vec4(col * a + shadowC * sh * (1. - a), a + sh * (1. - a));
}`;

function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
}

// ---- the component -----------------------------------------------------------
export function pretextWeathering(root, opts = {}) {
    const text = root && root.querySelector('.pw-text');
    if (!root || !text) return () => {};
    const stage = root.querySelector('.pw-stage') || root;
    const ds = root.dataset;
    const opt = (k, d) => opts[k] ?? ds[k] ?? d;
    const seed = String(opt('seed', '3')) === 'random' ? (Math.random() * 1e9) | 0 : Number(opt('seed', 3)) || 3;
    const family = opt('font', null), weight = opt('weight', null);
    const leading = Number(opt('leading', 1.62));
    const maxSize = Number(opt('maxSize', 30));
    const minSize = Number(opt('minSize', 11));
    const rest = clamp(Number(opt('rest', 0.78)));
    const yearsOpt = String(opt('years', '1726 2026')).trim();
    const years = yearsOpt ? yearsOpt.split(/[\s,–-]+/).map(Number).filter((v) => !Number.isNaN(v)) : [];
    const lastLine = String(opt('last', 'centre'));
    const stoneUrl = opt('stone', new URL('./assets/stone.webp', import.meta.url).href);
    const atlasUrl = opt('atlas', new URL('./assets/lichens.webp', import.meta.url).href);

    root.classList.add('pw');
    let dead = false;
    const off = [];
    const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); off.push(() => t.removeEventListener(ev, fn, o)); };

    const canvas = document.createElement('canvas');
    canvas.className = 'pw-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    const yearEl = document.createElement('p');
    yearEl.className = 'pw-year';
    yearEl.setAttribute('aria-hidden', 'true');

    let gl = null, prog = null, U = {}, tex = {}, api, stoneImg, atlasImg, worker = null, job = 0;
    let font = { weight: '600', family: 'serif' }, tint = [0.86, 0.78, 0.63], stoneMean = 0.5;
    let G = null, ready = false, dpr = 1;
    let visible = false, raf = 0, last = 0, T = calm.matches ? rest : 0, target = T;
    const light = { x: 0, y: 0, tx: 0, ty: 0 };
    let tiltMod = null;
    const meas = document.createElement('canvas').getContext('2d');
    const spec = (s) => `${font.weight} ${s}px ${font.family}`;

    // ---- layout -----------------------------------------------------------------
    function geometry() {
        const vw = stage.clientWidth || root.clientWidth;
        const vh = innerHeight;
        const phone = vw < 640;
        const M = Math.round(clamp(vw * 0.02, 6, 26));             // room for the shadow
        const bw = Math.min(vw - 2 * M, 1000);
        const yearH = years.length ? 46 : 0;
        const maxH = Math.max(320, Math.min(vh - yearH - 2 * M - (phone ? 24 : 70), bw * 1.9));
        const padX = clamp(bw * 0.085, 22, 82);
        const padY = padX * 0.95;
        const draft = clamp(bw * 0.04, 9, 38);
        return { vw, vh, M, bw, maxH, padX, padY, draft, phone };
    }

    function setText(P, size, width) {
        const res = api.layoutWithLines(P, (width * REF) / size, 1);
        return res.lines.map((l) => l.text.replace(/\s+$/, ''));
    }

    function layout() {
        const g = geometry();
        const P = api.prepareWithSegments(text.textContent.replace(/\s+/g, ' ').trim(), spec(REF));
        const fw = g.bw - 2 * g.padX;
        const fits = (s) => setText(P, s, fw).length * s * leading <= g.maxH - 2 * g.padY;
        let lo = minSize, hi = Math.min(maxSize, Math.max(minSize, g.bw * 0.05));
        if (fits(hi)) lo = hi;
        else for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; if (fits(m)) lo = m; else hi = m; }
        const size = Math.round(lo * 4) / 4;
        const lines = setText(P, size, fw);
        const bh = Math.round(lines.length * size * leading + 2 * g.padY - size * (leading - 1) * 0.5);
        const cw = g.bw + 2 * g.M, ch = bh + 2 * g.M;
        G = { ...g, size, lines, bh, cw, ch, block: [g.M, g.M, g.M + g.bw, g.M + bh] };
        dpr = Math.min(2, devicePixelRatio || 1);
        if (cw * ch * 9 < 3.4e6) dpr = Math.min(3, devicePixelRatio || 1);
    }

    // the letters, justified, into a mask at device resolution
    function drawMask() {
        const W = Math.round(G.cw * dpr), H = Math.round(G.ch * dpr);
        const c = document.createElement('canvas');
        c.width = W; c.height = H;
        const x = c.getContext('2d', { willReadFrequently: true });
        x.setTransform(dpr, 0, 0, dpr, 0, 0);
        x.fillStyle = '#fff';
        x.textBaseline = 'alphabetic';
        x.font = spec(G.size);
        meas.font = spec(G.size);
        const asc = meas.measureText('Hxg').actualBoundingBoxAscent || G.size * 0.7;
        const desc = meas.measureText('Hxg').actualBoundingBoxDescent || G.size * 0.2;
        const fx = G.M + G.padX, fw = G.bw - 2 * G.padX;
        const pitch = G.size * leading;
        const top = G.M + (G.bh - (G.lines.length - 1) * pitch - (asc + desc)) / 2;
        const space = meas.measureText(' ').width;
        G.lines.forEach((ln, li) => {
            const base = top + asc + li * pitch;
            const words = ln.split(' ').filter(Boolean);
            const ws = words.map((w) => meas.measureText(w).width);
            const sum = ws.reduce((a, b) => a + b, 0);
            const isLast = li === G.lines.length - 1;
            let gap = space, xx = fx;
            if (!isLast && words.length > 1) gap = (fw - sum) / (words.length - 1);
            if (gap > space * 2.6 && !isLast) gap = space * 2.6;
            const used = sum + gap * (words.length - 1);
            if (isLast) xx = lastLine === 'left' ? fx : fx + (fw - used) / 2;
            else if (gap === space * 2.6) xx = fx + (fw - used) / 2;
            words.forEach((w, i) => { x.fillText(w, xx, base); xx += ws[i] + gap; });
        });
        const d = x.getImageData(0, 0, W, H).data;
        const alpha = new Uint8Array(W * H);
        for (let i = 0; i < alpha.length; i++) alpha[i] = d[i * 4 + 3];
        return { W, H, alpha };
    }

    function compute() {
        const { W, H, alpha } = drawMask();
        const payload = { W, H, dpr, alpha, cw: G.cw, ch: G.ch, block: G.block, font: G.size, seed };
        const id = ++job;
        const geo = { ...G, dpr, W, H };
        const done = (r) => { if (!dead && id === job) upload(geo, r); };
        try {
            if (!worker) worker = makeWorker();
            worker.onmessage = (e) => done(e.data);
            worker.onerror = () => { worker = null; done(weatherKernel().compute(payload)); };
            worker.postMessage(payload, [alpha.buffer]);
        } catch (e) {
            worker = null;
            setTimeout(() => done(weatherKernel().compute(payload)), 0);
        }
    }

    // ---- GL -------------------------------------------------------------------
    function texture(name, unit, w, h, ifmt, fmt, type, data, filter, wrap = gl.CLAMP_TO_EDGE) {
        if (!tex[name]) tex[name] = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, tex[name]);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        if (data instanceof HTMLImageElement) gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, fmt, type, data);
        else gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, fmt, type, data);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter === gl.NEAREST ? gl.NEAREST : gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
        if (filter === gl.LINEAR_MIPMAP_LINEAR) gl.generateMipmap(gl.TEXTURE_2D);
    }

    function initGL() {
        gl = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: false });
        if (!gl) throw new Error('no webgl2');
        prog = gl.createProgram();
        gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS));
        gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FS));
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
        gl.useProgram(prog);
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        tex.buf = buf;
        const loc = gl.getAttribLocation(prog, 'a');
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
        for (let i = 0; i < n; i++) { const u = gl.getActiveUniform(prog, i); U[u.name] = gl.getUniformLocation(prog, u.name); }
        ['uGlyph', 'uF1', 'uF2', 'uLB', 'uStone', 'uAtlas', 'uNoise', 'uLA'].forEach((k, i) => gl.uniform1i(U[k], i));
        texture('stone', 4, 0, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, stoneImg, gl.LINEAR_MIPMAP_LINEAR, gl.MIRRORED_REPEAT);
        texture('atlas', 5, 0, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlasImg, gl.LINEAR_MIPMAP_LINEAR);
        let a = 0x9e3779b9 ^ seed;
        const nz = new Uint8Array(256 * 256 * 4);
        for (let i = 0; i < nz.length; i++) { a ^= a << 13; a ^= a >>> 17; a ^= a << 5; nz[i] = a & 255; }
        texture('noise', 6, 256, 256, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, nz, gl.LINEAR, gl.REPEAT);
        // mean colour of the photograph, so its variation sits around the tint
        const c = document.createElement('canvas'); c.width = c.height = 32;
        const x = c.getContext('2d', { willReadFrequently: true });
        x.drawImage(stoneImg, 0, 0, 32, 32);
        const d = x.getImageData(0, 0, 32, 32).data;
        const m = [0, 0, 0];
        for (let i = 0; i < d.length; i += 4) { m[0] += d[i]; m[1] += d[i + 1]; m[2] += d[i + 2]; }
        stoneMean = m.map((v) => v / (d.length / 4) / 255);
    }

    function upload(geo, r) {
        const { W, H } = geo;
        canvas.width = W; canvas.height = H;
        canvas.style.width = geo.cw + 'px';
        canvas.style.height = geo.ch + 'px';
        texture('glyph', 0, W, H, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, r.glyph, gl.LINEAR);
        texture('f1', 1, r.Wf, r.Hf, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, r.f1, gl.LINEAR);
        texture('f2', 2, r.Wf, r.Hf, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, r.f2, gl.LINEAR);
        texture('lB', 3, r.lw, r.lh, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, r.lB, gl.NEAREST);
        texture('lA', 7, r.lw, r.lh, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, r.lA, gl.NEAREST);
        gl.uniform2i(U.uLRes, r.lw, r.lh);
        gl.uniform1f(U.uCell, r.cell);
        gl.useProgram(prog);
        gl.viewport(0, 0, W, H);
        const d = geo.dpr;
        gl.uniform2f(U.uRes, W, H);
        gl.uniform2f(U.uFRes, r.Wf, r.Hf);
        gl.uniform1f(U.uDpr, d);
        gl.uniform4f(U.uBlock, ...geo.block.map((v) => v * d));
        gl.uniform1f(U.uDraft, geo.draft * d);
        gl.uniform1f(U.uDmax, r.dmax);
        gl.uniform1f(U.uK, 1.05);
        gl.uniform1f(U.uFont, geo.size * d);
        gl.uniform3f(U.uTint, ...tint);
        gl.uniform1f(U.uMean, (stoneMean[0] + stoneMean[1] + stoneMean[2]) / 3);
        gl.uniform2f(U.uSpallT, 0.83, 0.93);
        // the photograph covers the block, never magnified past one of its pixels to 2.2 css px
        const iw = stoneImg.naturalWidth, ih = stoneImg.naturalHeight;
        const sc = Math.max((geo.bw * d) / iw, (geo.bh * d) / ih, d / 2.2);
        gl.uniform4f(U.uStoneMap, 1 / (iw * sc), 1 / (ih * sc), -geo.block[0] * d / (iw * sc), -geo.block[1] * d / (ih * sc));
        ready = true;
        root.classList.add('is-live');
        draw();
    }

    // ---- time -----------------------------------------------------------------------
    function progress() {
        if (calm.matches) return rest;
        const r = root.getBoundingClientRect();
        const run = r.height - innerHeight;
        if (run <= 0) return rest;
        const q = clamp(-r.top / run);
        return clamp((q - 0.05) / 0.88);
    }

    function draw() {
        if (!gl || !ready) return;
        const t = T;
        const lx = -0.62 + light.x * 0.22, ly = -0.6 + light.y * 0.18, lz = 0.5;
        const l = Math.hypot(lx, ly, lz);
        gl.uniform3f(U.uL, lx / l, ly / l, lz / l);
        gl.uniform1f(U.uT, t);
        gl.uniform1f(U.uE, 0.9 * ss(0.04, 0.55, t) + 0.5 * ss(0.5, 1.0, t));
        gl.uniform1f(U.uPat, ss(0.03, 0.5, t));
        gl.uniform1f(U.uGrime, ss(0.06, 0.5, t));
        gl.uniform1f(U.uDust, 1 - ss(0.0, 0.09, t));
        gl.uniform1f(U.uRain, ss(0.2, 0.55, t) * 0.8 + 0.2 * ss(0.55, 1, t));
        gl.uniform1f(U.uBleach, ss(0.25, 0.7, t));
        gl.uniform1f(U.uSoot, ss(0.35, 0.95, t));
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        if (years.length === 2) yearEl.textContent = String(Math.round(mix(years[0], years[1], t)));
    }

    function frame(now) {
        raf = 0;
        if (dead) return;
        const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
        last = now;
        target = progress();
        const k = calm.matches ? 1 : 1 - Math.exp(-dt / 0.12);
        let alive = false;
        T += (target - T) * k;
        if (Math.abs(target - T) > 1e-4) alive = true; else T = target;
        let tx = light.tx, ty = light.ty;
        if (tiltMod && tiltMod.active) { tx = clamp(tiltMod.x * 1.5, -1, 1); ty = clamp(tiltMod.y * 1.5, -1, 1); }
        const kl = calm.matches ? 1 : 1 - Math.exp(-dt / 0.3);
        light.x += (tx - light.x) * kl; light.y += (ty - light.y) * kl;
        if (Math.abs(tx - light.x) + Math.abs(ty - light.y) > 0.002) alive = true;
        else { light.x = tx; light.y = ty; }
        draw();
        if (alive && visible) raf = requestAnimationFrame(frame);
        else last = 0;
    }
    const kick = () => { if (!raf && !dead && ready && visible) raf = requestAnimationFrame(frame); };

    on(window, 'scroll', kick, { passive: true });
    on(window, 'pointermove', (e) => {
        if (e.pointerType !== 'mouse' || !visible || !G) return;
        const r = canvas.getBoundingClientRect();
        light.tx = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1);
        light.ty = clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1);
        kick();
    }, { passive: true });
    on(document.documentElement, 'mouseleave', () => { light.tx = 0; light.ty = 0; kick(); });
    on(window, 'deviceorientation', () => { if (visible) kick(); }, { passive: true });

    // ---- start ----------------------------------------------------------------------
    (async () => {
        try {
            const cs = getComputedStyle(text);
            font = { weight: weight || cs.fontWeight, family: family || cs.fontFamily };
            tint = colour(getComputedStyle(root).getPropertyValue('--pw-stone').trim(), '#dcc6a0');
            [api, stoneImg, atlasImg] = await Promise.all([
                import(LIB),
                loadImage(new URL(stoneUrl, document.baseURI).href),
                loadImage(new URL(atlasUrl, document.baseURI).href),
            ]);
            // fonts before measuring, but never wait on a stalled font server for long
            const fontsIn = (async () => { await document.fonts.load(`${font.weight} 40px ${font.family}`, 'Traveller'); await document.fonts.ready; })();
            try { await Promise.race([fontsIn, new Promise((ok) => setTimeout(ok, 3000))]); } catch (e) { /* measure what we have */ }
            if (dead) return;
            stage.insertBefore(canvas, text);
            if (years.length === 2) stage.insertBefore(yearEl, text);
            initGL();
            layout();
            compute();
        } catch (e) {
            canvas.remove(); yearEl.remove();
            root.classList.remove('is-live');
            return;
        }
        const io = new IntersectionObserver((en) => {
            for (const e of en) visible = e.isIntersecting;
            if (visible) kick();
        });
        io.observe(root);
        off.push(() => io.disconnect());
        import('./tilt.js').then((m) => { tiltMod = m.default; }).catch(() => {});
        on(calm, 'change', () => { T = progress(); kick(); draw(); });
        let timer = 0, lastW = stage.clientWidth, lastH = innerHeight;
        const ro = new ResizeObserver(() => {
            const w = stage.clientWidth, h = innerHeight;
            if (w === lastW && Math.abs(h - lastH) < 120) return;
            lastW = w; lastH = h;
            clearTimeout(timer);
            timer = setTimeout(() => { if (!dead) { layout(); compute(); } }, 160);
        });
        ro.observe(stage);
        off.push(() => { ro.disconnect(); clearTimeout(timer); });
        T = target = progress();
    })();

    return function destroy() {
        dead = true;
        if (raf) cancelAnimationFrame(raf);
        off.forEach((f) => f());
        if (worker) worker.terminate();
        if (gl) {
            Object.entries(tex).forEach(([k, t]) => (k === 'buf' ? gl.deleteBuffer(t) : gl.deleteTexture(t)));
            if (prog) gl.deleteProgram(prog);
            const lose = gl.getExtension('WEBGL_lose_context');
            if (lose) lose.loseContext();
        }
        canvas.remove(); yearEl.remove();
        root.classList.remove('pw', 'is-live');
    };
}

// Auto-start every [data-pretext-weathering] once it is near the viewport.
document.querySelectorAll('[data-pretext-weathering]').forEach((el) => {
    if (!('IntersectionObserver' in window)) { pretextWeathering(el); return; }
    const io = new IntersectionObserver((en) => {
        if (!en[0].isIntersecting) return;
        io.disconnect();
        pretextWeathering(el);
    }, { rootMargin: '800px' });
    io.observe(el);
});
