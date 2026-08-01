/**
 * Print a cut list as a table, so a person can look at it and see whether the edit makes
 * sense. Spec 02 §10.
 *
 *   node --experimental-strip-types scripts/preview-cutlist.ts
 *   node --experimental-strip-types scripts/preview-cutlist.ts beatmap-hype-150 heat 12
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bandForEnergy, buildCutList, nearestBeatIndex } from "../src/index.ts";
import type { BeatMap, MediaItem, Template } from "../src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "..", "test", "fixtures");

const [, , mapName = "beatmap-drive-124", templateId = "night-drive", countRaw = "8"] =
  process.argv;
const itemCount = Number.parseInt(countRaw, 10);

const beatMap = JSON.parse(
  readFileSync(join(FIXTURES, `${mapName}.json`), "utf8"),
) as BeatMap;

const templates = (
  JSON.parse(readFileSync(join(FIXTURES, "templates.json"), "utf8")) as {
    templates: Template[];
  }
).templates;

const template = templates.find((candidate) => candidate.id === templateId);
if (!template) {
  console.error(`No template "${templateId}". Available: ${templates.map((t) => t.id).join(", ")}`);
  process.exit(1);
}

// A realistic mix: two out of every five items is a clip.
const media: MediaItem[] = Array.from({ length: itemCount }, (_, index) => {
  const isVideo = index % 5 === 1 || index % 5 === 3;
  return isVideo
    ? {
        id: `clip-${index + 1}`,
        uri: `file:///clips/${index + 1}.mp4`,
        kind: "video" as const,
        width: 1920,
        height: 1080,
        rotationDeg: 0 as const,
        durationSec: 3 + (index % 4) * 6,
      }
    : {
        id: `photo-${index + 1}`,
        uri: `file:///photos/${index + 1}.jpg`,
        kind: "photo" as const,
        width: 3000,
        height: 4000,
        rotationDeg: 0 as const,
      };
});

const cutList = buildCutList(beatMap, media, template);

const pad = (value: string, width: number) => value.padEnd(width);
const padLeft = (value: string, width: number) => value.padStart(width);

console.log(`\nTrack     ${beatMap.title} — ${beatMap.artist}`);
console.log(`Tempo     ${beatMap.bpm.toFixed(0)} BPM`);
console.log(`Template  ${template.name} (${template.id})`);
console.log(
  `Reel      ${cutList.totalDurationSec.toFixed(2)}s from ${cutList.audioStartSec.toFixed(2)}s · ` +
    `${cutList.cuts.length} cuts · ${cutList.itemsUsed} used · ${cutList.itemsDropped} dropped\n`,
);

console.log(
  pad("#", 4) + pad("start", 9) + pad("length", 9) + pad("energy", 8) + pad("band", 8) +
    pad("item", 12) + pad("fit", 22) + "transition",
);
console.log("-".repeat(88));

for (const [index, cut] of cutList.cuts.entries()) {
  const item = media[cut.mediaIndex] as MediaItem;
  const beatIndex = nearestBeatIndex(beatMap.beatsSec, cut.startSec);
  const energy = beatMap.energyCurve[beatIndex] as number;

  let fit = "still";
  if (item.kind === "video") {
    if (cut.freezeFromSec !== undefined) fit = `freeze from ${cut.freezeFromSec.toFixed(2)}s`;
    else if (cut.speed !== undefined && cut.speed !== 1) fit = `speed ${cut.speed.toFixed(2)}x`;
    else fit = `trim ${cut.sourceInSec?.toFixed(2)}–${cut.sourceOutSec?.toFixed(2)}s`;
  } else if (cut.motion) {
    fit = `ken burns ${cut.motion.fromScale.toFixed(2)}→${cut.motion.toScale.toFixed(2)}`;
  }

  console.log(
    pad(String(index + 1), 4) +
      padLeft(cut.startSec.toFixed(2), 7) + "  " +
      padLeft((cut.endSec - cut.startSec).toFixed(2), 7) + "  " +
      padLeft(energy.toFixed(2), 6) + "  " +
      pad(bandForEnergy(energy), 8) +
      pad(item.id, 12) +
      pad(fit, 22) +
      cut.transitionIn,
  );
}

const lengths = cutList.cuts.map((cut) => cut.endSec - cut.startSec);
console.log(
  `\nShortest ${Math.min(...lengths).toFixed(2)}s · longest ${Math.max(...lengths).toFixed(2)}s · ` +
    `${new Set(lengths.map((value) => value.toFixed(2))).size} distinct lengths\n`,
);
