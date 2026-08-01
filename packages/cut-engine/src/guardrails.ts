/**
 * Guardrails C1–C12, asserted on every cut list the engine returns.
 *
 * A test proves a rule held once. An assertion proves it holds always. `checkCutList` is used
 * inside the retry loop, where a violation means "try a coarser density"; `assertCutList` is
 * the final gate, where a violation means the engine has a bug and must not pretend otherwise.
 *
 * `specs/02-cut-engine.md` §5.
 */

import {
  BEAT_SNAP_TOLERANCE_SEC,
  EPSILON,
  MAX_CONSECUTIVE_SHORT_SLIDES,
  MIN_SLIDE_SEC,
  SHORT_SLIDE_SEC,
} from "./constants.ts";
import { GuardrailViolation } from "./errors.ts";
import { isOnBeat, nearestBeatIndex } from "./beatmap.ts";
import type { BeatMap, CutList, MediaItem, Template } from "./types.ts";

export interface Violation {
  guardrail: string;
  detail: string;
}

/**
 * Check every guardrail and return what failed. Never throws.
 */
export function checkCutList(
  cutList: CutList,
  beatMap: BeatMap,
  media: MediaItem[],
  template: Template,
): Violation[] {
  const violations: Violation[] = [];
  const cuts = cutList.cuts;

  if (cuts.length === 0) {
    violations.push({ guardrail: "C5", detail: "the cut list is empty" });
    return violations;
  }

  // C1 — no slide shorter than 0.35s. Overrides everything else.
  for (const cut of cuts) {
    const duration = cut.endSec - cut.startSec;
    if (duration < MIN_SLIDE_SEC - EPSILON) {
      violations.push({
        guardrail: "C1",
        detail: `slide at ${cut.startSec.toFixed(3)}s lasts ${duration.toFixed(3)}s`,
      });
    }
  }

  // C2 — no more than four consecutive sub-0.5s slides.
  let run = 0;
  for (const cut of cuts) {
    if (cut.endSec - cut.startSec < SHORT_SLIDE_SEC - EPSILON) {
      run += 1;
      if (run > MAX_CONSECUTIVE_SHORT_SLIDES) {
        violations.push({
          guardrail: "C2",
          detail: `${run} consecutive slides under ${SHORT_SLIDE_SEC}s ending at ${cut.endSec.toFixed(3)}s`,
        });
        break;
      }
    } else {
      run = 0;
    }
  }

  // C3 — every cut starts within 50ms of a beat.
  for (const cut of cuts) {
    if (!isOnBeat(beatMap.beatsSec, cut.startSec, BEAT_SNAP_TOLERANCE_SEC)) {
      const index = nearestBeatIndex(beatMap.beatsSec, cut.startSec);
      const offset = Math.abs((beatMap.beatsSec[index] as number) - cut.startSec);
      violations.push({
        guardrail: "C3",
        detail: `cut at ${cut.startSec.toFixed(3)}s is ${(offset * 1000).toFixed(0)}ms off the nearest beat`,
      });
    }
  }

  // C4 — a cut that coincides with a section change lands on a downbeat.
  const downbeats = beatMap.downbeatsSec ?? [];
  if (downbeats.length > 0) {
    for (const section of beatMap.sections ?? []) {
      if (section.startSec <= cutList.audioStartSec + EPSILON) continue;
      if (section.startSec >= cutList.audioStartSec + cutList.totalDurationSec) continue;
      const coinciding = cuts.find(
        (cut) => Math.abs(cut.startSec - section.startSec) <= BEAT_SNAP_TOLERANCE_SEC,
      );
      if (coinciding && !isOnBeat(downbeats, coinciding.startSec, BEAT_SNAP_TOLERANCE_SEC)) {
        violations.push({
          guardrail: "C4",
          detail: `section change at ${section.startSec.toFixed(3)}s is cut off a downbeat`,
        });
      }
    }
  }

  // C5 — cuts tile the window: no gaps, no overlaps.
  for (let index = 0; index < cuts.length - 1; index += 1) {
    const current = cuts[index] as { endSec: number };
    const next = cuts[index + 1] as { startSec: number };
    if (Math.abs(current.endSec - next.startSec) > EPSILON) {
      violations.push({
        guardrail: "C5",
        detail: `gap or overlap between ${current.endSec.toFixed(3)}s and ${next.startSec.toFixed(3)}s`,
      });
    }
  }

  // C6 — the first cut starts where the audio starts.
  const first = cuts[0] as { startSec: number };
  if (Math.abs(first.startSec - cutList.audioStartSec) > EPSILON) {
    violations.push({
      guardrail: "C6",
      detail: `first cut at ${first.startSec.toFixed(3)}s but audio starts at ${cutList.audioStartSec.toFixed(3)}s`,
    });
  }

  const [minSpeed, maxSpeed] = template.videoBehaviour.speedRange;

  for (const cut of cuts) {
    const item = media[cut.mediaIndex];
    if (!item) {
      violations.push({
        guardrail: "C10",
        detail: `cut refers to media index ${cut.mediaIndex}, which does not exist`,
      });
      continue;
    }

    if (item.kind === "photo") {
      // C11 — photos never carry clip fields.
      if (
        cut.speed !== undefined ||
        cut.sourceInSec !== undefined ||
        cut.sourceOutSec !== undefined ||
        cut.freezeFromSec !== undefined
      ) {
        violations.push({
          guardrail: "C11",
          detail: `photo "${item.id}" carries clip fields`,
        });
      }
    } else {
      // C12 — videos never carry Ken Burns.
      if (cut.motion !== undefined) {
        violations.push({
          guardrail: "C12",
          detail: `clip "${item.id}" carries synthetic motion`,
        });
      }

      // C8 — speed stays inside the template's range. A speed of exactly 1 is always legal:
      // it means the clip is untouched, which no template forbids.
      if (cut.speed !== undefined && cut.speed !== 1) {
        if (cut.speed < minSpeed - EPSILON || cut.speed > maxSpeed + EPSILON) {
          violations.push({
            guardrail: "C8",
            detail: `speed ${cut.speed} is outside ${minSpeed}–${maxSpeed}`,
          });
        }
      }

      // C9 — a trimmed clip consumes exactly as much source as it plays. Frozen clips are
      // exempt by definition: the freeze covers the part the source could not.
      if (
        cut.freezeFromSec === undefined &&
        cut.sourceInSec !== undefined &&
        cut.sourceOutSec !== undefined &&
        cut.speed !== undefined
      ) {
        const consumed = cut.sourceOutSec - cut.sourceInSec;
        const expected = (cut.endSec - cut.startSec) * cut.speed;
        if (Math.abs(consumed - expected) > 1e-3) {
          violations.push({
            guardrail: "C9",
            detail: `clip "${item.id}" consumes ${consumed.toFixed(3)}s of source for a ${expected.toFixed(3)}s span`,
          });
        }
      }
    }
  }

  // C10 — every item is accounted for, exactly once.
  if (cutList.itemsUsed + cutList.itemsDropped !== media.length) {
    violations.push({
      guardrail: "C10",
      detail: `${cutList.itemsUsed} used + ${cutList.itemsDropped} dropped != ${media.length} supplied`,
    });
  }

  // Total duration matches the cuts that were emitted.
  const last = cuts[cuts.length - 1] as { endSec: number };
  const spanned = last.endSec - first.startSec;
  if (Math.abs(spanned - cutList.totalDurationSec) > 1e-3) {
    violations.push({
      guardrail: "C5",
      detail: `cuts span ${spanned.toFixed(3)}s but totalDurationSec is ${cutList.totalDurationSec.toFixed(3)}s`,
    });
  }

  return violations;
}

/** The final gate. A violation here is an engine bug and is thrown, not returned. */
export function assertCutList(
  cutList: CutList,
  beatMap: BeatMap,
  media: MediaItem[],
  template: Template,
): void {
  const violations = checkCutList(cutList, beatMap, media, template);
  if (violations.length > 0) {
    const worst = violations[0] as Violation;
    throw new GuardrailViolation(worst.guardrail, worst.detail);
  }
}
