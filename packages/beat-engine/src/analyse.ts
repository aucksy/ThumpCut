/**
 * Turning detected beats into a full beat map — `factory/analyse.py`, ported.
 *
 * The engine supplies beats, downbeats and a tempo. This adds what the cut engine needs on
 * top: the per-beat energy curve, the section boundaries, the best window to start a reel
 * in, and the provenance fields, hashed exactly as the schema demands.
 *
 * Everything here is deterministic. The same audio always produces the same beat map.
 */

import type { BeatMap, Section, SectionLevel } from "@thumpcut/cut-engine";
import {
  ANALYSIS_SAMPLE_RATE,
  BeatDetectionFailed,
  ENGINE_NAME,
  ENGINE_VERSION,
  MAX_BPM,
  MIN_BPM,
  detectBeats,
  type ProgressHook,
} from "./engine.ts";
import {
  clip,
  mean,
  median,
  medianFilter,
  movingAverage,
  percentile,
  pyRound,
  pyRoundTo,
  resampleLinear,
} from "./math.ts";
import { sha256Hex, sha256HexOfString } from "./sha256.ts";
import { validateBeatMap } from "./validate.ts";

const RMS_FRAME = 1024;
const RMS_HOP = 512;
const LOUDNESS_WEIGHT = 0.65;
const ACTIVITY_WEIGHT = 0.35;
const ENERGY_SMOOTHING_BEATS = 3;
const SECTION_MEDIAN_BEATS = 9;
const MIN_SECTION_BEATS = 8;
const BEST_WINDOW_LOOKAHEAD_BEATS = 16;
const BEST_WINDOW_MIN_TAIL_BARS = 3;

const LEVEL_LOW_MAX = 0.33;
const LEVEL_MEDIUM_MAX = 0.66;

const MIN_TRACK_SECONDS = 10.0;
const FINGERPRINT_SAMPLE_RATE = 8000;
const FINGERPRINT_PREFIX = "sha256-pcm8k";

export class AnalysisFailed extends Error {}

/** Root-mean-square amplitude per analysis frame. */
function frameRms(samples: Float32Array | Float64Array): Float64Array {
  if (samples.length < RMS_FRAME) {
    if (samples.length === 0) return Float64Array.of(0);
    let total = 0;
    for (let index = 0; index < samples.length; index += 1) {
      total += (samples[index] as number) ** 2;
    }
    return Float64Array.of(Math.sqrt(total / samples.length));
  }
  const frameCount = 1 + Math.floor((samples.length - RMS_FRAME) / RMS_HOP);
  const output = new Float64Array(frameCount);
  for (let frame = 0; frame < frameCount; frame += 1) {
    const start = frame * RMS_HOP;
    let total = 0;
    for (let index = 0; index < RMS_FRAME; index += 1) {
      total += (samples[start + index] as number) ** 2;
    }
    output[frame] = Math.sqrt(total / RMS_FRAME);
  }
  return output;
}

/** Scale to 0..1 using the 5th and 95th percentiles, so one loud hit cannot flatten it. */
function robustNormalise(values: readonly number[]): number[] {
  if (values.length === 0) return [];
  const low = percentile(values, 5);
  const high = percentile(values, 95);
  if (high - low < 1e-9) return values.map(() => 0.5);
  return values.map((value) => clip((value - low) / (high - low), 0, 1));
}

/**
 * One 0..1 value per beat. Blends loudness (how loud) with onset activity (how busy) —
 * a sparse loud pad is not a drop, and a busy quiet hi-hat pattern is not one either.
 */
