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

export interface ShareSnapshot {
  status: ShareStatus;
  /** S1 — never true unless the platform said so. */
  instagramAvailable: boolean;
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
  saveToGallery(videoUri: string): Promise<void>;
  fileExists(videoUri: string): Promise<boolean>;
  openSettings(): Promise<void>;
}

export type ShareListener = (snapshot: ShareSnapshot) => void;

export class ShareController {
  private readonly environment: ShareEnvironment;
  private readonly listeners = new Set<ShareListener>();
  private snapshotValue: ShareSnapshot;
  /** S3 — one handoff or save at a time. The second waits rather than racing. */
  private busyWith: Promise<void> | null = null;

  constructor(environment: ShareEnvironment, videoUri: string | null) {
    this.environment = environment;
    this.snapshotValue = {
      status: "Ready",
      instagramAvailable: false,
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
    const available = await this.environment.isInstagramAvailable();

    const uri = this.snapshotValue.videoUri;
    if (uri && !(await this.environment.fileExists(uri))) {
      // I4 — the reel was cleared while the user was away.
      this.emit({
        status: "HandoffFailed",
        instagramAvailable: available,
        message: COPY.share.fileGone,
        videoUri: null,
      });
      return this.snapshotValue;
    }

    this.emit({
      status: available ? "Ready" : "InstagramUnavailable",
      instagramAvailable: available,
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
