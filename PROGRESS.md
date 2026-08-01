# Progress

Last updated: 2026-08-01.

## Status

| Phase | Built | Tests pass | Device-verified | Notes |
|---|---|---|---|---|
| 01 Factory | ☑ | ☑ 151 | n/a | Runs with no credentials. Beat detection exact on a 60–190 BPM sweep. |
| 02 Cut engine | ☑ | ☑ 173 | n/a | Includes property tests over the whole input space. |
| 03 Catalogue | ☑ | ☑ | ☐ | Logic fully tested. Real network conditions need a phone. |
| 04 Media selection | ☑ | ☑ | ☐ | Permissions, process death and real photo libraries need a phone. |
| 05 Preview | ☑ | ☑ | ☐ | Cut list, ruler and click all tested. Playback needs a phone. |
| 06 Render | ☑ | ☑ | ☐ | Output validation is fully automated. Memory behaviour needs a phone. |
| 07 Instagram handoff | ☑ | ☑ | ☐ | Needs Instagram installed on a real device. |
| Design system | ☑ | ☑ 18 | ☐ | 40 screen states rendered, measured and screenshotted on every push. |

Totals: **474 automated checks** — 151 Python, 323 TypeScript — plus 4 UI gates over 120
screen-state measurements.

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

## Awaiting device verification

Each of these is built and unit-tested; none can be honestly ticked without a phone.

**Needs a mid-range Android phone**

1. **Export does not run out of memory** with 30 items including 15 clips totalling 300s. This
   is the single largest technical risk in the product.
2. **Export finishes inside 90 seconds** for a 40-cut reel.
3. **Backgrounding mid-render** continues rather than dying.
4. **Process death mid-render** leaves no half-written file behind.
5. **A sideways clip comes out the right way up**, and a landscape clip fills the frame rather
   than showing bars.
6. **A variable-frame-rate clip** (most phone video) comes out at constant 30fps.
7. **The reel plays back in the system gallery** with the picture changing at the same moments
   it did in the preview.
8. **Selection survives process death** — Developer Options → "Don't keep activities".

**Needs an iPhone**

9. **Limited Photo Library** shows only the permitted photos plus a way to select more.
10. **An iCloud photo that is not downloaded** either downloads or is skipped with the right
    message.
11. **The Instagram button appears at all** — it depends on `LSApplicationQueriesSchemes`,
    which cannot be checked without a real build.

**Needs Instagram installed**

12. **Share opens Instagram with the video loaded** in the Reels composer.
13. **Cancelling inside Instagram and coming back** keeps the file and both buttons.
14. **Uninstalling Instagram** makes the button disappear rather than grey out.
15. **The cuts land on the beat** once a track is applied inside Instagram. This is the one
    that proves the whole product works, and nothing before it can substitute for it.

**Needs a decision, not a device**

16. **Template preview videos.** The gallery is designed around looping previews. There are
    none yet, so cards show a still or a plain panel — which is the specified fallback, not a
    bug, but the gallery will not feel finished until real previews exist.

## What was deliberately not built

- Embedding real audio in the export so Instagram's fingerprinting swaps in its licensed copy.
  It is unlicensed synchronisation of a commercial recording, and the largest legal exposure
  in the product. Costs the user one extra tap instead.
- Streaming real track audio in preview. Blocked on an unanswered question about Meta's terms;
  the metronome click ships without needing that answer.
- Everything on the out-of-scope list in `specs/00-overview.md` §5.2.

## Current plan

The build is complete against the specs. The next move is a development build on EAS and the
device checklist above, in that order.
