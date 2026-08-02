/**
 * Spectral-flux beat tracking — `factory/engines/spectral_dp.py`, ported to TypeScript.
 *
 * The Python engine is the reference implementation. This port exists so a phone can analyse
 * the user's own music without any server: same pipeline, same constants, same documented
 * quirks, held to the reference's published answers by a parity test over the committed
 * fixture WAV files.
 *
 * One structural difference, deliberate: the Python engine materialises the whole
 * spectrogram — offline, on a workstation, that is free. This port computes the two onset
 * envelopes frame by frame and keeps nothing else, because a four-minute song's spectrogram
 * is ~40MB and the target device has 2GB of memory in total. The numbers are identical; only
 * the storage differs.
 *
 * Deterministic: no randomness anywhere, so the same file always produces the same beat map.
 */

import { RealFft } from "./fft.ts";
import {
  clip,
  leastSquaresSlope,
  mean,
  median,
  movingAverage,
  pyRound,
  pyRoundTo,
} from "./math.ts";

export const ENGINE_NAME = "spectral_dp_ts";
export const ENGINE_VERSION = "1.0.0";

export const MIN_BPM = 50.0;
export const MAX_BPM = 200.0;
export const ANALYSIS_SAMPLE_RATE = 22050;

const FFT_SIZE = 1024;
const HOP_SIZE = 256;
const TEMPO_PRIOR_CENTRE_BPM = 120.0;
const TEMPO_PRIOR_WIDTH_OCTAVES = 1.0;
const DP_TIGHTNESS = 100.0;
const LOW_BAND_HZ = 220.0;
const LOCAL_MEAN_SECONDS = 1.0;
const OCTAVE_OFFBEAT_RATIO = 0.9;
const HALVING_LOW_BAND_RATIO = 0.45;
const BAND_COUNT = 40;
const BAND_LOW_HZ = 30.0;
const SILENT_BEAT_RATIO = 0.04;

export class BeatDetectionFailed extends Error {}

export interface BeatDetectionResult {
  beatsSec: number[];
  downbeatsSec: number[];
  bpm: number;
  beatsPerBar: number;
  /** The mel-flux onset envelope — the energy curve is built from it. */
  onsetEnvelope: Float64Array;
  onsetFrameRate: number;
}

/**
 * Called between processing chunks so a UI can show progress and breathe. Returning a
 * promise pauses the pipeline until it resolves.
 */
export type ProgressHook = (fraction: number) => void | Promise<void>;

// ---------------------------------------------------------------------------
// The spectral pass — one trip over the audio, producing both onset envelopes.
// ---------------------------------------------------------------------------

/** Band edges as FFT bin indices, spaced evenly on the mel scale. */
function melEdges(sampleRate: number, bandCount: number): Int32Array {
  const toMel = (hz: number) => 2595.0 * Math.log10(1.0 + hz / 700.0);
  const fromMel = (mel: number) => 700.0 * (10.0 ** (mel / 2595.0) - 1.0);

  const lowMel = toMel(BAND_LOW_HZ);
  const highMel = toMel(sampleRate / 2.0);
  const edges = new Int32Array(bandCount + 1);
  for (let index = 0; index <= bandCount; index += 1) {
    const mel = lowMel + ((highMel - lowMel) * index) / bandCount;
    const bin = Math.floor((fromMel(mel) * FFT_SIZE) / sampleRate);
    edges[index] = clip(bin, 0, FFT_SIZE / 2);
  }
  // Guarantee every band is at least one bin wide, so no band is silent by construction.
  for (let index = 1; index <= bandCount; index += 1) {
    if ((edges[index] as number) <= (edges[index - 1] as number)) {
      edges[index] = (edges[index - 1] as number) + 1;
    }
  }
  for (let index = 0; index <= bandCount; index += 1) {
    edges[index] = clip(edges[index] as number, 0, FFT_SIZE / 2);
  }
  return edges;
}

interface SpectralPass {
  /** Mel-flux envelope, local-mean subtracted and peak normalised. */
  envelope: Float64Array;
  /** Bass-band flux envelope, peak normalised — the kick drum's home. */
  lowBand: Float64Array;
  frameRate: number;
}

/**
 * Frames are *centred*: frame `k` is centred on sample `k * hop`, exactly as the Python
 * engine pads. With left-aligned frames the whole beat grid lands early by most of a window.
 */
