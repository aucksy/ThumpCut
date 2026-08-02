# Progress

Last updated: 2026-08-02.

## Status

| Phase | Built | Tests pass | Device-verified | Notes |
|---|---|---|---|---|
| 01 Factory | ☑ | ☑ 151 | n/a | Runs with no credentials. Beat detection exact on a 60–190 BPM sweep. |
| 02 Cut engine | ☑ | ☑ 173 | n/a | Includes property tests over the whole input space. |
| 03 Catalogue | ☑ | ☑ | ☐ | Logic fully tested. Real network conditions need a phone. |
| 04 Media selection | ☑ | ☑ | ☐ | Permissions, process death and real photo libraries need a phone. |
| 05 Preview | ☑ | ☑ | ☐ | Cut list, ruler and click all tested. Playback needs a phone. |
| 06 Render | ☑ | ☑ | ☐ | Output validation is fully automated. Memory behaviour needs a phone. |
| 07 Instagram handoff | ☑ | ☑ | ☐ | Blocked on a Meta app id. See OPEN-QUESTIONS. |
| Design system | ☑ | ☑ 18 | ☐ | 40 screen states rendered, measured and screenshotted on every push. |
| Cloud build | ☑ | — | — | GitHub Actions builds and publishes an installable APK on every push. |

Totals: **474 automated checks** — 151 Python, 323 TypeScript — plus 4 UI gates over 120
screen-state measurements.

## Getting it onto a phone

`TEST-ON-YOUR-PHONE.md` is the owner-facing version of this. In short:

- Every push to `main` builds a **release APK** — not a development build — and republishes it
  at <https://github.com/aucksy/ThumpCut/releases/latest>. No laptop, no Expo account, no
  Android SDK, no Metro.
- It is signed with the Expo template's debug key, which is byte-identical on every prebuild,
  so a new build installs over the old one.
- The song list and beat maps live in `catalogue/` and are served by jsDelivr, pinned to the
  commit the APK was built from.

## What can be trusted without a phone

- The Factory detects the right tempo, on the right octave, with every beat inside 25ms of the
  true grid, across a 60–190 BPM sweep.
- Every cut lands within 50ms of a beat, no slide is under 0.35s, and no guardrail is violated
  — proved across every item count from 3 to 40, every template, and forty random mixes of
  photos and clips.
- The same inputs always produce the same reel.
- Every exact string in a spec's error catalogue appears verbatim in the app.
- Every screen state renders at 393×852, 360×640 and at font scale 1.6 with no clipping, no
  overflow, no tap target under 44pt and no unreadable text.
- The export validator rejects an edit list, a variable frame rate, an audio track, the wrong
  size, the wrong length, and a moov atom in the wrong place.

## Known gaps in the renderer

Both are in the native Android module, both are invisible to every check that can run without a
phone, and neither is a silent wrong answer — the export validator catches the first.

1. **A clip too short for its slot is not held on its last frame.** The cut engine's "freeze"
   strategy produces a cut whose duration the renderer cannot yet fill, so the file comes out
   short and post-export validation rejects it. The user sees the export fail, not a reel that
   drifts. Reachable only when a clip is far too short for its slot even at the template's
   slowest speed, so photo-heavy reels never hit it.
2. **Photos do not drift or zoom.** Ken Burns is in the cut list and in the templates, and is
   not applied by the renderer. Purely visual; nothing goes out of sync.

## Awaiting device verification

Each of these is built and unit-tested; none can be honestly ticked without a phone. Numbered
as in `TEST-ON-YOUR-PHONE.md`.

**Testable now, on the published APK**

1. It opens and reaches the song list.
2. The photo permission prompt is correct.
3. Refusing permission explains itself and offers settings.
4. **A 30-item, 15-clip, 300-second export does not run out of memory.** The single largest
   technical risk in the product.
5. That export finishes inside 90 seconds.
6. The progress number actually moves. (Newly implemented — the module declared progress events
   and never sent one.)
7. Backgrounding mid-export continues rather than dying.
8. Cancelling leaves no half-written file behind.
9. A sideways clip comes out the right way up.
10. Nothing is letterboxed.
11. The reel plays in the system gallery with the picture changing at the same moments as in
    the preview.
12. The cuts land on the beat.
13. Selection and export survive "Don't keep activities".

**Blocked on a Meta app id, not on a device**

14. The Instagram button appears at all. It is deliberately absent without an app id.
15. Share opens Instagram with the video loaded in the Reels composer.
16. Cancelling inside Instagram and coming back keeps the file and both buttons.
17. Uninstalling Instagram makes the button disappear.
18. The cuts still land on the beat once a real track is applied inside Instagram. This is the
    one that proves the whole product works, and it also needs the real catalogue rather than
    the three test tracks.

**Needs an iPhone, and an iOS build that does not exist yet**

19. Limited Photo Library shows only the permitted photos plus a way to select more.
20. An iCloud photo that is not downloaded either downloads or is skipped with the right
    message.

## What was deliberately not built

- Embedding real audio in the export so Instagram's fingerprinting swaps in its licensed copy.
  It is unlicensed synchronisation of a commercial recording, and the largest legal exposure
  in the product. Costs the user one extra tap instead.
- Streaming real track audio in preview. Blocked on an unanswered question about Meta's terms;
  the metronome click ships without needing that answer.
- Everything on the out-of-scope list in `specs/00-overview.md` §5.2.

## Current plan

The device checklist, in order, on the published APK. Then the two renderer gaps above, then
iOS.
