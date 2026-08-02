"""Royalty-free track discovery, from Jamendo.

The section this feeds exists so a reel can carry its music *inside the file* — which
Instagram, YouTube and TikTok all accept — instead of depending on a platform to supply the
track after a handoff. That is only lawful when the licence says so, which shapes everything
here:

* **Only CC BY and CC BY-SA tracks are accepted.** A reel is a derivative work, so ND is
  out; users post reels to monetised accounts, so NC is out. The filter runs in this file
  against each track's own licence URL — the API's licence flags are passed as hints but
  never trusted, because their exact semantics are undocumented.
* **Attribution is owed** — to the artist and to Jamendo. The licence name and URL ride the
  catalogue into the app, which shows the credit on the share screen.
* **Nothing is cached into a library.** The Factory analyses and deletes (invariant P1), the
  app streams for preview and fetches a transient copy at export, deleted after. Jamendo's
  terms forbid building offline collections; making one reel is what the licence itself
  permits.

One free ``JAMENDO_CLIENT_ID`` (devportal.jamendo.com) switches this on. Without it the
section simply does not exist, and nothing else notices.
"""

from __future__ import annotations

import json
import re
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Callable

from factory.config import (
    FETCH_TIMEOUT_SECONDS,
    JAMENDO_API_HOST,
    JAMENDO_API_VERSION,
    Credentials,
)
from factory.discover import DiscoveredTrack

# A spread of moods, matched to the template moods the app already has. Each bucket asks for
# the month's most popular tracks, so the section stays fresh without chasing trends daily.
GENRE_BUCKETS = ("pop", "rock", "electronic", "hiphop", "chillout")
TRACKS_PER_GENRE = 30
# Reels start anywhere in a track, so very short files cut poorly; very long ones are mixes.
MIN_TRACK_SEC = 45
MAX_TRACK_SEC = 420

# The licence gate. Version and port (`/licenses/by/3.0/` vs `.../by-sa/4.0/deed.en`) vary;
# the licence *kind* is the only thing that decides.
_LICENCE_PATTERN = re.compile(
    r"creativecommons\.org/licenses/(by|by-sa)/(\d+(?:\.\d+)?)", re.IGNORECASE
)

_LICENCE_NAMES = {"by": "CC BY", "by-sa": "CC BY-SA"}


class JamendoFailed(RuntimeError):
    """The royalty-free list could not be retrieved. The previous catalogue is kept."""


HttpGetter = Callable[[str], bytes]


def _default_http_get(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(request, timeout=FETCH_TIMEOUT_SECONDS) as response:
        content_type = (response.headers.get("Content-Type") or "").lower()
        body = response.read()
    if "json" not in content_type:
        raise JamendoFailed(
            f"expected JSON, got {content_type or 'no content type'} — "
            f"a captive portal or proxy is likely intercepting the request"
        )
    return body


def licence_for(url: str) -> tuple[str, str] | None:
    """(short name, url) when the licence permits reuse and editing; None otherwise."""
    if not isinstance(url, str) or not url:
        return None
    match = _LICENCE_PATTERN.search(url)
    if not match:
        return None
    kind = match.group(1).lower()
    name = _LICENCE_NAMES.get(kind)
    if name is None:
        return None
    return name, url


def build_tracks_url(credentials: Credentials, genre: str) -> str:
    """One genre bucket's query. ``ccnc``/``ccnd`` are hints; the real gate is licence_for."""
    query = urllib.parse.urlencode(
        {
            "client_id": credentials.jamendo_client_id,
            "format": "json",
            "limit": str(TRACKS_PER_GENRE),
            "fuzzytags": genre,
            "boost": "popularity_month",
            "audioformat": "mp32",
            "include": "licenses",
            "ccnc": "false",
            "ccnd": "false",
            "durationbetween": f"{MIN_TRACK_SEC}_{MAX_TRACK_SEC}",
        }
    )
    return f"{JAMENDO_API_HOST}/{JAMENDO_API_VERSION}/tracks/?{query}"


def parse_tracks(payload: dict[str, Any]) -> list[DiscoveredTrack]:
    """Read Jamendo's response into tracks. Malformed or ineligible entries are skipped."""
    results = payload.get("results")
    if not isinstance(results, list):
        raise JamendoFailed("response has no results array")

    tracks: list[DiscoveredTrack] = []
    for item in results:
        if not isinstance(item, dict):
            continue
        track_id = str(item.get("id") or "").strip()
        stream_url = str(item.get("audio") or "").strip()
        if not track_id or not stream_url.startswith("https://"):
            continue

        licence = licence_for(str(item.get("license_ccurl") or ""))
        if licence is None:
            continue
        licence_name, licence_url = licence

        try:
            duration_sec = int(item.get("duration") or 0)
        except (TypeError, ValueError):
            duration_sec = 0
        if duration_sec < MIN_TRACK_SEC or duration_sec > MAX_TRACK_SEC:
            continue

        tracks.append(
            DiscoveredTrack(
                audio_id=f"jam-{track_id}",
                title=str(item.get("name") or "").strip() or track_id,
                artist=str(item.get("artist_name") or "").strip(),
                duration_ms=duration_sec * 1000,
                download_url=stream_url,
                source="royaltyfree",
                licence_name=licence_name,
                licence_url=licence_url,
                stable_link=True,
            )
        )
    return tracks


def discover_royaltyfree(
    credentials: Credentials,
    http_get: HttpGetter | None = None,
) -> list[DiscoveredTrack]:
    """
    The royalty-free list, deduplicated across genre buckets. Raises JamendoFailed on any
    bucket failing — a partial answer must not be mistaken for tracks having been retired.
    """
    if not credentials.has_jamendo:
        return []

    getter = http_get or _default_http_get
    tracks: list[DiscoveredTrack] = []
    seen: set[str] = set()

    for genre in GENRE_BUCKETS:
        url = build_tracks_url(credentials, genre)
        try:
            body = getter(url)
        except urllib.error.HTTPError as exc:
            raise JamendoFailed(f"Jamendo returned HTTP {exc.code} for {genre}") from exc
        except urllib.error.URLError as exc:
            raise JamendoFailed(f"could not reach Jamendo: {exc.reason}") from exc
        except TimeoutError as exc:
            raise JamendoFailed("Jamendo timed out") from exc

        try:
            payload = json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise JamendoFailed(f"Jamendo returned malformed JSON: {exc}") from exc

        if not isinstance(payload, dict):
            raise JamendoFailed("Jamendo returned a non-object response")

        headers = payload.get("headers")
        if isinstance(headers, dict) and headers.get("status") not in (None, "success"):
            code = headers.get("code")
            message = str(headers.get("error_message") or "unknown error")
            # Code 11 is a suspended or unknown client id — the one failure the owner can
            # actually fix, so it is spelled out.
            if code in (5, 11):
                raise JamendoFailed(
                    f"Jamendo rejected the client id ({message}). Check JAMENDO_CLIENT_ID."
                )
            raise JamendoFailed(f"Jamendo error: {message}")

        for track in parse_tracks(payload):
            if track.audio_id in seen:
                continue
            seen.add(track.audio_id)
            tracks.append(track)

    return tracks
