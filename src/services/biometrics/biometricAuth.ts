// src/services/biometrics/biometricAuth.ts
// ─────────────────────────────────────────────────────────────────────────────
// REUSABLE BIOMETRIC MODULE  (Face ID / Touch ID / Android fingerprint & face)
//
// Wraps `react-native-biometrics` behind a small, platform-agnostic surface so
// the rest of the app never touches the native lib directly. This is the
// WebAuthn/passkey-style building block for device-bound biometric login:
//
//   • A keypair is generated in secure hardware (iOS Secure Enclave / Android
//     Keystore/StrongBox). The PRIVATE key is gated by biometrics and NEVER
//     leaves the device — not to us, not to the backend, not to the database.
//   • Only the PUBLIC key is exported (registered on the backend at enrolment).
//   • Login = signing a one-time server challenge with the biometric-unlocked
//     private key. No secret and no biometric data is ever transmitted.
//
// The native module is lazy-imported (like the Google sign-in flow) so a stale
// binary / Expo Go without the native side linked degrades gracefully to
// `available: false` instead of crashing at bundle load.
// ─────────────────────────────────────────────────────────────────────────────

import { NativeModules, Platform } from "react-native";
import { errField } from "../../utils/userError";

export type BiometryKind = "FaceID" | "TouchID" | "Biometrics" | null;

export interface BiometricAvailability {
  /** Hardware present AND the user has enrolled at least one biometric. */
  available: boolean;
  biometryType: BiometryKind;
  /** User-facing name, e.g. "Face ID", "Touch ID", "fingerprint". */
  label: string;
}

export interface SignResult {
  signature: string;
}

// Minimal shape of the native module — kept local so callers never import the
// lib's types directly.
interface RNBiometricsInstance {
  isSensorAvailable(): Promise<{
    available: boolean;
    biometryType?: "TouchID" | "FaceID" | "Biometrics";
    error?: string;
  }>;
  biometricKeysExist(): Promise<{ keysExist: boolean }>;
  createKeys(): Promise<{ publicKey: string }>;
  deleteKeys(): Promise<{ keysDeleted: boolean }>;
  createSignature(opts: {
    promptMessage: string;
    payload: string;
    cancelButtonText?: string;
  }): Promise<{ success: boolean; signature?: string; error?: string }>;
}

// ── Diagnostics (dev) ────────────────────────────────────────────────────────
// Distinguish "native module not linked" (needs a rebuild) from "linked but no
// biometric enrolled / other reason" (needs OS setup). Surfaced in the toggle.
let _lastError: string | null = null;

/** True if the native side is actually compiled into this binary. */
export function isNativeModuleLinked(): boolean {
  const nm = NativeModules as Record<string, unknown>;
  return !!nm.ReactNativeBiometrics || !!nm.RNBiometrics;
}

/** Last error captured while probing/using the native module (dev diagnostics). */
export function getLastBiometricError(): string | null {
  return _lastError;
}

let _instance: RNBiometricsInstance | null = null;
// Resolve the native module exactly once per JS session. If it isn't linked
// (package added but the app binary not rebuilt), the class constructs but its
// methods hit a null native module — so we PROBE once, cache the result, and
// stay silent afterwards instead of warning on every call. A full native
// rebuild restarts JS, which re-runs this probe.
let _resolved = false;

async function getInstance(): Promise<RNBiometricsInstance | null> {
  if (_resolved) return _instance;
  _resolved = true;
  try {
    const mod = await import("react-native-biometrics");
    const RNBiometrics = (mod as any).default ?? mod;
    if (typeof RNBiometrics !== "function") return null;
    // allowDeviceCredentials: false → biometric ONLY (no device PIN/pattern
    // fallback), so the key stays bound to a real Face ID / fingerprint match.
    const inst: RNBiometricsInstance = new RNBiometrics({
      allowDeviceCredentials: false,
    });
    // Probe: throws if the native side isn't linked into this binary.
    const probe = await inst.isSensorAvailable();
    if (__DEV__) {
      console.log(
        `[biometricAuth] probe → available=${probe.available} ` +
          `type=${probe.biometryType ?? "null"} error=${probe.error ?? "none"} ` +
          `linked=${isNativeModuleLinked()}`
      );
    }
    if (probe.error) _lastError = probe.error;
    _instance = inst;
  } catch (err: unknown) {
    _lastError = errField(err, "message") ?? String(err);
    if (__DEV__) {
      console.warn(
        "[biometricAuth] native module probe failed — " +
          (isNativeModuleLinked()
            ? "module IS linked; check OS biometric enrolment."
            : "module NOT linked; rebuild the app (expo prebuild + run:ios / run:android)."),
        _lastError
      );
    }
    _instance = null;
  }
  return _instance;
}

/** Human label for the platform's biometric, for buttons/toggles. */
export function labelForBiometry(kind: BiometryKind): string {
  switch (kind) {
    case "FaceID":
      return "Face ID";
    case "TouchID":
      return "Touch ID";
    case "Biometrics":
      return Platform.OS === "android" ? "fingerprint" : "biometrics";
    default:
      return "biometrics";
  }
}

/** Is biometric hardware present and enrolled on this device? */
export async function isBiometricAvailable(): Promise<BiometricAvailability> {
  const unavailable: BiometricAvailability = {
    available: false,
    biometryType: null,
    label: "biometrics",
  };
  const inst = await getInstance();
  if (!inst) return unavailable;
  try {
    const { available, biometryType } = await inst.isSensorAvailable();
    const kind = (biometryType ?? null) as BiometryKind;
    return { available, biometryType: kind, label: labelForBiometry(kind) };
  } catch (err) {
    if (__DEV__) console.warn("[biometricAuth] isSensorAvailable failed:", err);
    return unavailable;
  }
}

/** Whether a biometric keypair already exists in secure hardware. */
export async function hasStoredKey(): Promise<boolean> {
  const inst = await getInstance();
  if (!inst) return false;
  try {
    const { keysExist } = await inst.biometricKeysExist();
    return keysExist;
  } catch {
    return false;
  }
}

/**
 * Generate a fresh biometric keypair and return the base64 PUBLIC key to send
 * to the backend. Any previous key is deleted first so enrolment always starts
 * from a clean, single keypair (e.g. re-enrolling after biometrics changed).
 */
export async function createKeypair(): Promise<string> {
  const inst = await getInstance();
  if (!inst) throw new Error("Biometric hardware is not available on this device.");
  // deleteKeys is a no-op if none exist; guarantees a single active keypair.
  await inst.deleteKeys().catch(() => {});
  const { publicKey } = await inst.createKeys();
  if (!publicKey) throw new Error("Failed to create a biometric key.");
  return publicKey;
}

/** Remove the biometric keypair from secure hardware (disable on this device). */
export async function deleteKeypair(): Promise<void> {
  const inst = await getInstance();
  if (!inst) return;
  await inst.deleteKeys().catch(() => {});
}

/**
 * Prompt for Face ID / fingerprint and sign `challenge` with the private key.
 * Returns null if the user cancels or the prompt fails (caller shows password
 * fallback); throws only on unexpected hardware errors.
 */
export async function signChallenge(
  challenge: string,
  promptMessage: string
): Promise<SignResult | null> {
  const inst = await getInstance();
  if (!inst) throw new Error("Biometric hardware is not available on this device.");
  const { success, signature } = await inst.createSignature({
    promptMessage,
    payload: challenge,
    cancelButtonText: "Use password",
  });
  if (!success || !signature) return null; // user cancelled / failed match
  return { signature };
}
