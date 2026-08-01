"""Beat map schema and its invariants — P2, P3, P4, P5, P9."""

from __future__ import annotations

import copy

import pytest

from factory.schema import (
    SCHEMA_VERSION,
    BeatMap,
    BeatMapInvalid,
    Section,
    compute_content_hash,
    validate_beat_map,
    validate_publishable,
)


def good_beat_map() -> BeatMap:
    beats = [round(i * 0.5, 6) for i in range(32)]
    downbeats = beats[::4]
    beat_map = BeatMap(
        trackId="t1",
        title="Test Track",
        artist="Test Artist",
        durationSec=16.0,
        bpm=120.0,
        beatsSec=beats,
        downbeatsSec=downbeats,
        beatsPerBar=4,
        energyCurve=[round(0.2 + 0.02 * i, 4) for i in range(32)],
        sections=[
            Section(startSec=0.0, endSec=8.0, level="low"),
            Section(startSec=8.0, endSec=16.0, level="high"),
        ],
        bestWindowStartSec=8.0,
        sourceDurationMs=16000,
        audioFingerprint="sha256-pcm8k:abc",
        lastVerifiedAt="2026-08-01T00:00:00Z",
        engine="spectral_dp",
        engineVersion="1.0.0",
    )
    beat_map.contentHash = compute_content_hash(beat_map)
    return beat_map


def test_a_good_beat_map_validates() -> None:
    validate_beat_map(good_beat_map())


def test_schema_version_is_one() -> None:
    assert SCHEMA_VERSION == 1
    assert good_beat_map().to_json()["schemaVersion"] == 1


# --- P4: beatsSec strictly increasing -------------------------------------------------

def test_p4_rejects_non_increasing_beats() -> None:
    beat_map = good_beat_map()
    beat_map.beatsSec[5] = beat_map.beatsSec[4]
    with pytest.raises(BeatMapInvalid, match="not strictly increasing"):
        validate_beat_map(beat_map)


def test_p4_rejects_beats_that_go_backwards() -> None:
    beat_map = good_beat_map()
    beat_map.beatsSec[10] = 0.1
    with pytest.raises(BeatMapInvalid, match="not strictly increasing"):
        validate_beat_map(beat_map)


# --- P3: energyCurve length matches beats ---------------------------------------------

def test_p3_rejects_length_mismatch() -> None:
    beat_map = good_beat_map()
    beat_map.energyCurve = beat_map.energyCurve[:-1]
    with pytest.raises(BeatMapInvalid, match=r"energyCurve 31 != beats 32"):
        validate_beat_map(beat_map)


def test_p3_message_matches_the_error_catalogue() -> None:
    beat_map = good_beat_map()
    beat_map.energyCurve = beat_map.energyCurve[:10]
    with pytest.raises(BeatMapInvalid) as caught:
        validate_beat_map(beat_map)
    assert str(caught.value) == "ANALYSIS_FAIL Test Track: energyCurve 10 != beats 32"


# --- P2: downbeats are a subset of beats -----------------------------------------------

def test_p2_rejects_a_downbeat_that_is_not_a_beat() -> None:
    beat_map = good_beat_map()
    beat_map.downbeatsSec = [*beat_map.downbeatsSec, 3.33]
    with pytest.raises(BeatMapInvalid, match="is not in beatsSec"):
        validate_beat_map(beat_map)


def test_p2_accepts_a_downbeat_within_rounding_tolerance() -> None:
    beat_map = good_beat_map()
    beat_map.downbeatsSec = [value + 1e-7 for value in beat_map.downbeatsSec]
    validate_beat_map(beat_map)


# --- BPM range -------------------------------------------------------------------------

@pytest.mark.parametrize("bpm", [10.0, 49.9, 200.1, 400.0])
def test_bpm_outside_the_range_fails(bpm: float) -> None:
    beat_map = good_beat_map()
    beat_map.bpm = bpm
    with pytest.raises(BeatMapInvalid, match="outside 50–200"):
        validate_beat_map(beat_map)


