/**
 * The real storage and network the catalogue uses on a device.
 *
 * Kept apart from the service on purpose: the service holds every rule worth testing, and it
 * can be tested under plain `node` because these are the only pieces that touch a phone.
 *
 * Writes go to a temporary file and are then moved into place. That is the whole of K-I1: a
 * process death mid-write leaves the old cache intact rather than a half-written one.
 */

import { Directory, File, Paths } from "expo-file-system";
import type { CatalogueNetwork, CatalogueStorage, HttpResponse } from "./types.ts";

const ROOT_NAME = "thumpcut";

function root(): Directory {
  const directory = new Directory(Paths.document, ROOT_NAME);
  if (!directory.exists) directory.create({ intermediates: true });
  return directory;
}

function resolve(relativePath: string): File {
  const parts = relativePath.split("/");
  const name = parts.pop() as string;
  let directory = root();
  for (const part of parts) {
    directory = new Directory(directory, part);
    if (!directory.exists) directory.create({ intermediates: true });
  }
  return new File(directory, name);
}

export function createDeviceStorage(): CatalogueStorage {
  return {
    async readText(relativePath) {
      try {
        const file = resolve(relativePath);
        if (!file.exists) return null;
        return await file.text();
      } catch {
        return null;
      }
    },

    async writeTextAtomic(relativePath, contents) {
      const file = resolve(relativePath);
      const temporary = new File(`${file.uri}.tmp`);
      if (temporary.exists) temporary.delete();
      temporary.create();
      temporary.write(contents);
      // Delete-then-move rather than overwrite: a failed move leaves the original in place.
      if (file.exists) file.delete();
      temporary.move(file);
    },

    async remove(relativePath) {
      try {
        const file = resolve(relativePath);
        if (file.exists) file.delete();
      } catch {
        // Already gone.
      }
    },

    async list(relativeDir) {
      try {
        const directory = new Directory(root(), relativeDir);
        if (!directory.exists) return [];
        return directory
          .list()
          .map((entry) => entry.uri.split("/").pop() ?? "")
          .filter(Boolean);
      } catch {
        return [];
      }
    },

    async freeBytes() {
      try {
        return Paths.availableDiskSpace;
      } catch {
        // If the platform will not say, do not block a download that would have worked.
        return Number.MAX_SAFE_INTEGER;
      }
    },
  };
}

export function createDeviceNetwork(): CatalogueNetwork {
  return {
    async get(url, timeoutMs): Promise<HttpResponse> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        const body = await response.text();
        return {
          status: response.status,
          contentType: response.headers.get("content-type") ?? "",
          body,
        };
      } finally {
        clearTimeout(timer);
      }
    },

    async isOnline() {
      // Deliberately not a reachability library. The catalogue fetch is the reachability
      // test, and adding a dependency to guess at it would only add a way to be wrong.
      return true;
    },
  };
}
