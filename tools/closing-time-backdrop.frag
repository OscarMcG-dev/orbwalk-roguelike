// Closing time, seen through a stall's wet window: a shophouse row across the street, one sodium lamp, a sagging
// string of bulbs, two tired lanterns, rain; beads and runs on the glass; our own roller shutter coming down in
// front. Low resolution and 15-bit colour with a 4x4 ordered dither, like the launcher and the game's Dark PSX look.
// Inlined into public/closing-time/index.html by tools/sync-closing-time.mjs. GLSL ES 1.00 (WebGL 1).
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 u_res;     // internal resolution, px
uniform float u_time;   // seconds (wrapped at 1000)
uniform float u_shut;   // how far the shutter has come down, 0..1 of the screen height
uniform float u_vel;    // |shutter speed|, for the rattle
uniform float u_lamp;   // sodium lamp, 0..1 (JS flickers it)
uniform vec2 u_look;    // pointer, -1..1, a little parallax

const vec3 SODIUM = vec3(1.0, 0.58, 0.2);
const vec3 CANDLE = vec3(1.0, 0.78, 0.46);
const vec3 BONE = vec3(0.9, 0.86, 0.76);

float h1(float n) { return fract(sin(n * 91.345) * 47453.5453); }
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec2 h22(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y);
}
// Anti-aliased box (centre c, half size s), softened by b.
float box(vec2 p, vec2 c, vec2 s, float b) {
  vec2 d = abs(p - c) - s;
  // a blurred box thinner than its blur fades rather than smearing: keep roughly the light it had
  return (1.0 - smoothstep(-b, b, max(d.x, d.y))) * min(1.0, 1.3 * min(s.x, s.y) / max(b, 1e-4));
}
float glow(float d, float r) { return exp(-d * d / (r * r)); }
// A repeating pattern of period P seen through blur b loses its contrast: 1 sharp, 0 an even wash.
float detail(float P, float b) { return clamp(1.0 - 2.2 * b / P, 0.0, 1.0); }
float stripes(float x, float P, float b) { return mix(0.5, step(0.5, fract(x / P)), detail(P, b)); }
// A light seen through fogged or clear glass: a tight core when sharp, a flat bokeh disc with a rim when blurred.
float bokeh(float d, float core, float b) {
  float r = core + b * 0.5;
  float disc = smoothstep(r, r * 0.82, d) * (0.75 + 0.25 * smoothstep(r * 0.55, r * 0.95, d));
  return disc * pow(core / r, 0.9) * 1.6 + glow(d, core * 1.6) * (1.0 - smoothstep(0.0, 0.03, b));
}

