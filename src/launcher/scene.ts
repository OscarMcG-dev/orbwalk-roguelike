/**
 * The 1v5.dev launcher stage: a PSX-style night scene rendered at a low internal resolution (vertex snapping,
 * affine texture mapping, Gouraud lighting, per-vertex fog) and composited to the screen with an ordered dither,
 * 15-bit colour, soft bloom, a lens flare and scanlines. Dark Frutiger Aero on top: glass, gel, chrome, bubbles,
 * aurora swooshes and a wet mirror floor.
 *
 * Loaded lazily by main.ts after first paint. It owns only pictures: selection, input and navigation live in main.ts.
 */

import {
  AdditiveBlending, BoxGeometry, BufferGeometry, Color, ColorManagement, CylinderGeometry, DoubleSide,
  Float32BufferAttribute, Group, HalfFloatType, IcosahedronGeometry, InstancedMesh, LinearFilter, Matrix4, Mesh,
  NearestFilter, OctahedronGeometry, OrthographicCamera, PerspectiveCamera, PlaneGeometry, Quaternion, Ray, Raycaster,
  RingGeometry, Scene, ShaderMaterial, Sphere, TorusGeometry, UnsignedByteType, Vector2, Vector3, WebGLRenderTarget,
  WebGLRenderer, BackSide, type Side, type Texture, type IUniform,
} from 'three';
import type { Game } from './games';
import { awning, discLabel, neonSign, shutter, tarotBack, tarotFront } from './textures';

ColorManagement.enabled = false; // every colour below is a display value; nothing is decoded or tone-mapped

export interface StageOptions {
  reduced: boolean;
  boot: boolean;
  /** Called once when the first frame is on screen. */
  onReady?: () => void;
  /** Called when the WebGL context is lost for good. */
  onLost?: () => void;
}

export interface Stage {
  setSelected(i: number): void;
  setPointer(nx: number, ny: number): void;
  setReduced(reduced: boolean): void;
  /** Index under a client-space point, or -1. */
  pick(clientX: number, clientY: number): number;
  /** Begin the launch fly-in; returns the selected prop's position in viewport fractions for the CSS flash. */
  launch(): { x: number; y: number };
  reset(): void;
  skipBoot(): void;
  /** Internal resolution, for the BIOS line. */
  lowRes(): [number, number];
  /** Dev: advance the clock by `seconds` in 60 Hz steps, then the frame as a PNG data URL at `w`×`h` (makes og.png). */
  capture(w: number, h: number, seconds?: number): string;
}

const RING_R = 3.4;
const MOON_DIR = new Vector3(-0.3, 0.12, -1).normalize();

// ---------------------------------------------------------------- shared uniforms

const G = {
  uTime: { value: 0 },
  uSnap: { value: new Vector2(160, 120) },
  uLightDir: { value: new Vector3(-0.45, 0.85, 0.5).normalize() },
  uFogColor: { value: new Color('#020c14') },
  uFogNear: { value: 9 },
  uFogFar: { value: 36 },
  uMirror: { value: 0 },
  uWobble: { value: 0 },
};

const PSX_VERT = /* glsl */ `
uniform float uTime; uniform vec2 uSnap; uniform vec3 uLightDir; uniform float uFogNear; uniform float uFogFar;
uniform float uMirror; uniform float uWobble;
uniform vec3 uColor; uniform vec3 uEmissive; uniform float uAmbient;
varying vec3 vLight; varying float vFog; varying vec3 vUvw; varying vec3 vN; varying vec3 vV; varying float vY; varying vec2 vUv;
float h31(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
void main() {
  mat4 m = modelMatrix;
#ifdef USE_INSTANCING
  m = modelMatrix * instanceMatrix;
#endif
  vec4 wp = m * vec4(position, 1.0);
  if (uWobble > 0.0) {
    float f = floor(uTime * 15.0);
    wp.xyz += (vec3(h31(position * 7.1 + f), h31(position * 3.3 + f + 1.7), h31(position * 5.9 + f + 4.1)) - 0.5) * uWobble;
  }
  vec3 n = normalize(mat3(m) * normal);
  vN = n;
  vV = cameraPosition - wp.xyz;
  vY = wp.y;
  vec3 L = uLightDir;
  if (uMirror > 0.5) L.y = -L.y;
  float up = n.y * (uMirror > 0.5 ? -1.0 : 1.0);
  float diff = max(dot(n, L), 0.0);
  vec3 bounce = vec3(0.25, 0.8, 0.9) * max(-up, 0.0) * 0.4;
  vLight = uColor * (uAmbient + diff * 0.95 + bounce) + uEmissive;
  vec4 mv = viewMatrix * wp;
  vec4 clip = projectionMatrix * mv;
  if (clip.w > 0.05) clip.xy = floor(clip.xy / clip.w * uSnap + 0.5) / uSnap * clip.w;
  vUvw = vec3(uv * clip.w, clip.w);
  vUv = uv;
  vFog = smoothstep(uFogNear, uFogFar, -mv.z);
  gl_Position = clip;
}`;

const PSX_FRAG = /* glsl */ `
uniform float uTime; uniform vec3 uFogColor; uniform float uMirror; uniform vec3 uLightDir;
uniform float uAlpha; uniform float uChrome; uniform float uGloss; uniform float uFresnel; uniform vec3 uRim; uniform float uDim;
uniform vec3 uTint;
#ifdef USE_MAP
uniform sampler2D uMap;
#endif
varying vec3 vLight; varying float vFog; varying vec3 vUvw; varying vec3 vN; varying vec3 vV; varying float vY; varying vec2 vUv;
vec3 hue(float h) { return clamp(abs(fract(h + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0); }
vec3 env(vec3 r) {
  float ay = abs(r.y);
  vec3 c = mix(vec3(0.06, 0.36, 0.40), vec3(0.01, 0.035, 0.07), smoothstep(0.0, 0.5, ay));
  c += vec3(0.85, 1.0, 1.0) * pow(max(dot(normalize(vec3(r.x, ay, r.z)), normalize(vec3(-0.3, 0.12, -1.0))), 0.0), 70.0) * 2.2;
  c += vec3(0.5, 0.9, 1.0) * smoothstep(0.1, 0.0, abs(r.y - 0.55)) * smoothstep(0.7, 0.0, abs(r.x)) * 0.22;
  if (r.y < 0.0) c *= 0.45;
  return c;
}
void main() {
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(vV);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fr = pow(1.0 - ndv, 3.0);
  vec3 col = vLight;
  float a = uAlpha;
#ifdef USE_MAP
  vec4 tx = texture2D(uMap, vUvw.xy / vUvw.z);
#endif
#ifdef DISC
  vec2 p = vUv - 0.5;
  float r = length(p) * 2.0;
  float th = atan(p.y, p.x);
  vec3 rb = hue(th / 3.14159 + ndv * 1.6 + r * 0.9 + uTime * 0.03);
  col = mix(vec3(0.55, 0.62, 0.7), rb, 0.6) * (0.35 + 0.75 * vLight) + uTint * 0.15;
  col *= 0.75 + 0.5 * smoothstep(0.25, 0.35, r);
  col = mix(col, tx.rgb, tx.a);
#elif defined(USE_MAP)
  col *= tx.rgb;
  a *= tx.a;
#endif
#ifdef FOIL
  float band = smoothstep(0.16, 0.0, abs(fract(vUv.x * 0.7 + vUv.y * 0.5 - uTime * 0.12) - 0.5));
  vec3 holo = hue(vUv.x * 0.6 + vUv.y * 0.4 + ndv * 1.8 + uTime * 0.05);
  col += holo * (0.12 + band * 0.45) * (0.4 + 0.6 * dot(col, vec3(0.33)));
#endif
  vec3 R = reflect(-V, N);
  col = mix(col, env(R) * 1.3 + uTint * 0.12, uChrome);
  vec3 L = uLightDir;
  if (uMirror > 0.5) L.y = -L.y;
  vec3 H = normalize(L + V);
  col += pow(max(dot(N, H), 0.0), 60.0) * uGloss;
  col += uRim * fr * uFresnel;
#ifdef GLASS
  a = mix(uAlpha, 1.0, fr);
#endif
#ifdef NEON
  float t = floor(uTime * 11.0);
  float flick = step(0.1, fract(sin(t * 12.9898) * 43758.5453));
  col *= mix(0.3, 1.0, flick);
#endif
  col *= uDim;
  col = mix(col, uFogColor, vFog);
  if (uMirror > 0.5) col *= clamp(1.0 + vY * 0.42, 0.0, 1.0) * 0.62;
  gl_FragColor = vec4(col, a);
}`;

