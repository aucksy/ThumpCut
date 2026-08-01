/**
 * Every screen state, in one list.
 *
 * The design brief's rule: **design every state, not just the happy path.** This is the same
 * rule applied to verification — if a state is not in this list it is never rendered, never
 * measured and never screenshotted, and that is exactly where ugly screens come from.
 */

import type { ReactElement } from "react";
import {
  ExportSheet,
  GalleryScreen,
  LaunchScreen,
  MediaSelectScreen,
  PreviewScreen,
  RecommendedScreen,
  SettingsScreen,
  ShareScreen,
} from "../../../../app/src/screens/index.tsx";
import { TrimSheet } from "../../../../app/src/ui/TrimSheet.tsx";
import { COPY } from "../../../../app/src/copy.ts";
import { recommendTemplates } from "../../../../app/src/templates/recommend.ts";
import type { RenderSnapshot } from "../../../../app/src/render/orchestrator.ts";
import type { ShareSnapshot } from "../../../../app/src/share/controller.ts";
import {
  CLIP_HEAVY_LIBRARY,
  SAMPLE_LIBRARY,
  SAMPLE_RULER,
  SAMPLE_TEMPLATES,
  SAMPLE_TRACK,
  placeholder,
  selectionFor,
} from "./fixtures.ts";

export interface ScreenState {
  id: string;
  title: string;
  render: () => ReactElement;
}

const bpmFor = () => 124;
const noop = () => {};
const REEL_FRAME = placeholder(41, 540, 960);

function renderSnapshot(patch: Partial<RenderSnapshot>): RenderSnapshot {
  return {
    status: "Rendering",
    progress: 0.47,
    message: null,
    error: null,
    outputUri: null,
    skippedItemIds: [],
    canRetry: false,
    ...patch,
  };
}

function shareSnapshot(patch: Partial<ShareSnapshot>): ShareSnapshot {
  return {
    status: "Ready",
    instagramAvailable: true,
    message: null,
    videoUri: "file:///reel.mp4",
    busy: false,
    ...patch,
  };
}

const previewBase = {
  templateName: "Night drive",
  trackTitle: SAMPLE_TRACK.title,
  trackArtist: SAMPLE_TRACK.artist,
  trackTempo: SAMPLE_TRACK.tempo,
  frameUri: REEL_FRAME,
  beats: SAMPLE_RULER.beats,
  downbeats: SAMPLE_RULER.downbeats,
  energy: SAMPLE_RULER.energy,
  markers: SAMPLE_RULER.markers,
  startSec: SAMPLE_RULER.startSec,
  durationSec: SAMPLE_RULER.durationSec,
  positionSec: SAMPLE_RULER.durationSec * 0.42,
  templates: SAMPLE_TEMPLATES,
  selectedTemplateId: "night-drive",
};

