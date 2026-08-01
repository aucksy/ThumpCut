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

## Q — May we proxy Meta's audio download_url for in-app preview playback?
**Phase:** 5
**Blocking:** no
**What I need:** A written answer on whether Meta's platform terms permit streaming their
audio through our own backend for preview playback in the app.
**What I did meanwhile:** Built Mode A per spec 05 §1.1 — a metronome click generated on
device from the beat map. No audio is fetched. The `PreviewAudio` interface means Mode B can
be added later without touching the UI.

## Q — Amex employment contract: IP assignment and exclusivity
**Phase:** none — commercial, not technical
**Blocking:** no for building, yes for public release
**What I need:** Confirmation that the owner's employment contract does not assign this
project's IP to his employer.
**What I did meanwhile:** Nothing — this does not affect the build. Flagged so it is not
forgotten before any store submission.

## Q — Where should the catalogue be hosted, and under what URL?
**Phase:** 3
**Blocking:** no for building, yes for the app to show any songs
**What I need:** A Cloudflare R2 bucket (or any static host) and its public URL, set as
`EXPO_PUBLIC_CATALOGUE_URL`. Until then the app has nowhere to fetch songs from and shows the
first-launch offline screen.
**What I did meanwhile:** The Factory writes a complete, valid catalogue to `factory/out/`, so
the whole pipeline can be pointed at a local server or a folder for testing.

## Q — Are there template preview videos, or should the gallery ship with stills?
**Phase:** 5
**Blocking:** no
**What I need:** Either five short looping preview videos (one per style), or a decision to
ship with still frames for now.
**What I did meanwhile:** Built the specified fallback — a card with no cached preview shows a
still, and one with no still shows a plain panel. Never an empty box, never a shimmer. The
gallery works; it just does not move yet.

## Q — Is the Meta app id available for the Instagram handoff?
**Phase:** 7
**Blocking:** no for building, yes for sharing to work at all
**What I need:** `EXPO_PUBLIC_META_APP_ID`. Instagram silently ignores a share with no
application id, which looks to the user like the app did nothing.
**What I did meanwhile:** The share module refuses to fire without one and raises a clear error
rather than opening Instagram to an empty composer. Save to gallery works regardless.