interface MatOpts {
  color?: string;
  emissive?: string;
  emissiveI?: number;
  ambient?: number;
  map?: Texture;
  alpha?: number;
  glass?: boolean;
  chrome?: number;
  gloss?: number;
  fresnel?: number;
  rim?: string;
  tint?: string;
  disc?: boolean;
  foil?: boolean;
  neon?: boolean;
  additive?: boolean;
  side?: Side;
  dim?: IUniform<number>;
  /** Scenery opts out of the boot-time vertex jitter. */
  still?: boolean;
}

type PsxMaterial = ShaderMaterial & { uniforms: Record<string, IUniform> };

function psx(o: MatOpts): PsxMaterial {
  const defines: Record<string, string> = {};
  if (o.map) defines.USE_MAP = '';
  if (o.glass) defines.GLASS = '';
  if (o.disc) defines.DISC = '';
  if (o.foil) defines.FOIL = '';
  if (o.neon) defines.NEON = '';
  const transparent = !!(o.glass || o.additive || (o.alpha ?? 1) < 1);
  const m = new ShaderMaterial({
    defines,
    uniforms: {
      ...G,
      uColor: { value: new Color(o.color ?? '#8aa0aa') },
      uEmissive: { value: new Color(o.emissive ?? '#000000').multiplyScalar(o.emissiveI ?? 1) },
      uAmbient: { value: o.ambient ?? 0.22 },
      uAlpha: { value: o.alpha ?? 1 },
      uChrome: { value: o.chrome ?? 0 },
      uGloss: { value: o.gloss ?? 0 },
      uFresnel: { value: o.fresnel ?? 0 },
      uRim: { value: new Color(o.rim ?? '#62f4e6') },
      uTint: { value: new Color(o.tint ?? '#000000') },
      uDim: o.dim ?? { value: 1 },
      uMap: { value: o.map ?? null },
      ...(o.still ? { uWobble: { value: 0 } } : {}),
    },
    vertexShader: PSX_VERT,
    fragmentShader: PSX_FRAG,
    transparent,
    depthWrite: !transparent,
  });
  if (o.additive) m.blending = AdditiveBlending;
  const side = o.side ?? (o.glass ? DoubleSide : undefined);
  if (side !== undefined) m.side = side;
  return m as PsxMaterial;
}

// ---------------------------------------------------------------- sky, hills, ribbons, floor, bubbles

