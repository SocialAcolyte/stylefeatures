/*
 *  LUSTRE-STARS // a rating made of Kashan lustre tiles that catch the light.
 *
 *  Markup (a real radio group; see README):
 *    <fieldset class="ls" data-lustre-stars>
 *      <legend class="ls-legend">How was it?</legend>
 *      <div class="ls-frieze">
 *        <img class="ls-img" src="assets/frieze.webp" alt="" width="2400" height="766">
 *        <input class="ls-in" type="radio" name="rating" value="1" id="r1"><label class="ls-t" for="r1"><span>1 of 5, poor</span></label>
 *        … five of them …
 *      </div>
 *      <output class="ls-say" aria-live="polite"></output>
 *    </fieldset>
 *  Read-only:  <div class="ls ls-read" data-lustre-stars data-value="4.2" role="img" aria-label="Rated 4.2 out of 5">
 *                <div class="ls-frieze"><img class="ls-img" …></div></div>
 *  Or call  lustreStars(root, { tiles, value, distance, lamp })  yourself. It returns destroy().
 *
 *  The picture is one photograph (The Met, DP231256, CC0) of a panel of Kashan lustre tiles,
 *  cut along the tiles' own joints to the bottom row: five eight-pointed stars and the four
 *  crosses that lock between them. Offline (tools/bake.py) every pixel was given a tile id,
 *  a lustre density (where the painter laid the metallic film), and a normal: the tile's
 *  rounded rim from its own outline, the glaze's relief from the photograph, and a tilt of
 *  a degree or two, as each tile was set by hand. All of it is one lossless grayscale PNG, two images stacked (the tilt is TILT, below):
 *
 *    top half     height (1/32 px a step): the normal is its slope, taken here at canvas size
 *    bottom half  tile id in the high nibble (0 none, 1-5 stars, 6-9 crosses), lustre density in the low
 *
 *  A lamp is held by someone standing to the left. Its light reaches as far as the value and
 *  no further: tiles past it stand in the shade. Within its reach each tile is a near-flat
 *  mirror at its own small tilt, so the lamp's reflection is a broad pool that each tile
 *  catches differently. The lustre film throws the lamp back in its own colour, gold or
 *  copper, with a blue-violet sheen round the edge of the pool (a thin metal film's
 *  iridescence); the bare glaze throws back a small white glint; the shadow on the wall
 *  stays as photographed. The lamp follows the pointer (or the phone's tilt turns the wall
 *  under it); the value and the lamp move on critically damped springs.
 *
 *  Draws only while something moves, and only on screen. Reduced motion: the value lands at
 *  once, one still frame. Without JS or WebGL: the photograph, the stars past the choice in a
 *  quiet CSS shade.
 */

const calm = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

// Each tile's box in frieze uv (x0, y0, x1, y1), measured offline (tools/bake.py, geometry.json).
// 1-5: the stars, left to right; 6-9: the crosses, each between star n-5 and n-4.
const TILES = [
    [0.0063, 0.3248, 0.2071, 0.9479],
    [0.2039, 0.3405, 0.4073, 0.9727],
    [0.4039, 0.3149, 0.6064, 0.9711],
    [0.5993, 0.3314, 0.7950, 0.9744],
    [0.7911, 0.3512, 0.9937, 0.9802],
    [0.1087, 0.0190, 0.2989, 0.6430],
    [0.3063, 0.0198, 0.4904, 0.6116],
    [0.5197, 0.0273, 0.6866, 0.6306],
    [0.7106, 0.0471, 0.8868, 0.6537],
];
// where along the value each tile starts to be reached: star k at k-1; a cross half a step
// before the star to its right, so at a whole value the light's edge falls across its middle
const START = [0, 1, 2, 3, 4, 0.5, 1.5, 2.5, 3.5];
// each tile's tilt as set by hand (normal x, y; sigma 0.03, about 1.7 degrees), from the bake
const TILT = [[0.001, 0.0408], [0.0367, -0.0153], [-0.0089, -0.0158], [0.0171, -0.0017], [0.0224, -0.0554],
    [0.047, -0.0029], [0.0204, -0.0041], [-0.0114, 0.0139], [0.0247, -0.0061]];
