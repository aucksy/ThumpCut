/**
 * The preview's audio layer, behind an interface.
 *
 * Mode A — a metronome click generated on the device — is what ships. Whether Meta's terms
 * allow proxying their audio for playback is unresolved, and Mode A needs no answer to that
 * question. When one arrives, a `StreamedAudio` can be dropped in against this same interface
 * without a single screen changing.
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
