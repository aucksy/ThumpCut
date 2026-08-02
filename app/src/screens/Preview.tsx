/**
 * Preview.
 *
 * The important thing about this screen: **it plays the actual track**, and the picture changes
 * on its beats. That is the whole product, seen and heard in one place.
 *
 * When the recording cannot be fetched — offline, expired link, withdrawn track — the click
 * takes over and the screen says so, once. It never quietly substitutes a click for the song
 * and hopes nobody notices: the small label bottom-right appears only in that case, and the
 * notice under the ruler explains it in words.
 *
 * If the phone is on silent: nothing is said about it. That is the user's own doing, and the
 * ruler and the picture carry the preview on their own.
 */

import { Image } from "expo-image";
import { ScrollView, StyleSheet, View } from "react-native";
import {
  colors,
  layout,
  opacity,
  palette,
  radius,
  ruler as rulerTokens,
  space,
} from "@thumpcut/design-tokens";
import { COPY } from "../copy.ts";
import type { PreviewAudioMode } from "../audio/PreviewAudio.ts";
import type { CatalogueTemplate } from "../catalogue/types.ts";
import type { RulerMarker } from "../ui/BeatRuler.tsx";
import { BeatRuler } from "../ui/BeatRuler.tsx";
import { Button } from "../ui/controls.tsx";
import { Screen, TopBar } from "../ui/chrome.tsx";
import { Toast, TrackNotice } from "../ui/feedback.tsx";
import { Label, Mono } from "../ui/text.tsx";
import { TemplateStrip } from "../ui/TemplateStrip.tsx";

export type PreviewNotice = "none" | "adjusted" | "skipped" | "retired";

export type { PreviewAudioMode };

export interface PreviewScreenProps {
  templateName: string;
  trackTitle: string;
  trackArtist: string;
  /** Already formatted, e.g. `128 BPM`. */
  trackTempo: string;
  frameUri?: string;
  beats: number[];
  downbeats: number[];
  energy: number[];
  markers: RulerMarker[];
  startSec: number;
  durationSec: number;
  positionSec?: number;
  building?: boolean;
  reducedMotion?: boolean;
  notice?: PreviewNotice;
  audioMode?: PreviewAudioMode;
  templates: CatalogueTemplate[];
  selectedTemplateId: string;
  onBack?: () => void;
  onSelectTemplate?: (template: CatalogueTemplate) => void;
  onShuffle?: () => void;
  onExport?: () => void;
}

