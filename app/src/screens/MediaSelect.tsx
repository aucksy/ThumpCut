/**
 * Media selection. The most edge-case-heavy screen in the app.
 *
 * Two things here carry the product's differentiator:
 *
 *   · A clip is a distinct material — teal border, play glyph, its length in mono — never a
 *     photo with a play icon on it.
 *   · When the clip cap is reached, **only the clips dim**. Photos stay live and selectable,
 *     and the dimming has to make that obvious without a sentence explaining it.
 */

import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { colors, layout, palette, radius, space } from "@thumpcut/design-tokens";
import {
  COPY,
  formatCounter,
  formatDuration,
  formatSelectionHeader,
} from "../copy.ts";
import { MAX_MEDIA_ITEMS } from "@thumpcut/cut-engine";
import type { LibraryItem, SelectionState } from "../media/selection.ts";
import { canContinue, videoCount } from "../media/selection.ts";
import { Button } from "../ui/controls.tsx";
import { CenterMessage, Screen, TopBar } from "../ui/chrome.tsx";
import { InlineHint, Toast } from "../ui/feedback.tsx";
import { PlusGlyph } from "../ui/icons.tsx";
import { LogoMark } from "../ui/Wordmark.tsx";
import { MediaTile } from "../ui/MediaTile.tsx";
import { Body, Mono } from "../ui/text.tsx";

export interface MediaSelectScreenProps {
  state: SelectionState;
  onBack?: () => void;
  onAllowAccess?: () => void;
  onOpenSettings?: () => void;
  onToggle?: (id: string) => void;
  onOpenTrim?: (id: string) => void;
  onSelectMorePhotos?: () => void;
  onContinue?: () => void;
}

