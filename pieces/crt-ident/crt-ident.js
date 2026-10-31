/* crt-ident: a logo on a colour television of the mid-1980s.
 *
 *   <div data-crt-ident><svg ...the logo...></svg></div>
 *   <div data-crt-ident><img src="logo.png" alt="Acme"></div>
 *   <div data-crt-ident>Text</div>
 *
 * The logo is put into a 4:3 picture, carried as a composite signal would carry it, and
 * written by the beams of an aperture-grille tube: 240 lines whose spot swells with the
 * current, light from vertical phosphor stripes, two damper-wire shadows, halation in the
 * faceplate, a little misconvergence toward the corners, a gently curved face. It warms up
 * when it first comes into view; the button over the glass switches it off (to a line, then
 * a dot that fades) and on again. mode="vector" draws the logo's outlines on a colour X-Y
 * monitor instead, as the arcade machines of the early eighties did.
 *
 * Without JS the logo is the logo. Without WebGL2 a still picture is drawn in a canvas.
 * The original stays in the DOM as the accessible content.
 *
 * Options (data-* attributes, or the options object, which wins):
 *   mode        'raster' (default) | 'vector'
 *   power       'auto' (on when first seen, default) | 'on' | 'off'
 *   interactive 'on' (the glass is a power button, default) | 'off' (e.g. inside a link)
 *   bezel       'on' (default) | 'off' (the glass alone, for a full-bleed hero on black)
 *   fit         logo width as a fraction of the picture (default 0.62)
 *   ink         colour for text logos and currentColor (default #ece6d6)
 *   backdrop    CSS colour behind the logo in the picture (default #000)
 *
 * The factory returns destroy(), with .power(on), .on, .ready, .advance(dt) (step the clock
 * by dt seconds and draw, for fixed-step recording) and .manual (stop the real clock).
 */
import { futural } from './vendor/hershey/hershey.js';

const calm = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
const N = 240;                 // picture lines: a 262-line field, the same lines every field
const SAMPLES = 720;           // BT.601 active samples per line
const TAU = [9e-3, 2.6e-3, 2.2e-3];   // effective visible persistence: Y2O2S:Eu, ZnS:Cu,Al, ZnS:Ag

/* ── shaders ──────────────────────────────────────────────────────────────── */
const VQ = `#version 300 es
layout(location = 0) in vec2 aP; void main(){ gl_Position = vec4(aP, 0., 1.); }`;

const ERF = `
float erf1(float x){ float t = 1. / (1. + .3275911 * abs(x)); float y = 1. - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - .284496736) * t + .254829592) * t * exp(-x * x); return sign(x) * y; }
vec3 erf3(vec3 x){ return vec3(erf1(x.x), erf1(x.y), erf1(x.z)); }
// a box of half width a seen through a gaussian of sigma s, at x (0..1)
float boxg(float x, float a, float s){ return .5 * (erf1((x + a) / (1.4142 * s)) - erf1((x - a) / (1.4142 * s))); }`;

/* 1. The picture to lines: 720 samples by 240 lines, each line the band of picture it covers,
 *    as luma and the two colour-difference signals (YIQ).                                  */
const F_LINES = `#version 300 es
precision highp float;
uniform sampler2D uSrc; uniform vec2 uOut;
out vec4 o;
void main(){
  vec2 st = gl_FragCoord.xy;
  float x = st.x / uOut.x, lh = 1. / uOut.y, y = floor(st.y) * lh;
  vec3 c = vec3(0.);
  for (int j = 0; j < 4; j++) c += texture(uSrc, vec2(x, y + (float(j) + .5) * .25 * lh)).rgb;
  c *= .25;
  o = vec4(mat3(.299, .596, .211, .587, -.274, -.523, .114, -.322, .312) * c, 1.);
}`;

/* 2. Along the line, the decoder's bandwidths: luma to about 4.2 MHz, chroma to well under
 *    1 MHz, as gaussians in 13.5 MHz samples. Back to R'G'B', then to light (gamma 2.4).    */
const F_BAND = `#version 300 es
precision highp float;
uniform sampler2D uLine; uniform vec2 uOut;
out vec4 o;
void main(){
  vec2 st = floor(gl_FragCoord.xy);
  float vy = (st.y + .5) / uOut.y;
  float Y = 0., wy = 0.; vec2 C = vec2(0.); float wc = 0.;
  for (int i = -10; i <= 10; i++) {
    float fi = float(i);
    vec3 s = texture(uLine, vec2((st.x + fi + .5) / uOut.x, vy)).rgb;
    float a = exp(-.5 * fi * fi / .2), b = exp(-.5 * fi * fi / 9.);
    Y += a * s.x; wy += a; C += b * s.yz; wc += b;
  }
  vec3 rgb = mat3(1., 1., 1., .956, -.272, -1.106, .621, -.647, 1.703) * vec3(Y / wy, C / wc);
  o = vec4(pow(clamp(rgb, 0., 1.), vec3(2.4)), 1.);
}`;

/* 3. Halve the lines: the vertical pyramid, for a raster squeezed thinner than a pixel. */
const F_HALF = `#version 300 es
precision highp float;
uniform sampler2D uIn; uniform float uRows;
out vec4 o;
void main(){
  ivec2 p = ivec2(gl_FragCoord.xy);
  int r0 = min(2 * p.y, int(uRows) - 1), r1 = min(2 * p.y + 1, int(uRows) - 1);
  o = .5 * (texelFetch(uIn, ivec2(p.x, r0), 0) + texelFetch(uIn, ivec2(p.x, r1), 0));
}`;

/* 4. The vector monitor: each stroke a gaussian line laid at constant light per unit length,
 *    with a dwell at each end where the beam waits for the next move.                       */
