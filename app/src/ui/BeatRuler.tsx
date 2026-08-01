/**
 * The beat ruler. The one thing ThumpCut is remembered by.
 *
 * It is not decoration — it is the product's data made visible. A short tick per beat, a
 * taller one per downbeat, a filled marker wherever the picture changes, tinted along its
 * length by the track's energy curve, with a playhead sweeping across during playback.
 *
 * **Video markers are teal, photo markers are bone.** At a glance you see the rhythm of stills
 * against motion — which is the differentiator, made legible.
 *
 * It carries a lot of weight in this app because no music plays during preview. The user hears
 * a click and watches this; between them they have to feel "locked to the track".
 *
 * Decorative: hidden from screen readers rather than described tick by tick.
 */

import { StyleSheet, View, type ViewStyle } from "react-native";
import {
  alpha,
  colors,
  energyColor,
  opacity,
  palette,
  ruler,
} from "@thumpcut/design-tokens";

export interface RulerMarker {
  atSec: number;
  kind: "photo" | "video";
}

export interface BeatRulerProps {
  /** Absolute beat times, in seconds. */
  beats: number[];
  /** Absolute downbeat times. A subset of `beats`. */
  downbeats?: number[];
  /** 0..1 per beat, same length as `beats`. */
  energy?: number[];
  /** Where the picture changes. */
  markers?: RulerMarker[];
  /** The window this ruler shows. */
  startSec: number;
  durationSec: number;
  /** Playhead position, absolute seconds. Omit for an idle ruler. */
  positionSec?: number;
  /** Reduced motion: the playhead still moves, the marker pulses stop. */
  reducedMotion?: boolean;
  /** The 4pt strip along the bottom of a template card. */
  compressed?: boolean;
  height?: number;
  style?: ViewStyle;
  testID?: string;
}

/** How close the playhead has to be to a marker for it to flash. */
const HIT_WINDOW_SEC = 0.09;
const PULSE_SCALE = 1.6;

export function BeatRuler({
  beats,
  downbeats = [],
  energy = [],
  markers = [],
  startSec,
  durationSec,
  positionSec,
  reducedMotion = false,
  compressed = false,
  height = ruler.height,
  style,
  testID,
}: BeatRulerProps) {
  const span = durationSec > 0 ? durationSec : 1;
  const downbeatSet = new Set(downbeats.map((value) => value.toFixed(3)));

  const visible: { index: number; atSec: number; left: number; isDownbeat: boolean }[] = [];
  for (const [index, atSec] of beats.entries()) {
    const left = ((atSec - startSec) / span) * 100;
    if (left < -1 || left > 101) continue;
    visible.push({ index, atSec, left, isDownbeat: downbeatSet.has(atSec.toFixed(3)) });
  }

  const markerAt = new Map<string, "photo" | "video">();
  for (const marker of markers) {
    markerAt.set(nearestKey(beats, marker.atSec), marker.kind);
  }

  if (compressed) {
    return (
      <View
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        testID={testID}
        style={[styles.compressed, style]}
      >
        {visible.map((beat) => {
          const kind = markerAt.get(beat.atSec.toFixed(3));
          return (
            <View
              key={beat.index}
              style={{
                flex: 1,
                height: kind ? "100%" : "50%",
                borderRadius: 1,
                marginHorizontal: 0.5,
                backgroundColor:
                  kind === "video"
                    ? palette.cool
                    : kind === "photo"
                      ? palette.bone
                      : energyColor(energy[beat.index] ?? 0.5),
                opacity: kind ? 1 : opacity.compressedIdle,
              }}
            />
          );
        })}
      </View>
    );
  }

  const beatTickHeight = Math.round(height * ruler.beatTickRatio);
  const downbeatTickHeight = Math.round(height * ruler.downbeatTickRatio);
  const markerBottom = downbeatTickHeight + Math.round(height * ruler.markerGapRatio);
  const playheadLeft =
    positionSec === undefined ? null : ((positionSec - startSec) / span) * 100;

  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      testID={testID}
      style={[{ height }, styles.root, style]}
    >
      <View style={styles.baseline} />

      {visible.map((beat) => {
        const kind = markerAt.get(beat.atSec.toFixed(3));
        const hit =
          !reducedMotion &&
          positionSec !== undefined &&
          Math.abs(positionSec - beat.atSec) <= HIT_WINDOW_SEC;
        return (
          <View key={beat.index} style={StyleSheet.absoluteFill} pointerEvents="none">
            <View
              style={{
                position: "absolute",
                bottom: 0,
                left: `${beat.left}%`,
                marginLeft: -ruler.beatTickWidth / 2,
                width: ruler.beatTickWidth,
                height: beat.isDownbeat ? downbeatTickHeight : beatTickHeight,
                borderRadius: 1,
                backgroundColor: energyColor(energy[beat.index] ?? 0.5),
                opacity: beat.isDownbeat ? opacity.downbeatTick : opacity.beatTick,
              }}
            />
            {kind ? (
              <View
                style={{
                  position: "absolute",
                  bottom: markerBottom,
                  left: `${beat.left}%`,
                  marginLeft: -(kind === "video" ? ruler.videoMarker.width : ruler.photoMarker.width) / 2,
                  width: kind === "video" ? ruler.videoMarker.width : ruler.photoMarker.width,
                  height: kind === "video" ? ruler.videoMarker.height : ruler.photoMarker.height,
                  borderRadius: kind === "video" ? ruler.videoMarker.radius : ruler.photoMarker.radius,
                  backgroundColor: kind === "video" ? palette.cool : palette.bone,
                  transform: [{ scale: hit ? PULSE_SCALE : 1 }],
                }}
              />
            ) : null}
          </View>
        );
      })}

      {playheadLeft !== null && playheadLeft >= -1 && playheadLeft <= 101 ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: -2,
            bottom: -2,
            left: `${playheadLeft}%`,
            marginLeft: -ruler.playheadWidth / 2,
            width: ruler.playheadWidth,
            borderRadius: 1,
            backgroundColor: palette.signal,
          }}
        />
      ) : null}
    </View>
  );
}

function nearestKey(beats: number[], atSec: number): string {
  let best = atSec;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const beat of beats) {
    const distance = Math.abs(beat - atSec);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = beat;
    }
  }
  return best.toFixed(3);
}

const styles = StyleSheet.create({
  root: { width: "100%", position: "relative" },
  baseline: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 1,
    backgroundColor: colors.borderHairline,
  },
  compressed: {
    flexDirection: "row",
    alignItems: "flex-end",
    height: ruler.compressedHeight,
    width: "100%",
  },
});

export const beatRulerColors = { idle: alpha.bone35 };
