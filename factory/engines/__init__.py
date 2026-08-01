"""Beat detection engines.

Two exist:

``spectral_dp``  Pure NumPy. Spectral-flux onsets, autocorrelation tempo, dynamic-programming
                 beat tracking, low-band downbeat phase. No model weights, no licence
                 entanglement, runs anywhere Python and NumPy run. This is the default.

``beat_this``    Adapter for the published *Beat This!* model. Higher accuracy on real music,
                 but it pulls in PyTorch. Selected with ``BEAT_ENGINE=beat_this``. It is
                 **always** run with ``dbn=False`` — the DBN post-processor pulls in madmom,
                 whose model weights are Creative Commons Non-Commercial.
"""

from __future__ import annotations

import os

from factory.engines.base import BeatDetectionResult, BeatEngine, BeatEngineUnavailable
from factory.engines.spectral_dp import SpectralDpEngine

DEFAULT_ENGINE_NAME = "spectral_dp"


def get_engine(name: str | None = None) -> BeatEngine:
    """Return the requested engine, or the default one.

    Raises BeatEngineUnavailable if a named engine cannot be loaded. Never silently
    substitutes a different engine — the engine name is written into every beat map, and a
    silent swap would make that field a lie.
    """
    requested = (name or os.environ.get("BEAT_ENGINE") or DEFAULT_ENGINE_NAME).strip()

    if requested == "spectral_dp":
        return SpectralDpEngine()

    if requested == "beat_this":
        from factory.engines.beat_this_engine import BeatThisEngine

        return BeatThisEngine()

    raise BeatEngineUnavailable(
        f"unknown BEAT_ENGINE {requested!r}; expected 'spectral_dp' or 'beat_this'"
    )


__all__ = [
    "DEFAULT_ENGINE_NAME",
    "BeatDetectionResult",
    "BeatEngine",
    "BeatEngineUnavailable",
    "SpectralDpEngine",
    "get_engine",
]
