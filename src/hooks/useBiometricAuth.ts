// src/hooks/useBiometricAuth.ts
// Reusable hook for biometric login — the single surface UI should use.
//
//   const bio = useBiometricAuth();
//   bio.available     → hardware present + enrolled on this device
//   bio.enrolled      → this app has a biometric credential registered
//   bio.label         → "Face ID" | "Touch ID" | "fingerprint"
//   bio.enable()      → enrol the signed-in account (call from Settings)
//   bio.signIn()      → biometric sign-in (call from the login screen)
//   bio.disable()     → remove biometric from this device

import { useCallback, useEffect, useState } from "react";
import { useAuthStore } from "../stores/authStore";
import {
  isBiometricAvailable,
  type BiometryKind,
} from "../services/biometrics/biometricAuth";

export interface UseBiometricAuth {
  /** Still probing the hardware. */
  checking: boolean;
  /** Biometric hardware is present AND the user has enrolled a face/finger. */
  available: boolean;
  biometryType: BiometryKind;
  /** User-facing name, e.g. "Face ID". */
  label: string;
  /** This app has a device credential registered (button/toggle should show). */
  enrolled: boolean;
  /** Email the credential was enrolled for (for the login-screen hint). */
  enrolledEmail: string | null;
  enable: () => Promise<{ ok: boolean; error?: string }>;
  signIn: () => Promise<void>;
  disable: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useBiometricAuth(): UseBiometricAuth {
  const [checking, setChecking] = useState(true);
  const [available, setAvailable] = useState(false);
  const [biometryType, setBiometryType] = useState<BiometryKind>(null);
  const [label, setLabel] = useState("biometrics");

  const credentialId = useAuthStore((s) => s.biometricCredentialId);
  const enrolledEmail = useAuthStore((s) => s.biometricEnrolledEmail);
  const enable = useAuthStore((s) => s.enableBiometric);
  const signIn = useAuthStore((s) => s.signInWithBiometric);
  const disable = useAuthStore((s) => s.disableBiometric);

  const refresh = useCallback(async () => {
    setChecking(true);
    const a = await isBiometricAvailable();
    setAvailable(a.available);
    setBiometryType(a.biometryType);
    setLabel(a.label);
    setChecking(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    checking,
    available,
    biometryType,
    label,
    enrolled: !!credentialId,
    enrolledEmail,
    enable,
    signIn,
    disable,
    refresh,
  };
}