export function buildEnergyCurve(
  samples: Float32Array | Float64Array,
  sampleRate: number,
  beatsSec: readonly number[],
  onsetEnvelope: Float64Array,
  onsetFrameRate: number,
): number[] {
  if (beatsSec.length === 0) return [];

  const rms = frameRms(samples);
  const rmsRate = sampleRate / RMS_HOP;
  const loudnessDb = new Float64Array(rms.length);
  for (let index = 0; index < rms.length; index += 1) {
    loudnessDb[index] = 20.0 * Math.log10(Math.max(rms[index] as number, 1e-6));
  }

  const intervals: number[] = [];
  for (let index = 1; index < beatsSec.length; index += 1) {
    intervals.push((beatsSec[index] as number) - (beatsSec[index - 1] as number));
  }
  const medianInterval = intervals.length > 0 ? median(intervals) : 0.5;

  const loudnessPerBeat = new Array<number>(beatsSec.length).fill(0);
  const activityPerBeat = new Array<number>(beatsSec.length).fill(0);

  for (let index = 0; index < beatsSec.length; index += 1) {
    const beat = beatsSec[index] as number;
    const span = index < intervals.length ? (intervals[index] as number) : medianInterval;
    const startSec = beat;
    const endSec = beat + Math.max(span, 1e-3);

    let lo = Math.floor(startSec * rmsRate);
    let hi = Math.ceil(endSec * rmsRate);
    lo = Math.max(0, Math.min(lo, loudnessDb.length - 1));
    hi = Math.max(lo + 1, Math.min(hi, loudnessDb.length));
    let loudness = 0;
    for (let at = lo; at < hi; at += 1) loudness += loudnessDb[at] as number;
    loudnessPerBeat[index] = loudness / (hi - lo);

    if (onsetEnvelope.length > 0 && onsetFrameRate > 0) {
      let onsetLo = Math.floor(startSec * onsetFrameRate);
      let onsetHi = Math.ceil(endSec * onsetFrameRate);
      onsetLo = Math.max(0, Math.min(onsetLo, onsetEnvelope.length - 1));
      onsetHi = Math.max(onsetLo + 1, Math.min(onsetHi, onsetEnvelope.length));
      let activity = 0;
      for (let at = onsetLo; at < onsetHi; at += 1) activity += onsetEnvelope[at] as number;
      activityPerBeat[index] = activity / (onsetHi - onsetLo);
    }
  }

  const loudnessNorm = robustNormalise(loudnessPerBeat);
  const activityNorm = robustNormalise(activityPerBeat);
  const blended =
    onsetEnvelope.length === 0
      ? loudnessNorm
      : loudnessNorm.map(
          (value, index) =>
            LOUDNESS_WEIGHT * value + ACTIVITY_WEIGHT * (activityNorm[index] as number),
        );

  const smoothed = movingAverage(Float64Array.from(blended), ENERGY_SMOOTHING_BEATS);
  // Re-spread after smoothing so the bands in the cut engine stay meaningful.
  const spread = robustNormalise(Array.from(smoothed));
  return spread.map((value) => pyRoundTo(clip(value, 0, 1), 4));
}

function levelFor(value: number): SectionLevel {
  if (value < LEVEL_LOW_MAX) return "low";
  if (value < LEVEL_MEDIUM_MAX) return "medium";
  return "high";
}

/** Move a boundary onto the nearest downbeat, if one is within half a bar. */
function snapToDownbeat(targetSec: number, downbeatsSec: readonly number[]): number {
  if (downbeatsSec.length === 0) return targetSec;
  let nearest = downbeatsSec[0] as number;
  let nearestDistance = Math.abs(nearest - targetSec);
  for (const downbeat of downbeatsSec) {
    const distance = Math.abs(downbeat - targetSec);
    if (distance < nearestDistance) {
      nearest = downbeat;
      nearestDistance = distance;
    }
  }
  const gaps: number[] = [];
  for (let index = 1; index < downbeatsSec.length; index += 1) {
    gaps.push((downbeatsSec[index] as number) - (downbeatsSec[index - 1] as number));
  }
  const barLength = gaps.length > 0 ? median(gaps) : 2.0;
  return nearestDistance <= barLength * 0.5 ? nearest : targetSec;
}

/**
 * Group beats into stretches with a consistent energy level. Boundaries snap to downbeats
 * where one is close by, because a section change that lands mid-bar reads as a mistake.
 */
