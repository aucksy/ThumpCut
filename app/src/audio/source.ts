/**
 * Deciding what the preview is allowed to play, before anything makes a sound.
 *
 * The preview plays the real recording. The app never talks to Instagram and never holds a
 * token: it is handed a plain URL by the audio index the Factory publishes, and it either
 * plays that or it does not. Every reason it might not is decided here, in one pure function,
 * so all of it is testable under plain `node`.
 *
 * The rule that matters most is the third one. A beat grid is computed from one specific
 * recording. If Instagram swaps that recording for a remaster, the grid still loads, the URL
 * still plays, and every cut quietly lands in the wrong place — nothing errors, the product
 * is just wrong. The content hash is what catches it, and a mismatch means the click, not the
 * music.
 */

import type { AudioIndex, CatalogueTrack } from "../catalogue/types.ts";

/** Why the preview fell back to the click. Never invented — each maps to one check below. */
export type ClickReason =
  /** The index has nothing for this track, or could not be fetched at all. */
  | "no-entry"
  /** The URL was issued for a different recording than the beat grid was computed from. */
  | "recording-changed"
  /** Instagram's link has run out. A newer index will carry a fresh one. */
  | "expired"
  /** Present but not something we are willing to fetch. */
  | "unusable"
  /** Decided at play time, not here: the link was fine but the audio would not arrive. */
  | "unreachable";

export type PreviewAudioPlan =
  | { kind: "stream"; url: string }
  | { kind: "click"; reason: ClickReason };

/**
 * Only plain HTTPS is ever fetched. Anything else — a `file://`, a redirect scheme, an empty
 * string left in by a half-written index — falls back rather than being handed to a player.
 */
function isFetchableUrl(url: string): boolean {
  return typeof url === "string" && /^https:\/\/[^\s]+$/i.test(url);
}

/** What the preview should play for this track, right now. */
export function planPreviewAudio(
  index: AudioIndex | null,
  track: Pick<CatalogueTrack, "trackId" | "contentHash">,
  nowMs: number,
): PreviewAudioPlan {
  const entry = index?.audio?.[track.trackId];
  if (!entry) return { kind: "click", reason: "no-entry" };

  if (!isFetchableUrl(entry.url)) return { kind: "click", reason: "unusable" };

  // The recording this URL points at must be the one the beat grid was computed from.
  if (entry.contentHash !== track.contentHash) {
    return { kind: "click", reason: "recording-changed" };
  }

  if (entry.expiresAt !== null && entry.expiresAt !== undefined) {
    const expiry = Date.parse(entry.expiresAt);
    // An unparseable stamp is treated as expired. A URL we cannot date is not one to trust.
    if (!Number.isFinite(expiry) || expiry <= nowMs) {
      return { kind: "click", reason: "expired" };
    }
  }

  return { kind: "stream", url: entry.url };
}

/** Parse and validate an audio index. Anything short of a usable document throws. */
export function parseAudioIndex(raw: string): AudioIndex {
  const parsed = JSON.parse(raw) as Partial<AudioIndex>;
  if (!parsed || typeof parsed !== "object") throw new Error("audio index is not an object");
  if (!parsed.audio || typeof parsed.audio !== "object") {
    throw new Error("audio index has no audio map");
  }

  for (const [trackId, entry] of Object.entries(parsed.audio)) {
    if (!entry || typeof entry !== "object") {
      throw new Error(`audio index entry ${trackId} is not an object`);
    }
    if (typeof entry.url !== "string" || typeof entry.contentHash !== "string") {
      throw new Error(`audio index entry ${trackId} is missing required fields`);
    }
  }

  return parsed as AudioIndex;
}
