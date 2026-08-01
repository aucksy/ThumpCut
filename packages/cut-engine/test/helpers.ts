/**
 * Shared test helpers.
 *
 * The beat maps under `fixtures/` are real Factory output, not hand-written numbers. If the
 * engine only ever saw tidy synthetic grids it would pass every test and still fall over on
 * the first track with an odd bar in it.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { BeatMap, MediaItem, Template } from "../src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "fixtures");

export function loadBeatMap(name: string): BeatMap {
  return JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), "utf8")) as BeatMap;
}

export function loadTemplates(): Template[] {
  const raw = JSON.parse(readFileSync(join(FIXTURES, "templates.json"), "utf8")) as {
    templates: (Template & { mood?: string })[];
  };
  return raw.templates.map((template) => ({
    id: template.id,
    name: template.name,
    previewVideoUrl: template.previewVideoUrl ?? "",
    idealItemRange: template.idealItemRange,
    density: template.density,
    transition: template.transition,
    photoMotion: template.photoMotion,
    videoBehaviour: template.videoBehaviour,
  }));
}

export const BEAT_MAPS = ["beatmap-chill-96", "beatmap-drive-124", "beatmap-hype-150"];

export function templateById(id: string): Template {
  const found = loadTemplates().find((template) => template.id === id);
  if (!found) throw new Error(`no such template fixture: ${id}`);
  return found;
}

export function photo(id: string): MediaItem {
  return { id, uri: `file:///photos/${id}.jpg`, kind: "photo", width: 3000, height: 4000, rotationDeg: 0 };
}

export function clip(id: string, durationSec: number, inPointSec?: number): MediaItem {
  const item: MediaItem = {
    id,
    uri: `file:///clips/${id}.mp4`,
    kind: "video",
    width: 1920,
    height: 1080,
    rotationDeg: 0,
    durationSec,
  };
  if (inPointSec !== undefined) item.inPointSec = inPointSec;
  return item;
}

export function photos(count: number): MediaItem[] {
  return Array.from({ length: count }, (_, index) => photo(`p${index + 1}`));
}

/** A deterministic pseudo-random generator. Property tests must be reproducible. */
export function makeRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    // xorshift32 — small, fast, and identical on every machine.
    state ^= state << 13;
    state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
}

/** A random mix of photos and clips with durations from 0 to 60 seconds. */
export function randomMedia(count: number, random: () => number): MediaItem[] {
  return Array.from({ length: count }, (_, index) => {
    if (random() < 0.5) return photo(`p${index}`);
    const duration = Math.round(random() * 60 * 100) / 100;
    return clip(`v${index}`, duration);
  });
}
