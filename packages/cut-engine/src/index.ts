/**
 * @thumpcut/cut-engine
 *
 * Pure TypeScript. Zero runtime dependencies. No React Native imports. Runs under plain
 * `node`. This is the core of the product and the one part that can be made bulletproof
 * without a device.
 */

export { buildCutList } from "./buildCutList.ts";
export {
  assertUsableBeatMap,
  bandForEnergy,
  effectiveDownbeats,
  firstBeatIndexAtOrAfter,
  groupIntoBars,
  isOnBeat,
  nearestBeatIndex,
  type Bar,
} from "./beatmap.ts";
export {
  fitToSlot,
  photoMotion,
  resolveInPoint,
  usableClipSeconds,
  type FitStrategy,
  type FittedCut,
} from "./fit.ts";
export { assertCutList, checkCutList, type Violation } from "./guardrails.ts";
export {
  CutEngineError,
  EmptyMediaError,
  GuardrailViolation,
  InsufficientMediaError,
  InvalidBeatMapError,
  TemplateIncompatibleError,
} from "./errors.ts";
export * from "./constants.ts";
export type {
  BeatMap,
  BuildOptions,
  Cut,
  CutList,
  EnergyBand,
  KenBurns,
  MediaItem,
  MediaKind,
  Section,
  SectionLevel,
  Template,
  TemplateDensity,
  TemplatePhotoMotion,
  TemplateVideoBehaviour,
  TransitionKind,
} from "./types.ts";
