/**
 * Flattening a cut list into the records the native renderer consumes.
 *
 * Kept apart from the native binding on purpose: this is the part that can be wrong in a way
 * that produces a silently incorrect reel, so it is pure, and it is tested.
 */

import type { Cut, CutList, MediaItem, TransitionKind } from "@thumpcut/cut-engine";

export interface NativeCut {
  uri: string;
  kind: "photo" | "video";
  /** How long this cut occupies the output timeline. */
  durationSec: number;
  sourceInSec: number;
  sourceOutSec: number;
  speed: number;
  freezeFromSec: number | null;
  /**
   * How long the last frame holds after the source runs out, so the slot is covered exactly.
   * Zero when the source fills its slot. Computed here rather than natively because it is
   * arithmetic that can silently slide every later cut off the beat, so it must be tested.
   */
  holdDurationSec: number;
  rotationDeg: number;
  kenBurnsFrom: number | null;
  kenBurnsTo: number | null;
  /** How this cut enters: a hard cut, a dip (crossfade), or a zoom punch. */
  transitionIn: TransitionKind;
}

export function toNativeCuts(cutList: CutList, media: MediaItem[]): NativeCut[] {
  return cutList.cuts.map((cut: Cut) => {
    const item = media[cut.mediaIndex];
    if (!item) throw new Error(`cut refers to media index ${cut.mediaIndex}, which is missing`);
    const durationSec = round(cut.endSec - cut.startSec);
    return {
      uri: item.uri,
      kind: item.kind,
      durationSec,
      sourceInSec: cut.sourceInSec ?? 0,
      sourceOutSec: cut.sourceOutSec ?? 0,
      speed: cut.speed ?? 1,
      freezeFromSec: cut.freezeFromSec ?? null,
      holdDurationSec: holdDuration(cut, durationSec),
      rotationDeg: item.rotationDeg,
      kenBurnsFrom: cut.motion?.fromScale ?? null,
      kenBurnsTo: cut.motion?.toScale ?? null,
      transitionIn: cut.transitionIn,
    };
  });
}

/**
 * How long the frozen tail runs: the slot, minus what the source actually plays at its speed.
 *
 * A clip with nothing left to play (its in-point already sits at its end) holds for the whole
 * slot. A photo, or a clip that covers its slot, holds for nothing.
 */
function holdDuration(cut: Cut, durationSec: number): number {
  if (cut.freezeFromSec === undefined) return 0;
  const speed = cut.speed && cut.speed > 0 ? cut.speed : 1;
  const sourceSpan = Math.max(0, (cut.sourceOutSec ?? 0) - (cut.sourceInSec ?? 0));
  const playedSec = sourceSpan / speed;
  return round(Math.min(durationSec, Math.max(0, durationSec - playedSec)));
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}
