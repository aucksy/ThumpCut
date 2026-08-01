/**
 * The cut engine.
 *
 * Given a beat map, a list of media and a template, decide which item shows, from when, for
 * how long, and how each clip is fitted to its slot.
 *
 * The one idea that makes an edit read as "cut" rather than "assembled": the picture does not
 * change at a fixed rate. It holds through calm passages and cuts rapidly at a drop, because
 * the beat map carries an energy curve and slides are allocated by weight.
 *
 * `specs/02-cut-engine.md` §3.
 */

import {
  assertUsableBeatMap,
  effectiveDownbeats,
  firstBeatIndexAtOrAfter,
  groupIntoBars,
  nearestBeatIndex,
  type Bar,
} from "./beatmap.ts";
import {
  BEAT_SNAP_TOLERANCE_SEC,
  DEFAULT_MAX_DURATION_SEC,
  EPSILON,
  MAX_ALLOCATION_ATTEMPTS,
  MAX_HOLD_SEC,
  MAX_ITEM_LOOPS,
  MAX_MEDIA_ITEMS,
  MAX_SPAN_SLOTS,
  MIN_MEDIA_ITEMS,
  MIN_REEL_SEC,
  MIN_SLIDE_SEC,
  SPANNING_MIN_RATIO,
  WEIGHT_BASE,
  WEIGHT_ENERGY_FACTOR,
} from "./constants.ts";
import {
  EmptyMediaError,
  InsufficientMediaError,
  TemplateIncompatibleError,
} from "./errors.ts";
import { fitToSlot, usableClipSeconds } from "./fit.ts";
import { assertCutList, checkCutList } from "./guardrails.ts";
import type { BeatMap, BuildOptions, Cut, CutList, MediaItem, Template } from "./types.ts";

/** One slot on the output timeline, expressed in beat indices. */
interface Slot {
  firstBeatIndex: number;
  endBeatIndex: number;
  startSec: number;
  endSec: number;
}

