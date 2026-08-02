/**
 * What the preview screen actually holds: the track, with the click underneath it.
 *
 * The preview plays the real recording. Streaming it takes a moment, and on a bad connection
 * it may never arrive at all, so this owns both and switches between them:
 *
 *   1. The click starts immediately. Nobody ever watches a silent ruler wondering whether the
 *      app is broken.
 *   2. The moment the recording is ready, the click stops and the music takes over **from
 *      wherever the click had reached** — no jump, no restart, the picture and the ruler carry
 *      straight on.
 *   3. If the recording never arrives, the click keeps the preview working and the screen
 *      says why. It is a fallback, never the default, and it never pretends to be the song.
 *
 * Both implement `PreviewAudio`, so the screen above this has no idea any of it is happening.
 */

import type { BeatMap } from "@thumpcut/cut-engine";
import type { PreviewAudio, PreviewAudioMode } from "./PreviewAudio.ts";
import type { ClickReason, PreviewAudioPlan } from "./source.ts";

export type { PreviewAudioMode };

export interface PreviewAudioStatus {
  mode: PreviewAudioMode;
  /** Why the click is playing. `null` while the recording is playing or still on its way. */
  reason: ClickReason | null;
}

/** What this needs from a streamed player. `StreamedAudio` is the only real one. */
export interface StreamPlayer extends PreviewAudio {
  readonly isReady: boolean;
}

/**
 * Both players are injected rather than imported.
 *
 * Not ceremony: the real ones need `expo-audio`, which needs a phone, and importing either of
 * them here would put this file — where every rule about *when* to play what lives — out of
 * reach of a test that runs under plain `node`. The app wires the real ones up in one place,
 * `app/preview.tsx`.
 */
export interface TrackPreviewAudioOptions {
  plan: PreviewAudioPlan;
  onStatus?: (status: PreviewAudioStatus) => void;
  createClick: () => PreviewAudio;
  createStream: (url: string) => StreamPlayer;
}

export class TrackPreviewAudio implements PreviewAudio {
  private readonly plan: PreviewAudioPlan;
  private readonly onStatus?: (status: PreviewAudioStatus) => void;
  private readonly click: PreviewAudio;
  private readonly makeStream: (url: string) => StreamPlayer;

  private stream: StreamPlayer | null = null;
  private mode: PreviewAudioMode = "click";
  private reason: ClickReason | null = null;
  private running = false;
  /** Bumped on every release, so a load that lands late cannot resurrect a dead player. */
  private generation = 0;

  constructor(options: TrackPreviewAudioOptions) {
    this.plan = options.plan;
    this.onStatus = options.onStatus;
    this.click = options.createClick();
    this.makeStream = options.createStream;

    if (this.plan.kind === "click") {
      this.mode = "click";
      this.reason = this.plan.reason;
    } else {
      this.mode = "connecting";
      this.reason = null;
    }
  }

  status(): PreviewAudioStatus {
    return { mode: this.mode, reason: this.reason };
  }

  async load(beatMap: BeatMap): Promise<void> {
    const generation = this.generation;

    // The click is always loaded, always. It is what covers the wait and what is left if the
    // recording never arrives.
    await this.click.load(beatMap);
    if (generation !== this.generation) return;

    if (this.plan.kind !== "stream") {
      this.announce("click", this.plan.reason);
      return;
    }

    const stream = this.makeStream(this.plan.url);
    this.stream = stream;
    this.announce("connecting", null);

    // Deliberately not awaited: the preview must start on the click straight away rather than
    // waiting on a network round trip before making any sound at all.
    void stream.load(beatMap).then(
      () => {
        if (generation !== this.generation || this.stream !== stream) return;
        this.handOverToStream();
      },
      () => {
        if (generation !== this.generation || this.stream !== stream) return;
        this.stream = null;
        try {
          stream.release();
        } catch {
          // Already gone.
        }
        this.announce("click", "unreachable");
      },
    );
  }

  play(fromSec: number): void {
    this.running = true;
    this.active().play(fromSec);
  }

  pause(): void {
    this.running = false;
    this.click.pause();
    this.stream?.pause();
  }

  getPositionSec(): number {
    return this.active().getPositionSec();
  }

  /** V6 — backgrounding always releases; foregrounding recreates. */
  release(): void {
    this.generation += 1;
    this.running = false;
    this.click.release();
    this.stream?.release();
    this.stream = null;
    // Back to where the constructor left it, so a foreground event re-runs the whole
    // sequence rather than resuming into a mode whose player no longer exists.
    if (this.plan.kind === "click") {
      this.mode = "click";
      this.reason = this.plan.reason;
    } else {
      this.mode = "connecting";
      this.reason = null;
    }
  }

  private active(): PreviewAudio {
    return this.mode === "streaming" && this.stream ? this.stream : this.click;
  }

  /** The switch from click to music, in place, with no gap the user can see. */
  private handOverToStream(): void {
    const stream = this.stream;
    if (!stream) return;

    const position = this.click.getPositionSec();
    this.click.pause();
    this.mode = "streaming";
    this.reason = null;
    if (this.running) stream.play(position);
    this.onStatus?.(this.status());
  }

  private announce(mode: PreviewAudioMode, reason: ClickReason | null): void {
    if (this.mode === mode && this.reason === reason) return;
    this.mode = mode;
    this.reason = reason;
    this.onStatus?.(this.status());
  }
}
