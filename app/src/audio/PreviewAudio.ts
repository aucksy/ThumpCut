/**
 * The preview's audio layer, behind an interface.
 *
 * Two implementations exist, and one of them wraps the other:
 *
 *   · `StreamedAudio` plays the actual recording from a link the Factory published. This is
 *     what the preview plays.
 *   · `MetronomeAudio` clicks on every beat, generated on the device with nothing fetched.
 *     It covers the moment the recording takes to arrive, and it is what is left if the
 *     recording cannot be fetched at all.
 *   · `TrackPreviewAudio` owns both and switches between them. The screen holds only that.
 *
 * The interface is what the screen sees, and it has never changed — which is the whole reason
 * adding the real track needed no rewrite of the preview.
 */

import type { BeatMap } from "@thumpcut/cut-engine";

export interface PreviewAudio {
  load(beatMap: BeatMap): Promise<void>;
  play(fromSec: number): void;
  pause(): void;
  getPositionSec(): number;
  /** Release players and timers. Backgrounding must always release; foregrounding recreates. */
  release(): void;
}

/**
 * What is coming out of the speaker.
 *
 * `connecting` is the recording on its way with the click covering the gap. It says nothing on
 * screen on purpose — it resolves in a second or two either way, and a message that appears
 * and vanishes is worse than no message.
 */
export type PreviewAudioMode = "streaming" | "connecting" | "click";

/** What the scheduler decides to sound, and when. Pure data, so it can be tested. */
export interface ScheduledClick {
  atSec: number;
  kind: "beat" | "downbeat";
}

/**
 * The clicks that fall inside a window.
 *
 * Kept separate from anything that makes a noise so the timing rules can be tested under plain
 * `node`: every beat gets a click, downbeats get the stronger one, and a downbeat never also
 * produces a plain beat click on top of itself.
 */
export function clicksInWindow(
  beatMap: BeatMap,
  fromSec: number,
  toSec: number,
): ScheduledClick[] {
  const downbeats = new Set(beatMap.downbeatsSec.map((value) => value.toFixed(3)));
  const clicks: ScheduledClick[] = [];
  for (const atSec of beatMap.beatsSec) {
    if (atSec < fromSec - 1e-6 || atSec > toSec + 1e-6) continue;
    clicks.push({ atSec, kind: downbeats.has(atSec.toFixed(3)) ? "downbeat" : "beat" });
  }
  return clicks;
}

/** A silent implementation. Used when the device is muted, and by tests. */
export class SilentPreviewAudio implements PreviewAudio {
  private startedAt = 0;
  private offset = 0;
  private running = false;

  async load(): Promise<void> {
    // Nothing to load.
  }

  play(fromSec: number): void {
    this.offset = fromSec;
    this.startedAt = Date.now();
    this.running = true;
  }

  pause(): void {
    if (this.running) this.offset = this.getPositionSec();
    this.running = false;
  }

  getPositionSec(): number {
    if (!this.running) return this.offset;
    return this.offset + (Date.now() - this.startedAt) / 1000;
  }

  release(): void {
    this.running = false;
    this.offset = 0;
  }
}
