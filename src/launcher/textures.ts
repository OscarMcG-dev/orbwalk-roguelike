/** Tiny procedural textures for the launcher props, drawn on 2D canvases at PSX sizes and sampled nearest. */

import { CanvasTexture, NearestFilter, NoColorSpace, RepeatWrapping, type Texture } from 'three';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  return [c, g];
}

function tex(c: HTMLCanvasElement, repeat = false): Texture {
  const t = new CanvasTexture(c);
  t.magFilter = NearestFilter;
  t.minFilter = NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

const FONT = '"Segoe UI", system-ui, -apple-system, Arial, sans-serif';

function star(g: CanvasRenderingContext2D, x: number, y: number, r: number, points: number, inner: number) {
  g.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * inner : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
}

/** Arcana Pets: the face of XVII The Star. */
export function tarotFront(): Texture {
  const [c, g] = canvas(96, 156);
  const bg = g.createLinearGradient(0, 0, 0, 156);
  bg.addColorStop(0, '#2a1450');
  bg.addColorStop(0.55, '#150a30');
  bg.addColorStop(1, '#0a0620');
  g.fillStyle = bg;
  g.fillRect(0, 0, 96, 156);
  // night-sky speckle
  for (let i = 0; i < 70; i++) {
    g.fillStyle = i % 5 ? 'rgba(200,180,255,0.35)' : 'rgba(255,240,200,0.9)';
    g.fillRect((i * 37) % 88 + 4, (i * 61) % 110 + 14, 1, 1);
  }
  g.strokeStyle = '#e8c878';
  g.lineWidth = 3;
  g.strokeRect(3, 3, 90, 150);
  g.lineWidth = 1;
  g.strokeStyle = '#a88a4a';
  g.strokeRect(8, 8, 80, 140);
  g.fillStyle = '#f2d58a';
  g.font = `bold 11px ${FONT}`;
  g.textAlign = 'center';
  g.fillText('XVII', 48, 22);
  // the great star and its seven small ones
  const glow = g.createRadialGradient(48, 70, 2, 48, 70, 34);
  glow.addColorStop(0, 'rgba(255,240,190,0.9)');
  glow.addColorStop(1, 'rgba(160,110,255,0)');
  g.fillStyle = glow;
  g.fillRect(10, 30, 76, 80);
  g.fillStyle = '#ffe9a8';
  star(g, 48, 70, 24, 8, 0.38);
  g.fill();
  g.fillStyle = '#fff8e0';
  star(g, 48, 70, 10, 8, 0.45);
  g.fill();
  const small: [number, number][] = [[20, 40], [76, 40], [16, 76], [80, 76], [24, 104], [72, 104], [48, 34]];
  for (const [x, y] of small) { g.fillStyle = '#f7dca0'; star(g, x, y, 4.5, 4, 0.35); g.fill(); }
  // water line
  g.strokeStyle = 'rgba(140,220,255,0.7)';
  g.beginPath();
  for (let x = 12; x <= 84; x += 2) g.lineTo(x, 116 + Math.sin(x * 0.4) * 1.5);
  g.stroke();
  g.fillStyle = '#0c0724';
  g.fillRect(12, 126, 72, 18);
  g.strokeStyle = '#e8c878';
  g.strokeRect(12.5, 126.5, 71, 17);
  g.fillStyle = '#f2d58a';
  g.font = `bold 10px ${FONT}`;
  g.fillText('THE STAR', 48, 139);
  return tex(c);
}

export function tarotBack(): Texture {
  const [c, g] = canvas(96, 156);
  g.fillStyle = '#1b0d3a';
  g.fillRect(0, 0, 96, 156);
  g.strokeStyle = 'rgba(201,167,255,0.45)';
  for (let y = -96; y < 156; y += 12) {
    g.beginPath(); g.moveTo(0, y); g.lineTo(96, y + 96); g.stroke();
    g.beginPath(); g.moveTo(96, y); g.lineTo(0, y + 96); g.stroke();
  }
  g.strokeStyle = '#e8c878';
  g.lineWidth = 3;
  g.strokeRect(3, 3, 90, 150);
  g.fillStyle = '#1b0d3a';
  g.beginPath(); g.arc(48, 78, 22, 0, Math.PI * 2); g.fill();
  g.lineWidth = 2;
  g.beginPath(); g.arc(48, 78, 22, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#e8c878';
  g.beginPath(); g.ellipse(48, 78, 13, 7, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#1b0d3a';
  g.beginPath(); g.arc(48, 78, 4.5, 0, Math.PI * 2); g.fill();
  return tex(c);
}

/** Closing Time: striped awning with a scalloped hem. */
export function awning(): Texture {
  const [c, g] = canvas(48, 20);
  for (let x = 0; x < 48; x += 6) {
    g.fillStyle = (x / 6) % 2 ? '#ffe7d2' : '#ff5fa2';
    g.fillRect(x, 0, 6, 16);
    g.beginPath(); g.arc(x + 3, 16, 3, 0, Math.PI); g.fill();
  }
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(0, 0, 48, 2);
  return tex(c);
}

export function shutter(): Texture {
  const [c, g] = canvas(32, 32);
  g.fillStyle = '#5d6f7c';
  g.fillRect(0, 0, 32, 32);
  for (let y = 0; y < 32; y += 4) {
    g.fillStyle = '#8fa3af'; g.fillRect(0, y, 32, 1);
    g.fillStyle = '#3a4852'; g.fillRect(0, y + 3, 32, 1);
  }
  g.fillStyle = 'rgba(255,95,162,0.8)';
  g.fillRect(6, 13, 9, 2);
  g.fillRect(17, 17, 7, 2);
  g.fillStyle = '#2a343c';
  g.fillRect(13, 28, 6, 3);
  return tex(c, true);
}

/** A hand-lettered neon sign; the shader flickers it. */
export function neonSign(text: string, color: string): Texture {
  const [c, g] = canvas(128, 36);
  g.fillStyle = '#07040a';
  g.fillRect(0, 0, 128, 36);
  g.strokeStyle = 'rgba(255,255,255,0.15)';
  g.strokeRect(1.5, 1.5, 125, 33);
  g.font = `italic bold 21px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = color;
  g.shadowBlur = 8;
  g.fillStyle = color;
  g.fillText(text, 64, 19);
  g.shadowBlur = 0;
  g.fillStyle = '#fff4fa';
  g.fillText(text, 64, 19);
  return tex(c);
}

/** Workshop disc label: title across the top band, a small tag under the hub. Transparent elsewhere. */
export function discLabel(title: string, accent: string): Texture {
  const [c, g] = canvas(128, 128);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = 'rgba(4,10,16,0.82)';
  g.beginPath(); g.arc(64, 64, 62, Math.PI * 1.08, Math.PI * 1.92); g.arc(64, 64, 30, Math.PI * 1.9, Math.PI * 1.1, true); g.fill();
  let size = 15;
  g.font = `bold ${size}px ${FONT}`;
  while (g.measureText(title).width > 84 && size > 9) { size--; g.font = `bold ${size}px ${FONT}`; }
  g.fillStyle = '#ffffff';
  g.fillText(title, 64, 34);
  g.fillStyle = accent;
  g.fillRect(40, 44, 48, 2);
  g.font = `bold 8px ${FONT}`;
  g.fillStyle = 'rgba(255,255,255,0.8)';
  g.fillText('WORKSHOP BUILD', 64, 100);
  return tex(c);
}
