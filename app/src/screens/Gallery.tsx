/**
 * The template gallery — the home screen, and the shop window.
 *
 * **It must never show a spinner.** Once a catalogue is cached, cards appear instantly. A card
 * whose preview has not downloaded shows a still; a card with no still shows the panel colour.
 * Never an empty box, never a shimmer.
 *
 * Offline with a cache looks *identical* to online. No banner, no warning. A cached catalogue
 * is a normal working state.
 */

import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { layout, space } from "@thumpcut/design-tokens";
import { COPY } from "../copy.ts";
import { formatTemplateMeta } from "../copy.ts";
import type { CatalogueTemplate } from "../catalogue/types.ts";
import { Button, Chip } from "../ui/controls.tsx";
import { Screen } from "../ui/chrome.tsx";
import { GearGlyph } from "../ui/icons.tsx";
import { TemplateCard } from "../ui/TemplateCard.tsx";
import { Wordmark } from "../ui/Wordmark.tsx";
import { HERO_RULER } from "../ui/heroRuler.ts";

export interface GalleryScreenProps {
  templates: CatalogueTemplate[];
  /** For the meta line. The gallery shows the tempo of the track a card is previewing. */
  bpmForTemplate?: (template: CatalogueTemplate) => number;
  selectedMood?: string;
  onSelectMood?: (mood: string) => void;
  onSelectTemplate?: (template: CatalogueTemplate) => void;
  onCreate?: () => void;
  onOpenSettings?: () => void;
}

export function GalleryScreen({
  templates,
  bpmForTemplate,
  selectedMood = "All",
  onSelectMood,
  onSelectTemplate,
  onCreate,
  onOpenSettings,
}: GalleryScreenProps) {
  const visible =
    selectedMood === "All"
      ? templates
      : templates.filter((template) => template.mood === selectedMood);

  return (
    <Screen testID="screen-gallery">
      <View style={styles.header}>
        <Wordmark size={19} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={COPY.gallery.settings}
          onPress={onOpenSettings}
          style={styles.settingsButton}
          testID="gallery-settings"
        >
          <GearGlyph />
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        style={styles.chipRow}
      >
        {COPY.gallery.moods.map((mood) => (
          <Chip key={mood} selected={mood === selectedMood} onPress={() => onSelectMood?.(mood)}>
            {mood}
          </Chip>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
        {visible.map((template) => (
          <View key={template.id} style={styles.cell}>
            <TemplateCard
              name={template.name}
              meta={formatTemplateMeta(
                bpmForTemplate?.(template) ?? 0,
                template.idealItemRange,
              )}
              posterUri={template.previewPosterUrl || undefined}
              poster={{
                seed: template.id,
                beatsPerSlide: template.density.medium,
                transition: template.transition,
              }}
              beats={HERO_RULER.beats}
              downbeats={HERO_RULER.downbeats}
              energy={HERO_RULER.energy}
              markers={HERO_RULER.markers}
              startSec={HERO_RULER.startSec}
              durationSec={HERO_RULER.durationSec}
              accessibilityLabel={`${template.name}, made for ${template.idealItemRange[0]} to ${template.idealItemRange[1]} items`}
              onPress={() => onSelectTemplate?.(template)}
              testID={`template-${template.id}`}
            />
          </View>
        ))}
      </ScrollView>

      <View style={styles.createRow}>
        <Button full onPress={onCreate} testID="gallery-create">
          {COPY.gallery.create}
        </Button>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: layout.screenPad,
    paddingTop: space.s2,
  },
  settingsButton: {
    width: layout.tapMin,
    height: layout.tapMin,
    marginRight: -10,
    alignItems: "center",
    justifyContent: "center",
  },
  // An explicit height, not a content-sized one. A horizontally scrolling row measured its own
  // height from the wrong box and clipped every chip's descenders.
  chipRow: { flexGrow: 0, flexShrink: 0, height: layout.tapMin + space.s2, marginTop: 14 },
  chips: {
    gap: space.s2,
    paddingHorizontal: layout.screenPad,
    paddingBottom: space.s1,
    alignItems: "center",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.s3,
    paddingHorizontal: layout.screenPad,
    paddingTop: space.s3,
    paddingBottom: space.s3,
  },
  // A fixed width, never flexGrow: a lone card on the last row was stretching to the full
  // width of the screen and becoming a 568pt-tall slab.
  cell: { width: "48%", flexGrow: 0, flexShrink: 0 },
  // In the layout, not floating over it. Absolutely positioned, this pill sat on top of the
  // card titles as they scrolled past and read as a rendering fault. Every other screen in the
  // app puts its primary action in a footer below the scrolling area; so does this one now.
  createRow: {
    paddingHorizontal: layout.screenPad,
    paddingTop: 14,
    paddingBottom: 34,
  },
});
