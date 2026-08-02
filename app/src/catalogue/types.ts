/**
 * What the Factory publishes and the app consumes.
 *
 * `catalogue.json` is a flat list of tracks plus the template definitions. Beat maps are one
 * file per track, fetched separately, so opening the gallery never waits on 300 beat maps.
 */

import type { BeatMap, Template } from "@thumpcut/cut-engine";

/**
 * Where a track's recording comes from, which decides everything downstream: an `instagram`
 * track exports silent and hands off to Instagram, which supplies the music; a `royaltyfree`
 * track's licence permits the music inside the exported file, so it shares anywhere; a
 * `local` track is the user's own file, analysed on the device, and also shares anywhere.
 * Only the first two ever appear in a published catalogue — `local` exists on the phone
 * alone. Absent on catalogues published before this field existed — treated as `instagram`,
 * which is what they all were.
 */
export type TrackSource = "instagram" | "royaltyfree" | "local";

/** The licence a royalty-free track is offered under. Shown, and carried into the credit. */
export interface TrackLicence {
  /** Short display name, e.g. `CC BY`. */
  name: string;
  /** The licence deed the credit should link to. */
  url: string;
}

export interface CatalogueTrack {
  trackId: string;
  title: string;
  artist: string;
  bpm: number;
  durationSec: number;
  /** Changes if and only if this track's timing data changed. */
  contentHash: string;
  /** Relative to the catalogue URL, e.g. `beatmaps/17841400008460056.json`. */
  beatMapPath: string;
  source?: TrackSource;
  licence?: TrackLicence;
}

/** The effective source, with the pre-field catalogues read as what they were. */
export function trackSource(track: Pick<CatalogueTrack, "source">): TrackSource {
  if (track.source === "royaltyfree" || track.source === "local") return track.source;
  return "instagram";
}

export type TemplateMood = "Chill" | "Upbeat" | "Hype" | "Cinematic";

/** A template as published. The cut engine only ever sees the `Template` subset of this. */
export interface CatalogueTemplate extends Template {
  mood: TemplateMood;
  previewPosterUrl: string;
}

export interface Catalogue {
  schemaVersion: number;
  generatedAt: string;
  catalogueHash: string;
  tracks: CatalogueTrack[];
  templates: CatalogueTemplate[];
}

/**
 * Where the preview gets the actual recording.
 *
 * This is deliberately *not* part of `catalogue.json`. The song list is pinned to the commit
 * the app was built from, so nothing inside it can ever change for a phone that already has
 * the app. Instagram's audio links expire in about a day and a half, so they have to be able
 * to move. Keeping them in their own document, fetched unpinned, is what lets a link be
 * refreshed without a phone ever being handed a song list newer than its app.
 *
 * Everything here is looked up by track id. An entry for a track the app has never heard of
 * is ignored; a track with no entry falls back to the click. Neither can break anything.
 */
export interface AudioIndexEntry {
  /** Fetched as-is. Only HTTPS is ever played. */
  url: string;
  /** ISO 8601, or null when the link does not expire (our own test tracks). */
  expiresAt: string | null;
  /** The beat map hash of the recording this link was issued for. */
  contentHash: string;
}

export interface AudioIndex {
  schemaVersion: number;
  generatedAt: string;
  audio: Record<string, AudioIndexEntry>;
}

export type CatalogueState =
  | "NoCache"
  | "Downloading"
  | "Ready"
  | "OfflineNoCache"
  | "OfflineWithCache"
  | "Stale"
  | "DownloadFailed";

export interface CatalogueSnapshot {
  state: CatalogueState;
  catalogue: Catalogue | null;
  /** The exact on-screen text for the current state, or null when nothing is shown. */
  message: string | null;
  canRetry: boolean;
}

/** Storage the catalogue needs. Injected so the whole thing is testable under plain node. */
export interface CatalogueStorage {
  readText(relativePath: string): Promise<string | null>;
  /** Must write to a temporary name and rename, so a kill mid-write cannot corrupt the cache. */
  writeTextAtomic(relativePath: string, contents: string): Promise<void>;
  remove(relativePath: string): Promise<void>;
  list(relativeDir: string): Promise<string[]>;
  freeBytes(): Promise<number>;
}

export interface HttpResponse {
  status: number;
  contentType: string;
  body: string;
}

export interface FetchOptions {
  /**
   * Ask for a fresh copy rather than whatever the phone has cached.
   *
   * The CDN tells clients a file is good for a week. That is right for the song list, which
   * is pinned to a commit and can never change, and wrong for the audio index, whose whole
   * job is to carry a link that expires in a day and a half.
   */
  noCache?: boolean;
}

export interface CatalogueNetwork {
  /** Rejects on a transport failure; resolves with any HTTP status. */
  get(url: string, timeoutMs: number, options?: FetchOptions): Promise<HttpResponse>;
  isOnline(): Promise<boolean>;
}

export type { BeatMap };
