"""Decoding audio to mono float samples.

WAV is handled with the standard library so fixture mode needs nothing installed.
Anything else (Meta serves m4a/mp3) is decoded by shelling out to ``ffmpeg``, which is an
external process — no GPL code is linked into anything we ship, and none of this runs on a
user's device.

If a non-WAV file arrives and ffmpeg is not installed, this raises ``AudioDecodeError``.
The batch logs it and continues; it never crashes the run.
"""

from __future__ import annotations

import shutil
import subprocess
import wave
from dataclasses import dataclass
from pathlib import Path

import numpy as np


class AudioDecodeError(RuntimeError):
    """The file could not be decoded into samples."""


@dataclass(frozen=True)
class AudioBuffer:
    """Mono float32 samples in the range -1..1, plus their sample rate."""

    samples: np.ndarray
    sample_rate: int

    @property
    def duration_sec(self) -> float:
        if self.sample_rate <= 0:
            return 0.0
        return float(len(self.samples)) / float(self.sample_rate)

    @property
    def is_silent(self) -> bool:
        """True when the file decodes to silence — a real failure mode, not a curiosity."""
        if self.samples.size == 0:
            return True
        return bool(np.max(np.abs(self.samples)) < 1e-4)


def ffmpeg_available() -> bool:
    """True when an ffmpeg binary is on PATH."""
    return shutil.which("ffmpeg") is not None


def _read_wav(path: Path) -> AudioBuffer:
    """Decode a PCM WAV file with the standard library only."""
    try:
        with wave.open(str(path), "rb") as handle:
            channels = handle.getnchannels()
            width = handle.getsampwidth()
            rate = handle.getframerate()
            frames = handle.readframes(handle.getnframes())
    except (wave.Error, EOFError, OSError) as exc:
        raise AudioDecodeError(f"unreadable WAV: {exc}") from exc

    if width == 1:
        raw = np.frombuffer(frames, dtype=np.uint8).astype(np.float32)
        mono = (raw - 128.0) / 128.0
    elif width == 2:
        raw = np.frombuffer(frames, dtype="<i2").astype(np.float32)
        mono = raw / 32768.0
    elif width == 4:
        raw = np.frombuffer(frames, dtype="<i4").astype(np.float32)
        mono = raw / 2147483648.0
    else:
        raise AudioDecodeError(f"unsupported WAV sample width: {width * 8} bit")

    if channels > 1:
        usable = (len(mono) // channels) * channels
        mono = mono[:usable].reshape(-1, channels).mean(axis=1)

    return AudioBuffer(samples=np.ascontiguousarray(mono, dtype=np.float32), sample_rate=rate)


def _decode_with_ffmpeg(path: Path, sample_rate: int) -> AudioBuffer:
    """Decode any container ffmpeg understands into mono float32 at ``sample_rate``."""
    command = [
        "ffmpeg",
        "-v", "error",
        "-i", str(path),
        "-f", "f32le",
        "-ac", "1",
        "-ar", str(sample_rate),
        "-",
    ]
    try:
        completed = subprocess.run(command, capture_output=True, check=False)
    except OSError as exc:
        raise AudioDecodeError(f"could not run ffmpeg: {exc}") from exc

    if completed.returncode != 0:
        detail = completed.stderr.decode("utf-8", "replace").strip().splitlines()
        reason = detail[-1] if detail else f"exit code {completed.returncode}"
        raise AudioDecodeError(f"ffmpeg failed: {reason}")

    samples = np.frombuffer(completed.stdout, dtype="<f4")
    if samples.size == 0:
        raise AudioDecodeError("ffmpeg produced no samples")
    return AudioBuffer(samples=np.ascontiguousarray(samples, dtype=np.float32),
                       sample_rate=sample_rate)


def resample(buffer: AudioBuffer, target_rate: int) -> AudioBuffer:
    """Linear resample. Adequate here — we measure onsets, not audio quality."""
    if buffer.sample_rate == target_rate or buffer.samples.size == 0:
        return AudioBuffer(samples=buffer.samples, sample_rate=target_rate)
    ratio = target_rate / float(buffer.sample_rate)
    out_length = max(1, int(round(len(buffer.samples) * ratio)))
    source_index = np.linspace(0.0, len(buffer.samples) - 1.0, out_length, dtype=np.float64)
    resampled = np.interp(
        source_index, np.arange(len(buffer.samples), dtype=np.float64), buffer.samples
    )
    return AudioBuffer(samples=resampled.astype(np.float32), sample_rate=target_rate)


def load_audio(path: Path, target_rate: int) -> AudioBuffer:
    """Decode a file to mono float32 at ``target_rate``.

    Raises AudioDecodeError with a plain reason. Never raises anything else.
    """
    resolved = Path(path)
    if not resolved.is_file():
        raise AudioDecodeError(f"file does not exist: {resolved.name}")
    if resolved.stat().st_size == 0:
        raise AudioDecodeError(f"file is zero bytes: {resolved.name}")

    if resolved.suffix.lower() == ".wav":
        return resample(_read_wav(resolved), target_rate)

    if not ffmpeg_available():
        raise AudioDecodeError(
            f"{resolved.suffix or 'this format'} needs ffmpeg on PATH to decode"
        )
    return _decode_with_ffmpeg(resolved, target_rate)


def write_wav(path: Path, samples: np.ndarray, sample_rate: int) -> None:
    """Write mono float samples as 16-bit PCM WAV. Used to build the fixtures."""
    clipped = np.clip(samples, -1.0, 1.0)
    pcm = (clipped * 32767.0).astype("<i2")
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(sample_rate)
        handle.writeframes(pcm.tobytes())
