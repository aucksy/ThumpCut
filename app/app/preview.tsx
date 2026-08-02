/**
 * Preview, with the real track playing and the live beat ruler.
 *
 * Three things are joined up here and nowhere else:
 *
 *   · **The audio.** `TrackPreviewAudio` streams the actual recording, with the click covering
 *     the moment it takes to arrive and carrying the preview entirely if it never does.
 *   · **The picture.** Whichever of the user's items the cut list says belongs at the current
 *     moment. This is what makes the sync visible rather than merely audible.
 *   · **V6.** Both players and the timer are released whenever the app leaves the foreground
 *     and recreated when it comes back. Audio that keeps playing in a user's pocket is a bug
 *     with a very short path to an uninstall.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState as RNAppState, View } from "react-native";
import { useRouter } from "expo-router";
import { ExportSheet, PreviewScreen } from "../src/screens/index.tsx";
import { useAppState } from "../src/state/AppState.tsx";
import { MetronomeAudio } from "../src/audio/MetronomeAudio.ts";
import type { PreviewAudioMode } from "../src/audio/PreviewAudio.ts";
import { StreamedAudio } from "../src/audio/StreamedAudio.ts";
import { TrackPreviewAudio } from "../src/audio/TrackPreviewAudio.ts";
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
    audioPlan,
    notice,
    chooseTemplate,
    shuffle,
  } = useAppState();

  const controller = useRef(new RenderController(createRenderEnvironment())).current;

  const [positionSec, setPositionSec] = useState(0);
  const [audioMode, setAudioMode] = useState<PreviewAudioMode>("click");
  const [render, setRender] = useState<RenderSnapshot>(controller.snapshot());
  const [exporting, setExporting] = useState(false);
  /**
   * A failed export leaves the controller reporting "Failed" for ever, which would pin the
   * sheet open. This is what lets the user out of it, and it is cleared the moment they try
   * again so a second failure is not swallowed.
   */
  const [dismissedFailure, setDismissedFailure] = useState(false);

  /**
   * Rebuilt when the plan changes — a different track, or a link that has since expired.
   * The only place in the app where the two real players are named.
   */
  const audio = useMemo(
    () =>
      new TrackPreviewAudio({
        plan: audioPlan,
        onStatus: (status) => setAudioMode(status.mode),
        createClick: () => new MetronomeAudio(),
        createStream: (url) => new StreamedAudio(url),
      }),
    [audioPlan],
  );

  // Releasing on the way out is what stops a replaced player carrying on in the background.
  useEffect(() => {
    setAudioMode(audio.status().mode);
    return () => audio.release();
  }, [audio]);

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

  /**
   * The listener below must not be torn down and rebuilt every time the cut list changes —
   * that happens on every style tap, and its cleanup releases the players, which would drop
   * the music back into buffering each time. So it depends only on the audio, and reads the
   * current beat map and cut list from here.
   */
  const latest = useRef({ beatMap, cutList });
  useEffect(() => {
    latest.current = { beatMap, cutList };
  }, [beatMap, cutList]);

  useEffect(() => {
    const subscription = RNAppState.addEventListener("change", (next) => {
      const { beatMap: map, cutList: list } = latest.current;
      if (next === "active") {
        if (map && list) void audio.load(map).then(() => audio.play(list.audioStartSec));
      } else {
        // V6 — nothing keeps playing in a pocket. The effect above recreates it on return.
        audio.release();
      }
    });
    return () => subscription.remove();
  }, [audio]);

  /**
   * The item the cut list says belongs at this moment. Without it the stage is a grey
   * rectangle and there is nothing to check the music against.
   */
  const frameUri = useMemo(() => {
    if (!cutList) return undefined;
    const cuts = cutList.cuts;
    let current = cuts[0];
    for (const cut of cuts) {
      if (cut.startSec <= positionSec + 1e-6) current = cut;
      else break;
    }
    return current ? media[current.mediaIndex]?.uri : undefined;
  }, [cutList, media, positionSec]);

  const onExport = useCallback(() => {
    if (!cutList) return;
    setExporting(true);
    setDismissedFailure(false);
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
        frameUri={frameUri}
        beats={beatMap.beatsSec}
        downbeats={beatMap.downbeatsSec}
        energy={beatMap.energyCurve}
        markers={markersForCuts(cutList.cuts, media)}
        startSec={cutList.audioStartSec}
        durationSec={cutList.totalDurationSec}
        positionSec={positionSec}
        audioMode={audioMode}
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

      {(exporting || render.status === "Failed") && !dismissedFailure ? (
        <ExportSheet
          snapshot={render}
          onCancel={() => {
            void controller.cancel();
            setExporting(false);
          }}
          onRetry={onExport}
          onDismiss={() => {
            setExporting(false);
            setDismissedFailure(true);
          }}
        />
      ) : null}
    </View>
  );
}
