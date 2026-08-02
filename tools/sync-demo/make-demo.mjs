/**
 * Builds a page that plays a track and cuts the pictures on its beats.
 *
 * This is the answer to "show me the sync". The app's own export is silent by design — the
 * user picks the track inside Instagram — so there is nowhere in the product itself where you
 * can watch the pictures change *and* hear the music at the same time. This is that, off to
 * one side, for looking at.
 *
 * Nothing here is a mock-up. It reads the real beat map the Factory produced and runs the real
 * `@thumpcut/cut-engine` to decide the cuts, so what you watch is what the phone would render.
 * The page also prints how far each cut sits from its beat, which is the number the whole
 * product rests on.
 *
 * Usage:
 *   node --experimental-strip-types tools/sync-demo/make-demo.mjs
 *   node --experimental-strip-types tools/sync-demo/make-demo.mjs --track fixture-hype-150 --items 14
 *   node --experimental-strip-types tools/sync-demo/make-demo.mjs --photos "C:/path/to/photos"
 *
 * The audio is copied next to the page, so the folder can be zipped and opened anywhere.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildCutList } from "../../packages/cut-engine/src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const OUT = join(ROOT, "artifacts", "demo");

/** Where the owner drops his own music. Gitignored — nothing commercial reaches the repo. */
const LOCAL_AUDIO = join(ROOT, "factory", "local");
const FIXTURE_AUDIO = join(ROOT, "factory", "fixtures");

const PHOTO_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

