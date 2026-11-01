/*
 *  ORBS // things that hang in the air of the room, one in front of each window.
 *
 *  Part of jali-light (it is imported by jali-light.js; nothing here runs alone).
 *  Each orb is a real <button>: a ball of frosted glass with a thin-line glyph
 *  in it. It sits in the room's own geometry, so it travels with the walk and
 *  moves more than the wall behind it (parallax comes from the same camera);
 *  the pointer or the phone's tilt turns it a little toward you. The sun's lace
 *  falls across it (the same beam lookup that lights the floor is read over the
 *  face of the glass), the light is tinted by the hour, and a shadow with a
 *  small bright pool of focused light sits on the floor beneath.
 *
 *  A gaze reticle follows the mouse; over an orb its ring opens and fills.
 *  Click, tap or Enter opens the orb as a floating glass window, a small app,
 *  that unfolds out of it. Escape, the close button or a tap outside folds it
 *  back. Four apps ship: profile, code, social, gallery. Add your own through
 *  the `apps` option: { name: (host) => HTMLElement | { el, destroy } }.
 */

const calm = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// thin-line glyphs on a 24 grid, drawn as one family
export const GLYPHS = {
    user: '<circle cx="12" cy="8.4" r="3.7"/><path d="M4.6 19.8c.8-3.9 3.7-5.9 7.4-5.9s6.6 2 7.4 5.9"/>',
    code: '<path d="M8.4 7.2 3.8 12l4.6 4.8M15.6 7.2l4.6 4.8-4.6 4.8M13.5 5.4l-3 13.2"/>',
    chat: '<path d="M5.2 4.8h13.6a1.7 1.7 0 0 1 1.7 1.7v8.3a1.7 1.7 0 0 1-1.7 1.7h-6.4l-4.3 3.2v-3.2H5.2a1.7 1.7 0 0 1-1.7-1.7V6.5a1.7 1.7 0 0 1 1.7-1.7z"/><path d="M12 13.5s-3.2-1.8-3.2-4a1.75 1.75 0 0 1 3.2-.95 1.75 1.75 0 0 1 3.2.95c0 2.2-3.2 4-3.2 4z"/>',
    photo: '<rect x="3.4" y="4.4" width="17.2" height="15.2" rx="2.2"/><path d="m3.6 16.4 4.8-4.7 3.7 3.6 2.7-2.6 5.6 5.5"/><circle cx="15.9" cy="9.3" r="1.35"/>',
    note: '<path d="M9 18.2V5.6l10-2v12.6"/><circle cx="6.8" cy="18.2" r="2.2"/><circle cx="16.8" cy="16.2" r="2.2"/>',
    mail: '<rect x="3.4" y="5.6" width="17.2" height="12.8" rx="2"/><path d="m3.8 7.4 8.2 6 8.2-6"/>',
};
const ICON = {
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    arrow: '<path d="M7 17 17 7M9 7h8v8"/>',
    heart: '<path d="M12 19.6s-7-4.1-7-9.4a3.9 3.9 0 0 1 7-2.4 3.9 3.9 0 0 1 7 2.4c0 5.3-7 9.4-7 9.4z"/>',
    prev: '<path d="m14.5 6-6 6 6 6"/>',
    next: '<path d="m9.5 6 6 6-6 6"/>',
};
const svg = (inner, cls = '', sw = 1.35) => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

