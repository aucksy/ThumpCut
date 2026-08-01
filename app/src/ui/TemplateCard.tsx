/**
 * A template card. The gallery is the shop window, so this must never show a spinner.
 *
 * When a preview video has not been cached yet the card shows its first frame as a still. If
 * there is not even a still, it shows the panel colour — **never an empty box, never a
 * shimmer**. A loader implies something is being waited for, and nothing is.
 */

import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import {
  border,
  colors,
  fontFamily,
  letterSpacing,
  palette,
  radius,
  space,
} from "@thumpcut/design-tokens";
import { BeatRuler, type RulerMarker } from "./BeatRuler.tsx";

export interface TemplateCardProps {
  name: string;
  /** `128 BPM · 8–16 items`, already formatted. */
  meta: string;
  posterUri?: string;
  selected?: boolean;
  /** The compressed ruler along the bottom. */
  beats: number[];
  downbeats?: number[];
  energy?: number[];
  markers?: RulerMarker[];
  startSec: number;
  durationSec: number;
  onPress?: () => void;
  accessibilityLabel: string;
  style?: ViewStyle;
  testID?: string;
}

export function TemplateCard({
  name,
  meta,
  posterUri,
  selected = false,
  beats,
  downbeats,
  energy,
  markers,
  startSec,
  durationSec,
  onPress,
  accessibilityLabel,
  style,
  testID,
}: TemplateCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      testID={testID}
      onPress={onPress}
      style={[styles.card, selected ? styles.cardSelected : styles.cardIdle, style]}
    >
      <View style={styles.preview}>
        {posterUri ? (
          <Image
            source={{ uri: posterUri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            accessible={false}
            transition={0}
          />
        ) : null}
      </View>
      <View style={styles.meta}>
        <Text numberOfLines={1} style={styles.name}>
          {name}
        </Text>
        <Text numberOfLines={1} style={styles.metaLine}>
          {meta}
        </Text>
      </View>
      <BeatRuler
        compressed
        beats={beats}
        downbeats={downbeats}
        energy={energy}
        markers={markers}
        startSec={startSec}
        durationSec={durationSec}
        style={styles.ruler}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.card,
    overflow: "hidden",
    backgroundColor: colors.surfaceRaised,
    flex: 1,
  },
  cardIdle: { borderWidth: border.hairline, borderColor: colors.borderFaint },
  cardSelected: { borderWidth: border.selected, borderColor: palette.cool },
  preview: { aspectRatio: 9 / 13, backgroundColor: colors.surfaceMedia },
  meta: { paddingHorizontal: space.s3, paddingTop: 10 },
  name: {
    fontFamily: fontFamily.display,
    fontSize: 16,
    lineHeight: 16 * 1.15,
    letterSpacing: 16 * letterSpacing.display,
    color: palette.bone,
  },
  metaLine: {
    fontFamily: fontFamily.data,
    fontSize: 10.5,
    color: colors.textSecondary,
    marginTop: 3,
    fontVariant: ["tabular-nums"],
  },
  ruler: { marginTop: 9, marginBottom: 0 },
});
