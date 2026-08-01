"""Spectral-flux beat tracking in pure NumPy.

Pipeline, in order:

1. Short-time Fourier transform with a Hann window.
2. Onset strength: half-wave-rectified first difference of the log-magnitude spectrum,
   summed across frequency. Loud transients (a kick, a snare) spike; sustained notes do not.
3. Tempo: autocorrelation of the onset envelope inside the 50–200 BPM band, weighted by a
   log-normal prior around 120 BPM so the octave error (60 vs 120 vs 240) resolves sensibly.
4. Beats: the Ellis (2007) dynamic-programming tracker. It picks the path through the onset
   envelope that both lands on strong onsets and keeps a steady interval.
5. Sub-frame refinement: parabolic interpolation around each chosen frame, so beat times are
   not quantised to the 23ms analysis grid.
6. Downbeat phase: bars are assumed to be 4 beats. The phase is the one whose beats carry the
   most low-frequency energy — the kick drum is the strongest available cue.

Deterministic: no randomness anywhere, so the same file always produces the same beat map.
"""

from __future__ import annotations

import math
from pathlib import Path

import numpy as np

from factory.audio_io import AudioBuffer
from factory.config import MAX_BPM, MIN_BPM
from factory.engines.base import BeatDetectionFailed, BeatDetectionResult

# A 1024-sample window is 46ms at 22050Hz. Longer windows smear a transient and report the
# onset early — a 2048 window measured 78ms early against a synthesised kick, which is over
# the 50ms the product promises before the cut engine has even run.
_FFT_SIZE = 1024
# 256 samples at 22050Hz is an 11.6ms analysis grid. That matters: beat times are quantised to
# this grid, and the product promises every cut lands within 50ms of a beat. A 512 hop (23ms)
# left the reported tempo a whole BPM out on a metronomic track.
_HOP_SIZE = 256
_TEMPO_PRIOR_CENTRE_BPM = 120.0
_TEMPO_PRIOR_WIDTH_OCTAVES = 1.0
_DP_TIGHTNESS = 100.0
_LOW_BAND_HZ = 220.0
_LOCAL_MEAN_SECONDS = 1.0
_OCTAVE_OFFBEAT_RATIO = 0.9
_HALVING_LOW_BAND_RATIO = 0.45
_BAND_COUNT = 40
_BAND_LOW_HZ = 30.0
# A beat with essentially no onset energy under it is padding, not music. Only ever trimmed
# from the head and the tail — never from the middle, where a rest is a legitimate beat.
_SILENT_BEAT_RATIO = 0.04


