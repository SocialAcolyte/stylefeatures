/*
 *  GLOWWORM-GROTTO // the ceiling of a glowworm cave, and a torch.
 *
 *  Markup:  <figure data-glowworm-grotto>
 *             <img src="assets/grotto.webp" alt="">
 *           </figure>
 *  The baked layers sit beside the image as <name>-base.webp, <name>-glow.webp,
 *  <name>-rock.webp and <name>-maps.png. Or call glowwormGrotto(figure, opts)
 *  yourself; it returns destroy().
 *
 *  Options (data attributes, all optional; the options object wins):
 *    data-beam=".17"      the torch's radius, as a share of the figure's longer side
 *    data-lamp="1"        0-2, the torch's strength
 *    data-recover="45"    seconds for the last larva in a lit patch to relight
 *
 *  The photograph is a long exposure. Offline (see README) it was split into a
 *  near-black rock layer and a light layer (the points, the silk and their
 *  reflection), the colony's soft haze was removed, and every pixel of light was
 *  tied to one larva (a pixel of silk to the larva above it, a reflection to its
 *  larva's mirror image), each given a random threshold. The rock under the light
 *  was recovered from the red channel, which the blue-green glow barely reaches.
 *
 *  Per pixel: rock + light x (is my larva still glowing?) + torch. The torch is a
 *  warm spot that lights the rock (relief from the rock's own shading, a wet
 *  sheen), catches the droplets on the silk, and is mirrored in the still water.
 *  Where it falls, a coarse "disturbance" field rises in a second or two; once
 *  the torch moves on it ebbs, and each larva relights as it drops below that
 *  larva's own threshold, so a patch comes back slowly and unevenly.
 *
 *  Draws only while the torch moves or the colony is recovering, only on screen.
 *  Reduced motion: the torch still lights the rock and the larvae under it are
 *  dark, but nothing fades on its own. Without JS or WebGL: the photograph.
 */

const calm = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

const VERT = `
attribute vec2 p;
varying vec2 vUv;
void main() { vUv = vec2(p.x * .5 + .5, .5 - p.y * .5); gl_Position = vec4(p, 0., 1.); }`;

