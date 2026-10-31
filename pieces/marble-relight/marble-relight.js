/*
 *  MARBLE-RELIGHT // a marble head on the page, lit by a candle you carry.
 *
 *  Markup:  <figure data-marble-relight data-height="472" data-thick="915"
 *                   data-albedo="assets/athlete-albedo.webp"
 *                   data-normal="assets/athlete-normal.png"
 *                   data-aux="assets/athlete-aux.png">
 *             <img src="assets/athlete.webp" alt="">
 *           </figure>
 *  Or call  marbleRelight(figure, { albedo, normal, aux, height, thick, light, cast, muted, reach })
 *  It returns destroy().
 *
 *  In a museum at night a guard's torch passes over a statue and it comes
 *  alive: the eye sockets fill with shadow, the cheekbone catches, and at the
 *  thin places (the ear, the nose, the tips of the curls) the stone glows
 *  through, because marble lets light in. That glow is what makes marble read
 *  as marble and not plaster. Here the pointer carries the candle (on a phone,
 *  the tilt of the phone and a sideways drag).
 *
 *  Offline, one evenly lit photograph became three maps (see the README):
 *    albedo   the photo with its studio light divided out (alpha = the cut-out)
 *    normal   r g = surface normal, b = height (texels; data-height is its range)
 *    aux      r g = a wide, blurred normal (what light under the skin of the
 *             stone sees), b = thickness along the view (data-thick), a = polish
 *
 *  Two passes, two canvases:
 *    head     albedo x (warm candle, wrapped and per channel: red sees the wide
 *             normal, blue the sharp one, so the terminator is soft and warm,
 *             as light spreads a few millimetres under the surface)
 *             + light carried through the stone: a warm glow under shadows,
 *             and out through thin parts (thickness map x light direction)
 *             + cool dim room light, the candle's bounce, and a faint polish
 *             where the stone was polished. Self-shadows from 40 steps of a
 *             narrow cone toward the candle through the height field.
 *    cast     on the paper: the head's soft shadow, dark where it leaves the
 *             stone, softening and fading with distance; drawn at low
 *             resolution because it is soft anyway.
 *
 *  The candle eases after the pointer like a light in a hand, and flickers a
 *  little while it is moving; held still in still air it steadies, and the loop
 *  stops. Nothing runs off screen or in a hidden tab.
 */

const calm = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const RAD = Math.PI / 180;
const EL_MIN = -5, EL_MAX = 66;  // degrees: from level with the paper beside the head (behind its front) to nearly frontal
const STIFF = 4.6;               // spring rate (1/s): a hand-held candle's lag
const DIST = 1.25;               // the candle's distance from the head's centre, in head heights

const VERT = `
attribute vec2 p;
varying vec2 vUv;
void main() { vUv = vec2(p.x * .5 + .5, .5 - p.y * .5); gl_Position = vec4(p, 0., 1.); }`;

const HEAD = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uAlb;     // albedo (straight alpha; colour carried past the edge); a = the cut-out
uniform sampler2D uNrm;     // rg normal, b height
uniform sampler2D uAux;     // rg wide normal, b thickness, a polish (.5 + .5p)
uniform vec2 uTex;          // normal map size, texels
uniform float uZ;           // height range, texels
uniform float uThick;       // thickness range, texels
uniform vec3 uLp;           // the candle, texels (x right, y down, z out of the page)
uniform float uDl;          // its distance from the head's centre
uniform vec3 uLamp;
uniform vec3 uAmb;
uniform float uMuted;
uniform float uEll;         // how far red light travels in the stone, texels
uniform float uPen;         // the candle's angular size: shadow penumbra per texel of distance
uniform float uLod;         // screen pixels per texel (mip bias is relative to the screen)
varying vec2 vUv;

float ign(vec2 q) { return fract(52.9829189 * fract(dot(q, vec2(.06711056, .00583715)))); }
// filmic shoulder on the luminance (so a hot highlight stays warm cream rather
// than bleaching to white): linear to a knee, then 1 - e^-x up to a ceiling
// below the paper's own white
float tone(float y) { const float k = .5, m = .8; return y < k ? y : k + (m - k) * (1. - exp(-(y - k) / (m - k))); }
vec3 shoulder(vec3 c) {
    float y = max(dot(c, vec3(.2126, .7152, .0722)), 1e-5);
    float yt = tone(y);
    c *= yt / y;
    c = mix(c, vec3(yt), .3 * smoothstep(.3, .75, yt));   // highlights go cream, not orange
    return min(c, .78 + .22 * (1. - exp(-max(c - .78, 0.) / .22)));
}
vec3 unpack(vec2 v) { vec3 n = vec3(v * 2. - 1., 0.); n.z = sqrt(max(1. - dot(n.xy, n.xy), 0.)); return n; }