def _frame_signal(samples: np.ndarray, frame_size: int, hop: int) -> np.ndarray:
    """Split into overlapping frames, each *centred* on its own timestamp.

    Centring matters. With left-aligned frames the whole beat grid lands early by most of a
    window length, because a transient shows up in the first frame whose window reaches it.
    Frame ``k`` here is centred on sample ``k * hop``, so its timestamp is ``k * hop / rate``.
    """
    padded = np.pad(samples, (frame_size // 2, frame_size), mode="constant")
    frame_count = 1 + (len(samples) + frame_size // 2) // hop
    indices = np.arange(frame_size)[None, :] + hop * np.arange(frame_count)[:, None]
    indices = np.clip(indices, 0, len(padded) - 1)
    return padded[indices]


def _spectrogram(samples: np.ndarray) -> np.ndarray:
    """Magnitude spectrogram, shape (frames, bins). Frame k is centred at k * hop."""
    window = np.hanning(_FFT_SIZE).astype(np.float32)
    frames = _frame_signal(samples, _FFT_SIZE, _HOP_SIZE) * window
    return np.abs(np.fft.rfft(frames, axis=1)).astype(np.float32)


def _mel_edges(sample_rate: int, band_count: int) -> np.ndarray:
    """Band edges as FFT bin indices, spaced evenly on the mel scale."""
    def to_mel(hz: float) -> float:
        return 2595.0 * math.log10(1.0 + hz / 700.0)

    def from_mel(mel: float) -> float:
        return 700.0 * (10.0 ** (mel / 2595.0) - 1.0)

    low_mel = to_mel(_BAND_LOW_HZ)
    high_mel = to_mel(sample_rate / 2.0)
    mels = np.linspace(low_mel, high_mel, band_count + 1)
    hz = np.array([from_mel(float(m)) for m in mels])
    bins = np.floor(hz * _FFT_SIZE / sample_rate).astype(int)
    bins = np.clip(bins, 0, _FFT_SIZE // 2)
    # Guarantee every band is at least one bin wide, so no band is silent by construction.
    for index in range(1, len(bins)):
        if bins[index] <= bins[index - 1]:
            bins[index] = bins[index - 1] + 1
    return np.clip(bins, 0, _FFT_SIZE // 2)


def _band_magnitude(magnitude: np.ndarray, sample_rate: int) -> np.ndarray:
    """Collapse the linear spectrum into mel-spaced bands.

    This matters more than it looks. Summed over linear bins, a hi-hat lights up hundreds of
    high bins and a kick lights up four low ones, so the flux says the hat is the bigger
    event. On a mel scale the two are comparable, which is how a listener hears them — and
    the beat grid stops being dragged onto the off-beat hats.
    """
    edges = _mel_edges(sample_rate, _BAND_COUNT)
    bands = np.empty((magnitude.shape[0], _BAND_COUNT), dtype=np.float32)
    for index in range(_BAND_COUNT):
        lo, hi = int(edges[index]), int(edges[index + 1])
        bands[:, index] = np.sum(magnitude[:, lo:hi], axis=1)
    return bands


def _onset_envelope(magnitude: np.ndarray, frame_rate: float, sample_rate: int) -> np.ndarray:
    """Half-wave-rectified log-magnitude flux across mel bands, then normalised."""
    log_magnitude = np.log1p(_band_magnitude(magnitude, sample_rate) * 100.0)
    difference = np.diff(log_magnitude, axis=0)
    flux = np.sum(np.maximum(difference, 0.0), axis=1)
    envelope = np.concatenate(([0.0], flux)).astype(np.float64)

    # Subtract a local mean so a loud section cannot swamp a quiet one. The window is defined
    # in *seconds*, not frames: at roughly one second it spans several beats at any tempo in
    # range. Defining it in frames made it shorter than one beat at 150 BPM, which cancelled
    # the very periodicity the tempo estimator was looking for.
    window_frames = max(3, int(round(frame_rate * _LOCAL_MEAN_SECONDS)))
    local_mean = _moving_average(envelope, window_frames)
    envelope = np.maximum(envelope - local_mean, 0.0)
    peak = float(np.max(envelope)) if envelope.size else 0.0
    if peak > 0.0:
        envelope = envelope / peak
    return envelope


def _low_band_envelope(magnitude: np.ndarray, sample_rate: int) -> np.ndarray:
    """Onset strength restricted to the bass band — the kick drum's home."""
    bin_hz = sample_rate / float(_FFT_SIZE)
    top_bin = max(2, int(_LOW_BAND_HZ / bin_hz))
    low = magnitude[:, :top_bin]
    log_magnitude = np.log1p(low * 1000.0)
    difference = np.diff(log_magnitude, axis=0)
    flux = np.sum(np.maximum(difference, 0.0), axis=1)
    envelope = np.concatenate(([0.0], flux)).astype(np.float64)
    peak = float(np.max(envelope)) if envelope.size else 0.0
    return envelope / peak if peak > 0.0 else envelope


def _moving_average(values: np.ndarray, window: int) -> np.ndarray:
    """Centred moving average with edge padding. Window is forced odd."""
    if window <= 1 or values.size == 0:
        return np.zeros_like(values)
    if window % 2 == 0:
        window += 1
    half = window // 2
    padded = np.pad(values, (half, half), mode="edge")
    kernel = np.ones(window, dtype=np.float64) / float(window)
    return np.convolve(padded, kernel, mode="valid")


def _estimate_tempo(envelope: np.ndarray, frame_rate: float) -> float:
    """Autocorrelation tempo estimate, constrained to 50–200 BPM."""
    if envelope.size < 8:
        raise BeatDetectionFailed("audio is too short to estimate a tempo")

    centred = envelope - float(np.mean(envelope))
    correlation = np.correlate(centred, centred, mode="full")[len(centred) - 1 :]
    if correlation.size == 0 or correlation[0] <= 0:
        raise BeatDetectionFailed("onset envelope carries no periodicity")
    correlation = correlation / correlation[0]

    min_lag = max(1, int(round(frame_rate * 60.0 / MAX_BPM)))
    max_lag = min(correlation.size - 1, int(round(frame_rate * 60.0 / MIN_BPM)))
    if max_lag <= min_lag:
        raise BeatDetectionFailed("audio is too short to estimate a tempo")

    lags = np.arange(min_lag, max_lag + 1, dtype=np.float64)
    candidate_bpm = 60.0 * frame_rate / lags
    prior = np.exp(
        -0.5
        * (np.log2(candidate_bpm / _TEMPO_PRIOR_CENTRE_BPM) / _TEMPO_PRIOR_WIDTH_OCTAVES) ** 2
    )
    scored = correlation[min_lag : max_lag + 1] * prior

    best = int(np.argmax(scored))
    best_lag = float(lags[best])

    # Parabolic interpolation on the autocorrelation peak for sub-frame tempo precision.
    if 0 < best < len(scored) - 1:
        left, centre, right = scored[best - 1], scored[best], scored[best + 1]
        denominator = left - 2.0 * centre + right
        if abs(denominator) > 1e-12:
            best_lag += 0.5 * (left - right) / denominator

    bpm = 60.0 * frame_rate / best_lag
    return float(np.clip(bpm, MIN_BPM, MAX_BPM))


def _track_beats(envelope: np.ndarray, period_frames: float) -> list[int]:
    """Ellis dynamic-programming beat tracker. Returns beat frame indices."""
    frame_count = envelope.size
    if frame_count < 4 or period_frames < 2.0:
        raise BeatDetectionFailed("not enough frames to track beats")

    # Candidate previous-beat offsets, roughly half to double the expected period.
    lower = max(1, int(round(period_frames * 0.5)))
    upper = max(lower + 1, int(round(period_frames * 2.0)))
    offsets = np.arange(lower, upper + 1, dtype=np.float64)
    # Penalty grows with the square of the log deviation from the expected period.
    transition_cost = -_DP_TIGHTNESS * (np.log(offsets / period_frames) ** 2)

    score = np.zeros(frame_count, dtype=np.float64)
    backlink = np.full(frame_count, -1, dtype=np.int64)

    for frame in range(frame_count):
        start = frame - upper
        end = frame - lower
        if end < 0:
            score[frame] = envelope[frame]
            continue
        window_start = max(0, start)
        candidates = score[window_start : end + 1]
        # transition_cost is ordered by increasing offset, i.e. decreasing frame index.
        costs = transition_cost[: end + 1 - window_start][::-1]
        combined = candidates + costs
        best_local = int(np.argmax(combined))
        score[frame] = envelope[frame] + combined[best_local]
        backlink[frame] = window_start + best_local

    # Start the backtrace from a strong late peak rather than the very last frame.
    tail_start = max(0, frame_count - int(round(period_frames * 2.0)) - 1)
    best_end = tail_start + int(np.argmax(score[tail_start:]))

    beats: list[int] = []
    cursor = best_end
    guard = 0
    while cursor >= 0 and guard <= frame_count:
        beats.append(int(cursor))
        cursor = int(backlink[cursor])
        guard += 1
    beats.reverse()

    if len(beats) < 2:
        raise BeatDetectionFailed("beat tracking produced fewer than two beats")
    return beats


def _refine_frame(envelope: np.ndarray, frame: int) -> float:
    """Parabolic interpolation around a frame, so beats are not stuck on the 23ms grid."""
    if frame <= 0 or frame >= envelope.size - 1:
        return float(frame)
    left, centre, right = envelope[frame - 1], envelope[frame], envelope[frame + 1]
    denominator = left - 2.0 * centre + right
    if abs(denominator) < 1e-12:
        return float(frame)
    shift = 0.5 * (left - right) / denominator
    return float(frame) + float(np.clip(shift, -0.5, 0.5))


def _beat_onset_strengths(
    beats_sec: list[float], envelope: np.ndarray, frame_rate: float, half_window_sec: float
) -> np.ndarray:
    """Peak onset strength in a window around each beat."""
    strengths = np.zeros(len(beats_sec), dtype=np.float64)
    for index, beat in enumerate(beats_sec):
        lo = int(round((beat - half_window_sec) * frame_rate))
        hi = int(round((beat + half_window_sec) * frame_rate))
        lo = max(0, min(lo, envelope.size - 1))
        hi = max(lo + 1, min(hi, envelope.size))
        strengths[index] = float(np.max(envelope[lo:hi]))
    return strengths


def _trim_silent_ends(
    beats_sec: list[float], envelope: np.ndarray, frame_rate: float
) -> list[float]:
    """Drop beats at the very start or end that sit over silence.

    A tracker happily extends the grid into a track's lead-in and fade-out. Those beats are
    real in a musical sense but they are useless to a reel, and they make the beat count
    disagree with the bar count.
    """
    if len(beats_sec) < 4:
        return beats_sec

    intervals = np.diff(np.asarray(beats_sec, dtype=np.float64))
    half_window = float(np.median(intervals)) * 0.5 if intervals.size else 0.25
    strengths = _beat_onset_strengths(beats_sec, envelope, frame_rate, half_window)

    reference = float(np.median(strengths))
    if reference <= 0.0:
        return beats_sec
    floor = reference * _SILENT_BEAT_RATIO

    first = 0
    while first < len(beats_sec) - 3 and strengths[first] < floor:
        first += 1
    last = len(beats_sec) - 1
    while last > first + 2 and strengths[last] < floor:
        last -= 1

    return beats_sec[first : last + 1]


def _resolve_tempo_halving(
    low_band: np.ndarray, frame_rate: float, bpm: float, beat_frames: list[int]
) -> tuple[float, list[int] | None]:
    """Decide whether every other "beat" is really just a hi-hat.

    The mirror image of the doubling problem. A 72 BPM track with hats on every eighth note
    correlates strongly at 144, and the tempo prior — which leans towards 120 — happily takes
    it. The grid is then twice as dense as the music, and every slide comes out half as long
    as the template intended.

    The test uses the **bass band only**. A real beat is carried by the rhythm section: a kick
    or a snare both put energy under 220Hz, a hi-hat puts almost none there. So if alternating
    beats differ sharply in bass energy, the weak half are not beats.

    Measured across a tempo sweep of synthesised tracks: genuinely doubled grids score
    0.33; correctly tracked grids score 0.57 to 0.81. The threshold sits in that gap.
    """
    halved = bpm / 2.0
    if halved < MIN_BPM or len(beat_frames) < 8:
        return bpm, None

    period = 60.0 * frame_rate / bpm
    half_window = max(1, int(round(period * 0.25)))
    strengths = np.array(
        [
            float(np.max(low_band[max(0, frame - half_window) : frame + half_window + 1]))
            if low_band.size
            else 0.0
            for frame in beat_frames
        ]
    )
    if strengths.size < 8:
        return bpm, None

    even = float(np.mean(strengths[0::2]))
    odd = float(np.mean(strengths[1::2]))
    stronger = max(even, odd)
    if stronger <= 0.0:
        return bpm, None
    if min(even, odd) / stronger >= _HALVING_LOW_BAND_RATIO:
        return bpm, None

    keep_parity = 0 if even >= odd else 1
    return halved, beat_frames[keep_parity::2]


def _resolve_tempo_octave(
    envelope: np.ndarray, frame_rate: float, bpm: float, base_frames: list[int]
) -> tuple[float, list[int] | None]:
    """Decide whether the real pulse is twice the tempo the autocorrelation reported.

    Half-tempo is the classic beat-tracking error. A kick on beats 1 and 3 with a snare on 2
    and 4 correlates most strongly at the half-note, so a 150 BPM track reads as 75 — and
    every cut then lands on every *other* beat, halving the editing resolution.

    The test: track at the doubled tempo, then split those beats into the ones that coincide
    with the slower grid and the ones that were added in between. If the added beats carry
    onset energy comparable to the original ones, they are real beats and the faster tempo is
    right. If they are much weaker, they are hi-hats or noise and the slower tempo stands.

    Measured on synthesised fixtures: a genuine doubling scores 1.15–1.29; a spurious one
    (eighth-note hats under a 96 BPM pulse) scores 0.57–0.71. The threshold sits in that gap.
    """
    doubled = bpm * 2.0
    if doubled > MAX_BPM or not base_frames:
        return bpm, None

    period = 60.0 * frame_rate / doubled
    try:
        frames = _track_beats(envelope, period)
    except BeatDetectionFailed:
        return bpm, None
    if len(frames) < 4:
        return bpm, None

    half_window = max(1, int(round(period * 0.25)))
    tolerance = period * 0.5
    base = np.asarray(base_frames, dtype=np.float64)

    aligned: list[float] = []
    added: list[float] = []
    for frame in frames:
        lo = max(0, frame - half_window)
        hi = min(envelope.size, frame + half_window + 1)
        if hi <= lo:
            continue
        strength = float(np.max(envelope[lo:hi]))
        if float(np.min(np.abs(base - frame))) <= tolerance:
            aligned.append(strength)
        else:
            added.append(strength)

    if not aligned or not added:
        return bpm, None
    aligned_mean = float(np.mean(aligned))
    if aligned_mean <= 0.0:
        return bpm, None

    if float(np.mean(added)) / aligned_mean >= _OCTAVE_OFFBEAT_RATIO:
        return doubled, frames
    return bpm, None


def _tempo_from_beats(beats_sec: list[float]) -> float:
    """Least-squares tempo across the whole beat sequence.

    The median interval is quantised to the analysis grid and lands a whole BPM out on a
    steady track. Fitting a line through (beat number, beat time) averages that error away.
    """
    count = len(beats_sec)
    if count < 2:
        return 0.0
    indices = np.arange(count, dtype=np.float64)
    times = np.asarray(beats_sec, dtype=np.float64)
    slope, _ = np.polyfit(indices, times, 1)
    if slope <= 1e-6:
        return 0.0
    return 60.0 / float(slope)


def _choose_downbeat_phase(
    beat_frames: list[int], low_band: np.ndarray, beats_per_bar: int
) -> int:
    """Pick the bar phase whose beats carry the most bass energy."""
    if beats_per_bar <= 1 or not beat_frames:
        return 0
    best_phase = 0
    best_score = -np.inf
    for phase in range(beats_per_bar):
        indices = [
            beat_frames[i]
            for i in range(phase, len(beat_frames), beats_per_bar)
            if 0 <= beat_frames[i] < low_band.size
        ]
        if not indices:
            continue
        score = float(np.mean(low_band[indices]))
        # Ties resolve to the earliest phase, keeping the result deterministic.
        if score > best_score + 1e-12:
            best_score = score
            best_phase = phase
    return best_phase


class SpectralDpEngine:
    """Default engine. No model weights, no licence entanglement, fully deterministic."""

    name = "spectral_dp"
    version = "1.0.0"

    def detect(self, audio: AudioBuffer, source_path: Path | None = None) -> BeatDetectionResult:
        del source_path  # This engine works from samples, not from the file.

        if audio.samples.size == 0:
            raise BeatDetectionFailed("audio decoded to zero samples")
        if audio.is_silent:
            raise BeatDetectionFailed("audio decodes to silence")

        frame_rate = audio.sample_rate / float(_HOP_SIZE)
        magnitude = _spectrogram(audio.samples)
        envelope = _onset_envelope(magnitude, frame_rate, audio.sample_rate)
        low_band = _low_band_envelope(magnitude, audio.sample_rate)

        bpm = _estimate_tempo(envelope, frame_rate)
        beat_frames = _track_beats(envelope, 60.0 * frame_rate / bpm)

        # Resolve the octave. Halving is checked first because its evidence — bass energy on
        # alternating beats — is the stronger signal of the two.
        bpm, halved_frames = _resolve_tempo_halving(low_band, frame_rate, bpm, beat_frames)
        if halved_frames is not None:
            beat_frames = halved_frames
        else:
            bpm, doubled_frames = _resolve_tempo_octave(envelope, frame_rate, bpm, beat_frames)
            if doubled_frames is not None:
                beat_frames = doubled_frames

        beats_sec = [
            round(_refine_frame(envelope, frame) / frame_rate, 6) for frame in beat_frames
        ]
        # Strictly increasing, always (P4). Refinement can in principle collide two beats.
        deduped: list[float] = []
        for value in beats_sec:
            if not deduped or value > deduped[-1] + 1e-4:
                deduped.append(value)
        beats_sec = deduped
        if len(beats_sec) < 2:
            raise BeatDetectionFailed("fewer than two distinct beats after refinement")

        beats_sec = _trim_silent_ends(beats_sec, envelope, frame_rate)
        if len(beats_sec) < 2:
            raise BeatDetectionFailed("fewer than two beats carry any onset energy")

        # The downbeat phase is chosen against the beats we kept, so trimming cannot shift it.
        kept_frames = [int(round(value * frame_rate)) for value in beats_sec]
        beats_per_bar = 4
        phase = _choose_downbeat_phase(kept_frames, low_band, beats_per_bar)
        downbeats_sec = [
            beats_sec[i] for i in range(phase, len(beats_sec), beats_per_bar)
        ]

        # Report the tempo the tracker actually produced, not the autocorrelation guess.
        measured_bpm = _tempo_from_beats(beats_sec) or bpm

        return BeatDetectionResult(
            beats_sec=beats_sec,
            downbeats_sec=downbeats_sec,
            bpm=round(float(np.clip(measured_bpm, MIN_BPM, MAX_BPM)), 2),
            beats_per_bar=beats_per_bar,
            onset_envelope=envelope.astype(np.float32),
            onset_frame_rate=frame_rate,
        )
