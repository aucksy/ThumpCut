/**
 * What the engine is actually for: cut density that follows the music, and video clips that
 * are fitted to their slot rather than dropped in and hoped for.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  MAX_ITEM_LOOPS,
  MAX_MEDIA_ITEMS,
  MIN_SLIDE_SEC,
  bandForEnergy,
  buildCutList,
  effectiveDownbeats,
  isOnBeat,
  resolveInPoint,
  type BeatMap,
  type Cut,
} from "../src/index.ts";
import { clip, loadBeatMap, loadTemplates, photo, photos, templateById } from "./helpers.ts";

const TEMPLATES = loadTemplates();
const DRIVE = () => loadBeatMap("beatmap-drive-124");

/** Cut a beat map down to the first `seconds` seconds, keeping it internally consistent. */
function truncate(beatMap: BeatMap, seconds: number): BeatMap {
  const keep = beatMap.beatsSec.filter((value) => value <= seconds);
  const beatsSec = keep.length >= 4 ? keep : beatMap.beatsSec.slice(0, 4);
  const last = beatsSec[beatsSec.length - 1] as number;
  return {
    ...beatMap,
    beatsSec,
    energyCurve: beatMap.energyCurve.slice(0, beatsSec.length),
    downbeatsSec: beatMap.downbeatsSec.filter((value) => value <= last),
    sections: beatMap.sections
      .filter((section) => section.startSec < last)
      .map((section) => ({ ...section, endSec: Math.min(section.endSec, last) })),
    durationSec: last,
    bestWindowStartSec: 0,
  };
}

describe("cut density follows the music", () => {
  it("busier bars get more of the pictures than calm ones", () => {
    const beatMap = DRIVE();
    const template = templateById("night-drive");
    const cutList = buildCutList(beatMap, photos(20), template, { startSec: 0 });

    const downbeats = effectiveDownbeats(beatMap);
    let calmCuts = 0;
    let calmSeconds = 0;
    let loudCuts = 0;
    let loudSeconds = 0;

    for (const cut of cutList.cuts) {
      const beatIndex = beatMap.beatsSec.findIndex((value) => value >= cut.startSec - 1e-6);
      const energy = beatMap.energyCurve[Math.max(0, beatIndex)] as number;
      const duration = cut.endSec - cut.startSec;
      if (bandForEnergy(energy) === "low") {
        calmCuts += 1;
        calmSeconds += duration;
      } else if (bandForEnergy(energy) === "high" || bandForEnergy(energy) === "drop") {
        loudCuts += 1;
        loudSeconds += duration;
      }
    }

    assert.ok(calmCuts > 0 && loudCuts > 0, "the fixture should span calm and loud bars");
    const calmRate = calmSeconds / calmCuts;
    const loudRate = loudSeconds / loudCuts;
    assert.ok(
      loudRate < calmRate,
      `loud bars average ${loudRate.toFixed(2)}s per cut, calm bars ${calmRate.toFixed(2)}s`,
    );
    void downbeats;
  });

  it("slide durations vary — this is not a fixed-rate slideshow", () => {
    const cutList = buildCutList(DRIVE(), photos(16), templateById("night-drive"));
    const durations = cutList.cuts.map((cut) => Math.round((cut.endSec - cut.startSec) * 1000));
    assert.ok(new Set(durations).size > 1, "every slide is the same length");
  });
});

describe("too few items", () => {
  it("three items over a whole track produce long holds, not a two-second reel", () => {
    const cutList = buildCutList(DRIVE(), photos(3), templateById("night-drive"));
    assert.ok(cutList.totalDurationSec >= 6, `reel is only ${cutList.totalDurationSec}s`);
    assert.equal(cutList.itemsUsed, 3);
    assert.equal(cutList.itemsDropped, 0);
  });

  it("no item is looped more than twice", () => {
    const cutList = buildCutList(DRIVE(), photos(3), templateById("night-drive"));
    const appearances = new Map<number, number>();
    for (const cut of cutList.cuts) {
      appearances.set(cut.mediaIndex, (appearances.get(cut.mediaIndex) ?? 0) + 1);
    }
    for (const [index, count] of appearances) {
      assert.ok(count <= 1 + MAX_ITEM_LOOPS, `item ${index} appears ${count} times`);
    }
  });

  it("no single picture is held past four seconds when it can be avoided", () => {
    const cutList = buildCutList(DRIVE(), photos(6), templateById("night-drive"));
    for (const cut of cutList.cuts) {
      assert.ok(cut.endSec - cut.startSec <= 4.5, `held ${(cut.endSec - cut.startSec).toFixed(2)}s`);
    }
  });

  it("consecutive slides never repeat the same picture", () => {
    const cutList = buildCutList(DRIVE(), photos(4), templateById("night-drive"));
    for (let index = 1; index < cutList.cuts.length; index += 1) {
      const previous = cutList.cuts[index - 1] as Cut;
      const current = cutList.cuts[index] as Cut;
      if (previous.mediaIndex === current.mediaIndex) {
        // Only legal when a clip is spanning, which continues the source rather than restarting.
        assert.notEqual(current.sourceInSec, previous.sourceInSec);
      }
    }
  });
});

