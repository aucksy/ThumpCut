/**
 * The JavaScript face of the renderer.
 *
 * The flattening of a cut list lives in `src/render/nativeCuts.ts` — pure, and therefore
 * tested. This file is only the binding, so there is exactly one place to look when a reel
 * comes out wrong and it is not this one.
 */

import { requireOptionalNativeModule } from "expo";
import type { CutList, MediaItem } from "@thumpcut/cut-engine";
import { toNativeCuts } from "../../../src/render/nativeCuts.ts";
import type { NativeCut } from "../../../src/render/nativeCuts.ts";

export type { NativeCut } from "../../../src/render/nativeCuts.ts";
export { toNativeCuts } from "../../../src/render/nativeCuts.ts";

/**
 * The music an export may carry. Never present for a track from Instagram's catalogue —
 * those exports are silent for ever, for licensing reasons that are not up for revision.
 * Present only for the user's own music and for royalty-free tracks whose licence allows it.
 */
export interface RenderAudio {
  /** A local file the renderer can read. Remote URLs are fetched before this is built. */
  uri: string;
  /** Where in the track the reel starts — the same offset the preview played from. */
  startSec: number;
  /** Exactly the reel's length, so the sound ends when the picture does. */
  durationSec: number;
}

export interface ReelRenderNativeModule {
  render(cuts: NativeCut[], outputPath: string, audio: RenderAudio | null): Promise<number>;
  cancel(): Promise<void>;
  probe(path: string): Promise<{
    durationSec: number;
    width: number;
    height: number;
    rotationDeg: number;
  }>;
  addListener(
    event: "onProgress",
    listener: (payload: { fraction: number }) => void,
  ): { remove(): void };
}

const native = requireOptionalNativeModule<ReelRenderNativeModule>("ReelRender");

export const isRendererLinked = native !== null;

export class RendererUnavailableError extends Error {
  constructor() {
    super("The reel renderer is not available in this build. A development build is required.");
    this.name = "RendererUnavailableError";
  }
}

export async function render(
  cutList: CutList,
  media: MediaItem[],
  outputPath: string,
  onProgress: (fraction: number) => void,
  audio: RenderAudio | null = null,
): Promise<number> {
  if (!native) throw new RendererUnavailableError();
  const subscription = native.addListener("onProgress", (payload) => {
    onProgress(payload.fraction);
  });
  try {
    return await native.render(toNativeCuts(cutList, media), outputPath, audio);
  } finally {
    subscription.remove();
  }
}

export async function cancel(): Promise<void> {
  await native?.cancel();
}

export async function probe(path: string) {
  if (!native) throw new RendererUnavailableError();
  return native.probe(path);
}