const V_VEC = `#version 300 es
in vec2 aQ; in vec4 aSeg; in vec4 aCol;
uniform vec2 uRes; uniform vec4 uMap; uniform float uS, uSig;
out vec2 vL; out float vLen; out vec4 vCol;
void main(){
  vec2 a = uMap.xy + aSeg.xy * uMap.zw * uS, b = uMap.xy + aSeg.zw * uMap.zw * uS;
  vec2 d = b - a; float L = length(d);
  vec2 t = L > 1e-4 ? d / L : vec2(1., 0.), n = vec2(-t.y, t.x);
  float r = 4. * uSig;
  vec2 p = a + t * (aQ.x > 0. ? L + r : -r) + n * aQ.y * r;
  vL = vec2(dot(p - a, t), dot(p - a, n)); vLen = L; vCol = aCol;
  gl_Position = vec4(p / uRes * 2. - 1., 0., 1.);
}`;
const F_VEC = `#version 300 es
precision highp float;
in vec2 vL; in float vLen; in vec4 vCol;
uniform float uSig, uS;
out vec4 o;
${ERF}
void main(){
  float s = uSig;
  float across = exp(-.5 * vL.y * vL.y / (s * s)) / (2.5066 * s);
  float along = .5 * (erf1(vL.x / (1.4142 * s)) - erf1((vL.x - vLen) / (1.4142 * s)));
  float dw = vCol.a > 1. ? exp(-.5 * dot(vL, vL) / (s * s)) / (6.2832 * s * s) * (vCol.a - 1.) : 0.;
  float line = vCol.a > 1. ? 0. : vCol.a * along * across;
  o = vec4(vCol.rgb * (line + dw) * 2.4 / max(uS, 1e-3), 1.);
}`;

/* 5. The beams. For each device pixel: where it lies on the (curved) raster, which lines pass
 *    near it, and the light of each line's spot integrated over the pixel's height. The spot
 *    widens with the current. Red and blue land a little off green toward the corners. When
 *    the raster is squeezed below a pixel a line, the lines are averaged instead. The result
 *    is added to what is left of the last frame (phosphor persistence, red the longest).   */
const F_BEAM = `#version 300 es
precision highp float;
uniform sampler2D uSig, uPrev, uEmit;
uniform vec2 uRes;
uniform vec4 uGlass;      // centre x, y, half w, half h (device px, y down)
uniform vec2 uOver;       // raster half size over glass half size
uniform vec4 uWarp;       // curvature: x by y², x by x², y by x², y by y²
uniform vec2 uDefl;       // horizontal, vertical deflection (1 = full)
uniform float uPitch;     // line pitch at full deflection, device px
uniform float uAtlasH;
uniform float uOff[9];
uniform float uRows[9];
uniform vec2 uConv;       // red, blue misconvergence at the corners, px
uniform vec2 uWob;        // wobble px, phase
uniform float uGain;
uniform vec3 uKeep;
uniform float uVec;
out vec4 o;
${ERF}
vec3 row(float x, float r, int lev){
  float rr = clamp(r, .5, uRows[lev] - .5);
  return texture(uSig, vec2(x, (uOff[lev] + rr) / uAtlasH)).rgb;
}
void main(){
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 d = p - uGlass.xy;
  vec2 q = d / uGlass.zw;
  q.x += uWob.x * sin(6.2832 * (q.y * .5 + uWob.y)) / uGlass.z;
  vec2 r = vec2(q.x * (1. + uWarp.x * q.y * q.y + uWarp.y * q.x * q.x),
                q.y * (1. + uWarp.z * q.x * q.x + uWarp.w * q.y * q.y));
  vec3 E = vec3(0.);
  if (uVec > .5) {
    vec2 pw = uGlass.xy + r * uGlass.zw;
    E = texture(uEmit, vec2(pw.x, uRes.y - pw.y) / uRes).rgb;
  } else {
    vec2 rr = r / uOver;                       // -1..1 over the raster at full deflection
    vec2 rd = rr / max(uDefl, vec2(1e-4));     // -1..1 over the raster as deflected now
    float jy = 1. + uWarp.z * q.x * q.x + 3. * uWarp.w * q.y * q.y;
    float jx = 1. + uWarp.x * q.y * q.y + 3. * uWarp.y * q.x * q.x;
    float f = jy / (uPitch * max(uDefl.y, 1e-4));        // lines per device px, here
    float L = (rd.y + 1.) * .5 * float(${N});
    vec2 c2 = rr * rr * sign(rr);
    vec3 cx = vec3(uConv.x, 0., uConv.y) * c2.x / (uGlass.z * uOver.x * 2. * uDefl.x);
    vec3 cy = vec3(uConv.x, 0., uConv.y) * c2.y * .7 * f;
    float xs = (rd.x + 1.) * .5;
    float fx = float(${SAMPLES}) * .5 * jx / (uGlass.z * uOver.x * max(uDefl.x, 1e-4));   // samples per px
    // across: the picture's edges, softened by the spot; squeezed, the light piles up
    float sx = .38 * uPitch / (uGlass.z * uOver.x * max(uDefl.x, 1e-4));
    float hx = boxg(rd.x, 1., max(sx, 1e-4)) / max(uDefl.x, 1e-4);
    float ps = 1. / f;                                   // line pitch here, px
    float wl = smoothstep(1.5, 2.4, ps);
    if (wl > 0.) {
      vec3 El = vec3(0.);
      float kc = floor(L);
      for (int j = -2; j <= 2; j++) {
        float k = kc + float(j);
        if (k < 0. || k > float(${N - 1})) continue;
        vec3 I = vec3(row(xs + cx.r, k + .5, 0).r, row(xs, k + .5, 0).g, row(xs + cx.b, k + .5, 0).b);
        vec3 sg = uPitch * (.11 + .17 * sqrt(I)) * f;     // spot sigma, in lines
        sg = sqrt(sg * sg + .0025);
        vec3 dd = L - (k + .5) - cy;
        El += I * .5 * (erf3((dd + .5 * f) / (1.4142 * sg)) - erf3((dd - .5 * f) / (1.4142 * sg)));
      }
      E += wl * El * uPitch;
    }
    if (wl < 1.) {
      int lev = int(clamp(ceil(log2(max(f, 1.))), 0., 8.));
      float sc = exp2(float(lev));
      vec3 I = vec3(0.);
      if (fx > 2.) {                                     // squeezed across as well: average
        for (int i = -2; i <= 2; i++) I += row(xs + float(i) * .2 * fx / float(${SAMPLES}), L / sc, lev);
        I *= .2;
      } else I = vec3(row(xs + cx.r, L / sc, lev).r, row(xs, L / sc, lev).g, row(xs + cx.b, L / sc, lev).b);
      float st = sqrt(pow(uPitch * .25 * f, 2.) + f * f / 12.);
      float cov = boxg(L - float(${N}) * .5, float(${N}) * .5, st);
      E += (1. - wl) * I * cov * f * uPitch;
    }
    E *= hx;
  }
  E *= uGain;
  o = vec4(E + uKeep * texelFetch(uPrev, ivec2(gl_FragCoord.xy), 0).rgb, 1.);
}`;

