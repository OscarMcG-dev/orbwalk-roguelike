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

  noise(duration: number, gain = 0.05) {
    if (!this.enabled || !this.ctx) return;
    const buffer = this.ctx.createBuffer(1, Math.ceil(this.ctx.sampleRate * duration), this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = this.ctx.createBufferSource(), g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
    src.buffer = buffer;
    f.type = 'lowpass';
    f.frequency.value = 1400;
    g.gain.value = gain;
    src.connect(f); f.connect(g); g.connect(this.ctx.destination);
    src.start();
  }

  shot() { this.tone(850, 0.08); }
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
  swing() { this.tone(240, 0.16, { type: 'sawtooth', to: 90, gain: 0.035 }); this.noise(0.14, 0.035); }
  death() { this.tone(220, 0.8, { type: 'sawtooth', to: 40, gain: 0.06 }); this.noise(0.5, 0.06); }

  close() { void this.ctx?.close(); }
}
