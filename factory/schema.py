"""The beat map schema and its sanity checks.

This is the single contract between the Factory and the app (spec 00 §3.1). The TypeScript
mirror lives in ``packages/cut-engine/src/types.ts``. If this changes, ``schemaVersion``
must be bumped in both.

Invariants asserted here — not merely tested (spec 01 §8):
  P2  downbeatsSec is always a subset of beatsSec
  P3  energyCurve.length == beatsSec.length
  P4  beatsSec is strictly increasing
  P5  every published track has a non-empty contentHash and audioFingerprint
  P9  contentHash changes if and only if the beat map content changed
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any, Literal

from factory.config import MAX_BPM, MIN_BPM

SCHEMA_VERSION = 1

SectionLevel = Literal["low", "medium", "high"]

# Fields that are provenance/bookkeeping rather than beat map *content*.
# contentHash is computed over everything except these, so a re-verify that only touches
# lastVerifiedAt cannot change the hash (P9).
_HASH_EXCLUDED_FIELDS = ("lastVerifiedAt", "contentHash")

# Tolerance when matching a downbeat back to its beat. Beats are stored to the millisecond,
# so anything under half a millisecond is the same instant.
_BEAT_MATCH_TOLERANCE_SEC = 5e-4

# The shortest thing that can honestly be called a section of music.
MIN_SECTION_SEC = 1.0


class BeatMapInvalid(ValueError):
    """A beat map failed a sanity check. The track is excluded, the batch continues."""


@dataclass(frozen=True)
class Section:
    """A stretch of the track with a consistent energy level."""

    startSec: float
    endSec: float
    level: SectionLevel

    def to_json(self) -> dict[str, Any]:
        return {"startSec": self.startSec, "endSec": self.endSec, "level": self.level}


@dataclass
class BeatMap:
    """The precomputed timing data for one track. Numbers only — never audio."""

    trackId: str
    title: str
    artist: str
    durationSec: float
    bpm: float
    beatsSec: list[float]
    downbeatsSec: list[float]
    beatsPerBar: int
    energyCurve: list[float]
    sections: list[Section]
    bestWindowStartSec: float

    # Provenance — used to detect when Instagram swaps the recording.
    sourceDurationMs: int
    audioFingerprint: str
    lastVerifiedAt: str

    engine: str
    engineVersion: str
    contentHash: str = ""
    schemaVersion: int = SCHEMA_VERSION

    def to_json(self) -> dict[str, Any]:
        """Serialise in the exact field order the app expects."""
        return {
            "schemaVersion": self.schemaVersion,
            "trackId": self.trackId,
            "title": self.title,
            "artist": self.artist,
            "durationSec": self.durationSec,
            "bpm": self.bpm,
            "beatsSec": self.beatsSec,
            "downbeatsSec": self.downbeatsSec,
            "beatsPerBar": self.beatsPerBar,
            "energyCurve": self.energyCurve,
            "sections": [s.to_json() for s in self.sections],
            "bestWindowStartSec": self.bestWindowStartSec,
            "sourceDurationMs": self.sourceDurationMs,
            "audioFingerprint": self.audioFingerprint,
            "lastVerifiedAt": self.lastVerifiedAt,
            "engine": self.engine,
            "engineVersion": self.engineVersion,
            "contentHash": self.contentHash,
        }

    @staticmethod
    def from_json(data: dict[str, Any]) -> "BeatMap":
        """Rebuild a beat map from its JSON form. Raises on a malformed object."""
        try:
            sections = [
                Section(
                    startSec=float(s["startSec"]),
                    endSec=float(s["endSec"]),
                    level=s["level"],
                )
                for s in data.get("sections", [])
            ]
            return BeatMap(
                trackId=str(data["trackId"]),
                title=str(data.get("title", "")),
                artist=str(data.get("artist", "")),
                durationSec=float(data["durationSec"]),
                bpm=float(data["bpm"]),
                beatsSec=[float(v) for v in data["beatsSec"]],
                downbeatsSec=[float(v) for v in data["downbeatsSec"]],
                beatsPerBar=int(data.get("beatsPerBar", 4)),
                energyCurve=[float(v) for v in data["energyCurve"]],
                sections=sections,
                bestWindowStartSec=float(data.get("bestWindowStartSec", 0.0)),
                sourceDurationMs=int(data.get("sourceDurationMs", 0)),
                audioFingerprint=str(data.get("audioFingerprint", "")),
                lastVerifiedAt=str(data.get("lastVerifiedAt", "")),
                engine=str(data.get("engine", "")),
                engineVersion=str(data.get("engineVersion", "")),
                contentHash=str(data.get("contentHash", "")),
                schemaVersion=int(data.get("schemaVersion", SCHEMA_VERSION)),
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise BeatMapInvalid(f"malformed beat map: {exc}") from exc


def compute_content_hash(beat_map: BeatMap) -> str:
    """Hash the beat map's *content*, ignoring provenance timestamps.

    P9: the hash changes if and only if the timing data changed. Re-verifying an unchanged
    track updates ``lastVerifiedAt`` and must leave the hash alone, or every app on earth
    re-downloads every beat map every day.
    """
    payload = beat_map.to_json()
    for key in _HASH_EXCLUDED_FIELDS:
        payload.pop(key, None)
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _is_strictly_increasing(values: list[float]) -> bool:
    return all(b > a for a, b in zip(values, values[1:]))


def validate_beat_map(beat_map: BeatMap) -> None:
    """Assert every invariant. Raises BeatMapInvalid with the exact spec wording.

    Called before a beat map is ever written, so a broken map can never reach the app.
    """
    title = beat_map.title or beat_map.trackId

    if beat_map.schemaVersion != SCHEMA_VERSION:
        raise BeatMapInvalid(
            f"ANALYSIS_FAIL {title}: schemaVersion {beat_map.schemaVersion}, expected {SCHEMA_VERSION}"
        )

    if beat_map.durationSec < 10.0:
        raise BeatMapInvalid(
            f"ANALYSIS_FAIL {title}: only {beat_map.durationSec:.0f}s, need 10s minimum"
        )

    if not (MIN_BPM <= beat_map.bpm <= MAX_BPM):
        raise BeatMapInvalid(
            f"ANALYSIS_FAIL {title}: detected {beat_map.bpm:.0f} BPM, outside 50–200"
        )

    if len(beat_map.energyCurve) != len(beat_map.beatsSec):
        raise BeatMapInvalid(
            f"ANALYSIS_FAIL {title}: energyCurve {len(beat_map.energyCurve)} "
            f"!= beats {len(beat_map.beatsSec)}"
        )

    if not beat_map.beatsSec:
        raise BeatMapInvalid(f"ANALYSIS_FAIL {title}: no beats detected")

    # P4 — strictly increasing.
    if not _is_strictly_increasing(beat_map.beatsSec):
        raise BeatMapInvalid(f"ANALYSIS_FAIL {title}: beatsSec is not strictly increasing")

    # P2 — downbeats are a subset of beats.
    beats = beat_map.beatsSec
    for downbeat in beat_map.downbeatsSec:
        if not _contains_within_tolerance(beats, downbeat):
            raise BeatMapInvalid(
                f"ANALYSIS_FAIL {title}: downbeat {downbeat:.3f}s is not in beatsSec"
            )

    if not _is_strictly_increasing(beat_map.downbeatsSec):
        raise BeatMapInvalid(f"ANALYSIS_FAIL {title}: downbeatsSec is not strictly increasing")

    if any(not (0.0 <= v <= 1.0) for v in beat_map.energyCurve):
        raise BeatMapInvalid(f"ANALYSIS_FAIL {title}: energyCurve has a value outside 0..1")

    if beat_map.beatsPerBar <= 0:
        raise BeatMapInvalid(f"ANALYSIS_FAIL {title}: beatsPerBar must be positive")

    for section in beat_map.sections:
        if section.endSec <= section.startSec:
            raise BeatMapInvalid(
                f"ANALYSIS_FAIL {title}: section {section.startSec:.2f}–{section.endSec:.2f} is empty"
            )
        # A "section" of a few milliseconds is a bug in the banding, not a passage of music.
        # Caught here so it can never reach the app, where it would show as a dead band on
        # the beat ruler.
        if len(beat_map.sections) > 1 and (section.endSec - section.startSec) < MIN_SECTION_SEC:
            raise BeatMapInvalid(
                f"ANALYSIS_FAIL {title}: section {section.startSec:.2f}–{section.endSec:.2f} "
                f"is shorter than {MIN_SECTION_SEC}s"
            )
        if section.level not in ("low", "medium", "high"):
            raise BeatMapInvalid(f"ANALYSIS_FAIL {title}: unknown section level {section.level!r}")

    for a, b in zip(beat_map.sections, beat_map.sections[1:]):
        if abs(b.startSec - a.endSec) > 1e-6:
            raise BeatMapInvalid(
                f"ANALYSIS_FAIL {title}: sections leave a gap at {a.endSec:.2f}s"
            )

    if not (0.0 <= beat_map.bestWindowStartSec <= beat_map.durationSec):
        raise BeatMapInvalid(
            f"ANALYSIS_FAIL {title}: bestWindowStartSec {beat_map.bestWindowStartSec:.2f} "
            f"is outside the track"
        )


def validate_publishable(beat_map: BeatMap) -> None:
    """P5 — a published track always carries provenance. Checked at publish time."""
    validate_beat_map(beat_map)
    if not beat_map.contentHash:
        raise BeatMapInvalid(f"PUBLISH_FAIL {beat_map.trackId}: contentHash is empty")
    if not beat_map.audioFingerprint:
        raise BeatMapInvalid(f"PUBLISH_FAIL {beat_map.trackId}: audioFingerprint is empty")
    expected = compute_content_hash(beat_map)
    if beat_map.contentHash != expected:
        raise BeatMapInvalid(
            f"PUBLISH_FAIL {beat_map.trackId}: contentHash does not match its content"
        )


def _contains_within_tolerance(sorted_values: list[float], target: float) -> bool:
    """Binary-search a sorted list for a value within the beat-match tolerance."""
    lo, hi = 0, len(sorted_values) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        value = sorted_values[mid]
        if abs(value - target) <= _BEAT_MATCH_TOLERANCE_SEC:
            return True
        if value < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return False


__all__ = [
    "SCHEMA_VERSION",
    "BeatMap",
    "BeatMapInvalid",
    "Section",
    "SectionLevel",
    "compute_content_hash",
    "validate_beat_map",
    "validate_publishable",
]