export function PreviewScreen({
  templateName,
  trackTitle,
  trackArtist,
  trackTempo,
  frameUri,
  beats,
  downbeats,
  energy,
  markers,
  startSec,
  durationSec,
  positionSec,
  building = false,
  reducedMotion = false,
  notice = "none",
  audioMode = "streaming",
  templates,
  selectedTemplateId,
  onBack,
  onSelectTemplate,
  onShuffle,
  onExport,
}: PreviewScreenProps) {
  const noticeText =
    notice === "adjusted"
      ? COPY.preview.templateAdjusted
      : notice === "skipped"
        ? COPY.preview.itemSkipped
        : null;

  // The amber dot pulses on the beat. It is the smallest element on the screen and it does a
  // disproportionate amount of the work of saying "this is in time with something".
  const onBeat =
    positionSec !== undefined &&
    beats.some((beat) => Math.abs(beat - positionSec) < 0.08);

  return (
    <Screen testID="screen-preview">
      <TopBar onBack={onBack} center={<Mono numberOfLines={1} style={styles.dim}>{templateName}</Mono>} />

      <View style={styles.stage}>
        <View style={styles.frame}>
          {frameUri ? (
            <Image
              source={{ uri: frameUri }}
              style={[
                StyleSheet.absoluteFill,
                building ? { opacity: opacity.buildingPreview } : null,
              ]}
              contentFit="cover"
              accessibilityLabel="Reel preview"
              transition={0}
            />
          ) : null}
          {noticeText ? (
            <View style={styles.frameToast}>
              <Toast>{noticeText}</Toast>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.rulerRow}>
        <BeatRuler
          beats={beats}
          downbeats={downbeats}
          energy={energy}
          markers={markers}
          startSec={startSec}
          durationSec={durationSec}
          positionSec={positionSec}
          reducedMotion={reducedMotion}
          height={rulerTokens.heightPreview}
          testID="preview-ruler"
        />
      </View>

      <View style={styles.trackRow}>
        <View style={styles.trackLeft}>
          <View style={[styles.beatDot, onBeat && !reducedMotion ? styles.beatDotOn : null]} />
          <Mono size={12} numberOfLines={1} style={styles.trackText} testID="preview-track">
            {trackTitle} · {trackArtist} · {trackTempo}
          </Mono>
        </View>
        {/* Only when the song is not what you are hearing. When it is, nothing needs saying. */}
        {audioMode === "click" ? (
          <Label numberOfLines={1} style={styles.clickLabel} testID="preview-click-label">
            {COPY.preview.clickPreview}
          </Label>
        ) : null}
      </View>

      {notice === "retired" || audioMode === "click" ? (
        <View style={styles.noticeRow}>
          {notice === "retired" ? <TrackNotice>{COPY.preview.trackRetired}</TrackNotice> : null}
          {audioMode === "click" ? (
            <TrackNotice
              glyph="warn"
              testID="preview-audio-notice"
              style={notice === "retired" ? styles.secondNotice : undefined}
            >
              {COPY.preview.audioUnavailable}
            </TrackNotice>
          ) : null}
        </View>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.strip}
        contentContainerStyle={styles.stripContent}
      >
        <TemplateStrip
          templates={templates}
          selectedId={selectedTemplateId}
          onSelect={onSelectTemplate}
        />
      </ScrollView>

      <View style={styles.actions}>
        <Button variant="secondary" style={styles.shuffle} onPress={onShuffle} testID="preview-shuffle">
          {COPY.preview.shuffle}
        </Button>
        <Button style={styles.export} onPress={onExport} testID="preview-export">
          {COPY.preview.export}
        </Button>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  dim: { color: colors.textSecondary },
  // The frame shrinks on a short screen rather than squeezing everything below it to nothing.
  // A 5-inch phone is the real viewing condition for a lot of this audience.
  stage: { flex: 1, alignItems: "center", justifyContent: "center", marginTop: 2, minHeight: 180 },
  frame: {
    flex: 1,
    maxHeight: 424,
    aspectRatio: 9 / 16,
    borderRadius: radius.card,
    overflow: "hidden",
    backgroundColor: colors.surfaceMedia,
  },
  frameToast: { position: "absolute", top: 12, left: 12, right: 12, alignItems: "center" },
  rulerRow: { marginTop: space.s4, marginHorizontal: layout.screenPad },
  trackRow: {
    marginTop: space.s3,
    marginHorizontal: layout.screenPad,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  // `minWidth: 0` is what actually lets a flex row shrink below its text's natural width.
  trackLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s2,
    flexShrink: 1,
    minWidth: 0,
  },
  trackText: { flexShrink: 1, minWidth: 0 },
  beatDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.signal,
    opacity: 0.55,
  },
  beatDotOn: { opacity: 1, transform: [{ scale: 1.35 }] },
  clickLabel: { fontSize: 9 },
  noticeRow: { marginTop: space.s3, marginHorizontal: layout.screenPad },
  secondNotice: { marginTop: space.s2 },
  // A fixed height, not a flexible one: on a short screen the strip was being squeezed to
  // zero, which made five buttons unhittable without anything looking wrong.
  strip: { flexGrow: 0, flexShrink: 0, height: 140, marginTop: space.s4 },
  stripContent: { paddingLeft: layout.screenPad, paddingRight: space.s2 },
  actions: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: layout.screenPad,
    paddingTop: 14,
    paddingBottom: 34,
  },
  shuffle: { flex: 1 },
  export: { flex: 1.2 },
});
