"""Trending track discovery.

Live source, and the only permitted one (spec 00 §3.2, spec 01 §2):

    GET /ig_audio?audio_type=music&user_id={IG_USER_ID}&access_token={TOKEN}

Sending no search query returns trending music by default. Each track carries ``audio_id``,
``title``, ``display_artist``, ``duration_in_ms`` and a ``download_url`` — a temporary preview
of the actual recording in Instagram's library.

With no credentials this returns the fixture list instead (spec 01 §10), so nothing downstream
is ever blocked on API access.
"""

from __future__ import annotations

import json
import re
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from factory.config import (
    FETCH_TIMEOUT_SECONDS,
    FIXTURES_DIR,
    LOCAL_DIR,
    META_AUDIO_PATH,
    META_GRAPH_HOST,
    META_GRAPH_VERSION,
    Credentials,
)


class TokenRejected(RuntimeError):
    """Meta rejected the access token. This aborts the run — F2."""


class DiscoveryFailed(RuntimeError):
    """The track list could not be retrieved. The previous catalogue is kept."""


@dataclass(frozen=True)
class DiscoveredTrack:
    """One track as Meta describes it, before any audio is fetched."""

    audio_id: str
    title: str
    artist: str
    duration_ms: int
    download_url: str
    # Set for fixture tracks: read the bytes from here instead of over the network.
    local_path: Path | None = None

    @property
    def is_fixture(self) -> bool:
        return self.local_path is not None


HttpGetter = Callable[[str], bytes]


