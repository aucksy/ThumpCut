# 02 — Cut engine

Pure TypeScript. **Zero runtime dependencies. No React Native imports.** Must run under plain
`node`. This is the core of the product and the easiest thing to make bulletproof — do it early
and lock it down.

---

## 1. Purpose and scope

Given a beat map, a list of media, and a template, produce a cut list: which item shows, from
when, for how long, and how each video clip is fitted to its slot.

**In scope:** window selection, bar grouping, energy-weighted allocation, density rules, video
fitting (trim, speed, freeze, spanning), guardrail enforcement.

**Out of scope:** decoding media, rendering, reading files, anything asynchronous. The engine
never touches the filesystem or the network.

---

## 2. Interfaces

```typescript
// BeatMap and Section are defined in specs/00-overview.md §3.1.
// That file is the single source of truth for this schema. Do not redefine it here.
// Import the type; never copy the shape.

interface MediaItem {
  id: string;
  uri: string;
  kind: "photo" | "video";
  width: number;
  height: number;
  rotationDeg: 0 | 90 | 180 | 270;
  durationSec?: number;        // videos only
  inPointSec?: number;         // user trim start, videos only
}

interface Template {
  id: string;
  name: string;
  previewVideoUrl: string;
  idealItemRange: [number, number];
  density: { low: number; medium: number; high: number; drop: number };  // beats per slide
  transition: "cut" | "crossfade" | "zoomPunch";
  photoMotion: { type: "none" | "kenBurns"; intensityPct: number };
  videoBehaviour: {
    allowSpeedFit: boolean;
    speedRange: [number, number];
    preferSpanning: boolean;
  };
}

interface Cut {
  mediaIndex: number;
  startSec: number;
  endSec: number;
  sourceInSec?: number;
  sourceOutSec?: number;
  speed?: number;
  freezeFromSec?: number;
  motion?: { type: "kenBurns"; fromScale: number; toScale: number };
  transitionIn: "cut" | "crossfade" | "zoomPunch";
}

interface CutList {
  totalDurationSec: number;
  audioStartSec: number;
  cuts: Cut[];
  itemsUsed: number;
  itemsDropped: number;
}

function buildCutList(
  beatMap: BeatMap,
  media: MediaItem[],
  template: Template,
  options?: { startSec?: number; maxDurationSec?: number }
): CutList;
```

---

## 3. Algorithm

1. **Choose the window.** Start at `options.startSec ?? beatMap.bestWindowStartSec`. Snap to
   the nearest value in `downbeatsSec`.
2. **Group beats into bars** using `downbeatsSec`.
3. **Score each bar** — mean of `energyCurve` across its beats.
4. **Band each bar** — `low` < 0.33, `medium` < 0.66, `high` < 0.85, `drop` ≥ 0.85. Look up
   `template.density[band]` for beats-per-slide.
5. **Allocate by weight** — `weight = 1 + 1.5 × energy`. Items per bar =
   `round(N × weight_bar / Σweights)`, clamped to what the density band permits.
6. **Emit cuts**, snapping every boundary to the nearest value in `beatsSec`.
7. **Fit each media item** to its slot per §4.
8. **Enforce guardrails** per §5. If any is violated, re-allocate with a coarser density and
   repeat, up to 3 attempts. If still violated, fall back to uniform allocation at one item per
   bar.

---

## 4. Video fitting

Let `slot` be the slot duration and `clip` the usable clip duration from `inPointSec` to the end.

| Condition | Behaviour |
|---|---|
| `clip >= slot` | Trim. `sourceIn = inPointSec`, `sourceOut = inPointSec + slot`, `speed = 1.0` |
| `clip >= slot × 0.6` and `allowSpeedFit` | Slow to fill. `speed = clip / slot`, clamped to `speedRange`. Uses the whole clip. |
| `clip < slot × 0.6` | Play at 1.0, then `freezeFromSec = inPointSec + clip`. Freeze fills the rest. |
| `clip > slot × 3` and `preferSpanning` | Assign to consecutive slots, continuing through the source rather than restarting |

**A slot is never left partially filled.** Trim, slow, freeze or span always covers it.

**Photos** get `motion` from `template.photoMotion`. **Videos never get `motion`** — a clip
already moves, and synthetic zoom on top looks wrong.

**In-point default:** `inPointSec = min(clipDuration × 0.15, 1.0)` when the user has not set one.
This skips the unsteady start typical of handheld footage.

---

## 5. Guardrails

Every one of these must hold in the returned cut list.

