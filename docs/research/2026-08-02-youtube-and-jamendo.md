# Research: YouTube support, and a royalty-free provider — 2026-08-02

Verified findings behind specs 09 and 10. Everything below was checked against the named
sources on this date; items no document guarantees are marked **needs a device test**.

---

## 1. Handing a reel to YouTube

**The chosen route: the Android share intent, aimed at the YouTube app.**

- **What makes a Short:** a video with a square or vertical aspect ratio, up to 3 minutes,
  is categorised as a Short on upload — the file decides, not the entry point. Every
  ThumpCut reel (1080×1920, ≤ ~40s) qualifies.
  Source: support.google.com/youtube/answer/15424877, .../57407.
- **Silent reels could add music inside YouTube** — its upload editor offers licensed
  music, most songs up to 90 seconds of use. **We still do not offer YouTube for silent
  reels:** the analysed track may not exist there, and a different song means every cut
  misses. Sources: .../15424877, .../12779649.
- **Detection needs a manifest declaration** on Android 11+: `queryIntentActivities` only
  sees packages declared under `<queries>`. Declared: `com.google.android.youtube`, plus
  both TikTok package names (`com.zhiliaoapp.musically`, `com.ss.android.ugc.trill`) for
  the future. Launching needs no declaration; showing/hiding a button does.
  Source: developer.android.com/training/package-visibility.
- **Why not the YouTube Data API:** uploads from API projects that have not passed
  Google's audit are **locked private with no appeal** (policy live since 28 July 2020,
  verified still in force). OAuth with a sensitive scope and a verified consent screen
  would also be required. Quota is no longer the blocker (~100 uploads/day since Dec 2025),
  but the private lock alone disqualifies it for a no-accounts app.
  Sources: developers.google.com/youtube/v3/docs/videos/insert,
  .../revision_history, support.google.com/youtube/answer/7300965.
- **Needs a device test:** the YouTube app accepting ACTION_SEND and opening its upload
  flow is long-standing, widely relied-on behaviour with no citable Google document. It is
  the first thing to check on a phone. `EXTRA_TITLE` is not honoured reliably — not built on.
- **Instagram intent check:** the documented Reels intent is unchanged
  (`com.instagram.share.ADD_TO_REEL`, app id in `com.instagram.platform.extra.APPLICATION_ID`).
  One note for go-live: Meta requires the app to be switched **Live** in its dashboard
  before *other people's* phones can use the share; the developer's own account works in
  development mode. Source: developers.facebook.com/docs/android/sharing-to-reels-instagram/.

## 2. The royalty-free provider

**Chosen: Jamendo** (developer.jamendo.com). Alternatives checked and rejected: Pixabay's
API has no music endpoint at all; Free Music Archive's API is discontinued (404, confirmed
via its owner Tribe of Noise's history).

Verified about Jamendo, 2026-08-02:

- **Auth:** a single free `client_id` covers all read methods, including track search.
  Register at devportal.jamendo.com. (The docs' shared test id is suspended — a real id is
  needed from day one.)
- **Quota:** 35,000 API requests/month on the free tier. The Factory uses ~5 per run;
  streaming hits their CDN, not the API.
- **Track data:** `/v3.0/tracks` returns id, name, artist_name, duration, `audio` (stream
  MP3 URL), `audiodownload` + `audiodownload_allowed`, `license_ccurl`, images. No numeric
  BPM anywhere — the Factory computes its own, which it does anyway.
- **URLs:** plain, unsigned, no auth headers, range requests honoured (verified live —
  years-old URLs still stream). No written permanence guarantee, so the Factory republishes
  them every run and the app never persists them beyond the audio index.
- **Licences:** six CC variants, all starting BY. Filter parameters `ccnc`/`ccnd`/`ccsa`
  exist but their true/false semantics are undocumented — so the Factory's gate parses
  `license_ccurl` itself and accepts only **BY** and **BY-SA**. ND is out because a reel is
  a derivative work; NC is out because users monetise their accounts.
- **Attribution:** CC requires credit + licence link + note of changes; Jamendo's API terms
  additionally require crediting the artist and Jamendo in the app. Hence the licence chip
  in the track chooser and the selectable credit line on the share screen.
- **Terms that constrain the product, permanently:**
  - Free tier is **non-commercial only**, and their definition includes advertising
    revenue. ThumpCut is free with no ads today. **The day it monetises, write to
    licensing@jamendo.com first.**
  - Apps must not be designed to cache content or offer offline access. Hence: stream the
    preview, fetch a transient copy at export, delete it when the run ends — and no
    "download for later" feature, ever.
- **Corporate state:** owned by Winamp Group (renamed October 2025); operating, docs stale
  but the API and CDN verified alive. The app's click fallback and the Factory's
  keep-previous-catalogue behaviour cover an outage.

Sources: developer.jamendo.com/v3.0 (+ /tracks, /authentication, /tracks/file),
devportal.jamendo.com/api_terms_of_use, creativecommons.org/licenses/by/4.0/,
support-artist.jamendo.com; live calls to api.jamendo.com and prod-1.storage.jamendo.com.