async function spectralPass(
  samples: Float32Array | Float64Array,
  sampleRate: number,
  onProgress?: ProgressHook,
): Promise<SpectralPass> {
  const frameRate = sampleRate / HOP_SIZE;
  const half = FFT_SIZE / 2;
  const frameCount = 1 + Math.floor((samples.length + half) / HOP_SIZE);

  const window = new Float64Array(FFT_SIZE);
  for (let index = 0; index < FFT_SIZE; index += 1) {
    window[index] = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (FFT_SIZE - 1));
  }

  const fft = new RealFft(FFT_SIZE);
  const frame = new Float64Array(FFT_SIZE);
  const magnitude = new Float64Array(half + 1);
  const edges = melEdges(sampleRate, BAND_COUNT);

  const binHz = sampleRate / FFT_SIZE;
  const lowTopBin = Math.max(2, Math.trunc(LOW_BAND_HZ / binHz));

  const envelope = new Float64Array(frameCount);
  const lowBand = new Float64Array(frameCount);

  const previousBandLog = new Float64Array(BAND_COUNT);
  const previousLowLog = new Float64Array(lowTopBin);
  const bandLog = new Float64Array(BAND_COUNT);
  const lowLog = new Float64Array(lowTopBin);

  // Yield roughly every quarter second of wall time on a mid-range phone.
  const chunk = 512;

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    // Read the centred window: sample index k*hop - half + i, zero outside the signal.
    const start = frameIndex * HOP_SIZE - half;
    for (let index = 0; index < FFT_SIZE; index += 1) {
      const at = start + index;
      frame[index] =
        at >= 0 && at < samples.length ? (samples[at] as number) * (window[index] as number) : 0;
    }

    fft.magnitude(frame, magnitude);

    // Mel bands: summed over linear bins a hi-hat outweighs a kick; on a mel scale the two
    // are comparable, which is how a listener hears them.
    for (let band = 0; band < BAND_COUNT; band += 1) {
      const lo = edges[band] as number;
      const hi = edges[band + 1] as number;
      let total = 0;
      for (let bin = lo; bin < hi; bin += 1) total += magnitude[bin] as number;
      bandLog[band] = Math.log1p(total * 100.0);
    }
    for (let bin = 0; bin < lowTopBin; bin += 1) {
      lowLog[bin] = Math.log1p((magnitude[bin] as number) * 1000.0);
    }

    // Half-wave-rectified first difference of the log spectrum: loud transients spike,
    // sustained notes do not. The first frame has no predecessor, so its flux is zero —
    // exactly the leading 0 the Python engine concatenates.
    if (frameIndex === 0) {
      envelope[0] = 0;
      lowBand[0] = 0;
    } else {
      let flux = 0;
      for (let band = 0; band < BAND_COUNT; band += 1) {
        const difference = (bandLog[band] as number) - (previousBandLog[band] as number);
        if (difference > 0) flux += difference;
      }
      envelope[frameIndex] = flux;

      let lowFlux = 0;
      for (let bin = 0; bin < lowTopBin; bin += 1) {
        const difference = (lowLog[bin] as number) - (previousLowLog[bin] as number);
        if (difference > 0) lowFlux += difference;
      }
      lowBand[frameIndex] = lowFlux;
    }

    previousBandLog.set(bandLog);
    previousLowLog.set(lowLog);

    if (onProgress && frameIndex % chunk === chunk - 1) {
      await onProgress(frameIndex / frameCount);
    }
  }

  // Subtract a local mean so a loud section cannot swamp a quiet one. The window is defined
  // in seconds — at roughly one second it spans several beats at any tempo in range.
  const windowFrames = Math.max(3, pyRound(frameRate * LOCAL_MEAN_SECONDS));
  const localMean = movingAverage(envelope, windowFrames);
  let peak = 0;
  for (let index = 0; index < frameCount; index += 1) {
    const value = Math.max((envelope[index] as number) - (localMean[index] as number), 0);
    envelope[index] = value;
    if (value > peak) peak = value;
  }
  if (peak > 0) {
    for (let index = 0; index < frameCount; index += 1) {
      envelope[index] = (envelope[index] as number) / peak;
    }
  }

  let lowPeak = 0;
  for (let index = 0; index < frameCount; index += 1) {
    if ((lowBand[index] as number) > lowPeak) lowPeak = lowBand[index] as number;
  }
  if (lowPeak > 0) {
    for (let index = 0; index < frameCount; index += 1) {
      lowBand[index] = (lowBand[index] as number) / lowPeak;
    }
  }

  return { envelope, lowBand, frameRate };
}

