# Progress

Last updated: 2026-08-02.

## Status

| Phase | Built | Tests pass | Device-verified | Notes |
|---|---|---|---|---|
| 01 Factory | ☑ | ☑ 151 | n/a | Runs with no credentials. Beat detection exact on a 60–190 BPM sweep. |
| 02 Cut engine | ☑ | ☑ 173 | n/a | Includes property tests over the whole input space. |
| 03 Catalogue | ☑ | ☑ | ☐ | Logic fully tested. Real network conditions need a phone. |
| 04 Media selection | ☑ | ☑ | ☐ | Permissions, process death and real photo libraries need a phone. |
| 05 Preview | ☑ | ☑ | ☐ | **Plays the real track.** Link, expiry, hash and fallback all tested; a browser was watched streaming the published link and cutting on its beats. The phone's own player is unproven. |
| 06 Render | ☑ | ☑ | ☐ | Output validation is fully automated. Memory behaviour needs a phone. |
| 07 Instagram handoff | ☑ | ☑ | ☐ | Blocked on a Meta app id. See OPEN-QUESTIONS. |
| Design system | ☑ | ☑ 18 | ☐ | 40 screen states rendered, measured and screenshotted on every push. |
| Cloud build | ☑ | ☑ | ☑ | Green. A 44.8 MB signed APK is published and was opened and checked. |

Totals: **511 automated checks** — 164 Python, 347 TypeScript — plus 4 UI gates over 132
screen-state measurements.

## The preview plays the real track

Changed 2 August. Spec 05 §1 always said "a live preview with the track streaming"; §1.1's
"build the click" was a way to unblock the phase without waiting on a terms answer, and it was
read twice as though it were the design.

How it works, and what each piece is for:

- The Factory publishes `catalogue/audio.json` — one HTTPS link per track, with an expiry and
  the beat map's content hash. Separate from the song list, because the song list is pinned to
  the commit an app was built from and must never move, while an Instagram audio link expires
  in about a day and a half and must.
- The app streams that link. **No proxy, no backend, no Instagram token on the phone, no Meta
  API call.** Nothing of theirs is copied or re-served, and the Factory still deletes every
  byte of audio it downloads.
- **A link whose hash does not match the beat grid is never played.** This is the only silent
  failure in the feature: a swapped recording downloads fine, plays fine, and puts every cut a
  fraction out with nothing erroring.
- The click covers the second or two of buffering and then hands over in place, at the same
  position. If the recording never arrives, the click carries the preview and the screen says
  why. It is a fallback now, never the default.
- The playhead comes from the player, not from a clock, so a stalled stream cannot show cuts
  drifting off beats that are exact.
- A timer refreshes the links every six hours and purges the CDN afterwards. The timed run
  republishes **only** the links — it fetches no audio, touches no beat map and cannot retire a
  track, because re-downloading a few hundred recordings four times a day to answer a question
  that changes very rarely is not a reasonable thing to do to somebody else's servers.
- The preview also shows the picture the cut list says belongs at the current moment. Before
  this the stage was a grey rectangle, which is nothing to watch the music land on.

The three test tracks are ours, so they are served from this repository and never expire — the
preview plays real music today with no Meta token and no account.

## Getting it onto a phone

`TEST-ON-YOUR-PHONE.md` is the owner-facing version of this. In short:

- Every push to `main` builds a **release APK** — not a development build — and republishes it
  at <https://github.com/aucksy/ThumpCut/releases/latest>. No laptop, no Expo account, no
  Android SDK, no Metro.
- It is signed with the Expo template's debug key, which is byte-identical on every prebuild,
  so a new build installs over the old one.
- The song list and beat maps live in `catalogue/` and are served by jsDelivr, pinned to the
  commit the APK was built from.

### What was checked on the published file, not assumed

The first green build was downloaded and opened rather than trusted:

- 44.8 MB, and it carries an APK Signing Block, so Android will install it.
- `assets/index.android.bundle` is inside it — the JavaScript is embedded and it runs with no
  computer on the network.
- `expo.modules.reelrender.ReelRenderModule` and
  `expo.modules.instagramshare.InstagramShareModule` are both compiled in, along with Media3's
  `Transformer` and `InAppMp4Muxer`. The app is not shipping without its renderer.
- The compiled manifest carries the FileProvider and the Instagram `<queries>` entry.
- The embedded config carries the jsDelivr catalogue URL pinned to the built commit, and an
  empty Meta app id — so the Instagram button will correctly be absent.
- `arm64-v8a` and `armeabi-v7a` only. No emulator architectures bloating the download.

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

## The first build did not launch

It closed on opening. `expo-audio` declares a wildcard peer dependency on `expo-asset`, so npm
installed the **SDK 57** build of it into this SDK 55 app, hoisted it above the correct copy,
and Expo's autolinker compiled that one in. `expo-asset` loads the typefaces during the first
render, so it failed at the earliest possible moment.

Nothing caught it. The build was green, the types passed, 306 tests passed, forty screens
rendered and measured cleanly, and `npx expo install --check` was satisfied — it inspects what
`package.json` asks for, not what the tree resolved to underneath it.

Three things changed as a result:

1. The package is pinned to the SDK's own version, and `npm run check:native` asks the
   autolinker *which copy it is about to compile* and fails on anything off-SDK. It runs before
   the APK is built as well as in Verify, so a bad tree cannot produce an installable file.
2. Font loading can no longer stall the app indefinitely. After four seconds it starts in
   whatever face the phone has. A missing typeface is cosmetic; a screen that never appears
   is not.
3. Anything else that throws on startup now stops on a screen that prints what broke, large
   enough to photograph, rather than closing. Reading Android's own crash log needs a laptop
   and a cable, which is the one thing this project does not have.

**Still unproven.** A fix for a crash nobody could reproduce off-device is a hypothesis with
good evidence behind it, not a result. Only the phone settles it.

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
1a. **The preview plays the song.** Newly built. The link, the expiry, the hash check and the
    fallback are all tested, and a browser was watched streaming the published link with the
    picture changing every two beats — but Android's own player has never been near it. If it
    clicks instead of playing, the screen says so and that is the symptom to report.
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
  in the product. Costs the user one extra tap instead. **Not up for revision** — and it is a
  different question from the preview, which does now play the real track.
- Everything on the out-of-scope list in `specs/00-overview.md` §5.2.

## Current plan

The device checklist, in order, on the published APK — starting with whether the preview plays
the song. Then the two renderer gaps above, then iOS.
