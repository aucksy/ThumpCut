# 05 — Preview and template selection

Where the cut engine meets the screen. Must feel instant — everything here is arithmetic on data
already on the device.

---

## 1. Purpose and scope

Show the template gallery, recommend templates based on how many items the user picked, build a
cut list, and play a live preview with the track streaming.

**In scope:** template gallery, recommendation filter, cut list generation, preview playback,
beat ruler, template switching, shuffle.

**Out of scope:** export (Phase 6), reordering media (Phase 4), editing the beat grid.

### 1.1 Preview audio — MODE B, BUILT 2026-08-02

> **Owner decision, 2026-08-02. This overrides everything below it.**
>
> **The preview must play the real track. Mode A is not sufficient and is not the target.**
> The benchmark named by the owner is the Play Store app *Beats — Reel Maker for Instagram
> Beat*, which plays the actual music while previewing. ThumpCut is to do the same, and §1 of
> this spec always said so: *"play a live preview with the track streaming."*
>
> Mode A shipped as a way to unblock this phase without waiting on a terms answer. That was a
> scheduling call, not the design, and it has been read twice since as though the silent
> preview were the intent. It is not. **Build Mode B.**
>
> Mode A stays in the codebase as the fallback for when audio cannot be fetched — a device
> offline, a URL expired, a track withdrawn. It is what the user gets *instead* of silence,
> never what they get by default.

#### How Mode B was built

**No proxy and no backend.** The app is handed a plain HTTPS link and streams it, exactly as
a browser would. It holds no Instagram token, makes no Meta API call, and never copies a
recording anywhere. Nothing about invariant P1 changes: the Factory still deletes every byte
of audio it downloads.

