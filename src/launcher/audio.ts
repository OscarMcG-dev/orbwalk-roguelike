/**
 * Launcher UI sound: short synthesised blips over a quiet pad, all generated with Web Audio (no files).
 * Nothing can play before the first user gesture, and nothing is created until then either. The choice persists in
 * localStorage; the default is sound on after that first gesture.
 */

const PREF_KEY = '1v5-launcher-sound';
const PENTA = [0, 2, 4, 7, 9, 12, 14];

export class Blips {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private wet: GainNode | null = null;
  private pad: GainNode | null = null;
  private unlocked = false;
  enabled: boolean;

  constructor() {
    let pref: string | null = null;
    try { pref = localStorage.getItem(PREF_KEY); } catch { /* storage blocked */ }
    this.enabled = pref !== 'off';
  }

  /** Call from a user gesture. Creates the graph on first use. */
  unlock() {
    if (this.unlocked && this.ctx) { if (this.enabled) void this.ctx.resume(); return; }
    this.unlocked = true;
    if (!this.enabled) return;
    this.build();
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    try { localStorage.setItem(PREF_KEY, on ? 'on' : 'off'); } catch { /* storage blocked */ }
    if (on) {
      if (!this.ctx) this.build(); else void this.ctx.resume();
      this.fadePad(1);
    } else if (this.ctx) {
      this.fadePad(0);
      const ctx = this.ctx;
      setTimeout(() => { if (!this.enabled) void ctx.suspend(); }, 400);
    }
  }

  /** Pause everything while the tab is hidden. */
  setVisible(visible: boolean) {
    if (!this.ctx) return;
    if (visible && this.enabled) void this.ctx.resume(); else void this.ctx.suspend();
  }

  private build() {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = 0.55;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    master.connect(comp).connect(ctx.destination);
    this.master = master;

    // A short generated room: decaying stereo noise. Gives the glassy blips their Aero shimmer.
    const len = Math.floor(ctx.sampleRate * 1.6);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    const verb = ctx.createConvolver();
    verb.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.5;
    wet.connect(verb).connect(master);
    this.wet = wet;

    // Pad: two detuned saws through a slowly breathing low-pass. Very quiet.
    const pad = ctx.createGain();
    pad.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    lp.Q.value = 0.7;
    const lfo = ctx.createOscillator();
    const lfoAmt = ctx.createGain();
    lfo.frequency.value = 0.07;
    lfoAmt.gain.value = 180;
    lfo.connect(lfoAmt).connect(lp.frequency);
    lfo.start();
    for (const [f, det] of [[110, -6], [164.81, 5], [220, 3]] as const) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = det;
      o.connect(lp);
      o.start();
    }
    lp.connect(pad);
    pad.connect(master);
    const send = ctx.createGain();
    send.gain.value = 0.6;
    pad.connect(send).connect(wet);
    this.pad = pad;
    this.fadePad(1);
  }

  private fadePad(to: number) {
    if (!this.ctx || !this.pad) return;
    const t = this.ctx.currentTime;
    this.pad.gain.cancelScheduledValues(t);
    this.pad.gain.setValueAtTime(this.pad.gain.value, t);
    this.pad.gain.linearRampToValueAtTime(to * 0.022, t + (to ? 3 : 0.3));
  }

  private live(): AudioContext | null {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return null;
    return this.ctx;
  }

  private tone(freq: number, at: number, dur: number, type: OscillatorType, vol: number, wet = 0.35, glideTo?: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, at + dur);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g);
    g.connect(this.master!);
    if (wet > 0) {
      const s = ctx.createGain();
      s.gain.value = wet;
      g.connect(s).connect(this.wet!);
    }
    o.start(at);
    o.stop(at + dur + 0.05);
  }

  private noise(at: number, dur: number, vol: number, fromHz: number, toHz: number, q = 4) {
    const ctx = this.ctx!;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = q;
    bp.frequency.setValueAtTime(fromHz, at);
    bp.frequency.exponentialRampToValueAtTime(toHz, at + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(bp).connect(g).connect(this.master!);
    const s = ctx.createGain();
    s.gain.value = 0.5;
    g.connect(s).connect(this.wet!);
    src.start(at);
  }

  /** Cursor moved onto shelf slot `i`. */
  move(i: number) {
    const ctx = this.live();
    if (!ctx) return;
    const t = ctx.currentTime;
    const f = 740 * Math.pow(2, PENTA[i % PENTA.length] / 12);
    this.tone(f, t, 0.16, 'sine', 0.16);
    this.tone(f * 2, t, 0.07, 'triangle', 0.05, 0.5);
    this.noise(t, 0.03, 0.05, 6000, 9000, 1.2);
  }

  /** Launch: a rising arpeggio over a disc spin-up whoosh. */
  confirm() {
    const ctx = this.live();
    if (!ctx) return;
    const t = ctx.currentTime;
    [0, 7, 12, 19, 24].forEach((st, k) => {
      const f = 523.25 * Math.pow(2, st / 12);
      this.tone(f, t + k * 0.055, 0.5, 'sine', 0.14, 0.6);
      this.tone(f * 1.002, t + k * 0.055, 0.28, 'triangle', 0.04, 0.6);
    });
    this.noise(t, 0.6, 0.12, 300, 5200, 3);
  }

  /** A locked workshop tile. */
  locked() {
    const ctx = this.live();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(233, t, 0.12, 'square', 0.05, 0.15);
    this.tone(196, t + 0.09, 0.2, 'square', 0.05, 0.2);
  }

  /** Sound toggled on. */
  chime() {
    const ctx = this.live();
    if (!ctx) return;
    const t = ctx.currentTime;
    [392, 587.33, 783.99, 1174.66].forEach((f, k) => this.tone(f, t + k * 0.03, 1.2, 'sine', 0.07, 0.8));
  }
}
