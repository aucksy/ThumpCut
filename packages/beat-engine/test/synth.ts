/**
 * Synthesised test tracks with an exact, known beat grid — the port of
 * `factory/fixtures/make_fixtures.py`'s synthesis.
 *
 * Same instruments, same arrangement, same energy arc. The noise generator differs from
 * NumPy's (matching PCG64 bit-for-bit buys nothing here), so these tracks are for ground
 * truth — "the detector finds the grid the synthesiser laid down" — while the committed WAV
 * fixtures cover parity with the Python engine's exact published answers.
 */

const SAMPLE_RATE = 22050;

/** Deterministic uniform generator (mulberry32) feeding a Box–Muller normal. */
class Random {
  private state: number;
  private spare: number | null = null;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  uniform(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let mixed = this.state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  }

  normal(): number {
    if (this.spare !== null) {
      const value = this.spare;
      this.spare = null;
      return value;
    }
    let u = 0;
    let v = 0;
    while (u <= 1e-12) u = this.uniform();
    v = this.uniform();
    const radius = Math.sqrt(-2.0 * Math.log(u));
    this.spare = radius * Math.sin(2 * Math.PI * v);
    return radius * Math.cos(2 * Math.PI * v);
  }
}

function kick(length: number, rate: number): Float64Array {
  const output = new Float64Array(length);
  let phase = 0;
  for (let index = 0; index < length; index += 1) {
    const t = index / rate;
    const frequency = 120.0 * Math.exp(-t * 28.0) + 45.0;
    phase += frequency;
    output[index] = Math.sin((2 * Math.PI * phase) / rate) * Math.exp(-t * 22.0);
  }
  return output;
}

function snare(length: number, rate: number, random: Random): Float64Array {
  const output = new Float64Array(length);
  let previousIn = 0;
  let previousOut = 0;
  for (let index = 0; index < length; index += 1) {
    const t = index / rate;
    const noise = random.normal();
    previousOut = 0.86 * (previousOut + noise - previousIn);
    previousIn = noise;
    const body = Math.sin(2 * Math.PI * 190.0 * t) * 0.5;
    output[index] = (previousOut * 0.8 + body) * Math.exp(-t * 30.0);
  }
  return output;
}

function hat(length: number, rate: number, random: Random): Float64Array {
  const output = new Float64Array(length);
  for (let index = 0; index < length; index += 1) {
    output[index] = random.normal() * Math.exp(-(index / rate) * 150.0);
  }
  return output;
}

function bass(length: number, rate: number, midiNote: number): Float64Array {
  const output = new Float64Array(length);
  const frequency = 440.0 * 2 ** ((midiNote - 69) / 12.0);
  for (let index = 0; index < length; index += 1) {
    const t = index / rate;
    const sine = Math.sin(2 * Math.PI * frequency * t);
    const tone = Math.sign(sine) * 0.35 + sine * 0.65;
    output[index] = tone * Math.min(1.0, t * 260.0) * Math.exp(-t * 5.5);
  }
  return output;
}

function mixInto(track: Float64Array, sound: Float64Array, atSample: number, gain: number): void {
  const start = Math.max(0, atSample);
  const end = Math.min(track.length, start + sound.length);
  for (let index = start; index < end; index += 1) {
    track[index] = (track[index] as number) + (sound[index - start] as number) * gain;
  }
}

/** Intro → build → drop → outro, exactly the arc the Python fixtures use. */
function energyAt(barIndex: number, totalBars: number): number {
  const position = barIndex / Math.max(1, totalBars - 1);
  if (position < 0.25) return 0.22 + 0.28 * (position / 0.25);
  if (position < 0.6) return 0.5 + 0.3 * ((position - 0.25) / 0.35);
  if (position < 0.85) return 1.0;
  return 0.85 - 0.45 * ((position - 0.85) / 0.15);
}

export interface SynthesisedTrack {
  samples: Float32Array;
  sampleRate: number;
  /** The exact grid the instruments were placed on. */
  beatTimesSec: number[];
}

export function synthesise(bpm: number, bars: number, seed: number): SynthesisedTrack {
  const rate = SAMPLE_RATE;
  const random = new Random(seed);
  const beatsPerBar = 4;
  const beatSeconds = 60.0 / bpm;
  const totalBeats = bars * beatsPerBar;
  const totalSamples = Math.round((totalBeats * beatSeconds + 1.0) * rate);
  const track = new Float64Array(totalSamples);

  const kickSound = kick(Math.trunc(0.3 * rate), rate);
  const snareSound = snare(Math.trunc(0.22 * rate), rate, random);
  const hatSound = hat(Math.trunc(0.06 * rate), rate, random);
  const bassNotes = [40, 40, 43, 45];

  const beatTimesSec: number[] = [];

  for (let beatIndex = 0; beatIndex < totalBeats; beatIndex += 1) {
    const barIndex = Math.floor(beatIndex / beatsPerBar);
    const positionInBar = beatIndex % beatsPerBar;
    const beatTime = beatIndex * beatSeconds;
    beatTimesSec.push(Math.round(beatTime * 1e6) / 1e6);
    const at = Math.round(beatTime * rate);
    const level = energyAt(barIndex, bars);

    // Kick on 1 and 3 — the downbeat always carries the most low end.
    if (positionInBar === 0 || positionInBar === 2) {
      mixInto(track, kickSound, at, 0.95 * level * (positionInBar === 0 ? 1.15 : 0.8));
    }
    if (positionInBar === 1 || positionInBar === 3) {
      mixInto(track, snareSound, at, 0.55 * level);
    }

    // Hats on every eighth once the track has opened up.
    if (level > 0.45) {
      mixInto(track, hatSound, at, 0.22 * level);
      mixInto(track, hatSound, at + Math.round(beatSeconds * 0.5 * rate), 0.14 * level);
    }

    if (positionInBar === 0) {
      const note = bassNotes[barIndex % bassNotes.length] as number;
      mixInto(track, bass(Math.trunc(beatSeconds * 2.0 * rate), rate, note), at, 0.42 * level);
    }
  }

  let peak = 0;
  for (let index = 0; index < track.length; index += 1) {
    const magnitude = Math.abs(track[index] as number);
    if (magnitude > peak) peak = magnitude;
  }
  const samples = new Float32Array(totalSamples);
  const scale = peak > 0 ? 0.89 / peak : 1;
  for (let index = 0; index < track.length; index += 1) {
    samples[index] = (track[index] as number) * scale;
  }

  return { samples, sampleRate: rate, beatTimesSec };
}
