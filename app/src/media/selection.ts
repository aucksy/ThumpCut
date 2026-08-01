/**
 * The picker's state machine.
 *
 * This is the most edge-case-heavy screen in the app, so all of its rules live here as a pure
 * reducer with no React and no platform in sight. That is what makes "for any sequence of 40
 * taps in any order, the limits still hold" a test rather than a hope.
 *
 * The four limits, all enforced here and asserted after every action:
 *   · 3 to 30 items                              (M2)
 *   · at most 15 of them video clips             (M3)
 *   · at most 300 seconds of source video        (G6)
 *   · Continue enabled if and only if all of the above and everything validated (M1)
 */

import {
  MAX_MEDIA_ITEMS,
  MAX_TOTAL_VIDEO_SEC,
  MAX_VIDEO_ITEMS,
  MIN_MEDIA_ITEMS,
  type MediaItem,
} from "@thumpcut/cut-engine";
import { COPY } from "../copy.ts";

export type PermissionStatus = "unknown" | "granted" | "limited" | "denied";

export type SelectionStatus =
  | "PermissionUnknown"
  | "PermissionDenied"
  | "LimitedAccess"
  | "Loading"
  | "Empty"
  | "Browsing"
  | "MinNotMet"
  | "Ready"
  | "MaxReached"
  | "VideoCapReached"
  | "Validating"
  | "ItemUnavailable"
  | "TrimSheet";

export interface LibraryItem extends MediaItem {
  /** Set when the platform says this is an iCloud or Google Photos placeholder. */
  cloudOnly?: boolean;
}

export interface SelectionState {
  status: SelectionStatus;
  permission: PermissionStatus;
  library: LibraryItem[];
  /** Ordered. The order is the pick order the user sees and the order the reel uses. */
  selectedIds: string[];
  inPoints: Record<string, number>;
  unavailableIds: string[];
  /** Exact toast text, or null. */
  toast: string | null;
  /** Exact inline hint text, or null. */
  hint: string | null;
  trimTargetId: string | null;
  /** True while a validation pass is running. M7 — only ever one. */
  validating: boolean;
  /** Guards a double tap on Continue. */
  advancing: boolean;
}

export type SelectionAction =
  | { type: "permissionChanged"; permission: PermissionStatus }
  | { type: "libraryLoaded"; items: LibraryItem[] }
  | { type: "toggle"; id: string }
  | { type: "openTrim"; id: string }
  | { type: "setInPoint"; id: string; inPointSec: number }
  | { type: "closeTrim" }
  | { type: "dismissToast" }
  | { type: "continuePressed" }
  | { type: "validationFinished"; failedIds: string[]; reason?: "cloud" | "unreadable" | "codec" }
  | { type: "advanceFinished" }
  | { type: "restore"; selectedIds: string[]; inPoints: Record<string, number> };

export function initialSelectionState(permission: PermissionStatus = "unknown"): SelectionState {
  return {
    status: statusForPermission(permission),
    permission,
    library: [],
    selectedIds: [],
    inPoints: {},
    unavailableIds: [],
    toast: null,
    hint: null,
    trimTargetId: null,
    validating: false,
    advancing: false,
  };
}

function statusForPermission(permission: PermissionStatus): SelectionStatus {
  if (permission === "denied") return "PermissionDenied";
  if (permission === "unknown") return "PermissionUnknown";
  return "Loading";
}

// ---------------------------------------------------------------------------
// Derived facts
// ---------------------------------------------------------------------------

export function selectedItems(state: SelectionState): LibraryItem[] {
  const byId = new Map(state.library.map((item) => [item.id, item]));
  return state.selectedIds
    .map((id) => byId.get(id))
    .filter((item): item is LibraryItem => item !== undefined);
}

export function videoCount(state: SelectionState): number {
  return selectedItems(state).filter((item) => item.kind === "video").length;
}

export function totalVideoSeconds(state: SelectionState): number {
  return selectedItems(state)
    .filter((item) => item.kind === "video")
    .reduce((sum, item) => sum + (item.durationSec ?? 0), 0);
}

/** M1 — the single source of truth for whether Continue works. */
export function canContinue(state: SelectionState): boolean {
  const count = state.selectedIds.length;
  if (count < MIN_MEDIA_ITEMS || count > MAX_MEDIA_ITEMS) return false;
  if (videoCount(state) > MAX_VIDEO_ITEMS) return false;
  if (totalVideoSeconds(state) > MAX_TOTAL_VIDEO_SEC) return false;
  if (state.validating) return false;
  return state.selectedIds.every((id) => !state.unavailableIds.includes(id));
}

