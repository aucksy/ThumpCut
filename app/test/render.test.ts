/**
 * Phase 6 — export.
 *
 * The MP4 validator is tested against MP4 boxes built here by hand, valid and deliberately
 * broken. That is the only way to prove the check actually catches an edit list or a variable
 * frame rate without a phone in the loop — and those two are exactly the failures that look
 * fine on the phone and then drift once Instagram re-encodes the reel.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { CutList, MediaItem } from "@thumpcut/cut-engine";
import { COPY } from "../src/copy.ts";
import {
  DURATION_TOLERANCE_SEC,
  OUTPUT_FPS,
  OUTPUT_HEIGHT,
  OUTPUT_WIDTH,
  summarise,
  validateExport,
} from "../src/render/mp4.ts";
import {
  NativeRenderError,
  RenderController,
  type RenderEnvironment,
  type RenderSnapshot,
} from "../src/render/orchestrator.ts";
import { toNativeCuts } from "../src/render/nativeCuts.ts";

// ---------------------------------------------------------------------------
// A tiny MP4 writer, so the validator can be pointed at real boxes.
// ---------------------------------------------------------------------------

function box(type: string, ...payloads: Uint8Array[]): Uint8Array {
  const body = concat(payloads);
  const out = new Uint8Array(8 + body.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, out.length);
  for (let index = 0; index < 4; index += 1) out[4 + index] = type.charCodeAt(index);
  out.set(body, 8);
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function u32(...values: number[]): Uint8Array {
  const out = new Uint8Array(values.length * 4);
  const view = new DataView(out.buffer);
  values.forEach((value, index) => view.setUint32(index * 4, value >>> 0));
  return out;
}

function u16(...values: number[]): Uint8Array {
  const out = new Uint8Array(values.length * 2);
  const view = new DataView(out.buffer);
  values.forEach((value, index) => view.setUint16(index * 2, value));
  return out;
}

function ascii(text: string): Uint8Array {
  return new Uint8Array([...text].map((character) => character.charCodeAt(0)));
}

interface FileOptions {
  width?: number;
  height?: number;
  timescale?: number;
  /** [count, delta] pairs. More than one distinct delta means variable frame rate. */
  stts?: [number, number][];
  withEditList?: boolean;
  withAudioTrack?: boolean;
  moovLast?: boolean;
  durationSec?: number;
}

function tkhd(width: number, height: number): Uint8Array {
  // version 0: 4 flags + 4 created + 4 modified + 4 id + 4 reserved + 4 duration
  // + 8 reserved + 2 layer + 2 group + 2 volume + 2 reserved + 36 matrix, then w/h.
  const head = new Uint8Array(4 + 4 + 4 + 4 + 4 + 4 + 8 + 2 + 2 + 2 + 2 + 36);
  return box("tkhd", head, u16(width, 0, height, 0));
}

function mdhd(timescale: number, durationUnits: number): Uint8Array {
  return box("mdhd", u32(0), u32(0, 0, timescale, durationUnits), u32(0));
}

function hdlr(handler: string): Uint8Array {
  return box("hdlr", u32(0), ascii("\0\0\0\0"), ascii(handler), u32(0, 0, 0), ascii("\0"));
}

function stts(entries: [number, number][]): Uint8Array {
  return box("stts", u32(0), u32(entries.length), u32(...entries.flat()));
}

function trak(options: {
  handler: string;
  width: number;
  height: number;
  timescale: number;
  durationUnits: number;
  entries: [number, number][];
  editList: boolean;
}): Uint8Array {
  const parts = [tkhd(options.width, options.height)];
  if (options.editList) parts.push(box("edts", box("elst", u32(0), u32(1), u32(100, 0, 1))));
  parts.push(
    box(
      "mdia",
      mdhd(options.timescale, options.durationUnits),
      hdlr(options.handler),
      box("minf", box("stbl", box("stsd", u32(0, 0)), stts(options.entries))),
    ),
  );
  return box("trak", ...parts);
}

