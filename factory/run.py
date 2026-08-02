"""The Factory run. ``python -m factory.run``

One bad track never stops the batch. The title and the reason are logged, and the run carries
on. A run only aborts for things that would corrupt the published catalogue: a rejected token,
a full disk, or a failed upload.

Every log line in spec 01 §7 is produced here, word for word.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from factory.analyse import AnalysisFailed, analyse
from factory.audio_io import AudioDecodeError, load_audio
from factory.config import (
    ANALYSIS_SAMPLE_RATE,
    AUDIO_INDEX_FILENAME,
    OUT_DIR,
    TMP_DIR,
    Credentials,
    load_credentials,
)
from factory.discover import (
    DiscoveredTrack,
    DiscoveryFailed,
    TokenRejected,
    discover,
    discover_local,
)
from factory.engines import DEFAULT_ENGINE_NAME, get_engine
from factory.engines.base import BeatEngineUnavailable
from factory.fetch import FetchFailed, assert_temp_dir_empty, fetch_audio, purge_temp_dir
from factory.fingerprint import fingerprint_audio
from factory.publish import (
    DiskFull,
    PublishFailed,
    load_templates,
    upload_to_r2,
    write_audio_index_only,
    write_local,
)
from factory.schema import BeatMap
from factory.verify import (
    TrackStatus,
    load_previous_beat_maps,
    plan_run,
    recording_changed,
    refresh_verified_at,
)

EXIT_OK = 0
EXIT_ABORTED = 1

MIN_FREE_BYTES = 50 * 1024 * 1024


@dataclass
class RunReport:
    """What happened. Printed as a summary and returned for tests to assert on."""

    used_fixtures: bool = False
    engine_name: str = DEFAULT_ENGINE_NAME
    published: list[str] = field(default_factory=list)
    unchanged: list[str] = field(default_factory=list)
    changed: list[str] = field(default_factory=list)
    retired: list[str] = field(default_factory=list)
    failures: list[tuple[str, str]] = field(default_factory=list)
    # How many published tracks the app's preview can actually stream.
    playable: int = 0
    aborted: bool = False
    abort_reason: str = ""

    @property
    def exit_code(self) -> int:
        return EXIT_ABORTED if self.aborted else EXIT_OK


def _log(message: str) -> None:
    print(message, flush=True)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _timestamp(moment: datetime) -> str:
    return moment.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _analyse_track(
    track: DiscoveredTrack,
    engine,
    tmp_dir: Path,
    moment: datetime,
) -> BeatMap:
    """Fetch, decode and analyse one track. Raises with the exact spec log line."""
    audio_path = fetch_audio(track, tmp_dir=tmp_dir)
    try:
        audio = load_audio(audio_path, ANALYSIS_SAMPLE_RATE)
        return analyse(
            audio,
            engine,
            track_id=track.audio_id,
            title=track.title,
            artist=track.artist,
            source_duration_ms=track.duration_ms or int(audio.duration_sec * 1000),
            source_path=audio_path,
            now=moment,
        )
    finally:
        # P1 — the audio goes as soon as we are finished with it, success or failure.
        audio_path.unlink(missing_ok=True)


def _count_playable_links(destination: Path) -> int:
    """How many tracks came out with a link the preview can stream. Never raises."""
    try:
        payload = json.loads(
            (destination / AUDIO_INDEX_FILENAME).read_text(encoding="utf-8")
        )
    except (OSError, json.JSONDecodeError):
        return 0
    audio = payload.get("audio")
    return len(audio) if isinstance(audio, dict) else 0


def _fingerprint_track(track: DiscoveredTrack, tmp_dir: Path) -> str:
    """Fetch and fingerprint a track without analysing it. Used by re-verification."""
    audio_path = fetch_audio(track, tmp_dir=tmp_dir)
    try:
        audio = load_audio(audio_path, ANALYSIS_SAMPLE_RATE)
        return fingerprint_audio(audio)
    finally:
        audio_path.unlink(missing_ok=True)


def refresh_links(
    credentials: Credentials | None = None,
    out_dir: Path | None = None,
) -> RunReport:
    """
    Republish only the audio links, for the timer. **No audio is fetched.**

    The preview plays the real recording from a link that expires in about a day and a half,
    which is far sooner than anybody pushes code — so something has to republish those links
    on a clock. A full run would download and fingerprint every track to do it, which against
    a few hundred tracks, four times a day, is a great deal of somebody else's bandwidth for
    an answer that changes very rarely. Discovery alone already carries fresh links.

    Everything else is left exactly as the last full run left it, so this can never retire a
    track, change a beat grid, or publish a catalogue.
    """
    creds = credentials if credentials is not None else load_credentials()
    destination = out_dir or OUT_DIR
    report = RunReport()

    try:
        discovered, used_fixtures = discover(creds)
        report.used_fixtures = used_fixtures
    except TokenRejected as exc:
        _log(str(exc))
        report.aborted = True
        report.abort_reason = str(exc)
        return report
    except DiscoveryFailed as exc:
        # The previous links stay published. Some of them may already be dead, and the app
        # checks every expiry before it plays anything, so the cost is a click, not a fault.
        _log(f"DISCOVERY_FAIL: {exc}. Keeping the previous audio links.")
        return report

    previous = load_previous_beat_maps(destination)
    if not previous:
        _log("NO_CATALOGUE: nothing published yet. Run the Factory properly first.")
        return report

    audio_sources = {
        track.audio_id: track.download_url
        for track in discovered
        if track.download_url and track.audio_id in previous
    }
    beat_maps = [previous[track_id] for track_id in sorted(audio_sources)]

    if not beat_maps:
        _log("WARNING: none of the published tracks came back from discovery. Links kept.")
        return report

    try:
        _, index = write_audio_index_only(beat_maps, audio_sources, destination)
    except PublishFailed as exc:
        _log(f"PUBLISH_FAIL {exc}")
        report.aborted = True
        report.abort_reason = str(exc)
        return report

    report.published = sorted(previous)
    report.playable = len(index["audio"])
    _log(
        f"AUDIO_LINKS {report.playable} of {len(previous)} published tracks have a fresh link. "
        f"No audio was fetched."
    )
    return report


def run_factory(
    credentials: Credentials | None = None,
    out_dir: Path | None = None,
    tmp_dir: Path | None = None,
    fixtures_dir: Path | None = None,
    engine_name: str | None = None,
    skip_upload: bool = False,
) -> RunReport:
    """Run the whole pipeline once. Never raises for a single bad track."""
    creds = credentials if credentials is not None else load_credentials()
    destination = out_dir or OUT_DIR
    temp = tmp_dir or TMP_DIR
    report = RunReport()

    try:
        engine = get_engine(engine_name)
    except BeatEngineUnavailable as exc:
        _log(f"FATAL: {exc}")
        report.aborted = True
        report.abort_reason = str(exc)
        return report
    report.engine_name = engine.name

    local_tracks = discover_local()
    if local_tracks:
        _log(
            f"LOCAL_AUDIO: analysing {len(local_tracks)} track(s) from factory/local. "
            "For hearing the cuts against your own music — never published."
        )
    elif not creds.has_meta:
        _log("NO_CREDENTIALS: running in fixture mode. Set META_ACCESS_TOKEN for live data.")
        report.used_fixtures = True

    try:
        discovered, used_fixtures = discover(creds, fixtures_dir=fixtures_dir)
        report.used_fixtures = used_fixtures
    except TokenRejected as exc:
        _log(str(exc))
        report.aborted = True
        report.abort_reason = str(exc)
        return report
    except DiscoveryFailed as exc:
        _log(f"DISCOVERY_FAIL: {exc}. Keeping the previous catalogue.")
        report.aborted = False
        return report

    if not discovered:
        _log("WARNING: the trending list came back empty. Keeping the previous catalogue.")
        return report

    previous = load_previous_beat_maps(destination)
    plan = plan_run(discovered, previous)
    moment = _now()
    stamp = _timestamp(moment)

    ready: list[BeatMap] = []

    try:
        temp.mkdir(parents=True, exist_ok=True)

        # 1. Re-verify what we already have. Duration already ruled some out; fingerprint the rest.
        discovered_by_id = {track.audio_id: track for track in discovered}
        for existing in plan.unchanged:
            track = discovered_by_id.get(existing.trackId)
            if track is None:
                continue
            try:
                fingerprint = _fingerprint_track(track, temp)
            except (FetchFailed, AudioDecodeError) as exc:
                # Cannot re-verify it, so keep serving what we have rather than dropping it.
                _log(f"VERIFY_SKIP {existing.title}: {exc}")
                ready.append(refresh_verified_at(existing, stamp))
                continue

            if recording_changed(existing, fingerprint):
                _log(f"CHANGED {existing.title}: fingerprint differs, re-analysing")
                report.changed.append(existing.trackId)
                plan.changed.append(track)
            else:
                report.unchanged.append(existing.trackId)
                ready.append(refresh_verified_at(existing, stamp))

        # 2. Duration mismatches spotted before any fetch are already in plan.changed.
        for track in plan.changed:
            if track.audio_id not in report.changed:
                existing = previous.get(track.audio_id)
                label = existing.title if existing else track.title
                _log(f"CHANGED {label}: duration differs, re-analysing")
                report.changed.append(track.audio_id)

        # 3. Analyse everything new or changed. One failure never stops the batch.
        for track in plan.needs_analysis:
            try:
                beat_map = _analyse_track(track, engine, temp, moment)
            except FetchFailed as exc:
                _log(str(exc))
                report.failures.append((track.title, str(exc)))
                continue
            except AudioDecodeError as exc:
                message = f"ANALYSIS_FAIL {track.title}: {exc}"
                _log(message)
                report.failures.append((track.title, message))
                continue
            except AnalysisFailed as exc:
                _log(str(exc))
                report.failures.append((track.title, str(exc)))
                continue

            ready.append(beat_map)
            status = TrackStatus.CHANGED if track.audio_id in report.changed else TrackStatus.NEW
            _log(f"{status.value.upper()} {track.title}: {beat_map.bpm:.0f} BPM, "
                 f"{len(beat_map.beatsSec)} beats")

        # 4. Retired tracks leave the catalogue.
        for beat_map in plan.retired:
            _log(f"RETIRED {beat_map.title}: no longer in Instagram's library")
            report.retired.append(beat_map.trackId)

    finally:
        purge_temp_dir(temp)

    # P1 is asserted, not assumed. A leftover file here is a bug, not a warning.
    assert_temp_dir_empty(temp)

    if not ready:
        _log("WARNING: no usable tracks this run. Keeping the previous catalogue.")
        return report

    # Where the app's preview may stream each recording. Taken from this run's discovery, so a
    # track whose beat map was reused still gets today's link rather than a stale one.
    audio_sources = {
        track.audio_id: track.download_url for track in discovered if track.download_url
    }

    try:
        templates = load_templates()
        _, catalogue = write_local(
            ready, templates, destination, moment, audio_sources=audio_sources
        )
    except DiskFull as exc:
        _log(str(exc))
        report.aborted = True
        report.abort_reason = str(exc)
        return report
    except PublishFailed as exc:
        _log(f"PUBLISH_FAIL {exc}")
        report.aborted = True
        report.abort_reason = str(exc)
        return report

    report.published = [track["trackId"] for track in catalogue["tracks"]]

    # Said out loud because the alternative is a preview that clicks and nobody knowing why.
    report.playable = _count_playable_links(destination)
    _log(
        f"AUDIO_LINKS {report.playable} of {len(report.published)} tracks can be streamed in "
        f"the preview. The rest fall back to the click."
    )

    if creds.has_r2 and not skip_upload:
        try:
            uploaded = upload_to_r2(creds, destination, now=moment)
            _log(f"PUBLISHED {len(uploaded)} files to R2 bucket {creds.r2_bucket}")
        except PublishFailed as exc:
            _log(str(exc))
            _log("Publish aborted. The previous catalogue is still live.")
            report.aborted = True
            report.abort_reason = str(exc)
            return report
    else:
        _log(f"PUBLISHED locally to {destination}. Set R2_* to upload.")

    _log(
        f"DONE engine={report.engine_name} published={len(report.published)} "
        f"unchanged={len(report.unchanged)} changed={len(report.changed)} "
        f"retired={len(report.retired)} failed={len(report.failures)}"
    )
    for title, reason in report.failures:
        _log(f"  failed: {title} — {reason}")

    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m factory.run",
        description="Build beat maps for Instagram's trending tracks and publish them.",
    )
    parser.add_argument("--out", type=Path, default=None, help="output directory")
    parser.add_argument("--tmp", type=Path, default=None, help="temp directory for audio")
    parser.add_argument(
        "--engine",
        default=None,
        help="beat engine: spectral_dp (default) or beat_this",
    )
    parser.add_argument(
        "--no-upload", action="store_true", help="write locally, never upload to R2"
    )
    parser.add_argument(
        "--links-only",
        action="store_true",
        help="republish only the preview's audio links; fetch no audio and touch no beat map",
    )
    arguments = parser.parse_args(argv)

    if arguments.links_only:
        return refresh_links(out_dir=arguments.out).exit_code

    report = run_factory(
        out_dir=arguments.out,
        tmp_dir=arguments.tmp,
        engine_name=arguments.engine,
        skip_upload=arguments.no_upload,
    )
    return report.exit_code


if __name__ == "__main__":
    sys.exit(main())
