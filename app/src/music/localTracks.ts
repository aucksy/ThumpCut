/**
 * The user's own music: scanning it, analysing it, and remembering the answers.
 *
 * This is the path that makes ThumpCut self-sufficient — no Meta account, no catalogue, no
 * network. The user picks a song already on their phone, the beat engine reads its grid on
 * the device, and from there the normal flow takes over: templates, preview with the music
 * playing, and an export that carries the music inside it.
 *
 * Everything here is pure logic against injected capabilities, so all of it runs under plain
 * `node`. The one heavy step — decoding and analysing a song — takes seconds, so it has a
 * progress state, and its result is cached against the file's identity: a song is analysed
 * once ever, not once per reel.
 */

import type { BeatMap } from "@thumpcut/cut-engine";
import { sha256HexOfString } from "@thumpcut/beat-engine";
import { COPY } from "../copy.ts";
import type { CatalogueTrack } from "../catalogue/types.ts";

/** One playable file found on the device. */
export interface LocalSong {
  id: string;
  uri: string;
  filename: string;
  durationSec: number;
  /** When the file last changed — part of the cache identity. */
  modifiedAt: number;
}

/** A song the beat engine has read: everything the normal flow needs to run. */
export interface AnalysedLocalTrack {
  track: CatalogueTrack;
  beatMap: BeatMap;
  /** The file itself — the preview plays it, and the export carries it. */
  fileUri: string;
}

export type LocalMusicStatus =
  | "PermissionUnknown"
  | "PermissionDenied"
  | "Scanning"
  | "Empty"
  | "Ready"
  | "Analysing"
  | "AnalysisFailed";

export interface LocalMusicSnapshot {
  status: LocalMusicStatus;
  songs: LocalSong[];
  /** The song being analysed, while one is. */
  analysingId: string | null;
  /** 0..1 through the analysis. */
  progress: number;
  /** Exact on-screen text, or null. */
  message: string | null;
}

/** Everything the controller needs from the device. Injected, so all of this is testable. */
export interface LocalMusicEnvironment {
  requestPermission(): Promise<"granted" | "denied">;
  /** Every audio file the media library will admit to. Order is the library's own. */
  listSongs(): Promise<LocalSong[]>;
  /** Title and artist as the file's tags declare them; nulls when untagged. */
  readMetadata(uri: string): Promise<{ title: string | null; artist: string | null }>;
  /** Decode to mono float32 at `sampleRate`, into a scratch file. Returns its path. */
  decodeToSamples(uri: string, sampleRate: number): Promise<string>;
  readSamples(path: string): Promise<Float32Array>;
  deleteFile(path: string): Promise<void>;
  /** The beat engine. Injected so tests need not spend seconds per case. */
  analyse(
    samples: Float32Array,
    sampleRate: number,
    info: { trackId: string; title: string; artist: string },
    onProgress: (fraction: number) => void,
  ): Promise<BeatMap>;
  readCachedBeatMap(key: string): Promise<BeatMap | null>;
  writeCachedBeatMap(key: string, beatMap: BeatMap): Promise<void>;
}

export const LOCAL_ANALYSIS_SAMPLE_RATE = 22050;

/** The cache identity of a file: same uri, same length, same mtime — same beat map. */
export function cacheKeyFor(song: Pick<LocalSong, "uri" | "durationSec" | "modifiedAt">): string {
  return sha256HexOfString(`${song.uri}|${song.durationSec}|${song.modifiedAt}`).slice(0, 32);
}

/** A stable track id derived from the same identity. */
export function trackIdFor(song: Pick<LocalSong, "uri" | "durationSec" | "modifiedAt">): string {
  return `local-${cacheKeyFor(song).slice(0, 12)}`;
}

/** The filename with its extension and any track-number prefix stripped: a usable title. */
export function titleFromFilename(filename: string): string {
  const stem = filename.replace(/\.[^.]+$/, "");
  const cleaned = stem.replace(/^\d{1,3}[\s.\-_]+/, "").replace(/[_]+/g, " ").trim();
  return cleaned || stem || "Untitled";
}

export type LocalMusicListener = (snapshot: LocalMusicSnapshot) => void;

export class LocalMusicController {
  private readonly environment: LocalMusicEnvironment;
  private readonly listeners = new Set<LocalMusicListener>();
  private snapshotValue: LocalMusicSnapshot = {
    status: "PermissionUnknown",
    songs: [],
    analysingId: null,
    progress: 0,
    message: null,
  };
  /** One analysis at a time; a second tap on the same song joins the first. */
  private analysing: Promise<AnalysedLocalTrack | null> | null = null;
  /** Bumped when the screen goes away, so a stale analysis cannot resurrect it. */
  private generation = 0;

