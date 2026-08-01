/**
 * `expo-image` for the harness.
 *
 * A real `<img>`, created through react-native-web's own element factory so React Native
 * styles are translated properly. Going through `Image` from react-native-web produced no DOM
 * node at all for data URIs, which made every screenshot look like the app had failed to load
 * anything — a harness that lies about what the user sees is worse than no harness.
 */

import { unstable_createElement, type ImageStyle, type StyleProp } from "react-native";

export interface ImageProps {
  source?: { uri: string } | number;
  style?: StyleProp<ImageStyle>;
  contentFit?: "cover" | "contain" | "fill" | "none";
  transition?: number;
  accessible?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}

export function Image({
  source,
  style,
  contentFit = "cover",
  accessibilityLabel,
  testID,
}: ImageProps) {
  const uri = typeof source === "object" && source !== null ? source.uri : undefined;
  if (!uri) return null;

  return unstable_createElement("img", {
    src: uri,
    alt: accessibilityLabel ?? "",
    "data-testid": testID,
    // An `<img>` keeps its intrinsic size unless told otherwise, so a 340x500 placeholder
    // would spill out of a 166pt card. `expo-image` fills its box; so does this.
    style: [{ width: "100%", height: "100%" }, style, { objectFit: contentFit }],
  });
}

export const ImageBackground = Image;
export default { Image };