export function buildCutList(
  beatMap: BeatMap,
  media: MediaItem[],
  template: Template,
  options: BuildOptions = {},
): CutList {
  if (!Array.isArray(media) || media.length === 0) throw new EmptyMediaError();
  if (media.length < MIN_MEDIA_ITEMS) throw new InsufficientMediaError(media.length);
  assertUsableBeatMap(beatMap);

  // Over the cap, the extra items are dropped from the end. They are never squeezed in by
  // shortening slides below the minimum.
  const usable = media.slice(0, MAX_MEDIA_ITEMS);
  const droppedOverCap = media.length - usable.length;

  const typicalSlideSec = typicalSlideSeconds(beatMap, template);
  const spanBonus = spanBonusSlots(usable, template, typicalSlideSec);
  const slotsWanted = usable.length + spanBonus;
  const window = chooseWindow(beatMap, template, slotsWanted, options);

  const bars = groupIntoBars(beatMap, window.firstBeatIndex, window.endBeatIndex);
  if (bars.length === 0) {
    throw new TemplateIncompatibleError(
      template.id,
      "the chosen window contains no complete bar",
    );
  }

  const windowSeconds = window.endSec - window.startSec;
  if (windowSeconds < MIN_SLIDE_SEC * MIN_MEDIA_ITEMS) {
    throw new TemplateIncompatibleError(
      template.id,
      `only ${windowSeconds.toFixed(2)}s of track remains, which cannot hold three slides`,
    );
  }

  // Attempt the allocation at the template's density. Each retry halves the cut rate, which
  // is the only lever that can rescue a guardrail violation without breaking C1.
  let lastFailure = "";
  for (let attempt = 0; attempt < MAX_ALLOCATION_ATTEMPTS; attempt += 1) {
    const densityScale = 2 ** attempt;
    const candidate = attemptBuild(
      beatMap,
      usable,
      template,
      bars,
      window,
      densityScale,
      droppedOverCap,
      slotsWanted,
    );
    if (candidate === null) continue;

    const violations = checkCutList(candidate, beatMap, media, template);
    if (violations.length === 0) {
      assertCutList(candidate, beatMap, media, template);
      return candidate;
    }
    lastFailure = `${violations[0]?.guardrail}: ${violations[0]?.detail}`;
  }

  // Last resort: one slide per bar. The coarsest legal edit there is.
  const fallback = attemptBuild(
    beatMap,
    usable,
    template,
    bars,
    window,
    Number.POSITIVE_INFINITY,
    droppedOverCap,
    slotsWanted,
  );
  if (fallback !== null) {
    const violations = checkCutList(fallback, beatMap, media, template);
    if (violations.length === 0) {
      assertCutList(fallback, beatMap, media, template);
      return fallback;
    }
    lastFailure = `${violations[0]?.guardrail}: ${violations[0]?.detail}`;
  }

  throw new TemplateIncompatibleError(
    template.id,
    lastFailure || "no allocation satisfies the guardrails",
  );
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

interface Window {
  firstBeatIndex: number;
  endBeatIndex: number;
  startSec: number;
  endSec: number;
}

/** How long an average slide runs under this template on this track. */
function typicalSlideSeconds(beatMap: BeatMap, template: Template): number {
  const beats = beatMap.beatsSec;
  const intervals: number[] = [];
  for (let index = 1; index < beats.length; index += 1) {
    intervals.push((beats[index] as number) - (beats[index - 1] as number));
  }
  intervals.sort((a, b) => a - b);
  const medianInterval = intervals.length
    ? (intervals[Math.floor(intervals.length / 2)] as number)
    : 0.5;
  return Math.max(MIN_SLIDE_SEC, template.density.medium * medianInterval);
}

/**
 * Extra slots this selection needs so long clips can span.
 *
 * Without this the reel is exactly as long as it needs to be for one slot per item, spanning
 * would always steal another picture's slot, and the feature would never fire. A clip that
 * runs for a minute deserves more than half a second of the reel.
 */
function spanBonusSlots(
  media: MediaItem[],
  template: Template,
  typicalSlideSec: number,
): number {
  if (!template.videoBehaviour.preferSpanning) return 0;
  let bonus = 0;
  for (const item of media) {
    if (item.kind !== "video") continue;
    if (usableClipSeconds(item) >= typicalSlideSec * SPANNING_MIN_RATIO) {
      bonus += MAX_SPAN_SLOTS - 1;
    }
  }
  // Never let spanning more than double the reel: the pictures still have to be the point.
  return Math.min(bonus, media.length);
}

/**
 * How long this reel wants to be.
 *
 * Reel length follows the selection, not a fixed number. Thirty pictures at a fast template's
 * cutting rate need roughly fifteen seconds; three pictures need eight, and padding them out
 * to thirty would mean showing each one three times for no reason. Bounded at both ends: too
 * short is a flash, too long stops being watched.
 */
function desiredWindowSeconds(
  slotsWanted: number,
  typicalSlideSec: number,
  maxDurationSec: number,
): number {
  const wanted = slotsWanted * typicalSlideSec;
  return Math.min(Math.max(wanted, MIN_REEL_SEC), maxDurationSec);
}

function chooseWindow(
  beatMap: BeatMap,
  template: Template,
  slotsWanted: number,
  options: BuildOptions,
): Window {
  const beats = beatMap.beatsSec;
  const downbeats = effectiveDownbeats(beatMap);
  const beatsPerBar = beatMap.beatsPerBar > 0 ? beatMap.beatsPerBar : 4;
  const lastBeat = beats[beats.length - 1] as number;

  const maxDuration = options.maxDurationSec ?? DEFAULT_MAX_DURATION_SEC;
  const wantedSeconds = desiredWindowSeconds(
    slotsWanted,
    typicalSlideSeconds(beatMap, template),
    maxDuration,
  );

  const requested = options.startSec ?? beatMap.bestWindowStartSec ?? 0;
  const safeRequested = Number.isFinite(requested) ? requested : 0;

  // Snap to the nearest downbeat — a reel that starts mid-bar sounds like a mistake.
  let startSec = downbeats.length
    ? (downbeats[nearestBeatIndex(downbeats, safeRequested)] as number)
    : (beats[0] as number);

  // Pull the start back if starting there would not leave room for the whole reel. The
  // energetic part of the track is worth aiming for, but not at the price of dropping half
  // the user's pictures because only ten seconds of track remain after it.
  const latestUsefulStart = lastBeat - wantedSeconds;
  if (startSec > latestUsefulStart) {
    const candidates = downbeats.filter((value) => value <= latestUsefulStart + EPSILON);
    if (candidates.length > 0) {
      startSec = candidates[candidates.length - 1] as number;
    } else {
      // The whole track is shorter than the reel wants to be. Start at the beginning.
      startSec = beats[0] as number;
    }
  }

  // A start beyond the end of the track is clamped back to the last downbeat that still
  // leaves three bars to work with.
  const minimumTailBeats = beatsPerBar * MIN_MEDIA_ITEMS;
  const latestStart = beats[Math.max(0, beats.length - 1 - minimumTailBeats)] as number;
  if (startSec > latestStart) {
    const candidates = downbeats.filter((value) => value <= latestStart + EPSILON);
    startSec = candidates.length > 0
      ? (candidates[candidates.length - 1] as number)
      : (beats[0] as number);
  }

  const firstBeatIndex = firstBeatIndexAtOrAfter(beats, startSec - EPSILON);
  const snappedStart = beats[Math.min(firstBeatIndex, beats.length - 1)] as number;

  const limit = snappedStart + Math.max(MIN_SLIDE_SEC * MIN_MEDIA_ITEMS, wantedSeconds);

  // The window ends on a beat, so the last slide ends on the grid like every other one.
  let endBeatIndex = beats.length - 1;
  for (let index = firstBeatIndex + 1; index < beats.length; index += 1) {
    if ((beats[index] as number) > limit + EPSILON) {
      endBeatIndex = index - 1;
      break;
    }
    endBeatIndex = index;
  }
  if (endBeatIndex <= firstBeatIndex) {
    endBeatIndex = Math.min(beats.length - 1, firstBeatIndex + 1);
  }

  return {
    firstBeatIndex,
    endBeatIndex,
    startSec: snappedStart,
    endSec: beats[endBeatIndex] as number,
  };
}

// ---------------------------------------------------------------------------
// Allocation
// ---------------------------------------------------------------------------

/**
 * How many slides each bar gets.
 *
 * Two rules fight here and both matter. Density says how fast this template cuts in a bar of
 * this energy. Weight says a louder bar earns more of the pictures than a quiet one. Density
 * sets the ceiling; weight distributes what is left.
 */
function allocateSlides(
  bars: Bar[],
  template: Template,
  densityScale: number,
  slidesWanted: number,
): number[] {
  const capacity = bars.map((bar) => {
    const beatsPerSlide = Math.max(1, Math.ceil(template.density[bar.band] * densityScale));
    const beatCount = bar.endBeatIndex - bar.firstBeatIndex;
    return Math.max(1, Math.floor(beatCount / beatsPerSlide));
  });

  const totalCapacity = capacity.reduce((sum, value) => sum + value, 0);
  const target = Math.max(1, Math.min(slidesWanted, totalCapacity));

  const weights = bars.map((bar) => WEIGHT_BASE + WEIGHT_ENERGY_FACTOR * bar.energy);
  const weightSum = weights.reduce((sum, value) => sum + value, 0) || 1;

  const raw = weights.map((weight) => (target * weight) / weightSum);
  const slides = raw.map((value, index) =>
    Math.min(Math.max(0, Math.round(value)), capacity[index] as number),
  );

  // Rounding rarely lands on the target. Nudge the bars with the largest remainder first, so
  // the correction is deterministic and lands where it is least visible.
  let total = slides.reduce((sum, value) => sum + value, 0);

  while (total < target) {
    let best = -1;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < slides.length; index += 1) {
      if ((slides[index] as number) >= (capacity[index] as number)) continue;
      const score = (raw[index] as number) - (slides[index] as number);
      if (score > bestScore + 1e-9) {
        bestScore = score;
        best = index;
      }
    }
    if (best < 0) break;
    slides[best] = (slides[best] as number) + 1;
    total += 1;
  }

  while (total > target) {
    let best = -1;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let index = 0; index < slides.length; index += 1) {
      if ((slides[index] as number) <= 0) continue;
      const score = (raw[index] as number) - (slides[index] as number);
      if (score < bestScore - 1e-9) {
        bestScore = score;
        best = index;
      }
    }
    if (best < 0) break;
    slides[best] = (slides[best] as number) - 1;
    total -= 1;
  }

  // The first bar always starts a slide: C6 requires the first cut to sit at the window start.
  if ((slides[0] as number) === 0) {
    slides[0] = 1;
    for (let index = slides.length - 1; index > 0; index -= 1) {
      if ((slides[index] as number) > 0) {
        slides[index] = (slides[index] as number) - 1;
        break;
      }
    }
  }

  return slides;
}