const FRAG = `
precision highp float;
uniform sampler2D uBase, uGlow, uRock, uMaps, uState;
uniform vec4 uCrop;        // image uv = uCrop.xy + vUv * uCrop.zw
uniform vec2 uSize;        // the figure, css px
uniform vec2 uTexel;       // one image texel, in uv
uniform vec3 uTorch;       // x, y css px; z = strength 0..1
uniform float uBeam;       // radius, css px
uniform float uLamp;
uniform vec4 uMidge;       // x, y css px; visible 0..1; wingbeat phase
varying vec2 vUv;

const vec3 LAMP = vec3(1., .74, .47);          // a warm torch, about 2700 K
vec3 lin(vec3 c) { return c * c * (c * .3 + .7); }   // close to the sRGB curve, cheap

// the beam on screen: a soft-edged spot with a hotter middle and a little spill
float beam(vec2 px) {
  float d = length(px - uTorch.xy) / uBeam;
  float spot = 1. - smoothstep(.35, 1., d);
  return uTorch.z * (spot * (.75 + .25 * (1. - smoothstep(0., .5, d))) + .05 * exp(-d * d * .4));
}
vec2 toScreen(vec2 uv) { return (uv - uCrop.xy) / uCrop.zw * uSize; }

// the rock, lit: its own shading for relief, a wet sheen on the ridges
vec3 litRock(vec2 uv, float b) {
  float a = texture2D(uRock, uv).r;
  float ax = texture2D(uRock, uv + vec2(uTexel.x, 0.)).r - texture2D(uRock, uv - vec2(uTexel.x, 0.)).r;
  float ay = texture2D(uRock, uv + vec2(0., uTexel.y)).r - texture2D(uRock, uv - vec2(0., uTexel.y)).r;
  vec3 n = normalize(vec3(-ax * 3., ay * 3., 1.));
  vec3 l = normalize(vec3(-.25, -.35, 1.));          // held a little below and to the right of the eye
  float dif = .45 + .55 * max(dot(n, l), 0.);
  float spec = pow(max(dot(n, normalize(l + vec3(0., 0., 1.))), 0.), 40.) * smoothstep(.25, .7, a);
  vec3 stone = mix(vec3(.62, .57, .5), vec3(.7, .66, .6), a);
  return LAMP * b * uLamp * (a * a * stone * dif * 2.1 + spec * .3);
}

void main() {
  vec2 uv = uCrop.xy + vUv * uCrop.zw;
  vec2 px = vUv * uSize;
  vec3 base = texture2D(uBase, uv).rgb;
  vec3 glow = texture2D(uGlow, uv).rgb;
  vec3 m = texture2D(uMaps, uv).rgb;           // r: larva threshold, g: whose light (y), b: water
  float s = texture2D(uState, vec2(uv.x, m.g)).r;
  float r = .08 + .84 * m.r;
  float on = 1. - smoothstep(r - .07, r + .07, s);
  vec3 col = base + glow * on;                  // at rest this is the photograph, unchanged
  float b = beam(px);
  vec3 add = vec3(0.);
  if (b > .002) {
    float water = m.b;
    // rock (the bed shows dimly through still water)
    add += litRock(uv, b) * (1. - .8 * water);
    // the silk and its droplets catch the torch: the light layer's own shape, lit warm
    float silk = dot(glow, vec3(.2, .4, .4)) * (1. - water);
    add += LAMP * b * uLamp * silk * silk * 2.4;
  }
  // a midge: a speck of a body and the blur of its wings, lit warm by the torch and faintly by the colony
  if (uMidge.z > .001) {
    vec2 q = px - uMidge.xy;
    float body = exp(-dot(q, q) / 1.6);
    float beat = .55 + .45 * sin(uMidge.w);
    float wings = exp(-(q.x * q.x / 9. + q.y * q.y * .8)) * beat;
    add += (LAMP * beam(uMidge.xy) * uLamp * 1.4 + vec3(.10, .26, .27)) * (body + wings * .45) * uMidge.z;
  }
  // still water mirrors the lit ceiling
  if (m.b > .01 && uTorch.z > .002) {
    vec2 muv = vec2(uv.x, m.g);
    float mb = beam(toScreen(muv));
    if (mb > .002) add += litRock(muv, mb) * .35 * m.b;
  }
  if (max(add.r, max(add.g, add.b)) < 1e-5) { gl_FragColor = vec4(col, 1.); return; }   // untouched: the photograph
  // add the torch in linear light, then back to display values (two Newton steps on lin())
  vec3 c = lin(col) + add;
  vec3 x = sqrt(c);
  x -= (x * x * (x * .3 + .7) - c) / (x * (x * .9 + 1.4) + 1e-4);
  x -= (x * x * (x * .3 + .7) - c) / (x * (x * .9 + 1.4) + 1e-4);
  gl_FragColor = vec4(x, 1.);
}`;

