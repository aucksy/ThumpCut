/**
 * Your music.
 *
 * The list of songs on the device, and the doorway to the app working with no catalogue, no
 * Meta account and no network at all. Picking a song reads its beat on the phone — a few
 * seconds, once ever per song — and then the normal flow takes over.
 *
 * States, all designed: permission denied (with the way to Settings), scanning, empty,
 * ready, analysing (the picked row carries a live percentage; the rest dim), and analysis
 * failed (a toast, and the list stays usable). No spinners anywhere — the analysing row
 * shows a number that moves, which is the honest version of progress.
 */

import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { alpha, colors, layout, radius, space } from "@thumpcut/design-tokens";
import { COPY, formatDuration, formatPercent } from "../copy.ts";
import { titleFromFilename } from "../music/localTracks.ts";
import type { LocalMusicSnapshot, LocalSong } from "../music/localTracks.ts";
import { CenterMessage, Screen, TopBar } from "../ui/chrome.tsx";
import { Toast } from "../ui/feedback.tsx";
import { Body, Display, Label, Mono } from "../ui/text.tsx";

export interface MusicScreenProps {
  snapshot: LocalMusicSnapshot;
  onBack?: () => void;
  onPick?: (song: LocalSong) => void;
  onOpenSettings?: () => void;
}

export function MusicScreen({ snapshot, onBack, onPick, onOpenSettings }: MusicScreenProps) {
  const analysing = snapshot.status === "Analysing";

  return (
    <Screen testID="screen-music">
      <TopBar onBack={onBack} center={<Display size={17}>{COPY.music.title}</Display>} />

      {snapshot.status === "PermissionDenied" ? (
        <CenterMessage
          testID="music-permission-denied"
          action={COPY.music.openSettings}
          onAction={onOpenSettings}
        >
          {COPY.music.permissionDenied}
        </CenterMessage>
      ) : snapshot.status === "Empty" ? (
        <CenterMessage testID="music-empty">{COPY.music.empty}</CenterMessage>
      ) : (
        <>
          <Body style={styles.explainer} testID="music-explainer">
            {COPY.music.explainer}
          </Body>
          <ScrollView
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          >
            {snapshot.songs.map((song) => {
              const isThisOne = analysing && snapshot.analysingId === song.id;
              const dimmed = analysing && !isThisOne;
              // The cleaned name, not the raw filename: "01-Night_Drive_Demo.mp3" is a
              // developer's view of a song. The same cleaning names the analysed track.
              const title = titleFromFilename(song.filename);
              return (
                <Pressable
                  key={song.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${title}, ${formatDuration(song.durationSec)}`}
                  disabled={analysing}
                  onPress={() => onPick?.(song)}
                  style={[styles.row, isThisOne && styles.rowActive, dimmed && styles.rowDimmed]}
                  testID={`music-song-${song.id}`}
                >
                  <View style={styles.rowText}>
                    <Body numberOfLines={1}>{title}</Body>
                    {isThisOne ? (
                      <Label style={styles.progress} testID="music-analysing">
                        {COPY.music.analysing}
                        {" · "}
                        <Mono size={12} style={styles.progressNumber}>
                          {formatPercent(snapshot.progress)}
                        </Mono>
                      </Label>
                    ) : null}
                  </View>
                  <Mono size={13} style={styles.duration}>
                    {formatDuration(song.durationSec)}
                  </Mono>
                </Pressable>
              );
            })}
          </ScrollView>
          {snapshot.status === "AnalysisFailed" && snapshot.message ? (
            <View style={styles.toastRow} pointerEvents="none" testID="music-failed">
              <Toast>{snapshot.message}</Toast>
            </View>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  explainer: {
    fontSize: 14,
    lineHeight: 14 * 1.5,
    color: alpha.bone70,
    paddingHorizontal: layout.screenPad,
    paddingTop: space.s2,
    paddingBottom: space.s2,
  },
  list: { paddingHorizontal: layout.screenPad, paddingBottom: 40, gap: space.s2 },
  row: {
    minHeight: layout.tapMin,
    flexDirection: "row",
    alignItems: "center",
    gap: space.s3,
    paddingHorizontal: space.s3,
    paddingVertical: space.s2,
    borderRadius: radius.card,
    backgroundColor: colors.surfaceRaised,
  },
  // Teal is "chosen" everywhere in the product; the row being read is the chosen one.
  rowActive: { borderWidth: 1, borderColor: colors.accentSelect },
  rowDimmed: { opacity: 0.4 },
  rowText: { flex: 1, gap: 2 },
  progress: { color: colors.accentSelect },
  progressNumber: { color: colors.accentSelect },
  duration: { color: alpha.bone70 },
  toastRow: { position: "absolute", left: 0, right: 0, bottom: 34, alignItems: "center" },
});
