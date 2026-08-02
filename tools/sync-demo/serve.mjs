/**
 * Serves `artifacts/demo/` so the sync demo can be opened in a browser.
 *
 * A page that plays audio has to come off `http://`, not `file://` — browsers refuse to fetch
 * a media file from a page's own folder over `file://`, so the demo would sit there silently.
 *
 * Node's own http module. No dependency for twenty lines.
 *
 * Run:  npm run demo:serve
 */

import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..", "artifacts", "demo");
const PORT = Number(process.env.PORT ?? 4173);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

createServer((request, response) => {
  const requested = decodeURIComponent((request.url ?? "/").split("?")[0]);
  const relative = normalize(requested === "/" ? "index.html" : requested).replace(/^([/\\])+/, "");
  const file = join(ROOT, relative);

  // Never serve outside the demo folder, however the path is spelled.
  if (!file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) {
    response.writeHead(404, { "Content-Type": "text/plain" });
    response.end("Not found. Build the demo first: npm run demo");
    return;
  }

  const type = TYPES[extname(file).toLowerCase()] ?? "application/octet-stream";
  const size = statSync(file).size;
  const range = request.headers.range;

  // Range requests are not an optimisation here, they are the feature. Without them Chrome
  // refuses to treat the audio as seekable, `currentTime` silently stays at zero, and the
  // demo plays from the top of the track instead of the section the engine chose — which
  // looks exactly like the cuts not working.
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (match) {
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
      if (Number.isFinite(start) && start <= end && start < size) {
        response.writeHead(206, {
          "Content-Type": type,
          "Content-Range": `bytes ${start}-${end}/${size}`,
          "Accept-Ranges": "bytes",
          "Content-Length": end - start + 1,
          "Cache-Control": "no-store",
        });
        createReadStream(file, { start, end }).pipe(response);
        return;
      }
      response.writeHead(416, { "Content-Range": `bytes */${size}` });
      response.end();
      return;
    }
  }

  response.writeHead(200, {
    "Content-Type": type,
    "Content-Length": size,
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
  });
  createReadStream(file).pipe(response);
}).listen(PORT, () => {
  console.log(`Sync demo on http://localhost:${PORT}`);
});
