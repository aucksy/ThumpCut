/**
 * Fitting one media item to one slot.
 *
 * This is the part competitors get wrong. A clip is not a photo with a play icon: it has a
 * duration that rarely matches its slot, so it is trimmed, slowed, frozen or spanned until it
 * covers the slot exactly. **A slot is never left partially filled.**
 *
 * `specs/02-cut-engine.md` §4.
 */

import {
  DEFAULT_IN_POINT_MAX_SEC,
  DEFAULT_IN_POINT_RATIO,
  EPSILON,
  IN_POINT_TAIL_GUARD_SEC,
  KEN_BURNS_BASE_SCALE,
  KEN_BURNS_MAX_INTENSITY_PCT,
  SPEED_FIT_MIN_RATIO,
} from "./constants.ts";
import type { Cut, KenBurns, MediaItem, Template, TransitionKind } from "./types.ts";

/** How a clip was made to fill its slot. Useful for tests and for the preview's labels. */
export type FitStrategy = "photo" | "trim" | "speed" | "freeze";

export interface FittedCut {
  cut: Cut;
  strategy: FitStrategy;
}

/**
 * The clip's usable duration: everything from the in-point to the end.
 *
 * A missing or zero duration is treated as a still frame rather than an error. A picker can
 * hand back a video whose duration has not been read yet, and crashing on it would break
 * invariant G10 — the app never dies on bad media.
 */
export function usableClipSeconds(item: MediaItem): number {
  const duration = item.durationSec ?? 0;
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return Math.max(0, duration - resolveInPoint(item));
}

/**
 * The in-point for a clip, clamped into the clip.
 *
 * With no user choice, start 15% in (capped at one second). Handheld footage almost always
 * begins with a lurch as the phone settles; skipping it costs nothing and looks deliberate.
 */
export function resolveInPoint(item: MediaItem): number {
  const duration = item.durationSec ?? 0;
  if (!Number.isFinite(duration) || duration <= 0) return 0;

  const maximum = Math.max(0, duration - IN_POINT_TAIL_GUARD_SEC);
  const requested = item.inPointSec;

  if (requested === undefined || !Number.isFinite(requested)) {
    const automatic = Math.min(duration * DEFAULT_IN_POINT_RATIO, DEFAULT_IN_POINT_MAX_SEC);
    return Math.min(Math.max(0, automatic), maximum);
  }
  return Math.min(Math.max(0, requested), maximum);
}

/** Ken Burns for a photo. Videos never get this — a clip already moves. */
export function photoMotion(template: Template, slideIndex: number): KenBurns | undefined {
  const motion = template.photoMotion;
  if (motion.type !== "kenBurns" || motion.intensityPct <= 0) return undefined;

  const intensity =
    Math.min(motion.intensityPct, KEN_BURNS_MAX_INTENSITY_PCT) / 100;
  // Alternate push-in and pull-out so a run of photos does not all drift the same way.
  const pushIn = slideIndex % 2 === 0;
  const from = pushIn ? KEN_BURNS_BASE_SCALE : KEN_BURNS_BASE_SCALE + intensity;
  const to = pushIn ? KEN_BURNS_BASE_SCALE + intensity : KEN_BURNS_BASE_SCALE;
  return { type: "kenBurns", fromScale: round(from), toScale: round(to) };
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

/**
 * Fit one item to one slot.
 *
 * @param spanOffsetSec How far into this item's own run the slot starts. Non-zero only when a
 * long clip spans several consecutive slots, so playback continues through the source instead
 * of restarting from the in-point at every cut.
 */
export function fitToSlot(
  item: MediaItem,
  mediaIndex: number,
  startSec: number,
  endSec: number,
  template: Template,
  slideIndex: number,
  transitionIn: TransitionKind,
  spanOffsetSec = 0,
): FittedCut {
  const slot = Math.max(0, endSec - startSec);

  if (item.kind === "photo") {
    const cut: Cut = {
      mediaIndex,
      startSec: round(startSec),
      endSec: round(endSec),
      transitionIn,
    };
    const motion = photoMotion(template, slideIndex);
    if (motion) cut.motion = motion;
    return { cut, strategy: "photo" };
  }

  const inPoint = resolveInPoint(item);
  const duration = item.durationSec ?? 0;
  const clipStart = inPoint + spanOffsetSec;
  const remaining = Math.max(0, duration - clipStart);

  // A clip with no readable duration behaves as a still. It never throws (G10).
  if (remaining <= EPSILON) {
    const cut: Cut = {
      mediaIndex,
      startSec: round(startSec),
      endSec: round(endSec),
      sourceInSec: round(Math.min(clipStart, Math.max(0, duration))),
      speed: 1,
      freezeFromSec: round(Math.min(clipStart, Math.max(0, duration))),
      transitionIn,
    };
    return { cut, strategy: "freeze" };
  }

  const [minSpeed, maxSpeed] = template.videoBehaviour.speedRange;

  // 1. Enough clip to cover the slot outright — trim it.
  if (remaining >= slot - EPSILON) {
    const cut: Cut = {
      mediaIndex,
      startSec: round(startSec),
      endSec: round(endSec),
      sourceInSec: round(clipStart),
      sourceOutSec: round(clipStart + slot),
      speed: 1,
      transitionIn,
    };
    return { cut, strategy: "trim" };
  }

  // 2. Nearly enough — slow it down so the whole clip fills the slot.
  if (
    template.videoBehaviour.allowSpeedFit &&
    remaining >= slot * SPEED_FIT_MIN_RATIO - EPSILON &&
    slot > EPSILON
  ) {
    const ideal = remaining / slot;
    // Clamped to exactly what the template permits, so C8 holds by construction.
    const low = Math.max(EPSILON, Math.min(minSpeed, maxSpeed));
    const high = Math.max(low, maxSpeed);
    const speed = clamp(ideal, low, high);
    // The slot is filled at whatever speed the template permits. If the clamp means the clip
    // still runs out, the leftover is frozen rather than left blank — a slot is never
    // partially filled.
    const consumed = slot * speed;
    const cut: Cut = {
      mediaIndex,
      startSec: round(startSec),
      endSec: round(endSec),
      sourceInSec: round(clipStart),
      sourceOutSec: round(clipStart + Math.min(consumed, remaining)),
      speed: round(speed),
      transitionIn,
    };
    if (consumed > remaining + EPSILON) {
      cut.freezeFromSec = round(clipStart + remaining);
    }
    return { cut, strategy: "speed" };
  }

  // 3. Far too short — play it at normal speed, then hold the last frame.
  const cut: Cut = {
    mediaIndex,
    startSec: round(startSec),
    endSec: round(endSec),
    sourceInSec: round(clipStart),
    sourceOutSec: round(clipStart + remaining),
    speed: 1,
    freezeFromSec: round(clipStart + remaining),
    transitionIn,
  };
  return { cut, strategy: "freeze" };
}
