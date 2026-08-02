/**
 * The device side of "Your music": the media library, the native decoder, the beat engine,
 * and the beat-map cache. Every rule about *when* to do these things lives in
 * `localTracks.ts`, which is testable. This is only the doing.
 */

import { Directory, File, Paths } from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import { analyseSamples, validateBeatMap } from "@thumpcut/beat-engine";
import type { BeatMap } from "@thumpcut/cut-engine";
import {
  decodeAudio,
  readAudioMetadata,
  renderPlayableCopy,
} from "../../modules/audio-decode/src/index.ts";
import type { LocalMusicEnvironment, LocalSong } from "./localTracks.ts";
import { LOCAL_ANALYSIS_SAMPLE_RATE } from "./localTracks.ts";

/** Documents, not cache: an analysis the phone spent ten seconds on should survive a purge. */
const BEATMAP_DIR = "localbeats";
/** Scratch decode output. Overwritten per analysis, deleted after. */
const SCRATCH_NAME = "thumpcut-analysis.f32";
/** The library can hold thousands of files; the list stays usable at a few hundred. */
const MAX_SONGS = 400;

export function createLocalMusicEnvironment(): LocalMusicEnvironment {
  const beatMapDir = new Directory(Paths.document, BEATMAP_DIR);

  return {
    async requestPermission() {
      const response = await MediaLibrary.requestPermissionsAsync(false, ["audio"]);
      return response.granted ? "granted" : "denied";
    },

    async listSongs(): Promise<LocalSong[]> {
      const page = await MediaLibrary.getAssetsAsync({
        mediaType: "audio",
        first: MAX_SONGS,
        sortBy: [[MediaLibrary.SortBy.modificationTime, false]],
      });
      return page.assets.map((asset) => ({
        id: asset.id,
        uri: asset.uri,
        filename: asset.filename,
        durationSec: asset.duration,
        modifiedAt: asset.modificationTime,
      }));
    },

    async readMetadata(uri: string) {
      const metadata = await readAudioMetadata(uri);
      return { title: metadata.title, artist: metadata.artist };
    },

    async decodeToSamples(uri: string) {
      const scratch = new File(Paths.cache, SCRATCH_NAME);
      await decodeAudio(uri, LOCAL_ANALYSIS_SAMPLE_RATE, scratch.uri);
      return scratch.uri;
    },

    async readSamples(path: string) {
      const bytes = await new File(path).bytes();
      // The decoder writes little-endian float32, which is also every phone's native order,
      // so this view is a reinterpretation rather than a copy.
      return new Float32Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 4));
    },

    async deleteFile(path: string) {
      const file = new File(path);
      if (file.exists) file.delete();
    },

    async analyse(samples, sampleRate, info, onProgress) {
      return analyseSamples(samples, sampleRate, info, {
        onProgress: async (fraction) => {
          onProgress(fraction);
          // Yield the JS thread so the progress number actually paints mid-analysis.
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        },
      });
    },

    async readCachedBeatMap(key: string): Promise<BeatMap | null> {
      try {
        const file = new File(beatMapDir, `${key}.json`);
        if (!file.exists) return null;
        const parsed = JSON.parse(await file.text()) as BeatMap;
        // A cache written by an older engine version, or a corrupted file, is re-analysed
        // rather than trusted.
        if (validateBeatMap(parsed) !== null) return null;
        return parsed;
      } catch {
        return null;
      }
    },

    async writeCachedBeatMap(key: string, beatMap: BeatMap) {
      try {
        if (!beatMapDir.exists) beatMapDir.create({ intermediates: true });
        const file = new File(beatMapDir, `${key}.json`);
        file.write(JSON.stringify(beatMap));
      } catch {
        // A failed cache write costs a re-analysis next time, nothing more.
      }
    },

    playableCopyPath(key: string) {
      return new File(beatMapDir, `${key}.wav`).uri;
    },

    async fileExists(path: string) {
      try {
        return new File(path).exists;
      } catch {
        return false;
      }
    },

    async renderPlayableCopy(uri: string, toPath: string, maxDurationSec: number) {
      if (!beatMapDir.exists) beatMapDir.create({ intermediates: true });
      await renderPlayableCopy(uri, toPath, maxDurationSec);
    },

    async removeOtherPlayableCopies(keepKey: string) {
      try {
        if (!beatMapDir.exists) return;
        for (const entry of beatMapDir.list()) {
          if (entry instanceof File && entry.name.endsWith(".wav") && entry.name !== `${keepKey}.wav`) {
            entry.delete();
          }
        }
      } catch {
        // A copy that will not delete costs disk, not correctness.
      }
    },
  };
}
