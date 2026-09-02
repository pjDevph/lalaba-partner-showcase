// src/components/verification/VerifiedBadge.tsx
// The Verified / Unverified badge. Was duplicated verbatim across the washer
// dashboard preview and the provider home card; extracted so the two can't
// drift and so new surfaces (branch list, chat header, order details) get the
// same thing for free.
//
// Callers pass a boolean rather than a status: the badge derives from
// `verifiedAt != null` everywhere in this codebase, never from
// verificationStatus. Keep that single derivation.

import React from "react";
import { View, Text } from "react-native";
import { ShieldCheck } from "lucide-react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { C } from "../../theme/tokens";

export function VerifiedBadge({
  verified,
  size = 18,
  showLabel = true,
  verifiedColor = C.success500,
  verifiedTextColor = C.success700,
  mutedColor = C.gray400,
}: Readonly<{
  verified: boolean;
  size?: number;
  /** Icon-only for tight spots like a chat header. */
  showLabel?: boolean;
  verifiedColor?: string;
  verifiedTextColor?: string;
  mutedColor?: string;
}>) {
  return (
    <View style={{ alignItems: "center", gap: 1 }}>
      {verified ? (
        <ShieldCheck size={size} color={verifiedColor} />
      ) : (
        <MaterialCommunityIcons name="shield-alert-outline" size={16} color={C.gray400} />
      )}
      {showLabel && (
        <Text
          style={{
            fontSize: 10,
            fontWeight: "700",
            color: verified ? verifiedTextColor : mutedColor,
          }}
        >
          {verified ? "Verified" : "Unverified"}
        </Text>
      )}
    </View>
  );
}