export function buildSections(
  beatsSec: readonly number[],
  downbeatsSec: readonly number[],
  energyCurve: readonly number[],
  durationSec: number,
): Section[] {
  if (beatsSec.length === 0 || energyCurve.length === 0) {
    return [{ startSec: 0, endSec: Math.max(durationSec, 0.001), level: "medium" }];
  }

  const banded = medianFilter(energyCurve, SECTION_MEDIAN_BEATS);
  const levels = banded.map((value) => levelFor(value));

  // Collapse into runs of the same level.
  const runs: Array<[number, number]> = [];
  for (let index = 0; index < levels.length; index += 1) {
    const level = levels[index] as SectionLevel;
    const lastRun = runs[runs.length - 1];
    if (lastRun && levels[lastRun[0]] === level) {
      lastRun[1] = index;
    } else {
      runs.push([index, index]);
    }
  }

  // Short runs are absorbed into a neighbour. A short run at the *start* has no predecessor,
  // so it is carried forward into the next run.
  const merged: Array<[number, number]> = [];
  let carriedStart: number | null = null;
  for (const run of runs) {
    const length = run[1] - run[0] + 1;
    if (merged.length === 0 && length < MIN_SECTION_BEATS) {
      if (carriedStart === null) carriedStart = run[0];
      continue;
    }
    if (carriedStart !== null) {
      merged.push([carriedStart, run[1]]);
      carriedStart = null;
      continue;
    }
    if (merged.length > 0 && length < MIN_SECTION_BEATS) {
      (merged[merged.length - 1] as [number, number])[1] = run[1];
    } else {
      merged.push([run[0], run[1]]);
    }
  }
  if (carriedStart !== null) {
    // Every run was short: the whole track is one section.
    merged.push([carriedStart, (runs[runs.length - 1] as [number, number])[1]]);
  }

  // A short run at the end has a predecessor, so it folds backwards.
  if (merged.length > 1) {
    const last = merged[merged.length - 1] as [number, number];
    if (last[1] - last[0] + 1 < MIN_SECTION_BEATS) {
      (merged[merged.length - 2] as [number, number])[1] = last[1];
      merged.pop();
    }
  }

  const sections: Section[] = [];
  for (let position = 0; position < merged.length; position += 1) {
    const [startIndex, endIndex] = merged[position] as [number, number];
    let start =
      position === 0 ? 0 : snapToDownbeat(beatsSec[startIndex] as number, downbeatsSec);
    let end: number;
    if (position === merged.length - 1) {
      end = Math.max(
        durationSec,
        (beatsSec[Math.min(endIndex, beatsSec.length - 1)] as number) + 0.001,
      );
    } else {
      const nextStartIndex = (merged[position + 1] as [number, number])[0];
      end = snapToDownbeat(beatsSec[nextStartIndex] as number, downbeatsSec);
    }
    if (sections.length > 0) start = (sections[sections.length - 1] as Section).endSec;
    if (end <= start) end = start + 0.001;
    let levelTotal = 0;
    for (let at = startIndex; at <= endIndex; at += 1) levelTotal += banded[at] as number;
    const level = levelFor(levelTotal / (endIndex - startIndex + 1));
    sections.push({ startSec: pyRoundTo(start, 4), endSec: pyRoundTo(end, 4), level });
  }

  // Guarantee the sections tile the track end to end.
  if (sections.length > 0) {
    const first = sections[0] as Section;
    sections[0] = { startSec: 0, endSec: first.endSec, level: first.level };
    const last = sections[sections.length - 1] as Section;
    sections[sections.length - 1] = {
      startSec: last.startSec,
      endSec: pyRoundTo(Math.max(durationSec, last.startSec + 0.001), 4),
      level: last.level,
    };
  }
  return sections;
}

function nearestBeatIndex(beatsSec: readonly number[], target: number): number {
  let best = 0;
  let bestDistance = Infinity;
  for (let index = 0; index < beatsSec.length; index += 1) {
    const distance = Math.abs((beatsSec[index] as number) - target);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  }
  return best;
}

/**
 * Pick the downbeat a reel should start on: the most energetic stretch that still has at
 * least three bars of track after it.
 */
export function chooseBestWindow(
  beatsSec: readonly number[],
  downbeatsSec: readonly number[],
  energyCurve: readonly number[],
  beatsPerBar: number,
): number {
  if (beatsSec.length === 0 || energyCurve.length === 0) return 0;
  if (downbeatsSec.length === 0) return beatsSec[0] as number;

  const minTailBeats = beatsPerBar * BEST_WINDOW_MIN_TAIL_BARS;

  let bestStart = downbeatsSec[0] as number;
  let bestScore = -Infinity;

  for (const downbeat of downbeatsSec) {
    const beatIndex = nearestBeatIndex(beatsSec, downbeat);
    if (beatIndex + minTailBeats >= beatsSec.length) continue;
    const windowEnd = Math.min(energyCurve.length, beatIndex + BEST_WINDOW_LOOKAHEAD_BEATS);
    let total = 0;
    for (let at = beatIndex; at < windowEnd; at += 1) total += energyCurve[at] as number;
    const score = total / (windowEnd - beatIndex);
    if (score > bestScore + 1e-9) {
      // Ties keep the earlier window.
      bestScore = score;
      bestStart = downbeat;
    }
  }

  return pyRoundTo(bestStart, 6);
}

/**
 * Recording fingerprint — `factory/fingerprint.py`, ported. Resample to 8kHz, normalise the
 * peak, quantise to 8-bit, SHA-256. Survives a re-encode at a different bitrate, which is
 * the one difference it must not flag.
 */
