"""Turning decoded audio into a beat map.

The engine supplies beats, downbeats and a tempo. This module adds the parts the cut engine
needs on top of that: the per-beat energy curve, the section boundaries, and the best window
to start a reel in.

Everything here is deterministic. The same audio always produces the same beat map, which is
what makes ``contentHash`` meaningful.
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from factory.audio_io import AudioBuffer
from factory.config import ANALYSIS_SAMPLE_RATE, MIN_TRACK_SECONDS
from factory.engines.base import BeatDetectionFailed, BeatEngine
from factory.fingerprint import fingerprint_audio
from factory.schema import BeatMap, Section, compute_content_hash, validate_beat_map

_RMS_FRAME = 1024
_RMS_HOP = 512
_LOUDNESS_WEIGHT = 0.65
_ACTIVITY_WEIGHT = 0.35
_ENERGY_SMOOTHING_BEATS = 3
_SECTION_MEDIAN_BEATS = 9
_MIN_SECTION_BEATS = 8
_BEST_WINDOW_LOOKAHEAD_BEATS = 16
_BEST_WINDOW_MIN_TAIL_BARS = 3

_LEVEL_LOW_MAX = 0.33
_LEVEL_MEDIUM_MAX = 0.66


class AnalysisFailed(RuntimeError):
    """Analysis could not produce a usable beat map. The track is excluded."""


def _frame_rms(samples: np.ndarray) -> np.ndarray:
    """Root-mean-square amplitude per analysis frame."""
    if samples.size < _RMS_FRAME:
        return np.array([float(np.sqrt(np.mean(samples**2)))] if samples.size else [0.0])
    frame_count = 1 + (len(samples) - _RMS_FRAME) // _RMS_HOP
    indices = np.arange(_RMS_FRAME)[None, :] + _RMS_HOP * np.arange(frame_count)[:, None]
    frames = samples[indices].astype(np.float64)
    return np.sqrt(np.mean(frames**2, axis=1))


def _robust_normalise(values: np.ndarray) -> np.ndarray:
    """Scale to 0..1 using the 5th and 95th percentiles, so one loud hit cannot flatten it."""
    if values.size == 0:
        return values
    low = float(np.percentile(values, 5))
    high = float(np.percentile(values, 95))
    if high - low < 1e-9:
        return np.full_like(values, 0.5)
    return np.clip((values - low) / (high - low), 0.0, 1.0)


def _smooth(values: np.ndarray, window: int) -> np.ndarray:
    """Centred moving average over ``window`` samples, edges held."""
    if window <= 1 or values.size == 0:
        return values
    if window % 2 == 0:
        window += 1
    half = window // 2
    padded = np.pad(values, (half, half), mode="edge")
    kernel = np.ones(window, dtype=np.float64) / float(window)
    return np.convolve(padded, kernel, mode="valid")


def _median_filter(values: np.ndarray, window: int) -> np.ndarray:
    """Centred median filter. Stops the section banding flapping on a single loud beat."""
    if window <= 1 or values.size == 0:
        return values
    if window % 2 == 0:
        window += 1
    half = window // 2
    padded = np.pad(values, (half, half), mode="edge")
    stacked = np.stack([padded[i : i + values.size] for i in range(window)], axis=0)
    return np.median(stacked, axis=0)


def build_energy_curve(
    audio: AudioBuffer,
    beats_sec: list[float],
    onset_envelope: np.ndarray,
    onset_frame_rate: float,
) -> list[float]:
    """One 0..1 value per beat: how intense the music is at that moment.

    Blends loudness (how loud) with onset activity (how busy), because both read as "energy"
    and either one alone gets a section wrong — a sparse loud pad is not a drop, and a busy
    quiet hi-hat pattern is not one either.
    """
    if not beats_sec:
        return []

    rms = _frame_rms(audio.samples)
    rms_rate = audio.sample_rate / float(_RMS_HOP)
    loudness_db = 20.0 * np.log10(np.maximum(rms, 1e-6))

    intervals = np.diff(np.asarray(beats_sec, dtype=np.float64))
    median_interval = float(np.median(intervals)) if intervals.size else 0.5

    loudness_per_beat = np.zeros(len(beats_sec), dtype=np.float64)
    activity_per_beat = np.zeros(len(beats_sec), dtype=np.float64)

    for index, beat in enumerate(beats_sec):
        span = intervals[index] if index < intervals.size else median_interval
        start_sec = beat
        end_sec = beat + max(span, 1e-3)

        lo = int(np.floor(start_sec * rms_rate))
        hi = int(np.ceil(end_sec * rms_rate))
        lo = max(0, min(lo, loudness_db.size - 1))
        hi = max(lo + 1, min(hi, loudness_db.size))
        loudness_per_beat[index] = float(np.mean(loudness_db[lo:hi]))

        if onset_envelope.size > 0 and onset_frame_rate > 0.0:
            olo = int(np.floor(start_sec * onset_frame_rate))
            ohi = int(np.ceil(end_sec * onset_frame_rate))
            olo = max(0, min(olo, onset_envelope.size - 1))
            ohi = max(olo + 1, min(ohi, onset_envelope.size))
            activity_per_beat[index] = float(np.mean(onset_envelope[olo:ohi]))

    loudness_norm = _robust_normalise(loudness_per_beat)
    activity_norm = _robust_normalise(activity_per_beat)
    if onset_envelope.size == 0:
        blended = loudness_norm
    else:
        blended = _LOUDNESS_WEIGHT * loudness_norm + _ACTIVITY_WEIGHT * activity_norm

    smoothed = _smooth(blended, _ENERGY_SMOOTHING_BEATS)
    # Re-spread after smoothing so the bands in the cut engine stay meaningful.
    spread = _robust_normalise(smoothed)
    return [round(float(np.clip(v, 0.0, 1.0)), 4) for v in spread]


def _level_for(value: float) -> str:
    if value < _LEVEL_LOW_MAX:
        return "low"
    if value < _LEVEL_MEDIUM_MAX:
        return "medium"
    return "high"


def build_sections(
    beats_sec: list[float],
    downbeats_sec: list[float],
    energy_curve: list[float],
    duration_sec: float,
) -> list[Section]:
    """Group beats into stretches with a consistent energy level.

    Boundaries snap to downbeats where one is close by, because a section change that lands
    mid-bar reads as a mistake.
    """
    if not beats_sec or not energy_curve:
        return [Section(startSec=0.0, endSec=max(duration_sec, 0.001), level="medium")]

    banded = _median_filter(np.asarray(energy_curve, dtype=np.float64), _SECTION_MEDIAN_BEATS)
    levels = [_level_for(float(v)) for v in banded]

    # Collapse into runs, absorbing any run shorter than the minimum into its predecessor.
    runs: list[list[int]] = []
    for index, level in enumerate(levels):
        if runs and levels[runs[-1][0]] == level:
            runs[-1][1] = index
        else:
            runs.append([index, index])

    # Short runs are absorbed into a neighbour. A short run at the *start* has no predecessor,
    # so it is carried forward into the next run — otherwise it survives as a section a few
    # milliseconds long, which is not a section at all.
    merged: list[list[int]] = []
    carried_start: int | None = None
    for run in runs:
        length = run[1] - run[0] + 1
        if not merged and length < _MIN_SECTION_BEATS:
            if carried_start is None:
                carried_start = run[0]
            continue
        if carried_start is not None:
            merged.append([carried_start, run[1]])
            carried_start = None
            continue
        if merged and length < _MIN_SECTION_BEATS:
            merged[-1][1] = run[1]
        else:
            merged.append(run)

    if carried_start is not None:
        # Every run was short: the whole track is one section.
        merged.append([carried_start, runs[-1][1]])

    # A short run at the end has a predecessor, so it folds backwards.
    if len(merged) > 1 and (merged[-1][1] - merged[-1][0] + 1) < _MIN_SECTION_BEATS:
        merged[-2][1] = merged[-1][1]
        merged.pop()

    sections: list[Section] = []
    for position, (start_index, end_index) in enumerate(merged):
        start = 0.0 if position == 0 else _snap_to_downbeat(beats_sec[start_index], downbeats_sec)
        if position == len(merged) - 1:
            end = max(duration_sec, beats_sec[min(end_index, len(beats_sec) - 1)] + 0.001)
        else:
            next_start_index = merged[position + 1][0]
            end = _snap_to_downbeat(beats_sec[next_start_index], downbeats_sec)
        if sections:
            start = sections[-1].endSec
        if end <= start:
            end = start + 0.001
        level = _level_for(float(np.mean(banded[start_index : end_index + 1])))
        sections.append(Section(startSec=round(start, 4), endSec=round(end, 4), level=level))

    # Guarantee the sections tile the track end to end.
    if sections:
        first = sections[0]
        sections[0] = Section(startSec=0.0, endSec=first.endSec, level=first.level)
        last = sections[-1]
        end = max(duration_sec, last.startSec + 0.001)
        sections[-1] = Section(startSec=last.startSec, endSec=round(end, 4), level=last.level)
    return sections


def _snap_to_downbeat(target_sec: float, downbeats_sec: list[float]) -> float:
    """Move a boundary onto the nearest downbeat, if one is within half a bar."""
    if not downbeats_sec:
        return target_sec
    array = np.asarray(downbeats_sec, dtype=np.float64)
    index = int(np.argmin(np.abs(array - target_sec)))
    nearest = float(array[index])
    bar_length = float(np.median(np.diff(array))) if array.size > 1 else 2.0
    if abs(nearest - target_sec) <= bar_length * 0.5:
        return nearest
    return target_sec


def choose_best_window(
    beats_sec: list[float],
    downbeats_sec: list[float],
    energy_curve: list[float],
    beats_per_bar: int,
) -> float:
    """Pick the downbeat a reel should start on: the most energetic stretch that has room.

    "Has room" means at least three bars of track remain after it, so a reel started there
    is not cut off two seconds later.
    """
    if not beats_sec or not energy_curve:
        return 0.0
    if not downbeats_sec:
        return float(beats_sec[0])

    energy = np.asarray(energy_curve, dtype=np.float64)
    min_tail_beats = beats_per_bar * _BEST_WINDOW_MIN_TAIL_BARS

    best_start = float(downbeats_sec[0])
    best_score = -np.inf

    for downbeat in downbeats_sec:
        beat_index = _nearest_beat_index(beats_sec, downbeat)
        if beat_index + min_tail_beats >= len(beats_sec):
            continue
        window_end = min(len(energy), beat_index + _BEST_WINDOW_LOOKAHEAD_BEATS)
        score = float(np.mean(energy[beat_index:window_end]))
        if score > best_score + 1e-9:  # ties keep the earlier window
            best_score = score
            best_start = float(downbeat)

    return round(best_start, 6)


def _nearest_beat_index(beats_sec: list[float], target: float) -> int:
    array = np.asarray(beats_sec, dtype=np.float64)
    return int(np.argmin(np.abs(array - target)))


def analyse(
    audio: AudioBuffer,
    engine: BeatEngine,
    *,
    track_id: str,
    title: str,
    artist: str,
    source_duration_ms: int,
    source_path: Path | None = None,
    now: datetime | None = None,
) -> BeatMap:
    """Produce a validated beat map, or raise AnalysisFailed with the exact log wording."""
    label = title or track_id

    if audio.duration_sec < MIN_TRACK_SECONDS:
        raise AnalysisFailed(
            f"ANALYSIS_FAIL {label}: only {audio.duration_sec:.0f}s, need 10s minimum"
        )
    if audio.is_silent:
        raise AnalysisFailed(f"ANALYSIS_FAIL {label}: audio decodes to silence")

    working = audio
    if working.sample_rate != ANALYSIS_SAMPLE_RATE:
        from factory.audio_io import resample

        working = resample(working, ANALYSIS_SAMPLE_RATE)

    try:
        detection = engine.detect(working, source_path)
    except BeatDetectionFailed as exc:
        raise AnalysisFailed(f"ANALYSIS_FAIL {label}: {exc}") from exc

    energy_curve = build_energy_curve(
        working, detection.beats_sec, detection.onset_envelope, detection.onset_frame_rate
    )
    sections = build_sections(
        detection.beats_sec, detection.downbeats_sec, energy_curve, audio.duration_sec
    )
    best_window = choose_best_window(
        detection.beats_sec, detection.downbeats_sec, energy_curve, detection.beats_per_bar
    )

    stamp = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    beat_map = BeatMap(
        trackId=track_id,
        title=title,
        artist=artist,
        durationSec=round(audio.duration_sec, 3),
        bpm=round(detection.bpm, 2),
        beatsSec=[round(v, 6) for v in detection.beats_sec],
        downbeatsSec=[round(v, 6) for v in detection.downbeats_sec],
        beatsPerBar=detection.beats_per_bar,
        energyCurve=energy_curve,
        sections=sections,
        bestWindowStartSec=best_window,
        sourceDurationMs=source_duration_ms,
        audioFingerprint=fingerprint_audio(audio),
        lastVerifiedAt=stamp.isoformat().replace("+00:00", "Z"),
        engine=engine.name,
        engineVersion=engine.version,
    )
    beat_map.contentHash = compute_content_hash(beat_map)

    try:
        validate_beat_map(beat_map)
    except Exception as exc:  # BeatMapInvalid carries the exact spec wording already.
        raise AnalysisFailed(str(exc)) from exc

    return beat_map
