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
**Blocking:** yes for the Instagram button — but **no longer for the product**: since
2026-08-02 the Your-music path makes reels with the music inside and shares them anywhere,
with no Meta anything.
**What I need:** `EXPO_PUBLIC_META_APP_ID`, added as a repository secret named `META_APP_ID`
at <https://github.com/aucksy/ThumpCut/settings/secrets/actions>. It is the numeric App ID from
a Meta app at <https://developers.facebook.com/apps> — no review, no approval, no cost. The
next build picks it up on its own. **One later step for public release:** the Meta app must be
switched to **Live** mode in its dashboard before phones other than the owner's can use the
share — the owner's own account works in development mode. Recorded in GO-LIVE.md.
**What I did meanwhile:** Instagram silently ignores a share carrying no application id, so a
build without one cannot hand anything off. The share button is therefore **absent**, not
disabled — a disabled button is a promise the app cannot keep, and the failure would look like
Instagram's fault rather than a missing setting. Save to gallery works regardless. Both Android
manifest entries the handoff needs — a FileProvider and a `<queries>` entry naming Instagram —
are in place and were missing entirely before.

## Q — Is the Jamendo client id available for the royalty-free section?
**Phase:** 9
**Blocking:** no — the section simply does not exist without it, and everything else works.
**What I need:** A free key from <https://devportal.jamendo.com> (sign up, create an "app",
copy its client id), added as a repository secret named `JAMENDO_CLIENT_ID`, then the
catalogue workflow run once. Exact steps in GO-LIVE.md Part 3.
**What I did meanwhile:** The whole pipeline — licence gate, analysis, publish shape,
no-expiry links, the app section, export with the music inside, the credit line — is built
and tested against stubbed Jamendo answers. One five-minute check remains once a real key
exists: confirm live responses match the documented shape the stubs encode (the research
notes flag the API's licence-filter flags as undocumented, which is why the gate never
trusts them anyway).

## Q — Will Meta object to the app streaming their audio link in a preview?
**Phase:** 5
**Blocking:** no — the owner has decided this ships regardless. Flagged so it is not a surprise.
**What I need:** Nothing to proceed. If a written answer ever becomes available it would only
confirm or deny what is reasoned below.
**Where it stands:** The question that was open — *may we proxy their audio through a backend
of ours* — is now moot, because we do not. There is no backend and nothing of theirs is copied,
stored or re-served. The app is handed a plain HTTPS link and streams it from the same CDN
Instagram serves it from, which is what any browser does when a Reel plays. The app holds no
Instagram token and makes no Meta API call.

The reasoning that this is the intended use of that field: the `ig_audio` endpoint returns, by
Meta's own description, audio authorised for third-party publishing, and `download_url` is
there so a developer can let a user hear a track before attaching it. Playing it in a preview
is the purpose it exists for.

**The exposure, plainly.** Their platform terms are not a licence to a recording, and a link
being publicly fetchable is not permission to build a product around fetching it. The realistic
worst case is that Meta stops returning `download_url`, or the links stop resolving from
outside their apps. That is a switch they own and can throw at any time without telling anyone.
If they do, every preview falls back to the click and says so on screen — the product still
works, it just stops playing music. Nothing else in ThumpCut depends on it. This is the same
reason the exported file stays silent for ever: that one is a real legal exposure and is not
up for revision.

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
