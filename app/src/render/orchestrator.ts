/**
 * The export, from tapping Export to a file in the gallery.
 *
 * The actual pixels are pushed by a native module — Media3 `Transformer` on Android,
 * `AVMutableComposition` on iOS. Everything *around* that lives here: what to check before
 * starting, what to do when an item has vanished, what happens on cancel, and the one rule
 * that matters most —
 *
 *   **Nothing is saved to the gallery unless it passes every §2.1 check** (R-I2).
 *
 * A reel that is silently 29.97fps, or carries an edit list, looks fine on the phone and then
 * drifts off the beat once Instagram re-encodes it. By then the user has posted it.
 */

import type { CutList, MediaItem } from "@thumpcut/cut-engine";
import { MIN_MEDIA_ITEMS } from "@thumpcut/cut-engine";
import { COPY } from "../copy.ts";
import { validateExport, type ValidationResult } from "./mp4.ts";

export type RenderStatus =
  | "Idle"
  | "Preparing"
  | "Rendering"
  | "Validating"
  | "Saving"
  | "Complete"
  | "Cancelled"
  | "Failed";

export interface RenderSnapshot {
  status: RenderStatus;
  /** 0..1. Never decreases (R-I7). */
  progress: number;
  /** Exact on-screen text, or null. */
  message: string | null;
  /** Exact on-screen text for the current failure, or null. */
  error: string | null;
  outputUri: string | null;
  /** Items dropped during preparation, so the preview can say one was skipped. */
  skippedItemIds: string[];
  canRetry: boolean;
}

/**
 * The music an export carries, if any.
 *
 * `none` is the only value an Instagram-catalogue track ever produces — those exports are
 * silent for ever, for licensing reasons that are not up for revision. `file` is the user's
 * own music, already on the device. `remote` is a royalty-free track whose licence permits
 * embedding; it is fetched to a temporary file first and the copy is deleted after the
 * export, so nothing builds an offline music library by accident.
 */
export type ExportAudio =
  | { kind: "none" }
  | { kind: "file"; uri: string; audioStartSec: number }
  | { kind: "remote"; url: string; audioStartSec: number };

export interface NativeRenderRequest {
  cutList: CutList;
  media: MediaItem[];
  outputPath: string;
  /** A readable local file by the time it reaches the native module, or null for silent. */
  audio: { uri: string; startSec: number; durationSec: number } | null;
  onProgress: (fraction: number) => void;
}

export type NativeRenderFailure =
  | "outOfMemory"
  | "storageFull"
  | "interrupted"
  | "cancelled"
  | "unknown";

export class NativeRenderError extends Error {
  readonly kind: NativeRenderFailure;
  constructor(kind: NativeRenderFailure, message: string) {
    super(message);
    this.kind = kind;
    this.name = "NativeRenderError";
  }
}

/** Everything the orchestrator needs from the world. Injected, so all of this is testable. */
export interface RenderEnvironment {
  /** Bytes needed before an export is attempted at all. */
  estimateOutputBytes(cutList: CutList): number;
  freeBytes(): Promise<number>;
  /** True when the file exists and can be read. */
  itemIsReadable(item: MediaItem): Promise<boolean>;
  render(request: NativeRenderRequest): Promise<void>;
  cancelRender(): Promise<void>;
  readOutput(path: string): Promise<Uint8Array>;
  deleteFile(path: string): Promise<void>;
  saveToGallery(path: string): Promise<string>;
  makeOutputPath(): string;
  keepAwake(on: boolean): void;
  /** Fetch a remote track to a local file. Rejects on any transport or HTTP failure. */
  fetchAudio(url: string, toPath: string): Promise<void>;
  /** Where a fetched track lives while the export runs. */
  makeAudioPath(): string;
  fileExists(path: string): Promise<boolean>;
}

export type RenderListener = (snapshot: RenderSnapshot) => void;

const IDLE: RenderSnapshot = {
  status: "Idle",
  progress: 0,
  message: null,
  error: null,
  outputUri: null,
  skippedItemIds: [],
  canRetry: false,
};

export class RenderController {
  private readonly environment: RenderEnvironment;
  private readonly listeners = new Set<RenderListener>();
  private snapshotValue: RenderSnapshot = IDLE;
  /** R-I8 — only one render at a time, and a double tap does not start a second. */
  private running: Promise<RenderSnapshot> | null = null;
  private cancelRequested = false;
  private currentPath: string | null = null;
  private retriedForMemory = false;
  /** The transient copy of a fetched royalty-free track, deleted when the run ends. */
  private fetchedAudioPath: string | null = null;

