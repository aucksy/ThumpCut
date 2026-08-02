/**
 * The track chooser: one horizontal row, three neighbourhoods.
 *
 * "Your music" first — the door to the phone's own songs. Then the trending tracks from
 * Instagram's catalogue, then the royalty-free section, each under a small caps label so the
 * difference is visible without being read about: a trending track exports silent and hands
 * off to Instagram; a royalty-free track carries its music anywhere, and its chip says the
 * licence out loud.
 *
 * Chips, not cards: the templates below are the product's shop window, and the track row
 * must inform without competing with them.
 */

import { ScrollView, StyleSheet, View } from "react-native";
import { space } from "@thumpcut/design-tokens";
import { COPY } from "../copy.ts";
import { trackSource, type CatalogueTrack } from "../catalogue/types.ts";
import { Chip } from "./controls.tsx";
import { Label } from "./text.tsx";

export interface TrackStripProps {
  tracks: CatalogueTrack[];
  selectedTrackId?: string | null;
  onSelectTrack?: (track: CatalogueTrack) => void;
  onYourMusic?: () => void;
  /** The analysed local track currently selected, shown as its own chip while it is. */
  localTrack?: CatalogueTrack | null;
}

const TRENDING_LABEL = "TRENDING";
const ROYALTY_FREE_LABEL = "ROYALTY-FREE";

export function TrackStrip({
  tracks,
  selectedTrackId,
  onSelectTrack,
  onYourMusic,
  localTrack,
}: TrackStripProps) {
  const trending = tracks.filter((track) => trackSource(track) === "instagram");
  const royaltyFree = tracks.filter((track) => trackSource(track) === "royaltyfree");

  const chip = (track: CatalogueTrack, suffix?: string) => (
    <Chip
      key={track.trackId}
      selected={track.trackId === selectedTrackId}
      onPress={() => onSelectTrack?.(track)}
      testID={`track-${track.trackId}`}
    >
      {suffix ? `${track.title} · ${suffix}` : track.title}
    </Chip>
  );

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.strip}
      contentContainerStyle={styles.content}
      testID="track-strip"
    >
      <Chip
        selected={localTrack !== null && localTrack !== undefined && localTrack.trackId === selectedTrackId}
        onPress={onYourMusic}
        testID="track-your-music"
      >
        {localTrack && localTrack.trackId === selectedTrackId
          ? localTrack.title
          : COPY.music.yourMusic}
      </Chip>

      {trending.length > 0 ? (
        <View style={styles.section}>
          <Label style={styles.sectionLabel}>{TRENDING_LABEL}</Label>
        </View>
      ) : null}
      {trending.map((track) => chip(track))}

      {royaltyFree.length > 0 ? (
        <View style={styles.section}>
          <Label style={styles.sectionLabel}>{ROYALTY_FREE_LABEL}</Label>
        </View>
      ) : null}
      {royaltyFree.map((track) => chip(track, track.licence?.name))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // An explicit height, like the gallery's chip row: a horizontally scrolling row measured
  // from the wrong box clips every chip's descenders.
  strip: { flexGrow: 0, flexShrink: 0, height: 44 + space.s2 },
  content: { gap: space.s2, alignItems: "center", paddingRight: space.s3 },
  section: { justifyContent: "center", paddingLeft: space.s2 },
  sectionLabel: { letterSpacing: 1 },
});
