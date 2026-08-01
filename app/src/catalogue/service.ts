/**
 * Getting the track list and beat maps onto the phone, and keeping them there.
 *
 * The rule that shapes this file: **a cached catalogue is a normal working state, not a
 * degraded one.** Offline with a cache shows no banner, no warning and no spinner. The only
 * time the app admits to needing the network is the very first launch.
 *
 * Two failure modes it exists to survive:
 *   · A partial download must never replace a working cache (K-I1, K-I2).
 *   · A track pulled from Instagram's library must stop being offered, and a track whose
 *     recording was swapped must have its timings re-fetched before it is used again
 *     (K-I6, K-I7). Neither of those errors — they just quietly produce a wrong reel.
 */

import { assertUsableBeatMap } from "@thumpcut/cut-engine";
import { COPY } from "../copy.ts";
import type {
  BeatMap,
  Catalogue,
  CatalogueNetwork,
  CatalogueSnapshot,
  CatalogueState,
  CatalogueStorage,
  CatalogueTrack,
} from "./types.ts";

const CACHE_FILE = "catalogue.json";
const BEATMAP_DIR = "beatmaps";
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [400, 1200, 3600];
/** Roughly what a first-run catalogue plus its beat maps needs. */
const REQUIRED_FREE_BYTES = 50 * 1024 * 1024;
/** At most one refresh an hour while the app is open. */
export const REFRESH_INTERVAL_MS = 60 * 60 * 1000;

export interface CatalogueServiceOptions {
  catalogueUrl: string;
  storage: CatalogueStorage;
  network: CatalogueNetwork;
  /** Injected so tests are not at the mercy of the clock. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export class CatalogueService {
  private readonly url: string;
  private readonly storage: CatalogueStorage;
  private readonly network: CatalogueNetwork;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  private catalogue: Catalogue | null = null;
  private state: CatalogueState = "NoCache";
  private message: string | null = null;
  /** K-I4 — only one catalogue fetch is ever in flight. */
  private inFlight: Promise<CatalogueSnapshot> | null = null;
  private lastRefreshAt = 0;
  private readonly beatMaps = new Map<string, BeatMap>();

