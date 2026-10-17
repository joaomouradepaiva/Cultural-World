// Áudio procedimental com WebAudio: efeitos, ambiente do público e música ao vivo gerada em tempo real.
// Não usa ficheiros externos (sem problemas de licenças).

import type { SoundName } from '../sim/core';

const MUTE_KEY = 'cultureworld.muted';

export interface AmbientInput {
  crowd: number; // 0..1 intensidade de conversas
  show: { kind: 'music' | 'theater' | 'comedy' | 'dance'; volume: number; tempo: number; seed: number } | null;
  rehearsal: number; // 0..1
  bar: number; // 0..1
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private crowdGain!: GainNode;
  private noise!: AudioBuffer;
  private nextNote = 0;
  private step = 0;
  private lastLaugh = 0;
  muted = false;

  constructor() {
    try { this.muted = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* sem storage */ }
  }

  /** Tem de ser chamado num gesto do utilizador. */
  unlock(): void {
    if (this.ctx) { void this.ctx.resume(); return; }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.7;
    this.master.connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.6;
    this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0;
    this.musicBus.connect(this.master);
    // ruído base
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // murmúrio do público: ruído filtrado com modulação lenta
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 520;
    bp.Q.value = 0.8;
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 3.1;
    lfoGain.gain.value = 180;
    lfo.connect(lfoGain).connect(bp.frequency);
    this.crowdGain = ctx.createGain();
    this.crowdGain.gain.value = 0;
    src.connect(bp).connect(this.crowdGain).connect(this.master);
    src.start();
    lfo.start();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    try { localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0'); } catch { /* ignore */ }
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.7, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  play(name: SoundName): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const t = ctx.currentTime;
    switch (name) {
      case 'coin': this.blip(988, t, 0.06, 'square', 0.12); this.blip(1319, t + 0.06, 0.12, 'square', 0.1); break;
      case 'ticket': this.blip(660, t, 0.05, 'triangle', 0.15); this.blip(880, t + 0.05, 0.08, 'triangle', 0.12); break;
      case 'drink': this.blip(523, t, 0.05, 'sine', 0.15); this.blip(784, t + 0.04, 0.09, 'sine', 0.12); break;
      case 'notify': this.blip(784, t, 0.1, 'sine', 0.2); this.blip(1047, t + 0.1, 0.18, 'sine', 0.18); break;
      case 'mission': [523, 659, 784, 1047].forEach((f, i) => this.blip(f, t + i * 0.08, 0.14, 'triangle', 0.18)); break;
      case 'levelup': [392, 523, 659, 784, 1047].forEach((f, i) => this.blip(f, t + i * 0.09, 0.22, 'square', 0.1)); break;
      case 'error': this.blip(220, t, 0.15, 'sawtooth', 0.12); this.blip(180, t + 0.12, 0.2, 'sawtooth', 0.1); break;
      case 'click': this.blip(1200, t, 0.03, 'sine', 0.1); break;
      case 'build': for (let i = 0; i < 4; i++) this.thud(t + i * 0.16); break;
      case 'applause': this.applause(t, 3.2, 0.5); break;
      case 'cheer': this.applause(t, 1.6, 0.35); this.blip(523, t, 0.3, 'triangle', 0.1); break;
    }
  }

  private blip(freq: number, t: number, dur: number, type: OscillatorType, vol: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noiseBurst(t: number, dur: number, vol: number, freq: number, q: number, bus: AudioNode): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(bus);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  private thud(t: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(50, t + 0.12);
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    o.connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + 0.2);
    this.noiseBurst(t, 0.05, 0.2, 2500, 1, this.sfxBus);
  }

  private applause(t: number, dur: number, vol: number): void {
    // muitas palmas curtas sobrepostas
    const n = Math.round(dur * 70);
    for (let i = 0; i < n; i++) {
      const tt = t + Math.random() * dur;
      const fade = 1 - (tt - t) / dur;
      this.noiseBurst(tt, 0.03, vol * 0.25 * (0.4 + fade), 1200 + Math.random() * 1800, 1.2, this.sfxBus);
    }
  }

  /** Atualiza o ambiente sonoro em função do que a câmara está a ver. */
  ambient(inp: AmbientInput): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    this.crowdGain.gain.setTargetAtTime(this.muted ? 0 : Math.min(0.18, inp.crowd * 0.18 + inp.bar * 0.05), now, 0.4);
    const show = inp.show;
    const musicVol = show && (show.kind === 'music' || show.kind === 'dance') ? show.volume : show ? show.volume * 0.3 : inp.rehearsal * 0.25;
    this.musicBus.gain.setTargetAtTime(this.muted ? 0 : musicVol * 0.5, now, 0.3);
    if (show?.kind === 'comedy' && now - this.lastLaugh > 3 + Math.random() * 4) {
      this.lastLaugh = now;
      this.applause(now, 1.2, 0.25 * show.volume);
    }
    if (musicVol <= 0.01) { this.nextNote = 0; return; }
    const tempo = show?.tempo ?? 100;
    const sixteenth = 60 / tempo / 4;
    if (this.nextNote < now) this.nextNote = now + 0.05;
    while (this.nextNote < now + 0.2) {
      this.scheduleStep(this.step, this.nextNote, show?.kind ?? 'music', show?.seed ?? 1);
      this.nextNote += sixteenth;
      this.step = (this.step + 1) % 64;
    }
  }

  private scheduleStep(step: number, t: number, kind: string, seed: number): void {
    const ctx = this.ctx!;
    const prog = [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]];
    const root = 45 + (seed % 5);
    const chord = prog[Math.floor(step / 16) % 4];
    const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
    const beat = step % 16;
    if (kind === 'music' || kind === 'dance') {
      if (beat % 4 === 0) this.kick(t);
      if (beat === 4 || beat === 12) this.noiseBurst(t, 0.12, 0.25, 1800, 0.7, this.musicBus);
      if (beat % 2 === 0) this.noiseBurst(t, 0.03, 0.08, 8000, 1, this.musicBus);
      if (beat % 4 === 0 || beat === 6 || beat === 14) this.tone(midi(root + chord[0] - 12), t, 0.18, 'sawtooth', 0.12, 600);
      if (beat === 0 || beat === 8) chord.forEach((c) => this.tone(midi(root + 12 + c), t, 0.5, 'triangle', 0.035, 2000));
      if ((beat === 2 || beat === 10 || beat === 7) && (seed + step) % 3 !== 0) this.tone(midi(root + 24 + chord[(step + seed) % 3]), t, 0.15, 'square', 0.025, 3000);
    } else if (beat === 0) {
      chord.forEach((c) => this.tone(midi(root + 12 + c), t, 1.6, 'sine', 0.04, 1200));
    }
    void ctx;
  }

  private kick(t: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.1);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g).connect(this.musicBus);
    o.start(t);
    o.stop(t + 0.2);
  }

  private tone(freq: number, t: number, dur: number, type: OscillatorType, vol: number, cutoff: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(this.musicBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
}
