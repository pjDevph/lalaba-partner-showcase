// src/screens/settings/VerificationScreen.tsx
// Merchant › Business Verification. Follows the settings hub's inline
// architecture (an *Inline component taking onBack, rendered by
// app/(tabs)/settings.tsx) rather than being its own route, so it works
// unchanged in the tablet master/detail split.
//
// Merchant verification is per-BRANCH: myKycStatus requires a providerId for
// MERCHANT_BRANCH, and a merchant with several branches verifies each
// separately. The hub picks the branch before this screen opens.

import React, { useMemo } from "react";
import { View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C } from "../../theme/tokens";
import type { Branch } from "../../stores/merchantStore";
import { MERCHANT_ACCENT } from "../../components/verification";
import { deriveProfileRowStatus } from "../../features/verification/status";
import { MERCHANT_GROUPS } from "../../features/verification/requirements";
import {
  VerificationScreenBody,
  type ProfileRequirement,
} from "../verification/VerificationScreenBody";

/**
 * The four self-attested business fields a reviewer cross-checks against the
 * DTI and BIR certificates. Kept here so the row's completeness and the edit
 * form agree on what "complete" means.
 */
export function businessInfoFields(branch: Branch | null) {
  return [
    { filled: !!branch?.name },
    { filled: !!branch?.businessType },
    { filled: !!branch?.dtiRegistrationNumber },
    { filled: !!branch?.tin },
  ];
}

export function VerificationScreenInline({
  branch,
  onBack,
  onEditBusinessInfo,
}: Readonly<{
  branch: Branch | null;
  onBack: () => void;
  onEditBusinessInfo: () => void;
}>) {
  const insets = useSafeAreaInsets();
  const profileRequirements = useMemo<ProfileRequirement[]>(
    () => [
      {
        key: "business-information",
        title: "Business Information",
        description: "Business name, type, DTI number and TIN",
        status: deriveProfileRowStatus(businessInfoFields(branch)),
        onPress: onEditBusinessInfo,
      },
    ],
    [branch, onEditBusinessInfo],
  );

  return (
    // Mirrors WasherVerificationScreen: VerificationHeader draws no inset of
    // its own, so without this the title collides with the status-bar clock.
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <VerificationScreenBody
        providerType="MERCHANT_BRANCH"
        providerId={branch?.id}
        title="Business Verification"
        subtitle={
          branch
            ? `Verify ${branch.name} to receive the Verified Merchant badge.`
            : "Verify your business to receive the Verified Merchant badge."
        }
        successTitle="Business Verified"
        successMessage="Your business information has been verified by Lalaba."
        badgeLabel="Verified Merchant"
        groups={MERCHANT_GROUPS}
        profileRequirements={profileRequirements}
        accent={MERCHANT_ACCENT}
        onBack={onBack}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.gray50 },
});
