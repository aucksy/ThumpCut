/**
 * The ThumpCut design system as typed values.
 *
 * This is the single source of truth for every colour, radius, spacing step, type size and
 * motion curve in the app. It is transcribed from `design-system/tokens/*.css`, and the token
 * gate in `tools/ui-verify` fails the build if a screen uses a raw hex or a magic number
 * instead of one of these.
 *
 * Why bother: the design brief's whole position is restraint. Restraint dies one hardcoded
 * `#FF9E2C` at a time.
 */

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

/**
 * Two accents with separate jobs, and that separation is the identity:
 * **signal** (amber) means playing / active / energy. **cool** (teal) means "you chose this",
 * and doubles as the material colour of a video clip. **clip** (red) means destructive or
 * over-limit, and nothing else, ever.
 */
export const palette = {
  /** App background. Warm-tinted, never pure black. */
  graphite: "#17181A",
  /** Cards, sheets, raised surfaces. */
  panel: "#23252A",
  /** Toasts, hover on panel. */
  panel2: "#2B2E34",
  /** Primary text and icons. Warm off-white, like label print. */
  bone: "#EAE6DE",
  /** Amber — playback, active state, energy. */
  signal: "#FF9E2C",
  /** Teal — selection, confirmation, and video clips. */
  cool: "#4FB8C4",
  /** Red — destructive actions and over-limit only. Never decorative. */
  clip: "#E23D28",
  /**
   * The same red, lifted just enough to be legible **as text on a panel**.
   *
   * `clip` against `panel` measures 3.6:1, which fails the 4.5:1 a person needs to read a
   * word. This is 4.5:1 and reads as the same colour. Used only for red text; every fill,
   * border and indicator still uses `clip`.
   */
  clipText: "#EF5A45",
  /**
   * What sits behind user media before it has decoded. A shade off `panel`, so a photo that
   * has not loaded reads as a frame waiting for content rather than as a card.
   */
  mediaWell: "#1B1C1F",
} as const;

export const alpha = {
  bone70: "rgba(234,230,222,0.70)",
  bone55: "rgba(234,230,222,0.55)",
  bone35: "rgba(234,230,222,0.35)",
  bone12: "rgba(234,230,222,0.12)",
  bone08: "rgba(234,230,222,0.08)",
  cool50: "rgba(79,184,196,0.50)",
  cool30: "rgba(79,184,196,0.30)",
  cool12: "rgba(79,184,196,0.12)",
  signal12: "rgba(255,158,44,0.12)",
  clip12: "rgba(226,61,40,0.12)",
  scrim: "rgba(10,10,12,0.62)",
  tileScrim: "rgba(23,24,26,0.72)",
  tileScrimLight: "rgba(23,24,26,0.30)",
  tileVeil: "rgba(23,24,26,0.65)",
} as const;

export const colors = {
  bgApp: palette.graphite,
  surfaceRaised: palette.panel,
  surfaceFloat: palette.panel2,
  surfaceScrim: alpha.scrim,
  surfaceMedia: palette.mediaWell,
  textPrimary: palette.bone,
  textSecondary: alpha.bone55,
  textDisabled: alpha.bone35,
  accentPlayback: palette.signal,
  accentSelect: palette.cool,
  accentVideo: palette.cool,
  danger: palette.clip,
  dangerText: palette.clipText,
  borderHairline: alpha.bone12,
  borderFaint: alpha.bone08,
} as const;

/**
 * The energy ramp: cool at low energy, through bone, to signal at high, with clip at the drop.
 * The beat ruler's colour is generated from the music, so the app looks different for every
 * track without anyone designing a second theme.
 */
export const energyRamp = {
  low: palette.cool,
  mid: palette.bone,
  high: palette.signal,
  drop: palette.clip,
} as const;

const COOL_RGB = [79, 184, 196] as const;
const BONE_RGB = [234, 230, 222] as const;
const SIGNAL_RGB = [255, 158, 44] as const;
const CLIP_RGB = [226, 61, 40] as const;

/** Energy at or above this is a drop, and is drawn in `clip` red. */
export const DROP_THRESHOLD = 0.85;

function mix(from: readonly number[], to: readonly number[], t: number): string {
  const value = (index: number) =>
    Math.round((from[index] as number) + ((to[index] as number) - (from[index] as number)) * t);
  return `rgb(${value(0)},${value(1)},${value(2)})`;
}

/**
 * The colour for a 0..1 energy value. Used by the beat ruler, and by nothing else.
 *
 * A non-finite input lands on the quiet end rather than producing `rgb(NaN,NaN,NaN)`, which
 * renders as nothing at all and would leave a silent gap in the ruler.
 */
export function energyColor(energy: number): string {
  const safe = Number.isFinite(energy) ? energy : 0;
  const clamped = Math.min(1, Math.max(0, safe));
  if (clamped >= DROP_THRESHOLD) return `rgb(${CLIP_RGB.join(",")})`;
  if (clamped < 0.5) return mix(COOL_RGB, BONE_RGB, clamped / 0.5);
  return mix(BONE_RGB, SIGNAL_RGB, (clamped - 0.5) / 0.5);
}

