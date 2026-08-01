/** The error catalogue, C-E1 to C-E4. Each one fires under its own condition and no other. */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  EmptyMediaError,
  InsufficientMediaError,
  InvalidBeatMapError,
  TemplateIncompatibleError,
  buildCutList,
} from "../src/index.ts";
import { loadBeatMap, photo, photos, templateById } from "./helpers.ts";

const DRIVE = () => loadBeatMap("beatmap-drive-124");
const TEMPLATE = () => templateById("night-drive");

describe("C-E1 EmptyMediaError", () => {
  it("fires on an empty list", () => {
    assert.throws(() => buildCutList(DRIVE(), [], TEMPLATE()), EmptyMediaError);
  });

  it("carries its spec code", () => {
    try {
      buildCutList(DRIVE(), [], TEMPLATE());
      assert.fail("should have thrown");
    } catch (error) {
      assert.equal((error as EmptyMediaError).code, "C-E1");
    }
  });
});

describe("C-E2 InsufficientMediaError", () => {
  for (const count of [1, 2]) {
    it(`fires on ${count} item(s)`, () => {
      assert.throws(() => buildCutList(DRIVE(), photos(count), TEMPLATE()), InsufficientMediaError);
    });
  }

  it("does not fire on three", () => {
    assert.doesNotThrow(() => buildCutList(DRIVE(), photos(3), TEMPLATE()));
  });

  it("carries its spec code", () => {
    try {
      buildCutList(DRIVE(), [photo("a")], TEMPLATE());
      assert.fail("should have thrown");
    } catch (error) {
      assert.equal((error as InsufficientMediaError).code, "C-E2");
    }
  });
});

describe("C-E3 InvalidBeatMapError", () => {
  it("fires when there are no beats", () => {
    const beatMap = { ...DRIVE(), beatsSec: [], energyCurve: [] };
    assert.throws(() => buildCutList(beatMap, photos(5), TEMPLATE()), InvalidBeatMapError);
  });

  it("fires when the beats go backwards", () => {
    const beatMap = DRIVE();
    beatMap.beatsSec[10] = 0.1;
    assert.throws(() => buildCutList(beatMap, photos(5), TEMPLATE()), /not strictly increasing/);
  });

  it("fires when two beats share a timestamp", () => {
    const beatMap = DRIVE();
    beatMap.beatsSec[10] = beatMap.beatsSec[9] as number;
    assert.throws(() => buildCutList(beatMap, photos(5), TEMPLATE()), InvalidBeatMapError);
  });

  it("fires when the energy curve is the wrong length", () => {
    const beatMap = DRIVE();
    beatMap.energyCurve = beatMap.energyCurve.slice(0, -1);
    assert.throws(() => buildCutList(beatMap, photos(5), TEMPLATE()), /energyCurve has/);
  });

  it("fires on a non-finite beat", () => {
    const beatMap = DRIVE();
    beatMap.beatsSec[5] = Number.NaN;
    assert.throws(() => buildCutList(beatMap, photos(5), TEMPLATE()), InvalidBeatMapError);
  });

  it("carries its spec code", () => {
    try {
      buildCutList({ ...DRIVE(), beatsSec: [], energyCurve: [] }, photos(5), TEMPLATE());
      assert.fail("should have thrown");
    } catch (error) {
      assert.equal((error as InvalidBeatMapError).code, "C-E3");
    }
  });
});

describe("C-E4 TemplateIncompatibleError", () => {
  it("fires when even the coarsest fallback cannot make a legal slide", () => {
    // A beat map at an impossible tempo: beats 0.1s apart. Every slide the template could
    // make would be under the 0.35s minimum, and no amount of coarsening at these bar
    // lengths recovers it.
    const beatsSec = Array.from({ length: 12 }, (_, index) => index * 0.1);
    const beatMap = {
      ...DRIVE(),
      beatsSec,
      downbeatsSec: [0, 0.4, 0.8],
      energyCurve: beatsSec.map(() => 0.5),
      sections: [{ startSec: 0, endSec: 1.2, level: "medium" as const }],
      durationSec: 1.2,
      bestWindowStartSec: 0,
    };
    assert.throws(() => buildCutList(beatMap, photos(5), TEMPLATE()), TemplateIncompatibleError);
  });

  it("carries its spec code", () => {
    const beatsSec = Array.from({ length: 12 }, (_, index) => index * 0.1);
    const beatMap = {
      ...DRIVE(),
      beatsSec,
      downbeatsSec: [0, 0.4, 0.8],
      energyCurve: beatsSec.map(() => 0.5),
      sections: [{ startSec: 0, endSec: 1.2, level: "medium" as const }],
      durationSec: 1.2,
      bestWindowStartSec: 0,
    };
    try {
      buildCutList(beatMap, photos(5), TEMPLATE());
      assert.fail("should have thrown");
    } catch (error) {
      assert.equal((error as TemplateIncompatibleError).code, "C-E4");
    }
  });
});

describe("errors are distinguishable", () => {
  it("an empty list is not reported as insufficient", () => {
    assert.throws(
      () => buildCutList(DRIVE(), [], TEMPLATE()),
      (error: unknown) => error instanceof EmptyMediaError && !(error instanceof InsufficientMediaError),
    );
  });
});
