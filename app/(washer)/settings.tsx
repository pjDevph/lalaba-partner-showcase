// app/(washer)/settings.tsx
// Washer › Settings — the account & business hub (5th tab in the Home · Orders ·
// Chat · Wallet · Settings shell). Business identity plus links into the washer
// sub-screens: Storefront (services & pricing), Team (staff/couriers), and
// Account (personal profile). The marketplace profile is NOT listed here — it is
// edited from Home's "Edit profile", and duplicating the entry meant two rows
// opening one editor. Money moved to the Wallet tab; customer chats to the Chat
// tab. Reuses the shared authStore session for sign out.

import React, { useMemo } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { C, RADIUS, SP, SHADOW } from "../../src/theme/tokens";
import { useAuthStore } from "../../src/stores/authStore";
import { useDialogStore } from "../../src/stores/dialogStore";
import { useWasherStore } from "../../src/stores/washerStore";
import SelfieAvatar from "../../src/components/SelfieAvatar";
import PayAtHandoverCard from "../../src/components/PayAtHandoverCard";
import {
  VerificationCard,
  VerificationCardError,
  VerificationCardSkeleton,
  WASHER_ACCENT,
} from "../../src/components/verification";
import { useVerificationSummary } from "../../src/features/verification/useVerificationSummary";
import { deriveProfileRowStatus } from "../../src/features/verification/status";
import { WASHER_GROUPS } from "../../src/features/verification/requirements";
import {
  hasAddressConfigured,
  hasServicesConfigured,
} from "../../src/features/washer/readiness";

const TEAL_D    = C.washer700;
const TEAL_BG   = C.washer100;

type RowProps = Readonly<{
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  value?: string;
  danger?: boolean;
  onPress: () => void;
}>;

function Row({ icon, label, value, danger, onPress }: RowProps) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.rowIcon, danger && { backgroundColor: C.error100 }]}>
        <Ionicons name={icon} size={17} color={danger ? C.error700 : TEAL_D} />
      </View>
      <Text style={[styles.rowLabel, danger && { color: C.error700 }]}>{label}</Text>
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      {!danger && <Ionicons name="chevron-forward" size={16} color={C.gray300} />}
    </TouchableOpacity>
  );
}

