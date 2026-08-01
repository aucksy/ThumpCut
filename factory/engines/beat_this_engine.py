"""Adapter for the published *Beat This!* model.

Optional. Selected with ``BEAT_ENGINE=beat_this``, and only worth installing on the machine
that runs the Factory for real — it pulls in PyTorch.

**``dbn`` is never enabled.** The DBN post-processor pulls in madmom, whose model weights are
Creative Commons Non-Commercial. ``dbn=False`` is the library's default and this adapter never
overrides it; the guard below fails loudly rather than quietly shipping a licence problem.

API verified against beat_this 1.1.0:

    from beat_this.inference import File2Beats
    beats, downbeats = File2Beats(checkpoint_path="final0", device="cpu", dbn=False)(path)

Both arrays are times in seconds, and every downbeat is also listed as a beat.
"""

from __future__ import annotations

import tempfile
from pathlib import Path

import numpy as np

from factory.audio_io import AudioBuffer, write_wav
from factory.config import MAX_BPM, MIN_BPM
from factory.engines.base import (
    BeatDetectionFailed,
    BeatDetectionResult,
    BeatEngineUnavailable,
)

CHECKPOINT = "final0"


class BeatThisEngine:
    """Beat This! wrapped in the engine interface. Never invoked with the DBN post-processor."""

    name = "beat_this"
    version = "1.1.0"

    def __init__(self, checkpoint: str = CHECKPOINT, device: str = "cpu") -> None:
        try:
            from beat_this.inference import File2Beats
        except ImportError as exc:  # pragma: no cover - depends on an optional install
            raise BeatEngineUnavailable(
                "beat_this is not installed. Run 'pip install beat_this' on the Factory "
                "machine, or leave BEAT_ENGINE unset to use the built-in spectral_dp engine."
            ) from exc

        # Explicit, not defaulted: dbn=False is a licence requirement, not a preference.
        self._file_to_beats = File2Beats(
            checkpoint_path=checkpoint, device=device, dbn=False
        )
        if getattr(self._file_to_beats, "dbn", False):  # pragma: no cover - guard only
            raise BeatEngineUnavailable(
                "beat_this was constructed with dbn=True, which pulls in madmom's "
                "non-commercial model weights. Refusing to run."
            )

    def detect(self, audio: AudioBuffer, source_path: Path | None = None) -> BeatDetectionResult:
        if audio.samples.size == 0:
            raise BeatDetectionFailed("audio decoded to zero samples")
        if audio.is_silent:
            raise BeatDetectionFailed("audio decodes to silence")

        temporary: Path | None = None
        try:
            if source_path is not None and source_path.is_file():
                path = source_path
            else:
                handle = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
                handle.close()
                temporary = Path(handle.name)
                write_wav(temporary, audio.samples, audio.sample_rate)
                path = temporary

            beats, downbeats = self._file_to_beats(str(path))
        except BeatDetectionFailed:
            raise
        except Exception as exc:  # the model can fail on odd input; never take the run down
            raise BeatDetectionFailed(f"beat_this failed: {exc}") from exc
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)

        beats_sec = [round(float(value), 6) for value in np.asarray(beats).ravel()]
        downbeats_sec = [round(float(value), 6) for value in np.asarray(downbeats).ravel()]

        if len(beats_sec) < 2:
            raise BeatDetectionFailed("beat_this returned fewer than two beats")

        beats_sec.sort()
        downbeats_sec.sort()
        # The model documents that every downbeat is also a beat. Enforce it anyway — P2 is
        # asserted downstream and a mismatch here would fail the whole track for no reason.
        beat_set = np.asarray(beats_sec)
        downbeats_sec = [
            beats_sec[int(np.argmin(np.abs(beat_set - value)))] for value in downbeats_sec
        ]
        downbeats_sec = sorted(set(downbeats_sec))

        intervals = np.diff(np.asarray(beats_sec, dtype=np.float64))
        median_interval = float(np.median(intervals)) if intervals.size else 0.0
        if median_interval <= 0.0:
            raise BeatDetectionFailed("beat_this returned beats with no spacing")
        bpm = float(np.clip(60.0 / median_interval, MIN_BPM, MAX_BPM))

        beats_per_bar = 4
        if len(downbeats_sec) > 1:
            bar_beats = round(
                float(np.median(np.diff(downbeats_sec))) / median_interval
            )
            if 2 <= bar_beats <= 12:
                beats_per_bar = int(bar_beats)

        return BeatDetectionResult(
            beats_sec=beats_sec,
            downbeats_sec=downbeats_sec,
            bpm=round(bpm, 2),
            beats_per_bar=beats_per_bar,
        )
