/**
 * The full analysis path: schema invariants, hashing, determinism — everything the app
 * will rely on when it builds a beat map from the user's own music.
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  AnalysisFailed,
  analyseSamples,
  computeContentHash,
  fingerprintSamples,
} from "../src/analyse.ts";
import { validateBeatMap } from "../src/validate.ts";
import { sha256HexOfString } from "../src/sha256.ts";
import { synthesise } from "./synth.ts";

const INFO = { trackId: "local-test", title: "Test Track", artist: "Test" };
const NOW = "2026-08-02T00:00:00.000Z";

test("produces a beat map that passes every schema invariant", async () => {
  const track = synthesise(124, 12, 1);
  const beatMap = await analyseSamples(track.samples, track.sampleRate, INFO, { nowIso: NOW });

  assert.equal(validateBeatMap(beatMap), null);
  assert.equal(beatMap.schemaVersion, 1);
  assert.equal(beatMap.trackId, "local-test");
  assert.equal(beatMap.engine, "spectral_dp_ts");
  assert.ok(beatMap.beatsSec.length > 8);
  assert.equal(beatMap.energyCurve.length, beatMap.beatsSec.length);
  assert.ok(beatMap.contentHash.length === 64);
  assert.ok(beatMap.audioFingerprint.startsWith("sha256-pcm8k:"));
  assert.ok(beatMap.durationSec > 20);

  // Sections tile the whole track. The final boundary may sit a rounding step short of the
  // published duration — the Python reference has the same property (drive-124 ends 0.3ms
  // shy), so exactness here would be demanding more than the contract.
  const first = beatMap.sections[0];
  const last = beatMap.sections[beatMap.sections.length - 1];
  assert.ok(first && first.startSec === 0);
  assert.ok(last && last.endSec >= beatMap.durationSec - 0.001);
});

test("identical audio produces an identical beat map and hash", async () => {
  const track = synthesise(96, 10, 2);
  const first = await analyseSamples(track.samples, track.sampleRate, INFO, { nowIso: NOW });
  const second = await analyseSamples(track.samples, track.sampleRate, INFO, { nowIso: NOW });
  assert.deepEqual(first, second);
});

test("the content hash ignores provenance but not content", async () => {
  const track = synthesise(96, 10, 3);
  const beatMap = await analyseSamples(track.samples, track.sampleRate, INFO, { nowIso: NOW });

  const laterVerification = { ...beatMap, lastVerifiedAt: "2027-01-01T00:00:00.000Z" };
  assert.equal(computeContentHash(laterVerification), beatMap.contentHash);

  const shiftedBeat = {
    ...beatMap,
    beatsSec: beatMap.beatsSec.map((value, index) => (index === 0 ? value + 0.001 : value)),
  };
  assert.notEqual(computeContentHash(shiftedBeat), beatMap.contentHash);
});

test("the fingerprint survives a level change but not different audio", () => {
  const track = synthesise(124, 8, 4);
  const original = fingerprintSamples(track.samples, track.sampleRate);

  // Half the volume — the same recording at another encode level.
  const quieter = new Float32Array(track.samples.length);
  for (let index = 0; index < track.samples.length; index += 1) {
    quieter[index] = (track.samples[index] as number) * 0.5;
  }
  assert.equal(fingerprintSamples(quieter, track.sampleRate), original);

  const other = synthesise(124, 8, 5);
  assert.notEqual(fingerprintSamples(other.samples, other.sampleRate), original);
});

test("refuses audio shorter than ten seconds", async () => {
  await assert.rejects(
    () => analyseSamples(new Float32Array(22050 * 5), 22050, INFO),
    AnalysisFailed,
  );
});

test("accepts audio at a foreign sample rate by resampling", async () => {
  const track = synthesise(124, 10, 6);
  // Pretend the decoder handed us 44.1kHz by upsampling the 22.05kHz synthesis.
  const doubled = new Float32Array(track.samples.length * 2);
  for (let index = 0; index < track.samples.length - 1; index += 1) {
    doubled[index * 2] = track.samples[index] as number;
    doubled[index * 2 + 1] =
      ((track.samples[index] as number) + (track.samples[index + 1] as number)) / 2;
  }
  const beatMap = await analyseSamples(doubled, 44100, INFO, { nowIso: NOW });
  assert.ok(Math.abs(beatMap.bpm - 124) < 1.5, `bpm ${beatMap.bpm}`);
});

test("sha256 matches a known vector", () => {
  assert.equal(
    sha256HexOfString("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  assert.equal(
    sha256HexOfString(""),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
});