function makeMp4(options: FileOptions = {}): Uint8Array {
  const width = options.width ?? OUTPUT_WIDTH;
  const height = options.height ?? OUTPUT_HEIGHT;
  const timescale = options.timescale ?? 30000;
  const durationSec = options.durationSec ?? 10;
  const entries = options.stts ?? [[Math.round(durationSec * OUTPUT_FPS), timescale / OUTPUT_FPS]];
  const durationUnits = Math.round(durationSec * timescale);

  const traks = [
    trak({
      handler: "vide",
      width,
      height,
      timescale,
      durationUnits,
      entries,
      editList: options.withEditList ?? false,
    }),
  ];
  if (options.withAudioTrack) {
    traks.push(
      trak({
        handler: "soun",
        width: 0,
        height: 0,
        timescale: 44100,
        durationUnits: Math.round(durationSec * 44100),
        entries: [[1024, 1024]],
        editList: false,
      }),
    );
  }

  const moov = box("moov", box("mvhd", u32(0), u32(0, 0, 1000, Math.round(durationSec * 1000))), ...traks);
  const ftyp = box("ftyp", ascii("isom"), u32(512), ascii("isomiso2avc1mp41"));
  const mdat = box("mdat", new Uint8Array(64));

  return options.moovLast ? concat([ftyp, mdat, moov]) : concat([ftyp, moov, mdat]);
}

// ---------------------------------------------------------------------------

describe("reading an MP4", () => {
  it("finds the top-level boxes", () => {
    const summary = summarise(makeMp4());
    assert.deepEqual(summary.boxes, ["ftyp", "moov", "mdat"]);
    assert.equal(summary.hasFtyp, true);
    assert.equal(summary.moovBeforeMdat, true);
  });

  it("reads the video track's size and frame timing", () => {
    const summary = summarise(makeMp4());
    const video = summary.tracks.find((track) => track.handler === "vide");
    assert.equal(video?.width, OUTPUT_WIDTH);
    assert.equal(video?.height, OUTPUT_HEIGHT);
    assert.equal(video?.timeToSample.length, 1);
  });

  it("notices an audio track", () => {
    const summary = summarise(makeMp4({ withAudioTrack: true }));
    assert.equal(summary.tracks.filter((track) => track.handler === "soun").length, 1);
  });
});

describe("spec 06 §2.1 — the export gate", () => {
  it("passes a correct file", () => {
    const result = validateExport(makeMp4({ durationSec: 12 }), 12);
    assert.deepEqual(result.failures, []);
    assert.equal(result.valid, true);
  });

  it("fails a file with an edit list", () => {
    const result = validateExport(makeMp4({ withEditList: true }), 10);
    assert.equal(result.valid, false);
    assert.ok(result.failures.some((failure) => failure.includes("edit list")));
  });

  it("fails a file with an audio track", () => {
    const result = validateExport(makeMp4({ withAudioTrack: true }), 10);
    assert.equal(result.valid, false);
    assert.ok(result.failures.some((failure) => failure.includes("audio track")));
  });

  it("fails a variable frame rate file", () => {
    const result = validateExport(
      makeMp4({ stts: [[100, 1000], [100, 1001]] }),
      10,
    );
    assert.equal(result.valid, false);
    assert.ok(result.failures.some((failure) => failure.includes("variable frame rate")));
  });

  it("fails a file at the wrong frame rate", () => {
    // 25fps: a 30000 timescale with a 1200 delta.
    const result = validateExport(makeMp4({ stts: [[250, 1200]] }), 10);
    assert.equal(result.valid, false);
    assert.ok(result.failures.some((failure) => failure.includes("25.00fps")));
  });

  it("fails a file at the wrong size", () => {
    const result = validateExport(makeMp4({ width: 720, height: 1280 }), 10);
    assert.equal(result.valid, false);
    assert.ok(result.failures.some((failure) => failure.includes("720x1280")));
  });

  it("fails a file whose moov atom is not first", () => {
    const result = validateExport(makeMp4({ moovLast: true }), 10);
    assert.equal(result.valid, false);
    assert.ok(result.failures.some((failure) => failure.includes("moov")));
  });

  it("fails a file that is the wrong length", () => {
    const result = validateExport(makeMp4({ durationSec: 10 }), 14);
    assert.equal(result.valid, false);
    assert.ok(result.failures.some((failure) => failure.includes("but the edit is")));
  });

  it("accepts a length inside the tolerance", () => {
    const result = validateExport(
      makeMp4({ durationSec: 10 }),
      10 + DURATION_TOLERANCE_SEC * 0.5,
    );
    assert.equal(result.valid, true);
  });

  it("fails something that is not an MP4 at all", () => {
    const result = validateExport(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]), 10);
    assert.equal(result.valid, false);
  });

  it("reports every problem at once, not just the first", () => {
    const result = validateExport(
      makeMp4({ withEditList: true, withAudioTrack: true, width: 720, height: 1280 }),
      10,
    );
    assert.ok(result.failures.length >= 3, JSON.stringify(result.failures));
  });
});

