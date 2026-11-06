/* qalamdan — a toggle that is a Persian pen box: Fathallah Shirazi's qalamdan (Shiraz, mid-19th century, The Met
 * 2018.664, CC0). Off, the box is closed; on, its tray is drawn out of its sleeve, with the calligrapher's tools in
 * its well.
 *
 *   <label class="ql" data-qalamdan>
 *     <input type="checkbox" role="switch" class="ql-switch">
 *     <span class="ql-box" aria-hidden="true">
 *       <span class="ql-tray">
 *         <img class="ql-tray-img" src="assets/tray.webp" width="1586" height="277" alt="">
 *         <img class="ql-tool" src="assets/tools/inkwell.webp" alt="" style="--x:1140;--y:39;--w:401">
 *       </span>
 *       <img class="ql-sleeve" src="assets/sleeve.webp" width="1595" height="280" alt="">
 *     </span>
 *     <span class="ql-text">Show the tools</span>
 *   </label>
 *
 * The real checkbox stays in charge: the label, Space, forms, screen readers (role="switch", on/off) and the CSS,
 * where :checked slides the tray. So without JS it is still a working switch. The box is two rigid cut-outs from the
 * Met's own top-down photographs (sleeve LC-2018_664a-d6, tray -d2), the tray lying under the sleeve with the
 * sleeve's tongue in its end rim. Every tool is cut from its own museum photograph and lies in the well at its
 * catalogued size, placed in the tray photograph's own px (--x --y --w, --r in degrees).
 *
 * With JS: Enter switches it too; a bubbling `qalamdan:toggle` event carries {pressed}; and an optional
 * inscription (.ql-note in the box, a <br> for a new line) is laid by pretext into the lacquer the tools leave free:
 * at the largest size at which it fits whole, with balanced lines, light ink on the black well. It is written only
 * if it fits whole (it is part of the picture: aria-hidden).
 *
 * Options (data-* on the root, or the options object, which wins):
 *   pressed   start on (true, 'true' or a bare data-pressed); lands there without sliding. Or put `checked` on the
 *             input, which works without JS too
 *   draw      how far the tray comes out, in the tray photograph's px at 74 px/cm (CSS --ql-draw)
 *   well      'y0 y1' the band of the well floor that takes words, tray px (default '66 210')
 *   minSize   smallest type for the inscription, css px (default 13)
 * Events (bubbling, on the root): qalamdan:toggle {pressed}. The input's own input and change fire as ever.
 * API: const q = qalamdan(root); q.set(true); q.toggle(); q.pressed; q.input; q(); (destroy: listeners and the
 *   writing; the plain switch stays) — also on root.qalamdan.
 */

const LIB = './vendor/pretext/layout.js';
const TRAY_W = 1586, TRAY_H = 277;    // the tray photograph at export scale (74 px/cm)
const MOUTH = 1547;                    // closed, the sleeve's tongue covers the well up to here (tray px)
const WELL_END = 1544;                 // the end rim's inner edge (tray px)
const GAP = 14;                        // tray px of lacquer kept between a tool and the words
const LABEL = [1030, 70, 1240, 232];   // a dealer's paper label stuck in the well (tray px): never written over
const MIN_RUN = 5;                     // em: the narrowest gap worth a line

let pretext = null;
const loadPretext = () => (pretext ||= import(new URL(LIB, import.meta.url).href).catch(() => null));

function opt(root, o, k, d) {
    if (o[k] != null) return o[k];
    const v = root.dataset[k];
    return v == null ? d : v;
}

