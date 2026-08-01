/**
 * A tile in the picker.
 *
 * A clip is never "a photo with a play icon on it". Video tiles carry a teal border, a play
 * glyph and their length in mono; photos carry none of that. The difference has to be obvious
 * at a glance, and it has to survive colour blindness — which is why the teal is always
 * accompanied by the glyph and the duration, never used alone.
 *
 * The order badge doubles as the selection state: an empty ring when unpicked, a filled teal
 * badge with the pick number when picked.
 */

import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import {
  alpha,
  border,
  colors,
  fontFamily,
  layout,
  palette,
  radius,
  opacity as tokenOpacity,
} from "@thumpcut/design-tokens";
import { PlayGlyph, WarningGlyph } from "./icons.tsx";

export interface MediaTileProps {
  uri?: string;
  kind: "photo" | "video";
  /** Mono clip length, e.g. "0:12". Videos only. */
  duration?: string;
  /** Pick order, shown when selected. */
  order?: number | null;
  selected?: boolean;
  /** The video cap has been reached, so this clip cannot be picked. */
  dimmed?: boolean;
  /** Failed to download or could not be read. */
  unavailable?: boolean;
  accessibilityLabel: string;
  onPress?: () => void;
  onPressDuration?: () => void;
  style?: ViewStyle;
  testID?: string;
}

export function MediaTile({
  uri,
  kind,
  duration,
  order = null,
  selected = false,
  dimmed = false,
  unavailable = false,
  accessibilityLabel,
  onPress,
  onPressDuration,
  style,
  testID,
}: MediaTileProps) {
  const borderStyle =
    kind === "video"
      ? {
          borderWidth: border.emphasis,
          borderColor: dimmed ? alpha.cool30 : selected ? palette.cool : alpha.cool50,
        }
      : selected
        ? { borderWidth: border.emphasis, borderColor: alpha.bone35 }
        : { borderWidth: border.hairline, borderColor: colors.borderFaint };

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected, disabled: dimmed }}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      onPress={onPress}
      style={[styles.tile, borderStyle, dimmed ? styles.dimmed : null, style]}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          accessible={false}
          transition={0}
        />
      ) : null}

      {unavailable ? <View style={styles.veil} /> : null}

      <View style={[styles.orderBadge, selected ? styles.orderBadgeOn : styles.orderBadgeOff]}>
        {selected && order ? <Text style={styles.orderText}>{order}</Text> : null}
      </View>

      {kind === "video" && !unavailable ? (
        // The badge is small because it sits on a thumbnail. What you press is 44pt square,
        // anchored to the bottom-right corner — the badge is the visible part of a much
        // bigger target.
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Trim clip, ${duration ?? ""}`}
          onPress={onPressDuration}
          style={styles.durationTouch}
        >
          <View style={styles.durationBadge}>
            <PlayGlyph />
            <Text style={styles.durationText}>{duration}</Text>
          </View>
        </Pressable>
      ) : null}

      {unavailable ? (
        <View style={styles.warningBadge}>
          <WarningGlyph />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    position: "relative",
    borderRadius: radius.card,
    overflow: "hidden",
    backgroundColor: colors.surfaceRaised,
    aspectRatio: 1,
  },
  dimmed: { opacity: tokenOpacity.dimmed },
  veil: { ...StyleSheet.absoluteFillObject, backgroundColor: alpha.tileVeil },
  orderBadge: {
    position: "absolute",
    top: 7,
    left: 7,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    borderRadius: radius.chip,
    alignItems: "center",
    justifyContent: "center",
  },
  orderBadgeOn: { backgroundColor: palette.cool },
  orderBadgeOff: {
    backgroundColor: alpha.tileScrimLight,
    borderWidth: border.emphasis,
    borderColor: alpha.bone35,
  },
  orderText: {
    fontFamily: fontFamily.data,
    fontSize: 11,
    color: palette.graphite,
    fontVariant: ["tabular-nums"],
  },
  durationTouch: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: layout.tapMin,
    height: layout.tapMin,
    alignItems: "flex-end",
    justifyContent: "flex-end",
    paddingRight: 6,
    paddingBottom: 6,
  },
  durationBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: alpha.tileScrim,
    borderRadius: radius.chip,
    paddingVertical: 2,
    paddingLeft: 5,
    paddingRight: 6,
  },
  durationText: {
    fontFamily: fontFamily.data,
    fontSize: 11,
    color: palette.bone,
    fontVariant: ["tabular-nums"],
  },
  warningBadge: {
    position: "absolute",
    top: 7,
    right: 7,
    width: 20,
    height: 20,
    borderRadius: radius.chip,
    backgroundColor: alpha.tileScrim,
    alignItems: "center",
    justifyContent: "center",
  },
});