export function MediaSelectScreen({
  state,
  onBack,
  onAllowAccess,
  onOpenSettings,
  onToggle,
  onOpenTrim,
  onSelectMorePhotos,
  onContinue,
}: MediaSelectScreenProps) {
  const selectedCount = state.selectedIds.length;
  const clips = videoCount(state);
  const atItemCap = selectedCount >= MAX_MEDIA_ITEMS;
  const atVideoCap = clips >= 15;

  const showGrid =
    state.status !== "PermissionUnknown" &&
    state.status !== "PermissionDenied" &&
    state.status !== "Empty" &&
    state.status !== "Loading";

  return (
    <Screen testID="screen-media">
      <TopBar
        onBack={onBack}
        center={
          selectedCount > 0 ? (
            <Mono numberOfLines={1} testID="media-header">{formatSelectionHeader(selectedCount, clips)}</Mono>
          ) : (
            <Mono numberOfLines={1} style={styles.dim}>{COPY.media.pickItems}</Mono>
          )
        }
        right={
          showGrid ? (
            <Mono
              size={12}
              numberOfLines={1}
              testID="media-counter"
              style={atItemCap ? styles.counterAtCap : styles.dim}
            >
              {formatCounter(selectedCount, MAX_MEDIA_ITEMS)}
            </Mono>
          ) : null
        }
      />

      {state.status === "PermissionUnknown" ? (
        <CenterMessage
          testID="media-permission"
          hero={<LogoMark size={52} />}
          action={COPY.media.allowAccess}
          onAction={onAllowAccess}
        >
          {COPY.media.permissionExplainer}
        </CenterMessage>
      ) : null}

      {state.status === "PermissionDenied" ? (
        <CenterMessage
          testID="media-denied"
          action={COPY.media.openSettings}
          onAction={onOpenSettings}
        >
          {COPY.media.permissionDenied}
        </CenterMessage>
      ) : null}

      {state.status === "Empty" ? (
        <CenterMessage testID="media-empty">{COPY.media.empty}</CenterMessage>
      ) : null}

      {state.status === "Loading" ? (
        // A plain grid of empty panels. Not a shimmer: nothing is being waited for that the
        // user needs told about, and a loader would imply otherwise.
        <View style={styles.loadingGrid}>
          {Array.from({ length: 12 }, (_, index) => (
            <View key={index} style={styles.loadingCell} />
          ))}
        </View>
      ) : null}

      {showGrid ? (
        <ScrollView contentContainerStyle={styles.gridScroll} showsVerticalScrollIndicator={false}>
          {state.permission === "limited" ? (
            <Pressable
              accessibilityRole="button"
              onPress={onSelectMorePhotos}
              style={styles.selectMore}
              testID="media-select-more"
            >
              <PlusGlyph />
              <Body>{COPY.media.selectMorePhotos}</Body>
            </Pressable>
          ) : null}

          <View style={styles.grid}>
            {state.library.map((item) => (
              <View key={item.id} style={styles.cell}>
                <MediaTile
                  uri={item.uri}
                  kind={item.kind}
                  duration={
                    item.kind === "video" ? formatDuration(item.durationSec ?? 0) : undefined
                  }
                  order={orderOf(state, item)}
                  selected={state.selectedIds.includes(item.id)}
                  dimmed={
                    item.kind === "video" && atVideoCap && !state.selectedIds.includes(item.id)
                  }
                  unavailable={state.unavailableIds.includes(item.id)}
                  accessibilityLabel={COPY.a11y.mediaTile(
                    item.kind,
                    (orderOf(state, item) ?? 0) || state.library.indexOf(item) + 1,
                    selectedCount || state.library.length,
                    state.selectedIds.includes(item.id),
                  )}
                  onPress={() => onToggle?.(item.id)}
                  onPressDuration={() => onOpenTrim?.(item.id)}
                  testID={`tile-${item.id}`}
                />
              </View>
            ))}
          </View>
        </ScrollView>
      ) : null}

      {showGrid ? (
        <View style={styles.footer}>
          {state.hint ? <InlineHint testID="media-hint">{state.hint}</InlineHint> : null}
          <Button
            full
            disabled={!canContinue(state)}
            onPress={onContinue}
            testID="media-continue"
          >
            {COPY.media.continue}
          </Button>
        </View>
      ) : null}

      {state.toast ? (
        <View style={styles.toastRow} pointerEvents="none">
          <Toast>{state.toast}</Toast>
        </View>
      ) : null}

      {state.validating ? (
        <>
          <View style={styles.scrim} />
          <View style={styles.validating}>
            <View style={styles.validatingCard}>
              <Body>{COPY.media.validating}</Body>
            </View>
          </View>
        </>
      ) : null}
    </Screen>
  );
}

function orderOf(state: SelectionState, item: LibraryItem): number | null {
  const index = state.selectedIds.indexOf(item.id);
  return index >= 0 ? index + 1 : null;
}

const styles = StyleSheet.create({
  dim: { color: colors.textSecondary },
  counterAtCap: { color: palette.clip },
  loadingGrid: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.s2,
    paddingHorizontal: layout.screenPad,
    paddingTop: space.s1,
    alignContent: "flex-start",
  },
  loadingCell: {
    width: "31%",
    aspectRatio: 1,
    borderRadius: radius.card,
    backgroundColor: colors.borderFaint,
  },
  gridScroll: { paddingHorizontal: layout.screenPad, paddingTop: space.s1, paddingBottom: space.s2 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.s2 },
  cell: { width: "31.5%" },
  selectMore: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.card,
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginBottom: 10,
    minHeight: layout.tapMin,
  },
  footer: {
    paddingHorizontal: layout.screenPad,
    paddingTop: 14,
    paddingBottom: 34,
    gap: 10,
  },
  toastRow: {
    position: "absolute",
    left: layout.screenPad,
    right: layout.screenPad,
    bottom: 128,
    alignItems: "center",
  },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.surfaceScrim },
  validating: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  validatingCard: {
    backgroundColor: colors.surfaceFloat,
    borderRadius: radius.card,
    paddingVertical: 14,
    paddingHorizontal: 22,
  },
});
