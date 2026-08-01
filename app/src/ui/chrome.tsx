/**
 * Screen furniture: the frame, the top bar, the centred message block.
 *
 * There is no tab bar anywhere in this app. It is one flow, not four sections.
 */

import type { ReactNode } from "react";
import { Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { alpha, colors, layout, space } from "@thumpcut/design-tokens";
import { Body } from "./text.tsx";
import { ChevronLeft } from "./icons.tsx";
import { Button } from "./controls.tsx";
import { COPY } from "../copy.ts";

export function Screen({
  children,
  style,
  testID,
}: {
  children: ReactNode;
  style?: ViewStyle;
  testID?: string;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      testID={testID}
      style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }, style]}
    >
      {children}
    </View>
  );
}

export function TopBar({
  onBack,
  center,
  right,
}: {
  onBack?: () => void;
  center?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <View style={styles.topBar}>
      <View style={styles.topBarSide}>
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={COPY.a11y.back}
            onPress={onBack}
            style={styles.iconButton}
            hitSlop={8}
          >
            <ChevronLeft size={16} />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.topBarCentre}>{center}</View>
      <View style={[styles.topBarSide, styles.topBarRight]}>{right}</View>
    </View>
  );
}

/** A centred block of text with an optional action. Used by every empty and error state. */
export function CenterMessage({
  children,
  hero,
  action,
  onAction,
  actionVariant = "secondary",
  testID,
}: {
  children: ReactNode;
  hero?: ReactNode;
  action?: string;
  onAction?: () => void;
  actionVariant?: "primary" | "secondary";
  testID?: string;
}) {
  return (
    <View testID={testID} style={styles.centre}>
      {hero}
      <Body style={styles.centreText}>{children}</Body>
      {action ? (
        <Button variant={actionVariant} small onPress={onAction}>
          {action}
        </Button>
      ) : null}
    </View>
  );
}

/** A full-bleed scrim, used behind sheets. */
export function Scrim({ style }: { style?: ViewStyle }) {
  return <View pointerEvents="none" style={[styles.scrim, style]} />;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bgApp,
    position: "relative",
  },
  topBar: {
    height: layout.topBarHeight,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: layout.screenPad,
    gap: space.s3,
  },
  topBarSide: { width: 32, flexDirection: "row", flexShrink: 0 },
  topBarRight: { justifyContent: "flex-end" },
  // Clipped rather than allowed to push the back button off the screen at large font sizes.
  topBarCentre: { flex: 1, flexShrink: 1, alignItems: "center", overflow: "hidden" },
  iconButton: {
    width: layout.tapMin,
    height: layout.tapMin,
    marginLeft: -10,
    alignItems: "center",
    justifyContent: "center",
  },
  centre: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space.s5,
    paddingHorizontal: 44,
  },
  centreText: {
    textAlign: "center",
    lineHeight: 15 * 1.55,
    color: alpha.bone70,
  },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.surfaceScrim },
});
