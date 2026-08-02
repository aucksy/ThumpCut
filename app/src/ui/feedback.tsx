/**
 * Toasts, inline hints and the track substitution notice.
 *
 * All three state what happened and what to do. No apology, no vagueness, no "Oops."
 */

import type { ReactNode } from "react";
import { StyleSheet, View, type TextStyle, type ViewStyle } from "react-native";
import { alpha, colors, fontFamily, radius, shadow, space } from "@thumpcut/design-tokens";
import { Body } from "./text.tsx";
import { SwapGlyph, WarningGlyph } from "./icons.tsx";

/** A transient message near the bottom of the screen. */
export function Toast({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.toast, style]}>
      <Body style={styles.toastText}>{children}</Body>
    </View>
  );
}

/** Quiet guidance under a control. `danger` only for over-limit copy. */
export function InlineHint({
  children,
  tone = "neutral",
  style,
  testID,
}: {
  children: ReactNode;
  tone?: "neutral" | "danger";
  style?: TextStyle;
  testID?: string;
}) {
  return (
    <Body
      testID={testID}
      style={
        tone === "danger"
          ? [styles.hint, styles.hintDanger, style ?? styles.none]
          : [styles.hint, style ?? styles.none]
      }
    >
      {children}
    </Body>
  );
}

/**
 * The quiet treatment for something that happened to the track — it was swapped, or its
 * recording would not load. The user's work is not lost, and the tone has to say so: this is a
 * notice, not an error.
 *
 * `swap` for a substitution, `warn` for something that could not be done. Nothing else is
 * offered, because a notice with a third meaning would be an error message in disguise.
 */
export function TrackNotice({
  children,
  glyph = "swap",
  style,
  testID,
}: {
  children: ReactNode;
  glyph?: "swap" | "warn";
  style?: ViewStyle;
  testID?: string;
}) {
  return (
    <View
      testID={testID}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.notice, style]}
    >
      {glyph === "warn" ? (
        <WarningGlyph size={14} style={styles.noticeIcon} />
      ) : (
        <SwapGlyph style={styles.noticeIcon} />
      )}
      <Body style={styles.noticeText}>{children}</Body>
    </View>
  );
}

const styles = StyleSheet.create({
  toast: {
    maxWidth: 340,
    backgroundColor: colors.surfaceFloat,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.borderFaint,
    paddingVertical: space.s3,
    paddingHorizontal: space.s4,
    shadowColor: shadow.toast.color,
    shadowOffset: { width: 0, height: shadow.toast.offsetY },
    shadowRadius: shadow.toast.radius,
    shadowOpacity: shadow.toast.opacity,
    elevation: 8,
  },
  toastText: { fontSize: 14, lineHeight: 14 * 1.45 },
  hint: { fontFamily: fontFamily.body, fontSize: 13, color: alpha.bone55 },
  hintDanger: { color: colors.dangerText },
  none: {},
  notice: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.borderFaint,
    paddingVertical: space.s3,
    paddingHorizontal: 14,
  },
  noticeIcon: { marginTop: 1 },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 13 * 1.5, color: alpha.bone70 },
});
