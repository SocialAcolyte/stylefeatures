/*
 *  AIR // what hangs in the room: shafts of sun, dust that only shows where the
 *  sun is, and a few slow glints where it catches glass and stone.
 *
 *  Three layers, all canvas 2D:
 *   - shafts  (.jl-air, under the orbs): each window's own lace swept through the
 *     air along the sun's direction, one thin slice at a time, farther slices
 *     softer and fainter; every slice stops at the floor, so a shaft ends where
 *     its patch of light begins. A drifting mist modulates it. A faint haze lifts
 *     the far end of the room.
 *   - dust    (.jl-dust, over the orbs): three depths of motes (far and tiny, mid,
 *     and a few near ones out of focus). A mote is drawn only as bright as the
 *     beam it is in, so it blinks on and off as it crosses the lace. Warm air
 *     lifts them in the beam and a faint draught pushes them along. They never
 *     react to the pointer or a finger; only the depth parallax shifts them.
 *   - glints  (same canvas): a slow highlight on the rim of each glass orb, grains
 *     of mica in the lit floor, and a twinkle on the stone edge of a window.
 *  Reduced motion: shafts and a few frozen glints, no dust, nothing drifts.
 */

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const mix = (a, b, t) => a + (b - a) * t;
const ZMAX = 3.9;                 // how far toward the viewer a shaft reaches before it fades out
const NS = 40;                    // slices per window

function rng(seed) {
    return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

// a seamless cloud tile: two octaves of wrapped value noise, alpha .3..1
function mistTile(n = 192) {
    const r = rng(7), c = cv(n, n), g = c.getContext('2d'), id = g.createImageData(n, n);
    const octave = (cells) => {
        const grid = Array.from({ length: cells * cells }, r), out = new Float32Array(n * n), sm = (t) => t * t * (3 - 2 * t);
        for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
            const fx = x / n * cells, fy = y / n * cells, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = sm(fx - x0), ty = sm(fy - y0);
            const a = grid[(y0 % cells) * cells + (x0 % cells)], b = grid[(y0 % cells) * cells + ((x0 + 1) % cells)];
            const c2 = grid[((y0 + 1) % cells) * cells + (x0 % cells)], d = grid[((y0 + 1) % cells) * cells + ((x0 + 1) % cells)];
            out[y * n + x] = mix(mix(a, b, tx), mix(c2, d, tx), ty);
        }
        return out;
    };
    const o1 = octave(4), o2 = octave(9);
    for (let i = 0; i < n * n; i++) {
        const v = clamp(o1[i] * .65 + o2[i] * .35), a = .22 + .78 * clamp((v - .25) / .55);
        id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = 255; id.data[i * 4 + 3] = a * 255;
    }
    g.putImageData(id, 0, 0);
    return c;
}

function sprite(size, stops) {
    const c = cv(size, size), g = c.getContext('2d'), h = size / 2, gr = g.createRadialGradient(h, h, 0, h, h, h);
    for (const [o, a] of stops) gr.addColorStop(o, `rgba(255,255,255,${a})`);
    g.fillStyle = gr; g.fillRect(0, 0, size, size);
    return c;
}
function tinted(src, col) {
    const c = cv(src.width, src.height), g = c.getContext('2d');
    g.drawImage(src, 0, 0); g.globalCompositeOperation = 'source-in';
    g.fillStyle = `rgb(${col[0] | 0},${col[1] | 0},${col[2] | 0})`; g.fillRect(0, 0, c.width, c.height);
    return c;
}