function argument(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

/** Which catalogue to read. A local-music run writes its own, away from the published one. */
const CATALOGUE = resolve(ROOT, argument("catalogue", "catalogue"));

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

function loadCatalogue() {
  const file = join(CATALOGUE, "catalogue.json");
  if (!existsSync(file)) {
    throw new Error(
      `No catalogue at ${file}. Run: python -m factory.run --no-upload --out catalogue`,
    );
  }
  return JSON.parse(readFileSync(file, "utf8"));
}

function loadBeatMap(track) {
  const file = join(CATALOGUE, track.beatMapPath);
  if (!existsSync(file)) throw new Error(`No beat map at ${file}`);
  return JSON.parse(readFileSync(file, "utf8"));
}

/**
 * The audio itself. The catalogue deliberately does not carry it — the Factory deletes every
 * byte of audio at the end of a run — so it is found by name beside the fixtures, or in the
 * local drop folder.
 */
function findAudio(trackId) {
  for (const directory of [LOCAL_AUDIO, FIXTURE_AUDIO]) {
    if (!existsSync(directory)) continue;
    for (const name of readdirSync(directory)) {
      const stem = basename(name, extname(name));
      if (stem === trackId || stem === trackId.replace(/^fixture-/, "")) {
        return join(directory, name);
      }
    }
  }
  return null;
}

/**
 * The pictures. Real ones if a folder was given; otherwise generated panels, which for
 * *this* purpose are better than photographs — a flat colour changing is unmistakable, and
 * nobody has to squint at a holiday snap to see whether the cut was late.
 */
function buildFrames(count, photoDir) {
  if (photoDir) {
    const files = readdirSync(photoDir)
      .filter((name) => PHOTO_EXTENSIONS.has(extname(name).toLowerCase()))
      .sort()
      .slice(0, count);
    if (files.length < 3) {
      throw new Error(`Found ${files.length} pictures in ${photoDir}; at least 3 are needed.`);
    }
    for (const name of files) copyFileSync(join(photoDir, name), join(OUT, name));
    return files.map((name, index) => ({ label: String(index + 1), image: name, hue: null }));
  }

  // Spread around the wheel so no two neighbours are close enough to be mistaken for each
  // other mid-cut.
  return Array.from({ length: count }, (_, index) => ({
    label: String(index + 1),
    image: null,
    hue: Math.round((index * 360) / count),
  }));
}

// ---------------------------------------------------------------------------
// The measurement that matters
// ---------------------------------------------------------------------------

/** How far each cut falls from the nearest beat, in milliseconds. */
function beatOffsets(cutList, beatMap) {
  return cutList.cuts.map((cut) => {
    let best = Infinity;
    for (const beat of beatMap.beatsSec) {
      const gap = Math.abs(beat - cut.startSec);
      if (gap < best) best = gap;
    }
    return Math.round(best * 1000);
  });
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

const catalogue = loadCatalogue();
const trackId = argument("track", catalogue.tracks[0]?.trackId);
const track = catalogue.tracks.find((candidate) => candidate.trackId === trackId);
if (!track) {
  throw new Error(
    `No track "${trackId}". The catalogue holds: ${catalogue.tracks.map((t) => t.trackId).join(", ")}`,
  );
}

const itemCount = Number(argument("items", "12"));
const photoDir = argument("photos");

mkdirSync(OUT, { recursive: true });

const beatMap = loadBeatMap(track);
const frames = buildFrames(itemCount, photoDir);

const media = frames.map((frame, index) => ({
  id: `item-${index}`,
  uri: `frame-${index}`,
  kind: "photo",
  width: 1080,
  height: 1920,
  rotationDeg: 0,
}));

const audioPath = findAudio(track.trackId);
if (!audioPath) {
  throw new Error(
    `No audio found for "${track.trackId}".\n` +
      `  Fixtures live in factory/fixtures/. Your own tracks go in factory/local/,\n` +
      `  named to match the track id in the catalogue.`,
  );
}
const audioName = basename(audioPath);
copyFileSync(audioPath, join(OUT, audioName));

/** One cut list per template, so the same track can be heard cut five different ways. */
const takes = [];
for (const template of catalogue.templates) {
  try {
    const cutList = buildCutList(beatMap, media, template);
    const offsets = beatOffsets(cutList, beatMap);
    takes.push({
      id: template.id,
      name: template.name,
      mood: template.mood,
      cuts: cutList.cuts.map((cut) => ({
        i: cut.mediaIndex,
        start: Number(cut.startSec.toFixed(4)),
        end: Number(cut.endSec.toFixed(4)),
      })),
      audioStartSec: cutList.audioStartSec,
      totalDurationSec: cutList.totalDurationSec,
      worstOffsetMs: offsets.length ? Math.max(...offsets) : 0,
    });
  } catch (error) {
    console.log(`  skipped ${template.id}: ${error.message}`);
  }
}

if (takes.length === 0) throw new Error("No template could cut this track with these items.");

const payload = {
  track: { title: track.title, artist: track.artist, bpm: track.bpm, audio: audioName },
  beats: beatMap.beatsSec.map((value) => Number(value.toFixed(4))),
  downbeats: (beatMap.downbeatsSec ?? []).map((value) => Number(value.toFixed(4))),
  frames,
  takes,
};

writeFileSync(join(OUT, "index.html"), page(payload), "utf8");

console.log("ThumpCut sync demo");
console.log(`  track      ${track.title} — ${track.artist}, ${track.bpm} BPM`);
console.log(`  pictures   ${frames.length}${photoDir ? ` from ${photoDir}` : " (generated)"}`);
for (const take of takes) {
  console.log(
    `  ${take.name.padEnd(12)} ${String(take.cuts.length).padStart(2)} cuts, ` +
      `worst cut lands ${take.worstOffsetMs}ms from its beat`,
  );
}
console.log(`\n  Open: ${join(OUT, "index.html")}`);

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

function page(data) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ThumpCut — beat sync demo</title>
<style>
  :root {
    --graphite: #17181A; --panel: #23252A; --bone: #EAE6DE;
    --signal: #FF9E2C; --cool: #4FB8C4;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--graphite); color: var(--bone);
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    display: flex; flex-direction: column; align-items: center;
    gap: 18px; padding: 24px 16px 40px;
  }
  h1 { font-size: 17px; font-weight: 600; margin: 0; letter-spacing: -0.01em; }
  .meta { font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; font-size: 13px; opacity: .62; }
  .stage {
    position: relative; width: min(320px, 78vw); aspect-ratio: 9/16;
    border-radius: 12px; overflow: hidden; background: #1B1C1F;
    display: grid; place-items: center;
  }
  .frame {
    position: absolute; inset: 0; display: grid; place-items: center;
    font-size: 84px; font-weight: 700; color: rgba(23,24,26,.8);
    background-size: cover; background-position: center;
  }
  .flash {
    position: absolute; inset: 0; background: var(--bone);
    opacity: 0; pointer-events: none;
  }
  .ruler { width: min(680px, 92vw); }
  canvas { width: 100%; height: 62px; display: block; }
  .row { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
  button {
    font: inherit; font-size: 14px; color: var(--bone); background: var(--panel);
    border: 1px solid rgba(234,230,222,.14); border-radius: 8px;
    padding: 10px 16px; cursor: pointer; min-height: 44px;
  }
  button.primary { background: var(--bone); color: var(--graphite); border-color: transparent; font-weight: 600; }
  button.on { border-color: var(--cool); color: var(--cool); }
  .stat {
    font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
    font-size: 12px; opacity: .55; text-align: center; max-width: 560px; line-height: 1.6;
  }
  .stat b { color: var(--signal); font-weight: 600; }
</style>
</head>
<body>
  <h1>ThumpCut — the cuts, on the beat</h1>
  <div class="meta" id="trackline"></div>

  <div class="stage">
    <div class="frame" id="frame"></div>
    <div class="flash" id="flash"></div>
  </div>

  <div class="ruler"><canvas id="ruler" width="1360" height="124"></canvas></div>

  <div class="row">
    <button class="primary" id="play">Play</button>
  </div>
  <div class="row" id="takes"></div>

  <div class="stat" id="stat"></div>

  <audio id="audio" preload="auto"></audio>

<script>
const DATA = ${JSON.stringify(data)};

const audio = document.getElementById("audio");
const frameEl = document.getElementById("frame");
const flashEl = document.getElementById("flash");
const playEl = document.getElementById("play");
const statEl = document.getElementById("stat");
const canvas = document.getElementById("ruler");
const ctx = canvas.getContext("2d");

audio.src = DATA.track.audio;
document.getElementById("trackline").textContent =
  DATA.track.title + " · " + DATA.track.artist + " · " + DATA.track.bpm.toFixed(0) + " BPM";

let take = DATA.takes[0];
let lastCut = -1;

const takesRow = document.getElementById("takes");
DATA.takes.forEach((candidate, index) => {
  const button = document.createElement("button");
  button.textContent = candidate.name;
  button.className = index === 0 ? "on" : "";
  button.onclick = () => {
    take = candidate;
    lastCut = -1;
    [...takesRow.children].forEach((child) => child.classList.remove("on"));
    button.classList.add("on");
    seekToStart();
    describe();
    draw();
  };
  takesRow.appendChild(button);
});

/**
 * Jump to the part of the track the engine chose.
 *
 * Not simply \`audio.currentTime = x\`: a seek issued before the browser has read the file's
 * metadata is silently dropped, and playback then starts at zero — which is nowhere near the
 * chosen window, so the pictures never change and the demo looks broken.
 */
function seekToStart() {
  if (audio.readyState >= 1) {
    audio.currentTime = take.audioStartSec;
    return;
  }
  audio.addEventListener("loadedmetadata", () => { audio.currentTime = take.audioStartSec; }, { once: true });
}

function describe() {
  statEl.innerHTML =
    take.name + " — <b>" + take.cuts.length + " cuts</b> across " +
    take.totalDurationSec.toFixed(1) + "s. " +
    "The furthest any cut sits from its beat is <b>" + take.worstOffsetMs + " ms</b>. " +
    "The product's own limit is 50 ms; a person starts noticing at about 30.";
}

function paintFrame(index) {
  const frame = DATA.frames[index];
  if (!frame) return;
  if (frame.image) {
    frameEl.style.background = "#1B1C1F url('" + frame.image + "') center/cover no-repeat";
    frameEl.textContent = "";
  } else {
    frameEl.style.background = "hsl(" + frame.hue + " 46% 52%)";
    frameEl.textContent = frame.label;
  }
}

function flash() {
  flashEl.style.transition = "none";
  flashEl.style.opacity = "0.5";
  requestAnimationFrame(() => {
    flashEl.style.transition = "opacity 110ms ease-out";
    flashEl.style.opacity = "0";
  });
}

function draw() {
  const width = canvas.width;
  const height = canvas.height;
  const from = take.audioStartSec;
  const to = from + take.totalDurationSec;
  const span = to - from;
  const x = (t) => ((t - from) / span) * width;

  ctx.clearRect(0, 0, width, height);

  // Beats, with downbeats taller. This is the grid everything else answers to.
  for (const beat of DATA.beats) {
    if (beat < from || beat > to) continue;
    const down = DATA.downbeats.includes(beat);
    ctx.fillStyle = down ? "rgba(234,230,222,.5)" : "rgba(234,230,222,.22)";
    const h = down ? 34 : 20;
    ctx.fillRect(Math.round(x(beat)), height - h - 34, down ? 3 : 2, h);
  }

  // Cuts. Teal, because in the app teal means "this is the one you chose".
  ctx.fillStyle = "#4FB8C4";
  for (const cut of take.cuts) ctx.fillRect(Math.round(x(cut.start)) - 1, 8, 4, 30);

  // Playhead.
  const now = audio.currentTime;
  if (now >= from && now <= to) {
    ctx.fillStyle = "#FF9E2C";
    ctx.fillRect(Math.round(x(now)) - 1, 0, 3, height - 24);
  }
}

function update() {
  const now = audio.currentTime;
  let index = -1;
  for (let i = 0; i < take.cuts.length; i += 1) {
    if (now >= take.cuts[i].start && now < take.cuts[i].end) { index = i; break; }
  }
  if (index >= 0 && index !== lastCut) {
    lastCut = index;
    paintFrame(take.cuts[index].i);
    flash();
  }
  if (now >= take.audioStartSec + take.totalDurationSec) {
    seekToStart();
    lastCut = -1;
  }
  draw();
}

function tick() {
  update();
  requestAnimationFrame(tick);
}

// A browser stops serving animation frames to a tab nobody is looking at, and the demo would
// freeze mid-track. The timer is the floor; the animation frame is what makes it smooth.
setInterval(update, 120);

playEl.onclick = () => {
  if (audio.paused) {
    const end = take.audioStartSec + take.totalDurationSec;
    if (audio.currentTime < take.audioStartSec || audio.currentTime >= end) seekToStart();
    void audio.play();
    playEl.textContent = "Pause";
  } else {
    audio.pause();
    playEl.textContent = "Play";
  }
};

audio.addEventListener("ended", () => { playEl.textContent = "Play"; });

describe();
paintFrame(0);
requestAnimationFrame(tick);
</script>
</body>
</html>
`;
}
