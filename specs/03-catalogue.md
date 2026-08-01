# 03 — Catalogue (download and cache)

Gets the track list, beat maps and template data onto the phone, and keeps them there.

---

## 1. Purpose and scope

Fetch `catalogue.json` from Cloudflare R2, cache it and the per-track beat maps locally, and
serve them to the rest of the app instantly.

**In scope:** first-launch download, caching, cache invalidation by content hash, retiring
tracks that have left Instagram's library, offline behaviour, template preview video caching.

**Refresh cadence:** check for a new catalogue on every cold start, and at most once per hour
while the app is open. Tracks get pulled from Instagram's library without warning, so a stale
catalogue shows the user songs they can no longer apply.

**Out of scope:** any UI beyond the loading and error states listed here; the template gallery
itself (Phase 5); background refresh.

---

## 2. States and transitions

| State | What the user sees |
|---|---|
| `NoCache` | First launch, nothing stored yet |
| `Downloading` | "Getting things ready" with a progress indicator |
| `Ready` | Catalogue available, app usable |
| `OfflineNoCache` | Offline on first launch — cannot proceed |
| `OfflineWithCache` | Offline but the cached catalogue works fine |
| `Stale` | Cache exists, a newer catalogue is available |
| `DownloadFailed` | Network reached but the fetch failed |

| From | Event | Guard | To | Side effect |
|---|---|---|---|---|
| NoCache | app opens | online | Downloading | fetch `catalogue.json` |
| NoCache | app opens | offline | OfflineNoCache | show retry |
| Downloading | fetch ok | JSON valid | Ready | write cache, start preview prefetch |
| Downloading | fetch ok | JSON invalid | DownloadFailed | discard, keep any old cache |
| Downloading | fetch fails | retries exhausted | DownloadFailed | show retry |
| Downloading | connection lost | — | DownloadFailed | discard partial file |
| Ready | app opens | online, hash differs | Stale | fetch in background, keep serving cache |
| Ready | app opens | offline | OfflineWithCache | serve cache silently |
| Stale | background fetch ok | — | Ready | swap cache atomically |
| Stale | background fetch fails | — | Ready | keep old cache, no message |
| OfflineNoCache | user taps Retry | online | Downloading | — |
| DownloadFailed | user taps Retry | — | Downloading | — |

**`OfflineWithCache` shows no message.** A cached catalogue is a normal working state, not a
degraded one.

---

## 3. Acceptance criteria

- Given no cache and a working connection, When the app opens, Then a progress indicator appears
  and the catalogue downloads.
- Given a cached catalogue, When the app opens offline, Then the template gallery works normally
  with no error or warning shown.
- Given no cache, When the app opens offline, Then I see "You're offline. Connect to the
  internet to get started." and a Retry button.
- Given a cached catalogue whose `contentHash` differs from the server's, When the app opens
  online, Then the cached version is served immediately and the new one downloads in the
  background.
- Given a track was in my cache but is absent from the new catalogue, When the refresh
  completes, Then it disappears from the gallery and its cached beat map is deleted.
- Given a track's `contentHash` changed, When the refresh completes, Then its beat map is
  re-downloaded before that track can be used again.
- Given a background refresh is in progress, When it fails, Then nothing is shown to the user and
  the cached catalogue continues to work.
- Given a download returns malformed JSON, When it is parsed, Then the existing cache is left
  untouched and the download is treated as failed.
- Given a download is interrupted, When the app is reopened, Then no partial file is used.
- Given the app is force-quit during a download, When it is reopened, Then it starts a fresh
  download rather than resuming a corrupt one.

---

## 4. Edge cases

| Row | Handling |
|---|---|
| F — offline at first launch | `OfflineNoCache` with Retry |
| F — connection lost mid-download | Discard partial, `DownloadFailed` |
| F — slow connection / timeout | 20s timeout, 3 retries with backoff, then `DownloadFailed` |
| F — captive portal returns HTML | Content-type and JSON parse both checked; treat as failure |
| F — partial or corrupt download | Verify `contentHash` before writing to cache |
| F — malformed JSON | Keep old cache, fail the download |
| F — stale cache | Serve immediately, refresh in background |
| B — app backgrounded mid-download | Cancel, discard partial, retry on next open |
| B — process death mid-download | Same — no resume of a partial file |
| D — storage full while writing cache | Show "Not enough storage to set up ThumpCut. Free up about 50 MB and try again." |
| A — catalogue contains zero tracks | Treat as invalid; keep old cache |
| A — a track present in the cache is absent from the new catalogue | It was retired by the Factory. Remove it from the cache and from any saved draft that references it. |
| A — a track's `contentHash` changed | Its recording was swapped. Re-download that beat map before the track is used again. |
| A — a track references a missing beat map file | Skip that track, log it, keep the rest |
| G — user taps Retry twice quickly | Second tap ignored while a fetch is in flight |
| *Out of scope:* permissions, media, interop rows |

---

## 5. Error catalogue

| # | Failure | Exact on-screen text | Recovery |
|---|---|---|---|
| K1 | Offline, no cache | "You're offline. Connect to the internet to get started." | Retry button |
| K2 | Download failed, no cache | "We couldn't load your styles. Check your connection and try again." | Retry button |
| K3 | Storage full during setup | "Not enough storage to set up ThumpCut. Free up about 50 MB and try again." | Retry button |
| K4 | Download failed, cache present | *(nothing shown)* | Silent — cache continues to serve |
| K5 | Catalogue invalid | *(nothing shown if cache present, else K2)* | Keep old cache |

---

## 6. Invariants

| ID | Invariant |
|---|---|
| K-I1 | The cache is never left in a partially-written state — writes are atomic (write to temp, then rename) |
| K-I2 | A catalogue is only cached after its `contentHash` verifies |
| K-I3 | The app never blocks on a network call once a valid cache exists |
| K-I4 | Only one catalogue fetch is in flight at a time |
| K-I5 | Every track in the served catalogue has a locally-available beat map |
| K-I6 | A track absent from the newest catalogue is never served, even if its beat map is still cached |
| K-I7 | A beat map whose `contentHash` differs from the catalogue's is re-downloaded before use |

---

## 7. Tests and Definition of Done

**Tests**
- Cache write is atomic — kill mid-write, confirm the old cache survives.
- Malformed JSON leaves the existing cache intact.
- Content-hash mismatch triggers a re-download.
- Two rapid Retry taps produce one network call (K-I4).
- Offline with cache produces no error UI.
- A track whose beat map is missing is filtered out (K-I5).

**Definition of Done**
- [ ] Every transition in §2 implemented and tested
- [ ] Every error in §5 shows the exact text specified
- [ ] Invariants K-I1..K-I5 asserted
- [ ] `npm run typecheck` and `npm test` pass, output shown
- [ ] `quickstart.md` passes on a real device

---

## 8. Regression contract

These must still hold after this phase:
- Cut engine tests all pass unchanged (Phase 2).
- Beat map schema unchanged, or `schemaVersion` bumped.

---

## 9. Quickstart (manual test)

1. Fresh install, airplane mode on. Open the app. Confirm you see "You're offline. Connect to
   the internet to get started."
2. Turn airplane mode off, tap Retry. Confirm it downloads and the gallery appears.
3. Force-quit. Turn airplane mode on. Reopen. **Confirm the gallery works normally with no
   error and no warning.**
4. Turn airplane mode off. Open airplane mode midway through a fresh install download. Reopen.
   Confirm it starts over cleanly rather than showing broken content.
5. Tap Retry twice quickly on the offline screen. Confirm nothing breaks or double-loads.
