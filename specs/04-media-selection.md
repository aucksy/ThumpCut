# 04 — Media selection

The most edge-case-heavy screen in the app. Treat this spec as the reference example.

---

## 1. Purpose and scope

The screen where the user picks 3–30 photos and video clips (maximum 15 videos), reviews them,
sets a trim in-point on any clip, and continues.

**In scope:** permissions, the picker, the review grid, reorder, remove, per-clip trim,
selection limits, media validation, state restoration.

**Out of scope:** the cut engine (Phase 2), rendering (Phase 6), reordering after leaving this
screen.

---

## 2. States and transitions

| State | What the user sees |
|---|---|
| `PermissionUnknown` | Explainer and an "Allow photo access" button |
| `PermissionDenied` | Explainer and an "Open Settings" button |
| `LimitedAccess` | iOS only. Selected photos plus a "Select more photos" row. |
| `Loading` | Grid skeleton |
| `Empty` | "No photos or videos on this device" |
| `Browsing` | Grid, counter reads "0/30" |
| `MinNotMet` | 1–2 selected. Continue disabled, hint shown. |
| `Ready` | 3–30 selected, ≤15 videos, all validated. Continue enabled. |
| `MaxReached` | 30 selected. Further taps blocked with a toast. |
| `VideoCapReached` | 15 videos selected. Video tiles dimmed, further video taps blocked. |
| `Validating` | Checking selected items are usable, e.g. downloading a cloud placeholder |
| `ItemUnavailable` | One or more items failed validation, shown with a badge and auto-deselected |
| `TrimSheet` | Bottom sheet open on one clip |

| From | Event | Guard | To | Side effect |
|---|---|---|---|---|
| PermissionUnknown | grant | full access | Loading | query media |
| PermissionUnknown | grant | iOS limited | LimitedAccess | query the permitted subset |
| PermissionUnknown | deny | — | PermissionDenied | — |
| PermissionDenied | returns from Settings | access now granted | Loading | re-query |
| PermissionDenied | returns from Settings | still denied | PermissionDenied | — |
| Loading | query done | items > 0 | Browsing | render grid |
| Loading | query done | items = 0 | Empty | — |
| Browsing | tap item | count < 30, and if video, videos < 15 | Browsing or Ready | select, update counter |
| Browsing | tap video | videos = 15 | VideoCapReached | toast E6 |
| Ready | tap item | count = 30 | MaxReached | toast E5 |
| MaxReached | deselect an item | — | Ready | — |
| Ready | tap a clip's duration badge | — | TrimSheet | open sheet |
| TrimSheet | drag handle | — | TrimSheet | update `inPointSec` |
| TrimSheet | tap Done | — | Ready | persist `inPointSec` |
| Ready | tap Continue | all items validated | (Phase 5) | pass selection |
| Ready | tap Continue | an item is cloud-only or unverified | Validating | attempt download |
| Validating | all resolve | — | (Phase 5) | proceed |
| Validating | one or more fail | — | ItemUnavailable | deselect failures, show badge |
| ItemUnavailable | tap Continue | ≥3 valid items remain | (Phase 5) | proceed with the rest |
| ItemUnavailable | tap Continue | <3 valid items remain | MinNotMet | show hint |
| any | app backgrounded then killed | — | (restore) | restore selection and in-points |
| any | permission revoked while backgrounded | — | PermissionDenied | clear selection, re-check on resume |
| any | rotate device | — | (same state) | preserve selection and scroll position |

---

## 3. Acceptance criteria

- Given I have granted full photo access and have media, When the screen opens, Then I see a
  grid and a counter reading "0/30".
- Given I have selected 2 items, When I look at Continue, Then it is disabled and I see "Pick at
  least 3 items."
- Given I have selected 3 items, When I look at Continue, Then it is enabled.
- Given I have selected 30 items, When I tap another, Then it is not selected and I see "You can
  add up to 30 items."
- Given I have selected 15 video clips, When I tap another video, Then it is not selected and I
  see "You can add up to 15 video clips."
