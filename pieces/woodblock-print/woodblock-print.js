/* woodblock-print — a Japanese colour woodblock print, printed in front of
 * you, block by block, as you scroll.
 *
 *   <section data-woodblock-print data-src="assets/red-fuji.json">
 *     <div class="wb-stage"><img class="wb-img" src="assets/red-fuji.webp" alt=""></div>
 *   </section>
 *
 * The print has been separated offline into its blocks (a key block and the
 * colour blocks, each a coverage map 0..1 and one ink). The maps arrive as one
 * greyscale strip (`<name>-blocks.webp`), are packed four to an RGBA texture,
 * and one shader lays them on a sheet of washi in printing order:
 * colour = paper x exp(-sum(coverage x ink density)). Each impression comes
 * in as a baren rubs it: zigzag rows of small circular strokes leave swirled,
 * uneven ink with the grain of the cherry block in it, then a second pass
 * evens it out. The block's relief is pressed into the paper (an emboss lit
 * from the upper left, or from the pointer), ink pools a little at the edges
 * of shapes, and each block lands a pixel or two out of register and settles.
 *
 * Options (data-* or the options object, which wins):
 *   src       the print's JSON (required); the strip is <src minus .json>-blocks.webp
 *   atlas     the strip's URL, if it lives elsewhere
 *   mode      'scroll' (default, a pinned runway) | 'static' (the finished print)
 *   runway    scroll length per impression, in svh (default 72)
 *   light     'pointer' (default: a raking light follows the pointer) | 'fixed'
 *   margin    sheet margin as a fraction of the print's short side (default .085)
 *   webgl     'off' forces the 2D fallback (for testing)
 *
 * Returns destroy(). Without WebGL a 2D canvas composites the still layers;
 * without JS the <img> (the original print) stays.
 */

const calm = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

function loadImage(url) {
    return new Promise((res, rej) => {
        const im = new Image();
        im.decoding = 'async';
        im.onload = () => res(im);
        im.onerror = () => rej(new Error('woodblock-print: could not load ' + url));
        im.src = url;
    });
}

/* ── Paper and wood: one tileable 1024² RGBA texture, made once ─────────────
 * R  kozo fibres (long, thin, mostly lighter than the sheet)
 * G  formation: the cloudy unevenness of hand-made paper
 * B  fine grain, specks
 * A  the grain of a cherry-wood block, running along x                      */
let noiseCache = null;
function makeNoise() {
    if (noiseCache) return noiseCache;
    const S = 1024;
    const out = new Uint8Array(S * S * 4);
    let seed = 1234567;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    // tileable value noise on a px x py lattice
    function lattice(px, py) {
        const g = new Float32Array(px * py);
        for (let i = 0; i < g.length; i++) g[i] = rnd();
        return (x, y) => { // x, y in 0..1
            const fx = x * px, fy = y * py;
            const ix = Math.floor(fx), iy = Math.floor(fy);
            const tx = fx - ix, ty = fy - iy;
            const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
            const x0 = ((ix % px) + px) % px, x1 = (x0 + 1) % px;
            const y0 = ((iy % py) + py) % py, y1 = (y0 + 1) % py;
            const a = g[y0 * px + x0], b = g[y0 * px + x1], c = g[y1 * px + x0], d = g[y1 * px + x1];
            return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
        };
    }
    const form = [lattice(6, 6), lattice(14, 14), lattice(34, 34), lattice(80, 80)];
    const grainA = lattice(3, 70), grainB = lattice(6, 190), grainC = lattice(12, 420), warp = lattice(4, 4), knots = lattice(5, 9);
    const fine = lattice(512, 512);
    for (let y = 0; y < S; y++) {
        const v = y / S;
        for (let x = 0; x < S; x++) {
            const u = x / S, k = (y * S + x) * 4;
            const f = form[0](u, v) * .42 + form[1](u, v) * .3 + form[2](u, v) * .18 + form[3](u, v) * .1;
            out[k + 1] = clamp(128 + (f - .5) * 300, 0, 255);
            out[k + 2] = clamp(128 + (fine(u, v) - .5) * 200 + (rnd() - .5) * 60, 0, 255);
            // wood: long streaks along x, gently warped, with slow ring bands
            const w = warp(u, v) - .5;
            const vv = v + w * .05;
            const kn = knots(u, v);
            const ring = .5 + .5 * Math.sin((vv * 23 + kn * 2.2) * Math.PI * 2);
            const g = grainA(u, vv) * .38 + grainB(u, vv) * .34 + grainC(u, vv) * .18 + ring * .1;
            out[k + 3] = clamp(128 + (g - .5) * 420, 0, 255);
        }
    }
    // fibres, drawn wrapped so the tile repeats
    const cv = document.createElement('canvas'); cv.width = cv.height = S;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.fillStyle = 'rgb(128,128,128)'; cx.fillRect(0, 0, S, S);
    cx.lineCap = 'round';
    for (let i = 0; i < 2600; i++) {
        const x = rnd() * S, y = rnd() * S, a = rnd() * Math.PI * 2, len = 24 + rnd() ** 2 * 150;
        const bend = (rnd() - .5) * len * .5;
        const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
        const mx = (x + x2) / 2 - Math.sin(a) * bend, my = (y + y2) / 2 + Math.cos(a) * bend;
        const light = rnd() < .78;
        cx.strokeStyle = light ? `rgba(255,255,255,${.10 + rnd() * .22})` : `rgba(0,0,0,${.05 + rnd() * .10})`;
        cx.lineWidth = .5 + rnd() * (light ? 1.3 : .8);
        for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
            if (Math.max(x, x2) + ox < -2 || Math.min(x, x2) + ox > S + 2 || Math.max(y, y2) + oy < -2 || Math.min(y, y2) + oy > S + 2) continue;
            cx.beginPath(); cx.moveTo(x + ox, y + oy); cx.quadraticCurveTo(mx + ox, my + oy, x2 + ox, y2 + oy); cx.stroke();
        }
    }
    const fd = cx.getImageData(0, 0, S, S).data;
    for (let i = 0; i < S * S; i++) out[i * 4] = fd[i * 4];
    noiseCache = { S, data: out };
    return noiseCache;
}

