// app/(courier)/profile.tsx
// Courier Profile — identity, branch assignment, delivery preferences,
// biometric sign-in and sign out. Reuses the shared authStore session
// (couriers sign in through the same merchant auth as every other role).
//
// Every row here is backed by real state. Rows that had no data behind them
// (Provider, Payout account, Registered device) were removed rather than left
// showing invented values — on a screen where everything else is real, a
// plausible placeholder gets believed.
//
// The profile photo IS the liveness selfie, so this screen owns the retake.
// It matters most in the case it was built for: an admin revoking the photo of
// a courier who is already signed in. The routing gate in app/_layout.tsx only
// runs at sign-in, so nothing bounces that rider back to the camera — they just
// start collecting "your profile photo was removed" rejections on every order
// call. Before the retake row existed, the only cure was to sign out and back
// in. Hence also the focus refetch below: the session's selfieStatus is a
// snapshot from sign-in and is exactly the field that goes stale here.

import React, { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl } from "react-native";
import { router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { C, RADIUS, SP, SHADOW } from "../../src/theme/tokens";
import SelfieAvatar from "../../src/components/SelfieAvatar";
import { useAuthStore } from "../../src/stores/authStore";
import { gqlMyCourierSelfie, type CourierSelfie } from "../../src/services/graphql/courierSelfie";
import { useDialogStore } from "../../src/stores/dialogStore";
import { useCourierPrefsStore, NAV_APP_LABEL, type NavApp } from "../../src/stores/courierPrefsStore";
import { BiometricToggle } from "../../src/components/BiometricToggle";
import { CourierHeader } from "../../src/components/CourierHeader";

const INDIGO_L = C.courier100;
const INDIGO_D = C.courier700;

type RowProps = Readonly<{
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  value?: string;
  danger?: boolean;
  onPress?: () => void;
}>;

function Row({ icon, label, value, danger, onPress }: RowProps) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={onPress ? 0.7 : 1} disabled={!onPress}>
      <View style={[styles.rowIcon, danger && { backgroundColor: C.error100 }]}>
        <Ionicons name={icon} size={17} color={danger ? C.error700 : INDIGO_D} />
      </View>
      <Text style={[styles.rowLabel, danger && { color: C.error700 }]}>{label}</Text>
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      {onPress && !danger ? <Ionicons name="chevron-forward" size={16} color={C.gray300} /> : null}
    </TouchableOpacity>
  );
}

const NAV_APPS: readonly NavApp[] = ["google", "waze", "apple"];

