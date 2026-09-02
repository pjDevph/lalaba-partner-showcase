// app/(staff)/profile.tsx
// Staff "More" — everything outside the three things a shift actually does
// (sell, manage orders, talk to customers).
//
// It replaced both a Profile screen AND a hamburger drawer that listed the same
// destinations, so staff had two menus with no rule about which held what.
//
// The WORK section is permission-gated per branch. Rows are HIDDEN rather than
// shown-and-locked: a padlocked list teaches someone to keep tapping things
// that never work, and this list is short enough that absence reads as "not my
// job" rather than "broken". The gate is a courtesy — every one of these
// screens is enforced server-side too.
// Original header: identity + a Settings-style list: Activity, Inventory, and Sign
// Out. This is the staff "home" for everything that isn't the POS terminal.
// (Tasks deferred to phase 2 — see (staff)/_layout.tsx)

import React, { useCallback, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useAuthStore } from "../../src/stores/authStore";
import { showConfirm } from "../../src/lib/dialog";
import { auth } from "../../src/config/firebase";
import { C, RADIUS, SP } from "../../src/theme/tokens";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { BiometricToggle } from "../../src/components/BiometricToggle";
import { ChangePasswordModal } from "../../src/screens/settings/ChangePasswordModal";
import { useNotificationFeedStore, NOTIFICATION_POLL_MS } from "../../src/stores/notificationFeedStore";
import { usePoll } from "../../src/hooks/usePoll";
import { useEffectivePermissions } from "../../src/hooks/usePermission";
import {
  STAFF_DESTINATIONS,
  grantedWorkDestinations,
  type StaffDestination,
} from "../../src/features/staff/staffNav";

function IconActivity({ c = C.brand500 }: Readonly<{ c?: string }>) {
  return <Ionicons name="document-text-outline" size={20} color={c} />;
}
function IconBell({ c = C.brand500 }: Readonly<{ c?: string }>) {
  return <Ionicons name="notifications-outline" size={20} color={c} />;
}
function IconServices({ c = C.brand500 }: Readonly<{ c?: string }>) {
  return <Ionicons name="pricetag-outline" size={20} color={c} />;
}
function IconProducts({ c = C.brand500 }: Readonly<{ c?: string }>) {
  return <Ionicons name="pricetags-outline" size={20} color={c} />;
}
function IconReports({ c = C.brand500 }: Readonly<{ c?: string }>) {
  return <Ionicons name="bar-chart-outline" size={20} color={c} />;
}
function IconInventory({ c = C.brand500 }: Readonly<{ c?: string }>) {
  return <MaterialCommunityIcons name="cube-outline" size={20} color={c} />;
}
function IconShield({ c = C.brand500 }: Readonly<{ c?: string }>) {
  return <Ionicons name="shield-outline" size={20} color={c} />;
}
function IconLock({ c = C.brand500 }: Readonly<{ c?: string }>) {
  return <Ionicons name="lock-closed-outline" size={20} color={c} />;
}
function IconFileText({ c = C.brand500 }: Readonly<{ c?: string }>) {
  return <Ionicons name="document-text-outline" size={20} color={c} />;
}
function IconHelp({ c = C.brand500 }: Readonly<{ c?: string }>) {
  return <MaterialCommunityIcons name="lifebuoy" size={20} color={c} />;
}
// Phase 2: Tasks feature deferred, icon unused for now.
// function IconTasks({ c = C.brand500 }: Readonly<{ c?: string }>) {
//   return (
//     <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
//       <Path d="M9 11l3 3 5-5" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
//       <Rect x="3" y="3" width="18" height="18" rx="3" stroke={c} strokeWidth="1.8" />
//     </Svg>
//   );
// }
function IconChevron() {
  return <Ionicons name="chevron-forward" size={16} color={C.gray400} />;
}

function Row({
  icon, label, subtitle, badge, onPress, first,
}: Readonly<{ icon: React.ReactNode; label: string; subtitle?: string; badge?: number; onPress: () => void; first?: boolean }>) {
  return (
    <TouchableOpacity style={[s.menuRow, !first && s.rowBorder]} onPress={onPress} activeOpacity={0.7}>
      <View style={s.rowIcon}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={s.menuLabel}>{label}</Text>
        {!!subtitle && <Text style={s.menuSub}>{subtitle}</Text>}
      </View>
      {!!badge && badge > 0 && <View style={s.badge}><Text style={s.badgeText}>{badge}</Text></View>}
      <IconChevron />
    </TouchableOpacity>
  );
}

