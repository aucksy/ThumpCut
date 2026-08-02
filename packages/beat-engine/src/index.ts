/**
 * @thumpcut/beat-engine — the Factory's beat detector, runnable on a phone.
 *
 * `analyseSamples` is the whole public story: mono samples in, a validated `BeatMap` out,
 * identical in shape to what the Factory publishes. Everything else is exported for tests
 * and tools.
 */

export {
  ANALYSIS_SAMPLE_RATE,
  BeatDetectionFailed,
  ENGINE_NAME,
  ENGINE_VERSION,
  MAX_BPM,
  MIN_BPM,
  detectBeats,
  type BeatDetectionResult,
  type ProgressHook,
} from "./engine.ts";

export {
  AnalysisFailed,
  analyseSamples,
  buildEnergyCurve,
  buildSections,
  chooseBestWindow,
  computeContentHash,
  fingerprintSamples,
  type AnalyseInfo,
  type AnalyseOptions,
} from "./analyse.ts";

export { validateBeatMap } from "./validate.ts";
export { decodeWav, WavDecodeError, type DecodedWav } from "./wav.ts";
export { resampleLinear } from "./math.ts";
export { sha256Hex, sha256HexOfString } from "./sha256.ts";
