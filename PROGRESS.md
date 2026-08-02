# Progress

Last updated: 2026-08-02, third session (the production audit).

## Status

| Phase | Built | Tests pass | Device-verified | Notes |
|---|---|---|---|---|
| 01 Factory | ☑ | ☑ | n/a | Runs with no credentials. Beat detection exact on a 60–190 BPM sweep. |
| 02 Cut engine | ☑ | ☑ | n/a | Includes property tests over the whole input space. Slide lengths vary with the music's energy — verified by test, and now visible in exports too. |
| 03 Catalogue | ☑ | ☑ | ☐ | **The song list is now built into the app**: first launch opens instantly, and a fresh install works with no internet at all. |
| 04 Media selection | ☑ | ☑ | ☐ | The selection now genuinely survives the phone killing the app — the logic existed but was never plugged in. |
| 05 Preview | ☑ | ☑ | ☐ | Plays the real track. The phone's own player is unproven. |
| 06 Render | ☑ | ☑ | ☐ | **The three missing pieces of polish are in**: photos drift and zoom, short clips hold their last frame instead of failing, and each style's transition (hard cut, dip, zoom punch) is applied. |
| 07 Instagram handoff | ☑ | ☑ | ☐ | Blocked on a Meta app id. See OPEN-QUESTIONS. |
| 08 Your music | ☑ | ☑ | ☐ | One-clock fix (LM8) still awaiting the owner's re-test. Song list now shows clean titles, not filenames. |
| 09 Royalty-free | ☑ | ☑ | ☐ | Jamendo section built end to end against stubs; needs the free key. |
| 10 Share anywhere | ☑ | ☑ | ☐ | YouTube + system sheet for reels that carry music. |
| Design system | ☑ | ☑ | ☐ | 54 screen states rendered, measured and screenshotted on every push. **Template cards now show generated artwork with motion** — the home screen was five empty boxes on a real phone. |
| Cloud build | ☑ | ☑ | ☑ | Build 22 opened and verified. The audit session's build is the next to verify. |

Totals: **590 automated checks** — 179 Python, 411 TypeScript (200 app + 173 cut engine +
20 beat engine + 18 design tokens) — plus 4 UI gates over 162 screen-state measurements at
three viewports, and 54 screenshots.

## What the third session did (owner's brief: full audit, fix everything, production-ready)

**1. Exports stopped being static.** The cut engine had always produced the designed motion
— photos drifting (Ken Burns), short clips freezing on their last frame, per-style
transitions — and the renderer was dropping all three on the floor. Now applied: photos
drift and zoom; a clip far too short for its slot plays what it has and holds its last
frame to the next beat instead of failing the whole export; "Golden hour" dips through
dark between shots; "Heat" lands each cut with a small zoom punch. A true crossfade overlap
is deliberately not used: it would need two video decoders at once, which is exactly what
the 2GB memory rules forbid — the dip cuts on the same beat frame and is memory-free.

**2. The home screen stopped being empty boxes.** The shipped catalogue has no card
artwork, so on a real phone every style card was a blank rectangle (the pretty screenshots
came from test-harness sample art — that sample art is now removed so screenshots match the
phone). Cards now draw their own poster: the style's cutting rhythm as coloured bars, with
an amber playhead sweeping at the pace the style cuts. Fast styles look busy, calm styles
look calm, and each of the five is visibly its own.

**3. First launch became instant, and offline-proof.** The song list and its beat timings
are compiled into the app itself and pre-load the cache on first run. No more "Getting
things ready" download on first open, and a fresh install with airplane mode on gets the
entire product — which matters because the Your-music path never needed the internet in
the first place.

**4. The app now remembers your picks when the phone kills it.** The
selection-survives-process-death logic was built and tested in session one — and never
called from the app. Wired in: restored on launch, saved on every change.

**5. Small lies removed.** Settings showed build "(1)" for ever (it read the iPhone build
number on Android — now it reads the Android one). The Privacy policy row opened a web
address nobody owns — it now opens a real page served from this repository, which states
the truth: the app collects nothing. That page is also exactly what the Play Store listing
will ask for. The Your-music list showed raw filenames ("01-Night_Drive_Demo.mp3") — now
clean titles.

