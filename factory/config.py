"""Configuration and paths for the Factory.

Credentials are optional by design. With no ``META_ACCESS_TOKEN`` the Factory runs in
fixture mode (spec 01 §10) so that nothing downstream is ever blocked on API access.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

FACTORY_DIR = Path(__file__).resolve().parent
REPO_ROOT = FACTORY_DIR.parent

TMP_DIR = FACTORY_DIR / "tmp"
OUT_DIR = FACTORY_DIR / "out"
FIXTURES_DIR = FACTORY_DIR / "fixtures"
# Where the owner drops his own music to hear the cuts against it. Gitignored, so nothing
# commercial ever reaches the repository, and absent in CI — which is what keeps a locally
# analysed track from ever reaching the published catalogue.
LOCAL_DIR = FACTORY_DIR / "local"

CATALOGUE_FILENAME = "catalogue.json"
BEATMAP_DIRNAME = "beatmaps"

# Sanity thresholds — spec 01 §5 and §7.
MIN_TRACK_SECONDS = 10.0
MIN_BPM = 50.0
MAX_BPM = 200.0

# Meta Instagram Audio API — spec 01 §2. This host and path are the only audio source.
META_GRAPH_HOST = "https://graph.facebook.com"
META_GRAPH_VERSION = "v21.0"
META_AUDIO_PATH = "ig_audio"

# Network behaviour.
FETCH_TIMEOUT_SECONDS = 30
FETCH_MAX_ATTEMPTS = 3
FETCH_BACKOFF_SECONDS = (1.0, 3.0, 9.0)

# Analysis.
ANALYSIS_SAMPLE_RATE = 22050
FINGERPRINT_SAMPLE_RATE = 8000


def _load_dotenv(path: Path) -> None:
    """Read a .env file into os.environ without adding a dependency.

    Values already present in the real environment always win.
    """
    if not path.is_file():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


@dataclass(frozen=True)
class Credentials:
    """Meta and Cloudflare R2 credentials. Every field may be empty."""

    meta_app_id: str
    meta_app_secret: str
    meta_access_token: str
    ig_user_id: str
    r2_account_id: str
    r2_access_key_id: str
    r2_secret_access_key: str
    r2_bucket: str
    r2_public_url: str

    @property
    def has_meta(self) -> bool:
        """
        True when a live Meta call is possible.

        The Instagram user id is deliberately not required: it can be looked up from the token
        itself, and asking somebody to find it by hand is three clicks in a console they will
        see once and an id nobody remembers. One secret, not two.
        """
        return bool(self.meta_access_token)

    @property
    def has_r2(self) -> bool:
        """True when publishing to Cloudflare R2 is possible."""
        return bool(
            self.r2_account_id
            and self.r2_access_key_id
            and self.r2_secret_access_key
            and self.r2_bucket
        )


def load_credentials(env_file: Path | None = None) -> Credentials:
    """Load credentials from the environment, falling back to a .env file."""
    _load_dotenv(env_file if env_file is not None else REPO_ROOT / ".env")
    get = os.environ.get
    return Credentials(
        meta_app_id=get("META_APP_ID", "") or "",
        meta_app_secret=get("META_APP_SECRET", "") or "",
        meta_access_token=get("META_ACCESS_TOKEN", "") or "",
        ig_user_id=get("IG_USER_ID", "") or "",
        r2_account_id=get("R2_ACCOUNT_ID", "") or "",
        r2_access_key_id=get("R2_ACCESS_KEY_ID", "") or "",
        r2_secret_access_key=get("R2_SECRET_ACCESS_KEY", "") or "",
        r2_bucket=get("R2_BUCKET", "thumpcut-catalogue") or "thumpcut-catalogue",
        r2_public_url=get("R2_PUBLIC_URL", "") or "",
    )
