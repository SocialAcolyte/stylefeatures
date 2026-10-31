// waterfall-print — a descent down a Hokusai waterfall, with the painted water pouring.
//
// The section pins a full-height stage and the scroll carries a camera down the falls:
// close on the lip where the water is glassy and slow, down the strands as they speed up
// and split into Hokusai's fingers, into the foot, and then back out to the whole sheet
// while the spray drifts off the print over the page below.
//
// One WebGL canvas (fixed over the viewport, never taking input) draws the print through
// the camera. Rocks, trees and people are the print's own pixels, untouched; only the
// water (a painted mask) and the air move. In the water:
//   - the print's lines slide along themselves in two phases (Valve, "Water Flow in
//     Portal 2", 2010), and the finger tips sway;
//   - fine threads and bright highlights race down the streamlines at the speed of
//     falling water, in pulses;
//   - at the plunge his foam dots boil and spread outward; a round pool swirls;
//   - grey spray haze rises at the foot, and at the end drifts out over the page.
// Maps (flow, streaks, air) are baked offline from the print's own strokes; see README.md.

const calm = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ease = (t) => t * t * (3 - 2 * t);

const VERT = `
attribute vec2 p;
uniform vec2 uView;
varying vec2 vScr;
void main(){ vScr = vec2((p.x * .5 + .5) * uView.x, (.5 - p.y * .5) * uView.y); gl_Position = vec4(p, 0., 1.); }`;

