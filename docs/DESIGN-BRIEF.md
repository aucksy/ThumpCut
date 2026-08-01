# ThumpCut — Design Brief for Claude Design

**Paste this whole document into Claude Design.**

---

## What you're designing

ThumpCut is a mobile app for Android and iOS that turns a mix of **photos and video clips** into
a short reel where every cut lands on the beat of a song — and where the cutting speeds up and
slows down as the music does.

The user picks a template, picks media, exports, and shares to Instagram. That's the product.

**Design for both platforms from one system.** Same screens, same components. Only the share
sheet and the system media picker differ.

## The rule that shapes this brief

**Design every state, not just the happy path.**

Most designs show the screen when everything works. The engineer then invents the empty state,
the error state, and the permission state at build time — and invents them differently each
time. That gap is where bugs and ugly screens come from.

So §5 lists **every state each screen can be in**, with the exact words to display. Design all
of them. A state with no design is a state that will be built badly.

## The differentiator the design must carry

Competitors are photo-slideshow apps where video is an afterthought. ThumpCut treats a video
clip as a first-class element — trimmed to its slot, speed-fitted so its motion works with the
beat, mixed freely with stills.

A clip is never "a photo with a play icon on it." It has a duration, a chosen moment, and its
own controls.

## Who uses it

Someone back from a trip or a wedding with 200 photos and a dozen clips, who wants one good reel
today. On a phone, probably a mid-range Android, probably in India. They don't know what a
downbeat is and must never be asked. They tried CapCut once and found it exhausting.

## The single job

Get from "I have photos and clips" to "I posted a reel" in under a minute, without ever seeing a
timeline, a spinner, or a settings panel.

## The competitive position, which is a design position

Every competitor is loud, ad-stuffed, and covered in gradient buttons and gold PRO badges. They
feel cheap because they're monetised aggressively.

**ThumpCut's differentiator is restraint.** No ads, no watermark, no upsell. It should feel like
a well-made tool. If a screen looks like it wants something from the user, it's wrong.

---

# Visual direction

## The world to borrow from

Not "video editing app." **Studio and DJ hardware.** Mixing desks, drum machines, rack gear, CDJs.

Conventions worth stealing:
- Numbers are monospaced, because they're readings, not prose
- Colour means signal level, not decoration
- Surfaces are graphite and warm grey, never pure black
- Labels are small, uppercase, set wide
- Red means one thing only: you've gone too far

## Colour

| Token | Hex | Use |
|---|---|---|
| `graphite` | `#17181A` | App background. Warm-tinted, never pure black. |
| `panel` | `#23252A` | Cards, sheets, raised surfaces |
| `bone` | `#EAE6DE` | Primary text and icons. Warm off-white, like label print. |
| `signal` | `#FF9E2C` | Amber. Playback, active state, energy. |
| `cool` | `#4FB8C4` | Teal. Selection, confirmation, and **video clips**. |
| `clip` | `#E23D28` | Red. Destructive actions and over-limit only. Never decorative. |

**The two-accent system matters.** Amber means "playing / energetic." Teal means "you chose
this" — and doubles as the video-clip colour, so clips read as a distinct material throughout.
One accent doing both jobs is what makes an interface generic. Keep them separate.

**Energy tinting:** where a track's energy curve appears, interpolate from `cool` at low energy
through `bone` to `signal` at high, with `clip` at the drop. The visual identity is generated
from the music, differently for every track.

## Typography

- **Display —** `Archivo`, heavy and condensed. Sparingly: screen titles, template names. Tight
  tracking, sentence case.
- **Body —** `Public Sans`. Regular and medium only.
- **Data —** `JetBrains Mono`. Every number: BPM, durations, clip lengths, trim points, counts,
  progress. Tabular figures, always.

Mono-for-numbers is the strongest typographic signal here, and video earns it — `0:04.2` clip
lengths and trim positions appear constantly.

Section labels: small, uppercase, letterspaced wide, `bone` at 55%.

## The signature element: the beat ruler

**The one thing ThumpCut is remembered by. Spend the boldness here; keep everything else quiet.**

A horizontal strip rendering the track's actual beat grid:

- Short tick per beat, taller tick per downbeat
- A filled marker where the picture changes
- **Video markers are teal; photo markers are bone.** At a glance you see the rhythm of stills
  against motion.
- Tinted along its length by the energy curve — cool in calm passages, amber as energy rises,
  red at the drop
- During playback a playhead sweeps across and each marker flashes as it's hit

Full-width under the video on the preview screen; a compressed 4pt version along the bottom of
every template card.

It isn't decoration — it's the product's data made visible.

## Motion

