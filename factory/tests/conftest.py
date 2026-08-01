"""Shared test fixtures.

Everything here runs offline. No test ever touches the network or the real Meta API.
"""

from __future__ import annotations

import json
import zlib
from pathlib import Path

import numpy as np
import pytest

from factory.audio_io import write_wav
from factory.config import Credentials
from factory.fixtures.make_fixtures import SAMPLE_RATE, synthesise

REPO_ROOT = Path(__file__).resolve().parents[2]
SHIPPED_FIXTURES = REPO_ROOT / "factory" / "fixtures"


@pytest.fixture
def no_credentials() -> Credentials:
    """Empty credentials — the Factory must run in fixture mode with these."""
    return Credentials(
        meta_app_id="",
        meta_app_secret="",
        meta_access_token="",
        ig_user_id="",
        r2_account_id="",
        r2_access_key_id="",
        r2_secret_access_key="",
        r2_bucket="thumpcut-catalogue",
        r2_public_url="",
    )


@pytest.fixture
def meta_credentials() -> Credentials:
    """Credentials good enough to build a URL and exercise the live path with a stub."""
    return Credentials(
        meta_app_id="app-1",
        meta_app_secret="secret-1",
        meta_access_token="token-1",
        ig_user_id="ig-1",
        r2_account_id="",
        r2_access_key_id="",
        r2_secret_access_key="",
        r2_bucket="thumpcut-catalogue",
        r2_public_url="",
    )


@pytest.fixture
def r2_credentials() -> Credentials:
    return Credentials(
        meta_app_id="",
        meta_app_secret="",
        meta_access_token="",
        ig_user_id="",
        r2_account_id="acct",
        r2_access_key_id="AKIAEXAMPLE",
        r2_secret_access_key="wJalrXUtnFEMI",
        r2_bucket="thumpcut-catalogue",
        r2_public_url="https://cdn.example.test",
    )


def make_fixture_dir(
    directory: Path,
    tracks: list[tuple[str, float, int]],
    broken: list[str] | None = None,
) -> Path:
    """Build a fixture directory. ``tracks`` is (audio_id, bpm, bars).

    Anything named in ``broken`` is written as a zero-byte file instead of audio, which is
    how a batch gets one unusable track without touching the good ones.
    """
    directory.mkdir(parents=True, exist_ok=True)
    broken_ids = set(broken or [])
    manifest_tracks = []

    for audio_id, bpm, bars in tracks:
        filename = f"{audio_id}.wav"
        path = directory / filename
        if audio_id in broken_ids:
            path.write_bytes(b"")
            duration_ms = 30000
        else:
            # crc32, not hash(): Python randomises string hashing per process, which would
            # make these fixtures — and therefore the tests — differ between runs.
            seed = zlib.crc32(audio_id.encode("utf-8")) % 9999
            samples, beat_times = synthesise(bpm, bars, seed=seed)
            write_wav(path, samples, SAMPLE_RATE)
            duration_ms = int(round(len(samples) / SAMPLE_RATE * 1000))
        manifest_tracks.append(
            {
                "audio_id": audio_id,
                "file": filename,
                "title": audio_id.replace("-", " ").title(),
                "artist": "Test Kit",
                "duration_in_ms": duration_ms,
                "expected_bpm": bpm,
            }
        )

    (directory / "tracks.json").write_text(
        json.dumps({"sampleRate": SAMPLE_RATE, "tracks": manifest_tracks}, indent=2),
        encoding="utf-8",
    )
    return directory


@pytest.fixture
def tone_audio() -> np.ndarray:
    """A one-second 440Hz tone. Used where the content does not matter, only the bytes."""
    t = np.arange(SAMPLE_RATE, dtype=np.float64) / SAMPLE_RATE
    return (np.sin(2.0 * np.pi * 440.0 * t) * 0.5).astype(np.float32)
