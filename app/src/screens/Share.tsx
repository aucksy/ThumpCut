/**
 * Share.
 *
 * Two shapes, decided by what is inside the file. A silent reel cut for an Instagram track
 * gets the Instagram handoff — Instagram supplies the music, so it is the only destination
 * that makes the reel whole. A reel that carries its own music (the user's, or royalty-free)
 * gets YouTube and the system share sheet instead, and never the Instagram-only framing.
 *
 * When an app is not installed its button is **absent**, not greyed out. A disabled button
 * is a promise the app cannot keep and the user has no way to understand.
 *
 * The line underneath does real work in both shapes: it either sets the expectation for the
 * one manual step in Instagram, or says plainly that the music is already in the file.
 */

import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";
import { alpha, colors, layout, radius, space } from "@thumpcut/design-tokens";
import { COPY } from "../copy.ts";
import type { ShareSnapshot } from "../share/controller.ts";
import type { RulerMarker } from "../ui/BeatRuler.tsx";
import { BeatRuler } from "../ui/BeatRuler.tsx";
import { Button } from "../ui/controls.tsx";
import { CenterMessage, Screen, TopBar } from "../ui/chrome.tsx";
import { Toast } from "../ui/feedback.tsx";
import { Body, Display } from "../ui/text.tsx";

export interface ShareScreenProps {
  snapshot: ShareSnapshot;
  posterUri?: string;
  beats: number[];
  downbeats?: number[];
  energy?: number[];
  markers?: RulerMarker[];
  startSec: number;
  durationSec: number;
  onBack?: () => void;
  onShare?: () => void;
  onShareYouTube?: () => void;
  onShareAnywhere?: () => void;
  onSave?: () => void;
  onOpenSettings?: () => void;
}

export function ShareScreen({
  snapshot,
  posterUri,
  beats,
  downbeats,
  energy,
  markers,
  startSec,
  durationSec,
  onBack,
  onShare,
  onShareYouTube,
  onShareAnywhere,
  onSave,
  onOpenSettings,
}: ShareScreenProps) {
  const fileGone = snapshot.videoUri === null;
  const needsSettings = snapshot.message === COPY.share.savePermissionDenied;
  const anywhere = snapshot.mode === "anywhere";
  const hasPrimary = anywhere || snapshot.instagramAvailable;

  return (
    <Screen testID="screen-share">
      <TopBar onBack={onBack} center={<Display size={17}>{COPY.share.title}</Display>} />

      {fileGone ? (
        <CenterMessage
          testID="share-file-gone"
          action={needsSettings ? COPY.media.openSettings : undefined}
          onAction={onOpenSettings}
        >
          {snapshot.message ?? COPY.share.fileGone}
        </CenterMessage>
      ) : (
        <>
          <View style={styles.stage}>
            <View style={styles.frame}>
              {posterUri ? (
                <Image
                  source={{ uri: posterUri }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  accessibilityLabel="Finished reel"
                  transition={0}
                />
              ) : null}
              <View style={styles.frameRuler}>
                <BeatRuler
                  compressed
                  beats={beats}
                  downbeats={downbeats}
                  energy={energy}
                  markers={markers}
                  startSec={startSec}
                  durationSec={durationSec}
                />
              </View>
            </View>
          </View>

          <View style={styles.actions}>
            {/*
              Above the buttons in the layout, not floating over them at a fixed distance from
              the bottom of the screen. This block is a different height depending on whether
              the Instagram button is there at all, and the fixed offset put "Saved to your
              gallery." straight across the middle of it.
            */}
            {snapshot.message && !fileGone ? (
              <View style={styles.toastRow} pointerEvents="none">
                <Toast>{snapshot.message}</Toast>
              </View>
            ) : null}
            {!anywhere && snapshot.instagramAvailable ? (
              <Button full onPress={onShare} testID="share-instagram">
                {COPY.share.shareToInstagram}
              </Button>
            ) : null}
            {anywhere && snapshot.youtubeAvailable ? (
              <Button full onPress={onShareYouTube} testID="share-youtube">
                {COPY.share.shareToYouTube}
              </Button>
            ) : null}
            {anywhere ? (
              <Button
                full
                variant={snapshot.youtubeAvailable ? "secondary" : "primary"}
                onPress={onShareAnywhere}
                testID="share-anywhere"
              >
                {COPY.share.shareAnywhere}
              </Button>
            ) : null}
            <Button
              full
              variant={hasPrimary ? "secondary" : "primary"}
              onPress={onSave}
              testID="share-save"
            >
              {COPY.share.saveToGallery}
            </Button>
            <Body style={styles.pickTrack} testID="share-pick-track">
              {anywhere ? COPY.share.musicIncluded : COPY.share.pickYourTrack}
            </Body>
            {anywhere && snapshot.credit ? (
              <Body selectable style={styles.credit} testID="share-credit">
                {snapshot.credit}
              </Body>
            ) : null}
          </View>
        </>
      )}

    </Screen>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, alignItems: "center", justifyContent: "center" },
  frame: {
    width: 216,
    aspectRatio: 9 / 16,
    borderRadius: radius.card,
    overflow: "hidden",
    backgroundColor: colors.surfaceMedia,
  },
  frameRuler: { position: "absolute", left: 10, right: 10, bottom: 10 },
  actions: { paddingHorizontal: layout.screenPad, paddingBottom: 34, gap: 10 },
  pickTrack: {
    textAlign: "center",
    fontSize: 14,
    lineHeight: 14 * 1.5,
    color: alpha.bone70,
    paddingHorizontal: space.s3,
    paddingTop: space.s2,
  },
  // Selectable on purpose: this is the line a CC licence asks the poster to carry, and the
  // easiest way to honour it is to long-press and copy it into the caption.
  credit: {
    textAlign: "center",
    fontSize: 12,
    lineHeight: 12 * 1.5,
    color: alpha.bone70,
    paddingHorizontal: space.s3,
  },
  toastRow: { alignItems: "center", paddingBottom: space.s2 },
});