/** Turn per-bar slide counts into slot spans, splitting each bar's beats evenly. */
function buildSlots(beatMap: BeatMap, bars: Bar[], slides: number[], window: Window): Slot[] {
  const beats = beatMap.beatsSec;
  const boundaries: number[] = [];

  for (let barIndex = 0; barIndex < bars.length; barIndex += 1) {
    const bar = bars[barIndex] as Bar;
    const count = slides[barIndex] as number;
    if (count <= 0) continue;

    const beatCount = bar.endBeatIndex - bar.firstBeatIndex;
    for (let slot = 0; slot < count; slot += 1) {
      const offset = Math.round((slot * beatCount) / count);
      const beatIndex = bar.firstBeatIndex + Math.min(offset, beatCount - 1);
      if (boundaries.length === 0 || beatIndex > (boundaries[boundaries.length - 1] as number)) {
        boundaries.push(beatIndex);
      }
    }
  }

  if (boundaries.length === 0) boundaries.push(window.firstBeatIndex);
  if ((boundaries[0] as number) !== window.firstBeatIndex) {
    boundaries[0] = window.firstBeatIndex;
  }

  snapBoundariesToSectionChanges(beatMap, boundaries, window);

  const slots: Slot[] = [];
  for (let index = 0; index < boundaries.length; index += 1) {
    const firstBeatIndex = boundaries[index] as number;
    const endBeatIndex = (boundaries[index + 1] ?? window.endBeatIndex) as number;
    if (endBeatIndex <= firstBeatIndex) continue;
    slots.push({
      firstBeatIndex,
      endBeatIndex,
      startSec: beats[firstBeatIndex] as number,
      endSec: beats[endBeatIndex] as number,
    });
  }
  return slots;
}

