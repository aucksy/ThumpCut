/**
 * Phase 3 — the catalogue.
 *
 * Storage and network are injected, so every rule worth checking runs under plain `node`:
 * no device, no emulator, no network.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { CatalogueService, parseCatalogue } from "../src/catalogue/service.ts";
import type {
  Catalogue,
  CatalogueNetwork,
  CatalogueStorage,
  HttpResponse,
} from "../src/catalogue/types.ts";
import { COPY } from "../src/copy.ts";

// ---------------------------------------------------------------------------
// Doubles
// ---------------------------------------------------------------------------

class MemoryStorage implements CatalogueStorage {
  readonly files = new Map<string, string>();
  writes: string[] = [];
  free = Number.MAX_SAFE_INTEGER;
  failWriteOn: string | null = null;

  async readText(path: string) {
    return this.files.get(path) ?? null;
  }
  async writeTextAtomic(path: string, contents: string) {
    if (this.failWriteOn === path) throw new Error("write failed");
    this.writes.push(path);
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
    return this.free;
  }
}

class FakeNetwork implements CatalogueNetwork {
  online = true;
  calls: string[] = [];
  responses = new Map<string, HttpResponse | (() => HttpResponse)>();
  failures = new Map<string, number>();

  async get(url: string): Promise<HttpResponse> {
    this.calls.push(url);
    const remaining = this.failures.get(url) ?? 0;
    if (remaining > 0) {
      this.failures.set(url, remaining - 1);
      throw new Error("connection lost");
    }
    const response = this.responses.get(url);
    if (!response) throw new Error(`no stub for ${url}`);
    return typeof response === "function" ? response() : response;
  }
  async isOnline() {
    return this.online;
  }
}

const URL_BASE = "https://cdn.example.test";

function json(body: unknown): HttpResponse {
  return { status: 200, contentType: "application/json", body: JSON.stringify(body) };
}

function beatMap(trackId: string, contentHash: string) {
  const beats = Array.from({ length: 24 }, (_, index) => Number((index * 0.5).toFixed(3)));
  return {
    schemaVersion: 1,
    trackId,
    title: `Track ${trackId}`,
    artist: "Artist",
    durationSec: 12,
    bpm: 120,
    beatsSec: beats,
    downbeatsSec: beats.filter((_, index) => index % 4 === 0),
    beatsPerBar: 4,
    energyCurve: beats.map(() => 0.5),
    sections: [{ startSec: 0, endSec: 12, level: "medium" }],
    bestWindowStartSec: 0,
    sourceDurationMs: 12000,
    audioFingerprint: "fp",
    lastVerifiedAt: "2026-08-01T00:00:00Z",
    engine: "spectral_dp",
    engineVersion: "1.0.0",
    contentHash,
  };
}

function catalogue(tracks: { id: string; hash: string }[], catalogueHash = "cat-1"): Catalogue {
  return {
    schemaVersion: 1,
    generatedAt: "2026-08-01T00:00:00Z",
    catalogueHash,
    tracks: tracks.map(({ id, hash }) => ({
      trackId: id,
      title: `Track ${id}`,
      artist: "Artist",
      bpm: 120,
      durationSec: 12,
      contentHash: hash,
      beatMapPath: `beatmaps/${id}.json`,
    })),
    templates: [
      {
        id: "night-drive",
        name: "Night drive",
        mood: "Upbeat",
        previewVideoUrl: "",
        previewPosterUrl: "",
        idealItemRange: [8, 16],
        density: { low: 4, medium: 2, high: 1, drop: 1 },
        transition: "cut",
        photoMotion: { type: "kenBurns", intensityPct: 6 },
        videoBehaviour: { allowSpeedFit: true, speedRange: [0.6, 1.6], preferSpanning: true },
      },
    ],
  };
}

function makeService(
  storage: MemoryStorage,
  network: FakeNetwork,
  bundled?: { catalogue: string; beatMaps: Record<string, string> },
) {
  return new CatalogueService({
    catalogueUrl: URL_BASE,
    bundled,
    storage,
    network,
    now: () => 1_000_000,
    sleep: async () => undefined,
  });
}

function stubHappyPath(network: FakeNetwork, tracks = [{ id: "t1", hash: "h1" }]) {
  network.responses.set(`${URL_BASE}/catalogue.json`, json(catalogue(tracks)));
  for (const track of tracks) {
    network.responses.set(
      `${URL_BASE}/beatmaps/${track.id}.json`,
      json(beatMap(track.id, track.hash)),
    );
  }
}

// ---------------------------------------------------------------------------

describe("the catalogue compiled into the build", () => {
  function bundle(tracks = [{ id: "t1", hash: "h1" }]) {
    const beatMaps: Record<string, string> = {};
    for (const track of tracks) {
      beatMaps[track.id] = JSON.stringify(beatMap(track.id, track.hash));
    }
    return { catalogue: JSON.stringify(catalogue(tracks)), beatMaps };
  }

  it("serves a fresh offline install the whole catalogue, tracks and all", async () => {
    const storage = new MemoryStorage();
    const network = new FakeNetwork();
    network.online = false;

    const service = makeService(storage, network, bundle());
    const snapshot = await service.load();

    assert.equal(snapshot.state, "OfflineWithCache");
    assert.equal(snapshot.message, null);
    assert.equal(snapshot.catalogue?.tracks.length, 1);
    // The seeded beat map serves without a single network call.
    const servable = await service.servableTracks();
    assert.equal(servable.length, 1);
    assert.equal(network.calls.length, 0);
  });

  it("opens instantly online too, refreshing in the background instead of downloading", async () => {
    const storage = new MemoryStorage();
    const network = new FakeNetwork();
    stubHappyPath(network);

    const service = makeService(storage, network, bundle());
    const snapshot = await service.load();

    assert.equal(snapshot.state, "Ready");
    assert.equal(snapshot.catalogue?.tracks.length, 1);
  });

  it("never overrides a real cache with the bundled copy", async () => {
    const storage = new MemoryStorage();
    const network = new FakeNetwork();
    network.online = false;
    storage.files.set(
      "catalogue.json",
      JSON.stringify(catalogue([{ id: "newer", hash: "h9" }], "cat-9")),
    );

    const service = makeService(storage, network, bundle());
    const snapshot = await service.load();

    assert.equal(snapshot.catalogue?.tracks[0]?.trackId, "newer");
  });

  it("treats a malformed bundle as no bundle at all", async () => {
    const storage = new MemoryStorage();
    const network = new FakeNetwork();
    network.online = false;

    const service = makeService(storage, network, {
      catalogue: "{not json",
      beatMaps: {},
    });
    const snapshot = await service.load();

    assert.equal(snapshot.state, "OfflineNoCache");
    assert.equal(snapshot.message, COPY.catalogue.offlineNoCache);
  });

  it("skips a bundled beat map whose hash does not match its track", async () => {
    const storage = new MemoryStorage();
    const network = new FakeNetwork();
    network.online = false;

    const wrongMap = { t1: JSON.stringify(beatMap("t1", "different-hash")) };
    const service = makeService(storage, network, {
      catalogue: JSON.stringify(catalogue([{ id: "t1", hash: "h1" }])),
      beatMaps: wrongMap,
    });
    await service.load();

    // The catalogue itself still serves; the mismatched map is simply not trusted.
    assert.equal((await service.servableTracks()).length, 0);
  });
});

describe("first launch", () => {
  it("downloads the catalogue when there is no cache and a connection", async () => {
    const storage = new MemoryStorage();
    const network = new FakeNetwork();
    stubHappyPath(network);

    const snapshot = await makeService(storage, network).load();
    assert.equal(snapshot.state, "Ready");
    assert.equal(snapshot.message, null);
    assert.ok(storage.files.has("catalogue.json"));
  });

  it("shows the exact offline text when there is no cache and no connection", async () => {
    const network = new FakeNetwork();
    network.online = false;
    const snapshot = await makeService(new MemoryStorage(), network).load();

    assert.equal(snapshot.state, "OfflineNoCache");
    assert.equal(snapshot.message, "You're offline. Connect to the internet to get started.");
    assert.equal(snapshot.message, COPY.catalogue.offlineNoCache);
    assert.equal(snapshot.canRetry, true);
  });

  it("shows the exact failure text when the download fails and there is no cache", async () => {
    const network = new FakeNetwork();
    network.failures.set(`${URL_BASE}/catalogue.json`, 3);
    const snapshot = await makeService(new MemoryStorage(), network).load();

    assert.equal(snapshot.state, "DownloadFailed");
    assert.equal(snapshot.message, "We couldn't load your styles. Check your connection and try again.");
  });

  it("shows the exact storage text when there is not enough room", async () => {
    const storage = new MemoryStorage();
    storage.free = 1024;
    const network = new FakeNetwork();
    stubHappyPath(network);

    const snapshot = await makeService(storage, network).load();
    assert.equal(snapshot.message, "Not enough storage to set up ThumpCut. Free up about 50 MB and try again.");
  });
});

describe("offline with a cache is a normal working state", () => {
  it("serves the cache and says nothing at all", async () => {
    const storage = new MemoryStorage();
    storage.files.set("catalogue.json", JSON.stringify(catalogue([{ id: "t1", hash: "h1" }])));
    const network = new FakeNetwork();
    network.online = false;

    const snapshot = await makeService(storage, network).load();
    assert.equal(snapshot.state, "OfflineWithCache");
    assert.equal(snapshot.message, null, "an offline cache must not show a banner");
    assert.equal(snapshot.canRetry, false);
    assert.ok(snapshot.catalogue);
  });

  it("makes no network call at all", async () => {
    const storage = new MemoryStorage();
    storage.files.set("catalogue.json", JSON.stringify(catalogue([{ id: "t1", hash: "h1" }])));
    const network = new FakeNetwork();
    network.online = false;

    await makeService(storage, network).load();
    assert.deepEqual(network.calls, []);
  });
});

describe("a bad download never damages a good cache", () => {
  it("malformed JSON leaves the cache intact", async () => {
    const storage = new MemoryStorage();
    const original = JSON.stringify(catalogue([{ id: "t1", hash: "h1" }]));
    storage.files.set("catalogue.json", original);

    const network = new FakeNetwork();
    network.responses.set(`${URL_BASE}/catalogue.json`, {
      status: 200,
      contentType: "application/json",
      body: "{ this is not json",
    });

    const service = makeService(storage, network);
    await service.load();
    await service.refresh(true);

    assert.equal(storage.files.get("catalogue.json"), original);
    assert.equal(service.snapshot().message, null, "a failed background refresh says nothing");
  });

  it("a captive portal's HTML is rejected before anything is written", async () => {
    const storage = new MemoryStorage();
    const network = new FakeNetwork();
    network.responses.set(`${URL_BASE}/catalogue.json`, {
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: "<html><body>Sign in to WiFi</body></html>",
    });

    const snapshot = await makeService(storage, network).load();
    assert.equal(snapshot.state, "DownloadFailed");
    assert.equal(storage.files.size, 0);
  });

  it("a catalogue with zero tracks is treated as invalid", () => {
    assert.throws(
      () => parseCatalogue(JSON.stringify({ ...catalogue([{ id: "t1", hash: "h1" }]), tracks: [] })),
      /zero tracks/,
    );
  });

  it("a track missing its content hash is rejected", () => {
    const broken = catalogue([{ id: "t1", hash: "h1" }]);
    broken.tracks[0]!.contentHash = "";
    assert.throws(() => parseCatalogue(JSON.stringify(broken)), /missing required fields/);
  });
});

describe("K-I4 — only one fetch in flight", () => {
  it("two rapid retries produce one network call", async () => {
    const storage = new MemoryStorage();
    const network = new FakeNetwork();
    stubHappyPath(network);
    const service = makeService(storage, network);

    const [first, second] = await Promise.all([service.retry(), service.retry()]);
    const catalogueCalls = network.calls.filter((url) => url.endsWith("catalogue.json"));

    assert.equal(catalogueCalls.length, 1);
    assert.equal(first.state, "Ready");
    assert.equal(second.state, "Ready");
  });
});

describe("retirement and swaps", () => {
  it("a track that has left the catalogue loses its cached beat map", async () => {
    const storage = new MemoryStorage();
    const network = new FakeNetwork();
    stubHappyPath(network, [{ id: "t1", hash: "h1" }, { id: "t2", hash: "h2" }]);

    const service = makeService(storage, network);
    await service.load();
    await service.beatMapFor("t2");
    assert.ok(storage.files.has("beatmaps/t2.json"));

    // t2 has been pulled from Instagram's library.
    network.responses.set(
      `${URL_BASE}/catalogue.json`,
      json(catalogue([{ id: "t1", hash: "h1" }], "cat-2")),
    );
    await service.refresh(true);

    assert.equal(storage.files.has("beatmaps/t2.json"), false);
    assert.deepEqual(
      service.snapshot().catalogue?.tracks.map((track) => track.trackId),
      ["t1"],
    );
  });

  it("a swapped recording forces the beat map to be fetched again", async () => {
    const storage = new MemoryStorage();
    const network = new FakeNetwork();
    stubHappyPath(network, [{ id: "t1", hash: "h1" }]);

    const service = makeService(storage, network);
    await service.load();
    await service.beatMapFor("t1");

    network.responses.set(
      `${URL_BASE}/catalogue.json`,
      json(catalogue([{ id: "t1", hash: "h2" }], "cat-2")),
    );
    network.responses.set(`${URL_BASE}/beatmaps/t1.json`, json(beatMap("t1", "h2")));
    await service.refresh(true);

    const refreshed = await service.beatMapFor("t1");
    assert.equal(refreshed?.contentHash, "h2");
  });

  it("a beat map whose hash does not match the catalogue is refused", async () => {
    const storage = new MemoryStorage();
    const network = new FakeNetwork();
    network.responses.set(
      `${URL_BASE}/catalogue.json`,
      json(catalogue([{ id: "t1", hash: "h1" }])),
    );
    // The server hands back a beat map for a different version of the recording.
    network.responses.set(`${URL_BASE}/beatmaps/t1.json`, json(beatMap("t1", "wrong")));

    const service = makeService(storage, network);
    await service.load();
    assert.equal(await service.beatMapFor("t1"), null);
  });

  it("K-I5 — only tracks with a usable beat map are served", async () => {
    const storage = new MemoryStorage();
    const network = new FakeNetwork();
    network.responses.set(
      `${URL_BASE}/catalogue.json`,
      json(catalogue([{ id: "t1", hash: "h1" }, { id: "t2", hash: "h2" }])),
    );
    network.responses.set(`${URL_BASE}/beatmaps/t1.json`, json(beatMap("t1", "h1")));
    network.failures.set(`${URL_BASE}/beatmaps/t2.json`, 99);

    const service = makeService(storage, network);
    await service.load();
    const servable = await service.servableTracks();
    assert.deepEqual(servable.map((track) => track.trackId), ["t1"]);
  });
});

describe("retries", () => {
  it("recovers when a download succeeds on the third attempt", async () => {
    const storage = new MemoryStorage();
    const network = new FakeNetwork();
    stubHappyPath(network);
    network.failures.set(`${URL_BASE}/catalogue.json`, 2);

    const snapshot = await makeService(storage, network).load();
    assert.equal(snapshot.state, "Ready");
  });

  it("gives up after three attempts", async () => {
    const network = new FakeNetwork();
    stubHappyPath(network);
    network.failures.set(`${URL_BASE}/catalogue.json`, 3);

    const snapshot = await makeService(new MemoryStorage(), network).load();
    assert.equal(snapshot.state, "DownloadFailed");
    assert.equal(
      network.calls.filter((url) => url.endsWith("catalogue.json")).length,
      3,
    );
  });
});

describe("a corrupt cache is treated as no cache", () => {
  it("does not serve half a catalogue", async () => {
    const storage = new MemoryStorage();
    storage.files.set("catalogue.json", "{ half a file");
    const network = new FakeNetwork();
    stubHappyPath(network);

    const snapshot = await makeService(storage, network).load();
    assert.equal(snapshot.state, "Ready");
    assert.ok(snapshot.catalogue);
  });
});
