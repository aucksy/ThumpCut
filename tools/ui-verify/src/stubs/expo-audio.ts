/**
 * `expo-audio` for the harness. Silent by design — the checker measures pixels, not sound.
 *
 * It still has to answer the same questions the real player does, because the streamed player
 * asks them: is it loaded, where is it, and tell me when that changes. A stub that reports
 * "loaded" would put the harness into the streaming state whether the screen was meant to be
 * in it or not, so this one never loads. Every audio state on the screen is passed in as a
 * prop instead, which is what makes all of them renderable.
 */

export interface EventSubscription {
  remove(): void;
}

export interface AudioStatus {
  isLoaded: boolean;
  playbackState: string;
  currentTime: number;
}

export interface AudioPlayer {
  isLoaded: boolean;
  currentTime: number;
  play(): void;
  pause(): void;
  seekTo(seconds: number): Promise<void>;
  addListener(event: string, listener: (status: AudioStatus) => void): EventSubscription;
  remove(): void;
}

export function createAudioPlayer(): AudioPlayer {
  return {
    isLoaded: false,
    currentTime: 0,
    play() {},
    pause() {},
    async seekTo() {},
    addListener() {
      return { remove() {} };
    },
    remove() {},
  };
}

export async function setAudioModeAsync(): Promise<void> {}

export default { createAudioPlayer, setAudioModeAsync };
