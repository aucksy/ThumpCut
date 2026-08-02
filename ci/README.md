# `thumpcut-test.keystore`

The key every test build is signed with. **Never for the Play Store.**

## Why it is committed

Android will only install a new build over an old one when both are signed by the *same* key.
Sign with a different key and the phone refuses the update and demands an uninstall — which
loses everything the app had stored.

`expo prebuild` generates a debug keystore each time it runs. In practice it copies a fixed
file out of the Expo template, so today the key is identical on every build. That is a
coincidence of Expo's packaging, not a promise, and the day Expo refreshes that template every
tester is told to uninstall and start again.

So the key is pinned here instead, copied into place after every prebuild. It cannot drift.

## What it is not

This is a throwaway test key. Its password is `android` and its alias is `androiddebugkey` —
the same well-known values every React Native project on earth uses for debug builds. Nothing
is protected by it and nothing is leaked by committing it.

A real release to the Play Store uses Play App Signing with a key that is generated separately
and never committed anywhere.
