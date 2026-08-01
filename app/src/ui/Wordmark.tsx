/**
 * The wordmark: "Thumpcut" with a thin amber tick between "Thump" and "cut" — the beat the cut
 * lands on. Rendered in type rather than stored as an image, so it stays crisp at any size and
 * costs the bundle nothing.
 */

import { StyleSheet, Text, View } from "react-native";
import { fontFamily, letterSpacing, palette } from "@thumpcut/design-tokens";

/**
 * A brand lockup is a mark, not prose: it does not grow with the system font scale. At scale
 * 1.6 the wordmark was 89pt wider than the phone and pushed the settings button off screen.
 * `allowFontScaling` handles it on a device; the `dataSet` tag is how the UI checker knows to
 * leave it alone too.
 */
// `dataSet` is react-native-web's way of emitting a data-* attribute. React Native ignores
// it, and its types do not declare it, so the prop is spread in rather than named.
const NO_FONT_SCALE = { dataSet: { tcNoFontScale: "true" } } as unknown as Record<string, unknown>;

export function Wordmark({ size = 20 }: { size?: number }) {
  return (
    <View accessible accessibilityRole="header" accessibilityLabel="ThumpCut" style={styles.row}>
      <LogoMark size={size * 1.1} />
      <View style={styles.type}>
        <Text
          allowFontScaling={false}
          {...NO_FONT_SCALE}
          style={[styles.word, { fontSize: size, letterSpacing: size * letterSpacing.display }]}
        >
          Thump
        </Text>
        <View
          style={{
            width: Math.max(2, size * 0.09),
            height: size * 0.68,
            marginHorizontal: size * 0.06,
            borderRadius: 2,
            backgroundColor: palette.signal,
          }}
        />
        <Text
          allowFontScaling={false}
          {...NO_FONT_SCALE}
          style={[styles.word, { fontSize: size, letterSpacing: size * letterSpacing.display }]}
        >
          cut
        </Text>
      </View>
    </View>
  );
}

/**
 * The mark: beat ticks crossed by an amber playhead, with one tick teal — a video clip among
 * the stills. The whole product in eight rectangles.
 */
export function LogoMark({ size = 22 }: { size?: number }) {
  const ticks = [0.14, 0.3, 0.46, 0.62, 0.78];
  return (
    <View style={{ width: size, height: size, justifyContent: "center" }}>
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: size * 0.24,
          height: 1,
          backgroundColor: palette.bone,
          opacity: 0.35,
        }}
      />
      {ticks.map((left, index) => (
        <View
          key={left}
          style={{
            position: "absolute",
            left: size * left,
            bottom: size * 0.24,
            width: size * 0.09,
            height: index % 2 === 0 ? size * 0.34 : size * 0.2,
            borderRadius: 1,
            backgroundColor: index === 3 ? palette.cool : palette.bone,
          }}
        />
      ))}
      <View
        style={{
          position: "absolute",
          left: size * 0.56,
          top: size * 0.08,
          bottom: size * 0.12,
          width: size * 0.09,
          borderRadius: 1,
          backgroundColor: palette.signal,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 9 },
  type: { flexDirection: "row", alignItems: "center" },
  word: {
    fontFamily: fontFamily.display,
    color: palette.bone,
  },
});
