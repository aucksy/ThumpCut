/**
 * Your music — the path that makes the app self-sufficient.
 *
 * The controller's rules: permission before anything, short files never offered, one
 * analysis at a time, the cache hit is instant, a failure keeps the list usable, and a
 * late result never resurrects a screen the user left. And the licensing boundary:
 * `deriveExportAudio` is the one function deciding what an export may carry, so every one
 * of its branches is pinned here.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { BeatMap } from "@thumpcut/cut-engine";
import {
  cacheKeyFor,
  LocalMusicController,
  titleFromFilename,
  trackIdFor,
  type LocalMusicEnvironment,
  type LocalSong,
} from "../src/music/localTracks.ts";
import { deriveExportAudio } from "../src/music/exportAudio.ts";
import type { CatalogueTrack } from "../src/catalogue/types.ts";

function song(patch: Partial<LocalSong> = {}): LocalSong {
  return {
    id: "s1",
    uri: "file:///music/song.mp3",
    filename: "song.mp3",
    durationSec: 180,
    modifiedAt: 1700000000000,
    ...patch,
  };
}

function beatMapFor(trackId: string): BeatMap {
  const beats = Array.from({ length: 32 }, (_, index) => index * 0.5);
  return {
    schemaVersion: 1,
    trackId,
    title: "Test Song",
    artist: "Test Artist",
    durationSec: 180,
    bpm: 120,
    beatsSec: beats,
    downbeatsSec: beats.filter((_, index) => index % 4 === 0),
    beatsPerBar: 4,
    energyCurve: beats.map(() => 0.5),
    sections: [{ startSec: 0, endSec: 180, level: "medium" }],
    bestWindowStartSec: 0,
    sourceDurationMs: 180000,
    audioFingerprint: "sha256-pcm8k:test",
    lastVerifiedAt: "2026-08-02T00:00:00.000Z",
    engine: "spectral_dp_ts",
    engineVersion: "1.0.0",
    contentHash: "hash",
  };
}

class FakeMusicEnvironment implements LocalMusicEnvironment {
  permission: "granted" | "denied" = "granted";
  songs: LocalSong[] = [song()];
  cache = new Map<string, BeatMap>();
  copies = new Set<string>();
  decodeCalls = 0;
  analyseCalls = 0;
  renderCopyCalls: Array<{ uri: string; toPath: string; maxDurationSec: number }> = [];
  cleanupCalls: string[] = [];
  deleted: string[] = [];
  analyseThrows = false;
  renderCopyThrows = false;
  progressTicks: Array<(fraction: number) => void> = [];

  async requestPermission() {
    return this.permission;
  }
  async listSongs() {
    return this.songs;
  }
  async readMetadata() {
    return { title: "Test Song", artist: "Test Artist" };
  }
  async decodeToSamples() {
    this.decodeCalls += 1;
    return "file:///cache/analysis.f32";
  }
  async readSamples() {
    return new Float32Array(1024);
  }
  async deleteFile(path: string) {
    this.deleted.push(path);
  }
  async analyse(
    _samples: Float32Array,
    _rate: number,
    info: { trackId: string },
    onProgress: (fraction: number) => void,
  ) {
    this.analyseCalls += 1;
    if (this.analyseThrows) throw new Error("no beat");
    this.progressTicks.push(onProgress);
    onProgress(0.5);
    return beatMapFor(info.trackId);
  }
  async readCachedBeatMap(key: string) {
    return this.cache.get(key) ?? null;
  }
  async writeCachedBeatMap(key: string, beatMap: BeatMap) {
    this.cache.set(key, beatMap);
  }
  playableCopyPath(key: string) {
    return `file:///documents/localbeats/${key}.wav`;
  }
  async fileExists(path: string) {
    return this.copies.has(path);
  }
  async renderPlayableCopy(uri: string, toPath: string, maxDurationSec: number) {
    this.renderCopyCalls.push({ uri, toPath, maxDurationSec });
    if (this.renderCopyThrows) throw new Error("no copy");
    this.copies.add(toPath);
  }
  async removeOtherPlayableCopies(keepKey: string) {
    this.cleanupCalls.push(keepKey);
    for (const path of [...this.copies]) {
      if (!path.endsWith(`${keepKey}.wav`)) this.copies.delete(path);
    }
  }
}

describe("scanning the phone's music", () => {
  it("permission denied explains itself with the exact text", async () => {
    const environment = new FakeMusicEnvironment();
    environment.permission = "denied";
    const controller = new LocalMusicController(environment);
    const snapshot = await controller.open();

    assert.equal(snapshot.status, "PermissionDenied");
    assert.equal(snapshot.message, "ThumpCut needs access to your music to read its beat.");
  });

  it("an empty library says so with the exact text", async () => {
    const environment = new FakeMusicEnvironment();
    environment.songs = [];
    const controller = new LocalMusicController(environment);
    const snapshot = await controller.open();

    assert.equal(snapshot.status, "Empty");
    assert.equal(
      snapshot.message,
      "No songs on this device. Download a royalty-free track and it will show up here.",
    );
  });

  it("a song too short to analyse is never offered at all", async () => {
    const environment = new FakeMusicEnvironment();
    environment.songs = [song(), song({ id: "s2", durationSec: 6 })];
    const controller = new LocalMusicController(environment);
    const snapshot = await controller.open();

    assert.equal(snapshot.songs.length, 1);
    assert.equal(snapshot.songs[0]?.id, "s1");
  });
});

describe("analysing a song", () => {
  it("produces a local track whose audio is the exact playable copy, never the original", async () => {
    const environment = new FakeMusicEnvironment();
    const controller = new LocalMusicController(environment);
    await controller.open();
    const analysed = await controller.pick(song());

    assert.ok(analysed);
    assert.equal(analysed.track.source, "local");
    assert.equal(analysed.track.title, "Test Song");
    assert.equal(analysed.track.bpm, 120);
    // The one-clock rule: preview and export play the copy rendered from the same decode
    // the beat grid was measured on. The original compressed file is never handed to a
    // player — its clock can sit off the analysis clock.
    assert.ok(analysed.fileUri.endsWith(".wav"), analysed.fileUri);
    assert.notEqual(analysed.fileUri, "file:///music/song.mp3");
    assert.equal(environment.renderCopyCalls.length, 1);
    assert.equal(environment.renderCopyCalls[0]?.uri, "file:///music/song.mp3");
    assert.ok(analysed.track.trackId.startsWith("local-"));
  });

  it("the copy is cut off past the reel window, not the whole song archived", async () => {
    const environment = new FakeMusicEnvironment();
    const controller = new LocalMusicController(environment);
    await controller.open();
    await controller.pick(song());

    // The fake's beat map: 180s long, best window at 0 → copy capped at 0 + 180.
    assert.equal(environment.renderCopyCalls[0]?.maxDurationSec, 180);
  });

  it("analyses once, then serves the cache instantly", async () => {
    const environment = new FakeMusicEnvironment();
    const controller = new LocalMusicController(environment);
    await controller.open();
    await controller.pick(song());
    const second = await controller.pick(song());

    assert.equal(environment.analyseCalls, 1);
    assert.equal(environment.renderCopyCalls.length, 1, "the copy is reused too");
    assert.ok(second);
    assert.ok(second.fileUri.endsWith(".wav"));
  });

  it("a cached analysis whose copy was cleaned away re-renders the copy, not the analysis", async () => {
    const environment = new FakeMusicEnvironment();
    const controller = new LocalMusicController(environment);
    await controller.open();
    await controller.pick(song());

    // Another song's pick would clean this copy; simulate the copy vanishing.
    environment.copies.clear();
    const again = await controller.pick(song());

    assert.equal(environment.analyseCalls, 1, "no re-analysis");
    assert.equal(environment.renderCopyCalls.length, 2, "the copy is re-rendered");
    assert.ok(again);
  });

  it("only one song's copy is kept: picking cleans the others first", async () => {
    const environment = new FakeMusicEnvironment();
    environment.songs = [song(), song({ id: "s2", uri: "file:///music/other.mp3", filename: "other.mp3" })];
    const controller = new LocalMusicController(environment);
    await controller.open();
    await controller.pick(song());
    const firstCopy = environment.renderCopyCalls[0]?.toPath as string;
    await controller.pick(environment.songs[1] as LocalSong);

    assert.equal(environment.cleanupCalls.length, 2);
    assert.equal(environment.copies.has(firstCopy), false, "the first song's copy is gone");
  });

  it("a copy that cannot be rendered is an honest failure, not a silently wrong player", async () => {
    const environment = new FakeMusicEnvironment();
    environment.renderCopyThrows = true;
    const controller = new LocalMusicController(environment);
    await controller.open();
    const analysed = await controller.pick(song());

    assert.equal(analysed, null);
    assert.equal(controller.snapshot().status, "AnalysisFailed");
  });

  it("a changed file is a different song: the cache key moves with the mtime", () => {
    const original = song();
    const edited = song({ modifiedAt: 1700000099000 });
    assert.notEqual(cacheKeyFor(original), cacheKeyFor(edited));
    assert.notEqual(trackIdFor(original), trackIdFor(edited));
  });

  it("the scratch samples are deleted whether analysis succeeds or fails", async () => {
    const environment = new FakeMusicEnvironment();
    const controller = new LocalMusicController(environment);
    await controller.open();
    await controller.pick(song());
    assert.deepEqual(environment.deleted, ["file:///cache/analysis.f32"]);

    const failing = new FakeMusicEnvironment();
    failing.analyseThrows = true;
    const controller2 = new LocalMusicController(failing);
    await controller2.open();
    await controller2.pick(song());
    assert.deepEqual(failing.deleted, ["file:///cache/analysis.f32"]);
  });

  it("a failed analysis shows the exact text and the list stays usable", async () => {
    const environment = new FakeMusicEnvironment();
    environment.analyseThrows = true;
    const controller = new LocalMusicController(environment);
    await controller.open();
    const analysed = await controller.pick(song());

    assert.equal(analysed, null);
    assert.equal(controller.snapshot().status, "AnalysisFailed");
    assert.equal(
      controller.snapshot().message,
      "We couldn't read a beat in that song. Try a different one.",
    );
    controller.dismissFailure();
    assert.equal(controller.snapshot().status, "Ready");
  });

  it("a result landing after the screen was left is dropped", async () => {
    const environment = new FakeMusicEnvironment();
    const controller = new LocalMusicController(environment);
    await controller.open();
    const picking = controller.pick(song());
    controller.release();
    const analysed = await picking;

    assert.equal(analysed, null);
  });

  it("reads a usable title out of a messy filename", () => {
    assert.equal(titleFromFilename("01 - Night_Drive.mp3"), "Night Drive");
    assert.equal(titleFromFilename("track.mp3"), "track");
    assert.equal(titleFromFilename("07.Summer Song.m4a"), "Summer Song");
  });
});

describe("what an export may carry — the licensing boundary", () => {
  const instagramTrack = { source: undefined } as Pick<CatalogueTrack, "source">;
  const royaltyFreeTrack = { source: "royaltyfree" } as Pick<CatalogueTrack, "source">;
  const localTrack = { source: "local" } as Pick<CatalogueTrack, "source">;
  const streaming = { kind: "stream", url: "https://cdn.example/track.mp3" } as const;
  const clicking = { kind: "click", reason: "expired" } as const;

  it("an Instagram-catalogue track exports silent, whatever the preview is doing", () => {
    assert.deepEqual(deriveExportAudio(instagramTrack, streaming, null, 4), { kind: "none" });
    assert.deepEqual(deriveExportAudio(instagramTrack, clicking, null, 4), { kind: "none" });
  });

  it("the user's own file goes in from the device", () => {
    assert.deepEqual(deriveExportAudio(localTrack, clicking, "file:///song.mp3", 12.5), {
      kind: "file",
      uri: "file:///song.mp3",
      audioStartSec: 12.5,
    });
  });

  it("a royalty-free track is fetched from the link the preview streams", () => {
    assert.deepEqual(deriveExportAudio(royaltyFreeTrack, streaming, null, 8), {
      kind: "remote",
      url: "https://cdn.example/track.mp3",
      audioStartSec: 8,
    });
  });

  it("a royalty-free track with no usable link is told so, not quietly muted", () => {
    assert.deepEqual(deriveExportAudio(royaltyFreeTrack, clicking, null, 8), {
      kind: "remote",
      url: "",
      audioStartSec: 8,
    });
  });

  it("no track at all means silent", () => {
    assert.deepEqual(deriveExportAudio(null, streaming, null, 0), { kind: "none" });
  });
});