// ---------------------------------------------------------------------------
// Tempo and beats
// ---------------------------------------------------------------------------

/** Autocorrelation tempo estimate, constrained to 50–200 BPM. */
function estimateTempo(envelope: Float64Array, frameRate: number): number {
  if (envelope.length < 8) {
    throw new BeatDetectionFailed("audio is too short to estimate a tempo");
  }

  const count = envelope.length;
  let envelopeMean = 0;
  for (let index = 0; index < count; index += 1) envelopeMean += envelope[index] as number;
  envelopeMean /= count;

  let zeroLag = 0;
  for (let index = 0; index < count; index += 1) {
    const centred = (envelope[index] as number) - envelopeMean;
    zeroLag += centred * centred;
  }
  if (zeroLag <= 0) {
    throw new BeatDetectionFailed("onset envelope carries no periodicity");
  }

  const minLag = Math.max(1, pyRound((frameRate * 60.0) / MAX_BPM));
  const maxLag = Math.min(count - 1, pyRound((frameRate * 60.0) / MIN_BPM));
  if (maxLag <= minLag) {
    throw new BeatDetectionFailed("audio is too short to estimate a tempo");
  }

  // Only the lags in range are ever read, so only they are computed — the reference takes
  // the same slice of a full autocorrelation. Identical numbers, a fraction of the work.
  const scored = new Float64Array(maxLag - minLag + 1);
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let correlation = 0;
    for (let index = 0; index + lag < count; index += 1) {
      correlation +=
        ((envelope[index] as number) - envelopeMean) *
        ((envelope[index + lag] as number) - envelopeMean);
    }
    const candidateBpm = (60.0 * frameRate) / lag;
    const deviation =
      Math.log2(candidateBpm / TEMPO_PRIOR_CENTRE_BPM) / TEMPO_PRIOR_WIDTH_OCTAVES;
    const prior = Math.exp(-0.5 * deviation * deviation);
    scored[lag - minLag] = (correlation / zeroLag) * prior;
  }

  let best = 0;
  for (let index = 1; index < scored.length; index += 1) {
    if ((scored[index] as number) > (scored[best] as number)) best = index;
  }
  let bestLag = best + minLag;

  // Parabolic interpolation on the scored peak for sub-frame tempo precision.
  let refined = bestLag;
  if (best > 0 && best < scored.length - 1) {
    const left = scored[best - 1] as number;
    const centre = scored[best] as number;
    const right = scored[best + 1] as number;
    const denominator = left - 2.0 * centre + right;
    if (Math.abs(denominator) > 1e-12) {
      refined = bestLag + (0.5 * (left - right)) / denominator;
    }
  }

  const bpm = (60.0 * frameRate) / refined;
  return clip(bpm, MIN_BPM, MAX_BPM);
}

