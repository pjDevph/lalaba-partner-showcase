// src/config/appCheck.ts
// APPCHK-002..008 — Firebase App Check attestation for this install.
//
// Answers a different question from the Firebase ID token the GraphQL client
// already sends:
//
//   ID token   -> WHO is the user?
//   App Check  -> is this a genuine build of our app on a genuine device?
//
// The backend verifies both separately (see AppCheckGuard). Neither replaces
// the other: a stolen ID token replayed from a script has the first and not
// the second, which is exactly the abuse the original finding was about.
//
// ── Provider choice ────────────────────────────────────────────────────────
//   Android production  Play Integrity
//   Apple production    App Attest
//   dev / emulator / CI debug provider, and ONLY there
//
// The debug provider mints tokens for a device you register by hand in the
// Firebase console. Shipping a production build that selects it would make
// attestation meaningless while every dashboard reported success — so the
// selection below keys off `__DEV__`, a compile-time constant, rather than a
// runtime flag someone can flip. `configureProviderDebugMode(true)` is
// therefore not reachable from a release bundle at all (APPCHK-009).
//
// ── Debug tokens are secrets (APPCHK-007) ──────────────────────────────────
// A debug token grants attestation to whoever holds it. Never commit one and
// never log one: the RN Firebase SDK prints it to the native console on first
// run, which is where you copy it from into the Firebase console. It is not
// read from any env var here on purpose — there is nothing for a build to
// accidentally bake in.

// LAZY, and deliberately not a static import.
//
// `@react-native-firebase/app-check` throws "Native module RNFBAppModule not
// found" the moment it is loaded on a binary that was built without the
// module. A static import here would take that crash at BUNDLE LOAD — and this
// module is reached from config/firebase.ts -> authStore -> every screen, so
// the app dies on launch rather than degrading.
//
// That is not hypothetical: the plugin was added to app.config.ts, which only
// takes effect on the next `expo prebuild`. Any existing dev build, and any
// Metro session pointed at one, has the JS but not the native side.
//
// Resolved inside try/catch instead, so a binary without App Check simply gets
// no attestation — which the backend already tolerates in monitoring mode.
type AppCheckModule = typeof import("@react-native-firebase/app-check");

function loadAppCheck(): AppCheckModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("@react-native-firebase/app-check") as AppCheckModule;
  } catch {
    return null;
  }
}

import { Platform } from "react-native";
import { devLog, devWarn } from "../utils/devLog";

const isDev = typeof __DEV__ !== "undefined" && __DEV__;

let initialized = false;

/**
 * Initialize App Check. Call BEFORE anything touches Auth or the GraphQL
 * client (APPCHK-003) — a token requested before initialization resolves to
 * nothing, and the first request of a cold start is exactly the one that
 * matters.
 *
 * Never throws. A device that cannot attest (rooted, ancient Play Services,
 * no network) must still reach the login screen and see a real error from the
 * backend, rather than a white screen from a crash in bootstrap.
 */
export function initAppCheck(): void {
  if (initialized) return;
  initialized = true;

  const mod = loadAppCheck();
  if (!mod) {
    devWarn(
      "[appCheck] native module unavailable in this binary — continuing without attestation. " +
        "Run `expo prebuild` to link @react-native-firebase/app-check.",
    );
    return;
  }

  try {
    const provider = mod.default().newReactNativeFirebaseAppCheckProvider();

    provider.configure({
      android: {
        provider: isDev ? "debug" : "playIntegrity",
        debugToken: undefined,
      },
      apple: {
        provider: isDev ? "debug" : "appAttest",
        debugToken: undefined,
      },
    });

    mod.firebase.appCheck().initializeAppCheck({
      provider,
      // Keep a fresh token in hand rather than fetching one per request. The
      // SDK refreshes in the background well before expiry, which is why
      // `getAppCheckToken()` below must ask the SDK every time instead of
      // caching a token itself.
      isTokenAutoRefreshEnabled: true,
    });

    devLog(
      `[appCheck] initialized — ${Platform.OS} provider: ${
        isDev ? "debug" : Platform.OS === "android" ? "playIntegrity" : "appAttest"
      }`,
    );
  } catch (e) {
    // Deliberately non-fatal. While APP_CHECK_ENFORCED is off the backend
    // treats a missing token as "monitor and allow", so a device that cannot
    // attest degrades to today's behaviour instead of being bricked.
    devWarn("[appCheck] initialization failed — continuing without attestation", e);
  }
}

