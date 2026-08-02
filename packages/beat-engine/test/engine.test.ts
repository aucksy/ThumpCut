/**
 * Ground truth: the detector against tracks whose beat grid is known exactly, because the
 * synthesiser laid the instruments on it. This is the same standard the Python engine is
 * held to — never the detector against itself.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { detectBeats } from "../src/engine.ts";
import { synthesise } from "./synth.ts";

/** How far a detected beat may sit from the true grid. The product promise is 50ms. */
const BEAT_TOLERANCE_SEC = 0.025;

function nearestDistance(target: number, grid: readonly number[]): number {
  let best = Infinity;
  for (const value of grid) {
    const distance = Math.abs(value - target);
    if (distance < best) best = distance;
  }
  return best;
}

async function detectFor(bpm: number, bars: number, seed: number) {
  const track = synthesise(bpm, bars, seed);
  const result = await detectBeats(track.samples, track.sampleRate);
  return { track, result };
}

test("finds the exact tempo across a 60–190 BPM sweep", async () => {
  const sweep = [60, 75, 96, 110, 124, 137, 150, 172, 190];
  for (const bpm of sweep) {
    const { track, result } = await detectFor(bpm, 16, bpm);
    assert.ok(
      Math.abs(result.bpm - bpm) < 1.0,
      `${bpm} BPM detected as ${result.bpm}`,
    );
    // Every detected beat sits on the synthesiser's grid.
    for (const beat of result.beatsSec) {
      const distance = nearestDistance(beat, track.beatTimesSec);
      assert.ok(
        distance <= BEAT_TOLERANCE_SEC,
        `${bpm} BPM: beat at ${beat.toFixed(3)}s is ${(distance * 1000).toFixed(1)}ms off grid`,
      );
    }
  }
});

test("does not report double or half the true tempo", async () => {
  for (const bpm of [60, 96, 150, 190]) {
    const { result } = await detectFor(bpm, 16, bpm + 1);
    const ratio = result.bpm / bpm;
    assert.ok(
      Math.abs(ratio - 1) < 0.02,
      `${bpm} BPM detected as ${result.bpm} (ratio ${ratio.toFixed(3)})`,
    );
  }
});

test("downbeats are a subset of beats and one bar apart", async () => {
  const { result } = await detectFor(124, 16, 5);
  assert.ok(result.downbeatsSec.length >= 3);
  for (const downbeat of result.downbeatsSec) {
    assert.ok(
      result.beatsSec.some((beat) => Math.abs(beat - downbeat) < 5e-4),
      `downbeat ${downbeat} is not a beat`,
    );
  }
  const expectedBar = (60.0 / 124) * 4;
  for (let index = 1; index < result.downbeatsSec.length; index += 1) {
    const gap =
      (result.downbeatsSec[index] as number) - (result.downbeatsSec[index - 1] as number);
    assert.ok(Math.abs(gap - expectedBar) < 0.06, `bar gap ${gap.toFixed(3)}s`);
  }
});

test("downbeats land where the synthesiser put the strong kick", async () => {
  const { track, result } = await detectFor(96, 16, 7);
  // The synthesiser puts the accented kick on beat 0 of every bar — the true downbeats are
  // grid indices 0, 4, 8...  Allow the tracker to have trimmed lead-in beats.
  const trueDownbeats = track.beatTimesSec.filter((_, index) => index % 4 === 0);
  let matched = 0;
  for (const downbeat of result.downbeatsSec) {
    if (nearestDistance(downbeat, trueDownbeats) <= BEAT_TOLERANCE_SEC) matched += 1;
  }
  assert.ok(
    matched >= result.downbeatsSec.length - 1,
    `${matched} of ${result.downbeatsSec.length} downbeats on the accented kick`,
  );
});

test("rejects silence and empty input", async () => {
  await assert.rejects(() => detectBeats(new Float32Array(0), 22050));
  await assert.rejects(() => detectBeats(new Float32Array(22050 * 12), 22050));
});

test("identical input produces identical output", async () => {
  const track = synthesise(124, 12, 9);
  const first = await detectBeats(track.samples, track.sampleRate);
  const second = await detectBeats(track.samples, track.sampleRate);
  assert.deepEqual(first.beatsSec, second.beatsSec);
  assert.equal(first.bpm, second.bpm);
});

test("reports progress monotonically", async () => {
  const track = synthesise(124, 8, 3);
  const seen: number[] = [];
  await detectBeats(track.samples, track.sampleRate, (fraction) => {
    seen.push(fraction);
  });
  assert.ok(seen.length > 0, "no progress reported");
  for (let index = 1; index < seen.length; index += 1) {
    assert.ok((seen[index] as number) >= (seen[index - 1] as number));
  }
  assert.ok((seen[seen.length - 1] as number) <= 1);
});
