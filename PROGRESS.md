# Progress

Last updated: 2026-08-02, second session.

## Status

| Phase | Built | Tests pass | Device-verified | Notes |
|---|---|---|---|---|
| 01 Factory | ☑ | ☑ | n/a | Runs with no credentials. Beat detection exact on a 60–190 BPM sweep. |
| 02 Cut engine | ☑ | ☑ | n/a | Includes property tests over the whole input space. |
| 03 Catalogue | ☑ | ☑ | ☐ | Logic fully tested. Real network conditions need a phone. |
| 04 Media selection | ☑ | ☑ | ☐ | Permissions, process death and real photo libraries need a phone. |
| 05 Preview | ☑ | ☑ | ☐ | Plays the real track. The phone's own player is unproven. |
| 06 Render | ☑ | ☑ | ☐ | Now two modes: silent, and music-inside. Both validated; memory needs a phone. |
| 07 Instagram handoff | ☑ | ☑ | ☐ | Blocked on a Meta app id. See OPEN-QUESTIONS. |
| 08 Your music | ☑ | ☑ | ☐ | **New.** Local files analysed on the device. Whole path is phone-ready, unproven on one. |
| 09 Royalty-free | ☑ | ☑ | ☐ | **New.** Jamendo section built end to end against stubs; needs the free key. |
| 10 Share anywhere | ☑ | ☑ | ☐ | **New.** YouTube + system sheet for reels that carry music. |
| Design system | ☑ | ☑ | ☐ | 54 screen states rendered, measured and screenshotted on every push. |
| Cloud build | ☑ | ☑ | ☑ | Green through build 20. This session's build must be read, not assumed. |

Totals: **579 automated checks** — 179 Python, 400 TypeScript (189 app + 173 cut engine +
20 beat engine + 18 design tokens) — plus 4 UI gates over 162 screen-state measurements at
three viewports, and 54 screenshots.

## What the second session built (owner's brief: make it self-sufficient)

The owner's instruction, condensed: *get the app ready so only keys remain; add YouTube;
add local music with on-device beat detection; add a royalty-free provider with an API —
"I want to be able to use royalty free music available in my phone, create reels with it
and share anywhere I want."*

**1. Your music (spec 08).** A track chooser now exists at all (chips on the style screen);
its first chip scans the phone's songs. Picking one decodes it natively and runs the beat
detector **on the device**: `@thumpcut/beat-engine`, a TypeScript port of the Factory's
algorithm, held to the Python engine's published answers by a parity test over the committed
fixture WAVs — every beat within 12ms, same downbeats, same sections, on all three. Analyses
cache per file identity; a song is read once ever. No byte of it leaves the phone.