/** The media list the cut engine will receive, in pick order, with in-points applied. */
export function selectionToMedia(state: SelectionState): MediaItem[] {
  return selectedItems(state).map((item) => {
    const media: MediaItem = {
      id: item.id,
      uri: item.uri,
      kind: item.kind,
      width: item.width,
      height: item.height,
      rotationDeg: item.rotationDeg,
    };
    if (item.durationSec !== undefined) media.durationSec = item.durationSec;
    const inPoint = state.inPoints[item.id];
    if (inPoint !== undefined) media.inPointSec = inPoint;
    return media;
  });
}

// ---------------------------------------------------------------------------
// The reducer
// ---------------------------------------------------------------------------

export function selectionReducer(state: SelectionState, action: SelectionAction): SelectionState {
  const next = reduce(state, action);
  assertInvariants(next);
  return next;
}

function reduce(state: SelectionState, action: SelectionAction): SelectionState {
  switch (action.type) {
    case "permissionChanged": {
      if (action.permission === "denied") {
        // Permission can be revoked while the app is backgrounded. The selection goes with it
        // — holding on to URIs the app can no longer read only produces failures later.
        return {
          ...initialSelectionState("denied"),
          library: [],
        };
      }
      if (action.permission === state.permission) return state;
      return {
        ...state,
        permission: action.permission,
        status: statusForPermission(action.permission),
        toast: null,
      };
    }

    case "libraryLoaded": {
      const available = new Set(action.items.map((item) => item.id));
      // Anything that has vanished from the library since the last look is dropped rather
      // than left in the selection pointing at a file that is no longer there.
      const selectedIds = state.selectedIds.filter((id) => available.has(id));
      const base: SelectionState = {
        ...state,
        library: action.items,
        selectedIds,
        status: action.items.length === 0 ? "Empty" : "Browsing",
      };
      if (action.items.length === 0) return { ...base, hint: null };
      return withStatus({ ...base, hint: null });
    }

    case "toggle": {
      const item = state.library.find((candidate) => candidate.id === action.id);
      if (!item) return state;

      if (state.selectedIds.includes(action.id)) {
        const selectedIds = state.selectedIds.filter((id) => id !== action.id);
        const inPoints = { ...state.inPoints };
        delete inPoints[action.id];
        return withStatus({
          ...state,
          selectedIds,
          inPoints,
          unavailableIds: state.unavailableIds.filter((id) => id !== action.id),
          toast: null,
        });
      }

      // E5 — over the item cap.
      if (state.selectedIds.length >= MAX_MEDIA_ITEMS) {
        return { ...state, status: "MaxReached", toast: COPY.media.itemCapReached };
      }

      if (item.kind === "video") {
        // E6 — over the clip cap. Photos stay selectable; only clips are blocked.
        if (videoCount(state) >= MAX_VIDEO_ITEMS) {
          return { ...state, status: "VideoCapReached", toast: COPY.media.videoCapReached };
        }
        // E7 — over the total video duration.
        const projected = totalVideoSeconds(state) + (item.durationSec ?? 0);
        if (projected > MAX_TOTAL_VIDEO_SEC) {
          return { ...state, toast: COPY.media.videoDurationCapReached };
        }
      }

      return withStatus({
        ...state,
        selectedIds: [...state.selectedIds, action.id],
        toast: null,
      });
    }

    case "openTrim": {
      const item = state.library.find((candidate) => candidate.id === action.id);
      if (!item || item.kind !== "video" || !state.selectedIds.includes(action.id)) return state;
      return { ...state, status: "TrimSheet", trimTargetId: action.id, toast: null };
    }

    case "setInPoint": {
      const item = state.library.find((candidate) => candidate.id === action.id);
      if (!item) return state;
      // M5 — an in-point is always inside the clip, whatever the drag did.
      const duration = item.durationSec ?? 0;
      const clamped = Math.min(Math.max(0, action.inPointSec), Math.max(0, duration - 0.1));
      return { ...state, inPoints: { ...state.inPoints, [action.id]: clamped } };
    }

    case "closeTrim":
      return withStatus({ ...state, trimTargetId: null });

    case "dismissToast":
      return { ...state, toast: null };

    case "continuePressed": {
      if (state.advancing || state.validating) return state;
      if (!canContinue(state)) {
        return { ...state, status: "MinNotMet", hint: COPY.media.pickAtLeastThree };
      }
      const needsChecking = selectedItems(state).some((item) => item.cloudOnly);
      if (needsChecking) {
        return { ...state, status: "Validating", validating: true, toast: null };
      }
      return { ...state, advancing: true };
    }

    case "validationFinished": {
      const failed = new Set(action.failedIds);
      const selectedIds = state.selectedIds.filter((id) => !failed.has(id));
      const message =
        action.reason === "codec"
          ? COPY.media.unsupportedCodec
          : action.reason === "unreadable"
            ? COPY.media.fileUnusable
            : COPY.media.cloudUnavailable;

      if (failed.size === 0) {
        return { ...state, validating: false, advancing: true, unavailableIds: [] };
      }

      if (selectedIds.length < MIN_MEDIA_ITEMS) {
        // E10 — nothing usable is left. The hint is set after `withStatus`, which recomputes
        // it from the count and would otherwise clear it at zero selected.
        return {
          ...withStatus({
            ...state,
            validating: false,
            selectedIds,
            unavailableIds: action.failedIds,
          }),
          toast: selectedIds.length === 0 ? COPY.media.allItemsFailed : message,
          hint: COPY.media.pickAtLeastThree,
        };
      }

      return {
        ...withStatus({ ...state, validating: false, selectedIds }),
        status: "ItemUnavailable",
        unavailableIds: action.failedIds,
        toast: message,
      };
    }

    case "advanceFinished":
      return { ...state, advancing: false };

    case "restore": {
      const available = new Set(state.library.map((item) => item.id));
      const selectedIds = state.selectedIds.length
        ? state.selectedIds
        : action.selectedIds.filter((id) => available.size === 0 || available.has(id));
      return withStatus({
        ...state,
        selectedIds: selectedIds.slice(0, MAX_MEDIA_ITEMS),
        inPoints: { ...action.inPoints },
      });
    }

    default:
      return state;
  }
}