const WORDS = ['', 'poor', 'fair', 'good', 'very good', 'excellent'];
const TILT_TURN = 0.12;    // radians the wall turns in your hands at full tilt

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
uniform sampler2D uAlb;       // the photograph with its wall shadow, RGBA, at canvas resolution
uniform sampler2D uData;      // normal xy, lustre density, tile id; box-filtered to the same size
uniform vec2 uSize;           // css px
uniform vec3 uEye;            // css px from the frieze's top left; z out of the wall
uniform vec3 uLamp;
uniform float uValue;         // 0..5, eased
uniform float uSoft;          // half-width of the light's edge, in uv
uniform vec4 uBox[9];         // x0, x1, start, -
uniform vec2 uTilt[9];        // each tile's hand-set tilt
uniform vec2 uTiltN;
uniform float uLampK;
varying vec2 vUv;

float lobe(float nh, float w2) { return exp(-(1. - nh) * 2. / w2); }

void main() {
    vec4 a = texture2D(uAlb, vUv);
    vec4 d = texture2D(uData, vUv);
    float id = floor(d.a * 255. / 16. + .5);
    vec3 alb = a.rgb;
    if (id < .5) { gl_FragColor = vec4(alb * a.a, a.a); return; }    // the wall's shadow, as photographed

    // how far the lamp's light reaches into this tile: an edge that sweeps across it as the
    // value passes through the tile's step, soft like the shadow of a door jamb
    float reach = 0.;
    vec2 tilt = vec2(0.);
    for (int i = 0; i < 9; i++) {
        if (abs(float(i + 1) - id) < .5) {
            vec4 b = uBox[i];
            tilt = uTilt[i];
            float f = clamp(uValue - b.z, 0., 1.);
            f += .1 * sin(6.2832 * f);           // by area, not width: a fifth of a star is a fifth of its face
            float edge = mix(b.x - 2. * uSoft, b.y + 2. * uSoft, f);
            reach = 1. - smoothstep(edge - uSoft, edge + uSoft, vUv.x);
        }
    }

    vec2 t = (d.rg * 255. - 128.) / 127. * .5;
    float dens = d.b;
    vec3 P = vec3(vUv * uSize, 0.);
    vec3 N = normalize(vec3(t + tilt + uTiltN, 1.));
    vec3 V = normalize(uEye - P);
    vec3 L = normalize(uLamp - P);
    vec3 H = normalize(L + V);
    float nh = max(dot(N, H), 0.);
    float nl = max(dot(N, L), 0.);
    float lum = max(dot(alb, vec3(.3, .55, .15)), .04);

    // the film: a broad lobe (it is a rough, very thin layer of silver and copper) thrown back
    // in its own colour pushed toward metal, gold where the film is olive or amber, copper
    // where it is red-brown; round the edge of the pool a blue-violet sheen
    vec3 own = alb / lum;
    vec3 metal = mix(vec3(1., .78, .42), own * vec3(1.08, .8, .52), .5);
    float l1 = lobe(nh, .0022);             // the flash: narrower than the tiles' spread of tilt, so some catch
    float l2 = lobe(nh, .012);
    float l3 = lobe(nh, .05);               // and a faint sheen every lit film shows
    vec3 film = metal * (l1 * 1.15 + l3 * .14) + vec3(.5, .58, 1.) * max(l2 - l1, 0.) * .16 * smoothstep(.35, .8, dens);
    // the bare glaze: a small white glint on its own ripples
    float g1 = lobe(nh, .0007);
    vec3 glaze = vec3(1., .97, .9) * g1 * .5;
    // past the light's reach there is no lamp to reflect: no lobe at all, whatever the tilt
    vec3 spec = (film * dens * (.55 + .45 * smoothstep(.15, .6, dens)) + glaze * (1. - dens)) * uLampK * reach * reach;

    // in the lamp's light a tile is the photograph; past its reach, the photograph at half the
    // exposure (the same colours, less light: nothing recoloured)
    vec3 lit = alb * (.98 + .06 * nl);
    vec3 shade = alb * .5;
    vec3 c = mix(shade, lit, reach) + spec;
    // highlights roll off toward white instead of clipping
    vec3 hi = max(c - .78, 0.);
    c = min(c, .78) + .22 * (1. - exp(-hi / .22));
    gl_FragColor = vec4(c * a.a, a.a);
}`;

export function lustreStars(root, opts = {}) {
    const frieze = root && root.querySelector('.ls-frieze');
    const img = frieze && frieze.querySelector('img');
    if (!img) return () => {};
    const num = (k, dflt) => {
        const v = opts[k] ?? root.dataset[k];
        return v == null || v === '' || !isFinite(Number(v)) ? dflt : Number(v);
    };
    const cfg = {
        tiles: opts.tiles || root.dataset.tiles || (img.getAttribute('src') || '').replace(/\.[a-z0-9]+(\?.*)?$/i, '-tiles.png'),
        distance: Math.max(0.8, num('distance', 1.6)),
        lamp: clamp(num('lamp', 1), 0, 2),
    };
    const inputs = [...root.querySelectorAll('input[type="radio"]')];
    const labels = [...root.querySelectorAll('.ls-t')];
    const say = root.querySelector('.ls-say');
    const readOnly = !inputs.length;

    let dead = false, gl = null, canvas = null, prog = null, quad = null, texAlb = null, texData = null;
    let dataImg = null, dataPx = null;
    let W = 0, H = 0, cw = 0, ch = 0;
    let visible = false, raf = 0, last = 0, acc = 0;
    const off = [];
    const on = (t, type, fn, o) => { t.addEventListener(type, fn, o); off.push(() => t.removeEventListener(type, fn, o)); };

    // state: the value and the lamp's aim, each on a critically damped spring
    const chosen = () => { const c = inputs.find((i) => i.checked); return c ? Number(c.value) : 0; };
    let target = readOnly ? clamp(num('value', 0), 0, 5) : chosen();
    let preview = null;                       // a hovered star
    const val = { x: target, v: 0 };
    const aim = { x: 0.5, v: 0, tx: 0.5 };   // where the lamp's reflection is aimed, frieze uv x
    let pointerX = null;                      // the pointer over the frieze, uv x
    let tilt = { x: 0, y: 0, active: false };
    const tiltN = { x: 0, y: 0 };
    let lastKey = '';

    function speak() {
        if (!say) return;
        const v = chosen();
        say.textContent = v ? `${v} of 5, ${WORDS[v]}` : '';
    }

    // ── GL ────────────────────────────────────────────────────────────
    function initGL() {
        gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
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
        for (const n of ['uAlb', 'uData', 'uSize', 'uEye', 'uLamp', 'uValue', 'uSoft', 'uBox', 'uTilt', 'uTiltN', 'uLampK']) prog.u[n] = gl.getUniformLocation(prog, n);
        quad = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        const tex = () => {
            const t = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, t);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            return t;
        };
        texAlb = tex(); texData = tex();
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        return true;
    }

    // the baked data, read once, exactly (no colour management: it was saved without any)
    function readData() {
        const c = document.createElement('canvas');
        c.width = dataImg.naturalWidth; c.height = dataImg.naturalHeight;
        const g = c.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' });
        g.drawImage(dataImg, 0, 0);
        const px = g.getImageData(0, 0, c.width, c.height).data;
        // two images stacked: height on top, tile id | lustre density below (grayscale: take red)
        const n = c.width * (c.height >> 1);
        dataPx = { h: new Uint8Array(n), code: new Uint8Array(n), w: c.width, hgt: c.height >> 1 };
        for (let i = 0; i < n; i++) { dataPx.h[i] = px[i * 4]; dataPx.code[i] = px[(i + n) * 4]; }
    }

    // Box-filter the data down to the canvas once per size: average the normals and the film
    // over each canvas pixel's footprint, keep the tile id that covers most of it. (Sampling the
    // full-size data nearest would alias the glaze's relief into sparkle at small sizes.)
    function resampleData() {
        const sw = dataPx.w, sh = dataPx.hgt;
        const hc = new Float32Array(cw * ch), out = new Uint8Array(cw * ch * 4);
        const fx = sw / cw, fy = sh / ch;
        const cnt = new Float32Array(10);
        for (let y = 0; y < ch; y++) {
            const y0 = Math.floor(y * fy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * fy));
            for (let x = 0; x < cw; x++) {
                const x0 = Math.floor(x * fx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * fx));
                let hh = 0, b = 0, n = 0, all = 0;
                cnt.fill(0);
                for (let yy = y0; yy < y1; yy++) {
                    let i = yy * sw + x0;
                    for (let xx = x0; xx < x1; xx++, i++) {
                        const code = dataPx.code[i], id = code >> 4;
                        cnt[id]++; hh += dataPx.h[i]; all++;
                        if (id) { b += code & 15; n++; }
                    }
                }
                let best = 0;
                for (let k = 1; k < 10; k++) if (cnt[k] > cnt[best]) best = k;
                if (cnt[0] > all * 0.6) best = 0;
                const o = y * cw + x;
                hc[o] = hh / all / 32;                            // in source px
                out[o * 4 + 2] = n ? (b / n) * 17 + 0.5 : 0;
                out[o * 4 + 3] = best * 16;
            }
        }
        // the normal is the height's slope (per source px), as the bake had it
        for (let y = 0; y < ch; y++) {
            const ya = Math.max(0, y - 1), yb = Math.min(ch - 1, y + 1);
            for (let x = 0; x < cw; x++) {
                const xa = Math.max(0, x - 1), xb = Math.min(cw - 1, x + 1), o = y * cw + x;
                const nx = -(hc[y * cw + xb] - hc[y * cw + xa]) / ((xb - xa) * fx);
                const ny = -(hc[yb * cw + x] - hc[ya * cw + x]) / ((yb - ya) * fy);
                out[o * 4] = Math.max(1, Math.min(255, Math.round(128 + clamp(nx, -0.5, 0.5) / 0.5 * 127)));
                out[o * 4 + 1] = Math.max(1, Math.min(255, Math.round(128 + clamp(ny, -0.5, 0.5) / 0.5 * 127)));
            }
        }
        gl.bindTexture(gl.TEXTURE_2D, texData);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, cw, ch, 0, gl.RGBA, gl.UNSIGNED_BYTE, out);
    }

    function layout() {
        const r = frieze.getBoundingClientRect();
        W = Math.max(1, r.width); H = Math.max(1, r.height);
        // DPR capped at 2, and never finer than the photograph
        const dpr = Math.min(devicePixelRatio || 1, 2, img.naturalWidth / W, dataImg.naturalWidth / W);
        cw = canvas.width = Math.max(1, Math.round(W * dpr));
        ch = canvas.height = Math.max(1, Math.round(H * dpr));
        const c = document.createElement('canvas');
        c.width = cw; c.height = ch;
        const g = c.getContext('2d');
        g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
        g.drawImage(img, 0, 0, cw, ch);
        gl.bindTexture(gl.TEXTURE_2D, texAlb);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);   // straight alpha
        resampleData();
        lastKey = '';
    }

    // ── draw ──────────────────────────────────────────────────────────
    function geometry() {
        const r = frieze.getBoundingClientRect();
        const D = cfg.distance * 1.2 * W;      // in proportion to the frieze, so a phone's pool is a desktop's
        // the eye stands in front of the frieze, drawn a little toward the middle of the screen,
        // so the sheen slides as the page scrolls past; tilting a phone leans it
        const ex = W / 2 + (innerWidth / 2 - (r.left + W / 2)) * 0.25;
        const ey = H / 2 + (innerHeight / 2 - (r.top + H / 2)) * 0.25;
        // the lamp stands opposite the eye about the point it is aimed at, so its reflection
        // pool falls there (at the same distance out, the mirror point is halfway between)
        const tx = aim.x * W, ty = H * 0.62;
        return { D, ex, ey, lx: 2 * tx - W / 2, ly: 2 * ty - H / 2 - H * 0.35 };
    }

    function draw() {
        const g = geometry();
        gl.viewport(0, 0, cw, ch);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(prog);
        const u = prog.u;
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texAlb); gl.uniform1i(u.uAlb, 0);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texData); gl.uniform1i(u.uData, 1);
        gl.uniform2f(u.uSize, W, H);
        gl.uniform3f(u.uEye, g.ex, g.ey, g.D);
        gl.uniform3f(u.uLamp, g.lx, g.ly, g.D);
        gl.uniform1f(u.uValue, val.x);
        gl.uniform1f(u.uSoft, 0.011);
        const box = new Float32Array(36);
        TILES.forEach((b, i) => { box[i * 4] = b[0]; box[i * 4 + 1] = b[2]; box[i * 4 + 2] = START[i]; });
        gl.uniform4fv(u.uBox, box);
        gl.uniform2fv(u.uTilt, TILT.flat());
        gl.uniform2f(u.uTiltN, tiltN.x, tiltN.y);
        gl.uniform1f(u.uLampK, cfg.lamp);
        gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    // where the lamp is aimed when nobody points: the middle of what it reaches
    function restAim(v) {
        if (v <= 0) return 0.08;
        const k = Math.min(5, Math.ceil(v)) - 1;
        const right = TILES[k][0] + (TILES[k][2] - TILES[k][0]) * (v - k);
        return clamp(right * 0.55, 0.08, 0.6);
    }

    // ── loop: fixed 120 Hz steps, critically damped springs ───────────
    const STEP = 1 / 120;
    const W_VAL = 2 * Math.PI / 0.42;     // settles in about a third of a second
    const W_AIM = 2 * Math.PI / 0.6;
    function spring(s, to, w, dt) {
        const a = -w * w * (s.x - to) - 2 * w * s.v;
        s.v += a * dt; s.x += s.v * dt;
    }
    function frame(t) {
        raf = 0;
        if (dead || !gl || gl.isContextLost() || !visible) { last = 0; return; }
        const dt = last ? Math.min(0.05, (t - last) / 1000) : 1 / 60;
        last = t;
        const want = preview ?? target;
        const lit = (preview ?? target);
        aim.tx = pointerX != null ? clamp(pointerX, 0.04, Math.max(0.1, restAim(lit) / 0.55)) : restAim(lit);
        acc += dt;
        while (acc >= STEP) {
            spring(val, want, W_VAL, STEP);
            spring(aim, aim.tx, W_AIM, STEP);
            acc -= STEP;
        }
        if (tilt.active) {
            const k = 1 - Math.exp(-dt / 0.12);
            tiltN.x += (tilt.x * TILT_TURN - tiltN.x) * k;
            tiltN.y += (tilt.y * TILT_TURN - tiltN.y) * k;
        }
        const moving = Math.abs(val.x - want) > 0.002 || Math.abs(val.v) > 0.01
            || Math.abs(aim.x - aim.tx) > 0.001 || Math.abs(aim.v) > 0.005
            || (tilt.active && Math.abs(tilt.x * TILT_TURN - tiltN.x) + Math.abs(tilt.y * TILT_TURN - tiltN.y) > 0.0005);
        const r = frieze.getBoundingClientRect();
        const key = [val.x, aim.x, r.left, r.top, W, H, tiltN.x * 100, tiltN.y * 100].map((x) => x.toFixed(3)).join();
        if (key !== lastKey) { draw(); lastKey = key; }
        if (moving) raf = requestAnimationFrame(frame);
        else { last = 0; acc = 0; }
    }
    function kick() {
        if (calm.matches) { still(); return; }
        if (!raf && visible && gl && !dead) raf = requestAnimationFrame(frame);
    }
    // Reduced motion: the value lands at once; the lamp is aimed at the middle of its reach
    function still() {
        if (!gl || dead) return;
        val.x = preview ?? target; val.v = 0;
        aim.x = aim.tx = restAim(val.x); aim.v = 0;
        tiltN.x = tiltN.y = 0;
        draw();
    }

    // ── input ─────────────────────────────────────────────────────────
    function bindInputs() {
        on(root, 'change', () => { target = chosen(); speak(); kick(); });
        labels.forEach((lab, i) => {
            on(lab, 'pointerenter', (e) => { if (e.pointerType !== 'touch') { preview = i + 1; kick(); } });
        });
        on(frieze, 'pointermove', (e) => {
            if (e.pointerType === 'touch' || calm.matches) return;
            const r = frieze.getBoundingClientRect();
            pointerX = (e.clientX - r.left) / r.width;
            kick();
        }, { passive: true });
        on(frieze, 'pointerleave', () => { preview = null; pointerX = null; kick(); });
        // keyboard focus previews nothing: arrows change the checked radio, which is the value
    }

    // ── start ─────────────────────────────────────────────────────────
    let io = null, ro = null, sizeTimer = 0;
    async function start() {
        if (!readOnly) { speak(); bindInputs(); }
        try { await img.decode(); } catch (e) { if (!img.complete || !img.naturalWidth) await new Promise((res) => img.addEventListener('load', res, { once: true })); }
        if (dead || !img.naturalWidth) return;
        try {
            dataImg = await new Promise((res, rej) => {
                const im = new Image();
                im.decoding = 'async';
                im.onload = () => res(im); im.onerror = rej;
                im.src = new URL(cfg.tiles, document.baseURI).href;
            });
        } catch (e) { return; }        // no data: the photograph stays, with its CSS shade
        if (dead) return;
        canvas = document.createElement('canvas');
        canvas.className = 'ls-canvas';
        canvas.setAttribute('aria-hidden', 'true');
        try {
            if (!initGL()) throw new Error('no webgl');
            readData();
            frieze.insertBefore(canvas, img.nextSibling);
            layout();
        } catch (e) {
            if (canvas) canvas.remove();
            canvas = null; gl = null;
            return;
        }
        on(canvas, 'webglcontextlost', (e) => { e.preventDefault(); cancelAnimationFrame(raf); raf = 0; root.classList.remove('is-live'); });
        on(canvas, 'webglcontextrestored', () => {
            try { if (initGL()) { layout(); root.classList.add('is-live'); still(); kick(); } } catch (e) { /* the photograph stays */ }
        });
        aim.x = aim.tx = restAim(val.x);
        draw();
        root.classList.add('is-live');

        on(window, 'scroll', () => { if (!calm.matches) kick(); }, { passive: true });
        on(window, 'deviceorientation', () => { if (tilt.active && !calm.matches) kick(); }, { passive: true });
        on(document, 'visibilitychange', () => { if (!document.hidden) { last = 0; kick(); } });
        on(calm, 'change', () => { lastKey = ''; calm.matches ? still() : kick(); });
        import('./tilt.js').then((m) => { tilt = m.default; }).catch(() => {});

        io = new IntersectionObserver((en) => {
            visible = en[0].isIntersecting;
            if (visible) { last = 0; lastKey = ''; kick(); }
        }, { rootMargin: '80px' });
        io.observe(frieze);
        let w0 = W, h0 = H;
        ro = new ResizeObserver(() => {
            const r = frieze.getBoundingClientRect();
            if (Math.abs(r.width - w0) < 1 && Math.abs(r.height - h0) < 1) return;
            clearTimeout(sizeTimer);
            sizeTimer = setTimeout(() => {
                if (dead || !gl) return;
                layout(); w0 = W; h0 = H;
                draw(); kick();
            }, 150);
        });
        ro.observe(frieze);
    }
    start();

    const api = function destroy() {
        dead = true;
        cancelAnimationFrame(raf);
        clearTimeout(sizeTimer);
        off.forEach((f) => f());
        if (io) io.disconnect();
        if (ro) ro.disconnect();
        if (gl) { const x = gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); }
        if (canvas) canvas.remove();
        root.classList.remove('is-live');
    };
    // for stills and tests: hold a value (as if hovered) and aim the lamp; advance() steps time
    api.hold = (v, x) => { preview = v == null ? null : clamp(v, 0, 5); pointerX = x == null ? null : x; kick(); };
    api.set = (v) => { if (readOnly) { target = clamp(v, 0, 5); kick(); } };
    root.lustreStars = api;
    return api;
}

// Auto-start every [data-lustre-stars], each once it comes near the viewport.
function autoStart(el) {
    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((en) => {
        if (!en[0].isIntersecting) return;
        io.disconnect();
        lustreStars(el);
    }, { rootMargin: '600px' });
    io.observe(el);
}
document.querySelectorAll('[data-lustre-stars]').forEach(autoStart);
