// src/components/BiometricToggle.tsx
// Reusable Settings row to enable/disable biometric login on this device.
// Drop into any settings screen:  <BiometricToggle />
//
// Enabling enrols the CURRENTLY signed-in account (generates a hardware keypair
// and registers its public key). Disabling deletes the local key and revokes
// the credential on the backend.

import React, { useState } from "react";
import {
  View,
  Text,
  Switch,
  ActivityIndicator,
  Platform,
  StyleSheet,
} from "react-native";
import { C } from "../theme/tokens";
import { showAlert } from "../lib/dialog";
import { useBiometricAuth } from "../hooks/useBiometricAuth";

export function BiometricToggle() {
  const bio = useBiometricAuth();
  const [busy, setBusy] = useState(false);

  // Capitalized label for headings ("Face ID", "Fingerprint").
  const nice = bio.label.charAt(0).toUpperCase() + bio.label.slice(1);
  // Platform-appropriate name for the "please set it up" hint (no biometric is
  // enrolled yet, so bio.label is generic at this point).
  const setupName = Platform.OS === "ios" ? "Face ID" : "fingerprint or face unlock";

  const onToggle = async (next: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      if (next) {
        const res = await bio.enable();
        if (!res.ok) {
          showAlert("Couldn't enable", res.error ?? "Please try again.");
        }
      } else {
        await bio.disable();
      }
    } finally {
      setBusy(false);
    }
  };

  if (bio.checking) {
    return (
      <View style={styles.row}>
        <ActivityIndicator size="small" color={C.brand500} />
      </View>
    );
  }

  // No biometric enrolled on the device — ask the user to set it up.
  if (!bio.available) {
    return (
      <View style={styles.row}>
        <View style={styles.textCol}>
          <Text style={styles.title}>Biometric login</Text>
          <Text style={styles.subtitle}>
            Set up {setupName} in your device settings to enable biometric login.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <View style={styles.textCol}>
        <Text style={styles.title}>Sign in with {nice}</Text>
        <Text style={styles.subtitle}>
          {bio.enrolled
            ? `Enabled${bio.enrolledEmail ? ` for ${bio.enrolledEmail}` : ""}. Unlock with ${bio.label} on this device.`
            : `Use ${bio.label} to sign in on this device instead of your password.`}
        </Text>
      </View>
      {busy ? (
        <ActivityIndicator size="small" color={C.brand500} style={styles.control} />
      ) : (
        <Switch
          value={bio.enrolled}
          onValueChange={onToggle}
          trackColor={{ false: C.gray300, true: C.brand300 }}
          thumbColor={bio.enrolled ? C.brand500 : C.gray100}
          ios_backgroundColor={C.gray300}
          style={styles.control}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 56,
    backgroundColor: C.white,
  },
  textCol: { flex: 1, paddingRight: 12 },
  title: { fontSize: 15, fontWeight: "600", color: C.gray900 },
  subtitle: { fontSize: 12.5, color: C.gray500, marginTop: 2, lineHeight: 17 },
  control: { marginLeft: 8 },
});