/* 6. The glass. The light comes only from the stripe under each beam (or the dot, for the
 *    shadow-mask tube); two damper wires cross the grille; light scattered in the faceplate
 *    comes out round bright things; the face is a dark grey-green with the room in it, and
 *    darker where it turns away at the corners.                                          */
const F_GLASS = `#version 300 es
precision highp float;
uniform sampler2D uE;
uniform vec2 uRes;
uniform vec4 uGlass;
uniform vec2 uShape;      // corner radius px, bow of the edges
uniform vec4 uMask;       // pitch px, strength, type (0 grille, 1 dots), wire width px
uniform float uWire;
uniform vec4 uHalo;       // near strength, near lod, wide strength, wide lod
uniform vec2 uDeg;        // purity error amplitude, phase
uniform vec3 uBlack;
uniform float uRefl, uBez, uSeed;
uniform vec4 uDot;        // energy, sigma px, near halo sigma px, wide halo sigma px
out vec4 o;
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + uSeed) * 43758.5453); }
float stripe(float x0, float a, float w, float P){
  float s = 0.;
  for (int k = -1; k <= 1; k++) {
    float lo = a + float(k) * P + floor(x0 / P) * P;
    s += max(0., min(x0 + 1., lo + w) - max(x0, lo));
  }
  return s;
}
vec3 blur(vec2 uv, float l){
  // two rings of taps one level finer than the radius: round, with no texel showing
  float lf = max(l - 1., 0.);
  vec2 t = exp2(lf) / uRes;
  vec3 s = textureLod(uE, uv, lf).rgb * .16;
  for (int i = 0; i < 6; i++) {
    float a = float(i) * 1.0472, b = a + .5236;
    s += textureLod(uE, uv + vec2(cos(a), sin(a)) * t * 1.3, lf).rgb * .09;
    s += textureLod(uE, uv + vec2(cos(b), sin(b)) * t * 2.7, lf).rgb * .05;
  }
  return s;
}
void main(){
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 d = p - uGlass.xy;
  vec2 q = d / uGlass.zw;
  // the glass outline: a rounded rectangle whose edges bow out a little at their middles
  vec2 half_ = uGlass.zw * (1. + uShape.y * (1. - q.yx * q.yx));
  vec2 b = abs(d) - half_ + uShape.x;
  float sd = length(max(b, 0.)) + min(max(b.x, b.y), 0.) - uShape.x;
  float cover = clamp(.5 - sd, 0., 1.);
  vec3 bez = vec3(0.);
  float bezA = 0.;
  if (uBez > .5) {
    // black plastic round the tube: lit a touch from above, a dark gap at the glass
    float t = clamp(p.y / uRes.y, 0., 1.);
    bez = vec3(.0052, .005, .0047) * (1.25 - .45 * t);
    bez *= mix(.25, 1., smoothstep(0., .035 * uGlass.w, sd));
    float lip = exp(-pow((sd - .012 * uGlass.w) / (.006 * uGlass.w), 2.)) * smoothstep(0., .8, q.y);
    bez += vec3(.012, .0115, .011) * lip;
    bezA = 1.;
  }
  vec3 col = bez;
  if (sd < .5) {
    vec2 uv = gl_FragCoord.xy / uRes;
    vec3 E = texelFetch(uE, ivec2(gl_FragCoord.xy), 0).rgb;
    // purity: while the degaussing field dies, beams land partly on their neighbours' stripes
    if (uDeg.x > 0.) {
      float e = uDeg.x * (.62 * sin(2.4 * q.x + 1.7 * q.y + uDeg.y) + .38 * sin(-1.9 * q.x + 2.8 * q.y - 1.6 * uDeg.y + 1.3));
      e *= .6 + .4 * dot(q, q);
      E = (1. - abs(e)) * E + abs(e) * (e > 0. ? E.brg : E.gbr);
    }
    vec3 M = vec3(1.);
    float P = uMask.x, k = uMask.y;
    if (uMask.z < .5) {
      float w = P / 3. * .74, g0 = (P / 3. - w) * .5, x0 = floor(p.x);
      M = vec3(stripe(x0, g0, w, P), stripe(x0, P / 3. + g0, w, P), stripe(x0, 2. * P / 3. + g0, w, P)) / (w / P);
      // the damper wires, a third of the way down and a third of the way up
      float y0 = floor(p.y);
      float ww = uMask.w;
      float yw = uGlass.y - uGlass.w / 3.;
      float sh = max(0., min(y0 + 1., yw + ww * .5) - max(y0, yw - ww * .5));
      yw = uGlass.y + uGlass.w / 3.;
      sh += max(0., min(y0 + 1., yw + ww * .5) - max(y0, yw - ww * .5));
      M *= 1. - uWire * sh;
    } else {
      float a = P / 1.7320508 * 1.15, hrow = a * .8660254;
      vec2 pf = floor(p) + .5;
      float jr = floor(pf.y / hrow);
      vec3 acc = vec3(0.);
      float rad = a * .36;
      for (int jj = 0; jj <= 1; jj++) {
        float j = jr + float(jj), off = mod(j, 2.) * a * .5, i0 = floor((pf.x - off) / a);
        for (int ii = 0; ii <= 1; ii++) {
          float i = i0 + float(ii);
          float m = clamp(rad + .5 - length(pf - vec2(i * a + off, j * hrow)), 0., 1.);
          float c = mod(i - floor(j * .5) - j, 3.);
          acc += m * vec3(c < .5 ? 1. : 0., abs(c - 1.) < .5 ? 1. : 0., c > 1.5 ? 1. : 0.);
        }
      }
      M = acc / (3.14159 * rad * rad / (a * hrow) / 3.);
    }
    M = 1. + (M - 1.) * k;
    // the face turns away at its edges and is thicker at the corners: less light comes through
    float r2 = dot(q * vec2(.92, 1.), q * vec2(.92, 1.));
    float shade = (1. - .22 * r2 * r2) * mix(.45, 1., smoothstep(0., .028 * uGlass.w, -sd));
    vec3 L = E * M;
    vec3 H = blur(uv, uHalo.y) * uHalo.x + blur(uv, uHalo.w) * uHalo.z;
    // the spot left at switch-off, and its own halo (kept out of the blur: it is too small for it)
    if (uDot.x > 0.) {
      float r2d = dot(d, d);
      float s2 = uDot.y * uDot.y, n2 = uDot.z * uDot.z, w2 = uDot.w * uDot.w;
      L += vec3(1., .97, 1.) * M * uDot.x * exp(-.5 * r2d / s2) / (6.2832 * s2);
      H += vec3(1., .96, .98) * uDot.x * (uHalo.x * exp(-.5 * r2d / n2) / (6.2832 * n2) + uHalo.z * exp(-.5 * r2d / w2) / (6.2832 * w2));
    }
    L = (L + H) * shade;
    // the unlit face: the phosphor's grey through tinted glass, and the room, faintly
    vec3 room = uBlack * (1.05 - .3 * r2) * mix(.5, 1., smoothstep(0., .03 * uGlass.w, -sd));
    float win = exp(-pow((q.x + .52) / .34, 2.) - pow((q.y + .42) / .42, 2.));
    float top = exp(-pow((q.y + .93 - .05 * q.x * q.x) / .045, 2.)) * smoothstep(1., .2, abs(q.x));
    vec3 refl = vec3(.95, .97, 1.) * uRefl * (win * .7 + top * .35);
    vec3 lum = L + room + refl;
    // the eye, or a camera: hot stripes run into one another and go toward white
    float tot = lum.r + lum.g + lum.b;
    lum += .07 * max(vec3(tot) - lum, 0.) * smoothstep(.6, 3., tot);
    vec3 c = 1. - exp(-lum * 1.1);
    col = mix(bez, c, cover);
    bezA = max(bezA, cover);
  }
  col = mix(col * 12.92, 1.055 * pow(col, vec3(1. / 2.4)) - .055, step(.0031308, col));
  col += (hash(p) - .5) / 255.;
  o = vec4(col * bezA, bezA);
}`;