**2. Exports that carry their music (spec 09 §2).** The renderer takes the song as a second
Media3 sequence clipped to the reel's exact window; the export validator gained a with-audio
mode. **The silent Instagram-catalogue export is untouched and its validator still rejects
any audio at all** — the two modes reject each other's files, and both directions are
tested. A royalty-free track is fetched just before rendering (exact copy: "Fetching the
track"), fails honestly if it cannot be (never a quietly mute reel), and the fetched copy
never outlives the export run.

**3. The royalty-free section (spec 09).** Provider: Jamendo — chosen after live-verified
research (docs/research/); Pixabay has no music API and FMA's is dead. The Factory gained a
second discovery source behind one free secret (`JAMENDO_CLIENT_ID`): five genre buckets,
month's-most-popular, then a licence gate **in code, against each track's own licence URL**
— only CC BY and CC BY-SA, because a reel is a derivative work posted to monetised
accounts. Catalogue rows carry `source` and `licence` (additive; old installed apps ignore
them); their audio links publish with no expiry; one source failing keeps the whole
previous catalogue so an outage can never read as retirement.

**4. Share anywhere (spec 10).** For reels that carry their music: a YouTube button (a
vertical video under 3 minutes becomes a Short by YouTube's own documented rule) and the
system share sheet, plus a selectable credit line when a licence asks for one. Silent
Instagram-track reels keep their Instagram-only screen — YouTube would invite a different
song and every cut would miss. The YouTube Data API is on the record as rejected: uploads
from unaudited API projects are locked private with no appeal. Android 11 package
visibility for YouTube and TikTok is declared in the manifest via the config plugin.

**5. The owner's handbook.** GO-LIVE.md is now the single page for all three keys —
`META_APP_ID`, `META_ACCESS_TOKEN`, `JAMENDO_CLIENT_ID` — what each unlocks, exact steps,
and Part 0: what already works with none of them, which is the entire Your-music path.

## What can be trusted without a phone

Everything in the first session's list, plus:

- The on-device beat engine finds the exact tempo across a 60–190 BPM synthesised sweep
  (every beat within 25ms of ground truth) and agrees with the Python engine's committed
  answers on the fixture WAVs to within 12ms per beat.
- A with-music export passes validation exactly when it carries one audio track the length
  of the picture; a silent export still fails on any audio at all — both proven on
  hand-built MP4 boxes.
- The licence gate never passes NC or ND in any position, proven in the URL parser and
  again through the track parser.
- A Jamendo outage leaves the previous catalogue byte-for-byte identical.
- The fetched royalty-free track is deleted on success, failure and cancel, and survives
  exactly the one out-of-memory retry.
- All 54 screen states render clean at 393×852, 360×640 and font scale 1.6 — including the
  five Your-music states, the three share-anywhere states and the track chooser.

## The first build did not launch (history, resolved)

An SDK-57 copy of a package was hoisted into this SDK-55 app and compiled in; the app died
at first render with every check green. Three permanent consequences: `check:native` asks
the autolinker what it will compile and fails on anything off-SDK (runs before every APK);
font loading can no longer stall startup past four seconds; and any startup throw lands on
a readable fault screen instead of closing. The fix shipped in build 20 and remains
device-unproven.

## Known gaps in the renderer

Unchanged from the first session, both invisible off-device, neither a silent wrong answer:

1. **A clip too short for its slot is not held on its last frame** — the export fails
   validation rather than drifting; reachable only for clips far too short even at the
   template's slowest speed.
2. **Photos do not drift or zoom.** Ken Burns is in the cut lists and not in the renderer.
   Purely visual.

## Awaiting device verification

Items 1–13 from the first session stand (numbered as in TEST-ON-YOUR-PHONE.md): launch,
permissions, the 30-item export, timing, progress, backgrounding, cancel hygiene, rotation,
gallery playback, beat accuracy, process death. New, testable today on the published APK:

21. Your music scans, analyses with a moving percentage, and selects.
1.  Re-picking an analysed song is instant.
1.  The preview plays the local song; the export contains it, from the same start point.
1.  Share to YouTube lands in the upload flow as a Short. **The one step no document
    guarantees — the most valuable single test on the list.**
1.  Share anywhere delivers a video that plays with its music.

Blocked on secrets, not devices: 14–18 (Instagram button, needs `META_APP_ID`), the
royalty-free section on a phone (needs `JAMENDO_CLIENT_ID`), real trending songs (needs
`META_ACCESS_TOKEN`). Blocked on hardware: 19–20 (iPhone; no iOS build exists).

## What was deliberately not built

- Embedding audio in an **Instagram-catalogue** export so Instagram's fingerprinting swaps
  in its licensed copy — unlicensed synchronisation, the largest legal exposure in the
  product, **not up for revision**. (Royalty-free and Your-music exports carrying their
  licensed/owned audio are a different, deliberate feature — see the three-questions
  section of CLAUDE.md.)
- Live in-app Jamendo search, TikTok's Share Kit SDK, YouTube Data API uploads, and
  everything on the out-of-scope list in specs/00-overview.md §5.2.

## Current plan

The device checklist on the new build, in order — starting with 21–25 (the Your-music
path), because it proves the app is self-sufficient. Then the two renderer gaps, then iOS.
