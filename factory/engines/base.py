"""The contract every beat detection engine implements."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol

import numpy as np

from factory.audio_io import AudioBuffer


class BeatEngineUnavailable(RuntimeError):
    """The requested engine could not be loaded."""


class BeatDetectionFailed(RuntimeError):
    """The engine ran but produced nothing usable."""


@dataclass
class BeatDetectionResult:
    """What an engine returns. Times are in seconds from the start of the file."""

    beats_sec: list[float]
    downbeats_sec: list[float]
    bpm: float
    beats_per_bar: int = 4
    # Per-frame onset strength and its frame rate, when the engine can supply it.
    # The energy curve falls back to plain RMS when it cannot.
    onset_envelope: np.ndarray = field(default_factory=lambda: np.zeros(0, dtype=np.float32))
    onset_frame_rate: float = 0.0


class BeatEngine(Protocol):
    """A beat detector. Implementations must be deterministic for the same input."""

    name: str
    version: str

    def detect(self, audio: AudioBuffer, source_path: Path | None = None) -> BeatDetectionResult:
        """Detect beats and downbeats. Raises BeatDetectionFailed on unusable audio."""
        ...
