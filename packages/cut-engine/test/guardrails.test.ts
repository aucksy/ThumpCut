/**
 * The guardrails, C1–C12. Every one is tested against real Factory beat maps and every
 * template that ships.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  BEAT_SNAP_TOLERANCE_SEC,
  MAX_CONSECUTIVE_SHORT_SLIDES,
  MIN_SLIDE_SEC,
  SHORT_SLIDE_SEC,
  buildCutList,
  checkCutList,
  isOnBeat,
  type Cut,
} from "../src/index.ts";
import { BEAT_MAPS, clip, loadBeatMap, loadTemplates, photo, photos } from "./helpers.ts";

const TEMPLATES = loadTemplates();

describe("C1 — no slide shorter than 0.35s", () => {
  for (const mapName of BEAT_MAPS) {
    for (const template of TEMPLATES) {
      for (const count of [3, 8, 15, 30]) {
        it(`${mapName} / ${template.id} / ${count} items`, () => {
          const cutList = buildCutList(loadBeatMap(mapName), photos(count), template);
          for (const cut of cutList.cuts) {
            assert.ok(
              cut.endSec - cut.startSec >= MIN_SLIDE_SEC - 1e-6,
              `slide at ${cut.startSec} lasts ${(cut.endSec - cut.startSec).toFixed(3)}s`,
            );
          }
        });
      }
    }
  }
});

describe("C2 — no more than four consecutive slides under 0.5s", () => {
  for (const mapName of BEAT_MAPS) {
    for (const template of TEMPLATES) {
      it(`${mapName} / ${template.id}`, () => {
        const cutList = buildCutList(loadBeatMap(mapName), photos(30), template);
        let run = 0;
        for (const cut of cutList.cuts) {
          run = cut.endSec - cut.startSec < SHORT_SLIDE_SEC - 1e-6 ? run + 1 : 0;
          assert.ok(run <= MAX_CONSECUTIVE_SHORT_SLIDES, `run of ${run} short slides`);
        }
      });
    }
  }
});

describe("C3 — every cut lands within 50ms of a beat", () => {
  for (const mapName of BEAT_MAPS) {
    for (const template of TEMPLATES) {
      it(`${mapName} / ${template.id}`, () => {
        const beatMap = loadBeatMap(mapName);
        const cutList = buildCutList(beatMap, photos(12), template);
        for (const cut of cutList.cuts) {
          assert.ok(
            isOnBeat(beatMap.beatsSec, cut.startSec, BEAT_SNAP_TOLERANCE_SEC),
            `cut at ${cut.startSec} is not on a beat`,
          );
        }
      });
    }
  }
});

describe("C5 — cuts tile the window with no gaps or overlaps", () => {
  for (const mapName of BEAT_MAPS) {
    it(mapName, () => {
      const cutList = buildCutList(loadBeatMap(mapName), photos(9), TEMPLATES[0]!);
      for (let index = 0; index < cutList.cuts.length - 1; index += 1) {
        const current = cutList.cuts[index] as Cut;
        const next = cutList.cuts[index + 1] as Cut;
        assert.equal(current.endSec, next.startSec);
      }
    });
  }
});

describe("C6 — the first cut starts where the audio starts", () => {
  for (const mapName of BEAT_MAPS) {
    it(mapName, () => {
      const cutList = buildCutList(loadBeatMap(mapName), photos(9), TEMPLATES[0]!);
      assert.equal(cutList.cuts[0]!.startSec, cutList.audioStartSec);
    });
  }
});

describe("C7 — identical inputs produce identical output", () => {
  it("field for field, twice over", () => {
    const beatMap = loadBeatMap("beatmap-drive-124");
    const media = [
      photo("a"),
      clip("b", 12),
      photo("c"),
      clip("d", 2.4),
      photo("e"),
      clip("f", 45),
      photo("g"),
    ];
    const first = buildCutList(beatMap, media, TEMPLATES[0]!);
    const second = buildCutList(beatMap, media, TEMPLATES[0]!);
    assert.deepEqual(first, second);
  });

  it("holds for every template", () => {
    const beatMap = loadBeatMap("beatmap-hype-150");
    for (const template of TEMPLATES) {
      const media = [photo("a"), clip("b", 9), photo("c"), clip("d", 1.1), photo("e")];
      assert.deepEqual(
        buildCutList(beatMap, media, template),
        buildCutList(beatMap, media, template),
      );
    }
  });
});

describe("C8 — speed stays inside the template's range", () => {
  it("a slow-fitted clip never exceeds the range", () => {
    const template = TEMPLATES.find((t) => t.videoBehaviour.allowSpeedFit)!;
    const [low, high] = template.videoBehaviour.speedRange;
    const media = [clip("v1", 1.2), clip("v2", 2.1), photo("p1"), clip("v3", 0.9), photo("p2")];
    const cutList = buildCutList(loadBeatMap("beatmap-drive-124"), media, template);
    for (const cut of cutList.cuts) {
      if (cut.speed !== undefined && cut.speed !== 1) {
        assert.ok(cut.speed >= low - 1e-9 && cut.speed <= high + 1e-9, `speed ${cut.speed}`);
      }
    }
  });

  it("a template that forbids speed fitting never produces one", () => {
    const template = TEMPLATES.find((t) => !t.videoBehaviour.allowSpeedFit)!;
    const media = [clip("v1", 1.2), clip("v2", 2.1), photo("p1"), clip("v3", 0.9)];
    const cutList = buildCutList(loadBeatMap("beatmap-drive-124"), media, template);
    for (const cut of cutList.cuts) {
      if (cut.speed !== undefined) assert.equal(cut.speed, 1);
    }
  });
});

describe("C9 — a trimmed clip consumes exactly the source it plays", () => {
  it("holds for every trimmed cut", () => {
    const media = [clip("v1", 30), photo("p1"), clip("v2", 25), photo("p2"), clip("v3", 40)];
    for (const template of TEMPLATES) {
      const cutList = buildCutList(loadBeatMap("beatmap-drive-124"), media, template);
      for (const cut of cutList.cuts) {
        if (
          cut.freezeFromSec === undefined &&
          cut.sourceInSec !== undefined &&
          cut.sourceOutSec !== undefined &&
          cut.speed !== undefined
        ) {
          const consumed = cut.sourceOutSec - cut.sourceInSec;
          const expected = (cut.endSec - cut.startSec) * cut.speed;
          assert.ok(Math.abs(consumed - expected) < 1e-3, `${consumed} vs ${expected}`);
        }
      }
    }
  });
});

describe("C10 — every item is accounted for", () => {
  for (const count of [3, 7, 12, 30, 31, 45]) {
    it(`${count} items in`, () => {
      const cutList = buildCutList(loadBeatMap("beatmap-drive-124"), photos(count), TEMPLATES[0]!);
      assert.equal(cutList.itemsUsed + cutList.itemsDropped, count);
    });
  }
});

describe("C11 — photos never carry clip fields", () => {
  it("across every template", () => {
    const media = [photo("a"), clip("b", 8), photo("c"), photo("d"), clip("e", 3)];
    for (const template of TEMPLATES) {
      const cutList = buildCutList(loadBeatMap("beatmap-chill-96"), media, template);
      for (const cut of cutList.cuts) {
        if (media[cut.mediaIndex]!.kind !== "photo") continue;
        assert.equal(cut.speed, undefined);
        assert.equal(cut.sourceInSec, undefined);
        assert.equal(cut.sourceOutSec, undefined);
        assert.equal(cut.freezeFromSec, undefined);
      }
    }
  });
});

describe("C12 — videos never carry synthetic motion", () => {
  it("across every template", () => {
    const media = [clip("a", 8), photo("b"), clip("c", 2), clip("d", 20), photo("e")];
    for (const template of TEMPLATES) {
      const cutList = buildCutList(loadBeatMap("beatmap-chill-96"), media, template);
      for (const cut of cutList.cuts) {
        if (media[cut.mediaIndex]!.kind !== "video") continue;
        assert.equal(cut.motion, undefined);
      }
    }
  });
});

describe("the guardrail checker itself", () => {
  it("reports nothing for a cut list the engine produced", () => {
    const beatMap = loadBeatMap("beatmap-drive-124");
    const media = photos(9);
    const cutList = buildCutList(beatMap, media, TEMPLATES[0]!);
    assert.deepEqual(checkCutList(cutList, beatMap, media, TEMPLATES[0]!), []);
  });

  it("catches a gap that was introduced by hand", () => {
    const beatMap = loadBeatMap("beatmap-drive-124");
    const media = photos(9);
    const cutList = buildCutList(beatMap, media, TEMPLATES[0]!);
    cutList.cuts[1]!.startSec += 0.4;
    const violations = checkCutList(cutList, beatMap, media, TEMPLATES[0]!);
    assert.ok(violations.some((violation) => violation.guardrail === "C5"));
  });

  it("catches a slide that was shortened by hand", () => {
    const beatMap = loadBeatMap("beatmap-drive-124");
    const media = photos(9);
    const cutList = buildCutList(beatMap, media, TEMPLATES[0]!);
    cutList.cuts[0]!.endSec = cutList.cuts[0]!.startSec + 0.2;
    const violations = checkCutList(cutList, beatMap, media, TEMPLATES[0]!);
    assert.ok(violations.some((violation) => violation.guardrail === "C1"));
  });
});