const FRAG = `
precision highp float;
varying vec2 vScr;                    // css px in the viewport
uniform sampler2D uPrint, uFlow, uStreaks, uAir, uNoise;
uniform vec2 uOrigin;                 // the print's top-left on screen, css px
uniform vec2 uCss;                    // the print's size on screen at this zoom, css px
uniform vec2 uPx;                     // the print's size, full-res px
uniform vec2 uTexel;                  // print texture footprint (uv), 0 at 1:1
uniform float uT, uMistT, uSwayPx, uCycle, uStreakCycle, uVmax;
uniform float uThreadAmt, uMistAmt, uDeep, uMotion;
uniform vec4 uPart;                   // finger: uv.xy, strength, held
uniform float uPartDrift;             // css px the V has fallen since the finger lifted
uniform vec2 uAspect;                 // (1, h/w)
uniform vec4 uPlunge;                 // plunge pool: uv.xy, radius (uv of width), on
uniform vec4 uSwirl;                  // round pool: uv.xy, radius (uv of width), rad/s
uniform vec3 uSpray;                  // spray over the page: strength, spread, view height (css px)

const vec3 PAPER = vec3(.94, .92, .85);
const vec3 LINE  = vec3(.27, .41, .62);

float N1(vec2 p){ vec4 t = texture2D(uNoise, p); return (t.r * 255. + t.g) / 256.; }
float N2(vec2 p){ vec4 t = texture2D(uNoise, p); return (t.b * 255. + t.a) / 256.; }
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec4 tap4(vec2 uv){
  vec2 o = uTexel;
  return .25 * (texture2D(uPrint, uv + vec2(-o.x, -o.y)) + texture2D(uPrint, uv + vec2(o.x, -o.y))
              + texture2D(uPrint, uv + vec2(-o.x, o.y)) + texture2D(uPrint, uv + vec2(o.x, o.y)));
}
vec3 tap(vec2 uv){ return tap4(uv).rgb; }
float lum(vec3 c){ return dot(c, vec3(.3, .59, .11)); }
vec2 upstream(vec2 p, float secs){
  vec2 k = uVmax * secs * .25 / uPx;
  for (int i = 0; i < 4; i++) p -= (texture2D(uFlow, p).rg * 2. - 1.) * k;
  return p;
}
// fibrous mist: domain-warped noise stretched upward, rising and slowly curling (q in print widths)
float fibres(vec2 q){
  float t = uMistT;
  q.y += t * .024;
  q.x -= t * .003;
  vec2 w = vec2(N1(q * .12 + vec2(.1, t * .0016)), N2(q * .12 + vec2(.37, .61 - t * .0013))) - .5;
  q += w * .22;
  float f = N1(q * vec2(.62, .11) + .13) * .55 + N2(q * vec2(1.4, .26) + .41) * .3 + N1(q * vec2(3.1, .55) + .77) * .15;
  return smoothstep(.36, .68, f);
}
vec3 veil(vec3 c){ vec3 g = max(c, vec3(.79, .805, .805)); return mix(g, vec3(lum(g)), .2); }
// spray haze drifting off the foot over the page: soft rounded billows, wider than tall, rising
// and spreading sideways from the sheet's bottom edge, thickest at the foot and thinning as they go
float billows(vec2 q, float side){
  float t = uMistT;
  q += vec2(side * t * .006, t * .012);            // outward and up (q.y grows downward on screen)
  vec2 w = vec2(N1(q * .09 + vec2(.3, t * .002)), N2(q * .09 + vec2(.7, .2))) - .5;
  q += w * .35;
  float f = N1(q * vec2(.32, .55) + .17) * .72 + N2(q * vec2(.66, 1.1) + .53) * .28;
  return smoothstep(.3, .78, f);
}
float pageSpray(vec2 scr){
  if (uSpray.x < .003) return 0.;
  vec2 foot = vec2(uOrigin.x + uPlunge.x * uCss.x, uOrigin.y + uCss.y);
  float sx = uCss.x * (.45 + .45 * uSpray.y) + 60.;
  float down = uSpray.z * (.16 + .2 * uSpray.y), up = uCss.y * (.18 + .1 * uSpray.y);
  vec2 d = scr - foot;
  float fx = d.x / sx, fy = d.y > 0. ? d.y / down : -d.y / up;
  float field = exp(-fx * fx * 1.4 - fy * fy * 1.2);
  vec2 q = (scr - foot) / max(uCss.x, 1.) * 1.1;
  return uSpray.x * field * (.3 + .7 * billows(q, clamp(d.x / 260., -1., 1.)));
}

void main(){
  vec2 scr = vScr;
  vec2 uv = (scr - uOrigin) / uCss;
  float haze = clamp(pageSpray(scr) * .75, 0., .5);
  bool inside = uv.x >= 0. && uv.x <= 1. && uv.y >= 0. && uv.y <= 1.;
  // the sheet's soft shadow on the page
  vec2 dd = max(max(uOrigin - scr + vec2(0., 7.), scr - (uOrigin + uCss) - vec2(0., 7.)), 0.);
  float sh = .12 * exp(-length(dd) / 9.) + .07 * exp(-length(dd) / 34.);
  vec4 under = vec4(vec3(.19, .14, .09) * sh, sh);
  under = vec4(vec3(.79, .80, .80) * haze, haze) + under * (1. - haze);
  if (!inside) { gl_FragColor = under; return; }

  vec4 P = tap4(uv);
  float sheetA = P.a;
  vec3 F = texture2D(uFlow, uv).rgb;
  vec3 A = texture2D(uAir, uv).rgb;              // mist density, spray
  float mask = F.b;
  vec3 c = P.rgb;
  float a = clamp(A.r * (.3 + .7 * fibres(uv * uAspect)) * uMistAmt * .95, 0., .7);

  if (mask > .004) {
    vec2 vel = F.rg * 2. - 1.;
    float spd = length(vel);
    vec2 fdl = spd > .001 ? vel / spd : vec2(0., 1.);
    vec2 perp = vec2(-fdl.y, fdl.x);
    float spray = A.g;
    float j = N1(uv * vec2(1.7, 1.7 * uAspect.y));
    float interior = smoothstep(.75, 1., mask);

    // a finger in the water, quietly: the strands brighten and part in a narrow V below it
    vec2 partOff = vec2(0.);
    float vEdge = 0., vIn = 0., glowB = 0., dotA = 0.;
    if (uPart.z > .002) {
      vec2 pf = texture2D(uFlow, uPart.xy).rg * 2. - 1.;
      vec2 fd = length(pf) > .001 ? normalize(pf) : vec2(0., 1.);
      vec2 nd = vec2(-fd.y, fd.x);
      vec2 q = (uv - uPart.xy) * uCss;
      float along = dot(q, fd), acrossS = dot(q, nd), across = abs(acrossS);
      float s = uPart.z * (1. - smoothstep(0., 40., uPartDrift));
      float a1 = along - uPartDrift;
      float Lw = 34., t = clamp(a1 / Lw, 0., 1.);
      float hw = s * 2.6 * smoothstep(0., 6., a1) * (1. - t) * step(a1, Lw);
      partOff = nd * (acrossS >= 0. ? 1. : -1.) * hw * exp(-max(across - hw, 0.) / 4.) / uCss;
      float e = across - hw;
      vIn = step(.2, hw) * (1. - smoothstep(-.5, .5, e));
      vEdge = step(.2, hw) * (1. - smoothstep(.3, .8, abs(e - .3)));
      glowB = s * uPart.w * exp(-dot(q + fd * 2., q + fd * 2.) / 160.);
      float vs = spd * uVmax * uCss.x / uPx.x;
      vec2 sc = vec2(acrossS, a1 - uT * vs * .4) / 3.2;
      vec2 cell = floor(sc);
      vec2 off = vec2(hash(cell + 2.7), hash(cell + 5.3)) - .5;
      float rd = .55 + .6 * hash(cell + 9.1);
      float ds = length((fract(sc) - .5 - off * .35) * 3.2);
      float zone = smoothstep(1., 4., a1) * (1. - smoothstep(12., 20., a1)) * (1. - smoothstep(5., 9., across));
      dotA = s * uPart.w * zone * step(.62, hash(cell + 17.3)) * (1. - smoothstep(rd - .35, rd + .35, ds));
    }

    vec2 base = uv - partOff;
    // the finger tips sway a little, each to its own time
    float tip = smoothstep(.42, .8, uv.y) * (1. - spray) * interior;
    base += perp * sin(uT * 2.3 + 6.283 * N2(uv * vec2(5., 1.2))) * 3.2 * tip * uMotion / uPx;
    // the round pool turns: its rings rotate about the centre, in two phases
    float swirlW = 0.;
    if (uSwirl.z > 0.) {
      vec2 rp = (uv - uSwirl.xy) * uAspect;
      float rr = length(rp) / uSwirl.z;
      swirlW = (1. - smoothstep(.9, 1., rr)) * mask;
      if (swirlW > .001) {
        float cyc = 1.5, ph = uT / cyc + rr * .6;
        float q0 = fract(ph), q1 = fract(ph + .5);
        float a0 = uSwirl.w * cyc * (q0 - .5) * (1.15 - .3 * rr) * uMotion;
        float a1 = uSwirl.w * cyc * (q1 - .5) * (1.15 - .3 * rr) * uMotion;
        vec2 r0 = mat2(cos(a0), sin(a0), -sin(a0), cos(a0)) * rp;
        vec2 r1 = mat2(cos(a1), sin(a1), -sin(a1), cos(a1)) * rp;
        vec2 u0 = uSwirl.xy + r0 / uAspect, u1 = uSwirl.xy + r1 / uAspect;
        float m0 = texture2D(uFlow, u0).b, m1 = texture2D(uFlow, u1).b;
        vec3 s0 = tap(u0), s1 = tap(u1);
        float w0 = (1. - abs(2. * q0 - 1.)) * m0, w1 = (1. - abs(2. * q1 - 1.)) * m1;
        vec3 sw = (s0 * w0 + s1 * w1 + tap(base) * .001) / (w0 + w1 + .001);
        c = mix(c, sw, swirlW);
      }
    }
    // the print's own lines slide a little along themselves, in two phases
    {
      float ph = uT / uCycle + j * 2.;
      float p0 = fract(ph), p1 = fract(ph + .5);
      vec2 d = vel * uSwayPx / uPx * uMotion;
      vec3 c0 = tap(base - d * (p0 - .5)), c1 = tap(base - d * (p1 - .5));
      vec3 slid = mix(c1, c0, 1. - abs(2. * p0 - 1.));
      c = mix(slid, c, swirlW);
      // the plunge: his foam dots boil and spread outward from where the water lands
      if (uPlunge.w > .5) {
        float pool = mask * smoothstep(uPlunge.y - .03, uPlunge.y + .02, uv.y);
        vec2 rp = (uv - uPlunge.xy) * uAspect;
        float bw = max(spray, pool) * (1. - smoothstep(uPlunge.z * .7, uPlunge.z * 1.3, length(rp))) * uMotion;
        if (bw > .001) {
          float ph2 = uT / 1.3 + j * 3.;
          float q0 = fract(ph2), q1 = fract(ph2 + .5);
          vec2 rd = normalize(rp + vec2(1e-4, 0.)) / uAspect;
          vec2 boil = (vec2(N1(uv * 9. + vec2(uT * .21, 0.)), N2(uv * 9. + vec2(0., uT * .19))) - .5) * 9. / uPx;
          vec3 b0 = tap(base - (rd * 26. * (q0 - .5) / uPx.x + boil) * bw);
          vec3 b1 = tap(base - (rd * 26. * (q1 - .5) / uPx.x + boil) * bw);
          c = mix(c, mix(b1, b0, 1. - abs(2. * q0 - 1.)), smoothstep(0., .25, bw));
        }
      }
    }

    // pulses: soft surges carried down the strands
    float sg;
    {
      float ph = uT / 1.9 + j;
      float q0 = fract(ph), q1 = fract(ph + .5);
      vec2 k = vel * uVmax * 1.9 / uPx;
      vec2 nq = uv * vec2(5., 1.6 * uAspect.y);
      float g0 = N2(nq - k * q0 * vec2(5., 1.6 * uAspect.y)), g1 = N2(nq - k * q1 * vec2(5., 1.6 * uAspect.y));
      sg = smoothstep(.38, .72, mix(g1, g0, 1. - abs(2. * q0 - 1.)));
    }

    // threads and highlights racing down the lines, at the speed of the water
    float sh2 = uT / uStreakCycle + j * 3.;
    float s0 = fract(sh2), s1 = fract(sh2 + .5);
    float st = mix(texture2D(uStreaks, upstream(base, s1 * uStreakCycle)).r,
                   texture2D(uStreaks, upstream(base, s0 * uStreakCycle)).r, 1. - abs(2. * s0 - 1.));
    float th = smoothstep(.5, .62, st);
    vec2 po = perp * 3.5 / uCss;
    float edge = smoothstep(.04, .18, abs(lum(texture2D(uPrint, base + po).rgb) - lum(texture2D(uPrint, base - po).rgb)));
    float l = lum(c);
    float bright = smoothstep(.42, .66, l);
    // (only where the water is falling: on lobe tops and in eddies the lines turn, and threads would curl)
    float falling = smoothstep(.45, .75, fdl.y);
    float moving = uThreadAmt * uMotion * smoothstep(.04, .3, spd) * (1. - spray * .85) * (1. - swirlW) * falling;
    float surge = mix(.45, 1.6, sg);
    // on white: his key blue, crisp; on blue: bright paper, the highlights
    float kLo = th * mix(.4, 1., edge) * moving * surge * .66 * bright;
    float kHi = th * mix(.35, 1., edge) * moving * surge * .9 * (1. - bright);
    c = mix(c, vec3(.24, .37, .58), clamp(kLo, 0., .8));
    c = mix(c, vec3(.95, .94, .89), clamp(kHi, 0., .9));

    float blue = smoothstep(.02, .14, c.b - c.r);
    c = mix(c, c * vec3(.86, .93, 1.03), uDeep * blue);

    if (uPart.z > .002) {
      c = mix(c, PAPER, glowB * .35);
      c = mix(c, vec3(.56, .68, .79), vIn * .45);
      c = mix(c, LINE, vEdge * .55);
      c = mix(c, mix(PAPER, vec3(.25, .38, .60), smoothstep(.5, .7, lum(c))), dotA);
      a = clamp(a + glowB * .12, 0., .75);
    }
    c = mix(P.rgb, c, mask);
  }

  c = mix(c, veil(c), a);
  c = mix(c, vec3(.79, .80, .80), haze);
  // the sheet over its shadow (and over the haze on the page)
  gl_FragColor = vec4(c * sheetA, sheetA) + under * (1. - sheetA);
}`;

