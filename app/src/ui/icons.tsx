/**
 * Icons, drawn from plain views.
 *
 * There is no icon font and no SVG dependency here on purpose: the app has to run on a
 * mid-range phone with 2GB of RAM, and six shapes are not worth a library. Strokes are
 * 1.5–1.8px with round ends, matching the design system's inline SVGs.
 *
 * Bone at 70% for anything interactive, 55% for anything passive. Never a colour that would
 * make an icon look like a status.
 */

import { StyleSheet, View, type ViewStyle } from "react-native";
import { alpha, colors, palette } from "@thumpcut/design-tokens";

interface IconProps {
  size?: number;
  color?: string;
  style?: ViewStyle;
}

/** Back. A chevron, drawn as a rotated square with two of its borders. */
export function ChevronLeft({ size = 14, color = colors.textPrimary, style }: IconProps) {
  return (
    <View style={[{ width: size, height: size, justifyContent: "center" }, style]}>
      <View
        style={{
          width: size * 0.62,
          height: size * 0.62,
          borderLeftWidth: 2,
          borderBottomWidth: 2,
          borderColor: color,
          transform: [{ rotate: "45deg" }],
          marginLeft: size * 0.18,
        }}
      />
    </View>
  );
}

/** Disclosure. The same chevron, pointing the other way. */
export function ChevronRight({ size = 12, color = alpha.bone35, style }: IconProps) {
  return (
    <View style={[{ width: size, height: size, justifyContent: "center" }, style]}>
      <View
        style={{
          width: size * 0.55,
          height: size * 0.55,
          borderRightWidth: 1.6,
          borderTopWidth: 1.6,
          borderColor: color,
          transform: [{ rotate: "45deg" }],
          marginLeft: size * 0.1,
        }}
      />
    </View>
  );
}

/** Play. A triangle from a border trick — no path, no library. */
export function PlayGlyph({ size = 9, color = palette.cool, style }: IconProps) {
  return (
    <View
      style={[
        {
          width: 0,
          height: 0,
          borderTopWidth: size / 2,
          borderBottomWidth: size / 2,
          borderLeftWidth: size * 0.8,
          borderTopColor: "transparent",
          borderBottomColor: "transparent",
          borderLeftColor: color,
        },
        style,
      ]}
    />
  );
}

/** Plus. Two bars. */
export function PlusGlyph({ size = 14, color = palette.cool, style }: IconProps) {
  return (
    <View style={[{ width: size, height: size, alignItems: "center", justifyContent: "center" }, style]}>
      <View style={{ position: "absolute", width: size, height: 1.8, borderRadius: 2, backgroundColor: color }} />
      <View style={{ position: "absolute", width: 1.8, height: size, borderRadius: 2, backgroundColor: color }} />
    </View>
  );
}

/** Warning. An outlined triangle with a bang, for a tile that could not be used. */
export function WarningGlyph({ size = 12, color = alpha.bone70, style }: IconProps) {
  return (
    <View style={[{ width: size, height: size, alignItems: "center", justifyContent: "flex-end" }, style]}>
      <View
        style={{
          width: 0,
          height: 0,
          borderLeftWidth: size / 2,
          borderRightWidth: size / 2,
          borderBottomWidth: size * 0.86,
          borderLeftColor: "transparent",
          borderRightColor: "transparent",
          borderBottomColor: color,
        }}
      />
      <View
        style={{
          position: "absolute",
          bottom: size * 0.16,
          width: 1.4,
          height: size * 0.34,
          borderRadius: 2,
          backgroundColor: palette.graphite,
        }}
      />
      <View
        style={{
          position: "absolute",
          bottom: size * 0.06,
          width: 1.6,
          height: 1.6,
          borderRadius: 2,
          backgroundColor: palette.graphite,
        }}
      />
    </View>
  );
}

/**
 * Settings. A ring with eight teeth — the one shape that genuinely needed a path, rebuilt
 * from views so the app carries no icon library at all.
 */
export function GearGlyph({ size = 19, color = alpha.bone70, style }: IconProps) {
  const teeth = [0, 45, 90, 135, 180, 225, 270, 315];
  const ring = size * 0.42;
  return (
    <View style={[{ width: size, height: size, alignItems: "center", justifyContent: "center" }, style]}>
      {teeth.map((angle) => (
        <View
          key={angle}
          style={{
            position: "absolute",
            width: 1.6,
            height: size * 0.94,
            borderRadius: 2,
            backgroundColor: color,
            transform: [{ rotate: `${angle}deg` }],
          }}
        />
      ))}
      <View
        style={{
          position: "absolute",
          width: ring * 2,
          height: ring * 2,
          borderRadius: ring,
          backgroundColor: colors.bgApp,
        }}
      />
      <View
        style={{
          position: "absolute",
          width: size * 0.34,
          height: size * 0.34,
          borderRadius: size * 0.17,
          borderWidth: 1.6,
          borderColor: color,
        }}
      />
    </View>
  );
}

/** Swap. Two arcs, for the quiet notice that a track was substituted. */
export function SwapGlyph({ size = 16, color = alpha.bone55, style }: IconProps) {
  return (
    <View style={[{ width: size, height: size, alignItems: "center", justifyContent: "center" }, style]}>
      <View
        style={{
          width: size * 0.78,
          height: size * 0.78,
          borderRadius: size * 0.39,
          borderWidth: 1.5,
          borderColor: color,
          borderRightColor: "transparent",
          transform: [{ rotate: "45deg" }],
        }}
      />
      <View
        style={{
          position: "absolute",
          top: 0,
          right: size * 0.1,
          width: size * 0.3,
          height: 1.5,
          backgroundColor: color,
          borderRadius: 2,
        }}
      />
      <View
        style={{
          position: "absolute",
          bottom: 0,
          left: size * 0.1,
          width: size * 0.3,
          height: 1.5,
          backgroundColor: color,
          borderRadius: 2,
        }}
      />
    </View>
  );
}

export const iconStyles = StyleSheet.create({
  hitSlop: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
});