- Everything springs. Nothing eases linearly.
- Preview cuts are hard, on the frame. Never crossfade the UI's own transitions — it undercuts
  the premise.
- Template cards autoplay muted, staggered 80ms on entry
- Ruler markers pulse on hit: 120ms, scale only
- **Reduced motion:** kill autoplay and pulses, keep the playhead. This is a real system setting,
  not an afterthought — design the reduced-motion variant.

**No parallax, no glassmorphism, no gradient overlays, no shimmer loaders.** The app feels fast
because it is fast, not because it animates while waiting.

---

# Screens and every one of their states

Design every state listed. Copy shown in quotes is **exact** — do not rewrite it.

## 1. First launch

- **Default:** beat ruler animating alone as the hero. "Photos and clips in. Reel out. Every cut
  on the beat." Button: **Get started**
- **Downloading:** progress indicator, "Getting things ready"
- **Offline, nothing cached:** "You're offline. Connect to the internet to get started." +
  **Retry**
- **Download failed:** "We couldn't load your styles. Check your connection and try again." +
  **Retry**
- **Storage full:** "Not enough storage to set up ThumpCut. Free up about 50 MB and try again."
  + **Retry**

## 2. Template gallery (home)

- **Default:** two-column grid of cards, previews looping. Each card: 9:16 preview, template
  name in display type, compressed beat ruler along the bottom, and in mono `128 BPM · 8–16
  items`. Mood chips at top: All, Chill, Upbeat, Hype, Cinematic. Floating **Create** button.
- **Partially cached:** cards whose preview hasn't downloaded show the first frame as a still.
  **Never an empty box, never a shimmer.**
- **Offline with cache:** identical to default. **No warning, no banner.** A cached catalogue is
  a normal working state.

## 3. Media selection

- **Permission unknown:** explainer + **Allow photo access**
- **Permission denied:** "ThumpCut needs access to your photos to make a reel." + **Open
  Settings**
- **Limited access (iOS):** the permitted photos, plus a persistent "Select more photos" row
- **Loading:** grid skeleton
- **Empty:** "No photos or videos on this device."
- **Browsing:** grid, counter in mono `0/30`
- **Fewer than 3 selected:** Continue disabled, inline hint "Pick at least 3 items."
- **Ready:** 3–30 selected, Continue enabled
- **Item cap reached:** 30 selected, toast "You can add up to 30 items."
- **Video cap reached:** 15 videos selected, **video tiles visibly dimmed**, toast "You can add
  up to 15 video clips." Photos remain selectable — the dimming must clearly apply to videos only.
- **Validating:** brief "Preparing…" state
- **Item unavailable:** the failed tile carries a badge and is deselected. "This item couldn't be
  downloaded and was skipped."

**Tile design.** Video clips carry a teal border, a play glyph, and their length in mono
(`0:12`). Photos carry none of that. The difference must be obvious at a glance. Every tile
shows its order number in mono.

**Header** in mono: `9 items · 3 clips`

## 4. Clip trim sheet

Bottom sheet, half height, opened from a clip's duration badge.

- The clip looping at the top
- A filmstrip scrubber beneath
- A teal in-point handle, **already positioned slightly into the clip when the sheet opens** —
  this quietly teaches the feature
- In-point in mono: `IN 0:02.4`
- One line of help: "Pick the moment this clip starts from."
- **Done**

## 5. Recommended templates

- **Default:** label `MADE FOR 9 ITEMS`, then the card grid filtered so suitable templates come
  first
- **Below the fold:** a divider labelled `ALSO WORKS` with the rest. **Not hidden** — the user
  can always pick anything.

## 6. Preview

- **Default:** video preview 9:16 on loop; beat ruler full width beneath it; track title, artist
  and BPM in mono with a small amber indicator pulsing on the beat; a horizontally scrolling
  template strip (selected one outlined in `cool`); **Export** filled and **Shuffle order**
  outline at the bottom

  **Important — the preview plays a metronome click, not the song.** A click on every beat, a
  stronger one on every downbeat, generated on the device. The user hears the *timing*, not the
  music. This is a legal constraint, not an oversight, and the design has to carry it
  gracefully: the beat ruler and the amber pulse are doing the work of communicating "this is
  locked to the music", so give them enough presence to land. The track name and BPM are still
  shown, because that is the track they will apply in Instagram.
- **Building:** under 100ms, usually invisible. If it must be shown, dim the preview slightly —
  no spinner.
- **Muted device:** video and ruler work exactly as normal. **No note, no warning** — the click
  is a nicety, not a dependency.
- **Template adjusted:** shown once, "This style needs a different number of items, so we
  adjusted it."
