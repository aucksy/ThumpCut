# 06 — Render

The highest technical risk in the project. Where the app will crash on mid-range Android if the
memory rules are treated as suggestions.

---

## 1. Purpose and scope

Turn a cut list plus media into a silent MP4 on the device, and save it.

**In scope:** composition, video decode and re-encode, trimming, speed fitting, freeze frames,
Ken Burns on photos, cropping and rotation, progress reporting, cancellation, output validation,
saving to the gallery.

**Out of scope:** the Instagram handoff (Phase 7), audio of any kind, aspect ratios other than
9:16.

---

## 2. Output specification

| Property | Value | Why |
|---|---|---|
| Resolution | 1080×1920 | Instagram Reels native |
| Frame rate | **30fps constant** | Variable frame rate causes drift after Instagram re-encodes |
| Codec | H.264, `yuv420p`, closed GOP | Widest compatibility |
| Audio | **No audio track at all** | Instagram supplies the music |
| Container | MP4, `+faststart` | moov atom first |
| Edit lists | **Must be absent** | They shift playback start and break sync |
| Bitrate | 8–12 Mbps target | Quality without absurd file size |

### 2.1 Post-export validation — mandatory

After every export, assert:
```
r_frame_rate === avg_frame_rate      (confirms constant frame rate)
no elst box present                   (confirms no edit list)
start_time === 0
duration within 100ms of cutList.totalDurationSec
no audio stream present
width === 1080 && height === 1920
```
If any assertion fails, the export is a failure. Do not save a file that fails validation.

---

## 3. States and transitions

| State | What the user sees |
|---|---|
| `Idle` | Export button available |
| `Preparing` | "Getting your media ready" — validating items exist and are readable |
| `Rendering` | Progress percentage, Cancel available |
| `Validating` | Brief — running the §2.1 checks |
| `Saving` | Writing to the gallery |
| `Complete` | Transitions straight to the share sheet |
| `Cancelled` | Back to preview, no file left behind |
| `Failed` | Error message with a retry or a suggestion |

| From | Event | Guard | To | Side effect |
|---|---|---|---|---|
| Idle | tap Export | ≥3 valid items | Preparing | lock the cut list |
| Preparing | all items readable | — | Rendering | begin composition |
| Preparing | an item unreadable | ≥3 remain | Rendering | skip it, note for later |
| Preparing | fewer than 3 remain | — | Failed | error R6 |
| Preparing | insufficient storage | — | Failed | error R1 |
| Rendering | progress tick | — | Rendering | update percentage |
| Rendering | tap Cancel | — | Cancelled | stop, delete partial file |
| Rendering | out of memory | first attempt | Rendering | retry once at reduced concurrency |
| Rendering | out of memory | already retried | Failed | error R2 |
| Rendering | storage fills | — | Failed | error R1, delete partial |
| Rendering | app backgrounded | Android | Rendering | continue in a foreground service |
| Rendering | app backgrounded | iOS | Rendering | continue while allowed; if suspended, fail on resume with R5 |
| Rendering | complete | — | Validating | run §2.1 |
| Validating | all pass | — | Saving | write to gallery |
| Validating | any fail | — | Failed | error R3, delete the file |
| Saving | write ok | — | Complete | open share sheet |
| Saving | write fails | — | Failed | error R1 |
| Failed | tap Retry | — | Preparing | start over |

**The screen must stay awake for the whole of `Rendering`.**

---

## 4. Acceptance criteria

- Given a cut list of 40 cuts mixing photos and videos, When I export on a mid-range Android
  phone, Then it completes in under 90 seconds.
- Given an export is running, When I look at the screen, Then I see a percentage that increases
  and never goes backwards.
- Given an export is running, When I tap Cancel, Then it stops within 2 seconds and no file
  appears in my gallery.
- Given an export completes, When the file is validated, Then it is exactly 1080×1920, exactly
  30fps constant, and contains no audio track.
