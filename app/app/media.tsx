/**
 * Media selection, wired to the picker and the photo library.
 *
 * The screen itself is pure. This route is the part that talks to the platform: permissions,
 * the library query, and checking a cloud-only item can actually be downloaded before the
 * user is allowed to move on.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AppState as RNAppState, Linking } from "react-native";
import { useRouter } from "expo-router";
import * as MediaLibrary from "expo-media-library";
import { File } from "expo-file-system";
import { MediaSelectScreen } from "../src/screens/index.tsx";
import { TrimSheet, SheetBackdrop } from "../src/ui/TrimSheet.tsx";
import { useAppState } from "../src/state/AppState.tsx";
import type { LibraryItem } from "../src/media/selection.ts";
import { View } from "react-native";

/** How long to wait for a cloud placeholder before giving up on it. */
const CLOUD_TIMEOUT_MS = 15_000;
const PAGE_SIZE = 120;

export default function MediaRoute() {
  const router = useRouter();
  const { selection, dispatchSelection } = useAppState();
  const [permission, requestPermission] = MediaLibrary.usePermissions();
  const advancing = useRef(false);

  const loadLibrary = useCallback(async () => {
    const page = await MediaLibrary.getAssetsAsync({
      first: PAGE_SIZE,
      mediaType: ["photo", "video"],
      sortBy: [MediaLibrary.SortBy.creationTime],
    });

    const items: LibraryItem[] = page.assets.map((asset) => ({
      id: asset.id,
      uri: asset.uri,
      kind: asset.mediaType === MediaLibrary.MediaType.video ? "video" : "photo",
      width: asset.width,
      height: asset.height,
      rotationDeg: 0,
      ...(asset.duration ? { durationSec: asset.duration } : {}),
      // On iOS an asset in iCloud with "Optimise Storage" on has no local bytes yet. The
      // picker shows it; the file may simply not be there.
      cloudOnly: asset.uri.startsWith("ph://"),
    }));

    dispatchSelection({ type: "libraryLoaded", items });
  }, [dispatchSelection]);

  // Permission can be revoked while the app is backgrounded, so it is re-checked on resume
  // rather than trusted from launch.
  useEffect(() => {
    const subscription = RNAppState.addEventListener("change", (next) => {
      if (next !== "active") return;
      void (async () => {
        const current = await MediaLibrary.getPermissionsAsync();
        dispatchSelection({
          type: "permissionChanged",
          permission: current.granted
            ? current.accessPrivileges === "limited"
              ? "limited"
              : "granted"
            : "denied",
        });
        if (current.granted) await loadLibrary();
      })();
    });
    return () => subscription.remove();
  }, [dispatchSelection, loadLibrary]);

  useEffect(() => {
    if (!permission) return;
    dispatchSelection({
      type: "permissionChanged",
      permission: permission.granted
        ? permission.accessPrivileges === "limited"
          ? "limited"
          : "granted"
        : permission.canAskAgain
          ? "unknown"
          : "denied",
    });
    if (permission.granted) void loadLibrary();
  }, [dispatchSelection, loadLibrary, permission]);

  const [trimTarget, setTrimTarget] = useState<LibraryItem | null>(null);

  const onContinue = useCallback(async () => {
    if (advancing.current) return;
    advancing.current = true;
    dispatchSelection({ type: "continuePressed" });

    const cloudItems = selection.library.filter(
      (item) => selection.selectedIds.includes(item.id) && item.cloudOnly,
    );

    if (cloudItems.length > 0) {
      const failed: string[] = [];
      for (const item of cloudItems) {
        const readable = await Promise.race([
          Promise.resolve()
            .then(() => new File(item.uri).exists)
            .catch(() => false),
          new Promise<boolean>((resolve) => setTimeout(() => resolve(false), CLOUD_TIMEOUT_MS)),
        ]);
        if (!readable) failed.push(item.id);
      }
      dispatchSelection({ type: "validationFinished", failedIds: failed });
      if (failed.length > 0 && selection.selectedIds.length - failed.length < 3) {
        advancing.current = false;
        return;
      }
    }

    advancing.current = false;
    dispatchSelection({ type: "advanceFinished" });
    router.push("/recommended");
  }, [dispatchSelection, router, selection.library, selection.selectedIds]);

  return (
    <View style={{ flex: 1 }}>
      <MediaSelectScreen
        state={selection}
        onBack={() => router.back()}
        onAllowAccess={() => void requestPermission()}
        onOpenSettings={() => void Linking.openSettings()}
        onToggle={(id) => dispatchSelection({ type: "toggle", id })}
        onOpenTrim={(id) => {
          const item = selection.library.find((candidate) => candidate.id === id);
          if (item) {
            setTrimTarget(item);
            dispatchSelection({ type: "openTrim", id });
          }
        }}
        onSelectMorePhotos={() => void MediaLibrary.presentPermissionsPickerAsync()}
        onContinue={() => void onContinue()}
      />

      {trimTarget ? (
        <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, justifyContent: "flex-end" }}>
          <SheetBackdrop
            onPress={() => {
              setTrimTarget(null);
              dispatchSelection({ type: "closeTrim" });
            }}
          />
          <TrimSheet
            posterUri={trimTarget.uri}
            durationSec={trimTarget.durationSec ?? 0}
            inPointSec={selection.inPoints[trimTarget.id] ?? 0}
            onChange={(inPointSec) =>
              dispatchSelection({ type: "setInPoint", id: trimTarget.id, inPointSec })
            }
            onDone={() => {
              setTrimTarget(null);
              dispatchSelection({ type: "closeTrim" });
            }}
          />
        </View>
      ) : null}
    </View>
  );
}
