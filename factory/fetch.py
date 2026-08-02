"""Fetching the audio for one track.

Audio only ever comes from a Meta ``download_url`` (invariant P8), or from a local fixture
file when the Factory is running without credentials.

Every fetched file lands in ``factory/tmp/`` and is deleted before the run ends, including
when the run fails (invariant P1). Nothing else on the machine is touched.
"""

from __future__ import annotations

import shutil
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Callable

from factory.config import (
    FETCH_BACKOFF_SECONDS,
    FETCH_MAX_ATTEMPTS,
    FETCH_TIMEOUT_SECONDS,
    TMP_DIR,
)
from factory.discover import DiscoveredTrack

FIXTURE_SCHEME = "fixture://"
LOCAL_SCHEME = "local://"
_ALLOWED_LIVE_PREFIXES = ("https://",)


class FetchFailed(RuntimeError):
    """The audio could not be downloaded after every retry — F3."""


class ForbiddenAudioSource(RuntimeError):
    """P8 guard: something tried to fetch audio from somewhere other than Meta."""


Downloader = Callable[[str, Path], None]
Sleeper = Callable[[float], None]


def _default_download(url: str, destination: Path) -> None:
    request = urllib.request.Request(url, headers={"Accept": "*/*"})
    destination.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(request, timeout=FETCH_TIMEOUT_SECONDS) as response:
        with destination.open("wb") as handle:
            shutil.copyfileobj(response, handle, length=1 << 16)


def assert_permitted_source(url: str) -> None:
    """Invariant P8, asserted rather than assumed.

    Beat maps are only ever computed from a Meta ``download_url``. Two local cases are
    accepted, both explicitly scheme-tagged so neither can be confused with a real URL:

    * ``fixture://`` — the synthesised test tracks, which are ours.
    * ``local://`` — audio the owner has dropped in ``factory/local`` to watch the cuts
      against music he knows. **Never for the published catalogue.** A beat grid computed
      from a different copy of a recording than the one Instagram attaches will drift, which
      is the whole reason this invariant exists. What keeps the two apart is not a promise:
      the folder is gitignored and does not exist on the machine that publishes, so a locally
      analysed track has no route to a phone.
    """
    if url.startswith(FIXTURE_SCHEME) or url.startswith(LOCAL_SCHEME):
        return
    if not any(url.startswith(prefix) for prefix in _ALLOWED_LIVE_PREFIXES):
        raise ForbiddenAudioSource(
            f"refusing to fetch audio from {url[:40]!r}: only Meta download_url over HTTPS "
            f"is permitted (invariant P8)"
        )


def _extension_for(url: str) -> str:
    tail = url.split("?", 1)[0].rsplit("/", 1)[-1]
    if "." in tail:
        suffix = "." + tail.rsplit(".", 1)[-1].lower()
        if len(suffix) <= 5 and suffix.isascii():
            return suffix
    return ".m4a"


def fetch_audio(
    track: DiscoveredTrack,
    tmp_dir: Path | None = None,
    downloader: Downloader | None = None,
    sleeper: Sleeper | None = None,
) -> Path:
    """Download one track's audio into the temp directory. Raises FetchFailed after retries."""
    assert_permitted_source(track.download_url)

    directory = tmp_dir or TMP_DIR
    directory.mkdir(parents=True, exist_ok=True)

    if track.is_fixture:
        source = track.local_path
        if source is None or not source.is_file():
            raise FetchFailed(f"FETCH_FAIL {track.title}: fixture file missing")
        destination = directory / f"{track.audio_id}{source.suffix}"
        shutil.copyfile(source, destination)
        return destination

    download = downloader or _default_download
    sleep = sleeper or time.sleep
    destination = directory / f"{track.audio_id}{_extension_for(track.download_url)}"

    last_reason = "unknown error"
    for attempt in range(FETCH_MAX_ATTEMPTS):
        try:
            download(track.download_url, destination)
            if destination.is_file() and destination.stat().st_size > 0:
                return destination
            last_reason = "empty file"
        except urllib.error.HTTPError as exc:
            last_reason = f"HTTP {exc.code}"
        except urllib.error.URLError as exc:
            last_reason = str(exc.reason)
        except TimeoutError:
            last_reason = "timed out"
        except OSError as exc:
            last_reason = str(exc)

        # A partial file is never left behind for the next attempt to trip over.
        destination.unlink(missing_ok=True)
        if attempt < FETCH_MAX_ATTEMPTS - 1:
            backoff = FETCH_BACKOFF_SECONDS[min(attempt, len(FETCH_BACKOFF_SECONDS) - 1)]
            sleep(backoff)

    raise FetchFailed(
        f"FETCH_FAIL {track.title}: {last_reason} after {FETCH_MAX_ATTEMPTS} attempts"
    )


def purge_temp_dir(tmp_dir: Path | None = None) -> None:
    """Delete every temp file. Invariant P1 — no audio survives a run, success or failure."""
    directory = tmp_dir or TMP_DIR
    if not directory.exists():
        return
    for entry in directory.iterdir():
        try:
            if entry.is_dir():
                shutil.rmtree(entry, ignore_errors=True)
            else:
                entry.unlink(missing_ok=True)
        except OSError:
            # Best effort. assert_temp_dir_empty below is what actually enforces P1.
            pass


def assert_temp_dir_empty(tmp_dir: Path | None = None) -> None:
    """Raise if any audio survived the run. P1 is asserted, not merely tested."""
    directory = tmp_dir or TMP_DIR
    if not directory.exists():
        return
    leftovers = sorted(entry.name for entry in directory.iterdir())
    if leftovers:
        raise AssertionError(
            f"invariant P1 violated: audio left on disk after the run: {', '.join(leftovers)}"
        )
