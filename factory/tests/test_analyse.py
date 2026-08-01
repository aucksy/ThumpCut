"""Analysis against ground truth.

The fixtures are synthesised at an exact tempo, so these are not "does it produce numbers"
tests — they are "does it produce the *right* numbers" tests.
"""

from __future__ import annotations

import numpy as np
import pytest

from factory.analyse import AnalysisFailed, analyse, build_energy_curve, choose_best_window
from factory.audio_io import AudioBuffer
from factory.config import ANALYSIS_SAMPLE_RATE
from factory.engines import get_engine
from factory.fixtures.make_fixtures import SAMPLE_RATE, synthesise
from factory.schema import validate_beat_map

GROUND_TRUTH = [
    ("chill", 96.0, 16),
    ("drive", 124.0, 20),
    ("hype", 150.0, 24),
]


def analysed(bpm: float, bars: int, seed: int = 11):
    samples, _ = synthesise(bpm, bars, seed)
    audio = AudioBuffer(samples=samples, sample_rate=SAMPLE_RATE)
    return analyse(
        audio,
        get_engine("spectral_dp"),
        track_id=f"t-{bpm}",
        title=f"Track {bpm}",
        artist="Test Kit",
        source_duration_ms=int(audio.duration_sec * 1000),
    )


@pytest.mark.parametrize("name,bpm,bars", GROUND_TRUTH)
def test_detected_tempo_matches_the_real_tempo(name: str, bpm: float, bars: int) -> None:
    beat_map = analysed(bpm, bars)
    assert abs(beat_map.bpm - bpm) <= 1.0, f"{name}: got {beat_map.bpm}, expected {bpm}"


@pytest.mark.parametrize("name,bpm,bars", GROUND_TRUTH)
def test_beat_count_matches_the_bar_count(name: str, bpm: float, bars: int) -> None:
    beat_map = analysed(bpm, bars)
    assert abs(len(beat_map.beatsSec) - bars * 4) <= 1


@pytest.mark.parametrize("name,bpm,bars", GROUND_TRUTH)
def test_every_beat_lands_within_25ms_of_the_true_grid(name: str, bpm: float, bars: int) -> None:
    """25ms is half the 50ms the product promises, so there is headroom downstream."""
    beat_map = analysed(bpm, bars)
    interval = 60.0 / bpm
    for beat in beat_map.beatsSec:
        offset = abs(beat - round(beat / interval) * interval)
        assert offset <= 0.025, f"{name}: beat at {beat:.3f}s is {offset * 1000:.0f}ms off"


@pytest.mark.parametrize("name,bpm,bars", GROUND_TRUTH)
def test_downbeats_land_every_fourth_beat(name: str, bpm: float, bars: int) -> None:
    beat_map = analysed(bpm, bars)
    expected = len(beat_map.beatsSec) // 4
    assert abs(len(beat_map.downbeatsSec) - expected) <= 1


@pytest.mark.parametrize("name,bpm,bars", GROUND_TRUTH)
def test_every_analysed_track_validates(name: str, bpm: float, bars: int) -> None:
    validate_beat_map(analysed(bpm, bars))


TEMPO_SWEEP = [60.0, 72.0, 84.0, 96.0, 110.0, 124.0, 138.0, 150.0, 165.0, 180.0, 190.0]


@pytest.mark.parametrize("bpm", TEMPO_SWEEP)
def test_the_tempo_sweep_lands_on_the_right_octave(bpm: float) -> None:
    """Half and double tempo are the classic beat-tracking failures. Both are covered here.

    Without the octave checks, 72 BPM read as 144 and 150 BPM read as 75. Either one silently
    halves or doubles how long every slide is.
    """
    beat_map = analysed(bpm, 12, seed=7)
    assert abs(beat_map.bpm - bpm) <= 1.0, f"got {beat_map.bpm}, expected {bpm}"


