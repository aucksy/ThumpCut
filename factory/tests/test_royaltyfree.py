"""The royalty-free section: the licence gate, the Jamendo parser, and the publish shape.

The gate is the point. A reel is a derivative work and users monetise their accounts, so
only CC BY and CC BY-SA may pass — and the filter must hold against the licence URL itself,
never against the API's own flags, whose semantics are undocumented.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from factory.config import AUDIO_INDEX_FILENAME, CATALOGUE_FILENAME, Credentials
from factory.discover import DiscoveredTrack
from factory.publish import build_audio_index, build_catalogue, load_templates
from factory.royaltyfree import (
    GENRE_BUCKETS,
    JamendoFailed,
    build_tracks_url,
    discover_royaltyfree,
    licence_for,
    parse_tracks,
)
from factory.run import run_factory
from factory.schema import BeatMap, Section, compute_content_hash
from factory.tests.conftest import make_fixture_dir


def jamendo_credentials() -> Credentials:
    return Credentials("", "", "", "", "", "", "", "b", "", jamendo_client_id="client-1")


# ---------------------------------------------------------------------------
# The licence gate
# ---------------------------------------------------------------------------


def test_by_and_by_sa_pass_the_gate() -> None:
    assert licence_for("https://creativecommons.org/licenses/by/4.0/") == (
        "CC BY",
        "https://creativecommons.org/licenses/by/4.0/",
    )
    assert licence_for("http://creativecommons.org/licenses/by-sa/3.0/deed.en") == (
        "CC BY-SA",
        "http://creativecommons.org/licenses/by-sa/3.0/deed.en",
    )


def test_nc_and_nd_never_pass() -> None:
    # A reel is a derivative work (no ND), and users monetise their accounts (no NC).
    assert licence_for("https://creativecommons.org/licenses/by-nc/4.0/") is None
    assert licence_for("https://creativecommons.org/licenses/by-nd/4.0/") is None
    assert licence_for("https://creativecommons.org/licenses/by-nc-sa/3.0/") is None
    assert licence_for("https://creativecommons.org/licenses/by-nc-nd/4.0/") is None


def test_garbage_never_passes() -> None:
    assert licence_for("") is None
    assert licence_for("https://example.com/licence") is None
    assert licence_for("not a url") is None


# ---------------------------------------------------------------------------
# The parser
# ---------------------------------------------------------------------------


def jamendo_item(**patch: object) -> dict[str, object]:
    item: dict[str, object] = {
        "id": "168",
        "name": "Night Meter",
        "artist_name": "Test Artist",
        "duration": 180,
        "audio": "https://prod-1.storage.jamendo.com/?trackid=168&format=mp32",
        "audiodownload": "https://prod-1.storage.jamendo.com/download/168",
        "audiodownload_allowed": True,
        "license_ccurl": "https://creativecommons.org/licenses/by/4.0/",
    }
    item.update(patch)
    return item


def test_a_valid_track_parses_with_the_full_royaltyfree_shape() -> None:
    tracks = parse_tracks({"results": [jamendo_item()]})
    assert len(tracks) == 1
    track = tracks[0]
    assert track.audio_id == "jam-168"
    assert track.title == "Night Meter"
    assert track.artist == "Test Artist"
    assert track.duration_ms == 180000
    assert track.source == "royaltyfree"
    assert track.licence_name == "CC BY"
    assert track.stable_link is True
    assert track.download_url.startswith("https://")


def test_the_gate_holds_inside_the_parser() -> None:
    payload = {
        "results": [
            jamendo_item(),
            jamendo_item(id="169", license_ccurl="https://creativecommons.org/licenses/by-nc/4.0/"),
            jamendo_item(id="170", license_ccurl="https://creativecommons.org/licenses/by-nd/4.0/"),
        ]
    }
    tracks = parse_tracks(payload)
    assert [track.audio_id for track in tracks] == ["jam-168"]


def test_short_long_and_linkless_tracks_are_skipped() -> None:
    payload = {
        "results": [
            jamendo_item(id="1", duration=20),
            jamendo_item(id="2", duration=4000),
            jamendo_item(id="3", audio=""),
            jamendo_item(id="4", audio="http://insecure.example/track.mp3"),
        ]
    }
    assert parse_tracks(payload) == []


def test_a_missing_results_array_is_a_failure_not_an_empty_list() -> None:
    with pytest.raises(JamendoFailed):
        parse_tracks({"headers": {}})


# ---------------------------------------------------------------------------
# Discovery
# ---------------------------------------------------------------------------


def test_no_client_id_means_no_section_and_no_network() -> None:
    calls: list[str] = []

    def getter(url: str) -> bytes:
        calls.append(url)
        return b"{}"

    tracks = discover_royaltyfree(
        Credentials("", "", "", "", "", "", "", "b", ""), http_get=getter
    )
    assert tracks == []
    assert calls == []


def test_buckets_are_combined_and_deduplicated() -> None:
    def getter(url: str) -> bytes:
        # The same popular track comes back in two genre buckets; it must publish once.
        return json.dumps(
            {"headers": {"status": "success"}, "results": [jamendo_item()]}
        ).encode("utf-8")

    tracks = discover_royaltyfree(jamendo_credentials(), http_get=getter)
    assert len(tracks) == 1
    assert tracks[0].audio_id == "jam-168"


def test_a_rejected_client_id_names_the_secret_to_check() -> None:
    def getter(url: str) -> bytes:
        return json.dumps(
            {"headers": {"status": "failed", "code": 11, "error_message": "suspended"}}
        ).encode("utf-8")

    with pytest.raises(JamendoFailed, match="JAMENDO_CLIENT_ID"):
        discover_royaltyfree(jamendo_credentials(), http_get=getter)


def test_the_query_asks_for_exactly_what_the_gate_needs() -> None:
    url = build_tracks_url(jamendo_credentials(), GENRE_BUCKETS[0])
    assert "client_id=client-1" in url
    assert "include=licenses" in url
    assert "audioformat=mp32" in url


# ---------------------------------------------------------------------------
# The publish shape
# ---------------------------------------------------------------------------


def beat_map_for(track_id: str) -> BeatMap:
    beats = [round(index * 0.5, 6) for index in range(24)]
    beat_map = BeatMap(
        trackId=track_id,
        title="Night Meter",
        artist="Test Artist",
        durationSec=30.0,
        bpm=120.0,
        beatsSec=beats,
        downbeatsSec=beats[::4],
        beatsPerBar=4,
        energyCurve=[0.5] * len(beats),
        sections=[Section(startSec=0.0, endSec=30.0, level="medium")],
        bestWindowStartSec=0.0,
        sourceDurationMs=30000,
        audioFingerprint="sha256-pcm8k:test",
        lastVerifiedAt="2026-08-02T00:00:00Z",
        engine="spectral_dp",
        engineVersion="1.0.0",
    )
    beat_map.contentHash = compute_content_hash(beat_map)
    return beat_map


def test_the_catalogue_row_carries_source_and_licence() -> None:
    catalogue = build_catalogue(
        [beat_map_for("jam-168"), beat_map_for("track-2")],
        load_templates(),
        track_info={
            "jam-168": {
                "source": "royaltyfree",
                "licence_name": "CC BY",
                "licence_url": "https://creativecommons.org/licenses/by/4.0/",
            }
        },
    )
    by_id = {track["trackId"]: track for track in catalogue["tracks"]}
    assert by_id["jam-168"]["source"] == "royaltyfree"
    assert by_id["jam-168"]["licence"] == {
        "name": "CC BY",
        "url": "https://creativecommons.org/licenses/by/4.0/",
    }
    assert by_id["track-2"]["source"] == "instagram"
    assert "licence" not in by_id["track-2"]


def test_a_stable_link_publishes_with_no_expiry() -> None:
    index = build_audio_index(
        [beat_map_for("jam-168")],
        {"jam-168": "https://prod-1.storage.jamendo.com/?trackid=168&format=mp32"},
        stable_ids={"jam-168"},
    )
    entry = index["audio"]["jam-168"]
    assert entry["expiresAt"] is None

    # Without the stable marker the same plain URL is assumed to die, exactly as before.
    unmarked = build_audio_index(
        [beat_map_for("jam-168")],
        {"jam-168": "https://prod-1.storage.jamendo.com/?trackid=168&format=mp32"},
    )
    assert unmarked["audio"]["jam-168"]["expiresAt"] is not None


# ---------------------------------------------------------------------------
# The whole run
# ---------------------------------------------------------------------------


def test_the_section_rides_alongside_fixture_mode(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # The royalty-free "download" is a local file so the run stays offline; its published
    # link is still the https URL, which is what a phone would use.
    source = make_fixture_dir(tmp_path / "jam", [("jam-src", 124.0, 8)])
    royalty_track = DiscoveredTrack(
        audio_id="jam-168",
        title="Night Meter",
        artist="Test Artist",
        duration_ms=0,
        download_url="https://prod-1.storage.jamendo.com/?trackid=168&format=mp32",
        local_path=source / "jam-src.wav",
        source="royaltyfree",
        licence_name="CC BY",
        licence_url="https://creativecommons.org/licenses/by/4.0/",
        stable_link=True,
    )
    monkeypatch.setattr("factory.run.discover_royaltyfree", lambda creds: [royalty_track])

    report = run_factory(
        credentials=jamendo_credentials(),
        out_dir=tmp_path / "out",
        tmp_dir=tmp_path / "tmp",
        skip_upload=True,
    )

    assert report.royaltyfree == 1
    assert "jam-168" in report.published
    assert len(report.published) == 4  # three fixtures plus the section

    catalogue = json.loads((tmp_path / "out" / CATALOGUE_FILENAME).read_text("utf-8"))
    row = next(track for track in catalogue["tracks"] if track["trackId"] == "jam-168")
    assert row["source"] == "royaltyfree"
    assert row["licence"]["name"] == "CC BY"

    index = json.loads((tmp_path / "out" / AUDIO_INDEX_FILENAME).read_text("utf-8"))
    assert index["audio"]["jam-168"]["expiresAt"] is None
    assert index["audio"]["jam-168"]["url"].startswith("https://prod-1.storage.jamendo.com/")


def test_a_jamendo_outage_keeps_the_previous_catalogue(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # First run publishes with the section healthy.
    source = make_fixture_dir(tmp_path / "jam", [("jam-src", 124.0, 8)])
    royalty_track = DiscoveredTrack(
        audio_id="jam-168",
        title="Night Meter",
        artist="Test Artist",
        duration_ms=0,
        download_url="https://prod-1.storage.jamendo.com/?trackid=168&format=mp32",
        local_path=source / "jam-src.wav",
        source="royaltyfree",
        licence_name="CC BY",
        licence_url="https://creativecommons.org/licenses/by/4.0/",
        stable_link=True,
    )
    monkeypatch.setattr("factory.run.discover_royaltyfree", lambda creds: [royalty_track])
    first = run_factory(
        credentials=jamendo_credentials(),
        out_dir=tmp_path / "out",
        tmp_dir=tmp_path / "tmp",
        skip_upload=True,
    )
    assert first.royaltyfree == 1
    before = (tmp_path / "out" / CATALOGUE_FILENAME).read_text("utf-8")

    # Then Jamendo goes down. A partial answer must not read as retirement.
    def broken(creds: Credentials) -> list[DiscoveredTrack]:
        raise JamendoFailed("could not reach Jamendo: down")

    monkeypatch.setattr("factory.run.discover_royaltyfree", broken)
    second = run_factory(
        credentials=jamendo_credentials(),
        out_dir=tmp_path / "out",
        tmp_dir=tmp_path / "tmp",
        skip_upload=True,
    )

    assert second.aborted is False
    assert second.published == []
    assert (tmp_path / "out" / CATALOGUE_FILENAME).read_text("utf-8") == before
