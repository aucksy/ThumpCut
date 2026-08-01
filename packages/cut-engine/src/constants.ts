/**
 * Every number the cut engine treats as a rule.
 *
 * These are not tuning knobs. Each one is either a global invariant from
 * `specs/00-overview.md` §4 or a guardrail from `specs/02-cut-engine.md` §5, and changing one
 * changes a promise the product makes.
 */

/** G7 / C1 — no slide is ever shorter than this. Overrides every other rule. */
export const MIN_SLIDE_SEC = 0.35;

/** C2 — a run of very short slides longer than this reads as a strobe, not an edit. */
export const SHORT_SLIDE_SEC = 0.5;
export const MAX_CONSECUTIVE_SHORT_SLIDES = 4;

/** G8 / C3 — every cut boundary lands this close to a real beat. */
export const BEAT_SNAP_TOLERANCE_SEC = 0.05;

/** G4 — media item bounds. */
export const MIN_MEDIA_ITEMS = 3;
export const MAX_MEDIA_ITEMS = 30;

/** G5 — video clip bound. */
export const MAX_VIDEO_ITEMS = 15;

/** G6 — combined source video bound. */
export const MAX_TOTAL_VIDEO_SEC = 300;

/** A single picture held longer than this stops reading as an edit and starts reading as a stall. */
export const MAX_HOLD_SEC = 4;

/** An item may be repeated at most this many extra times to fill a long hold. */
export const MAX_ITEM_LOOPS = 2;

/** Longest reel. Reels are watched in a scroll; past this they stop being watched. */
export const DEFAULT_MAX_DURATION_SEC = 30;

/** Shortest reel. Three photos should not produce a three-second flash. */
export const MIN_REEL_SEC = 8;

/** Energy band thresholds — `specs/02-cut-engine.md` §3 step 4. */
export const BAND_LOW_MAX = 0.33;
export const BAND_MEDIUM_MAX = 0.66;
export const BAND_HIGH_MAX = 0.85;

/** Allocation weighting — `specs/02-cut-engine.md` §3 step 5. */
export const WEIGHT_BASE = 1;
export const WEIGHT_ENERGY_FACTOR = 1.5;

/** §4 — how a clip is fitted to its slot. */
export const SPEED_FIT_MIN_RATIO = 0.6;
export const SPANNING_MIN_RATIO = 3;
export const MAX_SPAN_SLOTS = 3;

/** §4 — where a clip starts when the user has not chosen. Skips the unsteady handheld start. */
export const DEFAULT_IN_POINT_RATIO = 0.15;
export const DEFAULT_IN_POINT_MAX_SEC = 1.0;

/** §6 — an in-point is never allowed within this distance of the clip's end. */
export const IN_POINT_TAIL_GUARD_SEC = 0.1;

/** §3 step 8 — how many times allocation retries with a coarser density before falling back. */
export const MAX_ALLOCATION_ATTEMPTS = 3;

/** Ken Burns scale range, as a fraction of the template's intensity. */
export const KEN_BURNS_BASE_SCALE = 1.0;
export const KEN_BURNS_MAX_INTENSITY_PCT = 25;

/** Floating-point slack. Beat times are stored to the microsecond. */
export const EPSILON = 1e-6;
