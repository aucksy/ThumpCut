/**
 * Buttons and chips.
 *
 * The primary button is the only filled control on a screen. If two things on a screen are
 * shouting, neither is.
 */

import type { ReactNode } from "react";
import { useCallback, useRef } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import {
  alpha,
  colors,
  fontFamily,
  layout,
  letterSpacing,
  motion,
  palette,
  radius,
} from "@thumpcut/design-tokens";

export type ButtonVariant = "primary" | "secondary" | "destructive" | "ghost";

interface ButtonProps {
  children: ReactNode;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  full?: boolean;
  small?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
  testID?: string;
}

export function Button({
  children,
  onPress,
  variant = "primary",
  disabled = false,
  full = false,
  small = false,
  style,
  accessibilityLabel,
  testID,
}: ButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;

  // Everything springs. A linear ease on a press reads as software; a spring reads as a control.
  const press = useCallback(
    (to: number) => {
      Animated.spring(scale, {
        toValue: to,
        useNativeDriver: true,
        damping: motion.spring.damping,
        stiffness: motion.spring.stiffness,
        mass: motion.spring.mass,
      }).start();
    },
    [scale],
  );

  const variantStyle = disabled && variant === "primary" ? styles.primaryDisabled : styles[variant];
  const labelStyle = disabled
    ? variant === "primary"
      ? styles.labelPrimaryDisabled
      : styles.labelDisabled
    : styles[`${variant}Label` as const];

  return (
    <Animated.View style={[full ? styles.full : undefined, { transform: [{ scale }] }, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        accessibilityLabel={accessibilityLabel}
        testID={testID}
        disabled={disabled}
        onPress={onPress}
        onPressIn={() => press(motion.pressScale)}
        onPressOut={() => press(1)}
        style={[styles.base, small ? styles.small : styles.regular, variantStyle]}
      >
        <Text
          numberOfLines={2}
          style={[styles.label, small ? styles.labelSmall : null, labelStyle]}
        >
          {children}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

interface ChipProps {
  children: ReactNode;
  selected?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
  testID?: string;
}

/**
 * Mood filter. Selected is teal, because teal means "you chose this".
 *
 * The chip *looks* 36pt tall, which is what the design system specifies, but the thing you
 * press is 44pt — the minimum tap target. Those two numbers are allowed to differ, and on a
 * phone held one-handed the difference is the whole reason the filter feels reliable.
 */
export function Chip({ children, selected = false, onPress, style, testID }: ChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={styles.chipTouch}
      testID={testID}
    >
      <View style={[styles.chip, selected ? styles.chipSelected : styles.chipIdle, style]}>
        <Text style={[styles.chipLabel, selected ? styles.chipLabelSelected : null]}>
          {children}
        </Text>
      </View>
    </Pressable>
  );
}

/** A hairline divider with a section label beside it. */
export function DividerLabel({ children }: { children: ReactNode }) {
  return (
    <View style={styles.dividerRow}>
      {children}
      <View style={styles.dividerLine} />
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.card,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "transparent",
  },
  // A minimum, not a fixed height: at a large system font size the label grows, and a button
  // that gets taller is right where one that clips its own word is not.
  regular: { minHeight: layout.buttonHeight },
  small: { minHeight: layout.buttonHeightSmall },
  full: { width: "100%" },

  primary: { backgroundColor: palette.bone },
  primaryDisabled: { backgroundColor: alpha.bone12 },
  secondary: { backgroundColor: "transparent", borderColor: alpha.bone35 },
  destructive: { backgroundColor: "transparent" },
  ghost: { backgroundColor: "transparent" },

  label: {
    fontFamily: fontFamily.body,
    fontSize: 16,
    letterSpacing: 16 * letterSpacing.body,
    textAlign: "center",
    flexShrink: 1,
  },
  labelSmall: { fontSize: 14 },
  primaryLabel: { color: palette.graphite },
  secondaryLabel: { color: palette.bone },
  destructiveLabel: { color: colors.dangerText },
  ghostLabel: { color: alpha.bone55 },
  labelPrimaryDisabled: { color: alpha.bone35 },
  labelDisabled: { color: alpha.bone35 },

  chipTouch: { height: layout.tapMin, justifyContent: "center" },
  chip: {
    height: layout.chipHeight,
    paddingHorizontal: 14,
    borderRadius: radius.chip,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  chipIdle: { backgroundColor: "transparent", borderColor: alpha.bone12 },
  chipSelected: { backgroundColor: alpha.cool12, borderColor: palette.cool },
  chipLabel: { fontFamily: fontFamily.body, fontSize: 13, color: alpha.bone70 },
  chipLabelSelected: { color: palette.cool },

  dividerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.borderHairline },
});
