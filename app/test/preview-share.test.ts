/**
 * Phases 5 and 7 — recommendation, the metronome, and the Instagram handoff.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { BeatMap, Template } from "@thumpcut/cut-engine";
import { COPY, formatBpm, formatCounter, formatDuration, formatInPoint, formatMadeFor, formatPercent, formatPreciseDuration, formatSelectionHeader, formatTemplateMeta } from "../src/copy.ts";
import {
  filterByMood,
  findSubstituteTrack,
  markersForCuts,
  recommendTemplates,
  shuffleOrder,
} from "../src/templates/recommend.ts";
import type { CatalogueTemplate, CatalogueTrack } from "../src/catalogue/types.ts";
import { clicksInWindow, SilentPreviewAudio } from "../src/audio/PreviewAudio.ts";
import {
  BEAT_CLICK,
  DOWNBEAT_CLICK,
  clickDataUri,
  renderClick,
  toBase64,
  toWavBytes,
} from "../src/audio/clickSource.ts";
import { ShareController, SaveError, type ShareEnvironment } from "../src/share/controller.ts";

function template(id: string, low: number, high: number, mood = "Upbeat"): CatalogueTemplate {
  return {
    id,
    name: id,
    mood: mood as CatalogueTemplate["mood"],
    previewVideoUrl: "",
    previewPosterUrl: "",
    idealItemRange: [low, high],
    density: { low: 4, medium: 2, high: 1, drop: 1 },
    transition: "cut",
    photoMotion: { type: "none", intensityPct: 0 },
    videoBehaviour: { allowSpeedFit: true, speedRange: [0.6, 1.6], preferSpanning: false },
  };
}

const TEMPLATES = [
  template("wide", 5, 25),
  template("small", 3, 6, "Chill"),
  template("mid", 8, 12, "Hype"),
  template("large", 20, 30, "Cinematic"),
];

describe("recommendation", () => {
  it("puts templates that suit the count first", () => {
    const result = recommendTemplates(TEMPLATES, 9);
    assert.deepEqual(result.madeFor.map((t) => t.id), ["mid", "wide"]);
  });

  it("never hides the rest", () => {
    const result = recommendTemplates(TEMPLATES, 9);
    assert.deepEqual(result.alsoWorks.map((t) => t.id), ["small", "large"]);
    assert.equal(
      result.madeFor.length + result.alsoWorks.length,
      TEMPLATES.length,
      "every template must still be reachable",
    );
  });

  it("sorts the best fit to the front", () => {
    // 10 is dead centre of mid's 8–12 and off-centre for wide's 5–25.
    assert.equal(recommendTemplates(TEMPLATES, 10).madeFor[0]?.id, "mid");
  });

  it("an item count nothing suits leaves everything under Also works", () => {
    const result = recommendTemplates(TEMPLATES, 40);
    assert.deepEqual(result.madeFor, []);
    assert.equal(result.alsoWorks.length, TEMPLATES.length);
  });

  it("is stable across runs", () => {
    assert.deepEqual(recommendTemplates(TEMPLATES, 9), recommendTemplates(TEMPLATES, 9));
  });

  it("the header reads the way the design brief specifies", () => {
    assert.equal(formatMadeFor(9), "MADE FOR 9 ITEMS");
  });
});

describe("mood filtering", () => {
  it("All passes everything", () => {
    assert.equal(filterByMood(TEMPLATES, "All").length, TEMPLATES.length);
  });

  it("a mood narrows to that mood", () => {
    assert.deepEqual(filterByMood(TEMPLATES, "Hype").map((t) => t.id), ["mid"]);
  });

  it("the chips are exactly the ones the design brief names", () => {
    assert.deepEqual([...COPY.gallery.moods], ["All", "Chill", "Upbeat", "Hype", "Cinematic"]);
  });
});

describe("track substitution when a track is retired mid-session", () => {
  const tracks: CatalogueTrack[] = [
    { trackId: "a", title: "A", artist: "", bpm: 120, durationSec: 60, contentHash: "h", beatMapPath: "" },
    { trackId: "b", title: "B", artist: "", bpm: 123, durationSec: 60, contentHash: "h", beatMapPath: "" },
    { trackId: "c", title: "C", artist: "", bpm: 140, durationSec: 60, contentHash: "h", beatMapPath: "" },
  ];

  it("picks the nearest tempo within four BPM", () => {
    assert.equal(findSubstituteTrack(tracks, 124, "a")?.trackId, "b");
  });

  it("refuses anything further away than that", () => {
    assert.equal(findSubstituteTrack(tracks, 100, "a"), null);
  });

  it("never picks the retired track itself", () => {
    assert.notEqual(findSubstituteTrack(tracks, 120, "a")?.trackId, "a");
  });

  it("the notice reads exactly as specified", () => {
    assert.equal(COPY.preview.trackRetired, "That track isn't available anymore. Here's a similar one.");
  });
});

describe("shuffle", () => {
  it("is deterministic for a seed, so the preview and the export cannot diverge", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    assert.deepEqual(shuffleOrder(items, 42), shuffleOrder(items, 42));
  });

  it("a different seed gives a different order", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    assert.notDeepEqual(shuffleOrder(items, 1), shuffleOrder(items, 2));
  });

  it("keeps every item", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    assert.deepEqual([...shuffleOrder(items, 99)].sort((a, b) => a - b), items);
  });
});

describe("the beat ruler's markers", () => {
  it("one marker per cut, carrying whether it is a photo or a clip", () => {
    const cuts = [
      { startSec: 0, mediaIndex: 0 },
      { startSec: 1, mediaIndex: 1 },
      { startSec: 2, mediaIndex: 0 },
    ];
    const media = [{ kind: "photo" as const }, { kind: "video" as const }];
    const markers = markersForCuts(cuts, media);

    assert.equal(markers.length, cuts.length, "V3 — exactly one marker per cut");
    assert.deepEqual(markers.map((marker) => marker.kind), ["photo", "video", "photo"]);
  });
});

describe("the metronome", () => {
  const beatMap = {
    beatsSec: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
    downbeatsSec: [0, 2],
  } as BeatMap;

  it("clicks on every beat", () => {
    assert.equal(clicksInWindow(beatMap, 0, 4).length, 8);
  });

  it("uses the stronger click on a downbeat and only there", () => {
    const clicks = clicksInWindow(beatMap, 0, 4);
    assert.deepEqual(
      clicks.filter((click) => click.kind === "downbeat").map((click) => click.atSec),
      [0, 2],
    );
  });

  it("only returns what is inside the window", () => {
    assert.deepEqual(
      clicksInWindow(beatMap, 1, 2).map((click) => click.atSec),
      [1, 1.5, 2],
    );
  });

  it("the click is generated, not fetched — no file, no network", () => {
    const uri = clickDataUri(BEAT_CLICK);
    assert.ok(uri.startsWith("data:audio/wav;base64,"));
    assert.ok(uri.length > 500, "the click should contain real samples");
    assert.equal(uri.includes("http"), false, "nothing is ever fetched for the preview");
  });

  it("a downbeat click is longer and louder than a beat click", () => {
    assert.ok(DOWNBEAT_CLICK.durationSec > BEAT_CLICK.durationSec);
    assert.ok(DOWNBEAT_CLICK.amplitude > BEAT_CLICK.amplitude);
  });

  it("renders a WAV with a correct header", () => {
    const wav = toWavBytes(renderClick(BEAT_CLICK));
    const text = String.fromCharCode(...wav.slice(0, 4));
    assert.equal(text, "RIFF");
    assert.equal(String.fromCharCode(...wav.slice(8, 12)), "WAVE");
    assert.equal(String.fromCharCode(...wav.slice(36, 40)), "data");
  });

  it("base64 encodes the way the platform expects", () => {
    assert.equal(toBase64(new Uint8Array([77, 97, 110])), "TWFu");
    assert.equal(toBase64(new Uint8Array([77, 97])), "TWE=");
    assert.equal(toBase64(new Uint8Array([77])), "TQ==");
  });

  it("the click decays rather than holding a tone", () => {
    const samples = renderClick(BEAT_CLICK);
    const start = Math.abs(samples[Math.floor(samples.length * 0.1)] as number);
    const end = Math.abs(samples[samples.length - 1] as number);
    assert.ok(end < start * 0.2, "a click that does not decay is a beep");
  });

  it("the silent implementation still reports a position", () => {
    const audio = new SilentPreviewAudio();
    audio.play(4);
    assert.ok(audio.getPositionSec() >= 4);
    audio.pause();
    const held = audio.getPositionSec();
    assert.equal(audio.getPositionSec(), held);
  });
});

// ---------------------------------------------------------------------------
// Phase 7
// ---------------------------------------------------------------------------

class FakeShareEnvironment implements ShareEnvironment {
  available = true;
  exists = true;
  shareCalls = 0;
  saveCalls = 0;
  shareThrows: Error | null = null;
  saveThrows: Error | null = null;
  settingsOpened = 0;

  async isInstagramAvailable() {
    return this.available;
  }
  async shareToReels() {
    this.shareCalls += 1;
    if (this.shareThrows) throw this.shareThrows;
  }
  async saveToGallery() {
    this.saveCalls += 1;
    if (this.saveThrows) throw this.saveThrows;
  }
  async fileExists() {
    return this.exists;
  }
  async openSettings() {
    this.settingsOpened += 1;
  }
}

describe("the Instagram handoff", () => {
  it("S1 — the button only appears when the platform says it can accept a share", async () => {
    const environment = new FakeShareEnvironment();
    environment.available = false;
    const controller = new ShareController(environment, "file:///reel.mp4");
    const snapshot = await controller.refresh();

    assert.equal(snapshot.instagramAvailable, false);
    assert.equal(snapshot.status, "InstagramUnavailable");
  });

  it("opens Instagram when it is there", async () => {
    const environment = new FakeShareEnvironment();
    const controller = new ShareController(environment, "file:///reel.mp4");
    await controller.refresh();
    const snapshot = await controller.shareToInstagram();

    assert.equal(environment.shareCalls, 1);
    assert.equal(snapshot.status, "Returned");
  });

  it("S2 — the file survives the round trip to Instagram", async () => {
    const environment = new FakeShareEnvironment();
    const controller = new ShareController(environment, "file:///reel.mp4");
    await controller.refresh();
    await controller.shareToInstagram();

    assert.equal(controller.snapshot().videoUri, "file:///reel.mp4");
  });

  it("shows the exact text when the handoff throws", async () => {
    const environment = new FakeShareEnvironment();
    environment.shareThrows = new Error("ActivityNotFoundException");
    const controller = new ShareController(environment, "file:///reel.mp4");
    await controller.refresh();
    const snapshot = await controller.shareToInstagram();

    assert.equal(snapshot.message, "Couldn't open Instagram. You can save the reel and share it manually.");
    assert.equal(snapshot.status, "HandoffFailed");
  });

  it("S3 — a double tap fires one intent", async () => {
    const environment = new FakeShareEnvironment();
    const controller = new ShareController(environment, "file:///reel.mp4");
    await controller.refresh();
    await Promise.all([controller.shareToInstagram(), controller.shareToInstagram()]);

    assert.equal(environment.shareCalls, 1);
  });

  it("a share and a save at the same moment are serialised", async () => {
    const environment = new FakeShareEnvironment();
    const controller = new ShareController(environment, "file:///reel.mp4");
    await controller.refresh();
    await Promise.all([controller.shareToInstagram(), controller.saveToGallery()]);

    assert.equal(environment.shareCalls + environment.saveCalls, 1);
  });

  it("shows the exact text when the reel has gone", async () => {
    const environment = new FakeShareEnvironment();
    environment.exists = false;
    const controller = new ShareController(environment, "file:///reel.mp4");
    const snapshot = await controller.refresh();

    assert.equal(snapshot.message, "That reel is no longer available. Please export again.");
    assert.equal(snapshot.videoUri, null);
  });
});

describe("saving to the gallery", () => {
  it("shows the exact confirmation", async () => {
    const environment = new FakeShareEnvironment();
    const controller = new ShareController(environment, "file:///reel.mp4");
    await controller.refresh();
    const snapshot = await controller.saveToGallery();

    assert.equal(snapshot.message, "Saved to your gallery.");
    assert.equal(snapshot.status, "SaveSuccess");
  });

  it("shows the exact permission text", async () => {
    const environment = new FakeShareEnvironment();
    environment.saveThrows = new SaveError("permission", "denied");
    const controller = new ShareController(environment, "file:///reel.mp4");
    await controller.refresh();
    const snapshot = await controller.saveToGallery();

    assert.equal(snapshot.message, "ThumpCut needs permission to save to your gallery.");
  });

  it("shows the exact storage text", async () => {
    const environment = new FakeShareEnvironment();
    environment.saveThrows = new SaveError("storage", "full");
    const controller = new ShareController(environment, "file:///reel.mp4");
    await controller.refresh();
    const snapshot = await controller.saveToGallery();

    assert.equal(snapshot.message, "Not enough storage to save. Free up some space and try again.");
  });

  it("still works when Instagram is not installed", async () => {
    const environment = new FakeShareEnvironment();
    environment.available = false;
    const controller = new ShareController(environment, "file:///reel.mp4");
    await controller.refresh();
    const snapshot = await controller.saveToGallery();

    assert.equal(snapshot.status, "SaveSuccess");
  });
});

describe("every number is formatted the way the design brief specifies", () => {
  it("clip lengths", () => {
    assert.equal(formatDuration(12), "0:12");
    assert.equal(formatDuration(72), "1:12");
    assert.equal(formatDuration(0), "0:00");
    assert.equal(formatDuration(Number.NaN), "0:00");
  });

  it("trim in-points, to a tenth", () => {
    assert.equal(formatPreciseDuration(2.44), "0:02.4");
    assert.equal(formatInPoint(2.44), "IN 0:02.4");
  });

  it("the selection header", () => {
    assert.equal(formatSelectionHeader(9, 3), "9 items · 3 clips");
    assert.equal(formatSelectionHeader(1, 1), "1 item · 1 clip");
    assert.equal(formatSelectionHeader(4, 0), "4 items");
  });

  it("the counter", () => {
    assert.equal(formatCounter(0, 30), "0/30");
  });

  it("tempo, always with its unit", () => {
    assert.equal(formatBpm(128.4), "128 BPM");
  });

  it("export progress", () => {
    assert.equal(formatPercent(0.47), "47%");
    assert.equal(formatPercent(2), "100%");
    assert.equal(formatPercent(Number.NaN), "0%");
  });

  it("the template card's meta line", () => {
    assert.equal(formatTemplateMeta(128, [8, 16]), "128 BPM · 8–16 items");
  });
});

describe("copy rules the design brief sets", () => {
  const everyString = collectStrings(COPY);

  it("has no exclamation marks anywhere", () => {
    for (const value of everyString) {
      assert.equal(value.includes("!"), false, `"${value}" has an exclamation mark`);
    }
  });

  it("never says AI, magic, smart, or powered by", () => {
    for (const value of everyString) {
      assert.equal(/\b(AI|magic|smart|powered by)\b/i.test(value), false, `"${value}"`);
    }
  });

  it("never apologises or says Oops", () => {
    for (const value of everyString) {
      assert.equal(/\b(oops|sorry|apolog)/i.test(value), false, `"${value}"`);
    }
  });

  it("never says media assets", () => {
    for (const value of everyString) {
      assert.equal(/media asset/i.test(value), false, `"${value}"`);
    }
  });

  it("mentions Instagram only where it is allowed to", () => {
    const allowed = new Set<string>([
      COPY.share.shareToInstagram,
      COPY.share.pickYourTrack,
      COPY.share.handoffFailed,
    ]);
    for (const value of everyString) {
      if (/instagram/i.test(value) && !allowed.has(value)) {
        assert.fail(`"${value}" names Instagram outside the share screen`);
      }
    }
  });
});

function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const entry of value) collectStrings(entry, out);
  else if (value && typeof value === "object") {
    for (const entry of Object.values(value)) collectStrings(entry, out);
  }
  return out;
}

// Referenced so the type import is not unused when the file is read on its own.
export type { Template };
