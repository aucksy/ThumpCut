/**
 * Preview, with the metronome click and the live beat ruler.
 *
 * V6 — the player and the click are released whenever the app leaves the foreground and
 * recreated when it comes back. A metronome that keeps ticking in a user's pocket is a bug
 * with a very short path to an uninstall.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AppState as RNAppState, View } from "react-native";
import { useRouter } from "expo-router";
import { ExportSheet, PreviewScreen } from "../src/screens/index.tsx";
import { useAppState } from "../src/state/AppState.tsx";
import { MetronomeAudio } from "../src/audio/MetronomeAudio.ts";
import { markersForCuts } from "../src/templates/recommend.ts";
import { formatBpm } from "../src/copy.ts";
import { createRenderEnvironment } from "../src/render/environment.ts";
import { RenderController, type RenderSnapshot } from "../src/render/orchestrator.ts";

const PLAYHEAD_INTERVAL_MS = 33;

export default function PreviewRoute() {
  const router = useRouter();
  const {
    beatMap,
    cutList,
    media,
    templates,
    selectedTemplate,
    selectedTrack,
    notice,
    chooseTemplate,
    shuffle,
  } = useAppState();

  const audio = useRef(new MetronomeAudio()).current;
  const controller = useRef(new RenderController(createRenderEnvironment())).current;

  const [positionSec, setPositionSec] = useState(0);
  const [render, setRender] = useState<RenderSnapshot>(controller.snapshot());
  const [exporting, setExporting] = useState(false);

  useEffect(() => controller.subscribe(setRender), [controller]);

  useEffect(() => {
    if (!beatMap || !cutList) return;
    let cancelled = false;

    void audio.load(beatMap).then(() => {
      if (cancelled) return;
      audio.play(cutList.audioStartSec);
    });

    const timer = setInterval(() => {
      const position = audio.getPositionSec();
      const end = cutList.audioStartSec + cutList.totalDurationSec;
      if (position >= end) {
        audio.play(cutList.audioStartSec);
        setPositionSec(cutList.audioStartSec);
      } else {
        setPositionSec(position);
      }
    }, PLAYHEAD_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
      audio.pause();
    };
  }, [audio, beatMap, cutList]);

  useEffect(() => {
    const subscription = RNAppState.addEventListener("change", (next) => {
      if (next === "active") {
        if (beatMap && cutList) {
          void audio.load(beatMap).then(() => audio.play(cutList.audioStartSec));
        }
      } else {
        audio.release();
      }
    });
    return () => {
      subscription.remove();
      audio.release();
    };
  }, [audio, beatMap, cutList]);

  const onExport = useCallback(() => {
    if (!cutList) return;
    setExporting(true);
    audio.pause();
    // R-I9 — the very cut list the user just watched, not a rebuilt one.
    void controller.start(cutList, media).then((result) => {
      if (result.status === "Complete") {
        setExporting(false);
        router.push({ pathname: "/share", params: { uri: result.outputUri ?? "" } });
      }
    });
  }, [audio, controller, cutList, media, router]);

  if (!beatMap || !cutList || !selectedTemplate || !selectedTrack) {
    return <View style={{ flex: 1 }} />;
  }

  return (
    <View style={{ flex: 1 }}>
      <PreviewScreen
        templateName={selectedTemplate.name}
        trackTitle={selectedTrack.title}
        trackArtist={selectedTrack.artist}
        trackTempo={formatBpm(selectedTrack.bpm)}
        beats={beatMap.beatsSec}
        downbeats={beatMap.downbeatsSec}
        energy={beatMap.energyCurve}
        markers={markersForCuts(cutList.cuts, media)}
        startSec={cutList.audioStartSec}
        durationSec={cutList.totalDurationSec}
        positionSec={positionSec}
        notice={notice}
        templates={templates}
        selectedTemplateId={selectedTemplate.id}
        onBack={() => router.back()}
        onSelectTemplate={(template) => void chooseTemplate(template)}
        onShuffle={() => {
          shuffle();
          void chooseTemplate(selectedTemplate);
        }}
        onExport={onExport}
      />

      {exporting || render.status === "Failed" ? (
        <ExportSheet
          snapshot={render}
          onCancel={() => {
            void controller.cancel();
            setExporting(false);
          }}
          onRetry={onExport}
        />
      ) : null}
    </View>
  );
}
