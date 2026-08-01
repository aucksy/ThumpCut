/**
 * First launch.
 *
 * The beat ruler animating alone is the hero. No onboarding carousel, no sign-up, no
 * permission request before the user has any idea what the app does.
 */

import { StyleSheet, View } from "react-native";
import { colors, layout, palette, ruler } from "@thumpcut/design-tokens";
import { COPY } from "../copy.ts";
import { BeatRuler } from "../ui/BeatRuler.tsx";
import { Button } from "../ui/controls.tsx";
import { CenterMessage, Screen } from "../ui/chrome.tsx";
import { Body, Display } from "../ui/text.tsx";
import { Wordmark } from "../ui/Wordmark.tsx";
import { HERO_RULER } from "../ui/heroRuler.ts";

export type LaunchState = "default" | "downloading" | "offline" | "failed" | "storage";

export interface LaunchScreenProps {
  state?: LaunchState;
  /** Playhead position for the hero ruler, absolute seconds. */
  positionSec?: number;
  downloadProgress?: number;
  onGetStarted?: () => void;
  onRetry?: () => void;
}

export function LaunchScreen({
  state = "default",
  positionSec,
  downloadProgress = 0.42,
  onGetStarted,
  onRetry,
}: LaunchScreenProps) {
  const errorText =
    state === "offline"
      ? COPY.catalogue.offlineNoCache
      : state === "failed"
        ? COPY.catalogue.downloadFailed
        : state === "storage"
          ? COPY.catalogue.storageFull
          : null;

  return (
    <Screen testID="screen-launch">
      <View style={styles.wordmark}>
        <Wordmark />
      </View>

      {state === "default" ? (
        <>
          <View style={styles.hero}>
            <BeatRuler
              {...HERO_RULER}
              height={ruler.heightHero}
              positionSec={positionSec}
              testID="launch-ruler"
            />
            <Display size={31}>{COPY.launch.hero}</Display>
          </View>
          <View style={styles.footer}>
            <Button full onPress={onGetStarted} testID="launch-get-started">
              {COPY.launch.getStarted}
            </Button>
          </View>
        </>
      ) : null}

      {state === "downloading" ? (
        <View style={styles.downloading}>
          <BeatRuler {...HERO_RULER} height={ruler.heightHero} positionSec={positionSec} />
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.round(Math.min(1, Math.max(0, downloadProgress)) * 100)}%` },
              ]}
            />
          </View>
          <Body style={styles.downloadingText}>{COPY.launch.downloading}</Body>
        </View>
      ) : null}

      {errorText ? (
        <CenterMessage
          testID="launch-error"
          action={COPY.launch.retry}
          onAction={onRetry}
          hero={
            <View style={styles.errorHero}>
              <BeatRuler {...HERO_RULER} height={56} />
            </View>
          }
        >
          {errorText}
        </CenterMessage>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  wordmark: { paddingTop: 18, alignItems: "center" },
  hero: { flex: 1, justifyContent: "center", gap: 36, paddingHorizontal: 24 },
  footer: { paddingHorizontal: layout.screenPad, paddingBottom: 36 },
  downloading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 26,
    paddingHorizontal: 24,
  },
  progressTrack: {
    width: 160,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.borderHairline,
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 2, backgroundColor: palette.signal },
  downloadingText: { fontSize: 14, color: colors.textSecondary },
  errorHero: { width: "100%", opacity: 0.35 },
});