/** Ellis dynamic-programming beat tracker. Returns beat frame indices. */
function trackBeats(envelope: Float64Array, periodFrames: number): number[] {
  const frameCount = envelope.length;
  if (frameCount < 4 || periodFrames < 2.0) {
    throw new BeatDetectionFailed("not enough frames to track beats");
  }

  const lower = Math.max(1, pyRound(periodFrames * 0.5));
  const upper = Math.max(lower + 1, pyRound(periodFrames * 2.0));
  const offsets = upper - lower + 1;
  // Penalty grows with the square of the log deviation from the expected period.
  const transitionCost = new Float64Array(offsets);
  for (let index = 0; index < offsets; index += 1) {
    const deviation = Math.log((lower + index) / periodFrames);
    transitionCost[index] = -DP_TIGHTNESS * deviation * deviation;
  }

  const score = new Float64Array(frameCount);
  const backlink = new Int32Array(frameCount).fill(-1);

  for (let frame = 0; frame < frameCount; frame += 1) {
    const end = frame - lower;
    if (end < 0) {
      score[frame] = envelope[frame] as number;
      continue;
    }
    const windowStart = Math.max(0, frame - upper);
    // Candidate previous beat at index `windowStart + i` sits `frame - (windowStart + i)`
    // frames back, so its cost entry is `frame - windowStart - i - lower` — the reversed
    // slice the reference takes.
    let bestValue = -Infinity;
    let bestIndex = windowStart;
    for (let candidate = windowStart; candidate <= end; candidate += 1) {
      const costIndex = frame - candidate - lower;
      const combined = (score[candidate] as number) + (transitionCost[costIndex] as number);
      if (combined > bestValue) {
        bestValue = combined;
        bestIndex = candidate;
      }
    }
    score[frame] = (envelope[frame] as number) + bestValue;
    backlink[frame] = bestIndex;
  }

  // Start the backtrace from a strong late peak rather than the very last frame.
  const tailStart = Math.max(0, frameCount - pyRound(periodFrames * 2.0) - 1);
  let bestEnd = tailStart;
  for (let frame = tailStart + 1; frame < frameCount; frame += 1) {
    if ((score[frame] as number) > (score[bestEnd] as number)) bestEnd = frame;
  }

  const beats: number[] = [];
  let cursor = bestEnd;
  let guard = 0;
  while (cursor >= 0 && guard <= frameCount) {
    beats.push(cursor);
    cursor = backlink[cursor] as number;
    guard += 1;
  }
  beats.reverse();

  if (beats.length < 2) {
    throw new BeatDetectionFailed("beat tracking produced fewer than two beats");
  }
  return beats;
}

/** Parabolic interpolation around a frame, so beats are not stuck on the 11.6ms grid. */
function refineFrame(envelope: Float64Array, frame: number): number {
  if (frame <= 0 || frame >= envelope.length - 1) return frame;
  const left = envelope[frame - 1] as number;
  const centre = envelope[frame] as number;
  const right = envelope[frame + 1] as number;
  const denominator = left - 2.0 * centre + right;
  if (Math.abs(denominator) < 1e-12) return frame;
  const shift = (0.5 * (left - right)) / denominator;
  return frame + clip(shift, -0.5, 0.5);
}

/** Peak onset strength in a window around each beat. */
function beatOnsetStrengths(
  beatsSec: readonly number[],
  envelope: Float64Array,
  frameRate: number,
  halfWindowSec: number,
): number[] {
  const strengths = new Array<number>(beatsSec.length);
  for (let index = 0; index < beatsSec.length; index += 1) {
    const beat = beatsSec[index] as number;
    let lo = pyRound((beat - halfWindowSec) * frameRate);
    let hi = pyRound((beat + halfWindowSec) * frameRate);
    lo = Math.max(0, Math.min(lo, envelope.length - 1));
    hi = Math.max(lo + 1, Math.min(hi, envelope.length));
    let peak = -Infinity;
    for (let at = lo; at < hi; at += 1) {
      if ((envelope[at] as number) > peak) peak = envelope[at] as number;
    }
    strengths[index] = peak;
  }
  return strengths;
}

/**
 * Drop beats at the very start or end that sit over silence. A tracker happily extends the
 * grid into a track's lead-in and fade-out; those beats are useless to a reel.
 */
function trimSilentEnds(
  beatsSec: number[],
  envelope: Float64Array,
  frameRate: number,
): number[] {
  if (beatsSec.length < 4) return beatsSec;

  const intervals: number[] = [];
  for (let index = 1; index < beatsSec.length; index += 1) {
    intervals.push((beatsSec[index] as number) - (beatsSec[index - 1] as number));
  }
  const halfWindow = intervals.length > 0 ? median(intervals) * 0.5 : 0.25;
  const strengths = beatOnsetStrengths(beatsSec, envelope, frameRate, halfWindow);

  const reference = median(strengths);
  if (reference <= 0) return beatsSec;
  const floor = reference * SILENT_BEAT_RATIO;

  let first = 0;
  while (first < beatsSec.length - 3 && (strengths[first] as number) < floor) first += 1;
  let last = beatsSec.length - 1;
  while (last > first + 2 && (strengths[last] as number) < floor) last -= 1;

  return beatsSec.slice(first, last + 1);
}

/**
 * Decide whether every other "beat" is really just a hi-hat. The test uses the bass band
 * only: a kick or a snare both put energy under 220Hz, a hi-hat puts almost none there.
 */