- Given an export completes, When I play it in the system gallery, Then the picture changes land
  on the same moments as they did in the preview.
- Given 15 video clips totalling 300 seconds, When I export, Then it completes without an
  out-of-memory crash.
- Given a landscape clip, When it is rendered, Then it is centre-cropped to 9:16, not
  letterboxed or blurred.
- Given a clip recorded sideways with rotation metadata, When it is rendered, Then it appears the
  right way up.
- Given a variable-frame-rate source clip, When it is rendered, Then the output is still constant
  30fps.
- Given an item was deleted after selection, When export prepares, Then it is skipped and the
  reel is built from the rest.
- Given the app is backgrounded mid-render on Android, When I return, Then the render has
  continued.
- Given storage runs out mid-render, When it fails, Then no partial file is left behind.

---

## 5. Edge cases

| Row | Handling |
|---|---|
| A — exactly 3 items | Renders normally |
| A — exactly 30 items, 15 video | Renders within the memory budget |
| A — cut list with a single 0.35s slide | Renders; produces at least 10 frames |
| B — backgrounded on Android | Foreground service keeps it running |
| B — backgrounded on iOS | Continue while permitted; on suspension, fail cleanly with R5 |
| B — screen lock | Screen kept awake during render; if locked anyway, treat as background |
| B — incoming call | Render continues; audio is irrelevant |
| B — process death mid-render | On reopen, no partial file, no crash; return to preview |
| B — battery saver throttling | Render continues, slower; no timeout failure |
| B — rotation mid-render | Progress sheet reflows; render unaffected |
| D — storage fills mid-write | Fail with R1, delete partial |
| D — out of memory during decode | Retry once at lower concurrency, then R2 |
| D — item deleted between preview and export | Skip, continue if ≥3 remain |
| E — HEIC photo | Decoded and converted |
| E — HDR video | Tone-mapped to SDR; must not produce a washed-out or black frame |
| E — variable frame rate source | Resampled to constant 30fps |
| E — rotation metadata | Honoured before cropping |
| E — clip shorter than its slot | Freeze-extended per the cut engine's instruction |
| E — unsupported codec discovered at decode time | Skip the item, error R4, continue if ≥3 remain |
| E — zero-byte file | Skip, error R4 |
| E — clip with no audio track | Normal; output is silent regardless |
| E — extremely large source (4K, 10 minutes) | Downscale at decode; respect the 300s total cap |
| G — double-tap Export | Debounced; one render |
| G — Cancel pressed as the render completes | Treated as cancel; file deleted; no share sheet |
| G — navigate back mid-render | Render cancelled, partial deleted |
| I — screen reader | Progress announced as a percentage at intervals, not on every tick |

---

## 6. Error catalogue

| # | Failure | Exact on-screen text | Recovery |
|---|---|---|---|
| R1 | Not enough storage | "Not enough storage. Free up about 200 MB and try again." | Retry button |
| R2 | Out of memory | "This reel is too heavy for your phone. Try using fewer video clips." | Return to preview |
| R3 | Output failed validation | "Something went wrong making your reel. Please try again." | Retry button |
| R4 | An item could not be decoded | "One item was skipped because it couldn't be read." | Continue with the rest |
| R5 | iOS suspended the render | "Your reel didn't finish because the app went to the background. Keep ThumpCut open while it renders." | Retry button |
| R6 | Fewer than 3 usable items | "We need at least 3 usable items to make a reel." | Return to selection |
| R7 | Render failed for any other reason | "Something went wrong making your reel. Please try again." | Retry button |

### Non-error copy — use exactly

| State | Exact text |
|---|---|
| Preparing | "Getting your media ready" |
| Rendering | "Rendering your reel." with the percentage in mono, e.g. `47%` |
| Cancel button | "Cancel" |
| Saved to gallery | "Saved to your gallery." |

---

## 7. Invariants