@pytest.mark.parametrize("bpm", TEMPO_SWEEP)
def test_the_tempo_sweep_keeps_every_beat_on_the_grid(bpm: float) -> None:
    beat_map = analysed(bpm, 12, seed=7)
    interval = 60.0 / bpm
    worst = max(abs(b - round(b / interval) * interval) for b in beat_map.beatsSec)
    assert worst <= 0.025, f"{bpm} BPM: worst beat is {worst * 1000:.0f}ms off the grid"


def test_analysis_is_deterministic() -> None:
    """G11 depends on this: identical audio must produce an identical beat map."""
    first = analysed(124.0, 12)
    second = analysed(124.0, 12)
    assert first.beatsSec == second.beatsSec
    assert first.energyCurve == second.energyCurve
    assert first.contentHash == second.contentHash


def test_energy_rises_from_the_intro_to_the_drop() -> None:
    """The fixtures are built quiet-then-loud. If the curve does not see that, it is useless."""
    beat_map = analysed(124.0, 20)
    curve = beat_map.energyCurve
    quarter = len(curve) // 4
    intro = float(np.mean(curve[:quarter]))
    drop = float(np.mean(curve[2 * quarter : 3 * quarter]))
    assert drop > intro + 0.2, f"intro {intro:.2f} vs drop {drop:.2f}"


def test_energy_curve_uses_the_full_range() -> None:
    curve = analysed(124.0, 20).energyCurve
    assert min(curve) < 0.2
    assert max(curve) > 0.8


def test_sections_tile_the_track_with_no_gaps() -> None:
    beat_map = analysed(150.0, 24)
    assert beat_map.sections[0].startSec == 0.0
    assert beat_map.sections[-1].endSec >= beat_map.durationSec - 1e-6
    for earlier, later in zip(beat_map.sections, beat_map.sections[1:]):
        assert later.startSec == pytest.approx(earlier.endSec)


def test_best_window_starts_on_a_downbeat() -> None:
    beat_map = analysed(124.0, 20)
    assert any(
        abs(beat_map.bestWindowStartSec - downbeat) < 1e-6
        for downbeat in beat_map.downbeatsSec
    )


def test_best_window_leaves_room_for_three_bars() -> None:
    beat_map = analysed(124.0, 20)
    remaining = beat_map.durationSec - beat_map.bestWindowStartSec
    assert remaining >= 3 * 4 * (60.0 / beat_map.bpm)


def test_best_window_prefers_the_energetic_stretch() -> None:
    beat_map = analysed(124.0, 20)
    assert beat_map.bestWindowStartSec > beat_map.durationSec * 0.2


# --- Failure paths -------------------------------------------------------------------------

def test_audio_shorter_than_ten_seconds_fails_with_the_exact_wording() -> None:
    samples, _ = synthesise(120.0, 2, 3)
    audio = AudioBuffer(samples=samples[: SAMPLE_RATE * 5], sample_rate=SAMPLE_RATE)
    with pytest.raises(AnalysisFailed) as caught:
        analyse(
            audio,
            get_engine("spectral_dp"),
            track_id="short",
            title="Short One",
            artist="",
            source_duration_ms=5000,
        )
    assert str(caught.value) == "ANALYSIS_FAIL Short One: only 5s, need 10s minimum"


def test_silence_fails_rather_than_producing_a_beat_grid() -> None:
    audio = AudioBuffer(
        samples=np.zeros(SAMPLE_RATE * 20, dtype=np.float32), sample_rate=SAMPLE_RATE
    )
    with pytest.raises(AnalysisFailed, match="silence"):
        analyse(
            audio,
            get_engine("spectral_dp"),
            track_id="silent",
            title="Silent One",
            artist="",
            source_duration_ms=20000,
        )


def test_energy_curve_is_empty_when_there_are_no_beats() -> None:
    audio = AudioBuffer(
        samples=np.zeros(ANALYSIS_SAMPLE_RATE, dtype=np.float32),
        sample_rate=ANALYSIS_SAMPLE_RATE,
    )
    assert build_energy_curve(audio, [], np.zeros(0), 0.0) == []


def test_best_window_is_zero_when_there_are_no_beats() -> None:
    assert choose_best_window([], [], [], 4) == 0.0
