/**
 * Handing the finished reel to Instagram.
 *
 * The Instagram button is shown **only** when the platform says Instagram can accept the share
 * (S1). Not greyed out — absent. A disabled button is a promise the app cannot keep, and the
 * user has no way to know why.
 *
 * Coming back from Instagram is not an ending (S5). The user may have cancelled, changed their
 * mind, or run out of patience picking a track. The file stays, both buttons stay, and they
 * can try again.
 *
 * What this deliberately does **not** do: embed the real audio quietly in the export so
 * Instagram's fingerprinting swaps in its licensed copy. That is unlicensed synchronisation of
 * a commercial recording and the single largest legal exposure in the product. The MVP costs
 * the user one extra tap instead.
 */

import { COPY } from "../copy.ts";

export type ShareStatus =
  | "Ready"
  | "InstagramUnavailable"
  | "HandingOff"
  | "Returned"
  | "SaveSuccess"
  | "HandoffFailed";

/**
 * Which share paths a reel gets, decided by what is inside the file.
 *
 * `instagram` — the export is silent and was cut for a track in Instagram's catalogue;
 * Instagram applies the licensed recording after the handoff, so Instagram is the only
 * destination that makes the reel whole. `anywhere` — the music is in the file (the user's
 * own, or royalty-free), so YouTube and the system share sheet are offered instead. A silent
 * reel is never offered to YouTube: its editor would invite picking a *different* song, and
 * every cut would miss.
 */
export type ShareMode = "instagram" | "anywhere";

export interface ShareSnapshot {
  status: ShareStatus;
  mode: ShareMode;
  /** S1 — never true unless the platform said so. */
  instagramAvailable: boolean;
  /** Only ever true in `anywhere` mode, and only when the platform said so. */
  youtubeAvailable: boolean;
  /** The artist credit a royalty-free licence asks for, or null when none applies. */
  credit: string | null;
  /** Exact on-screen text, or null. */
  message: string | null;
  /** The finished file, or null once it has gone. */
  videoUri: string | null;
  busy: boolean;
}

export type SaveFailure = "permission" | "storage" | "unknown";

export class SaveError extends Error {
  readonly kind: SaveFailure;
  constructor(kind: SaveFailure, message: string) {
    super(message);
    this.kind = kind;
    this.name = "SaveError";
  }
}

export interface ShareEnvironment {
  isInstagramAvailable(): Promise<boolean>;
  shareToReels(videoUri: string): Promise<void>;
  isYouTubeAvailable(): Promise<boolean>;
  shareToYouTube(videoUri: string): Promise<void>;
  shareAnywhere(videoUri: string): Promise<void>;
  saveToGallery(videoUri: string): Promise<void>;
  fileExists(videoUri: string): Promise<boolean>;
  openSettings(): Promise<void>;
}

export type ShareListener = (snapshot: ShareSnapshot) => void;

export interface ShareOptions {
  mode: ShareMode;
  /** Shown under the buttons in `anywhere` mode — the credit a CC licence asks for. */
  credit?: string | null;
}

export class ShareController {
  private readonly environment: ShareEnvironment;
  private readonly listeners = new Set<ShareListener>();
  private snapshotValue: ShareSnapshot;
  /** S3 — one handoff or save at a time. The second waits rather than racing. */
  private busyWith: Promise<void> | null = null;

  constructor(
    environment: ShareEnvironment,
    videoUri: string | null,
    options: ShareOptions = { mode: "instagram" },
  ) {
    this.environment = environment;
    this.snapshotValue = {
      status: "Ready",
      mode: options.mode,
      instagramAvailable: false,
      youtubeAvailable: false,
      credit: options.credit ?? null,
      message: null,
      videoUri,
      busy: false,
    };
  }

  snapshot(): ShareSnapshot {
    return this.snapshotValue;
  }