// ── textures made here rather than shipped ──────────────────────────────────
function mulberry(seed) {
    return () => {
        seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Smooth tileable value noise, 256², two independent fields packed as 16-bit (hi, lo) in RGBA:
// a smooth field stored in 8 bits terraces, and a warp built on terraces draws contour rings.
function noiseTexture(seed = 5) {
    const N = 256, r = mulberry(seed);
    const blur = (src, R) => {
        const t = new Float32Array(N * N), o = new Float32Array(N * N);
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
            let s = 0; for (let k = -R; k <= R; k++) s += src[y * N + ((x + k + N) % N)];
            t[y * N + x] = s / (2 * R + 1);
        }
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
            let s = 0; for (let k = -R; k <= R; k++) s += t[((y + k + N) % N) * N + x];
            o[y * N + x] = s / (2 * R + 1);
        }
        return o;
    };
    const field = () => {
        let a = new Float32Array(N * N);
        for (let i = 0; i < a.length; i++) a[i] = r();
        a = blur(blur(blur(a, 3), 3), 3);
        let lo = 1, hi = 0;
        for (const v of a) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
        for (let i = 0; i < a.length; i++) a[i] = (a[i] - lo) / (hi - lo);
        return a;
    };
    const f1 = field(), f2 = field(), u = new Uint8Array(N * N * 4);
    for (let i = 0; i < N * N; i++) {
        const v1 = Math.min(f1[i] * 255, 254.999), v2 = Math.min(f2[i] * 255, 254.999);
        u[i * 4] = Math.floor(v1); u[i * 4 + 1] = Math.round((v1 - Math.floor(v1)) * 255);
        u[i * 4 + 2] = Math.floor(v2); u[i * 4 + 3] = Math.round((v2 - Math.floor(v2)) * 255);
    }
    return { W: N, H: N, data: u };
}

