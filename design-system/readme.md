# ThumpCut Design System

ThumpCut is a mobile app (Android + iOS, one design system) that turns a mix of photos and
video clips into a short reel where every cut lands on the beat of a song. Pick a template,
pick media, export, share to Instagram. The product's differentiator is **restraint**: no ads,
no watermark, no upsell, no timeline, no spinner. If a screen looks like it wants something
from the user, it's wrong.

**Source:** `uploads/DESIGN-BRIEF.md` (the full product + design brief; exact copy for every
state lives there and is reproduced verbatim in the UI kit). No pre-existing brand assets were
provided — the logo, palette implementation, and all components here are original work built
to that brief.

## The world this borrows from

Studio and DJ hardware — mixing desks, drum machines, rack gear. Numbers are monospaced
readings, color means signal level, surfaces are warm graphite, labels are small/uppercase/wide,
red means exactly one thing.

## Content fundamentals

- Active voice. The button says **Export**; the toast says **Exported**.
- "Items" when mixed; "photos" and "clips" when specific. Never "media assets."
- Numbers always in JetBrains Mono with their unit: `128 BPM`, `0:04.2`, `9 items`.
- Never say AI, magic, smart, or powered by. No exclamation marks. No emoji.
- Errors state what happened and what to do. No apology, no vagueness, no "Oops."
- Sentence case everywhere, including display type.
- "Instagram" appears only on the share button, never in headings.

## Visual foundations

- **Color:** graphite `#17181A` background (warm, never pure black), panel `#23252A`, bone
  `#EAE6DE` text. Two accents with separate jobs: **signal** amber `#FF9E2C` = playing/active,
  **cool** teal `#4FB8C4` = "you chose this" + the material color of video clips. **clip** red
  `#E23D28` = destructive/over-limit only. Energy ramp interpolates cool → bone → signal with
  clip at the drop (see `tokens/colors.css`).
- **Type:** Archivo 800 at 80% width (display, sparingly) · Public Sans 400/500 (body) ·
  JetBrains Mono 400–600 tabular (every number). Section labels 11px uppercase +0.14em bone-55.
- **Spacing:** 4pt grid, 20px screen gutters, 44pt tap minimum. Radii: 8pt cards, 4pt chips —
  nothing pillowy.
- **Surfaces:** flat panels + hairlines (`--tc-bone-12`). No gradients, no glassmorphism, no
  parallax, no shimmer. Scrims are `rgba(10,10,12,.62)`.
- **Motion:** springs only (`--spring`), hard cuts for the UI's own transitions, 120ms
  scale-only marker pulses, 80ms card stagger. Reduced motion is a designed variant: autoplay
  and pulses off, playhead stays. Keyframes live in `tokens/motion.css` (`tc-sweep` is
  transform-only on purpose — animating `left` wrecks performance at board scale).
- **The signature element:** the beat ruler. Spend the boldness there; keep everything else quiet.

## Iconography

No icon font. Icons are tiny inline SVG strokes (1.5–1.8px, round caps) drawn per use inside
components: chevrons, gear, plus, play triangle, warning triangle, swap arrows. Bone at 70%
for interactive, 55% for passive. Unicode/emoji never used. The logo mark and app icon are
static SVGs in `assets/`.

## Brand

- `assets/logo-mark.svg` — "the downbeat": beat ticks + amber playhead crossing the ruler line;
  one tick teal (a video clip).
- `assets/app-icon.svg` — mark on a graphite squircle.
- Wordmark: "Thumpcut", Archivo 800 / 80% width / -0.02em, with a thin amber tick between
  "Thump" and "cut" (the beat the cut lands on). Rendered in type, not stored as SVG — see
  `guidelines/brand-lockup.html`.

## Index

- `styles.css` → `tokens/` (fonts, colors, typography, spacing, motion)
- `guidelines/` — foundation + brand specimen cards (Design System tab)
- `components/`
  - `actions/` Button, Chip
  - `feedback/` Toast, InlineHint, TrackNotice
  - `ruler/` BeatRuler
  - `media/` MediaTile, TemplateCard, TrimSheet
  - each with `.d.ts` props + `.prompt.md` usage
- `ui_kits/thumpcut/`
  - `screens.jsx` — all nine screens, parameterized by `state`; `SCREEN_DEFS` registry
  - `index.html` — interactive flow (launch → posted reel) with a state switcher
  - `states.html` — static board: the journey in order, then all ~39 states grouped by screen
- `tc-loader.js` — dev-time loader the cards/kits use to run the `.jsx` sources directly
  (fetch → strip import/export → Babel → `window.TC`). Production consumers should use the
  compiled bundle instead.

## Intentional additions

The brief defines the component inventory (beat ruler, media tile, template card, trim sheet,
track notice, button, chip, toast, inline hint) — all built. Nothing else was added.

## Placeholders

All photography is placeholder (picsum.photos seeds) standing in for user content. Every
thumbnail in the real product is user media and can be any color — tiles rely on structural
contrast (borders, badges, scrims), never on the image itself.
