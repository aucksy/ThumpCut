"""Check a Meta access token and report, in plain English, what is wrong with it.

``python -m factory.check_meta``

Getting a working Instagram token right involves an account type, a linked Page, two
permissions and an ID nobody has memorised. When any one of them is wrong the API answers with
a number and a sentence written for someone who already knows what they did. This turns that
into the thing to go and fix.

It also finds the Instagram user id from the token, so only one value has to be pasted
anywhere. Nothing is written to disk and nothing is published — this reads and reports.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

from factory.config import (
    FETCH_TIMEOUT_SECONDS,
    META_AUDIO_PATH,
    META_GRAPH_HOST,
    META_GRAPH_VERSION,
    load_credentials,
)

OK = 0
NOT_OK = 1


def _get(path: str, params: dict[str, str]) -> tuple[dict, int | None, str]:
    """GET a Graph endpoint. Returns (payload, error_code, error_message)."""
    url = f"{META_GRAPH_HOST}/{META_GRAPH_VERSION}/{path}?{urllib.parse.urlencode(params)}"
    request = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=FETCH_TIMEOUT_SECONDS) as response:
            return json.loads(response.read().decode("utf-8")), None, ""
    except urllib.error.HTTPError as exc:
        try:
            payload = json.loads(exc.read().decode("utf-8"))
        except Exception:
            return {}, exc.code, f"HTTP {exc.code}"
        error = payload.get("error", {}) if isinstance(payload, dict) else {}
        return {}, int(error.get("code", exc.code) or exc.code), str(error.get("message", ""))
    except urllib.error.URLError as exc:
        return {}, None, f"could not reach Meta: {exc.reason}"
    except TimeoutError:
        return {}, None, "Meta did not answer in time"


def _explain(code: int | None, message: str) -> str:
    """Meta's error, translated into the thing to go and change."""
    if code == 190:
        return (
            "The token has expired or was revoked.\n"
            "     Tokens from the Graph API Explorer last about an hour. Generate a fresh one."
        )
    if code in (10, 200, 3):
        return (
            "The token is missing a permission.\n"
            "     In the Graph API Explorer, tick BOTH 'instagram_basic' and\n"
            "     'instagram_content_publish', then click Generate Access Token again."
        )
    if code == 100:
        return (
            "Meta does not recognise the account this token belongs to.\n"
            "     Almost always one of: the Instagram account is still a personal account\n"
            "     rather than Professional, or it is not connected to a Facebook Page."
        )
    if code == 803:
        return "Meta cannot find that Instagram account. Check it is the Professional one."
    return message or "Meta refused the request and did not say why."


def main() -> int:
    creds = load_credentials()
    token = creds.meta_access_token or os.environ.get("META_ACCESS_TOKEN", "")

    print("Checking your Meta access token\n")

    if not token:
        print("  NO TOKEN.")
        print("     Put it in a file called .env beside this project, as one line:")
        print("       META_ACCESS_TOKEN=<the long string>")
        print("     Or paste it into the terminal first:  set META_ACCESS_TOKEN=<the string>")
        return NOT_OK

    # 1. Is the token alive at all, and whose is it?
    me, code, message = _get("me", {"fields": "id,name", "access_token": token})
    if code is not None or not me:
        print(f"  THE TOKEN DOES NOT WORK.\n     {_explain(code, message)}")
        return NOT_OK
    print(f"  Token belongs to: {me.get('name', 'unknown')}")

    # 2. Find the Instagram account behind it, so nobody has to look up an id by hand.
    pages, code, message = _get(
        "me/accounts",
        {"fields": "name,instagram_business_account", "access_token": token},
    )
    if code is not None:
        print(f"  COULD NOT LIST YOUR FACEBOOK PAGES.\n     {_explain(code, message)}")
        return NOT_OK

    linked = [
        (page.get("name", "?"), page["instagram_business_account"]["id"])
        for page in pages.get("data", [])
        if page.get("instagram_business_account")
    ]

    if not linked:
        print("\n  NO INSTAGRAM ACCOUNT IS CONNECTED TO ANY OF YOUR FACEBOOK PAGES.")
        print("     This is the step people miss. On your phone:")
        print("       Instagram -> Settings -> Account type and tools -> Switch to")
        print("       professional account -> Creator is fine -> connect it to a Facebook")
        print("       Page when it offers. Instagram will make the Page for you.")
        if pages.get("data"):
            print(f"     Pages found, none with Instagram: "
                  f"{', '.join(p.get('name', '?') for p in pages['data'])}")
        else:
            print("     No Facebook Pages found on this account at all.")
        return NOT_OK

    page_name, ig_user_id = linked[0]
    print(f"  Instagram account found via the Page '{page_name}'")
    print(f"  IG_USER_ID = {ig_user_id}")
    if len(linked) > 1:
        print(f"     ({len(linked)} were found; using the first.)")

    # 3. The one that actually matters.
    audio, code, message = _get(
        META_AUDIO_PATH,
        {"audio_type": "music", "user_id": ig_user_id, "access_token": token},
    )
    if code is not None:
        print(f"\n  THE MUSIC LIST IS NOT AVAILABLE.\n     {_explain(code, message)}")
        return NOT_OK

    tracks = audio.get("data", []) if isinstance(audio, dict) else []
    if not tracks:
        print("\n  Meta answered, but returned no tracks.")
        print("     The account is reachable; there is simply nothing trending for it yet.")
        return NOT_OK

    downloadable = [track for track in tracks if track.get("download_url")]
    print(f"\n  WORKS. {len(tracks)} trending tracks, {len(downloadable)} with audio to analyse.")
    for track in downloadable[:5]:
        print(
            f"     · {track.get('title', 'untitled')} — "
            f"{track.get('display_artist', 'unknown artist')}"
        )
    if len(downloadable) < len(tracks):
        print(
            f"     {len(tracks) - len(downloadable)} have no audio preview and will be skipped;\n"
            "     that is normal, Meta does not serve one for every track."
        )

    print("\n  Add these two to the project, and the real catalogue builds itself:")
    print(f"     META_ACCESS_TOKEN = (the token you just used)")
    print(f"     IG_USER_ID        = {ig_user_id}")
    return OK


if __name__ == "__main__":
    sys.exit(main())