/* ── The shader ─────────────────────────────────────────────────────────── */
const VERT = `attribute vec2 aP; uniform vec2 uCss; varying vec2 vQ;
void main(){ vQ = (aP * .5 + .5) * uCss; vQ.y = uCss.y - vQ.y; gl_Position = vec4(aP, 0., 1.); }`;

function fragSource(N) {
    const T = Math.ceil(N / 4);
    const ch = (i) => 'rgba'[i & 3];
    let s = `precision highp float;
varying vec2 vQ;
${Array.from({ length: T }, (_, t) => `uniform sampler2D uT${t};`).join('\n')}
uniform sampler2D uNz;
uniform vec2 uCss;          // canvas size, css px
uniform vec4 uSheet;        // sheet rect in canvas css px
uniform vec4 uImg;          // print rect in canvas css px
uniform vec2 uUnit;         // print size in units of its short side
uniform vec3 uPaper;
uniform vec3 uOd[${N}];
uniform float uP[${N}];
uniform vec4 uBox[${N}];
uniform float uWet[${N}];
uniform float uBok[${N}];
uniform float uDepth[${N}];
uniform vec2 uOff;          // misregistration of the arriving block, css px
uniform vec4 uActMask;      // which channel holds it
uniform float uActTex;      // which texture holds it
uniform vec3 uLight;        // xy: towards the light (screen, y down), z: strength
uniform float uDamp;
uniform float uKento;
uniform vec2 uKpos;          // kagi corner, in print-height units from the print's top-left

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec2 hash2(vec2 p){ return vec2(hash(p), hash(p + 17.31)); }

vec2 troch(float ph, float yr, float a, float rho, float rhoy, float sd){
  float s2 = sin(ph * .17 + sd * 1.7) * .6 + sin(ph * .071 + sd * 4.3) * .4;
  float adv = ph / 6.2832 * a + a * .9 * sin(ph * .113 + sd * 2.9);   // the hand speeds up and lingers
  return vec2(adv + rho * (1. + .45 * s2) * cos(ph), yr + rhoy * sin(ph) * (.8 + .2 * sin(ph * .29 + sd)) + rhoy * .3 * sin(ph * .13 + sd * 2.));
}
// The baren. Returns (first contact, deposited fraction) for a point of a block.
// pos: position in the block's box, in units of the print's short side.
vec2 baren(vec2 pos, vec2 bsz, float p, float seed, float lowN, float midN, float tooth, float gline){
  if (p <= 0.) return vec2(0.);
  if (p >= 1.) return vec2(1.);
  // Pressure arrives as the baren works down and across the block; where it
  // gets to first is irregular (the hand presses harder here than there), so
  // the front is a wide, ragged band, never a shape.
  float fx = pos.x / max(bsz.x, .001), fy = pos.y / max(bsz.y, .001);
  float T = clamp(.68 * fy + .22 * (mod(seed, 2.) < 1. ? fx : 1. - fx) + .32 * (lowN - .5) + .12 * (midN - .5), 0., 1.);
  float P = (p - .58 * T) / .3;
  // the strokes of the baren: thin looping tracks (a prolate trochoid along
  // rows), pressing a little harder where they pass, like faint fingerprints
  float nR = max(1., floor(bsz.y / .15 + .5));
  float rs = bsz.y / nR;
  float R = rs * .8;
  float a = R * .62, rho = R * .4, rhoy = R * .5, w = R * .06;
  float r0 = floor(pos.y / rs - .5);
  float stroke = 0.;
  if (P > -.2 && P < 1.1) {
    for (int k = 0; k < 2; k++) {
      float r = clamp(r0 + float(k), 0., nR - 1.);
      float yr = (r + .5) * rs;
      float rsd = r * 1.37 + seed * 3.1;
      float x = mod(r + seed, 2.) < .5 ? pos.x : bsz.x - pos.x;
      vec2 pp = vec2(x + R, pos.y);
      float phiS = (pp.x / a - 1.2) * 6.2832;
      vec2 prev = troch(phiS, yr, a, rho, rhoy, rsd);
      for (int i = 1; i < 20; i++) {
        float ph = phiS + float(i) * .8;
        vec2 c = troch(ph, yr, a, rho, rhoy, rsd);
        vec2 ba = c - prev, pa = pp - prev;
        float d = length(pa - ba * clamp(dot(pa, ba) / (dot(ba, ba) + 1e-7), 0., 1.));
        float pr = .5 + .5 * sin(ph * .23 + rsd) * sin(ph * .57 + rsd * 2.3);
        stroke = max(stroke, exp(-d * d / (w * w)) * pr);
        prev = c;
      }
    }
  }
  float Pp = P + stroke * .13 * smoothstep(.05, .35, P) * (1. - smoothstep(.6, 1., P)) + gline * .14 * (1. - smoothstep(.6, 1., P));
  // goma-zuri: fibre by fibre the paper's tooth takes the ink; the lowest
  // fibres first, the raised ones last, so the partial state is a crisp speckle
  float cov = smoothstep(tooth - .025, tooth + .025, Pp);
  float dens = cov * (.55 + .45 * clamp(Pp, 0., 1.));
  return vec2(smoothstep(0., .3, P), dens);
}

float fp(float c){ return smoothstep(.01, .07, c); }

void main(){
  vec2 q = vQ;
  vec2 sp = q - uSheet.xy;
  vec2 sn = sp / uSheet.zw;
  float sc = uSheet.z / 1000.;                     // sheet scale
  vec4 nzS = texture2D(uNz, sn * vec2(1.7, 1.7 * uSheet.w / uSheet.z));
  vec4 nzE = texture2D(uNz, sn * vec2(5.3, 5.3 * uSheet.w / uSheet.z) + .37);

  // ── the deckle: a soft, fibrous, slightly wandering edge
  float dx = min(sp.x, uSheet.z - sp.x), dy = min(sp.y, uSheet.w - sp.y);
  float dEdge = min(dx, dy);
  // the edge wanders a little (low and middle frequencies, along the perimeter)
  vec2 pe = vec2(sn.x * uSheet.z + sn.y * uSheet.w, sn.y * uSheet.w - sn.x * uSheet.z) / 1000.;
  float wander = (texture2D(uNz, pe * .45 + vec2(.11, .29)).g - .5) * 10. * sc
               + (texture2D(uNz, pe * 1.6 + vec2(.53, .07)).g - .5) * 3. * sc
               + (nzE.g - .5) * .8 * sc;
  float de = dEdge + wander;
  float sc2 = max(sc, .45);
  // body of the sheet, then a thinner, more translucent rim, then loose fibres beyond it
  float body = smoothstep(-.6, 1.4 * sc2, de);
  float rimT = smoothstep(0., 9. * sc2, de);
  float alpha = body * mix(.62 + .38 * smoothstep(.3, .7, nzS.g + (nzE.r - .5) * .6), 1., rimT);
  float fringe = smoothstep(.56, .78, nzE.r) * (1. - smoothstep(0., 5. * sc2, -de)) * step(de, 0.);
  alpha = max(alpha, fringe * .55);
  float thin = 1. - rimT;

  // shadow (light from the upper left; the sheet lies nearly flat on the page)
  float sd = de - dot(vec2(1.2, 2.2) * sc2, vec2(sp.x < uSheet.z * .5 ? 1. : -1., sp.y < uSheet.w * .5 ? 1. : -1.) * step(abs(vec2(dx, dy) - dEdge), vec2(.001)));
  float shadow = .12 * exp(-max(-sd, 0.) / (6. * sc2)) + .06 * exp(-max(-sd, 0.) / (1.5 * sc2));
  shadow *= 1. - alpha;

  // ── paper
  float fib = nzS.r - .5, form = nzS.g - .5, grain = nzS.b - .5;
  vec3 paper = uPaper * (1. + fib * .085 + form * .045 + grain * .03);
  paper *= 1. - uDamp * (.035 + form * .03);
  paper = mix(paper, vec3(.955, .945, .92), thin * .08);

  // ── the print
  vec2 uv = (q - uImg.xy) / uImg.zw;
  vec2 ip = (q - uImg.xy);
  float ie = min(min(ip.x, uImg.z - ip.x), min(ip.y, uImg.w - ip.y));
  float inPrint = smoothstep(-.6, .6, ie + (nzE.b - .5) * 1.4 + (nzE.g - .5) * .8);
  vec2 e = vec2(1.5) / uImg.zw;
  // noise shared by all blocks (two draws; a third block in every three takes the first, inverted):
  // the mottle of uneven pressure, the cherry's grain, and the streaks of the bokashi cloth
  vec4 nzA = texture2D(uNz, uv * uUnit * .9 + vec2(.173, .311));
  vec4 nzB = texture2D(uNz, uv * uUnit * .9 + vec2(.519, .933));
  vec2 wq = vec2(uv.x * uUnit.x * .55, uv.y * uUnit.y * 1.1);
  float woodA = texture2D(uNz, wq + vec2(.29, .53)).a, woodB = texture2D(uNz, wq + vec2(.87, .06)).a;
  float wipeA = texture2D(uNz, vec2(uv.x * .35 + .41, uv.y * 2.6)).a, wipeB = texture2D(uNz, vec2(uv.x * .35 + .82, uv.y * 2.6 + .5)).a;
  float lowA = texture2D(uNz, uv * uUnit * .3 + vec2(.71, .13)).g, lowB = texture2D(uNz, uv * uUnit * .3 + vec2(.23, .62)).g;
  // the paper's tooth: which fibres take ink first (fine speckle, fibre strands)
  float t1 = texture2D(uNz, q / 512.).b, t2 = texture2D(uNz, q / 290. + .31).b;
  float tooth = clamp((t1 * .6 + t2 * .4 - .5) * 2.6 + .5 - fib * 1.1, .02, .97);
  // the cherry's grain, crisp: fine, slightly wavy parallel lines (period >= 3 css px)
  float gfreq = min(190., min(uImg.z, uImg.w) / 3.2);
  float gv = uv.y * uUnit.y;
  float gwarp = (texture2D(uNz, uv * uUnit * vec2(.6, .25)).g - .5) * 5. + (texture2D(uNz, uv * uUnit * vec2(1.7, .6) + .4).g - .5) * 1.5;
  float gA = smoothstep(.45, .95, .5 + .5 * sin((gv * gfreq + gwarp) * 6.2832)) * (.4 + 1.2 * woodA);
  float gB = smoothstep(.45, .95, .5 + .5 * sin((gv * gfreq * 1.07 + gwarp * 1.3 + .37) * 6.2832)) * (.4 + 1.2 * woodB);
`;
    // fetch packed layers: centre and four taps
    for (let t = 0; t < T; t++) {
        s += `  vec4 c${t} = texture2D(uT${t}, uv);
  vec4 xp${t} = texture2D(uT${t}, uv + vec2(e.x, 0.)), xm${t} = texture2D(uT${t}, uv - vec2(e.x, 0.));
  vec4 yp${t} = texture2D(uT${t}, uv + vec2(0., e.y)), ym${t} = texture2D(uT${t}, uv - vec2(0., e.y));
`;
    }
    s += `  vec2 uva = uv - uOff / uImg.zw;
  vec4 act = ${Array.from({ length: T }, (_, t) => `(uActTex == ${t}.? texture2D(uT${t}, uva) : `).join('')}vec4(0.)${')'.repeat(T)};
  float actC = dot(act, uActMask);
  vec3 od = vec3(0.);
  float hx = 0., hy = 0.;
  float mottle, wood;
  vec2 ar;
`;
    for (let i = 0; i < N; i++) {
        const t = i >> 2, c = ch(i);
        s += `  {
    float p = uP[${i}];
    if (p > 0.) {
      float cc = (uActMask.${c} > .5 && uActTex == ${t}.) ? actC : c${t}.${c};
      float cxp = xp${t}.${c}, cxm = xm${t}.${c}, cyp = yp${t}.${c}, cym = ym${t}.${c};
      vec4 bx = uBox[${i}];
      vec2 bsz = (bx.zw - bx.xy) * uUnit;
      vec2 pos = (uv - bx.xy) * uUnit;
      ${['vec4 nz = nzA; wood = woodA; float wp = wipeA; float lowN = lowA; float gl = gA;', 'vec4 nz = nzB; wood = woodB; float wp = wipeB; float lowN = lowB; float gl = gB;', 'vec4 nz = 1. - nzA; wood = 1. - woodA; float wp = 1. - wipeB; float lowN = 1. - lowA; float gl = gB;'][i % 3]}
      mottle = nz.g;
      ar = baren(pos, bsz, p, ${(i * 1.0 + 0.5).toFixed(1)}, lowN, mottle, tooth, gl);
      float avg = (cxp + cxm + cyp + cym) * .25;
      float rim = max(0., cc - avg) * (.35 + .45 * uWet[${i}]);
      float settle = smoothstep(.55, 1., p);
      float gr = 1. + (gl - .35) * mix(.16, .06, settle);
      // bokashi: the graded ink was wiped across the block with a damp cloth; its streaks run along the grade
      float mid = 4. * cc * (1. - cc);
      float wipe = wp - .5;
      gr += uBok[${i}] * mid * wipe * mix(.22, .1, settle);
      float d = (cc * gr + rim) * ar.y;
      d *= 1. + uWet[${i}] * .07;
      d *= 1. - fib * .22 * (1. - smoothstep(.2, .9, cc));
      od += max(d, 0.) * uOd[${i}];
      float k = uDepth[${i}] * ar.x;
      hx += k * (fp(cxp) - fp(cxm));
      hy += k * (fp(cyp) - fp(cym));
    }
  }
`;
    }
    s += `  od *= inPrint;
  hx *= inPrint; hy *= inPrint;
  vec3 col = paper * exp(-od);

  // kento: the registration marks cut in the block's margin, pressed blind into the sheet
  vec2 m = (q - uImg.xy) / uImg.w;              // print-height units, origin at the print's top-left
  float pw = uImg.z / uImg.w;
  float kx0 = -uKpos.x, ky = uKpos.y;
  // kagi: an L at the lower left; hikitsuke: a straight line along the bottom toward the right
  float dk = min(
      max(abs(m.y - ky) - .0016, max(-(m.x - (-kx0)), m.x - (-kx0 + .05))),
      max(abs(m.x + kx0) - .0016, max(-(m.y - (ky - .045)), m.y - ky)));
  float dh = max(abs(m.y - ky) - .0016, max(-(m.x - (pw * .62)), m.x - (pw * .62 + .16)));
  float kd = min(dk, dh) * uImg.w;              // css px
  float groove = (1. - smoothstep(0., 1.4 + sc, kd)) * uKento;
  float gx = (1. - smoothstep(0., 1.4 + sc, kd + .7)) - (1. - smoothstep(0., 1.4 + sc, kd - .7));

  // the block's relief pressed into the paper, lit from the light
  vec2 g = vec2(hx, hy);
  float shade = -dot(g, uLight.xy) * uLight.z * .032;
  shade += (fib * .5 + grain * .3) * uLight.z * .03;   // the paper's own tooth
  col *= 1. + clamp(shade, -.08, .08);
  col *= 1. - groove * .012;
  col *= 1. + gx * .05 * uLight.z * uKento;

  float a = alpha;
  vec3 outc = col * a + vec3(.08, .06, .045) * shadow * (1. - a);
  gl_FragColor = vec4(outc, a + shadow * (1. - a));
}`;
    return s;
}

function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    return sh;
}

