/**
 * Property tests.
 *
 * A unit test proves the engine handles the cases someone thought of. These throw thousands
 * of combinations at it — every item count from 3 to 40, every template, random mixes of
 * photos and clips with durations from 0 to 60 seconds — and assert that no guardrail is ever
 * violated and no slot is ever left partially filled.
 *
 * The generator is seeded, so a failure is reproducible from the printed seed.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  MAX_MEDIA_ITEMS,
  MIN_SLIDE_SEC,
  buildCutList,
  checkCutList,
  isOnBeat,
  type Cut,
} from "../src/index.ts";
import {
  BEAT_MAPS,
  loadBeatMap,
  loadTemplates,
  makeRandom,
  photos,
  randomMedia,
} from "./helpers.ts";

const TEMPLATES = loadTemplates();

describe("for any item count from 3 to 40, every guardrail holds", () => {
  for (const template of TEMPLATES) {
    it(template.id, () => {
      for (const mapName of BEAT_MAPS) {
        const beatMap = loadBeatMap(mapName);
        for (let count = 3; count <= 40; count += 1) {
          const media = photos(count);
          const cutList = buildCutList(beatMap, media, template);
          const violations = checkCutList(cutList, beatMap, media, template);
          assert.deepEqual(
            violations,
            [],
            `${mapName} / ${template.id} / ${count} items: ${JSON.stringify(violations)}`,
          );
        }
      }
    });
  }
});

describe("for any random mix of photos and clips, every slot is fully covered", () => {
  for (const template of TEMPLATES) {
    it(template.id, () => {
      for (let seed = 1; seed <= 40; seed += 1) {
        const random = makeRandom(seed * 7919);
        const count = 3 + Math.floor(random() * 30);
        const media = randomMedia(count, random);
        const mapName = BEAT_MAPS[seed % BEAT_MAPS.length] as string;
        const beatMap = loadBeatMap(mapName);

        const cutList = buildCutList(beatMap, media, template);
        const violations = checkCutList(cutList, beatMap, media, template);
        assert.deepEqual(
          violations,
          [],
          `seed ${seed} / ${template.id} / ${count} items: ${JSON.stringify(violations)}`,
        );

        for (const cut of cutList.cuts) {
          assert.ok(
            cut.endSec - cut.startSec >= MIN_SLIDE_SEC - 1e-6,
            `seed ${seed}: slot at ${cut.startSec} is ${(cut.endSec - cut.startSec).toFixed(3)}s`,
          );
        }
      }
    });
  }
});

describe("for any beat map from a real Factory run, every cut lands on a beat", () => {
  for (const mapName of BEAT_MAPS) {
    it(mapName, () => {
      const beatMap = loadBeatMap(mapName);
      for (const template of TEMPLATES) {
        for (let seed = 1; seed <= 12; seed += 1) {
          const random = makeRandom(seed * 104729);
          const media = randomMedia(3 + Math.floor(random() * 25), random);
          const cutList = buildCutList(beatMap, media, template);
          for (const cut of cutList.cuts) {
            assert.ok(
              isOnBeat(beatMap.beatsSec, cut.startSec, 0.05),
              `${template.id} seed ${seed}: cut at ${cut.startSec} is off the grid`,
            );
          }
        }
      }
    });
  }
});

describe("determinism holds across the whole input space", () => {
  it("the same inputs always produce the same cut list", () => {
    for (let seed = 1; seed <= 25; seed += 1) {
      const build = () => {
        const random = makeRandom(seed * 15485863);
        const media = randomMedia(3 + Math.floor(random() * 25), random);
        const beatMap = loadBeatMap(BEAT_MAPS[seed % BEAT_MAPS.length] as string);
        const template = TEMPLATES[seed % TEMPLATES.length]!;
        return buildCutList(beatMap, media, template);
      };
      assert.deepEqual(build(), build(), `seed ${seed}`);
    }
  });
});

describe("the cut list never claims more than it has", () => {
  it("items used never exceeds the cap, and never exceeds what was supplied", () => {
    for (let count = 3; count <= 40; count += 1) {
      for (const template of TEMPLATES) {
        const cutList = buildCutList(loadBeatMap("beatmap-hype-150"), photos(count), template);
        assert.ok(cutList.itemsUsed <= Math.min(count, MAX_MEDIA_ITEMS));
        assert.ok(cutList.itemsDropped >= 0);
        assert.equal(cutList.itemsUsed + cutList.itemsDropped, count);
      }
    }
  });

  it("no cut refers to an item that was not supplied", () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const random = makeRandom(seed * 2654435761);
      const count = 3 + Math.floor(random() * 35);
      const media = randomMedia(count, random);
      const template = TEMPLATES[seed % TEMPLATES.length]!;
      const cutList = buildCutList(loadBeatMap("beatmap-chill-96"), media, template);
      for (const cut of cutList.cuts as Cut[]) {
        assert.ok(cut.mediaIndex >= 0 && cut.mediaIndex < media.length);
      }
    }
  });
});