/* ── WebGL ────────────────────────────────────────────────────────────────── */
function gl2(canvas) {
    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: true });
    if (!gl || !gl.getExtension('EXT_color_buffer_float')) return null;
    return gl;
}
function program(gl, vs, fs) {
    const mk = (t, s) => { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); return sh; };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'aP');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, a.name); }
    return { p, u };
}
function target(gl, w, h, mip) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    return { t, fb, w, h };
}
function drop(gl, T) { if (T) { gl.deleteTexture(T.t); gl.deleteFramebuffer(T.fb); } }

/* ── the logo, as a picture ──────────────────────────────────────────────── */
const loadImg = (url) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('crt-ident: could not load ' + url)); im.src = url; });

async function svgPicture(svg, ink) {
    const vb = svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width ? svg.viewBox.baseVal : null;
    const box = svg.getBoundingClientRect();
    const w = vb ? vb.width : box.width || 300, h = vb ? vb.height : box.height || 150;
    const c = svg.cloneNode(true);
    c.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const S = 2048 / Math.max(w, h);
    c.setAttribute('width', Math.round(w * S)); c.setAttribute('height', Math.round(h * S));
    c.style.color = ink;
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(c)], { type: 'image/svg+xml' }));
    try { return { im: await loadImg(url), aspect: w / h }; } finally { URL.revokeObjectURL(url); }
}

/* ── the logo, as strokes (vector mode) ──────────────────────────────────── */
function svgStrokes(svg) {
    const els = [...svg.querySelectorAll('path,rect,circle,ellipse,polygon,polyline,line')]
        .filter((e) => !e.closest('defs,clipPath,mask,symbol'));
    const vb = svg.viewBox.baseVal;
    const strokes = [];
    for (const el of els) {
        const cs = getComputedStyle(el);
        const col = cs.stroke !== 'none' && cs.fill === 'none' ? cs.stroke : cs.fill;
        const mm = /^rgb/.test(col) ? col.match(/[\d.]+/g) : null;
        const rgb = mm ? mm.slice(0, 3).map((v) => +v / 255) : null;
        const L = el.getTotalLength();
        const n = Math.max(8, Math.ceil(L / ((vb.width || 100) / 900)));
        const a = el.getScreenCTM(), b = svg.getScreenCTM();
        const m = a && b ? b.inverse().multiply(a) : null;
        const toVb = (pt) => { const q = m ? new DOMPoint(pt.x, pt.y).matrixTransform(m) : pt; return [q.x, q.y]; };
        let cur = [], prev = null;
        for (let i = 0; i <= n; i++) {
            const pt = toVb(el.getPointAtLength(L * i / n));
            if (prev && Math.hypot(pt[0] - prev[0], pt[1] - prev[1]) > 3 * L / n + 1e-6) { if (cur.length > 1) strokes.push({ pts: cur, rgb }); cur = []; }
            cur.push(pt); prev = pt;
        }
        if (cur.length > 1) strokes.push({ pts: cur, rgb });
    }
    return strokes.map((s) => ({ pts: simplify(s.pts, (vb.width || 100) / 1600), rgb: s.rgb }));
}
function simplify(pts, eps) {                       // Ramer-Douglas-Peucker: the vertices a vector generator gets
    if (pts.length < 3) return pts;
    const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
    const st = [[0, pts.length - 1]];
    while (st.length) {
        const [a, b] = st.pop(); let md = 0, mi = -1;
        const [ax, ay] = pts[a], [bx, by] = pts[b], L = Math.hypot(bx - ax, by - ay);
        for (let i = a + 1; i < b; i++) { const dd = L > 1e-6 ? Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / L : Math.hypot(pts[i][0] - ax, pts[i][1] - ay); if (dd > md) { md = dd; mi = i; } }
        if (md > eps) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
    }
    return pts.filter((_, i) => keep[i]);
}
function hersheyStrokes(text) {                     // single-stroke letters for plain text
    const glyphs = new Map();
    futural.split('\n').forEach((line, i) => {
        const n = parseInt(line.slice(5, 8), 10), dd = line.slice(8), st = []; let cur = [];
        for (let k = 1; k < n; k++) { const a = dd[2 * k], b = dd[2 * k + 1]; if (a === ' ' && b === 'R') { if (cur.length) st.push(cur); cur = []; continue; } cur.push([a.charCodeAt(0) - 82, b.charCodeAt(0) - 82]); }
        if (cur.length) st.push(cur);
        glyphs.set(32 + i, { l: dd.charCodeAt(0) - 82, r: dd.charCodeAt(1) - 82, st });
    });
    const out = []; let x = 0;
    for (const ch of String(text).toUpperCase()) {
        const g = glyphs.get(ch.codePointAt(0)) || glyphs.get(63);
        for (const s of g.st) out.push({ pts: s.map(([px, py]) => [px + x - g.l, py]), rgb: null });
        x += g.r - g.l;
    }
    return out;
}
function parseColor(c) {
    const x = document.createElement('canvas').getContext('2d');
    x.fillStyle = c; const s = x.fillStyle;
    if (s[0] === '#') return [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16) / 255);
    const m = s.match(/[\d.]+/g); return m ? m.slice(0, 3).map((v) => +v / 255) : [1, 1, 1];
}