- Given I have selected 15 videos, When I tap a photo, Then it is selected normally.
- Given a video clip is selected, When I tap its duration badge, Then a trim sheet opens with the
  in-point already set slightly into the clip.
- Given the trim sheet is open, When I drag the handle, Then the in-point reading updates in
  real time.
- Given I selected an iCloud photo that is not downloaded, When I tap Continue, Then I see a
  brief preparing state, and if it cannot be downloaded it is marked unavailable and I can
  continue with the rest.
- Given the operating system kills the app while it is backgrounded, When I reopen it, Then my
  selection and any trim in-points are still there.
- Given I revoked photo access while the app was backgrounded, When I return, Then I see the
  permission screen and my selection is cleared.
- Given I rotate the device, When the screen redraws, Then my selection and scroll position are
  unchanged.
- Given I tap Continue twice quickly, When the app responds, Then it advances once.

---

## 4. Edge cases

| Row | Handling |
|---|---|
| A — 0 media on device | `Empty` |
| A — exactly 3 selected | Continue enabled |
| A — exactly 30 selected | `MaxReached`, further taps blocked |
| A — 31st tap | Blocked with toast E5 |
| A — exactly 15 videos | `VideoCapReached`, video tiles dimmed |
| A — 16th video tap | Blocked with toast E6 |
| A — combined video duration exceeds 300s | Block the selection that crosses it, toast E7 |
| B — backgrounded then process death | Selection and in-points restored |
| B — rotation | Selection and scroll preserved |
| B — incoming call during validation | Validation resumes or restarts cleanly |
| B — split-screen | Grid reflows, selection preserved |
| C — permission denied | `PermissionDenied` with Settings deep link |
| C — permission revoked while backgrounded | Re-checked on resume, selection cleared |
| C — iOS Limited Photo Library | `LimitedAccess` with a "Select more photos" affordance |
| C — "don't ask again" | Same as denied; the button goes to Settings |
| D — cloud-only item cannot download | Auto-deselect, badge, error E3 |
| D — cloud download stalls | 15s timeout, then treat as failed |
| D — item deleted between selection and Continue | Auto-deselect, error E4 |
| D — corrupt or unreadable file | Auto-deselect, error E4 |
| E — HEIC image | Supported; converted at render time |
| E — Live Photo | Treated as a still image |
| E — screen recording | Treated as a normal video |
| E — clip with no audio track | Fine — output is silent anyway |
| E — zero-length or 0-byte file | Auto-deselect, error E4 |
| E — unsupported codec | Auto-deselect, error E8 |
| E — video with rotation metadata | Accepted; rotation stored on the item |
| E — clip shorter than 0.35s | Accepted; the cut engine freeze-extends it |
| G — double-tap Continue | Debounced, fires once |
| G — navigate back mid-validation | Validation cancelled cleanly |
| I — screen reader | Every tile announces type, position, and selected state |
| I — large font | Counter and hints do not clip |
| *Out of scope:* network rows — media is local; RTL until localisation |

---

## 5. Error catalogue

Use this text exactly.

| # | Failure | Exact on-screen text | Recovery |
|---|---|---|---|
| E1 | Photo permission denied | "ThumpCut needs access to your photos to make a reel." + button "Open Settings" | Deep link to Settings; re-check on resume |
| E2 | No media on device | "No photos or videos on this device." | Back is the only exit |
| E3 | Cloud item will not download | "This item couldn't be downloaded and was skipped." | Auto-deselect; keep the rest |
| E4 | Corrupt, missing or unreadable file | "This file can't be used and was skipped." | Auto-deselect |
| E5 | Over item cap | "You can add up to 30 items." *(toast)* | Block the tap |
| E6 | Over video cap | "You can add up to 15 video clips." *(toast)* | Block the tap |
| E7 | Over total video duration | "That's a lot of video. Try removing a longer clip." *(toast)* | Block the tap |
| E8 | Unsupported codec | "This video format isn't supported and was skipped." | Auto-deselect |
| E9 | Fewer than 3 selected | "Pick at least 3 items." *(inline hint)* | Continue stays disabled |
| E10 | All items failed validation | "None of those items could be used. Try picking different ones." | Return to Browsing |

