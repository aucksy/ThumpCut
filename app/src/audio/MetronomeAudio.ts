/**
 * Mode A: the click track, generated on the device.
 *
 * A click on every beat, a stronger one on every downbeat. No music plays and no audio file is
 * fetched — the user hears the *timing*, and picks the actual song in Instagram afterwards.
 *
 * Two players are kept alive and re-seeked rather than created per beat: on a mid-range phone,
 * allocating a player 124 times a minute is how a preview starts stuttering.
 *
 * If the device is on silent the clicks are simply inaudible. Nothing is shown about it — the
 * click is a nicety, not a dependency, and the video and the beat ruler carry the preview on
 * their own.
 */

import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import type { BeatMap } from "@thumpcut/cut-engine";
import { BEAT_CLICK, DOWNBEAT_CLICK, clickDataUri } from "./clickSource.ts";
import { clicksInWindow, type PreviewAudio, type ScheduledClick } from "./PreviewAudio.ts";

/** How far ahead clicks are queued. Long enough to survive a stutter, short enough to seek. */
const LOOKAHEAD_SEC = 0.35;
const TICK_MS = 40;

export class MetronomeAudio implements PreviewAudio {
  private beatMap: BeatMap | null = null;
  private beatPlayer: AudioPlayer | null = null;
  private downbeatPlayer: AudioPlayer | null = null;

  private timer: ReturnType<typeof setInterval> | null = null;
  private startedAtMs = 0;
  private offsetSec = 0;
  private running = false;
  private pending: ScheduledClick[] = [];

  async load(beatMap: BeatMap): Promise<void> {
    this.beatMap = beatMap;
    if (this.beatPlayer && this.downbeatPlayer) return;

    try {
      // Play through the silent switch is deliberately NOT requested: if the user has silenced
      // their phone, they meant it.
      await setAudioModeAsync({ playsInSilentMode: false, shouldPlayInBackground: false });
    } catch {
      // An audio mode that will not set is not a reason to fail a preview.
    }

    this.beatPlayer = createAudioPlayer({ uri: clickDataUri(BEAT_CLICK) });
    this.downbeatPlayer = createAudioPlayer({ uri: clickDataUri(DOWNBEAT_CLICK) });
  }

  play(fromSec: number): void {
    if (!this.beatMap) return;
    this.offsetSec = fromSec;
    this.startedAtMs = Date.now();
    this.running = true;
    this.pending = [];
    this.startTimer();
  }

  pause(): void {
    if (this.running) this.offsetSec = this.getPositionSec();
    this.running = false;
    this.stopTimer();
  }

  getPositionSec(): number {
    if (!this.running) return this.offsetSec;
    return this.offsetSec + (Date.now() - this.startedAtMs) / 1000;
  }

  /** V6 — backgrounding always releases; foregrounding recreates. */
  release(): void {
    this.stopTimer();
    this.running = false;
    this.pending = [];
    try {
      this.beatPlayer?.remove();
      this.downbeatPlayer?.remove();
    } catch {
      // Already gone.
    }
    this.beatPlayer = null;
    this.downbeatPlayer = null;
  }

  private startTimer(): void {
    this.stopTimer();
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private tick(): void {
    if (!this.running || !this.beatMap) return;
    const position = this.getPositionSec();

    // Queue anything about to happen, then sound whatever is now due. Queuing ahead means a
    // dropped frame delays a click by a few milliseconds instead of losing it.
    const upcoming = clicksInWindow(this.beatMap, position, position + LOOKAHEAD_SEC);
    for (const click of upcoming) {
      if (!this.pending.some((queued) => queued.atSec === click.atSec)) {
        this.pending.push(click);
      }
    }

    const due = this.pending.filter((click) => click.atSec <= position + 0.005);
    this.pending = this.pending.filter((click) => click.atSec > position + 0.005);

    // Only the most recent due click is sounded. If the app was starved for half a second,
    // firing six clicks at once would sound like a fault, not a metronome.
    const latest = due[due.length - 1];
    if (latest) this.sound(latest.kind);
  }

  private sound(kind: "beat" | "downbeat"): void {
    const player = kind === "downbeat" ? this.downbeatPlayer : this.beatPlayer;
    if (!player) return;
    try {
      player.seekTo(0);
      player.play();
    } catch {
      // A click that will not play is never worth interrupting a preview for.
    }
  }
}
