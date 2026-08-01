/**
 * Recommending a template for the number of items the user picked.
 *
 * This is one of the three things that make the product good, and it is pure arithmetic on
 * data already on the phone — so it is instant, and it never shows a spinner.
 *
 * Nothing is ever hidden. Templates that suit the count come first under "Made for N items";
 * the rest sit below a divider labelled "Also works". The user can always pick anything.
 */

import type { BeatMap, Template } from "@thumpcut/cut-engine";
import type { CatalogueTemplate, CatalogueTrack } from "../catalogue/types.ts";

export interface Recommendation<T extends Template = CatalogueTemplate> {
  /** Templates whose ideal range contains the item count, best fit first. */
  madeFor: T[];
  /** Everything else, in catalogue order. Shown, never hidden. */
  alsoWorks: T[];
}

/** How far the item count is from the middle of a template's ideal range. */
function distanceFromIdeal(template: Template, itemCount: number): number {
  const [low, high] = template.idealItemRange;
  const middle = (low + high) / 2;
  return Math.abs(itemCount - middle);
}

export function fitsItemCount(template: Template, itemCount: number): boolean {
  const [low, high] = template.idealItemRange;
  return itemCount >= low && itemCount <= high;
}

export function recommendTemplates<T extends Template>(
  templates: readonly T[],
  itemCount: number,
): Recommendation<T> {
  const madeFor = templates
    .filter((template) => fitsItemCount(template, itemCount))
    .slice()
    .sort((left, right) => {
      const delta = distanceFromIdeal(left, itemCount) - distanceFromIdeal(right, itemCount);
      // Ties resolve by id so the order is stable between launches.
      return delta !== 0 ? delta : left.id.localeCompare(right.id);
    });

  const chosen = new Set(madeFor.map((template) => template.id));
  const alsoWorks = templates.filter((template) => !chosen.has(template.id));

  return { madeFor, alsoWorks };
}

/** Filter by mood chip. "All" passes everything through. */
export function filterByMood(
  templates: readonly CatalogueTemplate[],
  mood: string,
): CatalogueTemplate[] {
  if (!mood || mood === "All") return [...templates];
  return templates.filter((template) => template.mood === mood);
}

/**
 * The nearest replacement when a track is retired mid-session.
 *
 * The cut list is expressed in beats, so a substitute within a few BPM holds up — the user's
 * work survives and the timing still lands. Beyond that the edit stops matching the music and
 * it is better to send them back to the gallery.
 */
export const SUBSTITUTE_BPM_TOLERANCE = 4;

export function findSubstituteTrack(
  tracks: readonly CatalogueTrack[],
  retiredBpm: number,
  excludeTrackId: string,
): CatalogueTrack | null {
  let best: CatalogueTrack | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;

  for (const track of tracks) {
    if (track.trackId === excludeTrackId) continue;
    const delta = Math.abs(track.bpm - retiredBpm);
    if (delta > SUBSTITUTE_BPM_TOLERANCE) continue;
    if (delta < bestDelta || (delta === bestDelta && best && track.trackId < best.trackId)) {
      bestDelta = delta;
      best = track;
    }
  }
  return best;
}

/**
 * A deterministic shuffle.
 *
 * Deterministic matters: the preview and the export must come from the same cut list (V4), so
 * "shuffle" has to be a value that can be passed to both, not a call to `Math.random` inside
 * the engine.
 */
export function shuffleOrder<T>(items: readonly T[], seed: number): T[] {
  const output = [...items];
  let state = (seed >>> 0) || 1;
  const next = () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(next() * (index + 1));
    const held = output[index] as T;
    output[index] = output[swap] as T;
    output[swap] = held;
  }
  return output;
}

/** The markers the beat ruler draws for a cut list. */
export function markersForCuts(
  cuts: readonly { startSec: number; mediaIndex: number }[],
  media: readonly { kind: "photo" | "video" }[],
): { atSec: number; kind: "photo" | "video" }[] {
  return cuts.map((cut) => ({
    atSec: cut.startSec,
    kind: media[cut.mediaIndex]?.kind ?? "photo",
  }));
}

export type { BeatMap };
