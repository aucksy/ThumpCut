"""Build the three fixture tracks.

``python -m factory.fixtures.make_fixtures``

The Factory has to run with no credentials (spec 01 §10), which means it needs audio that is
unambiguously ours to ship. Rather than sourcing three creative-commons tracks with their own
attribution requirements, these are synthesised here: kick, snare, hi-hat and a bass line at a
known tempo, with a low intro, a build and a drop.

Two things that buys us:

* No licence to track, no attribution file, no risk of a takedown in a public repo.
* **Known ground truth.** Each fixture has an exact BPM and an exact number of beats, so the
  beat detector can be tested against the right answer instead of against itself.

Regenerating is deterministic — the same script always produces byte-identical files.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np

from factory.audio_io import write_wav

SAMPLE_RATE = 22050

FIXTURE_SPECS = [
    {
        "audio_id": "fixture-chill-96",
        "file": "chill-96.wav",
        "title": "Slow Tide",
        "artist": "ThumpCut Test Kit",
        "bpm": 96.0,
        "bars": 16,
        "seed": 11,
    },
    {
        "audio_id": "fixture-drive-124",
        "file": "drive-124.wav",
        "title": "Night Meter",
        "artist": "ThumpCut Test Kit",
        "bpm": 124.0,
        "bars": 20,
        "seed": 23,
    },
    {
        "audio_id": "fixture-hype-150",
        "file": "hype-150.wav",
        "title": "Redline",
        "artist": "ThumpCut Test Kit",
        "bpm": 150.0,
        "bars": 24,
        "seed": 37,
    },
]


def _kick(length: int, rate: int) -> np.ndarray:
    """A short sine sweep from 120Hz to 45Hz — the shape of a kick drum."""
    t = np.arange(length, dtype=np.float64) / rate
    frequency = 120.0 * np.exp(-t * 28.0) + 45.0
    envelope = np.exp(-t * 22.0)
    return np.sin(2.0 * math.pi * np.cumsum(frequency) / rate) * envelope


def _snare(length: int, rate: int, generator: np.random.Generator) -> np.ndarray:
    """Filtered noise plus a body tone."""
    t = np.arange(length, dtype=np.float64) / rate
    noise = generator.standard_normal(length)
    # One-pole high pass, so it sits above the kick.
    filtered = np.empty_like(noise)
    previous_in = 0.0
    previous_out = 0.0
    for index, sample in enumerate(noise):
        previous_out = 0.86 * (previous_out + sample - previous_in)
        previous_in = sample
        filtered[index] = previous_out
    body = np.sin(2.0 * math.pi * 190.0 * t) * 0.5
    return (filtered * 0.8 + body) * np.exp(-t * 30.0)


def _hat(length: int, rate: int, generator: np.random.Generator) -> np.ndarray:
    """Very short bright noise."""
    t = np.arange(length, dtype=np.float64) / rate
    return generator.standard_normal(length) * np.exp(-t * 150.0)


def _bass(length: int, rate: int, midi_note: int) -> np.ndarray:
    """A plucked square-ish bass note."""
    t = np.arange(length, dtype=np.float64) / rate
    frequency = 440.0 * (2.0 ** ((midi_note - 69) / 12.0))
    tone = np.sign(np.sin(2.0 * math.pi * frequency * t)) * 0.35
    tone += np.sin(2.0 * math.pi * frequency * t) * 0.65
    envelope = np.minimum(1.0, t * 260.0) * np.exp(-t * 5.5)
    return tone * envelope


def _mix_into(track: np.ndarray, sound: np.ndarray, at_sample: int, gain: float) -> None:
    start = max(0, at_sample)
    end = min(len(track), start + len(sound))
    if end <= start:
        return
    track[start:end] += sound[: end - start] * gain


def _energy_at(bar_index: int, total_bars: int) -> float:
    """Intro → build → drop → outro. Returns a 0.15..1.0 loudness multiplier."""
    position = bar_index / max(1, total_bars - 1)
    if position < 0.25:
        return 0.22 + 0.28 * (position / 0.25)
    if position < 0.60:
        return 0.50 + 0.30 * ((position - 0.25) / 0.35)
    if position < 0.85:
        return 1.0
    return 0.85 - 0.45 * ((position - 0.85) / 0.15)


def synthesise(bpm: float, bars: int, seed: int, rate: int = SAMPLE_RATE) -> tuple[np.ndarray, list[float]]:
    """Render one fixture. Returns (samples, exact beat times in seconds)."""
    generator = np.random.default_rng(seed)
    beats_per_bar = 4
    beat_seconds = 60.0 / bpm
    total_beats = bars * beats_per_bar
    total_samples = int(round((total_beats * beat_seconds + 1.0) * rate))
    track = np.zeros(total_samples, dtype=np.float64)

    kick = _kick(int(0.30 * rate), rate)
    snare = _snare(int(0.22 * rate), rate, generator)
    hat = _hat(int(0.06 * rate), rate, generator)
    bass_notes = [40, 40, 43, 45]

    beat_times: list[float] = []

    for beat_index in range(total_beats):
        bar_index = beat_index // beats_per_bar
        position_in_bar = beat_index % beats_per_bar
        beat_time = beat_index * beat_seconds
        beat_times.append(round(beat_time, 6))
        at = int(round(beat_time * rate))
        level = _energy_at(bar_index, bars)

        # Kick on 1 and 3 — the downbeat always carries the most low end, which is the cue
        # the downbeat detector looks for.
        if position_in_bar in (0, 2):
            _mix_into(track, kick, at, 0.95 * level * (1.15 if position_in_bar == 0 else 0.8))
        if position_in_bar in (1, 3):
            _mix_into(track, snare, at, 0.55 * level)

        # Hats on every eighth once the track has opened up.
        if level > 0.45:
            _mix_into(track, hat, at, 0.22 * level)
            _mix_into(track, hat, at + int(round(beat_seconds * 0.5 * rate)), 0.14 * level)

        if position_in_bar == 0:
            note = bass_notes[bar_index % len(bass_notes)]
            _mix_into(track, _bass(int(beat_seconds * 2.0 * rate), rate, note), at, 0.42 * level)

    peak = float(np.max(np.abs(track)))
    if peak > 0:
        track = track / peak * 0.89
    return track.astype(np.float32), beat_times


def build(output_dir: Path | None = None) -> Path:
    """Write the three WAV files and the manifest the Factory reads in fixture mode."""
    directory = output_dir or Path(__file__).resolve().parent
    directory.mkdir(parents=True, exist_ok=True)

    manifest_tracks = []
    for spec in FIXTURE_SPECS:
        samples, beat_times = synthesise(
            float(spec["bpm"]), int(spec["bars"]), int(spec["seed"])
        )
        path = directory / str(spec["file"])
        write_wav(path, samples, SAMPLE_RATE)
        duration_ms = int(round(len(samples) / SAMPLE_RATE * 1000))
        manifest_tracks.append(
            {
                "audio_id": spec["audio_id"],
                "file": spec["file"],
                "title": spec["title"],
                "artist": spec["artist"],
                "duration_in_ms": duration_ms,
                "expected_bpm": spec["bpm"],
                "expected_beats": len(beat_times),
                "expected_first_beat_sec": beat_times[0],
                "expected_beat_interval_sec": round(60.0 / float(spec["bpm"]), 6),
            }
        )

    manifest = {
        "note": "Synthesised by factory/fixtures/make_fixtures.py. Original work, no licence "
                "obligations. expected_* fields are exact ground truth for the tests.",
        "sampleRate": SAMPLE_RATE,
        "tracks": manifest_tracks,
    }
    manifest_path = directory / "tracks.json"
    manifest_path.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    return manifest_path


if __name__ == "__main__":
    written = build()
    print(f"wrote {written} and {len(FIXTURE_SPECS)} audio files")