void main() {
    vec2 uv = vUv;
    vec4 a = texture2D(uAlb, uv);
    vec3 t3 = texture2D(uNrm, uv).rgb;
    vec4 ax = texture2D(uAux, uv);
    float hb = texture2D(uNrm, uv, 4.).b * uZ;     // a blurred height (a lower mip): cavities
    if (a.a < .004) { gl_FragColor = vec4(0.); return; }

    vec3 alb = pow(a.rgb, vec3(2.2));
    float lum = dot(alb, vec3(.2126, .7152, .0722));
    alb = mix(alb, vec3(lum), uMuted);
    vec3 n = unpack(t3.xy);
    vec3 nw = unpack(ax.xy);
    float thick = ax.z * uThick;
    float polish = clamp(ax.w * 2. - 1., 0., 1.);
    vec3 P = vec3(uv * uTex, t3.z * uZ);

    vec3 v = uLp - P;
    float dist = length(v);
    vec3 L = v / dist;
    float hd = max(length(v.xy), 1.);
    vec2 dir = v.xy / hd;
    float tanEl = v.z / hd;
    // a candle close by: the near side of the head gets much more of it
    float fall = pow(uDl / dist, 1.8);
    fall = 2.4 * (1. - exp(-fall / 2.4));      // and softly limited when it is very close

    // march toward the candle through the height field: how far below the
    // horizon it is (shadow), and how much stone the ray passes through (glow)
    float jit = ign(gl_FragCoord.xy);
    float occ = 0.;
    float t = .7 * pow(1.2, jit);   // jittered by one whole step, in log space
    vec2 st = dir / uTex;
    for (int i = 0; i < 40; i++) {
        float on = step(t, hd);              // not past the candle (no break: keeps the derivatives)
        // a narrow cone, not a ray: further out a slightly coarser mip, so thin
        // features cannot alias into streaks along the light
        float hs = texture2D(uNrm, uv + st * t, clamp(log2(max(1., uPen * t * uLod)), 0., 1.5)).b * uZ;
        float z = P.z + t * tanEl;
        occ = max(occ, on * (hs - z - 2.5) / (uPen * t + 4.));
        t *= 1.2;
    }

    // diffuse, wrapped and per channel: light that spreads under the surface
    // rounds the terminator off, red most
    vec3 nr = normalize(mix(n, nw, .55));
    vec3 ng = normalize(mix(n, nw, .25));
    vec3 ndl = vec3(dot(nr, L), dot(ng, L), dot(n, L));
    vec3 wrapW = vec3(.22, .13, .07);
    vec3 dif = max((ndl + wrapW) / (1. + wrapW), 0.);
    vec3 sh = 1. - .92 * smoothstep(0., 1., clamp(occ / vec3(1.3, 1.1, 1.), 0., 1.));
    // near the terminator the form's own turning does the darkening (softly, with
    // the wrap); the march there would only cut a hard line through it
    float nwl = dot(nw, L);
    float shRaw = sh.b;
    sh = mix(vec3(1.), sh, smoothstep(-.02, .3, nwl));
    // and a small bump on a slope that turns away cannot catch the light either
    float facing = smoothstep(-.3, .12, nwl);
    vec3 E = uLamp * dif * sh * fall * facing;

    // light carried through the stone. It goes in where the candle reaches and
    // wanders a few millimetres before it comes out: so a shadow on marble is
    // never dead, it glows a little, warm, under the stone that casts it; and
    // where the stone is thin (the rim of the ear, a curl standing free, the
    // edge of the profile) it comes out the other side. Red travels furthest.
    vec3 ell = vec3(1., .8, .58) * uEll;
    vec3 thin = exp(-thick / ell);
    float near = smoothstep(-.6, .45, nwl);
    vec3 tint = vec3(1., .74, .5);
    vec3 sss = uLamp * fall * (tint * max((nwl + .5) / 1.5, 0.) * .13 + thin * near * .65 * (.45 + .55 * sh.r));

    // light through the stone from behind: when the candle is low and to the
    // side (nearly behind the head as you see it), the thin parts it reaches
    // first, the rim of the profile on its side, the ear, the free curls, the
    // cut edge of the neck, pass it through and glow amber just inside the
    // edge. From the blurred thickness and blurred form only: no marching,
    // so nothing can sparkle. Added after the shadows.
    vec4 axB = texture2D(uAux, uv, 2.5);
    vec3 nwB = unpack(axB.xy);
    float thB = axB.z * uThick;
    float back = 1. - smoothstep(-.05, .45, L.z);
    float sideW = .4 + .6 * smoothstep(-.3, .45, dot(nwB.xy, dir));   // strongest on the candle's side
    vec3 trans = exp(-pow(thB / (ell * 2.2), vec3(1.3)));
    float lit = clamp(dot(n, L), 0., 1.) * sh.b;
    vec3 amber = vec3(1., .66, .34);
    // a flap (the ear's rim, a free curl) is much thinner than the stone around it:
    // it lets the light through even where the candle also strikes it
    float thBig = texture2D(uAux, uv, 5.).b * uThick;
    float flap = smoothstep(.6, .2, thB / max(thBig, 1.));
    vec3 glow = uLamp * amber * trans * back * sideW * min(fall, 1.8) * 1.3 * (1. + 1.3 * flap) * (1. - .6 * lit * (1. - flap));

    // and the room gives some of the candle back from the other side: a warm,
    // dim fill that keeps the form of the side turned away from it
    vec3 Lb = normalize(vec3(-dir * .55, .85));
    vec3 fill = uLamp * vec3(1., .86, .7) * .1 * min(fall, 1.6) * (.35 + .65 * max(dot(nw, Lb), 0.)) * (1. - .7 * max(nwl, 0.));

    // a faint polish where the stone was polished (the face, the neck)
    vec3 hv = normalize(L + vec3(0., 0., 1.));
    float nh = max(dot(n, hv), 0.);
    float sp = (pow(nh, 60.) * .28 + pow(nh, 9.) * .04) * polish * shRaw * facing * fall * smoothstep(0., .2, dot(n, L));

    // the room: dim, a little cool, darker in the cavities
    float ao = exp(-max(hb - P.z, 0.) * .025);
    vec3 amb = uAmb * (.5 + .5 * nw.z) * ao;

    vec3 c = alb * (amb + fill * ao + E * 1.25 + sss + glow) + uLamp * sp;
    vec3 col = pow(shoulder(c), vec3(1. / 2.2));
    gl_FragColor = vec4(col * a.a, a.a);
}`;

const CAST = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uBody;    // r: the head's height above the paper, blurred
uniform vec2 uCanvas;       // css px
uniform vec4 uRect;         // the head within this canvas, css px
uniform vec3 uLp;           // the candle, css px
uniform float uZ;           // body height range, css px
uniform float uRho;         // the candle's angular radius seen from the head
uniform float uCastLen;
uniform float uCast;
varying vec2 vUv;
float ign(vec2 q) { return fract(52.9829189 * fract(dot(q, vec2(.06711056, .00583715)))); }
float body(vec2 q) {
    vec2 u = (q - uRect.xy) / uRect.zw;
    float inside = step(0., u.x) * step(0., u.y) * step(u.x, 1.) * step(u.y, 1.);
    return texture2D(uBody, u).r * uZ * inside;
}
void main() {
    vec2 p = vUv * uCanvas;
    vec2 toL = uLp.xy - p;
    float D = max(length(toL), 1.);
    vec2 dir = toL / D;
    vec2 side = vec2(-dir.y, dir.x);
    float beta = atan(uLp.z, D);              // the candle's elevation from here
    float reach = min(uCastLen, D * .96);
    float jit = ign(gl_FragCoord.xy), js = ign(gl_FragCoord.yx + 17.) - .5;
    float occl = 0., tNear = uCastLen;
    for (int k = -2; k <= 2; k++) {
        float best = -1.;
        for (int i = 0; i < 16; i++) {
            float f = (float(i) + jit) / 16.;
            float t = f * f * reach + .5;
            float hgt = body(p + dir * t + side * ((float(k) + js) * .9 * t * uRho));
            best = max(best, atan(hgt, t));
            if (hgt > 1.) tNear = min(tNear, t);
        }
        occl += clamp((best - beta) / (2. * uRho) + .5, 0., 1.);
    }
    occl /= 5.;
    // the room fills it in with distance: dark at the stone, thin and soft further out
    float fade = 1. - smoothstep(0., uCastLen, tNear);
    float s = occl * mix(.25, 1., fade * fade) * (1. - smoothstep(.55 * uCastLen, uCastLen, tNear));
    // and right at the outline, a narrow contact shadow from every side
    float b0 = body(p);
    float contact = smoothstep(.0, 6., b0) * .5;
    float shade = min(max(s * uCast * .62, contact * uCast * .6), .5);
    vec3 ink = vec3(.075, .062, .05);
    gl_FragColor = vec4(ink * shade, shade);
}`;

