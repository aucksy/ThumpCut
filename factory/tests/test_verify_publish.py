"""Re-verification and publishing."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import pytest

from factory.config import BEATMAP_DIRNAME, CATALOGUE_FILENAME, Credentials
from factory.discover import DiscoveredTrack
from factory.publish import (
    PublishFailed,
    build_catalogue,
    build_signed_put,
    load_templates,
    upload_to_r2,
    write_local,
)
from factory.schema import compute_content_hash
from factory.tests.test_schema import good_beat_map
from factory.verify import (
    load_previous_beat_maps,
    plan_run,
    recording_changed,
    refresh_verified_at,
)

MOMENT = datetime(2026, 8, 1, 12, 0, 0, tzinfo=timezone.utc)


def beat_map_for(track_id: str, duration_ms: int = 16000, fingerprint: str = "fp-1"):
    beat_map = good_beat_map()
    beat_map.trackId = track_id
    beat_map.title = f"Track {track_id}"
    beat_map.sourceDurationMs = duration_ms
    beat_map.audioFingerprint = fingerprint
    beat_map.contentHash = compute_content_hash(beat_map)
    return beat_map


def discovered(track_id: str, duration_ms: int = 16000) -> DiscoveredTrack:
    return DiscoveredTrack(
        audio_id=track_id,
        title=f"Track {track_id}",
        artist="Artist",
        duration_ms=duration_ms,
        download_url=f"https://scontent.example/{track_id}.m4a",
    )


# --- plan_run -----------------------------------------------------------------------------

def test_a_track_we_have_never_seen_is_new() -> None:
    plan = plan_run([discovered("a")], {})
    assert [t.audio_id for t in plan.new] == ["a"]
    assert plan.unchanged == []
    assert plan.retired == []


def test_a_track_with_the_same_duration_is_a_candidate_for_unchanged() -> None:
    plan = plan_run([discovered("a")], {"a": beat_map_for("a")})
    assert [b.trackId for b in plan.unchanged] == ["a"]
    assert plan.new == []


def test_a_different_duration_marks_the_recording_changed() -> None:
    plan = plan_run([discovered("a", duration_ms=17000)], {"a": beat_map_for("a", 16000)})
    assert [t.audio_id for t in plan.changed] == ["a"]
    assert plan.unchanged == []


def test_a_track_absent_from_the_response_is_retired() -> None:
    plan = plan_run([discovered("a")], {"a": beat_map_for("a"), "b": beat_map_for("b")})
    assert [b.trackId for b in plan.retired] == ["b"]


def test_needs_analysis_covers_new_and_changed() -> None:
    plan = plan_run(
        [discovered("a"), discovered("b", 20000)],
        {"b": beat_map_for("b", 16000)},
    )
    assert sorted(t.audio_id for t in plan.needs_analysis) == ["a", "b"]


def test_a_zero_duration_from_meta_does_not_trigger_a_false_change() -> None:
    plan = plan_run([discovered("a", duration_ms=0)], {"a": beat_map_for("a", 16000)})
    assert [b.trackId for b in plan.unchanged] == ["a"]


# --- fingerprint comparison -----------------------------------------------------------------

def test_a_matching_fingerprint_means_unchanged() -> None:
    assert recording_changed(beat_map_for("a", fingerprint="fp-1"), "fp-1") is False


def test_a_different_fingerprint_means_changed() -> None:
    assert recording_changed(beat_map_for("a", fingerprint="fp-1"), "fp-2") is True


def test_a_missing_stored_fingerprint_forces_a_re_analysis() -> None:
    assert recording_changed(beat_map_for("a", fingerprint=""), "fp-1") is True


def test_p9_refreshing_last_verified_at_leaves_the_content_hash_alone() -> None:
    beat_map = beat_map_for("a")
    before = beat_map.contentHash
    refresh_verified_at(beat_map, "2030-01-01T00:00:00Z")
    assert beat_map.lastVerifiedAt == "2030-01-01T00:00:00Z"
    assert compute_content_hash(beat_map) == before


# --- Catalogue ----------------------------------------------------------------------------

def test_the_catalogue_lists_every_track_with_its_beat_map_path() -> None:
    catalogue = build_catalogue([beat_map_for("a"), beat_map_for("b")], load_templates(), MOMENT)
    paths = [track["beatMapPath"] for track in catalogue["tracks"]]
    assert paths == [f"{BEATMAP_DIRNAME}/a.json", f"{BEATMAP_DIRNAME}/b.json"]


def test_the_catalogue_ships_five_templates() -> None:
    catalogue = build_catalogue([beat_map_for("a")], load_templates(), MOMENT)
    assert len(catalogue["templates"]) == 5


def test_every_template_has_the_fields_the_cut_engine_needs() -> None:
    for template in load_templates():
        assert set(template) >= {
            "id", "name", "idealItemRange", "density", "transition",
            "photoMotion", "videoBehaviour",
        }
        assert set(template["density"]) == {"low", "medium", "high", "drop"}
        assert template["transition"] in ("cut", "crossfade", "zoomPunch")
        assert len(template["idealItemRange"]) == 2


def test_the_catalogue_hash_ignores_the_generated_timestamp() -> None:
    early = build_catalogue([beat_map_for("a")], load_templates(), MOMENT)
    later = build_catalogue(
        [beat_map_for("a")], load_templates(), datetime(2027, 1, 1, tzinfo=timezone.utc)
    )
    assert early["catalogueHash"] == later["catalogueHash"]


def test_the_catalogue_hash_changes_when_a_track_changes() -> None:
    before = build_catalogue([beat_map_for("a")], load_templates(), MOMENT)["catalogueHash"]
    changed = beat_map_for("a")
    changed.beatsSec[3] += 0.02
    changed.contentHash = compute_content_hash(changed)
    after = build_catalogue([changed], load_templates(), MOMENT)["catalogueHash"]
    assert before != after


# --- Local publish ---------------------------------------------------------------------------

def test_publish_writes_the_catalogue_and_every_beat_map(tmp_path: Path) -> None:
    write_local([beat_map_for("a"), beat_map_for("b")], load_templates(), tmp_path, MOMENT)
    assert (tmp_path / CATALOGUE_FILENAME).is_file()
    assert (tmp_path / BEATMAP_DIRNAME / "a.json").is_file()
    assert (tmp_path / BEATMAP_DIRNAME / "b.json").is_file()


def test_publish_leaves_no_staging_directory_behind(tmp_path: Path) -> None:
    write_local([beat_map_for("a")], load_templates(), tmp_path, MOMENT)
    assert not (tmp_path / ".staging").exists()


def test_p6_a_failed_publish_leaves_the_previous_catalogue_untouched(tmp_path: Path) -> None:
    write_local([beat_map_for("a")], load_templates(), tmp_path, MOMENT)
    before = (tmp_path / CATALOGUE_FILENAME).read_text(encoding="utf-8")

    broken = beat_map_for("bad")
    broken.contentHash = "not-the-real-hash"
    with pytest.raises(Exception):
        write_local([broken], load_templates(), tmp_path, MOMENT)

    assert (tmp_path / CATALOGUE_FILENAME).read_text(encoding="utf-8") == before
    assert (tmp_path / BEATMAP_DIRNAME / "a.json").is_file()
    assert not (tmp_path / ".staging").exists()


def test_publishing_nothing_is_refused(tmp_path: Path) -> None:
    with pytest.raises(PublishFailed, match="empty catalogue"):
        write_local([], load_templates(), tmp_path, MOMENT)


def test_a_republish_removes_a_retired_track(tmp_path: Path) -> None:
    write_local([beat_map_for("a"), beat_map_for("b")], load_templates(), tmp_path, MOMENT)
    write_local([beat_map_for("a")], load_templates(), tmp_path, MOMENT)
    assert (tmp_path / BEATMAP_DIRNAME / "a.json").is_file()
    assert not (tmp_path / BEATMAP_DIRNAME / "b.json").exists()
    catalogue = json.loads((tmp_path / CATALOGUE_FILENAME).read_text(encoding="utf-8"))
    assert [t["trackId"] for t in catalogue["tracks"]] == ["a"]


def test_previous_beat_maps_round_trip_through_the_catalogue(tmp_path: Path) -> None:
    write_local([beat_map_for("a"), beat_map_for("b")], load_templates(), tmp_path, MOMENT)
    loaded = load_previous_beat_maps(tmp_path)
    assert sorted(loaded) == ["a", "b"]
    assert loaded["a"].contentHash == beat_map_for("a").contentHash


def test_a_track_whose_beat_map_file_vanished_is_skipped(tmp_path: Path) -> None:
    write_local([beat_map_for("a"), beat_map_for("b")], load_templates(), tmp_path, MOMENT)
    (tmp_path / BEATMAP_DIRNAME / "b.json").unlink()
    assert sorted(load_previous_beat_maps(tmp_path)) == ["a"]


def test_no_previous_catalogue_loads_as_empty(tmp_path: Path) -> None:
    assert load_previous_beat_maps(tmp_path) == {}


# --- R2 signing ----------------------------------------------------------------------------------

def test_the_signed_put_targets_the_right_bucket_and_key(r2_credentials: Credentials) -> None:
    url, headers = build_signed_put(r2_credentials, "catalogue.json", b"{}", "application/json", MOMENT)
    assert url == "https://acct.r2.cloudflarestorage.com/thumpcut-catalogue/catalogue.json"
    assert headers["Authorization"].startswith("AWS4-HMAC-SHA256 Credential=AKIAEXAMPLE/20260801/auto/s3/")
    assert headers["x-amz-date"] == "20260801T120000Z"


def test_signing_is_deterministic(r2_credentials: Credentials) -> None:
    first = build_signed_put(r2_credentials, "a.json", b"{}", "application/json", MOMENT)[1]
    second = build_signed_put(r2_credentials, "a.json", b"{}", "application/json", MOMENT)[1]
    assert first == second


def test_a_different_body_produces_a_different_signature(r2_credentials: Credentials) -> None:
    first = build_signed_put(r2_credentials, "a.json", b"{}", "application/json", MOMENT)[1]
    second = build_signed_put(r2_credentials, "a.json", b'{"x":1}', "application/json", MOMENT)[1]
    assert first["Authorization"] != second["Authorization"]
    assert first["x-amz-content-sha256"] != second["x-amz-content-sha256"]


def test_the_catalogue_is_uploaded_last(tmp_path: Path, r2_credentials: Credentials) -> None:
    """Beat maps first, so the live catalogue never points at a file that has not landed."""
    write_local([beat_map_for("a"), beat_map_for("b")], load_templates(), tmp_path, MOMENT)
    order: list[str] = []

    def record(url: str, body: bytes, headers: dict[str, str]) -> int:
        order.append(url.rsplit("/", 1)[-1])
        return 200

    upload_to_r2(r2_credentials, tmp_path, record, MOMENT)
    assert order[-1] == CATALOGUE_FILENAME
    assert set(order[:-1]) == {"a.json", "b.json"}


def test_a_failed_upload_aborts_the_publish(tmp_path: Path, r2_credentials: Credentials) -> None:
    write_local([beat_map_for("a")], load_templates(), tmp_path, MOMENT)

    def refuse(url: str, body: bytes, headers: dict[str, str]) -> int:
        return 500

    with pytest.raises(PublishFailed, match="PUBLISH_FAIL"):
        upload_to_r2(r2_credentials, tmp_path, refuse, MOMENT)


def test_uploading_without_credentials_is_refused(tmp_path: Path, no_credentials: Credentials) -> None:
    with pytest.raises(PublishFailed, match="R2 credentials"):
        upload_to_r2(no_credentials, tmp_path, lambda *args: 200, MOMENT)
