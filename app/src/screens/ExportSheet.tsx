/**
 * Export. A sheet, not a screen — the preview stays visible behind it, so the user can see
 * what is being made while it is being made.
 *
 * On completion it goes straight to Share. No success interstitial: a screen that exists only
 * to say "done" is a screen that wastes a tap.
 */

import { StyleSheet, View } from "react-native";
import { colors, radius, shadow } from "@thumpcut/design-tokens";
import { COPY, formatPercent } from "../copy.ts";
import type { RenderSnapshot } from "../render/orchestrator.ts";
import { Button } from "../ui/controls.tsx";
import { Body } from "../ui/text.tsx";
import { ProgressRing } from "../ui/ProgressRing.tsx";

export interface ExportSheetProps {
  snapshot: RenderSnapshot;
  onCancel?: () => void;
  onRetry?: () => void;
}

export function ExportSheet({ snapshot, onCancel, onRetry }: ExportSheetProps) {
  return (
    <View style={styles.wrapper} testID="screen-export">
      <View style={styles.scrim} />
      <View style={styles.sheet}>
        <View style={styles.grabber} />
        <View style={styles.body}>
          {snapshot.status === "Preparing" ? (
            <Body style={styles.dim}>{COPY.render.preparing}</Body>
          ) : null}

          {snapshot.status === "Rendering" || snapshot.status === "Validating" || snapshot.status === "Saving" ? (
            <>
              <ProgressRing
                fraction={snapshot.progress}
                label={formatPercent(snapshot.progress)}
                accessibilityLabel={COPY.a11y.exportProgress(Math.round(snapshot.progress * 100))}
              />
              <Body style={styles.text}>{COPY.render.rendering}</Body>
              <Button variant="destructive" small onPress={onCancel} testID="export-cancel">
                {COPY.render.cancel}
              </Button>
            </>
          ) : null}

          {snapshot.status === "Failed" && snapshot.error ? (
            <>
              <Body style={styles.text} testID="export-error">
                {snapshot.error}
              </Body>
              {snapshot.canRetry ? (
                <Button variant="secondary" small onPress={onRetry} testID="export-retry">
                  {COPY.render.retry}
                </Button>
              ) : null}
            </>
          ) : null}
        </View>
      </View>
    </View>
  );
}

/** A percentage, in mono, is the only reading this sheet needs. */
export function exportPercentLabel(snapshot: RenderSnapshot): string {
  return formatPercent(snapshot.progress);
}

const styles = StyleSheet.create({
  wrapper: { ...StyleSheet.absoluteFillObject, justifyContent: "flex-end" },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.surfaceScrim },
  sheet: {
    backgroundColor: colors.surfaceRaised,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    paddingTop: 10,
    paddingHorizontal: 24,
    paddingBottom: 40,
    shadowColor: shadow.sheet.color,
    shadowOffset: { width: 0, height: shadow.sheet.offsetY },
    shadowRadius: shadow.sheet.radius,
    shadowOpacity: shadow.sheet.opacity,
    elevation: 12,
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderHairline,
    alignSelf: "center",
    marginBottom: 24,
  },
  body: { alignItems: "center", gap: 18, minHeight: 150, justifyContent: "center" },
  text: { textAlign: "center", maxWidth: 300, lineHeight: 15 * 1.55 },
  dim: { textAlign: "center", color: colors.textSecondary, maxWidth: 300 },
});