function resolveTempoHalving(
  lowBand: Float64Array,
  frameRate: number,
  bpm: number,
  beatFrames: number[],
): { bpm: number; frames: number[] | null } {
  const halved = bpm / 2.0;
  if (halved < MIN_BPM || beatFrames.length < 8) return { bpm, frames: null };

  const period = (60.0 * frameRate) / bpm;
  const halfWindow = Math.max(1, pyRound(period * 0.25));
  const strengths: number[] = [];
  for (const frame of beatFrames) {
    let peak = 0;
    if (lowBand.length > 0) {
      const lo = Math.max(0, frame - halfWindow);
      const hi = Math.min(lowBand.length, frame + halfWindow + 1);
      peak = -Infinity;
      for (let at = lo; at < hi; at += 1) {
        if ((lowBand[at] as number) > peak) peak = lowBand[at] as number;
      }
      if (!Number.isFinite(peak)) peak = 0;
    }
    strengths.push(peak);
  }
  if (strengths.length < 8) return { bpm, frames: null };

  const even: number[] = [];
  const odd: number[] = [];
  for (let index = 0; index < strengths.length; index += 1) {
    (index % 2 === 0 ? even : odd).push(strengths[index] as number);
  }
  const evenMean = mean(even);
  const oddMean = mean(odd);
  const stronger = Math.max(evenMean, oddMean);
  if (stronger <= 0) return { bpm, frames: null };
  if (Math.min(evenMean, oddMean) / stronger >= HALVING_LOW_BAND_RATIO) {
    return { bpm, frames: null };
  }

  const keepParity = evenMean >= oddMean ? 0 : 1;
  const kept: number[] = [];
  for (let index = keepParity; index < beatFrames.length; index += 2) {
    kept.push(beatFrames[index] as number);
  }
  return { bpm: halved, frames: kept };
}

/**
 * Decide whether the real pulse is twice the tempo the autocorrelation reported — the
 * classic half-tempo error. Track at the doubled tempo; if the added beats carry onset
 * energy comparable to the original ones, they are real beats.
 */
function resolveTempoOctave(
  envelope: Float64Array,
  frameRate: number,
  bpm: number,
  baseFrames: number[],
): { bpm: number; frames: number[] | null } {
  const doubled = bpm * 2.0;
  if (doubled > MAX_BPM || baseFrames.length === 0) return { bpm, frames: null };

  const period = (60.0 * frameRate) / doubled;
  let frames: number[];
  try {
    frames = trackBeats(envelope, period);
  } catch (error) {
    if (error instanceof BeatDetectionFailed) return { bpm, frames: null };
    throw error;
  }
  if (frames.length < 4) return { bpm, frames: null };

  const halfWindow = Math.max(1, pyRound(period * 0.25));
  const tolerance = period * 0.5;

  const aligned: number[] = [];
  const added: number[] = [];
  for (const frame of frames) {
    const lo = Math.max(0, frame - halfWindow);
    const hi = Math.min(envelope.length, frame + halfWindow + 1);
    if (hi <= lo) continue;
    let strength = -Infinity;
    for (let at = lo; at < hi; at += 1) {
      if ((envelope[at] as number) > strength) strength = envelope[at] as number;
    }
    let nearest = Infinity;
    for (const base of baseFrames) {
      const distance = Math.abs(base - frame);
      if (distance < nearest) nearest = distance;
    }
    (nearest <= tolerance ? aligned : added).push(strength);
  }

  if (aligned.length === 0 || added.length === 0) return { bpm, frames: null };
  const alignedMean = mean(aligned);
  if (alignedMean <= 0) return { bpm, frames: null };

  if (mean(added) / alignedMean >= OCTAVE_OFFBEAT_RATIO) {
    return { bpm: doubled, frames };
  }
  return { bpm, frames: null };
}

/**
 * Least-squares tempo across the whole beat sequence. The median interval is quantised to
 * the analysis grid and lands a whole BPM out on a steady track; fitting a line through
 * (beat number, beat time) averages that error away.
 */
function tempoFromBeats(beatsSec: readonly number[]): number {
  if (beatsSec.length < 2) return 0;
  const slope = leastSquaresSlope(beatsSec);
  if (slope <= 1e-6) return 0;
  return 60.0 / slope;
}

