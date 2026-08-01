/**
 * What the Factory publishes and the app consumes.
 *
 * `catalogue.json` is a flat list of tracks plus the template definitions. Beat maps are one
 * file per track, fetched separately, so opening the gallery never waits on 300 beat maps.
 */

import type { BeatMap, Template } from "@thumpcut/cut-engine";

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

export interface CatalogueNetwork {
  /** Rejects on a transport failure; resolves with any HTTP status. */
  get(url: string, timeoutMs: number): Promise<HttpResponse>;
  isOnline(): Promise<boolean>;
}

export type { BeatMap };
