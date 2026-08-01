/**
 * The device side of the export: files, storage, the gallery, and the native renderer.
 *
 * Every rule about *when* to do these things lives in the orchestrator, which is testable.
 * This is only the doing.
 */

import { File, Paths } from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import type { CutList, MediaItem } from "@thumpcut/cut-engine";
import {
  cancel as cancelNative,
  render as renderNative,
  RendererUnavailableError,
} from "../../modules/reel-render/src/index.ts";
import {
  NativeRenderError,
  type NativeRenderRequest,
  type RenderEnvironment,
} from "./orchestrator.ts";

const KEEP_AWAKE_TAG = "thumpcut-render";
/** Roughly 10 Mbps of video, plus room for the container and a safety margin. */
const BYTES_PER_SECOND = 1_400_000;
const MINIMUM_HEADROOM_BYTES = 200 * 1024 * 1024;
const OUTPUT_NAME = "thumpcut-reel.mp4";

export function createRenderEnvironment(): RenderEnvironment {
  return {
    estimateOutputBytes(cutList: CutList) {
      return Math.max(
        MINIMUM_HEADROOM_BYTES,
        Math.ceil(cutList.totalDurationSec * BYTES_PER_SECOND),
      );
    },

    async freeBytes() {
      try {
        return Paths.availableDiskSpace;
      } catch {
        return Number.MAX_SAFE_INTEGER;
      }
    },

    async itemIsReadable(item: MediaItem) {
      try {
        const file = new File(item.uri);
        return file.exists && (file.size ?? 1) > 0;
      } catch {
        return false;
      }
    },

    async render(request: NativeRenderRequest) {
      try {
        await renderNative(
          request.cutList,
          request.media,
          request.outputPath,
          request.onProgress,
        );
      } catch (error) {
        if (error instanceof RendererUnavailableError) {
          throw new NativeRenderError("unknown", error.message);
        }
        const code = (error as { code?: string }).code ?? "";
        const kind =
          code === "outOfMemory"
            ? "outOfMemory"
            : code === "storageFull"
              ? "storageFull"
              : code === "cancelled"
                ? "cancelled"
                : "unknown";
        throw new NativeRenderError(kind, (error as Error).message ?? "The export failed.");
      }
    },

    async cancelRender() {
      await cancelNative();
    },

    async readOutput(path: string) {
      // Straight to bytes: the §2.1 checks read MP4 boxes, and a base64 round trip of a
      // 20MB reel on a 2GB phone is a needless spike.
      return await new File(path).bytes();
    },

    async deleteFile(path: string) {
      const file = new File(path);
      if (file.exists) file.delete();
    },

    async saveToGallery(path: string) {
      const asset = await MediaLibrary.createAssetAsync(path);
      return asset.uri;
    },

    makeOutputPath() {
      // The name carries no timestamp on purpose: a leftover from a killed render is
      // overwritten rather than accumulating in the cache.
      return new File(Paths.cache, OUTPUT_NAME).uri;
    },

    keepAwake(on: boolean) {
      if (on) void activateKeepAwakeAsync(KEEP_AWAKE_TAG);
      else deactivateKeepAwake(KEEP_AWAKE_TAG);
    },
  };
}
