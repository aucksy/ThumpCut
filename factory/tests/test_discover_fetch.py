"""Discovery and fetching. Every network call is stubbed — nothing here touches the wire."""

from __future__ import annotations

import json
import urllib.error
from pathlib import Path

import pytest

from factory.config import Credentials
from factory.discover import (
    DiscoveredTrack,
    DiscoveryFailed,
    TokenRejected,
    build_trending_url,
    discover,
    discover_fixtures,
    discover_live,
    parse_track_list,
)
from factory.fetch import (
    FetchFailed,
    ForbiddenAudioSource,
    assert_permitted_source,
    assert_temp_dir_empty,
    fetch_audio,
    purge_temp_dir,
)
from factory.tests.conftest import make_fixture_dir


def meta_payload(*items: dict) -> bytes:
    return json.dumps({"data": list(items)}).encode("utf-8")


def track_item(audio_id: str, **overrides) -> dict:
    item = {
        "audio_id": audio_id,
        "title": f"Title {audio_id}",
        "display_artist": "An Artist",
        "duration_in_ms": 180000,
        "download_url": f"https://scontent.example/{audio_id}.m4a",
    }
    item.update(overrides)
    return item


# --- The URL is the one the spec names ------------------------------------------------------

def test_the_trending_url_sends_no_search_query(meta_credentials: Credentials) -> None:
    url = build_trending_url(meta_credentials)
    assert "audio_type=music" in url
    assert "user_id=ig-1" in url
    assert "access_token=token-1" in url
    assert "search" not in url  # no query is what returns trending
    assert "/ig_audio?" in url


def test_the_url_never_points_at_itunes(meta_credentials: Credentials) -> None:
    assert "itunes" not in build_trending_url(meta_credentials).lower()
    assert build_trending_url(meta_credentials).startswith("https://graph.facebook.com/")


# --- Parsing --------------------------------------------------------------------------------

def test_a_normal_response_parses() -> None:
    tracks = parse_track_list(json.loads(meta_payload(track_item("a1"), track_item("a2"))))
    assert [t.audio_id for t in tracks] == ["a1", "a2"]
    assert tracks[0].title == "Title a1"
    assert tracks[0].duration_ms == 180000


def test_duplicate_audio_ids_are_deduplicated() -> None:
    tracks = parse_track_list(
        json.loads(meta_payload(track_item("a1"), track_item("a1"), track_item("a2")))
    )
    assert [t.audio_id for t in tracks] == ["a1", "a2"]


def test_a_malformed_track_is_skipped_and_the_rest_survive() -> None:
    payload = json.loads(
        meta_payload(track_item("a1"), {"nonsense": True}, track_item("a2"))
    )
    payload["data"].append("not even an object")
    tracks = parse_track_list(payload)
    assert [t.audio_id for t in tracks] == ["a1", "a2"]


def test_a_track_with_no_download_url_is_skipped() -> None:
    tracks = parse_track_list(json.loads(meta_payload(track_item("a1", download_url=""))))
    assert tracks == []


def test_a_bad_duration_becomes_zero_rather_than_crashing() -> None:
    tracks = parse_track_list(json.loads(meta_payload(track_item("a1", duration_in_ms="soon"))))
    assert tracks[0].duration_ms == 0


def test_a_response_with_no_data_array_fails() -> None:
    with pytest.raises(DiscoveryFailed, match="no 'data' array"):
        parse_track_list({"something": "else"})


# --- Live discovery failure paths -------------------------------------------------------------

def test_an_invalid_token_aborts_the_run(meta_credentials: Credentials) -> None:
    def raise_401(url: str) -> bytes:
        raise urllib.error.HTTPError(url, 401, "Unauthorized", {}, None)  # type: ignore[arg-type]

    with pytest.raises(TokenRejected) as caught:
        discover_live(meta_credentials, raise_401)
    assert str(caught.value) == "FATAL: Meta API rejected the token. Check META_ACCESS_TOKEN."


def test_an_oauth_error_body_aborts_the_run(meta_credentials: Credentials) -> None:
    def oauth_error(url: str) -> bytes:
        return json.dumps({"error": {"message": "expired", "code": 190}}).encode()

    with pytest.raises(TokenRejected):
        discover_live(meta_credentials, oauth_error)


def test_malformed_json_is_a_discovery_failure_not_a_crash(meta_credentials: Credentials) -> None:
    with pytest.raises(DiscoveryFailed, match="malformed JSON"):
        discover_live(meta_credentials, lambda url: b"<html>captive portal</html>")


def test_a_server_error_is_a_discovery_failure(meta_credentials: Credentials) -> None:
    def raise_500(url: str) -> bytes:
        raise urllib.error.HTTPError(url, 500, "Server Error", {}, None)  # type: ignore[arg-type]

    with pytest.raises(DiscoveryFailed, match="HTTP 500"):
        discover_live(meta_credentials, raise_500)


