import { H, PLAYER_R, W, clamp, easeOutBack, easeOutCubic, lerp } from './math.ts';
import { AFFIX_COLORS, AFFIX_LABEL, ENEMY_COLORS, EVENT_COLORS, type Simulation } from './sim.ts';
import { offerTier } from './upgrades.ts';
import type { Enemy, Point } from './types.ts';

export type RenderState = {
  /** Smoothed facing angle for the player sprite. */
  visAngle: number;
  /** Smoothed aim angle for torso and weapon. */
  visAim: number;
  /** Accumulated leg-cycle phase. */
  stride: number;
  /** Wall-clock milliseconds for ambient animation. */
  time: number;
  /** Whether the pointer is inside the arena. */
  inside: boolean;
  shakeEnabled: boolean;
};

function circle(c: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, width = 1) {
  c.beginPath();
  c.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
  c.strokeStyle = color;
  c.lineWidth = width;
  c.stroke();
}

function polygon(c: CanvasRenderingContext2D, sides: number, r: number, rot = 0) {
  c.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * Math.PI * 2;
    if (i === 0) c.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  c.closePath();
}

function hpBar(c: CanvasRenderingContext2D, x: number, y: number, w: number, frac: number, color: string) {
  c.fillStyle = '#00000088';
  c.fillRect(x - w / 2 - 1, y - 1, w + 2, 6);
  c.fillStyle = '#3a2a2a';
  c.fillRect(x - w / 2, y, w, 4);
  c.fillStyle = color;
  c.fillRect(x - w / 2, y, w * clamp(frac, 0, 1), 4);
}

export function draw(sim: Simulation, canvas: HTMLCanvasElement, c: CanvasRenderingContext2D, alpha: number, rs: RenderState) {
  const cw = canvas.width, ch = canvas.height, t = rs.time / 1000;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.fillStyle = '#0b1418';
  c.fillRect(0, 0, cw, ch);
  const scale = Math.min(cw / W, ch / H);
  c.translate((cw - W * scale) / 2, (ch - H * scale) / 2);
  c.scale(scale, scale);

  if (rs.shakeEnabled) {
    // Screen shake: a decaying pseudo-random jitter.
    if (sim.shake > 0) {
      const m = sim.shake * sim.shake * 9;
      c.translate(Math.sin(t * 91) * m, Math.cos(t * 113) * m);
    }
    // Impact bump: a tenth of a second, vertical only, on landed hits.
    if (sim.impact > 0) c.translate(0, Math.sin(t * 90) * sim.impact * 30);
  }

  const p = sim.status === 'running'
    ? { x: lerp(sim.previous.x, sim.player.x, alpha), y: lerp(sim.previous.y, sim.player.y, alpha) }
    : sim.player;

  drawBackground(sim, c, t);
  drawGround(sim, c, p, t);
  drawOrbs(sim, c, t);
  drawDangers(sim, c);
  drawOmens(sim, c, t);
  drawGhosts(sim, c);
  const lastOne = sim.isRun && sim.alive.length === 1 && sim.spawnQueue.length === 0;
  for (const e of sim.enemies) if (!e.dead) drawEnemy(sim, c, e, t, lastOne);
  drawBeams(sim, c);
  drawBolts(sim, c);
  drawPlayer(sim, c, p, rs, t);
  drawShield(sim, c, p, t);
  drawParticles(sim, c);
  drawEffects(sim, c);
  drawOverlays(sim, c, t);
  drawCursor(sim, c, rs);
}

function drawBackground(sim: Simulation, c: CanvasRenderingContext2D, t: number) {
  const hue = sim.isRun ? (186 + sim.wave * 11) % 360 : 186;
  const bg = c.createRadialGradient(740, 450, 30, 740, 450, 850);
  bg.addColorStop(0, `hsl(${hue} 32% 13%)`);
  bg.addColorStop(1, `hsl(${hue} 40% 6%)`);
  c.fillStyle = bg;
  c.fillRect(0, 0, W, H);

  // Slowly drifting grid.
  const drift = (t * 6) % 70;
  c.lineWidth = 1;
  c.strokeStyle = `hsl(${hue} 25% 30% / 0.28)`;
  for (let x = 30 + drift - 70; x < W; x += 70) {
    c.beginPath(); c.moveTo(x, 35); c.lineTo(x, H - 35); c.stroke();
  }
  for (let y = 35 + drift - 70; y < H; y += 70) {
    c.beginPath(); c.moveTo(30, y); c.lineTo(W - 30, y); c.stroke();
  }
  c.strokeStyle = '#55737540';
  c.strokeRect(30, 35, W - 60, H - 70);
  c.setLineDash([6, 12]);
  circle(c, 750, 460, 320 + Math.sin(t * 0.7) * 6, '#466c6e44');
  circle(c, 750, 460, 90, '#466c6e44');
  c.setLineDash([]);

  // Ambient dust for parallax feel.
  c.fillStyle = `hsl(${hue} 40% 70% / 0.18)`;
  for (let i = 0; i < 46; i++) {
    const sp = 6 + (i % 4) * 5;
    const x = 40 + ((i * 337.7 + t * sp) % (W - 80));
    const y = 45 + ((i * 211.3 + Math.sin(t * 0.4 + i) * 14) % (H - 90));
    c.beginPath();
    c.arc(x, y, 1 + (i % 3) * 0.6, 0, Math.PI * 2);
    c.fill();
  }

  c.fillStyle = '#77918b66';
  c.font = '14px monospace';
  c.fillText(sim.isRun ? `SECTOR ${String(sim.wave).padStart(2, '0')} / ORBWALK ROGUE` : 'SECTOR 01 / ORBWALK', 65, 80);
  c.fillText(sim.isRun ? 'PERMADEATH ARENA' : 'TRAINING FIELD', W - 225, H - 60);
}

function drawGround(sim: Simulation, c: CanvasRenderingContext2D, p: Point, t: number) {
  const range = sim.stats.range;
  if (sim.settings.showRange || sim.armed) {
    if (sim.armed) {
      c.fillStyle = '#ffd78c09';
      c.beginPath(); c.arc(p.x, p.y, range, 0, Math.PI * 2); c.fill();
    }
    // Ring colour is a state cue: amber when chasing a target that is out of range,
    // bright when armed, and a soft breathing teal otherwise.
    const chasing = sim.target && !sim.inRange(sim.target);
    const color = sim.armed ? '#ffd78ce0' : chasing ? '#f4b26a99' : `rgba(105,212,193,${0.4 + Math.sin(t * 2) * 0.08})`;
    c.setLineDash(sim.armed ? [] : [8, 10]);
    circle(c, p.x, p.y, range, color, sim.armed ? 3 : 2);
    c.setLineDash([]);
  }
  if (sim.destination) {
    c.strokeStyle = '#70dfca40';
    c.setLineDash([5, 10]);
    c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(sim.destination.x, sim.destination.y); c.stroke();
    c.setLineDash([]);
    circle(c, sim.destination.x, sim.destination.y, 9, '#6ef7d3');
  }
  if (sim.attackOrder && sim.attackPoint && !sim.target) {
    c.setLineDash([3, 6]);
    circle(c, sim.attackPoint.x, sim.attackPoint.y, 12, '#e7c17799', 1.5);
    c.setLineDash([]);
  }
}