  subscribe(listener: ShareListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshotValue);
    return () => this.listeners.delete(listener);
  }

  /** Called when the share screen appears, and again every time the app is resumed. */
  async refresh(): Promise<ShareSnapshot> {
    const anywhere = this.snapshotValue.mode === "anywhere";
    // Each mode checks only the apps it offers. In `anywhere` mode the Instagram button is
    // never drawn, so its availability is not asked for — and vice versa.
    const instagram = anywhere ? false : await this.environment.isInstagramAvailable();
    const youtube = anywhere ? await this.environment.isYouTubeAvailable() : false;

    const uri = this.snapshotValue.videoUri;
    if (uri && !(await this.environment.fileExists(uri))) {
      // I4 — the reel was cleared while the user was away.
      this.emit({
        status: "HandoffFailed",
        instagramAvailable: instagram,
        youtubeAvailable: youtube,
        message: COPY.share.fileGone,
        videoUri: null,
      });
      return this.snapshotValue;
    }

    this.emit({
      status: !anywhere && !instagram ? "InstagramUnavailable" : "Ready",
      instagramAvailable: instagram,
      youtubeAvailable: youtube,
      message: null,
    });
    return this.snapshotValue;
  }

  async shareToInstagram(): Promise<ShareSnapshot> {
    if (this.busyWith) {
      await this.busyWith;
      return this.snapshotValue;
    }
    const uri = this.snapshotValue.videoUri;
    if (!uri) {
      this.emit({ status: "HandoffFailed", message: COPY.share.fileGone });
      return this.snapshotValue;
    }
    if (!this.snapshotValue.instagramAvailable) {
      this.emit({ status: "InstagramUnavailable", message: null });
      return this.snapshotValue;
    }

    const task = (async () => {
      this.emit({ status: "HandingOff", busy: true, message: null });
      try {
        if (!(await this.environment.fileExists(uri))) {
          throw new SaveError("unknown", "the file is gone");
        }
        await this.environment.shareToReels(uri);
        // The user is now in Instagram. The file stays exactly where it is (S2).
        this.emit({ status: "Returned", busy: false });
      } catch (error) {
        // The resolve check can pass and the launch still throw — an old Instagram, a
        // revoked intent, a scheme that is not registered. Always caught, always offered a
        // way forward.
        const gone = error instanceof SaveError && error.kind === "unknown";
        this.emit({
          status: "HandoffFailed",
          busy: false,
          message: gone && !(await this.environment.fileExists(uri))
            ? COPY.share.fileGone
            : COPY.share.handoffFailed,
        });
      }
    })();

    this.busyWith = task;
    try {
      await task;
    } finally {
      this.busyWith = null;
    }
    return this.snapshotValue;
  }

  /** YouTube's upload flow. A vertical reel under three minutes becomes a Short there. */
  async shareToYouTube(): Promise<ShareSnapshot> {
    if (!this.snapshotValue.youtubeAvailable) return this.snapshotValue;
    return this.handOff(
      (uri) => this.environment.shareToYouTube(uri),
      COPY.share.youtubeFailed,
    );
  }

  /** The system share sheet — every app the phone has. */
  async shareAnywhere(): Promise<ShareSnapshot> {
    return this.handOff(
      (uri) => this.environment.shareAnywhere(uri),
      COPY.share.shareFailed,
    );
  }

  /** The shared handoff shape: busy in, Returned or a failure message out, file kept (S2). */
  private async handOff(
    action: (uri: string) => Promise<void>,
    failureMessage: string,
  ): Promise<ShareSnapshot> {
    if (this.busyWith) {
      await this.busyWith;
      return this.snapshotValue;
    }
    const uri = this.snapshotValue.videoUri;
    if (!uri) {
      this.emit({ status: "HandoffFailed", message: COPY.share.fileGone });
      return this.snapshotValue;
    }

    const task = (async () => {
      this.emit({ status: "HandingOff", busy: true, message: null });
      try {
        if (!(await this.environment.fileExists(uri))) {
          throw new SaveError("unknown", "the file is gone");
        }
        await action(uri);
        this.emit({ status: "Returned", busy: false });
      } catch {
        this.emit({
          status: "HandoffFailed",
          busy: false,
          message: (await this.environment.fileExists(uri))
            ? failureMessage
            : COPY.share.fileGone,
        });
      }
    })();

    this.busyWith = task;
    try {
      await task;
    } finally {
      this.busyWith = null;
    }
    return this.snapshotValue;
  }

  async saveToGallery(): Promise<ShareSnapshot> {
    if (this.busyWith) {
      await this.busyWith;
      return this.snapshotValue;
    }
    const uri = this.snapshotValue.videoUri;
    if (!uri) {
      this.emit({ status: "HandoffFailed", message: COPY.share.fileGone });
      return this.snapshotValue;
    }

    const task = (async () => {
      this.emit({ busy: true, message: null });
      try {
        await this.environment.saveToGallery(uri);
        this.emit({ status: "SaveSuccess", busy: false, message: COPY.share.saved });
      } catch (error) {
        const kind = error instanceof SaveError ? error.kind : "unknown";
        const message =
          kind === "permission"
            ? COPY.share.savePermissionDenied
            : kind === "storage"
              ? COPY.share.saveStorageFull
              : COPY.share.handoffFailed;
        this.emit({ status: "HandoffFailed", busy: false, message });
      }
    })();

    this.busyWith = task;
    try {
      await task;
    } finally {
      this.busyWith = null;
    }
    return this.snapshotValue;
  }

  async openSettings(): Promise<void> {
    await this.environment.openSettings();
  }

  private emit(patch: Partial<ShareSnapshot>): void {
    this.snapshotValue = { ...this.snapshotValue, ...patch };
    for (const listener of this.listeners) listener(this.snapshotValue);
  }
}
