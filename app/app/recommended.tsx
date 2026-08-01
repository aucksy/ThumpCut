/** Recommended templates for the number of items the user picked. */

import { useMemo } from "react";
import { useRouter } from "expo-router";
import { RecommendedScreen } from "../src/screens/index.tsx";
import { recommendTemplates } from "../src/templates/recommend.ts";
import { useAppState } from "../src/state/AppState.tsx";

export default function RecommendedRoute() {
  const router = useRouter();
  const { templates, tracks, media, chooseTemplate } = useAppState();

  const itemCount = media.length;
  const clipCount = media.filter((item) => item.kind === "video").length;
  const recommendation = useMemo(
    () => recommendTemplates(templates, itemCount),
    [itemCount, templates],
  );

  return (
    <RecommendedScreen
      itemCount={itemCount}
      clipCount={clipCount}
      recommendation={recommendation}
      bpmForTemplate={() => tracks[0]?.bpm ?? 0}
      onBack={() => router.back()}
      onSelectTemplate={(template) => {
        void chooseTemplate(template).then(() => router.push("/preview"));
      }}
    />
  );
}