describe("spec 09 §2.1 — the export gate when the reel carries its music", () => {
  it("passes a file with exactly one audio track", () => {
    const result = validateExport(makeMp4({ withAudioTrack: true, durationSec: 12 }), 12, {
      expectAudio: true,
    });
    assert.deepEqual(result.failures, []);
    assert.equal(result.valid, true);
  });

  it("fails a silent file — a reel built to carry its music must not come out mute", () => {
    const result = validateExport(makeMp4({ durationSec: 12 }), 12, { expectAudio: true });
    assert.equal(result.valid, false);
    assert.ok(result.failures.some((failure) => failure.includes("expected exactly one audio")));
  });

  it("still enforces every video rule with audio present", () => {
    const result = validateExport(
      makeMp4({ withAudioTrack: true, withEditList: true, durationSec: 12 }),
      12,
      { expectAudio: true },
    );
    assert.equal(result.valid, false);
    assert.ok(result.failures.some((failure) => failure.includes("edit list")));
  });

  it("the silent mode is untouched: an audio track still fails it", () => {
    const result = validateExport(makeMp4({ withAudioTrack: true }), 10);
    assert.equal(result.valid, false);
    assert.ok(result.failures.some((failure) => failure.includes("it must carry none")));
  });
});

// ---------------------------------------------------------------------------
// The orchestrator
// ---------------------------------------------------------------------------

function media(count: number): MediaItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `m${index}`,
    uri: `file:///m${index}.jpg`,
    kind: "photo" as const,
    width: 3000,
    height: 4000,
    rotationDeg: 0 as const,
  }));
}

function cutList(durationSec = 10): CutList {
  return {
    totalDurationSec: durationSec,
    audioStartSec: 0,
    cuts: [
      { mediaIndex: 0, startSec: 0, endSec: durationSec / 3, transitionIn: "cut" },
      { mediaIndex: 1, startSec: durationSec / 3, endSec: (durationSec * 2) / 3, transitionIn: "cut" },
      { mediaIndex: 2, startSec: (durationSec * 2) / 3, endSec: durationSec, transitionIn: "cut" },
    ],
    itemsUsed: 3,
    itemsDropped: 0,
  };
}

class FakeEnvironment implements RenderEnvironment {
  free = Number.MAX_SAFE_INTEGER;
  unreadable = new Set<string>();
  output: Uint8Array = makeMp4({ durationSec: 10 });
  saved: string[] = [];
  deleted: string[] = [];
  renderCalls = 0;
  failWith: NativeRenderError | null = null;
  failOnce: NativeRenderError | null = null;
  saveThrows = false;
  awake: boolean[] = [];
  onRender: ((request: { onProgress: (value: number) => void }) => void) | null = null;

  estimateOutputBytes() {
    return 100;
  }
  async freeBytes() {
    return this.free;
  }
  async itemIsReadable(item: MediaItem) {
    return !this.unreadable.has(item.id);
  }
  async render(request: { onProgress: (value: number) => void }) {
    this.renderCalls += 1;
    this.onRender?.(request);
    if (this.failOnce) {
      const error = this.failOnce;
      this.failOnce = null;
      throw error;
    }
    if (this.failWith) throw this.failWith;
    request.onProgress(0.5);
    request.onProgress(1);
  }
  async cancelRender() {}
  async readOutput() {
    return this.output;
  }
  async deleteFile(path: string) {
    this.deleted.push(path);
  }
  async saveToGallery(path: string) {
    if (this.saveThrows) throw new Error("no room");
    this.saved.push(path);
    return `content://gallery/${this.saved.length}`;
  }
  makeOutputPath() {
    return "/tmp/reel.mp4";
  }
  keepAwake(on: boolean) {
    this.awake.push(on);
  }
  fetchCalls: string[] = [];
  fetchThrows = false;
  present = new Set<string>();
  async fetchAudio(url: string, toPath: string) {
    this.fetchCalls.push(url);
    if (this.fetchThrows) throw new Error("network");
    this.present.add(toPath);
  }
  makeAudioPath() {
    return "/tmp/track.m4a";
  }
  async fileExists(path: string) {
    return this.present.has(path);
  }
}

