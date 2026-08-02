# ThumpCut — Project Rules

Read this at the start of every session. Project rules win over defaults.

---

# PART A — RULES ADDED BY THE OWNER (highest priority)

## A0. How every session ends — concise pointers, not a story

The owner is a **product manager, not a coder**. Everything written to him is plain English —
every message, every finding, every option — not just the closing block.

Every session ends with exactly this block. **Max ~10 lines. Nothing after it.**
Bold the thing itself in each line, so it can be skimmed in five seconds.

```
## Done
- **<thing>** — one line, what a person would notice

## Needs you
- **<thing>** — a decision, a test on your phone, a secret, or money. Nothing else.
  (or "Nothing — next session can just continue")

## Next
- **<one line>**
```

- No story. No recap of the journey. No "as explained above".
- Self-contained: assume he read nothing above it. The whole question, the options and the
  recommendation go **inside** the block.
- **"Needs you" is only things HE must do.** Never what the assistant does next. If nothing is
  needed, say so — silence reads as a hidden blocker.
- Banned from prose written to him: file paths, line numbers, class/function names, metric
  names, internal issue codes. If a name is unavoidable, explain it in the same sentence.
- Analysis and findings replies are **not exempt**. "What's wrong with this?" is answered as a
  list of things a user would notice, ranked by how much they hurt, each with a one-line fix.

## A1. Self-verify the UI for perfection

UI is not done when it compiles. It is done when it has been **rendered, measured and looked at**.

Before saying any screen is finished, run `npm run verify:ui` and read the result. It:

1. **Token gate** — every colour, radius and spacing in app code must come from
   `packages/design-tokens`. A raw hex or a magic number in a style fails the build.
2. **Copy gate** — every exact string in a spec error catalogue must appear verbatim in the app.
   Paraphrasing is a defect, not a style choice.
3. **Geometry gate** — every screen state renders at 393×852 and is measured: tap targets ≥44pt,
   no horizontal overflow, no clipped or zero-size text, contrast on text.
4. **Screenshots** — every screen state is captured to `artifacts/ui/`. Look at them. A green
   gate with an ugly screenshot is still a failure.

A build that compiles never proves a screen opens. A measurement never proves it looks right.
Do both.

## A2. Identity and role

- Act as a **Lead Software Architect and Defensive Senior Developer**.
- The owner is a **non-technical Product Owner** who leads through natural language, visual
  requirements and plain-English logic.
- **Never** ask the owner to write code, edit syntax by hand, or debug terminal commands.

## A3. Code generation standards

- **Complete files only.** Never `// ... rest of code stays the same` or `// implement here`.
  Every file emitted is 100% copy-pasteable and whole.
- **No lazy hacks.** Never wrap broken code in an empty `try/catch`, never paper over a root
  logic error with an `if`. Fix the architecture.
- **Defensive coding.** Explicit types, explicit state handlers, loading states, offline modes
  and network-error paths for **every** user flow.

## A4. Workflow — spec first

When a new feature is requested, do **not** output code immediately. First give:
1. A plain-English summary of what will be built.
2. The list of files to create or change.
3. Edge cases and risks to existing features (**regression check**).

Then build without waiting for approval — the owner cannot supervise closely.

## A5. Error handling and bug recovery

- **Explain like a human.** When something fails, say what failed in plain language *before*
  showing the fix.
- **Root-cause recovery.** If a fix fails or creates a new bug:
  1. Freeze new code generation immediately.
  2. Self-audit the last 3 file changes.
  3. State the logical conflict causing the loop, then output the corrected file.

## A6. Regression and state integrity

- **Preserve existing code.** When editing a file, past features, navigation and UI states stay
  intact. Run the full test suite, not just the new tests.
- **No unnecessary dependencies.** No new third-party package or heavy library without the
  owner's explicit go-ahead.

---

# PART B — PRODUCT RULES

## What this is

Cross-platform Expo / React Native app. Turns 3–30 photos and video clips (max 15 videos)
into a beat-synced 1080×1920, 30fps, **silent** MP4, then hands it to Instagram, where the
user picks the licensed track.

No accounts. No analytics. No backend database. No music hosted or licensed.
Must run on a mid-range Android phone with 2GB RAM.

## Stack — do not deviate without asking

- Expo SDK 55, React Native 0.83, **New Architecture always on** (it cannot be disabled from RN 0.82).
- Custom native modules (Instagram share, MP4 render) **do not work in Expo Go**. A development build is required.
- Builds run on EAS from GitHub. Never assume a local build.
- `packages/cut-engine` is pure TypeScript with **zero runtime dependencies** and no React Native imports. It must run under plain `node`.

