# 00 — Overview

**Read this before any phase spec.** It holds the shared vocabulary, the global rules, and the
edge-case checklists every phase draws from.

---

## 1. The product

ThumpCut turns a mix of photos and video clips into a short reel where every cut lands on the
beat, and where cutting speed follows the music's energy. The user picks a template, picks
media, exports, and shares to Instagram — where Instagram supplies the licensed track from its
own library.

**ThumpCut hosts no audio, licenses no music, and uploads no user media.** It ships beat
timings, which are numeric facts about a recording, not the recording.

### 1.1 What makes it good — three things, all in the MVP

**1. Video clips handled properly.** This is the headline differentiator. Competitors are
photo-slideshow apps where video is an afterthought. ThumpCut trims a clip to its slot,
speed-fits it so its motion works with the beat, freezes or spans when the duration does not
line up, and mixes clips freely with stills.

**2. Cut density that follows the music.** The picture does not change at a fixed rate. It
holds through calm passages and cuts rapidly at a drop, because the beat map carries an energy
curve and the cut engine allocates items by weight. This is what makes an edit read as
"professionally cut" rather than "assembled". Specified in `02-cut-engine.md` §3.

**3. Track and template recommendation by item count.** When the user picks 9 items, the app
immediately surfaces the tracks and templates that will produce good-looking timing for 9
items. It is arithmetic on cached data, so it is instant. Specified in `05-preview.md`.

**Templates are the product; beat-sync is the engine underneath.** Users choose an outcome they
can see, not a mechanic. The gallery is the shop window and must never show a spinner.

---

## 2. How these specs are written

Every feature is specified in seven blocks. This structure exists because two bug types
dominate AI-written code — misreading intent, and skipping edge cases — and these seven
blocks attack both directly.

| Block | What it does |
|---|---|
| 1. Purpose and scope | States the job and what is explicitly **out** of scope |
| 2. States and transitions | Every state a screen or process can be in, and every legal move between them |
| 3. Acceptance criteria | Given / When / Then. One behaviour each. Testable. |
| 4. Edge cases | Scoped rows from the master checklists in §6 |
| 5. Error catalogue | Every failure, its **exact** on-screen text, and the recovery path |
| 6. Invariants | Things that must always be true, assertable in code |
| 7. Tests and Definition of Done | What must exist and pass before the phase is finished |

Plus, per phase: a **regression contract** (what must still work) and a **quickstart** (a
plain-English manual test script for a non-coder to run on a real device).

### 2.1 Writing rules for acceptance criteria

Describe behaviour and observable outcome, never implementation.

- Bad: "When I tap the button with id `#export-btn`."
- Good: "When I tap Export."
- Bad: "Then it should be fast."
- Good: "Then the first frame appears within 2 seconds."

One behaviour per criterion. No criterion depends on another having run first.

### 2.2 Marking gaps

If something is genuinely undecided, write `[NEEDS DECISION: question]` rather than guessing.
Do not implement around an ambiguity silently.

---

## 3. Glossary

| Term | Meaning |
|---|---|
| **Beat** | A pulse in the music. The beat map lists them as timestamps in seconds. |
| **Downbeat** | The first beat of a bar, usually every 4th beat. Stronger. Better to cut on. |
| **Bar** | A group of beats, normally 4. |
| **Beat map** | The precomputed JSON for one track: beats, downbeats, BPM, energy curve, sections. |
| **Energy curve** | A 0–1 value per beat describing how intense the music is at that moment. |
| **Section** | A stretch of the track with a consistent energy level. |
| **Slot** | A span of the output timeline that one media item fills. |
| **Cut list** | The output of the cut engine: which item shows, from when, for how long. |
| **Template** | A recipe for cut density, transitions and motion. Not a video. |
| **Factory** | The offline pipeline that produces beat maps. Runs on your machine, never on a user's phone. |
| **Fingerprint** | A short signature of a recording, used to detect when Instagram swaps a track for a different master. |
| **Spanning** | Letting one long clip fill several consecutive slots, so cuts happen inside one continuous scene. |
| **Speed fitting** | Slowing or speeding a clip so it exactly fills its slot. |
| **CFR** | Constant frame rate. Every frame is the same duration. The opposite, VFR, causes drift. |
| **Edit list** | Metadata in an MP4 that offsets playback start. Must be absent from our output. |

---

## 3.1 Beat map schema

The single contract between the Factory and the app. Every phase depends on it.