describe("the export flow", () => {
  it("completes and saves a valid file", async () => {
    const environment = new FakeEnvironment();
    const controller = new RenderController(environment);
    const result = await controller.start(cutList(), media(5));

    assert.equal(result.status, "Complete");
    assert.equal(environment.saved.length, 1);
    assert.ok(result.outputUri);
  });

  it("keeps the screen awake for the whole render and lets it sleep after", async () => {
    const environment = new FakeEnvironment();
    await new RenderController(environment).start(cutList(), media(5));
    assert.deepEqual(environment.awake, [true, false]);
  });

  it("R-I2 — a file that fails validation is never saved", async () => {
    const environment = new FakeEnvironment();
    environment.output = makeMp4({ withEditList: true });
    const controller = new RenderController(environment);
    const result = await controller.start(cutList(), media(5));

    assert.equal(result.status, "Failed");
    assert.equal(result.error, COPY.render.failed);
    assert.equal(environment.saved.length, 0);
    assert.deepEqual(environment.deleted, ["/tmp/reel.mp4"]);
  });

  it("R-I7 — progress never goes backwards", async () => {
    const environment = new FakeEnvironment();
    environment.onRender = (request) => {
      request.onProgress(0.8);
      request.onProgress(0.2);
      request.onProgress(0.9);
    };
    const controller = new RenderController(environment);

    const seen: number[] = [];
    controller.subscribe((snapshot: RenderSnapshot) => seen.push(snapshot.progress));
    await controller.start(cutList(), media(5));

    for (let index = 1; index < seen.length; index += 1) {
      assert.ok(
        (seen[index] as number) >= (seen[index - 1] as number),
        `progress went ${seen[index - 1]} then ${seen[index]}`,
      );
    }
  });

  it("R-I8 — a double tap on Export produces one render", async () => {
    const environment = new FakeEnvironment();
    const controller = new RenderController(environment);
    await Promise.all([
      controller.start(cutList(), media(5)),
      controller.start(cutList(), media(5)),
    ]);
    assert.equal(environment.renderCalls, 1);
  });

  it("skips an item that has been deleted since the preview", async () => {
    const environment = new FakeEnvironment();
    environment.unreadable.add("m1");
    const result = await new RenderController(environment).start(cutList(), media(5));

    assert.equal(result.status, "Complete");
    assert.deepEqual(result.skippedItemIds, ["m1"]);
  });

  it("fails with the exact text when fewer than three items survive", async () => {
    const environment = new FakeEnvironment();
    environment.unreadable.add("m0");
    environment.unreadable.add("m1");
    environment.unreadable.add("m2");
    const result = await new RenderController(environment).start(cutList(), media(4));

    assert.equal(result.error, "We need at least 3 usable items to make a reel.");
  });

  it("fails with the exact text when there is no room", async () => {
    const environment = new FakeEnvironment();
    environment.free = 0;
    const result = await new RenderController(environment).start(cutList(), media(5));
    assert.equal(result.error, "Not enough storage. Free up about 200 MB and try again.");
  });

  it("retries once on running out of memory, then gives up with the exact text", async () => {
    const environment = new FakeEnvironment();
    environment.failWith = new NativeRenderError("outOfMemory", "oom");
    const result = await new RenderController(environment).start(cutList(), media(5));

    assert.equal(environment.renderCalls, 2, "one retry, and only one");
    assert.equal(result.error, "This reel is too heavy for your phone. Try using fewer video clips.");
    assert.equal(result.canRetry, false);
  });

  it("succeeds when the retry after running out of memory works", async () => {
    const environment = new FakeEnvironment();
    environment.failOnce = new NativeRenderError("outOfMemory", "oom");
    const result = await new RenderController(environment).start(cutList(), media(5));

    assert.equal(environment.renderCalls, 2);
    assert.equal(result.status, "Complete");
  });

  it("shows the exact text when iOS suspends the render", async () => {
    const environment = new FakeEnvironment();
    environment.failWith = new NativeRenderError("interrupted", "suspended");
    const result = await new RenderController(environment).start(cutList(), media(5));

    assert.equal(
      result.error,
      "Your reel didn't finish because the app went to the background. Keep ThumpCut open while it renders.",
    );
  });

  it("R-I3 — a cancelled render leaves nothing behind", async () => {
    const environment = new FakeEnvironment();
    environment.failWith = new NativeRenderError("cancelled", "cancelled");
    const result = await new RenderController(environment).start(cutList(), media(5));

    assert.equal(result.status, "Cancelled");
    assert.equal(environment.saved.length, 0);
    assert.deepEqual(environment.deleted, ["/tmp/reel.mp4"]);
    assert.equal(result.outputUri, null);
  });

  it("a failed save deletes the file rather than leaving it in limbo", async () => {
    const environment = new FakeEnvironment();
    environment.saveThrows = true;
    const result = await new RenderController(environment).start(cutList(), media(5));

    assert.equal(result.status, "Failed");
    assert.deepEqual(environment.deleted, ["/tmp/reel.mp4"]);
  });
});

