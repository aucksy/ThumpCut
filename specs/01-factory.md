# 01 — Factory (offline beat pipeline)

Python. Runs on a machine or cheap VPS. **Never runs on a user's phone.**

---

## 1. Purpose and scope

Get the trending track list and the actual audio from Meta's Instagram Audio API, compute a beat
map for each track, and publish the results as static JSON.

**In scope:** trending discovery, audio fetch, beat and downbeat detection, energy curve,
section boundaries, best-window selection, fingerprinting, re-verification, JSON output, publish
to Cloudflare R2.

**Out of scope:** anything running on a device; an admin UI; scheduling beyond a cron entry.

---

## 2. Audio source — read this before writing any code

**Audio comes from Meta's Instagram Audio API. Not iTunes. Not anywhere else.**

```
GET /ig_audio?audio_type=music&user_id={IG_USER_ID}&access_token={TOKEN}
```

Sending **no search query returns trending music by default.** Each track in the response
carries `audio_id`, `title`, `display_artist`, `duration_in_ms`, and a `download_url` — a
temporary preview of **the actual recording in Instagram's library**, valid roughly 1.5 days.

**Why this and nothing else:** the beat grid must come from the same recording Instagram will
attach to the user's reel. Any other source is a different master, a different section, or a
different tempo — and the sync breaks silently, with no error to catch.

iTunes previews were considered and rejected on two independent grounds: they begin at an
uncontrollable, unexposed offset (typically around 30 seconds in), and Apple's terms forbid
synchronising previews with video.

The 1.5-day expiry is irrelevant. We fetch, analyse, discard, and keep only numbers.

**Credentials** — see `.env.example`: `META_APP_ID`, `META_APP_SECRET`, `META_ACCESS_TOKEN`,
`IG_USER_ID`. Requires an Instagram Business or Creator account linked to a Facebook Page with
`instagram_basic` and `instagram_content_publish`.

**If credentials are missing, the Factory MUST run in fixture mode (§10), not fail.**

---

## 3. States and transitions

| State | Meaning |
|---|---|
| `Pending` | Returned by the API, not yet processed |
| `Fetching` | Downloading from `download_url` |
| `FetchFailed` | Download failed after retries |
| `Analysing` | Running beat and structure detection |
| `AnalysisFailed` | Errored or failed sanity checks |
| `Ready` | Beat map written |
| `Published` | Uploaded and listed in `catalogue.json` |
| `Unchanged` | Re-verification found the same recording |
| `Changed` | Re-verification found a different recording |
| `Retired` | No longer in the API response |

| From | Event | Guard | To |
|---|---|---|---|
| Pending | new track | not in catalogue | Fetching |
| Pending | existing track | already in catalogue | re-verify (§4) |
| Fetching | download ok | — | Analysing |
| Fetching | failed after 3 retries | — | FetchFailed |
| Analysing | detection ok | passes sanity checks | Ready |
| Analysing | detection ok | fails sanity checks | AnalysisFailed |
| Analysing | exception | — | AnalysisFailed |
| Ready | upload ok | — | Published |
| existing | fingerprint matches | — | Unchanged |
| existing | fingerprint differs | — | Changed → Analysing |
| existing | absent from response | — | Retired |

**One bad track never stops the batch.** Log the title and reason, continue.

---

## 4. Re-verification — runs every time

Tracks change underneath us. Three things happen in the wild: a track is pulled when a licence
lapses; a recording is swapped for a remaster or clean version; regional availability shifts.
**The swap is the dangerous one — nothing errors, the grid is just silently wrong.**

For every track already in the catalogue:

1. Still in the API response? If not → `Retired`, remove from `catalogue.json`.
2. Does `duration_in_ms` match stored `sourceDurationMs`? If not → `Changed`.
3. Fetch audio, compute fingerprint, compare to stored `audioFingerprint`. Differs → `Changed`.
4. `Changed` → re-analyse from scratch, bump `contentHash`. Apps re-download automatically.
5. `Unchanged` → update `lastVerifiedAt`, touch nothing else.

**Fingerprint method:** a chromaprint-style fingerprint of the decoded audio, or if unavailable,
SHA-256 of the decoded PCM downsampled to 8kHz mono. Either works — it only needs to answer "is
this a different recording", not identify unknown audio.

**Key on `audio_id`, trust the fingerprint.** If Meta ever reuses an `audio_id`, the fingerprint
catches it and the duration check backs it up.

---

## 5. Acceptance criteria

- Given valid credentials, When the Factory runs with no search query, Then it receives a
  trending track list from Meta.
- Given a track from that list, When audio is fetched, Then it comes from that track's
  `download_url` and no other source.
- Given fetched audio, When analysis runs, Then output contains `beatsSec`, `downbeatsSec`,
  `bpm`, `energyCurve`, `sections`, `audioFingerprint` and `sourceDurationMs`.
- Given analysis output, When sanity checks run, Then BPM outside 50–200 marks `AnalysisFailed`.
- Given analysis output, When sanity checks run, Then `energyCurve.length === beatsSec.length`,
  else `AnalysisFailed`.
- Given `downbeatsSec`, When checked, Then every value also appears in `beatsSec`.
- Given an unchanged track, When the run completes, Then its beat map is untouched and only
  `lastVerifiedAt` moves.
