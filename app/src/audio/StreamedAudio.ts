/**
 * Mode B: the actual recording, streamed while the preview plays.
 *
 * Nothing is downloaded to the phone and nothing is kept. The player is handed an HTTPS URL
 * that the Factory published, and it streams it the same way a browser would. The app holds
 * no Instagram token and makes no API call — it cannot, and that is the point.
 *
 * Two things here are less obvious than they look:
 *
 *   · **Position comes from the player, not from a clock.** The beat ruler, the on-beat dot
 *     and the picture all follow `getPositionSec()`. If that were a wall clock it would drift
 *     away from the audio the moment the stream stalled, and the cuts would look wrong while
 *     actually being right. Asking the player where it is means they cannot disagree.
 *
 *   · **A seek is not instant.** `seekTo` resolves later, so between asking and arriving the
 *     player still reports the old position. The preview loops by watching the position reach
 *     the end of the window, so an honest answer during that gap would make it ask to loop
 *     again, and again. While a seek is in flight the target is reported instead.
 */

import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import type { BeatMap } from "@thumpcut/cut-engine";
import type { PreviewAudio } from "./PreviewAudio.ts";

/**
 * How long to wait for the first byte before giving up and letting the click carry the
 * preview. Long enough for a slow mobile connection to get going, short enough that nobody
 * sits watching a silent ruler wondering whether it is broken.
 */
export const LOAD_TIMEOUT_MS = 8000;

/** Statuses expo-audio reports when the player has given up. Matched loosely on purpose. */
const FAILED_STATE = /error|fail/i;

export type StreamedAudioFailure = "timeout" | "rejected";

export class StreamedAudio implements PreviewAudio {
  private player: AudioPlayer | null = null;
  private subscription: { remove(): void } | null = null;
  private timeoutTimer: ReturnType<typeof setTimeout> | null = null;

  private loaded = false;
  private running = false;
  /** Where a seek is heading, while it is still in flight. */
  private seekTarget: number | null = null;
  private lastKnownSec = 0;

  private readonly url: string;
  private readonly timeoutMs: number;

  constructor(url: string, timeoutMs: number = LOAD_TIMEOUT_MS) {
    this.url = url;
    this.timeoutMs = timeoutMs;
  }

  get isReady(): boolean {
    return this.loaded;
  }

  /**
   * Resolves when the recording is ready to play. Rejects on a timeout or a player error —
   * the caller is expected to fall back to the click, never to retry forever.
   */
  load(_beatMap?: BeatMap): Promise<void> {
    if (this.loaded) return Promise.resolve();

    return new Promise<void>((resolve, reject) => {
      const fail = (reason: StreamedAudioFailure) => {
        this.clearTimer();
        reject(new Error(reason));
      };

      // Play through the silent switch is deliberately not requested. If the user has
      // silenced their phone, they meant it — same rule as the click.
      void setAudioModeAsync({ playsInSilentMode: false, shouldPlayInBackground: false }).catch(
        () => {
          // An audio mode that will not set is not a reason to fail a preview.
        },
      );

      let player: AudioPlayer;
      try {
        player = createAudioPlayer({ uri: this.url });
      } catch {
        fail("rejected");
        return;
      }
      this.player = player;

      const settleLoaded = () => {
        this.clearTimer();
        this.loaded = true;
        resolve();
      };

      try {
        this.subscription = player.addListener("playbackStatusUpdate", (status) => {
          if (this.loaded) return;
          if (status.isLoaded) {
            settleLoaded();
            return;
          }
          if (FAILED_STATE.test(status.playbackState ?? "")) fail("rejected");
        });
      } catch {
        // An older player without events still reports `isLoaded` as a property; the timer
        // below is what settles it in that case.
      }

      // A player that was already loaded before the listener attached never fires an event.
      if (player.isLoaded) {
        settleLoaded();
        return;
      }

      this.timeoutTimer = setTimeout(() => {
        if (this.loaded) return;
        if (this.player?.isLoaded) {
          settleLoaded();
          return;
        }
        fail("timeout");
      }, this.timeoutMs);
    });
  }

  play(fromSec: number): void {
    const player = this.player;
    if (!player) return;
    this.running = true;
    this.seekTo(fromSec);
  }

  pause(): void {
    this.running = false;
    this.lastKnownSec = this.getPositionSec();
    try {
      this.player?.pause();
    } catch {
      // A player that will not pause is about to be released anyway.
    }
  }

  getPositionSec(): number {
    // While a seek is in flight the player still reports where it was, which would make the
    // preview think it had reached the end of the loop all over again.
    if (this.seekTarget !== null) return this.seekTarget;
    const current = this.player?.currentTime;
    if (typeof current === "number" && Number.isFinite(current)) {
      this.lastKnownSec = current;
    }
    return this.lastKnownSec;
  }

  /** V6 — backgrounding always releases; foregrounding recreates. */
  release(): void {
    this.clearTimer();
    this.running = false;
    this.loaded = false;
    this.seekTarget = null;
    try {
      this.subscription?.remove();
    } catch {
      // Already gone.
    }
    this.subscription = null;
    try {
      this.player?.remove();
    } catch {
      // Already gone.
    }
    this.player = null;
  }

  /**
   * Move to a position without starting playback — `play()` below is what starts it.
   *
   * Used when the recording finishes loading while the preview is paused: the player has to
   * agree with where the ruler and the picture already are, or the moment it becomes the one
   * being asked for the position, everything on screen jumps back to the top of the track.
   */
  seekTo(seconds: number): void {
    const player = this.player;
    if (!player) return;
    this.seekTarget = seconds;
    this.lastKnownSec = seconds;

    const start = () => {
      this.seekTarget = null;
      if (!this.running) return;
      try {
        player.play();
      } catch {
        // Nothing to do here: the composite is watching the position, and a player that
        // will not start looks the same to it as one that never loaded.
      }
    };

    try {
      const seek = player.seekTo(seconds);
      if (seek && typeof seek.then === "function") {
        seek.then(start, start);
      } else {
        start();
      }
    } catch {
      start();
    }
  }

  private clearTimer(): void {
    if (this.timeoutTimer !== null) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
  }
}