describe("the export flow when the reel carries its music", () => {
  it("hands the user's own file straight to the renderer, offset and length included", async () => {
    const environment = new FakeEnvironment();
    environment.output = makeMp4({ withAudioTrack: true, durationSec: 10 });
    let received: unknown = "never set";
    environment.onRender = (request) => {
      received = (request as { audio?: unknown }).audio;
    };
    const result = await new RenderController(environment).start(cutList(10), media(5), {
      kind: "file",
      uri: "file:///music/song.mp3",
      audioStartSec: 12.5,
    });

    assert.equal(result.status, "Complete");
    assert.deepEqual(received, {
      uri: "file:///music/song.mp3",
      startSec: 12.5,
      durationSec: 10,
    });
    assert.equal(environment.fetchCalls.length, 0, "a local file is never fetched");
  });

  it("fetches a royalty-free track first, and deletes the copy when the run ends", async () => {
    const environment = new FakeEnvironment();
    environment.output = makeMp4({ withAudioTrack: true, durationSec: 10 });
    const result = await new RenderController(environment).start(cutList(10), media(5), {
      kind: "remote",
      url: "https://example.com/track.mp3",
      audioStartSec: 4,
    });

    assert.equal(result.status, "Complete");
    assert.deepEqual(environment.fetchCalls, ["https://example.com/track.mp3"]);
    assert.ok(environment.deleted.includes("/tmp/track.m4a"), "the transient copy is deleted");
  });

  it("fails with the exact text when the track cannot be fetched, before any rendering", async () => {
    const environment = new FakeEnvironment();
    environment.fetchThrows = true;
    const result = await new RenderController(environment).start(cutList(10), media(5), {
      kind: "remote",
      url: "https://example.com/track.mp3",
      audioStartSec: 0,
    });

    assert.equal(result.status, "Failed");
    assert.equal(result.error, "We couldn't fetch the track. Check your connection and try again.");
    assert.equal(environment.renderCalls, 0);
  });

  it("keeps the fetched track across the out-of-memory retry", async () => {
    const environment = new FakeEnvironment();
    environment.output = makeMp4({ withAudioTrack: true, durationSec: 10 });
    environment.failOnce = new NativeRenderError("outOfMemory", "oom");
    const result = await new RenderController(environment).start(cutList(10), media(5), {
      kind: "remote",
      url: "https://example.com/track.mp3",
      audioStartSec: 0,
    });

    assert.equal(result.status, "Complete");
    assert.equal(environment.renderCalls, 2);
    assert.equal(environment.fetchCalls.length, 1, "fetched once, not once per attempt");
  });

  it("a silent reel that comes out carrying audio is rejected, and the reverse", async () => {
    const environment = new FakeEnvironment();
    environment.output = makeMp4({ withAudioTrack: true, durationSec: 10 });
    const silent = await new RenderController(environment).start(cutList(10), media(5));
    assert.equal(silent.status, "Failed");

    const environment2 = new FakeEnvironment();
    environment2.output = makeMp4({ durationSec: 10 });
    const withMusic = await new RenderController(environment2).start(cutList(10), media(5), {
      kind: "file",
      uri: "file:///music/song.mp3",
      audioStartSec: 0,
    });
    assert.equal(withMusic.status, "Failed");
  });
});

