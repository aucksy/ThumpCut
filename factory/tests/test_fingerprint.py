"""Fingerprints — the only thing standing between us and a silently wrong beat grid."""

from __future__ import annotations

import numpy as np

from factory.audio_io import AudioBuffer
from factory.fingerprint import fingerprint_audio, fingerprints_match
from factory.fixtures.make_fixtures import SAMPLE_RATE, synthesise


def buffer_for(bpm: float, bars: int, seed: int) -> AudioBuffer:
    samples, _ = synthesise(bpm, bars, seed)
    return AudioBuffer(samples=samples, sample_rate=SAMPLE_RATE)


def test_the_same_recording_fingerprints_identically() -> None:
    first = fingerprint_audio(buffer_for(124.0, 8, 5))
    second = fingerprint_audio(buffer_for(124.0, 8, 5))
    assert first == second
    assert fingerprints_match(first, second)


def test_a_different_recording_fingerprints_differently() -> None:
    original = fingerprint_audio(buffer_for(124.0, 8, 5))
    remaster = fingerprint_audio(buffer_for(124.0, 8, 6))
    assert original != remaster
    assert not fingerprints_match(original, remaster)


def test_a_different_tempo_fingerprints_differently() -> None:
    assert fingerprint_audio(buffer_for(96.0, 8, 5)) != fingerprint_audio(
        buffer_for(150.0, 8, 5)
    )


def test_a_quieter_master_of_the_same_recording_still_matches() -> None:
    """Peak normalisation is deliberate: a re-encode at a different level is not a swap."""
    audio = buffer_for(124.0, 8, 5)
    quieter = AudioBuffer(samples=audio.samples * 0.5, sample_rate=audio.sample_rate)
    assert fingerprint_audio(audio) == fingerprint_audio(quieter)


def test_empty_audio_produces_a_marked_fingerprint_not_a_crash() -> None:
    empty = AudioBuffer(samples=np.zeros(0, dtype=np.float32), sample_rate=SAMPLE_RATE)
    assert fingerprint_audio(empty).endswith(":empty")


def test_two_empty_strings_never_match() -> None:
    assert not fingerprints_match("", "")
