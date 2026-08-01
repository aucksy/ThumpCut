"""Writing the catalogue out, and pushing it to Cloudflare R2.

Two rules shape this file:

* **A partially failed run never overwrites a good catalogue** (invariant P6). Everything is
  written to a staging directory, validated there, and only then swapped into place.
* **The catalogue is uploaded last.** Beat maps go first, so the live catalogue never points
  at a beat map that has not landed yet. If any upload fails the publish aborts and the
  previous catalogue stays live (F8).

R2 is S3-compatible, so uploads are plain SigV4-signed PUTs over HTTPS. That is a hundred
lines of standard library rather than a dependency on an AWS SDK.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import shutil
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from factory.config import (
    BEATMAP_DIRNAME,
    CATALOGUE_FILENAME,
    FETCH_TIMEOUT_SECONDS,
    OUT_DIR,
    Credentials,
)
from factory.schema import BeatMap, validate_publishable

CATALOGUE_SCHEMA_VERSION = 1
_STAGING_DIRNAME = ".staging"
_R2_REGION = "auto"
_R2_SERVICE = "s3"


class PublishFailed(RuntimeError):
    """The publish could not complete. The previous catalogue is left live — F8."""


class DiskFull(RuntimeError):
    """Ran out of space mid-write. Abort loudly, publish nothing — F7."""


@dataclass(frozen=True)
class CatalogueTrack:
    """One row in catalogue.json. Enough to render the gallery without any beat map."""

    trackId: str
    title: str
    artist: str
    bpm: float
    durationSec: float
    contentHash: str
    beatMapPath: str

    def to_json(self) -> dict[str, Any]:
        return {
            "trackId": self.trackId,
            "title": self.title,
            "artist": self.artist,
            "bpm": self.bpm,
            "durationSec": self.durationSec,
            "contentHash": self.contentHash,
            "beatMapPath": self.beatMapPath,
        }


def load_templates(path: Path | None = None) -> list[dict[str, Any]]:
    """Read the template definitions that ship with the catalogue."""
    source = path or Path(__file__).resolve().parent / "templates.json"
    data = json.loads(source.read_text(encoding="utf-8"))
    templates = data.get("templates")
    if not isinstance(templates, list) or not templates:
        raise PublishFailed(f"{source.name} contains no templates")
    return templates


def build_catalogue(
    beat_maps: list[BeatMap],
    templates: list[dict[str, Any]],
    now: datetime | None = None,
) -> dict[str, Any]:
    """Assemble catalogue.json from the beat maps that survived this run."""
    tracks = [
        CatalogueTrack(
            trackId=beat_map.trackId,
            title=beat_map.title,
            artist=beat_map.artist,
            bpm=beat_map.bpm,
            durationSec=beat_map.durationSec,
            contentHash=beat_map.contentHash,
            beatMapPath=f"{BEATMAP_DIRNAME}/{beat_map.trackId}.json",
        )
        for beat_map in sorted(beat_maps, key=lambda b: b.trackId)
    ]

    stamp = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    catalogue: dict[str, Any] = {
        "schemaVersion": CATALOGUE_SCHEMA_VERSION,
        "generatedAt": stamp.isoformat().replace("+00:00", "Z"),
        "tracks": [track.to_json() for track in tracks],
        "templates": templates,
    }
    catalogue["catalogueHash"] = _hash_payload(
        {key: value for key, value in catalogue.items() if key != "generatedAt"}
    )
    return catalogue


def _hash_payload(payload: dict[str, Any]) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    try:
        path.write_text(text, encoding="utf-8")
    except OSError as exc:
        if getattr(exc, "errno", None) == 28:  # ENOSPC
            raise DiskFull(f"FATAL: disk full while writing {path}") from exc
        raise PublishFailed(f"could not write {path}: {exc}") from exc


def write_local(
    beat_maps: list[BeatMap],
    templates: list[dict[str, Any]],
    out_dir: Path | None = None,
    now: datetime | None = None,
) -> tuple[Path, dict[str, Any]]:
    """Write the catalogue and every beat map atomically. Returns (out_dir, catalogue)."""
    if not beat_maps:
        raise PublishFailed("refusing to publish an empty catalogue")

    for beat_map in beat_maps:
        validate_publishable(beat_map)  # P5 and P9, before anything touches the disk

    destination = out_dir or OUT_DIR
    staging = destination / _STAGING_DIRNAME
    if staging.exists():
        shutil.rmtree(staging, ignore_errors=True)
    staging.mkdir(parents=True, exist_ok=True)

    try:
        for beat_map in beat_maps:
            _write_json(staging / BEATMAP_DIRNAME / f"{beat_map.trackId}.json", beat_map.to_json())

        catalogue = build_catalogue(beat_maps, templates, now)
        _write_json(staging / CATALOGUE_FILENAME, catalogue)

        # K-I5 mirrored on the publish side: every track listed has a file next to it.
        for track in catalogue["tracks"]:
            beat_map_file = staging / track["beatMapPath"]
            if not beat_map_file.is_file():
                raise PublishFailed(
                    f"catalogue lists {track['trackId']} but its beat map was not written"
                )

        _swap_into_place(staging, destination)
        return destination, catalogue
    except Exception:
        shutil.rmtree(staging, ignore_errors=True)
        raise


def _swap_into_place(staging: Path, destination: Path) -> None:
    """Move staged files over the live ones. The last step, and the only destructive one."""
    live_beatmaps = destination / BEATMAP_DIRNAME
    staged_beatmaps = staging / BEATMAP_DIRNAME

    previous = destination / f"{BEATMAP_DIRNAME}.previous"
    shutil.rmtree(previous, ignore_errors=True)

    try:
        if live_beatmaps.exists():
            live_beatmaps.rename(previous)
        staged_beatmaps.rename(live_beatmaps)
        shutil.copyfile(staging / CATALOGUE_FILENAME, destination / CATALOGUE_FILENAME)
    except OSError as exc:
        # Put the old beat maps back so the previous catalogue keeps working.
        if previous.exists() and not live_beatmaps.exists():
            previous.rename(live_beatmaps)
        raise PublishFailed(f"could not swap the new catalogue into place: {exc}") from exc
    finally:
        shutil.rmtree(previous, ignore_errors=True)
        shutil.rmtree(staging, ignore_errors=True)


# ---------------------------------------------------------------------------
# Cloudflare R2 upload — S3-compatible, SigV4-signed PUT.
# ---------------------------------------------------------------------------

HttpPut = Callable[[str, bytes, dict[str, str]], int]


def _sign(key: bytes, message: str) -> bytes:
    return hmac.new(key, message.encode("utf-8"), hashlib.sha256).digest()


def build_signed_put(
    credentials: Credentials,
    object_key: str,
    body: bytes,
    content_type: str,
    now: datetime,
) -> tuple[str, dict[str, str]]:
    """Return (url, headers) for an AWS SigV4-signed PUT against R2."""
    host = f"{credentials.r2_account_id}.r2.cloudflarestorage.com"
    canonical_uri = "/" + "/".join(
        urllib.parse.quote(part, safe="") for part in f"{credentials.r2_bucket}/{object_key}".split("/")
    )
    amz_date = now.strftime("%Y%m%dT%H%M%SZ")
    date_stamp = now.strftime("%Y%m%d")
    payload_hash = hashlib.sha256(body).hexdigest()

    canonical_headers = (
        f"content-type:{content_type}\n"
        f"host:{host}\n"
        f"x-amz-content-sha256:{payload_hash}\n"
        f"x-amz-date:{amz_date}\n"
    )
    signed_headers = "content-type;host;x-amz-content-sha256;x-amz-date"
    canonical_request = "\n".join(
        ["PUT", canonical_uri, "", canonical_headers, signed_headers, payload_hash]
    )

    scope = f"{date_stamp}/{_R2_REGION}/{_R2_SERVICE}/aws4_request"
    string_to_sign = "\n".join(
        [
            "AWS4-HMAC-SHA256",
            amz_date,
            scope,
            hashlib.sha256(canonical_request.encode("utf-8")).hexdigest(),
        ]
    )

    key = _sign(f"AWS4{credentials.r2_secret_access_key}".encode("utf-8"), date_stamp)
    key = _sign(key, _R2_REGION)
    key = _sign(key, _R2_SERVICE)
    key = _sign(key, "aws4_request")
    signature = hmac.new(key, string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()

    authorization = (
        f"AWS4-HMAC-SHA256 Credential={credentials.r2_access_key_id}/{scope}, "
        f"SignedHeaders={signed_headers}, Signature={signature}"
    )
    headers = {
        "Authorization": authorization,
        "Content-Type": content_type,
        "x-amz-content-sha256": payload_hash,
        "x-amz-date": amz_date,
    }
    return f"https://{host}{canonical_uri}", headers


def _default_put(url: str, body: bytes, headers: dict[str, str]) -> int:
    request = urllib.request.Request(url, data=body, headers=headers, method="PUT")
    with urllib.request.urlopen(request, timeout=FETCH_TIMEOUT_SECONDS) as response:
        return int(response.status)


def upload_to_r2(
    credentials: Credentials,
    out_dir: Path,
    http_put: HttpPut | None = None,
    now: datetime | None = None,
) -> list[str]:
    """Upload beat maps first, then the catalogue. Raises PublishFailed on the first error."""
    if not credentials.has_r2:
        raise PublishFailed("R2 credentials are not set")

    put = http_put or _default_put
    stamp = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)

    beat_map_files = sorted((out_dir / BEATMAP_DIRNAME).glob("*.json"))
    ordered: list[tuple[str, Path]] = [
        (f"{BEATMAP_DIRNAME}/{path.name}", path) for path in beat_map_files
    ]
    ordered.append((CATALOGUE_FILENAME, out_dir / CATALOGUE_FILENAME))

    uploaded: list[str] = []
    for object_key, path in ordered:
        body = path.read_bytes()
        url, headers = build_signed_put(credentials, object_key, body, "application/json", stamp)
        try:
            status = put(url, body, headers)
        except urllib.error.HTTPError as exc:
            raise PublishFailed(f"PUBLISH_FAIL {object_key}: HTTP {exc.code}") from exc
        except (urllib.error.URLError, OSError) as exc:
            raise PublishFailed(f"PUBLISH_FAIL {object_key}: {exc}") from exc
        if status // 100 != 2:
            raise PublishFailed(f"PUBLISH_FAIL {object_key}: HTTP {status}")
        uploaded.append(object_key)

    return uploaded


def free_disk_bytes(path: Path) -> int:
    """Bytes available where we are about to write. Used to fail early rather than midway.

    Returns a very large number when the platform will not report it, so an unknown value
    never blocks a run that would have succeeded.
    """
    try:
        return shutil.disk_usage(path if path.exists() else path.parent).free
    except OSError:
        return 1 << 40
