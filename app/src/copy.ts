/**
 * Every word the app shows a person.
 *
 * One file, because paraphrasing is a defect here, not a style choice. The specs define this
 * text character for character, and `npm run verify:ui` reads the spec error catalogues and
 * fails the build if anything in this file has drifted from them.
 *
 * House rules, from the design brief:
 *   · Active voice. The button says Export; the toast says Exported.
 *   · "Items" when mixed; "photos" and "clips" when specific. Never "media assets".
 *   · Numbers always in mono with their unit: 128 BPM, 0:04.2, 9 items.
 *   · Never say AI, magic, smart, or powered by. No exclamation marks. No emoji.
 *   · Errors state what happened and what to do. No apology, no vagueness, no "Oops."
 *   · "Instagram" appears only on the share button, never in a heading.
 */

export const COPY = {
  // --- First launch (design brief §1) ---------------------------------------------------
  launch: {
    hero: "Photos and clips in. Reel out. Every cut on the beat.",
    getStarted: "Get started",
    downloading: "Getting things ready",
    retry: "Retry",
  },

  // --- Catalogue (spec 03 §5) ------------------------------------------------------------
  catalogue: {
    /** K1 — offline with no cache. */
    offlineNoCache: "You're offline. Connect to the internet to get started.",
    /** K2 — the download failed and there is no cache to fall back on. */
    downloadFailed: "We couldn't load your styles. Check your connection and try again.",
    /** K3 — not enough room to set up. */
    storageFull: "Not enough storage to set up ThumpCut. Free up about 50 MB and try again.",
  },

  // --- Template gallery (design brief §2) -------------------------------------------------
  gallery: {
    create: "Create",
    moods: ["All", "Chill", "Upbeat", "Hype", "Cinematic"] as const,
    settings: "Settings",
  },

  // --- Media selection (spec 04 §5) --------------------------------------------------------
  media: {
    permissionExplainer:
      "Pick photos and clips from your gallery. ThumpCut reads only what you select.",
    allowAccess: "Allow photo access",
    /** E1 */
    permissionDenied: "ThumpCut needs access to your photos to make a reel.",
    openSettings: "Open Settings",
    /** E2 */
    empty: "No photos or videos on this device.",
    /** E3 */
    cloudUnavailable: "This item couldn't be downloaded and was skipped.",
    /** E4 */
    fileUnusable: "This file can't be used and was skipped.",
    /** E5 */
    itemCapReached: "You can add up to 30 items.",
    /** E6 */
    videoCapReached: "You can add up to 15 video clips.",
    /** E7 */
    videoDurationCapReached: "That's a lot of video. Try removing a longer clip.",
    /** E8 */
    unsupportedCodec: "This video format isn't supported and was skipped.",
    /** E9 */
    pickAtLeastThree: "Pick at least 3 items.",
    /** E10 */
    allItemsFailed: "None of those items could be used. Try picking different ones.",
    selectMorePhotos: "Select more photos",
    validating: "Preparing…",
    continue: "Continue",
    pickItems: "Pick items",
  },

  // --- Clip trim sheet (spec 04 §5, design brief §4) -----------------------------------------
  trim: {
    help: "Pick the moment this clip starts from.",
    done: "Done",
  },

  // --- Recommended templates (design brief §5) ------------------------------------------------
  recommended: {
    alsoWorks: "ALSO WORKS",
    /** Rendered as `MADE FOR 9 ITEMS`, with the number in mono. */
    madeForPrefix: "MADE FOR",
    madeForSuffix: "ITEMS",
  },

  // --- Preview (spec 05 §5) -------------------------------------------------------------------
  preview: {
    export: "Export",
    shuffle: "Shuffle order",
    clickPreview: "Click preview",
    /** PV2 */
    templateAdjusted: "This style needs a different number of items, so we adjusted it.",
    /** PV3 */
    itemSkipped: "One item was skipped because it's no longer available.",
    /** PV4 */
    tooFewItems: "Pick at least 3 items.",
    /** PV5 */
    previewFailed: "We couldn't build a preview. Try a different style.",
    /** PV6 */
    trackRetired: "That track isn't available anymore. Here's a similar one.",
  },

  // --- Export (spec 06 §6) ----------------------------------------------------------------------
  render: {
    preparing: "Getting your media ready",
    rendering: "Rendering your reel.",
    cancel: "Cancel",
    /** R1 */
    storageFull: "Not enough storage. Free up about 200 MB and try again.",
    /** R2 */
    outOfMemory: "This reel is too heavy for your phone. Try using fewer video clips.",
    /** R3 and R7 */
    failed: "Something went wrong making your reel. Please try again.",
    /** R4 */
    itemUnreadable: "One item was skipped because it couldn't be read.",
    /** R5 */
    interrupted:
      "Your reel didn't finish because the app went to the background. Keep ThumpCut open while it renders.",
    /** R6 */
    tooFewUsable: "We need at least 3 usable items to make a reel.",
    retry: "Retry",
  },

  // --- Share (spec 07 §6) --------------------------------------------------------------------------
  share: {
    title: "Your reel",
    shareToInstagram: "Share to Instagram",
    saveToGallery: "Save to gallery",
    pickYourTrack: "Pick your track in Instagram — you'll get the full library.",
    /** Spec 06 §6, non-error copy. */
    saved: "Saved to your gallery.",
    /** I1 */
    handoffFailed: "Couldn't open Instagram. You can save the reel and share it manually.",
    /** I2 */
    saveStorageFull: "Not enough storage to save. Free up some space and try again.",
    /** I3 */
    savePermissionDenied: "ThumpCut needs permission to save to your gallery.",
    /** I4 */
    fileGone: "That reel is no longer available. Please export again.",
  },

  // --- Settings (design brief §9) ---------------------------------------------------------------------
  settings: {
    title: "Settings",
    exportQuality: "Export quality",
    privacyPolicy: "Privacy policy",
  },

  // --- Screen reader labels (spec 04 §5) ------------------------------------------------------------------
  a11y: {
    back: "Back",
    settings: "Settings",
    /** Reads as "Video clip, item 3 of 9, selected." */
    mediaTile: (kind: "photo" | "video", position: number, total: number, selected: boolean) =>
      `${kind === "video" ? "Video clip" : "Photo"}, item ${position} of ${total}, ${
        selected ? "selected" : "not selected"
      }.`,
    clipStartPoint: (inPoint: string) => `Clip start point, ${inPoint}`,
    exportProgress: (percent: number) => `Rendering, ${percent} per cent`,
  },
} as const;

