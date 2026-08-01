/**
 * The entry route: first launch until the catalogue is cached, then the gallery.
 */

import { useEffect } from "react";
import { useRouter } from "expo-router";
import { GalleryScreen, LaunchScreen, type LaunchState } from "../src/screens/index.tsx";
import { useAppState } from "../src/state/AppState.tsx";

export default function Home() {
  const router = useRouter();
  const { catalogue, templates, tracks, loadCatalogue, retryCatalogue } = useAppState();

  useEffect(() => {
    void loadCatalogue();
  }, [loadCatalogue]);

  const ready =
    catalogue.state === "Ready" ||
    catalogue.state === "OfflineWithCache" ||
    catalogue.state === "Stale";

  if (ready && templates.length > 0) {
    return (
      <GalleryScreen
        templates={templates}
        bpmForTemplate={() => tracks[0]?.bpm ?? 0}
        onCreate={() => router.push("/media")}
        onSelectTemplate={() => router.push("/media")}
        onOpenSettings={() => router.push("/settings")}
      />
    );
  }

  const state: LaunchState =
    catalogue.state === "OfflineNoCache"
      ? "offline"
      : catalogue.state === "DownloadFailed"
        ? catalogue.message?.includes("storage")
          ? "storage"
          : "failed"
        : catalogue.state === "Downloading"
          ? "downloading"
          : "default";

  return (
    <LaunchScreen
      state={state}
      onGetStarted={() => void loadCatalogue()}
      onRetry={() => void retryCatalogue()}
    />
  );
}