/**
 * Pull the nearest boundary onto each section change (C4).
 *
 * Cutting exactly where the music changes is most of what makes an edit feel deliberate, and
 * the Factory has already put section boundaries on downbeats. Boundaries are moved, never
 * added, so the slide count is unaffected.
 */
function snapBoundariesToSectionChanges(
  beatMap: BeatMap,
  boundaries: number[],
  window: Window,
): void {
  const sections = beatMap.sections ?? [];
  if (sections.length < 2 || boundaries.length < 2) return;

  const beats = beatMap.beatsSec;
  for (const section of sections) {
    if (section.startSec <= window.startSec + EPSILON) continue;
    if (section.startSec >= window.endSec - EPSILON) continue;

    const targetBeat = nearestBeatIndex(beats, section.startSec);
    if (Math.abs((beats[targetBeat] as number) - section.startSec) > BEAT_SNAP_TOLERANCE_SEC) {
      continue;
    }
    if (targetBeat <= window.firstBeatIndex || targetBeat >= window.endBeatIndex) continue;
    if (boundaries.includes(targetBeat)) continue;

    // Only ever move a boundary that is already the closest one, and only when moving it
    // keeps the sequence strictly increasing.
    let best = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let index = 1; index < boundaries.length; index += 1) {
      const distance = Math.abs((boundaries[index] as number) - targetBeat);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    }
    if (best < 1) continue;

    const previous = boundaries[best - 1] as number;
    const next = boundaries[best + 1];
    if (targetBeat <= previous) continue;
    if (next !== undefined && targetBeat >= next) continue;
    boundaries[best] = targetBeat;
  }
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