**6. A Play Store release checklist exists.** GO-LIVE.md Part 4: the developer account,
the real signing key (the current one is a throwaway with a published password — the swap
is scripted for a future session, the owner only pastes two secrets), the privacy URL, the
data-safety form answers, the Meta Live switch, the two standing Jamendo rules, and the
employment-contract check. Version numbering is already automatic.

## What can be trusted without a phone

Everything in the earlier sessions' lists, plus:

- The hold arithmetic for frozen clip tails is exact in the tested layer, including the
  zero-remaining and speed-fit cases.
- A fresh offline install serves the full catalogue and all beat maps with zero network
  calls; a real cache is never overridden by the bundled copy; a malformed bundle is
  ignored entirely.
- The bundled copy is byte-identical to the pinned download by construction — same commit.
- All 54 screen states render clean at 393×852, 360×640 and font scale 1.6 — now including
  the generated template posters.

## What cannot be verified without a phone

- The renderer's new motion (Ken Burns, freeze, dip, zoom punch) compiles only in the cloud
  build and shows only in a real export — items 28–30 on the phone checklist.
- The GL effects' time base self-calibrates rather than assuming Media3's timestamp
  convention; if a zoom ever appears frozen at its start scale, that assumption is the
  first suspect.
- Memory behaviour of the new freeze-frame extraction (one bounded bitmap at a time,
  before the encoder starts) is reasoned, not measured.

## Performance notes for a 2GB phone (reasoned; measure on device where marked)

- Gallery: no spinner, ever — first run now serves from the bundled seed instantly.
- Poster animation: one native-driver transform per visible card; no layout thrash.
- Analysis: the spectral pass streams frame by frame (a materialised spectrogram would be
  ~40MB); decoded samples go to a scratch file, never a held buffer; scratch deleted.
- Export: nothing decodes in parallel; stills decode downsampled; freeze frames are
  extracted before the encoder starts and capped at 1920px (~14MB transient, recycled).
  Measure: peak memory during a 30-item, 15-clip export (checklist item 4).
- Bundled catalogue: under 10KB today; ~1MB if the catalogue ever reaches 300 tracks.

## Awaiting device verification

Items 1–13 from the first session stand (13 — selection surviving process death — should
now actually pass; it could not have before this session). Items 21–25 (Your music,
YouTube, share anywhere) stand. New, testable on the next build:

26. Style cards show moving artwork — bars with a sweeping amber line, different per style.
27. A fresh install in airplane mode opens to the full gallery and the whole Your-music
    path works end to end.
28. Photos in an exported reel drift and zoom gently.
29. Each style's transition shows: dip through dark on Golden hour, zoom punch on Heat.
30. A clip far too short for its slot: the reel exports, and that shot holds its last
    frame instead of the export failing.
31. Settings shows the real build number, and Privacy policy opens a readable page.

Blocked on secrets, not devices: 14–18 (Instagram button, needs `META_APP_ID`), the
royalty-free section on a phone (needs `JAMENDO_CLIENT_ID`), real trending songs (needs
`META_ACCESS_TOKEN`). Blocked on hardware: 19–20 (iPhone; no iOS build exists).

## What was deliberately not built

- Embedding audio in an **Instagram-catalogue** export — unlicensed synchronisation, the
  largest legal exposure in the product, **not up for revision**.
- A true crossfade overlap in the renderer — two parallel decoders would break the 2GB
  memory rules; the dip is the memory-safe rendering of the same intent.
- Live in-app Jamendo search, TikTok's Share Kit SDK, YouTube Data API uploads, and
  everything on the out-of-scope list in specs/00-overview.md §5.2.

## Current plan

The device checklist on the new build — 26–31 first (they prove this session's work), then
21–25 (the Your-music path), then the long-standing 1–13. Then keys as the owner adds
them, then iOS.
