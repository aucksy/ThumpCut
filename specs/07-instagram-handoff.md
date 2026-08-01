# 07 — Instagram handoff

The last phase. Depends on a finished, validated file from Phase 6.

---

## 1. Purpose and scope

Hand the exported MP4 to Instagram so the user lands in the Reels composer, where they pick the
licensed track.

**In scope:** the native module for both platforms, availability detection, the share screen,
the save-to-gallery fallback, error handling.

**Out of scope:** embedding audio for fingerprint matching (deliberately not in the MVP);
posting on the user's behalf; the Instagram Graph API.

---

## 2. Native interface

```typescript
interface InstagramShare {
  isAvailable(): Promise<boolean>;
  shareToReels(videoUri: string): Promise<void>;
}
```

### Android (Kotlin)
```kotlin
Intent("com.instagram.share.ADD_TO_REEL").apply {
  setPackage("com.instagram.android")
  type = "video/*"
  putExtra("com.instagram.platform.extra.APPLICATION_ID", META_APP_ID)
  putExtra(Intent.EXTRA_STREAM, contentUri)
  addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
}
```
The content URI **must** come from a `FileProvider`. A raw `file://` URI will fail on modern
Android.

`isAvailable()` uses `PackageManager` / `resolveActivity` to check before firing. Always wrap
`startActivity` in a try/catch for `ActivityNotFoundException` — the resolve check can pass and
the launch still fail.

### iOS (Swift)
```swift
let items: [String: Any] = [
  "com.instagram.sharedSticker.backgroundVideo": videoData,
  "com.instagram.sharedSticker.appID": metaAppID
]
UIPasteboard.general.setItems([items], options: [
  .expirationDate: Date().addingTimeInterval(300)
])
UIApplication.shared.open(URL(string: "instagram-reels://share")!)
```
`instagram-reels` **must** be listed in `LSApplicationQueriesSchemes` in `Info.plist`, or
`canOpenURL` always returns false.

**Neither `expo-sharing` nor `react-native-share` sets these keys.** A custom native module is
required. It will not work in Expo Go — a development build is needed.

---

## 3. States and transitions

| State | What the user sees |
|---|---|
| `Ready` | The finished video, "Share to Instagram" and "Save to gallery" |
| `InstagramUnavailable` | Only "Save to gallery" — the Instagram button is not shown |
| `Handing off` | Brief — the button is disabled while the intent fires |
| `Returned` | User came back from Instagram |
| `SaveSuccess` | "Saved to your gallery" |
| `HandoffFailed` | Error with a fallback offered |

| From | Event | Guard | To | Side effect |
|---|---|---|---|---|
| (Phase 6) | export complete | Instagram installed | Ready | — |
| (Phase 6) | export complete | Instagram not installed | InstagramUnavailable | hide the button |
| Ready | tap Share to Instagram | — | Handing off | build URI, fire intent |
| Handing off | Instagram opens | — | (external) | — |
| Handing off | throws / scheme fails | — | HandoffFailed | error I1 |
| (external) | user returns | — | Returned | keep the file, keep both buttons available |
| Ready | tap Save to gallery | — | SaveSuccess | write to MediaStore / Photos |
| Ready | tap Save to gallery | permission denied | HandoffFailed | error I3 |
| HandoffFailed | tap Save to gallery | — | SaveSuccess | fallback path |

**Returning from Instagram is not an ending.** The user may have cancelled. Keep the file and
both buttons available.

---

## 4. Acceptance criteria

- Given Instagram is installed, When the share screen opens, Then I see both "Share to Instagram"
  and "Save to gallery".
- Given Instagram is not installed, When the share screen opens, Then the Instagram button is
  not shown at all.
- Given I tap Share to Instagram, When it succeeds, Then Instagram opens with my video loaded in
  the Reels composer.
- Given I cancel inside Instagram and come back, When I return to ThumpCut, Then my video is
  still there and I can share or save it again.
- Given the handoff throws, When it fails, Then I see "Couldn't open Instagram. You can save the
  reel and share it manually." and the save button is still available.
- Given I tap Save to gallery, When it succeeds, Then I see "Saved to your gallery."
- Given I tap Share to Instagram twice quickly, When the app responds, Then Instagram opens once.
- Given the exported file was deleted while I was in Instagram, When I return and tap share
  again, Then I see "That reel is no longer available. Please export again."

---

## 5. Edge cases