function attemptBuild(
  beatMap: BeatMap,
  usable: MediaItem[],
  template: Template,
  bars: Bar[],
  window: Window,
  densityScale: number,
  droppedOverCap: number,
  slotsWanted: number,
): CutList | null {
  const windowSeconds = window.endSec - window.startSec;

  // Enough slides that no single picture is held past the point it stops reading as an edit,
  // but never so many that an item has to appear more than three times.
  const holdFloor = Math.ceil(windowSeconds / MAX_HOLD_SEC);
  const loopCeiling = usable.length * (1 + MAX_ITEM_LOOPS);
  const slidesWanted = Math.min(Math.max(slotsWanted, holdFloor), loopCeiling);

  const slides = allocateSlides(bars, template, densityScale, slidesWanted);
  const slots = buildSlots(beatMap, bars, slides, window);
  if (slots.length === 0) return null;

  const cuts: Cut[] = [];
  const usedIndices = new Set<number>();
  let slideIndex = 0;

  for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
    const slot = slots[slotIndex] as Slot;
    const mediaIndex = slideIndex % usable.length;
    const item = usable[mediaIndex] as MediaItem;
    usedIndices.add(mediaIndex);

    const transitionIn = slotIndex === 0 ? "cut" : template.transition;
    const slotSeconds = slot.endSec - slot.startSec;

    // A long clip spans consecutive cuts, continuing through the source rather than
    // restarting. The cuts still land on beats; the scene underneath simply keeps running.
    //
    // Spanning is only taken when there is slack: one item covering three slots means two
    // fewer items make the reel, and the user's pictures matter more than the effect.
    const remainingSlots = slots.length - slotIndex;
    const itemsAfterThisOne = Math.max(0, usable.length - usedIndices.size);
    const maxSpanWithoutDropping = Math.max(1, remainingSlots - itemsAfterThisOne);
    const spanCount = Math.min(
      spanningSlots(item, slotSeconds, template),
      maxSpanWithoutDropping,
    );
    if (spanCount > 1) {
      const spanEnd = Math.min(slots.length, slotIndex + spanCount);
      let offset = 0;
      for (let spanIndex = slotIndex; spanIndex < spanEnd; spanIndex += 1) {
        const spanSlot = slots[spanIndex] as Slot;
        const fitted = fitToSlot(
          item,
          mediaIndex,
          spanSlot.startSec,
          spanSlot.endSec,
          template,
          cuts.length,
          spanIndex === 0 ? "cut" : template.transition,
          offset,
        );
        cuts.push(fitted.cut);
        offset += spanSlot.endSec - spanSlot.startSec;
      }
      slotIndex = spanEnd - 1;
      slideIndex += 1;
      continue;
    }

    const fitted = fitToSlot(
      item,
      mediaIndex,
      slot.startSec,
      slot.endSec,
      template,
      cuts.length,
      transitionIn,
    );
    cuts.push(fitted.cut);
    slideIndex += 1;
  }

  if (cuts.length === 0) return null;

  const first = cuts[0] as Cut;
  const last = cuts[cuts.length - 1] as Cut;

  return {
    totalDurationSec: round(last.endSec - first.startSec),
    audioStartSec: round(first.startSec),
    cuts,
    itemsUsed: usedIndices.size,
    itemsDropped: usable.length - usedIndices.size + droppedOverCap,
  };
}

/** How many consecutive slots this clip should span, or 1 for none. */
function spanningSlots(item: MediaItem, slotSeconds: number, template: Template): number {
  if (item.kind !== "video") return 1;
  if (!template.videoBehaviour.preferSpanning) return 1;
  if (slotSeconds <= EPSILON) return 1;

  const clip = usableClipSeconds(item);
  if (clip < slotSeconds * SPANNING_MIN_RATIO) return 1;
  return Math.min(MAX_SPAN_SLOTS, Math.floor(clip / slotSeconds));
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}