function makeSky(): Mesh {
  const m = new ShaderMaterial({
    uniforms: { uTime: G.uTime },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() { vDir = position; gl_Position = projectionMatrix * viewMatrix * vec4(position + cameraPosition, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; varying vec3 vDir;
      float h(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      void main() {
        vec3 d = normalize(vDir);
        float ay = abs(d.y);
        vec3 c = mix(vec3(0.035, 0.2, 0.23), vec3(0.008, 0.045, 0.075), smoothstep(0.0, 0.14, ay));
        c = mix(c, vec3(0.004, 0.012, 0.03), smoothstep(0.16, 0.85, ay));
        vec3 md = normalize(vec3(-0.3, 0.12, -1.0));
        float m = max(dot(normalize(vec3(d.x, ay, d.z)), md), 0.0);
        c += vec3(0.8, 1.0, 0.97) * smoothstep(0.99955, 0.9997, m) * 1.8;
        c += vec3(0.3, 0.95, 0.9) * pow(m, 300.0) * 1.2 + vec3(0.1, 0.55, 0.55) * pow(m, 14.0) * 0.4;
        vec3 sp = floor(d * 150.0);
        float s = h(sp);
        c += step(0.9965, s) * vec3(0.75, 1.0, 1.0) * (0.55 + 0.45 * sin(uTime * 2.3 + s * 80.0)) * smoothstep(0.05, 0.35, ay);
        float au = 0.5 + 0.5 * sin(d.x * 2.7 + d.z * 1.3 + uTime * 0.04);
        c += vec3(0.04, 0.32, 0.26) * smoothstep(0.12, 0.3, ay) * smoothstep(0.75, 0.3, ay) * au * 0.35;
        if (d.y < 0.0) c *= 0.32;
        gl_FragColor = vec4(c, 1.0);
      }`,
    side: BackSide,
    depthWrite: false,
    depthTest: false,
  });
  const sky = new Mesh(new IcosahedronGeometry(50, 3), m);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  return sky;
}

/** A ring of chunky flat-shaded hills with a teal moon rim, far enough to fog into silhouettes. */
function makeHills(): Group {
  const group = new Group();
  const ring = (n: number, rBase: number, rTop: number, lo: number, hi: number, seed: number, color: string, rim: string, fogNear: number) => {
    const pos: number[] = [];
    const hgt = (k: number) => {
      const x = (k % n) + seed;
      return lo + (hi - lo) * Math.abs(Math.sin(x * 0.61) * 0.6 + Math.sin(x * 0.23 + 1.3) * 0.4) * (0.7 + 0.3 * Math.sin(x * 1.7));
    };
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
      const p = (a: number, r: number, y: number) => [Math.sin(a) * r, y, -Math.cos(a) * r];
      const b0 = p(a0, rBase, -0.3), b1 = p(a1, rBase, -0.3);
      const t0 = p(a0, rTop, hgt(k)), t1 = p(a1, rTop, hgt(k + 1));
      pos.push(...b0, ...t0, ...b1, ...b1, ...t0, ...t1);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
    g.computeVertexNormals();
    const m = psx({ color, ambient: 0.4, fresnel: 1.1, rim, side: DoubleSide, still: true });
    m.uniforms.uFogNear = { value: fogNear };
    m.uniforms.uFogFar = { value: 48 };
    group.add(new Mesh(g, m));
  };
  ring(72, 36, 33, 1.6, 5.2, 3, '#0a2533', '#2a8fb0', 22);
  ring(60, 27, 25, 0.5, 2.4, 11, '#06161e', '#27d3c3', 16);
  return group;
}
/** Frutiger Aero swooshes: additive ribbons that breathe across the sky. */
function makeRibbon(color: string, y: number, z: number, phase: number, width: number): Mesh {
  const geo = new PlaneGeometry(56, width, 90, 1);
  const m = new ShaderMaterial({
    uniforms: { uTime: G.uTime, uColor: { value: new Color(color) }, uY: { value: y }, uZ: { value: z }, uPhase: { value: phase }, uSnap: G.uSnap, uMirror: G.uMirror },
    vertexShader: /* glsl */ `
      uniform float uTime; uniform float uY; uniform float uZ; uniform float uPhase; uniform vec2 uSnap;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 p = position;
        float x = p.x;
        p.y += uY + sin(x * 0.11 + uTime * 0.23 + uPhase) * 1.6 + sin(x * 0.05 - uTime * 0.11) * 1.2;
        p.z = uZ + cos(x * 0.07 + uPhase) * 4.0 + p.y * 0.0;
        p.y += (uv.y - 0.5) * sin(x * 0.2 + uTime * 0.3 + uPhase) * 0.8;
        vec4 clip = projectionMatrix * viewMatrix * modelMatrix * vec4(p, 1.0);
        if (clip.w > 0.05) clip.xy = floor(clip.xy / clip.w * uSnap + 0.5) / uSnap * clip.w;
        gl_Position = clip;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uTime; uniform float uMirror; varying vec2 vUv;
      void main() {
        float across = exp(-pow((vUv.y - 0.5) * 3.2, 2.0));
        float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
        float shimmer = 0.75 + 0.25 * sin(vUv.x * 40.0 - uTime * 1.5);
        float a = across * edge * shimmer * (uMirror > 0.5 ? 0.35 : 1.0);
        gl_FragColor = vec4(uColor * a, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  });
  const mesh = new Mesh(geo, m);
  mesh.frustumCulled = false;
  return mesh;
}

function makeFloor(): { mesh: Mesh; sel: IUniform<Vector2>; accent: IUniform<Color>; pulse: IUniform<number> } {
  const sel = { value: new Vector2(0, RING_R) };
  const accent = { value: new Color('#7ff5d0') };
  const pulse = { value: 0 };
  const m = new ShaderMaterial({
    uniforms: { ...G, uSel: sel, uAccent: accent, uPulse: pulse },
    vertexShader: /* glsl */ `
      uniform vec2 uSnap; uniform float uFogNear; uniform float uFogFar;
      varying vec3 vW; varying float vFog;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz;
        vec4 mv = viewMatrix * wp;
        vec4 clip = projectionMatrix * mv;
        if (clip.w > 0.05) clip.xy = floor(clip.xy / clip.w * uSnap + 0.5) / uSnap * clip.w;
        vFog = smoothstep(uFogNear, uFogFar, -mv.z);
        gl_Position = clip;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uFogColor; uniform vec2 uSel; uniform vec3 uAccent; uniform float uPulse;
      varying vec3 vW; varying float vFog;
      vec2 h2(float n) { return fract(sin(vec2(n, n + 1.7) * vec2(43758.5453, 22578.145)) ); }
      void main() {
        vec2 p = vW.xz;
        vec2 q = p * 0.5;
        vec2 gw = abs(fract(q) - 0.5) / max(fwidth(q), 1e-4);
        float line = 1.0 - min(min(gw.x, gw.y), 1.0);
        float dc = length(p - vec2(0.0, 1.2));
        vec3 col = vec3(0.004, 0.02, 0.032);
        col += vec3(0.1, 0.75, 0.72) * line * 0.28 * exp(-dc * 0.09);
        float ds = length(p - uSel);
        col += uAccent * (exp(-ds * 1.25) * (0.55 + 0.25 * uPulse) + exp(-ds * 0.35) * 0.07);
        float ring = smoothstep(0.06, 0.0, abs(ds - 1.05 - 0.05 * sin(uTime * 2.0)));
        col += uAccent * ring * 0.35;
        for (int i = 0; i < 6; i++) {
          float fi = float(i);
          float t = uTime * 0.55 + fi * 0.37;
          float cell = floor(t);
          float age = fract(t);
          vec2 c = (h2(cell * 7.0 + fi * 13.0) - 0.5) * vec2(14.0, 9.0) + vec2(0.0, 1.5);
          float rr = age * 1.7;
          float rip = smoothstep(0.07, 0.0, abs(length(p - c) - rr)) * (1.0 - age);
          col += vec3(0.35, 0.95, 1.0) * rip * 0.22;
        }
        vec3 V = normalize(cameraPosition - vW);
        float graze = pow(1.0 - clamp(V.y, 0.0, 1.0), 2.5);
        float a = mix(0.86, 0.5, graze);
        col = mix(col, uFogColor * 0.6, vFog);
        a = mix(a, 0.25, vFog);
        gl_FragColor = vec4(col, a);
      }`,
    transparent: true,
    depthWrite: true,
  });
  const g = new PlaneGeometry(80, 80, 48, 48);
  g.rotateX(-Math.PI / 2);
  const mesh = new Mesh(g, m);
  mesh.renderOrder = 1;
  return { mesh, sel, accent, pulse };
}

interface Bubble { x: number; y: number; z: number; s: number; v: number; ph: number }

function makeBubbles(count: number): { mesh: InstancedMesh; data: Bubble[] } {
  const m = psx({ color: '#0a2a34', glass: true, alpha: 0.05, chrome: 0.3, gloss: 1.8, fresnel: 1.4, rim: '#7ff5e6', ambient: 0.1, still: true });
  const mesh = new InstancedMesh(new IcosahedronGeometry(1, 1), m, count);
  mesh.frustumCulled = false;
  const data: Bubble[] = [];
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 1.2 + Math.random() * 9;
    data.push({ x: Math.sin(a) * r, y: Math.random() * 7, z: Math.cos(a) * r * 0.8 - 1, s: 0.03 + Math.pow(Math.random(), 2.2) * 0.2, v: 0.12 + Math.random() * 0.3, ph: Math.random() * 10 });
  }
  return { mesh, data };
}

// ---------------------------------------------------------------- props

interface Item {
  game: Game;
  angle: number;
  root: Group;
  pedestal: Group;
  prop: Group;
  ring: PsxMaterial;
  beam: Mesh;
  beamMat: ShaderMaterial;
  dim: IUniform<number>;
  accent: Color;
  sel: number; // 0..1 eased selection amount
  hover: number;
  animate: (t: number, dt: number, sel: number, reduced: boolean) => void;
}

function makeBeam(accent: Color): [Mesh, ShaderMaterial] {
  const m = new ShaderMaterial({
    uniforms: { uColor: { value: accent.clone() }, uI: { value: 0 }, uTime: G.uTime, uSnap: G.uSnap, uMirror: G.uMirror },
    vertexShader: /* glsl */ `
      uniform vec2 uSnap; varying vec2 vUv; varying float vEdge;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vec3 n = normalize(mat3(modelMatrix) * normal);
        vEdge = 1.0 - abs(dot(n, normalize(cameraPosition - wp.xyz)));
        vec4 clip = projectionMatrix * viewMatrix * wp;
        if (clip.w > 0.05) clip.xy = floor(clip.xy / clip.w * uSnap + 0.5) / uSnap * clip.w;
        gl_Position = clip;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uI; uniform float uTime; uniform float uMirror; varying vec2 vUv; varying float vEdge;
      void main() {
        float up = pow(1.0 - vUv.y, 1.6);
        float streak = 0.7 + 0.3 * sin(vUv.x * 50.0 + uTime * 3.0 - vUv.y * 8.0);
        float a = up * (0.45 + (1.0 - vEdge) * 0.35) * streak * uI * (uMirror > 0.5 ? 0.4 : 1.0);
        gl_FragColor = vec4(uColor * a * 0.26, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  });
  const g = new CylinderGeometry(0.3, 0.74, 3.8, 18, 1, true);
  g.translate(0, 1.8 + 0.3, 0);
  const mesh = new Mesh(g, m);
  return [mesh, m];
}

function makePedestal(accent: Color, dim: IUniform<number>): { group: Group; ring: PsxMaterial } {
  const group = new Group();
  const body = new Mesh(
    new CylinderGeometry(0.72, 0.9, 0.3, 14),
    psx({ color: '#1b3440', chrome: 0.55, gloss: 0.9, fresnel: 0.6, rim: '#7ff5e6', ambient: 0.3, dim }),
  );
  body.position.y = 0.15;
  group.add(body);
  const cap = new Mesh(
    new CylinderGeometry(0.66, 0.72, 0.05, 14),
    psx({ color: '#0d1c24', chrome: 0.75, gloss: 0.3, tint: `#${accent.getHexString()}`, dim }),
  );
  cap.position.y = 0.325;
  group.add(cap);
  const ring = psx({ color: '#000000', emissive: `#${accent.getHexString()}`, emissiveI: 1, dim });
  const torus = new Mesh(new TorusGeometry(0.74, 0.028, 3, 28), ring);
  torus.rotation.x = Math.PI / 2;
  torus.position.y = 0.31;
  group.add(torus);
  const lower = new Mesh(new TorusGeometry(0.9, 0.018, 3, 28), ring);
  lower.rotation.x = Math.PI / 2;
  lower.position.y = 0.02;
  group.add(lower);
  return { group, ring };
}

function propOrb(accent: string, dim: IUniform<number>) {
  const g = new Group();
  const shell = new Mesh(new IcosahedronGeometry(0.6, 1), psx({ color: '#062a2a', glass: true, alpha: 0.18, chrome: 0.45, gloss: 2.2, fresnel: 1.6, rim: accent, tint: accent, ambient: 0.2, dim }));
  const core = new Mesh(new IcosahedronGeometry(0.24, 0), psx({ color: '#000000', emissive: accent, emissiveI: 1.6, dim }));
  const inner = new Mesh(new IcosahedronGeometry(0.34, 0), psx({ color: '#000000', emissive: accent, emissiveI: 0.35, alpha: 0.5, additive: true, dim }));
  g.add(core, inner, shell);
  const reticle = new Group();
  const ringMat = psx({ color: '#000000', emissive: accent, emissiveI: 1.2, dim });
  reticle.add(new Mesh(new TorusGeometry(0.86, 0.022, 3, 36), ringMat));
  for (let k = 0; k < 4; k++) {
    const tick = new Mesh(new BoxGeometry(0.05, 0.22, 0.05), ringMat);
    const a = (k / 4) * Math.PI * 2;
    tick.position.set(Math.cos(a) * 0.86, Math.sin(a) * 0.86, 0);
    tick.rotation.z = a + Math.PI / 2;
    reticle.add(tick);
  }
  g.add(reticle);
  const bolts: Mesh[] = [];
  const boltMat = psx({ color: '#ffffff', emissive: '#dffff6', emissiveI: 0.9, gloss: 1, dim });
  for (let k = 0; k < 3; k++) {
    const b = new Mesh(new OctahedronGeometry(0.045, 0), boltMat);
    b.scale.set(1, 1, 3.6);
    g.add(b);
    bolts.push(b);
  }
  const q = new Quaternion();
  const tmp = new Vector3();
  const next = new Vector3();
  return {
    group: g,
    animate(t: number, _dt: number, sel: number, reduced: boolean) {
      const spin = reduced ? 0.4 : t;
      shell.rotation.set(spin * 0.3, spin * (0.4 + sel * 0.5), 0);
      core.rotation.set(-spin * 1.1, spin * 1.3, 0);
      inner.rotation.set(spin * 0.7, -spin * 0.5, 0);
      reticle.rotation.z = reduced ? 0 : -t * (0.25 + sel * 0.6);
      reticle.scale.setScalar(1 + (reduced ? 0 : Math.sin(t * 2.4) * 0.03 * sel));
      bolts.forEach((b, k) => {
        const ph = (reduced ? 0.8 : t * (0.9 + sel * 1.4)) + (k * Math.PI * 2) / 3;
        const orbit = (a: number, out: Vector3) => out.set(Math.cos(a) * 1.08, Math.sin(a * 2) * 0.12 + Math.sin(a) * 0.35, Math.sin(a) * 0.7);
        orbit(ph, tmp);
        orbit(ph + 0.05, next);
        b.position.copy(tmp);
        next.sub(tmp).normalize();
        q.setFromUnitVectors(new Vector3(0, 0, 1), next);
        b.quaternion.copy(q);
      });
    },
  };
}

function propCard(accent: string, dim: IUniform<number>) {
  const g = new Group();
  const edge = psx({ color: '#e8c878', gloss: 1.2, chrome: 0.3, ambient: 0.35, dim });
  const front = psx({ color: '#ffffff', map: tarotFront(), foil: true, gloss: 0.8, ambient: 0.62, dim });
  const back = psx({ color: '#ffffff', map: tarotBack(), foil: true, gloss: 0.8, ambient: 0.55, dim });
  const card = new Mesh(new BoxGeometry(0.98, 1.6, 0.035), [edge, edge, edge, edge, front, back]);
  g.add(card);
  const sparkMat = psx({ color: '#000000', emissive: '#ffe6a0', emissiveI: 1.3, dim });
  const sparks: Mesh[] = [];
  for (let k = 0; k < 5; k++) {
    const s = new Mesh(new OctahedronGeometry(0.05 + (k % 2) * 0.025, 0), sparkMat);
    g.add(s);
    sparks.push(s);
  }
  const halo = new Mesh(new RingGeometry(0.95, 1.02, 40), psx({ color: '#000000', emissive: accent, emissiveI: 0.7, additive: true, alpha: 0.6, side: DoubleSide, dim }));
  g.add(halo);
  return {
    group: g,
    animate(t: number, _dt: number, sel: number, reduced: boolean) {
      const tt = reduced ? 0 : t;
      card.rotation.y = reduced ? -0.35 : Math.sin(tt * 0.45) * 0.55 + tt * (0.12 + sel * 0.5);
      card.rotation.z = Math.sin(tt * 0.8) * 0.06;
      card.position.y = Math.sin(tt * 1.3) * 0.05;
      halo.rotation.set(Math.PI / 2 + Math.sin(tt * 0.6) * 0.2, 0, 0);
      halo.position.y = -0.95;
      halo.scale.setScalar(0.6 + sel * 0.25);
      sparks.forEach((s, k) => {
        const a = tt * 0.7 + (k * Math.PI * 2) / 5;
        s.position.set(Math.cos(a) * 0.8, Math.sin(tt * 1.1 + k) * 0.6, Math.sin(a) * 0.5);
        s.rotation.y = tt * 3;
      });
    },
  };
}

function propStall(accent: string, dim: IUniform<number>) {
  const g = new Group();
  const dark = psx({ color: '#23313b', ambient: 0.35, gloss: 0.2, dim });
  const base = new Mesh(new BoxGeometry(1.5, 0.08, 1.1), psx({ color: '#141c22', chrome: 0.4, gloss: 0.8, dim }));
  base.position.y = -0.55;
  const body = new Mesh(new BoxGeometry(1.2, 0.92, 0.8), dark);
  body.position.set(0, -0.05, -0.05);
  const shutterTex = shutter();
  shutterTex.repeat.set(1.5, 1);
  const shut = new Mesh(new PlaneGeometry(1.06, 0.62), psx({ color: '#ffffff', map: shutterTex, ambient: 0.55, gloss: 0.3, dim }));
  shut.position.set(0, 0.04, 0.36);
  const glowMat = psx({ color: '#000000', emissive: '#ffb0d0', emissiveI: 0.9, dim });
  const counter = new Mesh(new BoxGeometry(1.08, 0.24, 0.02), glowMat);
  counter.position.set(0, -0.3, 0.355);
  const aw = new Mesh(new BoxGeometry(1.46, 0.04, 0.62), [dark, dark, psx({ color: '#ffffff', map: awning(), ambient: 0.7, dim }), dark, dark, dark]);
  aw.position.set(0, 0.47, 0.35);
  aw.rotation.x = 0.42;
  const hem = new Mesh(new PlaneGeometry(1.46, 0.12), psx({ color: '#ffffff', map: awning(), ambient: 0.8, side: DoubleSide, dim }));
  hem.position.set(0, 0.3, 0.64);
  const sign = new Mesh(new PlaneGeometry(0.98, 0.28), psx({ color: '#ffffff', map: neonSign('CLOSING', accent), neon: true, ambient: 1.3, dim }));
  sign.position.set(0, 0.74, 0.02);
  const post = new Mesh(new BoxGeometry(0.04, 0.3, 0.04), dark);
  post.position.set(0, 0.55, 0.0);
  const lampMat = psx({ color: '#000000', emissive: '#ff8a4a', emissiveI: 1.5, dim });
  const lamps: Mesh[] = [];
  for (const x of [-0.66, 0.66]) {
    const l = new Mesh(new IcosahedronGeometry(0.075, 0), lampMat);
    l.position.set(x, 0.18, 0.66);
    const cord = new Mesh(new BoxGeometry(0.01, 0.14, 0.01), dark);
    cord.position.set(x, 0.3, 0.66);
    g.add(l, cord);
    lamps.push(l);
  }
  const crate = new Mesh(new BoxGeometry(0.28, 0.24, 0.28), psx({ color: '#6b4a2e', ambient: 0.4, dim }));
  crate.position.set(0.56, -0.39, 0.44);
  crate.rotation.y = 0.4;
  const crate2 = new Mesh(new BoxGeometry(0.2, 0.18, 0.2), psx({ color: '#2f6b6b', ambient: 0.4, dim }));
  crate2.position.set(-0.6, -0.42, 0.46);
  crate2.rotation.y = -0.3;
  g.add(base, body, shut, counter, aw, hem, sign, post, crate, crate2);
  g.scale.setScalar(0.92);
  return {
    group: g,
    animate(t: number, _dt: number, sel: number, reduced: boolean) {
      const tt = reduced ? 0 : t;
      g.rotation.y = reduced ? -0.35 : Math.sin(tt * 0.35) * 0.55 - 0.2;
      // the shutter comes down, pauses, snaps back up (selected: a little faster)
      const cyc = reduced ? 0.3 : (tt * (0.12 + sel * 0.06)) % 1;
      const down = cyc < 0.7 ? cyc / 0.7 : 1 - (cyc - 0.7) / 0.3;
      const k = Math.min(1, Math.max(0, down));
      shut.scale.y = 0.35 + k * 0.65;
      shut.position.y = 0.35 - (0.62 * shut.scale.y) / 2;
      lamps.forEach((l, i) => { l.position.x = (i ? 0.66 : -0.66) + Math.sin(tt * 1.7 + i) * 0.02; });
    },
  };
}

function propDisc(game: Game, dim: IUniform<number>) {
  const g = new Group();
  const tilt = new Group();
  const faceMat = psx({ color: '#c8d4dc', map: discLabel(game.title, game.accent), disc: true, gloss: 1.6, tint: game.accent, ambient: 0.5, dim });
  const front = new Mesh(new RingGeometry(0.12, 0.82, 40, 1), faceMat);
  front.position.z = 0.012;
  const back = new Mesh(new RingGeometry(0.12, 0.82, 40, 1), psx({ color: '#c8d4dc', map: discLabel(game.title, game.accent), disc: true, gloss: 1.2, tint: game.accent, ambient: 0.5, dim }));
  back.rotation.y = Math.PI;
  back.position.z = -0.012;
  const rim = new Mesh(new CylinderGeometry(0.82, 0.82, 0.024, 40, 1, true), psx({ color: '#9fb2bd', chrome: 0.7, dim }));
  rim.rotation.x = Math.PI / 2;
  tilt.add(front, back, rim);
  g.add(tilt);
  // padlock: a chrome body and shackle
  const lock = new Group();
  const chrome = psx({ color: '#a8bcc6', chrome: 0.85, gloss: 1.5, ambient: 0.3, dim });
  const lb = new Mesh(new BoxGeometry(0.26, 0.21, 0.09), chrome);
  const sh = new Mesh(new TorusGeometry(0.085, 0.024, 4, 10, Math.PI), chrome);
  sh.position.y = 0.1;
  const hole = new Mesh(new BoxGeometry(0.04, 0.07, 0.02), psx({ color: '#05080a', dim }));
  hole.position.set(0, -0.01, 0.047);
  lock.add(lb, sh, hole);
  lock.position.set(0.46, -0.62, 0.22);
  lock.rotation.set(0.1, -0.35, 0.12);
  g.add(lock);
  return {
    group: g,
    animate(t: number, _dt: number, sel: number, reduced: boolean) {
      const tt = reduced ? 0 : t;
      tilt.rotation.y = reduced ? 0.3 : Math.sin(tt * 0.5 + game.id.length) * 0.8;
      tilt.rotation.x = -0.12;
      front.rotation.z = back.rotation.z = -tt * (0.3 + sel * 2.2);
      tilt.position.y = Math.sin(tt * 1.1 + game.id.length) * 0.04;
    },
  };
}

// ---------------------------------------------------------------- post-processing

const QUAD_VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

function postMat(frag: string, uniforms: Record<string, IUniform>): ShaderMaterial {
  return new ShaderMaterial({ uniforms, vertexShader: QUAD_VERT, fragmentShader: frag, depthTest: false, depthWrite: false });
}

const BRIGHT_FRAG = /* glsl */ `
uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThresh; varying vec2 vUv;
vec3 pick(vec2 o) { vec3 c = texture2D(tSrc, vUv + o * uTexel).rgb; float l = max(c.r, max(c.g, c.b)); return c * smoothstep(uThresh, uThresh + 0.4, l); }
void main() { gl_FragColor = vec4((pick(vec2(-0.5, -0.5)) + pick(vec2(0.5, -0.5)) + pick(vec2(-0.5, 0.5)) + pick(vec2(0.5, 0.5))) * 0.25, 1.0); }`;

const BLUR_FRAG = /* glsl */ `
uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb * 0.2270270;
  c += (texture2D(tSrc, vUv + uDir * 1.3846154).rgb + texture2D(tSrc, vUv - uDir * 1.3846154).rgb) * 0.3162162;
  c += (texture2D(tSrc, vUv + uDir * 3.2307692).rgb + texture2D(tSrc, vUv - uDir * 3.2307692).rgb) * 0.0702703;
  gl_FragColor = vec4(c, 1.0);
}`;

const COMPOSITE_FRAG = /* glsl */ `
uniform sampler2D tScene; uniform sampler2D tBloomA; uniform sampler2D tBloomB;
uniform vec2 uLow; uniform float uAspect; uniform float uTime; uniform float uFade; uniform float uLaunch;
uniform vec2 uFlare; uniform float uFlareI; uniform vec2 uGlint; uniform float uGlintI; uniform vec3 uAccent; uniform float uDither;
varying vec2 vUv;
float bayer(vec2 p) {
  vec2 q = mod(p, 4.0);
  int i = int(q.x) + int(q.y) * 4;
  float m[16];
  m[0]=0.0; m[1]=8.0; m[2]=2.0; m[3]=10.0; m[4]=12.0; m[5]=4.0; m[6]=14.0; m[7]=6.0;
  m[8]=3.0; m[9]=11.0; m[10]=1.0; m[11]=9.0; m[12]=15.0; m[13]=7.0; m[14]=13.0; m[15]=5.0;
  for (int k = 0; k < 16; k++) if (k == i) return (m[k] + 0.5) / 16.0;
  return 0.5;
}
float disc(vec2 p, vec2 c, float r, float soft) { vec2 d = p - c; d.x *= uAspect; return smoothstep(r, r * soft, length(d)); }
void main() {
  vec2 cc = vUv - 0.5;
  vec2 uv = 0.5 + cc * (1.0 + dot(cc, cc) * 0.028);
  vec2 lp = floor(uv * uLow);
  vec2 suv = (lp + 0.5) / uLow;
  vec3 col;
  col.r = texture2D(tScene, suv + vec2(cc.x * 0.9 / uLow.x, 0.0)).r;
  col.g = texture2D(tScene, suv).g;
  col.b = texture2D(tScene, suv - vec2(cc.x * 0.9 / uLow.x, 0.0)).b;
  col += texture2D(tBloomA, uv).rgb * 0.6 + texture2D(tBloomB, uv).rgb * 0.95;

  // lens flare off the moon: ghosts along the axis through the centre, and an anamorphic streak
  if (uFlareI > 0.001) {
    vec2 axis = vec2(0.5) - uFlare;
    vec3 fl = vec3(0.0);
    fl += vec3(0.25, 0.95, 0.9) * disc(uv, uFlare + axis * 0.55, 0.035, 0.2) * 0.35;
    fl += vec3(0.9, 0.4, 1.0) * disc(uv, uFlare + axis * 0.95, 0.06, 0.55) * 0.18;
    fl += vec3(0.3, 0.7, 1.0) * disc(uv, uFlare + axis * 1.35, 0.09, 0.8) * 0.12;
    fl += vec3(0.5, 1.0, 0.8) * disc(uv, uFlare + axis * 1.7, 0.025, 0.1) * 0.3;
    vec2 d = uv - uFlare; d.x *= uAspect;
    fl += vec3(0.35, 0.95, 1.0) * exp(-abs(d.y) * 180.0) * exp(-abs(d.x) * 2.2) * 0.55;
    fl += vec3(0.6, 1.0, 1.0) * exp(-length(d) * 16.0) * 0.35;
    col += fl * uFlareI;
  }
  // four-point Aero sparkle on the selected prop
  if (uGlintI > 0.001) {
    vec2 d = uv - uGlint; d.x *= uAspect;
    float s = exp(-abs(d.y) * 260.0) * exp(-abs(d.x) * 16.0) + exp(-abs(d.x) * 260.0) * exp(-abs(d.y) * 16.0);
    s += exp(-length(d) * 40.0) * 0.6;
    col += mix(uAccent, vec3(1.0), 0.5) * s * uGlintI;
  }

  col = mix(col, vec3(1.0), uLaunch * uLaunch * 0.6);
  col = 1.0 - exp(-col * 1.35);
  col = pow(col, vec3(1.18)) * 1.08;
  col *= 1.0 - dot(cc, cc) * 0.85;

  // 15-bit colour with a 4x4 ordered dither on the low-resolution grid
  float levels = 31.0;
  col = floor(col * levels + mix(0.5, bayer(lp), uDither)) / levels;

  // scanlines: darken the seams between low-resolution rows
  float row = fract(uv.y * uLow.y);
  col *= 0.8 + 0.2 * smoothstep(0.0, 0.35, row) * smoothstep(1.0, 0.65, row);

  float outside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  gl_FragColor = vec4(col * uFade * outside, 1.0);
}`;

// ---------------------------------------------------------------- the stage

const damp = (a: number, b: number, rate: number, dt: number) => a + (b - a) * (1 - Math.exp(-rate * dt));
const easeOut = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

export function createStage(canvas: HTMLCanvasElement, games: Game[], opts: StageOptions): Stage {
  const renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  renderer.autoClear = false;
  renderer.setPixelRatio(1);
  const hdr = renderer.extensions.has('EXT_color_buffer_half_float') || renderer.extensions.has('EXT_color_buffer_float');
  const rtType = hdr ? HalfFloatType : UnsignedByteType;

  let reduced = opts.reduced;
  const camera = new PerspectiveCamera(38, 1, 0.1, 120);

  const skyScene = new Scene();
  skyScene.add(makeSky());
  const worldScene = new Scene();
  const world = new Group();
  worldScene.add(world);
  const floorScene = new Scene();
  const floor = makeFloor();
  floorScene.add(floor.mesh);

  world.add(makeHills());
  world.add(makeRibbon('#1ee0c8', 6.0, -18, 0, 2.4));
  world.add(makeRibbon('#3a9dff', 7.4, -20, 2.1, 1.6));
  world.add(makeRibbon('#7affc4', 5.2, -16, 4.2, 1.1));
  const bubbles = makeBubbles(reduced ? 18 : 42);
  world.add(bubbles.mesh);

  const carousel = new Group();
  world.add(carousel);
  const items: Item[] = games.map((game, i) => {
    const angle = (i / games.length) * Math.PI * 2;
    const accent = new Color(game.accent);
    const dim = { value: 1 };
    const root = new Group();
    root.position.set(Math.sin(angle) * RING_R, 0, Math.cos(angle) * RING_R);
    const ped = makePedestal(accent, dim);
    root.add(ped.group);
    const [beam, beamMat] = makeBeam(accent);
    root.add(beam);
    const made = game.prop === 'orb' ? propOrb(game.accent, dim)
      : game.prop === 'card' ? propCard(game.accent, dim)
        : game.prop === 'stall' ? propStall(game.accent, dim)
          : propDisc(game, dim);
    const prop = new Group();
    prop.add(made.group);
    prop.position.y = 1.32;
    root.add(prop);
    carousel.add(root);
    return { game, angle, root, pedestal: ped.group, prop, ring: ped.ring, beam, beamMat, dim, accent, sel: 0, hover: 0, animate: made.animate };
  });

  // render targets
  const lowSize = new Vector2(320, 240);
  const mkRT = (w: number, h: number, nearest: boolean) => new WebGLRenderTarget(w, h, {
    type: rtType, depthBuffer: nearest, minFilter: nearest ? NearestFilter : LinearFilter, magFilter: nearest ? NearestFilter : LinearFilter, generateMipmaps: false,
  });
  const rtScene = mkRT(320, 240, true);
  const rtBright = mkRT(160, 120, false);
  const rtA1 = mkRT(80, 60, false), rtA2 = mkRT(80, 60, false);
  const rtB1 = mkRT(40, 30, false), rtB2 = mkRT(40, 30, false);

  const quadCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new Mesh(new PlaneGeometry(2, 2));
  quad.frustumCulled = false;
  const quadScene = new Scene();
  quadScene.add(quad);
  const brightMat = postMat(BRIGHT_FRAG, { tSrc: { value: null }, uTexel: { value: new Vector2() }, uThresh: { value: 0.7 } });
  const blurMat = postMat(BLUR_FRAG, { tSrc: { value: null }, uDir: { value: new Vector2() } });
  const compU = {
    tScene: { value: rtScene.texture }, tBloomA: { value: rtA1.texture }, tBloomB: { value: rtB1.texture },
    uLow: { value: lowSize }, uAspect: { value: 1 }, uTime: G.uTime, uFade: { value: 0 }, uLaunch: { value: 0 },
    uFlare: { value: new Vector2(0.3, 0.6) }, uFlareI: { value: 0 }, uGlint: { value: new Vector2(0.5, 0.5) }, uGlintI: { value: 0 },
    uAccent: { value: new Color('#7ff5d0') }, uDither: { value: 1 },
  };
  const compMat = postMat(COMPOSITE_FRAG, compU);

  const pass = (mat: ShaderMaterial, target: WebGLRenderTarget | null) => {
    quad.material = mat;
    renderer.setRenderTarget(target);
    renderer.render(quadScene, quadCam);
  };
  const blur = (src: WebGLRenderTarget, a: WebGLRenderTarget, b: WebGLRenderTarget) => {
    blurMat.uniforms.tSrc.value = src.texture;
    blurMat.uniforms.uDir.value.set(1 / a.width, 0);
    pass(blurMat, b);
    blurMat.uniforms.tSrc.value = b.texture;
    blurMat.uniforms.uDir.value.set(0, 1 / a.height);
    pass(blurMat, a);
  };

  // sizing
  let cssW = 1, cssH = 1;
  const resize = () => {
    cssW = Math.max(1, canvas.clientWidth);
    cssH = Math.max(1, canvas.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    renderer.setSize(Math.round(cssW * dpr), Math.round(cssH * dpr), false);
    const k = Math.min(6, Math.max(2, Math.round(Math.min(cssW, cssH) / 300)));
    const lw = Math.ceil(cssW / k), lh = Math.ceil(cssH / k);
    lowSize.set(lw, lh);
    G.uSnap.value.set(lw * 0.5, lh * 0.5);
    rtScene.setSize(lw, lh);
    rtBright.setSize(Math.max(1, lw >> 1), Math.max(1, lh >> 1));
    rtA1.setSize(Math.max(1, lw >> 2), Math.max(1, lh >> 2));
    rtA2.setSize(Math.max(1, lw >> 2), Math.max(1, lh >> 2));
    rtB1.setSize(Math.max(1, lw >> 3), Math.max(1, lh >> 3));
    rtB2.setSize(Math.max(1, lw >> 3), Math.max(1, lh >> 3));
    compU.uAspect.value = cssW / cssH;
    const aspect = cssW / cssH;
    camera.aspect = aspect;
    camera.fov = aspect < 1 ? Math.min(62, 34 / Math.pow(aspect, 0.6)) : 34;
    // Keep the front prop clear of the glass panel: left of it on wide screens, above it on phones.
    const phone = cssW <= 760 || (cssH <= 520 && cssW <= 1000);
    if (phone && aspect < 1) camera.setViewOffset(cssW, cssH, 0, cssH * 0.13, cssW, cssH);
    else if (phone) camera.setViewOffset(cssW, cssH, cssW * 0.2, 0, cssW, cssH);
    else camera.setViewOffset(cssW, cssH, cssW * (aspect > 1.2 ? 0.13 : 0.08), cssH * 0.06, cssW, cssH);
    camera.updateProjectionMatrix();
    dirty = true;
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  // state
  let selected = 0;
  let rot = 0; // carousel yaw, radians
  let rotVel = 0;
  const pointer = new Vector2();
  const pointerS = new Vector2();
  let time = 0;
  let boot = opts.boot && !reduced ? 0 : 1;
  let fade = 0;
  let launchT = -1;
  let dirty = true;
  let ready = false;
  let running = true;
  let lost = false;
  let raf = 0;
  let last = performance.now();

  const camPos = new Vector3();
  const camLook = new Vector3();
  const restPos = new Vector3();
  const restLook = new Vector3();
  const tmpV = new Vector3();
  const tmpW = new Vector3();
  const matTmp = new Matrix4();

  const targetRot = () => -items[selected].angle;
  const wrapPi = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

  const project = (world: Vector3, out: Vector2): boolean => {
    tmpV.copy(world).project(camera);
    out.set(tmpV.x * 0.5 + 0.5, tmpV.y * 0.5 + 0.5);
    return tmpV.z < 1 && tmpV.z > -1;
  };

  const frame = (now: number) => {
    raf = 0;
    if (!running || lost) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const animating = !reduced || boot < 1 || launchT >= 0 || Math.abs(wrapPi(targetRot() - rot)) > 1e-3 || fade < 1 || items.some(it => Math.abs(it.sel - (items.indexOf(it) === selected ? 1 : 0)) > 1e-3);
    if (animating || dirty) {
      step(dt);
      render();
      dirty = false;
      if (!ready) { ready = true; opts.onReady?.(); }
    }
    raf = requestAnimationFrame(frame);
  };

  const step = (dt: number) => {
    if (!reduced) time += dt;
    G.uTime.value = time;
    fade = reduced ? 1 : Math.min(1, fade + dt / (boot < 1 ? 0.5 : 0.35));
    if (boot < 1) boot = Math.min(1, boot + dt / 2.6);
    const b = easeOut(boot);
    G.uWobble.value = (1 - easeOut(boot * 1.4)) * 0.35;

    // carousel spring toward the selected slot along the shortest way round
    const err = wrapPi(targetRot() - rot);
    if (reduced) { rot += err * Math.min(1, dt * 18); rotVel = 0; }
    else {
      rotVel += err * 60 * dt;
      rotVel *= Math.exp(-11 * dt);
      rot += rotVel * dt;
    }
    carousel.rotation.y = rot;

    pointerS.x = damp(pointerS.x, reduced ? 0 : pointer.x, 3, dt);
    pointerS.y = damp(pointerS.y, reduced ? 0 : pointer.y, 3, dt);

    const aspect = cssW / cssH;
    const back = aspect < 1 ? 1 + (1 - aspect) * 0.45 : 1;
    restPos.set(pointerS.x * 0.5 + (reduced ? 0 : Math.sin(time * 0.21) * 0.14), 2.75 + pointerS.y * 0.22 + (reduced ? 0 : Math.sin(time * 0.33) * 0.06), RING_R + 8.0 * back);
    restLook.set(pointerS.x * 0.12, 1.0, RING_R - 1.6);
    const bootPos = tmpW.set(-2.5, 7.5, RING_R + 14);
    camPos.lerpVectors(bootPos, restPos, b);
    camLook.set(0, 0.5 + 0.58 * b, RING_R - 0.6 - (1 - b) * 3);
    if (b >= 1) camLook.copy(restLook);
    else camLook.lerp(restLook, b);

    if (launchT >= 0) {
      launchT += dt;
      const l = easeOut(launchT / 0.62);
      const it = items[selected];
      it.prop.getWorldPosition(tmpV);
      camPos.lerp(tmpV.clone().add(new Vector3(0, 0.15, 1.6)), l * 0.75);
      camLook.lerp(tmpV, l);
      compU.uLaunch.value = l;
    } else compU.uLaunch.value = 0;

    camera.position.copy(camPos);
    camera.lookAt(camLook);

    items.forEach((it, i) => {
      const on = i === selected ? 1 : 0;
      it.sel = reduced ? on : damp(it.sel, on, 7, dt);
      it.hover = damp(it.hover, 0, 6, dt);
      const s = 0.82 + 0.18 * it.sel;
      it.prop.scale.setScalar(s * (launchT >= 0 && on ? 1 + easeOut(launchT / 0.62) * 0.25 : 1));
      const bob = reduced ? 0 : Math.sin(time * 1.2 + i * 1.7) * 0.06;
      const bootDrop = (1 - easeOut(boot * 1.6 - i * 0.08)) * 2.5;
      it.prop.position.y = 1.32 + bob + it.sel * 0.1 + bootDrop + (launchT >= 0 && on ? easeOut(launchT / 0.62) * 0.35 : 0);
      // face the camera when in front, with each prop's own motion on top
      it.root.getWorldPosition(tmpV);
      it.prop.rotation.y = Math.atan2(camera.position.x - tmpV.x, camera.position.z - tmpV.z) * 0.6 - rot;
      const lit = Math.min(1, Math.max(0, boot * 2.2 - i * 0.18));
      it.dim.value = (0.5 + 0.5 * it.sel) * (0.25 + 0.75 * lit) * (it.game.href ? 1 : 0.8);
      it.ring.uniforms.uEmissive.value.copy(it.accent).multiplyScalar((0.55 + it.sel * 1.4) * lit);
      it.beamMat.uniforms.uI.value = it.sel * lit * (launchT >= 0 && on ? 2.2 : 1);
      it.beam.visible = it.sel > 0.02;
      it.animate(time + (launchT >= 0 && on ? launchT * 6 : 0), dt, it.sel, reduced);
    });

    const it = items[selected];
    it.root.getWorldPosition(tmpV);
    floor.sel.value.set(tmpV.x, tmpV.z);
    floor.accent.value.lerp(it.accent, reduced ? 1 : 1 - Math.exp(-6 * dt));
    floor.pulse.value = reduced ? 0 : 0.5 + 0.5 * Math.sin(time * 2);
    compU.uAccent.value.copy(floor.accent.value);

    // bubbles rise, wobble and respawn
    bubbles.data.forEach((bb, i) => {
      if (!reduced) {
        bb.y += bb.v * dt;
        if (bb.y > 7.5) { bb.y = -0.2; }
      }
      const wob = reduced ? 0 : Math.sin(time * 1.3 + bb.ph) * 0.15;
      const grow = Math.min(1, (bb.y + 0.2) / 0.6);
      matTmp.makeScale(bb.s * grow, bb.s * grow * (1 + (reduced ? 0 : Math.sin(time * 3 + bb.ph) * 0.06)), bb.s * grow);
      matTmp.setPosition(bb.x + wob, Math.max(0.05, bb.y), bb.z);
      bubbles.mesh.setMatrixAt(i, matTmp);
    });
    bubbles.mesh.instanceMatrix.needsUpdate = true;

    // flare from the moon, glint on the selected prop
    camera.updateMatrixWorld();
    const moon = tmpV.copy(camera.position).addScaledVector(MOON_DIR, 40);
    const vis = project(moon, compU.uFlare.value);
    const f = compU.uFlare.value;
    const onScreen = vis && f.x > -0.1 && f.x < 1.1 && f.y > -0.1 && f.y < 1.1;
    compU.uFlareI.value = onScreen ? 0.9 * b : 0;
    it.prop.getWorldPosition(tmpV);
    tmpV.y += 0.5;
    tmpV.x -= 0.28;
    const gv = project(tmpV, compU.uGlint.value);
    compU.uGlintI.value = gv ? (reduced ? 0.35 : 0.25 + 0.2 * Math.pow(Math.max(0, Math.sin(time * 1.7)), 8) * 3) * it.sel * b : 0;
    compU.uFade.value = fade;
  };

  const render = () => {
    renderer.setRenderTarget(rtScene);
    renderer.setClearColor(G.uFogColor.value, 1);
    renderer.clear(true, true, true);
    renderer.render(skyScene, camera);
    world.scale.y = -1;
    G.uMirror.value = 1;
    renderer.render(worldScene, camera);
    world.scale.y = 1;
    G.uMirror.value = 0;
    renderer.render(floorScene, camera);
    renderer.render(worldScene, camera);

    brightMat.uniforms.tSrc.value = rtScene.texture;
    brightMat.uniforms.uTexel.value.set(1 / rtScene.width, 1 / rtScene.height);
    pass(brightMat, rtBright);
    blur(rtBright, rtA1, rtA2);
    blur(rtA1, rtB1, rtB2);
    blur(rtB1, rtB1, rtB2);
    pass(compMat, null);
  };

  const kick = () => { dirty = true; if (!raf && running) { last = performance.now(); raf = requestAnimationFrame(frame); } };

  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); lost = true; opts.onLost?.(); });
  document.addEventListener('visibilitychange', () => {
    running = document.visibilityState === 'visible';
    if (running) kick();
  });

  resize();
  kick();

  const raycaster = new Raycaster();
  const sphere = new Sphere();
  const ndc = new Vector2();

  return {
    setSelected(i: number) {
      if (i === selected) return;
      selected = i;
      kick();
    },
    setPointer(nx: number, ny: number) { pointer.set(nx, ny); if (!reduced) kick(); },
    setReduced(r: boolean) { reduced = r; if (r) boot = 1; kick(); },
    pick(clientX: number, clientY: number) {
      const rect = canvas.getBoundingClientRect();
      ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const ray: Ray = raycaster.ray;
      let best = -1, bestD = Infinity;
      items.forEach((it, i) => {
        it.prop.getWorldPosition(sphere.center);
        sphere.center.y -= 0.35;
        sphere.radius = 1.05;
        if (ray.intersectsSphere(sphere)) {
          const d = ray.origin.distanceTo(sphere.center);
          if (d < bestD) { bestD = d; best = i; }
        }
      });
      return best;
    },
    launch() {
      launchT = reduced ? -1 : 0;
      kick();
      const it = items[selected];
      it.prop.getWorldPosition(tmpV);
      const out = new Vector2();
      project(tmpV, out);
      return { x: out.x, y: 1 - out.y };
    },
    reset() { launchT = -1; compU.uLaunch.value = 0; kick(); },
    skipBoot() { if (boot < 1) { boot = 1; kick(); } },
    lowRes() { return [lowSize.x, lowSize.y]; },
    capture(w: number, h: number, seconds = 0) {
      const prevW = canvas.style.width, prevH = canvas.style.height;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      resize();
      renderer.setSize(w, h, false);
      for (let t = 0; t < seconds; t += 1 / 60) step(1 / 60);
      step(0);
      render();
      const url = canvas.toDataURL('image/png');
      canvas.style.width = prevW;
      canvas.style.height = prevH;
      resize();
      kick();
      return url;
    },
  };
}