```typescript
interface BeatMap {
  schemaVersion: 1;
  trackId: string;              // Meta's audio_id
  title: string;
  artist: string;
  durationSec: number;          // of the analysed audio
  bpm: number;
  beatsSec: number[];
  downbeatsSec: number[];       // subset of beatsSec
  beatsPerBar: number;
  energyCurve: number[];        // 0..1, same length as beatsSec
  sections: Section[];
  bestWindowStartSec: number;

  // Provenance — used to detect when Instagram swaps the recording
  sourceDurationMs: number;     // as reported by Meta
  audioFingerprint: string;
  lastVerifiedAt: string;       // ISO 8601

  engine: string;               // "beat_this"
  engineVersion: string;
  contentHash: string;          // cache invalidation
}

interface Section {
  startSec: number;
  endSec: number;
  level: "low" | "medium" | "high";
}
```

## 3.2 Audio source rule

**For Instagram-catalogue tracks, all audio comes from Meta's Instagram Audio API
`download_url`, and nowhere else.**

The beat grid must be computed from the same recording Instagram will attach to the user's reel.
Any other source is a different master, a different section, or a different tempo — and the sync
breaks with no error to catch.

iTunes previews are rejected: they start at an uncontrollable, unexposed offset, and Apple's
terms forbid synchronising previews with video.

Two other track sources exist since 2026-08-02, each with the same "grid from the exact
recording" principle: royalty-free tracks are analysed from the same Jamendo stream URL the
app plays and embeds (spec 09), and local tracks from the very file on the phone (spec 08).

---

## 4. Global invariants

These hold across every phase. Assert them in code where possible.

| ID | Invariant |
|---|---|
| G1 | Output is 1080×1920, exactly 30fps, constant frame rate |
| G2 | An Instagram-catalogue export contains no audio track at all; a royalty-free or local-track export contains exactly its own music (specs 08–09). Neither validator accepts the other's file |
| G3 | Output has no edit list and the moov atom is first |
| G4 | Total media items is between 3 and 30 inclusive |
| G5 | Video clips never exceed 15 |
| G6 | Combined source video duration never exceeds 300 seconds |
| G7 | No slide is shorter than 0.35 seconds |
| G8 | Every cut boundary is within 50ms of a beat timestamp |
| G9 | No user photo, video or song is ever transmitted off the device |
| G10 | The app never crashes on unusable media; it skips the item and names it |
| G11 | Identical inputs to the cut engine produce identical output |
| G12 | Beat maps for Instagram-catalogue tracks are only ever computed from Meta `download_url` audio; royalty-free from Jamendo's own stream URL (spec 09); local from the file itself, on the device (spec 08) |

---

## 5. MVP scope

### 5.1 In scope — build all of this

| # | Item | Phase |
|---|---|---|
| M1 | Factory pulls trending tracks and audio from Meta's Audio API | 1 |
| M2 | Beat maps with beats, downbeats, energy curve and sections | 1 |
| M3 | Re-verification: detect retired and swapped recordings | 1 |
| M4 | Cut engine with energy-driven variable cut density | 2 |
| M5 | Video trimming, speed fitting, freeze and spanning | 2 |
| M6 | Catalogue download and offline cache | 3 |
| M7 | Mixed photo and video selection, 3–30 items, max 15 videos | 4 |
| M8 | Per-clip trim in-point | 4 |
| M9 | 5 templates | 5 |
| M10 | Track and template recommendation by item count | 5 |
| M11 | Live preview with the real track streaming, click as fallback | 5 |
| M12 | On-device MP4 export, 1080×1920 CFR 30 — silent for Instagram tracks, music inside for the rest (G2) | 6 |
| M13 | Share to Instagram, and save to gallery | 7 |
| M14 | Your music: local files analysed on the device | 8 |
| M15 | Royalty-free section (Jamendo, CC BY / BY-SA only) | 9 |
| M16 | Share to YouTube and the system share sheet, for reels that carry their music | 10 |

### 5.2 Out of scope — do not build

Scheduled automation of the Factory (a cron entry is enough; no orchestration) · embedded
audio for **Instagram fingerprint matching** (a silent reel quietly carrying the commercial
recording — still the largest legal exposure; the royalty-free and local modes are a
different, licensed thing) · accounts · analytics · crash reporting · monetisation · text,
stickers, captions or filters · aspect ratios other than 9:16 · AI-generated music catalogue
· reordering after leaving the selection screen · manual beat-grid nudging · light mode ·
tablet layouts · localisation beyond English · in-app live search of Jamendo · TikTok's
Share Kit SDK · YouTube Data API uploads.

**Anything in 5.2 must not be built.** If a phase seems to need one, note it in
`OPEN-QUESTIONS.md` and continue without it.

> Note on the Factory: **trending discovery is IN scope** — it is where the audio comes from,
> so the product cannot work without it. What is out of scope is wrapping it in scheduling
> infrastructure. A documented cron line is sufficient.

---

## 6. Master edge-case checklists

Every phase spec scopes these. A phase either handles a row, or explicitly marks it out of
scope with a reason. Rows are never silently skipped.

