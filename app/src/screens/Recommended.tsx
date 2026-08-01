/**
 * Recommended templates.
 *
 * The user picked N items; these are the styles that will produce good timing for N items. It
 * is arithmetic on cached data, so it is instant.
 *
 * Everything else sits below a divider labelled "Also works" — **shown, not hidden**. The user
 * can always pick anything; the app is offering an opinion, not making a decision.
 */

import { ScrollView, StyleSheet, View } from "react-native";
import { layout, space } from "@thumpcut/design-tokens";
import { COPY, formatMadeFor, formatSelectionHeader, formatTemplateMeta } from "../copy.ts";
import type { CatalogueTemplate } from "../catalogue/types.ts";
import type { Recommendation } from "../templates/recommend.ts";
import { DividerLabel } from "../ui/controls.tsx";
import { Screen, TopBar } from "../ui/chrome.tsx";
import { TemplateCard } from "../ui/TemplateCard.tsx";
import { Label, Mono } from "../ui/text.tsx";
import { HERO_RULER } from "../ui/heroRuler.ts";

export interface RecommendedScreenProps {
  itemCount: number;
  clipCount: number;
  recommendation: Recommendation<CatalogueTemplate>;
  bpmForTemplate?: (template: CatalogueTemplate) => number;
  onBack?: () => void;
  onSelectTemplate?: (template: CatalogueTemplate) => void;
}

export function RecommendedScreen({
  itemCount,
  clipCount,
  recommendation,
  bpmForTemplate,
  onBack,
  onSelectTemplate,
}: RecommendedScreenProps) {
  const card = (template: CatalogueTemplate) => (
    <View key={template.id} style={styles.cell}>
      <TemplateCard
        name={template.name}
        meta={formatTemplateMeta(bpmForTemplate?.(template) ?? 0, template.idealItemRange)}
        posterUri={template.previewPosterUrl || undefined}
        beats={HERO_RULER.beats}
        downbeats={HERO_RULER.downbeats}
        energy={HERO_RULER.energy}
        markers={HERO_RULER.markers}
        startSec={HERO_RULER.startSec}
        durationSec={HERO_RULER.durationSec}
        accessibilityLabel={`${template.name}, made for ${template.idealItemRange[0]} to ${template.idealItemRange[1]} items`}
        onPress={() => onSelectTemplate?.(template)}
        testID={`recommended-${template.id}`}
      />
    </View>
  );

  return (
    <Screen testID="screen-recommended">
      <TopBar
        onBack={onBack}
        center={<Mono numberOfLines={1}>{formatSelectionHeader(itemCount, clipCount)}</Mono>}
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Label style={styles.madeFor} testID="recommended-heading">
          {formatMadeFor(itemCount)}
        </Label>
        <View style={styles.grid}>{recommendation.madeFor.map(card)}</View>

        {recommendation.alsoWorks.length > 0 ? (
          <>
            <View style={styles.divider}>
              <DividerLabel>
                <Label>{COPY.recommended.alsoWorks}</Label>
              </DividerLabel>
            </View>
            <View style={styles.grid}>{recommendation.alsoWorks.map(card)}</View>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: layout.screenPad, paddingTop: space.s2, paddingBottom: 40 },
  madeFor: { marginBottom: space.s3 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.s3 },
  cell: { width: "47%", flexGrow: 1, flexBasis: "47%" },
  divider: { marginTop: space.s5, marginBottom: space.s3 },
});