// ---- a very small JS highlighter: enough for a snippet, no library
const RULES = [
    ['c', /^\/\/.*/], ['s', /^(["'`])(?:\\.|(?!\1).)*\1/], ['n', /^\d+(?:\.\d+)?/],
    ['k', /^(?:export|function|const|let|return|if|else|new|of|import|from|await|async)\b/],
    ['f', /^[A-Za-z_$][\w$]*(?=\()/], ['p', /^[A-Za-z_$][\w$]*/], ['o', /^[=<>!+\-*/%&|?:]+/],
];
function highlight(line) {
    let out = '', rest = line;
    while (rest) {
        let hit = false;
        for (const [cls, re] of RULES) {
            const m = re.exec(rest);
            if (m) { out += `<span class="jl-t-${cls}">${esc(m[0])}</span>`; rest = rest.slice(m[0].length); hit = true; break; }
        }
        if (!hit) { out += esc(rest[0]); rest = rest.slice(1); }
    }
    return out;
}

const CODE = [
    '// let the sun in',
    'export function lace(sun, screen) {',
    '  const gaps = screen.openings.filter(',
    '    (gap) => gap.angle < sun.elevation,',
    '  );',
    '',
    '  return gaps.map((gap) => ({',
    '    x: gap.x + sun.shadow * gap.depth,',
    '    warmth: sun.warmth * 0.8,',
    '  }));',
    '}',
];
const NOTES = [
    '# notes',
    '',
    '- the stone is only the frame;',
    '  the pattern is what the light does.',
    '- keep the window, drop the glass.',
    '- walk slowly. noon is at the third one.',
];

// ---- the four apps
const APPS = {
    profile() {
        const rows = [['Writing', 'Notes on craft and light'], ['Projects', 'Things I have made'], ['Elsewhere', 'Find me around the web']];
        const n = el('div', 'jl-a jl-a-profile', `
            <div class="jl-avatar" aria-hidden="true">${svg(GLYPHS.user, '', 1.1)}</div>
            <h2 class="jl-a-name">Your Name</h2>
            <p class="jl-a-line">Designer and maker of small, calm things on the web.</p>
            <ul class="jl-rows">${rows.map(([a, b]) => `<li><a href="#" class="jl-row"><span><b>${a}</b><i>${b}</i></span>${svg(ICON.arrow, 'jl-go')}</a></li>`).join('')}</ul>`);
        n.querySelectorAll('.jl-row').forEach((a) => a.addEventListener('click', (e) => e.preventDefault()));
        return n;
    },
    code() {
        const files = { 'torana.js': CODE, 'notes.md': NOTES };
        const n = el('div', 'jl-a jl-a-code', `
            <div class="jl-tabs" role="tablist" aria-label="Files">${Object.keys(files).map((f, i) => `<button type="button" role="tab" id="jl-tab-${i}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-f="${f}"><span class="jl-dot${i ? ' jl-dot-md' : ''}"></span>${f}</button>`).join('')}</div>
            <pre class="jl-src" role="tabpanel" aria-labelledby="jl-tab-0" tabindex="0"></pre>
            <div class="jl-status"><span>UTF-8</span><span>2 spaces</span><span class="jl-ln">Ln 1, Col 1</span></div>`);
        const pre = n.querySelector('.jl-src'), tabs = [...n.querySelectorAll('[role=tab]')], ln = n.querySelector('.jl-ln');
        const show = (name) => {
            const md = name.endsWith('.md');
            const last = files[name].length - 1;
            pre.innerHTML = files[name].map((l, i) => `<span class="jl-l"><u>${i + 1}</u>${md ? esc(l) : highlight(l)}${i === last ? '<span class="jl-caret" aria-hidden="true"></span>' : ''}</span>`).join('');
            ln.textContent = `Ln ${files[name].length}, Col ${files[name][files[name].length - 1].length + 1}`;
            tabs.forEach((t) => { const on = t.dataset.f === name; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; if (on) pre.setAttribute('aria-labelledby', t.id); });
        };
        tabs.forEach((t) => t.addEventListener('click', () => show(t.dataset.f)));
        n.querySelector('.jl-tabs').addEventListener('keydown', (e) => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            const i = tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true'), j = (i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
            show(tabs[j].dataset.f); tabs[j].focus();
        });
        show('torana.js');
        return n;
    },
    social() {
        const posts = [
            ['Ada Rao', '@ada', 'Left the shutters open all afternoon. The floor did the rest.', 24, '#d9a066'],
            ['Jun Okafor', '@jun', 'Shipped the small thing. It is calm, it is quick, nobody asked for it.', 118, '#9db08a'],
            ['Mina Sato', '@mina', 'Reading by the window while the lattice crawls across the page.', 63, '#c96f4a'],
        ];
        const n = el('div', 'jl-a jl-a-social', `<h2 class="jl-a-head">Home</h2><ul class="jl-feed">${posts.map(([name, h, t, c, col], i) => `
            <li class="jl-post"><span class="jl-pa" style="--c:${col}" aria-hidden="true"></span>
              <div><p class="jl-pn"><b>${name}</b> <i>${h}</i></p><p class="jl-pt">${t}</p>
              <button type="button" class="jl-like" aria-pressed="false" aria-label="Like, ${c} likes" data-n="${c}">${svg(ICON.heart, '', 1.5)}<span>${c}</span></button></div></li>`).join('')}</ul>`);
        n.querySelectorAll('.jl-like').forEach((b) => b.addEventListener('click', () => {
            const on = b.getAttribute('aria-pressed') !== 'true', c = +b.dataset.n + (on ? 1 : 0);
            b.setAttribute('aria-pressed', on); b.querySelector('span').textContent = c; b.setAttribute('aria-label', `${on ? 'Unlike' : 'Like'}, ${c} likes`);
        }));
        return n;
    },
    gallery(host) {
        const pics = host.images(); let i = 0;
        const n = el('div', 'jl-a jl-a-gallery', `
            <div class="jl-frame"><img alt="" decoding="async"><button type="button" class="jl-pv" aria-label="Previous">${svg(ICON.prev)}</button><button type="button" class="jl-nx" aria-label="Next">${svg(ICON.next)}</button></div>
            <div class="jl-thumbs">${pics.map((p, k) => `<button type="button" aria-label="Photograph ${k + 1}"><img src="${p}" alt=""></button>`).join('')}</div>`);
        const big = n.querySelector('.jl-frame img'), th = [...n.querySelectorAll('.jl-thumbs button')];
        const go = (k) => { i = (k + pics.length) % pics.length; big.src = pics[i]; th.forEach((t, j) => t.setAttribute('aria-current', j === i)); };
        n.querySelector('.jl-pv').addEventListener('click', () => go(i - 1));
        n.querySelector('.jl-nx').addEventListener('click', () => go(i + 1));
        th.forEach((t, k) => t.addEventListener('click', () => go(k)));
        n.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') go(i - 1); else if (e.key === 'ArrowRight') go(i + 1); });
        go(host.index || 0);
        return n;
    },
};

const DEFAULTS = [
    { label: 'About me', glyph: 'user', app: 'profile' },
    { label: 'Code', glyph: 'code', app: 'code' },
    { label: 'Social', glyph: 'chat', app: 'social' },
    { label: 'Photographs', glyph: 'photo', app: 'gallery' },
];
// where each hangs in the room: a little off the window's centre, at a slightly different depth and height
const SPOTS = [{ dx: 0, y: 1.46, z: 1.5 }, { dx: .12, y: 1.56, z: 1.7 }, { dx: -.1, y: 1.4, z: 1.45 }, { dx: .06, y: 1.5, z: 1.6 }];

export function createOrbs(root, ctx) {
    const cfg = ctx.config.map((c, i) => ({ ...DEFAULTS[i % DEFAULTS.length], ...c }));
    const apps = { ...APPS, ...(ctx.apps || {}) };
    const vr = el('div', 'jl-vr'); vr.setAttribute('role', 'group'); vr.setAttribute('aria-label', 'Things hanging in the room');
    const items = cfg.map((c, i) => {
        const sp = SPOTS[i % SPOTS.length], x = ctx.shotX(i) + sp.dx;
        const obj = el('div', 'jl-obj'), par = el('div', 'jl-par'), bob = el('div', 'jl-bob');
        const orb = el('button', 'jl-orb');
        orb.type = 'button'; orb.setAttribute('aria-label', c.label); orb.setAttribute('aria-haspopup', 'dialog');
        const glyph = ctx.glyphs && ctx.glyphs[c.glyph] || GLYPHS[c.glyph] || c.glyph;
        orb.innerHTML = `<canvas class="jl-lace" width="64" height="64" aria-hidden="true"></canvas>${svg(glyph, 'jl-glyph')}<span class="jl-gloss" aria-hidden="true"></span>`;
        const tag = el('span', 'jl-tag', esc(c.label)); tag.setAttribute('aria-hidden', 'true');
        bob.style.setProperty('--jl-delay', `${-(i * 1.7).toFixed(1)}s`); bob.style.setProperty('--jl-dur', `${(6.2 + i * .7).toFixed(1)}s`);
        bob.append(orb, tag); par.append(bob); obj.append(par);
        const pool = el('div', 'jl-pool'); pool.setAttribute('aria-hidden', 'true');
        vr.append(pool, obj);
        const lc = orb.querySelector('.jl-lace'), lg = lc.getContext('2d'), lid = lg.createImageData(64, 64);
        return { c, i, x, y: sp.y, z: sp.z, obj, par, orb, pool, tag, lc, lg, lid, D: 0, par_k: 0 };
    });
    root.append(vr);

    // the gaze reticle
    const ret = el('div', 'jl-reticle', `<svg viewBox="0 0 60 60" aria-hidden="true"><circle class="jl-r-ring" cx="30" cy="30" r="25"/><circle class="jl-r-fill" cx="30" cy="30" r="25" pathLength="100"/><circle class="jl-r-dot" cx="30" cy="30" r="2.4"/></svg>`);
    ret.setAttribute('aria-hidden', 'true');
    root.append(ret);

    let px = 0, py = 0, tx = 0, ty = 0, rx = -99, ry = -99, rtx = -99, rty = -99, mouse = false, over = null, openApp = null, lastP = '';
    let view = null, flash = 0;

    function lace(it, v) {
        const R = it.D / 2, N = 64, d = it.lid.data, S = v.S, g = v.P.gain, col = v.P.sun;
        const wr = (it.wR);
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
            const u = (i + .5) / N * 2 - 1, w = (j + .5) / N * 2 - 1, o = (j * N + i) * 4;
            if (u * u + w * w > 1) { d[o + 3] = 0; continue; }
            const m = ctx.beam(it.x + u * wr, it.y - w * wr, it.z, S, .8);
            d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = clamp(m * g * 1.5) * 255;
        }
        it.lg.putImageData(it.lid, 0, 0);
    }

    function place(v) {
        view = v;
        root.style.setProperty('--jl-sun', v.P.sun.map((n) => n | 0).join(','));
        root.style.setProperty('--jl-sky', v.P.sky.map((n) => n | 0).join(','));
        root.style.setProperty('--jl-warm', clamp(v.P.sat).toFixed(2));
        const phone = v.Wc < 640;
        for (const it of items) {
            const dd = ctx.camz - it.z, k = v.f / dd;
            const sx = v.Wc / 2 + (it.x - v.cam) * k, sy = v.cy - (it.y - ctx.camy) * k + root.clientHeight * .05;   // hung 5% of the height lower
            const wD = phone ? .4 : .44, px_ = clamp(wD * k, 70, 150);
            it.wR = px_ / k / 2;                       // world radius matching the clamped pixel size
            it.obj.style.transform = `translate3d(${sx.toFixed(1)}px,${sy.toFixed(1)}px,0)`;
            it.obj.style.setProperty('--d', `${px_.toFixed(1)}px`);
            it.par.style.setProperty('--par', `${(9 * ctx.camz / dd).toFixed(1)}px`);   // nearer moves more
            const fy = v.cy + ctx.camy * k;           // the floor under it, same depth
            it.pool.style.transform = `translate3d(${sx.toFixed(1)}px,${fy.toFixed(1)}px,0)`;
            it.pool.style.setProperty('--d', `${px_.toFixed(1)}px`);
            it.D = px_;
            if (sx > -px_ && sx < v.Wc + px_) lace(it, v);
        }
    }

    function tick(dt) {
        const t = ctx.tilt();
        const gx = calm.matches ? 0 : t.active ? t.x : tx, gy = calm.matches ? 0 : t.active ? t.y * .6 : ty;
        const k = 1 - Math.exp(-dt * 5);
        px += (gx - px) * k; py += (gy - py) * k;
        const key = px.toFixed(3) + py.toFixed(3);
        if (key !== lastP) { lastP = key; vr.style.setProperty('--jl-px', px.toFixed(3)); vr.style.setProperty('--jl-py', py.toFixed(3)); }
        if (mouse) {
            const kk = 1 - Math.exp(-dt * 22);
            rx += (rtx - rx) * kk; ry += (rty - ry) * kk;
            ret.style.transform = `translate3d(${rx.toFixed(1)}px,${ry.toFixed(1)}px,0)`;
        }
    }

    // ---- pointer: gaze + parallax
    const rel = (e) => { const r = root.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top, r]; };
    const onMove = (e) => {
        const [x, y, r] = rel(e);
        if (e.pointerType === 'touch') return;
        if (!mouse) { mouse = true; rx = x; ry = y; root.classList.add('jl-gaze'); }
        rtx = x; rty = y;
        tx = clamp((x / r.width - .5) * 2, -1, 1); ty = clamp((y / r.height - .5) * 2, -1, 1);
        const inApp = !!e.target.closest('.jl-scrim');
        ret.classList.toggle('jl-hide', inApp);
        root.classList.toggle('jl-gaze', !inApp);
        const hit = !inApp && e.target.closest('.jl-orb');
        if (hit !== over) { over = hit; ret.classList.toggle('jl-lock', !!hit); }
    };
    const onLeave = () => { ret.classList.add('jl-hide'); ret.classList.remove('jl-lock'); over = null; };
    const onEnter = (e) => { if (e.pointerType !== 'touch') ret.classList.remove('jl-hide'); };
    const onDown = (e) => {
        if (e.pointerType !== 'touch') { ret.classList.add('jl-press'); return; }
        // a tap on a phone: the ring blooms where the finger lands
        const [x, y] = rel(e); ret.style.transform = `translate3d(${x}px,${y}px,0)`;
        ret.classList.remove('jl-hide', 'jl-tap'); void ret.offsetWidth; ret.classList.add('jl-tap');
        clearTimeout(flash); flash = setTimeout(() => ret.classList.remove('jl-tap'), 700);
    };
    const onUp = () => ret.classList.remove('jl-press');
    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerleave', onLeave);
    root.addEventListener('pointerenter', onEnter);
    root.addEventListener('pointerdown', onDown);
    root.addEventListener('pointerup', onUp);
    root.addEventListener('pointercancel', onUp);

    // ---- opening an orb
    let scrim = null, dlg = null, opener = null, body = null, bodyKill = null, closing = 0;
    const focusables = () => [...dlg.querySelectorAll('button, a[href], input, [tabindex]:not([tabindex="-1"])')].filter((n) => !n.disabled && n.offsetParent !== null);
    function open(it) {
        if (scrim) return;
        opener = it.orb;
        const rr = root.getBoundingClientRect();                // bring the whole room on screen before it unfolds
        if (rr.top > 8 || rr.bottom < innerHeight - 8) window.scrollBy({ top: rr.top, behavior: 'instant' });
        scrim = el('div', 'jl-scrim');
        dlg = el('div', 'jl-app-win');
        dlg.setAttribute('role', 'dialog'); dlg.setAttribute('aria-modal', 'true'); dlg.setAttribute('aria-label', it.c.label);
        dlg.dataset.app = it.c.app;
        const x = el('button', 'jl-x', svg(ICON.x, '', 1.5)); x.type = 'button'; x.setAttribute('aria-label', `Close ${it.c.label}`);
        const make = apps[it.c.app] || APPS.profile;
        const built = make({ images: ctx.images, index: it.i, label: it.c.label });
        body = built && built.el ? built.el : built; bodyKill = built && built.destroy;
        dlg.append(x, body); scrim.append(dlg); root.append(scrim);
        vr.inert = true; vr.classList.add('jl-away');
        // unfold out of the orb: origin is the orb's centre in the window's own box
        const o = it.orb.getBoundingClientRect(), d = dlg.getBoundingClientRect();
        dlg.style.setProperty('--ox', `${(o.left + o.width / 2 - d.left).toFixed(0)}px`);
        dlg.style.setProperty('--oy', `${(o.top + o.height / 2 - d.top).toFixed(0)}px`);
        requestAnimationFrame(() => scrim && scrim.classList.add('jl-in'));
        x.addEventListener('click', close);
        scrim.addEventListener('pointerdown', (e) => { if (e.target === scrim) close(); });
        scrim.addEventListener('keydown', onDlgKey);
        scrim.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
        (dlg.querySelector('[autofocus]') || x).focus({ preventScroll: true });
        root.dispatchEvent(new CustomEvent('jali:open', { detail: { app: it.c.app, label: it.c.label } }));
    }
    function onDlgKey(e) {
        e.stopPropagation();                                    // arrows belong to the app, not to the walk
        if (e.key === 'Escape') { e.preventDefault(); close(); return; }
        if (e.key !== 'Tab') return;
        const f = focusables(); if (!f.length) return;
        const a = f[0], z = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    }
    function close() {
        if (!scrim || closing) return;
        const s = scrim, back = opener, done = () => {
            clearTimeout(closing); closing = 0;
            if (bodyKill) bodyKill(); bodyKill = null; s.remove(); scrim = dlg = body = null;
            vr.inert = false; vr.classList.remove('jl-away');
            if (back) back.focus({ preventScroll: true });
            root.dispatchEvent(new CustomEvent('jali:close'));
        };
        if (calm.matches) { done(); return; }
        s.classList.remove('jl-in'); s.classList.add('jl-out');
        closing = setTimeout(done, 260);
    }
    for (const it of items) {
        it.orb.addEventListener('click', () => open(it));
        it.orb.addEventListener('focus', () => ctx.walkTo(it.i));
    }

    return {
        place, tick, close, refresh() { if (view) place(view); },
        points: () => items.map((it) => ({ el: it.orb, x: it.x, y: it.y, z: it.z })),
        look: () => ({ x: px, y: py }),
        destroy() {
            close(); clearTimeout(closing); clearTimeout(flash);
            if (scrim) { scrim.remove(); scrim = null; }
            root.removeEventListener('pointermove', onMove); root.removeEventListener('pointerleave', onLeave);
            root.removeEventListener('pointerenter', onEnter); root.removeEventListener('pointerdown', onDown);
            root.removeEventListener('pointerup', onUp); root.removeEventListener('pointercancel', onUp);
            vr.remove(); ret.remove(); root.classList.remove('jl-gaze');
            for (const p of ['--jl-sun', '--jl-sky', '--jl-warm']) root.style.removeProperty(p);
        },
    };
}