### A. Boundary values

- [ ] Zero (no items, empty list, empty file)
- [ ] One (does list logic still work with a single item?)
- [ ] Many (the typical case)
- [ ] Exactly the maximum (30 items, 15 videos)
- [ ] One over the maximum (31st item, 16th video)
- [ ] Null, missing, or undefined values
- [ ] Malformed or unexpected data type
- [ ] Duplicate inputs
- [ ] Negative or out-of-range numbers

### B. Mobile lifecycle and interruption

- [ ] App backgrounded mid-operation, then foregrounded
- [ ] Android process death while backgrounded, then state restoration
- [ ] iOS suspension or termination while backgrounded
- [ ] Incoming phone call mid-operation
- [ ] Screen locks during a long task
- [ ] Battery saver mode throttling CPU
- [ ] Device rotated mid-flow
- [ ] Split-screen or multi-window
- [ ] OS kills the app during a long render
- [ ] System back gesture mid-flow

**How to test process death:** Developer Options → "Don't keep activities", or
`adb shell am kill <package>`.

### C. Permissions

- [ ] Permission denied outright
- [ ] Permission granted, then revoked in Settings while the app is backgrounded
- [ ] iOS Limited Photo Library — the user granted access to only some photos
- [ ] Android scoped storage and content URIs
- [ ] "Don't ask again" selected
- [ ] Permission changed while the app is suspended — must re-check on resume

### D. Storage and memory

- [ ] Storage fills mid-write
- [ ] Out of memory during video decode
- [ ] Very large source file
- [ ] Corrupt or unreadable media
- [ ] Media deleted by the user between selection and render
- [ ] **Cloud-only media**: iCloud or Google Photos placeholder with no local bytes. The picker
      shows it, the file is not there. Download may stall indefinitely.

### E. Media specifics

- [ ] Unusual aspect ratios — ultra-wide, square, portrait
- [ ] Rotation metadata — clip recorded sideways with a rotation flag
- [ ] HDR video
- [ ] Variable frame rate source
- [ ] HEIC / HEIF images
- [ ] Clip shorter than one slot
- [ ] Zero-length or corrupt file
- [ ] Unsupported codec
- [ ] Live Photos
- [ ] Screen recordings
- [ ] File with no audio track

### F. Network

- [ ] Offline at first launch, before any cache exists
- [ ] Connection lost mid-download
- [ ] Slow connection, request times out
- [ ] Captive portal returns HTML instead of JSON
- [ ] Partial or corrupt download
- [ ] Server returns malformed JSON
- [ ] Cache exists but is stale

### G. Concurrency and timing

- [ ] Double-tap fires the same action twice
- [ ] User navigates away mid-operation
- [ ] Two operations racing
- [ ] Cancel pressed at the exact moment the operation completes

### H. Interop

- [ ] Instagram not installed
- [ ] Instagram installed but too old to accept the share
- [ ] Share intent rejected
- [ ] User cancels inside Instagram and returns

### I. Accessibility and presentation

- [ ] Screen reader labels on every control
- [ ] Large font / dynamic type does not clip
- [ ] Very small screen
- [ ] Very large screen or foldable

---

## 7. Phases

Build in this order. Each phase is independently verifiable.

| Phase | Spec | Why this order |
|---|---|---|
| 1 | `01-factory.md` | Produces the data everything else consumes. No app needed. |
| 2 | `02-cut-engine.md` | Pure logic. Testable without a device. Everything downstream depends on it. |
| 3 | `03-catalogue.md` | Gets the data onto the phone. |
| 4 | `04-media-selection.md` | The most edge-case-heavy screen. |
| 5 | `05-preview.md` | Ties the engine to the UI. |
| 6 | `06-render.md` | The highest technical risk. |
| 7 | `07-instagram-handoff.md` | Last of the original build, because it depends on a finished file. |
| 8 | `08-local-music.md` | The self-sufficiency path: the phone's own songs, analysed on the device. |
| 9 | `09-royalty-free.md` | The licensed-to-embed catalogue section, and the with-audio export. |
| 10 | `10-share-anywhere.md` | YouTube and the system sheet, for reels that carry their music. |

**Do not reorder.** Later phases depend on earlier ones being correct.

---

## 8. Per-phase workflow

1. Start a fresh session. `/clear` if continuing from another phase.
2. Read `CLAUDE.md`, this file, the phase spec, and `DECISIONS.md`.
3. Plan Mode. Produce a plan. **Wait for approval.**
4. Implement.
5. Run `npm run typecheck` and `npm test`. Show the output.
6. Run the reviewer subagent against the phase spec and its regression contract.
7. Hand over the phase's `quickstart.md` for manual testing on a real device.
8. Append decisions to `DECISIONS.md`.
