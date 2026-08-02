/**
 * The beat map sanity checks — `factory/schema.py`'s `validate_beat_map`, ported.
 *
 * On a phone this is the last gate between "analysis produced something" and "the cut
 * engine consumes it". Returning the failure as a string rather than throwing keeps the
 * call sites honest about handling it.
 */

import type { BeatMap } from "@thumpcut/cut-engine";
import { MAX_BPM, MIN_BPM } from "./engine.ts";

const BEAT_MATCH_TOLERANCE_SEC = 5e-4;
const MIN_SECTION_SEC = 1.0;

function isStrictlyIncreasing(values: readonly number[]): boolean {
  for (let index = 1; index < values.length; index += 1) {
    if ((values[index] as number) <= (values[index - 1] as number)) return false;
  }
  return true;
}

function containsWithinTolerance(sortedValues: readonly number[], target: number): boolean {
  let lo = 0;
  let hi = sortedValues.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const value = sortedValues[mid] as number;
    if (Math.abs(value - target) <= BEAT_MATCH_TOLERANCE_SEC) return true;
    if (value < target) lo = mid + 1;
    else hi = mid - 1;
  }
  return false;
}

/** Every invariant from the schema. Returns a plain failure reason, or null when sound. */
export function validateBeatMap(beatMap: BeatMap): string | null {
  if (beatMap.schemaVersion !== 1) {
    return `schemaVersion ${beatMap.schemaVersion}, expected 1`;
  }
  if (beatMap.durationSec < 10.0) {
    return `only ${Math.floor(beatMap.durationSec)}s, need 10s minimum`;
  }
  if (!(beatMap.bpm >= MIN_BPM && beatMap.bpm <= MAX_BPM)) {
    return `detected ${Math.round(beatMap.bpm)} BPM, outside 50–200`;
  }
  if (beatMap.energyCurve.length !== beatMap.beatsSec.length) {
    return `energyCurve ${beatMap.energyCurve.length} != beats ${beatMap.beatsSec.length}`;
  }
  if (beatMap.beatsSec.length === 0) return "no beats detected";
  if (!isStrictlyIncreasing(beatMap.beatsSec)) return "beatsSec is not strictly increasing";

  for (const downbeat of beatMap.downbeatsSec) {
    if (!containsWithinTolerance(beatMap.beatsSec, downbeat)) {
      return `downbeat ${downbeat.toFixed(3)}s is not in beatsSec`;
    }
  }
  if (!isStrictlyIncreasing(beatMap.downbeatsSec)) {
    return "downbeatsSec is not strictly increasing";
  }
  if (beatMap.energyCurve.some((value) => !(value >= 0 && value <= 1))) {
    return "energyCurve has a value outside 0..1";
  }
  if (beatMap.beatsPerBar <= 0) return "beatsPerBar must be positive";

  for (const section of beatMap.sections) {
    if (section.endSec <= section.startSec) {
      return `section ${section.startSec.toFixed(2)}–${section.endSec.toFixed(2)} is empty`;
    }
    if (
      beatMap.sections.length > 1 &&
      section.endSec - section.startSec < MIN_SECTION_SEC
    ) {
      return (
        `section ${section.startSec.toFixed(2)}–${section.endSec.toFixed(2)} ` +
        `is shorter than ${MIN_SECTION_SEC}s`
      );
    }
    if (section.level !== "low" && section.level !== "medium" && section.level !== "high") {
      return `unknown section level ${String(section.level)}`;
    }
  }
  for (let index = 1; index < beatMap.sections.length; index += 1) {
    const previous = beatMap.sections[index - 1];
    const current = beatMap.sections[index];
    if (previous && current && Math.abs(current.startSec - previous.endSec) > 1e-6) {
      return `sections leave a gap at ${previous.endSec.toFixed(2)}s`;
    }
  }

  if (!(beatMap.bestWindowStartSec >= 0 && beatMap.bestWindowStartSec <= beatMap.durationSec)) {
    return `bestWindowStartSec ${beatMap.bestWindowStartSec.toFixed(2)} is outside the track`;
  }
  return null;
}