export function fingerprintSamples(
  samples: Float32Array | Float64Array,
  sampleRate: number,
): string {
  if (samples.length === 0) return `${FINGERPRINT_PREFIX}:empty`;

  const downsampled = resampleLinear(samples, sampleRate, FINGERPRINT_SAMPLE_RATE);
  let peak = 0;
  for (let index = 0; index < downsampled.length; index += 1) {
    const magnitude = Math.abs(downsampled[index] as number);
    if (magnitude > peak) peak = magnitude;
  }
  const scale = peak > 1e-9 ? 1 / peak : 1;

  const quantised = new Int8Array(downsampled.length);
  for (let index = 0; index < downsampled.length; index += 1) {
    quantised[index] = clip(pyRound((downsampled[index] as number) * scale * 127.0), -127, 127);
  }
  const digest = sha256Hex(
    new Uint8Array(quantised.buffer, quantised.byteOffset, quantised.byteLength),
  );
  return `${FINGERPRINT_PREFIX}:${digest}`;
}

/**
 * Canonical content hash over everything except provenance timestamps, mirroring
 * `factory/schema.py`. The JSON canonicalisation (sorted keys, no spaces) matches Python's;
 * number formatting can differ between the two languages in exotic cases, which is harmless
 * because a hash only ever needs to agree with itself — an on-device beat map is never
 * compared against a Factory-computed hash.
 */
export function computeContentHash(beatMap: BeatMap): string {
  const payload: Record<string, unknown> = { ...beatMap };
  delete payload["lastVerifiedAt"];
  delete payload["contentHash"];
  return sha256HexOfString(canonicalJson(payload));
}

/** `json.dumps(value, sort_keys=True, separators=(",", ":"))` — recursive, like Python's. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export interface AnalyseInfo {
  trackId: string;
  title: string;
  artist: string;
}

export interface AnalyseOptions {
  /** Called with 0..1 through the heavy pass; may return a promise to pause the pipeline. */
  onProgress?: ProgressHook;
  /** Injectable clock, so tests are deterministic. */
  nowIso?: string;
}

/**
 * Produce a validated beat map from mono samples, or throw `AnalysisFailed` with a plain
 * reason. Samples at any rate are accepted; anything off the analysis rate is resampled
 * exactly as the Factory resamples.
 */
export async function analyseSamples(
  samples: Float32Array | Float64Array,
  sampleRate: number,
  info: AnalyseInfo,
  options: AnalyseOptions = {},
): Promise<BeatMap> {
  const durationSec = sampleRate > 0 ? samples.length / sampleRate : 0;
  if (durationSec < MIN_TRACK_SECONDS) {
    throw new AnalysisFailed(`only ${Math.floor(durationSec)}s of audio, need 10s minimum`);
  }

  let working: Float32Array | Float64Array = samples;
  let workingRate = sampleRate;
  if (sampleRate !== ANALYSIS_SAMPLE_RATE) {
    working = resampleLinear(samples, sampleRate, ANALYSIS_SAMPLE_RATE);
    workingRate = ANALYSIS_SAMPLE_RATE;
  }

  let detection;
  try {
    detection = await detectBeats(working, workingRate, options.onProgress);
  } catch (error) {
    if (error instanceof BeatDetectionFailed) throw new AnalysisFailed(error.message);
    throw error;
  }

  const energyCurve = buildEnergyCurve(
    working,
    workingRate,
    detection.beatsSec,
    detection.onsetEnvelope,
    detection.onsetFrameRate,
  );
  const sections = buildSections(
    detection.beatsSec,
    detection.downbeatsSec,
    energyCurve,
    durationSec,
  );
  const bestWindow = chooseBestWindow(
    detection.beatsSec,
    detection.downbeatsSec,
    energyCurve,
    detection.beatsPerBar,
  );

  const beatMap: BeatMap = {
    schemaVersion: 1,
    trackId: info.trackId,
    title: info.title,
    artist: info.artist,
    durationSec: pyRoundTo(durationSec, 3),
    bpm: pyRoundTo(clip(detection.bpm, MIN_BPM, MAX_BPM), 2),
    beatsSec: detection.beatsSec.map((value) => pyRoundTo(value, 6)),
    downbeatsSec: detection.downbeatsSec.map((value) => pyRoundTo(value, 6)),
    beatsPerBar: detection.beatsPerBar,
    energyCurve,
    sections,
    bestWindowStartSec: bestWindow,
    sourceDurationMs: Math.round(durationSec * 1000),
    audioFingerprint: fingerprintSamples(samples, sampleRate),
    lastVerifiedAt: options.nowIso ?? new Date().toISOString(),
    engine: ENGINE_NAME,
    engineVersion: ENGINE_VERSION,
    contentHash: "",
  };
  beatMap.contentHash = computeContentHash(beatMap);

  const failure = validateBeatMap(beatMap);
  if (failure !== null) throw new AnalysisFailed(failure);

  return beatMap;
}
