// app/maintenance.tsx
// Full-screen block shown while this app is in maintenance for the signed-in
// role (merchant/staff/washer/courier — see app/_layout.tsx's routing
// effect + src/stores/maintenanceStore.ts). Scheduled still enforces the
// block server-side, so "Got it" below is honestly a "check again now"
// action, not a bypass — only the backend clearing it moves anyone off this
// screen.
//
// Follows device-pending.tsx's StatusScreen/IconCircle template, the
// established shape for a full-screen role gate in this app.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path, Circle } from "react-native-svg";
import { C, SP, RADIUS } from "../src/theme/tokens";
import { useAuthStore } from "../src/stores/authStore";
import { useMaintenanceStore } from "../src/stores/maintenanceStore";
import {
  getMaintenanceStatus,
  getPublicMaintenanceStatus,
} from "../src/services/graphql/maintenance";

const POLL_MS = 15_000;

/** 5425 (seconds) → "1:30:25". */
function hhmmss(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

function AlertIcon({ color }: Readonly<{ color: string }>) {
  return (
    <Svg width={30} height={30} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3l10 18H2L12 3z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Path d="M12 10v4" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Circle cx={12} cy={17} r={1} fill={color} />
    </Svg>
  );
}

function ClockIcon({ color }: Readonly<{ color: string }>) {
  return (
    <Svg width={30} height={30} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={1.8} />
      <Path d="M12 7v5l3.5 2" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

function IconCircle({ bg, accent, children }: Readonly<{ bg: string; accent: string; children: React.ReactNode }>) {
  return (
    <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: bg, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: accent + "33" }}>
      {children}
    </View>
  );
}

export default function MaintenanceScreen() {
  const signOut = useAuthStore((s) => s.signOut);
  const signedIn = useAuthStore((s) => !!s.user);
  const mode = useMaintenanceStore((s) => s.mode);
  const message = useMaintenanceStore((s) => s.message);
  const endsAt = useMaintenanceStore((s) => s.endsAt);
  const supportEmail = useMaintenanceStore((s) => s.supportEmail);
  const supportPhone = useMaintenanceStore((s) => s.supportPhone);
  const setActive = useMaintenanceStore((s) => s.setActive);
  const clear = useMaintenanceStore((s) => s.clear);

  const [checking, setChecking] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const isEmergency = mode === "EMERGENCY";
  const accent = isEmergency ? C.error500 : C.warning600;
  const accentBg = isEmergency ? C.error100 : C.warning100;

  useEffect(() => {
    if (isEmergency || !endsAt) {
      setRemaining(null);
      return;
    }
    const tick = () => setRemaining(Math.round((new Date(endsAt).getTime() - Date.now()) / 1000));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [isEmergency, endsAt]);

  // Once the store clears (checkNow below, or the background poll), _layout.tsx's
  // routing effect (which depends on maintenanceActive) takes over and routes
  // this role to its normal destination — nothing to navigate here directly.
  const checkNow = useCallback(async () => {
    setChecking(true);
    try {
      // Anonymous callers ask the public query — the authenticated one needs a
      // session they do not have, and would fail forever, stranding a
      // signed-out visitor here long after the outage ended.
      const status = signedIn
        ? await getMaintenanceStatus()
        : await getPublicMaintenanceStatus();
      if (!status.blocked) {
        clear();
        return;
      }
      if (status.type) {
        setActive({
          mode: status.type,
          message: status.message,
          endsAt: status.endsAt,
          supportEmail: status.supportEmail,
          supportPhone: status.supportPhone,
        });
      }
    } catch {
      // A failed check just means try again later — staying put is the safe
      // default, never silently unblocking on a network hiccup.
    } finally {
      setChecking(false);
    }
  }, [clear, setActive, signedIn]);

  const checkNowRef = useRef(checkNow);
  checkNowRef.current = checkNow;
  useEffect(() => {
    const t = setInterval(() => void checkNowRef.current(), POLL_MS);
    return () => clearInterval(t);
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 ?? "#f6f8fb" }}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: SP._24, maxWidth: 460, width: "100%", alignSelf: "center" }}>
        <IconCircle bg={accentBg} accent={accent}>
          {isEmergency ? <AlertIcon color={accent} /> : <ClockIcon color={accent} />}
        </IconCircle>

        <Text style={{ fontSize: 22, fontWeight: "800", color: C.gray900, textAlign: "center", marginTop: SP._16 }}>
          {isEmergency ? "Under Maintenance" : "Scheduled Maintenance"}
        </Text>

        <Text style={{ fontSize: 15, color: C.gray600, textAlign: "center", lineHeight: 22, marginTop: SP._8 }}>
          {message ??
            (isEmergency
              ? "Lalaba is temporarily unavailable while we fix a problem. We'll be back as soon as we can."
              : "Lalaba is undergoing scheduled maintenance to improve our service.")}
        </Text>

        {/* What it means for HER, always — the admin's message explains the
            outage, not its effect on her business. A partner's first worry is
            whether she has missed an order, and no maintenance copy written by
            an engineer at 2am is going to answer that. */}
        <Text style={{ fontSize: 14, color: C.gray600, textAlign: "center", lineHeight: 20, marginTop: SP._8 }}>
          You can&apos;t take or update orders right now. Nothing is lost —
          anything waiting will still be here when this clears.
        </Text>

        {!isEmergency && remaining != null && remaining > 0 && (
          <Text style={{ fontSize: 28, fontWeight: "800", color: C.gray900, marginTop: SP._12 }}>
            {hhmmss(remaining)}
          </Text>
        )}

        {/* "Log Out and Wait" used to be the only action in Emergency mode,
            and it was the wrong one twice over. This screen already polls and
            releases her by itself, so signing out is not needed to leave it —
            and signing out costs her an SMS to get back in, on an outage she
            did not cause. Worse, it dropped her on a welcome screen that looks
            perfectly normal, so she would spend that SMS only to be bounced
            straight back here. Retry is the action; signing out is a choice
            she can still make, in the size that choice deserves. */}
        <TouchableOpacity
          onPress={() => void checkNow()}
          disabled={checking}
          activeOpacity={0.85}
          style={{
            marginTop: SP._20,
            width: "100%",
            paddingVertical: SP._14,
            borderRadius: RADIUS.lg,
            alignItems: "center",
            backgroundColor: checking ? C.gray300 : accent,
          }}
        >
          <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>
            {checking ? "Checking…" : "Try again"}
          </Text>
        </TouchableOpacity>

        <Text style={{ fontSize: 13, color: C.gray500, textAlign: "center", marginTop: SP._12 }}>
          Checking again automatically. You don&apos;t have to stay on this screen.
        </Text>

        {/* Real actions, not an address inside a paragraph. Both come from the
            admin panel — nobody has to remember to type "contact us at…" into
            a message written while something is on fire, and a phone number
            here dials instead of being copied out by hand. A partner losing
            trading hours is the person most likely to actually need this. */}
        {(supportEmail || supportPhone) && (
          <View style={{ flexDirection: "row", gap: SP._8, flexWrap: "wrap", justifyContent: "center", marginTop: SP._16 }}>
            {supportEmail && (
              <SupportAction
                label="Email support"
                onPress={() => void Linking.openURL(`mailto:${supportEmail}`)}
              />
            )}
            {supportPhone && (
              <SupportAction
                label="Call support"
                onPress={() =>
                  void Linking.openURL(`tel:${supportPhone.replace(/[^+\d]/g, "")}`)
                }
              />
            )}
          </View>
        )}

        {/* Meaningless with no session — a signed-out visitor reached this
            screen from the cold-start check, not from a rejected request. */}
        {signedIn && (
          <TouchableOpacity onPress={() => void signOut()} activeOpacity={0.7} style={{ marginTop: SP._16, padding: SP._8 }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: C.gray600 }}>Log out</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

/** Outlined, so neither competes with "Try again" — which is still the thing
 *  most likely to get her trading again. */
function SupportAction({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        borderWidth: 1,
        borderColor: C.gray300,
        borderRadius: RADIUS.lg,
        paddingVertical: SP._10,
        paddingHorizontal: SP._16,
      }}
    >
      <Text style={{ fontSize: 14, fontWeight: "600", color: C.gray900 }}>{label}</Text>
    </TouchableOpacity>
  );
}