const loadImage = (src) => new Promise((res, rej) => {
    const im = new Image();
    im.decoding = 'async';
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('waterfall-print: could not load ' + src));
    im.src = src;
});

// Catmull-Rom through the camera's waypoints
function spline(pts, t) {
    const n = pts.length - 1, f = clamp(t) * n, i = Math.min(n - 1, Math.floor(f)), u = f - i;
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n, i + 2)];
    return p1.map((_, k) => .5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * u + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u * u
        + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u * u * u));
}

export function waterfallPrint(root, opts = {}) {
    const img = root && root.querySelector('img');
    if (!img) return Object.assign(() => {}, { state: {} });
    const num = (k, d) => {
        const v = opts[k] ?? root.dataset[k];
        return v == null || v === '' || !isFinite(Number(v)) ? d : Number(v);
    };
    const flag = (k, d) => {
        const v = opts[k] ?? root.dataset[k];
        if (v == null) return d;
        return v === true || v === '' || v === 'true' || v === '1';
    };
    const cfg = {
        maps: opts.maps ?? root.dataset.maps,
        speed: Math.max(0, num('speed', 1)),
        threads: Math.max(0, num('threads', 1)),
        mist: Math.max(0, num('mist', 1)),
        sway: Math.max(0, num('sway', 1)),
        deepen: Math.max(0, num('deepen', 1)),
        fps: clamp(num('fps', 30), 10, 60),
        part: flag('part', true),
        descent: flag('descent', true),
        runway: Math.max(1, num('runway', 5.2)),
        zoom: Math.max(1, num('zoom', 2.5)),
        spray: Math.max(0, num('spray', 1)),
        warmup: Math.max(.1, num('warmup', 2.6)),
    };
    const state = { running: false, visible: false, rate: 0, time: 0, progress: 0, zoom: 1, fps: cfg.fps };

    let dead = false, gl = null, prog = null, canvas = null, maps = null;
    const U = {}, T = {};
    let raf = 0, last = 0, lastDraw = 0, flowT = 0, mistT = 0, rate = 0, boost = 0;
    let spray = 0, spread = 0;
    let lastScrollY = scrollY, lastScrollT = performance.now();
    let io = null, near = false;
    let part = { x: .5, y: .5, s: 0, down: false, drift: 0, v: 0 };
    let waterAt = () => false;
    let cam = { ox: 0, oy: 0, w: 1, h: 1, z: 1 };
    let dpr = 1, vw = 0, vh = 0;
    const off = [];
    const on = (t, type, fn, o) => { t.addEventListener(type, fn, o); off.push(() => t.removeEventListener(type, fn, o)); };
    const stage = root.querySelector('.wf-stage') || root;

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
        gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
        gl.useProgram(prog);
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(prog, 'p');
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        for (const n of ['uView', 'uPrint', 'uFlow', 'uStreaks', 'uAir', 'uNoise', 'uOrigin', 'uCss', 'uPx', 'uTexel', 'uT', 'uMistT',
            'uSwayPx', 'uCycle', 'uStreakCycle', 'uVmax', 'uThreadAmt', 'uMistAmt', 'uDeep', 'uMotion', 'uPart', 'uPartDrift',
            'uAspect', 'uPlunge', 'uSwirl', 'uSpray']) U[n] = gl.getUniformLocation(prog, n);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
        ['uPrint', 'uFlow', 'uStreaks', 'uAir', 'uNoise'].forEach((n, i) => gl.uniform1i(U[n], i));
        return true;
    }

    function texture(unit, src, wrap) {
        const t = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap ? gl.REPEAT : gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap ? gl.REPEAT : gl.CLAMP_TO_EDGE);
        if (src.data) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, src.W, src.H, 0, gl.RGBA, gl.UNSIGNED_BYTE, src.data);
        else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
        return t;
    }

    function resize() {
        if (!gl) return;
        vw = innerWidth; vh = innerHeight;
        dpr = Math.min(devicePixelRatio || 1, 3);
        if (vw * vh * dpr * dpr > 5e6) dpr = Math.sqrt(5e6 / (vw * vh));
        const w = Math.round(vw * dpr), h = Math.round(vh * dpr);
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
        gl.viewport(0, 0, w, h);
        gl.uniform2f(U.uView, vw, vh);
        draw();
    }

    // where the print sits on screen: the stage's box, the fit, and the camera along its path
    function camera() {
        const r = stage.getBoundingClientRect();
        const margin = Math.max(16, Math.min(56, r.width * .04));
        const fit = Math.min((r.width - 2 * margin) / maps.width, (r.height - 2 * margin) / maps.height);
        // zoom no further than the texture's own pixels allow (sharp or nothing)
        const zmax = Math.max(1, Math.min(cfg.zoom, 1.12 / (fit * Math.max(dpr, 2))));   // at most 1.12 screen px per texel
        let cx = .5, cy = .5, z = 1, p = 0;   // cy: 0-1 down the frame's travel during the descent
        if (cfg.descent && !calm.matches) {
            const rr = root.getBoundingClientRect();
            p = clamp(-rr.top / Math.max(1, rr.height - r.height));
            const path = maps.path || [[.5, .1, 1], [.5, .5, 0]];
            const descent = path.slice(0, -1), last = path[path.length - 1];
            const P1 = .7, P2 = .9;                      // the descent, then the pull back, then a hold
            let pt;
            if (p <= P1) pt = spline(descent, p / P1);
            else {
                const a = descent[descent.length - 1], k = ease(clamp((p - P1) / (P2 - P1)));
                pt = a.map((v, i) => v + (last[i] - v) * k);
            }
            const zf = pt[2];
            z = 1 + (zmax - 1) * zf;
            cx = pt[0]; cy = pt[1];
        }
        const pw = maps.width * fit * z, ph = maps.height * fit * z;
        const hx = r.width / 2 / pw, hy = r.height / 2 / ph;
        // the path's y is a fraction of the travel the frame allows at this zoom (top of the sheet
        // to its foot), so the descent uses the whole runway on any screen
        const pull = cfg.descent && !calm.matches && p > .7 ? ease(clamp((p - .7) / .2)) : 0;
        cx = hx >= .5 ? .5 : clamp(cx, hx, 1 - hx);
        cy = hy >= .5 ? .5 : (1 - pull) * (hy + clamp(cy) * (1 - 2 * hy)) + pull * clamp(cy, hy, 1 - hy);
        cam = { ox: r.left + r.width / 2 - cx * pw, oy: r.top + r.height / 2 - cy * ph, w: pw, h: ph, z, zmax, p };
        state.progress = p; state.zoom = z;
        return cam;
    }

    function draw() {
        if (!gl || !T.flow) return;
        const c = camera();
        const motion = calm.matches ? 0 : 1;
        gl.uniform2f(U.uOrigin, c.ox, c.oy);
        gl.uniform2f(U.uCss, c.w, c.h);
        const foot = clamp((maps.width / (c.w * dpr) - 1) * .5, 0, .5);
        gl.uniform2f(U.uTexel, foot / maps.width, foot / maps.height);
        gl.uniform1f(U.uT, flowT);
        gl.uniform1f(U.uMistT, mistT);
        gl.uniform1f(U.uMotion, motion * clamp(rate * 1.4));
        gl.uniform1f(U.uMistAmt, cfg.mist * (calm.matches ? .8 : clamp(.55 + rate * .6)) * (1 + spray * .35));
        gl.uniform1f(U.uThreadAmt, cfg.threads);
        gl.uniform1f(U.uDeep, .1 * cfg.deepen * clamp(rate));
        gl.uniform4f(U.uPart, part.x, part.y, part.s, part.down ? 1 : 0);
        gl.uniform1f(U.uPartDrift, part.drift);
        gl.uniform3f(U.uSpray, spray * cfg.spray, spread, vh);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    function frame(now) {
        raf = 0;
        if (dead || document.hidden || calm.matches || (!near && spray < .004)) {
            state.running = false;
            if (!near && canvas) { spray = 0; spread = 0; gl.clear(gl.COLOR_BUFFER_BIT); canvas.style.visibility = 'hidden'; }
            return;
        }
        canvas.style.visibility = '';
        const dt = last ? Math.min(.1, (now - last) / 1000) : 0;
        last = now;
        rate += (1 - rate) * (1 - Math.exp(-dt / (cfg.warmup / 2.2)));
        boost *= Math.exp(-dt / .5);
        // the same water reads as the same speed at every zoom: further out, the clock runs on
        const zs = Math.sqrt((cam.zmax || 1) / Math.max(cam.z, 1));
        flowT += dt * rate * (1 + boost) * cfg.speed * zs;
        mistT += dt * (.35 + .65 * rate) * cfg.speed;
        // the spray leaves the print once the camera reaches the foot, then slowly clears
        const atFoot = near && cam.p > .62;
        if (atFoot) { spray += (1 - spray) * (1 - Math.exp(-dt / 1.2)); spread = Math.min(1, spread + dt / 6); }
        else { spray *= Math.exp(-dt / 1.1); spread = Math.min(1, spread + dt / 3); }
        if (spray < .004 && !atFoot) spread = 0;
        if (part.down) { part.s += (1 - part.s) * (1 - Math.exp(-dt / .1)); part.drift = 0; }
        else if (part.s > 0) {
            part.drift += dt * part.v * cam.w * Math.max(rate, .3) * (1 + boost);
            if (part.drift > 45) { part.s = 0; part.drift = 0; }
        }
        state.rate = rate; state.time = flowT; state.spray = spray;
        if (now - lastDraw >= 1000 / cfg.fps - 4) { lastDraw = now; draw(); }
        state.running = true;
        raf = requestAnimationFrame(frame);
    }
    function kick() { if (!raf && !dead && !document.hidden && !calm.matches && gl && (near || spray > .004)) { last = 0; raf = requestAnimationFrame(frame); } }

    async function start() {
        const base = new URL(cfg.maps, location.href);
        maps = await (await fetch(base)).json();
        const printSrc = maps.print ? new URL(maps.print, base).href : (img.currentSrc || img.src);
        const [flow, streaks, air, print] = await Promise.all([maps.flow, maps.streaks, maps.air].map((k) => loadImage(new URL(k, base).href))
            .concat(loadImage(printSrc)));
        if (dead) return;
        canvas = document.createElement('canvas');
        canvas.className = 'wf-canvas';
        canvas.setAttribute('aria-hidden', 'true');
        document.body.appendChild(canvas);
        if (!initGL()) { canvas.remove(); canvas = null; return; }
        T.print = texture(0, print, false);
        T.flow = texture(1, flow, false);
        T.streaks = texture(2, streaks, false);
        T.air = texture(3, air, false);
        T.noise = texture(4, noiseTexture(), true);
        const mc = document.createElement('canvas');
        mc.width = flow.naturalWidth; mc.height = flow.naturalHeight;
        const mx = mc.getContext('2d', { willReadFrequently: true });
        mx.drawImage(flow, 0, 0);
        waterAt = (x, y) => {
            const d = mx.getImageData(Math.min(mc.width - 1, x * mc.width | 0), Math.min(mc.height - 1, y * mc.height | 0), 1, 1).data;
            part.v = Math.hypot(d[0] / 127.5 - 1, d[1] / 127.5 - 1) * maps.vmax / maps.width;
            return d[2] > 140;
        };
        gl.uniform1f(U.uVmax, maps.vmax);
        gl.uniform2f(U.uPx, maps.width, maps.height);
        gl.uniform2f(U.uAspect, 1, maps.height / maps.width);
        gl.uniform1f(U.uSwayPx, 16 * cfg.sway);
        gl.uniform1f(U.uCycle, 1.25);
        gl.uniform1f(U.uStreakCycle, .6);
        const pl = maps.plunge;
        gl.uniform4f(U.uPlunge, pl ? pl[0] : .5, pl ? pl[1] : 1.2, pl ? pl[2] : .3, pl ? 1 : 0);
        const sw = maps.swirl;
        gl.uniform4f(U.uSwirl, sw ? sw[0] : 0, sw ? sw[1] : 0, sw ? sw[2] : 0, sw ? sw[3] : 0);
        root.classList.add('is-live');
        if (cfg.descent && !calm.matches) root.classList.add('wf-descent');
        root.style.setProperty('--wf-runway', (cfg.runway * 100) + 'svh');
        io = new IntersectionObserver((en) => {
            const v = en[en.length - 1].isIntersecting;
            if (v && !near) rate = 0;
            near = v; state.visible = v;
            if (v) { canvas.style.visibility = ''; kick(); }
        }, { rootMargin: '10% 0px' });
        io.observe(root);
        on(window, 'resize', resize);
        on(document, 'visibilitychange', kick);
        on(calm, 'change', () => { root.classList.toggle('wf-descent', cfg.descent && !calm.matches); draw(); kick(); });
        on(window, 'scroll', () => {
            const now = performance.now(), dt = Math.max(16, now - lastScrollT);
            const v = Math.abs(scrollY - lastScrollY) / dt * 1000;
            lastScrollY = scrollY; lastScrollT = now;
            if (near) boost = Math.max(boost, clamp((v - 900) / 3000, 0, 1.2));
            if (!raf) { draw(); kick(); }
        }, { passive: true });
        canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); cancelAnimationFrame(raf); raf = 0; });
        if (cfg.part && !calm.matches) bindFinger();
        resize();
        if (calm.matches) draw();
    }

    // A finger (or the pointer pressed) in the falling water parts it, quietly.
    function bindFinger() {
        const where = (e) => [(e.clientX - cam.ox) / cam.w, (e.clientY - cam.oy) / cam.h];
        on(stage, 'pointerdown', (e) => {
            const [x, y] = where(e);
            if (x < 0 || x > 1 || y < 0 || y > 1 || !waterAt(x, y)) return;
            part.x = x; part.y = y; part.down = true; part.drift = 0; kick();
            root.dispatchEvent(new CustomEvent('waterfall-print:part', { bubbles: true, detail: { x, y } }));
        });
        on(stage, 'pointermove', (e) => {
            if (!part.down) return;
            const [x, y] = where(e);
            part.x = x; part.y = y;
        });
        const up = () => { part.down = false; };
        on(window, 'pointerup', up);
        on(window, 'pointercancel', up);
    }

    start().catch((e) => console.warn(e));

    const destroy = () => {
        dead = true;
        cancelAnimationFrame(raf);
        off.forEach((f) => f());
        if (io) io.disconnect();
        if (gl) { const x = gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); }
        if (canvas) canvas.remove();
        root.classList.remove('is-live', 'wf-descent');
        root.style.removeProperty('--wf-runway');
    };
    destroy.state = state;
    destroy.set = (o) => { Object.assign(cfg, o); if (gl) gl.uniform1f(U.uSwayPx, 16 * cfg.sway); draw(); };
    return destroy;
}

function autoStart(el) {
    if (el.__wf) return;
    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((en) => {
        if (!en[0].isIntersecting) return;
        io.disconnect();
        el.__wf = waterfallPrint(el);
    }, { rootMargin: '800px' });
    io.observe(el);
}
const boot = () => document.querySelectorAll('[data-waterfall-print]').forEach(autoStart);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