// Icons live here rather than in staffNav: that module is the authorization
// definition and is imported by route guards, which have no business pulling in
// a rendering dependency.
const WORK_ICONS: Partial<Record<StaffDestination, React.ReactElement>> = {
  inventory: <IconInventory />,
  services:  <IconServices />,
  products:  <IconProducts />,
  sales:     <IconReports />,
  activity:  <IconActivity />,
};

export default function StaffProfileScreen() {
  const user       = useAuthStore((s) => s.user);
  const branchName = useAuthStore((s) => s.activeBranchName);
  const signOut    = useAuthStore((s) => s.signOut);

  // Unread count for the Notifications row. Staff have no dashboard, so this
  // list is their only entry point — the count has to live here.
  const unread        = useNotificationFeedStore((st) => st.unread);
  const refreshUnread = useNotificationFeedStore((st) => st.refreshUnread);
  usePoll(refreshUnread, NOTIFICATION_POLL_MS);

  const [showChangePassword, setShowChangePassword] = useState(false);
  // Google-only accounts have no password to change — same gate as (tabs) Account.
  const isPasswordAccount = (auth.currentUser?.providerData ?? []).some(
    (p) => p.providerId === "password"
  );

  const handleSignOut = useCallback(() => {
    showConfirm(
      "Sign Out",
      "Are you sure you want to sign out?",
      () => { void signOut().then(() => router.replace("/login")); },
      { confirmLabel: "Sign Out", destructive: true }
    );
  }, [signOut]);

  // Same gates the sidebar uses, so a row and a nav entry can never disagree
  // about whether someone may open a screen.
  // The WORK list is derived from the one navigation definition every other
  // surface reads, so a row here can never appear for a screen the route
  // itself would refuse. See features/staff/staffNav.
  const perms = useEffectivePermissions();
  const workRows = grantedWorkDestinations(perms).map((key) => ({
    key,
    icon: WORK_ICONS[key],
    label: STAFF_DESTINATIONS[key].label,
    subtitle: STAFF_DESTINATIONS[key].subtitle,
    route: STAFF_DESTINATIONS[key].route,
  }));

  const displayName = user?.displayName ?? "Staff Member";
  const initial     = displayName.charAt(0).toUpperCase();

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <ScrollView style={{ flex: 1, maxWidth: 880, width: "100%", alignSelf: "center" }} contentContainerStyle={s.scroll}>
        {/* Identity */}
        <View style={s.card}>
          <View style={s.avatar}><Text style={s.avatarText}>{initial}</Text></View>
          <Text style={s.name}>{displayName}</Text>
          <Text style={s.email}>{user?.email ?? ""}</Text>
          <View style={s.pills}>
            {/* Always STAFF — there is no other account type that reaches this stack. */}
            <View style={s.pill}><Text style={s.pillText}>STAFF</Text></View>
            {branchName ? <View style={[s.pill, s.pillGray]}><Text style={[s.pillText, s.pillTextGray]}>{branchName}</Text></View> : null}
          </View>
        </View>

        {/* Work — only what this staff member is granted on this branch. */}
        {workRows.length > 0 && (
          <>
            <Text style={s.sectionLabel}>WORK</Text>
            <View style={s.menu}>
              {workRows.map((r, i) => (
                <Row
                  key={r.key}
                  first={i === 0}
                  icon={r.icon}
                  label={r.label}
                  subtitle={r.subtitle}
                  onPress={() => router.push(r.route as never)}
                />
              ))}
            </View>
          </>
        )}

        {/* Account */}
        <Text style={s.sectionLabel}>ACCOUNT</Text>
        <View style={s.menu}>
          <Row
            first
            icon={<IconBell />}
            label="Notifications"
            subtitle={unread > 0 ? `${unread > 99 ? "99+" : unread} unread` : "Order and account updates"}
            onPress={() => router.push("/(staff)/notifications")}
          />
        </View>

        {/* Security */}
        <Text style={s.sectionLabel}>SECURITY</Text>
        <View style={s.menu}>
          <BiometricToggle />
          {isPasswordAccount && (
            <Row
              icon={<IconLock />}
              label="Change Password"
              subtitle="Update the password you use to sign in"
              onPress={() => setShowChangePassword(true)}
            />
          )}
        </View>

        {/* Support */}
        <Text style={s.sectionLabel}>SUPPORT</Text>
        <View style={s.menu}>
          <Row first icon={<IconHelp />} label="Help & Support" subtitle="FAQs and contact support" onPress={() => router.push("/(staff)/help")} />
        </View>

        {/* Legal */}
        <Text style={s.sectionLabel}>LEGAL</Text>
        <View style={s.menu}>
          <Row first icon={<IconShield />} label="Privacy Policy" onPress={() => router.push("/(staff)/legal?kind=privacy")} />
          <Row icon={<IconFileText />} label="Terms of Service" onPress={() => router.push("/(staff)/legal?kind=terms")} />
        </View>

        <TouchableOpacity style={s.signOutBtn} onPress={handleSignOut} activeOpacity={0.8}>
          <Text style={s.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>

      <ChangePasswordModal
        visible={showChangePassword}
        onClose={() => setShowChangePassword(false)}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: C.gray100 },
  scroll:      { padding: SP._20, gap: SP._14 },
  card:        { backgroundColor: C.white, borderRadius: 16, padding: SP._20, alignItems: "center", gap: 4 },
  avatar:      { width: 72, height: 72, borderRadius: 36, backgroundColor: C.brand500, alignItems: "center", justifyContent: "center", marginBottom: SP._8 },
  avatarText:  { fontSize: 28, fontWeight: "800", color: C.white },
  name:        { fontSize: 18, fontWeight: "800", color: C.gray900 },
  email:       { fontSize: 13, color: C.gray500 },
  pills:       { flexDirection: "row", gap: 8, marginTop: SP._8, flexWrap: "wrap", justifyContent: "center" },
  pill:        { backgroundColor: C.brand50, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 },
  pillText:    { fontSize: 11, fontWeight: "700", color: C.brand600 },
  pillGray:    { backgroundColor: C.gray100 },
  pillTextGray:{ color: C.gray600 },

  todoStrip:   { flexDirection: "row", alignItems: "center", gap: SP._12, backgroundColor: C.warning100, borderRadius: RADIUS.md, padding: SP._12, borderWidth: 1, borderColor: C.warning300 },
  todoBadge:   { width: 32, height: 32, borderRadius: 16, backgroundColor: C.warning500, alignItems: "center", justifyContent: "center" },
  todoBadgeText:{ fontSize: 14, fontWeight: "800", color: C.white },
  todoTitle:   { fontSize: 14, fontWeight: "700", color: C.warning700 },
  todoSub:     { fontSize: 12, color: C.warning700, opacity: 0.85, marginTop: 1 },

  sectionLabel:{ fontSize: 11, fontWeight: "700", color: C.gray400, letterSpacing: 0.8, marginLeft: 4, marginTop: SP._4 },
  menu:        { backgroundColor: C.white, borderRadius: 16, overflow: "hidden" },
  menuRow:     { flexDirection: "row", alignItems: "center", paddingHorizontal: SP._16, paddingVertical: SP._14, gap: SP._12 },
  rowBorder:   { borderTopWidth: 1, borderTopColor: C.gray100 },
  rowIcon:     { width: 24, alignItems: "center" },
  menuLabel:   { fontSize: 15, fontWeight: "600", color: C.gray900 },
  menuSub:     { fontSize: 12, color: C.gray500, marginTop: 1 },
  badge:       { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: C.warning500, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  badgeText:   { fontSize: 12, fontWeight: "800", color: C.white },

  signOutBtn:  { backgroundColor: "#FEE2E2", borderRadius: 12, paddingVertical: SP._14, alignItems: "center", marginTop: SP._8 },
  signOutText: { fontSize: 15, fontWeight: "700", color: C.error700 },
});
