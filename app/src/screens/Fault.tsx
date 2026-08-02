/**
 * The screen of last resort.
 *
 * This is not a feature. It exists because the first build handed to the owner closed the
 * instant it was opened, and an app that dies on a phone with no computer attached to it takes
 * its reason with it — Android's crash log needs a laptop and a cable to read.
 *
 * So when the app would otherwise disappear, it stops here and prints what went wrong in a
 * size a person can photograph. One screenshot replaces a whole round trip.
 *
 * It never appears in normal use. Everything it can catch would have been a closed app.
 */

import { ScrollView, StyleSheet, View } from "react-native";
import { colors, layout, radius, space } from "@thumpcut/design-tokens";
import { Body, Display, Mono } from "../ui/text.tsx";
import { Button } from "../ui/controls.tsx";
import { Screen } from "../ui/chrome.tsx";

export interface FaultScreenProps {
  /** What actually failed. Shown verbatim — this is the whole point of the screen. */
  error: Error;
  onRetry?: () => void;
}

export function FaultScreen({ error, onRetry }: FaultScreenProps) {
  const detail = [error.name, error.message].filter(Boolean).join(": ");
  const where = (error.stack ?? "")
    .split("\n")
    .slice(1, 5)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");

  return (
    <Screen testID="screen-fault">
      <View style={styles.body}>
        <Display size={19}>ThumpCut could not start.</Display>
        <Body style={styles.lead}>
          Take a screenshot of this and send it over. It says exactly what broke.
        </Body>

        <ScrollView style={styles.panel} contentContainerStyle={styles.panelInner}>
          <Mono size={13} style={styles.detail} testID="fault-detail">
            {detail || "No message was attached to the failure."}
          </Mono>
          {where ? (
            <Mono size={11} style={styles.where} testID="fault-where">
              {where}
            </Mono>
          ) : null}
        </ScrollView>

        {onRetry ? (
          <Button full variant="secondary" onPress={onRetry} testID="fault-retry">
            Try again
          </Button>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    paddingHorizontal: layout.screenPad,
    paddingTop: space.s6,
    paddingBottom: 34,
    gap: space.s3,
  },
  lead: { color: colors.textSecondary },
  panel: {
    flexGrow: 0,
    maxHeight: 360,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.card,
  },
  panelInner: { padding: space.s3, gap: space.s2 },
  detail: { color: colors.textPrimary },
  where: { color: colors.textSecondary },
});
