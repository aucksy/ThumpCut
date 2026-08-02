# 09 — The royalty-free section, and exports that carry their music

Added 2026-08-02 at the owner's direction: *"if you can find a royalty-free music provider
that offers an API, we can show all of it in a royalty-free music section in the app — so
the final export can actually have the music built into it, which Instagram, YouTube and
TikTok will not ban."*

---

## 1. Purpose and scope

A section of the catalogue whose tracks the app may put **inside the exported file**,
because their licences say so. Provider: **Jamendo** (developer.jamendo.com) — half a
million Creative Commons tracks, a read API needing one free `client_id`, plain MP3 URLs a
phone can stream. Verified 2026-08-02; the research notes live in `docs/research/`.

**The licence gate is the feature.** Only **CC BY** and **CC BY-SA** tracks are accepted:

- a reel is a *derivative work*, so any ND (no-derivatives) licence is out;
- users post to monetised accounts, so any NC (non-commercial) licence is out;
- the filter runs in Factory code against each track's own `license_ccurl`. The API's
  `ccnc`/`ccnd` flags are sent as hints but never trusted — their exact semantics are
  undocumented.

**Attribution is owed** — to the artist (the CC licence) and to Jamendo (their API terms).
The licence name and deed URL ride the catalogue into the app; the share screen shows a
ready-to-copy credit line (spec 10 §1).

**Standing constraints, owner-visible:** Jamendo's free tier is for apps with **no revenue
— no ads, no purchases**. The day ThumpCut monetises, licensing@jamendo.com first. And the
app must never build an offline music library from Jamendo: stream for preview, fetch a
transient copy at export, delete it after. Both constraints are recorded in GO-LIVE.md.

**Out of scope:** live in-app search of Jamendo (the curated section is Factory-built);
user Jamendo accounts; downloads for listening.

## 2. How it works

**Factory.** With `JAMENDO_CLIENT_ID` set, discovery queries five genre buckets for the
month's most popular tracks (45s–7min), filters through the licence gate, and the survivors
join the normal pipeline: fetched, analysed, fingerprinted, published — and deleted (P1).
Each catalogue row carries `source: "royaltyfree"` and `licence: {name, url}`. The audio
index publishes their stream URLs with **no expiry** — Jamendo links are stable — so the
preview and the export use the same link the same way as any other track. One source
failing keeps the whole previous catalogue: a partial answer must never read as retirement.

**App.** The section appears in the track chooser under its own label, each chip carrying
its licence name. Preview streams exactly as Instagram tracks do (same hash check, same
click fallback). Export fetches the track to a temporary file, hands it to the renderer as
a second sequence clipped to the reel's window, and deletes the copy when the run ends.

### 2.1 The export gate, with music inside

`validateExport` gains a with-audio mode, used **only** for royalty-free and local tracks:

- exactly **one** audio track, running within 0.25s of the picture's length;
- no edit list on either track;
- every silent-mode rule (size, exactly 30fps CFR, moov first, duration) unchanged.

The silent mode itself is untouched: an Instagram-catalogue export with any audio track at
all still fails validation and is never saved. **Neither mode tolerates the other's file.**

## 3. Acceptance criteria

- Given no `JAMENDO_CLIENT_ID`, when the Factory runs, then the catalogue is exactly what
  it was before this spec existed, and the app shows no royalty-free section.
- Given the secret is set, when the Factory runs, then every published royalty-free track's
  licence URL matches CC BY or CC BY-SA — no NC, no ND, ever.
- Given Jamendo is down, when the Factory runs, then the previous catalogue stays live and
  nothing is retired.
- Given a royalty-free track is selected, when the reel is exported, then the finished file
  plays the music in the system gallery, and the sound starts at the same moment in the
  track the preview played from.
- Given the track cannot be fetched at export time, when the export runs, then it fails
  before rendering with the exact RF2 text — never a silent reel.
- Given the export finishes or fails, when the run ends, then the fetched copy of the track
  is gone from the device.

## 4. Edge cases

- **Licences** — a track whose `license_ccurl` is empty, malformed, or any NC/ND variant
  never enters the catalogue. Licence version (3.0/4.0) and locale suffixes are accepted.
- **Network** — offline at export: RF2, immediately, before rendering. Link goes dead
  between preview and export: fetch fails → RF2. Preview offline: the click carries it,
  exactly as for Instagram tracks.
- **The recording changing** — Jamendo re-encoding a track changes its fingerprint; the
  Factory re-analyses on mismatch exactly as it does for Instagram tracks, and the app's
  hash check refuses a link issued for a different grid.
- **Out of memory during a with-audio export** — the fetched track is kept across the one
  retry, then everything is cleaned up.

## 5. Error catalogue

| ID | When | Exact text | Recovery |
|---|---|---|---|
| RF1 | Fetching the track before rendering | "Fetching the track" | Wait |
| RF2 | The track could not be fetched | "We couldn't fetch the track. Check your connection and try again." | Retry |

## 6. Invariants

| ID | Invariant |
|---|---|
| RF-I1 | Only CC BY and CC BY-SA tracks are ever published in the section, enforced against the licence URL itself. |
| RF-I2 | An Instagram-catalogue export never carries audio; a royalty-free export always carries exactly its own track. Neither mode's validator accepts the other's file. |
| RF-I3 | A fetched track never outlives the export run that fetched it. |
| RF-I4 | Licence name and URL travel with the track into the catalogue and to the share screen. |
| RF-I5 | One discovery source failing keeps the entire previous catalogue. |
| RF-I6 | The section's audio links publish with no expiry; everything else about the audio index is unchanged. |

## 7. Tests and Definition of Done

- ☑ Licence gate: BY and BY-SA pass; NC, ND, NC-SA, NC-ND, garbage never do — in the URL
  parser and again through the track parser.
- ☑ Factory: the section rides alongside fixture mode end to end; catalogue rows carry
  source and licence; audio index entries have no expiry; a Jamendo outage keeps the
  previous catalogue byte for byte.
- ☑ Export gate: with-audio passes its correct file, rejects a mute file, rejects audio in
  silent mode, still enforces every video rule.
- ☑ Orchestrator: fetch before render, RF2 on failure with zero render calls, transient
  copy deleted on every exit, kept across the memory retry.
- ☐ Device: export with a royalty-free track, hear it in the gallery, cuts on the beat.
- ☐ Owner: create the free Jamendo key and add the `JAMENDO_CLIENT_ID` secret (GO-LIVE.md).