function drawOrbs(sim: Simulation, c: CanvasRenderingContext2D, t: number) {
  for (const o of sim.orbs) {
    const pulse = 1 + Math.sin(t * 9 + o.x) * 0.18;
    const fade = o.life < 2 ? o.life / 2 : 1;
    const big = o.bounty ? 2.2 : 1;
    c.globalAlpha = fade;
    c.fillStyle = '#ffd66b33';
    c.beginPath(); c.arc(o.x, o.y, 11 * pulse * big, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ffe28a';
    c.save();
    c.translate(o.x, o.y);
    c.rotate(t * 2.5);
    polygon(c, 4, 5.5 * pulse * big);
    c.fill();
    c.restore();
    if (o.bounty) {
      // Bounty cache: a wide beacon ring, a countdown arc and a label so it reads from across the arena.
      c.setLineDash([8, 10]);
      c.lineDashOffset = -t * 50;
      circle(c, o.x, o.y, 34 + Math.sin(t * 4) * 3, '#ffd66b99', 2);
      c.setLineDash([]);
      c.lineDashOffset = 0;
      c.strokeStyle = '#ffe28a';
      c.lineWidth = 3;
      c.beginPath(); c.arc(o.x, o.y, 26, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(o.life / 9, 0, 1)); c.stroke();
      c.fillStyle = '#ffe28a';
      c.font = 'bold 11px monospace';
      c.textAlign = 'center';
      c.fillText(`BOUNTY +${o.value}`, o.x, o.y - 42);
      c.textAlign = 'left';
    }
    c.globalAlpha = 1;
  }
}

/** Omens: telegraphed floor markers that become ambush portals or a bounty cache when their arc closes. */
function drawOmens(sim: Simulation, c: CanvasRenderingContext2D, t: number) {
  for (const o of sim.omens) {
    const f = 1 - o.life / o.max;
    if (o.kind === 'shrine') {
      // Tithe shrine: a pale-blue altar with a draining timer ring and the price on offer.
      c.save();
      c.translate(o.x, o.y);
      c.fillStyle = 'rgba(141,227,255,0.08)';
      c.beginPath(); c.arc(0, 0, 44, 0, Math.PI * 2); c.fill();
      c.setLineDash([5, 7]);
      c.lineDashOffset = -t * 30;
      circle(c, 0, 0, 44, EVENT_COLORS.tithe, 2);
      c.setLineDash([]);
      c.lineDashOffset = 0;
      c.strokeStyle = '#ffffff';
      c.lineWidth = 3;
      c.beginPath(); c.arc(0, 0, 36, -Math.PI / 2, -Math.PI / 2 + (1 - f) * Math.PI * 2); c.stroke();
      c.fillStyle = EVENT_COLORS.tithe;
      c.strokeStyle = '#e8f8ff';
      c.lineWidth = 2;
      c.save();
      c.rotate(Math.PI / 4 + Math.sin(t * 2) * 0.1);
      c.fillRect(-10, -10, 20, 20);
      c.strokeRect(-10, -10, 20, 20);
      c.restore();
      c.fillStyle = '#e8f8ff';
      c.font = 'bold 11px monospace';
      c.textAlign = 'center';
      c.fillText(`TITHE +${o.value ?? 0}`, 0, -52);
      c.font = '10px monospace';
      c.fillStyle = EVENT_COLORS.ambush;
      c.fillText('CALLS 3 MORE', 0, 62);
      c.textAlign = 'left';
      c.restore();
      continue;
    }
    const col = o.kind === 'ambush' ? EVENT_COLORS.ambush : EVENT_COLORS.bounty;
    const r = o.kind === 'ambush' ? 30 : 40;
    c.save();
    c.translate(o.x, o.y);
    c.fillStyle = o.kind === 'ambush' ? `rgba(255,107,107,${0.08 + f * 0.18})` : `rgba(255,214,107,${0.08 + f * 0.14})`;
    c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill();
    c.rotate(t * (o.kind === 'ambush' ? -3 : 1.5));
    c.setLineDash([6, 8]);
    circle(c, 0, 0, r + 6 - f * 6, col, 2);
    c.setLineDash([]);
    c.rotate(-t * (o.kind === 'ambush' ? -3 : 1.5));
    c.strokeStyle = '#ffffff';
    c.lineWidth = 3;
    c.beginPath(); c.arc(0, 0, r - 6, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2); c.stroke();
    if (o.kind === 'ambush') {
      // Flickering warning glyph in the centre.
      c.fillStyle = Math.sin(t * 22) > 0 ? '#ffffff' : col;
      c.font = 'bold 16px monospace';
      c.textAlign = 'center';
      c.fillText('!', 0, 6);
      c.textAlign = 'left';
    }
    c.restore();
  }
}

function drawDangers(sim: Simulation, c: CanvasRenderingContext2D) {
  const t = performance.now() / 1000;
  for (const d of sim.dangers) {
    const tele = d.age < d.delay;
    if (d.kind === 'mine') {
      // Proximity mine: arming ring sweeps shut, then a slow amber pulse with a hard trigger radius.
      c.save();
      const col = ENEMY_COLORS.miner;
      if (d.resolved) {
        const f = Math.max(0, 1 - (d.life - d.age) / 0.35);
        c.globalAlpha = 1 - f;
        circle(c, d.x, d.y, d.radius + f * 120, col, 3);
      } else if (tele) {
        const f = d.age / d.delay;
        c.globalAlpha = 0.5 + f * 0.5;
        c.setLineDash([4, 6]);
        circle(c, d.x, d.y, d.radius, `${col}88`, 1.5);
        c.setLineDash([]);
        c.strokeStyle = col;
        c.lineWidth = 3;
        c.beginPath(); c.arc(d.x, d.y, 9, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2); c.stroke();
      } else {
        const fading = d.life - d.age < 2 ? (d.life - d.age) / 2 : 1;
        const pulse = 0.55 + Math.sin(t * 5 + d.x) * 0.25;
        c.globalAlpha = fading;
        c.fillStyle = `rgba(255,179,92,${0.08 + pulse * 0.06})`;
        c.beginPath(); c.arc(d.x, d.y, d.radius, 0, Math.PI * 2); c.fill();
        circle(c, d.x, d.y, d.radius, `rgba(255,179,92,${0.35 + pulse * 0.4})`, 1.5);
        c.fillStyle = '#3a2408';
        c.beginPath(); c.arc(d.x, d.y, 8, 0, Math.PI * 2); c.fill();
        circle(c, d.x, d.y, 8, col, 2);
        c.fillStyle = pulse > 0.7 ? '#fff1d6' : col;
        c.beginPath(); c.arc(d.x, d.y, 2.5, 0, Math.PI * 2); c.fill();
        // Three prongs so it reads as a device, not a puddle.
        c.strokeStyle = col;
        c.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
          const a = t * 0.8 + (i / 3) * Math.PI * 2;
          c.beginPath(); c.moveTo(d.x + Math.cos(a) * 9, d.y + Math.sin(a) * 9); c.lineTo(d.x + Math.cos(a) * 15, d.y + Math.sin(a) * 15); c.stroke();
        }
      }
      c.restore();
      continue;
    }
    if (d.kind === 'cloud') {
      // Hexer miasma: layered violet blobs that breathe; forms translucent, then thickens as it hunts.
      c.save();
      const col = ENEMY_COLORS.hexer;
      const f = tele ? d.age / d.delay : 1;
      const fading = d.life - d.age < 1.5 ? (d.life - d.age) / 1.5 : 1;
      c.globalAlpha = (tele ? 0.25 + f * 0.45 : 0.7) * fading;
      for (let i = 0; i < 5; i++) {
        const a = t * (0.6 + i * 0.13) + i * 1.3, r = d.radius * (0.45 + (i % 3) * 0.14);
        const ox = Math.cos(a) * d.radius * 0.35, oy = Math.sin(a * 1.2) * d.radius * 0.3;
        c.fillStyle = i % 2 ? '#7a2fa066' : '#d45cff44';
        c.beginPath(); c.arc(d.x + ox, d.y + oy, r * f, 0, Math.PI * 2); c.fill();
      }
      c.setLineDash([6, 8]);
      c.lineDashOffset = -t * 40;
      circle(c, d.x, d.y, d.radius * f, tele ? `${col}66` : col, tele ? 1.5 : 2);
      c.setLineDash([]);
      c.lineDashOffset = 0;
      c.restore();
      continue;
    }
    if (d.kind === 'circle') {
      c.save();
      if (!tele) c.globalAlpha = Math.max(0, 1 - (d.age - d.delay) / (d.life - d.delay));
      c.fillStyle = tele ? '#ff546220' : '#ff6b6530';
      c.beginPath(); c.arc(d.x, d.y, d.radius, 0, Math.PI * 2); c.fill();
      circle(c, d.x, d.y, d.radius + (tele ? 0 : (d.age - d.delay) * 140), '#ff7c7c', 2);
      if (tele) {
        const f = d.age / d.delay;
        circle(c, d.x, d.y, d.radius * f, '#ff7c7c88', 2);
        c.strokeStyle = `rgba(255,124,124,${0.3 + f * 0.6})`;
        c.lineWidth = 3;
        c.beginPath(); c.arc(d.x, d.y, d.radius + 6, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2); c.stroke();
      }
      c.restore();
    } else {
      const len = Math.hypot(d.vx, d.vy), nx = d.vx / len, ny = d.vy / len;
      if (tele) {
        const f = d.age / d.delay;
        c.lineWidth = 26;
        c.strokeStyle = `rgba(255,100,112,${0.06 + f * 0.1})`;
        c.beginPath(); c.moveTo(d.x, d.y); c.lineTo(d.x + nx * 1900, d.y + ny * 1900); c.stroke();
        c.lineWidth = 1;
        c.strokeStyle = '#ff829080';
        c.setLineDash([9, 12]);
        c.lineDashOffset = -f * 60;
        c.stroke();
        c.setLineDash([]);
        c.lineDashOffset = 0;
        circle(c, d.x, d.y, 22, '#ff8794', 3);
        circle(c, d.x, d.y, 29 * f, '#ff8794', 2);
      } else {
        c.lineCap = 'round';
        for (let i = 0; i < d.trail.length; i++) {
          const q = d.trail[i], a = (i + 1) / (d.trail.length + 1);
          c.globalAlpha = a * 0.35;
          c.lineWidth = 26 * a;
          c.strokeStyle = d.hit ? '#8e566b' : '#ff5168';
          c.beginPath(); c.moveTo(q.x, q.y); c.lineTo(d.x, d.y); c.stroke();
        }
        c.globalAlpha = 1;
        c.lineWidth = 9;
        c.strokeStyle = d.hit ? '#a56876' : '#ff9da4';
        c.beginPath(); c.moveTo(d.x - nx * 35, d.y - ny * 35); c.lineTo(d.x, d.y); c.stroke();
        c.fillStyle = '#fff1f1';
        c.beginPath(); c.arc(d.x, d.y, 4.5, 0, Math.PI * 2); c.fill();
        c.lineCap = 'butt';
      }
    }
  }
}

