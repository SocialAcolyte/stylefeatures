/*
 *  KONGQUE-LIGHT // the Peacock Room's gold, relit (after components/gold-ground and lustre-stars).
 *
 *  Markup:  <figure class="kl" data-kongque-light data-origin=".47 .52">
 *             <img src="assets/room/mural-1400.webp" data-full="assets/room/mural.webp" alt="…">
 *           </figure>
 *  The light data sits beside each image as <name>-gold.png (tools/gold_bake.py). Or call
 *  goldLight(figure, { gold, origin, distance, light }) yourself; it returns destroy(), which
 *  also carries zoom(z) (the magnification, eased; the img follows through the --z property),
 *  aim(x, y) (hold the light at a point in the figure, 0..1; aim() lets go) and advance(s).
 *  data-sharp (default 1) tightens and heats the flash; data-deep (.28) is how far gold not catching sits below the
 *  photograph; data-rest ".3 .22" is where the lamp stands with no pointer (and under reduced motion); data-sweep
 *  carries a lamp once across the figure, slowly, the first time it comes into view.
 *
 *  Whistler painted the room in Prussian blue and gold: gold leaf on the shutters, the shelves
 *  and the ceiling's ribs, gold paint for the peacocks of the mural. The photograph is the colour.
 *  Offline each photograph was given a gold mask (from its colour) and a normal (the paint's rim
 *  where it stands proud of the ground, its brushwork and the leaf's surface from the photograph's
 *  own fine detail, and a slow wander of a degree or two, as leaf never lies flat), packed in one
 *  lossless PNG:
 *
 *    R, G  the normal's x and y (128 = straight out, +-127 = +-0.5)
 *    B     gold (0 = the ground, lacquer, porcelain; 255 = gold)
 *
 *  A lamp is carried by the pointer (or held up and to the left of the wall; the phone's tilt
 *  turns the wall under it) and the eye is at the middle of the screen, so scrolling moves the
 *  eye. Gold reflects the lamp as a warm lobe in its own colour, near white at the peak, and gold
 *  not catching it sits a little deeper than the photograph's flash. The blue ground stays matte,
 *  with a faint broad sheen. Nothing is recoloured: away from the light the picture is the photograph.
 *
 *  Draws only while something moves (pointer, scroll, tilt, the lamp easing, the zoom easing) and
 *  only on screen: zero frames idle. Reduced motion: one still frame, the lamp fixed. Without JS or
 *  WebGL, or if the data fails: the photograph.
 */
const calm = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const TILT_TURN = 0.3;

const VERT = `
attribute vec2 p;
varying vec2 vUv;
void main() { vUv = vec2(p.x * .5 + .5, .5 - p.y * .5); gl_Position = vec4(p, 0., 1.); }`;

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uAlb;      // the photograph
uniform sampler2D uData;     // normal xy, gold
uniform vec2 uSize;          // the figure, css px
uniform float uZoom;         // the magnification, about uOrigin (as the img's CSS transform)
uniform vec2 uOrigin;
uniform vec3 uEye;           // css px from the figure's top left; z out of the wall
uniform vec3 uLamp;
uniform vec2 uTiltN;
uniform float uK;            // the lamp's strength
uniform float uSharp;        // 1 = the room's general gold; above 1, a tighter, hotter flash (leaf that blazes)
uniform float uDeep;         // how far gold not catching sits below the photograph (0..1)
varying vec2 vUv;

float lobe(float nh, float w2) { return exp(-(1. - nh) * 2. / w2); }