// ---------------------------------------------------------------------------
// Number formatting. Every number in the product is mono, with its unit.
// ---------------------------------------------------------------------------

/** `0:12` — a clip length or a position. Rounded to the second. */
export function formatDuration(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const minutes = Math.floor(safe / 60);
  const remainder = Math.floor(safe % 60);
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

/**
 * `0:02.4` — a trim in-point. Tenths matter when you are choosing a moment.
 *
 * Everything is done in whole tenths rather than by taking the fractional part: 2.4 is not
 * exactly 2.4 in binary, so `(2.4 - 2) * 10` is 3.9999999999999996 and truncating it showed
 * the user `0:02.3` for a value of 2.4.
 */
export function formatPreciseDuration(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const totalTenths = Math.round(safe * 10);
  const minutes = Math.floor(totalTenths / 600);
  const whole = Math.floor((totalTenths % 600) / 10);
  const tenth = totalTenths % 10;
  return `${minutes}:${String(whole).padStart(2, "0")}.${tenth}`;
}

/** `IN 0:02.4` — the trim sheet's in-point reading. */
export function formatInPoint(seconds: number): string {
  return `IN ${formatPreciseDuration(seconds)}`;
}

/** `9 items · 3 clips`, or `9 items` when nothing is a clip. */
export function formatSelectionHeader(itemCount: number, clipCount: number): string {
  const items = `${itemCount} ${itemCount === 1 ? "item" : "items"}`;
  if (clipCount <= 0) return items;
  return `${items} · ${clipCount} ${clipCount === 1 ? "clip" : "clips"}`;
}

/** `0/30` — the selection counter. */
export function formatCounter(selected: number, maximum: number): string {
  return `${selected}/${maximum}`;
}

/** `128 BPM` */
export function formatBpm(bpm: number): string {
  return `${Math.round(bpm)} BPM`;
}

/** `47%` */
export function formatPercent(fraction: number): string {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0));
  return `${Math.round(clamped * 100)}%`;
}

/** `128 BPM · 8–16 items` — a template card's meta line. */
export function formatTemplateMeta(bpm: number, range: readonly [number, number]): string {
  return `${Math.round(bpm)} BPM · ${range[0]}–${range[1]} items`;
}

/** `MADE FOR 9 ITEMS` */
export function formatMadeFor(itemCount: number): string {
  return `${COPY.recommended.madeForPrefix} ${itemCount} ${COPY.recommended.madeForSuffix}`;
}