  constructor(options: CatalogueServiceOptions) {
    this.url = options.catalogueUrl.replace(/\/+$/, "");
    this.storage = options.storage;
    this.network = options.network;
    this.now = options.now ?? (() => Date.now());
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  snapshot(): CatalogueSnapshot {
    return {
      state: this.state,
      catalogue: this.catalogue,
      message: this.message,
      canRetry: this.state === "OfflineNoCache" || this.state === "DownloadFailed",
    };
  }

  /**
   * Called on every cold start. Serves the cache immediately if there is one, and only ever
   * blocks when there is nothing to serve (K-I3).
   */
  async load(): Promise<CatalogueSnapshot> {
    const cached = await this.readCache();
    if (cached) {
      this.catalogue = cached;
      this.beatMaps.clear();
      const online = await this.network.isOnline();
      if (!online) {
        // No message. A cached catalogue is a normal working state.
        this.state = "OfflineWithCache";
        this.message = null;
        return this.snapshot();
      }
      this.state = "Ready";
      this.message = null;
      void this.refresh();
      return this.snapshot();
    }

    if (!(await this.network.isOnline())) {
      this.state = "OfflineNoCache";
      this.message = COPY.catalogue.offlineNoCache;
      return this.snapshot();
    }

    return this.download();
  }

  /**
   * The Retry button. A second tap while a fetch is running is ignored (K-I4).
   *
   * Not an `async` method, deliberately: the guard has to be taken *before* the first await,
   * or two taps a millisecond apart both sail past it and fire two downloads.
   */
  retry(): Promise<CatalogueSnapshot> {
    if (this.inFlight) return this.inFlight;
    return this.runExclusive(async () => {
      if (!(await this.network.isOnline())) {
        this.state = "OfflineNoCache";
        this.message = this.catalogue ? null : COPY.catalogue.offlineNoCache;
        return this.snapshot();
      }
      return this.performDownload();
    });
  }

  /** Hold the single-fetch lock for the whole of `work`. */
  private runExclusive(work: () => Promise<CatalogueSnapshot>): Promise<CatalogueSnapshot> {
    const run = work();
    this.inFlight = run;
    return run.finally(() => {
      if (this.inFlight === run) this.inFlight = null;
    });
  }

  /**
   * Background refresh. Never shows anything: if it fails, the cache keeps working and the
   * user is not told about a problem they do not have.
   */
  async refresh(force = false): Promise<CatalogueSnapshot> {
    if (this.inFlight) return this.inFlight;
    if (!force && this.now() - this.lastRefreshAt < REFRESH_INTERVAL_MS) {
      return this.snapshot();
    }
    if (!(await this.network.isOnline())) return this.snapshot();

    this.lastRefreshAt = this.now();
    const before = this.catalogue?.catalogueHash;

    try {
      const fetched = await this.fetchCatalogue();
      if (fetched.catalogueHash === before) {
        this.state = "Ready";
        return this.snapshot();
      }
      await this.commit(fetched);
      this.state = "Ready";
      this.message = null;
    } catch {
      // K4 — nothing is shown. The cache continues to serve.
      if (!this.catalogue) {
        this.state = "DownloadFailed";
        this.message = COPY.catalogue.downloadFailed;
      }
    }
    return this.snapshot();
  }

  /**
   * The beat map for a track, from cache when its content hash still matches, otherwise
   * re-downloaded first (K-I7).
   */
  async beatMapFor(trackId: string): Promise<BeatMap | null> {
    const track = this.catalogue?.tracks.find((candidate) => candidate.trackId === trackId);
    if (!track) return null;

    const held = this.beatMaps.get(trackId);
    if (held && held.contentHash === track.contentHash) return held;

    const cached = await this.readCachedBeatMap(track);
    if (cached) {
      this.beatMaps.set(trackId, cached);
      return cached;
    }

    try {
      const fetched = await this.fetchBeatMap(track);
      await this.storage.writeTextAtomic(
        `${BEATMAP_DIR}/${trackId}.json`,
        JSON.stringify(fetched),
      );
      this.beatMaps.set(trackId, fetched);
      return fetched;
    } catch {
      return null;
    }
  }

  /** Every track that can actually be used right now (K-I5). */
  async servableTracks(): Promise<CatalogueTrack[]> {
    if (!this.catalogue) return [];
    const servable: CatalogueTrack[] = [];
    for (const track of this.catalogue.tracks) {
      if (await this.beatMapFor(track.trackId)) servable.push(track);
    }
    return servable;
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private download(): Promise<CatalogueSnapshot> {
    if (this.inFlight) return this.inFlight;
    return this.runExclusive(() => this.performDownload());
  }

  private async performDownload(): Promise<CatalogueSnapshot> {
    this.state = "Downloading";
    this.message = null;

    if ((await this.storage.freeBytes()) < REQUIRED_FREE_BYTES) {
      this.state = "DownloadFailed";
      this.message = COPY.catalogue.storageFull;
      return this.snapshot();
    }

    try {
      const fetched = await this.fetchCatalogue();
      await this.commit(fetched);
      this.lastRefreshAt = this.now();
      this.state = "Ready";
      this.message = null;
    } catch {
      // K5 — an invalid catalogue leaves any existing cache untouched.
      if (this.catalogue) {
        this.state = "Ready";
        this.message = null;
      } else {
        this.state = "DownloadFailed";
        this.message = COPY.catalogue.downloadFailed;
      }
    }
    return this.snapshot();
  }

  private async commit(catalogue: Catalogue): Promise<void> {
    await this.storage.writeTextAtomic(CACHE_FILE, JSON.stringify(catalogue));

    // K-I6 — a track that has left the catalogue is never served again, and its cached beat
    // map goes with it. Otherwise the app happily offers a song Instagram has withdrawn.
    const live = new Set(catalogue.tracks.map((track) => track.trackId));
    for (const name of await this.storage.list(BEATMAP_DIR)) {
      const trackId = name.replace(/\.json$/, "");
      if (!live.has(trackId)) {
        await this.storage.remove(`${BEATMAP_DIR}/${name}`);
        this.beatMaps.delete(trackId);
      }
    }

    // K-I7 — a swapped recording invalidates the beat map we are holding.
    for (const track of catalogue.tracks) {
      const held = this.beatMaps.get(track.trackId);
      if (held && held.contentHash !== track.contentHash) {
        this.beatMaps.delete(track.trackId);
      }
    }

    this.catalogue = catalogue;
  }

  private async readCache(): Promise<Catalogue | null> {
    const raw = await this.storage.readText(CACHE_FILE);
    if (!raw) return null;
    try {
      return parseCatalogue(raw);
    } catch {
      // A corrupt cache is treated as no cache. It is never partially trusted.
      return null;
    }
  }

  private async readCachedBeatMap(track: CatalogueTrack): Promise<BeatMap | null> {
    const raw = await this.storage.readText(`${BEATMAP_DIR}/${track.trackId}.json`);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as BeatMap;
      assertUsableBeatMap(parsed);
      if (parsed.contentHash !== track.contentHash) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private async fetchCatalogue(): Promise<Catalogue> {
    const body = await this.fetchWithRetries(`${this.url}/${CACHE_FILE}`);
    return parseCatalogue(body);
  }

  private async fetchBeatMap(track: CatalogueTrack): Promise<BeatMap> {
    const body = await this.fetchWithRetries(`${this.url}/${track.beatMapPath}`);
    const parsed = JSON.parse(body) as BeatMap;
    assertUsableBeatMap(parsed);
    if (parsed.contentHash !== track.contentHash) {
      throw new Error("beat map content hash does not match the catalogue");
    }
    return parsed;
  }

  private async fetchWithRetries(url: string): Promise<string> {
    let lastError = new Error("unknown");
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      try {
        const response = await this.network.get(url, REQUEST_TIMEOUT_MS);
        if (response.status < 200 || response.status >= 300) {
          throw new Error(`HTTP ${response.status}`);
        }
        // A captive portal answers everything with an HTML login page and a 200. Both the
        // content type and the parse have to agree before any of it is written to disk.
        if (!/json/i.test(response.contentType)) {
          throw new Error(`expected JSON, got ${response.contentType || "no content type"}`);
        }
        return response.body;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < MAX_ATTEMPTS - 1) {
          await this.sleep(BACKOFF_MS[attempt] ?? 1000);
        }
      }
    }
    throw lastError;
  }
}

/** Parse and validate. Anything short of a complete, usable catalogue throws. */
export function parseCatalogue(raw: string): Catalogue {
  const parsed = JSON.parse(raw) as Partial<Catalogue>;
  if (!parsed || typeof parsed !== "object") throw new Error("catalogue is not an object");
  if (!Array.isArray(parsed.tracks)) throw new Error("catalogue has no tracks array");
  if (!Array.isArray(parsed.templates)) throw new Error("catalogue has no templates array");
  // A catalogue with nothing in it is treated as invalid, not as an empty gallery.
  if (parsed.tracks.length === 0) throw new Error("catalogue contains zero tracks");
  if (parsed.templates.length === 0) throw new Error("catalogue contains zero templates");

  for (const track of parsed.tracks) {
    if (!track.trackId || !track.contentHash || !track.beatMapPath) {
      throw new Error(`catalogue track ${track.trackId ?? "?"} is missing required fields`);
    }
  }
  for (const template of parsed.templates) {
    if (!template.id || !template.density || !template.idealItemRange) {
      throw new Error(`catalogue template ${template.id ?? "?"} is missing required fields`);
    }
  }

  return parsed as Catalogue;
}
