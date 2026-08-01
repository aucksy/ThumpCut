"""Re-verification — runs on every batch, not occasionally.

Three things happen to tracks in the wild:

* a track is pulled when a licence lapses  → **Retired**
* a recording is swapped for a remaster or a clean version → **Changed**
* nothing happens → **Unchanged**

The swap is the dangerous one. Nothing errors; the beat grid is just silently wrong against a
different master. So every track already in the catalogue is checked by duration first (cheap)
and by fingerprint second (definitive).

Key on ``audio_id``, trust the fingerprint. If Meta ever reuses an id, the fingerprint catches
it and the duration check backs it up.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from enum import Enum
from pathlib import Path

from factory.config import BEATMAP_DIRNAME, CATALOGUE_FILENAME
from factory.discover import DiscoveredTrack
from factory.fingerprint import fingerprints_match
from factory.schema import BeatMap, BeatMapInvalid


class TrackStatus(str, Enum):
    """Where a track sits in this run."""

    NEW = "New"
    UNCHANGED = "Unchanged"
    CHANGED = "Changed"
    RETIRED = "Retired"


@dataclass(frozen=True)
class VerificationPlan:
    """What this run has to do, decided before any audio is fetched."""

    new: list[DiscoveredTrack]
    unchanged: list[BeatMap]
    changed: list[DiscoveredTrack]
    retired: list[BeatMap]

    @property
    def needs_analysis(self) -> list[DiscoveredTrack]:
        """Tracks that must be fetched and analysed: brand new, plus swapped recordings."""
        return [*self.new, *self.changed]


def load_previous_beat_maps(out_dir: Path) -> dict[str, BeatMap]:
    """Read the beat maps from the last published run. Missing or broken files are skipped."""
    catalogue_path = out_dir / CATALOGUE_FILENAME
    if not catalogue_path.is_file():
        return {}

    try:
        catalogue = json.loads(catalogue_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}

    beat_maps: dict[str, BeatMap] = {}
    for entry in catalogue.get("tracks", []):
        track_id = str(entry.get("trackId", ""))
        if not track_id:
            continue
        relative = str(entry.get("beatMapPath") or f"{BEATMAP_DIRNAME}/{track_id}.json")
        path = out_dir / relative
        if not path.is_file():
            continue
        try:
            beat_maps[track_id] = BeatMap.from_json(json.loads(path.read_text(encoding="utf-8")))
        except (OSError, json.JSONDecodeError, BeatMapInvalid):
            continue
    return beat_maps


def plan_run(
    discovered: list[DiscoveredTrack], previous: dict[str, BeatMap]
) -> VerificationPlan:
    """Split the discovered list against what we already have.

    Duration is the cheap check and runs here. The fingerprint check needs the audio, so it
    happens later — see ``recheck_after_fetch``.
    """
    discovered_by_id = {track.audio_id: track for track in discovered}

    new: list[DiscoveredTrack] = []
    unchanged: list[BeatMap] = []
    changed: list[DiscoveredTrack] = []

    for track in discovered:
        existing = previous.get(track.audio_id)
        if existing is None:
            new.append(track)
        elif track.duration_ms > 0 and existing.sourceDurationMs > 0 and (
            track.duration_ms != existing.sourceDurationMs
        ):
            changed.append(track)
        else:
            unchanged.append(existing)

    retired = [
        beat_map
        for track_id, beat_map in sorted(previous.items())
        if track_id not in discovered_by_id
    ]

    return VerificationPlan(new=new, unchanged=unchanged, changed=changed, retired=retired)


def recording_changed(previous: BeatMap, fingerprint: str) -> bool:
    """True when the fetched audio is a different recording from the one we analysed."""
    if not previous.audioFingerprint:
        return True
    return not fingerprints_match(previous.audioFingerprint, fingerprint)


def refresh_verified_at(beat_map: BeatMap, timestamp: str) -> BeatMap:
    """Unchanged tracks move ``lastVerifiedAt`` and nothing else.

    ``contentHash`` is computed over everything *except* that field, so the hash stays
    identical and no app re-downloads a beat map that did not change (P9).
    """
    beat_map.lastVerifiedAt = timestamp
    return beat_map
