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

export interface ReelRenderNativeModule {
  render(cuts: NativeCut[], outputPath: string): Promise<number>;
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
): Promise<number> {
  if (!native) throw new RendererUnavailableError();
  const subscription = native.addListener("onProgress", (payload) => {
    onProgress(payload.fraction);
  });
  try {
    return await native.render(toNativeCuts(cutList, media), outputPath);
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
