/**
 * Flattening a cut list into the records the native renderer consumes.
 *
 * Kept apart from the native binding on purpose: this is the part that can be wrong in a way
 * that produces a silently incorrect reel, so it is pure, and it is tested.
 */

import type { Cut, CutList, MediaItem } from "@thumpcut/cut-engine";

export interface NativeCut {
  uri: string;
  kind: "photo" | "video";
  /** How long this cut occupies the output timeline. */
  durationSec: number;
  sourceInSec: number;
  sourceOutSec: number;
  speed: number;
  freezeFromSec: number | null;
  rotationDeg: number;
  kenBurnsFrom: number | null;
  kenBurnsTo: number | null;
}

export function toNativeCuts(cutList: CutList, media: MediaItem[]): NativeCut[] {
  return cutList.cuts.map((cut: Cut) => {
    const item = media[cut.mediaIndex];
    if (!item) throw new Error(`cut refers to media index ${cut.mediaIndex}, which is missing`);
    return {
      uri: item.uri,
      kind: item.kind,
      durationSec: Number((cut.endSec - cut.startSec).toFixed(6)),
      sourceInSec: cut.sourceInSec ?? 0,
      sourceOutSec: cut.sourceOutSec ?? 0,
      speed: cut.speed ?? 1,
      freezeFromSec: cut.freezeFromSec ?? null,
      rotationDeg: item.rotationDeg,
      kenBurnsFrom: cut.motion?.fromScale ?? null,
      kenBurnsTo: cut.motion?.toScale ?? null,
    };
  });
}
