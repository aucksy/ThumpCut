/**
 * Reading a beat map: validation, beat lookups, and grouping beats into bars.
 *
 * Everything here is pure and synchronous. No file access, no clock, no randomness.
 */

import {
  BAND_HIGH_MAX,
  BAND_LOW_MAX,
  BAND_MEDIUM_MAX,
  EPSILON,
} from "./constants.ts";
import { InvalidBeatMapError } from "./errors.ts";
import type { BeatMap, EnergyBand } from "./types.ts";

/** A bar: a run of beats between two downbeats. */
export interface Bar {
  /** Index into `beatsSec` of this bar's first beat. */
  firstBeatIndex: number;
  /** Index into `beatsSec` of the beat *after* this bar. */
  endBeatIndex: number;
  startSec: number;
  endSec: number;
  /** Mean energy across this bar's beats. */
  energy: number;
  band: EnergyBand;
}

/**
 * Check a beat map is usable. Throws `InvalidBeatMapError` with a plain reason.
 *
 * These are the same properties the Factory asserts before publishing (P2–P4). They are
 * re-checked here because a beat map can also arrive from a stale cache or a partial
 * download, and a silently wrong grid is the worst failure this product has.
 */
export function assertUsableBeatMap(beatMap: BeatMap): void {
  if (!Array.isArray(beatMap.beatsSec) || beatMap.beatsSec.length === 0) {
    throw new InvalidBeatMapError("beatsSec is empty");
  }
  if (!Array.isArray(beatMap.energyCurve)) {
    throw new InvalidBeatMapError("energyCurve is missing");
  }
  if (beatMap.energyCurve.length !== beatMap.beatsSec.length) {
    throw new InvalidBeatMapError(
      `energyCurve has ${beatMap.energyCurve.length} values for ${beatMap.beatsSec.length} beats`,
    );
  }
  for (let index = 1; index < beatMap.beatsSec.length; index += 1) {
    const previous = beatMap.beatsSec[index - 1] as number;
    const current = beatMap.beatsSec[index] as number;
    if (!(current > previous)) {
      throw new InvalidBeatMapError(
        `beatsSec is not strictly increasing at index ${index} (${previous} then ${current})`,
      );
    }
  }
  for (const value of beatMap.beatsSec) {
    if (!Number.isFinite(value)) {
      throw new InvalidBeatMapError("beatsSec contains a non-finite value");
    }
  }
  for (const value of beatMap.energyCurve) {
    if (!Number.isFinite(value)) {
      throw new InvalidBeatMapError("energyCurve contains a non-finite value");
    }
  }
}

/**
 * The downbeats to use. Falls back to every fourth beat when the map has none — a beat map
 * without downbeats is unusual but not broken, and a 4/4 assumption is right far more often
 * than it is wrong.
 */
export function effectiveDownbeats(beatMap: BeatMap): number[] {
  if (Array.isArray(beatMap.downbeatsSec) && beatMap.downbeatsSec.length > 0) {
    return beatMap.downbeatsSec;
  }
  const perBar = beatMap.beatsPerBar > 0 ? beatMap.beatsPerBar : 4;
  const fallback: number[] = [];
  for (let index = 0; index < beatMap.beatsSec.length; index += perBar) {
    fallback.push(beatMap.beatsSec[index] as number);
  }
  return fallback;
}

/** Index of the beat closest to `timeSec`. Ties resolve to the earlier beat. */
export function nearestBeatIndex(beatsSec: number[], timeSec: number): number {
  let low = 0;
  let high = beatsSec.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((beatsSec[middle] as number) < timeSec) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  const candidate = low;
  const previous = Math.max(0, candidate - 1);
  const candidateDistance = Math.abs((beatsSec[candidate] as number) - timeSec);
  const previousDistance = Math.abs((beatsSec[previous] as number) - timeSec);
  return previousDistance <= candidateDistance ? previous : candidate;
}

/** Index of the first beat at or after `timeSec`, or `beatsSec.length` if there is none. */
export function firstBeatIndexAtOrAfter(beatsSec: number[], timeSec: number): number {
  let low = 0;
  let high = beatsSec.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((beatsSec[middle] as number) < timeSec - EPSILON) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

/** True when `timeSec` coincides with a beat, within the 50ms the product promises. */
export function isOnBeat(beatsSec: number[], timeSec: number, toleranceSec: number): boolean {
  if (beatsSec.length === 0) return false;
  const index = nearestBeatIndex(beatsSec, timeSec);
  return Math.abs((beatsSec[index] as number) - timeSec) <= toleranceSec + EPSILON;
}

/** Which density band a 0..1 energy value falls into. */
export function bandForEnergy(energy: number): EnergyBand {
  if (energy < BAND_LOW_MAX) return "low";
  if (energy < BAND_MEDIUM_MAX) return "medium";
  if (energy < BAND_HIGH_MAX) return "high";
  return "drop";
}

/**
 * Split the beats between `startBeatIndex` and `endBeatIndex` into bars at the downbeats.
 *
 * A "bar" here is whatever sits between two downbeats, which is not always four beats — the
 * first bar of a window can be a partial one, and the Factory's downbeat detection can drop a
 * bar line. Everything downstream works from the returned spans, never from an assumed 4.
 */
export function groupIntoBars(
  beatMap: BeatMap,
  startBeatIndex: number,
  endBeatIndex: number,
): Bar[] {
  const beats = beatMap.beatsSec;
  const downbeats = effectiveDownbeats(beatMap);
  const downbeatIndices = new Set<number>();
  for (const downbeat of downbeats) {
    const index = nearestBeatIndex(beats, downbeat);
    if (Math.abs((beats[index] as number) - downbeat) < 1e-3) {
      downbeatIndices.add(index);
    }
  }

  const boundaries: number[] = [startBeatIndex];
  for (let index = startBeatIndex + 1; index < endBeatIndex; index += 1) {
    if (downbeatIndices.has(index)) boundaries.push(index);
  }
  boundaries.push(endBeatIndex);

  const bars: Bar[] = [];
  for (let position = 0; position < boundaries.length - 1; position += 1) {
    const first = boundaries[position] as number;
    const end = boundaries[position + 1] as number;
    if (end <= first) continue;

    let total = 0;
    for (let index = first; index < end; index += 1) {
      total += beatMap.energyCurve[index] as number;
    }
    const energy = total / (end - first);

    bars.push({
      firstBeatIndex: first,
      endBeatIndex: end,
      startSec: beats[first] as number,
      endSec: (beats[end] ?? beats[beats.length - 1]) as number,
      energy,
      band: bandForEnergy(energy),
    });
  }
  return bars;
}
