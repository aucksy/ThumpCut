/**
 * Settings. Almost empty, and the emptiness is the message: this app collects nothing and
 * wants nothing. No account, no upsell, no rate-us prompt, no notification toggles.
 */

import { Pressable, StyleSheet, View } from "react-native";
import { colors, layout, radius, space } from "@thumpcut/design-tokens";
import { COPY } from "../copy.ts";
import { Screen, TopBar } from "../ui/chrome.tsx";
import { ChevronRight } from "../ui/icons.tsx";
import { Body, Display, Mono } from "../ui/text.tsx";

export interface SettingsScreenProps {
  /** Already formatted, e.g. `1080p`. */
  exportQuality: string;
  /** Already formatted, e.g. `ThumpCut 1.0.0 (214)`. */
  version: string;
  onBack?: () => void;
  onExportQuality?: () => void;
  onPrivacyPolicy?: () => void;
}

export function SettingsScreen({
  exportQuality,
  version,
  onBack,
  onExportQuality,
  onPrivacyPolicy,
}: SettingsScreenProps) {
  return (
    <Screen testID="screen-settings">
      <TopBar onBack={onBack} center={<Display size={17}>{COPY.settings.title}</Display>} />

      <View style={styles.body}>
        <View style={styles.card}>
          <Pressable
            accessibilityRole="button"
            onPress={onExportQuality}
            style={styles.row}
            testID="settings-quality"
          >
            <Body>{COPY.settings.exportQuality}</Body>
            <View style={styles.rowRight}>
              <Mono style={styles.value}>{exportQuality}</Mono>
              <ChevronRight />
            </View>
          </Pressable>

          <View style={styles.hairline} />

          <Pressable
            accessibilityRole="link"
            onPress={onPrivacyPolicy}
            style={styles.row}
            testID="settings-privacy"
          >
            <Body>{COPY.settings.privacyPolicy}</Body>
            <ChevronRight />
          </Pressable>
        </View>

        <View style={styles.versionRow}>
          <Mono size={12} style={styles.version}>
            {version}
          </Mono>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: layout.screenPad, paddingTop: 10 },
  card: { backgroundColor: colors.surfaceRaised, borderRadius: radius.card, overflow: "hidden" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: layout.screenPad - 4,
    minHeight: layout.tapMin + 6,
  },
  rowRight: { flexDirection: "row", alignItems: "center", gap: space.s2 },
  value: { color: colors.textSecondary },
  hairline: { height: 1, backgroundColor: colors.borderFaint, marginHorizontal: layout.screenPad - 4 },
  versionRow: { alignItems: "center", marginTop: 28 },
  version: { color: colors.textSecondary },
});
