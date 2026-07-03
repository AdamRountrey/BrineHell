type MusicMode = 'menu' | 'game' | 'boss' | 'ending';

const NOTE = 2 ** (1 / 12);

function midiToHz(note: number): number {
  return 440 * NOTE ** (note - 69);
}

class ReggaeMidi {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private timer: number | null = null;
  private nextStepTime = 0;
  private step = 0;
  private mode: MusicMode = 'menu';
  private muted = false;

  start(mode: MusicMode): void {
    this.mode = mode;
    if (this.muted) return;
    this.ensureContext();
    void this.context?.resume();
    if (this.timer === null) {
      this.nextStepTime = this.context?.currentTime ?? 0;
      this.timer = window.setInterval(() => this.scheduler(), 25);
    }
  }

  setMode(mode: MusicMode): void {
    this.mode = mode;
    if (this.context && this.timer === null && !this.muted) this.start(mode);
  }

  stop(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  dispose(): void {
    this.stop();
    void this.context?.close();
    this.context = null;
    this.master = null;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.42, this.context?.currentTime ?? 0, 0.02);
    return this.muted;
  }

  private ensureContext(): void {
    if (this.context) return;
    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.master.gain.value = 0.42;
    this.master.connect(this.context.destination);
  }

  private scheduler(): void {
    if (!this.context) return;
    const secondsPerStep = (60 / this.tempo()) / 4;
    while (this.nextStepTime < this.context.currentTime + 0.16) {
      this.playStep(this.step, this.nextStepTime);
      this.nextStepTime += secondsPerStep * (this.step % 2 === 0 ? 1.08 : 0.92);
      this.step = (this.step + 1) % 64;
    }
  }

  private tempo(): number {
    if (this.mode === 'boss') return 96;
    if (this.mode === 'ending') return 78;
    return 86;
  }

  private playStep(step: number, at: number): void {
    const step16 = step % 16;
    const bar = Math.floor(step / 16) % 4;
    const roots = this.mode === 'ending' ? [62, 67, 69, 65] : [62, 57, 60, 55];
    const root = roots[bar];
    const minor = [root, root + 3, root + 7, root + 10];
    const major = [root, root + 4, root + 7, root + 12];
    const chord = this.mode === 'ending' || bar === 2 ? major : minor;
    const shantyMelody = [
      74, null, 74, null, 74, 72, 69, null, 69, null, 72, null, 74, null, 69, null,
      67, null, 67, null, 67, 65, 62, null, 64, null, 65, null, 67, null, null, null,
      69, null, 69, 72, 74, null, 72, null, 69, null, 67, null, 65, null, 62, null,
      62, null, 65, null, 67, null, 69, null, 67, null, 65, null, 62, null, null, null
    ] as Array<number | null>;

    if (step16 === 0 || step16 === 8) this.kick(at);
    if (step16 === 4 || step16 === 12) this.snare(at);
    if (step16 % 2 === 1) this.hat(at);
    if (step16 === 0) this.bass(root - 24, at, 0.34);
    if (step16 === 5 || step16 === 11 || (bar % 2 === 1 && step16 === 14)) this.bass(root - 12, at, 0.16);
    if ([2, 6, 10, 14].includes(step16)) this.chord(chord, at);

    const melody = shantyMelody[step];
    if (melody !== null && (this.mode !== 'menu' || step16 % 4 !== 0)) {
      this.bubbleLead(melody + (this.mode === 'boss' ? 12 : 0), at, this.mode === 'ending' ? 0.42 : 0.2);
    }
    if (this.mode === 'boss' && [3, 7, 11, 15].includes(step16)) this.bubbleLead(root + 24 + ((step + bar) % 5), at, 0.11);
  }

  private chord(notes: number[], at: number): void {
    for (const note of notes) this.tone(note, at, 0.105, 'triangle', 0.05, 0.012, 0.04);
  }

  private bass(note: number, at: number, length: number): void {
    this.tone(note, at, length, 'sine', 0.18, 0.006, 0.08);
  }

  private bubbleLead(note: number, at: number, length = 0.18): void {
    this.tone(note, at, length, 'square', 0.035, 0.004, 0.08, 950);
  }

  private tone(
    note: number,
    at: number,
    length: number,
    type: OscillatorType,
    gain: number,
    attack: number,
    release: number,
    filterFreq = 1400
  ): void {
    if (!this.context || !this.master) return;
    const osc = this.context.createOscillator();
    const gainNode = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    osc.type = type;
    osc.frequency.value = midiToHz(note);
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    gainNode.gain.setValueAtTime(0, at);
    gainNode.gain.linearRampToValueAtTime(gain, at + attack);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, at + length + release);
    osc.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.master);
    osc.start(at);
    osc.stop(at + length + release + 0.04);
  }

  private kick(at: number): void {
    if (!this.context || !this.master) return;
    const osc = this.context.createOscillator();
    const gainNode = this.context.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, at);
    osc.frequency.exponentialRampToValueAtTime(45, at + 0.12);
    gainNode.gain.setValueAtTime(0.3, at);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
    osc.connect(gainNode);
    gainNode.connect(this.master);
    osc.start(at);
    osc.stop(at + 0.18);
  }

  private snare(at: number): void {
    this.noise(at, 0.12, 0.13, 1700);
  }

  private hat(at: number): void {
    this.noise(at, 0.035, 0.035, 6800);
  }

  private noise(at: number, length: number, gain: number, filterFreq: number): void {
    if (!this.context || !this.master) return;
    const bufferSize = Math.max(1, Math.floor(this.context.sampleRate * length));
    const buffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i += 1) data[i] = Math.random() * 2 - 1;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gainNode = this.context.createGain();
    source.buffer = buffer;
    filter.type = 'highpass';
    filter.frequency.value = filterFreq;
    gainNode.gain.setValueAtTime(gain, at);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, at + length);
    source.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.master);
    source.start(at);
    source.stop(at + length);
  }
}

export const reggaeMidi = new ReggaeMidi();
