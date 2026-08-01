/**
 * The three type voices, and they are never mixed.
 *
 * Display  Archivo, heavy and condensed. Screen titles and template names. Sparingly.
 * Body     Public Sans. Regular and medium only.
 * Mono     JetBrains Mono. **Every number in the product** — BPM, durations, clip lengths,
 *          trim points, counts, progress. Tabular figures, always.
 *
 * Mono-for-numbers is the strongest typographic signal the design has, and video earns it:
 * `0:04.2` clip lengths and trim positions appear constantly.
 */

import type { ReactNode } from "react";
import { StyleSheet, Text, type TextProps, type TextStyle } from "react-native";
import {
  alpha,
  colors,
  fontFamily,
  fontSize,
  letterSpacing,
  lineHeight,
} from "@thumpcut/design-tokens";

interface TypeProps extends TextProps {
  children?: ReactNode;
  style?: TextStyle | TextStyle[];
}

const styles = StyleSheet.create({
  display: {
    fontFamily: fontFamily.display,
    fontSize: fontSize.displayLg,
    lineHeight: fontSize.displayLg * lineHeight.display,
    letterSpacing: fontSize.displayLg * letterSpacing.display,
    color: colors.textPrimary,
  },
  body: {
    fontFamily: fontFamily.body,
    fontSize: fontSize.body,
    lineHeight: fontSize.body * lineHeight.body,
    color: colors.textPrimary,
  },
  mono: {
    fontFamily: fontFamily.data,
    fontSize: fontSize.data,
    color: colors.textPrimary,
    fontVariant: ["tabular-nums"],
  },
  label: {
    fontFamily: fontFamily.body,
    fontSize: fontSize.label,
    letterSpacing: fontSize.label * letterSpacing.label,
    textTransform: "uppercase",
    color: alpha.bone55,
  },
});

/** Screen titles and template names. Sentence case, tight tracking. */
export function Display({ children, style, size, ...rest }: TypeProps & { size?: number }) {
  const scaled: TextStyle | undefined =
    size === undefined
      ? undefined
      : {
          fontSize: size,
          lineHeight: size * lineHeight.display,
          letterSpacing: size * letterSpacing.display,
        };
  return (
    <Text {...rest} style={[styles.display, scaled, style]}>
      {children}
    </Text>
  );
}

/** Everything a person reads as prose. */
export function Body({ children, style, ...rest }: TypeProps) {
  return (
    <Text {...rest} style={[styles.body, style]}>
      {children}
    </Text>
  );
}

/** Every number. If it is a reading, it is set in this. */
export function Mono({ children, style, size, ...rest }: TypeProps & { size?: number }) {
  return (
    <Text {...rest} style={[styles.mono, size === undefined ? undefined : { fontSize: size }, style]}>
      {children}
    </Text>
  );
}

/** Section labels: small, uppercase, letterspaced wide, bone at 55%. */
export function Label({ children, style, ...rest }: TypeProps) {
  return (
    <Text {...rest} style={[styles.label, style]}>
      {children}
    </Text>
  );
}

export const textStyles = styles;
