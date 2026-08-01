"""Recording fingerprints.

Instagram swaps recordings underneath us — a remaster, a clean version, a regional master.
Nothing errors when that happens; the beat grid is simply, silently wrong. The fingerprint is
how we notice.

This only has to answer one question: *is this a different recording from the one we analysed?*
It does not have to identify unknown audio, so a content hash of the decoded signal is enough.

Method: decode to mono, resample to 8kHz, normalise the peak to 1.0, quantise to 8-bit, and
SHA-256 the result. Normalising and quantising make it survive a re-encode at a different
bitrate, which is the one difference we must *not* flag.
"""

from __future__ import annotations

import hashlib

import numpy as np

from factory.audio_io import AudioBuffer, resample
from factory.config import FINGERPRINT_SAMPLE_RATE

FINGERPRINT_PREFIX = "sha256-pcm8k"


def fingerprint_audio(audio: AudioBuffer) -> str:
    """Return a stable fingerprint string for a decoded recording."""
    if audio.samples.size == 0:
        return f"{FINGERPRINT_PREFIX}:empty"

    downsampled = resample(audio, FINGERPRINT_SAMPLE_RATE).samples.astype(np.float64)

    peak = float(np.max(np.abs(downsampled)))
    if peak > 1e-9:
        downsampled = downsampled / peak

    quantised = np.clip(np.round(downsampled * 127.0), -127, 127).astype(np.int8)
    digest = hashlib.sha256(quantised.tobytes()).hexdigest()
    return f"{FINGERPRINT_PREFIX}:{digest}"


def fingerprints_match(left: str, right: str) -> bool:
    """True when two fingerprints describe the same recording."""
    return bool(left) and bool(right) and left == right