// The street. p: x centred and aspect-scaled, y 0 (bottom) .. 1 (top). b: 0 (clear glass) .. ~0.06 (fogged).
vec3 street(vec2 p, float b, float t) {
  float asp = u_res.x / u_res.y;
  vec2 q = p + u_look * vec2(0.014, -0.008);
  float horizon = 0.3;
  vec2 L = vec2(0.3 * asp, 0.56);                    // the lamp head
  float dl = length((q - L) * vec2(0.75, 1.0));

  // Sky: damp haze, warmer low down where the market's light hangs in the rain.
  vec3 col = mix(vec3(0.085, 0.06, 0.042), vec3(0.014, 0.016, 0.024), smoothstep(0.4, 0.95, q.y));
  col += SODIUM * 0.18 * u_lamp * glow(dl, 0.55);

  // Far roofline, hazy.
  float fw = 0.11;
  float fi = floor(q.x / fw + 40.0);
  float fx = fract(q.x / fw);
  float ftop = horizon + 0.36 + 0.2 * h1(fi) + step(0.6, h1(fi + 4.0)) * 0.05 * (1.0 - abs(fx - 0.5) * 2.0);
  float far = 1.0 - smoothstep(ftop - b - 0.002, ftop + b + 0.002, q.y);
  col = mix(col, vec3(0.032, 0.027, 0.026) + SODIUM * 0.06 * u_lamp * glow(dl, 0.5), far * 0.9);

  // Near shophouses: black facades with gables, a few candle-lit windows, lamp spill.
  float cw = 0.26;
  float ci = floor(q.x / cw + 20.0);
  float cx = fract(q.x / cw);
  float top = horizon + 0.26 + 0.2 * h1(ci + 3.0);
  top += step(0.45, h1(ci + 11.0)) * 0.1 * (1.0 - abs(cx - 0.5) * 2.0);
  float near = (1.0 - smoothstep(top - b - 0.002, top + b + 0.002, q.y)) * step(horizon, q.y);
  vec3 wall = vec3(0.013, 0.012, 0.012) * (0.7 + 0.6 * noise(vec2(q.x * 26.0, q.y * 3.0)));
  wall += SODIUM * 0.14 * u_lamp * glow(dl, 0.28);
  col = mix(col, wall, near);
  // party walls between houses
  col *= 1.0 - 0.5 * near * (1.0 - smoothstep(0.0, 0.03 + b, min(cx, 1.0 - cx)));
  // windows, three a floor
  vec2 wg = vec2(cx * 3.0, (q.y - horizon - 0.15) / 0.075);
  vec2 wi = floor(wg);
  vec2 wf = fract(wg);
  float inb = step(0.0, wg.y) * step(q.y, top - 0.045) * near;
  float win = box(wf, vec2(0.5, 0.55), vec2(0.2, 0.3), b * 5.0 + 0.02) * inb;
  float r = h2(wi + ci * 7.13);
  float lit = step(0.72, r);
  float flick = 0.8 + 0.2 * sin(t * (2.0 + 5.0 * r) + r * 50.0) * sin(t * 1.3 + r * 9.0);
  vec3 wc = vec3(0.008, 0.009, 0.012) + lit * mix(CANDLE, SODIUM, fract(r * 7.0)) * 0.5 * flick;
  col = mix(col, wc, win);

  // Shopfronts at street level: warm open stalls and grey shutters already down.
  float gy = q.y - horizon;
  float shopH = 0.1;
  float front = box(vec2(cx, gy), vec2(0.5, shopH * 0.5), vec2(0.44, shopH * 0.5), b * 1.2 + 0.004);
  float shut = step(0.4, h1(ci + 21.0));
  vec3 openC = CANDLE * (0.12 + 0.3 * h1(ci + 61.0) + 0.1 * noise(vec2(q.x * 18.0, t * 0.7)));
  openC = mix(openC, vec3(0.03), box(vec2(fract(cx * 5.0), gy), vec2(0.5, 0.03), vec2(0.2, 0.03), 0.02) * 0.8 * detail(cw / 5.0, b));
  vec3 shutC = vec3(0.07, 0.066, 0.06) * (0.55 + 0.45 * stripes(gy, 1.0 / 110.0, b)) * (0.3 + 1.4 * u_lamp * glow(dl, 0.4));
  col = mix(col, mix(openC, shutC, shut), front);
  // awnings, faded oxblood and bone stripes, scalloped hem
  float hem = 0.006 * (1.0 - abs(fract(cx * 16.0) - 0.5) * 2.0);
  float awn = box(vec2(cx, gy), vec2(0.5, shopH + 0.022), vec2(0.49, 0.02 + hem), b * 1.2 + 0.003);
  vec3 awc = mix(vec3(0.2, 0.065, 0.05), vec3(0.34, 0.31, 0.25), stripes(q.x, cw / 8.0, b));
  awc *= 0.2 + 1.1 * u_lamp * glow(dl, 0.55) + 0.25 * (1.0 - shut);
  col = mix(col, awc, awn * step(horizon, q.y));
  // an enamel plate on some houses: bottle green or oxblood, a bone rim
  float hasSign = step(0.5, h1(ci + 31.0));
  float sy = horizon + shopH + 0.075;
  float plate = box(vec2(cx, gy + horizon), vec2(0.5, sy), vec2(0.2, 0.028), b * 1.2 + 0.003) * hasSign * near;
  float inner = box(vec2(cx, gy + horizon), vec2(0.5, sy), vec2(0.185, 0.019), b * 1.2 + 0.003) * hasSign * near;
  vec3 enamel = mix(vec3(0.15, 0.26, 0.18), vec3(0.34, 0.1, 0.08), step(0.5, h1(ci + 51.0)));
  float signLight = 0.35 + 1.0 * u_lamp * glow(dl, 0.5);
  col = mix(col, BONE * 0.6 * signLight, plate);
  col = mix(col, enamel * signLight, inner);

  // The wet street: near black, puddles, long reflections of every light.
  float wet = 1.0 - step(horizon, q.y);
  float depth = clamp((horizon - q.y) / horizon, 0.0, 1.0);
  float puddle = smoothstep(0.42, 0.68, noise(vec2(q.x * 5.0, q.y * 16.0)));
  vec3 road = vec3(0.022, 0.02, 0.021) * (0.8 + 0.4 * noise(q * vec2(24.0, 70.0)));
  float rip = 0.006 * sin(q.y * 220.0 + t * 4.0) * (0.3 + puddle);
  road += SODIUM * u_lamp * (0.55 * glow(q.x - L.x + rip, 0.018 + b * 0.6) * (0.25 + 0.75 * puddle) * (1.0 - depth * 0.5));
  road += SODIUM * u_lamp * 0.1 * glow(length((q - vec2(L.x, horizon)) * vec2(0.5, 2.5)), 0.3);
  road += CANDLE * 0.05 * (0.4 + puddle) * smoothstep(0.5, 1.0, noise(vec2(q.x * 9.0, 3.0)));
  // kerb
  road = mix(road, vec3(0.06, 0.055, 0.05) * (0.5 + u_lamp * glow(dl, 0.6)), box(vec2(0.0, q.y), vec2(0.0, horizon - 0.006), vec2(1.0, 0.006), 0.002 + b));
  col = mix(col, road, wet);

  // The lamp: a crooked post, the head, its bloom.
  float post = box(q, vec2(L.x, 0.5 * (L.y + horizon - 0.06)), vec2(0.0035, 0.5 * (L.y - horizon + 0.06)), 0.002 + b * 0.5);
  float arm = box(q, vec2(L.x - 0.02, L.y + 0.012), vec2(0.022, 0.003), 0.002 + b * 0.5);
  col = mix(col, vec3(0.012), max(post, arm));
  float dh = length(q - (L + vec2(-0.04, 0.0)));
  col += SODIUM * u_lamp * (bokeh(dh, 0.012, b) * 1.3 + 0.3 * glow(dh, 0.08 + b) + 0.12 * glow(dh, 0.35));

  // A sagging string of bare bulbs across the street, a few dead.
  float sx = q.x / (0.9 * asp);
  float sag = 0.72 - 0.07 * (1.0 - clamp(sx * sx, 0.0, 1.0));
  float wire = glow(abs(q.y - sag), 0.0015 + b * 0.2);
  col = mix(col, vec3(0.01), wire * 0.8);
  float bi = floor(q.x / 0.075 + 0.5);
  float bx = bi * 0.075;
  float bsx = bx / (0.9 * asp);
  vec2 bp = vec2(bx, 0.72 - 0.07 * (1.0 - clamp(bsx * bsx, 0.0, 1.0)) - 0.014);
  float alive = step(0.18, h1(bi + 5.0)) * (0.85 + 0.15 * sin(t * 3.0 + bi * 1.7));
  col += CANDLE * 0.9 * bokeh(length(q - bp), 0.0055, b) * alive;
  // two red paper lanterns, faded to oxblood
  for (int k = 0; k < 2; k++) {
    vec2 lp = k == 0 ? vec2(-0.26 * asp, 0.6) : vec2(0.07 * asp, 0.63);
    lp.x += 0.004 * sin(t * 0.9 + float(k) * 2.0);
    float lan = box(q, lp, vec2(0.016, 0.022), 0.006 + b * 0.8);
    col = mix(col, vec3(0.42, 0.09, 0.06) * (0.9 + 0.2 * sin(t * 5.0 + float(k))), lan * 0.95);
    col += vec3(0.5, 0.14, 0.06) * 0.35 * glow(length(q - lp), 0.07 + b);
  }

  // Rain in the street: thin streaks, lit where the lamp reaches.
  float colx = floor(q.x * u_res.y * 0.5 + q.y * 12.0);
  float fall = fract(q.y * 2.2 + t * (1.6 + h1(colx) * 0.6) + h1(colx + 3.0) * 9.0);
  float streak = step(0.93, fall) * step(0.82, h1(colx + 7.0));
  col += vec3(0.6, 0.55, 0.45) * streak * (0.03 + 0.35 * u_lamp * glow(dl, 0.45)) * (1.0 - smoothstep(0.0, 0.05, b));
  return col;
}

