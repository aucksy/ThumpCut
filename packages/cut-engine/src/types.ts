/**
 * The cut engine's public types.
 *
 * `BeatMap` and `Section` mirror the schema defined in `specs/00-overview.md` §3.1 and
 * produced by the Python Factory (`factory/schema.py`). That file is the source of truth;
 * this is the TypeScript view of the same JSON. If one changes, `schemaVersion` is bumped in
 * both.
 */

export type SectionLevel = "low" | "medium" | "high";

export interface Section {
  startSec: number;
  endSec: number;
  level: SectionLevel;
}

export interface BeatMap {
  schemaVersion: 1;
  trackId: string;
  title: string;
  artist: string;
  /** Duration of the analysed audio. */
  durationSec: number;
  bpm: number;
  beatsSec: number[];
  /** Always a subset of beatsSec. */
  downbeatsSec: number[];
  beatsPerBar: number;
  /** 0..1 per beat. Same length as beatsSec. */
  energyCurve: number[];
  sections: Section[];
  bestWindowStartSec: number;

  /** Provenance — used to detect when Instagram swaps the recording. */
  sourceDurationMs: number;
  audioFingerprint: string;
  /** ISO 8601. */
  lastVerifiedAt: string;

  engine: string;
  engineVersion: string;
  /** Cache invalidation. */
  contentHash: string;
}

export type MediaKind = "photo" | "video";

export interface MediaItem {
  id: string;
  uri: string;
  kind: MediaKind;
  width: number;
  height: number;
  rotationDeg: 0 | 90 | 180 | 270;
  /** Videos only. */
  durationSec?: number;
  /** User trim start, videos only. */
  inPointSec?: number;
}

export type TransitionKind = "cut" | "crossfade" | "zoomPunch";

/** Beats per slide, per energy band. A larger number means a slower cut. */
export interface TemplateDensity {
  low: number;
  medium: number;
  high: number;
  drop: number;
}

export interface TemplatePhotoMotion {
  type: "none" | "kenBurns";
  intensityPct: number;
}

export interface TemplateVideoBehaviour {
  allowSpeedFit: boolean;
  speedRange: [number, number];
  preferSpanning: boolean;
}

export interface Template {
  id: string;
  name: string;
  previewVideoUrl: string;
  idealItemRange: [number, number];
  density: TemplateDensity;
  transition: TransitionKind;
  photoMotion: TemplatePhotoMotion;
  videoBehaviour: TemplateVideoBehaviour;
}

export interface KenBurns {
  type: "kenBurns";
  fromScale: number;
  toScale: number;
}

export interface Cut {
  mediaIndex: number;
  startSec: number;
  endSec: number;
  /** Videos only. */
  sourceInSec?: number;
  /** Videos only. */
  sourceOutSec?: number;
  /** Videos only. */
  speed?: number;
  /** Videos only. The frame to hold once the clip runs out. */
  freezeFromSec?: number;
  /** Photos only. A clip already moves; synthetic zoom on top of it looks wrong. */
  motion?: KenBurns;
  transitionIn: TransitionKind;
}

export interface CutList {
  totalDurationSec: number;
  audioStartSec: number;
  cuts: Cut[];
  itemsUsed: number;
  itemsDropped: number;
}

export interface BuildOptions {
  /** Where in the track to start. Defaults to `beatMap.bestWindowStartSec`. */
  startSec?: number;
  /** Longest reel to produce. Defaults to 30 seconds. */
  maxDurationSec?: number;
}

/** The energy bands a bar can fall into. Thresholds live in `constants.ts`. */
export type EnergyBand = "low" | "medium" | "high" | "drop";