function program(gl, frag, names) {
    const sh = (type, src) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; }
        return s;
    };
    const vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, frag);
    if (!vs || !fs) return null;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = {};
    for (const n of names) U[n] = gl.getUniformLocation(prog, n);
    return U;
}

function texture(gl, unit, source, mip) {
    const gl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    mip = mip && gl2;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    if (mip) gl.generateMipmap(gl.TEXTURE_2D);
    return t;
}

export function marbleRelight(root, opts = {}) {
    const img = root && root.querySelector('img');
    if (!img) return () => {};
    const ds = root.dataset;
    const pick = (k, d) => opts[k] ?? ds[k] ?? d;
    const num = (k, d) => {
        const v = pick(k, null);
        return v == null || v === '' || !isFinite(Number(v)) ? d : Number(v);
    };
    const lightOpt = String(pick('light', '-45 32')).trim().split(/[\s,]+/).map(Number);
    const cfg = {
        albedo: pick('albedo', ''),
        normal: pick('normal', ''),
        aux: pick('aux', ''),
        height: Math.max(1, num('height', 400)),
        thick: Math.max(1, num('thick', 800)),
        restAz: isFinite(lightOpt[0]) ? lightOpt[0] : -45,
        restEl: clamp(isFinite(lightOpt[1]) ? lightOpt[1] : 32, EL_MIN, EL_MAX),
        cast: clamp(num('cast', 0.7)),
        muted: clamp(num('muted', 0.45)),
        reach: Math.max(1, num('reach', 5)),
        glow: Math.max(0, num('glow', 1)),
    };
    if (!cfg.albedo || !cfg.normal || !cfg.aux) return () => {};

    // screen azimuth (0 = from the top, -90 = from the left) -> direction toward
    // the candle in page coordinates (x right, y down)
    const toTheta = (az) => Math.atan2(-Math.cos(az * RAD), Math.sin(az * RAD));
    const restTheta = toTheta(cfg.restAz);

    let dead = false;
    let cvHead = null, cvCast = null, gh = null, gc = null, UH = null, UC = null;
    let bmAlb = null, bmNrm = null, bmAux = null, bodyCanvas = null;
    let texW = 1, texH = 1;
    let W = 0, H = 0, cw = 0, ch = 0, margins = [0, 0, 0, 0];
    let visible = false, raf = 0, last = 0, sizeTimer = 0, idleTimer = 0;
    let tilt = { x: 0, y: 0, active: false };
    let introDone = false;

    // the candle: angle round the head and elevation (radians), with spring velocities
    const lamp = { th: restTheta, el: cfg.restEl * RAD, vth: 0, vel: 0 };
    let target = { th: restTheta, el: cfg.restEl * RAD };
    let mode = 'rest';                        // rest | pointer | touch | keys
    let ptr = null, drag = null, dragTh = 0, keyAim = null, lastTouch = 0;
    // flicker: alive while the candle is carried, steadying when it is still
    let flick = 0, still = 0;
    const flame = { k: 1, dth: 0, del: 0 };

    const off = [];
    const on = (t, type, fn, o) => { t.addEventListener(type, fn, o); off.push(() => t.removeEventListener(type, fn, o)); };

    // ── GL ────────────────────────────────────────────────────────────
    const attrs = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false };
    function initHead() {
        gh = cvHead.getContext('webgl2', attrs) || cvHead.getContext('webgl', attrs);
        if (!gh) return false;
        UH = program(gh, HEAD, ['uAlb', 'uNrm', 'uAux', 'uTex', 'uZ', 'uThick', 'uLp', 'uDl', 'uLamp', 'uAmb', 'uMuted', 'uEll', 'uPen', 'uLod']);
        if (!UH) return false;
        gh.pixelStorei(gh.UNPACK_COLORSPACE_CONVERSION_WEBGL, gh.NONE);
        gh.pixelStorei(gh.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        texture(gh, 0, bmAlb, true);
        texture(gh, 1, bmNrm, true);
        texture(gh, 2, bmAux, true);
        gh.uniform1i(UH.uAlb, 0);
        gh.uniform1i(UH.uNrm, 1);
        gh.uniform1i(UH.uAux, 2);
        gh.uniform2f(UH.uTex, texW, texH);
        gh.uniform1f(UH.uZ, cfg.height);
        gh.uniform1f(UH.uThick, cfg.thick);
        gh.uniform1f(UH.uMuted, cfg.muted);
        gh.uniform3f(UH.uAmb, 0.062, 0.062, 0.066);        // the room at night: dim, a touch cool
        gh.uniform1f(UH.uEll, 0.04 * Math.max(texW, texH) * cfg.glow);    // the thickness red light gets through, about 1.3 cm
        gh.uniform1f(UH.uPen, 0.2);   // a candle and its glow: soft-edged shadows
        gh.clearColor(0, 0, 0, 0);
        return true;
    }
    function initCast() {
        gc = cvCast.getContext('webgl', attrs) || cvCast.getContext('webgl2', attrs);
        if (!gc) return false;
        UC = program(gc, CAST, ['uBody', 'uCanvas', 'uRect', 'uLp', 'uZ', 'uRho', 'uCastLen', 'uCast']);
        if (!UC) return false;
        texture(gc, 0, bodyCanvas, false);
        gc.uniform1i(UC.uBody, 0);
        gc.uniform1f(UC.uCast, cfg.cast);
        gc.uniform1f(UC.uRho, 4.5 * RAD);
        gc.clearColor(0, 0, 0, 0);
        return true;
    }

    async function loadMaps() {
        const get = async (url, o) => {
            const r = await fetch(new URL(url, document.baseURI));
            if (!r.ok) throw new Error(url + ' ' + r.status);
            return createImageBitmap(await r.blob(), o);
        };
        const data = { premultiplyAlpha: 'none', colorSpaceConversion: 'none' };
        [bmAlb, bmNrm, bmAux] = await Promise.all([
            get(cfg.albedo, { premultiplyAlpha: 'none' }),   // its colour is carried out past the edge, so it filters cleanly unpremultiplied
            get(cfg.normal, data),       // data, not pictures: no colour management, no premultiply
            get(cfg.aux, data),
        ]);
        texW = bmNrm.width; texH = bmNrm.height;
        // the body for the cast shadow: the height channel, small and soft
        const bw = 160, bh = Math.max(8, Math.round(160 * texH / texW));
        const sm = document.createElement('canvas');
        sm.width = bw; sm.height = bh;
        const sg = sm.getContext('2d', { willReadFrequently: true });
        sg.imageSmoothingEnabled = true; sg.imageSmoothingQuality = 'high';
        sg.drawImage(bmNrm, 1, 1, bw - 2, bh - 2);
        const id = sg.getImageData(0, 0, bw, bh);
        for (let i = 0; i < id.data.length; i += 4) {
            const b = id.data[i + 2];
            id.data[i] = id.data[i + 1] = id.data[i + 2] = b;
            id.data[i + 3] = 255;
        }
        sg.putImageData(id, 0, 0);
        bodyCanvas = document.createElement('canvas');
        bodyCanvas.width = bw * 2; bodyCanvas.height = bh * 2;
        const bg = bodyCanvas.getContext('2d');
        bg.imageSmoothingEnabled = true; bg.imageSmoothingQuality = 'high';
        bg.drawImage(sm, 0, 0, bw * 2, bh * 2);
    }

    // ── layout ────────────────────────────────────────────────────────
    function layout() {
        const r = img.getBoundingClientRect();
        const fr = root.getBoundingClientRect();
        W = Math.max(1, r.width); H = Math.max(1, r.height);
        const ox = r.left - fr.left, oy = r.top - fr.top;
        const dpr = Math.min(devicePixelRatio || 1, 2);
        const max = gh.getParameter(gh.MAX_TEXTURE_SIZE) || 4096;
        const dh = Math.min(dpr, max / W, max / H);
        Object.assign(cvHead.style, { left: ox + 'px', top: oy + 'px', width: W + 'px', height: H + 'px' });
        cvHead.width = Math.round(W * dh);
        cvHead.height = Math.round(H * dh);
        gh.viewport(0, 0, cvHead.width, cvHead.height);
        // texture2D's bias is added to the level the screen would pick; undo that
        gh.uniform1f(UH.uLod, cvHead.width / texW);

        // the shadow's canvas reaches past the head, but never past the page's sides
        const m = Math.round(Math.max(W, H) * 0.6);
        const docW = document.documentElement.clientWidth;
        const mL = Math.max(0, Math.min(m, Math.floor(r.left)));
        const mR = Math.max(0, Math.min(m, Math.floor(docW - r.right)));
        margins = [mL, m, mR, m];
        cw = W + mL + mR; ch = H + 2 * m;
        Object.assign(cvCast.style, { left: ox - mL + 'px', top: oy - m + 'px', width: cw + 'px', height: ch + 'px' });
        // soft anyway: drawn at under one device pixel per css pixel
        const dc = Math.min(0.75, max / cw, max / ch);
        cvCast.width = Math.round(cw * dc);
        cvCast.height = Math.round(ch * dc);
        gc.viewport(0, 0, cvCast.width, cvCast.height);
        gc.uniform2f(UC.uCanvas, cw, ch);
        gc.uniform4f(UC.uRect, mL, m, W, H);
        gc.uniform1f(UC.uZ, cfg.height * (W / texW));
        gc.uniform1f(UC.uCastLen, Math.max(W, H) * 0.6);
    }

    function draw() {
        if (!gh || gh.isContextLost() || !gc || gc.isContextLost()) return;
        const th = lamp.th + flame.dth, el = clamp(lamp.el + flame.del, EL_MIN * RAD, EL_MAX * RAD);
        const c = Math.cos(el), s = Math.sin(el), dx = Math.cos(th), dy = Math.sin(th);
        // the candle, in texels: round the head's centre, held at about the
        // middle of its depth, a little more than a head's height away
        const Dt = DIST * texH;
        const zc = cfg.height * 0.45;
        gh.uniform3f(UH.uLp, texW / 2 + Dt * c * dx, texH / 2 + Dt * c * dy, zc + Dt * s);
        gh.uniform1f(UH.uDl, Dt);
        const k = flame.k;
        gh.uniform3f(UH.uLamp, 1.0 * k, 0.86 * k, 0.68 * k);  // a candle, warm
        gh.clear(gh.COLOR_BUFFER_BIT);
        gh.drawArrays(gh.TRIANGLE_STRIP, 0, 4);

        const ks = W / texW;
        const Dc = Dt * ks;
        gc.uniform3f(UC.uLp, margins[0] + W / 2 + Dc * c * dx, margins[1] + H / 2 + Dc * c * dy, zc * ks + Dc * s);
        gc.clear(gc.COLOR_BUFFER_BIT);
        gc.drawArrays(gc.TRIANGLE_STRIP, 0, 4);
    }

    // ── where the candle wants to be ──────────────────────────────────
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    function aimFromPointer(cx, cy) {
        const r = img.getBoundingClientRect();
        const R = Math.max(1, 0.5 * Math.max(r.width, r.height));
        const dx = cx - (r.left + r.width / 2), dy = cy - (r.top + r.height / 2);
        const d = Math.hypot(dx, dy) / R;
        // over the face the candle is held up in front; further out it drops to the side
        let th = d < 0.12 ? target.th : Math.atan2(dy, dx);
        let el = (EL_MAX - (EL_MAX - EL_MIN) * smooth(0.1, 1.5, d)) * RAD;
        const w = 1 - smooth(cfg.reach * 0.6, cfg.reach, d);
        th = restTheta + wrap(th - restTheta) * w;
        el = cfg.restEl * RAD + (el - cfg.restEl * RAD) * w;
        return { th, el };
    }
    function aimFromTouch() {
        let th = restTheta + dragTh, el = cfg.restEl * RAD;
        if (tilt.active && !calm.matches) {
            th += tilt.x * 110 * RAD;
            el -= tilt.y * 26 * RAD;
        }
        return { th, el };
    }
    function retarget() {
        let t;
        if (mode === 'keys' && keyAim) t = keyAim;
        else if (mode === 'pointer' && ptr) t = aimFromPointer(ptr.x, ptr.y);
        else if (mode === 'touch') t = aimFromTouch();
        else t = { th: restTheta, el: cfg.restEl * RAD };
        target = { th: lamp.th + wrap(t.th - lamp.th), el: clamp(t.el, EL_MIN * RAD, EL_MAX * RAD) };
        if (calm.matches) {
            // reduced motion: no easing, no flicker; the candle is where the hand put it
            lamp.th = target.th; lamp.el = target.el; lamp.vth = lamp.vel = 0;
            if (visible) draw();
            return;
        }
        kick();
    }

    // ── loop ──────────────────────────────────────────────────────────
    function frame(t) {
        raf = 0;
        if (dead || !gh) return;
        const dt = last ? Math.min(1 / 30, (t - last) / 1000) : 1 / 60;
        last = t;
        if (mode === 'touch' && tilt.active && !calm.matches) {
            const a = aimFromTouch();
            target.th = lamp.th + wrap(a.th - lamp.th);
            target.el = clamp(a.el, EL_MIN * RAD, EL_MAX * RAD);
        }
        // critically damped: the candle follows like a candle in a hand
        const k = introDone ? STIFF : 1.9;
        lamp.vth += (k * k * (target.th - lamp.th) - 2 * k * lamp.vth) * dt;
        lamp.vel += (k * k * (target.el - lamp.el) - 2 * k * lamp.vel) * dt;
        lamp.th += lamp.vth * dt;
        lamp.el += lamp.vel * dt;
        const moving = Math.abs(target.th - lamp.th) > 1e-3 || Math.abs(target.el - lamp.el) > 5e-4 ||
            Math.abs(lamp.vth) > 2e-3 || Math.abs(lamp.vel) > 1e-3;
        if (!moving) { lamp.th = target.th; lamp.el = target.el; lamp.vth = lamp.vel = 0; introDone = true; }
        // a carried flame gutters a little; a still one in still air stands up and steadies
        still = moving ? 0 : still + dt;
        const want = moving ? 1 : Math.max(0, 1 - still / 1.4);
        flick += (want - flick) * Math.min(1, dt * 6);
        const s = t / 1000;
        const n = Math.sin(s * 9.3) * 0.5 + Math.sin(s * 15.7 + 1.7) * 0.3 + Math.sin(s * 23.1 + 4.1) * 0.2;
        flame.k = 1 + flick * (0.045 * n + 0.02 * (Math.random() - 0.5));
        flame.dth = flick * 0.006 * Math.sin(s * 5.1 + 0.6);
        flame.del = flick * 0.004 * Math.sin(s * 6.7 + 2.2);
        draw();
        const done = !moving && flick < 0.01;
        if (done) { flame.k = 1; flame.dth = flame.del = 0; flick = 0; draw(); }
        if (visible && !document.hidden && !done) raf = requestAnimationFrame(frame);
        else last = 0;
    }
    function kick() {
        if (!raf && visible && gh && !document.hidden) raf = requestAnimationFrame(frame);
    }

    // ── input ─────────────────────────────────────────────────────────
    function onMove(e) {
        if (e.pointerType === 'touch') return;
        ptr = { x: e.clientX, y: e.clientY };
        if (calm.matches) { if (drag) dragMouse(e); return; }   // reduced motion: only a deliberate drag
        mode = 'pointer'; introDone = true;
        if (visible) retarget();
    }
    function onLeave(e) {
        if (e.pointerType === 'touch' || calm.matches) return;
        if (e.relatedTarget == null) { ptr = null; if (mode === 'pointer') { mode = 'rest'; retarget(); } }
    }
    function onScroll() { if (mode === 'pointer' && ptr && visible) retarget(); }
    function onDown(e) {
        if (e.pointerType === 'touch') {
            introDone = true;
            if (mode !== 'touch') { mode = 'touch'; dragTh = wrap(lamp.th - restTheta); }
            drag = { id: e.pointerId, x: e.clientX, th0: dragTh };
            lastTouch = performance.now();
        } else if (calm.matches && e.button === 0) {
            e.preventDefault();
            drag = { id: e.pointerId, mouse: true };
            dragMouse(e);
        }
    }
    function dragMouse(e) { keyAim = aimFromPointer(e.clientX, e.clientY); mode = 'keys'; retarget(); }
    function onDrag(e) {
        if (!drag || e.pointerId !== drag.id) return;
        if (drag.mouse) { dragMouse(e); return; }
        const span = Math.max(220, Math.min(root.getBoundingClientRect().width, innerWidth));
        dragTh = drag.th0 + ((e.clientX - drag.x) / span) * 260 * RAD;
        lastTouch = performance.now();
        mode = 'touch';
        retarget();
    }
    function onUp(e) {
        if (!drag || e.pointerId !== drag.id) return;
        drag = null;
        lastTouch = performance.now();
        scheduleIdle();
    }
    // a phone left alone: after a while the candle goes back to rest
    function scheduleIdle() {
        clearTimeout(idleTimer);
        if (calm.matches) return;
        idleTimer = setTimeout(() => {
            if (dead || drag || mode !== 'touch') return;
            if (performance.now() - lastTouch < 6000) { scheduleIdle(); return; }
            dragTh = 0;
            retarget();
        }, 6500);
    }
    function onKey(e) {
        const steps = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
        if (!steps[e.key]) { if (e.key === 'Escape') { mode = 'rest'; keyAim = null; retarget(); } return; }
        e.preventDefault();
        const [da, de] = steps[e.key];
        const base = keyAim || { th: lamp.th, el: lamp.el };
        keyAim = { th: base.th + da * 20 * RAD, el: clamp(base.el + de * 6 * RAD, EL_MIN * RAD, EL_MAX * RAD) };
        mode = 'keys'; introDone = true;
        retarget();
    }
    function onTilt() {
        if (!tilt.active || calm.matches || !visible) return;
        if (mode === 'rest') mode = 'touch';
        if (mode !== 'touch') return;
        const a = aimFromTouch();
        if (Math.abs(wrap(a.th - target.th)) > 0.004 || Math.abs(a.el - target.el) > 0.003) kick();
    }

    // ── start ─────────────────────────────────────────────────────────
    let io = null, ro = null;
    async function start() {
        try {
            if (!img.complete) await new Promise((res) => { img.addEventListener('load', res, { once: true }); img.addEventListener('error', res, { once: true }); });
            await loadMaps();
        } catch (e) {
            return;                                   // the <img> stays: that is the fallback
        }
        if (dead) return;
        cvCast = document.createElement('canvas');
        cvCast.className = 'mr-cast';
        cvHead = document.createElement('canvas');
        cvHead.className = 'mr-head';
        for (const c of [cvCast, cvHead]) c.setAttribute('aria-hidden', 'true');
        try {
            if (!initHead() || !initCast()) throw new Error('no webgl');
            root.appendChild(cvCast);
            root.appendChild(cvHead);
            layout();
            // the first time it is seen, the candle arrives from below and settles
            if (!calm.matches) { lamp.th = toTheta(-160); lamp.el = 16 * RAD; } else introDone = true;
            draw();
        } catch (e) {
            cvCast.remove(); cvHead.remove();
            gh = gc = null;
            return;
        }
        root.classList.add('is-live');

        for (const c of [cvHead, cvCast]) {
            on(c, 'webglcontextlost', (e) => { e.preventDefault(); cancelAnimationFrame(raf); raf = 0; root.classList.remove('is-live'); });
            on(c, 'webglcontextrestored', () => {
                try { if (initHead() && initCast()) { layout(); draw(); root.classList.add('is-live'); } } catch (e) { /* stay on the img */ }
            });
        }

        root.tabIndex = 0;
        if (!root.hasAttribute('aria-label')) {
            root.setAttribute('aria-label', 'A marble head lit by a candle. Arrow keys carry the candle around it.');
            root.dataset.mrLabel = '1';
        }
        root.dataset.mrAdded = '1';
        const drg = img.getAttribute('draggable');
        img.draggable = false;
        off.push(() => (drg == null ? img.removeAttribute('draggable') : img.setAttribute('draggable', drg)));

        on(window, 'pointermove', onMove, { passive: true });
        on(document.documentElement, 'pointerleave', onLeave);
        on(document, 'pointerout', onLeave);
        on(window, 'scroll', onScroll, { passive: true });
        on(root, 'pointerdown', onDown);
        on(window, 'pointermove', onDrag, { passive: true });
        on(window, 'pointerup', onUp);
        on(window, 'pointercancel', onUp);
        on(root, 'keydown', onKey);
        on(window, 'deviceorientation', onTilt, { passive: true });
        on(document, 'visibilitychange', () => { if (!document.hidden) { last = 0; kick(); } });
        on(calm, 'change', () => { mode = 'rest'; keyAim = null; drag = null; introDone = true; lamp.th = restTheta; lamp.el = cfg.restEl * RAD; retarget(); draw(); });

        import('./tilt.js').then((m) => { tilt = m.default; }).catch(() => {});

        io = new IntersectionObserver((en) => {
            visible = en[0].isIntersecting;
            if (visible) { last = 0; retarget(); draw(); }
            else { cancelAnimationFrame(raf); raf = 0; }
        }, { rootMargin: '40px' });
        io.observe(root);

        let w0 = 0, h0 = 0, x0 = 0;
        ro = new ResizeObserver(() => {
            const r = img.getBoundingClientRect();
            if (Math.abs(r.width - w0) < 1 && Math.abs(r.height - h0) < 1 && Math.abs(r.left - x0) < 1) return;
            w0 = r.width; h0 = r.height; x0 = r.left;
            clearTimeout(sizeTimer);
            sizeTimer = setTimeout(() => { if (!dead && gh) { layout(); draw(); } }, 120);
        });
        ro.observe(root);
        ro.observe(document.documentElement);
    }
    start();

    return function destroy() {
        dead = true;
        cancelAnimationFrame(raf);
        clearTimeout(sizeTimer);
        clearTimeout(idleTimer);
        off.forEach((f) => f());
        if (io) io.disconnect();
        if (ro) ro.disconnect();
        for (const g of [gh, gc]) if (g) { const x = g.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); }
        for (const c of [cvHead, cvCast]) if (c) c.remove();
        for (const b of [bmAlb, bmNrm, bmAux]) if (b && b.close) b.close();
        root.classList.remove('is-live');
        if (root.dataset.mrAdded) {
            root.removeAttribute('tabindex');
            if (root.dataset.mrLabel) root.removeAttribute('aria-label');
            delete root.dataset.mrAdded;
            delete root.dataset.mrLabel;
        }
    };
}

// Auto-start every [data-marble-relight] once it is near the viewport (the maps
// are a few megabytes; nothing is fetched for a head nobody scrolls to).
function autoStart(el) {
    if (!('IntersectionObserver' in window) || !('createImageBitmap' in window)) return;
    const io = new IntersectionObserver((en) => {
        if (!en[0].isIntersecting) return;
        io.disconnect();
        el._mrDestroy = marbleRelight(el);
    }, { rootMargin: '800px' });
    io.observe(el);
}
document.querySelectorAll('[data-marble-relight]').forEach(autoStart);