**The links live in their own document, `audio.json`, published beside the catalogue.** The
song list is pinned to the commit the app was built from, so nothing inside it can move after
a build; Instagram's links expire in about a day and a half, so they must. Keeping them apart
is what lets a link be refreshed without a phone ever being handed a song list newer than its
app. Its schema:

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-08-02T15:00:00Z",
  "audio": {
    "<trackId>": { "url": "https://…", "expiresAt": "2026-08-04T03:00:00Z", "contentHash": "…" }
  }
}
```

`expiresAt` is `null` for a link that does not expire. `contentHash` is the beat map hash of
the recording the link was issued for: **if it does not match the catalogue's hash for that
track, the recording was swapped and the link is not played** — the beat grid would be against
a different cut of the song, every cut would land slightly wrong, and nothing would error.

**The click covers the wait, then hands over.** Streaming takes a moment. The click starts
immediately, and the moment the recording is ready the music takes over from wherever the
click had reached — no jump, no restart, no silent ruler. If the recording never arrives the
click carries the preview and the screen says why (PV7).

**Playback position comes from the player, not from a clock.** The ruler, the on-beat dot and
the picture all follow it, so audio and picture cannot drift apart while a stream stalls.

**Original text, kept for the reasoning only:**

There is an unresolved legal question about whether Meta's terms permit proxying their
`download_url` for playback in a third-party app. **That question does not block this phase.**

**Build Mode A. It is complete, shippable, and needs no decision.**

**Mode A — metronome click (build this):**
- No music plays during preview.
- A short click sounds on every beat, and a stronger click on every downbeat, generated on
  device from the beat map. No audio file is fetched.
- The beat ruler animates as specified.
- The share screen line — "Pick your track in Instagram — you'll get the full library." — carries
  the expectation.

**Mode B — real track audio (a later decision, not now):**
- Streams the recording through a backend proxy.
- Requires a written answer on Meta's terms. Until that exists, Mode B does not get built.

**Design the audio layer behind an interface so Mode B can be added later without touching the
UI:**

```typescript
interface PreviewAudio {
  load(beatMap: BeatMap): Promise<void>;
  play(fromSec: number): void;
  pause(): void;
  getPositionSec(): number;
}
```

Ship `MetronomeAudio` implementing it. `StreamedAudio` can be added later against the same
interface.

**Do not stop and ask which mode to build. Build Mode A.**

---

## 2. States and transitions

### Gallery

| State | What the user sees |
|---|---|
| `GalleryReady` | Grid of template cards, previews looping |
| `GalleryPartial` | Some preview videos not yet cached — those cards show a still first frame |
| `Recommending` | Filtered view, header "Made for N items" |

### Preview screen

| State | What the user sees |
|---|---|
| `Building` | Cut list being computed — under 100ms, so usually invisible |
| `Connecting` | The recording is on its way; the click is playing meanwhile. Nothing is said |
| `PreviewReady` | Video playing on loop, **the track playing**, beat ruler live |
| `ClickFallback` | The recording could not be fetched — click on every beat, PV7 shown |
| `Muted` | Device is on silent — video and ruler still work, no note shown |
| `TemplateIncompatible` | The chosen template cannot fit this item count — fallback applied |
| `TrackRetired` | The chosen track left Instagram's library during this session |

| From | Event | Guard | To | Side effect |
|---|---|---|---|---|
| GalleryReady | tap template | media already selected | Building | call `buildCutList` |
| GalleryReady | tap Create | — | (Phase 4) | open media selection |
| (Phase 4) | media confirmed | — | Recommending | filter by item count |
| Recommending | tap template | — | Building | call `buildCutList` |
| Building | cut list returned | audio link usable | Connecting | start the click, start streaming |
| Building | cut list returned | no usable audio link | ClickFallback | start the click, show PV7 |
| Connecting | recording ready | — | PreviewReady | click stops, music starts at the same position |
| Connecting | recording did not arrive | — | ClickFallback | keep the click, show PV7 |
| Building | `TemplateIncompatibleError` | — | TemplateIncompatible | apply fallback template, notify once |
| Building | `InsufficientMediaError` | — | (Phase 4) | return to selection with hint E9 |
| PreviewReady | tap another template | — | Building | rebuild, keep playhead position |
| PreviewReady | tap Shuffle | — | Building | reorder media, rebuild |
| PreviewReady | app backgrounded | — | (paused) | pause playback, release the player |
| PreviewReady | app foregrounded | — | PreviewReady | resume from the start of the loop |
| PreviewReady | incoming call | — | (paused) | pause, resume on return |
| PreviewReady | device switched to silent | — | Muted | click inaudible; video and ruler unchanged |
| Muted | device unsilenced | — | PreviewReady | click audible again |
| PreviewReady | selected track retired by a catalogue refresh | — | TrackRetired | offer the nearest-BPM alternative |
| PreviewReady | tap Export | — | (Phase 6) | pass cut list |

---

## 3. Acceptance criteria

- Given the catalogue is cached, When the gallery opens, Then template cards appear immediately
  with no spinner.
- Given a template's preview video is not yet cached, When the card renders, Then it shows the
  first frame as a still, never an empty box.
- Given I selected 9 items, When the recommendation screen opens, Then the header reads "Made
  for 9 items" and templates suited to 9 items appear first.
- Given templates that do not suit 9 items, When I scroll, Then they appear below a divider
  labelled "Also works" — they are not hidden.
- Given I tap a template, When the preview builds, Then playback starts within 500ms.
- Given the preview is playing, When I tap a different template, Then the preview re-cuts
  immediately with no loading indicator.
- Given the preview is playing, When I look at the beat ruler, Then a marker sits at every cut,
  markers for video clips are visually distinct from photos, and the playhead moves in time.
- Given the preview is playing and the recording is available, When I listen, Then I hear **the
  track itself**, and the picture changes on its beats.
- Given the recording is still arriving, When the preview starts, Then I hear the click rather
  than silence, and the music takes over at the same position without restarting.
- Given the recording cannot be fetched at all, When the preview plays, Then I hear a click on
  every beat and a stronger click on every downbeat, and the screen tells me why once.
- Given the catalogue's link points at a different recording than the beat grid was computed
  from, When the preview plays, Then the track is not played and the click is used instead.
- Given the device is muted or silent mode is on, When the preview plays, Then the video still
  plays normally and the beat ruler still animates.
- Given I background the app during preview, When I return, Then playback resumes without a
  crash and without audio and video drifting apart.
- Given a template cannot fit my item count, When it is applied, Then a workable fallback is used
  and I am told once, not repeatedly.
- Given I tap Shuffle, When the preview rebuilds, Then the media order changes and the cut
  timing still lands on beats.
- Given the track I chose is retired by a catalogue refresh while I am previewing, When the
  refresh completes, Then a similar-tempo track is substituted automatically and I am told once.
- Given my device is on silent, When the preview plays, Then the video and beat ruler work
  normally and no warning is shown.

---

## 4. Edge cases

| Row | Handling |
|---|---|
| A — exactly 3 items | All templates offered; long holds |
| A — exactly 30 items | Templates whose density cannot fit 30 fall back |
| A — all items are video | Works; no Ken Burns applied anywhere |
| A — all items are photos | Works; no speed fitting anywhere |
| A — item count outside every template's ideal range | Everything appears under "Also works" |
| B — backgrounded during playback | Pause, release the player, resume cleanly |
| B — incoming call | Pause, resume on return |
| B — screen lock | Pause |
| B — rotation | Preserve the selected template and playhead |
| B — process death | Restore selection and template; rebuild the cut list |
| D — a selected item became unavailable since Phase 4 | Skip it, rebuild, show E4 once |
| D — out of memory building the preview | Reduce preview resolution, retry once, then fall back to a still-frame preview |
| F — offline | The cut list, ruler and click all work with nothing fetched. The track cannot stream, so the click carries it and PV7 is shown |
| F — audio link expired | Click, PV7. A newer `audio.json` carries a fresh link and the next preview streams |
| F — stream stalls mid-playback | Position comes from the player, so the ruler and picture stall with it rather than drifting ahead |
| B — recording arrives after the user has already left the screen | The player is released and the late arrival is discarded |
| A — chosen track retired by a refresh | Swap to the nearest track within ±4 BPM, rebuild, show PV6 once. The cut list is expressed in beats, so a same-tempo substitute holds up. |
| A — no alternative track within ±4 BPM | Return to the gallery with PV5 |
| B — device on silent | Video and ruler still work; no warning shown |
| G — rapid template tapping | Debounce to the last tap; cancel in-flight builds |
| G — tap Export while a build is in flight | Wait for the build, then proceed |
| I — screen reader | Template cards announce name and ideal item count; the ruler is decorative and hidden from the reader |
| I — reduced motion | Card autoplay off, ruler pulses off, playhead still moves |

---

## 5. Error catalogue

| # | Failure | Exact on-screen text | Recovery |
|---|---|---|---|
| PV2 | Template cannot fit item count | "This style needs a different number of items, so we adjusted it." *(shown once)* | Fallback template applied |
| PV3 | An item became unavailable | "One item was skipped because it's no longer available." | Rebuild without it |
| PV4 | Fewer than 3 usable items remain | "Pick at least 3 items." | Return to media selection |
| PV5 | Preview could not be built | "We couldn't build a preview. Try a different style." | Return to the gallery |
| PV6 | Chosen track retired mid-session | "That track isn't available anymore. Here's a similar one." | Auto-swap to the nearest available track within ±4 BPM and rebuild |
| PV7 | The recording could not be streamed — offline, link expired, link withdrawn, or issued for a different recording | "We couldn't load the track, so you'll hear a click on each beat." *(stays for as long as the click is playing — this is a state, not an event, and a message that vanished would leave the user hearing a click with no explanation)* | Fall back to the click. The ruler, the cuts and the export are unaffected |

---

## 6. Invariants

| ID | Invariant |
|---|---|
| V1 | The gallery never shows a spinner once a catalogue is cached |
| V2 | Only one cut list build runs at a time; earlier builds are cancelled |
| V3 | The beat ruler always has exactly one marker per cut in the current cut list |
| V4 | The preview and the exported file are produced from the **same** cut list object |
| V5 | The preview is never *blocked* by the network once the catalogue is cached — the cut list, the ruler and the click all work offline. Only the track itself needs the network, and its absence is a fallback, never a failure |
| V7 | A retired track is never left selected — it is always substituted or the user is returned to the gallery |
| V6 | Backgrounding always releases the video player **and both audio players**; foregrounding always recreates them |
| V8 | A recording is never played against a beat grid computed from a different recording. The content hashes must match |
| V9 | The app never holds an Instagram token and never calls Meta. It streams a link it was given, or it plays the click |

**V4 matters most.** If the preview and the export come from different builds, the user will
see one thing and get another.

---

## 7. Tests and Definition of Done

**Tests**
```
✓ recommendation filter returns templates whose idealItemRange contains N, first
✓ templates outside the range still appear, below the divider
✓ rapid template taps result in exactly one completed build     (V2)
✓ ruler marker count equals cut count                           (V3)
✓ preview works fully in airplane mode                          (V5)
✓ the cut list passed to export is identical to the previewed one (V4)
✓ background/foreground cycle does not leak a player            (V6)
✓ each error PV1–PV5 fires under its condition
✓ a link whose contentHash differs from the catalogue's is never played   (V8)
✓ an expired link is never played, and an undated one is treated as expired
✓ a non-HTTPS link is never handed to a player
✓ the click plays while the recording is still arriving, and stops when it lands
✓ handover keeps the position — the music starts where the click had reached
✓ a recording that arrives after release is discarded, not played  (V6)
✓ a failed audio index fetch leaves the cached one in place and shows nothing
```

**Definition of Done**
- [ ] Every transition implemented and tested
- [ ] Every error shows the exact text in §5
- [ ] Invariants V1–V9 asserted
- [ ] Gallery renders with no spinner on a cold start with a warm cache
- [ ] Reduced-motion setting respected
- [ ] `npm run typecheck` and `npm test` pass, output shown
- [ ] `quickstart.md` passes on a real device

---

## 8. Regression contract

Must still pass after this phase:
- All Phase 2 cut engine tests, unchanged.
- Phase 3: offline-with-cache shows no error.
- Phase 4: all selection limits, restoration, and error texts.

---

## 9. Quickstart (manual test)

1. Open the app with a warm cache. Confirm the gallery appears **with no spinner**.
2. Tap Create, pick 9 items, continue. Confirm the header reads "Made for 9 items."
3. Scroll down. Confirm other templates appear under "Also works" rather than being hidden.
4. Tap a template. Confirm the preview starts within about half a second.
5. Tap through 5 templates quickly. Confirm no loading indicator and no crash.
6. Watch the beat ruler. Confirm markers line up with the moments the picture changes, and that
   clip markers look different from photo markers.
7. Listen. Confirm **the song is playing**, and that the picture changes on its beats.
8. Turn on airplane mode and reopen the preview. Confirm the cut list, the ruler and the click
   all still work, and that the screen says the track could not be loaded — once.
9. Background the app for 30 seconds, return. Confirm playback resumes and audio still matches
   the picture.
10. Turn on the system reduced-motion setting. Confirm card previews stop autoplaying.
11. Tap Shuffle a few times. Confirm the order changes and cuts still land on the beat.