// ---------------------------------------------------------------------------
// Type
// ---------------------------------------------------------------------------

/**
 * Three voices, never mixed. Display is Archivo, heavy and condensed, used sparingly. Body is
 * Public Sans. Data is JetBrains Mono, and **every number in the product is set in it** —
 * BPM, durations, clip lengths, counts, progress. That is the strongest typographic signal
 * the design has.
 */
export const fontFamily = {
  display: "Archivo",
  body: "PublicSans",
  data: "JetBrainsMono",
} as const;

/** The exact font files the app loads. Keys match `fontFamily` values. */
export const fontAssets = {
  Archivo: "Archivo-Bold",
  "Archivo-Semi": "Archivo-SemiBold",
  PublicSans: "PublicSans-Regular",
  "PublicSans-Medium": "PublicSans-Medium",
  JetBrainsMono: "JetBrainsMono-Medium",
  "JetBrainsMono-SemiBold": "JetBrainsMono-SemiBold",
} as const;

export const fontSize = {
  displayXl: 32,
  displayLg: 24,
  displayMd: 17,
  body: 15,
  bodySm: 13,
  data: 13,
  dataSm: 11,
  label: 11,
} as const;

export const letterSpacing = {
  display: -0.02,
  label: 0.14,
  body: 0.01,
} as const;

export const lineHeight = {
  display: 1.12,
  body: 1.45,
  bodyLoose: 1.55,
} as const;

// ---------------------------------------------------------------------------
// Space
// ---------------------------------------------------------------------------

/** 4pt grid. */
export const space = {
  s1: 4,
  s2: 8,
  s3: 12,
  s4: 16,
  s5: 20,
  s6: 24,
  s7: 32,
  s8: 40,
  s9: 56,
} as const;

/**
 * Hardware is not pillowy: 8pt on cards, 4pt on chips. Nothing else — except the ends of a
 * 2pt beat tick or a 4pt grabber, where the radius is half the width and the shape is a pill
 * rather than a rounded rectangle.
 */
export const radius = {
  card: 8,
  chip: 4,
  hairline: 2,
  tick: 1,
} as const;

export const layout = {
  /** Minimum tap target. Non-negotiable — the geometry gate fails the build below this. */
  tapMin: 44,
  screenWidth: 393,
  screenHeight: 852,
  screenPad: 20,
  statusBarHeight: 44,
  topBarHeight: 48,
  homeBarInset: 8,
  buttonHeight: 52,
  buttonHeightSmall: 44,
  chipHeight: 36,
} as const;

export const border = {
  hairline: 1,
  emphasis: 1.5,
  selected: 2,
} as const;

// ---------------------------------------------------------------------------
// Motion
// ---------------------------------------------------------------------------

/**
 * Everything springs. Nothing eases linearly. The UI's own transitions are hard cuts — a
 * crossfading interface undercuts an app whose entire premise is cutting on the beat.
 */
export const motion = {
  /** Spring config for the app's springs. Matches the CSS cubic-bezier(.3, 1.4, .4, 1) feel. */
  spring: { damping: 14, stiffness: 220, mass: 0.9 },
  springSoft: { damping: 18, stiffness: 180, mass: 1 },
  /** Ruler marker hit — scale only. */
  durPulse: 120,
  durFast: 160,
  durMed: 280,
  /** Template card entry stagger. */
  staggerCard: 80,
  /** Press feedback scale. */
  pressScale: 0.97,
} as const;

// ---------------------------------------------------------------------------
// The beat ruler
// ---------------------------------------------------------------------------

/** The signature element. Its geometry is part of the design system, not a component detail. */
export const ruler = {
  height: 44,
  heightHero: 76,
  heightPreview: 40,
  compressedHeight: 4,
  beatTickRatio: 0.2,
  downbeatTickRatio: 0.36,
  markerGapRatio: 0.18,
  beatTickWidth: 2,
  photoMarker: { width: 5, height: 5, radius: 1.5 },
  videoMarker: { width: 5, height: 12, radius: 2.5 },
  playheadWidth: 2,
} as const;

export const opacity = {
  dimmed: 0.35,
  beatTick: 0.45,
  downbeatTick: 0.8,
  compressedIdle: 0.35,
  buildingPreview: 0.55,
} as const;

export const shadow = {
  toast: { color: "rgba(0,0,0,0.45)", offsetY: 8, radius: 24, opacity: 1 },
  sheet: { color: "rgba(0,0,0,0.5)", offsetY: -12, radius: 40, opacity: 1 },
  floating: { color: "rgba(0,0,0,0.55)", offsetY: 10, radius: 28, opacity: 1 },
} as const;

/** Every colour token as a flat list. The token gate uses this to spot raw values in styles. */
export const ALL_COLOR_VALUES: readonly string[] = [
  ...Object.values(palette),
  ...Object.values(alpha),
  "transparent",
  "#1B1C1F", // the neutral placeholder behind media that has not loaded yet
];

export type Palette = typeof palette;
export type Colors = typeof colors;