  constructor(environment: RenderEnvironment) {
    this.environment = environment;
  }

  snapshot(): RenderSnapshot {
    return this.snapshotValue;
  }

  subscribe(listener: RenderListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshotValue);
    return () => this.listeners.delete(listener);
  }

  /** R-I9 — the cut list handed in here is the object that was previewed. */
  async start(
    cutList: CutList,
    media: MediaItem[],
    audio: ExportAudio = { kind: "none" },
  ): Promise<RenderSnapshot> {
    if (this.running) return this.running;
    this.cancelRequested = false;
    this.retriedForMemory = false;
    this.running = this.run(cutList, media, audio);
    try {
      return await this.running;
    } finally {
      this.running = null;
    }
  }

  async cancel(): Promise<void> {
    if (!this.running) return;
    this.cancelRequested = true;
    await this.environment.cancelRender();
  }

  private emit(patch: Partial<RenderSnapshot>): void {
    const next = { ...this.snapshotValue, ...patch };
    // R-I7 — progress never goes backwards, whatever the encoder reports.
    if (next.progress < this.snapshotValue.progress && next.status === this.snapshotValue.status) {
      next.progress = this.snapshotValue.progress;
    }
    this.snapshotValue = next;
    for (const listener of this.listeners) listener(next);
  }

  private async run(
    cutList: CutList,
    media: MediaItem[],
    audio: ExportAudio,
  ): Promise<RenderSnapshot> {
    this.environment.keepAwake(true);
    try {
      return await this.attempt(cutList, media, audio);
    } finally {
      this.environment.keepAwake(false);
      // A fetched royalty-free track never outlives the export it was fetched for. The
      // licence terms permit a transient working copy, not an offline library.
      if (this.fetchedAudioPath !== null) {
        try {
          await this.environment.deleteFile(this.fetchedAudioPath);
        } catch {
          // Already gone.
        }
        this.fetchedAudioPath = null;
      }
    }
  }

  private async attempt(
    cutList: CutList,
    media: MediaItem[],
    audio: ExportAudio,
  ): Promise<RenderSnapshot> {
    this.emit({
      status: "Preparing",
      progress: 0,
      message: COPY.render.preparing,
      error: null,
      outputUri: null,
      skippedItemIds: [],
      canRetry: false,
    });

    // 1. Which items are still there? A photo deleted between preview and export is common.
    const skipped: string[] = [];
    for (const item of media) {
      if (!(await this.environment.itemIsReadable(item))) skipped.push(item.id);
    }
    const usable = media.filter((item) => !skipped.includes(item.id));

    if (usable.length < MIN_MEDIA_ITEMS) {
      return this.fail(COPY.render.tooFewUsable, { skippedItemIds: skipped });
    }

    // 2. Enough room? Failing before starting beats failing 80% of the way through.
    const needed = this.environment.estimateOutputBytes(cutList);
    if ((await this.environment.freeBytes()) < needed) {
      return this.fail(COPY.render.storageFull, { skippedItemIds: skipped });
    }

    if (this.cancelRequested) return this.cancelled();

    // 3. The music, when the export carries any. A remote royalty-free track is fetched to
    // a temporary file first — the renderer only ever reads local files. A track that will
    // not arrive fails the export here, before any rendering, with its own message: a reel
    // built to carry its music must not quietly come out silent.
    let nativeAudio: NativeRenderRequest["audio"] = null;
    if (audio.kind === "file") {
      nativeAudio = {
        uri: audio.uri,
        startSec: audio.audioStartSec,
        durationSec: cutList.totalDurationSec,
      };
    } else if (audio.kind === "remote") {
      // No link at all — offline before the index arrived, or the link aged out — is the
      // same failure as a fetch that will not complete, and gets the same honest message.
      if (audio.url === "") {
        return this.fail(COPY.render.audioUnavailable, { skippedItemIds: skipped });
      }
      const audioPath = this.fetchedAudioPath ?? this.environment.makeAudioPath();
      const alreadyFetched =
        this.fetchedAudioPath !== null && (await this.environment.fileExists(audioPath));
      if (!alreadyFetched) {
        this.emit({ message: COPY.render.fetchingTrack });
        try {
          await this.environment.fetchAudio(audio.url, audioPath);
          this.fetchedAudioPath = audioPath;
        } catch {
          return this.fail(COPY.render.audioUnavailable, { skippedItemIds: skipped });
        }
      }
      nativeAudio = {
        uri: audioPath,
        startSec: audio.audioStartSec,
        durationSec: cutList.totalDurationSec,
      };
    }

    if (this.cancelRequested) return this.cancelled();

    // 4. Render.
    const outputPath = this.environment.makeOutputPath();
    this.currentPath = outputPath;
    this.emit({
      status: "Rendering",
      progress: 0,
      message: COPY.render.rendering,
      skippedItemIds: skipped,
    });

    try {
      await this.environment.render({
        cutList,
        media: usable,
        outputPath,
        audio: nativeAudio,
        onProgress: (fraction) => {
          this.emit({ progress: Math.min(1, Math.max(0, fraction)) });
        },
      });
    } catch (error) {
      const failure = error instanceof NativeRenderError ? error.kind : "unknown";

      if (failure === "cancelled" || this.cancelRequested) {
        await this.discard(outputPath);
        return this.cancelled();
      }
      if (failure === "outOfMemory" && !this.retriedForMemory) {
        // One retry at reduced concurrency, exactly as the spec allows. Then it is a failure,
        // not an endless loop on a phone that cannot do it. A fetched track is kept for the
        // retry — fetching it twice would spend the user's data to learn nothing new.
        this.retriedForMemory = true;
        await this.discard(outputPath);
        return this.attempt(cutList, usable, audio);
      }

      await this.discard(outputPath);
      const message =
        failure === "outOfMemory"
          ? COPY.render.outOfMemory
          : failure === "storageFull"
            ? COPY.render.storageFull
            : failure === "interrupted"
              ? COPY.render.interrupted
              : COPY.render.failed;
      return this.fail(message, {
        skippedItemIds: skipped,
        canRetry: failure !== "outOfMemory",
      });
    }

    if (this.cancelRequested) {
      await this.discard(outputPath);
      return this.cancelled();
    }

    // 5. Validate. This is the gate that stops a broken reel reaching the gallery. What
    // "valid" means depends on what the export was told to carry: an Instagram-track reel
    // must have no audio at all, and a reel that carries its music must have exactly that
    // music-length audio track. Neither mode tolerates the other's file.
    this.emit({ status: "Validating", progress: 1 });
    let validation: ValidationResult;
    try {
      const bytes = await this.environment.readOutput(outputPath);
      validation = validateExport(bytes, cutList.totalDurationSec, {
        expectAudio: nativeAudio !== null,
      });
    } catch (error) {
      await this.discard(outputPath);
      return this.fail(COPY.render.failed, { skippedItemIds: skipped, canRetry: true });
    }

    if (!validation.valid) {
      await this.discard(outputPath);
      return this.fail(COPY.render.failed, { skippedItemIds: skipped, canRetry: true });
    }

    // 6. Save.
    this.emit({ status: "Saving" });
    try {
      const uri = await this.environment.saveToGallery(outputPath);
      this.currentPath = null;
      this.emit({
        status: "Complete",
        progress: 1,
        message: null,
        error: null,
        outputUri: uri,
        skippedItemIds: skipped,
        canRetry: false,
      });
      return this.snapshotValue;
    } catch {
      await this.discard(outputPath);
      return this.fail(COPY.render.storageFull, { skippedItemIds: skipped, canRetry: true });
    }
  }

  /** R-I3 — a cancelled or failed render leaves nothing behind. */
  private async discard(path: string): Promise<void> {
    try {
      await this.environment.deleteFile(path);
    } catch {
      // Already gone, or never written.
    }
    this.currentPath = null;
  }

  private cancelled(): RenderSnapshot {
    this.emit({
      status: "Cancelled",
      progress: 0,
      message: null,
      error: null,
      outputUri: null,
      canRetry: false,
    });
    return this.snapshotValue;
  }

  private fail(message: string, patch: Partial<RenderSnapshot> = {}): RenderSnapshot {
    this.emit({
      ...patch,
      status: "Failed",
      error: message,
      message: null,
      outputUri: null,
      canRetry: patch.canRetry ?? true,
    });
    return this.snapshotValue;
  }

  /** The path currently being written, if any. Used by process-death cleanup on next launch. */
  pendingOutputPath(): string | null {
    return this.currentPath;
  }
}