def test_zero_tracks_is_an_empty_list_not_an_error(meta_credentials: Credentials) -> None:
    assert discover_live(meta_credentials, lambda url: meta_payload()) == []


# --- Fixture mode -------------------------------------------------------------------------------

def test_no_credentials_uses_fixtures(no_credentials: Credentials) -> None:
    tracks, used_fixtures = discover(no_credentials)
    assert used_fixtures is True
    assert len(tracks) == 3
    assert all(track.is_fixture for track in tracks)


def test_fixture_tracks_carry_the_fixture_scheme(no_credentials: Credentials) -> None:
    tracks, _ = discover(no_credentials)
    assert all(track.download_url.startswith("fixture://") for track in tracks)


def test_a_missing_fixture_manifest_says_how_to_fix_it(tmp_path: Path) -> None:
    with pytest.raises(DiscoveryFailed, match="make_fixtures"):
        discover_fixtures(tmp_path)


# --- P8: audio only ever comes from Meta ----------------------------------------------------------

def test_p8_rejects_a_non_meta_source() -> None:
    with pytest.raises(ForbiddenAudioSource, match="invariant P8"):
        assert_permitted_source("http://itunes.apple.com/preview.m4a")


def test_p8_rejects_plain_http() -> None:
    with pytest.raises(ForbiddenAudioSource):
        assert_permitted_source("http://scontent.example/a.m4a")


def test_p8_allows_https_and_fixtures() -> None:
    assert_permitted_source("https://scontent.example/a.m4a")
    assert_permitted_source("fixture://chill-96.wav")


# --- Fetch retries and cleanup ----------------------------------------------------------------------

def test_fetch_retries_three_times_then_fails(tmp_path: Path) -> None:
    attempts: list[str] = []

    def always_fail(url: str, destination: Path) -> None:
        attempts.append(url)
        raise urllib.error.URLError("connection reset")

    track = DiscoveredTrack("a1", "Title a1", "Artist", 1000, "https://x.test/a.m4a")
    with pytest.raises(FetchFailed) as caught:
        fetch_audio(track, tmp_path, always_fail, sleeper=lambda _: None)

    assert len(attempts) == 3
    assert str(caught.value) == "FETCH_FAIL Title a1: connection reset after 3 attempts"


def test_fetch_succeeds_on_a_later_attempt(tmp_path: Path) -> None:
    calls = {"n": 0}

    def fail_once(url: str, destination: Path) -> None:
        calls["n"] += 1
        if calls["n"] == 1:
            raise urllib.error.URLError("flaky")
        destination.write_bytes(b"audio bytes")

    track = DiscoveredTrack("a1", "Title a1", "Artist", 1000, "https://x.test/a.m4a")
    path = fetch_audio(track, tmp_path, fail_once, sleeper=lambda _: None)
    assert path.read_bytes() == b"audio bytes"


def test_a_partial_file_is_never_left_behind(tmp_path: Path) -> None:
    def write_then_fail(url: str, destination: Path) -> None:
        destination.write_bytes(b"half a file")
        raise urllib.error.URLError("dropped")

    track = DiscoveredTrack("a1", "Title a1", "Artist", 1000, "https://x.test/a.m4a")
    with pytest.raises(FetchFailed):
        fetch_audio(track, tmp_path, write_then_fail, sleeper=lambda _: None)
    assert list(tmp_path.iterdir()) == []


def test_p1_purge_empties_the_temp_directory(tmp_path: Path) -> None:
    (tmp_path / "leftover.m4a").write_bytes(b"x")
    (tmp_path / "nested").mkdir()
    (tmp_path / "nested" / "more.wav").write_bytes(b"x")
    purge_temp_dir(tmp_path)
    assert_temp_dir_empty(tmp_path)


def test_p1_assertion_fires_when_audio_survives(tmp_path: Path) -> None:
    (tmp_path / "survivor.m4a").write_bytes(b"x")
    with pytest.raises(AssertionError, match="invariant P1 violated"):
        assert_temp_dir_empty(tmp_path)


def test_a_fixture_track_is_copied_not_downloaded(tmp_path: Path) -> None:
    fixtures = make_fixture_dir(tmp_path / "fx", [("solo", 120.0, 8)])
    track = DiscoveredTrack(
        "solo", "Solo", "Artist", 1000, "fixture://solo.wav", fixtures / "solo.wav"
    )
    destination = fetch_audio(track, tmp_path / "tmp")
    assert destination.is_file()
    assert destination.stat().st_size > 0


def test_a_missing_fixture_file_fails_cleanly(tmp_path: Path) -> None:
    track = DiscoveredTrack(
        "gone", "Gone", "Artist", 1000, "fixture://gone.wav", tmp_path / "nope.wav"
    )
    with pytest.raises(FetchFailed, match="fixture file missing"):
        fetch_audio(track, tmp_path / "tmp")