export function qalamdan(root, options = {}) {
    if (!root || root.qalamdan) return root && root.qalamdan;
    const input = root.querySelector('input.ql-switch, input[type="checkbox"]');
    const tray = root.querySelector('.ql-tray');
    if (!input || !tray) return null;

    const [wy0, wy1] = String(opt(root, options, 'well', '66 210')).split(/[\s,]+/).map(Number);
    const minSize = +opt(root, options, 'minSize', 13);
    const draw = opt(root, options, 'draw', null);
    if (draw != null) root.style.setProperty('--ql-draw', String(+draw));
    const pressed = opt(root, options, 'pressed', null);
    if (pressed != null && (String(pressed) !== 'false') !== input.checked) {
        // starting on (or off): land there, without sliding in front of the reader as the page loads
        root.classList.add('ql-still');
        input.checked = String(pressed) !== 'false';
        root.getBoundingClientRect();
        requestAnimationFrame(() => root.classList.remove('ql-still'));
    }
    if (!input.hasAttribute('role')) input.setAttribute('role', 'switch');

    const note = root.querySelector('.ql-note');
    const writing = document.createElement('span');
    writing.className = 'ql-writing';
    writing.setAttribute('aria-hidden', 'true');
    tray.appendChild(writing);

    root.classList.add('ql-js');
    let alive = true;
    let laid = '';                         // the key of the last layout (scale, text, draw)
    const drawPx = () => +getComputedStyle(root).getPropertyValue('--ql-draw') || 1100;

    /* ── the switch ────────────────────────────────────────────────────────────────────────────────────── */
    function onKey(e) {
        // checkboxes take Space; a switch should take Enter as well
        if (e.key !== 'Enter' || e.repeat || input.disabled) return;
        e.preventDefault();
        input.click();
    }
    function onChange() {
        root.dispatchEvent(new CustomEvent('qalamdan:toggle', { bubbles: true, detail: { pressed: input.checked } }));
    }
    function set(on) {
        // as if a person switched it: input and change fire, so forms and listeners hear it
        if (input.disabled || input.checked === !!on) return;
        input.checked = !!on;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    input.addEventListener('keydown', onKey);
    input.addEventListener('change', onChange);

    /* ── the inscription in the well ───────────────────────────────────────────────────────────────────── */
    function footprint() {
        // every tool's own outline (its alpha), drawn where it lies and turned as it lies, into a quarter-size mask of
        // the tray, with the label; widened by GAP. Null if a tool can't be read (then nothing is written).
        const Q = 4, W = Math.ceil(TRAY_W / Q), H = Math.ceil(TRAY_H / Q);
        const cv = document.createElement('canvas');
        cv.width = W; cv.height = H;
        const ctx = cv.getContext('2d', { willReadFrequently: true });
        ctx.fillRect(LABEL[0] / Q, LABEL[1] / Q, (LABEL[2] - LABEL[0]) / Q, (LABEL[3] - LABEL[1]) / Q);
        for (const img of tray.querySelectorAll('.ql-tool')) {
            const st = img.style;
            const x = +st.getPropertyValue('--x'), y = +st.getPropertyValue('--y'), w = +st.getPropertyValue('--w');
            const r = (parseFloat(st.getPropertyValue('--r')) || 0) * Math.PI / 180;
            if (!w || !img.naturalWidth) continue;
            const h = w * img.naturalHeight / img.naturalWidth;
            ctx.save();
            ctx.translate((x + w / 2) / Q, (y + h / 2) / Q);
            ctx.rotate(r);
            ctx.drawImage(img, -w / 2 / Q, -h / 2 / Q, w / Q, h / Q);
            ctx.restore();
        }
        let a;
        try { a = ctx.getImageData(0, 0, W, H).data; } catch (e) { return null; }
        let m = new Uint8Array(W * H);
        for (let i = 0; i < W * H; i++) m[i] = a[i * 4 + 3] > 24 ? 1 : 0;
        const g = Math.round(GAP / Q);                              // widen: a square max filter, rows then columns
        for (const [dx, dy] of [[1, 0], [0, 1]]) {
            const n = new Uint8Array(W * H);
            for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) {
                if (!m[yy * W + xx]) continue;
                for (let d = -g; d <= g; d++) {
                    const px = xx + d * dx, py = yy + d * dy;
                    if (px >= 0 && py >= 0 && px < W && py < H) n[py * W + px] = 1;
                }
            }
            m = n;
        }
        return { Q, W, H, m };
    }

    let gen = 0;
    async function lay() {
        if (!note || !alive) return;
        const k = tray.getBoundingClientRect().width / TRAY_W;     // css px per tray px
        // the note's own line breaks (<br>, e.g. the two halves of a couplet) start new lines in the tray too
        const parts = [];
        let cur = '';
        for (const n of note.childNodes) {
            if (n.nodeName === 'BR') { parts.push(cur); cur = ''; } else cur += n.textContent;
        }
        parts.push(cur);
        const paras = parts.map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
        const text = paras.join('\n');
        if (!k || !text) return;
        // type in proportion to the box (26 tray px, 3.5 mm on the object), never smaller than minSize; a short note
        // may grow to 30 tray px if that is what it takes to fill its lane
        const base = Math.min(19, Math.max(minSize, k * 26)), top = Math.min(22, Math.max(base, k * 30));
        const key = [Math.round(k * 1000), base, text, drawPx()].join();
        if (key === laid) return;
        laid = key;
        const g = ++gen;
        const api = await loadPretext();
        if (!api || !alive || g !== gen) return;
        const cs = getComputedStyle(writing);
        const fontAt = (size) => `${cs.fontStyle} ${cs.fontWeight} ${size}px ${cs.fontFamily}`;
        try { await document.fonts.load(fontAt(base), paras[0].slice(0, 48)); } catch (e) { /* what is loaded */ }
        if (!alive || g !== gen) return;
        writing.textContent = '';
        if ((wy1 - wy0) * k < 2 * 1.3 * minSize) return;           // too small at this size: nothing written
        const x0 = MOUTH - drawPx() + 34, x1 = WELL_END - 10;     // the run of well drawn out of the sleeve
        const fp = footprint();
        if (!fp) return;
        let size = base;
        const free = (ya, yb) => {
            // the free runs of a line: the well minus every tool that crosses it, left to right, wide enough to write in
            const { Q, W, H, m } = fp;
            const r0 = Math.max(0, Math.floor(ya / Q)), r1 = Math.min(H - 1, Math.ceil(yb / Q));
            const runs = [];
            let start = -1;
            for (let c = Math.ceil(x0 / Q); c <= Math.min(W - 1, Math.floor(x1 / Q)); c++) {
                let blocked = false;
                for (let r = r0; r <= r1 && !blocked; r++) blocked = m[r * W + c] === 1;
                if (!blocked && start < 0) start = c;
                if ((blocked || c === Math.min(W - 1, Math.floor(x1 / Q))) && start >= 0) {
                    runs.push([start * Q, (blocked ? c : c + 1) * Q]);
                    start = -1;
                }
            }
            return runs.filter(([a, b]) => (b - a) * k >= MIN_RUN * size);
        };
        const prepared = new Map();
        const prep = (s) => prepared.get(s) || (prepared.set(s, paras.map((p) => api.prepareWithSegments(p, fontAt(s)))), prepared.get(s));
        const START = { segmentIndex: 0, graphemeIndex: 0 };
        // one pass: lines go down the floor wherever the lacquer is free, packed close where a tool leaves a lane;
        // each of the note's own lines starts on a new line
        const attempt = (s, measure = Infinity) => {
            size = s;
            const Ps = prep(s), step = s * 1.3 / k;                 // a line's height in tray px
            const placed = [];
            let pi = 0, cursor = START;
            for (let ya = wy0; ya + step <= wy1 + .5 && pi < Ps.length;) {
                const runs = free(ya, ya + step);
                if (!runs.length) { ya += step / 4; continue; }
                for (const [a, b] of runs) {
                    const line = api.layoutNextLine(Ps[pi], cursor, Math.min((b - a) * k, measure));
                    if (!line) break;
                    placed.push([line.text.replace(/\s+$/, ''), a, ya + step / 2]);
                    cursor = line.end;
                    if (api.layoutNextLine(Ps[pi], cursor, 1e7) === null) { pi++; cursor = START; break; }
                }
                ya += step;
            }
            return { placed, size: s, whole: pi >= Ps.length };
        };
        // the largest type at which the whole note fits among the tools, then the narrowest measure that still fits
        // (balanced lines). If it never fits whole, nothing is written: a picture doesn't trail off.
        let best = null;
        for (let s = top; s >= minSize - 1e-6; s -= .5) { const r = attempt(Math.round(s * 10) / 10); if (r.whole && r.placed.length) { best = r; break; } }
        if (!best) return;
        let lo = 40, hi = (x1 - x0) * k;
        for (let i = 0; i < 16; i++) { const m = (lo + hi) / 2; const r = attempt(best.size, m); if (r.whole && r.placed.length <= best.placed.length) hi = m; else lo = m; }
        best = attempt(best.size, Math.ceil(hi) + 1);
        const frag = document.createDocumentFragment();
        for (const [t, a, y] of best.placed) {
            const span = document.createElement('span');
            span.textContent = t;
            span.style.left = (a / TRAY_W * 100) + '%';
            span.style.top = (y / TRAY_H * 100) + '%';
            frag.appendChild(span);
        }
        writing.style.fontSize = best.size + 'px';
        writing.appendChild(frag);
    }

    // the inscription is laid while the box is still closed (it lies under the sleeve), again whenever the box changes
    // size, and once each tool has loaded
    const ro = new ResizeObserver(() => lay());
    ro.observe(tray);
    for (const img of tray.querySelectorAll('img')) if (!img.complete) img.addEventListener('load', () => { laid = ''; lay(); }, { once: true });
    lay();

    function destroy() {
        alive = false;
        input.removeEventListener('keydown', onKey);
        input.removeEventListener('change', onChange);
        ro.disconnect();
        writing.remove();
        root.classList.remove('ql-js');
        delete root.qalamdan;
    }
    destroy.set = set;
    destroy.toggle = () => set(!input.checked);
    destroy.input = input;
    Object.defineProperty(destroy, 'pressed', { get: () => input.checked });
    root.qalamdan = destroy;
    return destroy;
}

function boot() {
    for (const el of document.querySelectorAll('[data-qalamdan]')) qalamdan(el);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
