/** Tiny procedural sound bank built on the Web Audio API. */
export class Synth {
  ctx: AudioContext | null = null;
  enabled = true;

  wake() {
    if (!this.enabled) return;
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  tone(freq: number, duration: number, opts: { type?: OscillatorType; to?: number; gain?: number; delay?: number } = {}) {
    if (!this.enabled || !this.ctx) return;
    const { type = 'sine', to = freq * 0.5, gain = 0.04, delay = 0 } = opts;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + duration);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    o.connect(g);
    g.connect(this.ctx.destination);
    o.start(t0);
    o.stop(t0 + duration);
  }

  noise(duration: number, gain = 0.05, opts: { delay?: number; cutoff?: number } = {}) {
    if (!this.enabled || !this.ctx) return;
    const buffer = this.ctx.createBuffer(1, Math.ceil(this.ctx.sampleRate * duration), this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = this.ctx.createBufferSource(), g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
    src.buffer = buffer;
    f.type = 'lowpass';
    f.frequency.value = opts.cutoff ?? 1400;
    g.gain.value = gain;
    src.connect(f); f.connect(g); g.connect(this.ctx.destination);
    src.start(this.ctx.currentTime + (opts.delay ?? 0));
  }

  /** Per-weapon report. `n` is the running shot count so the pistols alternate hands. */
  shot(weapon = 'bow', n = 0) {
    switch (weapon) {
      case 'crossbow': this.tone(170, 0.14, { type: 'triangle', to: 55, gain: 0.07 }); this.noise(0.09, 0.05, { cutoff: 900 }); break;
      case 'garand': this.tone(950, 0.07, { type: 'square', to: 160, gain: 0.05 }); this.noise(0.11, 0.07, { cutoff: 2600 }); this.tone(320, 0.12, { type: 'triangle', to: 120, gain: 0.03, delay: 0.02 }); break;
      case 'pistols': this.tone(n % 2 ? 1350 : 1150, 0.05, { type: 'square', to: 260, gain: 0.035 }); this.noise(0.05, 0.04, { cutoff: 3200 }); break;
      case 'cannon': this.tone(420, 0.12, { type: 'triangle', to: 120, gain: 0.05 }); this.noise(0.1, 0.04); break;
      default: this.tone(850, 0.08);
    }
  }
  /** The Garand's en-bloc clip: a bright ringing ping. */
  ping() { this.tone(3350, 0.55, { to: 3250, gain: 0.045 }); this.tone(5200, 0.4, { to: 5050, gain: 0.02, delay: 0.004 }); this.noise(0.025, 0.03, { cutoff: 6000 }); }
  /** Pistol reload: two clicks of a slide racked. */
  rack() { this.noise(0.035, 0.05, { cutoff: 2400 }); this.tone(620, 0.035, { type: 'square', to: 480, gain: 0.025 }); this.noise(0.035, 0.05, { delay: 0.11, cutoff: 2400 }); this.tone(760, 0.04, { type: 'square', to: 600, gain: 0.025, delay: 0.11 }); }
  /** A clip seated or a crank fully wound. */
  loaded() { this.tone(1100, 0.05, { type: 'square', to: 1500, gain: 0.02 }); this.tone(1600, 0.06, { to: 1900, gain: 0.02, delay: 0.05 }); }
  hurt() { this.tone(150, 0.18, { type: 'square', gain: 0.05 }); this.noise(0.12, 0.04); }
  kill() { this.tone(520, 0.12, { type: 'triangle', to: 180, gain: 0.05 }); this.noise(0.08, 0.03); }
  pickup() { this.tone(1200, 0.07, { to: 1800, gain: 0.03 }); this.tone(1600, 0.09, { to: 2400, gain: 0.025, delay: 0.05 }); }
  dash() { this.tone(300, 0.14, { type: 'sawtooth', to: 900, gain: 0.03 }); }
  wave() { this.tone(440, 0.18, { to: 660, gain: 0.04 }); this.tone(660, 0.25, { to: 880, gain: 0.04, delay: 0.15 }); }
  upgrade() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.16, { to: f, gain: 0.035, delay: i * 0.07 })); }
  ready() { this.tone(880, 0.09, { to: 1320, gain: 0.02 }); }
  quest() { [659, 880, 1046, 1318].forEach((f, i) => this.tone(f, 0.2, { to: f * 1.01, gain: 0.04, delay: i * 0.09 })); }
  /** Metallic tink: a bolt bounced off a Bulwark shield. */
  block() { this.tone(1900, 0.06, { type: 'square', to: 1400, gain: 0.025 }); this.tone(2600, 0.05, { to: 2200, gain: 0.015, delay: 0.01 }); }
  /** Mid-wave event alarm: two clipped descending blasts. */
  event() { this.tone(740, 0.12, { type: 'square', to: 520, gain: 0.035 }); this.tone(620, 0.16, { type: 'square', to: 400, gain: 0.035, delay: 0.14 }); this.noise(0.08, 0.02); }
  /** Blade dash cut: a short whip. */
  cut() { this.tone(1400, 0.05, { type: 'sawtooth', to: 300, gain: 0.03 }); }
  /** Low two-note warning: a champion (affixed enemy) has arrived. */
  champion() { this.tone(196, 0.22, { type: 'triangle', to: 196, gain: 0.04 }); this.tone(261, 0.28, { type: 'triangle', to: 261, gain: 0.04, delay: 0.16 }); }
  /** Reaver swing: a low whoosh. */
  /** Coin on the counter: a paid intermission purchase landed. */
  buy() { this.tone(980, 0.05, { type: 'triangle', to: 1240, gain: 0.03 }); this.noise(0.02, 0.02, { cutoff: 5000 }); }
  swing() { this.tone(240, 0.16, { type: 'sawtooth', to: 90, gain: 0.035 }); this.noise(0.14, 0.035); }
  death() { this.tone(220, 0.8, { type: 'sawtooth', to: 40, gain: 0.06 }); this.noise(0.5, 0.06); }

  close() { void this.ctx?.close(); }
}
