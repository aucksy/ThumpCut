/**
 * Share.
 *
 * Availability is re-checked every time this screen appears, not once at launch. A user can
 * uninstall Instagram between two exports, and a button that then does nothing is worse than
 * no button.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { AppState as RNAppState, Linking } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { File } from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import Constants from "expo-constants";
import { ShareScreen } from "../src/screens/index.tsx";
import { useAppState } from "../src/state/AppState.tsx";
import { markersForCuts } from "../src/templates/recommend.ts";
import {
  SaveError,
  ShareController,
  type ShareEnvironment,
  type ShareSnapshot,
} from "../src/share/controller.ts";
import { isAvailable, shareToReels } from "../modules/instagram-share/src/index.ts";

const META_APP_ID =
  (Constants.expoConfig?.extra as { metaAppId?: string } | undefined)?.metaAppId ?? "";

function createShareEnvironment(): ShareEnvironment {
  return {
    // S1 — the button is shown only when the share can actually be accepted, and absent
    // otherwise. Instagram silently ignores a share carrying no application id, so a build
    // without one cannot hand anything off; offering the button would be a promise the app
    // cannot keep, and the failure would look like Instagram's fault rather than a missing
    // setting.
    isInstagramAvailable: async () => META_APP_ID !== "" && (await isAvailable()),
    shareToReels: (videoUri) => shareToReels(videoUri, META_APP_ID),
    async saveToGallery(videoUri) {
      const permission = await MediaLibrary.requestPermissionsAsync();
      if (!permission.granted) throw new SaveError("permission", "denied");
      try {
        await MediaLibrary.createAssetAsync(videoUri);
      } catch (error) {
        const message = (error as Error).message ?? "";
        throw new SaveError(/space|storage/i.test(message) ? "storage" : "unknown", message);
      }
    },
    async fileExists(videoUri) {
      try {
        return new File(videoUri).exists;
      } catch {
        return false;
      }
    },
    openSettings: () => Linking.openSettings(),
  };
}

export default function ShareRoute() {
  const router = useRouter();
  const { uri } = useLocalSearchParams<{ uri?: string }>();
  const { beatMap, cutList, media } = useAppState();

  const controller = useRef(
    new ShareController(createShareEnvironment(), uri ?? null),
  ).current;
  const [snapshot, setSnapshot] = useState<ShareSnapshot>(controller.snapshot());

  useEffect(() => controller.subscribe(setSnapshot), [controller]);

  useEffect(() => {
    void controller.refresh();
    const subscription = RNAppState.addEventListener("change", (next) => {
      // Coming back from Instagram is not an ending. The file stays and both buttons stay.
      if (next === "active") void controller.refresh();
    });
    return () => subscription.remove();
  }, [controller]);

  const markers = useMemo(
    () => (cutList ? markersForCuts(cutList.cuts, media) : []),
    [cutList, media],
  );

  return (
    <ShareScreen
      snapshot={snapshot}
      beats={beatMap?.beatsSec ?? []}
      downbeats={beatMap?.downbeatsSec ?? []}
      energy={beatMap?.energyCurve ?? []}
      markers={markers}
      startSec={cutList?.audioStartSec ?? 0}
      durationSec={cutList?.totalDurationSec ?? 1}
      onBack={() => router.back()}
      onShare={() => void controller.shareToInstagram()}
      onSave={() => void controller.saveToGallery()}
      onOpenSettings={() => void controller.openSettings()}
    />
  );
}
