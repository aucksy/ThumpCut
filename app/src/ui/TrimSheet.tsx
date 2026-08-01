/**
 * The clip trim sheet.
 *
 * Half-height bottom sheet, opened from a clip's duration badge. The teal in-point handle
 * opens already nudged into the clip — that quietly teaches the feature without a tooltip, a
 * coach mark or an onboarding carousel.
 */

import { useCallback, useRef, useState } from "react";
import {
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { Image } from "expo-image";
import {
  alpha,
  colors,
  fontFamily,
  layout,
  palette,
  radius,
  shadow,
  space,
} from "@thumpcut/design-tokens";
import { Body } from "./text.tsx";
import { Button } from "./controls.tsx";
import { PlayGlyph } from "./icons.tsx";
import { COPY, formatDuration, formatInPoint } from "../copy.ts";

export interface TrimSheetProps {
  posterUri?: string;
  /** Total clip length, in seconds. */
  durationSec: number;
  /** Current in-point, in seconds. */
  inPointSec: number;
  onChange: (inPointSec: number) => void;
  onDone: () => void;
  testID?: string;
}

/** An in-point is never allowed within this much of the end of the clip. */
const TAIL_GUARD_SEC = 0.1;
const FILMSTRIP_FRAMES = 8;

export function TrimSheet({
  posterUri,
  durationSec,
  inPointSec,
  onChange,
  onDone,
  testID,
}: TrimSheetProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const widthRef = useRef(0);
  const startRef = useRef(inPointSec);

  const maxIn = Math.max(0, durationSec - TAIL_GUARD_SEC);
  const fraction = maxIn > 0 ? Math.min(1, Math.max(0, inPointSec / durationSec)) : 0;

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    widthRef.current = width;
    setTrackWidth(width);
  }, []);

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startRef.current = inPointSec;
      },
      onPanResponderMove: (_event, gesture) => {
        const width = widthRef.current;
        if (width <= 0 || durationSec <= 0) return;
        const deltaSec = (gesture.dx / width) * durationSec;
        const next = Math.min(maxIn, Math.max(0, startRef.current + deltaSec));
        onChange(next);
      },
    }),
  ).current;

  return (
    <View testID={testID} style={styles.sheet}>
      <View style={styles.grabber} />

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
        <View style={styles.durationBadge}>
          <PlayGlyph />
          <Text style={styles.durationText}>{formatDuration(durationSec)}</Text>
        </View>
      </View>

      <View style={styles.filmstrip} onLayout={onLayout}>
        <View style={styles.frames}>
          {Array.from({ length: FILMSTRIP_FRAMES }, (_, index) => (
            <View key={index} style={styles.frame}>
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
          ))}
        </View>

        <View style={[styles.trimmedAway, { width: `${fraction * 100}%` }]} />

        <View
          accessibilityRole="adjustable"
          accessibilityLabel={COPY.a11y.clipStartPoint(formatInPoint(inPointSec))}
          accessibilityValue={{ min: 0, max: Math.round(maxIn * 10), now: Math.round(inPointSec * 10) }}
          style={[
            styles.handleTouch,
            { left: fraction * trackWidth - layout.tapMin / 2 },
          ]}
          {...responder.panHandlers}
        >
          <View style={styles.handleBar} />
          <View style={styles.handleGrip}>
            <View style={styles.handleGripLine} />
            <View style={styles.handleGripLine} />
          </View>
        </View>
      </View>

      <View style={styles.readings}>
        <Text style={styles.inPoint}>{formatInPoint(inPointSec)}</Text>
        <Text style={styles.total}>{formatDuration(durationSec)}</Text>
      </View>

      <Body style={styles.help}>{COPY.trim.help}</Body>

      <Button full onPress={onDone} style={styles.done}>
        {COPY.trim.done}
      </Button>
    </View>
  );
}

/** A tappable backdrop that closes the sheet. */
export function SheetBackdrop({ onPress }: { onPress: () => void }) {
  return (
    <Pressable accessibilityLabel="Close" style={styles.backdrop} onPress={onPress} />
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: colors.surfaceRaised,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    paddingTop: space.s2,
    paddingHorizontal: layout.screenPad,
    paddingBottom: 28,
    shadowColor: shadow.sheet.color,
    shadowOffset: { width: 0, height: shadow.sheet.offsetY },
    shadowRadius: shadow.sheet.radius,
    shadowOpacity: shadow.sheet.opacity,
    elevation: 12,
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderHairline,
    alignSelf: "center",
    marginBottom: space.s4,
  },
  preview: {
    aspectRatio: 16 / 9,
    borderRadius: radius.card,
    overflow: "hidden",
    backgroundColor: colors.surfaceMedia,
  },
  durationBadge: {
    position: "absolute",
    bottom: space.s2,
    right: space.s2,
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
  filmstrip: {
    height: 56,
    borderRadius: radius.chip,
    overflow: "hidden",
    marginTop: space.s4,
    position: "relative",
  },
  frames: { flexDirection: "row", height: "100%" },
  frame: {
    flex: 1,
    backgroundColor: colors.surfaceMedia,
    borderRightWidth: 1,
    borderRightColor: alpha.tileScrim,
    overflow: "hidden",
  },
  trimmedAway: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: alpha.tileScrim,
  },
  handleTouch: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: layout.tapMin,
    alignItems: "center",
    justifyContent: "center",
  },
  handleBar: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 3,
    borderRadius: 2,
    backgroundColor: palette.cool,
  },
  handleGrip: {
    width: 14,
    height: 26,
    borderRadius: radius.chip,
    backgroundColor: palette.cool,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  handleGripLine: {
    width: 1.5,
    height: 12,
    borderRadius: 2,
    backgroundColor: alpha.tileScrim,
  },
  readings: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginTop: space.s3,
  },
  inPoint: {
    fontFamily: fontFamily.data,
    fontSize: 13,
    color: palette.cool,
    fontVariant: ["tabular-nums"],
  },
  total: {
    fontFamily: fontFamily.data,
    fontSize: 12,
    color: colors.textSecondary,
    fontVariant: ["tabular-nums"],
  },
  help: { fontSize: 13, color: colors.textSecondary, marginTop: 6 },
  done: { marginTop: 18 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.surfaceScrim },
});
