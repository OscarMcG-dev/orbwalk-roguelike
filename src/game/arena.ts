import { Synth } from './audio.ts';
import { H, STEP, W } from './math.ts';
import { draw, type RenderState } from './render.ts';
import { Simulation } from './sim.ts';
import type { Point, Settings, Snapshot } from './types.ts';

/**
 * Canvas-bound game: wires pointer/keyboard input, runs the fixed-step loop with
 * hit-stop, diffs event counters for sound, and renders through render.ts.
 */
export class Arena extends Simulation {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  notify: (s: Snapshot) => void;
  raf = 0;
  timer: ReturnType<typeof setTimeout> | null = null;
  last = 0;
  acc = 0;
  lastUI = 0;
  hitStop = 0;
  synth = new Synth();
  observer: ResizeObserver;
  inside = false;
  heldRight = false;
  listeners: (() => void)[] = [];
  rs: RenderState = { visAngle: 0, visAim: 0, stride: 0, time: 0, inside: false, shakeEnabled: true };

  constructor(canvas: HTMLCanvasElement, settings: Settings, notify: (s: Snapshot) => void) {
    super(settings);
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.notify = notify;
    this.synth.enabled = settings.sound;
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);

    const on = (el: EventTarget, type: string, fn: EventListener, opts?: AddEventListenerOptions | boolean) => {
      el.addEventListener(type, fn, opts);
      this.listeners.push(() => el.removeEventListener(type, fn, opts));
    };
    on(canvas, 'contextmenu', e => e.preventDefault());
    on(canvas, 'pointermove', ev => {
      this.point(ev as PointerEvent);
      if (this.heldRight && this.inside) this.move(this.cursor);
    });
    on(canvas, 'pointerenter', () => { this.inside = true; });
    on(canvas, 'pointerleave', () => { this.inside = false; });
    on(window, 'pointerup', () => { this.heldRight = false; });
    on(window, 'pointercancel', () => { this.heldRight = false; });
    on(canvas, 'pointerdown', ev => {
      const e = ev as PointerEvent;
      this.point(e);
      if (!this.inside) return;
      canvas.focus({ preventScroll: true });
      this.synth.wake();
      if (e.button === 2) {
        e.preventDefault();
        this.heldRight = true;
        this.move(this.cursor);
      } else if (e.button === 0 && this.armed) {
        this.attack(this.cursor);
      }
    });
    on(window, 'keydown', e => this.handleKey(e as KeyboardEvent), true);
    on(window, 'blur', () => this.pause());
    on(document, 'visibilitychange', () => { if (document.hidden) this.pause(); });
    this.schedule();
  }

  /**
   * Prefer requestAnimationFrame, but keep a timeout watchdog so the simulation still steps
   * (at a lower rate) in embedded or throttled browsers where rAF stalls.
   */
  schedule() {
    const run = () => {
      cancelAnimationFrame(this.raf);
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
      this.frame(performance.now());
    };
    this.raf = requestAnimationFrame(run);
    this.timer = setTimeout(run, 50);
  }

  handleKey(e: KeyboardEvent) {
    const target = e.target as HTMLElement | null;
    if (target?.isContentEditable || target?.closest?.('input,textarea,select,[contenteditable="true"]')) return;
    const key = e.key?.toLowerCase();
    // Ctrl/Cmd+S would open the browser's "save page" file picker mid-fight (S is Stop, and a held
    // modifier is an easy slip). Swallow it and treat it as Stop.
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (key === 's' || e.code === 'KeyS')) {
      e.preventDefault();
      if (this.status === 'running') {
        this.stop();
        this.notify(this.snapshot());
      }
      return;
    }
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const known = ['KeyA', 'KeyS', 'KeyE', 'Space', 'Enter', 'Escape', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit7', 'Digit8', 'Digit9', 'KeyR', 'KeyH', 'KeyF', 'KeyB'];
    const code = (known.includes(e.code) ? e.code : '')
      || ({ a: 'KeyA', s: 'KeyS', e: 'KeyE', ' ': 'Space', enter: 'Enter', escape: 'Escape', '1': 'Digit1', '2': 'Digit2', '3': 'Digit3', '4': 'Digit4', '7': 'Digit7', '8': 'Digit8', '9': 'Digit9', r: 'KeyR', h: 'KeyH', f: 'KeyF', b: 'KeyB' } as Record<string, string>)[key || '']
      || ({ 65: 'KeyA', 83: 'KeyS', 69: 'KeyE', 32: 'Space', 13: 'Enter', 27: 'Escape', 49: 'Digit1', 50: 'Digit2', 51: 'Digit3', 52: 'Digit4', 55: 'Digit7', 56: 'Digit8', 57: 'Digit9', 82: 'KeyR', 72: 'KeyH', 70: 'KeyF', 66: 'KeyB' } as Record<number, string>)[e.keyCode];

    if (code === 'Enter' && (this.status === 'idle' || this.status === 'ended')) {
      e.preventDefault();
      this.start();
      return;
    }
    if (this.status === 'choosing') {
      // 1-4 pick (or banish, when armed with B), 7-9 anvil, F fourth offer, B banish mode, A ascend, R reroll, H heal.
      if (code === 'Digit1' || code === 'Digit2' || code === 'Digit3' || code === 'Digit4') { e.preventDefault(); this.choose(Number(code.slice(-1)) - 1); }
      else if (code === 'Digit7' || code === 'Digit8' || code === 'Digit9') { e.preventDefault(); this.buyShard(Number(code.slice(-1)) - 7); }
      else if (code === 'KeyR') { e.preventDefault(); this.reroll(); }
      else if (code === 'KeyH') { e.preventDefault(); this.buyHeal(); }
      else if (code === 'KeyF') { e.preventDefault(); this.buyFourth(); }
      else if (code === 'KeyB') { e.preventDefault(); this.toggleBanish(); }
      else if (code === 'KeyA') { e.preventDefault(); this.ascend(); }
      else if (code === 'Escape' && this.banishMode) { e.preventDefault(); this.toggleBanish(); }
      this.notify(this.snapshot());
      return;
    }
    if (this.status !== 'running' && this.status !== 'paused') return;
    if (code === 'Space') { e.preventDefault(); this.togglePause(); return; }
    if (this.status !== 'running') return;
    if (code === 'KeyS') {
      e.preventDefault();
      this.stop();
      this.canvas.focus({ preventScroll: true });
      this.notify(this.snapshot());
      return;
    }
    if (code === 'KeyA') {
      e.preventDefault();
      this.heldRight = false;
      if (this.settings.quick) { if (this.inside) this.attack(this.cursor); }
      else this.armed = true;
      this.canvas.focus({ preventScroll: true });
      this.notify(this.snapshot());
      return;
    }
    if (code === 'KeyE') {
      e.preventDefault();
      this.heldRight = false;
      this.dash(this.inside ? this.cursor : this.player);
      return;
    }
    if (code === 'Escape') {
      e.preventDefault();
      if (this.armed) this.armed = false;
      else this.togglePause();
    }
  }

  override stop() {
    this.heldRight = false;
    super.stop();
    this.previous = { ...this.player };
    this.effect(this.player, '#a1ffdf', 'STOP');
  }

  override attack(p: Point) {
    this.heldRight = false;
    super.attack(p);
  }

  configure(s: Settings) {
    const restart = this.status === 'idle' || this.status === 'ended';
    this.settings = { ...s };
    this.synth.enabled = s.sound;
    this.rs.shakeEnabled = s.shake;
    if (restart) {
      this.recomputeStats();
      this.hp = this.stats.maxHp;
      this.dashCharges = this.stats.dashCharges;
      this.resetTargets();
    }
  }

  override start() {
    super.start();
    this.synth.wake();
    this.canvas.focus({ preventScroll: true });
    this.notify(this.snapshot());
  }

  override choose(i: number) {
    super.choose(i);
    this.canvas.focus({ preventScroll: true });
    this.notify(this.snapshot());
  }

  pause() {
    if (this.status === 'running') {
      this.status = 'paused';
      this.heldRight = false;
      this.notify(this.snapshot());
    }
  }

  togglePause() {
    if (this.status === 'running') this.pause();
    else if (this.status === 'paused') {
      this.status = 'running';
      this.canvas.focus({ preventScroll: true });
      this.notify(this.snapshot());
    }
  }

  point(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect(), scale = Math.min(r.width / W, r.height / H);
    this.cursor = { x: (e.clientX - r.left - (r.width - W * scale) / 2) / scale, y: (e.clientY - r.top - (r.height - H * scale) / 2) / scale };
    this.inside = this.cursor.x >= 0 && this.cursor.x <= W && this.cursor.y >= 0 && this.cursor.y <= H;
  }

  resize() {
    const r = this.canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
  }

  frame(t: number) {
    const real = this.last ? Math.min((t - this.last) / 1000, 0.1) : 0;
    this.last = t;
    // Hit-stop: briefly slow the simulation clock after big impacts.
    const scale = this.hitStop > 0 ? 0.25 : 1;
    this.hitStop = Math.max(0, this.hitStop - real);
    this.acc += real * scale;

    const before = {
      shot: this.shotEvent, hit: this.hitEvent, kill: this.killEvent, pickup: this.pickupEvent,
      wave: this.waveEvent, dash: this.dashEvent, upgrade: this.upgradeEvent, status: this.status,
      ready: this.dashReadyEvent, quest: this.questEvent, block: this.blockEvent, champion: this.championEvent,
      event: this.eventEvent, cut: this.cutEvent, swing: this.swingEvent,
    };
    let steps = 0;
    while (this.acc >= STEP && steps < 12) {
      this.update(STEP);
      this.acc -= STEP;
      steps++;
    }
    if (steps === 12) this.acc = 0;

    const stop = (s: number) => { this.hitStop = Math.max(this.hitStop, s * this.tuning.hitStop); };
    if (before.shot !== this.shotEvent) this.synth.shot();
    if (before.hit !== this.hitEvent) { this.synth.hurt(); stop(0.09); }
    if (before.kill !== this.killEvent) { this.synth.kill(); stop(0.035); }
    if (before.pickup !== this.pickupEvent) this.synth.pickup();
    if (before.wave !== this.waveEvent) this.synth.wave();
    if (before.dash !== this.dashEvent) this.synth.dash();
    if (before.upgrade !== this.upgradeEvent) this.synth.upgrade();
    if (before.ready !== this.dashReadyEvent) this.synth.ready();
    if (before.quest !== this.questEvent) { this.synth.quest(); stop(0.12); }
    if (before.block !== this.blockEvent) this.synth.block();
    if (before.champion !== this.championEvent) this.synth.champion();
    if (before.event !== this.eventEvent) { this.synth.event(); stop(0.08); }
    if (before.cut !== this.cutEvent) { this.synth.cut(); stop(0.03); }
    if (before.swing !== this.swingEvent) this.synth.swing();
    if (before.status !== this.status) {
      if (this.status === 'ended' && this.dead) this.synth.death();
      this.notify(this.snapshot());
    }

    // Smooth body facing; the torso tracks the aim while a target is held, else settles to the body.
    const turn = (from: number, to: number, rate: number) => {
      let d = to - from;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      return from + d * Math.min(1, real * rate);
    };
    this.rs.visAngle = turn(this.rs.visAngle, this.angle, 18);
    const aiming = this.target !== null || this.windupLeft > 0 || this.recoil > 0;
    // A dash throws the whole body forward; otherwise the torso follows the aim, then drifts back to the run direction.
    const aimTarget = this.dashing > 0 ? this.angle : aiming ? this.aimAngle : this.rs.visAngle;
    this.rs.visAim = turn(this.rs.visAim, aimTarget, this.dashing > 0 ? 40 : aiming ? 22 : 8);
    const running = this.status === 'running' && this.destination !== null && this.windupLeft <= 0 && this.dashing <= 0;
    if (running) this.rs.stride += real * this.stats.moveSpeed * 0.055;
    else this.rs.stride = Math.round(this.rs.stride / Math.PI) * Math.PI;
    this.rs.time = t;
    this.rs.inside = this.inside;

    draw(this, this.canvas, this.ctx, this.acc / STEP, this.rs);
    if (t - this.lastUI > 65) {
      this.notify(this.snapshot());
      this.lastUI = t;
    }
    this.schedule();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    if (this.timer) clearTimeout(this.timer);
    this.observer.disconnect();
    this.listeners.forEach(f => f());
    this.synth.close();
  }
}
