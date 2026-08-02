# 10 — Share anywhere: YouTube, and the system share sheet

Added 2026-08-02 at the owner's direction: *"You also need to add research, a plan and an
implementation for YouTube support."* Research notes with sources live in `docs/research/`.

---

## 1. Purpose and scope

A reel that **carries its own music** (a local or royalty-free track — specs 08 and 09) can
be posted anywhere, so its share screen offers more than Instagram:

- **Share to YouTube** — hands the file to the YouTube app. YouTube's documented rule:
  a square or vertical video up to 3 minutes becomes a **Short** on its own. Every ThumpCut
  reel qualifies. The button appears only when YouTube is installed — absent otherwise,
  never greyed out.
- **Share anywhere** — the system share sheet: TikTok, WhatsApp, wherever. Always present
  in this mode.
- **Save to gallery** — unchanged.
- The caption line says the honest thing: the music is in the video.
- For a royalty-free track, a **credit line** sits under the buttons — the attribution the
  CC licence asks a poster to carry — selectable, so it can be long-pressed into a caption.

A reel cut for an **Instagram-catalogue track keeps today's screen exactly**: Instagram +
Save. It is silent, and only Instagram can supply its licensed track. Offering YouTube for
a silent reel would invite adding a *different* song there, and every cut would miss —
"the product is quietly wrong" is the one outcome this project never ships.

**Why not the YouTube upload API, on the record:** uploads from API projects that have not
passed Google's audit are **locked private, with no appeal** — a policy live since 2020 and
verified current. It also needs OAuth and a verified consent screen. The share intent needs
none of that, and the Shorts classification is decided by the file, not the entry point.

**Out of scope:** TikTok's Share Kit SDK (needs its own developer approval; the system
sheet reaches TikTok today); direct YouTube uploads; captions or titles pre-filled in
YouTube (undocumented, so not promised).

## 2. States

The share screen has two shapes, decided by the selected track's source before the screen
opens; nothing switches shape while it is up.

| Mode | Buttons | Caption |
|---|---|---|
| instagram | [Share to Instagram]? [Save to gallery] | the pick-your-track line |
| anywhere | [Share to YouTube]? [Share anywhere] [Save to gallery] | the music-included line, plus the credit when one is owed |

`?` marks buttons that are absent when the platform says the app is not installed.
Availability is re-checked every time the screen appears and every time the app resumes.
Handoffs share the existing lifecycle: busy while handing off, "Returned" after — coming
back is not an ending, the file and every button stay.

## 3. Acceptance criteria

- Given a local or royalty-free track, when the share screen opens, then the Instagram
  button is not there, and the YouTube button is there exactly when YouTube is installed.
- Given an Instagram-catalogue track, when the share screen opens, then it is identical to
  the screen this spec inherited — no YouTube, no sheet, no credit.
- Given YouTube is installed, when Share to YouTube is tapped, then YouTube opens with the
  reel, and returning to ThumpCut shows both buttons and the file still there.
- Given the handoff to YouTube fails, when the error shows, then it is the exact Y1 text
  and the file is kept.
- Given a royalty-free track, when the screen renders, then the credit line shows title,
  artist and licence name, and the text is selectable.
- Given the user's own song, when the screen renders, then no credit line appears — none is
  owed for their own music.

## 4. Edge cases

- YouTube uninstalled between two exports: availability is re-checked on appear and on
  resume; the button vanishes rather than failing.
- Nothing on the phone can take a video: the system sheet itself fails → Y2, file kept,
  Save still works.
- Double-tap on any share button: one handoff; the second tap joins the first.
- The reel deleted while away in another app: the existing file-gone state, unchanged.
- Android 11+ package visibility: YouTube and both TikTok package names are declared in the
  manifest so detection works; without the declaration an installed app reads as missing.

## 5. Error catalogue

| ID | When | Exact text | Recovery |
|---|---|---|---|
| Y1 | The YouTube handoff failed | "Couldn't open YouTube. You can save the reel and share it manually." | Save, or the sheet |
| Y2 | The system sheet failed | "Couldn't share the reel. You can save it and share it manually." | Save |

Non-error copy: the buttons "Share to YouTube" and "Share anywhere", and the caption
"The music is in the video — share it anywhere."

## 6. Invariants

| ID | Invariant |
|---|---|
| SA1 | A silent (Instagram-track) reel is never offered to YouTube or the sheet. |
| SA2 | A button for an app the platform reports missing is absent, never disabled. |
| SA3 | Every handoff leaves the file in place; returning shows the same screen, alive. |
| SA4 | The credit line appears exactly when a licence is owed: royalty-free yes, local no, Instagram never (the mode does not exist there). |
| SA5 | All three destinations receive the identical validated file — one export, one file. |

## 7. Tests and Definition of Done

- ☑ Controller: mode decides which availabilities are asked for; YouTube handoff round
  trip; Y1 and Y2 exact texts; refusal when YouTube absent; credit carried; instagram mode
  untouched by the new paths.
- ☑ Screen states rendered and measured: anywhere with YouTube + credit, without YouTube,
  and local (no credit).
- ☐ Device: share a music-carrying reel to YouTube, confirm it lands in the upload flow as
  a Short; share via the sheet to one more app. (The YouTube app accepting the intent is
  the one link in this chain no document guarantees — it is the first thing to test.)