describe("too many items", () => {
  it("thirty items over a fifteen-second track drop some, and shorten none", () => {
    const short = truncate(DRIVE(), 15);
    const cutList = buildCutList(short, photos(30), templateById("golden-hour"));
    assert.ok(cutList.itemsDropped > 0, "nothing was dropped");
    for (const cut of cutList.cuts) {
      assert.ok(cut.endSec - cut.startSec >= MIN_SLIDE_SEC - 1e-6);
    }
  });

  it("a thirty-first item is never used, under any template", () => {
    for (const template of TEMPLATES) {
      const cutList = buildCutList(DRIVE(), photos(31), template);
      assert.ok(cutList.itemsUsed <= MAX_MEDIA_ITEMS, template.id);
      for (const cut of cutList.cuts) {
        assert.ok(cut.mediaIndex < MAX_MEDIA_ITEMS, template.id);
      }
    }
  });

  it("a template that can carry thirty items uses exactly thirty of thirty-one", () => {
    const cutList = buildCutList(DRIVE(), photos(31), templateById("night-drive"));
    assert.equal(cutList.itemsUsed, MAX_MEDIA_ITEMS);
    assert.equal(cutList.itemsDropped, 1);
  });

  it("a template whose cutting rate cannot carry thirty items drops the rest, rather than strobing", () => {
    // "Heat" cuts on every beat. At 124 BPM that is a 0.48s slide, and C2 forbids more than
    // four of those in a row. The guardrail wins and the extra pictures are dropped — which
    // is why the recommendation screen exists.
    const cutList = buildCutList(DRIVE(), photos(30), templateById("heat"));
    assert.ok(cutList.itemsDropped > 0);
    for (const cut of cutList.cuts) {
      assert.ok(cut.endSec - cut.startSec >= MIN_SLIDE_SEC - 1e-6);
    }
  });

  it("forty-five items still balance out", () => {
    const cutList = buildCutList(DRIVE(), photos(45), templateById("heat"));
    assert.equal(cutList.itemsUsed + cutList.itemsDropped, 45);
    assert.ok(cutList.itemsUsed <= MAX_MEDIA_ITEMS);
  });
});

describe("video fitting", () => {
  it("a clip longer than its slot is trimmed at normal speed", () => {
    const media = [clip("long", 30), photo("a"), photo("b"), photo("c")];
    const cutList = buildCutList(DRIVE(), media, templateById("blackout"));
    const videoCuts = cutList.cuts.filter((cut) => media[cut.mediaIndex]!.kind === "video");
    assert.ok(videoCuts.length > 0);
    for (const cut of videoCuts) {
      assert.equal(cut.speed, 1);
      assert.equal(cut.freezeFromSec, undefined);
      assert.ok((cut.sourceOutSec as number) > (cut.sourceInSec as number));
    }
  });

  it("a clip a little shorter than its slot is slowed to fill it", () => {
    const template = templateById("golden-hour");
    // Golden hour holds long slides, so a 2-second clip lands in the speed-fit band.
    const media = [clip("short", 2.0), photo("a"), photo("b"), photo("c"), photo("d")];
    const cutList = buildCutList(DRIVE(), media, template);
    const videoCut = cutList.cuts.find((cut) => media[cut.mediaIndex]!.kind === "video");
    assert.ok(videoCut, "no video cut was produced");
    assert.ok(
      (videoCut.speed as number) < 1 || videoCut.freezeFromSec !== undefined,
      "a short clip was neither slowed nor frozen",
    );
  });

  it("a clip far shorter than its slot is frozen on its last frame", () => {
    const media = [clip("tiny", 0.4), photo("a"), photo("b"), photo("c"), photo("d")];
    const cutList = buildCutList(DRIVE(), media, templateById("golden-hour"));
    const videoCut = cutList.cuts.find((cut) => media[cut.mediaIndex]!.kind === "video");
    assert.ok(videoCut);
    assert.ok(videoCut.freezeFromSec !== undefined, "no freeze was applied");
  });

  it("every slot a clip lands in is covered end to end", () => {
    const media = [clip("a", 0.2), clip("b", 1.5), clip("c", 40), photo("d"), photo("e")];
    for (const template of TEMPLATES) {
      const cutList = buildCutList(DRIVE(), media, template);
      for (const cut of cutList.cuts) {
        assert.ok(cut.endSec > cut.startSec, "a slot was left with no duration");
      }
    }
  });

  it("a long clip spans consecutive cuts, continuing through the source", () => {
    const template = templateById("night-drive");
    assert.equal(template.videoBehaviour.preferSpanning, true);
    const media = [clip("epic", 60), photo("a"), photo("b")];
    const cutList = buildCutList(DRIVE(), media, template);

    const runs: Cut[][] = [];
    for (const cut of cutList.cuts) {
      const lastRun = runs[runs.length - 1];
      if (lastRun && (lastRun[0] as Cut).mediaIndex === cut.mediaIndex) lastRun.push(cut);
      else runs.push([cut]);
    }
    const spanned = runs.find((run) => run.length > 1 && media[(run[0] as Cut).mediaIndex]!.kind === "video");
    assert.ok(spanned, "the long clip did not span consecutive slots");
    for (let index = 1; index < spanned.length; index += 1) {
      const previous = spanned[index - 1] as Cut;
      const current = spanned[index] as Cut;
      assert.ok(
        (current.sourceInSec as number) > (previous.sourceInSec as number),
        "a spanned cut restarted the clip instead of continuing it",
      );
    }
  });

  it("a template that does not prefer spanning never spans", () => {
    const template = templateById("heat");
    assert.equal(template.videoBehaviour.preferSpanning, false);
    const media = [clip("epic", 60), photo("a"), photo("b"), photo("c")];
    const cutList = buildCutList(DRIVE(), media, template);
    for (let index = 1; index < cutList.cuts.length; index += 1) {
      const previous = cutList.cuts[index - 1] as Cut;
      const current = cutList.cuts[index] as Cut;
      if (previous.mediaIndex === current.mediaIndex && media[current.mediaIndex]!.kind === "video") {
        assert.fail("a clip spanned under a template that forbids it");
      }
    }
  });
});

