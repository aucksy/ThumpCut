/** `expo-audio` for the harness. Silent by design — the checker measures pixels, not sound. */

export interface AudioPlayer {
  play(): void;
  pause(): void;
  seekTo(seconds: number): void;
  remove(): void;
}

export function createAudioPlayer(): AudioPlayer {
  return {
    play() {},
    pause() {},
    seekTo() {},
    remove() {},
  };
}

export async function setAudioModeAsync(): Promise<void> {}

export default { createAudioPlayer, setAudioModeAsync };