/* ── The component ──────────────────────────────────────────────────────── */
export function woodblockPrint(root, opts = {}) {
    const ds = root.dataset;
    const o = {
        src: opts.src ?? ds.src,
        atlas: opts.atlas ?? ds.atlas,
        mode: opts.mode ?? ds.mode ?? 'scroll',
        runway: +(opts.runway ?? ds.runway ?? 72),
        light: opts.light ?? ds.light ?? 'pointer',
        margin: +(opts.margin ?? ds.margin ?? .085),
        webgl: (opts.webgl ?? ds.webgl ?? 'on') !== 'off' && opts.webgl !== false,
    };
    if (!o.src) return () => {};
    const atlasUrl = o.atlas || o.src.replace(/\.json$/, '-blocks.webp');
    const stage = root.querySelector('.wb-stage') || root;
    const fallbackImg = stage.querySelector('.wb-img');
    let dead = false, cleanup = [];
    const on = (t, ev, fn, opt) => { t.addEventListener(ev, fn, opt); cleanup.push(() => t.removeEventListener(ev, fn, opt)); };

    root.classList.add('wb');
    const still = () => calm.matches || o.mode === 'static';

    const canvas = document.createElement('canvas');
    canvas.className = 'wb-canvas';
    canvas.setAttribute('aria-hidden', 'true');

    let meta, strip, N = 0;
    let gl = null, prog = null, U = {}, texs = [], nzTex = null, ctx2d = null, layers2d = null;
    let texW = 0, texH = 0;
    let kpos = [-.03, 1.045];
    let css = { w: 0, h: 0 }, sheet = [0, 0, 0, 0], img = [0, 0, 0, 0], dpr = 1;
    let target = still() ? 1 : 0, shown = target, vel = 0;
    let light = { x: -.62, y: -.78, z: .9 }, lightT = { ...light };
    let visible = false, raf = 0, last = 0;

    function setRunway() {
        if (still()) { root.classList.remove('wb-scroll'); root.style.removeProperty('--wb-runway'); return; }
        root.classList.add('wb-scroll');
        root.style.setProperty('--wb-runway', `${100 + 40 + N * o.runway + 50}svh`);
    }

    function layout() {
        const r = stage.getBoundingClientRect();
        const cs = getComputedStyle(stage);
        const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
        const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
        const availW = Math.max(120, r.width - padX), availH = Math.max(120, (root.classList.contains('wb-scroll') ? innerHeight : Math.min(innerHeight, r.height || innerHeight)) - padY);
        const short = Math.min(meta.w, meta.h);
        const mx = o.margin * short / meta.w, myT = o.margin * short / meta.h, myB = o.margin * 1.55 * short / meta.h;
        // sheet in print-width units
        const sw = 1 + 2 * mx, sh = meta.h / meta.w * (1 + myT + myB);
        const scale = Math.min(availW / sw, availH / sh);
        const pad = Math.ceil(Math.max(14, scale * .02));
        const sW = sw * scale, sH = sh * scale;
        css = { w: Math.ceil(sW + pad * 2), h: Math.ceil(sH + pad * 2) };
        sheet = [pad, pad, sW, sH];
        // the kento sit in the bottom margin: the kagi near the lower-left corner, the hikitsuke along the bottom
        kpos = [-mx * .5 * meta.w / meta.h, 1 + myB * .5];
        img = [pad + mx * scale, pad + myT * meta.h / meta.w * scale, scale, meta.h / meta.w * scale];
        dpr = Math.min(2, devicePixelRatio || 1);
        canvas.style.width = css.w + 'px'; canvas.style.height = css.h + 'px';
        canvas.style.margin = `-${pad}px`;   // the shadow's pad spills into the gutter; the sheet itself fits
        canvas.width = Math.round(css.w * dpr); canvas.height = Math.round(css.h * dpr);
        const want = Math.min(meta.w, Math.round(img[2] * dpr * 1.05));
        if (!texW || want > texW * 1.15 || want < texW * .6) pack(want);
        if (gl) gl.viewport(0, 0, canvas.width, canvas.height);
    }

    // greyscale strip -> RGBA textures at about the displayed size (good downsampling, no mipmaps needed)
    function pack(w) {
        texW = w; texH = Math.round(w * meta.h / meta.w);
        const cv = document.createElement('canvas'); cv.width = texW; cv.height = texH;
        const cx = cv.getContext('2d', { willReadFrequently: true });
        cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
        const T = Math.ceil(N / 4);
        const bufs = Array.from({ length: T }, () => new Uint8Array(texW * texH * 4));
        const single = [];
        for (let i = 0; i < N; i++) {
            cx.clearRect(0, 0, texW, texH);
            const rows = Math.ceil(N / (meta.cols || 1));
            cx.drawImage(strip, Math.floor(i / rows) * (meta.w + meta.pad), (i % rows) * (meta.h + meta.pad), meta.w, meta.h, 0, 0, texW, texH);
            const d = cx.getImageData(0, 0, texW, texH).data;
            const b = bufs[i >> 2], c = i & 3;
            for (let k = 0, j = c; k < d.length; k += 4, j += 4) b[j] = d[k];
            if (!gl) single.push(d);
        }
        if (gl) {
            texs.forEach((t) => gl.deleteTexture(t));
            texs = bufs.map((b) => {
                const t = gl.createTexture();
                gl.bindTexture(gl.TEXTURE_2D, t);
                gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, texW, texH, 0, gl.RGBA, gl.UNSIGNED_BYTE, b);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                return t;
            });
        } else {
            // 2D: each block as a multiply layer, exp(-c x od)
            layers2d = single.map((d, i) => {
                const lc = document.createElement('canvas'); lc.width = texW; lc.height = texH;
                const lx = lc.getContext('2d'); const id = lx.createImageData(texW, texH);
                const od = meta.blocks[i].od;
                const lut = [0, 1, 2].map((ch) => Uint8ClampedArray.from({ length: 256 }, (_, v) => 255 * Math.exp(-v / 255 * od[ch])));
                for (let k = 0; k < d.length; k += 4) {
                    id.data[k] = lut[0][d[k]]; id.data[k + 1] = lut[1][d[k]]; id.data[k + 2] = lut[2][d[k]]; id.data[k + 3] = 255;
                }
                lx.putImageData(id, 0, 0);
                return lc;
            });
        }
    }

    function initGL() {
        const g = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false, preserveDrawingBuffer: false });
        if (!g) return false;
        const T = Math.ceil(N / 4);
        if (g.getParameter(g.MAX_TEXTURE_IMAGE_UNITS) < T + 1) return false;
        gl = g;
        try {
            prog = gl.createProgram();
            gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
            gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, fragSource(N)));
            gl.linkProgram(prog);
            if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
        } catch (err) { console.warn('woodblock-print: shader failed, using 2D', err); gl = null; return false; }
        gl.useProgram(prog);
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(prog, 'aP');
        gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        const names = ['uCss', 'uSheet', 'uImg', 'uUnit', 'uPaper', 'uOd', 'uP', 'uBox', 'uWet', 'uBok', 'uDepth', 'uOff', 'uActMask', 'uActTex', 'uLight', 'uDamp', 'uKento', 'uKpos', 'uNz'];
        for (let t = 0; t < T; t++) names.push('uT' + t);
        for (const n of names) U[n] = gl.getUniformLocation(prog, n.match(/^(uOd|uP|uBox|uWet|uBok|uDepth)$/) ? n + '[0]' : n);
        const nz = makeNoise();
        nzTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, nzTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, nz.S, nz.S, 0, gl.RGBA, gl.UNSIGNED_BYTE, nz.data);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        // static uniforms
        const short = Math.min(meta.w, meta.h);
        gl.uniform2f(U.uUnit, meta.w / short, meta.h / short);
        gl.uniform3fv(U.uPaper, meta.paper);
        gl.uniform3fv(U.uOd, meta.blocks.flatMap((b) => b.od));
        gl.uniform4fv(U.uBox, meta.blocks.flatMap((b) => b.box || [0, 0, 1, 1]));
        gl.uniform1fv(U.uBok, meta.blocks.map((b) => +(b.bokashi || 0)));
        gl.uniform1fv(U.uDepth, meta.blocks.map((b) => b.depth ?? (b.name === 'key' ? 1.6 : 1)));
        gl.uniform1i(U.uNz, 0);
        for (let t = 0; t < T; t++) gl.uniform1i(U['uT' + t], t + 1);
        return true;
    }

    // scroll position -> per-block progress
    function schedule(s) {
        const lead = 40 / (40 + N * o.runway + 50), tail = 50 / (40 + N * o.runway + 50);
        const span = 1 - lead - tail, slot = span / N;
        const P = [], W = [];
        for (let i = 0; i < N; i++) {
            const a = lead + i * slot, b = a + slot * .8;   // the last fifth: the sheet lifted, the next block inked
            const p = clamp((s - a) / (b - a));
            P.push(p);
            W.push(p <= 0 ? 0 : 1 - smooth(b, b + slot * 1.2, s));
        }
        return { P, W, damp: 1 - smooth(1 - tail * .9, 1 - tail * .2, s) };
    }

    function offsetFor(i, p) {
        const a = (i * 2.399 + .7) % (Math.PI * 2);
        const mag = (1.1 + (i * .618 % 1) * 1.1) * Math.min(1, img[2] / 700 + .35);
        const k = 1 - smooth(.05, .75, p);
        return [Math.cos(a) * mag * k, Math.sin(a) * mag * k];
    }

    function draw() {
        const { P, W, damp } = schedule(shown);
        if (gl) {
            const T = Math.ceil(N / 4);
            gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
            gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, nzTex);
            for (let t = 0; t < T; t++) { gl.activeTexture(gl.TEXTURE1 + t); gl.bindTexture(gl.TEXTURE_2D, texs[t]); }
            gl.uniform2f(U.uCss, css.w, css.h);
            gl.uniform4f(U.uSheet, ...sheet);
            gl.uniform4f(U.uImg, ...img);
            gl.uniform1fv(U.uP, P);
            gl.uniform1fv(U.uWet, W);
            let act = -1;
            for (let i = 0; i < N; i++) if (P[i] > 0 && P[i] < 1) act = i;
            if (act >= 0) {
                const [ox, oy] = offsetFor(act, P[act]);
                gl.uniform2f(U.uOff, ox, oy);
                const m = [0, 0, 0, 0]; m[act & 3] = 1;
                gl.uniform4fv(U.uActMask, m); gl.uniform1f(U.uActTex, act >> 2);
            } else { gl.uniform2f(U.uOff, 0, 0); gl.uniform4f(U.uActMask, 0, 0, 0, 0); gl.uniform1f(U.uActTex, -1); }
            gl.uniform3f(U.uLight, light.x, light.y, light.z);
            gl.uniform1f(U.uDamp, damp);
            gl.uniform1f(U.uKento, smooth(0, .3, P[0]));
            gl.uniform2f(U.uKpos, kpos[0], kpos[1]);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        } else if (ctx2d) {
            const c = ctx2d;
            c.setTransform(dpr, 0, 0, dpr, 0, 0);
            c.clearRect(0, 0, css.w, css.h);
            c.save();
            c.shadowColor = 'rgba(40,30,20,.16)'; c.shadowBlur = 8; c.shadowOffsetX = 1; c.shadowOffsetY = 2;
            c.fillStyle = `rgb(${meta.paper.map((v) => Math.round(v * 255)).join(',')})`;
            c.fillRect(...sheet);
            c.restore();
            c.globalCompositeOperation = 'multiply';
            for (let i = 0; i < N; i++) {
                if (P[i] <= 0) continue;
                c.globalAlpha = smooth(0, 1, P[i]);
                c.drawImage(layers2d[i], ...img);
            }
            c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
        }
    }

    function frame(now) {
        raf = 0;
        const dt = Math.min(.5, (now - (last || now)) / 1000); last = now;
        // the scroll is followed on a critically damped spring (solved exactly, so a
        // slow frame cannot make it lag or overshoot): jumps settle, nothing bounces
        const w = 14, x0 = shown - target, c2 = vel + w * x0, e = Math.exp(-w * dt);
        shown = target + (x0 + c2 * dt) * e;
        vel = (c2 - w * (x0 + c2 * dt)) * e;
        if (Math.abs(target - shown) < 1e-4 && Math.abs(vel) < 1e-4) { shown = target; vel = 0; }
        let moving = shown !== target;
        for (const k of ['x', 'y', 'z']) {
            const d = lightT[k] - light[k];
            light[k] += d * Math.min(1, dt * 6);
            if (Math.abs(d) > 1e-3) moving = true; else light[k] = lightT[k];
        }
        draw();
        if (moving && visible && !document.hidden) kick();
        else last = 0;
    }
    function kick() { if (!raf && !dead) raf = requestAnimationFrame(frame); }

    function readScroll() {
        if (still()) { target = 1; return; }
        const r = root.getBoundingClientRect();
        const run = r.height - innerHeight;
        target = run > 0 ? clamp(-r.top / run) : 1;
    }

    async function start() {
        try {
            meta = await (await fetch(o.src)).json();
            strip = await loadImage(atlasUrl);
        } catch (err) { console.warn(err); return; }
        if (dead) return;
        N = Math.min(12, meta.blocks.length);
        setRunway();
        stage.appendChild(canvas);
        if (!o.webgl || !initGL()) {
            ctx2d = canvas.getContext('2d');
            root.classList.add('wb-2d');
        }
        layout();
        root.classList.add('is-live');
        readScroll(); shown = target;
        draw();

        const io = new IntersectionObserver((en) => {
            visible = en[0].isIntersecting;
            if (visible) { readScroll(); kick(); }
        }, { rootMargin: '10% 0px' });
        io.observe(root); cleanup.push(() => io.disconnect());
        on(window, 'scroll', () => { if (!visible) return; readScroll(); kick(); }, { passive: true });
        let rt = 0;
        const ro = new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(() => { if (dead) return; layout(); readScroll(); shown = target; draw(); }, 80); });
        ro.observe(stage); cleanup.push(() => { ro.disconnect(); clearTimeout(rt); });
        on(document, 'visibilitychange', () => { if (!document.hidden) kick(); });
        const mq = () => { setRunway(); layout(); readScroll(); shown = target; draw(); };
        on(calm, 'change', mq);

        // a raking light that follows the pointer (fine pointers only; on touch it stays put)
        if (o.light === 'pointer' && gl) {
            on(canvas, 'pointermove', (e) => {
                if (e.pointerType !== 'mouse') return;
                const r = canvas.getBoundingClientRect();
                const cx = (e.clientX - r.left) / r.width - .5, cy = (e.clientY - r.top) / r.height - .5;
                // the lamp sits beyond the pointer; the light comes from that side, lower (stronger) near the edge
                const len = Math.hypot(cx, cy) || 1;
                lightT = { x: cx / len, y: cy / len, z: .9 + 1.1 * clamp(len * 1.6) };
                kick();
            });
            on(canvas, 'pointerleave', () => { lightT = { x: -.62, y: -.78, z: .9 }; kick(); });
        }
        canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); root.classList.remove('is-live'); });
        canvas.addEventListener('webglcontextrestored', () => {
            texs = []; texW = 0; U = {};
            if (initGL()) { layout(); root.classList.add('is-live'); draw(); }
        });
    }
    start();

    return function destroy() {
        dead = true;
        cancelAnimationFrame(raf);
        cleanup.forEach((f) => f()); cleanup = [];
        if (gl) {
            texs.forEach((t) => gl.deleteTexture(t));
            if (nzTex) gl.deleteTexture(nzTex);
            if (prog) gl.deleteProgram(prog);
            gl.getExtension('WEBGL_lose_context')?.loseContext();
        }
        canvas.remove();
        root.classList.remove('wb', 'is-live', 'wb-scroll', 'wb-2d');
        root.style.removeProperty('--wb-runway');
        if (fallbackImg) fallbackImg.style.removeProperty('display');
    };
}

/* auto-start */
const started = new WeakMap();
function boot() {
    document.querySelectorAll('[data-woodblock-print]').forEach((el) => {
        if (!started.has(el)) started.set(el, woodblockPrint(el));
    });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
