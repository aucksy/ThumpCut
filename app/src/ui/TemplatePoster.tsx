/**
 * The generated face of a template card.
 *
 * No poster art ships with the catalogue, and a card with nothing on it reads as broken — the
 * gallery is the shop window. So the card draws the one thing every template truly has: its
 * cutting rhythm. Vertical bars carry the template's energy arc through the app's energy ramp
 * (cool in the calm, amber at the build, red at the drop), the bar pattern comes from the
 * template's own density and transition, and an amber playhead sweeps the strip at the pace
 * the template cuts. Fast styles look busy, slow styles look calm — before a single tap.
 *
 * Everything is deterministic from the template's id, so a card looks the same on every open,
 * and every colour comes from the design tokens. When real poster art exists it simply covers
 * this (the card checks `posterUri` first).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { energyColor, palette, radius } from "@thumpcut/design-tokens";

export interface TemplatePosterProps {
  /** Seeds the pattern — the template's id, so every card is its own. */
  seed: string;
  /** The template's medium density: beats per slide. Small numbers cut fast. */
  beatsPerSlide: number;
  /** Shapes the bars: hard alternation for cuts, smoothed for crossfades, spikes for punches. */
  transition: "cut" | "crossfade" | "zoomPunch";
  /** The sweeping playhead. Off for the tiny strip thumbnails, where five loops would be noise. */
  animated?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function TemplatePoster({
  seed,
  beatsPerSlide,
  transition,
  animated = true,
  style,
}: TemplatePosterProps) {
  const [width, setWidth] = useState(0);

  const bars = useMemo(() => {
    const all = buildBars(seed, beatsPerSlide, transition);
    if (width <= 0) return all;
    // On a tiny thumbnail there is no room for every bar: keep an evenly spaced subset so
    // each bar still gets at least a few pixels, rather than flexing everything to nothing.
    const maximum = Math.max(4, Math.floor(width / MIN_BAR_SPAN));
    if (all.length <= maximum) return all;
    const step = all.length / maximum;
    return Array.from({ length: maximum }, (_, index) => all[Math.floor(index * step)] as Bar);
  }, [seed, beatsPerSlide, transition, width]);

  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!animated || width <= 0) return;
    // A playhead is a clock, so it moves linearly — the springs are for things that settle.
    // The sweep takes as long as the template would take to cut through the strip: fast
    // templates sweep in about three seconds, languid ones take eight.
    const durationMs = 1400 + 1800 * beatsPerSlide;
    const loop = Animated.loop(
      Animated.timing(sweep, {
        toValue: 1,
        duration: durationMs,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [animated, width, beatsPerSlide, sweep]);

  const translateX = sweep.interpolate({
    inputRange: [0, 1],
    outputRange: [0, Math.max(1, width - PLAYHEAD_WIDTH)],
  });

  return (
    <View
      style={[styles.face, style]}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      accessible={false}
    >
      <View style={styles.bars}>
        {bars.map((bar, index) => (
          <View
            key={index}
            style={[
              styles.bar,
              {
                height: `${Math.round(bar.height * 100)}%`,
                backgroundColor: energyColor(bar.energy),
              },
            ]}
          />
        ))}
      </View>
      {animated ? (
        <Animated.View pointerEvents="none" style={[styles.playhead, { transform: [{ translateX }] }]} />
      ) : null}
    </View>
  );
}

const PLAYHEAD_WIDTH = 2;
/** The narrowest a bar plus its gap may go before bars are dropped instead. */
const MIN_BAR_SPAN = 9;

interface Bar {
  /** 0..1 of the strip's height. */
  height: number;
  /** 0..1 through the energy ramp. */
  energy: number;
}

/**
 * The bar pattern. Each transition family has its own silhouette, so two templates never
 * read as the same card: a cut template strikes in alternating tall-and-short strokes, a
 * crossfade rolls in a smooth seeded wave, a punch template sits low and spikes on the
 * phrase. The seed then moves each template's peaks and drop somewhere of its own.
 */
function buildBars(seed: string, beatsPerSlide: number, transition: string): Bar[] {
  const random = mulberry32(hashString(seed));
  const count = Math.max(7, Math.min(18, Math.round(6 + 12 / Math.max(0.5, beatsPerSlide))));

  // Seeded song shape: where the drop lands and where the wave starts.
  const dropAt = 0.55 + random() * 0.3;
  const phase = random() * Math.PI * 2;
  const rise = 0.5 + random() * 0.35;

  const bars: Bar[] = [];
  for (let index = 0; index < count; index += 1) {
    const position = count > 1 ? index / (count - 1) : 0;
    let energy: number;

    if (transition === "crossfade") {
      // A slow roll: a wave over a gentle rise, nothing sharp anywhere.
      const wave = 0.5 + 0.5 * Math.sin(phase + position * Math.PI * 2.2);
      energy = clamp01(0.18 + 0.28 * position * rise + 0.4 * wave);
    } else if (transition === "zoomPunch") {
      // Low and coiled between hits; the spikes are added below.
      energy = clamp01(0.2 + 0.25 * position + (random() * 2 - 1) * 0.08);
    } else {
      // A cut template: the classic build to a drop, struck in alternating strokes.
      const build = 0.28 + 0.5 * Math.min(1, position / dropAt);
      const nearDrop = Math.abs(position - dropAt) < 0.12 ? 0.2 : 0;
      const settle = position > dropAt + 0.2 ? -0.24 : 0;
      const stroke = index % 2 === 1 ? -0.16 : 0.06;
      energy = clamp01(build + nearDrop + settle + stroke + (random() * 2 - 1) * 0.06);
    }

    bars.push({ height: 0.2 + 0.76 * energy, energy });
  }

  if (transition === "zoomPunch") {
    // The hits: every fourth bar goes to the top, starting where the seed says.
    const start = 1 + Math.floor(random() * 2);
    for (let index = start; index < count; index += 4) {
      const bar = bars[index] as Bar;
      bar.height = 0.98;
      bar.energy = Math.max(bar.energy, 0.94);
    }
  }

  return bars;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** djb2 — tiny, stable, good enough to make five template ids look unrelated. */
function hashString(value: string): number {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

/** A tiny deterministic PRNG, so the pattern is the template's own and never reshuffles. */
function mulberry32(seedValue: number): () => number {
  let state = seedValue >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

const styles = StyleSheet.create({
  face: { flex: 1, overflow: "hidden" },
  bars: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-evenly",
    paddingHorizontal: 6,
    paddingBottom: 0,
    gap: 4,
  },
  bar: {
    flex: 1,
    borderTopLeftRadius: radius.chip,
    borderTopRightRadius: radius.chip,
    opacity: 0.9,
  },
  playhead: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: PLAYHEAD_WIDTH,
    backgroundColor: palette.signal,
  },
});
