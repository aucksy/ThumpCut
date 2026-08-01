/**
 * Phase 4 — media selection.
 *
 * Includes the property test the spec asks for: for any sequence of taps in any order, the
 * limits still hold. That is the one that catches the bug a hand-written case never would.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { MAX_MEDIA_ITEMS, MAX_VIDEO_ITEMS } from "@thumpcut/cut-engine";
import { COPY } from "../src/copy.ts";
import {
  canContinue,
  deserialiseSelection,
  initialSelectionState,
  selectionReducer,
  selectionToMedia,
  serialiseSelection,
  totalVideoSeconds,
  videoCount,
  type LibraryItem,
  type SelectionAction,
  type SelectionState,
} from "../src/media/selection.ts";

function library(photos: number, videos: number, clipSeconds = 10): LibraryItem[] {
  const items: LibraryItem[] = [];
  for (let index = 0; index < photos; index += 1) {
    items.push({
      id: `p${index}`,
      uri: `file:///p${index}.jpg`,
      kind: "photo",
      width: 3000,
      height: 4000,
      rotationDeg: 0,
    });
  }
  for (let index = 0; index < videos; index += 1) {
    items.push({
      id: `v${index}`,
      uri: `file:///v${index}.mp4`,
      kind: "video",
      width: 1920,
      height: 1080,
      rotationDeg: 0,
      durationSec: clipSeconds,
    });
  }
  return items;
}

function loaded(photos: number, videos: number, clipSeconds = 10): SelectionState {
  let state = initialSelectionState("granted");
  state = selectionReducer(state, {
    type: "libraryLoaded",
    items: library(photos, videos, clipSeconds),
  });
  return state;
}

function apply(state: SelectionState, actions: SelectionAction[]): SelectionState {
  return actions.reduce(selectionReducer, state);
}

function pick(state: SelectionState, ids: string[]): SelectionState {
  return apply(state, ids.map((id) => ({ type: "toggle", id }) as SelectionAction));
}

describe("permissions", () => {
  it("starts on the explainer when nothing has been asked yet", () => {
    assert.equal(initialSelectionState("unknown").status, "PermissionUnknown");
  });

  it("shows the exact denied text", () => {
    assert.equal(COPY.media.permissionDenied, "ThumpCut needs access to your photos to make a reel.");
  });

  it("revoking access while backgrounded clears the selection", () => {
    let state = pick(loaded(6, 0), ["p0", "p1", "p2"]);
    assert.equal(state.selectedIds.length, 3);

    state = selectionReducer(state, { type: "permissionChanged", permission: "denied" });
    assert.equal(state.status, "PermissionDenied");
    assert.deepEqual(state.selectedIds, []);
  });

  it("limited access is its own state, not a denial", () => {
    const state = selectionReducer(initialSelectionState("unknown"), {
      type: "permissionChanged",
      permission: "limited",
    });
    assert.equal(state.status, "Loading");
    assert.equal(state.permission, "limited");
  });
});

describe("the library", () => {
  it("no media at all is the empty state", () => {
    const state = selectionReducer(initialSelectionState("granted"), {
      type: "libraryLoaded",
      items: [],
    });
    assert.equal(state.status, "Empty");
  });

  it("an item that vanished from the library drops out of the selection", () => {
    let state = pick(loaded(6, 0), ["p0", "p1", "p2"]);
    state = selectionReducer(state, { type: "libraryLoaded", items: library(6, 0).slice(1) });
    assert.deepEqual(state.selectedIds, ["p1", "p2"]);
  });
});

describe("M1 — Continue is enabled exactly when it should be", () => {
  it("is disabled with nothing selected", () => {
    assert.equal(canContinue(loaded(6, 0)), false);
  });

  it("is disabled with two, and shows the exact hint", () => {
    const state = pick(loaded(6, 0), ["p0", "p1"]);
    assert.equal(canContinue(state), false);
    assert.equal(state.hint, "Pick at least 3 items.");
  });

  it("is enabled with exactly three", () => {
    assert.equal(canContinue(pick(loaded(6, 0), ["p0", "p1", "p2"])), true);
  });

  it("is enabled with exactly thirty", () => {
    const state = pick(
      loaded(30, 0),
      Array.from({ length: 30 }, (_, index) => `p${index}`),
    );
    assert.equal(state.selectedIds.length, 30);
    assert.equal(canContinue(state), true);
  });

  it("is disabled while validating", () => {
    let state = pick(loaded(6, 0), ["p0", "p1", "p2"]);
    state = { ...state, validating: true };
    assert.equal(canContinue(state), false);
  });

  it("is disabled when a selected item is unavailable", () => {
    let state = pick(loaded(6, 0), ["p0", "p1", "p2"]);
    state = { ...state, unavailableIds: ["p1"] };
    assert.equal(canContinue(state), false);
  });
});

describe("the caps", () => {
  it("a thirty-first tap is blocked with the exact toast", () => {
    let state = pick(
      loaded(40, 0),
      Array.from({ length: 30 }, (_, index) => `p${index}`),
    );
    state = selectionReducer(state, { type: "toggle", id: "p30" });

    assert.equal(state.selectedIds.length, 30);
    assert.equal(state.toast, "You can add up to 30 items.");
  });

  it("a sixteenth clip is blocked with the exact toast", () => {
    let state = pick(
      loaded(0, 20, 5),
      Array.from({ length: 15 }, (_, index) => `v${index}`),
    );
    state = selectionReducer(state, { type: "toggle", id: "v15" });

    assert.equal(videoCount(state), MAX_VIDEO_ITEMS);
    assert.equal(state.toast, "You can add up to 15 video clips.");
  });

  it("a photo is still selectable once the clip cap is reached", () => {
    let state = pick(
      loaded(5, 20, 5),
      Array.from({ length: 15 }, (_, index) => `v${index}`),
    );
    state = selectionReducer(state, { type: "toggle", id: "p0" });

    assert.ok(state.selectedIds.includes("p0"), "photos must stay selectable at the clip cap");
  });

  it("crossing five minutes of video is blocked with the exact toast", () => {
    // Twelve clips of 30 seconds is 360 seconds; the tenth crosses 300.
    let state = loaded(0, 12, 30);
    for (let index = 0; index < 12; index += 1) {
      state = selectionReducer(state, { type: "toggle", id: `v${index}` });
    }
    assert.ok(totalVideoSeconds(state) <= 300);
    assert.equal(state.toast, "That's a lot of video. Try removing a longer clip.");
  });

  it("deselecting frees a slot again", () => {
    let state = pick(
      loaded(40, 0),
      Array.from({ length: 30 }, (_, index) => `p${index}`),
    );
    state = selectionReducer(state, { type: "toggle", id: "p0" });
    state = selectionReducer(state, { type: "toggle", id: "p30" });
    assert.ok(state.selectedIds.includes("p30"));
    assert.equal(state.selectedIds.length, 30);
  });
});

describe("pick order", () => {
  it("is the order the user tapped, and renumbers after a removal", () => {
    let state = pick(loaded(6, 0), ["p2", "p0", "p4"]);
    assert.deepEqual(state.selectedIds, ["p2", "p0", "p4"]);
    state = selectionReducer(state, { type: "toggle", id: "p0" });
    assert.deepEqual(state.selectedIds, ["p2", "p4"]);
  });

  it("the media handed to the cut engine follows the pick order", () => {
    const state = pick(loaded(6, 0), ["p3", "p1", "p5"]);
    assert.deepEqual(
      selectionToMedia(state).map((item) => item.id),
      ["p3", "p1", "p5"],
    );
  });
});

describe("M5 — the trim in-point stays inside the clip", () => {
  it("is clamped past the end", () => {
    let state = pick(loaded(2, 2, 8), ["v0"]);
    state = selectionReducer(state, { type: "setInPoint", id: "v0", inPointSec: 99 });
    assert.equal(state.inPoints["v0"], 7.9);
  });

  it("is clamped below zero", () => {
    let state = pick(loaded(2, 2, 8), ["v0"]);
    state = selectionReducer(state, { type: "setInPoint", id: "v0", inPointSec: -5 });
    assert.equal(state.inPoints["v0"], 0);
  });

  it("holds for every drag position across the clip", () => {
    let state = pick(loaded(2, 2, 8), ["v0"]);
    for (let position = -20; position <= 40; position += 0.25) {
      state = selectionReducer(state, { type: "setInPoint", id: "v0", inPointSec: position });
      const value = state.inPoints["v0"] as number;
      assert.ok(value >= 0 && value <= 7.9, `in-point ${value} for a 8s clip`);
    }
  });

  it("reaches the cut engine on the selected clip", () => {
    let state = pick(loaded(2, 2, 8), ["p0", "v0", "p1"]);
    state = selectionReducer(state, { type: "setInPoint", id: "v0", inPointSec: 2.5 });
    const media = selectionToMedia(state);
    assert.equal(media.find((item) => item.id === "v0")?.inPointSec, 2.5);
  });

  it("the trim sheet only opens on a selected clip", () => {
    const state = loaded(2, 2, 8);
    assert.equal(selectionReducer(state, { type: "openTrim", id: "v0" }).status, "Browsing");
    const picked = pick(state, ["v0"]);
    assert.equal(selectionReducer(picked, { type: "openTrim", id: "v0" }).status, "TrimSheet");
  });

  it("the trim sheet never opens on a photo", () => {
    const state = pick(loaded(2, 2, 8), ["p0"]);
    assert.notEqual(selectionReducer(state, { type: "openTrim", id: "p0" }).status, "TrimSheet");
  });
});

describe("validation", () => {
  it("a cloud item sends the flow through Validating", () => {
    let state = loaded(6, 0);
    state = {
      ...state,
      library: state.library.map((item, index) =>
        index === 0 ? { ...item, cloudOnly: true } : item,
      ),
    };
    state = pick(state, ["p0", "p1", "p2"]);
    state = selectionReducer(state, { type: "continuePressed" });
    assert.equal(state.status, "Validating");
    assert.equal(state.validating, true);
  });

  it("a failure deselects the item and shows the exact text", () => {
    let state = pick(loaded(6, 0), ["p0", "p1", "p2", "p3"]);
    state = { ...state, validating: true, status: "Validating" };
    state = selectionReducer(state, { type: "validationFinished", failedIds: ["p1"] });

    assert.equal(state.status, "ItemUnavailable");
    assert.equal(state.toast, "This item couldn't be downloaded and was skipped.");
    assert.equal(state.selectedIds.includes("p1"), false);
    assert.equal(state.selectedIds.length, 3);
  });

  it("an unreadable file gets its own wording", () => {
    let state = pick(loaded(6, 0), ["p0", "p1", "p2", "p3"]);
    state = { ...state, validating: true };
    state = selectionReducer(state, {
      type: "validationFinished",
      failedIds: ["p1"],
      reason: "unreadable",
    });
    assert.equal(state.toast, "This file can't be used and was skipped.");
  });

  it("an unsupported codec gets its own wording", () => {
    let state = pick(loaded(6, 2, 8), ["p0", "p1", "p2", "v0"]);
    state = { ...state, validating: true };
    state = selectionReducer(state, {
      type: "validationFinished",
      failedIds: ["v0"],
      reason: "codec",
    });
    assert.equal(state.toast, "This video format isn't supported and was skipped.");
  });

  it("losing everything shows the exact all-failed text", () => {
    let state = pick(loaded(6, 0), ["p0", "p1", "p2"]);
    state = { ...state, validating: true };
    state = selectionReducer(state, {
      type: "validationFinished",
      failedIds: ["p0", "p1", "p2"],
    });
    assert.equal(state.toast, "None of those items could be used. Try picking different ones.");
    assert.equal(state.hint, "Pick at least 3 items.");
  });

  it("everything passing advances", () => {
    let state = pick(loaded(6, 0), ["p0", "p1", "p2"]);
    state = { ...state, validating: true };
    state = selectionReducer(state, { type: "validationFinished", failedIds: [] });
    assert.equal(state.advancing, true);
  });
});

describe("double taps", () => {
  it("Continue pressed twice advances once", () => {
    let state = pick(loaded(6, 0), ["p0", "p1", "p2"]);
    state = selectionReducer(state, { type: "continuePressed" });
    assert.equal(state.advancing, true);

    const again = selectionReducer(state, { type: "continuePressed" });
    assert.equal(again, state, "the second press must change nothing");
  });
});

describe("M6 — the selection survives process death", () => {
  it("round trips through serialisation", () => {
    let state = pick(loaded(4, 2, 9), ["p0", "v0", "p2"]);
    state = selectionReducer(state, { type: "setInPoint", id: "v0", inPointSec: 1.5 });

    const restored = deserialiseSelection(serialiseSelection(state));
    assert.deepEqual(restored?.selectedIds, ["p0", "v0", "p2"]);
    assert.equal(restored?.inPoints["v0"], 1.5);
  });

  it("restores into a fresh state", () => {
    let fresh = loaded(4, 2, 9);
    fresh = selectionReducer(fresh, {
      type: "restore",
      selectedIds: ["p0", "v0", "p2"],
      inPoints: { v0: 1.5 },
    });
    assert.deepEqual(fresh.selectedIds, ["p0", "v0", "p2"]);
    assert.equal(canContinue(fresh), true);
  });

  it("ignores nonsense rather than crashing", () => {
    assert.equal(deserialiseSelection(null), null);
    assert.equal(deserialiseSelection("not json"), null);
    assert.equal(deserialiseSelection('{"version":2}'), null);
  });
});

describe("property — the limits hold for any sequence of taps", () => {
  it("across 40 random tap sequences of 40 taps each", () => {
    const items = library(20, 20, 25);
    let seed = 12345;
    const random = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };

    for (let run = 0; run < 40; run += 1) {
      let state = selectionReducer(initialSelectionState("granted"), {
        type: "libraryLoaded",
        items,
      });

      for (let tap = 0; tap < 40; tap += 1) {
        const item = items[Math.floor(random() * items.length)] as LibraryItem;
        state = selectionReducer(state, { type: "toggle", id: item.id });

        assert.ok(state.selectedIds.length <= MAX_MEDIA_ITEMS, "M2");
        assert.ok(videoCount(state) <= MAX_VIDEO_ITEMS, "M3");
        assert.ok(totalVideoSeconds(state) <= 300, "G6");
        assert.equal(new Set(state.selectedIds).size, state.selectedIds.length, "M4");
      }
    }
  });
});
