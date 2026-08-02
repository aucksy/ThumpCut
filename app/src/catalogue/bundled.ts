/**
 * The catalogue compiled into the app.
 *
 * Every build is made from the same commit its catalogue is pinned to, so the copy required
 * here is byte-identical to what the first network fetch would return. Bundling it means a
 * fresh install opens instantly with the full gallery — no "Getting things ready", and no
 * dead end when the first launch happens with no connection, which is exactly the situation
 * the Your-music path was built to serve.
 *
 * This file is Metro-only: `require.context` is the bundler's, not Node's, so nothing under
 * test may import this module. The service takes the result as plain strings and validates
 * them with exactly the same checks as a download — a malformed bundle simply means no seed.
 */

import type { CatalogueServiceOptions } from "./service.ts";

export function bundledCatalogue(): CatalogueServiceOptions["bundled"] {
  try {
    // @ts-expect-error — require.context is provided by Metro, not by TypeScript's DOM lib.
    const beatMapContext = require.context("../../../catalogue/beatmaps", false, /\.json$/);
    const beatMaps: Record<string, string> = {};
    for (const key of beatMapContext.keys() as string[]) {
      const trackId = key.replace(/^\.\//, "").replace(/\.json$/, "");
      beatMaps[trackId] = JSON.stringify(beatMapContext(key));
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const catalogue = JSON.stringify(require("../../../catalogue/catalogue.json"));
    return { catalogue, beatMaps };
  } catch {
    // A build without the catalogue directory still works — it downloads, as it always did.
    return undefined;
  }
}