| Row | Handling |
|---|---|
| H — Instagram not installed | Button hidden entirely; not shown-and-disabled |
| H — Instagram installed but too old for `ADD_TO_REEL` | Catch the failure, show I1 |
| H — intent resolves but `startActivity` throws | Catch `ActivityNotFoundException`, show I1 |
| H — iOS `canOpenURL` false because the scheme is missing from Info.plist | Treat as not installed; this is a **build configuration bug**, assert it in a test |
| H — user cancels in Instagram and returns | File kept, both buttons still available |
| B — app killed while the user is in Instagram | On reopen, return to the share screen with the file if it still exists |
| B — rotation on the share screen | Layout reflows, file unaffected |
| D — exported file deleted while the user was away | Show I4, offer to export again |
| D — storage full when saving to gallery | Show I2 |
| C — gallery write permission denied (Android 9 and below) | Show I3 with a Settings link |
| G — double-tap the share button | Debounced, fires once |
| G — tap save and share at the same moment | Serialise; the second waits |
| I — screen reader | Both buttons clearly labelled; the "pick your track" note is announced |

---

## 6. Error catalogue

| # | Failure | Exact on-screen text | Recovery |
|---|---|---|---|
| I1 | Handoff failed | "Couldn't open Instagram. You can save the reel and share it manually." | Save button remains |
| I2 | Storage full on save | "Not enough storage to save. Free up some space and try again." | Retry |
| I3 | Gallery permission denied | "ThumpCut needs permission to save to your gallery." + "Open Settings" | Deep link |
| I4 | File no longer exists | "That reel is no longer available. Please export again." | Return to preview |

---

## 7. Invariants

| ID | Invariant |
|---|---|
| S1 | The Instagram button is shown **only** when `isAvailable()` returned true |
| S2 | The exported file is never deleted by ThumpCut until the user leaves the share screen |
| S3 | Only one handoff or save runs at a time |
| S4 | Android always uses a `FileProvider` URI, never `file://` |
| S5 | Returning from Instagram never destroys the file or the share screen |

---

## 8. The one thing deliberately not built

The competitor achieves perfect track and offset selection by embedding the real audio quietly
in the export, which Instagram's fingerprinting then recognises and replaces with its licensed
copy.

**ThumpCut does not do this in the MVP.** It is unlicensed synchronisation of a commercial
recording and it is the single largest legal exposure in the product. The MVP costs the user one
extra tap instead.

Do not implement it. If a future decision changes this, it gets its own spec and its own legal
review.

---

## 9. Tests and Definition of Done

**Tests**
```
✓ isAvailable() false hides the Instagram button entirely      (S1)
✓ ActivityNotFoundException is caught and shows I1
✓ double-tap share fires one intent                            (S3)
✓ Android URI is a content:// FileProvider URI                 (S4)
✓ iOS Info.plist contains instagram-reels in LSApplicationQueriesSchemes
✓ deleted file shows I4
✓ each error I1–I4 fires under its condition
```

**Device tests — both platforms**
```
✓ share opens Instagram with the video loaded
✓ cancelling in Instagram and returning keeps the file and both buttons
✓ uninstalling Instagram hides the button on next launch
```

**Definition of Done**
- [ ] Every transition implemented and tested
- [ ] Every error shows the exact text in §6
- [ ] Invariants S1–S5 asserted
- [ ] Works on a real Android device **and** a real iPhone
- [ ] `npm run typecheck` and `npm test` pass, output shown
- [ ] `quickstart.md` passes on both platforms

---

## 10. Regression contract

Must still pass after this phase — this is the last one, so the contract is the whole app:
- Phase 2: every cut engine test, unchanged.
- Phase 3: offline with cache shows no error.
- Phase 4: every selection limit, restoration behaviour, and error text.
- Phase 5: gallery has no spinner; preview starts within 500ms; previewed cut list equals
  exported cut list.
- Phase 6: every export passes the §2.1 validation; memory rules still enforced; 30 items with
  15 videos still exports without crashing.

Run the full regression before declaring the MVP complete.

---

## 11. Quickstart (manual test)

On a real Android phone, then repeat on an iPhone.

1. Export a reel. On the share screen, confirm you see both buttons.
2. Tap Share to Instagram. Confirm Instagram opens with your video loaded.
3. Pick a track in Instagram. Confirm the cuts land on the beat.
4. Back out of Instagram without posting. Return to ThumpCut. Confirm your video is still there
   and both buttons still work.
5. Tap Save to gallery. Confirm "Saved to your gallery" and that it is really there.
6. Uninstall Instagram. Export again. Confirm the Instagram button is **gone**, not greyed out.
7. Reinstall Instagram, export, tap share twice very fast. Confirm Instagram opens once.