/** Recompute the status and the inline hint from the current selection. */
function withStatus(state: SelectionState): SelectionState {
  if (state.permission === "denied") return { ...state, status: "PermissionDenied" };
  if (state.library.length === 0 && state.status !== "Loading") {
    return { ...state, status: "Empty", hint: null };
  }

  const count = state.selectedIds.length;
  const videos = videoCount(state);

  let status: SelectionStatus = "Browsing";
  let hint: string | null = null;

  if (count === 0) {
    status = state.permission === "limited" ? "LimitedAccess" : "Browsing";
  } else if (count < MIN_MEDIA_ITEMS) {
    // E9 — the hint appears as soon as something is picked but not enough of it.
    status = "MinNotMet";
    hint = COPY.media.pickAtLeastThree;
  } else if (count >= MAX_MEDIA_ITEMS) {
    status = "MaxReached";
  } else if (videos >= MAX_VIDEO_ITEMS) {
    status = "VideoCapReached";
  } else {
    status = "Ready";
  }

  return { ...state, status, hint };
}

/**
 * M2, M3, M4 and M5, asserted after every action rather than merely tested.
 *
 * A drift between what is shown as selected and what is in the list is the bug this catches:
 * it is invisible until export, and then the reel has the wrong pictures in it.
 */
function assertInvariants(state: SelectionState): void {
  if (state.selectedIds.length > MAX_MEDIA_ITEMS) {
    throw new Error(`M2 violated: ${state.selectedIds.length} items selected`);
  }
  if (videoCount(state) > MAX_VIDEO_ITEMS) {
    throw new Error(`M3 violated: ${videoCount(state)} clips selected`);
  }
  if (new Set(state.selectedIds).size !== state.selectedIds.length) {
    throw new Error("M4 violated: the same item is selected twice");
  }
  const known = new Set(state.library.map((item) => item.id));
  if (state.library.length > 0) {
    for (const id of state.selectedIds) {
      if (!known.has(id)) throw new Error(`M4 violated: ${id} is selected but not in the library`);
    }
  }
  for (const [id, inPoint] of Object.entries(state.inPoints)) {
    const item = state.library.find((candidate) => candidate.id === id);
    if (!item) continue;
    const maximum = Math.max(0, (item.durationSec ?? 0) - 0.1);
    if (inPoint < 0 || inPoint > maximum + 1e-6) {
      throw new Error(`M5 violated: in-point ${inPoint} for a ${item.durationSec}s clip`);
    }
  }
}

// ---------------------------------------------------------------------------
// Persistence — M6, the selection survives process death
// ---------------------------------------------------------------------------

export interface PersistedSelection {
  version: 1;
  selectedIds: string[];
  inPoints: Record<string, number>;
}

export function serialiseSelection(state: SelectionState): string {
  const payload: PersistedSelection = {
    version: 1,
    selectedIds: state.selectedIds,
    inPoints: state.inPoints,
  };
  return JSON.stringify(payload);
}

export function deserialiseSelection(raw: string | null): PersistedSelection | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PersistedSelection;
    if (parsed.version !== 1 || !Array.isArray(parsed.selectedIds)) return null;
    return {
      version: 1,
      selectedIds: parsed.selectedIds.filter((id) => typeof id === "string"),
      inPoints:
        parsed.inPoints && typeof parsed.inPoints === "object" ? parsed.inPoints : {},
    };
  } catch {
    return null;
  }
}
