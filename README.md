# Lalaba — Partner App

The Expo/React Native app laundromats, home washers, and staff use — bookings, verification, and device-gated access. Public, redacted snapshot — see [Notes on this snapshot](#notes-on-this-snapshot).

Talks to the [Lalaba backend](https://github.com/pjDevph/lalaba-backend-showcase) over GraphQL — its sibling is the [Customer app](https://github.com/pjDevph/lalaba-customer-showcase).

## What's real here

**Device approval is server-enforced, not a local flag.** Each staff device registers against a specific branch and only works once an owner/admin approves it — see the backend's [`devices.service.ts`](https://github.com/pjDevph/lalaba-backend-showcase/blob/master/src/devices/devices.service.ts) for the actual gate. This app is the client side of that: registration, the approval-pending state, and the branch-scoped session it unlocks.

**Verification/KYC uses real camera hardware**, not a photo picker — `react-native-vision-camera` + face detection + `react-native-biometrics`, wired up for provider onboarding.

## Stack

Expo (React Native, `expo-router`) · Firebase Auth + App Check · `react-native-vision-camera` + face detection · `react-native-biometrics` · `react-native-qrcode-svg` for pickup/handoff flows · multi-environment EAS Build (development/preview/production profiles)

## Notes on this snapshot

Single squashed commit, not the real project history (264 commits). Internal-only content (`docs/release-evidence/`, `CLAUDE.md`) was removed before publishing. A real Firebase/GCP client API key was found in an old `google-services.json` commit during the history scan — that file isn't tracked at the current `HEAD`, so it was never part of this snapshot; also worth noting Firebase client keys in `google-services.json` are meant to be public by Google's own design (project identification, not an auth secret) and access is enforced by Firebase Security Rules, not by keeping the key hidden.

---

Part of the Lalaba platform · built by [Prince John Gandollas](https://github.com/pjDevph) with a small engineering team
