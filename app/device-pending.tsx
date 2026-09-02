// app/device-pending.tsx
// Staff device registration + approval-waiting screen.
//
// States (driven by `myDevice`):
//   • no device      → pick a branch and register this device (→ PENDING)
//   • PENDING        → "waiting for owner approval" (polls until APPROVED),
//                      with a "Notify owner again" reminder button
//   • BLOCKED        → "device blocked" (sign out)
//   • APPROVED       → route into the app, locked to the device's branch

import React, { useCallback, useEffect, useState } from "react";
import { errField } from "../src/utils/userError";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path, Circle } from "react-native-svg";
import { router } from "expo-router";
import { C, SP, RADIUS } from "../src/theme/tokens";
import { useAuthStore } from "../src/stores/authStore";
import { getDeviceName, getDeviceModel } from "../src/utils/deviceInfo";
import {
  gqlMyDevice,
  gqlMyBranchOptions,
  gqlRegisterDevice,
  gqlRemindDeviceApproval,
  type RegisteredDevice,
  type BranchOption,
} from "../src/services/graphql/devices";

export default function DevicePendingScreen() {
  const user = useAuthStore((s) => s.user);

  const [device, setDevice] = useState<RegisteredDevice | null | undefined>(undefined); // undefined = loading
  const [options, setOptions] = useState<BranchOption[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remindCooldown, setRemindCooldown] = useState(0);
  const [reminded, setReminded] = useState(false);

  const proceed = useCallback((d: RegisteredDevice) => {
    if (d.branchId) {
      useAuthStore.getState().setActiveBranch(d.branchId);
      useAuthStore.getState().setDeviceBranch(d.branchId);
    }
    // Every staff account goes to (staff). The MANAGER fork this replaces
    // could never fire — memberships are built with role "staff" hardcoded —
    // and (tabs) is the OWNER's workspace regardless.
    router.replace("/(staff)/pos");
  }, []);

  const refreshDevice = useCallback(async () => {
    try {
      const d = await gqlMyDevice();
      setDevice(d);
      if (d?.status === "APPROVED") proceed(d);
    } catch { /* keep state; poll retries */ }
  }, [proceed]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [d, opts] = await Promise.all([gqlMyDevice(), gqlMyBranchOptions()]);
        if (cancelled) return;
        setDevice(d);
        setOptions(opts);
        if (opts.length === 1) setSelectedBranch(opts[0].id);
        if (d?.status === "APPROVED") proceed(d);
      } catch {
        if (!cancelled) setDevice(null);
      }
    })();
    return () => { cancelled = true; };
  }, [proceed]);

  // Poll for approval while pending.
  useEffect(() => {
    if (device?.status !== "PENDING") return;
    const iv = setInterval(() => { void refreshDevice(); }, 5000);
    return () => clearInterval(iv);
  }, [device?.status, refreshDevice]);

  // Reminder-button cooldown ticker.
  useEffect(() => {
    if (remindCooldown <= 0) return;
    const t = setInterval(() => setRemindCooldown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [remindCooldown]);

  const handleRegister = async () => {
    if (!selectedBranch) { setError("Please select a branch first."); return; }
    setBusy(true);
    setError(null);
    try {
      const d = await gqlRegisterDevice(getDeviceName(), Platform.OS, selectedBranch, getDeviceModel());
      setDevice(d);
    } catch (e: unknown) {
      setError(errField(e, "message") ?? "Could not register this device. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleRemind = async () => {
    if (remindCooldown > 0) return;
    setRemindCooldown(10);
    try {
      await gqlRemindDeviceApproval();
      setReminded(true);
      setTimeout(() => setReminded(false), 4000);
    } catch { /* best-effort */ }
  };

  const handleSignOut = () => { void useAuthStore.getState().signOut(); };

  // The branch this pending device is registered to (for the waiting screen).
  const branchName = device?.branchId
    ? (options.find((o) => o.id === device.branchId)?.name ?? null)
    : null;

  if (!user || device === undefined) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 ?? "#f6f8fb", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={C.brand500} size="large" />
      </SafeAreaView>
    );
  }

  // ── Blocked ────────────────────────────────────────────────────────────────
  if (device?.status === "BLOCKED") {
    return (
      <StatusScreen
        accent={C.error500}
        accentBg={C.error100}
        icon={<LockIcon color={C.error700} />}
        title="Device blocked"
        body="This device has been blocked by the store owner. Contact them to regain access."
        primary={{ label: "Sign out", onPress: handleSignOut }}
      />
    );
  }

  // ── Pending ────────────────────────────────────────────────────────────────
  if (device?.status === "PENDING") {
    return (
      <StatusScreen
        accent={C.warning600 ?? C.warning700}
        accentBg={C.warning100}
        icon={<ActivityIndicator color={C.warning600 ?? C.warning700} size="large" />}
        title="Waiting for approval"
        body={`Your device is registered for ${branchName ?? "your branch"} and is waiting for approval. This screen updates automatically once approved.`}
        primary={{
          label: remindCooldown > 0 ? `Notify owner again (${remindCooldown}s)` : "Notify owner again",
          onPress: () => void handleRemind(),
          disabled: remindCooldown > 0,
        }}
        note={reminded ? "Owner notified ✓" : undefined}
        secondary={{ label: "Not you? Sign out", onPress: handleSignOut }}
      />
    );
  }

  // ── Register (no device yet) ────────────────────────────────────────────────
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 ?? "#f6f8fb" }}>
      <View style={{ flex: 1, maxWidth: 520, width: "100%", alignSelf: "center", paddingHorizontal: SP._20 }}>
        {/* Header */}
        <View style={{ alignItems: "center", paddingTop: SP._24, paddingBottom: SP._16 }}>
          <IconCircle bg={C.brand100} accent={C.brand600}>
            <PhoneIcon color={C.brand600} />
          </IconCircle>
          <Text style={{ fontSize: 22, fontWeight: "800", color: C.gray900, marginTop: SP._12 }}>Register this device</Text>
          <Text style={{ fontSize: 14, color: C.gray600, textAlign: "center", lineHeight: 20, marginTop: SP._6 }}>
            Select your branch to register this device. It will need approval before you can start.
          </Text>
        </View>

        {options.length === 0 ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: SP._16 }}>
            <Text style={{ fontSize: 14, color: C.error500, textAlign: "center", lineHeight: 20 }}>
              You aren’t assigned to any branch yet. Ask the owner to add you to a branch, then try again.
            </Text>
          </View>
        ) : (
          <FlatList
            data={options}
            keyExtractor={(b) => b.id}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingVertical: SP._8, gap: SP._10 }}
            showsVerticalScrollIndicator
            renderItem={({ item: b }) => {
              const active = selectedBranch === b.id;
              return (
                <TouchableOpacity
                  onPress={() => { setSelectedBranch(b.id); setError(null); }}
                  activeOpacity={0.85}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: SP._14,
                    paddingHorizontal: SP._16,
                    borderRadius: RADIUS.lg,
                    borderWidth: 1.5,
                    borderColor: active ? C.brand500 : C.gray200,
                    backgroundColor: active ? (C.brand50 ?? C.brand100) : C.white,
                  }}
                >
                  <BranchIcon color={active ? C.brand600 : C.gray400} />
                  <Text style={{ flex: 1, marginLeft: SP._12, fontSize: 15, fontWeight: active ? "700" : "600", color: active ? C.brand700 : C.gray800 ?? C.gray700 }}>
                    {b.name}
                  </Text>
                  {active && <CheckIcon color={C.brand500} />}
                </TouchableOpacity>
              );
            }}
          />
        )}

        {!!error && (
          <Text style={{ color: C.error500, textAlign: "center", marginTop: SP._8 }}>{error}</Text>
        )}

        {/* Footer actions */}
        <View style={{ paddingVertical: SP._16 }}>
          <TouchableOpacity
            onPress={() => void handleRegister()}
            disabled={busy || !selectedBranch || options.length === 0}
            activeOpacity={0.85}
            style={{
              paddingVertical: SP._14,
              borderRadius: RADIUS.lg,
              alignItems: "center",
              backgroundColor: busy || !selectedBranch || options.length === 0 ? C.gray300 : C.brand500,
            }}
          >
            {busy
              ? <ActivityIndicator color="#fff" />
              : <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>Register device</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={handleSignOut} activeOpacity={0.7} style={{ alignItems: "center", paddingVertical: SP._12 }}>
            <Text style={{ color: "#dd1919", fontSize: 14, fontWeight: "600" }}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

// ─── Status screen (pending / blocked) ────────────────────────────────────────
function StatusScreen({
  accent, accentBg, icon, title, body, primary, secondary, note,
}: Readonly<{
  accent: string;
  accentBg: string;
  icon: React.ReactNode;
  title: string;
  body: string;
  primary: { label: string; onPress: () => void; disabled?: boolean };
  secondary?: { label: string; onPress: () => void };
  note?: string;
}>) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 ?? "#f6f8fb" }}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: SP._24, maxWidth: 460, width: "100%", alignSelf: "center" }}>
        <IconCircle bg={accentBg} accent={accent}>{icon}</IconCircle>
        <Text style={{ fontSize: 22, fontWeight: "800", color: C.gray900, textAlign: "center", marginTop: SP._16 }}>{title}</Text>
        <Text style={{ fontSize: 15, color: C.gray600, textAlign: "center", lineHeight: 22, marginTop: SP._8 }}>{body}</Text>

        {!!note && (
          <View style={{ marginTop: SP._12, backgroundColor: C.success100, paddingVertical: SP._6, paddingHorizontal: SP._12, borderRadius: RADIUS.md }}>
            <Text style={{ color: C.success700, fontWeight: "700", fontSize: 13 }}>{note}</Text>
          </View>
        )}

        <TouchableOpacity
          onPress={primary.onPress}
          disabled={primary.disabled}
          activeOpacity={0.85}
          style={{
            marginTop: SP._20, width: "100%", paddingVertical: SP._14, borderRadius: RADIUS.lg, alignItems: "center",
            backgroundColor: primary.disabled ? C.gray300 : accent,
          }}
        >
          <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>{primary.label}</Text>
        </TouchableOpacity>

        {secondary && (() => {
          // Colour only the "Sign out" part red; keep any prefix ("Not you? ") gray.
          const idx = secondary.label.toLowerCase().lastIndexOf("sign out");
          const prefix = idx > 0 ? secondary.label.slice(0, idx) : "";
          const action = idx >= 0 ? secondary.label.slice(idx) : secondary.label;
          return (
            <TouchableOpacity onPress={secondary.onPress} activeOpacity={0.7} style={{ marginTop: SP._12, paddingVertical: SP._8 }}>
              <Text style={{ fontSize: 14, fontWeight: "600" }}>
                {!!prefix && <Text style={{ color: C.gray500 }}>{prefix}</Text>}
                <Text style={{ color: "#dd1919" }}>{action}</Text>
              </Text>
            </TouchableOpacity>
          );
        })()}
      </View>
    </SafeAreaView>
  );
}

function IconCircle({ bg, accent, children }: Readonly<{ bg: string; accent: string; children: React.ReactNode }>) {
  return (
    <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: bg, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: accent + "33" }}>
      {children}
    </View>
  );
}

// ─── Tiny inline SVG icons ────────────────────────────────────────────────────
function PhoneIcon({ color }: Readonly<{ color: string }>) {
  return (
    <Svg width={30} height={30} viewBox="0 0 24 24" fill="none">
      <Path d="M7 2h10a2 2 0 012 2v16a2 2 0 01-2 2H7a2 2 0 01-2-2V4a2 2 0 012-2z" stroke={color} strokeWidth={1.8} />
      <Path d="M10 18h4" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}
function BranchIcon({ color }: Readonly<{ color: string }>) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
function CheckIcon({ color }: Readonly<{ color: string }>) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={10} fill={color} />
      <Path d="M8 12.5l2.5 2.5L16 9.5" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
function LockIcon({ color }: Readonly<{ color: string }>) {
  return (
    <Svg width={30} height={30} viewBox="0 0 24 24" fill="none">
      <Path d="M6 10V8a6 6 0 1112 0v2" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M5 10h14v10H5z" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
    </Svg>
  );
}