function drawGhosts(sim: Simulation, c: CanvasRenderingContext2D) {
  for (const g of sim.ghosts) {
    c.save();
    c.globalAlpha = (g.life / 0.3) * 0.45;
    c.translate(g.x, g.y);
    c.rotate(g.angle);
    c.fillStyle = '#9ff5ff';
    c.beginPath(); c.ellipse(0, 0, 11, 15, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(2, 0, 7.5, 0, Math.PI * 2); c.fill();
    c.restore();
  }
}

function drawEnemy(sim: Simulation, c: CanvasRenderingContext2D, e: Enemy, t: number, lastOne: boolean) {
  const color = ENEMY_COLORS[e.kind];
  const s = e.spawn < 1 ? Math.max(0.01, easeOutBack(e.spawn)) : 1;
  c.save();
  c.translate(e.x, e.y);
  if (e.spawn < 1) {
    c.globalAlpha = 1 - e.spawn;
    circle(c, 0, 0, e.radius * 2.4 * (1 - easeOutCubic(e.spawn)) + e.radius, color, 2);
    c.globalAlpha = 1;
  }
  c.fillStyle = '#00000040';
  c.beginPath(); c.ellipse(0, e.radius * 0.6, e.radius * 1.5 * s, e.radius * 0.8 * s, 0, 0, Math.PI * 2); c.fill();
  if (sim.target?.id === e.id) circle(c, 0, 0, e.radius + 12 + Math.sin(t * 8) * 1.5, '#f4d18a', 2);
  // Last enemy of the wave: a slow gold pulse so the finish line is obvious.
  if (lastOne && e.spawn >= 1) circle(c, 0, 0, e.radius + 22 + Math.sin(t * 3) * 6, `rgba(255,214,107,${0.35 + Math.sin(t * 3) * 0.2})`, 2);
  if (e.slow > 0) circle(c, 0, 0, e.radius + 6, '#9fe0ff', 2);
  // Champion affix aura: a slow-turning dashed ring in the affix colour.
  if (e.affix) {
    c.save();
    c.rotate(t * (e.affix === 'swift' ? 3 : 1.2));
    c.setLineDash([6, 7]);
    circle(c, 0, 0, e.radius + 10, AFFIX_COLORS[e.affix], 2);
    c.setLineDash([]);
    c.restore();
    if (e.affix === 'warded' && e.invulnerable) {
      c.fillStyle = `${AFFIX_COLORS.warded}33`;
      c.beginPath(); c.arc(0, 0, e.radius + 9, 0, Math.PI * 2); c.fill();
      circle(c, 0, 0, e.radius + 9, '#ffffff', 2);
    }
    if (e.affix === 'gilded') {
      // Escape timer: a gold arc that empties clockwise.
      const f = clamp(e.life / 14, 0, 1);
      c.strokeStyle = AFFIX_COLORS.gilded;
      c.lineWidth = 3;
      c.beginPath(); c.arc(0, 0, e.radius + 16, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2); c.stroke();
    }
  }
  if (e.shred > 0) {
    // Shatter Point mark: cracked gold shards orbiting the target.
    c.strokeStyle = '#ffe37a';
    c.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const a = t * 4 + (i / 4) * Math.PI * 2;
      c.beginPath(); c.moveTo(Math.cos(a) * (e.radius + 4), Math.sin(a) * (e.radius + 4)); c.lineTo(Math.cos(a + 0.25) * (e.radius + 10), Math.sin(a + 0.25) * (e.radius + 10)); c.stroke();
    }
  }
  if (e.burn > 0) {
    c.strokeStyle = `rgba(255,154,74,${0.4 + Math.sin(t * 14) * 0.2})`;
    c.lineWidth = 2 + e.burn;
    c.beginPath(); c.arc(0, 0, e.radius + 3, 0, Math.PI * 2); c.stroke();
  }
  c.scale(s, s);
  const fill = e.flash > 0 ? '#ffffff' : color;
  switch (e.kind) {
    case 'dummy': {
      circle(c, 0, 0, 28, '#b99661', 2);
      c.rotate(Math.PI / 4);
      c.fillStyle = e.flash > 0 ? '#fff5cb' : '#715c3a';
      c.strokeStyle = '#efd39b';
      c.lineWidth = 2;
      c.fillRect(-15, -15, 30, 30);
      c.strokeRect(-15, -15, 30, 30);
      c.fillStyle = '#f8da94';
      c.fillRect(-5, -5, 10, 10);
      break;
    }
    case 'drone': {
      c.rotate(e.angle);
      const squash = 1 + Math.sin(e.wobble * 2) * 0.08;
      c.scale(squash, 1 / squash);
      c.fillStyle = fill;
      c.strokeStyle = '#ffc5b0';
      c.lineWidth = 2;
      polygon(c, 3, e.radius);
      c.fill(); c.stroke();
      c.fillStyle = '#2a1410';
      c.beginPath(); c.arc(e.radius * 0.25, 0, 4, 0, Math.PI * 2); c.fill();
      break;
    }
    case 'archer': {
      c.rotate(e.angle);
      c.fillStyle = fill;
      c.strokeStyle = '#e6c9ff';
      c.lineWidth = 2;
      polygon(c, 4, e.radius, 0);
      c.fill(); c.stroke();
      const draw = e.cooldown < 0.6 ? 1 - e.cooldown / 0.6 : 0;
      c.strokeStyle = draw > 0.6 ? '#ffffff' : '#f3e7ff';
      c.lineWidth = 2;
      c.beginPath(); c.arc(e.radius + 4, 0, 10, -Math.PI / 2, Math.PI / 2); c.stroke();
      c.beginPath(); c.moveTo(e.radius + 4, -10); c.lineTo(e.radius + 4 - draw * 12, 0); c.lineTo(e.radius + 4, 10); c.stroke();
      break;
    }
    case 'bomber': {
      const arm = e.arming > 0 ? e.arming / 0.72 : 0;
      const pulse = 1 + Math.sin(t * (6 + arm * 30)) * (0.06 + arm * 0.16);
      c.fillStyle = e.arming > 0 && Math.sin(t * 40 * (1 + arm)) > 0 ? '#ffffff' : fill;
      c.strokeStyle = '#fff1c2';
      c.lineWidth = 2;
      c.beginPath(); c.arc(0, 0, e.radius * pulse, 0, Math.PI * 2); c.fill(); c.stroke();
      c.strokeStyle = '#3a2a08';
      c.lineWidth = 3;
      c.beginPath(); c.arc(0, 0, e.radius * 0.5, 0, Math.PI * 2); c.stroke();
      c.fillStyle = '#3a2a08';
      c.fillRect(-2, -e.radius - 8, 4, 8);
      break;
    }
    case 'leech': {
      // A wriggling teardrop; when latched it bares its mouth toward the player.
      c.rotate(e.angle);
      const wig = Math.sin(e.wobble * 2) * 0.35;
      c.fillStyle = fill;
      c.strokeStyle = '#e4ffb0';
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(e.radius, 0);
      c.quadraticCurveTo(0, -e.radius * (0.9 + wig), -e.radius * 1.4, -e.radius * 0.35 * wig);
      c.quadraticCurveTo(0, e.radius * (0.9 - wig), e.radius, 0);
      c.closePath();
      c.fill(); c.stroke();
      c.fillStyle = e.latched ? '#ffffff' : '#1c2a0c';
      c.beginPath(); c.arc(e.radius * 0.45, 0, e.latched ? 3.5 : 2.5, 0, Math.PI * 2); c.fill();
      if (e.latched) {
        c.strokeStyle = '#ffffff';
        c.lineWidth = 1.5;
        c.beginPath(); c.arc(e.radius * 0.7, 0, 5, -1.1, 1.1); c.stroke();
      }
      break;
    }
    case 'splitter': {
      // A jelly blob that breathes; generations get smaller and paler.
      const breathe = 1 + Math.sin(e.wobble) * 0.12;
      c.scale(breathe, 1 / breathe);
      c.fillStyle = e.flash > 0 ? '#ffffff' : e.generation === 0 ? color : e.generation === 1 ? '#8de3ff' : '#c3f0ff';
      c.strokeStyle = '#e8fbff';
      c.lineWidth = 2;
      c.beginPath();
      for (let i = 0; i <= 12; i++) {
        const a = (i / 12) * Math.PI * 2, r = e.radius * (1 + Math.sin(a * 3 + e.wobble * 2) * 0.08);
        if (i === 0) c.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      c.closePath();
      c.fill(); c.stroke();
      // Nuclei: one per remaining split.
      c.fillStyle = '#0d2a36';
      const n = 2 - e.generation;
      for (let i = 0; i < Math.max(1, n); i++) {
        const a = e.wobble * 0.7 + i * Math.PI;
        c.beginPath(); c.arc(Math.cos(a) * e.radius * 0.35 * Math.min(1, n), Math.sin(a) * e.radius * 0.35 * Math.min(1, n), e.radius * 0.22, 0, Math.PI * 2); c.fill();
      }
      break;
    }
    case 'bulwark': {
      // A squat armoured body with a tower shield; planted = shield raised in a frozen facing.
      const planted = e.pattern === 1;
      c.save();
      c.rotate(e.angle);
      c.fillStyle = fill;
      c.strokeStyle = '#dbe3f5';
      c.lineWidth = 2.5;
      polygon(c, 8, e.radius, Math.PI / 8);
      c.fill(); c.stroke();
      c.fillStyle = '#1c2230';
      polygon(c, 8, e.radius * 0.5, Math.PI / 8);
      c.fill();
      // Legs stomp while advancing.
      if (!planted) {
        c.strokeStyle = '#6c778f';
        c.lineWidth = 4;
        const step = Math.sin(t * 9) * 6;
        c.beginPath(); c.moveTo(-6, -e.radius * 0.6); c.lineTo(-10 + step, -e.radius - 6); c.stroke();
        c.beginPath(); c.moveTo(-6, e.radius * 0.6); c.lineTo(-10 - step, e.radius + 6); c.stroke();
      }
      c.restore();
      // The shield itself lives in facing space.
      c.save();
      c.rotate(e.facing);
      const raised = planted ? 1 : 0.55;
      const r = e.radius + (planted ? 12 : 4);
      c.globalAlpha = raised;
      c.lineCap = 'round';
      c.strokeStyle = e.block > 0 ? '#ffffff' : planted ? '#dfe9ff' : '#7f8aa6';
      c.lineWidth = planted ? 9 : 5;
      c.beginPath(); c.arc(0, 0, r, -1.05, 1.05); c.stroke();
      if (planted) {
        c.strokeStyle = `rgba(207,227,255,${0.35 + Math.sin(t * 6) * 0.15})`;
        c.lineWidth = 2;
        c.beginPath(); c.arc(0, 0, r + 8, -1.05, 1.05); c.stroke();
        // Rivets.
        c.fillStyle = '#1c2230';
        for (const a of [-0.7, 0, 0.7]) { c.beginPath(); c.arc(Math.cos(a) * r, Math.sin(a) * r, 2.2, 0, Math.PI * 2); c.fill(); }
      }
      c.lineCap = 'butt';
      c.restore();
      break;
    }
    case 'miner': {
      // A boxy sapper with a pack; the lamp flickers brighter as the next mine comes due.
      c.rotate(e.angle);
      const due = e.cooldown < 0.8 ? 1 - e.cooldown / 0.8 : 0;
      c.fillStyle = fill;
      c.strokeStyle = '#ffe1bd';
      c.lineWidth = 2;
      c.fillRect(-e.radius * 0.8, -e.radius * 0.7, e.radius * 1.6, e.radius * 1.4);
      c.strokeRect(-e.radius * 0.8, -e.radius * 0.7, e.radius * 1.6, e.radius * 1.4);
      c.fillStyle = '#3a2408';
      c.fillRect(-e.radius * 1.1, -e.radius * 0.45, e.radius * 0.4, e.radius * 0.9);
      c.fillStyle = due > 0.5 && Math.sin(t * 30) > 0 ? '#ffffff' : '#fff1d6';
      c.beginPath(); c.arc(e.radius * 0.55, 0, 3 + due * 2, 0, Math.PI * 2); c.fill();
      // A mine peeking out of the pack.
      c.fillStyle = '#3a2408';
      c.beginPath(); c.arc(-e.radius * 0.9, -e.radius * 0.75, 4, 0, Math.PI * 2); c.fill();
      circle(c, -e.radius * 0.9, -e.radius * 0.75, 4, color, 1.5);
      break;
    }
    case 'hexer': {
      // A hooded caster: a tall diamond with a drifting inner eye; the halo brightens before a cast.
      c.rotate(e.angle);
      const cast = e.cooldown < 1 ? 1 - e.cooldown : 0;
      c.save();
      c.rotate(-e.angle + t * 0.9);
      c.setLineDash([3, 9]);
      circle(c, 0, 0, e.radius + 9 + cast * 6, `rgba(212,92,255,${0.3 + cast * 0.6})`, 2);
      c.setLineDash([]);
      c.restore();
      c.fillStyle = fill;
      c.strokeStyle = '#f0d0ff';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(e.radius * 1.2, 0); c.lineTo(0, -e.radius * 0.8); c.lineTo(-e.radius, 0); c.lineTo(0, e.radius * 0.8);
      c.closePath();
      c.fill(); c.stroke();
      c.fillStyle = '#2a0b36';
      c.beginPath(); c.ellipse(e.radius * 0.15, 0, e.radius * 0.5, e.radius * 0.3, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = cast > 0.6 ? '#ffffff' : '#f4b8ff';
      c.beginPath(); c.arc(e.radius * 0.25 + Math.sin(t * 2) * 3, 0, 3 + cast * 2, 0, Math.PI * 2); c.fill();
      break;
    }
    case 'warden': {
      c.save();
      c.rotate(e.spin * 0.8);
      c.setLineDash([14, 10]);
      circle(c, 0, 0, e.radius + 14, color, 3);
      c.setLineDash([]);
      c.restore();
      c.rotate(-e.spin * 0.4);
      c.fillStyle = fill;
      c.strokeStyle = '#ffd1e0';
      c.lineWidth = 3;
      polygon(c, 6, e.radius);
      c.fill(); c.stroke();
      c.fillStyle = '#2a0b16';
      polygon(c, 6, e.radius * 0.45, Math.PI / 6);
      c.fill();
      c.fillStyle = e.cooldown < 0.5 ? '#ffffff' : color;
      c.beginPath(); c.arc(0, 0, 6 + (e.cooldown < 0.5 ? (0.5 - e.cooldown) * 16 : 0), 0, Math.PI * 2); c.fill();
      break;
    }
  }
  c.restore();
  if (e.kind === 'dummy') {
    c.fillStyle = '#d9c59f';
    c.font = '12px monospace';
    c.textAlign = 'center';
    c.fillText('TARGET 0' + e.id, e.x, e.y - 48);
    c.fillStyle = e.flash ? '#fff2be' : '#c7a46b';
    c.fillRect(e.x - 28, e.y - 38, 56, 4);
    c.textAlign = 'left';
  } else if (e.spawn >= 1 && e.hp < e.maxHp) {
    const low = !e.elite && sim.stats.executioner && e.hp / e.maxHp < 0.15;
    hpBar(c, e.x, e.y - e.radius - 14, e.elite ? 90 : 40, e.hp / e.maxHp, low ? '#ff5c8a' : color);
  }
  if (e.affix && e.spawn >= 1) {
    c.fillStyle = AFFIX_COLORS[e.affix];
    c.font = 'bold 10px monospace';
    c.textAlign = 'center';
    c.fillText(AFFIX_LABEL[e.affix], e.x, e.y - e.radius - 20);
    c.textAlign = 'left';
  }
}

/** Overflow shield: a cyan hex ring around the player that thins as it drains. */
function drawShield(sim: Simulation, c: CanvasRenderingContext2D, p: Point, t: number) {
  if (sim.shield <= 0 || sim.status === 'idle') return;
  const f = clamp(sim.shield / Math.max(1, sim.stats.shieldMax), 0, 1);
  c.save();
  c.translate(p.x, p.y);
  c.rotate(t * 0.7);
  c.globalAlpha = 0.35 + f * 0.5;
  c.fillStyle = `rgba(159,245,255,${0.05 + f * 0.08})`;
  polygon(c, 6, PLAYER_R + 12);
  c.fill();
  c.strokeStyle = '#9ff5ff';
  c.lineWidth = 1.5 + f * 2.5;
  c.stroke();
  c.restore();
}

function drawBeams(sim: Simulation, c: CanvasRenderingContext2D) {
  for (const b of sim.beams) {
    const f = b.life / b.max;
    c.globalAlpha = f;
    c.lineCap = 'round';
    for (const [w, col] of [[9, `${b.color}44`], [4, b.color], [1.5, '#ffffff']] as [number, string][]) {
      c.strokeStyle = col;
      c.lineWidth = w;
      c.beginPath();
      for (let i = 0; i < b.points.length - 1; i++) {
        const a = b.points[i], d = b.points[i + 1];
        c.moveTo(a.x, a.y);
        // Jagged lightning: three midpoints offset perpendicular to the segment.
        const dx = d.x - a.x, dy = d.y - a.y, len = Math.hypot(dx, dy) || 1;
        for (let k = 1; k <= 3; k++) {
          const s = k / 4, off = Math.sin(i * 7 + k * 13 + b.life * 200) * len * 0.08;
          c.lineTo(a.x + dx * s - dy / len * off, a.y + dy * s + dx / len * off);
        }
        c.lineTo(d.x, d.y);
      }
      c.stroke();
    }
    c.lineCap = 'butt';
  }
  c.globalAlpha = 1;
}

function drawBolts(sim: Simulation, c: CanvasRenderingContext2D) {
  for (const b of sim.bolts) {
    const a = Math.atan2(b.target.y - b.y, b.target.x - b.x);
    const col = b.crit ? '#ffe37a' : sim.hero.colors.bolt;
    c.lineCap = 'round';
    for (let i = 0; i < b.trail.length; i++) {
      const q = b.trail[i], f = (i + 1) / (b.trail.length + 1);
      c.globalAlpha = f * 0.5;
      c.lineWidth = (b.heavy ? 9 : 6) * f;
      c.strokeStyle = col;
      c.beginPath(); c.moveTo(q.x, q.y); c.lineTo(b.x, b.y); c.stroke();
    }
    c.globalAlpha = 1;
    if (b.heavy) {
      c.fillStyle = '#3a2410';
      c.beginPath(); c.arc(b.x, b.y, 8, 0, Math.PI * 2); c.fill();
      circle(c, b.x, b.y, 8, col, 2.5);
      c.fillStyle = '#fff5dd';
      c.beginPath(); c.arc(b.x - Math.cos(a) * 3, b.y - Math.sin(a) * 3, 2.5, 0, Math.PI * 2); c.fill();
    } else {
      c.strokeStyle = col;
      c.lineWidth = b.crit ? 7 : 5;
      c.beginPath(); c.moveTo(b.x - Math.cos(a) * 25, b.y - Math.sin(a) * 25); c.lineTo(b.x, b.y); c.stroke();
      circle(c, b.x, b.y, b.crit ? 7 : 5, '#e5fff7', 2);
    }
    c.lineCap = 'butt';
  }
}

function drawPlayer(sim: Simulation, c: CanvasRenderingContext2D, p: Point, rs: RenderState, t: number) {
  if (sim.dead) return;
  const hero = sim.hero, col = hero.colors;
  const moving = sim.status === 'running' && (sim.destination !== null || sim.dashing > 0) && sim.windupLeft <= 0;
  const dashing = sim.dashing > 0;
  const lowHp = sim.isRun && sim.hp / sim.stats.maxHp < 0.35;
  const windupFrac = sim.windupLeft > 0 ? 1 - sim.windupLeft / sim.windupTotal : 0;
  const breath = Math.sin(t * 2.2) * (moving ? 0 : 0.03);
  const tremble = lowHp ? Math.sin(t * 60) * 0.6 : 0;
  const bounce = moving && !dashing ? Math.abs(Math.sin(rs.stride)) * 2.2 : 0;

  const hurtBlink = sim.hurtFlash > 0 && Math.floor(sim.hurtFlash * 30) % 2 === 0;
  const skin = hurtBlink ? '#ffffff' : dashing ? '#bffcff' : col.skin;
  const trim = sim.hurtFlash > 0 ? '#ffd6dc' : col.trim;
  const dark = col.dark;

  c.save();
  c.translate(p.x + tremble, p.y - bounce);

  // Ground: shadow, rings, buffs and state cues.
  c.fillStyle = '#00000050';
  c.beginPath(); c.ellipse(0, 15 + bounce, 28 - bounce, 13 - bounce * 0.4, 0, 0, Math.PI * 2); c.fill();
  if (sim.invulnerable > 0) circle(c, 0, 0, 30, '#9ff5ff', 2);
  // Attack-ready: a brief brightening tick on the inner ring.
  const readyGlow = sim.attackReadyPulse > 0 ? sim.attackReadyPulse / 0.35 : 0;
  circle(c, 0, 0, 24 + readyGlow * 3, readyGlow > 0 ? `rgba(200,255,240,${0.5 + readyGlow * 0.5})` : '#8bf0d4', 2 + readyGlow);
  // Dash-ready: an expanding cyan ring that fades, plus an idle pulse while a charge is banked.
  if (sim.dashReadyPulse > 0) {
    const f = 1 - sim.dashReadyPulse / 0.7;
    circle(c, 0, 0, 30 + f * 34, `rgba(159,245,255,${(1 - f) * 0.9})`, 3 * (1 - f) + 1);
  }
  if (sim.dashCharges > 0 && sim.isRun) {
    const pulse = 0.5 + Math.sin(t * 2.4) * 0.5;
    circle(c, 0, 0, 40 + pulse * 2, `rgba(159,245,255,${0.18 + pulse * 0.22})`, 1.5);
  }
  for (let i = 0; i < sim.adrenaline.length; i++) {
    const a = t * 4 + (i / 3) * Math.PI * 2;
    c.fillStyle = '#ffb56c';
    c.beginPath(); c.arc(Math.cos(a) * 32, Math.sin(a) * 32, 3, 0, Math.PI * 2); c.fill();
  }
  // Momentum stacks: a trailing arc that fills as you keep moving.
  if (sim.stats.momentum && sim.momentum > 0) {
    c.strokeStyle = `rgba(255,181,108,${0.5 + (sim.momentum / 20) * 0.5})`;
    c.lineWidth = 3;
    c.beginPath(); c.arc(0, 0, 46, Math.PI / 2 - 0.2, Math.PI / 2 - 0.2 + (sim.momentum / 20) * Math.PI * 1.4); c.stroke();
  }

  // --- Lower body, in run-facing space ---------------------------------------------------
  c.save();
  c.rotate(rs.visAngle);
  if (dashing) {
    c.strokeStyle = '#bffcff88';
    c.lineWidth = 2;
    for (let i = -1; i <= 1; i++) {
      c.beginPath(); c.moveTo(-18, i * 9); c.lineTo(-48 - Math.abs(i) * 6, i * 9); c.stroke();
    }
  }
  const capeLen = dashing ? 34 : moving ? 24 : 14;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(-6, 0);
  for (let i = 1; i <= 5; i++) {
    const f = i / 5;
    c.lineTo(-6 - f * capeLen, Math.sin(t * (moving ? 18 : 5) - f * 4) * (2 + f * (moving ? 5 : 2.5)));
  }
  c.strokeStyle = col.cape;
  c.lineWidth = hero.weapon === 'cannon' ? 9 : 7;
  c.stroke();
  c.strokeStyle = col.capeTrim;
  c.lineWidth = 3;
  c.stroke();
  c.lineCap = 'butt';
  const stride = moving && !dashing ? Math.sin(rs.stride) * 7 : 0;
  for (const side of [-1, 1]) {
    const lift = moving && !dashing ? Math.max(0, Math.sin(rs.stride + (side > 0 ? 0 : Math.PI))) : 0;
    c.fillStyle = lift > 0.5 ? col.capeTrim : col.cape;
    c.strokeStyle = dark;
    c.lineWidth = 1.2;
    c.beginPath(); c.ellipse(stride * side, side * 8, 5.5 + lift, 3.6, 0, 0, Math.PI * 2); c.fill(); c.stroke();
  }
  c.restore();

  // --- Upper body, in aim space ----------------------------------------------------------
  c.save();
  c.rotate(rs.visAim);
  const kickMax = hero.weapon === 'cannon' ? 9 : 5, kickT = hero.weapon === 'cannon' ? 0.18 : 0.12;
  const kick = sim.recoil > 0 ? -(sim.recoil / kickT) * kickMax : 0;
  c.translate(kick, 0);
  const lean = dashing ? 1.3 : 1 + (moving ? 0.06 : 0) + breath;
  c.scale(lean, 1 / lean);
  if (hero.weapon === 'bow') {
    // Quiver on the back shoulder.
    c.save();
    c.translate(-7, -9);
    c.rotate(-0.5);
    c.fillStyle = '#5a4630';
    c.fillRect(-3, -8, 6, 14);
    c.fillStyle = '#f0dca8';
    for (let i = -1; i <= 1; i++) { c.beginPath(); c.arc(i * 1.8, -9, 1.2, 0, Math.PI * 2); c.fill(); }
    c.restore();
  } else if (hero.weapon === 'blade') {
    // Bandolier of throwing blades across the back.
    c.save();
    c.translate(-6, 0);
    c.rotate(0.35);
    c.fillStyle = dark;
    c.fillRect(-2, -13, 4, 26);
    c.fillStyle = '#e9eef5';
    for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(-3, i * 5 - 2); c.lineTo(3, i * 5 - 2); c.lineTo(0, i * 5 + 2); c.closePath(); c.fill(); }
    c.restore();
  } else {
    // Ammo drum on the back.
    c.fillStyle = '#3a2410';
    c.beginPath(); c.arc(-9, -8, 6, 0, Math.PI * 2); c.fill();
    c.strokeStyle = col.trim;
    c.lineWidth = 1.5;
    c.stroke();
  }
  // Shoulders and torso; the cannoneer is broader.
  const torsoW = hero.weapon === 'cannon' ? 13 : 11, torsoH = hero.weapon === 'cannon' ? 17 : 15;
  c.fillStyle = skin;
  c.beginPath(); c.ellipse(0, 0, torsoW, torsoH, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = trim;
  c.beginPath(); c.ellipse(3, 0, 5, 9, 0, 0, Math.PI * 2); c.fill();
  c.strokeStyle = dark;
  c.lineWidth = 1.5;
  c.beginPath(); c.ellipse(0, 0, torsoW, torsoH, 0, 0, Math.PI * 2); c.stroke();
  if (hero.weapon === 'cannon') {
    // Shoulder pads.
    c.fillStyle = dark;
    for (const s of [-1, 1]) { c.beginPath(); c.ellipse(-3, s * 14, 5, 3.5, 0, 0, Math.PI * 2); c.fill(); }
  }

  if (hero.weapon === 'bow') {
    const gripX = 17;
    const pull = windupFrac * 14;
    c.strokeStyle = skin;
    c.lineWidth = 4;
    c.lineCap = 'round';
    c.beginPath(); c.moveTo(4, -9); c.lineTo(gripX, -2); c.stroke();
    c.beginPath(); c.moveTo(2, 9); c.lineTo(gripX - 3 - pull, 1); c.stroke();
    c.lineCap = 'butt';
    c.strokeStyle = '#e9d7a5';
    c.lineWidth = 2.5;
    c.beginPath(); c.arc(gripX - 2, 0, 15, -Math.PI * 0.42, Math.PI * 0.42); c.stroke();
    const tipY = 15 * Math.sin(Math.PI * 0.42), tipX = gripX - 2 + 15 * Math.cos(Math.PI * 0.42);
    c.strokeStyle = sim.flash > 0.08 ? '#ffffff' : '#c9f7e9';
    c.lineWidth = sim.flash > 0.08 ? 2 : 1;
    c.beginPath(); c.moveTo(tipX, -tipY); c.lineTo(gripX - 3 - pull, 0); c.lineTo(tipX, tipY); c.stroke();
    if (sim.windupLeft > 0) {
      c.strokeStyle = '#f6d895';
      c.lineWidth = 2;
      c.beginPath(); c.moveTo(gripX - 3 - pull, 0); c.lineTo(gripX + 14, 0); c.stroke();
      c.fillStyle = '#ffffff';
      c.beginPath(); c.moveTo(gripX + 18, 0); c.lineTo(gripX + 12, -3); c.lineTo(gripX + 12, 3); c.closePath(); c.fill();
      c.fillStyle = '#ff8f6b';
      c.beginPath(); c.moveTo(gripX - 3 - pull, 0); c.lineTo(gripX - 7 - pull, -3); c.lineTo(gripX - 7 - pull, 3); c.closePath(); c.fill();
    } else if (sim.flash > 0.08) {
      c.fillStyle = '#ffffffaa';
      c.beginPath(); c.arc(gripX + 14, 0, (sim.flash - 0.08) * 120, 0, Math.PI * 2); c.fill();
    }
  } else if (hero.weapon === 'blade') {
    // Throwing blades: the lead hand cocks back through the windup, then snaps forward on release.
    const cock = windupFrac * 10;
    const tempo = sim.tempoReady;
    c.strokeStyle = skin;
    c.lineWidth = 4;
    c.lineCap = 'round';
    // Off hand forward, blade hand back.
    c.beginPath(); c.moveTo(4, -9); c.lineTo(15, -5); c.stroke();
    c.beginPath(); c.moveTo(2, 9); c.lineTo(9 - cock, 12 + cock * 0.4); c.stroke();
    c.lineCap = 'butt';
    // Held blade in the off hand.
    c.fillStyle = '#e9eef5';
    c.beginPath(); c.moveTo(15, -5); c.lineTo(27, -9); c.lineTo(17, -1); c.closePath(); c.fill();
    // Blade being wound up in the throwing hand.
    if (sim.windupLeft > 0) {
      c.save();
      c.translate(9 - cock, 12 + cock * 0.4);
      c.rotate(-0.6 - windupFrac * 0.8);
      c.fillStyle = tempo ? col.capeTrim : '#e9eef5';
      c.beginPath(); c.moveTo(0, 0); c.lineTo(13, -3); c.lineTo(2, 3); c.closePath(); c.fill();
      c.restore();
    } else if (sim.flash > 0.06) {
      // Release: a slash arc in front of the hand.
      c.strokeStyle = sim.tempoFlash > 0 ? col.capeTrim : '#ffffffcc';
      c.lineWidth = 3;
      c.beginPath(); c.arc(14, 0, 14 + (0.14 - sim.flash) * 90, -0.6, 0.6); c.stroke();
    }
    // Tempo cue: a bright spark at the throwing hand while the window is open.
    if (tempo && sim.status === 'running') {
      c.fillStyle = `rgba(255,159,176,${0.5 + Math.sin(t * 20) * 0.4})`;
      c.beginPath(); c.arc(11, 12, 3.5, 0, Math.PI * 2); c.fill();
    }
  } else {
    // Cannon: shoulder-mounted barrel with a heat glow that climbs with heat.
    const heat = sim.heat / 4;
    const barrelLen = 26 + windupFrac * 3;
    c.strokeStyle = skin;
    c.lineWidth = 4;
    c.lineCap = 'round';
    c.beginPath(); c.moveTo(4, -9); c.lineTo(14, -6); c.stroke();
    c.beginPath(); c.moveTo(2, 9); c.lineTo(9, 5); c.stroke();
    c.lineCap = 'butt';
    c.fillStyle = '#3a2410';
    c.fillRect(4, -6, barrelLen, 12);
    c.fillStyle = heat > 0 ? `rgba(255,${Math.round(150 - heat * 90)},${Math.round(90 - heat * 60)},${0.35 + heat * 0.55})` : '#5a3a1a';
    c.fillRect(8, -4, barrelLen - 8, 8);
    c.strokeStyle = col.trim;
    c.lineWidth = 1.5;
    c.strokeRect(4, -6, barrelLen, 12);
    // Muzzle ring and breech.
    c.fillStyle = dark;
    c.fillRect(4 + barrelLen - 3, -8, 4, 16);
    c.fillRect(2, -8, 4, 16);
    if (heat >= 1 && Math.sin(t * 30) > 0) { c.fillStyle = '#ffffffaa'; c.fillRect(8, -4, barrelLen - 8, 8); }
    // Charge glow inside the barrel during windup; shell flash on release.
    if (sim.windupLeft > 0) {
      c.fillStyle = `rgba(255,210,122,${windupFrac})`;
      c.beginPath(); c.arc(4 + barrelLen, 0, 2 + windupFrac * 4, 0, Math.PI * 2); c.fill();
    } else if (sim.flash > 0.06) {
      c.fillStyle = '#ffe7b8cc';
      c.beginPath(); c.arc(4 + barrelLen + 4, 0, (sim.flash - 0.06) * 180, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#fff4dd';
      c.lineWidth = 2;
      for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(4 + barrelLen + 6, i * 6); c.lineTo(4 + barrelLen + 18 + (1 - Math.abs(i)) * 8, i * 12); c.stroke(); }
    }
  }
  // Head with visor.
  c.fillStyle = skin;
  c.beginPath(); c.arc(2, 0, 7.5, 0, Math.PI * 2); c.fill();
  c.strokeStyle = dark;
  c.lineWidth = 1.5;
  c.stroke();
  c.strokeStyle = sim.armed ? '#ffd78c' : trim;
  c.lineWidth = 2.5;
  c.beginPath(); c.arc(2, 0, 5.5, -0.9, 0.9); c.stroke();
  c.restore();
  c.restore();

  // Tempo shot landed: a quick cape-coloured ring.
  if (sim.tempoFlash > 0) circle(c, p.x, p.y, 26 + (0.25 - sim.tempoFlash) * 160, col.capeTrim, 2.5);
  // Timing rings.
  if (sim.windupLeft > 0) {
    c.lineWidth = 5;
    c.strokeStyle = sim.hero.heat && sim.heat > 0 ? '#ff9a6b' : sim.hero.tempo && sim.tempoReady ? col.capeTrim : '#ffd18a';
    c.beginPath();
    c.arc(p.x, p.y, 33, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * windupFrac);
    c.stroke();
  } else if (sim.flash > 0) {
    circle(c, p.x, p.y, 30 + (0.14 - sim.flash) * 130, col.bolt, 3);
  }
  // Dash cooldown arc and charge pips.
  if (sim.dashCd > 0) {
    c.lineWidth = 3;
    c.strokeStyle = '#9ff5ff88';
    c.beginPath();
    c.arc(p.x, p.y, 40, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - sim.dashCd / sim.stats.dashCd));
    c.stroke();
  }
  if (sim.stats.dashCharges > 1) {
    for (let i = 0; i < sim.stats.dashCharges; i++) {
      c.fillStyle = i < sim.dashCharges ? '#9ff5ff' : '#2f4a52';
      c.beginPath(); c.arc(p.x - 6 + i * 12, p.y - 52, 3, 0, Math.PI * 2); c.fill();
    }
  }
  // Heat pips for the cannoneer.
  if (sim.hero.heat) {
    for (let i = 0; i < 4; i++) {
      c.fillStyle = i < sim.heat ? (sim.heat >= 4 ? '#ff5c5c' : '#ff9a6b') : '#3a2a20';
      c.fillRect(p.x - 14 + i * 8, p.y + 54, 6, 3);
    }
  }
  if (sim.isRun) hpBar(c, p.x, p.y - 44, 52, sim.hp / sim.stats.maxHp, lowHp ? '#ff677d' : '#79f1cd');
  else { c.fillStyle = '#79f1cd'; c.fillRect(p.x - 22, p.y - 44, 44, 4); }
  c.fillStyle = '#c9f7e9';
  c.font = '12px monospace';
  c.textAlign = 'center';
  c.fillText(sim.armed ? 'CLICK TO ATTACK' : 'YOU', p.x, p.y + 48);
  c.textAlign = 'left';
}

function drawParticles(sim: Simulation, c: CanvasRenderingContext2D) {
  for (const q of sim.particles) {
    const f = q.life / q.max;
    c.globalAlpha = f;
    if (q.shape === 'ring') {
      circle(c, q.x, q.y, q.size + (1 - f) * q.size * 3, q.color, 3 * f);
      continue;
    }
    c.fillStyle = q.color;
    if (q.shape === 'dot') {
      c.beginPath(); c.arc(q.x, q.y, q.size * f, 0, Math.PI * 2); c.fill();
    } else {
      c.save();
      c.translate(q.x, q.y);
      c.rotate(q.rot);
      c.fillRect(-q.size, -q.size * 0.4, q.size * 2 * f + 1, q.size * 0.8);
      c.restore();
    }
  }
  c.globalAlpha = 1;
}

function drawEffects(sim: Simulation, c: CanvasRenderingContext2D) {
  for (const e of sim.effects) {
    const f = e.life / e.max;
    c.globalAlpha = f;
    if (e.text) {
      const pop = 1 + Math.max(0, (f - 0.85) * 4);
      c.font = `bold ${Math.round((e.size ?? 19) * pop)}px monospace`;
      c.textAlign = 'center';
      c.fillStyle = e.color;
      c.fillText(e.text, e.x, e.y - 40 - (e.max - e.life) * (e.rise ?? 42));
      c.textAlign = 'left';
    } else {
      circle(c, e.x, e.y, 10 + (1 - f) * 30, e.color, 2);
    }
  }
  c.globalAlpha = 1;
}

function drawOverlays(sim: Simulation, c: CanvasRenderingContext2D, t: number) {
  if (!sim.isRun) return;
  const elite = sim.enemies.find(e => e.elite && !e.dead && e.spawn >= 1);
  if (elite) {
    c.fillStyle = '#ff5c8a';
    c.font = 'bold 13px monospace';
    c.textAlign = 'center';
    c.fillText(sim.wave % 6 === 0 ? 'OVERSEER' : 'WARDEN', W / 2, 74);
    hpBar(c, W / 2, 82, 420, elite.hp / elite.maxHp, '#ff5c8a');
    c.textAlign = 'left';
  }
  // Elite arrival: a brief pink edge flash.
  if (sim.eliteFlash > 0) {
    const g = c.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.9);
    g.addColorStop(0, 'rgba(255,92,138,0)');
    g.addColorStop(1, `rgba(255,92,138,${(sim.eliteFlash / 0.9) * 0.45})`);
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
  }
  // Enrage clock: a thin bar along the top during the fight, draining to red; once enraged it pulses with the level.
  if (sim.waveState === 'fighting') {
    const left = sim.enrageLimit - sim.fightTime;
    const show = left < 15 || sim.enrage > 0;
    if (show) {
      const f = clamp(left / 15, 0, 1);
      c.fillStyle = '#00000088';
      c.fillRect(W / 2 - 160, 96, 320, 8);
      c.fillStyle = sim.enrage > 0 ? (Math.sin(t * 12) > 0 ? '#ff5c5c' : '#ff9a6b') : `rgb(255,${Math.round(120 + f * 100)},${Math.round(90 + f * 60)})`;
      c.fillRect(W / 2 - 160, 96, 320 * (sim.enrage > 0 ? 1 : 1 - f), 8);
      c.fillStyle = sim.enrage > 0 ? '#ff5c5c' : '#ffb56c';
      c.font = 'bold 11px monospace';
      c.textAlign = 'center';
      c.fillText(sim.enrage > 0 ? `ENRAGED ×${sim.enrage} · +${sim.enrage * 8}% SPEED · +${sim.enrage * 10}% DAMAGE` : `ENRAGE IN ${Math.ceil(left)}s`, W / 2, 118);
      c.textAlign = 'left';
    }
  }
  // Cull vulnerability: an amber tint at the edges while quarry live.
  if (sim.cullAlive > 0) {
    const g = c.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 0.95);
    g.addColorStop(0, 'rgba(255,179,92,0)');
    g.addColorStop(1, `rgba(255,179,92,${0.18 + Math.sin(t * 5) * 0.06})`);
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
  }
  // Mid-wave event banner: slides in under the top bar and fades, without blocking the arena.
  if (sim.eventBanner) {
    const b = sim.eventBanner;
    const f = clamp(1 - b.life / b.max, 0, 1);
    const slide = easeOutCubic(Math.min(1, f * 4));
    const fade = f > 0.7 ? 1 - (f - 0.7) / 0.3 : 1;
    c.save();
    c.globalAlpha = fade;
    c.fillStyle = '#0a131899';
    c.fillRect(W / 2 - 300, 104, 600, 64);
    c.fillStyle = b.color;
    c.fillRect(W / 2 - 300, 104, 4, 64);
    c.fillRect(W / 2 + 296, 104, 4, 64);
    c.font = 'bold 30px monospace';
    c.textAlign = 'center';
    c.fillText(b.text, W / 2 + (1 - slide) * 200, 134);
    c.font = '13px monospace';
    c.fillStyle = '#e8f3f1';
    c.fillText(b.sub, W / 2 - (1 - slide) * 120, 156);
    c.textAlign = 'left';
    c.restore();
  }
  if (sim.waveState === 'banner' || sim.waveState === 'clear') {
    const total = sim.waveState === 'banner' ? 1.4 : 1.5;
    const f = clamp(1 - sim.waveTimer / total, 0, 1);
    const slide = easeOutCubic(Math.min(1, f * 3));
    const fade = f > 0.75 ? 1 - (f - 0.75) / 0.25 : 1;
    c.globalAlpha = fade;
    c.fillStyle = '#0a131866';
    c.fillRect(0, H / 2 - 70, W, 140);
    c.fillStyle = sim.waveState === 'banner' ? '#a2ebcd' : '#ffd66b';
    c.font = 'bold 54px monospace';
    c.textAlign = 'center';
    c.fillText(sim.waveState === 'banner' ? `WAVE ${sim.wave}` : 'WAVE CLEAR', W / 2 + (1 - slide) * 260, H / 2 + 6);
    c.font = '15px monospace';
    c.fillStyle = '#c9f7e9';
    const tier = sim.ascendNext ? 'prismatic' : offerTier(sim.wave);
    const next = tier === 'prismatic' ? 'PRISMATIC DRAFT' : tier === 'gold' ? 'GOLD DRAFT' : 'CHOOSE AN AUGMENT';
    const wardens = sim.spawnQueue.filter(k => k === 'warden').length;
    const inbound = wardens >= 2 ? 'TWO WARDENS APPROACH' : wardens === 1 ? 'A WARDEN APPROACHES' : `${sim.spawnQueue.length} HOSTILES INBOUND`;
    c.fillText(sim.waveState === 'banner' ? inbound : `+${4 + Math.floor(sim.wave * 0.6)} GOLD  ·  ${next}`, W / 2 - (1 - slide) * 160, H / 2 + 42);
    c.textAlign = 'left';
    c.globalAlpha = 1;
  }
  const frac = sim.hp / sim.stats.maxHp;
  if (sim.status !== 'idle' && frac < 0.35) {
    const pulse = 0.35 + Math.sin(t * 6) * 0.15;
    const g = c.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.85);
    g.addColorStop(0, 'rgba(255,60,80,0)');
    g.addColorStop(1, `rgba(255,60,80,${(1 - frac / 0.35) * pulse})`);
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
  }
}

function drawCursor(sim: Simulation, c: CanvasRenderingContext2D, rs: RenderState) {
  if (!rs.inside || sim.status !== 'running') return;
  const cur = sim.cursor;
  c.strokeStyle = sim.armed ? '#ffd78c' : '#a4f1df';
  c.lineWidth = 1.5;
  circle(c, cur.x, cur.y, sim.armed ? 14 : 5, c.strokeStyle);
  if (sim.armed) {
    c.setLineDash([3, 10]);
    circle(c, cur.x, cur.y, 220, '#ffd78c25');
    c.setLineDash([]);
  }
  for (const [x, y] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    c.beginPath(); c.moveTo(cur.x + x * 10, cur.y + y * 10); c.lineTo(cur.x + x * 20, cur.y + y * 20); c.stroke();
  }
}

export { PLAYER_R };
