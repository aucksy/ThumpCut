/**
 * Phase 5 — the preview plays the real track.
 *
 * Everything here runs under plain `node`. The two players are injected, so the rules that
 * decide *whether* a recording may be played, and the switch from click to music, are all
 * checked without a phone, a network or a speaker.
 *
 * The test that matters most is the content-hash one. A beat grid is computed from one
 * specific recording; if Instagram swaps it for a remaster the link still works, the audio
 * still plays, and every cut lands quietly in the wrong place with nothing erroring. That is
 * the failure this whole layer exists to make impossible.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { BeatMap } from "@thumpcut/cut-engine";
import { parseAudioIndex, planPreviewAudio } from "../src/audio/source.ts";
import {
  TrackPreviewAudio,
  type StreamPlayer,
} from "../src/audio/TrackPreviewAudio.ts";
import type { PreviewAudio } from "../src/audio/PreviewAudio.ts";
import type { AudioIndex } from "../src/catalogue/types.ts";
import { CatalogueService } from "../src/catalogue/service.ts";
import type {
  CatalogueNetwork,
  CatalogueStorage,
  HttpResponse,
} from "../src/catalogue/types.ts";

const NOW = Date.parse("2026-08-02T12:00:00Z");
const TRACK = { trackId: "t1", contentHash: "hash-1" };

function index(patch: Partial<AudioIndex["audio"]["x"]> = {}): AudioIndex {
  return {
    schemaVersion: 1,
    generatedAt: "2026-08-02T11:00:00Z",
    audio: {
      t1: {
        url: "https://cdn.example.test/t1.m4a",
        expiresAt: "2026-08-03T12:00:00Z",
        contentHash: "hash-1",
        ...patch,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// What the preview is allowed to play
// ---------------------------------------------------------------------------

describe("deciding whether the recording may be played", () => {
  it("streams a live, matching link", () => {
    assert.deepEqual(planPreviewAudio(index(), TRACK, NOW), {
      kind: "stream",
      url: "https://cdn.example.test/t1.m4a",
    });
  });

  it("clicks when there is no index at all", () => {
    assert.deepEqual(planPreviewAudio(null, TRACK, NOW), {
      kind: "click",
      reason: "no-entry",
    });
  });

  it("clicks when the index says nothing about this track", () => {
    const plan = planPreviewAudio(index(), { trackId: "other", contentHash: "hash-1" }, NOW);
    assert.deepEqual(plan, { kind: "click", reason: "no-entry" });
  });

  it("V8 — refuses a link issued for a different recording", () => {
    const plan = planPreviewAudio(index({ contentHash: "hash-2" }), TRACK, NOW);
    assert.deepEqual(plan, { kind: "click", reason: "recording-changed" });
  });

  it("refuses a link that has already expired", () => {
    const plan = planPreviewAudio(index({ expiresAt: "2026-08-02T11:59:00Z" }), TRACK, NOW);
    assert.deepEqual(plan, { kind: "click", reason: "expired" });
  });

  it("refuses a link whose expiry cannot be read — an undatable link is not trusted", () => {
    const plan = planPreviewAudio(index({ expiresAt: "whenever" }), TRACK, NOW);
    assert.deepEqual(plan, { kind: "click", reason: "expired" });
  });

  it("plays a link that says it never expires", () => {
    const plan = planPreviewAudio(index({ expiresAt: null }), TRACK, NOW);
    assert.equal(plan.kind, "stream");
  });

  it("never hands a non-HTTPS link to a player", () => {
    for (const url of ["http://x.test/a.m4a", "file:///tmp/a.m4a", "", "javascript:alert(1)"]) {
      const plan = planPreviewAudio(index({ url }), TRACK, NOW);
      assert.deepEqual(plan, { kind: "click", reason: "unusable" }, url);
    }
  });
});

describe("reading the audio index", () => {
  it("accepts a well-formed document", () => {
    const parsed = parseAudioIndex(JSON.stringify(index()));
    assert.equal(parsed.audio.t1?.url, "https://cdn.example.test/t1.m4a");
  });

  it("rejects anything short of a usable one", () => {
    for (const raw of ["null", "[]", "{}", '{"audio":5}', '{"audio":{"t1":{"url":"x"}}}']) {
      assert.throws(() => parseAudioIndex(raw), Error, raw);
    }
  });
});

// ---------------------------------------------------------------------------
// The switch from click to music
// ---------------------------------------------------------------------------

class FakePlayer implements PreviewAudio {
  loaded = false;
  playing = false;
  released = false;
  position = 0;
  playedFrom: number[] = [];

  async load(): Promise<void> {
    this.loaded = true;
  }
  play(fromSec: number): void {
    this.playing = true;
    this.position = fromSec;
    this.playedFrom.push(fromSec);
  }
  pause(): void {
    this.playing = false;
  }
  getPositionSec(): number {
    return this.position;
  }
  release(): void {
    this.released = true;
    this.playing = false;
  }
}

class FakeStream extends FakePlayer implements StreamPlayer {
  isReady = false;
  private settle: (() => void) | null = null;
  private reject: ((error: Error) => void) | null = null;

  override load(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.settle = () => {
        this.isReady = true;
        this.loaded = true;
        resolve();
      };
      this.reject = reject;
    });
  }

  arrive(): Promise<void> {
    this.settle?.();
    // One turn of the microtask queue is all the composite's `.then` needs.
    return Promise.resolve();
  }

  giveUp(): Promise<void> {
    this.reject?.(new Error("timeout"));
    return Promise.resolve().then(() => {});
  }
}

const BEAT_MAP = { beatsSec: [], downbeatsSec: [] } as unknown as BeatMap;

function build(url = "https://cdn.example.test/t1.m4a") {
  const click = new FakePlayer();
  const stream = new FakeStream();
  const statuses: string[] = [];
  const audio = new TrackPreviewAudio({
    plan: { kind: "stream", url },
    onStatus: (status) => statuses.push(status.mode),
    createClick: () => click,
    createStream: () => stream,
  });
  return { audio, click, stream, statuses };
}

describe("click first, music the moment it arrives", () => {
  it("plays the click while the recording is still on its way", async () => {
    const { audio, click, stream } = build();
    await audio.load(BEAT_MAP);
    audio.play(4);

    assert.equal(click.playing, true, "the click covers the wait");
    assert.equal(stream.playing, false);
    assert.equal(audio.status().mode, "connecting");
    assert.equal(audio.status().reason, null, "nothing is said while it is still coming");
  });

  it("hands over at the same position, so nothing jumps", async () => {
    const { audio, click, stream } = build();
    await audio.load(BEAT_MAP);
    audio.play(4);
    click.position = 6.5; // the click has been running a couple of seconds

    await stream.arrive();

    assert.equal(click.playing, false, "the click stops");
    assert.deepEqual(stream.playedFrom, [6.5], "the music starts where the click had reached");
    assert.equal(audio.status().mode, "streaming");
    assert.equal(audio.getPositionSec(), 6.5);
  });

  it("does not start the music if the user had already paused", async () => {
    const { audio, stream } = build();
    await audio.load(BEAT_MAP);
    audio.play(4);
    audio.pause();

    await stream.arrive();
    assert.equal(stream.playing, false);
  });

  it("keeps the click and says why when the recording never arrives", async () => {
    const { audio, click, stream, statuses } = build();
    await audio.load(BEAT_MAP);
    audio.play(4);

    await stream.giveUp();

    assert.equal(audio.status().mode, "click");
    assert.equal(audio.status().reason, "unreachable");
    assert.equal(stream.released, true, "the dead player is not left holding a socket");
    assert.equal(click.playing, true, "the preview keeps working");
    // "connecting" is where it starts, so only the fall back to the click is an event.
    assert.deepEqual(statuses, ["click"]);
  });

  it("V6 — a recording that arrives after release is discarded, not played", async () => {
    const { audio, stream } = build();
    await audio.load(BEAT_MAP);
    audio.play(4);
    audio.release();

    await stream.arrive();

    assert.equal(audio.status().mode, "connecting", "back to where it started, not streaming");
    assert.equal(stream.playing, false);
  });

  it("V6 — release lets go of both players", async () => {
    const { audio, click, stream } = build();
    await audio.load(BEAT_MAP);
    audio.play(4);
    audio.release();

    assert.equal(click.released, true);
    assert.equal(stream.released, true);
  });

  it("never creates a stream at all when the plan says click", async () => {
    const click = new FakePlayer();
    let streamsMade = 0;
    const audio = new TrackPreviewAudio({
      plan: { kind: "click", reason: "expired" },
      createClick: () => click,
      createStream: () => {
        streamsMade += 1;
        return new FakeStream();
      },
    });

    await audio.load(BEAT_MAP);
    audio.play(0);

    assert.equal(streamsMade, 0, "no network is touched when we already know the answer");
    assert.equal(audio.status().mode, "click");
    assert.equal(audio.status().reason, "expired");
    assert.equal(click.playing, true);
  });
});

// ---------------------------------------------------------------------------
// Getting the index onto the phone
// ---------------------------------------------------------------------------

class MemoryStorage implements CatalogueStorage {
  readonly files = new Map<string, string>();
  async readText(path: string) {
    return this.files.get(path) ?? null;
  }
  async writeTextAtomic(path: string, contents: string) {
    this.files.set(path, contents);
  }
  async remove(path: string) {
    this.files.delete(path);
  }
  async list(dir: string) {
    const prefix = `${dir}/`;
    return [...this.files.keys()]
      .filter((key) => key.startsWith(prefix))
      .map((key) => key.slice(prefix.length));
  }
  async freeBytes() {
    return Number.MAX_SAFE_INTEGER;
  }
}

class FakeNetwork implements CatalogueNetwork {
  online = true;
  noCacheAsked: boolean[] = [];
  responses = new Map<string, HttpResponse>();
  refuse = new Set<string>();

  async get(url: string, _timeoutMs: number, options?: { noCache?: boolean }) {
    this.noCacheAsked.push(options?.noCache === true);
    if (this.refuse.has(url)) throw new Error("connection lost");
    const response = this.responses.get(url);
    if (!response) throw new Error(`no stub for ${url}`);
    return response;
  }
  async isOnline() {
    return this.online;
  }
}

const AUDIO_URL = "https://cdn.example.test/audio.json";

function json(body: unknown): HttpResponse {
  return { status: 200, contentType: "application/json", body: JSON.stringify(body) };
}

function service(network: FakeNetwork, storage = new MemoryStorage()) {
  return {
    storage,
    service: new CatalogueService({
      catalogueUrl: "https://cdn.example.test/catalogue",
      audioIndexUrl: AUDIO_URL,
      storage,
      network,
      sleep: async () => {},
    }),
  };
}

describe("getting the audio links onto the phone", () => {
  it("fetches them, caches them, and asks the CDN not to serve a stale copy", async () => {
    const network = new FakeNetwork();
    network.responses.set(AUDIO_URL, json(index()));
    const { service: catalogue, storage } = service(network);

    const fetched = await catalogue.refreshAudioIndex();

    assert.equal(fetched?.audio.t1?.contentHash, "hash-1");
    assert.ok(storage.files.has("audio.json"), "cached for the next cold start");
    assert.deepEqual(network.noCacheAsked, [true]);
  });

  it("keeps the cached links when the fetch fails, and says nothing about it", async () => {
    const network = new FakeNetwork();
    const storage = new MemoryStorage();
    storage.files.set("audio.json", JSON.stringify(index()));
    network.refuse.add(AUDIO_URL);
    const { service: catalogue } = service(network, storage);

    await catalogue.refreshAudioIndex();

    assert.equal(catalogue.audioIndex()?.audio.t1?.url, "https://cdn.example.test/t1.m4a");
  });

  it("treats a corrupt cache as no cache rather than half-trusting it", async () => {
    const network = new FakeNetwork();
    const storage = new MemoryStorage();
    storage.files.set("audio.json", "{ not json");
    network.refuse.add(AUDIO_URL);
    const { service: catalogue } = service(network, storage);

    await catalogue.refreshAudioIndex();
    assert.equal(catalogue.audioIndex(), null);
  });

  it("does nothing at all when no audio index is configured", async () => {
    const network = new FakeNetwork();
    const catalogue = new CatalogueService({
      catalogueUrl: "https://cdn.example.test/catalogue",
      storage: new MemoryStorage(),
      network,
      sleep: async () => {},
    });

    assert.equal(await catalogue.refreshAudioIndex(), null);
    assert.deepEqual(network.noCacheAsked, [], "no request is made");
  });
});