def _default_http_get(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(request, timeout=FETCH_TIMEOUT_SECONDS) as response:
        content_type = (response.headers.get("Content-Type") or "").lower()
        body = response.read()
    # A captive portal answers every request with HTML and a 200. Catch it here.
    if "json" not in content_type:
        raise DiscoveryFailed(
            f"expected JSON, got {content_type or 'no content type'} — "
            f"a captive portal or proxy is likely intercepting the request"
        )
    return body


def resolve_ig_user_id(token: str, http_get: HttpGetter | None = None) -> str:
    """
    Find the Instagram account behind a token.

    So that setting this up needs **one** value pasted in, not two. The id is not something
    anybody knows off the top of their head — it is looked up through the Facebook Page the
    Instagram account is attached to, which is three clicks in a console most people see once.
    The token already knows the answer; this just asks it.
    """
    getter = http_get or _default_http_get
    query = urllib.parse.urlencode(
        {"fields": "name,instagram_business_account", "access_token": token}
    )
    url = f"{META_GRAPH_HOST}/{META_GRAPH_VERSION}/me/accounts?{query}"
    try:
        payload = json.loads(getter(url).decode("utf-8"))
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as exc:
        raise DiscoveryFailed(f"could not look up the Instagram account: {exc}") from exc
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise DiscoveryFailed(f"malformed answer looking up the Instagram account: {exc}") from exc

    for page in payload.get("data", []):
        linked = page.get("instagram_business_account") or {}
        if linked.get("id"):
            return str(linked["id"])

    raise DiscoveryFailed(
        "no Instagram account is connected to any of your Facebook Pages. On the phone: "
        "Instagram > Settings > Account type and tools > switch to a professional account, "
        "and connect a Facebook Page when it offers. Run 'python -m factory.check_meta' "
        "for the full picture."
    )


def build_trending_url(credentials: Credentials, ig_user_id: str | None = None) -> str:
    """The exact trending endpoint. No search query — that is what returns trending."""
    query = urllib.parse.urlencode(
        {
            "audio_type": "music",
            "user_id": ig_user_id or credentials.ig_user_id,
            "access_token": credentials.meta_access_token,
            "fields": "id,title,display_artist,duration_in_ms,download_url",
        }
    )
    return f"{META_GRAPH_HOST}/{META_GRAPH_VERSION}/{META_AUDIO_PATH}?{query}"


def parse_track_list(payload: dict[str, Any]) -> list[DiscoveredTrack]:
    """Read Meta's response into tracks. Malformed entries are skipped, never fatal."""
    raw_items = payload.get("data")
    if not isinstance(raw_items, list):
        raise DiscoveryFailed("response has no 'data' array")

    tracks: list[DiscoveredTrack] = []
    seen: set[str] = set()

    for item in raw_items:
        if not isinstance(item, dict):
            continue
        audio_id = str(item.get("audio_id") or item.get("id") or "").strip()
        download_url = str(item.get("download_url") or "").strip()
        if not audio_id or not download_url:
            continue
        if audio_id in seen:  # duplicate audio_id — deduplicate before processing
            continue
        try:
            duration_ms = int(item.get("duration_in_ms") or 0)
        except (TypeError, ValueError):
            duration_ms = 0
        seen.add(audio_id)
        tracks.append(
            DiscoveredTrack(
                audio_id=audio_id,
                title=str(item.get("title") or "").strip() or audio_id,
                artist=str(item.get("display_artist") or "").strip(),
                duration_ms=duration_ms,
                download_url=download_url,
            )
        )
    return tracks


def discover_live(credentials: Credentials, http_get: HttpGetter | None = None) -> list[DiscoveredTrack]:
    """Fetch the trending list from Meta. Raises TokenRejected or DiscoveryFailed."""
    getter = http_get or _default_http_get
    # One value to paste in, not two: the token can be asked which Instagram account it is for.
    ig_user_id = credentials.ig_user_id or resolve_ig_user_id(
        credentials.meta_access_token, http_get
    )
    url = build_trending_url(credentials, ig_user_id)
    try:
        body = getter(url)
    except urllib.error.HTTPError as exc:
        if exc.code in (400, 401, 403):
            raise TokenRejected(
                "FATAL: Meta API rejected the token. Check META_ACCESS_TOKEN."
            ) from exc
        raise DiscoveryFailed(f"Meta API returned HTTP {exc.code}") from exc
    except urllib.error.URLError as exc:
        raise DiscoveryFailed(f"could not reach the Meta API: {exc.reason}") from exc
    except TimeoutError as exc:
        raise DiscoveryFailed("the Meta API timed out") from exc

    try:
        payload = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise DiscoveryFailed(f"Meta API returned malformed JSON: {exc}") from exc

    if isinstance(payload, dict) and "error" in payload:
        error = payload.get("error") or {}
        message = str(error.get("message", "unknown error"))
        code = error.get("code")
        if code in (190, 102, 10, 200):
            raise TokenRejected("FATAL: Meta API rejected the token. Check META_ACCESS_TOKEN.")
        raise DiscoveryFailed(f"Meta API error: {message}")

    if not isinstance(payload, dict):
        raise DiscoveryFailed("Meta API returned a non-object response")

    return parse_track_list(payload)


def discover_fixtures(fixtures_dir: Path | None = None) -> list[DiscoveredTrack]:
    """The fixture track list. Used whenever no Meta credentials are present."""
    directory = fixtures_dir or FIXTURES_DIR
    manifest_path = directory / "tracks.json"
    if not manifest_path.is_file():
        raise DiscoveryFailed(
            f"fixture manifest missing: {manifest_path}. "
            f"Run 'python -m factory.fixtures.make_fixtures' to build it."
        )

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    tracks: list[DiscoveredTrack] = []
    for entry in manifest.get("tracks", []):
        audio_path = directory / str(entry["file"])
        tracks.append(
            DiscoveredTrack(
                audio_id=str(entry["audio_id"]),
                title=str(entry["title"]),
                artist=str(entry["artist"]),
                duration_ms=int(entry["duration_in_ms"]),
                download_url=f"fixture://{entry['file']}",
                local_path=audio_path,
            )
        )
    return tracks


AUDIO_SUFFIXES = (".wav", ".mp3", ".m4a", ".aac", ".flac", ".ogg", ".opus")


def discover_local(local_dir: Path | None = None) -> list[DiscoveredTrack]:
    """
    The owner's own music, dropped in ``factory/local``.

    For hearing the cuts against a track he knows — never for the published catalogue; see
    ``assert_permitted_source``. Title and artist are read from the file name when it is
    written ``Artist - Title.mp3``, because that is how downloads are usually named, and
    otherwise the whole file name becomes the title.
    """
    directory = local_dir or LOCAL_DIR
    if not directory.is_dir():
        return []

    tracks: list[DiscoveredTrack] = []
    for path in sorted(directory.iterdir()):
        if not path.is_file() or path.suffix.lower() not in AUDIO_SUFFIXES:
            continue

        stem = path.stem.strip()
        if " - " in stem:
            artist, _, title = stem.partition(" - ")
        else:
            artist, title = "Local", stem

        slug = re.sub(r"[^a-z0-9]+", "-", stem.lower()).strip("-") or "local-track"
        tracks.append(
            DiscoveredTrack(
                audio_id=f"local-{slug}",
                title=title.strip(),
                artist=artist.strip(),
                # Read from the file itself during analysis; nothing here is trusted.
                duration_ms=0,
                download_url=f"local://{path.name}",
                local_path=path,
            )
        )
    return tracks


def discover(
    credentials: Credentials,
    http_get: HttpGetter | None = None,
    fixtures_dir: Path | None = None,
    local_dir: Path | None = None,
) -> tuple[list[DiscoveredTrack], bool]:
    """Return (tracks, used_fixtures). Never raises for missing credentials."""
    # Anything in the local folder wins. It is only ever there because somebody put it there
    # deliberately, and silently ignoring it in favour of the test kit would be baffling.
    local = discover_local(local_dir)
    if local:
        return local, True
    if not credentials.has_meta:
        return discover_fixtures(fixtures_dir), True
    return discover_live(credentials, http_get), False