| ID | Rule |
|---|---|
| C1 | No slide shorter than 0.35s. **Overrides every other rule.** |
| C2 | No more than 4 consecutive slides shorter than 0.5s |
| C3 | Every `startSec` within 50ms of a value in `beatsSec` |
| C4 | Section changes land on a value in `downbeatsSec` |
| C5 | `cuts[i].endSec === cuts[i+1].startSec` — no gaps, no overlaps |
| C6 | `cuts[0].startSec === audioStartSec` |
| C7 | Identical inputs produce identical output, field for field |
| C8 | `speed` always within `template.videoBehaviour.speedRange` |
| C9 | `sourceOutSec - sourceInSec === (endSec - startSec) × speed` for trimmed clips |
| C10 | `itemsUsed + itemsDropped === media.length` |
| C11 | Photos never carry `speed`, `sourceInSec`, `sourceOutSec` or `freezeFromSec` |
| C12 | Videos never carry `motion` |

**Too few items:** extend holds. Loop an item only if a hold would exceed 4s, and never more
than twice.

**Too many items:** drop from the end. Never shorten below C1 to fit more in.

---

## 6. Edge cases

| Row | Handling |
|---|---|
| A — 0 media items | Throw `EmptyMediaError`. Caller must prevent this. |
| A — 1 or 2 items | Throw `InsufficientMediaError`. Minimum is 3. |
| A — exactly 3 items | Long holds, at most 2 loops each |
| A — exactly 30 items | All used if the window allows, else drop from the end |
| A — 31+ items | Use the first 30, set `itemsDropped` |
| A — `beatsSec` empty | Throw `InvalidBeatMapError` |
| A — `downbeatsSec` empty | Fall back to treating every 4th beat as a downbeat |
| A — `energyCurve` length mismatch | Throw `InvalidBeatMapError` |
| E — clip duration 0 or missing | Treat as a photo (single frame), do not crash |
| E — `inPointSec` beyond clip end | Clamp to `max(0, duration - 0.1)` |
| E — clip shorter than 0.35s | Freeze-extend to the minimum slide duration |
| A — `startSec` beyond track end | Clamp to the last downbeat that leaves at least 3 bars |
| A — window shorter than needed for 3 items | Extend the window to the end of the track |
| *Out of scope:* all lifecycle, permission, network, interop rows — this module is pure |

---

## 7. Error catalogue

These are thrown, not shown. The caller maps them to user messages.

| # | Error | Thrown when |
|---|---|---|
| C-E1 | `EmptyMediaError` | `media.length === 0` |
| C-E2 | `InsufficientMediaError` | `media.length < 3` |
| C-E3 | `InvalidBeatMapError` | `beatsSec` empty, not increasing, or `energyCurve` length mismatch |
| C-E4 | `TemplateIncompatibleError` | `density` values would make every slide shorter than 0.35s even at the coarsest fallback |

---

## 8. Tests and Definition of Done

**Required unit tests**
```
✓ every cut boundary within 50ms of a beat                              (C3)
✓ no slide shorter than 0.35s                                           (C1)
✓ no more than 4 consecutive sub-0.5s slides                            (C2)
✓ cuts tile the window with no gaps or overlaps                         (C5)
✓ identical inputs produce identical output                             (C7)
✓ high-energy bars receive more items than low-energy bars
✓ 3 items + 30s track: long holds, max 2 loops each
✓ 30 items + 15s track: itemsDropped > 0, no slide under minimum
✓ 31 items: itemsUsed === 30
✓ video shorter than slot: speed or freeze applied, slot fully covered
✓ video longer than slot: trimmed, C9 holds
✓ long video with preferSpanning: spans consecutive slots
✓ photo never carries speed or source fields                            (C11)
✓ video never carries motion                                            (C12)
✓ inPointSec beyond clip end is clamped
✓ empty downbeatsSec falls back to every 4th beat
✓ each of C-E1..C-E4 thrown under the right condition
```

**Required property tests**
```
✓ for any N in 3..40 and any template, C1 and C5 always hold
✓ for any random mix of photo/video with random durations 0..60s,
  every slot is fully covered and no guardrail is violated
✓ for any beat map from the factory's real output, C3 holds
```

**Definition of Done**
- [ ] All unit and property tests pass under plain `node`
- [ ] `npm run typecheck` passes with no `any` in the public interface
- [ ] Guardrails C1–C12 asserted in code, not only in tests
- [ ] Package has zero runtime dependencies — verified in `package.json`
- [ ] A fixture beat map from a real factory run is committed and used in tests

---

## 9. Regression contract

Nothing before this phase. **Everything after depends on this.** Any later change to the engine
must re-run the full test suite, including property tests, before it is considered done.

---

## 10. Quickstart (manual test)

There is no UI. Run `npm test` in `packages/cut-engine` and confirm all tests pass.

Then run `node scripts/preview-cutlist.js` with a real beat map and 8 fake items, and read the
printed table. Confirm by eye that:
1. Slide durations vary — they are not all the same
2. Shorter slides cluster where the energy numbers are higher
3. No duration is below 0.35
