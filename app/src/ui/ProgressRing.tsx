/**
 * A circular progress ring, built from two rotated half-discs.
 *
 * No SVG dependency: the app has to run on a mid-range phone, and one ring is not worth a
 * library. Two clipped halves and a rotation is the classic way to do it and it composites on
 * the GPU.
 *
 * The percentage inside is mono, like every number in this product.
 */

import { StyleSheet, View } from "react-native";
import { colors, palette } from "@thumpcut/design-tokens";
import { Mono } from "./text.tsx";

export interface ProgressRingProps {
  /** 0..1. */
  fraction: number;
  label: string;
  accessibilityLabel?: string;
  size?: number;
  thickness?: number;
  testID?: string;
}

export function ProgressRing({
  fraction,
  label,
  accessibilityLabel,
  size = 100,
  thickness = 5,
  testID,
}: ProgressRingProps) {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0));
  const degrees = clamped * 360;
  const half = size / 2;

  const ringStyle = {
    width: size,
    height: size,
    borderRadius: half,
    borderWidth: thickness,
  } as const;

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      testID={testID}
      style={[styles.root, { width: size, height: size }]}
    >
      <View style={[ringStyle, styles.track]} />

      {/* Right half fills first, from 12 o'clock to 6. */}
      <View style={[styles.clip, { width: half, height: size, left: half }]}>
        <View
          style={[
            ringStyle,
            styles.arc,
            { marginLeft: -half, transform: [{ rotate: `${Math.min(180, degrees) - 180}deg` }] },
          ]}
        />
      </View>

      {/* Left half only starts once the right one is complete. */}
      {degrees > 180 ? (
        <View style={[styles.clip, { width: half, height: size, left: 0 }]}>
          <View
            style={[
              ringStyle,
              styles.arc,
              { transform: [{ rotate: `${degrees - 360}deg` }] },
            ]}
          />
        </View>
      ) : null}

      <View style={styles.centre}>
        <Mono size={18}>{label}</Mono>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: "center", justifyContent: "center" },
  track: { position: "absolute", borderColor: colors.borderHairline },
  clip: { position: "absolute", top: 0, overflow: "hidden" },
  arc: {
    position: "absolute",
    borderColor: "transparent",
    borderTopColor: palette.signal,
    borderRightColor: palette.signal,
  },
  centre: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
});