void main() {
    vec2 uv = uOrigin + (vUv - uOrigin) / uZoom;
    vec3 alb = texture2D(uAlb, uv).rgb;
    vec3 d = texture2D(uData, uv).rgb;
    float g = d.b;
    vec2 t = (d.rg * 255. - 128.) / 127. * .5 * sqrt(uZoom);   // magnified, the relief reads a little stronger
    vec3 P = vec3(vUv * uSize, 0.);
    vec3 N = normalize(vec3(t + uTiltN, 1.));
    vec3 V = normalize(uEye - P);
    vec3 L = normalize(uLamp - P);
    vec3 H = normalize(L + V);
    float nh = max(dot(N, H), 0.);
    float nl = max(dot(N, L), 0.);

    // gold: the lamp thrown back in the gold's own colour (leaf and paint are warm, brassier where
    // the photograph is greener), a tight flash and a broader glow; near white at the peak
    float lum = max(dot(alb, vec3(.3, .55, .15)), .05);
    vec3 own = alb / lum;
    vec3 metal = mix(vec3(1., .8, .5), own * vec3(1.05, .86, .6), .45);
    float l1 = lobe(nh, .006 / uSharp);
    float l2 = lobe(nh, .045 / sqrt(uSharp));
    vec3 spec = metal * (l1 * 1.25 * uSharp + l2 * .5);
    // gold not catching the lamp sits deeper than the flash-lit photograph: leaf is dark off the mirror angle
    vec3 goldC = alb * (1. - uDeep + .14 * nl) + spec * uK;
    // the ground: matte paint on leather, a faint broad sheen and nothing more
    vec3 groundC = alb + vec3(.85, .92, 1.) * lobe(nh, .09) * .03 * uK;
    vec3 c = mix(groundC, goldC, g);
    vec3 hi = max(c - .8, 0.);
    c = min(c, .8) + .2 * (1. - exp(-hi / .2));
    gl_FragColor = vec4(c, 1.);
}`;

export function goldLight(root, opts = {}) {
    const img = root && root.querySelector('img');
    if (!img) return () => {};
    const ds = root.dataset;
    const num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
    const org = String(opts.origin ?? ds.origin ?? '.5 .5').split(/[\s,]+/).map(Number);
    const cfg = {
        gold: opts.gold ?? ds.gold,
        origin: [num(org[0], .5), num(org[1], .5)],
        distance: Math.max(.6, num(opts.distance ?? ds.distance, 1.4)),
        light: clamp(num(opts.light ?? ds.light, 1), 0, 2),
        sharp: clamp(num(opts.sharp ?? ds.sharp, 1), .5, 4),
        deep: clamp(num(opts.deep ?? ds.deep, .28), 0, .7),
        sweep: (opts.sweep ?? ds.sweep) != null && (opts.sweep ?? ds.sweep) !== false && (opts.sweep ?? ds.sweep) !== 'false',
        rest: String(opts.rest ?? ds.rest ?? '.3 .22').split(/[\s,]+/).map(Number),
    };
    let dead = false, gl = null, gl2 = false, canvas = null, prog = null, quad = null, texAlb = null, texData = null;
    let W = 0, H = 0, cw = 0, ch = 0, visible = false, raf = 0, last = 0, lastKey = '', srcKey = '';
    const off = [];
    const on = (t, e, f, o) => { t.addEventListener(e, f, o); off.push(() => t.removeEventListener(e, f, o)); };

    const zoom = { x: 1, v: 0, to: 1 };
    const REST = [num(cfg.rest[0], .3), num(cfg.rest[1], .22)];
    const lamp = { x: REST[0], y: REST[1], tx: REST[0], ty: REST[1] };      // in figure units
    // data-sweep: the first time the figure comes into view, a lamp is carried once slowly across it
    let sweep = null;               // { t0 } while it runs
    const SWEEP_S = 3.2;
    let pointer = null, held = null;
    let tilt = { x: 0, y: 0, active: false };
    const tiltN = { x: 0, y: 0 };

    function initGL() {
        const o = { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false };
        gl = canvas.getContext('webgl2', o);
        gl2 = !!gl;
        if (!gl) gl = canvas.getContext('webgl', o);
        if (!gl) return false;
        const sh = (type, src) => {
            const s = gl.createShader(type);
            gl.shaderSource(s, src); gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; }
            return s;
        };
        const vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG);
        if (!vs || !fs) return false;
        prog = gl.createProgram();
        gl.attachShader(prog, vs); gl.attachShader(prog, fs);
        gl.bindAttribLocation(prog, 0, 'p');
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
        prog.u = {};
        for (const n of ['uAlb', 'uData', 'uSize', 'uZoom', 'uOrigin', 'uEye', 'uLamp', 'uTiltN', 'uK', 'uSharp', 'uDeep']) prog.u[n] = gl.getUniformLocation(prog, n);
        quad = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        texAlb = gl.createTexture(); texData = gl.createTexture();
        return true;
    }
    // upload an image; with WebGL2, mipmapped, so a large photograph shown small stays calm
    function upload(t, im, data) {
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, data ? gl.NONE : gl.BROWSER_DEFAULT_WEBGL);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        if (gl2) { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); }
        else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }
    const loadImage = (src) => new Promise((res, rej) => { const i = new Image(); i.decoding = 'async'; i.onload = () => res(i); i.onerror = rej; i.src = src; });
    const goldFor = (src) => cfg.gold && !img.dataset.full ? cfg.gold : src.replace(/\.[a-z0-9]+(\?.*)?$/i, '-gold.png');

    // the photograph and its data, for whichever image the <img> shows now (the small one, then the full one)
    async function textures() {
        const src = img.currentSrc || img.src;
        if (src === srcKey) return;
        try { await img.decode(); } catch (e) { /* drawn when it loads */ }
        if (dead || !img.naturalWidth) return;
        const max = gl.getParameter(gl.MAX_TEXTURE_SIZE);
        if (img.naturalWidth > max || img.naturalHeight > max) throw new Error('too large');
        const data = await loadImage(new URL(goldFor(src), document.baseURI).href);
        if (dead || (img.currentSrc || img.src) !== src) return;
        upload(texAlb, img, false);
        upload(texData, data, true);
        srcKey = src; lastKey = '';
        root.classList.add('kl-live');
        if (calm.matches) still(); else kick();
    }

    function layout() {
        const r = root.getBoundingClientRect();
        W = Math.max(1, r.width); H = Math.max(1, r.height);
        const dpr = Math.min(devicePixelRatio || 1, 2);
        cw = canvas.width = Math.max(1, Math.round(W * dpr));
        ch = canvas.height = Math.max(1, Math.round(H * dpr));
        lastKey = '';
    }

    function geometry() {
        const r = root.getBoundingClientRect();
        const D = cfg.distance * Math.max(innerWidth, W);
        // the eye at the middle of the screen (so the light slides as the page scrolls past)
        const ex = innerWidth / 2 - r.left, ey = innerHeight / 2 - r.top;
        // the lamp is held near the wall, a third of the way out: its pool falls near it
        return { D, ex, ey, lx: lamp.x * W, ly: lamp.y * H, lz: D * .32 };
    }
    function draw() {
        if (!gl || !srcKey) return;
        const g = geometry();
        gl.viewport(0, 0, cw, ch);
        gl.useProgram(prog);
        const u = prog.u;
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texAlb); gl.uniform1i(u.uAlb, 0);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texData); gl.uniform1i(u.uData, 1);
        gl.uniform2f(u.uSize, W, H);
        gl.uniform1f(u.uZoom, zoom.x);
        gl.uniform2f(u.uOrigin, cfg.origin[0], cfg.origin[1]);
        gl.uniform3f(u.uEye, g.ex, g.ey, g.D);
        gl.uniform3f(u.uLamp, g.lx, g.ly, g.lz);
        gl.uniform2f(u.uTiltN, tiltN.x, tiltN.y);
        gl.uniform1f(u.uK, cfg.light);
        gl.uniform1f(u.uSharp, cfg.sharp);
        gl.uniform1f(u.uDeep, cfg.deep);
        gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    // ── motion: the lamp eases to the pointer; the zoom on a critically damped spring ──
    const STEP = 1 / 120, WZ = 2 * Math.PI / .7;
    let acc = 0;
    function sweepAt(t) {
        // left to right, a little above the middle, easing in and out; a gentle rise and fall
        const f = clamp((t - sweep.t0) / 1000 / SWEEP_S, 0, 1), e = f * f * (3 - 2 * f);
        return [-.08 + 1.16 * e, .42 - .12 * Math.sin(Math.PI * e)];
    }
    function target(t) {
        if (held) return held;
        if (sweep) {
            if (!pointer && (t ?? performance.now()) - sweep.t0 < SWEEP_S * 1000) return sweepAt(t ?? performance.now());
            sweep = null;
        }
        if (pointer) {
            const r = root.getBoundingClientRect();
            return [(pointer.x - r.left) / W, (pointer.y - r.top) / H];
        }
        return REST;
    }
    function setZoomStyle() { root.style.setProperty('--z', zoom.x.toFixed(4)); }
    function frame(t) {
        raf = 0;
        if (dead || !gl || gl.isContextLost()) { last = 0; return; }
        const dt = last ? Math.min(.05, (t - last) / 1000) : 1 / 60;
        last = t;
        const [tx, ty] = target(t);
        lamp.tx = tx; lamp.ty = ty;
        const k = 1 - Math.exp(-dt / .12);
        lamp.x += (tx - lamp.x) * k; lamp.y += (ty - lamp.y) * k;
        acc += dt;
        while (acc >= STEP) { zoom.v += (-WZ * WZ * (zoom.x - zoom.to) - 2 * WZ * zoom.v) * STEP; zoom.x += zoom.v * STEP; acc -= STEP; }
        if (tilt.active) {
            const kt = 1 - Math.exp(-dt / .12);
            tiltN.x += (tilt.x * TILT_TURN - tiltN.x) * kt; tiltN.y += (tilt.y * TILT_TURN - tiltN.y) * kt;
        }
        const zMoving = Math.abs(zoom.x - zoom.to) > 2e-4 || Math.abs(zoom.v) > 2e-3;
        if (!zMoving) { zoom.x = zoom.to; zoom.v = 0; }
        setZoomStyle();
        const moving = zMoving || !!sweep || Math.abs(lamp.x - tx) + Math.abs(lamp.y - ty) > 5e-4
            || (tilt.active && Math.abs(tilt.x * TILT_TURN - tiltN.x) + Math.abs(tilt.y * TILT_TURN - tiltN.y) > 5e-4);
        const r = root.getBoundingClientRect();
        const key = [zoom.x * 1e3, lamp.x * 1e3, lamp.y * 1e3, r.left, r.top, W, H, tiltN.x * 1e3, tiltN.y * 1e3].map((x) => x.toFixed(1)).join();
        if (visible && key !== lastKey) { draw(); lastKey = key; }
        if (moving && visible && !document.hidden) raf = requestAnimationFrame(frame);
        else { last = 0; acc = 0; if (!moving) return; }
    }
    function kick() {
        if (dead) return;
        if (calm.matches) { still(); return; }
        if (!raf && gl) raf = requestAnimationFrame(frame);
    }
    // reduced motion: the zoom lands at once, the lamp stands still, one frame
    function still() {
        zoom.x = zoom.to; zoom.v = 0; setZoomStyle();
        const [tx, ty] = held || REST;
        lamp.x = lamp.tx = tx; lamp.y = lamp.ty = ty;
        tiltN.x = tiltN.y = 0;
        if (gl && visible) draw();
    }

    let io = null, ro = null, swept = false;
    async function start() {
        canvas = document.createElement('canvas');
        canvas.className = 'kl-canvas';
        canvas.setAttribute('aria-hidden', 'true');
        try { if (!initGL()) throw new Error('no webgl'); } catch (e) { canvas = null; gl = null; return; }
        root.appendChild(canvas);
        layout();
        try { await textures(); } catch (e) { canvas.remove(); canvas = null; gl = null; root.classList.remove('kl-live'); return; }
        on(img, 'load', () => { textures().catch(() => {}); });
        on(canvas, 'webglcontextlost', (e) => { e.preventDefault(); cancelAnimationFrame(raf); raf = 0; root.classList.remove('kl-live'); });
        on(canvas, 'webglcontextrestored', () => { if (initGL()) { srcKey = ''; textures().catch(() => {}); } });
        on(window, 'pointermove', (e) => {
            if (e.pointerType === 'touch' || calm.matches) return;
            pointer = { x: e.clientX, y: e.clientY }; if (visible) kick();
        }, { passive: true });
        on(document.documentElement, 'pointerleave', () => { pointer = null; kick(); });
        on(window, 'scroll', () => { if (visible && !calm.matches) kick(); }, { passive: true });
        on(window, 'deviceorientation', () => { if (tilt.active && visible && !calm.matches) kick(); }, { passive: true });
        on(document, 'visibilitychange', () => { if (!document.hidden) { last = 0; kick(); } });
        on(calm, 'change', () => { lastKey = ''; calm.matches ? still() : kick(); });
        import('./tilt.js').then((m) => { tilt = m.default; }).catch(() => {});
        io = new IntersectionObserver((en) => {
            visible = en[0].isIntersecting;
            if (!visible) return;
            lastKey = '';
            // the first time it is well in view, carry a lamp across it once, so the gold is seen to be gold
            if (cfg.sweep && !swept && !calm.matches && en[0].intersectionRatio > .45) { swept = true; sweep = { t0: performance.now() }; lamp.x = -.08; lamp.y = .42; }
            calm.matches ? still() : kick();
        }, { rootMargin: '0px', threshold: [0, .45] });
        io.observe(root);
        ro = new ResizeObserver(() => { if (!gl) return; layout(); calm.matches ? still() : kick(); });
        ro.observe(root);
    }
    start();

    const api = function destroy() {
        dead = true;
        cancelAnimationFrame(raf);
        off.forEach((f) => f());
        if (io) io.disconnect();
        if (ro) ro.disconnect();
        if (gl) { const x = gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); }
        if (canvas) canvas.remove();
        root.classList.remove('kl-live');
        root.style.removeProperty('--z');
    };
    api.zoom = (z) => { zoom.to = Math.max(1, Number(z) || 1); if (!gl) { zoom.x = zoom.to; setZoomStyle(); } else kick(); };
    api.aim = (x, y) => { held = x == null ? null : [x, y]; kick(); };
    api.advance = (s) => {
        for (let i = 0, n = Math.round(s * 120); i < n; i++) {
            zoom.v += (-WZ * WZ * (zoom.x - zoom.to) - 2 * WZ * zoom.v) * STEP; zoom.x += zoom.v * STEP;
            const [tx, ty] = target(); const k = 1 - Math.exp(-STEP / .12);
            lamp.x += (tx - lamp.x) * k; lamp.y += (ty - lamp.y) * k;
        }
        setZoomStyle(); if (gl) draw();
    };
    root.goldLight = api;
    return api;
}

document.querySelectorAll('[data-kongque-light]').forEach((el) => goldLight(el));
