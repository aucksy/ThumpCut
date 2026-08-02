/**
 * The JavaScript face of the audio decoder.
 *
 * Only the binding lives here. What to decode, where to cache it, and what to do with the
 * samples are all decided in `app/src/music/`, which is pure and tested.
 */

import { requireOptionalNativeModule } from "expo";

export interface DecodedAudioInfo {
  frames: number;
  durationSec: number;
  sampleRate: number;
}

export interface PlayableCopyInfo {
  frames: number;
  durationSec: number;
  sampleRate: number;
  channels: number;
}

export interface AudioFileMetadata {
  title: string | null;
  artist: string | null;
  durationSec: number;
}

interface AudioDecodeNativeModule {
  decode(uri: string, targetSampleRate: number, outputPath: string): Promise<DecodedAudioInfo>;
  decodeToWav(uri: string, outputPath: string, maxDurationSec: number): Promise<PlayableCopyInfo>;
  readMetadata(uri: string): Promise<AudioFileMetadata>;
}

const native = requireOptionalNativeModule<AudioDecodeNativeModule>("AudioDecode");

export const isAudioDecodeLinked = native !== null;

export class AudioDecodeUnavailableError extends Error {
  constructor() {
    super("The audio decoder is not available in this build.");
    this.name = "AudioDecodeUnavailableError";
  }
}

/** Decode a song to mono little-endian float32 at `targetSampleRate`, written to a file. */
export async function decodeAudio(
  uri: string,
  targetSampleRate: number,
  outputPath: string,
): Promise<DecodedAudioInfo> {
  if (!native) throw new AudioDecodeUnavailableError();
  return native.decode(uri, targetSampleRate, outputPath);
}

/** Title, artist and duration as the file declares them. Fields are null when untagged. */
export async function readAudioMetadata(uri: string): Promise<AudioFileMetadata> {
  if (!native) throw new AudioDecodeUnavailableError();
  return native.readMetadata(uri);
}

/**
 * Render the exact playable copy of a song: a plain PCM WAV, cut off after
 * `maxDurationSec`. The preview plays it and the export embeds it, so the clock the beat
 * map was measured on and the clock the phone plays are the same clock — compressed
 * formats carry hidden start padding and imprecise seeking, and this copy carries neither.
 */
export async function renderPlayableCopy(
  uri: string,
  outputPath: string,
  maxDurationSec: number,
): Promise<PlayableCopyInfo> {
  if (!native) throw new AudioDecodeUnavailableError();
  return native.decodeToWav(uri, outputPath, maxDurationSec);
}