export const SCREEN_STATES: ScreenState[] = [
  // 1 · First launch
  { id: "01-launch-default", title: "First launch — default", render: () => <LaunchScreen state="default" positionSec={4.2} /> },
  { id: "01-launch-downloading", title: "First launch — downloading", render: () => <LaunchScreen state="downloading" /> },
  { id: "01-launch-offline", title: "First launch — offline, nothing cached", render: () => <LaunchScreen state="offline" /> },
  { id: "01-launch-failed", title: "First launch — download failed", render: () => <LaunchScreen state="failed" /> },
  { id: "01-launch-storage", title: "First launch — storage full", render: () => <LaunchScreen state="storage" /> },

  // 2 · Template gallery
  {
    id: "02-gallery-default",
    title: "Template gallery — default",
    render: () => <GalleryScreen templates={SAMPLE_TEMPLATES} bpmForTemplate={bpmFor} />,
  },
  {
    id: "02-gallery-partial",
    title: "Template gallery — partially cached, stills not empty boxes",
    render: () => (
      <GalleryScreen
        templates={SAMPLE_TEMPLATES.map((template, index) =>
          index === 3 ? { ...template, previewPosterUrl: "" } : template,
        )}
        bpmForTemplate={bpmFor}
      />
    ),
  },
  {
    id: "02-gallery-offline",
    title: "Template gallery — offline with cache, identical, no banner",
    render: () => (
      <GalleryScreen templates={SAMPLE_TEMPLATES} bpmForTemplate={bpmFor} selectedMood="All" />
    ),
  },
  {
    id: "02-gallery-mood",
    title: "Template gallery — mood filtered",
    render: () => (
      <GalleryScreen templates={SAMPLE_TEMPLATES} bpmForTemplate={bpmFor} selectedMood="Hype" />
    ),
  },

  // 3 · Media selection
  {
    id: "03-media-permission",
    title: "Media selection — permission unknown",
    render: () => <MediaSelectScreen onBack={noop} state={selectionFor({ status: "PermissionUnknown", permission: "unknown", library: [] })} />,
  },
  {
    id: "03-media-denied",
    title: "Media selection — permission denied",
    render: () => <MediaSelectScreen onBack={noop} state={selectionFor({ status: "PermissionDenied", permission: "denied", library: [] })} />,
  },
  {
    id: "03-media-limited",
    title: "Media selection — limited access (iOS)",
    render: () => (
      <MediaSelectScreen
        state={selectionFor({
          permission: "limited",
          selectedCount: 4,
          library: SAMPLE_LIBRARY.filter((item) => item.kind === "photo").slice(0, 6),
          status: "Ready",
        })}
      />
    ),
  },
  {
    id: "03-media-loading",
    title: "Media selection — loading",
    render: () => <MediaSelectScreen onBack={noop} state={selectionFor({ status: "Loading", library: [] })} />,
  },
  {
    id: "03-media-empty",
    title: "Media selection — empty",
    render: () => <MediaSelectScreen onBack={noop} state={selectionFor({ status: "Empty", library: [] })} />,
  },
  {
    id: "03-media-min-not-met",
    title: "Media selection — fewer than 3 selected",
    render: () => (
      <MediaSelectScreen
        state={selectionFor({ selectedCount: 2, status: "MinNotMet", hint: COPY.media.pickAtLeastThree })}
      />
    ),
  },
  {
    id: "03-media-ready",
    title: "Media selection — ready",
    render: () => <MediaSelectScreen onBack={noop} state={selectionFor({ selectedCount: 9, status: "Ready" })} />,
  },
  {
    id: "03-media-item-cap",
    title: "Media selection — item cap reached",
    render: () => (
      <MediaSelectScreen
        state={selectionFor({ selectedCount: 12, status: "MaxReached", toast: COPY.media.itemCapReached })}
      />
    ),
  },
  {
    id: "03-media-video-cap",
    title: "Media selection — video cap, clips dim and photos stay live",
    render: () => (
      <MediaSelectScreen
        state={{
          ...selectionFor({ selectedCount: 0, status: "VideoCapReached" }),
          library: CLIP_HEAVY_LIBRARY,
          // Fifteen clips picked, five more still in the grid: those five dim, and every
          // photo stays live. That contrast is the whole point of the state.
          selectedIds: CLIP_HEAVY_LIBRARY.filter((item) => item.kind === "video")
            .slice(0, 15)
            .map((item) => item.id),
          toast: COPY.media.videoCapReached,
        }}
      />
    ),
  },
  {
    id: "03-media-validating",
    title: "Media selection — validating",
    render: () => (
      <MediaSelectScreen
        state={selectionFor({ selectedCount: 9, status: "Validating", validating: true })}
      />
    ),
  },
  {
    id: "03-media-unavailable",
    title: "Media selection — item unavailable",
    render: () => (
      <MediaSelectScreen
        state={selectionFor({
          selectedCount: 9,
          status: "ItemUnavailable",
          unavailableIds: ["item-4"],
          toast: COPY.media.cloudUnavailable,
        })}
      />
    ),
  },

  // 4 · Clip trim sheet
  {
    id: "04-trim-default",
    title: "Clip trim sheet — in-point pre-nudged",
    render: () => (
      <TrimSheetState />
    ),
  },

  // 5 · Recommended templates
  {
    id: "05-recommended",
    title: "Recommended templates — made for 9 items, plus also works",
    render: () => (
      <RecommendedScreen
        onBack={noop}
        itemCount={9}
        clipCount={3}
        recommendation={recommendTemplates(SAMPLE_TEMPLATES, 9)}
        bpmForTemplate={bpmFor}
      />
    ),
  },

  // 6 · Preview
  { id: "06-preview-default", title: "Preview — default, metronome click not the song", render: () => <PreviewScreen onBack={noop} {...previewBase} /> },
  { id: "06-preview-building", title: "Preview — building, dimmed, no spinner", render: () => <PreviewScreen onBack={noop} {...previewBase} building /> },
  { id: "06-preview-adjusted", title: "Preview — template adjusted", render: () => <PreviewScreen onBack={noop} {...previewBase} notice="adjusted" /> },
  { id: "06-preview-skipped", title: "Preview — item skipped", render: () => <PreviewScreen onBack={noop} {...previewBase} notice="skipped" /> },
  { id: "06-preview-retired", title: "Preview — track retired, substituted quietly", render: () => <PreviewScreen onBack={noop} {...previewBase} notice="retired" /> },
  { id: "06-preview-reduced", title: "Preview — reduced motion", render: () => <PreviewScreen onBack={noop} {...previewBase} reducedMotion /> },

  // 7 · Export
  {
    id: "07-export-preparing",
    title: "Export — preparing",
    render: () => <ExportOver snapshot={renderSnapshot({ status: "Preparing", progress: 0 })} />,
  },
  {
    id: "07-export-rendering",
    title: "Export — rendering",
    render: () => <ExportOver snapshot={renderSnapshot({ status: "Rendering", progress: 0.47 })} />,
  },
  {
    id: "07-export-storage",
    title: "Export — not enough storage",
    render: () => (
      <ExportOver
        snapshot={renderSnapshot({ status: "Failed", error: COPY.render.storageFull, canRetry: true })}
      />
    ),
  },
  {
    id: "07-export-memory",
    title: "Export — out of memory",
    render: () => (
      <ExportOver
        snapshot={renderSnapshot({ status: "Failed", error: COPY.render.outOfMemory, canRetry: false })}
      />
    ),
  },
  {
    id: "07-export-interrupted",
    title: "Export — interrupted (iOS)",
    render: () => (
      <ExportOver
        snapshot={renderSnapshot({ status: "Failed", error: COPY.render.interrupted, canRetry: true })}
      />
    ),
  },
  {
    id: "07-export-failed",
    title: "Export — failed",
    render: () => (
      <ExportOver
        snapshot={renderSnapshot({ status: "Failed", error: COPY.render.failed, canRetry: true })}
      />
    ),
  },

  // 8 · Share
  {
    id: "08-share-default",
    title: "Share — default",
    render: () => <ShareState snapshot={shareSnapshot({})} />,
  },
  {
    id: "08-share-no-instagram",
    title: "Share — Instagram not installed, button absent",
    render: () => <ShareState snapshot={shareSnapshot({ instagramAvailable: false, status: "InstagramUnavailable" })} />,
  },
  {
    id: "08-share-handoff-failed",
    title: "Share — handoff failed",
    render: () => (
      <ShareState snapshot={shareSnapshot({ status: "HandoffFailed", message: COPY.share.handoffFailed })} />
    ),
  },
  {
    id: "08-share-saved",
    title: "Share — saved",
    render: () => <ShareState snapshot={shareSnapshot({ status: "SaveSuccess", message: COPY.share.saved })} />,
  },
  {
    id: "08-share-file-gone",
    title: "Share — file gone",
    render: () => (
      <ShareState
        snapshot={shareSnapshot({ status: "HandoffFailed", videoUri: null, message: COPY.share.fileGone })}
      />
    ),
  },

  // 9 · Settings
  {
    id: "09-settings",
    title: "Settings — almost empty, and that is the message",
    render: () => <SettingsScreen onBack={noop} exportQuality="1080p" version="ThumpCut 1.0.0 (1)" />,
  },
];

