/**
 * Your music.
 *
 * Scan, pick, analyse, and hand the analysed song to the app state — then straight back to
 * wherever the user was, with the song selected exactly like a catalogue track.
 */

import { useEffect, useRef, useState } from "react";
import { Linking } from "react-native";
import { useRouter } from "expo-router";
import { MusicScreen } from "../src/screens/index.tsx";
import { useAppState } from "../src/state/AppState.tsx";
import { createLocalMusicEnvironment } from "../src/music/environment.ts";
import {
  LocalMusicController,
  type LocalMusicSnapshot,
  type LocalSong,
} from "../src/music/localTracks.ts";

export default function MusicRoute() {
  const router = useRouter();
  const { chooseLocalTrack } = useAppState();

  const controller = useRef(
    new LocalMusicController(createLocalMusicEnvironment()),
  ).current;
  const [snapshot, setSnapshot] = useState<LocalMusicSnapshot>(controller.snapshot());

  useEffect(() => controller.subscribe(setSnapshot), [controller]);

  useEffect(() => {
    void controller.open();
    return () => controller.release();
  }, [controller]);

  const onPick = (song: LocalSong) => {
    void controller.pick(song).then((analysed) => {
      if (!analysed) return;
      void chooseLocalTrack(analysed).then(() => router.back());
    });
  };

  return (
    <MusicScreen
      snapshot={snapshot}
      onBack={() => router.back()}
      onPick={onPick}
      onOpenSettings={() => void Linking.openSettings()}
    />
  );
}