// Beads on the glass: a jittered grid of small lenses that come and go. xy: where the bead looks (inverted, like a
// lens), z: coverage, w: the glint.
vec4 beads(vec2 uv, float t, float scale, float seed) {
  vec2 g = uv * scale;
  vec2 id = floor(g) + seed;
  vec2 f = fract(g) - 0.5;
  vec2 c = (h22(id) - 0.5) * 0.55;
  float rad = 0.13 + 0.2 * h2(id + 9.0);
  float life = fract(t * 0.04 + h2(id + 3.0));
  float on = smoothstep(0.0, 0.04, life) * smoothstep(1.0, 0.75, life) * step(0.62, h2(id + 17.0));
  vec2 d = (f - c) / rad;
  float r = length(d);
  float m = smoothstep(1.0, 0.8, r) * on;
  float glint = smoothstep(0.35, 0.0, length(d - vec2(-0.35, 0.4))) * m;
  return vec4(-d * 0.05, m, glint);
}

// Runs: in each column, now and then a drop slides down in jerks and wipes a clear trail behind it.
vec4 runs(vec2 uv, float t, out float trail) {
  float asp = u_res.x / u_res.y;
  float cols = 7.0 * asp;
  float x = uv.x * cols;
  float ci = floor(x);
  float fx = fract(x) - 0.5;
  float active = step(0.35, h1(ci + 13.0));
  float speed = 0.06 + 0.06 * h1(ci + 2.0);
  float ph = t * speed + h1(ci + 7.0) * 3.0;
  float cyc = fract(ph);
  float y = 1.2 - 1.4 * (cyc + 0.025 * sin(cyc * 70.0 + ci));    // stick and slip
  float wob = (h1(ci + 4.0) - 0.5) * 0.5 + 0.1 * sin(uv.y * 11.0 + ci * 3.0);
  vec2 d = vec2((fx - wob) / cols * asp, (uv.y - y) * 0.75);
  float rad = 0.018;
  float head = smoothstep(rad, rad * 0.75, length(d)) * active;
  trail = smoothstep(rad * 0.7, rad * 0.25, abs(d.x)) * step(y, uv.y) * smoothstep(y + 0.45, y, uv.y) * active;
  float bits = trail * step(0.72, fract(uv.y * 34.0 + h1(ci)));
  float glint = smoothstep(rad * 0.45, 0.0, length(d - vec2(-rad * 0.35, rad * 0.4))) * head;
  return vec4(-d * 1.8 * head, max(head, bits * 0.7), glint);
}