// ---------------------------------------------------------------------------
// A few states need a wrapper, because they sit over another screen.
// ---------------------------------------------------------------------------

import { View } from "react-native";

function ExportOver({ snapshot }: { snapshot: RenderSnapshot }) {
  return (
    <View style={{ flex: 1 }}>
      <PreviewScreen onBack={noop} {...previewBase} />
      <ExportSheet snapshot={snapshot} />
    </View>
  );
}

function ShareState({ snapshot }: { snapshot: ShareSnapshot }) {
  return (
    <ShareScreen
      snapshot={snapshot}
      onBack={noop}
      posterUri={REEL_FRAME}
      beats={SAMPLE_RULER.beats}
      downbeats={SAMPLE_RULER.downbeats}
      energy={SAMPLE_RULER.energy}
      markers={SAMPLE_RULER.markers}
      startSec={SAMPLE_RULER.startSec}
      durationSec={SAMPLE_RULER.durationSec}
    />
  );
}

function TrimSheetState() {
  return (
    <View style={{ flex: 1 }}>
      <MediaSelectScreen onBack={noop} state={selectionFor({ selectedCount: 9, status: "Ready" })} />
      <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, justifyContent: "flex-end" }}>
        <View style={{ flex: 1, backgroundColor: "rgba(10,10,12,0.62)" }} />
        <TrimSheet
          posterUri={placeholder(2, 700, 400)}
          durationSec={12}
          inPointSec={2.4}
          onChange={() => {}}
          onDone={() => {}}
        />
      </View>
    </View>
  );
}