- Given a changed fingerprint, When the run completes, Then it is re-analysed and `contentHash`
  differs.
- Given a track absent from the response, When the run completes, Then it is removed from
  `catalogue.json`.
- Given any audio was analysed, When the run completes, Then no audio file remains on disk.
- Given 30 tracks where 3 fail, When complete, Then 27 publish and 3 failures are listed.
- Given no credentials, When the Factory runs, Then it uses fixtures and says so, not crashes.

---

## 6. Edge cases

| Row | Handling |
|---|---|
| A — API returns zero tracks | Keep previous catalogue, warn, exit 0 |
| A — duplicate `audio_id` | Deduplicate before processing |
| A — malformed track object | Skip, log, continue |
| F — `download_url` expired | Re-request the list once, retry with fresh URL |
| F — connection lost mid-download | 3 retries with backoff, then `FetchFailed` |
| F — rate limited | Sleep, exponential backoff |
| F — access token expired | Fail loudly, name the env var |
| F — response is HTML not JSON | Treat as failure, keep previous catalogue |
| E — audio shorter than 10s | `AnalysisFailed` |
| E — audio decodes to silence | `AnalysisFailed` |
| D — disk fills mid-run | Abort loudly, publish nothing |
| D — R2 upload fails partway | Abort publish, leave previous catalogue live |
| *Out of scope:* mobile lifecycle, permissions, interop — this is a server script |

---

## 7. Error catalogue

| # | Failure | Log line | Recovery |
|---|---|---|---|
| F1 | No credentials | `NO_CREDENTIALS: running in fixture mode. Set META_ACCESS_TOKEN for live data.` | Fixtures |
| F2 | Token invalid | `FATAL: Meta API rejected the token. Check META_ACCESS_TOKEN.` | Abort |
| F3 | Download failed | `FETCH_FAIL <title>: <status> after 3 attempts` | Exclude, continue |
| F4 | Audio too short | `ANALYSIS_FAIL <title>: only <n>s, need 10s minimum` | Exclude, continue |
| F5 | BPM out of range | `ANALYSIS_FAIL <title>: detected <n> BPM, outside 50–200` | Exclude, continue |
| F6 | Length mismatch | `ANALYSIS_FAIL <title>: energyCurve <a> != beats <b>` | Exclude, continue |
| F7 | Disk full | `FATAL: disk full while writing <path>` | Abort, publish nothing |
| F8 | Upload failed | `PUBLISH_FAIL <file>: <error>` | Abort publish |
| F9 | Track retired | `RETIRED <title>: no longer in Instagram's library` | Remove from catalogue |
| F10 | Recording changed | `CHANGED <title>: fingerprint differs, re-analysing` | Re-analyse, bump hash |

---

## 8. Invariants

| ID | Invariant |
|---|---|
| P1 | No audio file remains on disk after a run, including after failure |
| P2 | `downbeatsSec` is always a subset of `beatsSec` |
| P3 | `energyCurve.length === beatsSec.length` |
| P4 | `beatsSec` is strictly increasing |
| P5 | Every published track has a non-empty `contentHash` and `audioFingerprint` |
| P6 | A partially-failed run never overwrites a good `catalogue.json` |
| P7 | Beat This! is never invoked with `dbn=True` |
| P8 | Audio is only ever fetched from a Meta `download_url` |
| P9 | `contentHash` changes if and only if the beat map content changed |

---

## 9. Tests and Definition of Done

**Tests** — all run against fixtures, no network required.
- Sanity checks P2–P4 on good and deliberately broken beat maps
- Fingerprint detects a changed recording (analyse a file, then a different one, assert differ)
- Fingerprint is stable (same file twice, assert match)
- Re-verification marks an absent track `Retired`
- A broken track in a batch of 5 leaves 4 published, 1 reported
- P1: temp directory empty after a run, including a forced failure

**Definition of Done**
- [ ] Every transition in §3 implemented and tested
- [ ] Re-verification (§4) implemented and tested
- [ ] Every error in §7 produces the exact log line
- [ ] Invariants P1–P9 asserted in code, not only tested
- [ ] Runs end to end in fixture mode with no credentials
- [ ] `pytest` passes

---

## 10. Fixture mode — required, build this first

The Factory **must** run without credentials so nothing downstream is blocked.

Ship `factory/fixtures/` with 3 short royalty-free audio files. When `META_ACCESS_TOKEN` is
unset: log F1, use fixture audio instead of calling Meta, and produce a real `catalogue.json`
with 3 tracks.

Everything downstream — cut engine, catalogue, preview, render — can then be built and verified
against real beat data before any credentials exist.

---

## 11. Regression contract

First phase. Nothing to regress. Later phases must not change the beat map schema without
bumping `schemaVersion`.

---

## 12. Quickstart (manual test)

1. With no `.env`, run `python -m factory.run`. Confirm it logs `NO_CREDENTIALS`, uses fixtures,
   and writes `catalogue.json` with 3 tracks.
2. Confirm `factory/tmp/` is empty afterwards.
3. Open a beat map. Confirm `beatsSec` increases and every `downbeatsSec` value appears in it.
4. Run again. Confirm all 3 report `Unchanged` and are not re-analysed.
5. Swap one fixture audio file for a different song, keeping the filename. Run again. Confirm
   that track reports `CHANGED` and is re-analysed.
