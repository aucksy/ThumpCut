/**
 * The horizontally scrolling strip of styles under the preview.
 *
 * The selected one is outlined in teal — "you chose this" — and its name goes teal too, so the
 * selection reads without relying on colour alone.
 */

import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { border, colors, fontFamily, palette, radius, space } from "@thumpcut/design-tokens";
import type { CatalogueTemplate } from "../catalogue/types.ts";

export function TemplateStrip({
  templates,
  selectedId,
  onSelect,
}: {
  templates: CatalogueTemplate[];
  selectedId: string;
  onSelect?: (template: CatalogueTemplate) => void;
}) {
  return (
    <View style={styles.row}>
      {templates.map((template) => {
        const selected = template.id === selectedId;
        return (
          <Pressable
            key={template.id}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={template.name}
            onPress={() => onSelect?.(template)}
            style={styles.item}
            testID={`strip-${template.id}`}
          >
            <View style={[styles.thumb, selected ? styles.thumbSelected : styles.thumbIdle]}>
              {template.previewPosterUrl ? (
                <Image
                  source={{ uri: template.previewPosterUrl }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  accessible={false}
                  transition={0}
                />
              ) : null}
            </View>
            <Text
              numberOfLines={1}
              style={[styles.name, selected ? styles.nameSelected : null]}
            >
              {template.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 10 },
  item: { width: 68 },
  thumb: {
    aspectRatio: 9 / 16,
    borderRadius: radius.chip,
    overflow: "hidden",
    backgroundColor: colors.surfaceMedia,
  },
  thumbIdle: { borderWidth: border.hairline, borderColor: colors.borderFaint },
  thumbSelected: { borderWidth: border.selected, borderColor: palette.cool },
  name: {
    fontFamily: fontFamily.body,
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 5,
  },
  nameSelected: { color: palette.cool },
  spacer: { width: space.s2 },
});