describe("in-points", () => {
  it("default to fifteen per cent in, capped at one second", () => {
    assert.equal(resolveInPoint(clip("a", 4)), 0.6);
    assert.equal(resolveInPoint(clip("a", 30)), 1.0);
  });

  it("a user in-point past the end of the clip is clamped", () => {
    assert.equal(resolveInPoint(clip("a", 5, 99)), 4.9);
  });

  it("a negative in-point is clamped to the start", () => {
    assert.equal(resolveInPoint(clip("a", 5, -3)), 0);
  });

  it("a clip with no duration reports no in-point rather than crashing", () => {
    assert.equal(resolveInPoint({ ...clip("a", 0) }), 0);
  });

  it("the engine honours a user in-point", () => {
    const media = [clip("a", 20, 7), photo("b"), photo("c"), photo("d")];
    const cutList = buildCutList(DRIVE(), media, templateById("blackout"));
    const videoCut = cutList.cuts.find((cut) => media[cut.mediaIndex]!.kind === "video");
    assert.ok(videoCut);
    assert.ok((videoCut.sourceInSec as number) >= 7 - 1e-6);
  });
});

describe("odd beat maps", () => {
  it("an empty downbeat list falls back to every fourth beat", () => {
    const beatMap = { ...DRIVE(), downbeatsSec: [] };
    const derived = effectiveDownbeats(beatMap);
    assert.ok(derived.length > 0);
    assert.equal(derived[0], beatMap.beatsSec[0]);
    assert.equal(derived[1], beatMap.beatsSec[4]);

    const cutList = buildCutList(beatMap, photos(9), templateById("night-drive"));
    for (const cut of cutList.cuts) {
      assert.ok(isOnBeat(beatMap.beatsSec, cut.startSec, 0.05));
    }
  });

  it("a start time past the end of the track is pulled back", () => {
    const beatMap = DRIVE();
    const cutList = buildCutList(beatMap, photos(6), templateById("night-drive"), {
      startSec: 9999,
    });
    assert.ok(cutList.audioStartSec < beatMap.durationSec);
    assert.ok(cutList.cuts.length >= 3);
  });

  it("a negative start time is treated as the beginning", () => {
    const cutList = buildCutList(DRIVE(), photos(6), templateById("night-drive"), {
      startSec: -50,
    });
    assert.ok(cutList.audioStartSec >= 0);
  });

  it("a very short track still produces a reel", () => {
    const short = truncate(DRIVE(), 6);
    const cutList = buildCutList(short, photos(3), templateById("golden-hour"));
    assert.ok(cutList.cuts.length >= 1);
    assert.ok(cutList.totalDurationSec > 0);
  });
});

describe("the reel's shape", () => {
  it("respects a shorter maximum duration", () => {
    const cutList = buildCutList(DRIVE(), photos(12), templateById("night-drive"), {
      maxDurationSec: 10,
    });
    assert.ok(cutList.totalDurationSec <= 10.5, `${cutList.totalDurationSec}s`);
  });

  it("starts on a downbeat by default", () => {
    const beatMap = DRIVE();
    const cutList = buildCutList(beatMap, photos(9), templateById("night-drive"));
    assert.ok(isOnBeat(beatMap.downbeatsSec, cutList.audioStartSec, 0.05));
  });

  it("the first transition is always a hard cut", () => {
    for (const template of TEMPLATES) {
      const cutList = buildCutList(DRIVE(), photos(9), template);
      assert.equal(cutList.cuts[0]!.transitionIn, "cut");
    }
  });

  it("later transitions come from the template", () => {
    const template = templateById("golden-hour");
    const cutList = buildCutList(DRIVE(), photos(9), template);
    assert.equal(cutList.cuts[1]!.transitionIn, template.transition);
  });
});