/** Pick the bar phase whose beats carry the most bass energy. */
function chooseDownbeatPhase(
  beatFrames: readonly number[],
  lowBand: Float64Array,
  beatsPerBar: number,
): number {
  if (beatsPerBar <= 1 || beatFrames.length === 0) return 0;
  let bestPhase = 0;
  let bestScore = -Infinity;
  for (let phase = 0; phase < beatsPerBar; phase += 1) {
    const values: number[] = [];
    for (let index = phase; index < beatFrames.length; index += beatsPerBar) {
      const frame = beatFrames[index] as number;
      if (frame >= 0 && frame < lowBand.length) values.push(lowBand[frame] as number);
    }
    if (values.length === 0) continue;
    const score = mean(values);
    // Ties resolve to the earliest phase, keeping the result deterministic.
    if (score > bestScore + 1e-12) {
      bestScore = score;
      bestPhase = phase;
    }
  }
  return bestPhase;
}

// ---------------------------------------------------------------------------
// The engine
// ---------------------------------------------------------------------------

/**
 * Detect beats in mono samples already at {@link ANALYSIS_SAMPLE_RATE}.
 *
 * `onProgress` is called through the spectral pass — the only part that takes real time —
 * and may return a promise to pause the pipeline, which is how the app keeps its UI alive.
 */
export async function detectBeats(
  samples: Float32Array | Float64Array,
  sampleRate: number,
  onProgress?: ProgressHook,
): Promise<BeatDetectionResult> {
  if (samples.length === 0) throw new BeatDetectionFailed("audio decoded to zero samples");

  let peak = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const magnitude = Math.abs(samples[index] as number);
    if (magnitude > peak) peak = magnitude;
  }
  if (peak < 1e-4) throw new BeatDetectionFailed("audio decodes to silence");

  const { envelope, lowBand, frameRate } = await spectralPass(samples, sampleRate, onProgress);

  let bpm = estimateTempo(envelope, frameRate);
  let beatFrames = trackBeats(envelope, (60.0 * frameRate) / bpm);

  // Resolve the octave. Halving is checked first because its evidence — bass energy on
  // alternating beats — is the stronger signal of the two.
  const halving = resolveTempoHalving(lowBand, frameRate, bpm, beatFrames);
  bpm = halving.bpm;
  if (halving.frames !== null) {
    beatFrames = halving.frames;
  } else {
    const octave = resolveTempoOctave(envelope, frameRate, bpm, beatFrames);
    bpm = octave.bpm;
    if (octave.frames !== null) beatFrames = octave.frames;
  }

  let beatsSec = beatFrames.map((frame) => pyRoundTo(refineFrame(envelope, frame) / frameRate, 6));

  // Strictly increasing, always. Refinement can in principle collide two beats.
  const deduped: number[] = [];
  for (const value of beatsSec) {
    if (deduped.length === 0 || value > (deduped[deduped.length - 1] as number) + 1e-4) {
      deduped.push(value);
    }
  }
  beatsSec = deduped;
  if (beatsSec.length < 2) {
    throw new BeatDetectionFailed("fewer than two distinct beats after refinement");
  }

  beatsSec = trimSilentEnds(beatsSec, envelope, frameRate);
  if (beatsSec.length < 2) {
    throw new BeatDetectionFailed("fewer than two beats carry any onset energy");
  }

  // The downbeat phase is chosen against the beats we kept, so trimming cannot shift it.
  const keptFrames = beatsSec.map((value) => pyRound(value * frameRate));
  const beatsPerBar = 4;
  const phase = chooseDownbeatPhase(keptFrames, lowBand, beatsPerBar);
  const downbeatsSec: number[] = [];
  for (let index = phase; index < beatsSec.length; index += beatsPerBar) {
    downbeatsSec.push(beatsSec[index] as number);
  }

  // Report the tempo the tracker actually produced, not the autocorrelation guess.
  const measured = tempoFromBeats(beatsSec);
  const finalBpm = pyRoundTo(clip(measured > 0 ? measured : bpm, MIN_BPM, MAX_BPM), 2);

  return {
    beatsSec,
    downbeatsSec,
    bpm: finalBpm,
    beatsPerBar,
    onsetEnvelope: envelope,
    onsetFrameRate: frameRate,
  };
}