| ID | Invariant |
|---|---|
| R-I1 | Output is always exactly 1080×1920, 30fps constant, with no audio track |
| R-I2 | No file is saved to the gallery unless it passes every §2.1 check |
| R-I3 | A cancelled or failed render never leaves a file in the gallery or a temp file on disk |
| R-I4 | Video is decoded **sequentially**, never in parallel |
| R-I5 | No more than 3 decoded frames are held in memory at once |
| R-I6 | Decode is always at output resolution or lower, never full source resolution |
| R-I7 | Progress never decreases |
| R-I8 | Only one render runs at a time |
| R-I9 | The cut list used to render is the same object that was previewed |

R-I4, R-I5 and R-I6 are the memory rules. **They are the difference between working and crashing
on a 2GB device.** Treat them as hard requirements, not optimisations.

---

## 8. Library choice

1. **`react-native-media-toolkit`** — wraps `AVMutableComposition` (iOS) and Media3
   `Transformer` (Android), both built for composing clips with trims and speed changes. Try
   this first.
2. **Fallback:** self-hosted **LGPL** FFmpeg in the dev client.

**Spike before building:** confirm the library can compose a timeline mixing **still images**
with trimmed and speed-adjusted video. Clip handling is its core competence; stills are the
uncertainty. Time-box this to one day and report the result before proceeding.

`ffmpeg-kit-react-native` is retired and its binaries were removed in April 2025. Do not use it.

---

## 9. Tests and Definition of Done

**Tests**
```
✓ output passes every §2.1 assertion, for 20 different cut lists
✓ cancel leaves no file and no temp files                       (R-I3)
✓ failed validation leaves no file                              (R-I2)
✓ progress is monotonic                                         (R-I7)
✓ double-tap Export produces one render                         (R-I8)
✓ landscape source is centre-cropped, not letterboxed
✓ rotated source renders upright
✓ VFR source produces CFR output
✓ each error R1–R7 fires under its condition
```

**Device tests — mandatory, on a real mid-range Android phone**
```
✓ 30 items including 15 videos totalling 300s exports without OOM
✓ export completes in under 90 seconds for 40 cuts
✓ backgrounding mid-render on Android continues the render
✓ process death mid-render leaves no partial file
```

**Definition of Done**
- [ ] Every transition implemented and tested
- [ ] Every error shows the exact text in §6
- [ ] Invariants R-I1..R-I9 asserted in code
- [ ] §2.1 validation runs on every export and blocks saving on failure
- [ ] Memory rules R-I4..R-I6 visibly implemented, not just claimed
- [ ] Device tests pass on a real ₹15–20k Android phone
- [ ] `npm run typecheck` and `npm test` pass, output shown
- [ ] `quickstart.md` passes

---

## 10. Regression contract

Must still pass after this phase:
- All Phase 2 cut engine tests, unchanged.
- Phase 3 offline behaviour.
- Phase 4 selection limits, restoration, and error texts.
- Phase 5: gallery still has no spinner; preview still starts within 500ms; V4 still holds — the
  rendered file matches what was previewed.

---

## 11. Quickstart (manual test)

On a real mid-range Android phone.

1. Pick 8 photos, export. Confirm it completes and appears in your gallery.
2. Play it. Confirm the picture changes at the same moments you saw in the preview.
3. Pick 15 video clips and 15 photos. Export. **Confirm it does not crash.** Note the time.
4. Start an export and tap Cancel halfway. Confirm it stops quickly and **nothing appears in
   your gallery**.
5. Start an export and press Home. Wait 30 seconds. Return. Confirm it is still going or has
   finished.
6. Include a landscape clip. Confirm it fills the frame rather than showing bars.
7. Include a clip you filmed sideways. Confirm it is the right way up.
8. Fill your phone's storage almost completely, then export. Confirm you see "Not enough storage.
   Free up about 200 MB and try again." and no broken file appears.
9. Delete one of your selected photos from the gallery app, return, and export. Confirm it skips
   that one and still makes a reel.
