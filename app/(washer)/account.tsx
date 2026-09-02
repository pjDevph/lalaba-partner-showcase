// app/(washer)/account.tsx
// Washer › Account & security — the personal half of Settings, split out of the
// business profile screen.
//
// Settings used to offer "Personal profile & settings", which landed on the
// business profile screen at a Security section containing one biometric
// toggle: no personal details, editable or otherwise. This screen is the honest
// version — who you're signed in as, and the security controls for this device.
//
// Name/phone/email are read-only for now: nothing in the washer stack can edit
// them yet (updateWasherProfile accepts displayName/phone, but there is no BE
// path for the Firebase email), so showing a disabled field would promise more
// than it delivers.

import React, { useState } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, RADIUS, SP, SHADOW } from "../../src/theme/tokens";
import { BackLink } from "../../src/components/BackLink";
import { BiometricToggle } from "../../src/components/BiometricToggle";
import { useAuthStore } from "../../src/stores/authStore";
import { useWasherStore } from "../../src/stores/washerStore";
import { auth } from "../../src/config/firebase";
import { ChangePasswordModal } from "../../src/screens/settings/ChangePasswordModal";

function DetailRow({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={1}>{value || "—"}</Text>
    </View>
  );
}

export default function WasherAccount() {
  const insets  = useSafeAreaInsets();
  const user    = useAuthStore((s) => s.user);
  const profile = useWasherStore((s) => s.profile);

  const [showChangePassword, setShowChangePassword] = useState(false);

  // Only email/password accounts can re-authenticate with a password. A
  // Google-only account has none to check, so offering "Change Password" there
  // would open a form it can never satisfy — the merchant Account screen makes
  // the same call for the same reason.
  const isPasswordAccount = (auth.currentUser?.providerData ?? []).some(
    (p) => p.providerId === "password",
  );

  const name  = profile?.displayName ?? user?.displayName ?? "Washer";
  const phone = profile?.phone ?? "";
  const email = user?.email ?? "";

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.scroll, { paddingTop: insets.top + SP._16 }]}
      showsVerticalScrollIndicator={false}
    >
      <BackLink label="Settings" fallback="/(washer)/settings" />

      <Text style={styles.pageTitle}>Account & security</Text>
      <Text style={styles.pageSub}>Your sign-in details and this device&apos;s security</Text>

      <Text style={styles.sectionTitle}>Personal details</Text>
      <View style={styles.card}>
        <DetailRow label="Name" value={name} />
        <View style={styles.divider} />
        <DetailRow label="Phone" value={phone} />
        <View style={styles.divider} />
        <DetailRow label="Email" value={email} />
      </View>

      <Text style={styles.sectionTitle}>Security</Text>
      <View style={[styles.card, styles.cardBare]}>
        <BiometricToggle />
        {isPasswordAccount && (
          <>
            <View style={styles.divider} />
            <TouchableOpacity
              style={styles.actionRow}
              onPress={() => setShowChangePassword(true)}
              activeOpacity={0.75}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.actionLabel}>Change Password</Text>
                <Text style={styles.actionHint}>
                  Update the password you use to sign in.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={C.gray300} />
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Shared with the merchant and staff Account screens, so the reauth +
          update flow lives in exactly one place. */}
      <ChangePasswordModal
        visible={showChangePassword}
        onClose={() => setShowChangePassword(false)}
      />

      <View style={{ height: SP._40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.gray50 },
  scroll: { maxWidth: 880, width: "100%", alignSelf: "center", paddingHorizontal: SP._16, paddingBottom: SP._40 },

  pageTitle: { fontSize: 20, fontWeight: "800", color: C.gray900 },
  pageSub:   { fontSize: 12.5, color: C.gray500, marginTop: 2, marginBottom: SP._20 },

  sectionTitle: { fontSize: 12, fontWeight: "700", color: C.gray400, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: SP._8, marginLeft: SP._4 },
  card:     { backgroundColor: C.white, borderRadius: RADIUS.lg, padding: SP._16, ...SHADOW.sm, marginBottom: SP._20 },
  cardBare: { padding: 0, overflow: "hidden" },
  divider:  { height: 1, backgroundColor: C.gray100 },

  actionRow:   { flexDirection: "row", alignItems: "center", gap: SP._12, padding: SP._16 },
  actionLabel: { fontSize: 14, fontWeight: "700", color: C.gray900 },
  actionHint:  { fontSize: 12, color: C.gray500, marginTop: 2 },
  detailRow:   { flexDirection: "row", alignItems: "center", gap: SP._12, paddingVertical: SP._12 },
  detailLabel: { fontSize: 13.5, color: C.gray500, width: 72 },
  detailValue: { flex: 1, fontSize: 14.5, fontWeight: "600", color: C.gray900, textAlign: "right" },
});