// Our roller shutter: galvanised slats, soot, a touch of rust only in the grooves, the lamp raking across it, rain
// sheeting down it, an old painted stall number, and a bottom bar with a handle.
vec3 shutter(vec2 uv, float edge, float t, out float cover) {
  float asp = u_res.x / u_res.y;
  float px = 1.0 / u_res.y;
  float up = uv.y - edge;                       // height above the shutter's bottom edge
  cover = step(0.0, up);
  float barH = 0.05;
  float sy = (up - barH) * 24.0;
  float jitter = u_vel * 0.05 * (h1(floor(sy) + floor(t * 30.0)) - 0.5);
  float fs = fract(sy + jitter);
  float ridge = sin(fs * 6.2832);
  float groove = smoothstep(0.1, 0.0, fs) + smoothstep(0.9, 1.0, fs);
  vec2 sp = vec2(uv.x * asp, up);
  float grime = noise(vec2(sp.x * 5.0, sp.y * 1.4)) * 0.6 + noise(vec2(sp.x * 38.0, floor(sy) * 3.1)) * 0.4;
  vec3 steel = vec3(0.2, 0.196, 0.188) * (0.72 + 0.28 * ridge) * (0.62 + 0.5 * grime);
  steel *= 1.0 - 0.6 * groove;
  steel *= 0.65 + 0.35 * smoothstep(0.15, 0.85, noise(vec2(sp.x * 20.0, sp.y * 0.7 + 3.0)));   // damp streaks
  steel = mix(steel, vec3(0.26, 0.14, 0.07), groove * 0.22 * smoothstep(0.64, 0.82, noise(sp * vec2(8.0, 2.0))));
  float lampX = 0.3 * asp + 0.5 * asp;
  float rake = glow(length(vec2(uv.x * asp - lampX, up + 0.05) * vec2(0.55, 1.6)), 0.7);
  steel += SODIUM * u_lamp * (0.06 + 0.3 * rake) * (0.55 + 0.6 * clamp(-ridge, 0.0, 1.0));
  // rain sheeting down the slats
  float rc = floor(uv.x * u_res.x / 3.0);
  float sheet = step(0.88, fract(uv.y * 5.0 + t * (0.8 + h1(rc)) + h1(rc) * 5.0)) * step(0.72, h1(rc + 3.0));
  steel += vec3(0.5, 0.47, 0.4) * sheet * 0.12 * (0.3 + rake);
  // stall number 23, bone paint mostly gone
  vec2 pc = vec2(uv.x * asp - 0.18 * asp, up - 0.13);
  float digits = box(pc, vec2(-0.03, 0.0), vec2(0.022, 0.035), px) - box(pc, vec2(-0.034, 0.012), vec2(0.018, 0.01), px) - box(pc, vec2(-0.026, -0.012), vec2(0.018, 0.01), px);
  digits += box(pc, vec2(0.03, 0.0), vec2(0.022, 0.035), px) - box(pc, vec2(0.026, 0.012), vec2(0.018, 0.01), px) - box(pc, vec2(0.026, -0.012), vec2(0.018, 0.01), px);
  digits = clamp(digits, 0.0, 1.0) * step(0.5, noise(sp * 30.0)) * step(0.0, up - barH);
  steel = mix(steel, BONE * (0.28 + 0.4 * rake), digits * 0.3);
  // bottom bar, handle, the soot lip on its edge
  float bar = step(up, barH);
  vec3 barC = vec3(0.1, 0.096, 0.09) * (0.75 + 0.5 * smoothstep(0.0, barH, up)) + SODIUM * u_lamp * 0.22 * rake;
  float handle = box(vec2(uv.x * asp, up), vec2(0.5 * asp, barH * 0.45), vec2(0.07, 0.008), px);
  barC = mix(barC, vec3(0.36, 0.34, 0.3) + SODIUM * u_lamp * 0.25 * rake, handle);
  barC *= 1.0 - 0.7 * smoothstep(px * 2.5, 0.0, up);
  return mix(steel, barC, bar);
}

