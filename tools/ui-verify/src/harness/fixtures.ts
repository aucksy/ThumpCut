/**
 * Sample data for the UI checker.
 *
 * Deliberately not in `app/src`: the app ships no demo data, and the token gate would rightly
 * object to placeholder colours living beside real screens.
 *
 * Placeholder images are generated SVG data URIs, so the harness renders identically with no
 * network at all — which is the point, since a screenshot that depends on a CDN is a
 * screenshot that goes blank in CI.
 */

import type { CatalogueTemplate, CatalogueTrack } from "../../../../app/src/catalogue/types.ts";
import type { LibraryItem, SelectionState } from "../../../../app/src/media/selection.ts";
import { initialSelectionState } from "../../../../app/src/media/selection.ts";

/** A flat placeholder tile. Two muted tones so tiles read as distinct content. */
export function placeholder(seed: number, width = 300, height = 300): string {
  const hue = (seed * 47) % 360;
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}'>` +
    `<rect width='100%' height='100%' fill='hsl(${hue},18%,32%)'/>` +
    `<rect x='0' y='${height * 0.55}' width='100%' height='${height * 0.45}' fill='hsl(${(hue + 30) % 360},20%,24%)'/>` +
    `<circle cx='${width * 0.72}' cy='${height * 0.26}' r='${width * 0.11}' fill='hsl(${(hue + 60) % 360},28%,58%)'/>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const BPM = 124;
const BEAT = 60 / BPM;
const BEAT_COUNT = 26;

export const SAMPLE_RULER = {
  beats: Array.from({ length: BEAT_COUNT }, (_, index) => Number((index * BEAT).toFixed(6))),
  get downbeats() {
    return this.beats.filter((_, index) => index % 4 === 0);
  },
  get energy() {
    return this.beats.map((_, index) => {
      const position = index / (BEAT_COUNT - 1);
      return Math.min(1, Math.max(0, 0.18 + 0.8 * position + (position > 0.78 ? 0.12 : 0)));
    });
  },
  get markers() {
    return this.beats
      .filter((_, index) => index % 2 === 0)
      .map((atSec, index) => ({
        atSec,
        kind: (index % 3 === 1 ? "video" : "photo") as "photo" | "video",
      }));
  },
  startSec: 0,
  durationSec: BEAT_COUNT * BEAT,
};

export const SAMPLE_TEMPLATES: CatalogueTemplate[] = [
  {
    id: "night-drive",
    name: "Night drive",
    mood: "Upbeat",
    previewVideoUrl: "",
    previewPosterUrl: placeholder(3, 340, 500),
    idealItemRange: [8, 16],
    density: { low: 4, medium: 2, high: 1, drop: 1 },
    transition: "cut",
    photoMotion: { type: "kenBurns", intensityPct: 6 },
    videoBehaviour: { allowSpeedFit: true, speedRange: [0.6, 1.6], preferSpanning: true },
  },
  {
    id: "golden-hour",
    name: "Golden hour",
    mood: "Chill",
    previewVideoUrl: "",
    previewPosterUrl: placeholder(7, 340, 500),
    idealItemRange: [6, 12],
    density: { low: 8, medium: 4, high: 2, drop: 2 },
    transition: "crossfade",
    photoMotion: { type: "kenBurns", intensityPct: 9 },
    videoBehaviour: { allowSpeedFit: true, speedRange: [0.5, 1.2], preferSpanning: true },
  },
  {
    id: "heat",
    name: "Heat",
    mood: "Hype",
    previewVideoUrl: "",
    previewPosterUrl: placeholder(11, 340, 500),
    idealItemRange: [10, 20],
    density: { low: 2, medium: 1, high: 1, drop: 1 },
    transition: "zoomPunch",
    photoMotion: { type: "kenBurns", intensityPct: 12 },
    videoBehaviour: { allowSpeedFit: true, speedRange: [0.75, 2], preferSpanning: false },
  },
  {
    id: "coastline",
    name: "Coastline",
    mood: "Cinematic",
    previewVideoUrl: "",
    // Deliberately no poster: the "partially cached" state must show a panel, never an empty box.
    previewPosterUrl: "",
    idealItemRange: [8, 14],
    density: { low: 8, medium: 4, high: 2, drop: 2 },
    transition: "cut",
    photoMotion: { type: "kenBurns", intensityPct: 5 },
    videoBehaviour: { allowSpeedFit: true, speedRange: [0.5, 1.1], preferSpanning: true },
  },
  {
    id: "blackout",
    name: "Blackout",
    mood: "Hype",
    previewVideoUrl: "",
    previewPosterUrl: placeholder(19, 340, 500),
    idealItemRange: [12, 24],
    density: { low: 2, medium: 1, high: 1, drop: 1 },
    transition: "cut",
    photoMotion: { type: "none", intensityPct: 0 },
    videoBehaviour: { allowSpeedFit: false, speedRange: [1, 1], preferSpanning: false },
  },
];

const LIBRARY_SHAPE: { kind: "photo" | "video"; durationSec?: number }[] = [
  { kind: "photo" },
  { kind: "video", durationSec: 12 },
  { kind: "photo" },
  { kind: "photo" },
  { kind: "video", durationSec: 7 },
  { kind: "photo" },
  { kind: "photo" },
  { kind: "video", durationSec: 21 },
  { kind: "photo" },
  // Enough spare clips that the video-cap state can show some dimmed and some picked. A
  // fixture that cannot express the state it is illustrating hides the very thing it is for.
  { kind: "video", durationSec: 9 },
  { kind: "video", durationSec: 4 },
  { kind: "photo" },
];

export const SAMPLE_LIBRARY: LibraryItem[] = LIBRARY_SHAPE.map((shape, index) => {
  const item: LibraryItem = {
    id: `item-${index + 1}`,
    uri: placeholder(index + 1),
    kind: shape.kind,
    width: shape.kind === "video" ? 1920 : 3000,
    height: shape.kind === "video" ? 1080 : 4000,
    rotationDeg: 0,
  };
  if (shape.durationSec !== undefined) item.durationSec = shape.durationSec;
  return item;
});

/** Build a selection state for a named screen state, without going through the reducer. */
export function selectionFor(
  overrides: Partial<SelectionState> & { selectedCount?: number },
): SelectionState {
  const base = initialSelectionState("granted");
  const count = overrides.selectedCount ?? 0;
  const selectedIds = SAMPLE_LIBRARY.slice(0, count).map((item) => item.id);
  return {
    ...base,
    status: "Browsing",
    permission: "granted",
    library: SAMPLE_LIBRARY,
    selectedIds,
    ...overrides,
  };
}

/**
 * A library big enough to reach the fifteen-clip cap.
 *
 * The video-cap state cannot be illustrated with five clips, and a state that cannot be
 * rendered is a state nobody ever looks at. This one exists to show the thing the design brief
 * is most insistent about: at the cap, **clips dim and photos stay live**.
 */
export const CLIP_HEAVY_LIBRARY: LibraryItem[] = Array.from({ length: 27 }, (_, index) => {
  const isVideo = index % 3 !== 2;
  const item: LibraryItem = {
    id: `heavy-${index + 1}`,
    uri: placeholder(index + 40),
    kind: isVideo ? "video" : "photo",
    width: isVideo ? 1920 : 3000,
    height: isVideo ? 1080 : 4000,
    rotationDeg: 0,
  };
  if (isVideo) item.durationSec = 5 + (index % 7);
  return item;
});

export const SAMPLE_TRACK = {
  title: "Night Meter",
  artist: "Arjun Rao",
  tempo: "124 BPM",
};

/** The track chooser's three neighbourhoods: trending, royalty-free, and the local door. */
export const SAMPLE_TRACK_LIST: CatalogueTrack[] = [
  {
    trackId: "ig-1",
    title: "Night Meter",
    artist: "Arjun Rao",
    bpm: 124,
    durationSec: 41,
    contentHash: "hash-1",
    beatMapPath: "beatmaps/ig-1.json",
  },
  {
    trackId: "ig-2",
    title: "Slow Tide",
    artist: "Mara Lund",
    bpm: 96,
    durationSec: 40,
    contentHash: "hash-2",
    beatMapPath: "beatmaps/ig-2.json",
  },
  {
    trackId: "jam-168",
    title: "Golden Static",
    artist: "The Wire Choir",
    bpm: 118,
    durationSec: 187,
    contentHash: "hash-3",
    beatMapPath: "beatmaps/jam-168.json",
    source: "royaltyfree",
    licence: { name: "CC BY", url: "https://creativecommons.org/licenses/by/4.0/" },
  },
  {
    trackId: "jam-403",
    title: "Redline Hours",
    artist: "Field Notes",
    bpm: 150,
    durationSec: 203,
    contentHash: "hash-4",
    beatMapPath: "beatmaps/jam-403.json",
    source: "royaltyfree",
    licence: { name: "CC BY-SA", url: "https://creativecommons.org/licenses/by-sa/4.0/" },
  },
];

/** A local track as it looks once analysed on the device. */
export const SAMPLE_LOCAL_TRACK: CatalogueTrack = {
  trackId: "local-9f2c41ab08d3",
  title: "Monsoon Sketch",
  artist: "Your music",
  bpm: 104,
  durationSec: 214,
  contentHash: "hash-local",
  beatMapPath: "",
  source: "local",
};

/** The phone's own songs, as the scan finds them. */
export const SAMPLE_SONGS = [
  { id: "s1", uri: "file:///music/1.mp3", filename: "Monsoon Sketch.mp3", durationSec: 214, modifiedAt: 1 },
  { id: "s2", uri: "file:///music/2.mp3", filename: "01 - Night_Drive_Demo.mp3", durationSec: 187, modifiedAt: 2 },
  { id: "s3", uri: "file:///music/3.m4a", filename: "voice memo loop.m4a", durationSec: 96, modifiedAt: 3 },
  { id: "s4", uri: "file:///music/4.mp3", filename: "Redline Hours (Field Notes).mp3", durationSec: 203, modifiedAt: 4 },
  { id: "s5", uri: "file:///music/5.mp3", filename: "kirtan practice take 3.mp3", durationSec: 312, modifiedAt: 5 },
];