describe("what the native side receives", () => {
  it("carries the trim, speed and rotation of every cut", () => {
    const items: MediaItem[] = [
      { id: "a", uri: "file:///a.jpg", kind: "photo", width: 3000, height: 4000, rotationDeg: 0 },
      {
        id: "b",
        uri: "file:///b.mp4",
        kind: "video",
        width: 1920,
        height: 1080,
        rotationDeg: 90,
        durationSec: 20,
      },
    ];
    const list: CutList = {
      totalDurationSec: 4,
      audioStartSec: 0,
      cuts: [
        {
          mediaIndex: 0,
          startSec: 0,
          endSec: 2,
          transitionIn: "cut",
          motion: { type: "kenBurns", fromScale: 1, toScale: 1.06 },
        },
        {
          mediaIndex: 1,
          startSec: 2,
          endSec: 4,
          sourceInSec: 1,
          sourceOutSec: 2.6,
          speed: 0.8,
          transitionIn: "cut",
        },
      ],
      itemsUsed: 2,
      itemsDropped: 0,
    };

    const native = toNativeCuts(list, items);
    assert.equal(native[0]?.kind, "photo");
    assert.equal(native[0]?.kenBurnsTo, 1.06);
    assert.equal(native[0]?.holdDurationSec, 0);
    assert.equal(native[0]?.transitionIn, "cut");
    assert.equal(native[1]?.rotationDeg, 90);
    assert.equal(native[1]?.speed, 0.8);
    assert.equal(native[1]?.sourceOutSec, 2.6);
    assert.equal(native[1]?.durationSec, 2);
    assert.equal(native[1]?.holdDurationSec, 0);
  });

  it("computes how long a short clip's last frame must hold, at the cut's own speed", () => {
    const items: MediaItem[] = [
      {
        id: "b",
        uri: "file:///b.mp4",
        kind: "video",
        width: 1920,
        height: 1080,
        rotationDeg: 0,
        durationSec: 1.2,
      },
    ];
    const list: CutList = {
      totalDurationSec: 2,
      audioStartSec: 0,
      cuts: [
        // Plays 0.2..1.2 (one second of source) at half speed: two seconds of screen time
        // from a 3s slot leaves exactly 1s frozen on the last frame.
        {
          mediaIndex: 0,
          startSec: 0,
          endSec: 3,
          sourceInSec: 0.2,
          sourceOutSec: 1.2,
          speed: 0.5,
          freezeFromSec: 1.2,
          transitionIn: "crossfade",
        },
      ],
      itemsUsed: 1,
      itemsDropped: 0,
    };

    const native = toNativeCuts(list, items);
    assert.equal(native[0]?.holdDurationSec, 1);
    assert.equal(native[0]?.transitionIn, "crossfade");
  });

  it("holds for the whole slot when the clip has nothing left to play", () => {
    const items: MediaItem[] = [
      {
        id: "b",
        uri: "file:///b.mp4",
        kind: "video",
        width: 1920,
        height: 1080,
        rotationDeg: 0,
        durationSec: 5,
      },
    ];
    const list: CutList = {
      totalDurationSec: 2,
      audioStartSec: 0,
      cuts: [
        // The in-point sits at the end of the clip: the source plays nothing, the still
        // covers everything.
        {
          mediaIndex: 0,
          startSec: 0,
          endSec: 2,
          sourceInSec: 5,
          sourceOutSec: 5,
          speed: 1,
          freezeFromSec: 5,
          transitionIn: "cut",
        },
      ],
      itemsUsed: 1,
      itemsDropped: 0,
    };

    assert.equal(toNativeCuts(list, items)[0]?.holdDurationSec, 2);
  });

  it("refuses a cut that points at media which is not there", () => {
    const list: CutList = {
      totalDurationSec: 1,
      audioStartSec: 0,
      cuts: [{ mediaIndex: 7, startSec: 0, endSec: 1, transitionIn: "cut" }],
      itemsUsed: 1,
      itemsDropped: 0,
    };
    assert.throws(() => toNativeCuts(list, media(2)), /missing/);
  });
});