### Non-error copy — use exactly

| Where | Exact text |
|---|---|
| Trim sheet help line | "Pick the moment this clip starts from." |
| Trim sheet in-point label | `IN 0:02.4` — mono, `IN` then mm:ss.s |
| Media count header | `9 items · 3 clips` — mono |
| Selection counter | `0/30` — mono |
| Screen reader, media tile | "Video clip, item 3 of 9, selected." |

---

## 6. Invariants

| ID | Invariant |
|---|---|
| M1 | Continue is enabled **if and only if** 3 ≤ selected ≤ 30, videos ≤ 15, total video ≤ 300s, and every selected item is validated |
| M2 | Selected count never exceeds 30 |
| M3 | Video count never exceeds 15 |
| M4 | An item shown as selected is always in the selection list, and every item in the list is shown as selected — no drift |
| M5 | `inPointSec` is always within `[0, duration - 0.1]` |
| M6 | Selection survives process death |
| M7 | Only one validation pass runs at a time |

---

## 7. Tests and Definition of Done

**Unit and property tests**
```
✓ M1 holds for every combination of count, video count and validation state
✓ property: for any sequence of 0–40 taps in any order, M1–M3 always hold
✓ M5 holds for any drag position, including at both ends of the clip
✓ selection serialises and restores identically           (M6)
✓ double-tap Continue produces one navigation             (G)
✓ each error E1–E10 fires under its exact condition
```

**Instrumented / device tests**
```
✓ process death restores selection      (adb shell am kill, or "Don't keep activities")
✓ permission revoked while backgrounded returns to PermissionDenied
✓ rotation preserves selection and scroll
```

**Definition of Done**
- [ ] Every row of the transition table implemented and covered by a test
- [ ] Every error shows the **exact** text in §5 — no paraphrasing
- [ ] Invariants M1–M7 asserted in code
- [ ] Screen reader announces every tile's type, position and state
- [ ] `npm run typecheck` and `npm test` pass, output shown
- [ ] `quickstart.md` passes on a real mid-range Android device **and** an iPhone

---

## 8. Regression contract

These must still pass after this phase:
- All Phase 2 cut engine tests, unchanged.
- Phase 3: offline-with-cache still shows no error; catalogue still loads.

---

## 9. Quickstart (manual test)

Run on a real mid-range Android phone, then repeat on an iPhone.

1. Fresh install. Open the media screen. Deny permission. Confirm you see "ThumpCut needs access
   to your photos to make a reel." and an Open Settings button.
2. Grant permission in Settings, return. Confirm the grid loads.
3. Select 2 items. Confirm Continue is disabled and you see "Pick at least 3 items."
4. Select a 3rd. Confirm Continue enables.
5. Select up to 30. Try a 31st. Confirm the toast "You can add up to 30 items." and that it does
   not get selected.
6. Deselect down to 15 videos. Try a 16th video. Confirm "You can add up to 15 video clips."
   Then tap a photo — confirm it still selects.
7. Tap a clip's duration badge. Confirm the trim sheet opens with the handle already slightly
   into the clip. Drag it. Confirm the reading updates.
8. **Android only:** enable Developer Options → "Don't keep activities". Select 5 items,
   background the app, reopen. Confirm your selection is still there.
9. **iOS only:** grant Limited access with 3 photos. Confirm you see only those, plus a way to
   select more.
10. Revoke photo permission in Settings while the app is backgrounded. Return. Confirm the
    permission screen appears.
11. Pick an iCloud photo that shows a cloud badge and is not downloaded. Tap Continue. Confirm
    either it downloads, or you see "This item couldn't be downloaded and was skipped." and the
    rest proceed.
12. Rotate the phone. Confirm your selection and scroll position survive.
13. Tap Continue twice fast. Confirm you only advance once.