/**
 * Current App Check token, or `null` when unavailable.
 *
 * Always asks the SDK rather than holding a token: App Check tokens expire and
 * the SDK rotates them in the background, so a cached copy would start failing
 * verification an hour in with no obvious cause.
 *
 * Returns null instead of throwing so the transport can decide. Under
 * monitoring mode a null simply means an unattested request; under enforcement
 * the backend rejects it with APP_CHECK_REQUIRED and the app shows that
 * message — which is more useful than a network error thrown from here.
 */
export async function getAppCheckToken(): Promise<string | null> {
  const mod = loadAppCheck();
  if (!initialized || !mod) return null;
  try {
    const { token } = await mod.firebase.appCheck().getToken(false);
    return token || null;
  } catch (e) {
    devWarn("[appCheck] token unavailable for this request", e);
    return null;
  }
}

/**
 * APPCHK-016X — native token plus an expiry the JS SDK can schedule against.
 *
 * CORRECTION to the static analysis in APPCHK-016-SCOPE.md §0: the two SDKs do
 * NOT hand over a matching object. RNFirebase declares `AppCheckToken` as
 * `{ token, expireTimeMillis }`, but that is the PROVIDER-side type — what a
 * CustomProvider returns *to* the SDK. What the module's `getToken()` actually
 * returns to us is `AppCheckTokenResult`, which is `{ token }` and nothing
 * else. The native side never surfaces the expiry.
 *
 * The expiry is recoverable anyway: App Check tokens are JWTs, and a JWT
 * carries its own `exp`. We decode the payload WITHOUT verifying the
 * signature, which is correct here — we are not deciding whether to trust the
 * token (Firebase's servers do that), only when the JS SDK should ask for the
 * next one. Reading a claim for scheduling is not a trust decision.
 *
 * If decoding fails, fall back to a deliberately SHORT window. Being early is
 * harmless — the SDK just re-asks and we hand back the native token again.
 * Being late means Auth requests go out with an expired token, which is the
 * failure X11 exists to catch.
 *
 * Used only by appCheckBridge.ts. Delete alongside it if the spike is dropped.
 */
const FALLBACK_TTL_MS = 5 * 60 * 1000;

/** base64url -> utf8. Hand-rolled: atob is not guaranteed across RN engines. */
function decodeBase64Url(input: string): string {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  let out = "";
  let buffer = 0;
  let bits = 0;
  for (const ch of normalized) {
    const idx = alphabet.indexOf(ch);
    if (idx === -1) continue; // padding or stray character
    buffer = (buffer << 6) | idx;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  return out;
}

/** The `exp` claim in ms, or null when the token is not a decodable JWT. */
function readJwtExpiryMs(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const claims = JSON.parse(decodeBase64Url(payload)) as { exp?: number };
    // `exp` is in SECONDS since epoch, unlike everything else here.
    return typeof claims.exp === "number" ? claims.exp * 1000 : null;
  } catch {
    return null;
  }
}

export async function getNativeAppCheckToken(): Promise<{
  token: string;
  expireTimeMillis: number;
} | null> {
  const mod = loadAppCheck();
  if (!initialized || !mod) return null;
  try {
    const result = await mod.firebase.appCheck().getToken(false);
    if (!result?.token) return null;
    const expiry = readJwtExpiryMs(result.token);
    if (expiry === null) {
      devWarn(
        "[appCheck] could not read App Check token expiry — using a short fallback window",
      );
    }
    return {
      token: result.token,
      expireTimeMillis: expiry ?? Date.now() + FALLBACK_TTL_MS,
    };
  } catch (e) {
    devWarn("[appCheck] native token unavailable (016X probe)", e);
    return null;
  }
}
