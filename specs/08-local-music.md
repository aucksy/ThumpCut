# 08 — Your music: local files, analysed on the device

Added 2026-08-02 at the owner's direction. This is the feature that makes ThumpCut
self-sufficient: *"I want to be able to use royalty free music available in my phone, create
reels with it and share anywhere I want."* It must work with no Meta account, no catalogue
server and no network.

---

## 1. Purpose and scope

The user picks a song already on their phone. The app reads its beat grid **on the device**,
then the normal flow runs unchanged: templates, preview with the song playing, export. The
export **carries the music inside the file** (spec 09 §2 defines that export mode), and the
share screen offers YouTube and the system share sheet (spec 10).

**In scope:** scanning the device for audio; on-device beat analysis with progress; caching
one analysis per file for ever; title and artist from the file's tags; the local track
behaving exactly like a catalogue track downstream.

**Out of scope:** editing or trimming the song; a music player; folder management; iTunes /
streaming-app libraries (only what the media library exposes as audio files); analysing
files over 15 minutes (refused with a plain error before any work).

## 2. States and transitions

| State | Meaning | Leaves by |
|---|---|---|
| PermissionUnknown | Asked on open | grant → Scanning, deny → PermissionDenied |
| PermissionDenied | Explains itself, offers Settings | returning with permission → Scanning |
| Scanning | The library query is running. No spinner. | results → Ready or Empty |
| Empty | No usable songs | user leaves, or files appear |
| Ready | The list. Tap a song to analyse it. | tap → Analysing (or instant pick on a cache hit) |
| Analysing | One song, live percentage; other rows dim and stop accepting taps | done → selection made, screen closes · failure → AnalysisFailed |
| AnalysisFailed | Toast with the reason; list fully usable | next tap → Analysing |

## 3. Acceptance criteria

- Given permission is denied, when the screen opens, then the exact L1 text and an
  "Open Settings" action are shown, and nothing else is.
- Given a song under 10 seconds is on the device, when the list renders, then that song is
  not in it at all.
- Given a song is tapped, when analysis runs, then a percentage is visible and moves, and
  every other row is dimmed and inert.
- Given the same song was analysed before and the file has not changed, when it is tapped,
  then selection is immediate — no analysis state appears.
- Given the file changed on disk (same name, new content), when it is tapped, then it is
  re-analysed — the cache key includes the file's modification time.
- Given analysis succeeds, when the flow continues, then the preview plays the song itself
  from the file, the beat ruler moves against its real grid, and the exported file carries
  the song (spec 09 §2.1 validates that).
- Given analysis fails, when the toast shows, then the list is usable and a different song
  can be tried immediately.
- Given the user leaves the screen mid-analysis, when the result lands, then it is
  discarded — the app does not navigate on its own.

## 4. Edge cases (scoped from 00 §6)

- **A. Boundary values** — zero songs (Empty); one song; a file exactly 10s (offered);
  9.9s (not offered); a file over 15 minutes (decoder refuses, exact L4-family error);
  untagged files (title from the filename, artist "Your music").
- **B. Lifecycle** — backgrounding mid-analysis: the work continues (it is compute, not
  UI); the screen re-attaches to the result. Process death mid-analysis: the analysis is
  simply lost; reopening re-runs it. Never a corrupt cache: the beat map is written once,
  whole, after validation.
- **C. Permissions** — audio permission is separate from photos on modern Android and is
  requested with the audio scope only. Revoked-while-backgrounded is re-checked on open.
- **D. Storage** — the decoded samples are scratch and deleted after analysis, success or
  failure. The cached beat map is a few hundred KB of JSON in the app's documents.
- **E. Media specifics** — mp3, m4a/aac, flac, ogg, wav: whatever the phone can decode. A
  file with a video stream (cover art) is fine — only the audio track is read. A corrupt
  file fails with L4, never crashes.

## 5. Error catalogue

| ID | When | Exact text | Recovery |
|---|---|---|---|
| L1 | Audio permission denied | "ThumpCut needs access to your music to read its beat." | "Open Settings" action |
| L2 | No usable songs on the device | "No songs on this device. Download a royalty-free track and it will show up here." | User adds files |
| L3 | Analysis running | "Reading the beat" | Wait; a live percentage follows the text |
| L4 | Analysis failed | "We couldn't read a beat in that song. Try a different one." | Tap another song |

## 6. Invariants

| ID | Invariant |
|---|---|
| LM1 | Analysis runs entirely on the device. No byte of the song ever leaves the phone. |
| LM2 | A song is analysed at most once per file identity (uri + duration + mtime). |
| LM3 | The produced beat map passes every schema invariant of 00 §3.1 before it is used or cached. |
| LM4 | The decoded sample file never survives the analysis that produced it. |
| LM5 | The beat engine is the Factory's algorithm — held to the Factory's published answers by a parity test over the committed fixture WAVs. |
| LM6 | Songs shorter than 10 seconds are never offered. |
| LM7 | A local track never enters the published catalogue and never leaves the device. |

## 7. Tests and Definition of Done

- ☑ `@thumpcut/beat-engine`: ground truth over a 60–190 BPM synthesised sweep (beats within
  25ms of the true grid); parity with the Python engine on all three committed fixture WAVs
  (beats within 12ms, same downbeats, same sections); determinism; schema validation.
- ☑ Controller tests: permission, empty, short-file filtering, cache hit, cache key moves
  with mtime, scratch cleanup on success and failure, failure recovery, stale-result drop.
- ☑ Screen states rendered and measured: ready, analysing, denied, empty, failed.
- ☐ Device: pick a real mp3, watch the percentage move, hear the song in the preview, and
  confirm the export plays it in the gallery. (Awaiting device verification.)