@pytest.mark.parametrize("bpm", [50.0, 120.0, 200.0])
def test_bpm_inside_the_range_passes(bpm: float) -> None:
    beat_map = good_beat_map()
    beat_map.bpm = bpm
    validate_beat_map(beat_map)


def test_short_track_fails_with_the_exact_wording() -> None:
    beat_map = good_beat_map()
    beat_map.durationSec = 8.0
    with pytest.raises(BeatMapInvalid) as caught:
        validate_beat_map(beat_map)
    assert str(caught.value) == "ANALYSIS_FAIL Test Track: only 8s, need 10s minimum"


# --- Sections ---------------------------------------------------------------------------

def test_sections_must_not_leave_a_gap() -> None:
    beat_map = good_beat_map()
    beat_map.sections = [
        Section(startSec=0.0, endSec=7.0, level="low"),
        Section(startSec=8.0, endSec=16.0, level="high"),
    ]
    with pytest.raises(BeatMapInvalid, match="leave a gap"):
        validate_beat_map(beat_map)


def test_a_millisecond_long_section_is_rejected() -> None:
    beat_map = good_beat_map()
    beat_map.sections = [
        Section(startSec=0.0, endSec=0.04, level="medium"),
        Section(startSec=0.04, endSec=16.0, level="high"),
    ]
    with pytest.raises(BeatMapInvalid, match="shorter than"):
        validate_beat_map(beat_map)


def test_energy_values_must_stay_in_range() -> None:
    beat_map = good_beat_map()
    beat_map.energyCurve[3] = 1.4
    with pytest.raises(BeatMapInvalid, match="outside 0..1"):
        validate_beat_map(beat_map)


# --- P9: contentHash changes if and only if the content changed ---------------------------

def test_p9_hash_is_stable_for_identical_content() -> None:
    left, right = good_beat_map(), good_beat_map()
    assert compute_content_hash(left) == compute_content_hash(right)


def test_p9_hash_ignores_last_verified_at() -> None:
    beat_map = good_beat_map()
    before = compute_content_hash(beat_map)
    beat_map.lastVerifiedAt = "2030-01-01T00:00:00Z"
    assert compute_content_hash(beat_map) == before


def test_p9_hash_changes_when_a_beat_moves() -> None:
    beat_map = good_beat_map()
    before = compute_content_hash(beat_map)
    beat_map.beatsSec[7] += 0.01
    assert compute_content_hash(beat_map) != before


def test_p9_hash_changes_when_energy_changes() -> None:
    beat_map = good_beat_map()
    before = compute_content_hash(beat_map)
    beat_map.energyCurve[0] = 0.99
    assert compute_content_hash(beat_map) != before


# --- P5: publishable beat maps carry provenance -------------------------------------------

def test_p5_rejects_an_empty_fingerprint() -> None:
    beat_map = good_beat_map()
    beat_map.audioFingerprint = ""
    beat_map.contentHash = compute_content_hash(beat_map)
    with pytest.raises(BeatMapInvalid, match="audioFingerprint is empty"):
        validate_publishable(beat_map)


def test_p5_rejects_an_empty_content_hash() -> None:
    beat_map = good_beat_map()
    beat_map.contentHash = ""
    with pytest.raises(BeatMapInvalid, match="contentHash is empty"):
        validate_publishable(beat_map)


def test_p5_rejects_a_content_hash_that_does_not_match() -> None:
    beat_map = good_beat_map()
    beat_map.beatsSec[2] += 0.05  # content moved, hash left behind
    with pytest.raises(BeatMapInvalid, match="does not match its content"):
        validate_publishable(beat_map)


# --- Round trip ----------------------------------------------------------------------------

def test_json_round_trip_is_lossless() -> None:
    original = good_beat_map()
    restored = BeatMap.from_json(copy.deepcopy(original.to_json()))
    assert restored.to_json() == original.to_json()


def test_malformed_json_raises_rather_than_returning_junk() -> None:
    with pytest.raises(BeatMapInvalid, match="malformed beat map"):
        BeatMap.from_json({"trackId": "x"})