export default function CourierProfile() {
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const memberships = useAuthStore((s) => s.branchMemberships);
  const refreshMemberships = useAuthStore((s) => s.refreshMemberships);

  const navApp = useCourierPrefsStore((s) => s.navApp);
  const setNavApp = useCourierPrefsStore((s) => s.setNavApp);
  const [navOpen, setNavOpen] = useState(false);

  // Branch names come straight from the session — the same memberships that
  // decide which branches this courier may serve. No extra query.
  const branchNames = memberships
    .map((m) => m.branchName)
    .filter((n): n is string => !!n);
  const branchSummary =
    branchNames.length === 0
      ? "None assigned"
      : branchNames.length <= 2
        ? branchNames.join(", ")
        : `${branchNames.length} branches`;

  // No "Registered device" row: the device approval gate is a STAFF mechanism.
  // Couriers are their own role (`courier`), and every device query on the
  // backend is @Roles('merchant', 'staff') — so a courier can never read a
  // status here. The row this replaced reported "Not registered" for every
  // rider, which is exactly the plausible-but-invented value the rest of this
  // screen avoids.

  // ── Profile photo (the liveness selfie) ──────────────────────────────────
  // Re-read from the server rather than trusted from the session: `me` reports
  // selfieStatus once, at sign-in, and an admin can revoke hours later. Both
  // myCourierSelfie and submitCourierSelfie are @AllowUnverifiedCourier on the
  // backend, so this query — and the retake it leads to — still work while
  // every other courier call is being rejected by the gate.
  const [selfie, setSelfie] = useState<CourierSelfie | null>(null);
  const syncSelfie = useCallback(async () => {
    try {
      const current = await gqlMyCourierSelfie();
      setSelfie(current);
      useAuthStore
        .getState()
        .setSelfieState(
          current?.status === "ACTIVE" ? current.publicUrl : null,
          current?.status ?? null,
        );
    } catch {
      // Offline or a transient failure. Leave the session's copy alone — never
      // show a rider a revocation we cannot actually confirm.
    }
  }, []);

  // On focus, not on mount: this is a tab, so it stays mounted, and the rider
  // returning from the camera is the moment the photo is most likely to differ.
  useFocusEffect(
    useCallback(() => {
      void syncSelfie();
    }, [syncSelfie]),
  );

  // The retake exists to unstick a revoked courier, so it only appears when
  // they are actually stuck. A rider with a live photo has nothing to fix, and
  // an always-visible camera row would invite pointless recaptures — each one
  // supersedes the old row and deletes the old object for no reason.
  const photoRevoked = user?.selfieStatus === "REVOKED";

  const onRetakePhoto = useCallback(() => {
    router.push({ pathname: "/courier-selfie", params: { mode: "retake" } });
  }, []);

  // Pull-to-refresh: branch assignment is changed by the owner elsewhere, so
  // this screen can go stale while it sits open.
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    if (!user?.uid) return;
    setRefreshing(true);
    try {
      await Promise.all([refreshMemberships(user.uid), syncSelfie()]);
    } finally {
      setRefreshing(false);
    }
  }, [refreshMemberships, syncSelfie, user?.uid]);

  const onSignOut = () => {
    useDialogStore.getState().show({
      title: "Sign out",
      message: "You'll need to sign in again to receive tasks.",
      variant: "confirm",
      confirmLabel: "Sign out",
      destructive: true,
      onConfirm: () => { void signOut(); },
    });
  };

  return (
    <View style={styles.root}>
      {/* Pinned title, matching the other tabs; the identity card scrolls under it. */}
      <CourierHeader title="Profile" subtitle="Your account and preferences" />

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={INDIGO_D} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Identity */}
        <View style={styles.idCard}>
          <SelfieAvatar
            photoUrl={user?.photoUrl}
            displayName={user?.displayName}
            style={styles.avatar}
            textStyle={styles.avatarText}
          />
          <Text style={styles.name}>{user?.displayName ?? "Courier"}</Text>
          <View style={styles.roleChip}>
            <Ionicons name="bicycle" size={13} color={INDIGO_D} />
            <Text style={styles.roleChipText}>Delivery staff</Text>
          </View>
          <Text style={styles.email}>{user?.email ?? ""}</Text>
        </View>

        {/* Profile photo — revoked only. Loud, because it is the explanation
            for everything else failing: a revoked photo re-locks the courier
            server-side, so their task board is rejecting every call until they
            retake. */}
        {photoRevoked ? (
          <>
            <Text style={styles.sectionTitle}>Profile photo</Text>
            <View style={styles.alert}>
              <Ionicons name="alert-circle" size={18} color={C.error700} />
              <View style={styles.alertBody}>
                <Text style={styles.alertTitle}>Your photo was removed</Text>
                <Text style={styles.alertText}>
                  {selfie?.revocationReason
                    ? `An administrator removed it: ${selfie.revocationReason}. Take a new selfie to keep receiving tasks.`
                    : "An administrator removed it. Take a new selfie to keep receiving tasks."}
                </Text>
              </View>
            </View>
            <View style={styles.group}>
              <Row
                icon="camera-outline"
                label="Take a new photo"
                value="Required"
                onPress={onRetakePhoto}
              />
            </View>
          </>
        ) : null}

        {/* Assignment */}
        <Text style={styles.sectionTitle}>Assignment</Text>
        <View style={styles.group}>
          <Row icon="git-branch-outline" label="Serving branches" value={branchSummary} />
        </View>

        {/* Delivery preferences */}
        <Text style={styles.sectionTitle}>Delivery</Text>
        <View style={styles.group}>
          <Row
            icon="navigate-outline"
            label="Preferred navigation"
            value={NAV_APP_LABEL[navApp]}
            onPress={() => setNavOpen((v) => !v)}
          />
          {/* Inline radio list rather than a modal: dialogStore only does
              info/confirm, and three options don't warrant a new sheet. */}
          {navOpen
            ? NAV_APPS.map((app) => (
                <React.Fragment key={app}>
                  <View style={styles.divider} />
                  <TouchableOpacity
                    style={styles.optionRow}
                    onPress={() => { setNavApp(app); setNavOpen(false); }}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={app === navApp ? "radio-button-on" : "radio-button-off"}
                      size={18}
                      color={app === navApp ? INDIGO_D : C.gray300}
                    />
                    <Text style={[styles.optionLabel, app === navApp && styles.optionLabelActive]}>
                      {NAV_APP_LABEL[app]}
                    </Text>
                  </TouchableOpacity>
                </React.Fragment>
              ))
            : null}
        </View>

        {/* Support */}
        <Text style={styles.sectionTitle}>Support</Text>
        <View style={styles.group}>
          <Row
            icon="help-buoy-outline"
            label="Help and support"
            onPress={() => router.push("/(courier)/help")}
          />
          <View style={styles.divider} />
          <Row
            icon="document-text-outline"
            label="Terms of service"
            onPress={() => router.push({ pathname: "/(courier)/legal", params: { kind: "terms" } })}
          />
          <View style={styles.divider} />
          <Row
            icon="shield-checkmark-outline"
            label="Privacy policy"
            onPress={() => router.push({ pathname: "/(courier)/legal", params: { kind: "privacy" } })}
          />
        </View>

        {/* Security — enrolling here is what surfaces the biometric button on
            the login screen; that button is role-agnostic, so nothing else is
            needed for a courier to sign in with it. */}
        <Text style={styles.sectionTitle}>Security</Text>
        <View style={styles.group}>
          <BiometricToggle />
        </View>

        {/* Sign out */}
        <View style={[styles.group, { marginTop: SP._16 }]}>
          <Row icon="log-out-outline" label="Sign out" danger onPress={onSignOut} />
        </View>

        <Text style={styles.version}>Lalaba Partner · Courier</Text>
        <View style={{ height: SP._24 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.gray50 },
  scroll: {
    maxWidth: 880,
    width: "100%",
    alignSelf: "center",
    paddingHorizontal: SP._16,
    // Matches the dashboard. Without it the first card butts
    // straight against the header's bottom border.
    paddingTop: SP._16,
    paddingBottom: SP._40,
  },

  idCard: { backgroundColor: C.white, borderRadius: RADIUS.lg, ...SHADOW.sm, alignItems: "center", padding: SP._24, marginBottom: SP._20 },
  avatar: { width: 72, height: 72, borderRadius: RADIUS.full, backgroundColor: INDIGO_L, alignItems: "center", justifyContent: "center", marginBottom: SP._12 },
  avatarText: { fontSize: 24, fontWeight: "800", color: INDIGO_D },
  name:   { fontSize: 20, fontWeight: "800", color: C.gray900 },
  roleChip: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: INDIGO_L, borderRadius: RADIUS.full, paddingHorizontal: SP._10, paddingVertical: 4, marginTop: SP._8 },
  roleChipText: { fontSize: 12, fontWeight: "700", color: INDIGO_D },
  email:  { fontSize: 13, color: C.gray500, marginTop: SP._8 },

  sectionTitle: { fontSize: 12, fontWeight: "700", color: C.gray400, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: SP._8, marginLeft: SP._4 },
  alert:  { flexDirection: "row", gap: SP._10, backgroundColor: C.error100, borderRadius: RADIUS.lg, padding: SP._12, marginBottom: SP._8 },
  alertBody:  { flex: 1, gap: 2 },
  alertTitle: { fontSize: 14, fontWeight: "700", color: C.error700 },
  alertText:  { fontSize: 13, color: C.error700, lineHeight: 18 },
  group:  { backgroundColor: C.white, borderRadius: RADIUS.lg, ...SHADOW.sm, overflow: "hidden", marginBottom: SP._20 },
  divider:{ height: 1, backgroundColor: C.gray100, marginLeft: 56 },

  row:    { flexDirection: "row", alignItems: "center", gap: SP._12, padding: SP._14 },
  rowIcon:{ width: 32, height: 32, borderRadius: RADIUS.md, backgroundColor: INDIGO_L, alignItems: "center", justifyContent: "center" },
  rowLabel:{ flex: 1, fontSize: 15, fontWeight: "600", color: C.gray900 },
  rowValue:{ fontSize: 13, color: C.gray500, marginRight: SP._4 },

  optionRow:   { flexDirection: "row", alignItems: "center", gap: SP._12, paddingVertical: SP._12, paddingHorizontal: SP._14, paddingLeft: 56 },
  optionLabel: { fontSize: 14, color: C.gray600 },
  optionLabelActive: { color: C.gray900, fontWeight: "600" },

  version:{ fontSize: 12, color: C.gray400, textAlign: "center", marginTop: SP._8 },
});