export function createAir(root, api) {
    const K = api.consts, O = api.opts;
    const I = clamp(O.intensity), phone = () => root.clientWidth < 640;
    const air = document.createElement('canvas'), top = document.createElement('canvas');
    air.className = 'jl-air'; top.className = 'jl-dust';
    for (const c of [air, top]) c.setAttribute('aria-hidden', 'true');
    root.querySelector('.jl-room').after(air);
    root.append(top);
    const ac = air.getContext('2d'), tc = top.getContext('2d');
    const mist = mistTile(); let mistPat = null;
    const crispW = sprite(24, [[0, 1], [.28, .85], [.6, .22], [1, 0]]);
    const softW = sprite(64, [[0, .9], [.35, .55], [.7, .16], [1, 0]]);
    let crisp = crispW, soft = softW, sprKey = '';
    let dpr = 1, W = 0, H = 0, sc = .4;

    // ---- dust
    const parts = [];
    let seeded = false;
    function seed(v) {
        parts.length = 0;
        const total = Math.round(O.motes * (phone() ? .5 : 1)), r = rng(11);
        const nNear = Math.max(4, Math.round(total * .05)), nMid = Math.round(total * .38), nFar = total - nNear - nMid;
        const mk = (layer, zmin, zmax, smin, smax, amin, amax) => ({
            layer, x: v.cam + (r() - .5) * 7, y: .1 + r() * 2.7, z: zmin + r() * (zmax - zmin), s: mix(smin, smax, r()),
            a: mix(amin, amax, r()), dark: 0, age: 9, ph: r() * 6.283, sp: .5 + r(), tw: .8 + r() * 1.6,
        });
        for (let i = 0; i < nFar; i++) parts.push(mk(0, .1, 1.7, .0024, .0042, .45, .9));
        for (let i = 0; i < nMid; i++) parts.push(mk(1, 1.7, 3.3, .0038, .0075, .5, 1));
        for (let i = 0; i < nNear; i++) parts.push(mk(2, 3.4, 4.0, .006, .014, .14, .3));
        for (const p of parts) inBeam(p, v, 24); 
        seeded = true;
    }
    // put a mote where the sun is: try a few places until one is in a beam
    const zr = [[.5, 1.7], [1.7, 3.3], [3.4, 4.0]], sr = rng(31);
    function inBeam(p, v, tries) {
        const [z0, z1] = zr[p.layer];
        for (let n = 0; n < tries; n++) {
            const x = v.cam + (sr() - .5) * 6, y = .15 + sr() * 2.55, z = z0 + sr() * (z1 - z0);
            if (api.beam(x, y, z, v.S, .6) > (p.layer === 2 ? .12 : .35)) { p.x = x; p.y = y; p.z = z; p.dark = 0; p.age = 0; return true; }
        }
        return false;
    }

    // ---- glints
    const floorG = [], edgeG = [];
    let accF = 0, accE = 0;
    const gr = rng(23);

    function resize(w, h, d) {
        W = w; H = h; dpr = d;
        sc = phone() ? .32 : .4;
        air.width = Math.max(8, Math.round(w * sc)); air.height = Math.max(8, Math.round(h * sc));
        top.width = Math.round(w * d); top.height = Math.round(h * d);
        mistPat = ac.createPattern(mist, 'repeat');
        seeded = false;
    }

    function colours(P) {
        const key = [P.sun[0] >> 3, P.sun[1] >> 3, P.sun[2] >> 3].join();
        if (key === sprKey) return;
        sprKey = key;
        const w = P.sun.map((n) => mix(n, 255, .38));
        crisp = tinted(crispW, w); soft = tinted(softW, w);
    }

    // ---- shafts
    function shafts(v, tm, still) {
        const { P, S, cam, Wc, Hc, f, s, cy, yb } = v;
        ac.setTransform(1, 0, 0, 1, 0, 0); ac.globalCompositeOperation = 'source-over'; ac.clearRect(0, 0, air.width, air.height);
        ac.setTransform(sc, 0, 0, sc, 0, 0);
        const g = P.gain, kEl = .55 + .6 * Math.sin(S.el), amp = I * g * kEl;
        // far haze: the end of the room is a little less clear than the near
        const hz = ac.createLinearGradient(0, yb * .3, 0, Hc);
        hz.addColorStop(0, 'rgba(255,255,255,0)'); hz.addColorStop(.55, `rgba(255,255,255,${.1 * I * Math.min(1, g)})`);
        hz.addColorStop(.8, `rgba(255,255,255,${.05 * I * Math.min(1, g)})`); hz.addColorStop(1, 'rgba(255,255,255,0)');
        ac.fillStyle = hz; ac.fillRect(0, 0, Wc, Hc);
        const shots = v.shots;
        for (let k = 0; k < shots.length; k++) {
            const sh = shots[k];
            const wx0 = sh.x - sh.w / 2, ytop = K.SILL + sh.h;
            for (let i = 0; i < NS; i++) {
                const u = (i + .5) / NS, z = u * ZMAX, tt = z / -S.lz;
                const kk = f / (K.CAMZ - z);
                const x0 = Wc / 2 + (wx0 - tt * S.lx - cam) * kk, y0 = cy - (ytop - tt * S.ly - K.CAMY) * kk;
                const w = sh.w * kk, h = sh.h * kk, fl = cy + K.CAMY * kk;
                if (x0 > Wc || x0 + w < 0 || y0 > fl) continue;
                const fall = .18 + .82 * Math.pow(1 - u, 1.7);
                const a = .16 * amp * fall * (40 / NS);
                if (a < .0008) continue;
                ac.save(); ac.beginPath(); ac.rect(0, 0, Wc, fl); ac.clip();
                // three softnesses: sharp near the wall, the slim glow, then the wide haze
                const m = clamp((u - .1) * 1.7);                       // 0 near, 1 beyond mid
                if (m < 1) { ac.globalAlpha = a * (1 - m); ac.drawImage(sh.glow, x0, y0, w, h); }
                ac.globalAlpha = a * (m < 1 ? m : 1); ac.drawImage(sh.haze, x0, y0, w, h);
                ac.restore();
            }
        }
        ac.globalAlpha = 1;
        // colour (the sun's, a little cooler at dawn) then the mist that thins and thickens it
        ac.globalCompositeOperation = 'source-in';
        ac.fillStyle = `rgb(${P.sun.map((n) => mix(n, 255, .15) | 0).join(',')})`; ac.fillRect(0, 0, Wc, Hc);
        ac.globalCompositeOperation = 'destination-in';
        const sx = 1.5 * Wc / mist.width * (phone() ? 1.3 : 1);
        mistPat.setTransform(new DOMMatrix().translate(-tm * 7, -tm * 2.5).scale(sx, sx));
        ac.fillStyle = mistPat; ac.fillRect(0, 0, Wc, Hc);
        ac.globalCompositeOperation = 'source-over';
    }

    // ---- dust and glints on the top canvas
    const wmix = (P) => P.sun.map((n) => mix(n, 255, .5) | 0);
    function dust(v, dt, tm) {
        const { P, S, cam, Wc, Hc, f, cy } = v;
        const g = P.gain, kEl = .55 + .6 * Math.sin(S.el), tilt = api.tilt();
        const ox = api.look().x * .1 + (tilt.active ? tilt.x * .05 : 0), oy = api.look().y * .05;
        const wind = .03 * Math.sin(tm * .11) + .018 * Math.sin(tm * .37 + 1), windz = .02 * Math.sin(tm * .09 + 2);
        const L = 7;
        tc.globalCompositeOperation = 'lighter';
        for (let i = 0; i < parts.length; i++) {
            const p = parts[i];
            const dd = K.CAMZ - p.z, k = f / dd;
            p.x += (wind + Math.sin(tm * .23 * p.sp + p.ph) * .035) * dt;
            p.z += (windz + Math.cos(tm * .17 * p.sp + p.ph) * .03) * dt;
            p.y += (.006 + Math.sin(tm * .31 * p.sp + p.ph * 2) * .014) * dt;
            if (p.y > 2.9) p.y = .08; else if (p.y < .05) p.y = 2.85;
            const mid = cam;
            while (p.x < mid - L / 2) p.x += L; while (p.x > mid + L / 2) p.x -= L;
            p.z = clamp(p.z, p.layer === 2 ? 3.4 : .1, p.layer === 2 ? 4.0 : p.layer === 1 ? 3.35 : 1.75);
            const sx = Wc / 2 + (p.x - cam - ox) * k, sy = cy - (p.y - K.CAMY + oy) * k;
            if (sx < -30 || sx > Wc + 30 || sy < -30 || sy > Hc + 30) continue;
            const b = api.beam(p.x, p.y, p.z, S, .6);
            p.age += dt;
            if (b < .03) { p.dark += dt; if (p.dark > 4 + p.ph) inBeam(p, v, 10); continue; }
            p.dark = 0;
            if (b > .3 && p.layer < 2) p.y += .01 * dt * (b - .3);               // warm air lifts it
            const tw = .55 + .45 * Math.sin(tm * p.tw + p.ph) ** 2;
            const fy = clamp((p.y - .05) / .35) * clamp((2.85 - p.y) / .35);
            const a = clamp(b * g * kEl * p.a * tw * fy * clamp(p.age / 1.6) * I * (p.layer === 2 ? 1.4 : 4.2));
            const r = Math.max(p.layer === 0 ? 1.8 : p.layer === 1 ? 2.5 : 8, p.s * k * 2.2);
            tc.globalAlpha = a;
            tc.drawImage(p.layer === 2 ? soft : crisp, sx - r, sy - r, r * 2, r * 2);
        }
        tc.globalAlpha = 1;
    }

    function projectFloor(v, x, z) { const k = v.f / (K.CAMZ - z); return [v.Wc / 2 + (x - v.cam) * k, v.cy + K.CAMY * k]; }

    function glints(v, dt, tm, still) {
        const { P, S, cam, Wc, Hc, f, s, cy, yb, shots } = v, col = wmix(P), g = P.gain;
        const rgba = (a) => `rgba(${col[0]},${col[1]},${col[2]},${a})`;
        tc.globalCompositeOperation = 'lighter';
        // --- the floor: mica in lit stone
        const lit = (x, z) => {
            const [sx, sy] = projectFloor(v, x, z);
            if (!v.lmD || sx < 0 || sx > Wc || sy < yb + 4 || sy > Hc) return false;
            const i = Math.min(v.lmW - 1, (sx * v.lmScale) | 0), j = Math.min(v.lmH - 1, ((sy - yb) * v.lmScale) | 0);
            return v.lmD[(j * v.lmW + i) * 4 + 3] > 120;
        };
        const spawnFloor = () => {
            for (let n = 0; n < 8; n++) {
                const sy = yb + 8 + gr() * (Hc - yb - 8), dd = f * K.CAMY / Math.max(1, sy - cy), z = K.CAMZ - dd, sx = gr() * Wc;
                const x = cam + (sx - Wc / 2) * dd / f;
                if (z > .2 && lit(x, z)) return { x, z, born: -1, life: 1.6 + gr() * 2, pk: .5 + gr() * .5, r: .8 + gr() * 1.2 };
            }
            return null;
        };
        if (still) {
            if (!floorG.frozen) { floorG.length = 0; for (let n = 0; n < 7; n++) { const q = spawnFloor(); if (q) { q.age = q.life / 2; floorG.push(q); } } floorG.frozen = true; }
        } else {
            floorG.frozen = false; accF += dt * 3.2 * I;
            while (accF > 1 && floorG.length < 18) { accF -= 1; const q = spawnFloor(); if (q) { q.age = 0; floorG.push(q); } }
            accF = Math.min(accF, 2);
        }
        for (let i = floorG.length - 1; i >= 0; i--) {
            const q = floorG[i]; if (!still) q.age += dt;
            if (q.age >= q.life) { floorG.splice(i, 1); continue; }
            const e = Math.sin(Math.PI * q.age / q.life) ** 2, [sx, sy] = projectFloor(v, q.x, q.z), k = f / (K.CAMZ - q.z);
            if (sx < -6 || sx > Wc + 6) continue;
            const r = q.r * Math.max(.7, Math.min(1.8, k / 260)) + .4;
            tc.globalAlpha = clamp(e * q.pk * .9 * Math.min(1, g) * I);
            tc.drawImage(crisp, sx - r * 1.6, sy - r * 1.6, r * 3.2, r * 3.2);
        }
        // --- the stone edge of a window
        const edgePoint = () => {
            const vis = []; for (let k = 0; k < shots.length; k++) { const sh = shots[k], xl = Wc / 2 + (sh.x - sh.w / 2 - cam) * s, xr = xl + sh.w * s; if (xr > 0 && xl < Wc) vis.push(k); }
            if (!vis.length) return null;
            const sh = shots[vis[(gr() * vis.length) | 0]], side = (gr() * 3) | 0;
            const x = side === 0 ? sh.x - sh.w / 2 : side === 1 ? sh.x + sh.w / 2 : sh.x + (gr() - .5) * sh.w;
            const y = side === 2 ? K.SILL : K.SILL + gr() * sh.h;
            return { x, y, vert: side !== 2, born: 0, age: 0, life: 1.2 + gr() * 1.4, pk: .5 + gr() * .5 };
        };
        const eproj = (q) => [Wc / 2 + (q.x - cam) * s, yb - q.y * s];
        if (still) {
            if (!edgeG.frozen) { edgeG.length = 0; for (let n = 0; n < 5; n++) { const q = edgePoint(); if (q) { q.age = q.life / 2; edgeG.push(q); } } edgeG.frozen = true; }
        } else {
            edgeG.frozen = false; accE += dt * .9 * I;
            while (accE > 1 && edgeG.length < 7) { accE -= 1; const q = edgePoint(); if (q) edgeG.push(q); }
            accE = Math.min(accE, 2);
        }
        for (let i = edgeG.length - 1; i >= 0; i--) {
            const q = edgeG[i]; if (!still) q.age += dt;
            if (q.age >= q.life) { edgeG.splice(i, 1); continue; }
            const e = Math.sin(Math.PI * q.age / q.life) ** 2, [sx, sy] = eproj(q);
            const a = clamp(e * q.pk * g * I * .8);
            tc.globalAlpha = a; tc.drawImage(crisp, sx - 3, sy - 3, 6, 6);
            tc.globalAlpha = a * .5; tc.strokeStyle = rgba(1); tc.lineWidth = 1; tc.beginPath();
            if (q.vert) { tc.moveTo(sx, sy - 8 * e); tc.lineTo(sx, sy + 8 * e); } else { tc.moveTo(sx - 9 * e, sy); tc.lineTo(sx + 9 * e, sy); }
            tc.stroke();
        }
        // --- the rim of each glass orb
        const pts = api.orbs(), rr = root.getBoundingClientRect();
        for (let i = 0; i < pts.length; i++) {
            const b = pts[i].el.getBoundingClientRect(), R = Math.min(b.width, b.height) / 2;
            if (R < 8) continue;
            const sx = b.left - rr.left + b.width / 2, sy = b.top - rr.top + b.height / 2;
            if (sx < -R || sx > Wc + R) continue;
            const lit_ = clamp(.3 + 1.3 * api.beam(pts[i].x, pts[i].y, pts[i].z, S, .8));
            for (let j = 0; j < 2; j++) {
                const per = 5.4 + j * 2.7 + i * .5, u = still ? .5 : (((tm + i * 2.3 + j * 3.7) / per) % 1 + 1) % 1;
                const e = Math.sin(Math.PI * u) ** 7, ang = (j ? -.75 : -2.35) + (still ? 0 : .22 * Math.sin(tm * .13 + i + j * 2));
                const a = clamp(e * lit_ * g * I * .9);
                if (a < .01) continue;
                tc.globalAlpha = a * .8; tc.strokeStyle = rgba(1); tc.lineWidth = 1.5; tc.lineCap = 'round';
                tc.beginPath(); tc.arc(sx, sy, R * .955, ang - .26, ang + .26); tc.stroke();
                const gx = sx + Math.cos(ang) * R * .955, gy = sy + Math.sin(ang) * R * .955;
                tc.globalAlpha = a; tc.drawImage(soft, gx - 7, gy - 7, 14, 14);
                tc.drawImage(crisp, gx - 2.6, gy - 2.6, 5.2, 5.2);
            }
        }
        tc.globalAlpha = 1;
    }

    let lastShaft = -9;
    function frame(dt, tm) {
        const v = api.view();
        if (!v || !W) return;
        const still = api.calm();
        colours(v.P);
        // the shafts change slowly: 30 a second is plenty
        if (O.shafts && (still ? true : tm - lastShaft > .033 || !lastShaft)) { shafts(v, still ? 0 : tm, still); lastShaft = tm; } else if (!O.shafts) ac.clearRect(0, 0, air.width, air.height);
        tc.setTransform(dpr, 0, 0, dpr, 0, 0); tc.clearRect(0, 0, W, H);
        if (!still && O.dust) { if (!seeded) seed(v); dust(v, dt, tm); }
        if (O.glimmer) glints(v, dt, tm, still);
        tc.globalCompositeOperation = 'source-over';
    }

    return {
        resize, frame,
        destroy() { air.remove(); top.remove(); },
    };
}