export function glowwormGrotto(root, opts = {}) {
  const img = root.querySelector('img');
  if (!img) return () => {};
  const ds = root.dataset;
  const num = (k, d) => (opts[k] != null ? +opts[k] : ds[k] != null && ds[k] !== '' ? +ds[k] : d);
  const BEAM = num('beam', 0.17), LAMPK = num('lamp', 1), RECOVER = num('recover', 45);
  const PREY = String(opts.prey ?? ds.prey ?? 'true') !== 'false';
  const stem = (img.currentSrc || img.src).replace(/\.[a-z]+(\?.*)?$/i, '');
  const urls = { base: stem + '-base.webp', glow: stem + '-glow.webp', rock: stem + '-rock.webp', maps: stem + '-maps.png' };

  const offs = [];
  const on = (t, e, f, o) => { t.addEventListener(e, f, o); offs.push(() => t.removeEventListener(e, f, o)); };
  let canvas, gl, prog, U = {}, texs = {}, stateTex, raf = 0, last = 0, visible = true, dead = false, io, ro;
  let W = 0, H = 0, dpr = 1, crop = [0, 0, 1, 1], IW = 2912, IH = 1632;

  // the disturbance field, over the image (not the screen): a coarse grid
  const GX = 192, GY = 108;
  const S = new Float32Array(GX * GY), S8 = new Uint8Array(GX * GY);
  let dirty = false;

  // the torch: target and shown state
  const torch = { x: 0, y: 0, want: 0, k: 0 };

  function load(src) {
    return new Promise((res, rej) => { const i = new Image(); i.decoding = 'async'; i.onload = () => res(i); i.onerror = rej; i.src = src; });
  }

  function makeTex(src, filter) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (src) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, src);
    return t;
  }

  function initGL(ims) {
    canvas = document.createElement('canvas');
    canvas.className = 'gw-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false });
    if (!gl) return false;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    for (const n of ['uBase', 'uGlow', 'uRock', 'uMaps', 'uState', 'uCrop', 'uSize', 'uTexel', 'uTorch', 'uBeam', 'uLamp', 'uMidge']) U[n] = gl.getUniformLocation(prog, n);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    const names = ['base', 'glow', 'rock', 'maps'];
    names.forEach((n, i) => { gl.activeTexture(gl.TEXTURE0 + i); texs[n] = makeTex(ims[i], gl.LINEAR); gl.uniform1i(U['u' + n[0].toUpperCase() + n.slice(1)], i); });
    gl.activeTexture(gl.TEXTURE4);
    stateTex = makeTex(null, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, GX, GY, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, S8);
    gl.uniform1i(U.uState, 4);
    IW = ims[0].naturalWidth; IH = ims[0].naturalHeight;
    gl.uniform2f(U.uTexel, 1 / IW, 1 / IH);
    return true;
  }

  // the visible part of the image, honouring object-fit: cover and object-position
  function layout() {
    const r = root.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    const ia = IW / IH, fa = W / H;
    let sw = 1, sh = 1;
    if (fa > ia) sh = ia / fa; else sw = fa / ia;
    const pos = (getComputedStyle(img).objectPosition || '50% 50%').split(' ').map((p) => (p.endsWith('%') ? parseFloat(p) / 100 : 0.5));
    crop = [(1 - sw) * pos[0], (1 - sh) * (pos[1] ?? 0.5), sw, sh];
    dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform4f(U.uCrop, crop[0], crop[1], crop[2], crop[3]);
    gl.uniform2f(U.uSize, W, H);
    draw();
  }

  const beamR = () => BEAM * Math.max(W, H * 1.2);

  // the same spot as the shader, for the field
  function beamAt(px, py) {
    const d = Math.hypot(px - torch.x, py - torch.y) / beamR();
    const t = clamp((d - 0.35) / 0.65), spot = 1 - t * t * (3 - 2 * t);
    return torch.k * spot;
  }

  // advance the field by dt seconds; returns true while anything is still changing
  function step(dt) {
    const rise = calm.matches ? 1 : 1 - Math.exp(-dt / 0.9);
    const fall = calm.matches ? 1 : dt / RECOVER;
    let busy = false;
    const R = beamR(), lit = torch.k > 0.001;
    for (let j = 0; j < GY; j++) {
      const v = (j + 0.5) / GY, py = (v - crop[1]) / crop[3] * H;
      for (let i = 0; i < GX; i++) {
        const k = j * GX + i;
        let s = S[k], b = 0;
        if (lit) {
          const px = ((i + 0.5) / GX - crop[0]) / crop[2] * W;
          if (Math.abs(px - torch.x) < R && Math.abs(py - torch.y) < R) b = beamAt(px, py);
        }
        if (b > s) { s += (b - s) * rise; if (b - s < 0.002) s = b; else busy = true; }
        else if (s > b) { s = Math.max(b, s - fall); if (s > b) busy = true; }
        if (s !== S[k]) { S[k] = s; const q = Math.round(s * 255); if (q !== S8[k]) { S8[k] = q; dirty = true; } }
      }
    }
    return busy;
  }

  function draw() {
    if (!gl) return;
    if (dirty) { gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, stateTex); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, GX, GY, gl.LUMINANCE, gl.UNSIGNED_BYTE, S8); dirty = false; }
    gl.uniform3f(U.uTorch, torch.x, torch.y, torch.k);
    gl.uniform1f(U.uBeam, beamR());
    gl.uniform1f(U.uLamp, LAMPK);
    if (prey) gl.uniform4f(U.uMidge, (prey.x - crop[0]) / crop[2] * W, (prey.y - crop[1]) / crop[3] * H, prey.vis, prey.beat);
    else gl.uniform4f(U.uMidge, 0, 0, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // one tick with a given dt (also used by tests to step the clock by hand)
  function tick(dt) {
    const ease = calm.matches ? 1 : 1 - Math.exp(-dt / 0.18);
    torch.k += (torch.want - torch.k) * ease;
    if (Math.abs(torch.want - torch.k) < 0.002) torch.k = torch.want;
    const busy = step(dt);
    const flying = prey ? stepPrey(dt) : false;
    draw();
    return busy || flying || torch.k !== torch.want;
  }

  function frame(t) {
    raf = 0;
    const dt = last ? Math.min(0.05, (t - last) / 1000) : 1 / 60;
    last = t;
    if (tick(dt) && visible && !document.hidden) raf = requestAnimationFrame(frame);
    else last = 0;
  }
  function kick() { if (!raf && gl && visible && !document.hidden) raf = requestAnimationFrame(frame); }

  // ---- a catch: now and then a midge flies up out of the dark toward a glowing larva, sticks on
  // one of its snares, struggles, and is hauled up to it (minutes in life; about ten seconds here)
  let prey = null, preyTimer = 0, larvaePts = null;
  const live = document.createElement('span');
  live.setAttribute('aria-live', 'polite');
  live.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap';
  function findLarvae(glowImg) {
    // the brightest points of the photograph's light layer on the ceiling: where the larvae are
    const w = 728, h = Math.round(w * IH / IW), c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(glowImg, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h).data, L = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) L[i] = d[i * 4] * 0.2 + d[i * 4 + 1] * 0.4 + d[i * 4 + 2] * 0.4;
    const pts = [];
    for (let j = 4; j < h * 0.62; j++) for (let i = 4; i < w - 4; i++) {
      const v = L[j * w + i];
      if (v < 70) continue;
      let peak = true;
      for (let b = -3; b <= 3 && peak; b++) for (let a = -3; a <= 3; a++) if ((a || b) && L[(j + b) * w + i + a] > v) { peak = false; break; }
      if (peak) pts.push([(i + 0.5) / w, (j + 0.5) / h]);
    }
    return pts;
  }
  function startPrey() {
    if (prey || calm.matches || !larvaePts || !larvaePts.length) return false;
    const R = () => Math.random();
    const ok = larvaePts.filter(([u, v]) => {
      const su = (u - crop[0]) / crop[2], sv = (v - crop[1]) / crop[3];
      if (su < 0.12 || su > 0.88 || sv < 0.1 || sv > 0.6) return false;
      return S[Math.min(GY - 1, Math.floor(v * GY)) * GX + Math.min(GX - 1, Math.floor(u * GX))] < 0.05;   // a larva that is glowing
    });
    if (!ok.length) return false;
    const [u, v] = ok[Math.floor(R() * ok.length)];
    const ty = v + (0.035 + R() * 0.05) * crop[3];                       // a droplet a little way down its snare
    const sx = u + (R() - 0.5) * 0.18 * crop[2], sy = crop[1] + crop[3] * 0.98;
    prey = { phase: 'fly', age: 0, u, v, tx: u, ty, sx, sy, x: sx, y: sy, vis: 0, beat: 0, fly: 3.6 + R() * 1.6, seed: R() * 100 };
    kick();
    return true;
  }
  function stepPrey(dt) {
    const p = prey;
    p.age += dt; p.beat += dt * 230;
    if (p.phase === 'fly') {
      // up from the stream toward the light, wandering as a midge does
      const k = clamp(p.age / p.fly), e = k * k * (3 - 2 * k), wob = (1 - k) * 0.018;
      p.x = p.sx + (p.tx - p.sx) * e + (Math.sin(p.age * 7.3 + p.seed) + 0.3 * Math.sin(p.age * 17 + p.seed)) * wob * crop[2] * 0.6;
      p.y = p.sy + (p.ty - p.sy) * e + Math.cos(p.age * 5.1 + p.seed) * wob * crop[3];
      p.vis = clamp(p.age / 0.8);
      if (k >= 1) { p.phase = 'stuck'; p.age = 0; }
    } else if (p.phase === 'stuck') {
      // caught on the droplets: it struggles, less and less
      const sh = Math.exp(-p.age * 0.9) * (0.6 + 0.4 * Math.sin(p.age * 4.3));
      p.x = p.tx + Math.sin(p.age * 40) * 0.0011 * sh * crop[2];
      p.y = p.ty;
      if (p.age > 2.4) { p.phase = 'haul'; p.age = 0; }
    } else if (p.phase === 'haul') {
      // the larva takes the line into its mouth, in small tugs
      const k = clamp(p.age / 7.5), pulled = k - Math.sin(k * Math.PI * 6) * 0.012;
      p.x = p.tx; p.y = p.ty + (p.v - p.ty) * clamp(pulled);
      p.vis = 1 - clamp((k - 0.85) / 0.15);
      if (k >= 1) {
        p.phase = 'done'; p.age = 0; p.vis = 0;
        root.dispatchEvent(new CustomEvent('glowworm-grotto:catch', { bubbles: true }));
        live.textContent = 'A glowworm has caught a midge.';
      }
    } else if (p.age > 0.3) { prey = null; schedulePrey(); return false; }
    return true;
  }
  function schedulePrey(delay) {
    clearTimeout(preyTimer);
    if (!PREY || calm.matches || dead) return;
    preyTimer = setTimeout(() => { if (visible && !document.hidden && startPrey()) return; schedulePrey(); }, delay ?? 40000 + Math.random() * 70000);
  }

  function point(e) {
    const r = root.getBoundingClientRect();
    torch.x = e.clientX - r.left; torch.y = e.clientY - r.top;
  }

  async function start() {
    let ims;
    try {
      if (!img.complete) await new Promise((res) => img.addEventListener('load', res, { once: true }));
      ims = await Promise.all([urls.base, urls.glow, urls.rock, urls.maps].map(load));
    } catch (e) { return; }
    if (dead) return;
    try { if (!initGL(ims)) return; } catch (e) { console.warn('glowworm-grotto:', e.message); return; }
    root.appendChild(canvas);
    root.appendChild(live);
    root.classList.add('is-live');
    try { larvaePts = findLarvae(ims[1]); } catch (e) { larvaePts = []; }
    schedulePrey(14000 + Math.random() * 16000);   // the first one comes sooner, so a visitor who lingers sees one
    if (!root.hasAttribute('tabindex')) root.tabIndex = 0;
    layout();

    on(root, 'pointerenter', (e) => { point(e); if (e.pointerType === 'mouse') { torch.want = 1; kick(); } });
    on(root, 'pointermove', (e) => { point(e); if (e.pointerType === 'mouse' || e.buttons) { torch.want = 1; kick(); } });
    on(root, 'pointerdown', (e) => { point(e); torch.want = 1; kick(); });
    const off = () => { torch.want = 0; kick(); };
    on(root, 'pointerleave', off);
    on(root, 'pointerup', (e) => { if (e.pointerType !== 'mouse') off(); });
    on(root, 'pointercancel', off);
    // keyboard: the arrows carry the torch, Escape puts it out
    on(root, 'keydown', (e) => {
      const stepPx = Math.max(W, H) * 0.04;
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (d) {
        if (!torch.want) { torch.x = W / 2; torch.y = H * 0.4; }
        torch.want = 1;
        torch.x = clamp(torch.x + d[0] * stepPx, 0, W); torch.y = clamp(torch.y + d[1] * stepPx, 0, H);
        e.preventDefault(); kick();
      } else if (e.key === 'Escape' && torch.want) { off(); }
    });
    on(root, 'blur', () => { if (torch.want) off(); });
    on(canvas, 'webglcontextlost', (e) => { e.preventDefault(); cancelAnimationFrame(raf); raf = 0; root.classList.remove('is-live'); });
    on(document, 'visibilitychange', () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; last = 0; } else kick(); });
    on(calm, 'change', kick);
    ro = new ResizeObserver(() => layout());
    ro.observe(root);
    io = new IntersectionObserver((en) => {
      visible = en[0].isIntersecting;
      if (!visible) { cancelAnimationFrame(raf); raf = 0; last = 0; } else kick();
    });
    io.observe(root);
  }
  start();

  function destroy() {
    dead = true;
    cancelAnimationFrame(raf); raf = 0; clearTimeout(preyTimer);
    offs.forEach((f) => f()); offs.length = 0;
    live.remove();
    io && io.disconnect(); ro && ro.disconnect();
    if (gl) { const x = gl.getExtension('WEBGL_lose_context'); x && x.loseContext(); }
    canvas && canvas.remove();
    root.classList.remove('is-live');
    if (root.tabIndex === 0 && !root.hasAttribute('data-gw-tab')) root.removeAttribute('tabindex');
  }
  // for tests and for pages that want to drive it: move the torch and step the clock by hand
  destroy.torch = (x, y, k = 1) => { torch.x = x; torch.y = y; torch.want = k; kick(); };
  destroy.step = (dt) => { cancelAnimationFrame(raf); raf = 0; return tick(dt); };
  destroy.canvas = () => canvas;
  destroy.prey = () => startPrey();
  Object.defineProperty(destroy, 'state', { get: () => ({ torch: torch.k, prey: prey ? prey.phase : null, preyAt: prey ? [(prey.x - crop[0]) / crop[2], (prey.y - crop[1]) / crop[3]] : null, running: raf !== 0, larvae: larvaePts ? larvaePts.length : 0 }) });
  Object.defineProperty(destroy, 'running', { get: () => raf !== 0 });
  return destroy;
}

function auto() {
  document.querySelectorAll('[data-glowworm-grotto]').forEach((el) => {
    if (el.__gw) return;
    el.__gw = glowwormGrotto(el);
  });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto, { once: true });
else auto();