export default function WasherSettings() {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const profile = useWasherStore((s) => s.profile);
  const loadWasher = useWasherStore((s) => s.loadWasher);
  const washerId = user?.uid ?? "";
  // A washer's shop settings live on her anchor Branch — the same record a
  // merchant branch uses, so the Pay Later card is shared verbatim.
  const branchId = profile?.branchId ?? null;

  // Store name only, matching what customers see (see dashboard.tsx) — her own
  // name is not a shop name.
  const businessName = profile?.storeName?.trim() || "Home Laundry";
  const location = [profile?.barangay, profile?.city].filter(Boolean).join(", ");

  // Both gate going online, so each row says whether it is done rather than
  // making the washer open them to find out.
  const servicesReady = hasServicesConfigured(profile);
  const addressReady = hasAddressConfigured(profile);

  // Mirrors the single profile-backed row on the verification screen, so the
  // card's percentage matches what the partner sees when they tap through.
  const profileStatuses = useMemo(
    () => [
      {
        key: "personal-information",
        status: deriveProfileRowStatus([
          { filled: !!(profile?.displayName ?? user?.displayName) },
          { filled: !!profile?.phone },
          { filled: !!user?.email },
        ]),
      },
    ],
    [profile, user],
  );

  const verification = useVerificationSummary({
    providerType: "WASHER",
    groups: WASHER_GROUPS,
    profileStatuses,
  });

  // Coming back from the verification screen should show the new progress, not
  // whatever was fetched when Settings first mounted.
  useFocusEffect(
    React.useCallback(() => {
      verification.reload();
      // reload is stable for a given provider; re-running on every render of
      // the summary object would loop.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [verification.reload]),
  );

  // Pull-to-refresh. Settings shows the verification card and two "Not set up
  // yet" rows, all of which go stale the moment something is completed on
  // another screen — and useFocusEffect only fires on navigation, not when the
  // washer simply expects a refresh.
  const [refreshing, setRefreshing] = React.useState(false);
  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      washerId ? loadWasher(washerId) : Promise.resolve(),
      Promise.resolve(verification.reload()),
    ]);
    setRefreshing(false);
  }, [washerId, loadWasher, verification]);

  const onSignOut = () => {
    useDialogStore.getState().show({
      title: "Sign out",
      message: "You'll need to sign in again to manage your laundry.",
      variant: "confirm",
      confirmLabel: "Sign out",
      destructive: true,
      onConfirm: () => { void signOut(); },
    });
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.scroll, { paddingTop: insets.top + SP._16 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.washer500} />
      }
    >
      {/* Identity */}
      <View style={styles.idCard}>
        {/* Her verification selfie, which the backend publishes as photoUrl the
            moment it lands — the same face customers see beside her name. Falls
            back to initials while it is still unsubmitted, or if it was
            rejected and taken down. */}
        <SelfieAvatar
          photoUrl={profile?.photoUrl ?? user?.photoUrl}
          displayName={businessName}
          style={styles.avatar}
          textStyle={styles.avatarText}
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.bizName} numberOfLines={1}>{businessName}</Text>
          <Text style={styles.bizSub}>{location ? `${location} · ` : ""}Home washer</Text>
        </View>
      </View>

      {/* Verification sits above everything else: it's the one thing in
          Settings with a deadline attached, and the badge affects how
          customers see this washer. The skeleton holds its place on a cold
          first load so the sections below don't shift when the status lands;
          after that the persisted cache paints it immediately. */}
      {verification.loading && <VerificationCardSkeleton accent={WASHER_ACCENT} />}
      {verification.error && (
        <VerificationCardError
          title="Washer Verification"
          accent={WASHER_ACCENT}
          onRetry={verification.reload}
        />
      )}
      {verification.status && (
        <VerificationCard
          title="Washer Verification"
          description="Verify your identity to earn the Verified Washer badge."
          status={verification.status}
          percent={verification.progress.percent}
          done={verification.progress.done}
          total={verification.progress.total}
          verified={verification.progress.verified}
          remaining={verification.progress.remaining}
          accent={WASHER_ACCENT}
          onPress={() => router.push("/(washer)/verification")}
        />
      )}

      {/* Business — one row per destination.
          "Business profile" was a single row covering both Services and
          Address & Location. They are split because BOTH must be set up before
          the store can go online, and one row could not say which of the two
          was missing. Each row now carries its own "Not set up yet" state. */}
      <Text style={styles.sectionTitle}>Business</Text>
      <View style={styles.group}>
        <Row
          icon="pricetags-outline"
          label="Services"
          value={servicesReady ? "What you offer · pricing" : "Not set up yet"}
          onPress={() => router.push("/(washer)/services")}
        />
        <View style={styles.divider} />
        <Row
          icon="location-outline"
          label="Address & Location"
          value={addressReady ? "Where you operate · radius" : "Not set up yet"}
          onPress={() => router.push("/(washer)/address")}
        />
        <View style={styles.divider} />
        {/* Separate from "Hours" on purpose: being OPEN and being willing to
            take BOOKINGS are different questions, and the capacity limits
            belong with the second one. */}
        <Row
          icon="calendar-outline"
          label="Booking availability"
          value="Schedule · capacity"
          onPress={() => router.push("/(washer)/booking-availability")}
        />
        <View style={styles.divider} />
        <Row
          icon="storefront-outline"
          label="My Online Store"
          value="Photos · description"
          onPress={() => router.push("/(washer)/store")}
        />
        <View style={styles.divider} />
        <Row
          icon="bar-chart-outline"
          label="Reports"
          value="Orders · money · ratings"
          onPress={() => router.push("/(washer)/reports")}
        />
      </View>

      {/* Payments — the shop's own money rules, kept next to the shop section
          rather than buried under Account: turning Pay Later on changes when
          this washer gets paid.

          The whole section is gated on branchId, not just the card: rendering
          the heading while the profile is still loading left an empty
          "PAYMENTS" label sitting above nothing. */}
      {branchId ? (
        <>
          <Text style={styles.sectionTitle}>Payments</Text>
          <View style={styles.group}>
            <PayAtHandoverCard branchId={branchId} accent={C.washer500} />
          </View>
        </>
      ) : null}

      {/* Team */}
      <Text style={styles.sectionTitle}>Team</Text>
      <View style={styles.group}>
        {/* Couriers only — a home washer has no shop floor, so there is no
            "staff" to invite. The backend rejects role=staff from a washer. */}
        <Row icon="bicycle-outline" label="Couriers" onPress={() => router.push("/(washer)/staff")} />
      </View>

      {/* Account */}
      <Text style={styles.sectionTitle}>Account</Text>
      <View style={styles.group}>
        <Row
          icon="person-outline"
          label="Account & security"
          onPress={() => router.push("/(washer)/account")}
        />
      </View>

      {/* System & support — the washer hub had none of these; the merchant hub
          has had them all along and the screens are already shared. */}
      <Text style={styles.sectionTitle}>System & support</Text>
      <View style={styles.group}>
        <Row
          icon="help-buoy-outline"
          label="Help & Support"
          onPress={() => router.push("/(washer)/help")}
        />
        <View style={styles.divider} />
        <Row
          icon="document-text-outline"
          label="Terms & Conditions"
          onPress={() => router.push("/(washer)/legal?kind=terms")}
        />
        <View style={styles.divider} />
        <Row
          icon="shield-checkmark-outline"
          label="Privacy Policy"
          onPress={() => router.push("/(washer)/legal?kind=privacy")}
        />
      </View>

      <View style={[styles.group, { marginTop: SP._16 }]}>
        <Row icon="log-out-outline" label="Sign out" danger onPress={onSignOut} />
      </View>

      <Text style={styles.version}>Lalaba Partner · Home washer</Text>
      <View style={{ height: SP._24 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.gray50 },
  scroll: { paddingHorizontal: SP._16, paddingBottom: SP._40 },

  idCard: { flexDirection: "row", alignItems: "center", gap: SP._12, backgroundColor: C.white, borderRadius: 16, ...SHADOW.sm, padding: SP._16, marginBottom: SP._20 },
  avatar: { width: 52, height: 52, borderRadius: RADIUS.full, backgroundColor: TEAL_BG, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 18, fontWeight: "800", color: TEAL_D },
  bizName: { fontSize: 18, fontWeight: "800", color: C.gray900 },
  bizSub: { fontSize: 12.5, color: C.gray500, marginTop: 2 },

  sectionTitle: { fontSize: 12, fontWeight: "700", color: C.gray400, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: SP._8, marginLeft: SP._4 },
  group: { backgroundColor: C.white, borderRadius: 16, ...SHADOW.sm, overflow: "hidden", marginBottom: SP._20 },
  divider: { height: 1, backgroundColor: C.gray100, marginLeft: 56 },
  row: { flexDirection: "row", alignItems: "center", gap: SP._12, padding: SP._14 },
  rowIcon: { width: 32, height: 32, borderRadius: RADIUS.md, backgroundColor: TEAL_BG, alignItems: "center", justifyContent: "center" },
  rowLabel: { flex: 1, fontSize: 15, fontWeight: "600", color: C.gray900 },
  rowValue: { fontSize: 13, color: C.gray500, marginRight: SP._4 },
  version: { fontSize: 12, color: C.gray400, textAlign: "center", marginTop: SP._8 },
});
