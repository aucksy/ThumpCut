"""The whole Factory, end to end. Offline, deterministic, no credentials."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from factory.config import BEATMAP_DIRNAME, CATALOGUE_FILENAME, Credentials
from factory.fetch import assert_temp_dir_empty
from factory.run import run_factory
from factory.tests.conftest import make_fixture_dir


def run_in(tmp_path: Path, credentials: Credentials, fixtures: Path | None = None):
    return run_factory(
        credentials=credentials,
        out_dir=tmp_path / "out",
        tmp_dir=tmp_path / "tmp",
        fixtures_dir=fixtures,
        skip_upload=True,
    )


def test_fixture_mode_runs_end_to_end_with_no_credentials(
    tmp_path: Path, no_credentials: Credentials, capsys: pytest.CaptureFixture[str]
) -> None:
    report = run_in(tmp_path, no_credentials)
    output = capsys.readouterr().out

    assert report.used_fixtures is True
    assert len(report.published) == 3
    assert report.exit_code == 0
    assert (
        "NO_CREDENTIALS: running in fixture mode. Set META_ACCESS_TOKEN for live data."
        in output
    )


def test_f1_log_line_is_exact(
    tmp_path: Path, no_credentials: Credentials, capsys: pytest.CaptureFixture[str]
) -> None:
    run_in(tmp_path, no_credentials)
    lines = capsys.readouterr().out.splitlines()
    assert lines[0] == (
        "NO_CREDENTIALS: running in fixture mode. Set META_ACCESS_TOKEN for live data."
    )


def test_the_catalogue_has_three_tracks(tmp_path: Path, no_credentials: Credentials) -> None:
    run_in(tmp_path, no_credentials)
    catalogue = json.loads(
        (tmp_path / "out" / CATALOGUE_FILENAME).read_text(encoding="utf-8")
    )
    assert len(catalogue["tracks"]) == 3
    assert len(catalogue["templates"]) == 5


def test_every_listed_track_has_a_beat_map_file(
    tmp_path: Path, no_credentials: Credentials
) -> None:
    run_in(tmp_path, no_credentials)
    catalogue = json.loads(
        (tmp_path / "out" / CATALOGUE_FILENAME).read_text(encoding="utf-8")
    )
    for track in catalogue["tracks"]:
        assert (tmp_path / "out" / track["beatMapPath"]).is_file()


def test_p1_no_audio_survives_a_successful_run(
    tmp_path: Path, no_credentials: Credentials
) -> None:
    run_in(tmp_path, no_credentials)
    assert_temp_dir_empty(tmp_path / "tmp")


def test_p1_no_audio_survives_a_run_where_every_track_fails(tmp_path: Path) -> None:
    """A forced failure must clean up exactly as thoroughly as a success."""
    fixtures = make_fixture_dir(
        tmp_path / "fx",
        [("bad-1", 120.0, 8), ("bad-2", 120.0, 8)],
        broken=["bad-1", "bad-2"],
    )
    report = run_factory(
        credentials=Credentials("", "", "", "", "", "", "", "b", ""),
        out_dir=tmp_path / "out",
        tmp_dir=tmp_path / "tmp",
        fixtures_dir=fixtures,
        skip_upload=True,
    )
    assert report.published == []
    assert len(report.failures) == 2
    assert_temp_dir_empty(tmp_path / "tmp")


def test_one_broken_track_in_a_batch_of_five_leaves_four_published(tmp_path: Path) -> None:
    fixtures = make_fixture_dir(
        tmp_path / "fx",
        [
            ("t-1", 96.0, 8),
            ("t-2", 110.0, 8),
            ("t-3", 124.0, 8),
            ("t-4", 138.0, 8),
            ("t-5", 150.0, 8),
        ],
        broken=["t-3"],
    )
    report = run_factory(
        credentials=Credentials("", "", "", "", "", "", "", "b", ""),
        out_dir=tmp_path / "out",
        tmp_dir=tmp_path / "tmp",
        fixtures_dir=fixtures,
        skip_upload=True,
    )
    assert len(report.published) == 4
    assert "t-3" not in report.published
    assert len(report.failures) == 1
    assert report.failures[0][0] == "T 3"
    assert "zero bytes" in report.failures[0][1]
    assert report.exit_code == 0


def test_a_second_run_reports_everything_unchanged(
    tmp_path: Path, no_credentials: Credentials
) -> None:
    run_in(tmp_path, no_credentials)
    second = run_in(tmp_path, no_credentials)
    assert len(second.unchanged) == 3
    assert second.changed == []
    assert len(second.published) == 3


def test_an_unchanged_run_does_not_move_the_content_hash(
    tmp_path: Path, no_credentials: Credentials
) -> None:
    run_in(tmp_path, no_credentials)
    first = json.loads((tmp_path / "out" / CATALOGUE_FILENAME).read_text(encoding="utf-8"))
    run_in(tmp_path, no_credentials)
    second = json.loads((tmp_path / "out" / CATALOGUE_FILENAME).read_text(encoding="utf-8"))

    before = {t["trackId"]: t["contentHash"] for t in first["tracks"]}
    after = {t["trackId"]: t["contentHash"] for t in second["tracks"]}
    assert before == after


def test_an_unchanged_run_still_moves_last_verified_at(
    tmp_path: Path, no_credentials: Credentials
) -> None:
    run_in(tmp_path, no_credentials)
    path = tmp_path / "out" / BEATMAP_DIRNAME / "fixture-chill-96.json"
    first = json.loads(path.read_text(encoding="utf-8"))["lastVerifiedAt"]
    run_in(tmp_path, no_credentials)
    second = json.loads(path.read_text(encoding="utf-8"))["lastVerifiedAt"]
    assert second >= first


def test_swapping_the_recording_triggers_a_re_analysis(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """The dangerous case: same id, same duration, different recording."""
    credentials = Credentials("", "", "", "", "", "", "", "b", "")
    fixtures = make_fixture_dir(tmp_path / "fx", [("swap-me", 124.0, 10)])
    run_factory(
        credentials=credentials,
        out_dir=tmp_path / "out",
        tmp_dir=tmp_path / "tmp",
        fixtures_dir=fixtures,
        skip_upload=True,
    )
    before = json.loads(
        (tmp_path / "out" / BEATMAP_DIRNAME / "swap-me.json").read_text(encoding="utf-8")
    )

    # Same file name, same manifest, different recording underneath.
    from factory.audio_io import write_wav
    from factory.fixtures.make_fixtures import SAMPLE_RATE, synthesise

    samples, _ = synthesise(150.0, 10, seed=999)
    write_wav(fixtures / "swap-me.wav", samples, SAMPLE_RATE)

    capsys.readouterr()
    report = run_factory(
        credentials=credentials,
        out_dir=tmp_path / "out",
        tmp_dir=tmp_path / "tmp",
        fixtures_dir=fixtures,
        skip_upload=True,
    )
    output = capsys.readouterr().out

    assert "swap-me" in report.changed
    assert "CHANGED Swap Me: fingerprint differs, re-analysing" in output

    after = json.loads(
        (tmp_path / "out" / BEATMAP_DIRNAME / "swap-me.json").read_text(encoding="utf-8")
    )
    assert after["contentHash"] != before["contentHash"]
    assert abs(after["bpm"] - 150.0) <= 1.0


def test_a_track_that_disappears_is_retired_and_removed(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    credentials = Credentials("", "", "", "", "", "", "", "b", "")
    fixtures = make_fixture_dir(tmp_path / "fx", [("keep", 120.0, 8), ("drop", 130.0, 8)])
    run_factory(
        credentials=credentials, out_dir=tmp_path / "out", tmp_dir=tmp_path / "tmp",
        fixtures_dir=fixtures, skip_upload=True,
    )

    make_fixture_dir(fixtures, [("keep", 120.0, 8)])
    capsys.readouterr()
    report = run_factory(
        credentials=credentials, out_dir=tmp_path / "out", tmp_dir=tmp_path / "tmp",
        fixtures_dir=fixtures, skip_upload=True,
    )
    output = capsys.readouterr().out

    assert report.retired == ["drop"]
    assert "RETIRED Drop: no longer in Instagram's library" in output
    assert report.published == ["keep"]
    assert not (tmp_path / "out" / BEATMAP_DIRNAME / "drop.json").exists()


def test_an_unknown_engine_aborts_rather_than_silently_substituting(
    tmp_path: Path, no_credentials: Credentials
) -> None:
    report = run_factory(
        credentials=no_credentials,
        out_dir=tmp_path / "out",
        tmp_dir=tmp_path / "tmp",
        engine_name="not-a-real-engine",
        skip_upload=True,
    )
    assert report.aborted is True
    assert report.exit_code == 1


def test_the_engine_name_written_into_a_beat_map_is_the_engine_that_ran(
    tmp_path: Path, no_credentials: Credentials
) -> None:
    run_in(tmp_path, no_credentials)
    beat_map = json.loads(
        (tmp_path / "out" / BEATMAP_DIRNAME / "fixture-chill-96.json").read_text(
            encoding="utf-8"
        )
    )
    assert beat_map["engine"] == "spectral_dp"
    assert beat_map["engineVersion"]
