// src/config/appCheckBridge.ts
//
// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  APPCHK-016X — EXPERIMENTAL SPIKE. REVERSIBLE. DEFAULT OFF.              ║
// ║                                                                          ║
// ║  Delete this file and the one initAppCheckBridge() call in firebase.ts   ║
// ║  to remove it completely. Nothing else references it.                    ║
// ╚══════════════════════════════════════════════════════════════════════════╝
//
// QUESTION THIS SPIKE ANSWERS
// ---------------------------
// Can the native attestation we already have supply App Check to the Firebase
// JS Auth SDK we already use — so that Firebase Authentication enforcement
// becomes possible WITHOUT migrating both apps off the JS Auth SDK?
//
// If yes, APPCHK-016 (a migration touching every login flow in both apps, and
// carrying a silent session-policy regression in Partner) is cancelled.
//
//   Play Integrity / App Attest
//     -> @react-native-firebase/app-check        (already wired, APPCHK-002..007)
//     -> native getToken() -> { token, expireTimeMillis }
//     -> firebase/app-check CustomProvider
//     -> initializeAppCheck(<the same JS app Auth uses>)
//     -> @firebase/auth RN build attaches X-Firebase-AppCheck
//     -> Firebase Authentication
//     -> App Check metrics classify the request as VERIFIED   <-- the real proof
//
// STATIC EVIDENCE ALREADY COLLECTED (see APPCHK-016-SCOPE.md §0)
// --------------------------------------------------------------
//   • firebase@10.14.1 -> @firebase/app-check@0.8.8 exports CustomProvider.
//   • JS AppCheckToken is { token: string; expireTimeMillis: number };
//     RNFirebase's AppCheckToken declares the identical shape. Direct hand-off,
//     no adaptation — which is why getToken below returns the native object
//     through unchanged rather than rebuilding it.
//   • firebase/app-check touches `document` only inside the reCAPTCHA provider
//     functions, never at module scope, so importing it under RN is safe.
//   • @firebase/auth@1.7.9 ships dist/rn/, which registers the
//     'app-check-internal' provider, implements AuthImpl._getAppCheckToken()
//     and sets headers["X-Firebase-AppCheck"] on Auth requests.
//
// WHAT THIS SPIKE DELIBERATELY DOES NOT DO
// ----------------------------------------
//   • It does not touch the GraphQL transport. That already sends
//     X-Firebase-AppCheck from the NATIVE module and stays exactly as it is —
//     both paths must originate from the same native attestation, and swapping
//     the transport to the JS SDK would widen the blast radius for no gain.
//   • It does not change email/password, Google, biometric custom-token,
//     Customer persistence, or Partner inMemoryPersistence.
//   • It does not enable Firebase Auth enforcement, and does not change
//     APP_CHECK_ENFORCED on the backend.
//
// LOGGING
// -------
// Never a token, ID token, email or uid. Only lifecycle events and a token
// LENGTH plus an expiry timestamp — enough to prove a real token arrived and
// that it rotates (X11), and useless to anyone reading a device log.

import { CustomProvider, initializeAppCheck } from "firebase/app-check";
import type { FirebaseApp } from "firebase/app";
import { getAppCheckToken, getNativeAppCheckToken } from "./appCheck";
import { devLog, devWarn } from "../utils/devLog";

/**
 * Opt-in. The spike is inert unless a build explicitly turns it on, so it
 * cannot reach a normal build — of either app — by accident.
 *
 *   EXPO_PUBLIC_APPCHK_016X=on
 *
 * Device test order is Customer Android, then Customer iOS, then Partner
 * Android, then Partner iOS. Partner is last because of the persistence risk
 * (X9): if a Partner process restart stops requiring a fresh login, STOP —
 * that is a session-policy regression, not an SDK quirk.
 */
export const APPCHK_016X_ENABLED =
  (process.env.EXPO_PUBLIC_APPCHK_016X ?? "").trim().toLowerCase() === "on";

let bridged = false;

/**
 * Bridge native App Check into the JS Firebase app.
 *
 * MUST be called with the same FirebaseApp instance Auth is built on, and
 * BEFORE the first Auth request — App Check has to be initialized before
 * Firebase services are accessed or early requests go out unattested.
 *
 * Never throws. A failure here must leave the app exactly as it is today:
 * unattested Auth requests, which is the current state anyway and is accepted
 * until enforcement is switched on.
 */
export function initAppCheckBridge(app: FirebaseApp): void {
  if (!APPCHK_016X_ENABLED || bridged) return;
  bridged = true;

  try {
    initializeAppCheck(app, {
      provider: new CustomProvider({
        // Invoked by the JS SDK whenever it needs a token — on init and again
        // as expiry approaches. It asks the NATIVE module every time rather
        // than holding one, which is what makes X11 (survival across token
        // rotation) work: the JS SDK caches, and when its cache lapses this
        // fetches a fresh native token.
        getToken: async () => {
          const native = await getNativeAppCheckToken();
          if (!native) {
            devWarn(
              "[APPCHK-016X] native token unavailable — JS CustomProvider cannot supply one",
            );
            throw new Error("APPCHK-016X: no native App Check token");
          }
          devLog(
            `[APPCHK-016X] JS CustomProvider invoked -> native token len=${native.token.length} expiry=${new Date(
              native.expireTimeMillis,
            ).toISOString()}`,
          );
          // Returned through UNCHANGED. The two AppCheckToken shapes are
          // identical; rebuilding the object would only invent a way to get
          // the expiry wrong.
          return native;
        },
      }),
      // The JS SDK refreshes ahead of expiry rather than waiting for a 401.
      // Required for X11 to mean anything.
      isTokenAutoRefreshEnabled: true,
    });

    devLog("[APPCHK-016X] JS App Check initialized on the Auth app instance");
  } catch (e) {
    devWarn("[APPCHK-016X] bridge initialization failed — Auth continues unattested", e);
  }
}

/**
 * Diagnostic for the device run. Call from a debug screen or a dev-only button
 * to confirm the native side works before judging the JS side — it separates
 * "attestation is broken" (X1) from "the bridge is broken" (X2/X3).
 */
export async function probeAppCheckBridge(): Promise<void> {
  const native = await getNativeAppCheckToken();
  if (!native) {
    devWarn("[APPCHK-016X] X1 FAIL — no native attestation token");
    return;
  }
  devLog(
    `[APPCHK-016X] X1 OK — native token len=${native.token.length} expiry=${new Date(
      native.expireTimeMillis,
    ).toISOString()}`,
  );
  const viaTransport = await getAppCheckToken();
  devLog(
    `[APPCHK-016X] GraphQL transport path unchanged: ${viaTransport ? "token present" : "no token"}`,
  );
}
