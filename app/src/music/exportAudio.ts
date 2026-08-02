/**
 * What the export is allowed to carry, decided from what the user chose.
 *
 * One pure function, because this is the boundary where the licensing rule lives and it must
 * be impossible to get wrong quietly:
 *
 *   · A track from **Instagram's catalogue** exports silent. Always. Putting the recording in
 *     the file is unlicensed synchronisation — the largest legal exposure this product could
 *     take — and Instagram supplies the licensed track after the handoff. Not up for revision.
 *   · The user's **own file** goes into the export from the device.
 *   · A **royalty-free** track is fetched from the same link the preview streams — provided
 *     that link is usable right now. When it is not, the export is told so and fails with an
 *     honest message rather than quietly producing a mute reel.
 */

import type { PreviewAudioPlan } from "../audio/source.ts";
import { trackSource, type CatalogueTrack } from "../catalogue/types.ts";
import type { ExportAudio } from "../render/orchestrator.ts";

export function deriveExportAudio(
  track: Pick<CatalogueTrack, "source"> | null,
  audioPlan: PreviewAudioPlan,
  localFileUri: string | null,
  audioStartSec: number,
): ExportAudio {
  if (!track) return { kind: "none" };
  const source = trackSource(track);

  if (source === "local") {
    if (!localFileUri) return { kind: "none" };
    return { kind: "file", uri: localFileUri, audioStartSec };
  }

  if (source === "royaltyfree") {
    return {
      kind: "remote",
      url: audioPlan.kind === "stream" ? audioPlan.url : "",
      audioStartSec,
    };
  }

  // Instagram's catalogue: silent, for ever.
  return { kind: "none" };
}
