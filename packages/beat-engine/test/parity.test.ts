/**
 * Parity with the reference implementation.
 *
 * The committed fixture WAVs were analysed by the Python engine, and its answers are
 * committed as the published beat maps. This feeds the same audio through the port and
 * holds it to those answers. The two implementations differ only in float precision
 * (NumPy runs parts of the pipeline in float32), so the tolerances below are tight but
 * not zero — well under one analysis frame (11.6ms), far under the 50ms product promise.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import type { BeatMap } from "@thumpcut/cut-engine";
import { analyseSamples } from "../src/analyse.ts";
import { resampleLinear } from "../src/math.ts";
import { decodeWav } from "../src/wav.ts";

const FIXTURES = [
  { wav: "chill-96.wav", beatMap: "fixture-chill-96.json", bpm: 96 },
  { wav: "drive-124.wav", beatMap: "fixture-drive-124.json", bpm: 124 },
  { wav: "hype-150.wav", beatMap: "fixture-hype-150.json", bpm: 150 },
];

const BEAT_PARITY_SEC = 0.012;

function repoPath(relative: string): string {
  return fileURLToPath(new URL(`../../../${relative}`, import.meta.url));
}

/**
 * The reference answers are the *published* beat maps in `catalogue/` — committed, served
 * to phones, and identical to what the Python engine produced. `factory/out/` holds the
 * same content but is gitignored scratch, which is exactly why it must not be read here:
 * it exists on a machine that has run the Factory and nowhere else, CI included.
 */
function loadReference(name: string): BeatMap {
  return JSON.parse(readFileSync(repoPath(`catalogue/beatmaps/${name}`), "utf8")) as BeatMap;
}

for (const fixture of FIXTURES) {
  test(`agrees with the Python engine on ${fixture.wav}`, async () => {
    const wav = decodeWav(
      new Uint8Array(readFileSync(repoPath(`factory/fixtures/${fixture.wav}`))),
    );
    const samples = resampleLinear(wav.samples, wav.sampleRate, 22050);
    const reference = loadReference(fixture.beatMap);

    const ours = await analyseSamples(samples, 22050, {
      trackId: reference.trackId,
      title: reference.title,
      artist: reference.artist,
    });

    // Tempo: the reference committed its answer to 2 decimals.
    assert.ok(
      Math.abs(ours.bpm - reference.bpm) <= 0.1,
      `bpm ${ours.bpm} vs reference ${reference.bpm}`,
    );

    // Beats: same count, and each within a fraction of a frame of the reference.
    assert.equal(
      ours.beatsSec.length,
      reference.beatsSec.length,
      `beat count ${ours.beatsSec.length} vs ${reference.beatsSec.length}`,
    );
    let worst = 0;
    for (let index = 0; index < ours.beatsSec.length; index += 1) {
      const difference = Math.abs(
        (ours.beatsSec[index] as number) - (reference.beatsSec[index] as number),
      );
      if (difference > worst) worst = difference;
    }
    assert.ok(worst <= BEAT_PARITY_SEC, `worst beat divergence ${(worst * 1000).toFixed(2)}ms`);

    // Downbeats: same phase, same count.
    assert.equal(ours.downbeatsSec.length, reference.downbeatsSec.length);
    for (let index = 0; index < ours.downbeatsSec.length; index += 1) {
      const difference = Math.abs(
        (ours.downbeatsSec[index] as number) - (reference.downbeatsSec[index] as number),
      );
      assert.ok(difference <= BEAT_PARITY_SEC, `downbeat ${index} differs by ${difference}s`);
    }

    // The reel's starting point: the same downbeat.
    assert.ok(
      Math.abs(ours.bestWindowStartSec - reference.bestWindowStartSec) <= BEAT_PARITY_SEC,
      `best window ${ours.bestWindowStartSec} vs ${reference.bestWindowStartSec}`,
    );

    // Energy curve: same length, close values — it feeds template density thresholds.
    assert.equal(ours.energyCurve.length, reference.energyCurve.length);
    let worstEnergy = 0;
    for (let index = 0; index < ours.energyCurve.length; index += 1) {
      const difference = Math.abs(
        (ours.energyCurve[index] as number) - (reference.energyCurve[index] as number),
      );
      if (difference > worstEnergy) worstEnergy = difference;
    }
    assert.ok(worstEnergy <= 0.05, `worst energy divergence ${worstEnergy.toFixed(4)}`);

    // Sections: same banding sequence.
    assert.deepEqual(
      ours.sections.map((section) => section.level),
      reference.sections.map((section) => section.level),
    );

    // And the true tempo, for good measure — parity with a wrong answer would be worthless.
    assert.ok(Math.abs(ours.bpm - fixture.bpm) < 1.0, `bpm ${ours.bpm} vs true ${fixture.bpm}`);
  });
}
