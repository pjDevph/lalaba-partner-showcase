// src/screens/verification/WasherVerificationScreen.tsx
// Washer Verification — the checklist a home washer completes to earn the
// Verified Washer badge. Wraps the shared body with washer copy, the teal
// accent, and the one profile-backed row (Personal Information).
//
// There is deliberately no "Service Address" row: updateWasherProfile strips
// barangay/city and never persists the address (see the note at
// src/services/graphql/washer.ts), so the row would deep-link to an editor
// that cannot save. Address verification is covered by the Proof of Address
// upload instead.

import React, { useCallback, useMemo } from "react";
import { View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { C } from "../../theme/tokens";
import { useAuthStore } from "../../stores/authStore";
import { useWasherStore } from "../../stores/washerStore";
import { fetchWasherProfile } from "../../services/graphql/washer";
import type { KycDocumentType } from "../../services/graphql/kyc";
import { WASHER_ACCENT } from "../../components/verification";
import { deriveProfileRowStatus } from "../../features/verification/status";
import { WASHER_GROUPS } from "../../features/verification/requirements";
import {
  VerificationScreenBody,
  type ProfileRequirement,
} from "./VerificationScreenBody";

export function WasherVerificationScreen() {
  const insets = useSafeAreaInsets();
  const profile = useWasherStore((s) => s.profile);
  const user = useAuthStore((s) => s.user);

  const profileRequirements = useMemo<ProfileRequirement[]>(() => {
    const status = deriveProfileRowStatus([
      { filled: !!(profile?.displayName ?? user?.displayName) },
      { filled: !!profile?.phone },
      { filled: !!user?.email },
    ]);
    return [
      {
        key: "personal-information",
        title: "Personal Information",
        description: "Your name and contact details",
        status,
        // Name/phone/email live on the account screen now — the profile screen
        // is business-only, and its `section` param is gone.
        onPress: () => router.push("/(washer)/account"),
      },
    ];
  }, [profile, user]);

  /**
   * Re-read the washer profile into the local stores.
   *
   * Swallows its own errors on purpose, for the same reason at both call sites
   * below: the profile is never the point of the operation that triggered it,
   * and a second failure on top of one already being reported (or on top of an
   * upload that actually succeeded) helps nobody.
   */
  const syncProfile = useCallback(async () => {
    try {
      const fresh = await fetchWasherProfile();
      useWasherStore.setState({ profile: fresh });
      if (fresh.photoUrl) {
        useAuthStore.getState().setPhotoUrl(fresh.photoUrl);
      }
    } catch {
      // Deliberately silent — see the docblock.
    }
  }, []);

  // The backend publishes a washer's selfie as her avatar AND her store logo
  // the moment it lands — no reviewer, matching the courier flow. Both live in
  // local stores, so without this the header keeps showing initials and My
  // Online Store keeps showing an empty logo until the next cold start.
  const onDocumentSubmitted = useCallback(
    async (documentType: KycDocumentType) => {
      if (documentType !== "SELFIE") return;
      await syncProfile();
    },
    [syncProfile],
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <VerificationScreenBody
        providerType="WASHER"
        title="Washer Verification"
        subtitle="Complete the requirements below to become a Verified Washer."
        successTitle="Washer Verified"
        successMessage="Your identity and service information have been verified by Lalaba."
        badgeLabel="Verified Washer"
        groups={WASHER_GROUPS}
        profileRequirements={profileRequirements}
        accent={WASHER_ACCENT}
        onBack={() => router.back()}
        onDocumentSubmitted={onDocumentSubmitted}
        onRefresh={syncProfile}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.gray50 },
});
