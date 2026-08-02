/** Recommended templates for the number of items the user picked, and the track chooser. */

import { useMemo } from "react";
import { useRouter } from "expo-router";
import { RecommendedScreen } from "../src/screens/index.tsx";
import { recommendTemplates } from "../src/templates/recommend.ts";
import { useAppState } from "../src/state/AppState.tsx";

export default function RecommendedRoute() {
  const router = useRouter();
  const { templates, tracks, media, selectedTrack, localTrack, chooseTemplate, chooseTrack } =
    useAppState();

  const itemCount = media.length;
  const clipCount = media.filter((item) => item.kind === "video").length;
  const recommendation = useMemo(
    () => recommendTemplates(templates, itemCount),
    [itemCount, templates],
  );

  // The tempo shown on a template card is the tempo of the track it would be cut against.
  const effectiveTrack = selectedTrack ?? tracks[0] ?? null;

  return (
    <RecommendedScreen
      itemCount={itemCount}
      clipCount={clipCount}
      recommendation={recommendation}
      bpmForTemplate={() => effectiveTrack?.bpm ?? 0}
      tracks={tracks}
      selectedTrackId={effectiveTrack?.trackId ?? null}
      localTrack={localTrack?.track ?? null}
      onSelectTrack={(track) => void chooseTrack(track)}
      onYourMusic={() => router.push("/music")}
      onBack={() => router.back()}
      onSelectTemplate={(template) => {
        void chooseTemplate(template).then(() => router.push("/preview"));
      }}
    />
  );
}