- **Item skipped:** "One item was skipped because it's no longer available."
- **Track retired:** the chosen song left Instagram's library mid-session. A similar-tempo track
  is substituted automatically. "That track isn't available anymore. Here's a similar one."
  Shown once, quietly — the user's work is not lost and the tone should reflect that.
- **Reduced motion:** playhead still moves, marker pulses off

## 7. Export

A sheet, not a screen.

- **Preparing:** "Getting your media ready"
- **Rendering:** circular progress, mono percentage `47%`, "Rendering your reel." **Cancel** in
  `clip`, text only
- **Not enough storage:** "Not enough storage. Free up about 200 MB and try again." + **Retry**
- **Out of memory:** "This reel is too heavy for your phone. Try using fewer video clips."
- **Interrupted (iOS):** "Your reel didn't finish because the app went to the background. Keep
  ThumpCut open while it renders." + **Retry**
- **Failed:** "Something went wrong making your reel. Please try again." + **Retry**
- **Complete:** transitions straight into Share. No success interstitial.

## 8. Share

- **Default:** finished video playing small; **Share to Instagram** primary full width; **Save
  to gallery** secondary; beneath, in `bone` at 55%: "Pick your track in Instagram — you'll get
  the full library."
- **Instagram not installed:** the Instagram button is **absent entirely**, not greyed out. Only
  Save to gallery.
- **Handoff failed:** "Couldn't open Instagram. You can save the reel and share it manually."
  Save button still available.
- **Saved:** "Saved to your gallery."
- **File gone:** "That reel is no longer available. Please export again."

That "Pick your track in Instagram" line does real work — it sets expectations for the one
manual step and reframes a limitation as an advantage. Warm, never apologetic.

It is also the payoff for the metronome preview. The user has been watching cuts land on clicks;
this line tells them where the actual song arrives. Give it more presence than a footnote.

## 9. Settings

Almost empty. Export quality, privacy policy link, version in mono. The emptiness is the
message: this app collects nothing and wants nothing.

---

# Copy rules

- Active voice. The button says **Export**; the toast says **Exported**.
- "Items" when mixed, "photos" and "clips" when specific. Never "media assets."
- Numbers always mono with their unit: `128 BPM`, `0:04.2`, `9 items`
- Never say AI, magic, smart, or powered by
- Errors state what happened and what to do. No apology, no vagueness, no "Oops."
- No exclamation marks
- Never use Reels, Instagram or Insta in the product name or any heading — only on the specific
  share button

---

# Accessibility — not optional

- Every control has a screen-reader label. Media tiles announce type, position and selected
  state: "Video clip, item 3 of 9, selected."
- The beat ruler is decorative — hide it from screen readers rather than describing ticks.
- Export progress is announced at intervals, not on every tick.
- Large font and dynamic type must not clip the counter, hints, or error text. Design the
  worst case.
- Minimum tap target 44pt.
- Visible focus states for keyboard and switch control.
- Never use colour alone to carry meaning. The teal video treatment is always accompanied by a
  play glyph and a duration, so it reads without colour vision.

---

# Constraints

- **Mobile only.** Design at 393×852. No tablet, no landscape.
- **Dark only.** No light mode in v1.
- Must read well on a 5.5" screen at arm's length — the real viewing condition.
- Every thumbnail is user content and could be any colour; tiles need structural contrast to
  survive that.

---

# What to avoid

- Purple-to-pink gradients. Every competitor uses them.
- Gold PRO badges, crowns, diamond icons
- A bottom tab bar — one flow, not four sections
- Onboarding carousels
- Skeleton shimmer loaders. Nothing is being waited for; a loader implies there is.
- Rounded-everything. 8pt radius on cards, 4pt on chips. Hardware isn't pillowy.
- Any screen asking the user to sign up, rate, or upgrade
- Treating a video clip like a photo with a play icon on it
- **Designing only the happy path.** Every state in §5 gets a design.

---

# Deliverable

The nine screens as a connected flow, **plus every state listed under each one.**

Components:
- **Beat ruler** — idle, playing, compressed for cards, reduced-motion — with both photo and
  clip markers. This is the primary way the user perceives sync during preview, since no music
  plays. Design it to be legible at a glance, not just decorative.
- **Media tile** — photo variant, video variant, dimmed-at-cap variant, unavailable variant
- **Track substitution notice** — the quiet, non-alarming treatment for a retired track
- **Clip trim sheet** with the filmstrip scrubber
- **Template card** — cached and still-frame variants
- Button styles, chip style, toast style, inline hint style
- Every empty and error state from §5, with the exact copy

Show the main flow in order so it reads as one journey from launch to posted reel, then the
alternate states grouped by screen.