/* ── the component ───────────────────────────────────────────────────────── */
export function crtIdent(root, opts = {}) {
    const ds = root.dataset;
    const opt = (k, d) => (opts[k] !== undefined ? opts[k] : ds[k] !== undefined && ds[k] !== '' ? ds[k] : d);
    const vec = opt('mode', 'raster') === 'vector';
    const ink = opt('ink', '#ece6d6');
    const fit = clamp(parseFloat(opt('fit', 0.62)) || 0.62, 0.1, 0.8);
    const interactive = opt('interactive', 'on') !== 'off';
    const bezel = opt('bezel', 'on') !== 'off';
    const powerMode = opt('power', 'auto');
    const backdrop = opt('backdrop', '#000');

    root.classList.add('ci');
    if (!bezel) root.classList.add('ci-bare');
    if (vec) root.classList.add('ci-vector');
    const logo = [...root.childNodes];
    const canvas = document.createElement('canvas');
    canvas.className = 'ci-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    root.appendChild(canvas);
    let btn = null;
    if (interactive) {
        btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'ci-power';
        btn.setAttribute('aria-label', 'Television power');
        btn.setAttribute('aria-pressed', 'false');
        root.appendChild(btn);
    }
    const SRC_W = 960, SRC_H = 720;
    const srcCanvas = document.createElement('canvas'); srcCanvas.width = SRC_W; srcCanvas.height = SRC_H;
    const sctx = srcCanvas.getContext('2d');

    let gl = null, P = null, raf = 0, dead = false, visible = false, seen = false, manual = false;
    let pic = null, strokes = null, ready = false;
    let on = false, tOn = 99, tOff = 99, last = 0, dtLast = 1 / 60, settle = false;
    let W = 0, H = 0, geo = null, srcDirty = true, vecDirty = true;

    /* geometry: the glass inside the bezel, and a raster overscanned past it whose line pitch
     * lands on a simple fraction of a device pixel, so the lines never beat against the
     * screen's own rows; the overscan takes up the difference, as it does on a real set.  */
    function layout() {
        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        const r = root.getBoundingClientRect();
        let s = dpr; if (r.width * r.height * s * s > 4.2e6) s = Math.sqrt(4.2e6 / (r.width * r.height));
        W = Math.max(2, Math.round(r.width * s)); H = Math.max(2, Math.round(r.height * s));
        canvas.width = W; canvas.height = H;
        const b = bezel ? Math.round(Math.min(W, H) * 0.045) : 1;
        const bow = 0.011;
        let gw = (W - 2 * b) / (1 + bow), gh = (H - 2 * b) / (1 + bow);
        if (gw / gh > 4 / 3) gw = gh * 4 / 3; else gh = gw * 3 / 4;
        const hw = gw / 2, hh = gh / 2;
        let pitch = 2 * hh * 1.07 / N, over = 0.07;
        if (pitch >= 1.6) {
            let best = null;
            for (const den of [1, 2, 3, 4]) for (let num = Math.floor(pitch * den * 0.9); num <= Math.ceil(pitch * den * 1.1); num++) {
                const pp = num / den, ov = pp * N / (2 * hh) - 1;
                if (ov < 0.035 || ov > 0.12) continue;
                const cost = Math.abs(ov - 0.07) + den * 0.006;
                if (!best || cost < best[0]) best = [cost, pp, ov];
            }
            if (best) { pitch = best[1]; over = best[2]; }
        }
        // the grille: about a third of a line pitch in reality, but never under three device px
        const maskP = Math.max(3, Math.round(pitch * (vec ? 0.42 : 0.36)));
        const css = s / dpr;                          // device px per (capped) device px
        geo = { s, hw, hh, cx: W / 2, cy: H / 2, over, pitch, bow,
            maskP, maskK: (vec ? 0.42 : 0.6) * clamp(0.55 + 0.45 * (s - 1)), r: hh * 0.085, css };
        vecDirty = true;
        if (gl) makeTargets();
    }

    function drawSource() {
        const g = sctx;
        g.fillStyle = backdrop; g.fillRect(0, 0, SRC_W, SRC_H);
        if (!pic) return;
        let lw = SRC_W * fit, lh = lw / pic.aspect;
        if (lh > SRC_H * 0.6) { lh = SRC_H * 0.6; lw = lh * pic.aspect; }
        g.imageSmoothingQuality = 'high';
        g.drawImage(pic.im, (SRC_W - lw) / 2, (SRC_H - lh) / 2, lw, lh);
    }

    function initGL() {
        gl = gl2(canvas);
        if (!gl) return false;
        try {
            P = { beam: program(gl, VQ, F_BEAM), glass: program(gl, VQ, F_GLASS) };
            if (vec) P.vec = program(gl, V_VEC, F_VEC);
            else { P.lines = program(gl, VQ, F_LINES); P.band = program(gl, VQ, F_BAND); P.half = program(gl, VQ, F_HALF); }
        } catch (e) { console.warn(e); gl = null; return false; }
        const quad = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        P.vaoQ = gl.createVertexArray(); gl.bindVertexArray(P.vaoQ);
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        P.black = target(gl, 1, 1, false);
        if (!vec) {
            P.src = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, P.src);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            P.line = target(gl, SAMPLES, N, false);
            // the vertical pyramid, levels stacked in one atlas
            P.lev = []; P.off = []; P.rows = [];
            let rows = N, off = 0;
            for (let i = 0; i < 9; i++) { P.off.push(off); P.rows.push(rows); P.lev.push(target(gl, SAMPLES, rows, false)); off += rows; rows = Math.max(1, Math.ceil(rows / 2)); }
            P.atlasH = off;
            P.atlas = target(gl, SAMPLES, off, false);
        }
        makeTargets();
        return true;
    }
    function makeTargets() {
        if (!P) return;
        drop(gl, P.E && P.E[0]); drop(gl, P.E && P.E[1]); drop(gl, P.emit);
        P.E = [target(gl, W, H, true), target(gl, W, H, true)];
        P.cur = 0;
        for (const T of P.E) { gl.bindFramebuffer(gl.FRAMEBUFFER, T.fb); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); }
        if (vec) P.emit = target(gl, W, H, false);
    }

    function encode() {
        drawSource();
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.bindTexture(gl.TEXTURE_2D, P.src);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, srcCanvas);
        gl.bindVertexArray(P.vaoQ); gl.disable(gl.BLEND);
        gl.activeTexture(gl.TEXTURE0);
        // lines: row 0 is the top line, as the picture was uploaded
        gl.useProgram(P.lines.p);
        gl.bindFramebuffer(gl.FRAMEBUFFER, P.line.fb); gl.viewport(0, 0, SAMPLES, N);
        gl.bindTexture(gl.TEXTURE_2D, P.src);
        gl.uniform1i(P.lines.u.uSrc, 0); gl.uniform2f(P.lines.u.uOut, SAMPLES, N);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.useProgram(P.band.p);
        gl.bindFramebuffer(gl.FRAMEBUFFER, P.lev[0].fb);
        gl.bindTexture(gl.TEXTURE_2D, P.line.t);
        gl.uniform1i(P.band.u.uLine, 0); gl.uniform2f(P.band.u.uOut, SAMPLES, N);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.useProgram(P.half.p);
        for (let i = 1; i < 9; i++) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, P.lev[i].fb); gl.viewport(0, 0, SAMPLES, P.rows[i]);
            gl.bindTexture(gl.TEXTURE_2D, P.lev[i - 1].t);
            gl.uniform1i(P.half.u.uIn, 0); gl.uniform1f(P.half.u.uRows, P.rows[i - 1]);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, P.atlas.fb);
        for (let i = 0; i < 9; i++) {
            gl.bindFramebuffer(gl.READ_FRAMEBUFFER, P.lev[i].fb);
            gl.blitFramebuffer(0, 0, SAMPLES, P.rows[i], 0, P.off[i], SAMPLES, P.off[i] + P.rows[i], gl.COLOR_BUFFER_BIT, gl.NEAREST);
        }
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    }

    function buildVector() {
        if (!strokes) return;
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const s of strokes) for (const [x, y] of s.pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
        const bw = x1 - x0 || 1, bh = y1 - y0 || 1;
        let sc = 2 * fit / bw;
        if (bh * sc > 1.1) sc = 1.1 / bh;
        const data = [];
        const inkRgb = parseColor(ink);
        for (const s of strokes) {
            const rgb = s.rgb || inkRgb;
            const pts = s.pts.map(([x, y]) => [(x - (x0 + x1) / 2) * sc, (y - (y0 + y1) / 2) * sc]);
            for (let i = 0; i + 1 < pts.length; i++) data.push(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], rgb[0], rgb[1], rgb[2], 1);
            // vertices: the beam stops at each one for a moment, and the light builds up there
            for (let i = 0; i < pts.length; i++) { const e = i === 0 || i === pts.length - 1; data.push(pts[i][0], pts[i][1], pts[i][0], pts[i][1], rgb[0], rgb[1], rgb[2], e ? 1.9 : 1.35); }
        }
        P.vecN = data.length / 8;
        if (!P.vao) {
            P.vao = gl.createVertexArray(); gl.bindVertexArray(P.vao);
            const q = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, q);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, -1, 1, -1, 0, 1, 1, 1]), gl.STATIC_DRAW);
            const lq = gl.getAttribLocation(P.vec.p, 'aQ'), ls = gl.getAttribLocation(P.vec.p, 'aSeg'), lc = gl.getAttribLocation(P.vec.p, 'aCol');
            gl.enableVertexAttribArray(lq); gl.vertexAttribPointer(lq, 2, gl.FLOAT, false, 0, 0);
            P.vbuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, P.vbuf);
            gl.enableVertexAttribArray(ls); gl.vertexAttribPointer(ls, 4, gl.FLOAT, false, 32, 0); gl.vertexAttribDivisor(ls, 1);
            gl.enableVertexAttribArray(lc); gl.vertexAttribPointer(lc, 4, gl.FLOAT, false, 32, 16); gl.vertexAttribDivisor(lc, 1);
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, P.vbuf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    }

    function drawVector(scale) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, P.emit.fb); gl.viewport(0, 0, W, H);
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(P.vec.p);
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
        gl.bindVertexArray(P.vao);
        gl.uniform2f(P.vec.u.uRes, W, H);
        gl.uniform4f(P.vec.u.uMap, geo.cx, H - geo.cy, geo.hw, -geo.hw);
        gl.uniform1f(P.vec.u.uS, scale);
        gl.uniform1f(P.vec.u.uSig, Math.max(0.5, 0.4 * geo.s));
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, P.vecN);
        gl.disable(gl.BLEND);
    }

    /* the power sequences, as functions of time since the switch */
    function state() {
        const s = { sh: 1, sv: 1, gain: 1, deg: 0, ph: 0, wob: 0, dot: 0, dotS: 1 };
        if (on) {
            const t = tOn;
            if (t > 3) return s;
            // the line output stage and the EHT come up first: a bright line across the middle,
            // then the vertical sweep opens it into the picture
            s.sv = vec ? 1 : t < 0.32 ? 0.0035 : 0.0035 + 0.9965 * (1 - Math.pow(1 - clamp((t - 0.32) / 0.55), 3));
            const rise = t < 0.1 ? 0 : 1 - Math.exp(-(t - 0.1) / 0.09);
            const x = Math.max(0, t - 0.55) / 0.5;
            s.gain = rise * (1 + 0.16 * x * Math.exp(1 - x));       // the beam current overshoots, the regulator catches it
            
            // the degaussing coil's field dies away; the colours drift and settle
            s.deg = t < 0.1 ? 0 : 0.3 * Math.exp(-(t - 0.1) / 0.55);
            s.ph = 1.1 + t * 2.4;
            s.wob = 0.5 * Math.exp(-t / 0.4) * Math.sin(t * 2 * Math.PI * 50 / 7);
        } else {
            const t = tOff;
            if (t > 2.9) { s.gain = 0; return s; }
            // the vertical sweep dies first, then the horizontal; the video goes; the spot stays
            s.sv = 0.003 + 0.997 * (1 - smooth(t / 0.09));
            s.sh = 0.003 + 0.997 * (1 - smooth((t - 0.06) / 0.14));
            if (vec) { s.sv = s.sh = 0.003 + 0.997 * (1 - smooth(t / 0.16)); }
            s.gain = 1 - smooth((t - 0.15) / 0.06);
            if (t > 0.12) {
                const u = t - 0.12;
                s.dot = Math.pow(1 + u / 0.3, -1.5) * (1 - smooth((u - 1.2) / 1.5)) * smooth(u / 0.06);
                s.dotS = 1 + u * 0.7;                      // the focus goes with the charge
            }
        }
        return s;
    }

    function render() {
        if (!gl || !geo) return;
        const st = state();
        const g = geo;
        if (!vec && srcDirty) { encode(); srcDirty = false; }
        if (vec) { if (vecDirty) { buildVector(); vecDirty = false; } drawVector(Math.min(st.sh, st.sv)); }
        // the beams, onto what is left of the last frame
        const prev = P.E[P.cur], cur = P.E[P.cur ^ 1];
        P.cur ^= 1;
        gl.bindVertexArray(P.vaoQ);
        gl.bindFramebuffer(gl.FRAMEBUFFER, cur.fb); gl.viewport(0, 0, W, H);
        gl.useProgram(P.beam.p);
        let u = P.beam.u;
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, vec ? P.black.t : P.atlas.t);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, prev.t);
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, vec ? P.emit.t : P.black.t);
        gl.uniform1i(u.uSig, 0); gl.uniform1i(u.uPrev, 1); gl.uniform1i(u.uEmit, 2);
        gl.uniform2f(u.uRes, W, H);
        gl.uniform4f(u.uGlass, g.cx, g.cy, g.hw, g.hh);
        gl.uniform2f(u.uOver, 1 + g.over, 1 + g.over);
        if (vec) gl.uniform4f(u.uWarp, 0.03, 0.018, 0.04, 0.018);
        else gl.uniform4f(u.uWarp, 0.022, 0.012, 0.028, 0.004);
        gl.uniform2f(u.uDefl, st.sh, st.sv);
        gl.uniform1f(u.uPitch, g.pitch);
        if (!vec) { gl.uniform1f(u.uAtlasH, P.atlasH); gl.uniform1fv(u.uOff, P.off); gl.uniform1fv(u.uRows, P.rows); }
        gl.uniform2f(u.uConv, 0.9 * g.s, -0.7 * g.s);
        gl.uniform2f(u.uWob, st.wob * g.s, tOn * 0.7);
        gl.uniform1f(u.uGain, st.gain);
        const dt = settle ? 0 : dtLast;
        gl.uniform3f(u.uKeep, ...TAU.map((tau) => (dt > 0 ? Math.exp(-dt / tau) : 0)));
        gl.uniform1f(u.uVec, vec ? 1 : 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, cur.t); gl.generateMipmap(gl.TEXTURE_2D);
        // the glass
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H);
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(P.glass.p);
        u = P.glass.u;
        gl.uniform1i(u.uE, 0);
        gl.uniform2f(u.uRes, W, H);
        gl.uniform4f(u.uGlass, g.cx, g.cy, g.hw, g.hh);
        gl.uniform2f(u.uShape, g.r, g.bow);
        gl.uniform4f(u.uMask, g.maskP, g.maskK, vec ? 1 : 0, Math.max(0.55, 0.45 * g.s));
        gl.uniform1f(u.uWire, g.hh > 90 * g.s ? 0.5 : 0);
        const lh = Math.log2(Math.max(1, g.hh * 0.012)), lw = Math.log2(Math.max(1, g.hh * 0.05));
        gl.uniform4f(u.uHalo, vec ? 0.16 : 0.08, lh, vec ? 0.05 : 0.05, lw);
        gl.uniform2f(u.uDeg, st.deg, st.ph);
        gl.uniform3f(u.uBlack, 0.0062, 0.0079, 0.0071);
        gl.uniform1f(u.uRefl, 0.0045);
        gl.uniform1f(u.uBez, bezel ? 1 : 0);
        gl.uniform1f(u.uSeed, 0.71);
        const dsig = Math.max(0.42 * g.pitch, 1.1 * g.s) * st.dotS;
        gl.uniform4f(u.uDot, st.dot * g.hw * g.hh * (vec ? 0.03 : 0.1), dsig, Math.max(2, g.hh * 0.012) * 1.6, g.hh * 0.05);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    /* Canvas 2D: no WebGL2. The settled picture, still, with its lines. */
    function render2d() {
        const c = canvas.getContext('2d');
        if (!c || !geo) return;
        const g = geo, x = g.cx - g.hw, y = g.cy - g.hh;
        c.clearRect(0, 0, W, H);
        if (bezel) { c.fillStyle = '#121211'; c.fillRect(0, 0, W, H); }
        c.save();
        c.beginPath(); c.roundRect ? c.roundRect(x, y, 2 * g.hw, 2 * g.hh, g.r) : c.rect(x, y, 2 * g.hw, 2 * g.hh); c.clip();
        c.fillStyle = '#171a19'; c.fillRect(x, y, 2 * g.hw, 2 * g.hh);
        if (on) {
            const rx = g.hw * (1 + g.over), ry = g.hh * (1 + g.over);
            if (vec) {
                c.strokeStyle = ink; c.lineWidth = Math.max(1, g.s); c.globalCompositeOperation = 'lighter';
                if (strokes) {
                    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
                    for (const s of strokes) for (const [px, py] of s.pts) { x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py); }
                    const sc = Math.min(2 * fit / (x1 - x0 || 1), 1.1 / (y1 - y0 || 1)) * g.hw;
                    for (const s of strokes) {
                        if (s.rgb) c.strokeStyle = `rgb(${s.rgb.map((v) => Math.round(v * 255)).join(',')})`;
                        c.beginPath();
                        s.pts.forEach(([px, py], i) => c[i ? 'lineTo' : 'moveTo'](g.cx + (px - (x0 + x1) / 2) * sc, g.cy + (py - (y0 + y1) / 2) * sc));
                        c.stroke();
                    }
                }
            } else {
                drawSource();
                c.globalCompositeOperation = 'lighter';
                c.drawImage(srcCanvas, g.cx - rx, g.cy - ry, 2 * rx, 2 * ry);
                c.globalCompositeOperation = 'source-over';
                if (g.pitch >= 2.5) { c.fillStyle = 'rgba(0,0,0,.4)'; for (let yy = g.cy - ry; yy < g.cy + ry; yy += g.pitch) c.fillRect(x, Math.round(yy + g.pitch * 0.62), 2 * g.hw, Math.max(1, Math.round(g.pitch * 0.32))); }
            }
        }
        c.restore();
    }

    function draw() { if (gl) render(); else render2d(); }

    function busy() {
        if (!visible) return false;
        if (on && tOn < 3) return true;
        if (!on && tOff < 2.9) return true;
        return false;
    }

    function step(dt, paint = true) {
        if (on) tOn += dt; else tOff += dt;
        dtLast = dt;
        settle = false;
        if (paint) draw();
    }
    function rest() { settle = true; draw(); }      // the settled frame, with no trail left in it

    function tick(now) {
        raf = 0;
        if (dead || manual) return;
        const dt = Math.min(0.05, (now - last) / 1000 || 1 / 60); last = now;
        step(dt);
        if (busy()) raf = requestAnimationFrame(tick);
        else rest();
    }
    function wake() {
        if (dead || manual || raf || !ready) return;
        if (calm.matches || !busy()) { rest(); return; }
        last = performance.now();
        raf = requestAnimationFrame(tick);
    }

    function power(want) {
        want = !!want;
        if (want === on) return;
        on = want;
        if (btn) btn.setAttribute('aria-pressed', String(on));
        root.classList.toggle('is-on', on);
        if (on) tOn = 0; else tOff = 0;
        if (calm.matches) { tOn = tOff = 99; }
        root.dispatchEvent(new CustomEvent('crt-ident:power', { bubbles: true, detail: { on } }));
        wake();
        if (manual || !visible) rest();
    }

    const onClick = () => power(!on);
    if (btn) btn.addEventListener('click', onClick);
    const io = new IntersectionObserver((es) => {
        const e = es[es.length - 1];
        visible = e.isIntersecting;
        if (visible && !seen && ready && e.intersectionRatio >= 0.35) { seen = true; if (powerMode === 'auto') power(true); }
        if (visible) wake();
    }, { threshold: [0, 0.35] });
    let roFirst = true;
    const ro = new ResizeObserver(() => { if (!ready) return; if (roFirst) { roFirst = false; return; } layout(); vecDirty = true; rest(); });
    const onVis = () => { if (!document.hidden) wake(); };
    document.addEventListener('visibilitychange', onVis);
    const onCalm = () => { if (calm.matches) { tOn = tOff = 99; rest(); } };
    calm.addEventListener('change', onCalm);

    // start: fonts, the logo as a picture (or strokes), then the tube
    (async () => {
        try { await document.fonts.ready; } catch (e) { /* fine */ }
        const svg = logo.find((n) => n.nodeType === 1 && n.tagName.toLowerCase() === 'svg');
        const img = logo.find((n) => n.nodeType === 1 && n.tagName === 'IMG');
        const text = root.textContent.trim();
        if (vec) {
            strokes = svg ? svgStrokes(svg) : hersheyStrokes(text || (img && img.alt) || 'TV');
        } else if (svg) {
            pic = await svgPicture(svg, ink);
        } else if (img) {
            const im = img.complete && img.naturalWidth ? img : await loadImg(img.currentSrc || img.src);
            pic = { im, aspect: (im.naturalWidth || 4) / (im.naturalHeight || 1) };
        } else {
            // plain text: set in the element's own type, in the ink colour
            const cs = getComputedStyle(root);
            const c = document.createElement('canvas'), x = c.getContext('2d');
            const font = `${cs.fontStyle} ${cs.fontWeight} 200px ${cs.fontFamily}`;
            x.font = font; const mw = Math.ceil(x.measureText(text).width) + 20;
            c.width = mw; c.height = 260; x.font = font; x.fillStyle = ink; x.textBaseline = 'middle';
            x.fillText(text, 10, 135);
            pic = { im: c, aspect: mw / 260 };
        }
        if (dead) return;
        root.classList.add('is-live');
        layout();
        if (!initGL()) root.classList.add('is-2d');
        ready = true;
        if (powerMode === 'on') { on = true; tOn = 99; root.classList.add('is-on'); if (btn) btn.setAttribute('aria-pressed', 'true'); }
        rest();
        io.observe(root); ro.observe(root);
    })().catch((e) => { console.warn(e); root.classList.remove('is-live'); });

    function destroy() {
        dead = true;
        if (raf) cancelAnimationFrame(raf);
        io.disconnect(); ro.disconnect();
        document.removeEventListener('visibilitychange', onVis);
        calm.removeEventListener('change', onCalm);
        if (btn) { btn.removeEventListener('click', onClick); btn.remove(); }
        if (gl) { const ext = gl.getExtension('WEBGL_lose_context'); ext && ext.loseContext(); }
        canvas.remove();
        root.classList.remove('ci', 'ci-bare', 'ci-vector', 'is-live', 'is-on', 'is-2d');
        delete root.crtIdent;
    }
    destroy.power = power;
    Object.defineProperty(destroy, 'on', { get: () => on });
    Object.defineProperty(destroy, 'ready', { get: () => ready });
    Object.defineProperty(destroy, 'manual', { get: () => manual, set: (v) => { manual = !!v; if (manual && raf) { cancelAnimationFrame(raf); raf = 0; } } });
    destroy.advance = (dt, paint = true) => { visible = true; step(dt, paint); };
    destroy.rest = rest;
    root.crtIdent = destroy;
    return destroy;
}

function boot() {
    document.querySelectorAll('[data-crt-ident]').forEach((el) => { if (!el.crtIdent) crtIdent(el); });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
