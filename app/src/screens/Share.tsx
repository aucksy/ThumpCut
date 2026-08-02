/**
 * Share.
 *
 * When Instagram is not installed the button is **absent**, not greyed out. A disabled button
 * is a promise the app cannot keep and the user has no way to understand.
 *
 * The line underneath — "Pick your track in Instagram — you'll get the full library." — does
 * real work. It sets the expectation for the one manual step and reframes a limitation as an
 * advantage. It is also the payoff for the metronome preview: the user has been watching cuts
 * land on clicks, and this is where the actual song arrives. It gets presence, not a footnote.
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
  onSave,
  onOpenSettings,
}: ShareScreenProps) {
  const fileGone = snapshot.videoUri === null;
  const needsSettings = snapshot.message === COPY.share.savePermissionDenied;

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
            {snapshot.instagramAvailable ? (
              <Button full onPress={onShare} testID="share-instagram">
                {COPY.share.shareToInstagram}
              </Button>
            ) : null}
            <Button
              full
              variant={snapshot.instagramAvailable ? "secondary" : "primary"}
              onPress={onSave}
              testID="share-save"
            >
              {COPY.share.saveToGallery}
            </Button>
            <Body style={styles.pickTrack} testID="share-pick-track">
              {COPY.share.pickYourTrack}
            </Body>
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
  toastRow: { alignItems: "center", paddingBottom: space.s2 },
});