  constructor(environment: LocalMusicEnvironment) {
    this.environment = environment;
  }

  snapshot(): LocalMusicSnapshot {
    return this.snapshotValue;
  }

  subscribe(listener: LocalMusicListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshotValue);
    return () => this.listeners.delete(listener);
  }

  /** Called when the screen appears: permission, then the scan. */
  async open(): Promise<LocalMusicSnapshot> {
    const permission = await this.environment.requestPermission();
    if (permission !== "granted") {
      this.emit({ status: "PermissionDenied", message: COPY.music.permissionDenied });
      return this.snapshotValue;
    }

    this.emit({ status: "Scanning", message: null });
    let songs: LocalSong[];
    try {
      songs = await this.environment.listSongs();
    } catch {
      songs = [];
    }
    // Anything shorter than the minimum a beat map accepts is left off the list entirely —
    // offering a song the analysis is certain to refuse is a promise the app cannot keep.
    const usable = songs.filter((song) => song.durationSec >= 10);
    this.emit({
      status: usable.length === 0 ? "Empty" : "Ready",
      songs: usable,
      message: usable.length === 0 ? COPY.music.empty : null,
    });
    return this.snapshotValue;
  }

  /**
   * Analyse one song, or serve the cached answer instantly. Returns everything the flow
   * needs, or null when the analysis failed or the screen moved on.
   */
  async pick(song: LocalSong): Promise<AnalysedLocalTrack | null> {
    if (this.analysing) return this.analysing;
    const generation = this.generation;

    const run = (async (): Promise<AnalysedLocalTrack | null> => {
      const key = cacheKeyFor(song);
      const trackId = trackIdFor(song);

      const cached = await this.environment.readCachedBeatMap(key);
      if (cached) {
        return this.assemble(song, cached);
      }

      this.emit({
        status: "Analysing",
        analysingId: song.id,
        progress: 0,
        message: COPY.music.analysing,
      });

      let scratchPath: string | null = null;
      try {
        const metadata = await this.environment.readMetadata(song.uri).catch(() => ({
          title: null,
          artist: null,
        }));
        const title = metadata.title?.trim() || titleFromFilename(song.filename);
        const artist = metadata.artist?.trim() || COPY.music.unknownArtist;

        scratchPath = await this.environment.decodeToSamples(
          song.uri,
          LOCAL_ANALYSIS_SAMPLE_RATE,
        );
        const samples = await this.environment.readSamples(scratchPath);

        const beatMap = await this.environment.analyse(
          samples,
          LOCAL_ANALYSIS_SAMPLE_RATE,
          { trackId, title, artist },
          (fraction) => {
            if (generation !== this.generation) return;
            this.emit({ progress: Math.min(1, Math.max(0, fraction)) });
          },
        );

        await this.environment.writeCachedBeatMap(key, beatMap);
        if (generation !== this.generation) return null;
        this.emit({ status: "Ready", analysingId: null, progress: 0, message: null });
        return this.assemble(song, beatMap);
      } catch {
        if (generation !== this.generation) return null;
        this.emit({
          status: "AnalysisFailed",
          analysingId: null,
          progress: 0,
          message: COPY.music.analysisFailed,
        });
        return null;
      } finally {
        // The decoded samples are scratch, and at 22kHz mono a song is tens of megabytes.
        if (scratchPath !== null) {
          try {
            await this.environment.deleteFile(scratchPath);
          } catch {
            // Already gone.
          }
        }
      }
    })();

    this.analysing = run;
    try {
      return await run;
    } finally {
      this.analysing = null;
    }
  }

  /** Clears the failure state so the list is usable again. */
  dismissFailure(): void {
    if (this.snapshotValue.status === "AnalysisFailed") {
      this.emit({ status: "Ready", message: null });
    }
  }

  /** The screen went away. A late analysis result is dropped rather than resurrecting it. */
  release(): void {
    this.generation += 1;
  }

  private assemble(song: LocalSong, beatMap: BeatMap): AnalysedLocalTrack {
    return {
      track: {
        trackId: beatMap.trackId,
        title: beatMap.title,
        artist: beatMap.artist,
        bpm: beatMap.bpm,
        durationSec: beatMap.durationSec,
        contentHash: beatMap.contentHash,
        beatMapPath: "",
        source: "local",
      },
      beatMap,
      fileUri: song.uri,
    };
  }

  private emit(patch: Partial<LocalMusicSnapshot>): void {
    this.snapshotValue = { ...this.snapshotValue, ...patch };
    for (const listener of this.listeners) listener(this.snapshotValue);
  }
}
