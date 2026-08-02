# Open questions

Add anything you genuinely cannot resolve from the specs. Then **continue working on
something else** — do not idle waiting for an answer.

Format:

```
## Q — <one line>
**Phase:** <n>
**Blocking:** yes / no — what it blocks
**What I need:** <the specific answer>
**What I did meanwhile:** <how you proceeded, or what you skipped>
```

---

## Q — Is the Meta app id available for the Instagram handoff?
**Phase:** 7
**Blocking:** **yes — this is now the only thing standing between the app and its whole point.**
Everything else can be tested on the published APK today.
**What I need:** `EXPO_PUBLIC_META_APP_ID`, added as a repository secret named `META_APP_ID`
at <https://github.com/aucksy/ThumpCut/settings/secrets/actions>. It is the numeric App ID from
a Meta app at <https://developers.facebook.com/apps> — no review, no approval, no cost. The
next build picks it up on its own.
**What I did meanwhile:** Instagram silently ignores a share carrying no application id, so a
build without one cannot hand anything off. The share button is therefore **absent**, not
disabled — a disabled button is a promise the app cannot keep, and the failure would look like
Instagram's fault rather than a missing setting. Save to gallery works regardless. Both Android
manifest entries the handoff needs — a FileProvider and a `<queries>` entry naming Instagram —
are in place and were missing entirely before.

## Q — May we proxy Meta's audio download_url for in-app preview playback?
**Phase:** 5
**Blocking:** no
**What I need:** A written answer on whether Meta's platform terms permit streaming their
audio through our own backend for preview playback in the app.
**What I did meanwhile:** Built Mode A per spec 05 §1.1 — a metronome click generated on
device from the beat map. No audio is fetched. The `PreviewAudio` interface means Mode B can
be added later without touching the UI.

## Q — Do we run the Factory against real Instagram audio, or ship the test tracks?
**Phase:** 1 and 3
**Blocking:** no for building, yes for the last item on the device checklist
**What I need:** A `META_ACCESS_TOKEN` repository secret. With one, the same catalogue workflow
publishes the real song list instead of the fixtures, with no other change.
**What I did meanwhile:** The published catalogue is three synthesised test tracks at 96, 124
and 150 BPM, credited to "ThumpCut Test Kit" so nobody mistakes them for real music. Every
timing test is genuine against them. The one thing they cannot prove is that the cuts still
land on the beat once Instagram applies its own copy of a real recording.

## Q — Are there template preview videos, or should the gallery ship with stills?
**Phase:** 5
**Blocking:** no
**What I need:** Either five short looping preview videos (one per style), or a decision to
ship with still frames for now.
**What I did meanwhile:** Built the specified fallback — a card with no cached preview shows a
still, and one with no still shows a plain panel. Never an empty box, never a shimmer. The
gallery works; it just does not move yet.

## Q — Amex employment contract: IP assignment and exclusivity
**Phase:** none — commercial, not technical
**Blocking:** no for building, yes for public release
**What I need:** Confirmation that the owner's employment contract does not assign this
project's IP to his employer.
**What I did meanwhile:** Nothing — this does not affect the build. Flagged so it is not
forgotten before any store submission.

---

## Answered

**Where should the catalogue be hosted, and under what URL?** — Answered 2026-08-02 without
needing a decision. It lives in `catalogue/` in this repository and is served by jsDelivr,
pinned to the commit each APK was built from. Free, needs no bucket and no account. GitHub
Pages would be tidier but cannot be switched on by a workflow, and GitHub's own raw file host
serves JSON as `text/plain`, which the catalogue loader rejects on purpose because a captive
portal also answers with a 200. Replaceable with a real static host by changing one line.