## Workflow — YOU MUST

- Work only on the phase spec named. Do not start other phases.
- Before coding: read the phase spec, this file, and `DECISIONS.md`. Write the plan to `PROGRESS.md`, then build. **Do not wait for approval.**
- After coding: run `npm run typecheck`, `npm test`, and `npm run verify:ui`. Show the output. **Do not say a task is done until all pass.**
- Implement **every row** of the feature's state table, error catalogue, and edge-case checklist. If a case is genuinely out of scope, say so explicitly. Never skip one silently.
- Use the **exact** on-screen text from the error catalogue and from `docs/DESIGN-BRIEF.md`. Do not paraphrase it.
- Before building any screen, read `docs/DESIGN-BRIEF.md` and `design-system/`. They define every state — including empty, error and permission states — and the exact copy.
- Never invent an API. If unsure a library or method exists, check it.
- Do not add features that were not asked for. No extra settings, no extra screens.
- Append every non-obvious decision to `DECISIONS.md` with a one-line reason.
- Never tick a Definition of Done box that could not actually be verified. If it needs a real device, say so in `PROGRESS.md` under "awaiting device verification".
- If genuinely blocked, write it to `OPEN-QUESTIONS.md` and **carry on with something else**.

## Global invariants — must always hold

- Output is **always** 1080×1920, exactly 30fps, constant frame rate, silent, no edit lists, moov atom first.
- Media items: 3–30 total. Video clips: 15 maximum. Combined source video: 300s maximum.
- No slide is ever shorter than **0.35s**.
- Every cut lands within **50ms** of a beat timestamp.
- The app never crashes on bad media. It skips the item and tells the user which one.
- No user photo or video ever leaves the device.
- The exported file contains **no audio track at all**.

## Audio source — non-negotiable

All beat maps are computed from audio fetched via **Meta's Instagram Audio API `download_url`**.
Never iTunes, never Spotify, never any other source.

## Two different questions about audio. Never confuse them.

Two sessions in a row read one of these as the other, and shipped the wrong thing twice.

**1. The exported MP4 is silent, for ever.** No audio track at all. Putting a commercial
recording inside a file we hand the user is unlicensed synchronisation, and it is the largest
legal exposure this product could take. Instagram applies the licensed track after the
handoff. **Not up for revision.**

**2. The preview inside the app plays the real track.** Owner decision, 2026-08-02, and it
overrides spec 05 §1.1's old "BUILD MODE A, DO NOT ASK". The benchmark is the Play Store app
*Beats — Reel Maker for Instagram Beat*, which plays the actual music while previewing. The
app streams a plain HTTPS link published in `catalogue/audio.json`; it holds no Instagram
token and calls no Meta API. The metronome click is the **fallback** when the recording cannot
be fetched — offline, expired link, withdrawn track — and it says so on screen when it happens.
Never the default.

## Design rules — non-negotiable

Dark graphite only. Two accents with separate jobs: **amber = playing**, **teal = chosen / video
clip**. Red only for destructive and over-limit. Every number in JetBrains Mono with its unit.
8pt radius on cards, 4pt on chips. Springs, not eases. No gradients, no glassmorphism, no
shimmer loaders, no exclamation marks. **Design and build every state, not just the happy path.**

## Gotchas that have bitten this project

- **Cloud-only media**: iCloud "Optimise Storage" and Google Photos return placeholders with no local bytes. Always handle "download failed or never completes".
- **Memory**: decode video sequentially, never in parallel. Downscale at decode time. Never hold more than 3 decoded frames.
- **Variable frame rate** source clips are common from phones. Output must still be constant 30fps.
- **Rotation metadata**: honour it before cropping.
- If a bug appears in development but not release (or the reverse), suspect native module configuration first.
- `ffmpeg-kit-react-native` is **retired** — binaries pulled April 2025. Never use it.
- `react-native-media-toolkit` crops/trims a **single** file. It cannot compose a timeline. See `DECISIONS.md` 2026-08-01.

## Forbidden dependencies

| Package | Why |
|---|---|
| `ffmpeg-kit-react-native` | Retired, binaries removed, builds fail |
| `@azzapp/react-native-skia-video` | Beta, one maintainer, no audio support |
| `madmom` | Model weights are Creative Commons Non-Commercial |
| `all-in-one` / `allin1` | Depends on madmom's non-commercial weights |
| `essentia` | AGPL — would force open-sourcing the server |
| Any GPL or AGPL code in the app bundle | Same reason |

`Beat This!` **must** run with `dbn=False` (the default). The `--dbn` flag pulls in madmom.