float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  float asp = u_res.x / u_res.y;
  float t = u_time;
  vec2 p = vec2((uv.x - 0.5) * asp, uv.y);
  vec2 ua = vec2(uv.x * asp, uv.y);

  // Glass: two sizes of bead and the runs bend the view and clear the fog where they sit.
  vec4 b1 = beads(ua, t, 17.0, 0.0);
  vec4 b2 = beads(ua + 3.7, t * 1.3, 31.0, 50.0);
  float trail;
  vec4 rn = runs(uv, t, trail);
  vec2 off = b1.xy * b1.z + b2.xy * b2.z + rn.xy;
  float wet = clamp(b1.z + b2.z + rn.z, 0.0, 1.0);
  float glint = clamp(b1.w + b2.w + rn.w, 0.0, 1.0);

  vec3 fog = street(p, 0.032, t);
  vec3 sharp = street(p + off, 0.0025, t);
  vec3 col = fog * 0.88 + vec3(0.03, 0.029, 0.03);                // condensation lifts the blacks
  col = mix(col, sharp, clamp(trail * 0.85, 0.0, 1.0));            // wiped glass behind a run
  col = mix(col, sharp * 1.25 + fog * 0.3, wet);                   // beads: a small sharp picture, brighter
  col *= 1.0 - 0.25 * wet * (1.0 - smoothstep(0.0, 0.5, wet));     // their dark rims
  col += BONE * 0.55 * glint;

  // The shutter comes down over it all, with a shadow on the glass under its edge.
  float edge = 1.0 - u_shut;
  float cover;
  vec3 sh = shutter(uv, edge, t, cover);
  col *= 1.0 - 0.6 * smoothstep(0.07, 0.0, edge - uv.y) * (1.0 - cover);
  col = mix(col, sh, cover);

  // Vignette, grain, then 15-bit colour with the ordered dither.
  vec2 v = uv - 0.5;
  col *= 1.0 - 0.9 * dot(v, v);
  col += (h2(gl_FragCoord.xy + fract(t * 7.0) * 100.0) - 0.5) * 0.02;
  col = floor(max(col, 0.0) * 31.0 + bayer4(gl_FragCoord.xy)) / 31.0;
  gl_FragColor = vec4(col, 1.0);
}
